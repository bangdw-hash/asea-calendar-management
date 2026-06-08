'use strict';

/**
 * work.js — 업무관리 모듈 (기존 코드와 완전 분리)
 *
 * 의존: config.js, auth.js, sheets.js, calendar.js(CalendarModule)
 * app.js는 수정하지 않음 — initWorkModule()만 app.js의 init()에서 호출
 */

var WorkModule = (function () {

  /* ──────────────────────────────────────────────────
     상태
  ────────────────────────────────────────────────── */
  var W = {
    me: null,             // 현재 로그인한 직원 객체 {id,name,department,rank,role,...}
    employees: [],        // 전체 직원 목록 (캐시)
    empCacheAt: 0,
    myTasks: [],          // 내 수신 업무
    sentTasks: [],        // 내 발신 업무
    allTasks: [],         // 전체 업무 (관리자용)
    personalTasks: [],    // 내 개인 등록 업무 (shareScope='개인')
    personalStatusFilter: '전체', // 개인업무 필터: 전체|예정|완료
    currentStatus: '미접수',  // 현황판 필터
    detailTask: null,         // 상세 모달에 열린 업무
    detailReceived: null,     // 상세 모달에 열린 수신 행
    selectedRecipients: [],   // 발송 폼 선택된 수신자
    attachFiles: [],          // 발송 폼 첨부파일
    pollTimer: null,
    wtab: 'send',
    asea개인CalId: null,
    asea부서CalId: null,
    asea지시CalId: null,
  };

  /* ──────────────────────────────────────────────────
     유틸
  ────────────────────────────────────────────────── */
  function $w(id) { return document.getElementById(id); }

  function toast(msg, type) {
    // app.js의 toast 재사용 (전역)
    if (typeof window.aseaToast === 'function') window.aseaToast(msg, type);
    else console.log('[WORK]', msg);
  }

  function openModal(id) {
    var el = $w(id); if (!el) return;
    el.hidden = false; el.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(id) {
    var el = $w(id); if (!el) return;
    el.hidden = true; el.classList.remove('open');
    document.body.style.overflow = '';
  }

  function formatDate(iso) {
    if (!iso) return '-';
    var d = new Date(iso);
    var days = ['일','월','화','수','목','금','토'];
    return d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' +
           String(d.getDate()).padStart(2,'0') + '(' + days[d.getDay()] + ')';
  }

  function statusBadge(status) {
    var map = { '미접수':'🔴','처리중':'🟡','완료':'🟢','반려':'⚫' };
    return (map[status] || '⚪') + ' ' + status;
  }

  function typeColor(type) {
    return type === '지시' ? '#d32f2f' : type === '협조' ? '#1565c0' : '#558b2f';
  }

  /* ──────────────────────────────────────────────────
     직원 캐시
  ────────────────────────────────────────────────── */
  async function getEmployeesCached() {
    var now = Date.now();
    if (W.employees.length && now - W.empCacheAt < 60 * 60 * 1000) return W.employees;
    W.employees = await SheetsModule.getEmployees();
    W.empCacheAt = now;
    return W.employees;
  }

  /* ──────────────────────────────────────────────────
     로그인 연동: 이메일 → 직원 매칭
  ────────────────────────────────────────────────── */
  async function matchEmployee(googleEmail) {
    if (!googleEmail) return null;
    try {
      var emp = await SheetsModule.getEmployeeByEmail(googleEmail);
      if (emp && emp.status === 'active') return emp;
    } catch (e) {}
    return null;
  }

  /* ──────────────────────────────────────────────────
     부트스트랩: 미등록 계정 자기 등록 UI
  ────────────────────────────────────────────────── */
  function showBootstrapUI(googleEmail, isSuperAdmin) {
    var card = $w('my-profile-unregistered');
    if (!card) return;

    var existingForm = $w('bootstrap-self-register-form');
    if (existingForm) existingForm.remove();

    var hint = isSuperAdmin
      ? '<p style="color:#F57F17;font-size:12px;margin-bottom:10px">⚡ 최초 관리자 또는 운영자 계정입니다. 직원 정보를 등록하면 업무관리 기능을 사용할 수 있습니다.</p>'
      : '<p style="color:#5F6368;font-size:12px;margin-bottom:10px">직원 목록에 등록되지 않은 계정입니다. 아래에서 자기 등록을 요청하거나 관리자에게 문의하세요.</p>';

    var form = document.createElement('div');
    form.id = 'bootstrap-self-register-form';
    form.style.cssText = 'margin-top:12px;padding:12px;background:#fff;border:1px solid #e0e0e0;border-radius:8px';
    form.innerHTML = hint +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">' +
        '<input id="bs-name" type="text" class="form-input" placeholder="이름 *">' +
        '<select id="bs-dept" class="form-select"><option value="">부서 선택 *</option>' +
          CONFIG.departments.map(function(d){ return '<option value="'+d.name+'">'+d.name+'</option>'; }).join('') +
        '</select>' +
        '<input id="bs-rank" type="text" class="form-input" placeholder="직급 (예: 담당)">' +
        '<input id="bs-phone" type="tel" class="form-input" placeholder="전화번호">' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center">' +
        (isSuperAdmin
          ? '<select id="bs-role" class="form-select" style="flex:1"><option value="admin">관리자 (admin)</option><option value="manager">부서장</option><option value="staff">일반직원</option></select>'
          : '<input type="hidden" id="bs-role" value="staff">') +
        '<button id="bs-register-btn" class="btn btn-primary btn-sm">'+(isSuperAdmin?'🔑 관리자로 등록':'📝 등록 요청')+'</button>' +
      '</div>';

    card.innerHTML = '';
    card.appendChild(form);
    card.hidden = false;

    var btn = $w('bs-register-btn');
    if (btn) btn.addEventListener('click', async function() {
      var name  = ($w('bs-name').value||'').trim();
      var dept  = $w('bs-dept').value;
      var rank  = ($w('bs-rank').value||'').trim();
      var phone = ($w('bs-phone').value||'').trim();
      var role  = $w('bs-role').value || 'staff';

      if (!name) { toast('이름을 입력하세요.','error'); return; }
      if (!dept) { toast('부서를 선택하세요.','error'); return; }

      btn.disabled = true; btn.textContent = '등록 중...';
      try {
        await SheetsModule.addEmployee({
          name: name, department: dept, rank: rank||'담당',
          googleEmail: googleEmail, phone: phone, role: role,
          status: 'active',
        });
        toast('✅ 등록 완료! 다시 로그인하거나 페이지를 새로고침하세요.','success');
        form.innerHTML = '<p style="color:#34A853;font-size:13px">✅ 등록 완료되었습니다. 페이지를 새로고침하세요.</p>' +
          '<button onclick="location.reload()" class="btn btn-primary btn-sm" style="margin-top:8px">🔄 새로고침</button>';
      } catch(e) {
        toast('등록 실패: '+(e.message||e),'error');
        btn.disabled = false; btn.textContent = isSuperAdmin?'🔑 관리자로 등록':'📝 등록 요청';
      }
    });
  }

  async function onLogin(googleEmail) {
    W.me = await matchEmployee(googleEmail);

    if (!W.me) {
      // 부트스트랩: CONFIG.senderEmail은 항상 최초 관리자 가능
      var isSuperAdmin = (googleEmail === CONFIG.senderEmail);
      var emps = [];
      try { emps = await SheetsModule.getEmployees(); } catch(e) {}

      if (isSuperAdmin || emps.length === 0) {
        // 임시 관리자 접근 허용 (UI만, DB 미등록 상태)
        W.me = {
          id: 'BOOTSTRAP_' + Date.now(),
          name: googleEmail.split('@')[0],
          department: '관리자',
          rank: '관리자',
          googleEmail: googleEmail,
          role: 'admin',
          status: 'active',
          _bootstrap: true,
        };
        showBootstrapUI(googleEmail, true);
      } else {
        showBootstrapUI(googleEmail, false);
      }
    }

    // 전역 공개 (facility/vehicle/quicktask 모듈에서 참조)
    window._workMe = W.me;
    window._workW  = W;   // quicktask에서 ASEA-개인업무 캘린더 ID 참조용

    renderProfileCard();

    if (W.me) {
      var isAdmin = W.me.role === 'admin';
      if ($w('hr-management-card')) $w('hr-management-card').hidden = !isAdmin;
      if ($w('hr-init-card'))       $w('hr-init-card').hidden       = !isAdmin;
      if ($w('hr-clear-card'))      $w('hr-clear-card').hidden      = !isAdmin;
      if ($w('mgr-staff-card'))     $w('mgr-staff-card').hidden     = !isAdmin;

      // 대관/차량 관리자 섹션
      if (typeof FacilityModule  !== 'undefined') FacilityModule.initFacilityModule(isAdmin);
      if (typeof VehicleModule   !== 'undefined') VehicleModule.initVehicleModule(isAdmin);
      if (typeof ClassroomModule !== 'undefined') ClassroomModule.initClassroomModule(isAdmin);

      if (!W.me._bootstrap) {
        await refreshUnreadBadge();
        startPolling();
        await loadMyTasks();
        // 직원 목록 백그라운드 프리페치 (직원관리 탭 진입 즉시 렌더 가능하도록)
        if (!W.employees.length) {
          SheetsModule.getEmployees().then(function (emps) {
            W.employees = emps;
            W.empCacheAt = Date.now();
          }).catch(function () {});
        }
      }
    }
  }

  function renderProfileCard() {
    var card = $w('my-profile-card');
    var warn = $w('my-profile-unregistered');
    if (!card) return;

    if (W.me) {
      card.hidden = false;
      if (warn) warn.hidden = true;
      var roleMap = { admin:'관리자', manager:'부서장', staff:'일반직원' };
      var roleLabel = roleMap[W.me.role] || W.me.role;

      // 이름
      $w('my-profile-name').textContent = W.me.name || '';

      // 부서: roleLabel과 중복이면 숨김
      var deptEl = $w('my-profile-dept');
      if (deptEl) {
        var deptVal = (W.me.department || '').trim();
        deptEl.textContent = deptVal;
        deptEl.hidden = (!deptVal || deptVal === roleLabel);
      }

      // 직급: 부서·roleLabel과 중복이면 숨김
      var rankEl = $w('my-profile-rank');
      if (rankEl) {
        var rankVal = (W.me.rank || '').trim();
        var deptVal2 = (W.me.department || '').trim();
        rankEl.textContent = rankVal;
        rankEl.hidden = (!rankVal || rankVal === roleLabel || rankVal === deptVal2);
      }

      // 역할 뱃지
      var roleColors = { admin:'#1a73e8', manager:'#0b8043', staff:'#5f6368' };
      var roleEl = $w('my-profile-role');
      if (roleEl) {
        roleEl.textContent = roleLabel;
        roleEl.style.background = (roleColors[W.me.role] || '#888');
        roleEl.style.color = '#fff';
        roleEl.style.borderRadius = '4px';
        roleEl.style.padding = '2px 8px';
        roleEl.style.fontSize = '11px';
        roleEl.style.fontWeight = '600';
      }

      // 내 정보 수정 버튼 (없으면 생성)
      if (!$w('my-profile-edit-btn')) {
        var editBtn = document.createElement('button');
        editBtn.id = 'my-profile-edit-btn';
        editBtn.className = 'btn btn-ghost btn-sm';
        editBtn.style.cssText = 'margin-left:8px;font-size:12px';
        editBtn.textContent = '✏️ 내 정보 수정';
        editBtn.onclick = function () { _openMyProfileEdit(); };
        card.querySelector('.my-profile-info').appendChild(editBtn);
      }
    } else {
      card.hidden = true;
      if (warn) warn.hidden = false;
    }
  }

  function _openMyProfileEdit() {
    if (!W.me) return;
    // 간단한 인라인 편집 폼 토글
    var existing = $w('my-profile-edit-form');
    if (existing) { existing.remove(); return; }

    var form = document.createElement('div');
    form.id = 'my-profile-edit-form';
    form.style.cssText = 'margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px';
    form.innerHTML =
      '<input id="mpe-name"  type="text"  class="form-input" placeholder="이름 *"   value="' + (W.me.name||'') + '">' +
      '<input id="mpe-dept"  type="text"  class="form-input" placeholder="부서"     value="' + (W.me.department||'') + '">' +
      '<input id="mpe-rank"  type="text"  class="form-input" placeholder="직급"     value="' + (W.me.rank||'') + '">' +
      '<input id="mpe-phone" type="tel"   class="form-input" placeholder="전화번호" value="' + (W.me.phone||'') + '">' +
      '<div style="grid-column:1/-1;display:flex;gap:8px">' +
        '<button id="mpe-save" class="btn btn-primary btn-sm">저장</button>' +
        '<button id="mpe-cancel" class="btn btn-ghost btn-sm">취소</button>' +
      '</div>';

    $w('my-profile-card').appendChild(form);

    $w('mpe-cancel').onclick = function () { form.remove(); };
    $w('mpe-save').onclick = async function () {
      var name = ($w('mpe-name').value||'').trim();
      if (!name) { toast('이름을 입력하세요.','error'); return; }
      this.disabled = true;
      try {
        var updated = Object.assign({}, W.me, {
          name: name,
          department: ($w('mpe-dept').value||'').trim(),
          rank: ($w('mpe-rank').value||'').trim(),
          phone: ($w('mpe-phone').value||'').trim(),
        });
        var headers = ['id','name','department','rank','googleEmail','hireDate','phone','role','status','createdAt'];
        var row = headers.map(function(h){ return updated[h]||''; });
        await SheetsModule.updateEmployee(W.me._row, updated);
        W.me = updated;
        W.employees = [];  // 캐시 초기화
        toast('✅ 내 정보를 수정했습니다.', 'success');
        form.remove();
        renderProfileCard();
      } catch(e) {
        toast('수정 실패: '+e.message, 'error');
        this.disabled = false;
      }
    };
  }

  /* ──────────────────────────────────────────────────
     탭 배지 (미접수 건수)
  ────────────────────────────────────────────────── */
  async function refreshUnreadBadge() {
    if (!W.me) return;
    try {
      var my = await SheetsModule.getMyTasks(W.me.id);
      var cnt = my.filter(function (r) { return r.status === '미접수'; }).length;
      var badge = $w('work-badge');
      if (badge) {
        badge.hidden = cnt === 0;
        badge.textContent = cnt;
      }
    } catch (e) {}
  }

  /* ──────────────────────────────────────────────────
     폴링 (30초 간격, Visibility API로 백그라운드 시 5분)
  ────────────────────────────────────────────────── */
  function startPolling() {
    if (W.pollTimer) clearInterval(W.pollTimer);

    function getInterval() {
      return document.hidden ? 5 * 60 * 1000 : 30 * 1000;
    }

    W.pollTimer = setInterval(async function () {
      if (!W.me || !Auth.isLoggedIn()) return;
      await SheetsModule.pollNewTasks(W.me.id, onNewTasksArrived);
      await refreshUnreadBadge();
    }, getInterval());

    document.addEventListener('visibilitychange', function () {
      clearInterval(W.pollTimer);
      W.pollTimer = setInterval(async function () {
        if (!W.me || !Auth.isLoggedIn()) return;
        await SheetsModule.pollNewTasks(W.me.id, onNewTasksArrived);
        await refreshUnreadBadge();
      }, getInterval());
    });
  }

  function onNewTasksArrived(tasks) {
    tasks.forEach(function (task) {
      // 앱 내 토스트
      toast('📋 새 업무: ' + task.title + ' (' + task.fromName + ')', 'info');

      // 브라우저 푸시 알림
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('ASEA — 새 업무 도착', {
          body: '[' + task.type + '] ' + task.title + '\n발신: ' + task.fromName,
          icon: '/favicon.ico',
          tag: task.id,
        });
      }
    });

    // 현황판이 열려있으면 자동 갱신
    if (W.wtab === 'my') loadMyTasks();
  }

  /* ──────────────────────────────────────────────────
     푸시 알림 권한 요청
  ────────────────────────────────────────────────── */
  function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  /* ──────────────────────────────────────────────────
     ASEA 전용 캘린더 확보 (없으면 자동 생성)
  ────────────────────────────────────────────────── */
  async function ensureAseaCalendars() {
    try {
      var token = Auth.getToken();
      var res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      var data = await res.json();
      var list = data.items || [];

      var names = ['ASEA-개인업무', 'ASEA-부서업무', 'ASEA-지시업무'];
      var colors = ['9', '6', '11']; // 파랑, 초록, 빨강

      for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var found = list.find(function (c) { return c.summary === name; });
        if (!found) {
          var cr = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ summary: name }),
          });
          var newCal = await cr.json();
          // 색상 설정
          await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList/' + encodeURIComponent(newCal.id), {
            method: 'PATCH',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ colorId: colors[i] }),
          });
          found = newCal;
        }
        if (name === 'ASEA-개인업무') W.asea개인CalId = found.id;
        if (name === 'ASEA-부서업무') W.asea부서CalId = found.id;
        if (name === 'ASEA-지시업무') W.asea지시CalId = found.id;
      }
    } catch (e) {
      console.warn('ASEA 캘린더 생성 실패:', e);
    }
  }

  /* ──────────────────────────────────────────────────
     캘린더 이벤트 등록
  ────────────────────────────────────────────────── */
  async function registerTaskCalEvent(task, calendarId, allDay, startDt, endDt) {
    var token = Auth.getToken();
    var prefix = task.type === '지시' ? '[지시]' : task.type === '협조' ? '[협조]' : '[공람]';
    var title = prefix + ' ' + task.title;

    var eventBody;
    if (allDay) {
      var due = task.dueDate || new Date().toISOString().slice(0,10);
      eventBody = {
        summary: title,
        start: { date: due },
        end: { date: due },
        description: buildEventDesc(task),
      };
    } else {
      eventBody = {
        summary: title,
        start: { dateTime: new Date(startDt).toISOString() },
        end:   { dateTime: new Date(endDt).toISOString() },
        description: buildEventDesc(task),
      };
    }

    var res = await fetch('https://www.googleapis.com/calendar/v3/calendars/' +
      encodeURIComponent(calendarId) + '/events', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody),
    });
    var ev = await res.json();
    return ev.id;
  }

  async function updateTaskCalEventStatus(calendarId, eventId, status) {
    if (!calendarId || !eventId) return;
    var token = Auth.getToken();
    var iconMap = { '완료':'✅', '반려':'❌', '처리중':'🟡', '미접수':'🔴' };
    // 현재 이벤트 조회
    var res = await fetch('https://www.googleapis.com/calendar/v3/calendars/' +
      encodeURIComponent(calendarId) + '/events/' + eventId,
      { headers: { 'Authorization': 'Bearer ' + token } });
    if (!res.ok) return;
    var ev = await res.json();
    var title = ev.summary || '';
    // 기존 상태 아이콘 제거 후 새 아이콘 앞에 붙이기
    title = title.replace(/^[✅❌🟡🔴]\s*/, '');
    var icon = iconMap[status] || '';
    await fetch('https://www.googleapis.com/calendar/v3/calendars/' +
      encodeURIComponent(calendarId) + '/events/' + eventId, {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: icon + ' ' + title }),
    });
  }

  /* ──────────────────────────────────────────────────
     이메일 HTML 템플릿 빌더
  ────────────────────────────────────────────────── */
  function buildTaskEmailHtml(task, recipientName) {
    var typeColorMap = { '지시':'#D32F2F','협조':'#1565C0','공람':'#2E7D32','알림':'#E65100' };
    var catIconMap   = { '일반업무':'📌','교육일정':'🎓','행사':'🎉','대관':'🏢','차량':'🚗' };
    var typeColor = typeColorMap[task.type] || '#424242';
    var catIcon   = catIconMap[task.category] || '📋';
    var appUrl    = CONFIG.baseUrl || 'https://bangdw-hash.github.io/asea-calendar-management/';
    var contentText = (task.content || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g,' ').trim().slice(0,300);
    var dueStr = task.dueDate ? '마감: ' + task.dueDate : '';

    return [
      '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<style>',
      'body{margin:0;padding:0;background:#f5f5f5;font-family:\'Noto Sans KR\',Apple SD Gothic Neo,sans-serif}',
      '.wrap{max-width:600px;margin:24px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1)}',
      '.header{background:'+typeColor+';padding:20px 28px;color:#fff}',
      '.header-badge{display:inline-block;background:rgba(255,255,255,.25);border-radius:20px;padding:3px 14px;font-size:13px;font-weight:700;margin-bottom:10px}',
      '.header-title{font-size:20px;font-weight:700;line-height:1.4;margin:0}',
      '.body{padding:24px 28px}',
      '.meta-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}',
      '.meta-chip{background:#f0f0f0;border-radius:6px;padding:4px 12px;font-size:12px;color:#555}',
      '.section-label{font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}',
      '.content-box{background:#f8f9fa;border-left:4px solid '+typeColor+';border-radius:0 6px 6px 0;padding:14px 16px;font-size:14px;color:#333;line-height:1.7;white-space:pre-wrap;margin-bottom:18px}',
      '.action-btn{display:block;width:fit-content;margin:0 auto 8px;background:'+typeColor+';color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:700;text-align:center}',
      '.footer{background:#f5f5f5;padding:14px 28px;font-size:11px;color:#888;text-align:center;border-top:1px solid #e0e0e0}',
      '.divider{height:1px;background:#eee;margin:16px 0}',
      '</style></head><body>',
      '<div class="wrap">',
      '  <div class="header">',
      '    <div class="header-badge">'+catIcon+' '+task.category+' · '+task.type+'</div>',
      '    <div class="header-title">'+escHtml(task.title)+'</div>',
      '  </div>',
      '  <div class="body">',
      '    <p style="font-size:15px;color:#333;margin-top:0">안녕하세요, <strong>'+escHtml(recipientName)+'</strong>님.</p>',
      '    <p style="font-size:14px;color:#555;margin-top:-8px">새 업무 알림이 도착했습니다.</p>',
      '    <div class="divider"></div>',
      '    <div class="meta-row">',
      '      <span class="meta-chip">👤 발신: '+escHtml(task.fromName)+'</span>',
      '      <span class="meta-chip">📅 발송일: '+new Date().toLocaleDateString('ko-KR')+'</span>',
      (dueStr ? '      <span class="meta-chip" style="background:#fff3e0;color:#e65100">⏰ '+escHtml(dueStr)+'</span>' : ''),
      '    </div>',
      '    <div class="section-label">업무 내용</div>',
      '    <div class="content-box">'+escHtml(contentText)+(contentText.length === 300 ? '...' : '')+'</div>',
      '    <a href="'+appUrl+'" class="action-btn">📱 ASEA 시스템에서 확인하기</a>',
      '    <p style="text-align:center;font-size:12px;color:#aaa;margin-top:4px">위 버튼을 클릭하여 업무를 접수하고 캘린더에 등록하세요.</p>',
      '  </div>',
      '  <div class="footer">',
      '    본 메일은 ASEA 업무관리 시스템에서 자동 발송된 알림입니다.<br>',
      '    발신: '+escHtml(task.fromName)+' | '+new Date().toLocaleString('ko-KR'),
      '  </div>',
      '</div>',
      '</body></html>',
    ].join('\n');
  }

  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ──────────────────────────────────────────────────
     업무 이메일 발송 (수신자별 개별 발송)
  ────────────────────────────────────────────────── */
  async function sendTaskEmails(task, recipients, employees) {
    if (!window.GmailModule) return;
    var me = W.me || {};
    var senderDisplay = me.name ? me.name + ' (' + me.department + ')' : me.googleEmail;

    var failCount = 0;
    for (var i = 0; i < recipients.length; i++) {
      var r = recipients[i];
      // DB에서 이메일 주소 조회
      var emp = employees.find(function(e){ return e.id === r.id; });
      if (!emp || !emp.googleEmail) continue;

      try {
        await window.GmailModule.sendHtmlEmail({
          to:          [{ name: r.name, email: emp.googleEmail }],
          subject:     '[ASEA ' + (task.type||'업무') + '] ' + task.title,
          htmlBody:    buildTaskEmailHtml(task, r.name),
          fromDisplay: senderDisplay,
          replyTo:     me.googleEmail || CONFIG.senderEmail,
        });
      } catch(e) {
        console.warn('업무 메일 발송 실패 (' + r.name + '):', e.message);
        failCount++;
      }
    }
    return failCount;
  }

  function buildEventDesc(task) {
    return [
      '📋 업무 ID: ' + task.id,
      '👤 발신: ' + task.fromName + ' (' + (task.fromDept || '') + ')',
      '📌 상태: 처리중',
      '─────────────',
      (task.content || '').replace(/<[^>]+>/g, ''),
    ].join('\n');
  }

  /* ──────────────────────────────────────────────────
     업무 발송
  ────────────────────────────────────────────────── */
  async function sendTask() {
    if (!W.me) { toast('로그인 후 이용하세요.', 'error'); return; }

    var title    = ($w('work-title').value || '').trim();
    var category = $w('work-category') ? $w('work-category').value : '일반업무';
    var type     = $w('work-type').value;
    var scope    = $w('work-scope').value;
    var due      = $w('work-due').value;
    var content  = $w('work-content-editor').innerHTML;

    if (!title) { toast('제목을 입력하세요.', 'error'); return; }
    if (W.selectedRecipients.length === 0) { toast('수신자를 선택하세요.', 'error'); return; }
    if (!content || content === '<br>') { toast('업무 내용을 입력하세요.', 'error'); return; }

    var btn = $w('work-send-btn');
    btn.disabled = true; btn.textContent = '발송 중...';

    try {
      var taskId = await SheetsModule.createTask({
        title:     title,
        content:   content,
        category:  category,
        type:      type,
        fromId:    W.me.id,
        fromName:  W.me.name + ' (' + W.me.department + ')',
        toIds:     W.selectedRecipients.map(function (r) { return r.id; }),
        toNames:   W.selectedRecipients.map(function (r) { return r.name; }),
        shareScope: scope,
        dueDate:   due,
      });

      // 수신자별 수신 행 생성
      await SheetsModule.createReceived(taskId, W.selectedRecipients.map(function (r) {
        return { userId: r.id, userName: r.name };
      }));

      // 발송자 캘린더(ASEA-지시업무)에 자동 등록
      await ensureAseaCalendars();
      if (W.asea지시CalId && due) {
        var calId = await registerTaskCalEvent(
          { id: taskId, title: title, type: type, dueDate: due, content: content,
            fromName: W.me.name, fromDept: W.me.department },
          W.asea지시CalId, true
        );
        await SheetsModule.updateTaskCalEvent(taskId, calId);
      }

      // 이메일 알림 발송 (백그라운드, 실패해도 업무 등록은 완료)
      var emailRecipients = W.selectedRecipients.slice();
      var taskForEmail = {
        id: taskId, title: title, content: content,
        category: category, type: type,
        fromName: W.me.name + ' (' + W.me.department + ')',
        dueDate: due,
      };
      getEmployeesCached().then(function(employees) {
        sendTaskEmails(taskForEmail, emailRecipients, employees).then(function(failCount) {
          if (failCount > 0) toast('⚠️ ' + failCount + '명 이메일 발송 실패 (업무 등록은 완료)', 'warning');
          else toast('📧 이메일 알림 발송 완료', 'info');
        });
      });

      // 발송 완료 후 폼 초기화
      $w('work-title').value = '';
      $w('work-content-editor').innerHTML = '';
      $w('work-due').value = '';
      W.selectedRecipients = [];
      W.attachFiles = [];
      renderRecipientChips();

      toast('✅ 업무가 발송되었습니다.', 'success');

      // 내 업무 탭으로 이동
      switchWTab('my');
      await loadMyTasks();
    } catch (e) {
      toast('발송 실패: ' + (e.message || e), 'error');
    } finally {
      btn.disabled = false; btn.textContent = '📤 발송하기';
    }
  }

  /* ──────────────────────────────────────────────────
     내 업무현황 로드 및 렌더
  ────────────────────────────────────────────────── */
  async function loadMyTasks() {
    if (!W.me) return;
    var listEl = $w('work-my-list');
    if (!listEl) return;
    listEl.innerHTML = '<p class="empty-state">불러오는 중...</p>';

    try {
      var [received, allTasks] = await Promise.all([
        SheetsModule.getMyTasks(W.me.id),
        SheetsModule.getTasks(),
      ]);

      // 발송한 업무
      W.sentTasks = allTasks.filter(function (t) { return t.fromId === W.me.id; });
      W.myTasks = received;
      W.allTasks = allTasks;

      // 개인 등록 업무 (빠른 등록 또는 직접 등록한 개인 업무)
      W.personalTasks = allTasks.filter(function (t) {
        return t.fromId === W.me.id && t.shareScope === '개인';
      });

      updateStatusCounts(received);

      if (W.currentStatus === '개인') {
        renderPersonalList();
      } else {
        renderMyList(received, allTasks);
      }
    } catch (e) {
      listEl.innerHTML = '<p class="empty-state" style="color:#e53935">로드 실패: ' + (e.message||e) + '</p>';
    }
  }

  function updateStatusCounts(received) {
    var counts = { '미접수':0, '처리중':0, '완료':0 };
    received.forEach(function (r) { if (counts[r.status] !== undefined) counts[r.status]++; });
    ['미접수','처리중','완료'].forEach(function (s) {
      var el = $w('cnt-' + s);
      if (el) el.textContent = counts[s];
    });
    var sentEl = $w('cnt-발송');
    if (sentEl) sentEl.textContent = W.sentTasks.length;
    var perEl = $w('cnt-개인');
    if (perEl) perEl.textContent = W.personalTasks.length;
  }

  /* ──────────────────────────────────────────────────
     개인 등록 업무 렌더링
  ────────────────────────────────────────────────── */
  function renderPersonalList() {
    var listEl = $w('work-my-list');
    if (!listEl) return;

    var tasks = W.personalTasks;
    if (W.personalStatusFilter !== '전체') {
      tasks = tasks.filter(function (t) {
        var st = t.status || '예정';
        return st === W.personalStatusFilter;
      });
    }

    // 필터 바
    var filterBar =
      '<div class="personal-filter-bar">' +
        ['전체','예정','완료'].map(function (f) {
          return '<button class="personal-filter-btn ' + (W.personalStatusFilter === f ? 'active' : '') + '" data-filter="' + f + '">' +
            (f === '예정' ? '🕐 예정' : f === '완료' ? '✅ 완료' : '📋 전체') +
            ' <span class="work-cnt">' + (f === '전체' ? W.personalTasks.length :
              W.personalTasks.filter(function(t){ return (t.status||'예정') === f; }).length) + '</span>' +
          '</button>';
        }).join('') +
        '<a href="#" id="personal-quick-add-link" style="margin-left:auto;font-size:12px;color:#1A73E8;text-decoration:none;align-self:center">+ 빠른 등록</a>' +
      '</div>';

    if (tasks.length === 0) {
      listEl.innerHTML = filterBar + '<p class="empty-state" style="margin-top:12px">' +
        (W.personalStatusFilter === '전체' ? '등록된 개인 업무가 없습니다.<br><small>빠른 업무 등록(Ctrl+Alt+R)으로 추가해보세요.</small>'
         : W.personalStatusFilter + ' 상태의 개인 업무가 없습니다.') + '</p>';
      _bindPersonalFilterBtns();
      return;
    }

    var html = filterBar + '<div class="personal-task-list">';

    // 예정 먼저, 완료 나중 정렬
    var sorted = tasks.slice().sort(function (a, b) {
      var sa = a.status || '예정', sb = b.status || '예정';
      if (sa === sb) {
        return (a.dueDate || '').localeCompare(b.dueDate || '');
      }
      return sa === '예정' ? -1 : 1;
    });

    var catColor = { '일반업무':'#4285F4','교육일정':'#0F9D58','행사':'#F4B400','대관':'#2E7D32','차량':'#DB4437','기타':'#9E9E9E' };

    sorted.forEach(function (task) {
      var st = task.status || '예정';
      var isDone = st === '완료';
      html +=
        '<div class="personal-task-card ' + (isDone ? 'personal-task-done' : '') + '" data-task-id="' + task.id + '">' +
          '<div class="personal-task-header">' +
            '<span class="qt-cat-badge" style="background:' + (catColor[task.category] || '#9E9E9E') + '">' + (task.category || '일반업무') + '</span>' +
            '<span class="personal-task-title">' + escapeHtml(task.title) + '</span>' +
            '<span class="personal-task-status ' + (isDone ? 'pst-done' : 'pst-pending') + '">' +
              (isDone ? '✅ 완료' : '🕐 예정') +
            '</span>' +
          '</div>' +
          (task.dueDate ? '<div class="personal-task-due">📅 ' + task.dueDate + '</div>' : '') +
          (task.content ? '<div class="personal-task-content">' + escapeHtml(task.content.slice(0,100)) + (task.content.length>100?'…':'') + '</div>' : '') +
          '<div class="personal-task-actions">' +
            '<button class="btn btn-sm ' + (isDone ? 'btn-ghost personal-toggle-pending' : 'btn-primary personal-toggle-done') + '" data-task-id="' + task.id + '" data-status="' + st + '">' +
              (isDone ? '↩ 예정으로 되돌리기' : '✅ 완료 처리') +
            '</button>' +
          '</div>' +
        '</div>';
    });

    html += '</div>';
    listEl.innerHTML = html;
    _bindPersonalFilterBtns();

    // 완료/예정 토글 버튼
    listEl.querySelectorAll('[data-status]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var taskId    = this.dataset.taskId;
        var curStatus = this.dataset.status;
        var newStatus = curStatus === '완료' ? '예정' : '완료';
        btn.disabled = true; btn.textContent = '처리 중...';
        try {
          await SheetsModule.updateTaskStatus(taskId, newStatus);
          // 로컬 캐시 업데이트
          var t = W.personalTasks.find(function(x){ return x.id === taskId; });
          if (t) t.status = newStatus;
          var t2 = W.allTasks.find(function(x){ return x.id === taskId; });
          if (t2) t2.status = newStatus;
          updateStatusCounts(W.myTasks);
          renderPersonalList();
          toast(newStatus === '완료' ? '✅ 완료 처리되었습니다.' : '↩ 예정으로 변경되었습니다.', 'success');
        } catch (e) {
          toast('상태 변경 실패: ' + (e.message||e), 'error');
          btn.disabled = false;
        }
      });
    });

    // 빠른 등록 링크
    var quickLink = $w('personal-quick-add-link');
    if (quickLink) quickLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (typeof QuickTaskModule !== 'undefined') QuickTaskModule.open();
    });
  }

  function _bindPersonalFilterBtns() {
    document.querySelectorAll('.personal-filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        W.personalStatusFilter = this.dataset.filter;
        renderPersonalList();
      });
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function renderMyList(received, allTasks) {
    var listEl = $w('work-my-list');
    if (!listEl) return;

    if (W.currentStatus === '개인') {
      renderPersonalList();
      return;
    }

    var filtered;
    if (W.currentStatus === '발송') {
      filtered = W.sentTasks;
      renderSentList(filtered, listEl);
      return;
    } else {
      filtered = received.filter(function (r) { return r.status === W.currentStatus; });
    }

    if (filtered.length === 0) {
      listEl.innerHTML = '<p class="empty-state">' + W.currentStatus + ' 업무가 없습니다.</p>';
      return;
    }

    listEl.innerHTML = '';
    filtered.forEach(function (r) {
      var task = allTasks.find(function (t) { return t.id === r.taskId; }) || {};
      var card = document.createElement('div');
      card.className = 'work-card';
      card.innerHTML =
        '<div class="work-card-header">' +
          '<span class="work-type-badge" style="background:' + typeColor(task.type) + '">' + (task.type||'') + '</span>' +
          '<span class="work-card-title">' + (task.title||'(제목없음)') + '</span>' +
          '<span class="work-card-due">' + (task.dueDate ? '📅 ' + task.dueDate : '') + '</span>' +
        '</div>' +
        '<div class="work-card-meta">' +
          '<span>발신: ' + (task.fromName||'') + '</span>' +
          '<span class="work-status-label">' + statusBadge(r.status) + '</span>' +
        '</div>' +
        (r.status === '미접수'
          ? '<button class="btn btn-primary btn-sm work-accept-btn" style="margin-top:8px">접수하기</button>'
          : '<button class="btn btn-ghost btn-sm work-detail-btn" style="margin-top:8px">상세보기</button>');

      var acceptBtn = card.querySelector('.work-accept-btn');
      if (acceptBtn) acceptBtn.addEventListener('click', function () { openDetailModal(task, r, 'accept'); });

      var detailBtn = card.querySelector('.work-detail-btn');
      if (detailBtn) detailBtn.addEventListener('click', function () { openDetailModal(task, r, 'view'); });

      listEl.appendChild(card);
    });
  }

  function renderSentList(tasks, listEl) {
    if (tasks.length === 0) {
      listEl.innerHTML = '<p class="empty-state">발송한 업무가 없습니다.</p>';
      return;
    }
    listEl.innerHTML = '';
    tasks.forEach(function (task) {
      var card = document.createElement('div');
      card.className = 'work-card';
      card.innerHTML =
        '<div class="work-card-header">' +
          '<span class="work-type-badge" style="background:' + typeColor(task.type) + '">' + task.type + '</span>' +
          '<span class="work-card-title">' + (task.title||'') + '</span>' +
          '<span class="work-card-due">' + (task.dueDate ? '📅 ' + task.dueDate : '') + '</span>' +
        '</div>' +
        '<div class="work-card-meta">' +
          '<span>수신: ' + (task.toNames||'') + '</span>' +
          '<span style="font-size:12px;color:#888">' + formatDate(task.createdAt) + '</span>' +
        '</div>' +
        '<button class="btn btn-ghost btn-sm" style="margin-top:8px">발송 현황 보기</button>';

      card.querySelector('button').addEventListener('click', function () {
        openDetailModal(task, null, 'sent');
      });
      listEl.appendChild(card);
    });
  }

  /* ──────────────────────────────────────────────────
     부서 현황
  ────────────────────────────────────────────────── */
  async function loadDeptTasks() {
    if (!W.me) return;
    var listEl = $w('work-dept-list');
    if (!listEl) return;
    listEl.innerHTML = '<p class="empty-state">불러오는 중...</p>';

    try {
      var [allTasks, allReceived, employees] = await Promise.all([
        SheetsModule.getTasks(),
        SheetsModule.getReceived(),
        getEmployeesCached(),
      ]);

      var myDept = W.me.department;
      var titleEl = $w('work-dept-title');
      if (titleEl) titleEl.textContent = myDept + ' 업무현황';

      // 부서 직원 ID 목록
      var deptEmpIds = employees
        .filter(function (e) { return e.department === myDept && e.status === 'active'; })
        .map(function (e) { return e.id; });

      // 부서원이 수신한 업무
      var deptReceived = allReceived.filter(function (r) { return deptEmpIds.includes(r.userId); });

      if (deptReceived.length === 0) {
        listEl.innerHTML = '<p class="empty-state">부서 업무 내역이 없습니다.</p>';
        return;
      }

      // 직원별 집계
      var summary = {};
      deptEmpIds.forEach(function (id) {
        var emp = employees.find(function (e) { return e.id === id; });
        summary[id] = { name: emp ? emp.name : id, rank: emp ? emp.rank : '', 미접수:0, 처리중:0, 완료:0, 지연:0 };
      });

      var today = new Date();
      deptReceived.forEach(function (r) {
        if (!summary[r.userId]) return;
        var s = summary[r.userId];
        if (r.status === '미접수') s['미접수']++;
        else if (r.status === '처리중') s['처리중']++;
        else if (r.status === '완료') s['완료']++;

        // 지연 체크
        var task = allTasks.find(function (t) { return t.id === r.taskId; });
        if (task && task.dueDate && r.status !== '완료') {
          if (new Date(task.dueDate) < today) s['지연']++;
        }
      });

      listEl.innerHTML = '';
      var table = document.createElement('div');
      table.className = 'work-dept-table';
      table.innerHTML =
        '<div class="work-dept-row work-dept-header">' +
          '<span>이름</span><span>직급</span>' +
          '<span>미접수</span><span>처리중</span><span>완료</span><span>지연</span>' +
        '</div>' +
        Object.values(summary).map(function (s) {
          return '<div class="work-dept-row">' +
            '<span>' + s.name + '</span>' +
            '<span>' + s.rank + '</span>' +
            '<span class="' + (s['미접수'] ? 'work-cnt-red' : '') + '">' + s['미접수'] + '</span>' +
            '<span class="' + (s['처리중'] ? 'work-cnt-yellow' : '') + '">' + s['처리중'] + '</span>' +
            '<span class="' + (s['완료'] ? 'work-cnt-green' : '') + '">' + s['완료'] + '</span>' +
            '<span class="' + (s['지연'] ? 'work-cnt-red' : '') + '">' + (s['지연'] ? '⚠️' + s['지연'] : '0') + '</span>' +
          '</div>';
        }).join('');

      listEl.appendChild(table);
    } catch (e) {
      listEl.innerHTML = '<p class="empty-state" style="color:#e53935">로드 실패: ' + (e.message||e) + '</p>';
    }
  }

  /* ──────────────────────────────────────────────────
     업무 상세 모달
  ────────────────────────────────────────────────── */
  function openDetailModal(task, received, mode) {
    W.detailTask = task;
    W.detailReceived = received;

    $w('work-detail-type-badge').textContent = '[' + (task.type||'업무') + '] ' + (task.title||'');
    $w('work-detail-from').textContent = task.fromName || '-';
    $w('work-detail-to').textContent = task.toNames || '-';
    $w('work-detail-due').textContent = task.dueDate ? formatDate(task.dueDate) : '-';
    $w('work-detail-scope').textContent = task.shareScope || '-';
    $w('work-detail-status').textContent = received ? statusBadge(received.status) : '발송됨';
    $w('work-detail-content').innerHTML = task.content || '';
    $w('work-detail-comment').value = '';

    var actionArea = $w('work-detail-action-area');
    var leftBtns   = $w('work-detail-left-btns');
    var rightBtns  = $w('work-detail-right-btns');

    actionArea.hidden = true;
    leftBtns.innerHTML = '';
    rightBtns.innerHTML = '';

    if (mode === 'accept') {
      // 접수하기 화면
      actionArea.hidden = false;
      var calArea = $w('work-cal-register-area');
      calArea.hidden = false;

      // 라디오 변경 시 커스텀 시간 표시
      document.querySelectorAll('input[name="work-cal-mode"]').forEach(function (r) {
        r.onchange = function () {
          $w('work-cal-custom-time').style.display = this.value === 'custom' ? 'flex' : 'none';
        };
      });

      rightBtns.innerHTML =
        '<button id="wd-accept-btn" class="btn btn-primary">✅ 접수 + 캘린더 등록</button>' +
        '<button id="wd-accept-only-btn" class="btn btn-ghost">접수만</button>';

      $w('wd-accept-btn').onclick = function () { acceptTask(true); };
      $w('wd-accept-only-btn').onclick = function () { acceptTask(false); };

    } else if (mode === 'view') {
      // 처리중/완료 화면
      actionArea.hidden = false;
      $w('work-cal-register-area').hidden = true;

      if (received && received.status === '처리중') {
        rightBtns.innerHTML =
          '<button id="wd-complete-btn" class="btn btn-primary">🟢 완료처리</button>' +
          '<button id="wd-reject-btn" class="btn btn-ghost btn-danger" style="color:#d32f2f">반려</button>';
        $w('wd-complete-btn').onclick = function () { updateStatus('완료'); };
        $w('wd-reject-btn').onclick   = function () { updateStatus('반려'); };
      }
    }

    openModal('work-detail-modal');
  }

  async function acceptTask(withCal) {
    if (!W.detailTask || !W.detailReceived) return;
    var btn = $w('wd-accept-btn') || $w('wd-accept-only-btn');
    if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }

    try {
      await ensureAseaCalendars();
      var calEventId = '';

      if (withCal) {
        var mode = document.querySelector('input[name="work-cal-mode"]:checked');
        var allDay = !mode || mode.value === 'allday';
        var startDt = $w('work-cal-start') ? $w('work-cal-start').value : '';
        var endDt   = $w('work-cal-end')   ? $w('work-cal-end').value   : '';
        var doPersonal = $w('work-cal-personal') && $w('work-cal-personal').checked;
        var doDept     = $w('work-cal-dept')     && $w('work-cal-dept').checked;

        if (doPersonal && W.asea개인CalId) {
          calEventId = await registerTaskCalEvent(W.detailTask, W.asea개인CalId, allDay, startDt, endDt);
        }
        if (doDept && W.asea부서CalId) {
          await registerTaskCalEvent(W.detailTask, W.asea부서CalId, allDay, startDt, endDt);
        }
      }

      var comment = $w('work-detail-comment').value.trim();
      await SheetsModule.updateReceivedStatus(W.detailReceived._row, '처리중', comment, calEventId);

      closeModal('work-detail-modal');
      toast('✅ 업무를 접수했습니다.', 'success');
      await loadMyTasks();
      await refreshUnreadBadge();
    } catch (e) {
      toast('접수 실패: ' + (e.message||e), 'error');
    }
  }

  async function updateStatus(status) {
    if (!W.detailReceived) return;
    var comment = $w('work-detail-comment').value.trim();

    try {
      await SheetsModule.updateReceivedStatus(W.detailReceived._row, status, comment, W.detailReceived.calEventId);

      // 캘린더 이벤트 상태 업데이트
      if (W.detailReceived.calEventId && W.asea개인CalId) {
        await updateTaskCalEventStatus(W.asea개인CalId, W.detailReceived.calEventId, status);
      }

      closeModal('work-detail-modal');
      toast(status === '완료' ? '🟢 완료 처리했습니다.' : '업무 상태가 변경되었습니다.', 'success');
      await loadMyTasks();
    } catch (e) {
      toast('상태 변경 실패: ' + (e.message||e), 'error');
    }
  }

  /* ──────────────────────────────────────────────────
     수신자 검색 및 선택
  ────────────────────────────────────────────────── */
  async function searchRecipients(query) {
    var emps = await getEmployeesCached();
    var q = query.toLowerCase();
    return emps.filter(function (e) {
      return e.status === 'active' && e.id !== (W.me && W.me.id) &&
        (e.name.includes(q) || e.department.toLowerCase().includes(q) || e.rank.includes(q));
    }).slice(0, 10);
  }

  function renderRecipientResults(results) {
    var el = $w('work-recipient-results');
    if (!el) return;
    if (results.length === 0) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '';
    results.forEach(function (emp) {
      var item = document.createElement('div');
      item.className = 'work-recipient-item';
      item.innerHTML =
        '<span style="font-weight:600">' + _escHr(emp.name) + '</span>' +
        '<span style="color:#5f6368;font-size:12px;margin-left:6px">' + _escHr(emp.department) + ' · ' + _escHr(emp.rank) + '</span>' +
        (emp.phone ? '<span style="color:#1a73e8;font-size:12px;margin-left:8px">📞 ' + _escHr(emp.phone) + '</span>' : '');
      item.onclick = function () {
        if (!W.selectedRecipients.find(function (r) { return r.id === emp.id; })) {
          W.selectedRecipients.push({ id: emp.id, name: emp.name, department: emp.department, phone: emp.phone || '' });
          renderRecipientChips();
        }
        el.hidden = true;
        $w('work-recipient-search').value = '';
      };
      el.appendChild(item);
    });
  }

  function renderRecipientChips() {
    var el = $w('work-recipients-selected');
    if (!el) return;
    el.innerHTML = '';
    W.selectedRecipients.forEach(function (r) {
      var chip = document.createElement('span');
      chip.className = 'work-recipient-chip';
      chip.title = r.phone ? '📞 ' + r.phone : '';
      chip.innerHTML =
        '👤 <strong>' + _escHr(r.name) + '</strong>' +
        (r.phone ? ' <span style="font-size:11px;opacity:.8">' + _escHr(r.phone) + '</span>' : '') +
        ' <button class="work-chip-remove" data-id="' + r.id + '">×</button>';
      chip.querySelector('.work-chip-remove').onclick = function () {
        W.selectedRecipients = W.selectedRecipients.filter(function (x) { return x.id !== r.id; });
        renderRecipientChips();
      };
      el.appendChild(chip);
    });
  }

  /* ──────────────────────────────────────────────────
     직원관리 (관리자)
  ────────────────────────────────────────────────── */
  var _hrSortKey = 'name';   // name | department | rank | role
  var _hrSortAsc = true;
  var _hrSelected = new Set();   // 선택된 행 _row 집합

  async function loadHrList() {
    var listEl = $w('hr-employee-list');
    var cntEl  = $w('hr-list-count');
    if (!listEl) return;

    var CACHE_TTL = 5 * 60 * 1000; // 5분 캐시
    var now = Date.now();

    // 캐시가 있으면 즉시 렌더 (화면 먼저)
    if (W.employees.length && (now - W.empCacheAt) < CACHE_TTL) {
      _renderHrTable(W.employees);
      return;
    }

    // 구 캐시가 있으면 일단 보여주고 백그라운드 갱신
    if (W.employees.length) {
      _renderHrTable(W.employees);
    } else {
      listEl.innerHTML = '<p class="empty-state">불러오는 중...</p>';
    }

    try {
      var emps = await SheetsModule.getEmployees();
      W.employees = emps;
      W.empCacheAt = Date.now();
      _renderHrTable(emps);
    } catch (e) {
      if (!W.employees.length) {
        listEl.innerHTML = '<p class="empty-state" style="color:#e53935">로드 실패: ' + e.message + '</p>';
      }
    }
  }

  function _renderHrTable(emps) {
    var listEl = $w('hr-employee-list');
    var cntEl  = $w('hr-list-count');
    if (!listEl) return;

    var active = (emps || W.employees || []).filter(function (e) { return e.status !== 'inactive'; });
    if (cntEl) cntEl.textContent = '직원 ' + active.length + '명';

    // 검색 필터
    var q = ($w('hr-search') && $w('hr-search').value || '').toLowerCase().trim();
    var filtered = q ? active.filter(function (e) {
      return (e.name||'').toLowerCase().includes(q) ||
             (e.department||'').toLowerCase().includes(q) ||
             (e.rank||'').toLowerCase().includes(q) ||
             (e.phone||'').includes(q);
    }) : active;

    // 정렬
    filtered = filtered.slice().sort(function (a, b) {
      var av = (a[_hrSortKey] || '').toLowerCase();
      var bv = (b[_hrSortKey] || '').toLowerCase();
      var roleOrder = { admin: 0, manager: 1, staff: 2 };
      if (_hrSortKey === 'role') { av = roleOrder[a.role] !== undefined ? roleOrder[a.role] : 9; bv = roleOrder[b.role] !== undefined ? roleOrder[b.role] : 9; }
      var cmp = typeof av === 'number' ? av - bv : av.localeCompare(bv, 'ko');
      return _hrSortAsc ? cmp : -cmp;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = '<p class="empty-state">' + (q ? '"' + q + '" 검색 결과가 없습니다.' : '직원이 없습니다.') + '</p>';
      return;
    }

    // ── 테이블 헤더
    var roleLabel = { admin:'관리자', manager:'부서장', staff:'직원' };
    var roleColor = { admin:'#1a73e8', manager:'#0b8043', staff:'#5f6368' };

    function _thSort(label, key, cls) {
      var arrow = _hrSortKey === key ? (_hrSortAsc ? ' ▲' : ' ▼') : ' ⇅';
      return '<th class="hr-th-sort ' + (cls||'') + '" data-sort="' + key + '" style="cursor:pointer;user-select:none">' +
        label + '<span style="opacity:.5;font-size:9px">' + arrow + '</span></th>';
    }

    listEl.innerHTML = '';

    // ── 일괄 작업 툴바
    var bulkBar = document.createElement('div');
    bulkBar.id = 'hr-bulk-bar';
    bulkBar.className = 'hr-bulk-bar';
    bulkBar.style.display = 'none';
    bulkBar.innerHTML =
      '<span class="hr-sel-count" id="hr-sel-count"></span>' +
      '<button class="btn btn-secondary btn-xs" id="hr-sel-all-btn">전체 선택</button>' +
      '<button class="btn btn-ghost btn-xs" id="hr-desel-all-btn">전체 해제</button>' +
      '<button class="btn btn-xs" id="hr-bulk-del-btn" style="background:#e53935;color:#fff;margin-left:4px">선택 삭제</button>' +
      '<button class="btn btn-primary btn-xs" id="hr-apply-btn" style="margin-left:auto">✅ 적용</button>';
    listEl.appendChild(bulkBar);

    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'overflow-x:auto';
    wrapper.innerHTML =
      '<table class="hr-emp-table">' +
      '<thead><tr>' +
        '<th class="col-chk"><input type="checkbox" id="hr-chk-all" title="전체선택"></th>' +
        _thSort('이름', 'name', 'col-name') +
        _thSort('부서', 'department', 'col-dept') +
        _thSort('직급', 'rank', 'col-rank') +
        _thSort('권한', 'role', 'col-role') +
        _thSort('입사일', 'hireDate', 'col-hire') +
        '<th class="col-email">이메일</th>' +
        '<th class="col-phone">전화번호</th>' +
        '<th class="col-mgmt">관리</th>' +
      '</tr></thead>' +
      '<tbody id="hr-emp-tbody"></tbody>' +
      '</table>';
    listEl.appendChild(wrapper);

    // 헤더 정렬 클릭
    wrapper.querySelectorAll('.hr-th-sort').forEach(function (th) {
      th.onclick = function () {
        var key = th.dataset.sort;
        if (_hrSortKey === key) { _hrSortAsc = !_hrSortAsc; }
        else { _hrSortKey = key; _hrSortAsc = true; }
        _renderHrTable();
      };
    });

    function _updateBulkBar() {
      var cnt = _hrSelected.size;
      bulkBar.style.display = cnt > 0 ? 'flex' : 'none';
      var cntEl = document.getElementById('hr-sel-count');
      if (cntEl) cntEl.textContent = cnt + '명 선택됨';
      var chkAll = document.getElementById('hr-chk-all');
      if (chkAll) chkAll.indeterminate = cnt > 0 && cnt < filtered.length;
      if (chkAll) chkAll.checked = cnt === filtered.length && filtered.length > 0;
    }

    // 전체선택 체크박스
    document.getElementById('hr-chk-all').onchange = function () {
      if (this.checked) {
        filtered.forEach(function (e) { _hrSelected.add(String(e._row)); });
      } else {
        _hrSelected.clear();
      }
      wrapper.querySelectorAll('.hr-row-chk').forEach(function (chk) {
        chk.checked = _hrSelected.has(chk.dataset.row);
        var tr = chk.closest('tr');
        if (tr) tr.classList.toggle('hr-row-selected', chk.checked);
      });
      _updateBulkBar();
    };

    // 전체선택 버튼
    document.getElementById('hr-sel-all-btn').onclick = function () {
      filtered.forEach(function (e) { _hrSelected.add(String(e._row)); });
      wrapper.querySelectorAll('.hr-row-chk').forEach(function (chk) {
        chk.checked = true;
        var tr = chk.closest('tr');
        if (tr) tr.classList.add('hr-row-selected');
      });
      _updateBulkBar();
    };

    // 전체해제 버튼
    document.getElementById('hr-desel-all-btn').onclick = function () {
      _hrSelected.clear();
      wrapper.querySelectorAll('.hr-row-chk').forEach(function (chk) {
        chk.checked = false;
        var tr = chk.closest('tr');
        if (tr) tr.classList.remove('hr-row-selected');
      });
      _updateBulkBar();
    };

    // 일괄 삭제
    document.getElementById('hr-bulk-del-btn').onclick = async function () {
      var cnt = _hrSelected.size;
      if (!cnt) return;
      if (!confirm(cnt + '명을 완전 삭제 처리하시겠습니까?\n이 작업은 DB에서 영구 삭제되며 되돌릴 수 없습니다.')) return;
      this.disabled = true; this.textContent = '삭제 중...';
      try {
        var rows = Array.from(_hrSelected).map(function (r) { return parseInt(r); });
        await SheetsModule.bulkDeleteEmployees(rows);
        _hrSelected.clear();
        W.employees = [];
        W.empCacheAt = 0;
        toast(cnt + '명 완전 삭제 완료', 'success');
        loadHrList();
      } catch(e) {
        toast('삭제 실패: ' + e.message, 'error');
        this.disabled = false; this.textContent = '선택 삭제';
      }
    };

    // 적용 (Sheets 즉시 동기화 — 캐시 초기화 후 재로드)
    document.getElementById('hr-apply-btn').onclick = async function () {
      this.disabled = true; this.textContent = '동기화 중...';
      W.employees = [];
      W.empCacheAt = 0;
      try { await loadHrList(); toast('✅ 직원 목록이 전산에 동기화되었습니다.', 'success'); }
      catch(e) { toast('동기화 실패: ' + e.message, 'error'); }
      this.disabled = false; this.textContent = '✅ 적용';
    };

    var tbody = document.getElementById('hr-emp-tbody');
    filtered.forEach(function (emp) {
      var tr = document.createElement('tr');
      var rl = roleLabel[emp.role] || emp.role;
      var rc = roleColor[emp.role] || '#888';
      var rowKey = String(emp._row);
      var isChecked = _hrSelected.has(rowKey);
      if (isChecked) tr.classList.add('hr-row-selected');

      var phoneDisplay = emp.phone
        ? '<a href="tel:' + _escHr(emp.phone) + '" style="color:#1a73e8;text-decoration:none;font-size:11px">' + _escHr(emp.phone) + '</a>'
        : '<span style="color:#ccc">-</span>';
      tr.innerHTML =
        '<td class="col-chk"><input type="checkbox" class="hr-row-chk" data-row="' + rowKey + '"' + (isChecked?' checked':'') + '></td>' +
        '<td class="hr-emp-name-cell col-name">' + _escHr(emp.name) + '</td>' +
        '<td class="col-dept" title="' + _escHr(emp.department) + '">' + _escHr(emp.department) + '</td>' +
        '<td class="col-rank" title="' + _escHr(emp.rank) + '">' + _escHr(emp.rank) + '</td>' +
        '<td class="col-role"><span class="hr-role-badge" style="background:' + rc + '">' + rl + '</span></td>' +
        '<td class="col-hire" style="color:#5f6368">' + _escHr(emp.hireDate||'') + '</td>' +
        '<td class="hr-email-cell col-email" title="' + _escHr(emp.googleEmail||'') + '">' + _escHr(emp.googleEmail||'') + '</td>' +
        '<td class="col-phone">' + phoneDisplay + '</td>' +
        '<td class="col-mgmt">' +
          '<button class="btn btn-secondary btn-xs hr-emp-edit" style="padding:2px 5px;font-size:10px;margin-right:2px">수정</button>' +
          '<button class="btn btn-ghost btn-xs hr-emp-del" style="padding:2px 5px;font-size:10px;color:#e53935">삭제</button>' +
        '</td>';

      tr.querySelector('.hr-row-chk').onchange = function () {
        if (this.checked) { _hrSelected.add(rowKey); tr.classList.add('hr-row-selected'); }
        else { _hrSelected.delete(rowKey); tr.classList.remove('hr-row-selected'); }
        _updateBulkBar();
      };

      tr.querySelector('.hr-emp-del').onclick = async function () {
        if (!confirm(emp.name + '을(를) DB에서 완전 삭제하시겠습니까?')) return;
        try {
          await SheetsModule.deleteEmployee(parseInt(emp._row));
          _hrSelected.delete(rowKey);
          W.employees = [];
          W.empCacheAt = 0;
          toast(emp.name + ' 삭제 완료', 'success');
          loadHrList();
        } catch(e) {
          toast('삭제 실패: ' + e.message, 'error');
        }
      };
      tr.querySelector('.hr-emp-edit').onclick = function () { _openHrEditModal(emp); };

      tbody.appendChild(tr);
    });

    // 초기 툴바 상태 동기화
    _updateBulkBar();
  }

  /* ── XSS 방어 ── */
  function _escHr(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── 직원 수정 모달 ── */
  function _openHrEditModal(emp) {
    // 기존 모달 제거
    var old = document.getElementById('hr-edit-modal');
    if (old) old.remove();

    var deptOptions = CONFIG.departments.map(function (d) {
      return '<option value="' + _escHr(d.name) + '"' + (d.name === emp.department ? ' selected' : '') + '>' + _escHr(d.name) + '</option>';
    }).join('');

    var modal = document.createElement('div');
    modal.id = 'hr-edit-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center';
    modal.innerHTML =
      '<div style="position:absolute;inset:0;background:rgba(0,0,0,.35)" id="hr-edit-backdrop"></div>' +
      '<div style="position:relative;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.2);width:min(500px,96vw);max-height:90vh;overflow:auto">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e0e4ea">' +
          '<h3 style="font-size:16px;font-weight:700;margin:0">✏️ 직원 정보 수정</h3>' +
          '<button id="hr-edit-close" style="font-size:18px;color:#888;background:none;border:none;cursor:pointer">✕</button>' +
        '</div>' +
        '<div style="padding:20px;display:flex;flex-direction:column;gap:12px">' +
          '<div><label style="font-size:12px;font-weight:600;color:#5f6368;display:block;margin-bottom:4px">이름 *</label>' +
            '<input id="hre-name" type="text" class="form-input" value="' + _escHr(emp.name) + '"></div>' +
          '<div><label style="font-size:12px;font-weight:600;color:#5f6368;display:block;margin-bottom:4px">소속 부서</label>' +
            '<select id="hre-dept" class="form-select"><option value="">부서 선택</option>' + deptOptions + '</select></div>' +
          '<div><label style="font-size:12px;font-weight:600;color:#5f6368;display:block;margin-bottom:4px">직급</label>' +
            '<input id="hre-rank" type="text" class="form-input" value="' + _escHr(emp.rank||'') + '" placeholder="예: 대리, 과장"></div>' +
          '<div><label style="font-size:12px;font-weight:600;color:#5f6368;display:block;margin-bottom:4px">구글 이메일</label>' +
            '<input id="hre-email" type="email" class="form-input" value="' + _escHr(emp.googleEmail||'') + '"></div>' +
          '<div><label style="font-size:12px;font-weight:600;color:#5f6368;display:block;margin-bottom:4px">전화번호</label>' +
            '<input id="hre-phone" type="tel" class="form-input" value="' + _escHr(emp.phone||'') + '"></div>' +
          '<div><label style="font-size:12px;font-weight:600;color:#5f6368;display:block;margin-bottom:4px">입사일</label>' +
            '<input id="hre-hire" type="date" class="form-input" value="' + _escHr(emp.hireDate||'') + '"></div>' +
          '<div><label style="font-size:12px;font-weight:600;color:#5f6368;display:block;margin-bottom:4px">권한</label>' +
            '<select id="hre-role" class="form-select">' +
              '<option value="staff"' + (emp.role==='staff'?' selected':'') + '>일반직원</option>' +
              '<option value="manager"' + (emp.role==='manager'?' selected':'') + '>부서장</option>' +
              '<option value="admin"' + (emp.role==='admin'?' selected':'') + '>관리자</option>' +
            '</select></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid #e0e4ea">' +
          '<button id="hre-cancel" class="btn btn-ghost">취소</button>' +
          '<button id="hre-save" class="btn btn-primary">저장</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

    function _close() { modal.remove(); }
    document.getElementById('hr-edit-close').onclick = _close;
    document.getElementById('hre-cancel').onclick = _close;
    document.getElementById('hr-edit-backdrop').onclick = _close;

    document.getElementById('hre-save').onclick = async function () {
      var name = (document.getElementById('hre-name').value||'').trim();
      if (!name) { toast('이름을 입력하세요.','error'); return; }
      this.disabled = true; this.textContent = '저장 중...';
      try {
        var updated = Object.assign({}, emp, {
          name:        name,
          department:  document.getElementById('hre-dept').value,
          rank:        document.getElementById('hre-rank').value,
          googleEmail: document.getElementById('hre-email').value,
          phone:       document.getElementById('hre-phone').value,
          hireDate:    document.getElementById('hre-hire').value,
          role:        document.getElementById('hre-role').value,
        });
        await SheetsModule.updateEmployee(emp._row, updated);
        // 내 정보인 경우 W.me도 갱신
        if (W.me && W.me._row === emp._row) {
          W.me = Object.assign(W.me, updated);
          renderProfileCard();
        }
        W.employees = []; // 캐시 초기화
        toast('✅ ' + name + ' 정보를 수정했습니다.', 'success');
        _close();
        loadHrList();
      } catch(e) {
        toast('수정 실패: ' + e.message, 'error');
        this.disabled = false; this.textContent = '저장';
      }
    };
  }

  async function addEmployeeManual() {
    var name  = ($w('hr-add-name').value || '').trim();
    var dept  = $w('hr-add-dept').value;
    var rank  = ($w('hr-add-rank').value || '').trim();
    var email = ($w('hr-add-email').value || '').trim();
    var hire  = $w('hr-add-hire').value;
    var phone = ($w('hr-add-phone').value || '').trim();
    var role  = $w('hr-add-role').value;

    if (!name)  { toast('이름을 입력하세요.', 'error'); return; }
    if (!email) { toast('구글 이메일을 입력하세요.', 'error'); return; }

    var btn = $w('hr-add-btn');
    btn.disabled = true;
    try {
      await SheetsModule.addEmployee({ name, department: dept, rank, googleEmail: email, hireDate: hire, phone, role });
      toast(name + ' 추가 완료!', 'success');
      ['hr-add-name','hr-add-rank','hr-add-email','hr-add-hire','hr-add-phone'].forEach(function (id) {
        if ($w(id)) $w(id).value = '';
      });
      await loadHrList();
    } catch (e) {
      toast('추가 실패: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  function handleCsvFile(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var lines = e.target.result.split('\n').filter(function (l) { return l.trim(); });
      var preview = $w('hr-csv-preview');
      var uploadBtn = $w('hr-csv-upload-btn');

      // 헤더 행 건너뜀
      var data = lines.slice(1).map(function (line) {
        var cols = line.split(',').map(function (c) { return c.trim().replace(/^"|"$/g,''); });
        return { name: cols[0], department: cols[1], rank: cols[2], googleEmail: cols[3],
                 hireDate: cols[4], phone: cols[5], role: cols[6] || 'staff' };
      }).filter(function (r) { return r.name && r.googleEmail; });

      if (preview) {
        preview.hidden = false;
        preview.innerHTML = '<strong>' + data.length + '명 확인됨</strong><br>' +
          data.slice(0,5).map(function (r) {
            return '• ' + r.name + ' / ' + r.department + ' / ' + r.rank;
          }).join('<br>') + (data.length > 5 ? '<br>...' : '');
      }

      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn._data = data;
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  function downloadCsvTemplate() {
    var header = '이름,부서,직급,구글이메일,입사일,전화번호,권한';
    var sample = '홍길동,기획처,대리,hong@gmail.com,2023-03-01,010-1234-5678,staff';
    var blob = new Blob(['﻿' + header + '\n' + sample], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ASEA_직원_양식.csv';
    a.click();
  }

  /* ──────────────────────────────────────────────────
     서브탭 전환
  ────────────────────────────────────────────────── */
  function switchWTab(tab) {
    W.wtab = tab;
    ['send','my','dept'].forEach(function (t) {
      var panel = $w('wtab-' + t);
      if (panel) panel.hidden = (t !== tab);
    });
    document.querySelectorAll('.extract-subtab-btn[data-wtab]').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.wtab === tab);
    });
  }

  /* ──────────────────────────────────────────────────
     부서 셀렉트 채우기
  ────────────────────────────────────────────────── */
  function populateDeptSelects() {
    var sel = $w('hr-add-dept');
    if (!sel) return;
    sel.innerHTML = '<option value="">부서 선택</option>';
    CONFIG.departments.forEach(function (d) {
      var opt = document.createElement('option');
      opt.value = d.name; opt.textContent = d.name;
      sel.appendChild(opt);
    });
  }

  /* ──────────────────────────────────────────────────
     초기화 진입점 (app.js의 init()에서 호출)
  ────────────────────────────────────────────────── */
  function initWorkModule() {

    // 서브탭
    document.querySelectorAll('.extract-subtab-btn[data-wtab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchWTab(this.dataset.wtab);
        if (this.dataset.wtab === 'my')   loadMyTasks();
        if (this.dataset.wtab === 'dept') loadDeptTasks();
      });
    });

    // 업무 발송 버튼
    var sendBtn = $w('work-send-btn');
    if (sendBtn) sendBtn.addEventListener('click', sendTask);

    // 새로고침
    var refBtn = $w('work-refresh-btn');
    if (refBtn) refBtn.addEventListener('click', loadMyTasks);
    var deptRefBtn = $w('work-dept-refresh-btn');
    if (deptRefBtn) deptRefBtn.addEventListener('click', loadDeptTasks);

    // 상태 탭 필터
    document.querySelectorAll('.work-status-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.work-status-tab').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        W.currentStatus = this.dataset.status;
        if (W.currentStatus === '개인') {
          // 개인 업무 탭: 로드 후 렌더
          if (W.personalTasks.length === 0 && W.me) {
            loadMyTasks();
          } else {
            renderPersonalList();
          }
        } else {
          renderMyList(W.myTasks, W.allTasks);
        }
      });
    });

    // 수신자 검색
    var searchInput = $w('work-recipient-search');
    if (searchInput) {
      var searchTimer;
      searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        var q = this.value.trim();
        if (!q) { var r = $w('work-recipient-results'); if (r) r.hidden = true; return; }
        searchTimer = setTimeout(async function () {
          var results = await searchRecipients(q);
          renderRecipientResults(results);
        }, 300);
      });
    }
    var searchBtn = $w('work-recipient-search-btn');
    if (searchBtn) searchBtn.addEventListener('click', async function () {
      var q = ($w('work-recipient-search').value || '').trim();
      if (!q) return;
      renderRecipientResults(await searchRecipients(q));
    });

    // 에디터 툴바
    document.querySelectorAll('.work-editor-btn[data-cmd]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.execCommand(this.dataset.cmd, false, null);
        $w('work-content-editor').focus();
      });
    });

    // 첨부파일
    var attachInput = $w('work-attach-input');
    if (attachInput) {
      attachInput.addEventListener('change', function () {
        Array.from(this.files).forEach(function (f) { W.attachFiles.push(f); });
        var listEl = $w('work-attach-list');
        if (listEl) {
          listEl.innerHTML = '';
          W.attachFiles.forEach(function (f, i) {
            var tag = document.createElement('span');
            tag.className = 'work-attach-chip';
            tag.innerHTML = '📎 ' + f.name + ' <button data-i="' + i + '">×</button>';
            tag.querySelector('button').onclick = function () {
              W.attachFiles.splice(parseInt(this.dataset.i), 1);
              listEl.removeChild(tag);
            };
            listEl.appendChild(tag);
          });
        }
        this.value = '';
      });
    }

    // 직원관리 버튼들
    var hrAddBtn = $w('hr-add-btn');
    if (hrAddBtn) hrAddBtn.addEventListener('click', addEmployeeManual);

    var hrCsvInput = $w('hr-csv-input');
    if (hrCsvInput) hrCsvInput.addEventListener('change', function () {
      if (this.files[0]) handleCsvFile(this.files[0]);
    });

    var hrCsvUpload = $w('hr-csv-upload-btn');
    if (hrCsvUpload) hrCsvUpload.addEventListener('click', async function () {
      if (!this._data || !this._data.length) return;
      this.disabled = true; this.textContent = '등록 중...';
      try {
        var cnt = await SheetsModule.bulkAddEmployees(this._data);
        toast(cnt + '명 등록 완료!', 'success');
        $w('hr-csv-preview').hidden = true;
        this._data = null;
        await loadHrList();
      } catch (e) {
        toast('등록 실패: ' + e.message, 'error');
      } finally {
        this.disabled = true; this.textContent = '⬆️ 일괄 등록';
      }
    });

    var hrCsvTmpl = $w('hr-csv-template-btn');
    if (hrCsvTmpl) hrCsvTmpl.addEventListener('click', downloadCsvTemplate);

    var hrRefresh = $w('hr-refresh-btn');
    if (hrRefresh) hrRefresh.addEventListener('click', loadHrList);

    var hrSearch = $w('hr-search');
    if (hrSearch) {
      var searchHrTimer;
      hrSearch.addEventListener('input', function () {
        clearTimeout(searchHrTimer);
        // 캐시된 데이터로 즉시 필터링 (네트워크 없이)
        if (W.employees.length) {
          clearTimeout(searchHrTimer);
          searchHrTimer = setTimeout(function () { _renderHrTable(); }, 200);
        } else {
          searchHrTimer = setTimeout(loadHrList, 400);
        }
      });
    }

    // 직원 전체 초기화 버튼
    var clearAllBtn = $w('hr-clear-all-btn');
    if (clearAllBtn) clearAllBtn.addEventListener('click', async function () {
      var statusEl = $w('hr-clear-status');
      if (!confirm('⚠️ 직원 시트의 모든 데이터를 완전 삭제합니다.\n\n이 작업은 되돌릴 수 없습니다.\n계속하시겠습니까?')) return;
      this.disabled = true; this.textContent = '초기화 중...';
      if (statusEl) statusEl.textContent = '';
      try {
        await SheetsModule.clearEmployees();
        W.employees = [];
        W.empCacheAt = 0;
        if (statusEl) statusEl.textContent = '✅ 직원 데이터가 모두 삭제되었습니다. CSV를 다시 업로드하세요.';
        toast('✅ 직원 시트 초기화 완료', 'success');
        loadHrList();
      } catch(e) {
        if (statusEl) statusEl.textContent = '❌ 실패: ' + e.message;
        toast('초기화 실패: ' + e.message, 'error');
      }
      this.disabled = false; this.textContent = '🗑️ 직원 전체 초기화';
    });

    // DB 초기화 버튼
    var initBtn = $w('hr-init-sheets-btn');
    if (initBtn) initBtn.addEventListener('click', async function () {
      this.disabled = true; this.textContent = '초기화 중...';
      var statusEl = $w('hr-init-status');
      try {
        await SheetsModule.initSheets();
        if (statusEl) statusEl.textContent = '✅ 시트 초기화 완료! (직원·업무·업무수신·알림로그)';
        toast('✅ Google Sheets 초기화 완료!', 'success');
        await loadHrList();
      } catch (e) {
        if (statusEl) statusEl.textContent = '❌ 실패: ' + e.message;
        toast('초기화 실패: ' + e.message, 'error');
      } finally {
        this.disabled = false; this.textContent = '🗄️ 시트 초기화 실행';
      }
    });

    // 모달 닫기
    document.querySelectorAll('#work-detail-modal [data-close-modal]').forEach(function (el) {
      el.addEventListener('click', function () { closeModal('work-detail-modal'); });
    });

    // 부서 셀렉트 채우기
    populateDeptSelects();

    // 푸시 알림 권한 요청
    requestNotificationPermission();

    // 대관예약 모달: '+예약하기' 버튼 열기 이벤트
    var facModal = document.getElementById('fac-resv-modal');
    if (facModal) facModal.addEventListener('open-new', function() {
      if (typeof FacilityModule !== 'undefined') {
        // facility.js에서 직접 모달 열기
        facModal.dispatchEvent(new CustomEvent('open-new-internal'));
      }
    });
    var vehModal = document.getElementById('veh-resv-modal');
    if (vehModal) vehModal.addEventListener('open-new', function() {
      if (typeof VehicleModule !== 'undefined') {
        vehModal.dispatchEvent(new CustomEvent('open-new-internal'));
      }
    });
  }

  /* 공개 API */
  return {
    initWorkModule: initWorkModule,
    onLogin:        onLogin,
    loadHrList:     loadHrList,
    // quicktask.js 등록 후 호출 — 현재 탭에 따라 목록 새로고침
    refreshInbox: function () {
      if (W.wtab === 'my') loadMyTasks();
    },
  };

})();

// app.js의 toast를 work.js에서 사용할 수 있도록 브릿지
// (app.js의 toast 함수가 전역이 아닐 경우 대비)
window.aseaToast = window.aseaToast || function (msg, type) {
  console.log('[ASEA Toast]', type, msg);
};
