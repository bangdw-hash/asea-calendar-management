'use strict';
/**
 * tasks.js — 구글 Tasks(나의 할일) → 캘린더 가져오기  window.TasksModule
 *  - 현재 로그인 계정의 할일 목록(카테고리) 조회
 *  - 마감일 기준 기간 + 대상 캘린더 선택 → 실제 구글 캘린더에 종일 일정으로 일괄 등록
 *  - 등록한 할일 id는 계정별로 기록(asea_tasks_imported_<email>)해 중복 등록 방지
 *  필요 권한: https://www.googleapis.com/auth/tasks.readonly (config.googleScopes) + Tasks API 사용설정
 */
window.TasksModule = (function () {
  var API = 'https://tasks.googleapis.com/tasks/v1';
  var _lists = [];
  var _candidates = [];

  function token() { try { return Auth.getToken(); } catch (e) { return null; } }
  function toast(m, t) { try { if (window.aseaToast) window.aseaToast(m, t || 'info'); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function $(id) { return document.getElementById(id); }

  function api(path) {
    var t = token();
    if (!t) return Promise.reject(new Error('로그인이 필요합니다.'));
    return fetch(API + path, { headers: { Authorization: 'Bearer ' + t } }).then(function (r) {
      if (!r.ok) return r.text().then(function (tx) { throw new Error(r.status + ' ' + tx.slice(0, 200)); });
      return r.json();
    });
  }

  function email() { try { return localStorage.getItem('asea_user_email') || ''; } catch (e) { return ''; } }
  function impKey() { return 'asea_tasks_imported_' + email(); }
  function impLoad() { try { return JSON.parse(localStorage.getItem(impKey()) || '{}'); } catch (e) { return {}; } }
  function impSave(o) { try { localStorage.setItem(impKey(), JSON.stringify(o)); } catch (e) {} }

  /* 패널 토글 */
  function toggle() {
    var panel = $('tasks-import-panel');
    if (!panel) return;
    if (!panel.hidden) { panel.hidden = true; return; }
    var fp = $('calendar-filter-panel'); if (fp) fp.hidden = true;   // 필터 패널과 동시 표시 방지
    panel.hidden = false;
    render();
  }

  function render() {
    var panel = $('tasks-import-panel');
    panel.innerHTML =
      '<div class="filter-panel-header">' +
        '<span class="filter-panel-title">✓ 나의 할일 → 캘린더 가져오기</span>' +
        '<button id="tasks-close" class="btn btn-ghost btn-sm">✕</button>' +
      '</div>' +
      '<div id="tasks-body"><p class="tasks-muted">할일 목록을 불러오는 중…</p></div>';
    $('tasks-close').addEventListener('click', function () { panel.hidden = true; });
    loadLists();
  }

  function loadLists() {
    api('/users/@me/lists?maxResults=100').then(function (d) {
      _lists = (d && d.items) || [];
      renderForm();
    }).catch(function (e) {
      $('tasks-body').innerHTML =
        '<div class="tasks-err"><b>할일을 불러오지 못했습니다.</b><br><span class="tasks-muted">' + esc(e.message) + '</span>' +
        '<ul style="margin:8px 0 0 16px;padding:0">' +
          '<li>처음이면 <b>로그아웃 후 다시 로그인</b>해 <b>Google 할일(Tasks) 권한</b>을 허용하세요.</li>' +
          '<li>403(API not enabled)이면 관리자가 Google Cloud에서 <b>Tasks API</b>를 사용 설정해야 합니다.</li>' +
        '</ul></div>';
    });
  }

  function renderForm() {
    var body = $('tasks-body');
    if (!_lists.length) { body.innerHTML = '<p class="tasks-muted">구글 할일 목록이 없습니다. (구글 할일에서 먼저 항목을 만들어 주세요)</p>'; return; }
    var cals = (typeof CONFIG !== 'undefined' && CONFIG.selectedCalendars) ? CONFIG.selectedCalendars : [];
    var today = new Date();
    var from = new Date(today.getFullYear(), today.getMonth(), 1);
    var to = new Date(today.getFullYear(), today.getMonth() + 3, 0);   // 기본: 이번 달 ~ +2개월(예정 포함)
    var calOpts = cals.length
      ? cals.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('')
      : '<option value="primary">기본 캘린더</option>';
    body.innerHTML =
      '<div class="tasks-row"><label>할일 목록(카테고리)</label>' +
        '<select id="tasks-list" class="form-select">' + _lists.map(function (l) { return '<option value="' + esc(l.id) + '">' + esc(l.title) + '</option>'; }).join('') + '</select></div>' +
      '<div class="tasks-row"><label>기간 (가져올 범위)</label>' +
        '<div class="tasks-range"><input type="date" id="tasks-from" class="form-input" value="' + ymd(from) + '"><span>~</span><input type="date" id="tasks-to" class="form-input" value="' + ymd(to) + '"></div></div>' +
      '<div class="tasks-row"><label>할일을 붙일 캘린더</label>' +
        '<select id="tasks-cal" class="form-select">' + calOpts + '</select></div>' +
      '<div class="tasks-cbrow">' +
        '<label class="tasks-cb"><input type="checkbox" id="tasks-todo" checked> 예정 일정 (오늘 포함)</label>' +
        '<label class="tasks-cb"><input type="checkbox" id="tasks-done" checked> 완료 일정</label></div>' +
      '<div class="tasks-actions">' +
        '<button id="tasks-preview" class="btn btn-secondary btn-sm">미리보기</button>' +
        '<button id="tasks-import" class="btn btn-primary btn-sm" disabled>캘린더에 일괄 등록</button></div>' +
      '<div id="tasks-preview-box"></div>';
    $('tasks-preview').addEventListener('click', preview);
    $('tasks-import').addEventListener('click', doImport);
  }

  // 할일의 '캘린더 표시 날짜' = 마감일 > 완료일 > (정보없으면) 오늘
  function taskDate(t) {
    var s = t.due ? t.due.slice(0, 10) : (t.completed ? t.completed.slice(0, 10) : '');
    return s ? new Date(s + 'T00:00:00') : new Date(new Date().toDateString());
  }
  // 목록의 모든 할일(완료 포함) 페이지네이션으로 수집
  function fetchAll(listId) {
    var out = [];
    function page(tok) {
      var q = '/lists/' + encodeURIComponent(listId) + '/tasks?maxResults=100&showCompleted=true&showHidden=true' + (tok ? '&pageToken=' + encodeURIComponent(tok) : '');
      return api(q).then(function (d) {
        (d.items || []).forEach(function (x) { out.push(x); });
        if (d.nextPageToken && out.length < 1000) return page(d.nextPageToken);
        return out;
      });
    }
    return page(null);
  }
  function gather() {
    var listId = $('tasks-list').value;
    var fromV = $('tasks-from').value, toV = $('tasks-to').value;
    var includeTodo = $('tasks-todo').checked;   // 예정 일정(미완료, 오늘·미래 포함)
    var includeDone = $('tasks-done').checked;   // 완료 일정
    var fromT = fromV ? new Date(fromV + 'T00:00:00').getTime() : -Infinity;
    var toT = toV ? new Date(toV + 'T23:59:59').getTime() : Infinity;
    return fetchAll(listId).then(function (items) {
      var imp = impLoad();
      return items.filter(function (t) {
        if (!t.title) return false;
        var isDone = t.status === 'completed';
        if (isDone ? !includeDone : !includeTodo) return false;   // 상태별 포함 여부
        var dt = taskDate(t).getTime();
        if (dt < fromT || dt > toT) return false;                 // 표시 날짜가 범위 안
        return true;
      }).map(function (t) {
        return { id: t.id, title: t.title, notes: t.notes || '', date: ymd(taskDate(t)),
                 done: t.status === 'completed', already: !!imp[t.id] };
      }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    });
  }

  function preview() {
    var box = $('tasks-preview-box');
    box.innerHTML = '<p class="tasks-muted">불러오는 중…</p>';
    gather().then(function (list) {
      _candidates = list;
      var newCnt = list.filter(function (x) { return !x.already; }).length;
      $('tasks-import').disabled = newCnt === 0;
      if (!list.length) { box.innerHTML = '<p class="tasks-muted">해당 기간에 가져올 할일이 없습니다.</p>'; return; }
      box.innerHTML =
        '<div class="tasks-prev-head">총 ' + list.length + '개 · 신규 ' + newCnt + '개 · 이미 등록 ' + (list.length - newCnt) + '개</div>' +
        '<div class="tasks-prev-list">' + list.map(function (x) {
          return '<div class="tasks-prev-item' + (x.already ? ' is-done' : '') + '"><span class="d">' + x.date + '</span><span class="t">' + esc(x.title) + '</span>' +
            '<span class="badge">' + (x.done ? '완료' : '예정') + '</span>' +
            (x.already ? '<span class="badge">등록됨</span>' : '') + '</div>';
        }).join('') + '</div>';
    }).catch(function (e) { box.innerHTML = '<p class="tasks-err">' + esc(e.message) + '</p>'; });
  }

  async function doImport() {
    var calId = $('tasks-cal').value;
    var calName = ($('tasks-cal').selectedOptions[0] || {}).textContent || '';
    var targets = _candidates.filter(function (x) { return !x.already; });
    if (!targets.length) { toast('새로 등록할 할일이 없습니다.', 'warning'); return; }
    if (!confirm('할일 ' + targets.length + '개를 “' + calName + '” 캘린더에 종일 일정으로 등록합니다. 진행할까요?')) return;
    var btn = $('tasks-import'); btn.disabled = true;
    var imp = impLoad(), ok = 0, fail = 0;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      toast('등록 중… (' + (i + 1) + '/' + targets.length + ')', 'info');
      var nd = new Date(t.date + 'T00:00:00'); nd.setDate(nd.getDate() + 1);
      var body = { summary: (t.done ? '✔ ' : '') + t.title, start: { date: t.date }, end: { date: ymd(nd) },
                   description: (t.notes ? t.notes + '\n\n' : '') + '[Google 할일' + (t.done ? '·완료' : '·예정') + '에서 가져옴]' };
      try { var r = await CalendarModule.createEvent(calId, body); imp[t.id] = { eventId: (r && r.id) || '', at: Date.now() }; ok++; }
      catch (e) { fail++; }
    }
    impSave(imp);
    toast('완료: ' + ok + '개 등록' + (fail ? ' · ' + fail + '개 실패(읽기전용 캘린더?)' : ''), fail ? 'warning' : 'success');
    btn.disabled = false;
    preview();
    try { if (window.aseaRefreshCalendar) window.aseaRefreshCalendar(); } catch (e) {}
  }

  return { toggle: toggle };
})();
