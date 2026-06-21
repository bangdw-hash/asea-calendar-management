'use strict';
/**
 * tasks-window.js — 나의 할일(Google Tasks) 데스크탑형 양방향 작업창(팝업)
 *  - 부모 캘린더앱과 같은 도메인 → 로그인 토큰(window.opener.Auth / asea_gtoken) 공유
 *  - 복수 선택(동그라미) → 상단 "완료 처리/해제" 버튼으로 일괄 처리
 *  - 드래그로 순서 이동(삽입 위치 라인 표시) + 일자순 정렬(영구 반영, tasks.move)
 *  - 새 할일 + 비고(메모) + 마감일 콤팩트 입력 / 우측 기한 배지
 *  - 변경 시 부모 캘린더(aseaRefreshCalendar) 자동 새로고침
 *  필요 권한: https://www.googleapis.com/auth/tasks + Google Cloud에서 Tasks API 사용설정
 */
(function () {
  var API = 'https://tasks.googleapis.com/tasks/v1';
  var _lists = [];
  var _curList = null;
  var _items = [];                 // 현재 목록의 원본 할일
  var _sel = {};                   // 선택된 taskId 집합
  var _showDone = true;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function token() {
    try { if (window.opener && !window.opener.closed && window.opener.Auth && window.opener.Auth.getToken) { var t = window.opener.Auth.getToken(); if (t) return t; } } catch (e) {}
    try {
      var tk = sessionStorage.getItem('asea_gtoken') || localStorage.getItem('asea_gtoken');
      var exp = parseInt(sessionStorage.getItem('asea_gtoken_exp') || localStorage.getItem('asea_gtoken_exp') || '0', 10);
      if (tk && exp > Date.now()) return tk;
    } catch (e) {}
    return null;
  }
  function refreshOpener() {
    try { if (window.opener && !window.opener.closed && window.opener.aseaRefreshCalendar) window.opener.aseaRefreshCalendar(); } catch (e) {}
  }

  function api(path, method, body) {
    var t = token();
    if (!t) return Promise.reject(new Error('NO_TOKEN'));
    var opts = { method: method || 'GET', headers: { Authorization: 'Bearer ' + t } };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(API + path, opts).then(function (r) {
      if (!r.ok) return r.text().then(function (tx) { throw new Error(r.status + ' ' + tx.slice(0, 300)); });
      return r.status === 204 ? {} : r.json();
    });
  }
  function setStatus(msg, kind) {
    var el = $('tw-status'); if (!el) return;
    el.textContent = msg || '';
    el.className = 'tw-status' + (kind ? ' tw-' + kind : '');
  }

  function dueToYmd(due) { return due ? due.slice(0, 10) : ''; }
  function ymdToDue(s) { return s ? (s + 'T00:00:00.000Z') : null; }

  // 상대 기한 배지
  function dueBadge(due) {
    if (!due) return { txt: '기한없음', cls: 'none' };
    var d = new Date(due.slice(0, 10) + 'T00:00:00');
    var n = new Date(); n = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    var diff = Math.round((d - n) / 86400000);
    if (diff < 0) return { txt: (-diff) + '일 지남', cls: 'over' };
    if (diff === 0) return { txt: '오늘', cls: 'today' };
    if (diff === 1) return { txt: '내일', cls: 'soon' };
    if (diff === 2) return { txt: '모레', cls: 'soon' };
    if (diff <= 7) return { txt: 'D-' + diff, cls: 'wk' };
    return { txt: (d.getMonth() + 1) + '/' + d.getDate(), cls: 'far' };
  }

  /* ── 목록 로딩 ── */
  function loadLists() {
    setStatus('할일 목록 불러오는 중…');
    return api('/users/@me/lists?maxResults=100').then(function (d) {
      _lists = (d && d.items) || [];
      if (!_lists.length) { renderEmpty('할일 목록이 없습니다. 구글 할일에서 목록을 먼저 만들어 주세요.'); return; }
      if (!_curList || !_lists.find(function (l) { return l.id === _curList; })) _curList = _lists[0].id;
      renderListTabs();
      return loadTasks();
    }).catch(handleErr);
  }
  function renderListTabs() {
    var bar = $('tw-lists');
    bar.innerHTML = _lists.map(function (l) {
      return '<button class="tw-listtab' + (l.id === _curList ? ' active' : '') + '" data-id="' + esc(l.id) + '">' + esc(l.title) + '</button>';
    }).join('');
    bar.querySelectorAll('.tw-listtab').forEach(function (b) {
      b.addEventListener('click', function () { _curList = b.dataset.id; _sel = {}; renderListTabs(); loadTasks(); });
    });
  }

  /* ── 할일 로딩 ── */
  function loadTasks() {
    if (!_curList) return Promise.resolve();
    setStatus('불러오는 중…');
    return api('/lists/' + encodeURIComponent(_curList) + '/tasks?maxResults=100&showCompleted=true&showHidden=true')
      .then(function (d) {
        _items = (d && d.items) || [];
        // 선택 집합에서 사라진 항목 정리
        var ids = {}; _items.forEach(function (t) { ids[t.id] = 1; });
        Object.keys(_sel).forEach(function (k) { if (!ids[k]) delete _sel[k]; });
        render();
        setStatus('');
      }).catch(handleErr);
  }

  // 기본 순서: API가 주는 position(수동 순서) 유지. 완료는 별도 섹션.
  function pendingItems() { return _items.filter(function (t) { return t.status !== 'completed'; }); }
  function doneItems() {
    return _items.filter(function (t) { return t.status === 'completed'; })
      .sort(function (a, b) { return (b.completed || '') < (a.completed || '') ? -1 : 1; });
  }

  function render() {
    var box = $('tw-tasks');
    var pend = pendingItems();
    var done = doneItems();
    var html = '';
    if (!_items.length) {
      html = '<p class="tw-empty">할일이 없습니다.\n위에서 새 할일을 추가해 보세요.</p>';
    } else {
      html += '<div class="tw-group" id="tw-pend">' + (pend.length ? pend.map(function (t) { return taskRow(t, true); }).join('') : '<p class="tw-empty tw-empty-sm">미완료 할일이 없습니다.</p>') + '</div>';
    }
    box.innerHTML = html;
    box.querySelectorAll('.tw-task').forEach(bindRow);
    if (pend.length) enableDnD($('tw-pend'));

    // 완료 섹션
    var dbox = $('tw-done-wrap');
    if (!done.length) { dbox.innerHTML = ''; }
    else {
      dbox.innerHTML =
        '<div class="tw-done-head"><label><input type="checkbox" id="tw-showdone"' + (_showDone ? ' checked' : '') + '> 완료 ' + done.length + '개 표시</label></div>' +
        (_showDone ? '<div class="tw-group">' + done.map(function (t) { return taskRow(t, false); }).join('') + '</div>' : '');
      dbox.querySelectorAll('.tw-task').forEach(bindRow);
      var sd = $('tw-showdone'); if (sd) sd.addEventListener('change', function () { _showDone = sd.checked; render(); });
    }
    renderSelBar();
  }

  function taskRow(t, draggable) {
    var b = dueBadge(t.due);
    var done = t.status === 'completed';
    var seld = !!_sel[t.id];
    return '' +
      '<div class="tw-task' + (done ? ' is-done' : '') + (seld ? ' is-sel' : '') + '"' + (draggable ? ' draggable="true"' : '') + ' data-id="' + esc(t.id) + '">' +
        (draggable ? '<span class="tw-grip" title="드래그하여 순서 이동">⠿</span>' : '<span class="tw-grip tw-grip-off"></span>') +
        '<button class="tw-sel' + (seld ? ' on' : '') + '" title="선택">' + (seld ? '✓' : '') + '</button>' +
        '<div class="tw-main">' +
          '<div class="tw-title">' + esc(t.title || '(제목 없음)') + '</div>' +
          (t.notes ? '<div class="tw-notes">' + esc(t.notes) + '</div>' : '') +
        '</div>' +
        '<span class="tw-due tw-due-' + b.cls + '">' + b.txt + '</span>' +
        '<button class="tw-edit" title="수정">✏️</button>' +
        '<button class="tw-del" title="삭제">🗑️</button>' +
      '</div>';
  }

  function bindRow(row) {
    var id = row.dataset.id;
    row.querySelector('.tw-sel').addEventListener('click', function (e) {
      e.stopPropagation();
      if (_sel[id]) delete _sel[id]; else _sel[id] = 1;
      row.classList.toggle('is-sel', !!_sel[id]);
      row.querySelector('.tw-sel').classList.toggle('on', !!_sel[id]);
      row.querySelector('.tw-sel').textContent = _sel[id] ? '✓' : '';
      renderSelBar();
    });
    row.querySelector('.tw-del').addEventListener('click', function (e) { e.stopPropagation(); delTask(id); });
    row.querySelector('.tw-edit').addEventListener('click', function (e) { e.stopPropagation(); openEdit(id); });
  }

  /* ── 선택 바(완료 처리/해제) ── */
  function renderSelBar() {
    var bar = $('tw-selbar');
    var n = Object.keys(_sel).length;
    if (!n) { bar.hidden = true; return; }
    bar.hidden = false;
    $('tw-selcount').textContent = n + '개 선택';
  }
  function selectedIds() { return Object.keys(_sel); }

  async function bulkComplete(makeDone) {
    var ids = selectedIds();
    if (!ids.length) return;
    setStatus((makeDone ? '완료 처리' : '완료 해제') + ' 중… (' + ids.length + '개)');
    var body = makeDone ? { status: 'completed' } : { status: 'needsAction', completed: null };
    var fail = 0;
    for (var i = 0; i < ids.length; i++) {
      try { await api('/lists/' + encodeURIComponent(_curList) + '/tasks/' + encodeURIComponent(ids[i]), 'PATCH', body); }
      catch (e) { fail++; }
    }
    _sel = {};
    await loadTasks(); refreshOpener();
    setStatus(fail ? (fail + '개 실패') : '', fail ? 'err' : '');
  }

  /* ── 추가 / 삭제 / 수정 ── */
  function addTask() {
    var titleEl = $('tw-new-title'), notesEl = $('tw-new-notes'), dueEl = $('tw-new-due');
    var title = (titleEl.value || '').trim();
    if (!title) { titleEl.focus(); return; }
    if (!_curList) return;
    setStatus('추가 중…');
    var body = { title: title };
    if ((notesEl.value || '').trim()) body.notes = notesEl.value.trim();
    if (dueEl.value) body.due = ymdToDue(dueEl.value);
    api('/lists/' + encodeURIComponent(_curList) + '/tasks', 'POST', body).then(function () {
      titleEl.value = ''; notesEl.value = '';
      return loadTasks();
    }).then(refreshOpener).catch(handleErr);
  }
  function delTask(id) {
    if (!confirm('이 할일을 삭제할까요?')) return;
    setStatus('삭제 중…');
    api('/lists/' + encodeURIComponent(_curList) + '/tasks/' + encodeURIComponent(id), 'DELETE')
      .then(loadTasks).then(refreshOpener).catch(handleErr);
  }
  function openEdit(id) {
    var t = _items.find(function (x) { return x.id === id; });
    if (!t) return;
    $('tw-edit-title').value = t.title || '';
    $('tw-edit-notes').value = t.notes || '';
    $('tw-edit-due').value = dueToYmd(t.due);
    var modal = $('tw-edit-modal'); modal.hidden = false; modal.dataset.id = id;
  }
  function saveEdit() {
    var modal = $('tw-edit-modal'); var id = modal.dataset.id;
    var body = {
      title: ($('tw-edit-title').value || '').trim() || '(제목 없음)',
      notes: $('tw-edit-notes').value || '',
      due: $('tw-edit-due').value ? ymdToDue($('tw-edit-due').value) : null
    };
    setStatus('저장 중…');
    api('/lists/' + encodeURIComponent(_curList) + '/tasks/' + encodeURIComponent(id), 'PATCH', body)
      .then(function () { modal.hidden = true; return loadTasks(); }).then(refreshOpener).catch(handleErr);
  }

  /* ── 순서 이동(드래그) ── */
  function move(taskId, previousId) {
    var q = '/lists/' + encodeURIComponent(_curList) + '/tasks/' + encodeURIComponent(taskId) + '/move';
    if (previousId) q += '?previous=' + encodeURIComponent(previousId);
    return api(q, 'POST');
  }
  var _dragId = null;
  function enableDnD(group) {
    var rows = [].slice.call(group.querySelectorAll('.tw-task'));
    rows.forEach(function (row) {
      row.addEventListener('dragstart', function (e) {
        _dragId = row.dataset.id; row.classList.add('dragging');
        try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', _dragId); } catch (_) {}
      });
      row.addEventListener('dragend', function () {
        row.classList.remove('dragging');
        group.querySelectorAll('.drop-before,.drop-after').forEach(function (x) { x.classList.remove('drop-before', 'drop-after'); });
      });
      row.addEventListener('dragover', function (e) {
        e.preventDefault();
        group.querySelectorAll('.drop-before,.drop-after').forEach(function (x) { x.classList.remove('drop-before', 'drop-after'); });
        var r = row.getBoundingClientRect();
        var after = (e.clientY - r.top) > r.height / 2;
        row.classList.add(after ? 'drop-after' : 'drop-before');
      });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        var after = row.classList.contains('drop-after');
        group.querySelectorAll('.drop-before,.drop-after').forEach(function (x) { x.classList.remove('drop-before', 'drop-after'); });
        var targetId = row.dataset.id;
        if (!_dragId || _dragId === targetId) return;
        doReorder(_dragId, targetId, after);
      });
    });
  }
  function doReorder(dragId, targetId, after) {
    var order = pendingItems().map(function (t) { return t.id; });
    order = order.filter(function (id) { return id !== dragId; });
    var idx = order.indexOf(targetId);
    var insertAt = after ? idx + 1 : idx;
    order.splice(insertAt, 0, dragId);
    var prev = insertAt > 0 ? order[insertAt - 1] : '';
    setStatus('순서 변경 중…');
    move(dragId, prev).then(loadTasks).then(refreshOpener).catch(handleErr);
  }

  /* ── 일자순 정렬(영구) ── */
  async function sortByDate() {
    var pend = pendingItems().slice().sort(function (a, b) {
      var au = a.due ? a.due.slice(0, 10) : '9999-99-99';
      var bu = b.due ? b.due.slice(0, 10) : '9999-99-99';
      if (au !== bu) return au < bu ? -1 : 1;
      return (a.title || '').localeCompare(b.title || '');
    });
    if (pend.length < 2) return;
    setStatus('일자순 정렬 중…');
    var prev = '';
    for (var i = 0; i < pend.length; i++) {
      try { await move(pend[i].id, prev); prev = pend[i].id; } catch (e) {}
    }
    await loadTasks(); refreshOpener();
    setStatus('');
  }

  function renderEmpty(msg) { $('tw-tasks').innerHTML = '<p class="tw-empty">' + esc(msg) + '</p>'; var d = $('tw-done-wrap'); if (d) d.innerHTML = ''; setStatus(''); }

  function handleErr(e) {
    var m = (e && e.message) || String(e);
    if (m === 'NO_TOKEN') { renderEmpty('로그인이 필요합니다.\n메인 캘린더 창에서 로그인한 뒤 다시 열어 주세요.'); setStatus('로그인 필요', 'err'); return; }
    if (/^401/.test(m)) { renderEmpty('로그인이 만료되었거나 권한이 없습니다.\n메인 창에서 로그아웃 후 다시 로그인하여 "할일(Tasks)" 권한을 허용해 주세요.'); setStatus('인증 오류(401)', 'err'); return; }
    if (/^403/.test(m)) { renderEmpty('권한/설정 오류(403)\n· 메인 창에서 재로그인하여 할일 권한 허용\n· 관리자는 Google Cloud에서 Tasks API 사용 설정 필요'); setStatus('권한/설정 오류(403)', 'err'); return; }
    renderEmpty('오류: ' + m); setStatus('오류', 'err');
  }

  function init() {
    $('tw-add-btn').addEventListener('click', addTask);
    $('tw-new-title').addEventListener('keydown', function (e) { if (e.key === 'Enter') addTask(); });
    $('tw-new-notes').addEventListener('keydown', function (e) { if (e.key === 'Enter') addTask(); });
    $('tw-refresh').addEventListener('click', loadLists);
    $('tw-open-google').addEventListener('click', function () { window.open('https://tasks.google.com/', '_blank'); });
    $('tw-sortdate').addEventListener('click', sortByDate);
    $('tw-complete').addEventListener('click', function () { bulkComplete(true); });
    $('tw-uncomplete').addEventListener('click', function () { bulkComplete(false); });
    $('tw-clearsel').addEventListener('click', function () { _sel = {}; render(); });
    $('tw-edit-save').addEventListener('click', saveEdit);
    $('tw-edit-cancel').addEventListener('click', function () { $('tw-edit-modal').hidden = true; });
    $('tw-new-due').value = ymd(new Date());

    if (!token()) { renderEmpty('로그인이 필요합니다.\n메인 캘린더 창에서 로그인한 뒤 이 창을 다시 열어 주세요.'); setStatus('로그인 필요', 'err'); return; }
    loadLists();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
