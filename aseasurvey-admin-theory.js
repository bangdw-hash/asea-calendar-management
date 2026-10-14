'use strict';
/**
 * aseasurvey-admin-theory.js — 이론 파일(theory/aseasurvey-theory.json) 연결
 *  · 이론 파일은 「서지 일치(Crossref) + 초록 내용 일치」로 검증된 교육학·심리학·통계학 문헌만 담습니다. (tools/theory_verify.py, theory/VERIFICATION.md)
 *  · 대상의 상황(점수·서술 의견 주제·회차 변화·표본 크기 등)을 신호로 바꿔 관련 근거만 3~4개 골라 AI 분석에 함께 전달합니다.
 *    같은 근거만 반복 인용되지 않도록 대상마다 선택에 변화를 주고, 분야(교육학·심리학·통계학)가 섞이게 합니다.
 *  · AI 는 전달된 근거의 id 만 인용할 수 있습니다. 응답의 refs 는 전달한 id 로 걸러내고, 목록에 없는 저자·연도 표기가 들어간 문장은 삭제합니다.
 *  · 내부용 리포트에는 근거 각주가 붙고, 전달용(정성) 리포트에는 출처·학술 용어를 넣지 않습니다.
 */
(function () {
  var A = window.SVYA, E = SVY.esc, R = function () { return A.ext.rptApi; };
  var T = A.ext.theory = A.ext.theory || { data: null, loading: null };
  var TOPICKEY = { '실습·실기': 'practice', '진도·속도': 'pace', '설명·전달': 'explain', '자료·교재': 'material', '소통·태도': 'rapport', '평가·과제': 'assess', '시설·환경': 'facility', '운영·출결': 'admin', '수업 참여': 'engage' };

  T.load = function () {
    if (T.data) return Promise.resolve(T.data); if (T.loading) return T.loading;
    T.loading = fetch('theory/aseasurvey-theory.json?v=20261014', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { T.data = j && j.entries ? j : { entries: [], count: 0 }; return T.data; }).catch(function () { T.data = { entries: [], count: 0 }; return T.data; });
    return T.loading;
  };
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function byId(id) { return ((T.data && T.data.entries) || []).filter(function (x) { return x.id === id; })[0]; }
  T.byId = byId;

  // 대상(facts 항목)의 상황 신호
  T.signals = function (e, opt) {
    opt = opt || {}; var s = { general: 1 }, cm = e.comments || [], school = e.schoolMean, rc = R().ruleClassify;
    if (e.mean != null && school != null) { var d = e.mean - school; if (d <= -0.3) s.low_score = 1; if (d >= 0.3) s.high_score = 1; }
    if (e.posr != null && e.negr != null && e.posr >= 20 && e.negr >= 20) s.polarized = 1;
    if (e.resp != null && e.resp < 10) s.small_n = 1;
    var neg = 0; cm.forEach(function (c) { if (rc(c.t) === 'neg') neg++; });
    if (cm.length >= 3 && neg / cm.length >= 0.3) s.neg_comments = 1; if (cm.length >= 3 && neg / cm.length < 0.1) s.pos_comments = 1;
    (A.ext.rptTopics || []).forEach(function (t) { var k = TOPICKEY[t[0]], ng = 0; if (!k) return; cm.forEach(function (c) { if (t[1].test(String(c.t).toLowerCase()) && rc(c.t) === 'neg') ng++; }); if (ng >= 2) s['topic:' + k] = 1; });
    var dl = opt.delta != null ? opt.delta : (A.ext.rptDelta ? A.ext.rptDelta(e) : null);
    if (dl != null) { if (dl <= -0.15) s.decline = 1; if (dl >= 0.15) s.improve = 1; s.has_round = 1; }
    var rd = A.ext.rptRound ? A.ext.rptRound() : ''; if (rd) s[rd] = 1;
    s['unit:' + e.unit] = 1; if (opt.ranking) s.ranking = 1;
    return Object.keys(s);
  };
  // 신호에 맞는 근거 선택: 일치 신호 수 우선, 대상마다 달라지는 가중, 분야·주제 중복 제한
  T.pick = function (sig, seed, n) {
    var ent = (T.data && T.data.entries) || []; if (!ent.length) return []; n = n || 4; var set = {}; sig.forEach(function (k) { set[k] = 1; });
    var sc = ent.map(function (en) { var tr = en.triggers || [], m = tr.filter(function (t) { return set[t] && t !== 'general'; }).length; return { en: en, s: m ? m * 10 + (hash(seed + en.id) % 7) : (tr.indexOf('general') >= 0 ? 1 + (hash(seed + en.id) % 5) * 0.1 : 0) }; }).filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; });
    var out = [], fc = {}, tc = {};
    sc.forEach(function (x) { if (out.length >= n) return; var f = x.en.field, t = (x.en.topics || [])[0]; if ((fc[f] || 0) >= 2 || tc[t]) return; out.push(x.en); fc[f] = (fc[f] || 0) + 1; tc[t] = 1; });
    return out;
  };
  T.autoRefs = function (e, opt) { return T.pick(T.signals(e, opt), e.unit + '|' + e.key, 3).map(function (x) { return x.id; }); };
  T.forAI = function (list) { return list.map(function (x) { return { id: x.id, finding: x.finding, use: x.use, caution: x.caution || '' }; }); };

  // AI 응답 점검: 전달하지 않은 id 는 버리고, 목록에 없는 저자·연도 표기 문장은 삭제
  T.cleanRefs = function (refs, allowed) { var ok = {}; allowed.forEach(function (x) { ok[x.id] = 1; }); return (Array.isArray(refs) ? refs : []).filter(function (id) { return ok[id]; }).filter(function (id, i, a) { return a.indexOf(id) === i; }); };
  T.stripCites = function (text, allowed, none) {
    var fams = {}; (allowed || []).forEach(function (x) { fams[String(x.short).split(/[ &,]/)[0].toLowerCase()] = 1; });
    var re = /([A-Z][A-Za-z'’\-]+)(?: et al\.| (?:&|and) [A-Z][A-Za-z'’\-]+)?,?\s*\(?((?:19|20)\d{2})[a-z]?\)?/;
    return String(text || '').split(/(?<=[.!?。])\s+|\n/).filter(function (sn) { var m = re.exec(sn); if (!m) return true; return !none && fams[m[1].toLowerCase()]; }).join(' ').replace(/\s{2,}/g, ' ').trim();
  };
  // 내부용 리포트 각주 블록
  T.blocks = function (ids) {
    var L = (ids || []).map(byId).filter(Boolean); if (!L.length) return [];
    var b = [{ keep: 1, h: '<div class="rp-h2">참고한 학술 근거 <small style="font-weight:400;color:#64748b">(이론 파일 기준 · 연구 결과 요약과 이 설문에의 해석을 구분)</small></div>' }];
    L.forEach(function (x) { b.push({ h: '<div class="rp-c"><b>' + E(x.short) + '</b> ' + E(x.finding) + '<small style="display:block">해석: ' + E(x.use) + (x.caution ? ' · 유의: ' + E(x.caution) : '') + '</small><small style="display:block;color:#94a3b8">' + E(x.cite) + '</small></div>' }); });
    return b;
  };
})();
