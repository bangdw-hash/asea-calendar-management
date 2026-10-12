'use strict';
/**
 * aseasurvey-admin-edit.js — 설문 편집 탭: 개요·배포 / 안내문 / 문항 / 과목·교수 / 배포 인원 / 디자인 / 버전
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico;

  /* ───────────── 경로 바인딩 도우미 ───────────── */
  function getPath(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function setPath(o, p, v) { var ks = p.split('.'), last = ks.pop(), c = o; ks.forEach(function (k) { if (c[k] == null || typeof c[k] !== 'object') c[k] = {}; c = c[k]; }); c[last] = v; }
  // [data-path] 입력 요소를 A.work 와 연결. root: 'work' 기준
  function bindPaths(box, onChange) {
    box.querySelectorAll('[data-path]').forEach(function (el) {
      var p = el.getAttribute('data-path'), v = getPath(A.work, p), t = el.type;
      if (t === 'checkbox') el.checked = !!v; else if (el.getAttribute('data-dt')) el.value = A.toLocalInput(v); else el.value = v == null ? '' : v;
    });
    function h(e) {
      var el = e.target.closest('[data-path]'); if (!el) return;
      var p = el.getAttribute('data-path'), v;
      if (el.type === 'checkbox') v = el.checked; else if (el.type === 'number' || el.type === 'range') v = el.value === '' ? null : Number(el.value); else if (el.getAttribute('data-dt')) v = A.fromLocalInput(el.value) || null; else v = el.value;
      setPath(A.work, p, v); A.markDirty(); if (onChange) onChange(p, v, el);
    }
    if (box._bpH) { box.removeEventListener('input', box._bpH); box.removeEventListener('change', box._bpH); }
    box._bpH = h; box.addEventListener('input', h); box.addEventListener('change', h);
  }
  A.bindPaths = bindPaths; A.getPath = getPath; A.setPath = setPath;

  function def() { return A.work.def; }
  function ensureDef() { var d = A.work.def; if (!d.intro) d.intro = {}; if (!d.scales) d.scales = A.clone(window.SVY_TEMPLATE.def.scales); if (!d.basic) d.basic = []; if (!d.sections) d.sections = []; return d; }
  function allQ() { return SVY.allQuestions(ensureDef()); }
  A.countQuestions = function () { return allQ().filter(function (x) { return !x.basic; }).length; };

  /* ───────────── 설문 정의 점검(lint) ───────────── */
  A.lintDef = function (d) {
    var errs = [], warns = [], ids = {}, qs = [];
    (d.basic || []).forEach(function (q) { qs.push({ q: q, sec: '기본정보' }); });
    (d.sections || []).forEach(function (s) { (s.questions || []).forEach(function (q) { qs.push({ q: q, sec: s.title || '(제목 없음)' }); }); });
    if (!qs.length) warns.push('문항이 없습니다.');
    qs.forEach(function (x) {
      var q = x.q, w = '[' + (q.id || '?') + '] ';
      if (!q.id || !/^[A-Za-z0-9_]{1,24}$/.test(q.id)) errs.push(w + '문항 ID는 영문·숫자·밑줄 1~24자여야 합니다.');
      else if (ids[q.id]) errs.push(w + '문항 ID가 중복됩니다.'); else ids[q.id] = 1;
      if (!String(q.label || '').trim()) errs.push(w + '문항 내용이 비어 있습니다.');
      if (['scale', 'single', 'multi', 'text'].indexOf(q.type) < 0) errs.push(w + '문항 유형이 올바르지 않습니다.');
      if ((q.type === 'single' || q.type === 'multi')) {
        var oi = {}; if (!(q.options || []).length) errs.push(w + '선택지가 없습니다.');
        (q.options || []).forEach(function (o) { if (!o.id || oi[o.id]) errs.push(w + '선택지 ID가 비었거나 중복됩니다.'); oi[o.id] = 1; if (!String(o.label || '').trim()) errs.push(w + '비어 있는 선택지가 있습니다.'); });
      }
      if (q.type === 'scale') {
        var sc = (d.scales || {})[q.scale || 'likert5'];
        if (!sc || !sc.length) errs.push(w + '척도 「' + (q.scale || 'likert5') + '」가 정의되어 있지 않습니다.');
        else if (q.check && q.check.valid != null && !sc.some(function (o) { return o.v === q.check.valid; })) errs.push(w + '성실응답 점검 정답이 척도 값에 없습니다.');
      }
      if (q.check && q.type !== 'scale') errs.push(w + '성실응답 점검은 척도 문항에서만 사용할 수 있습니다.');
      if (q.showIf && q.showIf.q) { var src = qs.filter(function (y) { return y.q.id === q.showIf.q; })[0]; if (!src || src.q.type !== 'multi') errs.push(w + '표시 조건 문항은 복수선택 문항이어야 합니다.'); }
      if (q.type === 'text' && q.maxLen && q.maxLen > 2000) errs.push(w + '서술형 최대 글자 수는 2000자 이하여야 합니다.');
    });
    var hasCheck = qs.some(function (x) { return x.q.check && x.q.check.valid != null; });
    if (qs.length && !hasCheck) warns.push('성실응답 점검 문항이 없습니다. 추첨 시 불성실 응답을 걸러낼 수 없습니다.');
    return { errs: errs, warns: warns };
  };
  A.beforeSave = function () { var r = A.lintDef(ensureDef()); return r.errs; };

  /* ───────────── 개요 · 배포 ───────────── */
  A.tabs.overview = function (box) {
    var s = A.cur.survey, link = A.link(s.code), item = A.cur.item || {}, d = ensureDef();
    var nCourses = A.cur.courses.filter(function (c) { return c.active; }).length;
    var classes = {}; A.cur.courses.filter(function (c) { return c.active; }).forEach(function (c) { classes[[c.track, c.grade, c.klass].join('|')] = 1; });
    var head = A.cur.targets.reduce(function (a, t) { return a + t.headcount; }, 0);
    var lint = A.lintDef(d), nq = A.countQuestions();
    var checks = [
      [nCourses > 0, '등록 과목 ' + nCourses + '개 · 반 ' + Object.keys(classes).length + '개', '과목·교수 탭에서 과목을 등록해 주십시오.'],
      [head > 0, '배포 인원 ' + head + '명 등록', '배포 인원 탭에서 계열·학년별 인원을 등록하면 응답률이 계산됩니다.'],
      [nq > 0 && !lint.errs.length, '문항 ' + nq + '개 · 점검 통과', lint.errs.length ? '문항 탭의 오류 ' + lint.errs.length + '건을 해결해 주십시오.' : '문항을 등록해 주십시오.'],
      [!lint.warns.length, '성실응답 점검 문항 포함', lint.warns[0] || ''],
      [!!(d.intro && d.intro.rewardText), '참여 안내(상품 문구) 입력됨', '안내문 탭에서 참여 안내를 입력해 주십시오.']
    ];
    var msg = '[아세아항공직업전문학교] ' + (d.intro && d.intro.title || s.title) + '\n' + (d.intro && d.intro.rewardText ? d.intro.rewardText + '\n' : '') +
      '▶ 설문 링크: ' + link + '\n- 수강 중인 모든 과목에 응답해 주십시오. 제출 후에는 수정할 수 없습니다.\n- 제출 후 표시되는 추첨번호를 꼭 저장해 주십시오.' + (s.close_at ? '\n- 마감: ' + A.fmt(s.close_at) : '');
    box.innerHTML = '<div class="grid g2"><div>' +
      '<div class="panel"><h3>기본 정보</h3><label class="f">설문 제목</label><input class="fld" data-path="title"><label class="f">학기 표시</label><input class="fld" data-path="semester" placeholder="예: 2026-2"></div>' +
      '<div class="panel"><h3>공개 설정</h3><label class="f">상태</label><select class="fld" data-path="status"><option value="draft">준비 중 (학생이 접속해도 응답 불가)</option><option value="open">응답 받는 중</option><option value="closed">마감</option></select>' +
      '<div class="grid g2"><div><label class="f">응답 시작 일시 (선택)</label><input class="fld" type="datetime-local" data-path="open_at" data-dt="1"></div><div><label class="f">응답 마감 일시 (선택)</label><input class="fld" type="datetime-local" data-path="close_at" data-dt="1"></div></div>' +
      '<p class="hint" style="margin-top:8px">상태가 「응답 받는 중」이어도 시작·마감 일시가 있으면 그 기간에만 응답을 받습니다. 변경 후 우측 상단 「저장」을 눌러 주십시오.</p></div>' +
      '<div class="panel"><h3>' + I('flask', 16) + ' 테스트 모드</h3><p class="panel-sub">켜 두면 상태와 관계없이 응답을 받고, 같은 기기에서도 여러 번 제출해 볼 수 있습니다. 테스트 응답은 정식 집계에 포함되지 않으며, <b>정식 시작 전에 초기화</b>합니다.</p>' +
      '<label class="chk"><input type="checkbox" data-path="test_mode"> 테스트 모드 사용</label>' +
      '<div class="row" style="margin-top:10px"><span class="badge ' + (item.test_responses ? 'badge-amber' : 'badge-gray') + '">테스트 응답 ' + (item.test_responses || 0) + '건</span><span class="sp"></span>' +
      '<button class="btn btn-secondary btn-sm" data-act="resettest" ' + (item.test_responses ? '' : 'disabled') + '>테스트 결과 초기화</button><button class="btn btn-primary btn-sm" data-act="launch">정식 시작</button></div>' +
      '<p class="hint" style="margin-top:8px">「정식 시작」: 점검 항목 확인 → 테스트 결과 초기화 → 테스트 모드 해제 → 응답 받는 중으로 전환을 한 번에 진행합니다.</p></div>' +
      '</div><div>' +
      '<div class="panel"><h3>배포 링크</h3><div class="linkrow">' + I('link', 14) + '<code>' + E(link) + '</code><button class="btn btn-sm btn-secondary" data-act="cplink">복사</button><a class="btn btn-sm btn-ghost" href="' + E(link) + '" target="_blank" rel="noopener">열기</a></div>' +
      '<div class="row" style="margin-top:12px;align-items:flex-start"><img alt="QR" width="132" height="132" style="border:1px solid var(--border);border-radius:var(--r);background:#fff" src="https://api.qrserver.com/v1/create-qr-code/?size=264x264&margin=8&data=' + encodeURIComponent(link) + '"><div class="sp"><label class="f" style="margin-top:0">카카오톡·문자 안내문 (수정 가능)</label><textarea id="msg" class="fld" rows="7">' + E(msg) + '</textarea><div class="row" style="margin-top:6px"><button class="btn btn-sm btn-primary" data-act="cpmsg">안내문 복사</button><a class="btn btn-sm btn-ghost" data-act="qrdl" href="https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=16&data=' + encodeURIComponent(link) + '" target="_blank" rel="noopener">QR 크게 보기</a></div></div></div></div>' +
      '<div class="panel"><h3>배포 전 점검</h3><div class="steps">' + checks.map(function (c) { return '<div class="step"><span class="st ' + (c[0] ? 'ok' : 'warn') + '">' + (c[0] ? '✓' : '!') + '</span><div><b>' + E(c[1]) + '</b>' + (c[0] ? '' : '<span>' + E(c[2]) + '</span>') + '</div></div>'; }).join('') + '</div></div>' +
      '</div></div>';
    bindPaths(box, function (p) { if (p === 'title') document.querySelector('.pg-head h1').textContent = A.work.title; });
    box.addEventListener('click', async function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return; var act = t.getAttribute('data-act');
      if (act === 'cplink') A.copy(link, '설문 링크를 복사했습니다.');
      else if (act === 'cpmsg') A.copy(box.querySelector('#msg').value, '안내문을 복사했습니다.');
      else if (act === 'resettest') resetTest(false);
      else if (act === 'launch') launch(checks);
    });
  };
  async function resetTest(silent) {
    var n = (A.cur.item || {}).test_responses || 0;
    var ok = silent || await A.confirm('테스트 결과 초기화', '테스트 응답 ' + n + '건과 그에 딸린 추첨·수령 기록이 삭제됩니다. 정식 응답은 삭제되지 않습니다.', '초기화', '취소', true);
    if (!ok) return false;
    try { var r = await A.rpc('svy_a_reset', { p_id: A.cur.survey.id, p_scope: 'test' }); if (!silent) A.toast('테스트 응답 ' + r.responses + '건을 초기화했습니다.'); await A.refresh(); A.renderSurvey(); return true; }
    catch (e) { A.toast(e.message, 'err'); return false; }
  }
  async function launch(checks) {
    var bad = checks.filter(function (c) { return !c[0]; });
    var n = (A.cur.item || {}).test_responses || 0;
    if (A.isDirty()) { A.toast('저장하지 않은 변경 사항이 있습니다. 먼저 저장해 주십시오.', 'err'); return; }
    var ok = await A.confirm('정식 시작', (bad.length ? '<div class="msg warn">' + I('alert', 18) + '<div>확인이 필요한 항목이 ' + bad.length + '개 있습니다:<br>' + bad.map(function (b) { return '· ' + E(b[2] || b[1]); }).join('<br>') + '</div></div>' : '<div class="msg ok">' + I('check', 18) + '<div>배포 전 점검 항목이 모두 통과했습니다.</div></div>') +
      '<p style="margin:10px 0 0">다음을 진행합니다.<br>1. 테스트 응답 ' + n + '건 초기화<br>2. 테스트 모드 해제<br>3. 상태를 「응답 받는 중」으로 변경</p>', '정식 시작', '취소');
    if (!ok) return;
    try {
      if (n > 0 && !(await resetTest(true))) return;
      var r = await A.rpc('svy_a_save', { p_id: A.cur.survey.id, p_patch: { test_mode: false, status: 'open' } });
      await A.load(A.cur.survey.id); A.renderSurvey(); A.toast('정식 시작했습니다. 이제 학생이 응답할 수 있습니다.');
    } catch (e) { A.toast(e.message, 'err'); }
  }

  /* ───────────── 안내문 ───────────── */
  function introPreview(d, theme) {
    var i = d.intro || {}, v = SVY.themeVars(theme), style = Object.keys(v).map(function (k) { return k + ':' + v[k]; }).join(';');
    return '<div class="preview" style="' + style + '"><div class="hdr"><div class="hdr-in"><img class="logo" src="aseasurvey-logo.png" alt=""></div></div><div style="padding:14px"><div class="card"><div class="kicker">' + E(i.subtitle || '') + '</div><h2 class="title" style="font-size:20px">' + E(i.title || '(제목)') + '</h2><div class="org">' + E(i.org || '') + '</div>' +
      (i.rewardText ? '<div class="reward">' + I('gift', 22) + '<div><b>참여 안내</b><br>' + E(i.rewardText) + (i.drawGuide ? '<div class="hint" style="margin-top:8px;color:var(--text)">' + E(i.drawGuide) + '</div>' : '') + '</div></div>' : '') +
      '<dl class="notice">' + (i.notice || []).map(function (n) { return '<div><dt>' + E(n.k) + '</dt><dd>' + E(n.v) + '</dd></div>'; }).join('') + '</dl>' + (i.timeNote ? '<div class="timenote">' + I('info', 16) + E(i.timeNote) + '</div>' : '') +
      '<div class="btn-row"><button class="btn btn-primary">설문 시작하기</button></div></div></div></div>';
  }
  A.tabs.intro = function (box) {
    var d = ensureDef(), i = d.intro;
    function draw() {
      box.innerHTML = '<div class="grid g2"><div><div class="panel"><h3>안내문 작성</h3><p class="panel-sub">학생이 설문을 시작하기 전 처음 보는 화면입니다. 설문마다 따로 작성합니다.</p>' +
        '<label class="f">상단 소제목</label><input class="fld" data-path="def.intro.subtitle" placeholder="예: 교과목별 응답지">' +
        '<label class="f">설문 제목</label><input class="fld" data-path="def.intro.title"><label class="f">기관·부서명</label><input class="fld" data-path="def.intro.org">' +
        '<label class="f">참여 안내 (상품 문구 — 총 인원 등은 적지 않습니다)</label><textarea class="fld" rows="2" data-path="def.intro.rewardText"></textarea>' +
        '<label class="f">성실도 안내 (참여 안내 아래에 표시)</label><textarea class="fld" rows="3" data-path="def.intro.drawGuide"></textarea>' +
        '<label class="f">서술형 입력칸 안내 문구</label><input class="fld" data-path="def.intro.textNudge">' +
        '<label class="f">소요 시간 안내</label><input class="fld" data-path="def.intro.timeNote"></div>' +
        '<div class="panel"><h3>조사 안내 항목</h3><p class="panel-sub">항목명과 내용을 자유롭게 추가·삭제·순서 변경할 수 있습니다.</p><div id="nl">' +
        (i.notice || []).map(function (n, k) { return '<div class="cmt" data-k="' + k + '"><div class="row"><input class="fld" style="width:120px" data-nk="k" value="' + E(n.k) + '" placeholder="항목명"><span class="sp"></span><button class="btn btn-ghost btn-sm" data-act="nup">' + I('up', 14) + '</button><button class="btn btn-ghost btn-sm" data-act="ndn">' + I('down', 14) + '</button><button class="btn btn-ghost btn-sm" data-act="ndel" style="color:var(--red)">' + I('trash', 14) + '</button></div><textarea class="fld" rows="2" data-nk="v" style="margin-top:6px" placeholder="내용">' + E(n.v) + '</textarea></div>'; }).join('') +
        '</div><button class="btn btn-secondary btn-sm" data-act="nadd" style="margin-top:10px">' + I('plus', 14) + ' 안내 항목 추가</button></div>' +
        '<div class="panel"><h3>제출 후 문구</h3><label class="f">제출 완료 문구</label><input class="fld" data-path="def.intro.doneNote"><label class="f">추첨 결과 확인 안내 문구</label><textarea class="fld" rows="2" data-path="def.intro.drawNotice"></textarea></div></div>' +
        '<div><div class="panel" style="position:sticky;top:8px"><h3>학생 화면 미리보기</h3><div id="pv"></div></div></div></div>';
      bindPaths(box, function () { box.querySelector('#pv').innerHTML = introPreview(A.work.def, A.work.theme); });
      box.querySelector('#pv').innerHTML = introPreview(d, A.work.theme);
    }
    draw();
    box.oninput = function (e) {
      var el = e.target.closest('[data-nk]'); if (!el) return;
      var k = Number(el.closest('[data-k]').getAttribute('data-k')); A.work.def.intro.notice[k][el.getAttribute('data-nk')] = el.value; A.markDirty(); box.querySelector('#pv').innerHTML = introPreview(A.work.def, A.work.theme);
    };
    box.onclick = function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return; var act = t.getAttribute('data-act'), card = t.closest('[data-k]'), k = card ? Number(card.getAttribute('data-k')) : -1, arr = A.work.def.intro.notice = A.work.def.intro.notice || [];
      if (act === 'nadd') arr.push({ k: '', v: '' }); else if (act === 'ndel') arr.splice(k, 1);
      else if (act === 'nup' && k > 0) { var a = arr[k]; arr[k] = arr[k - 1]; arr[k - 1] = a; } else if (act === 'ndn' && k < arr.length - 1) { var b = arr[k]; arr[k] = arr[k + 1]; arr[k + 1] = b; } else return;
      A.markDirty(); A.tabs.intro(box);
    };
  };
  A.introPreview = introPreview;

  /* ───────────── 문항 편집기 ───────────── */
  var TYPE_LABEL = { scale: '척도(5점·예/아니오)', single: '단일 선택', multi: '복수 선택', text: '서술형' };
  function newId(prefix) { var ids = {}; allQ().forEach(function (x) { ids[x.q.id] = 1; }); var n = 1; while (ids[prefix + n]) n++; return prefix + n; }
  function scaleLabel(d, q, v) { var s = (d.scales[q.scale || 'likert5'] || []).filter(function (o) { return o.v === v; })[0]; return s ? s.label : v; }
  function qCard(q, si, qi, isBasic) {
    var d = def(), multiQs = allQ().filter(function (x) { return x.q.type === 'multi' && x.q.id !== q.id; });
    var scales = Object.keys(d.scales);
    var h = '<div class="qcard" data-si="' + si + '" data-qi="' + qi + '"><div class="qhead"><span class="qid">' + E(q.id) + '</span><span class="tag blue">' + TYPE_LABEL[q.type] + '</span>' +
      (q.scope === 'common' && !isBasic ? '<span class="tag">공통 문항</span>' : (isBasic ? '<span class="tag">기본정보</span>' : '<span class="tag">과목별</span>')) +
      (q.check && q.check.valid != null ? '<span class="tag check">성실응답 점검 · 정답 ' + E(scaleLabel(d, q, q.check.valid)) + '</span>' : '') + (q.required ? '<span class="tag">필수</span>' : '') +
      '<span class="sp"></span><button class="btn btn-ghost btn-sm" data-act="qup">' + I('up', 14) + '</button><button class="btn btn-ghost btn-sm" data-act="qdn">' + I('down', 14) + '</button><button class="btn btn-ghost btn-sm" data-act="qdup" title="복제">' + I('copy', 14) + '</button><button class="btn btn-ghost btn-sm" data-act="qdel" style="color:var(--red)">' + I('trash', 14) + '</button></div>' +
      '<div class="qbody"><textarea class="fld" rows="2" data-f="label" placeholder="문항 내용">' + E(q.label || '') + '</textarea>' +
      '<div class="row"><div><label class="f">ID</label><input class="fld fld-sm" data-f="id" value="' + E(q.id) + '"></div>' +
      '<div><label class="f">유형</label><select class="fld" data-f="type">' + Object.keys(TYPE_LABEL).map(function (k) { return '<option value="' + k + '"' + (q.type === k ? ' selected' : '') + '>' + TYPE_LABEL[k] + '</option>'; }).join('') + '</select></div>' +
      (isBasic ? '' : '<div><label class="f">응답 단위</label><select class="fld" data-f="scope"><option value="course"' + (q.scope !== 'common' ? ' selected' : '') + '>과목별로 응답</option><option value="common"' + (q.scope === 'common' ? ' selected' : '') + '>설문 전체에서 1회 응답</option></select></div>') +
      '<div><label class="f">&nbsp;</label><label class="chk"><input type="checkbox" data-f="required" ' + (q.required || (q.check && q.check.valid != null) ? 'checked' : '') + ((q.check && q.check.valid != null) ? ' disabled' : '') + '> 필수</label></div></div>';
    if (q.type === 'scale') {
      h += '<div class="row"><div><label class="f">척도</label><select class="fld" data-f="scale">' + scales.map(function (k) { return '<option value="' + k + '"' + ((q.scale || 'likert5') === k ? ' selected' : '') + '>' + (k === 'likert5' ? '5점 척도 (' + d.scales[k][0].label + ' ~ ' + d.scales[k][d.scales[k].length - 1].label + ')' : k === 'yesno' ? '예 / 아니오' : k) + '</option>'; }).join('') + '</select></div>' +
        '<div><label class="f">성실응답 점검</label><label class="chk"><input type="checkbox" data-f="checkon" ' + (q.check && q.check.valid != null ? 'checked' : '') + '> 점검 문항으로 사용</label></div>' +
        (q.check && q.check.valid != null ? '<div><label class="f">정답(유효값)</label><select class="fld" data-f="checkvalid">' + (d.scales[q.scale || 'likert5'] || []).map(function (o) { return '<option value="' + o.v + '"' + (o.v === q.check.valid ? ' selected' : '') + '>' + E(o.label) + '</option>'; }).join('') + '</select></div>' : '') + '</div>' +
        (q.check && q.check.valid != null ? '<p class="hint">정답과 다르게 응답하면 성실응답 점검 실패로 기록되며, 결과 화면의 신뢰도 필터와 추첨 자격 판정에 사용됩니다. 문항 내용에 어떻게 응답해야 하는지(예: "전혀 아니다에 표시")를 안내해 주십시오.</p>' : '');
    }
    if (q.type === 'single' || q.type === 'multi') {
      h += '<div><label class="f">선택지</label>' + (q.options || []).map(function (o, oi) {
        return '<div class="optrow" data-oi="' + oi + '"><input class="fld" data-of="label" value="' + E(o.label) + '">' + (q.type === 'multi' ? '<label class="chk" title="이 항목을 선택하면 다른 선택이 해제됩니다(예: 없음)"><input type="checkbox" data-of="exclusive" ' + (o.exclusive ? 'checked' : '') + '> 단독 선택</label>' : '') + '<button class="btn btn-ghost btn-sm" data-act="odel" style="color:var(--red)">' + I('x', 14) + '</button></div>';
      }).join('') + '<button class="btn btn-secondary btn-sm" data-act="oadd" style="margin-top:6px">' + I('plus', 14) + ' 선택지 추가</button></div>';
    }
    if (q.type === 'text') h += '<div class="row"><div class="sp"><label class="f">입력칸 안내 문구</label><input class="fld" data-f="placeholder" value="' + E(q.placeholder || '') + '"></div><div><label class="f">최대 글자 수</label><input class="fld fld-sm" type="number" min="10" max="2000" data-f="maxLen" value="' + (q.maxLen || 500) + '"></div></div>';
    if (!isBasic && multiQs.length) h += '<div class="row"><div><label class="f">표시 조건</label><select class="fld" data-f="showIf"><option value="">항상 표시</option>' + multiQs.map(function (x) { return '<option value="' + E(x.q.id) + '"' + (q.showIf && q.showIf.q === x.q.id ? ' selected' : '') + '>' + E(x.q.id) + '에서 「단독 선택」 외 항목을 고른 경우에만 표시</option>'; }).join('') + '</select></div></div>';
    return h + '</div></div>';
  }
  A.tabs.questions = function (box) {
    var d = ensureDef(), lint = A.lintDef(d), sc = d.scales;
    box.innerHTML = '<div class="row" style="margin-bottom:10px"><div class="sp">' + (lint.errs.length ? '<div class="msg err" style="margin:0">' + I('alert', 18) + '<div><b>오류 ' + lint.errs.length + '건</b><br>' + lint.errs.slice(0, 6).map(E).join('<br>') + '</div></div>' : '<div class="msg ok" style="margin:0">' + I('check', 18) + '<div>문항 점검 통과 · 문항 ' + A.countQuestions() + '개 (척도 ' + allQ().filter(function (x) { return x.q.type === 'scale'; }).length + ')</div></div>') +
      (lint.warns.length ? '<div class="msg warn">' + I('alert', 18) + '<div>' + lint.warns.map(E).join('<br>') + '</div></div>' : '') + '</div>' +
      '<button class="btn btn-secondary btn-sm" data-act="json">고급: JSON 편집</button><button class="btn btn-secondary btn-sm" data-act="scales">척도 문구 편집</button><button class="btn btn-primary btn-sm" data-act="sadd">' + I('plus', 14) + ' 영역 추가</button></div>' +
      '<div class="sec-card"><div class="sec-head"><b>기본 정보 문항 (반 선택 다음 단계)</b></div>' + (d.basic || []).map(function (q, qi) { return qCard(q, -1, qi, true); }).join('') +
      '<div class="qcard"><button class="btn btn-secondary btn-sm" data-act="qadd" data-si="-1">' + I('plus', 14) + ' 기본 정보 문항 추가</button></div></div>' +
      d.sections.map(function (s, si) {
        return '<div class="sec-card" data-s="' + si + '"><div class="sec-head"><input class="fld" data-sf="title" value="' + E(s.title || '') + '" placeholder="영역 제목"><button class="btn btn-ghost btn-sm" data-act="sup">' + I('up', 14) + '</button><button class="btn btn-ghost btn-sm" data-act="sdn">' + I('down', 14) + '</button><button class="btn btn-ghost btn-sm" data-act="sdel" style="color:var(--red)">' + I('trash', 14) + '</button></div>' +
          '<div style="padding:8px 12px 0"><input class="fld" data-sf="note" value="' + E(s.note || '') + '" placeholder="영역 안내 문구 (선택)"></div>' +
          (s.questions || []).map(function (q, qi) { return qCard(q, si, qi, false); }).join('') +
          '<div class="qcard"><div class="row"><button class="btn btn-secondary btn-sm" data-act="qadd" data-si="' + si + '" data-t="scale">' + I('plus', 14) + ' 척도 문항</button><button class="btn btn-secondary btn-sm" data-act="qadd" data-si="' + si + '" data-t="single">단일 선택</button><button class="btn btn-secondary btn-sm" data-act="qadd" data-si="' + si + '" data-t="multi">복수 선택</button><button class="btn btn-secondary btn-sm" data-act="qadd" data-si="' + si + '" data-t="text">서술형</button></div></div></div>';
      }).join('');
    var redraw = function () { A.markDirty(); var y = window.scrollY; A.tabs.questions(box); window.scrollTo(0, y); };
    function qref(el) { var c = el.closest('[data-qi]'), si = Number(c.getAttribute('data-si')), qi = Number(c.getAttribute('data-qi')); var list = si < 0 ? d.basic : d.sections[si].questions; return { list: list, q: list[qi], qi: qi, si: si }; }
    box.onclick = async function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return; var act = t.getAttribute('data-act');
      if (act === 'sadd') { d.sections.push({ id: newId('S'), title: '새 영역', note: '', questions: [] }); return redraw(); }
      if (act === 'json') return jsonEditor();
      if (act === 'scales') return scaleEditor();
      var sc2 = t.closest('[data-s]'), si = sc2 ? Number(sc2.getAttribute('data-s')) : -1;
      if (act === 'sup' && si > 0) { var a = d.sections[si]; d.sections[si] = d.sections[si - 1]; d.sections[si - 1] = a; return redraw(); }
      if (act === 'sdn' && si < d.sections.length - 1) { var b = d.sections[si]; d.sections[si] = d.sections[si + 1]; d.sections[si + 1] = b; return redraw(); }
      if (act === 'sdel') { if (await A.confirm('영역 삭제', '「' + E(d.sections[si].title) + '」과(와) 영역 안의 문항 ' + (d.sections[si].questions || []).length + '개가 삭제됩니다.', '삭제', '취소', true)) { d.sections.splice(si, 1); redraw(); } return; }
      if (act === 'qadd') {
        var sIdx = Number(t.getAttribute('data-si')), ty = t.getAttribute('data-t') || 'single';
        var nq = { id: newId('Q'), type: ty, label: '', scope: 'course', required: ty !== 'text' };
        if (sIdx < 0) { nq.type = 'single'; nq.scope = 'common'; nq.options = [{ id: 'o1', label: '선택지 1' }]; d.basic.push(nq); }
        else { if (ty === 'scale') nq.scale = 'likert5'; if (ty === 'single' || ty === 'multi') nq.options = [{ id: 'o1', label: '선택지 1' }, { id: 'o2', label: '선택지 2' }]; if (ty === 'text') { nq.maxLen = 500; nq.required = false; } (d.sections[sIdx].questions = d.sections[sIdx].questions || []).push(nq); }
        return redraw();
      }
      var r = qref(t);
      if (act === 'qup' && r.qi > 0) { var x = r.list[r.qi]; r.list[r.qi] = r.list[r.qi - 1]; r.list[r.qi - 1] = x; return redraw(); }
      if (act === 'qdn' && r.qi < r.list.length - 1) { var y = r.list[r.qi]; r.list[r.qi] = r.list[r.qi + 1]; r.list[r.qi + 1] = y; return redraw(); }
      if (act === 'qdup') { var cp = A.clone(r.q); cp.id = newId(r.q.id.replace(/\d+$/, '') || 'Q'); r.list.splice(r.qi + 1, 0, cp); return redraw(); }
      if (act === 'qdel') { if (await A.confirm('문항 삭제', '[' + E(r.q.id) + '] ' + E(String(r.q.label).slice(0, 60)) + '<br>이미 받은 응답에서 이 문항의 값은 집계되지 않습니다.', '삭제', '취소', true)) { r.list.splice(r.qi, 1); redraw(); } return; }
      if (act === 'oadd') { r.q.options = r.q.options || []; var k = 1; while (r.q.options.some(function (o) { return o.id === 'o' + k; })) k++; r.q.options.push({ id: 'o' + k, label: '' }); return redraw(); }
      if (act === 'odel') { var oi = Number(t.closest('[data-oi]').getAttribute('data-oi')); r.q.options.splice(oi, 1); return redraw(); }
    };
    box.oninput = function (e) {
      var el = e.target, sf = el.getAttribute('data-sf');
      if (sf) { var s = d.sections[Number(el.closest('[data-s]').getAttribute('data-s'))]; s[sf] = el.value; return A.markDirty(); }
      if (el.getAttribute('data-of')) { var rr = qref(el), o = rr.q.options[Number(el.closest('[data-oi]').getAttribute('data-oi'))]; if (el.type === 'checkbox') o.exclusive = el.checked || undefined; else o.label = el.value; return A.markDirty(); }
      var f = el.getAttribute('data-f'); if (!f) return;
      var r = qref(el), q = r.q;
      if (el.type === 'checkbox') {
        if (f === 'required') q.required = el.checked;
        else if (f === 'checkon') { if (el.checked) { q.check = { valid: ((d.scales[q.scale || 'likert5'] || []).slice(-1)[0] || {}).v }; q.required = true; } else delete q.check; return redraw(); }
        return A.markDirty();
      }
      var v = el.value;
      if (f === 'checkvalid') { q.check = { valid: Number(v) }; return redraw(); }
      if (f === 'type') { q.type = v; if (v === 'scale') { q.scale = q.scale || 'likert5'; delete q.options; } else if (v === 'single' || v === 'multi') { q.options = q.options && q.options.length ? q.options : [{ id: 'o1', label: '선택지 1' }, { id: 'o2', label: '선택지 2' }]; delete q.scale; delete q.check; } else { delete q.options; delete q.scale; delete q.check; } return redraw(); }
      if (f === 'scale') { q.scale = v; if (q.check) q.check = { valid: ((d.scales[v] || []).slice(-1)[0] || {}).v }; return redraw(); }
      if (f === 'showIf') { if (v) q.showIf = { q: v }; else delete q.showIf; return A.markDirty(); }
      if (f === 'maxLen') q.maxLen = Number(v) || 500; else q[f] = v;
      A.markDirty();
    };
    box.onchange = function (e) { var f = e.target.getAttribute('data-f'); if (f === 'id' || f === 'scope') { if (f === 'id') { var r = qref(e.target), old = r.q.id; r.q.id = e.target.value.trim(); allQ().forEach(function (x) { if (x.q.showIf && x.q.showIf.q === old) x.q.showIf.q = r.q.id; }); } redraw(); } };
  };
  function scaleEditor() {
    var d = ensureDef();
    A.modal('<h3>척도 문구 편집</h3><p class="muted">값(점수)은 고정이며, 학생 화면에 표시되는 문구만 바꿀 수 있습니다. 표시 순서는 아래 순서와 같습니다.</p>' +
      Object.keys(d.scales).map(function (k) { return '<label class="f">' + (k === 'likert5' ? '5점 척도' : k === 'yesno' ? '예 / 아니오' : k) + '</label>' + d.scales[k].map(function (o, i) { return '<div class="optrow"><span class="tag">' + o.v + '점</span><input class="fld" data-sk="' + k + '" data-si="' + i + '" value="' + E(o.label) + '"></div>'; }).join(''); }).join('') +
      '<div class="btn-row"><button class="btn btn-primary" data-r="1">확인</button></div>', function (bg, close) {
      bg.addEventListener('input', function (e) { var el = e.target.closest('[data-sk]'); if (el) { d.scales[el.getAttribute('data-sk')][Number(el.getAttribute('data-si'))].label = el.value; A.markDirty(); } });
      bg.addEventListener('click', function (e) { if (e.target.closest('[data-r]')) { close(); A.tabs.questions(document.getElementById('tabbody')); } });
    });
  }
  function jsonEditor() {
    A.modal('<h3>설문 정의 JSON 편집</h3><p class="muted">문항·안내문·척도 전체를 직접 편집합니다. 형식이 잘못되면 적용되지 않습니다.</p><textarea id="js" class="fld" rows="22" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px">' + E(JSON.stringify(A.work.def, null, 2)) + '</textarea><div id="jse"></div>' +
      '<div class="btn-row"><button class="btn btn-ghost" data-r="0">취소</button><button class="btn btn-primary" data-r="1">적용</button></div>', function (bg, close) {
      bg.addEventListener('click', function (e) {
        var b = e.target.closest('[data-r]'); if (!b) return; if (b.getAttribute('data-r') === '0') return close();
        try { var o = JSON.parse(bg.querySelector('#js').value); var l = A.lintDef(o); if (l.errs.length && !confirm('점검 오류가 ' + l.errs.length + '건 있습니다.\n' + l.errs.slice(0, 5).join('\n') + '\n그래도 적용하시겠습니까?')) return; A.work.def = o; A.markDirty(); close(); A.tabs.questions(document.getElementById('tabbody')); }
        catch (er) { bg.querySelector('#jse').innerHTML = '<div class="msg err">JSON 형식 오류: ' + E(er.message) + '</div>'; }
      });
    }, 'xl');
  }

  /* ───────────── 과목·교수 ───────────── */
  var HEAD_MAP = [['track', /^(계열|학과|전공)/], ['grade', /^학년/], ['klass', /^(반|학급|분반)/], ['name', /^(과목|교과|과목명|교과목)/], ['kind', /^(구분|이론|실습|유형)/], ['prof', /^(담당|교수|강사|교원)/]];
  function normGrade(v) { v = String(v == null ? '' : v).trim(); return /^\d+$/.test(v) ? v + '학년' : v; }
  function normKlass(v) { v = String(v == null ? '' : v).trim(); return /^\d+$/.test(v) ? v + '반' : v; }
  function normRow(r) {
    var name = String(r.name || '').trim(), kind = String(r.kind || '').trim();
    var m = name.match(/\s*[(（]\s*(이론|실습)\s*[)）]\s*$/);
    if (m) { if (!kind) kind = m[1]; name = name.slice(0, m.index).trim(); }
    return { track: String(r.track || '').trim(), grade: normGrade(r.grade), klass: normKlass(r.klass), name: name, prof: String(r.prof || '').trim(), kind: kind };
  }
  function keyOf(r) { return [r.track, r.grade, r.klass, r.name].join('|'); }
  function parseSheetRows(aoa) {
    var hi = -1, cols = {};
    for (var i = 0; i < Math.min(aoa.length, 15) && hi < 0; i++) {
      var tmp = {}; (aoa[i] || []).forEach(function (c, j) { var s = String(c).replace(/\s|\(.*?\)/g, ''); HEAD_MAP.forEach(function (m) { if (tmp[m[0]] == null && m[1].test(s)) tmp[m[0]] = j; }); });
      if (tmp.track != null && tmp.name != null && tmp.klass != null) { hi = i; cols = tmp; }
    }
    if (hi < 0) return { error: '머리글(계열, 학년, 반, 과목명, 구분, 담당교수)을 찾지 못했습니다. 다운로드한 양식을 사용해 주십시오.', rows: [] };
    var rows = [];
    for (var k = hi + 1; k < aoa.length; k++) {
      var a = aoa[k] || []; if (a.every(function (c) { return String(c).trim() === ''; })) continue;
      if (/^\s*\(?예시\)?/.test(String(a[cols.track]))) continue;
      var o = {}; Object.keys(cols).forEach(function (f) { o[f] = a[cols[f]]; }); var r = normRow(o); r._line = k + 1; rows.push(r);
    }
    return { rows: rows };
  }
  function parseTargets(aoa) {
    var hi = -1, c = {};
    for (var i = 0; i < Math.min(aoa.length, 15) && hi < 0; i++) { var t = {}; (aoa[i] || []).forEach(function (x, j) { var s = String(x).replace(/\s/g, ''); if (/^(계열|학과)/.test(s) && t.track == null) t.track = j; if (/^학년/.test(s) && t.grade == null) t.grade = j; if (/(인원|명)/.test(s) && t.n == null) t.n = j; }); if (t.track != null && t.grade != null && t.n != null) { hi = i; c = t; } }
    if (hi < 0) return [];
    var out = []; for (var k = hi + 1; k < aoa.length; k++) { var a = aoa[k] || []; if (!String(a[c.track]).trim() || /^\s*\(?예시/.test(String(a[c.track]))) continue; out.push({ track: String(a[c.track]).trim(), grade: normGrade(a[c.grade]), headcount: Math.max(parseInt(a[c.n], 10) || 0, 0) }); }
    return out;
  }
  function downloadTemplate() {
    if (!window.XLSX) return A.toast('엑셀 라이브러리를 불러오지 못했습니다.', 'err');
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet([['계열', '학년', '반', '과목명', '구분(이론/실습)', '담당교수'],
      ['(예시)항공정비', '2학년', 'A반', '항공역학', '이론', '홍길동'], ['(예시)항공정비', '2학년', 'A반', '항공기체실습2', '실습', '김철수'], ['(예시)항공정비', '2학년', 'B반', '항공역학', '이론', '이영희']]);
    ws['!cols'] = [{ wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 26 }, { wch: 16 }, { wch: 12 }]; XLSX.utils.book_append_sheet(wb, ws, '과목등록');
    var ws2 = XLSX.utils.aoa_to_sheet([['계열', '학년', '배포인원(명)'], ['(예시)항공정비', '2학년', 60]]); ws2['!cols'] = [{ wch: 14 }, { wch: 8 }, { wch: 14 }]; XLSX.utils.book_append_sheet(wb, ws2, '배포인원');
    var ws3 = XLSX.utils.aoa_to_sheet([['작성 안내'], ['1. 「과목등록」 시트에 한 행에 한 과목을 입력합니다. 같은 과목이라도 반마다 담당교수가 다르면 반별로 행을 나누어 입력합니다.'],
      ['2. 「반」은 학생이 설문에서 선택하는 반 이름입니다. (예: A반, 1반) 숫자만 입력하면 「반」이 자동으로 붙습니다.'], ['3. 「학년」에 숫자만 입력하면 「학년」이 자동으로 붙습니다.'],
      ['4. 과목명 끝에 (이론) 또는 (실습)이 있으면 구분이 자동 입력되고 과목명에서는 제외됩니다.'], ['5. 「(예시)」로 시작하는 행은 등록되지 않습니다. 예시 행은 지우거나 그대로 두셔도 됩니다.'],
      ['6. 「배포인원」 시트는 선택 사항이며 계열·학년별 배포 인원(응답률 분모)입니다.'], ['7. 같은 계열·학년·반·과목명이 중복되면 오류로 표시됩니다.']]);
    ws3['!cols'] = [{ wch: 110 }]; XLSX.utils.book_append_sheet(wb, ws3, '작성안내');
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    A.download(new Blob([out], { type: 'application/octet-stream' }), '설문_과목등록_양식.xlsx');
  }
  function readFile(file) {
    return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsArrayBuffer(file); });
  }
  function importPreview(rows, targets, source) {
    var exist = {}; A.cur.courses.filter(function (c) { return c.active; }).forEach(function (c) { exist[keyOf(c)] = c; });
    var seen = {}, errs = [], st = { new: 0, upd: 0, same: 0 };
    rows.forEach(function (r) {
      if (!r.track || !r.grade || !r.klass || !r.name) errs.push((r._line ? r._line + '행: ' : '') + '계열·학년·반·과목명 중 비어 있는 값이 있습니다.');
      var k = keyOf(r); if (seen[k]) errs.push((r._line ? r._line + '행: ' : '') + '중복된 행입니다 (' + r.track + ' ' + r.grade + ' ' + r.klass + ' ' + r.name + ').'); seen[k] = 1;
      var o = exist[k]; r._st = !o ? 'new' : ((o.prof !== r.prof || o.kind !== r.kind) ? 'upd' : 'same'); st[r._st]++;
    });
    var m = A.modal('<h3>' + E(source) + ' — 등록 미리보기</h3><div class="row"><span class="badge badge-green">신규 ' + st.new + '</span><span class="badge badge-blue">갱신 ' + st.upd + '</span><span class="badge badge-gray">동일 ' + st.same + '</span>' + (targets.length ? '<span class="badge badge-amber">배포인원 ' + targets.length + '행</span>' : '') + (errs.length ? '<span class="badge badge-red">오류 ' + errs.length + '</span>' : '') + '</div>' +
      (errs.length ? '<ul class="err-list">' + errs.slice(0, 50).map(function (x) { return '<li>' + E(x) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="tbl-wrap" style="margin-top:10px;max-height:300px"><table class="t"><thead><tr><th>상태</th><th>계열</th><th>학년</th><th>반</th><th>과목명</th><th>구분</th><th>담당교수</th></tr></thead><tbody>' +
      rows.slice(0, 300).map(function (r) { return '<tr><td>' + ({ new: '<span class="badge badge-green">신규</span>', upd: '<span class="badge badge-blue">갱신</span>', same: '<span class="badge badge-gray">동일</span>' }[r._st]) + '</td><td>' + E(r.track) + '</td><td>' + E(r.grade) + '</td><td>' + E(r.klass) + '</td><td>' + E(r.name) + '</td><td>' + E(r.kind) + '</td><td>' + E(r.prof) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<label class="f">등록 방식</label><div class="opts list" id="impm"><button type="button" class="opt" data-v="merge" aria-pressed="true"><span class="box">' + I('check', 14) + '</span><span><b>추가·갱신</b> (기존 과목은 유지하고 목록의 과목만 추가하거나 교수·구분을 갱신)</span></button>' +
      '<button type="button" class="opt" data-v="replace" aria-pressed="false"><span class="box">' + I('check', 14) + '</span><span><b>전체 교체</b> (목록에 없는 기존 과목은 제거. 응답이 있는 경우 비활성 처리)</span></button></div>' +
      '<div class="btn-row"><button class="btn btn-ghost" data-r="0">취소</button><button class="btn btn-primary" data-r="1" ' + (errs.length || !rows.length ? 'disabled' : '') + '>등록</button></div>', function (bg, close) {
      var mode = 'merge';
      bg.addEventListener('click', async function (e) {
        var o = e.target.closest('#impm .opt'); if (o) { mode = o.getAttribute('data-v'); bg.querySelectorAll('#impm .opt').forEach(function (b) { b.setAttribute('aria-pressed', b === o); }); return; }
        var b = e.target.closest('[data-r]'); if (!b) return; if (b.getAttribute('data-r') === '0') return close();
        b.disabled = true; b.textContent = '등록 중…';
        try {
          var res = await A.rpc('svy_a_courses_save', { p_id: A.cur.survey.id, p_rows: rows.map(function (r) { return { track: r.track, grade: r.grade, klass: r.klass, name: r.name, prof: r.prof, kind: r.kind }; }), p_mode: mode });
          if (targets.length) await A.rpc('svy_a_targets_save', { p_id: A.cur.survey.id, p_rows: mergeTargets(targets, mode) });
          close(); A.toast('과목 ' + res.saved + '건을 등록했습니다.' + (res.removed ? ' (제거 ' + res.removed + '건)' : '')); await A.refresh(); A.ext.tg = null; A.renderSurvey();
        } catch (er) { A.toast(er.message, 'err'); b.disabled = false; b.textContent = '등록'; }
      });
    }, 'xl');
  }
  function mergeTargets(targets, mode) {
    if (mode === 'replace') return targets;
    var map = {}; A.cur.targets.forEach(function (t) { map[t.track + '|' + t.grade] = { track: t.track, grade: t.grade, headcount: t.headcount }; });
    targets.forEach(function (t) { map[t.track + '|' + t.grade] = t; }); return Object.keys(map).map(function (k) { return map[k]; });
  }
  A.tabs.courses = function (box) {
    var cs = A.cur.courses, active = cs.filter(function (c) { return c.active; });
    var tracks = Array.from(new Set(active.map(function (c) { return c.track; }))), flt = A.ext.cf || (A.ext.cf = { track: '', q: '' });
    var list = active.filter(function (c) { return (!flt.track || c.track === flt.track) && (!flt.q || (c.name + c.prof + c.klass + c.grade).indexOf(flt.q) >= 0); });
    var profs = new Set(active.map(function (c) { return c.prof; }).filter(Boolean));
    box.innerHTML = '<div class="row" style="margin-bottom:12px"><div><b style="font-size:15px">등록 과목 ' + active.length + '건</b> <span class="muted">· 반 ' + new Set(active.map(function (c) { return [c.track, c.grade, c.klass].join('|'); })).size + '개 · 담당교수 ' + profs.size + '명</span></div><span class="sp"></span>' +
      '<button class="btn btn-secondary btn-sm" data-act="tpl">' + I('download', 14) + ' 엑셀 양식 다운로드</button><button class="btn btn-secondary btn-sm" data-act="xup">' + I('upload', 14) + ' 엑셀 업로드</button><button class="btn btn-secondary btn-sm" data-act="paste">붙여넣기로 등록</button><button class="btn btn-primary btn-sm" data-act="cadd">' + I('plus', 14) + ' 과목 추가</button><input type="file" id="xf" accept=".xlsx,.xls,.csv" class="hide"></div>' +
      '<div class="panel"><p class="panel-sub" style="margin:0">같은 과목이라도 반마다 담당교수가 다르면 반별로 한 행씩 등록합니다. 이 정보로 교수별 결과가 집계됩니다. 학생에게는 과목명과 구분(이론/실습)만 표시되며, 교수 이름은 노출되지 않습니다.</p></div>' +
      '<div class="filters" style="margin-top:12px"><div><label class="f">계열</label><select class="fld" id="cft"><option value="">전체</option>' + tracks.map(function (t) { return '<option' + (flt.track === t ? ' selected' : '') + '>' + E(t) + '</option>'; }).join('') + '</select></div><div class="sp"><label class="f">검색 (과목·교수·반)</label><input class="fld" id="cfq" value="' + E(flt.q) + '"></div></div>' +
      '<div class="tbl-wrap"><table class="t"><thead><tr><th>계열</th><th>학년</th><th>반</th><th>과목명</th><th>구분</th><th>담당교수</th><th></th></tr></thead><tbody>' +
      (list.length ? list.map(function (c) { return '<tr><td>' + E(c.track) + '</td><td>' + E(c.grade) + '</td><td>' + E(c.klass) + '</td><td>' + E(c.name) + '</td><td>' + E(c.kind) + '</td><td>' + (c.prof ? E(c.prof) : '<span class="badge badge-amber">미입력</span>') + '</td><td><button class="btn btn-ghost btn-sm" data-act="cedit" data-id="' + c.id + '">' + I('edit', 14) + '</button><button class="btn btn-ghost btn-sm" data-act="cdel" data-id="' + c.id + '" style="color:var(--red)">' + I('trash', 14) + '</button></td></tr>'; }).join('') : '<tr><td colspan="7" class="t-empty">등록된 과목이 없습니다. 엑셀 양식을 내려받아 일괄 등록해 주십시오.</td></tr>') + '</tbody></table></div>' +
      (cs.length > active.length ? '<p class="hint" style="margin-top:8px">비활성 과목 ' + (cs.length - active.length) + '건은 응답 기록 보존을 위해 목록에서만 숨겨져 있습니다.</p>' : '');
    var fi = box.querySelector('#xf');
    box.querySelector('#cft').onchange = function () { flt.track = this.value; A.tabs.courses(box); };
    box.querySelector('#cfq').oninput = function () { flt.q = this.value; clearTimeout(A._cft); var v = this; A._cft = setTimeout(function () { A.tabs.courses(box); var n = box.querySelector('#cfq'); n.focus(); n.setSelectionRange(v.value.length, v.value.length); }, 250); };
    fi.onchange = async function () {
      var f = fi.files[0]; if (!f) return; fi.value = '';
      try {
        var wb = XLSX.read(new Uint8Array(await readFile(f)), { type: 'array' });
        var sn = wb.SheetNames.filter(function (n) { return /과목/.test(n); })[0] || wb.SheetNames[0];
        var p = parseSheetRows(XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' }));
        if (p.error) return A.toast(p.error, 'err');
        var tn = wb.SheetNames.filter(function (n) { return /배포|인원/.test(n); })[0], tg = tn ? parseTargets(XLSX.utils.sheet_to_json(wb.Sheets[tn], { header: 1, defval: '' })) : [];
        importPreview(p.rows, tg, f.name);
      } catch (e) { A.toast('파일을 읽을 수 없습니다: ' + e.message, 'err'); }
    };
    box.onclick = async function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return; var act = t.getAttribute('data-act'), id = t.getAttribute('data-id');
      if (act === 'tpl') downloadTemplate();
      else if (act === 'xup') fi.click();
      else if (act === 'paste') pasteImport();
      else if (act === 'cadd') courseModal(null);
      else if (act === 'cedit') courseModal(cs.filter(function (c) { return c.id === id; })[0]);
      else if (act === 'cdel') { var c = cs.filter(function (x) { return x.id === id; })[0]; if (await A.confirm('과목 삭제', E(c.track + ' ' + c.grade + ' ' + c.klass + ' · ' + c.name) + '<br>응답이 있는 설문은 기록 보존을 위해 목록에서만 숨겨집니다.', '삭제', '취소', true)) { try { await A.rpc('svy_a_course_delete', { p_course_id: id }); await A.refresh(); A.renderSurvey(); } catch (er) { A.toast(er.message, 'err'); } } }
    };
  };
  function pasteImport() {
    A.modal('<h3>붙여넣기로 등록</h3><p class="muted">엑셀에서 머리글을 포함해 복사한 뒤 붙여넣어 주십시오. (계열, 학년, 반, 과목명, 구분, 담당교수 열)</p><textarea id="pt" class="fld" rows="10" placeholder="계열\t학년\t반\t과목명\t구분\t담당교수"></textarea><div class="btn-row"><button class="btn btn-ghost" data-r="0">취소</button><button class="btn btn-primary" data-r="1">미리보기</button></div>', function (bg, close) {
      bg.addEventListener('click', function (e) {
        var b = e.target.closest('[data-r]'); if (!b) return; if (b.getAttribute('data-r') === '0') return close();
        var aoa = bg.querySelector('#pt').value.split(/\r?\n/).map(function (l) { return l.split('\t'); }); var p = parseSheetRows(aoa);
        if (p.error) return A.toast(p.error, 'err'); close(); importPreview(p.rows, [], '붙여넣기');
      });
    });
  }
  function courseModal(c) {
    var tracks = Array.from(new Set(A.cur.courses.map(function (x) { return x.track; })));
    A.modal('<h3>' + (c ? '과목 수정' : '과목 추가') + '</h3><div class="grid g2"><div><label class="f">계열</label><input class="fld" id="m1" list="dl1" value="' + E(c ? c.track : '') + '"><datalist id="dl1">' + tracks.map(function (t) { return '<option value="' + E(t) + '">'; }).join('') + '</datalist></div><div><label class="f">학년</label><input class="fld" id="m2" value="' + E(c ? c.grade : '') + '" placeholder="예: 2학년"></div>' +
      '<div><label class="f">반</label><input class="fld" id="m3" value="' + E(c ? c.klass : '') + '" placeholder="예: A반"></div><div><label class="f">과목명</label><input class="fld" id="m4" value="' + E(c ? c.name : '') + '"></div>' +
      '<div><label class="f">구분</label><select class="fld" id="m5"><option value="">(없음)</option><option' + (c && c.kind === '이론' ? ' selected' : '') + '>이론</option><option' + (c && c.kind === '실습' ? ' selected' : '') + '>실습</option></select></div><div><label class="f">담당교수</label><input class="fld" id="m6" value="' + E(c ? c.prof : '') + '"></div></div>' +
      '<div class="btn-row"><button class="btn btn-ghost" data-r="0">취소</button><button class="btn btn-primary" data-r="1">저장</button></div>', function (bg, close) {
      bg.addEventListener('click', async function (e) {
        var b = e.target.closest('[data-r]'); if (!b) return; if (b.getAttribute('data-r') === '0') return close();
        var r = normRow({ track: bg.querySelector('#m1').value, grade: bg.querySelector('#m2').value, klass: bg.querySelector('#m3').value, name: bg.querySelector('#m4').value, kind: bg.querySelector('#m5').value, prof: bg.querySelector('#m6').value });
        if (!r.track || !r.grade || !r.klass || !r.name) return A.toast('계열·학년·반·과목명은 필수입니다.', 'err');
        try {
          if (c && keyOf(c) !== keyOf(r)) await A.rpc('svy_a_course_delete', { p_course_id: c.id });
          await A.rpc('svy_a_courses_save', { p_id: A.cur.survey.id, p_rows: [r], p_mode: 'merge' }); close(); await A.refresh(); A.renderSurvey();
        } catch (er) { A.toast(er.message, 'err'); }
      });
    });
  }

  /* ───────────── 배포 인원 ───────────── */
  A.tabs.targets = function (box) {
    var rows = A.ext.tg || (A.ext.tg = A.cur.targets.map(function (t) { return { track: t.track, grade: t.grade, headcount: t.headcount }; }));
    if (A.ext.tgId !== A.cur.survey.id) { A.ext.tgId = A.cur.survey.id; rows = A.ext.tg = A.cur.targets.map(function (t) { return { track: t.track, grade: t.grade, headcount: t.headcount }; }); }
    var total = rows.reduce(function (a, r) { return a + (Number(r.headcount) || 0); }, 0);
    box.innerHTML = '<div class="row" style="margin-bottom:12px"><div><b style="font-size:15px">배포 대상 ' + total + '명</b> <span class="muted">· ' + rows.length + '개 계열·학년</span></div><span class="sp"></span><button class="btn btn-secondary btn-sm" data-act="tgfill">과목 기준으로 행 자동 생성</button><button class="btn btn-secondary btn-sm" data-act="tgadd">' + I('plus', 14) + ' 행 추가</button><button class="btn btn-primary btn-sm" data-act="tgsave">' + I('check', 14) + ' 배포 인원 저장</button></div>' +
      '<div class="panel"><p class="panel-sub" style="margin:0">계열·학년별 배포(대상) 인원을 입력하면 결과 대시보드에서 응답률이 산출됩니다. 엑셀 일괄 등록 양식의 「배포인원」 시트로도 등록할 수 있습니다. 이 탭의 저장은 우측 상단 「저장」과 별개로 즉시 반영됩니다.</p></div>' +
      '<div class="tbl-wrap" style="margin-top:12px"><table class="t"><thead><tr><th>계열</th><th>학년</th><th class="num">배포 인원(명)</th><th></th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (r, i) { return '<tr data-i="' + i + '"><td><input class="fld" data-tf="track" value="' + E(r.track) + '"></td><td><input class="fld" data-tf="grade" value="' + E(r.grade) + '"></td><td class="num"><input class="fld fld-sm" type="number" min="0" data-tf="headcount" value="' + (r.headcount || 0) + '"></td><td><button class="btn btn-ghost btn-sm" data-act="tgdel" style="color:var(--red)">' + I('trash', 14) + '</button></td></tr>'; }).join('') : '<tr><td colspan="4" class="t-empty">행이 없습니다. 「과목 기준으로 행 자동 생성」을 눌러 주십시오.</td></tr>') + '</tbody></table></div>';
    box.oninput = function (e) { var el = e.target.closest('[data-tf]'); if (!el) return; var i = Number(el.closest('[data-i]').getAttribute('data-i')), f = el.getAttribute('data-tf'); rows[i][f] = f === 'headcount' ? Math.max(parseInt(el.value, 10) || 0, 0) : el.value; };
    box.onclick = async function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return; var act = t.getAttribute('data-act');
      if (act === 'tgadd') { rows.push({ track: '', grade: '', headcount: 0 }); A.tabs.targets(box); }
      else if (act === 'tgdel') { rows.splice(Number(t.closest('[data-i]').getAttribute('data-i')), 1); A.tabs.targets(box); }
      else if (act === 'tgfill') { var have = {}; rows.forEach(function (r) { have[r.track + '|' + r.grade] = 1; }); A.cur.courses.filter(function (c) { return c.active; }).forEach(function (c) { var k = c.track + '|' + c.grade; if (!have[k]) { have[k] = 1; rows.push({ track: c.track, grade: c.grade, headcount: 0 }); } }); A.tabs.targets(box); }
      else if (act === 'tgsave') { try { await A.rpc('svy_a_targets_save', { p_id: A.cur.survey.id, p_rows: rows.filter(function (r) { return r.track && r.grade; }) }); await A.refresh(); A.ext.tg = null; A.toast('배포 인원을 저장했습니다.'); A.renderSurvey(); } catch (er) { A.toast(er.message, 'err'); } }
    };
  };

  /* ───────────── 디자인 ───────────── */
  var PRESETS = [
    { n: '스카이 블루 (기본)', t: { primary: '#0EA5E9', headerBg: '#FFFFFF', bg: '#F0F9FF', text: '#202124' } },
    { n: '아세아 블루', t: { primary: '#2347A5', headerBg: '#FFFFFF', bg: '#F2F5FB', text: '#1B1F2A' } },
    { n: '아세아 블루 (진한 헤더)', t: { primary: '#2347A5', headerBg: '#2347A5', bg: '#F2F5FB', text: '#1B1F2A' } },
    { n: '그린', t: { primary: '#16a34a', headerBg: '#FFFFFF', bg: '#F0FDF4', text: '#202124' } },
    { n: '오렌지', t: { primary: '#ea580c', headerBg: '#FFFFFF', bg: '#FFF7ED', text: '#202124' } }
  ];
  function themePreview(theme) {
    var v = SVY.themeVars(theme), style = Object.keys(v).map(function (k) { return k + ':' + v[k]; }).join(';');
    var sc = ensureDef().scales.likert5;
    return '<div class="preview" style="' + style + '"><div class="hdr"><div class="hdr-in"><img class="logo" src="aseasurvey-logo.png" alt=""><span class="hdr-sp"></span><span class="hdr-btn">처음부터</span></div></div><div style="padding:14px">' +
      '<div class="card"><div class="kicker">교과목별 응답지</div><h2 class="title" style="font-size:19px">설문 제목 예시</h2><div class="reward">' + I('gift', 22) + '<div><b>참여 안내</b><br>추첨을 통해 상품을 드립니다.</div></div>' +
      '<div class="q" style="margin-top:10px"><div class="q-label"><span class="q-id">A1</span>수업은 시간표에 맞게 시작된다.</div><div class="opts n5">' + sc.map(function (o, i) { return '<button type="button" class="opt" aria-pressed="' + (i === 1) + '">' + E(o.label) + '</button>'; }).join('') + '</div></div>' +
      '<div class="btn-row"><button class="btn btn-primary">제출하기</button><button class="btn btn-secondary">다음 과목</button></div></div></div></div>';
  }
  A.tabs.design = function (box) {
    var th = A.work.theme = Object.assign({}, SVY.DEFAULT_THEME, A.work.theme || {});
    var ratio = SVY.contrast(th.primary, '#FFFFFF').toFixed(2), hdrDark = SVY.onColor(th.headerBg) === '#FFFFFF';
    box.innerHTML = '<div class="grid g2"><div><div class="panel"><h3>색상</h3><div class="row" style="margin-bottom:8px">' + PRESETS.map(function (p, i) { return '<button class="btn btn-secondary btn-sm" data-act="preset" data-i="' + i + '">' + E(p.n) + '</button>'; }).join('') + '</div>' +
      '<div class="grid g2"><div><label class="f">대표 색상 (버튼·강조)</label><div class="row"><input type="color" data-path="theme.primary"><input class="fld" style="width:110px" data-path="theme.primary"></div></div>' +
      '<div><label class="f">헤더 배경</label><div class="row"><input type="color" data-path="theme.headerBg"><input class="fld" style="width:110px" data-path="theme.headerBg"></div></div>' +
      '<div><label class="f">페이지 배경</label><div class="row"><input type="color" data-path="theme.bg"><input class="fld" style="width:110px" data-path="theme.bg"></div></div>' +
      '<div><label class="f">본문 글자 색</label><div class="row"><input type="color" data-path="theme.text"><input class="fld" style="width:110px" data-path="theme.text"></div></div></div>' +
      '<div class="msg ' + (Number(ratio) >= 2.6 ? '' : 'warn') + '" style="margin-top:12px">' + I('info', 18) + '<div>헤더 배경이 ' + (hdrDark ? '어두워 로고가 <b>흰색</b>으로 자동 전환됩니다.' : '밝아 로고가 <b>원본 색</b>으로 표시됩니다.') + ' 대표 색상 위 글자 대비비는 ' + ratio + ':1 (' + (SVY.onBtn(th.primary) === '#FFFFFF' ? '흰색' : '어두운색') + ' 글자 사용)입니다.</div></div></div>' +
      '<div class="panel"><h3>서체·크기·모양</h3><label class="f">서체</label><select class="fld" data-path="theme.font">' + Object.keys(SVY.FONTS).map(function (k) { return '<option value="' + k + '">' + SVY.FONTS[k].label + '</option>'; }).join('') + '</select>' +
      '<label class="f">글자 크기 배율 (<span id="fsv">' + th.fontScale + '</span>)</label><input type="range" min="0.9" max="1.25" step="0.05" data-path="theme.fontScale">' +
      '<label class="f">모서리 둥글기 (<span id="rv">' + th.radius + '</span>px)</label><input type="range" min="0" max="20" step="1" data-path="theme.radius"><p class="hint">저장소 디자인 기준(12px)을 기본으로 합니다.</p>' +
      '<button class="btn btn-ghost btn-sm" data-act="resettheme" style="margin-top:8px">기본값으로 되돌리기</button></div></div>' +
      '<div><div class="panel" style="position:sticky;top:8px"><h3>미리보기</h3><div id="pv">' + themePreview(th) + '</div></div></div></div>';
    bindPaths(box, function (p, v, el) {
      if (p === 'theme.fontScale') box.querySelector('#fsv').textContent = v; if (p === 'theme.radius') box.querySelector('#rv').textContent = v;
      // 색상 입력 상호 동기화
      box.querySelectorAll('[data-path="' + p + '"]').forEach(function (o) { if (o !== el) o.value = v; });
      SVY.applyTheme(A.work.theme, document.createElement('div')); box.querySelector('#pv').innerHTML = themePreview(A.work.theme);
    });
    box.onclick = function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return; var act = t.getAttribute('data-act');
      if (act === 'preset') { Object.assign(A.work.theme, PRESETS[Number(t.getAttribute('data-i'))].t); A.markDirty(); A.tabs.design(box); }
      else if (act === 'resettheme') { A.work.theme = {}; A.markDirty(); A.tabs.design(box); }
    };
  };

  /* ───────────── 버전 ───────────── */
  function summarize(d) { var n = 0, ids = {}; (d.sections || []).forEach(function (s) { (s.questions || []).forEach(function (q) { n++; ids[q.id] = q.label; }); }); return { n: n, ids: ids, secs: (d.sections || []).length }; }
  A.tabs.versions = function (box) {
    var vs = A.cur.versions, cur = A.cur.survey.version;
    box.innerHTML = '<div class="panel"><h3>다음 저장 메모</h3><p class="panel-sub">문항·디자인을 저장하면 새 버전이 생성됩니다. 변경 내용을 메모해 두면 이력에서 찾기 쉽습니다.</p><input class="fld" id="vn" placeholder="예: 2학기 설문 문항 수정(B7 삭제)" value="' + E(A.saveNote || '') + '"></div>' +
      '<div class="tbl-wrap" style="margin-top:12px"><table class="t"><thead><tr><th>버전</th><th>저장 일시</th><th>메모</th><th></th></tr></thead><tbody>' + vs.map(function (v) {
        return '<tr><td><b>v' + v.version + '</b>' + (v.version === cur ? ' <span class="badge badge-green">현재</span>' : '') + '</td><td>' + A.fmt(v.saved_at) + '</td><td class="wrapcell">' + E(v.note || '') + '</td><td>' + (v.version === cur ? '' : '<button class="btn btn-secondary btn-sm" data-act="vcmp" data-v="' + v.version + '">비교</button><button class="btn btn-ghost btn-sm" data-act="vrest" data-v="' + v.version + '">이 버전으로 복원</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    box.querySelector('#vn').oninput = function () { A.saveNote = this.value; };
    box.onclick = async function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return; var v = Number(t.getAttribute('data-v')), act = t.getAttribute('data-act');
      try {
        var r = await A.rpc('svy_a_version_get', { p_id: A.cur.survey.id, p_version: v });
        if (act === 'vcmp') {
          var a = summarize(r.def), b = summarize(A.cur.survey.def), add = Object.keys(b.ids).filter(function (k) { return !(k in a.ids); }), del = Object.keys(a.ids).filter(function (k) { return !(k in b.ids); }), chg = Object.keys(a.ids).filter(function (k) { return k in b.ids && a.ids[k] !== b.ids[k]; });
          A.modal('<h3>v' + v + ' ↔ 현재(v' + cur + ') 비교</h3><p class="muted">v' + v + ': 영역 ' + a.secs + '개 · 문항 ' + a.n + '개 / 현재: 영역 ' + b.secs + '개 · 문항 ' + b.n + '개</p>' +
            (add.length ? '<p><span class="badge badge-green">현재에 추가됨</span> ' + add.map(E).join(', ') + '</p>' : '') + (del.length ? '<p><span class="badge badge-red">현재에서 삭제됨</span> ' + del.map(E).join(', ') + '</p>' : '') + (chg.length ? '<p><span class="badge badge-amber">내용 변경</span> ' + chg.map(function (k) { return E(k) + ': ' + E(String(a.ids[k]).slice(0, 40)) + ' → ' + E(String(b.ids[k]).slice(0, 40)); }).join('<br>') + '</p>' : '') +
            (!add.length && !del.length && !chg.length ? '<p>문항 구성은 동일합니다. (안내문·디자인만 다를 수 있습니다.)</p>' : '') + '<div class="btn-row"><button class="btn btn-primary" data-r="1">닫기</button></div>', function (bg, close) { bg.addEventListener('click', function (ev) { if (ev.target.closest('[data-r]')) close(); }); }, 'wide');
        } else if (act === 'vrest') {
          if (await A.confirm('v' + v + ' 복원', '문항·안내문·디자인을 v' + v + ' 내용으로 되돌립니다. 우측 상단 「저장」을 눌러야 새 버전으로 반영됩니다.', '복원', '취소')) { A.work.def = r.def; A.work.theme = r.theme; A.saveNote = 'v' + v + ' 복원'; A.markDirty(); A.go('questions'); }
        }
      } catch (er) { A.toast(er.message, 'err'); }
    };
  };
})();
