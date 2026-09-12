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

// Supabase (자동 분석용 — service_role 키 필요)
var SUPABASE_URL     = 'https://zbpeyklwpotjyveipzxd.supabase.co';
var SUPABASE_SVC_KEY = '';  // ← Supabase > Settings > API > service_role key 붙여넣기

// Claude API (자동 분석용)
var CLAUDE_API_KEY   = '';  // ← https://console.anthropic.com 에서 발급

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

/* ══════════════════════════════════════════════
   자동 트렌드 분석 시스템
   ══════════════════════════════════════════════ */

/* ── Supabase REST 헬퍼 ── */
function _supaGet(path, params) {
  var qs = params ? '?' + Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&') : '';
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + path + qs, {
    method: 'get',
    headers: {
      'apikey': SUPABASE_SVC_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SVC_KEY,
      'Accept': 'application/json'
    },
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}

function _supaPost(path, body) {
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: 'post',
    headers: {
      'apikey': SUPABASE_SVC_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SVC_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}

function _supaPatch(path, filter, body) {
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + path + '?' + filter, {
    method: 'patch',
    headers: {
      'apikey': SUPABASE_SVC_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SVC_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}

/* ── Claude API 직접 호출 ── */
function _claudeCall(model, systemPrompt, userPrompt) {
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    headers: {
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({
      model: model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    }),
    muteHttpExceptions: true
  });
  var data = JSON.parse(res.getContentText());
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.content[0].text;
}

/* ── DataLab 원시 호출 (JSON 반환) ── */
function _datalabRaw(body) {
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
  return JSON.parse(res.getContentText());
}

/* ── 트렌드 방향 계산 ── */
function _calcTrendDir(data) {
  if (!data || data.length < 2) return '안정';
  var half = Math.max(1, Math.floor(data.length / 2));
  var older = 0, newer = 0;
  for (var i = 0; i < half; i++) older += data[i].ratio;
  for (var j = data.length - half; j < data.length; j++) newer += data[j].ratio;
  var diff = (newer / half) - (older / half);
  if (diff > 8) return '상승중';
  if (diff < -8) return '하락';
  return '안정';
}

/**
 * autoAnalyzeTrends() — GAS Time Trigger에서 실행
 * 1. schedule_config 에서 테마·minRatio 읽기
 * 2. 각 테마 DataLab 조회 → minRatio 이상 or 상승중인 테마만 AI 분석
 * 3. 결과를 trend_analyses + saved_keywords(자동 추천)에 저장
 */
function autoAnalyzeTrends() {
  if (!SUPABASE_SVC_KEY || !CLAUDE_API_KEY) {
    Logger.log('SUPABASE_SVC_KEY 또는 CLAUDE_API_KEY 가 비어 있습니다. 설정 후 재실행하세요.');
    return;
  }

  // schedule_config 읽기
  var cfgArr = _supaGet('schedule_config', { 'select': '*', 'limit': '1' });
  var cfg = Array.isArray(cfgArr) ? cfgArr[0] : cfgArr;
  if (!cfg || !cfg.enabled) {
    Logger.log('자동 분석이 비활성화 상태입니다.');
    return;
  }

  var themes = cfg.themes || [];
  var minRatio = cfg.min_ratio || 20;

  if (!themes.length) {
    Logger.log('분석할 테마가 없습니다. 브라우저에서 테마를 추가해 주세요.');
    return;
  }

  // DataLab 날짜 범위 (최근 8주)
  var now = new Date();
  var endDate = Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd');
  var start = new Date(now.getTime() - 56 * 24 * 3600 * 1000);
  var startDate = Utilities.formatDate(start, 'Asia/Seoul', 'yyyy-MM-dd');

  var results = [];
  var totalKeywords = 0;
  var filteredKeywords = 0;

  for (var i = 0; i < themes.length; i++) {
    var theme = themes[i];
    Logger.log('분석 중: ' + theme + ' (' + (i+1) + '/' + themes.length + ')');

    // DataLab
    var datalabData = null;
    var trendDir = '안정';
    var peakRatio = 0;
    try {
      var dlRes = _datalabRaw({
        startDate: startDate,
        endDate: endDate,
        timeUnit: 'week',
        keywordGroups: [{ groupName: theme, keywords: [theme] }]
      });
      if (dlRes.results && dlRes.results[0] && dlRes.results[0].data) {
        datalabData = dlRes.results[0].data;
        trendDir = _calcTrendDir(datalabData);
        peakRatio = 0;
        for (var d = 0; d < datalabData.length; d++) {
          if (datalabData[d].ratio > peakRatio) peakRatio = datalabData[d].ratio;
        }
      }
    } catch(e) {
      Logger.log('DataLab 오류 (' + theme + '): ' + e.message);
    }

    totalKeywords += 5;

    // 필터: minRatio 미달이고 하락/안정이면 스킵
    var recentRatio = datalabData && datalabData.length
      ? datalabData[datalabData.length - 1].ratio
      : 0;
    if (recentRatio < minRatio && trendDir !== '상승중') {
      Logger.log('스킵 (ratio=' + recentRatio + ', dir=' + trendDir + '): ' + theme);
      continue;
    }

    // AI 분석
    var datalabCtx = '';
    if (datalabData && datalabData.length) {
      datalabCtx = '\n\n[네이버 DataLab 실측 데이터 (최근 8주)]\n' +
        '트렌드 방향: ' + trendDir + '\n' +
        '최고 검색량 지수: ' + peakRatio.toFixed(1) + '\n' +
        '최근 주 ratio: ' + recentRatio.toFixed(1) + '\n(위 실측 데이터를 반드시 분석에 반영할 것)';
    }

    var sys = [
      '당신은 한국 디지털 마케팅 전문가이자 네이버 블로그 SEO 컨설턴트입니다.',
      '네이버 DataLab 실측 검색량 데이터를 기반으로 블로그 키워드 전략을 수립합니다.',
      'JSON 형식으로만 응답하세요. 다른 텍스트 절대 금지.',
      datalabCtx
    ].join('\n');

    var usr = [
      '테마: "' + theme + '"',
      '현재 DataLab 트렌드 방향: ' + trendDir,
      '',
      '이 테마에서 지금 네이버에서 실제로 검색되는 블로그 키워드 5개를 분석하여 아래 JSON으로만 출력하세요.',
      '{',
      '  "theme": "' + theme + '",',
      '  "datalab_trend": "' + trendDir + '",',
      '  "keywords": [',
      '    {',
      '      "keyword": "지역+카테고리+상황 조합의 구체적 검색어",',
      '      "trend": "상승중|안정|계절성",',
      '      "reason": "DataLab 데이터와 연계한 주목 이유 (한 줄)",',
      '      "angle": "이 키워드로 쓸 블로그 글의 구체적 방향과 제목 아이디어",',
      '      "hook": "독자를 사로잡을 첫 문장 예시"',
      '    }',
      '  ]',
      '}'
    ].join('\n');

    try {
      var text = _claudeCall('claude-haiku-4-5-20251001', sys, usr);
      var m = text.match(/\{[\s\S]*\}/);
      if (m) {
        var parsed = JSON.parse(m[0]);
        parsed._datalabRatios = datalabData;
        results.push(parsed);
        filteredKeywords += (parsed.keywords || []).length;
      }
    } catch(e) {
      Logger.log('AI 오류 (' + theme + '): ' + e.message);
      results.push({ theme: theme, keywords: [], error: e.message });
    }

    // Rate limit 방지
    Utilities.sleep(1000);
  }

  if (!results.length) {
    Logger.log('조건을 충족하는 테마가 없어 분석 결과가 없습니다.');
    return;
  }

  // trend_analyses 저장
  var insRes = _supaPost('trend_analyses', {
    source: 'auto',
    themes: themes,
    results: results,
    keyword_count: totalKeywords,
    filtered_count: filteredKeywords
  });
  var runId = Array.isArray(insRes) ? insRes[0].id : (insRes.id || null);
  Logger.log('trend_analyses 저장 완료. id=' + runId);

  // 상승중 키워드 자동 북마크
  for (var ri = 0; ri < results.length; ri++) {
    var r = results[ri];
    var kws = r.keywords || [];
    for (var ki = 0; ki < kws.length; ki++) {
      var kw = kws[ki];
      if (kw.trend === '상승중') {
        try {
          _supaPost('saved_keywords', {
            keyword: kw.keyword,
            theme: r.theme || '',
            trend: kw.trend || '',
            angle: kw.angle || '',
            hook: kw.hook || '',
            source_run_id: runId || null
          });
        } catch(e) {
          Logger.log('북마크 저장 오류: ' + e.message);
        }
        Utilities.sleep(200);
      }
    }
  }

  Logger.log('자동 분석 완료. 분석 테마: ' + results.length + '개, 키워드: ' + filteredKeywords + '개');
}

/**
 * setupAutoTrigger() — GAS 편집기에서 1회만 실행
 * schedule_config 의 period/hour/day_of_week 를 읽어 타임 트리거 등록
 */
function setupAutoTrigger() {
  // 기존 트리거 제거
  removeAutoTrigger();

  var cfgArr = _supaGet('schedule_config', { 'select': '*', 'limit': '1' });
  var cfg = Array.isArray(cfgArr) ? cfgArr[0] : cfgArr;
  var period = (cfg && cfg.period) || 'weekly';
  var hour = (cfg && cfg.hour) || 9;
  var dow = (cfg && cfg.day_of_week) || 3;  // 1=월 ~ 7=일

  var trigger = ScriptApp.newTrigger('autoAnalyzeTrends').timeBased();

  if (period === 'daily') {
    trigger.everyDays(1).atHour(hour).create();
    Logger.log('매일 ' + hour + '시 자동 분석 트리거 등록 완료');
  } else {
    var dayMap = {1:'MONDAY',2:'TUESDAY',3:'WEDNESDAY',4:'THURSDAY',5:'FRIDAY',6:'SATURDAY',7:'SUNDAY'};
    var gwDay = ScriptApp.WeekDay[dayMap[dow] || 'WEDNESDAY'];
    trigger.onWeekDay(gwDay).atHour(hour).create();
    Logger.log('매주 ' + (dayMap[dow] || 'WEDNESDAY') + ' ' + hour + '시 자동 분석 트리거 등록 완료');
  }
}

/**
 * removeAutoTrigger() — 등록된 autoAnalyzeTrends 트리거 전체 제거
 */
function removeAutoTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'autoAnalyzeTrends') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  Logger.log('autoAnalyzeTrends 트리거 제거 완료');
}
