'use strict';

/**
 * survey-auth.js — 설문지 페이지 전용 2단계 Google 로그인
 *
 * [1단계] 기본 로그인 — email·profile (비민감 스코프)
 *   → Google OAuth 앱이 테스트 모드여도 '아무 Google 계정'이나 사전등록 없이 로그인 가능.
 *   → AI 생성, 편집기, 클라우드 편집 이력(Supabase) 기능 사용 가능.
 *
 * [2단계] Google Forms 연동 로그인 — forms.body·forms.responses.readonly·drive.metadata.readonly
 *   → 민감 스코프이므로 앱이 테스트 모드일 때는 '테스터 등록 계정'만 사용 가능.
 *   → 구글 드라이브에 폼 생성·목록 조회 기능 활성화.
 *   → 1단계 로그인 후 별도 버튼으로 추가 요청. 기본 로그인과 독립 저장.
 *
 * 인터페이스(window.Auth):
 *   .login(opts)              → Promise<boolean>  기본 로그인 (1단계)
 *   .logout()                 → void              1·2단계 모두 로그아웃
 *   .getToken()               → string|null       기본 토큰
 *   .isLoggedIn()             → boolean
 *   .onAuthChange(cb)         → void
 *   .reauth()                 → Promise<string|null>
 *   .tryRestoreSession()      → boolean
 *   .loginForms(opts)         → Promise<boolean>  Forms 연동 로그인 (2단계)
 *   .getFormsToken()          → string|null       Forms 스코프 토큰
 *   .isFormsLinked()          → boolean
 *   .logoutForms()            → void
 *   .onFormsAuthChange(cb)    → void
 *   .tryRestoreFormsSession() → boolean
 *
 * 저장 키: 기본 asea_survey_gtoken*, Forms 연동 asea_survey_forms_gtoken*
 * 의존성: config.js (CONFIG.googleClientId)
 */
