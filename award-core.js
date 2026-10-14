'use strict';
/**
 * award-core.js — 상장 메일머지 출력기 공통 (AW)
 *  · 상태/이벤트, 서버 RPC, 아이콘, 모달·토스트, 용지 규격, 페이지 렌더러(편집·미리보기·인쇄 공용)
 *  로드 순서: core → editor → data → output → app
 */
(function () {
  var SUPA_URL = 'https://zbpeyklwpotjyveipzxd.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV5a2x3cG90anl2ZWlwenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTYxMDcsImV4cCI6MjA5NzA5MjEwN30.6JgoQ6rPRnmrbBTG68A-Y9HDQk40mnwubhXVnkZvHrQ';
  var TOKEN_KEY = 'award_token';

  var AW = window.AW = {
    S: {
      token: null,
      tpl: null,          // {id,name,ver,page,elems,fields,rows,bg,bgName}
      sel: [],            // 선택된 요소 id
      row: 0,             // 미리보기 행
      dirty: false, bgDirty: false, saving: false, savedAt: null, saveErr: ''
    },
    PAPERS: {
      A4: [210, 297], A3: [297, 420], B4: [250, 353], B5: [176, 250], Letter: [215.9, 279.4]
    },
    FONTS: [
      ['Noto Sans KR', '노토 산스 (고딕)'], ['Noto Serif KR', '노토 세리프 (명조)'],
      ['Nanum Myeongjo', '나눔명조'], ['Gowun Batang', '고운바탕'], ['Nanum Pen Script', '나눔손글씨 펜'],
      ['KoPubWorld Dotum', 'KoPub 돋움'], ['Malgun Gothic', '맑은 고딕'], ['Batang', '바탕'], ['Times New Roman', 'Times New Roman']
    ]
  };

  /* ───────────── 이벤트 ───────────── */
  var subs = {};
  AW.on = function (ev, fn) { (subs[ev] = subs[ev] || []).push(fn); };
  AW.emit = function (ev, a, b) { (subs[ev] || []).forEach(function (fn) { try { fn(a, b); } catch (e) { setTimeout(function () { throw e; }); } }); };

  /* ───────────── 유틸 ───────────── */
  AW.esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  AW.uid = function (p) { return (p || 'e') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  AW.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  AW.round = function (n, d) { var k = Math.pow(10, d == null ? 1 : d); return Math.round(n * k) / k; };
  AW.$ = function (sel, root) { return (root || document).querySelector(sel); };
  AW.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  AW.debounce = function (fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; };
  AW.fmtTime = function (d) { d = d ? new Date(d) : new Date(); function p(n) { return n < 10 ? '0' + n : n; } return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
  AW.fmtDate = function (d) { d = d || new Date(); return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; };
  AW.lsGet = function (k, def) { try { var v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } };
  AW.lsSet = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  /* ───────────── 아이콘 (인라인 SVG 전용) ───────────── */
  var IC = {
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>', field: '<path d="M8 4H5v16h3M16 4h3v16h-3M9 9h6M9 12h6M9 15h4"/>',
    line: '<path d="M4 12h16"/>', rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>', image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
    bold: '<path d="M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z"/>', italic: '<path d="M10 5h8M6 19h8M14 5l-4 14"/>', underline: '<path d="M7 5v7a5 5 0 0010 0V5M5 20h14"/>',
    alL: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>', alC: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>', alR: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
    vT: '<path d="M4 4h16M12 8v12M9 11l3-3 3 3"/>', vM: '<path d="M4 12h16M12 4v5M12 15v5M9 6l3 3 3-3M9 18l3-3 3 3"/>', vB: '<path d="M4 20h16M12 4v12M9 13l3 3 3-3"/>',
    gL: '<path d="M4 3v18M8 7h12M8 14h8"/>', gCH: '<path d="M12 3v18M5 7h14M7 14h10"/>', gR: '<path d="M20 3v18M4 7h12M8 14h8"/>',
    gT: '<path d="M3 4h18M7 8v12M14 8v8"/>', gCV: '<path d="M3 12h18M7 5h0M7 5v14M14 7v10"/>', gB: '<path d="M3 20h18M7 4v12M14 8v8"/>',
    dH: '<path d="M4 4v16M20 4v16M10 8h4v8h-4z"/>', dV: '<path d="M4 4h16M4 20h16M8 10h8v4H8z"/>',
    front: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V4h12"/>', back: '<rect x="4" y="4" width="12" height="12" rx="1"/><path d="M8 20h12V8"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 018 0v3"/>', unlock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 017.5-2"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>', undo: '<path d="M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3"/>', redo: '<path d="M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>',
    zoomIn: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M11 8v6M8 11h6"/>', zoomOut: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M8 11h6"/>', fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    grid: '<path d="M4 4h16v16H4zM4 12h16M12 4v16"/>', page: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>', download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>', xls: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 8l4 5M12 8l-4 5M8 17h8"/>',
    print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>', history: '<path d="M4 12a8 8 0 108-8 8 8 0 00-6 2.7M4 4v4h4M12 8v4l3 2"/>',
    folder: '<path d="M3 6h6l2 2h10v11H3z"/>', save: '<path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    chevL: '<path d="M15 5l-7 7 7 7"/>', chevR: '<path d="M9 5l7 7-7 7"/>', chevD: '<path d="M5 9l7 7 7-7"/>', chevU: '<path d="M5 15l7-7 7 7"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>', check: '<path d="M5 12l5 5 9-10"/>', warn: '<path d="M12 4l9 16H3zM12 10v4M12 17h0"/>',
    cloud: '<path d="M7 18a4 4 0 010-8 5 5 0 019.6-1A4.5 4.5 0 0117 18z"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h0"/>',
    rotate: '<path d="M20 12a8 8 0 11-3-6.2M20 4v4h-4"/>', cut: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5L20 18M8 15.5L20 6"/>', paste: '<rect x="6" y="5" width="12" height="16" rx="1.5"/><path d="M9 5V3h6v2"/>', sel: '<path d="M4 4h4M16 4h4M4 20h4M16 20h4M4 8v8M20 8v8"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    cols: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16M15 4v16"/>', layers: '<path d="M12 4l9 5-9 5-9-5zM3 14l9 5 9-5"/>',
    wand: '<path d="M5 19L17 7M14 4l2-1 1 2M19 9l2 1-1 2M8 4h0M20 16h0"/>', tpl: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 8h8M8 12h8M8 16h5"/>'
  };
  AW.ic = function (n, s) {
    s = s || 18;
    return '<svg class="ico" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>';
  };

  /* ───────────── 토스트 · 모달 ───────────── */
  AW.toast = function (msg, type) {
    var t = AW.$('#aw-toast');
    if (!t) { t = document.createElement('div'); t.id = 'aw-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show' + (type === 'error' ? ' err' : type === 'ok' ? ' ok' : '');
    clearTimeout(t._t); t._t = setTimeout(function () { t.className = ''; }, type === 'error' ? 5000 : 2600);
  };
  // opts: {title, body(html), wide, actions:[{label,cls,onClick(close)}], onOpen(el, close)}
  AW.modal = function (opts) {
    var ov = document.createElement('div'); ov.className = 'aw-ov';
    ov.innerHTML = '<div class="aw-md' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + AW.esc(opts.title || '') + '">' +
      '<div class="md-h"><h3>' + AW.esc(opts.title || '') + '</h3><button class="icon-btn md-x" aria-label="닫기">' + AW.ic('close') + '</button></div>' +
      '<div class="md-b">' + (opts.body || '') + '</div>' +
      (opts.actions && opts.actions.length ? '<div class="md-f"></div>' : '') + '</div>';
    document.body.appendChild(ov);
    var prevFocus = document.activeElement;
    function close() { document.removeEventListener('keydown', onKey, true); ov.remove(); try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch (e) {} if (opts.onClose) opts.onClose(); }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    document.addEventListener('keydown', onKey, true);
    AW.$('.md-x', ov).onclick = close;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov && !opts.sticky) close(); });
    var f = AW.$('.md-f', ov);
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement('button'); b.className = 'btn ' + (a.cls || 'btn-secondary'); b.innerHTML = a.label;
      b.onclick = function () { a.onClick ? a.onClick(close, b) : close(); }; f.appendChild(b);
    });
    if (opts.onOpen) opts.onOpen(AW.$('.aw-md', ov), close);
    var first = AW.$('input,select,textarea,button.btn-primary', AW.$('.md-b', ov)); if (first) setTimeout(function () { try { first.focus(); } catch (e) {} }, 30);
    return { close: close, el: AW.$('.aw-md', ov) };
  };
  AW.confirm = function (title, msg, okLabel, danger) {
    return new Promise(function (res) {
      var done = false;
      AW.modal({ title: title, body: '<p style="margin:0;white-space:pre-line">' + AW.esc(msg) + '</p>', onClose: function () { if (!done) res(false); },
        actions: [{ label: '취소', cls: 'btn-ghost' }, { label: okLabel || '확인', cls: danger ? 'btn-danger' : 'btn-primary', onClick: function (c) { done = true; c(); res(true); } }] });
    });
  };

  /* ───────────── 서버 RPC ───────────── */
  var ERR = {
    AUTH_REQUIRED: '로그인이 만료되었습니다. 다시 로그인해 주십시오.', NOT_FOUND: '대상을 찾을 수 없습니다.',
    BAD_PASSWORD: '비밀번호가 올바르지 않습니다.', LOCKED_OUT: '로그인 시도 횟수를 초과했습니다. 잠시 후 다시 시도해 주십시오.',
    ADMIN_NOT_SET: '관리자 비밀번호가 아직 등록되지 않았습니다. db/README_award.md 3단계를 실행해 주십시오.'
  };
  AW.rpc = function (fn, args) {
    return fetch(SUPA_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST', headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        if (!r.ok) {
          var code = (j && j.message) || 'UNKNOWN';
          var hint = r.status === 404 ? '서버 함수가 없습니다. db/award_schema.sql 을 먼저 실행해 주십시오.' : '';
          var err = new Error(ERR[code] || hint || ('서버 오류: ' + code)); err.code = code;
          if (code === 'AUTH_REQUIRED') { AW.S.token = null; try { sessionStorage.removeItem(TOKEN_KEY); } catch (e2) {} AW.emit('authlost'); }
          throw err;
        }
        return j;
      });
    }, function () { var e = new Error('네트워크 연결을 확인해 주십시오.'); e.code = 'NETWORK'; throw e; });
  };
  AW.call = function (fn, args) { args = args || {}; args.p_token = AW.S.token; return AW.rpc(fn, args); };
  AW.setToken = function (t) { AW.S.token = t; try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} };
  AW.loadToken = function () { try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; } };
  AW.log = function (action, target, detail) { if (AW.S.token) AW.call('award_log_add', { p_action: action, p_target: target || '', p_detail: detail || null }).catch(function () {}); };

  /* ───────────── 양식 모델 ───────────── */
  AW.newTpl = function (name) {
    return { id: null, name: name || '새 상장 양식', ver: 0, page: { w: 297, h: 210, paper: 'A4', orient: 'L' }, elems: [], fields: [], rows: [], bg: null, bgName: '' };
  };
  AW.fromServer = function (r) {
    return { id: r.id, name: r.name, ver: r.ver, page: r.page && r.page.w ? r.page : AW.newTpl().page, elems: r.elems || [], fields: r.fields || [], rows: r.rows || [], bg: r.bg || null, bgName: r.bg_name || '' };
  };
  AW.elem = function (type, o) {
    var base = { id: AW.uid(), t: type, x: 20, y: 20, w: 60, h: 12, lock: false };
    if (type === 'text') Object.assign(base, { text: '텍스트', font: 'Noto Serif KR', size: 20, color: '#111111', bold: false, italic: false, ul: false, align: 'center', valign: 'middle', lh: 1.4, ls: 0, fit: false });
    if (type === 'rect') Object.assign(base, { fill: '', stroke: '#111111', sw: 0.5, w: 60, h: 30 });
    if (type === 'line') Object.assign(base, { stroke: '#111111', sw: 0.5, h: 0, w: 80 });
    if (type === 'img') Object.assign(base, { src: '', opacity: 1, w: 25, h: 25 });
    return Object.assign(base, o || {});
  };
  AW.get = function (id) { var t = AW.S.tpl; if (!t) return null; for (var i = 0; i < t.elems.length; i++) if (t.elems[i].id === id) return t.elems[i]; return null; };

  /* ───────────── 입력 항목 {{이름}} ───────────── */
  var TK = /\{\{\s*([^{}]+?)\s*\}\}/g;
  AW.BUILTIN = { '@번호': '일련번호(1,2,3…)', '@오늘': '출력일(예: 2026년 10월 14일)' };
  AW.tokensOf = function (text) {
    var out = [], m; TK.lastIndex = 0;
    while ((m = TK.exec(text || ''))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
    return out;
  };
  // 입력 항목 목록: 위→아래, 좌→우 순으로 첫 등장 순서. 내장 항목(@…)은 제외
  AW.fieldNames = function (tpl) {
    tpl = tpl || AW.S.tpl;
    var seen = [], list = tpl.elems.filter(function (e) { return e.t === 'text'; }).slice().sort(function (a, b) { return (Math.round(a.y / 4) - Math.round(b.y / 4)) || (a.x - b.x); });
    list.forEach(function (e) { AW.tokensOf(e.text).forEach(function (n) { if (n.charAt(0) !== '@' && seen.indexOf(n) < 0) seen.push(n); }); });
    return seen;
  };
  // 양식 내 위치 설명 (예: "상단 중앙 · 제 {{번호}} 호")
  AW.whereIs = function (name, tpl) {
    tpl = tpl || AW.S.tpl;
    var hit = null;
    tpl.elems.forEach(function (e) { if (e.t === 'text' && AW.tokensOf(e.text).indexOf(name) >= 0 && (!hit || e.y < hit.y)) hit = e; });
    if (!hit) return '';
    var cx = (hit.x + hit.w / 2) / tpl.page.w, cy = (hit.y + hit.h / 2) / tpl.page.h;
    var v = cy < 0.33 ? '상단' : cy < 0.66 ? '중단' : '하단', h = cx < 0.36 ? '좌측' : cx < 0.64 ? '중앙' : '우측';
    var ctx = String(hit.text).replace(/\s+/g, ' ').trim(); if (ctx.length > 24) ctx = ctx.slice(0, 24) + '…';
    return v + ' ' + h + ' · ' + ctx;
  };
  var GUESS = [
    [/번호|no\.?$/i, '상장 번호(숫자 또는 제2026-001호 형식)', '2026-001'], [/성명|이름|수상자|수료자/, '수상자 성명(한글 기준)', '홍길동'],
    [/소속|학과|과정|반/, '소속 학과 또는 과정명', '항공정비과'], [/학번|사번/, '학번 또는 식별번호', '20260001'],
    [/상명|상\s*종류|표창|종류/, '상의 종류(예: 우수상, 개근상)', '성적우수상'], [/내용|본문|공적|사유/, '상장 본문 문구(2~3줄 권장)', '위 학생은 학업에 정진하여 그 성적이 우수하므로 이 상장을 수여합니다.'],
    [/일자|날짜|수여일|발급일/, '수여일(예: 2026년 2월 20일)', '2026년 2월 20일'], [/직위|직책|수여자|대표|학교장|원장/, '수여자 직위·성명', '학교장 홍길동'],
    [/기간|학기/, '해당 기간 또는 학기', '2026학년도 1학기'], [/구분|등급|순위/, '등급 또는 순위', '1등']
  ];
  AW.guessHint = function (name) {
    for (var i = 0; i < GUESS.length; i++) if (GUESS[i][0].test(name)) return { hint: GUESS[i][1], example: GUESS[i][2] };
    return { hint: name + ' 내용을 입력합니다.', example: '' };
  };
  // fields 메타 동기화: 양식에서 사라진 항목은 보관(데이터 유지)하지 않고 제거, 새 항목은 추천 안내 부여
  AW.syncFields = function () {
    var t = AW.S.tpl, names = AW.fieldNames(t), old = {}, changed = false;
    t.fields.forEach(function (f) { old[f.name] = f; });
    var next = names.map(function (n) {
      if (old[n]) return old[n];
      var g = AW.guessHint(n); changed = true;
      return { name: n, hint: g.hint, example: g.example, max: 0, req: true };
    });
    if (changed || next.length !== t.fields.length || next.some(function (f, i) { return t.fields[i] !== f; })) { t.fields = next; return true; }
    return false;
  };
  AW.val = function (row, name, idx) {
    if (name === '@번호') return String(idx + 1);
    if (name === '@오늘') return AW.fmtDate();
    var v = row ? row[name] : ''; return v == null ? '' : String(v);
  };

  /* ───────────── 페이지 렌더러 ─────────────
   * AW.renderPage(tpl, {scale, row, idx, mode:'edit'|'view'|'print', bg:true, dx, dy}) → HTMLElement
   *  scale = 1mm 당 px. 글꼴 크기(pt) → mm → px 변환. 인쇄는 scale = 96/25.4.
   */
  var PT = 25.4 / 72;
  AW.renderPage = function (tpl, o) {
    o = o || {};
    var k = o.scale || 3.78, pg = tpl.page, mode = o.mode || 'view';
    var el = document.createElement('div');
    el.className = 'pg pg-' + mode;
    el.style.cssText = 'position:relative;overflow:hidden;background:#fff;width:' + (pg.w * k) + 'px;height:' + (pg.h * k) + 'px;flex:none';
    if (tpl.bg && o.bg !== false && !(pg && pg.bgHide)) {
      var im = document.createElement('img'); im.className = 'pg-bg'; im.src = tpl.bg; im.alt = ''; im.draggable = false;
      im.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;user-select:none';
      el.appendChild(im);
    }
    var dx = o.dx || 0, dy = o.dy || 0;
    tpl.elems.forEach(function (e) { el.appendChild(AW.renderElem(e, k, o, dx, dy)); });
    return el;
  };
  AW.renderElem = function (e, k, o, dx, dy) {
    var mode = o.mode || 'view', d = document.createElement('div');
    d.className = 'el el-' + e.t; d.dataset.id = e.id;
    var base = 'position:absolute;left:' + ((e.x + (mode === 'print' ? dx : 0)) * k) + 'px;top:' + ((e.y + (mode === 'print' ? dy : 0)) * k) + 'px;width:' + (e.w * k) + 'px;height:' + (Math.max(e.h, e.t === 'line' ? 0 : 1) * k) + 'px;';
    if (e.t === 'text') {
      var txt = e.text || '', inner;
      if (mode === 'edit') {
        inner = AW.esc(txt).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, '<span class="tk">{{$1}}</span>');
      } else {
        inner = AW.esc(txt).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function (m, n) {
          n = n.replace(/&amp;/g, '&'); var v = AW.val(o.row, n, o.idx || 0);
          if (!v && mode === 'view' && n.charAt(0) !== '@') return '<span class="miss">' + AW.esc('{' + n + '}') + '</span>';
          return AW.esc(v);
        });
      }
      var fs = (e.size || 16) * PT * k;
      d.style.cssText = base + 'display:flex;flex-direction:column;justify-content:' + (e.valign === 'top' ? 'flex-start' : e.valign === 'bottom' ? 'flex-end' : 'center') +
        ';font-family:\'' + (e.font || 'Noto Sans KR') + '\',\'Noto Sans KR\',sans-serif;font-size:' + fs + 'px;line-height:' + (e.lh || 1.4) + ';color:' + (e.color || '#111') +
        ';font-weight:' + (e.bold ? 700 : 400) + ';font-style:' + (e.italic ? 'italic' : 'normal') + ';text-decoration:' + (e.ul ? 'underline' : 'none') +
        ';text-align:' + (e.align || 'center') + ';letter-spacing:' + ((e.ls || 0) * PT * k) + 'px;white-space:' + (e.fit ? 'pre' : 'pre-wrap') + ';word-break:keep-all;overflow-wrap:anywhere;';
      var b = document.createElement('div'); b.className = 'el-t'; b.innerHTML = inner || (mode === 'edit' ? '' : '&nbsp;');
      b.style.cssText = 'width:100%;' + (e.fit ? 'overflow:visible;' : '');
      d.appendChild(b);
      if (e.fit) d.dataset.fit = '1';
    } else if (e.t === 'rect') {
      d.style.cssText = base + 'box-sizing:border-box;border:' + ((e.sw || 0) * k) + 'px solid ' + (e.stroke || 'transparent') + ';background:' + (e.fill || 'transparent') + ';';
    } else if (e.t === 'line') {
      d.style.cssText = base + 'height:0;border-top:' + ((e.sw || 0.5) * k) + 'px solid ' + (e.stroke || '#111') + ';';
    } else if (e.t === 'img') {
      d.style.cssText = base + 'opacity:' + (e.opacity == null ? 1 : e.opacity) + ';';
      if (e.src) { var im = document.createElement('img'); im.src = e.src; im.alt = ''; im.draggable = false; im.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none'; d.appendChild(im); }
    }
    if (e.hide) d.style.display = 'none';
    return d;
  };
  // 글자 자동 맞춤(shrink): 한 줄 안에 들어가도록 폰트를 줄임. DOM 부착 후 호출.
  AW.fitAll = function (root) {
    AW.$$('.el[data-fit="1"]', root).forEach(function (d) {
      var b = d.firstChild; if (!b) return;
      var fs = parseFloat(d.style.fontSize), min = fs * 0.35, n = 0, wrapW = d.clientWidth, wrapH = d.clientHeight;
      b.style.width = 'max-content';
      while ((b.offsetWidth > wrapW + 0.5 || b.offsetHeight > wrapH + 0.5) && fs > min && n++ < 80) { fs *= 0.96; d.style.fontSize = fs + 'px'; }
      b.style.width = '100%';
    });
  };
})();
