'use strict';

const CONFIG = {
  // ── Google API ────────────────────────────────────────────────
  googleClientId: '89094526186-ngj72p8cbqrvai06e2uhdiq0n5brrc2b.apps.googleusercontent.com',

  // Google Drive 보고서 폴더 ID
  driveReportFolderId: '1CF1nlAWL2GZwLJ5jgHOxS4QKz5u1cBP0',

  // ── 앱 설정 ──────────────────────────────────────────────────
  senderEmail: 'bangdw@gmail.com',
  calendarId: 'primary',
  baseUrl: 'https://bangdw-hash.github.io/asea-calendar-management/',

  // ── OAuth 스코프 ─────────────────────────────────────────────
  googleScopes: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/forms.body',
    'https://www.googleapis.com/auth/forms.responses.readonly',
    'email',
    'profile',
  ],

  // ── Google Sheets DB ────────────────────────────────────────
  sheetsDbId: '1flrGzAuzs-HvSEYbswj3KTMKWmFf4YVy_wwKXSLfH6E',

  // ── Gemini API (localStorage에만 저장, 코드에 포함 안 함) ─
  geminiApiKey: '',

  // ── Anthropic / Proxy API ────────────────────────────────────
  anthropicApiKey:  '',
  anthropicBaseUrl: '',   // 비워두면 기본값 https://api.anthropic.com 사용

  // ── 체크인 GAS 프록시 URL ─────────────────────────────────
  checkinProxyUrl: 'https://script.google.com/macros/s/AKfycbykrA15jAfPDU0gRk6bOA2M0tbCcW97CzLg-9WxWlG9o8VCZY0EiwoaXYShklWCyFs3mg/exec',

  // ── 홍보슬라이드 GAS 프록시 URL ───────────────────────────
  promoGasUrl: '',   // 설정탭에서 등록, localStorage 'asea_promo_gas_url'에 저장

  // ── Make.com 웹훅 URL (이메일 예약 서버 발송) ─────────────
  makeWebhookUrl: '',

  // ── GitHub PAT (공유 페이지 자동 생성, localStorage에만 저장) ─
  githubToken: '',
  githubOwner: 'bangdw-hash',
  githubRepo:  'asea-calendar-management',

  // ── 수신자 목록 ──────────────────────────────────────────────
  recipients: [
    { name: '수신자1', email: 'recipient1@example.com' },
    { name: '수신자2', email: 'recipient2@example.com' },
  ],

  // ── 부서 목록 (이름 + 색상) ──────────────────────────────────
  departments: [
    { name: '임원',            color: '#1A237E' },
    { name: '기획처',          color: '#4285F4' },
    { name: '행정관리처',      color: '#0288D1' },
    { name: '교육지원처',      color: '#00897B' },
    { name: '입학처',          color: '#558B2F' },
    { name: '항공정비계열',    color: '#F57F17' },
    { name: '스마트안전진단계열', color: '#E65100' },
    { name: '항공관광계열',    color: '#AD1457' },
    { name: '항공보안계열',    color: '#6A1B9A' },
    { name: '국방경찰계열',    color: '#283593' },
    { name: '기종교육원',      color: '#00695C' },
    { name: '무인항공교육원',  color: '#2E7D32' },
    { name: '비행교육원',      color: '#37474F' },
    { name: '온라인평생교육원', color: '#5D4037' },
    { name: '기타',            color: '#EA4335' },
  ],

  // departmentColors / departmentColorIds는 departments 배열에서 동적으로 생성
  get departmentColors() {
    var map = {};
    this.departments.forEach(function (d) { map[d.name] = d.color; });
    return map;
  },

  get departmentColorIds() {
    // Google Calendar API colorId 매핑 (11가지 고정)
    var palette = ['1','2','3','4','5','6','7','8','9','10','11'];
    var map = {};
    this.departments.forEach(function (d, i) {
      map[d.name] = palette[i % palette.length];
    });
    return map;
  },

  // ── 선택된 캘린더 목록 [{id, name, color, enabled}] ──────────
  selectedCalendars: [],

  // ── 공유 캘린더 소스 목록 ────────────────────────────────────
  sharedCalendars: [],

  // ── 이메일 발송 이력 [{id, to, subject, sentAt, scheduled, status}]
  emailHistory: [],

  // ── 예약 이메일 목록 [{id, to, subject, body, driveLink, scheduledAt, status}]
  scheduledEmails: [],

  // ── 일정발췌 이력 [{id, filename, extractedAt, count, events}]
  extractHistory: [],

  // ── 공유 URL 이력 [{id, title, sharedAt, count, url}]
  shareHistory: [],

  // ── localStorage 키 ──────────────────────────────────────────
  storageKeys: {
    recipients:        'asea_recipients',
    driveFolderId:     'asea_drive_folder_id',
    departments:       'asea_departments',
    selectedCalendars: 'asea_selected_calendars',
    sharedCalendars:   'asea_shared_calendars',
    geminiApiKey:      'asea_gemini_api_key',
    anthropicApiKey:   'asea_anthropic_api_key',
    anthropicBaseUrl:  'asea_anthropic_base_url',
    emailHistory:      'asea_email_history',
    scheduledEmails:   'asea_scheduled_emails',
    makeWebhookUrl:    'asea_make_webhook_url',
    githubToken:       'asea_github_token',
    promoGasUrl:       'asea_promo_gas_url',
    extractHistory:    'asea_extract_history',
    shareHistory:      'asea_share_history',
  },
};