(function () {
  var BASE_SCOPES  = 'email profile';
  var FORMS_SCOPES = [
    'email',
    'profile',
    'https://www.googleapis.com/auth/forms.body',
    'https://www.googleapis.com/auth/forms.responses.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
  ].join(' ');

  function _clientId() {
    try { return (typeof CONFIG !== 'undefined' && CONFIG.googleClientId) || ''; } catch (e) { return ''; }
  }

  /* ── 공통 토큰 저장 헬퍼 ─────────────────────────────── */
  function _makeStore(prefix, scopeStr) {
    var K = { token: prefix + '_gtoken', exp: prefix + '_gtoken_exp', sc: prefix + '_gtoken_scopes' };
    return {
      save: function (token, expiresAt) {
        try {
          [sessionStorage, localStorage].forEach(function (s) {
            s.setItem(K.token, token); s.setItem(K.exp, String(expiresAt)); s.setItem(K.sc, scopeStr);
          });
        } catch (e) {}
      },
      del: function () {
        try {
          [sessionStorage, localStorage].forEach(function (s) {
            s.removeItem(K.token); s.removeItem(K.exp); s.removeItem(K.sc);
          });
        } catch (e) {}
      },
      load: function () {
        try {
          var token   = sessionStorage.getItem(K.token)   || localStorage.getItem(K.token);
          var expires = parseInt(sessionStorage.getItem(K.exp) || localStorage.getItem(K.exp) || '0', 10);
          var scopes  = sessionStorage.getItem(K.sc)      || localStorage.getItem(K.sc) || '';
          if (!token || expires <= Date.now()) return null;
          if (scopes && scopes !== scopeStr) return null;
          return { token: token, remaining: expires - Date.now() };
        } catch (e) { return null; }
      },
    };
  }

  var _baseStore  = _makeStore('asea_survey',       BASE_SCOPES);
  var _formsStore = _makeStore('asea_survey_forms', FORMS_SCOPES);

  /* ── 기본(1단계) 로그인 상태 ─────────────────────────── */
  var _token        = null;
  var _expTimer     = null;
  var _client       = null;
  var _cbs          = [];
  var _pendingRes   = null;
  var _isMain       = false;

  /* ── Forms(2단계) 로그인 상태 ────────────────────────── */
  var _formsToken   = null;
  var _formsTimer   = null;
  var _formsClient  = null;
  var _formsCbs     = [];
  var _formsPending = null;
  var _formsMain    = false;

  function _reqOpts(base) {
    try { var h = localStorage.getItem('asea_user_email'); if (h) base.hint = h; } catch (e) {}
    return base;
  }

  /* ── 기본 클라이언트 ─────────────────────────────────── */
  function _initClient() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) return;
    if (_client) return;
    var cid = _clientId(); if (!cid) return;
    _client = google.accounts.oauth2.initTokenClient({
      client_id: cid, scope: BASE_SCOPES,
      callback: function (res) {
        if (res && res.error) {
          try { console.error('[survey-auth] base error:', res.error, res); } catch (e) {}
          if (!_isMain) { if (_pendingRes) { _pendingRes(false); _pendingRes = null; } return; }
          _token = null; if (_expTimer) { clearTimeout(_expTimer); _expTimer = null; } _baseStore.del();
          if (_pendingRes) { _pendingRes(false); _pendingRes = null; }
          _isMain = false; _notifyBase(); return;
        }
        if (_expTimer) clearTimeout(_expTimer);
        _token = res.access_token;
        var exp = ((res.expires_in || 3600) - 60) * 1000;
        _baseStore.save(_token, Date.now() + exp);
        _expTimer = setTimeout(_silentBase, exp);
        if (_pendingRes) { _pendingRes(true); _pendingRes = null; }
        _isMain = false; _notifyBase();
      },
    });
  }
  function _silentBase() {
    _initClient(); if (!_client) { _expTimer = setTimeout(_silentBase, 30000); return; }
    _isMain = false; _pendingRes = null;
    try { _client.requestAccessToken(_reqOpts({ prompt: '' })); }
    catch (e) { _expTimer = setTimeout(_silentBase, 30000); }
  }
  function _notifyBase() {
    var v = _token !== null;
    for (var i = 0; i < _cbs.length; i++) { try { _cbs[i](v); } catch (e) {} }
  }
  function _ensureClient(clientRef, initFn) {
    initFn();
    if (clientRef()) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var waited = 0;
      var iv = setInterval(function () {
        initFn();
        if (clientRef() || waited >= 5000) { clearInterval(iv); resolve(!!clientRef()); }
        waited += 100;
      }, 100);
    });
  }

  /* ── Forms 클라이언트 ────────────────────────────────── */
  function _initFormsClient() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) return;
    if (_formsClient) return;
    var cid = _clientId(); if (!cid) return;
    _formsClient = google.accounts.oauth2.initTokenClient({
      client_id: cid, scope: FORMS_SCOPES,
      callback: function (res) {
        if (res && res.error) {
          try { console.error('[survey-auth] forms error:', res.error, res); } catch (e) {}
          if (!_formsMain) { if (_formsPending) { _formsPending(false); _formsPending = null; } return; }
          _formsToken = null; if (_formsTimer) { clearTimeout(_formsTimer); _formsTimer = null; } _formsStore.del();
          if (_formsPending) { _formsPending(false); _formsPending = null; }
          _formsMain = false; _notifyForms(); return;
        }
        if (_formsTimer) clearTimeout(_formsTimer);
        _formsToken = res.access_token;
        var exp = ((res.expires_in || 3600) - 60) * 1000;
        _formsStore.save(_formsToken, Date.now() + exp);
        _formsTimer = setTimeout(_silentForms, exp);
        if (_formsPending) { _formsPending(true); _formsPending = null; }
        _formsMain = false; _notifyForms();
      },
    });
  }
  function _silentForms() {
    _initFormsClient(); if (!_formsClient) { _formsTimer = setTimeout(_silentForms, 30000); return; }
    _formsMain = false; _formsPending = null;
    try { _formsClient.requestAccessToken(_reqOpts({ prompt: '' })); }
    catch (e) { _formsTimer = setTimeout(_silentForms, 30000); }
  }
  function _notifyForms() {
    var v = _formsToken !== null;
    for (var i = 0; i < _formsCbs.length; i++) { try { _formsCbs[i](v); } catch (e) {} }
  }

  /* ── 공개 인터페이스 ─────────────────────────────────── */
  window.Auth = {
    /* 1단계: 기본 로그인 (email+profile, 누구나 가능) */
    login: function (opts) {
      var p = (opts && opts.chooseAccount) ? 'select_account' : '';
      return _ensureClient(function () { return _client; }, _initClient).then(function (ok) {
        if (!ok) return Promise.reject(new Error('Google Identity Services가 아직 로드되지 않았습니다.'));
        return new Promise(function (resolve) { _isMain = true; _pendingRes = resolve; _client.requestAccessToken(_reqOpts({ prompt: p })); });
      });
    },
    reauth: function () {
      return _ensureClient(function () { return _client; }, _initClient).then(function (ok) {
        if (!ok) return null;
        return new Promise(function (resolve) {
          _isMain = false; _pendingRes = function (s) { resolve(s ? _token : null); };
          try { _client.requestAccessToken(_reqOpts({ prompt: '' })); } catch (e) { _pendingRes = null; resolve(null); }
        });
      });
    },
    logout: function () {
      if (_token && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(_token, function () {});
      _token = null; if (_expTimer) { clearTimeout(_expTimer); _expTimer = null; } _baseStore.del();
      // Forms 토큰도 함께 해제
      if (_formsToken && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(_formsToken, function () {});
      _formsToken = null; if (_formsTimer) { clearTimeout(_formsTimer); _formsTimer = null; } _formsStore.del();
      _notifyBase(); _notifyForms();
    },
    getToken:   function () { return _token; },
    isLoggedIn: function () { return _token !== null; },
    onAuthChange: function (cb) { if (typeof cb === 'function') _cbs.push(cb); },
    tryRestoreSession: function () {
      var d = _baseStore.load(); if (!d) { _baseStore.del(); return false; }
      _token = d.token;
      _expTimer = setTimeout(_silentBase, Math.max(1000, d.remaining - 120000));
      _notifyBase(); return true;
    },

    /* 2단계: Google Forms 연동 (forms.body + drive, 테스터 계정 필요) */
    loginForms: function (opts) {
      var p = (opts && opts.chooseAccount) ? 'select_account' : '';
      return _ensureClient(function () { return _formsClient; }, _initFormsClient).then(function (ok) {
        if (!ok) return Promise.reject(new Error('Google Identity Services가 아직 로드되지 않았습니다.'));
        return new Promise(function (resolve) { _formsMain = true; _formsPending = resolve; _formsClient.requestAccessToken(_reqOpts({ prompt: p })); });
      });
    },
    logoutForms: function () {
      if (_formsToken && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(_formsToken, function () {});
      _formsToken = null; if (_formsTimer) { clearTimeout(_formsTimer); _formsTimer = null; } _formsStore.del();
      _notifyForms();
    },
    getFormsToken:   function () { return _formsToken; },
    isFormsLinked:   function () { return _formsToken !== null; },
    onFormsAuthChange: function (cb) { if (typeof cb === 'function') _formsCbs.push(cb); },
    tryRestoreFormsSession: function () {
      var d = _formsStore.load(); if (!d) { _formsStore.del(); return false; }
      _formsToken = d.token;
      _formsTimer = setTimeout(_silentForms, Math.max(1000, d.remaining - 120000));
      _notifyForms(); return true;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { _initClient(); _initFormsClient(); });
  } else {
    _initClient(); _initFormsClient();
  }
  window.addEventListener('load', function () { if (!_client) _initClient(); if (!_formsClient) _initFormsClient(); });
})();
