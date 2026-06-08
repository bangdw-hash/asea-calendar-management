'use strict';

/**
 * checkin.js — QR 입출입 자동 체크인 로직
 *
 * 스캔 자동 판정:
 *  - 오늘 입실 기록 없음 or 마지막이 퇴실 → 입실 등록
 *  - 마지막 입실 후 30분 이내 재스캔 → "이미 등록" (중복, 저장 안 함)
 *  - 마지막 입실 후 30분 초과 → 퇴실 등록
 */
(function () {

  var CONSENT_VERSION = 'v1';
  var CONSENT_TEXT =
    '수집 항목: 이름, 전화번호, 소속\n' +
    '수집 목적: 시설 입출입 기록 및 보안 관리\n' +
    '보유 기간: 수집일로부터 1년 후 파기\n' +
    '법적 근거: 개인정보보호법 제15조 제1항 제1호 (정보주체 동의)\n\n' +
    '위 개인정보 수집·이용에 동의하지 않을 권리가 있으나, ' +
    '동의 거부 시 본 시설 입출입 기록이 등록되지 않습니다.';

  var DUPLICATE_MINUTES = 30;   // 분 이내 재스캔 → 중복 처리

  var _roomId   = '';
  var _roomName = '';
  var _roomInfo = null;
  var _user     = null;
  var _lastLog  = null;
  var _deviceId = '';

  var PROXY_URL_KEY = 'asea_checkin_proxy_url';
  var USER_KEY      = 'asea_checkin_user';
  var DEVICE_KEY    = 'asea_checkin_device';

  function $(id) { return document.getElementById(id); }
  function show(id) { var el = $(id); if (el) el.hidden = false; }
  function hide(id) { var el = $(id); if (el) el.hidden = true; }
  function text(id, v) { var el = $(id); if (el) el.textContent = v; }

  /* 시:분:초 포맷 */
  function fmtHMS(d) {
    return String(d.getHours()).padStart(2,'0') + ':' +
           String(d.getMinutes()).padStart(2,'0') + ':' +
           String(d.getSeconds()).padStart(2,'0');
  }
  /* 날짜 + 시:분:초 포맷 */
  function fmtFull(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.getFullYear() + '년 ' +
           (d.getMonth()+1) + '월 ' +
           d.getDate() + '일 ' +
           fmtHMS(d);
  }

  function proxyUrl() { return localStorage.getItem(PROXY_URL_KEY) || ''; }

  function getOrCreateDeviceId() {
    var id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = 'DEV_' + Date.now().toString(36).toUpperCase() + '_' +
           Math.random().toString(36).slice(2,6).toUpperCase();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  /* ── API (Sheets 읽기) ── */
  var SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets/' + CONFIG.sheetsDbId;
  var _apiKey = '';

  function _getApiKey() {
    if (_apiKey) return _apiKey;
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

  /* ── GAS 프록시 POST ── */
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
      throw new Error('서버 오류: ' + res.status + ' ' + body.slice(0,80));
    }
    var json = await res.json();
    if (!json.ok) throw new Error(json.error || '저장 실패');
    return json;
  }

  /* ── 화면 전환 ── */
  function _showScreen(name) {
    ['screen-loading','screen-consent','screen-confirm','screen-checkin','screen-result','screen-error-room']
      .forEach(function (id) { hide(id); });
    show('screen-' + name);
  }

  /* ── 자동 입실/퇴실 판정 ─────────────────────────────
   *  반환: { action: '입실'|'퇴실'|'중복', lastLog }
   *  - 오늘 날짜 기준 마지막 로그 확인
   *  - 중복: 마지막 입실로부터 DUPLICATE_MINUTES 이내 재스캔
   */
  function _judge() {
    var now = new Date();
    var todayStr = now.toISOString().slice(0, 10);

    // 오늘의 로그만 필터
    var todayLogs = (_lastLog ? [_lastLog] : []).concat(
      (window._allLogs || []).filter(function (l) {
        return l.deviceId === _deviceId &&
               l.roomId   === _roomId   &&
               (l.timestamp || '').slice(0, 10) === todayStr;
      })
    ).filter(function (l, i, arr) {
      // 중복 제거 (timestamp 기준 최신 1개)
      return arr.findIndex(function(x){ return x.timestamp === l.timestamp; }) === i;
    }).sort(function (a, b) {
      return (b.timestamp || '').localeCompare(a.timestamp || '');
    });

    var latest = todayLogs[0] || null;

    if (!latest) {
      return { action: '입실', lastLog: null };
    }

    var latestTime = new Date(latest.timestamp);
    var diffMin    = (now - latestTime) / 60000;

    if (latest.checkType === '퇴실') {
      // 마지막이 퇴실 → 재입실
      return { action: '입실', lastLog: latest };
    }

    // 마지막이 입실
    if (diffMin < DUPLICATE_MINUTES) {
      return { action: '중복', lastLog: latest };
    } else {
      return { action: '퇴실', lastLog: latest };
    }
  }

  /* ── 결과 화면 렌더 ── */
  function _renderResult(type, ts, dupLog) {
    _showScreen('result');
    var d = new Date(ts);

    if (type === '중복') {
      var origD = new Date(dupLog.timestamp);
      var diffMin = Math.floor((d - origD) / 60000);
      $('res-icon').textContent    = 'ℹ️';
      $('res-icon').style.color    = '#f57c00';
      text('res-title', '입실이 이미 등록되어 있습니다');
      text('res-desc', '');

      var infoEl = $('res-info-box');
      if (infoEl) {
        infoEl.hidden = false;
        infoEl.innerHTML =
          '<div class="res-info-row">' +
            '<span class="res-info-label">입실 등록 시각</span>' +
            '<span class="res-info-val">' + fmtFull(dupLog.timestamp) + '</span>' +
          '</div>' +
          '<div class="res-info-row">' +
            '<span class="res-info-label">경과 시간</span>' +
            '<span class="res-info-val">' + diffMin + '분 전 (' + DUPLICATE_MINUTES + '분 이내 중복)</span>' +
          '</div>' +
          '<div class="res-info-hint">퇴실하려면 ' +
            (DUPLICATE_MINUTES - diffMin) + '분 후 다시 스캔해 주세요.</div>';
      }
    } else {
      var isIn = (type === '입실');
      $('res-icon').textContent = isIn ? '✅' : '🚪';
      $('res-icon').style.color = '';
      text('res-title', isIn ? '입실이 등록되었습니다' : '퇴실이 등록되었습니다');

      var infoEl = $('res-info-box');
      if (infoEl) {
        infoEl.hidden = false;
        var rows = '';
        rows +=
          '<div class="res-info-row">' +
            '<span class="res-info-label">' + type + ' 시각</span>' +
            '<span class="res-info-val res-time-big">' + fmtFull(ts) + '</span>' +
          '</div>';
        if (!isIn && dupLog) {
          rows +=
            '<div class="res-info-row">' +
              '<span class="res-info-label">입실 시각</span>' +
              '<span class="res-info-val">' + fmtFull(dupLog.timestamp) + '</span>' +
            '</div>' +
            '<div class="res-info-row">' +
              '<span class="res-info-label">체류 시간</span>' +
              '<span class="res-info-val">' +
                Math.floor((new Date(ts) - new Date(dupLog.timestamp)) / 60000) + '분' +
              '</span>' +
            '</div>';
        }
        infoEl.innerHTML = rows;
      }
    }

    text('res-room', _roomName);
    text('res-user', _user.name + ' · ' + _user.affiliation);

    // 4초 후 체크인 화면 복귀
    setTimeout(function () { _renderCheckinScreen(); }, 4000);
  }

  /* ── 입실/퇴실 화면 렌더 ── */
  function _renderCheckinScreen() {
    _showScreen('checkin');
    hide('edit-info-form');
    text('ci-user-name', _user.name + ' 님');
    text('ci-user-sub', _user.affiliation + ' · ' + _user.phone);

    // 판정 결과로 상태 표시
    var judge = _judge();
    var statusEl = $('ci-status-box');
    if (statusEl) {
      if (judge.action === '중복' && judge.lastLog) {
        statusEl.className = 'ci-status-box in';
        statusEl.innerHTML =
          '<span class="ci-status-icon">✅</span>' +
          '<div>' +
            '<div class="ci-status-title">현재 입실 중</div>' +
            '<div class="ci-status-time">입실: ' + fmtFull(judge.lastLog.timestamp) + '</div>' +
          '</div>';
      } else if (judge.action === '퇴실' && judge.lastLog) {
        statusEl.className = 'ci-status-box standby';
        statusEl.innerHTML =
          '<span class="ci-status-icon">🕐</span>' +
          '<div>' +
            '<div class="ci-status-title">퇴실 스캔 대기 중</div>' +
            '<div class="ci-status-time">입실: ' + fmtFull(judge.lastLog.timestamp) + '</div>' +
          '</div>';
      } else {
        statusEl.className = 'ci-status-box ready';
        statusEl.innerHTML =
          '<span class="ci-status-icon">🔵</span>' +
          '<div>' +
            '<div class="ci-status-title">입실 준비</div>' +
            '<div class="ci-status-time">' +
              (judge.lastLog ? '최근 퇴실: ' + fmtFull(judge.lastLog.timestamp) : '오늘 방문 기록 없음') +
            '</div>' +
          '</div>';
      }
    }

    // 버튼 텍스트
    var btn = $('btn-scan');
    if (btn) {
      if (judge.action === '입실')   btn.textContent = '✅ 입실 등록';
      else if (judge.action === '퇴실') btn.textContent = '🚪 퇴실 등록';
      else btn.textContent = '📋 상태 확인';
    }
  }

  /* ── 초기화 ── */
  async function _init() {
    _showScreen('loading');
    _deviceId = getOrCreateDeviceId();

    var params = new URLSearchParams(location.search);
    _roomId = params.get('room') || '';

    if (!_roomId) {
      _showScreen('error-room');
      text('err-room-msg', 'URL에 공간 정보가 없습니다. QR코드를 다시 스캔해 주세요.');
      return;
    }

    // 공간 정보 로드 — ① 프록시 (API 키 불필요) ② Sheets 직독 ③ URL name 파라미터 ④ roomId
    if (proxyUrl()) {
      try {
        var gr = await _postToProxy({ action: 'getRoom', roomId: _roomId });
        if (gr && gr.room && gr.room.name) _roomInfo = gr.room;
      } catch (e) {}
    }
    if (!_roomInfo) {
      try {
        var spaces = await _readSheet('공간관리');
        _roomInfo = spaces.find(function (s) { return s.id === _roomId && s.status !== 'inactive'; });
      } catch (e) {}
    }

    var nameFromUrl = params.get('name') ? decodeURIComponent(params.get('name')) : '';
    _roomName = (_roomInfo && _roomInfo.name)
      ? _roomInfo.name
      : (nameFromUrl || _roomId);

    text('room-name', _roomName);
    text('room-location', _roomInfo ? (_roomInfo.location || '') : '');

    // 사용자 확인
    try {
      var stored = localStorage.getItem(USER_KEY);
      if (stored) _user = JSON.parse(stored);
    } catch (e) { _user = null; }

    if (_user && _user.name) {
      // 오늘 입출입 로그 로드 (판정에 사용)
      try {
        var todayStr = new Date().toISOString().slice(0, 10);
        var logs = await _readSheet('입출입기록');
        window._allLogs = logs;
        var myLogs = logs.filter(function (l) {
          return l.deviceId === _deviceId && l.roomId === _roomId;
        }).sort(function (a, b) {
          return (b.timestamp || '').localeCompare(a.timestamp || '');
        });
        _lastLog = myLogs[0] || null;
      } catch (e) { _lastLog = null; window._allLogs = []; }

      _renderCheckinScreen();
    } else {
      _showConsentScreen();
    }
  }

  /* ── 동의 화면 ── */
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
    hide('consent-section');
    show('info-section');
  });

  /* ── 임시 저장 (확인 전) ── */
  var _pendingUser = null;

  /* ── 정보 입력 제출 → 확인 화면으로 ── */
  $('btn-info-submit') && $('btn-info-submit').addEventListener('click', function () {
    var errEl = $('error-msg');
    if (errEl) errEl.className = 'error-msg';
    var name  = ($('input-name').value  || '').trim();
    var phone = ($('input-phone').value || '').trim();
    var affil = ($('input-affil').value || '').trim();

    function _e(msg) { if(errEl){errEl.textContent=msg;errEl.className='error-msg show';} }
    if (!name)  { _e('이름을 입력해 주세요.'); return; }
    if (!phone) { _e('전화번호를 입력해 주세요.'); return; }
    if (!affil) { _e('소속을 입력해 주세요.'); return; }
    if (!/^[0-9\-+\s]{7,15}$/.test(phone)) { _e('올바른 전화번호를 입력해 주세요.'); return; }

    // 임시 보관 후 확인 화면으로
    _pendingUser = { name: name, phone: phone, affiliation: affil };
    text('confirm-name',  name);
    text('confirm-phone', phone);
    text('confirm-affil', affil);
    var confErr = $('confirm-error');
    if (confErr) confErr.className = 'error-msg';
    _showScreen('confirm');
  });

  /* ── 확인 화면: 맞습니다 → 실제 저장 ── */
  $('btn-confirm-ok') && $('btn-confirm-ok').addEventListener('click', async function () {
    if (!_pendingUser) return;
    var confErr = $('confirm-error');
    if (confErr) confErr.className = 'error-msg';
    this.disabled = true; this.textContent = '등록 중...';

    var consentTs = new Date().toISOString();
    try {
      await _postToProxy({
        action: 'addUser',
        name: _pendingUser.name,
        phone: _pendingUser.phone,
        affiliation: _pendingUser.affiliation,
        deviceId: _deviceId,
        consentTimestamp: consentTs,
        consentTextVersion: CONSENT_VERSION,
      });
      _user = { name: _pendingUser.name, phone: _pendingUser.phone,
                affiliation: _pendingUser.affiliation, consentAt: consentTs };
      localStorage.setItem(USER_KEY, JSON.stringify(_user));
      _pendingUser = null;
      _lastLog = null; window._allLogs = [];
      _renderCheckinScreen();
    } catch (e) {
      if (confErr) { confErr.textContent = e.message || '등록에 실패했습니다.'; confErr.className = 'error-msg show'; }
      this.disabled = false; this.textContent = '✅ 맞습니다 — 등록 완료';
    }
  });

  /* ── 확인 화면: 다시 입력 → 입력 폼으로 복귀 ── */
  $('btn-confirm-back') && $('btn-confirm-back').addEventListener('click', function () {
    // 폼에 기존 입력값 유지
    if (_pendingUser) {
      $('input-name').value  = _pendingUser.name;
      $('input-phone').value = _pendingUser.phone;
      $('input-affil').value = _pendingUser.affiliation;
    }
    _showScreen('consent');
    hide('consent-section');
    show('info-section');
    setTimeout(function () { $('input-name').focus(); }, 100);
  });

  /* ── 메인 스캔 버튼 ── */
  $('btn-scan') && $('btn-scan').addEventListener('click', async function () {
    var judge = _judge();
    this.disabled = true;
    this.textContent = '처리 중...';

    var ts = new Date().toISOString();

    if (judge.action === '중복') {
      // 중복 — 저장 안 하고 안내만
      _renderResult('중복', ts, judge.lastLog);
      this.disabled = false;
      this.textContent = judge.action === '입실' ? '✅ 입실 등록' : '🚪 퇴실 등록';
      return;
    }

    try {
      await _postToProxy({
        action: 'addLog',
        roomId: _roomId,
        roomName: _roomName,
        userName: _user.name,
        phone: _user.phone,
        affiliation: _user.affiliation,
        checkType: judge.action,
        timestamp: ts,
        deviceId: _deviceId,
        consentTimestamp: _user.consentAt || ts,
        consentTextVersion: CONSENT_VERSION,
      });

      // 로컬 로그 캐시 업데이트
      var newLog = { checkType:judge.action, timestamp:ts, deviceId:_deviceId, roomId:_roomId };
      _lastLog = newLog;
      if (window._allLogs) window._allLogs.unshift(newLog);

      _renderResult(judge.action, ts, judge.lastLog);
    } catch (e) {
      var errEl = $('error-checkin-msg');
      if (errEl) { errEl.textContent = e.message || '저장 실패'; errEl.className = 'error-msg show'; }
    } finally {
      this.disabled = false;
      this.textContent = judge.action === '입실' ? '✅ 입실 등록' : '🚪 퇴실 등록';
    }
  });

  /* ── 정보 수정 UX ── */
  $('btn-edit-info-open') && $('btn-edit-info-open').addEventListener('click', function () {
    $('edit-name').value  = _user.name        || '';
    $('edit-phone').value = _user.phone       || '';
    $('edit-affil').value = _user.affiliation || '';
    var errEl = $('edit-error-msg');
    if (errEl) errEl.className = 'error-msg';
    hide('edit-success-msg');
    show('edit-info-form');
    $('edit-name').focus();
    $('edit-info-form').scrollIntoView({ behavior:'smooth', block:'start' });
  });

  $('btn-edit-cancel') && $('btn-edit-cancel').addEventListener('click', function () {
    hide('edit-info-form');
  });

  $('btn-edit-save') && $('btn-edit-save').addEventListener('click', async function () {
    var errEl = $('edit-error-msg'), successEl = $('edit-success-msg');
    if (errEl) errEl.className = 'error-msg';
    if (successEl) successEl.hidden = true;

    var name  = ($('edit-name').value  || '').trim();
    var phone = ($('edit-phone').value || '').trim();
    var affil = ($('edit-affil').value || '').trim();

    function _e(msg) { if(errEl){errEl.textContent=msg;errEl.className='error-msg show';} }
    if (!name)  { _e('이름을 입력해 주세요.'); return; }
    if (!phone) { _e('전화번호를 입력해 주세요.'); return; }
    if (!affil) { _e('소속을 입력해 주세요.'); return; }
    if (!/^[0-9\-+\s]{7,15}$/.test(phone)) { _e('올바른 전화번호를 입력해 주세요.'); return; }

    this.disabled = true; this.textContent = '저장 중...';
    var updatedLogs = 0;
    try {
      var r = await _postToProxy({ action:'updateUser', name, phone, affiliation:affil,
        deviceId:_deviceId, consentTimestamp:_user.consentAt||new Date().toISOString(),
        consentTextVersion:CONSENT_VERSION });
      updatedLogs = r.updatedLogs || 0;
    } catch(e) {}

    _user = Object.assign({}, _user, { name, phone, affiliation:affil });
    localStorage.setItem(USER_KEY, JSON.stringify(_user));
    text('ci-user-name', _user.name + ' 님');
    text('ci-user-sub',  _user.affiliation + ' · ' + _user.phone);
    this.disabled = false; this.textContent = '저장하기';

    if (successEl) {
      successEl.textContent = '✅ 정보가 수정되었습니다.' +
        (updatedLogs > 0 ? ' 이전 기록 ' + updatedLogs + '건도 업데이트되었습니다.' : '');
      successEl.hidden = false;
    }
    setTimeout(function () { hide('edit-info-form'); }, 3000);
  });

  /* ── 다른 사람으로 변경 ── */
  $('btn-change-user') && $('btn-change-user').addEventListener('click', function () {
    if (!confirm('기기에 저장된 사용자 정보를 완전히 초기화하시겠습니까?')) return;
    localStorage.removeItem(USER_KEY);
    _user = null;
    _showConsentScreen();
  });

  /* ── 오프라인 감지 ── */
  function _checkOnline() {
    var el = $('offline-notice');
    if (!el) return;
    el.className = navigator.onLine ? 'offline-notice' : 'offline-notice show';
  }
  window.addEventListener('online',  _checkOnline);
  window.addEventListener('offline', _checkOnline);
  _checkOnline();

  _init();

})();
