'use strict';

/**
 * auth.js — Google OAuth 2.0 (Google Identity Services Token Model)
 *
 * 노출 인터페이스: window.Auth
 *   .login()          → Promise<void>
 *   .logout()         → void
 *   .getToken()       → string | null
 *   .isLoggedIn()     → boolean
 *   .onAuthChange(cb) → void
 *
 * 의존성: config.js (CONFIG.googleClientId, CONFIG.googleScopes)
 * GIS 스크립트: https://accounts.google.com/gsi/client (index.html에서 async 로드)
 */
(function () {
  var _accessToken      = null;
  var _expireTimer      = null;
  var _tokenClient      = null;
  var _authCallbacks    = [];
  var _pendingResolve   = null;

  /* ── 내부 헬퍼 ──────────────────────────────────────────────── */

  function _clearToken() {
    _accessToken = null;
    if (_expireTimer) {
      clearTimeout(_expireTimer);
      _expireTimer = null;
    }
  }

  function _notifyChange() {
    var loggedIn = _accessToken !== null;
    for (var i = 0; i < _authCallbacks.length; i++) {
      try { _authCallbacks[i](loggedIn); } catch (e) {}
    }
  }

  function _handleTokenResponse(tokenResponse) {
    if (tokenResponse && tokenResponse.error) {
      _clearToken();
      if (_pendingResolve) { _pendingResolve(); _pendingResolve = null; }
      _notifyChange();
      return;
    }

    _clearToken();
    _accessToken = tokenResponse.access_token;

    // 만료 1분 전 자동 토큰 초기화 (기본 3600초)
    var expiresIn = ((tokenResponse.expires_in || 3600) - 60) * 1000;
    _expireTimer = setTimeout(function () {
      _clearToken();
      _notifyChange();
    }, expiresIn);

    if (_pendingResolve) { _pendingResolve(); _pendingResolve = null; }
    _notifyChange();
  }

  function _initTokenClient() {
    if (typeof google === 'undefined' ||
        !google.accounts ||
        !google.accounts.oauth2) {
      return;
    }
    if (_tokenClient) return; // 이미 초기화됨

    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId,
      scope: CONFIG.googleScopes.join(' '),
      callback: _handleTokenResponse,
    });
  }

  /* ── 공개 인터페이스 ─────────────────────────────────────────── */

  window.Auth = {
    /**
     * Google OAuth 2.0 팝업으로 로그인.
     * 성공 또는 실패(닫기) 후 Promise resolve.
     */
    login: function () {
      if (!_tokenClient) _initTokenClient();
      if (!_tokenClient) {
        return Promise.reject(new Error('Google Identity Services가 아직 로드되지 않았습니다.'));
      }
      return new Promise(function (resolve) {
        _pendingResolve = resolve;
        _tokenClient.requestAccessToken({ prompt: '' });
      });
    },

    /**
     * 로그아웃 — 액세스 토큰 폐기 및 초기화.
     */
    logout: function () {
      if (_accessToken &&
          typeof google !== 'undefined' &&
          google.accounts && google.accounts.oauth2) {
        google.accounts.oauth2.revoke(_accessToken, function () {});
      }
      _clearToken();
      _notifyChange();
    },

    /**
     * 현재 유효한 액세스 토큰 반환.
     * @returns {string|null}
     */
    getToken: function () {
      return _accessToken;
    },

    /**
     * 로그인 여부 반환.
     * @returns {boolean}
     */
    isLoggedIn: function () {
      return _accessToken !== null;
    },

    /**
     * 인증 상태 변경 콜백 등록.
     * @param {function(boolean): void} callback
     */
    onAuthChange: function (callback) {
      if (typeof callback === 'function') {
        _authCallbacks.push(callback);
      }
    },
  };

  /* ── 초기화 타이밍 처리 ─────────────────────────────────────── */
  // GIS 스크립트가 async 로드되므로 두 시점에서 초기화 시도
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initTokenClient);
  } else {
    _initTokenClient();
  }
  window.addEventListener('load', function () {
    if (!_tokenClient) _initTokenClient();
  });
})();
