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
    editCalId:       null,   // 수정 대상 이벤트의 원래 캘린더 ID
    editCalendars:   [],     // 수정 시 선택된 캘린더 목록 [{id,name,color}]
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

  var _ctxEv = null; // 우클릭 대상 이벤트
  var _ctxOpenedAt = 0;   // 컨텍스트 메뉴 오픈 시각(직후 클릭 닫힘 방지)
  var _lpFired = false;   // long-press로 메뉴를 띄웠는지(직후 클릭 억제)

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
      // 모달 배경 클릭 시 닫기 (event-modal만)
      var evModal = $('event-modal');
      if (evModal && !evModal.hidden && e.target === evModal) {
        evModal.hidden = true;
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal:not([hidden])').forEach(function (m) {
          m.hidden = true;
        });
      }
    });

    // 모바일 이벤트 모달 틴더-스타일 스와이프 내비게이션
    (function () {
      var _sx = 0, _sy = 0, _cx = 0, _cy = 0;
      var _active = false, _card = null;
      var THRESH = 80;

      function _sortedEvents() {
        return (S.events || []).slice().sort(function (a, b) {
          var ta = a.start.dateTime ? new Date(a.start.dateTime).getTime() : new Date(a.start.date).getTime();
          var tb = b.start.dateTime ? new Date(b.start.dateTime).getTime() : new Date(b.start.date).getTime();
          return ta - tb;
        });
      }

      function _navigate(offset) {
        var curId = S.editEventId;
        if (!curId) return false;
        var sorted = _sortedEvents();
        var idx = sorted.findIndex(function (ev) { return ev.id === curId; });
        if (idx === -1) return false;
        var ni = idx + offset;
        if (ni < 0 || ni >= sorted.length) return false;
        openEventModal(sorted[ni]);
        return true;
      }

      function _snapBack() {
        if (!_card) return;
        _card.style.transition = 'transform .3s cubic-bezier(.25,.46,.45,.94), opacity .3s';
        _card.style.transform = '';
        _card.style.opacity = '';
        setTimeout(function () { if (_card) { _card.style.transition = ''; } }, 320);
      }

      function _flyOut(tx, ty, rot, cb) {
        if (!_card) return;
        _card.style.transition = 'transform .28s ease-in, opacity .22s ease-in';
        _card.style.transform = 'translateX(' + tx + ') translateY(' + ty + ') rotate(' + rot + 'deg)';
        _card.style.opacity = '0';
        var c = _card;
        setTimeout(function () {
          c.style.transition = ''; c.style.transform = ''; c.style.opacity = '';
          if (cb) cb();
        }, 290);
      }

      document.addEventListener('touchstart', function (e) {
        var evModal = $('event-modal');
        if (!evModal || evModal.hidden) return;
        _card = evModal.querySelector('.modal-dialog');
        if (!_card || !_card.contains(e.target)) { _card = null; return; }
        _sx = e.touches[0].clientX;
        _sy = e.touches[0].clientY;
        _cx = 0; _cy = 0; _active = true;
        _card.style.transition = 'none';
        _card.style.willChange = 'transform, opacity';
      }, { passive: true });

      document.addEventListener('touchmove', function (e) {
        if (!_active || !_card) return;
        _cx = e.touches[0].clientX - _sx;
        _cy = e.touches[0].clientY - _sy;
        var isUpward = _cy < -20 && Math.abs(_cy) > Math.abs(_cx) * 1.2;
        if (isUpward) {
          var scale = 1 + _cy * 0.0008;
          _card.style.transform = 'translateY(' + _cy + 'px) scale(' + Math.max(scale, 0.7) + ')';
          _card.style.opacity = String(Math.max(0, 1 + _cy / 200));
        } else {
          var rot = _cx * 0.06;
          _card.style.transform = 'translateX(' + _cx + 'px) rotate(' + rot + 'deg)';
          _card.style.opacity = String(Math.max(0, 1 - Math.abs(_cx) / 350));
        }
      }, { passive: true });

      document.addEventListener('touchend', function () {
        if (!_active || !_card) return;
        _active = false;
        var dx = _cx, dy = _cy;
        var isUpward = dy < -THRESH && Math.abs(dy) > Math.abs(dx) * 1.2;

        if (isUpward) {
          _flyOut('0', '-130vh', 0, function () {
            var evModal = $('event-modal');
            if (evModal) evModal.hidden = true;
          });
        } else if (dx > THRESH) {
          // 오른쪽 스와이프 → 다음 일정
          _flyOut('120vw', '0', 20, function () {
            if (!_navigate(1)) {
              var evModal = $('event-modal');
              if (evModal) evModal.hidden = true;
            }
          });
        } else if (dx < -THRESH) {
          // 왼쪽 스와이프 → 이전 일정
          _flyOut('-120vw', '0', -20, function () {
            if (!_navigate(-1)) {
              var evModal = $('event-modal');
              if (evModal) evModal.hidden = true;
            }
          });
        } else {
          _snapBack();
        }
        _card = null;
      }, { passive: true });
    })();
  }

  /* ═══════════════════════════════════════════════════════════
     탭 라우터
  ═══════════════════════════════════════════════════════════ */
  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      var active = btn.dataset.tab === name;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      /* 모바일: 활성 탭이 가로 스크롤 화면에 보이도록 */
      if (active && btn.scrollIntoView) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    });
    // 하단 탭 활성화 동기화 (가로 스크롤 12탭)
    document.querySelectorAll('.bnav-btn[data-tab]').forEach(function (btn) {
      var isActive = btn.dataset.tab === name;
      btn.classList.toggle('active', isActive);
      // 활성 탭을 뷰 중앙으로 스크롤
      if (isActive && btn.scrollIntoView) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    });

    document.querySelectorAll('.tab-panel').forEach(function (p) {
      var active = p.id === 'tab-' + name;
      p.classList.toggle('active', active);
      p.hidden = !active;
    });
    // 탭 전환 시 스크롤 TOP 리셋
    var activePanel = document.getElementById('tab-' + name);
    if (activePanel) activePanel.scrollTop = 0;
    S.tab = name;
    if (name === 'calendar')   renderCalendar();
    if (name === 'weekly-hub') { syncWeeklyHubFiles(); }
    if (name === 'report') { if (typeof ReportModule !== 'undefined' && ReportModule.init) ReportModule.init(); }
    if (name === 'promo')  { if (typeof PromoModule  !== 'undefined' && PromoModule.init)  PromoModule.init();  }
    if (name === 'hr')     { if (typeof HRModule !== 'undefined' && HRModule.init) { HRModule.init(); } if (typeof HRSubTab !== 'undefined') HRSubTab.show('entry'); }
    if (name === 'zoom')   { if (typeof MeetModule   !== 'undefined' && MeetModule.init)   MeetModule.init();   }
    if (name === 'help')   { if (typeof HelpModule   !== 'undefined' && HelpModule.init)   HelpModule.init();   }
    if (name === 'budget') { if (typeof BudgetModule !== 'undefined' && BudgetModule.renderTab) BudgetModule.renderTab(); }
    if (name === 'draft')  { if (typeof DraftModule  !== 'undefined' && DraftModule.renderTab)  DraftModule.renderTab(); }
    if (name === 'survey') { if (typeof SurveyModule  !== 'undefined' && SurveyModule.renderTab)  SurveyModule.renderTab(); }
    if (name === 'qrcard') { if (typeof QRCardModule !== 'undefined' && QRCardModule.renderTab) QRCardModule.renderTab(); }
    if (name === 'email')      renderEmailTab();
    if (name === 'settings')   renderSettingsTab();
    if (name === 'extract')    renderExtractTab();
    if (name === 'workorder')    initWorkOrderTab();
    if (name === 'checkinmgmt')  initCheckinMgmtTab();
    if (name === 'sms' && typeof SmsModule !== 'undefined') SmsModule.initSmsTab();
    // 직원관리 탭: 캐시가 있으면 즉시 렌더, 없으면 placeholder (수동 불러오기 버튼 안내)
    if (name === 'work' && typeof WorkModule !== 'undefined') WorkModule.showHrPlaceholderOrCache();
    // 게시판
    if (name === 'board' && typeof BoardModule !== 'undefined') BoardModule.onTabOpen();
    // 관리자 패널
    if (name === 'admin' && typeof AdminModule !== 'undefined') AdminModule.onTabOpen();
    // 사용자 색상 설정 탭 열릴 때 재렌더
    if (name === 'settings' && typeof UserSettingsModule !== 'undefined') UserSettingsModule.renderColorSettings();
  }

  function initTabs() {
    // 상단 탭 (데스크톱)
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
    });

    // 하단 탭 (모바일 가로 스크롤 12탭)
    document.querySelectorAll('.bnav-btn[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.dataset.tab);
      });
    });

    // PC 탭 내비 마우스 드래그 스크롤
    initNavDrag(document.querySelector('.desktop-tab-nav'));
  }

  /* ─────────────────────────────────────────────────────────────
     PC 탭 내비 — 마우스 드래그 스크롤
     · mousedown → 드래그 시작, mousemove → scrollLeft 이동
     · 드래그 거리가 짧으면(< 6px) 클릭으로 처리 (탭 전환)
     · cursor: grab / grabbing 시각 피드백
  ──────────────────────────────────────────────────────────────── */
  function initNavDrag(nav) {
    if (!nav) return;
    var isDown    = false;
    var startX    = 0;
    var scrollStart = 0;
    var dragged   = false;     // 실제 드래그가 발생했는지

    nav.style.cursor = 'grab';

    nav.addEventListener('mousedown', function (e) {
      // 버튼 자체의 좌클릭만 처리
      if (e.button !== 0) return;
      isDown      = true;
      dragged     = false;
      startX      = e.pageX - nav.offsetLeft;
      scrollStart = nav.scrollLeft;
      nav.style.cursor = 'grabbing';
      nav.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', function (e) {
      if (!isDown) return;
      var x    = e.pageX - nav.offsetLeft;
      var walk = x - startX;           // 이동 거리
      if (Math.abs(walk) > 4) dragged = true;
      nav.scrollLeft = scrollStart - walk;
    });

    document.addEventListener('mouseup', function () {
      if (!isDown) return;
      isDown = false;
      nav.style.cursor    = 'grab';
      nav.style.userSelect = '';
    });

    // 드래그 중이면 클릭 이벤트 억제 (탭 전환 방지)
    nav.addEventListener('click', function (e) {
      if (dragged) {
        e.stopImmediatePropagation();
        dragged = false;
      }
    }, true);   // capture 단계에서 가로채야 tab-btn click 전에 처리

    // 휠로도 가로 스크롤 (Shift 없이도)
    nav.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        nav.scrollLeft += e.deltaY * 0.8;
      }
    }, { passive: false });
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
          if (typeof WorkModule    !== 'undefined') WorkModule.onLogin(S.userEmail);
          // 관리자 모듈 — 메뉴/기능 가시성 적용
          if (typeof AdminModule   !== 'undefined') AdminModule.onLogin();
          // 게시판 — 클라우드 동기화 후 미읽은 전사알림 팝업 표시
          if (typeof BoardModule   !== 'undefined') BoardModule.syncFromCloud().then(function() {
            BoardModule.checkAndShowNotices(S.userEmail);
          });
          // 브라우저 알림 권한 요청 (게시판 전사알림용)
          if (typeof BoardModule   !== 'undefined') BoardModule.requestNotifPerm(function(){});
          // 사용자 색상 설정 적용
          if (typeof UserSettingsModule !== 'undefined') UserSettingsModule.apply();

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
        // 로그인 시 누락된 시트 자동 생성 (시설·차량·강의실·기관 등)
        if (typeof SheetsModule !== 'undefined' && SheetsModule.initSheets) {
          SheetsModule.initSheets().catch(function (e) {
            console.warn('[ASEA] initSheets 자동 실행 실패:', e);
          });
        }
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

    // 관리자 최초 등록 버튼
    var bootstrapBtn = document.getElementById('admin-bootstrap-btn');
    if (bootstrapBtn) {
      bootstrapBtn.addEventListener('click', function () {
        // 관리자는 코드 고정(ADMIN_EMAILS) — 자가 등록 차단
        if (!(window.AdminModule && AdminModule.isAdmin && AdminModule.isAdmin())) {
          toast('관리자 권한이 없습니다. 관리자에게 문의하세요.', 'error'); return;
        }
        var email = S.userEmail || localStorage.getItem('asea_user_email') || '';
        if (!email) { toast('로그인된 계정 이메일을 찾을 수 없습니다.', 'error'); return; }
        try {
          var roles = JSON.parse(localStorage.getItem('asea_user_roles') || '{}');
          roles[email.toLowerCase()] = 'admin';
          localStorage.setItem('asea_user_roles', JSON.stringify(roles));
          document.getElementById('admin-bootstrap-card').hidden = true;
          if (window.AdminModule) {
            AdminModule.applyMenuVisibility();
            AdminModule.applyFeatVisibility();
          }
          document.getElementById('admin-bootstrap-status').textContent = '✅ 관리자로 등록되었습니다. 페이지를 새로고침하면 관리자 탭이 표시됩니다.';
          toast('관리자로 등록되었습니다!', 'success');
        } catch (e) { toast('등록 실패: ' + e.message, 'error'); }
      });
    }
  }

  function _checkAdminBootstrap() {
    var card = document.getElementById('admin-bootstrap-card');
    if (!card) return;
    // 관리자는 코드에 고정(ADMIN_EMAILS) — 자가 등록 카드는 항상 숨김
    card.hidden = true;
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
      if (S.userEmail) localStorage.setItem('asea_user_email', S.userEmail);
      $('user-email').textContent = S.userEmail;
      $('settings-user-email').textContent = S.userEmail || CONFIG.senderEmail;
      _checkAdminBootstrap();
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

  // ── 다른 모듈에서도 Drive 동기화를 쓸 수 있도록 공개 ──────────
  window.AppDriveSync = {
    upsert: driveUpsert,
    read:   driveRead
  };

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
  function _rangeFor(d, view) {
    if (view === 'month') {
      return {
        min: new Date(d.getFullYear(), d.getMonth(), -6).toISOString(),
        max: new Date(d.getFullYear(), d.getMonth() + 1, 8).toISOString(),
      };
    }
    var day = d.getDay();
    var sun = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    return { min: sun.toISOString(), max: new Date(sun.getTime() + 7 * 86400000).toISOString() };
  }
  function _calsToLoad() {
    var enabled = CONFIG.selectedCalendars.filter(function (c) { return c.enabled !== false; });
    return enabled.length ? enabled : [{ id: 'primary', name: '기본 캘린더', color: '#1A73E8' }];
  }
  // 지정 기간의 이벤트를 모든 캘린더에서 병렬 조회
  function _fetchRange(timeMin, timeMax) {
    var tasks = [];
    _calsToLoad().forEach(function (cal) {
      tasks.push(
        CalendarModule.listEvents(cal.id, timeMin, timeMax).then(function (evts) {
          evts.forEach(function (ev) { ev._calColor = cal.color; ev._calName = cal.name; ev._calId = cal.id; });
          return evts;
        }).catch(function () { return []; })
      );
    });
    CONFIG.sharedCalendars.forEach(function (sc) {
      var calId = extractCalendarId(sc.url);
      if (!calId) return;
      tasks.push(
        CalendarModule.listEvents(calId, timeMin, timeMax).then(function (sevts) {
          sevts.forEach(function (ev) { ev._calColor = sc.color || '#FBBC05'; ev._calName = sc.name; });
          return sevts;
        }).catch(function () { return []; })
      );
    });
    return Promise.all(tasks).then(function (results) {
      var all = []; results.forEach(function (r) { all = all.concat(r); }); return all;
    });
  }

  async function loadEvents() {
    if (!Auth.isLoggedIn()) return;
    var r = _rangeFor(S.viewDate, S.calView);
    S.events = await _fetchRange(r.min, r.max);
    _saveCalCache(S.events);
    _prefetchAdjacent();   // 인접 월 미리 캐시(백그라운드)
  }

  // 이전/다음 달을 백그라운드로 미리 조회해 캐시 → 월 이동 즉시 표시
  var _prefetchInFlight = {};
  function _prefetchAdjacent() {
    if (!Auth.isLoggedIn() || S.calView !== 'month') return;
    var base = S.viewDate;
    setTimeout(function () {
      [-1, 1].forEach(function (off) {
        var d = new Date(base.getFullYear(), base.getMonth() + off, 1);
        var key = 'asea_cal_cache_m_' + d.getFullYear() + '_' + d.getMonth();
        if (localStorage.getItem(key) || _prefetchInFlight[key]) return;
        _prefetchInFlight[key] = 1;
        var rg = _rangeFor(d, 'month');
        _fetchRange(rg.min, rg.max).then(function (evts) {
          try { localStorage.setItem(key, JSON.stringify(evts)); } catch (e) {}
          delete _prefetchInFlight[key];
        }).catch(function () { delete _prefetchInFlight[key]; });
      });
    }, 400);
  }

  /* 캘린더 이벤트 캐시(기기별) — 즉시 렌더용 */
  function _calCacheKey() {
    var d = S.viewDate;
    if (S.calView === 'month') return 'asea_cal_cache_m_' + d.getFullYear() + '_' + d.getMonth();
    var day = d.getDay(); var sun = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    return 'asea_cal_cache_w_' + sun.getFullYear() + '_' + sun.getMonth() + '_' + sun.getDate();
  }
  function _saveCalCache(evts) { try { localStorage.setItem(_calCacheKey(), JSON.stringify(evts)); } catch (e) {} }
  function _loadCalCache() { try { var v = localStorage.getItem(_calCacheKey()); return v ? JSON.parse(v) : null; } catch (e) { return null; } }

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
    updateCalendarTitle();
    // 1) 캐시(있으면)로 즉시 렌더 → 체감 즉시 표시
    var cached = _loadCalCache();
    if (cached) S.events = cached;
    renderLegend();
    if (S.calView === 'month') renderMonth(); else renderWeek();
    // 2) 서버에서 최신 이벤트 병렬 로드 후 갱신
    await loadEvents();
    renderLegend();
    if (S.calView === 'month') renderMonth(); else renderWeek();
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

  /* 이벤트 정렬: ① 하루종일 먼저 ② 시작 시간 오름차순 ③ 동시간 가나다순 */
  function sortEvents(arr) {
    return arr.slice().sort(function (a, b) {
      var aAllDay = !!a.start.date && !a.start.dateTime;
      var bAllDay = !!b.start.date && !b.start.dateTime;
      if (aAllDay !== bAllDay) return aAllDay ? -1 : 1;
      if (!aAllDay && !bAllDay) {
        var tA = new Date(a.start.dateTime).getTime();
        var tB = new Date(b.start.dateTime).getTime();
        if (tA !== tB) return tA - tB;
      }
      var sA = (a.summary || '').toLowerCase();
      var sB = (b.summary || '').toLowerCase();
      return sA < sB ? -1 : sA > sB ? 1 : 0;
    });
  }

  function eventsGroupedByDate(events) {
    var map = {};
    events.forEach(function (ev) {
      var dt  = evtStart(ev);
      var key = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate();
      (map[key] || (map[key] = [])).push(ev);
    });
    Object.keys(map).forEach(function (key) { map[key] = sortEvents(map[key]); });
    return map;
  }

  /* ── 멀티데이 이벤트 헬퍼 ─────────────────────────────────────── */
  function _evStartDay(ev) {
    if (ev.start.date) return new Date(ev.start.date + 'T00:00:00');
    var d = new Date(ev.start.dateTime);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function _evEndDay(ev) {
    /* Google API: end.date는 exclusive (end.date="2026-06-09"이면 08일까지)
       end.dateTime: 자정(00:00:00)이면 그 날 시작 전으로 처리, 아니면 다음날 자정 */
    if (ev.end.date) return new Date(ev.end.date + 'T00:00:00');
    var d = new Date(ev.end.dateTime);
    var midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (d.getTime() === midnight.getTime()) return midnight;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  function _isMultiDay(ev) {
    /* 2일 이상 걸치는 이벤트 */
    return _evEndDay(ev).getTime() - _evStartDay(ev).getTime() > 86400000;
  }
  function _buildMultiDayTracks(events, weekStart) {
    /* 각 이벤트에 startCol(0-6), endCol(1-7, exclusive), track 할당 */
    var weekT = weekStart.getTime();
    var items = events.map(function (ev) {
      var sT = _evStartDay(ev).getTime();
      var eT = _evEndDay(ev).getTime();
      return {
        ev:       ev,
        startCol: Math.max(0, Math.round((sT - weekT) / 86400000)),
        endCol:   Math.min(7, Math.round((eT - weekT) / 86400000))
      };
    }).filter(function (x) { return x.endCol > x.startCol; })
      .sort(function (a, b) {
        if (a.startCol !== b.startCol) return a.startCol - b.startCol;
        return (b.endCol - b.startCol) - (a.endCol - a.startCol);
      });
    var trackEnds = [];
    return items.map(function (item) {
      var t = 0;
      while (trackEnds[t] !== undefined && trackEnds[t] > item.startCol) t++;
      trackEnds[t] = item.endCol;
      return { ev: item.ev, startCol: item.startCol, endCol: item.endCol, track: t };
    });
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

    /* 단일일 이벤트만 evMap에 넣어 buildDayCell에 전달 */
    var multiDay  = S.events.filter(function (ev) { return _isMultiDay(ev); });
    var singleDay = S.events.filter(function (ev) { return !_isMultiDay(ev); });
    var evMap = eventsGroupedByDate(singleDay);

    var TRACK_H   = 22; /* 트랙당 픽셀 높이 */
    var DAY_NUM_H = 30; /* 날짜 숫자 영역 근사 높이 */
    var W7 = 100 / 7;  /* 7분의 1 너비(%) */

    for (var w = 0; w < 6; w++) {
      var wOff      = w * 7;
      var weekStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() + wOff);
      var weekEnd   = new Date(start.getFullYear(), start.getMonth(), start.getDate() + wOff + 7);

      /* 이 주에 걸치는 멀티데이 이벤트 트랙 계산 */
      var weekMulti = multiDay.filter(function (ev) {
        return _evStartDay(ev).getTime() < weekEnd.getTime() &&
               _evEndDay(ev).getTime()   > weekStart.getTime();
      });
      var tracked   = _buildMultiDayTracks(weekMulti, weekStart);
      var numTracks = tracked.length ? tracked.reduce(function (m, t) { return Math.max(m, t.track); }, 0) + 1 : 0;

      /* 주간 행 컨테이너 생성 (7열 그리드 + 절대위치 바용 기준) */
      var weekRow = document.createElement('div');
      weekRow.className = 'calendar-week-row';
      weekRow.style.setProperty('--num-tracks', String(numTracks));

      /* 7개 날짜 셀 추가 */
      for (var i = 0; i < 7; i++) {
        var cellDate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + wOff + i);
        weekRow.appendChild(buildDayCell(cellDate, d, today, evMap));
      }

      /* 멀티데이 바 렌더 */
      tracked.forEach(function (item) {
        var ev      = item.ev;
        var leftPct = item.startCol * W7;
        var wPct    = (item.endCol - item.startCol) * W7;
        var topPx   = DAY_NUM_H + item.track * TRACK_H + 2;

        /* 이 주 내에서 이벤트 시작/끝 여부 (모서리 둥글기용) */
        var evST    = _evStartDay(ev).getTime();
        var evET    = _evEndDay(ev).getTime();
        var isStart = evST >= weekStart.getTime();
        var isEnd   = evET <= weekEnd.getTime();

        var bar = document.createElement('div');
        bar.className = 'multiday-bar';
        bar.style.left   = leftPct.toFixed(3) + '%';
        bar.style.width  = 'calc(' + wPct.toFixed(3) + '% - 4px)';
        bar.style.top    = topPx + 'px';
        bar.style.borderRadius = (isStart ? '5px' : '0') + ' ' +
                                 (isEnd   ? '5px' : '0') + ' ' +
                                 (isEnd   ? '5px' : '0') + ' ' +
                                 (isStart ? '5px' : '0');
        if (ev._calColor) {
          bar.style.background = ev._calColor;
          /* 밝기 체크: 어두운 색상이면 흰색 텍스트 유지 */
        }

        var label = document.createElement('span');
        label.textContent = ev.summary || '(제목 없음)';
        bar.appendChild(label);

        bar.addEventListener('click', function (e) {
          e.stopPropagation();
          if (_lpFired) { _lpFired = false; return; }   // 길게 눌러 메뉴 띄운 직후 클릭 무시
          openEventModal(ev);
        });
        bar.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          e.stopPropagation();
          showEventContextMenu(ev, e.clientX, e.clientY);
        });

        /* ── 멀티데이 바 드래그&드롭 ── */
        (function(evRef) {
          var dur = ev.start.date
            ? (_evEndDay(evRef).getTime() - _evStartDay(evRef).getTime())
            : (new Date(evRef.end.dateTime) - new Date(evRef.start.dateTime));
          var dragInfo = { eventId: evRef.id, calId: evRef._calId || '',
            isAllDay: !!evRef.start.date, startTime: evRef.start.dateTime || '',
            duration: dur, summary: evRef.summary };

          bar.draggable = true;
          bar.addEventListener('dragstart', function(e) {
            e.dataTransfer.setData('text/plain', JSON.stringify(dragInfo));
            e.dataTransfer.effectAllowed = 'move';
            bar.classList.add('dragging');
            setTimeout(function() { document.body.classList.add('is-dragging-event'); }, 0);
          });
          bar.addEventListener('dragend', function() {
            bar.classList.remove('dragging');
            document.body.classList.remove('is-dragging-event');
            document.querySelectorAll('.calendar-day.drag-over').forEach(function(c) { c.classList.remove('drag-over'); });
          });
          /* 모바일 long-press: 집어들기 → 이동=드래그 / 안 움직이고 떼면=메뉴 */
          bar.addEventListener('touchstart', function(te) {
            var tx = te.touches[0]; _tcMX = tx.clientX; _tcMY = tx.clientY;
            _lpFired = false; _tcMoved = false;
            _tcTmr = setTimeout(function() {
              _tcTmr = null; _lpFired = true;
              _tcDI = dragInfo;
              _tcChip = bar;
              _tcGhost = bar.cloneNode(true);
              _tcGhost.style.cssText = 'position:fixed;opacity:.75;pointer-events:none;z-index:9999;width:' + bar.offsetWidth + 'px;left:' + (_tcMX - bar.offsetWidth / 2) + 'px;top:' + (_tcMY - 20) + 'px;border-radius:6px;';
              document.body.appendChild(_tcGhost);
              bar.style.opacity = '.3';
              document.body.classList.add('is-dragging-event');
              if (navigator.vibrate) navigator.vibrate(40);
            }, 500);
          }, { passive: true });
          bar.addEventListener('touchmove', function(te) {
            if (!_tcDI) { clearTimeout(_tcTmr); _tcTmr = null; return; }
            te.preventDefault();
            _tcMoved = true;
            var tx = te.touches[0];
            if (_tcGhost) { _tcGhost.style.left = (tx.clientX - _tcGhost.offsetWidth / 2) + 'px'; _tcGhost.style.top = (tx.clientY - 20) + 'px'; }
            document.querySelectorAll('.calendar-day.drag-over').forEach(function(c) { c.classList.remove('drag-over'); });
            var el2 = document.elementFromPoint(tx.clientX, tx.clientY);
            var dy = el2 ? el2.closest('.calendar-day') : null;
            if (dy) dy.classList.add('drag-over');
          }, { passive: false });
          bar.addEventListener('touchend', function(te) {
            clearTimeout(_tcTmr); _tcTmr = null;
            if (!_tcDI) return;
            var tx = te.changedTouches[0];
            if (_tcGhost) { try { document.body.removeChild(_tcGhost); } catch(e2) {} _tcGhost = null; }
            if (_tcChip) { _tcChip.style.opacity = ''; _tcChip = null; }
            document.body.classList.remove('is-dragging-event');
            document.querySelectorAll('.calendar-day.drag-over').forEach(function(c) { c.classList.remove('drag-over'); });
            if (_tcMoved) {
              var el2 = document.elementFromPoint(tx.clientX, tx.clientY);
              var dy = el2 ? el2.closest('.calendar-day') : null;
              if (dy && dy.dataset.date) {
                var pts = dy.dataset.date.split('-');
                var dropDate = new Date(parseInt(pts[0]), parseInt(pts[1]) - 1, parseInt(pts[2]));
                _moveEventToDate(dragInfo, dropDate);
              }
            } else {
              showEventContextMenu(ev, _tcMX, _tcMY);   // 움직임 없이 길게 → 메뉴
            }
            _tcDI = null;
          });
          bar.addEventListener('touchcancel', function() {
            clearTimeout(_tcTmr); _tcTmr = null;
            if (_tcGhost) { try { document.body.removeChild(_tcGhost); } catch(e2) {} _tcGhost = null; }
            if (_tcChip) { _tcChip.style.opacity = ''; _tcChip = null; }
            document.body.classList.remove('is-dragging-event');
            _tcDI = null;
          });
        })(ev);

        weekRow.appendChild(bar);
      });

      grid.appendChild(weekRow);
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

  function _moveEventToDate(info, targetDate) {
    var existingEv = S.events.find(function (e) { return e.id === info.eventId; });

    // Same-day guard: do nothing if the event is already on targetDate
    if (existingEv) {
      var rawStart = existingEv.start && (existingEv.start.date || (existingEv.start.dateTime && existingEv.start.dateTime.slice(0, 10)));
      if (rawStart) {
        var td = new Date(targetDate);
        var targetStr = td.getFullYear() + '-' +
          String(td.getMonth() + 1).padStart(2, '0') + '-' +
          String(td.getDate()).padStart(2, '0');
        if (rawStart === targetStr) return;
      }
    }

    var isRecurring = !!(existingEv && (
      (existingEv.recurrence && existingEv.recurrence.length) ||
      existingEv.recurringEventId
    ));

    if (isRecurring) {
      _openRecurMoveModal(info, targetDate, existingEv);
    } else {
      _executeMoveEvent(info, targetDate, existingEv, 'single');
    }
  }

  var _recurMoveState = null; // { info, targetDate, existingEv }

  function _openRecurMoveModal(info, targetDate, existingEv) {
    _recurMoveState = { info: info, targetDate: targetDate, existingEv: existingEv };
    var radios = document.querySelectorAll('input[name="recur-move-scope"]');
    radios.forEach(function(r) { r.checked = r.value === 'this'; });
    var descEl = document.getElementById('recur-move-desc');
    if (descEl) descEl.textContent = '"' + (info.summary || '일정') + '" 이동 범위를 선택하세요.';
    document.getElementById('recur-move-modal').hidden = false;
  }

  function initRecurMoveModal() {
    var modal   = document.getElementById('recur-move-modal');
    var confirm = document.getElementById('recur-move-confirm');
    var cancel  = document.getElementById('recur-move-cancel');
    var close   = document.getElementById('recur-move-close');
    if (!modal) return;

    function closeModal() { modal.hidden = true; _recurMoveState = null; }
    [cancel, close].forEach(function(el) { if (el) el.addEventListener('click', closeModal); });
    modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

    confirm.addEventListener('click', function() {
      var scopeEl = document.querySelector('input[name="recur-move-scope"]:checked');
      var scope = scopeEl ? scopeEl.value : 'this';
      modal.hidden = true;
      if (_recurMoveState) {
        _executeMoveEvent(
          _recurMoveState.info,
          _recurMoveState.targetDate,
          _recurMoveState.existingEv,
          scope
        );
        _recurMoveState = null;
      }
    });
  }

  function _executeMoveEvent(info, targetDate, existingEv, scope) {
    var y = targetDate.getFullYear();
    var m = pad(targetDate.getMonth() + 1);
    var d = pad(targetDate.getDate());

    var newStartField, newEndField;
    if (info.isAllDay) {
      var endDate = new Date(targetDate.getTime() + Number(info.duration));
      newStartField = { date: y + '-' + m + '-' + d };
      newEndField   = { date: endDate.getFullYear() + '-' + pad(endDate.getMonth() + 1) + '-' + pad(endDate.getDate()) };
    } else {
      var origStart = new Date(info.startTime);
      var newStart  = new Date(y + '-' + m + '-' + d + 'T' +
        pad(origStart.getHours()) + ':' + pad(origStart.getMinutes()) + ':00');
      var newEnd    = new Date(newStart.getTime() + Number(info.duration));
      newStartField = { dateTime: newStart.toISOString(), timeZone: 'Asia/Seoul' };
      newEndField   = { dateTime: newEnd.toISOString(),   timeZone: 'Asia/Seoul' };
    }

    var calId_str = info.calId || CONFIG.calendarId;
    var eventId   = info.eventId;

    if (typeof toast === 'function') toast('📅 일정 이동 중…', 'info');

    /* ── scope: 'this' ── 이번 일정만 이동 ─────────────────────
       반복 인스턴스 단일 수정은 PUT 전체교체 대신 PATCH를 사용해야 합니다.
       PUT은 body의 누락 필드를 clear하려다 400 Bad Request를 유발합니다.
       PATCH는 지정한 필드(start, end, summary)만 덮어쓰므로
       Google Calendar가 해당 인스턴스만 예외(override)로 처리합니다.
    ─────────────────────────────────────────────────────────── */
    if (scope === 'this') {
      // 반복 인스턴스인지 확인 (recurringEventId 있으면 인스턴스)
      var isInstance = !!(existingEv && existingEv.recurringEventId);

      if (isInstance) {
        // ✅ 올바른 방법: PATCH로 인스턴스 단일 수정
        var patchData = {
          summary: (existingEv && existingEv.summary) || info.summary || '',
          start:   newStartField,
          end:     newEndField
        };
        if (existingEv && existingEv.description) patchData.description = existingEv.description;
        if (existingEv && existingEv.colorId)     patchData.colorId     = existingEv.colorId;

        CalendarModule.patchEvent(calId_str, eventId, patchData)
          .then(function() {
            if (typeof toast === 'function') toast('✅ 이번 일정만 이동됐습니다.', 'success');
            // 로컬 캐시도 업데이트
            if (existingEv) { existingEv.start = newStartField; existingEv.end = newEndField; }
            renderCalendar();
          })
          .catch(function(err) {
            if (typeof toast === 'function') toast('❌ 이동 실패: ' + (err.message || err), 'error');
          });

      } else {
        // 루트 반복 이벤트를 직접 드래그한 경우 (드물지만 대비)
        // PUT 사용 시 recurrence 필드 반드시 포함
        var eventDataThis = {
          summary:    (existingEv && existingEv.summary)    || info.summary || '',
          description:(existingEv && existingEv.description)|| '',
          colorId:    (existingEv && existingEv.colorId)    || undefined,
          recurrence: (existingEv && existingEv.recurrence) || undefined,
          start: newStartField,
          end:   newEndField
        };
        Object.keys(eventDataThis).forEach(function(k) { if (eventDataThis[k] === undefined) delete eventDataThis[k]; });
        CalendarModule.updateEvent(calId_str, eventId, eventDataThis)
          .then(function() {
            if (typeof toast === 'function') toast('✅ 일정이 이동됐습니다.', 'success');
            if (existingEv) { existingEv.start = newStartField; existingEv.end = newEndField; }
            renderCalendar();
          })
          .catch(function(err) {
            if (typeof toast === 'function') toast('❌ 이동 실패: ' + (err.message || err), 'error');
          });
      }

    /* ── scope: 'all' ── 전체 반복 일정 이동 ──────────────────── */
    } else if (scope === 'all') {
      // 루트 이벤트 ID 사용 (인스턴스의 recurringEventId, 없으면 eventId 자체)
      var rootId = (existingEv && existingEv.recurringEventId) || eventId;
      var rootEv = S.events.find(function(e) { return e.id === rootId; }) || existingEv;
      var eventDataAll = {
        summary:    (rootEv && rootEv.summary)    || (existingEv && existingEv.summary)    || info.summary || '',
        description:(rootEv && rootEv.description)|| (existingEv && existingEv.description)|| '',
        colorId:    (rootEv && rootEv.colorId)    || (existingEv && existingEv.colorId)    || undefined,
        recurrence: (rootEv && rootEv.recurrence) || (existingEv && existingEv.recurrence) || undefined,
        start: newStartField,
        end:   newEndField
      };
      Object.keys(eventDataAll).forEach(function(k) { if (eventDataAll[k] === undefined) delete eventDataAll[k]; });
      CalendarModule.updateEvent(calId_str, rootId, eventDataAll)
        .then(function() {
          if (typeof toast === 'function') toast('✅ 전체 반복 일정이 이동됐습니다.', 'success');
          renderCalendar();
        })
        .catch(function(err) {
          if (typeof toast === 'function') toast('❌ 이동 실패: ' + (err.message || err), 'error');
        });

    /* ── scope: 'single' ── 반복 없는 단순 이벤트 이동 ────────── */
    } else if (scope === 'single') {
      var eventDataSingle = {
        summary:    (existingEv && existingEv.summary)    || info.summary || '',
        description:(existingEv && existingEv.description)|| '',
        colorId:    (existingEv && existingEv.colorId)    || undefined,
        start: newStartField,
        end:   newEndField
      };
      Object.keys(eventDataSingle).forEach(function(k) { if (eventDataSingle[k] === undefined) delete eventDataSingle[k]; });
      CalendarModule.updateEvent(calId_str, eventId, eventDataSingle)
        .then(function() {
          if (typeof toast === 'function') toast('✅ 일정이 이동됐습니다.', 'success');
          if (existingEv) { existingEv.start = newStartField; existingEv.end = newEndField; }
          renderCalendar();
        })
        .catch(function(err) {
          if (typeof toast === 'function') toast('❌ 이동 실패: ' + (err.message || err), 'error');
        });

    /* ── scope: 'following' ── 이 일정 이후 모두 이동 ─────────── */
    } else if (scope === 'following') {
      // ⚠️ UNTIL은 targetDate(새 위치)가 아닌 원본 인스턴스 날짜 기준이어야 함
      var origDate  = new Date(
        (existingEv && (existingEv.start.dateTime || existingEv.start.date)) || info.startTime
      );
      var dayBefore = new Date(origDate.getTime() - 86400000);
      var untilStr  = dayBefore.getFullYear() +
        pad(dayBefore.getMonth() + 1) +
        pad(dayBefore.getDate()) + 'T235959Z';

      // 루트 이벤트의 recurrence 가져오기
      var rootId3   = (existingEv && existingEv.recurringEventId) || eventId;
      var rootEv3   = S.events.find(function(e) { return e.id === rootId3; }) || existingEv;
      var origRecurrence = (rootEv3 && rootEv3.recurrence) ||
                           (existingEv && existingEv.recurrence) || [];

      // 기존 시리즈: UNTIL을 원본 날짜 전날로 잘라냄
      var truncatedRecurrence = origRecurrence.map(function(r) {
        if (r.indexOf('RRULE:') === 0) {
          return r.replace(/;?UNTIL=[^;]*/g, '').replace(/;?COUNT=[^;]*/g, '') + ';UNTIL=' + untilStr;
        }
        return r;
      });

      var origRrule   = origRecurrence.find(function(r) { return r.indexOf('RRULE:') === 0; }) || 'RRULE:FREQ=WEEKLY';
      var cleanRrule  = origRrule.replace(/;?UNTIL=[^;]*/g, '').replace(/;?COUNT=[^;]*/g, '');

      // 루트 이벤트 원본 start/end (인스턴스의 start/end가 아닌 루트 기준)
      var rootStart = (rootEv3 && rootEv3.start) || (existingEv && existingEv.start);
      var rootEnd   = (rootEv3 && rootEv3.end)   || (existingEv && existingEv.end);

      var oldEventData = {
        summary:    (rootEv3 && rootEv3.summary)    || (existingEv && existingEv.summary)    || info.summary || '',
        description:(rootEv3 && rootEv3.description)|| (existingEv && existingEv.description)|| '',
        colorId:    (rootEv3 && rootEv3.colorId)    || (existingEv && existingEv.colorId)    || undefined,
        recurrence: truncatedRecurrence.length ? truncatedRecurrence : undefined,
        start: rootStart,
        end:   rootEnd
      };
      Object.keys(oldEventData).forEach(function(k) { if (oldEventData[k] === undefined) delete oldEventData[k]; });

      var newEventData = {
        summary:    (existingEv && existingEv.summary)    || info.summary || '',
        description:(existingEv && existingEv.description)|| '',
        colorId:    (existingEv && existingEv.colorId)    || undefined,
        recurrence: [cleanRrule],
        start: newStartField,
        end:   newEndField
      };
      Object.keys(newEventData).forEach(function(k) { if (newEventData[k] === undefined) delete newEventData[k]; });

      CalendarModule.updateEvent(calId_str, rootId3, oldEventData)
        .then(function() {
          return CalendarModule.createEvent(calId_str, newEventData);
        })
        .then(function() {
          if (typeof toast === 'function') toast('✅ 이 일정 이후 모두 이동됐습니다.', 'success');
          renderCalendar();
        })
        .catch(function(err) {
          if (typeof toast === 'function') toast('❌ 이동 실패: ' + (err.message || err), 'error');
        });
    }
  }

  // 모바일 터치 드래그 상태
  var _tcDI = null, _tcTmr = null, _tcChip = null, _tcGhost = null, _tcMoved = false, _tcMX = 0, _tcMY = 0;

  function buildDayCell(cellDate, viewDate, today, evMap) {
    var el = document.createElement('div');
    el.className = 'calendar-day';
    var _yy = cellDate.getFullYear(), _mm = String(cellDate.getMonth()+1).padStart(2,'0'), _dd = String(cellDate.getDate()).padStart(2,'0');
    el.dataset.date = _yy + '-' + _mm + '-' + _dd;
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

    dayEvents.forEach(function (ev) {
      var chip = document.createElement('div');
      chip.className = 'event-chip ' + deptClass(ev.description);
      // 다중 캘린더 색상 우선 적용
      if (ev._calColor) {
        chip.style.borderLeftColor = ev._calColor;
        chip.style.background = ev._calColor + '22';
        chip.style.color = ev._calColor;
      }
      chip.title = ev.summary || '';
      // 시간 있는 이벤트는 시작 시간 앞에 표시
      if (ev.start.dateTime) {
        var st = new Date(ev.start.dateTime);
        var timeStr = pad(st.getHours()) + ':' + pad(st.getMinutes());
        var timeSpan = document.createElement('span');
        timeSpan.className = 'chip-time';
        timeSpan.textContent = timeStr;
        chip.appendChild(timeSpan);
        var titleSpan = document.createElement('span');
        titleSpan.className = 'chip-title';
        titleSpan.textContent = ev.summary || '(제목 없음)';
        chip.appendChild(titleSpan);
      } else {
        // 하루종일: 아이콘 + 제목
        var allDaySpan = document.createElement('span');
        allDaySpan.className = 'chip-allday';
        allDaySpan.textContent = '●';
        chip.appendChild(allDaySpan);
        var titleSpan2 = document.createElement('span');
        titleSpan2.className = 'chip-title';
        titleSpan2.textContent = ev.summary || '(제목 없음)';
        chip.appendChild(titleSpan2);
      }
      // 드래그앤드롭 설정
      chip.draggable = true;
      chip.dataset.eventId = ev.id;
      chip.dataset.calId = ev._calId || '';
      chip.dataset.isAllDay = ev.start.date ? '1' : '0';
      chip.dataset.startTime = ev.start.dateTime || '';
      chip.dataset.duration = ev.start.dateTime
        ? String(new Date(ev.end.dateTime) - new Date(ev.start.dateTime))
        : '86400000';
      chip.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', JSON.stringify({
          eventId: ev.id,
          calId: ev._calId || '',
          isAllDay: !!ev.start.date,
          startTime: ev.start.dateTime || '',
          duration: ev.start.dateTime
            ? (new Date(ev.end.dateTime) - new Date(ev.start.dateTime))
            : 86400000,
          summary: ev.summary
        }));
        e.dataTransfer.effectAllowed = 'move';
        chip.classList.add('dragging');
        // 드래그 중 chip/evWrap의 pointer-events 차단 → drop이 calendar-day에 정확히 전달
        setTimeout(function() { document.body.classList.add('is-dragging-event'); }, 0);
      });
      chip.addEventListener('dragend', function () {
        chip.classList.remove('dragging');
        document.body.classList.remove('is-dragging-event');
        document.querySelectorAll('.calendar-day.drag-over').forEach(function (c) {
          c.classList.remove('drag-over');
        });
      });
      // ── 모바일 long-press: 집어들기 → 이동=드래그 / 안 움직이고 떼면=메뉴 ──
      (function(ev) {
        var moved = false, mx = 0, my = 0;
        chip.addEventListener('touchstart', function(te) {
          var tx = te.touches[0]; mx = tx.clientX; my = tx.clientY;
          _lpFired = false; moved = false;
          _tcTmr = setTimeout(function() {
            _tcTmr = null; _lpFired = true;
            _tcDI = { eventId: ev.id, calId: ev._calId || '', isAllDay: !!ev.start.date,
              startTime: ev.start.dateTime || '', summary: ev.summary,
              duration: ev.start.dateTime ? (new Date(ev.end.dateTime) - new Date(ev.start.dateTime)) : 86400000 };
            _tcChip = chip;
            _tcGhost = chip.cloneNode(true);
            _tcGhost.style.cssText = 'position:fixed;opacity:.75;pointer-events:none;z-index:9999;width:' + chip.offsetWidth + 'px;left:' + (mx - chip.offsetWidth / 2) + 'px;top:' + (my - 20) + 'px;border-radius:6px;';
            document.body.appendChild(_tcGhost);
            chip.style.opacity = '.3';
            document.body.classList.add('is-dragging-event');
            if (navigator.vibrate) navigator.vibrate(40);
          }, 500);
        }, { passive: true });
        chip.addEventListener('touchmove', function(te) {
          if (!_tcDI) { clearTimeout(_tcTmr); _tcTmr = null; return; }   // 픽업 전 이동 → 스크롤
          te.preventDefault();
          moved = true;
          var tx = te.touches[0];
          if (_tcGhost) { _tcGhost.style.left = (tx.clientX - _tcGhost.offsetWidth / 2) + 'px'; _tcGhost.style.top = (tx.clientY - 20) + 'px'; }
          document.querySelectorAll('.calendar-day.drag-over').forEach(function(c) { c.classList.remove('drag-over'); });
          var el2 = document.elementFromPoint(tx.clientX, tx.clientY);
          var dy = el2 ? el2.closest('.calendar-day') : null;
          if (dy) dy.classList.add('drag-over');
        }, { passive: false });
        chip.addEventListener('touchend', function(te) {
          clearTimeout(_tcTmr); _tcTmr = null;
          if (!_tcDI) return;
          var tx = te.changedTouches[0];
          if (_tcGhost) { try { document.body.removeChild(_tcGhost); } catch(e) {} _tcGhost = null; }
          if (_tcChip) { _tcChip.style.opacity = ''; _tcChip = null; }
          document.body.classList.remove('is-dragging-event');
          document.querySelectorAll('.calendar-day.drag-over').forEach(function(c) { c.classList.remove('drag-over'); });
          if (moved) {
            var el2 = document.elementFromPoint(tx.clientX, tx.clientY);
            var dy = el2 ? el2.closest('.calendar-day') : null;
            if (dy && dy.dataset.date) {
              var pts = dy.dataset.date.split('-');
              var dropDate = new Date(parseInt(pts[0]), parseInt(pts[1]) - 1, parseInt(pts[2]));
              var ev2 = S.events ? S.events.find(function(e2) { return e2.id === _tcDI.eventId; }) : null;
              _moveEventToDate(_tcDI, dropDate, ev2);
            }
          } else {
            showEventContextMenu(ev, mx, my);   // 움직임 없이 길게 → 메뉴
          }
          _tcDI = null;
        });
        chip.addEventListener('touchcancel', function() {
          clearTimeout(_tcTmr); _tcTmr = null;
          if (_tcGhost) { try { document.body.removeChild(_tcGhost); } catch(e) {} _tcGhost = null; }
          if (_tcChip) { _tcChip.style.opacity = ''; _tcChip = null; }
          document.body.classList.remove('is-dragging-event');
          _tcDI = null;
        });
      })(ev);
      chip.addEventListener('click', function (e) {
        e.stopPropagation();
        if (_lpFired) { _lpFired = false; return; }   // 길게 눌러 메뉴 띄운 직후 클릭 무시
        openEventModal(ev);
      });
      chip.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        showEventContextMenu(ev, e.clientX, e.clientY);
      });
      evWrap.appendChild(chip);
    });

    el.appendChild(evWrap);

    // 드롭 타겟 설정
    el.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', function (e) {
      if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over');
    });
    el.addEventListener('drop', function (e) {
      e.preventDefault();
      el.classList.remove('drag-over');
      var raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      try {
        var info = JSON.parse(raw);
        _moveEventToDate(info, cellDate);
      } catch (err) { console.error(err); }
      e.stopPropagation();
    });

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

    var _qeb = $('quick-event-btn');
    if (_qeb) _qeb.addEventListener('click', function () {
      openEventModal(null, new Date());
    });

    $('print-cal-btn').addEventListener('click', function () {
      openPrintRangeModal();
    });

    // ── 년/월 직접 이동 팝업 ─────────────────────────────────────
    initCalJumpPopup();

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

  /* 일정 모달용 다중 캘린더 칩 렌더 */
  function renderEventCalChips() {
    var wrap = $('event-cal-chip-list');
    if (!wrap) return;
    if (!S.editCalendars || S.editCalendars.length === 0) {
      wrap.innerHTML = '<span style="font-size:12px;color:#aaa">+ 캘린더 추가 버튼으로 선택하세요</span>';
      return;
    }
    wrap.innerHTML = S.editCalendars.map(function (cal, i) {
      return '<span class="qt-cal-chip">' +
        '<span style="width:9px;height:9px;border-radius:50%;background:' + (cal.color || '#4285F4') + ';display:inline-block;flex-shrink:0"></span>' +
        '<span style="font-size:12px">' + (cal.name || cal.summary || cal.id) + '</span>' +
        '<button type="button" class="qt-cal-chip-del" data-i="' + i + '" title="제거">×</button>' +
      '</span>';
    }).join('');
    wrap.querySelectorAll('.qt-cal-chip-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        S.editCalendars.splice(parseInt(this.dataset.i), 1);
        renderEventCalChips();
      });
    });
  }

  /* 캘린더 피커 팝업 → editCalendars에 추가 */
  function openEventCalPicker() {
    if (!Auth.isLoggedIn()) { toast('먼저 로그인하세요.', 'error'); return; }
    // S.userCalendars로 간이 선택 UI 표시
    var cals = S.userCalendars.length > 0 ? S.userCalendars : [];
    if (cals.length === 0) {
      CalendarModule.listCalendars().then(function (list) {
        S.userCalendars = list;
        _showCalPickerMenu(list);
      }).catch(function () { toast('캘린더 목록을 불러오지 못했습니다.', 'error'); });
    } else {
      _showCalPickerMenu(cals);
    }
  }

  function _showCalPickerMenu(cals) {
    // 기존 피커 제거
    var old = document.getElementById('_ev-cal-picker');
    if (old) old.remove();

    var menu = document.createElement('div');
    menu.id = '_ev-cal-picker';
    menu.style.cssText =
      'position:fixed;z-index:10010;background:#fff;border:1px solid #ddd;border-radius:8px;' +
      'box-shadow:0 4px 20px rgba(0,0,0,.15);padding:8px 0;min-width:220px;max-height:300px;overflow-y:auto;' +
      'top:50%;left:50%;transform:translate(-50%,-50%)';

    var header = document.createElement('div');
    header.style.cssText = 'padding:8px 16px 6px;font-size:12px;font-weight:700;color:#666;border-bottom:1px solid #eee;margin-bottom:4px';
    header.textContent = '캘린더 선택';
    menu.appendChild(header);

    cals.forEach(function (cal) {
      var already = S.editCalendars.some(function (c) { return c.id === cal.id; });
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 16px;cursor:pointer;' +
        (already ? 'opacity:.4;pointer-events:none;' : 'hover:background:#f5f5f5;');
      row.innerHTML =
        '<span style="width:10px;height:10px;border-radius:50%;background:' + (cal.backgroundColor || '#4285F4') + ';flex-shrink:0"></span>' +
        '<span style="font-size:13px">' + (cal.summary || cal.id) + (already ? ' ✓' : '') + '</span>';
      row.addEventListener('mouseenter', function () { if (!already) this.style.background = '#f5f5f5'; });
      row.addEventListener('mouseleave', function () { this.style.background = ''; });
      row.addEventListener('click', function () {
        S.editCalendars.push({ id: cal.id, name: cal.summary || cal.id, color: cal.backgroundColor || '#4285F4' });
        renderEventCalChips();
        menu.remove();
        document.removeEventListener('click', _pickerOutside);
      });
      menu.appendChild(row);
    });

    document.body.appendChild(menu);

    function _pickerOutside(e) {
      if (!menu.contains(e.target) && e.target.id !== 'event-cal-add-btn') {
        menu.remove();
        document.removeEventListener('click', _pickerOutside);
      }
    }
    setTimeout(function () { document.addEventListener('click', _pickerOutside); }, 100);
  }

  // 일정 수정 모달에서 좌우 스와이프로 이전/다음 일정 이동(gestures.js에서 호출)
  window._eventNav = function (dir) {
    if (!S.editEventId) return;                 // 추가 모드는 무시
    var list = sortEvents(S.events || []);
    var idx = -1;
    for (var i = 0; i < list.length; i++) { if (list[i].id === S.editEventId) { idx = i; break; } }
    if (idx < 0) return;
    var ni = idx + (dir > 0 ? 1 : -1);
    if (ni < 0 || ni >= list.length) { toast(dir > 0 ? '마지막 일정입니다.' : '첫 일정입니다.'); return; }
    openEventModal(list[ni]);
  };

  function openEventModal(event, date) {
    S.editEventId  = null;
    S.editCalId    = null;
    S.editCalendars = [];
    $('event-modal-title').textContent = event ? '일정 수정' : '일정 추가';
    $('delete-event-btn').hidden        = !event;
    $('share-event-btn').hidden         = !event;
    $('event-share-area').hidden        = true;
    $('event-share-url').value          = '';
    $('duplicate-alert').hidden         = true;
    $('event-id').value                 = '';
    $('event-title').value              = '';
    $('event-description').value        = '';
    S.editEventObj = null;

    populateDeptSelect('event-dept');
    $('event-dept').value = '기타';
    populateCalendarDropdown('event-calendar');

    if (event) {
      S.editEventId  = event.id;
      S.editCalId    = event._calId || null;
      S.editEventObj = event;  // 반복 여부 판별용
      // 이벤트가 속한 캘린더를 칩 목록 초기값으로 설정
      if (event._calId) {
        var calName  = event._calName || event._calId;
        var calColor = event._calColor || '#4285F4';
        S.editCalendars = [{ id: event._calId, name: calName, color: calColor }];
      }
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

    // 반복 UI 초기화/복원
    var recurTypeEl = $('event-recur-type');
    if (recurTypeEl) recurTypeEl.value = 'none';
    var isExistingNonRecur = !!(event && (!event.recurrence || !event.recurrence.length));
    var isExistingRecur    = !!(event && event.recurrence && event.recurrence.length);

    if (isExistingRecur) {
      restoreRecurUI(event.recurrence);
    } else {
      refreshRecurVisibility();
    }

    // "반복으로 추가 등록" 버튼 & 힌트 — 반복 없는 기존 이벤트에만 표시
    var addRecurBtn  = $('add-recur-btn');
    var recurHint    = $('recur-add-hint');
    if (addRecurBtn) addRecurBtn.hidden = !isExistingNonRecur;
    if (recurHint)   recurHint.hidden   = !isExistingNonRecur;

    // 반복으로 추가 등록 버튼 — 항상 활성화 (클릭 시 반복 미설정이면 안내 토스트)
    if (addRecurBtn) {
      addRecurBtn.disabled    = false;
      addRecurBtn.style.opacity = '';
    }

    renderEventCalChips();
    openModal('event-modal');
    // 일정을 새로 열거나 넘길 때 항상 맨 위(제목)부터 보이게
    var _mb = document.querySelector('#event-modal .modal-body');
    if (_mb) _mb.scrollTop = 0;
    var _md = document.querySelector('#event-modal .modal-dialog');
    if (_md) _md.scrollTop = 0;
  }

  function toGCalDateStr(isoStr) {
    // ISO → YYYYMMDDTHHMMSSZ (UTC, Google Calendar URL 형식)
    return new Date(isoStr).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  /* ────────────────────────────────────────────────────────────────
     이벤트 우클릭 컨텍스트 메뉴
  ──────────────────────────────────────────────────────────────── */
  function _setupEditCtx(ev) {
    S.editEventId   = ev.id;
    S.editCalId     = ev._calId || null;
    S.editEventObj  = ev;
    S.editCalendars = ev._calId
      ? [{ id: ev._calId, name: ev._calName || ev._calId, color: ev._calColor || '#4285F4' }]
      : [];
  }

  function showEventContextMenu(ev, x, y) {
    _ctxEv = ev;
    _ctxOpenedAt = Date.now();
    var menu = $('ev-ctx-menu');
    if (!menu) return;
    menu.hidden = false;
    var W = window.innerWidth, H = window.innerHeight;
    var mW = 160, mH = 116;
    menu.style.left = Math.min(x, W - mW - 8) + 'px';
    menu.style.top  = Math.min(y, H - mH - 8) + 'px';
  }

  function hideEventContextMenu() {
    var menu = $('ev-ctx-menu');
    if (menu) menu.hidden = true;
    _ctxEv = null;
  }

  function initEventContextMenu() {
    var menu = $('ev-ctx-menu');
    if (!menu) return;

    document.addEventListener('click', function () { if (Date.now() - _ctxOpenedAt < 400) return; hideEventContextMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideEventContextMenu(); });

    $('ev-ctx-delete').addEventListener('click', function (e) {
      e.stopPropagation();
      var ev = _ctxEv;
      hideEventContextMenu();
      if (!ev) return;
      _setupEditCtx(ev);
      var isRecurring = !!(ev.recurrence || ev.recurringEventId);
      if (isRecurring) {
        openRecurDeleteModal();
      } else {
        confirmDeleteEvent('this');
      }
    });

    $('ev-ctx-repeat').addEventListener('click', function (e) {
      e.stopPropagation();
      var ev = _ctxEv;
      hideEventContextMenu();
      if (!ev) return;
      openEventModal(ev);
    });

    $('ev-ctx-share').addEventListener('click', function (e) {
      e.stopPropagation();
      var ev = _ctxEv;
      hideEventContextMenu();
      if (!ev) return;
      openEventModal(ev);
      setTimeout(function () {
        var shareBtn = $('share-event-btn');
        if (shareBtn && !shareBtn.hidden) shareBtn.click();
      }, 200);
    });
  }

  function initEventModal() {
    // 캘린더 추가 버튼
    var evCalAddBtn = $('event-cal-add-btn');
    if (evCalAddBtn) evCalAddBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openEventCalPicker();
    });
    var evCalClearBtn = $('event-cal-clear-btn');
    if (evCalClearBtn) evCalClearBtn.addEventListener('click', function () {
      S.editCalendars = [];
      renderEventCalChips();
    });

    // 공유하기 버튼
    $('share-event-btn').addEventListener('click', async function () {
      var title = $('event-title').value.trim();
      var start = $('event-start').value;
      var end   = $('event-end').value;
      var desc  = $('event-description').value.trim();

      if (!title || !start || !end) {
        toast('제목과 시간을 먼저 입력하세요.', 'error'); return;
      }

      var startStr = toGCalDateStr(start);
      var endStr   = toGCalDateStr(end);
      var shareRecur = buildRecurrence();
      var params   = new URLSearchParams({
        action:  'TEMPLATE',
        text:    title,
        dates:   startStr + '/' + endStr,
        details: desc || '',
      });
      if (shareRecur.length) params.set('recur', shareRecur[0]);
      var longUrl = 'https://calendar.google.com/calendar/render?' + params.toString();

      // TinyURL API로 단축 URL 생성 시도
      var shareUrl = longUrl;
      var urlEl = $('event-share-url');
      urlEl.value   = '단축 URL 생성 중...';
      urlEl.disabled = true;
      $('event-share-area').hidden = false;

      try {
        var resp = await fetch(
          'https://tinyurl.com/api-create.php?url=' + encodeURIComponent(longUrl)
        );
        if (resp.ok) {
          var short = (await resp.text()).trim();
          if (short && short.startsWith('http')) shareUrl = short;
        }
      } catch (e) { /* 단축 실패 시 원본 URL 사용 */ }

      urlEl.value    = shareUrl;
      urlEl.disabled = false;
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
      // 등록/수정 대상 캘린더 목록 결정
      // editCalendars 칩 목록 우선, 없으면 기본 캘린더
      var targetCals = (S.editCalendars && S.editCalendars.length > 0)
        ? S.editCalendars.map(function (c) { return c.id; })
        : [CONFIG.calendarId];
      var targetCal = targetCals[0]; // 단일 API 호환용 (첫 번째)

      // colorId 결정 (부서 인덱스 기반)
      var dIdx = CONFIG.departments.findIndex(function (d) { return d.name === dept; });
      var palette = ['1','2','3','4','5','6','7','8','9','10','11'];
      var colorId = palette[dIdx >= 0 ? dIdx % palette.length : 10];

      var recurrence = buildRecurrence();
      var eventData = {
        summary:     title,
        description: fullDesc,
        start: { dateTime: new Date(start).toISOString(), timeZone: tz },
        end:   { dateTime: new Date(end).toISOString(),   timeZone: tz },
        colorId: colorId,
      };
      if (recurrence.length) eventData.recurrence = recurrence;

      var btn = $('save-event-btn');
      btn.disabled = true;
      try {
        if (S.editEventId) {
          // ── 수정 모드 ──────────────────────────────────────────
          var origCalId = S.editCalId || CONFIG.calendarId;
          var newCalIds = targetCals; // 사용자가 선택한 칩 목록

          var origInNew = newCalIds.indexOf(origCalId) !== -1;

          if (origInNew) {
            // 원래 캘린더 유지: 원래 캘린더에서 내용 수정
            await CalendarModule.updateEvent(origCalId, S.editEventId, eventData);
            // 추가된 나머지 캘린더에는 새로 생성
            for (var ci = 0; ci < newCalIds.length; ci++) {
              if (newCalIds[ci] !== origCalId) {
                try { await CalendarModule.createEvent(newCalIds[ci], eventData); } catch (e2) {}
              }
            }
          } else {
            // 원래 캘린더 제거됨 → 이동: 원래에서 삭제 + 새 캘린더들에 생성
            try { await CalendarModule.deleteEvent(origCalId, S.editEventId); } catch (eDel) {}
            for (var ci3 = 0; ci3 < newCalIds.length; ci3++) {
              try { await CalendarModule.createEvent(newCalIds[ci3], eventData); } catch (e4) {}
            }
          }
          var calCount = newCalIds.length;
          toast('일정이 수정되었습니다.' + (calCount > 1 ? ' (' + calCount + '개 캘린더)' : ''), 'success');

        } else {
          // ── 신규 등록: 선택된 모든 캘린더에 생성 ──────────────
          var createCals = targetCals.length > 0 ? targetCals : [CONFIG.calendarId];
          for (var ci2 = 0; ci2 < createCals.length; ci2++) {
            try { await CalendarModule.createEvent(createCals[ci2], eventData); } catch (e3) {}
          }
          toast('일정이 추가되었습니다.' + (createCals.length > 1 ? ' (' + createCals.length + '개 캘린더)' : ''), 'success');
        }
        closeModal('event-modal');
        await renderCalendar();
      } catch (e) {
        toast('저장 실패: ' + e.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    $('delete-event-btn').addEventListener('click', function () {
      if (!S.editEventId) return;
      // 반복 이벤트인지 확인 — recurrence 또는 recurringEventId 속성 존재 시
      var isRecurring = !!(S.editEventObj &&
        (S.editEventObj.recurrence || S.editEventObj.recurringEventId));
      if (isRecurring) {
        openRecurDeleteModal();
      } else {
        confirmDeleteEvent('this');
      }
    });

    [$('event-title'), $('event-start'), $('event-end')].forEach(function (el) {
      el.addEventListener('input', function () {
        clearTimeout(S.dupTimer);
        S.dupTimer = setTimeout(runDupCheck, 600);
      });
    });

    // ── 반복 일정 UI 이벤트 ─────────────────────────────────────
    initRecurUI();

    // ── 반복으로 추가 등록 버튼 ──────────────────────────────────
    initAddRecurBtn();
  }

  /* ────────────────────────────────────────────────────────────────
     반복 일정 — UI 제어 및 RRULE 생성
  ──────────────────────────────────────────────────────────────── */
  function initRecurUI() {
    var typeEl  = $('event-recur-type');
    var freqEl  = $('recur-freq');
    var endType = $('recur-end-type');
    if (!typeEl) return;

    typeEl.addEventListener('change', refreshRecurVisibility);
    if (freqEl) freqEl.addEventListener('change', refreshRecurVisibility);
    if (endType) endType.addEventListener('change', refreshRecurVisibility);

    ['recur-weekly-days', 'recur-custom-days'].forEach(function (id) {
      var el2 = $(id);
      if (el2) el2.addEventListener('change', updateRecurPreview);
    });
    [$('recur-interval'), $('recur-end-date'), $('recur-count')].forEach(function (el3) {
      if (el3) el3.addEventListener('input', updateRecurPreview);
    });

    refreshRecurVisibility();
  }

  function refreshRecurVisibility() {
    var typeEl  = $('event-recur-type');
    var freqEl  = $('recur-freq');
    var endType = $('recur-end-type');
    if (!typeEl) return;

    var v = typeEl.value;
    $('recur-weekly-days').hidden = (v !== 'weekly');
    $('recur-custom').hidden      = (v !== 'custom');
    $('recur-end-section').hidden = (v === 'none');
    if (freqEl) $('recur-custom-days').hidden = (freqEl.value !== 'WEEKLY');
    if (endType) {
      var et = endType.value;
      $('recur-end-date').hidden  = (et !== 'date');
      $('recur-count-row').hidden = (et !== 'count');
    }
    updateRecurPreview();
  }

  /* 현재 폼 상태에서 RRULE 문자열 배열 생성 (Google Calendar API recurrence 필드용) */
  function buildRecurrence() {
    var typeEl = $('event-recur-type');
    if (!typeEl || typeEl.value === 'none') return [];

    var freq, byday = '';
    var v = typeEl.value;

    if (v === 'daily')    { freq = 'DAILY'; }
    else if (v === 'weekly') {
      freq  = 'WEEKLY';
      byday = getCheckedDays('recur-day-cb');
      if (!byday) {
        // 기본: 이벤트 시작일의 요일
        var startVal = $('event-start').value;
        if (startVal) {
          var DOW = ['SU','MO','TU','WE','TH','FR','SA'];
          byday = DOW[new Date(startVal).getDay()];
        }
      }
    }
    else if (v === 'monthly')  { freq = 'MONTHLY'; }
    else if (v === 'yearly')   { freq = 'YEARLY';  }
    else if (v === 'weekdays') { freq = 'WEEKLY'; byday = 'MO,TU,WE,TH,FR'; }
    else if (v === 'custom') {
      freq  = $('recur-freq').value || 'DAILY';
      if (freq === 'WEEKLY') {
        byday = getCheckedDays('recur-cday-cb');
        if (!byday) {
          var startVal2 = $('event-start').value;
          if (startVal2) {
            var DOW2 = ['SU','MO','TU','WE','TH','FR','SA'];
            byday = DOW2[new Date(startVal2).getDay()];
          }
        }
      }
    }

    var interval = parseInt(($('recur-interval') || {}).value) || 1;
    var endTyp   = ($('recur-end-type') || {}).value || 'never';

    var rule = 'RRULE:FREQ=' + freq;
    if (v === 'custom' && interval > 1) rule += ';INTERVAL=' + interval;
    if (byday) rule += ';BYDAY=' + byday;

    if (endTyp === 'date') {
      var ed = ($('recur-end-date') || {}).value;
      if (ed) rule += ';UNTIL=' + ed.replace(/-/g, '') + 'T235959Z';
    } else if (endTyp === 'count') {
      var cnt = parseInt(($('recur-count') || {}).value) || 10;
      rule += ';COUNT=' + cnt;
    }

    return [rule];
  }

  function getCheckedDays(cls) {
    return Array.from(document.querySelectorAll('.' + cls + ':checked'))
      .map(function (cb) { return cb.value; }).join(',');
  }

  /* 반복 설정 한국어 요약 */
  function updateRecurPreview() {
    var prevEl = $('recur-preview');
    if (!prevEl) return;
    var r = buildRecurrence();
    if (!r.length) { prevEl.hidden = true; return; }
    prevEl.hidden = false;
    prevEl.textContent = '🔁 ' + describeRRule(r[0]);
  }

  function describeRRule(rule) {
    if (!rule) return '';
    var freqM  = rule.match(/FREQ=([^;]+)/);
    var byDayM = rule.match(/BYDAY=([^;]+)/);
    var untilM = rule.match(/UNTIL=(\d{8})/);
    var countM = rule.match(/COUNT=(\d+)/);
    var intM   = rule.match(/INTERVAL=(\d+)/);
    var freq   = freqM ? freqM[1] : '';
    var dayMap = {SU:'일',MO:'월',TU:'화',WE:'수',TH:'목',FR:'금',SA:'토'};
    var freqNames = {DAILY:'매일',WEEKLY:'매주',MONTHLY:'매달',YEARLY:'매년'};
    var txt = freqNames[freq] || freq;
    if (intM && intM[1] !== '1') {
      var fSuffix = {DAILY:'일',WEEKLY:'주',MONTHLY:'달',YEARLY:'년'};
      txt = '매 ' + intM[1] + (fSuffix[freq] || '') + '마다';
    }
    if (byDayM) {
      var days = byDayM[1].split(',').map(function(d){ return dayMap[d]||d; }).join(', ');
      if (byDayM[1] === 'MO,TU,WE,TH,FR') txt += ' (평일)';
      else txt += ' (' + days + '요일)';
    }
    if (untilM) {
      var u = untilM[1];
      txt += ' — ' + u.slice(0,4) + '.' + u.slice(4,6) + '.' + u.slice(6,8) + '까지';
    } else if (countM) {
      txt += ' — ' + countM[1] + '회 반복';
    }
    return txt;
  }

  /* 기존 이벤트의 recurrence 배열에서 UI 복원 */
  function restoreRecurUI(recurrenceArr) {
    var typeEl = $('event-recur-type');
    if (!typeEl) return;
    // 초기화
    typeEl.value = 'none';
    if (!recurrenceArr || !recurrenceArr.length) { refreshRecurVisibility(); return; }

    var rule   = recurrenceArr[0] || '';
    var freqM  = rule.match(/FREQ=([^;]+)/);
    var byDayM = rule.match(/BYDAY=([^;]+)/);
    var intM   = rule.match(/INTERVAL=(\d+)/);
    var untilM = rule.match(/UNTIL=(\d{8})/);
    var countM = rule.match(/COUNT=(\d+)/);
    var freq   = freqM ? freqM[1] : '';

    // 타입 결정
    if (byDayM && byDayM[1] === 'MO,TU,WE,TH,FR') {
      typeEl.value = 'weekdays';
    } else if (freq === 'DAILY' && !intM) {
      typeEl.value = 'daily';
    } else if (freq === 'WEEKLY' && !intM) {
      typeEl.value = 'weekly';
      // 요일 체크
      if (byDayM) {
        var days = byDayM[1].split(',');
        document.querySelectorAll('.recur-day-cb').forEach(function (cb) {
          cb.checked = days.indexOf(cb.value) !== -1;
        });
      }
    } else if (freq === 'MONTHLY' && !intM) {
      typeEl.value = 'monthly';
    } else if (freq === 'YEARLY' && !intM) {
      typeEl.value = 'yearly';
    } else {
      typeEl.value = 'custom';
      var freqEl = $('recur-freq');
      if (freqEl) freqEl.value = freq;
      var intEl = $('recur-interval');
      if (intEl) intEl.value = intM ? intM[1] : '1';
      if (freq === 'WEEKLY' && byDayM) {
        var cdays = byDayM[1].split(',');
        document.querySelectorAll('.recur-cday-cb').forEach(function (cb) {
          cb.checked = cdays.indexOf(cb.value) !== -1;
        });
      }
    }

    // 종료 조건
    var endTypeEl = $('recur-end-type');
    if (endTypeEl) {
      if (untilM) {
        endTypeEl.value = 'date';
        var u = untilM[1];
        var endDEl = $('recur-end-date');
        if (endDEl) endDEl.value = u.slice(0,4) + '-' + u.slice(4,6) + '-' + u.slice(6,8);
      } else if (countM) {
        endTypeEl.value = 'count';
        var cntEl = $('recur-count');
        if (cntEl) cntEl.value = countM[1];
      } else {
        endTypeEl.value = 'never';
      }
    }

    // UI 상태 갱신
    refreshRecurVisibility();
  }

  /* ────────────────────────────────────────────────────────────────
     반복 일정 삭제 모달
  ──────────────────────────────────────────────────────────────── */
  function openRecurDeleteModal() {
    // 라디오 초기화
    var radios = document.querySelectorAll('input[name="recur-del-scope"]');
    radios.forEach(function (r) { r.checked = r.value === 'this'; });
    $('recur-delete-modal').hidden = false;
  }

  function initRecurDeleteModal() {
    var modal   = $('recur-delete-modal');
    var confirm = $('recur-del-confirm');
    var cancel  = $('recur-del-cancel');
    var close   = $('recur-del-close');
    if (!modal) return;

    function closeModal() { modal.hidden = true; }

    [cancel, close].forEach(function (el) {
      if (el) el.addEventListener('click', closeModal);
    });

    modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

    confirm.addEventListener('click', async function () {
      var scope = document.querySelector('input[name="recur-del-scope"]:checked');
      closeModal();
      await confirmDeleteEvent(scope ? scope.value : 'this');
    });
  }

  async function confirmDeleteEvent(scope) {
    // scope: 'this' | 'all'
    if (!S.editEventId) return;
    var delCal  = S.editCalId || CONFIG.calendarId;
    var eventId = S.editEventId;

    // 'all': recurringEventId(시리즈 ID)가 있으면 그것으로 삭제, 없으면 현재 ID
    if (scope === 'all') {
      var baseId = (S.editEventObj && S.editEventObj.recurringEventId) || eventId;
      eventId = baseId;
    }

    try {
      var ok = await CalendarModule.deleteEvent(delCal, eventId);
      if (ok) {
        toast(scope === 'all' ? '모든 반복 일정이 삭제됐습니다.' : '이번 일정이 삭제됐습니다.', 'success');
        closeModal('event-modal');
        await renderCalendar();
      } else {
        toast('삭제에 실패했습니다.', 'error');
      }
    } catch (e) {
      toast('삭제 실패: ' + e.message, 'error');
    }
  }

  /* ────────────────────────────────────────────────────────────────
     달력 구간 인쇄 모달
  ──────────────────────────────────────────────────────────────── */
  function openPrintRangeModal() {
    var d = S.viewDate;
    $('print-start-year').value  = d.getFullYear();
    $('print-start-month').value = d.getMonth() + 1;
    $('print-end-year').value    = d.getFullYear();
    $('print-end-month').value   = d.getMonth() + 1;

    // 캘린더 체크박스 렌더
    var wrap = $('print-cal-checkboxes');
    wrap.innerHTML = '';
    var cals = CONFIG.selectedCalendars.length ? CONFIG.selectedCalendars
      : [{ id: 'primary', name: '기본 캘린더', color: '#4285F4', enabled: true }];
    cals.forEach(function (cal) {
      var lbl = document.createElement('label');
      lbl.className = 'print-cal-check';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = cal.id;
      cb.checked = cal.enabled !== false;
      cb.addEventListener('change', updatePrintPreview);
      var dot = document.createElement('span');
      dot.className = 'print-cal-dot';
      dot.style.background = cal.color || '#4285F4';
      lbl.appendChild(cb);
      lbl.appendChild(dot);
      lbl.appendChild(document.createTextNode(cal.name));
      wrap.appendChild(lbl);
    });

    updatePrintPreview();
    $('print-range-modal').hidden = false;
  }

  function updatePrintPreview() {
    var sy = parseInt($('print-start-year').value)  || 0;
    var sm = parseInt($('print-start-month').value) || 1;
    var ey = parseInt($('print-end-year').value)    || 0;
    var em = parseInt($('print-end-month').value)   || 1;
    var prev = $('print-range-preview');
    if (!prev) return;
    var months = (ey - sy) * 12 + (em - sm) + 1;
    var checked = document.querySelectorAll('#print-cal-checkboxes input:checked').length;
    if (months < 1 || months > 24) {
      prev.textContent = months < 1 ? '⚠ 종료가 시작보다 앞설 수 없습니다.' : '⚠ 최대 24개월까지 선택 가능합니다.';
      prev.style.color = '#b3261e';
    } else {
      prev.textContent = '📄 총 ' + months + '장 인쇄 · ' + checked + '개 캘린더 표시';
      prev.style.color = '';
    }
  }

  function initPrintRangeModal() {
    var modal  = $('print-range-modal');
    if (!modal) return;
    var closeEl = $('print-range-close');
    var cancel  = $('print-range-cancel');
    var goBtn   = $('print-range-go');

    function closeModal() { modal.hidden = true; }
    [closeEl, cancel].forEach(function (el) {
      if (el) el.addEventListener('click', closeModal);
    });
    modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

    // 입력 변경 시 미리보기 갱신
    ['print-start-year','print-start-month','print-end-year','print-end-month'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', updatePrintPreview);
    });

    // 빠른 선택 버튼
    modal.querySelectorAll('[data-print-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var n  = parseInt(btn.dataset.printPreset);
        var d  = S.viewDate;
        var sy = d.getFullYear();
        var sm = d.getMonth() + 1;
        var ey, em;
        if (n === 12) {
          // 올해 전체
          sy = d.getFullYear(); sm = 1;
          ey = d.getFullYear(); em = 12;
        } else {
          ey = sy; em = sm + n - 1;
          if (em > 12) { ey += Math.floor((em - 1) / 12); em = ((em - 1) % 12) + 1; }
        }
        $('print-start-year').value  = sy;
        $('print-start-month').value = sm;
        $('print-end-year').value    = ey;
        $('print-end-month').value   = em;
        updatePrintPreview();
      });
    });

    goBtn.addEventListener('click', function () {
      var sy = parseInt($('print-start-year').value);
      var sm = parseInt($('print-start-month').value);
      var ey = parseInt($('print-end-year').value);
      var em = parseInt($('print-end-month').value);
      if (isNaN(sy)||isNaN(sm)||isNaN(ey)||isNaN(em)) { toast('날짜를 올바르게 입력하세요.','error'); return; }
      var months = (ey - sy) * 12 + (em - sm) + 1;
      if (months < 1) { toast('종료월이 시작월보다 앞설 수 없습니다.','error'); return; }
      if (months > 24) { toast('최대 24개월까지 선택 가능합니다.','error'); return; }
      var checkedCals = Array.from(document.querySelectorAll('#print-cal-checkboxes input:checked'))
        .map(function (cb) { return cb.value; });
      var docTitle = ($('print-doc-title').value || '').trim();
      closeModal();
      printCalendarRange(sy, sm, ey, em, checkedCals, docTitle);
    });
  }

  /* ────────────────────────────────────────────────────────────────
     달력 인쇄 / PDF 저장
  ──────────────────────────────────────────────────────────────── */
  function printCalendar() {
    var d      = S.viewDate;
    var year   = d.getFullYear();
    var month  = d.getMonth();
    var today  = new Date();
    var events = S.events || [];

    // ── 이번 달 6주 그리드 생성 ────────────────────────────────
    var first = new Date(year, month, 1);
    var start = new Date(first);
    start.setDate(start.getDate() - start.getDay());

    var evMap = {};
    events.forEach(function (ev) {
      var dt  = new Date(ev.start.dateTime || ev.start.date);
      var key = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate();
      (evMap[key] || (evMap[key] = [])).push(ev);
    });
    Object.keys(evMap).forEach(function (k) { evMap[k] = sortEvents(evMap[k]); });

    var DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
    var MONTH_KO  = year + '년 ' + (month + 1) + '월';

    // ── 캘린더 범례 데이터 ──────────────────────────────────────
    var cals = CONFIG.selectedCalendars.filter(function (c) { return c.enabled !== false; });

    // ── 색상 팔레트 (부서별) ───────────────────────────────────
    var DEPT_COLORS = {
      '기획처': { bg: '#e8f0fe', text: '#1a5fbf', border: '#4285F4' },
      '교학처': { bg: '#e6f4ea', text: '#1e7e34', border: '#34A853' },
      '행정처': { bg: '#fef7e0', text: '#856404', border: '#FBBC04' },
      '기타':   { bg: '#fce8e6', text: '#b3261e', border: '#EA4335' },
    };

    function getDeptColors(description, calColor) {
      if (calColor) return { bg: calColor + '22', text: calColor, border: calColor };
      if (!description) return DEPT_COLORS['기타'];
      var m = /\[부서:([^\]]+)\]/.exec(description);
      var deptName = m ? m[1] : '기타';
      return DEPT_COLORS[deptName] || DEPT_COLORS['기타'];
    }

    // ── 셀 HTML 빌더 ──────────────────────────────────────────
    function buildCell(cellDate) {
      var isOther   = cellDate.getMonth() !== month;
      var isToday   = cellDate.getFullYear() === today.getFullYear() &&
                      cellDate.getMonth()    === today.getMonth()    &&
                      cellDate.getDate()     === today.getDate();
      var isSun     = cellDate.getDay() === 0;
      var isSat     = cellDate.getDay() === 6;
      var key       = cellDate.getFullYear() + '-' + (cellDate.getMonth() + 1) + '-' + cellDate.getDate();
      var dayEvts   = evMap[key] || [];

      var numColor  = isOther ? '#bbb' : isSun ? '#e53935' : isSat ? '#1565C0' : '#1a1a2e';
      var cellBg    = isOther ? '#f8f9fa' : '#fff';
      var numBadge  = isToday
        ? 'background:#1A73E8;color:#fff;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;'
        : 'font-size:13px;font-weight:' + (isOther ? '400' : '700') + ';color:' + numColor + ';';

      var chipsHtml = dayEvts.map(function (ev) {
        var c   = getDeptColors(ev.description, ev._calColor);
        var txt = (ev.summary || '(제목 없음)').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var time = '';
        if (ev.start.dateTime) {
          var st = new Date(ev.start.dateTime);
          time = '<span style="opacity:.7;margin-right:3px;font-size:9px;">' +
            pad(st.getHours()) + ':' + pad(st.getMinutes()) + '</span>';
        }
        return '<div style="' +
          'background:' + c.bg + ';' +
          'color:' + c.text + ';' +
          'border-left:3px solid ' + c.border + ';' +
          'border-radius:3px;padding:2px 5px;margin-bottom:2px;' +
          'font-size:9.5px;line-height:1.45;font-weight:600;' +
          'word-break:keep-all;overflow-wrap:break-word;white-space:normal;' +
          '">' + time + txt + '</div>';
      }).join('');

      return '<td style="background:' + cellBg + ';vertical-align:top;padding:6px 5px 4px;' +
        'border:1px solid #e0e4ef;width:14.28%;">' +
        '<div style="' + numBadge + 'margin-bottom:4px;">' + cellDate.getDate() + '</div>' +
        (chipsHtml ? '<div>' + chipsHtml + '</div>' : '') +
        '</td>';
    }

    // ── 6주 테이블 행 빌더 ─────────────────────────────────────
    var rows = '';
    for (var w = 0; w < 6; w++) {
      rows += '<tr>';
      for (var wd = 0; wd < 7; wd++) {
        var cellDate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + wd);
        rows += buildCell(cellDate);
      }
      rows += '</tr>';
    }

    // ── 요일 헤더 ──────────────────────────────────────────────
    var headerCols = DAY_NAMES.map(function (n, i) {
      var col  = i === 0 ? '#e53935' : i === 6 ? '#1565C0' : '#3c4152';
      var bg   = i === 0 ? '#fff5f5' : i === 6 ? '#f0f4ff' : '#f4f6fb';
      return '<th style="background:' + bg + ';color:' + col + ';font-weight:700;' +
        'font-size:12px;padding:8px 0;text-align:center;border:1px solid #e0e4ef;">' + n + '</th>';
    }).join('');

    // ── 범례 HTML ──────────────────────────────────────────────
    var legendHtml = cals.length ? cals.map(function (c) {
      return '<span style="display:inline-flex;align-items:center;gap:5px;margin-right:14px;">' +
        '<span style="width:10px;height:10px;border-radius:50%;background:' + c.color + ';flex-shrink:0;"></span>' +
        '<span style="font-size:10px;color:#555;">' + c.name + '</span>' +
        '</span>';
    }).join('') : '';

    // ── 전체 HTML ─────────────────────────────────────────────
    var html = '<!DOCTYPE html><html lang="ko"><head>' +
      '<meta charset="UTF-8">' +
      '<title>ASEA 캘린더 — ' + MONTH_KO + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700;900&display=swap" rel="stylesheet">' +
      '<style>' +
      '  * { box-sizing:border-box; margin:0; padding:0; }' +
      '  body { font-family:"Noto Sans KR",sans-serif; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }' +
      '  .print-wrap { width:100%; padding:20px 24px 16px; }' +
      '  .print-header { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:16px; }' +
      '  .print-title { font-size:28px; font-weight:900; color:#1a1a2e; letter-spacing:-.03em; }' +
      '  .print-sub { font-size:11px; color:#888; text-align:right; line-height:1.7; }' +
      '  .legend-row { margin-bottom:10px; display:flex; flex-wrap:wrap; align-items:center; gap:2px; }' +
      '  table { width:100%; border-collapse:collapse; table-layout:fixed; }' +
      '  td { word-break:break-all; }' +
      '  @page { size:A4 landscape; margin:12mm 10mm; }' +
      '  @media print {' +
      '    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }' +
      '    .no-print { display:none !important; }' +
      '    table { page-break-inside:avoid; }' +
      '  }' +
      '  .print-btn-bar { text-align:center; padding:12px 0 8px; display:flex; gap:12px; justify-content:center; }' +
      '  .pbtn { padding:9px 28px; border:none; border-radius:8px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; }' +
      '  .pbtn-print { background:#1A73E8; color:#fff; }' +
      '  .pbtn-close { background:#f1f3f4; color:#3c4152; }' +
      '</style>' +
      '</head><body>' +
      '<div class="print-wrap">' +

      // 버튼바 (인쇄 시 숨김)
      '<div class="print-btn-bar no-print">' +
      '  <button class="pbtn pbtn-print" onclick="window.print()">🖨 인쇄 / PDF 저장</button>' +
      '  <button class="pbtn pbtn-close" onclick="window.close()">✕ 닫기</button>' +
      '</div>' +

      // 헤더 (출력일/경로 제거)
      '<div class="print-header">' +
      '  <div>' +
      '    <div style="font-size:11px;color:#888;font-weight:600;margin-bottom:4px;">ASEA 일정 관리</div>' +
      '    <div class="print-title">' + MONTH_KO + '</div>' +
      '  </div>' +
      '</div>' +

      // 범례
      (legendHtml ? '<div class="legend-row">' + legendHtml + '</div>' : '') +

      // 달력 테이블
      '<table>' +
      '  <thead><tr>' + headerCols + '</tr></thead>' +
      '  <tbody>' + rows + '</tbody>' +
      '</table>' +

      '</div>' +
      '</body></html>';

    var win = window.open('', '_blank', 'width=1100,height=800,scrollbars=yes');
    if (!win) { toast('팝업이 차단됐습니다. 브라우저 팝업 허용 후 다시 시도하세요.', 'error'); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
    // 폰트 로드 후 인쇄 다이얼로그 열기
    win.onload = function () {
      setTimeout(function () { win.focus(); }, 200);
    };
  }

  /* ────────────────────────────────────────────────────────────────
     구간 인쇄 — 월별 1장씩 페이지 분리
  ──────────────────────────────────────────────────────────────── */
  function printCalendarRange(startYear, startMonth, endYear, endMonth, allowedCalIds, docTitle) {
    var today  = new Date();
    var events = S.events || [];

    // 허용된 캘린더 필터링
    var filteredEvents = allowedCalIds && allowedCalIds.length
      ? events.filter(function (ev) { return allowedCalIds.indexOf(ev._calId) !== -1; })
      : events;

    // 전체 evMap
    var evMap = {};
    filteredEvents.forEach(function (ev) {
      var dt  = new Date(ev.start.dateTime || ev.start.date);
      var key = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate();
      (evMap[key] || (evMap[key] = [])).push(ev);
    });
    Object.keys(evMap).forEach(function (k) { evMap[k] = sortEvents(evMap[k]); });

    // 캘린더 범례 (선택된 것만)
    var allCals = CONFIG.selectedCalendars.length ? CONFIG.selectedCalendars : [];
    var cals    = allowedCalIds && allowedCalIds.length
      ? allCals.filter(function (c) { return allowedCalIds.indexOf(c.id) !== -1; })
      : allCals;

    var DEPT_COLORS = {
      '기획처': { bg: '#e8f0fe', text: '#1a5fbf', border: '#4285F4' },
      '교학처': { bg: '#e6f4ea', text: '#1e7e34', border: '#34A853' },
      '행정처': { bg: '#fef7e0', text: '#856404', border: '#FBBC04' },
      '기타':   { bg: '#fce8e6', text: '#b3261e', border: '#EA4335' },
    };

    function getDeptColors(description, calColor) {
      if (calColor) return { bg: calColor + '22', text: calColor, border: calColor };
      if (!description) return DEPT_COLORS['기타'];
      var m = /\[부서:([^\]]+)\]/.exec(description);
      return DEPT_COLORS[(m ? m[1] : '기타')] || DEPT_COLORS['기타'];
    }

    function buildCell(cellDate, month) {
      var isOther = cellDate.getMonth() !== month;
      var isToday = cellDate.getFullYear() === today.getFullYear() &&
                    cellDate.getMonth()    === today.getMonth()    &&
                    cellDate.getDate()     === today.getDate();
      var isSun   = cellDate.getDay() === 0;
      var isSat   = cellDate.getDay() === 6;
      var key     = cellDate.getFullYear() + '-' + (cellDate.getMonth() + 1) + '-' + cellDate.getDate();
      var dayEvts = evMap[key] || [];
      var numColor = isOther ? '#bbb' : isSun ? '#e53935' : isSat ? '#1565C0' : '#1a1a2e';
      var cellBg   = isOther ? '#f8f9fa' : '#fff';
      var numStyle = isToday
        ? 'background:#1A73E8;color:#fff;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;'
        : 'font-size:13px;font-weight:' + (isOther ? '400' : '700') + ';color:' + numColor + ';';

      var chipsHtml = dayEvts.map(function (ev) {
        var c   = getDeptColors(ev.description, ev._calColor);
        var txt = (ev.summary || '(제목 없음)').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var timeStr = '';
        if (ev.start.dateTime) {
          var st = new Date(ev.start.dateTime);
          timeStr = '<span style="opacity:.7;font-size:9px;margin-right:3px;">' +
            pad(st.getHours()) + ':' + pad(st.getMinutes()) + '</span>';
        }
        return '<div style="background:' + c.bg + ';color:' + c.text + ';border-left:3px solid ' + c.border + ';' +
          'border-radius:3px;padding:2px 5px;margin-bottom:2px;font-size:9.5px;line-height:1.45;font-weight:600;' +
          'word-break:keep-all;overflow-wrap:break-word;white-space:normal;">' + timeStr + txt + '</div>';
      }).join('');

      return '<td style="background:' + cellBg + ';vertical-align:top;padding:5px 4px 4px;' +
        'border:1px solid #e0e4ef;width:14.28%;">' +
        '<div style="' + numStyle + 'margin-bottom:4px;">' + cellDate.getDate() + '</div>' +
        (chipsHtml ? '<div>' + chipsHtml + '</div>' : '') +
        '</td>';
    }

    function buildMonthPage(year, month, isLast, customTitle) {
      var first = new Date(year, month, 1);
      var start = new Date(first);
      start.setDate(start.getDate() - start.getDay());
      var MONTH_KO = year + '년 ' + (month + 1) + '월';
      var DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

      var headerCols = DAY_NAMES.map(function (n, i) {
        var col = i === 0 ? '#e53935' : i === 6 ? '#1565C0' : '#3c4152';
        var bg  = i === 0 ? '#fff5f5' : i === 6 ? '#f0f4ff' : '#f4f6fb';
        return '<th style="background:' + bg + ';color:' + col + ';font-weight:700;font-size:12px;' +
          'padding:7px 0;text-align:center;border:1px solid #e0e4ef;">' + n + '</th>';
      }).join('');

      var rows = '';
      for (var w = 0; w < 6; w++) {
        rows += '<tr style="break-inside:avoid;page-break-inside:avoid;">';
        for (var wd = 0; wd < 7; wd++) {
          var cellDate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + wd);
          rows += buildCell(cellDate, month);
        }
        rows += '</tr>';
      }

      var legendHtml = cals.map(function (c) {
        return '<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;">' +
          '<span style="width:9px;height:9px;border-radius:50%;background:' + c.color + ';flex-shrink:0;"></span>' +
          '<span style="font-size:10px;color:#555;">' + c.name + '</span></span>';
      }).join('');

      // 표지 제목: 커스텀 제목이 있으면 사용, 없으면 월/년
      var displayTitle = customTitle || MONTH_KO;
      var subTitle     = customTitle ? MONTH_KO : '';

      // 달력 전체가 페이지 중간에 잘리지 않도록 break-inside:avoid
      var pageBreak = isLast ? '' : 'page-break-after:always;break-after:page;';
      return '<div style="' + pageBreak + 'padding:14px 18px 10px;break-inside:avoid;page-break-inside:avoid;">' +
        // 헤더 (출력일/경로 제거)
        '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px;">' +
        '  <div>' +
        '    <div style="font-size:10px;color:#888;font-weight:600;margin-bottom:2px;">ASEA 일정 관리</div>' +
        '    <div style="font-size:24px;font-weight:900;color:#1a1a2e;letter-spacing:-.03em;">' + displayTitle + '</div>' +
        (subTitle ? '<div style="font-size:13px;color:#888;margin-top:2px;">' + subTitle + '</div>' : '') +
        '  </div>' +
        '</div>' +
        // 범례
        (legendHtml ? '<div style="margin-bottom:8px;display:flex;flex-wrap:wrap;">' + legendHtml + '</div>' : '') +
        // 테이블 — 전체도 잘림 방지
        '<table style="width:100%;border-collapse:collapse;table-layout:fixed;break-inside:avoid;page-break-inside:avoid;">' +
        '<thead><tr>' + headerCols + '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '</table>' +
        '</div>';
    }

    // 모든 월 페이지 생성
    var pagesHtml = '';
    var cur = { y: startYear, m: startMonth - 1 }; // JS month 0-based
    var end = { y: endYear,   m: endMonth - 1 };
    var count = 0;
    while (cur.y < end.y || (cur.y === end.y && cur.m <= end.m)) {
      var isLast = (cur.y === end.y && cur.m === end.m);
      pagesHtml += buildMonthPage(cur.y, cur.m, isLast, docTitle);
      cur.m++;
      if (cur.m > 11) { cur.m = 0; cur.y++; }
      count++;
      if (count > 24) break; // 안전장치
    }

    var rangeLabel = startYear + '년 ' + startMonth + '월' +
      (count > 1 ? ' ~ ' + endYear + '년 ' + endMonth + '월' : '');

    var html = '<!DOCTYPE html><html lang="ko"><head>' +
      '<meta charset="UTF-8">' +
      '<title>ASEA 달력 — ' + rangeLabel + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700;900&display=swap" rel="stylesheet">' +
      '<style>' +
      '* { box-sizing:border-box; margin:0; padding:0; }' +
      'body { font-family:"Noto Sans KR",sans-serif; background:#fff;' +
      '  -webkit-print-color-adjust:exact; print-color-adjust:exact; }' +
      'td { word-break:keep-all; overflow-wrap:break-word; vertical-align:top; }' +
      /* 페이지 잘림 방지 핵심 규칙 */
      'table { border-collapse:collapse; table-layout:fixed; }' +
      'tr { break-inside:avoid; page-break-inside:avoid; }' +
      'td { break-inside:avoid; page-break-inside:avoid; }' +
      '@page { size:A4 landscape; margin:10mm 10mm; }' +
      '@media print {' +
      '  .no-print { display:none !important; }' +
      '  body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }' +
      '  .month-block { break-inside:avoid; page-break-inside:avoid; }' +
      '  tr { break-inside:avoid; page-break-inside:avoid; }' +
      '  td { break-inside:avoid; page-break-inside:avoid; }' +
      '}' +
      '.btn-bar { text-align:center; padding:14px 0 8px; display:flex; gap:12px; justify-content:center; }' +
      '.pbtn { padding:9px 28px; border:none; border-radius:8px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; }' +
      '.pbtn-print { background:#1A73E8; color:#fff; }' +
      '.pbtn-close  { background:#f1f3f4; color:#3c4152; }' +
      '</style></head><body>' +
      '<div class="btn-bar no-print">' +
      '  <button class="pbtn pbtn-print" onclick="window.print()">🖨 인쇄 / PDF 저장</button>' +
      '  <button class="pbtn pbtn-close" onclick="window.close()">✕ 닫기</button>' +
      '</div>' +
      pagesHtml +
      '</body></html>';

    var win = window.open('', '_blank', 'width=1100,height=820,scrollbars=yes');
    if (!win) { toast('팝업이 차단됐습니다. 브라우저 팝업 허용 후 다시 시도하세요.', 'error'); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.onload = function () { setTimeout(function () { win.focus(); }, 200); };
  }

  /* ────────────────────────────────────────────────────────────────
     년/월 직접 이동 팝업
  ──────────────────────────────────────────────────────────────── */
  function initCalJumpPopup() {
    var titleEl = $('calendar-title');
    var popup   = $('cal-jump-popup');
    var yearInp = $('cal-jump-year');
    var monInp  = $('cal-jump-month');
    var goBtn   = $('cal-jump-go');
    if (!titleEl || !popup) return;

    function openPopup() {
      var d = S.viewDate;
      yearInp.value = d.getFullYear();
      monInp.value  = d.getMonth() + 1;
      popup.hidden  = false;
      yearInp.select();
    }
    function closePopup() { popup.hidden = true; }

    function jumpTo(year, month) {
      if (isNaN(year) || isNaN(month)) return;
      month = Math.max(1, Math.min(12, month));
      S.viewDate = new Date(year, month - 1, 1);
      closePopup();
      renderCalendar();
    }

    titleEl.addEventListener('click', function (e) {
      e.stopPropagation();
      if (popup.hidden) openPopup(); else closePopup();
    });

    goBtn.addEventListener('click', function () {
      jumpTo(parseInt(yearInp.value), parseInt(monInp.value));
    });

    [yearInp, monInp].forEach(function (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') jumpTo(parseInt(yearInp.value), parseInt(monInp.value));
        if (e.key === 'Escape') closePopup();
      });
    });

    // 빠른 이동 버튼
    popup.querySelectorAll('.cal-jump-qbtn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var offset = parseInt(btn.dataset.offset);
        if (offset === 0) {
          S.viewDate = new Date();
        } else {
          var d = S.viewDate;
          S.viewDate = new Date(d.getFullYear(), d.getMonth() + offset, 1);
        }
        closePopup();
        renderCalendar();
      });
    });

    // 팝업 외부 클릭 시 닫기
    document.addEventListener('click', function (e) {
      if (!popup.hidden && !popup.contains(e.target) && e.target !== titleEl) {
        closePopup();
      }
    });
  }

  /* ────────────────────────────────────────────────────────────────
     이벤트 모달 — 반복으로 추가 등록 버튼
  ──────────────────────────────────────────────────────────────── */
  function initAddRecurBtn() {
    var btn = $('add-recur-btn');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      var title = $('event-title').value.trim();
      var start = $('event-start').value;
      var end   = $('event-end').value;
      var dept  = $('event-dept').value;
      var desc  = $('event-description').value.trim();

      if (!title)                           { toast('제목을 입력하세요.', 'error'); return; }
      if (!start || !end)                   { toast('시작·종료 시간을 입력하세요.', 'error'); return; }
      if (new Date(start) >= new Date(end)) { toast('종료는 시작 이후여야 합니다.', 'error'); return; }

      var recurrence = buildRecurrence();
      if (!recurrence.length) {
        // 반복 드롭다운으로 스크롤 후 포커스
        var recurTypeEl2 = $('event-recur-type');
        if (recurTypeEl2) {
          recurTypeEl2.scrollIntoView({ behavior: 'smooth', block: 'center' });
          recurTypeEl2.focus();
          recurTypeEl2.style.outline = '2px solid #e53935';
          setTimeout(function() { recurTypeEl2.style.outline = ''; }, 1800);
        }
        toast('⬆ 반복 유형을 먼저 선택해주세요 (반복 없음 → 매일/매주 등)', 'warning');
        return;
      }

      var tz        = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
      var fullDesc  = desc + (desc ? '\n' : '') + '[부서:' + dept + ']';
      var dIdx      = CONFIG.departments.findIndex(function (d) { return d.name === dept; });
      var palette   = ['1','2','3','4','5','6','7','8','9','10','11'];
      var colorId   = palette[dIdx >= 0 ? dIdx % palette.length : 10];
      var targetCals = (S.editCalendars && S.editCalendars.length > 0)
        ? S.editCalendars.map(function (c) { return c.id; })
        : [CONFIG.calendarId];

      var eventData = {
        summary:     title,
        description: fullDesc,
        start: { dateTime: new Date(start).toISOString(), timeZone: tz },
        end:   { dateTime: new Date(end).toISOString(),   timeZone: tz },
        colorId: colorId,
        recurrence: recurrence,
      };

      btn.disabled = true;
      try {
        for (var i = 0; i < targetCals.length; i++) {
          await CalendarModule.createEvent(targetCals[i], eventData);
        }
        toast('🔁 반복 일정이 추가되었습니다. (기존 일정은 유지됩니다)', 'success');
        closeModal('event-modal');
        await renderCalendar();
      } catch (e) {
        toast('추가 실패: ' + e.message, 'error');
      } finally {
        btn.disabled = false;
      }
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
    } else {
      sel.innerHTML = '';
      cals.forEach(function (cal) {
        var opt = document.createElement('option');
        opt.value = cal.id;
        opt.textContent = cal.summary + (cal.primary ? ' (기본)' : '');
        if (cal.primary) opt.selected = true;
        sel.appendChild(opt);
      });
    }
    // API 박스 값 동기화 (설정 탭과 동일 CONFIG 사용)
    _syncExtractApiBox();
  }

  // 일정발췃 탭 API 키/Base URL 박스 ↔ CONFIG/localStorage 동기화
  function _syncExtractApiBox() {
    var keyEl     = $('extract-api-key');
    var baseEl    = $('extract-api-base-url');
    if (!keyEl || !baseEl) return;
    if (CONFIG.anthropicApiKey)  keyEl.value  = CONFIG.anthropicApiKey;
    if (CONFIG.anthropicBaseUrl) baseEl.value = CONFIG.anthropicBaseUrl;
  }

  function _initExtractApiBox() {
    var btn = $('extract-save-api-btn');
    if (!btn || btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', function () {
      var key     = $('extract-api-key').value.trim();
      var baseUrl = $('extract-api-base-url').value.trim().replace(/\/$/, '');
      if (!key) { toast('API 키를 입력하세요.', 'error'); return; }
      // CONFIG 및 localStorage 저장 (설정 탭과 동일 키)
      CONFIG.anthropicApiKey  = key;
      CONFIG.anthropicBaseUrl = baseUrl;
      try { localStorage.setItem(CONFIG.storageKeys.anthropicApiKey,  key);     } catch (e) {}
      try { localStorage.setItem(CONFIG.storageKeys.anthropicBaseUrl, baseUrl); } catch (e) {}
      // 설정 탭 입력란도 동기화
      if ($('setting-api-key'))      $('setting-api-key').value      = key;
      if ($('setting-api-base-url')) $('setting-api-base-url').value = baseUrl;
      // 저장 메시지 표시
      var msg = $('extract-api-saved-msg');
      if (msg) { msg.style.display = 'inline'; setTimeout(function () { msg.style.display = 'none'; }, 2500); }
      var label = baseUrl ? 'Claude API 키 + Base URL 저장 (' + baseUrl + ')' : 'Claude API 키 저장됨';
      toast(label, 'success');
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

    _initExtractApiBox();   // API 키/Base URL 저장 버튼 초기화

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

  // API 키 형식으로 공식 Anthropic vs 프록시(aiapiflow/amplifuse) 자동 판별
  // 공식 키: sk-ant-api03-... (Anthropic 공식 형식)
  // 프록시 키: sk- + 64자리 hex (예: sk-9bbf3bf6cc178caee...)
  function resolveClaudeEndpoint(key) {
    var isOfficial = /^sk-ant-/.test(key);
    var url = isOfficial
      ? 'https://api.anthropic.com/v1/messages'
      : 'https://api.amplifuse.io/v1/messages';   // aiapiflow 프록시 엔드포인트
    return { url: url, isOfficial: isOfficial };
  }

  async function runExtract() {
    var _cc = window.getClaudeConfig ? getClaudeConfig() : { apiKey: CONFIG.anthropicApiKey, endpoint: 'https://api.anthropic.com/v1/messages', isOfficial: true };
    var apiKey = _cc.apiKey;
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

      // Claude API 호출
      var _reqHeaders = {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
      };
      if (_cc.isOfficial) _reqHeaders['anthropic-dangerous-direct-browser-access'] = 'true';
      var response = await fetch(_cc.endpoint, {
        method: 'POST',
        headers: _reqHeaders,
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
        var _parts = String((e.target && e.target.result) || '').split(',');
        if (_parts.length < 2 || !_parts[1]) { reject(new Error('파일 변환 실패')); return; }
        resolve(_parts[1]);
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
        // 시간 정보 유무 판별: "T00:00:00" 이거나 시간 부분이 없으면 종일 이벤트
        var _hasTime = function (dt) {
          if (!dt) return false;
          var t = dt.split('T')[1];
          return t && t !== '00:00:00' && t !== '00:00';
        };
        var startHasTime = _hasTime(ev.startDateTime);
        var endHasTime   = _hasTime(ev.endDateTime);
        var isAllDay     = !startHasTime && !endHasTime;

        var eventBody;
        if (isAllDay) {
          // 종일 이벤트: date 형식(YYYY-MM-DD), end는 다음날로 설정
          var startDate = (ev.startDateTime || '').split('T')[0];
          var endDate   = (ev.endDateTime   || '').split('T')[0];
          if (!endDate || endDate === startDate) {
            // 종료일이 없거나 시작과 같으면 다음날
            var d = new Date(startDate); d.setDate(d.getDate() + 1);
            endDate = d.toISOString().split('T')[0];
          }
          eventBody = {
            summary:     ev.title,
            description: (ev.description || '') + '\n[부서:' + dept + ']',
            start: { date: startDate },
            end:   { date: endDate },
            colorId: colorId,
          };
        } else {
          eventBody = {
            summary:     ev.title,
            description: (ev.description || '') + '\n[부서:' + dept + ']',
            start: { dateTime: new Date(ev.startDateTime).toISOString(), timeZone: tz },
            end:   { dateTime: new Date(ev.endDateTime).toISOString(),   timeZone: tz },
            colorId: colorId,
          };
        }
        await CalendarModule.createEvent(calId, eventBody);
        ok++;
      } catch (e) { fail++; }
    }

    btn.disabled = false;
    btn.textContent = '선택 항목 등록';
    toast('등록 완료: ' + ok + '건 성공' + (fail ? ', ' + fail + '건 실패' : ''), ok ? 'success' : 'error');
    if (ok > 0 && S.tab === 'calendar') renderCalendar();
  }

  /* ═══════════════════════════════════════════════════════════
     작업지시 탭
  ═══════════════════════════════════════════════════════════ */
  var _woLoaded = false;
  var _woOrders = [];
  var _woStaff = [];
  var _woEditOrder = null;
  var _woFilterStatus = 'all';
  var _woFilterPriority = 'all';

  function initWorkOrderTab() {
    if (!_woLoaded) {
      _woLoaded = true;
      _bindWorkOrderUI();
    }
    _loadWorkOrders();
    _loadManagerStaff();
  }

  function _bindWorkOrderUI() {
    var addBtn = $('wo-main-add-btn');
    if (addBtn) addBtn.addEventListener('click', function () { _openWoModal(null); });

    var refreshBtn = $('wo-main-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { _loadWorkOrders(); _loadManagerStaff(); });

    var closeBtn = $('wo-main-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', _closeWoModal);

    var cancelBtn = $('wo-main-modal-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', _closeWoModal);

    var backdrop = $('wo-main-modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', _closeWoModal);

    var saveBtn = $('wo-main-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', _saveWoOrder);

    var deleteBtn = $('wo-main-delete-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', _deleteWoOrder);

    var statusFilter = $('wo-main-filter-status');
    if (statusFilter) statusFilter.addEventListener('change', function () { _woFilterStatus = this.value; _renderWorkOrders(); });

    var priorityFilter = $('wo-main-filter-priority');
    if (priorityFilter) priorityFilter.addEventListener('change', function () { _woFilterPriority = this.value; _renderWorkOrders(); });
  }

  async function _loadWorkOrders() {
    var listEl = $('wo-main-list');
    if (!listEl) return;
    listEl.innerHTML = '<p class="empty-state">불러오는 중...</p>';
    try {
      _woOrders = (await SheetsModule.getWorkOrders()) || [];
      _renderWorkOrders();
      _updateWoBadge();
    } catch (e) {
      listEl.innerHTML = '<p class="empty-state" style="color:#e53935">불러오기 실패: ' + e.message + '</p>';
    }
  }

  async function _loadManagerStaff() {
    try { _woStaff = (await SheetsModule.getManagerStaff()) || []; } catch (e) { _woStaff = []; }
  }

  function _updateWoBadge() {
    var badge = $('workorder-badge');
    if (!badge) return;
    var cnt = _woOrders.filter(function (o) { return o.status === '대기' || o.status === '진행중'; }).length;
    if (cnt > 0) { badge.textContent = cnt; badge.hidden = false; }
    else badge.hidden = true;
  }

  function _renderWorkOrders() {
    var listEl = $('wo-main-list');
    if (!listEl) return;

    var filtered = _woOrders.filter(function (o) {
      if (_woFilterStatus !== 'all' && o.status !== _woFilterStatus) return false;
      if (_woFilterPriority !== 'all' && o.priority !== _woFilterPriority) return false;
      return true;
    }).sort(function (a, b) {
      var po = { '긴급': 0, '높음': 1, '보통': 2, '낮음': 3 };
      var diff = (po[a.priority] || 2) - (po[b.priority] || 2);
      if (diff !== 0) return diff;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    if (!filtered.length) {
      listEl.innerHTML = '<p class="empty-state">작업지시 내역이 없습니다.</p>';
      return;
    }

    var pColor = { '긴급': '#EA4335', '높음': '#F57C00', '보통': '#4285F4', '낮음': '#9AA0A6' };
    var sColor = { '대기': '#9AA0A6', '진행중': '#1A73E8', '완료': '#34A853', '취소': '#EA4335' };

    listEl.innerHTML = filtered.map(function (o) {
      var pc = pColor[o.priority] || '#9AA0A6';
      var sc = sColor[o.status] || '#9AA0A6';
      var due = o.dueDate ? ' | 기한: ' + o.dueDate : '';
      var stBtns = '';
      if (o.status === '대기')    stBtns += '<button class="btn btn-secondary btn-xs wo-main-status-btn" data-id="' + o.id + '" data-row="' + o._row + '" data-status="진행중">▶ 진행 시작</button>';
      if (o.status === '진행중')  stBtns += '<button class="btn btn-secondary btn-xs wo-main-status-btn" data-id="' + o.id + '" data-row="' + o._row + '" data-status="완료">✅ 완료</button>';
      if (o.status !== '취소' && o.status !== '완료') stBtns += '<button class="btn btn-ghost btn-xs wo-main-status-btn" style="color:#EA4335" data-id="' + o.id + '" data-row="' + o._row + '" data-status="취소">취소</button>';
      stBtns += '<button class="btn btn-ghost btn-xs wo-main-edit-btn" data-id="' + o.id + '">✏️ 수정</button>';

      return '<div class="wo-card" data-priority="' + _esc(o.priority) + '">' +
        '<div class="wo-card-header">' +
          '<span class="wo-badge" style="background:' + pc + '">' + _esc(o.priority||'보통') + '</span>' +
          '<span class="wo-badge" style="background:' + sc + '">' + _esc(o.status||'대기') + '</span>' +
          (o.department ? '<span class="wo-dept">' + _esc(o.department) + '</span>' : '') +
          '<span class="wo-date">' + _woFmtDate(o.createdAt) + due + '</span>' +
        '</div>' +
        '<div class="wo-card-title">' + _esc(o.title) + '</div>' +
        '<div class="wo-card-meta">요청: ' + _esc(o.requesterName||o.requesterId||'') +
          (o.assigneeName ? ' → 담당: ' + _esc(o.assigneeName) : '') +
        '</div>' +
        (o.content ? '<div class="wo-card-content">' + _esc(o.content) + '</div>' : '') +
        '<div class="wo-card-actions">' + stBtns + '</div>' +
      '</div>';
    }).join('');

    listEl.querySelectorAll('.wo-main-status-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { _changeWoStatus(btn.dataset.id, parseInt(btn.dataset.row), btn.dataset.status); });
    });
    listEl.querySelectorAll('.wo-main-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var o = _woOrders.find(function (x) { return x.id === btn.dataset.id; });
        if (o) _openWoModal(o);
      });
    });
  }

  async function _changeWoStatus(id, rowNum, status) {
    try {
      var completedAt = (status === '완료') ? new Date().toISOString() : '';
      await SheetsModule.updateWorkOrderStatus(rowNum, status, completedAt);
      var o = _woOrders.find(function (x) { return x.id === id; });
      if (o) { o.status = status; if (completedAt) o.completedAt = completedAt; }
      _renderWorkOrders();
      _updateWoBadge();
      toast(status + ' 처리 완료', 'success');
    } catch (e) {
      toast('상태 변경 실패: ' + e.message, 'error');
    }
  }

  function _openWoModal(order) {
    _woEditOrder = order || null;
    $('wo-main-modal-title').textContent = order ? '작업지시 수정' : '작업지시 등록';
    $('wo-main-title').value    = order ? (order.title    || '') : '';
    $('wo-main-content').value  = order ? (order.content  || '') : '';
    $('wo-main-priority').value = order ? (order.priority || '보통') : '보통';
    $('wo-main-due').value      = order ? (order.dueDate  || '') : '';
    $('wo-main-dept').value     = order ? (order.department || '') : '';
    $('wo-main-note').value     = order ? (order.note     || '') : '';

    var assigneeEl = $('wo-main-assignee');
    if (assigneeEl) {
      assigneeEl.innerHTML = '<option value="">담당자 선택</option>';
      _woStaff.filter(function (s) { return s.status !== 'inactive'; }).forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name + (s.shift ? ' (' + s.shift + ')' : '');
        if (order && order.assigneeId === s.id) opt.selected = true;
        assigneeEl.appendChild(opt);
      });
    }

    var deleteBtn = $('wo-main-delete-btn');
    if (deleteBtn) deleteBtn.hidden = !order;

    $('wo-main-modal').hidden = false;
  }

  function _closeWoModal() {
    $('wo-main-modal').hidden = true;
    _woEditOrder = null;
  }

  async function _saveWoOrder() {
    var title = ($('wo-main-title').value || '').trim();
    if (!title) { toast('제목을 입력하세요.', 'warning'); return; }

    var assigneeEl = $('wo-main-assignee');
    var assigneeId   = assigneeEl ? assigneeEl.value : '';
    var assigneeName = '';
    if (assigneeId) {
      var found = _woStaff.find(function (s) { return s.id === assigneeId; });
      if (found) assigneeName = found.name;
    }

    var wo = {
      title: title,
      content: $('wo-main-content').value || '',
      requesterId: S.userEmail || '',
      requesterName: S.userEmail || '',
      assigneeId: assigneeId,
      assigneeName: assigneeName,
      department: $('wo-main-dept').value || '',
      priority: $('wo-main-priority').value || '보통',
      dueDate: $('wo-main-due').value || '',
      note: $('wo-main-note').value || '',
    };

    var saveBtn = $('wo-main-save-btn');
    if (saveBtn) saveBtn.disabled = true;

    try {
      if (_woEditOrder) {
        wo.id = _woEditOrder.id;
        wo.status = _woEditOrder.status;
        wo.createdAt = _woEditOrder.createdAt;
        wo.completedAt = _woEditOrder.completedAt || '';
        wo.calEventId = _woEditOrder.calEventId || '';
        await SheetsModule.updateWorkOrder(_woEditOrder._row, wo);
        Object.assign(_woEditOrder, wo);
        toast('수정 완료', 'success');
      } else {
        wo.status = '대기';
        var newId = await SheetsModule.createWorkOrder(wo);
        wo.id = newId;
        if (wo.dueDate) {
          try {
            var evt = await CalendarModule.createEvent('primary', {
              summary: '[작업지시] ' + wo.title,
              description: wo.content + (wo.assigneeName ? '\n담당: ' + wo.assigneeName : ''),
              start: { date: wo.dueDate },
              end: { date: wo.dueDate },
              colorId: '11',
            });
            wo.calEventId = (evt && evt.id) ? evt.id : '';
          } catch (ce) { wo.calEventId = ''; }
        }
        _woOrders.unshift(wo);
        toast('등록 완료', 'success');
      }
      _closeWoModal();
      _renderWorkOrders();
      _updateWoBadge();
    } catch (e) {
      toast('저장 실패: ' + e.message, 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function _deleteWoOrder() {
    if (!_woEditOrder) return;
    if (!confirm('이 작업지시를 취소 처리하시겠습니까?')) return;
    try {
      await SheetsModule.deleteWorkOrder(_woEditOrder._row);
      _woEditOrder.status = '취소';
      _closeWoModal();
      _renderWorkOrders();
      _updateWoBadge();
      toast('취소 처리 완료', 'success');
    } catch (e) {
      toast('삭제 실패: ' + e.message, 'error');
    }
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function _woFmtDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0');
    } catch (e) { return String(iso).slice(0, 10); }
  }

  /* ═══════════════════════════════════════════════════════════
     설정 탭 아코디언 + 관리실 인원
  ═══════════════════════════════════════════════════════════ */
  function _initSettingsAccordion() {
    document.querySelectorAll('.settings-cat-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var catId = btn.dataset.cat;
        var body = document.getElementById(catId);
        if (!body) return;
        var isOpen = body.classList.contains('open');
        body.classList.toggle('open', !isOpen);
        btn.classList.toggle('active', !isOpen);
        var arrow = btn.querySelector('.settings-cat-arrow');
        if (arrow) arrow.textContent = !isOpen ? '▲' : '▼';
      });
    });
  }

  var _mgrStaffLoaded = false;
  function _initMgrStaff() {
    if (_mgrStaffLoaded) return;
    _mgrStaffLoaded = true;

    var addBtn = $('mgr-add-btn');
    if (addBtn) addBtn.addEventListener('click', async function () {
      var name  = ($('mgr-add-name').value || '').trim();
      var email = ($('mgr-add-email').value || '').trim();
      var phone = ($('mgr-add-phone').value || '').trim();
      var shift = $('mgr-add-shift').value;
      if (!name) { toast('이름을 입력하세요.', 'warning'); return; }
      try {
        await SheetsModule.addManagerStaff({ name: name, googleEmail: email, phone: phone, shift: shift });
        $('mgr-add-name').value = '';
        $('mgr-add-email').value = '';
        $('mgr-add-phone').value = '';
        $('mgr-add-shift').value = '';
        _renderMgrStaff();
        toast('등록 완료', 'success');
      } catch (e) {
        toast('등록 실패: ' + e.message, 'error');
      }
    });

    _renderMgrStaff();
  }

  async function _renderMgrStaff() {
    var listEl = $('mgr-staff-list');
    if (!listEl) return;
    try {
      var staff = (await SheetsModule.getManagerStaff()) || [];
      var active = staff.filter(function (s) { return s.status !== 'inactive'; });
      if (!active.length) { listEl.innerHTML = '<p class="empty-state" style="padding:8px">등록된 인원이 없습니다.</p>'; return; }
      var shiftColor = { '주간': '#1A73E8', '야간': '#5C6BC0', '비번': '#9AA0A6', '': '#9AA0A6' };
      listEl.innerHTML = active.map(function (s) {
        var sc = shiftColor[s.shift] || '#9AA0A6';
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border)">' +
          '<span style="font-size:18px">👤</span>' +
          '<div style="flex:1"><div style="font-weight:600">' + _esc(s.name) + '</div>' +
          '<div style="font-size:11px;color:var(--color-text-secondary)">' + _esc(s.googleEmail||'') + (s.phone ? ' · ' + _esc(s.phone) : '') + '</div></div>' +
          (s.shift ? '<span style="background:' + sc + ';color:#fff;border-radius:4px;padding:2px 8px;font-size:11px">' + _esc(s.shift) + '</span>' : '') +
          '<button class="btn btn-ghost btn-xs mgr-del-btn" data-row="' + s._row + '">삭제</button>' +
        '</div>';
      }).join('');

      listEl.querySelectorAll('.mgr-del-btn').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          if (!confirm('삭제하시겠습니까?')) return;
          try {
            await SheetsModule.deleteManagerStaff(parseInt(btn.dataset.row));
            _renderMgrStaff();
            toast('삭제 완료', 'success');
          } catch (e) { toast('삭제 실패: ' + e.message, 'error'); }
        });
      });
    } catch (e) {
      listEl.innerHTML = '<p class="empty-state" style="padding:8px;color:#e53935">불러오기 실패: ' + e.message + '</p>';
    }
  }

  /* ═══════════════════════════════════════════════════════════
     설정 탭
  ═══════════════════════════════════════════════════════════ */
  var _settingsAccordionInited = false;
  function renderSettingsTab() {
    $('settings-user-email').textContent = S.userEmail || CONFIG.senderEmail;
    _updateSettingsRoleBadge();
    _applySettingsAdminVisibility();
    $('setting-folder-id').value = CONFIG.driveReportFolderId !== 'YOUR_FOLDER_ID'
      ? CONFIG.driveReportFolderId : '';
    var storedKey = CONFIG.anthropicApiKey;
    if (storedKey) $('setting-api-key').value = storedKey;
    if (CONFIG.anthropicBaseUrl) $('setting-api-base-url').value = CONFIG.anthropicBaseUrl;
    if (CONFIG.geminiApiKey) $('setting-gemini-key').value = CONFIG.geminiApiKey;
    if (CONFIG.makeWebhookUrl) $('setting-make-webhook').value = CONFIG.makeWebhookUrl;
    if (CONFIG.githubToken) $('setting-github-token').value = CONFIG.githubToken;
    renderSettingsRecipients();
    renderDeptList();
    renderMyCalendarsList();
    renderSharedCalendars();
    if (!_settingsAccordionInited) {
      _settingsAccordionInited = true;
      _initSettingsAccordion();
    }
    _initMgrStaff();
    _initBaseUrl();
    _initCheckinProxy();
    _initCalendarSubscribe();
    if (window.AdminModule && AdminModule.initAmulboAdmin) AdminModule.initAmulboAdmin();
  }

  function _updateSettingsRoleBadge() {
    var badge = $('settings-role-badge');
    if (!badge) return;
    var isAdm = window.AdminModule && AdminModule.isAdmin && AdminModule.isAdmin();
    var email = S.userEmail || '';
    if (!email) { badge.style.display = 'none'; return; }
    badge.style.display = 'inline-block';
    badge.textContent = isAdm ? '관리자' : '사용자';
    badge.style.cssText = 'display:inline-block;margin-left:8px;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;' +
      (isAdm ? 'background:#1a73e8;color:#fff' : 'background:#e8f0fe;color:#1a73e8');
  }

  function _applySettingsAdminVisibility() {
    var isAdm = window.AdminModule && AdminModule.isAdmin && AdminModule.isAdmin();
    document.querySelectorAll('[data-admin-only]').forEach(function(el) {
      el.style.display = isAdm ? '' : 'none';
    });
  }

  var _calSubInited = false;
  function _initCalendarSubscribe() {
    if (_calSubInited) return;
    _calSubInited = true;
    var btn = $('calsub-subscribe-btn');
    var input = $('calsub-subscribe-input');
    var status = $('calsub-subscribe-status');
    if (!btn || !input) return;
    btn.addEventListener('click', function() {
      var val = (input.value || '').trim();
      if (!val) { status.textContent = '❌ 캘린더 ID 또는 URL을 입력하세요.'; return; }
      status.textContent = '⏳ 처리 중...';
      /* iCal/ICS URL이면 구글 캘린더 URL로 추가 안내 */
      if (val.startsWith('http')) {
        var gcUrl = 'https://calendar.google.com/calendar/r/settings/addbyurl?url=' + encodeURIComponent(val);
        window.open(gcUrl, '_blank');
        status.textContent = '✅ 구글 캘린더 창이 열렸습니다. "캘린더 추가" 버튼을 눌러 완료하세요.';
        input.value = '';
        return;
      }
      /* Google Calendar ID면 API로 바로 구독 */
      if (!window.gapi || !gapi.client || !gapi.client.calendar) {
        status.textContent = '❌ Google 캘린더에 로그인 후 사용하세요.';
        return;
      }
      gapi.client.calendar.calendarList.insert({ resource: { id: val } })
        .then(function() {
          status.style.color = '#15803d';
          status.textContent = '✅ 구독 완료! 캘린더 목록 새로고침 버튼을 눌러 확인하세요.';
          input.value = '';
          setTimeout(function() { status.textContent = ''; }, 5000);
        })
        .catch(function(err) {
          var msg = (err && err.result && err.result.error && err.result.error.message) || '구독 실패';
          status.style.color = '#dc2626';
          status.textContent = '❌ ' + msg;
        });
    });
  }

  /* ── 기본 URL 설정 ── */
  var BASE_URL_KEY = 'asea_base_url';
  var DEFAULT_BASE_URL = 'https://bangdw-hash.github.io/asea-calendar-management/';

  (function _applyStoredBaseUrl() {
    var stored = localStorage.getItem(BASE_URL_KEY);
    if (stored) CONFIG.baseUrl = stored;
  })();

  var _baseUrlInited = false;
  function _initBaseUrl() {
    if (_baseUrlInited) return;
    _baseUrlInited = true;
    var input  = $('setting-base-url');
    var status = $('setting-base-url-status');
    if (!input) return;
    input.value = CONFIG.baseUrl || DEFAULT_BASE_URL;

    $('setting-base-url-save') && $('setting-base-url-save').addEventListener('click', function () {
      var url = (input.value || '').trim();
      if (!url) { status.textContent = '❌ URL을 입력하세요.'; return; }
      if (!url.endsWith('/')) url += '/';
      localStorage.setItem(BASE_URL_KEY, url);
      CONFIG.baseUrl = url;
      input.value = url;
      status.textContent = '✅ 저장했습니다. QR 코드 링크에 즉시 반영됩니다.';
      setTimeout(function () { status.textContent = ''; }, 3000);
    });

    $('setting-base-url-reset') && $('setting-base-url-reset').addEventListener('click', function () {
      localStorage.removeItem(BASE_URL_KEY);
      CONFIG.baseUrl = DEFAULT_BASE_URL;
      input.value = DEFAULT_BASE_URL;
      status.textContent = '↩️ 기본값으로 되돌렸습니다.';
      setTimeout(function () { status.textContent = ''; }, 2000);
    });
  }

  var _checkinProxyInited = false;
  function _initCheckinProxy() {
    if (_checkinProxyInited) return;
    _checkinProxyInited = true;
    var input = $('checkin-proxy-url-input');
    var status = $('checkin-proxy-status');
    if (!input) return;
    // 저장된 값 로드
    input.value = localStorage.getItem('asea_checkin_proxy_url') || '';
    $('checkin-proxy-save-btn') && $('checkin-proxy-save-btn').addEventListener('click', function () {
      var url = (input.value || '').trim();
      localStorage.setItem('asea_checkin_proxy_url', url);
      status.textContent = '✅ 저장했습니다.';
      setTimeout(function () { status.textContent = ''; }, 2000);
    });
    $('checkin-proxy-test-btn') && $('checkin-proxy-test-btn').addEventListener('click', async function () {
      var url = (input.value || '').trim();
      if (!url) { status.textContent = '❌ URL을 먼저 입력하세요.'; return; }
      status.textContent = '🔄 테스트 중...';
      try {
        var res = await fetch(url, { method: 'GET' });
        var json = await res.json();
        if (json.ok) {
          status.textContent = '✅ 연결 성공! 서비스: ' + (json.service || 'ok');
        } else {
          status.textContent = '⚠️ 응답 이상: ' + JSON.stringify(json);
        }
      } catch (e) {
        status.textContent = '❌ 연결 실패: ' + e.message;
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     🚪 강의실 입출입 관리 탭
  ═══════════════════════════════════════════════════════════ */
  var _ciMgmtInited   = false;
  var _ciSpaces       = [];
  var _ciLogs         = [];
  var _ciActiveSubTab = 'spaces';

  function initCheckinMgmtTab() {
    if (_ciMgmtInited) { _ciLoadSpaces(); return; }
    _ciMgmtInited = true;

    // 서브탭 전환
    document.querySelectorAll('.tab-sub-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _ciActiveSubTab = btn.dataset.ciTab;
        document.querySelectorAll('.tab-sub-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        $('ci-section-spaces').hidden = (_ciActiveSubTab !== 'spaces');
        $('ci-section-logs').hidden   = (_ciActiveSubTab !== 'logs');
        if (_ciActiveSubTab === 'logs') _ciRefreshRoomFilter();
      });
    });

    // 공간 관리 버튼
    $('ci-add-space-btn').addEventListener('click', function () { _ciOpenSpaceModal(); });
    $('ci-refresh-spaces-btn').addEventListener('click', _ciLoadSpaces);
    $('ci-space-modal-close').addEventListener('click', _ciCloseSpaceModal);
    $('ci-space-modal-cancel').addEventListener('click', _ciCloseSpaceModal);
    $('ci-space-modal-backdrop').addEventListener('click', _ciCloseSpaceModal);
    $('ci-space-save-btn').addEventListener('click', _ciSaveSpace);

    // GPS 토글
    $('ci-gps-toggle') && $('ci-gps-toggle').addEventListener('change', function () {
      var on = this.checked;
      $('ci-gps-fields').hidden = !on;
      $('ci-gps-toggle-label').textContent = on ? 'ON — GPS 제한 활성' : 'OFF — GPS 자유';
    });
    // 반경 슬라이더 실시간 표시
    $('ci-space-radius') && $('ci-space-radius').addEventListener('input', function () {
      $('ci-space-radius-val').textContent = this.value + 'm';
    });
    // 현재 위치 자동 입력
    $('ci-gps-locate-btn') && $('ci-gps-locate-btn').addEventListener('click', function () {
      var statusEl = $('ci-gps-locate-status');
      if (!navigator.geolocation) {
        statusEl.textContent = '⚠️ 이 브라우저는 GPS를 지원하지 않습니다.'; return;
      }
      this.disabled = true; this.textContent = '📡 위치 가져오는 중...';
      statusEl.textContent = '';
      var self = this;
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          $('ci-space-lat').value = pos.coords.latitude.toFixed(6);
          $('ci-space-lng').value = pos.coords.longitude.toFixed(6);
          statusEl.textContent = '✅ 현재 위치 입력 완료 (정확도 ±' + Math.round(pos.coords.accuracy) + 'm)';
          self.disabled = false; self.textContent = '📡 현재 위치로 자동 입력';
        },
        function (err) {
          var msg = err.code === 1 ? '위치 권한이 거부됐습니다. 브라우저 설정에서 허용해 주세요.'
                  : err.code === 2 ? '위치를 가져올 수 없습니다. 잠시 후 다시 시도하세요.'
                  : '위치 요청 시간이 초과됐습니다.';
          statusEl.textContent = '❌ ' + msg;
          self.disabled = false; self.textContent = '📡 현재 위치로 자동 입력';
        },
        { timeout: 10000, enableHighAccuracy: true }
      );
    });

    // QR 모달
    $('ci-qr-modal-close').addEventListener('click', function () { $('ci-qr-modal').hidden = true; });
    $('ci-qr-modal-backdrop').addEventListener('click', function () { $('ci-qr-modal').hidden = true; });
    $('ci-qr-download-btn').addEventListener('click', _ciDownloadQr);
    $('ci-qr-print-btn').addEventListener('click', function () {
      var img = $('ci-qr-img');
      var name = $('ci-qr-room-name').textContent;
      var w = window.open('');
      w.document.write('<html><head><title>' + name + ' QR</title></head><body style="text-align:center;padding:40px">' +
        '<img src="' + img.src + '" style="width:300px;height:300px"><br>' +
        '<h2 style="font-family:sans-serif;margin-top:16px">' + name + '</h2>' +
        '<p style="font-family:sans-serif;color:#888">' + $('ci-qr-room-location').textContent + '</p>' +
        '<script>window.onload=function(){window.print();window.close();}<\/script>' +
        '</body></html>');
      w.document.close();
    });

    // 로그 조회
    $('ci-log-load-btn').addEventListener('click', _ciLoadLogs);
    $('ci-log-filter-room').addEventListener('change', _ciRenderLogs);
    $('ci-log-filter-type').addEventListener('change', _ciRenderLogs);

    // 오늘 날짜 기본값
    $('ci-log-filter-date').value = window.toLocalYMD();

    _ciLoadSpaces();
  }

  /* ── 공간 관리 ── */
  async function _ciLoadSpaces() {
    $('ci-spaces-list').innerHTML = '<p class="empty-state">불러오는 중...</p>';
    try {
      _ciSpaces = (await SheetsModule.getSpaces()) || [];
      _ciRenderSpaces();
    } catch (e) {
      $('ci-spaces-list').innerHTML = '<p class="empty-state" style="color:#e53935">불러오기 실패: ' + e.message + '</p>';
    }
  }

  function _ciRenderSpaces() {
    if (!_ciSpaces.length) {
      $('ci-spaces-list').innerHTML =
        '<div class="empty-state">' +
        '<div style="font-size:40px;margin-bottom:10px">🚪</div>' +
        '<div>등록된 공간이 없습니다.</div>' +
        '<div style="font-size:13px;margin-top:6px">+ 공간 등록 버튼을 눌러 추가하세요.</div>' +
        '</div>';
      return;
    }
    var baseUrl = CONFIG.baseUrl || 'https://bangdw-hash.github.io/asea-calendar-management/';
    $('ci-spaces-list').innerHTML = _ciSpaces.map(function (sp, i) {
      var checkinUrl = baseUrl + 'checkin.html?room=' + encodeURIComponent(sp.id) +
        (sp.name ? '&name=' + encodeURIComponent(sp.name) : '');
      var hasGps = sp.lat && sp.lng;
      var gpsBadge = hasGps
        ? '<span style="display:inline-flex;align-items:center;gap:3px;background:#e3f2fd;color:#1565c0;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:700;margin-left:6px">📍 GPS 제한 ' + (sp.geoRadius || 100) + 'm</span>'
        : '<span style="display:inline-flex;align-items:center;gap:3px;background:#f1f3f4;color:#888;border-radius:20px;padding:2px 8px;font-size:11px;margin-left:6px">🆓 GPS 자유</span>';
      return '<div class="ci-space-card">' +
        '<div>' +
          '<div class="ci-space-card-name" style="display:flex;align-items:center;flex-wrap:wrap;gap:2px">🚪 ' + _esc(sp.name) + gpsBadge + '</div>' +
          '<div class="ci-space-card-meta">' +
            (sp.location ? '📍 ' + _esc(sp.location) : '') +
            (sp.description ? (sp.location ? '&nbsp;·&nbsp;' : '') + _esc(sp.description) : '') +
          '</div>' +
          '<div class="ci-space-card-url">' + checkinUrl + '</div>' +
        '</div>' +
        '<div class="ci-space-card-actions">' +
          '<button class="btn btn-primary btn-sm" onclick="_ciShowQr(\'' + sp.id + '\')">🔲 QR</button>' +
          '<button class="btn btn-secondary btn-sm" onclick="_ciOpenSpaceLogs(\'' + sp.id + '\',\'' + _esc(sp.name) + '\')">📊 현황</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="_ciEditSpace(' + i + ')">✏️ 수정</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="_ciDeleteSpace(' + sp._row + ',\'' + _esc(sp.name) + '\')" style="color:#e53935">삭제</button>' +
        '</div>' +
      '</div>';
    }).join('');
    _ciRefreshRoomFilter();
  }

  /* ── 공간별 입출입 현황 모달 ── */
  var _ciLogsModal = null;
  var _ciLogsRoomId = '';
  var _ciLogsRoomName = '';
  var _ciLogsData = [];

  function _ciOpenSpaceLogs(roomId, roomName) {
    _ciLogsRoomId   = roomId;
    _ciLogsRoomName = roomName;

    // 기존 모달 제거
    var old = document.getElementById('ci-logs-modal');
    if (old) old.remove();

    var today = window.toLocalYMD();

    var modal = document.createElement('div');
    modal.id = 'ci-logs-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center';
    modal.innerHTML =
      '<div id="ci-logs-backdrop" style="position:absolute;inset:0;background:rgba(0,0,0,.4)"></div>' +
      '<div style="position:relative;background:#fff;border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,.25);width:min(720px,96vw);max-height:90vh;display:flex;flex-direction:column">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e0e4ea;flex-shrink:0">' +
          '<div>' +
            '<div style="font-size:16px;font-weight:700">📊 ' + _esc(roomName) + ' 입출입 현황</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<button id="ci-logs-excel-btn" class="btn btn-secondary btn-sm" style="font-size:12px" disabled>⬇️ 엑셀 다운로드</button>' +
            '<button id="ci-logs-close" style="font-size:20px;background:none;border:none;cursor:pointer;color:#888">✕</button>' +
          '</div>' +
        '</div>' +
        /* 날짜 선택 + 달력 미니 */
        '<div style="padding:14px 20px;border-bottom:1px solid #f0f2f5;flex-shrink:0">' +
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
            '<label style="font-size:13px;font-weight:600;color:#5f6368">날짜 선택</label>' +
            '<input type="date" id="ci-logs-date" value="' + today + '" style="border:1.5px solid #dadce0;border-radius:7px;padding:6px 10px;font-size:14px;font-weight:600">' +
            '<button id="ci-logs-prev" class="btn btn-ghost btn-xs">◀ 전날</button>' +
            '<button id="ci-logs-today" class="btn btn-secondary btn-xs">오늘</button>' +
            '<button id="ci-logs-next" class="btn btn-ghost btn-xs">다음날 ▶</button>' +
            '<button id="ci-logs-load" class="btn btn-primary btn-sm" style="margin-left:auto">조회</button>' +
          '</div>' +
          /* 달력 미니 (주간) */
          '<div id="ci-logs-week-cal" style="display:flex;gap:4px;margin-top:10px;overflow-x:auto"></div>' +
        '</div>' +
        /* 요약 카드 */
        '<div id="ci-logs-summary" style="display:flex;gap:8px;padding:12px 20px;flex-shrink:0;flex-wrap:wrap"></div>' +
        /* 로그 목록 */
        '<div id="ci-logs-body" style="overflow-y:auto;padding:0 20px 16px;flex:1">' +
          '<p class="empty-state">날짜를 선택하고 조회 버튼을 누르세요.</p>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    _ciLogsModal = modal;

    // 이벤트
    document.getElementById('ci-logs-close').onclick    = _ciCloseLogsModal;
    document.getElementById('ci-logs-backdrop').onclick = _ciCloseLogsModal;
    document.getElementById('ci-logs-load').onclick     = _ciLoadSpaceLogs;
    document.getElementById('ci-logs-excel-btn').onclick = _ciDownloadLogsExcel;
    document.getElementById('ci-logs-today').onclick    = function () {
      document.getElementById('ci-logs-date').value = window.toLocalYMD();
      _ciLoadSpaceLogs();
    };
    document.getElementById('ci-logs-prev').onclick = function () {
      var d = new Date(document.getElementById('ci-logs-date').value);
      d.setDate(d.getDate() - 1);
      document.getElementById('ci-logs-date').value = window.toLocalYMD(d);
      _ciLoadSpaceLogs();
    };
    document.getElementById('ci-logs-next').onclick = function () {
      var d = new Date(document.getElementById('ci-logs-date').value);
      d.setDate(d.getDate() + 1);
      document.getElementById('ci-logs-date').value = window.toLocalYMD(d);
      _ciLoadSpaceLogs();
    };
    document.getElementById('ci-logs-date').onchange = _ciLoadSpaceLogs;

    _ciRenderWeekCal(today);
    _ciLoadSpaceLogs();
  }

  function _ciCloseLogsModal() {
    if (_ciLogsModal) { _ciLogsModal.remove(); _ciLogsModal = null; }
  }

  /* ── 입출입 현황 엑셀(CSV) 다운로드 ── */
  function _ciDownloadLogsExcel() {
    var logs = _ciLogsData;
    if (!logs || !logs.length) return;

    var dateEl = document.getElementById('ci-logs-date');
    var date   = dateEl ? dateEl.value : window.toLocalYMD();

    // 파일명: 시설명_조회일시_v1
    var now = new Date();
    var ts  = now.getFullYear() + '' +
              String(now.getMonth()+1).padStart(2,'0') +
              String(now.getDate()).padStart(2,'0') + '_' +
              String(now.getHours()).padStart(2,'0') +
              String(now.getMinutes()).padStart(2,'0');
    var safeName = (_ciLogsRoomName || '').replace(/[\\/:*?"<>|]/g, '_');
    var filename = safeName + '_' + ts + '_v1.csv';

    // CSV 헤더 + 행
    var BOM = '﻿';  // Excel UTF-8 BOM
    var header = ['날짜','시각','구분','공간','이름','소속','전화번호','기기ID'];
    var rows = logs.map(function (l) {
      var d = l.timestamp ? new Date(l.timestamp) : null;
      var dateStr = d ? (d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')) : date;
      var timeStr = d ? (String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0')) : '';
      return [
        dateStr,
        timeStr,
        l.checkType  || '',
        l.roomName   || l.roomId || '',
        l.userName   || '',
        l.affiliation|| '',
        l.phone      || '',
        l.deviceId   || '',
      ].map(function (v) {
        // 쉼표·따옴표 포함 셀 처리
        var s = String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      });
    });

    var csv = BOM + [header].concat(rows).map(function (r) { return r.join(','); }).join('\r\n');

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function _ciRenderWeekCal(selectedDate) {
    var calEl = document.getElementById('ci-logs-week-cal');
    if (!calEl) return;
    var sel = new Date(selectedDate);
    // 이번 주 월요일부터 일요일
    var day = sel.getDay();
    var mon = new Date(sel);
    mon.setDate(sel.getDate() - (day === 0 ? 6 : day - 1));

    var days = ['월','화','수','목','금','토','일'];
    var html = '';
    for (var i = 0; i < 7; i++) {
      var d = new Date(mon);
      d.setDate(mon.getDate() + i);
      var ds = window.toLocalYMD(d);
      var isToday = ds === window.toLocalYMD();
      var isSel   = ds === selectedDate;
      html += '<button class="ci-week-day-btn' +
        (isSel ? ' selected' : '') + (isToday ? ' today' : '') + '" ' +
        'data-date="' + ds + '" style="' +
        'flex:1;min-width:36px;padding:6px 4px;border-radius:8px;border:1.5px solid ' +
        (isSel ? '#1a73e8' : '#e0e4ea') + ';background:' +
        (isSel ? '#1a73e8' : isToday ? '#e8f0fe' : '#f8f9fa') +
        ';color:' + (isSel ? '#fff' : '#202124') + ';cursor:pointer;font-size:11px;text-align:center">' +
        '<div style="font-weight:700">' + days[i] + '</div>' +
        '<div>' + d.getDate() + '</div>' +
        '</button>';
    }
    calEl.innerHTML = html;

    calEl.querySelectorAll('.ci-week-day-btn').forEach(function (btn) {
      btn.onclick = function () {
        document.getElementById('ci-logs-date').value = btn.dataset.date;
        _ciLoadSpaceLogs();
      };
    });
  }

  async function _ciLoadSpaceLogs() {
    var bodyEl = document.getElementById('ci-logs-body');
    var sumEl  = document.getElementById('ci-logs-summary');
    var date   = document.getElementById('ci-logs-date').value || window.toLocalYMD();
    if (!bodyEl) return;

    _ciRenderWeekCal(date);

    bodyEl.innerHTML = '<p class="empty-state">불러오는 중...</p>';
    if (sumEl) sumEl.innerHTML = '';
    try {
      var allLogs = await SheetsModule.getCheckinLogs(null, date, date);
      _ciLogsData = allLogs.filter(function (l) { return l.roomId === _ciLogsRoomId; })
        .sort(function (a, b) { return (a.timestamp||'').localeCompare(b.timestamp||''); });
      _ciRenderSpaceLogs(date);
    } catch (e) {
      bodyEl.innerHTML = '<p class="empty-state" style="color:#e53935">로드 실패: ' + e.message + '</p>';
    }
  }

  function _ciRenderSpaceLogs(date) {
    var bodyEl = document.getElementById('ci-logs-body');
    var sumEl  = document.getElementById('ci-logs-summary');
    if (!bodyEl) return;

    var logs = _ciLogsData;
    var inCnt  = logs.filter(function(l){ return l.checkType==='입실'; }).length;
    var outCnt = logs.filter(function(l){ return l.checkType==='퇴실'; }).length;
    var users  = new Set(logs.map(function(l){ return l.deviceId||l.userName; }));

    if (sumEl) {
      sumEl.innerHTML =
        '<div class="ci-summary-card" style="background:#e8f5e9"><div class="ci-summary-label" style="color:#2e7d32">✅ 입실</div><div class="ci-summary-value" style="color:#2e7d32">' + inCnt + '건</div></div>' +
        '<div class="ci-summary-card" style="background:#fce4ec"><div class="ci-summary-label" style="color:#c62828">🚪 퇴실</div><div class="ci-summary-value" style="color:#c62828">' + outCnt + '건</div></div>' +
        '<div class="ci-summary-card" style="background:#e3f2fd"><div class="ci-summary-label" style="color:#1565c0">👤 인원</div><div class="ci-summary-value" style="color:#1565c0">' + users.size + '명</div></div>';
    }

    // 엑셀 버튼 활성/비활성
    var excelBtn = document.getElementById('ci-logs-excel-btn');
    if (excelBtn) excelBtn.disabled = !logs.length;

    if (!logs.length) {
      bodyEl.innerHTML = '<p class="empty-state" style="margin-top:20px">📭 ' + date + ' 입출입 기록이 없습니다.</p>';
      return;
    }

    // 사용자별 그룹핑 (deviceId or userName 기준)
    var userMap = {};
    logs.forEach(function (l) {
      var key = l.deviceId || l.userName;
      if (!userMap[key]) userMap[key] = { name: l.userName, affil: l.affiliation, phone: l.phone, logs: [] };
      userMap[key].logs.push(l);
    });

    var rows = Object.values(userMap).map(function (u) {
      var inLog  = u.logs.filter(function(l){ return l.checkType==='입실'; });
      var outLog = u.logs.filter(function(l){ return l.checkType==='퇴실'; });
      var lastIn  = inLog.sort(function(a,b){ return b.timestamp.localeCompare(a.timestamp); })[0];
      var lastOut = outLog.sort(function(a,b){ return b.timestamp.localeCompare(a.timestamp); })[0];

      function _ts(iso) {
        if (!iso) return '-';
        var d = new Date(iso);
        return String(d.getHours()).padStart(2,'0') + ':' +
               String(d.getMinutes()).padStart(2,'0') + ':' +
               String(d.getSeconds()).padStart(2,'0');
      }

      var duration = '';
      if (lastIn && lastOut) {
        var diff = Math.floor((new Date(lastOut.timestamp) - new Date(lastIn.timestamp)) / 60000);
        duration = diff >= 60
          ? Math.floor(diff/60) + '시간 ' + (diff%60) + '분'
          : diff + '분';
      }

      var statusBadge = lastOut
        ? '<span style="background:#fce4ec;color:#c62828;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">퇴실완료</span>'
        : lastIn
          ? '<span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">입실중</span>'
          : '';

      return '<div class="ci-log-user-row">' +
        '<div class="ci-log-user-info">' +
          '<span class="ci-log-user-name">' + _esc(u.name) + '</span>' +
          '<span class="ci-log-user-affil">' + _esc(u.affil) + '</span>' +
          statusBadge +
        '</div>' +
        '<div class="ci-log-times">' +
          '<div class="ci-log-time-item in">' +
            '<span class="ci-log-time-label">입실</span>' +
            '<span class="ci-log-time-val">' + _ts(lastIn && lastIn.timestamp) + '</span>' +
          '</div>' +
          '<div class="ci-log-time-item out">' +
            '<span class="ci-log-time-label">퇴실</span>' +
            '<span class="ci-log-time-val">' + _ts(lastOut && lastOut.timestamp) + '</span>' +
          '</div>' +
          (duration ? '<div class="ci-log-duration">⏱ ' + duration + '</div>' : '') +
        '</div>' +
      '</div>';
    });

    bodyEl.innerHTML =
      '<div style="font-size:12px;color:#888;margin:8px 0 10px">' + date + ' · 총 ' + logs.length + '건 · ' + users.size + '명</div>' +
      '<div class="ci-log-user-list">' + rows.join('') + '</div>';
  }

  function _ciOpenSpaceModal(sp) {
    // sp 가 있으면 수정 모드
    $('ci-space-name').value     = sp ? (sp.name        || '') : '';
    $('ci-space-location').value = sp ? (sp.location    || '') : '';
    $('ci-space-desc').value     = sp ? (sp.description || '') : '';

    var hasGps = sp && (sp.lat || sp.lng);
    var gpsToggle  = $('ci-gps-toggle');
    var gpsFields  = $('ci-gps-fields');
    var gpsLabel   = $('ci-gps-toggle-label');
    if (gpsToggle) {
      gpsToggle.checked = !!hasGps;
      gpsFields.hidden  = !hasGps;
      gpsLabel.textContent = hasGps ? 'ON — GPS 제한 활성' : 'OFF — GPS 자유';
    }
    $('ci-space-lat')    && ($('ci-space-lat').value    = sp ? (sp.lat       || '') : '');
    $('ci-space-lng')    && ($('ci-space-lng').value    = sp ? (sp.lng       || '') : '');
    var radius = sp ? (sp.geoRadius || 100) : 100;
    $('ci-space-radius') && ($('ci-space-radius').value = radius);
    $('ci-space-radius-val') && ($('ci-space-radius-val').textContent = radius + 'm');
    $('ci-gps-locate-status') && ($('ci-gps-locate-status').textContent = '');

    $('ci-space-modal-title').textContent = sp ? '공간 수정' : '공간 등록';
    $('ci-space-save-btn').textContent    = sp ? '저장' : '등록';
    $('ci-space-modal')._editSp = sp || null;
    $('ci-space-modal').hidden = false;
    setTimeout(function () { $('ci-space-name').focus(); }, 100);
  }

  function _ciCloseSpaceModal() { $('ci-space-modal').hidden = true; }

  function _ciEditSpace(idx) {
    var sp = _ciSpaces[idx];
    if (!sp) return;
    _ciOpenSpaceModal(sp);
  }

  async function _ciSaveSpace() {
    var name = ($('ci-space-name').value || '').trim();
    if (!name) { toast('공간 이름을 입력하세요.', 'error'); return; }

    var useGps = $('ci-gps-toggle') && $('ci-gps-toggle').checked;
    var lat = useGps ? (($('ci-space-lat').value || '').trim()) : '';
    var lng = useGps ? (($('ci-space-lng').value || '').trim()) : '';
    var radius = useGps ? ($('ci-space-radius').value || '100') : '';

    if (useGps && (!lat || !lng)) {
      toast('GPS 제한을 켰으면 위도·경도를 입력해 주세요.', 'error'); return;
    }

    var spaceData = {
      name:        name,
      location:    ($('ci-space-location').value || '').trim(),
      description: ($('ci-space-desc').value || '').trim(),
      lat:         lat,
      lng:         lng,
      geoRadius:   radius,
    };

    var btn     = $('ci-space-save-btn');
    var editSp  = $('ci-space-modal')._editSp;
    btn.disabled = true;
    btn.textContent = editSp ? '저장 중...' : '등록 중...';
    try {
      if (editSp) {
        // 수정 모드
        var updData = Object.assign({}, editSp, spaceData);
        await SheetsModule.updateSpace(editSp._row, updData);
        toast('✅ "' + name + '" 공간이 수정되었습니다.', 'success');
        _ciCloseSpaceModal();
        await _ciLoadSpaces();
      } else {
        // 신규 등록
        var result = await SheetsModule.addSpace(spaceData);
        toast('✅ "' + name + '" 공간이 등록되었습니다.', 'success');
        _ciCloseSpaceModal();
        await _ciLoadSpaces();
        if (result && result.id) _ciShowQr(result.id);
      }
    } catch (e) {
      toast((editSp ? '수정' : '등록') + ' 실패: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = editSp ? '저장' : '등록';
    }
  }

  async function _ciDeleteSpace(rowNum, name) {
    if (!confirm('"' + name + '"을(를) 삭제하시겠습니까?\n부착된 QR 코드도 함께 무효화됩니다.')) return;
    try {
      await SheetsModule.deleteSpace(rowNum);
      toast('삭제했습니다.', 'success');
      _ciLoadSpaces();
    } catch (e) { toast('삭제 실패: ' + e.message, 'error'); }
  }

  /* ── QR 코드 ── */
  var _ciQrCurrentUrl = '';

  function _ciShowQr(roomId) {
    var sp = _ciSpaces.find(function (s) { return s.id === roomId; });
    if (!sp) return;
    var baseUrl = CONFIG.baseUrl || 'https://bangdw-hash.github.io/asea-calendar-management/';
    var checkinUrl = baseUrl + 'checkin.html?room=' + encodeURIComponent(sp.id) +
      (sp.name ? '&name=' + encodeURIComponent(sp.name) : '');
    var qrSrc = 'https://api.qrserver.com/v1/create-qr-code/?data=' +
                encodeURIComponent(checkinUrl) + '&size=400x400&margin=10&color=000000&bgcolor=ffffff';
    _ciQrCurrentUrl = qrSrc;
    $('ci-qr-img').src = qrSrc;
    $('ci-qr-img').alt = sp.name + ' QR';
    $('ci-qr-modal-title').textContent = sp.name + ' QR 코드';
    $('ci-qr-room-name').textContent = sp.name;
    $('ci-qr-room-location').textContent = sp.location || '';
    $('ci-qr-url').textContent = checkinUrl;
    $('ci-qr-modal').hidden = false;
  }

  async function _ciDownloadQr() {
    var name = $('ci-qr-room-name').textContent || 'qr';
    var btn = $('ci-qr-download-btn');
    btn.disabled = true;
    btn.textContent = '⏳ 준비 중...';
    try {
      var res = await fetch(_ciQrCurrentUrl);
      var blob = await res.blob();
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href     = url;
      a.download = name + '_QR.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('✅ QR 코드가 다운로드됩니다.', 'success');
    } catch (e) {
      toast('다운로드 실패: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '⬇️ PNG 다운로드';
    }
  }

  /* ── 입출입 현황 ── */
  function _ciRefreshRoomFilter() {
    var sel = $('ci-log-filter-room');
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="all">전체 공간</option>';
    _ciSpaces.forEach(function (sp) {
      var opt = document.createElement('option');
      opt.value = sp.id;
      opt.textContent = sp.name;
      sel.appendChild(opt);
    });
    if (cur) sel.value = cur;
  }

  async function _ciLoadLogs() {
    $('ci-log-list').innerHTML = '<p class="empty-state">불러오는 중...</p>';
    $('ci-log-summary').innerHTML = '';
    var date = $('ci-log-filter-date').value || window.toLocalYMD();
    try {
      _ciLogs = (await SheetsModule.getCheckinLogs(null, date, date)) || [];
      _ciRenderLogs();
    } catch (e) {
      $('ci-log-list').innerHTML = '<p class="empty-state" style="color:#e53935">불러오기 실패: ' + e.message + '</p>';
    }
  }

  function _ciRenderLogs() {
    var roomFilter = ($('ci-log-filter-room').value || 'all');
    var typeFilter = ($('ci-log-filter-type').value || 'all');

    var filtered = _ciLogs.filter(function (l) {
      if (roomFilter !== 'all' && l.roomId !== roomFilter) return false;
      if (typeFilter !== 'all' && l.checkType !== typeFilter) return false;
      return true;
    }).sort(function (a, b) {
      return (b.timestamp || '').localeCompare(a.timestamp || '');
    });

    // 요약
    var inCount  = filtered.filter(function (l) { return l.checkType === '입실'; }).length;
    var outCount = filtered.filter(function (l) { return l.checkType === '퇴실'; }).length;
    var unames   = new Set(filtered.map(function (l) { return l.userName; }));
    $('ci-log-summary').innerHTML =
      '<div class="ci-summary-card" style="background:#e8f5e9">' +
        '<div class="ci-summary-label" style="color:#2e7d32">✅ 입실</div>' +
        '<div class="ci-summary-value" style="color:#2e7d32">' + inCount + '</div>' +
      '</div>' +
      '<div class="ci-summary-card" style="background:#fce4ec">' +
        '<div class="ci-summary-label" style="color:#c62828">🚪 퇴실</div>' +
        '<div class="ci-summary-value" style="color:#c62828">' + outCount + '</div>' +
      '</div>' +
      '<div class="ci-summary-card" style="background:#e3f2fd">' +
        '<div class="ci-summary-label" style="color:#1565c0">👤 인원</div>' +
        '<div class="ci-summary-value" style="color:#1565c0">' + unames.size + '명</div>' +
      '</div>';

    if (!filtered.length) {
      $('ci-log-list').innerHTML = '<p class="empty-state">해당 조건의 기록이 없습니다.</p>';
      return;
    }

    $('ci-log-list').innerHTML =
      '<div style="overflow-x:auto">' +
      '<table class="ci-log-table">' +
      '<thead><tr>' +
        '<th>시각</th><th>구분</th><th>공간</th><th>이름</th><th>소속</th><th>전화번호</th><th style="width:54px"></th>' +
      '</tr></thead><tbody>' +
      filtered.map(function (l) {
        var ts = l.timestamp ? new Date(l.timestamp) : null;
        var tStr = ts
          ? String(ts.getHours()).padStart(2,'0') + ':' + String(ts.getMinutes()).padStart(2,'0')
          : '';
        var isIn = l.checkType === '입실';
        return '<tr data-row="' + (l._row || '') + '">' +
          '<td style="color:#888;white-space:nowrap">' + _esc(tStr) + '</td>' +
          '<td><span class="ci-check-badge ' + (isIn ? 'in' : 'out') + '">' + _esc(l.checkType) + '</span></td>' +
          '<td>' + _esc(l.roomName || l.roomId) + '</td>' +
          '<td style="font-weight:600">' + _esc(l.userName) + '</td>' +
          '<td style="color:#888">' + _esc(l.affiliation) + '</td>' +
          '<td style="color:#888">' + _esc(l.phone) + '</td>' +
          '<td><button class="ci-log-del-btn" data-row="' + (l._row || '') + '" title="삭제" style="background:none;border:none;cursor:pointer;color:#e53935;font-size:15px;padding:2px 6px">🗑</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';

    // 삭제 버튼 이벤트 (이벤트 위임)
    var tbl = $('ci-log-list');
    tbl && tbl.addEventListener('click', function (e) {
      var btn = e.target.closest('.ci-log-del-btn');
      if (!btn) return;
      var rowNum = parseInt(btn.dataset.row);
      if (!rowNum || !confirm('이 기록을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.')) return;
      btn.disabled = true; btn.textContent = '⏳';
      SheetsModule.deleteCheckinLog(rowNum).then(function () {
        var tr = btn.closest('tr');
        if (tr) tr.remove();
        toast('기록이 삭제됐습니다.', 'success');
        // 캐시 갱신
        _ciLogs = _ciLogs.filter(function (l) { return l._row !== rowNum; });
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = '🗑';
        toast('삭제 실패: ' + e.message, 'error');
      });
    }, { once: true });
  }

  // 전역 노출 (HTML onclick 속성)
  window._ciShowQr          = _ciShowQr;
  window._ciDeleteSpace     = _ciDeleteSpace;
  window._ciEditSpace       = _ciEditSpace;
  window._ciOpenSpaceLogs   = _ciOpenSpaceLogs;

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
      var key     = $('setting-api-key').value.trim();
      var baseUrl = $('setting-api-base-url').value.trim().replace(/\/$/, '');  // 끝 슬래시 제거
      if (!key) { toast('API 키를 입력하세요.', 'error'); return; }
      CONFIG.anthropicApiKey  = key;
      CONFIG.anthropicBaseUrl = baseUrl;
      try { localStorage.setItem(CONFIG.storageKeys.anthropicApiKey,  key);     } catch (e) {}
      try { localStorage.setItem(CONFIG.storageKeys.anthropicBaseUrl, baseUrl); } catch (e) {}
      // 일정발췃 탭 입력란도 동기화
      if ($('extract-api-key'))      $('extract-api-key').value      = key;
      if ($('extract-api-base-url')) $('extract-api-base-url').value = baseUrl;
      var msg = baseUrl
        ? 'Claude API 키 + Base URL이 저장되었습니다. (' + baseUrl + ')'
        : 'Claude API 키가 저장되었습니다.';
      toast(msg, 'success');
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

    var _promoGasBtn = $('save-promo-gas-btn');
    if (_promoGasBtn) {
      var _pgsv = localStorage.getItem('asea_promo_gas_url') || '';
      var _pgInp = $('setting-promo-gas-url');
      if (_pgInp) _pgInp.value = _pgsv;
      _promoGasBtn.addEventListener('click', function () {
        var gasUrl = ($('setting-promo-gas-url') || {}).value || '';
        gasUrl = gasUrl.trim();
        localStorage.setItem('asea_promo_gas_url', gasUrl);
        if (typeof CONFIG !== 'undefined') CONFIG.promoGasUrl = gasUrl;
        toast(gasUrl ? 'GAS URL 저장됨' : 'GAS URL 삭제됨', 'success');
      });
    }

    /* 홍보슬라이드 접근 토큰 저장 */
    var _promoTokenBtn = $('save-promo-token-btn');
    if (_promoTokenBtn) {
      var _ptInp = $('setting-promo-token');
      if (_ptInp) _ptInp.value = localStorage.getItem('asea_promo_access_token') || '';
      _promoTokenBtn.addEventListener('click', function () {
        var tok = (($('setting-promo-token') || {}).value || '').trim();
        localStorage.setItem('asea_promo_access_token', tok);
        toast(tok ? '접근 토큰 저장됨' : '접근 토큰 삭제됨', 'success');
      });
    }

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
  /* ── 탭 네비게이션 마우스 엣지 자동 스크롤 (PC 전용) ──────────
     마우스가 탭 네비의 수직 영역(±8px) 내에 있으면서
     뷰포트 우측/좌측 끝에 가까워질 때 숨겨진 탭이 자동으로 드러남.
     이동이 "아주 조금"이 아니라 실제로 가장자리 쪽으로 의도적으로
     이동했을 때(EDGE_THRESHOLD 이내)만 반응 → 클릭 의도와 구분.
     모바일(터치 기기)에서는 동작하지 않음.
  ─────────────────────────────────────────────────────────────── */
  function _initTabNavEdgeScroll() {
    // 실제 터치 전용 기기(마우스 없는 태블릿/스마트폰)면 건너뜀
    // Windows 11은 maxTouchPoints > 0 이지만 마우스가 있으므로 제외
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;

    var nav = document.querySelector('.tab-nav.desktop-tab-nav');
    if (!nav) return;

    var EDGE_THRESHOLD = 80;   // 뷰포트 끝에서 이 픽셀 이내면 스크롤 시작
    var BASE_SPEED     = 3;    // 기본 스크롤 속도 px/frame
    var rafId          = null;
    var scrollDir      = 0;    // -1: 왼쪽, +1: 오른쪽, 0: 정지
    var lastMouseX     = -1;   // 마우스 X 위치 (비율 계산용)

    function _stopScroll() {
      scrollDir = 0;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    function _doScroll() {
      if (!scrollDir) return;
      // 자동 정지: 스크롤 끝에 도달
      if (scrollDir > 0 && nav.scrollLeft >= nav.scrollWidth - nav.clientWidth - 1) { _stopScroll(); return; }
      if (scrollDir < 0 && nav.scrollLeft <= 1) { _stopScroll(); return; }
      // 마우스 위치 기준으로 속도 가속 (가장자리에 가까울수록 빠름)
      var dist  = scrollDir > 0 ? (window.innerWidth - lastMouseX) : lastMouseX;
      var ratio = Math.max(0, 1 - dist / EDGE_THRESHOLD);
      nav.scrollLeft += scrollDir * (BASE_SPEED + ratio * 10);
      rafId = requestAnimationFrame(_doScroll);
    }

    document.addEventListener('mousemove', function(e) {
      lastMouseX = e.clientX;
      var navRect  = nav.getBoundingClientRect();
      var inNavRow = e.clientY >= navRect.top - 8 && e.clientY <= navRect.bottom + 8;

      if (!inNavRow) { _stopScroll(); return; }

      var fromRight = window.innerWidth - e.clientX;
      var fromLeft  = e.clientX;

      if (fromRight < EDGE_THRESHOLD && nav.scrollLeft < nav.scrollWidth - nav.clientWidth - 1) {
        // 오른쪽 끝 접근 + 숨겨진 탭 존재
        if (scrollDir !== 1) { scrollDir = 1; if (rafId) { cancelAnimationFrame(rafId); rafId = null; } _doScroll(); }
      } else if (fromLeft < EDGE_THRESHOLD && nav.scrollLeft > 1) {
        // 왼쪽 끝 접근 + 숨겨진 탭 존재
        if (scrollDir !== -1) { scrollDir = -1; if (rafId) { cancelAnimationFrame(rafId); rafId = null; } _doScroll(); }
      } else {
        _stopScroll();
      }
    }, { passive: true });

    // 창이 포커스를 잃으면 중지 (마우스가 뷰포트 경계 밖으로 나간 후 복귀 없을 때)
    window.addEventListener('blur', _stopScroll);
  }

  function init() {
    initAuth();
    initTabs();
    _initTabNavEdgeScroll();
    initCalendarNav();
    initEventModal();
    initEventContextMenu();
    initRecurDeleteModal();
    initRecurMoveModal();
    initPrintRangeModal();
    initWeeklyHub();
    initEmailTab();
    initCsvModal();
    initExtractTab();
    initExtractEditModal();
    initShareUrlModal();
    initDeptModal();
    initSettings();
    initModalHandlers();
    if (typeof WorkModule         !== 'undefined') WorkModule.initWorkModule();
    // 신규 모듈 초기화
    if (typeof AdminModule        !== 'undefined') AdminModule.init();
    if (typeof BoardModule        !== 'undefined') BoardModule.init();
    if (typeof UserSettingsModule !== 'undefined') UserSettingsModule.init();
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
