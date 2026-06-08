/**
 * sms.js — ASEA 문자 발송 모듈
 * 알리고(Aligo) API 기반 SMS/LMS 발송
 * GAS 프록시 경유 → 실제 알리고 API 호출
 */
var SmsModule = (function () {
  'use strict';

  /* ── 상태 ────────────────────────────────────────────────── */
  var _proxyUrl    = '';
  var _senderNum   = '';
  var _selected    = new Set();   // 선택된 수신자 phone 문자열
  var _contacts    = [];          // 현재 필터링된 연락처 배열
  var _currentTab  = 'compose';   // compose | history | settings

  /* ── DOM 헬퍼 ────────────────────────────────────────────── */
  function $s(id) { return document.getElementById('sms-' + id); }

  /* ── localStorage 설정 ───────────────────────────────────── */
  var CFG_KEY = 'asea_sms_cfg';
  function _loadCfg()    { try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch(e){ return {}; } }
  function _saveCfg(cfg) { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }

  /* ═══════════════════════════════════════════════════════════
   * 초기화
   * ═══════════════════════════════════════════════════════════ */
  function initSmsTab() {
    var cfg = _loadCfg();
    _proxyUrl  = cfg.proxyUrl  || '';
    _senderNum = cfg.senderNum || '';

    _bindEvents();
    _showSubTab(_currentTab);
  }

  /* ─── 서브탭 전환 ────────────────────────────────────────── */
  function _showSubTab(name) {
    _currentTab = name;
    ['compose', 'history', 'settings'].forEach(function (t) {
      var btn = $s('subtab-' + t);
      var panel = $s('panel-' + t);
      if (btn)   btn.classList.toggle('active', t === name);
      if (panel) panel.hidden = (t !== name);
    });

    if (name === 'compose')  _renderCompose();
    if (name === 'history')  _renderHistory();
    if (name === 'settings') _renderSettings();
  }

  /* ═══════════════════════════════════════════════════════════
   * 이벤트 바인딩 (한 번만)
   * ═══════════════════════════════════════════════════════════ */
  function _bindEvents() {
    // 서브탭 버튼
    ['compose', 'history', 'settings'].forEach(function (t) {
      var btn = $s('subtab-' + t);
      if (btn) btn.onclick = function () { _showSubTab(t); };
    });
  }

  /* ═══════════════════════════════════════════════════════════
   * [작성] 패널
   * ═══════════════════════════════════════════════════════════ */
  function _renderCompose() {
    var panel = $s('panel-compose');
    if (!panel) return;

    // 프록시 미설정 경고
    if (!_proxyUrl) {
      panel.innerHTML =
        '<div class="sms-setup-guide">' +
        '<div class="sms-setup-icon">📱</div>' +
        '<h3>SMS 서비스 설정이 필요합니다</h3>' +
        '<p>먼저 <button class="btn-link" id="sms-go-settings">⚙️ 설정 탭</button>에서 GAS 프록시 URL과 발신번호를 등록하세요.</p>' +
        '<div class="sms-guide-steps">' +
        '<div class="sms-guide-step"><span class="sms-step-num">1</span>' +
        '<span><strong>알리고 가입</strong> — <a href="https://smartsms.aligo.in" target="_blank" rel="noopener">smartsms.aligo.in</a> 에서 무료 회원가입<br>' +
        '<small style="color:#888">SMS 8원/건, LMS 27원/건 — 국내 최저가 수준의 선불 충전 방식</small></span></div>' +
        '<div class="sms-guide-step"><span class="sms-step-num">2</span>' +
        '<span><strong>발신번호 등록</strong> — 알리고 → 발신번호 관리 → 본인 번호 인증</span></div>' +
        '<div class="sms-guide-step"><span class="sms-step-num">3</span>' +
        '<span><strong>API 키 확인</strong> — 알리고 → 개발자센터 → API 키/ID 복사</span></div>' +
        '<div class="sms-guide-step"><span class="sms-step-num">4</span>' +
        '<span><strong>GAS 스크립트 배포</strong> — <code>gas_sms_proxy.gs</code> 파일을 Google Apps Script에 배포하고 스크립트 속성에 ALIGO_KEY / ALIGO_ID 입력</span></div>' +
        '<div class="sms-guide-step"><span class="sms-step-num">5</span>' +
        '<span><strong>URL 등록</strong> — 아래 설정 탭에 배포 URL 입력</span></div>' +
        '</div>' +
        '<button class="btn btn-primary" id="sms-go-settings2" style="margin-top:16px">⚙️ 설정으로 이동</button>' +
        '</div>';

      var goBtn = panel.querySelector('#sms-go-settings2');
      var goLink = panel.querySelector('#sms-go-settings');
      if (goBtn)  goBtn.onclick  = function () { _showSubTab('settings'); };
      if (goLink) goLink.onclick = function (e) { e.preventDefault(); _showSubTab('settings'); };
      return;
    }

    // 연락처 로드
    var emps = (window._workW && window._workW.employees) ? window._workW.employees : [];
    var active = emps.filter(function (e) { return e.status !== 'inactive' && e.phone; });
    _contacts = active;

    panel.innerHTML = _composeHtml(active);
    _bindComposeEvents(panel);
    _updateCharCount();
    _updateSendBtn();
  }

  function _composeHtml(contacts) {
    var senderDisplay = _senderNum
      ? '<span class="sms-sender-num">' + _esc(_senderNum) + '</span>'
      : '<span class="sms-sender-none">미설정 — <button class="btn-link" id="sms-set-sender">설정하기</button></span>';

    var contactRows = contacts.length === 0
      ? '<p class="empty-state" style="padding:12px 0;color:#888">등록된 직원 정보가 없습니다.<br>직원관리 탭에서 직원을 먼저 등록하세요.</p>'
      : contacts.map(function (c) {
          var checked = _selected.has(c.phone) ? 'checked' : '';
          return '<label class="sms-contact-row">' +
            '<input type="checkbox" class="sms-contact-check" data-phone="' + _esc(c.phone) +
            '" data-name="' + _esc(c.name) + '" ' + checked + '>' +
            '<span class="sms-contact-name">' + _esc(c.name) + '</span>' +
            '<span class="sms-contact-dept">' + _esc(c.department || c.rank || '') + '</span>' +
            '<span class="sms-contact-phone">' + _esc(c.phone) + '</span>' +
          '</label>';
        }).join('');

    return [
      '<div class="sms-sender-bar">',
        '<span class="sms-sender-label">📤 발신번호</span>',
        senderDisplay,
      '</div>',

      '<div class="sms-section">',
        '<div class="sms-section-hd">',
          '<span>📋 수신자</span>',
          '<label class="sms-select-all-wrap">',
            '<input type="checkbox" id="sms-chk-all"> 전체 선택',
            ' <span id="sms-sel-count" class="sms-sel-count">0명 선택</span>',
          '</label>',
          '<input type="text" id="sms-contact-search" class="sms-search-input" placeholder="이름·부서 검색...">',
        '</div>',
        '<div class="sms-contact-list" id="sms-contact-list">' + contactRows + '</div>',
      '</div>',

      '<div class="sms-section">',
        '<div class="sms-section-hd">',
          '<span>✏️ 메시지</span>',
          '<span id="sms-type-badge" class="sms-type-badge sms">SMS</span>',
        '</div>',
        '<textarea id="sms-msg-input" class="sms-msg-textarea" placeholder="메시지를 입력하세요 (한글 45자 이하 → SMS / 초과 → LMS 자동 전환)"></textarea>',
        '<div class="sms-char-info">',
          '<span id="sms-char-count" class="sms-char-count">0 / 45자</span>',
          '<span id="sms-char-hint" class="sms-char-hint">SMS (8원/건)</span>',
        '</div>',
      '</div>',

      '<div class="sms-title-wrap" id="sms-title-wrap" hidden>',
        '<input type="text" id="sms-title-input" class="form-input" placeholder="LMS 제목 (선택, 최대 40자)" maxlength="40">',
      '</div>',

      '<div id="sms-send-preview" class="sms-send-preview" hidden></div>',

      '<div class="sms-send-bar">',
        '<button id="sms-preview-btn" class="btn btn-ghost">미리보기</button>',
        '<button id="sms-send-btn" class="btn btn-primary" disabled>📱 문자 발송</button>',
      '</div>',
    ].join('');
  }

  function _bindComposeEvents(panel) {
    // 발신번호 설정 링크
    var setLink = panel.querySelector('#sms-set-sender');
    if (setLink) setLink.onclick = function (e) { e.preventDefault(); _showSubTab('settings'); };

    // 수신자 체크박스 — 이벤트 위임
    var contactList = panel.querySelector('#sms-contact-list');
    if (contactList) {
      contactList.addEventListener('change', function (e) {
        if (!e.target.matches('.sms-contact-check')) return;
        var phone = e.target.dataset.phone;
        if (e.target.checked) _selected.add(phone);
        else _selected.delete(phone);
        _updateSelCount();
        _updateAllCheck();
        _updateSendBtn();
      });
    }

    // 전체 선택
    var chkAll = panel.querySelector('#sms-chk-all');
    if (chkAll) {
      chkAll.addEventListener('change', function () {
        var checks = panel.querySelectorAll('.sms-contact-check');
        checks.forEach(function (c) {
          c.checked = chkAll.checked;
          var phone = c.dataset.phone;
          if (chkAll.checked) _selected.add(phone);
          else _selected.delete(phone);
        });
        _updateSelCount();
        _updateSendBtn();
      });
    }

    // 연락처 검색
    var searchInput = panel.querySelector('#sms-contact-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        var q = this.value.toLowerCase().trim();
        var rows = panel.querySelectorAll('.sms-contact-row');
        rows.forEach(function (row) {
          var name = (row.querySelector('.sms-contact-name') || {}).textContent || '';
          var dept = (row.querySelector('.sms-contact-dept') || {}).textContent || '';
          var phone = (row.querySelector('.sms-contact-phone') || {}).textContent || '';
          row.hidden = q && !name.toLowerCase().includes(q) && !dept.toLowerCase().includes(q) && !phone.includes(q);
        });
      });
    }

    // 메시지 입력
    var msgInput = panel.querySelector('#sms-msg-input');
    if (msgInput) {
      msgInput.addEventListener('input', function () {
        _updateCharCount();
        _updateSendBtn();
        $s('send-preview').hidden = true;
      });
    }

    // 미리보기
    var previewBtn = panel.querySelector('#sms-preview-btn');
    if (previewBtn) {
      previewBtn.onclick = function () {
        var preview = $s('send-preview');
        if (!preview) return;
        var msg = (panel.querySelector('#sms-msg-input') || {}).value || '';
        var selArr = Array.from(_selected);
        if (!msg || !selArr.length) { preview.hidden = true; return; }
        var names = selArr.map(function (ph) {
          var c = _contacts.find(function (x) { return x.phone === ph; });
          return c ? (c.name + '(' + ph + ')') : ph;
        });
        var type = _getMsgType(msg);
        preview.hidden = false;
        preview.innerHTML =
          '<div class="sms-preview-inner">' +
          '<div class="sms-preview-label">📋 발송 미리보기</div>' +
          '<div class="sms-preview-row"><b>발신:</b> ' + _esc(_senderNum) + '</div>' +
          '<div class="sms-preview-row"><b>수신(' + selArr.length + '명):</b> ' + _esc(names.slice(0,5).join(', ')) + (names.length > 5 ? ' 외 ' + (names.length - 5) + '명' : '') + '</div>' +
          '<div class="sms-preview-row"><b>유형:</b> <span class="sms-type-badge ' + type.toLowerCase() + '">' + type + '</span></div>' +
          '<div class="sms-preview-msg">' + _esc(msg).replace(/\n/g, '<br>') + '</div>' +
          '<div class="sms-preview-cost">예상 비용: ' + (selArr.length * (type === 'SMS' ? 8 : 27)).toLocaleString() + '원 (선불 차감)</div>' +
          '</div>';
      };
    }

    // 발송 버튼
    var sendBtn = panel.querySelector('#sms-send-btn');
    if (sendBtn) {
      sendBtn.onclick = function () { _doSend(panel, sendBtn); };
    }
  }

  function _updateCharCount() {
    var msgInput = $s('msg-input');
    if (!msgInput) return;
    var msg   = msgInput.value || '';
    var len   = msg.length;
    var bytes = _byteLen(msg);
    var type  = _getMsgType(msg);
    var isLms = (type === 'LMS');

    var cntEl   = $s('char-count');
    var hintEl  = $s('char-hint');
    var badgeEl = $s('type-badge');
    var titleWrap = $s('title-wrap');

    if (cntEl)  cntEl.textContent  = len + (isLms ? ' / 2,000자' : ' / 45자');
    if (hintEl) hintEl.textContent = isLms ? 'LMS (27원/건)' : 'SMS (8원/건)';
    if (badgeEl) { badgeEl.textContent = type; badgeEl.className = 'sms-type-badge ' + type.toLowerCase(); }
    if (titleWrap) titleWrap.hidden = !isLms;
  }

  function _updateSelCount() {
    var el = $s('sel-count');
    if (el) el.textContent = _selected.size + '명 선택';
  }

  function _updateAllCheck() {
    var chkAll = $s('chk-all');
    if (!chkAll) return;
    var checks = document.querySelectorAll('.sms-contact-check');
    var checkedCount = document.querySelectorAll('.sms-contact-check:checked').length;
    chkAll.checked       = checks.length > 0 && checkedCount === checks.length;
    chkAll.indeterminate = checkedCount > 0 && checkedCount < checks.length;
  }

  function _updateSendBtn() {
    var btn = $s('send-btn');
    if (!btn) return;
    var msg = ($s('msg-input') || {}).value || '';
    var ok  = _selected.size > 0 && msg.trim().length > 0 && _senderNum;
    btn.disabled = !ok;
    btn.textContent = ok ? ('📱 문자 발송 (' + _selected.size + '명)') : '📱 문자 발송';
  }

  async function _doSend(panel, btn) {
    var msg = ($s('msg-input') || {}).value || '';
    var title = ($s('title-input') || {}).value || '';
    var selArr = Array.from(_selected);
    if (!selArr.length || !msg.trim()) return;

    var type = _getMsgType(msg);
    var cost = selArr.length * (type === 'SMS' ? 8 : 27);
    var confirmMsg =
      '발송 확인\n\n' +
      '수신자: ' + selArr.length + '명\n' +
      '유형: ' + type + '\n' +
      '예상 비용: ' + cost.toLocaleString() + '원\n\n' +
      '발송하시겠습니까?';

    if (!confirm(confirmMsg)) return;

    btn.disabled = true;
    btn.textContent = '⏳ 발송 중...';

    try {
      var me = window._workMe;
      var res = await _callProxy({
        action   : 'sendSms',
        sender   : _senderNum,
        message  : msg,
        title    : title,
        receivers: selArr,
        msgType  : type,
        sentBy   : me ? (me.name || me.googleEmail || '') : ''
      });

      if (res.ok) {
        _showToast('✅ ' + (res.successCnt || selArr.length) + '명에게 발송 완료!', 'success');
        // 초기화
        _selected.clear();
        panel.querySelectorAll('.sms-contact-check').forEach(function (c) { c.checked = false; });
        var chkAll = $s('chk-all');
        if (chkAll) { chkAll.checked = false; chkAll.indeterminate = false; }
        if ($s('msg-input')) $s('msg-input').value = '';
        if ($s('title-input')) $s('title-input').value = '';
        _updateCharCount();
        _updateSelCount();
        _updateSendBtn();
        $s('send-preview').hidden = true;
      } else {
        throw new Error(res.message || '발송 실패');
      }
    } catch (e) {
      _showToast('❌ 발송 오류: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      _updateSendBtn();
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * [내역] 패널
   * ═══════════════════════════════════════════════════════════ */
  async function _renderHistory() {
    var panel = $s('panel-history');
    if (!panel) return;

    if (!_proxyUrl) {
      panel.innerHTML = '<p class="empty-state" style="color:#888">설정 탭에서 SMS 프록시 URL을 먼저 등록하세요.</p>';
      return;
    }

    panel.innerHTML = '<p class="empty-state">불러오는 중...</p>';

    try {
      var res = await _callProxy({ action: 'getHistory', limit: 50 });
      var list = res.list || [];

      if (!list.length) {
        panel.innerHTML = '<p class="empty-state">발송 내역이 없습니다.</p>';
        return;
      }

      panel.innerHTML =
        '<div style="overflow-x:auto">' +
        '<table class="sms-hist-table">' +
        '<thead><tr>' +
          '<th>발송일시</th><th>유형</th><th>수신자</th><th>내용</th><th>결과</th>' +
        '</tr></thead><tbody>' +
        list.map(function (r) {
          var ok = String(r.resultCode) === '1';
          return '<tr>' +
            '<td style="white-space:nowrap;color:#888">' + _esc(String(r.sentAt).replace('T',' ').slice(0,16)) + '</td>' +
            '<td><span class="sms-type-badge ' + (r.msgType||'sms').toLowerCase() + '">' + _esc(r.msgType||'SMS') + '</span></td>' +
            '<td style="text-align:center">' + _esc(String(r.receiverCount||0)) + '명</td>' +
            '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + _esc(r.message||'') + '">' + _esc((r.message||'').slice(0,30)) + ((r.message||'').length > 30 ? '…' : '') + '</td>' +
            '<td><span style="color:' + (ok?'#2e7d32':'#e53935') + ';font-weight:600">' + (ok ? '✓ 성공' : '✗ 실패') + '</span>' + (ok ? '<small style="color:#888"> (' + (r.successCnt||0) + '/' + (r.receiverCount||0) + ')</small>' : '') + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div>' +
        '<p style="color:#aaa;font-size:12px;margin-top:8px;text-align:right">최근 50건 표시</p>';

    } catch (e) {
      panel.innerHTML = '<p class="empty-state" style="color:#e53935">내역 로드 실패: ' + _esc(e.message) + '</p>';
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * [설정] 패널
   * ═══════════════════════════════════════════════════════════ */
  function _renderSettings() {
    var panel = $s('panel-settings');
    if (!panel) return;

    panel.innerHTML = [
      '<div class="settings-card">',
        '<h3 class="settings-section-title">📡 SMS 프록시 서버 URL</h3>',
        '<p class="form-hint">gas_sms_proxy.gs를 Google Apps Script에 배포 후 웹 앱 URL을 입력하세요.</p>',
        '<div class="form-group" style="margin:0">',
          '<input type="url" id="sms-cfg-proxy" class="form-input" placeholder="https://script.google.com/macros/s/..." value="' + _esc(_proxyUrl) + '">',
        '</div>',
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">',
          '<button id="sms-save-proxy" class="btn btn-primary btn-sm">저장</button>',
          '<button id="sms-ping-btn" class="btn btn-ghost btn-sm">🔍 연결 테스트</button>',
        '</div>',
        '<p id="sms-ping-result" style="margin-top:8px;font-size:13px"></p>',
      '</div>',

      '<div class="settings-card">',
        '<h3 class="settings-section-title">📤 발신번호</h3>',
        '<p class="form-hint">알리고에 사전 등록된 발신번호를 입력하세요. (예: 010-1234-5678 또는 0212345678)</p>',
        '<div class="form-group" style="margin:0">',
          '<input type="tel" id="sms-cfg-sender" class="form-input" placeholder="010-1234-5678" value="' + _esc(_senderNum) + '">',
        '</div>',
        '<button id="sms-save-sender" class="btn btn-primary btn-sm" style="margin-top:10px">저장</button>',
      '</div>',

      '<div class="settings-card">',
        '<h3 class="settings-section-title">💰 알리고 잔액 조회</h3>',
        '<button id="sms-balance-btn" class="btn btn-ghost btn-sm">잔액 확인</button>',
        '<div id="sms-balance-result" style="margin-top:10px;font-size:14px"></div>',
      '</div>',

      '<div class="settings-card">',
        '<h3 class="settings-section-title">ℹ️ 알리고 서비스 안내</h3>',
        '<table class="sms-price-table">',
          '<thead><tr><th>유형</th><th>단가</th><th>길이</th></tr></thead>',
          '<tbody>',
            '<tr><td><span class="sms-type-badge sms">SMS</span></td><td><strong>8원</strong>/건</td><td>한글 45자 이하</td></tr>',
            '<tr><td><span class="sms-type-badge lms">LMS</span></td><td><strong>27원</strong>/건</td><td>한글 2,000자 이하</td></tr>',
            '<tr><td><span class="sms-type-badge mms">MMS</span></td><td><strong>65원</strong>/건</td><td>이미지 포함</td></tr>',
          '</tbody>',
        '</table>',
        '<p class="form-hint" style="margin-top:8px">가입: <a href="https://smartsms.aligo.in" target="_blank" rel="noopener">smartsms.aligo.in</a> (선불 충전 방식, 충전 금액 소진 시 발송 불가)</p>',
      '</div>',
    ].join('');

    // 이벤트
    var saveProxy = panel.querySelector('#sms-save-proxy');
    if (saveProxy) saveProxy.onclick = function () {
      var val = (panel.querySelector('#sms-cfg-proxy') || {}).value || '';
      _proxyUrl = val.trim();
      var cfg = _loadCfg(); cfg.proxyUrl = _proxyUrl; _saveCfg(cfg);
      _showToast('프록시 URL이 저장됐습니다.', 'success');
    };

    var pingBtn = panel.querySelector('#sms-ping-btn');
    if (pingBtn) pingBtn.onclick = async function () {
      var resultEl = panel.querySelector('#sms-ping-result');
      if (!_proxyUrl) { if(resultEl) resultEl.textContent = '⚠️ 먼저 URL을 저장하세요.'; return; }
      pingBtn.disabled = true;
      if (resultEl) resultEl.textContent = '연결 테스트 중...';
      try {
        var res = await _callProxy({ action: 'ping' });
        if (resultEl) resultEl.innerHTML = '<span style="color:#2e7d32">✅ ' + _esc(res.message || '연결 성공') + '</span>';
      } catch(e) {
        if (resultEl) resultEl.innerHTML = '<span style="color:#e53935">❌ 연결 실패: ' + _esc(e.message) + '</span>';
      } finally { pingBtn.disabled = false; }
    };

    var saveSender = panel.querySelector('#sms-save-sender');
    if (saveSender) saveSender.onclick = function () {
      var val = (panel.querySelector('#sms-cfg-sender') || {}).value || '';
      _senderNum = val.trim();
      var cfg = _loadCfg(); cfg.senderNum = _senderNum; _saveCfg(cfg);
      _showToast('발신번호가 저장됐습니다.', 'success');
    };

    var balBtn = panel.querySelector('#sms-balance-btn');
    if (balBtn) balBtn.onclick = async function () {
      var resEl = panel.querySelector('#sms-balance-result');
      if (!_proxyUrl) { if(resEl) resEl.textContent = '⚠️ 프록시 URL을 먼저 설정하세요.'; return; }
      balBtn.disabled = true;
      if (resEl) resEl.textContent = '조회 중...';
      try {
        var res = await _callProxy({ action: 'getBalance' });
        if (resEl) {
          if (res.ok) {
            resEl.innerHTML =
              '<table class="sms-price-table" style="max-width:300px">' +
              '<tr><td>SMS 잔여</td><td><strong>' + Number(res.smsCnt).toLocaleString() + '</strong>건</td></tr>' +
              '<tr><td>LMS 잔여</td><td><strong>' + Number(res.lmsCnt).toLocaleString() + '</strong>건</td></tr>' +
              (res.won != null ? '<tr><td>충전 잔액</td><td><strong>' + Number(res.won).toLocaleString() + '</strong>원</td></tr>' : '') +
              '</table>';
          } else {
            resEl.innerHTML = '<span style="color:#e53935">조회 실패</span>';
          }
        }
      } catch(e) {
        if (resEl) resEl.innerHTML = '<span style="color:#e53935">오류: ' + _esc(e.message) + '</span>';
      } finally { balBtn.disabled = false; }
    };
  }

  /* ═══════════════════════════════════════════════════════════
   * 유틸
   * ═══════════════════════════════════════════════════════════ */
  function _byteLen(str) {
    var b = 0;
    for (var i = 0; i < str.length; i++) b += str.charCodeAt(i) > 127 ? 2 : 1;
    return b;
  }

  function _getMsgType(msg) {
    return (msg.length <= 45 && _byteLen(msg) <= 90) ? 'SMS' : 'LMS';
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _showToast(msg, type) {
    if (typeof toast === 'function') { toast(msg, type); return; }
    alert(msg);
  }

  async function _callProxy(body) {
    if (!_proxyUrl) throw new Error('SMS 프록시 URL이 설정되지 않았습니다. 설정 탭에서 등록하세요.');
    var res = await fetch(_proxyUrl, {
      method : 'POST',
      body   : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var json = await res.json();
    if (!json.ok && json.error) throw new Error(json.error);
    return json;
  }

  /* ── 공개 API ─────────────────────────────────────────────── */
  return {
    initSmsTab: initSmsTab
  };

})();
