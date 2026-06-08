'use strict';

/**
 * facility.js — 대관업무 모듈
 * 의존: config.js, auth.js, sheets.js
 */
var FacilityModule = (function () {

  var F = {
    facilities: [],       // [{id, buildingName, rooms:[{id,name,capacity}], color}]
    reservations: [],     // 이번 달 예약 목록
    viewYear: 0,
    viewMonth: 0,         // 0-based
    selectedBuilding: null,
    selectedRoom: null,
    editResv: null,       // 현재 수정 중인 예약
    isAdmin: false,
  };

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

  /* ── 데이터 로드 ──────────────────────────────────────── */
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
      var last = new Date(y, m+1, 0).getDate();
      var end = y+'-'+pad(m+1)+'-'+pad(last)+'T23:59';
      F.reservations = await SheetsModule.getFacilityReservations(start, end);
    } catch(e) {
      console.warn('facility load error', e);
    }
  }

  /* ── 필터 드롭다운 렌더 ──────────────────────────────── */
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
        opt.value = r.id; opt.textContent = r.name + (r.capacity ? ' ('+r.capacity+'인)':'');
        rSel.appendChild(opt);
      });
    }
  }

  /* ── 달력 렌더 ────────────────────────────────────────── */
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

    // 날짜별 그룹
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
        var fac = F.facilities.find(function(f){ return f.id === r.buildingId; });
        var color = (fac && fac.color) || '#4285F4';
        html += '<div class="res-cal-item" style="background:'+color+'" data-id="'+r.id+'" title="'+
          r.buildingName+' '+r.roomName+'\n'+r.title+'\n'+formatDT(r.startAt)+'">'+
          '<span class="res-cal-item-time">'+(r.startAt||'').slice(11,16)+'</span> '+
          r.roomName+': '+r.title+'</div>';
      });
      if (dayResv.length > 3) {
        html += '<div class="res-cal-more">+' + (dayResv.length-3) + '건 더보기</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    cal.innerHTML = html;

    // 날짜 클릭 → 예약 생성
    cal.querySelectorAll('.res-cal-cell[data-date]').forEach(function(cell) {
      cell.addEventListener('click', function(e) {
        if (e.target.classList.contains('res-cal-item')) return; // 예약 클릭은 별도 처리
        openResvModal(null, cell.dataset.date);
      });
    });

    // 예약 클릭 → 상세/수정
    cal.querySelectorAll('.res-cal-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        var resv = F.reservations.find(function(r){ return r.id === item.dataset.id; });
        if (resv) openResvModal(resv, null);
      });
    });
  }

  /* ── 예약 모달 ────────────────────────────────────────── */
  function openResvModal(resv, defaultDate) {
    F.editResv = resv;

    // 제목
    $f('fac-modal-title').textContent = resv ? '예약 상세/수정' : '새 예약';

    // 건물 셀렉트 채우기
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

    $f('fac-resv-title').value = resv ? (resv.title||'') : '';
    $f('fac-resv-purpose').value = resv ? (resv.purpose||'') : '';
    $f('fac-resv-attendees').value = resv ? (resv.attendees||'') : '';

    if (resv) {
      $f('fac-resv-start').value = (resv.startAt||'').slice(0,16);
      $f('fac-resv-end').value   = (resv.endAt||'').slice(0,16);
    } else if (defaultDate) {
      $f('fac-resv-start').value = defaultDate + 'T09:00';
      $f('fac-resv-end').value   = defaultDate + 'T10:00';
    } else {
      var now = new Date();
      $f('fac-resv-start').value = toLocalDT(now);
      $f('fac-resv-end').value   = toLocalDT(new Date(now.getTime()+60*60*1000));
    }

    var statusRow = $f('fac-resv-status-row');
    if (statusRow) statusRow.style.display = resv ? '' : 'none';
    if (resv && $f('fac-resv-status')) $f('fac-resv-status').value = resv.status||'확정';

    var deleteBtn = $f('fac-resv-delete-btn');
    if (deleteBtn) deleteBtn.style.display = resv ? '' : 'none';

    // 관리자 아닌 경우, 본인 예약만 수정 가능
    var canEdit = F.isAdmin || !resv || (resv.fromId && window._workMe && resv.fromId === window._workMe.id);
    ['fac-resv-title','fac-resv-building','fac-resv-room','fac-resv-start','fac-resv-end','fac-resv-purpose','fac-resv-attendees'].forEach(function(id) {
      var el = $f(id); if (el) el.disabled = !canEdit;
    });
    var saveBtn = $f('fac-resv-save-btn');
    if (saveBtn) saveBtn.style.display = canEdit ? '' : 'none';

    $f('fac-resv-modal').hidden = false;
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

  async function saveResvModal() {
    var bSel = $f('fac-resv-building');
    var rSel = $f('fac-resv-room');
    var bId = bSel.value, rId = rSel.value;
    var fac = F.facilities.find(function(f){ return f.id === bId; });
    var room = fac && fac.rooms ? fac.rooms.find(function(r){ return r.id === rId; }) : null;
    var title = ($f('fac-resv-title').value||'').trim();
    var startAt = $f('fac-resv-start').value;
    var endAt   = $f('fac-resv-end').value;

    if (!bId) { toast('건물을 선택하세요.','error'); return; }
    if (!rId) { toast('호실을 선택하세요.','error'); return; }
    if (!title) { toast('제목을 입력하세요.','error'); return; }
    if (!startAt || !endAt) { toast('시간을 입력하세요.','error'); return; }
    if (endAt <= startAt) { toast('종료 시간이 시작 시간보다 늦어야 합니다.','error'); return; }

    // 충돌 검사
    var conflict = F.reservations.find(function(r) {
      if (F.editResv && r.id === F.editResv.id) return false;
      if (r.status === '취소') return false;
      if (r.buildingId !== bId || r.roomId !== rId) return false;
      return r.startAt < endAt && r.endAt > startAt;
    });
    if (conflict) {
      toast('⚠️ '+conflict.roomName+'은(는) '+formatDT(conflict.startAt)+' ~ '+formatDT(conflict.endAt)+' 이미 예약되어 있습니다.','error');
      return;
    }

    var me = window._workMe || {};
    var data = {
      buildingId: bId, buildingName: fac ? fac.buildingName : '',
      roomId: rId, roomName: room ? room.name : rId,
      title: title, fromId: me.id||'', fromName: me.name||'',
      department: me.department||'',
      startAt: startAt, endAt: endAt,
      purpose: ($f('fac-resv-purpose').value||'').trim(),
      attendees: ($f('fac-resv-attendees').value||'').trim(),
      status: F.editResv ? ($f('fac-resv-status').value||'확정') : '확정',
    };

    var saveBtn = $f('fac-resv-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }

    try {
      if (F.editResv) {
        await SheetsModule.updateFacilityReservation(F.editResv._row, Object.assign({}, F.editResv, data));
      } else {
        await SheetsModule.createFacilityReservation(data);
      }
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
    } catch(e) {
      toast('취소 실패: '+(e.message||e),'error');
    }
  }

  /* ── 관리자: 시설 관리 ───────────────────────────────── */
  function renderFacilityAdmin() {
    var el = $f('fac-admin-building-list');
    if (!el) return;
    if (F.facilities.length === 0) {
      el.innerHTML = '<p class="empty-state">등록된 건물이 없습니다.</p>';
      return;
    }
    el.innerHTML = '';
    F.facilities.forEach(function(fac) {
      var div = document.createElement('div');
      div.className = 'fac-building-row';
      div.innerHTML =
        '<div class="fac-building-name"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:'+fac.color+';margin-right:6px"></span>'+fac.buildingName+'</div>' +
        '<div class="fac-room-chips">' +
          (fac.rooms||[]).map(function(r){ return '<span class="fac-room-chip">'+r.name+(r.capacity?' ('+r.capacity+'인)':'')+'</span>'; }).join('') +
        '</div>' +
        '<div class="fac-building-actions">' +
          '<button class="btn btn-ghost btn-sm fac-edit-building-btn" data-id="'+fac.id+'">수정</button>' +
          '<button class="btn btn-ghost btn-sm btn-danger fac-del-building-btn" data-row="'+fac._row+'">삭제</button>' +
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
    $f('fac-bm-name').value = fac ? fac.buildingName : '';
    $f('fac-bm-color').value = fac ? (fac.color||'#4285F4') : '#4285F4';

    // 호실 목록
    var roomsData = (fac && fac.rooms) ? fac.rooms : [];
    renderRoomEditor(roomsData);

    modal._fac = fac || null;
    modal.hidden = false;
  }

  function renderRoomEditor(rooms) {
    var el = $f('fac-bm-rooms');
    if (!el) return;
    el.innerHTML = '';
    rooms.forEach(function(r, i) {
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
        await SheetsModule.updateFacility(modal._fac._row, Object.assign({}, modal._fac, { buildingName: name, rooms: rooms, color: color }));
      } else {
        await SheetsModule.addFacility({ buildingName: name, rooms: rooms, color: color });
      }
      toast('✅ 시설 정보가 저장되었습니다.','success');
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
    renderBuildingFilter();
    renderCalendar();
    renderFacilityAdmin();
  }

  /* ── 초기화 ───────────────────────────────────────────── */
  function initFacilityModule(isAdmin) {
    F.isAdmin = !!isAdmin;
    var now = new Date();
    F.viewYear  = now.getFullYear();
    F.viewMonth = now.getMonth();

    // 이전/다음 달
    var prevBtn = $f('fac-cal-prev');
    var nextBtn = $f('fac-cal-next');
    if (prevBtn) prevBtn.addEventListener('click', async function() {
      F.viewMonth--;
      if (F.viewMonth < 0) { F.viewMonth = 11; F.viewYear--; }
      await refresh();
    });
    if (nextBtn) nextBtn.addEventListener('click', async function() {
      F.viewMonth++;
      if (F.viewMonth > 11) { F.viewMonth = 0; F.viewYear++; }
      await refresh();
    });

    // 필터
    var bFilter = $f('fac-building-filter');
    if (bFilter) bFilter.addEventListener('change', function() {
      renderRoomFilter(); renderCalendar();
    });
    var rFilter = $f('fac-room-filter');
    if (rFilter) rFilter.addEventListener('change', function() { renderCalendar(); });

    // 건물 추가 버튼 (관리자)
    var addBldBtn = $f('fac-add-building-btn');
    if (addBldBtn) addBldBtn.addEventListener('click', function() { openBuildingModal(null); });

    // 건물 모달 - 호실 추가
    var addRoomBtn = $f('fac-bm-add-room-btn');
    if (addRoomBtn) addRoomBtn.addEventListener('click', function() {
      var el = $f('fac-bm-rooms');
      var rows = el.querySelectorAll('.fac-room-edit-row');
      var mock = [{ id:'', name:'', capacity:'' }];
      renderRoomEditor(Array.from(rows).map(function(row) {
        return { name: row.querySelector('.room-name-input').value,
                 capacity: row.querySelector('.room-cap-input').value };
      }).concat(mock));
    });

    // 건물 모달 저장/취소
    var bmSave = $f('fac-bm-save-btn');
    if (bmSave) bmSave.addEventListener('click', saveBuildingModal);
    var bmCancel = $f('fac-bm-cancel-btn');
    if (bmCancel) bmCancel.addEventListener('click', function() { $f('fac-building-modal').hidden = true; });

    // 예약 모달
    var resvSave = $f('fac-resv-save-btn');
    if (resvSave) resvSave.addEventListener('click', saveResvModal);
    var resvDel = $f('fac-resv-delete-btn');
    if (resvDel) resvDel.addEventListener('click', deleteResv);
    var resvClose = $f('fac-resv-close-btn');
    if (resvClose) resvClose.addEventListener('click', function() { $f('fac-resv-modal').hidden = true; });

    // 건물 호실 선택 → 호실 드롭다운 연동
    var resvBuilding = $f('fac-resv-building');
    if (resvBuilding) resvBuilding.addEventListener('change', function() {
      updateRoomSelect(this.value);
    });

    // '예약하기' 버튼 이벤트
    var facModal = document.getElementById('fac-resv-modal');
    if (facModal) facModal.addEventListener('open-new-internal', function() { openResvModal(null, null); });

    // 관리자 어드민 링크 표시
    var adminLink = $f('fac-admin-link');
    if (adminLink) adminLink.style.display = isAdmin ? '' : 'none';
    var adminSection = $f('fac-admin-section');
    if (adminSection) adminSection.hidden = !isAdmin;

    // 설정 탭 관리자 카드 표시
    var settingsFacCard = document.getElementById('settings-fac-card');
    if (settingsFacCard) settingsFacCard.hidden = !isAdmin;

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
      // 미리보기 테이블
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
          preview.hidden = true;
          csvInput.value = '';
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
            var r = F.reservations[i];
            try { await ReservationUtil.shareFacilityResvToCalendar(r, cal.id); count++; } catch(e) {}
          }
          toast(cal.name+'에 '+count+'개 일정 공유 완료!', 'success');
        });
      }
    });

    // 최초 로드
    refresh();
  }

  return {
    initFacilityModule: initFacilityModule,
    refresh: refresh,
  };

})();
