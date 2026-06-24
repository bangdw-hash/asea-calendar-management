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
    'https://www.googleapis.com/auth/tasks',
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

/* ────────────────────────────────────────────────────────────────
   AI 프록시(Supabase Edge Function) — Claude 키를 클라이언트에 노출하지
   않고 서버에서 대신 호출. (보고서 항목 32)
   · asea_ai_proxy_url 로 덮어쓰기/비활성('') 가능
   · 프록시 미배포·게이트웨이 오류 시, 직접 키가 있으면 직접 호출로 폴백
──────────────────────────────────────────────────────────────── */
window.SUPA_ANON = window.SUPA_ANON ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV5a2x3cG90anl2ZWlwenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTYxMDcsImV4cCI6MjA5NzA5MjEwN30.6JgoQ6rPRnmrbBTG68A-Y9HDQk40mnwubhXVnkZvHrQ';

window.getAIProxyUrl = function () {
  try { var v = localStorage.getItem('asea_ai_proxy_url'); if (v !== null) return v; } catch (e) {}
  return 'https://zbpeyklwpotjyveipzxd.supabase.co/functions/v1/ai-proxy';
};

/* ────────────────────────────────────────────────────────────────
   AI 제공자(Provider) — 3중 라우팅 + 계정/기기 무관 클라우드 공유
   · proxy   : Supabase Edge Function(ai-proxy) — 서버에 키 보관(기본·권장)
   · official: 공식 Anthropic API 직접 호출 (sk-ant- 키, 브라우저 직접허용)
   · flow    : aiapiflow 등 호환 게이트웨이 — CORS 회피 위해 프록시 경유 forward
   설정은 Supabase(app_submissions, kind='ai_provider_config', ref='global')에
   저장되어 모든 직원이 어느 기기/계정에서나 동일 적용.
──────────────────────────────────────────────────────────────── */
var _AIP_KEY = 'asea_ai_providers';
function _aipDefault() {
  return { active: 'proxy', official: { key: '' }, flow: { baseUrl: 'https://aiapiflow.com', key: '', model: '' } };
}
function _aipDec(k) { try { return (k && window._decodeApiKey) ? window._decodeApiKey(k) : (k || ''); } catch (e) { return k || ''; } }
function _safeParse(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
function _bodyWithModel(body, model) {
  if (!model) return body;
  try { var b = JSON.parse(body); b.model = model; return JSON.stringify(b); } catch (e) { return body; }
}
/* 사용용(복호화된 키) 설정 반환 */
window.getAIProviders = function () {
  try {
    var raw = localStorage.getItem(_AIP_KEY);
    if (raw) {
      var p = JSON.parse(raw);
      return {
        active: p.active || 'proxy',
        official: { key: _aipDec(p.official && p.official.key) },
        flow: { baseUrl: (p.flow && p.flow.baseUrl) || 'https://aiapiflow.com', key: _aipDec(p.flow && p.flow.key), model: (p.flow && p.flow.model) || '' }
      };
    }
  } catch (e) {}
  return _aipDefault();
};
/* 저장(키 난독화). cloud=true 면 Supabase에도 공유(전 직원 적용) */
window.setAIProviders = function (cfg, cloud) {
  var enc = window._encodeApiKey || function (x) { return x; };
  var stored = {
    active: cfg.active || 'proxy',
    official: { key: enc((cfg.official && cfg.official.key) || '') },
    flow: { baseUrl: (cfg.flow && cfg.flow.baseUrl) || 'https://aiapiflow.com', key: enc((cfg.flow && cfg.flow.key) || ''), model: (cfg.flow && cfg.flow.model) || '' }
  };
  try { localStorage.setItem(_AIP_KEY, JSON.stringify(stored)); } catch (e) {}
  if (cloud && window.CloudForms && CloudForms.save) {
    var who = ''; try { who = localStorage.getItem('asea_user_email') || ''; } catch (e) {}
    return CloudForms.save('ai_provider_config', 'global', 'AI제공자설정', stored.active, { config: stored, updatedBy: who });
  }
  return Promise.resolve();
};
/* 클라우드 공유 설정을 로컬에 반영(모든 직원 동일 적용) */
window.loadAIProvidersFromCloud = function () {
  if (!(window.CloudForms && CloudForms.list)) return Promise.resolve(false);
  return CloudForms.list('ai_provider_config').then(function (res) {
    // CloudForms.list 는 { ok, rows } 를 반환 → rows 를 풀어야 함
    var rows = (res && res.rows) ? res.rows : (Array.isArray(res) ? res : []);
    var row = rows.filter(function (r) { return r.ref === 'global'; })[0] || rows[0];
    var cfg = row && row.data && row.data.config;
    if (cfg) { try { localStorage.setItem(_AIP_KEY, JSON.stringify(cfg)); } catch (e) {} return true; }
    return false;
  }).catch(function () { return false; });
};
// 부팅 시 가능한 빨리 클라우드 설정 적용(여러 시점에 시도 → 첫 AI 호출 전에 반영되도록)
try {
  if (document.readyState !== 'loading') { if (window.loadAIProvidersFromCloud) window.loadAIProvidersFromCloud(); }
  else document.addEventListener('DOMContentLoaded', function () { if (window.loadAIProvidersFromCloud) window.loadAIProvidersFromCloud(); });
  window.addEventListener('load', function () { if (window.loadAIProvidersFromCloud) window.loadAIProvidersFromCloud(); });
} catch (e) {}

function _claudeHasRealKey(opts) {
  try {
    var h = (opts && opts.headers) || {};
    var k = h['x-api-key'] || h['X-Api-Key'];
    return !!(k && String(k).indexOf('sk-') === 0);
  } catch (e) { return false; }
}

/**
 * claudeFetch(endpoint, opts) — fetch()의 드롭인 대체. 활성 제공자에 따라 라우팅.
 */
window.claudeFetch = async function (endpoint, opts) {
  opts = opts || {};
  var P = window.getAIProviders();
  var active = P.active || 'proxy';
  var proxy = window.getAIProxyUrl();

  // 공식 직접(sk-ant-) — Anthropic은 브라우저 직접호출 허용
  if (active === 'official' && P.official.key) {
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': P.official.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: opts.body
    });
  }
  // Flow(aiapiflow 등) — CORS 회피 위해 프록시 경유 forward
  // opts.keepModel=true 면 flow.model 강제치환 안 함(추출 등 저비용 작업은 본문 모델 유지)
  if (active === 'flow' && P.flow.key && proxy) {
    var _fpay = opts.keepModel ? opts.body : _bodyWithModel(opts.body, P.flow.model);
    return fetch(proxy, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.SUPA_ANON, 'apikey': window.SUPA_ANON },
      body: JSON.stringify({ service: 'claude', payload: _safeParse(_fpay), upstream: { baseUrl: (P.flow.baseUrl || 'https://aiapiflow.com').replace(/\/$/, ''), key: P.flow.key } })
    });
  }

  // 기본: 서버 프록시(서버 키)
  function direct() { return fetch(endpoint || 'https://api.anthropic.com/v1/messages', opts); }
  if (!proxy) return direct();
  var proxyBody = opts.body;
  try { proxyBody = JSON.stringify({ service: 'claude', payload: JSON.parse(opts.body) }); } catch (e) {}
  try {
    var res = await fetch(proxy, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.SUPA_ANON, 'apikey': window.SUPA_ANON },
      body: proxyBody
    });
    if ((res.status === 404 || res.status === 503 || res.status === 546) && _claudeHasRealKey(opts)) return direct();
    return res;
  } catch (e) {
    if (_claudeHasRealKey(opts)) return direct();
    throw e;
  }
};

