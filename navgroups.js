'use strict';
/**
 * navgroups.js — 탭 메뉴 그룹화 (정보구조 재정리)
 *
 * 23개로 늘어난 평면 탭을 6개 카테고리로 묶어 보여준다.
 * 핵심 원칙: 기존 전환 로직(app.js switchTab / initTabs)·패널 ID·data-tab 을
 * 일절 건드리지 않는다. 기존 .tab-btn 버튼들을 "이동만" 시키므로
 * initTabs 가 붙여둔 클릭 핸들러가 그대로 따라온다.
 *
 * - 데스크탑: 카테고리 버튼 클릭 → 드롭다운(position:fixed, 클리핑 회피)
 * - 모바일  : 하단 6개 카테고리 → 탭하면 바텀시트 목록 (항목은 기존 버튼 .click() 재사용)
 *
 * app.js 다음에 로드된다(둘 다 defer). app.init()→initTabs() 가 먼저 실행되어
 * 버튼이 모두 바인딩된 뒤 이 스크립트가 그룹으로 재배치한다.
 */
(function () {
  var ICON = {
    cal:  '<svg class="tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    work: '<svg class="tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/></svg>',
    fac:  '<svg class="tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/><path d="M9 9h.01M9 13h.01M9 17h.01"/></svg>',
    comm: '<svg class="tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    hr:   '<svg class="tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    settings: '<svg class="tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  };

  // 그룹 정의 — 값은 data-tab, '#id' 는 외부링크 버튼(캘린더공유/아물보)
  var ORDER = ['cal', 'work', 'fac', 'comm', 'hr', 'settings'];
  var GROUPS = {
    cal:      { label: '캘린더',    tabs: ['calendar', 'weekly-hub', 'extract', '#cal-share-nav-btn'] },
    work:     { label: '업무',      tabs: ['work', 'report', 'workorder', 'draft', 'survey'] },
    fac:      { label: '시설·자원', tabs: ['facility', 'vehicle', 'classroom', 'checkinmgmt'] },
    comm:     { label: '소통·홍보', tabs: ['board', 'email', 'sms', 'zoom', 'promo', 'qrcard', '#amulbo-nav-btn'] },
    hr:       { label: '인사',      tabs: ['hr'] },
    settings: { label: '설정',      tabs: ['settings', 'admin', 'help'] },
  };

  function btnFor(t) {
    if (t.charAt(0) === '#') return document.getElementById(t.slice(1));
    return document.querySelector('.tab-btn[data-tab="' + t + '"]');
  }
  function isHidden(el) {
    return !el || el.style.display === 'none' || el.hidden;
  }
  function visibleButtons(gid) {
    var out = [];
    GROUPS[gid].tabs.forEach(function (t) {
      var b = btnFor(t);
      if (b && !isHidden(b)) out.push(b);
    });
    return out;
  }
  function tabToGroup(tab) {
    for (var k in GROUPS) {
      if (GROUPS[k].tabs.indexOf(tab) !== -1) return k;
    }
    return null;
  }

  /* ─────────────── 데스크탑 드롭다운 ─────────────── */
  var _open = null;
  function closeDesktop() {
    if (!_open) return;
    _open.menu.hidden = true;
    _open.btn.setAttribute('aria-expanded', 'false');
    _open = null;
  }
  function openDesktop(btn, menu) {
    closeDesktop();
    var r = btn.getBoundingClientRect();
    menu.style.left = '0px'; menu.style.top = '0px'; menu.hidden = false;
    var mw = menu.offsetWidth || 200;
    var left = Math.min(r.left, window.innerWidth - mw - 8);
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top = Math.round(r.bottom) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    _open = { btn: btn, menu: menu };
  }

  function buildDesktop() {
    var nav = document.querySelector('.desktop-tab-nav');
    if (!nav || nav.dataset.ngReady) return;

    ORDER.forEach(function (gid) {
      var g = GROUPS[gid];
      var wrap = document.createElement('div');
      wrap.className = 'nav-group';
      wrap.dataset.group = gid;

      var cat = document.createElement('button');
      cat.type = 'button';
      cat.className = 'nav-cat-btn';
      cat.setAttribute('aria-haspopup', 'true');
      cat.setAttribute('aria-expanded', 'false');
      cat.innerHTML = (ICON[gid] || '') +
        '<span class="tab-label">' + g.label + '</span>' +
        '<svg class="nav-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

      var menu = document.createElement('div');
      menu.className = 'nav-group-menu';
      menu.setAttribute('role', 'menu');
      menu.hidden = true;

      g.tabs.forEach(function (t) {
        var b = btnFor(t);
        if (b) menu.appendChild(b);   // 이동(핸들러 유지)
      });

      cat.addEventListener('click', function (e) {
        e.stopPropagation();
        var vis = visibleButtons(gid);
        if (vis.length === 1) { closeDesktop(); vis[0].click(); return; }  // 단일 항목은 바로 전환
        if (_open && _open.menu === menu) { closeDesktop(); return; }
        openDesktop(cat, menu);
      });
      menu.addEventListener('click', function (e) {
        if (e.target.closest('.tab-btn')) closeDesktop();
      });

      wrap.appendChild(cat);
      wrap.appendChild(menu);
      nav.appendChild(wrap);
    });

    nav.dataset.ngReady = '1';
    document.addEventListener('click', function (e) {
      if (_open && !e.target.closest('.nav-group')) closeDesktop();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDesktop(); });
    window.addEventListener('resize', closeDesktop);
    window.addEventListener('scroll', closeDesktop, true);
  }

  /* ─────────────── 모바일 바텀시트 ─────────────── */
  function buildSheetItems(gid) {
    var body = document.getElementById('nav-sheet-body');
    var title = document.getElementById('nav-sheet-title');
    if (!body) return;
    body.innerHTML = '';
    if (title) title.textContent = GROUPS[gid].label;
    visibleButtons(gid).forEach(function (src) {
      var label = '';
      var lblEl = src.querySelector('.tab-label');
      if (lblEl) label = lblEl.textContent;
      var svg = src.querySelector('svg');
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'nav-sheet-item' + (src.classList.contains('active') ? ' active' : '');
      item.innerHTML = (svg ? svg.outerHTML : '') + '<span>' + label + '</span>';
      item.addEventListener('click', function () { closeSheet(); src.click(); });
      body.appendChild(item);
    });
  }
  function openSheet(gid) {
    var vis = visibleButtons(gid);
    if (vis.length === 1) { vis[0].click(); return; }  // 단일 항목은 바로 전환
    buildSheetItems(gid);
    var s = document.getElementById('nav-sheet');
    var b = document.getElementById('nav-sheet-backdrop');
    if (b) b.hidden = false;
    if (s) s.hidden = false;
    document.body.classList.add('nav-sheet-open');
  }
  function closeSheet() {
    var s = document.getElementById('nav-sheet');
    var b = document.getElementById('nav-sheet-backdrop');
    if (s) s.hidden = true;
    if (b) b.hidden = true;
    document.body.classList.remove('nav-sheet-open');
  }

  function buildMobile() {
    var nav = document.querySelector('.mobile-bottom-nav');
    if (!nav || nav.dataset.ngReady) return;
    nav.innerHTML = '';
    ORDER.forEach(function (gid) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mnav-cat';
      b.dataset.group = gid;
      b.innerHTML = (ICON[gid] || '') + '<span class="bnav-label">' + GROUPS[gid].label + '</span>';
      b.addEventListener('click', function () { openSheet(gid); });
      nav.appendChild(b);
    });
    nav.dataset.ngReady = '1';

    // 바텀시트 DOM이 없으면 생성
    if (!document.getElementById('nav-sheet')) {
      var back = document.createElement('div');
      back.id = 'nav-sheet-backdrop';
      back.className = 'nav-sheet-backdrop';
      back.hidden = true;
      back.addEventListener('click', closeSheet);
      var sheet = document.createElement('div');
      sheet.id = 'nav-sheet';
      sheet.className = 'nav-sheet';
      sheet.hidden = true;
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-label', '메뉴');
      sheet.innerHTML =
        '<div class="nav-sheet-head"><span id="nav-sheet-title"></span>' +
        '<button type="button" id="nav-sheet-close" class="nav-sheet-close" aria-label="닫기">✕</button></div>' +
        '<div class="nav-sheet-body" id="nav-sheet-body"></div>';
      document.body.appendChild(back);
      document.body.appendChild(sheet);
      sheet.querySelector('#nav-sheet-close').addEventListener('click', closeSheet);
    }
  }

  /* ─────────────── 활성 카테고리 하이라이트 ─────────────── */
  // 데스크탑 카테고리 강조는 CSS :has() 가 담당.
  // 여기서는 관찰 대상(.desktop-tab-nav) 밖에 있는 모바일 카테고리만 갱신해
  // MutationObserver 무한 루프를 피한다.
  function syncActive() {
    var active = document.querySelector('.desktop-tab-nav .tab-btn.active');
    var grp = active ? tabToGroup(active.dataset.tab) : null;
    document.querySelectorAll('.mnav-cat').forEach(function (b) {
      b.classList.toggle('active', b.dataset.group === grp);
    });
  }

  /* ─────────────── 우측 하단 빠른 등록 FAB ─────────────── */
  function buildFab() {
    if (document.getElementById('quick-fab')) return;
    var fab = document.createElement('button');
    fab.id = 'quick-fab';
    fab.type = 'button';
    fab.className = 'quick-fab';
    fab.setAttribute('aria-label', '빠른 업무 등록');
    fab.title = '빠른 업무 등록 (Ctrl+Alt+R)';
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    fab.addEventListener('click', function () {
      if (window.QuickTaskModule && QuickTaskModule.open) QuickTaskModule.open();
    });
    document.body.appendChild(fab);
  }

  function start() {
    try {
      buildDesktop();
      buildMobile();
      buildFab();
      syncActive();
      var nav = document.querySelector('.desktop-tab-nav');
      if (nav && window.MutationObserver) {
        new MutationObserver(syncActive).observe(nav, {
          subtree: true, attributes: true, attributeFilter: ['class'],
        });
      }
      window.NavGroups = { openSheet: openSheet, closeSheet: closeSheet };
    } catch (e) {
      // 그룹화 실패 시에도 기존 버튼은 살아있으므로 앱은 정상 동작
      if (window.console) console.warn('[navgroups] 초기화 실패:', e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
