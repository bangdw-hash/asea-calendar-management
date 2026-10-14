'use strict';
/**
 * aseasurvey-admin-report.js — 리포트 생성 (교수별 · 반별 · 계열별)
 *  · 두 가지 리포트: ① 수치·원문(내부 보고용: 수치 + 학생 서술 원문 + 교육처 의견) ② 정성(전달용: 수치 없이 부드러운 어조 + 개선 방안)
 *  · 서술형 긍정/부정 분류와 교육처 의견·개선 방안은 AI가 초안을 쓰고(없으면 규칙 기반 초안), 관리자가 편집합니다.
 *  · 개인정보·용량 보호: AI 분석 결과·편집 내용·개요는 이 브라우저(IndexedDB)에만 저장하며 서버(Supabase)에 올리지 않습니다.
 *    AI에는 교수·학생 이름을 보내지 않고 집계 수치와 서술 문장만 보냅니다.
 *  · PDF(A4)·ZIP·인쇄는 브라우저에서 직접 만듭니다. (html2canvas + jsPDF + JSZip)
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico, API = function () { return A.ext.resApi; };
  var UI = A.ext.rpt = A.ext.rpt || { unit: 'prof', types: { a: true, b: true }, sel: {}, q: '', busy: false, cancel: false, ents: [], sort: 'def', showProf: false, merge: {}, view: 'list' };
  var PX = { w: 794, h: 1123 };
  var UL = { prof: '교원', klass: '반', track: '계열', subject: '과목' }, ULS = { prof: '교수별', klass: '반별', track: '계열별', subject: '과목별' };   // A4 @96dpi

  /* ───────────── 로컬 저장 (IndexedDB, 서버 미사용) ───────────── */
  var DB = { db: null };
  function idb() {
    return new Promise(function (res) {
      if (DB.db) return res(DB.db);
      try {
        var rq = indexedDB.open('svy_reports', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('r'); };
        rq.onsuccess = function () { DB.db = rq.result; res(DB.db); };
        rq.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
  }
  function dbGet(k) { return idb().then(function (db) { return new Promise(function (res) { if (!db) { try { return res(JSON.parse(localStorage.getItem('svyr_' + k) || 'null')); } catch (e) { return res(null); } } var rq = db.transaction('r').objectStore('r').get(k); rq.onsuccess = function () { res(rq.result || null); }; rq.onerror = function () { res(null); }; }); }); }
  function dbPut(k, v) { return idb().then(function (db) { return new Promise(function (res) { if (!db) { try { localStorage.setItem('svyr_' + k, JSON.stringify(v)); } catch (e) {} return res(); } var tx = db.transaction('r', 'readwrite'); tx.objectStore('r').put(v, k); tx.oncomplete = function () { res(); }; tx.onerror = function () { res(); }; }); }); }
  function dbAll(prefix) { return idb().then(function (db) { return new Promise(function (res) { if (!db) return res({}); var out = {}, rq = db.transaction('r').objectStore('r').openCursor(); rq.onsuccess = function () { var c = rq.result; if (!c) return res(out); if (String(c.key).indexOf(prefix) === 0) out[c.key] = c.value; c.continue(); }; rq.onerror = function () { res(out); }; }); }); }
  function dbDel(k) { return idb().then(function (db) { return new Promise(function (res) { if (!db) { try { localStorage.removeItem('svyr_' + k); } catch (e) {} return res(); } var tx = db.transaction('r', 'readwrite'); tx.objectStore('r').delete(k); tx.oncomplete = function () { res(); }; tx.onerror = function () { res(); }; }); }); }
  function sid() { return A.cur.survey.id; }
  function ekey(unit, key) { return sid() + '|' + unit + '|' + key; }

  /* ───────────── 개요 (교육처 기입) ───────────── */
  var OV_FIELDS = [
    ['title', '보고서 제목', '문서 맨 위에 표시됩니다.', '수업 개선 설문조사 결과 보고'],
    ['survey', '조사명', '설문의 공식 명칭입니다.', ''],
    ['period', '조사 기간', '응답을 받은 기간입니다. 설문 설정의 기간이 기본값입니다.', ''],
    ['target', '조사 대상', '대상 학생의 범위와 재적 인원입니다.', ''],
    ['method', '조사 방법', '실시 방식(온라인·무기명 등)과 척도를 적습니다.', '온라인 무기명 설문, 5점 척도(5점 = 가장 긍정)'],
    ['basis', '분석 기준', '긍정·부정의 정의, 유효 응답 기준, 최소 응답 수 등 해석 기준입니다.', '긍정 = 4·5점, 부정 = 1·2점. 점검 문항을 통과한 유효 응답만 분석했습니다.'],
    ['dept', '작성 부서', '보고서를 작성한 부서입니다.', '교육처'],
    ['writer', '작성자·결재', '담당자 이름 또는 결재 라인을 적습니다.', ''],
    ['date', '작성일', '보고서 작성(발행)일입니다.', ''],
    ['notice', '유의 사항', '비공개·활용 범위를 안내하는 문구입니다.', '본 자료는 수업 개선 목적으로만 활용하며, 응답자를 식별할 수 없는 통계와 익명 처리된 의견으로 구성되어 있습니다. 외부에 공개하거나 인사·평가 자료로 단독 사용하지 않습니다.'],
    ['to', '수신·전달 대상', '전달용 리포트를 받는 사람·부서입니다. (예: 해당 교원, 학과장)', '']
  ];
  function ovDefaults() {
    var s = A.cur.survey, d = s.def || {}, i = d.intro || {}, heads = d.classHead || {}, th = Object.keys(heads).reduce(function (n, k) { return n + (Number(heads[k]) || 0); }, 0), today = new Date();
    function f(t) { return t ? new Date(t).getFullYear() + '.' + ('0' + (new Date(t).getMonth() + 1)).slice(-2) + '.' + ('0' + new Date(t).getDate()).slice(-2) : ''; }
    return { title: '수업 개선 설문조사 결과 보고', survey: i.title || s.title, period: s.open_at || s.close_at ? f(s.open_at) + ' ~ ' + f(s.close_at) : '', target: th ? '재학생 ' + th + '명 (전 계열·학년)' : '재학생', method: '온라인 무기명 설문, 5점 척도(5점 = 가장 긍정)', basis: '긍정 = 4·5점, 부정 = 1·2점. 점검 문항을 통과한 유효 응답만 분석했습니다.', dept: '교육처', writer: '', date: today.getFullYear() + '.' + ('0' + (today.getMonth() + 1)).slice(-2) + '.' + ('0' + today.getDate()).slice(-2), notice: OV_FIELDS[9][3], to: '' };
  }
  function ovGet() { return dbGet(sid() + '|overview').then(function (v) { return Object.assign(ovDefaults(), v || {}); }); }

  /* ───────────── 파일명 규칙 ───────────── */
  var NAME_DEF = { prefix: '', prof: '{조사}_{계열}_{교수}', klass: '{계열}_{반}', track: '{계열}', subject: '{조사}_{과목}' };
  function nameSettings() { return dbGet(sid() + '|names').then(function (v) { var o = Object.assign({}, NAME_DEF, v || {}); if (!o.prefix) o.prefix = ((A.cur.survey.semester || '') ? A.cur.survey.semester + '학기' : '') + '_수업개선설문조사 결과'; return o; }); }
  function safe(s) { return String(s == null ? '' : s).replace(/[\\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim(); }
  function fileName(ns, ent, suffix) {
    var pat = ns[ent.unit] || '{계열}', name = pat.replace(/\{조사\}/g, safe(ns.prefix)).replace(/\{계열\}/g, safe(ent.track)).replace(/\{교수\}/g, safe(ent.prof || '')).replace(/\{반\}/g, safe(ent.klassName || '')).replace(/\{과목\}/g, safe(ent.unit === 'subject' ? ent.label : '')).replace(/\{학기\}/g, safe(A.cur.survey.semester || ''));
    return safe(name).replace(/^_+|_+$/g, '') + (suffix || '') + '.pdf';
  }

  /* ───────────── 데이터 수집 (응답 범위·정성 필터 반영, 계열/학년/반 필터는 무시) ───────────── */
  function collect(ctx) {
    var Ap = API(), F = Ap.F, rows = ctx ? ctx.rows : Ap.rows(), Q = ctx ? ctx.Q : Ap.questions(), cm = {}; (ctx ? ctx.courses : A.cur.courses).forEach(function (c) { cm[c.id] = c; });
    var pairs = [], texts = [], commons = [];
    rows.forEach(function (r) {
      if (F.data === 'real' && r.is_test) return; if (F.data === 'test' && !r.is_test) return; if (!A.ext.sincereOk(r)) return;
      var ans = (r.answers && r.answers.course) || {};
      Object.keys(ans).forEach(function (cid) {
        var c = cm[cid]; if (!c) return; var a = ans[cid]; pairs.push({ r: r, c: c, a: a });
        Q.text.forEach(function (x) { var v = a[x.q.id]; if (typeof v === 'string' && v.trim()) texts.push({ r: r, c: c, q: x.q, text: v.trim() }); });
      });
      Q.common.forEach(function (x) { if (x.q.type === 'text') { var v = ((r.answers && r.answers.common) || {})[x.q.id]; if (typeof v === 'string' && v.trim()) commons.push({ r: r, q: x.q, text: v.trim() }); } });
    });
    return { pairs: pairs, texts: texts, commons: commons, Q: Q };
  }
  function subjRaw(n) { return String(n || '').toLowerCase().replace(/[\s()（）\[\]·.,_\-|]/g, '') || '(과목명 없음)'; }
  function subjKey(n) { var r = subjRaw(n), g = 0; while (UI.merge[r] && UI.merge[r] !== r && g++ < 5) r = UI.merge[r]; return r; }
  function entKey(unit, p) { return unit === 'subject' ? '*|' + subjKey(p.c.name) : unit === 'prof' ? p.c.track + '|' + (p.c.prof || '(교수 미입력)') : unit === 'klass' ? p.r.track + '|' + p.r.grade + '|' + p.r.klass : p.r.track; }
  function mk(unit, key, p) {
    var parts = key.split('|'), e = { unit: unit, key: key, track: parts[0] };
    if (unit === 'prof') { e.prof = parts[1]; e.label = parts[1]; e.sub = parts[0]; }
    else if (unit === 'klass') { e.klassName = parts[1] + parts[2]; e.label = parts[0] + ' ' + parts[1] + ' ' + parts[2]; e.sub = ''; e.grade = parts[1]; e.klass = parts[2]; }
    else if (unit === 'subject') { e.label = parts[1]; e.sub = ''; e.track = ''; e.prof = ''; e.raw = {}; }
    else { e.label = parts[0]; e.sub = ''; }
    return e;
  }
  function facts(unit, ctx) {
    var C = collect(ctx), Q = C.Q, SC = ctx && ctx.anchors ? C.Q.scale.filter(function (x) { return ctx.anchors[x.q.id]; }) : C.Q.scale, ents = {}, all = { sum: 0, n: 0, pos: 0, neg: 0, sec: {} };
    function addTo(o, v, sid0) { o.sum += v; o.n++; if (v >= 4) o.pos++; if (v <= 2) o.neg++; if (sid0) { var s = o.sec[sid0] || (o.sec[sid0] = { sum: 0, n: 0, pos: 0, neg: 0 }); s.sum += v; s.n++; if (v >= 4) s.pos++; if (v <= 2) s.neg++; } }
    function mkAgg() { return { sum: 0, n: 0, pos: 0, neg: 0, sec: {}, q: {} }; }
    C.pairs.forEach(function (p) {
      var k = entKey(unit, p), e = ents[k] || (ents[k] = Object.assign(mk(unit, k, p), { rs: {}, rm: {}, agg: mkAgg(), courses: {}, comments: [] })); e.rs[p.r.id] = 1;
      var cc = e.courses[p.c.id] || (e.courses[p.c.id] = { c: p.c, a: mkAgg(), rs: {} }); cc.rs[p.r.id] = 1;
      SC.forEach(function (x) { var v = p.a[x.q.id]; if (v == null) return; var rm = e.rm[p.r.id] || (e.rm[p.r.id] = { s: 0, n: 0 }); rm.s += v; rm.n++; addTo(e.agg, v, x.s.id); addTo(cc.a, v, x.s.id); addTo(all, v, x.s.id); var qq = e.agg.q[x.q.id] || (e.agg.q[x.q.id] = { sum: 0, n: 0, q: x.q }); qq.sum += v; qq.n++; });
    });
    C.texts.forEach(function (t) { var k = entKey(unit, t); if (ents[k]) ents[k].comments.push({ c: t.c.name, q: t.q.id, ql: String(t.q.label).replace(/\s+/g, ' ').slice(0, 40), t: t.text }); });
    if (unit !== 'prof' && unit !== 'subject') C.commons.forEach(function (t) { var k = unit === 'klass' ? t.r.track + '|' + t.r.grade + '|' + t.r.klass : t.r.track; if (ents[k]) ents[k].comments.push({ c: '', q: t.q.id, ql: String(t.q.label).replace(/\s+/g, ' ').slice(0, 40), t: t.text }); });
    var list = Object.keys(ents).map(function (k) {
      var e = ents[k]; e.resp = Object.keys(e.rs).length; e.cnt = e.agg.n; e.med = medianOf(Object.keys(e.rm).map(function (k) { return e.rm[k].s / e.rm[k].n; }));
      e.mean = e.cnt ? e.agg.sum / e.cnt : null; e.posr = e.cnt ? e.agg.pos / e.cnt * 100 : null; e.negr = e.cnt ? e.agg.neg / e.cnt * 100 : null;
      e.secs = Q.sections.map(function (s) { var x = e.agg.sec[s.id], y = all.sec[s.id]; return { id: s.id, title: s.title, mean: x && x.n ? x.sum / x.n : null, pos: x && x.n ? x.pos / x.n * 100 : null, neg: x && x.n ? x.neg / x.n * 100 : null, school: y && y.n ? y.sum / y.n : null }; });
      var qs = Object.keys(e.agg.q).map(function (id) { var x = e.agg.q[id]; return { id: id, label: String(x.q.label).replace(/\s+/g, ' '), mean: x.sum / x.n, n: x.n }; }).sort(function (a, b) { return b.mean - a.mean; });
      e.best = qs.slice(0, 3); e.worst = qs.slice(-3).reverse();
      e.courseList = Object.keys(e.courses).map(function (id) { var c = e.courses[id]; return { name: c.c.name, kind: c.c.kind || '', prof: c.c.prof || '', klass: c.c.track + ' ' + c.c.grade + ' ' + c.c.klass, mean: c.a.n ? c.a.sum / c.a.n : null, pos: c.a.n ? c.a.pos / c.a.n * 100 : null, resp: Object.keys(c.rs).length }; }).sort(function (a, b) { return (b.mean || 0) - (a.mean || 0); });
      if (unit === 'subject') { var nm = {}, tk = {}; Object.keys(e.courses).forEach(function (id) { var c = e.courses[id].c; nm[c.name] = (nm[c.name] || 0) + 1; tk[c.track] = 1; e.raw[subjRaw(c.name)] = 1; }); e.label = Object.keys(nm).sort(function (a, b) { return nm[b] - nm[a]; })[0] || e.label; var tl = Object.keys(tk).sort(); e.track = tl.length > 2 ? tl[0] + ' 외 ' + (tl.length - 1) + '개 계열' : tl.join('·'); e.sub = e.track; }
      e.schoolMean = all.n ? all.sum / all.n : null; e.schoolPos = all.n ? all.pos / all.n * 100 : null;
      return e;
    }).sort(function (a, b) { return (a.track + (a.label || '')).localeCompare(b.track + (b.label || ''), 'ko'); });
    return list;
  }

  /* ───────────── 규칙 기반 기본 분석 (AI 없이도 동작하는 초안) ───────────── */
  var POSW = /좋|도움|감사|만족|친절|재미|유익|열정|최고|훌륭|잘 ?(가르|설명|알려)|이해가 ?(잘|쉽)|쉽게|꼼꼼|배려|존경/, NEGW = /부족|아쉽|불편|어렵|빠르|느리|지루|힘들|불만|개선|형식적|이해가 ?안|못 ?(알|따라)|짧|적었|없었|늦|불친절|소홀|지각|모호/;
  function ruleClassify(t) { var n = NEGW.test(t), p = POSW.test(t); return n && !p ? 'neg' : p && !n ? 'pos' : n && p ? 'neu' : 'neu'; }
  function fmt1(v) { return v == null ? '-' : v.toFixed(2); }
  function ruleAnalysis(e) {
    var cls = e.comments.map(function (c, i) { return { i: i, s: ruleClassify(c.t), t: '' }; });
    var secs = e.secs.filter(function (s) { return s.mean != null; }).slice().sort(function (a, b) { return b.mean - a.mean; }), hi = secs[0], lo = secs[secs.length - 1];
    var np = cls.filter(function (c) { return c.s === 'pos'; }).length, nn = cls.filter(function (c) { return c.s === 'neg'; }).length;
    var dept = '종합 평균은 ' + fmt1(e.mean) + '점(학교 평균 ' + fmt1(e.schoolMean) + '점), 긍정 응답 비율은 ' + Math.round(e.posr || 0) + '%입니다.' + (hi ? ' 상대적으로 ' + secShort(hi.title) + ' 영역(' + fmt1(hi.mean) + '점)이 강점이며' : '') + (lo && lo !== hi ? ', ' + secShort(lo.title) + ' 영역(' + fmt1(lo.mean) + '점)은 보완이 필요합니다.' : '.') + ' 서술 의견은 긍정 ' + np + '건, 부정 ' + nn + '건으로 분류되었습니다. (규칙 기반 초안이며, AI 분석 또는 직접 수정으로 보완하십시오.)';
    return { src: 'rule', refs: (A.ext.theory && A.ext.theory.data ? A.ext.theory.autoRefs(e) : []), cls: cls, positive: [], negative: [], dept: dept, soft: '학생들은 수업 전반에서 대체로 성실하게 참여하였으며, 수업 운영의 여러 부분에서 긍정적인 경험을 하였습니다. 다만 일부 영역에서는 학생의 이해와 참여를 더 높일 수 있는 여지가 있어, 아래 제안을 참고하여 함께 살펴보시기를 권합니다. (AI 분석 전 기본 문안입니다. 편집하여 사용하십시오.)', actions: [{ title: '수업 진행 점검', detail: '낮게 평가된 영역을 중심으로 수업 진행 방식과 자료를 점검하고, 학생 의견을 반영한 개선안을 마련합니다.', owner: '교원', when: '이번 학기' }] };
  }
  function secShort(t) { return String(t).replace(/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\.\s*/, '').replace(/\(.*?\)/g, '').trim(); }

  /* ───────────── AI 분석 (이름 미전송) ───────────── */
  var SYS = '당신은 전문대학 교육처의 교육기획 전문가입니다. 학생 수업 개선 설문 결과를 분석해 보고서 초안을 작성합니다.\n' +
    '입력은 JSON입니다. scores는 5점 척도(5점이 가장 좋음) 집계, comments는 학생 서술 의견입니다. 대상의 이름은 주어지지 않으며 "해당 교원/반/계열"로 지칭하십시오.\n' +
    '출력은 JSON 객체 하나만 작성하십시오. (설명·코드펜스 금지) 형식:\n' +
    '{"classify":[{"i":의견번호,"s":"pos|neg|neu","t":"주제 2~6자"}],"positive":["학생들이 인정한 강점 요약 문장"(최대4)],"negative":["개선이 필요한 점 요약 문장"(최대4)],' +
    '"dept":"교육처 입장. 수치와 서술 의견을 함께 근거로 한 전문가 판단 4~7문장. 단정적 평가 대신 근거·해석·우선순위를 제시. 합니다체",' +
    '"soft":"전달용 정성 리포트 본문. 숫자·점수·비율·인원수를 절대 쓰지 말 것. 부드럽고 존중하는 어조로 강점을 먼저 인정하고, 부정적 사실은 조심스럽게 표현하되 숨기지 말 것. 3~4개 문단. 합니다체",' +
    '"actions":[{"title":"개선 과제 제목","detail":"교육기획 관점의 구체적 방안 2~3문장(누가·무엇을·어떻게). 형식적 문구 금지","owner":"교원|교육처|학과","when":"즉시|이번 학기|다음 학기"}](3~5개)}\n' +
    '규칙: 모든 의견(i)을 classify에 포함. 욕설·인신공격이 있으면 soft/positive/negative에 옮기지 말고 일반화해 표현. 근거 없는 추측 금지.\n' +
    '학술 근거: 입력의 theory 는 검증된 연구 근거 후보입니다(id, finding=연구 결과 요약, use=적용 해석, caution=유의). 이 대상의 상황(점수·서술 의견 주제·표본 크기·회차 변화)과 실제로 관련 있는 것만 골라 dept 와 actions 의 판단 근거로 쓰고, 관련 없으면 쓰지 마십시오. 같은 문구를 반복하지 말고 대상의 상황에 맞게 풀어 쓰십시오. ' +
    '사용한 근거는 JSON 의 "refs"(id 배열)에 반드시 적고, actions 의 각 항목에는 근거가 있으면 "ref"(id)를 적습니다. theory 에 없는 연구·저자·연도·통계 수치는 절대 언급하지 말고, 저자명·연도는 본문에 쓰지 마십시오(출처는 시스템이 각주로 붙입니다). dept 에서는 연구 결과(사실)와 이 대상에 대한 해석·판단(의견)을 구분해 쓰십시오. soft(전달용)에는 연구 인용·학술 용어를 쓰지 마십시오.';
  function aiInput(e, ov, th) {
    return JSON.stringify({ theory: (A.ext.theory && th ? A.ext.theory.forAI(th) : []), unit: UL[e.unit], survey: ov.survey, basis: ov.basis,
      scores: { overall: { mean: round2(e.mean), pos: Math.round(e.posr || 0), neg: Math.round(e.negr || 0), school: round2(e.schoolMean) }, sections: e.secs.map(function (s) { return { n: secShort(s.title), mean: round2(s.mean), school: round2(s.school), pos: Math.round(s.pos || 0), neg: Math.round(s.neg || 0) }; }),
        best: e.best.map(function (q) { return { q: q.label.slice(0, 50), mean: round2(q.mean) }; }), worst: e.worst.map(function (q) { return { q: q.label.slice(0, 50), mean: round2(q.mean) }; }), courses: e.courseList.slice(0, 12).map(function (c) { return { n: c.name, mean: round2(c.mean) }; }) },
      comments: e.comments.slice(0, 60).map(function (c, i) { return { i: i, q: c.ql, c: c.c, t: c.t.slice(0, 300) }; }) });
  }
  function medianOf(a) { if (!a.length) return null; var b = a.slice().sort(function (x, y) { return x - y; }), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
  function round2(v) { return v == null ? null : Math.round(v * 100) / 100; }
  function parseJson(text) { var s = String(text || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim(), a = s.indexOf('{'); if (a > 0) s = s.slice(a); try { return JSON.parse(s); } catch (e) {} var b = s.lastIndexOf('}'); if (b > 0) { try { return JSON.parse(s.slice(0, b + 1)); } catch (e2) {} } throw new Error('AI 응답을 해석하지 못했습니다.'); }
  async function aiAnalyze(e, ov) {
    if (!A.ext.aiCall) throw new Error('AI 모듈을 불러오지 못했습니다. 새로고침해 주십시오.');
    var model = UI.model || ((A.ext.aiModels || [])[0] || [])[0] || 'claude-sonnet-5-5', th = A.ext.theory ? A.ext.theory.pick(A.ext.theory.signals(e), e.unit + '|' + e.key, 4) : [], text = await A.ext.aiCall(SYS, aiInput(e, ov, th), model), j = parseJson(text);
    var cls = (j.classify || []).filter(function (c) { return c && c.i >= 0 && c.i < e.comments.length; }).map(function (c) { return { i: Number(c.i), s: /^(pos|neg|neu)$/.test(c.s) ? c.s : 'neu', t: String(c.t || '').slice(0, 12) }; });
    e.comments.forEach(function (c, i) { if (!cls.some(function (x) { return x.i === i; })) cls.push({ i: i, s: ruleClassify(c.t), t: '' }); });
    var TH = A.ext.theory, clean = function (t, none) { return TH ? TH.stripCites(String(t || ''), th, none) : String(t || ''); };
    return { src: 'ai', model: String(model), at: Date.now(), cls: cls, positive: (j.positive || []).map(function (x) { return clean(x, true); }).filter(Boolean).slice(0, 4), negative: (j.negative || []).map(function (x) { return clean(x, true); }).filter(Boolean).slice(0, 4), dept: clean(j.dept), soft: clean(j.soft, true),
      refs: TH ? TH.cleanRefs(j.refs, th) : [],
      actions: (j.actions || []).slice(0, 6).map(function (a) { return { title: clean(a.title), detail: clean(a.detail), owner: String(a.owner || ''), when: String(a.when || '') }; }) };
  }

  /* ───────────── 리포트 HTML (A4 페이지) ───────────── */
  var CSS = '.rp-page{width:794px;height:1123px;box-sizing:border-box;padding:44px 48px 40px;background:#fff;color:#1f2937;font-family:"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif;font-size:13px;line-height:1.6;position:relative;overflow:hidden;word-break:keep-all}' +
    '.rp-page *{box-sizing:border-box}.rp-hd{display:flex;align-items:center;gap:10px;border-bottom:3px solid #0EA5E9;padding-bottom:8px;margin-bottom:14px}.rp-hd img{height:30px}.rp-hd .t{flex:1;font-weight:700;font-size:15px;color:#0c4a6e}.rp-hd .k{font-size:11px;color:#6b7280}' +
    '.rp-ft{position:absolute;left:48px;right:48px;bottom:18px;display:flex;justify-content:space-between;font-size:10.5px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:6px}' +
    '.rp-title{font-size:23px;font-weight:800;color:#0c4a6e;margin:4px 0 2px}.rp-sub{color:#475569;margin-bottom:12px}.rp-h2{font-size:14.5px;font-weight:800;color:#0c4a6e;margin:14px 0 6px;padding-left:8px;border-left:4px solid #0EA5E9}' +
    '.rp-ov{width:100%;border-collapse:collapse;font-size:12px}.rp-ov th{width:92px;background:#f0f9ff;color:#0c4a6e;text-align:left;padding:5px 8px;border:1px solid #d6e4ee;font-weight:700}.rp-ov td{padding:5px 8px;border:1px solid #d6e4ee}' +
    '.rp-kpis{display:flex;gap:8px;margin:6px 0}.rp-kpi{flex:1;border:1px solid #d6e4ee;border-radius:10px;padding:8px 10px;background:#f8fbfd}.rp-kpi .l{font-size:11px;color:#64748b}.rp-kpi .v{font-size:22px;font-weight:800;color:#0c4a6e}.rp-kpi .s{font-size:10.5px;color:#64748b}' +
    '.rp-bar{display:grid;grid-template-columns:150px 1fr 56px;gap:8px;align-items:center;margin:3px 0;font-size:12px}.rp-bar .b{position:relative;height:12px;background:#eef2f7;border-radius:6px}.rp-bar .b i{position:absolute;left:0;top:0;bottom:0;background:#0EA5E9;border-radius:6px}.rp-bar .b u{position:absolute;top:-3px;bottom:-3px;width:0;border-left:2px dashed #475569}' +
    '.rp-t{width:100%;border-collapse:collapse;font-size:11.5px}.rp-t th{background:#0c4a6e;color:#fff;padding:5px 6px;text-align:left}.rp-t td{padding:4px 6px;border-bottom:1px solid #e5e7eb}.rp-t .n{text-align:right}' +
    '.rp-two{display:flex;gap:10px}.rp-two>div{flex:1;border-radius:10px;padding:8px 10px}.rp-pos{background:#ecfdf5;border:1px solid #a7f3d0}.rp-neg{background:#fff7ed;border:1px solid #fed7aa}.rp-neu{background:#f8fafc;border:1px solid #e2e8f0}.rp-two h4{margin:0 0 4px;font-size:12.5px}' +
    '.rp-c{font-size:11.5px;margin:3px 0;padding:4px 7px;border-radius:6px;background:#fff;border:1px solid #e5e7eb}.rp-c small{color:#64748b;display:block}.rp-box{border:1px solid #d6e4ee;border-radius:10px;padding:9px 12px;background:#fbfdff;white-space:pre-wrap}.rp-act{border:1px solid #d6e4ee;border-radius:10px;padding:7px 10px;margin:5px 0;background:#fff}.rp-act b{color:#0c4a6e}.rp-act .m{font-size:10.5px;color:#64748b}' +
    '.rp-badge{display:inline-block;font-size:10px;padding:1px 6px;border-radius:99px;background:#e0f2fe;color:#075985;margin-left:4px}';
  function pageShell(ov, kind, ent, n, total, body) {
    return '<section class="rp-page"><div class="rp-hd"><img src="aseasurvey-logo.png" alt=""><div class="t">' + E(ov.title) + '</div><div class="k">' + (kind === 'a' ? '내부 보고용' : '전달용') + '</div></div>' + body +
      '<div class="rp-ft"><span>' + E(ov.dept) + ' · ' + E(ov.survey) + '</span><span>' + E(ent.label) + ' · ' + n + ' / ' + total + '</span></div></section>';
  }
  function ovTable(ov, ent, kind) {
    var rows = [['조사명', ov.survey], ['조사 기간', ov.period]];
    if (kind === 'a') rows.push(['조사 대상', ov.target], ['조사 방법', ov.method], ['분석 기준', ov.basis]);   // 전달용(정성)에는 수치·인원이 드러나는 항목을 넣지 않음
    if (ov.to && kind === 'b') rows.push(['수신', ov.to]);
    rows.push(['작성', [ov.dept, ov.writer, ov.date].filter(Boolean).join(' · ')]);
    return '<table class="rp-ov">' + rows.filter(function (r) { return r[1]; }).map(function (r) { return '<tr><th>' + E(r[0]) + '</th><td>' + E(r[1]) + '</td></tr>'; }).join('') + '</table>';
  }
  function blocksA(ent, an, ov) {
    var b = [], pc = function (v) { return v == null ? '-' : Math.round(v) + '%'; };
    var unitL = UL[ent.unit];
    b.push({ h: '<div class="rp-title">' + E(ent.label) + ' 수업 개선 설문 결과</div><div class="rp-sub">' + (ent.sub ? E(ent.sub) + ' · ' : '') + unitL + '별 결과 보고 (내부 보고용)</div>' + ovTable(ov, ent, 'a') });
    b.push({ keep: 1, h: '<div class="rp-h2">핵심 지표</div><div class="rp-kpis"><div class="rp-kpi"><div class="l">종합 평균(5점)</div><div class="v">' + fmt1(ent.mean) + '</div><div class="s">학교 평균 ' + fmt1(ent.schoolMean) + '</div></div><div class="rp-kpi"><div class="l">긍정률(4·5점)</div><div class="v">' + pc(ent.posr) + '</div><div class="s">학교 평균 ' + pc(ent.schoolPos) + '</div></div><div class="rp-kpi"><div class="l">부정률(1·2점)</div><div class="v">' + pc(ent.negr) + '</div></div><div class="rp-kpi"><div class="l">응답자</div><div class="v">' + ent.resp + '</div><div class="s">과목 단위 ' + ent.courseList.reduce(function (s, c) { return s + c.resp; }, 0) + '건</div></div></div>' });
    b.push({ keep: 1, h: '<div class="rp-h2">영역별 평가 <small style="font-weight:400;color:#64748b">(점선 = 학교 평균)</small></div>' });
    ent.secs.forEach(function (s) { if (s.mean == null) return; b.push({ h: '<div class="rp-bar"><span>' + E(secShort(s.title)) + '</span><span class="b"><i style="width:' + (s.mean / 5 * 100) + '%"></i>' + (s.school != null ? '<u style="left:' + (s.school / 5 * 100) + '%"></u>' : '') + '</span><b>' + fmt1(s.mean) + '</b></div>' }); });
    if (ent.courseList.length) b.push({ h: '<div class="rp-h2">' + (ent.unit === 'prof' ? '담당 과목별 결과' : ent.unit === 'subject' ? '반별 결과' : '과목별 결과') + '</div><table class="rp-t"><thead><tr><th>' + (ent.unit === 'subject' ? '반' : '과목') + '</th><th>' + (ent.unit === 'prof' ? '반' : ent.unit === 'subject' ? (UI.showProf ? '담당 교원' : '') : '담당 교원') + '</th><th class="n">평균</th><th class="n">긍정률</th><th class="n">응답</th></tr></thead><tbody>' + ent.courseList.map(function (c) { return '<tr><td>' + E(ent.unit === 'subject' ? c.klass : c.name) + (c.kind ? '<span class="rp-badge">' + E(c.kind) + '</span>' : '') + '</td><td>' + E(ent.unit === 'prof' ? c.klass.replace(ent.track, '').trim() : ent.unit === 'subject' ? (UI.showProf ? c.prof : '') : c.prof) + '</td><td class="n">' + fmt1(c.mean) + '</td><td class="n">' + pc(c.pos) + '</td><td class="n">' + c.resp + '</td></tr>'; }).join('') + '</tbody></table>' });
    if (ent.best.length) b.push({ keep: 0, h: '<div class="rp-h2">문항별 강점·보완</div><div class="rp-two"><div class="rp-pos"><h4>평가가 높은 문항</h4>' + ent.best.map(function (q) { return '<div class="rp-c">' + E(q.label.slice(0, 60)) + ' <b>' + fmt1(q.mean) + '</b></div>'; }).join('') + '</div><div class="rp-neg"><h4>평가가 낮은 문항</h4>' + ent.worst.map(function (q) { return '<div class="rp-c">' + E(q.label.slice(0, 60)) + ' <b>' + fmt1(q.mean) + '</b></div>'; }).join('') + '</div></div>' });
    var groups = { pos: [], neg: [], neu: [] }; (an.cls || []).forEach(function (c) { if (ent.comments[c.i]) groups[c.s].push({ c: ent.comments[c.i], t: c.t }); });
    b.push({ keep: 1, h: '<div class="rp-h2">학생 서술 의견 <small style="font-weight:400;color:#64748b">(원문 · 긍정 ' + groups.pos.length + ' / 부정 ' + groups.neg.length + ' / 기타 ' + groups.neu.length + ')</small></div>' });
    [['pos', '긍정 의견', 'rp-pos'], ['neg', '부정·개선 의견', 'rp-neg'], ['neu', '기타 의견', 'rp-neu']].forEach(function (g) {
      if (!groups[g[0]].length) return;
      b.push({ keep: 1, h: '<div class="' + g[2] + '" style="padding:6px 10px;border-radius:10px;margin-top:4px"><b>' + g[1] + ' ' + groups[g[0]].length + '건</b></div>' });
      groups[g[0]].forEach(function (x) { b.push({ h: '<div class="rp-c">' + E(x.c.t) + '<small>' + E([x.c.c, x.t].filter(Boolean).join(' · ')) + '</small></div>' }); });
    });
    if (A.ext.rptExtraBlocks) A.ext.rptExtraBlocks(ent).forEach(function (x) { b.push(x); });
    b.push({ keep: 1, h: '<div class="rp-h2">교육처 의견</div>' }); b.push({ h: '<div class="rp-box">' + E(an.dept || '') + '</div>' });
    if ((an.actions || []).length) { b.push({ keep: 1, h: '<div class="rp-h2">개선 과제(안)</div>' }); an.actions.forEach(function (a, i) { b.push({ h: '<div class="rp-act"><b>' + (i + 1) + '. ' + E(a.title) + '</b><div>' + E(a.detail) + '</div><div class="m">' + E([a.owner, a.when].filter(Boolean).join(' · ')) + '</div></div>' }); }); }
    if (A.ext.theory && (an.refs || []).length) A.ext.theory.blocks(an.refs).forEach(function (x) { b.push(x); });
    return b;
  }
  function blocksB(ent, an, ov) {
    var b = [], unitL = UL[ent.unit];
    b.push({ h: '<div class="rp-title">' + E(ent.label) + ' 수업 개선 의견 안내</div><div class="rp-sub">' + (ent.sub ? E(ent.sub) + ' · ' : '') + unitL + ' 대상 정성 리포트 (전달용)</div>' + ovTable(ov, ent, 'b') });
    b.push({ keep: 1, h: '<div class="rp-h2">학생들의 의견을 모아 본 종합 소견</div>' });
    String(an.soft || '').split(/\n{1,}/).filter(function (p) { return p.trim(); }).forEach(function (p) { b.push({ h: '<div class="rp-box" style="margin-bottom:6px">' + E(p.trim()) + '</div>' }); });
    if ((an.positive || []).length) b.push({ h: '<div class="rp-h2">학생들이 인정한 부분</div><div class="rp-pos" style="border-radius:10px;padding:8px 12px">' + an.positive.map(function (p) { return '<div class="rp-c">' + E(p) + '</div>'; }).join('') + '</div>' });
    if ((an.negative || []).length) b.push({ h: '<div class="rp-h2">함께 살펴볼 부분</div><div class="rp-neg" style="border-radius:10px;padding:8px 12px">' + an.negative.map(function (p) { return '<div class="rp-c">' + E(p) + '</div>'; }).join('') + '</div>' });
    if ((an.actions || []).length) { b.push({ keep: 1, h: '<div class="rp-h2">개선을 위한 제안</div>' }); an.actions.forEach(function (a, i) { b.push({ h: '<div class="rp-act"><b>' + (i + 1) + '. ' + E(a.title) + '</b><div>' + E(a.detail) + '</div><div class="m">' + E([a.owner, a.when].filter(Boolean).join(' · ')) + '</div></div>' }); }); }
    b.push({ h: '<div class="rp-box" style="margin-top:10px;background:#f8fafc;color:#475569;font-size:12px">' + E(ov.notice || '') + '</div>' });
    return b;
  }
  /* 블록을 A4 페이지로 나눔 (오프스크린에서 높이를 재서 채움) */
  function paginate(blocks, ov, kind, ent) {
    var host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + PX.w + 'px;visibility:hidden'; host.innerHTML = '<style>' + CSS + '</style><section class="rp-page" style="height:auto;overflow:visible"><div class="rp-body"></div></section>'; document.body.appendChild(host);
    var body = host.querySelector('.rp-body'), avail = PX.h - 44 - 40 - 52 - 40, hs = blocks.map(function (b) { body.innerHTML = b.h; return body.offsetHeight + 4; });
    host.remove();
    var pages = [], cur = [], used = 0;
    for (var i = 0; i < blocks.length; i++) {
      var need = hs[i] + (blocks[i].keep && blocks[i + 1] ? hs[i + 1] : 0);
      if (cur.length && used + need > avail) { pages.push(cur); cur = []; used = 0; }
      cur.push(blocks[i]); used += hs[i];
    }
    if (cur.length) pages.push(cur);
    return pages.map(function (p, n) { return pageShell(ov, kind, ent, n + 1, pages.length, p.map(function (b) { return b.h; }).join('')); });
  }
  function buildPages(ent, an, ov, kind) { return paginate(kind === 'a' ? blocksA(ent, an, ov) : blocksB(ent, an, ov), ov, kind, ent); }

  /* ───────────── PDF · ZIP · 인쇄 ───────────── */
  function loadScript(src) { return new Promise(function (res, rej) { if (document.querySelector('script[data-src="' + src + '"]')) return res(); var s = document.createElement('script'); s.src = src; s.setAttribute('data-src', src); s.onload = res; s.onerror = function () { rej(new Error('스크립트 로드 실패: ' + src)); }; document.head.appendChild(s); }); }
  function ensureLibs() {
    var j = []; if (!window.html2canvas) j.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'));
    if (!(window.jspdf && window.jspdf.jsPDF)) j.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')); if (!window.JSZip) j.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'));
    return Promise.all(j);
  }
  async function pagesToPdf(pageHtmls) {
    await ensureLibs(); try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    var pdf = new window.jspdf.jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' }), W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
    var host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + PX.w + 'px'; host.innerHTML = '<style>' + CSS + '</style>' + pageHtmls.join(''); document.body.appendChild(host);
    try {
      var els = host.querySelectorAll('.rp-page');
      for (var i = 0; i < els.length; i++) { var cv = await window.html2canvas(els[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false }); if (i) pdf.addPage(); pdf.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, W, H); }
    } finally { host.remove(); }
    return pdf.output('blob');
  }
  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
  A.ext.pagesToPdf = pagesToPdf; A.ext.rpDownload = download; A.ext.rpEnsureLibs = ensureLibs;
  function printPages(pageHtmls) {
    var f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f);
    var d = f.contentWindow.document; d.open(); d.write('<!doctype html><html><head><meta charset="utf-8"><base href="' + location.href.replace(/[^/]*$/, '') + '"><title>리포트 출력</title><style>@page{size:A4;margin:0}html,body{margin:0}.rp-page{page-break-after:always;break-after:page}' + CSS + '</style></head><body>' + pageHtmls.join('') + '</body></html>'); d.close();
    setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(function () { f.remove(); }, 60000); }, 600);
  }
  A.ext.rpPrint = printPages;

  /* ───────────── 분석 실행 · 저장된 분석 불러오기 ───────────── */
  async function loadSaved() { var m = await dbAll(sid() + '|'); UI.saved = {}; Object.keys(m).forEach(function (k) { var p = k.split('|'); if (p.length >= 4 && p[1] !== 'overview' && p[1] !== 'names') UI.saved[p[1] + '|' + p.slice(2).join('|')] = m[k]; }); }
  function getRec(e) { return UI.saved[e.unit + '|' + e.key] || null; }
  function effective(e) {
    var rec = getRec(e), an = rec && (rec.edit || rec.analysis) || ruleAnalysis(e); return an;
  }
  async function runAnalysis(list, mode) {
    var ov = await ovGet(), done = 0, fail = 0, errs = []; UI.busy = true; UI.cancel = false; drawStatus('AI 분석 준비…');
    var queue = list.slice(), workers = [];
    async function worker() {
      while (queue.length && !UI.cancel) {
        var e = queue.shift(), rec = getRec(e) || {};
        try {
          var an = mode === 'ai' ? await aiAnalyze(e, ov) : ruleAnalysis(e);
          rec = { analysis: an, edit: null, updated: Date.now(), n: e.comments.length, fsig: fsig() }; UI.saved[e.unit + '|' + e.key] = rec; await dbPut(ekey(e.unit, e.key), rec);
        } catch (er) { fail++; errs.push(e.label + ': ' + er.message); }
        done++; drawStatus((mode === 'ai' ? 'AI 분석 ' : '기본 분석 ') + done + ' / ' + list.length + (fail ? ' (실패 ' + fail + ')' : ''));
      }
    }
    for (var i = 0; i < (mode === 'ai' ? 2 : 1); i++) workers.push(worker());
    await Promise.all(workers); UI.busy = false; drawStatus(UI.cancel ? '중단했습니다.' : '완료: ' + (done - fail) + '건' + (fail ? ', 실패 ' + fail + '건' : '')); if (errs.length) A.toast(errs[0] + (errs.length > 1 ? ' 외 ' + (errs.length - 1) + '건' : ''), 'err'); drawList();
  }
  function drawStatus(t) { var el = document.getElementById('rpt-status'); if (el) el.textContent = t; }

  /* ───────────── 화면 ───────────── */
  async function show(box) {
    box.innerHTML = '<div class="loading">리포트 준비 중…</div>';
    if (A.ext.theory) await A.ext.theory.load(); UI.merge = (await dbGet(sid() + '|merge')) || {}; UI.ents = facts(UI.unit); await loadSaved(); var ov = await ovGet(), ns = await nameSettings();
    var flt = API().F;
    box.innerHTML = '<div class="panel"><h3>' + ULS[UI.unit] + ' 분석 <span class="muted" style="font-weight:400">· 종합 확인 → 대상 선택 → 리포트 생성</span></h3>' +
      '<div class="msg" style="margin:8px 0">' + I('info', 18) + '<div>현재 응답 범위: <b>' + (A.ext.SINC[flt.sincere] || '전체') + '</b>, ' + (flt.data === 'real' ? '정식 응답' : flt.data === 'test' ? '테스트 응답' : '정식+테스트') + ' 기준으로 만들어집니다. 정식 보고에는 「유효 응답만」을 권장합니다.<br>AI 분석 결과·편집 내용은 <b>이 브라우저에만 저장</b>되고 서버에 올라가지 않습니다. AI에는 이름 없이 집계 수치와 서술 문장만 전송합니다.</div></div>' +
      '<details id="rpt-ov"><summary style="cursor:pointer;font-weight:700;margin:6px 0">① 리포트 개요 (교육처 기입) — 모든 리포트 첫 장에 들어갑니다</summary><div class="grid g2" style="margin-top:8px">' + OV_FIELDS.map(function (f) { var long = /notice|basis|method|target/.test(f[0]); return '<div' + (long ? ' style="grid-column:1/-1"' : '') + '><label class="f">' + E(f[1]) + ' <span class="muted" style="font-weight:400">— ' + E(f[2]) + '</span></label>' + (long ? '<textarea class="fld" rows="2" data-ov="' + f[0] + '">' + E(ov[f[0]] || '') + '</textarea>' : '<input class="fld" data-ov="' + f[0] + '" value="' + E(ov[f[0]] || '') + '">') + '</div>'; }).join('') + '</div><div class="btn-row"><button class="btn btn-primary btn-sm" data-rp="ovsave">개요 저장 (이 브라우저)</button><button class="btn btn-ghost btn-sm" data-rp="ovreset">기본값으로</button></div></details></div>' +
      '<div id="rpt-sum"></div><div class="panel"><h3>② 리포트 종류와 파일명</h3><div class="row" style="gap:14px;flex-wrap:wrap;align-items:flex-end"><label class="chk"><input type="checkbox" data-rp="ta"' + (UI.types.a ? ' checked' : '') + '> 수치·원문 리포트 (내부 보고용)</label><label class="chk"><input type="checkbox" data-rp="tb"' + (UI.types.b ? ' checked' : '') + '> 정성 리포트 (전달용, 수치 없음)</label>' +
      '' + (UI.unit === 'subject' && !((A.cur.survey.def || {}).link || {}).hideProf ? '<label class="chk"><input type="checkbox" data-rp="sp"' + (UI.showProf ? ' checked' : '') + '> 리포트에 담당 교원 표시</label>' : '') + '</div>' +
      '<details style="margin-top:10px"><summary style="cursor:pointer;font-weight:700">파일명 규칙</summary><div class="grid g2" style="margin-top:8px"><div style="grid-column:1/-1"><label class="f">조사명 문구 <code>{조사}</code></label><input class="fld" data-nm="prefix" value="' + E(ns.prefix) + '"></div>' +
      [['prof', '교수별 파일명'], ['klass', '반별 파일명'], ['track', '계열별 파일명'], ['subject', '과목별 파일명']].map(function (u) { return '<div><label class="f">' + u[1] + '</label><input class="fld" data-nm="' + u[0] + '" value="' + E(ns[u[0]]) + '"></div>'; }).join('') + '</div><div class="muted" style="font-size:12.5px;margin-top:6px">사용 가능: {조사} {계열} {교수} {반} {과목} {학기}. 두 종류를 함께 만들면 파일명 끝에 「_내부용」「_전달용」이 붙습니다. <button class="btn btn-ghost btn-sm" data-rp="nmsave">저장</button> <span id="nm-ex" class="muted"></span></div></details></div>' +
      '<div class="panel"><div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><h3 class="sp" style="margin:0">③ ' + ULS[UI.unit] + ' 목록 <span id="rpt-cnt" class="muted" style="font-weight:400"></span></h3>' +
      '<input class="fld" data-rp="q" value="' + E(UI.q) + '" placeholder="이름·계열 검색" style="width:160px"><select class="fld" data-rp="sort" style="width:auto" title="정렬">' + [['def', '계열·이름순'], ['name', '이름순'], ['hi', '점수 높은순'], ['lo', '점수 낮은순'], ['resp', '응답자 많은순'], ['neg', '부정률 높은순']].map(function (o) { return '<option value="' + o[0] + '"' + (UI.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      (UI.unit === 'subject' ? '<button class="btn btn-ghost btn-sm" data-rp="mg" title="선택한 과목을 하나로 합칩니다">선택 과목 합치기</button><button class="btn btn-ghost btn-sm" data-rp="split" title="합쳐진 과목을 다시 나눕니다">합치기 해제</button>' : '') +
      '<button class="btn btn-secondary btn-sm" data-rp="selall">전체 선택</button><button class="btn btn-secondary btn-sm" data-rp="selnone">선택 해제</button>' +
      '<button class="btn btn-primary btn-sm" data-rp="ai">' + I('sparkle', 14) + ' 선택 항목 AI 분석</button><button class="btn btn-secondary btn-sm" data-rp="rule">기본 분석(AI 없이)</button><button class="btn btn-ghost btn-sm" data-rp="stop">중단</button><select class="fld" data-rp="model" style="width:auto" title="AI 모델">' + (A.ext.aiModels || []).map(function (m) { return '<option value="' + E(m[0]) + '"' + ((UI.model || (A.ext.aiModels[0] || [])[0]) === m[0] ? ' selected' : '') + '>' + E(m[1]) + '</option>'; }).join('') + '</select><button class="btn btn-ghost btn-sm" data-rp="reload">다시 계산</button><button class="btn btn-ghost btn-sm" data-rp="bk" title="AI 분석·편집 내용을 파일로 저장">백업 저장</button><button class="btn btn-ghost btn-sm" data-rp="bkload">백업 불러오기</button><input type="file" id="rpt-bkf" accept=".json" hidden></div>' +
      '<div id="rpt-status" class="muted" style="margin:6px 0;min-height:20px"></div><div id="rpt-list"></div>' +
      '<div class="btn-row" style="margin-top:10px"><button class="btn btn-primary" data-rp="zip">' + I('download', 16) + ' 선택 항목 PDF 내려받기(ZIP)</button><button class="btn btn-secondary" data-rp="print">출력</button><span id="rpt-gen" class="muted"></span></div></div>';
    drawList(); drawSummary(); nmExample(ns);
    box.onclick = onClick; box.oninput = onInput; box.onchange = onChange;
  }
  function filtered() {
    var q = UI.q.trim().toLowerCase(), l = UI.ents.filter(function (e) { return !q || (e.label + ' ' + e.track + ' ' + (e.sub || '')).toLowerCase().indexOf(q) >= 0; }), k = UI.sort, nv = function (v, d) { return v == null ? d : v; };
    var cmp = { name: function (a, b) { return a.label.localeCompare(b.label, 'ko'); }, hi: function (a, b) { return nv(b.mean, -1) - nv(a.mean, -1); }, lo: function (a, b) { return nv(a.mean, 9) - nv(b.mean, 9); }, resp: function (a, b) { return b.resp - a.resp; }, neg: function (a, b) { return nv(b.negr, -1) - nv(a.negr, -1); } }[k];
    return cmp ? l.slice().sort(cmp) : l;
  }
  // 종합: 해당 단위 전체 요약 (현재 응답 범위 기준)
  function drawSummary() {
    var el = document.getElementById('rpt-sum'); if (!el) return; var L = UI.ents, ok = L.filter(function (e) { return e.mean != null; }), n = L.length;
    var best = ok.filter(function (e) { return e.resp >= 5; }).slice().sort(function (a, b) { return b.mean - a.mean; }), cm = L.reduce(function (s, e) { return s + e.comments.length; }, 0), an = L.filter(function (e) { return getRec(e); }).length, e0 = L[0];
    var kp = function (l, v, sub) { return '<div class="kpi"><div class="l">' + l + '</div><div class="v">' + v + '</div>' + (sub ? '<div class="s" style="font-size:12px;color:var(--text-2)">' + sub + '</div>' : '') + '</div>'; };
    el.innerHTML = '<div class="kpis">' + kp(ULS[UI.unit] + ' 대상', n + '개') + kp('종합 평균(5점)', e0 ? fmt1(e0.schoolMean) : '-', e0 && e0.schoolPos != null ? '긍정률 ' + Math.round(e0.schoolPos) + '%' : '') +
      kp('최고 평균', best[0] ? fmt1(best[0].mean) : '-', best[0] ? E(best[0].label) : '응답 5명 이상 대상 없음') + kp('최저 평균', best.length > 1 ? fmt1(best[best.length - 1].mean) : '-', best.length > 1 ? E(best[best.length - 1].label) : '') +
      kp('서술 의견', cm + '건') + kp('분석 완료', an + ' / ' + n) + '</div>';
  }
  function fsig() { var F = API().F; return F.data + '|' + F.sincere; }
  function drawList() {
    var el = document.getElementById('rpt-list'); if (!el) return; var list = filtered();
    document.getElementById('rpt-cnt').textContent = '· ' + list.length + '개 중 ' + UI.ents.filter(function (e) { return UI.sel[e.unit + '|' + e.key]; }).length + '개 선택';
    el.innerHTML = '<div class="tbl-wrap" style="max-height:420px;overflow:auto"><table class="t cmpt"><thead><tr><th></th><th>' + UL[UI.unit] + '</th><th>계열</th><th class="num">응답자</th><th class="num">평균</th><th class="num" title="응답자 한 명의 평균점수들의 중앙값(극단 응답의 영향을 보는 참고 지표)">중앙값</th><th class="num">서술 의견</th><th>분석 상태</th><th></th></tr></thead><tbody>' + (list.map(function (e) {
      var k = e.unit + '|' + e.key, rec = getRec(e), st = (rec && rec.fsig && rec.fsig !== fsig() ? '<span class="badge badge-orange" title="분석 당시와 응답 범위·데이터 구분이 다릅니다. 다시 분석하십시오.">필터 변경됨</span> ' : '') + (!rec ? '<span class="badge badge-gray">미분석</span>' : rec.edit ? '<span class="badge badge-blue">수정됨</span>' : rec.analysis && rec.analysis.src === 'ai' ? '<span class="badge badge-green">AI 분석</span>' : '<span class="badge badge-gray">기본 분석</span>');
      return '<tr><td><input type="checkbox" data-rp="chk" data-k="' + E(k) + '"' + (UI.sel[k] ? ' checked' : '') + '></td><td><b>' + E(e.label) + '</b></td><td>' + E(e.track) + '</td><td class="num">' + e.resp + (e.resp < 5 ? ' <span class="badge badge-gray">참고용</span>' : '') + '</td><td class="num">' + fmt1(e.mean) + '</td><td class="num">' + fmt1(e.med) + '</td><td class="num">' + e.comments.length + '</td><td>' + st + '</td><td><button class="btn btn-ghost btn-sm" data-rp="edit" data-k="' + E(k) + '">편집·미리보기</button></td></tr>';
    }).join('') || '<tr><td colspan="9" class="t-empty">대상이 없습니다. (응답 범위·필터를 확인하십시오)</td></tr>') + '</tbody></table></div>';
  }
  function nmExample(ns) { var e = UI.ents[0], el = document.getElementById('nm-ex'); if (el && e) el.textContent = '예: ' + fileName(ns, e, ''); }
  function entByKey(k) { return UI.ents.filter(function (e) { return e.unit + '|' + e.key === k; })[0]; }
  function selected() { return UI.ents.filter(function (e) { return UI.sel[e.unit + '|' + e.key]; }); }
  function kinds() { return (UI.types.a ? ['a'] : []).concat(UI.types.b ? ['b'] : []); }

  async function onInput(e) {
    var t = e.target;
    if (t.getAttribute('data-rp') === 'q') { UI.q = t.value; drawList(); }
  }
  async function onChange(e) {
    var t = e.target, r = t.getAttribute('data-rp');
    if (r === 'sort') { UI.sort = t.value; drawList(); return; }
    if (r === 'sp') { UI.showProf = t.checked; return; }
    if (r === 'unit') { UI.unit = t.value; UI.sel = {}; var bx = document.getElementById('rptmount'); bx.removeAttribute('data-rpt'); A.ext.reportUI(bx); return; }
    if (r === 'model') { UI.model = t.value; return; }
    if (r === 'ta' || r === 'tb') { UI.types[r === 'ta' ? 'a' : 'b'] = t.checked; return; }
    if (r === 'chk') { UI.sel[t.getAttribute('data-k')] = t.checked; drawList(); return; }
    if (t.getAttribute('data-nm')) { nmExample(await nameSettingsLive()); }
  }
  async function nameSettingsLive() { var ns = await nameSettings(); document.querySelectorAll('[data-nm]').forEach(function (i) { ns[i.getAttribute('data-nm')] = i.value; }); return ns; }
  async function onClick(e) {
    var t = e.target.closest('[data-rp]'); if (!t) return; var r = t.getAttribute('data-rp'), box = document.getElementById('rptmount');
    if (r === 'ovsave') { var o = {}; document.querySelectorAll('[data-ov]').forEach(function (i) { o[i.getAttribute('data-ov')] = i.value; }); await dbPut(sid() + '|overview', o); A.toast('개요를 이 브라우저에 저장했습니다.'); }
    else if (r === 'ovreset') { await dbDel(sid() + '|overview'); box.removeAttribute('data-rpt'); A.ext.reportUI(box); }
    else if (r === 'nmsave') { var ns = await nameSettingsLive(); await dbPut(sid() + '|names', ns); nmExample(ns); A.toast('파일명 규칙을 저장했습니다.'); }
    else if (r === 'selall') { filtered().forEach(function (x) { UI.sel[x.unit + '|' + x.key] = true; }); drawList(); }
    else if (r === 'mg' || r === 'split') {
      var sl = selected(); if (r === 'mg' && sl.length < 2) return A.toast('합칠 과목을 2개 이상 선택해 주십시오.', 'err'); if (r === 'split' && !sl.length) return A.toast('나눌 과목을 선택해 주십시오.', 'err');
      var mg = Object.assign({}, UI.merge);
      if (r === 'mg') { var canon = sl[0].key.split('|')[1]; sl.forEach(function (x) { Object.keys(x.raw || {}).forEach(function (rw) { mg[rw] = canon; }); }); }
      else sl.forEach(function (x) { var kk = x.key.split('|')[1]; Object.keys(mg).forEach(function (rw) { if (mg[rw] === kk) delete mg[rw]; }); });
      await dbPut(sid() + '|merge', mg); UI.sel = {}; box.removeAttribute('data-rpt'); A.toast(r === 'mg' ? '과목을 합쳤습니다. (분석 결과는 합쳐진 과목 기준으로 다시 실행해 주십시오)' : '합치기를 해제했습니다.'); A.ext.reportUI(box);
    }
    else if (r === 'bk') { var all = await dbAll(sid() + '|'); var blob = new Blob([JSON.stringify({ v: 1, survey: sid(), saved: Date.now(), data: all })], { type: 'application/json' }), a2 = document.createElement('a'); a2.href = URL.createObjectURL(blob); a2.download = 'survey-report-backup_' + new Date().toISOString().slice(0, 10) + '.json'; a2.click(); setTimeout(function () { URL.revokeObjectURL(a2.href); }, 5000); }
    else if (r === 'bkload') { var fi = document.getElementById('rpt-bkf'); fi.onchange = function () { var f = fi.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = async function () { try { var j = JSON.parse(rd.result), n = 0; if (!j || j.survey !== sid() || !j.data) throw new Error('이 설문의 백업 파일이 아닙니다.'); for (var k in j.data) { await dbPut(k, j.data[k]); n++; } A.toast(n + '건을 불러왔습니다.'); box.removeAttribute('data-rpt'); A.ext.reportUI(box); } catch (er) { A.toast(er.message, 'err'); } fi.value = ''; }; rd.readAsText(f); }; fi.click(); }
    else if (r === 'selnone') { UI.sel = {}; drawList(); }
    else if (r === 'stop') { UI.cancel = true; }
    else if (r === 'reload') { box.removeAttribute('data-rpt'); A.ext.reportUI(box); }
    else if (r === 'ai' || r === 'rule') { var l = selected(); if (!l.length) return A.toast('대상을 선택해 주십시오.', 'err'); if (UI.busy) return; if (r === 'ai' && !(await A.confirm('AI 분석', l.length + '건을 AI로 분석합니다. 서술 문장과 집계 수치(이름 제외)가 AI 제공자에게 전송되며, 호출은 대상당 1회입니다. 진행하시겠습니까?', '분석 시작', '취소'))) return; runAnalysis(l, r); }
    else if (r === 'edit') openEditor(entByKey(t.getAttribute('data-k')));
    else if (r === 'zip' || r === 'print') generate(r === 'print');
  }

  async function generate(toPrint) {
    var sel = selected(), ks = kinds(); if (!sel.length) return A.toast('대상을 선택해 주십시오.', 'err'); if (!ks.length) return A.toast('리포트 종류를 선택해 주십시오.', 'err'); if (UI.busy) return;
    var ov = await ovGet(), ns = await nameSettingsLive(), gen = document.getElementById('rpt-gen'), items = [], both = ks.length > 1, pagesAll = []; UI.busy = true; UI.cancel = false;
    try {
      for (var i = 0; i < sel.length && !UI.cancel; i++) {
        var e = sel[i], an = effective(e);
        for (var j = 0; j < ks.length; j++) {
          if (gen) gen.textContent = (toPrint ? '페이지 구성 ' : 'PDF 생성 ') + (i + 1) + ' / ' + sel.length + ' · ' + e.label;
          var pages = buildPages(e, an, ov, ks[j]);
          if (toPrint) pagesAll = pagesAll.concat(pages); else items.push({ name: fileName(ns, e, both ? (ks[j] === 'a' ? '_내부용' : '_전달용') : ''), blob: await pagesToPdf(pages) });
          await new Promise(function (r) { setTimeout(r, 0); });
        }
      }
      if (UI.cancel) { if (gen) gen.textContent = '중단했습니다.'; return; }
      if (toPrint) { printPages(pagesAll); if (gen) gen.textContent = ''; return; }
      if (items.length === 1) download(items[0].blob, items[0].name);
      else { var zip = new window.JSZip(), used = {}; items.forEach(function (it) { var n = it.name; if (used[n]) { used[n]++; n = n.replace(/\.pdf$/, '(' + used[n] + ').pdf'); } else used[n] = 1; zip.file(n, it.blob); }); download(await zip.generateAsync({ type: 'blob' }), safe(ns.prefix) + '_' + (UI.unit === 'prof' ? '교수별' : UI.unit === 'klass' ? '반별' : '계열별') + '_결과.zip'); }
      if (gen) gen.textContent = items.length + '건을 내려받았습니다.';
    } catch (er) { A.toast('PDF 생성 실패: ' + (er && er.message || er), 'err'); if (gen) gen.textContent = ''; } finally { UI.busy = false; }
  }

  /* ───────────── 편집기 ───────────── */
  async function openEditor(e) {
    if (!e) return; var rec = getRec(e) || { analysis: ruleAnalysis(e), edit: null }, an = JSON.parse(JSON.stringify(rec.edit || rec.analysis)), ov = await ovGet(), kind = 'a';
    var m = A.modal('', function () {}, 'xl'), root = m.el.querySelector('.modal');
    function paint() {
      var cls = an.cls || [];
      root.innerHTML = '<h3>' + E(e.label) + ' <span class="muted" style="font-weight:400">· ' + E(e.track) + ' · 서술 의견 ' + e.comments.length + '건</span></h3>' +
        '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-secondary btn-sm" data-ed="ai">' + I('sparkle', 14) + ' AI로 다시 작성</button><button class="btn btn-ghost btn-sm" data-ed="rule">기본 문안으로</button><span class="sp"></span><button class="btn btn-ghost btn-sm" data-ed="kind" data-k="a"' + (kind === 'a' ? ' style="font-weight:800"' : '') + '>수치·원문 미리보기</button><button class="btn btn-ghost btn-sm" data-ed="kind" data-k="b"' + (kind === 'b' ? ' style="font-weight:800"' : '') + '>정성 리포트 미리보기</button></div>' +
        '<div class="grid g2" style="margin-top:10px;align-items:start"><div>' +
        '<label class="f">교육처 의견 (수치·원문 리포트에 들어감)</label><textarea class="fld" rows="6" data-f="dept">' + E(an.dept || '') + '</textarea>' +
        '<label class="f">정성 리포트 본문 (전달용 · 수치 금지)</label><textarea class="fld" rows="8" data-f="soft">' + E(an.soft || '') + '</textarea><div id="ed-warn" class="muted" style="color:#b45309;font-size:12.5px">' + (/[0-9]/.test(an.soft || '') ? '본문에 숫자가 포함되어 있습니다. 전달용에서는 수치를 빼는 것이 원칙입니다.' : '') + '</div>' +
        '<label class="f">학생들이 인정한 부분 (한 줄에 하나)</label><textarea class="fld" rows="3" data-f="positive">' + E((an.positive || []).join('\n')) + '</textarea>' +
        '<label class="f">함께 살펴볼 부분 (한 줄에 하나)</label><textarea class="fld" rows="3" data-f="negative">' + E((an.negative || []).join('\n')) + '</textarea>' +
        '<label class="f">근거 문헌 ID (쉼표로 구분 · 내부용 리포트 각주, 이론 파일에 있는 ID만 유지)</label><input class="fld" data-f="refs" value="' + E((an.refs || []).join(', ')) + '">' +
        '<label class="f">개선 과제 (한 줄에 하나: 제목 | 방안 | 담당 | 시기)</label><textarea class="fld" rows="5" data-f="actions">' + E((an.actions || []).map(function (a) { return [a.title, a.detail, a.owner, a.when].join(' | '); }).join('\n')) + '</textarea></div>' +
        '<div><label class="f">서술 의견 분류 (눌러서 바꿈)</label><div style="max-height:520px;overflow:auto">' + (e.comments.map(function (c, i) { var x = cls.filter(function (y) { return y.i === i; })[0] || { s: 'neu' }; return '<div class="rp-c" style="border:1px solid #e5e7eb;border-radius:8px;padding:6px 8px;margin:4px 0"><div style="display:flex;gap:6px;margin-bottom:3px">' + [['pos', '긍정'], ['neg', '부정'], ['neu', '기타']].map(function (s) { return '<button class="btn btn-sm ' + (x.s === s[0] ? 'btn-primary' : 'btn-ghost') + '" data-ed="cls" data-i="' + i + '" data-s="' + s[0] + '">' + s[1] + '</button>'; }).join('') + (x.t ? '<span class="badge badge-gray">' + E(x.t) + '</span>' : '') + '</div>' + E(c.t) + '<div class="muted" style="font-size:11.5px">' + E([c.c, c.ql].filter(Boolean).join(' · ')) + '</div></div>'; }).join('') || '<div class="muted">서술 의견이 없습니다.</div>') + '</div></div></div>' +
        '<div id="ed-prev" style="margin-top:10px"></div><div class="btn-row"><button class="btn btn-ghost" data-ed="close">닫기</button><button class="btn btn-secondary" data-ed="prev">미리보기 갱신</button><button class="btn btn-primary" data-ed="save">저장 (이 브라우저)</button></div>';
    }
    function read() { var g = function (f) { var el = root.querySelector('[data-f=' + f + ']'); return el ? el.value : ''; }; an.dept = g('dept'); an.soft = g('soft'); an.positive = g('positive').split('\n').map(function (s) { return s.trim(); }).filter(Boolean); an.negative = g('negative').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      an.refs = g('refs').split(/[\s,]+/).filter(function (x) { return x && A.ext.theory && A.ext.theory.byId(x); }); an.actions = g('actions').split('\n').map(function (l) { var p = l.split('|').map(function (s) { return s.trim(); }); return { title: p[0] || '', detail: p[1] || '', owner: p[2] || '', when: p[3] || '' }; }).filter(function (a) { return a.title || a.detail; }); }
    function prev() { read(); var pages = buildPages(e, an, ov, kind), el = root.querySelector('#ed-prev'); el.innerHTML = '<style>' + CSS + '</style><div style="overflow:auto;max-height:560px;background:#e5e7eb;padding:10px"><div style="display:flex;flex-direction:column;gap:12px;align-items:center">' + pages.map(function (p) { return '<div style="width:' + Math.round(PX.w * 0.7) + 'px;height:' + Math.round(PX.h * 0.7) + 'px;box-shadow:0 1px 6px rgba(0,0,0,.25)"><div style="transform:scale(.7);transform-origin:top left;width:' + PX.w + 'px">' + p + '</div></div>'; }).join('') + '</div></div>'; var w = root.querySelector('#ed-warn'); if (w) w.textContent = /[0-9]/.test(an.soft || '') ? '본문에 숫자가 포함되어 있습니다. 전달용에서는 수치를 빼는 것이 원칙입니다.' : ''; }
    paint(); root.addEventListener('click', async function (ev) {
      var t = ev.target.closest('[data-ed]'); if (!t) return; var a = t.getAttribute('data-ed');
      if (a === 'close') m.close();
      else if (a === 'prev') prev();
      else if (a === 'kind') { read(); kind = t.getAttribute('data-k'); paint(); prev(); }
      else if (a === 'cls') { read(); var i = Number(t.getAttribute('data-i')), s = t.getAttribute('data-s'), x = (an.cls || []).filter(function (y) { return y.i === i; })[0]; if (x) x.s = s; else (an.cls = an.cls || []).push({ i: i, s: s, t: '' }); paint(); }
      else if (a === 'rule') { if (!(await A.confirm('기본 문안으로', '현재 편집 내용이 규칙 기반 기본 문안으로 바뀝니다.', '바꾸기', '취소'))) return; an = ruleAnalysis(e); paint(); }
      else if (a === 'ai') { t.disabled = true; t.textContent = 'AI 작성 중…'; try { an = await aiAnalyze(e, ov); paint(); A.toast('AI 초안을 불러왔습니다. 검토 후 저장하십시오.'); } catch (er) { A.toast(er.message, 'err'); paint(); } }
      else if (a === 'save') { read(); var r0 = getRec(e) || {}; r0.edit = an; r0.analysis = r0.analysis || an; r0.updated = Date.now(); UI.saved[e.unit + '|' + e.key] = r0; await dbPut(ekey(e.unit, e.key), r0); drawList(); A.toast('이 브라우저에 저장했습니다.'); }
    });
    root.setAttribute('data-ed-root', '1'); prev();
  }


  /* ───────────── 모든 설문 공통: 현재 결과 화면 PDF · 인쇄 ───────────── */
  function viewWrap() {
    var body = document.getElementById('gbody'); if (!body) return null; var F = API() && API().F ? API().F : { data: 'real', sincere: 'all' }, sv = A.cur.survey;
    var tabLabel = (document.querySelector('[data-act=gsub][aria-selected=true]') || {}).textContent || '결과';
    var wrap = document.createElement('div'); wrap.style.cssText = 'width:1040px;padding:28px;background:#fff;color:#1f2937;font-family:inherit';
    wrap.innerHTML = '<div style="border-bottom:3px solid #0EA5E9;padding-bottom:8px;margin-bottom:14px"><div style="font-size:20px;font-weight:800;color:#0c4a6e">' + E(sv.title) + ' — ' + E(tabLabel) + '</div><div style="font-size:12px;color:#64748b">' + E(A.fmt(new Date().toISOString())) + ' 출력 · 데이터 ' + (F.data === 'real' ? '정식 응답' : F.data === 'test' ? '테스트 응답' : '정식+테스트') + ' · 응답 범위 ' + E((A.ext.SINC && A.ext.SINC[F.sincere]) || '전체') + '</div></div>';
    var clone = body.cloneNode(true); clone.removeAttribute('id'); clone.querySelectorAll('button,[data-act],.btn-row,input,select').forEach(function (n) { if (n.tagName === 'INPUT' || n.tagName === 'SELECT') n.setAttribute('disabled', ''); });
    wrap.appendChild(clone); return { wrap: wrap, name: safe(sv.title) + '_결과_' + safe(tabLabel) + '_' + new Date().toISOString().slice(0, 10) + '.pdf' };
  }
  A.ext.viewPdf = async function () {
    var v = viewWrap(); if (!v) return; A.toast('PDF를 만드는 중입니다…'); v.wrap.style.cssText += ';position:fixed;left:-99999px;top:0'; document.body.appendChild(v.wrap);
    try {
      await ensureLibs(); var cv = await window.html2canvas(v.wrap, { scale: 1.6, backgroundColor: '#ffffff', useCORS: true, logging: false }), pdf = new window.jspdf.jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' }), W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), k = W / cv.width, ph = Math.floor(H / k), off = 0, first = true;
      while (off < cv.height) { var sh = Math.min(ph, cv.height - off), c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = sh; var cx = c2.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c2.width, sh); cx.drawImage(cv, 0, off, cv.width, sh, 0, 0, cv.width, sh); if (!first) pdf.addPage(); pdf.addImage(c2.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, W, sh * k); first = false; off += sh; }
      download(pdf.output('blob'), v.name); A.toast('PDF를 내려받았습니다.');
    } catch (er) { A.toast('PDF 생성 실패: ' + (er && er.message || er), 'err'); } finally { v.wrap.remove(); }
  };
  A.ext.viewPrint = function () {
    var v = viewWrap(); if (!v) return; var f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f);
    var d = f.contentWindow.document, links = Array.prototype.map.call(document.querySelectorAll('link[rel=stylesheet]'), function (l) { return '<link rel="stylesheet" href="' + l.href + '">'; }).join('');
    d.open(); d.write('<!doctype html><html><head><meta charset="utf-8">' + links + '<style>@page{size:A4;margin:12mm}body{background:#fff}</style></head><body>' + v.wrap.outerHTML.replace('width:1040px', 'width:auto') + '</body></html>'); d.close();
    setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(function () { f.remove(); }, 60000); }, 900);
  };
  A.ext.rviews = A.ext.rviews || {}; A.ext.rviews.rpt = function () { setTimeout(function () { var m = document.getElementById('rptmount'); if (m) A.ext.reportUI(m); }, 0); return '<div id="rptmount"><div class="loading">불러오는 중…</div></div>'; };
  A.ext.reportUI = function (body) {
    var F = API().F, v = UI.view || 'list', sig = [F.data, F.sincere, UI.unit, v, sid()].join('|');
    if (body.getAttribute('data-rpt') === sig && (body.querySelector('#rpt-list') || body.querySelector('#rpt-view'))) return;
    body.setAttribute('data-rpt', sig);
    if (v !== 'list' && A.ext.rptViews && A.ext.rptViews[v]) return A.ext.rptViews[v](body);
    return show(body);
  };
  // 다른 모듈(회차 비교·종합 보고서 등)이 쓰는 공용 함수
  A.ext.rptApi = { UI: UI, facts: facts, ruleClassify: ruleClassify, ruleAnalysis: ruleAnalysis, medianOf: medianOf, fmt1: fmt1, secShort: secShort, ovGet: ovGet, ovTable: ovTable, paginate: paginate, pageShell: pageShell, pagesToPdf: pagesToPdf, printPages: printPages, download: download, getRec: getRec, loadSaved: loadSaved, dbGet: dbGet, dbPut: dbPut, sid: sid, round2: round2, parseJson: parseJson, collect: collect, subjRaw: subjRaw, safe: safe, ensureLibs: ensureLibs, CSS: function () { return CSS; }, PX: PX };
})();