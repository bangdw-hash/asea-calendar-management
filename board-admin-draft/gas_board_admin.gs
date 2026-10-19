/**
 * ASEA 로비 전광판 관리 API (A트랙: 입력판 -> 구글시트 쓰기)
 *
 * 역할: board-input.html / board.html 관리자 메뉴가 보낸 입력을 「ASEA_로비전광판_관리_v8」 시트에 기록합니다.
 *       읽기는 기존 board.html의 gviz 직접 읽기와 기존 API_URL을 그대로 사용합니다(이 스크립트는 읽기 전용 목록도 제공).
 *
 * 설치(방시원님 계정에서 1회)
 *  1. 시트 > 확장 프로그램 > Apps Script 에 이 파일 전체를 붙여넣고 저장
 *  2. 프로젝트 설정 > 스크립트 속성에 ADMIN_TOKEN = (임의의 긴 문자열) 추가
 *     (선택) SHEET_ID 를 넣으면 독립 프로젝트로도 동작. 시트에 연결한 스크립트면 불필요
 *  3. 배포 > 새 배포 > 유형 웹 앱 > 실행 계정 "나", 액세스 "모든 사용자" > 배포 후 웹 앱 URL 복사
 *  4. 입력판 설정의 API 주소·토큰 칸에 URL과 ADMIN_TOKEN 입력
 *
 * 호출 방식(브라우저 fetch, 사전 요청을 피하려고 text/plain 사용)
 *  POST {token, action:'read'|'write'|'append'|'remove'|'ping', sheet:'notice'|..., data:...}
 *  GET  ?action=ping  (연결 확인용, 토큰 불필요, 내용 미노출)
 */

var TZ = 'Asia/Seoul';
var LOG_SHEET = '변경이력';
var MAX_CELL = 2000;               // 한 칸 최대 글자 수

