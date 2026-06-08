/**
 * gas_sms_proxy.gs
 * Google Apps Script — 알리고(Aligo) SMS/LMS 발송 프록시
 *
 * ═══════════════════════════════════════════════════════════════
 * 배포 방법 (1회 설정):
 *  1. script.google.com → 새 프로젝트 생성 (또는 기존 프로젝트에 파일 추가)
 *  2. 이 코드 전체 붙여넣기
 *  3. SPREADSHEET_ID 값을 본인 스프레드시트 ID로 수정
 *  4. [프로젝트 설정] → [스크립트 속성] → 아래 두 항목 추가:
 *       ALIGO_KEY   = 알리고 API 키  (알리고 로그인 → 개발자센터 → API 키)
 *       ALIGO_ID    = 알리고 아이디  (알리고 로그인 아이디)
 *  5. 배포 → 새 배포 → 웹 앱
 *     - 실행: 나(본인 계정)
 *     - 액세스: 모든 사용자
 *  6. 배포 URL 복사
 *  7. ASEA 앱 → 문자발송 탭 → 설정 → 'SMS 프록시 URL' 붙여넣기
 *
 * ※ 코드 수정 후 반드시 "새 버전으로 재배포" 해야 반영됩니다.
 * ═══════════════════════════════════════════════════════════════
 *
 * 알리고(Aligo) 요금 (가장 저렴한 국내 문자 API, 2025년 기준):
 *   SMS  : 8원/건  (한글 45자 / 영문 90자 이하)
 *   LMS  : 27원/건 (한글 2,000자 이하, 제목 포함)
 *   MMS  : 65원/건 (이미지 포함)
 *   가입: https://smartsms.aligo.in
 *   ※ 발신번호는 알리고 사이트에서 사전 등록 필요 (본인인증)
 *
 * 문자발송내역 시트 컬럼 (A~K):
 *   A: id  B: sentAt  C: sender  D: message  E: msgType
 *   F: receiverCount  G: receivers  H: resultCode  I: successCnt
 *   J: errorCnt  K: sentBy
 */

var SPREADSHEET_ID = '1flrGzAuzs-HvSEYbswj3KTMKWmFf4YVy_wwKXSLfH6E';
var SMS_SHEET_NAME = '문자발송내역';
var ALIGO_SEND_URL = 'https://apis.aligo.in/send/';
var ALIGO_REMAIN_URL = 'https://apis.aligo.in/remain/';

