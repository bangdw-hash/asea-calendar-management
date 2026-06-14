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

var AMULBO_LOG_COLS = ['timestamp','userType','question','inputTokens','outputTokens','costUSD','elapsedMs','satisfied'];

function doGet(e) {
  var param  = (e && e.parameter) ? e.parameter : {};
  var action = param.action || 'list';

  // ── 아물보 관련 액션 (sheet 불필요) ──
  try {
    if (action === 'getAmulboConfig') {
      return _respond(_getAmulboConfig());
    }
    if (action === 'saveAmulboConfig') {
      return _respond(_saveAmulboConfig(param));
    }
    if (action === 'getAmulboKnowledge') {
      return _respond(_getAmulboKnowledge());
    }
    if (action === 'saveAmulboKnowledge') {
      return _respond(_saveAmulboKnowledge(param));
    }
    if (action === 'amulboLog') {
      return _respond(_amulboLog(param));
    }
    if (action === 'amulboStats') {
      return _respond(_amulboStats());
    }
    // ── 범용 공유 KV 저장소 (예산/보고/규정/설문 등 공유) ──
    if (action === 'kvGet') {
      return _respond({ ok: true, key: param.key, value: _kvGet(param.key), updatedAt: _kvMeta(param.key) });
    }
    if (action === 'kvList') {
      return _respond({ ok: true, keys: _kvList(param.prefix || '') });
    }
  } catch (err) {
    return _respond({ ok: false, error: err.message });
  }

  // ── 기존 신청현황 액션 ──
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

/* ── POST: 대용량 쓰기(공유 KV) ── */
function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'kvSet') { _kvSet(body.key, body.value); return _respond({ ok: true }); }
    if (body.action === 'kvSetMany' && body.items) {
      body.items.forEach(function (it) { _kvSet(it.key, it.value); });
      return _respond({ ok: true });
    }
    return _respond({ ok: false, error: 'Unknown post action' });
  } catch (err) {
    return _respond({ ok: false, error: err.message });
  }
}

/* ── 공유 KV (셀 50K 한계 → 청크 분할 저장) ── */
var KV_SHEET = 'KV공유';
var KV_CHUNK = 40000;
function _kvSheet() {
  var ss = _getOrCreateSS();
  var sh = ss.getSheetByName(KV_SHEET);
  if (!sh) { sh = ss.insertSheet(KV_SHEET); sh.appendRow(['key', 'idx', 'value', 'updatedAt']); sh.setFrozenRows(1); }
  return sh;
}
function _kvGet(key) {
  var sh = _kvSheet(); var last = sh.getLastRow(); if (last <= 1) return null;
  var vals = sh.getRange(2, 1, last - 1, 3).getValues();
  var chunks = [];
  for (var i = 0; i < vals.length; i++) { if (String(vals[i][0]) === String(key)) chunks.push([Number(vals[i][1]) || 0, String(vals[i][2])]); }
  if (!chunks.length) return null;
  chunks.sort(function (a, b) { return a[0] - b[0]; });
  return chunks.map(function (c) { return c[1]; }).join('');
}
function _kvMeta(key) {
  var sh = _kvSheet(); var last = sh.getLastRow(); if (last <= 1) return '';
  var vals = sh.getRange(2, 1, last - 1, 4).getValues();
  for (var i = 0; i < vals.length; i++) { if (String(vals[i][0]) === String(key)) return vals[i][3]; }
  return '';
}
function _kvList(prefix) {
  var sh = _kvSheet(); var last = sh.getLastRow(); if (last <= 1) return [];
  var vals = sh.getRange(2, 1, last - 1, 1).getValues(); var set = {};
  vals.forEach(function (r) { var k = String(r[0]); if (k && (!prefix || k.indexOf(prefix) === 0)) set[k] = 1; });
  return Object.keys(set);
}
function _kvSet(key, value) {
  var sh = _kvSheet(); value = String(value == null ? '' : value);
  var last = sh.getLastRow();
  if (last > 1) {
    var keys = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = keys.length - 1; i >= 0; i--) { if (String(keys[i][0]) === String(key)) sh.deleteRow(i + 2); }
  }
  var now = new Date().toISOString();
  if (value.length === 0) { sh.appendRow([key, 0, '', now]); return; }
  var idx = 0;
  for (var off = 0; off < value.length; off += KV_CHUNK) { sh.appendRow([key, idx++, value.substr(off, KV_CHUNK), now]); }
}

/* ── 아물보 액션 함수 ── */

