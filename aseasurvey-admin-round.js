'use strict';
/**
 * aseasurvey-admin-round.js — 결과 「분석」 메뉴의 종합 화면 4종
 *  · 회차 비교 : 중간 ↔ 기말(별도 설문 + 회차 라벨)을 같은 문항(앵커)으로 비교. 대상별 증감 + 응답 수 병기
 *  · 주제 연결 : 서술 의견을 주제로 묶고, 관련 영역 점수와 나란히 표시 (키워드 기반 간이 분류)
 *  · 우선순위 : 면담·지원 필요도(평균·부정률·부정 의견 비중·회차 하락) — 가중치 조절. 교원 서열이 아닙니다.
 *  · 종합 보고서 : 학교 전체 A4 보고서(PDF·인쇄) + 교육처 의견 편집
 * 저장: 교육처 의견은 이 브라우저(IndexedDB)에만 저장합니다. 서버로 보내지 않습니다.
 * 공용 함수는 aseasurvey-admin-report.js 가 노출한 A.ext.rptApi 를 사용합니다.
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico, R = function () { return A.ext.rptApi; }, API = function () { return A.ext.resApi; };
  var V = A.ext.rptViews = A.ext.rptViews || {};
  var UNITS = [['track', '계열'], ['klass', '반'], ['prof', '교원'], ['subject', '과목']];
  var RN = A.ext.rnd = A.ext.rnd || { unit: 'track', cid: '', other: null, later: 'cur', sort: 'd', dir: -1, loading: false, err: '', sid: '', cache: {} };
  var PR = { unit: 'prof', w: { low: 40, neg: 25, cmt: 20, drop: 15 } };
  var TH = { scope: '' };
  var OV = { txt: null };

  function f2(v) { return v == null || isNaN(v) ? '-' : v.toFixed(2); }
  function pc(v) { return v == null || isNaN(v) ? '-' : Math.round(v) + '%'; }
  function sg(v) { return v == null || isNaN(v) ? '-' : (v > 0 ? '+' : '') + v.toFixed(2); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dcol(d) { return d == null ? '' : d >= 0.05 ? 'color:#15803d' : d <= -0.05 ? 'color:#b91c1c' : 'color:#64748b'; }
  function arrow(d) { return d == null ? '' : d >= 0.05 ? '▲' : d <= -0.05 ? '▼' : '–'; }
  function uLabel(u) { return (UNITS.filter(function (x) { return x[0] === u; })[0] || [0, u])[1]; }
  function sidv() { return A.cur.survey.id; }
  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function kindOf(def) { var k = def && def.round && def.round.kind; return k === 'mid' ? '중간' : k === 'final' ? '기말' : ''; }

  async function ready() {
    var r = R(); r.UI.merge = (await r.dbGet(r.sid() + '|merge')) || {}; await r.loadSaved();
    if (RN.sid !== sidv()) { RN.sid = sidv(); RN.cid = lsGet('svy_rnd_' + sidv()); RN.other = null; RN.cache = {}; RN.err = ''; }
  }
  function unitSelect(attr, cur) { return '<select class="fld" ' + attr + ' style="width:auto">' + UNITS.map(function (u) { return '<option value="' + u[0] + '"' + (cur === u[0] ? ' selected' : '') + '>' + u[1] + '별</option>'; }).join('') + '</select>'; }
  function pagesPreview(el, pages) {
    el.innerHTML = '<style>' + R().CSS() + '</style><div style="overflow:auto;max-height:620px;background:#e5e7eb;padding:10px"><div style="display:flex;flex-direction:column;gap:12px;align-items:center">' + pages.map(function (p) { return '<div style="width:' + Math.round(R().PX.w * 0.7) + 'px;height:' + Math.round(R().PX.h * 0.7) + 'px;box-shadow:0 1px 6px rgba(0,0,0,.25)"><div style="transform:scale(.7);transform-origin:top left;width:' + R().PX.w + 'px">' + p + '</div></div>'; }).join('') + '</div></div>';
  }

  /* ───────────── 회차 비교: 계산 ───────────── */
  function anchorsOf(Qa, Qb) { var m = {}; Qa.scale.forEach(function (x) { if (Qb.scale.some(function (y) { return y.q.id === x.q.id; })) m[x.q.id] = x; }); return m; }
  function ctxPair() {
    var o = RN.other; if (!o) return null; var Qc = API().questions(), Qo = API().questions(o.def), anc = anchorsOf(Qc, Qo);
    return { anc: anc, cur: { rows: API().rows(), courses: A.cur.courses, Q: Qc, anchors: anc }, oth: { rows: o.rows, courses: o.courses || [], Q: Qo, anchors: anc } };
  }
  function pairKey(unit) { var F = API().F; return [unit, F.data, F.sincere, RN.other && RN.other.id, RN.later, API().rows().length, R().UI.merge && Object.keys(R().UI.merge).length].join('|'); }
  function compute(unit) {
    if (!RN.other) return null; var k = pairKey(unit); if (RN.cache[k]) return RN.cache[k];
    var P = ctxPair(), a = R().facts(unit, P.cur), b = R().facts(unit, P.oth), prev = RN.later === 'cur' ? b : a, now = RN.later === 'cur' ? a : b, pm = {};
    prev.forEach(function (e) { pm[e.key] = e; });
    var rows = [], only = 0;
    now.forEach(function (e) { var p = pm[e.key]; if (!p || p.mean == null || e.mean == null) { only++; return; } rows.push({ key: e.key, unit: unit, label: e.label, track: e.track, pm: p.mean, nm: e.mean, d: e.mean - p.mean, pr: p.resp, nr: e.resp, pp: p.posr, np: e.posr, pmed: p.med, nmed: e.med, secs: e.secs.map(function (s, i) { var q = (p.secs.filter(function (x) { return x.id === s.id; })[0]) || {}; return { id: s.id, title: s.title, pm: q.mean, nm: s.mean }; }) }); });
    var sch = function (arr) { var r0 = arr[0]; return r0 ? { mean: r0.schoolMean, pos: r0.schoolPos, secs: r0.secs } : { mean: null, pos: null, secs: [] }; };
    var res = { rows: rows, only: only, anc: Object.keys(P.anc).map(function (id) { return { id: id, label: P.anc[id].q.label }; }), prev: sch(prev), now: sch(now), prevResp: prev.reduce(function (s, e) { return s + e.resp; }, 0), nowResp: now.reduce(function (s, e) { return s + e.resp; }, 0), unit: unit };
    RN.cache[k] = res; return res;
  }
  function labels() { var o = RN.other; if (!o) return ['이전', '현재']; var c = kindOf(A.cur.survey.def), p = kindOf(o.def); return RN.later === 'cur' ? [p || '이전', c || '현재'] : [c || '이전', p || '이후']; }

  /* ───────────── 회차 비교: 화면 ───────────── */
  V.rnd = async function (box) {
    box.innerHTML = '<div id="rpt-view" class="loading">불러오는 중…</div>'; await ready();
    var list = (A.list || []).filter(function (s) { return s.id !== sidv(); }), cur = A.cur.survey;
    if (!RN.cid && list.length) { var same = list.filter(function (s) { return s.semester && s.semester === cur.semester; })[0]; RN.cid = (same || list[0]).id; }
    function draw() {
      var lb = labels(), h = '<div id="rpt-view"><div class="panel"><h3>회차 비교 <span class="muted" style="font-weight:400">· 중간 ↔ 기말 같은 문항(앵커) 비교</span></h3>' +
        '<div class="msg" style="margin:8px 0">' + I('info', 18) + '<div>두 설문에 <b>같은 문항 ID</b>가 있는 척도 문항만 비교합니다. 설문은 익명이라 같은 학생을 연결할 수 없으므로 <b>개인 단위 변화가 아니라 응답자 집단의 평균 차이</b>입니다. 응답자 구성이 달라 생긴 차이일 수 있으니 응답 수와 함께 해석하십시오. 설문 설계의 「회차」 항목에서 중간·기말을 지정하면 표시가 정확해집니다.</div></div>' +
        '<div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end"><div style="min-width:260px;flex:1"><label class="f">비교할 설문</label><select class="fld" data-rn="cid"><option value="">선택</option>' + list.map(function (s) { return '<option value="' + s.id + '"' + (RN.cid === s.id ? ' selected' : '') + '>' + E(s.title) + (s.semester ? ' (' + E(s.semester) + ')' : '') + '</option>'; }).join('') + '</select></div>' +
        '<div><label class="f">현재 설문은 선택 설문보다</label><select class="fld" data-rn="later"><option value="cur"' + (RN.later === 'cur' ? ' selected' : '') + '>이후 회차 (예: 현재=기말)</option><option value="oth"' + (RN.later === 'oth' ? ' selected' : '') + '>이전 회차 (예: 현재=중간)</option></select></div>' +
        '<div><button class="btn btn-primary" data-rn="load"' + (RN.cid ? '' : ' disabled') + '>' + (RN.loading ? '불러오는 중…' : '불러와 비교') + '</button></div></div></div>';
      if (RN.err) h += '<div class="msg err">' + E(RN.err) + '</div>';
      if (RN.other) {
        var T = compute(RN.unit), up = T.rows.filter(function (r) { return r.d >= 0.05; }).length, dn = T.rows.filter(function (r) { return r.d <= -0.05; }).length, ds = T.now.mean != null && T.prev.mean != null ? T.now.mean - T.prev.mean : null;
        h += '<div class="kpis"><div class="kpi"><div class="l">앵커 문항</div><div class="v">' + T.anc.length + '개</div><div class="s">두 설문에 모두 있는 척도 문항</div></div>' +
          '<div class="kpi"><div class="l">' + E(lb[0]) + ' 응답자 / ' + E(lb[1]) + ' 응답자</div><div class="v">' + T.prevResp + ' → ' + T.nowResp + '</div></div>' +
          '<div class="kpi"><div class="l">전체 평균 (앵커 기준)</div><div class="v">' + f2(T.prev.mean) + ' → ' + f2(T.now.mean) + '</div><div class="s" style="' + dcol(ds) + '">' + arrow(ds) + ' ' + sg(ds) + '</div></div>' +
          '<div class="kpi"><div class="l">' + uLabel(RN.unit) + '별 변화</div><div class="v">▲ ' + up + ' · ▼ ' + dn + '</div><div class="s">±0.05 이상 · 비교 불가 ' + T.only + '개</div></div></div>';
        if (!T.anc.length) h += '<div class="msg err">같은 문항 ID가 없어 비교할 수 없습니다. 중간 설문을 현재 설문을 복제해 만들면 문항 ID가 같아집니다.</div>';
        h += '<div class="panel"><h3>영역별 변화 (학교 전체)</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>영역</th><th class="num">' + E(lb[0]) + '</th><th class="num">' + E(lb[1]) + '</th><th class="num">증감</th></tr></thead><tbody>' + T.now.secs.map(function (s, i) { var p = (T.prev.secs.filter(function (x) { return x.id === s.id; })[0] || {}), d = s.mean != null && p.mean != null ? s.mean - p.mean : null; return '<tr><td>' + E(R().secShort(s.title)) + '</td><td class="num">' + f2(p.mean) + '</td><td class="num">' + f2(s.mean) + '</td><td class="num" style="' + dcol(d) + '"><b>' + arrow(d) + ' ' + sg(d) + '</b></td></tr>'; }).join('') + '</tbody></table></div></div>';
        var rows = T.rows.slice(), sk = RN.sort, dir = RN.dir;
        rows.sort(function (a, b) { var x = sk === 'n' ? a.label.localeCompare(b.label, 'ko') : sk === 'p' ? a.pm - b.pm : sk === 'm' ? a.nm - b.nm : sk === 'r' ? a.nr - b.nr : a.d - b.d; return x * dir; });
        h += '<div class="panel"><div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><h3 class="sp" style="margin:0">' + uLabel(RN.unit) + '별 증감</h3>' + unitSelect('data-rn="unit"', RN.unit) + '</div><div class="tbl-wrap" style="max-height:560px;overflow:auto;margin-top:8px"><table class="t cmpt"><thead><tr>' +
          [['n', uLabel(RN.unit)], ['', '계열'], ['p', lb[0]], ['m', lb[1]], ['d', '증감'], ['r', '응답(' + lb[0] + '→' + lb[1] + ')']].map(function (c) { return c[0] ? '<th class="' + (c[0] === 'n' ? '' : 'num') + ' thsort" data-rn="sort" data-k="' + c[0] + '" style="cursor:pointer">' + E(c[1]) + (sk === c[0] ? (dir > 0 ? ' ▲' : ' ▼') : '') + '</th>' : '<th>' + E(c[1]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          (rows.map(function (r) { var small = r.pr < 5 || r.nr < 5; return '<tr><td><b>' + E(r.label) + '</b></td><td>' + E(r.track) + '</td><td class="num">' + f2(r.pm) + '</td><td class="num">' + f2(r.nm) + '</td><td class="num" style="' + dcol(r.d) + '"><b>' + arrow(r.d) + ' ' + sg(r.d) + '</b></td><td class="num">' + r.pr + ' → ' + r.nr + (small ? ' <span class="badge badge-gray">참고용</span>' : '') + '</td></tr>'; }).join('') || '<tr><td colspan="6" class="t-empty">양쪽 설문에 모두 있는 대상이 없습니다.</td></tr>') + '</tbody></table></div>' +
          '<div class="muted" style="font-size:12.5px;margin-top:6px">평균 회귀(처음에 낮았던 대상이 저절로 오르는 현상)와 응답자 구성 차이, 성적 확정 시점의 영향이 섞일 수 있으므로 증감을 곧바로 개선 성과로 해석하지 마십시오.</div></div>';
      }
      box.innerHTML = h + '</div>';
    }
    draw();
    box.onchange = function (e) {
      var k = e.target.getAttribute('data-rn'); if (!k) return;
      if (k === 'cid') { RN.cid = e.target.value; lsSet('svy_rnd_' + sidv(), RN.cid); RN.other = null; RN.err = ''; draw(); }
      else if (k === 'later') { RN.later = e.target.value; draw(); } else if (k === 'unit') { RN.unit = e.target.value; draw(); }
    };
    box.onclick = async function (e) {
      var t = e.target.closest('[data-rn]'); if (!t) return; var k = t.getAttribute('data-rn');
      if (k === 'sort') { var c = t.getAttribute('data-k'); if (RN.sort === c) RN.dir = -RN.dir; else { RN.sort = c; RN.dir = c === 'n' ? 1 : -1; } draw(); }
      else if (k === 'load' && RN.cid && !RN.loading) {
        RN.loading = true; RN.err = ''; draw();
        try { RN.other = await A.ext.loadOther(RN.cid); RN.cache = {}; if (!RN.other.def) throw new Error('설문 정의를 불러오지 못했습니다.'); } catch (er) { RN.err = er.message || String(er); RN.other = null; }
        RN.loading = false; draw();
      }
    };
    if (RN.cid && !RN.other && lsGet('svy_rnd_' + sidv()) === RN.cid && !RN.loading) { RN.loading = true; draw(); try { RN.other = await A.ext.loadOther(RN.cid); RN.cache = {}; } catch (er) { RN.err = er.message || String(er); } RN.loading = false; draw(); }
  };

  // 대상별 리포트(PDF)에 회차 대비 변화를 넣음 (수치형 내부용 리포트에만)
  A.ext.rptExtraBlocks = function (ent) {
    try {
      if (!RN.other || RN.sid !== sidv()) return []; var T = compute(ent.unit), r = T && T.rows.filter(function (x) { return x.key === ent.key; })[0]; if (!r) return [];
      var lb = labels();
      return [{ keep: 1, h: '<div class="rp-h2">회차 대비 변화 <small style="font-weight:400;color:#64748b">(' + E(lb[0]) + ' → ' + E(lb[1]) + ', 같은 문항 기준)</small></div>' },
        { h: '<table class="rp-t"><thead><tr><th></th><th class="n">' + E(lb[0]) + '</th><th class="n">' + E(lb[1]) + '</th><th class="n">증감</th></tr></thead><tbody><tr><td>종합 평균</td><td class="n">' + f2(r.pm) + '</td><td class="n">' + f2(r.nm) + '</td><td class="n"><b>' + sg(r.d) + '</b></td></tr><tr><td>응답자</td><td class="n">' + r.pr + '</td><td class="n">' + r.nr + '</td><td class="n"></td></tr>' + r.secs.filter(function (s) { return s.nm != null && s.pm != null; }).map(function (s) { return '<tr><td>' + E(R().secShort(s.title)) + '</td><td class="n">' + f2(s.pm) + '</td><td class="n">' + f2(s.nm) + '</td><td class="n">' + sg(s.nm - s.pm) + '</td></tr>'; }).join('') + '</tbody></table><div style="font-size:11.5px;color:#64748b;margin-top:4px">응답자 집단이 서로 다르므로 개인 단위 변화가 아닌 집단 평균의 차이이며, 참고용으로 해석하십시오.</div>' }];
    } catch (e) { return []; }
  };

  /* ───────────── 주제 연결 ───────────── */
  var TOPICS = [
    ['실습·실기', /실습|실기|장비|기기|실험|체험|현장|공구/, /참여형|실습|학습 성과/],
    ['진도·속도', /진도|속도|빠르|느리|따라가|분량|시간이 ?(부족|짧)/, /수업 진행|진행/],
    ['설명·전달', /설명|이해|가르|강의|전달|발음|목소리|예시|쉽게/, /수업 진행|진행/],
    ['자료·교재', /교재|자료|ppt|프린트|교안|영상|책|유인물/, /수업 전/],
    ['소통·태도', /친절|소통|질문|피드백|배려|존중|태도|열정|칭찬|불친절|무시|격려/, /정리|피드백|참여형/],
    ['평가·과제', /시험|평가|과제|숙제|채점|퀴즈|성적|기준/, /정리|평가|피드백/],
    ['시설·환경', /시설|강의실|교실|에어컨|냉방|난방|컴퓨터|와이파이|소음|환경|실습실/, null],
    ['운영·출결', /출결|지각|휴강|보강|시간표|공지|일정|결석|수업 시간/, /수업 전/],
    ['수업 참여', /참여|토론|발표|조별|팀|활동|흥미|재미|집중|동기/, /참여형/]
  ];
  A.ext.rptTopics = TOPICS;
  // 회차 비교가 불러와져 있으면 대상의 증감을 제공 (이론 근거 선택 신호용)
  A.ext.rptDelta = function (e) { try { if (!RN.other || RN.sid !== sidv()) return null; var T0 = compute(e.unit), r = T0 && T0.rows.filter(function (x) { return x.key === e.key; })[0]; return r ? r.d : null; } catch (er) { return null; } };
  A.ext.rptRound = function () { var k = (A.cur.survey.def && A.cur.survey.def.round && A.cur.survey.def.round.kind) || ''; return k === 'mid' ? 'midterm' : k === 'final' ? 'final' : ''; };
  function themeStats(scope) {
    var ents = R().facts('track'), cm = [], scopeEnt = null, lab = {};
    ents.forEach(function (e) { if (scope && e.track !== scope) return; if (scope) scopeEnt = e; e.comments.forEach(function (c) { cm.push(c); }); });
    var secs = scopeEnt ? scopeEnt.secs.map(function (s) { return { title: s.title, mean: s.mean }; }) : ((ents[0] && ents[0].secs) || []).map(function (s) { return { title: s.title, mean: s.school }; });
    var out = TOPICS.map(function (t) { return { name: t[0], re: t[1], sre: t[2], n: 0, pos: 0, neg: 0, neu: 0, ex: { neg: [], pos: [] }, secMean: null, secs: [] }; }), none = 0;
    cm.forEach(function (c) {
      var s = R().ruleClassify(c.t), hit = false; out.forEach(function (o) { if (o.re.test(c.t.toLowerCase())) { hit = true; o.n++; o[s]++; if (s !== 'neu' && o.ex[s].length < 3) o.ex[s].push(c.t.length > 90 ? c.t.slice(0, 90) + '…' : c.t); } });
      if (!hit) none++;
    });
    out.forEach(function (o) { if (!o.sre) return; var ms = secs.filter(function (s) { return o.sre.test(s.title) && s.mean != null; }); if (ms.length) { o.secMean = ms.reduce(function (a, s) { return a + s.mean; }, 0) / ms.length; o.secs = ms.map(function (s) { return R().secShort(s.title); }); } });
    return { topics: out, total: cm.length, none: none, tracks: ents.map(function (e) { return e.track; }) };
  }
  V.thm = async function (box) {
    box.innerHTML = '<div id="rpt-view" class="loading">불러오는 중…</div>'; await ready();
    function draw() {
      var S = themeStats(TH.scope), L = S.topics.filter(function (o) { return o.n; }).sort(function (a, b) { return b.neg - a.neg || b.n - a.n; }), school = (R().facts('track')[0] || {}).schoolMean;
      var top = L.filter(function (o) { return o.n >= 3 && o.neg / o.n >= 0.3; }).slice(0, 3);
      var ins = top.map(function (o) { return o.name + ' 주제는 언급 ' + o.n + '건 중 부정 ' + o.neg + '건(' + Math.round(o.neg / o.n * 100) + '%)이며' + (o.secMean != null ? ', 연결 영역(' + o.secs.join('·') + ') 평균은 ' + f2(o.secMean) + '점' + (school != null ? '(전체 ' + f2(school) + '점)' : '') + '입니다.' : '입니다.'); });
      box.innerHTML = '<div id="rpt-view"><div class="panel"><div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><h3 class="sp" style="margin:0">주제 연결 분석 <span class="muted" style="font-weight:400">· 서술 의견 ' + S.total + '건</span></h3><select class="fld" data-th="scope" style="width:auto"><option value="">학교 전체</option>' + S.tracks.map(function (t) { return '<option value="' + E(t) + '"' + (TH.scope === t ? ' selected' : '') + '>' + E(t) + '</option>'; }).join('') + '</select></div>' +
        '<div class="msg" style="margin:8px 0">' + I('info', 18) + '<div>주제와 긍정·부정은 <b>키워드 기반 간이 분류</b>입니다. 한 의견이 여러 주제에 속할 수 있고, 반어법·문맥은 반영하지 못합니다. 정밀 분류는 「교수별·반별 분석」의 AI 분석을 사용하십시오. 연결 영역은 주제와 가장 가까운 설문 영역이며 인과를 뜻하지 않습니다.</div></div>' +
        (ins.length ? '<div class="insights"><h3>' + I('sparkle', 15) + ' 핵심 요약</h3>' + ins.map(function (z) { return '<div class="ins warn"><i></i><span>' + E(z) + '</span></div>'; }).join('') + '</div>' : '') +
        '<div class="tbl-wrap"><table class="t"><thead><tr><th>주제</th><th class="num">언급</th><th class="num">긍정</th><th class="num">부정</th><th class="num">부정 비율</th><th>연결 영역 평균</th><th>대표 의견</th></tr></thead><tbody>' +
        (L.map(function (o) { return '<tr><td><b>' + E(o.name) + '</b></td><td class="num">' + o.n + '</td><td class="num">' + o.pos + '</td><td class="num">' + o.neg + '</td><td class="num">' + (o.n ? Math.round(o.neg / o.n * 100) + '%' : '-') + '</td><td>' + (o.secMean != null ? '<b>' + f2(o.secMean) + '</b> <span class="muted" style="font-size:12px">' + E(o.secs.join('·')) + '</span>' : '<span class="muted">해당 영역 없음</span>') + '</td><td class="wrapcell" style="font-size:12.5px">' + o.ex.neg.map(function (x) { return '<div style="color:#b91c1c">- ' + E(x) + '</div>'; }).join('') + o.ex.pos.slice(0, 1).map(function (x) { return '<div style="color:#15803d">+ ' + E(x) + '</div>'; }).join('') + '</td></tr>'; }).join('') || '<tr><td colspan="7" class="t-empty">분류할 서술 의견이 없습니다.</td></tr>') + '</tbody></table></div>' +
        '<div class="muted" style="font-size:12.5px;margin-top:6px">주제에 해당하지 않은 의견 ' + S.none + '건 · 의견 원문 확인은 「문항 상세」 탭에서 합니다.</div></div></div>';
    }
    draw(); box.onchange = function (e) { if (e.target.getAttribute('data-th') === 'scope') { TH.scope = e.target.value; draw(); } };
  };

  /* ───────────── 우선순위 (면담·지원 필요도) ───────────── */
  function negShare(e) {
    var t = e.comments.length; if (!t) return null; var rec = R().getRec(e), an = rec && (rec.edit || rec.analysis), n = 0;
    e.comments.forEach(function (c, i) { var s; if (an && an.cls && an.cls.length) { var x = an.cls.filter(function (y) { return y.i === i; })[0]; s = x ? x.s : 'neu'; } else s = R().ruleClassify(c.t); if (s === 'neg') n++; });
    return n / t;
  }
  V.prio = async function (box) {
    box.innerHTML = '<div id="rpt-view" class="loading">불러오는 중…</div>'; await ready();
    function rows() {
      var ents = R().facts(PR.unit), school = ents[0] && ents[0].schoolMean, dmap = {};
      if (RN.other) { var T = compute(PR.unit); T.rows.forEach(function (r) { dmap[r.key] = r.d; }); }
      return ents.map(function (e) {
        var comp = { low: school != null && e.mean != null ? clamp((school - e.mean) / 1.0, 0, 1) * 100 : null, neg: e.negr != null ? clamp(e.negr / 30, 0, 1) * 100 : null, cmt: null, drop: dmap[e.key] != null ? clamp(-dmap[e.key] / 0.5, 0, 1) * 100 : null }, ns = negShare(e);
        if (ns != null) comp.cmt = clamp(ns / 0.5, 0, 1) * 100;
        var sw = 0, sv = 0; Object.keys(PR.w).forEach(function (k) { if (comp[k] != null && PR.w[k] > 0) { sw += PR.w[k]; sv += PR.w[k] * comp[k]; } });
        return { e: e, comp: comp, ns: ns, d: dmap[e.key], score: sw ? sv / sw : 0 };
      }).sort(function (a, b) { return b.score - a.score; });
    }
    function draw() {
      var L = rows(), W = PR.w;
      box.innerHTML = '<div id="rpt-view"><div class="panel"><div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><h3 class="sp" style="margin:0">면담·지원 필요도 우선순위</h3>' + unitSelect('data-pr="unit"', PR.unit) + '</div>' +
        '<div class="msg" style="margin:8px 0">' + I('info', 18) + '<div><b>이 점수는 면담·지원 대상을 정하기 위한 참고 값이며, 교원이나 반의 서열·인사 평가가 아닙니다.</b> 응답 수가 적은 대상은 값이 크게 흔들리므로 「참고용」 표시를 확인하십시오. 서술 의견 비중은 저장된 AI 분석이 있으면 그 분류를, 없으면 키워드 기반 간이 분류를 사용합니다.' + (RN.other ? '' : ' 회차 하락 항목은 「회차 비교」에서 비교 설문을 불러온 뒤 반영됩니다.') + '</div></div>' +
        '<div class="grid g2" style="gap:10px">' + [['low', '평균이 전체보다 낮음'], ['neg', '부정 응답(1·2점) 비율'], ['cmt', '부정 서술 의견 비중'], ['drop', '회차 대비 하락']].map(function (c) { return '<div><label class="f">' + c[1] + ' <b id="pw-' + c[0] + '">' + W[c[0]] + '</b></label><input type="range" min="0" max="100" step="5" value="' + W[c[0]] + '" data-pr="w" data-k="' + c[0] + '" style="width:100%"></div>'; }).join('') + '</div></div>' +
        '<div class="panel"><div class="tbl-wrap" style="max-height:620px;overflow:auto"><table class="t cmpt"><thead><tr><th>순위</th><th>' + uLabel(PR.unit) + '</th><th>계열</th><th class="num">응답</th><th class="num">평균</th><th class="num">부정률</th><th class="num">부정 의견</th><th class="num">회차 증감</th><th>지원 필요도</th></tr></thead><tbody>' +
        (L.map(function (r, i) { var e = r.e; return '<tr><td class="num">' + (i + 1) + '</td><td><b>' + E(e.label) + '</b></td><td>' + E(e.track) + '</td><td class="num">' + e.resp + (e.resp < 5 ? ' <span class="badge badge-gray">참고용</span>' : '') + '</td><td class="num">' + f2(e.mean) + '</td><td class="num">' + pc(e.negr) + '</td><td class="num">' + (r.ns == null ? '-' : Math.round(r.ns * 100) + '%') + '</td><td class="num" style="' + dcol(r.d) + '">' + (r.d == null ? '-' : arrow(r.d) + ' ' + sg(r.d)) + '</td><td style="min-width:140px"><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;background:#e5e7eb;border-radius:6px;height:8px"><i style="display:block;height:8px;border-radius:6px;background:' + (r.score >= 60 ? '#dc2626' : r.score >= 35 ? '#ea580c' : '#16a34a') + ';width:' + Math.round(r.score) + '%"></i></div><b>' + Math.round(r.score) + '</b></div></td></tr>'; }).join('') || '<tr><td colspan="9" class="t-empty">대상이 없습니다.</td></tr>') + '</tbody></table></div></div></div>';
    }
    draw();
    box.onchange = function (e) { if (e.target.getAttribute('data-pr') === 'unit') { PR.unit = e.target.value; draw(); } };
    box.oninput = function (e) { var t = e.target; if (t.getAttribute('data-pr') === 'w') { PR.w[t.getAttribute('data-k')] = Number(t.value); var lab = document.getElementById('pw-' + t.getAttribute('data-k')); if (lab) lab.textContent = t.value; clearTimeout(PR._t); PR._t = setTimeout(function () { var y = box.scrollTop; draw(); }, 120); } };
  };

  /* ───────────── 종합 보고서 ───────────── */
  function overall() {
    var tr = R().facts('track'), pr = R().facts('prof'), cnt = 0, neg = 0, pos = 0, resp = 0, rms = [];
    tr.forEach(function (e) { cnt += e.agg.n; neg += e.agg.neg; pos += e.agg.pos; resp += e.resp; Object.keys(e.rm).forEach(function (k) { rms.push(e.rm[k].s / e.rm[k].n); }); });
    var bins = [['3.0 미만', 0, 3], ['3.0~3.5', 3, 3.5], ['3.5~4.0', 3.5, 4], ['4.0~4.5', 4, 4.5], ['4.5 이상', 4.5, 9]].map(function (b) { return { n: b[0], lo: b[1], hi: b[2], c: 0 }; }), small = 0;
    pr.forEach(function (e) { if (e.mean == null) return; if (e.resp < 5) { small++; return; } bins.some(function (b) { if (e.mean >= b.lo && e.mean < b.hi) { b.c++; return true; } }); });
    return { tr: tr, pr: pr, resp: resp, cnt: cnt, mean: tr[0] ? tr[0].schoolMean : null, posr: cnt ? pos / cnt * 100 : null, negr: cnt ? neg / cnt * 100 : null, med: R().medianOf(rms), secs: (tr[0] && tr[0].secs) || [], bins: bins, small: small, profN: pr.length };
  }
  function ovrPick(D, TS) {
    var Th = A.ext.theory; if (!Th || !Th.data) return []; var sig = ['general', 'unit:school'], keyOf = { '실습·실기': 'practice', '진도·속도': 'pace', '설명·전달': 'explain', '자료·교재': 'material', '소통·태도': 'rapport', '평가·과제': 'assess', '시설·환경': 'facility', '운영·출결': 'admin', '수업 참여': 'engage' };
    TS.topics.forEach(function (o) { if (o.n >= 3 && o.neg / o.n >= 0.3 && keyOf[o.name]) sig.push('topic:' + keyOf[o.name]); });
    if (RN.other && RN.sid === sidv()) { var T0 = compute('track'), d = T0.now.mean != null && T0.prev.mean != null ? T0.now.mean - T0.prev.mean : null; sig.push('has_round'); if (d != null && d <= -0.15) sig.push('decline'); if (d != null && d >= 0.15) sig.push('improve'); }
    var rd = A.ext.rptRound(); if (rd) sig.push(rd); if (D.profN) sig.push('ranking'); if (D.small) sig.push('small_n');
    return Th.pick(sig, 'ovr|' + sidv(), 4);
  }
  function ovrRuleText(D, TS) {
    var s = D.secs.filter(function (x) { return x.school != null; }).slice().sort(function (a, b) { return b.school - a.school; }), hi = s.slice(0, 2), lo = s.slice(-2).reverse(), tp = TS.topics.filter(function (o) { return o.n >= 3; }).sort(function (a, b) { return b.neg / b.n - a.neg / a.n; })[0];
    var op = '전체 종합 평균은 ' + f2(D.mean) + '점(5점 만점, 5점이 가장 긍정), 긍정 응답(4·5점) 비율은 ' + pc(D.posr) + '입니다. ' + (hi.length ? '상대적으로 ' + hi.map(function (x) { return R().secShort(x.title) + '(' + f2(x.school) + ')'; }).join('·') + ' 영역이 강점이며, ' : '') + (lo.length ? lo.map(function (x) { return R().secShort(x.title) + '(' + f2(x.school) + ')'; }).join('·') + ' 영역은 상대적으로 보완이 필요합니다. ' : '') + (tp ? '서술 의견에서는 「' + tp.name + '」 관련 부정 의견 비중이 높게 나타났습니다(키워드 기반 간이 분류). ' : '') + '본 결과는 응답자 집단의 인식이며, 개별 교원의 서열이 아니라 학기 중 개선과 지원 대상 선정의 참고 자료로 활용하겠습니다.';
    var pri = lo.map(function (x, i) { return (i + 1) + '. ' + R().secShort(x.title) + ' 영역 보완 — 해당 영역 하위 문항 점검과 계열별 우수 사례 공유'; }).concat(tp ? [(lo.length + 1) + '. ' + tp.name + ' 관련 의견 확인 — 계열별 면담 시 구체 사례 수집'] : []).join('\n');
    return { opinion: op, priorities: pri, refs: ovrPick(D, TS).map(function (x) { return x.id; }).slice(0, 3) };
  }
  function ovrBlocks(ov, D, TS, txt) {
    var b = [], bar = function (v) { return '<span class="b"><i style="width:' + (v / 5 * 100) + '%"></i></span>'; };
    b.push({ h: '<div class="rp-title">학교 전체 종합 보고서</div><div class="rp-sub">' + E(ov.survey) + ' · 내부 보고용</div>' + R().ovTable(ov, { label: '학교 전체' }, 'a') });
    b.push({ keep: 1, h: '<div class="rp-h2">핵심 지표</div><div class="rp-kpis"><div class="rp-kpi"><div class="l">응답자</div><div class="v">' + D.resp + '</div><div class="s">과목 단위 ' + Math.round(D.cnt) + '문항 응답</div></div><div class="rp-kpi"><div class="l">종합 평균(5점)</div><div class="v">' + f2(D.mean) + '</div><div class="s">중앙값 ' + f2(D.med) + '</div></div><div class="rp-kpi"><div class="l">긍정률(4·5점)</div><div class="v">' + pc(D.posr) + '</div></div><div class="rp-kpi"><div class="l">부정률(1·2점)</div><div class="v">' + pc(D.negr) + '</div></div></div>' });
    b.push({ keep: 1, h: '<div class="rp-h2">계열별 결과</div>' });
    b.push({ h: '<table class="rp-t"><thead><tr><th>계열</th><th class="n">응답자</th><th class="n">평균</th><th class="n">중앙값</th><th class="n">긍정률</th><th class="n">전체 대비</th></tr></thead><tbody>' + D.tr.map(function (e) { var d = e.mean != null && D.mean != null ? e.mean - D.mean : null; return '<tr><td>' + E(e.label) + '</td><td class="n">' + e.resp + '</td><td class="n">' + f2(e.mean) + '</td><td class="n">' + f2(e.med) + '</td><td class="n">' + pc(e.posr) + '</td><td class="n">' + sg(d) + '</td></tr>'; }).join('') + '</tbody></table>' });
    b.push({ keep: 1, h: '<div class="rp-h2">영역별 평가</div>' });
    D.secs.forEach(function (s) { if (s.school == null) return; b.push({ h: '<div class="rp-bar"><span>' + E(R().secShort(s.title)) + '</span>' + bar(s.school) + '<b>' + f2(s.school) + '</b></div>' }); });
    b.push({ keep: 1, h: '<div class="rp-h2">교원 평균 분포 <small style="font-weight:400;color:#64748b">(개인 식별 없음 · 응답 5건 이상 ' + (D.profN - D.small) + '명, 5건 미만 ' + D.small + '명 제외)</small></div>' });
    b.push({ h: '<table class="rp-t"><thead><tr><th>평균 구간</th><th class="n">교원 수</th></tr></thead><tbody>' + D.bins.map(function (x) { return '<tr><td>' + E(x.n) + '</td><td class="n">' + x.c + '</td></tr>'; }).join('') + '</tbody></table>' });
    var tp = TS.topics.filter(function (o) { return o.n; }).sort(function (a, c) { return c.neg - a.neg; }).slice(0, 5);
    if (tp.length) { b.push({ keep: 1, h: '<div class="rp-h2">서술 의견 주제 <small style="font-weight:400;color:#64748b">(키워드 기반 간이 분류, ' + TS.total + '건)</small></div>' }); b.push({ h: '<table class="rp-t"><thead><tr><th>주제</th><th class="n">언급</th><th class="n">긍정</th><th class="n">부정</th><th class="n">연결 영역 평균</th></tr></thead><tbody>' + tp.map(function (o) { return '<tr><td>' + E(o.name) + '</td><td class="n">' + o.n + '</td><td class="n">' + o.pos + '</td><td class="n">' + o.neg + '</td><td class="n">' + f2(o.secMean) + '</td></tr>'; }).join('') + '</tbody></table>' }); }
    if (RN.other && RN.sid === sidv()) {
      var T = compute('track'), lb = labels(), ds = T.now.mean != null && T.prev.mean != null ? T.now.mean - T.prev.mean : null, TP = compute('prof'), up = TP.rows.filter(function (r) { return r.d >= 0.05; }).length, dn = TP.rows.filter(function (r) { return r.d <= -0.05; }).length;
      b.push({ keep: 1, h: '<div class="rp-h2">회차 비교 <small style="font-weight:400;color:#64748b">(' + E(lb[0]) + ' → ' + E(lb[1]) + ', 같은 문항 ' + T.anc.length + '개 기준)</small></div>' });
      b.push({ h: '<table class="rp-t"><thead><tr><th>구분</th><th class="n">' + E(lb[0]) + '</th><th class="n">' + E(lb[1]) + '</th><th class="n">증감</th></tr></thead><tbody><tr><td>전체 평균</td><td class="n">' + f2(T.prev.mean) + '</td><td class="n">' + f2(T.now.mean) + '</td><td class="n"><b>' + sg(ds) + '</b></td></tr><tr><td>응답자</td><td class="n">' + T.prevResp + '</td><td class="n">' + T.nowResp + '</td><td class="n"></td></tr>' + T.now.secs.map(function (s) { var p = T.prev.secs.filter(function (x) { return x.id === s.id; })[0] || {}; return s.mean != null && p.mean != null ? '<tr><td>' + E(R().secShort(s.title)) + '</td><td class="n">' + f2(p.mean) + '</td><td class="n">' + f2(s.mean) + '</td><td class="n">' + sg(s.mean - p.mean) + '</td></tr>' : ''; }).join('') + '</tbody></table><div style="font-size:11.5px;color:#64748b;margin-top:4px">교원 단위 상승 ' + up + '명, 하락 ' + dn + '명(±0.05 이상, 응답자 집단이 달라 참고용).</div>' });
    }
    b.push({ keep: 1, h: '<div class="rp-h2">교육처 의견</div>' });
    String(txt.opinion || '').split(/\n+/).filter(function (p) { return p.trim(); }).forEach(function (p) { b.push({ h: '<div class="rp-box" style="margin-bottom:6px">' + E(p.trim()) + '</div>' }); });
    if (String(txt.priorities || '').trim()) { b.push({ keep: 1, h: '<div class="rp-h2">우선 개선 과제</div>' }); String(txt.priorities).split(/\n+/).filter(function (p) { return p.trim(); }).forEach(function (p) { b.push({ h: '<div class="rp-act">' + E(p.trim()) + '</div>' }); }); }
    if (A.ext.theory && (txt.refs || []).length) A.ext.theory.blocks(txt.refs).forEach(function (x) { b.push(x); });
    b.push({ h: '<div class="rp-box" style="margin-top:10px;background:#f8fafc;color:#475569;font-size:12px">' + E(ov.notice || '') + '</div>' });
    return b;
  }
  var SYS_OVR = '당신은 전문대학 교육처의 교육기획 전문가입니다. 학교 전체 수업 개선 설문 집계(JSON)를 보고 종합 보고서의 교육처 의견 초안을 작성합니다.\n' +
    '입력에는 개인 이름이 없습니다. 5점 척도(5점이 가장 좋음)입니다. 출력은 JSON 객체 하나만(설명·코드펜스 금지): {"refs":["사용한 theory id"],"opinion":"교육처 의견 4~7문장. 수치와 서술 주제를 근거로 강점·보완·해석 한계(응답자 집단, 소규모 대상)를 균형 있게. 합니다체","priorities":"우선 개선 과제 3~5줄. 한 줄에 하나, \'1. 과제 — 구체 방안\' 형식"}\n' +
    '규칙: 입력에 없는 수치·연구·사실을 만들지 말 것. 교원 개인을 평가하거나 서열화하는 표현 금지. 주제 분류는 키워드 기반 간이 분류임을 전제로 단정하지 말 것.\n' +
    '학술 근거: 입력의 theory 는 검증된 연구 근거 후보(id, finding=연구 결과 요약, use=적용 해석, caution=유의)입니다. 현재 상황과 실제로 관련 있는 것만 골라 opinion 과 priorities 의 판단 근거로 쓰고, 사용한 id 는 JSON 의 "refs" 배열에 적으십시오. theory 에 없는 연구·저자·연도·통계 수치는 절대 쓰지 말고 저자명·연도는 본문에 쓰지 마십시오(출처는 시스템이 각주로 붙입니다). 연구 결과(사실)와 해석·판단(의견)을 구분하십시오.';
  V.ovr = async function (box) {
    box.innerHTML = '<div id="rpt-view" class="loading">불러오는 중…</div>'; await ready();
    if (A.ext.theory) await A.ext.theory.load(); var ov = await R().ovGet(), D = overall(), TS = themeStats(''), saved = await R().dbGet(sidv() + '|ovrtxt'); OV.txt = saved || ovrRuleText(D, TS); OV.txt.refs = OV.txt.refs || [];
    box.innerHTML = '<div id="rpt-view"><div class="panel"><h3>종합 보고서 <span class="muted" style="font-weight:400">· 학교 전체 A4 보고서</span></h3><div class="msg" style="margin:8px 0">' + I('info', 18) + '<div>현재 응답 범위 기준의 학교 전체 요약입니다. 개요(조사명·기간·대상 등)는 「계열별·반별·교수별 분석」 화면의 ① 개요 입력값을 사용합니다. 교육처 의견은 <b>이 브라우저에만 저장</b>됩니다. 교원 개인별 순위는 담지 않고 평균 분포만 익명으로 표시합니다.</div></div>' +
      '<label class="f">교육처 의견</label><textarea class="fld" rows="6" data-ov="opinion">' + E(OV.txt.opinion || '') + '</textarea>' +
      '<label class="f">우선 개선 과제 (한 줄에 하나)</label><textarea class="fld" rows="4" data-ov="priorities">' + E(OV.txt.priorities || '') + '</textarea>' +
      '<label class="f">근거 문헌 ID <span class="muted" style="font-weight:400">(쉼표 구분 · 보고서 각주 · 이론 파일에 있는 ID만 유지)</span></label><input class="fld" data-ov="refs" value="' + E((OV.txt.refs || []).join(', ')) + '">' +
      '<div class="btn-row" style="margin-top:8px;flex-wrap:wrap"><button class="btn btn-secondary btn-sm" data-ov-a="rule">기본 문안으로</button><button class="btn btn-secondary btn-sm" data-ov-a="ai">' + I('sparkle', 14) + ' AI 초안</button><button class="btn btn-ghost btn-sm" data-ov-a="save">저장</button><span class="sp"></span><button class="btn btn-secondary" data-ov-a="prev">미리보기</button><button class="btn btn-primary" data-ov-a="pdf">' + I('download', 16) + ' PDF 내려받기</button><button class="btn btn-secondary" data-ov-a="print">출력</button><span id="ovr-st" class="muted"></span></div><div id="ovr-aip"></div></div><div id="ovr-prev"></div></div>';
    function read() { OV.txt = { opinion: box.querySelector('[data-ov=opinion]').value, priorities: box.querySelector('[data-ov=priorities]').value, refs: box.querySelector('[data-ov=refs]').value.split(/[\s,]+/).filter(function (x) { return x && A.ext.theory && A.ext.theory.byId(x); }) }; return OV.txt; }
    async function pages() { var o2 = await R().ovGet(); return R().paginate(ovrBlocks(o2, overall(), themeStats(''), read()), o2, 'a', { label: '학교 전체 종합' }); }
    box.onclick = async function (e) {
      var t = e.target.closest('[data-ov-a]'); if (!t) return; var a = t.getAttribute('data-ov-a'), st = document.getElementById('ovr-st');
      try {
        if (a === 'save') { await R().dbPut(sidv() + '|ovrtxt', read()); A.toast('이 브라우저에 저장했습니다.'); }
        else if (a === 'rule') { if (!(await A.confirm('기본 문안으로', '현재 내용이 수치 기반 기본 문안으로 바뀝니다.', '바꾸기', '취소'))) return; var r0 = ovrRuleText(overall(), themeStats('')); box.querySelector('[data-ov=opinion]').value = r0.opinion; box.querySelector('[data-ov=priorities]').value = r0.priorities; box.querySelector('[data-ov=refs]').value = (r0.refs || []).join(', '); }
        else if (a === 'ai') {
          if (!A.ext.aiCall) throw new Error('AI 모듈을 불러오지 못했습니다.'); if (!(await A.confirm('AI 초안', '집계 수치와 주제 건수(이름 제외)가 AI 제공자에게 전송됩니다. 진행하시겠습니까?', '진행', '취소'))) return;
          t.disabled = true; var P = R().progress(document.getElementById('ovr-aip'), { title: 'AI 초안 작성', steps: ['집계·학술 근거 선택', 'AI 호출·응답 대기', '응답 검증·반영'] }); P.set(0, '학교 전체 집계와 학술 근거를 준비하는 중', 10);
          try {
            var Dd = overall(), Ts = themeStats(''), th = ovrPick(Dd, Ts), payload = JSON.stringify({ theory: (A.ext.theory ? A.ext.theory.forAI(th) : []), survey: ov.survey, resp: Dd.resp, mean: R().round2(Dd.mean), median: R().round2(Dd.med), pos: Math.round(Dd.posr || 0), neg: Math.round(Dd.negr || 0), sections: Dd.secs.map(function (s) { return { n: R().secShort(s.title), mean: R().round2(s.school) }; }), tracks: Dd.tr.map(function (x) { return { n: x.label, mean: R().round2(x.mean), resp: x.resp }; }), topics: Ts.topics.filter(function (o) { return o.n; }).map(function (o) { return { n: o.name, cnt: o.n, neg: o.neg, sec: R().round2(o.secMean) }; }) });
            P.set(1, 'AI 응답을 기다리는 중 (수십 초 걸릴 수 있습니다)', 30, true);
            var txt = await A.ext.aiCall(SYS_OVR, payload, (R().UI.model || ((A.ext.aiModels || [])[0] || [])[0] || 'claude-sonnet-5-5')); P.set(2, '응답을 검증하고 근거 문헌을 확인하는 중', 85); var j = R().parseJson(txt);
            var TH = A.ext.theory, cl = function (x) { return TH ? TH.stripCites(String(x || ''), th) : String(x || ''); }, o1 = cl(j.opinion), o2 = cl(j.priorities); if (!o1 && !o2) throw new Error('AI 응답에 교육처 의견이 없어 기존 내용을 유지했습니다. 다시 시도해 주십시오.');
            if (o1) box.querySelector('[data-ov=opinion]').value = o1; if (o2) box.querySelector('[data-ov=priorities]').value = o2; box.querySelector('[data-ov=refs]').value = (TH ? TH.cleanRefs(j.refs, th) : []).join(', ');
            P.finish('AI 초안을 위 입력란에 채웠습니다. 다음 단계: 내용을 검토·수정한 뒤 「저장」하고 「미리보기」로 확인하십시오.', [{ label: '미리보기', primary: true, fn: function () { box.querySelector('[data-ov-a=prev]').click(); } }, { label: '저장', fn: function () { box.querySelector('[data-ov-a=save]').click(); } }]); A.toast('AI 초안 작성을 마쳤습니다.');
          } catch (er) { P.fail('AI 초안 작성에 실패했습니다: ' + (er.message || er)); A.toast(er.message || String(er), 'err'); }
          t.disabled = false;
        }
        else if (a === 'prev') { pagesPreview(document.getElementById('ovr-prev'), await pages()); }
        else if (a === 'pdf') { t.disabled = true; if (st) st.textContent = 'PDF 생성 중…'; var blob = await R().pagesToPdf(await pages()); R().download(blob, R().safe((ov.survey || '설문') + '_종합 보고서') + '.pdf'); if (st) st.textContent = ''; t.disabled = false; }
        else if (a === 'print') { R().printPages(await pages()); }
      } catch (er) { A.toast(er.message || String(er), 'err'); if (st) st.textContent = ''; t.disabled = false; }
    };
  };
})();
