'use strict';

/**
 * classroom.js — 강의실 예약 현황판 모듈
 * 의존: config.js, auth.js, sheets.js, resutil.js
 */
var ClassroomModule = (function () {

  var C = {
    facilities:   [],  // 시설 목록
    reservations: [],  // 이번 주/학기 예약
    viewMode:     'timetable', // 'timetable' | 'month'
    viewWeekStart: null,  // 주간 뷰 시작일 (Date)
    viewYear:      0,
    viewMonth:     0,
    selectedBuilding: '',
    selectedRoom:     '',
    editResv:         null,
    isAdmin:          false,
    csvPreviewData:   null,
  };

  var TYPE_COLORS = {
    '학점은행제': { bg:'#1565C0', text:'#fff', light:'#E3F2FD' },
    '특강':       { bg:'#E65100', text:'#fff', light:'#FFF3E0' },
    '대관':       { bg:'#2E7D32', text:'#fff', light:'#E8F5E9' },
    '기타':       { bg:'#546E7A', text:'#fff', light:'#ECEFF1' },
  };

  var WEEKDAYS = ['일','월','화','수','목','금','토'];
  var PERIODS = [
    { id:'1',  label:'1교시',  start:'09:00', end:'09:50' },
    { id:'2',  label:'2교시',  start:'10:00', end:'10:50' },
    { id:'3',  label:'3교시',  start:'11:00', end:'11:50' },
    { id:'4',  label:'4교시',  start:'12:00', end:'12:50' },
    { id:'5',  label:'5교시',  start:'13:00', end:'13:50' },
    { id:'6',  label:'6교시',  start:'14:00', end:'14:50' },
    { id:'7',  label:'7교시',  start:'15:00', end:'15:50' },
    { id:'8',  label:'8교시',  start:'16:00', end:'16:50' },
    { id:'9',  label:'9교시',  start:'17:00', end:'17:50' },
    { id:'10', label:'야간1',  start:'18:00', end:'18:50' },
    { id:'11', label:'야간2',  start:'19:00', end:'19:50' },
  ];

  function $c(id) { return document.getElementById(id); }
  function toast(msg, type) { if (typeof window.aseaToast === 'function') window.aseaToast(msg, type); }
  function pad(n) { return String(n).padStart(2,'0'); }

  function dateStr(d) {
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  }

  function getMonday(d) {
    var day = d.getDay();
    var diff = (day === 0) ? -6 : 1 - day;
    var m = new Date(d);
    m.setDate(d.getDate() + diff);
    m.setHours(0,0,0,0);
    return m;
  }

  /* ── 필터 드롭다운 ────────────────────────────────── */
  function renderFilters() {
    var bSel = $c('cls-building-filter');
    var rSel = $c('cls-room-filter');
    if (!bSel) return;
    bSel.innerHTML = '<option value="">전체 건물</option>';
    C.facilities.forEach(function(f) {
      var opt = document.createElement('option');
      opt.value = f.id; opt.textContent = f.buildingName;
      if (C.selectedBuilding === f.id) opt.selected = true;
      bSel.appendChild(opt);
    });
    updateRoomFilter();
  }

  function updateRoomFilter() {
    var rSel = $c('cls-room-filter');
    if (!rSel) return;
    rSel.innerHTML = '<option value="">전체 호실</option>';
    var fac = C.facilities.find(function(f){ return f.id === C.selectedBuilding; });
    if (fac && fac.rooms) {
      fac.rooms.forEach(function(r) {
        var opt = document.createElement('option');
        opt.value = r.id; opt.textContent = r.name+(r.capacity?' ('+r.capacity+'인)':'');
        if (C.selectedRoom === r.id) opt.selected = true;
        rSel.appendChild(opt);
      });
    }
  }

  /* ── 데이터 로드 ──────────────────────────────────── */
  async function loadData() {
    C.facilities = await SheetsModule.getFacilities();
    C.facilities.forEach(function(f) {
      if (typeof f.rooms === 'string') { try { f.rooms = JSON.parse(f.rooms); } catch(e){ f.rooms=[]; } }
    });

    // 뷰 모드에 따라 날짜 범위 설정
    var start, end;
    if (C.viewMode === 'timetable') {
      start = dateStr(C.viewWeekStart);
      var ws = new Date(C.viewWeekStart);
      ws.setDate(ws.getDate() + 6);
      end = dateStr(ws);
    } else {
      start = C.viewYear+'-'+pad(C.viewMonth+1)+'-01';
      var lastD = new Date(C.viewYear, C.viewMonth+1, 0).getDate();
      end = C.viewYear+'-'+pad(C.viewMonth+1)+'-'+pad(lastD);
    }

    C.reservations = await SheetsModule.getClassroomReservations(start, end);
    // weekdays 파싱
    C.reservations.forEach(function(r) {
      if (typeof r.weekdays === 'string' && r.weekdays) {
        r._weekdays = r.weekdays.split(',').map(Number);
      } else { r._weekdays = []; }
    });
  }

  /* ─────────────────────────────────────────────────────────
     시간표 뷰 (월~토 × 교시)
     필터된 결과를 한 호실 기준으로 시간표 형태로 렌더링
  ──────────────────────────────────────────────────────────── */
  function renderTimetable() {
    var container = $c('cls-timetable-wrap');
    if (!container) return;

    // 주간 날짜 배열 (월~토, 6일)
    var days = [];
    for (var i = 0; i < 6; i++) {
      var d = new Date(C.viewWeekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    // 날짜 범위 내에 걸리는 예약 필터
    var weekStartStr = dateStr(C.viewWeekStart);
    var weekEnd = new Date(C.viewWeekStart); weekEnd.setDate(weekEnd.getDate()+5);
    var weekEndStr = dateStr(weekEnd);
    var today = dateStr(new Date());

    var filtered = C.reservations.filter(function(r) {
      if (r.status === '취소') return false;
      if (C.selectedBuilding && r.buildingId !== C.selectedBuilding) return false;
      if (C.selectedRoom && r.roomId !== C.selectedRoom) return false;
      // 날짜 범위 겹침
      var rs = r.startDate, re = r.endDate || r.startDate;
      return rs <= weekEndStr && re >= weekStartStr;
    });

    var html = '<div class="cls-timetable-wrap"><table class="cls-timetable-table">';
    // 헤더: 교시 + 날짜
    html += '<thead><tr><th class="cls-period-col">교시</th>';
    days.forEach(function(d) {
      var ds = dateStr(d);
      var isToday = (ds === today);
      html += '<th class="cls-day-col'+(isToday?' cls-today':'')+'">'+
        WEEKDAYS[d.getDay()]+'<br><span style="font-weight:400;font-size:11px">'+
        pad(d.getMonth()+1)+'/'+pad(d.getDate())+'</span></th>';
    });
    html += '</tr></thead><tbody>';

    PERIODS.forEach(function(period) {
      html += '<tr>';
      html += '<td class="cls-period-label"><div class="cls-period-id">'+period.id+'</div><div class="cls-period-time">'+period.start+'</div></td>';

      days.forEach(function(d) {
        var ds = dateStr(d);
        var dow = d.getDay(); // 0=일,1=월,...

        // 이 칸에 해당하는 예약 찾기
        var matches = filtered.filter(function(r) {
          var rs = r.startDate, re = r.endDate || r.startDate;
          if (ds < rs || ds > re) return false;
          if (r._weekdays.length > 0 && r._weekdays.indexOf(dow) === -1) return false;
          var sp = parseInt(r.startPeriod)||1, ep = parseInt(r.endPeriod)||1;
          var pid = parseInt(period.id);
          return pid >= sp && pid <= ep;
        });

        if (matches.length === 0) {
          // 빈 칸: 클릭으로 예약 생성
          html += '<td class="cls-empty-cell" data-date="'+ds+'" data-period="'+period.id+'">'+
            '<div class="cls-add-hint">+</div></td>';
        } else {
          var r = matches[0]; // 첫 번째 예약
          var tc = TYPE_COLORS[r.reservationType] || TYPE_COLORS['기타'];
          var sp = parseInt(r.startPeriod)||1;
          var pid = parseInt(period.id);
          var isFirst = (pid === sp);
          var epn = parseInt(r.endPeriod)||1;
          var span = epn - sp + 1;

          if (isFirst) {
            // rowspan으로 합쳐서 보여주는 대신 첫 칸에만 내용 표시
            html += '<td class="cls-resv-cell" style="background:'+tc.bg+';color:'+tc.text+'" '+
              'data-id="'+r.id+'" '+
              'title="'+r.title+'\n'+r.buildingName+' '+r.roomName+'\n'+r.fromName+' ('+r.department+')">' +
              '<div class="cls-resv-type-dot" style="background:'+tc.light+';color:'+tc.bg+'">' + r.reservationType + '</div>' +
              '<div class="cls-resv-title">' + r.title + '</div>' +
              '<div class="cls-resv-sub">' + r.roomName + ' · ' + r.fromName + '</div>' +
              (matches.length > 1 ? '<div class="cls-resv-more">+' + (matches.length-1) + '</div>' : '') +
              '</td>';
          } else {
            // 이어지는 칸은 같은 색만
            html += '<td class="cls-resv-cell cls-resv-continue" style="background:'+tc.bg+';opacity:.7" data-id="'+r.id+'"></td>';
          }
        }
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    // 클릭 이벤트
    container.querySelectorAll('.cls-empty-cell').forEach(function(cell) {
      cell.addEventListener('click', function() {
        openResvModal(null, cell.dataset.date, cell.dataset.period);
      });
    });
    container.querySelectorAll('.cls-resv-cell[data-id]').forEach(function(cell) {
      cell.addEventListener('click', function() {
        var resv = C.reservations.find(function(r){ return r.id === cell.dataset.id; });
        if (resv) openResvModal(resv, null, null);
      });
    });
  }

  /* ─────────────────────────────────────────────────────────
     월간 뷰
  ──────────────────────────────────────────────────────────── */
  function renderMonthView() {
    var container = $c('cls-month-calendar');
    if (!container) return;
    var y = C.viewYear, m = C.viewMonth;
    var calTitle = $c('cls-cal-title');
    if (calTitle) calTitle.textContent = y+'년 '+(m+1)+'월 강의실 현황';

    var today = dateStr(new Date());
    var firstDay = new Date(y, m, 1).getDay();
    var lastDate = new Date(y, m+1, 0).getDate();

    var filtered = C.reservations.filter(function(r) {
      if (r.status === '취소') return false;
      if (C.selectedBuilding && r.buildingId !== C.selectedBuilding) return false;
      if (C.selectedRoom && r.roomId !== C.selectedRoom) return false;
      return true;
    });

    // 날짜별로 해당하는 예약 찾기
    function resvForDay(ds) {
      var dow = new Date(ds).getDay();
      return filtered.filter(function(r) {
        var rs = r.startDate, re = r.endDate||r.startDate;
        if (ds < rs || ds > re) return false;
        if (r._weekdays.length > 0 && r._weekdays.indexOf(dow) === -1) return false;
        return true;
      });
    }

    var html = '<div class="res-cal-grid">';
    ['일','월','화','수','목','금','토'].forEach(function(d) { html += '<div class="res-cal-dow">'+d+'</div>'; });
    for (var i = 0; i < firstDay; i++) html += '<div class="res-cal-cell res-cal-empty"></div>';

    for (var d = 1; d <= lastDate; d++) {
      var ds = y+'-'+pad(m+1)+'-'+pad(d);
      var isToday = (ds === today);
      var dayResv = resvForDay(ds);

      html += '<div class="res-cal-cell'+(isToday?' res-cal-today':'')+'" data-date="'+ds+'">';
      html += '<div class="res-cal-date">'+d+'</div>';
      dayResv.slice(0,3).forEach(function(r) {
        var tc = TYPE_COLORS[r.reservationType]||TYPE_COLORS['기타'];
        html += '<div class="res-cal-item" style="background:'+tc.bg+'" data-id="'+r.id+'" '+
          'title="'+r.title+' | '+r.roomName+' | '+r.startPeriod+'~'+r.endPeriod+'교시">'+
          r.reservationType+': '+r.roomName+'</div>';
      });
      if (dayResv.length > 3) html += '<div class="res-cal-more">+' + (dayResv.length-3) + '</div>';
      html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.res-cal-cell[data-date]').forEach(function(cell) {
      cell.addEventListener('click', function(e) {
        if (e.target.classList.contains('res-cal-item')) return;
        openResvModal(null, cell.dataset.date, null);
      });
    });
    container.querySelectorAll('.res-cal-item[data-id]').forEach(function(item) {
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        var resv = C.reservations.find(function(r){ return r.id === item.dataset.id; });
        if (resv) openResvModal(resv, null, null);
      });
    });
  }

  /* ── 뷰 전환 ────────────────────────────────────────── */
  function renderView() {
    var tt = $c('cls-timetable-view');
    var mv = $c('cls-month-view');
    if (C.viewMode === 'timetable') {
      if (tt) tt.hidden = false;
      if (mv) mv.hidden = true;
      updateWeekTitle();
      renderTimetable();
    } else {
      if (tt) tt.hidden = true;
      if (mv) mv.hidden = false;
      renderMonthView();
    }
  }

  function updateWeekTitle() {
    var el = $c('cls-week-title');
    if (!el) return;
    var ws = C.viewWeekStart;
    var we = new Date(ws); we.setDate(we.getDate()+5);
    el.textContent = ws.getFullYear()+'년 '+pad(ws.getMonth()+1)+'.'+pad(ws.getDate())+' ~ '+
      pad(we.getMonth()+1)+'.'+pad(we.getDate())+' (주간 시간표)';
  }

  /* ── 예약 모달 ────────────────────────────────────────── */
  function populateBuildingSelect(selId, currentBId) {
    var sel = $c(selId);
    if (!sel) return;
    sel.innerHTML = '<option value="">건물 선택 *</option>';
    C.facilities.forEach(function(f) {
      var opt = document.createElement('option');
      opt.value = f.id; opt.textContent = f.buildingName;
      if (currentBId === f.id) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function populateRoomSelect(selId, buildingId, currentRId) {
    var sel = $c(selId);
    if (!sel) return;
    sel.innerHTML = '<option value="">호실 선택 *</option>';
    var fac = C.facilities.find(function(f){ return f.id === buildingId; });
    if (fac && fac.rooms) {
      fac.rooms.forEach(function(r) {
        var opt = document.createElement('option');
        opt.value = r.id; opt.textContent = r.name+(r.capacity?' ('+r.capacity+'인)':'');
        if (currentRId === r.id) opt.selected = true;
        sel.appendChild(opt);
      });
    }
  }

  function openResvModal(resv, defaultDate, defaultPeriod) {
    C.editResv = resv;
    var modal = $c('cls-resv-modal');
    if (!modal) return;
    var mtitle = $c('cls-resv-title');
    if (mtitle) mtitle.textContent = resv ? '예약 상세/수정' : '강의실 예약 등록';

    populateBuildingSelect('cls-resv-building', resv ? resv.buildingId : C.selectedBuilding);
    populateRoomSelect('cls-resv-room', resv ? resv.buildingId : C.selectedBuilding, resv ? resv.roomId : C.selectedRoom);

    if ($c('cls-resv-title-input')) $c('cls-resv-title-input').value = resv ? resv.title : '';
    if ($c('cls-resv-type')) $c('cls-resv-type').value  = resv ? (resv.reservationType||'기타') : '학점은행제';
    if ($c('cls-resv-semester')) $c('cls-resv-semester').value = resv ? (resv.semester||'') : '';
    $c('cls-resv-start-date').value = resv ? resv.startDate : (defaultDate||'');
    $c('cls-resv-end-date').value   = resv ? (resv.endDate||resv.startDate) : (defaultDate||'');
    $c('cls-resv-start-period').value = resv ? (resv.startPeriod||'1') : (defaultPeriod||'1');
    $c('cls-resv-end-period').value   = resv ? (resv.endPeriod||'1') : (defaultPeriod||'1');

    // 요일 체크박스
    var wds = resv ? (resv._weekdays||[]) : [];
    document.querySelectorAll('input[name="cls-weekday"]').forEach(function(cb) {
      cb.checked = wds.indexOf(parseInt(cb.value)) !== -1;
    });

    var deleteBtn = $c('cls-resv-delete-btn');
    if (deleteBtn) deleteBtn.style.display = (C.isAdmin && resv) ? '' : 'none';

    modal.hidden = false;
  }

  async function saveResvModal() {
    var bId = $c('cls-resv-building').value;
    var rId = $c('cls-resv-room').value;
    var title = ($c('cls-resv-title-input')&&$c('cls-resv-title-input').value||'').trim();
    var startDate = $c('cls-resv-start-date').value;
    var endDate   = $c('cls-resv-end-date').value || startDate;
    var sp = $c('cls-resv-start-period').value;
    var ep = $c('cls-resv-end-period').value;

    if (!bId) { toast('건물을 선택하세요.','error'); return; }
    if (!rId) { toast('호실을 선택하세요.','error'); return; }
    if (!title) { toast('제목을 입력하세요.','error'); return; }
    if (!startDate) { toast('시작일을 입력하세요.','error'); return; }

    var fac  = C.facilities.find(function(f){ return f.id === bId; });
    var room = (fac&&fac.rooms) ? fac.rooms.find(function(r){ return r.id === rId; }) : null;
    var weekdays = [];
    document.querySelectorAll('input[name="cls-weekday"]:checked').forEach(function(cb){ weekdays.push(cb.value); });

    var me = window._workMe || {};
    var data = {
      buildingId: bId, buildingName: fac ? fac.buildingName : '',
      roomId: rId, roomName: room ? room.name : rId,
      title: title,
      fromId: me.id||'', fromName: me.name||'',
      department: me.department||'',
      startDate: startDate, endDate: endDate,
      startPeriod: sp, endPeriod: ep,
      weekdays: weekdays,
      reservationType: $c('cls-resv-type').value,
      semester: $c('cls-resv-semester').value||'',
      status: '확정',
    };

    var btn = $c('cls-resv-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
    try {
      if (C.editResv) {
        await SheetsModule.updateClassroomReservation(C.editResv._row, Object.assign({}, C.editResv, data));
      } else {
        await SheetsModule.createClassroomReservation(data);
      }
      toast('✅ 강의실 예약이 등록되었습니다.','success');
      $c('cls-resv-modal').hidden = true;
      await refresh();
    } catch(e) {
      toast('저장 실패: '+(e.message||e),'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '저장'; }
    }
  }

  /* ── CSV 일괄 등록 ────────────────────────────────────── */
  function handleCSV(file) {
    var reader = new FileReader();
    reader.onload = async function(e) {
      var text = e.target.result;
      var parsed = ReservationUtil.parseClassroomCSV(text, C.facilities);
      C.csvPreviewData = parsed;

      var preview = $c('cls-csv-preview');
      if (!preview) return;
      if (!parsed.length) {
        preview.hidden = false;
        preview.innerHTML = '<span style="color:#e53935">파싱된 데이터 없음 — 양식을 확인하세요</span>';
        return;
      }
      preview.hidden = false;
      var rows = parsed.slice(0, 5).map(function(r) {
        return '<tr><td>['+r.reservationType+']</td><td>'+r.buildingName+' '+r.roomName+'</td><td>'+r.title+'</td><td>'+r.startDate+(r.endDate&&r.endDate!==r.startDate?' ~ '+r.endDate:'')+'</td></tr>';
      }).join('');
      preview.innerHTML =
        '<strong>미리보기 ('+parsed.length+'건)</strong><br>' +
        '<table><tr><th>유형</th><th>강의실</th><th>제목</th><th>기간</th></tr>' + rows +
        (parsed.length > 5 ? '<tr><td colspan="4" style="text-align:center">...외 '+(parsed.length-5)+'건</td></tr>' : '') +
        '</table>' +
        '<div style="margin-top:8px;display:flex;gap:8px">' +
        '<button id="cls-csv-confirm-btn" class="btn btn-primary btn-sm">업로드 확인</button>' +
        '<button id="cls-csv-cancel-btn" class="btn btn-ghost btn-sm">취소</button></div>';

      document.getElementById('cls-csv-confirm-btn').addEventListener('click', async function() {
        this.disabled = true; this.textContent = '등록 중...';
        try {
          var cnt = await SheetsModule.bulkCreateClassroomReservations(C.csvPreviewData);
          toast('✅ '+cnt+'건 일괄 등록 완료!','success');
          preview.hidden = true;
          $c('cls-csv-upload-input') && ($c('cls-csv-upload-input').value = '');
          C.csvPreviewData = null;
          await refresh();
        } catch(err) {
          toast('등록 실패: '+(err.message||err),'error');
          this.disabled = false; this.textContent = '업로드 확인';
        }
      });
      document.getElementById('cls-csv-cancel-btn').addEventListener('click', function() {
        preview.hidden = true;
        $c('cls-csv-upload-input') && ($c('cls-csv-upload-input').value = '');
      });
    };
    reader.readAsText(file, 'UTF-8');
  }

  /* ── 캘린더 공유 ──────────────────────────────────────── */
  async function shareToCalendar() {
    if (C.reservations.length === 0) { toast('공유할 예약이 없습니다.','warning'); return; }
    var filtered = C.reservations.filter(function(r){
      if (r.status === '취소') return false;
      if (C.selectedBuilding && r.buildingId !== C.selectedBuilding) return false;
      if (C.selectedRoom && r.roomId !== C.selectedRoom) return false;
      return true;
    });
    if (filtered.length === 0) { toast('필터 조건에 맞는 예약이 없습니다.','warning'); return; }

    await ReservationUtil.showCalendarPicker(async function(cal) {
      var btn = $c('cls-share-cal-btn');
      if (btn) { btn.disabled = true; btn.textContent = '공유 중...'; }
      try {
        var result = await ReservationUtil.shareClassroomResvToCalendar(filtered, cal.id);
        toast('✅ 캘린더('+cal.name+') 공유 완료: '+result.success+'건' + (result.fail?' / 실패:'+result.fail:''), 'success');
      } catch(e) {
        toast('공유 실패: '+(e.message||e),'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📅 캘린더 공유'; }
      }
    });
  }

  /* ── 전체 갱신 ────────────────────────────────────────── */
  async function refresh() {
    try { await loadData(); } catch(e) {}
    renderFilters();
    renderView();
  }

  /* ── 초기화 ───────────────────────────────────────────── */
  function initClassroomModule(isAdmin) {
    C.isAdmin = !!isAdmin;
    var now = new Date();
    C.viewWeekStart = getMonday(now);
    C.viewYear  = now.getFullYear();
    C.viewMonth = now.getMonth();

    // 뷰 모드 토글
    var ttBtn = $c('cls-view-timetable-btn');
    var mBtn  = $c('cls-view-month-btn');
    function setViewMode(mode) {
      C.viewMode = mode;
      if (ttBtn) ttBtn.classList.toggle('active-view', mode === 'timetable');
      if (mBtn)  mBtn.classList.toggle('active-view', mode === 'month');
      renderView();
    }
    if (ttBtn) ttBtn.addEventListener('click', function(){ setViewMode('timetable'); });
    if (mBtn)  mBtn.addEventListener('click', function(){ setViewMode('month'); });

    // 이전/다음 — 시간표 뷰
    var weekPrev = $c('cls-week-prev');
    var weekNext = $c('cls-week-next');
    if (weekPrev) weekPrev.addEventListener('click', async function() {
      C.viewWeekStart.setDate(C.viewWeekStart.getDate() - 7);
      await refresh();
    });
    if (weekNext) weekNext.addEventListener('click', async function() {
      C.viewWeekStart.setDate(C.viewWeekStart.getDate() + 7);
      await refresh();
    });

    // 이전/다음 — 월간 뷰
    var calPrev = $c('cls-cal-prev');
    var calNext = $c('cls-cal-next');
    if (calPrev) calPrev.addEventListener('click', async function() {
      C.viewMonth--; if (C.viewMonth < 0) { C.viewMonth = 11; C.viewYear--; }
      await refresh();
    });
    if (calNext) calNext.addEventListener('click', async function() {
      C.viewMonth++; if (C.viewMonth > 11) { C.viewMonth = 0; C.viewYear++; }
      await refresh();
    });

    // 필터
    var bFilter = $c('cls-building-filter');
    if (bFilter) bFilter.addEventListener('change', function() {
      C.selectedBuilding = this.value;
      updateRoomFilter();
      renderView();
    });
    var rFilter = $c('cls-room-filter');
    if (rFilter) rFilter.addEventListener('change', function() {
      C.selectedRoom = this.value;
      renderView();
    });

    // 월간 뷰 필터 (별도 셀렉트)
    var mBFilter = $c('cls-m-building-filter');
    if (mBFilter) mBFilter.addEventListener('change', function() {
      var bf = $c('cls-building-filter');
      if (bf) { bf.value = this.value; bf.dispatchEvent(new Event('change')); }
      else { C.selectedBuilding = this.value; renderView(); }
    });
    var mRFilter = $c('cls-m-room-filter');
    if (mRFilter) mRFilter.addEventListener('change', function() {
      var rf = $c('cls-room-filter');
      if (rf) { rf.value = this.value; rf.dispatchEvent(new Event('change')); }
      else { C.selectedRoom = this.value; renderView(); }
    });

    // 건물-호실 연동 (예약 모달)
    var resvBuilding = $c('cls-resv-building');
    if (resvBuilding) resvBuilding.addEventListener('change', function() {
      populateRoomSelect('cls-resv-room', this.value, '');
    });

    // 예약 모달
    var saveBtn = $c('cls-resv-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveResvModal);
    var delBtn = $c('cls-resv-delete-btn');
    if (delBtn) delBtn.addEventListener('click', async function() {
      if (!C.editResv || !confirm('예약을 취소하시겠습니까?')) return;
      await SheetsModule.deleteClassroomReservation(C.editResv._row);
      toast('예약이 취소되었습니다.','info');
      $c('cls-resv-modal').hidden = true;
      await refresh();
    });
    var closeBtn = $c('cls-resv-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', function(){ $c('cls-resv-modal').hidden = true; });

    // 새 예약 버튼 (툴바)
    var newBtn = $c('cls-add-resv-btn');
    if (newBtn) newBtn.addEventListener('click', function(){ openResvModal(null,null,null); });
    // 새 예약 버튼 (관리자 섹션)
    var addBtn = $c('cls-add-btn');
    if (addBtn) addBtn.addEventListener('click', function(){ openResvModal(null,null,null); });

    // CSV 관련
    var tmplBtn = $c('cls-csv-download-btn');
    if (tmplBtn) tmplBtn.addEventListener('click', function() {
      if (typeof ReservationUtil !== 'undefined') ReservationUtil.downloadClassroomTemplate();
    });

    var csvInput = $c('cls-csv-upload-input');
    if (csvInput) csvInput.addEventListener('change', function(){ if (this.files[0]) handleCSV(this.files[0]); });

    // 캘린더 공유 (관리자)
    var shareBtn = $c('cls-share-cal-btn');
    if (shareBtn) {
      shareBtn.style.display = isAdmin ? '' : 'none';
      shareBtn.addEventListener('click', shareToCalendar);
    }

    // 관리자 링크/섹션
    var adminLink = $c('cls-admin-link');
    if (adminLink) adminLink.style.display = isAdmin ? '' : 'none';
    var adminSec = $c('cls-admin-section');
    if (adminSec) adminSec.hidden = true;

    // 관리자 토글 버튼 (일반 탭에서는 숨김)
    var toggleBtn = $c('cls-admin-toggle-btn');
    if (toggleBtn) toggleBtn.style.display = 'none';
    if (false && toggleBtn && isAdmin) {
      toggleBtn.addEventListener('click', function() {
        if (adminSec) adminSec.hidden = !adminSec.hidden;
      });
    }

    refresh();
  }

  return {
    initClassroomModule: initClassroomModule,
    refresh: refresh,
  };

})();
