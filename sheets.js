'use strict';

/**
 * sheets.js — Google Sheets API v4 연동 모듈
 * ASEA_HR_DB 스프레드시트를 DB로 사용
 *
 * 시트 구성:
 *   직원       — 직원 디렉토리
 *   업무       — 업무 발송 내역
 *   업무수신   — 수신자별 상태
 *   알림로그   — 알림 내역
 */

var SheetsModule = (function () {

  var SPREADSHEET_ID = CONFIG.sheetsDbId;
  var BASE = 'https://sheets.googleapis.com/v4/spreadsheets/' + SPREADSHEET_ID;

  // 시트별 헤더 정의
  var SCHEMAS = {
    '직원':     ['id','name','department','rank','googleEmail','hireDate','phone','role','status','createdAt'],
    '업무':     ['id','title','content','category','type','fromId','fromName','toIds','toNames','shareScope','dueDate','createdAt','calEventId','status'],
    '업무수신': ['taskId','userId','userName','status','receivedAt','completedAt','comment','calEventId'],
    '알림로그': ['id','userId','taskId','type','message','isRead','createdAt'],
    '시설':     ['id','buildingName','buildingCode','rooms','color','status','createdAt'],
    '대관예약': ['id','buildingId','buildingName','roomId','roomName','title','fromId','fromName','department','startAt','endAt','purpose','attendees','status','calEventId','createdAt'],
    '차량':     ['id','vehicleName','vehicleNum','vehicleType','capacity','status','note','createdAt'],
    '차량예약': ['id','vehicleId','vehicleName','fromId','fromName','department','startAt','endAt','destination','purpose','passengers','status','calEventId','createdAt'],
    '강의실예약':['id','buildingId','buildingName','roomId','roomName','title','fromId','fromName','department','startDate','endDate','startPeriod','endPeriod','weekdays','reservationType','semester','status','calEventId','createdAt'],
    '기관':     ['id','institutionName','shortName','domain','adminEmail','primaryColor','timezone','plan','status','createdAt'],
    '작업지시': ['id','title','content','requesterId','requesterName','assigneeId','assigneeName','department','priority','status','dueDate','completedAt','calEventId','note','createdAt'],
    '관리실인원':['id','name','googleEmail','phone','shift','role','status','createdAt'],
    '공간관리':  ['id','name','location','description','qrCode','status','createdAt','lat','lng','geoRadius'],
    '입출입기록':['id','roomId','roomName','userName','phone','affiliation','checkType','timestamp','consentGiven','consentTimestamp','consentTextVersion','deviceId'],
    '입출입사용자':['id','name','phone','affiliation','firstConsentAt','consentTextVersion','lastVisit','visitCount'],
    '문자발송내역':['id','sentAt','sender','message','msgType','receiverCount','receivers','resultCode','successCnt','errorCnt','sentBy'],
    '대관신청':    ['id','buildingId','buildingName','roomId','roomName','title','applicantName','applicantOrg','applicantPhone','applicantEmail','startAt','endAt','purpose','attendees','status','reviewNote','reviewedBy','reviewedAt','createdAt'],
  };

  function getToken() { return Auth.getToken(); }

  function authHeader() { return { 'Authorization': 'Bearer ' + getToken() }; }

  /**
   * _sfetch — 401(토큰 만료/무효) 발생 시 무음 재인증 후 1회 재시도하는 공통 래퍼.
   * 기존에는 calendar.js만 재인증을 했고 sheets.js(전 모듈의 DB 계층)는 누락되어,
   * 앱을 ~1시간 이상 켜두면 토큰 만료로 모든 저장/조회가 401로 먹통이 되던 문제를 해결.
   */
  async function _sfetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers);
    if (!opts.headers.Authorization) opts.headers.Authorization = 'Bearer ' + getToken();
    var res = await fetch(url, opts);
    if (res.status === 401 && window.Auth && Auth.reauth) {
      var fresh = await Auth.reauth();
      if (fresh) {
        opts.headers.Authorization = 'Bearer ' + fresh;
        res = await fetch(url, opts);
      }
    }
    return res;
  }

  /* ──────────────────────────────────────────────────
     기본 API 헬퍼
  ────────────────────────────────────────────────── */
  var _403shown = false;
  function _handle403(status) {
    if (status !== 403) return;
    if (_403shown) return;
    _403shown = true;
    setTimeout(function () { _403shown = false; }, 10000);

    // 현재 로그인 이메일 파악
    var emailEl = document.getElementById('user-email');
    var email   = emailEl ? emailEl.textContent.trim() : '';

    // 스프레드시트 직접 링크
    var sheetUrl = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID;

    // 앱 UI에 안내 배너 표시 (토스트 대신)
    var existing = document.getElementById('sheets-403-banner');
    if (existing) return;

    var banner = document.createElement('div');
    banner.id = 'sheets-403-banner';
    banner.style.cssText =
      'position:fixed;bottom:0;left:0;right:0;z-index:9999;' +
      'background:#B71C1C;color:#fff;padding:14px 20px;font-size:13px;' +
      'display:flex;align-items:center;gap:12px;flex-wrap:wrap;';
    banner.innerHTML =
      '<span style="flex:1">⚠️ <strong>스프레드시트 접근 오류(403)</strong> — ' +
      (email ? '"' + email + '" 계정으로 ' : '') +
      '<a href="' + sheetUrl + '" target="_blank" style="color:#FFCDD2;text-decoration:underline">이 스프레드시트</a>에 ' +
      '편집 권한이 없습니다. 로그아웃 후 스프레드시트 소유자 계정으로 다시 로그인하거나, ' +
      '설정 탭 → HR관리 → <strong>DB 초기화</strong>를 먼저 실행해주세요.</span>' +
      '<button id="sheets-403-logout-btn" style="background:#fff;color:#B71C1C;border:none;' +
      'border-radius:6px;padding:6px 14px;font-weight:700;cursor:pointer;white-space:nowrap">🔄 재로그인</button>' +
      '<button id="sheets-403-close-btn" style="background:none;border:none;color:#fff;' +
      'font-size:18px;cursor:pointer;padding:0 4px">×</button>';
    document.body.appendChild(banner);

    document.getElementById('sheets-403-logout-btn').addEventListener('click', function () {
      if (typeof Auth !== 'undefined') Auth.logout();
      banner.remove();
    });
    document.getElementById('sheets-403-close-btn').addEventListener('click', function () {
      banner.remove();
    });
  }

  async function apiGet(range) {
    var res = await _sfetch(
      BASE + '/values/' + encodeURIComponent(range) + '?valueRenderOption=UNFORMATTED_VALUE',
      { headers: authHeader() }
    );
    if (!res.ok) { _handle403(res.status); throw new Error('Sheets GET 실패: ' + res.status); }
    return res.json();
  }

  async function apiAppend(sheetName, rows) {
    var res = await _sfetch(
      BASE + '/values/' + encodeURIComponent(sheetName + '!A1') + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS',
      {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeader()),
        body: JSON.stringify({ values: rows }),
      }
    );
    if (!res.ok) throw new Error('Sheets APPEND 실패: ' + res.status);
    return res.json();
  }

  async function apiUpdate(range, rows) {
    var res = await _sfetch(
      BASE + '/values/' + encodeURIComponent(range) + '?valueInputOption=USER_ENTERED',
      {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeader()),
        body: JSON.stringify({ values: rows }),
      }
    );
    if (!res.ok) throw new Error('Sheets UPDATE 실패: ' + res.status);
    return res.json();
  }

  async function batchUpdate(requests) {
    var res = await _sfetch(BASE + ':batchUpdate', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeader()),
      body: JSON.stringify({ requests: requests }),
    });
    if (!res.ok) throw new Error('Sheets batchUpdate 실패: ' + res.status);
    return res.json();
  }

  /* ──────────────────────────────────────────────────
     시트 초기화 (최초 1회)
  ────────────────────────────────────────────────── */
  async function initSheets() {
    // 현재 시트 목록 조회 (fields 파라미터 없이 전체 메타 조회)
    var res = await _sfetch(BASE, { headers: authHeader() });
    if (!res.ok) {
      var errBody = '';
      try { errBody = await res.text(); } catch (e) {}
      throw new Error('스프레드시트 조회 실패 (' + res.status + ')' + (errBody ? ': ' + errBody.slice(0, 200) : ''));
    }
    var meta = await res.json();
    var existing = (meta.sheets || []).map(function (s) { return s.properties.title; });

    var addRequests = [];
    var sheetNames = Object.keys(SCHEMAS);

    sheetNames.forEach(function (name, idx) {
      if (existing.indexOf(name) === -1) {
        addRequests.push({ addSheet: { properties: { title: name, index: idx } } });
      }
    });

    if (addRequests.length > 0) {
      await batchUpdate(addRequests);
    }

    // 헤더 행이 없는 시트에 헤더 추가
    for (var i = 0; i < sheetNames.length; i++) {
      var name = sheetNames[i];
      try {
        var data = await apiGet(name + '!A1:Z1');
        if (!data.values || !data.values[0] || data.values[0].length === 0) {
          await apiUpdate(name + '!A1', [SCHEMAS[name]]);
        }
      } catch (e) {
        try { await apiUpdate(name + '!A1', [SCHEMAS[name]]); } catch (e2) {}
      }
    }
  }

  /* ──────────────────────────────────────────────────
     범용 데이터 읽기 (헤더→객체 변환)
  ────────────────────────────────────────────────── */
  async function readSheet(sheetName) {
    var data = await apiGet(sheetName + '!A:Z');
    if (!data.values || data.values.length < 2) return [];
    var headers = data.values[0];
    return data.values.slice(1).map(function (row, rowIdx) {
      var obj = { _row: rowIdx + 2 }; // 1-indexed, +1 for header
      headers.forEach(function (h, i) { obj[h] = row[i] !== undefined ? row[i] : ''; });
      return obj;
    }).filter(function (obj) { return obj.id || obj.taskId; }); // 빈 행 제거
  }

  /* ──────────────────────────────────────────────────
     직원 관리
  ────────────────────────────────────────────────── */
  async function getEmployees() {
    return readSheet('직원');
  }

  async function getEmployeeByEmail(email) {
    var list = await getEmployees();
    return list.find(function (e) {
      return e.googleEmail && e.googleEmail.toLowerCase() === email.toLowerCase();
    }) || null;
  }

  async function addEmployee(emp) {
    // id 자동 생성
    var list = await getEmployees();
    var num = list.length + 1;
    var id = 'EMP' + String(num).padStart(4, '0');
    var row = [
      id,
      emp.name || '',
      emp.department || '',
      emp.rank || '',
      emp.googleEmail || '',
      emp.hireDate || '',
      emp.phone || '',
      emp.role || 'staff',
      emp.status || 'active',
      new Date().toISOString(),
    ];
    await apiAppend('직원', [row]);
    return id;
  }

  async function updateEmployee(rowNum, emp) {
    var headers = SCHEMAS['직원'];
    var row = headers.map(function (h) { return emp[h] !== undefined ? emp[h] : ''; });
    await apiUpdate('직원!A' + rowNum + ':J' + rowNum, [row]);
  }

  // ── sheetId 캐시 (시트명 → 숫자 ID) ──────────────
  var _sheetIdCache = {};
  async function getSheetId(sheetName) {
    if (_sheetIdCache[sheetName] !== undefined) return _sheetIdCache[sheetName];
    var res = await _sfetch(BASE + '?fields=sheets.properties', { headers: authHeader() });
    if (!res.ok) throw new Error('메타 조회 실패: ' + res.status);
    var meta = await res.json();
    (meta.sheets || []).forEach(function (s) {
      _sheetIdCache[s.properties.title] = s.properties.sheetId;
    });
    if (_sheetIdCache[sheetName] === undefined) throw new Error('시트를 찾을 수 없습니다: ' + sheetName);
    return _sheetIdCache[sheetName];
  }

  // 단일 행 물리 삭제 (_row: 1-indexed, 헤더 포함)
  async function deleteEmployee(rowNum) {
    var sheetId = await getSheetId('직원');
    await batchUpdate([{
      deleteDimension: {
        range: {
          sheetId: sheetId,
          dimension: 'ROWS',
          startIndex: rowNum - 1,  // 0-indexed
          endIndex:   rowNum,
        }
      }
    }]);
  }

  // 여러 행 일괄 물리 삭제 (rowNums: 1-indexed 배열, 내부에서 내림차순 정렬)
  async function bulkDeleteEmployees(rowNums) {
    if (!rowNums || !rowNums.length) return;
    var sheetId = await getSheetId('직원');
    // 아래 행부터 삭제해야 위 행 번호가 안 밀림
    var sorted = rowNums.slice().sort(function (a, b) { return b - a; });
    var requests = sorted.map(function (rowNum) {
      return {
        deleteDimension: {
          range: {
            sheetId: sheetId,
            dimension: 'ROWS',
            startIndex: rowNum - 1,
            endIndex:   rowNum,
          }
        }
      };
    });
    await batchUpdate(requests);
  }

  // 직원 시트 전체 데이터 초기화 (헤더 1행 유지, 2행~끝 clear)
  async function clearEmployees() {
    var res = await _sfetch(
      BASE + '/values/' + encodeURIComponent('직원!A2:Z') + ':clear',
      {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeader()),
        body: JSON.stringify({}),
      }
    );
    if (!res.ok) throw new Error('직원 초기화 실패: ' + res.status);
    return res.json();
  }

  async function bulkAddEmployees(empList) {
    var existing = await getEmployees();
    var startNum = existing.length + 1;
    var rows = empList.map(function (emp, i) {
      var id = 'EMP' + String(startNum + i).padStart(4, '0');
      return [
        id,
        emp.name || '',
        emp.department || '',
        emp.rank || '',
        emp.googleEmail || '',
        emp.hireDate || '',
        emp.phone || '',
        emp.role || 'staff',
        emp.status || 'active',
        new Date().toISOString(),
      ];
    });
    if (rows.length > 0) await apiAppend('직원', rows);
    return rows.length;
  }

  /* ──────────────────────────────────────────────────
     업무 관리
  ────────────────────────────────────────────────── */

  // 기존 '업무' 시트 헤더에 'status' 컬럼이 없으면 자동 추가 (1회 마이그레이션)
  var _taskSchemaChecked = false;
  async function _ensureTaskStatusColumn() {
    if (_taskSchemaChecked) return;
    _taskSchemaChecked = true;
    try {
      var data = await apiGet('업무!A1:Z1');
      var headers = (data.values && data.values[0]) || [];
      if (headers.indexOf('status') === -1) {
        // 기존 헤더 다음 빈 열에 'status' 추가
        var nextCol = headers.length + 1; // 1-based
        var letter  = nextCol <= 26
          ? String.fromCharCode(64 + nextCol)
          : 'A' + String.fromCharCode(64 + nextCol - 26);
        await apiUpdate('업무!' + letter + '1', [['status']]);
      }
    } catch (e) { /* 실패 시 무시 — 기존 기능 유지 */ }
  }

  async function getTasks() {
    await _ensureTaskStatusColumn();
    return readSheet('업무');
  }

  async function createTask(task) {
    var list = await getTasks();
    var id = 'TASK' + String(list.length + 1).padStart(5, '0') + '_' + Date.now().toString(36).slice(-4);
    var row = [
      id,
      task.title || '',
      task.content || '',
      task.category || '일반업무',
      task.type || '지시',
      task.fromId || '',
      task.fromName || '',
      (task.toIds || []).join(','),
      (task.toNames || []).join(','),
      task.shareScope || '수신자만',
      task.dueDate || '',
      new Date().toISOString(),
      '', // calEventId (나중에 업데이트)
      task.status || '예정', // 예정 | 완료
    ];
    await apiAppend('업무', [row]);
    return id;
  }

  async function updateTaskCalEvent(taskId, calEventId) {
    var list = await getTasks();
    var task = list.find(function (t) { return t.id === taskId; });
    if (!task) return;
    await apiUpdate('업무!L' + task._row, [[calEventId]]);
  }

  // 업무 상태 변경 (예정 ↔ 완료)
  async function updateTaskStatus(taskId, status) {
    var list = await getTasks();
    var task = list.find(function (t) { return t.id === taskId; });
    if (!task) throw new Error('업무를 찾을 수 없습니다: ' + taskId);
    // status 컬럼 인덱스 = headers에서 'status' 위치
    var data = await apiGet('업무!A1:Z1');
    var headers = (data.values && data.values[0]) || [];
    var colIdx  = headers.indexOf('status'); // 0-based
    if (colIdx === -1) throw new Error('status 컬럼이 없습니다.');
    var letter  = colIdx + 1 <= 26
      ? String.fromCharCode(64 + colIdx + 1)
      : 'A' + String.fromCharCode(64 + colIdx + 1 - 26);
    await apiUpdate('업무!' + letter + task._row, [[status]]);
  }

  /* ──────────────────────────────────────────────────
     업무수신 관리
  ────────────────────────────────────────────────── */
  async function getReceived() {
    return readSheet('업무수신');
  }

  async function getMyTasks(userId) {
    var list = await getReceived();
    return list.filter(function (r) { return r.userId === userId; });
  }

  async function createReceived(taskId, recipients) {
    // recipients: [{userId, userName}]
    var rows = recipients.map(function (r) {
      return [taskId, r.userId, r.userName, '미접수', '', '', '', ''];
    });
    if (rows.length > 0) await apiAppend('업무수신', rows);
  }

  async function updateReceivedStatus(rowNum, status, comment, calEventId) {
    var now = new Date().toISOString();
    var completedAt = (status === '완료') ? now : '';
    await apiUpdate(
      '업무수신!D' + rowNum + ':H' + rowNum,
      [[status, now, completedAt, comment || '', calEventId || '']]
    );
  }

  async function getReceivedRow(taskId, userId) {
    var list = await getReceived();
    return list.find(function (r) { return r.taskId === taskId && r.userId === userId; }) || null;
  }

  /* ──────────────────────────────────────────────────
     알림 관리
  ────────────────────────────────────────────────── */
  async function getUnreadNotifications(userId) {
    var list = await readSheet('알림로그');
    return list.filter(function (n) { return n.userId === userId && n.isRead === '0'; });
  }

  async function addNotification(userId, taskId, type, message) {
    var id = 'NOTIF_' + Date.now().toString(36);
    await apiAppend('알림로그', [[id, userId, taskId, type, message, '0', new Date().toISOString()]]);
  }

  async function markNotificationsRead(userId) {
    var list = await readSheet('알림로그');
    var updates = list.filter(function (n) { return n.userId === userId && n.isRead === '0'; });
    for (var i = 0; i < updates.length; i++) {
      await apiUpdate('알림로그!F' + updates[i]._row, [['1']]);
    }
  }

  /* ──────────────────────────────────────────────────
     폴링: 새 알림 확인 (미접수 업무 감지)
  ────────────────────────────────────────────────── */
  var _lastPollTaskIds = null;

  async function pollNewTasks(userId, onNew) {
    try {
      var myTasks = await getMyTasks(userId);
      var unread = myTasks.filter(function (r) { return r.status === '미접수'; });
      var ids = unread.map(function (r) { return r.taskId; }).sort().join(',');

      if (_lastPollTaskIds === null) {
        // 최초 폴링: 기준점 설정만
        _lastPollTaskIds = ids;
        return;
      }

      if (ids !== _lastPollTaskIds) {
        // 새 업무 감지
        var oldIds = _lastPollTaskIds.split(',').filter(Boolean);
        var newIds = ids.split(',').filter(Boolean);
        var added = newIds.filter(function (id) { return !oldIds.includes(id); });

        if (added.length > 0 && onNew) {
          var allTasks = await getTasks();
          var newTasks = allTasks.filter(function (t) { return added.includes(t.id); });
          onNew(newTasks);
        }
        _lastPollTaskIds = ids;
      }
    } catch (e) {}
  }

  /* ──────────────────────────────────────────────────
     시설 (대관) 관리
  ────────────────────────────────────────────────── */
  async function getFacilities() {
    var data = await readSheet('시설');
    return data.filter(function(f){ return f.status !== 'inactive'; });
  }

  async function addFacility(f) {
    var list = await readSheet('시설');
    var id = 'FAC' + String(list.length + 1).padStart(3,'0');
    await apiAppend('시설', [[
      id, f.buildingName || '',
      JSON.stringify(f.rooms || []),
      f.color || '#4285F4',
      'active',
      new Date().toISOString()
    ]]);
    return id;
  }

  async function updateFacility(rowNum, f) {
    await apiUpdate('시설!A' + rowNum + ':F' + rowNum, [[
      f.id, f.buildingName,
      JSON.stringify(f.rooms || []),
      f.color || '#4285F4',
      f.status || 'active',
      f.createdAt || new Date().toISOString()
    ]]);
  }

  async function deleteFacility(rowNum) {
    await apiUpdate('시설!E' + rowNum, [['inactive']]);
  }

  async function getFacilityReservations(startDate, endDate) {
    var data = await readSheet('대관예약');
    if (!startDate && !endDate) return data;
    return data.filter(function(r) {
      var s = r.startAt || '';
      return (!startDate || s >= startDate) && (!endDate || s <= endDate);
    });
  }

  async function createFacilityReservation(res) {
    var list = await readSheet('대관예약');
    var id = 'FAR' + String(list.length + 1).padStart(5,'0') + '_' + Date.now().toString(36).slice(-4);
    await apiAppend('대관예약', [[
      id, res.buildingId||'', res.buildingName||'', res.roomId||'', res.roomName||'',
      res.title||'', res.fromId||'', res.fromName||'', res.department||'',
      res.startAt||'', res.endAt||'', res.purpose||'', res.attendees||'',
      res.status||'확정', '', new Date().toISOString()
    ]]);
    return id;
  }

  async function updateFacilityReservation(rowNum, res) {
    await apiUpdate('대관예약!A' + rowNum + ':P' + rowNum, [[
      res.id, res.buildingId, res.buildingName, res.roomId, res.roomName,
      res.title, res.fromId, res.fromName, res.department,
      res.startAt, res.endAt, res.purpose, res.attendees,
      res.status, res.calEventId || '', res.createdAt
    ]]);
  }

  async function deleteFacilityReservation(rowNum) {
    await apiUpdate('대관예약!N' + rowNum, [['취소']]);
  }

  /* ──────────────────────────────────────────────────
     차량 관리
  ────────────────────────────────────────────────── */
  async function getVehicles() {
    var data = await readSheet('차량');
    return data.filter(function(v){ return v.status !== 'inactive'; });
  }

  async function addVehicle(v) {
    var list = await readSheet('차량');
    var id = 'VEH' + String(list.length + 1).padStart(3,'0');
    await apiAppend('차량', [[
      id, v.vehicleName||'', v.vehicleNum||'', v.vehicleType||'승용',
      v.capacity||'4', v.status||'active', v.note||'',
      new Date().toISOString()
    ]]);
    return id;
  }

  async function updateVehicle(rowNum, v) {
    await apiUpdate('차량!A' + rowNum + ':H' + rowNum, [[
      v.id, v.vehicleName, v.vehicleNum, v.vehicleType,
      v.capacity, v.status, v.note||'', v.createdAt
    ]]);
  }

  async function deleteVehicle(rowNum) {
    await apiUpdate('차량!F' + rowNum, [['inactive']]);
  }

  async function getVehicleReservations(startDate, endDate) {
    var data = await readSheet('차량예약');
    if (!startDate && !endDate) return data;
    return data.filter(function(r) {
      var s = r.startAt || '';
      return (!startDate || s >= startDate) && (!endDate || s <= endDate);
    });
  }

  async function createVehicleReservation(res) {
    var list = await readSheet('차량예약');
    var id = 'VER' + String(list.length + 1).padStart(5,'0') + '_' + Date.now().toString(36).slice(-4);
    await apiAppend('차량예약', [[
      id, res.vehicleId||'', res.vehicleName||'', res.fromId||'', res.fromName||'',
      res.department||'', res.startAt||'', res.endAt||'', res.destination||'',
      res.purpose||'', res.passengers||'1', res.status||'확정', '',
      new Date().toISOString()
    ]]);
    return id;
  }

  async function updateVehicleReservation(rowNum, res) {
    await apiUpdate('차량예약!A' + rowNum + ':N' + rowNum, [[
      res.id, res.vehicleId, res.vehicleName, res.fromId, res.fromName,
      res.department, res.startAt, res.endAt, res.destination,
      res.purpose, res.passengers, res.status, res.calEventId||'', res.createdAt
    ]]);
  }

  async function deleteVehicleReservation(rowNum) {
    await apiUpdate('차량예약!L' + rowNum, [['취소']]);
  }

  /* ──────────────────────────────────────────────────
     강의실 예약 관리
  ────────────────────────────────────────────────── */
  async function getClassroomReservations(startDate, endDate) {
    var data = await readSheet('강의실예약');
    if (!startDate && !endDate) return data;
    return data.filter(function(r) {
      if (r.status === '취소') return false;
      var s = r.startDate || '';
      var e = r.endDate || s;
      return (!startDate || e >= startDate) && (!endDate || s <= endDate);
    });
  }

  async function createClassroomReservation(res) {
    var list = await readSheet('강의실예약');
    var id = 'CLR' + String(list.length + 1).padStart(5,'0') + '_' + Date.now().toString(36).slice(-4);
    await apiAppend('강의실예약', [[
      id, res.buildingId||'', res.buildingName||'', res.roomId||'', res.roomName||'',
      res.title||'', res.fromId||'', res.fromName||'', res.department||'',
      res.startDate||'', res.endDate||res.startDate||'',
      res.startPeriod||'1', res.endPeriod||'1',
      (res.weekdays||[]).join(','), res.reservationType||'기타',
      res.semester||'', res.status||'확정', '',
      new Date().toISOString()
    ]]);
    return id;
  }

  async function updateClassroomReservation(rowNum, res) {
    await apiUpdate('강의실예약!A' + rowNum + ':S' + rowNum, [[
      res.id, res.buildingId, res.buildingName, res.roomId, res.roomName,
      res.title, res.fromId, res.fromName, res.department,
      res.startDate, res.endDate, res.startPeriod, res.endPeriod,
      Array.isArray(res.weekdays) ? res.weekdays.join(',') : (res.weekdays||''),
      res.reservationType, res.semester||'', res.status, res.calEventId||'', res.createdAt
    ]]);
  }

  async function deleteClassroomReservation(rowNum) {
    await apiUpdate('강의실예약!R' + rowNum, [['취소']]);
  }

  async function bulkCreateClassroomReservations(rows) {
    var existing = await readSheet('강의실예약');
    var startNum = existing.length + 1;
    var data = rows.map(function(res, i) {
      var id = 'CLR' + String(startNum + i).padStart(5,'0');
      return [
        id, res.buildingId||'', res.buildingName||'', res.roomId||'', res.roomName||'',
        res.title||'', res.fromId||'', res.fromName||'', res.department||'',
        res.startDate||'', res.endDate||res.startDate||'',
        res.startPeriod||'1', res.endPeriod||'1',
        (res.weekdays||[]).join(','), res.reservationType||'기타',
        res.semester||'', res.status||'확정', '',
        new Date().toISOString()
      ];
    });
    if (data.length > 0) await apiAppend('강의실예약', data);
    return data.length;
  }

  /* ──────────────────────────────────────────────────
     시설 일괄 등록 (건물+호실)
  ────────────────────────────────────────────────── */
  async function bulkUpsertFacilities(rows) {
    // rows: [{buildingName, buildingCode, rooms:[{name,capacity}], color}]
    // 건물명이 같으면 호실을 merge, 없으면 신규 추가
    var existing = await readSheet('시설');
    existing.forEach(function(f) {
      if (typeof f.rooms === 'string') {
        try { f.rooms = JSON.parse(f.rooms); } catch(e) { f.rooms = []; }
      }
    });

    var toAdd = [], toUpdate = [];
    rows.forEach(function(r) {
      var found = existing.find(function(e){ return e.buildingName === r.buildingName; });
      if (found) {
        // merge rooms
        var existingRooms = found.rooms || [];
        var newRooms = r.rooms || [];
        newRooms.forEach(function(nr) {
          if (!existingRooms.find(function(er){ return er.name === nr.name; })) {
            existingRooms.push(nr);
          }
        });
        toUpdate.push({ row: found._row, data: Object.assign({}, found, { rooms: existingRooms, buildingCode: r.buildingCode||found.buildingCode||'' }) });
      } else {
        toAdd.push(r);
      }
    });

    // 업데이트
    for (var i = 0; i < toUpdate.length; i++) {
      var u = toUpdate[i];
      await apiUpdate('시설!A' + u.row + ':G' + u.row, [[
        u.data.id, u.data.buildingName, u.data.buildingCode||'',
        JSON.stringify(u.data.rooms), u.data.color||'#4285F4', u.data.status||'active', u.data.createdAt
      ]]);
    }

    // 신규 추가
    if (toAdd.length > 0) {
      var startNum = existing.length + toUpdate.length + 1;
      var addRows = toAdd.map(function(r, i) {
        return [
          'FAC' + String(startNum + i).padStart(3,'0'),
          r.buildingName, r.buildingCode||'',
          JSON.stringify(r.rooms || []),
          r.color || '#4285F4', 'active', new Date().toISOString()
        ];
      });
      await apiAppend('시설', addRows);
    }
    return toAdd.length + toUpdate.length;
  }

  /* ──────────────────────────────────────────────────
     차량 일괄 등록
  ────────────────────────────────────────────────── */
  async function bulkUpsertVehicles(rows) {
    var existing = await readSheet('차량');
    var toAdd = [], toUpdate = [];
    rows.forEach(function(r) {
      var found = existing.find(function(e){ return e.vehicleNum === r.vehicleNum && r.vehicleNum; });
      if (found) {
        toUpdate.push({ row: found._row, data: Object.assign({}, found, r) });
      } else {
        toAdd.push(r);
      }
    });
    for (var i = 0; i < toUpdate.length; i++) {
      var u = toUpdate[i];
      await apiUpdate('차량!A' + u.row + ':H' + u.row, [[
        u.data.id, u.data.vehicleName, u.data.vehicleNum, u.data.vehicleType,
        u.data.capacity, u.data.status||'active', u.data.note||'', u.data.createdAt
      ]]);
    }
    if (toAdd.length > 0) {
      var startNum2 = existing.length + toUpdate.length + 1;
      var addRows2 = toAdd.map(function(r, i) {
        return [
          'VEH' + String(startNum2 + i).padStart(3,'0'),
          r.vehicleName||'', r.vehicleNum||'', r.vehicleType||'승용',
          r.capacity||'4', 'active', r.note||'', new Date().toISOString()
        ];
      });
      await apiAppend('차량', addRows2);
    }
    return toAdd.length + toUpdate.length;
  }

  /* ──────────────────────────────────────────────────
     작업지시 (Work Order) 관리
  ────────────────────────────────────────────────── */
  async function getWorkOrders() {
    return readSheet('작업지시');
  }

  async function createWorkOrder(wo) {
    var list = await readSheet('작업지시');
    var id = 'WO' + String(list.length + 1).padStart(5, '0');
    var row = [
      id,
      wo.title || '',
      wo.content || '',
      wo.requesterId || '',
      wo.requesterName || '',
      wo.assigneeId || '',
      wo.assigneeName || '',
      wo.department || '',
      wo.priority || '보통',
      wo.status || '대기',
      wo.dueDate || '',
      '',  // completedAt
      wo.calEventId || '',
      wo.note || '',
      new Date().toISOString(),
    ];
    await apiAppend('작업지시', [row]);
    return id;
  }

  async function updateWorkOrderStatus(rowNum, status, completedAt) {
    await apiUpdate('작업지시!J' + rowNum + ':L' + rowNum, [[status, completedAt || '', '']]);
  }

  async function updateWorkOrder(rowNum, wo) {
    var headers = SCHEMAS['작업지시'];
    var row = headers.map(function (h) { return wo[h] !== undefined ? wo[h] : ''; });
    await apiUpdate('작업지시!A' + rowNum + ':O' + rowNum, [row]);
  }

  async function deleteWorkOrder(rowNum) {
    await apiUpdate('작업지시!J' + rowNum, [['취소']]);
  }

  /* ──────────────────────────────────────────────────
     관리실 인원 관리
  ────────────────────────────────────────────────── */
  async function getManagerStaff() {
    return readSheet('관리실인원');
  }

  async function addManagerStaff(staff) {
    var list = await readSheet('관리실인원');
    var id = 'MGR' + String(list.length + 1).padStart(3, '0');
    var row = [
      id,
      staff.name || '',
      staff.googleEmail || '',
      staff.phone || '',
      staff.shift || '',
      staff.role || 'staff',
      staff.status || 'active',
      new Date().toISOString(),
    ];
    await apiAppend('관리실인원', [row]);
    return id;
  }

  async function updateManagerStaff(rowNum, staff) {
    var headers = SCHEMAS['관리실인원'];
    var row = headers.map(function (h) { return staff[h] !== undefined ? staff[h] : ''; });
    await apiUpdate('관리실인원!A' + rowNum + ':H' + rowNum, [row]);
  }

  async function deleteManagerStaff(rowNum) {
    await apiUpdate('관리실인원!G' + rowNum, [['inactive']]);
  }

  /* ──────────────────────────────────────────────────
     공간관리 (QR 입출입 공간)
  ────────────────────────────────────────────────── */
  async function getSpaces() {
    var data = await readSheet('공간관리');
    return data.filter(function (s) { return s.status !== 'inactive'; });
  }

  async function addSpace(space) {
    var list = await readSheet('공간관리');
    var id = 'SPC' + String(list.length + 1).padStart(3, '0');
    var checkinUrl = (CONFIG.baseUrl || '') + 'checkin.html?room=' + encodeURIComponent(id) +
      (space.name ? '&name=' + encodeURIComponent(space.name) : '');
    var qrCode = 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(checkinUrl) + '&size=300x300';
    var row = [
      id,
      space.name        || '',
      space.location    || '',
      space.description || '',
      qrCode,
      'active',
      new Date().toISOString(),
      space.lat       || '',
      space.lng       || '',
      space.geoRadius || '',
    ];
    await apiAppend('공간관리', [row]);
    return { id: id, qrCode: qrCode, checkinUrl: checkinUrl };
  }

  async function updateSpace(rowNum, space) {
    var headers = SCHEMAS['공간관리'];
    var row = headers.map(function (h) { return space[h] !== undefined ? space[h] : ''; });
    // A~J (10 cols)
    await apiUpdate('공간관리!A' + rowNum + ':J' + rowNum, [row]);
  }

  async function deleteSpace(rowNum) {
    await apiUpdate('공간관리!F' + rowNum, [['inactive']]);
  }

  /* ──────────────────────────────────────────────────
     입출입기록
  ────────────────────────────────────────────────── */
  async function getCheckinLogs(roomId, dateFrom, dateTo) {
    var data = await readSheet('입출입기록');
    return data.filter(function (r) {
      if (roomId && r.roomId !== roomId) return false;
      if (dateFrom && (r.timestamp || '') < dateFrom) return false;
      if (dateTo && (r.timestamp || '') > dateTo + 'T99') return false;
      return true;
    });
  }

  async function deleteCheckinLog(rowNum) {
    // 해당 행을 완전 삭제 (batchUpdate deleteDimension)
    var sheetId = await getSheetId('입출입기록');
    await batchUpdate([{
      deleteDimension: {
        range: { sheetId: sheetId, dimension: 'ROWS',
                 startIndex: rowNum - 1, endIndex: rowNum }
      }
    }]);
  }

  async function addCheckinLog(log) {
    var list = await readSheet('입출입기록');
    var id = 'CHK' + String(list.length + 1).padStart(6, '0');
    var row = [
      id,
      log.roomId || '',
      log.roomName || '',
      log.userName || '',
      log.phone || '',
      log.affiliation || '',
      log.checkType || '입실',
      log.timestamp || new Date().toISOString(),
      'TRUE',
      log.consentTimestamp || new Date().toISOString(),
      log.consentTextVersion || 'v1',
      log.deviceId || '',
    ];
    await apiAppend('입출입기록', [row]);
    return id;
  }

  /* ──────────────────────────────────────────────────
     입출입사용자 (기기 등록 사용자 풀)
  ────────────────────────────────────────────────── */
  async function getCheckinUsers() {
    return readSheet('입출입사용자');
  }

  async function addCheckinUser(user) {
    var id = 'USR' + Date.now().toString(36).toUpperCase();
    var row = [
      id,
      user.name || '',
      user.phone || '',
      user.affiliation || '',
      user.firstConsentAt || new Date().toISOString(),
      user.consentTextVersion || 'v1',
      new Date().toISOString(),
      '1',
    ];
    await apiAppend('입출입사용자', [row]);
    return id;
  }

  async function updateCheckinUserVisit(rowNum, lastVisit, visitCount) {
    await apiUpdate('입출입사용자!G' + rowNum + ':H' + rowNum, [[lastVisit, String(visitCount)]]);
  }

  /* ──────────────────────────────────────────────────
     대관신청 (공개 신청 / 관리자 승인/반려)
  ────────────────────────────────────────────────── */
  async function getFacilityRequests(status) {
    var data = await readSheet('대관신청');
    if (status) return data.filter(function(r){ return r.status === status; });
    return data;
  }

  async function createFacilityRequest(req) {
    var list = await readSheet('대관신청');
    var id = 'FREQ' + String(list.length + 1).padStart(5, '0');
    var headers = SCHEMAS['대관신청'];
    var obj = Object.assign({ id: id, status: '신청', createdAt: new Date().toISOString(), reviewNote: '', reviewedBy: '', reviewedAt: '' }, req);
    var row = headers.map(function(h){ return obj[h] !== undefined ? obj[h] : ''; });
    await apiAppend('대관신청', [row]);
    return id;
  }

  async function updateFacilityRequest(rowNum, updates) {
    // updates는 부분 업데이트 객체: {status, reviewNote, reviewedBy, reviewedAt}
    // 먼저 현재 행을 읽어 병합
    var data = await readSheet('대관신청');
    var cur = data.find(function(r){ return r._row === rowNum; });
    if (!cur) throw new Error('대관신청 행을 찾을 수 없습니다: row '+rowNum);
    var merged = Object.assign({}, cur, updates);
    var headers = SCHEMAS['대관신청'];
    var row = headers.map(function(h){ return merged[h] !== undefined ? merged[h] : ''; });
    var lastCol = String.fromCharCode(64 + headers.length); // A=65, S=83 → 19 cols
    await apiUpdate('대관신청!A' + rowNum + ':' + lastCol + rowNum, [row]);
  }

  /* 공개 API */
  return {
    initSheets:            initSheets,
    getEmployees:          getEmployees,
    getEmployeeByEmail:    getEmployeeByEmail,
    addEmployee:           addEmployee,
    updateEmployee:        updateEmployee,
    deleteEmployee:        deleteEmployee,
    bulkDeleteEmployees:   bulkDeleteEmployees,
    clearEmployees:        clearEmployees,
    bulkAddEmployees:      bulkAddEmployees,
    getTasks:              getTasks,
    createTask:            createTask,
    updateTaskCalEvent:    updateTaskCalEvent,
    updateTaskStatus:      updateTaskStatus,
    getReceived:           getReceived,
    getMyTasks:            getMyTasks,
    createReceived:        createReceived,
    updateReceivedStatus:  updateReceivedStatus,
    getReceivedRow:        getReceivedRow,
    getUnreadNotifications: getUnreadNotifications,
    addNotification:       addNotification,
    markNotificationsRead: markNotificationsRead,
    pollNewTasks:          pollNewTasks,
    // 시설
    getFacilities:              getFacilities,
    addFacility:                addFacility,
    updateFacility:             updateFacility,
    deleteFacility:             deleteFacility,
    getFacilityReservations:    getFacilityReservations,
    createFacilityReservation:  createFacilityReservation,
    updateFacilityReservation:  updateFacilityReservation,
    deleteFacilityReservation:  deleteFacilityReservation,
    // 차량
    getVehicles:               getVehicles,
    addVehicle:                addVehicle,
    updateVehicle:             updateVehicle,
    deleteVehicle:             deleteVehicle,
    getVehicleReservations:    getVehicleReservations,
    createVehicleReservation:  createVehicleReservation,
    updateVehicleReservation:  updateVehicleReservation,
    deleteVehicleReservation:  deleteVehicleReservation,
    bulkUpsertVehicles:        bulkUpsertVehicles,
    // 시설 일괄
    bulkUpsertFacilities:      bulkUpsertFacilities,
    // 강의실예약
    getClassroomReservations:       getClassroomReservations,
    createClassroomReservation:     createClassroomReservation,
    updateClassroomReservation:     updateClassroomReservation,
    deleteClassroomReservation:     deleteClassroomReservation,
    bulkCreateClassroomReservations: bulkCreateClassroomReservations,
    // 작업지시
    getWorkOrders:          getWorkOrders,
    createWorkOrder:        createWorkOrder,
    updateWorkOrderStatus:  updateWorkOrderStatus,
    updateWorkOrder:        updateWorkOrder,
    deleteWorkOrder:        deleteWorkOrder,
    // 관리실 인원
    getManagerStaff:        getManagerStaff,
    addManagerStaff:        addManagerStaff,
    updateManagerStaff:     updateManagerStaff,
    deleteManagerStaff:     deleteManagerStaff,
    // 공간관리
    getSpaces:              getSpaces,
    addSpace:               addSpace,
    updateSpace:            updateSpace,
    deleteSpace:            deleteSpace,
    // 입출입기록
    getCheckinLogs:         getCheckinLogs,
    addCheckinLog:          addCheckinLog,
    deleteCheckinLog:       deleteCheckinLog,
    // 입출입사용자
    getCheckinUsers:        getCheckinUsers,
    addCheckinUser:         addCheckinUser,
    updateCheckinUserVisit: updateCheckinUserVisit,
    // 대관신청
    getFacilityRequests:    getFacilityRequests,
    createFacilityRequest:  createFacilityRequest,
    updateFacilityRequest:  updateFacilityRequest,
  };

})();
