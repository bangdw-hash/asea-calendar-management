/**
 * Naver API 프록시 — Google Apps Script 웹앱
 *
 * [배포 방법]
 * 1. https://script.google.com 에서 새 프로젝트 생성 (또는 기존 프로젝트 열기)
 * 2. 이 코드 전체를 붙여넣기
 * 3. '배포' > '새 배포' > 유형: 웹 앱
 *    - 실행 계정: 나(Me)
 *    - 액세스 권한: 모든 사용자(Anonymous)
 * 4. 배포 URL을 복사하여 blog.html의 NAVER_PROXY_URL 값으로 교체
 *
 * [지원 API]
 * - local  : 네이버 지역 검색 (맛집 탭 자동완성)
 * - datalab: 데이터랩 검색어 트렌드 (트렌드 탭)
 * - blog   : 블로그 검색
 */

var NAVER_CLIENT_ID     = '2rpv5zhg9g';
var NAVER_CLIENT_SECRET = '6Le9mBkkJGGEJM3E4RxNBf3j0g4t0irV8qNEcXYQ';

function doPost(e) {
  try {
    var body    = JSON.parse(e.postData.contents);
    var payload = body.payload || {};
    var type    = payload.type;

    if (type === 'datalab') {
      return _datalab(payload.body);
    } else if (type === 'local') {
      return _search('local', payload);
    } else {
      return _search(type, payload);
    }
  } catch (err) {
    return _respond({ error: err.message });
  }
}

/* ── 지역 검색 / 블로그 검색 (GET) ── */
function _search(type, payload) {
  var params = {};
  Object.keys(payload).forEach(function(k) {
    if (k !== 'type') params[k] = payload[k];
  });
  var qs  = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  var url = 'https://openapi.naver.com/v1/search/' + type + '.json?' + qs;
  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      'X-Naver-Client-Id':     NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
    },
    muteHttpExceptions: true
  });
  return _respond(JSON.parse(res.getContentText()));
}

/* ── DataLab 검색어 트렌드 (POST) ── */
function _datalab(body) {
  var res = UrlFetchApp.fetch('https://openapi.naver.com/v1/datalab/search', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Naver-Client-Id':     NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  return _respond(JSON.parse(res.getContentText()));
}

function _respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
