'use strict';
/* event-ext.js — 일정 추가/수정 모달 확장 + 빠른 등록 API 점등
   · 모달 드래그 이동 + 가장자리 자석(데스크톱), 마지막 위치 기억
   · 시작 변경 시 종료 자동 연동(기존 길이 유지, 기본 1시간)
   · 제목 Enter / 설명 Ctrl+Enter 저장 (한글 조합 중 Enter 무시)
   · 계정별 기본 등록 캘린더 (localStorage + Google Drive 설정 동기화)
   · Ctrl+Alt+R 선택 텍스트 → 날짜/시간 파싱 → 일정 모달 자동 입력
   · 등록 후 이동·강조·실행 취소, API 연결 점등/진단
   의존: app.js가 노출하는 window.EventHooks */
(function () {
  /* AHK/확장이 주소 해시(#qt=글)로 전달한 선택 텍스트 — 로그인 후 일정창이 자동으로 열림 */
  (function () {
    var h = location.hash || '', ss = null;
    try { ss = sessionStorage.getItem('asea_popup'); } catch (e) {}
    if (h.indexOf('#qt=') === 0) {
      try { window.__aseaQuickText = decodeURIComponent(h.slice(4)); } catch (e) {}
      window.__aseaAutoOpenQuickTask = true; window.__aseaPopup = true;
    } else if (h === '#quick-task') window.__aseaPopup = true;
    else if (ss === '1') window.__aseaPopup = true;      // 같은 창에서 새로고침해도 팝업 모드 유지
    if (window.__aseaPopup) { try { sessionStorage.setItem('asea_popup', '1'); } catch (e) {} }
  })();
  var MOBILE_MQ = '(max-width: 768px)';
  var SNAP = 16, MARGIN = 12;

  function $(id) { return document.getElementById(id); }
  function H() { return window.EventHooks; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function email() {
    var h = H();
    var e = (h && h.S && h.S.userEmail) || '';
    if (!e) { try { e = localStorage.getItem('asea_user_email') || ''; } catch (x) {} }
    return String(e).trim().toLowerCase();
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function isMobile() { return window.matchMedia && window.matchMedia(MOBILE_MQ).matches; }
  function toLocal(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function isNew() { var h = H(); return !(h && h.S && h.S.editEventId); }
  function toast(m, t) { var h = H(); if (h) h.toast(m, t); }

  /* ── 스타일 ─────────────────────────────────────────────── */
  var css = document.createElement('style');
  css.textContent =
    '@media (min-width:769px){' +
    '#event-modal.ev-float{pointer-events:none}' +
    '#event-modal.ev-float .modal-backdrop{display:none}' +
    '#event-modal.ev-float .modal-dialog{pointer-events:auto;position:relative;box-shadow:0 12px 40px rgba(0,0,0,.28)!important}' +
    '#event-modal.ev-float .modal-header{cursor:grab;touch-action:none}' +
    '#event-modal.ev-dragging .modal-header{cursor:grabbing}' +
    '}' +
    '.ev-ext-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:11px;color:var(--color-text-muted,#6b7280);margin-top:4px}' +
    '.ev-ext-row label{display:inline-flex;align-items:center;gap:4px;cursor:pointer}' +
    '.ev-hint{font-size:11px;color:var(--color-text-muted,#6b7280);margin-top:4px}' +
    '@keyframes ev-flash{0%,100%{box-shadow:0 0 0 0 rgba(26,115,232,0)}30%{box-shadow:0 0 0 4px rgba(26,115,232,.55)}}' +
    '.ev-flash{animation:ev-flash 0.8s ease-in-out 3}' +
    '.ev-undo{display:flex;align-items:center;gap:10px}' +
    '.ev-undo button{background:transparent;border:1px solid rgba(255,255,255,.6);color:inherit;border-radius:12px;padding:2px 10px;font-size:12px;cursor:pointer}' +
    '.ev-led{display:inline-flex;align-items:center;gap:6px;font-size:11px;margin-left:10px;padding:2px 8px;border-radius:12px;background:rgba(255,255,255,.18);color:#fff;cursor:pointer;border:0;vertical-align:middle}' +
    '.ev-led i{width:9px;height:9px;border-radius:50%;display:inline-block;background:#9ca3af}' +
    '.ev-led.ok i{background:#16a34a}.ev-led.warn i{background:#f59e0b}.ev-led.bad i{background:#dc2626}' +
    '.ev-led-admin{margin-left:6px}' +
    '.ev-diag{margin:0 0 16px;padding:16px;border:1px solid var(--color-border,#e5e7eb);border-radius:12px;background:var(--color-card,#fff)}' +
    '.ev-diag h3{margin:0 0 8px;font-size:15px}' +
    '.ev-diag ul{list-style:none;margin:10px 0 0;padding:0;font-size:13px}' +
    '.ev-diag li{display:flex;gap:8px;align-items:baseline;padding:3px 0}' +
    '.ev-dot{width:9px;height:9px;border-radius:50%;flex:none;background:#9ca3af}' +
    '.ev-dot.ok{background:#16a34a}.ev-dot.warn{background:#f59e0b}.ev-dot.bad{background:#dc2626}';
  document.head.appendChild(css);

  /* ═══ 1. 모달 드래그 + 자석 ═══════════════════════════════ */
  var pos = { x: 0, y: 0 };
  function posKey() { return 'asea_ev_pos:' + email(); }
  function magnetKey() { return 'asea_ev_magnet:' + email(); }
  function magnetOn() { return lsGet(magnetKey()) !== '0'; }
  function dialog() { return document.querySelector('#event-modal .modal-dialog'); }

  function applyPos() {
    var d = dialog(); if (!d) return;
    d.style.left = pos.x + 'px'; d.style.top = pos.y + 'px';
  }
  function clampToViewport() {
    var d = dialog(); if (!d) return;
    var r = d.getBoundingClientRect();
    var dx = 0, dy = 0;
    if (r.left < 0) dx = -r.left;
    if (r.right > window.innerWidth) dx = window.innerWidth - r.right;
    if (r.top < 0) dy = -r.top;
    if (r.bottom > window.innerHeight) dy = window.innerHeight - r.bottom;
    if (dx || dy) { pos.x += dx; pos.y += dy; applyPos(); }
  }
  function setupFloat(open) {
    var m = $('event-modal'); if (!m) return;
    var on = open && !isMobile() && !window.__aseaPopup;
    m.classList.toggle('ev-float', on);
    var d = dialog(); if (!d) return;
    if (!on) { d.style.left = d.style.top = ''; return; }
    var saved = null;
    try { saved = JSON.parse(lsGet(posKey()) || 'null'); } catch (e) {}
    pos = saved && isFinite(saved.x) ? { x: saved.x, y: saved.y } : { x: 0, y: 0 };
    applyPos();
    clampToViewport();
  }
  function initDrag() {
    var m = $('event-modal'); if (!m) return;
    var hdr = m.querySelector('.modal-header');
    if (!hdr) return;
    var st = null;
    hdr.addEventListener('pointerdown', function (e) {
      if (!m.classList.contains('ev-float') || e.button > 0 || e.target.closest('.modal-close')) return;
      var d = dialog(), r = d.getBoundingClientRect();
      st = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, r: r };
      m.classList.add('ev-dragging');
      try { hdr.setPointerCapture(e.pointerId); } catch (x) {}
    });
    hdr.addEventListener('pointermove', function (e) {
      if (!st) return;
      var dx = e.clientX - st.sx, dy = e.clientY - st.sy;
      var L = st.r.left + dx, T = st.r.top + dy, W = st.r.width, Hh = st.r.height;
      var vw = window.innerWidth, vh = window.innerHeight;
      if (magnetOn()) {
        if (Math.abs(L - MARGIN) < SNAP) dx += MARGIN - L;
        else if (Math.abs(vw - MARGIN - (L + W)) < SNAP) dx += (vw - MARGIN - (L + W));
        else if (Math.abs(L + W / 2 - vw / 2) < SNAP) dx += vw / 2 - (L + W / 2);
        if (Math.abs(T - MARGIN) < SNAP) dy += MARGIN - T;
        else if (Math.abs(vh - MARGIN - (T + Hh)) < SNAP) dy += (vh - MARGIN - (T + Hh));
        else if (Math.abs(T + Hh / 2 - vh / 2) < SNAP) dy += vh / 2 - (T + Hh / 2);
      }
      pos.x = st.ox + dx; pos.y = st.oy + dy;
      applyPos();
    });
    function end() {
      if (!st) return;
      st = null; m.classList.remove('ev-dragging');
      clampToViewport();
      lsSet(posKey(), JSON.stringify(pos));
      if (window.PrefsSync) PrefsSync.push('pos');
    }
    hdr.addEventListener('pointerup', end);
    hdr.addEventListener('pointercancel', end);
    hdr.addEventListener('dblclick', function (e) {
      if (e.target.closest('.modal-close')) return;
      pos = { x: 0, y: 0 }; applyPos(); lsSet(posKey(), JSON.stringify(pos));
    });
    window.addEventListener('resize', function () { if (m.classList.contains('ev-float')) clampToViewport(); });
  }

  /* 일정창 닫힘 방지: 배경·빈 영역 클릭/Esc/스와이프로는 닫히지 않고, ✕·취소는 입력 내용이 있으면 확인 후 닫음 */
  var snap = '';
  function snapshot() {
    var h = H(); if (!h) return '';
    return JSON.stringify([($('event-title') || {}).value, ($('event-description') || {}).value,
      ($('event-start') || {}).value, ($('event-end') || {}).value,
      (h.S.editCalendars || []).map(function (c) { return c.id; })]);
  }
  function isDirty() { var m = $('event-modal'); return !!m && !m.hidden && snapshot() !== snap; }
  function confirmClose() { return !isDirty() || confirm('입력 중인 내용이 있습니다. 저장하지 않고 닫으시겠습니까?'); }
  function initNoAutoClose() {
    var m = $('event-modal'); if (!m) return;
    var CONTROL = 'input,textarea,select,button,a,label,[contenteditable],.event-cal-chip,.qt-cal-chip,.chip,.form-input';
    m.addEventListener('click', function (e) {
      var t = e.target;
      if (t === m || t.classList.contains('modal-backdrop')) { e.stopPropagation(); return; }
      if (t.closest('.modal-close, [data-close-modal]')) {
        if (!confirmClose()) { e.stopPropagation(); e.preventDefault(); }
        return;
      }
      if (t.closest('.modal-dialog') && !t.closest(CONTROL)) e.stopPropagation();
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !window.__evDoneShowing && !m.hidden && !confirmClose()) { e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
    window.addEventListener('beforeunload', function (e) { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
  }

  /* 모달이 열린 동안 달력 날짜 칸 클릭 → 입력 중인 내용 유지, 날짜만 변경 */
  function initCellPick() {
    document.addEventListener('click', function (e) {
      var m = $('event-modal');
      if (!m || m.hidden || !m.classList.contains('ev-float') || !isNew()) return;
      if (e.target.closest('#event-modal') || e.target.closest('.event-chip')) return;
      var cell = e.target.closest('[data-date]');
      if (!cell || !/^\d{4}-\d{2}-\d{2}$/.test(cell.dataset.date)) return;
      e.stopPropagation(); e.preventDefault();
      var s = $('event-start'), en = $('event-end');
      var oldS = (s.value || '').slice(0, 10), oldE = (en.value || '').slice(0, 10) || oldS;
      var nd = cell.dataset.date;
      var shift = oldS ? Math.round((new Date(oldE) - new Date(oldS)) / 864e5) : 0;
      var ed = new Date(nd + 'T00:00:00'); ed.setDate(ed.getDate() + shift);
      s.value = nd + (s.value.length > 10 ? s.value.slice(10) : '');
      en.value = ymd(ed) + (en.value.length > 10 ? en.value.slice(10) : '');
      lastStart = s.value;
    }, true);
  }

  /* ═══ 2. 시작 → 종료 자동 연동 ═════════════════════════════ */
  var lastStart = '';
  function parseLocal(v) {
    if (!v) return null;
    var d = new Date(v.length === 10 ? v + 'T00:00:00' : v);
    return isNaN(d) ? null : d;
  }
  function syncTrack() { lastStart = ($('event-start') || {}).value || ''; }
  function initAutoEnd() {
    var s = $('event-start'), en = $('event-end');
    if (!s || !en) return;
    function onStart() {
      var ns = parseLocal(s.value), os = parseLocal(lastStart), oe = parseLocal(en.value);
      if (!ns) return;
      if (s.type === 'date') {
        var dd = (os && oe) ? Math.round((oe - os) / 864e5) : 0;
        var nd = new Date(ns); nd.setDate(nd.getDate() + Math.max(0, dd));
        en.value = ymd(nd);
      } else {
        var len = (os && oe && oe > os) ? (oe - os) : 3600000;   // 기존 길이 유지, 기본 1시간
        en.value = toLocal(new Date(ns.getTime() + len));
      }
      lastStart = s.value;
    }
    s.addEventListener('change', onStart);
    s.addEventListener('input', function () { if (s.value && s.value.length >= 16) onStart(); });
  }

  /* ═══ 3. Enter 저장 ═══════════════════════════════════════ */
  function initMultiSave() {
    var sb = $('save-event-btn'); if (!sb) return;
    sb.addEventListener('click', function (e) {
      if (!multiActive) return;
      e.stopImmediatePropagation(); e.preventDefault(); bulkAi();
    }, true);
  }
  function initEnterSave() {
    function save() { var b = $('save-event-btn'); if (b && !b.disabled) b.click(); }
    var t = $('event-title'), d = $('event-description');
    if (t) t.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && !e.shiftKey) { e.preventDefault(); save(); }
    });
    if (d) {
      d.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); save(); }
      });
      var hint = document.createElement('div');
      hint.className = 'ev-hint';
      hint.textContent = '제목에서 Enter, 설명에서 Ctrl+Enter 를 누르면 저장됩니다.';
      d.parentNode.appendChild(hint);
    }
  }

  /* ═══ 4. 계정별 기본 등록 캘린더 ═══════════════════════════ */
  function defKey() { return 'asea_ev_defcals:' + email(); }
  function getDefaults() {
    var loc = null, cloud = null;
    try { loc = JSON.parse(lsGet(defKey()) || 'null'); } catch (e) {}
    try { if (typeof CONFIG !== 'undefined') cloud = CONFIG.eventDefaultCals || null; } catch (e) {}
    var best = (cloud && (!loc || (cloud.t || 0) > (loc.t || 0))) ? cloud : loc;
    if (best && best.list) lsSet(defKey(), JSON.stringify(best));
    return (best && best.list) || [];
  }
  function saveDefaults() {
    var h = H(); if (!h) return;
    var list = (h.S.editCalendars || []).map(function (c) { return { id: c.id, name: c.name, color: c.color, on: c.on !== false }; });
    if (window.OrderExt) OrderExt.setCalOrder(list.map(function (c) { return c.id; }));
    var obj = { t: Date.now(), list: list };
    lsSet(defKey(), JSON.stringify(obj));
    try { if (typeof CONFIG !== 'undefined') CONFIG.eventDefaultCals = obj; } catch (e) {}
    h.saveCloud(true);
    if (window.PrefsSync) PrefsSync.push('defcals').then(function (r) { if (r && !r.ok) toast('서버 저장 실패: ' + r.msg + ' (이 기기에는 저장됨)', 'error'); });
    toast(list.length ? '선택한 ' + list.length + '개 캘린더를 내 기본값으로 저장했습니다.' : '기본 캘린더 설정을 비웠습니다.', 'success');
    refreshDefLabel();
  }
  function refreshDefLabel() {
    var el = $('ev-def-label'); if (!el) return;
    var n = getDefaults().length;
    el.textContent = n ? '내 기본값 ' + n + '개' : '내 기본값 없음';
  }
  async function applyDefaults() {
    var h = H(); if (!h) return;
    var defs = getDefaults();
    if (!defs.length) return;
    var cals;
    try { cals = await h.ensureCals(); } catch (e) { return; }
    if (!isNew() || $('event-modal').hidden || h.S.editCalendars.length) return;   // 사용자가 이미 선택한 경우 존중
    var byId = {}; cals.forEach(function (c) { byId[c.id] = c; });
    var ok = [], miss = 0;
    defs.forEach(function (d) {
      var c = byId[d.id];
      if (c && (!c.accessRole || c.accessRole === 'owner' || c.accessRole === 'writer')) {
        ok.push({ id: c.id, name: c.summary || d.name || c.id, color: c.backgroundColor || d.color || '#4285F4' });
      } else miss++;
    });
    // 저장된 체크 상태 복원 (예전 형식은 첫 캘린더만 체크)
    var hasFlag = defs.some(function (d) { return d.on !== undefined; });
    ok.forEach(function (c, i) { var d = defs.filter(function (x) { return x.id === c.id; })[0]; c.on = hasFlag ? !!(d && d.on) : i === 0; });
    h.S.editCalendars = ok;
    h.renderChips();
    snap = snapshot();
    if (miss) toast('기본 캘린더 ' + miss + '개는 삭제되었거나 권한이 없어 제외했습니다.', 'info');
  }
  function initDefaultsUI() {
    var clr = $('event-cal-clear-btn');
    if (!clr || $('ev-def-save')) return;
    var save = document.createElement('button');
    save.type = 'button'; save.id = 'ev-def-save'; save.className = 'btn btn-ghost btn-sm';
    save.style.fontSize = '11px'; save.textContent = '현재 목록·체크를 내 기본값으로 저장';
    save.addEventListener('click', saveDefaults);
    clr.parentNode.insertBefore(save, clr.nextSibling);
    var row = document.createElement('div');
    row.className = 'ev-ext-row';
    row.innerHTML = '<span id="ev-def-label"></span><button type="button" id="ev-def-reload" class="btn btn-ghost btn-sm" style="font-size:11px">다른 기기 설정 불러오기</button>' +
      '<label><input type="checkbox" id="ev-magnet"> 창 자석 맞춤</label>' +
      '<span>체크한 캘린더에만 등록 · 칩 드래그: 순서 변경 · 헤더 더블클릭: 중앙 복귀</span>';
    var chips = $('event-cal-chip-list');
    chips.parentNode.insertBefore(row, chips.nextSibling);
    $('ev-def-reload').addEventListener('click', async function () {
      var b = this; b.disabled = true;
      var r = window.PrefsSync ? await PrefsSync.sync() : { ok: false, msg: '동기화 모듈 없음' };
      b.disabled = false;
      if (!r.ok) { toast('불러오기 실패: ' + r.msg, 'error'); return; }
      toast(r.pulled.length ? '다른 기기의 설정을 불러왔습니다.' : '이미 최신 설정입니다.', 'success');
      var hh = H(); if (hh && isNew()) { hh.S.editCalendars = []; applyDefaults(); }
      refreshDefLabel();
    });
    var cb = $('ev-magnet');
    cb.addEventListener('change', function () { lsSet(magnetKey(), cb.checked ? '1' : '0'); if (window.PrefsSync) PrefsSync.push('magnet'); });
  }

  /* ═══ 5. 선택 텍스트 → 일정 파싱 ═══════════════════════════ */
  var DATE_RE = /(?:(\d{4})\s*[.\-\/년]\s*)?(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})\s*일?\.?/g;
  var TIME_RE = /(오전|오후|AM|PM|am|pm)?\s*(\d{1,2})\s*(?::\s*(\d{2})|시\s*(?:(\d{1,2})\s*분)?)/g;
  var WD_RE = /^\s*(?:\(\s*([일월화수목금토])\s*\)|([일월화수목금토])요일)/;
  var DAYONLY_RE = /^\s*(?:~|–|—|-|부터)\s*(\d{1,2})\s*일/;
  var WD = '일월화수목금토';

  /* 한 덩어리 텍스트 → 일정 목록 (연속=기간 1건, 구분된 날짜=개별 N건). 날짜 없으면 [] */
  function parseBlock(text) {
    var now = new Date(), used = [], m, dates = [], times = [];
    DATE_RE.lastIndex = 0;
    while ((m = DATE_RE.exec(text))) {
      var mo = +m[2], da = +m[3], noYear = !m[1], y = m[1] ? +m[1] : now.getFullYear();
      if (mo < 1 || mo > 12 || da < 1 || da > 31) continue;
      var d = new Date(y, mo - 1, da);
      if (d.getMonth() !== mo - 1) continue;
      var e = m.index + m[0].length, rec = { i: m.index, e: e, d: d };
      var w = WD_RE.exec(text.slice(e));
      if (w) { rec.wd = w[1] || w[2]; used.push([e, e + w[0].length]); rec.e2 = e + w[0].length; }
      used.push([m.index, e]);
      dates.push(rec);
    }
    dates.forEach(function (a) {                        // "8월 31일~2일" 형태의 일자만 있는 종료일
      var t = DAYONLY_RE.exec(text.slice(a.e2 || a.e));
      if (!t) return;
      var d2 = new Date(a.d.getFullYear(), a.d.getMonth(), +t[1]);
      if (d2 < a.d) d2.setMonth(d2.getMonth() + 1);
      var s0 = (a.e2 || a.e);
      dates.push({ i: s0 + t[0].search(/\d/), e: s0 + t[0].length, d: d2, dayOnly: true });
      used.push([s0, s0 + t[0].length]);
    });
    dates.sort(function (a, b) { return a.i - b.i; });
    TIME_RE.lastIndex = 0;
    while ((m = TIME_RE.exec(text))) {
      var h = +m[2], mi = +(m[3] || m[4] || 0);
      if (h > 24 || mi > 59) continue;
      if (m[1]) {
        var p = m[1].toLowerCase();
        if ((p === '오후' || p === 'pm') && h < 12) h += 12;
        if ((p === '오전' || p === 'am') && h === 12) h = 0;
      }
      times.push({ i: m.index, h: h % 24, mi: mi, ap: !!m[1] }); used.push([m.index, m.index + m[0].length]);
    }
    if (!dates.length) return [];
    // 날짜 묶기: 사이 글이 ~ - 부터 뿐이면 하나의 기간(연속), 아니면 개별 일정
    var groups = [];
    dates.forEach(function (a, k) {
      var prev = groups[groups.length - 1];
      if (prev && !prev.de) {
        var gap = text.slice(prev.last.e2 || prev.last.e, a.i).replace(TIME_RE, '').replace(/\s+/g, '');
        if (a.dayOnly || /^(~|–|—|-|부터|~부터)$/.test(gap)) { prev.de = a.d; prev.last = a; prev.wdEnd = a.wd; return; }
      }
      groups.push({ ds: a.d, de: null, first: a, last: a, wdStart: a.wd });
    });
    var onlyTime = (groups.length > 1 && times.length === 1) ? times[0] : null;   // 시간 1개·날짜 여러 개 → 모두 같은 시간
    var items = groups.map(function (g, gi) {
      var from = gi === 0 ? 0 : g.first.i, to = gi + 1 < groups.length ? groups[gi + 1].first.i : text.length;
      var ts = onlyTime ? [onlyTime] : times.filter(function (t) { return t.i >= from && t.i < to; });
      var it = { warn: '' };
      if (g.wdStart && WD.charAt(g.ds.getDay()) !== g.wdStart) it.warn = '요일 불일치: 입력 ' + g.wdStart + ' / 실제 ' + WD.charAt(g.ds.getDay());
      if (g.de && g.wdEnd && WD.charAt(g.de.getDay()) !== g.wdEnd && !it.warn) it.warn = '종료일 요일 불일치: 입력 ' + g.wdEnd + ' / 실제 ' + WD.charAt(g.de.getDay());
      var endDay = g.de || g.ds;
      if (!ts.length) { it.allDay = true; it.start = g.ds; it.end = endDay; return it; }
      var st = ts[0], et = ts[1] || null;
      var s = new Date(g.ds); s.setHours(st.h, st.mi, 0, 0);
      var e;
      if (et) {
        e = new Date(endDay); e.setHours(et.h, et.mi, 0, 0);
        if (e <= s && !et.ap && et.h < 12 && s.getHours() >= 12) e = new Date(e.getTime() + 432e5);   // "오후 6시~8시" → 오후 8시
        if (e <= s && !g.de) e = new Date(e.getTime() + 864e5);
      } else { e = new Date(endDay); e.setHours(st.h, st.mi, 0, 0); e = new Date(e.getTime() + 3600000); }
      if (e <= s) e = new Date(s.getTime() + 3600000);
      it.allDay = false; it.start = s; it.end = e;
      return it;
    });
    var todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
    items.forEach(function (it, gi) {
      if (groups[gi].ds < todayMid) it.warn = (it.warn ? it.warn + ' · ' : '') + '지난 날짜';
    });
    var rest = text, spans = used.slice().sort(function (a, b) { return b[0] - a[0]; });
    spans.forEach(function (r) { rest = rest.slice(0, r[0]) + ' ' + rest.slice(r[1]); });
    var rl = rest.split(/\r?\n/).map(function (l) {
      return l.replace(/[~\-–—]+/g, ' ').replace(/부터|까지|\s및\s|[,;·\t]/g, ' ').replace(/^\s*(?:[•·\-*]|\d+[.)])\s+/, '').replace(/(^|\s)\/+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim()
        .replace(/^[\s,.:;()\[\]]+|[\s,.:;]+$/g, '');
    }).filter(Boolean);
    var title = (rl[0] || '').slice(0, 80), restDesc = rl.slice(1).join('\n');
    items.forEach(function (it) { it.title = title; it.rest = restDesc; });
    return items;
  }
  /* 전체 텍스트 → 일정 목록. 날짜가 있는 줄이 2줄 이상이면 줄(표의 행)마다 1건씩 처리 */
  function parseAll(text) {
    text = String(text || '').trim();
    if (!text) return [];
    var lines = text.split(/\r?\n/).map(function (l) { return l.replace(/^\s*(?:[•·\-*]|\d{1,2}[.)])\s+/, ''); }).filter(function (l) { return l.trim(); });
    text = lines.join('\n');
    var per = lines.map(function (l) { return parseBlock(l); }).filter(function (a) { return a.length; });
    var items = [];
    if (per.length > 1) per.forEach(function (a) { items = items.concat(a); });
    else items = parseBlock(text);
    items.forEach(function (it) { it.desc = items.length > 1 ? (it.rest || '') : text.slice(0, 1000); });   // 여러 건은 건별 나머지 글만 설명으로
    return items;
  }
  function parseText(text) { var a = parseAll(text); return a.length ? a[0] : null; }   // (호환) 첫 일정만

  function ymd2(d) { return ymd(d); }
  function hm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function toTask(it) {
    return { title: it.title || '', content: it.desc || '', warn: it.warn || '', checked: true,
      dueDate: ymd2(it.start), endDate: ymd2(it.end),
      dueTime: it.allDay ? '' : hm(it.start), endTime: it.allDay ? '' : hm(it.end) };
  }
  function openFromText(text) {
    var h = H(); if (!h) return false;
    var items = parseAll(text);
    if (!items.length) return false;
    var first = items[0];
    h.openEventModal(null, first.start, first.allDay ? { allDay: true, endDate: first.end } : undefined);
    buildAi(); $('ev-ai').hidden = false;
    $('ev-ai-text').value = text;
    if (items.length === 1) {
      loadTask(toTask(first));
      setTimeout(function () { var t = $('event-title'); if (t) { t.focus(); t.select(); } }, 50);
    } else {                                // 2건 이상: 항상 목록으로 확인 후 등록
      aiTasks = items.map(toTask);
      renderAiList();
      setTimeout(function () { var f = document.querySelector('#ev-multi .ev-r-title'); if (f) f.focus(); }, 50);
    }
    syncTrack(); snap = snapshot();
    return true;
  }

  /* ═══ 6. 등록 후 이동·강조·실행 취소 ═══════════════════════ */
  function afterCreate(created) {
    created = (created || []).filter(function (c) { return c.id; });
    if (!created.length) return;
    if (window.__aseaPopup) { showDone(); return; }
    created.forEach(function (c) {
      document.querySelectorAll('[data-event-id="' + c.id + '"]').forEach(function (el) {
        el.classList.add('ev-flash');
        setTimeout(function () { el.classList.remove('ev-flash'); }, 2600);
      });
    });
    var box = $('toast-container'); if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast toast-info';
    el.innerHTML = '<span class="ev-undo"><span>일정을 등록했습니다.</span><button type="button" class="ev-undo-btn">실행 취소</button>' +
      (window.__aseaPopup ? '<button type="button" class="ev-all-btn">전체 일정 보기</button>' : '') + '</span>';
    var allBtn = el.querySelector('.ev-all-btn');
    if (allBtn) allBtn.addEventListener('click', function () { window.open(location.origin + location.pathname, '_blank'); });
    box.appendChild(el);
    var timer = setTimeout(rm, window.__aseaPopup ? 12000 : 5000);
    function rm() { clearTimeout(timer); if (el.parentNode) el.parentNode.removeChild(el); }
    el.querySelector('.ev-undo-btn').addEventListener('click', async function () {
      this.disabled = true;
      var h = H(), fail = 0;
      for (var i = 0; i < created.length; i++) {
        try { await CalendarModule.deleteEvent(created[i].calId, created[i].id); } catch (e) { fail++; }
      }
      rm();
      toast(fail ? '일부 일정을 취소하지 못했습니다.' : '등록을 취소했습니다.', fail ? 'error' : 'success');
      if (h) h.renderCalendar();
    });
  }

  /* ═══ 7. API 연결 점등 / 진단 ══════════════════════════════ */
  function aiKey() {
    try {
      if (window.getClaudeConfig) return !!getClaudeConfig().apiKey;
      if (typeof CONFIG !== 'undefined' && CONFIG.anthropicApiKey) return true;
    } catch (e) {}
    return !!lsGet('asea_anthropic_api_key');
  }
  function quickState() {
    var logged = typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn();
    if (!logged) return { c: 'bad', t: 'Google 미연결' };
    if (!aiKey()) return { c: 'warn', t: 'AI 키 없음' };
    return { c: 'ok', t: 'API 연결됨' };
  }
  async function diagnose() {
    var out = [];
    var logged = typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn();
    out.push({ c: logged ? 'ok' : 'bad', t: 'Google 로그인', m: logged ? (email() || '로그인됨') : '로그인이 필요합니다. 다시 로그인하세요.' });
    if (logged) {
      try {
        var cals = await CalendarModule.listCalendars();
        var w = cals.filter(function (c) { return !c.accessRole || c.accessRole === 'owner' || c.accessRole === 'writer'; }).length;
        out.push({ c: 'ok', t: 'Calendar API', m: '캘린더 ' + cals.length + '개 조회, 쓰기 가능 ' + w + '개' });
        var defs = getDefaults(), ids = cals.map(function (c) { return c.id; });
        var lost = defs.filter(function (d) { return ids.indexOf(d.id) === -1; }).length;
        out.push({ c: lost ? 'warn' : 'ok', t: '내 기본 캘린더', m: defs.length ? (lost ? lost + '개가 목록에 없습니다. 기본값을 다시 저장하세요.' : defs.length + '개 정상') : '설정 없음' });
      } catch (e) {
        out.push({ c: 'bad', t: 'Calendar API', m: '호출 실패: ' + (e.message || e) + ' (Google Cloud Console의 승인된 JavaScript 원본 또는 권한 확인)' });
      }
    }
    out.push({ c: aiKey() ? 'ok' : 'warn', t: 'AI(Claude) API 키', m: aiKey() ? '등록됨' : '미등록 — 빠른 등록의 AI 분석만 사용할 수 없습니다.' });
    return out;
  }
  function renderDiag(list, ul) {
    ul.innerHTML = list.map(function (r) {
      return '<li><span class="ev-dot ' + r.c + '"></span><span><b>' + r.t + '</b> · ' + r.m + '</span></li>';
    }).join('');
  }
  var ADMIN_API_EMAIL = 'bangdw@gmail.com';
  function setupQtLed() {
    var m = $('event-modal'); if (!m || m.hidden) return;
    var host = m.querySelector('.modal-title');
    if (!host || $('ev-led')) { refreshLed(); return; }
    var led = document.createElement('button');
    led.type = 'button'; led.id = 'ev-led'; led.className = 'ev-led';
    led.innerHTML = '<i></i><span></span>';
    led.addEventListener('click', async function () {
      var sp = led.querySelector('span'); sp.textContent = '진단 중…';
      var r = await diagnose();
      var bad = r.filter(function (x) { return x.c === 'bad'; }).length, warn = r.filter(function (x) { return x.c === 'warn'; }).length;
      toast(r.map(function (x) { return x.t + ': ' + x.m; }).join(' / '), bad ? 'error' : (warn ? 'info' : 'success'));
      refreshLed();
    });
    host.appendChild(led);
    if (email() === ADMIN_API_EMAIL) {       // 관리자 계정에만 표시 (요청에 따른 고정 값)
      var go = document.createElement('button');
      go.type = 'button'; go.id = 'ev-led-admin'; go.className = 'ev-led ev-led-admin';
      go.innerHTML = '<span>API 설정</span>';
      go.addEventListener('click', function () {
        if (!confirmClose()) return;
        m.hidden = true;
        var tab = document.querySelector('.tab-btn[data-tab="ai-provider"]');
        if (tab) tab.click();
      });
      host.appendChild(go);
    }
    refreshLed();
  }
  function refreshLed() {
    var led = $('ev-led'); if (!led) return;
    var s = quickState();
    led.className = 'ev-led ' + s.c;
    led.querySelector('span').textContent = s.t;
  }
  function setupAdminCard() {
    var box = $('admin-content');
    if (!box || $('ev-diag-card') || !box.children.length || box.querySelector('.loading-state')) return;
    var card = document.createElement('div');
    card.id = 'ev-diag-card'; card.className = 'ev-diag';
    card.innerHTML = '<h3>연결 진단</h3><div style="font-size:12px;color:#6b7280">Google 로그인, Calendar API 쓰기 권한, 내 기본 캘린더, AI 키를 점검합니다.</div>' +
      '<button type="button" class="btn btn-primary btn-sm" style="margin-top:10px">진단 실행</button><ul></ul>';
    var btn = card.querySelector('button'), ul = card.querySelector('ul');
    btn.addEventListener('click', async function () {
      btn.disabled = true; ul.innerHTML = '<li>점검 중…</li>';
      try { renderDiag(await diagnose(), ul); } finally { btn.disabled = false; }
    });
    box.insertBefore(card, box.firstChild);
  }


  /* ═══ 8. AI 분석 패널 (빠른 등록 통합) ═════════════════════ */
  var aiImg = null, aiTasks = [];
  css.textContent +=
    '.ev-ai{margin-bottom:12px}.ev-ai-body{margin-top:8px;padding:10px;border:1px dashed var(--color-border,#cbd5e1);border-radius:12px;background:var(--primary-lt,#E8F0FE)}' +
    '.ev-ai-body textarea{width:100%;box-sizing:border-box;margin-bottom:6px}' +
    '.ev-ai-img{display:flex;align-items:center;gap:8px;font-size:11px;margin-bottom:6px}.ev-ai-img img{max-height:60px;border-radius:8px}' +
    '.ev-ai-row{display:flex;align-items:center;gap:8px;padding:6px 8px;margin-top:6px;border-radius:8px;background:var(--color-card,#fff);font-size:12px}' +
    '.ev-r-dt{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:4px}.ev-r-dt input{padding:2px 4px;font-size:12px;border:1px solid var(--color-border,#cbd5e1);border-radius:8px}.ev-warn{color:#dc2626;font-size:11px}.ev-ai-row .t{flex:1;min-width:0}.ev-ai-row .t b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ev-ai-row .t span{color:var(--color-text-muted,#6b7280)}';

  function buildAi() {
    var body = document.querySelector('#event-modal .modal-body');
    if (!body || $('ev-ai')) return;
    var box = document.createElement('div');
    box.id = 'ev-ai'; box.className = 'ev-ai';
    box.innerHTML = '<button type="button" id="ev-ai-toggle" class="btn btn-secondary btn-sm">AI 분석 · 붙여넣기</button>' +
      '<div id="ev-ai-body" class="ev-ai-body" hidden>' +
      '<textarea id="ev-ai-text" class="form-textarea" rows="3" placeholder="텍스트를 붙여넣거나 이미지를 Ctrl+V 로 붙여넣으세요 (예: 6월 10일 오후 2시 부서 회의)"></textarea>' +
      '<div id="ev-ai-img" class="ev-ai-img" hidden></div>' +
      '<div class="ev-ext-row"><button type="button" id="ev-ai-run" class="btn btn-primary btn-sm">AI 분석</button>' +
      '<span>결과가 1건이면 아래 입력란에 자동 입력됩니다.</span></div><div id="ev-ai-list"></div></div>';
    body.insertBefore(box, body.querySelector('.form-group'));
    var mc = document.createElement('div'); mc.id = 'ev-multi'; box.after(mc);
    $('ev-ai-toggle').addEventListener('click', function () { setAiOpen($('ev-ai-body').hidden); });
    $('ev-ai-run').addEventListener('click', runAi);
    $('ev-ai-text').addEventListener('paste', function (e) {
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') === 0) {
          var f = items[i].getAsFile(), rd = new FileReader();
          rd.onload = function () { aiImg = rd.result; showAiImg(); };
          rd.readAsDataURL(f); e.preventDefault(); return;
        }
      }
    });
  }
  function setAiOpen(on) { var b = $('ev-ai-body'); if (b) b.hidden = !on; }
  function showAiImg() {
    var el = $('ev-ai-img'); if (!el) return;
    el.hidden = !aiImg;
    el.innerHTML = aiImg ? '<img src="' + aiImg + '" alt="붙여넣은 이미지"><button type="button" class="btn btn-ghost btn-sm">제거</button>' : '';
    var b = el.querySelector('button'); if (b) b.addEventListener('click', function () { aiImg = null; showAiImg(); });
  }
  function aiReset(isEdit) {
    buildAi();
    var box = $('ev-ai'); if (!box) return;
    box.hidden = !!isEdit;
    aiImg = null; aiTasks = []; showAiImg(); exitMulti();
    $('ev-ai-text').value = ''; $('ev-ai-list').innerHTML = ''; setAiOpen(false);
  }
  function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  async function runAi() {
    var text = $('ev-ai-text').value.trim();
    if (!text && !aiImg) { toast('분석할 텍스트나 이미지를 붙여넣으세요.', 'warning'); return; }
    if (!aiKey()) { toast('AI API 키가 없습니다. 관리자에게 AI제공자 설정을 요청하세요.', 'error'); return; }
    if (typeof QuickTaskModule === 'undefined' || !QuickTaskModule.extract) { toast('AI 분석 모듈을 불러오지 못했습니다.', 'error'); return; }
    var btn = $('ev-ai-run'); btn.disabled = true; btn.textContent = '분석 중…';
    try {
      aiTasks = (await QuickTaskModule.extract(text, aiImg)).map(function (t) { t.checked = true; return t; });
      renderAiList();
      if (aiTasks.length === 1) loadTask(aiTasks[0]);
    } finally { btn.disabled = false; btn.textContent = 'AI 분석'; }
  }
  /* ── 복수 일정 화면: 단일 입력란을 숨기고 건별 목록(제목·시작·종료·하루 종일)만 표시, 반복 없음 고정 ── */
  var multiActive = false;
  css.textContent +=
    '.ev-hide-multi{display:none!important}' +
    '.ev-mhead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:13px}.ev-mhead span{color:var(--color-text-muted,#6b7280);font-size:12px}' +
    '.ev-mhead details{font-size:12px}.ev-mhead pre{white-space:pre-wrap;margin:4px 0 0;padding:6px 8px;background:var(--color-bg,#f3f4f6);border-radius:8px;max-width:100%}' +
    '.ev-mrow{padding:8px 10px;margin-bottom:8px;border:1px solid var(--color-border,#e5e7eb);border-radius:12px;background:var(--color-card,#fff)}' +
    '.ev-mtop{display:flex;align-items:center;gap:6px}.ev-mn{width:18px;color:var(--color-text-muted,#6b7280);font-size:11px;text-align:center}' +
    '.ev-mtop .form-input{flex:1;min-width:0}.ev-mrow.ev-bad .ev-r-title{border-color:#dc2626;background:#fef2f2}' +
    '.ev-mdel{border:0;background:transparent;cursor:pointer;font-size:18px;line-height:1;color:var(--color-text-muted,#6b7280);padding:2px 6px;border-radius:8px}.ev-mdel:hover{background:var(--primary-lt,#E8F0FE);color:#dc2626}' +
    '.ev-ad{display:inline-flex;align-items:center;gap:4px;font-size:12px;cursor:pointer}';

  function multiNodes() {
    var n = function (id, sel) { var e = $(id); return e ? (sel ? e.closest(sel) : e) : null; };
    return [n('event-title', '.form-group'), n('event-allday', 'label'), n('event-start', '.form-row'), n('event-description', '.form-group'), n('recur-section')];
  }
  function enterMulti() {
    if (!multiActive) {
      multiActive = true;
      multiNodes().forEach(function (e) { if (e) e.classList.add('ev-hide-multi'); });
      var rt = $('event-recur-type');
      if (rt) { rt.value = 'none'; rt.dispatchEvent(new Event('change', { bubbles: true })); rt.disabled = true; }
    }
    $('save-event-btn').textContent = aiTasks.length + '건 등록';
  }
  function exitMulti() {
    var mc = $('ev-multi'); if (mc) mc.innerHTML = '';
    if (!multiActive) return;
    multiActive = false;
    multiNodes().forEach(function (e) { if (e) e.classList.remove('ev-hide-multi'); });
    var rt = $('event-recur-type'); if (rt) rt.disabled = false;
    var sb = $('save-event-btn'); if (sb) sb.textContent = '저장';
  }
  css.textContent +=
    '.ev-mrow{padding:14px 16px 6px;margin-bottom:14px;border:1px solid var(--color-border,#e5e7eb);border-radius:12px;background:var(--color-card,#fff)}' +
    '.ev-mhd{display:flex;align-items:center;gap:8px;margin-bottom:10px}.ev-mhd b{font-size:14px}.ev-mhd .ev-warn{margin-left:2px}.ev-mhd .ev-mdel{margin-left:auto}' +
    '.ev-mrow .form-group{margin-bottom:12px}.ev-mrow .form-input{width:100%;box-sizing:border-box}.ev-mrow .form-row{margin-bottom:4px}' +
    '.ev-mrow .ev-ad{margin:0 0 10px;font-weight:500;font-size:14px}.ev-mrow.ev-bad .ev-r-title{border-color:#dc2626;background:#fef2f2}' +
    '.ev-mcommon{margin-bottom:14px}.ev-mhead{font-size:14px}';
  function dtVal(d, tm) { return tm ? d + 'T' + tm : d; }
  function renderAiList() {
    var mc = $('ev-multi'); if (!mc) return;
    if (!aiTasks.length || (aiTasks.length < 2 && !multiActive)) { exitMulti(); return; }
    enterMulti();
    var src = ($('ev-ai-text') || {}).value || '';
    mc.innerHTML = '<div class="ev-mhead ev-mcommon"><b>일정 ' + aiTasks.length + '건 감지</b><span>반복 없음으로 등록됩니다</span>' +
      (src ? '<details><summary>원문 보기</summary><pre>' + esc(src) + '</pre></details>' : '') + '</div>' +
      '<div class="form-group ev-mcommon"><label class="form-label" for="ev-r-all">공통 제목</label>' +
      '<input id="ev-r-all" class="form-input" placeholder="입력하면 모든 일정의 제목이 한 번에 채워집니다"></div>' +
      aiTasks.map(function (t, i) {
        var ad = !t.dueTime, ed = t.endDate || t.dueDate, tp = ad ? 'date' : 'datetime-local';
        return '<div class="ev-mrow" data-i="' + i + '"><div class="ev-mhd"><b>일정 ' + (i + 1) + '</b>' +
          (t.warn ? '<span class="ev-warn">' + esc(t.warn) + '</span>' : '') +
          '<button type="button" class="ev-mdel" title="이 일정 삭제" aria-label="이 일정 삭제">×</button></div>' +
          '<div class="form-group"><label class="form-label">제목 <span class="required">*</span></label>' +
          '<input class="form-input ev-r-title" data-f="title" placeholder="일정 제목을 입력하세요" value="' + esc(t.title) + '"></div>' +
          '<label class="form-label ev-ad"><input type="checkbox" data-f="allday" style="width:16px;height:16px;cursor:pointer"' + (ad ? ' checked' : '') + '> 하루 종일</label>' +
          '<div class="form-row"><div class="form-group"><label class="form-label">시작 <span class="required">*</span></label>' +
          '<input type="' + tp + '" class="form-input" data-f="start" value="' + esc(dtVal(t.dueDate, t.dueTime)) + '"></div>' +
          '<div class="form-group"><label class="form-label">종료 <span class="required">*</span></label>' +
          '<input type="' + tp + '" class="form-input" data-f="end" value="' + esc(dtVal(ed, t.endTime)) + '"></div></div></div>';
      }).join('') +
      '<div class="ev-ext-row" style="margin-bottom:12px"><span>Tab 이동 · Enter 다음 일정 · Ctrl+↑/↓ 일정 이동 · Ctrl+Enter 등록 · 하단 "' + aiTasks.length + '건 등록" 버튼</span></div>';
    mc.querySelectorAll('.ev-mrow').forEach(function (row) {
      var T = function () { return aiTasks[+row.dataset.i]; };
      var sIn = row.querySelector('[data-f=start]'), eIn = row.querySelector('[data-f=end]');
      function parse(v) { return v ? new Date(v.length === 10 ? v + 'T00:00:00' : v) : null; }
      row.querySelector('.ev-mdel').addEventListener('click', function () {
        aiTasks.splice(+row.dataset.i, 1);
        if (aiTasks.length === 1) { loadTask(aiTasks[0]); aiTasks = []; exitMulti(); } else renderAiList();
      });
      row.querySelector('[data-f=title]').addEventListener('input', function () { T().title = this.value; row.classList.remove('ev-bad'); });
      row.querySelector('[data-f=allday]').addEventListener('change', function () {
        var t = T(), sd = (sIn.value || t.dueDate || '').slice(0, 10), ed = (eIn.value || sd).slice(0, 10);
        if (this.checked) {
          t.dueDate = sd; t.endDate = ed; t.dueTime = t.endTime = '';
          sIn.type = eIn.type = 'date'; sIn.value = sd; eIn.value = ed;
        } else {
          t.dueDate = sd; t.endDate = ed; t.dueTime = '09:00'; t.endTime = '10:00';
          sIn.type = eIn.type = 'datetime-local'; sIn.value = sd + 'T09:00'; eIn.value = ed + 'T10:00';
        }
      });
      sIn.addEventListener('input', function () {      // 시작을 바꾸면 종료도 같은 길이만큼 이동(단건과 동일)
        var t = T(), ad = sIn.type === 'date', oldS = parse(dtVal(t.dueDate, t.dueTime)), oldE = parse(dtVal(t.endDate || t.dueDate, t.endTime)), nv = sIn.value;
        if (!nv) return;
        var ns = parse(nv), len = (oldS && oldE && oldE >= oldS) ? oldE - oldS : (ad ? 0 : 3600000);
        t.dueDate = nv.slice(0, 10); t.dueTime = ad ? '' : nv.slice(11, 16);
        var ne = new Date(ns.getTime() + len), ev = ad ? ymd(ne) : toLocal(ne);
        t.endDate = ev.slice(0, 10); t.endTime = ad ? '' : ev.slice(11, 16); eIn.value = ev;
      });
      eIn.addEventListener('input', function () {
        var t = T(), nv = eIn.value; if (!nv) return;
        t.endDate = nv.slice(0, 10); t.endTime = eIn.type === 'date' ? '' : nv.slice(11, 16);
      });
      row.querySelectorAll('[data-f]').forEach(function (inp) {
        inp.addEventListener('keydown', function (e) {
          if (e.isComposing || e.keyCode === 229) return;
          if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); bulkAi(); return; }
          var f = inp.dataset.f;
          if (f === 'allday') return;
          var dir = (e.ctrlKey && e.key === 'ArrowUp') ? -1 : (e.ctrlKey && e.key === 'ArrowDown') ? 1 : (e.key === 'Enter' ? 1 : 0);
          if (!dir) return;
          e.preventDefault();
          var nx = mc.querySelectorAll('.ev-mrow')[+row.dataset.i + dir];
          var nf = nx && nx.querySelector('[data-f="' + f + '"]');
          if (nf) { nf.focus(); if (nf.select) try { nf.select(); } catch (x) {} }
        });
      });
    });
    $('ev-r-all').addEventListener('input', function () {
      var v = this.value; aiTasks.forEach(function (t, i) { t.title = v; mc.querySelectorAll('.ev-r-title')[i].value = v; });
      mc.querySelectorAll('.ev-mrow').forEach(function (r) { if (v) r.classList.remove('ev-bad'); });
    });
  }
  function taskBody(t, dept, tz) {
    var body = { summary: t.title || '(제목 없음)', description: (t.content ? t.content + '\n' : '') + '[부서:' + dept + ']' };
    var ed = t.endDate || t.dueDate;
    if (t.dueTime) {
      var st = t.dueDate + 'T' + t.dueTime, e2 = ed + 'T' + (t.endTime || t.dueTime);
      if (e2 <= st) e2 = toLocal(new Date(new Date(st).getTime() + 3600000));
      body.start = { dateTime: new Date(st).toISOString(), timeZone: tz }; body.end = { dateTime: new Date(e2).toISOString(), timeZone: tz };
    } else {
      var nx = new Date(ed + 'T00:00:00'); nx.setDate(nx.getDate() + 1);
      body.start = { date: t.dueDate }; body.end = { date: ymd(nx) };
    }
    return body;
  }
  function loadTask(t) {
    $('event-title').value = t.title || '';
    $('event-description').value = t.content || '';
    var cb = $('event-allday'), s = $('event-start'), en = $('event-end');
    if (t.dueDate) {
      var allDay = !t.dueTime, ed = t.endDate || t.dueDate;
      cb.checked = allDay; cb.dispatchEvent(new Event('change', { bubbles: true }));
      if (allDay) { s.value = t.dueDate; en.value = ed; }
      else {
        var st = t.dueDate + 'T' + t.dueTime;
        var e2 = ed + 'T' + (t.endTime || '');
        if (!t.endTime) e2 = toLocal(new Date(new Date(st).getTime() + 3600000));
        if (e2 <= st) e2 = toLocal(new Date(new Date(st).getTime() + 3600000));
        s.value = st; en.value = e2;
      }
    }
    syncTrack(); snap = snapshot();
    var tt = $('event-title'); if (tt) tt.focus();
  }
  async function bulkAi() {
    var h = H(); if (!h || !aiTasks.length) return;
    var rows = document.querySelectorAll('#ev-multi .ev-mrow'), bad = -1;
    aiTasks.forEach(function (t, i) {                       // 제목 필수 · 날짜 필수
      var miss = !String(t.title || '').trim() || !t.dueDate;
      if (rows[i]) rows[i].classList.toggle('ev-bad', miss);
      if (miss && bad < 0) bad = i;
    });
    if (bad >= 0) {
      toast('제목과 날짜가 비어 있는 일정이 있습니다. 빨간 칸을 채워 주세요.', 'error');
      var ff = rows[bad] && rows[bad].querySelector(String(aiTasks[bad].title || '').trim() ? '[data-f=start]' : '.ev-r-title'); if (ff) ff.focus();
      return;
    }
    var cals = (h.S.editCalendars || []).filter(function (c) { return c.on !== false; }).map(function (c) { return c.id; });
    if (!cals.length) { try { cals = [CONFIG.calendarId]; } catch (e) {} }
    if (!cals.length || !cals[0]) { toast('등록할 캘린더를 체크하세요.', 'error'); return; }
    var dept = $('event-dept') ? $('event-dept').value : '기타';
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
    var sb = $('save-event-btn'); sb.disabled = true;
    var ok = 0, fail = 0, created = [], remain = [];
    for (var i = 0; i < aiTasks.length; i++) {
      var body = taskBody(aiTasks[i], dept, tz), good = true;
      for (var c = 0; c < cals.length; c++) {
        try { var r = await CalendarModule.createEvent(cals[c], body); created.push({ calId: cals[c], id: r && r.id }); } catch (e) { good = false; }
      }
      if (good) ok++; else { fail++; remain.push(aiTasks[i]); }
    }
    sb.disabled = false;
    aiTasks = remain;
    toast(ok + '건 등록' + (fail ? ', ' + fail + '건 실패(목록에 남김)' : ''), fail ? 'error' : 'success');
    if (ok) { h.renderCalendar(); afterCreate(created); }
    if (fail) { renderAiList(); return; }
    exitMulti();
    $('event-modal').hidden = true;
  }
  function openAi(text, auto) {
    var h = H(); if (!h) return false;
    var m = $('event-modal');
    if (m.hidden || !isNew()) h.openEventModal(null, new Date());
    buildAi(); $('ev-ai').hidden = false; setAiOpen(true);
    var ta = $('ev-ai-text');
    if (text) ta.value = text;
    ta.focus();
    if (text && auto && aiKey()) runAi();
    return true;
  }

  /* 캘린더 칩 드래그로 순서 변경 */
  function initChipDrag() {
    var list = $('event-cal-chip-list'); if (!list) return;
    var from = -1;
    function chips() { return [].slice.call(list.querySelectorAll('.qt-cal-chip')); }
    new MutationObserver(function () { chips().forEach(function (c) { c.draggable = true; }); }).observe(list, { childList: true });
    list.addEventListener('dragstart', function (e) {
      var c = e.target.closest('.qt-cal-chip'); if (!c) return;
      from = chips().indexOf(c);
      try { e.dataTransfer.setData('text/plain', 'chip'); } catch (x) {}
    });
    list.addEventListener('dragover', function (e) { if (from >= 0) e.preventDefault(); });
    list.addEventListener('drop', function (e) {
      var c = e.target.closest('.qt-cal-chip'); if (!c || from < 0) return;
      e.preventDefault();
      var to = chips().indexOf(c), h = H(), a = h.S.editCalendars;
      if (to >= 0 && to !== from) { a.splice(to, 0, a.splice(from, 1)[0]); h.renderChips(); }
      from = -1;
    });
    list.addEventListener('dragend', function () { from = -1; });
  }


  /* ═══ 9. 팝업 모드(AHK/확장으로 연 작은 창): 일정창만 표시, 저장 후 확인창, Esc로 창 닫기 ═══ */
  css.textContent +=
    'body.ev-popup{overflow:hidden}body.ev-popup #app{visibility:hidden}' +
    'body.ev-popup #event-modal,body.ev-popup #event-modal *,body.ev-popup #toast-container,body.ev-popup #toast-container *{visibility:visible}' +
    'body.ev-popup #event-modal{padding:0!important;align-items:stretch!important}' +
    'body.ev-popup #event-modal .modal-backdrop{background:transparent!important}' +
    'body.ev-popup #event-modal .modal-dialog{width:100%!important;max-width:none!important;max-height:100vh!important;height:100vh;border-radius:0!important;box-shadow:none!important}' +
    'body.ev-popup #event-modal .modal-header{border-radius:0!important}' +
    '#ev-done{position:fixed;inset:0;z-index:3000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)}' +
    '#ev-done .box{background:var(--color-card,#fff);border-radius:12px;padding:22px 24px;min-width:280px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.3)}' +
    '#ev-done p{margin:0 0 6px;font-size:14px}#ev-done .btns{display:flex;gap:8px;justify-content:center;margin-top:16px}';

  function closePopup() {
    try { window.close(); } catch (e) {}
    setTimeout(function () {            // 브라우저 정책상 닫히지 않으면 일반 화면으로 전환하고 안내
      document.body.classList.remove('ev-popup'); window.__aseaPopup = false;
      try { sessionStorage.removeItem('asea_popup'); } catch (e) {}
      toast('창이 자동으로 닫히지 않았습니다. 직접 닫아 주세요(Alt+F4).', 'info');
    }, 500);
  }
  function showDone() {
    if ($('ev-done')) return;
    window.__evDoneShowing = true;
    var o = document.createElement('div');
    o.id = 'ev-done'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
    o.innerHTML = '<div class="box"><p>일정을 등록했습니다.</p><p><b>캘린더를 보시겠습니까?</b></p>' +
      '<div class="btns"><button type="button" id="ev-done-ok" class="btn btn-primary">확인</button><button type="button" id="ev-done-no" class="btn btn-ghost">취소</button></div></div>';
    document.body.appendChild(o);
    function finish(openCal) {
      document.removeEventListener('keydown', onKey, true);
      o.remove(); window.__evDoneShowing = false;
      if (openCal) window.open(location.origin + location.pathname, '_blank');
      closePopup();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(false); }
      else if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault(); e.stopImmediatePropagation();
        finish(document.activeElement !== $('ev-done-no'));
      }
    }
    document.addEventListener('keydown', onKey, true);
    $('ev-done-ok').addEventListener('click', function () { finish(true); });
    $('ev-done-no').addEventListener('click', function () { finish(false); });
    $('ev-done-ok').focus();
  }
  function initPopup() {
    if (!window.__aseaPopup) return;
    document.body.classList.add('ev-popup');
    var em = $('event-modal'); if (!em) return;
    new MutationObserver(function () {   // ✕·취소·Esc로 일정창이 닫히면 팝업 창도 닫음 (저장 직후는 확인창이 처리)
      if (!em.hidden) return;
      setTimeout(function () {
        var h = H();
        if (!em.hidden || window.__evDoneShowing || (h && h.S._justCreated)) return;
        closePopup();
      }, 200);
    }).observe(em, { attributes: true, attributeFilter: ['hidden'] });
  }

  /* ═══ 공개 API / 초기화 ═══════════════════════════════════ */
  window.EventExt = {
    onOpen: function (isEdit) {
      setupFloat(true);
      syncTrack();
      snap = snapshot();
      var cb = $('ev-magnet'); if (cb) cb.checked = magnetOn();
      refreshDefLabel();
      setupQtLed();
      aiReset(isEdit);
      if (!isEdit) applyDefaults();
    },
    afterCreate: afterCreate,
    openFromText: openFromText,
    openAi: openAi,
    parseText: parseText,
    parseAll: parseAll,
    diagnose: diagnose,
  };

  function init() {
    initPopup(); initMultiSave(); initDefaultsUI(); buildAi(); initChipDrag(); initDrag(); initNoAutoClose(); initCellPick(); initAutoEnd(); initEnterSave();
    var em = $('event-modal');
    if (em) new MutationObserver(function () { if (em.hidden) { em.classList.remove('ev-float'); } }).observe(em, { attributes: true, attributeFilter: ['hidden'] });
    var ta = $('tab-admin');
    if (ta) new MutationObserver(setupAdminCard).observe(ta, { childList: true, subtree: true });
  }
  window.addEventListener('asea-prefs-synced', function (e) {   // 다른 기기에서 저장한 설정이 도착
    var ks = (e && e.detail) || [], h = H();
    refreshDefLabel();
    var cb = $('ev-magnet'); if (cb) cb.checked = magnetOn();
    if (ks.indexOf('order') >= 0 && h) h.renderCalendar();
    if (ks.indexOf('defcals') >= 0 && h && isNew() && !$('event-modal').hidden && !h.S.editCalendars.length) applyDefaults();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
