'use strict';

/**
 * checkin.js — QR 입출입 체크인 로직
 *
 * 흐름:
 *  1. URL ?room=SPC001 파싱 → 공간 정보 로드 (Sheets API Key read)
 *  2. localStorage 기기 ID 확인
 *  3. 미등록 → 개인정보 동의 + 정보 입력 화면
 *  4. 등록됨 → 최근 기록 확인 → 입실/퇴실 버튼
 *  5. 기록 저장 → GAS 프록시 POST
 */
(function () {

  /* ─── 개인정보 동의 텍스트 v1 (법적 근거용, 버전 관리) ─── */
  var CONSENT_VERSION = 'v1';
  var CONSENT_TEXT =
    '수집 항목: 이름, 전화번호, 소속\n' +
    '수집 목적: 시설 입출입 기록 및 보안 관리\n' +
    '보유 기간: 수집일로부터 1년 후 파기\n' +
    '법적 근거: 개인정보보호법 제15조 제1항 제1호 (정보주체 동의)\n\n' +
    '위 개인정보 수집·이용에 동의하지 않을 권리가 있으나, ' +
    '동의 거부 시 본 시설 입출입 기록이 등록되지 않습니다.';

  /* ─── 상태 ─── */
  var _roomId   = '';
  var _roomName = '';
  var _roomInfo = null;
  var _user     = null;   // { id, name, phone, affiliation }
  var _lastLog  = null;   // 마지막 입출입 기록
  var _deviceId = '';

  /* ─── 설정 ─── */
  var PROXY_URL_KEY = 'asea_checkin_proxy_url';
  var USER_KEY      = 'asea_checkin_user';
  var DEVICE_KEY    = 'asea_checkin_device';

  /* ─── 유틸 ─── */
  function $(id) { return document.getElementById(id); }
  function show(id) { var el = $(id); if (el) el.hidden = false; }
  function hide(id) { var el = $(id); if (el) el.hidden = true; }
  function text(id, v) { var el = $(id); if (el) el.textContent = v; }

  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('ko-KR') + ' ' +
           String(d.getHours()).padStart(2,'0') + ':' +
           String(d.getMinutes()).padStart(2,'0');
  }

  function proxyUrl() {
    return localStorage.getItem(PROXY_URL_KEY) || '';
  }

  function getOrCreateDeviceId() {
    var id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = 'DEV_' + Date.now().toString(36).toUpperCase() + '_' + Math.random().toString(36).slice(2,6).toUpperCase();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function showError(msg) {
    var el = $('error-msg');
    if (!el) return;
    el.textContent = msg;
    el.className = 'error-msg show';
  }
  function clearError() {
    var el = $('error-msg');
    if (el) el.className = 'error-msg';
  }

  /* ─── API 호출 (읽기: Sheets API Key) ─── */
  var SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets/' + CONFIG.sheetsDbId;
  var _apiKey = '';

  function _getApiKey() {
    if (_apiKey) return _apiKey;
    // config에 apiKey 필드가 있으면 사용, 없으면 localStorage에서
    _apiKey = (typeof CONFIG.sheetsApiKey === 'string' ? CONFIG.sheetsApiKey : '') ||
              localStorage.getItem('asea_sheets_api_key') || '';
    return _apiKey;
  }

  async function _readSheet(sheetName) {
    var key = _getApiKey();
    if (!key) return [];
    var url = SHEETS_BASE + '/values/' + encodeURIComponent(sheetName) + '?key=' + key;
    var res = await fetch(url);
    if (!res.ok) return [];
    var json = await res.json();
    var rows = json.values || [];
    if (rows.length < 2) return [];
    var headers = rows[0];
    return rows.slice(1).map(function (r) {
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = r[i] || ''; });
      return obj;
    });
  }

  /* ─── GAS 프록시 POST (쓰기) ─── */
  async function _postToProxy(payload) {
    var url = proxyUrl();
    if (!url) throw new Error('체크인 서버가 설정되지 않았습니다. 관리자에게 문의하세요.');
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      var body = await res.text();
      throw new Error('서버 오류: ' + res.status + ' ' + body.slice(0, 80));
    }
    var json = await res.json();
    if (!json.ok) throw new Error(json.error || '저장 실패');
    return json;
  }

  /* ─── 화면 렌더링 ─── */
  function _showScreen(name) {
    ['screen-loading','screen-consent','screen-checkin','screen-result','screen-error-room']
      .forEach(function (id) { hide(id); });
    show('screen-' + name);
  }

  function _renderCheckinScreen() {
    _showScreen('checkin');
    text('ci-user-name', _user.name + ' 님');
    text('ci-user-sub', _user.affiliation + ' · ' + _user.phone);

    if (_lastLog && _lastLog.checkType === '입실') {
      // 마지막이 입실 → 퇴실 버튼 활성
      text('ci-last-status', '현재 입실 중');
      $('ci-last-status').className = 'status-badge in';
      text('ci-last-time', '입실 시각: ' + fmtTime(_lastLog.timestamp));
      $('btn-checkin').hidden  = true;
      $('btn-checkout').hidden = false;
    } else {
      // 마지막이 퇴실 or 기록 없음 → 입실 버튼 활성
      text('ci-last-status', _lastLog ? '이전 퇴실 완료' : '첫 방문');
      $('ci-last-status').className = 'status-badge ' + (_lastLog ? 'out' : 'none');
      text('ci-last-time', _lastLog ? '퇴실 시각: ' + fmtTime(_lastLog.timestamp) : '');
      $('btn-checkin').hidden  = false;
      $('btn-checkout').hidden = true;
    }
  }

  function _renderResult(checkType, ts) {
    _showScreen('result');
    $('res-icon').textContent = checkType === '입실' ? '✅' : '🚪';
    text('res-title', checkType === '입실' ? '입실 완료' : '퇴실 완료');
    text('res-room', _roomName);
    text('res-time', fmtTime(ts));
    text('res-user', _user.name + ' (' + _user.affiliation + ')');

    // 3초 후 체크인 화면 복귀
    setTimeout(function () { _renderCheckinScreen(); }, 4000);
  }

  /* ─── 초기화 ─── */
  async function _init() {
    _showScreen('loading');
    _deviceId = getOrCreateDeviceId();

    // URL 파라미터
    var params = new URLSearchParams(location.search);
    _roomId = params.get('room') || '';

    if (!_roomId) {
      _showScreen('error-room');
      text('err-room-msg', 'URL에 공간 정보가 없습니다. QR코드를 다시 스캔해 주세요.');
      return;
    }

    // 공간 정보 조회
    try {
      var spaces = await _readSheet('공간관리');
      _roomInfo = spaces.find(function (s) { return s.id === _roomId && s.status !== 'inactive'; });
    } catch (e) { _roomInfo = null; }

    if (!_roomInfo) {
      // API Key 없거나 공간 없음 — 공간명을 roomId로 표시하고 계속
      _roomName = _roomId;
    } else {
      _roomName = _roomInfo.name || _roomId;
    }

    // 헤더 표시
    text('room-name', _roomName);
    text('room-location', _roomInfo ? (_roomInfo.location || '') : '');

    // 기기 저장 사용자 확인
    try {
      var stored = localStorage.getItem(USER_KEY);
      if (stored) _user = JSON.parse(stored);
    } catch (e) { _user = null; }

    if (_user && _user.name) {
      // 마지막 입출입 기록 조회
      try {
        var logs = await _readSheet('입출입기록');
        var myLogs = logs.filter(function (l) {
          return l.deviceId === _deviceId && l.roomId === _roomId;
        }).sort(function (a, b) {
          return (b.timestamp || '').localeCompare(a.timestamp || '');
        });
        _lastLog = myLogs[0] || null;
      } catch (e) { _lastLog = null; }

      _renderCheckinScreen();
    } else {
      _showConsentScreen();
    }
  }

  /* ─── 동의 화면 ─── */
  function _showConsentScreen() {
    _showScreen('consent');
    text('consent-text', CONSENT_TEXT);
    $('consent-check').checked = false;
    $('btn-consent-next').disabled = true;
  }

  $('consent-check') && $('consent-check').addEventListener('change', function () {
    $('btn-consent-next').disabled = !this.checked;
  });

  $('btn-consent-next') && $('btn-consent-next').addEventListener('click', function () {
    if (!$('consent-check').checked) return;
    // 동의 화면에서 정보 입력 카드 보이기
    hide('consent-section');
    show('info-section');
  });

  /* ─── 정보 입력 제출 ─── */
  $('btn-info-submit') && $('btn-info-submit').addEventListener('click', async function () {
    clearError();
    var name  = ($('input-name').value || '').trim();
    var phone = ($('input-phone').value || '').trim();
    var affil = ($('input-affil').value || '').trim();

    if (!name)  { showError('이름을 입력해 주세요.'); return; }
    if (!phone) { showError('전화번호를 입력해 주세요.'); return; }
    if (!affil) { showError('소속을 입력해 주세요.'); return; }

    // 전화번호 간단 검증
    if (!/^[0-9\-+\s]{7,15}$/.test(phone)) {
      showError('올바른 전화번호를 입력해 주세요.'); return;
    }

    this.disabled = true;
    this.textContent = '저장 중...';

    var consentTs = new Date().toISOString();

    try {
      // GAS 프록시를 통해 사용자 등록
      await _postToProxy({
        action: 'addUser',
        name: name,
        phone: phone,
        affiliation: affil,
        deviceId: _deviceId,
        consentTimestamp: consentTs,
        consentTextVersion: CONSENT_VERSION,
      });

      _user = { name: name, phone: phone, affiliation: affil, consentAt: consentTs };
      localStorage.setItem(USER_KEY, JSON.stringify(_user));

      _lastLog = null;
      _renderCheckinScreen();
    } catch (e) {
      showError(e.message || '저장에 실패했습니다.');
      this.disabled = false;
      this.textContent = '입력 완료 →';
    }
  });

  /* ─── 입실/퇴실 버튼 ─── */
  async function _doCheckin(checkType) {
    var btn = checkType === '입실' ? $('btn-checkin') : $('btn-checkout');
    btn.disabled = true;
    btn.textContent = '기록 중...';
    clearError();

    var ts = new Date().toISOString();
    try {
      await _postToProxy({
        action: 'addLog',
        roomId: _roomId,
        roomName: _roomName,
        userName: _user.name,
        phone: _user.phone,
        affiliation: _user.affiliation,
        checkType: checkType,
        timestamp: ts,
        deviceId: _deviceId,
        consentTimestamp: _user.consentAt || ts,
        consentTextVersion: CONSENT_VERSION,
      });
      _lastLog = { checkType: checkType, timestamp: ts };
      _renderResult(checkType, ts);
    } catch (e) {
      showError(e.message || '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      btn.disabled = false;
      btn.textContent = checkType === '입실' ? '✅ 입실' : '🚪 퇴실';
    }
  }

  $('btn-checkin')  && $('btn-checkin').addEventListener('click',  function () { _doCheckin('입실'); });
  $('btn-checkout') && $('btn-checkout').addEventListener('click', function () { _doCheckin('퇴실'); });

  /* ─── 다른 사람으로 변경 ─── */
  $('btn-change-user') && $('btn-change-user').addEventListener('click', function () {
    if (!confirm('다른 사람으로 변경하시겠습니까? 현재 기기의 사용자 정보가 초기화됩니다.')) return;
    localStorage.removeItem(USER_KEY);
    _user = null;
    _showConsentScreen();
  });

  /* ─── 오프라인 감지 ─── */
  function _checkOnline() {
    var el = $('offline-notice');
    if (!el) return;
    el.className = navigator.onLine ? 'offline-notice' : 'offline-notice show';
  }
  window.addEventListener('online',  _checkOnline);
  window.addEventListener('offline', _checkOnline);
  _checkOnline();

  /* ─── 시작 ─── */
  _init();

})();
