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
        '<button class="btn btn-ghost btn-sm" data-a="list">' + AW.ic('folder', 16) + '<span class="hm"> 양식 목록</span></button>' +
        '<button class="btn btn-secondary btn-sm" data-a="save">' + AW.ic('save', 16) + '<span class="hm"> 저장</span></button>' +
        '<button class="btn btn-ghost btn-sm" data-a="hist">' + AW.ic('history', 16) + '<span class="hm"> 이력</span></button>' +
        '<button class="ai-chip" id="ai-chip" title="AI 연결 상태 — 눌러서 점검"><i></i><span>AI</span></button>' +
        '<select class="in sm hm" id="t-lay" aria-label="화면 배치" title="화면 배치"><option value="">화면 배치</option><option value="balance">균형</option><option value="edit">양식 중심</option><option value="data">데이터 중심</option><option value="prev">미리보기 중심</option></select>' +
        '<button class="btn btn-ghost btn-sm" data-a="usr" aria-haspopup="menu">' + AW.ic('cols', 16) + '<span class="hm"> 사용자 메뉴</span></button></header>' +
      '<main class="panes" id="panes"></main>' +
      '<nav class="mtabs" aria-label="화면 전환">' + PANES.map(function (p) { return '<button data-mt="' + p[0] + '" class="' + (p[0] === mTab ? 'on' : '') + '">' + p[1] + '</button>'; }).join('') + '</nav></div>';
    var pn = $('#panes');
    PANES.forEach(function (p, i) {
      if (i) { var sp = document.createElement('div'); sp.className = 'split'; sp.dataset.i = i; sp.setAttribute('role', 'separator'); sp.setAttribute('aria-orientation', 'vertical'); pn.appendChild(sp); }
      var s = document.createElement('section'); s.className = 'pane'; s.id = 'p-' + p[0]; s.dataset.k = p[0];
      s.innerHTML = '<div class="ph"><button class="ph-t" data-col="' + p[0] + '" title="접기/펼치기"><span class="ph-n">' + p[1] + '</span>' + AW.ic('chevL', 16) + '</button></div><div class="pb" id="pb-' + p[0] + '"></div>';
      pn.appendChild(s);
    });
    AW.Editor.mount($('#pb-edit')); AW.Data.mount($('#pb-data')); AW.Preview.mount($('#pb-prev'));
    applyLayout();
    $('.shell').addEventListener('click', onShell);
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
    ({ usr: userMenu, list: listDialog, save: function () { save({ note: '수동 저장', toast: true }); }, hist: function () { AW.History.open(); }, out: logout })[b.dataset.a]();
  }
  function userMenu() {
    var b = $('[data-a="usr"]').getBoundingClientRect(), I = function (label, ic, fn, key, on) { return { k: 'i', label: label, ic: ic, fn: fn, key: key, on: on }; }, E = AW.Editor;
    E.menuAt(Math.max(8, b.right - 250), b.bottom + 4, [I('단축키 · 마우스 조합 보기', 'info', function () { E.act('keys'); }), { k: 'sep' },
      I('격자 · 자석 · 이동 간격 설정…', 'cols', function () { E.act('gridcfg'); }), I('눈금자 보기/숨기기', 'cols', function () { E.act('ruler'); }, 'Alt+R'), I('격자선 보기/숨기기', 'grid', function () { E.act('gridshow'); }, 'Alt+G'), { k: 'sep' },
      I('발급번호 규칙…', 'edit', function () { AW.Output.numDialog(); }), I('발급 대장 · 인증번호', 'check', function () { AW.History.open('reg'); }), { k: 'sep' },
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
    el.innerHTML = msg; var r = $('#t-retry'); if (r) r.onclick = function () { save({ note: '재시도' }); };
  }
  function save(o) {
    o = o || {}; var t = S.tpl; if (!t || !S.token) return Promise.resolve();
    if (!t.id && !(t.elems.length || t.bg || t.rows.length)) return Promise.resolve();
    if (saving) { again = true; return Promise.resolve(); }
    clearTimeout(timer); if (!S.dirty && !o.force && t.id) { if (o.toast) AW.toast('변경 사항이 없습니다.'); return Promise.resolve(); }
    saving = true; S.saveErr = ''; setStat(); var r0 = rev, bgSent = S.bgDirty;
    return AW.call('award_tpl_save', { p_id: t.id, p_base_ver: t.ver || 0, p_force: !!o.force, p_name: t.name, p_page: t.page, p_elems: t.elems, p_fields: t.fields, p_rows: t.rows,
      p_bg: bgSent ? (t.bg || '') : null, p_bg_name: t.bgName || '', p_note: o.note || '' }).then(function (r) {
      if (!r.ok) { if (r.error === 'CONFLICT') return conflict(r); throw new Error(r.error); }
      t.id = r.id; t.ver = r.ver; S.savedAt = new Date(); if (rev === r0) S.dirty = false; if (bgSent) S.bgDirty = false;
      AW.lsSet(LAST_KEY, t.id); if (o.toast) AW.toast('저장했습니다.', 'ok');
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
  window.addEventListener('beforeunload', function (e) { if (S.dirty && S.token) { e.preventDefault(); e.returnValue = ''; } });

  /* ───────────── 양식 열기·만들기·목록 ───────────── */
  function renderAll() {
    var t = S.tpl; $('#t-name').value = t.name; S.sel = []; S.row = Math.min(S.row, Math.max(0, t.rows.length - 1)); AW.syncFields();
    AW.Editor.render(); AW.Editor.resetHist(); AW.Data.refresh(true); AW.Preview.render(); setStat();
    AW.ensureFontsFor(t).then(function (n) { if (n) { AW.Editor.render(); AW.Preview.render(); } });
  }
  function openTpl(id) {
    return AW.call('award_tpl_get', { p_id: id }).then(function (r) {
      S.tpl = AW.fromServer(r); S.dirty = false; S.bgDirty = false; S.row = 0; S.saveErr = ''; S.savedAt = new Date(r.updated_at); AW.lsSet(LAST_KEY, id); renderAll();
    });
  }
  function newTpl() {
    S.tpl = AW.newTpl(); S.dirty = false; S.bgDirty = false; S.row = 0; S.saveErr = ''; S.savedAt = null; renderAll();
    AW.Editor.pageDialog();
  }
  function listDialog() {
    var go = function () {
      var m = AW.modal({ title: '양식 목록', wide: true, body: '<div id="tl-body"><div class="loading">불러오는 중…</div></div>',
        actions: [{ label: '닫기', cls: 'btn-ghost' }, { label: AW.ic('plus', 16) + ' 새 양식 만들기', cls: 'btn-primary', onClick: function (c) { c(); save({ note: '' }).then(newTpl); } }] });
      AW.call('award_tpl_list').then(function (l) {
        var b = $('#tl-body', m.el); if (!b) return;
        b.innerHTML = l.length ? '<div class="cards">' + l.map(function (x) {
          return '<div class="card' + (x.id === S.tpl.id ? ' cur' : '') + '"><div class="card-t">' + AW.esc(x.name) + '</div><div class="muted">v' + x.ver + ' · ' + AW.fmtTime(x.updated_at) + '<br>' + Math.round(x.page.w || 0) + '×' + Math.round(x.page.h || 0) + 'mm · 데이터 ' + x.rows + '행' + (x.has_bg ? ' · 배경 있음' : '') + '</div>' +
            '<div class="card-a"><button class="btn btn-primary btn-sm" data-o="' + x.id + '">열기</button><button class="btn btn-ghost btn-sm" data-d="' + x.id + '">복사</button><button class="btn btn-ghost btn-sm" data-x="' + x.id + '">삭제</button></div></div>';
        }).join('') + '</div>' : '<div class="empty">저장된 양식이 없습니다. 「새 양식 만들기」로 시작하십시오.</div>';
        AW.$$('[data-o]', b).forEach(function (x) { x.onclick = function () { x.disabled = true; save({ note: '' }).then(function () { return openTpl(x.dataset.o); }).then(m.close).catch(function (e) { AW.toast(e.message, 'error'); x.disabled = false; }); }; });
        AW.$$('[data-d]', b).forEach(function (x) { x.onclick = function () { AW.call('award_tpl_duplicate', { p_id: x.dataset.d }).then(function (r) { m.close(); return save({ note: '' }).then(function () { return openTpl(r.id); }); }).catch(function (e) { AW.toast(e.message, 'error'); }); }; });
        AW.$$('[data-x]', b).forEach(function (x) { x.onclick = function () { AW.confirm('양식 삭제', '이 양식을 목록에서 삭제합니다. 계속하시겠습니까?', '삭제', true).then(function (ok) { if (!ok) return; AW.call('award_tpl_delete', { p_id: x.dataset.x }).then(function () { if (S.tpl.id === x.dataset.x) { S.dirty = false; S.tpl = AW.newTpl(); renderAll(); } m.close(); listDialog(); }).catch(function (e) { AW.toast(e.message, 'error'); }); }); }; });
      }).catch(function (e) { var b = $('#tl-body', m.el); if (b) b.innerHTML = '<div class="alert warn">' + AW.esc(e.message) + '</div>'; });
    };
    save({ note: '' }).then(go);
  }
  function logout() {
    var run = function () { AW.rpc('award_logout', { p_token: S.token }).catch(function () {}); AW.setToken(null); S.dirty = false; S.tpl = null; showLogin(); };
    if (S.dirty) save({ note: '로그아웃 전 저장' }).then(run); else run();
  }

  /* ───────────── 시작 ───────────── */
  function start() {
    buildShell();
    var last = AW.lsGet(LAST_KEY, null), p = last ? openTpl(last) : Promise.reject();
    p.catch(function () { S.tpl = AW.newTpl(); renderAll(); listDialog(); });
  }
  A.adopt = function (nt) { return save({ note: '' }).then(function () { S.tpl = nt; S.dirty = true; S.bgDirty = !!nt.bg; S.row = 0; S.saveErr = ''; renderAll(); touch('elems'); }); };
  A.init = function () {
    var t = AW.loadToken(); if (!t) return showLogin();
    AW.S.token = t;
    AW.rpc('award_check', { p_token: t }).then(function (ok) { ok ? start() : showLogin(); }).catch(function (e) { if (e.code === 'NETWORK') { app.innerHTML = '<div class="loading">' + AW.esc(e.message) + ' <button class="btn btn-secondary btn-sm" onclick="location.reload()">새로고침</button></div>'; } else { AW.S.token = null; showLogin(); } });
  };
  A.init();
})();
