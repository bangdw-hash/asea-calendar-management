'use strict';

/**
 * assessment-auth.js — 자가진단 페이지 전용 Google 로그인 (Supabase Auth 세션 기반)
 *
 * 이전 버전은 Google OAuth 액세스 토큰만으로 "이 사람이 이 이메일이다"라고 앱이 스스로
 * 주장하는 방식이었다. DB(Supabase) 입장에서는 요청자가 누구인지 전혀 검증할 수 없어,
 * 공개 anon key만 있으면 관리자 화면을 거치지 않고도 전체 데이터를 직접 읽고 쓸 수 있었다.
 *
 * 이 버전은 Google의 ID 토큰(신원 증명 JWT)을 받아 supabase.auth.signInWithIdToken()으로
 * 실제 Supabase 로그인 세션을 생성한다. 이후 CloudForms.save()/list()가 이 세션으로
 * 자동 인증되므로, DB의 RLS 정책이 auth.jwt()로 요청자의 신원을 검증할 수 있게 된다.
 *
 * 필요 조건(운영자 1회 설정): Supabase 프로젝트 → Authentication → Providers → Google
 * 활성화 + 이 앱과 동일한 Google OAuth 클라이언트 ID를 "Authorized Client IDs"에 등록.
 * 이 설정이 안 되어 있으면 로그인 시도 시 안내 메시지가 표시된다.
 *
 * 인터페이스(window.Auth) — assessment.js/html에서 사용:
 *   .renderButton(containerId, opts?)  → 해당 DOM에 Google 공식 로그인 버튼을 렌더링
 *   .logout()                          → void
 *   .getProfile()                      → { email, name, picture } | null
 *   .isLoggedIn()                      → boolean
 *   .onAuthChange(cb)                  → cb(loggedIn, profile)
 *   .tryRestoreSession()               → 저장된 세션 복원 시도(결과는 onAuthChange로 통지)
 *
 * 의존성: config.js(CONFIG.googleClientId), cloudforms.js(window.CloudForms — Supabase 클라이언트 보유)
 */