/* 시트 정의: key -> 시트 이름 / 형태 */
var DEF = {
  notice: { name: '주요안내', type: 'list', headerRow: 1, cols: ['text', 'dept'], firstCol: 1,
            noteMark: /^\s*(\[입력 안내\]|·|\[사용법\])/,
            side: { pageCol: 4, secsCol: 5, firstRow: 2, count: 3 } },      // D:페이지 E:표시초
  welcome: { name: '환영', type: 'kv+list',
             kv: { keys: ['게시(Y/N)', '대상', '문구', '모드', '표시초', '시작일시', '종료일시', '배너(Y/N)', '겹침'], col: 1 },
             list: { firstRow: 2, cols: ['num', 'target', 'sub'], col: 4 } },  // D:번호 E:대상 F:문구
  slides: { name: '슬라이드', type: 'list', headerRow: 1, firstCol: 1,
            cols: ['on', 'type', 'title', 'body', 'img', 'secs', 'start', 'end', 'link'], noteMark: /^\s*\[/ },
  rental: { name: '대관', type: 'kv+list',
            kv: { keys: ['게시(Y/N)', '제목', '표시초', '모드', '시작일시', '종료일시'], col: 1 },
            list: { firstRow: 9, cols: ['date', 'from', 'to', 'place', 'what'], col: 1, noteMark: /^\s*(\[사용법\]|·)/ } },
  fonts: { name: '서체', type: 'kv3', keyCol: 1, cols: ['font', 'size', 'sample'], firstCol: 2, noteMark: /^\s*(\[서체|·)/ },
  settings: { name: '설정', type: 'kv', keyCol: 1, valCol: 2, noteMark: /^\s*(\[입력 안내\]|·)/ },
  theme: { name: '테마설정', type: 'table', headerRow: 1, cols: ['theme', 'on', 'mins'], firstCol: 1 }
};

function doGet(e) {
  var a = (e && e.parameter && e.parameter.action) || 'ping';
  if (a === 'ping') return out_({ ok: true, time: now_() });
  return out_({ ok: false, error: '허용되지 않은 요청입니다.' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!auth_(req.token)) return out_({ ok: false, error: '인증에 실패했습니다.' });
    if (req.action === 'ping') return out_({ ok: true, time: now_() });
    var d = DEF[req.sheet];
    if (!d) return out_({ ok: false, error: '알 수 없는 시트입니다: ' + req.sheet });
    lock.waitLock(20000);                        // 동시 저장 충돌 방지
    var ss = book_();
    var sh = ss.getSheetByName(d.name);
    if (!sh) return out_({ ok: false, error: '시트를 찾을 수 없습니다: ' + d.name });

    var res;
    if (req.action === 'read') res = read_(sh, d);
    else if (req.action === 'write') res = write_(sh, d, req.data, req.sheet);
    else return out_({ ok: false, error: '지원하지 않는 action 입니다.' });
    return out_({ ok: true, data: res, time: now_() });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* ---------- 읽기 ---------- */
function read_(sh, d) {
  var v = sh.getDataRange().getDisplayValues();
  if (d.type === 'list') return { rows: readList_(v, d), side: d.side ? readSide_(v, d.side) : null };
  if (d.type === 'kv+list') return { kv: readKv_(v, d.kv), rows: readSubList_(v, d.list) };
  if (d.type === 'kv') return { kv: readKvPair_(v, d) };
  if (d.type === 'kv3') return { rows: readKv3_(v, d) };
  if (d.type === 'table') return { rows: readTable_(v, d) };
  return {};
}
function readList_(v, d) {
  var rows = [], end = noteStart_(v, d.firstCol - 1, d.noteMark);
  for (var r = (d.headerRow || 1); r < end; r++) {
    var row = {}, any = false;
    d.cols.forEach(function (k, i) {
      var c = String(v[r][d.firstCol - 1 + i] || '');
      row[k] = c; if (c !== '') any = true;
    });
    if (any) rows.push(row);
  }
  return rows;
}
function readSide_(v, s) {
  var out = [];
  for (var i = 0; i < s.count; i++) out.push({ page: String(v[s.firstRow - 1 + i][s.pageCol - 1] || ''), secs: Number(v[s.firstRow - 1 + i][s.secsCol - 1]) || 0 });
  return out;
}
function readKv_(v, kv) {
  var o = {};
  kv.keys.forEach(function (k, i) { o[k] = String((v[i] && v[i][kv.col]) || ''); });   // A:키 B:값
  return o;
}
function readSubList_(v, l) {
  var rows = [], end = l.noteMark ? noteStart_(v, 0, l.noteMark) : v.length;
  for (var r = l.firstRow - 1; r < end; r++) {
    var row = {}, any = false;
    l.cols.forEach(function (k, i) {
      var c = String((v[r] && v[r][l.col - 1 + i]) || '');
      row[k] = c; if (c !== '' && k !== 'num') any = true;
    });
    if (any) rows.push(row);
  }
  return rows;
}
function readKvPair_(v, d) {
  var o = {}, end = noteStart_(v, 0, d.noteMark);
  for (var r = 0; r < end; r++) { var k = String(v[r][d.keyCol - 1] || ''); if (k) o[k] = String(v[r][d.valCol - 1] || ''); }
  return o;
}
function readKv3_(v, d) {
  var rows = [];
  for (var r = 0; r < v.length; r++) {
    var a = String(v[r][0] || '');
    if (!a || d.noteMark.test(a)) continue;                     // 안내문 행 제외 (서체 시트는 안내문이 중간에 있음)
    rows.push({ area: a, font: String(v[r][1] || ''), size: String(v[r][2] || ''), sample: String(v[r][3] || '') });
  }
  return rows;
}
function readTable_(v, d) {
  var rows = [];
  for (var r = d.headerRow; r < v.length; r++) {
    var a = String(v[r][0] || ''); if (!a) continue;
    rows.push({ theme: a, on: String(v[r][1]).toUpperCase() === 'TRUE', mins: String(v[r][2] || '') });
  }
  return rows;
}
function noteStart_(v, col, mark) {
  for (var r = 0; r < v.length; r++) if (mark && mark.test(String(v[r][col] || ''))) return r;
  return v.length;
}

/* ---------- 쓰기 ---------- */
function write_(sh, d, data, key) {
  if (!data) throw new Error('data 가 비어 있습니다.');
  var before = JSON.stringify(read_(sh, d)).length;
  if (d.type === 'list') {
    writeList_(sh, d, data.rows || []);
    if (d.side && data.side) writeSide_(sh, d.side, data.side);
  } else if (d.type === 'kv+list') {
    if (data.kv) writeKv_(sh, d.kv, data.kv);
    if (data.rows) writeSubList_(sh, d.list, data.rows);
  } else if (d.type === 'kv') {
    writeKvPair_(sh, d, data.kv || {});
  } else if (d.type === 'kv3') {
    writeKv3_(sh, d, data.rows || []);
  } else if (d.type === 'table') {
    writeTable_(sh, d, data.rows || []);
  }
  SpreadsheetApp.flush();
  log_(key, '쓰기', (data.rows ? data.rows.length + '건' : '설정') + ' (이전 길이 ' + before + ')');
  return { saved: true };
}
function cell_(x) {                               // 길이 제한. 쓰는 칸은 모두 텍스트 서식('@')이라 =로 시작해도 수식이 실행되지 않음
  var s = (x === null || x === undefined) ? '' : String(x);
  return s.length > MAX_CELL ? s.slice(0, MAX_CELL) : s;
}
/* 안내문 위쪽 데이터 영역을 맞춤: 모자라면 안내문 앞에 행을 끼워 넣어 안내문을 아래로 민다. 지울 행 수를 반환 */
function fitRows_(sh, firstRow, noteRow0, totalRows, count) {
  if (noteRow0 >= totalRows) return Math.max(count, totalRows - firstRow + 1, 1);   // 안내문 없음
  var cap = noteRow0 - firstRow;                                  // 안내문 바로 위 빈 행 1칸은 남김
  if (count > cap) { sh.insertRowsBefore(firstRow + cap, count - cap); cap = count; }
  return Math.max(cap, 1);
}
function writeList_(sh, d, rows) {
  var v = sh.getDataRange().getValues();
  var first = (d.headerRow || 1) + 1;
  var clear = fitRows_(sh, first, noteStart_(v, d.firstCol - 1, d.noteMark), v.length, rows.length);
  sh.getRange(first, d.firstCol, clear, d.cols.length).clearContent();
  if (!rows.length) return;
  var vals = rows.map(function (r) { return d.cols.map(function (k) { return cell_(r[k]); }); });
  sh.getRange(first, d.firstCol, vals.length, d.cols.length).setNumberFormat('@').setValues(vals);
}
function writeSide_(sh, s, side) {
  for (var i = 0; i < s.count; i++) {
    var p = side[i] || {};
    sh.getRange(s.firstRow + i, s.pageCol).setValue((i + 1) + '페이지');
    sh.getRange(s.firstRow + i, s.secsCol).setValue(Math.max(0, Math.min(600, Number(p.secs) || 0)));
  }
}
function writeKv_(sh, kv, obj) {
  kv.keys.forEach(function (k, i) {
    if (obj[k] !== undefined) sh.getRange(i + 1, kv.col + 1).setNumberFormat('@').setValue(cell_(obj[k]));
  });
}
function writeSubList_(sh, l, rows) {
  var v = sh.getDataRange().getValues(), clear;
  if (l.col === 1 && l.noteMark) clear = fitRows_(sh, l.firstRow, noteStart_(v, 0, l.noteMark), v.length, rows.length);
  else {                                                          // 안내문과 같은 열을 쓰지 않는 목록(환영 D:F)
    clear = Math.max(12, rows.length);
    var need = l.firstRow + clear - 1;
    if (need > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  }
  sh.getRange(l.firstRow, l.col, clear, l.cols.length).clearContent();
  if (!rows.length) return;
  var vals = rows.map(function (r, i) {
    return l.cols.map(function (k) { return k === 'num' ? i + 1 : cell_(r[k]); });
  });
  sh.getRange(l.firstRow, l.col, vals.length, l.cols.length).setNumberFormat('@').setValues(vals);
}
function writeKvPair_(sh, d, kv) {
  var v = sh.getDataRange().getValues(), end = noteStart_(v, 0, d.noteMark);
  for (var r = 0; r < end; r++) {
    var k = String(v[r][d.keyCol - 1] || '');
    if (k && kv[k] !== undefined) sh.getRange(r + 1, d.valCol).setNumberFormat('@').setValue(cell_(kv[k]));
  }
}
function writeKv3_(sh, d, rows) {
  var v = sh.getDataRange().getValues();
  rows.forEach(function (row) {
    for (var r = 0; r < v.length; r++) {
      if (String(v[r][0]) === String(row.area) && !d.noteMark.test(String(v[r][0]))) {
        sh.getRange(r + 1, 2).setNumberFormat('@').setValue(cell_(row.font));
        var size = Number(row.size);
        if (size) sh.getRange(r + 1, 3).setValue(Math.max(50, Math.min(200, size)));   // 글자 크기 50~200%
        break;
      }
    }
  });
}
function writeTable_(sh, d, rows) {
  var v = sh.getDataRange().getValues();
  rows.forEach(function (row) {
    for (var r = d.headerRow; r < v.length; r++) {
      if (String(v[r][0]) === String(row.theme)) {
        sh.getRange(r + 1, 2).setValue(row.on === true || row.on === 'TRUE');
        sh.getRange(r + 1, 3).setValue(Math.max(1, Math.min(120, Number(row.mins) || 5)));
        break;
      }
    }
  });
}

/* ---------- 공통 ---------- */
function auth_(t) {
  var real = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  return !!real && real.length >= 12 && typeof t === 'string' && t === real;
}
function book_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function log_(key, what, note) {
  var ss = book_(), sh = ss.getSheetByName(LOG_SHEET);
  if (!sh) { sh = ss.insertSheet(LOG_SHEET); sh.appendRow(['시각', '시트', '작업', '비고']); sh.setFrozenRows(1); }
  sh.appendRow([now_(), key, what, note]);
  if (sh.getLastRow() > 2000) sh.deleteRows(2, 500);               // 이력은 최근 약 1,500건만 보관
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* 설치 확인용: 스크립트 편집기에서 직접 실행해 토큰 속성이 있는지 점검 */
function selfCheck() {
  var t = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  Logger.log('ADMIN_TOKEN 설정: ' + (t && t.length >= 12 ? '정상' : '없음 또는 12자 미만'));
  Logger.log('시트 접근: ' + book_().getName());
}
