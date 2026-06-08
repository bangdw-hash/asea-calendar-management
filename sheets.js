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
    '업무':     ['id','title','content','type','fromId','fromName','toIds','toNames','shareScope','dueDate','createdAt','calEventId'],
    '업무수신': ['taskId','userId','userName','status','receivedAt','completedAt','comment','calEventId'],
    '알림로그': ['id','userId','taskId','type','message','isRead','createdAt'],
  };

  function getToken() { return Auth.getToken(); }

  function authHeader() { return { 'Authorization': 'Bearer ' + getToken() }; }

  /* ──────────────────────────────────────────────────
     기본 API 헬퍼
  ────────────────────────────────────────────────── */
  async function apiGet(range) {
    var res = await fetch(
      BASE + '/values/' + encodeURIComponent(range) + '?valueRenderOption=UNFORMATTED_VALUE',
      { headers: authHeader() }
    );
    if (!res.ok) throw new Error('Sheets GET 실패: ' + res.status);
    return res.json();
  }

  async function apiAppend(sheetName, rows) {
    var res = await fetch(
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
    var res = await fetch(
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
    var res = await fetch(BASE + ':batchUpdate', {
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
    // 현재 시트 목록 조회
    var res = await fetch(BASE + '?fields=sheets.properties.title', { headers: authHeader() });
    if (!res.ok) throw new Error('스프레드시트 조회 실패');
    var meta = await res.json();
    var existing = (meta.sheets || []).map(function (s) { return s.properties.title; });

    var addRequests = [];
    var sheetNames = Object.keys(SCHEMAS);

    sheetNames.forEach(function (name, idx) {
      if (!existing.includes(name)) {
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
        await apiUpdate(name + '!A1', [SCHEMAS[name]]);
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

  async function deleteEmployee(rowNum) {
    // 상태를 inactive로 변경 (물리 삭제 안 함)
    await apiUpdate('직원!I' + rowNum, [['inactive']]);
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
  async function getTasks() {
    return readSheet('업무');
  }

  async function createTask(task) {
    var list = await getTasks();
    var id = 'TASK' + String(list.length + 1).padStart(5, '0') + '_' + Date.now().toString(36).slice(-4);
    var row = [
      id,
      task.title || '',
      task.content || '',
      task.type || '지시',
      task.fromId || '',
      task.fromName || '',
      (task.toIds || []).join(','),
      (task.toNames || []).join(','),
      task.shareScope || '수신자만',
      task.dueDate || '',
      new Date().toISOString(),
      '', // calEventId (나중에 업데이트)
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

  /* 공개 API */
  return {
    initSheets:            initSheets,
    getEmployees:          getEmployees,
    getEmployeeByEmail:    getEmployeeByEmail,
    addEmployee:           addEmployee,
    updateEmployee:        updateEmployee,
    deleteEmployee:        deleteEmployee,
    bulkAddEmployees:      bulkAddEmployees,
    getTasks:              getTasks,
    createTask:            createTask,
    updateTaskCalEvent:    updateTaskCalEvent,
    getReceived:           getReceived,
    getMyTasks:            getMyTasks,
    createReceived:        createReceived,
    updateReceivedStatus:  updateReceivedStatus,
    getReceivedRow:        getReceivedRow,
    getUnreadNotifications: getUnreadNotifications,
    addNotification:       addNotification,
    markNotificationsRead: markNotificationsRead,
    pollNewTasks:          pollNewTasks,
  };

})();
