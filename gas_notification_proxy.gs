/**
 * gas_notification_proxy.gs
 * Google Apps Script — 대관신청 워크플로우 프록시
 * (공개 신청 접수 + 관리자 알림 + 승인/반려 이메일)
 *
 * ═══════════════════════════════════════════════════════════════
 * 배포 방법 (1회 설정):
 *  1. script.google.com → 새 프로젝트 생성
 *  2. 이 코드 전체 붙여넣기
 *  3. [프로젝트 설정] → [스크립트 속성] → 아래 항목 추가:
 *       SPREADSHEET_ID     = 스프레드시트 ID
 *       TELEGRAM_BOT_TOKEN = 텔레그램 봇 토큰 (없으면 생략)
 *       TELEGRAM_CHAT_ID   = 관리자 텔레그램 Chat ID (없으면 생략)
 *       NTFY_TOPIC         = ntfy.sh 토픽명 (없으면 생략)
 *       ADMIN_EMAIL        = 관리자 이메일 (알림 수신)
 *  4. 배포 → 새 배포 → 웹 앱
 *     - 실행: 나(본인 계정)
 *     - 액세스: 모든 사용자
 *  5. 배포 URL 복사
 *  6. ASEA 앱 → 대관업무 탭 → 프록시 URL 설정
 *     facility-request.html 공유 시 URL 파라미터로 추가:
 *     facility-request.html?proxy=<배포URL>
 *
 * 지원 액션:
 *   ping                   — 연결 확인
 *   getFacilityBuildings   — 건물/호실 목록 (공개, 인증 불필요)
 *   submitFacilityRequest  — 대관신청 접수 (공개)
 *   getFacilityRequests    — 신청 목록 조회 (관리자)
 *   approveFacilityRequest — 신청 승인 (관리자)
 *   rejectFacilityRequest  — 신청 반려 (관리자)
 * ═══════════════════════════════════════════════════════════════
 */

var FAC_SHEET   = '대관신청';
var FAC_HEADERS = ['id','buildingId','buildingName','roomId','roomName','title',
                   'applicantName','applicantOrg','applicantPhone','applicantEmail',
                   'startAt','endAt','purpose','attendees',
                   'status','reviewNote','reviewedBy','reviewedAt','createdAt'];

// ─────────────────────────────────────────────────────────────
function doPost(e) {
  var cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8'
  };
  try {
    var body   = JSON.parse(e.postData.contents);
    var action = body.action || '';
    var result;

    if      (action === 'ping')                   result = { ok: true, message: '대관신청 프록시 정상' };
    else if (action === 'getFacilityBuildings')   result = { ok: true, list: _getBuildings() };
    else if (action === 'submitFacilityRequest')  result = _submitRequest(body);
    else if (action === 'getFacilityRequests')    result = { ok: true, list: _getRequests(body.status || '') };
    else if (action === 'approveFacilityRequest')       result = _reviewRequest(body, '승인');
    else if (action === 'rejectFacilityRequest')        result = _reviewRequest(body, '반려');
    else if (action === 'updateFacilityRequestStatus')  result = _updateRequestStatus(body);
    else if (action === 'getRequestStatus')             result = _getRequestStatusPublic(body);
    else throw new Error('Unknown action: ' + action);

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  var action = (e.parameter && e.parameter.action) || '';
  var result;
  if (action === 'ping')                 result = { ok: true, message: '프록시 정상' };
  else if (action === 'getFacilityBuildings') result = { ok: true, list: _getBuildings() };
  else result = { ok: false, error: 'Use POST' };
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────
// 건물/호실 목록 (시설 시트에서 읽기)
// ─────────────────────────────────────────────────────────────
function _getBuildings() {
  var props = PropertiesService.getScriptProperties();
  var ssId  = props.getProperty('SPREADSHEET_ID');
  if (!ssId) return [];
  var ss    = SpreadsheetApp.openById(ssId);
  var sheet = ss.getSheetByName('시설');
  if (!sheet) return [];
  var data  = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).filter(function(r){ return r[5] !== 'inactive'; }).map(function(r) {
    var obj = {};
    headers.forEach(function(h, i){ obj[h] = r[i]; });
    var rooms = [];
    try { rooms = JSON.parse(obj.rooms || '[]'); } catch(e) {}
    return { id: obj.id, buildingName: obj.buildingName, color: obj.color || '#4285F4', rooms: rooms };
  });
}

