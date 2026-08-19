'use strict';

/**
 * survey-auth.js — 설문지 페이지 전용 경량 Google 로그인
 *
 * 목적
 *  - 기존 auth.js 는 Calendar·Drive·Gmail·Sheets·Forms·Tasks 등 '민감(sensitive) 권한'을
 *    한꺼번에 요청한다. 그 상태로 OAuth 앱을 프로덕션 게시하려면 Google 검증이 필요하고,
 *    테스트 모드에서는 '테스터로 등록된 계정'만 로그인할 수 있다.
 *  - 설문지 페이지는 "설문 생성·조회"만 필요하므로 여기서는 forms.body·drive.metadata.readonly
 *    와 기본 식별용 email·profile 만 요청한다. → 메인 앱의 Calendar·Gmail·Sheets 스코프와 완전 분리.
 *
 * 인터페이스(window.Auth): auth.js 와 동일 시그니처로 노출 → survey.js/html 수정 불필요
 *   .login(opts)          → Promise<boolean>   (opts.chooseAccount=true 시 계정 선택 강제)
 *   .logout()             → void
 *   .getToken()           → string | null
 *   .isLoggedIn()         → boolean
 *   .onAuthChange(cb)     → void
 *   .reauth()             → Promise<string|null>
 *   .tryRestoreSession()  → boolean
 *
 * 저장 키는 메인 앱(asea_gtoken*)과 분리(asea_survey_gtoken*)하여 서로 간섭하지 않는다.
 * 의존성: config.js (CONFIG.googleClientId)
 */