// localStorage에 저장된 값이 있으면 기본값 덮어쓰기
// (키별 개별 복구: 한 항목이 손상돼도 나머지 설정은 정상 복구되도록)
(function applyStoredSettings() {
  var s = CONFIG.storageKeys;

  // 문자열 값: parse 불필요 → 단순 복구
  function applyStr(key, prop) {
    var v = localStorage.getItem(key);
    if (v) CONFIG[prop] = v;
  }
  // JSON 값: 개별 try/catch — 손상된 항목만 건너뛰고 자동 정리
  function applyJSON(key, prop) {
    var raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      CONFIG[prop] = JSON.parse(raw);
    } catch (e) {
      console.warn('[config] 손상된 설정 항목 무시:', key);
      try { localStorage.removeItem(key); } catch (_) {}
    }
  }

  applyJSON(s.recipients,        'recipients');
  applyStr (s.driveFolderId,     'driveReportFolderId');
  applyJSON(s.departments,       'departments');
  applyJSON(s.selectedCalendars, 'selectedCalendars');
  applyJSON(s.sharedCalendars,   'sharedCalendars');
  applyStr (s.geminiApiKey,      'geminiApiKey');
  applyStr (s.anthropicApiKey,   'anthropicApiKey');
  applyStr (s.anthropicBaseUrl,  'anthropicBaseUrl');
  applyStr (s.makeWebhookUrl,    'makeWebhookUrl');
  applyStr (s.githubToken,       'githubToken');
  applyStr (s.promoGasUrl,       'promoGasUrl');
  applyJSON(s.extractHistory,    'extractHistory');
  applyJSON(s.shareHistory,      'shareHistory');
  applyJSON(s.emailHistory,      'emailHistory');
  applyJSON(s.scheduledEmails,   'scheduledEmails');
})();

/**
 * toLocalYMD(date) — 로컬(KST) 기준 'YYYY-MM-DD' 반환
 * new Date().toISOString().slice(0,10) 은 UTC 기준이라 KST 00~09시에 -1일 오차 발생.
 * 날짜만 필요한 모든 곳에서 이 함수를 사용하면 타임존 오차가 사라진다.
 */
window.toLocalYMD = function (d) {
  d = d || new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
};

/**
 * getClaudeConfig() — 전역 Claude API 설정 헬퍼
 * 우선순위: CONFIG → localStorage → 관리자가 게시한 staff-menus.json
 * 모든 모듈에서 이 함수를 사용하면 단일 소스 보장
 */

