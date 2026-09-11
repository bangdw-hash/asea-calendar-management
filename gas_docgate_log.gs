// gas_docgate_log.gs — 법인서류 다운로드 게이트 GAS 백엔드
// Google Apps Script 새 프로젝트에 붙여넣고 웹앱으로 배포하세요.
// 배포 설정: 나로 실행 / 모든 사용자 액세스
// 배포 후 URL을 docgate.js 의 GAS_ENDPOINT 상수에 입력하세요.

var SHEET_ID = '1suLdv2AvEeEcg2dUVpTXaAEBI18DoDdcqzED87RYGMg';

function _getSheet(name) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function _ensureLogHeader(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['신청일시','이름','이메일','직함','서류명','파일ID','사유','User-Agent','다운로드']);
    sheet.getRange(1,1,1,9).setFontWeight('bold');
  }
}

function _ensureCatHeader(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['ID','서류명','등록일시']);
    sheet.getRange(1,1,1,3).setFontWeight('bold');
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);

    // 카테고리 추가
    if (payload.action === 'addCategory') {
      var catSheet = _getSheet('DocCategories');
      _ensureCatHeader(catSheet);
      var newId = String(Date.now());
      catSheet.appendRow([
        newId,
        payload.name || '',
        new Date().toLocaleString('ko-KR', {timeZone:'Asia/Seoul'})
      ]);
      return ContentService
        .createTextOutput(JSON.stringify({ok:true, id:newId}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 카테고리 삭제
    if (payload.action === 'removeCategory') {
      var catSheet = _getSheet('DocCategories');
      var rows = catSheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(payload.id)) {
          catSheet.deleteRow(i + 1);
          break;
        }
      }
      return ContentService
        .createTextOutput(JSON.stringify({ok:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 다운로드 로그 기록
    var logSheet = _getSheet('DocLog');
    _ensureLogHeader(logSheet);
    logSheet.appendRow([
      new Date().toLocaleString('ko-KR', {timeZone:'Asia/Seoul'}),
      payload.name     || '',
      payload.email    || '',
      payload.title    || '',
      payload.fileName || '',
      payload.fileId   || '',
      payload.reason   || '',
      (payload.ua || '').substring(0, 200),
      payload.downloaded ? '완료' : '링크발급'
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ok:true}))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ok:false, error:err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var p    = e.parameter || {};
    var type = p.type || 'logs';

    // 카테고리 추가 (GET 방식 — no-cors POST 대신)
    if (p.action === 'addCategory') {
      var name = p.name || '';
      if (!name) return _json({ok:false, error:'name required'});
      var catSheet = _getSheet('DocCategories');
      _ensureCatHeader(catSheet);
      var newId = String(Date.now());
      catSheet.appendRow([newId, name, new Date().toLocaleString('ko-KR', {timeZone:'Asia/Seoul'})]);
      return _json({ok:true, id:newId});
    }

    // 카테고리 삭제 (GET 방식)
    if (p.action === 'removeCategory') {
      var id = p.id || '';
      var catSheet = _getSheet('DocCategories');
      var rows = catSheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(id)) { catSheet.deleteRow(i + 1); break; }
      }
      return _json({ok:true});
    }

    if (type === 'categories') {
      var sheet = _getSheet('DocCategories');
      _ensureCatHeader(sheet);
      var rows = sheet.getDataRange().getValues();
      if (rows.length <= 1) return _json([]);
      var data = rows.slice(1).map(function(row) {
        return { id: row[0], name: row[1], createdAt: row[2] };
      });
      return _json(data);
    }

    // type=logs (관리자용)
    var sheet = _getSheet('DocLog');
    if (sheet.getLastRow() <= 1) return _json([]);
    var rows   = sheet.getDataRange().getValues();
    var header = rows[0];
    var data   = rows.slice(1).map(function(row) {
      var obj = {};
      header.forEach(function(h, i) { obj[h] = row[i]; });
      return obj;
    });
    return _json(data);

  } catch (err) {
    return _json({error:err.message});
  }
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
