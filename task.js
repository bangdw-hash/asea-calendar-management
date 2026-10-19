'use strict';
/* task.js — 업무진행 평가툴
 * - 로그인: Google ID 토큰 → Edge Function task-auth → 세션 토큰(sessionStorage). 비밀번호 없음.
 * - 데이터: public.tsk_* RPC (권한 검사는 모두 서버). 화면의 버튼 숨김은 편의일 뿐입니다.
 * - 화면 문자열은 반드시 esc()를 거쳐 출력합니다. */
(function () {
  var SUPA = 'https://zbpeyklwpotjyveipzxd.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV5a2x3cG90anl2ZWlwenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTYxMDcsImV4cCI6MjA5NzA5MjEwN30.6JgoQ6rPRnmrbBTG68A-Y9HDQk40mnwubhXVnkZvHrQ';
  var CLIENT_ID = '89094526186-ngj72p8cbqrvai06e2uhdiq0n5brrc2b.apps.googleusercontent.com';
  var KINDS = ['행사', '과정', 'TF', '일반'];
  var ROLES = { admin: '관리자', manager: '부서장', member: '담당자', viewer: '열람' };
  var STL = { ok: '정상', warn: '주의', late: '지연', done: '완료' };
  var ERR = {
    AUTH: '로그인이 만료되었습니다. 다시 로그인해 주십시오.', FORBIDDEN: '이 작업을 할 권한이 없습니다.',
    CONFLICT: '다른 사용자가 먼저 수정했습니다. 최신 내용을 다시 불러왔습니다.', NOT_FOUND: '대상을 찾을 수 없습니다.',
    BAD_TITLE: '업무명은 1~120자로 입력해 주십시오.', BAD_DATES: '마감일이 시작일보다 앞설 수 없습니다.',
    BAD_LINKS: '링크는 https:// 로 시작하는 주소만 최대 10개까지 입력할 수 있습니다.', BAD_OWNER: '담당자는 승인된 구성원이어야 합니다.',
    BAD_ASSIGNEE: '담당자는 승인된 구성원이어야 합니다.', BAD_TEXT: '항목 내용은 1~200자로 입력해 주십시오.',
    TOO_MANY: '등록 가능한 개수를 넘었습니다.', BAD_SCORE: '점수는 1~5 사이여야 합니다.', SELF_LOCK: '본인 또는 기본 관리자의 권한은 낮출 수 없습니다.',
    BAD_STAGES: '단계 이름은 6개 모두 1~14자로 입력해 주십시오.', BAD_FORM: '평가 항목은 1~10개, 이름은 1~20자여야 합니다.',
    BAD_ROWS: '한 번에 가져올 수 있는 행 수를 넘었습니다.', BAD_NAME: '이름은 1~40자로 입력해 주십시오.', BAD_KIND: '구분이 올바르지 않습니다.'
  };

  var S = { tok: null, me: null, cfg: null, tpl: [], members: [], tasks: [], myItems: [], notices: [],
    tab: 'board', view: 'board', sort: { k: 'due', d: 1 }, dr: null, timer: null, lastUnread: -1,
    f: { q: '', kind: '', dept: '', owner: '', status: '', range: '', stage: '', arch: false, mine: false } };
  var TODAY = ymd(new Date());

  /* ---------- 유틸 ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function pd(s) { var a = String(s).slice(0, 10).split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function diff(a, b) { return Math.round((pd(a) - pd(b)) / 864e5); }
  function md(s) { return s ? +s.slice(5, 7) + '/' + +s.slice(8, 10) : '-'; }
  function dt(s) { var d = new Date(s); return isNaN(d) ? '' : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function dday(s) { if (!s) return ''; var d = diff(s, TODAY); return d === 0 ? 'D-day' : d > 0 ? 'D-' + d : 'D+' + (-d); }
  function ico(n) {
    var P = { plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M18 6L6 18M6 6l12 12"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
      bell: '<path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0"/>', board: '<rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/>',
      line: '<path d="M3 6h10M7 12h14M5 18h9"/>', table: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M9 4v16"/>',
      down: '<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/>', up: '<path d="M12 21V9m0 0l-4 4m4-4l4 4M4 3h16"/>',
      mail: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 7l9 6 9-6"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
      edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>', out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
      users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6M17 4.5a3.5 3.5 0 010 7M21.5 20c0-2.5-1.5-4.6-4-5.4"/>',
      gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
      star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/>',
      box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>' };
    return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (P[n] || '') + '</svg>';
  }
  function toast(msg, bad) {
    var box = $('#toast'), d = document.createElement('div');
    d.textContent = msg; if (bad) d.className = 'err'; box.appendChild(d);
    setTimeout(function () { d.remove(); }, bad ? 5000 : 2600);
  }
  function store(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* 저장 불가 환경 */ } }
  function load(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function pref(k, v) { try { if (v === undefined) return localStorage.getItem('tsk_' + k); localStorage.setItem('tsk_' + k, v); } catch (e) { /* 무시 */ } return null; }
  function stages(kind) { return (S.cfg.stages[kind] || S.cfg.stages['공통']); }
  function mem(email) { for (var i = 0; i < S.members.length; i++) if (S.members[i].email === email) return S.members[i]; return null; }
  function mname(email) { var m = mem(email); return m ? (m.name || email.split('@')[0]) : (email ? email.split('@')[0] : '-'); }
  function ini(name) { return esc(String(name || '?').slice(0, 1)); }
  function safeUrl(u) { return /^https:\/\/[^\s]+$/i.test(u || '') ? u : ''; }
  function isStaff() { return S.me.role !== 'viewer'; }
  function depts() {
    var o = {}; S.members.forEach(function (m) { if (m.dept) o[m.dept] = 1; }); S.tasks.forEach(function (t) { if (t.dept) o[t.dept] = 1; });
    return Object.keys(o).sort();
  }
  function status(t) {
    if (t.archived || (t.stage === 5 && t.progress >= 100)) return 'done';
    if (!t.due) return 'ok';
    var d = diff(t.due, TODAY);
    return d < 0 ? 'late' : d <= S.cfg.remind_days ? 'warn' : 'ok';
  }
  function badge(cls, txt) { return '<span class="badge ' + cls + '">' + esc(txt) + '</span>'; }

  /* ---------- 서버 호출 ---------- */
  function rpc(name, args) {
    var body = Object.assign({}, args || {}); if (S.tok) body.p_token = S.tok;
    return fetch(SUPA + '/rest/v1/rpc/' + name, { method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.text().then(function (tx) {
          var j = null; try { j = tx ? JSON.parse(tx) : null; } catch (e) { /* 본문 없음 */ }
          if (!r.ok) {
            var code = (j && j.message) || '';
            var e = new Error(ERR[code] || (code && code.length < 40 && /^[A-Z_]+$/.test(code) ? '처리하지 못했습니다(' + code + ').' : '서버 처리 중 오류가 발생했습니다.'));
            e.code = code; throw e;
          }
          return j;
        });
      }).catch(function (e) {
        if (e.code === 'AUTH') { logout(true, e.message); }
        if (!e.code && e instanceof TypeError) e.message = '네트워크에 연결할 수 없습니다.';
        throw e;
      });
  }
  function fail(e) {
    if (e.code === 'CONFLICT' && S.dr) refreshTask(S.dr.id); else if (e.code === 'CONFLICT') boot();
    if (e.code !== 'AUTH') toast(e.message || '오류가 발생했습니다.', true);
  }

  /* ---------- 로그인 ---------- */
  function loginView(msg, pendingEmail) {
    $('#layer').innerHTML = '';
    $('#app').innerHTML = '<div class="login"><div class="card">' +
      '<div><div class="muted sm">아세아항공직업전문학교</div><h1>업무진행 평가</h1></div>' +
      '<p class="muted" style="margin:0">행사·교육과정·TF 업무의 진행 상황을 단계별로 관리하고 사후 평가를 기록합니다. 학교에서 사용하는 Google 계정으로 로그인해 주십시오.</p>' +
      (pendingEmail ? '<div class="notice-box"><b>승인 대기 중입니다.</b><br>' + esc(pendingEmail) + ' 계정이 등록되었습니다. 관리자가 승인하면 사용할 수 있습니다.</div>' : '') +
      (msg ? '<div class="err-box">' + esc(msg) + '</div>' : '') +
      '<div class="gbtn" id="gbtn"><span class="muted sm">Google 로그인 준비 중…</span></div>' +
      '<p class="muted sm" style="margin:0">비밀번호는 저장하지 않으며, 승인된 구성원만 업무 내용을 볼 수 있습니다.</p></div></div>';
    var tries = 0, iv = setInterval(function () {
      tries++;
      if (window.google && google.accounts && google.accounts.id) {
        clearInterval(iv);
        google.accounts.id.initialize({ client_id: CLIENT_ID, callback: onCredential, auto_select: false });
        var b = $('#gbtn'); if (b) { b.innerHTML = ''; google.accounts.id.renderButton(b, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'ko', width: 280 }); }
      } else if (tries > 50) { clearInterval(iv); var g = $('#gbtn'); if (g) g.innerHTML = '<span class="err-box">Google 로그인 스크립트를 불러오지 못했습니다. 새로고침해 주십시오.</span>'; }
    }, 200);
  }
  function onCredential(resp) {
    $('#app').innerHTML = '<div class="login"><div class="card"><p class="muted" style="margin:0">로그인 확인 중입니다…</p></div></div>';
    fetch(SUPA + '/functions/v1/task-auth', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY },
      body: JSON.stringify({ credential: resp.credential }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) return loginView(x.j && x.j.error === 'PENDING_FULL' ? '승인 대기 인원이 가득 찼습니다. 관리자에게 문의해 주십시오.' : 'Google 계정 확인에 실패했습니다. 다시 시도해 주십시오.');
        if (x.j.status === 'pending') return loginView('', x.j.email || 'Google 계정');
        if (x.j.status === 'disabled') return loginView('사용이 중지된 계정입니다. 관리자에게 문의해 주십시오.');
        S.tok = x.j.token; store('tsk_tok', S.tok); boot();
      }).catch(function () { loginView('네트워크에 연결할 수 없습니다.'); });
  }
  function logout(silent, msg) {
    if (S.tok && !silent) rpc('tsk_logout', {}).catch(function () { /* 무시 */ });
    S.tok = null; store('tsk_tok', null); clearInterval(S.timer); S.dr = null;
    loginView(msg || '');
  }

  /* ---------- 데이터 ---------- */
  function boot(keepUi) {
    return rpc('tsk_boot', {}).then(function (d) {
      S.me = d.me; S.cfg = d.cfg; S.tpl = d.templates; S.members = d.members; S.tasks = d.tasks; S.myItems = d.my_items; S.notices = d.notices;
      var un = unread();
      if (S.lastUnread >= 0 && un > S.lastUnread) browserNotify('새 알림 ' + (un - S.lastUnread) + '건이 있습니다.');
      S.lastUnread = un;
      if (!keepUi || !$('.top')) { shell(); } else { renderTabs(); renderMain(); }
      if (S.dr && !keepUi) renderDrawer();
      clearInterval(S.timer);
      S.timer = setInterval(function () { if (!document.hidden && !$('#layer').innerHTML) boot(true).catch(function () { /* 다음 주기에 재시도 */ }); }, 90000);
    }).catch(function (e) { if (e.code !== 'AUTH') { toast(e.message, true); if (!S.me) loginView(e.message); } });
  }
  function browserNotify(msg) { try { if (window.Notification && Notification.permission === 'granted') new Notification('업무진행 평가', { body: msg }); } catch (e) { /* 미지원 */ } }
  function unread() { return S.notices.filter(function (n) { return !n.read; }).length; }
  function replaceTask(t) {
    for (var i = 0; i < S.tasks.length; i++) if (S.tasks[i].id === t.id) { S.tasks[i] = Object.assign(S.tasks[i], t); return; }
    S.tasks.push(t);
  }

  /* ---------- 화면 뼈대 ---------- */
  var TABS = [['board', '업무 보드', 'board'], ['mine', '내 업무', 'user'], ['notice', '알림', 'bell'], ['eval', '사후 평가', 'star'], ['members', '구성원', 'users'], ['settings', '설정', 'gear']];
  function shell() {
    $('#app').innerHTML = '<header class="top"><div class="in"><div class="brand">' + ico('board') + '업무진행 평가</div><nav class="tabs" id="tabs"></nav>' +
      '<div class="who"><span><b>' + esc(S.me.name || S.me.email) + '</b>' + esc(ROLES[S.me.role]) + (S.me.dept ? ' · ' + esc(S.me.dept) : '') + '</span>' +
      '<button class="ib" id="lo" title="로그아웃" aria-label="로그아웃">' + ico('out') + '</button></div></div></header><main class="wrap" id="main"></main>';
    $('#lo').onclick = function () { logout(); };
    renderTabs(); renderMain();
  }
  function renderTabs() {
    var h = '';
    TABS.forEach(function (t) {
      if (t[0] === 'settings' && S.me.role !== 'admin') return;
      var c = t[0] === 'notice' ? unread() + derived().length : t[0] === 'members' && S.me.role === 'admin' ? S.members.filter(function (m) { return m.status === 'pending'; }).length : 0;
      h += '<button data-tab="' + t[0] + '" class="' + (S.tab === t[0] ? 'on' : '') + '">' + ico(t[2]) + t[1] + (c ? '<span class="cnt">' + c + '</span>' : '') + '</button>';
    });
    $('#tabs').innerHTML = h;
  }
  function renderMain() {
    if (S.tab === 'settings' && S.me.role !== 'admin') S.tab = 'board';
    ({ board: tabBoard, mine: tabMine, notice: tabNotice, eval: tabEval, members: tabMembers, settings: tabSettings })[S.tab]();
  }

  /* ---------- 필터 ---------- */
  function rangeOf(r) {
    var n = new Date(), y = n.getFullYear(), m = n.getMonth(), s, e;
    if (r === 'week') { var dow = (n.getDay() + 6) % 7; s = new Date(y, m, n.getDate() - dow); e = new Date(y, m, n.getDate() - dow + 6); }
    else if (r === 'month') { s = new Date(y, m, 1); e = new Date(y, m + 1, 0); }
    else if (m >= 2 && m <= 7) { s = new Date(y, 2, 1); e = new Date(y, 8, 0); }
    else if (m >= 8) { s = new Date(y, 8, 1); e = new Date(y + 1, 2, 0); }
    else { s = new Date(y - 1, 8, 1); e = new Date(y, 2, 0); }
    return [ymd(s), ymd(e)];
  }
  function filtered() {
    var f = S.f, q = f.q.trim().toLowerCase(), rg = f.range ? rangeOf(f.range) : null;
    return S.tasks.filter(function (t) {
      if (t.archived && !f.arch) return false;
      if (f.kind && t.kind !== f.kind) return false;
      if (f.dept && t.dept !== f.dept) return false;
      if (f.owner && t.owner !== f.owner) return false;
      if (f.stage !== '' && t.stage !== +f.stage) return false;
      if (f.status && status(t) !== f.status) return false;
      if (f.mine && t.owner !== S.me.email && !S.myItems.some(function (i) { return i.task_id === t.id; })) return false;
      if (q && (t.title + ' ' + t.dept + ' ' + t.owner_name).toLowerCase().indexOf(q) < 0) return false;
      if (rg) { var a = t.start || t.due, b = t.due || t.start; if (!a || a > rg[1] || b < rg[0]) return false; }
      return true;
    });
  }
  function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(label) + '</option>'; }

  /* ---------- 업무 보드 탭 ---------- */
  function tabBoard() {
    var f = S.f, ow = {};
    S.tasks.forEach(function (t) { if (t.owner) ow[t.owner] = t.owner_name || t.owner; });
    $('#main').innerHTML =
      '<div class="hd"><h2>업무 보드</h2><span class="muted sm" id="cntlbl"></span><span class="sp"></span>' +
      '<div class="seg" id="vseg">' + [['board', '칸반', 'board'], ['timeline', '타임라인', 'line'], ['table', '표', 'table']].map(function (v) {
        return '<button data-view="' + v[0] + '" class="' + (S.view === v[0] ? 'on' : '') + '">' + ico(v[2]) + v[1] + '</button>'; }).join('') + '</div>' +
      (isStaff() ? '<button class="btn" data-act="new">' + ico('plus') + '새 업무</button>' : '') +
      '<button class="btn gray" data-act="xl-out">' + ico('down') + '엑셀</button>' +
      (isStaff() ? '<button class="btn gray" data-act="xl-in">' + ico('up') + '가져오기</button>' : '') + '</div>' +
      '<div id="kpis" class="kpis"></div>' +
      '<div class="card filters">' +
      '<label class="f q">검색<input type="search" id="fq" placeholder="업무명·부서·담당자" value="' + esc(f.q) + '"></label>' +
      '<label class="f">구분<select data-f="kind">' + opt('', '전체', f.kind) + KINDS.map(function (k) { return opt(k, k, f.kind); }).join('') + '</select></label>' +
      '<label class="f">부서<select data-f="dept">' + opt('', '전체', f.dept) + depts().map(function (d) { return opt(d, d, f.dept); }).join('') + '</select></label>' +
      '<label class="f">담당자<select data-f="owner">' + opt('', '전체', f.owner) + Object.keys(ow).map(function (e) { return opt(e, ow[e], f.owner); }).join('') + '</select></label>' +
      '<label class="f">단계<select data-f="stage">' + opt('', '전체', f.stage) + stages(f.kind || '공통').map(function (n, i) { return opt(i, n, f.stage); }).join('') + '</select></label>' +
      '<label class="f">상태<select data-f="status">' + opt('', '전체', f.status) + Object.keys(STL).map(function (k) { return opt(k, STL[k], f.status); }).join('') + '</select></label>' +
      '<label class="f">기간<select data-f="range">' + opt('', '전체', f.range) + opt('week', '이번 주', f.range) + opt('month', '이번 달', f.range) + opt('term', '이번 학기', f.range) + '</select></label>' +
      '<label class="chk"><input type="checkbox" data-f="mine"' + (f.mine ? ' checked' : '') + '>내 업무만</label>' +
      '<label class="chk"><input type="checkbox" data-f="arch"' + (f.arch ? ' checked' : '') + '>보관 포함</label>' +
      '<button class="btn gray xs" data-act="fclear">초기화</button></div><div id="body"></div>';
    renderBody();
  }
  function renderBody() {
    var L = filtered(), live = L.filter(function (t) { return status(t) !== 'done'; });
    var wk = live.filter(function (t) { return t.due && diff(t.due, TODAY) >= 0 && diff(t.due, TODAY) <= 7; }).length;
    var late = live.filter(function (t) { return status(t) === 'late'; }).length;
    var avg = L.length ? Math.round(L.reduce(function (a, t) { return a + t.progress; }, 0) / L.length) : 0;
    $('#cntlbl').textContent = '총 ' + L.length + '건';
    $('#kpis').innerHTML = [['진행 중', live.length, ''], ['7일 내 마감', wk, ''], ['지연', late, late ? 'color:var(--red)' : ''], ['평균 진행률', avg + '%', '']].map(function (k) {
      return '<div class="card kpi"><small>' + k[0] + '</small><b style="' + k[2] + '">' + k[1] + '</b></div>'; }).join('');
    var b = $('#body');
    if (!L.length) { b.innerHTML = '<div class="card empty">조건에 맞는 업무가 없습니다.' + (isStaff() ? ' 「새 업무」로 등록해 보십시오.' : '') + '</div>'; return; }
    b.innerHTML = S.view === 'board' ? viewBoard(L) : S.view === 'timeline' ? viewTimeline(L) : viewTable(L);
  }
  function card(t) {
    var st = status(t);
    return '<div class="tk" data-open="' + esc(t.id) + '" tabindex="0" role="button" ' + (t.edit ? 'draggable="true" data-drag="' + esc(t.id) + '"' : '') + '>' +
      '<div class="row">' + badge('k-' + t.kind, t.kind) + badge('s-' + st, STL[st]) + '<span class="pct">' + t.progress + '%</span></div>' +
      '<div class="t">' + esc(t.title) + '</div><div class="bar"><i style="width:' + t.progress + '%"></i></div>' +
      '<div class="row meta"><span class="av">' + ini(t.owner_name) + '</span>' + esc(t.owner_name || '-') + (t.dept ? ' · ' + esc(t.dept) : '') + '</div>' +
      '<div class="meta">' + (t.due ? '마감 ' + md(t.due) + ' (' + dday(t.due) + ')' : '마감일 없음') + (t.full ? '' : ' · 제한 공개') + '</div></div>';
  }
  function viewBoard(L) {
    var names = stages(S.f.kind || '공통');
    return '<div class="board">' + names.map(function (n, i) {
      var c = L.filter(function (t) { return t.stage === i; });
      return '<div class="col" data-col="' + i + '"><h4>' + esc(n) + '<span>' + c.length + '</span></h4>' + c.map(card).join('') + '</div>';
    }).join('') + '</div>';
  }
  function viewTable(L) {
    var k = S.sort.k, d = S.sort.d;
    L = L.slice().sort(function (a, b) {
      var x = k === 'owner' ? a.owner_name : a[k], y = k === 'owner' ? b.owner_name : b[k];
      if (x == null || x === '') return 1; if (y == null || y === '') return -1;
      return (x > y ? 1 : x < y ? -1 : 0) * d;
    });
    var H = [['title', '업무'], ['kind', '구분'], ['dept', '부서'], ['stage', '단계'], ['owner', '담당'], ['start', '시작'], ['due', '마감'], ['progress', '진행'], ['', '상태']];
    return '<div class="card tbl"><table><thead><tr>' + H.map(function (h) {
      return h[0] ? '<th class="s" data-sort="' + h[0] + '">' + h[1] + (S.sort.k === h[0] ? (S.sort.d > 0 ? ' ▲' : ' ▼') : '') + '</th>' : '<th>' + h[1] + '</th>'; }).join('') + '</tr></thead><tbody>' +
      L.map(function (t) { var st = status(t);
        return '<tr class="r" data-open="' + esc(t.id) + '"><td><b>' + esc(t.title) + '</b></td><td>' + badge('k-' + t.kind, t.kind) + '</td><td>' + esc(t.dept) + '</td><td>' + esc(stages(t.kind)[t.stage]) +
          '</td><td>' + esc(t.owner_name) + '</td><td>' + md(t.start) + '</td><td>' + md(t.due) + ' <span class="muted sm">' + dday(t.due) + '</span></td><td style="min-width:90px"><div class="bar"><i style="width:' + t.progress +
          '%"></i></div></td><td>' + badge('s-' + st, STL[st]) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function viewTimeline(L) {
    var R = L.filter(function (t) { return t.start || t.due; });
    if (!R.length) return '<div class="card empty">시작일 또는 마감일이 입력된 업무가 없습니다.</div>';
    R.sort(function (a, b) { return (a.start || a.due) > (b.start || b.due) ? 1 : -1; });
    var min = R.reduce(function (m, t) { var s = t.start || t.due; return s < m ? s : m; }, R[0].start || R[0].due);
    var max = R.reduce(function (m, t) { var e = t.due || t.start; return e > m ? e : m; }, R[0].due || R[0].start);
    if (TODAY < min) min = TODAY; if (TODAY > max) max = TODAY;
    min = min.slice(0, 8) + '01'; var mx = pd(max); max = ymd(new Date(mx.getFullYear(), mx.getMonth() + 1, 0));
    var span = diff(max, min) + 1, head = '', d = pd(min);
    while (ymd(d) <= max) {
      var left = diff(ymd(d), min) / span * 100;
      head += '<div class="tl-m" style="left:' + left + '%">' + (d.getFullYear() % 100) + '.' + (d.getMonth() + 1) + '</div>';
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    var tl = diff(TODAY, min) / span * 100;
    return '<div class="card tl"><div class="tl-in"><div class="tl-h"><div class="tl-n">업무</div><div class="tl-t" style="min-height:26px">' + head + '<i class="tl-today" style="left:' + tl + '%" title="오늘"></i></div></div>' +
      R.map(function (t) {
        var s = t.start || t.due, e = t.due || t.start, l = diff(s, min) / span * 100, w = Math.max((diff(e, s) + 1) / span * 100, 0.6);
        return '<div class="tl-r"><div class="tl-n" data-open="' + esc(t.id) + '" title="' + esc(t.title) + '">' + esc(t.title) + '</div><div class="tl-t">' +
          '<i class="tl-today" style="left:' + tl + '%"></i><div class="tl-b ' + status(t) + '" data-open="' + esc(t.id) + '" style="left:' + l + '%;width:' + w + '%" title="' +
          esc(t.title + ' ' + md(s) + '~' + md(e) + ' ' + t.progress + '%') + '"><i style="width:' + t.progress + '%"></i></div></div></div>';
      }).join('') + '</div></div>';
  }

  /* ---------- 내 업무 ---------- */
  function tabMine() {
    var mine = S.tasks.filter(function (t) { return t.owner === S.me.email && !t.archived; }).sort(function (a, b) { return (a.due || '9') > (b.due || '9') ? 1 : -1; });
    var part = S.tasks.filter(function (t) { return t.owner !== S.me.email && !t.archived && t.full && S.myItems.some(function (i) { return i.task_id === t.id; }); });
    $('#main').innerHTML = '<div class="hd"><h2>내 업무</h2></div>' +
      '<div class="card"><div class="pn-h"><h3>내가 배정받은 체크리스트 (' + S.myItems.length + ')</h3></div><div class="lst">' +
      (S.myItems.length ? S.myItems.map(function (i) {
        var late = i.due && diff(i.due, TODAY) < 0;
        return '<div class="li"><input type="checkbox" data-mytoggle="' + esc(i.id) + '" aria-label="완료"><div class="g"><div>' + esc(i.text) + '</div><div class="muted sm"><a href="#" data-open="' + esc(i.task_id) + '">' + esc(i.title) + '</a></div></div>' +
          (i.due ? badge(late ? 's-late' : 's-ok', md(i.due) + ' ' + dday(i.due)) : '') + '</div>'; }).join('') : '<div class="empty">배정된 항목이 없습니다.</div>') + '</div></div>' +
      '<div class="card"><div class="pn-h"><h3>내가 담당하는 업무 (' + mine.length + ')</h3></div><div class="lst">' + (mine.length ? mine.map(taskLi).join('') : '<div class="empty">담당 업무가 없습니다.</div>') + '</div></div>' +
      (part.length ? '<div class="card"><div class="pn-h"><h3>참여 중인 업무 (' + part.length + ')</h3></div><div class="lst">' + part.map(taskLi).join('') + '</div></div>' : '');
  }
  function taskLi(t) {
    var st = status(t);
    return '<div class="li" data-open="' + esc(t.id) + '" style="cursor:pointer">' + badge('k-' + t.kind, t.kind) + '<div class="g"><b>' + esc(t.title) + '</b><div class="muted sm">' + esc(stages(t.kind)[t.stage]) +
      ' · 마감 ' + md(t.due) + ' ' + dday(t.due) + '</div></div><div style="width:90px"><div class="bar"><i style="width:' + t.progress + '%"></i></div></div>' + badge('s-' + st, STL[st]) + '</div>';
  }

  /* ---------- 알림 ---------- */
  function derived() {
    var out = [];
    S.tasks.forEach(function (t) {
      if (t.archived || t.owner !== S.me.email) return;
      var st = status(t); if (st === 'late' || st === 'warn') out.push({ task: t, msg: '「' + t.title + '」 마감 ' + (st === 'late' ? '경과 ' + (-diff(t.due, TODAY)) + '일' : dday(t.due)), st: st });
    });
    S.myItems.forEach(function (i) {
      if (!i.due) return; var d = diff(i.due, TODAY);
      if (d < 0 || d <= S.cfg.remind_days) out.push({ task: { id: i.task_id }, msg: '항목 「' + i.text + '」 마감 ' + (d < 0 ? '경과 ' + (-d) + '일' : dday(i.due)), st: d < 0 ? 'late' : 'warn' });
    });
    return out;
  }
  function tabNotice() {
    var dv = derived(), canMail = S.me.role === 'admin' || S.me.role === 'manager';
    var overdue = S.tasks.filter(function (t) { return !t.archived && status(t) === 'late' && t.owner && (S.me.role === 'admin' || t.dept === S.me.dept); });
    $('#main').innerHTML = '<div class="hd"><h2>알림</h2><span class="sp"></span>' +
      (window.Notification && Notification.permission === 'default' ? '<button class="btn gray" data-act="bn">브라우저 알림 켜기</button>' : '') +
      (canMail ? '<button class="btn" data-act="mail-late"' + (overdue.length ? '' : ' disabled') + '>' + ico('mail') + '지연 업무 담당자에게 메일 (' + overdue.length + ')</button>' : '') + '</div>' +
      '<div class="card"><div class="pn-h"><h3>기한 알림 (자동 계산)</h3></div><div class="lst">' +
      (dv.length ? dv.map(function (a) { return '<div class="li" data-open="' + esc(a.task.id) + '" style="cursor:pointer">' + badge('s-' + a.st, STL[a.st]) + '<div class="g">' + esc(a.msg) + '</div></div>'; }).join('') :
        '<div class="empty">임박하거나 지난 마감이 없습니다.</div>') + '</div></div>' +
      '<div class="card"><div class="pn-h"><h3>받은 알림</h3><span class="sp"></span>' + (unread() ? '<button class="btn gray xs" data-act="readall">모두 읽음</button>' : '') + '</div><div class="lst">' +
      (S.notices.length ? S.notices.map(function (n) { return '<div class="li' + (n.read ? '' : ' un') + '"' + (n.task_id ? ' data-open="' + esc(n.task_id) + '" style="cursor:pointer"' : '') + '><div class="g">' + esc(n.msg) +
        '<div class="muted sm">' + dt(n.at) + '</div></div></div>'; }).join('') : '<div class="empty">받은 알림이 없습니다.</div>') + '</div></div>' +
      '<p class="muted sm">기한 알림은 접속할 때 계산되며, 메일은 「메일 보내기」로 직접 발송합니다. 카카오톡 알림은 2차 개발 대상입니다.</p>';
  }

  /* ---------- 사후 평가 ---------- */
  function tabEval() {
    var canEv = function (t) { return S.me.role === 'admin' || (S.me.role === 'manager' && S.me.dept && t.dept === S.me.dept); };
    var done = S.tasks.filter(function (t) { return t.ev != null; });
    var wait = S.tasks.filter(function (t) { return !t.archived && t.stage === 5 && t.ev == null && canEv(t); });
    function grp(key) {
      var o = {}; done.forEach(function (t) { var g = t[key] || '(미지정)'; (o[g] = o[g] || []).push(t.ev); });
      return Object.keys(o).map(function (g) { return [g, o[g].reduce(function (a, b) { return a + b; }, 0) / o[g].length, o[g].length]; }).sort(function (a, b) { return b[1] - a[1]; });
    }
    function bars(arr) { return arr.length ? '<div class="bars">' + arr.map(function (r) { return '<div class="b"><span>' + esc(r[0]) + ' <span class="muted sm">(' + r[2] + ')</span></span><div class="bar"><i style="width:' + (r[1] / 5 * 100) + '%"></i></div><b>' + r[1].toFixed(1) + '</b></div>'; }).join('') + '</div>' : '<div class="empty">평가 자료가 없습니다.</div>'; }
    $('#main').innerHTML = '<div class="hd"><h2>사후 평가</h2><span class="muted sm">평가는 담당자 본인, 같은 부서 부서장, 관리자에게만 보입니다. 5점 만점.</span></div>' +
      (wait.length ? '<div class="card"><div class="pn-h"><h3>평가 대기 (' + wait.length + ')</h3></div><div class="lst">' + wait.map(taskLi).join('') + '</div></div>' : '') +
      '<div class="grid2"><div class="card sec" style="padding:14px"><h4>구분별 평균</h4>' + bars(grp('kind')) + '</div><div class="card sec" style="padding:14px"><h4>부서별 평균</h4>' + bars(grp('dept')) + '</div></div>' +
      '<div class="card"><div class="pn-h"><h3>평가 완료 (' + done.length + ')</h3></div><div class="lst">' + (done.length ? done.map(function (t) {
        return '<div class="li" data-open="' + esc(t.id) + '" data-tab2="eval" style="cursor:pointer">' + badge('k-' + t.kind, t.kind) + '<div class="g"><b>' + esc(t.title) + '</b><div class="muted sm">' + esc(t.dept) + ' · ' + esc(t.owner_name) + '</div></div><b>' + t.ev.toFixed(1) + '</b></div>'; }).join('') :
        '<div class="empty">아직 평가가 없습니다.</div>') + '</div></div>';
  }

  /* ---------- 구성원 ---------- */
  function tabMembers() {
    var adm = S.me.role === 'admin', pend = S.members.filter(function (m) { return m.status === 'pending'; });
    var dl = '<datalist id="dl">' + depts().map(function (d) { return '<option value="' + esc(d) + '">'; }).join('') + '</datalist>';
    function rowEdit(m) {
      return '<tr data-mrow="' + esc(m.email) + '"><td>' + esc(m.email) + '</td><td><input type="text" data-mf="name" value="' + esc(m.name) + '" maxlength="40"></td><td><input type="text" list="dl" data-mf="dept" value="' + esc(m.dept) + '" maxlength="40"></td><td><select data-mf="role">' +
        Object.keys(ROLES).map(function (r) { return opt(r, ROLES[r], m.role); }).join('') + '</select></td><td><select data-mf="status">' + opt('active', '사용', m.status) + opt('pending', '승인 대기', m.status) + opt('disabled', '중지', m.status) + '</select></td><td><button class="btn xs" data-act="msave" data-email="' + esc(m.email) + '">저장</button></td></tr>';
    }
    $('#main').innerHTML = '<div class="hd"><h2>구성원</h2></div>' + dl +
      (adm && pend.length ? '<div class="notice-box"><b>승인 대기 ' + pend.length + '명</b> — 소속과 권한을 정한 뒤 상태를 「사용」으로 바꿔 저장하십시오.</div>' : '') +
      (adm ? '<div class="card tbl"><table><thead><tr><th>이메일</th><th>이름</th><th>부서</th><th>권한</th><th>상태</th><th></th></tr></thead><tbody>' +
        S.members.map(rowEdit).join('') + '</tbody></table></div>' +
        '<div class="card" style="padding:14px"><h4 style="margin-bottom:8px">구성원 미리 등록</h4><div class="addrow" style="grid-template-columns:1.4fr 1fr 1fr 110px auto"><label class="f">Google 이메일<input type="email" id="nm-e"></label><label class="f">이름<input type="text" id="nm-n" maxlength="40"></label>' +
        '<label class="f">부서<input type="text" id="nm-d" list="dl" maxlength="40"></label><label class="f">권한<select id="nm-r">' + Object.keys(ROLES).filter(function (r) { return r !== 'admin'; }).map(function (r) { return opt(r, ROLES[r], 'member'); }).join('') + '</select></label><button class="btn" data-act="madd">등록</button></div></div>' :
        '<div class="card tbl"><table><thead><tr><th>이름</th><th>부서</th><th>권한</th><th>이메일</th></tr></thead><tbody>' + S.members.map(function (m) { return '<tr><td>' + esc(m.name) + '</td><td>' + esc(m.dept) + '</td><td>' + esc(ROLES[m.role]) + '</td><td>' + esc(m.email) + '</td></tr>'; }).join('') + '</tbody></table></div>') +
      '<p class="muted sm">권한: 관리자(전체) · 부서장(같은 부서 업무 수정·평가) · 담당자(본인 업무 수정) · 열람(조회만). 다른 부서 업무는 제목과 진행률만 보입니다.</p>';
  }

  /* ---------- 설정(관리자) ---------- */
  function tabSettings() {
    var c = S.cfg, K = ['공통', '과정', '행사', 'TF', '일반'];
    $('#main').innerHTML = '<div class="hd"><h2>설정</h2></div>' +
      '<div class="card" style="padding:14px"><h4 style="margin-bottom:8px">단계 이름 (구분별 6단계)</h4><div class="tbl"><table><tbody>' + K.map(function (k) {
        return '<tr><th>' + k + '</th>' + c.stages[k].map(function (n, i) { return '<td><input type="text" data-st="' + k + '|' + i + '" value="' + esc(n) + '" maxlength="14" aria-label="' + k + ' ' + (i + 1) + '단계"></td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div><p class="muted sm">「공통」은 구분을 전체로 볼 때의 칸반 열 이름입니다.</p></div>' +
      '<div class="card" style="padding:14px"><h4 style="margin-bottom:8px">사후 평가 항목 (5점 척도)</h4><div id="evf">' + c.eval_form.map(function (e, i) { return evRow(e, i); }).join('') + '</div>' +
      '<button class="btn gray xs" data-act="evadd">항목 추가</button></div>' +
      '<div class="card" style="padding:14px"><label class="f" style="max-width:260px">주의 표시 기준 (마감 며칠 전부터)<input type="number" id="rd" min="0" max="30" value="' + c.remind_days + '"></label></div>' +
      '<div><button class="btn" data-act="cfgsave">설정 저장</button></div>' +
      '<div class="card"><div class="pn-h"><h3>업무 템플릿</h3><span class="sp"></span><button class="btn xs" data-act="tpl-new">' + ico('plus') + '추가</button></div><div class="lst">' +
      (S.tpl.length ? S.tpl.map(function (t) { return '<div class="li">' + badge('k-' + t.kind, t.kind) + '<div class="g"><b>' + esc(t.name) + '</b> <span class="muted sm">항목 ' + t.n + '개</span></div><button class="btn gray xs" data-act="tpl-edit" data-id="' + esc(t.id) + '">수정</button><button class="btn red xs" data-act="tpl-del" data-id="' + esc(t.id) + '">삭제</button></div>'; }).join('') : '<div class="empty">템플릿이 없습니다.</div>') + '</div></div>';
  }
  function evRow(e, i) {
    return '<div class="addrow" style="grid-template-columns:140px 1fr auto;margin-bottom:6px" data-ev="' + i + '"><label class="f">코드(영문 소문자)<input type="text" data-evk value="' + esc(e.key) + '" maxlength="16"></label><label class="f">항목 이름<input type="text" data-evl value="' + esc(e.label) + '" maxlength="20"></label><button class="ib" data-act="evdel" aria-label="삭제">' + ico('x') + '</button></div>';
  }

  /* ---------- 상세 서랍 ---------- */
  function openTask(id, tab) { S.dr = { id: id, tab: tab || 'info', data: null }; renderDrawer(); refreshTask(id); }
  function refreshTask(id) {
    return rpc('tsk_task_get', { p_id: id }).then(function (d) {
      replaceTask(d.task); if (S.dr && S.dr.id === id) { S.dr.data = d; renderDrawer(); }
      if (S.tab === 'board') renderBody(); else renderMain();
    }).catch(function (e) { if (e.code === 'NOT_FOUND') { closeDrawer(); boot(true); } fail(e); });
  }
  function closeDrawer() { S.dr = null; $('#layer').innerHTML = ''; }
  function renderDrawer() {
    if (!S.dr) return;
    var d = S.dr.data, t = d ? d.task : S.tasks.filter(function (x) { return x.id === S.dr.id; })[0];
    if (!t) { closeDrawer(); return; }
    var st = status(t), names = stages(t.kind), tab = S.dr.tab, body = '';
    var tabs = [['info', '개요'], ['items', '체크리스트'], ['targets', '대상자'], ['eval', '평가·회고'], ['hist', '이력']];
    if (!d) body = '<div class="empty">불러오는 중…</div>';
    else if (!t.full) body = drInfo(d, t, names);
    else body = tab === 'items' ? drItems(d, t, names) : tab === 'targets' ? drTargets(d, t) : tab === 'eval' ? drEval(d, t) : tab === 'hist' ? drHist(d) : drInfo(d, t, names);
    var keep = $('.pn-b'), sc = keep ? keep.scrollTop : 0;
    $('#layer').innerHTML = '<div class="shade right" data-shade><div class="drawer" role="dialog" aria-label="업무 상세"><div class="pn-h"><div>' + badge('k-' + t.kind, t.kind) + ' ' + badge('s-' + st, STL[st]) + (t.archived ? ' ' + badge('s-done', '보관') : '') +
      '<h3>' + esc(t.title) + '</h3></div><button class="ib" data-act="dclose" aria-label="닫기">' + ico('x') + '</button></div>' +
      (t.full ? '<div class="dtabs">' + tabs.map(function (x) { return '<button data-dtab="' + x[0] + '" class="' + (tab === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' : '') +
      '<div class="pn-b">' + body + '</div></div></div>';
    var nb = $('.pn-b'); if (nb) nb.scrollTop = sc;
  }
  function drInfo(d, t, names) {
    var edit = t.edit;
    var links = (t.links || []).map(function (l) { var u = safeUrl(l.url); return u ? '<div class="lnk"><a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(l.name || u) + '</a></div>' : ''; }).join('');
    return '<div class="sec"><h4>진행 단계</h4><div class="steps">' + names.map(function (n, i) {
      return '<button ' + (edit ? 'data-stage="' + i + '"' : 'disabled') + ' class="' + (i === t.stage ? 'on' : i < t.stage ? 'done' : '') + '">' + esc(n) + '</button>'; }).join('') + '</div></div>' +
      '<div class="sec"><h4>진행률 ' + t.progress + '% <span class="muted sm">체크리스트 ' + t.done + '/' + t.total + (t.total ? '' : ' (항목이 없으면 단계 기준)') + '</span></h4><div class="bar"><i style="width:' + t.progress + '%"></i></div></div>' +
      '<dl class="kv"><dt>부서</dt><dd>' + esc(t.dept || '-') + '</dd><dt>담당</dt><dd>' + esc(t.owner_name || '-') + '</dd>' +
      (d.parts ? '<dt>참여자</dt><dd>' + (d.parts.length ? d.parts.map(function (e) { return esc(mname(e)); }).join(', ') : '-') + '</dd>' : '') +
      '<dt>기간</dt><dd>' + (t.start || t.due ? esc((t.start || '') + ' ~ ' + (t.due || '')) + ' ' + dday(t.due) : '-') + '</dd>' +
      (d.parts ? '<dt>링크</dt><dd>' + (links || '-') + '</dd><dt>메모</dt><dd style="white-space:pre-wrap">' + esc(t.note || '-') + '</dd>' : '') + '</dl>' +
      (!t.full ? '<div class="notice-box">다른 부서 업무는 제목·단계·진행률·마감만 볼 수 있습니다. 상세 내용이 필요하면 담당자나 관리자에게 참여자 지정을 요청해 주십시오.</div>' : '') +
      (t.full ? '<div class="hd">' + (edit ? '<button class="btn" data-act="tedit">' + ico('edit') + '수정</button><button class="btn gray" data-act="tarch">' + (t.archived ? '보관 해제' : '보관') + '</button>' : '') +
        (isStaff() ? '<button class="btn gray" data-act="tmail">' + ico('mail') + '메일 보내기</button>' : '') + (S.me.role === 'admin' ? '<button class="btn red" data-act="tdel">삭제</button>' : '') + '</div>' : '');
  }
  function drItems(d, t, names) {
    var items = d.items, work = d.can_work, edit = t.edit;
    var by = names.map(function (n, i) {
      var L = items.filter(function (x) { return x.stage === i; });
      if (!L.length) return '';
      return '<div class="sec"><h4>' + esc(n) + ' <span class="muted sm">' + L.filter(function (x) { return x.done; }).length + '/' + L.length + '</span></h4><div class="ck">' + L.map(function (x) {
        var late = !x.done && x.due && diff(x.due, TODAY) < 0, canT = work || x.assignee === S.me.email;
        return '<div class="it' + (x.done ? ' dn' : '') + '"><input type="checkbox" data-itoggle="' + esc(x.id) + '"' + (x.done ? ' checked' : '') + (canT && isStaff() ? '' : ' disabled') + ' aria-label="완료"><div class="tx">' + esc(x.text) +
          '<div class="mt">' + (x.assignee ? esc(mname(x.assignee)) : '담당 미지정') + (x.due ? ' · ' + md(x.due) + ' ' + (late ? '<b style="color:var(--red)">지연</b>' : '') : '') + '</div></div>' +
          (edit ? '<button class="ib" data-act="idel" data-id="' + esc(x.id) + '" aria-label="삭제">' + ico('trash') + '</button>' : '') + '</div>'; }).join('') + '</div></div>';
    }).join('');
    return (by || '<div class="empty">체크리스트 항목이 없습니다.</div>') + (edit ? '<div class="sec"><h4>항목 추가</h4><div class="addrow"><label class="f">단계<select id="ia-s">' +
      names.map(function (n, i) { return opt(i, n, t.stage); }).join('') + '</select></label><label class="f w">내용<input type="text" id="ia-t" maxlength="200"></label><label class="f">담당<select id="ia-a">' + opt('', '미지정', '') +
      S.members.filter(function (m) { return m.status === 'active'; }).map(function (m) { return opt(m.email, m.name || m.email, ''); }).join('') + '</select></label><label class="f">기한<input type="date" id="ia-d"></label><button class="btn" data-act="iadd">추가</button></div></div>' : '');
  }
  function drTargets(d, t) {
    if (d.targets == null) return '<div class="notice-box">대상자 명단은 업무 담당자·참여자·부서장·관리자에게만 공개됩니다.</div>';
    var T = d.targets, work = d.can_work;
    return '<div class="muted sm">대상자 정보는 개인정보입니다. 필요한 최소 항목만 입력하고, 업무가 끝나면 삭제하십시오.</div>' +
      '<div class="tbl"><table><thead><tr><th>이름</th><th>소속</th><th>연락처(이메일)</th><th>점수</th><th>상태</th><th></th></tr></thead><tbody>' +
      (T.length ? T.map(function (g) { return '<tr data-trow="' + esc(g.id) + '"><td><input type="text" data-tf="name" value="' + esc(g.name) + '" maxlength="40"' + (work ? '' : ' disabled') + '></td><td><input type="text" data-tf="org" value="' + esc(g.org) + '" maxlength="60"' + (work ? '' : ' disabled') + '></td><td><input type="text" data-tf="contact" value="' + esc(g.contact) + '" maxlength="80"' + (work ? '' : ' disabled') + '></td><td style="width:70px"><input type="number" data-tf="score" value="' + (g.score == null ? '' : esc(g.score)) + '" min="0" max="1000" step="0.1"' + (work ? '' : ' disabled') + '></td><td><select data-tf="status"' + (work ? '' : ' disabled') + '>' +
        ['대기', '선정', '예비', '탈락'].map(function (s) { return opt(s, s, g.status); }).join('') + '</select></td><td>' + (work ? '<button class="ib" data-act="tgdel" data-id="' + esc(g.id) + '" aria-label="삭제">' + ico('trash') + '</button>' : '') + '</td></tr>'; }).join('') : '<tr><td colspan="6" class="empty">등록된 대상자가 없습니다.</td></tr>') + '</tbody></table></div>' +
      (work ? '<div class="sec"><h4>명단 붙여넣기 / 엑셀</h4><textarea id="tg-paste" placeholder="한 줄에 한 명: 이름 [탭] 소속 [탭] 연락처 [탭] 점수&#10;(엑셀에서 복사해 붙여넣을 수 있습니다)"></textarea><div class="hd" style="margin-top:6px"><button class="btn" data-act="tgimp">등록</button><button class="btn gray" data-act="tgfile">' + ico('up') + '엑셀 파일</button></div></div>' +
        '<div class="sec"><h4>선정·안내</h4><div class="hd"><label class="f" style="width:120px">상위 몇 명<input type="number" id="pickn" min="0" max="500" value="' + Math.max(T.filter(function (g) { return g.status === '선정'; }).length, 1) + '"></label><button class="btn gray" data-act="tgpick" style="align-self:flex-end">점수 순 선정</button>' +
        '<button class="btn" data-act="tgmail" style="align-self:flex-end">' + ico('mail') + '선정자 안내 메일</button></div><p class="muted sm">점수가 높은 순으로 선정하고 나머지(탈락 제외)는 예비로 둡니다. 동점은 등록 순입니다. 개별 상태는 표에서 바꿀 수 있습니다.</p></div>' : '');
  }
  function drEval(d, t) {
    var form = S.cfg.eval_form, ev = d.eval, can = d.can_eval, sc = (ev && ev.scores) || {};
    var out = '';
    if (can) {
      out += '<div class="sec"><h4>사후 평가 <span class="muted sm">1(미흡)~5(우수)</span></h4>' + form.map(function (f) {
        return '<div class="addrow" style="grid-template-columns:1fr auto;margin-bottom:6px"><span>' + esc(f.label) + '</span><div class="score" data-sc="' + esc(f.key) + '">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" class="' + (+sc[f.key] === n ? 'on' : '') + '" data-score="' + n + '">' + n + '</button>'; }).join('') + '</div></div>'; }).join('') +
        '<label class="f">종합 의견<textarea id="ev-c" maxlength="3000">' + esc(ev ? ev.comment : '') + '</textarea></label><label class="f" style="margin-top:6px">개선 과제<textarea id="ev-i" maxlength="3000">' + esc(ev ? ev.improvements : '') + '</textarea></label>' +
        '<div class="hd" style="margin-top:8px"><button class="btn" data-act="evsave">평가 저장</button>' + (t.stage < 5 ? '<span class="muted sm">종료(사후 검토) 단계에서 입력하는 것을 권장합니다.</span>' : '') + '</div></div>';
    } else if (ev) {
      out += '<div class="sec"><h4>사후 평가</h4>' + form.map(function (f) { return '<div class="addrow" style="grid-template-columns:1fr auto"><span>' + esc(f.label) + '</span><b>' + (sc[f.key] != null ? esc(sc[f.key]) : '-') + '</b></div>'; }).join('') +
        '<dl class="kv" style="margin-top:8px"><dt>의견</dt><dd style="white-space:pre-wrap">' + esc(ev.comment || '-') + '</dd><dt>개선</dt><dd style="white-space:pre-wrap">' + esc(ev.improvements || '-') + '</dd></dl></div>';
    } else out += '<div class="notice-box">사후 평가는 부서장·관리자가 입력하며, 담당자 본인에게 공개됩니다.</div>';
    out += '<div class="sec"><h4>담당자 회고</h4>' + (t.edit ? '<textarea id="retro" maxlength="4000">' + esc(t.retro) + '</textarea><div style="margin-top:6px"><button class="btn gray" data-act="retsave">회고 저장</button></div>' :
      '<div style="white-space:pre-wrap">' + esc(t.retro || '작성된 회고가 없습니다.') + '</div>') + '</div>';
    return out;
  }
  function drHist(d) {
    return '<div class="hist">' + (d.history.length ? d.history.map(function (h) { return '<div><time>' + dt(h.at) + '</time><span>' + esc(mname(h.by)) + ' — ' + esc(h.msg) + '</span></div>'; }).join('') : '<div class="empty">이력이 없습니다.</div>') + '</div>';
  }

  /* ---------- 업무 입력 모달 ---------- */
  function modal(html, wide) {
    var m = document.createElement('div'); m.className = 'shade mid'; m.setAttribute('data-modal', '1');
    m.innerHTML = '<div class="modal' + (wide ? ' wide' : '') + '" role="dialog">' + html + '</div>';
    document.body.appendChild(m); return m;
  }
  function closeModal() { var m = document.querySelector('[data-modal]'); if (m) m.remove(); }
  function taskForm(t, parts) {
    var isNew = !t, adm = S.me.role === 'admin', canOwner = S.me.role !== 'member', links = (t && t.links) || [];
    while (links.length < 3) links = links.concat([{ name: '', url: '' }]);
    var act = S.members.filter(function (m) { return m.status === 'active'; });
    var m = modal('<form id="tf" novalidate><div class="pn-h"><div><h3>' + (isNew ? '새 업무' : '업무 수정') + '</h3></div><button type="button" class="ib" data-act="mclose" aria-label="닫기">' + ico('x') + '</button></div><div class="pn-b">' +
      '<div class="grid2"><label class="f">구분<select id="tf-k">' + KINDS.map(function (k) { return opt(k, k, t ? t.kind : '과정'); }).join('') + '</select></label>' +
      (isNew ? '<label class="f">템플릿<select id="tf-tpl"></select></label>' : '<label class="f">부서<input type="text" id="tf-d" list="dl2" value="' + esc(t.dept) + '" maxlength="40"' + (adm ? '' : ' disabled') + '></label>') + '</div>' +
      (isNew ? '<label class="f">부서<input type="text" id="tf-d" list="dl2" value="' + esc(S.me.dept) + '" maxlength="40"' + (adm ? '' : ' disabled') + '></label>' : '') +
      '<datalist id="dl2">' + depts().map(function (d) { return '<option value="' + esc(d) + '">'; }).join('') + '</datalist>' +
      '<label class="f">업무명<input type="text" id="tf-t" maxlength="120" required value="' + esc(t ? t.title : '') + '"></label>' +
      '<div class="grid2"><label class="f">시작일<input type="date" id="tf-s" value="' + esc(t ? t.start || '' : '') + '"></label><label class="f">마감일<input type="date" id="tf-e" value="' + esc(t ? t.due || '' : '') + '"></label></div>' +
      '<label class="f">담당자<select id="tf-o"' + (canOwner ? '' : ' disabled') + '>' + act.map(function (x) { return opt(x.email, (x.name || x.email) + (x.dept ? ' (' + x.dept + ')' : ''), t ? t.owner : S.me.email); }).join('') + '</select></label>' +
      '<div class="f">참여자 <div class="pick" id="tf-p">' + act.map(function (x) { return '<label><input type="checkbox" value="' + esc(x.email) + '"' + (parts && parts.indexOf(x.email) >= 0 ? ' checked' : '') + '>' + esc(x.name || x.email) + '</label>'; }).join('') + '</div></div>' +
      '<label class="f">메모<textarea id="tf-n" maxlength="4000">' + esc(t ? t.note || '' : '') + '</textarea></label>' +
      '<div class="f">자료 링크 (Google Drive 등, https:// 주소)' + links.slice(0, 3).map(function (l, i) { return '<div class="grid2" style="margin-top:4px"><input type="text" data-ln placeholder="이름" maxlength="60" value="' + esc(l.name) + '"><input type="text" data-lu placeholder="https://" value="' + esc(l.url) + '"></div>'; }).join('') + '</div>' +
      '<div class="err-box hide" id="tf-err"></div></div><div class="pn-f"><button type="button" class="btn gray" data-act="mclose">취소</button><button type="submit" class="btn">저장</button></div></form>');
    if (isNew) {
      var sel = $('#tf-tpl', m), fill = function () {
        var k = $('#tf-k', m).value; sel.innerHTML = opt('', '빈 업무(체크리스트 직접 작성)', '') + S.tpl.filter(function (x) { return x.kind === k; }).map(function (x) { return opt(x.id, x.name + ' (' + x.n + '항목)', ''); }).join('');
      }; fill(); $('#tf-k', m).onchange = fill;
    }
    $('#tf', m).onsubmit = function (ev) {
      ev.preventDefault();
      var title = $('#tf-t', m).value.trim(), s = $('#tf-s', m).value, e = $('#tf-e', m).value, er = $('#tf-err', m);
      var lk = [], bad = '';
      m.querySelectorAll('[data-ln]').forEach(function (inp, i) { var u = m.querySelectorAll('[data-lu]')[i].value.trim(); if (u) { if (!safeUrl(u)) bad = '링크는 https:// 로 시작해야 합니다.'; lk.push({ name: inp.value.trim(), url: u }); } });
      if (!title) bad = '업무명을 입력해 주십시오.'; else if (s && e && s > e) bad = '마감일이 시작일보다 앞설 수 없습니다.';
      if (bad) { er.textContent = bad; er.classList.remove('hide'); return; }
      var p = { kind: $('#tf-k', m).value, title: title, dept: $('#tf-d', m).value.trim(), owner: $('#tf-o', m).value, start_date: s || null, due_date: e || null, note: $('#tf-n', m).value,
        links: lk, participants: Array.prototype.map.call(m.querySelectorAll('#tf-p input:checked'), function (c) { return c.value; }) };
      if (!isNew) p.id = t.id, p.ver = t.ver;
      var tpl = isNew ? $('#tf-tpl', m).value : '', btn = $('button[type=submit]', m); btn.disabled = true;
      (tpl ? rpc('tsk_task_from_tpl', { p_tpl: tpl, p: p }) : rpc('tsk_task_save', { p: p })).then(function (r) {
        closeModal(); toast(isNew ? '업무를 만들었습니다.' : '저장했습니다.');
        return boot(true).then(function () { openTask(r.id, isNew && tpl ? 'items' : 'info'); });
      }).catch(function (x) { btn.disabled = false; er.textContent = x.message; er.classList.remove('hide'); if (x.code === 'CONFLICT') { closeModal(); fail(x); } });
    };
  }

  /* ---------- 메일 ---------- */
  function mailModal(o) {
    // o: {to:[{email,name}], subject, body, task}
    var m = modal('<div class="pn-h"><div><h3>메일 보내기</h3><div class="muted sm">내 Gmail 계정으로 발송합니다. 받는 사람마다 따로 보내므로 서로의 주소가 보이지 않습니다.</div></div><button class="ib" data-act="mclose" aria-label="닫기">' + ico('x') + '</button></div>' +
      '<div class="pn-b"><div class="f">받는 사람 (' + o.to.length + '명)<div class="muted sm" id="ml-to" style="color:var(--ink)">' + (o.to.length ? o.to.map(function (x) { return esc(x.name ? x.name + ' <' + x.email + '>' : x.email); }).join(', ') : '없음') + '</div></div>' +
      '<label class="f">추가 받는 사람 (이메일, 쉼표로 구분)<input type="text" id="ml-x"></label><label class="f">제목<input type="text" id="ml-s" maxlength="150" value="' + esc(o.subject) + '"></label>' +
      '<label class="f">내용 <span class="muted sm">{이름}은 받는 사람 이름으로 바뀝니다</span><textarea id="ml-b" style="min-height:180px" maxlength="5000">' + esc(o.body) + '</textarea></label><div class="err-box hide" id="ml-err"></div></div>' +
      '<div class="pn-f"><button class="btn gray" data-act="mcopy">내용 복사</button><button class="btn" id="ml-send">' + ico('mail') + 'Gmail로 보내기</button></div>', false);
    $('[data-act=mcopy]', m).onclick = function () { var tx = $('#ml-b', m).value; if (navigator.clipboard) navigator.clipboard.writeText(tx).then(function () { toast('복사했습니다.'); }, function () { toast('복사하지 못했습니다.', true); }); };
    $('#ml-send', m).onclick = function () {
      var er = $('#ml-err', m), btn = this, subj = $('#ml-s', m).value.trim(), body = $('#ml-b', m).value, list = o.to.slice();
      $('#ml-x', m).value.split(/[,\s;]+/).forEach(function (a) { a = a.trim().toLowerCase(); if (a) list.push({ email: a, name: '' }); });
      var seen = {}, ok = [];
      list.forEach(function (x) { var e = String(x.email).trim().toLowerCase(); if (/^[^@\s<>,;"]+@[^@\s<>,;"]+\.[^@\s<>,;"]+$/.test(e) && !seen[e]) { seen[e] = 1; ok.push({ email: e, name: x.name || '' }); } });
      var msg = !subj ? '제목을 입력해 주십시오.' : !body.trim() ? '내용을 입력해 주십시오.' : !ok.length ? '받는 사람 이메일이 없습니다.' : ok.length > 50 ? '한 번에 50명까지 보낼 수 있습니다.' : '';
      if (msg) { er.textContent = msg; er.classList.remove('hide'); return; }
      btn.disabled = true; er.classList.add('hide'); btn.textContent = '권한 확인 중…';
      gmailToken().then(function (tok) {
        var n = 0;
        return ok.reduce(function (pr, x) {
          return pr.then(function () {
            btn.textContent = '보내는 중 ' + (n + 1) + '/' + ok.length;
            var nm = x.name || mname(x.email) || '';
            return gmailSend(tok, x.email, subj.replace(/\{이름\}/g, nm), body.replace(/\{이름\}/g, nm)).then(function () { n++; });
          });
        }, Promise.resolve()).then(function () { return n; }, function (e) { e.sent = n; throw e; });
      }).then(function (n) {
        rpc('tsk_mail_log', { p_task: o.task || null, p_subject: subj, p_n: n }).catch(function () { /* 로그 실패는 무시 */ });
        closeModal(); toast('메일 ' + n + '건을 발송했습니다.'); if (o.task) refreshTask(o.task);
      }).catch(function (e) {
        btn.disabled = false; btn.innerHTML = ico('mail') + 'Gmail로 보내기';
        er.textContent = (e.sent ? e.sent + '건 발송 후 중단되었습니다. ' : '') + (e.message || '발송하지 못했습니다.'); er.classList.remove('hide');
      });
    };
  }
  function gmailToken() {
    return new Promise(function (res, rej) {
      if (!(window.google && google.accounts && google.accounts.oauth2)) return rej(new Error('Google 스크립트를 불러오지 못했습니다. 새로고침해 주십시오.'));
      var c = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: 'https://www.googleapis.com/auth/gmail.send', login_hint: S.me.email,
        callback: function (r) { r && r.access_token ? res(r.access_token) : rej(new Error('Gmail 발송 권한을 받지 못했습니다. (테스트 사용자 등록 여부를 확인해 주십시오.)')); },
        error_callback: function () { rej(new Error('Gmail 권한 요청이 취소되었거나 차단되었습니다.')); } });
      c.requestAccessToken();
    });
  }
  function b64(str) { var b = new TextEncoder().encode(str), s = ''; for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
  function gmailSend(tok, to, subject, body) {
    var raw = ['To: ' + to, 'Subject: =?UTF-8?B?' + b64(subject) + '?=', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(body).replace(/(.{76})/g, '$1\r\n')].join('\r\n');
    var enc = btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: enc }) })
      .then(function (r) { if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { throw new Error('Gmail 발송 실패: ' + ((j.error && j.error.message) || r.status)); }); });
  }

  /* ---------- 엑셀 ---------- */
  function needXlsx() { if (!window.XLSX) { toast('엑셀 모듈을 불러오지 못했습니다. 새로고침해 주십시오.', true); return false; } return true; }
  function xlOut() {
    if (!needXlsx()) return;
    var rows = [['구분', '업무명', '부서', '단계', '담당자', '담당자 이메일', '시작일', '마감일', '진행률(%)', '상태']];
    filtered().forEach(function (t) { rows.push([t.kind, t.title, t.dept, stages(t.kind)[t.stage], t.owner_name, t.owner, t.start || '', t.due || '', t.progress, STL[status(t)]]); });
    var ws = XLSX.utils.aoa_to_sheet(rows), wb = XLSX.utils.book_new(); ws['!cols'] = [8, 40, 14, 14, 12, 26, 12, 12, 10, 8].map(function (w) { return { wch: w }; });
    XLSX.utils.book_append_sheet(wb, ws, '업무'); XLSX.writeFile(wb, '업무현황_' + TODAY + '.xlsx');
  }
  function pickFile(cb) {
    if (!needXlsx()) return;
    var i = document.createElement('input'); i.type = 'file'; i.accept = '.xlsx,.xls,.csv';
    i.onchange = function () {
      var f = i.files[0]; if (!f) return; if (f.size > 3e6) return toast('파일이 너무 큽니다(3MB 이하).', true);
      var r = new FileReader(); r.onload = function () {
        try { var wb = XLSX.read(r.result, { type: 'array', cellDates: true }); cb(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true })); }
        catch (e) { toast('파일을 읽지 못했습니다.', true); }
      }; r.readAsArrayBuffer(f);
    }; i.click();
  }
  function cell(v) { if (v instanceof Date) return ymd(v); return String(v == null ? '' : v).trim(); }
  function dateOf(v) {
    var s = cell(v).replace(/[./]/g, '-'); if (!s) return null;
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? m[1] + '-' + p2(+m[2]) + '-' + p2(+m[3]) : 'BAD';
  }
  function xlIn() {
    pickFile(function (rows) {
      var out = [], errs = [];
      rows.forEach(function (r, i) {
        var title = cell(r['업무명'] || r['제목']), kind = cell(r['구분']), s = dateOf(r['시작일']), e = dateOf(r['마감일']), ow = cell(r['담당자 이메일'] || r['담당자']).toLowerCase();
        if (!title) return;
        if (KINDS.indexOf(kind) < 0) { errs.push((i + 2) + '행: 구분은 행사/과정/TF/일반 중 하나여야 합니다.'); return; }
        if (s === 'BAD' || e === 'BAD') { errs.push((i + 2) + '행: 날짜 형식은 2026-11-30 입니다.'); return; }
        if (ow && !mem(ow)) { errs.push((i + 2) + '행: 담당자 이메일이 구성원에 없습니다.'); return; }
        var p = { kind: kind, title: title, dept: cell(r['부서']), start_date: s, due_date: e, note: cell(r['메모']) };
        if (ow) p.owner = ow; out.push(p);
      });
      var m = modal('<div class="pn-h"><div><h3>엑셀 가져오기 확인</h3></div><button class="ib" data-act="mclose" aria-label="닫기">' + ico('x') + '</button></div><div class="pn-b"><p>등록 가능한 업무 <b>' + out.length + '건</b>' + (errs.length ? ', 제외 ' + errs.length + '건' : '') + '입니다.' +
        (S.me.role !== 'admin' ? ' 부서는 본인 부서로 등록됩니다.' : '') + '</p>' + (errs.length ? '<div class="err-box">' + errs.slice(0, 12).map(esc).join('<br>') + (errs.length > 12 ? '<br>…' : '') + '</div>' : '') +
        '<div class="muted sm">필요한 열: 구분, 업무명, 부서, 담당자 이메일, 시작일, 마감일, 메모</div></div><div class="pn-f"><button class="btn gray" data-act="xl-tpl">양식 받기</button><button class="btn" id="xl-go"' + (out.length ? '' : ' disabled') + '>' + out.length + '건 등록</button></div>');
      $('#xl-go', m).onclick = function () {
        this.disabled = true;
        rpc('tsk_import', { p_rows: out.slice(0, 200) }).then(function (n) { closeModal(); toast(n + '건을 등록했습니다.'); boot(true); }).catch(function (x) { fail(x); closeModal(); });
      };
    });
  }
  function xlTemplate() {
    if (!needXlsx()) return;
    var ws = XLSX.utils.aoa_to_sheet([['구분', '업무명', '부서', '담당자 이메일', '시작일', '마감일', '메모'], ['과정', '예시: 겨울방학 특강', S.me.dept || '기획처', S.me.email, '2026-12-01', '2027-01-31', '']]);
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '업무'); XLSX.writeFile(wb, '업무_가져오기_양식.xlsx');
  }

  /* ---------- 대상자 도우미 ---------- */
  function parseTargets(lines) {
    return lines.map(function (r) {
      var sc = parseFloat(String(r[3] == null ? '' : r[3]).replace(/[^\d.]/g, ''));
      return { name: cell(r[0]).slice(0, 40), org: cell(r[1]).slice(0, 60), contact: cell(r[2]).slice(0, 80), score: isNaN(sc) ? null : sc };
    }).filter(function (x) { return x.name; });
  }
  function importTargets(rows) {
    if (!rows.length) return toast('등록할 행이 없습니다.', true);
    rpc('tsk_target_import', { p_task: S.dr.id, p_rows: rows }).then(function (n) { toast(n + '명을 등록했습니다.'); refreshTask(S.dr.id); }).catch(fail);
  }

  /* ---------- 클릭·입력 처리 ---------- */
  function curTask() { return S.dr && S.dr.data ? S.dr.data.task : null; }
  function act(name, el) {
    var t = curTask(), id = S.dr && S.dr.id;
    switch (name) {
      case 'new': return taskForm(null, []);
      case 'dclose': return closeDrawer();
      case 'mclose': return closeModal();
      case 'fclear': S.f = { q: '', kind: '', dept: '', owner: '', status: '', range: '', stage: '', arch: false, mine: false }; return tabBoard();
      case 'xl-out': return xlOut();
      case 'xl-in': return xlIn();
      case 'xl-tpl': return xlTemplate();
      case 'bn': Notification.requestPermission().then(function () { renderMain(); }); return;
      case 'readall': return rpc('tsk_notice_read', { p_ids: null }).then(function () { S.notices.forEach(function (n) { n.read = true; }); S.lastUnread = 0; renderTabs(); renderMain(); }).catch(fail);
      case 'tedit': return taskForm(t, S.dr.data.parts);
      case 'tarch': return rpc('tsk_task_archive', { p_id: id, p_flag: !t.archived }).then(function () { toast(t.archived ? '보관을 해제했습니다.' : '보관했습니다.'); refreshTask(id); }).catch(fail);
      case 'tdel': return confirmBox('「' + t.title + '」 업무와 체크리스트·대상자·평가가 모두 삭제됩니다. 되돌릴 수 없습니다.', function () {
        rpc('tsk_task_delete', { p_id: id }).then(function () { closeDrawer(); toast('삭제했습니다.'); boot(true); }).catch(fail); });
      case 'tmail': return mailModal({ to: [], subject: '[업무 공유] ' + t.title, task: id, body: t.title + '\n구분: ' + t.kind + ' / 단계: ' + stages(t.kind)[t.stage] + ' / 진행률 ' + t.progress + '%\n마감: ' + (t.due || '미정') + '\n담당: ' + t.owner_name + '\n\n' + location.href.split('#')[0] });
      case 'iadd': {
        var tx = $('#ia-t').value.trim(); if (!tx) return toast('항목 내용을 입력해 주십시오.', true);
        return rpc('tsk_item_save', { p_task: id, p: { stage: +$('#ia-s').value, text: tx, assignee: $('#ia-a').value || null, due: $('#ia-d').value || null } }).then(function () { refreshTask(id); }).catch(fail);
      }
      case 'idel': return rpc('tsk_item_delete', { p_id: el.dataset.id }).then(function () { refreshTask(id); }).catch(fail);
      case 'tgdel': return rpc('tsk_target_delete', { p_task: id, p_id: el.dataset.id }).then(function () { refreshTask(id); }).catch(fail);
      case 'tgimp': return importTargets(parseTargets($('#tg-paste').value.split(/\r?\n/).map(function (l) { return l.split('\t'); })));
      case 'tgfile': return pickFile(function (rows) {
        importTargets(parseTargets(rows.map(function (r) { return [r['이름'], r['소속'], r['연락처'] || r['이메일'], r['점수']]; }))); });
      case 'tgpick': return rpc('tsk_target_pick', { p_task: id, p_n: Math.max(0, parseInt($('#pickn').value, 10) || 0) }).then(function () { toast('선정을 반영했습니다.'); refreshTask(id); }).catch(fail);
      case 'tgmail': {
        var to = (S.dr.data.targets || []).filter(function (g) { return g.status === '선정' && /@/.test(g.contact); }).map(function (g) { return { email: g.contact.trim(), name: g.name }; });
        if (!to.length) return toast('이메일 연락처가 있는 선정자가 없습니다.', true);
        return mailModal({ to: to, task: id, subject: '[' + t.title + '] 선정 안내', body: '{이름}님, 안녕하십니까.\n\n「' + t.title + '」에 선정되셨음을 안내드립니다.\n일정: ' + (t.start || '') + (t.due ? ' ~ ' + t.due : '') + '\n\n자세한 사항은 별도로 안내드리겠습니다.\n\n아세아항공직업전문학교' });
      }
      case 'evsave': {
        var sc = {}; document.querySelectorAll('[data-sc]').forEach(function (g) { var on = g.querySelector('.on'); if (on) sc[g.dataset.sc] = +on.dataset.score; });
        return rpc('tsk_eval_save', { p_task: id, p: { scores: sc, comment: $('#ev-c').value, improvements: $('#ev-i').value } }).then(function () { toast('평가를 저장했습니다.'); refreshTask(id); }).catch(fail);
      }
      case 'retsave': return rpc('tsk_retro_save', { p_task: id, p_text: $('#retro').value }).then(function () { toast('회고를 저장했습니다.'); refreshTask(id); }).catch(fail);
      case 'msave': {
        var row = el.closest('tr'), g = function (k) { return $('[data-mf=' + k + ']', row).value; };
        return rpc('tsk_member_save', { p: { email: el.dataset.email, name: g('name'), dept: g('dept'), role: g('role'), status: g('status') } }).then(function () { toast('저장했습니다.'); boot(true); }).catch(fail);
      }
      case 'madd': {
        var em = $('#nm-e').value.trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast('이메일 형식을 확인해 주십시오.', true);
        return rpc('tsk_member_save', { p: { email: em, name: $('#nm-n').value.trim(), dept: $('#nm-d').value.trim(), role: $('#nm-r').value, status: 'active' } }).then(function () { toast('등록했습니다.'); boot(true); }).catch(fail);
      }
      case 'evadd': { var box = $('#evf'), n = box.children.length; if (n >= 10) return toast('평가 항목은 10개까지입니다.', true); box.insertAdjacentHTML('beforeend', evRow({ key: 'item' + (n + 1), label: '' }, n)); return; }
      case 'evdel': return el.closest('[data-ev]').remove();
      case 'cfgsave': {
        var st = {}; document.querySelectorAll('[data-st]').forEach(function (i) { var a = i.dataset.st.split('|'); (st[a[0]] = st[a[0]] || [])[+a[1]] = i.value.trim(); });
        var ef = Array.prototype.map.call(document.querySelectorAll('[data-ev]'), function (r) { return { key: $('[data-evk]', r).value.trim(), label: $('[data-evl]', r).value.trim() }; });
        return rpc('tsk_cfg_save', { p: { stages: st, eval_form: ef, remind_days: parseInt($('#rd').value, 10) || 0 } }).then(function () { toast('설정을 저장했습니다.'); boot(true); }).catch(fail);
      }
      case 'tpl-new': return tplForm(null);
      case 'tpl-edit': return rpc('tsk_tpl_get', { p_id: el.dataset.id }).then(tplForm).catch(fail);
      case 'tpl-del': return confirmBox('이 템플릿을 삭제하시겠습니까? 이미 만든 업무에는 영향이 없습니다.', function () { rpc('tsk_tpl_delete', { p_id: el.dataset.id }).then(function () { boot(true); }).catch(fail); });
      case 'mail-late': {
        var late = S.tasks.filter(function (x) { return !x.archived && status(x) === 'late' && x.owner && (S.me.role === 'admin' || x.dept === S.me.dept); }), by = {};
        late.forEach(function (x) { (by[x.owner] = by[x.owner] || []).push('· ' + x.title + ' (마감 ' + x.due + ')'); });
        var lst = late.map(function (x) { return '· ' + x.owner_name + ' — ' + x.title + ' (마감 ' + x.due + ')'; }).join('\n');
        return mailModal({ to: Object.keys(by).map(function (e) { return { email: e, name: mname(e) }; }), subject: '[업무진행] 마감이 지난 업무 확인 요청',
          body: '{이름}님, 안녕하십니까.\n\n아래 업무의 마감일이 지났습니다. 진행 상황을 업무진행 시스템에 반영해 주시기 바랍니다.\n\n' + lst + '\n\n' + location.href.split('#')[0] });
      }
    }
  }
  function confirmBox(msg, ok) {
    var m = modal('<div class="pn-h"><div><h3>확인</h3></div></div><div class="pn-b"><p style="margin:0">' + esc(msg) + '</p></div><div class="pn-f"><button class="btn gray" data-act="mclose">취소</button><button class="btn red" id="cf-ok">진행</button></div>');
    $('#cf-ok', m).onclick = function () { closeModal(); ok(); };
  }
  function tplForm(tp) {
    var txt = tp ? tp.items.map(function (i) { return (i.s + 1) + ' ' + i.t; }).join('\n') : '';
    var m = modal('<div class="pn-h"><div><h3>템플릿 ' + (tp ? '수정' : '추가') + '</h3></div><button class="ib" data-act="mclose" aria-label="닫기">' + ico('x') + '</button></div><div class="pn-b">' +
      '<div class="grid2"><label class="f">이름<input type="text" id="tp-n" maxlength="60" value="' + esc(tp ? tp.name : '') + '"></label><label class="f">구분<select id="tp-k">' + KINDS.map(function (k) { return opt(k, k, tp ? tp.kind : '과정'); }).join('') + '</select></label></div>' +
      '<label class="f">체크리스트 (한 줄에 한 항목: 단계번호(1~6) 띄어쓰기 항목명)<textarea id="tp-i" style="min-height:220px" placeholder="1 운영 계획 기안&#10;2 모집 공고 게시">' + esc(txt) + '</textarea></label><div class="err-box hide" id="tp-e"></div></div>' +
      '<div class="pn-f"><button class="btn gray" data-act="mclose">취소</button><button class="btn" id="tp-ok">저장</button></div>');
    $('#tp-ok', m).onclick = function () {
      var items = [], bad = '';
      $('#tp-i', m).value.split(/\r?\n/).forEach(function (l) { l = l.trim(); if (!l) return; var x = l.match(/^([1-6])\s+(.+)$/); if (!x) bad = '형식 오류: "' + l.slice(0, 30) + '" — 단계번호(1~6) 뒤에 항목명을 적어 주십시오.'; else items.push({ s: +x[1] - 1, t: x[2].slice(0, 200) }); });
      if (!$('#tp-n', m).value.trim()) bad = '이름을 입력해 주십시오.';
      if (bad) { var er = $('#tp-e', m); er.textContent = bad; er.classList.remove('hide'); return; }
      rpc('tsk_tpl_save', { p: { id: tp ? tp.id : null, name: $('#tp-n', m).value.trim(), kind: $('#tp-k', m).value, items: items } }).then(function () { closeModal(); toast('저장했습니다.'); boot(true); }).catch(fail);
    };
  }

  function stageMove(i) {
    var t = curTask(); if (!t || i === t.stage) return;
    rpc('tsk_task_stage', { p_id: t.id, p_stage: i, p_ver: t.ver }).then(function (r) { replaceTask(r); refreshTask(t.id); toast('「' + stages(t.kind)[i] + '」 단계로 옮겼습니다.'); }).catch(fail);
  }
  function saveTarget(row) {
    var g = function (k) { return $('[data-tf=' + k + ']', row).value; };
    if (!g('name').trim()) return toast('이름을 입력해 주십시오.', true);
    rpc('tsk_target_save', { p_task: S.dr.id, p: { id: row.dataset.trow, name: g('name').trim(), org: g('org'), contact: g('contact'), score: g('score') === '' ? null : g('score'), status: g('status') } }).then(function () { toast('저장했습니다.'); }).catch(fail);
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act],[data-tab],[data-view],[data-open],[data-dtab],[data-stage],[data-sort],[data-score],[data-shade]');
    if (!el) return;
    if (el.hasAttribute('data-shade')) { if (e.target === el) closeDrawer(); return; }
    if (el.dataset.act) { e.preventDefault(); return act(el.dataset.act, el); }
    if (el.dataset.tab) { S.tab = el.dataset.tab; pref('tab', S.tab); renderTabs(); return renderMain(); }
    if (el.dataset.view) { S.view = el.dataset.view; pref('view', S.view); return tabBoard(); }
    if (el.dataset.open) { e.preventDefault(); return openTask(el.dataset.open, el.dataset.tab2); }
    if (el.dataset.dtab) { S.dr.tab = el.dataset.dtab; return renderDrawer(); }
    if (el.dataset.stage) return stageMove(+el.dataset.stage);
    if (el.dataset.sort) { var k = el.dataset.sort; S.sort = { k: k, d: S.sort.k === k ? -S.sort.d : 1 }; return renderBody(); }
    if (el.dataset.score) { var on = el.parentNode.querySelector('.on'); if (on && on !== el) on.classList.remove('on'); el.classList.toggle('on'); }
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.dataset.f) { S.f[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; if (el.dataset.f === 'kind') return tabBoard(); return renderBody(); }
    if (el.dataset.itoggle) { var done = el.checked; return rpc('tsk_item_toggle', { p_id: el.dataset.itoggle, p_done: done }).then(function () { refreshTask(S.dr.id); }).catch(function (x) { el.checked = !done; fail(x); }); }
    if (el.dataset.mytoggle) return rpc('tsk_item_toggle', { p_id: el.dataset.mytoggle, p_done: true }).then(function () { toast('완료 처리했습니다.'); boot(true); }).catch(function (x) { el.checked = false; fail(x); });
    if (el.dataset.tf) return saveTarget(el.closest('tr'));
  });
  document.addEventListener('input', function (e) { if (e.target.id === 'fq') { S.f.q = e.target.value; renderBody(); } });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (document.querySelector('[data-modal]')) closeModal(); else if (S.dr) closeDrawer(); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.tk[data-open]')) { e.preventDefault(); openTask(e.target.dataset.open); }
  });
  /* 칸반 끌어놓기 */
  var dragId = null;
  document.addEventListener('dragstart', function (e) { var c = e.target.closest && e.target.closest('[data-drag]'); if (c) { dragId = c.dataset.drag; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (x) { /* 무시 */ } } });
  document.addEventListener('dragover', function (e) { var c = e.target.closest && e.target.closest('[data-col]'); if (c && dragId) { e.preventDefault(); c.classList.add('over'); } });
  document.addEventListener('dragleave', function (e) { var c = e.target.closest && e.target.closest('[data-col]'); if (c) c.classList.remove('over'); });
  document.addEventListener('drop', function (e) {
    var c = e.target.closest && e.target.closest('[data-col]'); if (!c || !dragId) return; e.preventDefault();
    var t = S.tasks.filter(function (x) { return x.id === dragId; })[0], to = +c.dataset.col; dragId = null;
    document.querySelectorAll('.col.over').forEach(function (x) { x.classList.remove('over'); });
    if (!t || t.stage === to) return;
    rpc('tsk_task_stage', { p_id: t.id, p_stage: to, p_ver: t.ver }).then(function (r) { replaceTask(r); renderBody(); toast('「' + stages(t.kind)[to] + '」 단계로 옮겼습니다.'); }).catch(fail);
  });
  document.addEventListener('dragend', function () { dragId = null; document.querySelectorAll('.col.over').forEach(function (x) { x.classList.remove('over'); }); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.me && !$('#layer').innerHTML) boot(true).catch(function () { /* 무시 */ }); });

  /* ---------- 시작 ---------- */
  S.view = pref('view') || 'board'; S.tab = pref('tab') || 'board';
  if (['board', 'timeline', 'table'].indexOf(S.view) < 0) S.view = 'board';
  S.tok = load('tsk_tok');
  if (S.tok) boot(); else loginView();
})();