(function () {
  var _initialized = false;
  var _authCallbacks = [];
  var _currentProfile = null;   // { email, name, picture }

  function _clientId() {
    // config.js는 `const CONFIG`(전역 렉시컬 바인딩)으로 선언되므로 window.CONFIG로는
    // 접근되지 않는다. 전역 식별자 CONFIG를 직접 참조한다.
    try { return (typeof CONFIG !== 'undefined' && CONFIG.googleClientId) || ''; } catch (e) { return ''; }
  }

  // 자가진단 페이지는 app.js/work.js를 로드하지 않아 window.aseaToast가 없는 경우가 많다.
  // 그런 경우에도 로그인 오류 같은 중요한 메시지는 반드시 화면에 보여야 하므로,
  // assessment.js가 쓰는 것과 같은 .asm-toast 스타일로 자체 폴백을 둔다.
  function _toast(msg, type) {
    if (typeof window.aseaToast === 'function') { window.aseaToast(msg, type || 'info'); return; }
    try {
      var t = document.createElement('div');
      t.className = 'asm-toast asm-toast-' + (type || 'info');
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function () { t.classList.add('show'); }, 10);
      setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 3200);
    } catch (e) {}
  }

  function _extend(base, extra) {
    var out = {}, k;
    for (k in base) if (base.hasOwnProperty(k)) out[k] = base[k];
    if (extra) for (k in extra) if (extra.hasOwnProperty(k)) out[k] = extra[k];
    return out;
  }

  // Supabase user 객체(Google ID 토큰 클레임에서 채워짐) → 화면 표시용 프로필로 변환
  function _profileFromUser(user) {
    if (!user) return null;
    var md = user.user_metadata || {};
    return {
      email: user.email || md.email || '',
      name: md.full_name || md.name || '',
      picture: md.avatar_url || md.picture || ''
    };
  }

  // Google ID 토큰(JWT)의 payload(신원 클레임)만 직접 디코드 — 서명 검증은 하지 않는다.
  // 이 값은 오직 "Supabase 로그인 세션이 아직 준비되지 않았을 때의 화면 표시용 임시 식별"에만
  // 쓰이고, DB 접근 권한(RLS)에는 전혀 영향을 주지 않는다(권한은 오직 실제 Supabase 세션 여부로 결정됨).
  function _decodeIdTokenClaims(idToken) {
    try {
      var parts = String(idToken).split('.');
      if (parts.length < 2) return null;
      var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var json = decodeURIComponent(atob(b64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  function _notify(loggedIn, profile) {
    for (var i = 0; i < _authCallbacks.length; i++) {
      try { _authCallbacks[i](loggedIn, profile); } catch (e) {}
    }
  }

  // Google 로그인 버튼(자체 팝업 포함)이 성공하면 GIS가 이 콜백에 ID 토큰(JWT)을 전달한다.
  //
  // 여기서 두 가지 일이 일어난다.
  // ① ID 토큰 자체의 신원 클레임(email 등)으로 즉시 로그인 처리 — Supabase 세션이
  //    수립되었는지와 무관하게 항상 동작한다. 운영자가 Supabase 대시보드에서
  //    "Google 로그인 제공자"를 아직 활성화하지 않은 과도기에도 로그인이 끊기지 않게 하기 위함.
  // ② 동시에 supabase.auth.signInWithIdToken()으로 실제 로그인 세션 수립을 시도한다.
  //    성공하면(=위 대시보드 설정이 되어 있으면) onAuthStateChange가 SIGNED_IN을 통지해
  //    같은 프로필로 한 번 더 갱신되며, 이때부터 CloudForms 요청이 검증된 사용자로 인증된다.
  //    실패해도 ①의 로그인은 이미 되어 있으므로 일반 사용자에게는 오류를 보이지 않고,
  //    관리자 계정에 한해 설정이 필요하다는 안내만 띄운다.
  function _handleCredential(response) {
    if (!response || !response.credential) return;
    var claims = _decodeIdTokenClaims(response.credential);
    if (!claims || !claims.email) {
      _toast('로그인 정보를 확인하지 못했습니다. 다시 시도해 주세요.', 'error');
      return;
    }
    _currentProfile = { email: claims.email, name: claims.name || '', picture: claims.picture || '' };
    _notify(true, _currentProfile);

    if (!(window.CloudForms && CloudForms.ready() && CloudForms.signInWithIdToken)) return;
    CloudForms.signInWithIdToken(response.credential).then(function (r) {
      if (r.ok) return;
      try { console.warn('[assessment-auth] Supabase 세션 수립 실패(신원 확인 로그인 자체는 정상 동작):', r.err); } catch (e) {}
      // 관리자 계정에 한해서만, 이 과도기 상태(대시보드 설정 필요)를 알려준다.
      if (claims.email === 'bangdw@gmail.com' && r.err && /provider is not enabled/i.test(r.err)) {
        _toast('관리자 안내: Supabase에서 Google 로그인 제공자가 아직 활성화되지 않았습니다. 대시보드 설정이 필요합니다(직원 로그인 자체는 정상 동작 중).', 'error');
      }
    });
  }

  function _initGis() {
    if (_initialized) return;
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) return;
    var cid = _clientId();
    if (!cid) return;
    google.accounts.id.initialize({
      client_id: cid,
      callback: _handleCredential,
      // 이전에 로그인했던 사용자는 재방문 시 클릭 없이 자동 재로그인되도록 시도한다
      // (Supabase 세션이 아직 없는 과도기에는 새로고침마다 다시 로그인해야 하는 부담을 줄여준다).
      auto_select: true,
      itp_support: true
    });
    _initialized = true;
  }

  function _ensureGis() {
    _initGis();
    if (_initialized) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var waited = 0;
      var iv = setInterval(function () {
        _initGis();
        if (_initialized || waited >= 6000) { clearInterval(iv); resolve(_initialized); }
        waited += 100;
      }, 100);
    });
  }

  window.Auth = {
    // 로그인 화면의 지정된 컨테이너에 Google 공식 버튼을 렌더링한다.
    // 클릭~계정 선택~콜백까지 전부 Google이 담당하며, 로그인 성공 시 onAuthChange(true, profile)로 통지된다.
    renderButton: function (containerId, opts) {
      _ensureGis().then(function (ready) {
        var el = document.getElementById(containerId);
        if (!ready || !el) return;
        el.innerHTML = '';
        google.accounts.id.renderButton(el, _extend({
          type: 'standard', theme: 'outline', size: 'large',
          text: 'signin_with', shape: 'pill', logo_alignment: 'left', width: 320
        }, opts));
      });
    },
    logout: function () {
      if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        try { google.accounts.id.disableAutoSelect(); } catch (e) {}
      }
      if (window.CloudForms && CloudForms.signOut) CloudForms.signOut().catch(function () {});
      // 세션 제거 결과는 아래 onAuthStateChange 구독이 SIGNED_OUT 이벤트로 통지한다.
    },
    getProfile:  function () { return _currentProfile; },
    isLoggedIn:  function () { return !!_currentProfile; },
    onAuthChange: function (cb) { if (typeof cb === 'function') _authCallbacks.push(cb); },
    // 저장된 Supabase 세션 복원을 시도하고, 이후의 로그인/로그아웃/토큰갱신까지 계속 구독한다.
    // supabase-js는 구독 직후 현재 세션 상태를 'INITIAL_SESSION' 이벤트로 즉시 한 번 전달하므로
    // 별도의 동기 반환값 없이 onAuthChange 콜백으로 결과가 통지된다.
    tryRestoreSession: function () {
      if (!(window.CloudForms && CloudForms.ready() && CloudForms.onAuthStateChange)) {
        _currentProfile = null;
        _notify(false, null);
        return;
      }
      CloudForms.onAuthStateChange(function (event, session) {
        if (session && session.user) {
          _currentProfile = _profileFromUser(session.user);
          _notify(true, _currentProfile);
        } else {
          _currentProfile = null;
          _notify(false, null);
        }
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initGis);
  } else {
    _initGis();
  }
  window.addEventListener('load', function () { if (!_initialized) _initGis(); });
})();
