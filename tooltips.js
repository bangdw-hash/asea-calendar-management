'use strict';
/**
 * tooltips.js — 앱 전역 버튼 툴팁 자동 적용
 *  - 모든 클릭 가능한 요소(button, a[href], [role=button], .btn, .tab-btn 등)에 마우스 hover 설명(title) 부여
 *  - 이미 title이 있으면 존중하고 건드리지 않음
 *  - 주요/모호한 버튼은 큐레이션 설명(MAP), 나머지는 라벨(텍스트·aria-label·svg title)에서 자동 생성
 *  - 동적으로 추가되는 버튼도 MutationObserver로 자동 적용
 */
(function () {
  // 큐레이션 설명(요소 id 기준) — 아이콘만 있거나 의미가 모호한 주요 버튼들
  var MAP = {
    // 상단/계정
    'sync-calendars-btn': '내 구글 캘린더 목록을 다시 불러옵니다',
    'logout-btn': '현재 계정에서 로그아웃합니다',
    'quick-fab': '빠른 업무 등록 창을 엽니다 (드래그로 위치 이동 · Ctrl+Alt+R)',
    // 캘린더 툴바
    'tasks-import-btn': '구글 할일(나의 할일)을 캘린더로 가져옵니다',
    'tasks-window-nav-btn': '나의 할일 작업창(팝업)을 엽니다 — 조회·추가·완료·캘린더 등록',
    'cal-share-nav-btn': '캘린더 공유 페이지를 새 창으로 엽니다',
    'calendar-filter-btn': '표시할 캘린더(범례)를 선택/숨깁니다',
    'print-cal-btn': '달력을 인쇄하거나 PDF로 저장합니다',
    'add-event-btn': '새 일정을 추가합니다',
    'csv-bulk-btn': 'CSV 파일로 여러 일정을 한 번에 등록합니다',
    // 일정 우클릭 메뉴
    'ev-ctx-delete': '이 일정을 삭제합니다',
    'ev-ctx-repeat': '이 일정의 반복(매주/매월 등)을 설정합니다',
    'ev-ctx-split': '연속(여러 날) 일정을 삭제하고 시작·종료 2개의 종일 일정으로 구글 캘린더에 분리합니다',
    'ev-ctx-allday': '시간 일정을 종일 일정으로 바꿉니다',
    'ev-ctx-share': '이 일정을 공유합니다',
    // 일정발췌(이미 대부분 title 있음 — 보강)
    'run-extract-btn': '업로드한 PDF에서 AI가 일정을 자동 추출합니다',
    'extract-save-api-btn': 'Claude API 키를 저장합니다',
    'extract-test-api-btn': 'Claude API 연결이 정상인지 점검합니다',
    // 나의 할일 작업창
    'tw-refresh': '목록을 새로고침합니다',
    'tw-open-google': '구글 할일 페이지를 새 창으로 엽니다',
    'tw-add-btn': '입력한 새 할일을 추가합니다',
    'tw-register': '선택한 할일을 구글 캘린더에 등록합니다',
    'tw-sortdate': '할일을 마감일 빠른 순으로 정렬합니다(영구 반영)',
    'tw-complete': '선택한 할일을 완료 처리합니다',
    'tw-uncomplete': '선택한 할일의 완료를 해제합니다',
    'tw-clearsel': '선택을 모두 해제합니다',
    'tw-cal-reload': '등록할 캘린더 목록을 불러옵니다',
    // 설정/클라우드
    'cloud-save-settings-btn': '설정을 클라우드에 저장합니다',
    'cloud-sync-now-btn': '지금 클라우드와 동기화합니다'
  };

  // 라벨에서 자동 설명 생성 (aria-label > 보이는 텍스트 > svg <title> > value > title속성)
  function labelOf(el) {
    var t = (el.getAttribute('aria-label') || '').trim();
    if (!t) {
      // 보이는 텍스트(아이콘/배지 SVG 제외하고 텍스트만)
      t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    }
    if (!t) { var s = el.querySelector('svg title, title'); if (s) t = (s.textContent || '').trim(); }
    if (!t && el.value) t = String(el.value).trim();
    // 이모지만 남는 경우 → 설명 가치 낮음. 그래도 없는 것보다 나으니 유지하되 길이 제한.
    return t.slice(0, 80);
  }

  function isInteractive(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag === 'BUTTON') return true;
    if (tag === 'A' && el.getAttribute('href')) return true;
    if (tag === 'INPUT') { var ty = (el.getAttribute('type') || '').toLowerCase(); return ty === 'button' || ty === 'submit'; }
    if (el.getAttribute && el.getAttribute('role') === 'button') return true;
    if (el.classList && (el.classList.contains('btn') || el.classList.contains('tab-btn') ||
        el.classList.contains('nav-cat-btn') || el.classList.contains('bnav-btn') || el.classList.contains('mnav-cat') ||
        el.classList.contains('ev-ctx-item') || el.classList.contains('nav-sheet-item') || el.classList.contains('cal-jump-qbtn'))) return true;
    if (el.hasAttribute && el.hasAttribute('onclick')) return true;
    return false;
  }

  function enhance(root) {
    var nodes = (root || document).querySelectorAll(
      'button, a[href], input[type="button"], input[type="submit"], [role="button"], ' +
      '.btn, .tab-btn, .nav-cat-btn, .bnav-btn, .mnav-cat, .ev-ctx-item, .nav-sheet-item, .cal-jump-qbtn, [onclick]'
    );
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.dataset && el.dataset.tipDone) continue;
      if (!isInteractive(el)) continue;
      var existing = el.getAttribute('title');
      if (existing && existing.trim()) { if (el.dataset) el.dataset.tipDone = '1'; continue; }
      var desc = (el.id && MAP[el.id]) || labelOf(el);
      if (desc) el.setAttribute('title', desc);
      if (el.dataset) el.dataset.tipDone = '1';
    }
  }

  var _t;
  function schedule() { clearTimeout(_t); _t = setTimeout(function () { enhance(document); }, 300); }

  function start() {
    enhance(document);
    if (window.MutationObserver) {
      try {
        new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
      } catch (e) {}
    }
    window.AseaTooltips = { enhance: function () { enhance(document); }, MAP: MAP };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
