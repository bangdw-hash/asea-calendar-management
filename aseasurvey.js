'use strict';
/**
 * aseasurvey.js — 교내 설문 응답 화면 (학생·교직원·행사 참석자 공용)
 *  설문 유형(def.mode)
 *   · course  : 안내 → 반 선택 + 기본정보 → 과목별 평가(아코디언 슬라이드) → 제출 → 추첨번호
 *   · general : 안내 → 영역(섹션)별 단계 이동(이전/다음, 조건 분기) → 제출 → 완료(추첨번호·퀴즈 점수는 설정에 따름)
 *  문항 그리기·입력 검사는 aseasurvey-form.js(SVY.Form)가 맡습니다.
 *  · 최종 제출 전까지는 기기에 임시 저장(이어서 작성 / 처음부터 다시)
 *  · 같은 기기 중복 제출 방지: localStorage + 쿠키 + 서버 기기 토큰 (테스트 모드에서는 해제)
 */
(function () {
  var $app = document.getElementById('app');
  var E = SVY.esc, I = SVY.ico, F = SVY.Form;

  var S = {
    code: '', info: null, def: null, courses: [], test: false, mode: 'course', counts: {}, qmap: {}, deps: {}, seed: 1, token: '',
    step: 'load', sel: { track: '', grade: '', klass: '' }, ans: { common: {}, course: {} },
    open: '', pageId: '', pageIdx: 0, editing: false, active: 0, times: {}, lastTick: 0, busy: false, ticket: '', rendered: {}, result: null, checkInput: '', vsig: {}
  };
  function K(s) { return 'svy_' + S.code + '_' + s; }
  function feat(k) { return ((S.def && S.def.features) || {})[k]; }
  function isGen() { return S.mode === 'general'; }
  function showTicket() { var f = feat('ticket'); return f != null ? !!f : !isGen(); }

  /* ───────────── 공통 UI ───────────── */
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2800);
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
    return '<header class="hdr"><div class="hdr-in"><img class="logo" src="aseasurvey-logo.png" alt="아세아항공직업전문학교">' +
      '<span class="hdr-sp"></span>' +
      (S.editing ? '<button class="hdr-btn" data-act="editcancel">수정 취소</button>' : S.step === 'eval' || S.step === 'class' || S.step === 'page' ? '<button class="hdr-btn" data-act="restart">처음부터</button>' : '') +
      '</div></header>' + (S.test ? '<div class="testbar">테스트 모드입니다. 이 응답은 정식 집계에 포함되지 않으며 시작 전에 초기화됩니다.</div>' : '');
  }
  function shell(inner, extra) { $app.innerHTML = header() + '<main class="wrap">' + inner + '</main>' + (extra || ''); if ($app._initSigs) $app._initSigs(); }
  function msgScreen(kicker, title, body, icon) {
    shell('<div class="card center"><div class="okmark" style="background:var(--primary-lt);color:var(--primary-dk)">' + I(icon || 'info', 28) + '</div>' +
      '<div class="kicker">' + E(kicker) + '</div><h1 class="title">' + E(title) + '</h1><p class="muted" style="margin:10px 0 0">' + body + '</p></div>');
  }

  /* ───────────── 저장/복원 ───────────── */
  var saveT = 0;
  // 체류 시간: 조작 사이의 간격만 합산(1회 최대 60초). 열려 있는 과목에는 과목별 시간도 함께 기록
  function tick() {
    var n = Date.now();
    if (S.lastTick) { var d = Math.min(n - S.lastTick, 60000); S.active += d; if (S.step === 'eval' && S.open) S.times[S.open] = (S.times[S.open] || 0) + d; }
    S.lastTick = n;
  }
  // 첨부 미리보기(blob URL)는 새로고침 후 무효이므로 저장하지 않음
  function slim(ans) { return JSON.parse(JSON.stringify(ans, function (k, v) { return k === 'preview' ? undefined : v; })); }
  function saveDraft() {
    clearTimeout(saveT); if (S.editing) return;
    saveT = setTimeout(function () {
      SVY.ls.setJSON(K('draft'), { sel: S.sel, ans: slim(S.ans), open: S.open, pageId: S.pageId, active: S.active, times: S.times, step: S.step, v: S.info && S.info.version, at: Date.now() });
    }, 250);
  }
  function loadDraft() { var d = SVY.ls.getJSON(K('draft')); return d && d.ans && (!d.v || !S.info || d.v === S.info.version) ? d : null; }
  function clearDraft() { SVY.ls.del(K('draft')); }
  function doneRec() {
    if (S.test) return null;
    var d = SVY.ls.getJSON(K('done')); if (d && d.ticket) return d;
    var c = SVY.cookieGet('svyd_' + S.code); return c ? { ticket: c } : null;
  }
  // 기기 토큰: 정식은 기기에 고정(중복 제출 방지), 테스트는 응답 1회마다 새로 발급(첨부 업로드와 제출이 같은 토큰을 쓰도록 캐시)
  function getToken() {
    if (S.token) return S.token;
    if (S.test) return (S.token = SVY.uid(16));
    var t = SVY.ls.get(K('token')); if (!t) { t = SVY.uid(16); SVY.ls.set(K('token'), t); } return (S.token = t);
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
  function ansOf(scope) { return scope === 'common' ? S.ans.common : courseAns(scope); }
  function ctxOf(scope, extra) { return Object.assign({ def: S.def, a: ansOf(scope), c: S.ans.common, scopeId: scope, counts: S.counts, seed: S.seed, busy: env.busy, nudge: (S.def.intro && S.def.intro.textNudge) || '' }, extra || {}); }
  // 문항이 지금 보이는지(영역 조건 + 문항 조건)
  function shown(x, scope) {
    var a = ansOf(scope), c = S.ans.common;
    return SVY.evalCond(x.section && x.section.showIf, S.def, a, c) && SVY.evalCond(x.q.showIf, S.def, a, c);
  }
  function stateOf(x, scope) { if (!shown(x, scope)) return 'hidden'; return F.state(x.q, ansOf(scope), S.ans.common, S.def); }

  // 한 범위의 필수 문항 현황 (잘못된 입력도 미완료로 계산)
  function stat(scope, list) {
    var total = 0, done = 0, firstMissing = '';
    list.forEach(function (x) {
      var st = stateOf(x, scope);
      if (st === 'hidden' || st === 'skip') return;
      if (st === 'ok' && !SVY.isRequired(x.q)) return;
      total++;
      if (st === 'ok') done++; else if (!firstMissing) firstMissing = x.q.id;
    });
    return { total: total, done: done, firstMissing: firstMissing };
  }
  function courseStat(cid) { return stat(cid, qs('course')); }
  function commonStat() { return stat('common', qs('common')); }
  function overall() {
    var t = 0, d = 0, cs = commonStat(); t += cs.total; d += cs.done;
    myCourses().forEach(function (c) { var s = courseStat(c.id); t += s.total; d += s.done; });
    return { total: t, done: d };
  }
  function firstIncomplete() {
    var cs = stat('common', qs('common', true));
    if (cs.firstMissing) return { cid: 'common', qid: cs.firstMissing };
    var list = myCourses();
    for (var i = 0; i < list.length; i++) { var s = courseStat(list[i].id); if (s.firstMissing) return { cid: list[i].id, qid: s.firstMissing }; }
    var c2 = commonStat(); if (c2.firstMissing) return { cid: 'common', qid: c2.firstMissing };
    return null;
  }
  // 조건 의존 관계: showIf 가 참조하는 문항 ID 모음 (이 문항이 바뀌면 표시 구성이 달라질 수 있음)
  function collectRefs(cond, out) {
    if (!cond || typeof cond !== 'object') return;
    if (cond.all) cond.all.forEach(function (e) { collectRefs(e, out); });
    else if (cond.any) cond.any.forEach(function (e) { collectRefs(e, out); });
    else if (cond.q) out[cond.q] = 1;
  }
  function buildIndex() {
    S.qmap = SVY.questionMap(S.def); S.deps = {};
    (S.def.sections || []).forEach(function (s) { collectRefs(s.showIf, S.deps); });
    SVY.allQuestions(S.def).forEach(function (x) { collectRefs(x.q.showIf, S.deps); });
  }
  function visSig(scope) {
    var list = scope === 'common' ? qs('common') : qs('course');
    return list.filter(function (x) { return shown(x, scope); }).map(function (x) { return x.q.id; }).join(',');
  }
  function prune(scope) {
    var a = ansOf(scope);
    (scope === 'common' ? qs('common') : qs('course')).forEach(function (x) {
      if (!shown(x, scope)) { delete a[x.q.id]; delete a[x.q.id + '_other']; }
    });
  }

  /* ───────────── 입력 환경(Form 연결) ───────────── */
  var env = {
    busy: {}, toast: toast,
    getAns: ansOf, getCommon: function () { return S.ans.common; },
    get def() { return S.def; }, get qmap() { return S.qmap; }, get counts() { return S.counts; }, get seed() { return S.seed; },
    onChange: function (scope, qid) {
      tick();
      if (S.deps[qid]) {
        var sig = visSig(scope);
        if (sig !== S.vsig[scope]) { S.vsig[scope] = sig; prune(scope); rerenderScope(scope); }
      }
      chrome(); saveDraft();
    },
    upload: function (q, blob, name) {
      return SVY.readB64(blob).then(function (b64) {
        return SVY.rpc('svy_upload', { p_code: S.code, p_token: getToken(), p_qid: q.id, p_name: name, p_mime: blob.type || 'application/octet-stream', p_data: b64 });
      }).then(function (r) { return { id: r.id, name: name, mime: blob.type, size: r.size }; });
    },
    removeFile: function (meta) { if (meta && meta.id && !/^preview/.test(meta.id)) SVY.rpc('svy_file_delete', { p_code: S.code, p_token: getToken(), p_id: meta.id }).catch(function () {}); }
  };

  /* ───────────── 문항 묶음 렌더링 ───────────── */
  function renderItems(items, scope, badge) {
    return items.map(function (x) {
      if (!shown(x, scope)) return '';
      return F.html(x.q, ctxOf(scope, { badge: badge ? x.q.id : null }));
    }).join('');
  }
  function groupBySection(list) {
    var gs = {}, ord = [];
    list.forEach(function (x) { var sid = x.section ? x.section.id : '_'; if (!gs[sid]) { gs[sid] = { s: x.section, items: [] }; ord.push(sid); } gs[sid].items.push(x); });
    return ord.map(function (k) { return gs[k]; });
  }
  function secVisible(s, scope) { return SVY.evalCond(s && s.showIf, S.def, ansOf(scope), S.ans.common); }

  function renderCourseInner(c, idx, total) {
    var h = '<div class="swipe-hint">' + I('left', 14) + ' 좌우로 밀어 다른 과목으로 이동 ' + I('right', 14) + '</div>';
    groupBySection(qs('course', false)).forEach(function (g) {
      if (!secVisible(g.s, c.id)) return;
      h += '<h4 class="sec">' + E(g.s.title) + '</h4>' + (g.s.note ? '<div class="sec-note">' + E(g.s.note) + '</div>' : '');
      h += '<div data-sec="' + E(g.s.id) + '">' + renderItems(g.items, c.id, true) + '</div>';
    });
    h += '<div class="nav-row">' + (idx > 0 ? '<button class="btn btn-ghost" data-act="copyprev" data-cid="' + c.id + '">' + I('copy', 16) + ' 이전 과목 척도 응답 복사</button>' : '') +
      (idx < total - 1 ? '<button class="btn btn-secondary" data-act="next" data-cid="' + c.id + '">다음 과목 ' + I('right', 16) + '</button>'
        : '<button class="btn btn-secondary" data-act="tocommon">마지막 문항으로 ' + I('down', 16) + '</button>') + '</div>';
    return h;
  }
  // 담당자 정보가 등록되어 있으면 학생 화면에 과목과 함께 표시합니다. (라벨에 「교수」가 있으면 「교수」를 붙임)
  function hideProf() { return !!(S.def && S.def.link && S.def.link.hideProf); }
  function profText(c) { if (!c.prof || hideProf()) return ''; var lb = ((S.def && S.def.link && S.def.link.cols || {}).prof || {}).label || '담당교수'; return c.prof + (/교수/.test(lb) ? ' 교수' : ''); }
  function courseHead(c, idx) {
    var s = courseStat(c.id), done = s.total > 0 && s.done === s.total;
    return '<button type="button" class="course-head" data-act="toggle" data-cid="' + c.id + '" aria-expanded="' + (S.open === c.id) + '">' +
      '<span class="c-num">' + (done ? I('check', 16) : (idx + 1)) + '</span>' +
      '<span class="c-name">' + E(c.name) + (c.kind ? '<small>' + E(c.kind) + '</small>' : '') + (profText(c) ? '<small class="cprof">' + E(profText(c)) + '</small>' : '') + '</span>' +
      '<span class="c-prog" data-prog>' + (done ? '완료' : s.done + '/' + s.total) + '</span>' + I('chevron', 18).replace('class="ico"', 'class="ico c-chev"') + '</button>';
  }
  function commonHtml() {
    var cq = qs('common', false);
    return '<div class="kicker">공통 문항</div>' + groupBySection(cq).map(function (g) {
      if (!secVisible(g.s, 'common')) return '';
      return (g.s ? '<div class="chip-title">' + E(g.s.title) + '</div>' : '') + '<div data-sec="common">' + renderItems(g.items, 'common', true) + '</div>';
    }).join('');
  }

  /* ───────────── 화면: 안내 ───────────── */
  function screenIntro() {
    var i = S.def.intro || {}, draft = loadDraft();
    var h = '<div class="card"><div class="kicker">' + E(i.subtitle || '') + '</div><h1 class="title">' + E(i.title || S.info.title) + '</h1><div class="org">' + E(i.org || '') + '</div>';
    if (i.rewardText) h += '<div class="reward">' + I('gift', 22) + '<div><b>참여 안내</b><br>' + E(i.rewardText) + (i.drawGuide ? '<div class="hint" style="margin-top:8px;color:var(--text)">' + E(i.drawGuide) + '</div>' : '') + '</div></div>';
    if ((i.notice || []).length) h += '<dl class="notice">' + i.notice.map(function (n) { return '<div><dt>' + E(n.k) + '</dt><dd>' + E(n.v) + '</dd></div>'; }).join('') + '</dl>';
    if (i.timeNote) h += '<div class="timenote">' + I('info', 16) + E(i.timeNote) + '</div>';
    if (S.def.limit && SVY.num(S.def.limit.max) != null && S.counts.total != null) h += '<div class="timenote">' + I('users', 16) + '선착순 ' + S.def.limit.max + '명 · 현재 ' + S.counts.total + '명 참여</div>';
    if (draft) {
      h += '<div class="msg warn">' + I('alert', 18) + '<div>작성 중이던 내용이 있습니다. 이어서 작성하시겠습니까?</div></div>' +
        '<div class="btn-row"><button class="btn btn-ghost" data-act="fresh">처음부터 다시</button><button class="btn btn-primary" data-act="resume">이어서 작성</button></div>';
    } else {
      h += '<div class="btn-row"><button class="btn btn-primary" data-act="start">' + E(i.startLabel || '설문 시작하기') + ' ' + I('right', 16) + '</button></div>';
    }
    shell(h + '</div>');
  }

  /* ───────────── 화면: 반 선택 (과목 평가형) ───────────── */
  function classReady() {
    return S.sel.klass && myCourses().length && stat('common', qs('common', true)).firstMissing === '';
  }
  function screenClass() {
    var tracks = uniq(S.courses.map(function (c) { return c.track; }));
    var grades = uniq(S.courses.filter(function (c) { return c.track === S.sel.track; }).map(function (c) { return c.grade; }));
    var klasses = uniq(S.courses.filter(function (c) { return c.track === S.sel.track && c.grade === S.sel.grade; }).map(function (c) { return c.klass; }));
    function chips(arr, key, cls) {
      return '<div class="opts ' + (cls || 'wide') + '">' + arr.map(function (v) { return '<button type="button" class="opt" data-act="sel" data-k="' + key + '" data-v="' + E(v) + '" aria-pressed="' + (S.sel[key] === v) + '">' + E(v) + '</button>'; }).join('') + '</div>';
    }
    var LK = SVY.linkInfo(S.def || {}), unit = LK.unit, cl = LK.cols;
    function only(arr) { return arr.length === 1 && arr[0] === '-'; }   // 사용하지 않는 단계(값이 「-」뿐)는 건너뜁니다
    if (!S.sel.track && only(tracks)) S.sel.track = '-';
    if (S.sel.track === '-' && !S.sel.grade && only(uniq(S.courses.filter(function (c) { return c.track === '-'; }).map(function (c) { return c.grade; })))) S.sel.grade = '-';
    if (S.sel.grade === '-' && !S.sel.klass && only(uniq(S.courses.filter(function (c) { return c.track === S.sel.track && c.grade === '-'; }).map(function (c) { return c.klass; })))) S.sel.klass = '-';
    var h = '<div class="card"><div class="kicker">1단계</div><h2 class="title" style="font-size:calc(19px*var(--fs))">' + E(LK.stepTitle) + '</h2><p class="muted" style="margin:4px 0 12px">' + (LK.custom && unit !== '과목' ? '선택한 항목에 해당하는 ' + E(unit) + ' 목록이 표시됩니다.' : '선택한 반의 수강 과목이 표시됩니다.') + '</p>';
    if (!only(tracks)) h += '<div class="chip-title">' + E(cl.track.label) + '</div>' + chips(tracks, 'track');
    if (S.sel.track && !only(grades)) h += '<div class="chip-title">' + E(cl.grade.label) + '</div>' + chips(grades, 'grade');
    if (S.sel.grade && !only(klasses)) h += '<div class="chip-title">' + E(cl.klass.label) + '</div>' + chips(klasses, 'klass');
    var mc = S.sel.klass ? myCourses() : [];
    if (mc.length) h += '<div class="msg ok">' + I('check', 18) + '<div><b>' + (LK.custom ? E(unit) + ' ' : '수강 과목 ') + mc.length + '개</b><br>' + mc.map(function (c) { return E(c.name) + (profText(c) ? ' <span class="muted">(' + E(profText(c)) + ')</span>' : ''); }).join(' · ') + '</div></div>';
    h += '</div>';
    var basic = qs('common', true);
    if (basic.length && mc.length) h += '<div class="card"><div class="kicker">2단계</div><h2 class="title" style="font-size:calc(19px*var(--fs))">기본 정보</h2><div data-sec="common">' + renderItems(basic, 'common', false) + '</div></div>';
    h += '<div class="btn-row"><button class="btn btn-primary" data-act="toeval" ' + (classReady() ? '' : 'disabled') + '>' + E(unit) + '별 설문 시작 ' + I('right', 16) + '</button></div>';
    shell(h);
  }

  /* ───────────── 화면: 평가(아코디언) ───────────── */
  /* ───────────── 화면: 평가 — B형(질문 중심 표) ───────────── */
  function isMatrix() { return !isGen() && !!S.def && S.def.view === 'matrix'; }
  function rowOf(c) { var lb = ((S.def && S.def.link && S.def.link.cols || {}).prof || {}).label || '담당교수'; return { id: c.id, name: c.name, kind: c.kind || '', prof: hideProf() ? '' : (c.prof || ''), suffix: /교수/.test(lb) ? '교수' : '' }; }
  function matrixBody() {
    var list = myCourses(), h = '';
    groupBySection(qs('course', false)).forEach(function (g) {
      var tag = F.secTag(g.s && g.s.title), no = 0;
      var inner = g.items.map(function (x) {
        var rows = list.filter(function (c) { return secVisible(g.s, c.id) && shown(x, c.id); }).map(rowOf);
        if (!rows.length) return '';
        if (x.q.type !== 'block') no++; return F.matrixHtml(x.q, rows, function (r) { return ctxOf(r.id, { badge: null }); }, { no: x.q.type === 'block' ? '' : (tag ? tag + '-' : '') + no + '.' });
      }).join('');
      if (!inner) return;
      h += '<section class="card mxsec">' + (g.s ? '<h2 class="title" style="font-size:calc(18px*var(--fs))">' + E(g.s.title) + '</h2>' + (g.s.note ? '<div class="sec-note">' + E(g.s.note) + '</div>' : '') : '') + inner + '</section>';
    });
    return h;
  }
  function rerenderMatrix() {
    var el = document.getElementById('mxroot'); if (!el) return; var y = window.scrollY; el.innerHTML = matrixBody(); window.scrollTo(0, y);
    myCourses().forEach(function (c) { S.vsig[c.id] = visSig(c.id); }); F.mxFit($app); updateProgress();
  }
  function screenMatrix() {
    var list = myCourses(), cq = qs('common', false);
    var h = '<div class="stepper"><div class="stepper-row"><span><b data-ov-done>0</b> / <span data-ov-total>0</span> 문항 응답</span><span class="muted">' + [S.sel.track, S.sel.grade, S.sel.klass].filter(function (v) { return v && v !== '-'; }).map(E).join(' ') + '</span></div><div class="meter"><i data-ov-bar></i></div></div>';
    h += '<p class="hint" style="margin:0 0 4px">질문마다 수강 중인 <b>모든 과목</b>에 응답해 주십시오. 모든 필수 문항에 응답해야 제출할 수 있습니다.</p><div id="mxroot">' + matrixBody() + '</div>';
    if (cq.length) h += '<section class="card" id="c-common" style="margin-top:14px">' + commonHtml() + '</section>';
    var bar = '<div class="bar"><div class="bar-in"><div class="bar-info" data-bar-info></div><button class="btn btn-primary" data-act="submit">' + (S.editing ? '수정 저장' : '제출하기') + '</button></div></div>';
    shell(h, bar);
    S.rendered = {}; S.vsig.common = visSig('common'); list.forEach(function (c) { S.vsig[c.id] = visSig(c.id); });
    if ($app._initSigs) $app._initSigs();
    F.mxFit($app); updateProgress();
  }
  function screenEval() {
    if (isMatrix()) return screenMatrix();
    var list = myCourses(), cq = qs('common', false);
    var h = '<div class="stepper"><div class="stepper-row"><span><b data-ov-done>0</b> / <span data-ov-total>0</span> 문항 응답</span><span class="muted">' + [S.sel.track, S.sel.grade, S.sel.klass].filter(function (v) { return v && v !== '-'; }).map(E).join(' ') + '</span></div><div class="meter"><i data-ov-bar></i></div></div>';
    h += '<p class="hint" style="margin:0 0 4px">' + (SVY.linkInfo(S.def || {}).custom ? '항목' : '과목') + '을 눌러 문항을 펼친 뒤 응답해 주십시오. 모든 필수 문항에 응답해야 제출할 수 있습니다.</p>';
    list.forEach(function (c, i) {
      h += '<section class="course" id="c-' + c.id + '" data-cid="' + c.id + '">' + courseHead(c, i) + '<div class="course-body"><div class="course-inner" data-inner></div></div></section>';
    });
    if (cq.length) h += '<section class="card" id="c-common" style="margin-top:14px">' + commonHtml() + '</section>';
    var bar = '<div class="bar"><div class="bar-in"><div class="bar-info" data-bar-info></div><button class="btn btn-primary" data-act="submit">' + (S.editing ? '수정 저장' : '제출하기') + '</button></div></div>';
    shell(h, bar);
    S.rendered = {};
    S.vsig.common = visSig('common'); list.forEach(function (c) { S.vsig[c.id] = visSig(c.id); });
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
    if (!S.rendered[cid]) { inner.innerHTML = renderCourseInner(list[idx], idx, list.length); S.rendered[cid] = 1; if ($app._initSigs) $app._initSigs(); }
    if (!silent) setTimeout(function () { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
    saveDraft();
  }
  function closeCourse(cid) {
    S.open = '';
    var sec = document.getElementById('c-' + cid); if (sec) { sec.classList.remove('open'); sec.querySelector('.course-head').setAttribute('aria-expanded', 'false'); }
    saveDraft();
  }

  /* ───────────── 화면: 단계형 (일반 설문) ───────────── */
  // 현재 응답 기준으로 보이는 단계 목록. layout:'single' 이면 모든 영역을 한 화면에 표시
  function pages() {
    var secs = [];
    var basic = (S.def.basic || []).map(function (q) { return { q: q, scope: 'common', basic: true, section: null }; });
    if (basic.some(function (x) { return shown(x, 'common'); })) secs.push({ id: '_basic', title: '기본 정보', note: '', items: basic });
    (S.def.sections || []).forEach(function (s) {
      if (!secVisible(s, 'common')) return;
      var items = (s.questions || []).map(function (q) { return { q: q, scope: 'common', basic: false, section: s }; });
      if (!items.some(function (x) { return shown(x, 'common'); })) return;
      secs.push({ id: s.id, title: s.title, note: s.note, items: items });
    });
    if ((S.def.layout === 'single') && secs.length) return [{ id: '_all', secs: secs }];
    return secs.map(function (s) { return { id: s.id, secs: [s] }; });
  }
  function curPage(list) {
    var i = -1; list.forEach(function (p, k) { if (p.id === S.pageId) i = k; });
    if (i < 0) i = Math.min(S.pageIdx, list.length - 1);
    return Math.max(i, 0);
  }
  function pageHtml(p) {
    return p.secs.map(function (s) {
      return '<div class="card pg-sec">' + (s.title ? '<h2 class="title" style="font-size:calc(19px*var(--fs))">' + E(s.title) + '</h2>' : '') + (s.note ? '<p class="muted" style="margin:4px 0 6px;white-space:pre-line">' + E(s.note) + '</p>' : '') +
        '<div data-sec="' + E(s.id) + '">' + renderItems(s.items, 'common', false) + '</div></div>';
    }).join('');
  }
  function pageBar(list, i) {
    var last = i >= list.length - 1;
    return '<div class="bar"><div class="bar-in">' + (i > 0 ? '<button class="btn btn-ghost" data-act="prev">' + I('left', 16) + ' 이전</button>' : '<span class="bar-info"></span>') +
      '<div class="bar-info" data-bar-info style="text-align:center"></div>' +
      (last ? '<button class="btn btn-primary" data-act="submit">' + (S.editing ? '수정 저장' : '제출하기') + '</button>' : '<button class="btn btn-primary" data-act="nextpage">다음 ' + I('right', 16) + '</button>') + '</div></div>';
  }
  function screenPage() {
    var list = pages();
    if (!list.length) { shell('<div class="card center"><p class="muted">표시할 문항이 없습니다.</p></div><div class="bar"><div class="bar-in"><button class="btn btn-primary" data-act="submit">' + (S.editing ? '수정 저장' : '제출하기') + '</button></div></div>'); return; }
    var i = curPage(list), p = list[i]; S.pageId = p.id; S.pageIdx = i;
    var h = '<div class="stepper"><div class="stepper-row"><span>' + (list.length > 1 ? '<b>' + (i + 1) + '</b> / ' + list.length + ' 단계' : '설문 응답') + '</span><span class="muted" data-pg-left></span></div><div class="meter"><i style="width:' + Math.round((i + 1) * 100 / list.length) + '%"></i></div></div>' +
      '<div id="pgbody">' + pageHtml(p) + '</div>';
    shell(h, pageBar(list, i));
    S.vsig.common = visSig('common');
    chrome();
  }
  function rerenderPage() {
    var body = document.getElementById('pgbody'); if (!body) return screenPage();
    var list = pages(); if (!list.length) return screenPage();
    var i = curPage(list), p = list[i]; S.pageId = p.id; S.pageIdx = i;
    var y = window.scrollY; body.innerHTML = pageHtml(p); window.scrollTo(0, y); if ($app._initSigs) $app._initSigs();
    var bar = $app.querySelector('.bar'); if (bar) bar.outerHTML = pageBar(list, i);
    var m = $app.querySelector('.stepper'); if (m) { m.querySelector('.stepper-row span').innerHTML = list.length > 1 ? '<b>' + (i + 1) + '</b> / ' + list.length + ' 단계' : '설문 응답'; m.querySelector('.meter i').style.width = Math.round((i + 1) * 100 / list.length) + '%'; }
  }
  function pageIssues(p) {
    var bad = [];
    p.secs.forEach(function (s) { s.items.forEach(function (x) { var st = stateOf(x, 'common'); if (st === 'empty' || st === 'invalid') bad.push(x.q.id); }); });
    return bad;
  }
  function showBad(root, ids) {
    ids.forEach(function (id) {
      var el = root.querySelector('.q[data-q="' + id + '"]'); if (!el) return;
      var a = S.ans.common, v = a[id], q = S.qmap[id], msg = SVY.isEmpty(q, v) ? '필수 문항입니다. 응답해 주십시오.' : SVY.checkQ(q, v, a, S.ans.common, S.def);
      var e = el.querySelector('.q-err'); if (e) e.textContent = msg; el.classList.add('bad');
    });
    flash(root, ids[0]);
  }
  function goPage(delta) {
    var list = pages(), i = curPage(list);
    if (delta > 0) {
      if (hasUploading()) { toast('파일을 올리는 중입니다. 잠시만 기다려 주십시오.'); return; }
      var bad = pageIssues(list[i]); if (bad.length) { showBad($app, bad); toast('응답하지 않았거나 형식이 맞지 않는 문항이 있습니다.'); return; }
    }
    var n = Math.max(0, Math.min(list.length - 1, i + delta)); S.pageId = list[n].id; S.pageIdx = n;
    screenPage(); window.scrollTo(0, 0); saveDraft();
  }

  /* 화면 갱신: 입력이 바뀔 때마다 진행 상태 갱신 */
  function chrome() {
    if (S.step === 'eval') updateProgress();
    else if (S.step === 'class') { var nb = $app.querySelector('[data-act="toeval"]'); if (nb) nb.disabled = !classReady(); }
    else if (S.step === 'page') {
      var list = pages(); if (!list.length) return;
      var i = curPage(list), left = 0; list[i].secs.forEach(function (s) { s.items.forEach(function (x) { var st = stateOf(x, 'common'); if (st === 'empty' || st === 'invalid') left++; }); });
      var bi = $app.querySelector('[data-bar-info]'); if (bi) bi.innerHTML = left ? '<span class="muted">남은 필수 문항 <b>' + left + '</b>개</span>' : '<span style="color:var(--green)"><b>이 단계 완료</b></span>';
      var wasLast = !!$app.querySelector('.bar [data-act="submit"]'); if (wasLast !== (i >= list.length - 1) || !!$app.querySelector('.bar [data-act="prev"]') !== (i > 0)) rerenderPage();
    }
  }
  function rerenderScope(scope) {
    if (S.step === 'eval' && isMatrix() && scope !== 'common') return rerenderMatrix();
    if (S.step === 'page') return rerenderPage();
    if (S.step === 'class') return screenClass();
    if (scope === 'common') { var el = document.getElementById('c-common'); if (el) { el.innerHTML = commonHtml(); if ($app._initSigs) $app._initSigs(); } return; }
    var list = myCourses(), idx = -1; list.forEach(function (c, i) { if (c.id === scope) idx = i; });
    var sec = document.getElementById('c-' + scope); if (!sec || idx < 0) return;
    sec.querySelector('[data-inner]').innerHTML = renderCourseInner(list[idx], idx, list.length); if ($app._initSigs) $app._initSigs();
  }
  function hasUploading() { return Object.keys(env.busy).some(function (k) { return env.busy[k]; }); }

  /* ───────────── 화면: 완료 / 결과 ───────────── */
  function ticketCard(code, cls, label) {
    return '<div class="ticket ' + (cls || '') + '"><small>' + E(label || '내 추첨번호') + '</small><div class="ticket-code">' + E(code) + '</div></div>';
  }
  function scoreCard(res) {
    var qz = res && res.quiz; if (!res || res.max_score == null || !(Number(res.max_score) > 0) || !qz || qz.show === 'none' || qz.show === false) return '';
    var sc = Number(res.score || 0), mx = Number(res.max_score), pct = Math.round(sc * 100 / mx);
    return '<div class="scorecard"><small>퀴즈 점수</small><div class="score-num"><b>' + (Math.round(sc * 100) / 100) + '</b> / ' + (Math.round(mx * 100) / 100) + '점</div><div class="meter"><i style="width:' + pct + '%"></i></div>' + (qz.passScore != null ? '<div class="hint" style="margin-top:6px">' + (sc >= Number(qz.passScore) ? '통과' : '기준 미달') + ' (기준 ' + E(qz.passScore) + '점)</div>' : '') + '</div>';
  }
  // 제출 후 안내(관리자 선택): 링크 버튼 · 참여 확인서(이미지)
  function afterHtml(code) {
    var a = feat('after') || {}, h = '';
    if ((a.type === 'link' || a.type === 'both') && /^https?:\/\//i.test(a.url || '')) h += '<a class="btn btn-secondary" href="' + E(a.url) + '" target="_blank" rel="noopener">' + I('link', 16) + ' ' + E(a.label || '안내 보기') + '</a>';
    if ((a.type === 'receipt' || a.type === 'both') && code) h += '<button class="btn btn-secondary" data-act="receipt" data-code="' + E(code) + '">' + I('download', 16) + ' 참여 확인서 저장</button>';
    return h ? '<div class="btn-row" style="justify-content:center">' + h + '</div>' : '';
  }
  function screenDone(code, dup, res, edited) {
    var i = S.def.intro || {}, tk = showTicket() && code;
    var h = '<div class="card center"><div class="okmark">' + I('check', 32) + '</div><h1 class="title">' + (edited ? '수정이 완료되었습니다' : dup ? '이미 제출하셨습니다' : '제출이 완료되었습니다') + '</h1>' +
      '<p class="muted" style="margin:8px 0 0">' + E(i.doneNote || '설문에 응해 주셔서 감사합니다.') + '</p>' + scoreCard(res) + afterHtml(code) + (tk ? ticketCard(code) +
      '<div class="msg warn" style="text-align:left">' + I('alert', 18) + '<div><b>이 번호는 나중에 다시 찾을 수 없습니다.</b><br>지금 <b>화면을 캡처</b>하거나 <b>「나에게 보내기」</b>로 카카오톡·문자에 꼭 보관해 주십시오. 추첨 결과 확인에 필요합니다.</div></div>' +
      '<div class="btn-row" style="justify-content:center"><button class="btn btn-primary" data-act="share" data-code="' + E(code) + '">' + I('upload', 16) + ' 나에게 보내기</button>' +
      '<button class="btn btn-secondary" data-act="saveimg" data-code="' + E(code) + '">' + I('download', 16) + ' 이미지로 저장</button>' +
      '<button class="btn btn-ghost" data-act="copycode" data-code="' + E(code) + '">' + I('copy', 16) + ' 번호 복사</button></div>' +
      (i.drawNotice ? '<div class="msg">' + I('info', 18) + '<div style="text-align:left">' + E(i.drawNotice) + '</div></div>' : '') : '') +
      (S.test ? '<div class="msg warn">' + I('alert', 18) + '<div style="text-align:left">테스트 응답입니다. 정식 집계에는 포함되지 않습니다.</div></div><div class="btn-row"><button class="btn btn-ghost" data-act="fresh">테스트 한 번 더 하기</button></div>' : '') +
      '<div id="editbox"></div></div>';
    shell(h); checkEdit();
  }
  // 제출 후 수정(관리자가 허용한 설문만): 서버에서 허용 시간 확인 후 버튼 표시
  async function checkEdit() {
    if (!feat('edit')) return;
    try {
      var r = await SVY.rpc('svy_edit_get', { p_code: S.code, p_token: getToken() }), box = document.getElementById('editbox'); if (!box || !r.can_edit) return;
      var hrs = Number((feat('edit') || {}).hours);
      box.innerHTML = '<div class="msg">' + I('info', 18) + '<div style="text-align:left">' + (hrs > 0 ? '제출 후 ' + hrs + '시간 이내에' : '설문이 마감되기 전까지') + ' 같은 기기에서 응답을 수정할 수 있습니다.</div></div><div class="btn-row" style="justify-content:center"><button class="btn btn-secondary" data-act="editstart">' + I('edit', 16) + ' 응답 수정하기</button></div>';
    } catch (e) { /* 7단계 DB 미설치 등: 수정 버튼을 표시하지 않음 */ }
  }
  async function startEdit() {
    try {
      var r = await SVY.rpc('svy_edit_get', { p_code: S.code, p_token: getToken() });
      if (!r.can_edit) { toast('수정할 수 있는 시간이 지났습니다.'); return; }
      var a = r.answers || {}; S.ans = { common: a.common || {}, course: a.course || {} }; S.sel = { track: r.track, grade: r.grade, klass: r.klass };
      S.editing = true; S.open = ''; S.pageId = ''; S.pageIdx = 0; S.active = 0; S.times = a._t || {}; S.lastTick = Date.now(); S.vsig = {};
      go(isGen() ? 'page' : 'eval'); if (!isGen()) { var f = myCourses()[0]; if (f && !isMatrix()) openCourse(f.id, true); }
    } catch (e) { toast(e.message); }
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
    else if (S.step === 'page') screenPage();
  }
  function resetAnswers() {
    S.sel = { track: '', grade: '', klass: '' }; S.ans = { common: {}, course: {} }; S.open = ''; S.pageId = ''; S.pageIdx = 0; S.active = 0; S.times = {}; S.lastTick = 0; S.vsig = {};
    if (S.test) S.token = ''; Object.keys(env.busy).forEach(function (k) { delete env.busy[k]; });
  }
  // 같은 과목에서 이전 과목의 '척도' 응답만 복사(빈 문항만). 성실응답 점검·윤리 문항은 복사하지 않음
  function copyPrev(cid) {
    var list = myCourses(), idx = -1; list.forEach(function (c, i) { if (c.id === cid) idx = i; });
    if (idx < 1) return;
    var from = courseAns(list[idx - 1].id), to = courseAns(cid), n = 0;
    qs('course', false).forEach(function (x) {
      if (x.q.type !== 'scale' || SVY.isCheck(x.q)) return;
      if (to[x.q.id] == null && from[x.q.id] != null) { to[x.q.id] = from[x.q.id]; n++; }
    });
    rerenderScope(cid); updateProgress(); saveDraft(); toast(n ? n + '개 문항을 복사했습니다. 내용을 확인해 주십시오.' : '복사할 응답이 없습니다.');
  }
  // 제출 직전 정리: 보이지 않는 문항·빈 값 제거, 첨부는 서버가 필요한 정보만 남김
  function cleanValue(q, v) {
    if (typeof v === 'string') return v.trim();
    if (q.type === 'file' || q.type === 'signature') return (v || []).map(function (f) { return { id: f.id, name: f.name, mime: f.mime, size: f.size }; });
    return v;
  }
  function cleanAnswers() {
    var out = { common: {}, course: {} };
    function pick(scope, list, dst) {
      var a = ansOf(scope);
      list.forEach(function (x) {
        if (x.q.type === 'block' || !shown(x, scope)) return;
        var v = a[x.q.id]; if (SVY.isEmpty(x.q, v)) return;
        dst[x.q.id] = cleanValue(x.q, v);
        if (a[x.q.id + '_other'] != null && (v === '__other' || (Array.isArray(v) && v.indexOf('__other') >= 0))) dst[x.q.id + '_other'] = String(a[x.q.id + '_other']).trim();
      });
    }
    pick('common', qs('common'), out.common);
    if (isGen()) { delete out.course; return out; }
    out._t = {};
    myCourses().forEach(function (c) { out.course[c.id] = {}; pick(c.id, qs('course'), out.course[c.id]); out._t[c.id] = Math.round((S.times[c.id] || 0) / 1000); });
    return out;
  }
  async function refreshCounts() { try { var p = await SVY.rpc('svy_public', { p_code: S.code }); S.counts = p.counts || {}; } catch (e) { /* 무시 */ } }
  async function submit() {
    if (S.busy) return;
    if (hasUploading()) { toast('파일을 올리는 중입니다. 잠시만 기다려 주십시오.'); return; }
    if (isGen()) {
      var list = pages(), cur = list[curPage(list)];
      // 모든 단계의 필수 문항을 점검 (처음 문제가 있는 단계로 이동)
      for (var k = 0; k < list.length; k++) {
        var bad = pageIssues(list[k]);
        if (bad.length) { S.pageId = list[k].id; S.pageIdx = k; screenPage(); setTimeout(function () { showBad($app, bad); }, 60); toast('응답하지 않았거나 형식이 맞지 않는 문항이 있습니다.'); return; }
      }
    } else {
      var fi = firstIncomplete();
      if (fi) {
        if (fi.cid === 'common') { var el = document.getElementById('c-common') || $app.querySelector('.card'); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); flash(el, fi.qid); }
        else if (isMatrix()) { var mr = $app.querySelector('.q[data-q="' + fi.qid + '"][data-scope="' + fi.cid + '"]'); if (mr) { mr.scrollIntoView({ behavior: 'smooth', block: 'center' }); mr.classList.remove('missing'); void mr.offsetWidth; mr.classList.add('missing'); setTimeout(function () { mr.classList.remove('missing'); }, 1800); } }
        else { openCourse(fi.cid); setTimeout(function () { flash(document.getElementById('c-' + fi.cid), fi.qid); }, 380); }
        toast('응답하지 않은 문항이 있습니다.'); return;
      }
    }
    var ok = await confirmBox(S.editing ? '수정 내용을 저장할까요?' : '제출하시겠습니까?', S.editing ? '저장하면 이전 응답이 이 내용으로 바뀝니다.' : (feat('edit') ? '제출 후에도 허용된 시간 안에는 같은 기기에서 수정할 수 있습니다.<br>응답 내용을 다시 확인하셨다면 제출해 주십시오.' : '제출 후에는 <b>수정할 수 없습니다.</b><br>응답 내용을 다시 확인하셨다면 제출해 주십시오.'), S.editing ? '저장' : '제출', '돌아가기');
    if (!ok) return;
    S.busy = true; tick();
    var btn = $app.querySelector('[data-act="submit"]'); if (btn) { btn.disabled = true; btn.textContent = S.editing ? '저장 중…' : '제출 중…'; }
    try {
      var payload = { duration: Math.round(S.active / 1000), answers: cleanAnswers() };
      if (!isGen()) { payload.track = S.sel.track; payload.grade = S.sel.grade; payload.klass = S.sel.klass; }
      var wasEdit = S.editing;
      var res = await SVY.rpc(wasEdit ? 'svy_edit_save' : 'svy_submit', { p_code: S.code, p_token: getToken(), p_payload: payload });
      if (wasEdit) { S.editing = false; S.step = 'done'; if (!S.test) SVY.ls.setJSON(K('done'), { ticket: res.ticket, score: res.score, max_score: res.max_score, quiz: res.quiz, at: Date.now() }); screenDone(res.ticket, true, res, true); window.scrollTo(0, 0); S.busy = false; return; }
      if (!S.test) { SVY.ls.setJSON(K('done'), { ticket: res.ticket, score: res.score, max_score: res.max_score, quiz: res.quiz, at: Date.now() }); SVY.cookieSet('svyd_' + S.code, res.ticket); }
      clearDraft(); S.ticket = res.ticket; S.step = 'done'; screenDone(res.ticket, res.duplicate, res); window.scrollTo(0, 0);
    } catch (e) {
      S.busy = false;
      if (e.code === 'NOT_OPEN') { msgScreen('안내', '설문이 마감되었습니다', '응답을 받을 수 없는 상태입니다. 참여해 주셔서 감사합니다.', 'lock'); return; }
      if (e.code === 'FULL') { msgScreen('마감', '정원이 마감되었습니다', '선착순 정원이 모두 찼습니다. 참여해 주셔서 감사합니다.', 'lock'); return; }
      toast(e.message);
      if (e.code && e.code.indexOf('OPTION_FULL:') === 0) { await refreshCounts(); render(); }
      else if (btn) { btn.disabled = false; btn.textContent = S.editing ? '수정 저장' : '제출하기'; }
      return;
    }
    S.busy = false;
  }
  function flash(root, qid) {
    var q = root && root.querySelector('.q[data-q="' + qid + '"]'); if (!q) return;
    q.scrollIntoView({ behavior: 'smooth', block: 'center' }); q.classList.remove('missing'); void q.offsetWidth; q.classList.add('missing');
    setTimeout(function () { q.classList.remove('missing'); }, 1800);
  }

  // 「나에게 보내기」: 모바일 공유 시트(카카오톡·문자 등). 지원하지 않으면 안내 문구와 함께 복사
  function shareCode(code) {
    var link = location.origin + location.pathname + '?c=' + encodeURIComponent(S.code);
    var text = '[' + ((S.def.intro && S.def.intro.title) || '교내 설문') + '] 내 추첨번호: ' + code + '\n추첨 결과 확인: ' + link;
    if (navigator.share) {
      navigator.share({ title: '설문 추첨번호', text: text }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { toast('복사했습니다. 카카오톡 「나와의 채팅」이나 메모에 붙여넣어 보관해 주십시오.'); }, function () { toast('공유할 수 없습니다. 화면을 캡처해 주십시오.'); });
    } else toast('공유할 수 없습니다. 화면을 캡처해 주십시오.');
  }
  function ticketImage(code, won, receipt) {
    var cv = document.createElement('canvas'); cv.width = 900; cv.height = 520; var c = cv.getContext('2d');
    var cs = getComputedStyle(document.documentElement), pri = cs.getPropertyValue('--primary').trim() || '#0EA5E9', font = cs.getPropertyValue('--font') || 'sans-serif';
    c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, 900, 520);
    c.strokeStyle = pri; c.lineWidth = 6; c.setLineDash([18, 12]); c.strokeRect(30, 30, 840, 460); c.setLineDash([]);
    function draw(img) {
      if (img) { var w = 360, h = Math.round(img.height * w / img.width); c.drawImage(img, 450 - w / 2, 62, w, h); }
      c.textAlign = 'center'; c.fillStyle = '#5F6368'; c.font = '700 28px ' + font; c.fillText(receipt ? '설문 참여 확인서' : won ? '추첨 당첨 번호' : '설문 추첨번호', 450, 250);
      c.fillStyle = pri; c.font = '700 96px ' + font; c.fillText(code, 450, 360);
      c.fillStyle = '#5F6368'; c.font = '400 24px ' + font; c.fillText((S.def.intro && S.def.intro.title) || S.info.title, 450, 425);
      c.fillText('아세아항공직업전문학교' + (receipt ? ' · ' + SVY.fmtDate(new Date().toISOString()) : ''), 450, 458);
      cv.toBlob(function (b) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'ASEA-설문-' + (receipt ? '참여확인서-' : '추첨번호-') + code + '.png'; document.body.appendChild(a); a.click(); a.remove();
        toast('이미지를 저장했습니다. 저장이 안 되면 화면을 캡처해 주십시오.');
      });
    }
    var img = new Image(); img.onload = function () { draw(img); }; img.onerror = function () { draw(null); }; img.src = 'aseasurvey-logo.png';
  }

  /* ───────────── 이벤트 ───────────── */
  F.attach($app, env);
  function begin() { resetAnswers(); S.lastTick = Date.now(); go(isGen() ? 'page' : 'class'); }
  $app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t) return;
    var act = t.getAttribute('data-act'); tick();
    var cid = t.getAttribute('data-cid');
    if (act === 'start') begin();
    else if (act === 'editstart') startEdit();
    else if (act === 'editcancel') { S.editing = false; var dn0 = doneRec(); S.step = 'done'; screenDone((dn0 && dn0.ticket) || S.ticket, true, dn0); window.scrollTo(0, 0); }
    else if (act === 'resume') {
      var d = loadDraft(); S.sel = d.sel || S.sel; S.ans = d.ans; if (!S.ans.common) S.ans.common = {}; if (!S.ans.course) S.ans.course = {}; S.open = d.open || ''; S.pageId = d.pageId || ''; S.active = d.active || 0; S.times = d.times || {}; S.lastTick = Date.now();
      go(isGen() ? 'page' : (d.step === 'eval' && myCourses().length ? 'eval' : 'class'));
    }
    else if (act === 'fresh') { clearDraft(); begin(); }
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
    else if (act === 'toeval') { if (hasUploading()) { toast('파일을 올리는 중입니다.'); return; } var bad0 = stat('common', qs('common', true)); if (bad0.firstMissing) { showBad($app, [bad0.firstMissing]); return; } S.open = ''; go('eval'); var f = myCourses()[0]; if (f && !isMatrix()) openCourse(f.id, true); }
    else if (act === 'toggle') { if (S.open === cid) closeCourse(cid); else openCourse(cid); }
    else if (act === 'next') { var l = myCourses(), ix = -1; l.forEach(function (c, i) { if (c.id === cid) ix = i; }); if (l[ix + 1]) openCourse(l[ix + 1].id); }
    else if (act === 'tocommon') { var ce = document.getElementById('c-common'); if (ce) ce.scrollIntoView({ behavior: 'smooth', block: 'start' }); else $app.querySelector('.bar').scrollIntoView(); }
    else if (act === 'copyprev') copyPrev(cid);
    else if (act === 'prev') goPage(-1);
    else if (act === 'nextpage') goPage(1);
    else if (act === 'submit') submit();
    else if (act === 'saveimg') ticketImage(t.getAttribute('data-code'), t.getAttribute('data-won') === '1');
    else if (act === 'receipt') ticketImage(t.getAttribute('data-code'), false, true);
    else if (act === 'share') shareCode(t.getAttribute('data-code'));
    else if (act === 'copycode') { var cd = t.getAttribute('data-code'); (navigator.clipboard ? navigator.clipboard.writeText(cd) : Promise.reject()).then(function () { toast('번호를 복사했습니다.'); }, function () { toast('복사할 수 없습니다. 번호를 길게 눌러 복사해 주십시오.'); }); }
    else if (act === 'check') checkTicket();
  });
  $app.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'tk') {
      var v = t.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); t.value = v.length > 4 ? v.slice(0, 4) + '-' + v.slice(4) : v; S.checkInput = t.value;
    }
  });
  // 좌우 스와이프로 과목 이동(모바일). 입력 위젯 위에서는 동작하지 않음
  var sx = 0, sy = 0, sTarget = null;
  $app.addEventListener('touchstart', function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; sTarget = e.target; }, { passive: true });
  $app.addEventListener('touchend', function (e) {
    if (S.step !== 'eval' || !S.open || !sTarget || sTarget.closest('textarea,input,select,canvas,.slider,.ranked,.nav-row .btn')) return;
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
    S.info = info; S.def = info.def || {}; S.courses = info.courses || []; S.test = !!info.test; S.mode = info.mode || S.def.mode || 'course'; S.counts = info.counts || {};
    SVY.applyTheme(info.theme);
    document.title = (info.title || '교내 설문') + ' | 아세아항공직업전문학교';
    buildIndex();
    var tk = getToken(); S.seed = parseInt(tk.slice(0, 7), 16) || 1;
    var dn = doneRec();
    if (info.phase === 'draft') { msgScreen('준비 중', info.title, '아직 시작되지 않은 설문입니다. 안내된 일정에 다시 접속해 주십시오.', 'info'); return; }
    if (info.phase === 'closed') { if (dn) { S.step = 'done'; screenDone(dn.ticket, true, dn); } else msgScreen('마감', '설문이 마감되었습니다', '참여해 주셔서 감사합니다.', 'lock'); return; }
    if (info.phase === 'result') { S.step = 'result'; if (dn) S.checkInput = dn.ticket; screenResult(); if (dn) checkTicket(); return; }
    if (dn) { S.step = 'done'; screenDone(dn.ticket, true, dn); return; }
    var lim = S.def.limit && SVY.num(S.def.limit.max);
    if (lim != null && S.counts.total != null && S.counts.total >= lim) { msgScreen('마감', '정원이 마감되었습니다', '선착순 정원 ' + lim + '명이 모두 찼습니다. 참여해 주셔서 감사합니다.', 'lock'); return; }
    S.step = 'intro'; render();
  }
  init();
})();
