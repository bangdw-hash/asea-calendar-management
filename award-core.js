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
    FONTS: []
  };


  /* ───────────── 글꼴 (상장·공문서용 분류) ─────────────
   * [id, 표시 이름, 분류, 대체 글꼴 목록, PC 글꼴 여부]  — PC 글꼴은 인쇄하는 컴퓨터에 설치된 것만 사용됨 */
  var FT = [
    ['Gungsuh', '궁서체', '상장 추천', "'Gungsuh','궁서','GungSeo','Nanum Myeongjo',serif", 1],
    ['Batang', '바탕체', '상장 추천', "'Batang','바탕','AppleMyungjo','Nanum Myeongjo',serif", 1],
    ['Nanum Myeongjo', '나눔명조', '상장 추천', "'Nanum Myeongjo','Batang',serif"],
    ['Noto Serif KR', '노토 세리프 (명조)', '상장 추천', "'Noto Serif KR','Nanum Myeongjo',serif"],
    ['Hahmlet', '함렛 (현대 명조)', '상장 추천', "'Hahmlet','Noto Serif KR',serif"],
    ['Gowun Batang', '고운바탕', '상장 추천', "'Gowun Batang','Nanum Myeongjo',serif"],
    ['Song Myung', '송명 (붓 느낌 명조)', '붓글씨 · 서예', "'Song Myung','Nanum Myeongjo',serif"],
    ['Nanum Brush Script', '나눔 붓글씨', '붓글씨 · 서예', "'Nanum Brush Script','Song Myung',cursive"],
    ['Nanum Pen Script', '나눔손글씨 펜', '붓글씨 · 서예', "'Nanum Pen Script',cursive"],
    ['Black Han Sans', '블랙한산스 (굵은 제목)', '제목 · 고딕', "'Black Han Sans','Noto Sans KR',sans-serif"],
    ['Noto Sans KR', '노토 산스 (고딕)', '제목 · 고딕', "'Noto Sans KR','Malgun Gothic',sans-serif"],
    ['Gowun Dodum', '고운돋움', '제목 · 고딕', "'Gowun Dodum','Noto Sans KR',sans-serif"],
    ['Nanum Gothic', '나눔고딕', '제목 · 고딕', "'Nanum Gothic','Noto Sans KR',sans-serif"],
    ['KoPubWorld Dotum', 'KoPub 돋움', '제목 · 고딕', "'KoPubWorld Dotum','Noto Sans KR',sans-serif"],
    ['Malgun Gothic', '맑은 고딕', 'PC 글꼴', "'Malgun Gothic','맑은 고딕','Noto Sans KR',sans-serif", 1],
    ['Dotum', '돋움체', 'PC 글꼴', "'Dotum','돋움','Noto Sans KR',sans-serif", 1],
    ['Gulim', '굴림체', 'PC 글꼴', "'Gulim','굴림','Noto Sans KR',sans-serif", 1],
    ['Playfair Display', 'Playfair Display (영문 격식)', '영문', "'Playfair Display','Times New Roman',serif"],
    ['Cormorant Garamond', 'Cormorant Garamond (영문 고전)', '영문', "'Cormorant Garamond','Times New Roman',serif"],
    ['Great Vibes', 'Great Vibes (영문 필기체)', '영문', "'Great Vibes',cursive"],
    ['Times New Roman', 'Times New Roman', '영문', "'Times New Roman','Times',serif", 1]
  ];
  AW.FONTS = FT.map(function (f) { return { id: f[0], label: f[1], grp: f[2], stack: f[3], sys: !!f[4] }; });
  AW.fontStack = function (id) { for (var i = 0; i < FT.length; i++) if (FT[i][0] === id) return FT[i][3]; return "'" + (id || 'Noto Sans KR') + "','Noto Sans KR',sans-serif"; };
  // 내 글꼴(서버 저장): 목록은 로그인 후 불러오고, 양식에서 쓰는 글꼴만 내려받아 FontFace 로 등록(기기 IndexedDB 에 캐시)
  var CF = { list: [], loaded: {}, busy: {} };
  AW.customFonts = CF;
  function idb(mode, fn) { return new Promise(function (res) { try { var r = indexedDB.open('award_fonts', 1); r.onupgradeneeded = function () { r.result.createObjectStore('f'); }; r.onerror = function () { res(null); }; r.onsuccess = function () { try { var tx = r.result.transaction('f', mode), out = fn(tx.objectStore('f')); tx.oncomplete = function () { res(out && out.result !== undefined ? out.result : null); }; tx.onerror = function () { res(null); }; } catch (e) { res(null); } }; } catch (e) { res(null); } }); }
  function syncFontTable() {
    for (var i = AW.FONTS.length - 1; i >= 0; i--) if (AW.FONTS[i].grp === '내 글꼴') AW.FONTS.splice(i, 1);
    CF.list.forEach(function (f) { AW.FONTS.push({ id: f.family, label: f.label, grp: '내 글꼴', stack: "'" + f.family + "','Noto Serif KR',serif", sys: false, custom: f }); });
  }
  AW.loadFontList = function () { return AW.call('award_font_list').then(function (l) { CF.list = l || []; syncFontTable(); AW.emit('fontlist'); return CF.list; }).catch(function () { return []; }); };
  function b64ToBuf(b) { var s = atob(b), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
  AW.ensureFont = function (family) {
    var f = CF.list.filter(function (x) { return x.family === family; })[0]; if (!f || CF.loaded[family]) return Promise.resolve(false);
    if (CF.busy[family]) return CF.busy[family];
    return (CF.busy[family] = idb('readonly', function (s) { return s.get(f.id); }).then(function (buf) {
      return buf ? buf : AW.call('award_font_get', { p_id: f.id }).then(function (r) { var b = b64ToBuf(r.data); idb('readwrite', function (s) { return s.put(b, f.id); }); return b; });
    }).then(function (buf) { return new FontFace(family, buf).load(); }).then(function (ff) { document.fonts.add(ff); CF.loaded[family] = true; delete CF.busy[family]; return true; })
      .catch(function () { delete CF.busy[family]; return false; }));
  };
  // 양식에서 쓰는 내 글꼴을 모두 준비한 뒤 true(새로 불러온 글꼴이 있으면)
  AW.ensureFontsFor = function (tpl) {
    var used = {}; (tpl || AW.S.tpl).elems.forEach(function (e) { if (e.t === 'text') { used[e.font] = 1; if (e.fontEn) used[e.fontEn] = 1; } else if (e.t === 'table') { used[(e.style || {}).font] = 1; (e.cells || []).forEach(function (r) { r.forEach(function (c) { if (c && c.font) used[c.font] = 1; }); }); } });
    return Promise.all(Object.keys(used).map(function (fm) { return AW.ensureFont(fm); })).then(function (r) { return r.some(Boolean); });
  };
  // PC 에 설치된 글꼴인지 확인(캔버스 폭 비교)
  var hf = {};
  AW.hasFont = function (name) {
    if (name in hf) return hf[name];
    var c = (AW._cv = AW._cv || document.createElement('canvas').getContext('2d')), t = '가나다라ABCabc한글 0123', w = function (f) { c.font = '72px ' + f; return c.measureText(t).width; };
    return (hf[name] = ['monospace', 'serif', 'sans-serif'].some(function (b) { return w('"' + name + '",' + b) !== w(b); }));
  };
  AW.fontOptions = function (sameLabel) {
    var groups = [], by = {};
    AW.FONTS.forEach(function (f) { if (!by[f.grp]) { by[f.grp] = []; groups.push(f.grp); } by[f.grp].push(f); });
    return (sameLabel ? '<option value="">' + sameLabel + '</option>' : '') + groups.map(function (g) {
      return '<optgroup label="' + g + '">' + by[g].map(function (f) { var miss = f.sys && !AW.hasFont(f.id); return '<option value="' + f.id + '">' + f.label + (miss ? ' — 이 PC에 없음' : '') + '</option>'; }).join('') + '</optgroup>';
    }).join('');
  };
  // 양식에서 쓰는 PC 글꼴 중 이 PC 에 없는 것
  AW.missingFonts = function (tpl) {
    var used = {}; (tpl || AW.S.tpl).elems.forEach(function (e) { if (e.t === 'text') { used[e.font] = 1; if (e.fontEn) used[e.fontEn] = 1; } else if (e.t === 'table') { used[(e.style || {}).font] = 1; (e.cells || []).forEach(function (r) { r.forEach(function (c) { if (c && c.font) used[c.font] = 1; }); }); } });
    return AW.FONTS.filter(function (f) { return f.sys && used[f.id] && !AW.hasFont(f.id); }).map(function (f) { return f.label; });
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
  var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  AW.fmtDateEn = function (d) { d = d || new Date(); return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); };
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
    table: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 10h18M3 15h18M9 5v14M15 5v14"/>',
    qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/>', palette: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="11" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16" cy="11" r="1.2"/><path d="M12 21c-1.5 0-2-1-1.5-2s1-1.5 0-2.5S9 15 11 15h3a4 4 0 004-4"/>', sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9M13 5v4M7 15v4"/>', rotate: '<path d="M20 12a8 8 0 11-3-6.2M20 4v4h-4"/>', cut: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5L20 18M8 15.5L20 6"/>', paste: '<rect x="6" y="5" width="12" height="16" rx="1.5"/><path d="M9 5V3h6v2"/>', sel: '<path d="M4 4h4M16 4h4M4 20h4M16 20h4M4 8v8M20 8v8"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
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
    FONT_TOO_LARGE: '글꼴 파일이 너무 큽니다(8MB 이하).', FONT_QUOTA: '글꼴 저장 한도(150MB)를 넘습니다. 쓰지 않는 글꼴을 삭제해 주십시오.',
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
    if (type === 'qr') Object.assign(base, { w: 24, h: 24 });
    return Object.assign(base, o || {});
  };
  AW.get = function (id) { var t = AW.S.tpl; if (!t) return null; for (var i = 0; i < t.elems.length; i++) if (t.elems[i].id === id) return t.elems[i]; return null; };

  /* ───────────── 입력 항목 {{이름}} ───────────── */
  var TK = /\{\{\s*([^{}]+?)\s*\}\}/g;
  AW.BUILTIN = { '@번호': '발급번호(번호 규칙에 따라 자동 부여)', '@오늘': '출력일(한글 2026년 10월 14일 / 영문 October 14, 2026)', '@인증번호': '위조 방지 인증번호(출력할 때 자동 부여)' };
  AW.tokensOf = function (text) {
    var out = [], m; TK.lastIndex = 0;
    while ((m = TK.exec(text || ''))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
    return out;
  };
  AW.elemText = function (e) { return e.t === 'table' && AW.Table ? AW.Table.texts(e).join('\n') : (e.text || ''); };
  // 입력 항목 목록: 위→아래, 좌→우 순으로 첫 등장 순서. 내장 항목(@…)은 제외
  AW.fieldNames = function (tpl) {
    tpl = tpl || AW.S.tpl;
    var seen = [], list = tpl.elems.filter(function (e) { return e.t === 'text' || e.t === 'table'; }).slice().sort(function (a, b) { return (Math.round(a.y / 4) - Math.round(b.y / 4)) || (a.x - b.x); });
    list.forEach(function (e) { AW.tokensOf(AW.elemText(e)).forEach(function (n) { if (n.charAt(0) !== '@' && seen.indexOf(n) < 0) seen.push(n); }); });
    return seen;
  };
  // 양식 내 위치 설명 (예: "상단 중앙 · 제 {{번호}} 호")
  AW.whereIs = function (name, tpl) {
    tpl = tpl || AW.S.tpl;
    var hit = null;
    tpl.elems.forEach(function (e) { if ((e.t === 'text' || e.t === 'table') && AW.tokensOf(AW.elemText(e)).indexOf(name) >= 0 && (!hit || e.y < hit.y)) hit = e; });
    if (!hit) return '';
    var cx = (hit.x + hit.w / 2) / tpl.page.w, cy = (hit.y + hit.h / 2) / tpl.page.h;
    var v = cy < 0.33 ? '상단' : cy < 0.66 ? '중단' : '하단', h = cx < 0.36 ? '좌측' : cx < 0.64 ? '중앙' : '우측';
    var ctx = String(AW.elemText(hit)).replace(/\s+/g, ' ').trim(); if (ctx.length > 24) ctx = ctx.slice(0, 24) + '…';
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
    var t = AW.S.tpl, names = AW.fieldNames(t), old = {}, changed = false, fo = (t.page && t.page.fieldOrder) || [];
    names = names.map(function (n, i) { return [n, i]; }).sort(function (a, b) { var x = fo.indexOf(a[0]), y = fo.indexOf(b[0]); if (x < 0 && y < 0) return a[1] - b[1]; if (x < 0) return 1; if (y < 0) return -1; return x - y; }).map(function (p) { return p[0]; });   // 사용자가 정한 열 순서 우선
    t.fields.forEach(function (f) { old[f.name] = f; });
    var next = names.map(function (n) {
      if (old[n]) return old[n];
      var g = AW.guessHint(n); changed = true;
      return { name: n, hint: g.hint, example: g.example, max: 0, req: true };
    });
    if (changed || next.length !== t.fields.length || next.some(function (f, i) { return t.fields[i] !== f; })) { t.fields = next; return true; }
    return false;
  };
  // 발급번호 규칙: page.num = {pattern:'제{YYYY}-{N}호', start:1, step:1, pad:3}. {YYYY} {YY} {MM} {DD} {N}
  AW.serial = function (idx, tpl) {
    var n = ((tpl || AW.curTpl || AW.S.tpl || {}).page || {}).num || {}, d = new Date(), p2 = function (x) { return x < 10 ? '0' + x : '' + x; };
    var num = (n.start == null ? 1 : +n.start) + idx * (n.step == null ? 1 : +n.step), s = String(Math.abs(num)); while (s.length < (n.pad || 0)) s = '0' + s;
    return String(n.pattern || '{N}').replace(/\{YYYY\}/g, d.getFullYear()).replace(/\{YY\}/g, String(d.getFullYear()).slice(2)).replace(/\{MM\}/g, p2(d.getMonth() + 1)).replace(/\{DD\}/g, p2(d.getDate())).replace(/\{N\}/g, (num < 0 ? '-' : '') + s);
  };
  /* ───────────── 조사 자동 보정 (은/는·이/가·을/를·과/와·으로/로 …) ─────────────
   * 값의 마지막 글자 받침으로 결정: 한글=글자 코드, 숫자=읽기(영일이삼…), 영문=글자 이름(엘·엠·엔·알만 받침). 읽기 사전(AW.josaDict)이 있으면 우선.
   */
  var JP = [['으로부터', '로부터', 1], ['으로서', '로서', 1], ['으로써', '로써', 1], ['이라고', '라고'], ['이라는', '라는'], ['이에요', '예요'], ['으로', '로', 1], ['이라', '라'], ['이랑', '랑'], ['이며', '며'], ['이나', '나'], ['이든', '든'], ['이고', '고'], ['이다', '다'], ['이', '가'], ['은', '는'], ['을', '를'], ['과', '와'], ['아', '야']], JMAP = {};
  JP.forEach(function (q) { JMAP[q[0]] = q; JMAP[q[1]] = q; });
  var JRE = '으로부터|로부터|으로서|로서|으로써|로써|이라고|라고|이라는|라는|이에요|예요|으로|이라|이랑|이며|이나|이든|이고|이다|랑|며|나|든|고|다|라|로|이|가|은|는|을|를|과|와|아|야';
  AW.JOSA_RE = JRE;
  var DIG = { 0: [1, 0], 1: [1, 1], 2: [0, 0], 3: [1, 0], 4: [0, 0], 5: [0, 0], 6: [1, 0], 7: [1, 1], 8: [1, 1], 9: [0, 0] };   // [받침 있음, ㄹ받침]
  var LAT = { L: [1, 1], R: [1, 1], M: [1, 0], N: [1, 0] }, LATK = { A: '에이', B: '비', C: '씨', D: '디', E: '이', F: '에프', G: '지', H: '에이치', I: '아이', J: '제이', K: '케이', L: '엘', M: '엠', N: '엔', O: '오', P: '피', Q: '큐', R: '알', S: '에스', T: '티', U: '유', V: '브이', W: '더블유', X: '엑스', Y: '와이', Z: '제트' }, DIGK = '영일이삼사오육칠팔구';
  AW.josaDict = AW.lsGet('award_josa_dict', {});
  AW.josaSetDict = function (d) { AW.josaDict = d || {}; AW.lsSet('award_josa_dict', AW.josaDict); try { AW.pref.set('josa_dict', AW.josaDict).catch(function () {}); } catch (e) {} };
  AW.josaLoad = function () { return AW.pref.get('josa_dict').then(function (v) { if (v && typeof v === 'object') { AW.josaDict = Object.assign({}, v, AW.josaDict); AW.lsSet('award_josa_dict', AW.josaDict); } }).catch(function () {}); };
  AW.josaInfo = function (val) {   // → {b: 받침 있음, r: ㄹ받침, unsure: 읽기를 확정하기 어려움, read: 추천 읽기}
    var v = String(val == null ? '' : val).trim(), dict = AW.josaDict[v], src = dict || v, i;
    for (i = src.length - 1; i >= 0; i--) {
      var ch = src.charAt(i), c = ch.charCodeAt(0);
      if (c >= 0xAC00 && c <= 0xD7A3) { var j = (c - 0xAC00) % 28; return { b: j !== 0, r: j === 8, unsure: false, read: dict || v }; }
      if (/[0-9]/.test(ch)) { var d = DIG[ch]; return { b: !!d[0], r: !!d[1], unsure: !dict, read: dict || guessRead(v) }; }
      if (/[A-Za-z]/.test(ch)) { var L = LAT[ch.toUpperCase()] || [0, 0]; return { b: !!L[0], r: !!L[1], unsure: !dict, read: dict || guessRead(v) }; }
      if (/[ㄱ-ㅎㅏ-ㅣ]/.test(ch)) continue;
    }
    return { b: false, r: false, unsure: !!v, read: dict || v };
  };
  function guessRead(v) {   // 영문·숫자 → 한글 읽기 추천 (약어는 글자 이름대로)
    return String(v).replace(/[A-Za-z]/g, function (c) { return LATK[c.toUpperCase()] || c; }).replace(/[0-9]/g, function (c) { return DIGK.charAt(+c); });
  }
  AW.josaGuess = guessRead;
  AW.josaPick = function (form, val) {   // 값에 맞는 조사 형태 → {text, changed, unsure}
    var q = JMAP[form]; if (!q) return { text: form, changed: false, unsure: false }; var inf = AW.josaInfo(val), out;
    if (q[2]) out = (inf.b && !inf.r) ? q[0] : q[1]; else out = inf.b ? q[0] : q[1];
    return { text: out, changed: out !== form, unsure: inf.unsure };
  };
  AW.josaOn = function () { var t = AW.curTpl || AW.S.tpl; return !(t && t.page && t.page.josa === false); };
  // 양식에서 「{{항목}}조사」 짝 찾기 → [{field, form}]
  AW.josaTargets = function (tpl) {
    tpl = tpl || AW.S.tpl; var out = [], seen = {}, re = new RegExp('\\{\\{\\s*([^{}]+?)\\s*\\}\\}(' + JRE + ')(?![가-힣])', 'g');
    var scan = function (txt) { var m; re.lastIndex = 0; while ((m = re.exec(txt || ''))) { var f = m[1]; if (f.charAt(0) === '@') continue; var k = f + '|' + m[2]; if (!seen[k]) { seen[k] = 1; out.push({ field: f, form: m[2] }); } } };
    tpl.elems.forEach(function (e) { if (e.t === 'text') { scan(e.text); } else if (e.t === 'table') { (e.cells || []).forEach(function (r) { r.forEach(function (c) { if (c && c.text) scan(c.text); }); }); } });
    return out;
  };

  // 글자 잉크의 실제 위·아래가 상자에 맞도록 세로 보정(글꼴마다 위·아래 여백이 달라 생기는 어긋남) — px 이동량
  var inkCache = {}, inkCtx = null;
  AW.inkShift = function (fontId, bold, italic, sample, valign, lh, fs) {
    try {
      if (!inkCtx) inkCtx = document.createElement('canvas').getContext('2d'); var stack = AW.fontStack(fontId), ok = document.fonts && document.fonts.check ? document.fonts.check('16px ' + stack.split(',')[0]) : true, key = stack + '|' + bold + italic + '|' + sample + '|' + ok, m = inkCache[key];
      if (!m) { inkCtx.font = (italic ? 'italic ' : '') + (bold ? 'bold ' : '') + '100px ' + stack; var t = inkCtx.measureText(sample); if (t.fontBoundingBoxAscent == null) return 0; m = inkCache[key] = { fa: t.fontBoundingBoxAscent / 100, fd: t.fontBoundingBoxDescent / 100, aa: t.actualBoundingBoxAscent / 100, ad: t.actualBoundingBoxDescent / 100 }; }
      var pad = (lh - m.fa - m.fd) / 2;   // 줄 상자 안에서 글꼴 영역 위·아래 여백(em)
      var sh = valign === 'top' ? -(pad + m.fa - m.aa) : valign === 'bottom' ? (pad + m.fd - m.ad) : -(((m.fa - m.fd) - (m.aa - m.ad)) / 2);
      return sh * fs;
    } catch (e) { return 0; }
  };
  AW.val = function (row, name, idx, lang) {
    if (name === '@번호') return AW.serial(idx);
    if (name === '@오늘') return lang === 'en' ? AW.fmtDateEn() : AW.fmtDate();
    if (name === '@인증번호') return (row && row._code) || '(출력 시 자동 부여)';
    var v = row ? (lang === 'en' && row[name + '@en'] != null && row[name + '@en'] !== '' ? row[name + '@en'] : row[name]) : ''; return v == null ? '' : String(v);
  };
  // 서버 설정값(학교 색 등) — 모든 양식에서 공유
  AW.pref = { cache: {}, get: function (k) { return AW.call('award_pref_get', { p_key: k }).then(function (v) { AW.pref.cache[k] = v; return v; }); }, set: function (k, v) { AW.pref.cache[k] = v; return AW.call('award_pref_set', { p_key: k, p_val: v }); } };
  AW.verifyUrl = function (code) { return location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + 'award-verify.html?c=' + encodeURIComponent(code); };
  AW.qrSvg = function (text) {
    try { var q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 1, margin: 0, scalable: true }); } catch (e) { return '<div style="font-size:10px;text-align:center">QR</div>'; }
  };

  /* ───────────── 페이지 렌더러 ─────────────
   * AW.renderPage(tpl, {scale, row, idx, mode:'edit'|'view'|'print', bg:true, dx, dy}) → HTMLElement
   *  scale = 1mm 당 px. 글꼴 크기(pt) → mm → px 변환. 인쇄는 scale = 96/25.4.
   */
  var PT = 25.4 / 72;
  AW.renderPage = function (tpl, o) {
    o = o || {}; AW.curTpl = tpl;
    var k = o.scale || 3.78, pg = tpl.page, mode = o.mode || 'view'; if (!o.lang) o = Object.assign({}, o, { lang: pg.lang || 'ko' });
    var el = document.createElement('div');
    el.className = 'pg pg-' + mode;
    el.style.cssText = 'position:relative;overflow:hidden;background:' + (pg.bgc || '#fff') + ';width:' + (pg.w * k) + 'px;height:' + (pg.h * k) + 'px;flex:none';
    if (tpl.bg && o.bg !== false && !(pg && pg.bgHide)) {
      var im = document.createElement('img'); im.className = 'pg-bg'; im.src = tpl.bg; im.alt = ''; im.draggable = false;
      im.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;user-select:none';
      el.appendChild(im);
    }
    var dx = o.dx || 0, dy = o.dy || 0;
    tpl.elems.forEach(function (e) { el.appendChild(AW.renderElem(e, k, o, dx, dy)); });
    if (pg.plate && AW.Plate) AW.Plate.decorate(el, tpl, k, o, mode);   // 명패: 3칸 → 2칸 반전 복제 + 접는 선 안내
    return el;
  };
  AW.makeTok = function (mode, o) {
    var jOn = AW.josaOn(), jRe = new RegExp('\\{\\{\\s*([^{}]+?)\\s*\\}\\}(?:(' + AW.JOSA_RE + ')(?![가-힣]))?', 'g');
    return function (src, lg) {
        return AW.esc(src).replace(jRe, function (m, n, pj) {
          n = n.replace(/&amp;/g, '&'); if (mode === 'edit') return '<span class="tk">{{' + AW.esc(n) + '}}</span>' + (pj || '');
          var v = AW.val(o.row, n, o.idx || 0, lg), jo = pj || '';
          if (!v && mode === 'view' && n.charAt(0) !== '@') return '<span class="miss">' + AW.esc('{' + n + '}') + '</span>' + jo;
          if (pj && v && jOn && lg !== 'en') { var pk = AW.josaPick(pj, v); jo = pk.changed ? (mode === 'view' ? '<span class="jo" title="조사 자동 보정: ' + AW.esc(pj) + ' → ' + AW.esc(pk.text) + '">' + pk.text + '</span>' : pk.text) : pk.text; }
          return (mode === 'view' ? '<span class="mv">' + AW.esc(v) + '</span>' : AW.esc(v)) + jo;   // 미리보기에서는 바뀌는 값을 표시(인쇄에는 표시 없음)
        }).replace(/\[s=(\d{2,3})\]/g, '<span style="font-size:$1%">').replace(/\[\/s\]/g, '</span>');   // [s=45]작은 글[/s] — 한 줄 안에서 글자 크기 비율 변경(명패 소속·직책)
      };
  };
  AW.renderElem = function (e, k, o, dx, dy) {
    var mode = o.mode || 'view', d = document.createElement('div');
    d.className = 'el el-' + e.t; d.dataset.id = e.id;
    var base = 'position:absolute;left:' + ((e.x + (mode === 'print' ? dx : 0)) * k) + 'px;top:' + ((e.y + (mode === 'print' ? dy : 0)) * k) + 'px;width:' + (e.w * k) + 'px;height:' + (Math.max(e.h, e.t === 'line' ? 0 : 1) * k) + 'px;';
    if (e.t === 'text') {
      var lang = o.lang || 'ko', ko = e.text || '', en = e.en || '', cp = (AW.curTpl || AW.S.tpl || {}).page || {}, blocks = [];
      var tokH = AW.makeTok(mode, o);
      var ef = e.fontEn ? AW.fontStack(e.fontEn) : '';
      if (lang === 'en') blocks.push({ h: tokH(en || ko, en ? 'en' : 'ko'), dim: mode === 'edit' && !en, f: en ? ef : '' });
      else if (lang === 'both' && en.trim()) { var kb = { h: tokH(ko, 'ko') }, eb = { h: tokH(en, 'en'), s: cp.enScale || 0.8, f: ef }; blocks = cp.enFirst ? [eb, kb] : [kb, eb]; }
      else blocks.push({ h: tokH(ko, 'ko') });
      var inner = blocks.map(function (x) { return '<div' + (x.s || x.f ? ' style="' + (x.s ? 'font-size:' + x.s + 'em;' : '') + (x.f ? 'font-family:' + x.f + ';' : '') + '"' : '') + (x.dim ? ' class="noen"' : '') + '>' + (x.h || (mode === 'edit' ? '' : '&nbsp;')) + '</div>'; }).join('');
      var fs = (e.size || 16) * PT * k;
      d.style.cssText = base + 'display:flex;flex-direction:column;justify-content:' + (e.valign === 'top' ? 'flex-start' : e.valign === 'bottom' ? 'flex-end' : 'center') +
        ';font-family:' + AW.fontStack(e.font) + ';font-size:' + fs + 'px;line-height:' + (e.lh || 1.4) + ';color:' + (e.color || '#111') +
        ';font-weight:' + (e.bold ? 700 : 400) + ';font-style:' + (e.italic ? 'italic' : 'normal') + ';text-decoration:' + (e.ul ? 'underline' : 'none') +
        ';text-align:' + (e.align || 'center') + (e.align === 'justify' ? ';text-align-last:justify' : '') + ';letter-spacing:' + ((e.ls || 0) * PT * k) + 'px;white-space:' + (e.fit ? 'pre' : 'pre-wrap') + ';word-break:keep-all;overflow-wrap:anywhere;';
      var b = document.createElement('div'); b.className = 'el-t'; b.innerHTML = inner;
      var isw = AW.inkShift(e.font, !!e.bold, !!e.italic, /[가-힣]/.test(ko + en) ? '가힣' : /[A-Za-z0-9]/.test(ko + en) ? 'H0' : '가', e.valign || 'middle', e.lh || 1.4, fs);
      b.style.cssText = 'width:100%;' + (e.fit ? 'overflow:visible;' : '') + (Math.abs(isw) > 0.05 ? 'transform:translateY(' + isw.toFixed(2) + 'px);' : '');
      d.appendChild(b);
      if (e.fit) d.dataset.fit = '1';
      if (mode === 'edit' && /\{\{[^{}]+\}\}/.test(ko + en)) d.classList.add('has-tk');   // 메일머지 영역 표시(편집 화면 전용)
    } else if (e.t === 'table' && AW.Table) {
      d.style.cssText = base; AW.Table.render(e, d, k, o, AW.makeTok(mode, o));
    } else if (e.t === 'qr') {
      d.style.cssText = base + 'background:#fff;'; d.innerHTML = AW.qrSvg(AW.verifyUrl((o.row && o.row._code) || 'SAMPLE0000'));
    } else if (e.t === 'rect') {
      d.style.cssText = base + 'box-sizing:border-box;border:' + ((e.sw || 0) * k) + 'px solid ' + (e.stroke || 'transparent') + ';background:' + (e.fill || 'transparent') + ';';
    } else if (e.t === 'line') {
      d.style.cssText = base + 'height:0;border-top:' + ((e.sw || 0.5) * k) + 'px solid ' + (e.stroke || '#111') + ';';
    } else if (e.t === 'img') {
      d.style.cssText = base + 'opacity:' + (e.opacity == null ? 1 : e.opacity) + ';';
      if (e.src) { var im = document.createElement('img'); im.src = e.src; im.alt = ''; im.draggable = false; im.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none'; d.appendChild(im); }
    }
    var tr = (e.rot ? 'rotate(' + e.rot + 'deg) ' : '') + ((e.flipX || e.flipY) ? 'scale(' + (e.flipX ? -1 : 1) + ',' + (e.flipY ? -1 : 1) + ')' : '');
    if (tr) d.style.transform = tr.trim();
    if (e.opacity != null && e.opacity < 1 && e.t !== 'img') d.style.opacity = e.opacity;
    if (e.hide || (e.noprint && mode !== 'edit')) d.style.display = 'none';   // 인쇄 제외 개체는 편집 화면에만 표시(미리보기·출력에서는 제외)
    if (e.noprint && mode === 'edit') d.classList.add('np');
    return d;
  };
  // 글자 자동 맞춤(shrink): 한 줄 안에 들어가도록 폰트를 줄임. DOM 부착 후 호출.
  AW.fitAll = function (root) {
    if (AW.Table) AW.Table.autoFit(root, false);
    AW.$$('.el[data-fit="1"]', root).forEach(function (d) {
      var b = d.firstChild; if (!b) return;
      var fs = parseFloat(d.style.fontSize), min = fs * 0.35, n = 0, wrapW = d.clientWidth, wrapH = d.clientHeight;
      b.style.width = 'max-content';
      while ((b.offsetWidth > wrapW + 0.5 || b.offsetHeight > wrapH + 0.5) && fs > min && n++ < 80) { fs *= 0.96; d.style.fontSize = fs + 'px'; }
      b.style.width = '100%';
    });
  };
})();
