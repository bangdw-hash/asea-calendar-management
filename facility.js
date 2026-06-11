'use strict';

/**
 * facility.js — 대관업무 모듈
 * 의존: config.js, auth.js, sheets.js, resutil.js
 *
 * v2 변경:
 *   - 달력 드래그 복수 날짜 선택 + 복수 구간 예약
 *   - 예약 모달: Google Calendar 선택기 추가
 *   - 서브탭: 📅 예약 캘린더 / 📋 신청 관리 (관리자)
 *   - 대관신청 승인/반려 (GAS 알림 프록시)
 */
var FacilityModule = (function () {

  var F = {
    facilities: [],
    reservations: [],
    viewYear: 0,
    viewMonth: 0,
    selectedBuilding: null,
    selectedRoom: null,
    editResv: null,
    isAdmin: false,
  };

  // ── 날짜 복수 선택 상태 (월 이동 후에도 유지) ──────────────
  var _fSelDates   = new Set();
  var _fDragStart  = null;
  var _fDragCur    = null;
  var _fIsDragging = false;
  var _fDragCtrl   = false;

  // ── 모바일 터치 전용 상태 ──────────────────────────────────
  var _fTouchTimer  = null;
  var _fIsLongPress = false;
  var _fTouchMoved  = false;
  var _fTouchStartCell = null;

  // 알림 프록시 URL
  function _getProxyUrl() { return localStorage.getItem('asea_facility_proxy_url') || ''; }

  function $f(id) { return document.getElementById(id); }
  function toast(msg, type) { if (typeof window.aseaToast === 'function') window.aseaToast(msg, type); }
  function pad(n) { return String(n).padStart(2,'0'); }

  function toLocalDT(d) {
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
  }

  function formatDT(iso) {
    if (!iso) return '-';
    var d = new Date(iso);
    var days = ['일','월','화','수','목','금','토'];
    return d.getFullYear()+'.'+pad(d.getMonth()+1)+'.'+pad(d.getDate())+'('+days[d.getDay()]+') '+pad(d.getHours())+':'+pad(d.getMinutes());
  }

  /* ─────────────────────────────────────────────────────────
     날짜 선택 헬퍼
  ───────────────────────────────────────────────────────── */
  function _fGetDateRange(d1, d2) {
    var a = d1 <= d2 ? d1 : d2;
    var b = d1 <= d2 ? d2 : d1;
    var result = [];
    var cur = new Date(a + 'T12:00');
    var end = new Date(b + 'T12:00');
    while (cur <= end) {
      result.push(cur.getFullYear()+'-'+pad(cur.getMonth()+1)+'-'+pad(cur.getDate()));
      cur.setDate(cur.getDate()+1);
    }
    return result;
  }

  function _fGroupRanges(dates) {
    var sorted = Array.from(dates).sort();
    if (!sorted.length) return [];
    var groups = [], cs = sorted[0], ce = sorted[0];
    for (var i = 1; i < sorted.length; i++) {
      var diff = (new Date(sorted[i]+'T12:00') - new Date(sorted[i-1]+'T12:00')) / 86400000;
      if (diff <= 1) { ce = sorted[i]; }
      else { groups.push({startDate:cs, endDate:ce}); cs = sorted[i]; ce = sorted[i]; }
    }
    groups.push({startDate:cs, endDate:ce});
    return groups;
  }

  function _fCurDragRange() {
    if (!_fIsDragging || !_fDragStart || !_fDragCur) return new Set();
    return new Set(_fGetDateRange(_fDragStart, _fDragCur));
  }

  function _fIsMobile() { return window.innerWidth <= 600; }

  function _fUpdateHighlight() {
    var cal = $f('fac-calendar');
    if (!cal) return;
    var dragRange = _fCurDragRange();
    cal.querySelectorAll('.res-cal-cell[data-date]').forEach(function(cell) {
      var d = cell.dataset.date;
      cell.classList.toggle('res-cal-sel',  _fSelDates.has(d) || dragRange.has(d));
      cell.classList.toggle('res-cal-drag', dragRange.has(d) && !_fSelDates.has(d));
    });
    if (_fIsMobile()) {
      _fUpdateFloatingBar();
    } else {
      var hint = $f('fac-sel-hint');
      if (hint) {
        var allDates = new Set(Array.from(_fSelDates));
        dragRange.forEach(function(d){ allDates.add(d); });
        if (allDates.size > 0) {
          hint.textContent = '📅 '+allDates.size+'일 선택됨 — 마우스를 떼면 예약창이 열립니다';
          hint.style.display = '';
        } else {
          hint.textContent = ''; hint.style.display = 'none';
        }
      }
    }
  }

  /* ── 모바일 플로팅 예약 바 ─────────────────────────────────── */
  function _fGetOrCreateFloatingBar() {
    var bar = document.getElementById('fac-float-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'fac-float-bar';
      bar.className = 'mob-float-bar';
      bar.innerHTML =
        '<div class="mob-float-info">' +
          '<span class="mob-float-count"></span>' +
          '<span class="mob-float-hint"></span>' +
        '</div>' +
        '<button class="mob-float-clear btn btn-ghost btn-sm">초기화</button>' +
        '<button class="mob-float-book btn btn-primary">📅 예약하기</button>';
      document.body.appendChild(bar);
      bar.querySelector('.mob-float-clear').addEventListener('click', function() {
        _fSelDates.clear();
        _fUpdateHighlight();
        _fUpdateFloatingBar();
      });
      bar.querySelector('.mob-float-book').addEventListener('click', function() {
        openResvModal(null, null);
      });
    }
    return bar;
  }

  function _fUpdateFloatingBar() {
    if (!_fIsMobile()) return;
    var bar = _fGetOrCreateFloatingBar();
    var count = _fSelDates.size;
    if (count > 0) {
      var ranges = _fGroupRanges(_fSelDates);
      bar.querySelector('.mob-float-count').textContent = '📅 ' + count + '일 선택';
      bar.querySelector('.mob-float-hint').textContent =
        ranges.length > 1 ? ranges.length + '개 구간' : '1개 구간';
      bar.classList.add('visible');
    } else {
      bar.classList.remove('visible');
    }
  }

  /* ── 롱프레스 추가 모드 토스트 ─────────────────────────────── */
  function _fShowAddModeToast() {
    var t = document.getElementById('mob-addmode-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'mob-addmode-toast';
      t.className = 'mob-addmode-toast';
      t.textContent = '➕ 추가 선택 모드';
      document.body.appendChild(t);
    }
    t.classList.add('show');
    if (_fTouchStartCell) _fTouchStartCell.classList.add('lp-anchor');
    if (navigator.vibrate) navigator.vibrate([40]);
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(function() {
      t.classList.remove('show');
      if (_fTouchStartCell) _fTouchStartCell.classList.remove('lp-anchor');
    }, 1200);
  }

  /* ─────────────────────────────────────────────────────────
     데이터 로드
  ───────────────────────────────────────────────────────── */
  async function loadData() {
    try {
      F.facilities = await SheetsModule.getFacilities();
      F.facilities.forEach(function(f) {
        if (typeof f.rooms === 'string') {
          try { f.rooms = JSON.parse(f.rooms); } catch(e) { f.rooms = []; }
        }
      });
      var y = F.viewYear, m = F.viewMonth;
      var start = y+'-'+pad(m+1)+'-01';
      var last  = new Date(y, m+1, 0).getDate();
      var end   = y+'-'+pad(m+1)+'-'+pad(last)+'T23:59';
      F.reservations = await SheetsModule.getFacilityReservations(start, end);
    } catch(e) { console.warn('facility load error', e); }
  }

  /* ─────────────────────────────────────────────────────────
     필터 드롭다운
  ───────────────────────────────────────────────────────── */
  function renderBuildingFilter() {
    var sel = $f('fac-building-filter');
    if (!sel) return;
    sel.innerHTML = '<option value="">전체 건물</option>';
    F.facilities.forEach(function(f) {
      var opt = document.createElement('option');
      opt.value = f.id; opt.textContent = f.buildingName;
      sel.appendChild(opt);
    });
    renderRoomFilter();
  }

  function renderRoomFilter() {
    var bSel = $f('fac-building-filter');
    var rSel = $f('fac-room-filter');
    if (!rSel) return;
    rSel.innerHTML = '<option value="">전체 호실</option>';
    var bId = bSel ? bSel.value : '';
    var fac = F.facilities.find(function(f){ return f.id === bId; });
    if (fac && fac.rooms) {
      fac.rooms.forEach(function(r) {
        var opt = document.createElement('option');
        opt.value = r.id; opt.textContent = r.name + (r.capacity?' ('+r.capacity+'인)':'');
        rSel.appendChild(opt);
      });
    }
  }

  /* ─────────────────────────────────────────────────────────
     달력 렌더
  ───────────────────────────────────────────────────────── */
  function renderCalendar() {
    var cal = $f('fac-calendar');
    if (!cal) return;
    var y = F.viewYear, m = F.viewMonth;
    $f('fac-cal-title').textContent = y+'년 '+(m+1)+'월';

    var bId = ($f('fac-building-filter')||{}).value || '';
    var rId = ($f('fac-room-filter')||{}).value || '';

    var filtered = F.reservations.filter(function(r) {
      if (r.status === '취소') return false;
      if (bId && r.buildingId !== bId) return false;
      if (rId && r.roomId !== rId) return false;
      return true;
    });

    var byDay = {};
    filtered.forEach(function(r) {
      var day = (r.startAt||'').slice(0,10);
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(r);
    });

    var firstDay = new Date(y, m, 1).getDay();
    var lastDate = new Date(y, m+1, 0).getDate();
    var today    = new Date();
    var todayStr = today.getFullYear()+'-'+pad(today.getMonth()+1)+'-'+pad(today.getDate());

    var html = '<div class="res-cal-grid">';
    ['일','월','화','수','목','금','토'].forEach(function(d) {
      html += '<div class="res-cal-dow">'+d+'</div>';
    });
    for (var i = 0; i < firstDay; i++) html += '<div class="res-cal-cell res-cal-empty"></div>';
    for (var d = 1; d <= lastDate; d++) {
      var dateStr = y+'-'+pad(m+1)+'-'+pad(d);
      var cls = 'res-cal-cell';
      if (dateStr === todayStr)    cls += ' res-cal-today';
      if (dateStr < todayStr)      cls += ' res-cal-past';
      if (_fSelDates.has(dateStr)) cls += ' res-cal-sel';
      var dayResv = byDay[dateStr] || [];
      html += '<div class="'+cls+'" data-date="'+dateStr+'">';
      html += '<div class="res-cal-date">'+d+'</div>';
      dayResv.slice(0,3).forEach(function(r) {
        var fac = F.facilities.find(function(f){ return f.id === r.buildingId; });
        var color = (fac && fac.color) || '#4285F4';
        html += '<div class="res-cal-item" style="background:'+color+'" data-id="'+r.id+'" title="'+
          r.buildingName+' '+r.roomName+'\n'+r.title+'\n'+formatDT(r.startAt)+'">'+
          '<span class="res-cal-item-time">'+(r.startAt||'').slice(11,16)+'</span> '+
          r.roomName+': '+r.title+'</div>';
      });
      if (dayResv.length > 3) html += '<div class="res-cal-more">+'+(dayResv.length-3)+'건 더보기</div>';
      html += '</div>';
    }
    html += '</div>';
    cal.innerHTML = html;
    _fUpdateHighlight();
  }

  /* ─────────────────────────────────────────────────────────
     예약 모달 — 다중 시간 구간 렌더
  ───────────────────────────────────────────────────────── */
  function _fRenderTimeRanges(container, ranges) {
    container.innerHTML = '';
    if (!ranges.length) {
      container.innerHTML = '<p class="empty-state" style="font-size:13px">선택된 날짜가 없습니다.</p>';
      return;
    }
    ranges.forEach(function(range, i) {
      var label = range.startDate === range.endDate ? range.startDate : range.startDate+' ~ '+range.endDate;
      var row = document.createElement('div');
      row.className = 'time-range-row';
      row.innerHTML =
        '<div class="time-range-label">구간 '+(i+1)+
        ' <span class="time-range-dates">('+label+')</span>'+
        '<button type="button" class="btn btn-ghost btn-sm time-range-del" title="이 구간 제거">×</button></div>'+
        '<div style="display:flex;gap:8px">'+
          '<div class="form-group" style="flex:1"><label class="form-label">시작 <span class="required">*</span></label>'+
          '<input type="datetime-local" class="form-input fac-range-start" value="'+range.startDate+'T09:00"></div>'+
          '<div class="form-group" style="flex:1"><label class="form-label">종료 <span class="required">*</span></label>'+
          '<input type="datetime-local" class="form-input fac-range-end" value="'+range.endDate+'T18:00"></div>'+
        '</div>';
      row.querySelector('.time-range-del').addEventListener('click', function() {
        _fGetDateRange(range.startDate, range.endDate).forEach(function(d){ _fSelDates.delete(d); });
        row.remove();
        _fUpdateHighlight();
        container.querySelectorAll('.time-range-row').forEach(function(r, j) {
          var lbl = r.querySelector('.time-range-label');
          if (lbl) lbl.firstChild.textContent = '구간 '+(j+1)+' ';
        });
      });
      container.appendChild(row);
    });
  }

  /* ─────────────────────────────────────────────────────────
     Google Calendar 선택기 (모달 내 셀렉트 채우기)
  ───────────────────────────────────────────────────────── */
  async function _loadGcalSelect() {
    var sel = $f('fac-resv-gcal');
    if (!sel) return;
    sel.innerHTML = '<option value="">(캘린더 선택 안 함)</option>';
    try {
      if (typeof ReservationUtil === 'undefined') return;
      var cals = await ReservationUtil.getUserCalendars();
      cals.forEach(function(cal) {
        var opt = document.createElement('option');
        opt.value = cal.id;
        opt.textContent = cal.name;
        opt.dataset.color = cal.color || '#4285F4';
        sel.appendChild(opt);
      });
    } catch(e) { /* 캘린더 로드 실패 시 무시 */ }
  }

  /* ─────────────────────────────────────────────────────────
     예약 모달 열기
  ───────────────────────────────────────────────────────── */
  function openResvModal(resv, defaultDate) {
    F.editResv = resv;
    $f('fac-modal-title').textContent = resv ? '예약 상세/수정' : '새 예약';

    var bSel = $f('fac-resv-building');
    bSel.innerHTML = '<option value="">건물 선택</option>';
    F.facilities.forEach(function(f) {
      var opt = document.createElement('option');
      opt.value = f.id; opt.textContent = f.buildingName;
      if (resv && resv.buildingId === f.id) opt.selected = true;
      bSel.appendChild(opt);
    });
    updateRoomSelect(resv ? resv.buildingId : '');
    if (resv) $f('fac-resv-room').value = resv.roomId;

    $f('fac-resv-title').value     = resv ? (resv.title||'') : '';
    $f('fac-resv-purpose').value   = resv ? (resv.purpose||'') : '';
    $f('fac-resv-attendees').value = resv ? (resv.attendees||'') : '';

    var staticRow     = $f('fac-resv-static-time-row');
    var timeRangesDiv = $f('fac-time-ranges');
    var useMulti      = !resv && _fSelDates.size > 0;

    if (staticRow)     staticRow.style.display    = useMulti ? 'none' : '';
    if (timeRangesDiv) timeRangesDiv.style.display = useMulti ? '' : 'none';

    if (resv) {
      $f('fac-resv-start').value = (resv.startAt||'').slice(0,16);
      $f('fac-resv-end').value   = (resv.endAt||'').slice(0,16);
    } else if (useMulti) {
      if (timeRangesDiv) _fRenderTimeRanges(timeRangesDiv, _fGroupRanges(_fSelDates));
    } else {
      var now = new Date();
      if (defaultDate) {
        $f('fac-resv-start').value = defaultDate+'T09:00';
        $f('fac-resv-end').value   = defaultDate+'T10:00';
      } else {
        $f('fac-resv-start').value = toLocalDT(now);
        $f('fac-resv-end').value   = toLocalDT(new Date(now.getTime()+60*60*1000));
      }
    }

    var statusRow = $f('fac-resv-status-row');
    if (statusRow) statusRow.style.display = resv ? '' : 'none';
    if (resv && $f('fac-resv-status')) $f('fac-resv-status').value = resv.status||'확정';

    var delBtn = $f('fac-resv-delete-btn');
    if (delBtn) delBtn.style.display = resv ? '' : 'none';

    var canEdit = F.isAdmin || !resv || (resv.fromId && window._workMe && resv.fromId === window._workMe.id);
    ['fac-resv-title','fac-resv-building','fac-resv-room','fac-resv-start','fac-resv-end','fac-resv-purpose','fac-resv-attendees'].forEach(function(id) {
      var el = $f(id); if (el) el.disabled = !canEdit;
    });
    var saveBtn = $f('fac-resv-save-btn');
    if (saveBtn) saveBtn.style.display = canEdit ? '' : 'none';

    $f('fac-resv-modal').hidden = false;

    // Google Calendar 목록 비동기 로드
    _loadGcalSelect();
  }

  function updateRoomSelect(buildingId) {
    var rSel = $f('fac-resv-room');
    if (!rSel) return;
    rSel.innerHTML = '<option value="">호실 선택</option>';
    var fac = F.facilities.find(function(f){ return f.id === buildingId; });
    if (fac && fac.rooms) {
      fac.rooms.forEach(function(r) {
        var opt = document.createElement('option');
        opt.value = r.id; opt.textContent = r.name+(r.capacity?' ('+r.capacity+'인)':'');
        rSel.appendChild(opt);
      });
    }
  }

  /* ─────────────────────────────────────────────────────────
     예약 모달 저장
  ───────────────────────────────────────────────────────── */
  async function saveResvModal() {
    var bSel = $f('fac-resv-building');
    var rSel = $f('fac-resv-room');
    var bId  = bSel.value, rId = rSel.value;
    var fac  = F.facilities.find(function(f){ return f.id === bId; });
    var room = fac && fac.rooms ? fac.rooms.find(function(r){ return r.id === rId; }) : null;
    var title = ($f('fac-resv-title').value||'').trim();

    if (!bId)   { toast('건물을 선택하세요.','error'); return; }
    if (!rId)   { toast('호실을 선택하세요.','error'); return; }
    if (!title) { toast('제목을 입력하세요.','error'); return; }

    // 시간 구간 수집
    var ranges = [];
    var timeRangesDiv = $f('fac-time-ranges');
    var isMulti = !F.editResv && timeRangesDiv && timeRangesDiv.style.display !== 'none' &&
                  timeRangesDiv.querySelectorAll('.fac-range-start').length > 0;

    if (isMulti) {
      var sInputs = timeRangesDiv.querySelectorAll('.fac-range-start');
      var eInputs = timeRangesDiv.querySelectorAll('.fac-range-end');
      for (var i = 0; i < sInputs.length; i++) {
        ranges.push({ startAt: sInputs[i].value, endAt: eInputs[i].value });
      }
    } else {
      ranges.push({ startAt: $f('fac-resv-start').value, endAt: $f('fac-resv-end').value });
    }

    if (!ranges.length) { toast('예약 구간이 없습니다.','error'); return; }

    for (var i = 0; i < ranges.length; i++) {
      if (!ranges[i].startAt || !ranges[i].endAt) {
        toast('구간 '+(i+1)+': 시간을 입력하세요.','error'); return;
      }
      if (ranges[i].endAt <= ranges[i].startAt) {
        toast('구간 '+(i+1)+': 종료 시간이 시작 시간보다 늦어야 합니다.','error'); return;
      }
      var rc = ranges[i];
      var conflict = F.reservations.find(function(r) {
        if (F.editResv && r.id === F.editResv.id) return false;
        if (r.status === '취소') return false;
        if (r.buildingId !== bId || r.roomId !== rId) return false;
        return r.startAt < rc.endAt && r.endAt > rc.startAt;
      });
      if (conflict) {
        toast('⚠️ 구간 '+(i+1)+': '+conflict.roomName+' '+formatDT(conflict.startAt)+' ~ '+formatDT(conflict.endAt)+' 이미 예약됨','error');
        return;
      }
    }

    var me      = window._workMe || {};
    var gcalId  = ($f('fac-resv-gcal')||{}).value || '';
    var saveBtn = $f('fac-resv-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }

    try {
      var savedIds = [];
      if (F.editResv) {
        var data = {
          buildingId: bId, buildingName: fac ? fac.buildingName : '',
          roomId: rId, roomName: room ? room.name : rId, title: title,
          fromId: me.id||'', fromName: me.name||'', department: me.department||'',
          startAt: ranges[0].startAt, endAt: ranges[0].endAt,
          purpose: ($f('fac-resv-purpose').value||'').trim(),
          attendees: ($f('fac-resv-attendees').value||'').trim(),
          status: ($f('fac-resv-status')||{}).value || '확정',
        };
        await SheetsModule.updateFacilityReservation(F.editResv._row, Object.assign({}, F.editResv, data));
        savedIds.push(Object.assign({}, F.editResv, data));
      } else {
        for (var i = 0; i < ranges.length; i++) {
          var d = {
            buildingId: bId, buildingName: fac ? fac.buildingName : '',
            roomId: rId, roomName: room ? room.name : rId, title: title,
            fromId: me.id||'', fromName: me.name||'', department: me.department||'',
            startAt: ranges[i].startAt, endAt: ranges[i].endAt,
            purpose: ($f('fac-resv-purpose').value||'').trim(),
            attendees: ($f('fac-resv-attendees').value||'').trim(),
            status: '확정',
          };
          await SheetsModule.createFacilityReservation(d);
          savedIds.push(d);
        }
      }

      // Google Calendar 등록 (선택된 경우)
      if (gcalId && typeof ReservationUtil !== 'undefined') {
        for (var i = 0; i < savedIds.length; i++) {
          try { await ReservationUtil.shareFacilityResvToCalendar(savedIds[i], gcalId); } catch(e) {}
        }
      }

      _fSelDates.clear(); _fUpdateHighlight();
      toast('✅ 예약이 저장되었습니다.','success');
      $f('fac-resv-modal').hidden = true;
      await refresh();
    } catch(e) {
      toast('저장 실패: '+(e.message||e),'error');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
    }
  }

  async function deleteResv() {
    if (!F.editResv) return;
    if (!confirm('이 예약을 취소하시겠습니까?')) return;
    try {
      await SheetsModule.deleteFacilityReservation(F.editResv._row);
      toast('예약이 취소되었습니다.','info');
      $f('fac-resv-modal').hidden = true;
      await refresh();
    } catch(e) { toast('취소 실패: '+(e.message||e),'error'); }
  }

  /* ─────────────────────────────────────────────────────────
     대관신청 관리 서브탭
  ───────────────────────────────────────────────────────── */
  async function loadAndRenderRequests(status) {
    var el = $f('fac-requests-list');
    if (!el) return;
    el.innerHTML = '<p class="empty-state">불러오는 중...</p>';
    try {
      var list = await SheetsModule.getFacilityRequests(status||'');
      if (!list.length) { el.innerHTML = '<p class="empty-state">신청 내역이 없습니다.</p>'; return; }
      renderRequestList(el, list);
      // 대기 건수 배지
      var pending = list.filter(function(r){ return r.status === '신청' || r.status === '검토중'; }).length;
      var btn = $f('fac-subtab-requests-btn');
      if (btn) btn.textContent = pending > 0 ? '📋 신청 관리 ('+pending+')' : '📋 신청 관리';
    } catch(e) { el.innerHTML = '<p class="empty-state" style="color:var(--danger)">불러오기 실패: '+(e.message||e)+'</p>'; }
  }

  function renderRequestList(el, list) {
    el.innerHTML = '';
    var statusColors = { '신청':'#1976D2', '검토중':'#F57C00', '승인':'#388E3C', '반려':'#D32F2F' };
    list.slice().reverse().forEach(function(req) {
      var card = document.createElement('div');
      card.className = 'fac-req-card';
      var sc = statusColors[req.status] || '#888';
      card.innerHTML =
        '<div class="fac-req-header">' +
          '<span class="fac-req-status-badge" style="background:'+sc+'">'+req.status+'</span>' +
          '<span class="fac-req-title">'+req.buildingName+' '+req.roomName+' — '+req.title+'</span>' +
          '<span class="fac-req-date">'+req.createdAt.slice(0,10)+'</span>' +
        '</div>' +
        '<div class="fac-req-meta">' +
          formatDT(req.startAt)+' ~ '+formatDT(req.endAt) +
          ' | '+req.applicantName+' ('+req.applicantOrg+') '+req.applicantPhone +
          (req.applicantEmail ? ' · '+req.applicantEmail : '') +
        '</div>' +
        (req.purpose ? '<div class="fac-req-purpose">목적: '+req.purpose+'</div>' : '') +
        (req.reviewNote ? '<div class="fac-req-note">검토: '+req.reviewNote+'</div>' : '') +
        (req.status === '신청' || req.status === '검토중' ? '<div class="fac-req-actions" data-id="'+req.id+'" data-row="'+(req._row||'')+'"></div>' : '');
      var actionsDiv = card.querySelector('.fac-req-actions');
      if (actionsDiv) {
        var approveBtn = document.createElement('button');
        approveBtn.className = 'btn btn-primary btn-sm';
        approveBtn.textContent = '✅ 승인';
        approveBtn.onclick = function(){ _openFacReviewModal(req, '승인'); };
        var rejectBtn = document.createElement('button');
        rejectBtn.className = 'btn btn-danger btn-sm';
        rejectBtn.textContent = '❌ 반려';
        rejectBtn.onclick = function(){ _openFacReviewModal(req, '반려'); };
        if (req.status === '신청') {
          var midBtn = document.createElement('button');
          midBtn.className = 'btn btn-ghost btn-sm';
          midBtn.textContent = '🔍 검토중으로 변경';
          midBtn.onclick = function(){ _setRequestStatus(req, '검토중'); };
          actionsDiv.appendChild(midBtn);
        }
        actionsDiv.appendChild(approveBtn);
        actionsDiv.appendChild(rejectBtn);
      }
      el.appendChild(card);
    });
  }

  function _openFacReviewModal(req, statusValue) {
    var modal = $f('fac-review-modal');
    if (!modal) {
      // fallback to old prompt if modal not in DOM
      var note = prompt((statusValue === '승인' ? '승인' : '반려')+'하시겠습니까?\n검토 의견을 입력하세요 (선택사항):');
      if (note === null) return;
      _confirmFacReview(req, statusValue, note, false);
      return;
    }
    $f('fac-rm-action-title').textContent = statusValue === '승인' ? '✅ 신청 승인' : '❌ 신청 반려';
    $f('fac-rm-info').innerHTML =
      '<strong>' + req.buildingName + ' ' + req.roomName + '</strong> — ' + req.title + '<br>' +
      formatDT(req.startAt) + ' ~ ' + formatDT(req.endAt) + '<br>' +
      '신청자: ' + req.applicantName + ' (' + req.applicantOrg + ')' +
      (req.applicantEmail ? ' · ' + req.applicantEmail : '');
    var noteEl = $f('fac-rm-note');
    if (noteEl) noteEl.value = '';
    var autoWrap = $f('fac-rm-auto-resv-wrap');
    if (autoWrap) autoWrap.style.display = statusValue === '승인' ? '' : 'none';
    var autoChk = $f('fac-rm-auto-resv');
    if (autoChk) autoChk.checked = true;
    var confirmBtn = $f('fac-rm-confirm-btn');
    confirmBtn.onclick = function() {
      var note = ($f('fac-rm-note').value || '').trim();
      var autoResv = statusValue === '승인' && $f('fac-rm-auto-resv') && $f('fac-rm-auto-resv').checked;
      modal.hidden = true;
      _confirmFacReview(req, statusValue, note, autoResv);
    };
    modal.hidden = false;
  }

  async function _confirmFacReview(req, statusValue, note, autoResv) {
    var me = window._workMe || {};
    var proxyUrl = _getProxyUrl();
    try {
      if (proxyUrl) {
        var res = await fetch(proxyUrl, {
          method: 'POST',
          body: JSON.stringify({
            action: statusValue === '승인' ? 'approveFacilityRequest' : 'rejectFacilityRequest',
            id: req.id,
            reviewNote: note,
            reviewedBy: me.name || me.email || '관리자',
          })
        });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || '프록시 오류');
      } else {
        if (!req._row) throw new Error('행 번호 없음');
        await SheetsModule.updateFacilityRequest(req._row, {
          status: statusValue,
          reviewNote: note,
          reviewedBy: me.name || me.email || '관리자',
          reviewedAt: new Date().toISOString(),
        });
      }
      if (statusValue === '승인' && autoResv && typeof SheetsModule !== 'undefined' && SheetsModule.addFacilityReservation) {
        try {
          await SheetsModule.addFacilityReservation({
            buildingId: req.buildingId,
            buildingName: req.buildingName,
            roomId: req.roomId,
            roomName: req.roomName,
            title: req.title,
            startAt: req.startAt,
            endAt: req.endAt,
            bookedBy: req.applicantName + ' (' + req.applicantOrg + ')',
            purpose: req.purpose || '',
            attendees: req.attendees || '',
            status: '승인',
            note: note || ''
          });
          await refresh();
        } catch(e2) { toast('예약 자동 등록 실패: '+(e2.message||e2),'error'); }
      }
      toast(statusValue === '승인' ? '✅ 승인되었습니다.' : '❌ 반려되었습니다.', 'info');
      await loadAndRenderRequests();
    } catch(e) {
      toast('처리 실패: '+(e.message||e),'error');
    }
  }

  async function _setRequestStatus(req, newStatus) {
    var proxyUrl = _getProxyUrl();
    try {
      if (proxyUrl) {
        var res = await fetch(proxyUrl, {
          method: 'POST',
          body: JSON.stringify({ action: 'updateFacilityRequestStatus', id: req.id, status: newStatus })
        });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || '프록시 오류');
      } else {
        if (!req._row) throw new Error('행 번호 없음');
        await SheetsModule.updateFacilityRequest(req._row, { status: newStatus });
      }
      toast('상태가 "'+newStatus+'"(으)로 변경되었습니다.', 'info');
      await loadAndRenderRequests();
    } catch(e) {
      toast('상태 변경 실패: '+(e.message||e),'error');
    }
  }

  /* ─────────────────────────────────────────────────────────
     알림 프록시 설정 저장/로드
  ───────────────────────────────────────────────────────── */
  function _initProxySettings() {
    var inp  = $f('fac-proxy-url-input');
    var save = $f('fac-proxy-url-save');
    if (!inp) return;
    inp.value = _getProxyUrl();
    _updatePublicLink();
    if (save) save.addEventListener('click', function() {
      var url = inp.value.trim();
      localStorage.setItem('asea_facility_proxy_url', url);
      toast('프록시 URL이 저장되었습니다.','success');
      _updatePublicLink();
    });
  }

  function _updatePublicLink() {
    var proxyUrl = _getProxyUrl();
    var base = (typeof CONFIG !== 'undefined' && CONFIG.baseUrl) ? CONFIG.baseUrl : location.href.replace(/\/[^\/]*$/, '/');
    var href = base + 'facility-request.html' + (proxyUrl ? '?proxy=' + encodeURIComponent(proxyUrl) : '');

    // legacy link (if still present)
    var link = $f('fac-public-req-link');
    if (link) {
      link.href = href;
      link.textContent = proxyUrl ? '🔗 공개 신청 링크 복사' : 'facility-request.html (프록시 미설정)';
      link.onclick = proxyUrl ? function(e) {
        e.preventDefault();
        navigator.clipboard.writeText(href).then(function() {
          toast('공개 URL이 복사되었습니다.','success');
        }).catch(function() { window.open(href,'_blank'); });
      } : null;
    }

    // QR panel
    var qrImg = $f('fac-qr-img');
    if (qrImg && proxyUrl) {
      qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(href);
    }
    var qrUrl = $f('fac-qr-url');
    if (qrUrl) qrUrl.textContent = href;
    var qrOpen = $f('fac-qr-open-btn');
    if (qrOpen) qrOpen.href = href;
  }

  /* ─────────────────────────────────────────────────────────
     관리자: 시설 관리
  ───────────────────────────────────────────────────────── */
  function renderFacilityAdmin() {
    var el = $f('fac-admin-building-list');
    if (!el) return;
    if (F.facilities.length === 0) { el.innerHTML = '<p class="empty-state">등록된 건물이 없습니다.</p>'; return; }
    el.innerHTML = '';
    F.facilities.forEach(function(fac) {
      var div = document.createElement('div');
      div.className = 'fac-building-row';
      div.innerHTML =
        '<div class="fac-building-name"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:'+fac.color+';margin-right:6px"></span>'+fac.buildingName+'</div>' +
        '<div class="fac-room-chips">'+(fac.rooms||[]).map(function(r){ return '<span class="fac-room-chip">'+r.name+(r.capacity?' ('+r.capacity+'인)':'')+'</span>'; }).join('')+'</div>' +
        '<div class="fac-building-actions">'+
          '<button class="btn btn-ghost btn-sm fac-edit-building-btn" data-id="'+fac.id+'">수정</button>'+
          '<button class="btn btn-ghost btn-sm btn-danger fac-del-building-btn" data-row="'+fac._row+'">삭제</button>'+
        '</div>';
      div.querySelector('.fac-edit-building-btn').onclick = function() { openBuildingModal(fac); };
      div.querySelector('.fac-del-building-btn').onclick = async function() {
        if (!confirm(fac.buildingName+' 건물을 삭제하시겠습니까?')) return;
        await SheetsModule.deleteFacility(parseInt(this.dataset.row));
        await refresh();
      };
      el.appendChild(div);
    });
  }

  function openBuildingModal(fac) {
    var modal = $f('fac-building-modal');
    $f('fac-bm-title').textContent = fac ? '건물 수정' : '건물 추가';
    $f('fac-bm-name').value  = fac ? fac.buildingName : '';
    $f('fac-bm-color').value = fac ? (fac.color||'#4285F4') : '#4285F4';
    renderRoomEditor((fac && fac.rooms) ? fac.rooms : []);
    modal._fac = fac || null;
    modal.hidden = false;
  }

  function renderRoomEditor(rooms) {
    var el = $f('fac-bm-rooms');
    if (!el) return;
    el.innerHTML = '';
    rooms.forEach(function(r) {
      var row = document.createElement('div');
      row.className = 'fac-room-edit-row';
      row.innerHTML =
        '<input type="text" class="form-input room-name-input" placeholder="호실명" value="'+r.name+'" style="flex:2">' +
        '<input type="number" class="form-input room-cap-input" placeholder="수용인원" value="'+(r.capacity||'')+'" style="flex:1;max-width:80px" min="1">' +
        '<button type="button" class="btn btn-ghost btn-sm room-del-btn">×</button>';
      row.querySelector('.room-del-btn').onclick = function() { el.removeChild(row); };
      el.appendChild(row);
    });
  }

  async function saveBuildingModal() {
    var modal = $f('fac-building-modal');
    var name  = ($f('fac-bm-name').value||'').trim();
    var color = $f('fac-bm-color').value;
    if (!name) { toast('건물명을 입력하세요.','error'); return; }
    var rooms = [];
    $f('fac-bm-rooms').querySelectorAll('.fac-room-edit-row').forEach(function(row, i) {
      var n = row.querySelector('.room-name-input').value.trim();
      var c = row.querySelector('.room-cap-input').value.trim();
      if (n) rooms.push({ id: 'R'+String(i+1).padStart(3,'0'), name: n, capacity: c });
    });
    var btn = $f('fac-bm-save-btn');
    btn.disabled = true; btn.textContent = '저장 중...';
    try {
      if (modal._fac) {
        await SheetsModule.updateFacility(modal._fac._row, Object.assign({}, modal._fac, { buildingName:name, rooms:rooms, color:color }));
      } else {
        await SheetsModule.addFacility({ buildingName:name, rooms:rooms, color:color });
      }
      toast('✅ 시설 정보가 저장되었습니다.','success');
      modal.hidden = true;
      await refresh();
    } catch(e) { toast('저장 실패: '+(e.message||e),'error');
    } finally { btn.disabled = false; btn.textContent = '저장'; }
  }

  /* ─────────────────────────────────────────────────────────
     전체 갱신
  ───────────────────────────────────────────────────────── */
  async function refresh() {
    await loadData();
    renderBuildingFilter();
    renderCalendar();
    renderFacilityAdmin();
  }

  /* ─────────────────────────────────────────────────────────
     초기화
  ───────────────────────────────────────────────────────── */
  function initFacilityModule(isAdmin) {
    F.isAdmin = !!isAdmin;
    var now = new Date();
    F.viewYear  = now.getFullYear();
    F.viewMonth = now.getMonth();

    // 이전/다음 달
    var prevBtn = $f('fac-cal-prev');
    var nextBtn = $f('fac-cal-next');
    if (prevBtn) prevBtn.addEventListener('click', async function() {
      F.viewMonth--; if (F.viewMonth < 0) { F.viewMonth = 11; F.viewYear--; }
      await refresh();
    });
    if (nextBtn) nextBtn.addEventListener('click', async function() {
      F.viewMonth++; if (F.viewMonth > 11) { F.viewMonth = 0; F.viewYear++; }
      await refresh();
    });

    // 필터
    var bFilter = $f('fac-building-filter');
    if (bFilter) bFilter.addEventListener('change', function() { renderRoomFilter(); renderCalendar(); });
    var rFilter = $f('fac-room-filter');
    if (rFilter) rFilter.addEventListener('change', function() { renderCalendar(); });

    // ── 서브탭 ──────────────────────────────────────────────
    var subtabBtns = document.querySelectorAll('#fac-subtab-bar .subtab-btn');
    subtabBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        subtabBtns.forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        var target = btn.dataset.subtab;
        var calPanel = $f('fac-subtab-calendar');
        var reqPanel = $f('fac-subtab-requests');
        var feePanel = $f('fac-subtab-fees');
        if (calPanel) calPanel.hidden = (target !== 'calendar');
        if (reqPanel) reqPanel.hidden = (target !== 'requests');
        if (feePanel) feePanel.hidden = (target !== 'fees');
        if (target === 'requests') loadAndRenderRequests();
        if (target === 'fees') renderFeeAdmin();
      });
    });
    // 관리자 아닌 경우 신청 관리 탭 숨김
    var reqTabBtn = $f('fac-subtab-requests-btn');
    if (reqTabBtn) reqTabBtn.style.display = isAdmin ? '' : 'none';
    var feeTabBtn = $f('fac-subtab-fees-btn');
    if (feeTabBtn) feeTabBtn.style.display = isAdmin ? '' : 'none';

    // 신청 관리 - 필터
    var reqFilterSel = $f('fac-req-status-filter');
    if (reqFilterSel) reqFilterSel.addEventListener('change', function() {
      loadAndRenderRequests(this.value);
    });

    // QR 공개 링크 버튼
    var qrBtn = $f('fac-public-qr-btn');
    if (qrBtn) {
      qrBtn.addEventListener('click', function() {
        var panel = $f('fac-qr-panel');
        if (panel) panel.hidden = !panel.hidden;
      });
    }
    var qrCopyBtn = $f('fac-qr-copy-btn');
    if (qrCopyBtn) {
      qrCopyBtn.addEventListener('click', function() {
        var urlEl = $f('fac-qr-url');
        var url = urlEl ? urlEl.textContent : '';
        if (url) {
          navigator.clipboard.writeText(url).then(function() {
            toast('공개 URL이 복사되었습니다.','success');
          }).catch(function() { toast('복사 실패','error'); });
        }
      });
    }

    // ── 드래그 복수 선택 이벤트 ─────────────────────────────
    var cal = $f('fac-calendar');
    if (cal) {
      cal.addEventListener('mousedown', function(e) {
        if (e.target.closest('.res-cal-item')) return;
        var cell = e.target.closest('.res-cal-cell[data-date]');
        if (!cell) return;
        e.preventDefault();
        _fDragCtrl  = e.ctrlKey || e.metaKey;
        _fDragStart = cell.dataset.date;
        _fDragCur   = cell.dataset.date;
        _fIsDragging = true;
        if (!_fDragCtrl) _fSelDates.clear();
        _fUpdateHighlight();
      });

      cal.addEventListener('mousemove', function(e) {
        if (!_fIsDragging) return;
        var cell = e.target.closest('.res-cal-cell[data-date]');
        if (!cell || cell.dataset.date === _fDragCur) return;
        _fDragCur = cell.dataset.date;
        _fUpdateHighlight();
      });

      cal.addEventListener('click', function(e) {
        var item = e.target.closest('.res-cal-item');
        if (item) {
          var resv = F.reservations.find(function(r){ return r.id === item.dataset.id; });
          if (resv) openResvModal(resv, null);
        }
      });

      /* ── 모바일 터치 이벤트 (A안) ──────────────────────────── */

      cal.addEventListener('touchstart', function(e) {
        var touch = e.touches[0];
        var el    = document.elementFromPoint(touch.clientX, touch.clientY);
        var cell  = el && el.closest('.res-cal-cell[data-date]');
        if (!cell) return;
        if (el.closest('.res-cal-item')) return;

        e.preventDefault();

        _fTouchMoved      = false;
        _fIsLongPress     = false;
        _fDragCtrl        = false;
        _fTouchStartCell  = cell;
        _fDragStart       = cell.dataset.date;
        _fDragCur         = cell.dataset.date;
        _fIsDragging      = true;

        clearTimeout(_fTouchTimer);
        _fTouchTimer = setTimeout(function() {
          _fIsLongPress = true;
          _fDragCtrl    = true;
          _fShowAddModeToast();
          _fUpdateHighlight();
        }, 600);

      }, { passive: false });

      cal.addEventListener('touchmove', function(e) {
        if (!_fIsDragging) return;
        var touch = e.touches[0];
        var el    = document.elementFromPoint(touch.clientX, touch.clientY);
        var cell  = el && el.closest('.res-cal-cell[data-date]');

        if (!_fTouchMoved) {
          _fTouchMoved = true;
          if (!_fIsLongPress) {
            clearTimeout(_fTouchTimer);
            _fTouchTimer = null;
            _fSelDates.clear();
          }
        }

        if (!cell || cell.dataset.date === _fDragCur) return;
        e.preventDefault();
        _fDragCur = cell.dataset.date;
        _fUpdateHighlight();
      }, { passive: false });
    }

    // mouseup (document-level) — 데스크톱
    document.addEventListener('mouseup', function(e) {
      if (!_fIsDragging) return;
      var dragRange = _fCurDragRange();
      dragRange.forEach(function(d){ _fSelDates.add(d); });
      _fIsDragging = false; _fDragStart = null; _fDragCur = null;
      _fUpdateHighlight();
      if (_fSelDates.size > 0 && !e.target.closest('.res-cal-item')) {
        openResvModal(null, null);
      }
    });

    // touchend (document-level) — 모바일
    document.addEventListener('touchend', function(e) {
      if (!_fIsDragging) return;

      clearTimeout(_fTouchTimer);
      _fTouchTimer = null;

      var dragRange = _fCurDragRange();

      if (!_fTouchMoved) {
        // 순수 탭: 단일 날짜 토글
        var d = _fDragStart;
        if (d) {
          if (_fSelDates.has(d)) { _fSelDates.delete(d); }
          else                   { _fSelDates.add(d); }
        }
      } else {
        // 드래그 or 롱프레스+드래그: 범위 추가
        dragRange.forEach(function(d){ _fSelDates.add(d); });
      }

      _fIsDragging     = false;
      _fDragStart      = null;
      _fDragCur        = null;
      _fIsLongPress    = false;
      _fDragCtrl       = false;
      _fTouchMoved     = false;
      _fTouchStartCell = null;

      _fUpdateHighlight();
    }, { passive: true });

    // 선택 초기화
    var clearSelBtn = $f('fac-clear-sel-btn');
    if (clearSelBtn) clearSelBtn.addEventListener('click', function() { _fSelDates.clear(); _fUpdateHighlight(); });

    // 건물 추가
    var addBldBtn = $f('fac-add-building-btn');
    if (addBldBtn) addBldBtn.addEventListener('click', function() { openBuildingModal(null); });

    // 건물 모달 호실 추가
    var addRoomBtn = $f('fac-bm-add-room-btn');
    if (addRoomBtn) addRoomBtn.addEventListener('click', function() {
      var el2 = $f('fac-bm-rooms');
      var existing = Array.from(el2.querySelectorAll('.fac-room-edit-row')).map(function(row) {
        return { name: row.querySelector('.room-name-input').value, capacity: row.querySelector('.room-cap-input').value };
      });
      renderRoomEditor(existing.concat([{id:'', name:'', capacity:''}]));
    });

    var bmSave   = $f('fac-bm-save-btn');
    if (bmSave)   bmSave.addEventListener('click', saveBuildingModal);
    var bmCancel = $f('fac-bm-cancel-btn');
    if (bmCancel) bmCancel.addEventListener('click', function() { $f('fac-building-modal').hidden = true; });

    // 예약 모달
    var resvSave  = $f('fac-resv-save-btn');
    if (resvSave)  resvSave.addEventListener('click', saveResvModal);
    var resvDel   = $f('fac-resv-delete-btn');
    if (resvDel)   resvDel.addEventListener('click', deleteResv);
    var resvClose = $f('fac-resv-close-btn');
    if (resvClose) resvClose.addEventListener('click', function() { $f('fac-resv-modal').hidden = true; });

    var resvBuilding = $f('fac-resv-building');
    if (resvBuilding) resvBuilding.addEventListener('change', function() { updateRoomSelect(this.value); });

    var facModal = document.getElementById('fac-resv-modal');
    if (facModal) facModal.addEventListener('open-new-internal', function() { openResvModal(null, null); });

    // 관리자 표시
    var adminLink    = $f('fac-admin-link');
    if (adminLink)    adminLink.style.display = isAdmin ? '' : 'none';
    var adminSection = $f('fac-admin-section');
    if (adminSection) adminSection.hidden = true;
    var settingsFacCard = document.getElementById('settings-fac-card');
    if (settingsFacCard) settingsFacCard.hidden = !isAdmin;

    // 프록시 URL 설정
    _initProxySettings();

    // CSV 양식 다운로드
    var csvDl = $f('fac-csv-download-btn');
    if (csvDl) csvDl.addEventListener('click', function() {
      if (typeof ReservationUtil !== 'undefined') ReservationUtil.downloadFacilityTemplate();
    });

    // CSV 업로드
    var csvInput = $f('fac-csv-upload-input');
    if (csvInput) csvInput.addEventListener('change', async function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var text = await file.text();
      var rows = ReservationUtil.parseFacilityCSV(text);
      var preview = $f('fac-csv-preview');
      if (rows.length === 0) { preview.hidden = true; toast('파싱된 데이터가 없습니다.', 'error'); return; }
      preview.hidden = false;
      var heads = ['건물명','건물코드','호실','색상'];
      var html = '<strong>미리보기 ('+rows.length+'개 건물)</strong><br><table><tr>'+heads.map(function(h){return '<th>'+h+'</th>';}).join('')+'</tr>';
      rows.slice(0,5).forEach(function(r) {
        html += '<tr><td>'+r.buildingName+'</td><td>'+r.buildingCode+'</td><td>'+(r.rooms||[]).length+'개</td><td><span style="background:'+r.color+';padding:2px 8px;border-radius:3px;color:#fff">'+r.color+'</span></td></tr>';
      });
      if (rows.length > 5) html += '<tr><td colspan="4" style="text-align:center">...외 '+(rows.length-5)+'개</td></tr>';
      html += '</table><div style="margin-top:8px;display:flex;gap:8px"><button id="fac-csv-confirm-btn" class="btn btn-primary btn-sm">업로드 확인</button><button id="fac-csv-cancel-btn" class="btn btn-ghost btn-sm">취소</button></div>';
      preview.innerHTML = html;
      document.getElementById('fac-csv-confirm-btn').addEventListener('click', async function() {
        try {
          await SheetsModule.bulkUpsertFacilities(rows);
          toast('시설 '+rows.length+'개 등록 완료!', 'success');
          preview.hidden = true; csvInput.value = '';
          await refresh();
        } catch(err) { toast('업로드 실패: '+err.message, 'error'); }
      });
      document.getElementById('fac-csv-cancel-btn').addEventListener('click', function() { preview.hidden = true; csvInput.value = ''; });
    });

    // 캘린더 공유
    var shareCalBtn = $f('fac-share-cal-btn');
    if (shareCalBtn) shareCalBtn.addEventListener('click', function() {
      if (typeof ReservationUtil !== 'undefined') {
        ReservationUtil.showCalendarPicker(async function(cal) {
          toast('캘린더 공유 중...', 'info');
          var count = 0;
          for (var i = 0; i < F.reservations.length; i++) {
            try { await ReservationUtil.shareFacilityResvToCalendar(F.reservations[i], cal.id); count++; } catch(e) {}
          }
          toast(cal.name+'에 '+count+'개 일정 공유 완료!', 'success');
        });
      }
    });

    // 최초 로드
    refresh();
  }

  /* ─────────────────────────────────────────────────────────
     관리자: 요금 관리
  ───────────────────────────────────────────────────────── */
  function renderFeeAdmin() {
    if (!window.FacilityFeeModule) return;
    var el = $f('fac-fee-list');
    if (!el) return;

    var fees = FacilityFeeModule.loadFees();

    var addBtn = $f('fac-fee-add-btn');
    if (addBtn && !addBtn._wired) {
      addBtn._wired = true;
      addBtn.addEventListener('click', function() { openFeeModal(null); });
    }

    if (!fees.length) {
      el.innerHTML = '<p class="empty-state">등록된 요금 설정이 없습니다.</p>';
      return;
    }

    el.innerHTML = '';
    fees.forEach(function(fee) {
      var card = document.createElement('div');
      card.className = 'settings-card';
      card.style.cssText = 'margin-bottom:10px;padding:14px 16px;';
      card.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">' +
          '<div>' +
            '<div style="font-size:15px;font-weight:700;color:#1a3a5c;margin-bottom:6px">🏢 ' + _esc(fee.buildingName) + ' · ' + _esc(fee.roomName) + '</div>' +
            '<div style="font-size:12px;color:#374151;display:flex;gap:12px;flex-wrap:wrap">' +
              '<span style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:5px;padding:3px 8px">평상 ' + (fee.normalStart||'--') + '~' + (fee.normalEnd||'--') + ' · ' + FacilityFeeModule.comma(fee.normalRate||0) + '원/h</span>' +
              '<span style="background:#FEF9EC;border:1px solid #FCD34D;border-radius:5px;padding:3px 8px;color:#92400E">할증 ' + (fee.surchargeStart||'--') + '~' + (fee.surchargeEnd||'--') + ' · ' + FacilityFeeModule.comma(fee.surchargeRate||0) + '원/h</span>' +
              (fee.deposit ? '<span>보증금 ' + FacilityFeeModule.comma(fee.deposit) + '원</span>' : '') +
              (fee.cleaningFee ? '<span>청소비 ' + FacilityFeeModule.comma(fee.cleaningFee) + '원</span>' : '') +
            '</div>' +
            (fee.notes ? '<div style="font-size:11px;color:#92400E;margin-top:4px">📌 ' + _esc(fee.notes) + '</div>' : '') +
          '</div>' +
          '<div style="display:flex;gap:6px">' +
            '<button class="btn btn-ghost btn-sm fac-fee-edit-btn" data-id="' + fee.id + '">수정</button>' +
            '<button class="btn btn-ghost btn-sm btn-danger fac-fee-del-btn" data-id="' + fee.id + '">삭제</button>' +
          '</div>' +
        '</div>';
      card.querySelector('.fac-fee-edit-btn').onclick = function() { openFeeModal(fee); };
      card.querySelector('.fac-fee-del-btn').onclick = function() {
        if (!confirm(fee.buildingName + ' ' + fee.roomName + ' 요금 설정을 삭제하시겠습니까?')) return;
        FacilityFeeModule.deleteFee(fee.id);
        renderFeeAdmin();
        toast('삭제되었습니다.', 'success');
      };
      el.appendChild(card);
    });
  }

  function _esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function openFeeModal(fee) {
    var modal = $f('fac-fee-modal');
    if (!modal) return;
    $f('fac-fee-modal-title').textContent = fee ? '요금 설정 수정' : '요금 설정 추가';
    $f('fac-fee-building').value  = fee ? (fee.buildingName||'')         : '';
    $f('fac-fee-room').value      = fee ? (fee.roomName||'')             : '';
    $f('fac-fee-norm-s').value    = fee ? (fee.normalStart||'09:00')     : '09:00';
    $f('fac-fee-norm-e').value    = fee ? (fee.normalEnd||'18:00')       : '18:00';
    $f('fac-fee-norm-r').value    = fee ? (fee.normalRate||'')           : '';
    $f('fac-fee-sur-s').value     = fee ? (fee.surchargeStart||'18:00')  : '18:00';
    $f('fac-fee-sur-e').value     = fee ? (fee.surchargeEnd||'22:00')    : '22:00';
    $f('fac-fee-sur-r').value     = fee ? (fee.surchargeRate||'')        : '';
    $f('fac-fee-minh').value      = fee ? (fee.minHours||'')             : '';
    $f('fac-fee-dep').value       = fee ? (fee.deposit||'')              : '';
    $f('fac-fee-clean').value     = fee ? (fee.cleaningFee||'')          : '';
    $f('fac-fee-notes').value     = fee ? (fee.notes||'')                : '';

    renderFeeExtras(fee ? (fee.extraItems||[]) : []);

    modal._fee = fee || null;
    modal.hidden = false;

    var saveBtn = $f('fac-fee-save-btn');
    if (saveBtn) saveBtn.onclick = function() { saveFeeModal(); };

    var extraAddBtn = $f('fac-fee-extra-add-btn');
    if (extraAddBtn && !extraAddBtn._wired) {
      extraAddBtn._wired = true;
      extraAddBtn.addEventListener('click', function() {
        var cont = $f('fac-fee-extras');
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px';
        row.innerHTML = '<input type="text" class="form-input fee-extra-name" placeholder="항목명" style="flex:2">' +
          '<input type="number" class="form-input fee-extra-amt" placeholder="금액(원)" min="0" style="flex:1">' +
          '<button type="button" class="btn btn-ghost btn-sm" onclick="this.parentNode.remove()">×</button>';
        cont.appendChild(row);
      });
    }
  }

  function renderFeeExtras(items) {
    var cont = $f('fac-fee-extras');
    if (!cont) return;
    cont.innerHTML = '';
    items.forEach(function(item) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px';
      row.innerHTML = '<input type="text" class="form-input fee-extra-name" placeholder="항목명" style="flex:2" value="' + _esc(item.name||'') + '">' +
        '<input type="number" class="form-input fee-extra-amt" placeholder="금액(원)" min="0" style="flex:1" value="' + (item.amount||'') + '">' +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="this.parentNode.remove()">×</button>';
      cont.appendChild(row);
    });
  }

  function saveFeeModal() {
    if (!window.FacilityFeeModule) return;
    var modal = $f('fac-fee-modal');
    var buildingName = ($f('fac-fee-building').value||'').trim();
    var roomName     = ($f('fac-fee-room').value||'').trim();
    if (!buildingName || !roomName) { toast('건물명과 호실명을 입력하세요.', 'error'); return; }

    var extras = [];
    $f('fac-fee-extras').querySelectorAll('div').forEach(function(row) {
      var n = row.querySelector('.fee-extra-name');
      var a = row.querySelector('.fee-extra-amt');
      if (n && a && n.value.trim()) extras.push({ name: n.value.trim(), amount: parseFloat(a.value)||0 });
    });

    var data = {
      buildingName: buildingName, roomName: roomName,
      normalStart:    $f('fac-fee-norm-s').value,
      normalEnd:      $f('fac-fee-norm-e').value,
      normalRate:     parseFloat($f('fac-fee-norm-r').value)||0,
      surchargeStart: $f('fac-fee-sur-s').value,
      surchargeEnd:   $f('fac-fee-sur-e').value,
      surchargeRate:  parseFloat($f('fac-fee-sur-r').value)||0,
      minHours:       parseFloat($f('fac-fee-minh').value)||0,
      deposit:        parseFloat($f('fac-fee-dep').value)||0,
      cleaningFee:    parseFloat($f('fac-fee-clean').value)||0,
      extraItems: extras,
      notes: ($f('fac-fee-notes').value||'').trim()
    };

    if (modal._fee) {
      FacilityFeeModule.updateFee(modal._fee.id, data);
      toast('✅ 요금 설정이 수정되었습니다.', 'success');
    } else {
      FacilityFeeModule.addFee(data);
      toast('✅ 요금 설정이 추가되었습니다.', 'success');
    }
    modal.hidden = true;
    renderFeeAdmin();
  }

  return {
    initFacilityModule: initFacilityModule,
    refresh: refresh,
  };

})();
