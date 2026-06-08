/**
 * gas_checkin_proxy.gs
 * Google Apps Script — QR 입출입 체크인 프록시
 *
 * ═══════════════════════════════════════════════════════
 * 배포 방법 (1회 설정):
 *  1. script.google.com → 새 프로젝트 생성
 *  2. 이 코드 붙여넣기 (SPREADSHEET_ID 수정)
 *  3. 배포 → 새 배포 → 웹 앱
 *     - 실행: 나(bangdw@gmail.com)
 *     - 액세스: 모든 사용자
 *  4. 배포 URL 복사
 *  5. ASEA 앱 → 설정 탭 → 체크인 서버 URL 붙여넣기
 *
 * ※ 코드 수정 후에는 반드시 "새 버전으로 재배포" 해야 반영됩니다.
 * ═══════════════════════════════════════════════════════
 *
 * 입출입사용자 컬럼 (A~I):
 *   A: id  B: name  C: phone  D: affiliation
 *   E: consentTimestamp  F: consentVersion
 *   G: lastVisit  H: visitCount  I: deviceId
 *
 * 입출입기록 컬럼 (A~L):
 *   A: id  B: roomId  C: roomName  D: userName  E: phone
 *   F: affiliation  G: checkType  H: timestamp
 *   I: isConsented  J: consentTimestamp  K: consentVersion  L: deviceId
 */

var SPREADSHEET_ID = '1flrGzAuzs-HvSEYbswj3KTMKWmFf4YVy_wwKXSLfH6E';

// 입출입사용자 컬럼 인덱스 (0-based)
var USR_COL = { id:0, name:1, phone:2, affil:3, consentTs:4, consentVer:5, lastVisit:6, visitCount:7, deviceId:8 };
// 입출입기록 컬럼 인덱스 (0-based)
var LOG_COL = { id:0, roomId:1, roomName:2, userName:3, phone:4, affil:5, checkType:6, timestamp:7, isConsented:8, consentTs:9, consentVer:10, deviceId:11 };

function doPost(e) {
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
  };

  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var result = { ok: true };

    if (action === 'addLog') {
      _addCheckinLog(body);
    } else if (action === 'addUser') {
      _upsertCheckinUser(body);
    } else if (action === 'updateUser') {
      // 사용자 정보 수정: 입출입사용자 + 기존 입출입기록 일괄 업데이트
      var updated = _updateCheckinUser(body);
      result.updatedLogs = updated;
    } else if (action === 'getRoom') {
      // 공간 정보 조회 (API 키 없이 공간명·위치 가져오기)
      result.room = _getRoom(body.roomId || '');
    } else {
      throw new Error('Unknown action: ' + action);
    }

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
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'asea-checkin-proxy' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── 공간 정보 조회 ── */
function _getRoom(roomId) {
  if (!roomId) return null;
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('공간관리');
  if (!sheet) return null;
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return null;
  var h = rows[0];
  var idIdx       = h.indexOf('id');
  var nameIdx     = h.indexOf('name');
  var locationIdx = h.indexOf('location');
  var statusIdx   = h.indexOf('status');
  if (idIdx < 0 || nameIdx < 0) return null;
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][idIdx] === roomId &&
        (statusIdx < 0 || rows[i][statusIdx] !== 'inactive')) {
      return {
        id:       roomId,
        name:     rows[i][nameIdx]     || '',
        location: locationIdx >= 0 ? (rows[i][locationIdx] || '') : '',
      };
    }
  }
  return null;
}

