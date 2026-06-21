'use strict';
/**
 * tasks-window.js — 나의 할일(Google Tasks) 데스크탑형 양방향 작업창(팝업)
 *  - 토큰은 현재 로그인 Google 계정 기준(window.opener.Auth / asea_gtoken) → Tasks·Calendar 모두 계정 기준 클라우드 동기화
 *  - 복수 선택(동그라미) → "완료 처리/해제" 일괄 + "구글캘린더 등록"
 *  - 등록할 캘린더 불러오기 / 이미 등록된 할일 배지(계정별 클라우드 공유: tasks_imported)
 *  - 드래그 순서 이동 + 일자순 정렬(tasks.move)
 *  - 새 할일 + 비고 + 마감일(기본 오늘) + 시간(선택) — 시간은 비고 마커로 보존(전 단말 공유)
 */
(function () {
  var API = 'https://tasks.googleapis.com/tasks/v1';
  var CAL = 'https://www.googleapis.com/calendar/v3';
  var TZ = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul'; } catch (e) { return 'Asia/Seoul'; } })();
  var _lists = [], _curList = null, _items = [], _sel = {}, _showDone = true, _imp = {};

  var IC = {
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.05 2.05 0 0 1 2.9 2.9L7.5 19.3 3 20.5l1.2-4.5z"/></svg>',
    del:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
    cal:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="8.5 15 10.5 17 15 12.5"/></svg>'
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }

  function token() {
    try { if (window.opener && !window.opener.closed && window.opener.Auth && window.opener.Auth.getToken) { var t = window.opener.Auth.getToken(); if (t) return t; } } catch (e) {}
    try {
      var tk = sessionStorage.getItem('asea_gtoken') || localStorage.getItem('asea_gtoken');
      var exp = parseInt(sessionStorage.getItem('asea_gtoken_exp') || localStorage.getItem('asea_gtoken_exp') || '0', 10);
      if (tk && exp > Date.now()) return tk;
    } catch (e) {}
    return null;
  }
  function refreshOpener() { try { if (window.opener && !window.opener.closed && window.opener.aseaRefreshCalendar) window.opener.aseaRefreshCalendar(); } catch (e) {} }

  function api(path, method, body) {
    var t = token(); if (!t) return Promise.reject(new Error('NO_TOKEN'));
    var opts = { method: method || 'GET', headers: { Authorization: 'Bearer ' + t } };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(API + path, opts).then(function (r) { if (!r.ok) return r.text().then(function (tx) { throw new Error(r.status + ' ' + tx.slice(0, 300)); }); return r.status === 204 ? {} : r.json(); });
  }
  function calApi(path, method, body) {
    var t = token(); if (!t) return Promise.reject(new Error('NO_TOKEN'));
    var opts = { method: method || 'GET', headers: { Authorization: 'Bearer ' + t } };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(CAL + path, opts).then(function (r) { if (!r.ok) return r.text().then(function (tx) { throw new Error(r.status + ' ' + tx.slice(0, 300)); }); return r.json(); });
  }
  function setStatus(msg, kind) { var el = $('tw-status'); if (!el) return; el.textContent = msg || ''; el.className = 'tw-status' + (kind ? ' tw-' + kind : ''); }

  function dueToYmd(due) { return due ? due.slice(0, 10) : ''; }
  function ymdToDue(s) { return s ? (s + 'T00:00:00.000Z') : null; }

  /* 시간은 Tasks API가 저장 못하므로 비고 마커 [⏰HH:MM] 로 보존(전 단말 공유) */
  function splitTime(notes) {
    notes = notes || '';
    var m = notes.match(/\s*\[⏰\s*(\d{1,2}:\d{2})\]\s*$/);
    if (m) { var hm = m[1]; if (hm.length === 4) hm = '0' + hm; return { time: hm, notes: notes.slice(0, m.index).replace(/\s+$/, '') }; }
    return { time: '', notes: notes };
  }
  function joinTime(notes, time) { notes = (notes || '').trim(); if (time) return (notes ? notes + '\n' : '') + '[⏰' + time + ']'; return notes; }

  function dueBadge(due, time) {
    if (!due) return time ? { txt: time, cls: 'soon' } : { txt: '기한없음', cls: 'none' };
    var d = new Date(due.slice(0, 10) + 'T00:00:00');
    var n = new Date(); n = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    var diff = Math.round((d - n) / 86400000);
    var base, cls;
    if (diff < 0) { base = (-diff) + '일 지남'; cls = 'over'; }
    else if (diff === 0) { base = '오늘'; cls = 'today'; }
    else if (diff === 1) { base = '내일'; cls = 'soon'; }
    else if (diff === 2) { base = '모레'; cls = 'soon'; }
    else if (diff <= 7) { base = 'D-' + diff; cls = 'wk'; }
    else { base = (d.getMonth() + 1) + '/' + d.getDate(); cls = 'far'; }
    return { txt: base + (time ? ' ' + time : ''), cls: cls };
  }

  /* 캘린더 등록 기록 — 메인앱과 동일 키 + 계정별 클라우드 동기화 */
  function userEmail() {
    try { var e = localStorage.getItem('asea_user_email'); if (e) return e; } catch (x) {}
    return '';
  }
  function impKey() { return 'asea_tasks_imported_' + userEmail(); }
  function impLoad() { try { return JSON.parse(localStorage.getItem(impKey()) || '{}'); } catch (e) { return {}; } }
  function impSave(o) { try { localStorage.setItem(impKey(), JSON.stringify(o)); } catch (e) {} }
  function impCloudPull(cb) {
    if (!(window.CloudForms && CloudForms.list) || !userEmail()) { if (cb) cb(); return; }
    CloudForms.list('tasks_imported').then(function (res) {
      try {
        var row = (res.rows || []).find(function (r) { return r.ref === userEmail(); });
        if (row && row.data && row.data.map) impSave(Object.assign({}, row.data.map, impLoad())); // 합집합
      } catch (e) {}
      if (cb) cb();
    }).catch(function () { if (cb) cb(); });
  }
  function impCloudPush() {
    if (!(window.CloudForms && CloudForms.save) || !userEmail()) return;
    try { CloudForms.save('tasks_imported', userEmail(), userEmail(), 'state', { map: impLoad(), updatedAt: Date.now() }); } catch (e) {}
  }

  /* ── 목록 ── */
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
    bar.innerHTML = _lists.map(function (l) { return '<button class="tw-listtab' + (l.id === _curList ? ' active' : '') + '" data-id="' + esc(l.id) + '">' + esc(l.title) + '</button>'; }).join('');
    bar.querySelectorAll('.tw-listtab').forEach(function (b) { b.addEventListener('click', function () { _curList = b.dataset.id; _sel = {}; renderListTabs(); loadTasks(); }); });
  }

  function loadTasks() {
    if (!_curList) return Promise.resolve();
    setStatus('불러오는 중…');
    return api('/lists/' + encodeURIComponent(_curList) + '/tasks?maxResults=100&showCompleted=true&showHidden=true')
      .then(function (d) {
        _items = (d && d.items) || [];
        var ids = {}; _items.forEach(function (t) { ids[t.id] = 1; });
        Object.keys(_sel).forEach(function (k) { if (!ids[k]) delete _sel[k]; });
        render(); setStatus('');
      }).catch(handleErr);
  }

  function pendingItems() { return _items.filter(function (t) { return t.status !== 'completed'; }); }
  function doneItems() { return _items.filter(function (t) { return t.status === 'completed'; }).sort(function (a, b) { return (b.completed || '') < (a.completed || '') ? -1 : 1; }); }

  function render() {
    _imp = impLoad();
    var box = $('tw-tasks'), pend = pendingItems(), done = doneItems(), html = '';
    if (!_items.length) html = '<p class="tw-empty">할일이 없습니다.\n위에서 새 할일을 추가해 보세요.</p>';
    else html += '<div class="tw-group" id="tw-pend">' + (pend.length ? pend.map(function (t) { return taskRow(t, true); }).join('') : '<p class="tw-empty tw-empty-sm">미완료 할일이 없습니다.</p>') + '</div>';
    box.innerHTML = html;
    box.querySelectorAll('.tw-task').forEach(bindRow);
    if (pend.length) enableDnD($('tw-pend'));

    var dbox = $('tw-done-wrap');
    if (!done.length) dbox.innerHTML = '';
    else {
      dbox.innerHTML = '<div class="tw-done-head"><label><input type="checkbox" id="tw-showdone"' + (_showDone ? ' checked' : '') + '> 완료 ' + done.length + '개 표시</label></div>' +
        (_showDone ? '<div class="tw-group">' + done.map(function (t) { return taskRow(t, false); }).join('') + '</div>' : '');
      dbox.querySelectorAll('.tw-task').forEach(bindRow);
      var sd = $('tw-showdone'); if (sd) sd.addEventListener('change', function () { _showDone = sd.checked; render(); });
    }
    renderSelBar();
  }

  function taskRow(t, draggable) {
    var st = splitTime(t.notes);
    var b = dueBadge(t.due, st.time);
    var done = t.status === 'completed', seld = !!_sel[t.id], reg = !!_imp[t.id];
    return '' +
      '<div class="tw-task' + (done ? ' is-done' : '') + (seld ? ' is-sel' : '') + '"' + (draggable ? ' draggable="true"' : '') + ' data-id="' + esc(t.id) + '">' +
        (draggable ? '<span class="tw-grip" title="드래그하여 순서 이동">⠿</span>' : '<span class="tw-grip tw-grip-off"></span>') +
        '<button class="tw-sel' + (seld ? ' on' : '') + '" title="선택">' + (seld ? '✓' : '') + '</button>' +
        '<div class="tw-main">' +
          '<div class="tw-title">' + esc(t.title || '(제목 없음)') + (reg ? '<span class="tw-reg" title="구글캘린더에 등록됨">' + IC.cal + '</span>' : '') + '</div>' +
          (st.notes ? '<div class="tw-notes">' + esc(st.notes) + '</div>' : '') +
        '</div>' +
        '<span class="tw-due tw-due-' + b.cls + '">' + esc(b.txt) + '</span>' +
        '<button class="tw-icon tw-edit" title="수정">' + IC.edit + '</button>' +
        '<button class="tw-icon tw-del" title="삭제">' + IC.del + '</button>' +
      '</div>';
  }

  function bindRow(row) {
    var id = row.dataset.id;
    row.querySelector('.tw-sel').addEventListener('click', function (e) {
      e.stopPropagation();
      if (_sel[id]) delete _sel[id]; else _sel[id] = 1;
      var on = !!_sel[id];
      row.classList.toggle('is-sel', on);
      var sb = row.querySelector('.tw-sel'); sb.classList.toggle('on', on); sb.textContent = on ? '✓' : '';
      renderSelBar();
    });
    row.querySelector('.tw-del').addEventListener('click', function (e) { e.stopPropagation(); delTask(id); });
    row.querySelector('.tw-edit').addEventListener('click', function (e) { e.stopPropagation(); openEdit(id); });
  }

  function renderSelBar() { var bar = $('tw-selbar'), n = Object.keys(_sel).length; if (!n) { bar.hidden = true; return; } bar.hidden = false; $('tw-selcount').textContent = n + '개 선택'; }
  function selectedIds() { return Object.keys(_sel); }

  async function bulkComplete(makeDone) {
    var ids = selectedIds(); if (!ids.length) return;
    setStatus((makeDone ? '완료 처리' : '완료 해제') + ' 중… (' + ids.length + '개)');
    var body = makeDone ? { status: 'completed' } : { status: 'needsAction', completed: null }, fail = 0;
    for (var i = 0; i < ids.length; i++) { try { await api('/lists/' + encodeURIComponent(_curList) + '/tasks/' + encodeURIComponent(ids[i]), 'PATCH', body); } catch (e) { fail++; } }
    _sel = {}; await loadTasks(); refreshOpener();
    setStatus(fail ? (fail + '개 실패') : '', fail ? 'err' : '');
  }

  /* ── 구글캘린더 등록 ── */
  function loadCalendars() {
    var sel = $('tw-cal'); sel.innerHTML = '<option value="">불러오는 중…</option>';
    calApi('/users/me/calendarList?maxResults=250').then(function (d) {
      var items = ((d && d.items) || []).filter(function (c) { return c.accessRole === 'owner' || c.accessRole === 'writer'; });
      if (!items.length) { sel.innerHTML = '<option value="">쓰기 가능한 캘린더 없음</option>'; return; }
      items.sort(function (a, b) { return (b.primary ? 1 : 0) - (a.primary ? 1 : 0); });
      sel.innerHTML = items.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.summaryOverride || c.summary) + (c.primary ? ' (기본)' : '') + '</option>'; }).join('');
    }).catch(function () { sel.innerHTML = '<option value="">불러오기 실패</option>'; setStatus('캘린더 목록 오류', 'err'); });
  }

  async function registerSelected() {
    var ids = selectedIds();
    if (!ids.length) { alert('먼저 등록할 할일을 동그라미로 선택하세요.'); return; }
    var sel = $('tw-cal'), calId = sel.value;
    if (!calId) { alert('등록할 캘린더를 먼저 불러와 선택하세요. (↻ 버튼)'); return; }
    var calName = (sel.selectedOptions[0] || {}).textContent || '';
    var imp = impLoad();
    var targets = ids.map(function (id) { return _items.find(function (t) { return t.id === id; }); }).filter(Boolean);
    var todo = targets.filter(function (t) { return !imp[t.id]; }), skip = targets.length - todo.length;
    if (!todo.length) { alert('선택한 할일은 이미 캘린더에 등록되어 있습니다.'); return; }
    if (!confirm('“' + calName + '” 캘린더에 ' + todo.length + '개를 등록할까요?' + (skip ? ('\n(이미 등록된 ' + skip + '개 제외)') : ''))) return;
    setStatus('캘린더 등록 중…');
    var ok = 0, fail = 0;
    for (var i = 0; i < todo.length; i++) {
      var t = todo[i], st = splitTime(t.notes);
      var dt = t.due ? t.due.slice(0, 10) : today();
      var body;
      if (st.time) {
        var startISO = dt + 'T' + st.time + ':00';
        var endD = new Date(startISO); endD.setHours(endD.getHours() + 1);
        var endISO = ymd(endD) + 'T' + pad(endD.getHours()) + ':' + pad(endD.getMinutes()) + ':00';
        body = { summary: t.title, start: { dateTime: startISO, timeZone: TZ }, end: { dateTime: endISO, timeZone: TZ } };
      } else {
        var nd = new Date(dt + 'T00:00:00'); nd.setDate(nd.getDate() + 1);
        body = { summary: t.title, start: { date: dt }, end: { date: ymd(nd) } };
      }
      body.description = (st.notes ? st.notes + '\n\n' : '') + '[나의 할일에서 등록]';
      try { var r = await calApi('/calendars/' + encodeURIComponent(calId) + '/events', 'POST', body); imp[t.id] = { eventId: (r && r.id) || '', calId: calId, at: Date.now() }; ok++; }
      catch (e) { fail++; }
    }
    impSave(imp); impCloudPush(); _sel = {};
    await loadTasks(); refreshOpener();
    setStatus('캘린더 등록 완료: ' + ok + '개' + (fail ? (' · 실패 ' + fail) : ''), fail ? 'err' : '');
  }

  /* ── 추가/삭제/수정 ── */
  function addTask() {
    var titleEl = $('tw-new-title'), notesEl = $('tw-new-notes'), dueEl = $('tw-new-due'), timeEl = $('tw-new-time');
    var title = (titleEl.value || '').trim();
    if (!title) { titleEl.focus(); return; }
    if (!_curList) return;
    setStatus('추가 중…');
    var body = { title: title };
    var notes = joinTime((notesEl.value || '').trim(), timeEl.value || '');
    if (notes) body.notes = notes;
    if (dueEl.value) body.due = ymdToDue(dueEl.value);
    api('/lists/' + encodeURIComponent(_curList) + '/tasks', 'POST', body).then(function () {
      titleEl.value = ''; notesEl.value = ''; timeEl.value = ''; dueEl.value = today();
      return loadTasks();
    }).then(refreshOpener).catch(handleErr);
  }
  function delTask(id) {
    if (!confirm('이 할일을 삭제할까요?')) return;
    setStatus('삭제 중…');
    api('/lists/' + encodeURIComponent(_curList) + '/tasks/' + encodeURIComponent(id), 'DELETE').then(loadTasks).then(refreshOpener).catch(handleErr);
  }
  function openEdit(id) {
    var t = _items.find(function (x) { return x.id === id; }); if (!t) return;
    var st = splitTime(t.notes);
    $('tw-edit-title').value = t.title || ''; $('tw-edit-notes').value = st.notes; $('tw-edit-time').value = st.time; $('tw-edit-due').value = dueToYmd(t.due);
    var modal = $('tw-edit-modal'); modal.hidden = false; modal.dataset.id = id;
  }
  function saveEdit() {
    var modal = $('tw-edit-modal'), id = modal.dataset.id;
    var notes = joinTime(($('tw-edit-notes').value || '').trim(), $('tw-edit-time').value || '');
    var body = {
      title: ($('tw-edit-title').value || '').trim() || '(제목 없음)',
      notes: notes,
      due: $('tw-edit-due').value ? ymdToDue($('tw-edit-due').value) : null
    };
    setStatus('저장 중…');
    api('/lists/' + encodeURIComponent(_curList) + '/tasks/' + encodeURIComponent(id), 'PATCH', body)
      .then(function () { modal.hidden = true; return loadTasks(); }).then(refreshOpener).catch(handleErr);
  }

  /* ── 드래그 순서 ── */
  function move(taskId, previousId) { var q = '/lists/' + encodeURIComponent(_curList) + '/tasks/' + encodeURIComponent(taskId) + '/move'; if (previousId) q += '?previous=' + encodeURIComponent(previousId); return api(q, 'POST'); }
  var _dragId = null;
  function enableDnD(group) {
    [].slice.call(group.querySelectorAll('.tw-task')).forEach(function (row) {
      row.addEventListener('dragstart', function (e) { _dragId = row.dataset.id; row.classList.add('dragging'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', _dragId); } catch (_) {} });
      row.addEventListener('dragend', function () { row.classList.remove('dragging'); group.querySelectorAll('.drop-before,.drop-after').forEach(function (x) { x.classList.remove('drop-before', 'drop-after'); }); });
      row.addEventListener('dragover', function (e) {
        e.preventDefault();
        group.querySelectorAll('.drop-before,.drop-after').forEach(function (x) { x.classList.remove('drop-before', 'drop-after'); });
        var r = row.getBoundingClientRect();
        row.classList.add((e.clientY - r.top) > r.height / 2 ? 'drop-after' : 'drop-before');
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
    var order = pendingItems().map(function (t) { return t.id; }).filter(function (id) { return id !== dragId; });
    var idx = order.indexOf(targetId), insertAt = after ? idx + 1 : idx;
    order.splice(insertAt, 0, dragId);
    var prev = insertAt > 0 ? order[insertAt - 1] : '';
    setStatus('순서 변경 중…');
    move(dragId, prev).then(loadTasks).then(refreshOpener).catch(handleErr);
  }
  async function sortByDate() {
    var pend = pendingItems().slice().sort(function (a, b) {
      var au = a.due ? a.due.slice(0, 10) : '9999-99-99', bu = b.due ? b.due.slice(0, 10) : '9999-99-99';
      if (au !== bu) return au < bu ? -1 : 1; return (a.title || '').localeCompare(b.title || '');
    });
    if (pend.length < 2) return;
    setStatus('일자순 정렬 중…');
    var prev = '';
    for (var i = 0; i < pend.length; i++) { try { await move(pend[i].id, prev); prev = pend[i].id; } catch (e) {} }
    await loadTasks(); refreshOpener(); setStatus('');
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
    $('tw-refresh').addEventListener('click', function () { impCloudPull(render); loadLists(); loadCalendars(); });
    $('tw-open-google').addEventListener('click', function () { window.open('https://tasks.google.com/', '_blank'); });
    $('tw-sortdate').addEventListener('click', sortByDate);
    $('tw-complete').addEventListener('click', function () { bulkComplete(true); });
    $('tw-uncomplete').addEventListener('click', function () { bulkComplete(false); });
    $('tw-clearsel').addEventListener('click', function () { _sel = {}; render(); });
    $('tw-cal-reload').addEventListener('click', loadCalendars);
    $('tw-register').addEventListener('click', registerSelected);
    $('tw-edit-save').addEventListener('click', saveEdit);
    $('tw-edit-cancel').addEventListener('click', function () { $('tw-edit-modal').hidden = true; });
    $('tw-new-due').value = today();

    if (!token()) { renderEmpty('로그인이 필요합니다.\n메인 캘린더 창에서 로그인한 뒤 이 창을 다시 열어 주세요.'); setStatus('로그인 필요', 'err'); return; }
    impCloudPull(function () { if (_items.length) render(); });   // 계정별 등록기록 클라우드 회수
    loadLists();
    loadCalendars();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
