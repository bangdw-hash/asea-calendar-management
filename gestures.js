'use strict';
/**
 * gestures.js — 모달 닫기 보강 + 일정 좌우 이동 + 캘린더 좌우 스와이프
 *
 * ① 일정 추가/수정·빠른 업무 등록 모달
 *    - X / 배경 / 빈 영역(입력칸·버튼이 아닌 곳) 탭 → 닫힘
 *    - 빈 영역에서 위로 스와이프 → 닫힘
 *    - 일정 수정: 좌우 스와이프 → 이전/다음 일정
 * ② 캘린더: 좌우 스와이프 → 이전/다음 달(주)
 */
(function () {
  function hide(m) { if (m) m.hidden = true; }
  // 컨트롤(입력/버튼/링크/칩)인지 — 이것이면 닫기 동작 제외
  var CONTROL = 'input, textarea, select, button, a, [contenteditable], label, .event-cal-chip, .qt-cal-chip, .qt-task-item, .chip, .form-input';
  function isControl(el) { return !!(el && el.closest && el.closest(CONTROL)); }

  function bindModal(id) {
    var m = document.getElementById(id);
    if (!m || m._gReady) return; m._gReady = true;

    // 탭으로 닫기: 닫기버튼/배경/컨트롤이 아닌 빈 영역
    m.addEventListener('click', function (e) {
      if (e.target.closest('[data-close-modal], .modal-close, #qt-close-btn, #qt-backdrop')) { hide(m); return; }
      if (!isControl(e.target)) hide(m);
    });

    // 스와이프
    var sx = 0, sy = 0, on = false, ctrlStart = false;
    var dialog = m.querySelector('.modal-dialog, .qt-modal-dialog') || m;
    dialog.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { on = false; return; }
      var t = e.touches[0]; sx = t.clientX; sy = t.clientY; on = true;
      ctrlStart = isControl(e.target);
    }, { passive: true });
    dialog.addEventListener('touchend', function (e) {
      if (!on) return; on = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy;
      // 좌우 스와이프 → 일정 수정 시 이전/다음 일정
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        if (id === 'event-modal' && window._eventNav) window._eventNav(dx < 0 ? 1 : -1);
        return;
      }
      // 위로 스와이프(빈 영역에서 시작) → 닫기
      if (dy < -55 && Math.abs(dy) > Math.abs(dx) && !ctrlStart) hide(m);
    }, { passive: true });
  }

  function bindCalSwipe() {
    var cont = document.getElementById('calendar-container');
    if (!cont || cont._gSwipe) return; cont._gSwipe = true;
    var sx = 0, sy = 0, on = false;
    cont.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { on = false; return; }
      var t = e.touches[0]; sx = t.clientX; sy = t.clientY; on = true;
    }, { passive: true });
    cont.addEventListener('touchend', function (e) {
      if (!on) return; on = false; var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        var btn = document.getElementById(dx < 0 ? 'next-period' : 'prev-period');
        if (btn) btn.click();
      }
    }, { passive: true });
  }

  function start() {
    bindModal('event-modal');
    bindModal('qt-modal');
    bindCalSwipe();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