function _getAmulboConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    ok: true,
    apiKey:  props.getProperty('AMULBO_API_KEY')  || '',
    baseUrl: props.getProperty('AMULBO_BASE_URL') || '',
    enabled: props.getProperty('AMULBO_ENABLED')  || 'false'
  };
}

function _saveAmulboConfig(param) {
  var props = PropertiesService.getScriptProperties();
  if (param.apiKey  !== undefined) props.setProperty('AMULBO_API_KEY',  param.apiKey);
  if (param.baseUrl !== undefined) props.setProperty('AMULBO_BASE_URL', param.baseUrl);
  if (param.enabled !== undefined) props.setProperty('AMULBO_ENABLED',  param.enabled);
  return { ok: true };
}

function _getAmulboKnowledge() {
  var ss    = _getOrCreateSS();
  var sheet = _getAmulboKnowledgeSheet(ss);
  var lastRow = sheet.getLastRow();
  // 헤더(key/value) 이후 'knowledge' 키 찾기
  if (lastRow <= 1) return { ok: true, knowledge: '' };
  var rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === 'knowledge') {
      return { ok: true, knowledge: String(rows[i][1]) };
    }
  }
  return { ok: true, knowledge: '' };
}

function _saveAmulboKnowledge(param) {
  var text  = decodeURIComponent(atob(param.d || ''));
  var ss    = _getOrCreateSS();
  var sheet = _getAmulboKnowledgeSheet(ss);
  var lastRow = sheet.getLastRow();
  // 기존 'knowledge' 행 찾아서 업데이트, 없으면 추가
  if (lastRow > 1) {
    var rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === 'knowledge') {
        sheet.getRange(i + 2, 2).setValue(text);
        return { ok: true };
      }
    }
  }
  sheet.appendRow(['knowledge', text]);
  return { ok: true };
}

function _amulboLog(param) {
  var data  = JSON.parse(decodeURIComponent(atob(param.d || 'e30=')));
  var ss    = _getOrCreateSS();
  var sheet = _getAmulboLogSheet(ss);
  var row = AMULBO_LOG_COLS.map(function(col) {
    return data[col] !== undefined ? data[col] : '';
  });
  // timestamp가 없으면 현재 시각
  if (!row[0]) row[0] = new Date().toISOString();
  sheet.appendRow(row);
  return { ok: true };
}

function _amulboStats() {
  var ss    = _getOrCreateSS();
  var sheet = _getAmulboLogSheet(ss);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return {
      ok: true,
      total: 0,
      byType: {},
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUSD: 0,
      recentRows: []
    };
  }

  var rows = sheet.getRange(2, 1, lastRow - 1, AMULBO_LOG_COLS.length).getValues();

  var total            = 0;
  var byType           = {};
  var totalInputTokens  = 0;
  var totalOutputTokens = 0;
  var totalCostUSD      = 0;

  rows.forEach(function(row) {
    var obj = {};
    AMULBO_LOG_COLS.forEach(function(col, i) { obj[col] = row[i]; });
    total++;
    var ut = String(obj.userType || '');
    byType[ut] = (byType[ut] || 0) + 1;
    totalInputTokens  += Number(obj.inputTokens)  || 0;
    totalOutputTokens += Number(obj.outputTokens) || 0;
    totalCostUSD      += Number(obj.costUSD)       || 0;
  });

  // 최근 50행
  var recentRaw = rows.slice(-50);
  var recentRows = recentRaw.map(function(row) {
    var obj = {};
    AMULBO_LOG_COLS.forEach(function(col, i) { obj[col] = row[i]; });
    return obj;
  });

  return {
    ok: true,
    total: total,
    byType: byType,
    totalInputTokens:  totalInputTokens,
    totalOutputTokens: totalOutputTokens,
    totalCostUSD:      totalCostUSD,
    recentRows: recentRows
  };
}

/* ── Internal helpers ── */

function _getOrCreateSS() {
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
  return ss;
}

function _getSheet() {
  var ss    = _getOrCreateSS();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _getAmulboKnowledgeSheet(ss) {
  var sheet = ss.getSheetByName('아물보설정');
  if (!sheet) {
    sheet = ss.insertSheet('아물보설정');
    sheet.appendRow(['key', 'value']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _getAmulboLogSheet(ss) {
  var sheet = ss.getSheetByName('아물보사용기록');
  if (!sheet) {
    sheet = ss.insertSheet('아물보사용기록');
    sheet.appendRow(AMULBO_LOG_COLS);
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
      var rowNum  = i + 2;
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
