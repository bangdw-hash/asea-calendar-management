'use strict';

/**
 * workorder.js — 작업지시 탭 모듈
 * 메인 앱(관리자/직원)에서 작업지시를 생성·조회·상태변경
 */
var WorkOrderModule = (function () {

  var _panel = null;
  var _orders = [];
  var _staff = [];
  var _filterStatus = 'all';
  var _filterDept = '';
  var _me = null; // { email, name, role, id }

  /* ── 초기화 ─────────────────────────────────────── */
  function init(meInfo) {
    _me = meInfo || {};
    _panel = document.getElementById('tab-workorder');
    if (!_panel) return;
    _bindUI();
    load();
  }

  function _bindUI() {
    var addBtn = document.getElementById('wo-add-btn');
    if (addBtn) addBtn.addEventListener('click', _openModal);

    var statusFilter = document.getElementById('wo-filter-status');
    if (statusFilter) statusFilter.addEventListener('change', function () {
      _filterStatus = this.value;
      _render();
    });

    var deptFilter = document.getElementById('wo-filter-dept');
    if (deptFilter) deptFilter.addEventListener('change', function () {
      _filterDept = this.value;
      _render();
    });

    var refreshBtn = document.getElementById('wo-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', load);

    var saveBtn = document.getElementById('wo-modal-save');
    if (saveBtn) saveBtn.addEventListener('click', _saveOrder);

    var closeBtn = document.getElementById('wo-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', _closeModal);

    var backdrop = document.getElementById('wo-modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', _closeModal);
  }

  async function load() {
    var listEl = document.getElementById('wo-list');
    if (listEl) listEl.innerHTML = '<p class="empty-state">불러오는 중...</p>';
    try {
      _orders = (await SheetsModule.getWorkOrders()) || [];
      // 관리실 인원도 로드 (담당자 선택 목록)
      try { _staff = (await SheetsModule.getManagerStaff()) || []; } catch (e) { _staff = []; }
      _render();
    } catch (e) {
      if (listEl) listEl.innerHTML = '<p class="empty-state" style="color:#e53935">불러오기 실패: ' + e.message + '</p>';
    }
  }

  function _render() {
    var listEl = document.getElementById('wo-list');
    if (!listEl) return;

    var filtered = _orders.filter(function (o) {
      if (_filterStatus !== 'all' && o.status !== _filterStatus) return false;
      if (_filterDept && o.department !== _filterDept) return false;
      return true;
    }).sort(function (a, b) {
      // 최신순
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    if (!filtered.length) {
      listEl.innerHTML = '<p class="empty-state">작업지시 내역이 없습니다.</p>';
      return;
    }

    var priorityColor = { '긴급': '#EA4335', '높음': '#FBBC05', '보통': '#4285F4', '낮음': '#9AA0A6' };
    var statusColor   = { '대기': '#9AA0A6', '진행중': '#1A73E8', '완료': '#34A853', '취소': '#EA4335' };

    listEl.innerHTML = filtered.map(function (o) {
      var pc = priorityColor[o.priority] || '#9AA0A6';
      var sc = statusColor[o.status] || '#9AA0A6';
      var due = o.dueDate ? '📅 ' + o.dueDate : '';
      return '<div class="wo-card" data-id="' + o.id + '" data-row="' + o._row + '">' +
        '<div class="wo-card-header">' +
          '<span class="wo-badge" style="background:' + pc + '">' + (o.priority || '보통') + '</span>' +
          '<span class="wo-badge" style="background:' + sc + '">' + (o.status || '대기') + '</span>' +
          (o.department ? '<span class="wo-dept">' + o.department + '</span>' : '') +
          '<span class="wo-date">' + _fmtDate(o.createdAt) + '</span>' +
        '</div>' +
        '<div class="wo-card-title">' + _esc(o.title) + '</div>' +
        '<div class="wo-card-meta">' +
          '📝 ' + _esc(o.requesterName || o.requesterId || '') +
          (o.assigneeName ? ' → 담당: ' + _esc(o.assigneeName) : '') +
          (due ? ' &nbsp;' + due : '') +
        '</div>' +
        (o.content ? '<div class="wo-card-content">' + _esc(o.content).replace(/\n/g, '<br>') + '</div>' : '') +
        '<div class="wo-card-actions">' +
          _statusButtons(o) +
          '<button class="btn btn-ghost btn-xs wo-edit-btn" data-id="' + o.id + '" data-row="' + o._row + '">수정</button>' +
        '</div>' +
      '</div>';
    }).join('');

    // 이벤트 바인딩
    listEl.querySelectorAll('.wo-status-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _changeStatus(this.dataset.id, this.dataset.row, this.dataset.status);
      });
    });
    listEl.querySelectorAll('.wo-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var order = _orders.find(function (o) { return o.id === btn.dataset.id; });
        if (order) _openModal(null, order);
      });
    });
  }

  function _statusButtons(o) {
    var next = { '대기': '진행중', '진행중': '완료' };
    var nextLabel = { '진행중': '▶ 진행 시작', '완료': '✅ 완료 처리' };
    var result = '';
    if (next[o.status]) {
      var ns = next[o.status];
      result += '<button class="btn btn-secondary btn-xs wo-status-btn" ' +
        'data-id="' + o.id + '" data-row="' + o._row + '" data-status="' + ns + '">' +
        nextLabel[ns] + '</button>';
    }
    if (o.status !== '취소' && o.status !== '완료') {
      result += '<button class="btn btn-ghost btn-xs wo-status-btn" style="color:#EA4335" ' +
        'data-id="' + o.id + '" data-row="' + o._row + '" data-status="취소">취소</button>';
    }
    return result;
  }

  async function _changeStatus(id, row, status) {
    try {
      var completedAt = (status === '완료') ? new Date().toISOString() : '';
      await SheetsModule.updateWorkOrderStatus(Number(row), status, completedAt);
      // 로컬 반영
      var order = _orders.find(function (o) { return o.id === id; });
      if (order) { order.status = status; if (completedAt) order.completedAt = completedAt; }
      _render();
      // 관리실 캘린더 이벤트에도 반영 (있을 경우)
      if (order && order.calEventId && status === '완료') {
        try {
          await CalendarModule.updateEvent('primary', order.calEventId, {
            summary: '[완료] ' + order.title,
            description: order.content + '\n\n✅ 완료: ' + new Date().toLocaleDateString('ko-KR'),
          });
        } catch (e2) {}
      }
    } catch (e) {
      alert('상태 변경 실패: ' + e.message);
    }
  }

  /* ── 모달 ────────────────────────────────────────── */
  var _editOrder = null;

  function _openModal(e, order) {
    _editOrder = order || null;
    var modal = document.getElementById('wo-modal');
    if (!modal) return;

    // 담당자 select 채우기
    var assigneeEl = document.getElementById('wo-assignee');
    if (assigneeEl) {
      assigneeEl.innerHTML = '<option value="">담당자 선택</option>';
      (_staff.filter(function (s) { return s.status !== 'inactive'; })).forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name + (s.shift ? ' (' + s.shift + ')' : '');
        if (_editOrder && _editOrder.assigneeId === s.id) opt.selected = true;
        assigneeEl.appendChild(opt);
      });
    }

    if (_editOrder) {
      document.getElementById('wo-modal-title').textContent = '작업지시 수정';
      document.getElementById('wo-title-input').value = _editOrder.title || '';
      document.getElementById('wo-content-input').value = _editOrder.content || '';
      document.getElementById('wo-priority-select').value = _editOrder.priority || '보통';
      document.getElementById('wo-due-input').value = _editOrder.dueDate || '';
      document.getElementById('wo-dept-input').value = _editOrder.department || '';
      document.getElementById('wo-note-input').value = _editOrder.note || '';
    } else {
      document.getElementById('wo-modal-title').textContent = '작업지시 등록';
      document.getElementById('wo-title-input').value = '';
      document.getElementById('wo-content-input').value = '';
      document.getElementById('wo-priority-select').value = '보통';
      document.getElementById('wo-due-input').value = '';
      document.getElementById('wo-dept-input').value = '';
      document.getElementById('wo-note-input').value = '';
      if (assigneeEl) assigneeEl.value = '';
    }

    modal.hidden = false;
  }

  function _closeModal() {
    var modal = document.getElementById('wo-modal');
    if (modal) modal.hidden = true;
    _editOrder = null;
  }

  async function _saveOrder() {
    var title = (document.getElementById('wo-title-input').value || '').trim();
    if (!title) { alert('제목을 입력하세요.'); return; }

    var assigneeEl = document.getElementById('wo-assignee');
    var assigneeId = assigneeEl ? assigneeEl.value : '';
    var assigneeName = '';
    if (assigneeId) {
      var found = _staff.find(function (s) { return s.id === assigneeId; });
      if (found) assigneeName = found.name;
    }

    var wo = {
      title: title,
      content: document.getElementById('wo-content-input').value || '',
      requesterId: (_me && _me.id) || '',
      requesterName: (_me && _me.name) || (_me && _me.email) || '',
      assigneeId: assigneeId,
      assigneeName: assigneeName,
      department: document.getElementById('wo-dept-input').value || '',
      priority: document.getElementById('wo-priority-select').value || '보통',
      dueDate: document.getElementById('wo-due-input').value || '',
      note: document.getElementById('wo-note-input').value || '',
    };

    var saveBtn = document.getElementById('wo-modal-save');
    if (saveBtn) saveBtn.disabled = true;

    try {
      if (_editOrder) {
        wo.id = _editOrder.id;
        wo.status = _editOrder.status;
        wo.createdAt = _editOrder.createdAt;
        wo.completedAt = _editOrder.completedAt || '';
        wo.calEventId = _editOrder.calEventId || '';
        await SheetsModule.updateWorkOrder(_editOrder._row, wo);
        // 로컬 반영
        Object.assign(_editOrder, wo);
      } else {
        wo.status = '대기';
        var newId = await SheetsModule.createWorkOrder(wo);
        wo.id = newId;

        // 캘린더 등록 (due date 있으면)
        if (wo.dueDate) {
          try {
            var calEvent = await CalendarModule.createEvent('primary', {
              summary: '[작업지시] ' + wo.title,
              description: wo.content + (wo.assigneeName ? '\n담당: ' + wo.assigneeName : ''),
              start: { date: wo.dueDate },
              end: { date: wo.dueDate },
            });
            if (calEvent && calEvent.id) {
              // calEventId 업데이트 (행 번호는 리로드 후 알 수 있으므로 재조회)
              wo.calEventId = calEvent.id;
              try {
                var fresh = await SheetsModule.getWorkOrders();
                var row = fresh.find(function (r) { return r.id === newId; });
                if (row) await SheetsModule.updateWorkOrder(row._row, Object.assign(wo, { _row: row._row }));
              } catch (e3) {}
            }
          } catch (e2) {}
        }

        _orders.unshift(wo);
      }

      _closeModal();
      _render();
    } catch (e) {
      alert('저장 실패: ' + e.message);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  /* ── 유틸 ────────────────────────────────────────── */
  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function _fmtDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0');
    } catch (e) { return iso.slice(0,10); }
  }

  return {
    init: init,
    load: load,
  };

})();
