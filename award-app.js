'use strict';
/**
 * award-app.js — 로그인 · 3분할 화면(양식/데이터/미리보기) · 양식 목록 · 저장(자동저장·충돌 처리)
 */
(function () {
  var AW = window.AW, S = AW.S, $ = AW.$, A = {};
  var LAST_KEY = 'award_last_tpl', LAYOUT_KEY = 'award_layout';
  var PRESETS = { balance: { edit: 5, data: 3, prev: 4 }, edit: { edit: 8, data: 2, prev: 3 }, data: { edit: 3, data: 7, prev: 3 }, prev: { edit: 3, data: 2, prev: 7 } };
  var PANES = [['edit', '양식 편집'], ['data', '데이터 입력'], ['prev', '미리보기']];
  var lay = Object.assign({ w: AW.clone(PRESETS.balance), c: {} }, AW.lsGet(LAYOUT_KEY, {}));
  var A = AW.App = {};
  var rev = 0, saving = false, again = false, timer = null, mTab = 'edit';
  var app = $('#app');

  /* ───────────── 로그인 ───────────── */
  function showLogin(msg) {
    clearTimeout(timer);
    app.innerHTML = '<div class="login"><form class="lg-card" id="lg-f" autocomplete="off">' +
      '<div class="lg-logo">' + AW.ic('tpl', 30) + '</div><h1>상장 메일머지 출력기</h1><p class="muted">아세아항공직업전문학교 · 관리자 전용</p>' +
      '<label class="f" for="lg-pw">관리자 비밀번호</label><input class="in" id="lg-pw" type="password" autocomplete="current-password" required autofocus>' +
      '<div class="lg-err" id="lg-err" role="alert">' + AW.esc(msg || '') + '</div>' +
      '<button class="btn btn-primary block" id="lg-btn" type="submit">로그인</button></form></div>';
    $('#lg-f').onsubmit = function (e) {
      e.preventDefault(); var b = $('#lg-btn'); b.disabled = true; $('#lg-err').textContent = '';
      AW.rpc('award_login', { p_pw: $('#lg-pw').value }).then(function (r) {
        if (!r.ok) {
          var m = r.error === 'BAD_PASSWORD' ? '비밀번호가 올바르지 않습니다. (남은 시도 ' + r.left + '회)' : r.error === 'LOCKED_OUT' ? '시도 횟수를 초과했습니다. 15분 후 다시 시도해 주십시오.' : r.error === 'ADMIN_NOT_SET' ? '관리자 비밀번호가 아직 등록되지 않았습니다. (db/README_award.md 3단계)' : '로그인에 실패했습니다.';
          $('#lg-err').textContent = m; b.disabled = false; $('#lg-pw').select(); return;
        }
        AW.setToken(r.token); start();
      }).catch(function (er) { $('#lg-err').textContent = er.message; b.disabled = false; });
    };
  }
  AW.on('authlost', function () { showLogin('로그인이 만료되었습니다. 다시 로그인해 주십시오.'); });

  /* ───────────── 셸 ───────────── */
  function buildShell() {
    app.innerHTML =
      '<div class="shell" data-m="' + mTab + '">' +
      '<header class="top"><div class="brand">' + AW.ic('tpl', 22) + '<span>상장 메일머지</span></div>' +
        '<input class="in tname" id="t-name" maxlength="60" aria-label="양식 이름" placeholder="양식 이름">' +
        '<div class="sstat" id="t-stat" role="status"></div><span class="sp"></span>' +
        '<button class="icon-btn" id="h-undo" data-a="undo-h" title="되돌리기 (Ctrl+Z)" aria-label="되돌리기" disabled>' + AW.ic('undo', 18) + '</button><button class="icon-btn" id="h-redo" data-a="redo-h" title="다시 실행 (Ctrl+Y)" aria-label="다시 실행" disabled>' + AW.ic('redo', 18) + '</button><button class="icon-btn" id="h-hist" data-a="hist-h" title="작업 기록 (단계별로 돌아가기)" aria-label="작업 기록">' + AW.ic('history', 18) + '</button>' +
        '<button class="btn btn-ghost btn-sm" data-a="list">' + AW.ic('folder', 16) + '<span class="hm"> 양식 목록</span></button>' +
        '<button class="btn btn-secondary btn-sm" data-a="save">' + AW.ic('save', 16) + '<span class="hm"> 저장</span></button>' +
        '<button class="btn btn-ghost btn-sm" data-a="hist">' + AW.ic('history', 16) + '<span class="hm"> 이력</span></button>' +
        '<button class="ai-chip" id="ai-chip" title="AI 연결 상태 — 눌러서 점검"><i></i><span>AI</span></button>' +
        '<select class="in sm hm" id="t-lay" aria-label="화면 배치" title="화면 배치"><option value="">화면 배치</option><option value="balance">균형</option><option value="edit">양식 중심</option><option value="data">데이터 중심</option><option value="prev">미리보기 중심</option></select>' +
        '<button class="btn btn-ghost btn-sm" data-a="usr" aria-haspopup="menu">' + AW.ic('cols', 16) + '<span class="hm"> 사용자 메뉴</span></button></header>' +
      '<nav class="tabbar" id="tabbar" aria-label="열린 양식 탭"></nav>' +
      '<nav class="steps" id="steps" aria-label="작업 단계"></nav>' +
      '<main class="panes" id="panes"></main>' +
      '<nav class="mtabs" aria-label="화면 전환">' + PANES.map(function (p) { return '<button data-mt="' + p[0] + '" class="' + (p[0] === mTab ? 'on' : '') + '">' + p[1] + '</button>'; }).join('') + '</nav></div>';
    var pn = $('#panes');
    PANES.forEach(function (p, i) {
      if (i) { var sp = document.createElement('div'); sp.className = 'split'; sp.dataset.i = i; sp.setAttribute('role', 'separator'); sp.setAttribute('aria-orientation', 'vertical'); pn.appendChild(sp); }
      var s = document.createElement('section'); s.className = 'pane'; s.id = 'p-' + p[0]; s.dataset.k = p[0];
      s.innerHTML = '<div class="ph"><button class="ph-t" data-col="' + p[0] + '" title="접기/펼치기"><span class="ph-n">' + p[1] + '</span>' + AW.ic('chevL', 16) + '</button></div><div class="pb" id="pb-' + p[0] + '"></div>';
      pn.appendChild(s);
    });
    AW.Editor.mount($('#pb-edit')); AW.Data.mount($('#pb-data')); AW.Job.mount($('#pb-data')); AW.Preview.mount($('#pb-prev'));
    applyLayout();
    $('.shell').addEventListener('click', onShell); wireTabs();
    $('#t-lay').onchange = function (e) { if (e.target.value) { lay.w = AW.clone(PRESETS[e.target.value]); lay.c = {}; applyLayout(); saveLayout(); } e.target.value = ''; };
    $('#t-name').addEventListener('input', function (e) { S.tpl.name = e.target.value; touch('name'); });
    $('#ai-chip').onclick = function () { AW.AI.test(false); };
    if (!A.aiWired) { A.aiWired = true; AW.AI.onStatus(function (x) { var c = $('#ai-chip'); if (!c) return; c.className = 'ai-chip ' + x.st; c.title = 'AI ' + (x.st === 'ok' ? '연결 정상' : x.st === 'busy' ? '점검 중' : x.st === 'bad' ? '연결 실패' : '미점검') + (x.msg ? ' — ' + x.msg : '') + ' (눌러서 점검)'; $('span', c).textContent = x.st === 'ok' ? 'AI 연결됨' : x.st === 'busy' ? 'AI 점검 중' : x.st === 'bad' ? 'AI 연결 실패' : 'AI'; }); }
    AW.AI.auto(); AW.loadFontList();
    if (!A.fontWired) { A.fontWired = true; AW.on('fontlist', function () { if (!S.tpl || !$('#panes')) return; AW.Editor.fontSelects(); AW.ensureFontsFor(S.tpl).then(function (n) { if (n) { AW.Editor.render(); AW.Preview.render(); } }); }); }
    AW.$$('.split').forEach(function (sp) { sp.addEventListener('pointerdown', splitDown); sp.addEventListener('dblclick', function () { lay.w = AW.clone(PRESETS.balance); lay.c = {}; applyLayout(); saveLayout(); }); });
  }
  function onShell(e) {
    var col = e.target.closest('[data-col]'); if (col) { var k = col.dataset.col; lay.c[k] = !lay.c[k]; if (PANES.every(function (p) { return lay.c[p[0]]; })) lay.c[k] = false; applyLayout(); saveLayout(); return; }
    var mt = e.target.closest('[data-mt]'); if (mt) { mTab = mt.dataset.mt; $('.shell').dataset.m = mTab; AW.$$('.mtabs button').forEach(function (b) { b.classList.toggle('on', b === mt); }); setTimeout(relayout, 30); return; }
    var b = e.target.closest('header [data-a]'); if (!b) return;
    ({ 'undo-h': function () { AW.Editor.act('undo'); }, 'redo-h': function () { AW.Editor.act('redo'); }, 'hist-h': function () { var r = $('#h-hist').getBoundingClientRect(); AW.Editor.histMenu(r.left, r.bottom + 4); }, usr: userMenu, list: listDialog, save: function () { save({ note: '수동 저장', toast: true }); }, hist: function () { AW.History.open(); }, out: logout })[b.dataset.a]();
  }
  function userMenu() {
    var b = $('[data-a="usr"]').getBoundingClientRect(), I = function (label, ic, fn, key, on) { return { k: 'i', label: label, ic: ic, fn: fn, key: key, on: on }; }, E = AW.Editor;
    E.menuAt(Math.max(8, b.right - 250), b.bottom + 4, [I('단축키 · 마우스 조합 보기', 'info', function () { E.act('keys'); }), { k: 'sep' },
      I('격자 · 자석 · 이동 간격 설정…', 'cols', function () { E.act('gridcfg'); }), I('눈금자 보기/숨기기', 'cols', function () { E.act('ruler'); }, 'Alt+R'), I('격자선 보기/숨기기', 'grid', function () { E.act('gridshow'); }, 'Alt+G'), { k: 'sep' },
      I('스캔본으로 양식 자동 만들기 (AI)', 'sparkle', function () { AW.Scan.open(); }), I('현재 양식 복제', 'copy', function () { A.duplicate(); }), I('작업 관리 (월별·건별)…', 'cols', function () { AW.Job.manage(); }), I('발급번호 규칙…', 'edit', function () { AW.Output.numDialog(); }), I('발급 대장 · 인증번호', 'check', function () { AW.History.open('reg'); }), { k: 'sep' },
      I('내 글꼴 관리 (업로드)…', 'text', function () { AW.Output.fontDialog(); }), I('번역 용어집(직급·학과)…', 'edit', function () { AW.AI.glossDialog(); }), I('AI 연결 테스트', 'sparkle', function () { AW.AI.test(false); }), { k: 'sep' }, I('로그아웃', 'logout', logout)]);
  }
  function applyLayout() {
    PANES.forEach(function (p) {
      var s = $('#p-' + p[0]), c = !!lay.c[p[0]];
      s.classList.toggle('col', c); s.style.flex = c ? '0 0 40px' : (lay.w[p[0]] || 3) + ' 1 0';
      $('.ph-t', s).innerHTML = '<span class="ph-n">' + p[1] + '</span>' + AW.ic(c ? 'chevR' : 'chevL', 16);
      $('.ph-t', s).setAttribute('aria-expanded', String(!c));
    });
    AW.$$('.split').forEach(function (sp) { var i = +sp.dataset.i; sp.classList.toggle('off', !!lay.c[PANES[i - 1][0]] || !!lay.c[PANES[i][0]]); });
    setTimeout(relayout, 30);
  }
  function relayout() { AW.Editor.relayout(); AW.Preview.render(); }
  function saveLayout() { AW.lsSet(LAYOUT_KEY, lay); }
  function splitDown(ev) {
    var i = +ev.currentTarget.dataset.i, a = PANES[i - 1][0], b = PANES[i][0];
    if (lay.c[a] || lay.c[b]) return;
    var pa = $('#p-' + a), pb = $('#p-' + b), wa = pa.offsetWidth, wb = pb.offsetWidth, x0 = ev.clientX, tot = wa + wb;
    var ws = PANES.map(function (p) { return $('#p-' + p[0]).offsetWidth; });
    PANES.forEach(function (p, j) { if (!lay.c[p[0]]) { lay.w[p[0]] = ws[j]; $('#p-' + p[0]).style.flex = ws[j] + ' 1 0'; } });   // 모든 창을 px 기준 가중치로 통일
    ev.currentTarget.setPointerCapture(ev.pointerId); ev.currentTarget.classList.add('drag'); document.body.classList.add('resizing');
    var mv = function (e) { var na = Math.max(220, Math.min(tot - 220, wa + e.clientX - x0)); pa.style.flex = na + ' 1 0'; pb.style.flex = (tot - na) + ' 1 0'; lay.w[a] = na; lay.w[b] = tot - na; };
    var up = function () { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.body.classList.remove('resizing'); AW.$$('.split').forEach(function (s) { s.classList.remove('drag'); });
      var sum = 0; PANES.forEach(function (p) { if (!lay.c[p[0]]) sum += lay.w[p[0]] || 0; }); PANES.forEach(function (p) { if (!lay.c[p[0]]) lay.w[p[0]] = Math.max(0.5, AW.round((lay.w[p[0]] || 3) / sum * 12, 2)); }); applyLayout(); saveLayout(); };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  }

  /* ───────────── 저장 ───────────── */
  function touch(kind) {
    rev++; S.dirty = true; setStat();
    var n = $('#t-name'); if (n && document.activeElement !== n) n.value = S.tpl.name;
    var t = S.tpl; if (!t.id && !(t.elems.length || t.bg || t.rows.length)) return;
    clearTimeout(timer); timer = setTimeout(function () { save({ note: '자동 저장' }); }, 2200);
  }
  AW.on('tplchange', function (k) { if (k !== 'load') touch(k); });
  AW.on('datachange', function () { touch('data'); });
  AW.on('savenow', function (note) { save({ note: typeof note === 'string' ? note : '수동 저장', toast: true }); });
  function setStat() {
    var el = $('#t-stat'); if (!el) return;
    var msg = S.saveErr ? '<span class="bad">저장 실패 — ' + AW.esc(S.saveErr) + ' <button class="lnk" id="t-retry">다시 시도</button></span>' :
      saving ? '저장 중…' : S.dirty ? '변경됨 · 저장 대기' : S.tpl && S.tpl.id ? AW.ic('cloud', 14) + ' 저장됨 · v' + S.tpl.ver + (S.savedAt ? ' · ' + AW.fmtTime(S.savedAt) : '') : '';
    el.innerHTML = msg; renderTabs(); var r = $('#t-retry'); if (r) r.onclick = function () { save({ note: '재시도' }); };
  }
  function save(o) {
    o = o || {}; var t = S.tpl; if (!t || !S.token) return Promise.resolve();
    if (!t.id && !(t.elems.length || t.bg || t.rows.length)) return Promise.resolve();
    if (saving) { again = true; return Promise.resolve(); }
    clearTimeout(timer); if (!S.dirty && !o.force && t.id) { if (o.toast) AW.toast('변경 사항이 없습니다.'); return Promise.resolve(); }
    saving = true; S.saveErr = ''; setStat(); var r0 = rev, bgSent = S.bgDirty;
    return AW.call('award_tpl_save', { p_id: t.id, p_base_ver: t.ver || 0, p_force: !!o.force, p_name: t.name, p_page: t.page, p_elems: t.elems, p_fields: t.fields, p_rows: S.jobId ? null : t.rows,
      p_bg: bgSent ? (t.bg || '') : null, p_bg_name: t.bgName || '', p_note: o.note || '' }).then(function (r) {
      if (!r.ok) { if (r.error === 'CONFLICT') return conflict(r); throw new Error(r.error); }
      t.id = r.id; t.ver = r.ver;
      if (S.tpl === t) { S.savedAt = new Date(); if (rev === r0) S.dirty = false; if (bgSent) S.bgDirty = false; } else { var ot = tabOfTpl(t); if (ot) { ot.dirty = false; if (bgSent) ot.bgDirty = false; ot.savedAt = new Date(); } }
      persistTabs();
      if (S.tpl === t) AW.lsSet(LAST_KEY, t.id); if (o.toast) AW.toast('저장했습니다.', 'ok');
      return AW.Job.saveRows().then(function () { if (!S.jobs.length || !t.id) AW.Job.load(); });
    }).catch(function (e) { S.saveErr = e.message || '오류'; if (o.toast) AW.toast('저장 실패: ' + S.saveErr, 'error'); }).then(function () {
      saving = false; setStat(); if (again || (S.dirty && !S.saveErr && rev !== r0)) { again = false; timer = setTimeout(function () { save({ note: '자동 저장' }); }, 600); }
    });
  }
  function conflict(r) {
    S.saveErr = '다른 단말기에서 먼저 저장됨'; setStat();
    AW.modal({ title: '저장 충돌', sticky: true,
      body: '<p style="margin-top:0">다른 단말기(또는 다른 브라우저 창)에서 이 양식이 먼저 저장되었습니다. (서버 v' + r.ver + ' · ' + AW.fmtTime(r.updated_at) + ', 이 화면 기준 v' + S.tpl.ver + ')</p><p class="muted" style="margin-bottom:0">어느 내용을 사용할지 선택해 주십시오. 이 화면의 내용으로 덮어써도 이전 서버 내용은 「양식 버전」에서 복원할 수 있습니다.</p>',
      actions: [{ label: '서버 내용 불러오기', cls: 'btn-secondary', onClick: function (c) { c(); S.dirty = false; S.saveErr = ''; openTpl(S.tpl.id); } },
        { label: '이 화면 내용으로 덮어쓰기', cls: 'btn-primary', onClick: function (c) { c(); S.saveErr = ''; S.tpl.ver = r.ver; save({ force: true, note: '충돌 후 덮어쓰기', toast: true }); } }] });
  }
  window.addEventListener('beforeunload', function (e) { if ((S.dirty || tabs.some(function (t) { return t.dirty && t.key !== cur; })) && S.token) { e.preventDefault(); e.returnValue = ''; } });

  /* ───────────── 양식 열기·만들기·목록 ───────────── */
  function renderAll(tab) {
    var t = S.tpl; $('#t-name').value = t.name; S.sel = []; S.row = Math.min(S.row, Math.max(0, t.rows.length - 1)); AW.syncFields();
    S.seenPrev = false; S.printed = false; S.sampleOnly = false;
    if (tab && tab.job) { S.jobs = tab.job.jobs || []; S.jobId = tab.job.jobId || null; AW.Job.draw(); } else AW.Job.reset();
    AW.Editor.render(); if (tab && tab.hist) AW.Editor.setHist(tab.hist); else AW.Editor.resetHist();
    AW.Data.refresh(true); AW.Preview.render(); setStat(); steps();
    AW.ensureFontsFor(t).then(function (n) { if (n) { AW.Editor.render(); AW.Preview.render(); } });
  }
  function openTpl(id) {   // 현재 탭의 내용을 서버 저장본으로 다시 불러옴
    return AW.call('award_tpl_get', { p_id: id }).then(function (r) {
      S.tpl = AW.fromServer(r); S.dirty = false; S.bgDirty = false; S.row = 0; S.saveErr = ''; S.savedAt = new Date(r.updated_at); AW.lsSet(LAST_KEY, id); var ct = curTab(); if (ct) { ct.tpl = S.tpl; ct.id = id; ct.hist = null; } renderAll();
      return AW.Job.afterOpen().then(function () { AW.Preview.render(); steps(); renderTabs(); persistTabs(); });
    });
  }

  /* ───────────── 문서 탭 (포토샵·크롬 탭처럼 여러 양식을 동시에 열어 두고 전환) ─────────────
   * 탭마다 양식·되돌리기 기록·작업(job) 상태를 메모리에 보관. 전환 전에 현재 탭은 자동 저장. 개체 복사(Ctrl+C)는 탭 사이에서 유지되어 다른 탭에 붙여넣을 수 있음.
   */
  var TABS_KEY = 'award_tabs', MAXTABS = 12, tabs = [], cur = null, tabSeq = 0;
  function mkTab(o) { return Object.assign({ key: 't' + (++tabSeq), id: null, name: '', tpl: null, hist: null, job: null, row: 0, dirty: false, bgDirty: false, savedAt: null }, o || {}); }
  function curTab() { return tabs.filter(function (t) { return t.key === cur; })[0]; }
  function tabOfTpl(tpl) { return tabs.filter(function (t) { return t.tpl === tpl; })[0]; }
  function stash() {
    var t = curTab(); if (!t || !S.tpl) return;
    t.tpl = S.tpl; t.id = S.tpl.id; t.name = S.tpl.name; t.hist = AW.Editor.getHist(); t.job = { jobs: S.jobs, jobId: S.jobId }; t.row = S.row; t.dirty = S.dirty; t.bgDirty = S.bgDirty; t.savedAt = S.savedAt;
  }
  function persistTabs() {
    var list = tabs.map(function (t) { var cu = t.key === cur && S.tpl; return { id: cu ? S.tpl.id : t.id, name: cu ? S.tpl.name : t.name }; }).filter(function (x) { return x.id; });
    AW.lsSet(TABS_KEY, { list: list });
  }
  function show(t) {   // 메모리에 올라와 있는 탭을 화면에 적용
    cur = t.key; S.tpl = t.tpl; S.dirty = !!t.dirty; S.bgDirty = !!t.bgDirty; S.row = t.row || 0; S.savedAt = t.savedAt; S.saveErr = '';
    if (S.tpl.id) AW.lsSet(LAST_KEY, S.tpl.id); renderAll(t); renderTabs(); persistTabs();
  }
  function activate(t) {   // 탭을 화면에 올림(서버에서 아직 안 불러온 탭이면 불러옴)
    if (t.tpl) { show(t); return Promise.resolve(); }
    return AW.call('award_tpl_get', { p_id: t.id }).then(function (r) {
      if (!r) throw new Error('양식을 찾을 수 없습니다.');
      t.tpl = AW.fromServer(r); t.savedAt = new Date(r.updated_at); t.dirty = false; t.bgDirty = false; t.row = 0; t.name = t.tpl.name;
      cur = t.key; S.tpl = t.tpl; S.dirty = false; S.bgDirty = false; S.row = 0; S.saveErr = ''; S.savedAt = t.savedAt; AW.lsSet(LAST_KEY, t.id); renderAll();
      return AW.Job.afterOpen().then(function () { AW.Preview.render(); steps(); renderTabs(); persistTabs(); });
    });
  }
  function gotoTab(key) {
    if (key === cur) return Promise.resolve(); var t = tabs.filter(function (x) { return x.key === key; })[0]; if (!t) return Promise.resolve();
    clearTimeout(timer);
    return save({ note: '탭 전환 전 저장' }).then(function () { stash(); return activate(t); }).catch(function (e) { AW.toast(e.message, 'error'); });
  }
  function openInTab(id) {   // 이미 열려 있으면 그 탭으로, 아니면 새 탭으로 열기
    var ex = tabs.filter(function (t) { return t.id === id || (t.tpl && t.tpl.id === id); })[0]; if (ex) return gotoTab(ex.key);
    if (tabs.length >= MAXTABS) { AW.toast('탭은 최대 ' + MAXTABS + '개까지 열 수 있습니다. 쓰지 않는 탭을 닫아 주십시오.', 'error'); return Promise.resolve(); }
    var t = mkTab({ id: id }); tabs.push(t); clearTimeout(timer);
    return save({ note: '탭 전환 전 저장' }).then(function () { stash(); return activate(t); }).catch(function (e) { tabs = tabs.filter(function (x) { return x !== t; }); renderTabs(); AW.toast(e.message, 'error'); });
  }
  function newTab() {
    if (tabs.length >= MAXTABS) { AW.toast('탭은 최대 ' + MAXTABS + '개까지 열 수 있습니다.', 'error'); return Promise.resolve(); }
    if (S.tpl && !S.tpl.id && !S.tpl.elems.length && !S.tpl.bg && !S.tpl.rows.length) { AW.Editor.pageDialog(); return Promise.resolve(); }   // 비어 있는 새 탭이면 그대로 사용
    clearTimeout(timer);
    return save({ note: '' }).then(function () { stash(); var t = mkTab({ tpl: AW.newTpl(), name: '새 상장 양식' }); tabs.push(t); show(t); AW.Editor.pageDialog(); });
  }
  function closeTab(key, force) {
    var i = -1; tabs.forEach(function (t, k) { if (t.key === key) i = k; }); if (i < 0) return Promise.resolve(); var t = tabs[i], isCur = key === cur;
    var ask = (!isCur && t.dirty && !force) ? AW.confirm('탭 닫기', '「' + (t.name || '이름 없음') + '」 탭에 저장되지 않은 변경이 있습니다. 그래도 닫으시겠습니까?', '닫기', true) : Promise.resolve(true);
    return ask.then(function (ok) { if (!ok) return; return isCur && !force ? save({ note: '탭 닫기 전 저장' }) : null; }).then(function () {
      tabs.splice(i, 1);
      if (isCur) {
        cur = null;
        if (!tabs.length) { var nt = mkTab({ tpl: AW.newTpl(), name: '새 상장 양식' }); tabs.push(nt); show(nt); return; }
        return activate(tabs[Math.min(i, tabs.length - 1)]);
      }
      renderTabs(); persistTabs();
    }).catch(function (e) { AW.toast(e.message, 'error'); });
  }
  function closeOthers(key) {
    var others = tabs.filter(function (t) { return t.key !== key; }), dirty = others.filter(function (t) { return t.key === cur ? S.dirty : t.dirty; }).length;
    return AW.confirm('다른 탭 모두 닫기', '다른 ' + others.length + '개 탭을 닫습니다.' + (dirty ? ' 저장되지 않은 변경이 있는 탭 ' + dirty + '개가 있습니다.' : '') + ' 계속하시겠습니까?', '닫기', true).then(function (ok) {
      if (!ok) return; var go = key === cur ? Promise.resolve() : gotoTab(key); return go.then(function () { tabs = tabs.filter(function (t) { return t.key === key; }); renderTabs(); persistTabs(); });
    });
  }
  // 다른 탭의 양식 전체(개체·배경·항목·데이터)를 현재 탭에 합치기
  function mergeFromTab(key) {
    var t = tabs.filter(function (x) { return x.key === key; })[0]; if (!t || key === cur) return;
    var load = t.tpl ? Promise.resolve(t.tpl) : AW.call('award_tpl_get', { p_id: t.id }).then(function (r) { return AW.fromServer(r); });
    load.then(function (src) {
      var cur0 = S.tpl, diff = Math.abs(src.page.w - cur0.page.w) > 1 || Math.abs(src.page.h - cur0.page.h) > 1;
      AW.modal({ title: '탭의 양식 합치기', body: '<p style="margin-top:0">「' + AW.esc(src.name) + '」 탭의 내용을 현재 탭 「' + AW.esc(cur0.name) + '」 에 합칩니다. 현재 양식은 되돌리기(Ctrl+Z)로 복구할 수 있습니다.</p><div class="radios">' +
        '<label><input type="checkbox" id="mg-e" checked> 개체 <b>' + src.elems.length + '</b>개 (글상자·이미지·도형·QR)</label>' +
        '<label><input type="checkbox" id="mg-f" checked> 바뀌는 항목 설정(안내·예시·형식) — 합친 항목명에만 적용</label>' +
        '<label><input type="checkbox" id="mg-b"' + (src.bg ? '' : ' disabled') + '> 배경도 가져오기 <span class="muted">(현재 배경을 바꿉니다' + (src.bg ? '' : ' · 가져올 배경 없음') + ')</span></label>' +
        '<label><input type="checkbox" id="mg-r"' + (src.rows.length ? '' : ' disabled') + '> 입력 데이터 <b>' + src.rows.length + '</b>행도 가져오기 <span class="muted">(현재 데이터가 있으면 아래에 이어 붙임)</span></label></div>' +
        '<label class="f">위치·크기</label><select class="in" id="mg-p"><option value="same">원본 위치·크기 그대로</option><option value="scale"' + (diff ? ' selected' : '') + '>용지 크기에 맞춰 비율 조정' + (diff ? ' (용지가 달라 권장)' : '') + '</option></select>',
        actions: [{ label: '취소', cls: 'btn-ghost' }, { label: AW.ic('check', 15) + ' 합치기', cls: 'btn-primary', onClick: function (c) {
          var o = { e: AW.$('#mg-e').checked, f: AW.$('#mg-f').checked, b: AW.$('#mg-b').checked, r: AW.$('#mg-r').checked, scale: AW.$('#mg-p').value === 'scale' }; c(); doMerge(src, o);
        } }] });
    }).catch(function (e) { AW.toast(e.message, 'error'); });
  }
  function doMerge(src, o) {
    var cur0 = S.tpl, E = AW.Editor, kx = o.scale ? cur0.page.w / src.page.w : 1, ky = o.scale ? cur0.page.h / src.page.h : 1, km = Math.min(kx, ky), gm = {}, ids = [], had = {};
    cur0.fields.forEach(function (f) { had[f.name] = 1; });
    if (o.e) src.elems.forEach(function (e0) {
      var n = AW.clone(e0); n.id = AW.uid(); n.lock = false; if (n.grp) n.grp = gm[n.grp] = gm[n.grp] || AW.uid('g'); n.x = AW.round(n.x * kx, 2); n.y = AW.round(n.y * ky, 2); n.w = AW.round(n.w * kx, 2); n.h = AW.round(n.h * ky, 2); if (n.size) n.size = AW.round(n.size * km, 1); cur0.elems.push(n); ids.push(n.id);
    });
    if (o.b && src.bg) { cur0.bg = src.bg; cur0.bgName = src.bgName; S.bgDirty = true; }
    AW.syncFields();
    if (o.f) cur0.fields.forEach(function (f) { if (had[f.name]) return; var sf = src.fields.filter(function (x) { return x.name === f.name; })[0]; if (sf) { ['hint', 'example', 'max', 'req', 'fmt', 'sample'].forEach(function (k) { if (sf[k] != null) f[k] = AW.clone(sf[k]); }); } });
    if (o.r && src.rows.length) { cur0.rows = cur0.rows.concat(AW.clone(src.rows)); S.sampleOnly = false; AW.emit('datachange'); AW.Data.refresh(true); }
    E.refreshElems(); E.setSel(ids); E.api.changed(o.b ? 'bg' : 'elems', false, '다른 탭에서 합치기'); AW.Data.refresh(true);
    AW.toast('「' + src.name + '」 의 ' + (o.e ? '개체 ' + ids.length + '개' : '내용') + (o.b ? ' · 배경' : '') + (o.r ? ' · 데이터' : '') + ' 을(를) 합쳤습니다.', 'ok');
  }
  A.openId = function (id) { return openInTab(id); };
  function renderTabs() {
    var nav = $('#tabbar'); if (!nav) return;
    nav.innerHTML = tabs.map(function (t) {
      var on = t.key === cur, nm = (on && S.tpl ? S.tpl.name : t.name) || '이름 없음', dirty = on ? S.dirty : t.dirty;
      return '<div class="tb-i' + (on ? ' on' : '') + '" draggable="true" data-k="' + t.key + '" role="tab" aria-selected="' + on + '" title="' + AW.esc(nm) + '"><span class="tb-n">' + AW.esc(nm) + '</span>' + (dirty ? '<i class="tb-d" title="저장 대기"></i>' : '') + '<button class="tb-x" data-x="' + t.key + '" aria-label="탭 닫기" title="탭 닫기">' + AW.ic('close', 12) + '</button></div>';
    }).join('') + '<button class="tb-add" data-add="1" title="새 탭 (새 양식 · 양식 열기 · 스캔본)" aria-label="새 탭">' + AW.ic('plus', 16) + '</button>' + '<span class="tb-hint">탭을 끌어 순서 변경 · 오른쪽 클릭: 합치기·닫기 · 개체는 Ctrl+C → Ctrl+V 로 탭 사이 복사</span>';
  }
  function wireTabs() {
    var nav = $('#tabbar'); if (!nav) return;
    nav.addEventListener('click', function (e) {
      var x = e.target.closest('[data-x]'); if (x) { e.stopPropagation(); return closeTab(x.dataset.x); }
      var ad = e.target.closest('[data-add]'); if (ad) { var r = ad.getBoundingClientRect(), I = function (label, ic, fn) { return { k: 'i', label: label, ic: ic, fn: fn }; }; return AW.Editor.menuAt(r.left, r.bottom + 4, [I('새 양식 (새 탭)', 'plus', newTab), I('양식 열기 (새 탭)…', 'folder', function () { listDialog(); }), I('스캔본으로 만들기 (AI)…', 'sparkle', function () { AW.Scan.open(); })]); }
      var t = e.target.closest('[data-k]'); if (t) gotoTab(t.dataset.k);
    });
    var dragKey = null;   // 탭 끌어서 순서 바꾸기
    nav.addEventListener('dragstart', function (e) { var t = e.target.closest && e.target.closest('.tb-i'); if (!t) return; dragKey = t.dataset.k; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragKey); } catch (x) {} });
    nav.addEventListener('dragover', function (e) { if (!dragKey) return; e.preventDefault(); AW.$$('.tb-i', nav).forEach(function (n) { n.classList.remove('ov-l', 'ov-r'); }); var t = e.target.closest('.tb-i'); if (t && t.dataset.k !== dragKey) { var r = t.getBoundingClientRect(); t.classList.add(e.clientX < r.left + r.width / 2 ? 'ov-l' : 'ov-r'); } });
    nav.addEventListener('dragleave', function (e) { if (!nav.contains(e.relatedTarget)) AW.$$('.tb-i', nav).forEach(function (n) { n.classList.remove('ov-l', 'ov-r'); }); });
    nav.addEventListener('drop', function (e) {
      if (!dragKey) return; e.preventDefault(); var t = e.target.closest('.tb-i'), from = dragKey; dragKey = null; AW.$$('.tb-i', nav).forEach(function (n) { n.classList.remove('ov-l', 'ov-r'); });
      if (!t || t.dataset.k === from) return renderTabs(); var r = t.getBoundingClientRect(), after = e.clientX >= r.left + r.width / 2, mv = tabs.filter(function (x) { return x.key === from; })[0]; if (!mv) return;
      tabs = tabs.filter(function (x) { return x !== mv; }); var ti = -1; tabs.forEach(function (x, i) { if (x.key === t.dataset.k) ti = i; }); tabs.splice(after ? ti + 1 : ti, 0, mv); renderTabs(); persistTabs();
    });
    nav.addEventListener('dragend', function () { dragKey = null; AW.$$('.tb-i', nav).forEach(function (n) { n.classList.remove('ov-l', 'ov-r'); }); });
    nav.addEventListener('contextmenu', function (e) {   // 탭 오른쪽 클릭 메뉴
      var t = e.target.closest('.tb-i'); if (!t) return; e.preventDefault(); var key = t.dataset.k, isCur = key === cur, I = function (label, ic, fn, on) { return { k: 'i', label: label, ic: ic, fn: fn, on: on }; };
      AW.Editor.menuAt(e.clientX, e.clientY, [isCur ? I('현재 탭', 'check', function () {}) : I('이 탭의 양식을 현재 탭에 합치기…', 'copy', function () { mergeFromTab(key); }), I('이 탭으로 이동', 'chevR', function () { gotoTab(key); }), { k: 'sep' }, I('탭 닫기', 'close', function () { closeTab(key); }), I('다른 탭 모두 닫기', 'close', function () { closeOthers(key); })]);
    });
    nav.addEventListener('auxclick', function (e) { if (e.button !== 1) return; var t = e.target.closest('[data-k]'); if (t) { e.preventDefault(); closeTab(t.dataset.k); } });
    document.addEventListener('keydown', function (e) {   // Ctrl+Alt+←/→ 탭 이동, Ctrl+Alt+W 탭 닫기
      if (!S.token || !e.ctrlKey || !e.altKey || tabs.length < 1) return; var k = e.key, i = -1; tabs.forEach(function (t, n) { if (t.key === cur) i = n; });
      if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); gotoTab(tabs[(i + (k === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length].key); }
      else if (k === 'w' || k === 'W') { e.preventDefault(); closeTab(cur); }
    });
  }
  function newTpl() { return newTab(); }
  function listDialog() {
    var go = function () {
      var m = AW.modal({ title: '양식 목록 — 열기는 새 탭으로 열립니다', wide: true, body: '<div id="tl-body"><div class="loading">불러오는 중…</div></div>',
        actions: [{ label: '닫기', cls: 'btn-ghost' }, { label: AW.ic('sparkle', 16) + ' 스캔본으로 만들기 (AI)', cls: 'btn-secondary', onClick: function (c) { c(); AW.Scan.open(); } }, { label: AW.ic('plus', 16) + ' 새 양식 만들기', cls: 'btn-primary', onClick: function (c) { c(); newTab(); } }] });
      AW.call('award_tpl_list').then(function (l) {
        var b = $('#tl-body', m.el); if (!b) return;
        b.innerHTML = l.length ? '<div class="cards">' + l.map(function (x) {
          var open = tabs.some(function (t) { return t.id === x.id || (t.tpl && t.tpl.id === x.id); });
          return '<div class="card' + (x.id === S.tpl.id ? ' cur' : '') + '"><div class="card-t">' + AW.esc(x.name) + (open ? ' <span class="badge ok">열림</span>' : '') + '</div><div class="muted">v' + x.ver + ' · ' + AW.fmtTime(x.updated_at) + '<br>' + Math.round(x.page.w || 0) + '×' + Math.round(x.page.h || 0) + 'mm · 데이터 ' + x.rows + '행' + (x.has_bg ? ' · 배경 있음' : '') + '</div>' +
            '<div class="card-a"><button class="btn btn-primary btn-sm" data-o="' + x.id + '">열기</button><button class="btn btn-ghost btn-sm" data-d="' + x.id + '">복제</button><button class="btn btn-ghost btn-sm" data-x="' + x.id + '">삭제</button></div></div>';
        }).join('') + '</div>' : '<div class="empty">저장된 양식이 없습니다. 「새 양식 만들기」로 시작하십시오.</div>';
        AW.$$('[data-o]', b).forEach(function (x) { x.onclick = function () { x.disabled = true; openInTab(x.dataset.o).then(m.close).catch(function (e) { AW.toast(e.message, 'error'); x.disabled = false; }); }; });
        AW.$$('[data-d]', b).forEach(function (x) { x.onclick = function () { AW.call('award_tpl_duplicate', { p_id: x.dataset.d }).then(function (r) { m.close(); return openInTab(r.id); }).catch(function (e) { AW.toast(e.message, 'error'); }); }; });
        AW.$$('[data-x]', b).forEach(function (x) { x.onclick = function () { AW.confirm('양식 삭제', '이 양식을 목록에서 삭제합니다. 계속하시겠습니까?', '삭제', true).then(function (ok) { if (!ok) return; AW.call('award_tpl_delete', { p_id: x.dataset.x }).then(function () {
          var tb = tabs.filter(function (t) { return t.id === x.dataset.x || (t.tpl && t.tpl.id === x.dataset.x); })[0]; var p = Promise.resolve(); if (tb) { if (tb.key === cur) S.dirty = false; tb.dirty = false; p = closeTab(tb.key, true); }
          return p.then(function () { m.close(); listDialog(); }); }).catch(function (e) { AW.toast(e.message, 'error'); }); }); }; });
      }).catch(function (e) { var b = $('#tl-body', m.el); if (b) b.innerHTML = '<div class="alert warn">' + AW.esc(e.message) + '</div>'; });
    };
    save({ note: '' }).then(go);
  }
  function logout() {
    var run = function () { AW.rpc('award_logout', { p_token: S.token }).catch(function () {}); persistTabs(); AW.setToken(null); S.dirty = false; S.tpl = null; tabs = []; cur = null; showLogin(); };
    if (S.dirty) save({ note: '로그아웃 전 저장' }).then(run); else run();
  }

  /* ───────────── 시작 ───────────── */
  function start() {
    buildShell();
    var last = AW.lsGet(LAST_KEY, null), saved = AW.lsGet(TABS_KEY, null), list = saved && saved.list && saved.list.length ? saved.list : (last ? [{ id: last, name: '' }] : []);
    tabs = list.slice(0, MAXTABS).map(function (x) { return mkTab({ id: x.id, name: x.name || '' }); });
    var first = tabs.filter(function (t) { return t.id === last; })[0] || tabs[0], p = first ? activate(first) : Promise.reject();
    p.catch(function () { if (first) tabs = tabs.filter(function (t) { return t !== first; }); var nt = mkTab({ tpl: AW.newTpl(), name: '새 상장 양식' }); tabs.unshift(nt); show(nt); listDialog(); });
  }
  A.revertSaved = function () {
    if (!S.tpl || !S.tpl.id) return AW.toast('아직 저장된 적이 없는 양식입니다.');
    AW.confirm('마지막 저장 상태로 되돌리기', '저장된 버전으로 되돌립니다. 그 이후의 변경은 사라집니다. (자동 저장은 변경 후 약 2초 뒤에 이루어집니다)', '되돌리기', true).then(function (ok) { if (!ok) return; clearTimeout(timer); S.dirty = false; openTpl(S.tpl.id).then(function () { AW.toast('마지막 저장 상태로 되돌렸습니다.', 'ok'); }).catch(function (e) { AW.toast(e.message, 'error'); }); });
  };
  /* ───────────── 작업 단계 표시줄 ───────────── */
  var STEPS = [['bg', '양식 올리기', '[data-a="page"]', 'edit', '양식 파일(JPG·PNG·PDF)을 올립니다 — 「용지·배경 설정」'], ['lay', '배치', '[data-a="starter"]', 'edit', '「기본 상장 배치」를 넣거나 글상자를 추가해 양식 위에 배치합니다'],
    ['mg', '항목 지정', '[data-a="add-field"]', 'edit', '바뀌는 문구를 더블클릭 → 드래그 → 우클릭 → 「메일머지 항목으로 만들기」'], ['data', '데이터 입력', '#dt-file ~ *, [data-a="upx"]', 'data', '「엑셀 양식 받기」로 작성한 뒤 「엑셀 올리기」를 누릅니다'],
    ['prev', '미리보기 확인', '#pv-n', 'prev', '미리보기에서 행을 넘기며 내용을 확인합니다'], ['out', '인쇄', '#pb-prev [data-a="print"]', 'prev', '「인쇄 · PDF」로 출력합니다']];
  function stepDone(k) { var t = S.tpl; return k === 'bg' ? !!t.bg || t.elems.length > 0 : k === 'lay' ? t.elems.length > 0 : k === 'mg' ? t.fields.length > 0 : k === 'data' ? t.rows.length > 0 && !S.sampleOnly : k === 'prev' ? !!S.seenPrev : !!S.printed; }
  var stepsDeb = AW.debounce(function () { steps(); }, 120);
  function steps() {
    var nav = $('#steps'); if (!nav || !S.tpl) return; var off = AW.lsGet('award_steps_off', false), cur = -1;
    STEPS.forEach(function (s, i) { if (cur < 0 && !stepDone(s[0])) cur = i; });
    nav.innerHTML = STEPS.map(function (s, i) { var d = stepDone(s[0]) && i !== cur; return '<button class="stp ' + (d ? 'done' : i === cur ? 'cur' : 'todo') + '" data-s="' + i + '" title="' + AW.esc(s[4]) + '"><i>' + (d ? AW.ic('check', 12) : (i + 1)) + '</i>' + s[1] + '</button>'; }).join('<span class="stp-ar">' + AW.ic('chevR', 14) + '</span>') +
      '<span class="stp-hint">' + (cur < 0 ? AW.ic('check', 14) + ' 모든 단계를 마쳤습니다' : off ? '' : AW.ic('chevR', 14) + ' <b>' + (cur + 1) + '단계</b> ' + AW.esc(STEPS[cur][4])) + '</span><label class="mini chk" style="margin-left:auto"><input type="checkbox" id="stp-off"' + (off ? ' checked' : '') + '> 안내 끄기</label>';
    AW.$$('.pulse').forEach(function (n) { n.classList.remove('pulse'); });
    if (cur >= 0 && !off) { AW.$$(STEPS[cur][2]).forEach(function (n, i) { if (i < 2) n.classList.add('pulse'); }); if (STEPS[cur][3] === 'data') AW.$$('#p-data .ph-t').forEach(function (n) { n.classList.add('pulse'); }); }
  }
  AW.on('tplchange', stepsDeb); AW.on('datachange', stepsDeb); AW.on('stepchange', stepsDeb);
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#steps [data-s]'), o = e.target.id === 'stp-off' ? e.target : null;
    if (o) { AW.lsSet('award_steps_off', o.checked); return steps(); }
    if (!b) return; var s = STEPS[+b.dataset.s], pane = s[3];
    if (lay.c[pane]) { lay.c[pane] = false; applyLayout(); saveLayout(); } var mt = $('[data-mt="' + pane + '"]'); if (mt && getComputedStyle($('.mtabs')).display !== 'none') mt.click();
    var tg = AW.$(s[2]); if (tg) { tg.classList.add('pulse'); try { tg.scrollIntoView({ block: 'nearest' }); } catch (x) {} } AW.toast(s[4]);
  });
  A.duplicate = function () {   // 현재 편집 중인 양식을 저장한 뒤 사본을 만들어 바로 연다
    if (!S.tpl) return;
    save({ note: '복제 전 저장', force: true }).then(function () { if (!S.tpl.id) return AW.toast('저장된 양식만 복제할 수 있습니다.', 'error'); return AW.call('award_tpl_duplicate', { p_id: S.tpl.id }).then(function (r) { return openInTab(r.id).then(function () { AW.toast('양식을 복제했습니다. 지금 보는 것은 사본입니다.', 'ok'); }); }); }).catch(function (e) { AW.toast(e.message, 'error'); });
  };
  A.adopt = function (nt) {   // 스캔 등으로 만든 새 양식을 새 탭으로 열기
    if (tabs.length >= MAXTABS) { AW.toast('탭은 최대 ' + MAXTABS + '개까지 열 수 있습니다. 쓰지 않는 탭을 닫아 주십시오.', 'error'); return Promise.reject(new Error('tabs')); }
    clearTimeout(timer); return save({ note: '' }).then(function () { stash(); var t = mkTab({ tpl: nt, name: nt.name, dirty: true, bgDirty: !!nt.bg }); tabs.push(t); show(t); touch('elems'); });
  };
  A.init = function () {
    var t = AW.loadToken(); if (!t) return showLogin();
    AW.S.token = t;
    AW.rpc('award_check', { p_token: t }).then(function (ok) { ok ? start() : showLogin(); }).catch(function (e) { if (e.code === 'NETWORK') { app.innerHTML = '<div class="loading">' + AW.esc(e.message) + ' <button class="btn btn-secondary btn-sm" onclick="location.reload()">새로고침</button></div>'; } else { AW.S.token = null; showLogin(); } });
  };
  A.init();
})();
