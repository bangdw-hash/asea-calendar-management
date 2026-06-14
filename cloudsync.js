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

  // 공유할 키 (프리픽스 + 정확일치). 개인/기기 전용 키는 절대 포함하지 않는다.
  var PREFIXES = ['asea_budget_items_', 'asea_budget_exec_', 'asea_budget_caps_'];
  var EXACT = ['asea_weekly_reports', 'asea_weekly_weeks', 'asea_regulations', 'asea_survey_history', 'asea_budget_execs', 'asea_draft_limit'];
  // 공유 제외(개인/민감)
  var EXCLUDE = ['asea_budget_my_dept', 'asea_user_email', 'asea_is_admin', 'asea_anthropic_api_key', 'asea_gtoken', 'asea_draft_usage'];

  function isSynced(k) {
    if (!k || EXCLUDE.indexOf(k) >= 0) return false;
    if (EXACT.indexOf(k) >= 0) return true;
    for (var i = 0; i < PREFIXES.length; i++) { if (k.indexOf(PREFIXES[i]) === 0) return true; }
    return false;
  }

  /* ── setItem 후킹: 공유 키 쓰기를 서버로 디바운스 푸시 ── */
  var _origSet = localStorage.setItem.bind(localStorage);
  var _applying = false;
  var _pushTimers = {};
  localStorage.setItem = function (k, v) {
    _origSet(k, v);
    if (!_applying && isSynced(k)) schedulePush(k);
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
    return fetch(GAS() + '?action=kvList&prefix=' + encodeURIComponent(prefix) + '&_=' + Date.now())
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { return (j && j.ok && j.keys) || []; })
      .catch(function () { return []; });
  }
  function push(key, value) {
    var body = JSON.stringify({ action: 'kvSet', key: key, value: value == null ? (localStorage.getItem(key) || '') : value });
    return fetch(GAS(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body })
      .catch(function (e) { /* 오프라인: 다음 변경/새로고침 때 재시도 */ });
  }

  /* ── 병합 ── */
  function ts(o) { return String((o && (o.updatedAt || o.confirmedAt || o.createdAt || o.addedAt || o.submittedAt)) || ''); }
  function mergeById(local, cloud) {
    var map = {}, order = [];
    function put(o) {
      if (!o || o.id == null) { var rk = '__' + order.length + Math.random(); map[rk] = o; order.push(rk); return; }
      var k = 'id:' + o.id;
      if (!(k in map)) order.push(k);
      if (!(k in map) || ts(o) >= ts(map[k])) map[k] = o;
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
    if (_pulling) return;
    var now = Date.now();
    if (!force && now - _lastPull < 15000) return;  // 과도호출 방지
    _pulling = true; _lastPull = now;

    var cloudKeys = {};
    var jobs = PREFIXES.map(function (p) { return kvList(p).then(function (ks) { ks.forEach(function (k) { cloudKeys[k] = 1; }); }); });
    Promise.all(jobs).then(function () {
      EXACT.forEach(function (k) { cloudKeys[k] = 1; });
      // 로컬에만 있는 공유 키도 업로드 대상에 포함
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
    }).catch(function () { _pulling = false; });
  }

  function start() {
    // 초기 동기화는 로그인/첫 화면 렌더 이후로 미뤄 시작 지연을 막는다(GAS는 1~3초 소요).
    var kick = function () { pullAll(true); };
    if (window.requestIdleCallback) requestIdleCallback(kick, { timeout: 4000 });
    else setTimeout(kick, 2500);
    // 다른 탭/창에서 변경 → 화면 복귀 시 재동기화
    document.addEventListener('visibilitychange', function () { if (!document.hidden) pullAll(false); });
    window.addEventListener('focus', function () { pullAll(false); });
    setInterval(function () { if (!document.hidden) pullAll(false); }, 60000);
    window.CloudSync = { pull: function () { pullAll(true); }, push: push, isSynced: isSynced };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
