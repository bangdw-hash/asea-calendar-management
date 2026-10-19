'use strict';
/**
 * aseasurvey-admin-audit.js — 배포 전 점검(감사) 탭
 *  · 규칙 점검(즉시·AI 없음): 연동 목록 데이터(과목·담당자·대상 인원), 문항 중복·유사, 누락, 분기 조건 논리, 퀴즈·추첨·정원·개인정보·일정 설정, 응답 부담
 *  · AI 정밀 점검: 설계 전체(문항·설정·연동 데이터 통계)를 AI 감사관이 읽고 규칙으로 잡기 어려운 중복·누락·모순·표현 문제를 지적
 *  · 결과는 오류(배포 전 해결) / 주의 / 참고 로 나누고, 해당 문항·탭으로 바로 이동하거나 누락 문항은 「AI 구간 설계」로 이어갑니다.
 *  · 정식 시작(배포) 직전에도 규칙 점검 결과를 확인 항목으로 보여 줍니다.
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico;
  var Au = A.audit = {}, ST = {};            // ST[surveyId] = { local, ai, sig, busy, err, at }
  var CATS = ['연동성', '중복성', '누락성', '논리', '설정', '개인정보', '표현', '응답 부담'];
  var SEV = { err: ['오류', 'badge-red'], warn: ['주의', 'badge-amber'], info: ['참고', 'badge-gray'] };

  /* ───────────── 공통 유틸 ───────────── */
  function norm(s) { return String(s || '').toLowerCase().replace(/[\s .,;:!?()\[\]{}<>"'`~·ㆍ\-_/\\]+/g, ''); }
  function grams(s) { var n = norm(s), g = {}; for (var i = 0; i < n.length - 1; i++) g[n.substr(i, 2)] = 1; return g; }
  function jac(a, b) { var ka = Object.keys(a), kb = Object.keys(b); if (!ka.length || !kb.length) return 0; var inter = ka.filter(function (k) { return b[k]; }).length; return inter / (ka.length + kb.length - inter); }
  function allQs(d) { var out = []; (d.basic || []).forEach(function (q, i) { out.push({ q: q, si: -1, qi: i, sec: '기본 정보', order: out.length }); }); (d.sections || []).forEach(function (s, si) { (s.questions || []).forEach(function (q, qi) { out.push({ q: q, si: si, qi: qi, sec: s.title || ('영역 ' + (si + 1)), order: out.length }); }); }); return out; }
  function refsOf(c, out) { out = out || []; if (!c) return out; if (c.all || c.any) { (c.all || c.any).forEach(function (x) { refsOf(x, out); }); } else if (c.q) out.push(c); return out; }
  function lab(q) { return q.type === 'block' ? (q.text || '(안내)') : (q.label || '(내용 없음)'); }
  function short(s, n) { s = String(s || ''); return s.length > (n || 40) ? s.slice(0, n || 40) + '…' : s; }
  function ctx() {
    var d = A.work.def, lk = SVY.linkInfo(d), cs = (A.cur.courses || []).filter(function (c) { return c.active; });
    return { d: d, lk: lk, cs: cs, tg: A.cur.targets || [], item: A.cur.item || {}, w: A.work, course: d.mode !== 'general' };
  }

  /* ───────────── 규칙 점검 ───────────── */
  Au.local = function () {
    var C = ctx(), d = C.d, F = [], n = 0, qs = allQs(d), real = qs.filter(function (x) { return x.q.type !== 'block'; });
    function add(sev, cat, title, detail, o) { F.push(Object.assign({ id: 'r' + (++n), sev: sev, cat: cat, src: '규칙', title: title, detail: detail || '' }, o || {})); }
    var lint = A.lintDef(d); lint.errs.forEach(function (m) { var mm = /^\[([^\]]+)\]/.exec(m); add('err', '논리', '문항 점검 오류', m, mm ? { qids: [mm[1]], tab: 'questions' } : { tab: 'questions' }); });

    /* ── 연동성 (연동 목록 · 대상 인원) ── */
    if (C.course) {
      var u = C.lk.unit, cl = C.lk.cols;
      if (!C.cs.length) add('err', '연동성', u + ' 목록이 비어 있습니다', '학생이 선택할 대상이 없어 응답할 수 없습니다. 「' + u + ' 목록」 탭에서 엑셀 양식을 올려 등록해 주십시오.', { tab: 'courses' });
      else {
        var ex = C.cs.filter(function (c) { return /^\s*[(（]?\s*예시/.test(c.name) || /^\s*[(（]?\s*예시/.test(c.track); });
        if (ex.length) add('err', '연동성', '예시 행이 등록되어 있습니다', '「(예시)」로 시작하는 ' + ex.length + '건: ' + ex.slice(0, 3).map(function (c) { return c.name; }).join(', '), { tab: 'courses' });
        if (cl.prof.use) { var np = C.cs.filter(function (c) { return !c.prof; }); if (np.length) add('warn', '연동성', cl.prof.label + ' 미입력 ' + np.length + '건', '담당자별 집계에서 제외됩니다. 예: ' + np.slice(0, 3).map(function (c) { return c.name; }).join(', ') + (np.length > 3 ? ' 외' : ''), { tab: 'courses' }); }
        if (cl.kind.use && C.cs.every(function (c) { return !c.kind; })) add('info', '연동성', cl.kind.label + ' 열을 사용 중이나 값이 모두 비어 있습니다', '사용하지 않을 열이면 설계에서 끄는 편이 깔끔합니다.', { tab: 'courses' });
        var nm = {}; C.cs.forEach(function (c) { var k = norm(c.name); (nm[k] = nm[k] || {})[c.name] = 1; });
        Object.keys(nm).forEach(function (k) { var v = Object.keys(nm[k]); if (v.length > 1) add('warn', '연동성', '같은 이름의 표기가 다릅니다', v.map(function (x) { return '「' + x + '」'; }).join(' / ') + ' — 띄어쓰기·기호 차이로 결과가 나뉠 수 있습니다.', { tab: 'courses' }); });
        var long = C.cs.filter(function (c) { return c.name.length > 40; }); if (long.length) add('warn', '연동성', '이름이 너무 긴 항목 ' + long.length + '건', '학생 화면에서 줄바꿈이 많아질 수 있습니다: ' + short(long[0].name, 30), { tab: 'courses' });
        var gk = {}; C.cs.forEach(function (c) { var k = [c.track, c.grade, c.klass].join('|'); gk[k] = (gk[k] || 0) + 1; });
        var gs = Object.keys(gk).map(function (k) { return gk[k]; }), mx = Math.max.apply(null, gs), mn = Math.min.apply(null, gs);
        if (gs.length > 1 && mx >= 3 * Math.max(mn, 1) && mx - mn >= 6) add('info', '연동성', '선택 단위별 항목 수 편차가 큽니다', '가장 적은 곳 ' + mn + '개 ~ 가장 많은 곳 ' + mx + '개. 누락 등록이 없는지 확인해 주십시오.', { tab: 'courses' });
        if (cl.track.use && cl.grade.use) {
          var tkeys = {}; C.tg.forEach(function (t) { tkeys[t.track + '|' + t.grade] = t; }); var ckeys = {}; C.cs.forEach(function (c) { ckeys[c.track + '|' + c.grade] = 1; });
          var miss = Object.keys(ckeys).filter(function (k) { return !tkeys[k] || !tkeys[k].headcount; });
          if (miss.length) add('info', '연동성', '배포 대상 인원이 없는 묶음 ' + miss.length + '개', miss.slice(0, 4).map(function (k) { return k.replace('|', ' '); }).join(', ') + ' — 응답률이 계산되지 않습니다. (필요 없으면 무시)', { tab: 'targets' });
          var orphan = Object.keys(tkeys).filter(function (k) { return !ckeys[k]; });
          if (orphan.length) add('warn', '연동성', '목록에 없는 대상 인원 행 ' + orphan.length + '개', orphan.slice(0, 4).map(function (k) { return k.replace('|', ' '); }).join(', ') + ' — 이름이 목록과 다르면 응답률이 어긋납니다.', { tab: 'targets' });
        }
      }
    }

    /* ── 중복성 ── */
    var seen = {}, gcache = real.map(function (x) { return { x: x, g: grams(lab(x.q)) }; });
    real.forEach(function (x) { var k = norm(lab(x.q)); if (!k) return; if (seen[k]) add('warn', '중복성', '같은 문구의 문항이 두 번 있습니다', '[' + seen[k].q.id + '] 와 [' + x.q.id + '] 「' + short(lab(x.q), 50) + '」', { qids: [seen[k].q.id, x.q.id], tab: 'questions' }); else seen[k] = x; });
    for (var i = 0; i < gcache.length; i++) for (var j = i + 1; j < gcache.length; j++) {
      var a = gcache[i].x.q, b = gcache[j].x.q; if (norm(lab(a)) === norm(lab(b))) continue;
      if (norm(lab(a)).length >= 6 && jac(gcache[i].g, gcache[j].g) >= 0.75) add('info', '중복성', '비슷한 문항이 있습니다', '[' + a.id + '] 「' + short(lab(a), 40) + '」 ≈ [' + b.id + '] 「' + short(lab(b), 40) + '」 — 같은 내용을 두 번 묻는지 확인해 주십시오.', { qids: [a.id, b.id], tab: 'questions' });
    }
    var st = {}; (d.sections || []).forEach(function (s, si) { var k = norm(s.title); if (!k) return; if (st[k] != null) add('info', '중복성', '같은 제목의 영역이 있습니다', '영역 ' + (st[k] + 1) + ' 과 영역 ' + (si + 1) + ' 「' + short(s.title, 30) + '」', { tab: 'questions' }); else st[k] = si; });
    real.forEach(function (x) { var q = x.q; if (q.options) { var o = {}; q.options.forEach(function (p) { var k = norm(p.label); if (!k) return; if (o[k]) add('warn', '중복성', '[' + q.id + '] 선택지가 중복됩니다', '「' + p.label + '」', { qids: [q.id], tab: 'questions' }); o[k] = 1; }); } });

    /* ── 누락성 ── */
    if (!real.length) add('err', '누락성', '문항이 없습니다', '응답을 받을 문항을 추가해 주십시오.', { tab: 'questions' });
    (d.sections || []).forEach(function (s, si) { if (!(s.questions || []).length) add('warn', '누락성', '문항이 없는 영역: ' + (s.title || '영역 ' + (si + 1)), '비어 있는 영역은 학생 화면에서 빈 쪽으로 보입니다. 삭제하거나 문항을 채워 주십시오.', { tab: 'questions' }); });
    var i0 = d.intro || {}; if (!String(i0.title || '').trim()) add('err', '누락성', '설문 제목이 없습니다', '「안내문」 탭에서 제목을 입력해 주십시오.', { tab: 'intro' });
    if (!(i0.notice || []).length) add('info', '누락성', '안내 항목(목적·대상·소요 시간 등)이 없습니다', '학생이 시작 전에 읽을 안내가 없습니다.', { tab: 'intro' });
    if (!i0.timeNote) add('info', '누락성', '소요 시간 안내가 없습니다', '응답 부담을 미리 알리면 이탈이 줄어듭니다.', { tab: 'intro' });
    if (real.length >= 5 && !real.some(function (x) { return x.q.type === 'text'; })) add('info', '누락성', '자유 의견(서술) 문항이 없습니다', '개선 의견을 받을 수 있도록 서술 문항 1개를 두는 것을 권장합니다.', { tab: 'questions', suggest: '마지막에 개선할 점이나 하고 싶은 말을 묻는 서술 문항 1개' });
    var lastS = (d.sections || [])[d.sections.length - 1]; if (lastS && (lastS.questions || []).length && !/[?？]$|십시오|주세요|바랍니다|입니까|까$/.test('')) { /* 문구 규칙은 AI 점검에 맡김 */ }
    if (C.course) {
      var perC = real.filter(function (x) { return x.q.scope !== 'common' && x.si >= 0; }).length; if (!perC) add('err', '누락성', '항목별로 응답할 문항이 없습니다', '이 설문은 연동 목록 항목마다 응답하는 방식인데 해당 문항이 없습니다. 영역 문항의 응답 방식을 확인해 주십시오.', { tab: 'questions' });
    }

    /* ── 논리 (분기 조건) ── */
    var pos = {}; qs.forEach(function (x) { pos[x.q.id] = x; });
    function checkCond(c, owner, ownerOrder, qids, where) {
      refsOf(c).forEach(function (r) {
        var t = pos[r.q];
        if (!t) return add('err', '논리', where + ': 존재하지 않는 문항을 조건으로 사용', '조건이 가리키는 [' + r.q + '] 문항이 없습니다.', { qids: qids, tab: 'questions' });
        if (t.order >= ownerOrder) return add('err', '논리', where + ': 뒤쪽 문항을 조건으로 사용', '[' + r.q + '] 는 이 문항보다 뒤에 있어 응답을 알 수 없습니다.', { qids: qids, tab: 'questions' });
        var tq = t.q, opts = (tq.options || []).map(function (o) { return o.id; });
        if ((tq.type === 'single' || tq.type === 'multi') && (r.op === 'eq' || r.op === 'ne' || r.op === 'has' || r.op === 'nhas') && r.v != null && opts.indexOf(r.v) < 0) add('err', '논리', where + ': 존재하지 않는 선택지 값', '[' + r.q + '] 에 선택지 「' + r.v + '」 가 없어 이 조건은 항상 거짓입니다.', { qids: qids, tab: 'questions' });
        if (tq.type === 'block') add('warn', '논리', where + ': 안내 블록은 조건으로 쓸 수 없습니다', '[' + r.q + ']', { qids: qids, tab: 'questions' });
      });
    }
    (d.sections || []).forEach(function (s, si) { if (s.showIf) { var first = (s.questions || [])[0], ord = first ? pos[first.id].order : (qs.length ? qs[qs.length - 1].order + 1 : 0); checkCond(s.showIf, s, ord, first ? [first.id] : [], '영역 「' + short(s.title, 20) + '」'); } });
    qs.forEach(function (x) { if (x.q.showIf) checkCond(x.q.showIf, x.q, x.order, [x.q.id], '[' + x.q.id + ']'); });
    // 필수 + 조건부 선행 문항이 선택 문항
    qs.forEach(function (x) { if (x.q.showIf && x.q.required) refsOf(x.q.showIf).forEach(function (r) { var t = pos[r.q]; if (t && !t.q.required && r.op !== 'answered' && false) add('info', '논리', '선택 문항을 조건으로 사용', '[' + r.q + ']'); }); });

    /* ── 설정 · 퀴즈 · 추첨 · 정원 · 일정 ── */
    var gradable = real.filter(function (x) { return x.q.answer != null && x.q.answer !== ''; });
    if (d.quiz && d.quiz.show === 'score') {
      if (!gradable.length) add('err', '설정', '점수 표시가 켜져 있으나 정답이 지정된 문항이 없습니다', '문항의 정답을 지정하거나 점수 표시를 끄십시오.', { tab: 'questions' });
      var tot = gradable.reduce(function (a, x) { return a + (Number(x.q.points) || 1); }, 0);
      if (d.quiz.passScore != null && d.quiz.passScore > tot) add('err', '설정', '통과 기준 점수(' + d.quiz.passScore + ')가 만점(' + tot + ')보다 큽니다', '아무도 통과할 수 없습니다.', { tab: 'questions' });
    } else if (gradable.length) add('warn', '설정', '정답이 지정된 문항 ' + gradable.length + '개가 있으나 점수 표시가 꺼져 있습니다', '학생에게 점수가 보이지 않습니다. 의도한 설정인지 확인해 주십시오.', { qids: gradable.slice(0, 5).map(function (x) { return x.q.id; }), tab: 'questions' });
    gradable.forEach(function (x) { var q = x.q; if (q.options && q.type === 'single' && q.options.map(function (o) { return o.id; }).indexOf(q.answer) < 0) add('err', '논리', '[' + q.id + '] 정답이 선택지에 없습니다', '정답 값 「' + q.answer + '」', { qids: [q.id], tab: 'questions' }); });
    var tk = d.features && d.features.ticket != null ? !!d.features.ticket : C.course;
    if (SVY.integ.cfg(d).on) add('info', '설정', '영역별 무작위 성실 응답 확인이 켜져 있습니다 (' + SVY.integ.cfg(d).sections.length + '개 영역)', '서버 검증에 DB 12단계(db/survey_schema_12.sql) 설치가 필요합니다. 설치 전에는 확인 문항의 정답 여부가 집계되지 않습니다.', { tab: 'questions' });
    if (tk && !SVY.integ.cfg(d).on && !real.some(function (x) { return x.q.check && x.q.check.valid != null; })) add('info', '설정', '추첨번호를 발급하지만 성실응답 점검 문항이 없습니다', '추첨 시 불성실 응답을 걸러낼 수 없습니다. (선택)', { tab: 'questions' });
    if (d.limit && d.limit.max) { var sumMax = 0, anyMax = false; real.forEach(function (x) { (x.q.options || []).forEach(function (o) { if (o.max != null) { anyMax = true; } }); }); if (anyMax) add('info', '설정', '선착순 인원과 선택지 정원이 함께 설정되어 있습니다', '둘 중 먼저 차는 쪽에서 마감됩니다.', { tab: 'questions' }); }
    var w = C.w; if (w.open_at && w.close_at && new Date(w.open_at) >= new Date(w.close_at)) add('err', '설정', '응답 시작 일시가 마감 일시보다 늦습니다', '일정을 확인해 주십시오.', { tab: 'overview' });
    if (w.close_at && new Date(w.close_at) < new Date() && w.status !== 'closed') add('warn', '설정', '마감 일시가 이미 지났습니다', '지금 배포해도 학생은 응답할 수 없습니다.', { tab: 'overview' });
    if (!w.close_at) add('info', '설정', '응답 마감 일시가 없습니다', '직접 마감하기 전까지 계속 응답을 받습니다.', { tab: 'overview' });
    if (w.test_mode) add('warn', '설정', '테스트 모드가 켜져 있습니다', '「정식 시작」으로 테스트 응답을 지우고 테스트 모드를 해제해야 실제 응답이 집계됩니다.', { tab: 'overview' });
    if (A.isDirty()) add('warn', '설정', '저장하지 않은 변경 사항이 있습니다', '점검은 현재 편집 중인 내용 기준입니다. 저장 후 배포해 주십시오.', { tab: 'overview' });

    if (C.course && C.cs.some(function (c) { return c.prof; })) add('info', '개인정보', '학생 화면에 담당자(교수) 이름이 과목과 함께 표시됩니다', '등록된 담당자 이름은 학생 화면에 그대로 표시됩니다. 안내문의 익명성(응답이 담당 교수에게 개별 제공되지 않음) 설명과 어긋나지 않는지 확인해 주십시오.', { tab: 'courses' });
    /* ── 개인정보 ── */
    var PII = /(이름|성명|연락처|전화|휴대폰|핸드폰|이메일|e-?mail|주소|생년월일|주민|학번|사번)/i, hasConsent = real.some(function (x) { return x.q.type === 'consent'; });
    var pii = real.filter(function (x) { return PII.test(lab(x.q)) || x.q.type === 'address' || x.q.type === 'signature' || (x.q.type === 'text' && /phone|email/.test(x.q.format || '')); });
    if (pii.length && !hasConsent) add(C.course ? 'warn' : 'err', '개인정보', '개인정보를 묻는 문항이 있으나 수집·이용 동의 문항이 없습니다', pii.slice(0, 4).map(function (x) { return '[' + x.q.id + '] ' + short(lab(x.q), 24); }).join(', '), { qids: pii.slice(0, 4).map(function (x) { return x.q.id; }), tab: 'questions', suggest: '개인정보 수집·이용 동의(목적·항목·보유 기간 명시) 문항 1개' });
    if (C.course && pii.length) add('warn', '개인정보', '과목별(목록) 설문은 익명을 원칙으로 합니다', '개인 식별 정보 문항이 포함되어 있습니다. 꼭 필요한지 확인해 주십시오.', { qids: pii.slice(0, 4).map(function (x) { return x.q.id; }), tab: 'questions' });
    if (d.identity === 'named' && !hasConsent) add('err', '개인정보', '기명 설문인데 동의 문항이 없습니다', '「응답자 식별 방식」을 기명으로 하면 동의 문항이 필요합니다.', { tab: 'questions' });

    /* ── 표현 ── */
    real.forEach(function (x) { var l = String(lab(x.q)).trim(); if (l.length > 140) add('info', '표현', '[' + x.q.id + '] 문항 문구가 깁니다 (' + l.length + '자)', '모바일에서 읽기 어렵습니다. 보조 설명(desc)으로 나누는 것을 고려해 주십시오.', { qids: [x.q.id], tab: 'questions' }); else if (l.length && l.length < 4) add('info', '표현', '[' + x.q.id + '] 문항 문구가 너무 짧습니다', '「' + l + '」', { qids: [x.q.id], tab: 'questions' }); if (/\s{2,}|[ㅠㅜㅋㅎ]{2,}/.test(l)) add('info', '표현', '[' + x.q.id + '] 문구에 공백·자음 반복이 있습니다', '「' + short(l, 40) + '」', { qids: [x.q.id], tab: 'questions' }); });

    /* ── 응답 부담: 문항 형식별 평균 응답 시간(추정)을 합산 ── */
    function qMin(q) {
      var t = q.type;
      if (t === 'text') return (q.required ? 0.4 : 0.2) + (q.multiline ? 0.2 : 0);
      if (t === 'multi') return 0.2;
      if (t === 'ranking' || t === 'constsum') return 0.4;
      if (t === 'grid') return (q.rows ? q.rows.length : 3) * 0.1;
      if (t === 'single') return (q.options || []).length > 6 ? 0.15 : 0.1;
      if (t === 'scale' || t === 'rating' || t === 'nps' || t === 'linear' || t === 'slider' || t === 'date' || t === 'time') return 0.1;
      if (t === 'consent') return 0.1;
      return 0.4;
    }
    function rng(m) { return Math.max(1, Math.round(m * 0.7)) + '~' + Math.max(1, Math.round(m * 1.3)); }
    var BASIS = '문항 형식별 평균 시간(5점 척도 약 6초, 복수선택 약 12초, 서술형 약 12~24초 등)을 합산한 추정치이며 ±30% 정도 차이가 날 수 있습니다. 실제 시간은 테스트 응답으로 확인해 주십시오.';
    var base = 0.5, tn = String((d.intro && d.intro.timeNote) || '');
    if (C.course && C.cs.length) {
      var perClass = {}; C.cs.forEach(function (c) { var k = [c.track, c.grade, c.klass].join('|'); perClass[k] = (perClass[k] || 0) + 1; });
      var cnts = Object.keys(perClass).map(function (k) { return perClass[k]; }), maxItems = Math.max.apply(null, cnts), minItems = Math.min.apply(null, cnts);
      var pcq = real.filter(function (x) { return x.q.scope !== 'common' && x.si >= 0; }), pcm = pcq.reduce(function (a, x) { return a + qMin(x.q); }, 0);
      var cm = real.filter(function (x) { return !(x.q.scope !== 'common' && x.si >= 0); }).reduce(function (a, x) { return a + qMin(x.q); }, 0) + base;
      var midMax = cm + pcm * maxItems, midMin = cm + pcm * minItems, ref = /(\d+)\s*[~\-]\s*(\d+)\s*분/.exec(tn);
      add(midMax > 20 ? 'warn' : 'info', '응답 부담', '예상 응답 시간 약 ' + rng(midMax) + '분 (과목이 가장 많은 반 기준, 추정)', '과목당 약 ' + (Math.round(pcm * 10) / 10) + '분 × 최대 ' + maxItems + '개 + 공통·시작 약 ' + (Math.round(cm * 10) / 10) + '분. 반별 중간값은 약 ' + Math.round(midMin) + '~' + Math.round(midMax) + '분입니다. ' + (ref ? '안내문의 「' + ref[0] + '」은 과목당 시간이며 추정(' + (Math.round(pcm * 10) / 10) + '분)과 ' + (pcm >= Number(ref[1]) - 0.5 && pcm <= Number(ref[2]) + 0.5 ? '비슷합니다. ' : '차이가 있습니다. ') : '') + BASIS, { tab: 'questions' });
    } else if (real.length) {
      var mid = real.reduce(function (a, x) { return a + qMin(x.q); }, 0) + base;
      add(mid > 15 ? 'warn' : 'info', '응답 부담', '문항 ' + real.length + '개 · 예상 응답 시간 약 ' + rng(mid) + '분 (추정)', (mid > 15 ? '분량이 많으면 이탈이 늘 수 있습니다. ' : '') + BASIS, { tab: 'questions' });
    }
    return F;
  };

  /* ───────────── AI 정밀 점검 ───────────── */
  function models() { return [(A.ext.aiModels[0] || [])[0]].concat(A.ext.aiModels.map(function (m) { return m[0]; })).filter(function (m, i, a) { return m && a.indexOf(m) === i; }); }
  async function ask(system, text) {
    var out = null, err, ms = models();
    for (var i = 0; i < ms.length && out == null; i++) { try { out = await A.ext.aiCall(system, [{ type: 'text', text: text }], ms[i]); } catch (e) { err = e; if (!(e.status === 404 || /model/i.test(e.message))) break; } }
    if (out == null) throw err;
    var s = String(out).trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim(), a = s.indexOf('{'); if (a > 0) s = s.slice(a);
    try { return JSON.parse(s); } catch (e) { var b = s.lastIndexOf('}'); if (b > 0) { try { return JSON.parse(s.slice(0, b + 1)); } catch (e2) {} } throw new Error('AI 응답을 해석하지 못했습니다. 다시 시도해 주십시오.'); }
  }
  var SYS = '당신은 직업전문학교 교육운영팀의 설문 「배포 전 감사관」입니다. 설계된 설문(문항·분기·설정)과 연동 목록 데이터 통계를 읽고, 학생에게 배포하기 전에 고쳐야 할 문제를 찾습니다. 관리자가 결과를 읽고 직접 판단하므로 근거 없는 단정을 하지 않습니다.\n' +
    '점검 관점: ① 연동성(연동 목록의 열 구성·값과 문항·안내문이 맞는지: 예를 들어 문항이 목록에 없는 대상을 전제하거나, 담당자·구분 데이터가 비어 집계가 불가능한지) ② 중복성(같은 내용을 다른 말로 다시 묻는 문항, 선택지 겹침) ③ 누락성(설문 목적·안내문에 비해 빠진 핵심 문항, 응답 후 분석에 필요한데 묻지 않은 것, 선택지 「기타」 누락, 척도 방향 불일치) ④ 논리(분기 조건이 도달 불가능하거나 모순, 필수 문항이 숨겨져 응답 불가, 퀴즈 정답·배점 오류) ⑤ 개인정보(불필요한 식별 정보, 동의 누락) ⑥ 표현(유도 질문, 한 문항에 두 가지를 묻는 이중 질문, 모호·전문 용어, 안내문과 실제 문항의 불일치) ⑦ 응답 부담.\n' +
    '이미 [규칙 점검 결과]에 있는 내용은 반복하지 말고, 규칙으로 잡기 어려운 것 위주로 지적합니다. 입력에 없는 사실을 지어내지 않으며, 불확실하면 detail 에 「추정」이라고 밝힙니다. 문항을 언급할 때는 qids 에 문항 id 를 넣습니다.\n' +
    '출력은 JSON 객체 하나만 작성합니다(설명·코드펜스 금지): {"verdict":"배포 가능|수정 후 배포|배포 보류","summary":"전체 평가 2~3문장","findings":[{"sev":"error|warn|info","cat":"연동성|중복성|누락성|논리|개인정보|표현|응답 부담","title":"한 줄 제목","detail":"무엇이 왜 문제인지(사실)와 영향","fix":"권장 조치","qids":["문항id"],"tab":"questions|courses|targets|overview|intro"}],"missing":[{"title":"빠진 문항 제안","why":"이유","prompt":"AI 구간 설계에 그대로 넣을 요청문"}]}\n' +
    'findings 는 중요도 순 최대 15개, missing 은 0~4개입니다. 문제가 없으면 findings 를 비우고 verdict 를 「배포 가능」으로 합니다.';
  function payload(local) {
    var C = ctx(), d = C.d, qs = allQs(d);
    function qline(x) { var q = x.q; return '  [' + q.id + '] ' + SVY.typeLabel(q) + (q.scope === 'common' && C.course ? '·공통' : '') + ' · ' + lab(q) + (q.required ? ' (필수)' : '') + (q.options ? ' · 선택지: ' + q.options.map(function (o) { return o.id + '=' + o.label + (o.max != null ? '(정원' + o.max + ')' : ''); }).join(' / ') : '') + (q.showIf ? ' · 조건: ' + JSON.stringify(q.showIf) : '') + (q.answer != null ? ' · 정답: ' + JSON.stringify(q.answer) + '/' + (q.points || 1) + '점' : ''); }
    var lines = []; var groups = [{ si: -1, name: '기본 정보' }].concat((d.sections || []).map(function (s, i) { return { si: i, name: '영역 ' + (i + 1) + ' 「' + (s.title || '') + '」' + (s.showIf ? ' (조건부: ' + JSON.stringify(s.showIf) + ')' : '') + (s.note ? ' — ' + s.note : '') }; }));
    groups.forEach(function (g) { var l = qs.filter(function (x) { return x.si === g.si; }); lines.push('■ ' + g.name); lines.push(l.length ? l.map(qline).join('\n') : '  (문항 없음)'); });
    var data = '(해당 없음 — 1인 1회 설문)';
    if (C.course) {
      var cols = SVY.LINK_KEYS.map(function (k) { return k + '=' + C.lk.cols[k].label + (C.lk.cols[k].use ? '' : '(미사용)'); }).join(', ');
      var per = {}; C.cs.forEach(function (c) { var k = [c.track, c.grade, c.klass].filter(function (v) { return v && v !== '-'; }).join(' '); (per[k] = per[k] || []).push(c.name + (c.prof ? '·' + c.prof : '')); });
      data = '목록 이름: ' + C.lk.unit + ' / 열: ' + cols + '\n등록 ' + C.cs.length + '건, 담당자 미입력 ' + C.cs.filter(function (c) { return !c.prof; }).length + '건, 배포 대상 인원 행 ' + C.tg.length + '개\n선택 단위별 항목(최대 25단위, 단위당 최대 8개):\n' + Object.keys(per).slice(0, 25).map(function (k) { return '  ' + (k || '(단일)') + ': ' + per[k].slice(0, 8).join(', ') + (per[k].length > 8 ? ' 외 ' + (per[k].length - 8) + '건' : ''); }).join('\n');
    }
    return '[설문 제목] ' + ((d.intro && d.intro.title) || '') + '\n[응답 방식] ' + (C.course ? '목록 항목별 반복 (연동 목록에서 대상을 고르고 항목마다 응답)' : '1인 1회') + '\n[안내문] ' + JSON.stringify(d.intro || {}).slice(0, 1500) + '\n[설정] ' + JSON.stringify({ limit: d.limit, quiz: d.quiz, features: d.features, identity: d.identity, layout: d.layout, open_at: C.w.open_at, close_at: C.w.close_at, test_mode: C.w.test_mode, 응답수: C.item.responses }) + '\n[연동 목록 데이터]\n' + data + '\n[설문 구조]\n' + lines.join('\n') + '\n[규칙 점검 결과(반복 금지)]\n' + (local.length ? local.map(function (f) { return '- (' + SEV[f.sev][0] + '/' + f.cat + ') ' + f.title; }).join('\n') : '(없음)');
  }
  function sig() { return JSON.stringify([A.work.def, A.work.open_at, A.work.close_at, A.work.test_mode, (A.cur.courses || []).length, (A.cur.targets || []).length]); }
  function state() { var id = A.cur.survey.id; return ST[id] || (ST[id] = { local: null, ai: null, sig: '', busy: '', err: '' }); }
  Au.run = function () { var s = state(); s.local = Au.local(); s.sig = sig(); s.at = new Date(); return s; };
  Au.ran = function () { try { var s = ST[A.cur.survey.id]; return !!(s && s.local); } catch (e) { return false; } };
  Au.quick = function () { var f = Au.local(); return { errs: f.filter(function (x) { return x.sev === 'err'; }), warns: f.filter(function (x) { return x.sev === 'warn'; }), all: f }; };

  /* ───────────── 화면 ───────────── */
  function findingHtml(f, i, key) {
    var s = SEV[f.sev];
    return '<div class="afind ' + f.sev + '"><div class="row"><span class="badge ' + s[1] + '">' + s[0] + '</span><b class="sp">' + E(f.title) + '</b><span class="tag">' + E(f.src) + '</span></div>' +
      (f.detail ? '<div class="muted" style="font-size:13px;margin-top:4px;white-space:pre-line">' + E(f.detail) + '</div>' : '') + (f.fix ? '<div style="font-size:13px;margin-top:4px"><b>권장 조치</b> ' + E(f.fix) + '</div>' : '') +
      '<div class="row" style="margin-top:6px">' + ((f.qids || []).slice(0, 4).map(function (q) { return '<button class="btn btn-secondary btn-sm" data-au="goq" data-q="' + E(q) + '">' + I('edit', 12) + ' ' + E(q) + ' 문항</button>'; }).join('')) + (f.tab && !(f.qids || []).length ? '<button class="btn btn-secondary btn-sm" data-au="gotab" data-t="' + E(f.tab) + '">해당 탭으로 이동</button>' : '') + (f.suggest ? '<button class="btn btn-primary btn-sm" data-au="slot" data-p="' + E(f.suggest) + '">' + I('sparkle', 12) + ' AI 구간 설계로 채우기</button>' : '') + '</div></div>';
  }
  function render(box) {
    var s = state(); if (!s.local) Au.run();
    var stale = s.sig !== sig(), loc = s.local, ai = (s.ai && s.ai.findings) || [], all = loc.concat(ai);
    var cnt = { err: 0, warn: 0, info: 0 }; all.forEach(function (f) { cnt[f.sev]++; });
    var verdict = cnt.err ? ['배포 보류 — 오류를 먼저 해결해 주십시오', 'err'] : cnt.warn ? ['확인 후 배포 — 주의 항목을 검토해 주십시오', 'warn'] : ['점검 통과 — 배포 가능', 'ok'];
    var h = '<div class="pg-head" style="margin-top:0"><h2 style="margin:0">배포 전 점검</h2><span class="sp"></span><button class="btn btn-secondary btn-sm" data-au="rerun">' + I('refresh', 14) + ' 규칙 점검 다시 실행</button><button class="btn btn-primary btn-sm" data-au="ai" ' + (s.busy ? 'disabled' : '') + '>' + I('sparkle', 14) + ' AI 정밀 점검' + (s.ai ? ' 다시 실행' : '') + '</button><button class="btn btn-ghost btn-sm" data-au="copy">보고서 복사</button></div>' +
      '<p class="muted" style="margin:0 0 10px">정식 시작 전에 연동 데이터, 문항 중복·누락, 분기 논리, 설정을 점검합니다. 「규칙 점검」은 즉시 실행되고, 「AI 정밀 점검」은 규칙으로 잡기 어려운 중복·누락·모순·표현 문제를 AI 감사관이 추가로 지적합니다.</p>' +
      '<div class="msg ' + (verdict[1] === 'ok' ? 'ok' : verdict[1] === 'warn' ? 'warn' : 'err') + '">' + I(verdict[1] === 'ok' ? 'check' : 'alert', 18) + '<div><b>' + verdict[0] + '</b><br>오류 ' + cnt.err + ' · 주의 ' + cnt.warn + ' · 참고 ' + cnt.info + ' <span class="muted">· 규칙 점검 ' + (s.at ? A.fmt(s.at) : '') + (s.ai ? ' · AI 점검 ' + A.fmt(s.aiAt) : ' · AI 점검 미실행') + '</span>' + (stale ? '<br><span style="color:var(--amber)">설계가 바뀌었습니다. 규칙 점검을 다시 실행해 주십시오.</span>' : '') + '</div></div>';
    if (s.busy) h += '<div class="loading">AI 감사관이 설계 전체를 검토하는 중입니다… (보통 30~90초)</div>';
    if (s.err) h += '<div class="msg err">' + I('alert', 18) + '<div>' + E(s.err) + '</div></div>';
    if (s.ai && s.ai.summary) h += '<div class="msg">' + I('info', 18) + '<div><b>AI 감사 의견 (' + E(s.ai.verdict || '') + ')</b><br>' + E(s.ai.summary) + '<br><span class="muted" style="font-size:12px">AI 의견은 참고용이며, 최종 판단은 관리자가 합니다.</span></div></div>';
    var order = { err: 0, warn: 1, info: 2 };
    CATS.forEach(function (c) {
      var l = all.filter(function (f) { return f.cat === c; }).sort(function (a, b) { return order[a.sev] - order[b.sev]; }); if (!l.length) return;
      h += '<h3 class="rsec">' + E(c) + ' <small class="muted">' + l.length + '건</small></h3>' + l.map(findingHtml).join('');
    });
    if (!all.length) h += '<div class="panel t-empty">발견된 문제가 없습니다.</div>';
    var miss = (s.ai && s.ai.missing) || [];
    if (miss.length) h += '<h3 class="rsec">AI가 제안하는 빠진 문항</h3><div class="sugs">' + miss.map(function (m, i) { return '<div class="sug"><div class="sp"><b>' + E(m.title || '') + '</b><div class="muted" style="font-size:12.5px">' + E(m.why || '') + '</div></div><button class="btn btn-secondary btn-sm" data-au="slot" data-p="' + E(m.prompt || m.title || '') + '">' + I('sparkle', 12) + ' 이 요청으로 구간 설계</button></div>'; }).join('') + '</div>';
    box.innerHTML = h;
  }
  function report() {
    var s = state(), all = (s.local || []).concat((s.ai && s.ai.findings) || []);
    return '[배포 전 점검 보고서] ' + ((A.work.def.intro && A.work.def.intro.title) || '') + '\n' + all.map(function (f) { return '- (' + SEV[f.sev][0] + '/' + f.cat + '/' + f.src + ') ' + f.title + (f.detail ? ' — ' + f.detail : '') + (f.fix ? ' → ' + f.fix : ''); }).join('\n') + (s.ai && s.ai.summary ? '\n\nAI 의견(' + (s.ai.verdict || '') + '): ' + s.ai.summary : '');
  }
  async function runAi(box) {
    var s = state(); s.local = Au.local(); s.sig = sig(); s.at = new Date(); s.busy = 'ai'; s.err = ''; render(box);
    try {
      var j = await ask(SYS, payload(s.local)), n = 0, ok = { error: 'err', warn: 'warn', info: 'info' };
      s.ai = { verdict: String(j.verdict || ''), summary: String(j.summary || ''), missing: (j.missing || []).slice(0, 4), findings: (j.findings || []).slice(0, 15).map(function (f) { return { id: 'a' + (++n), sev: ok[f.sev] || 'info', cat: CATS.indexOf(f.cat) >= 0 ? f.cat : '논리', src: 'AI', title: String(f.title || ''), detail: String(f.detail || ''), fix: String(f.fix || ''), qids: (f.qids || []).map(String).filter(function (q) { return /^[A-Za-z0-9_]+$/.test(q); }).slice(0, 4), tab: ['questions', 'courses', 'targets', 'overview', 'intro'].indexOf(f.tab) >= 0 ? f.tab : 'questions' }; }).filter(function (f) { return f.title; }) };
      s.aiAt = new Date();
    } catch (e) { s.err = e.message; }
    s.busy = ''; if (document.body.contains(box)) render(box);
  }
  A.tabs.audit = function (box) {
    render(box);
    box.onclick = function (e) {
      var t = e.target.closest('[data-au]'); if (!t) return; var act = t.getAttribute('data-au'), s = state();
      if (act === 'rerun') { Au.run(); return render(box); }
      if (act === 'ai') return runAi(box);
      if (act === 'copy') return A.copy(report(), '점검 보고서를 복사했습니다.');
      if (act === 'gotab') return A.go(t.getAttribute('data-t'));
      if (act === 'slot') { if (A.slot && A.slot.begin) A.slot.begin(t.getAttribute('data-p')); return A.go('questions'); }
      if (act === 'goq') {
        var q = t.getAttribute('data-q'); A.go('questions');
        setTimeout(function () { var card = document.querySelector('.qcard[data-qid="' + q + '"]'); if (!card) return; if (!card.classList.contains('open')) { var hd = card.querySelector('.qhead'); if (hd) hd.click(); card = document.querySelector('.qcard[data-qid="' + q + '"]') || card; } card.scrollIntoView({ block: 'center' }); card.classList.add('aiflash'); setTimeout(function () { card.classList.remove('aiflash'); }, 2500); }, 350);
      }
    };
  };

  /* 정식 시작(배포) 직전 확인 항목 — edit.js launch() 가 사용 */
  A.auditChecks = function () {
    try { var q = Au.quick(); if (!q.errs.length && !q.warns.length) return [[true, '배포 전 점검 통과 (오류·주의 없음)', '']]; return [[false, '배포 전 점검 — 오류 ' + q.errs.length + '건 · 주의 ' + q.warns.length + '건', '배포 전 점검 결과 오류 ' + q.errs.length + '건 · 주의 ' + q.warns.length + '건이 있습니다. 「배포 전 점검」 탭에서 확인해 주십시오. (예: ' + (q.errs[0] || q.warns[0]).title + ')']]; } catch (e) { return []; }
  };
})();
