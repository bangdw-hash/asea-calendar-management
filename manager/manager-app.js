'use strict';

/**
 * manager-app.js — ASEA 관리실 포털 전용 앱 로직
 * 작업지시 조회/등록/상태변경, 업무 캘린더, 당직 인원 관리
 */
(function () {

  /* ── 상태 ── */
  var ME = {};
  var _orders = [];
  var _staff = [];
  var _editOrder = null;
  var _calViewDate = new Date();
  var _calEvents = [];

  var _filterStatus = 'all';
  var _filterPriority = 'all';

  /* ── 유틸 ── */
  function $(id) { return document.getElementById(id); }

  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' toast-' + type : '');
    el.textContent = msg;
    $('toast-container').appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity 200ms';
      el.style.opacity = '0';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }, 3000);
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0');
    } catch(e) { return String(iso).slice(0,10); }
  }

  /* ── Auth + 초기화 ── */
  async function _onLoggedIn() {
    // Google userinfo API로 이메일·이름 조회
    try {
      var resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { 'Authorization': 'Bearer ' + Auth.getToken() }
      });
      if (resp.ok) {
        var info = await resp.json();
        ME.email = info.email || '';
        ME.name  = info.name  || info.email || '';
      }
    } catch (e) {}

    $('user-email').textContent = ME.email || '로그인됨';
    $('login-overlay').style.display = 'none';
    $('app').hidden = false;

    // 관리실 인원 조회 후 내 정보 세팅
    SheetsModule.getManagerStaff().then(function (list) {
      _staff = list || [];
      var me = _staff.find(function (s) { return s.googleEmail && s.googleEmail.toLowerCase() === (ME.email || '').toLowerCase(); });
      if (me) { ME.id = me.id; ME.name = me.name; ME.role = me.role; ME.shift = me.shift; }
      renderStaff();
    }).catch(function () { _staff = []; });

    loadOrders();
    loadCalendar();
  }

  // onAuthChange: loggedIn(boolean) 콜백
  Auth.onAuthChange(function (loggedIn) {
    if (loggedIn) {
      _onLoggedIn();
    } else {
      $('login-overlay').style.display = 'flex';
      $('app').hidden = true;
    }
  });

  $('login-btn').addEventListener('click', function () {
    $('login-btn').disabled = true;
    Auth.login()
      .catch(function () {})
      .finally(function () { $('login-btn').disabled = false; });
  });
  $('logout-btn').addEventListener('click', function () { Auth.logout(); location.reload(); });

  // 페이지 로드 시 저장된 토큰 복원 시도
  if (typeof Auth.tryRestoreSession === 'function') {
    Auth.tryRestoreSession();
  }

  /* ── 탭 전환 ── */
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      $('tab-' + tab).classList.add('active');
      if (tab === 'calendar') loadCalendar();
    });
  });

  /* ══════════════════════════════════════════
     작업지시 탭
  ══════════════════════════════════════════ */
  $('wo-add-btn').addEventListener('click', function () { openModal(null); });
  $('wo-refresh-btn').addEventListener('click', loadOrders);
  $('wo-modal-close').addEventListener('click', closeModal);
  $('wo-modal-cancel').addEventListener('click', closeModal);
  $('wo-modal-backdrop').addEventListener('click', closeModal);
  $('wo-modal-save').addEventListener('click', saveOrder);
  $('wo-filter-status').addEventListener('change', function () { _filterStatus = this.value; renderOrders(); });
  $('wo-filter-priority').addEventListener('change', function () { _filterPriority = this.value; renderOrders(); });

  async function loadOrders() {
    $('wo-list').innerHTML = '<p class="empty-state">불러오는 중...</p>';
    try {
      _orders = (await SheetsModule.getWorkOrders()) || [];
      renderOrders();
      updateBadge();
    } catch (e) {
      $('wo-list').innerHTML = '<p class="empty-state" style="color:#e53935">불러오기 실패: ' + e.message + '</p>';
    }
  }

  function updateBadge() {
    var pending = _orders.filter(function (o) { return o.status === '대기' || o.status === '진행중'; }).length;
    var badge = $('wo-badge');
    if (pending > 0) { badge.textContent = pending; badge.hidden = false; }
    else badge.hidden = true;
  }

  function renderOrders() {
    var list = $('wo-list');

    var filtered = _orders.filter(function (o) {
      if (_filterStatus !== 'all' && o.status !== _filterStatus) return false;
      if (_filterPriority !== 'all' && o.priority !== _filterPriority) return false;
      return true;
    }).sort(function (a, b) {
      var order = { '긴급': 0, '높음': 1, '보통': 2, '낮음': 3 };
      var po = (order[a.priority] || 2) - (order[b.priority] || 2);
      if (po !== 0) return po;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    if (!filtered.length) {
      list.innerHTML = '<p class="empty-state">조건에 맞는 작업지시가 없습니다.</p>';
      return;
    }

    var priorityColor = { '긴급': '#EA4335', '높음': '#F57C00', '보통': '#4285F4', '낮음': '#9AA0A6' };
    var statusColor   = { '대기': '#9AA0A6', '진행중': '#1A73E8', '완료': '#34A853', '취소': '#EA4335' };

    list.innerHTML = filtered.map(function (o) {
      var pc = priorityColor[o.priority] || '#9AA0A6';
      var sc = statusColor[o.status] || '#9AA0A6';
      return '<div class="wo-card" data-priority="' + esc(o.priority) + '">' +
        '<div class="wo-card-header">' +
          '<span class="wo-badge" style="background:' + pc + '">' + esc(o.priority||'보통') + '</span>' +
          '<span class="wo-badge" style="background:' + sc + '">' + esc(o.status||'대기') + '</span>' +
          (o.department ? '<span class="wo-dept">' + esc(o.department) + '</span>' : '') +
          '<span class="wo-date">' + fmtDate(o.createdAt) + (o.dueDate ? ' | 기한: ' + o.dueDate : '') + '</span>' +
        '</div>' +
        '<div class="wo-card-title">' + esc(o.title) + '</div>' +
        '<div class="wo-card-meta">' +
          '요청: ' + esc(o.requesterName || o.requesterId || '') +
          (o.assigneeName ? ' &nbsp;→&nbsp; 담당: ' + esc(o.assigneeName) : '') +
        '</div>' +
        (o.content ? '<div class="wo-card-content">' + esc(o.content).replace(/\n/g,'<br>') + '</div>' : '') +
        (o.note ? '<div class="wo-card-meta" style="margin-top:4px">📌 ' + esc(o.note) + '</div>' : '') +
        '<div class="wo-card-actions" style="margin-top:8px">' + statusBtns(o) + '</div>' +
      '</div>';
    }).join('');

    // 상태 버튼 이벤트
    list.querySelectorAll('.wo-status-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        changeStatus(btn.dataset.id, parseInt(btn.dataset.row), btn.dataset.status);
      });
    });
    list.querySelectorAll('.wo-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var o = _orders.find(function (x) { return x.id === btn.dataset.id; });
        if (o) openModal(o);
      });
    });
  }

  function statusBtns(o) {
    var result = '<button class="btn btn-secondary btn-xs wo-edit-btn" data-id="' + o.id + '">✏️ 수정</button>';
    if (o.status === '대기') {
      result += '<button class="btn btn-primary btn-xs wo-status-btn" data-id="' + o.id + '" data-row="' + o._row + '" data-status="진행중">▶ 진행 시작</button>';
    }
    if (o.status === '진행중') {
      result += '<button class="btn btn-primary btn-xs wo-status-btn" data-id="' + o.id + '" data-row="' + o._row + '" data-status="완료">✅ 완료 처리</button>';
    }
    if (o.status !== '취소' && o.status !== '완료') {
      result += '<button class="btn btn-danger btn-xs wo-status-btn" data-id="' + o.id + '" data-row="' + o._row + '" data-status="취소">취소</button>';
    }
    return result;
  }

  async function changeStatus(id, rowNum, status) {
    try {
      var completedAt = (status === '완료') ? new Date().toISOString() : '';
      await SheetsModule.updateWorkOrderStatus(rowNum, status, completedAt);
      var o = _orders.find(function (x) { return x.id === id; });
      if (o) { o.status = status; if (completedAt) o.completedAt = completedAt; }
      renderOrders();
      updateBadge();
      toast(status + ' 처리 완료', 'success');
    } catch (e) {
      toast('상태 변경 실패: ' + e.message, 'error');
    }
  }

  /* ── 모달 ── */
  function openModal(order) {
    _editOrder = order || null;
    $('wo-modal-title').textContent = order ? '작업지시 수정' : '작업지시 등록';
    $('wo-title-input').value   = order ? order.title || '' : '';
    $('wo-content-input').value = order ? order.content || '' : '';
    $('wo-priority-select').value = order ? (order.priority || '보통') : '보통';
    $('wo-due-input').value     = order ? order.dueDate || '' : '';
    $('wo-dept-input').value    = order ? order.department || '' : '';
    $('wo-note-input').value    = order ? order.note || '' : '';
    $('wo-modal').hidden = false;
  }

  function closeModal() {
    $('wo-modal').hidden = true;
    _editOrder = null;
  }

  async function saveOrder() {
    var title = ($('wo-title-input').value || '').trim();
    if (!title) { toast('제목을 입력하세요.', 'warning'); return; }

    var wo = {
      title: title,
      content: $('wo-content-input').value || '',
      requesterId: ME.id || '',
      requesterName: ME.name || ME.email || '',
      assigneeId: '',
      assigneeName: '',
      department: $('wo-dept-input').value || '',
      priority: $('wo-priority-select').value || '보통',
      dueDate: $('wo-due-input').value || '',
      note: $('wo-note-input').value || '',
    };

    $('wo-modal-save').disabled = true;

    try {
      if (_editOrder) {
        wo.id = _editOrder.id;
        wo.status = _editOrder.status;
        wo.createdAt = _editOrder.createdAt;
        wo.completedAt = _editOrder.completedAt || '';
        wo.calEventId = _editOrder.calEventId || '';
        await SheetsModule.updateWorkOrder(_editOrder._row, wo);
        Object.assign(_editOrder, wo);
        toast('수정 완료', 'success');
      } else {
        wo.status = '대기';
        var newId = await SheetsModule.createWorkOrder(wo);
        wo.id = newId;

        // Google Calendar에도 등록 (기한 있을 경우)
        if (wo.dueDate) {
          try {
            var calEvt = await CalendarModule.createEvent('primary', {
              summary: '[작업지시] ' + wo.title,
              description: wo.content,
              start: { date: wo.dueDate },
              end: { date: wo.dueDate },
              colorId: '6', // tomato
            });
            wo.calEventId = (calEvt && calEvt.id) ? calEvt.id : '';
          } catch (ce) { wo.calEventId = ''; }
        }

        _orders.unshift(wo);
        toast('등록 완료', 'success');
      }

      closeModal();
      renderOrders();
      updateBadge();
    } catch (e) {
      toast('저장 실패: ' + e.message, 'error');
    } finally {
      $('wo-modal-save').disabled = false;
    }
  }

  /* ══════════════════════════════════════════
     업무 캘린더 탭
  ══════════════════════════════════════════ */
  $('cal-prev').addEventListener('click', function () {
    _calViewDate = new Date(_calViewDate.getFullYear(), _calViewDate.getMonth() - 1, 1);
    renderCalendar();
    loadCalendar();
  });
  $('cal-next').addEventListener('click', function () {
    _calViewDate = new Date(_calViewDate.getFullYear(), _calViewDate.getMonth() + 1, 1);
    renderCalendar();
    loadCalendar();
  });

  async function loadCalendar() {
    try {
      var y = _calViewDate.getFullYear(), m = _calViewDate.getMonth();
      var start = new Date(y, m, 1).toISOString();
      var end   = new Date(y, m + 1, 0, 23, 59, 59).toISOString();
      var evts = await CalendarModule.listEvents('primary', start, end);
      _calEvents = evts || [];
      renderCalendar();
    } catch (e) { /* silent */ }
  }

  function renderCalendar() {
    var y = _calViewDate.getFullYear(), m = _calViewDate.getMonth();
    $('cal-title').textContent = y + '년 ' + (m + 1) + '월';

    var today = new Date();
    var firstDay = new Date(y, m, 1).getDay();
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var daysInPrev  = new Date(y, m, 0).getDate();

    var cells = [];
    // 이전달 빈 칸
    for (var i = firstDay - 1; i >= 0; i--) {
      cells.push({ day: daysInPrev - i, cur: false, date: new Date(y, m - 1, daysInPrev - i) });
    }
    // 현재달
    for (var d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, cur: true, date: new Date(y, m, d) });
    }
    // 다음달 빈 칸 (6주 고정)
    var remain = 42 - cells.length;
    for (var n = 1; n <= remain; n++) {
      cells.push({ day: n, cur: false, date: new Date(y, m + 1, n) });
    }

    var grid = $('cal-grid');
    grid.innerHTML = cells.map(function (c) {
      var isToday = c.cur && c.date.getFullYear() === today.getFullYear() && c.date.getMonth() === today.getMonth() && c.date.getDate() === today.getDate();
      var dateStr = c.date.getFullYear() + '-' + String(c.date.getMonth()+1).padStart(2,'0') + '-' + String(c.date.getDate()).padStart(2,'0');

      // 그날 작업지시 이벤트
      var dayEvts = _calEvents.filter(function (ev) {
        var es = (ev.start.date || ev.start.dateTime || '').slice(0, 10);
        return es === dateStr;
      });

      // 작업지시 오더 (기한일)
      var dayWo = _orders.filter(function (o) {
        return o.dueDate === dateStr && o.status !== '취소';
      });

      var evtHtml = dayWo.map(function (o) {
        var col = { '대기': '#9AA0A6', '진행중': '#1A73E8', '완료': '#34A853' }[o.status] || '#9AA0A6';
        return '<div class="cal-event" style="background:' + col + ';color:#fff" title="' + esc(o.title) + '">' + esc(o.title) + '</div>';
      }).join('');

      evtHtml += dayEvts.map(function (ev) {
        return '<div class="cal-event" style="background:#E3F2FD;color:#0288D1" title="' + esc(ev.summary||'') + '">' + esc(ev.summary||'') + '</div>';
      }).join('');

      return '<div class="cal-cell' + (!c.cur ? ' other-month' : '') + (isToday ? ' today' : '') + '">' +
        '<div class="cal-day-num">' + c.day + '</div>' + evtHtml + '</div>';
    }).join('');
  }

  /* ══════════════════════════════════════════
     당직 인원 탭
  ══════════════════════════════════════════ */
  function renderStaff() {
    var active = _staff.filter(function (s) { return s.status !== 'inactive'; });
    if (!active.length) {
      $('staff-list').innerHTML = '<p class="empty-state">등록된 당직 인원이 없습니다.<br>관리자에게 문의하세요.</p>';
      return;
    }
    var shiftColor = { '주간': '#1A73E8', '야간': '#5C6BC0', '비번': '#9AA0A6', '': '#9AA0A6' };
    $('staff-list').innerHTML = active.map(function (s) {
      var sc = shiftColor[s.shift] || '#9AA0A6';
      return '<div class="card" style="display:flex;align-items:center;gap:14px">' +
        '<span style="font-size:28px">👤</span>' +
        '<div style="flex:1">' +
          '<div style="font-weight:700;font-size:15px">' + esc(s.name) + '</div>' +
          '<div style="font-size:12px;color:var(--color-text-secondary)">' + esc(s.googleEmail||'') + (s.phone ? ' · ' + esc(s.phone) : '') + '</div>' +
        '</div>' +
        (s.shift ? '<span style="background:' + sc + ';color:#fff;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600">' + esc(s.shift) + '</span>' : '') +
      '</div>';
    }).join('');
  }

  /* ══════════════════════════════════════════
     공간관리 탭
  ══════════════════════════════════════════ */
  var _spaces = [];
  var _spEditRow = null;

  $('sp-add-btn').addEventListener('click', function () { _openSpModal(null); });
  $('sp-refresh-btn').addEventListener('click', loadSpaces);
  $('sp-modal-close').addEventListener('click', _closeSpModal);
  $('sp-modal-cancel').addEventListener('click', _closeSpModal);
  $('sp-modal-backdrop').addEventListener('click', _closeSpModal);
  $('sp-modal-save').addEventListener('click', _saveSp);
  $('qr-modal-close').addEventListener('click', function () { $('qr-modal').hidden = true; });
  $('qr-modal-backdrop').addEventListener('click', function () { $('qr-modal').hidden = true; });
  $('qr-print-btn').addEventListener('click', function () { window.print(); });

  async function loadSpaces() {
    $('sp-list').innerHTML = '<p class="empty-state">불러오는 중...</p>';
    try {
      _spaces = (await SheetsModule.getSpaces()) || [];
      _renderSpaces();
      _refreshCheckinRoomFilter();
    } catch (e) {
      $('sp-list').innerHTML = '<p class="empty-state" style="color:#e53935">불러오기 실패: ' + e.message + '</p>';
    }
  }

  function _renderSpaces() {
    if (!_spaces.length) {
      $('sp-list').innerHTML = '<p class="empty-state">등록된 공간이 없습니다. + 공간 등록 버튼을 눌러 추가하세요.</p>';
      return;
    }
    $('sp-list').innerHTML = _spaces.map(function (sp, i) {
      var checkinUrl = (CONFIG.baseUrl || '') + 'checkin.html?room=' + sp.id;
      return '<div class="card" style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start">' +
        '<div>' +
          '<div style="font-size:16px;font-weight:700;margin-bottom:2px">🚪 ' + esc(sp.name) + '</div>' +
          '<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:6px">' +
            esc(sp.location || '') + (sp.description ? ' · ' + esc(sp.description) : '') +
          '</div>' +
          '<div style="font-size:11px;color:#aaa;word-break:break-all">' + checkinUrl + '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">' +
          '<button class="btn btn-primary btn-sm" onclick="_showQrModal(\'' + sp.id + '\')">🔲 QR 보기</button>' +
          '<button class="btn btn-secondary btn-sm" onclick="_deleteSpace(' + (i+2) + ',\'' + esc(sp.name) + '\')">삭제</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function _openSpModal(rowNum) {
    _spEditRow = rowNum;
    $('sp-modal-title').textContent = '공간 등록';
    $('sp-name-input').value = '';
    $('sp-location-input').value = '';
    $('sp-desc-input').value = '';
    $('sp-modal').hidden = false;
  }

  function _closeSpModal() { $('sp-modal').hidden = true; }

  async function _saveSp() {
    var name = ($('sp-name-input').value || '').trim();
    if (!name) { toast('공간 이름을 입력하세요.', 'error'); return; }
    var btn = $('sp-modal-save');
    btn.disabled = true;
    try {
      var result = await SheetsModule.addSpace({
        name: name,
        location: ($('sp-location-input').value || '').trim(),
        description: ($('sp-desc-input').value || '').trim(),
      });
      toast('공간 "' + name + '"이 등록되었습니다.', 'success');
      _closeSpModal();
      await loadSpaces();
      // 방금 만든 공간의 QR 바로 보여주기
      if (result && result.id) _showQrModal(result.id);
    } catch (e) {
      toast('등록 실패: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function _deleteSpace(rowNum, name) {
    if (!confirm('"' + name + '"을(를) 삭제하시겠습니까?')) return;
    try {
      await SheetsModule.deleteSpace(rowNum);
      toast('삭제했습니다.', 'success');
      loadSpaces();
    } catch (e) {
      toast('삭제 실패: ' + e.message, 'error');
    }
  }

  function _showQrModal(roomId) {
    var sp = _spaces.find(function (s) { return s.id === roomId; });
    if (!sp) return;
    var checkinUrl = (CONFIG.baseUrl || '') + 'checkin.html?room=' + sp.id;
    var qrSrc = 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(checkinUrl) + '&size=300x300&margin=10';
    $('qr-img').src = qrSrc;
    $('qr-room-name').textContent = sp.name;
    $('qr-room-location').textContent = sp.location || '';
    $('qr-checkin-link').textContent = checkinUrl;
    $('qr-checkin-link').href = checkinUrl;
    $('qr-modal-title').textContent = sp.name + ' QR';
    $('qr-modal').hidden = false;
  }

  // 전역 노출 (onclick에서 사용)
  window._showQrModal = _showQrModal;
  window._deleteSpace = _deleteSpace;

  /* ══════════════════════════════════════════
     입출입현황 탭
  ══════════════════════════════════════════ */
  var _ciLogs = [];
  var _ciFilterRoom = 'all';
  var _ciFilterType = 'all';

  $('ci-refresh-btn').addEventListener('click', loadCheckinLogs);
  $('ci-filter-room').addEventListener('change', function () { _ciFilterRoom = this.value; _renderCiLogs(); });
  $('ci-filter-type').addEventListener('change', function () { _ciFilterType = this.value; _renderCiLogs(); });
  $('ci-filter-date').addEventListener('change', loadCheckinLogs);

  // 오늘 날짜 기본값
  $('ci-filter-date').value = new Date().toISOString().slice(0, 10);

  async function loadCheckinLogs() {
    $('ci-list').innerHTML = '<p class="empty-state">불러오는 중...</p>';
    var date = $('ci-filter-date').value || new Date().toISOString().slice(0, 10);
    try {
      _ciLogs = (await SheetsModule.getCheckinLogs(null, date, date)) || [];
      _renderCiLogs();
    } catch (e) {
      $('ci-list').innerHTML = '<p class="empty-state" style="color:#e53935">불러오기 실패: ' + e.message + '</p>';
    }
  }

  function _refreshCheckinRoomFilter() {
    var sel = $('ci-filter-room');
    var cur = sel.value;
    sel.innerHTML = '<option value="all">전체 공간</option>';
    _spaces.forEach(function (sp) {
      var opt = document.createElement('option');
      opt.value = sp.id;
      opt.textContent = sp.name;
      sel.appendChild(opt);
    });
    sel.value = cur;
  }

  function _renderCiLogs() {
    var filtered = _ciLogs.filter(function (l) {
      if (_ciFilterRoom !== 'all' && l.roomId !== _ciFilterRoom) return false;
      if (_ciFilterType !== 'all' && l.checkType !== _ciFilterType) return false;
      return true;
    }).sort(function (a, b) {
      return (b.timestamp || '').localeCompare(a.timestamp || '');
    });

    // 요약 카드
    var inCount  = filtered.filter(function (l) { return l.checkType === '입실'; }).length;
    var outCount = filtered.filter(function (l) { return l.checkType === '퇴실'; }).length;
    var unames   = new Set(filtered.map(function (l) { return l.userName; }));
    $('ci-summary').innerHTML =
      _ciSummaryCard('✅ 입실', inCount, '#e8f5e9', '#2e7d32') +
      _ciSummaryCard('🚪 퇴실', outCount, '#fce4ec', '#c62828') +
      _ciSummaryCard('👤 인원', unames.size + '명', '#e3f2fd', '#1565c0');

    if (!filtered.length) {
      $('ci-list').innerHTML = '<p class="empty-state">기록이 없습니다.</p>';
      return;
    }

    $('ci-list').innerHTML =
      '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
      '<thead><tr style="background:#f8f9fb;font-weight:600">' +
        '<th style="padding:8px;text-align:left;border-bottom:1px solid #e0e4ea">시각</th>' +
        '<th style="padding:8px;text-align:left;border-bottom:1px solid #e0e4ea">구분</th>' +
        '<th style="padding:8px;text-align:left;border-bottom:1px solid #e0e4ea">공간</th>' +
        '<th style="padding:8px;text-align:left;border-bottom:1px solid #e0e4ea">이름</th>' +
        '<th style="padding:8px;text-align:left;border-bottom:1px solid #e0e4ea">소속</th>' +
        '<th style="padding:8px;text-align:left;border-bottom:1px solid #e0e4ea">전화</th>' +
      '</tr></thead>' +
      '<tbody>' +
      filtered.map(function (l) {
        var isIn = l.checkType === '입실';
        var ts = l.timestamp ? new Date(l.timestamp) : null;
        var tStr = ts ? (String(ts.getHours()).padStart(2,'0') + ':' + String(ts.getMinutes()).padStart(2,'0')) : '';
        return '<tr style="border-bottom:1px solid #f0f2f5">' +
          '<td style="padding:8px;color:#5f6368">' + esc(tStr) + '</td>' +
          '<td style="padding:8px"><span style="background:' + (isIn?'#e8f5e9':'#fce4ec') + ';color:' + (isIn?'#2e7d32':'#c62828') + ';border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600">' + esc(l.checkType) + '</span></td>' +
          '<td style="padding:8px">' + esc(l.roomName || l.roomId) + '</td>' +
          '<td style="padding:8px;font-weight:600">' + esc(l.userName) + '</td>' +
          '<td style="padding:8px;color:#5f6368">' + esc(l.affiliation) + '</td>' +
          '<td style="padding:8px;color:#5f6368">' + esc(l.phone) + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function _ciSummaryCard(label, value, bg, color) {
    return '<div style="background:' + bg + ';border-radius:10px;padding:14px 18px">' +
      '<div style="font-size:12px;color:' + color + ';font-weight:600">' + label + '</div>' +
      '<div style="font-size:26px;font-weight:700;color:' + color + '">' + value + '</div>' +
    '</div>';
  }

  /* ── 탭 전환 시 공간/입출입 로드 ── */
  var _spacesLoaded = false;
  var _origTabClick = document.querySelectorAll('.tab-btn');
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tab = btn.dataset.tab;
      if (tab === 'spaces' && !_spacesLoaded) { _spacesLoaded = true; loadSpaces(); }
      if (tab === 'checkin') { loadCheckinLogs(); if (!_spacesLoaded) { _spacesLoaded = true; loadSpaces(); } }
    });
  });

  /* ── 초기 렌더 (로그인 전이라도 캘린더 뷰 타이틀 세팅) ── */
  renderCalendar();

})();
