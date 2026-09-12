/**
 * Naver / Kakao / Google Places API 프록시 — Google Apps Script 웹앱
 *
 * [배포 방법]
 * 1. https://script.google.com 에서 프로젝트 열기
 * 2. 이 코드 전체 붙여넣기
 * 3. '배포' > '배포 관리' > 편집(연필) > 버전: 새 버전 > 배포
 *
 * [지원 API]
 * - local          : 네이버 지역 검색
 * - blog           : 네이버 블로그 검색
 * - datalab        : 네이버 DataLab 트렌드
 * - kakao          : 카카오 로컬 키워드 검색
 * - gplaces_search : Google Places 텍스트 검색 (place_id 획득)
 * - gplaces_detail : Google Places 상세 정보 (영업시간·평점·가격대 등)
 */

// 네이버 지역/블로그 검색 (developers.naver.com — 상호명 검색 앱)
var SEARCH_CLIENT_ID     = 'VrnrLasu5ihp4zySJ0mX';
var SEARCH_CLIENT_SECRET = '_4kRe_DD6O';

// 네이버 DataLab (NCP API Hub — BlogTrend 앱)
var NCP_KEY_ID = '2rpv5zhg9g';
var NCP_KEY    = '6Le9mBkkJGGEJM3E4RxNBf3j0g4t0irV8qNEcXYQ';

// 카카오 로컬
var KAKAO_REST_KEY = '416b98e0cf6a33bf68249c316f76ff68';

// Google Places API (New)
var GOOGLE_PLACES_KEY = 'AIzaSyAU9S5xK6QWRtC_MOD9jPEe2Qmna5t0Ecs';

function doPost(e) {
  try {
    var body    = JSON.parse(e.postData.contents);
    var payload = body.payload || {};
    var type    = payload.type;

    if (type === 'datalab') {
      return _datalab(payload.body);
    } else if (type === 'kakao') {
      return _kakao(payload);
    } else if (type === 'gplaces_search') {
      return _gplacesSearch(payload.query);
    } else if (type === 'gplaces_detail') {
      return _gplacesDetail(payload.placeId);
    } else {
      return _search(type, payload);
    }
  } catch (err) {
    return _respond({ error: err.message });
  }
}

/* ── 네이버 지역/블로그 검색 (GET) ── */
function _search(type, payload) {
  var params = {};
  Object.keys(payload).forEach(function(k) {
    if (k !== 'type') params[k] = payload[k];
  });
  var qs = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  var url = 'https://openapi.naver.com/v1/search/' + type + '.json?' + qs;
  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      'X-Naver-Client-Id':     SEARCH_CLIENT_ID,
      'X-Naver-Client-Secret': SEARCH_CLIENT_SECRET
    },
    muteHttpExceptions: true
  });
  return _respond(JSON.parse(res.getContentText()));
}

/* ── 네이버 DataLab 검색어 트렌드 (POST) ── */
function _datalab(body) {
  var res = UrlFetchApp.fetch('https://naveropenapi.apigw.ntruss.com/datalab/v1/search', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-NCP-APIGW-API-KEY-ID': NCP_KEY_ID,
      'X-NCP-APIGW-API-KEY':    NCP_KEY
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  return _respond(JSON.parse(res.getContentText()));
}

/* ── 카카오 로컬 키워드 검색 ── */
function _kakao(payload) {
  var qs = 'query=' + encodeURIComponent(payload.query || '') + '&size=5';
  var res = UrlFetchApp.fetch('https://dapi.kakao.com/v2/local/search/keyword.json?' + qs, {
    method: 'get',
    headers: { 'Authorization': 'KakaoAK ' + KAKAO_REST_KEY },
    muteHttpExceptions: true
  });
  return _respond(JSON.parse(res.getContentText()));
}

/* ── Google Places 텍스트 검색 → place_id 획득 ── */
function _gplacesSearch(query) {
  var body = { textQuery: query, languageCode: 'ko' };
  var res = UrlFetchApp.fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Goog-Api-Key':    GOOGLE_PLACES_KEY,
      'X-Goog-FieldMask':  'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  return _respond(JSON.parse(res.getContentText()));
}

/* ── Google Places 상세 정보 ── */
function _gplacesDetail(placeId) {
  var fields = [
    'displayName', 'formattedAddress', 'internationalPhoneNumber',
    'regularOpeningHours', 'rating', 'userRatingCount',
    'priceLevel', 'primaryTypeDisplayName', 'websiteUri', 'editorialSummary'
  ].join(',');
  var url = 'https://places.googleapis.com/v1/places/' + placeId
    + '?languageCode=ko&fields=' + fields + '&key=' + GOOGLE_PLACES_KEY;
  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true
  });
  return _respond(JSON.parse(res.getContentText()));
}

function _respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