/* ── 입출입 기록 추가 ── */
function _addCheckinLog(data) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('입출입기록');
  if (!sheet) throw new Error('입출입기록 시트가 없습니다.');

  var lastRow = sheet.getLastRow();
  var id = 'CHK' + String(lastRow).padStart(6, '0');

  sheet.appendRow([
    id,                                          // A: id
    data.roomId        || '',                    // B: roomId
    data.roomName      || '',                    // C: roomName
    data.userName      || '',                    // D: userName
    data.phone         || '',                    // E: phone
    data.affiliation   || '',                    // F: affiliation
    data.checkType     || '입실',                // G: checkType
    data.timestamp     || new Date().toISOString(), // H: timestamp
    'TRUE',                                      // I: isConsented
    data.consentTimestamp   || new Date().toISOString(), // J: consentTimestamp
    data.consentTextVersion || 'v1',             // K: consentVersion
    data.deviceId      || '',                    // L: deviceId
  ]);
}

/* ── 사용자 등록/방문 갱신 (upsert) ── */
function _upsertCheckinUser(data) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('입출입사용자');
  if (!sheet) throw new Error('입출입사용자 시트가 없습니다.');

  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][USR_COL.deviceId] === data.deviceId) {
      // 이미 등록된 기기 — lastVisit·visitCount만 갱신
      sheet.getRange(i + 1, USR_COL.lastVisit + 1).setValue(new Date().toISOString());
      sheet.getRange(i + 1, USR_COL.visitCount + 1).setValue(Number(rows[i][USR_COL.visitCount] || 0) + 1);
      return;
    }
  }

  // 신규 등록
  var id = 'USR_' + new Date().getTime().toString(36).toUpperCase();
  sheet.appendRow([
    id,                                              // A: id
    data.name        || '',                          // B: name
    data.phone       || '',                          // C: phone
    data.affiliation || '',                          // D: affiliation
    data.consentTimestamp   || new Date().toISOString(), // E: consentTimestamp
    data.consentTextVersion || 'v1',                 // F: consentVersion
    new Date().toISOString(),                        // G: lastVisit
    '1',                                             // H: visitCount
    data.deviceId    || '',                          // I: deviceId ← 버그 수정
  ]);
}

/* ── 사용자 정보 수정 (이름·전화·소속) + 기존 기록 일괄 수정 ── */
function _updateCheckinUser(data) {
  var deviceId = data.deviceId || '';
  if (!deviceId) throw new Error('deviceId가 없습니다.');

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // 1) 입출입사용자 시트에서 해당 deviceId 행 업데이트
  var userSheet = ss.getSheetByName('입출입사용자');
  if (!userSheet) throw new Error('입출입사용자 시트가 없습니다.');

  var userRows = userSheet.getDataRange().getValues();
  var userFound = false;
  for (var i = 1; i < userRows.length; i++) {
    if (userRows[i][USR_COL.deviceId] === deviceId) {
      userSheet.getRange(i + 1, USR_COL.name  + 1).setValue(data.name        || userRows[i][USR_COL.name]);
      userSheet.getRange(i + 1, USR_COL.phone + 1).setValue(data.phone       || userRows[i][USR_COL.phone]);
      userSheet.getRange(i + 1, USR_COL.affil + 1).setValue(data.affiliation || userRows[i][USR_COL.affil]);
      userFound = true;
      break;
    }
  }

  // deviceId로 찾지 못하면 신규 등록
  if (!userFound) {
    _upsertCheckinUser(data);
  }

  // 2) 입출입기록 시트에서 동일 deviceId 행들의 userName·phone·affiliation 일괄 수정
  var logSheet = ss.getSheetByName('입출입기록');
  if (!logSheet) return 0;

  var logRows  = logSheet.getDataRange().getValues();
  var updatedCount = 0;
  for (var j = 1; j < logRows.length; j++) {
    if (logRows[j][LOG_COL.deviceId] === deviceId) {
      if (data.name)        logSheet.getRange(j + 1, LOG_COL.userName + 1).setValue(data.name);
      if (data.phone)       logSheet.getRange(j + 1, LOG_COL.phone    + 1).setValue(data.phone);
      if (data.affiliation) logSheet.getRange(j + 1, LOG_COL.affil    + 1).setValue(data.affiliation);
      updatedCount++;
    }
  }

  return updatedCount;
}
