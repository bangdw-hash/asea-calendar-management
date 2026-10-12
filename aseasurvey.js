'use strict';
/**
 * aseasurvey.js — 교내 설문 학생 화면
 *  흐름: 안내 → 반 선택 + 기본정보 → 과목별 평가(아코디언 슬라이드) → 제출 → 추첨번호
 *  · 완전 익명: 개인 식별 정보를 입력받지 않습니다.
 *  · 최종 제출 전까지는 기기에 임시 저장(이어서 작성 / 처음부터 다시)
 *  · 같은 기기 중복 제출 방지: localStorage + 쿠키 + 서버 기기 토큰 (테스트 모드에서는 해제)
 */
(function () {
  var $app = document.getElementById('app');
  var E = SVY.esc, I = SVY.ico;

  var S = {
    code: '', info: null, def: null, courses: [], test: false,
    step: 'load', sel: { track: '', grade: '', klass: '' }, ans: { common: {}, course: {} },
    open: '', active: 0, lastTick: 0, busy: false, ticket: '', rendered: {}, result: null, checkInput: ''
  };
  function K(s) { return 'svy_' + S.code + '_' + s; }

  /* ───────────── 공통 UI ───────────── */
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }
  function modal(html, onBind) {
    var bg = document.createElement('div'); bg.className = 'modal-bg'; bg.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(bg);
    function close() { bg.remove(); }
    bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
    if (onBind) onBind(bg, close);
    return close;
  }
  function confirmBox(title, body, okLabel, cancelLabel) {
    return new Promise(function (resolve) {
      modal('<h3>' + E(title) + '</h3><p class="muted" style="margin:8px 0 0">' + body + '</p>' +
        '<div class="btn-row"><button class="btn btn-ghost" data-r="0">' + E(cancelLabel || '취소') + '</button><button class="btn btn-primary" data-r="1">' + E(okLabel || '확인') + '</button></div>',
        function (bg, close) { bg.addEventListener('click', function (e) { var b = e.target.closest('[data-r]'); if (b) { close(); resolve(b.getAttribute('data-r') === '1'); } if (e.target === bg) resolve(false); }); });
    });
  }

  function header() {
    var i = (S.def && S.def.intro) || {};
    return '<header class="hdr"><div class="hdr-in"><img class="logo" src="aseasurvey-logo.png" alt="아세아항공직업전문학교">' +
      '<span class="hdr-sp"></span>' +
      (S.step === 'eval' || S.step === 'class' ? '<button class="hdr-btn" data-act="restart">처음부터</button>' : '') +
      '</div></header>' + (S.test ? '<div class="testbar">테스트 모드입니다. 이 응답은 정식 집계에 포함되지 않으며 시작 전에 초기화됩니다.</div>' : '');
  }
  function shell(inner, extra) { $app.innerHTML = header() + '<main class="wrap">' + inner + '</main>' + (extra || ''); }
  function msgScreen(kicker, title, body, icon) {
    shell('<div class="card center"><div class="okmark" style="background:var(--primary-lt);color:var(--primary-dk)">' + I(icon || 'info', 28) + '</div>' +
      '<div class="kicker">' + E(kicker) + '</div><h1 class="title">' + E(title) + '</h1><p class="muted" style="margin:10px 0 0">' + body + '</p></div>');
  }

  /* ───────────── 저장/복원 ───────────── */
  var saveT = 0;
  function tick() { var n = Date.now(); if (S.lastTick) S.active += Math.min(n - S.lastTick, 60000); S.lastTick = n; }
  function saveDraft() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      SVY.ls.setJSON(K('draft'), { sel: S.sel, ans: S.ans, open: S.open, active: S.active, step: S.step, v: S.info && S.info.version, at: Date.now() });
    }, 250);
  }
  function loadDraft() { var d = SVY.ls.getJSON(K('draft')); return d && d.ans ? d : null; }
  function clearDraft() { SVY.ls.del(K('draft')); }
  function doneRec() {
    if (S.test) return null;
    var d = SVY.ls.getJSON(K('done')); if (d && d.ticket) return d;
    var c = SVY.cookieGet('svyd_' + S.code); return c ? { ticket: c } : null;
  }
  function getToken() {
    if (S.test) return SVY.uid(16);
    var t = SVY.ls.get(K('token')); if (!t) { t = SVY.uid(16); SVY.ls.set(K('token'), t); } return t;
  }

  /* ───────────── 데이터 도우미 ───────────── */
  function classes() {
    var m = {};
    S.courses.forEach(function (c) { var k = [c.track, c.grade, c.klass].join('|'); if (!m[k]) m[k] = { track: c.track, grade: c.grade, klass: c.klass }; });
    return Object.keys(m).map(function (k) { return m[k]; });
  }
  function uniq(arr) { var o = [], s = {}; arr.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }
  function myCourses() { return S.courses.filter(function (c) { return c.track === S.sel.track && c.grade === S.sel.grade && c.klass === S.sel.klass; }); }
  function qs(scope, basic) { return SVY.allQuestions(S.def).filter(function (x) { return x.scope === scope && (basic === undefined || x.basic === basic); }); }
  function courseAns(cid) { return S.ans.course[cid] || (S.ans.course[cid] = {}); }

  // 과목 1개의 필수 문항 현황
  function courseStat(cid) {
    var a = courseAns(cid), total = 0, done = 0, firstMissing = '';
    qs('course').forEach(function (x) {
      if (!SVY.visible(S.def, x.q, a) || !SVY.isRequired(x.q)) return;
      total++;
      if (!SVY.isEmpty(x.q, a[x.q.id])) done++; else if (!firstMissing) firstMissing = x.q.id;
    });
    return { total: total, done: done, firstMissing: firstMissing };
  }
  function commonStat() {
    var total = 0, done = 0, firstMissing = '';
    qs('common').forEach(function (x) {
      if (!SVY.visible(S.def, x.q, S.ans.common) || !SVY.isRequired(x.q)) return;
      total++;
      if (!SVY.isEmpty(x.q, S.ans.common[x.q.id])) done++; else if (!firstMissing) firstMissing = x.q.id;
    });
    return { total: total, done: done, firstMissing: firstMissing };
  }
  function overall() {
    var t = 0, d = 0, cs = commonStat(); t += cs.total; d += cs.done;
    myCourses().forEach(function (c) { var s = courseStat(c.id); t += s.total; d += s.done; });
    return { total: t, done: d };
  }
  function firstIncomplete() {
    var cs = commonStat();
    if (cs.firstMissing && qs('common', true).some(function (x) { return x.q.id === cs.firstMissing; })) return { cid: 'common', qid: cs.firstMissing };
    var list = myCourses();
    for (var i = 0; i < list.length; i++) { var s = courseStat(list[i].id); if (s.firstMissing) return { cid: list[i].id, qid: s.firstMissing }; }
    if (cs.firstMissing) return { cid: 'common', qid: cs.firstMissing };
    return null;
  }

  /* ───────────── 질문 렌더링 ───────────── */
  function renderQ(x, cid) {
    var q = x.q, a = cid === 'common' ? S.ans.common : courseAns(cid), v = a[q.id];
    if (!SVY.visible(S.def, q, a)) return '';
    var h = '<div class="q" data-q="' + E(q.id) + '"><div class="q-label"><span class="q-id">' + E(q.id) + '</span>' + E(q.label) + (SVY.isRequired(q) ? '' : '') + '</div>';
    if (q.type === 'scale') {
      var sc = SVY.scaleOf(S.def, q), n = sc.length;
      h += '<div class="opts ' + (n <= 5 ? 'n' + n : 'list') + '" role="radiogroup" aria-label="' + E(q.id) + '">' + sc.map(function (o) {
        return '<button type="button" class="opt" role="radio" data-act="pick" data-q="' + E(q.id) + '" data-v="' + o.v + '" aria-pressed="' + (v === o.v) + '">' + E(o.label) + '</button>';
      }).join('') + '</div>';
    } else if (q.type === 'single') {
      h += '<div class="opts wide" role="radiogroup">' + (q.options || []).map(function (o) {
        return '<button type="button" class="opt" role="radio" data-act="single" data-q="' + E(q.id) + '" data-v="' + E(o.id) + '" aria-pressed="' + (v === o.id) + '">' + E(o.label) + '</button>';
      }).join('') + '</div>';
    } else if (q.type === 'multi') {
      var arr = Array.isArray(v) ? v : [];
      h += '<div class="opts list">' + (q.options || []).map(function (o) {
        var on = arr.indexOf(o.id) >= 0;
        return '<button type="button" class="opt" role="checkbox" data-act="multi" data-q="' + E(q.id) + '" data-v="' + E(o.id) + '" aria-pressed="' + on + '"><span class="box">' + I('check', 14) + '</span><span>' + E(o.label) + '</span></button>';
      }).join('') + '</div>';
    } else if (q.type === 'text') {
      var max = q.maxLen || 500;
      h += '<textarea class="fld" data-act="text" data-q="' + E(q.id) + '" maxlength="' + max + '" rows="3" placeholder="' + E(q.placeholder || '') + '">' + E(v || '') + '</textarea><div class="cnt"><span data-cnt>' + (v ? String(v).length : 0) + '</span>/' + max + '</div>';
    }
    return h + '</div>';
  }
  function renderCourseInner(c, idx, total) {
    var secs = {}, order = [];
    qs('course', false).forEach(function (x) { var sid = x.section ? x.section.id : '_'; if (!secs[sid]) { secs[sid] = { s: x.section, items: [] }; order.push(sid); } secs[sid].items.push(x); });
    var h = '<div class="swipe-hint">' + I('left', 14) + ' 좌우로 밀어 다른 과목으로 이동 ' + I('right', 14) + '</div>';
    order.forEach(function (sid) {
      var g = secs[sid];
      h += '<h4 class="sec">' + E(g.s.title) + '</h4>' + (g.s.note ? '<div class="sec-note">' + E(g.s.note) + '</div>' : '');
      h += '<div data-sec="' + E(sid) + '">' + g.items.map(function (x) { return renderQ(x, c.id); }).join('') + '</div>';
    });
    h += '<div class="nav-row">' + (idx > 0 ? '<button class="btn btn-ghost" data-act="copyprev" data-cid="' + c.id + '">' + I('copy', 16) + ' 이전 과목 척도 응답 복사</button>' : '') +
      (idx < total - 1 ? '<button class="btn btn-secondary" data-act="next" data-cid="' + c.id + '">다음 과목 ' + I('right', 16) + '</button>'
        : '<button class="btn btn-secondary" data-act="tocommon">마지막 문항으로 ' + I('down', 16) + '</button>') + '</div>';
    return h;
  }
  function courseHead(c, idx) {
    var s = courseStat(c.id), done = s.total > 0 && s.done === s.total;
    return '<button type="button" class="course-head" data-act="toggle" data-cid="' + c.id + '" aria-expanded="' + (S.open === c.id) + '">' +
      '<span class="c-num">' + (done ? I('check', 16) : (idx + 1)) + '</span>' +
      '<span class="c-name">' + E(c.name) + (c.kind ? '<small>' + E(c.kind) + '</small>' : '') + '</span>' +
      '<span class="c-prog" data-prog>' + (done ? '완료' : s.done + '/' + s.total) + '</span>' + I('chevron', 18).replace('class="ico"', 'class="ico c-chev"') + '</button>';
  }

  /* ───────────── 화면: 안내 ───────────── */
  function screenIntro() {
    var i = S.def.intro || {}, draft = loadDraft();
    var h = '<div class="card"><div class="kicker">' + E(i.subtitle || '') + '</div><h1 class="title">' + E(i.title || S.info.title) + '</h1><div class="org">' + E(i.org || '') + '</div>';
    if (i.rewardText) h += '<div class="reward">' + I('gift', 22) + '<div><b>참여 안내</b><br>' + E(i.rewardText) + '</div></div>';
    h += '<dl class="notice">' + (i.notice || []).map(function (n) { return '<div><dt>' + E(n.k) + '</dt><dd>' + E(n.v) + '</dd></div>'; }).join('') + '</dl>';
    if (i.timeNote) h += '<div class="timenote">' + I('info', 16) + E(i.timeNote) + '</div>';
    if (draft) {
      h += '<div class="msg warn">' + I('alert', 18) + '<div>작성 중이던 내용이 있습니다. 이어서 작성하시겠습니까?</div></div>' +
        '<div class="btn-row"><button class="btn btn-ghost" data-act="fresh">처음부터 다시</button><button class="btn btn-primary" data-act="resume">이어서 작성</button></div>';
    } else {
      h += '<div class="btn-row"><button class="btn btn-primary" data-act="start">설문 시작하기 ' + I('right', 16) + '</button></div>';
    }
    shell(h + '</div>');
  }

  /* ───────────── 화면: 반 선택 ───────────── */
  function classReady() {
    return S.sel.klass && myCourses().length && qs('common', true).every(function (x) { return !SVY.isRequired(x.q) || !SVY.isEmpty(x.q, S.ans.common[x.q.id]); });
  }
  function screenClass() {
    var tracks = uniq(S.courses.map(function (c) { return c.track; }));
    var grades = uniq(S.courses.filter(function (c) { return c.track === S.sel.track; }).map(function (c) { return c.grade; }));
    var klasses = uniq(S.courses.filter(function (c) { return c.track === S.sel.track && c.grade === S.sel.grade; }).map(function (c) { return c.klass; }));
    function chips(arr, key, cls) {
      return '<div class="opts ' + (cls || 'wide') + '">' + arr.map(function (v) { return '<button type="button" class="opt" data-act="sel" data-k="' + key + '" data-v="' + E(v) + '" aria-pressed="' + (S.sel[key] === v) + '">' + E(v) + '</button>'; }).join('') + '</div>';
    }
    var h = '<div class="card"><div class="kicker">1단계</div><h2 class="title" style="font-size:calc(19px*var(--fs))">수강 반 선택</h2><p class="muted" style="margin:4px 0 12px">선택한 반의 수강 과목이 표시됩니다.</p>';
    h += '<div class="chip-title">계열</div>' + chips(tracks, 'track');
    if (S.sel.track) h += '<div class="chip-title">학년</div>' + chips(grades, 'grade');
    if (S.sel.grade) h += '<div class="chip-title">반</div>' + chips(klasses, 'klass');
    var mc = S.sel.klass ? myCourses() : [];
    if (mc.length) h += '<div class="msg ok">' + I('check', 18) + '<div><b>수강 과목 ' + mc.length + '개</b><br>' + mc.map(function (c) { return E(c.name); }).join(' · ') + '</div></div>';
    h += '</div>';
    var basic = qs('common', true);
    if (basic.length && mc.length) h += '<div class="card"><div class="kicker">2단계</div><h2 class="title" style="font-size:calc(19px*var(--fs))">기본 정보</h2>' + basic.map(function (x) { return renderQ(x, 'common'); }).join('') + '</div>';
    var ok = classReady();
    h += '<div class="btn-row"><button class="btn btn-primary" data-act="toeval" ' + (ok ? '' : 'disabled') + '>과목별 설문 시작 ' + I('right', 16) + '</button></div>';
    shell(h);
  }

  /* ───────────── 화면: 평가(아코디언) ───────────── */
  function screenEval() {
    var list = myCourses(), cq = qs('common', false);
    var h = '<div class="stepper"><div class="stepper-row"><span><b data-ov-done>0</b> / <span data-ov-total>0</span> 문항 응답</span><span class="muted">' + E(S.sel.track) + ' ' + E(S.sel.grade) + ' ' + E(S.sel.klass) + '</span></div><div class="meter"><i data-ov-bar></i></div></div>';
    h += '<p class="hint" style="margin:0 0 4px">과목을 눌러 문항을 펼친 뒤 응답해 주십시오. 모든 필수 문항에 응답해야 제출할 수 있습니다.</p>';
    list.forEach(function (c, i) {
      h += '<section class="course" id="c-' + c.id + '" data-cid="' + c.id + '">' + courseHead(c, i) + '<div class="course-body"><div class="course-inner" data-inner></div></div></section>';
    });
    if (cq.length) {
      var gs = {}, ord = [];
      cq.forEach(function (x) { var sid = x.section ? x.section.id : '_'; if (!gs[sid]) { gs[sid] = { s: x.section, items: [] }; ord.push(sid); } gs[sid].items.push(x); });
      h += '<section class="card" id="c-common" style="margin-top:14px"><div class="kicker">공통 문항</div>' + ord.map(function (sid) {
        return (gs[sid].s ? '<div class="chip-title">' + E(gs[sid].s.title) + '</div>' : '') + '<div data-sec="common">' + gs[sid].items.map(function (x) { return renderQ(x, 'common'); }).join('') + '</div>';
      }).join('') + '</section>';
    }
    var bar = '<div class="bar"><div class="bar-in"><div class="bar-info" data-bar-info></div><button class="btn btn-primary" data-act="submit">제출하기</button></div></div>';
    shell(h, bar);
    S.rendered = {};
    if (S.open) openCourse(S.open, true);
    updateProgress();
  }
  function updateProgress() {
    var o = overall(), pct = o.total ? Math.round(o.done * 100 / o.total) : 0;
    var q = function (s) { return $app.querySelector(s); };
    if (q('[data-ov-done]')) { q('[data-ov-done]').textContent = o.done; q('[data-ov-total]').textContent = o.total; q('[data-ov-bar]').style.width = pct + '%'; }
    var bi = q('[data-bar-info]');
    if (bi) bi.innerHTML = o.done >= o.total ? '<b>모든 문항 응답 완료</b><br><span class="muted">제출할 수 있습니다.</span>' : '<b>' + (o.total - o.done) + '개 문항</b>이 남았습니다.<br><span class="muted">모든 필수 문항 응답 후 제출됩니다.</span>';
    myCourses().forEach(function (c, i) {
      var sec = document.getElementById('c-' + c.id); if (!sec) return;
      var s = courseStat(c.id), done = s.total > 0 && s.done === s.total;
      sec.classList.toggle('done', done);
      var num = sec.querySelector('.c-num'), pr = sec.querySelector('[data-prog]');
      if (num) num.innerHTML = done ? I('check', 16) : String(i + 1);
      if (pr) pr.textContent = done ? '완료' : s.done + '/' + s.total;
    });
  }
  function openCourse(cid, silent) {
    var list = myCourses(), idx = -1;
    list.forEach(function (c, i) { if (c.id === cid) idx = i; });
    if (idx < 0) return;
    S.open = cid;
    $app.querySelectorAll('.course').forEach(function (sec) {
      var on = sec.getAttribute('data-cid') === cid;
      sec.classList.toggle('open', on);
      var hd = sec.querySelector('.course-head'); if (hd) hd.setAttribute('aria-expanded', on);
    });
    var sec = document.getElementById('c-' + cid), inner = sec.querySelector('[data-inner]');
    if (!S.rendered[cid]) { inner.innerHTML = renderCourseInner(list[idx], idx, list.length); S.rendered[cid] = 1; }
    if (!silent) setTimeout(function () { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
    saveDraft();
  }
  function closeCourse(cid) {
    S.open = '';
    var sec = document.getElementById('c-' + cid); if (sec) { sec.classList.remove('open'); sec.querySelector('.course-head').setAttribute('aria-expanded', 'false'); }
    saveDraft();
  }
  function rerenderCourse(cid) {
    var list = myCourses(), idx = -1; list.forEach(function (c, i) { if (c.id === cid) idx = i; });
    var sec = document.getElementById('c-' + cid); if (!sec || idx < 0) return;
    sec.querySelector('[data-inner]').innerHTML = renderCourseInner(list[idx], idx, list.length);
  }
  function rerenderCommon() {
    var el = document.getElementById('c-common'); if (!el) return;
    var cq = qs('common', false), gs = {}, ord = [];
    cq.forEach(function (x) { var sid = x.section ? x.section.id : '_'; if (!gs[sid]) { gs[sid] = { s: x.section, items: [] }; ord.push(sid); } gs[sid].items.push(x); });
    el.innerHTML = '<div class="kicker">공통 문항</div>' + ord.map(function (sid) {
      return (gs[sid].s ? '<div class="chip-title">' + E(gs[sid].s.title) + '</div>' : '') + '<div data-sec="common">' + gs[sid].items.map(function (x) { return renderQ(x, 'common'); }).join('') + '</div>';
    }).join('');
  }

  /* ───────────── 화면: 완료 / 결과 ───────────── */
  function ticketCard(code, cls, label) {
    return '<div class="ticket ' + (cls || '') + '"><small>' + E(label || '내 추첨번호') + '</small><div class="ticket-code">' + E(code) + '</div></div>';
  }
  function screenDone(code, dup) {
    var i = S.def.intro || {};
    var h = '<div class="card center"><div class="okmark">' + I('check', 32) + '</div><h1 class="title">' + (dup ? '이미 제출하셨습니다' : '제출이 완료되었습니다') + '</h1>' +
      '<p class="muted" style="margin:8px 0 0">' + E(i.doneNote || '설문에 응해 주셔서 감사합니다.') + '</p>' + ticketCard(code) +
      '<p class="hint" style="margin:6px 0 0">추첨 결과 확인에 필요합니다. 번호를 꼭 저장해 주십시오.</p>' +
      '<div class="btn-row" style="justify-content:center"><button class="btn btn-primary" data-act="saveimg" data-code="' + E(code) + '">' + I('download', 16) + ' 번호 이미지로 저장</button>' +
      '<button class="btn btn-secondary" data-act="copycode" data-code="' + E(code) + '">' + I('copy', 16) + ' 번호 복사</button></div>' +
      (i.drawNotice ? '<div class="msg">' + I('info', 18) + '<div style="text-align:left">' + E(i.drawNotice) + '</div></div>' : '') +
      (S.test ? '<div class="msg warn">' + I('alert', 18) + '<div style="text-align:left">테스트 응답입니다. 정식 집계에는 포함되지 않습니다.</div></div><div class="btn-row"><button class="btn btn-ghost" data-act="fresh">테스트 한 번 더 하기</button></div>' : '') +
      '</div>';
    shell(h);
  }
  function screenResult() {
    var r = S.result, h = '<div class="card center"><div class="okmark" style="background:var(--primary-lt);color:var(--primary-dk)">' + I('trophy', 28) + '</div><h1 class="title">추첨 결과 확인</h1>' +
      '<p class="muted" style="margin:8px 0 14px">설문 제출 시 받은 추첨번호를 입력해 주십시오.</p>' +
      '<input class="fld" id="tk" maxlength="9" placeholder="예: ABCD-2345" autocomplete="off" autocapitalize="characters" style="text-align:center;letter-spacing:.12em;font-weight:700;max-width:320px;margin:0 auto" value="' + E(S.checkInput) + '">' +
      '<div class="btn-row" style="justify-content:center"><button class="btn btn-primary" data-act="check">결과 확인</button></div>';
    if (r) {
      if (r.state === 'won') {
        h += ticketCard(r.ticket, 'res-won', '당첨을 축하드립니다') + '<p style="margin:8px 0 0"><b>이 화면 또는 저장한 번호 이미지를 담당 부서에 제시해 주십시오.</b></p>' +
          (r.claimed ? '<div class="msg ok">' + I('check', 18) + '<div style="text-align:left">이미 수령 처리되었습니다.</div></div>' : '') +
          (S.info.draw_msg ? '<div class="msg">' + I('info', 18) + '<div style="text-align:left;white-space:pre-line">' + E(S.info.draw_msg) + '</div></div>' : '') +
          '<div class="btn-row" style="justify-content:center"><button class="btn btn-secondary" data-act="saveimg" data-code="' + E(r.ticket) + '" data-won="1">' + I('download', 16) + ' 당첨 화면 이미지로 저장</button></div>';
      } else if (r.state === 'lost') {
        h += '<div class="msg">' + I('info', 18) + '<div style="text-align:left">아쉽게도 이번 추첨에는 선정되지 않았습니다. 설문에 참여해 주셔서 감사합니다.</div></div>';
      } else {
        h += '<div class="msg err">' + I('alert', 18) + '<div style="text-align:left">입력하신 번호를 찾을 수 없습니다. 번호를 다시 확인해 주십시오.</div></div>';
      }
    }
    shell(h + '</div>');
  }

  /* ───────────── 액션 ───────────── */
  function go(step) { S.step = step; render(); window.scrollTo(0, 0); saveDraft(); }
  function render() {
    if (S.step === 'intro') screenIntro();
    else if (S.step === 'class') screenClass();
    else if (S.step === 'eval') screenEval();
  }
  function resetAnswers() { S.sel = { track: '', grade: '', klass: '' }; S.ans = { common: {}, course: {} }; S.open = ''; S.active = 0; S.lastTick = 0; }
  // 같은 과목에서 이전 과목의 '척도' 응답만 복사(빈 문항만). 성실응답 점검·윤리 문항은 복사하지 않음
  function copyPrev(cid) {
    var list = myCourses(), idx = -1; list.forEach(function (c, i) { if (c.id === cid) idx = i; });
    if (idx < 1) return;
    var from = courseAns(list[idx - 1].id), to = courseAns(cid), n = 0;
    qs('course', false).forEach(function (x) {
      if (x.q.type !== 'scale' || SVY.isCheck(x.q)) return;
      if (to[x.q.id] == null && from[x.q.id] != null) { to[x.q.id] = from[x.q.id]; n++; }
    });
    rerenderCourse(cid); updateProgress(); saveDraft(); toast(n ? n + '개 문항을 복사했습니다. 내용을 확인해 주십시오.' : '복사할 응답이 없습니다.');
  }
  function cleanAnswers() {
    var out = { common: {}, course: {} };
    function pick(src, scopeQs, dst) {
      scopeQs.forEach(function (x) {
        var v = src[x.q.id];
        if (!SVY.visible(S.def, x.q, src) || SVY.isEmpty(x.q, v)) return;
        dst[x.q.id] = x.q.type === 'text' ? String(v).trim() : v;
      });
    }
    pick(S.ans.common, qs('common'), out.common);
    myCourses().forEach(function (c) { out.course[c.id] = {}; pick(courseAns(c.id), qs('course'), out.course[c.id]); });
    return out;
  }
  async function submit() {
    if (S.busy) return;
    var fi = firstIncomplete();
    if (fi) {
      if (fi.cid === 'common') { var el = document.getElementById('c-common'); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); flash(el, fi.qid); }
      else { openCourse(fi.cid); setTimeout(function () { flash(document.getElementById('c-' + fi.cid), fi.qid); }, 380); }
      toast('응답하지 않은 문항이 있습니다.'); return;
    }
    var ok = await confirmBox('제출하시겠습니까?', '제출 후에는 <b>수정할 수 없습니다.</b><br>응답 내용을 다시 확인하셨다면 제출해 주십시오.', '제출', '돌아가기');
    if (!ok) return;
    S.busy = true; tick();
    var btn = $app.querySelector('[data-act="submit"]'); if (btn) { btn.disabled = true; btn.textContent = '제출 중…'; }
    try {
      var res = await SVY.rpc('svy_submit', { p_code: S.code, p_token: getToken(), p_payload: { track: S.sel.track, grade: S.sel.grade, klass: S.sel.klass, duration: Math.round(S.active / 1000), answers: cleanAnswers() } });
      if (!S.test) { SVY.ls.setJSON(K('done'), { ticket: res.ticket, at: Date.now() }); SVY.cookieSet('svyd_' + S.code, res.ticket); }
      clearDraft(); S.ticket = res.ticket; S.step = 'done'; screenDone(res.ticket, res.duplicate); window.scrollTo(0, 0);
    } catch (e) {
      S.busy = false;
      if (e.code === 'NOT_OPEN') { msgScreen('안내', '설문이 마감되었습니다', '응답을 받을 수 없는 상태입니다. 참여해 주셔서 감사합니다.', 'lock'); return; }
      toast(e.message);
      if (btn) { btn.disabled = false; btn.textContent = '제출하기'; }
      return;
    }
    S.busy = false;
  }
  function flash(root, qid) {
    var q = root && root.querySelector('.q[data-q="' + qid + '"]'); if (!q) return;
    q.scrollIntoView({ behavior: 'smooth', block: 'center' }); q.classList.remove('missing'); void q.offsetWidth; q.classList.add('missing');
    setTimeout(function () { q.classList.remove('missing'); }, 1800);
  }

  function ticketImage(code, won) {
    var cv = document.createElement('canvas'); cv.width = 900; cv.height = 520; var c = cv.getContext('2d');
    var cs = getComputedStyle(document.documentElement), pri = cs.getPropertyValue('--primary').trim() || '#0EA5E9', font = cs.getPropertyValue('--font') || 'sans-serif';
    c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, 900, 520);
    c.strokeStyle = pri; c.lineWidth = 6; c.setLineDash([18, 12]); c.strokeRect(30, 30, 840, 460); c.setLineDash([]);
    function draw(img) {
      if (img) { var w = 360, h = Math.round(img.height * w / img.width); c.drawImage(img, 450 - w / 2, 62, w, h); }
      c.textAlign = 'center'; c.fillStyle = '#5F6368'; c.font = '700 28px ' + font; c.fillText(won ? '추첨 당첨 번호' : '설문 추첨번호', 450, 250);
      c.fillStyle = pri; c.font = '700 96px ' + font; c.fillText(code, 450, 360);
      c.fillStyle = '#5F6368'; c.font = '400 24px ' + font; c.fillText((S.def.intro && S.def.intro.title) || S.info.title, 450, 425);
      c.fillText('아세아항공직업전문학교', 450, 458);
      cv.toBlob(function (b) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'ASEA-설문-추첨번호-' + code + '.png'; document.body.appendChild(a); a.click(); a.remove();
        toast('이미지를 저장했습니다. 저장이 안 되면 화면을 캡처해 주십시오.');
      });
    }
    var img = new Image(); img.onload = function () { draw(img); }; img.onerror = function () { draw(null); }; img.src = 'aseasurvey-logo.png';
  }

  /* ───────────── 이벤트 ───────────── */
  $app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t) return;
    var act = t.getAttribute('data-act'); tick();
    var cid = t.getAttribute('data-cid');
    if (act === 'start') { resetAnswers(); S.lastTick = Date.now(); go('class'); }
    else if (act === 'resume') { var d = loadDraft(); S.sel = d.sel || S.sel; S.ans = d.ans; S.open = d.open || ''; S.active = d.active || 0; S.lastTick = Date.now(); go(d.step === 'eval' && myCourses().length ? 'eval' : 'class'); }
    else if (act === 'fresh') { clearDraft(); resetAnswers(); S.lastTick = Date.now(); go(S.step === 'done' ? 'class' : 'class'); }
    else if (act === 'restart') { confirmBox('처음부터 다시 작성하시겠습니까?', '지금까지 입력한 내용이 모두 지워집니다.', '처음부터', '취소').then(function (ok) { if (ok) { clearDraft(); resetAnswers(); S.step = 'intro'; render(); window.scrollTo(0, 0); } }); }
    else if (act === 'sel') {
      var k = t.getAttribute('data-k'), v = t.getAttribute('data-v');
      var had = Object.keys(S.ans.course).some(function (c) { return Object.keys(S.ans.course[c]).length; });
      function apply() {
        S.sel[k] = v; if (k === 'track') { S.sel.grade = ''; S.sel.klass = ''; } if (k === 'grade') S.sel.klass = '';
        var gs = uniq(S.courses.filter(function (c) { return c.track === S.sel.track; }).map(function (c) { return c.grade; }));
        if (k === 'track' && gs.length === 1) S.sel.grade = gs[0];
        var ks = uniq(S.courses.filter(function (c) { return c.track === S.sel.track && c.grade === S.sel.grade; }).map(function (c) { return c.klass; }));
        if (S.sel.grade && ks.length === 1) S.sel.klass = ks[0];
        S.ans.course = {}; screenClass(); saveDraft();
      }
      if (had && S.sel[k] !== v) confirmBox('반을 변경하시겠습니까?', '반을 바꾸면 과목이 달라져 과목별 응답이 초기화됩니다.', '변경', '취소').then(function (ok) { if (ok) apply(); }); else apply();
    }
    else if (act === 'toeval') { S.open = ''; go('eval'); var f = myCourses()[0]; if (f) openCourse(f.id, true); }
    else if (act === 'toggle') { if (S.open === cid) closeCourse(cid); else openCourse(cid); }
    else if (act === 'next') { var l = myCourses(), ix = -1; l.forEach(function (c, i) { if (c.id === cid) ix = i; }); if (l[ix + 1]) openCourse(l[ix + 1].id); }
    else if (act === 'tocommon') { var ce = document.getElementById('c-common'); if (ce) ce.scrollIntoView({ behavior: 'smooth', block: 'start' }); else $app.querySelector('.bar').scrollIntoView(); }
    else if (act === 'copyprev') copyPrev(cid);
    else if (act === 'pick' || act === 'single' || act === 'multi') answerClick(t, act);
    else if (act === 'submit') submit();
    else if (act === 'saveimg') ticketImage(t.getAttribute('data-code'), t.getAttribute('data-won') === '1');
    else if (act === 'copycode') { var cd = t.getAttribute('data-code'); (navigator.clipboard ? navigator.clipboard.writeText(cd) : Promise.reject()).then(function () { toast('번호를 복사했습니다.'); }, function () { toast('복사할 수 없습니다. 번호를 길게 눌러 복사해 주십시오.'); }); }
    else if (act === 'check') checkTicket();
  });
  function answerClick(t, act) {
    var qid = t.getAttribute('data-q'), val = t.getAttribute('data-v');
    var sec = t.closest('.course'), cid = sec ? sec.getAttribute('data-cid') : 'common';
    var a = cid === 'common' ? S.ans.common : courseAns(cid);
    var x = SVY.allQuestions(S.def).filter(function (y) { return y.q.id === qid; })[0]; if (!x) return;
    var needRerender = false;
    if (act === 'pick') { a[qid] = Number(val); }
    else if (act === 'single') { a[qid] = val; }
    else {
      var arr = Array.isArray(a[qid]) ? a[qid].slice() : [];
      var exIds = (x.q.options || []).filter(function (o) { return o.exclusive; }).map(function (o) { return o.id; });
      var idx = arr.indexOf(val);
      if (idx >= 0) arr.splice(idx, 1);
      else { if (exIds.indexOf(val) >= 0) arr = [val]; else { arr = arr.filter(function (v) { return exIds.indexOf(v) < 0; }); arr.push(val); } }
      a[qid] = arr; needRerender = true;
    }
    // 같은 문항의 버튼 상태만 갱신
    var qel = t.closest('.q');
    qel.querySelectorAll('.opt').forEach(function (b) {
      var v = b.getAttribute('data-v'), on = act === 'multi' ? a[qid].indexOf(v) >= 0 : (act === 'pick' ? Number(v) === a[qid] : v === a[qid]);
      b.setAttribute('aria-pressed', on);
    });
    if (needRerender) {
      // showIf 로 표시/숨김이 바뀌는 문항이 있을 때만 해당 구간을 다시 그림
      var dep = SVY.allQuestions(S.def).some(function (y) { return y.q.showIf && y.q.showIf.q === qid; });
      if (dep) {
        SVY.allQuestions(S.def).filter(function (y) { return y.q.showIf && y.q.showIf.q === qid; }).forEach(function (y) { if (!SVY.visible(S.def, y.q, a)) delete a[y.q.id]; });
        if (cid === 'common') rerenderCommon(); else rerenderCourse(cid);
      }
    }
    if (S.step === 'class') { var nb = $app.querySelector('[data-act="toeval"]'); if (nb) nb.disabled = !classReady(); } else updateProgress();
    saveDraft();
  }
  $app.addEventListener('input', function (e) {
    var t = e.target; if (t.getAttribute('data-act') === 'text') {
      tick(); var qid = t.getAttribute('data-q'), sec = t.closest('.course'), cid = sec ? sec.getAttribute('data-cid') : 'common';
      (cid === 'common' ? S.ans.common : courseAns(cid))[qid] = t.value;
      var c = t.parentNode.querySelector('[data-cnt]'); if (c) c.textContent = t.value.length;
      saveDraft();
    } else if (t.id === 'tk') {
      var v = t.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); t.value = v.length > 4 ? v.slice(0, 4) + '-' + v.slice(4) : v; S.checkInput = t.value;
    }
  });
  // 좌우 스와이프로 과목 이동(모바일)
  var sx = 0, sy = 0, sTarget = null;
  $app.addEventListener('touchstart', function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; sTarget = e.target; }, { passive: true });
  $app.addEventListener('touchend', function (e) {
    if (S.step !== 'eval' || !S.open || !sTarget || sTarget.closest('textarea,input,.nav-row .btn')) return;
    if (!sTarget.closest('.course.open')) return;
    var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    var l = myCourses(), ix = -1; l.forEach(function (c, i) { if (c.id === S.open) ix = i; });
    var n = dx < 0 ? ix + 1 : ix - 1; if (l[n]) openCourse(l[n].id);
  }, { passive: true });
  $app.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'tk') checkTicket(); });

  async function checkTicket() {
    var v = (S.checkInput || '').trim(); if (v.replace('-', '').length !== 8) { toast('추첨번호 8자리를 입력해 주십시오.'); return; }
    try { S.result = await SVY.rpc('svy_draw_check', { p_code: S.code, p_ticket: v }); } catch (e) { toast(e.message); return; }
    if (S.result.state === 'unavailable') { toast('아직 결과를 확인할 수 없습니다.'); S.result = null; return; }
    screenResult();
  }

  /* ───────────── 시작 ───────────── */
  async function init() {
    S.code = (new URLSearchParams(location.search).get('c') || '').trim().toLowerCase();
    if (!S.code) { S.def = {}; S.info = { title: '' }; msgScreen('안내', '설문 링크가 올바르지 않습니다', '안내받은 링크를 다시 확인해 주십시오.', 'alert'); return; }
    var info;
    try { info = await SVY.rpc('svy_public', { p_code: S.code }); }
    catch (e) { S.def = {}; S.info = { title: '' }; msgScreen('안내', e.code === 'NOT_FOUND' ? '설문을 찾을 수 없습니다' : '설문을 불러오지 못했습니다', E(e.message), 'alert'); return; }
    S.info = info; S.def = info.def || {}; S.courses = info.courses || []; S.test = !!info.test;
    SVY.applyTheme(info.theme);
    document.title = (info.title || '교내 설문') + ' | 아세아항공직업전문학교';
    var dn = doneRec();
    if (info.phase === 'draft') { msgScreen('준비 중', info.title, '아직 시작되지 않은 설문입니다. 안내된 일정에 다시 접속해 주십시오.', 'info'); return; }
    if (info.phase === 'closed') { if (dn) { S.step = 'done'; screenDone(dn.ticket, true); } else msgScreen('마감', '설문이 마감되었습니다', '참여해 주셔서 감사합니다.', 'lock'); return; }
    if (info.phase === 'result') { S.step = 'result'; if (dn) S.checkInput = dn.ticket; screenResult(); if (dn) checkTicket(); return; }
    if (dn) { S.step = 'done'; screenDone(dn.ticket, true); return; }
    S.step = 'intro'; render();
  }
  init();
})();
