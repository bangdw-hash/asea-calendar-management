'use strict';
/**
 * cloudsync.js — 공유 서버(KV) 동기화 (예산/업무보고/규정/설문 등)
 *
 * 목적: localStorage에만 저장되던 모듈들을 코드 대폭 수정 없이 "공유"되게 한다.
 *  - 공유 대상 키만 선별 동기화(개인 설정 키는 제외)
 *  - 캐시 우선: 화면은 즉시 로컬로 그리고, 서버 최신본을 받아 병합 후 갱신
 *  - 동시 편집 안전: 레코드 배열은 id 기준 병합(union, 최신 우선) → 클로버 최소화
 *  - 서버 미설정/오류 시 기존 localStorage 동작 그대로(완전 폴백)
 *
 * 백엔드: gas-backend.js 의 kvGet/kvList/kvSet (calendar-share와 동일 GAS URL 공유)
 */
(function () {
  var GAS_DEFAULT = 'https://script.google.com/macros/s/AKfycbyZuuQpuc-0KWaaHmwJUTvnAc83liMcUcC5XxcdR-EFQCFC2AJ0LpFS3R1gS_JXI3Fykg/exec';
  function GAS() { try { return localStorage.getItem('asea_gas_url') || GAS_DEFAULT; } catch (e) { return GAS_DEFAULT; } }

  /* GAS(KV) 동기화는 기본 비활성(opt-in).
     - 이 GAS 웹앱은 CORS 헤더를 주지 않아 읽기 동기화가 구조적으로 실패 → 콘솔 에러 유발.
     - 중요한 데이터(신청서·할일·기숙사 등)는 이미 Supabase로 동기화되므로 실효 없음.
     - 필요 시 CloudSync.enable() 로 켤 수 있고, 켜져 있어도 첫 실패 시 세션 동안 자동 차단. */
  var _enabled = (function () { try { return localStorage.getItem('asea_cloudsync_enabled') === '1'; } catch (e) { return false; } })();
  var _broken = false;   // 세션 서킷 브레이커: 한 번 실패하면 더 시도 안 함(콘솔 도배 방지)
  function _trip() { _broken = true; }


  /* 동기화 정책: 'asea_' 로 시작하는 모든 키를 기본 동기화한다.
     단, 아래 '제외'는 기기/계정 로컬에 유지(보안키·토큰·접속설정·신원·기기 UI·캐시·이미 Supabase로 동기화되는 모듈). */

  // 계정(이메일)별 개인 데이터 — 키에 로그인 이메일이 포함되어 '본인 것'만 동기화(예: QR 명함)
  var USER_PREFIXES = ['asea_qrcards_', 'asea_recv_cards_'];
  function _curEmail() { try { return localStorage.getItem('asea_user_email') || ''; } catch (e) { return ''; } }
  function _userKeys() { var em = _curEmail(); if (!em) return []; return USER_PREFIXES.map(function (p) { return p + em; }); }

  // 동기화 제외(정확일치) — 보안키·토큰·접속설정·신원·기기 UI·개인 보기설정·별도 동기화 경로
  var EXCLUDE = [
    'asea_anthropic_api_key', 'asea_anthropic_base_url', 'asea_gemini_api_key', 'asea_github_token', 'asea_make_webhook_url', 'asea_sheets_api_key', 'asea_login_hint', 'asea_promo_access_token',
    'asea_gas_url', 'asea_base_url', 'asea_dorm_supabase_url', 'asea_dorm_supabase_key', 'asea_checkin_proxy_url', 'asea_facility_proxy_url', 'asea_promo_gas_url', 'asea_drive_folder_id',
    'asea_user_email', 'asea_is_admin', 'asea_user_roles', 'asea_budget_my_dept', 'asea_draft_usage', 'asea_checkin_device', 'asea_checkin_user',
    'asea_fab_pos', 'asea_cal_se_only', 'asea_selected_calendars', 'asea_shared_calendars', 'asea_cal_subscriptions',
    'asea_email_history', 'asea_scheduled_emails', 'asea_extract_history', 'asea_share_history'
  ];
  // 동기화 제외(프리픽스) — 캐시·토큰·개인 보기·개인키(별도 처리)·이미 Supabase로 동기화되는 모듈
  var EXCLUDE_PREFIXES = [
    'asea_cal_cache_', 'asea_gtoken', 'asea_qt_calendars_',
    'asea_qrcards_', 'asea_recv_cards_',
    'asea_board_', 'asea_hr_', 'asea_meetings', 'asea_promo_', 'asea_facility_', 'asea_monthly_rpt_', 'asea_sms_'
  ];

  function isSynced(k) {
    if (!k || k.indexOf('asea_') !== 0) return false;
    if (_userKeys().indexOf(k) >= 0) return true;        // 현재 계정 개인 데이터(스코프됨)
    if (EXCLUDE.indexOf(k) >= 0) return false;
    for (var i = 0; i < EXCLUDE_PREFIXES.length; i++) { if (k.indexOf(EXCLUDE_PREFIXES[i]) === 0) return false; }
    return true;                                          // 그 외 asea_* 는 기본 동기화
  }

  /* ── setItem 후킹: 공유 키 쓰기를 서버로 디바운스 푸시 ── */
  var _origSet = localStorage.setItem.bind(localStorage);
  var _applying = false;
  var _pushTimers = {};
  localStorage.setItem = function (k, v) {
    _origSet(k, v);
    if (_enabled && !_broken && !_applying && isSynced(k)) schedulePush(k);
  };
  function _applySet(k, v) { _applying = true; try { _origSet(k, v); } finally { _applying = false; } }

  function schedulePush(key) {
    clearTimeout(_pushTimers[key]);
    _pushTimers[key] = setTimeout(function () { push(key); }, 1200);
  }

  /* ── 서버 통신 ── */
  function kvGet(key) {
    return fetch(GAS() + '?action=kvGet&key=' + encodeURIComponent(key) + '&_=' + Date.now())
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { if (!j || !j.ok) throw 0; return j.value; });   // string | null
  }
  function kvList(prefix) {
    // 실패를 삼키지 않고 전파 → pullAll에서 서킷 차단 판단(콘솔 도배 방지)
    return fetch(GAS() + '?action=kvList&prefix=' + encodeURIComponent(prefix) + '&_=' + Date.now())
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { return (j && j.ok && j.keys) || []; });
  }
  function push(key, value) {
    if (!_enabled || _broken) return Promise.resolve();
    var body = JSON.stringify({ action: 'kvSet', key: key, value: value == null ? (localStorage.getItem(key) || '') : value });
    return fetch(GAS(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body })
      .catch(function (e) { _trip(); /* 실패 시 세션 동안 중단 */ });
  }

  /* ── 병합 ── */
  function ts(o) { return String((o && (o.updatedAt || o.confirmedAt || o.createdAt || o.addedAt || o.submittedAt)) || ''); }
  function mergeById(local, cloud) {
    var map = {}, order = [];
    function keyOf(o) {
      if (o && o.id != null) return 'id:' + o.id;
      try { return 'v:' + JSON.stringify(o); } catch (e) { return 'v:' + String(o); }   // id 없는 항목은 값으로 dedupe(중복 방지)
    }
    function put(o) {
      var k = keyOf(o);
      if (!(k in map)) { order.push(k); map[k] = o; }
      else if (ts(o) >= ts(map[k])) map[k] = o;   // id 동일 항목은 최신본 우선
    }
    (local || []).forEach(put); (cloud || []).forEach(put);
    return order.map(function (k) { return map[k]; });
  }
  function mergeValue(localStr, cloudStr) {
    if (cloudStr == null) return localStr;        // 서버에 없음 → 로컬 유지(이후 push)
    if (localStr == null) return cloudStr;
    if (localStr === cloudStr) return localStr;
    var lo = null, co = null;
    try { lo = JSON.parse(localStr); } catch (e) {}
    try { co = JSON.parse(cloudStr); } catch (e) {}
    if (Array.isArray(lo) && Array.isArray(co)) return JSON.stringify(mergeById(lo, co));
    return cloudStr; // 스칼라/객체 → 서버 우선(LWW)
  }

  /* ── 전체 동기화(캐시 우선 → 서버 병합) ── */
  var _lastPull = 0, _pulling = false;
  function pullAll(force) {
    if (!_enabled || _broken || _pulling) return;
    var now = Date.now();
    if (!force && now - _lastPull < 15000) return;  // 과도호출 방지
    _pulling = true; _lastPull = now;

    var cloudKeys = {};
    kvList('asea_').then(function (ks) {
      ks.forEach(function (k) { if (isSynced(k)) cloudKeys[k] = 1; });    // 서버의 동기화 대상 키
      _userKeys().forEach(function (k) { cloudKeys[k] = 1; });            // 현재 계정의 개인 데이터(QR 명함 등)
      // 로컬에만 있는 동기화 대상도 업로드 대상에 포함
      try { for (var i = 0; i < localStorage.length; i++) { var lk = localStorage.key(i); if (isSynced(lk)) cloudKeys[lk] = 1; } } catch (e) {}

      var keys = Object.keys(cloudKeys);
      var changed = false;
      var seq = keys.reduce(function (pr, key) {
        return pr.then(function () {
          return kvGet(key).catch(function () { return null; }).then(function (cloudStr) {
            var localStr = localStorage.getItem(key);
            var merged = mergeValue(localStr, cloudStr);
            if (merged != null && merged !== localStr) { _applySet(key, merged); changed = true; }
            // 서버 값과 다르면(또는 서버에 없으면) 수렴 위해 push
            if (merged != null && merged !== cloudStr) push(key, merged);
          });
        });
      }, Promise.resolve());

      seq.then(function () {
        _pulling = false;
        if (changed) {
          try { window.dispatchEvent(new CustomEvent('cloudsync-updated')); } catch (e) {}
        }
      }).catch(function () { _pulling = false; });
    }).catch(function () { _pulling = false; _trip(); });   // kvList 실패(CORS/네트워크) → 세션 동안 동기화 중단
  }

  function start() {
    // 제어 API는 항상 노출(끄고 켜기·상태확인 가능)
    window.CloudSync = {
      pull: function () { pullAll(true); },
      push: push,
      isSynced: isSynced,
      enabled: function () { return _enabled; },
      enable: function (url) { try { if (url) localStorage.setItem('asea_gas_url', url); localStorage.setItem('asea_cloudsync_enabled', '1'); } catch (e) {} location.reload(); },
      disable: function () { try { localStorage.removeItem('asea_cloudsync_enabled'); } catch (e) {} location.reload(); }
    };
    // 기본 비활성: GAS(KV) 동기화를 켜지 않았으면 어떤 네트워크 호출도 하지 않음 → 콘솔 에러 0
    if (!_enabled) return;

    // 초기 동기화는 로그인/첫 화면 렌더 이후로 미뤄 시작 지연을 막는다(GAS는 1~3초 소요).
    var kick = function () { pullAll(true); };
    if (window.requestIdleCallback) requestIdleCallback(kick, { timeout: 4000 });
    else setTimeout(kick, 2500);
    // 다른 탭/창에서 변경 → 화면 복귀 시 재동기화
    document.addEventListener('visibilitychange', function () { if (!document.hidden) pullAll(false); });
    window.addEventListener('focus', function () { pullAll(false); });
    setInterval(function () { if (!document.hidden) pullAll(false); }, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
