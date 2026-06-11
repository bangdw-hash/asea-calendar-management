'use strict';

/**
 * auth.js — Google OAuth 2.0 (Google Identity Services Token Model)
 *
 * 노출 인터페이스: window.Auth
 *   .login()             → Promise<void>
 *   .logout()            → void
 *   .getToken()          → string | null
 *   .isLoggedIn()        → boolean
 *   .onAuthChange(cb)    → void
 *   .tryRestoreSession() → boolean
 *
 * 의존성: config.js (CONFIG.googleClientId, CONFIG.googleScopes)
 */
(function () {
  var _accessToken    = null;
  var _expireTimer    = null;
  var _tokenClient    = null;
  var _authCallbacks  = [];
  var _pendingResolve = null;
  var _isMainLogin    = false;  // 현재 requestAccessToken이 "메인 로그인"인지 여부

  /* ── 토큰 영속성 키 ──────────────────────────────────────────── */
  var _STORE_TOKEN   = 'asea_gtoken';
  var _STORE_EXPIRES = 'asea_gtoken_exp';
  var _STORE_SCOPES  = 'asea_gtoken_scopes';

  function _scopeKey() {
    try { return CONFIG.googleScopes.slice().sort().join('|'); } catch (e) { return ''; }
  }

  function _saveToken(token, expiresAt) {
    try {
      var sk = _scopeKey();
      sessionStorage.setItem(_STORE_TOKEN,   token);
      sessionStorage.setItem(_STORE_EXPIRES, String(expiresAt));
      sessionStorage.setItem(_STORE_SCOPES,  sk);
      localStorage.setItem(_STORE_TOKEN,     token);
      localStorage.setItem(_STORE_EXPIRES,   String(expiresAt));
      localStorage.setItem(_STORE_SCOPES,    sk);
    } catch (e) {}
  }

  function _deleteStoredToken() {
    try {
      [sessionStorage, localStorage].forEach(function (s) {
        s.removeItem(_STORE_TOKEN);
        s.removeItem(_STORE_EXPIRES);
        s.removeItem(_STORE_SCOPES);
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
      // ★ 메인 로그인 흐름이 아닌 경우(자동 재인증 시도 실패)는
      //   현재 세션을 건드리지 않는다 — 캘린더/UI 상태 보존
      if (!_isMainLogin) {
        if (_pendingResolve) { _pendingResolve(false); _pendingResolve = null; }
        return;
      }
      // 메인 로그인 실패 → 토큰 초기화
      _clearToken();
      if (_pendingResolve) { _pendingResolve(false); _pendingResolve = null; }
      _notifyChange();
      return;
    }

    _clearToken();
    _accessToken = tokenResponse.access_token;

    var expiresIn = ((tokenResponse.expires_in || 3600) - 60) * 1000;
    var expiresAt = Date.now() + expiresIn;
    _saveToken(_accessToken, expiresAt);
    _expireTimer = setTimeout(function () {
      _clearToken();
      _notifyChange();
    }, expiresIn);

    if (_pendingResolve) { _pendingResolve(true); _pendingResolve = null; }
    _isMainLogin = false;
    _notifyChange();
  }

  function _initTokenClient() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) return;
    if (_tokenClient) return;
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId,
      scope: CONFIG.googleScopes.join(' '),
      callback: _handleTokenResponse,
    });
  }

  /* ── 공개 인터페이스 ─────────────────────────────────────────── */
  window.Auth = {

    /** 사용자 클릭 로그인 — 팝업/계정 선택 */
    login: function () {
      if (!_tokenClient) _initTokenClient();
      if (!_tokenClient) return Promise.reject(new Error('Google Identity Services가 아직 로드되지 않았습니다.'));
      return new Promise(function (resolve) {
        _isMainLogin    = true;
        _pendingResolve = resolve;
        _tokenClient.requestAccessToken({ prompt: '' });
      });
    },

    /**
     * 무음 재인증 — 만료/무효 토큰을 팝업 없이 새로 발급 시도.
     * 성공 시 새 토큰(string), 실패 시 null 반환 (UI/세션은 건드리지 않음).
     */
    reauth: function () {
      if (!_tokenClient) _initTokenClient();
      if (!_tokenClient) return Promise.resolve(null);
      return new Promise(function (resolve) {
        _isMainLogin    = false;
        _pendingResolve = function (ok) { resolve(ok ? _accessToken : null); };
        try { _tokenClient.requestAccessToken({ prompt: '' }); }
        catch (e) { _pendingResolve = null; resolve(null); }
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

    onAuthChange: function (callback) {
      if (typeof callback === 'function') _authCallbacks.push(callback);
    },

    /**
     * F5 새로고침 후 저장된 토큰 복원.
     * 스코프 변경 감지 시 구 토큰 폐기 → false 반환 (tryAutoLogin이 재요청)
     */
    tryRestoreSession: function () {
      try {
        var token   = sessionStorage.getItem(_STORE_TOKEN)   || localStorage.getItem(_STORE_TOKEN);
        var expires = parseInt(sessionStorage.getItem(_STORE_EXPIRES) || localStorage.getItem(_STORE_EXPIRES) || '0', 10);
        var scopes  = sessionStorage.getItem(_STORE_SCOPES)  || localStorage.getItem(_STORE_SCOPES) || '';

        if (!token || expires <= Date.now()) { _deleteStoredToken(); return false; }

        // 스코프가 저장되어 있고 현재와 다르면 구 토큰 폐기
        var sk = _scopeKey();
        if (scopes && sk && scopes !== sk) { _deleteStoredToken(); return false; }

        _accessToken = token;
        var remaining = expires - Date.now();
        _expireTimer = setTimeout(function () { _clearToken(); _notifyChange(); }, remaining);
        _notifyChange();
        return true;
      } catch (e) {}
      _deleteStoredToken();
      return false;
    },
  };

  /* ── GIS 초기화 타이밍 ──────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initTokenClient);
  } else {
    _initTokenClient();
  }
  window.addEventListener('load', function () { if (!_tokenClient) _initTokenClient(); });
})();