// ─────────────────────────────────────────────────────────────
// Entry Point
// ─────────────────────────────────────────────────────────────
function doPost(e) {
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8'
  };
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var result = { ok: true };

    if (action === 'sendSms') {
      result = _sendSms(body);
    } else if (action === 'getBalance') {
      result = _getBalance();
    } else if (action === 'getHistory') {
      result.list = _getHistory(body);
    } else if (action === 'ping') {
      result.message = 'SMS 프록시 정상 작동 중';
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

// OPTIONS 프리플라이트 처리
function doGet(e) {
  if (e.parameter && e.parameter.action === 'ping') {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, message: 'SMS 프록시 정상' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: 'GET not supported' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────
// SMS 발송
// ─────────────────────────────────────────────────────────────
function _sendSms(body) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('ALIGO_KEY');
  var userId = props.getProperty('ALIGO_ID');

  if (!apiKey || !userId) {
    throw new Error('ALIGO_KEY / ALIGO_ID 스크립트 속성이 설정되지 않았습니다. GAS 프로젝트 설정을 확인하세요.');
  }

  var sender   = (body.sender   || '').replace(/[^0-9]/g, '');
  var message  = body.message   || '';
  var receivers = body.receivers || []; // 배열
  var title    = body.title     || '';
  var sentBy   = body.sentBy    || '';

  if (!sender)          throw new Error('발신번호가 없습니다.');
  if (!message)         throw new Error('메시지 내용이 없습니다.');
  if (!receivers.length) throw new Error('수신자가 없습니다.');

  // 수신번호 정리: 하이픈 제거
  var cleanReceivers = receivers.map(function(r) {
    return r.replace(/[^0-9]/g, '');
  }).filter(function(r) { return r.length >= 10; });

  if (!cleanReceivers.length) throw new Error('유효한 수신번호가 없습니다.');

  // SMS(45자 이하) vs LMS 자동 판단
  var msgType = (message.length <= 45 && _byteLength(message) <= 90) ? 'SMS' : 'LMS';
  if (body.msgType) msgType = body.msgType; // 강제 지정 허용

  var payload = {
    key      : apiKey,
    userid   : userId,
    sender   : sender,
    receiver : cleanReceivers.join(','),
    msg      : message,
    msg_type : msgType
  };
  if (title && msgType !== 'SMS') payload.title = title;
  // 테스트 모드: body.testMode === true 이면 실제 발송 안 함
  if (body.testMode) payload.testmode_yn = 'Y';

  var response = UrlFetchApp.fetch(ALIGO_SEND_URL, {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true
  });

  var resText = response.getContentText('UTF-8');
  var resJson;
  try { resJson = JSON.parse(resText); } catch(e) { resJson = { result_code: '-9', message: resText }; }

  var ok = (String(resJson.result_code) === '1');

  // 발송 내역 시트에 기록
  _logHistory({
    sender       : sender,
    message      : message,
    msgType      : msgType,
    receiverCount: cleanReceivers.length,
    receivers    : cleanReceivers.join(','),
    resultCode   : resJson.result_code || '',
    successCnt   : resJson.success_cnt || 0,
    errorCnt     : resJson.error_cnt || 0,
    sentBy       : sentBy
  });

  return {
    ok         : ok,
    resultCode : resJson.result_code,
    message    : resJson.message,
    msgId      : resJson.msg_id || '',
    successCnt : resJson.success_cnt || 0,
    errorCnt   : resJson.error_cnt || 0,
    msgType    : msgType
  };
}

// ─────────────────────────────────────────────────────────────
// 잔액 조회
// ─────────────────────────────────────────────────────────────
function _getBalance() {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('ALIGO_KEY');
  var userId = props.getProperty('ALIGO_ID');
  if (!apiKey || !userId) throw new Error('ALIGO_KEY / ALIGO_ID 미설정');

  var url = ALIGO_REMAIN_URL + '?apikey=' + encodeURIComponent(apiKey) + '&userid=' + encodeURIComponent(userId);
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var resJson = JSON.parse(response.getContentText('UTF-8'));

  return {
    ok     : (String(resJson.result_code) === '1'),
    won    : resJson.SMS_CNT ? null : resJson.won,   // 충전 잔액(원)
    smsCnt : resJson.SMS_CNT  || 0,
    lmsCnt : resJson.LMS_CNT  || 0,
    mmsCnt : resJson.MMS_CNT  || 0,
    raw    : resJson
  };
}

// ─────────────────────────────────────────────────────────────
// 발송 내역 조회 (Sheets)
// ─────────────────────────────────────────────────────────────
function _getHistory(body) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SMS_SHEET_NAME);
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var limit = body.limit || 50;
  var rows = data.slice(1).reverse().slice(0, limit); // 최근순

  return rows.map(function(r) {
    return {
      id           : r[0],
      sentAt       : r[1],
      sender       : r[2],
      message      : r[3],
      msgType      : r[4],
      receiverCount: r[5],
      receivers    : r[6],
      resultCode   : r[7],
      successCnt   : r[8],
      errorCnt     : r[9],
      sentBy       : r[10]
    };
  });
}

// ─────────────────────────────────────────────────────────────
// 발송 내역 시트에 기록
// ─────────────────────────────────────────────────────────────
function _logHistory(data) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SMS_SHEET_NAME);

  // 시트가 없으면 생성
  if (!sheet) {
    sheet = ss.insertSheet(SMS_SHEET_NAME);
    sheet.appendRow(['id','sentAt','sender','message','msgType',
                     'receiverCount','receivers','resultCode',
                     'successCnt','errorCnt','sentBy']);
    sheet.setFrozenRows(1);
  }

  var id = 'SMS' + new Date().getTime();
  var sentAt = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

  sheet.appendRow([
    id,
    sentAt,
    data.sender,
    data.message,
    data.msgType,
    data.receiverCount,
    data.receivers,
    data.resultCode,
    data.successCnt,
    data.errorCnt,
    data.sentBy
  ]);
}

// ─────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────
function _byteLength(str) {
  // 한글: 2바이트, 나머지: 1바이트 (알리고 기준)
  var len = 0;
  for (var i = 0; i < str.length; i++) {
    len += (str.charCodeAt(i) > 127) ? 2 : 1;
  }
  return len;
}
