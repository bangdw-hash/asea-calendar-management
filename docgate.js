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

  /* ── 서류 카테고리 목록 (GAS Sheets) ────────────────────────── */
  DocGate.loadCategories = async function () {
    if (!GAS_ENDPOINT || GAS_ENDPOINT === 'YOUR_GAS_WEB_APP_URL') return [];
    try {
      var res = await fetch(GAS_ENDPOINT + '?type=categories');
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      return [];
    }
  };

  /* ── 카테고리 추가 (관리자) — GET 방식으로 CORS 우회 ────────── */
  DocGate.addCategory = async function (name) {
    if (!name || !name.trim()) throw new Error('서류명을 입력하세요');
    var res = await fetch(
      GAS_ENDPOINT + '?action=addCategory&name=' + encodeURIComponent(name.trim())
    );
    if (!res.ok) throw new Error('추가 요청 실패');
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || '추가 실패');
  };

  /* ── 카테고리 삭제 (관리자) — GET 방식으로 CORS 우회 ────────── */
  DocGate.removeCategory = async function (id) {
    var res = await fetch(
      GAS_ENDPOINT + '?action=removeCategory&id=' + encodeURIComponent(id)
    );
    if (!res.ok) throw new Error('삭제 요청 실패');
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

  /* ── 신청 처리: 로그 기록 → 파일 Blob 다운로드 URL 발급 ────── */
  DocGate.requestDownload = async function (keyword, categoryLabel, profile, titleVal, reason) {
    var token = Auth.getToken();
    if (!token) throw new Error('인증이 필요합니다');

    var file = await DocGate.findLatestFile(keyword);
    if (!file) throw new Error('"' + categoryLabel + '" 에 해당하는 파일을 찾을 수 없습니다');

    // GAS 로그 기록 (다운로드 전)
    await DocGate._sendLog({
      name:       profile.name,
      email:      profile.email,
      title:      titleVal,
      reason:     reason,
      fileName:   file.name,
      fileId:     file.id,
      ua:         navigator.userAgent,
      downloaded: false
    });

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
