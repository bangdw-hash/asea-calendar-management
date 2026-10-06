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
    var on = open && !isMobile();
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
    }
    hdr.addEventListener('pointerup', end);
    hdr.addEventListener('pointercancel', end);
    hdr.addEventListener('dblclick', function (e) {
      if (e.target.closest('.modal-close')) return;
      pos = { x: 0, y: 0 }; applyPos(); lsSet(posKey(), JSON.stringify(pos));
    });
    window.addEventListener('resize', function () { if (m.classList.contains('ev-float')) clampToViewport(); });
  }

  /* 플로팅 모드: 모달 안쪽 빈 영역/헤더 클릭(드래그 직후 포함)이 gestures.js의 '빈 곳 클릭 시 닫기'로 번지지 않게 차단 */
  function initNoAutoClose() {
    var m = $('event-modal'); if (!m) return;
    var CONTROL = 'input,textarea,select,button,a,label,[contenteditable],.event-cal-chip,.qt-cal-chip,.chip,.form-input,[data-close-modal],.modal-close';
    m.addEventListener('click', function (e) {
      if (!m.classList.contains('ev-float')) return;
      if (e.target.closest('.modal-dialog') && !e.target.closest(CONTROL)) e.stopPropagation();
    }, true);
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
    var list = (h.S.editCalendars || []).map(function (c) { return { id: c.id, name: c.name, color: c.color }; });
    var obj = { t: Date.now(), list: list };
    lsSet(defKey(), JSON.stringify(obj));
    try { if (typeof CONFIG !== 'undefined') CONFIG.eventDefaultCals = obj; } catch (e) {}
    h.saveCloud(true);
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
    h.S.editCalendars = ok;
    h.renderChips();
    if (miss) toast('기본 캘린더 ' + miss + '개는 삭제되었거나 권한이 없어 제외했습니다.', 'info');
  }
  function initDefaultsUI() {
    var clr = $('event-cal-clear-btn');
    if (!clr || $('ev-def-save')) return;
    var save = document.createElement('button');
    save.type = 'button'; save.id = 'ev-def-save'; save.className = 'btn btn-ghost btn-sm';
    save.style.fontSize = '11px'; save.textContent = '현재 선택을 내 기본값으로 저장';
    save.addEventListener('click', saveDefaults);
    clr.parentNode.insertBefore(save, clr.nextSibling);
    var row = document.createElement('div');
    row.className = 'ev-ext-row';
    row.innerHTML = '<span id="ev-def-label"></span>' +
      '<label><input type="checkbox" id="ev-magnet"> 창 자석 맞춤</label>' +
      '<span>헤더 더블클릭: 중앙 복귀</span>';
    var chips = $('event-cal-chip-list');
    chips.parentNode.insertBefore(row, chips.nextSibling);
    var cb = $('ev-magnet');
    cb.addEventListener('change', function () { lsSet(magnetKey(), cb.checked ? '1' : '0'); });
  }

  /* ═══ 5. 선택 텍스트 → 일정 파싱 ═══════════════════════════ */
  var DATE_RE = /(?:(\d{4})\s*[.\-\/년]\s*)?(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})\s*일?\.?/g;
  var TIME_RE = /(오전|오후|AM|PM|am|pm)?\s*(\d{1,2})\s*(?::\s*(\d{2})|시\s*(?:(\d{1,2})\s*분)?)/g;
  function parseText(text) {
    text = String(text || '');
    var now = new Date(), used = [], m;
    var dates = [], times = [];
    DATE_RE.lastIndex = 0;
    while ((m = DATE_RE.exec(text))) {
      var y = m[1] ? +m[1] : now.getFullYear(), mo = +m[2], da = +m[3];
      if (mo < 1 || mo > 12 || da < 1 || da > 31) continue;
      var d = new Date(y, mo - 1, da);
      if (d.getMonth() !== mo - 1) continue;
      dates.push({ i: m.index, d: d }); used.push([m.index, m.index + m[0].length]);
    }
    TIME_RE.lastIndex = 0;
    while ((m = TIME_RE.exec(text))) {
      var h = +m[2], mi = +(m[3] || m[4] || 0);
      if (h > 24 || mi > 59) continue;
      if (m[1]) {
        var p = m[1].toLowerCase();
        if ((p === '오후' || p === 'pm') && h < 12) h += 12;
        if ((p === '오전' || p === 'am') && h === 12) h = 0;
      }
      times.push({ i: m.index, h: h % 24, mi: mi }); used.push([m.index, m.index + m[0].length]);
    }
    if (!dates.length) return null;
    var sd = dates[0].d, ed = dates[1] ? dates[1].d : null;
    var st = times[0] || null, et = times[1] || null;
    // "날짜1 시간1 ~ 날짜2 시간2" 형태에서 시간을 가까운 날짜에 귀속
    if (dates[1] && times.length === 1 && times[0].i > dates[1].i) { st = null; et = times[0]; }
    var res = { allDay: !st && !et };
    if (res.allDay) {
      res.start = sd; res.end = ed && ed >= sd ? ed : sd;
    } else {
      var s = new Date(sd); s.setHours(st ? st.h : 9, st ? st.mi : 0, 0, 0);
      var e;
      if (et) { e = new Date(ed || sd); e.setHours(et.h, et.mi, 0, 0); if (e <= s) e = new Date(e.getTime() + (ed ? 0 : 864e5)); }
      if (!e || e <= s) e = new Date(s.getTime() + 3600000);     // 종료 없음 → 기본 1시간
      res.start = s; res.end = e;
    }
    // 제목 = 날짜·시간 표기를 제거한 나머지 첫 줄
    var rest = text, spans = used.slice().sort(function (a, b) { return b[0] - a[0]; });
    spans.forEach(function (r) { rest = rest.slice(0, r[0]) + ' ' + rest.slice(r[1]); });
    var line = rest.split(/\r?\n/).map(function (l) { return l.replace(/[~\-–—]+/g, ' ').replace(/\s+/g, ' ').trim(); })
      .filter(Boolean)[0] || '';
    res.title = line.replace(/^[\s,.:;()\[\]]+|[\s,.:;]+$/g, '').slice(0, 80);
    res.desc = text.trim();
    return res;
  }
  function openFromText(text) {
    var h = H(); if (!h) return false;
    var r = parseText(text);
    if (!r) return false;
    h.openEventModal(null, r.start, r.allDay ? { allDay: true, endDate: r.end } : undefined);
    $('event-title').value = r.title;
    $('event-description').value = r.desc;
    if (!r.allDay) { $('event-start').value = toLocal(r.start); $('event-end').value = toLocal(r.end); }
    syncTrack();
    setTimeout(function () { var t = $('event-title'); if (t) { t.focus(); t.select(); } }, 50);
    return true;
  }

  /* ═══ 6. 등록 후 이동·강조·실행 취소 ═══════════════════════ */
  function afterCreate(created) {
    created = (created || []).filter(function (c) { return c.id; });
    if (!created.length) return;
    created.forEach(function (c) {
      document.querySelectorAll('[data-event-id="' + c.id + '"]').forEach(function (el) {
        el.classList.add('ev-flash');
        setTimeout(function () { el.classList.remove('ev-flash'); }, 2600);
      });
    });
    var box = $('toast-container'); if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast toast-info';
    el.innerHTML = '<span class="ev-undo"><span>일정을 등록했습니다.</span><button type="button">실행 취소</button></span>';
    box.appendChild(el);
    var timer = setTimeout(rm, 5000);
    function rm() { clearTimeout(timer); if (el.parentNode) el.parentNode.removeChild(el); }
    el.querySelector('button').addEventListener('click', async function () {
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
    var m = $('qt-modal'); if (!m || m.hidden) return;
    var host = m.querySelector('.modal-title');
    if (!host || $('ev-led')) { refreshLed(); return; }
    var led = document.createElement('button');
    led.type = 'button'; led.id = 'ev-led'; led.className = 'ev-led';
    led.innerHTML = '<i></i><span></span>';
    led.addEventListener('click', async function () {
      var s = led.querySelector('span'); s.textContent = '진단 중…';
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

  /* ═══ 공개 API / 초기화 ═══════════════════════════════════ */
  window.EventExt = {
    onOpen: function (isEdit) {
      setupFloat(true);
      syncTrack();
      var cb = $('ev-magnet'); if (cb) cb.checked = magnetOn();
      refreshDefLabel();
      if (!isEdit) applyDefaults();
    },
    afterCreate: afterCreate,
    openFromText: openFromText,
    parseText: parseText,
    diagnose: diagnose,
  };

  function init() {
    initDefaultsUI(); initDrag(); initNoAutoClose(); initCellPick(); initAutoEnd(); initEnterSave();
    var em = $('event-modal');
    if (em) new MutationObserver(function () { if (em.hidden) { em.classList.remove('ev-float'); } }).observe(em, { attributes: true, attributeFilter: ['hidden'] });
    var qt = $('qt-modal');
    if (qt) new MutationObserver(setupQtLed).observe(qt, { attributes: true, attributeFilter: ['hidden'] });
    var ta = $('tab-admin');
    if (ta) new MutationObserver(setupAdminCard).observe(ta, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