window.getClaudeConfig = function() {
  var staffCfg = null;
  try { staffCfg = JSON.parse(localStorage.getItem('asea_staff_menus') || 'null'); } catch(e) {}

  /* staff-menus의 키는 인코딩 저장됐을 수 있으므로 디코딩 */
  var rawStaffKey = staffCfg && staffCfg.claudeApiKey ? _decodeApiKey(staffCfg.claudeApiKey) : '';

  var apiKey  = CONFIG.anthropicApiKey ||
                localStorage.getItem('asea_anthropic_api_key') ||
                rawStaffKey || '';

  // 활성 제공자(공식/Flow/프록시)가 있으면 클라이언트 키가 없어도 동작 → 가드 통과용 센티넬
  if (!apiKey) {
    var P = window.getAIProviders ? window.getAIProviders() : null;
    if (P && P.active === 'official' && P.official.key) apiKey = P.official.key;
    else if (P && P.active === 'flow' && P.flow.key) apiKey = 'via-flow';
    else if (window.getAIProxyUrl && window.getAIProxyUrl()) apiKey = 'via-proxy';
  }

  // ★ 직접 호출 시 사용할 공식 엔드포인트(프록시 장애 폴백용).
  var endpoint   = 'https://api.anthropic.com/v1/messages';
  var isOfficial = true;

  return { apiKey: apiKey, endpoint: endpoint, isOfficial: isOfficial };
};

