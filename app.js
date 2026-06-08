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

  // work.js에서 토스트 사용
  window.aseaToast = toast;

  // quicktask 등록 후 캘린더 새로고침용 전역 함수
  window.aseaRefreshCalendar = function () {
    if (S.tab === 'calendar') renderCalendar();
  };

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
        loadUserEmail().then(function () {
          if (typeof WorkModule !== 'undefined') WorkModule.onLogin(S.userEmail);

          // Chrome 확장 또는 #quick-task URL hash로 인한 자동 모달 오픈
          var autoOpen = window.__aseaAutoOpenQuickTask ||
                         window.location.hash === '#quick-task';
          if (autoOpen) {
            window.__aseaAutoOpenQuickTask = false;
            window.location.hash = '';
            setTimeout(function () {
              if (typeof QuickTaskModule !== 'undefined') QuickTaskModule.open();
            }, 400);
          }
        });
        checkScheduledEmails();
        // 로그인 시 설정 불러오기 + 이력 병합 동기화
        Promise.all([loadSettingsFromCloud(true), syncHistoryOnLogin()]).then(function () {
          // 로그인 시마다 Google 서버 색상 자동 동기화 (기기 간 색상 일치)
          loadAndSyncCalendars().then(function () {
            renderMyCalendarsList();
            if (S.tab === 'calendar') renderCalendar();
            if (S.tab === 'settings') renderSettingsTab();
          });
          if (S.tab === 'calendar') renderCalendar();
          if (S.tab === 'settings') renderSettingsTab();
        });
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
     클라우드 동기화 (Google Drive appDataFolder)
     - asea-settings.json : API 키·웹훅·수신자·부서
     - asea-history.json  : 추출이력·공유이력
     로그인 시 자동 병합(로컬 + 클라우드), 변경 시 자동 업로드(디바운스 2s)
  ═══════════════════════════════════════════════════════════ */
  var CLOUD_SETTINGS_FILE = 'asea-settings.json';
  var CLOUD_HISTORY_FILE  = 'asea-history.json';
  var CLOUD_SETTINGS_KEYS = [
    'anthropicApiKey', 'geminiApiKey', 'githubToken', 'makeWebhookUrl',
    'recipients', 'departments',
  ];
  var _historyUploadTimer = null;

  // Drive appDataFolder 파일 upsert (생성 또는 덮어쓰기)
  async function driveUpsert(fileName, jsonStr) {
    var token = Auth.getToken();
    if (!token) return;
    // 파일 ID 조회
    var qRes = await fetch(
      'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27' +
        encodeURIComponent(fileName) + '%27&fields=files(id)',
      { headers: { Authorization: 'Bearer ' + token } }
    );
    var qData = qRes.ok ? await qRes.json() : { files: [] };
    var fileId = qData.files && qData.files[0] ? qData.files[0].id : null;

    if (fileId) {
      // 덮어쓰기
      await fetch('https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=media', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: jsonStr,
      });
    } else {
      // 신규 생성 (multipart)
      var b = '---aseab';
      var meta = JSON.stringify({ name: fileName, parents: ['appDataFolder'] });
      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + b },
        body: '--' + b + '\r\nContent-Type: application/json\r\n\r\n' + meta +
              '\r\n--' + b + '\r\nContent-Type: application/json\r\n\r\n' + jsonStr +
              '\r\n--' + b + '--',
      });
    }
  }

  // Drive appDataFolder 파일 읽기 (없으면 null)
  async function driveRead(fileName) {
    var token = Auth.getToken();
    if (!token) return null;
    var qRes = await fetch(
      'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27' +
        encodeURIComponent(fileName) + '%27&fields=files(id)',
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (!qRes.ok) return null;
    var qData = await qRes.json();
    var fileId = qData.files && qData.files[0] ? qData.files[0].id : null;
    if (!fileId) return null;
    var r = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media',
      { headers: { Authorization: 'Bearer ' + token } });
    return r.ok ? r.json() : null;
  }

  // ID 기준 두 배열 병합 (중복 제거, 최신순 정렬)
  function mergeById(arrA, arrB, dateKey) {
    var map = {};
    (arrA || []).forEach(function (h) { if (h.id) map[h.id] = h; });
    (arrB || []).forEach(function (h) { if (h.id) map[h.id] = h; });
    return Object.values(map).sort(function (a, b) {
      return new Date(b[dateKey] || 0) - new Date(a[dateKey] || 0);
    });
  }

  // 이력 클라우드 즉시 업로드
  async function pushHistoryToCloud() {
    try {
      await driveUpsert(CLOUD_HISTORY_FILE, JSON.stringify({
        extractHistory: CONFIG.extractHistory,
        shareHistory:   CONFIG.shareHistory,
      }));
      updateCloudSyncStatus();
    } catch (e) {}
  }

  // 이력 변경 시 호출 — 2초 디바운스
  function scheduleHistoryUpload() {
    clearTimeout(_historyUploadTimer);
    _historyUploadTimer = setTimeout(pushHistoryToCloud, 2000);
  }

  // 로그인 직후: 클라우드 이력과 로컬 이력을 병합 후 업로드
  async function syncHistoryOnLogin() {
    try {
      var cloud = await driveRead(CLOUD_HISTORY_FILE);
      var localExt   = CONFIG.extractHistory || [];
      var localShare = CONFIG.shareHistory   || [];
      var cloudExt   = (cloud && cloud.extractHistory) || [];
      var cloudShare = (cloud && cloud.shareHistory)   || [];

      var mergedExt   = mergeById(localExt,   cloudExt,   'extractedAt');
      var mergedShare = mergeById(localShare,  cloudShare, 'sharedAt');

      var changed = mergedExt.length !== cloudExt.length || mergedShare.length !== cloudShare.length;

      CONFIG.extractHistory = mergedExt;
      CONFIG.shareHistory   = mergedShare;
      try {
        localStorage.setItem(CONFIG.storageKeys.extractHistory, JSON.stringify(mergedExt));
        localStorage.setItem(CONFIG.storageKeys.shareHistory,   JSON.stringify(mergedShare));
      } catch (e) {}

      // 로컬에 클라우드에 없던 항목이 있으면 즉시 업로드
      if (changed) await pushHistoryToCloud();

      updateCloudSyncStatus();
    } catch (e) {}
  }

  // 설정 저장/불러오기
  async function saveSettingsToCloud(silent) {
    var token = Auth.getToken();
    if (!token) { if (!silent) toast('로그인이 필요합니다.', 'error'); return; }
    try {
      var payload = {};
      CLOUD_SETTINGS_KEYS.forEach(function (k) { payload[k] = CONFIG[k]; });
      await driveUpsert(CLOUD_SETTINGS_FILE, JSON.stringify(payload));
      if (!silent) toast('☁️ 설정이 동기화되었습니다.', 'success');
      updateCloudSyncStatus();
    } catch (e) {
      if (!silent) toast('설정 동기화 실패: ' + (e.message || e), 'error');
    }
  }

  async function loadSettingsFromCloud(silent) {
    var token = Auth.getToken();
    if (!token) return false;
    try {
      var payload = await driveRead(CLOUD_SETTINGS_FILE);
      if (!payload) return false;
      CLOUD_SETTINGS_KEYS.forEach(function (k) {
        if (payload[k] !== undefined) CONFIG[k] = payload[k];
      });
      var s = CONFIG.storageKeys;
      try {
        if (payload.anthropicApiKey) localStorage.setItem(s.anthropicApiKey, payload.anthropicApiKey);
        if (payload.geminiApiKey)    localStorage.setItem(s.geminiApiKey,    payload.geminiApiKey);
        if (payload.githubToken)     localStorage.setItem(s.githubToken,     payload.githubToken);
        if (payload.makeWebhookUrl)  localStorage.setItem(s.makeWebhookUrl,  payload.makeWebhookUrl);
        if (payload.recipients)      localStorage.setItem(s.recipients,      JSON.stringify(payload.recipients));
        if (payload.departments)     localStorage.setItem(s.departments,     JSON.stringify(payload.departments));
      } catch (e) {}
      if (!silent) { toast('☁️ 설정을 불러왔습니다.', 'success'); renderSettingsTab(); }
      return true;
    } catch (e) { return false; }
  }

  function updateCloudSyncStatus() {
    var el = $('cloud-sync-status');
    if (!el) return;
    var now = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    el.textContent = '마지막 동기화: ' + now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) +
      ' ' + p(now.getHours()) + ':' + p(now.getMinutes()) + ':' + p(now.getSeconds());
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

    // 선택된 캘린더 기준으로 렌더 (이벤트 없어도 표시)
    var cals = CONFIG.selectedCalendars.length
      ? CONFIG.selectedCalendars
      : (function () {
          var seen = {};
          var list = [];
          S.events.forEach(function (ev) {
            if (ev._calName && !seen[ev._calName]) {
              seen[ev._calName] = true;
              list.push({ id: ev._calId || ev._calName, name: ev._calName, color: ev._calColor, enabled: true });
            }
          });
          return list;
        })();

    cals.forEach(function (cal, i) {
      var enabled = cal.enabled !== false;
      var item = document.createElement('div');
      item.className = 'legend-item' + (enabled ? '' : ' legend-item--off');
      item.title = enabled ? '클릭하여 숨기기' : '클릭하여 표시';
      item.innerHTML =
        '<div class="legend-dot" style="background:' + (enabled ? cal.color : '#ccc') + '"></div>' +
        '<span class="legend-name">' + cal.name + '</span>' +
        (!enabled ? '<span class="legend-off-badge">OFF</span>' : '');

      item.addEventListener('click', function () {
        // CONFIG.selectedCalendars에서 해당 캘린더 찾아 토글
        var target = CONFIG.selectedCalendars.find(function (c) { return c.id === cal.id || c.name === cal.name; });
        if (target) {
          target.enabled = !target.enabled;
          persistSelectedCalendars();
          renderLegend();
          renderCalendar();
        }
      });

      el.appendChild(item);
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

    $('sync-filter-calendars-btn').addEventListener('click', async function () {
      this.textContent = '⏳ 동기화 중...';
      this.disabled = true;
      await loadAndSyncCalendars();
      renderFilterPanel();
      renderLegend();
      renderExtractTab();
      this.textContent = '🔄 동기화';
      this.disabled = false;
      toast('구글 캘린더와 동기화됐습니다.', 'success');
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
      var googleIds = S.userCalendars.map(function (c) { return c.id; });

      // 구글에서 삭제된 캘린더는 로컬에서도 제거
      CONFIG.selectedCalendars = CONFIG.selectedCalendars.filter(function (c) {
        return googleIds.indexOf(c.id) !== -1;
      });

      // 색상·이름 동기화 + 신규 추가
      S.userCalendars.forEach(function (cal) {
        var googleColor   = cal.backgroundColor || '#4285F4';
        var googleColorId = cal.colorId || '';
        var exists = CONFIG.selectedCalendars.find(function (c) { return c.id === cal.id; });
        if (exists) {
          exists.name    = cal.summary;
          exists.color   = googleColor;
          exists.colorId = googleColorId;
        } else {
          CONFIG.selectedCalendars.push({
            id:      cal.id,
            name:    cal.summary,
            color:   googleColor,
            colorId: googleColorId,
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
    $('share-event-btn').hidden         = !event;
    $('event-share-area').hidden        = true;
    $('event-share-url').value          = '';
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

  function toGCalDateStr(isoStr) {
    // ISO → YYYYMMDDTHHMMSSZ (UTC, Google Calendar URL 형식)
    return new Date(isoStr).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  function initEventModal() {
    // 공유하기 버튼
    $('share-event-btn').addEventListener('click', function () {
      var title = $('event-title').value.trim();
      var start = $('event-start').value;
      var end   = $('event-end').value;
      var desc  = $('event-description').value.trim();

      if (!title || !start || !end) {
        toast('제목과 시간을 먼저 입력하세요.', 'error'); return;
      }

      var startStr = toGCalDateStr(start);
      var endStr   = toGCalDateStr(end);
      var params   = new URLSearchParams({
        action:  'TEMPLATE',
        text:    title,
        dates:   startStr + '/' + endStr,
        details: desc || '',
      });
      var shareUrl = 'https://calendar.google.com/calendar/render?' + params.toString();

      $('event-share-url').value   = shareUrl;
      $('event-share-area').hidden = false;
      $('event-share-area').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    $('event-share-copy').addEventListener('click', function () {
      var url = $('event-share-url').value;
      if (!url) return;
      navigator.clipboard.writeText(url)
        .then(function () { toast('공유 URL이 복사되었습니다. 카톡·문자로 전송하세요.', 'success'); })
        .catch(function () {
          $('event-share-url').select();
          document.execCommand('copy');
          toast('복사되었습니다.', 'success');
        });
    });

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

      var driveShareLink = '';
      if (fileId) {
        try { driveShareLink = await DriveModule.getShareLink(fileId); } catch (e) {}
      }

      var schedEntry = {
        id:          genId(),
        to:          recipients,
        subject:     subject,
        body:        body,
        driveLink:   driveShareLink,
        scheduledAt: new Date(schedDt).toISOString(),
        status:      'scheduled',
      };

      // Make.com 웹훅으로 서버 예약 등록
      if (CONFIG.makeWebhookUrl) {
        try {
          var payload = {
            id:          schedEntry.id,
            to:          recipients.map(function (r) { return r.email; }).join(','),
            subject:     subject,
            body:        body,
            driveLink:   driveShareLink,
            scheduledAt: schedEntry.scheduledAt,
          };
          await fetch(CONFIG.makeWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          schedEntry.status = 'scheduled_server';
          toast('서버 예약 등록 완료: ' + formatDate(schedDt), 'success');
        } catch (e) {
          toast('서버 예약 실패 (로컬 예약으로 전환): ' + e.message, 'error');
        }
      } else {
        toast('예약 등록되었습니다 (브라우저 열릴 때 발송): ' + formatDate(schedDt), 'success');
      }

      CONFIG.scheduledEmails.push(schedEntry);
      persistEmailHistory();
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
          id:        genId(),
          to:        recipients.map(function (r) { return r.name + ' <' + r.email + '>'; }).join(', '),
          subject:   subject,
          body:      body,
          driveLink: driveLink,
          sentAt:    new Date().toISOString(),
          status:    'sent',
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
        to:      recipients.map(function (r) { return r.name + ' <' + r.email + '>'; }).join(', '),
        subject: subject,
        body:    body,
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
      var isScheduled = h.status === 'scheduled' || h.status === 'scheduled_server';
      var badge = h.status === 'sent'
        ? '<span class="history-badge badge-sent">발송완료</span>'
        : isScheduled
          ? '<span class="history-badge badge-scheduled">예약중</span>'
          : '<span class="history-badge badge-failed">실패</span>';
      var dateLabel = h.sentAt
        ? '발송: ' + formatDate(h.sentAt)
        : h.scheduledAt ? '예약: ' + formatDate(h.scheduledAt) : '';

      // to 필드: 이전 버그로 객체 배열일 수도 있어 안전 처리
      var toStr = Array.isArray(h.to)
        ? h.to.map(function (r) { return typeof r === 'object' ? (r.name + ' <' + r.email + '>') : r; }).join(', ')
        : (h.to || '');

      var item = document.createElement('div');
      item.className = 'history-item';

      item.innerHTML =
        '<div class="history-item-main">' +
          '<div class="history-item-header">' +
            '<span class="history-item-subject">' + (h.subject || '(제목없음)') + '</span>' +
            badge +
          '</div>' +
          '<div class="history-item-meta">' +
            '<span>받는이: ' + toStr + '</span>' +
            '<span>' + dateLabel + '</span>' +
          '</div>' +
        '</div>' +
        '<button class="hist-delete-btn" title="삭제">✕</button>';

      // 내용 펼치기/접기
      var bodySection = document.createElement('div');
      bodySection.className = 'history-item-body';
      bodySection.hidden = true;
      var bodyText = h.body || '(본문 없음)';
      var drivePart = h.driveLink ? '\n\n📎 첨부 링크: ' + h.driveLink : '';
      bodySection.innerHTML =
        '<div class="history-body-label">📧 메일 본문</div>' +
        '<pre class="history-body-content">' + bodyText.replace(/</g, '&lt;') + drivePart + '</pre>';
      item.appendChild(bodySection);

      // 헤더 클릭 → 본문 토글
      item.querySelector('.history-item-main').addEventListener('click', function () {
        bodySection.hidden = !bodySection.hidden;
        item.classList.toggle('history-item--expanded', !bodySection.hidden);
      });

      // X 버튼 → 개별 삭제
      item.querySelector('.hist-delete-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('이 이력을 삭제하시겠습니까?\n\n제목: ' + (h.subject || '(제목없음)'))) return;
        CONFIG.emailHistory    = CONFIG.emailHistory.filter(function (x) { return x.id !== h.id; });
        CONFIG.scheduledEmails = CONFIG.scheduledEmails.filter(function (x) { return x.id !== h.id; });
        persistEmailHistory();
        renderEmailHistory();
        toast('삭제되었습니다.', 'info');
      });

      // 예약 취소 버튼 (예약중인 경우 추가)
      if (isScheduled) {
        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-ghost btn-sm';
        cancelBtn.style.cssText = 'margin-top:8px;font-size:12px';
        cancelBtn.textContent = '예약 취소';
        cancelBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (!confirm('예약을 취소하시겠습니까?')) return;
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
    var sel = $('extract-target-calendar');
    var cals = S.userCalendars;
    if (!cals || cals.length === 0) {
      sel.innerHTML = '<option value="primary">기본 캘린더</option>';
      return;
    }
    sel.innerHTML = '';
    cals.forEach(function (cal) {
      var opt = document.createElement('option');
      opt.value = cal.id;
      opt.textContent = cal.summary + (cal.primary ? ' (기본)' : '');
      if (cal.primary) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function initExtractTab() {
    // 서브탭 전환
    document.querySelectorAll('[data-etab]').forEach(function (btn) {
      if (!btn.closest('#tab-extract')) return;
      btn.addEventListener('click', function () {
        var target = btn.dataset.etab;
        document.querySelectorAll('#tab-extract .email-subtab').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        document.querySelectorAll('#tab-extract .email-subpanel').forEach(function (p) { p.hidden = true; });
        $('etab-' + target).hidden = false;
        if (target === 'extract-history') renderExtractHistory();
        if (target === 'share-history') renderShareHistory();
      });
    });

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
    $('extract-deselect-conflict').addEventListener('click', function () {
      document.querySelectorAll('.extract-event-card.is-conflict').forEach(function (c) {
        var cb = c.querySelector('input[type="checkbox"]');
        if (cb) cb.checked = false;
        c.classList.remove('selected');
      });
    });

    $('extract-delete-selected-btn').addEventListener('click', function () {
      var checked = Array.from(document.querySelectorAll('.extract-event-check input:checked'));
      if (!checked.length) { toast('삭제할 일정을 선택하세요.', 'error'); return; }
      if (!confirm(checked.length + '개 일정을 삭제하시겠습니까?')) return;
      var indices = checked.map(function (cb) { return parseInt(cb.dataset.idx); });
      indices.sort(function (a, b) { return b - a; }); // 뒤에서부터 삭제
      indices.forEach(function (i) { S.extractedEvents.splice(i, 1); });
      renderExtractedEvents(null);
      toast(indices.length + '개 일정이 삭제되었습니다.', 'success');
    });

    $('extract-split-btn').addEventListener('click', splitSelectedEvents);
    $('extract-check-conflict-btn').addEventListener('click', checkExtractConflicts);
    $('extract-save-state-btn').addEventListener('click', saveExtractState);
    $('extract-gen-share-url-btn').addEventListener('click', generateShareUrl);
    $('extract-text-btn').addEventListener('click', buildExtractText);
    $('extract-text-copy').addEventListener('click', function () {
      var el = $('extract-text-output');
      el.select(); el.setSelectionRange(0, 99999);
      navigator.clipboard.writeText(el.value).then(function () { toast('복사되었습니다.', 'success'); });
    });
    $('extract-weekly-copy').addEventListener('click', function () {
      var el = $('extract-weekly-output');
      el.select(); el.setSelectionRange(0, 99999);
      navigator.clipboard.writeText(el.value).then(function () { toast('복사되었습니다.', 'success'); });
    });

    $('extract-add-selected').addEventListener('click', addExtractedToCalendar);

    $('clear-extract-history-btn').addEventListener('click', function () {
      if (!confirm('추출 이력을 모두 삭제하시겠습니까?')) return;
      CONFIG.extractHistory = [];
      persistExtractHistory();
      renderExtractHistory();
    });
  }

  var S_pdfFile = null;

  function setPdfFile(file) {
    S_pdfFile = file;
    var info = $('pdf-file-info');
    info.hidden = false;
    info.textContent = '📄 ' + file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
    $('run-extract-btn').disabled = false;
  }

  // PDF.js로 텍스트 추출 (base64 전송 대비 토큰 60~80% 절감)
  async function extractTextFromPdf(file) {
    if (!window.pdfjsLib) throw new Error('PDF.js 로드 실패');
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    var arrayBuffer = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    var texts = [];
    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i);
      var content = await page.getTextContent();
      texts.push(content.items.map(function (it) { return it.str; }).join(' '));
    }
    return texts.join('\n');
  }

  async function runExtract() {
    var apiKey = CONFIG.anthropicApiKey;
    if (!apiKey) { toast('설정 탭에서 Claude API 키를 먼저 저장하세요.', 'error'); return; }
    if (!S_pdfFile) { toast('PDF 파일을 먼저 선택하세요.', 'error'); return; }

    var btn = $('run-extract-btn');
    btn.disabled = true;
    btn.textContent = '🤖 AI 분석 중...';

    try {
      // PDF 텍스트 추출 (base64 전송 안 함 → 토큰 절감)
      btn.textContent = '📄 PDF 텍스트 추출 중...';
      var pdfText = await extractTextFromPdf(S_pdfFile);
      if (!pdfText || pdfText.trim().length < 10) throw new Error('PDF에서 텍스트를 추출할 수 없습니다. 스캔된 이미지 PDF는 지원되지 않습니다.');

      btn.textContent = '🤖 AI 분석 중...';

      var prompt = '아래는 업무 보고서 PDF에서 추출한 텍스트입니다. 모든 일정(행사, 회의, 업무 등)을 추출해 주세요.\n\n' +
        '반드시 아래 JSON 배열 형식으로만 반환하고, 다른 텍스트나 설명은 포함하지 마세요:\n' +
        '[\n' +
        '  {\n' +
        '    "title": "[부서명] 행사/업무 내용",\n' +
        '    "department": "부서명",\n' +
        '    "startDateTime": "YYYY-MM-DDTHH:mm:00",\n' +
        '    "endDateTime": "YYYY-MM-DDTHH:mm:00",\n' +
        '    "description": "세부사항"\n' +
        '  }\n' +
        ']\n\n' +
        '날짜가 불명확한 경우 최대한 추론하세요.\n\n--- PDF 텍스트 ---\n' + pdfText;

      // Claude Haiku API 호출 (가장 저렴한 Claude 모델)
      var response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 8192,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        var errData = await response.json();
        throw new Error((errData.error && errData.error.message) || 'API 오류 ' + response.status);
      }

      var data = await response.json();
      var text = data.content && data.content[0] && data.content[0].text;
      if (!text) throw new Error('AI 응답이 비어 있습니다.');

      // JSON 파싱 — 응답에서 JSON 배열만 추출
      var jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('일정 데이터를 파싱할 수 없습니다.');
      var parsed;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (parseErr) {
        var rawJson = jsonMatch[0];
        var lastComplete = rawJson.lastIndexOf('},');
        if (lastComplete === -1) lastComplete = rawJson.lastIndexOf('}');
        if (lastComplete === -1) throw new Error('응답 파싱 실패. 다시 시도하세요.');
        parsed = JSON.parse(rawJson.slice(0, lastComplete + 1) + ']');
        toast('응답 일부 복구됨. ' + parsed.length + '개 항목.', 'info');
      }
      S.extractedEvents = parsed;

      // 추출 이력 저장
      var histEntry = {
        id:          genId(),
        filename:    S_pdfFile ? S_pdfFile.name : 'unknown.pdf',
        extractedAt: new Date().toISOString(),
        count:       parsed.length,
        events:      parsed,
      };
      CONFIG.extractHistory.unshift(histEntry);
      if (CONFIG.extractHistory.length > 50) CONFIG.extractHistory = CONFIG.extractHistory.slice(0, 50);
      persistExtractHistory();

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

  function renderExtractedEvents(conflictSet) {
    // conflictSet: Set<index> — 충돌 확인 후 전달됨. 없으면 전부 신규로 표시
    var area    = $('extract-result-area');
    var listEl  = $('extract-events-list');
    var countEl = $('extract-result-count');

    area.hidden = false;
    listEl.innerHTML = '';

    var conflictCount = 0;

    S.extractedEvents.forEach(function (ev, i) {
      var isConflict = conflictSet ? conflictSet.has(i) : false;
      if (isConflict) conflictCount++;

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
        '</div>' +
        '<button class="btn btn-ghost btn-sm extract-edit-btn" data-idx="' + i + '" style="margin-left:auto;flex-shrink:0">✏️ 수정</button>';

      var cb = card.querySelector('input[type="checkbox"]');
      cb.addEventListener('change', function () {
        card.classList.toggle('selected', cb.checked);
      });
      card.classList.toggle('selected', true);

      card.querySelector('.extract-edit-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        openExtractEditModal(parseInt(this.dataset.idx));
      });

      listEl.appendChild(card);
    });

    var newCount = S.extractedEvents.length - conflictCount;
    if (conflictSet) {
      countEl.textContent = '총 ' + S.extractedEvents.length + '개 (신규 ' + newCount + '개 / 충돌 ' + conflictCount + '개)';
      $('extract-deselect-conflict').disabled = conflictCount === 0;
    } else {
      countEl.textContent = '총 ' + S.extractedEvents.length + '개 (충돌 확인 전)';
      $('extract-deselect-conflict').disabled = true;
    }
  }

  function splitSelectedEvents() {
    if (!S.extractedEvents || S.extractedEvents.length === 0) { toast('추출된 일정이 없습니다.', 'error'); return; }

    // 선택된 인덱스 수집 (내림차순 — splice 시 앞 인덱스 밀림 방지)
    var checkedIndices = [];
    document.querySelectorAll('.extract-event-check input:checked').forEach(function (cb) {
      var idx = parseInt(cb.closest('.extract-event-card').dataset.index, 10);
      if (!isNaN(idx)) checkedIndices.push(idx);
    });
    if (checkedIndices.length === 0) { toast('선택된 일정이 없습니다.', 'error'); return; }

    checkedIndices.sort(function (a, b) { return b - a; });

    var splitCount = 0;
    checkedIndices.forEach(function (idx) {
      var ev = S.extractedEvents[idx];
      var s  = new Date(ev.startDateTime);
      var e  = new Date(ev.endDateTime);
      if (s.toDateString() === e.toDateString()) return; // 당일 일정은 분리 불필요

      var startDayEnd  = new Date(s); startDayEnd.setHours(23, 59, 0, 0);
      var endDayStart  = new Date(e); endDayStart.setHours(0,  0,  0, 0);

      var startEv = Object.assign({}, ev, { title: ev.title + ' (시작)', endDateTime:   startDayEnd.toISOString() });
      var endEv   = Object.assign({}, ev, { title: ev.title + ' (종료)', startDateTime: endDayStart.toISOString() });

      S.extractedEvents.splice(idx, 1, startEv, endEv);
      splitCount++;
    });

    if (splitCount === 0) { toast('선택 항목 중 다일 일정이 없습니다. (당일 일정은 분리되지 않습니다)', 'info'); return; }
    renderExtractedEvents(null);
    toast(splitCount + '개 일정이 시작/종료로 분리됐습니다.', 'success');
  }

  function toDatetimeLocal(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function openExtractEditModal(idx) {
    var ev = S.extractedEvents[idx];
    if (!ev) return;
    $('extract-edit-index').value  = idx;
    $('extract-edit-title').value  = ev.title || '';
    $('extract-edit-dept').value   = ev.department || '';
    $('extract-edit-start').value  = toDatetimeLocal(ev.startDateTime);
    $('extract-edit-end').value    = toDatetimeLocal(ev.endDateTime);
    $('extract-edit-desc').value   = ev.description || '';
    openModal('extract-edit-modal');
  }

  function initShareUrlModal() {
    $('share-url-modal').querySelectorAll('[data-close-modal]').forEach(function (el) {
      el.addEventListener('click', function () { closeModal('share-url-modal'); });
    });
    $('share-url-modal-copy').addEventListener('click', function () {
      var val = $('share-url-modal-input').value;
      navigator.clipboard.writeText(val).then(function () { toast('URL이 복사됐습니다.', 'success'); });
    });
    $('clear-share-history-btn').addEventListener('click', function () {
      if (!confirm('공유 이력을 모두 삭제하시겠습니까?')) return;
      CONFIG.shareHistory = [];
      persistShareHistory();
      renderShareHistory();
    });
  }

  function initExtractEditModal() {
    $('extract-edit-modal').querySelectorAll('[data-close-modal]').forEach(function (el) {
      el.addEventListener('click', function () { closeModal('extract-edit-modal'); });
    });

    $('extract-edit-save-btn').addEventListener('click', function () {
      var idx   = parseInt($('extract-edit-index').value);
      var title = $('extract-edit-title').value.trim();
      var start = $('extract-edit-start').value;
      var end   = $('extract-edit-end').value;
      if (!title || !start || !end) { toast('제목, 시작/종료 일시는 필수입니다.', 'error'); return; }
      if (new Date(start) >= new Date(end)) { toast('종료 일시가 시작 일시보다 늦어야 합니다.', 'error'); return; }

      S.extractedEvents[idx] = {
        title:         title,
        department:    $('extract-edit-dept').value.trim() || '기타',
        startDateTime: new Date(start).toISOString(),
        endDateTime:   new Date(end).toISOString(),
        description:   $('extract-edit-desc').value.trim(),
      };

      closeModal('extract-edit-modal');
      // 충돌 확인 상태 초기화 후 목록 다시 그리기
      renderExtractedEvents(null);
      toast('수정되었습니다.', 'success');
    });

    $('extract-edit-delete-btn').addEventListener('click', function () {
      var idx = parseInt($('extract-edit-index').value);
      var ev = S.extractedEvents[idx];
      if (!ev) return;
      if (!confirm('"' + ev.title + '"\n\n이 일정을 삭제하시겠습니까?')) return;
      S.extractedEvents.splice(idx, 1);
      // 체크 인덱스 재정렬 (삭제된 항목 이후 번호를 1씩 감소)
      S.checkedExtractIndices = (S.checkedExtractIndices || [])
        .filter(function (i) { return i !== idx; })
        .map(function (i) { return i > idx ? i - 1 : i; });
      closeModal('extract-edit-modal');
      renderExtractedEvents(null);
      toast('일정이 삭제되었습니다.', 'success');
    });
  }

  async function checkExtractConflicts() {
    var calendarId = $('extract-target-calendar').value;
    if (!calendarId) { toast('캘린더를 선택하세요.', 'error'); return; }
    if (!S.extractedEvents || S.extractedEvents.length === 0) { toast('먼저 일정을 추출하세요.', 'error'); return; }

    var btn = $('extract-check-conflict-btn');
    btn.disabled = true;
    btn.textContent = '🔍 확인 중...';

    try {
      // 추출된 일정의 전체 날짜 범위 계산
      var dates = S.extractedEvents.map(function (ev) {
        return [new Date(ev.startDateTime).getTime(), new Date(ev.endDateTime).getTime()];
      }).flat();
      var minDate = new Date(Math.min.apply(null, dates));
      var maxDate = new Date(Math.max.apply(null, dates));
      minDate.setDate(minDate.getDate() - 1);
      maxDate.setDate(maxDate.getDate() + 1);

      // 선택된 캘린더에서 해당 기간 이벤트 조회
      var calEvents = await CalendarModule.listEvents(calendarId, minDate.toISOString(), maxDate.toISOString());

      // 충돌 판단: 시간 겹침 OR 제목 유사 (공백 제거 후 포함 여부)
      var conflictSet = new Set();
      S.extractedEvents.forEach(function (ev, i) {
        var evStart = new Date(ev.startDateTime);
        var evEnd   = new Date(ev.endDateTime);
        var evTitle = ev.title.replace(/\s/g, '').toLowerCase();

        var hit = calEvents.some(function (existing) {
          var exStart = new Date(existing.start.dateTime || existing.start.date);
          var exEnd   = new Date(existing.end.dateTime   || existing.end.date);
          var timeOverlap = evStart < exEnd && evEnd > exStart;
          var existingTitle = (existing.summary || '').replace(/\s/g, '').toLowerCase();
          var titleSimilar = existingTitle.length > 0 && (
            evTitle.includes(existingTitle) || existingTitle.includes(evTitle)
          );
          return timeOverlap || titleSimilar;
        });

        if (hit) conflictSet.add(i);
      });

      renderExtractedEvents(conflictSet);
      toast('충돌 확인 완료 — ' + conflictSet.size + '개 충돌', conflictSet.size > 0 ? 'info' : 'success');
    } catch (e) {
      toast('충돌 확인 실패: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🔍 충돌 확인';
    }
  }

  var DAY_KR = ['일', '월', '화', '수', '목', '금', '토'];

  function fmtEvLine(ev) {
    var s = new Date(ev.startDateTime);
    var e = new Date(ev.endDateTime);
    var dateStr = s.getFullYear() + '.' + pad(s.getMonth() + 1) + '.' + pad(s.getDate()) +
                  '(' + DAY_KR[s.getDay()] + ')';
    var timeStr = pad(s.getHours()) + ':' + pad(s.getMinutes()) +
                  '~' + pad(e.getHours()) + ':' + pad(e.getMinutes());
    return dateStr + ' ' + timeStr + ' ' + ev.title + (ev.department ? ' (' + ev.department + ')' : '');
  }

  function buildExtractText() {
    if (!S.extractedEvents.length) { toast('추출된 일정이 없습니다.', 'error'); return; }

    // 선택된 일정
    var selectedLines = [];
    document.querySelectorAll('.extract-event-card').forEach(function (c) {
      var cb = c.querySelector('input[type="checkbox"]');
      if (cb && cb.checked) {
        var idx = parseInt(c.dataset.index, 10);
        var ev = S.extractedEvents[idx];
        if (ev) selectedLines.push(fmtEvLine(ev));
      }
    });

    // 전체 일정 요일순 정렬 (날짜 오름차순)
    var sorted = S.extractedEvents.slice().sort(function (a, b) {
      return new Date(a.startDateTime) - new Date(b.startDateTime);
    });

    // 날짜별 그룹핑
    var groups = {};
    sorted.forEach(function (ev) {
      var s = new Date(ev.startDateTime);
      var key = s.getFullYear() + '.' + pad(s.getMonth() + 1) + '.' + pad(s.getDate()) +
                '(' + DAY_KR[s.getDay()] + ')';
      if (!groups[key]) groups[key] = [];
      groups[key].push(ev);
    });

    var weeklyLines = [];
    Object.keys(groups).forEach(function (dateKey) {
      weeklyLines.push('▶ ' + dateKey);
      groups[dateKey].forEach(function (ev) {
        var s = new Date(ev.startDateTime);
        var e = new Date(ev.endDateTime);
        var timeStr = pad(s.getHours()) + ':' + pad(s.getMinutes()) +
                      '~' + pad(e.getHours()) + ':' + pad(e.getMinutes());
        weeklyLines.push('  ' + timeStr + ' ' + ev.title + (ev.department ? ' (' + ev.department + ')' : ''));
      });
      weeklyLines.push('');
    });

    $('extract-text-output').value  = selectedLines.join('\n');
    $('extract-weekly-output').value = weeklyLines.join('\n').trimEnd();
    $('extract-text-area').hidden   = false;
    $('extract-text-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function persistExtractHistory() {
    try { localStorage.setItem(CONFIG.storageKeys.extractHistory, JSON.stringify(CONFIG.extractHistory)); } catch (e) {}
    scheduleHistoryUpload();
  }

  function persistShareHistory() {
    try { localStorage.setItem(CONFIG.storageKeys.shareHistory, JSON.stringify(CONFIG.shareHistory)); } catch (e) {}
    scheduleHistoryUpload();
  }

  async function generateShareUrl() {
    if (!S.extractedEvents || S.extractedEvents.length === 0) {
      toast('공유할 일정이 없습니다.', 'error'); return;
    }
    if (!CONFIG.githubToken) {
      toast('설정 탭에서 GitHub Token을 먼저 저장하세요.', 'error'); return;
    }

    var selected = [];
    document.querySelectorAll('.extract-event-check input:checked').forEach(function (cb) {
      var idx = parseInt(cb.closest('.extract-event-card').dataset.index, 10);
      if (!isNaN(idx) && S.extractedEvents[idx]) selected.push(S.extractedEvents[idx]);
    });
    if (selected.length === 0) { toast('선택된 일정이 없습니다.', 'error'); return; }

    var btn = $('extract-gen-share-url-btn');
    btn.disabled = true;
    btn.textContent = '⏳ 생성 중...';

    var title    = S_pdfFile ? S_pdfFile.name.replace(/\.pdf$/i, '') : '공유 일정';
    var now      = new Date();
    var pad      = function (n) { return String(n).padStart(2, '0'); };
    var stamp    = now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) +
                   '_' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    var filename = 'shares/share_' + stamp + '.html';
    var pageUrl  = CONFIG.baseUrl.replace(/\/$/, '') + '/' + filename;

    try {
      var html = buildSharePageHtml(selected, title, now.toISOString());
      var encoded = btoa(unescape(encodeURIComponent(html)));

      var apiUrl = 'https://api.github.com/repos/' + CONFIG.githubOwner + '/' +
                   CONFIG.githubRepo + '/contents/' + filename;

      var res = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + CONFIG.githubToken,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github+json',
        },
        body: JSON.stringify({
          message: 'share: ' + title + ' (' + selected.length + '개 일정)',
          content: encoded,
        }),
      });

      if (!res.ok) {
        var err = await res.json();
        throw new Error((err.message || 'GitHub API 오류 ' + res.status));
      }

      $('share-url-warning').hidden = true;
      $('share-url-modal-input').value  = pageUrl;
      $('share-url-open-btn').href      = pageUrl;
      $('share-url-event-count').textContent =
        selected.length + '개 일정 포함 · GitHub Pages 반영까지 약 1~2분 소요';

      openModal('share-url-modal');

      var entry = {
        id:       genId(),
        title:    title,
        sharedAt: now.toISOString(),
        count:    selected.length,
        url:      pageUrl,
        filename: filename,
      };
      CONFIG.shareHistory.unshift(entry);
      if (CONFIG.shareHistory.length > 100) CONFIG.shareHistory = CONFIG.shareHistory.slice(0, 100);
      persistShareHistory();

    } catch (e) {
      toast('공유 페이지 생성 실패: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '📤 선택 일정 공유';
    }
  }

  function buildSharePageHtml(events, title, sharedAt) {
    var DEPT_COLORS = {
      '임원':'#1A237E','기획처':'#4285F4','행정관리처':'#0288D1','교육지원처':'#00897B',
      '입학처':'#558B2F','항공정비계열':'#F57F17','스마트안전진단계열':'#E65100',
      '항공관광계열':'#AD1457','항공보안계열':'#6A1B9A','국방경찰계열':'#283593',
      '기종교육원':'#00695C','무인항공교육원':'#2E7D32','비행교육원':'#37474F',
      '온라인평생교육원':'#5D4037','기타':'#EA4335'
    };

    function toGCalUrl(ev) {
      var s = new Date(ev.startDateTime).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
      var e = new Date(ev.endDateTime).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
      var details = [ev.description || '', ev.department ? '[부서: ' + ev.department + ']' : ''].filter(Boolean).join('\n');
      return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
        '&text=' + encodeURIComponent(ev.title) +
        '&dates=' + s + '/' + e +
        '&details=' + encodeURIComponent(details);
    }

    function fmtDt(iso) {
      var d = new Date(iso);
      var days = ['일','월','화','수','목','금','토'];
      var p = function(n){return String(n).padStart(2,'0');};
      return d.getFullYear() + '.' + p(d.getMonth()+1) + '.' + p(d.getDate()) +
             '(' + days[d.getDay()] + ') ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    var items = events.map(function(ev, idx) {
      var color = DEPT_COLORS[ev.department] || DEPT_COLORS['기타'];
      var s = new Date(ev.startDateTime).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
      var e2 = new Date(ev.endDateTime).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
      var details = [ev.description || '', ev.department ? '[부서: ' + ev.department + ']' : ''].filter(Boolean).join('\\n');
      var timeStr = fmtDt(ev.startDateTime) + ' ~ ' + fmtDt(ev.endDateTime);
      var dataAttrs = ' data-s="' + s + '" data-e="' + e2 + '" data-title="' + ev.title.replace(/"/g,'&quot;') + '" data-details="' + details.replace(/"/g,'&quot;') + '"';
      return '<a href="#" class="ev-item" onclick="openGcal(this,event)"' + dataAttrs + '>' +
        '<span class="ev-dot" style="background:' + color + '"></span>' +
        '<span class="ev-body">' +
          '<span class="ev-title">' + ev.title + '</span>' +
          '<span class="ev-time">' + timeStr + '</span>' +
        '</span>' +
      '</a>';
    }).join('');

    var d = new Date(sharedAt);
    var sharedLabel = d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0');

    return '<!DOCTYPE html>\n<html lang="ko">\n<head>\n' +
      '<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width,initial-scale=1.0">\n' +
      '<title>ASEA 일정 공유 — ' + title + '</title>\n' +
      '<style>\n' +
      '*{box-sizing:border-box;margin:0;padding:0}\n' +
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f7fa;color:#1a1a2e;min-height:100vh}\n' +
      'header{background:#fff;border-bottom:1px solid #e0e4ef;padding:14px 20px;display:flex;align-items:center;gap:10px;box-shadow:0 1px 4px rgba(0,0,0,.06)}\n' +
      'header h1{font-size:16px;font-weight:700;line-height:1.3}\n' +
      '.meta{margin-left:auto;font-size:12px;color:#999;white-space:nowrap}\n' +
      '.container{max-width:640px;margin:0 auto;padding:20px 16px 60px}\n' +
      '.guide{font-size:14px;color:#444;line-height:1.7;margin-bottom:20px;padding:14px 16px;background:#fff;border-radius:10px;border:1px solid #e0e4ef}\n' +
      '.ev-item{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;background:#fff;border-radius:8px;border:1px solid #e0e4ef;margin-bottom:8px;text-decoration:none;color:inherit;transition:background 150ms}\n' +
      '.ev-item:active{background:#eef3ff}\n' +
      '.ev-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;margin-top:5px}\n' +
      '.ev-body{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0}\n' +
      '.ev-title{font-size:14px;font-weight:600;color:#1a73e8;word-break:keep-all;line-height:1.4}\n' +
      '.ev-time{font-size:12px;color:#888}\n' +
      '</style>\n' +
      '<script>\n' +
      'function openGcal(el,e){e.preventDefault();' +
        'var s=el.dataset.s,en=el.dataset.e,t=el.dataset.title,d=el.dataset.details;' +
        'var q="action=TEMPLATE&text="+encodeURIComponent(t)+"&dates="+s+"/"+en+"&details="+encodeURIComponent(d);' +
        'var isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);' +
        'if(isMobile){' +
          'var isAndroid=/Android/i.test(navigator.userAgent);' +
          'if(isAndroid){' +
            'var intentUrl="intent://calendar.google.com/calendar/r/eventedit?"+q+"#Intent;scheme=https;package=com.google.android.calendar;S.browser_fallback_url="+encodeURIComponent("https://calendar.google.com/calendar/r/eventedit?"+q)+";end";' +
            'location.href=intentUrl;' +
          '}else{' +
            'location.href="https://calendar.google.com/calendar/r/eventedit?"+q;' +
          '}' +
        '}else{' +
          'window.open("https://calendar.google.com/calendar/render?"+q,"_blank");' +
        '}' +
      '}\n' +
      '</script>\n' +
      '</head>\n<body>\n' +
      '<header><span style="font-size:20px">📅</span>' +
      '<h1>ASEA 일정 공유<br><span style="font-weight:400;font-size:13px;color:#666">' + title + '</span></h1>' +
      '<span class="meta">' + sharedLabel + ' · ' + events.length + '개</span></header>\n' +
      '<div class="container">\n' +
      '<div class="guide">아래 일정에서 원하시는 일정을 개별적으로 선택하실 수 있습니다.<br>일정을 선택하시면 구글 캘린더에 개별적으로 추가할 수 있습니다.</div>\n' +
      items + '\n</div>\n</body>\n</html>';
  }

  function renderShareHistory() {
    var listEl = $('share-history-list');
    if (!CONFIG.shareHistory.length) {
      listEl.innerHTML = '<p class="empty-state">공유 이력이 없습니다.</p>';
      return;
    }
    listEl.innerHTML = '';
    CONFIG.shareHistory.forEach(function (h) {
      var item = document.createElement('div');
      item.className = 'extract-history-item';
      item.innerHTML =
        '<div class="extract-history-info">' +
          '<div class="extract-history-filename">🔗 ' + h.title + '</div>' +
          '<div class="extract-history-meta">' +
            formatDate(h.sharedAt) + ' · ' + h.count + '개 일정' +
          '</div>' +
          '<div class="share-hist-url">' + h.url + '</div>' +
        '</div>' +
        '<div class="extract-history-actions">' +
          '<button class="btn btn-secondary btn-sm sh-copy-btn">복사</button>' +
          '<a class="btn btn-ghost btn-sm" href="' + h.url + '" target="_blank">열기</a>' +
          '<button class="btn btn-ghost btn-sm sh-del-btn" style="color:#c0392b">삭제</button>' +
        '</div>';

      item.querySelector('.sh-copy-btn').addEventListener('click', function () {
        navigator.clipboard.writeText(h.url).then(function () { toast('URL이 복사됐습니다.', 'success'); });
      });
      item.querySelector('.sh-del-btn').addEventListener('click', function () {
        CONFIG.shareHistory = CONFIG.shareHistory.filter(function (x) { return x.id !== h.id; });
        persistShareHistory();
        renderShareHistory();
      });

      listEl.appendChild(item);
    });
  }

  function saveExtractState() {
    if (!S.extractedEvents || S.extractedEvents.length === 0) {
      toast('저장할 일정이 없습니다.', 'error'); return;
    }

    // 현재 선택된 항목 인덱스 수집
    var checkedIndices = [];
    document.querySelectorAll('.extract-event-check input').forEach(function (cb, i) {
      if (cb.checked) checkedIndices.push(i);
    });

    // 현재 캘린더명
    var calSel = $('extract-target-calendar');
    var calendarId   = calSel ? calSel.value : '';
    var calendarName = calSel && calSel.selectedOptions[0] ? calSel.selectedOptions[0].text : '';

    // 현재 등록 방식
    var modeEl = document.querySelector('input[name="extract-mode"]:checked');
    var registerMode = modeEl ? modeEl.value : 'continuous';

    // 파일명: 이전 AI 추출 이력에서 가져오거나 기본값
    var lastHist = CONFIG.extractHistory.find(function (h) { return h.events === S.extractedEvents; });
    var filename = (lastHist && lastHist.filename) || (S_pdfFile ? S_pdfFile.name : '수동 저장');

    var entry = {
      id:           genId(),
      filename:     filename,
      extractedAt:  new Date().toISOString(),
      count:        S.extractedEvents.length,
      events:       JSON.parse(JSON.stringify(S.extractedEvents)), // 깊은 복사
      checkedIndices: checkedIndices,
      calendarId:   calendarId,
      calendarName: calendarName,
      registerMode: registerMode,
      savedManually: true,
    };

    CONFIG.extractHistory.unshift(entry);
    if (CONFIG.extractHistory.length > 50) CONFIG.extractHistory = CONFIG.extractHistory.slice(0, 50);
    persistExtractHistory();
    toast('현재 상태가 추출 이력에 저장되었습니다.', 'success');
  }

  function renderExtractHistory() {
    var listEl = $('extract-history-list');
    if (!CONFIG.extractHistory.length) {
      listEl.innerHTML = '<p class="empty-state">추출 이력이 없습니다.</p>';
      return;
    }
    listEl.innerHTML = '';
    CONFIG.extractHistory.forEach(function (h) {
      var item = document.createElement('div');
      item.className = 'extract-history-item';
      var modeBadge = h.registerMode === 'split'
        ? '<span class="hist-badge">✂️ 분리</span>'
        : (h.registerMode === 'continuous' ? '<span class="hist-badge">📅 연속</span>' : '');
      var calBadge = h.calendarName
        ? '<span class="hist-badge">🗓 ' + h.calendarName + '</span>' : '';
      var savedBadge = h.savedManually
        ? '<span class="hist-badge hist-badge-saved">💾 수동저장</span>' : '';

      item.innerHTML =
        '<div class="extract-history-info">' +
          '<div class="extract-history-filename">📄 ' + h.filename + ' ' + savedBadge + '</div>' +
          '<div class="extract-history-meta">' +
            formatDate(h.extractedAt) + ' · ' + h.count + '개 일정 ' + calBadge + ' ' + modeBadge +
          '</div>' +
        '</div>' +
        '<div class="extract-history-actions">' +
          '<button class="btn btn-secondary btn-sm hist-load-btn">불러오기</button>' +
          '<button class="btn btn-ghost btn-sm hist-del-btn" style="color:#c0392b">삭제</button>' +
        '</div>';

      item.querySelector('.hist-load-btn').addEventListener('click', function () {
        S.extractedEvents = JSON.parse(JSON.stringify(h.events));

        // 추출 탭(메인)으로 전환
        document.querySelectorAll('#tab-extract .email-subtab').forEach(function (b) { b.classList.remove('active'); });
        document.querySelector('#tab-extract [data-etab="extract-main"]').classList.add('active');
        document.querySelectorAll('#tab-extract .email-subpanel').forEach(function (p) { p.hidden = true; });
        $('etab-extract-main').hidden = false;

        renderExtractedEvents(null);

        // 캘린더 복원
        if (h.calendarId) {
          var calSel = $('extract-target-calendar');
          if (calSel) {
            var opt = Array.from(calSel.options).find(function (o) { return o.value === h.calendarId; });
            if (opt) calSel.value = h.calendarId;
          }
        }

        // 등록 방식 복원
        if (h.registerMode) {
          var modeEl = document.querySelector('input[name="extract-mode"][value="' + h.registerMode + '"]');
          if (modeEl) modeEl.checked = true;
        }

        // 선택 상태 복원
        if (h.checkedIndices) {
          document.querySelectorAll('.extract-event-check input').forEach(function (cb, i) {
            var checked = h.checkedIndices.indexOf(i) !== -1;
            cb.checked = checked;
            cb.closest('.extract-event-card').classList.toggle('selected', checked);
          });
        }

        toast(h.count + '개 일정을 불러왔습니다.', 'success');
      });
      item.querySelector('.hist-del-btn').addEventListener('click', function () {
        CONFIG.extractHistory = CONFIG.extractHistory.filter(function (x) { return x.id !== h.id; });
        persistExtractHistory();
        renderExtractHistory();
      });

      listEl.appendChild(item);
    });
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

    var toCreate = selected;

    var ok = 0, fail = 0;
    for (var i = 0; i < toCreate.length; i++) {
      var ev = toCreate[i];
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
    if (CONFIG.geminiApiKey) $('setting-gemini-key').value = CONFIG.geminiApiKey;
    if (CONFIG.makeWebhookUrl) $('setting-make-webhook').value = CONFIG.makeWebhookUrl;
    if (CONFIG.githubToken) $('setting-github-token').value = CONFIG.githubToken;
    renderSettingsRecipients();
    renderDeptList();
    renderMyCalendarsList();
    renderSharedCalendars();
  }

  /* ── 내 캘린더 표시 설정 ─── */
  // Google Calendar 공식 11색 팔레트 (colorId: hex)
  var GCal_PALETTE = [
    { id: '1',  hex: '#D50000', name: '토마토'   },
    { id: '2',  hex: '#E67C73', name: '플라밍고' },
    { id: '3',  hex: '#F4511E', name: '탄제린'   },
    { id: '4',  hex: '#F6BF26', name: '바나나'   },
    { id: '5',  hex: '#33B679', name: '세이지'   },
    { id: '6',  hex: '#0B8043', name: '바질'     },
    { id: '7',  hex: '#039BE5', name: '피콕'     },
    { id: '8',  hex: '#3F51B5', name: '블루베리' },
    { id: '9',  hex: '#7986CB', name: '라벤더'   },
    { id: '10', hex: '#8E24AA', name: '포도'     },
    { id: '11', hex: '#616161', name: '그래파이트'},
  ];

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

      // 현재 colorId 또는 hex 색상으로 일치 팔레트 항목 찾기
      var currentId = cal.colorId || '';
      var currentHex = (cal.color || '#4285F4').toLowerCase();
      var matchedEntry = GCal_PALETTE.find(function (p) {
        return p.id === currentId || p.hex.toLowerCase() === currentHex;
      });
      var activeId = matchedEntry ? matchedEntry.id : '';

      // 팔레트 스와치 HTML
      var swatchesHtml = GCal_PALETTE.map(function (p) {
        var isActive = p.id === activeId;
        return '<button class="gcal-swatch' + (isActive ? ' active' : '') + '"' +
               ' data-color-id="' + p.id + '"' +
               ' data-hex="' + p.hex + '"' +
               ' title="' + p.name + '"' +
               ' style="background:' + p.hex + '">' +
               (isActive ? '✓' : '') +
               '</button>';
      }).join('');

      item.innerHTML =
        '<label class="my-cal-label">' +
          '<input type="checkbox"' + (cal.enabled !== false ? ' checked' : '') + '>' +
          '<span class="my-cal-name">' + cal.name + '</span>' +
        '</label>' +
        '<div class="gcal-palette">' + swatchesHtml + '</div>';

      var cb = item.querySelector('input[type="checkbox"]');
      cb.addEventListener('change', function () {
        CONFIG.selectedCalendars[i].enabled = cb.checked;
        persistSelectedCalendars();
      });

      item.querySelectorAll('.gcal-swatch').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var colorId = btn.dataset.colorId;
          var hex     = btn.dataset.hex;

          // UI 즉시 반영
          item.querySelectorAll('.gcal-swatch').forEach(function (b) {
            b.classList.remove('active');
            b.textContent = '';
          });
          btn.classList.add('active');
          btn.textContent = '✓';

          // 로컬 저장
          CONFIG.selectedCalendars[i].color   = hex;
          CONFIG.selectedCalendars[i].colorId = colorId;
          persistSelectedCalendars();

          // Google 서버에 hex 직접 반영
          try {
            await CalendarModule.patchCalendarColor(cal.id, hex);
            // Google 서버에서 실제 저장된 색상을 다시 읽어와 동기화
            await loadAndSyncCalendars();
            renderMyCalendarsList();
            renderCalendar();
            toast(cal.name + ' 색상이 구글 캘린더에 반영되었습니다.', 'success');
          } catch (e) {
            toast('구글 캘린더 색상 동기화 실패: ' + e.message, 'error');
          }
        });
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

    $('save-api-key-btn').addEventListener('click', async function () {
      var key = $('setting-api-key').value.trim();
      if (!key) { toast('API 키를 입력하세요.', 'error'); return; }
      CONFIG.anthropicApiKey = key;
      try { localStorage.setItem(CONFIG.storageKeys.anthropicApiKey, key); } catch (e) {}
      toast('Claude API 키가 저장되었습니다.', 'success');
      saveSettingsToCloud(true);
    });

    $('save-gemini-key-btn').addEventListener('click', async function () {
      var key = $('setting-gemini-key').value.trim();
      CONFIG.geminiApiKey = key;
      try { localStorage.setItem(CONFIG.storageKeys.geminiApiKey, key || ''); } catch (e) {}
      toast(key ? 'Gemini API 키가 저장되었습니다.' : 'Gemini API 키가 삭제되었습니다.', 'success');
      saveSettingsToCloud(true);
    });

    $('cloud-save-settings-btn').addEventListener('click', async function () {
      var btn = $('cloud-save-settings-btn');
      btn.disabled = true; btn.textContent = '저장 중...';
      await saveSettingsToCloud();
      btn.disabled = false; btn.textContent = '☁️ 클라우드에 저장';
    });

    $('cloud-sync-now-btn').addEventListener('click', async function () {
      var btn = $('cloud-sync-now-btn');
      btn.disabled = true; btn.textContent = '동기화 중...';
      await syncHistoryOnLogin();
      renderExtractHistory();
      renderShareHistory();
      toast('☁️ 이력 동기화 완료', 'success');
      btn.disabled = false; btn.textContent = '🔄 이력 지금 동기화';
    });

    $('save-github-token-btn').addEventListener('click', async function () {
      var token = $('setting-github-token').value.trim();
      CONFIG.githubToken = token;
      try { localStorage.setItem(CONFIG.storageKeys.githubToken, token); } catch (e) {}
      toast(token ? 'GitHub Token이 저장되었습니다.' : 'GitHub Token이 삭제되었습니다.', 'success');
      saveSettingsToCloud(true);
    });

    $('save-make-webhook-btn').addEventListener('click', async function () {
      var url = $('setting-make-webhook').value.trim();
      if (url && !url.startsWith('https://hook.')) {
        toast('올바른 Make.com 웹훅 URL을 입력하세요.', 'error'); return;
      }
      CONFIG.makeWebhookUrl = url;
      try { localStorage.setItem(CONFIG.storageKeys.makeWebhookUrl, url); } catch (e) {}
      toast(url ? 'Make.com 웹훅 URL이 저장되었습니다.' : '웹훅 URL이 삭제되었습니다.', 'success');
      saveSettingsToCloud(true);
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
    initExtractEditModal();
    initShareUrlModal();
    initDeptModal();
    initSettings();
    initModalHandlers();
    if (typeof WorkModule !== 'undefined') WorkModule.initWorkModule();
  }

  /* ═══════════════════════════════════════════════════════════
     자동 로그인 시도 (Google GIS silent token request)
     — 브라우저에 활성 Google 세션이 있으면 클릭 없이 자동 로그인
  ═══════════════════════════════════════════════════════════ */
  function tryAutoLogin() {
    // Google GIS 스크립트 로드 후 1.5초 내 silent request 시도
    var MAX_WAIT = 1500;
    var started  = Date.now();
    var interval = setInterval(function () {
      if (typeof Auth !== 'undefined' && Auth.isLoggedIn && !Auth.isLoggedIn()) {
        try {
          Auth.login(); // prompt:'' → 이미 로그인 세션 있으면 팝업 없이 토큰 반환
        } catch (e) {}
        clearInterval(interval);
      } else if (Date.now() - started > MAX_WAIT || (typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn())) {
        clearInterval(interval);
      }
    }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init();
      // 저장된 토큰 먼저 복원 시도 → 실패 시 silent GIS 요청
      if (!Auth.tryRestoreSession()) tryAutoLogin();
    });
  } else {
    init();
    if (!Auth.tryRestoreSession()) tryAutoLogin();
  }

})();
