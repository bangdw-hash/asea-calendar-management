'use strict';
/**
 * tasks-window.js — 나의 할일(Google Tasks) 양방향 작업창(팝업)
 *  - 부모 캘린더앱과 같은 도메인 → 로그인 토큰(window.opener.Auth / localStorage asea_gtoken) 공유
 *  - 할일 목록 조회 + 추가 + 완료/해제 + 제목·메모·마감일 수정 + 삭제 (읽기·쓰기)
 *  - 변경 시 부모 캘린더(window.opener.aseaRefreshCalendar) 자동 새로고침 → 달력 레이어 즉시 반영
 *  필요 권한: https://www.googleapis.com/auth/tasks + Google Cloud에서 Tasks API 사용설정
 */
(function () {
  var API = 'https://tasks.googleapis.com/tasks/v1';
  var _lists = [];
  var _curList = null;
  var _showDone = true;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /* 토큰: 부모창 Auth 우선(가장 최신) → localStorage 폴백 */
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
    var el = $('tw-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'tw-status' + (kind ? ' tw-' + kind : '');
  }

  function dueToYmd(due) { return due ? due.slice(0, 10) : ''; }
  // Tasks API의 due는 RFC3339(UTC 자정). 날짜만 의미 있음.
  function ymdToDue(s) { return s ? (s + 'T00:00:00.000Z') : null; }

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
      b.addEventListener('click', function () { _curList = b.dataset.id; renderListTabs(); loadTasks(); });
    });
  }

  /* ── 할일 로딩 ── */
  function loadTasks() {
    if (!_curList) return Promise.resolve();
    setStatus('불러오는 중…');
    return api('/lists/' + encodeURIComponent(_curList) + '/tasks?maxResults=100&showCompleted=true&showHidden=true')
      .then(function (d) {
        var items = (d && d.items) || [];
        renderTasks(items);
        setStatus('');
      }).catch(handleErr);
  }

  function sortTasks(items) {
    return items.slice().sort(function (a, b) {
      var ad = a.status === 'completed', bd = b.status === 'completed';
      if (ad !== bd) return ad ? 1 : -1;                       // 미완료 먼저
      var au = a.due || '9999', bu = b.due || '9999';          // 마감일 빠른 순
      if (au !== bu) return au < bu ? -1 : 1;
      return (a.title || '').localeCompare(b.title || '');
    });
  }

  function renderTasks(items) {
    var box = $('tw-tasks');
    items = sortTasks(items);
    var pend = items.filter(function (t) { return t.status !== 'completed'; });
    var done = items.filter(function (t) { return t.status === 'completed'; });
    var html = '';
    if (!items.length) {
      html = '<p class="tw-empty">할일이 없습니다. 위에서 새 할일을 추가해 보세요.</p>';
    } else {
      html += pend.map(taskRow).join('');
      if (done.length) {
        html += '<div class="tw-done-head"><label><input type="checkbox" id="tw-toggle-done"' + (_showDone ? ' checked' : '') + '> 완료 ' + done.length + '개 표시</label></div>';
        if (_showDone) html += '<div class="tw-done-list">' + done.map(taskRow).join('') + '</div>';
      }
    }
    box.innerHTML = html;
    box.querySelectorAll('.tw-task').forEach(bindRow);
    var tg = $('tw-toggle-done');
    if (tg) tg.addEventListener('change', function () { _showDone = tg.checked; loadTasks(); });
  }

  function taskRow(t) {
    var done = t.status === 'completed';
    var due = dueToYmd(t.due);
    return '' +
      '<div class="tw-task' + (done ? ' is-done' : '') + '" data-id="' + esc(t.id) + '">' +
        '<button class="tw-check" title="' + (done ? '완료 해제' : '완료 처리') + '">' + (done ? '✔' : '') + '</button>' +
        '<div class="tw-main">' +
          '<div class="tw-title">' + esc(t.title || '(제목 없음)') + '</div>' +
          (t.notes ? '<div class="tw-notes">' + esc(t.notes) + '</div>' : '') +
          (due ? '<div class="tw-due">📅 ' + due + '</div>' : '<div class="tw-due tw-nodue">마감일 없음</div>') +
        '</div>' +
        '<div class="tw-rowbtns">' +
          '<button class="tw-edit" title="수정">✏️</button>' +
          '<button class="tw-del" title="삭제">🗑️</button>' +
        '</div>' +
      '</div>';
  }

  function bindRow(row) {
    var id = row.dataset.id;
    var done = row.classList.contains('is-done');
    row.querySelector('.tw-check').addEventListener('click', function () { toggleComplete(id, !done); });
    row.querySelector('.tw-del').addEventListener('click', function () { delTask(id); });
    row.querySelector('.tw-edit').addEventListener('click', function () { openEdit(id); });
  }

  /* ── 변경 작업 ── */
  function addTask() {
    var titleEl = $('tw-new-title'), dueEl = $('tw-new-due');
    var title = (titleEl.value || '').trim();
    if (!title) { titleEl.focus(); return; }
    if (!_curList) return;
    setStatus('추가 중…');
    var body = { title: title };
    if (dueEl.value) body.due = ymdToDue(dueEl.value);
    api('/lists/' + encodeURIComponent(_curList) + '/tasks', 'POST', body).then(function () {
      titleEl.value = ''; dueEl.value = '';
      return loadTasks();
    }).then(refreshOpener).catch(handleErr);
  }

  function toggleComplete(id, makeDone) {
    setStatus(makeDone ? '완료 처리 중…' : '완료 해제 중…');
    var body = makeDone ? { status: 'completed' } : { status: 'needsAction', completed: null };
    api('/lists/' + encodeURIComponent(_curList) + '/tasks/' + encodeURIComponent(id), 'PATCH', body)
      .then(loadTasks).then(refreshOpener).catch(handleErr);
  }

  function delTask(id) {
    if (!confirm('이 할일을 삭제할까요?')) return;
    setStatus('삭제 중…');
    api('/lists/' + encodeURIComponent(_curList) + '/tasks/' + encodeURIComponent(id), 'DELETE')
      .then(loadTasks).then(refreshOpener).catch(handleErr);
  }

  /* ── 수정 모달 ── */
  function openEdit(id) {
    api('/lists/' + encodeURIComponent(_curList) + '/tasks/' + encodeURIComponent(id)).then(function (t) {
      $('tw-edit-title').value = t.title || '';
      $('tw-edit-notes').value = t.notes || '';
      $('tw-edit-due').value = dueToYmd(t.due);
      var modal = $('tw-edit-modal');
      modal.hidden = false;
      modal.dataset.id = id;
    }).catch(handleErr);
  }
  function saveEdit() {
    var modal = $('tw-edit-modal');
    var id = modal.dataset.id;
    var body = {
      title: ($('tw-edit-title').value || '').trim() || '(제목 없음)',
      notes: $('tw-edit-notes').value || '',
      due: $('tw-edit-due').value ? ymdToDue($('tw-edit-due').value) : null
    };
    setStatus('저장 중…');
    api('/lists/' + encodeURIComponent(_curList) + '/tasks/' + encodeURIComponent(id), 'PATCH', body)
      .then(function () { modal.hidden = true; return loadTasks(); }).then(refreshOpener).catch(handleErr);
  }

  function renderEmpty(msg) { $('tw-tasks').innerHTML = '<p class="tw-empty">' + esc(msg) + '</p>'; setStatus(''); }

  function handleErr(e) {
    var m = (e && e.message) || String(e);
    if (m === 'NO_TOKEN') {
      renderEmpty('로그인이 필요합니다. 메인 캘린더 창에서 로그인한 뒤 다시 열어 주세요.');
      setStatus('로그인 필요', 'err');
      return;
    }
    if (/^401/.test(m)) {
      renderEmpty('로그인이 만료되었거나 권한이 없습니다.\n메인 창에서 로그아웃 후 다시 로그인하여 "할일(Tasks)" 권한을 허용해 주세요.');
      setStatus('인증 오류(401)', 'err');
      return;
    }
    if (/^403/.test(m)) {
      renderEmpty('권한 또는 API 설정 오류(403)\n· 메인 창에서 재로그인하여 할일 권한 허용\n· 관리자는 Google Cloud에서 Tasks API 사용 설정 필요');
      setStatus('권한/설정 오류(403)', 'err');
      return;
    }
    renderEmpty('오류: ' + m);
    setStatus('오류', 'err');
  }

  function init() {
    $('tw-add-btn').addEventListener('click', addTask);
    $('tw-new-title').addEventListener('keydown', function (e) { if (e.key === 'Enter') addTask(); });
    $('tw-refresh').addEventListener('click', loadLists);
    $('tw-edit-save').addEventListener('click', saveEdit);
    $('tw-edit-cancel').addEventListener('click', function () { $('tw-edit-modal').hidden = true; });
    $('tw-open-google').addEventListener('click', function () { window.open('https://tasks.google.com/', '_blank'); });
    // 새 할일 마감일 기본값: 오늘
    $('tw-new-due').value = ymd(new Date());

    if (!token()) {
      renderEmpty('로그인이 필요합니다. 메인 캘린더 창에서 로그인한 뒤 이 창을 다시 열어 주세요.');
      setStatus('로그인 필요', 'err');
      return;
    }
    loadLists();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
