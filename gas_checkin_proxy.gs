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
 * ═══════════════════════════════════════════════════════
 */

var SPREADSHEET_ID = '1flrGzAuzs-HvSEYbswj3KTMKWmFf4YVy_wwKXSLfH6E';

function doPost(e) {
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
  };

  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    if (action === 'addLog') {
      _addCheckinLog(body);
    } else if (action === 'addUser') {
      _addCheckinUser(body);
    } else {
      throw new Error('Unknown action: ' + action);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  // 헬스체크용
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'asea-checkin-proxy' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── 입출입 기록 추가 ── */
function _addCheckinLog(data) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('입출입기록');
  if (!sheet) throw new Error('입출입기록 시트가 없습니다.');

  var lastRow = sheet.getLastRow();
  var id = 'CHK' + String(lastRow).padStart(6, '0');

  sheet.appendRow([
    id,
    data.roomId        || '',
    data.roomName      || '',
    data.userName      || '',
    data.phone         || '',
    data.affiliation   || '',
    data.checkType     || '입실',
    data.timestamp     || new Date().toISOString(),
    'TRUE',
    data.consentTimestamp    || new Date().toISOString(),
    data.consentTextVersion  || 'v1',
    data.deviceId      || '',
  ]);
}

/* ── 사용자 등록 ── */
function _addCheckinUser(data) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('입출입사용자');
  if (!sheet) throw new Error('입출입사용자 시트가 없습니다.');

  // 중복 기기 확인
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][11] === data.deviceId) {
      // 이미 등록된 기기 — lastVisit 업데이트만
      sheet.getRange(i + 1, 7).setValue(new Date().toISOString());
      sheet.getRange(i + 1, 8).setValue(Number(rows[i][7] || 0) + 1);
      return;
    }
  }

  var id = 'USR_' + new Date().getTime().toString(36).toUpperCase();
  sheet.appendRow([
    id,
    data.name          || '',
    data.phone         || '',
    data.affiliation   || '',
    data.consentTimestamp    || new Date().toISOString(),
    data.consentTextVersion  || 'v1',
    new Date().toISOString(),
    '1',
  ]);
}
