'use strict';

/**
 * vehicle.js — 차량관리 모듈
 * 의존: config.js, auth.js, sheets.js
 *
 * v2 변경: 달력 드래그 복수 날짜 선택 + 복수 구간 예약 지원
 */
var VehicleModule = (function () {

  var V = {
    vehicles: [],
    reservations: [],
    viewYear: 0,
    viewMonth: 0,
    selectedVehicle: '',
    editResv: null,
    isAdmin: false,
  };

  // ── 날짜 복수 선택 상태 (월 이동 후에도 유지) ──────────────
  var _vSelDates   = new Set();   // Set<'YYYY-MM-DD'>
  var _vDragStart  = null;        // 드래그 앵커
  var _vDragCur    = null;        // 드래그 현재 위치
  var _vIsDragging = false;
  var _vDragCtrl   = false;       // Ctrl 누른 드래그

  // ── 모바일 터치 전용 상태 ──────────────────────────────────
  var _vTouchTimer  = null;   // 롱프레스 타이머
  var _vIsLongPress = false;  // 롱프레스 확정 여부 (추가 선택 모드)
  var _vTouchMoved  = false;  // 터치가 이동했는지 (드래그 감지)
  var _vTouchStartCell = null; // 터치 시작 셀

  function $v(id) { return document.getElementById(id); }
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

  var TYPE_COLORS = {
    '승용':'#4285F4','승합':'#0F9D58','버스':'#F4B400','화물':'#DB4437','기타':'#9E9E9E'
  };

  /* ─────────────────────────────────────────────────────────
     날짜 선택 헬퍼
  ───────────────────────────────────────────────────────── */
  function _vGetDateRange(d1, d2) {
    var a = d1 <= d2 ? d1 : d2;
    var b = d1 <= d2 ? d2 : d1;
    var result = [];
    // T12:00 사용 — DST 경계에서 날짜 계산 오류 방지
    var cur = new Date(a + 'T12:00');
    var end = new Date(b + 'T12:00');
    while (cur <= end) {
      result.push(cur.getFullYear()+'-'+pad(cur.getMonth()+1)+'-'+pad(cur.getDate()));
      cur.setDate(cur.getDate()+1);
    }
    return result;
  }

  // 날짜 Set → 연속 구간 배열 [{startDate, endDate}]
  function _vGroupRanges(dates) {
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

  function _vCurDragRange() {
    if (!_vIsDragging || !_vDragStart || !_vDragCur) return new Set();
    return new Set(_vGetDateRange(_vDragStart, _vDragCur));
  }

  function _vIsMobile() { return window.innerWidth <= 600; }

  function _vUpdateHighlight() {
    var cal = $v('veh-calendar');
    if (!cal) return;
    var dragRange = _vCurDragRange();
    cal.querySelectorAll('.res-cal-cell[data-date]').forEach(function(cell) {
      var d = cell.dataset.date;
      var inSel  = _vSelDates.has(d);
      var inDrag = dragRange.has(d);
      cell.classList.toggle('res-cal-sel',  inSel || inDrag);
      cell.classList.toggle('res-cal-drag', inDrag && !inSel);
    });
    // 모바일: 플로팅 바 업데이트 / 데스크톱: 힌트 텍스트
    if (_vIsMobile()) {
      _vUpdateFloatingBar();
    } else {
      var hint = $v('veh-sel-hint');
      if (hint) {
        var allDates = new Set(Array.from(_vSelDates));
        dragRange.forEach(function(d){ allDates.add(d); });
        if (allDates.size > 0) {
          hint.textContent = '📅 '+allDates.size+'일 선택됨 — 마우스를 떼면 예약창이 열립니다';
          hint.style.display = '';
        } else {
          hint.textContent = '';
          hint.style.display = 'none';
        }
      }
    }
  }

  /* ── 모바일 플로팅 예약 바 ─────────────────────────────────── */
  function _vGetOrCreateFloatingBar() {
    var bar = document.getElementById('veh-float-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'veh-float-bar';
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
        _vSelDates.clear();
        _vUpdateHighlight();
        _vUpdateFloatingBar();
      });
      bar.querySelector('.mob-float-book').addEventListener('click', function() {
        openResvModal(null, null);
      });
    }
    return bar;
  }

  function _vUpdateFloatingBar() {
    if (!_vIsMobile()) return;
    var bar = _vGetOrCreateFloatingBar();
    var count = _vSelDates.size;
    if (count > 0) {
      var ranges = _vGroupRanges(_vSelDates);
      bar.querySelector('.mob-float-count').textContent = '📅 ' + count + '일 선택';
      bar.querySelector('.mob-float-hint').textContent =
        ranges.length > 1 ? ranges.length + '개 구간' : '1개 구간';
      bar.classList.add('visible');
    } else {
      bar.classList.remove('visible');
    }
  }

  /* ── 롱프레스 추가 모드 토스트 ─────────────────────────────── */
  function _vShowAddModeToast() {
    var t = document.getElementById('mob-addmode-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'mob-addmode-toast';
      t.className = 'mob-addmode-toast';
      t.textContent = '➕ 추가 선택 모드';
      document.body.appendChild(t);
    }
    t.classList.add('show');
    // 앵커 셀 링 효과
    if (_vTouchStartCell) _vTouchStartCell.classList.add('lp-anchor');
    // 진동 피드백
    if (navigator.vibrate) navigator.vibrate([40]);
    // 1.2초 후 자동 숨김
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(function() {
      t.classList.remove('show');
      if (_vTouchStartCell) _vTouchStartCell.classList.remove('lp-anchor');
    }, 1200);
  }

  /* ─────────────────────────────────────────────────────────
     데이터 로드
  ───────────────────────────────────────────────────────── */
  async function loadData() {
    try {
      V.vehicles = await SheetsModule.getVehicles();
      var y = V.viewYear, m = V.viewMonth;
      var start = y+'-'+pad(m+1)+'-01';
      var last  = new Date(y, m+1, 0).getDate();
      var end   = y+'-'+pad(m+1)+'-'+pad(last)+'T23:59';
      V.reservations = await SheetsModule.getVehicleReservations(start, end);
    } catch(e) { console.warn('vehicle load error', e); }
  }

  /* ─────────────────────────────────────────────────────────
     차량 필터 드롭다운
  ───────────────────────────────────────────────────────── */
  function renderVehicleFilter() {
    var sel = $v('veh-vehicle-filter');
    if (!sel) return;
    sel.innerHTML = '<option value="">전체 차량</option>';
    V.vehicles.forEach(function(v) {
      var opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.vehicleName + (v.vehicleNum?' ('+v.vehicleNum+')':'');
      sel.appendChild(opt);
    });
  }

  /* ─────────────────────────────────────────────────────────
     달력 렌더  (드래그 선택 이벤트는 initVehicleModule에서 등록)
  ───────────────────────────────────────────────────────── */
  function renderCalendar() {
    var cal = $v('veh-calendar');
    if (!cal) return;
    var y = V.viewYear, m = V.viewMonth;
    $v('veh-cal-title').textContent = y+'년 '+(m+1)+'월';

    var vId = ($v('veh-vehicle-filter')||{}).value || '';
    var filtered = V.reservations.filter(function(r) {
      if (r.status === '취소') return false;
      if (vId && r.vehicleId !== vId) return false;
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
      if (dateStr === todayStr)       cls += ' res-cal-today';
      if (dateStr < todayStr)         cls += ' res-cal-past';
      if (_vSelDates.has(dateStr))    cls += ' res-cal-sel';
      var dayResv = byDay[dateStr] || [];
      html += '<div class="'+cls+'" data-date="'+dateStr+'">';
      html += '<div class="res-cal-date">'+d+'</div>';
      dayResv.slice(0,3).forEach(function(r) {
        var veh = V.vehicles.find(function(v){ return v.id === r.vehicleId; });
        var color = TYPE_COLORS[(veh&&veh.vehicleType)||'기타'] || '#9E9E9E';
        html += '<div class="res-cal-item" style="background:'+color+'" data-id="'+r.id+'" title="'+
          r.vehicleName+'\n'+r.fromName+' | '+r.destination+'\n'+formatDT(r.startAt)+'">'+
          '<span class="res-cal-item-time">'+(r.startAt||'').slice(11,16)+'</span> '+
          r.vehicleName+': '+r.destination+'</div>';
      });
      if (dayResv.length > 3) html += '<div class="res-cal-more">+'+(dayResv.length-3)+'건 더보기</div>';
      html += '</div>';
    }
    html += '</div>';
    cal.innerHTML = html;
    _vUpdateHighlight(); // 기존 선택 반영
  }

  /* ─────────────────────────────────────────────────────────
     예약 모달 — 다중 시간 구간 렌더
  ───────────────────────────────────────────────────────── */
  function _vRenderTimeRanges(container, ranges) {
    container.innerHTML = '';
    if (!ranges.length) {
      container.innerHTML = '<p class="empty-state" style="font-size:13px">선택된 날짜가 없습니다.</p>';
      return;
    }
    ranges.forEach(function(range, i) {
      var label = range.startDate === range.endDate
        ? range.startDate
        : range.startDate + ' ~ ' + range.endDate;
      var row = document.createElement('div');
      row.className = 'time-range-row';
      row.innerHTML =
        '<div class="time-range-label">구간 '+(i+1)+
        ' <span class="time-range-dates">('+label+')</span>'+
        '<button type="button" class="btn btn-ghost btn-sm time-range-del" title="이 구간 제거">×</button></div>'+
        '<div style="display:flex;gap:8px">'+
          '<div class="form-group" style="flex:1"><label class="form-label">출발 <span class="required">*</span></label>'+
          '<input type="datetime-local" class="form-input veh-range-start" value="'+range.startDate+'T09:00"></div>'+
          '<div class="form-group" style="flex:1"><label class="form-label">반납 예정 <span class="required">*</span></label>'+
          '<input type="datetime-local" class="form-input veh-range-end" value="'+range.endDate+'T18:00"></div>'+
        '</div>';
      row.querySelector('.time-range-del').addEventListener('click', function() {
        _vGetDateRange(range.startDate, range.endDate).forEach(function(d){ _vSelDates.delete(d); });
        row.remove();
        _vUpdateHighlight();
        // 남은 구간 번호 재정렬
        container.querySelectorAll('.time-range-row').forEach(function(r, j) {
          var lbl = r.querySelector('.time-range-label');
          if (lbl) lbl.firstChild.textContent = '구간 '+(j+1)+' ';
        });
      });
      container.appendChild(row);
    });
  }

  /* ─────────────────────────────────────────────────────────
     예약 모달 열기
  ───────────────────────────────────────────────────────── */
  function openResvModal(resv, defaultDate) {
    V.editResv = resv;
    $v('veh-modal-title').textContent = resv ? '차량 예약 상세/수정' : '차량 예약';

    // 차량 셀렉트
    var vSel = $v('veh-resv-vehicle');
    vSel.innerHTML = '<option value="">차량 선택</option>';
    V.vehicles.forEach(function(v) {
      var opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.vehicleName+(v.vehicleNum?' ['+v.vehicleNum+']':'')+(v.capacity?' ('+v.capacity+'인)':'');
      if (resv && resv.vehicleId === v.id) opt.selected = true;
      vSel.appendChild(opt);
    });

    $v('veh-resv-destination').value = resv ? (resv.destination||'') : '';
    $v('veh-resv-purpose').value     = resv ? (resv.purpose||'') : '';
    $v('veh-resv-passengers').value  = resv ? (resv.passengers||'1') : '1';

    var staticRow     = $v('veh-resv-static-time-row');
    var timeRangesDiv = $v('veh-time-ranges');
    var useMulti      = !resv && _vSelDates.size > 0;

    if (staticRow)     staticRow.style.display    = useMulti ? 'none' : '';
    if (timeRangesDiv) timeRangesDiv.style.display = useMulti ? '' : 'none';

    if (resv) {
      $v('veh-resv-start').value = (resv.startAt||'').slice(0,16);
      $v('veh-resv-end').value   = (resv.endAt||'').slice(0,16);
    } else if (useMulti) {
      if (timeRangesDiv) _vRenderTimeRanges(timeRangesDiv, _vGroupRanges(_vSelDates));
    } else {
      var now = new Date();
      if (defaultDate) {
        $v('veh-resv-start').value = defaultDate + 'T09:00';
        $v('veh-resv-end').value   = defaultDate + 'T18:00';
      } else {
        $v('veh-resv-start').value = toLocalDT(now);
        $v('veh-resv-end').value   = toLocalDT(new Date(now.getTime()+8*60*60*1000));
      }
    }

    var statusRow = $v('veh-resv-status-row');
    if (statusRow) statusRow.style.display = resv ? '' : 'none';
    if (resv && $v('veh-resv-status')) $v('veh-resv-status').value = resv.status||'확정';

    var delBtn = $v('veh-resv-delete-btn');
    if (delBtn) delBtn.style.display = resv ? '' : 'none';

    var canEdit = V.isAdmin || !resv || (resv.fromId && window._workMe && resv.fromId === window._workMe.id);
    ['veh-resv-vehicle','veh-resv-start','veh-resv-end','veh-resv-destination','veh-resv-purpose','veh-resv-passengers'].forEach(function(id) {
      var el = $v(id); if (el) el.disabled = !canEdit;
    });
    var saveBtn = $v('veh-resv-save-btn');
    if (saveBtn) saveBtn.style.display = canEdit ? '' : 'none';

    $v('veh-resv-modal').hidden = false;
  }

  /* ─────────────────────────────────────────────────────────
     예약 모달 저장
  ───────────────────────────────────────────────────────── */
  async function saveResvModal() {
    var vId  = $v('veh-resv-vehicle').value;
    var veh  = V.vehicles.find(function(v){ return v.id === vId; });
    var dest = ($v('veh-resv-destination').value||'').trim();
    var purp = ($v('veh-resv-purpose').value||'').trim();
    var pass = $v('veh-resv-passengers').value || '1';

    if (!vId)  { toast('차량을 선택하세요.','error'); return; }
    if (!dest) { toast('행선지를 입력하세요.','error'); return; }

    // 시간 구간 수집
    var ranges = [];
    var timeRangesDiv = $v('veh-time-ranges');
    var isMulti = !V.editResv && timeRangesDiv && timeRangesDiv.style.display !== 'none' &&
                  timeRangesDiv.querySelectorAll('.veh-range-start').length > 0;

    if (isMulti) {
      var sInputs = timeRangesDiv.querySelectorAll('.veh-range-start');
      var eInputs = timeRangesDiv.querySelectorAll('.veh-range-end');
      for (var i = 0; i < sInputs.length; i++) {
        ranges.push({ startAt: sInputs[i].value, endAt: eInputs[i].value });
      }
    } else {
      ranges.push({ startAt: $v('veh-resv-start').value, endAt: $v('veh-resv-end').value });
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
      var conflict = V.reservations.find(function(r) {
        if (V.editResv && r.id === V.editResv.id) return false;
        if (r.status === '취소') return false;
        if (r.vehicleId !== vId) return false;
        return r.startAt < rc.endAt && r.endAt > rc.startAt;
      });
      if (conflict) {
        toast('⚠️ 구간 '+(i+1)+': '+formatDT(conflict.startAt)+' ~ '+formatDT(conflict.endAt)+' 이미 예약됨','error');
        return;
      }
    }

    var me      = window._workMe || {};
    var saveBtn = $v('veh-resv-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }

    try {
      if (V.editResv) {
        var data = {
          vehicleId: vId, vehicleName: veh ? veh.vehicleName : vId,
          fromId: me.id||'', fromName: me.name||'', department: me.department||'',
          startAt: ranges[0].startAt, endAt: ranges[0].endAt,
          destination: dest, purpose: purp, passengers: pass,
          status: ($v('veh-resv-status')||{}).value || '확정',
        };
        await SheetsModule.updateVehicleReservation(V.editResv._row, Object.assign({}, V.editResv, data));
      } else {
        for (var i = 0; i < ranges.length; i++) {
          await SheetsModule.createVehicleReservation({
            vehicleId: vId, vehicleName: veh ? veh.vehicleName : vId,
            fromId: me.id||'', fromName: me.name||'', department: me.department||'',
            startAt: ranges[i].startAt, endAt: ranges[i].endAt,
            destination: dest, purpose: purp, passengers: pass, status: '확정',
          });
        }
      }
      _vSelDates.clear(); _vUpdateHighlight();
      toast('✅ 차량 예약이 저장되었습니다.','success');
      $v('veh-resv-modal').hidden = true;
      await refresh();
    } catch(e) {
      toast('저장 실패: '+(e.message||e),'error');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
    }
  }

  async function deleteResv() {
    if (!V.editResv) return;
    if (!confirm('이 차량 예약을 취소하시겠습니까?')) return;
    try {
      await SheetsModule.deleteVehicleReservation(V.editResv._row);
      toast('예약이 취소되었습니다.','info');
      $v('veh-resv-modal').hidden = true;
      await refresh();
    } catch(e) { toast('취소 실패: '+(e.message||e),'error'); }
  }

  /* ─────────────────────────────────────────────────────────
     관리자: 차량 관리
  ───────────────────────────────────────────────────────── */
  function renderVehicleAdmin() {
    var el = $v('veh-admin-list');
    if (!el) return;
    if (V.vehicles.length === 0) {
      el.innerHTML = '<p class="empty-state">등록된 차량이 없습니다.</p>';
      return;
    }
    el.innerHTML = '';
    V.vehicles.forEach(function(v) {
      var row = document.createElement('div');
      row.className = 'veh-admin-row';
      var color = TYPE_COLORS[v.vehicleType||'기타']||'#9E9E9E';
      row.innerHTML =
        '<span class="veh-type-dot" style="background:'+color+'"></span>' +
        '<span class="veh-name">'+v.vehicleName+'</span>' +
        '<span class="veh-num">'+v.vehicleNum+'</span>' +
        '<span class="veh-type">'+v.vehicleType+'</span>' +
        '<span class="veh-cap">'+v.capacity+'인승</span>' +
        '<span class="veh-note">'+v.note+'</span>' +
        '<button class="btn btn-ghost btn-sm veh-edit-btn" data-id="'+v.id+'">수정</button>' +
        '<button class="btn btn-ghost btn-sm btn-danger veh-del-btn" data-row="'+v._row+'">삭제</button>';
      row.querySelector('.veh-edit-btn').onclick = function() { openVehicleModal(v); };
      row.querySelector('.veh-del-btn').onclick = async function() {
        if (!confirm(v.vehicleName+'을(를) 삭제하시겠습니까?')) return;
        await SheetsModule.deleteVehicle(parseInt(this.dataset.row));
        await refresh();
      };
      el.appendChild(row);
    });
  }

  function openVehicleModal(veh) {
    var modal = $v('veh-vehicle-modal');
    $v('veh-vm-title').textContent = veh ? '차량 수정' : '차량 추가';
    $v('veh-vm-name').value     = veh ? veh.vehicleName : '';
    $v('veh-vm-num').value      = veh ? veh.vehicleNum  : '';
    $v('veh-vm-type').value     = veh ? veh.vehicleType : '승용';
    $v('veh-vm-capacity').value = veh ? veh.capacity    : '4';
    $v('veh-vm-note').value     = veh ? veh.note        : '';
    modal._veh = veh || null;
    modal.hidden = false;
  }

  async function saveVehicleModal() {
    var modal = $v('veh-vehicle-modal');
    var name  = ($v('veh-vm-name').value||'').trim();
    var num   = ($v('veh-vm-num').value||'').trim();
    var type  = $v('veh-vm-type').value;
    var cap   = $v('veh-vm-capacity').value;
    var note  = ($v('veh-vm-note').value||'').trim();
    if (!name) { toast('차량명을 입력하세요.','error'); return; }
    var btn = $v('veh-vm-save-btn');
    btn.disabled = true; btn.textContent = '저장 중...';
    try {
      if (modal._veh) {
        await SheetsModule.updateVehicle(modal._veh._row, Object.assign({}, modal._veh, { vehicleName:name, vehicleNum:num, vehicleType:type, capacity:cap, note:note }));
      } else {
        await SheetsModule.addVehicle({ vehicleName:name, vehicleNum:num, vehicleType:type, capacity:cap, note:note });
      }
      toast('✅ 차량 정보가 저장되었습니다.','success');
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
    renderVehicleFilter();
    renderCalendar();
    renderVehicleAdmin();
  }

  /* ─────────────────────────────────────────────────────────
     초기화
  ───────────────────────────────────────────────────────── */
  function initVehicleModule(isAdmin) {
    V.isAdmin = !!isAdmin;
    var now = new Date();
    V.viewYear  = now.getFullYear();
    V.viewMonth = now.getMonth();

    var prevBtn = $v('veh-cal-prev');
    var nextBtn = $v('veh-cal-next');
    if (prevBtn) prevBtn.addEventListener('click', async function() {
      V.viewMonth--; if (V.viewMonth < 0) { V.viewMonth = 11; V.viewYear--; }
      await refresh();
    });
    if (nextBtn) nextBtn.addEventListener('click', async function() {
      V.viewMonth++; if (V.viewMonth > 11) { V.viewMonth = 0; V.viewYear++; }
      await refresh();
    });

    var vFilter = $v('veh-vehicle-filter');
    if (vFilter) vFilter.addEventListener('change', function() { renderCalendar(); });

    // ── 드래그 복수 선택 이벤트 (컨테이너에 등록 — re-render 후에도 유지) ──
    var cal = $v('veh-calendar');
    if (cal) {
      // mousedown: 선택 시작
      cal.addEventListener('mousedown', function(e) {
        if (e.target.closest('.res-cal-item')) return; // 예약 클릭은 click 이벤트로
        var cell = e.target.closest('.res-cal-cell[data-date]');
        if (!cell) return;
        e.preventDefault(); // 텍스트 선택 방지
        _vDragCtrl  = e.ctrlKey || e.metaKey;
        _vDragStart = cell.dataset.date;
        _vDragCur   = cell.dataset.date;
        _vIsDragging = true;
        if (!_vDragCtrl) _vSelDates.clear(); // Ctrl 없으면 새 선택 시작
        _vUpdateHighlight();
      });

      // mousemove: 드래그 범위 업데이트
      cal.addEventListener('mousemove', function(e) {
        if (!_vIsDragging) return;
        var cell = e.target.closest('.res-cal-cell[data-date]');
        if (!cell || cell.dataset.date === _vDragCur) return;
        _vDragCur = cell.dataset.date;
        _vUpdateHighlight();
      });

      // click: 예약 아이템 클릭 (상세/수정)
      cal.addEventListener('click', function(e) {
        var item = e.target.closest('.res-cal-item');
        if (item) {
          var resv = V.reservations.find(function(r){ return r.id === item.dataset.id; });
          if (resv) openResvModal(resv, null);
        }
      });

      /* ── 모바일 터치 이벤트 (A안) ──────────────────────────── */

      // touchstart: 롱프레스 타이머 시작, 드래그 앵커 설정
      cal.addEventListener('touchstart', function(e) {
        var touch = e.touches[0];
        var el    = document.elementFromPoint(touch.clientX, touch.clientY);
        var cell  = el && el.closest('.res-cal-cell[data-date]');
        if (!cell) return;
        if (el.closest('.res-cal-item')) return; // 예약 아이템 탭은 click에서 처리

        e.preventDefault(); // 스크롤 방지 + 합성 마우스 이벤트 차단

        _vTouchMoved      = false;
        _vIsLongPress     = false;
        _vDragCtrl        = false;
        _vTouchStartCell  = cell;
        _vDragStart       = cell.dataset.date;
        _vDragCur         = cell.dataset.date;
        _vIsDragging      = true;

        // 롱프레스 타이머 (600ms → 추가 선택 모드)
        clearTimeout(_vTouchTimer);
        _vTouchTimer = setTimeout(function() {
          _vIsLongPress = true;
          _vDragCtrl    = true;
          _vShowAddModeToast();
          _vUpdateHighlight();
        }, 600);

      }, { passive: false });

      // touchmove: 드래그 범위 업데이트
      cal.addEventListener('touchmove', function(e) {
        if (!_vIsDragging) return;
        var touch = e.touches[0];
        var el    = document.elementFromPoint(touch.clientX, touch.clientY);
        var cell  = el && el.closest('.res-cal-cell[data-date]');

        if (!_vTouchMoved) {
          _vTouchMoved = true;
          if (!_vIsLongPress) {
            // 일반 드래그: 타이머 취소 + 기존 선택 초기화
            clearTimeout(_vTouchTimer);
            _vTouchTimer = null;
            _vSelDates.clear();
          }
          // 롱프레스 확정 후 드래그: 기존 선택 유지 (이미 _vDragCtrl=true)
        }

        if (!cell || cell.dataset.date === _vDragCur) return;
        e.preventDefault(); // 스크롤 막기
        _vDragCur = cell.dataset.date;
        _vUpdateHighlight();
      }, { passive: false });
    }

    // mouseup: 드래그 종료 (desktop — 캘린더 밖에서 놓아도 처리)
    document.addEventListener('mouseup', function(e) {
      if (!_vIsDragging) return;
      var dragRange = _vCurDragRange();
      dragRange.forEach(function(d){ _vSelDates.add(d); });
      _vIsDragging = false;
      _vDragStart  = null;
      _vDragCur    = null;
      _vUpdateHighlight();
      // 데스크톱: 즉시 모달 오픈
      if (_vSelDates.size > 0 && !e.target.closest('.res-cal-item')) {
        openResvModal(null, null);
      }
    });

    // touchend: 탭·드래그·롱프레스 최종 처리 (document-level)
    document.addEventListener('touchend', function(e) {
      if (!_vIsDragging) return;

      clearTimeout(_vTouchTimer);
      _vTouchTimer = null;

      var dragRange = _vCurDragRange();

      if (!_vTouchMoved) {
        // ── 순수 탭: 단일 날짜 토글 ────────────────────────────
        var d = _vDragStart;
        if (d) {
          if (_vSelDates.has(d)) { _vSelDates.delete(d); }
          else                   { _vSelDates.add(d); }
        }
      } else {
        // ── 드래그 또는 롱프레스+드래그: 범위 추가 ────────────
        dragRange.forEach(function(d){ _vSelDates.add(d); });
      }

      _vIsDragging     = false;
      _vDragStart      = null;
      _vDragCur        = null;
      _vIsLongPress    = false;
      _vDragCtrl       = false;
      _vTouchMoved     = false;
      _vTouchStartCell = null;

      _vUpdateHighlight(); // 플로팅 바 자동 업데이트 포함
    }, { passive: true });

    // 선택 초기화 버튼
    var clearSelBtn = $v('veh-clear-sel-btn');
    if (clearSelBtn) clearSelBtn.addEventListener('click', function() {
      _vSelDates.clear(); _vUpdateHighlight();
    });

    // 차량 관리자 버튼
    var addVehBtn = $v('veh-add-vehicle-btn');
    if (addVehBtn) addVehBtn.addEventListener('click', function() { openVehicleModal(null); });

    var vmSave   = $v('veh-vm-save-btn');
    if (vmSave)   vmSave.addEventListener('click', saveVehicleModal);
    var vmCancel = $v('veh-vm-cancel-btn');
    if (vmCancel) vmCancel.addEventListener('click', function() { $v('veh-vehicle-modal').hidden = true; });

    var resvSave  = $v('veh-resv-save-btn');
    if (resvSave)  resvSave.addEventListener('click', saveResvModal);
    var resvDel   = $v('veh-resv-delete-btn');
    if (resvDel)   resvDel.addEventListener('click', deleteResv);
    var resvClose = $v('veh-resv-close-btn');
    if (resvClose) resvClose.addEventListener('click', function() {
      $v('veh-resv-modal').hidden = true;
      // 모달 닫힐 때 선택 초기화 + 플로팅 바 숨김
      _vSelDates.clear();
      _vUpdateHighlight();
    });

    // '예약하기' 버튼
    var vehModal = document.getElementById('veh-resv-modal');
    if (vehModal) vehModal.addEventListener('open-new-internal', function() { openResvModal(null, null); });

    var adminLink    = $v('veh-admin-link');
    if (adminLink)    adminLink.style.display = isAdmin ? '' : 'none';
    var adminSection = $v('veh-admin-section');
    if (adminSection) adminSection.hidden = !isAdmin;

    var settingsVehCard = document.getElementById('settings-veh-card');
    if (settingsVehCard) settingsVehCard.hidden = !isAdmin;

    // CSV 양식 다운로드
    var csvDl = $v('veh-csv-download-btn');
    if (csvDl) csvDl.addEventListener('click', function() {
      if (typeof ReservationUtil !== 'undefined') ReservationUtil.downloadVehicleTemplate();
    });

    // CSV 업로드
    var csvInput = $v('veh-csv-upload-input');
    if (csvInput) csvInput.addEventListener('change', async function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var text = await file.text();
      var rows = ReservationUtil.parseVehicleCSV(text);
      var preview = $v('veh-csv-preview');
      if (rows.length === 0) { preview.hidden = true; toast('파싱된 데이터가 없습니다.', 'error'); return; }
      preview.hidden = false;
      var heads = ['차량명','차량번호','유형','정원','비고'];
      var html = '<strong>미리보기 ('+rows.length+'개)</strong><br><table><tr>'+heads.map(function(h){return '<th>'+h+'</th>';}).join('')+'</tr>';
      rows.slice(0,5).forEach(function(r) {
        html += '<tr><td>'+r.vehicleName+'</td><td>'+r.vehicleNum+'</td><td>'+r.vehicleType+'</td><td>'+r.capacity+'</td><td>'+(r.note||'')+'</td></tr>';
      });
      if (rows.length > 5) html += '<tr><td colspan="5" style="text-align:center">...외 '+(rows.length-5)+'개</td></tr>';
      html += '</table><div style="margin-top:8px;display:flex;gap:8px"><button id="veh-csv-confirm-btn" class="btn btn-primary btn-sm">업로드 확인</button><button id="veh-csv-cancel-btn" class="btn btn-ghost btn-sm">취소</button></div>';
      preview.innerHTML = html;
      document.getElementById('veh-csv-confirm-btn').addEventListener('click', async function() {
        try {
          await SheetsModule.bulkUpsertVehicles(rows);
          toast('차량 '+rows.length+'개 등록 완료!', 'success');
          preview.hidden = true; csvInput.value = '';
          await refresh();
        } catch(err) { toast('업로드 실패: '+err.message, 'error'); }
      });
      document.getElementById('veh-csv-cancel-btn').addEventListener('click', function() { preview.hidden = true; csvInput.value = ''; });
    });

    // 캘린더 공유
    var shareCalBtn = $v('veh-share-cal-btn');
    if (shareCalBtn) shareCalBtn.addEventListener('click', function() {
      if (typeof ReservationUtil !== 'undefined') {
        ReservationUtil.showCalendarPicker(async function(cal) {
          toast('캘린더 공유 중...', 'info');
          var count = 0;
          for (var i = 0; i < V.reservations.length; i++) {
            try { await ReservationUtil.shareVehicleResvToCalendar(V.reservations[i], cal.id); count++; } catch(e) {}
          }
          toast(cal.name+'에 '+count+'개 일정 공유 완료!', 'success');
        });
      }
    });

    refresh();
  }

  return {
    initVehicleModule: initVehicleModule,
    refresh: refresh,
  };

})();