// ─────────────────────────────────────────────────────────────
// 대관신청 접수
// ─────────────────────────────────────────────────────────────
function _submitRequest(body) {
  var props = PropertiesService.getScriptProperties();
  var ssId  = props.getProperty('SPREADSHEET_ID');
  if (!ssId) throw new Error('SPREADSHEET_ID 미설정');

  var ss    = SpreadsheetApp.openById(ssId);
  var sheet = _getOrCreateSheet(ss, FAC_SHEET, FAC_HEADERS);

  var existing = sheet.getDataRange().getValues();
  var id = FAC_SHEET + (existing.length).toString().padStart(5, '0');
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss");

  var row = FAC_HEADERS.map(function(h) {
    if (h === 'id')        return id;
    if (h === 'status')    return '신청';
    if (h === 'createdAt') return now;
    if (h === 'reviewNote' || h === 'reviewedBy' || h === 'reviewedAt') return '';
    return body[h] !== undefined ? body[h] : '';
  });
  sheet.appendRow(row);

  // 관리자 알림
  var req = {};
  FAC_HEADERS.forEach(function(h, i){ req[h] = row[i]; });
  _notifyAdmin(req);

  return { ok: true, id: id };
}

// ─────────────────────────────────────────────────────────────
// 신청 목록 조회
// ─────────────────────────────────────────────────────────────
function _getRequests(status) {
  var props = PropertiesService.getScriptProperties();
  var ssId  = props.getProperty('SPREADSHEET_ID');
  if (!ssId) return [];
  var ss    = SpreadsheetApp.openById(ssId);
  var sheet = ss.getSheetByName(FAC_SHEET);
  if (!sheet) return [];
  var data  = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  return data.slice(1).filter(function(r) {
    if (!status) return true;
    return r[14] === status; // status is column O (index 14)
  }).map(function(r, i) {
    var obj = { _row: i + 2 };
    FAC_HEADERS.forEach(function(h, j){ obj[h] = r[j]; });
    return obj;
  });
}

// ─────────────────────────────────────────────────────────────
// 승인 / 반려
// ─────────────────────────────────────────────────────────────
function _reviewRequest(body, statusValue) {
  var props = PropertiesService.getScriptProperties();
  var ssId  = props.getProperty('SPREADSHEET_ID');
  if (!ssId) throw new Error('SPREADSHEET_ID 미설정');
  var id = body.id || '';
  if (!id) throw new Error('id 필요');

  var ss    = SpreadsheetApp.openById(ssId);
  var sheet = ss.getSheetByName(FAC_SHEET);
  if (!sheet) throw new Error('대관신청 시트 없음');

  var data = sheet.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) { rowIdx = i + 1; break; }
  }
  if (rowIdx < 0) throw new Error('신청 ID를 찾을 수 없습니다: ' + id);

  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss");
  // status=O(col15), reviewNote=P(col16), reviewedBy=Q(col17), reviewedAt=R(col18)
  sheet.getRange(rowIdx, 15, 1, 4).setValues([[statusValue, body.reviewNote || '', body.reviewedBy || '', now]]);

  // 신청자 이메일 안내
  var req = {};
  FAC_HEADERS.forEach(function(h, j){ req[h] = data[rowIdx - 1][j]; });
  req.status     = statusValue;
  req.reviewNote = body.reviewNote || '';
  req.reviewedBy = body.reviewedBy || '';
  _emailApplicant(req);

  return { ok: true, status: statusValue };
}

// ─────────────────────────────────────────────────────────────
// 관리자 알림 (Telegram + ntfy.sh + 이메일)
// ─────────────────────────────────────────────────────────────
function _notifyAdmin(req) {
  var props = PropertiesService.getScriptProperties();
  var msg = '📋 대관신청 접수\n' +
    '건물: ' + req.buildingName + ' ' + req.roomName + '\n' +
    '일정: ' + req.startAt + ' ~ ' + req.endAt + '\n' +
    '신청자: ' + req.applicantName + ' (' + req.applicantOrg + ')\n' +
    '제목: ' + req.title + '\n' +
    '연락처: ' + req.applicantPhone;

  // Telegram
  var tgToken  = props.getProperty('TELEGRAM_BOT_TOKEN');
  var tgChatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (tgToken && tgChatId) {
    try {
      UrlFetchApp.fetch('https://api.telegram.org/bot' + tgToken + '/sendMessage', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ chat_id: tgChatId, text: msg }),
        muteHttpExceptions: true
      });
    } catch(e) {}
  }

  // ntfy.sh
  var ntfyTopic = props.getProperty('NTFY_TOPIC');
  if (ntfyTopic) {
    try {
      UrlFetchApp.fetch('https://ntfy.sh/' + ntfyTopic, {
        method: 'post',
        payload: msg,
        headers: { 'Title': '대관신청 접수: ' + req.title, 'Priority': 'default', 'Tags': 'calendar' },
        muteHttpExceptions: true
      });
    } catch(e) {}
  }

  // 관리자 이메일
  var adminEmail = props.getProperty('ADMIN_EMAIL');
  if (adminEmail) {
    try {
      MailApp.sendEmail({
        to: adminEmail,
        subject: '[대관신청] ' + req.buildingName + ' ' + req.roomName + ' — ' + req.title,
        body: msg + '\n\n신청 ID: ' + req.id,
      });
    } catch(e) {}
  }
}