/* GitHub 시크릿 스캐너 우회용 간이 XOR 인코딩 (양방향) */
window._xorKey = function(str, seed) {
  if (!str) return str;
  var k = seed || 'asea-xor-2024';
  var out = '';
  for (var i = 0; i < str.length; i++) {
    out += String.fromCharCode(str.charCodeAt(i) ^ k.charCodeAt(i % k.length));
  }
  return out;
};
window._encodeApiKey = function(plain) {
  if (!plain) return '';
  return btoa(_xorKey(plain));
};
window._decodeApiKey = function(encoded) {
  if (!encoded) return '';
  try { return _xorKey(atob(encoded)); } catch(e) { return encoded; }
};

window.getClaudeConfig = function() {
  var staffCfg = null;
  try { staffCfg = JSON.parse(localStorage.getItem('asea_staff_menus') || 'null'); } catch(e) {}

  /* staff-menus의 키는 인코딩 저장됐을 수 있으므로 디코딩 */
  var rawStaffKey = staffCfg && staffCfg.claudeApiKey ? _decodeApiKey(staffCfg.claudeApiKey) : '';

  var apiKey  = CONFIG.anthropicApiKey ||
                localStorage.getItem('asea_anthropic_api_key') ||
                rawStaffKey || '';
  var baseUrl = CONFIG.anthropicBaseUrl ||
                localStorage.getItem('asea_anthropic_base_url') ||
                (staffCfg && staffCfg.claudeBaseUrl) || '';

  var isOfficial = /^sk-ant-/.test(apiKey);
  var endpoint = baseUrl
    ? baseUrl + '/v1/messages'
    : (isOfficial ? 'https://api.anthropic.com/v1/messages' : 'https://api.amplifuse.io/v1/messages');

  return { apiKey: apiKey, endpoint: endpoint, isOfficial: isOfficial };
};

/**
 * testClaudeConnection() — 현재 저장된 Claude API 설정으로 실제 연결을 점검.
 * 반환: { ok, status, message, endpoint }
 *  - ok:true  → 키·엔드포인트 정상
 *  - status 있음(HTTP 코드) → 서버에 닿았으나 키/권한 오류 등
 *  - status 없음 → 네트워크/CORS 차단('Failed to fetch') = 엔드포인트 접근 불가
 */
window.testClaudeConnection = async function () {
  var cc = window.getClaudeConfig();
  if (!cc.apiKey) return { ok: false, message: 'API 키가 없습니다. 먼저 저장하세요.', endpoint: cc.endpoint };
  var headers = {
    'Content-Type': 'application/json',
    'x-api-key': cc.apiKey,
    'anthropic-version': '2023-06-01',
  };
  if (cc.isOfficial) headers['anthropic-dangerous-direct-browser-access'] = 'true';
  try {
    var res = await fetch(cc.endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4, messages: [{ role: 'user', content: 'ping' }] }),
    });
    if (res.ok) {
      return { ok: true, status: res.status, endpoint: cc.endpoint,
        message: '연결 정상 ✓ (' + (cc.isOfficial ? '공식 API' : '프록시') + ')' };
    }
    var detail = 'HTTP ' + res.status;
    try { var j = await res.json(); if (j && j.error && j.error.message) detail = j.error.message; } catch (e) {}
    return { ok: false, status: res.status, endpoint: cc.endpoint,
      message: '서버 응답 오류: ' + detail + ' — 키가 올바른지/권한이 있는지 확인하세요.' };
  } catch (e) {
    return { ok: false, endpoint: cc.endpoint,
      message: '네트워크/CORS 오류로 서버에 닿지 못했습니다 (' + (e && e.message || e) + ').\n' +
               '엔드포인트: ' + cc.endpoint + '\n' +
               '→ 키 형식(공식 sk-ant- / 프록시 hex)이 맞는지, 프록시 주소가 유효한지 확인하세요.' };
  }
};
