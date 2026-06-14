'use strict';
/**
 * onboarding.js — 신규/직원 계정 첫 사용 안내
 *  1) 모든 주요 메뉴·버튼에 마우스 오버(설명) 툴팁 — PC hover + 커스텀 말풍선
 *  2) 첫 로그인 시 "화면 사용 안내" 오버레이 (계정별로 기억)
 *     · "다시 보지 않기" / "하루 동안 보지 않기" 옵션 제공
 *  의존성 없음(순수 DOM). Auth가 있으면 로그인 이벤트에 맞춰 동작.
 */
(function () {
  /* ── 메뉴(탭) 설명 ─────────────────────────────────────── */
  var TIPS = {
    'calendar':     '일정을 보고 추가·관리합니다',
    'extract':      '텍스트·이미지에서 일정을 자동으로 뽑아냅니다',
    'weekly-hub':   '한 주 업무를 모아보는 주간 허브',
    'report':       '업무 보고서를 작성하고 취합합니다',
    'work':         '업무 진행 상황을 관리합니다',
    'budget':       '예산 편성·집행 내역을 관리합니다',
    'workorder':    '작업(수리·요청) 지시를 등록합니다',
    'draft':        '기안문을 작성·결재합니다',
    'survey':       '설문지를 만들고 응답을 받습니다',
    'facility':     '시설·공간 대관을 신청·관리합니다',
    'vehicle':      '차량 배차·운행을 관리합니다',
    'classroom':    '강의실 사용 현황을 확인합니다',
    'checkinmgmt':  '출입(입·퇴실) 현황을 관리합니다',
    'board':        '사내 게시판·공지를 확인합니다',
    'email':        '이메일을 작성·발송합니다',
    'sms':          '문자메시지를 발송합니다',
    'zoom':         'Zoom 화상회의를 관리합니다',
    'promo':        '홍보 화면(디지털 사이니지)을 설정합니다',
    'qrcard':       'QR 디지털 명함을 만듭니다',
    'cal-share-nav':'캘린더 공유 링크를 만듭니다',
    'hr':           '입사·퇴직 등 인사 업무를 처리합니다',
    'settings':     '내 정보·색상 등 환경설정을 변경합니다',
    'admin':        '관리자 전용 — 메뉴·권한·시스템 설정',
    'help':         '사용 방법 도움말을 봅니다'
  };

  /* ── 주요 버튼 설명 (id 기준) ──────────────────────────── */
  var BTN_TIPS = {
    'sync-calendars-btn': '내 Google 캘린더 목록을 불러옵니다',
    'quick-event-btn':    '텍스트·이미지를 붙여넣으면 AI가 일정으로 정리해 등록합니다',
    'add-event-btn':      '새 일정을 직접 추가합니다',
    'csv-import-btn':     'CSV 파일로 일정을 한 번에 등록합니다',
    'print-cal-btn':      '현재 달력을 인쇄하거나 PDF로 저장합니다',
    'logout-btn':         '로그아웃합니다'
  };

  /* ── 계정별 안내 표시 여부 ─────────────────────────────── */
  function curEmail() {
    try {
      if (window.CONFIG && CONFIG.currentUser && CONFIG.currentUser.email) return CONFIG.currentUser.email;
      return localStorage.getItem('asea_user_email') || '';
    } catch (e) { return ''; }
  }
  function dismissKey() { return 'asea_onboard__' + (curEmail() || 'anon').toLowerCase(); }
  function isDismissed() {
    try {
      var v = localStorage.getItem(dismissKey());
      if (!v) return false;
      if (v === 'forever') return true;
      var until = parseInt(v, 10);
      return !!until && Date.now() < until;
    } catch (e) { return false; }
  }
  function setDismiss(mode) {
    try {
      if (mode === 'forever') localStorage.setItem(dismissKey(), 'forever');
      else if (mode === 'day') localStorage.setItem(dismissKey(), String(Date.now() + 24 * 3600 * 1000));
    } catch (e) {}
  }

  /* ── 툴팁 적용(설명 부착) ──────────────────────────────── */
  function applyTooltips() {
    document.querySelectorAll('[data-tab]').forEach(function (b) {
      var t = TIPS[b.dataset.tab];
      if (t) { if (!b.getAttribute('title')) b.setAttribute('title', t); b.setAttribute('data-tip', t); }
    });
    var cs = document.getElementById('cal-share-nav-btn');
    if (cs && TIPS['cal-share-nav']) { if (!cs.getAttribute('title')) cs.setAttribute('title', TIPS['cal-share-nav']); cs.setAttribute('data-tip', TIPS['cal-share-nav']); }
    Object.keys(BTN_TIPS).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { if (!el.getAttribute('title')) el.setAttribute('title', BTN_TIPS[id]); el.setAttribute('data-tip', BTN_TIPS[id]); }
    });
  }

  /* ── 커스텀 말풍선(PC hover) ───────────────────────────── */
  var _tipEl = null;
  function tipEl() {
    if (!_tipEl) { _tipEl = document.createElement('div'); _tipEl.className = 'ob-tip'; _tipEl.hidden = true; document.body.appendChild(_tipEl); }
    return _tipEl;
  }
  function showTip(el) {
    var txt = el.getAttribute('data-tip'); if (!txt) return;
    var tip = tipEl(); tip.textContent = txt; tip.hidden = false;
    var r = el.getBoundingClientRect();
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = r.left + r.width / 2 - tw / 2;
    var top  = r.bottom + 8;
    if (top + th > window.innerHeight - 6) top = r.top - th - 8;   // 아래 공간 없으면 위로
    left = Math.max(6, Math.min(left, window.innerWidth - tw - 6));
    tip.style.left = left + 'px'; tip.style.top = Math.max(6, top) + 'px';
  }
  function hideTip() { if (_tipEl) _tipEl.hidden = true; }
  function bindHoverTips() {
    if (document._obHoverBound) return; document._obHoverBound = true;
    document.addEventListener('mouseover', function (e) {
      var el = e.target.closest && e.target.closest('[data-tip]');
      if (el) showTip(el);
    });
    document.addEventListener('mouseout', function (e) {
      var el = e.target.closest && e.target.closest('[data-tip]');
      if (el) hideTip();
    });
    window.addEventListener('scroll', hideTip, true);
    window.addEventListener('resize', hideTip);
  }

  /* ── 첫 사용 안내 오버레이 ─────────────────────────────── */
  function buildGuide() {
    var ov = document.createElement('div');
    ov.className = 'ob-overlay'; ov.id = 'ob-overlay';
    ov.innerHTML =
      '<div class="ob-card" role="dialog" aria-modal="true" aria-label="화면 사용 안내">' +
        '<button class="ob-x" id="ob-x" aria-label="닫기">✕</button>' +
        '<div class="ob-head"><span class="ob-emoji">👋</span>' +
          '<div><h2 class="ob-title">ASEA 업무관리 사용 안내</h2>' +
          '<p class="ob-sub">처음이시군요! 화면을 어떻게 쓰는지 간단히 안내해 드릴게요.</p></div></div>' +
        '<ul class="ob-list">' +
          '<li><b>메뉴 위에 마우스를 올리면</b> 각 기능 설명(말풍선)이 나타납니다. (PC)</li>' +
          '<li><b>캘린더</b>에서 일정을 보고, <b>＋ 일정 추가</b> 또는 <b>⚡ 빠른 등록</b>으로 일정을 추가하세요.</li>' +
          '<li>왼쪽 <b>표시할 캘린더 선택</b>에서 보고 싶은 캘린더를 켜고 끌 수 있어요.</li>' +
          '<li><b>⚡ 빠른 등록</b>은 <u>처음엔 등록 캘린더가 미선택</u> 상태입니다 — <b>＋ 캘린더 추가</b>로 본인 캘린더를 직접 고르세요.</li>' +
          '<li>모바일은 <b>아래쪽 메뉴(캘린더·업무·시설·자원·소통·홍보·인사·설정)</b>를 눌러 이동합니다.</li>' +
          '<li>오른쪽 위 <b>⚙️ 설정</b>에서 내 정보·색상을 바꿀 수 있습니다.</li>' +
        '</ul>' +
        '<div class="ob-opts">' +
          '<label class="ob-opt"><input type="checkbox" id="ob-forever"> 다시 보지 않기</label>' +
          '<label class="ob-opt"><input type="checkbox" id="ob-day"> 하루 동안 보지 않기</label>' +
        '</div>' +
        '<div class="ob-btns"><button id="ob-start" class="ob-btn-primary">시작하기</button></div>' +
      '</div>';
    document.body.appendChild(ov);

    function close(save) {
      if (save) {
        if (document.getElementById('ob-forever').checked) setDismiss('forever');
        else if (document.getElementById('ob-day').checked) setDismiss('day');
      }
      var o = document.getElementById('ob-overlay'); if (o) o.remove();
    }
    // 두 옵션은 동시에 켜지지 않게
    document.getElementById('ob-forever').addEventListener('change', function () { if (this.checked) document.getElementById('ob-day').checked = false; });
    document.getElementById('ob-day').addEventListener('change', function () { if (this.checked) document.getElementById('ob-forever').checked = false; });
    document.getElementById('ob-start').addEventListener('click', function () { close(true); });
    document.getElementById('ob-x').addEventListener('click', function () { close(true); });
    ov.addEventListener('click', function (e) { if (e.target === ov) close(true); });
  }
  function showGuide(force) {
    if (!force && isDismissed()) return;
    if (document.getElementById('ob-overlay')) return;
    buildGuide();
  }

  /* ── 시작 ──────────────────────────────────────────────── */
  function start() {
    applyTooltips();
    bindHoverTips();
    // 메뉴가 동적으로 재구성되면 툴팁 다시 부착
    if (window.MutationObserver) {
      var nav = document.querySelector('.desktop-tab-nav') || document.body;
      try { new MutationObserver(function () { applyTooltips(); }).observe(nav, { childList: true, subtree: true }); } catch (e) {}
    }
    // 로그인 시 안내(이메일 확정 후) — 계정별 표시
    if (window.Auth && Auth.onAuthChange) {
      Auth.onAuthChange(function (loggedIn) {
        if (loggedIn) setTimeout(function () { applyTooltips(); showGuide(false); }, 1800);
      });
    }
    // 이미 로그인 상태(새로고침)면 한 번 시도
    setTimeout(function () { applyTooltips(); if (window.Auth && Auth.isLoggedIn && Auth.isLoggedIn()) showGuide(false); }, 2200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.Onboarding = {
    showGuide: function () { showGuide(true); },
    applyTooltips: applyTooltips
  };
})();