(function () {
  // 설문 생성·조회에 필요한 최소 스코프만 요청
  var SCOPES = [
    'email',
    'profile',
    'https://www.googleapis.com/auth/forms.body',
    'https://www.googleapis.com/auth/forms.responses.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
  ].join(' ');

  var _accessToken   = null;
  var _expireTimer   = null;
  var _tokenClient   = null;
  var _authCallbacks = [];
  var _pendingResolve = null;
  var _isMainLogin   = false;

  var _STORE_TOKEN   = 'asea_survey_gtoken';
  var _STORE_EXPIRES = 'asea_survey_gtoken_exp';
  var _STORE_SCOPES  = 'asea_survey_gtoken_scopes';

  function _clientId() {
    try { return (typeof CONFIG !== 'undefined' && CONFIG.googleClientId) || ''; } catch (e) { return ''; }
  }

  function _saveToken(token, expiresAt) {
    try {
      sessionStorage.setItem(_STORE_TOKEN, token);
      sessionStorage.setItem(_STORE_EXPIRES, String(expiresAt));
      sessionStorage.setItem(_STORE_SCOPES, SCOPES);
      localStorage.setItem(_STORE_TOKEN, token);
      localStorage.setItem(_STORE_EXPIRES, String(expiresAt));
      localStorage.setItem(_STORE_SCOPES, SCOPES);
    } catch (e) {}
  }
  function _deleteStoredToken() {
    try {
      [sessionStorage, localStorage].forEach(function (s) {
        s.removeItem(_STORE_TOKEN); s.removeItem(_STORE_EXPIRES); s.removeItem(_STORE_SCOPES);
      });
    } catch (e) {}
  }
  function _clearToken() {
    _accessToken = null;
    if (_expireTimer) { clearTimeout(_expireTimer); _expireTimer = null; }
    _deleteStoredToken();
  }
  function _notifyChange() {
    var loggedIn = _accessToken !== null;
    for (var i = 0; i < _authCallbacks.length; i++) {
      try { _authCallbacks[i](loggedIn); } catch (e) {}
    }
  }

  function _handleTokenResponse(tokenResponse) {
    if (tokenResponse && tokenResponse.error) {
      var code = tokenResponse.error || '';
      var desc = tokenResponse.error_description || '';
      try { console.error('[survey-auth] token error:', code, desc, tokenResponse); } catch (e) {}
      if (!_isMainLogin) {
        if (_pendingResolve) { _pendingResolve(false); _pendingResolve = null; }
        return;
      }
      _clearToken();
      if (typeof window.aseaToast === 'function') {
        var msg = '로그인이 완료되지 않았습니다';
        if (code) msg += ' (' + code + (desc ? ': ' + desc : '') + ')';
        msg += '. 팝업 차단을 해제하고 본인 Google 계정으로 다시 시도해 주세요.';
        window.aseaToast(msg, 'error');
      }
      if (_pendingResolve) { _pendingResolve(false); _pendingResolve = null; }
      _isMainLogin = false;
      _notifyChange();
      return;
    }
    _clearToken();
    _accessToken = tokenResponse.access_token;
    var expiresIn = ((tokenResponse.expires_in || 3600) - 60) * 1000;
    var expiresAt = Date.now() + expiresIn;
    _saveToken(_accessToken, expiresAt);
    _expireTimer = setTimeout(function () { _silentRefresh(); }, expiresIn);
    if (_pendingResolve) { _pendingResolve(true); _pendingResolve = null; }
    _isMainLogin = false;
    _notifyChange();
  }

  function _reqOpts(base) {
    try {
      var h = localStorage.getItem('asea_user_email');
      if (h) base.hint = h;
    } catch (e) {}
    return base;
  }

  function _silentRefresh() {
    _initTokenClient();
    if (!_tokenClient) { _expireTimer = setTimeout(_silentRefresh, 30000); return; }
    _isMainLogin = false;
    _pendingResolve = null;
    try { _tokenClient.requestAccessToken(_reqOpts({ prompt: '' })); }
    catch (e) { _expireTimer = setTimeout(_silentRefresh, 30000); }
  }

  function _initTokenClient() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) return;
    if (_tokenClient) return;
    var cid = _clientId();
    if (!cid) return;
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cid,
      scope: SCOPES,
      callback: _handleTokenResponse,
    });
  }

  function _ensureClient() {
    _initTokenClient();
    if (_tokenClient) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var waited = 0;
      var iv = setInterval(function () {
        _initTokenClient();
        if (_tokenClient || waited >= 5000) { clearInterval(iv); resolve(!!_tokenClient); }
        waited += 100;
      }, 100);
    });
  }

  window.Auth = {
    login: function (opts) {
      var promptVal = (opts && opts.chooseAccount) ? 'select_account' : '';
      return _ensureClient().then(function (ready) {
        if (!ready) return Promise.reject(new Error('Google Identity Services가 아직 로드되지 않았습니다.'));
        return new Promise(function (resolve) {
          _isMainLogin = true;
          _pendingResolve = resolve;
          _tokenClient.requestAccessToken(_reqOpts({ prompt: promptVal }));
        });
      });
    },
    reauth: function () {
      return _ensureClient().then(function (ready) {
        if (!ready) return null;
        return new Promise(function (resolve) {
          _isMainLogin = false;
          _pendingResolve = function (ok) { resolve(ok ? _accessToken : null); };
          try { _tokenClient.requestAccessToken(_reqOpts({ prompt: '' })); }
          catch (e) { _pendingResolve = null; resolve(null); }
        });
      });
    },
    logout: function () {
      if (_accessToken && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        google.accounts.oauth2.revoke(_accessToken, function () {});
      }
      _clearToken();
      _notifyChange();
    },
    getToken:   function () { return _accessToken; },
    isLoggedIn: function () { return _accessToken !== null; },
    onAuthChange: function (cb) { if (typeof cb === 'function') _authCallbacks.push(cb); },
    tryRestoreSession: function () {
      try {
        var token   = sessionStorage.getItem(_STORE_TOKEN)   || localStorage.getItem(_STORE_TOKEN);
        var expires = parseInt(sessionStorage.getItem(_STORE_EXPIRES) || localStorage.getItem(_STORE_EXPIRES) || '0', 10);
        var scopes  = sessionStorage.getItem(_STORE_SCOPES)  || localStorage.getItem(_STORE_SCOPES) || '';
        if (!token || expires <= Date.now()) { _deleteStoredToken(); return false; }
        if (scopes && scopes !== SCOPES) { _deleteStoredToken(); return false; }
        _accessToken = token;
        var remaining = expires - Date.now();
        var refreshIn = Math.max(1000, remaining - 120000);
        _expireTimer = setTimeout(function () { _silentRefresh(); }, refreshIn);
        _notifyChange();
        return true;
      } catch (e) {}
      _deleteStoredToken();
      return false;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initTokenClient);
  } else {
    _initTokenClient();
  }
  window.addEventListener('load', function () { if (!_tokenClient) _initTokenClient(); });
})();
