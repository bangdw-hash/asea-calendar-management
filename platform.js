'use strict';
/* ================================================================
   platform.js — 공통 플랫폼 레이어 (window.Platform)
   전역 UX 기반 기능. 추가 전용(additive), 외부 의존 없음.

   제공 API
   · Platform.openExternal(url, {confirmMsg})   외부 링크 안전 이동(미저장 경고+새창)
   · Platform.registerDirty(fn)                  미저장 상태 판별자 등록
   · Platform.toast(msg, {action,onAction,ms})   액션형 토스트
   · Platform.undo(msg, onUndo, ms)              실행취소 토스트
   · Platform.saveState(state, text)             저장상태 표시(saving/saved/error/offline/idle)
   · Platform.queue.add(kind, payload)           오프라인 쓰기 큐(연결복구 시 flush)
   · Platform.queue.handler(kind, fn)            큐 처리기 등록
   · Platform.empty(el, opts)                    빈 상태 렌더
   · Platform.skeleton(el, rows)                 스켈레톤 렌더
   · Platform.palette.register(name, fn)         ⌘K 명령 팔레트 소스 등록
   · Platform.coach(key, steps)                  코치마크(기기별 1회)
   · Platform.theme.set/get, Platform.uiscale.set/get
   ================================================================ */
window.Platform = window.Platform || (function () {
  if (window.__PF_INIT) return window.Platform;
  window.__PF_INIT = true;

  var LS = window.localStorage;
  function lsGet(k, d) { try { var v = LS.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { LS.setItem(k, v); } catch (e) {} }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  /* ──────────────────────────────────────────────────────────────
     1) 테마 / UI 배율 (item 7)
  ────────────────────────────────────────────────────────────── */
  var theme = {
    get: function () { return lsGet('asea_theme', 'auto'); },
    set: function (v) {
      lsSet('asea_theme', v);
      apply();
    }
  };
  var uiscale = {
    get: function () { return lsGet('asea_uiscale', 'md'); },
    set: function (v) { lsSet('asea_uiscale', v); apply(); }
  };
  function apply() {
    var t = theme.get();
    var resolved = t;
    if (t === 'auto') {
      resolved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-uiscale', uiscale.get());
  }
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if (theme.get() === 'auto') apply();
      });
    } catch (e) {}
  }
  // 모션 축소 선호 반영
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    ready(function () { document.body.classList.add('pf-no-motion'); });
  }
  apply();

  /* ──────────────────────────────────────────────────────────────
     2) 접근성: 건너뛰기 링크 + 키보드 포커스 링 (item 8)
  ────────────────────────────────────────────────────────────── */
  ready(function () {
    if (!document.querySelector('.pf-skip-link')) {
      var main = document.querySelector('main, .tab-content, #app-main, .app-main');
      var skip = el('a', 'pf-skip-link', '본문 바로가기');
      skip.href = '#';
      if (main && !main.id) main.id = 'pf-main';
      skip.setAttribute('href', '#' + (main ? main.id : ''));
      skip.addEventListener('click', function (e) {
        if (!main) return;
        e.preventDefault(); main.setAttribute('tabindex', '-1'); main.focus();
      });
      document.body.insertBefore(skip, document.body.firstChild);
    }
  });
  // 키보드 사용 감지 → 포커스 링 노출 (마우스 사용 시 숨김)
  window.addEventListener('keydown', function (e) { if (e.key === 'Tab') document.body.classList.add('pf-kbd'); });
  window.addEventListener('mousedown', function () { document.body.classList.remove('pf-kbd'); });

  /* ──────────────────────────────────────────────────────────────
     3) 토스트 / Undo (item 2)
  ────────────────────────────────────────────────────────────── */
  var toastWrap = null;
  function ensureToastWrap() {
    if (!toastWrap) { toastWrap = el('div', 'pf-toast-wrap'); document.body.appendChild(toastWrap); }
    return toastWrap;
  }
  function toast(msg, opts) {
    opts = opts || {};
    var ms = opts.ms || 4000;
    var t = el('div', 'pf-toast');
    t.style.position = 'relative';
    var m = el('span', 'pf-toast-msg'); m.textContent = msg; t.appendChild(m);
    if (opts.action) {
      var b = el('button', 'pf-toast-act'); b.textContent = opts.action;
      b.addEventListener('click', function () { try { opts.onAction && opts.onAction(); } finally { close(); } });
      t.appendChild(b);
    }
    var bar = el('div', 'pf-toast-bar'); bar.style.width = '100%'; t.appendChild(bar);
    ensureToastWrap().appendChild(t);
    var start = Date.now(), raf;
    function tick() {
      var left = Math.max(0, 1 - (Date.now() - start) / ms);
      bar.style.width = (left * 100) + '%';
      if (left > 0) raf = requestAnimationFrame(tick); else close();
    }
    raf = requestAnimationFrame(tick);
    var closed = false;
    function close() {
      if (closed) return; closed = true; cancelAnimationFrame(raf);
      t.classList.add('out'); setTimeout(function () { t.remove(); }, 200);
    }
    t.addEventListener('mouseenter', function () { cancelAnimationFrame(raf); bar.style.width = bar.style.width; start = Date.now() - (1 - parseFloat(bar.style.width) / 100) * ms; });
    t.addEventListener('mouseleave', function () { raf = requestAnimationFrame(tick); });
    return { close: close };
  }
  function undo(msg, onUndo, ms) {
    return toast(msg, { action: '실행취소', onAction: onUndo, ms: ms || 5500 });
  }

  /* ──────────────────────────────────────────────────────────────
     4) 저장상태 인디케이터 (item 3)
  ────────────────────────────────────────────────────────────── */
  var saveEl = null, saveHideTimer = null;
  function ensureSaveEl() {
    if (saveEl) return saveEl;
    saveEl = el('span', 'pf-savestate');
    saveEl.innerHTML = '<span class="pf-dot"></span><span class="pf-savestate-txt"></span>';
    var host = document.querySelector('.header-actions') || document.querySelector('.app-header') || document.body;
    host.appendChild(saveEl);
    return saveEl;
  }
  var SAVE_TXT = { saving: '저장 중…', saved: '저장됨', error: '저장 실패', offline: '오프라인 — 대기', idle: '' };
  function saveState(state, text) {
    var e = ensureSaveEl();
    if (saveHideTimer) { clearTimeout(saveHideTimer); saveHideTimer = null; }
    if (state === 'idle') { e.classList.remove('show'); return; }
    e.setAttribute('data-s', state);
    e.querySelector('.pf-savestate-txt').textContent = text || SAVE_TXT[state] || '';
    e.classList.add('show');
    if (state === 'saved') saveHideTimer = setTimeout(function () { e.classList.remove('show'); }, 2200);
  }

  /* ──────────────────────────────────────────────────────────────
     5) 오프라인 감지 + 쓰기 큐 (item 6)
  ────────────────────────────────────────────────────────────── */
  var QKEY = 'asea_write_queue_v1';
  var handlers = {};
  var netBadge = null;
  function ensureNetBadge() {
    if (!netBadge) {
      netBadge = el('div', 'pf-net-badge');
      netBadge.innerHTML = '<span>오프라인 — 변경사항은 연결 복구 시 자동 반영됩니다</span>';
      document.body.appendChild(netBadge);
    }
    return netBadge;
  }
  function loadQueue() { try { return JSON.parse(lsGet(QKEY, '[]')) || []; } catch (e) { return []; } }
  function saveQueue(q) { lsSet(QKEY, JSON.stringify(q)); }
  var queue = {
    handler: function (kind, fn) { handlers[kind] = fn; },
    add: function (kind, payload) {
      var q = loadQueue();
      q.push({ id: 'q' + Date.now() + Math.random().toString(36).slice(2, 6), kind: kind, payload: payload, ts: Date.now() });
      saveQueue(q);
      if (navigator.onLine) queue.flush();
      else saveState('offline');
      return true;
    },
    flush: function () {
      var q = loadQueue();
      if (!q.length) return Promise.resolve();
      var remaining = [];
      var chain = Promise.resolve();
      q.forEach(function (job) {
        chain = chain.then(function () {
          var h = handlers[job.kind];
          if (!h) { remaining.push(job); return; }
          return Promise.resolve().then(function () { return h(job.payload); })
            .catch(function () { remaining.push(job); });
        });
      });
      return chain.then(function () {
        saveQueue(remaining);
        if (!remaining.length) saveState('saved');
      });
    },
    size: function () { return loadQueue().length; }
  };
  function onNet() {
    if (navigator.onLine) { ensureNetBadge().classList.remove('show'); queue.flush(); }
    else { ensureNetBadge().classList.add('show'); saveState('offline'); }
  }
  window.addEventListener('online', onNet);
  window.addEventListener('offline', onNet);
  ready(function () { if (!navigator.onLine) onNet(); else if (queue.size()) queue.flush(); });

  /* ──────────────────────────────────────────────────────────────
     6) 외부 링크 안전 이동 (item 1)
  ────────────────────────────────────────────────────────────── */
  var dirtyCheckers = [];
  function registerDirty(fn) { if (typeof fn === 'function') dirtyCheckers.push(fn); }
  function isDirty() { for (var i = 0; i < dirtyCheckers.length; i++) { try { if (dirtyCheckers[i]()) return true; } catch (e) {} } return false; }
  function openExternal(url, opts) {
    opts = opts || {};
    if (isDirty()) {
      var ok = window.confirm(opts.confirmMsg ||
        '작성 중인 내용이 있습니다.\n\n먼저 저장하셨나요? 외부 페이지는 새 창에서 열리며, 현재 작성 화면은 그대로 유지됩니다.\n\n계속하시겠습니까?');
      if (!ok) return false;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }
  // [data-extlink] 또는 a[target=_blank][data-guard] 위임 처리
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-extlink], a[target="_blank"][data-guard]');
    if (!a) return;
    var url = a.getAttribute('data-extlink') || a.getAttribute('href');
    if (!url || url === '#') return;
    e.preventDefault();
    openExternal(url, { confirmMsg: a.getAttribute('data-extlink-msg') || undefined });
  });

  /* ──────────────────────────────────────────────────────────────
     7) 스켈레톤 / 빈 상태 (item 4)
  ────────────────────────────────────────────────────────────── */
  function skeleton(target, rows) {
    var host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) return;
    rows = rows || 5;
    var html = '';
    for (var i = 0; i < rows; i++) {
      html += '<div style="display:flex;gap:12px;align-items:center;padding:10px 0">' +
        '<span class="pf-skll" style="width:40px;height:40px;border-radius:8px"></span>' +
        '<span style="flex:1"><span class="pf-skll" style="width:' + (50 + (i % 3) * 12) + '%;height:12px;margin-bottom:7px"></span>' +
        '<span class="pf-skll" style="width:' + (28 + (i % 4) * 9) + '%;height:10px"></span></span></div>';
    }
    host.innerHTML = html;
  }
  function empty(target, opts) {
    var host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) return;
    opts = opts || {};
    var wrap = el('div', 'pf-empty');
    var ico = '<svg class="pf-empty-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18M3 7l2 13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2l2-13M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>';
    wrap.innerHTML = (opts.icon || ico) +
      '<div class="pf-empty-title">' + (opts.title || '표시할 항목이 없습니다') + '</div>' +
      (opts.desc ? '<div class="pf-empty-desc">' + opts.desc + '</div>' : '');
    if (opts.actionLabel) {
      var btn = el('button', 'pf-empty-btn'); btn.textContent = opts.actionLabel;
      btn.addEventListener('click', function () { opts.onAction && opts.onAction(); });
      wrap.appendChild(btn);
    }
    host.innerHTML = ''; host.appendChild(wrap);
  }

  /* ──────────────────────────────────────────────────────────────
     8) 명령 팔레트 ⌘K (item 5)
  ────────────────────────────────────────────────────────────── */
  var sources = [];
  function fuzzy(q, s) {
    q = (q || '').toLowerCase().trim(); s = (s || '').toLowerCase();
    if (!q) return 1;
    if (s.indexOf(q) >= 0) return 2 - s.indexOf(q) / 100;
    var qi = 0;
    for (var i = 0; i < s.length && qi < q.length; i++) if (s[i] === q[qi]) qi++;
    return qi === q.length ? 0.5 : 0;
  }
  var palette = {
    register: function (name, fn) { sources.push({ name: name, fn: fn }); },
    open: openPalette
  };
  var palBack = null, palInput = null, palList = null, palItems = [], palActive = 0;
  function buildItems(q) {
    var out = [];
    sources.forEach(function (src) {
      var items;
      try { items = src.fn(q) || []; } catch (e) { items = []; }
      items.forEach(function (it) {
        var score = Math.max(fuzzy(q, it.title), fuzzy(q, it.subtitle || '') * 0.6, fuzzy(q, it.keywords || '') * 0.8);
        if (score > 0) out.push({ it: it, cat: src.name, score: score });
      });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, 40);
  }
  function renderPalette(q) {
    palItems = buildItems(q); palActive = 0;
    if (!palItems.length) { palList.innerHTML = '<div class="pf-palette-empty">결과가 없습니다</div>'; return; }
    palList.innerHTML = '';
    palItems.forEach(function (row, i) {
      var d = el('div', 'pf-palette-item' + (i === 0 ? ' active' : ''));
      d.innerHTML =
        (row.it.icon || '<svg class="pf-pi-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>') +
        '<span class="pf-pi-main"><div>' + esc(row.it.title) + '</div>' +
        (row.it.subtitle ? '<div class="pf-pi-sub">' + esc(row.it.subtitle) + '</div>' : '') + '</span>' +
        '<span class="pf-pi-cat">' + esc(row.cat) + '</span>';
      d.addEventListener('click', function () { runItem(row.it); });
      d.addEventListener('mousemove', function () { setActive(i); });
      palList.appendChild(d);
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function setActive(i) {
    var nodes = palList.querySelectorAll('.pf-palette-item');
    if (!nodes.length) return;
    palActive = (i + nodes.length) % nodes.length;
    nodes.forEach(function (n, k) { n.classList.toggle('active', k === palActive); });
    nodes[palActive].scrollIntoView({ block: 'nearest' });
  }
  function runItem(it) { closePalette(); try { it.action && it.action(); } catch (e) {} }
  function openPalette() {
    if (palBack) return;
    palBack = el('div', 'pf-palette-back');
    var box = el('div', 'pf-palette');
    palInput = el('input', 'pf-palette-input'); palInput.placeholder = '메뉴·일정·할일·문서 검색 또는 명령 실행…';
    palList = el('div', 'pf-palette-list');
    var foot = el('div', 'pf-palette-foot', '<span><kbd>↑</kbd><kbd>↓</kbd> 이동</span><span><kbd>Enter</kbd> 실행</span><span><kbd>Esc</kbd> 닫기</span>');
    box.appendChild(palInput); box.appendChild(palList); box.appendChild(foot);
    palBack.appendChild(box); document.body.appendChild(palBack);
    palInput.addEventListener('input', function () { renderPalette(palInput.value); });
    palInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(palActive + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(palActive - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (palItems[palActive]) runItem(palItems[palActive].it); }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    });
    palBack.addEventListener('click', function (e) { if (e.target === palBack) closePalette(); });
    renderPalette('');
    setTimeout(function () { palInput.focus(); }, 30);
  }
  function closePalette() { if (palBack) { palBack.remove(); palBack = null; } }
  window.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); palBack ? closePalette() : openPalette(); }
  });

  // 기본 소스: 메뉴 네비게이션
  palette.register('이동', function (q) {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab-btn[data-tab]'));
    var seen = {};
    return tabs.filter(function (t) { var k = t.getAttribute('data-tab'); if (seen[k]) return false; seen[k] = 1; return true; })
      .map(function (t) {
        var label = (t.querySelector('.tab-label') || t).textContent.trim();
        return {
          title: label, subtitle: '메뉴로 이동', keywords: t.getAttribute('data-tab'),
          icon: '<svg class="pf-pi-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>',
          action: function () { t.click(); }
        };
      });
  });
  // 기본 소스: 보기/명령
  palette.register('명령', function () {
    return [
      { title: '다크 모드 켜기/끄기', subtitle: '화면 테마 전환', keywords: 'dark theme 테마 야간',
        action: function () { theme.set(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); } },
      { title: '글자 크기 변경', subtitle: '보기 설정 열기', keywords: 'font size 글자 크기 확대',
        action: function () { openViewMenu(); } },
      { title: '시스템 테마 따르기(자동)', subtitle: '운영체제 설정에 맞춤', keywords: 'auto system theme',
        action: function () { theme.set('auto'); } }
    ];
  });

  /* ──────────────────────────────────────────────────────────────
     9) 보기 설정 미니 메뉴 (테마/글자크기) — 헤더 버튼
  ────────────────────────────────────────────────────────────── */
  var viewMenu = null;
  function openViewMenu(anchor) {
    closeViewMenu();
    viewMenu = el('div', 'pf-view-menu');
    function seg(label, key, current, opts) {
      var row = '<div class="pf-vm-row"><span>' + label + '</span><span class="pf-seg" data-key="' + key + '">';
      opts.forEach(function (o) { row += '<button data-val="' + o[0] + '"' + (current === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>'; });
      return row + '</span></div>';
    }
    viewMenu.innerHTML =
      seg('테마', 'theme', theme.get(), [['auto', '자동'], ['light', '밝게'], ['dark', '어둡게']]) +
      seg('글자크기', 'uiscale', uiscale.get(), [['sm', '작게'], ['md', '보통'], ['lg', '크게'], ['xl', '아주크게']]);
    document.body.appendChild(viewMenu);
    var r = (anchor || document.querySelector('.header-actions') || document.body).getBoundingClientRect();
    viewMenu.style.top = (r.bottom + 8) + 'px';
    viewMenu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    viewMenu.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-val]'); if (!b) return;
      var key = b.parentNode.getAttribute('data-key'), val = b.getAttribute('data-val');
      if (key === 'theme') theme.set(val); else uiscale.set(val);
      b.parentNode.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
    });
    setTimeout(function () {
      document.addEventListener('mousedown', function h(ev) {
        if (viewMenu && !viewMenu.contains(ev.target)) { closeViewMenu(); document.removeEventListener('mousedown', h); }
      });
    }, 0);
  }
  function closeViewMenu() { if (viewMenu) { viewMenu.remove(); viewMenu = null; } }
  // 헤더에 보기 설정 버튼 주입
  ready(function () {
    var host = document.querySelector('.header-actions');
    if (host && !document.getElementById('pf-view-btn')) {
      var b = el('button', 'btn btn-secondary btn-sm');
      b.id = 'pf-view-btn'; b.title = '보기 설정 (테마·글자크기)';
      b.setAttribute('aria-label', '보기 설정');
      b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" style="vertical-align:-3px"><circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 1h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2L10 23h4l.5-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/></svg>';
      b.addEventListener('click', function () { openViewMenu(b); });
      host.appendChild(b);
    }
  });

  /* ──────────────────────────────────────────────────────────────
     10) 코치마크 (item 9)
  ────────────────────────────────────────────────────────────── */
  function coach(key, steps) {
    if (!steps || !steps.length) return;
    var seenKey = 'asea_coach_' + key;
    if (lsGet(seenKey, '')) return;
    var i = 0, back, hole, card;
    function cleanup() { [back, hole, card].forEach(function (n) { n && n.remove(); }); window.removeEventListener('resize', position); }
    function done() { lsSet(seenKey, '1'); cleanup(); }
    function position() {
      var s = steps[i]; var t = typeof s.el === 'string' ? document.querySelector(s.el) : s.el;
      var r = t ? t.getBoundingClientRect() : { left: window.innerWidth / 2 - 1, top: window.innerHeight / 2 - 1, width: 2, height: 2, bottom: window.innerHeight / 2, right: 0 };
      hole.style.left = (r.left - 6) + 'px'; hole.style.top = (r.top - 6) + 'px';
      hole.style.width = (r.width + 12) + 'px'; hole.style.height = (r.height + 12) + 'px';
      var below = r.bottom + 14;
      if (below + 160 > window.innerHeight) below = Math.max(14, r.top - 174);
      card.style.top = below + 'px';
      card.style.left = Math.min(Math.max(14, r.left), window.innerWidth - 334) + 'px';
    }
    function render() {
      var s = steps[i];
      card.innerHTML =
        '<h4>' + esc(s.title) + '</h4><p>' + esc(s.body) + '</p>' +
        '<div class="pf-coach-row"><span class="pf-coach-step">' + (i + 1) + ' / ' + steps.length + '</span>' +
        '<span class="pf-coach-btns"><button class="pf-coach-skip">건너뛰기</button>' +
        '<button class="pf-coach-next">' + (i === steps.length - 1 ? '완료' : '다음') + '</button></span></div>';
      card.querySelector('.pf-coach-skip').addEventListener('click', done);
      card.querySelector('.pf-coach-next').addEventListener('click', function () {
        if (i === steps.length - 1) done(); else { i++; render(); position(); }
      });
      position();
    }
    ready(function () {
      back = el('div', 'pf-coach-back'); hole = el('div', 'pf-coach-hole'); card = el('div', 'pf-coach-card');
      back.addEventListener('click', done);
      document.body.appendChild(back); document.body.appendChild(hole); document.body.appendChild(card);
      window.addEventListener('resize', position);
      render();
    });
  }

  /* ── 공개 API ─────────────────────────────────────────────── */
  return {
    openExternal: openExternal, registerDirty: registerDirty, isDirty: isDirty,
    toast: toast, undo: undo,
    saveState: saveState,
    queue: queue,
    skeleton: skeleton, empty: empty,
    palette: palette,
    coach: coach,
    theme: theme, uiscale: uiscale, openViewMenu: openViewMenu
  };
})();