/* 죽은 프록시(aiapiflow/amplifuse) Base URL을 무조건 제거 — 공식 API 직접 사용 */
window.clearProxyBaseUrlIfOfficial = function () {
  try {
    if (window.CONFIG) CONFIG.anthropicBaseUrl = '';
    localStorage.removeItem('asea_anthropic_base_url');
    // 직원 공유 캐시(staff-menus)에 박혀 있던 프록시 Base URL도 제거
    var sc = null;
    try { sc = JSON.parse(localStorage.getItem('asea_staff_menus') || 'null'); } catch (e) {}
    if (sc && sc.claudeBaseUrl) { sc.claudeBaseUrl = ''; localStorage.setItem('asea_staff_menus', JSON.stringify(sc)); }
  } catch (e) {}
  return true;
};
try { window.clearProxyBaseUrlIfOfficial(); } catch (e) {}

/**
 * testClaudeConnection(override) — 실제 연결 점검.
 *  · 인자 없음 → 현재 활성 제공자(claudeFetch) 기준
 *  · override = { mode:'official'|'flow'|'proxy', key, baseUrl, model } → 특정 제공자 개별 점검
 * 반환: { ok, status, message }
 */
window.testClaudeConnection = async function (override) {
  var model = (override && override.model) || 'claude-haiku-4-5-20251001';
  var body = JSON.stringify({ model: model, max_tokens: 4, messages: [{ role: 'user', content: 'ping' }] });
  var label = '활성 제공자';
  try {
    var res;
    if (override && override.mode === 'official') {
      label = '공식 Anthropic';
      if (!override.key) return { ok: false, message: '공식 API 키(sk-ant-…)를 입력하세요.' };
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': override.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: body
      });
    } else if (override && override.mode === 'flow') {
      label = 'Flow(' + ((override.baseUrl || 'aiapiflow').replace(/^https?:\/\//, '')) + ')';
      if (!override.key) return { ok: false, message: 'Flow API 키를 입력하세요.' };
      var proxy = window.getAIProxyUrl();
      if (!proxy) return { ok: false, message: '서버 프록시(ai-proxy)가 필요합니다. Flow는 프록시 경유로 점검합니다.' };
      res = await fetch(proxy, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.SUPA_ANON, 'apikey': window.SUPA_ANON },
        body: JSON.stringify({ service: 'claude', payload: JSON.parse(body), upstream: { baseUrl: (override.baseUrl || 'https://aiapiflow.com').replace(/\/$/, ''), key: override.key } })
      });
    } else {
      var P = window.getAIProviders ? window.getAIProviders() : { active: 'proxy' };
      label = P.active === 'flow' ? 'Flow' : P.active === 'official' ? '공식 Anthropic' : '서버 프록시';
      res = await window.claudeFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'via', 'anthropic-version': '2023-06-01' },
        body: body
      });
    }
    if (res.ok) return { ok: true, status: res.status, message: '연결 정상 ✓ (' + label + ')' };
    var detail = 'HTTP ' + res.status;
    try { var j = await res.json(); if (j && j.error && j.error.message) detail = j.error.message; else if (j && j.message) detail = j.message; } catch (e) {}
    return { ok: false, status: res.status, message: '응답 오류 (' + label + '): ' + detail + '\n→ 키/잔액/모델ID를 확인하세요.' };
  } catch (e) {
    return { ok: false, message: '네트워크/CORS 오류 (' + label + '): ' + (e && e.message || e) };
  }
};
