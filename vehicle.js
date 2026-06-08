'use strict';

/**
 * vehicle.js — 차량관리 모듈
 * 의존: config.js, auth.js, sheets.js
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

  /* ── 데이터 로드 ──────────────────────────────────────── */
  async function loadData() {
    try {
      V.vehicles = await SheetsModule.getVehicles();
      var y = V.viewYear, m = V.viewMonth;
      var start = y+'-'+pad(m+1)+'-01';
      var last = new Date(y, m+1, 0).getDate();
      var end = y+'-'+pad(m+1)+'-'+pad(last)+'T23:59';
      V.reservations = await SheetsModule.getVehicleReservations(start, end);
    } catch(e) {
      console.warn('vehicle load error', e);
    }
  }

  /* ── 차량 필터 드롭다운 ─────────────────────────────── */
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

  /* ── 달력 렌더 ────────────────────────────────────────── */
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
    var today = new Date();
    var todayStr = today.getFullYear()+'-'+pad(today.getMonth()+1)+'-'+pad(today.getDate());

    var html = '<div class="res-cal-grid">';
    ['일','월','화','수','목','금','토'].forEach(function(d) {
      html += '<div class="res-cal-dow">'+d+'</div>';
    });

    for (var i = 0; i < firstDay; i++) html += '<div class="res-cal-cell res-cal-empty"></div>';

    for (var d = 1; d <= lastDate; d++) {
      var dateStr = y+'-'+pad(m+1)+'-'+pad(d);
      var isToday = (dateStr === todayStr);
      var isPast  = (dateStr < todayStr);
      var dayResv = byDay[dateStr] || [];

      html += '<div class="res-cal-cell'+(isToday?' res-cal-today':'')+(isPast?' res-cal-past':'')+'" data-date="'+dateStr+'">';
      html += '<div class="res-cal-date">'+d+'</div>';

      dayResv.slice(0,3).forEach(function(r) {
        var veh = V.vehicles.find(function(v){ return v.id === r.vehicleId; });
        var color = TYPE_COLORS[(veh&&veh.vehicleType)||'기타'] || '#9E9E9E';
        html += '<div class="res-cal-item" style="background:'+color+'" data-id="'+r.id+'" title="'+
          r.vehicleName+'\n'+r.fromName+' | '+r.destination+'\n'+formatDT(r.startAt)+'">'+
          '<span class="res-cal-item-time">'+(r.startAt||'').slice(11,16)+'</span> '+
          r.vehicleName+': '+r.destination+'</div>';
      });
      if (dayResv.length > 3) {
        html += '<div class="res-cal-more">+' + (dayResv.length-3) + '건 더보기</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    cal.innerHTML = html;

    cal.querySelectorAll('.res-cal-cell[data-date]').forEach(function(cell) {
      cell.addEventListener('click', function(e) {
        if (e.target.classList.contains('res-cal-item')) return;
        openResvModal(null, cell.dataset.date);
      });
    });
    cal.querySelectorAll('.res-cal-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        var resv = V.reservations.find(function(r){ return r.id === item.dataset.id; });
        if (resv) openResvModal(resv, null);
      });
    });
  }

  /* ── 예약 모달 ────────────────────────────────────────── */
  function openResvModal(resv, defaultDate) {
    V.editResv = resv;
    $v('veh-modal-title').textContent = resv ? '차량 예약 상세/수정' : '차량 예약';

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
    $v('veh-resv-purpose').value = resv ? (resv.purpose||'') : '';
    $v('veh-resv-passengers').value = resv ? (resv.passengers||'1') : '1';

    if (resv) {
      $v('veh-resv-start').value = (resv.startAt||'').slice(0,16);
      $v('veh-resv-end').value   = (resv.endAt||'').slice(0,16);
    } else if (defaultDate) {
      $v('veh-resv-start').value = defaultDate + 'T09:00';
      $v('veh-resv-end').value   = defaultDate + 'T18:00';
    } else {
      var now = new Date();
      $v('veh-resv-start').value = toLocalDT(now);
      $v('veh-resv-end').value   = toLocalDT(new Date(now.getTime()+8*60*60*1000));
    }

    var statusRow = $v('veh-resv-status-row');
    if (statusRow) statusRow.style.display = resv ? '' : 'none';
    if (resv && $v('veh-resv-status')) $v('veh-resv-status').value = resv.status||'확정';

    var deleteBtn = $v('veh-resv-delete-btn');
    if (deleteBtn) deleteBtn.style.display = resv ? '' : 'none';

    var canEdit = V.isAdmin || !resv || (resv.fromId && window._workMe && resv.fromId === window._workMe.id);
    ['veh-resv-vehicle','veh-resv-start','veh-resv-end','veh-resv-destination','veh-resv-purpose','veh-resv-passengers'].forEach(function(id) {
      var el = $v(id); if (el) el.disabled = !canEdit;
    });
    var saveBtn = $v('veh-resv-save-btn');
    if (saveBtn) saveBtn.style.display = canEdit ? '' : 'none';

    $v('veh-resv-modal').hidden = false;
  }

  async function saveResvModal() {
    var vId = $v('veh-resv-vehicle').value;
    var veh = V.vehicles.find(function(v){ return v.id === vId; });
    var destination = ($v('veh-resv-destination').value||'').trim();
    var startAt = $v('veh-resv-start').value;
    var endAt   = $v('veh-resv-end').value;

    if (!vId) { toast('차량을 선택하세요.','error'); return; }
    if (!destination) { toast('행선지를 입력하세요.','error'); return; }
    if (!startAt || !endAt) { toast('시간을 입력하세요.','error'); return; }
    if (endAt <= startAt) { toast('종료 시간이 시작 시간보다 늦어야 합니다.','error'); return; }

    // 충돌 검사
    var conflict = V.reservations.find(function(r) {
      if (V.editResv && r.id === V.editResv.id) return false;
      if (r.status === '취소') return false;
      if (r.vehicleId !== vId) return false;
      return r.startAt < endAt && r.endAt > startAt;
    });
    if (conflict) {
      toast('⚠️ 해당 차량은 '+formatDT(conflict.startAt)+' ~ '+formatDT(conflict.endAt)+' 이미 예약되어 있습니다.','error');
      return;
    }

    var me = window._workMe || {};
    var data = {
      vehicleId: vId, vehicleName: veh ? veh.vehicleName : vId,
      fromId: me.id||'', fromName: me.name||'', department: me.department||'',
      startAt: startAt, endAt: endAt,
      destination: destination,
      purpose: ($v('veh-resv-purpose').value||'').trim(),
      passengers: $v('veh-resv-passengers').value||'1',
      status: V.editResv ? ($v('veh-resv-status').value||'확정') : '확정',
    };

    var saveBtn = $v('veh-resv-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }
    try {
      if (V.editResv) {
        await SheetsModule.updateVehicleReservation(V.editResv._row, Object.assign({}, V.editResv, data));
      } else {
        await SheetsModule.createVehicleReservation(data);
      }
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
    } catch(e) {
      toast('취소 실패: '+(e.message||e),'error');
    }
  }

  /* ── 관리자: 차량 관리 ────────────────────────────────── */
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
    $v('veh-vm-name').value = veh ? veh.vehicleName : '';
    $v('veh-vm-num').value = veh ? veh.vehicleNum : '';
    $v('veh-vm-type').value = veh ? veh.vehicleType : '승용';
    $v('veh-vm-capacity').value = veh ? veh.capacity : '4';
    $v('veh-vm-note').value = veh ? veh.note : '';
    modal._veh = veh || null;
    modal.hidden = false;
  }

  async function saveVehicleModal() {
    var modal = $v('veh-vehicle-modal');
    var name = ($v('veh-vm-name').value||'').trim();
    var num  = ($v('veh-vm-num').value||'').trim();
    var type = $v('veh-vm-type').value;
    var cap  = $v('veh-vm-capacity').value;
    var note = ($v('veh-vm-note').value||'').trim();
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
    } catch(e) {
      toast('저장 실패: '+(e.message||e),'error');
    } finally {
      btn.disabled = false; btn.textContent = '저장';
    }
  }

  /* ── 전체 갱신 ────────────────────────────────────────── */
  async function refresh() {
    await loadData();
    renderVehicleFilter();
    renderCalendar();
    renderVehicleAdmin();
  }

  /* ── 초기화 ───────────────────────────────────────────── */
  function initVehicleModule(isAdmin) {
    V.isAdmin = !!isAdmin;
    var now = new Date();
    V.viewYear  = now.getFullYear();
    V.viewMonth = now.getMonth();

    var prevBtn = $v('veh-cal-prev');
    var nextBtn = $v('veh-cal-next');
    if (prevBtn) prevBtn.addEventListener('click', async function() {
      V.viewMonth--;
      if (V.viewMonth < 0) { V.viewMonth = 11; V.viewYear--; }
      await refresh();
    });
    if (nextBtn) nextBtn.addEventListener('click', async function() {
      V.viewMonth++;
      if (V.viewMonth > 11) { V.viewMonth = 0; V.viewYear++; }
      await refresh();
    });

    var vFilter = $v('veh-vehicle-filter');
    if (vFilter) vFilter.addEventListener('change', function() { renderCalendar(); });

    var addVehBtn = $v('veh-add-vehicle-btn');
    if (addVehBtn) addVehBtn.addEventListener('click', function() { openVehicleModal(null); });

    var vmSave = $v('veh-vm-save-btn');
    if (vmSave) vmSave.addEventListener('click', saveVehicleModal);
    var vmCancel = $v('veh-vm-cancel-btn');
    if (vmCancel) vmCancel.addEventListener('click', function() { $v('veh-vehicle-modal').hidden = true; });

    var resvSave = $v('veh-resv-save-btn');
    if (resvSave) resvSave.addEventListener('click', saveResvModal);
    var resvDel = $v('veh-resv-delete-btn');
    if (resvDel) resvDel.addEventListener('click', deleteResv);
    var resvClose = $v('veh-resv-close-btn');
    if (resvClose) resvClose.addEventListener('click', function() { $v('veh-resv-modal').hidden = true; });

    // '예약하기' 버튼 이벤트
    var vehModal = document.getElementById('veh-resv-modal');
    if (vehModal) vehModal.addEventListener('open-new-internal', function() { openResvModal(null, null); });

    var adminLink = $v('veh-admin-link');
    if (adminLink) adminLink.style.display = isAdmin ? '' : 'none';
    var adminSection = $v('veh-admin-section');
    if (adminSection) adminSection.hidden = !isAdmin;

    // 설정 탭 관리자 카드
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
          preview.hidden = true;
          csvInput.value = '';
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
            var r = V.reservations[i];
            try { await ReservationUtil.shareVehicleResvToCalendar(r, cal.id); count++; } catch(e) {}
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
