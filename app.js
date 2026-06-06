'use strict';

/**
 * app.js — 통합 라우터 + 초기화 + UI 오케스트레이션
 */
(function () {

  /* ═══════════════════════════════════════════════════════════
     앱 상태
  ═══════════════════════════════════════════════════════════ */
  var S = {
    tab:             'calendar',
    calView:         'month',
    viewDate:        new Date(),
    events:          [],         // 현재 뷰의 모든 이벤트 (다중 캘린더 합산)
    editEventId:     null,
    reportFiles:     [],         // Drive 파일 전체 목록
    selectedFiles:   [],         // Drive 다중 선택된 파일
    selReport:       null,
    userEmail:       '',
    dupTimer:        null,
    userCalendars:   [],         // CalendarModule.listCalendars() 결과
    csvRows:         [],
    extractedEvents: [],         // PDF 추출 일정
    importedRecipients: [],
    deptEditIndex:   -1,
  };

  /* ═══════════════════════════════════════════════════════════
     유틸
  ═══════════════════════════════════════════════════════════ */
  function $(id) { return document.getElementById(id); }
  function pad(n) { return String(n).padStart(2, '0'); }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth()    === b.getMonth()    &&
           a.getDate()     === b.getDate();
  }

  function toLocalDateTime(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
           'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function deptClass(description) {
    if (!description) return 'dept-기타';
    var m = /\[부서:([^\]]+)\]/.exec(description);
    if (m) return 'dept-' + m[1];
    var depts = CONFIG.departments.map(function (d) { return d.name; });
    for (var i = 0; i < depts.length; i++) {
      if (description.indexOf(depts[i]) !== -1) return 'dept-' + depts[i];
    }
    return 'dept-기타';
  }

  function getDeptColor(deptName) {
    var d = CONFIG.departments.find(function (x) { return x.name === deptName; });
    return d ? d.color : '#EA4335';
  }

  function evtStart(ev) {
    return new Date(ev.start.dateTime || ev.start.date);
  }

  function formatDate(dt) {
    var d = new Date(dt);
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ═══════════════════════════════════════════════════════════
     토스트
  ═══════════════════════════════════════════════════════════ */
  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.textContent = msg;
    $('toast-container').appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity 200ms';
      el.style.opacity = '0';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }, 3200);
  }

  /* ═══════════════════════════════════════════════════════════
     모달
  ═══════════════════════════════════════════════════════════ */
  function openModal(id)  { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }

  function initModalHandlers() {
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-close-modal]')) {
        var modal = e.target.closest('.modal');
        if (modal) modal.hidden = true;
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal:not([hidden])').forEach(function (m) {
          m.hidden = true;
        });
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     탭 라우터
  ═══════════════════════════════════════════════════════════ */
  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      var active = btn.dataset.tab === name;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-panel').forEach(function (p) {
      var active = p.id === 'tab-' + name;
      p.classList.toggle('active', active);
      p.hidden = !active;
    });
    S.tab = name;
    if (name === 'calendar')   renderCalendar();
    if (name === 'weekly-hub') syncWeeklyHubFiles();
    if (name === 'email')      renderEmailTab();
    if (name === 'settings')   renderSettingsTab();
    if (name === 'extract')    renderExtractTab();
  }

  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     인증
  ═══════════════════════════════════════════════════════════ */
  function initAuth() {
    Auth.onAuthChange(function (loggedIn) {
      $('login-overlay').hidden = loggedIn;
      $('app').hidden = !loggedIn;
      if (loggedIn) {
        loadUserEmail();
        checkScheduledEmails();
        if (S.tab === 'calendar') renderCalendar();
        if (S.tab === 'settings') renderSettingsTab();
      }
    });

    $('login-btn').addEventListener('click', function () {
      $('login-btn').disabled = true;
      Auth.login()
        .catch(function (e) { if (e && e.message) toast(e.message, 'error'); })
        .finally(function () { $('login-btn').disabled = false; });
    });

    var doLogout = function () { Auth.logout(); };
    $('logout-btn').addEventListener('click', doLogout);
    $('settings-logout-btn').addEventListener('click', doLogout);
  }

  async function loadUserEmail() {
    var token = Auth.getToken();
    if (!token) return;
    try {
      var res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      if (!res.ok) return;
      var data = await res.json();
      S.userEmail = data.email || '';
      $('user-email').textContent = S.userEmail;
      $('settings-user-email').textContent = S.userEmail || CONFIG.senderEmail;
    } catch (e) {}
  }

  /* ═══════════════════════════════════════════════════════════
     캘린더 — 다중 캘린더 로딩
  ═══════════════════════════════════════════════════════════ */
  async function loadEvents() {
    if (!Auth.isLoggedIn()) return;
    var d = S.viewDate;
    var timeMin, timeMax;

    if (S.calView === 'month') {
      timeMin = new Date(d.getFullYear(), d.getMonth(), -6).toISOString();
      timeMax = new Date(d.getFullYear(), d.getMonth() + 1, 8).toISOString();
    } else {
      var day = d.getDay();
      var sun = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
      timeMin = sun.toISOString();
      timeMax = new Date(sun.getTime() + 7 * 86400000).toISOString();
    }

    // 표시할 캘린더 결정
    var calsToLoad = [];
    var enabled = CONFIG.selectedCalendars.filter(function (c) { return c.enabled !== false; });
    if (enabled.length === 0) {
      // 선택된 캘린더 없으면 primary만
      calsToLoad.push({ id: 'primary', name: '기본 캘린더', color: '#1A73E8' });
    } else {
      calsToLoad = enabled;
    }

    var allEvents = [];
    for (var i = 0; i < calsToLoad.length; i++) {
      var cal = calsToLoad[i];
      try {
        var evts = await CalendarModule.listEvents(cal.id, timeMin, timeMax);
        evts.forEach(function (ev) {
          ev._calColor = cal.color;
          ev._calName  = cal.name;
        });
        allEvents = allEvents.concat(evts);
      } catch (e) { /* 권한 없는 캘린더 무시 */ }
    }

    // 공유 캘린더 (ICS URL → calendarId 추출)
    for (var j = 0; j < CONFIG.sharedCalendars.length; j++) {
      var sc = CONFIG.sharedCalendars[j];
      var calId = extractCalendarId(sc.url);
      if (!calId) continue;
      try {
        var sevts = await CalendarModule.listEvents(calId, timeMin, timeMax);
        sevts.forEach(function (ev) {
          ev._calColor = sc.color || '#FBBC05';
          ev._calName  = sc.name;
        });
        allEvents = allEvents.concat(sevts);
      } catch (e) {}
    }

    S.events = allEvents;
  }

  function extractCalendarId(url) {
    if (!url) return null;
    var m = /\/ical\/([^\/]+)\//.exec(url);
    if (m) return decodeURIComponent(m[1]);
    if (url.indexOf('@') !== -1 || url.indexOf('group.') !== -1) return url;
    return null;
  }

  /* ═══════════════════════════════════════════════════════════
     캘린더 — 범례 렌더링
  ═══════════════════════════════════════════════════════════ */
  function renderLegend() {
    var el = $('calendar-legend');
    el.innerHTML = '';
    var seen = {};
    S.events.forEach(function (ev) {
      if (ev._calName && !seen[ev._calName]) {
        seen[ev._calName] = true;
        var item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML =
          '<div class="legend-dot" style="background:' + ev._calColor + '"></div>' +
          '<span>' + ev._calName + '</span>';
        el.appendChild(item);
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     캘린더 — 렌더링
  ═══════════════════════════════════════════════════════════ */
  async function renderCalendar() {
    if (!Auth.isLoggedIn()) return;
    await loadEvents();
    updateCalendarTitle();
    renderLegend();
    if (S.calView === 'month') renderMonth();
    else renderWeek();
  }

  function updateCalendarTitle() {
    var d = S.viewDate;
    var title = $('calendar-title');
    if (S.calView === 'month') {
      title.textContent = d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월';
    } else {
      var day = d.getDay();
      var sun = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
      var sat = new Date(sun.getTime() + 6 * 86400000);
      if (sun.getMonth() === sat.getMonth()) {
        title.textContent = sun.getFullYear() + '년 ' + (sun.getMonth() + 1) + '월 ' +
                            sun.getDate() + '~' + sat.getDate() + '일';
      } else {
        title.textContent = (sun.getMonth() + 1) + '/' + sun.getDate() +
                            ' ~ ' + (sat.getMonth() + 1) + '/' + sat.getDate();
      }
    }
  }

  function eventsGroupedByDate(events) {
    var map = {};
    events.forEach(function (ev) {
      var dt  = evtStart(ev);
      var key = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate();
      (map[key] || (map[key] = [])).push(ev);
    });
    return map;
  }

  function renderMonth() {
    var d     = S.viewDate;
    var today = new Date();
    var grid  = $('calendar-grid');
    grid.className = 'calendar-grid';
    grid.innerHTML = '';

    var first = new Date(d.getFullYear(), d.getMonth(), 1);
    var start = new Date(first);
    start.setDate(start.getDate() - start.getDay());

    var evMap = eventsGroupedByDate(S.events);

    for (var i = 0; i < 42; i++) {
      var cell = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      grid.appendChild(buildDayCell(cell, d, today, evMap));
    }
  }

  function renderWeek() {
    var d     = S.viewDate;
    var today = new Date();
    var grid  = $('calendar-grid');
    grid.className = 'calendar-grid week-view';
    grid.innerHTML = '';

    var day   = d.getDay();
    var sun   = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    var evMap = eventsGroupedByDate(S.events);
    var NAMES = ['일', '월', '화', '수', '목', '금', '토'];

    for (var i = 0; i < 7; i++) {
      var cell = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + i);
      var el   = buildDayCell(cell, d, today, evMap);
      var numEl = el.querySelector('.day-number');
      if (numEl) numEl.textContent = NAMES[i] + ' ' + cell.getDate();
      grid.appendChild(el);
    }
  }

  function buildDayCell(cellDate, viewDate, today, evMap) {
    var el = document.createElement('div');
    el.className = 'calendar-day';
    if (cellDate.getMonth() !== viewDate.getMonth()) el.classList.add('other-month');
    if (isSameDay(cellDate, today))  el.classList.add('today');
    if (cellDate.getDay() === 0)     el.classList.add('sunday');
    if (cellDate.getDay() === 6)     el.classList.add('saturday');

    var numEl = document.createElement('div');
    numEl.className = 'day-number';
    numEl.textContent = cellDate.getDate();
    el.appendChild(numEl);

    var key = cellDate.getFullYear() + '-' + (cellDate.getMonth() + 1) + '-' + cellDate.getDate();
    var dayEvents = evMap[key] || [];
    var evWrap = document.createElement('div');
    evWrap.className = 'day-events';

    dayEvents.slice(0, 3).forEach(function (ev) {
      var chip = document.createElement('div');
      chip.className = 'event-chip ' + deptClass(ev.description);
      // 다중 캘린더 색상 우선 적용
      if (ev._calColor) {
        chip.style.borderLeftColor = ev._calColor;
        chip.style.background = ev._calColor + '22';
        chip.style.color = ev._calColor;
      }
      chip.title = ev.summary || '';
      chip.textContent = ev.summary || '(제목 없음)';
      chip.addEventListener('click', function (e) {
        e.stopPropagation();
        openEventModal(ev);
      });
      evWrap.appendChild(chip);
    });

    if (dayEvents.length > 3) {
      var more = document.createElement('div');
      more.className = 'day-more';
      more.textContent = '+' + (dayEvents.length - 3) + '개';
      evWrap.appendChild(more);
    }

    el.appendChild(evWrap);
    el.addEventListener('click', function () { openEventModal(null, cellDate); });
    return el;
  }

  /* ═══════════════════════════════════════════════════════════
     캘린더 — 네비게이션 + 필터 패널
  ═══════════════════════════════════════════════════════════ */
  function initCalendarNav() {
    $('prev-period').addEventListener('click', function () {
      var d = S.viewDate;
      S.viewDate = S.calView === 'month'
        ? new Date(d.getFullYear(), d.getMonth() - 1, 1)
        : new Date(d.getTime() - 7 * 86400000);
      renderCalendar();
    });

    $('next-period').addEventListener('click', function () {
      var d = S.viewDate;
      S.viewDate = S.calView === 'month'
        ? new Date(d.getFullYear(), d.getMonth() + 1, 1)
        : new Date(d.getTime() + 7 * 86400000);
      renderCalendar();
    });

    document.querySelectorAll('.view-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.view-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        S.calView = btn.dataset.view;
        renderCalendar();
      });
    });

    $('add-event-btn').addEventListener('click', function () {
      openEventModal(null, new Date());
    });

    $('close-duplicate-banner').addEventListener('click', function () {
      $('duplicate-banner').hidden = true;
    });

    // 캘린더 필터 패널
    $('calendar-filter-btn').addEventListener('click', function () {
      var panel = $('calendar-filter-panel');
      panel.hidden = !panel.hidden;
      if (!panel.hidden) renderFilterPanel();
    });

    $('close-filter-panel').addEventListener('click', function () {
      $('calendar-filter-panel').hidden = true;
    });

    // 헤더 캘린더 불러오기
    $('sync-calendars-btn').addEventListener('click', async function () {
      await loadAndSyncCalendars();
      toast('캘린더 목록을 불러왔습니다.', 'success');
      renderFilterPanel();
    });
  }

  async function loadAndSyncCalendars() {
    if (!Auth.isLoggedIn()) return;
    try {
      S.userCalendars = await CalendarModule.listCalendars();
      // selectedCalendars에 없는 캘린더 추가 (기본 enabled: true)
      S.userCalendars.forEach(function (cal) {
        var exists = CONFIG.selectedCalendars.find(function (c) { return c.id === cal.id; });
        if (!exists) {
          CONFIG.selectedCalendars.push({
            id:      cal.id,
            name:    cal.summary,
            color:   cal.backgroundColor || '#4285F4',
            enabled: true,
          });
        }
      });
      persistSelectedCalendars();
    } catch (e) {
      toast('캘린더 목록 로드 실패: ' + e.message, 'error');
    }
  }

  function renderFilterPanel() {
    var listEl = $('calendar-filter-list');
    listEl.innerHTML = '';
    if (CONFIG.selectedCalendars.length === 0) {
      listEl.innerHTML = '<p class="empty-state" style="padding:8px">캘린더 목록을 불러오세요.</p>';
      return;
    }
    CONFIG.selectedCalendars.forEach(function (cal, i) {
      var item = document.createElement('div');
      item.className = 'calendar-filter-item';
      item.innerHTML =
        '<input type="checkbox" id="filt-' + i + '"' + (cal.enabled !== false ? ' checked' : '') + '>' +
        '<div class="cal-color-dot" style="background:' + cal.color + '"></div>' +
        '<label for="filt-' + i + '" style="flex:1;cursor:pointer">' + cal.name + '</label>';
      var cb = item.querySelector('input');
      cb.addEventListener('change', function () {
        CONFIG.selectedCalendars[i].enabled = cb.checked;
        persistSelectedCalendars();
        renderCalendar();
      });
      listEl.appendChild(item);
    });
  }

  function persistSelectedCalendars() {
    try { localStorage.setItem(CONFIG.storageKeys.selectedCalendars, JSON.stringify(CONFIG.selectedCalendars)); } catch (e) {}
  }

  /* ═══════════════════════════════════════════════════════════
     일정 모달
  ═══════════════════════════════════════════════════════════ */
  function populateDeptSelect(selectId) {
    var sel = $(selectId);
    if (!sel) return;
    sel.innerHTML = '';
    CONFIG.departments.forEach(function (d) {
      var opt = document.createElement('option');
      opt.value = d.name;
      opt.textContent = d.name;
      sel.appendChild(opt);
    });
  }

  async function populateCalendarDropdown(selectId) {
    var sel = $(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="primary">기본 캘린더</option>';
    if (!Auth.isLoggedIn()) return;
    if (S.userCalendars.length === 0) {
      try { S.userCalendars = await CalendarModule.listCalendars(); } catch (e) { return; }
    }
    S.userCalendars.forEach(function (cal) {
      if (cal.id === 'primary') return;
      var opt = document.createElement('option');
      opt.value = cal.id;
      opt.textContent = cal.summary + (cal.primary ? ' (기본)' : '');
      sel.appendChild(opt);
    });
  }

  function openEventModal(event, date) {
    S.editEventId = null;
    $('event-modal-title').textContent = event ? '일정 수정' : '일정 추가';
    $('delete-event-btn').hidden        = !event;
    $('duplicate-alert').hidden         = true;
    $('event-id').value                 = '';
    $('event-title').value              = '';
    $('event-description').value        = '';

    populateDeptSelect('event-dept');
    $('event-dept').value = '기타';
    populateCalendarDropdown('event-calendar');

    if (event) {
      S.editEventId = event.id;
      $('event-id').value    = event.id;
      $('event-title').value = event.summary || '';
      var rawDesc = event.description || '';
      $('event-description').value = rawDesc.replace(/\n?\[부서:[^\]]+\]/g, '').trim();

      // 부서 추출
      var m = /\[부서:([^\]]+)\]/.exec(rawDesc);
      if (m) $('event-dept').value = m[1];

      var sdt = event.start.dateTime
        ? toLocalDateTime(new Date(event.start.dateTime))
        : event.start.date + 'T09:00';
      var edt = event.end.dateTime
        ? toLocalDateTime(new Date(event.end.dateTime))
        : event.end.date + 'T10:00';
      $('event-start').value = sdt;
      $('event-end').value   = edt;
    } else {
      var base   = date || new Date();
      var prefix = base.getFullYear() + '-' + pad(base.getMonth() + 1) + '-' + pad(base.getDate());
      $('event-start').value = prefix + 'T09:00';
      $('event-end').value   = prefix + 'T10:00';
    }

    openModal('event-modal');
  }

  function initEventModal() {
    $('save-event-btn').addEventListener('click', async function () {
      var title = $('event-title').value.trim();
      var start = $('event-start').value;
      var end   = $('event-end').value;
      var dept  = $('event-dept').value;
      var desc  = $('event-description').value.trim();

      if (!title)                           { toast('제목을 입력하세요.', 'error'); return; }
      if (!start || !end)                   { toast('시작·종료 시간을 입력하세요.', 'error'); return; }
      if (new Date(start) >= new Date(end)) { toast('종료는 시작 이후여야 합니다.', 'error'); return; }

      var tz        = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
      var deptColor = getDeptColor(dept);
      var fullDesc  = desc + (desc ? '\n' : '') + '[부서:' + dept + ']';
      var targetCal = $('event-calendar').value || CONFIG.calendarId;

      // colorId 결정 (부서 인덱스 기반)
      var dIdx = CONFIG.departments.findIndex(function (d) { return d.name === dept; });
      var palette = ['1','2','3','4','5','6','7','8','9','10','11'];
      var colorId = palette[dIdx >= 0 ? dIdx % palette.length : 10];

      var eventData = {
        summary:     title,
        description: fullDesc,
        start: { dateTime: new Date(start).toISOString(), timeZone: tz },
        end:   { dateTime: new Date(end).toISOString(),   timeZone: tz },
        colorId: colorId,
      };

      var btn = $('save-event-btn');
      btn.disabled = true;
      try {
        if (S.editEventId) {
          await CalendarModule.updateEvent(targetCal, S.editEventId, eventData);
          toast('일정이 수정되었습니다.', 'success');
        } else {
          await CalendarModule.createEvent(targetCal, eventData);
          toast('일정이 추가되었습니다.', 'success');
        }
        closeModal('event-modal');
        await renderCalendar();
      } catch (e) {
        toast('저장 실패: ' + e.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    $('delete-event-btn').addEventListener('click', async function () {
      if (!S.editEventId || !confirm('이 일정을 삭제하시겠습니까?')) return;
      try {
        var ok = await CalendarModule.deleteEvent(CONFIG.calendarId, S.editEventId);
        if (ok) {
          toast('일정이 삭제되었습니다.', 'success');
          closeModal('event-modal');
          await renderCalendar();
        } else {
          toast('삭제에 실패했습니다.', 'error');
        }
      } catch (e) {
        toast('삭제 실패: ' + e.message, 'error');
      }
    });

    [$('event-title'), $('event-start'), $('event-end')].forEach(function (el) {
      el.addEventListener('input', function () {
        clearTimeout(S.dupTimer);
        S.dupTimer = setTimeout(runDupCheck, 600);
      });
    });
  }

  async function runDupCheck() {
    if (!Auth.isLoggedIn()) return;
    var title = $('event-title').value.trim();
    var start = $('event-start').value;
    var end   = $('event-end').value;
    if (!title || !start || !end || new Date(start) >= new Date(end)) return;

    try {
      var result = await CalendarModule.checkDuplicate(
        CONFIG.calendarId, title,
        new Date(start).toISOString(),
        new Date(end).toISOString()
      );
      if (S.editEventId) {
        result.conflictingEvents = result.conflictingEvents.filter(function (e) {
          return e.id !== S.editEventId;
        });
        result.isDuplicate = result.conflictingEvents.length > 0;
      }
      var alertEl = $('duplicate-alert');
      if (result.isDuplicate) {
        $('duplicate-details').textContent =
          '겹치는 일정: ' + result.conflictingEvents.map(function (e) { return e.summary; }).join(', ');
        alertEl.hidden = false;
      } else {
        alertEl.hidden = true;
      }
    } catch (e) {}
  }

  /* ═══════════════════════════════════════════════════════════
     주간허브 — Drive 다중 선택
  ═══════════════════════════════════════════════════════════ */
  function syncWeeklyHubFiles() {
    renderHubFileList();
    renderEmailFileSelect();
  }

  function renderHubFileList() {
    var listEl = $('report-file-list');
    if (S.reportFiles.length === 0) {
      listEl.innerHTML = '<p class="empty-state">Drive에서 파일을 불러오세요.</p>';
      return;
    }
    listEl.innerHTML = '';
    S.reportFiles.forEach(function (f) {
      var item = document.createElement('div');
      var isSelected = S.selectedFiles.some(function (sf) { return sf.id === f.id; });
      item.className = 'report-file-item' + (isSelected ? ' selected' : '');
      var dateStr = f.createdTime ? new Date(f.createdTime).toLocaleDateString('ko-KR') : '';
      item.innerHTML =
        '<input type="checkbox"' + (isSelected ? ' checked' : '') + '>' +
        '<span class="report-file-icon">📄</span>' +
        '<span class="report-file-name" style="flex:1" title="' + f.name + '">' + f.name + '</span>' +
        '<span class="report-file-date">' + dateStr + '</span>';
      var cb = item.querySelector('input[type="checkbox"]');
      cb.addEventListener('change', function (e) {
        e.stopPropagation();
        toggleFileSelection(f, cb.checked, item);
      });
      item.addEventListener('click', function (e) {
        if (e.target === cb) return;
        cb.checked = !cb.checked;
        toggleFileSelection(f, cb.checked, item);
      });
      listEl.appendChild(item);
    });
    renderSelectedChips();
  }

  function toggleFileSelection(f, selected, itemEl) {
    if (selected) {
      if (!S.selectedFiles.some(function (sf) { return sf.id === f.id; })) {
        S.selectedFiles.push(f);
      }
      itemEl.classList.add('selected');
    } else {
      S.selectedFiles = S.selectedFiles.filter(function (sf) { return sf.id !== f.id; });
      itemEl.classList.remove('selected');
    }
    renderSelectedChips();
    // 단일 파일이면 허브 메인 표시
    if (S.selectedFiles.length === 1) selectReport(S.selectedFiles[0]);
  }

  function renderSelectedChips() {
    var chipsEl = $('selected-files-chips');
    if (S.selectedFiles.length === 0) { chipsEl.hidden = true; return; }
    chipsEl.hidden = false;
    chipsEl.innerHTML = '';
    S.selectedFiles.forEach(function (f) {
      var chip = document.createElement('div');
      chip.className = 'file-chip';
      chip.innerHTML =
        '<span>📄 ' + f.name + '</span>' +
        '<button class="file-chip-remove" title="선택 해제">✕</button>';
      chip.querySelector('.file-chip-remove').addEventListener('click', function () {
        S.selectedFiles = S.selectedFiles.filter(function (sf) { return sf.id !== f.id; });
        // 체크박스도 해제
        var items = document.querySelectorAll('.report-file-item');
        items.forEach(function (item) {
          if (item.querySelector('.report-file-name').title === f.name) {
            item.classList.remove('selected');
            var cb = item.querySelector('input[type="checkbox"]');
            if (cb) cb.checked = false;
          }
        });
        renderSelectedChips();
        if (S.selectedFiles.length === 0) $('hub-main').hidden = true;
      });
      chipsEl.appendChild(chip);
    });
  }

  function selectReport(f) {
    S.selReport = f;
    var summary   = ReportModule.buildReportSummary(f);
    var kakaoText = ReportModule.generateKakaoText(f.name, summary.driveLink);
    $('selected-report-info').textContent = '선택: ' + f.name + ' (' + summary.weekLabel + ')';
    $('kakao-text').value = kakaoText;
    $('hub-main').hidden  = false;
    $('bulk-approve-btn').disabled = true;
    $('event-candidates').innerHTML =
      '<p class="empty-state">PDF 파싱은 서버 없이 지원되지 않습니다.<br>' +
      '<a href="' + summary.driveLink + '" target="_blank" rel="noopener">Drive에서 직접 확인</a></p>';
  }

  function initWeeklyHub() {
    $('load-reports-btn').addEventListener('click', async function () {
      if (!Auth.isLoggedIn()) { toast('먼저 로그인하세요.', 'error'); return; }
      var btn = this;
      btn.disabled = true;
      btn.innerHTML = '<span class="loading-spinner"></span>';
      try {
        S.reportFiles = await DriveModule.listReportFiles();
        S.selectedFiles = [];
        renderHubFileList();
        renderEmailFileSelect();
        toast(
          S.reportFiles.length > 0 ? S.reportFiles.length + '개 파일을 불러왔습니다.' : '파일이 없습니다.',
          S.reportFiles.length > 0 ? 'success' : 'info'
        );
      } catch (e) {
        toast('파일 로드 실패: ' + e.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Drive에서 불러오기';
      }
    });

    $('copy-kakao-btn').addEventListener('click', async function () {
      var text = $('kakao-text').value;
      if (!text) return;
      var ok = await ReportModule.copyToClipboard(text);
      toast(ok ? '클립보드에 복사되었습니다.' : '복사 실패.', ok ? 'success' : 'error');
    });
  }

  /* ═══════════════════════════════════════════════════════════
     이메일 탭
  ═══════════════════════════════════════════════════════════ */
  function renderEmailTab() {
    renderRecipientsList();
    renderEmailFileSelect();
    renderEmailHistory();
  }

  function renderRecipientsList() {
    var listEl = $('recipients-list');
    if (CONFIG.recipients.length === 0) {
      listEl.innerHTML = '<p class="empty-state" style="padding:12px">수신자가 없습니다. 설정에서 추가하세요.</p>';
      return;
    }
    listEl.innerHTML = '';
    CONFIG.recipients.forEach(function (r, i) {
      var item = document.createElement('div');
      item.className = 'recipient-item';
      item.innerHTML =
        '<label class="checkbox-label">' +
          '<input type="checkbox" name="recipient" value="' + i + '" checked>' +
          '<span class="recipient-name">' + r.name + '</span>&nbsp;' +
          '<span class="recipient-email">' + r.email + '</span>' +
        '</label>';
      listEl.appendChild(item);
    });
  }

  function renderEmailFileSelect() {
    var sel  = $('email-file-select');
    var prev = sel.value;
    sel.innerHTML = '<option value="">파일을 선택하세요</option>';
    S.reportFiles.forEach(function (f) {
      var opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name;
      sel.appendChild(opt);
    });
    if (prev) sel.value = prev;
  }

  function getSelectedRecipients() {
    var result = [];
    document.querySelectorAll('#recipients-list input[type="checkbox"]:checked').forEach(function (cb) {
      var idx = parseInt(cb.value, 10);
      if (CONFIG.recipients[idx]) result.push(CONFIG.recipients[idx]);
    });
    return result;
  }

  function initEmailTab() {
    $('email-file-select').addEventListener('change', function () {
      var f = S.reportFiles.find(function (r) { return r.id === this.value; }, this);
      if (!f) return;
      var draft = GmailModule.generateDraft(f.name);
      $('email-subject').value = draft.subject;
      $('email-body').value    = draft.body;
    });

    $('select-all-recipients').addEventListener('change', function () {
      var checked = this.checked;
      document.querySelectorAll('#recipients-list input[type="checkbox"]').forEach(function (cb) {
        cb.checked = checked;
      });
    });

    // 예약 발송 토글
    document.querySelectorAll('input[name="send-timing"]').forEach(function (r) {
      r.addEventListener('change', function () {
        $('schedule-datetime').style.display = this.value === 'schedule' ? '' : 'none';
        $('send-email-btn').textContent = this.value === 'schedule' ? '예약 등록' : '지금 발송';
      });
    });

    // 이메일 서브탭
    document.querySelectorAll('.email-subtab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.email-subtab').forEach(function (b) { b.classList.remove('active'); });
        document.querySelectorAll('.email-subpanel').forEach(function (p) { p.hidden = true; });
        btn.classList.add('active');
        $('etab-' + btn.dataset.etab).hidden = false;
        if (btn.dataset.etab === 'history') renderEmailHistory();
      });
    });

    $('preview-email-btn').addEventListener('click', function () {
      var recipients = getSelectedRecipients();
      if (!recipients.length) { toast('수신자를 선택하세요.', 'error'); return; }
      var subject = $('email-subject').value.trim();
      var body    = $('email-body').value.trim();
      if (!subject || !body) { toast('제목과 본문을 입력하세요.', 'error'); return; }
      $('email-preview-meta').innerHTML =
        '<p><strong>받는이:</strong> ' +
          recipients.map(function (r) { return r.name + ' &lt;' + r.email + '&gt;'; }).join(', ') +
        '</p><p><strong>제목:</strong> ' + subject + '</p>';
      $('email-preview-content').textContent = body;
      openModal('email-preview-modal');
    });

    $('confirm-send-btn').addEventListener('click', function () {
      closeModal('email-preview-modal');
      doSendEmail();
    });

    $('send-email-btn').addEventListener('click', function () {
      var recipients = getSelectedRecipients();
      if (!recipients.length) { toast('수신자를 선택하세요.', 'error'); return; }
      if (!$('email-subject').value.trim() || !$('email-body').value.trim()) {
        toast('제목과 본문을 입력하세요.', 'error'); return;
      }
      doSendEmail();
    });

    $('import-recipients-btn').addEventListener('click', function () {
      openModal('import-recipients-modal');
    });

    $('clear-history-btn').addEventListener('click', function () {
      if (!confirm('발송 이력을 모두 삭제하시겠습니까?')) return;
      CONFIG.emailHistory = [];
      CONFIG.scheduledEmails = [];
      persistEmailHistory();
      renderEmailHistory();
    });

    initImportRecipients();
  }

  async function doSendEmail() {
    var recipients = getSelectedRecipients();
    if (!recipients.length) { toast('수신자를 선택하세요.', 'error'); return; }

    var subject   = $('email-subject').value.trim();
    var body      = $('email-body').value.trim();
    var fileId    = $('email-file-select').value;
    var file      = fileId ? S.reportFiles.find(function (r) { return r.id === fileId; }) : null;
    var timing    = document.querySelector('input[name="send-timing"]:checked');
    var isSchedule = timing && timing.value === 'schedule';

    if (isSchedule) {
      var schedDt = $('schedule-datetime').value;
      if (!schedDt) { toast('예약 일시를 선택하세요.', 'error'); return; }
      var schedEntry = {
        id:          genId(),
        to:          recipients,
        subject:     subject,
        body:        body,
        driveFileId: fileId,
        scheduledAt: new Date(schedDt).toISOString(),
        status:      'scheduled',
      };
      CONFIG.scheduledEmails.push(schedEntry);
      persistEmailHistory();
      toast('예약 등록되었습니다: ' + formatDate(schedDt), 'success');
      renderEmailHistory();
      return;
    }

    var driveLink = '';
    if (file) {
      try { driveLink = await DriveModule.getShareLink(file.id); } catch (e) { driveLink = file.webViewLink || ''; }
    }

    var btn = $('send-email-btn');
    btn.disabled    = true;
    btn.textContent = '발송 중...';
    try {
      var result = await GmailModule.sendEmail({ to: recipients, subject: subject, body: body, driveLink: driveLink });
      if (result.success) {
        var histEntry = {
          id:       genId(),
          to:       recipients.map(function (r) { return r.name + ' <' + r.email + '>'; }).join(', '),
          subject:  subject,
          sentAt:   new Date().toISOString(),
          status:   'sent',
        };
        CONFIG.emailHistory.unshift(histEntry);
        persistEmailHistory();
        toast('이메일이 발송되었습니다.', 'success');
        closeModal('email-preview-modal');
        renderEmailHistory();
      }
    } catch (e) {
      var failEntry = {
        id:      genId(),
        to:      recipients.map(function (r) { return r.email; }).join(', '),
        subject: subject,
        sentAt:  new Date().toISOString(),
        status:  'failed',
      };
      CONFIG.emailHistory.unshift(failEntry);
      persistEmailHistory();
      toast('발송 실패: ' + e.message, 'error');
    } finally {
      btn.disabled    = false;
      btn.textContent = '지금 발송';
    }
  }

  function renderEmailHistory() {
    var listEl = $('email-history-list');
    var all = CONFIG.scheduledEmails.concat(CONFIG.emailHistory);
    all.sort(function (a, b) {
      var dateA = a.sentAt || a.scheduledAt || '';
      var dateB = b.sentAt || b.scheduledAt || '';
      return dateB.localeCompare(dateA);
    });
    if (all.length === 0) {
      listEl.innerHTML = '<p class="empty-state">발송 이력이 없습니다.</p>';
      return;
    }
    listEl.innerHTML = '';
    all.forEach(function (h) {
      var item = document.createElement('div');
      item.className = 'history-item';
      var badge = h.status === 'sent'      ? '<span class="history-badge badge-sent">발송완료</span>' :
                  h.status === 'scheduled' ? '<span class="history-badge badge-scheduled">예약중</span>' :
                                             '<span class="history-badge badge-failed">실패</span>';
      var dateLabel = h.sentAt ? '발송: ' + formatDate(h.sentAt) :
                     h.scheduledAt ? '예약: ' + formatDate(h.scheduledAt) : '';
      item.innerHTML =
        '<div class="history-item-header">' +
          '<span class="history-item-subject">' + (h.subject || '(제목없음)') + '</span>' +
          badge +
        '</div>' +
        '<div class="history-item-meta">' +
          '<span>받는이: ' + (h.to || '') + '</span>' +
          '<span>' + dateLabel + '</span>' +
        '</div>';
      // 예약 취소 버튼
      if (h.status === 'scheduled') {
        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-ghost btn-sm';
        cancelBtn.style.marginTop = '8px';
        cancelBtn.textContent = '예약 취소';
        cancelBtn.addEventListener('click', function () {
          CONFIG.scheduledEmails = CONFIG.scheduledEmails.filter(function (s) { return s.id !== h.id; });
          persistEmailHistory();
          renderEmailHistory();
          toast('예약이 취소되었습니다.', 'info');
        });
        item.appendChild(cancelBtn);
      }
      listEl.appendChild(item);
    });
  }

  function persistEmailHistory() {
    try {
      localStorage.setItem(CONFIG.storageKeys.emailHistory,   JSON.stringify(CONFIG.emailHistory));
      localStorage.setItem(CONFIG.storageKeys.scheduledEmails, JSON.stringify(CONFIG.scheduledEmails));
    } catch (e) {}
  }

  // 앱 시작 시 예약 이메일 확인 + 자동 발송
  async function checkScheduledEmails() {
    var now = new Date();
    var due = CONFIG.scheduledEmails.filter(function (s) {
      return s.status === 'scheduled' && new Date(s.scheduledAt) <= now;
    });
    for (var i = 0; i < due.length; i++) {
      var s = due[i];
      s.status = 'sending';
      var driveLink = '';
      try {
        var result = await GmailModule.sendEmail({
          to:        s.to,
          subject:   s.subject,
          body:      s.body,
          driveLink: driveLink,
        });
        if (result.success) {
          s.status = 'sent';
          s.sentAt = new Date().toISOString();
          CONFIG.emailHistory.unshift({
            id:      s.id,
            to:      s.to.map(function (r) { return r.name + ' <' + r.email + '>'; }).join(', '),
            subject: s.subject,
            sentAt:  s.sentAt,
            status:  'sent',
          });
          CONFIG.scheduledEmails = CONFIG.scheduledEmails.filter(function (x) { return x.id !== s.id; });
          toast('예약 이메일 자동 발송: ' + s.subject, 'success');
        }
      } catch (e) {
        s.status = 'failed';
      }
    }
    if (due.length > 0) persistEmailHistory();
  }

  /* ═══════════════════════════════════════════════════════════
     수신자 파일 일괄 등록
  ═══════════════════════════════════════════════════════════ */
  function initImportRecipients() {
    var dropzone  = $('recipients-dropzone');
    var fileInput = $('recipients-file-input');

    dropzone.addEventListener('click', function () { fileInput.click(); });
    dropzone.addEventListener('dragover', function (e) {
      e.preventDefault(); dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('drag-over'); });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault(); dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) readRecipientsFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', function () {
      if (this.files[0]) readRecipientsFile(this.files[0]);
    });

    $('confirm-import-recipients-btn').addEventListener('click', function () {
      var valid = S.importedRecipients.filter(function (r) { return r.valid; });
      valid.forEach(function (r) {
        if (!CONFIG.recipients.find(function (x) { return x.email === r.email; })) {
          CONFIG.recipients.push({ name: r.name, email: r.email });
        }
      });
      persistRecipients();
      renderSettingsRecipients();
      renderRecipientsList();
      closeModal('import-recipients-modal');
      toast(valid.length + '명이 추가되었습니다.', 'success');
    });
  }

  function readRecipientsFile(file) {
    var ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      var fr = new FileReader();
      fr.onload = function (e) {
        try {
          var wb = XLSX.read(e.target.result, { type: 'array' });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
          parseRecipientRows(rows);
        } catch (err) { toast('엑셀 파일 파싱 오류: ' + err.message, 'error'); }
      };
      fr.readAsArrayBuffer(file);
    } else {
      var fr2 = new FileReader();
      fr2.onload = function (e) {
        var lines = e.target.result.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        var rows = lines.map(function (l) { return l.split(','); });
        parseRecipientRows(rows);
      };
      fr2.readAsText(file, 'utf-8');
    }
  }

  function parseRecipientRows(rows) {
    S.importedRecipients = [];
    rows.forEach(function (row, i) {
      if (!row || !row.length) return;
      var name  = String(row[0] || '').trim();
      var email = String(row[1] || '').trim();
      if (!name && !email) return;
      // 헤더 행 스킵
      if (i === 0 && (name === '이름' || name === 'name' || name === 'Name')) return;
      var valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      S.importedRecipients.push({ name: name || email, email: email, valid: valid });
    });
    renderImportRecipientsPreview();
  }

  function renderImportRecipientsPreview() {
    var tbody = $('recipients-import-body');
    var countEl = $('recipients-import-count');
    var submitBtn = $('confirm-import-recipients-btn');
    tbody.innerHTML = '';
    var validCount = 0;
    S.importedRecipients.forEach(function (r, i) {
      if (r.valid) validCount++;
      var tr = document.createElement('tr');
      tr.className = r.valid ? 'csv-row-valid' : 'csv-row-invalid';
      tr.innerHTML =
        '<td>' + (i + 1) + '</td><td>' + r.name + '</td><td>' + r.email + '</td>' +
        '<td>' + (r.valid ? '✅' : '❌ 이메일 오류') + '</td>';
      tbody.appendChild(tr);
    });
    countEl.textContent = '총 ' + S.importedRecipients.length + '행 / 유효 ' + validCount + '명';
    $('recipients-import-preview').hidden = false;
    submitBtn.disabled = validCount === 0;
    submitBtn.textContent = '등록 (' + validCount + '명)';
  }

  /* ═══════════════════════════════════════════════════════════
     CSV 일괄 등록
  ═══════════════════════════════════════════════════════════ */
  function initCsvModal() {
    $('csv-import-btn').addEventListener('click', function () {
      S.csvRows = [];
      $('csv-preview-area').hidden = true;
      $('csv-import-submit-btn').disabled = true;
      $('csv-file-input').value = '';
      populateCalendarDropdown('csv-calendar-select');
      openModal('csv-modal');
    });

    var dropzone  = $('csv-dropzone');
    var fileInput = $('csv-file-input');

    dropzone.addEventListener('click', function () { fileInput.click(); });
    dropzone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') fileInput.click();
    });
    dropzone.addEventListener('dragover', function (e) {
      e.preventDefault(); dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('drag-over'); });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault(); dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) readCsvFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', function () {
      if (this.files[0]) readCsvFile(this.files[0]);
    });

    $('csv-import-submit-btn').addEventListener('click', async function () {
      var calId = $('csv-calendar-select').value || CONFIG.calendarId;
      var valid = S.csvRows.filter(function (r) { return r.valid; });
      if (!valid.length) { toast('유효한 행이 없습니다.', 'error'); return; }

      var btn = this;
      btn.disabled = true;
      btn.textContent = '등록 중...';

      var ok = 0, fail = 0;
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
      for (var i = 0; i < valid.length; i++) {
        var r = valid[i];
        var dept = r.부서 || '기타';
        var dIdx = CONFIG.departments.findIndex(function (d) { return d.name === dept; });
        var palette = ['1','2','3','4','5','6','7','8','9','10','11'];
        var colorId = palette[dIdx >= 0 ? dIdx % palette.length : 10];
        var desc = (r.설명 || '') + (r.설명 ? '\n' : '') + '[부서:' + dept + ']';
        try {
          await CalendarModule.createEvent(calId, {
            summary:     r.제목,
            description: desc,
            start: { dateTime: new Date(r.시작일시).toISOString(), timeZone: tz },
            end:   { dateTime: new Date(r.종료일시).toISOString(), timeZone: tz },
            colorId: colorId,
          });
          ok++;
        } catch (e) { fail++; }
      }

      btn.disabled = false;
      btn.textContent = '전체 등록';
      closeModal('csv-modal');
      toast('등록 완료: ' + ok + '건 성공' + (fail ? ', ' + fail + '건 실패' : ''), ok ? 'success' : 'error');
      if (ok > 0) renderCalendar();
    });
  }

  function readCsvFile(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      S.csvRows = parseCsv(e.target.result);
      renderCsvPreview();
    };
    reader.readAsText(file, 'utf-8');
  }

  function parseCsv(text) {
    var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (lines.length < 2) return [];
    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var cols = splitCsvLine(line);
      var row = {
        제목:   (cols[0] || '').trim(),
        시작일시: (cols[1] || '').trim(),
        종료일시: (cols[2] || '').trim(),
        부서:   (cols[3] || '').trim() || '기타',
        설명:   (cols[4] || '').trim(),
        valid:  false, error: '',
      };
      row.valid = validateCsvRow(row);
      rows.push(row);
    }
    return rows;
  }

  function splitCsvLine(line) {
    var result = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
      else { cur += c; }
    }
    result.push(cur);
    return result;
  }

  function validateCsvRow(row) {
    if (!row.제목) { row.error = '제목 없음'; return false; }
    if (!row.시작일시 || isNaN(Date.parse(row.시작일시.replace(' ', 'T')))) {
      row.error = '시작일시 오류'; return false;
    }
    if (!row.종료일시 || isNaN(Date.parse(row.종료일시.replace(' ', 'T')))) {
      row.error = '종료일시 오류'; return false;
    }
    row.시작일시 = row.시작일시.replace(' ', 'T');
    row.종료일시 = row.종료일시.replace(' ', 'T');
    if (new Date(row.시작일시) >= new Date(row.종료일시)) {
      row.error = '종료가 시작보다 이전'; return false;
    }
    return true;
  }

  function renderCsvPreview() {
    var tbody    = $('csv-table-body');
    var countEl  = $('csv-preview-count');
    var submitBtn = $('csv-import-submit-btn');
    tbody.innerHTML = '';
    var validCount = 0;
    S.csvRows.forEach(function (r, i) {
      if (r.valid) validCount++;
      var tr = document.createElement('tr');
      tr.className = r.valid ? 'csv-row-valid' : 'csv-row-invalid';
      tr.innerHTML =
        '<td>' + (i + 1) + '</td><td>' + r.제목 + '</td><td>' + r.시작일시 + '</td>' +
        '<td>' + r.종료일시 + '</td><td>' + r.부서 + '</td><td>' + r.설명 + '</td>' +
        '<td>' + (r.valid ? '✅' : '❌ ' + r.error) + '</td>';
      tbody.appendChild(tr);
    });
    countEl.textContent = '총 ' + S.csvRows.length + '행 중 유효 ' + validCount + '행';
    $('csv-preview-area').hidden = false;
    submitBtn.disabled = validCount === 0;
    submitBtn.textContent = '전체 등록 (' + validCount + '건)';
  }

  /* ═══════════════════════════════════════════════════════════
     일정발췌 탭 (PDF + Claude API)
  ═══════════════════════════════════════════════════════════ */
  function renderExtractTab() {
    var apiKey = CONFIG.anthropicApiKey;
    if (apiKey) $('extract-api-key').value = apiKey;
    populateCalendarDropdown('extract-target-calendar');
  }

  function initExtractTab() {
    var pdfDropzone = $('pdf-dropzone');
    var pdfInput    = $('pdf-file-input');

    pdfDropzone.addEventListener('click', function () { pdfInput.click(); });
    pdfDropzone.addEventListener('dragover', function (e) {
      e.preventDefault(); pdfDropzone.classList.add('drag-over');
    });
    pdfDropzone.addEventListener('dragleave', function () { pdfDropzone.classList.remove('drag-over'); });
    pdfDropzone.addEventListener('drop', function (e) {
      e.preventDefault(); pdfDropzone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) setPdfFile(e.dataTransfer.files[0]);
    });
    pdfInput.addEventListener('change', function () {
      if (this.files[0]) setPdfFile(this.files[0]);
    });

    $('run-extract-btn').addEventListener('click', runExtract);

    $('extract-select-all').addEventListener('click', function () {
      document.querySelectorAll('.extract-event-check input').forEach(function (cb) { cb.checked = true; });
      document.querySelectorAll('.extract-event-card').forEach(function (c) { c.classList.add('selected'); });
    });

    $('extract-deselect-all').addEventListener('click', function () {
      document.querySelectorAll('.extract-event-check input').forEach(function (cb) { cb.checked = false; });
      document.querySelectorAll('.extract-event-card').forEach(function (c) { c.classList.remove('selected'); });
    });

    $('extract-add-selected').addEventListener('click', addExtractedToCalendar);
  }

  var S_pdfFile = null;

  function setPdfFile(file) {
    S_pdfFile = file;
    var info = $('pdf-file-info');
    info.hidden = false;
    info.textContent = '📄 ' + file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
    $('run-extract-btn').disabled = false;
  }

  async function runExtract() {
    var apiKey = $('extract-api-key').value.trim() || CONFIG.anthropicApiKey;
    if (!apiKey) { toast('Claude API 키를 입력하세요.', 'error'); return; }
    if (!S_pdfFile) { toast('PDF 파일을 먼저 선택하세요.', 'error'); return; }

    // API 키 저장
    CONFIG.anthropicApiKey = apiKey;
    try { localStorage.setItem(CONFIG.storageKeys.anthropicApiKey, apiKey); } catch (e) {}

    var btn = $('run-extract-btn');
    btn.disabled = true;
    btn.textContent = '🤖 AI 분석 중...';

    try {
      // PDF를 base64로 변환
      var base64 = await fileToBase64(S_pdfFile);
      var mediaType = 'application/pdf';

      // Claude API 호출
      var prompt = '이 PDF 문서에서 모든 일정(행사, 회의, 업무 등)을 추출해 주세요.\n\n' +
        '각 일정에 대해 다음 JSON 배열 형식으로 반환해 주세요:\n' +
        '[\n' +
        '  {\n' +
        '    "title": "[부서명] 행사/업무 내용",\n' +
        '    "department": "부서명",\n' +
        '    "startDateTime": "YYYY-MM-DDTHH:mm:00",\n' +
        '    "endDateTime": "YYYY-MM-DDTHH:mm:00",\n' +
        '    "description": "세부사항"\n' +
        '  }\n' +
        ']\n\n' +
        '날짜가 불명확한 경우 최대한 추론하세요. 반드시 JSON 배열만 반환하고 다른 텍스트는 포함하지 마세요.';

      var response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-8',
          max_tokens: 4096,
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: prompt },
            ],
          }],
        }),
      });

      if (!response.ok) {
        var errData = await response.json();
        throw new Error((errData.error && errData.error.message) || 'API 오류 ' + response.status);
      }

      var data = await response.json();
      var text = data.content && data.content[0] && data.content[0].text;
      if (!text) throw new Error('AI 응답이 비어 있습니다.');

      // JSON 파싱
      var jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('일정 데이터를 파싱할 수 없습니다.');
      S.extractedEvents = JSON.parse(jsonMatch[0]);

      renderExtractedEvents();
      toast(S.extractedEvents.length + '개 일정이 추출되었습니다.', 'success');
    } catch (e) {
      toast('추출 실패: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🤖 AI로 일정 추출';
    }
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var base64 = e.target.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function renderExtractedEvents() {
    var area    = $('extract-result-area');
    var listEl  = $('extract-events-list');
    var countEl = $('extract-result-count');

    area.hidden = false;

    // 기존 캘린더 이벤트와 충돌 확인
    if (S.events.length === 0) await loadEvents();

    var newCount = 0, conflictCount = 0;
    listEl.innerHTML = '';

    S.extractedEvents.forEach(function (ev, i) {
      // 충돌 확인 (시간 겹침)
      var evStart = new Date(ev.startDateTime);
      var evEnd   = new Date(ev.endDateTime);
      var isConflict = S.events.some(function (existing) {
        var exStart = evtStart(existing);
        var exEnd   = existing.end && (existing.end.dateTime || existing.end.date)
          ? new Date(existing.end.dateTime || existing.end.date) : null;
        if (!exEnd) return false;
        return evStart < exEnd && evEnd > exStart;
      });

      if (isConflict) conflictCount++; else newCount++;

      var card = document.createElement('div');
      card.className = 'extract-event-card ' + (isConflict ? 'is-conflict' : 'is-new');
      card.dataset.index = i;

      var deptColor = getDeptColor(ev.department || '기타');
      var badge = isConflict
        ? '<span class="extract-event-badge badge-conflict">⚠ 충돌</span>'
        : '<span class="extract-event-badge badge-new">신규</span>';

      card.innerHTML =
        '<div class="extract-event-check">' +
          '<input type="checkbox" id="ev-check-' + i + '" checked>' +
        '</div>' +
        '<div class="extract-event-info">' +
          '<div class="extract-event-title">' +
            '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + deptColor + ';margin-right:6px;vertical-align:middle"></span>' +
            ev.title + badge +
          '</div>' +
          '<div class="extract-event-meta">' +
            '📅 ' + formatDate(ev.startDateTime) + ' ~ ' + formatDate(ev.endDateTime) + '<br>' +
            '🏢 ' + (ev.department || '기타') +
            (ev.description ? '<br>📝 ' + ev.description : '') +
          '</div>' +
        '</div>';

      var cb = card.querySelector('input[type="checkbox"]');
      cb.addEventListener('change', function () {
        card.classList.toggle('selected', cb.checked);
      });
      card.classList.toggle('selected', true);

      listEl.appendChild(card);
    });

    countEl.textContent = '총 ' + S.extractedEvents.length + '개 (신규 ' + newCount + '개 / 충돌 ' + conflictCount + '개)';
  }

  async function addExtractedToCalendar() {
    var calId = $('extract-target-calendar').value || CONFIG.calendarId;
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
    var selected = [];
    document.querySelectorAll('.extract-event-check input:checked').forEach(function (cb) {
      var idx = parseInt(cb.closest('.extract-event-card').dataset.index, 10);
      if (!isNaN(idx) && S.extractedEvents[idx]) selected.push(S.extractedEvents[idx]);
    });

    if (!selected.length) { toast('선택된 일정이 없습니다.', 'error'); return; }

    var btn = $('extract-add-selected');
    btn.disabled = true;
    btn.textContent = '등록 중...';

    var ok = 0, fail = 0;
    for (var i = 0; i < selected.length; i++) {
      var ev = selected[i];
      var dept = ev.department || '기타';
      var dIdx = CONFIG.departments.findIndex(function (d) { return d.name === dept; });
      var palette = ['1','2','3','4','5','6','7','8','9','10','11'];
      var colorId = palette[dIdx >= 0 ? dIdx % palette.length : 10];
      try {
        await CalendarModule.createEvent(calId, {
          summary:     ev.title,
          description: (ev.description || '') + '\n[부서:' + dept + ']',
          start: { dateTime: new Date(ev.startDateTime).toISOString(), timeZone: tz },
          end:   { dateTime: new Date(ev.endDateTime).toISOString(),   timeZone: tz },
          colorId: colorId,
        });
        ok++;
      } catch (e) { fail++; }
    }

    btn.disabled = false;
    btn.textContent = '선택 항목 등록';
    toast('등록 완료: ' + ok + '건 성공' + (fail ? ', ' + fail + '건 실패' : ''), ok ? 'success' : 'error');
    if (ok > 0 && S.tab === 'calendar') renderCalendar();
  }

  /* ═══════════════════════════════════════════════════════════
     설정 탭
  ═══════════════════════════════════════════════════════════ */
  function renderSettingsTab() {
    $('settings-user-email').textContent = S.userEmail || CONFIG.senderEmail;
    $('setting-folder-id').value = CONFIG.driveReportFolderId !== 'YOUR_FOLDER_ID'
      ? CONFIG.driveReportFolderId : '';
    var storedKey = CONFIG.anthropicApiKey;
    if (storedKey) $('setting-api-key').value = storedKey;
    renderSettingsRecipients();
    renderDeptList();
    renderMyCalendarsList();
    renderSharedCalendars();
  }

  /* ── 내 캘린더 표시 설정 ─── */
  function renderMyCalendarsList() {
    var el = $('my-calendars-list');
    if (CONFIG.selectedCalendars.length === 0) {
      el.innerHTML = '<p class="empty-state" style="padding:8px">캘린더 목록을 불러오세요.</p>';
      return;
    }
    el.innerHTML = '';
    CONFIG.selectedCalendars.forEach(function (cal, i) {
      var item = document.createElement('div');
      item.className = 'my-cal-item';
      item.innerHTML =
        '<label>' +
          '<input type="checkbox"' + (cal.enabled !== false ? ' checked' : '') + '>' +
          '<span>' + cal.name + '</span>' +
        '</label>' +
        '<input type="color" class="my-cal-color-input" value="' + (cal.color || '#4285F4') + '" title="색상 변경">';
      var cb    = item.querySelector('input[type="checkbox"]');
      var color = item.querySelector('input[type="color"]');
      cb.addEventListener('change', function () {
        CONFIG.selectedCalendars[i].enabled = cb.checked;
        persistSelectedCalendars();
      });
      color.addEventListener('change', function () {
        CONFIG.selectedCalendars[i].color = color.value;
        persistSelectedCalendars();
      });
      el.appendChild(item);
    });
  }

  /* ── 부서 관리 ─── */
  function renderDeptList() {
    var el = $('dept-list');
    el.innerHTML = '';
    CONFIG.departments.forEach(function (dept, i) {
      var item = document.createElement('div');
      item.className = 'dept-item';
      item.innerHTML =
        '<div class="dept-item-color" style="background:' + dept.color + '"></div>' +
        '<span class="dept-item-name">' + dept.name + '</span>' +
        '<div class="dept-item-actions">' +
          '<button class="btn btn-ghost btn-sm" data-edit-dept="' + i + '">수정</button>' +
          '<button class="btn btn-ghost btn-sm" data-del-dept="' + i + '">삭제</button>' +
        '</div>';
      el.appendChild(item);
    });
    el.querySelectorAll('[data-edit-dept]').forEach(function (btn) {
      btn.addEventListener('click', function () { openDeptModal(parseInt(btn.dataset.editDept, 10)); });
    });
    el.querySelectorAll('[data-del-dept]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.delDept, 10);
        if (!confirm('부서를 삭제하시겠습니까?')) return;
        CONFIG.departments.splice(idx, 1);
        persistDepartments();
        renderDeptList();
        toast('삭제되었습니다.', 'info');
      });
    });
  }

  function openDeptModal(index) {
    S.deptEditIndex = index;
    $('dept-modal-title').textContent = index >= 0 ? '부서 수정' : '부서 추가';
    $('dept-edit-index').value = index;
    if (index >= 0) {
      var dept = CONFIG.departments[index];
      $('dept-name-input').value  = dept.name;
      $('dept-color-input').value = dept.color;
      $('dept-color-preview').textContent = dept.color;
    } else {
      $('dept-name-input').value  = '';
      $('dept-color-input').value = '#4285F4';
      $('dept-color-preview').textContent = '#4285F4';
    }
    openModal('dept-modal');
  }

  function initDeptModal() {
    $('add-dept-btn').addEventListener('click', function () { openDeptModal(-1); });

    $('dept-color-input').addEventListener('input', function () {
      $('dept-color-preview').textContent = this.value;
    });

    document.querySelectorAll('.color-preset').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var c = btn.dataset.color;
        $('dept-color-input').value = c;
        $('dept-color-preview').textContent = c;
        document.querySelectorAll('.color-preset').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
      });
    });

    $('save-dept-btn').addEventListener('click', function () {
      var name  = $('dept-name-input').value.trim();
      var color = $('dept-color-input').value;
      if (!name) { toast('부서명을 입력하세요.', 'error'); return; }

      var idx = parseInt($('dept-edit-index').value, 10);
      if (idx >= 0) {
        CONFIG.departments[idx] = { name: name, color: color };
      } else {
        CONFIG.departments.push({ name: name, color: color });
      }
      persistDepartments();
      renderDeptList();
      closeModal('dept-modal');
      toast('저장되었습니다.', 'success');
    });
  }

  function persistDepartments() {
    try { localStorage.setItem(CONFIG.storageKeys.departments, JSON.stringify(CONFIG.departments)); } catch (e) {}
  }

  /* ── 공유 캘린더 ─── */
  function renderSharedCalendars() {
    var el = $('shared-calendars-list');
    if (!el) return;
    if (CONFIG.sharedCalendars.length === 0) {
      el.innerHTML = '<p class="empty-state" style="padding:8px">등록된 공유 캘린더가 없습니다.</p>';
      return;
    }
    el.innerHTML = '';
    CONFIG.sharedCalendars.forEach(function (sc, i) {
      var item = document.createElement('div');
      item.className = 'shared-cal-item';
      var shortUrl = sc.url && sc.url.length > 60 ? sc.url.substring(0, 57) + '...' : (sc.url || '');
      item.innerHTML =
        '<div class="shared-cal-info">' +
          '<span class="shared-cal-name">' + sc.name + '</span>' +
          '<span class="shared-cal-url">' + shortUrl + '</span>' +
        '</div>' +
        '<button class="btn btn-ghost btn-sm" data-del-sc="' + i + '">삭제</button>';
      el.appendChild(item);
    });
    el.querySelectorAll('[data-del-sc]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        CONFIG.sharedCalendars.splice(parseInt(btn.dataset.delSc, 10), 1);
        persistSharedCalendars();
        renderSharedCalendars();
        toast('삭제되었습니다.', 'info');
      });
    });
  }

  function persistSharedCalendars() {
    try { localStorage.setItem(CONFIG.storageKeys.sharedCalendars, JSON.stringify(CONFIG.sharedCalendars)); } catch (e) {}
  }

  /* ── 수신자 ─── */
  function renderSettingsRecipients() {
    var el = $('settings-recipients');
    el.innerHTML = '';
    if (CONFIG.recipients.length === 0) {
      el.innerHTML = '<p class="empty-state" style="padding:8px">수신자가 없습니다.</p>';
      return;
    }
    CONFIG.recipients.forEach(function (r, i) {
      var item = document.createElement('div');
      item.className = 'settings-recipient-item';
      item.innerHTML =
        '<div class="settings-recipient-info">' +
          '<span class="recipient-name">' + r.name + '</span>' +
          '<span class="recipient-email">' + r.email + '</span>' +
        '</div>' +
        '<button class="btn btn-ghost btn-sm" data-del="' + i + '">삭제</button>';
      el.appendChild(item);
    });
    el.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.del, 10);
        CONFIG.recipients.splice(idx, 1);
        persistRecipients();
        renderSettingsRecipients();
        renderRecipientsList();
      });
    });
  }

  function persistRecipients() {
    try { localStorage.setItem(CONFIG.storageKeys.recipients, JSON.stringify(CONFIG.recipients)); } catch (e) {}
  }

  function initSettings() {
    $('save-folder-btn').addEventListener('click', function () {
      var val = $('setting-folder-id').value.trim();
      if (!val) { toast('폴더 ID를 입력하세요.', 'error'); return; }
      CONFIG.driveReportFolderId = val;
      try { localStorage.setItem(CONFIG.storageKeys.driveFolderId, val); } catch (e) {}
      toast('저장되었습니다.', 'success');
    });

    $('save-api-key-btn').addEventListener('click', function () {
      var key = $('setting-api-key').value.trim();
      if (!key) { toast('API 키를 입력하세요.', 'error'); return; }
      CONFIG.anthropicApiKey = key;
      try { localStorage.setItem(CONFIG.storageKeys.anthropicApiKey, key); } catch (e) {}
      toast('API 키가 저장되었습니다.', 'success');
    });

    $('load-my-calendars-btn').addEventListener('click', async function () {
      await loadAndSyncCalendars();
      renderMyCalendarsList();
      toast('캘린더 목록을 불러왔습니다.', 'success');
    });

    $('add-recipient-btn').addEventListener('click', function () {
      var name  = $('new-recipient-name').value.trim();
      var email = $('new-recipient-email').value.trim();
      if (!name || !email) { toast('이름과 이메일을 입력하세요.', 'error'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('유효한 이메일 주소를 입력하세요.', 'error'); return; }
      CONFIG.recipients.push({ name: name, email: email });
      persistRecipients();
      $('new-recipient-name').value  = '';
      $('new-recipient-email').value = '';
      renderSettingsRecipients();
      renderRecipientsList();
      toast(name + '이(가) 추가되었습니다.', 'success');
    });

    [$('new-recipient-name'), $('new-recipient-email')].forEach(function (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') $('add-recipient-btn').click();
      });
    });

    $('add-shared-cal-btn').addEventListener('click', function () {
      $('shared-cal-name').value = '';
      $('shared-cal-url').value  = '';
      openModal('add-shared-cal-modal');
    });

    $('save-shared-cal-btn').addEventListener('click', function () {
      var name = $('shared-cal-name').value.trim();
      var url  = $('shared-cal-url').value.trim();
      if (!name) { toast('캘린더 이름을 입력하세요.', 'error'); return; }
      if (!url)  { toast('공유 URL을 입력하세요.', 'error'); return; }
      CONFIG.sharedCalendars.push({ name: name, url: url, color: '#FBBC05' });
      persistSharedCalendars();
      renderSharedCalendars();
      closeModal('add-shared-cal-modal');
      toast(name + ' 캘린더가 등록되었습니다.', 'success');
    });
  }

  /* ═══════════════════════════════════════════════════════════
     부트스트랩
  ═══════════════════════════════════════════════════════════ */
  function init() {
    initAuth();
    initTabs();
    initCalendarNav();
    initEventModal();
    initWeeklyHub();
    initEmailTab();
    initCsvModal();
    initExtractTab();
    initDeptModal();
    initSettings();
    initModalHandlers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
