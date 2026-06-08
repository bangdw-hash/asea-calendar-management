'use strict';

/**
 * facility-request.js — 대관신청 공개 폼 (로그인 불필요)
 *
 * URL 파라미터:
 *   ?proxy=<GAS 알림 프록시 URL>   — 필수. GAS 배포 URL.
 *   ?inst=<기관명>                  — 선택. 신청 소속 기본값.
 *
 * 사용 예:
 *   facility-request.html?proxy=https://script.google.com/macros/s/XXX/exec
 */

(function () {
  // ── URL 파라미터 파싱 ──
  var params    = new URLSearchParams(location.search);
  var PROXY_URL = params.get('proxy') || localStorage.getItem('asea_facility_proxy_url') || '';
  var INST_DEFAULT = params.get('inst') || '';

  // ── 빌딩 데이터 캐시 ──
  var _buildings = [];

  // ── DOM 헬퍼 ──
  function $(id) { return document.getElementById(id); }

  function showAlert(msg, type) {
    var el = $('fr-alert');
    el.className = 'fr-alert ' + (type || 'error');
    el.textContent = msg;
    el.style.display = '';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function hideAlert() { $('fr-alert').style.display = 'none'; }

  // ── 초기화 ──
  function init() {
    if (!PROXY_URL) {
      showAlert('대관신청 서비스가 아직 설정되지 않았습니다. 담당자에게 문의하세요.', 'error');
      var form = $('fr-form');
      if (form) form.style.display = 'none';
      return;
    }

    // 소속 기본값
    if (INST_DEFAULT) {
      var orgEl = $('fr-org');
      if (orgEl) orgEl.value = INST_DEFAULT;
    }

    loadBuildings();
    $('fr-building').addEventListener('change', onBuildingChange);
    $('fr-form').addEventListener('submit', onSubmit);
  }

  // ── 건물 목록 로드 ──
  async function loadBuildings() {
    var bSel = $('fr-building');
    bSel.innerHTML = '<option value="">불러오는 중...</option>';
    bSel.disabled = true;
    try {
      var res  = await fetch(PROXY_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'getFacilityBuildings' })
      });
      var data = await res.json();
      if (!data.ok) throw new Error(data.error || '건물 목록 로드 실패');
      _buildings = data.list || [];
      bSel.innerHTML = '<option value="">건물을 선택하세요</option>';
      _buildings.forEach(function(b) {
        var opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.buildingName;
        bSel.appendChild(opt);
      });
      bSel.disabled = false;
    } catch(e) {
      bSel.innerHTML = '<option value="">건물 목록을 불러올 수 없습니다</option>';
      showAlert('건물 목록 로드 오류: ' + e.message, 'error');
    }
  }

  function onBuildingChange() {
    var bId  = $('fr-building').value;
    var rSel = $('fr-room');
    rSel.innerHTML = '<option value="">호실을 선택하세요</option>';
    var bld = _buildings.find(function(b){ return b.id === bId; });
    if (bld && bld.rooms && bld.rooms.length) {
      bld.rooms.forEach(function(r) {
        var opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name + (r.capacity ? ' (' + r.capacity + '인)' : '');
        rSel.appendChild(opt);
      });
    } else {
      rSel.innerHTML = '<option value="">(호실 정보 없음)</option>';
    }
  }

  // ── 폼 제출 ──
  async function onSubmit(e) {
    e.preventDefault();
    hideAlert();

    var bId      = $('fr-building').value;
    var rId      = $('fr-room').value;
    var startAt  = $('fr-start').value;
    var endAt    = $('fr-end').value;
    var title    = ($('fr-title').value || '').trim();
    var purpose  = ($('fr-purpose').value || '').trim();
    var attendees= ($('fr-attendees').value || '').trim();
    var name     = ($('fr-name').value || '').trim();
    var org      = ($('fr-org').value || '').trim();
    var phone    = ($('fr-phone').value || '').trim();
    var email    = ($('fr-email').value || '').trim();
    var agree    = $('fr-agree').checked;

    // 검증
    if (!bId)    { showAlert('건물을 선택하세요.'); return; }
    if (!rId)    { showAlert('호실을 선택하세요.'); return; }
    if (!startAt){ showAlert('시작 일시를 입력하세요.'); return; }
    if (!endAt)  { showAlert('종료 일시를 입력하세요.'); return; }
    if (endAt <= startAt) { showAlert('종료 일시가 시작 일시보다 늦어야 합니다.'); return; }
    if (!title)  { showAlert('행사 제목을 입력하세요.'); return; }
    if (!name)   { showAlert('성명을 입력하세요.'); return; }
    if (!org)    { showAlert('소속/기관을 입력하세요.'); return; }
    if (!phone)  { showAlert('연락처를 입력하세요.'); return; }
    if (!email || email.indexOf('@') < 0) { showAlert('올바른 이메일 주소를 입력하세요.'); return; }
    if (!agree)  { showAlert('개인정보 수집·이용 동의가 필요합니다.'); return; }

    var bld  = _buildings.find(function(b){ return b.id === bId; }) || {};
    var room = (bld.rooms || []).find(function(r){ return r.id === rId; }) || {};

    var btn = $('fr-submit-btn');
    btn.disabled    = true;
    btn.textContent = '신청 중...';

    try {
      var res = await fetch(PROXY_URL, {
        method: 'POST',
        body: JSON.stringify({
          action          : 'submitFacilityRequest',
          buildingId      : bId,
          buildingName    : bld.buildingName || bId,
          roomId          : rId,
          roomName        : room.name || rId,
          title           : title,
          startAt         : startAt,
          endAt           : endAt,
          purpose         : purpose,
          attendees       : attendees,
          applicantName   : name,
          applicantOrg    : org,
          applicantPhone  : phone,
          applicantEmail  : email,
        })
      });
      var data = await res.json();
      if (!data.ok) throw new Error(data.error || '신청 실패');

      // 완료 화면
      $('fr-form').style.display   = 'none';
      $('fr-success').style.display = '';
      $('fr-success-email').textContent = email;

    } catch(e) {
      showAlert('신청 중 오류가 발생했습니다: ' + e.message, 'error');
      btn.disabled    = false;
      btn.textContent = '신청하기';
    }
  }

  // ── 실행 ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
