'use strict';

/**
 * app.js — 통합 라우터 + 초기화 + UI 오케스트레이션
 * 모든 모듈(Auth, CalendarModule, DriveModule, GmailModule, ReportModule)을 연결한다.
 */
(function () {

  /* ═══════════════════════════════════════════════════════════
     앱 상태
  ═══════════════════════════════════════════════════════════ */
  var S = {
    tab:          'calendar',
    calView:      'month',      // 'month' | 'week'
    viewDate:     new Date(),
    events:       [],
    editEventId:  null,
    reportFiles:  [],
    selReport:    null,
    userEmail:    '',
    dupTimer:     null,
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

  // 이벤트 description에서 부서 추출 → CSS 클래스
  function deptClass(description) {
    if (!description) return 'dept-기타';
    var m = /\[부서:([^\]]+)\]/.exec(description);
    if (m) return 'dept-' + m[1];
    for (var d in CONFIG.departmentColors) {
      if (description.indexOf(d) !== -1) return 'dept-' + d;
    }
    return 'dept-기타';
  }

  // colorId → 부서명
  function colorIdToDept(colorId) {
    var map = CONFIG.departmentColorIds;
    for (var d in map) {
      if (map[d] === String(colorId)) return d;
    }
    return '기타';
  }

  // 이벤트 시작 Date 반환
  function evtStart(ev) {
    return new Date(ev.start.dateTime || ev.start.date);
  }

  /* ═══════════════════════════════════════════════════════════
     토스트
  ═══════════════════════════════════════════════════════════ */
  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.textContent = msg;
    var container = $('toast-container');
    container.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity 200ms';
      el.style.opacity = '0';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }, 3200);
  }

  /* ═══════════════════════════════════════════════════════════
     모달 공통
  ═══════════════════════════════════════════════════════════ */
  function openModal(id)  { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }

  function initModalHandlers() {
    // data-close-modal 클릭 또는 Esc로 닫기
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
        if (S.tab === 'calendar') renderCalendar();
        if (S.tab === 'settings') renderSettingsTab();
      }
    });

    $('login-btn').addEventListener('click', function () {
      $('login-btn').disabled = true;
      Auth.login()
        .catch(function () {})
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
     캘린더 — 이벤트 로딩
  ═══════════════════════════════════════════════════════════ */
  async function loadEvents() {
    if (!Auth.isLoggedIn()) return;
    var d = S.viewDate;
    var timeMin, timeMax;

    if (S.calView === 'month') {
      // 현재 월 전체 + 앞뒤 여유 (7일)
      timeMin = new Date(d.getFullYear(), d.getMonth(), -6).toISOString();
      timeMax = new Date(d.getFullYear(), d.getMonth() + 1, 8).toISOString();
    } else {
      // 현재 주 일요일 ~ 토요일
      var day  = d.getDay();
      var sun  = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
      timeMin  = sun.toISOString();
      timeMax  = new Date(sun.getTime() + 7 * 86400000).toISOString();
    }

    try {
      S.events = await CalendarModule.listEvents(CONFIG.calendarId, timeMin, timeMax);
    } catch (e) {
      toast('일정 로드 실패: ' + e.message, 'error');
      S.events = [];
    }
  }

  /* ═══════════════════════════════════════════════════════════
     캘린더 — 렌더링
  ═══════════════════════════════════════════════════════════ */
  async function renderCalendar() {
    if (!Auth.isLoggedIn()) return;
    await loadEvents();
    updateCalendarTitle();
    if (S.calView === 'month') renderMonth();
    else renderWeek();
  }

  function updateCalendarTitle() {
    var d = S.viewDate;
    var title = $('calendar-title');
    if (S.calView === 'month') {
      title.textContent = d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월';
    } else {
      var day  = d.getDay();
      var sun  = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
      var sat  = new Date(sun.getTime() + 6 * 86400000);
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
    grid.className  = 'calendar-grid';
    grid.innerHTML  = '';

    var first = new Date(d.getFullYear(), d.getMonth(), 1);
    var start = new Date(first);
    start.setDate(start.getDate() - start.getDay()); // 해당 월 첫 일요일로 이동

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

    var day    = d.getDay();
    var sun    = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    var evMap  = eventsGroupedByDate(S.events);
    var NAMES  = ['일', '월', '화', '수', '목', '금', '토'];

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
  }

  /* ═══════════════════════════════════════════════════════════
     일정 모달
  ═══════════════════════════════════════════════════════════ */
  function openEventModal(event, date) {
    S.editEventId = null;
    $('event-modal-title').textContent = event ? '일정 수정' : '일정 추가';
    $('delete-event-btn').hidden        = !event;
    $('duplicate-alert').hidden         = true;
    $('event-id').value                 = '';
    $('event-title').value              = '';
    $('event-description').value        = '';
    $('event-dept').value               = '기타';

    if (event) {
      S.editEventId = event.id;
      $('event-id').value    = event.id;
      $('event-title').value = event.summary || '';

      // description에서 [부서:X] 태그 제거 후 표시
      var rawDesc = event.description || '';
      $('event-description').value = rawDesc.replace(/\n?\[부서:[^\]]+\]/g, '').trim();
      $('event-dept').value = colorIdToDept(event.colorId);

      var sdt = event.start.dateTime
        ? toLocalDateTime(new Date(event.start.dateTime))
        : event.start.date + 'T09:00';
      var edt = event.end.dateTime
        ? toLocalDateTime(new Date(event.end.dateTime))
        : event.end.date + 'T10:00';
      $('event-start').value = sdt;
      $('event-end').value   = edt;
    } else {
      var base = date || new Date();
      var prefix = base.getFullYear() + '-' + pad(base.getMonth() + 1) + '-' + pad(base.getDate());
      $('event-start').value = prefix + 'T09:00';
      $('event-end').value   = prefix + 'T10:00';
    }

    openModal('event-modal');
  }

  function initEventModal() {
    // 저장
    $('save-event-btn').addEventListener('click', async function () {
      var title = $('event-title').value.trim();
      var start = $('event-start').value;
      var end   = $('event-end').value;
      var dept  = $('event-dept').value;
      var desc  = $('event-description').value.trim();

      if (!title)                           { toast('제목을 입력하세요.', 'error'); return; }
      if (!start || !end)                   { toast('시작·종료 시간을 입력하세요.', 'error'); return; }
      if (new Date(start) >= new Date(end)) { toast('종료는 시작 이후여야 합니다.', 'error'); return; }

      var tz      = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
      var colorId = CONFIG.departmentColorIds[dept] || '11';
      var fullDesc = desc + (desc ? '\n' : '') + '[부서:' + dept + ']';

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
          await CalendarModule.updateEvent(CONFIG.calendarId, S.editEventId, eventData);
          toast('일정이 수정되었습니다.', 'success');
        } else {
          await CalendarModule.createEvent(CONFIG.calendarId, eventData);
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

    // 삭제
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

    // 중복 체크 (600ms 디바운스)
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

      // 자기 자신은 중복에서 제외 (수정 모드)
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
     주간허브
  ═══════════════════════════════════════════════════════════ */
  function syncWeeklyHubFiles() {
    renderHubFileList();
    // 이메일 탭 파일 드롭다운도 동기화
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
      var selected = S.selReport && S.selReport.id === f.id;
      item.className = 'report-file-item' + (selected ? ' selected' : '');
      var dateStr = f.createdTime ? new Date(f.createdTime).toLocaleDateString('ko-KR') : '';
      item.innerHTML =
        '<span class="report-file-icon">📄</span>' +
        '<span class="report-file-name" title="' + f.name + '">' + f.name + '</span>' +
        '<span class="report-file-date">' + dateStr + '</span>';
      item.addEventListener('click', function () { selectReport(f); });
      listEl.appendChild(item);
    });
  }

  function selectReport(f) {
    S.selReport = f;
    renderHubFileList();

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
        renderHubFileList();
        renderEmailFileSelect();
        toast(
          S.reportFiles.length > 0 ? S.reportFiles.length + '개 파일을 불러왔습니다.' : '파일이 없습니다. 설정에서 폴더 ID를 확인하세요.',
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
      toast(ok ? '클립보드에 복사되었습니다.' : '복사 실패. 직접 복사해주세요.', ok ? 'success' : 'error');
    });
  }

  /* ═══════════════════════════════════════════════════════════
     이메일 탭
  ═══════════════════════════════════════════════════════════ */
  function renderEmailTab() {
    renderRecipientsList();
    renderEmailFileSelect();
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
    // 파일 선택 → 제목/본문 자동 생성
    $('email-file-select').addEventListener('change', function () {
      var f = S.reportFiles.find(function (r) { return r.id === this.value; }, this);
      if (!f) return;
      var draft = GmailModule.generateDraft(f.name);
      $('email-subject').value = draft.subject;
      $('email-body').value    = draft.body;
    });

    // 전체 선택
    $('select-all-recipients').addEventListener('change', function () {
      var checked = this.checked;
      document.querySelectorAll('#recipients-list input[type="checkbox"]').forEach(function (cb) {
        cb.checked = checked;
      });
    });

    // 미리보기 버튼
    $('preview-email-btn').addEventListener('click', function () {
      var recipients = getSelectedRecipients();
      if (!recipients.length) { toast('수신자를 선택하세요.', 'error'); return; }
      var subject = $('email-subject').value.trim();
      var body    = $('email-body').value.trim();
      if (!subject || !body) { toast('제목과 본문을 입력하세요.', 'error'); return; }

      $('email-preview-meta').innerHTML =
        '<p><strong>받는이:</strong> ' +
          recipients.map(function (r) { return r.name + ' &lt;' + r.email + '&gt;'; }).join(', ') +
        '</p>' +
        '<p><strong>제목:</strong> ' + subject + '</p>';
      $('email-preview-content').textContent = body;
      openModal('email-preview-modal');
    });

    // 미리보기 모달에서 발송 확인
    $('confirm-send-btn').addEventListener('click', function () {
      closeModal('email-preview-modal');
      doSendEmail();
    });

    // 직접 발송 버튼
    $('send-email-btn').addEventListener('click', function () {
      var recipients = getSelectedRecipients();
      if (!recipients.length) { toast('수신자를 선택하세요.', 'error'); return; }
      if (!$('email-subject').value.trim() || !$('email-body').value.trim()) {
        toast('제목과 본문을 입력하세요.', 'error'); return;
      }
      doSendEmail();
    });
  }

  async function doSendEmail() {
    var recipients = getSelectedRecipients();
    if (!recipients.length) { toast('수신자를 선택하세요.', 'error'); return; }

    var fileId    = $('email-file-select').value;
    var file      = fileId ? S.reportFiles.find(function (r) { return r.id === fileId; }) : null;
    var driveLink = '';
    if (file) {
      try { driveLink = await DriveModule.getShareLink(file.id); } catch (e) { driveLink = file.webViewLink || ''; }
    }

    var btn = $('send-email-btn');
    btn.disabled    = true;
    btn.textContent = '발송 중...';
    try {
      var result = await GmailModule.sendEmail({
        to:        recipients,
        subject:   $('email-subject').value.trim(),
        body:      $('email-body').value.trim(),
        driveLink: driveLink,
      });
      if (result.success) {
        toast('이메일이 발송되었습니다.', 'success');
        closeModal('email-preview-modal');
      }
    } catch (e) {
      toast('발송 실패: ' + e.message, 'error');
    } finally {
      btn.disabled    = false;
      btn.textContent = '발송';
    }
  }

  /* ═══════════════════════════════════════════════════════════
     설정 탭
  ═══════════════════════════════════════════════════════════ */
  function renderSettingsTab() {
    $('settings-user-email').textContent = S.userEmail || CONFIG.senderEmail;
    $('setting-folder-id').value = CONFIG.driveReportFolderId !== 'YOUR_FOLDER_ID'
      ? CONFIG.driveReportFolderId : '';
    renderSettingsRecipients();
    renderDeptColors();
  }

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
        renderEmailFileSelect();
      });
    });
  }

  function renderDeptColors() {
    var el = $('dept-colors-list');
    el.innerHTML = '';
    Object.keys(CONFIG.departmentColors).forEach(function (dept) {
      var color = CONFIG.departmentColors[dept];
      var item = document.createElement('div');
      item.className = 'dept-color-item';
      item.innerHTML =
        '<div class="dept-color-swatch" style="background:' + color + '"></div>' +
        '<span class="dept-color-name">' + dept + '</span>' +
        '<span style="font-size:12px;color:#5F6368;margin-left:8px">' + color + '</span>';
      el.appendChild(item);
    });
  }

  function persistRecipients() {
    try { localStorage.setItem(CONFIG.storageKeys.recipients, JSON.stringify(CONFIG.recipients)); } catch (e) {}
  }

  function initSettings() {
    // Drive 폴더 ID 저장
    $('save-folder-btn').addEventListener('click', function () {
      var val = $('setting-folder-id').value.trim();
      if (!val) { toast('폴더 ID를 입력하세요.', 'error'); return; }
      CONFIG.driveReportFolderId = val;
      try { localStorage.setItem(CONFIG.storageKeys.driveFolderId, val); } catch (e) {}
      toast('폴더 ID가 저장되었습니다.', 'success');
    });

    // 수신자 추가
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

    // Enter로 수신자 추가
    [$('new-recipient-name'), $('new-recipient-email')].forEach(function (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') $('add-recipient-btn').click();
      });
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
    initSettings();
    initModalHandlers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