// ─────────────────────────────────────────────────────────────
// 신청자 이메일 (승인/반려 시)
// ─────────────────────────────────────────────────────────────
function _emailApplicant(req) {
  var email = req.applicantEmail || '';
  if (!email || email.indexOf('@') < 0) return;
  var statusKor = req.status === '승인' ? '✅ 승인' : '❌ 반려';
  var subject = '[대관신청 ' + req.status + '] ' + req.buildingName + ' ' + req.roomName;
  var body =
    req.applicantName + ' 님의 대관신청이 ' + req.status + '되었습니다.\n\n' +
    '■ 신청 내용\n' +
    '  건물/호실: ' + req.buildingName + ' ' + req.roomName + '\n' +
    '  일정: ' + req.startAt + ' ~ ' + req.endAt + '\n' +
    '  제목: ' + req.title + '\n' +
    '  목적: ' + (req.purpose || '-') + '\n' +
    '  참석인원: ' + (req.attendees || '-') + '\n\n' +
    (req.reviewNote ? '■ 검토 의견\n  ' + req.reviewNote + '\n\n' : '') +
    '담당자: ' + (req.reviewedBy || '-') + '\n' +
    '\n이 메일은 자동 발송된 메일입니다.';
  try {
    MailApp.sendEmail({ to: email, subject: subject, body: body });
  } catch(e) {}
}

// ─────────────────────────────────────────────────────────────
// 시트 없으면 생성
// ─────────────────────────────────────────────────────────────
function _getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

// ─────────────────────────────────────────────────────────────
// 신청 상태 업데이트 (관리자: 검토중 등)
// ─────────────────────────────────────────────────────────────
function _updateRequestStatus(body) {
  var props = PropertiesService.getScriptProperties();
  var ssId  = props.getProperty('SPREADSHEET_ID');
  if (!ssId) throw new Error('SPREADSHEET_ID 미설정');
  var id = body.id || '';
  var newStatus = body.status || '';
  if (!id || !newStatus) throw new Error('id, status 필요');

  var ss    = SpreadsheetApp.openById(ssId);
  var sheet = ss.getSheetByName(FAC_SHEET);
  if (!sheet) throw new Error('대관신청 시트 없음');

  var data = sheet.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) { rowIdx = i + 1; break; }
  }
  if (rowIdx < 0) throw new Error('신청 ID를 찾을 수 없습니다: ' + id);

  // status column is index 14 (col 15)
  sheet.getRange(rowIdx, 15).setValue(newStatus);
  return { ok: true, status: newStatus };
}

// ─────────────────────────────────────────────────────────────
// 신청 상태 공개 조회 (신청자 본인 확인)
// ─────────────────────────────────────────────────────────────
function _getRequestStatusPublic(body) {
  var id    = (body.id    || '').trim();
  var email = (body.email || '').trim().toLowerCase();
  var phone = (body.phone || '').trim();
  if (!id && !email) throw new Error('id 또는 email이 필요합니다');

  var props = PropertiesService.getScriptProperties();
  var ssId  = props.getProperty('SPREADSHEET_ID');
  if (!ssId) return { ok: false, error: 'SPREADSHEET_ID 미설정' };
  var ss    = SpreadsheetApp.openById(ssId);
  var sheet = ss.getSheetByName(FAC_SHEET);
  if (!sheet) return { ok: false, error: '대관신청 시트 없음' };

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true, requests: [] };

  var results = data.slice(1).filter(function(r) {
    if (id) return r[0] === id;
    var rowEmail = (r[9] || '').toLowerCase();
    var rowPhone = (r[8] || '').replace(/[^0-9]/g,'');
    var matchEmail = rowEmail === email;
    var matchPhone = phone ? rowPhone === phone.replace(/[^0-9]/g,'') : true;
    return matchEmail && matchPhone;
  }).map(function(r) {
    var obj = {};
    FAC_HEADERS.forEach(function(h, i){ obj[h] = r[i]; });
    return {
      id: obj.id,
      buildingName: obj.buildingName,
      roomName: obj.roomName,
      title: obj.title,
      startAt: obj.startAt,
      endAt: obj.endAt,
      status: obj.status,
      reviewNote: obj.reviewNote,
      createdAt: obj.createdAt
    };
  });
  return { ok: true, requests: results };
}
