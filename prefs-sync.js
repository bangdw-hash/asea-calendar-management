'use strict';
/* prefs-sync.js — 계정별 개인 설정을 Supabase(user_prefs)에 동기화 → 기기가 달라도 같은 설정
   · 인증: Google 액세스 토큰을 Edge Function(user-prefs)이 서버에서 검증해 계정(email)을 확정
   · 대상: 기본 캘린더(+체크), 부서·캘린더 순서, 창 자석 설정, 창 위치
   · 병합: 항목별 최종 수정시각(t)이 더 새로운 쪽이 이김. 로컬(localStorage)이 캐시 역할 */
(function () {
  var URL_ = 'https://zbpeyklwpotjyveipzxd.supabase.co/functions/v1/user-prefs';
  var timer = null, running = null, rerun = false;

  function H() { return window.EventHooks; }
  function email() {
    var h = H(), e = (h && h.S && h.S.userEmail) || '';
    if (!e) { try { e = localStorage.getItem('asea_user_email') || ''; } catch (x) {} }
    return String(e).trim().toLowerCase();
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function jget(k) { try { return JSON.parse(lsGet(k) || 'null'); } catch (e) { return null; } }
  function tkey() { return 'asea_pref_t:' + email(); }

  /* 로컬 값 읽기/쓰기 (event-ext·order-ext가 쓰는 기존 localStorage 키와 동일) */
  var map = {
    defcals: { key: function (em) { return 'asea_ev_defcals:' + em; } },
    order:   { key: function (em) { return 'asea_order:' + em; } },
    magnet:  { key: function (em) { return 'asea_ev_magnet:' + em; } },
    pos:     { key: function (em) { return 'asea_ev_pos:' + em; } },
  };
  function readLocal(k) {
    var em = email(), v = lsGet(map[k].key(em));
    if (v == null) return null;
    var t = (k === 'defcals' || k === 'order') ? ((jget(map[k].key(em)) || {}).t || 0) : ((jget(tkey()) || {})[k] || 0);
    if (k === 'defcals' || k === 'order') return jget(map[k].key(em));
    if (k === 'magnet') return { t: t, on: v !== '0' };
    var p = jget(map[k].key(em)); return p ? { t: t, x: p.x, y: p.y } : null;
  }
  function writeLocal(k, o) {
    var em = email();
    if (k === 'defcals' || k === 'order') {
      lsSet(map[k].key(em), JSON.stringify(o));
      try { if (typeof CONFIG !== 'undefined') CONFIG[k === 'defcals' ? 'eventDefaultCals' : 'eventOrder'] = o; } catch (e) {}
      return;
    }
    var tm = jget(tkey()) || {}; tm[k] = o.t || 0; lsSet(tkey(), JSON.stringify(tm));
    if (k === 'magnet') lsSet(map[k].key(em), o.on ? '1' : '0');
    else lsSet(map[k].key(em), JSON.stringify({ x: o.x, y: o.y }));
  }

  async function call(method, body) {
    var tok = (typeof Auth !== 'undefined' && Auth.getToken) ? Auth.getToken() : null;
    if (!tok) throw new Error('로그인이 필요합니다');
    var r = await fetch(URL_, {
      method: method,
      headers: { 'x-google-token': tok, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      var m = ''; try { m = (await r.json()).error; } catch (e) {}
      throw new Error('서버 응답 ' + r.status + (m ? ' (' + m + ')' : ''));
    }
    return r.json();
  }

  /* 서버와 병합: 새로운 쪽이 이김. 서버가 오래된 항목은 서버에 반영 */
  async function doSync() {
    var rem = (await call('GET')).data || {};
    var merged = {}, changedLocal = [], needPush = false;
    Object.keys(map).forEach(function (k) {
      var loc = readLocal(k), r = rem[k];
      var lt = (loc && loc.t) || 0, rt = (r && r.t) || 0;
      if (r && rt > lt) { writeLocal(k, r); merged[k] = r; changedLocal.push(k); }
      else if (loc && lt > rt) { merged[k] = loc; needPush = true; }
      else if (r) merged[k] = r;
      else if (loc) { merged[k] = loc; needPush = true; }
    });
    if (needPush) await call('PUT', { data: merged });
    if (changedLocal.length) {
      try { window.dispatchEvent(new CustomEvent('asea-prefs-synced', { detail: changedLocal })); } catch (e) {}
    }
    return { ok: true, pulled: changedLocal, pushed: needPush };
  }

  function sync() {
    if (running) { rerun = true; return running; }
    running = doSync().then(function (r) { return r; }, function (e) { return { ok: false, msg: e.message || String(e) }; })
      .then(function (r) { running = null; if (rerun) { rerun = false; sync(); } return r; });
    return running;
  }

  /* 로컬 변경 후 호출: 항목 시각을 갱신하고 잠시 뒤 서버와 동기화 */
  function push(k, now) {
    if (k === 'magnet' || k === 'pos') {
      var tm = jget(tkey()) || {}; tm[k] = now || Date.now(); lsSet(tkey(), JSON.stringify(tm));
    }
    return new Promise(function (resolve) {
      clearTimeout(timer);
      timer = setTimeout(function () { sync().then(resolve); }, 600);
    });
  }

  function init() {
    if (typeof Auth === 'undefined' || !Auth.onAuthChange) return;
    Auth.onAuthChange(function (loggedIn) {
      if (!loggedIn) return;
      var n = 0;                      // 이메일 확정(로그인 직후 사용자 정보 조회 완료)까지 대기
      var iv = setInterval(function () {
        if (email() || ++n > 50) {
          clearInterval(iv);
          if (email()) sync().then(function (r) {
            if (!r.ok && H()) H().toast('개인 설정 서버 동기화 실패: ' + r.msg, 'error');
          });
        }
      }, 300);
    });
  }

  window.PrefsSync = { sync: sync, push: push };
  init();   // 즉시 등록 (app.js가 DOMContentLoaded에서 세션을 복원하기 전에 구독해야 로그인 이벤트를 놓치지 않음)
})();
