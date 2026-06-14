'use strict';
/**
 * gestures.js — 모달 닫기 보강 + 캘린더 좌우 스와이프
 *
 * ① 일정 추가/빠른 업무 등록 모달: X·배경/빈영역 탭·헤더 스와이프(상하)로 닫힘
 * ② 캘린더: 좌우 스와이프로 이전/다음 달(주) 이동
 */
(function () {
  function hide(m) { if (m) m.hidden = true; }

  var STRUCT = ['modal', 'modal-backdrop', 'modal-dialog', 'modal-body', 'modal-header',
                'modal-footer', 'qt-modal-dialog', 'qt-modal-body', 'qt-modal-header', 'qt-modal-footer'];
  function isStruct(el) {
    if (!el || !el.classList) return false;
    for (var i = 0; i < STRUCT.length; i++) { if (el.classList.contains(STRUCT[i])) return true; }
    return false;
  }
  function bindModal(id) {
    var m = document.getElementById(id);
    if (!m || m._gReady) return; m._gReady = true;
    // 닫기 버튼 / 배경 / 빈 영역(컨트롤이 아닌 구조 영역) 탭 → 닫기
    m.addEventListener('click', function (e) {
      if (e.target.closest('[data-close-modal], .modal-close, #qt-close-btn, #qt-backdrop, #event-cancel-btn')) { hide(m); return; }
      if (isStruct(e.target)) hide(m);
    });
    // 헤더를 위/아래로 스와이프 → 닫기
    var header = m.querySelector('.modal-header, .qt-modal-header');
    if (header) {
      var sy = 0, sx = 0, on = false;
      header.addEventListener('touchstart', function (e) { var t = e.touches[0]; sy = t.clientY; sx = t.clientX; on = true; }, { passive: true });
      header.addEventListener('touchend', function (e) {
        if (!on) return; on = false; var t = e.changedTouches[0];
        var dy = t.clientY - sy, dx = t.clientX - sx;
        if (Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx)) hide(m);
      }, { passive: true });
    }
  }

  // 캘린더 좌우 스와이프 → 이전/다음
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
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        var btn = document.getElementById(dx < 0 ? 'next-period' : 'prev-period');
        if (btn) btn.click();
      }
    }, { passive: true });
  }

  function start() {
    bindModal('event-modal');   // 일정 추가
    bindModal('qt-modal');      // 빠른 업무 등록
    bindCalSwipe();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
