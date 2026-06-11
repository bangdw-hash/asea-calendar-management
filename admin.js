// admin.js — 관리자 패널 + 권한 관리 모듈 v1.0 (2026-06-10)
(function () {
  'use strict';

  var SK_ROLES    = 'asea_user_roles';
  var SK_MENU_VIS = 'asea_menu_visibility';
  var SK_FEAT_VIS = 'asea_feat_visibility';

  /* ══════════════════════════════════════════════════════
     버전 히스토리 (최신순)
  ══════════════════════════════════════════════════════ */
  var CHANGELOG = [
    {
      version: '2.0.0', date: '2026-06-10',
      title: '게시판·관리자·사용자 설정 시스템 탑재',
      items: [
        '게시판 탭 신설 (일반 게시글 + 전사알림)',
        '댓글 + 대댓글 (1단계)',
        '브라우저 Push 알림 (전사알림 등록 시)',
        '전사알림 로그인 팝업 (미확인 건 자동 표시)',
        '관리자 패널 탭 신설',
        '사용자 권한 관리 (admin / manager / staff)',
        '메뉴 표시 제어 — 역할별 메뉴 on/off',
        '기능 제어 — 역할별 버튼/기능 on/off',
        '버전 관리 페이지 (개발 이력 전체 기록)',
        'Quill.js 워드프로세서 탑재 (게시판 글쓰기)',
        '사용자 캘린더 색상 설정 (개인별 적용)'
      ]
    },
    {
      version: '1.9.0', date: '2026-06-09',
      title: '출력/인쇄 기능 개선',
      items: [
        '인쇄 시 제목 입력 기능',
        '출력일·URL 제거',
        '한국어 텍스트 줄바꿈 (word-break: keep-all)',
        '페이지 잘림 방지 (break-inside: avoid)',
        'KoPubWorld 폰트 파일 프로젝트 탑재 (TTF 3종)'
      ]
    },
    {
      version: '1.8.0', date: '2026-06-09',
      title: '캘린더 이벤트 시간순 정렬',
      items: [
        '하루 종일 이벤트 가장 먼저 표시',
        '시간순 오름차순 정렬',
        '동일 시간 겹칠 경우 가나다순'
      ]
    },
    {
      version: '1.7.0', date: '2026-06-09',
      title: '달력 출력/PDF 기능 신설',
      items: [
        '현재 월 바로 출력',
        '출력 구간 설정 (시작월~종료월)',
        '월별 페이지 분리 출력',
        '활성화된 캘린더 필터 반영',
        'PDF 저장 지원'
      ]
    },
    {
      version: '1.6.0', date: '2026-06-09',
      title: '반복 일정 삭제 범위 선택',
      items: [
        '이번 일정만 삭제 / 전체 반복 삭제 선택',
        'Google Calendar recurringEventId 감지',
        '반복 삭제 확인 다이얼로그'
      ]
    },
    {
      version: '1.5.0', date: '2026-06-09',
      title: '달력 셀 전체 일정 표시 (+N개 제거)',
      items: [
        '일정 수 제한 없이 모두 표시',
        '+N개 더 표시 UI 제거',
        'CSS overflow 개선'
      ]
    },
    {
      version: '1.4.0', date: '2026-06-09',
      title: '달력 년/월 직접 이동',
      items: [
        '년도·월 숫자 직접 입력 후 이동',
        '빠른 이동 버튼 (1년 전 / 6개월 전 / 오늘 / 6개월 후 / 1년 후)'
      ]
    },
    {
      version: '1.3.0', date: '2026-06-09',
      title: '반복 일정 기능 (Google Calendar RRULE)',
      items: [
        'RFC 5545 RRULE 지원',
        '매일 / 매주 / 매월 / 매년 반복',
        '요일 선택 (매주 반복 시)',
        '반복 종료 조건 (없음 / 날짜까지 / N번)',
        '기존 일정에 반복 추가 (새 반복 이벤트 생성)'
      ]
    },
    {
      version: '1.2.0', date: '2026-06-08',
      title: '빠른 업무 등록 붙여넣기 버그 수정',
      items: [
        'Ctrl+V 오동작 수정 (제목 입력란 붙여넣기 정상화)',
        'contentEditable / INPUT / TEXTAREA 구분 처리'
      ]
    },
    {
      version: '1.1.0', date: '2026-06-08',
      title: '기본 기능 완성',
      items: [
        '구글 캘린더 API 연동 (읽기/쓰기)',
        '주간업무보고 자동화',
        '이메일 · 문자(SMS) 발송',
        '대관업무 / 차량관리 / 강의실현황 모듈',
        '업무관리 / 작업지시 / 입출입관리'
      ]
    },
    {
      version: '1.0.0', date: '2026-06-01',
      title: 'ASEA 캘린더 관리 시스템 최초 배포',
      items: ['시스템 출시']
    }
  ];

  /* ── 전체 메뉴 목록 ─────────────────────────────────── */
  var MENU_ITEMS = [
    { id: 'calendar',    label: '📅 캘린더' },
    { id: 'weekly-hub', label: '📋 주간허브' },
    { id: 'report',      label: '✅ 보고' },
    { id: 'promo',       label: '📣 홍보슬라이드' },
    { id: 'email',       label: '✉️ 이메일' },
    { id: 'extract',     label: '🔍 일정발췌' },
    { id: 'work',        label: '📝 업무관리' },
    { id: 'facility',    label: '🏢 대관업무' },
    { id: 'vehicle',     label: '🚗 차량관리' },
    { id: 'classroom',   label: '🏫 강의실현황' },
    { id: 'workorder',   label: '🔧 작업지시' },
    { id: 'checkinmgmt', label: '🚪 입출입관리' },
    { id: 'sms',         label: '💬 문자발송' },
    { id: 'board',       label: '📌 게시판' },
    { id: 'settings',    label: '⚙️ 설정' },
    { id: 'help',        label: '❓ 도움말' }
  ];

  /* ── 기능 목록 ──────────────────────────────────────── */
  var FEAT_ITEMS = [
    { id: 'cal-add-event',  label: '캘린더 일정 추가',     tab: 'calendar' },
    { id: 'cal-csv-import', label: '캘린더 CSV 가져오기',  tab: 'calendar' },
    { id: 'cal-print',      label: '캘린더 인쇄',          tab: 'calendar' },
    { id: 'board-notice',   label: '전사알림 글 작성',     tab: 'board' },
    { id: 'board-pin',      label: '게시글 고정/해제',     tab: 'board' },
    { id: 'board-del-any',  label: '모든 게시글 삭제',     tab: 'board' },
    { id: 'email-send',     label: '이메일 발송',           tab: 'email' },
    { id: 'sms-send',       label: '문자 발송',             tab: 'sms' },
    { id: 'hr-manage',      label: '직원 관리 (설정 탭)',   tab: 'settings' }
  ];

  /* ── 스토리지 ─────────────────────────────────────── */
  function loadRoles()    { try { return JSON.parse(localStorage.getItem(SK_ROLES)    || '{}'); } catch(e) { return {}; } }
  function saveRoles(d)   { try { localStorage.setItem(SK_ROLES,    JSON.stringify(d)); } catch(e) {} }
  function loadMenuVis()  { try { return JSON.parse(localStorage.getItem(SK_MENU_VIS) || '{}'); } catch(e) { return {}; } }
  function saveMenuVis(d) { try { localStorage.setItem(SK_MENU_VIS, JSON.stringify(d)); } catch(e) {} }
  function loadFeatVis()  { try { return JSON.parse(localStorage.getItem(SK_FEAT_VIS) || '{}'); } catch(e) { return {}; } }
  function saveFeatVis(d) { try { localStorage.setItem(SK_FEAT_VIS, JSON.stringify(d)); } catch(e) {} }

  /* ── 역할 ────────────────────────────────────────── */
  function getUserRole(email) {
    if (!email) return 'staff';
    // HR 직원목록에서 먼저 확인
    var employees = [];
    try { employees = JSON.parse(localStorage.getItem('asea_employees') || '[]'); } catch(e) {}
    var emp = employees.find(function (e) { return e.email === email; });
    if (emp && emp.role) return emp.role;
    // 수동 오버라이드
    var roles = loadRoles();
    return roles[email] || 'staff';
  }

  function setUserRole(email, role) {
    var roles = loadRoles();
    roles[email] = role;
    saveRoles(roles);
  }

  function curEmail() {
    try {
      if (window.CONFIG && CONFIG.currentUser) return CONFIG.currentUser.email || '';
    } catch(e) {}
    return localStorage.getItem('asea_user_email') || '';
  }

  function isAdmin(email) {
    return getUserRole(email || curEmail()) === 'admin';
  }

  function isManager(email) {
    var r = getUserRole(email || curEmail());
    return r === 'admin' || r === 'manager';
  }

  /* ── 메뉴 가시성 ─────────────────────────────────── */
  function isMenuVisible(menuId, role) {
    var vis = loadMenuVis();
    var key = menuId + '__' + role;
    if (typeof vis[key] === 'boolean') return vis[key];
    if (menuId === 'admin') return (role === 'admin'); // 관리자 탭 기본: admin만
    return true;
  }

  function setMenuVisible(menuId, role, visible) {
    var vis = loadMenuVis();
    vis[menuId + '__' + role] = visible;
    saveMenuVis(vis);
  }

  /* ── 기능 가시성 ─────────────────────────────────── */
  function isFeatVisible(featId, role) {
    var vis = loadFeatVis();
    var key = featId + '__' + role;
    if (typeof vis[key] === 'boolean') return vis[key];
    return true;
  }

  function setFeatVisible(featId, role, visible) {
    var vis = loadFeatVis();
    vis[featId + '__' + role] = visible;
    saveFeatVis(vis);
  }

  /* ── 메뉴 UI 적용 ────────────────────────────────── */
  function applyMenuVisibility() {
    var role = getUserRole(curEmail());

    MENU_ITEMS.forEach(function (item) {
      var visible = isMenuVisible(item.id, role);
      var tabBtn  = document.querySelector('.tab-btn[data-tab="' + item.id + '"]');
      var bnavBtn = document.querySelector('.bnav-btn[data-tab="' + item.id + '"]');
      if (tabBtn)  tabBtn.style.display  = visible ? '' : 'none';
      if (bnavBtn) bnavBtn.style.display = visible ? '' : 'none';
    });

    // 관리자 탭: admin만 보임
    ['tab-btn', 'bnav-btn'].forEach(function (cls) {
      var el = document.querySelector('.' + cls + '[data-tab="admin"]');
      if (el) el.style.display = isAdmin() ? '' : 'none';
    });
  }

  /* ── 기능 UI 적용 ────────────────────────────────── */
  function applyFeatVisibility() {
    var role = getUserRole(curEmail());

    var csvBtn = document.getElementById('csv-import-btn');
    if (csvBtn) csvBtn.style.display = isFeatVisible('cal-csv-import', role) ? '' : 'none';

    var addEvtBtn = document.getElementById('add-event-btn');
    if (addEvtBtn) addEvtBtn.style.display = isFeatVisible('cal-add-event', role) ? '' : 'none';

    var printBtn = document.getElementById('print-cal-btn');
    if (printBtn) printBtn.style.display = isFeatVisible('cal-print', role) ? '' : 'none';
  }

  /* ══════════════════════════════════════════════════════
     관리자 탭 렌더
  ══════════════════════════════════════════════════════ */
  function renderAdmin() {
    var container = document.getElementById('admin-content');
    if (!container) return;

    if (!isAdmin()) {
      container.innerHTML = '<div class="admin-denied">' +
        '<div class="admin-denied-icon">⛔</div>' +
        '<h3>접근 권한이 없습니다</h3>' +
        '<p>관리자(admin) 계정으로 로그인하세요.</p>' +
      '</div>';
      return;
    }

    container.innerHTML =
      '<div class="admin-layout">' +
        '<nav class="admin-sidenav">' +
          '<button class="admin-nav-btn active" data-sec="changelog">📋 버전 관리</button>' +
          '<button class="admin-nav-btn" data-sec="permissions">👥 권한 관리</button>' +
          '<button class="admin-nav-btn" data-sec="menu-ctrl">📂 메뉴 제어</button>' +
          '<button class="admin-nav-btn" data-sec="feat-ctrl">⚙️ 기능 제어</button>' +
          '<button class="admin-nav-btn" data-sec="tab-admin">🔗 탭별 관리</button>' +
          '<button class="admin-nav-btn" data-sec="contact-info">📞 연락처 관리</button>' +
        '</nav>' +
        '<div id="admin-sec-body" class="admin-sec-body"></div>' +
      '</div>';

    _bindAdminNav();
    _renderSection('changelog');
  }

  function _bindAdminNav() {
    document.querySelectorAll('.admin-nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.admin-nav-btn').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        _renderSection(this.dataset.sec);
      });
    });
  }

  function _renderSection(sec) {
    var body = document.getElementById('admin-sec-body');
    if (!body) return;
    if (sec === 'changelog')   body.innerHTML = _htmlChangelog();
    if (sec === 'permissions') { body.innerHTML = _htmlPermissions(); _bindPermEvents(); }
    if (sec === 'menu-ctrl')   { body.innerHTML = _htmlMenuCtrl();    _bindMenuCtrlEvents(); }
    if (sec === 'feat-ctrl')   { body.innerHTML = _htmlFeatCtrl();    _bindFeatCtrlEvents(); }
    if (sec === 'tab-admin')     { body.innerHTML = _htmlTabAdmin();      _bindTabAdminEvents(); }
    if (sec === 'contact-info')  { body.innerHTML = _htmlContactInfo();  _bindContactInfoEvents(); }

    /* 버전 추가 버튼 */
    if (sec === 'changelog') {
      var addBtn = document.getElementById('av-add-btn');
      if (addBtn) addBtn.addEventListener('click', _onAddVersion);
    }
  }

  /* ── 버전 관리 ──────────────────────────────────── */
  function _htmlChangelog() {
    var html = '<div class="admin-section">' +
      '<h3 class="admin-sec-title">📋 버전 히스토리</h3>' +
      '<div class="av-row">' +
        '<input id="av-ver"   class="form-input" placeholder="버전 (예: 2.1.0)" style="width:110px">' +
        '<input id="av-title" class="form-input" placeholder="버전 제목" style="flex:1.2">' +
        '<input id="av-items" class="form-input" placeholder="변경사항 (쉼표 구분)" style="flex:2">' +
        '<button id="av-add-btn" class="btn btn-primary btn-sm">+ 추가</button>' +
      '</div>' +
      '<div class="changelog-list">';

    CHANGELOG.forEach(function (v) {
      html += '<div class="cl-item">' +
        '<div class="cl-header">' +
          '<span class="cl-version">v' + esc(v.version) + '</span>' +
          '<span class="cl-date">' + esc(v.date) + '</span>' +
          '<span class="cl-title">' + esc(v.title) + '</span>' +
        '</div>' +
        '<ul class="cl-items">' +
        v.items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') +
        '</ul>' +
      '</div>';
    });

    html += '</div></div>';
    return html;
  }

  function _onAddVersion() {
    var ver   = (document.getElementById('av-ver')  .value || '').trim();
    var title = (document.getElementById('av-title').value || '').trim();
    var items = (document.getElementById('av-items').value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!ver || !title) { alert('버전과 제목을 입력하세요.'); return; }
    CHANGELOG.unshift({
      version: ver,
      date: new Date().toISOString().slice(0, 10),
      title: title,
      items: items.length ? items : ['업데이트']
    });
    _renderSection('changelog');
    if (window.toast) toast('버전이 추가되었습니다.', 'success');
  }

  /* ── 권한 관리 ──────────────────────────────────── */
  function _htmlPermissions() {
    var employees = [];
    try { employees = JSON.parse(localStorage.getItem('asea_employees') || '[]'); } catch(e) {}
    var roles = loadRoles();
    var ROLES = ['staff', 'manager', 'admin'];
    var roleLabel = { staff: '일반', manager: '부서장', admin: '관리자' };

    var html = '<div class="admin-section">' +
      '<h3 class="admin-sec-title">👥 사용자 권한 관리</h3>' +
      '<p class="form-hint" style="margin-bottom:12px">' +
        '<b>admin</b> — 모든 기능 접근 · 관리자 탭 접근<br>' +
        '<b>manager</b> — 부서장 권한 (기능 제어에서 세부 설정)<br>' +
        '<b>staff</b> — 일반 사용자 (기본값)' +
      '</p>' +
      '<div class="perm-add-row">' +
        '<input id="perm-email" type="email" class="form-input" placeholder="이메일 직접 입력" style="flex:2">' +
        '<select id="perm-role" class="form-select" style="width:140px">' +
        ROLES.map(function (r) { return '<option value="'+r+'">'+r+' ('+roleLabel[r]+')</option>'; }).join('') +
        '</select>' +
        '<button id="perm-save-btn" class="btn btn-primary btn-sm">권한 설정</button>' +
      '</div>';

    if (employees.length > 0) {
      html += '<table class="admin-table"><thead><tr><th>이름</th><th>이메일</th><th>현재 역할</th><th>변경</th></tr></thead><tbody>';
      employees.forEach(function (emp) {
        var cur = roles[emp.email] || emp.role || 'staff';
        html += '<tr>' +
          '<td>' + esc(emp.name||'') + '</td>' +
          '<td>' + esc(emp.email||'') + '</td>' +
          '<td><span class="role-chip role-' + cur + '">' + cur + '</span></td>' +
          '<td>' +
            '<select class="form-select perm-inline-sel" data-email="' + esc(emp.email) + '" style="width:130px">' +
            ROLES.map(function (r) { return '<option value="'+r+'"'+(r===cur?' selected':'')+'>'+r+'</option>'; }).join('') +
            '</select>' +
          '</td>' +
        '</tr>';
      });
      html += '</tbody></table>';
    }

    // 수동 설정 목록
    var manual = Object.keys(roles).filter(function (e) {
      return !employees.find(function (emp) { return emp.email === e; });
    });
    if (manual.length > 0) {
      html += '<h4 style="margin-top:18px;font-size:13px;font-weight:600;color:#666">수동 설정</h4>' +
        '<table class="admin-table"><thead><tr><th>이메일</th><th>역할</th><th></th></tr></thead><tbody>';
      manual.forEach(function (email) {
        html += '<tr><td>' + esc(email) + '</td>' +
          '<td><span class="role-chip role-' + roles[email] + '">' + roles[email] + '</span></td>' +
          '<td><button class="btn btn-ghost btn-sm perm-del-btn" data-email="' + esc(email) + '">삭제</button></td>' +
          '</tr>';
      });
      html += '</tbody></table>';
    }

    html += '</div>';
    return html;
  }

  function _bindPermEvents() {
    var saveBtn = document.getElementById('perm-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      var email = (document.getElementById('perm-email').value || '').trim().toLowerCase();
      var role  = document.getElementById('perm-role').value;
      if (!email) { alert('이메일을 입력하세요.'); return; }
      setUserRole(email, role);
      applyMenuVisibility(); applyFeatVisibility();
      _renderSection('permissions');
      if (window.toast) toast('권한이 설정되었습니다.', 'success');
    });

    document.querySelectorAll('.perm-inline-sel').forEach(function (sel) {
      sel.addEventListener('change', function () {
        setUserRole(this.dataset.email, this.value);
        applyMenuVisibility(); applyFeatVisibility();
        if (window.toast) toast('권한이 변경되었습니다.', 'success');
        // role chip 갱신
        var chip = this.closest('tr').querySelector('.role-chip');
        if (chip) { chip.className = 'role-chip role-' + this.value; chip.textContent = this.value; }
      });
    });

    document.querySelectorAll('.perm-del-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var roles = loadRoles();
        delete roles[this.dataset.email];
        saveRoles(roles);
        _renderSection('permissions');
      });
    });
  }

  /* ── 메뉴 제어 ──────────────────────────────────── */
  function _htmlMenuCtrl() {
    var vis   = loadMenuVis();
    var roles = ['admin', 'manager', 'staff'];
    var html  = '<div class="admin-section">' +
      '<h3 class="admin-sec-title">📂 메뉴 표시 제어</h3>' +
      '<p class="form-hint" style="margin-bottom:12px">각 역할별로 표시할 메뉴 탭을 선택하세요.</p>' +
      '<table class="admin-table ctrl-table"><thead><tr><th>메뉴</th>' +
      roles.map(function (r) { return '<th>' + r + '</th>'; }).join('') +
      '</tr></thead><tbody>';

    MENU_ITEMS.forEach(function (item) {
      html += '<tr><td>' + item.label + '</td>';
      roles.forEach(function (role) {
        var key     = item.id + '__' + role;
        var checked;
        if (item.id === 'admin') {
          checked = (role === 'admin');
        } else {
          checked = typeof vis[key] === 'boolean' ? vis[key] : true;
        }
        var disabled = (item.id === 'admin') ? ' disabled' : '';
        html += '<td><input type="checkbox" class="menu-ctrl-cb"' +
          ' data-menu="' + item.id + '" data-role="' + role + '"' +
          (checked ? ' checked' : '') + disabled + '></td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function _bindMenuCtrlEvents() {
    document.querySelectorAll('.menu-ctrl-cb').forEach(function (cb) {
      cb.addEventListener('change', function () {
        setMenuVisible(this.dataset.menu, this.dataset.role, this.checked);
        applyMenuVisibility();
      });
    });
  }

  /* ── 기능 제어 ──────────────────────────────────── */
  function _htmlFeatCtrl() {
    var vis   = loadFeatVis();
    var roles = ['admin', 'manager', 'staff'];
    var html  = '<div class="admin-section">' +
      '<h3 class="admin-sec-title">⚙️ 기능 제어</h3>' +
      '<p class="form-hint" style="margin-bottom:12px">각 역할별로 사용 가능한 기능 버튼을 제어합니다.</p>' +
      '<table class="admin-table ctrl-table"><thead><tr><th>기능</th><th>탭</th>' +
      roles.map(function (r) { return '<th>' + r + '</th>'; }).join('') +
      '</tr></thead><tbody>';

    FEAT_ITEMS.forEach(function (item) {
      html += '<tr><td>' + esc(item.label) + '</td><td><small style="color:#888">' + item.tab + '</small></td>';
      roles.forEach(function (role) {
        var key     = item.id + '__' + role;
        var checked = typeof vis[key] === 'boolean' ? vis[key] : true;
        html += '<td><input type="checkbox" class="feat-ctrl-cb"' +
          ' data-feat="' + item.id + '" data-role="' + role + '"' +
          (checked ? ' checked' : '') + '></td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function _bindFeatCtrlEvents() {
    document.querySelectorAll('.feat-ctrl-cb').forEach(function (cb) {
      cb.addEventListener('change', function () {
        setFeatVisible(this.dataset.feat, this.dataset.role, this.checked);
        applyFeatVisibility();
      });
    });
  }

  /* ── 탭별 관리 기능 ──────────────────────────────────── */
  function _htmlTabAdmin() {
    return '<div class="admin-section">' +
      '<h3 class="admin-sec-title">🔗 탭별 관리 기능</h3>' +
      '<p class="form-hint" style="margin-bottom:16px">각 탭의 관리자 설정을 여기서 열 수 있습니다. 일반 탭에는 표시되지 않습니다.</p>' +
      '<div class="tab-admin-links">' +
        '<button class="tab-admin-btn" data-open="facility" data-section="fac-admin-section">🏢 시설 관리 설정</button>' +
        '<button class="tab-admin-btn" data-open="vehicle"  data-section="veh-admin-section">🚗 차량 관리 설정</button>' +
        '<button class="tab-admin-btn" data-open="classroom" data-section="cls-admin-section">🏫 강의실 관리 설정</button>' +
        '<button class="tab-admin-btn" data-open="settings" data-section="hr-management-card">👥 직원 관리</button>' +
        '<button class="tab-admin-btn" data-open="settings" data-section="mgr-staff-card">🏢 관리실 인원</button>' +
        '<button class="tab-admin-btn" data-open="settings" data-section="hr-clear-card">🗑 데이터 초기화</button>' +
      '</div>' +
    '</div>';
  }

  function _bindTabAdminEvents() {
    document.querySelectorAll('.tab-admin-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tabId = this.dataset.open;
        var secId = this.dataset.section;
        var tabBtn = document.querySelector('.tab-btn[data-tab="' + tabId + '"]');
        if (tabBtn) tabBtn.click();
        setTimeout(function() {
          var sec = document.getElementById(secId);
          if (sec) {
            sec.hidden = false;
            sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 300);
      });
    });
  }

  /* ── 연락처/공지 정보 관리 ──────────────────────────── */
  function _htmlContactInfo() {
    var SK_CONTACT = 'asea_contact_info';
    var info = { name: '방시원', title: '차장', phone: '' };
    try {
      var stored = JSON.parse(localStorage.getItem(SK_CONTACT) || 'null');
      if (stored) info = stored;
    } catch(e) {}

    return '<div class="admin-section">' +
      '<h3 class="admin-sec-title">📞 연락처/공지 정보 관리</h3>' +
      '<p class="form-hint" style="margin-bottom:14px">' +
        '이 정보는 캘린더 공유 신청 페이지와 직원용 캘린더 페이지 하단에 표시됩니다.' +
      '</p>' +
      '<div class="av-row" style="flex-wrap:wrap;gap:8px;margin-bottom:12px">' +
        '<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:#555">' +
          '담당자명' +
          '<input id="ci-name" class="form-input" value="' + esc(info.name) + '" placeholder="방시원" style="width:130px">' +
        '</label>' +
        '<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:#555">' +
          '직위' +
          '<input id="ci-title" class="form-input" value="' + esc(info.title) + '" placeholder="차장" style="width:110px">' +
        '</label>' +
        '<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:#555">' +
          '전화번호' +
          '<input id="ci-phone" class="form-input" value="' + esc(info.phone) + '" placeholder="02-0000-0000" style="width:160px">' +
        '</label>' +
        '<div style="display:flex;align-items:flex-end">' +
          '<button id="ci-save-btn" class="btn btn-primary btn-sm">저장</button>' +
        '</div>' +
      '</div>' +
      '<div id="ci-preview" class="form-hint" style="margin-top:6px;padding:10px 14px;background:#f5f7fa;border-radius:6px;font-size:13px">' +
        '현재 표시: 문의: ' + esc(info.name) + ' ' + esc(info.title) + (info.phone ? ' ' + esc(info.phone) : '') +
      '</div>' +
    '</div>';
  }

  function _bindContactInfoEvents() {
    var SK_CONTACT = 'asea_contact_info';

    function _updatePreview() {
      var name  = (document.getElementById('ci-name')  || {}).value || '';
      var title = (document.getElementById('ci-title') || {}).value || '';
      var phone = (document.getElementById('ci-phone') || {}).value || '';
      var preview = document.getElementById('ci-preview');
      if (preview) {
        preview.textContent = '현재 표시: 문의: ' + name + ' ' + title + (phone ? ' ' + phone : '');
      }
    }

    ['ci-name', 'ci-title', 'ci-phone'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', _updatePreview);
    });

    var saveBtn = document.getElementById('ci-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', function() {
      var name  = ((document.getElementById('ci-name')  || {}).value || '').trim();
      var title = ((document.getElementById('ci-title') || {}).value || '').trim();
      var phone = ((document.getElementById('ci-phone') || {}).value || '').trim();
      try {
        localStorage.setItem(SK_CONTACT, JSON.stringify({ name: name, title: title, phone: phone }));
      } catch(e) {}
      _updatePreview();
      if (window.toast) toast('연락처 정보가 저장되었습니다.', 'success');
    });
  }

  /* ── XSS 방어 ──────────────────────────────────── */
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── 초기화 ──────────────────────────────────── */
  function init() {
    // 로그인 후 호출
  }

  function onTabOpen() {
    renderAdmin();
  }

  function onLogin() {
    applyMenuVisibility();
    applyFeatVisibility();
  }

  window.AdminModule = {
    init: init,
    onTabOpen: onTabOpen,
    onLogin: onLogin,
    renderAdmin: renderAdmin,
    isAdmin: isAdmin,
    isManager: isManager,
    getUserRole: getUserRole,
    applyMenuVisibility: applyMenuVisibility,
    applyFeatVisibility: applyFeatVisibility,
    CHANGELOG: CHANGELOG
  };
})();
