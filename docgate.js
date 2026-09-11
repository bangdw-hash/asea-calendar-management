'use strict';
(function () {

  // 법인서류 폴더(아세아항공직업전문학교) — G:\내 드라이브\기획처\법인서류\아세아항공직업전문학교
  // 상위 법인서류 폴더: 1GQGlPbIMoubRu2Au1YdbiN8c-aMu0Ndq
  var FOLDER_ID    = '18-X-AR7GqOIaY0hMU222zt4Vs9o-yhjs';

  var GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyNqmJaEvB2Nkxr-wr8HxkwKnbaTewQbEhqpFKTC1u1tmyC3x6qgE10laLUn2hMuFYS/exec';

  var TOKEN_TTL    = 60; // 다운로드 유효 시간 (초)

  var DocGate = {};

  /* ── 사용자 프로필 조회 ───────────────────────────────────────── */
  DocGate.fetchProfile = async function () {
    var token = Auth.getToken();
    if (!token) throw new Error('인증이 필요합니다');
    var res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('프로필 조회 실패');
    return await res.json(); // { name, email, picture, ... }
  };

  var _CAT_CACHE_KEY = 'docgate_cats_v1';
  var _CAT_CACHE_TTL = 120 * 1000; // 2분

  function _cacheGet() {
    try {
      var raw = localStorage.getItem(_CAT_CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (Date.now() - obj.ts > _CAT_CACHE_TTL) return null;
      return obj.data;
    } catch (e) { return null; }
  }

  function _cacheSet(data) {
    try {
      localStorage.setItem(_CAT_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data }));
    } catch (e) {}
  }

  function _cacheClear() {
    try { localStorage.removeItem(_CAT_CACHE_KEY); } catch (e) {}
  }

  /* GAS에서 카테고리 fetch → 캐시 저장 → 반환 */
  async function _fetchCategories() {
    if (!GAS_ENDPOINT || GAS_ENDPOINT === 'YOUR_GAS_WEB_APP_URL') return [];
    try {
      var res = await fetch(GAS_ENDPOINT + '?type=categories&_=' + Date.now());
      if (!res.ok) return null;
      var data = await res.json();
      if (Array.isArray(data)) { _cacheSet(data); return data; }
      return null;
    } catch (e) { return null; }
  }

  /* ── 서류 카테고리 목록 ─────────────────────────────────────── */
  /* opts.background=true 면 캐시된 데이터 즉시 반환 후 백그라운드 갱신 */
  DocGate.loadCategories = async function (opts) {
    var cached = _cacheGet();
    if (cached && opts && opts.background) {
      // 캐시 즉시 반환, 백그라운드에서 GAS 갱신
      _fetchCategories().then(function (fresh) {
        if (fresh && opts.onRefresh) opts.onRefresh(fresh);
      });
      return cached;
    }
    // 캐시 있으면 즉시 반환하고 백그라운드 갱신도 시작
    if (cached) {
      _fetchCategories(); // 백그라운드 갱신 (UI는 캐시 사용)
      return cached;
    }
    // 캐시 없음 → GAS 직접 대기
    var data = await _fetchCategories();
    return data || [];
  };

  DocGate._cacheClear = _cacheClear;

  /* ── 카테고리 추가 (관리자) — GET 방식으로 CORS 우회 ────────── */
  DocGate.addCategory = async function (name) {
    if (!name || !name.trim()) throw new Error('서류명을 입력하세요');
    _cacheClear(); // 추가 전 캐시 무효화
    var res = await fetch(
      GAS_ENDPOINT + '?action=addCategory&name=' + encodeURIComponent(name.trim())
    );
    if (!res.ok) throw new Error('추가 요청 실패');
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || '추가 실패');
    _cacheClear(); // 추가 성공 후 캐시 무효화
  };

  /* ── 카테고리 삭제 (관리자) — GET 방식으로 CORS 우회 ────────── */
  DocGate.removeCategory = async function (id) {
    _cacheClear();
    var res = await fetch(
      GAS_ENDPOINT + '?action=removeCategory&id=' + encodeURIComponent(id)
    );
    if (!res.ok) throw new Error('삭제 요청 실패');
    _cacheClear();
  };

  /* ── 카테고리 순서 이동 (관리자) dir: -1=위, 1=아래 ─────────── */
  DocGate.moveCategory = async function (id, dir) {
    _cacheClear();
    var res = await fetch(
      GAS_ENDPOINT + '?action=moveCategory&id=' + encodeURIComponent(id) +
      '&dir=' + (dir < 0 ? 'up' : 'down')
    );
    if (!res.ok) throw new Error('순서 변경 실패');
    _cacheClear();
  };

  /* ── Drive 폴더에서 키워드 일치 최신 파일 찾기 ───────────────── */
  DocGate.findLatestFile = async function (keyword) {
    var token = Auth.getToken();
    if (!token) throw new Error('인증이 필요합니다');

    // name contains 'keyword' AND parentId in folder
    var q = "'" + FOLDER_ID + "' in parents and name contains '" +
            keyword.replace(/'/g, "\\'") + "' and mimeType != 'application/vnd.google-apps.folder'";

    var res = await fetch(
      'https://www.googleapis.com/drive/v3/files' +
      '?q=' + encodeURIComponent(q) +
      '&fields=files(id,name,modifiedTime,size)' +
      '&orderBy=modifiedTime+desc' +
      '&pageSize=10',
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (!res.ok) throw new Error('파일 검색 실패 (' + res.status + ')');
    var data = await res.json();
    var files = data.files || [];
    if (files.length === 0) return null;
    return files[0]; // modifiedTime desc 첫 번째 = 가장 최신
  };

  /* ── 신청 처리: 파일 검색 → fileId/fileName 반환 (로그는 실제 다운로드 시만 기록) */
  DocGate.requestDownload = async function (keyword, categoryLabel, profile, titleVal, reason) {
    var token = Auth.getToken();
    if (!token) throw new Error('인증이 필요합니다');

    var file = await DocGate.findLatestFile(keyword);
    if (!file) throw new Error('"' + categoryLabel + '" 에 해당하는 파일을 찾을 수 없습니다');

    return { fileId: file.id, fileName: file.name };
  };

  /* ── 실제 파일 Blob 다운로드 ────────────────────────────────── */
  DocGate.downloadFile = async function (fileId, fileName) {
    var token = Auth.getToken();
    if (!token) throw new Error('인증이 필요합니다');

    // OAuth 토큰으로 비공개 파일 다운로드
    var res = await fetch(
      'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media',
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (!res.ok) throw new Error('파일 다운로드 실패 (' + res.status + ')');

    var blob = await res.blob();
    var url  = URL.createObjectURL(blob);

    var a       = document.createElement('a');
    a.href      = url;
    a.download  = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);

    return true;
  };

  /* ── GAS 로그 전송 ───────────────────────────────────────────── */
  DocGate._sendLog = async function (payload) {
    if (!GAS_ENDPOINT || GAS_ENDPOINT === 'YOUR_GAS_WEB_APP_URL') return;
    try {
      await fetch(GAS_ENDPOINT, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      });
    } catch (e) {}
  };

  /* ── 다운로드 완료 로그 업데이트 ─────────────────────────────── */
  DocGate.logDownloaded = async function (fileId, fileName, profile, titleVal, reason) {
    await DocGate._sendLog({
      name:       profile.name,
      email:      profile.email,
      title:      titleVal,
      reason:     reason,
      fileName:   fileName,
      fileId:     fileId,
      ua:         navigator.userAgent,
      downloaded: true
    });
  };

  /* ── 관리자: 다운로드 로그 조회 ──────────────────────────────── */
  DocGate.loadLogs = async function () {
    if (!GAS_ENDPOINT || GAS_ENDPOINT === 'YOUR_GAS_WEB_APP_URL') return [];
    try {
      var res = await fetch(GAS_ENDPOINT + '?type=logs');
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      return [];
    }
  };

  /* ── 카운트다운 타이머 ───────────────────────────────────────── */
  DocGate.startTimer = function (seconds, onTick, onExpire) {
    var remaining = seconds;
    onTick(remaining);
    var iv = setInterval(function () {
      remaining--;
      onTick(remaining);
      if (remaining <= 0) {
        clearInterval(iv);
        onExpire();
      }
    }, 1000);
    return iv;
  };

  DocGate.TOKEN_TTL = TOKEN_TTL;

  window.DocGate = DocGate;
})();
