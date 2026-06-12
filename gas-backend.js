/**
 * ASEA 업무캘린더 공유 신청 — Google Apps Script 백엔드
 *
 * [배포 방법]
 * 1. https://script.google.com 에서 새 프로젝트 생성
 * 2. 이 코드를 붙여넣기
 * 3. '배포' > '새 배포' > 유형: 웹 앱
 *    - 실행 계정: 나(Me)
 *    - 액세스 권한: 모든 사용자(Anonymous)
 * 4. 배포 URL을 복사하여 calendar-share.html 관리자 패널에 입력
 */

var SHEET_NAME = '신청현황';
var COLS = ['id','submittedAt','category','name','dept','emailPrefix','email','status','registeredAt'];

function doGet(e) {
  var param  = (e && e.parameter) ? e.parameter : {};
  var action = param.action || 'list';
  var sheet = _getSheet();
  try {
    if (action === 'list') {
      return _respond(_listEntries(sheet));
    }
    if (action === 'add') {
      var entry = JSON.parse(decodeURIComponent(param.d || '{}'));
      _addEntry(sheet, entry);
      return _respond({ ok: true });
    }
    if (action === 'update') {
      var changes = JSON.parse(decodeURIComponent(param.d || '{}'));
      _updateEntry(sheet, param.id, changes);
      return _respond({ ok: true });
    }
    if (action === 'delete') {
      _deleteEntry(sheet, param.id);
      return _respond({ ok: true });
    }
  } catch (err) {
    return _respond({ ok: false, error: err.message });
  }
  return _respond({ ok: false, error: 'Unknown action' });
}

/* ── Internal helpers ── */

function _getSheet() {
  var props = PropertiesService.getScriptProperties();
  var ssId  = props.getProperty('SPREADSHEET_ID');
  var ss;
  if (ssId) {
    try { ss = SpreadsheetApp.openById(ssId); } catch(e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('ASEA 업무캘린더 공유 신청 현황');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function _listEntries(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { ok: true, data: [] };
  var rows = sheet.getRange(2, 1, lastRow - 1, COLS.length).getValues();
  var entries = rows
    .map(function(row) {
      var obj = {};
      COLS.forEach(function(col, i) { obj[col] = row[i] !== undefined ? String(row[i]) : ''; });
      return obj;
    })
    .filter(function(e) { return e.id; });
  return { ok: true, data: entries };
}

function _addEntry(sheet, entry) {
  var row = COLS.map(function(col) { return entry[col] !== undefined ? entry[col] : ''; });
  sheet.appendRow(row);
}

function _updateEntry(sheet, id, changes) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      var rowNum = i + 2;
      var rowVals = sheet.getRange(rowNum, 1, 1, COLS.length).getValues()[0];
      var obj = {};
      COLS.forEach(function(col, j) { obj[col] = rowVals[j]; });
      Object.keys(changes).forEach(function(k) { obj[k] = changes[k]; });
      sheet.getRange(rowNum, 1, 1, COLS.length)
        .setValues([COLS.map(function(col) { return obj[col] !== undefined ? obj[col] : ''; })]);
      return;
    }
  }
}

function _deleteEntry(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(id)) {
      sheet.deleteRow(i + 2);
      return;
    }
  }
}
