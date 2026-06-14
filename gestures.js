'use strict';
/**
 * gestures.js — 모달 닫기/스와이프 + 일정·달력 좌우 이동 + 전환 애니메이션
 *  (transform/opacity 기반이라 가볍게 동작)
 */
(function () {
  function hide(m) { if (m) m.hidden = true; }
  var CONTROL = 'input, textarea, select, button, a, [contenteditable], label, .event-cal-chip, .qt-cal-chip, .qt-task-item, .chip, .form-input';
  function isControl(el) { return !!(el && el.closest && el.closest(CONTROL)); }

  // 위로 슬라이드하며 닫기
  function slideClose(m, dialog) {
    if (!dialog) { hide(m); return; }
    if (m.id === 'event-modal') {                 // 전체화면 모달: 위로 슬라이드
      dialog.style.transition = 'transform .2s ease, opacity .2s ease';
      dialog.style.transform = 'translateY(-110%)';
      dialog.style.opacity = '0';
    } else {                                       // 중앙 모달: 페이드(중앙정렬 transform 보존)
      dialog.style.transition = 'opacity .18s ease';
      dialog.style.opacity = '0';
    }
    setTimeout(function () {
      hide(m);
      dialog.style.transition = ''; dialog.style.transform = ''; dialog.style.opacity = '';
    }, 195);
  }

  // 좌우 슬라이드하며 이전/다음 일정
  function slideNav(dialog, dir) {
    dialog.style.transition = 'transform .15s ease, opacity .15s ease';
    dialog.style.transform = 'translateX(' + (dir > 0 ? -48 : 48) + 'px)';
    dialog.style.opacity = '0.25';
    setTimeout(function () {
      if (window._eventNav) window._eventNav(dir);
      var d2 = document.querySelector('#event-modal .modal-dialog') || dialog;
      d2.style.transition = 'none';
      d2.style.transform = 'translateX(' + (dir > 0 ? 48 : -48) + 'px)';
      d2.style.opacity = '0.25';
      requestAnimationFrame(function () {
        d2.style.transition = 'transform .17s ease, opacity .17s ease';
        d2.style.transform = 'translateX(0)';
        d2.style.opacity = '1';
        setTimeout(function () { d2.style.transition = ''; d2.style.transform = ''; d2.style.opacity = ''; }, 180);
      });
    }, 150);
  }

  function bindModal(id) {
    var m = document.getElementById(id);
    if (!m || m._gReady) return; m._gReady = true;
    var dialog = m.querySelector('.modal-dialog, .qt-modal-dialog') || m;

    m.addEventListener('click', function (e) {
      if (e.target.closest('[data-close-modal], .modal-close, #qt-close-btn, #qt-backdrop')) { hide(m); return; }
      if (!isControl(e.target)) hide(m);
    });

    var sx = 0, sy = 0, on = false, ctrlStart = false, footerStart = false, st = 0;
    dialog.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { on = false; return; }
      var t = e.touches[0]; sx = t.clientX; sy = t.clientY; on = true; st = Date.now();
      ctrlStart = isControl(e.target);
      footerStart = !!(e.target.closest && e.target.closest('.modal-footer'));
    }, { passive: true });
    dialog.addEventListener('touchend', function (e) {
      if (!on) return; on = false;
      if (footerStart) return;   // 하단 메뉴 = 가로 스크롤
      var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy;
      var dt = Date.now() - st;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        if (id === 'event-modal' && window._eventNav) slideNav(dialog, dx < 0 ? 1 : -1);
        return;
      }
      // 위로 "빠르게 튕기는(플릭)" 동작만 닫기 — 천천히 올려 내용 보는 건 닫지 않음
      var vy = Math.abs(dy) / Math.max(dt, 1);   // px/ms
      if (dy < -70 && Math.abs(dy) > Math.abs(dx) && !ctrlStart && dt < 300 && vy > 0.5) slideClose(m, dialog);
    }, { passive: true });
  }

  // 달력 좌우 슬라이드 → 이전/다음
  function calSlide(dir) {                 // dir<0: 왼쪽 스와이프 = 다음
    var btn = document.getElementById(dir < 0 ? 'next-period' : 'prev-period');
    if (!btn) return;
    var grid = document.getElementById('calendar-grid');
    if (!grid) { btn.click(); return; }
    grid.style.transition = 'transform .14s ease, opacity .14s ease';
    grid.style.transform = 'translateX(' + (dir < 0 ? -40 : 40) + 'px)';
    grid.style.opacity = '0.35';
    setTimeout(function () {
      btn.click();   // 재렌더(같은 #calendar-grid 엘리먼트 재사용)
      var g2 = document.getElementById('calendar-grid') || grid;
      g2.style.transition = 'none';
      g2.style.transform = 'translateX(' + (dir < 0 ? 40 : -40) + 'px)';
      g2.style.opacity = '0.35';
      requestAnimationFrame(function () {
        g2.style.transition = 'transform .16s ease, opacity .16s ease';
        g2.style.transform = 'translateX(0)';
        g2.style.opacity = '1';
        setTimeout(function () { g2.style.transition = ''; g2.style.transform = ''; g2.style.opacity = ''; }, 170);
      });
    }, 140);
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
      if (!on) return; on = false;
      if (window._calRangeSelecting) return;   // 기간 드래그 중엔 월 전환 스와이프 무시
      var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3) calSlide(dx < 0 ? -1 : 1);
    }, { passive: true });
  }

  function start() {
    bindModal('event-modal');
    bindModal('qt-modal');
    bindCalSwipe();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
