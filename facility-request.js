'use strict';

/**
 * facility-request.js — 대관신청 공개 폼 (로그인 불필요)
 *
 * URL 파라미터:
 *   ?proxy=<GAS 알림 프록시 URL>  — 필수
 *   ?inst=<기관명>                 — 선택 (소속 기본값)
 */

(function () {

  /* ─────────────────────────────────────────────────
     설정
  ───────────────────────────────────────────────── */
  var params    = new URLSearchParams(location.search);
  var PROXY_URL = params.get('proxy') || localStorage.getItem('asea_facility_proxy_url') || '';
  var INST_DEFAULT = params.get('inst') || '';

  /* ─────────────────────────────────────────────────
     달력 상태
  ───────────────────────────────────────────────── */
  var _calYear, _calMonth;
  var _selDates   = new Set();   // Set<'YYYY-MM-DD'>
  var _dragStart  = null;
  var _dragCur    = null;
  var _isDragging = false;
  var _dragCtrl   = false;
  // 모바일 탭 — 첫 탭 앵커
  var _tapAnchor  = null;

  var _buildings   = [];
  var _feeConfig   = null;  // 현재 선택 호실의 요금 설정
  var _extraVenues = [];    // 추가 장소 블록 [{idx, feeConfig, calc}]

  /* ─────────────────────────────────────────────────
     유틸
  ───────────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function toDateStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function getDateRange(d1, d2) {
    var a = d1 <= d2 ? d1 : d2;
    var b = d1 <= d2 ? d2 : d1;
    var result = [];
    var cur = new Date(a + 'T12:00');
    var end = new Date(b + 'T12:00');
    while (cur <= end) {
      result.push(toDateStr(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }

  // Set → 연속 구간 배열 [{startDate, endDate}]
  function groupRanges(dates) {
    var sorted = Array.from(dates).sort();
    if (!sorted.length) return [];
    var groups = [], cs = sorted[0], ce = sorted[0];
    for (var i = 1; i < sorted.length; i++) {
      var diff = (new Date(sorted[i] + 'T12:00') - new Date(sorted[i - 1] + 'T12:00')) / 86400000;
      if (diff <= 1) { ce = sorted[i]; }
      else { groups.push({ startDate: cs, endDate: ce }); cs = sorted[i]; ce = sorted[i]; }
    }
    groups.push({ startDate: cs, endDate: ce });
    return groups;
  }

  function curDragRange() {
    if (!_isDragging || !_dragStart || !_dragCur) return new Set();
    return new Set(getDateRange(_dragStart, _dragCur));
  }

  function formatDateKo(str) {
    if (!str) return '';
    var d    = new Date(str + 'T12:00');
    var days = ['일', '월', '화', '수', '목', '금', '토'];
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일(' + days[d.getDay()] + ')';
  }

  /* ─────────────────────────────────────────────────
     알림 표시
  ───────────────────────────────────────────────── */
  function showAlert(msg, type) {
    var el = $('fr-alert');
    el.className = 'fr-alert ' + (type || 'error');
    el.textContent = msg;
    el.style.display = '';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function hideAlert() { $('fr-alert').style.display = 'none'; }

  /* ─────────────────────────────────────────────────
     달력 렌더링
  ───────────────────────────────────────────────── */
  function renderCalendar() {
    var cal = $('fr-calendar');
    if (!cal) return;
    $('fr-cal-title').textContent = _calYear + '년 ' + (_calMonth + 1) + '월';

    var today    = new Date();
    var todayStr = toDateStr(today);
    var firstDay = new Date(_calYear, _calMonth, 1).getDay();
    var lastDate = new Date(_calYear, _calMonth + 1, 0).getDate();

    var html = '<div class="fr-cal-grid">';
    ['일', '월', '화', '수', '목', '금', '토'].forEach(function (d) {
      html += '<div class="fr-cal-dow">' + d + '</div>';
    });

    for (var i = 0; i < firstDay; i++) {
      html += '<div class="fr-cal-cell fr-cal-empty"></div>';
    }

    for (var d = 1; d <= lastDate; d++) {
      var dateStr = _calYear + '-' + pad(_calMonth + 1) + '-' + pad(d);
      var isPast  = dateStr < todayStr;
      var isToday = dateStr === todayStr;
      var isSel   = _selDates.has(dateStr);
      var cls     = 'fr-cal-cell';
      if (isPast)  cls += ' fr-cal-past';
      if (isToday) cls += ' fr-cal-today';
      if (isSel)   cls += ' fr-cal-sel';
      html += '<div class="' + cls + '" data-date="' + dateStr + '">';
      html += '<span class="fr-cal-dn">' + d + '</span>';
      html += '</div>';
    }
    html += '</div>';
    cal.innerHTML = html;
    updateHighlight();
  }

  function updateHighlight() {
    var cal = $('fr-calendar');
    if (!cal) return;
    var dragRange = curDragRange();

    cal.querySelectorAll('.fr-cal-cell[data-date]').forEach(function (cell) {
      var d = cell.dataset.date;
      var inSel  = _selDates.has(d);
      var inDrag = dragRange.has(d);
      cell.classList.toggle('fr-cal-sel',  inSel || inDrag);
      cell.classList.toggle('fr-cal-drag', inDrag && !inSel);
    });

    // 선택 상태 표시
    var allDates = new Set(Array.from(_selDates));
    dragRange.forEach(function (d) { allDates.add(d); });
    var total = allDates.size;

    var statusEl = $('fr-sel-status');
    var clearBtn = $('fr-clear-sel');
    var noDateEl = $('fr-no-date-msg');

    if (total > 0) {
      statusEl.textContent = '📅 ' + total + '일 선택됨';
      statusEl.style.display = '';
      clearBtn.style.display = '';
      if (noDateEl) noDateEl.style.display = 'none';
    } else {
      statusEl.style.display = 'none';
      clearBtn.style.display = 'none';
      if (noDateEl) noDateEl.style.display = '';
    }
  }

  /* ─────────────────────────────────────────────────
     구간별 시간 입력 렌더링
  ───────────────────────────────────────────────── */
  function renderTimeRanges() {
    var container = $('fr-time-ranges');
    if (!container) return;
    container.innerHTML = '';

    var ranges = groupRanges(_selDates);
    ranges.forEach(function (range, i) {
      var label = range.startDate === range.endDate
        ? formatDateKo(range.startDate)
        : formatDateKo(range.startDate) + ' ~ ' + formatDateKo(range.endDate);

      var row = document.createElement('div');
      row.className = 'fr-time-range-row';
      row.innerHTML =
        '<div class="fr-time-range-label">' +
          '구간 ' + (i + 1) +
          '<span class="fr-time-range-dates">' + label + '</span>' +
          '<button type="button" class="fr-time-range-del" title="이 구간 제거">×</button>' +
        '</div>' +
        '<div class="fr-time-row">' +
          '<div class="fr-field">' +
            '<label class="fr-label">시작 시간 <span class="fr-req">*</span></label>' +
            '<input type="datetime-local" class="fr-input fr-range-start"' +
            ' value="' + range.startDate + 'T09:00" min="' + range.startDate + 'T00:00" max="' + range.endDate + 'T23:59">' +
          '</div>' +
          '<div class="fr-field">' +
            '<label class="fr-label">종료 시간 <span class="fr-req">*</span></label>' +
            '<input type="datetime-local" class="fr-input fr-range-end"' +
            ' value="' + range.endDate + 'T18:00" min="' + range.startDate + 'T00:00" max="' + range.endDate + 'T23:59">' +
          '</div>' +
        '</div>';

      row.querySelector('.fr-time-range-del').addEventListener('click', function () {
        getDateRange(range.startDate, range.endDate).forEach(function (d) { _selDates.delete(d); });
        renderCalendar();
        renderTimeRanges();
      });

      container.appendChild(row);
    });

    updateFeeEstimate();
  }

  /* ─────────────────────────────────────────────────
     달력 이벤트 (드래그 선택)
  ───────────────────────────────────────────────── */
  function initCalendarEvents() {
    var cal = $('fr-calendar');
    if (!cal) return;

    /* ── 마우스 드래그 ── */
    cal.addEventListener('mousedown', function (e) {
      var cell = e.target.closest('.fr-cal-cell[data-date]');
      if (!cell || cell.classList.contains('fr-cal-past')) return;
      e.preventDefault();
      _dragCtrl  = e.ctrlKey || e.metaKey;
      _dragStart = cell.dataset.date;
      _dragCur   = cell.dataset.date;
      _isDragging = true;
      if (!_dragCtrl) _selDates.clear();
      updateHighlight();
    });

    cal.addEventListener('mousemove', function (e) {
      if (!_isDragging) return;
      var cell = e.target.closest('.fr-cal-cell[data-date]');
      if (!cell || cell.classList.contains('fr-cal-past')) return;
      if (cell.dataset.date === _dragCur) return;
      _dragCur = cell.dataset.date;
      updateHighlight();
    });

    document.addEventListener('mouseup', function (e) {
      if (!_isDragging) return;
      var dragRange = curDragRange();
      dragRange.forEach(function (d) { _selDates.add(d); });
      _isDragging = false;
      _dragStart  = null;
      _dragCur    = null;
      updateHighlight();
      renderTimeRanges();
      updateSteps(_currentStep);
    });

    /* ── 터치 (모바일) ── */
    cal.addEventListener('touchstart', function (e) {
      var cell = e.touches[0] && document.elementFromPoint(
        e.touches[0].clientX, e.touches[0].clientY
      );
      if (!cell) return;
      cell = cell.closest('.fr-cal-cell[data-date]');
      if (!cell || cell.classList.contains('fr-cal-past')) return;

      var d = cell.dataset.date;

      if (_tapAnchor === null) {
        // 첫 탭: 앵커 설정
        _tapAnchor = d;
        _selDates.clear();
        _selDates.add(d);
        updateHighlight();
        renderTimeRanges();
      } else {
        // 두 번째 탭: 앵커~현재 범위 선택
        getDateRange(_tapAnchor, d).forEach(function (ds) { _selDates.add(ds); });
        _tapAnchor = null;
        updateHighlight();
        renderTimeRanges();
        updateSteps(_currentStep);
      }
      e.preventDefault();
    }, { passive: false });

    cal.addEventListener('touchmove', function (e) {
      // 스크롤 방해 방지
      if (_isDragging) e.preventDefault();
    }, { passive: false });
  }

  /* ─────────────────────────────────────────────────
     건물 목록 로드 (요금관리 탭 localStorage에서 읽기)
  ───────────────────────────────────────────────── */
  function loadBuildings() {
    var bSel = $('fr-building');
    if (!bSel) return;
    _buildings = [];
    bSel.innerHTML = '<option value="">건물을 선택하세요</option>';
    bSel.disabled  = false;

    if (!window.FacilityFeeModule) {
      bSel.innerHTML = '<option value="">시설 데이터를 불러올 수 없습니다</option>';
      return;
    }

    var fees = FacilityFeeModule.loadFees();
    if (!fees.length) {
      bSel.innerHTML = '<option value="">등록된 시설이 없습니다 (관리자: 요금 관리 탭에서 등록)</option>';
      return;
    }

    var seenBuildings = {};
    fees.forEach(function(fee) {
      var bn = (fee.buildingName || '기타').trim();
      if (!seenBuildings[bn]) {
        seenBuildings[bn] = { id: bn, buildingName: bn, rooms: [] };
        _buildings.push(seenBuildings[bn]);
      }
      seenBuildings[bn].rooms.push({
        id:       fee.id,
        name:     fee.roomName || '',
        capacity: fee.capacity || 0
      });
    });

    _buildings.forEach(function(b) {
      var opt = document.createElement('option');
      opt.value       = b.id;
      opt.textContent = b.buildingName;
      bSel.appendChild(opt);
    });
  }

  function onRoomChange() {
    var bId  = $('fr-building').value;
    var rId  = $('fr-room').value;
    var bld  = _buildings.find(function(b){ return b.id === bId; }) || {};

    _feeConfig = null;
    var feeEl  = $('fr-fee-info');
    if (!feeEl) return;

    if (!rId || !window.FacilityFeeModule) { feeEl.style.display = 'none'; updateFeeEstimate(); return; }

    var fees = FacilityFeeModule.loadFees();
    var fee  = fees.find(function(f){ return f.id === rId; });
    _feeConfig = fee ? FacilityFeeModule.normalize(fee) : null;

    if (!_feeConfig) { feeEl.style.display = 'none'; updateFeeEstimate(); return; }

    var bn  = _feeConfig.buildingName || bld.buildingName || '';
    var rn  = _feeConfig.roomName     || '';
    var nm  = (_feeConfig.normalStart||'') + '~' + (_feeConfig.normalEnd||'');
    var nr  = FacilityFeeModule.comma(_feeConfig.normalRate || 0) + '원/시간';

    var surchargeHtml = (_feeConfig.surchargeSlots||[]).map(function(slot) {
      var slotLabel = slot.label || '할증';
      var sm = (slot.start||'') + '~' + (slot.end||'');
      var sr = FacilityFeeModule.comma(slot.rate||0) + '원/시간';
      return '<div class="fr-fee-rate-item fr-fee-surge"><span class="fr-fee-tag fr-fee-tag-surge">' + slotLabel + '</span>' + sm + ' · ' + sr + '</div>';
    }).join('');

    feeEl.innerHTML =
      '<div class="fr-fee-card">' +
        '<div class="fr-fee-card-title">💰 ' + bn + ' ' + rn + ' 이용 요금 안내</div>' +
        '<div class="fr-fee-rates">' +
          '<div class="fr-fee-rate-item fr-fee-normal"><span class="fr-fee-tag">평상</span>' + nm + ' · ' + nr + '</div>' +
          surchargeHtml +
        '</div>' +
        (_feeConfig.deposit     ? '<div class="fr-fee-extra">보증금 '  + FacilityFeeModule.comma(_feeConfig.deposit)     + '원 별도</div>' : '') +
        (_feeConfig.cleaningFee ? '<div class="fr-fee-extra">청소비 '  + FacilityFeeModule.comma(_feeConfig.cleaningFee) + '원 별도</div>' : '') +
        (_feeConfig.notes       ? '<div class="fr-fee-note">📌 '       + _feeConfig.notes + '</div>' : '') +
      '</div>';
    feeEl.style.display = '';

    updateFeeEstimate();
  }

  function updateFeeEstimate() {
    var estEl = $('fr-fee-estimate');
    if (!estEl || !_feeConfig || !window.FacilityFeeModule) { if(estEl) estEl.style.display='none'; return; }

    var ranges = [];
    $('fr-time-ranges').querySelectorAll('.fr-time-range-row').forEach(function(row){
      var s = row.querySelector('.fr-range-start');
      var e = row.querySelector('.fr-range-end');
      if (s && e && s.value && e.value) ranges.push({ startAt: s.value, endAt: e.value });
    });

    if (!ranges.length) { estEl.style.display = 'none'; return; }

    var calc = FacilityFeeModule.calcFee(_feeConfig, ranges);
    if (!calc) { estEl.style.display = 'none'; return; }

    var lines = [];
    if (calc.normalHours > 0) lines.push('평상 ' + calc.normalHours.toFixed(1) + '시간 × ' + FacilityFeeModule.comma(_feeConfig.normalRate) + '원 = ' + FacilityFeeModule.comma(calc.normalFee) + '원');
    (calc.surchargeSlots||[]).forEach(function(s) {
      if (s.hours > 0) lines.push(s.label + '할증 ' + s.hours.toFixed(1) + '시간 × ' + FacilityFeeModule.comma(s.rate) + '원 = ' + FacilityFeeModule.comma(s.fee) + '원');
    });
    (calc.timeExtras||[]).forEach(function(ex) {
      if (ex.amount > 0) lines.push(ex.name + ' ' + ex.hours.toFixed(1) + '시간 × ' + FacilityFeeModule.comma(ex.unitRate) + '원 = ' + FacilityFeeModule.comma(ex.amount) + '원');
    });
    (calc.flatExtras||[]).forEach(function(ex) {
      lines.push(ex.name + ' (일괄) ' + FacilityFeeModule.comma(ex.amount) + '원');
    });
    if (calc.hvac && calc.hvac.amount > 0) lines.push('🌡️ 냉난방비 ' + calc.hvac.hours.toFixed(1) + '시간 × ' + FacilityFeeModule.comma(calc.hvac.rate) + '원 = ' + FacilityFeeModule.comma(calc.hvac.amount) + '원 (' + (calc.hvac.months||[]).join('·') + '월)');
    if (calc.deposit > 0) lines.push('보증금 ' + FacilityFeeModule.comma(calc.deposit) + '원');
    if (calc.cleaningFee > 0) lines.push('청소비 ' + FacilityFeeModule.comma(calc.cleaningFee) + '원');

    estEl.innerHTML =
      '<div class="fr-estimate-box">' +
        '<div class="fr-estimate-title">📊 예상 요금</div>' +
        '<div class="fr-estimate-lines">' + lines.map(function(l){ return '<div class="fr-estimate-line">· ' + l + '</div>'; }).join('') + '</div>' +
        (calc.underMin ? '<div class="fr-estimate-warn">⚠️ 최소 ' + calc.minHours + '시간 이용 필요</div>' : '') +
        '<div class="fr-estimate-total">합계: <strong>' + FacilityFeeModule.comma(calc.total) + '원</strong></div>' +
        '<button type="button" class="fr-quote-btn" id="fr-quote-btn">📄 견적서 미리보기</button>' +
      '</div>';

    estEl.style.display = '';

    var qBtn = $('fr-quote-btn');
    if (qBtn) qBtn.addEventListener('click', openCombinedQuoteModal);
  }

  function openQuoteModal(calc) {
    if (!_feeConfig || !window.FacilityFeeModule) return;

    var bId = $('fr-building').value;
    var rId = $('fr-room').value;
    var bld  = _buildings.find(function(b){ return b.id === bId; }) || {};
    var room = (bld.rooms||[]).find(function(r){ return r.id === rId; }) || {};

    var ranges = [];
    $('fr-time-ranges').querySelectorAll('.fr-time-range-row').forEach(function(row){
      var s = row.querySelector('.fr-range-start');
      var e = row.querySelector('.fr-range-end');
      if (s && e) ranges.push({ startAt: s.value, endAt: e.value });
    });

    var info = {
      buildingName: bld.buildingName || '',
      roomName: room.name || '',
      ranges: ranges,
      applicant: {
        name:  ($('fr-name')  && $('fr-name').value)  || '',
        org:   ($('fr-org')   && $('fr-org').value)   || '',
        phone: ($('fr-phone') && $('fr-phone').value) || '',
        email: ($('fr-email') && $('fr-email').value) || ''
      },
      title:     ($('fr-title')     && $('fr-title').value)     || '',
      purpose:   ($('fr-purpose')   && $('fr-purpose').value)   || '',
      attendees: ($('fr-attendees') && $('fr-attendees').value) || '',
      calc: calc,
      feeConfig: _feeConfig
    };

    var modal = $('fr-quote-modal');
    if (!modal) return;

    var previewEl = $('fr-quote-preview');
    if (previewEl) {
      previewEl.innerHTML = '<iframe id="fr-quote-iframe" style="width:100%;height:500px;border:none"></iframe>';
      var iframe = $('fr-quote-iframe');
      if (iframe) {
        var doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(FacilityFeeModule.buildQuoteHTML(info));
        doc.close();
      }
    }

    modal._quoteInfo = info;
    modal.hidden = false;
  }

  function onBuildingChange() {
    var bId  = $('fr-building').value;
    var rSel = $('fr-room');
    rSel.innerHTML = '<option value="">호실을 선택하세요</option>';
    var bld = _buildings.find(function (b) { return b.id === bId; });
    if (bld && bld.rooms && bld.rooms.length) {
      bld.rooms.forEach(function (r) {
        var opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name + (r.capacity ? ' (' + r.capacity + '인)' : '');
        rSel.appendChild(opt);
      });
    } else {
      rSel.innerHTML = '<option value="">(호실 정보 없음)</option>';
    }
  }

  /* ─────────────────────────────────────────────────
     폼 제출
  ───────────────────────────────────────────────── */
  async function onSubmit(e) {
    e.preventDefault();
    hideAlert();

    var bId      = $('fr-building').value;
    var rId      = $('fr-room').value;
    var title    = ($('fr-title').value || '').trim();
    var purpose  = ($('fr-purpose').value || '').trim();
    var attendees= ($('fr-attendees').value || '').trim();
    var name     = ($('fr-name').value || '').trim();
    var org      = ($('fr-org').value || '').trim();
    var phone    = ($('fr-phone').value || '').trim();
    var email    = ($('fr-email').value || '').trim();
    var agree    = $('fr-agree').checked;

    // 구간 수집
    var ranges = [];
    $('fr-time-ranges').querySelectorAll('.fr-time-range-row').forEach(function (row) {
      var start = row.querySelector('.fr-range-start');
      var end   = row.querySelector('.fr-range-end');
      if (start && end) ranges.push({ startAt: start.value, endAt: end.value });
    });

    // 검증
    if (!bId)    { showAlert('건물을 선택하세요.'); return; }
    if (!rId)    { showAlert('호실을 선택하세요.'); return; }
    if (!ranges.length) { showAlert('달력에서 이용 날짜를 선택해 주세요.'); return; }
    for (var i = 0; i < ranges.length; i++) {
      if (!ranges[i].startAt || !ranges[i].endAt) {
        showAlert('구간 ' + (i + 1) + ': 시작/종료 시간을 입력하세요.'); return;
      }
      if (ranges[i].endAt <= ranges[i].startAt) {
        showAlert('구간 ' + (i + 1) + ': 종료 시간이 시작 시간보다 늦어야 합니다.'); return;
      }
    }
    if (!title)  { showAlert('행사 제목을 입력하세요.'); return; }
    if (!name)   { showAlert('성명을 입력하세요.'); return; }
    if (!org)    { showAlert('소속/기관을 입력하세요.'); return; }
    if (!phone)  { showAlert('연락처를 입력하세요.'); return; }
    if (!email || email.indexOf('@') < 0) { showAlert('올바른 이메일 주소를 입력하세요.'); return; }
    if (!agree)  { showAlert('개인정보 수집·이용 동의가 필요합니다.'); return; }

    var bld  = _buildings.find(function (b) { return b.id === bId; }) || {};
    var room = (bld.rooms || []).find(function (r) { return r.id === rId; }) || {};

    var btn = $('fr-submit-btn');
    btn.disabled    = true;
    btn.textContent = '신청 처리 중...';

    try {
      var allVenues = [{ buildingName: bld.buildingName || bId, roomName: room.name || rId, ranges: ranges }];

      // 추가 장소 수집
      _extraVenues.forEach(function(ev) {
        if (!ev || !ev.feeConfig) return;
        var block    = $('fr-ev-block-' + ev.idx);
        if (!block) return;
        var startEl  = block.querySelector('.fr-ev-start');
        var endEl    = block.querySelector('.fr-ev-end');
        var evRanges = [];
        if (startEl && endEl && startEl.value && endEl.value) {
          evRanges.push({ startAt: startEl.value, endAt: endEl.value });
        }
        allVenues.push({ buildingName: ev.feeConfig.buildingName||'', roomName: ev.feeConfig.roomName||'', ranges: evRanges });
      });

      var reqKey = 'asea_facility_requests';
      var reqs   = JSON.parse(localStorage.getItem(reqKey) || '[]');
      var reqId  = 'FR-' + Date.now().toString(36).toUpperCase();

      reqs.push({
        id:             reqId,
        status:         '신청',
        createdAt:      new Date().toISOString(),
        venues:         allVenues,
        buildingName:   allVenues[0].buildingName,
        roomName:       allVenues[0].roomName,
        startAt:        (ranges[0]||{}).startAt || '',
        endAt:          (ranges[ranges.length-1]||{}).endAt || '',
        title:          title,
        purpose:        purpose,
        attendees:      attendees,
        applicantName:  name,
        applicantOrg:   org,
        applicantPhone: phone,
        applicantEmail: email
      });
      localStorage.setItem(reqKey, JSON.stringify(reqs));

      $('fr-form').style.display    = 'none';
      $('fr-success').style.display = '';
      $('fr-success-email').textContent = email;

    } catch (err) {
      showAlert('신청 중 오류가 발생했습니다: ' + err.message, 'error');
      btn.disabled    = false;
      btn.textContent = '신청하기';
    }
  }

  /* ─────────────────────────────────────────────────
     스텝 프로그레스 + URL 해시 + 공유
  ───────────────────────────────────────────────── */

  // 현재 가시 단계 계산 (IntersectionObserver 기반)
  var _currentStep = 1;
  var _sectionMap  = { 'fr-section-1': 1, 'fr-section-2': 2, 'fr-section-3': 3, 'fr-section-4': 4 };

  function getStepDone(step) {
    if (step === 1) {
      return !!($('fr-building').value && $('fr-room').value);
    }
    if (step === 2) {
      return _selDates.size > 0;
    }
    if (step === 3) {
      return !!($('fr-title') && ($('fr-title').value || '').trim());
    }
    if (step === 4) {
      return !!(($('fr-name').value || '').trim() && ($('fr-email').value || '').trim());
    }
    return false;
  }

  function updateSteps(activeStep) {
    _currentStep = activeStep || _currentStep;
    var pct = (_currentStep / 4) * 100;
    var fillEl = $('fr-share-prog-fill');
    var textEl = $('fr-share-step-text');
    var labels = ['시설 선택', '일시 선택', '신청 내용', '신청자 정보'];
    if (fillEl) fillEl.style.width = pct + '%';
    if (textEl) textEl.textContent = _currentStep + '단계 · ' + labels[_currentStep - 1];

    for (var s = 1; s <= 4; s++) {
      var el = $('fr-step-' + s);
      if (!el) continue;
      var done   = getStepDone(s);
      var active = s === _currentStep;
      el.classList.toggle('active', active && !done);
      el.classList.toggle('done',   done);
    }
    // 연결선 색상
    document.querySelectorAll('.fr-step-line').forEach(function (line, i) {
      line.classList.toggle('done', getStepDone(i + 1));
    });

    // URL 해시 업데이트 (replaceState로 히스토리 오염 없이)
    if (history.replaceState) {
      history.replaceState(null, '', '#step=' + _currentStep);
    }
  }

  function initStepObserver() {
    var sections = ['fr-section-1','fr-section-2','fr-section-3','fr-section-4'];
    var stickyH  = ($('fr-steps') || {}).offsetHeight || 56;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var step = _sectionMap[entry.target.id];
          if (step) updateSteps(step);
        }
      });
    }, { rootMargin: '-' + stickyH + 'px 0px -60% 0px', threshold: 0 });

    sections.forEach(function (id) {
      var el = $(id);
      if (el) obs.observe(el);
    });
  }

  // 스텝 아이콘 클릭 → 해당 섹션으로 스크롤
  function initStepClicks() {
    for (var s = 1; s <= 4; s++) {
      (function (step) {
        var btn = $('fr-step-' + step);
        if (!btn) return;
        btn.addEventListener('click', function () {
          var sec = $('fr-section-' + step);
          if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      })(s);
    }
  }

  // 공유 URL 생성 (현재 선택 상태 포함)
  function buildShareUrl() {
    var base = location.origin + location.pathname + location.search;
    var hash = '#step=' + _currentStep;
    // 선택된 날짜 첫째~마지막만 포함 (너무 길어지지 않도록)
    if (_selDates.size > 0) {
      var sorted = Array.from(_selDates).sort();
      hash += '&dates=' + sorted[0] + (sorted.length > 1 ? ',' + sorted[sorted.length - 1] : '');
    }
    var bld = $('fr-building').value;
    var rm  = $('fr-room').value;
    if (bld) hash += '&b=' + encodeURIComponent(bld);
    if (rm)  hash += '&r=' + encodeURIComponent(rm);
    return base + hash;
  }

  function initShareBar() {
    var btn   = $('fr-share-copy-btn');
    var toast = $('fr-share-toast');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var url = buildShareUrl();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(showShareToast);
      } else {
        // fallback
        var ta = document.createElement('textarea');
        ta.value = url;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showShareToast();
      }
    });

    function showShareToast() {
      toast.classList.add('show');
      setTimeout(function () { toast.classList.remove('show'); }, 2000);
    }

    // 폼 필드 변경 시 스텝 상태 갱신
    ['fr-building','fr-room','fr-title','fr-name','fr-email'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', function () { updateSteps(_currentStep); });
    });
  }

  // 페이지 로드 시 URL 해시 → 해당 스텝으로 스크롤
  function restoreFromHash() {
    var hash = location.hash; // e.g. "#step=3&b=B01&r=R02"
    if (!hash) return;
    var m = hash.match(/step=(\d)/);
    if (m) {
      var step = parseInt(m[1], 10);
      if (step >= 1 && step <= 4) {
        setTimeout(function () {
          var sec = $('fr-section-' + step);
          if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 400);
      }
    }
  }

  /* ─────────────────────────────────────────────────
     초기화
  ───────────────────────────────────────────────── */
  function init() {
    // 소속 기본값
    if (INST_DEFAULT) {
      var orgEl = $('fr-org');
      if (orgEl) orgEl.value = INST_DEFAULT;
    }

    // 달력 초기화
    var now    = new Date();
    _calYear   = now.getFullYear();
    _calMonth  = now.getMonth();
    renderCalendar();
    initCalendarEvents();

    // 월 네비
    $('fr-cal-prev').addEventListener('click', function () {
      _calMonth--;
      if (_calMonth < 0) { _calMonth = 11; _calYear--; }
      renderCalendar();
    });
    $('fr-cal-next').addEventListener('click', function () {
      _calMonth++;
      if (_calMonth > 11) { _calMonth = 0; _calYear++; }
      renderCalendar();
    });

    // 선택 초기화
    $('fr-clear-sel').addEventListener('click', function () {
      _selDates.clear();
      _tapAnchor = null;
      renderCalendar();
      renderTimeRanges();
    });

    // 건물 로드 (localStorage 연동)
    loadBuildings();
    $('fr-building').addEventListener('change', function () {
      onBuildingChange();
      updateSteps(_currentStep);
    });
    $('fr-room').addEventListener('change', function () {
      onRoomChange();
      updateSteps(_currentStep);
    });

    // 장소 추가하기
    var addVenueBtn = $('fr-add-venue-btn');
    if (addVenueBtn) addVenueBtn.addEventListener('click', addExtraVenueBlock);

    // 상단/하단 견적서 버튼
    var topQuoteBtn = $('fr-top-quote-btn');
    if (topQuoteBtn) topQuoteBtn.addEventListener('click', openCombinedQuoteModal);
    var botQuoteBtn = $('fr-bot-quote-btn');
    if (botQuoteBtn) botQuoteBtn.addEventListener('click', openCombinedQuoteModal);

    // 시간 입력 변화 감지 → 실시간 요금 계산
    $('fr-time-ranges').addEventListener('change', function(e) {
      if (e.target.classList.contains('fr-range-start') || e.target.classList.contains('fr-range-end')) {
        updateFeeEstimate();
      }
    });

    // 견적서 인쇄 버튼
    var printQuoteBtn = $('fr-quote-print-btn');
    if (printQuoteBtn) {
      printQuoteBtn.addEventListener('click', function() {
        var modal = $('fr-quote-modal');
        if (modal && modal._quoteInfo) FacilityFeeModule.printQuote(modal._quoteInfo);
      });
    }

    // 폼 제출
    $('fr-form').addEventListener('submit', onSubmit);

    // 스텝 프로그레스 초기화
    updateSteps(1);
    initStepObserver();
    initStepClicks();
    initShareBar();
    restoreFromHash();
    initStatusCheck();
  }

  /* ─────────────────────────────────────────────────
     다중 장소 (추가 장소 블록)
  ───────────────────────────────────────────────── */
  function addExtraVenueBlock() {
    var idx = _extraVenues.length;
    _extraVenues.push({ idx: idx, feeConfig: null, calc: null });

    var container = $('fr-extra-venues');
    if (!container) return;

    var block = document.createElement('fieldset');
    block.className = 'fr-fieldset fr-ev-block';
    block.id = 'fr-ev-block-' + idx;

    var bOpts = '';
    _buildings.forEach(function(b) {
      bOpts += '<option value="' + b.id + '">' + b.buildingName + '</option>';
    });

    block.innerHTML =
      '<legend class="fr-legend">➕ 추가 장소 ' + (idx + 1) + '</legend>' +
      '<div style="display:flex;justify-content:flex-end;margin-bottom:8px">' +
        '<button type="button" class="fr-ev-remove-btn" style="background:none;border:1px solid #e0e0e0;border-radius:6px;padding:4px 10px;font-size:12px;color:#888;cursor:pointer">✕ 이 장소 제거</button>' +
      '</div>' +
      '<div class="fr-field">' +
        '<label class="fr-label">건물</label>' +
        '<select class="fr-select fr-ev-building"><option value="">건물 선택</option>' + bOpts + '</select>' +
      '</div>' +
      '<div class="fr-field">' +
        '<label class="fr-label">호실</label>' +
        '<select class="fr-select fr-ev-room"><option value="">건물을 먼저 선택하세요</option></select>' +
      '</div>' +
      '<div id="fr-ev-fee-info-' + idx + '" style="display:none;margin-top:8px"></div>' +
      '<div class="fr-time-row" style="margin-top:10px">' +
        '<div class="fr-field">' +
          '<label class="fr-label">시작 일시 <span class="fr-req">*</span></label>' +
          '<input type="datetime-local" class="fr-input fr-ev-start">' +
        '</div>' +
        '<div class="fr-field">' +
          '<label class="fr-label">종료 일시 <span class="fr-req">*</span></label>' +
          '<input type="datetime-local" class="fr-input fr-ev-end">' +
        '</div>' +
      '</div>' +
      '<div id="fr-ev-est-' + idx + '" style="display:none;margin-top:8px"></div>';

    block.querySelector('.fr-ev-remove-btn').addEventListener('click', function() {
      block.remove();
      _extraVenues[idx] = null;
    });

    var bSel = block.querySelector('.fr-ev-building');
    var rSel = block.querySelector('.fr-ev-room');

    bSel.addEventListener('change', function() {
      var bId = bSel.value;
      var bld = _buildings.find(function(b){ return b.id === bId; }) || {};
      rSel.innerHTML = '<option value="">호실 선택</option>';
      (bld.rooms||[]).forEach(function(r) {
        var opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name + (r.capacity ? ' (' + r.capacity + '인)' : '');
        rSel.appendChild(opt);
      });
      _extraVenues[idx] = { idx: idx, feeConfig: null, calc: null };
      $('fr-ev-fee-info-' + idx).style.display = 'none';
      $('fr-ev-est-'      + idx).style.display = 'none';
    });

    rSel.addEventListener('change', function() {
      var rId = rSel.value;
      var bId = bSel.value;
      var bld = _buildings.find(function(b){ return b.id === bId; }) || {};

      if (!rId || !window.FacilityFeeModule) {
        if (_extraVenues[idx]) _extraVenues[idx].feeConfig = null;
        $('fr-ev-fee-info-' + idx).style.display = 'none';
        return;
      }

      var fees = FacilityFeeModule.loadFees();
      var fee  = fees.find(function(f){ return f.id === rId; });
      var fc   = fee ? FacilityFeeModule.normalize(fee) : null;
      if (_extraVenues[idx]) _extraVenues[idx].feeConfig = fc;

      var infoEl = $('fr-ev-fee-info-' + idx);
      if (fc) {
        var nm = (fc.normalStart||'') + '~' + (fc.normalEnd||'');
        var nr = FacilityFeeModule.comma(fc.normalRate||0) + '원/시간';
        infoEl.innerHTML =
          '<div class="fr-fee-card" style="font-size:13px">' +
            '<div class="fr-fee-card-title">💰 ' + (fc.buildingName||bld.buildingName||'') + ' ' + (fc.roomName||'') + '</div>' +
            '<div class="fr-fee-rate-item fr-fee-normal"><span class="fr-fee-tag">평상</span>' + nm + ' · ' + nr + '</div>' +
          '</div>';
        infoEl.style.display = '';
      } else {
        infoEl.style.display = 'none';
      }

      _updateExtraVenueEst(idx, block);
    });

    block.querySelector('.fr-ev-start').addEventListener('change', function() { _updateExtraVenueEst(idx, block); });
    block.querySelector('.fr-ev-end').addEventListener('change',   function() { _updateExtraVenueEst(idx, block); });

    container.appendChild(block);
  }

  function _updateExtraVenueEst(idx, block) {
    var ev = _extraVenues[idx];
    if (!ev) return;
    var estEl = $('fr-ev-est-' + idx);
    if (!estEl) return;

    if (!ev.feeConfig || !window.FacilityFeeModule) { estEl.style.display = 'none'; return; }

    var startVal = block.querySelector('.fr-ev-start').value;
    var endVal   = block.querySelector('.fr-ev-end').value;
    if (!startVal || !endVal || endVal <= startVal) { estEl.style.display = 'none'; return; }

    var calc = FacilityFeeModule.calcFee(ev.feeConfig, [{ startAt: startVal, endAt: endVal }]);
    ev.calc  = calc;
    if (!calc) { estEl.style.display = 'none'; return; }

    estEl.innerHTML =
      '<div class="fr-estimate-box" style="font-size:13px">' +
        '<div class="fr-estimate-title">📊 추가 장소 예상 요금</div>' +
        '<div class="fr-estimate-total">합계: <strong>' + FacilityFeeModule.comma(calc.total) + '원</strong></div>' +
      '</div>';
    estEl.style.display = '';
  }

  /* ─────────────────────────────────────────────────
     통합 견적서 모달 (상단/하단 버튼 공통)
  ───────────────────────────────────────────────── */
  function openCombinedQuoteModal() {
    if (!window.FacilityFeeModule) return;

    var bId  = $('fr-building').value;
    var rId  = $('fr-room').value;
    var bld  = _buildings.find(function(b){ return b.id === bId; }) || {};
    var room = (bld.rooms||[]).find(function(r){ return r.id === rId; }) || {};

    // 메인 장소 구간
    var mainRanges = [];
    $('fr-time-ranges').querySelectorAll('.fr-time-range-row').forEach(function(row) {
      var s = row.querySelector('.fr-range-start');
      var e = row.querySelector('.fr-range-end');
      if (s && e && s.value && e.value) mainRanges.push({ startAt: s.value, endAt: e.value });
    });

    var venueInfos = [];
    if (_feeConfig && mainRanges.length) {
      var calc = FacilityFeeModule.calcFee(_feeConfig, mainRanges);
      venueInfos.push({
        buildingName: _feeConfig.buildingName || bld.buildingName || '',
        roomName:     _feeConfig.roomName     || room.name || '',
        ranges:       mainRanges,
        calc:         calc,
        feeConfig:    _feeConfig
      });
    }

    // 추가 장소
    _extraVenues.forEach(function(ev) {
      if (!ev || !ev.feeConfig) return;
      var evBlock  = $('fr-ev-block-' + ev.idx);
      if (!evBlock) return;
      var startEl  = evBlock.querySelector('.fr-ev-start');
      var endEl    = evBlock.querySelector('.fr-ev-end');
      if (!startEl || !endEl || !startEl.value || !endEl.value) return;
      var evRanges = [{ startAt: startEl.value, endAt: endEl.value }];
      var evCalc   = ev.calc || FacilityFeeModule.calcFee(ev.feeConfig, evRanges);
      venueInfos.push({
        buildingName: ev.feeConfig.buildingName || '',
        roomName:     ev.feeConfig.roomName     || '',
        ranges:       evRanges,
        calc:         evCalc,
        feeConfig:    ev.feeConfig
      });
    });

    if (!venueInfos.length) {
      alert('시설과 이용 일시를 먼저 선택해 주세요.');
      return;
    }

    var applicant = {
      name:  ($('fr-name')  && $('fr-name').value)  || '',
      org:   ($('fr-org')   && $('fr-org').value)   || '',
      phone: ($('fr-phone') && $('fr-phone').value) || '',
      email: ($('fr-email') && $('fr-email').value) || ''
    };
    var title   = ($('fr-title')   && $('fr-title').value)   || '';
    var purpose = ($('fr-purpose') && $('fr-purpose').value) || '';
    var attd    = ($('fr-attendees') && $('fr-attendees').value) || '';

    var modal = $('fr-quote-modal');
    if (!modal) return;

    var previewEl = $('fr-quote-preview');
    if (previewEl) {
      if (venueInfos.length === 1) {
        // 단일 장소 — 기존 buildQuoteHTML 사용
        var info = {
          buildingName: venueInfos[0].buildingName,
          roomName:     venueInfos[0].roomName,
          ranges:       venueInfos[0].ranges,
          applicant:    applicant,
          title:        title,
          purpose:      purpose,
          attendees:    attd,
          calc:         venueInfos[0].calc,
          feeConfig:    venueInfos[0].feeConfig
        };
        previewEl.innerHTML = '<iframe id="fr-quote-iframe" style="width:100%;height:500px;border:none"></iframe>';
        var iframe = document.getElementById('fr-quote-iframe');
        var doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open(); doc.write(FacilityFeeModule.buildQuoteHTML(info)); doc.close();
        modal._quoteInfo = info;
      } else {
        // 다중 장소 — 여러 블록을 스택으로 표시
        var grandTotal = venueInfos.reduce(function(sum, v) { return sum + (v.calc ? v.calc.total : 0); }, 0);
        var blocksHtml = venueInfos.map(function(v, i) {
          var info = {
            buildingName: v.buildingName, roomName: v.roomName,
            ranges: v.ranges, applicant: applicant,
            title: title + (venueInfos.length > 1 ? ' (' + (i+1) + '/' + venueInfos.length + ')' : ''),
            purpose: purpose, attendees: attd, calc: v.calc, feeConfig: v.feeConfig
          };
          return FacilityFeeModule.buildQuoteHTML(info);
        }).join('');
        previewEl.innerHTML = '<iframe id="fr-quote-iframe" style="width:100%;height:500px;border:none"></iframe>';
        var iframe2 = document.getElementById('fr-quote-iframe');
        var doc2 = iframe2.contentDocument || iframe2.contentWindow.document;
        var combinedHtml = '<html><body style="margin:0;padding:0">' + blocksHtml +
          '<div style="text-align:right;font-size:15px;font-weight:700;padding:12px 24px;border-top:2px solid #1a3a5c">합산 견적: ' +
          FacilityFeeModule.comma(grandTotal) + '원</div></body></html>';
        doc2.open(); doc2.write(combinedHtml); doc2.close();
        modal._quoteInfo = { venues: venueInfos, applicant: applicant };
      }
    }

    modal.hidden = false;
  }

  // 상태 조회
  function initStatusCheck() {
    var btn = $('fr-status-check-btn');
    if (!btn) return;
    btn.addEventListener('click', function() {
      var email = ($('fr-status-email').value || '').trim().toLowerCase();
      var phone = ($('fr-status-phone').value || '').trim();
      if (!email) { alert('이메일을 입력하세요.'); return; }
      var result = $('fr-status-result');
      result.style.display = '';

      var reqs = JSON.parse(localStorage.getItem('asea_facility_requests') || '[]');
      var matched = reqs.filter(function(r) {
        var emailMatch = (r.applicantEmail||'').toLowerCase() === email;
        var phoneMatch = !phone || (r.applicantPhone||'').replace(/-/g,'').indexOf(phone.replace(/-/g,'')) >= 0;
        return emailMatch && phoneMatch;
      });

      if (!matched.length) {
        result.innerHTML = '<p style="color:#888;font-size:13px">해당 이메일로 접수된 신청이 없습니다.</p>';
        return;
      }

      var statusColors = { '신청':'#1976D2','검토중':'#F57C00','승인':'#388E3C','반려':'#D32F2F' };
      var days = ['일','월','화','수','목','금','토'];
      function formatDT(iso) {
        if (!iso) return '-';
        var d = new Date(iso);
        return d.getFullYear() + '.' + pad(d.getMonth()+1) + '.' + pad(d.getDate()) + '(' + days[d.getDay()] + ') ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      }

      result.innerHTML = matched.slice().reverse().map(function(r) {
        var sc = statusColors[r.status] || '#888';
        var venueStr = (r.venues && r.venues.length > 1)
          ? r.venues.map(function(v){ return v.buildingName + ' ' + v.roomName; }).join(', ')
          : (r.buildingName || '') + ' ' + (r.roomName || '');
        return '<div style="border:1px solid #e0e0e0;border-radius:10px;padding:12px 14px;margin-bottom:10px">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
            '<span style="background:' + sc + ';color:#fff;border-radius:20px;padding:2px 10px;font-size:12px;font-weight:600">' + r.status + '</span>' +
            '<strong style="font-size:13px">' + venueStr + ' — ' + (r.title||'') + '</strong>' +
          '</div>' +
          '<div style="font-size:12px;color:#666">' + formatDT(r.startAt) + ' ~ ' + formatDT(r.endAt) + '</div>' +
          (r.reviewNote ? '<div style="font-size:12px;color:#555;margin-top:4px;background:#f5f5f5;border-radius:6px;padding:6px 8px">💬 ' + r.reviewNote + '</div>' : '') +
          '<div style="font-size:11px;color:#aaa;margin-top:4px">접수: ' + (r.createdAt||'').slice(0,10) + ' · 신청번호: ' + r.id + '</div>' +
        '</div>';
      }).join('');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
