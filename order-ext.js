'use strict';
/* order-ext.js — 계정별 표시 순서(부서 머릿말 순서 / 캘린더 순서)
   · "아세아 업무일정" 캘린더의 같은 날 일정은 제목 머릿말 [부서] 순서로 우선 정렬
   · 캘린더 순서는 범례·일정 정렬에 반영, 툴바 "순서" 팝업에서 개인별 수정
   · 저장: localStorage + Google Drive 설정 동기화(CONFIG.eventOrder) — 계정별
   의존: window.EventHooks (app.js) */
(function () {
  var DEFAULT_DEPT = ['기획', '교육', '행정', '입학', '정비', '안전', '관광', '보안', '국방', '기종', '비행', '무인', '직능'];
  var ASEA_CAL = /아세아\s*업무일정/;

  function $(id) { return document.getElementById(id); }
  function H() { return window.EventHooks; }
  function email() {
    var h = H(), e = (h && h.S && h.S.userEmail) || '';
    if (!e) { try { e = localStorage.getItem('asea_user_email') || ''; } catch (x) {} }
    return String(e).trim().toLowerCase();
  }
  function key() { return 'asea_order:' + email(); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ── 저장소 ─────────────────────────────────────────────── */
  var cache = null, cacheEmail = '';
  function get() {
    var em = email();
    var cloud = null, loc = null;
    try { if (typeof CONFIG !== 'undefined') cloud = CONFIG.eventOrder || null; } catch (e) {}
    try { loc = JSON.parse(lsGet(key()) || 'null'); } catch (e) {}
    var best = (cloud && (!loc || (cloud.t || 0) > (loc.t || 0))) ? cloud : loc;
    if (!best) best = { t: 0, dept: DEFAULT_DEPT.slice(), cals: [] };
    if (cache && cacheEmail === em && cache.t === best.t) return cache;
    cache = { t: best.t || 0, dept: (best.dept && best.dept.length ? best.dept : DEFAULT_DEPT).slice(), cals: (best.cals || []).slice() };
    cacheEmail = em;
    return cache;
  }
  function save(o) {
    o.t = Date.now();
    lsSet(key(), JSON.stringify(o));
    try { if (typeof CONFIG !== 'undefined') CONFIG.eventOrder = o; } catch (e) {}
    cache = null;
    var h = H(); if (h) h.saveCloud(true);
    if (window.PrefsSync) PrefsSync.push('order');
  }

  /* ── 정렬 비교 ──────────────────────────────────────────── */
  function calRank(ev, o) {
    var i = o.cals.indexOf(ev._calId);
    return i < 0 ? 999 : i;
  }
  function deptOf(ev) {
    var m = /^\s*\[([^\]]+)\]/.exec(ev.summary || '');
    return m ? m[1].split(/[\/,·\s]/)[0].trim() : '';
  }
  function deptRank(ev, o) {
    var d = deptOf(ev);
    var i = d ? o.dept.indexOf(d) : -1;
    return i < 0 ? 999 : i;
  }
  function deptKey(ev, o) { return ASEA_CAL.test(ev._calName || '') ? deptRank(ev, o) : 0; }   // 아세아 업무일정만 부서 순서, 그 외는 동순위(시간순 유지)
  function cmp(a, b) {
    var o = get();
    if (o.cals.length) { var c = calRank(a, o) - calRank(b, o); if (c) return c; }
    return deptKey(a, o) - deptKey(b, o);
  }
  function sortCals(list) {
    var o = get();
    if (!o.cals.length) return list;
    return list.map(function (c, i) { return { c: c, i: i }; }).sort(function (x, y) {
      var rx = o.cals.indexOf(x.c.id), ry = o.cals.indexOf(y.c.id);
      rx = rx < 0 ? 999 : rx; ry = ry < 0 ? 999 : ry;
      return (rx - ry) || (x.i - y.i);
    }).map(function (x) { return x.c; });
  }
  function setCalOrder(ids) {      // 기본 캘린더 저장 시 선택 순서를 앞쪽에 기억, 나머지는 기존 순서 유지
    var o = get();
    var rest = o.cals.filter(function (id) { return ids.indexOf(id) < 0; });
    o.cals = ids.concat(rest);
    save(o);
  }

  /* ── 스타일 ─────────────────────────────────────────────── */
  var css = document.createElement('style');
  css.textContent =
    /* 달력: 일정 많은 주는 자동 확장, 비어 있는 주는 최소 높이 */
    '.calendar-day{min-height:calc(52px + var(--num-tracks,0)*22px)!important}' +
    '@media (max-width:768px){.calendar-day{min-height:calc(44px + var(--num-tracks,0)*18px)!important}}' +
    '.ord-wrap{display:grid;grid-template-columns:1fr 1fr;gap:16px}' +
    '@media (max-width:640px){.ord-wrap{grid-template-columns:1fr}}' +
    '.ord-col h4{margin:0 0 6px;font-size:13px}' +
    '.ord-list{list-style:none;margin:0;padding:0;max-height:46vh;overflow:auto;border:1px solid var(--color-border,#e5e7eb);border-radius:12px}' +
    '.ord-list li{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid var(--color-border,#e5e7eb);font-size:13px;background:var(--color-card,#fff);cursor:grab}' +
    '.ord-list li:last-child{border-bottom:none}' +
    '.ord-list li.ord-over{outline:2px solid var(--primary,#1A73E8);outline-offset:-2px}' +
    '.ord-list li .ord-n{width:20px;color:var(--color-text-muted,#6b7280);font-size:11px}' +
    '.ord-list li .ord-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.ord-list button{border:0;background:transparent;cursor:pointer;padding:2px 4px;border-radius:6px;color:var(--color-text-muted,#6b7280)}' +
    '.ord-list button:hover{background:var(--primary-lt,#E8F0FE);color:var(--primary,#1A73E8)}' +
    '.ord-add{display:flex;gap:6px;margin-top:8px}' +
    '.ord-hint{font-size:11px;color:var(--color-text-muted,#6b7280);margin:0 0 10px}';
  document.head.appendChild(css);

  /* ── 순서 설정 팝업 ─────────────────────────────────────── */
  var ICO_UP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
  var ICO_DN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  var ICO_X = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var dept = [], cals = [], calMap = {};

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function listCals() {
    var arr = [];
    try { arr = (CONFIG.selectedCalendars || []).map(function (c) { return { id: c.id, name: c.name }; }); } catch (e) {}
    var h = H();
    if (h && h.S && h.S.userCalendars) {
      h.S.userCalendars.forEach(function (c) {
        if (!arr.some(function (x) { return x.id === c.id; }) && c.selected) arr.push({ id: c.id, name: c.summary || c.id });
      });
    }
    return arr;
  }
  function renderList(ul, items, kind) {
    ul.innerHTML = items.map(function (v, i) {
      var label = kind === 'cal' ? (calMap[v] || v) : v;
      return '<li draggable="true" data-i="' + i + '"><span class="ord-n">' + (i + 1) + '</span><span class="ord-t">' +
        (kind === 'dept' ? '[' + esc(label) + ']' : esc(label)) + '</span>' +
        '<button type="button" data-a="up" title="위로">' + ICO_UP + '</button>' +
        '<button type="button" data-a="dn" title="아래로">' + ICO_DN + '</button>' +
        (kind === 'dept' ? '<button type="button" data-a="rm" title="삭제">' + ICO_X + '</button>' : '') + '</li>';
    }).join('');
  }
  function bindList(ul, arr, kind) {
    var from = -1;
    ul.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var i = +b.closest('li').dataset.i, a = b.dataset.a;
      if (a === 'up' && i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]);
      else if (a === 'dn' && i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]);
      else if (a === 'rm') arr.splice(i, 1);
      renderList(ul, arr, kind);
    });
    ul.addEventListener('dragstart', function (e) {
      var li = e.target.closest('li'); if (!li) return;
      from = +li.dataset.i; e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', 'ord'); } catch (x) {}
    });
    ul.addEventListener('dragover', function (e) {
      var li = e.target.closest('li'); if (!li || from < 0) return;
      e.preventDefault();
      ul.querySelectorAll('.ord-over').forEach(function (x) { x.classList.remove('ord-over'); });
      li.classList.add('ord-over');
    });
    ul.addEventListener('drop', function (e) {
      var li = e.target.closest('li'); if (!li || from < 0) return;
      e.preventDefault();
      var to = +li.dataset.i;
      if (to !== from) arr.splice(to, 0, arr.splice(from, 1)[0]);
      from = -1; renderList(ul, arr, kind);
    });
    ul.addEventListener('dragend', function () { from = -1; ul.querySelectorAll('.ord-over').forEach(function (x) { x.classList.remove('ord-over'); }); });
  }
  function openPopup() {
    var h = H();
    var o = get();
    dept = o.dept.slice();
    calMap = {}; var all = listCals(); all.forEach(function (c) { calMap[c.id] = c.name; });
    var ids = all.map(function (c) { return c.id; });
    cals = o.cals.filter(function (id) { return ids.indexOf(id) >= 0; });
    ids.forEach(function (id) { if (cals.indexOf(id) < 0) cals.push(id); });

    var old = $('ord-modal'); if (old) old.remove();
    var m = document.createElement('div');
    m.id = 'ord-modal'; m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.style.zIndex = 1100;
    m.innerHTML =
      '<div class="modal-backdrop"></div>' +
      '<div class="modal-dialog modal-lg"><div class="modal-header"><h3 class="modal-title">표시 순서 설정</h3>' +
      '<button type="button" class="modal-close" data-close-modal aria-label="닫기">✕</button></div>' +
      '<div class="modal-body"><p class="ord-hint">드래그 또는 위·아래 버튼으로 순서를 바꿉니다. 이 설정은 내 계정에만 적용됩니다. ' +
      '"아세아 업무일정"의 같은 날 일정은 제목 머릿말 [부서] 순서대로 표시되고, 목록에 없는 머릿말은 맨 뒤에 놓입니다.</p>' +
      '<div class="ord-wrap"><div class="ord-col"><h4>부서 머릿말 순서</h4><ul class="ord-list" id="ord-dept"></ul>' +
      '<div class="ord-add"><input id="ord-new" class="form-input" placeholder="부서 추가 (예: 총무)"><button type="button" id="ord-add" class="btn btn-secondary btn-sm">추가</button></div></div>' +
      '<div class="ord-col"><h4>캘린더 순서</h4><ul class="ord-list" id="ord-cal"></ul></div></div></div>' +
      '<div class="modal-footer"><button type="button" id="ord-reset" class="btn btn-ghost btn-sm" style="margin-right:auto">기본 순서로 되돌리기</button>' +
      '<button type="button" class="btn btn-ghost" data-close-modal>취소</button><button type="button" id="ord-save" class="btn btn-primary">저장</button></div></div>';
    document.body.appendChild(m);
    var ud = $('ord-dept'), uc = $('ord-cal');
    renderList(ud, dept, 'dept'); renderList(uc, cals, 'cal');
    bindList(ud, dept, 'dept'); bindList(uc, cals, 'cal');
    function add() {
      var v = $('ord-new').value.replace(/[\[\]]/g, '').trim();
      if (v && dept.indexOf(v) < 0) { dept.push(v); renderList(ud, dept, 'dept'); }
      $('ord-new').value = '';
    }
    $('ord-add').addEventListener('click', add);
    $('ord-new').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); add(); } });
    $('ord-reset').addEventListener('click', function () {
      dept.length = 0; DEFAULT_DEPT.forEach(function (d) { dept.push(d); });
      renderList(ud, dept, 'dept');
    });
    $('ord-save').addEventListener('click', function () {
      save({ dept: dept.slice(), cals: cals.slice() });
      m.remove();
      if (h) { h.toast('표시 순서를 저장했습니다.', 'success'); h.renderCalendar(); }
    });
    m.addEventListener('click', function (e) { if (e.target.closest('[data-close-modal]')) m.remove(); });
  }

  window.OrderExt = { cmp: cmp, sortCals: sortCals, setCalOrder: setCalOrder, openPopup: openPopup, get: get };

  function init() { var b = $('order-btn'); if (b) b.addEventListener('click', openPopup); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
