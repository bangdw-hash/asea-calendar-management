'use strict';
(function () {

  // 기존 법인서류 폴더(아세아항공직업전문학교) — G:\내 드라이브\기획처\법인서류\아세아항공직업전문학교
  // 관리자 설정의 「기존 법인서류 가져오기」 기본값으로만 사용
  var LEGACY_FOLDER_ID = '18-X-AR7GqOIaY0hMU222zt4Vs9o-yhjs';

  var GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyNqmJaEvB2Nkxr-wr8HxkwKnbaTewQbEhqpFKTC1u1tmyC3x6qgE10laLUn2hMuFYS/exec';

  var TOKEN_TTL = 60; // 다운로드 유효 시간 (초)
  var DEFAULT_DEPTS = '기획처\n교육처\n학생처\n입학처\n총무처\n산학협력처\n기타';

  var DocGate = {};
  DocGate.LEGACY_FOLDER_ID = LEGACY_FOLDER_ID;
  DocGate.TOKEN_TTL = TOKEN_TTL;

  /* ── 사용자 프로필(Google) ─────────────────────────────────────── */
  DocGate.fetchProfile = async function () {
    var token = Auth.getToken();
    if (!token) throw new Error('인증이 필요합니다');
    var res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('프로필 조회 실패');
    return await res.json(); // { name, email, picture, ... }
  };

  /* ── 서버 호출: 모든 요청은 POST(text/plain) + 토큰은 본문에만 ──── */
  DocGate.api = async function (action, params) {
    var token = Auth.getToken();
    if (!token) { var e0 = new Error('로그인이 필요합니다'); e0.code = 'AUTH'; throw e0; }
    var body = Object.assign({ action: action, token: token }, params || {});
    var res;
    try {
      res = await fetch(GAS_ENDPOINT, { method: 'POST', body: JSON.stringify(body) });
    } catch (e) {
      throw new Error('서버에 연결할 수 없습니다. 네트워크를 확인하세요');
    }
    if (!res.ok) throw new Error('서버 응답 오류 (' + res.status + ')');
    var j;
    try { j = await res.json(); } catch (e) { throw new Error('서버 응답을 읽을 수 없습니다'); }
    if (!j.ok) { var er = new Error(j.error || '요청 실패'); er.code = j.code; throw er; }
    return j.data;
  };

  /* ── 저장된 신상(이 브라우저, 계정별) ──────────────────────────── */
  function _pk(email) { return 'docgate_profile_v2:' + String(email || '').toLowerCase(); }
  DocGate.getSaved = function (email) {
    try { return JSON.parse(localStorage.getItem(_pk(email)) || 'null'); } catch (e) { return null; }
  };
  DocGate.setSaved = function (email, p) {
    try { localStorage.setItem(_pk(email), JSON.stringify(p)); } catch (e) {}
  };
  DocGate.deptList = function (raw) {
    var l = String(raw || DEFAULT_DEPTS).split(/[\n,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    return l.length ? l : DEFAULT_DEPTS.split('\n');
  };

  /* ── 다운로드: 서버가 권한 확인 후 1회용 티켓으로 전달 ─────────── */
  DocGate.issue = function (itemId, profile, reason) {
    return DocGate.api('issue', { itemId: itemId, profile: profile, reason: reason || '', ua: navigator.userAgent });
  };
  DocGate.downloadFile = async function (ticket) {
    var d = await DocGate.api('fetch', { ticket: ticket });
    var bin = atob(d.b64), len = bin.length, bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    var blob = new Blob([bytes], { type: d.mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = d.name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    return d.name;
  };

  /* ── 한글 유사 검색 (초성·부분 일치·오타 허용·별칭) ───────────── */
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function norm(s) { return String(s || '').toLowerCase().replace(/[\s\-_.,()\[\]/·]+/g, ''); }
  function cho(s) {
    return String(s).split('').map(function (c) {
      var n = c.charCodeAt(0) - 0xAC00;
      return n >= 0 && n < 11172 ? CHO[Math.floor(n / 588)] : c;
    }).join('');
  }
  function isCho(s) { return s.length > 0 && s.split('').every(function (c) { return CHO.indexOf(c) >= 0; }); }
  function bigrams(s) { var o = []; for (var i = 0; i < s.length - 1; i++) o.push(s.substr(i, 2)); return o; }

  function scoreText(text, nq, qCho) {
    var nt = norm(text);
    if (!nt) return 0;
    if (nt === nq) return 100;
    if (nt.indexOf(nq) >= 0) return 90 - Math.min(20, (nt.length - nq.length) / 2);
    if (qCho && cho(nt).indexOf(nq) >= 0) return 75;
    if (nq.length >= 2) {
      var qb = bigrams(nq), tb = bigrams(nt), hit = 0;
      qb.forEach(function (b) { if (tb.indexOf(b) >= 0) hit++; });
      var cov = hit / qb.length;
      if (cov >= 0.5) return 35 + cov * 35;
    }
    return 0;
  }
  // items: [{id,name,aliases,...}] → 점수 내림차순 일치 항목
  DocGate.search = function (items, query) {
    var tokens = String(query || '').trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    var out = [];
    items.forEach(function (it) {
      if (it.type !== 'doc') return;
      var fields = [it.name].concat(String(it.aliases || '').split(/[,\n]+/));
      var total = 0, okAll = true;
      tokens.forEach(function (t) {
        var nq = norm(t), qc = isCho(nq), best = 0;
        fields.forEach(function (f) { best = Math.max(best, scoreText(f, nq, qc)); });
        if (!best) okAll = false;
        total += best;
      });
      if (okAll) out.push({ item: it, score: total / tokens.length });
    });
    out.sort(function (a, b) { return b.score - a.score || String(a.item.name).localeCompare(String(b.item.name), 'ko'); });
    return out.map(function (o) { return o.item; });
  };

  /* ── 카운트다운 타이머 ───────────────────────────────────────── */
  DocGate.startTimer = function (seconds, onTick, onExpire) {
    var remaining = seconds;
    onTick(remaining);
    var iv = setInterval(function () {
      remaining--;
      onTick(remaining);
      if (remaining <= 0) { clearInterval(iv); onExpire(); }
    }, 1000);
    return iv;
  };

  /* ── 공통 유틸 ───────────────────────────────────────────────── */
  DocGate.esc = function (s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  DocGate.ICON = {
    folder: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M2 4.5h5l1.6 1.8H16V14H2z"/></svg>',
    file: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M4 2h6l4 4v10H4z"/><path d="M10 2v4h4"/></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="5.5"/><path d="M12.5 12.5L16 16"/></svg>',
    lock: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="2.5" y="6" width="9" height="6" rx="1.5"/><path d="M4.5 6V4.5a2.5 2.5 0 015 0V6"/></svg>',
    chev: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.5L7.5 6 4 9.5"/></svg>',
    check: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>',
    upload: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 11V3m0 0L5 6m3-3l3 3M2.5 13h11"/></svg>',
    download: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8m0 0L5 7m3 3l3-3M2.5 13h11"/></svg>'
  };

  window.DocGate = DocGate;
})();
