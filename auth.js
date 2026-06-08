'use strict';

/**
 * auth.js — Google OAuth 2.0 (Google Identity Services Token Model)
 *
 * 노출 인터페이스: window.Auth
 *   .login()               → Promise<void>
 *   .logout()              → void
 *   .getToken()            → string | null
 *   .isLoggedIn()          → boolean
 *   .onAuthChange(cb)      → void
 *   .tryRestoreSession()   → boolean
 *   .forceReauth()         → void  (403 등 스코프 오류 시 자동 재인증)
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

  /* ── 토큰 영속성 키 ──────────────────────────────────────────── */
  var _STORE_TOKEN   = 'asea_gtoken';
  var _STORE_EXPIRES = 'asea_gtoken_exp';
  var _STORE_SCOPES  = 'asea_gtoken_scopes'; // 저장 시 스코프 해시 함께 보관

  // 현재 CONFIG 스코프 목록을 정렬 후 단순 문자열로 (해시 대용)
  function _scopeKey() {
    try {
      return CONFIG.googleScopes.slice().sort().join('|');
    } catch (e) { return ''; }
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

  /* ── 내부 헬퍼 ──────────────────────────────────────────────── */

  function _clearToken() {
    _accessToken = null;
    if (_expireTimer) {
      clearTimeout(_expireTimer);
      _expireTimer = null;
    }
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
      _clearToken();
      if (_pendingResolve) { _pendingResolve(); _pendingResolve = null; }
      _notifyChange();
      return;
    }

    _clearToken();
    _accessToken = tokenResponse.access_token;

    // 만료 1분 전 자동 토큰 초기화 (기본 3600초)
    var expiresIn = ((tokenResponse.expires_in || 3600) - 60) * 1000;
    var expiresAt = Date.now() + expiresIn;
    _saveToken(_accessToken, expiresAt);
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
    if (_tokenClient) return;

    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId,
      scope: CONFIG.googleScopes.join(' '),
      callback: _handleTokenResponse,
    });
  }

  /* ── 공개 인터페이스 ─────────────────────────────────────────── */

  window.Auth = {
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

    logout: function () {
      if (_accessToken &&
          typeof google !== 'undefined' &&
          google.accounts && google.accounts.oauth2) {
        google.accounts.oauth2.revoke(_accessToken, function () {});
      }
      _clearToken();
      _notifyChange();
    },

    getToken: function () {
      return _accessToken;
    },

    isLoggedIn: function () {
      return _accessToken !== null;
    },

    onAuthChange: function (callback) {
      if (typeof callback === 'function') {
        _authCallbacks.push(callback);
      }
    },

    /**
     * F5 새로고침 후 저장된 토큰 복원.
     * - 토큰 만료 확인
     * - 저장 당시 스코프와 현재 스코프가 다르면 폐기 (스코프 변경 시 재로그인 강제)
     * @returns {boolean}
     */
    tryRestoreSession: function () {
      try {
        var ss     = sessionStorage;
        var ls     = localStorage;
        var token   = ss.getItem(_STORE_TOKEN)   || ls.getItem(_STORE_TOKEN);
        var expires = parseInt(ss.getItem(_STORE_EXPIRES) || ls.getItem(_STORE_EXPIRES) || '0', 10);
        var scopes  = ss.getItem(_STORE_SCOPES)  || ls.getItem(_STORE_SCOPES) || '';

        // 만료 확인
        if (!token || expires <= Date.now()) {
          _deleteStoredToken();
          return false;
        }

        // 스코프 변경 확인 — 다르면 구 토큰 폐기하고 재로그인
        var currentScopeKey = _scopeKey();
        if (scopes && currentScopeKey && scopes !== currentScopeKey) {
          _deleteStoredToken();
          return false; // tryAutoLogin이 새 토큰 요청
        }

        _accessToken = token;
        var remaining = expires - Date.now();
        _expireTimer = setTimeout(function () {
          _clearToken();
          _notifyChange();
        }, remaining);
        _notifyChange();
        return true;
      } catch (e) {}
      _deleteStoredToken();
      return false;
    },

    /**
     * API 403 등 스코프 오류 발생 시 호출.
     * 저장된 토큰 삭제 후 조용히 재인증 시도 (한 번만).
     */
    forceReauth: function () {
      if (window._aseaReauthPending) return; // 이미 진행 중
      window._aseaReauthPending = true;
      _deleteStoredToken();
      // 인메모리 토큰은 유지 (현재 세션은 일단 살림) — 재인증 후 갱신
      if (!_tokenClient) _initTokenClient();
      if (_tokenClient) {
        try {
          _tokenClient.requestAccessToken({ prompt: '' });
        } catch (e) {}
      }
      // 3초 후 플래그 해제 (재시도 가능하게)
      setTimeout(function () { window._aseaReauthPending = false; }, 3000);
    },
  };

  /* ── 초기화 타이밍 처리 ─────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initTokenClient);
  } else {
    _initTokenClient();
  }
  window.addEventListener('load', function () {
    if (!_tokenClient) _initTokenClient();
  });
})();
