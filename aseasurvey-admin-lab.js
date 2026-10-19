'use strict';
/**
 * aseasurvey-admin-lab.js — 결과 분석 「비교 분석실」
 *  하위/상위 응답 집단 비교 · 대상별 비교(하위 비중·개인 보정·표본 보정) · 같은 과목 교수 간 · 요인 분해 · 영역 히트맵 ·
 *  출석·입력시간·제출시기 · 순위 안정성 · 중요도-성과 · 서술 키워드. 모든 기준값은 슬라이더·버튼으로 바꾸며 즉시 다시 계산합니다.
 *  · 5점 척도에서 5점이 가장 좋은 평가입니다. 점검 문항은 제외하고, 결과 화면의 응답 범위·계열·반 필터를 그대로 따릅니다.
 *  · 계산은 이 브라우저 안에서만 합니다. 서버·AI로 아무것도 보내지 않고, 서술은 단어 빈도만 보여 줍니다(원문 비노출).
 *  · results.js 의 A.ext.resApi / A.ext.rviews / A.ext.rhook 확장 지점을 사용합니다. (insight.js 다음에 불러옴)
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico, API = function () { return A.ext.resApi; };
  var V = A.ext.rviews = A.ext.rviews || {};
  var L = A.ext.lab = { tool: 'grp', scope: 'school', lo: 10, hi: 10, item: 'all', unit: 'course', minN: 5, k: 10, ratio: 2, dev: 0.2, z: 1.5, shift: 5, fast: 30, slow: 150, qx: null, qy: null, sort: 'share', dir: -1 };
  var ST = {}, LAST = { name: '', aoa: [] };
  var DIMS = [['course', '과목(반별)'], ['cname', '과목명(모든 반 합산)'], ['prof', '교수'], ['klass', '반'], ['grade', '학년'], ['track', '계열'], ['kind', '이론·실습']];
  var TOOLS = [['grp', '집단 비교'], ['unt', '대상별 비교'], ['same', '같은 과목·교수'], ['var', '요인 분해'], ['map', '영역 히트맵'], ['beh', '출석·시간·시기'], ['rank', '순위 안정성'], ['ipa', '중요도-성과'], ['txt', '서술 키워드']];

  /* ───────────── 수학 도우미 ───────────── */
  function mean(a) { if (!a.length) return null; var s = 0; a.forEach(function (x) { s += x; }); return s / a.length; }
  function sd(a) { if (a.length < 2) return null; var m = mean(a), s = 0; a.forEach(function (x) { s += (x - m) * (x - m); }); return Math.sqrt(s / (a.length - 1)); }
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; }
  function quant(a, p) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), i = Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1)))); return s[i]; }
  function pearson(x, y) { var n = x.length; if (n < 3) return null; var mx = mean(x), my = mean(y), sxy = 0, sxx = 0, syy = 0, i; for (i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); syy += (y[i] - my) * (y[i] - my); } return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null; }
  function ranks(a) { var idx = a.map(function (v, i) { return [v, i]; }).sort(function (p, q) { return p[0] - q[0]; }), r = new Array(a.length), i = 0, j; while (i < idx.length) { j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (var k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; }
  function f2(v) { return v == null || !isFinite(v) ? '-' : v.toFixed(2); }
  function pc(v) { return v == null || !isFinite(v) ? '-' : (Math.round(v * 10) / 10) + '%'; }
  function secShort(t) { return String(t).replace(/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\.\s*/, '').slice(0, 10); }

  /* ───────────── 데이터 준비 ───────────── */
  function itemQs(D, item) {
    if (item === 'all') return D.Q.scale;
    if (item.indexOf('s:') === 0) return D.Q.scale.filter(function (x) { return x.s.id === item.slice(2); });
    return D.Q.scale.filter(function (x) { return x.q.id === item.slice(2); });
  }
  function dimKey(dim) {
    return { course: function (o) { return o.c.name + ' · ' + (o.c.klass || '') + (o.c.prof ? ' · ' + o.c.prof : ''); }, cname: function (o) { return o.c.name; }, prof: function (o) { return o.c.prof || '(교수 미입력)'; },
      klass: function (o) { return o.r.track + ' ' + o.r.grade + ' ' + o.r.klass; }, grade: function (o) { return o.r.track + ' ' + o.r.grade; }, track: function (o) { return o.r.track; }, kind: function (o) { return o.c.kind || '(구분 없음)'; } }[dim] || function () { return '-'; };
  }
  // 응답×과목 쌍을 점수 벡터로 바꿉니다. 응답자 합계로 「그 과목을 뺀 개인 평균(LOO)」과 개인 보정 편차도 계산합니다.
  function prep(D) {
    if (L.item !== 'all' && !itemQs(D, L.item).length) L.item = 'all';
    if (ST.D === D && ST.item === L.item) return ST.P;
    var qs = itemQs(D, L.item), P = { pairs: [], resp: {}, qs: qs };
    D.pairs.forEach(function (p) {
      var a = (p.r.answers.course || {})[p.c.id] || {}, o = { r: p.r, c: p.c, rid: p.r.id, s: 0, n: 0, sec: {}, vals: {}, dist: [0, 0, 0, 0, 0], pos: 0, neg: 0, tx: [], aS: 0, aN: 0 };
      D.Q.scale.forEach(function (x) { var v = a[x.q.id]; if (v == null) return; o.vals[x.q.id] = v; o.aS += v; o.aN++; var e = o.sec[x.s.id] || (o.sec[x.s.id] = { s: 0, n: 0 }); e.s += v; e.n++; });
      qs.forEach(function (x) { var v = a[x.q.id]; if (v == null) return; o.s += v; o.n++; if (v >= 1 && v <= 5) o.dist[v - 1]++; if (v >= 4) o.pos++; if (v <= 2) o.neg++; });
      if (!o.n) return;
      o.m = o.s / o.n;
      D.Q.text.forEach(function (x) { var t = a[x.q.id]; if (typeof t === 'string' && t.trim()) o.tx.push(t); });
      P.pairs.push(o);
      var R = P.resp[o.rid] || (P.resp[o.rid] = { r: p.r, pairs: [], s: 0, n: 0 }); R.pairs.push(o); R.s += o.s; R.n += o.n;
    });
    P.pairs.forEach(function (o) { var R = P.resp[o.rid]; o.dev = R.n > o.n ? o.m - (R.s - o.s) / (R.n - o.n) : null; });
    P.gs = 0; P.gn = 0; P.pairs.forEach(function (o) { P.gs += o.s; P.gn += o.n; }); P.grand = P.gn ? P.gs / P.gn : null;
    ST = { D: D, item: L.item, P: P, gk: '' }; return P;
  }
  // 분위 산정: 전체 학생 / 같은 반 학생 / 같은 과목 응답 안에서 순위를 매겨 하위 %·상위 %를 나눕니다. 경계 동점은 모두 같은 집단에 넣습니다.
  function assign(P) {
    var gk = [L.scope, L.lo, L.hi].join('|'); if (ST.gk === gk) return; ST.gk = gk;
    var by = {}, units = [];
    if (L.scope === 'course') P.pairs.forEach(function (o) { o.sc = o.m; (by[o.c.id] = by[o.c.id] || []).push(o); });
    else Object.keys(P.resp).forEach(function (id) { var R = P.resp[id], k = L.scope === 'klass' ? R.r.track + '|' + R.r.grade + '|' + R.r.klass : 'all'; R.sc = R.s / R.n; (by[k] = by[k] || []).push(R); });
    Object.keys(by).forEach(function (k) {
      var arr = by[k].slice().sort(function (a, b) { return a.sc - b.sc; }), N = arr.length, kl = Math.floor(L.lo / 100 * N), kh = Math.floor(L.hi / 100 * N);
      var lc = kl >= 1 ? arr[kl - 1].sc : null, hc = kh >= 1 ? arr[N - kh].sc : null;
      arr.forEach(function (u) { u.g = lc != null && u.sc <= lc + 1e-9 ? 'L' : hc != null && u.sc >= hc - 1e-9 ? 'H' : 'M'; });
    });
    P.pairs.forEach(function (o) { if (L.scope !== 'course') o.g = P.resp[o.rid].g; });
    var Lc = P.pairs.filter(function (o) { return o.g === 'L'; }).length; P.base = P.pairs.length ? Lc / P.pairs.length : 0;
  }
  function groupBy(arr, kf) { var g = {}; arr.forEach(function (o) { var k = kf(o); (g[k] = g[k] || { name: k, a: [] }).a.push(o); }); return Object.keys(g).map(function (k) { return g[k]; }); }
  function pairStat(a) {
    var s = 0, n = 0, d = [0, 0, 0, 0, 0], rs = {}, ls = 0, devs = [], tx = 0, st = 0, fl = 0, du = [], inn = [];
    a.forEach(function (o) { s += o.s; n += o.n; for (var i = 0; i < 5; i++) d[i] += o.dist[i]; rs[o.rid] = o.r; if (o.g === 'L') ls++; if (o.dev != null) devs.push(o.dev); if (o.tx.length) tx++; });
    Object.keys(rs).forEach(function (id) { var r = rs[id], nc = Object.keys((r.answers && r.answers.course) || {}).length || 1; du.push(r.duration_sec / nc); if (r.straight) st++; if (!API().passResp(r)) fl++; var R = ST.P.resp[id]; if (R && R.pairs.length > 1) inn.push(sd(R.pairs.map(function (p) { return p.m; }))); });
    var nr = Object.keys(rs).length, td = d.reduce(function (x, y) { return x + y; }, 0);
    return { np: a.length, nr: nr, mean: n ? s / n : null, dist: d.map(function (v) { return td ? v / td * 100 : 0; }), pos: td ? (d[3] + d[4]) / td * 100 : null, neg: td ? (d[0] + d[1]) / td * 100 : null, low: a.length ? ls / a.length * 100 : null,
      dev: mean(devs), tx: a.length ? tx / a.length * 100 : null, st: nr ? st / nr * 100 : null, fl: nr ? fl / nr * 100 : null, du: median(du), inn: mean(inn.filter(function (v) { return v != null; })) };
  }

  /* ───────────── 설명 팁박스 ───────────── */
  function tip(title, rows, open) {
    return '<details class="tipbox"' + (open ? ' open' : '') + '><summary><b>' + E(title) + '</b></summary><ol style="list-style:none;padding:0;margin:8px 0 0">' + rows.map(function (r) { return '<li style="margin:5px 0;font-size:13px"><span class="badge badge-blue" style="margin-right:6px">' + E(r[0]) + '</span>' + r[1] + '</li>'; }).join('') + '</ol></details>';
  }
  function hp(t) { return A.help ? A.help(t) : ''; }
  var TIPS = {
    grp: ['집단 비교 — 낮게 평가한 학생들은 어떤 모양으로 평가하는가', [
      ['교육학', '낮은 점수의 <b>크기</b>보다 <b>모양</b>(어느 영역에서, 어떤 분포로, 서술을 남겼는지)이 개선 단서입니다. 모든 영역이 고르게 낮으면 수업 외 요인(학업 부담·학습 태도·응답 성향)을, 특정 영역만 낮으면 그 영역의 수업 설계를 먼저 점검합니다.'],
      ['통계학', '하위 집단은 점수로 뽑았으므로 「점수가 낮다」는 결론은 항상 성립합니다(순환). 그래서 평균 대신 <b>영역별 격차·개인 내 편차·서술 작성률</b>을 봅니다. 개인 내 편차가 작으면 한 사람이 모든 대상에 비슷한 점수를 준 것(성향), 크면 대상을 구분해 평가한 것입니다.'],
      ['관리자', '하위 집단을 제외하지 않고 결과에 모두 반영하면서, 그 영향이 얼마나 큰지만 따로 봅니다. 서술 작성률이 높고 입력 시간이 충분한 하위 집단은 성실한 불만일 가능성이 높아 면담 우선 대상 단서가 됩니다. (단정하지 말고 참고 지표로 사용)']]],
    unt: ['대상별 비교 — 낮은 점수가 한 곳에 몰렸는가, 퍼져 있는가', [
      ['교육학', '같은 점수라도 「이 과목만 낮게 평가한 학생」과 「어디에나 낮게 주는 학생」은 다른 정보입니다. <b>개인 보정 편차</b>는 학생이 다른 과목에 준 평균과 비교한 값이라, 후하게/박하게 주는 성향을 지우고 과목 자체의 상대적 평가를 보여 줍니다.'],
      ['통계학', '<b>하위 비중</b>은 그 대상 응답 중 하위 집단의 비율입니다. 학교 전체 기준(실제 하위 비율)의 몇 배인지(배수)로 쏠림을 봅니다. <b>표본 보정 평균</b>은 응답이 적을수록 학교 평균 쪽으로 당기는 값(경험적 베이즈식 수축)으로, 응답 3건짜리 과목의 우연한 극단값을 줄여 순위 안정성을 높입니다. 보정 강도 k는 「응답 k건이면 자기 평균을 절반만 신뢰」라는 뜻입니다.'],
      ['관리자', '판독은 <b>집중</b>(비중 배수·개인 보정 편차 모두 기준 초과: 해당 과목 고유 이슈 가능성), <b>비중 높음</b>(개인 편차는 없음: 같은 반·집단 성향 영향 가능성), <b>상대적 낮음</b>(비중은 평범하나 같은 학생이 다른 과목보다 낮게 줌), <b>분산</b>(특이점 없음)입니다. 모두 가능성이며 원인을 증명하지 않습니다.'],
      ['개인정보', '응답 수가 「최소 응답 수」 미만인 대상은 숫자를 가립니다(소규모 응답으로 학생·교수 식별 방지).']]],
    same: ['같은 과목·교수 간 — 과목 특성인가, 교수의 차이인가', [
      ['교육학', '같은 과목명을 여러 교수가 가르치면 교육과정은 같고 수업 방식만 다릅니다. 이때의 차이는 교수법·운영 차이를 보는 가장 깨끗한 비교입니다(단, 반 구성이 다르면 반 효과가 섞입니다).'],
      ['통계학', '두 교수 평균의 차이가 <b>오차 범위(1.96×표준오차)</b>를 넘는지 표시합니다. 응답이 적으면 큰 차이도 우연일 수 있어 「유의」 표시가 없으면 단정하지 않습니다. 과목명이 같아도 학년·반이 다르면 수준 차가 섞일 수 있습니다.'],
      ['관리자', '교수 평가 용도로 쓰기보다 <b>수업 방식 공유·상호 참관 대상 선정</b>에 활용하는 편이 안전합니다. 최소 응답 수 미만 교수는 비교에서 제외합니다.']]],
    'var': ['요인 분해 — 점수 차이는 무엇이 만드는가', [
      ['통계학', '요인(교수·과목명·반·계열·이론실습·학생)별로 <b>일원 분산분석의 η²</b>(점수 변동 중 그 요인이 설명하는 비율)와 <b>보정 ε²</b>(집단 수가 많을수록 부풀려지는 η²를 보정한 값)를 보여 줍니다. 요인끼리 겹치므로(교수⊂과목 등) 합이 100%가 되지 않고, <b>서로 비교하는 상대 지표</b>로만 읽습니다.'],
      ['교육학', '「학생」 요인이 크면 평가가 응답자 성향에 크게 좌우된다는 뜻이라, 개인 보정(학생 평균 대비 편차)을 쓰는 근거가 됩니다. 「교수」가 「과목명」보다 크면 가르치는 사람이, 반대면 과목 자체의 특성이 점수를 좌우합니다.'],
      ['관리자', '개선 자원을 어디에 쓸지(교수 지원·교육과정 개편·반 편성) 정하는 거시 지표입니다. 응답이 적은 설문에서는 불안정하므로 ε² 값을 우선 보십시오.']]],
    map: ['영역 히트맵 — 어느 대상의 어느 단계가 학교 평균과 다른가', [
      ['통계학', '칸의 색은 같은 영역의 <b>대상 간 분포에서의 z점수</b>(평균에서 몇 표준편차 떨어졌는지)입니다. 기준(|z|)을 올리면 정말 이례적인 칸만 남습니다. 1.5는 약 상·하위 7% 수준, 2.0은 약 2~3%입니다. 칸이 많을수록 우연히 극단값이 나오므로 표본이 작은 칸은 가립니다.'],
      ['교육학', '수업 전·수업 중·참여형·정리·성과 같은 단계별 프로파일을 보면 「준비는 좋은데 정리·피드백이 약하다」처럼 구체적인 개선 방향이 나옵니다.'],
      ['관리자', '교수 면담 전 「강점 칸」과 「보완 칸」을 함께 보여 주면 평가 결과를 수용하기 쉽습니다.']]],
    beh: ['출석·입력시간·제출시기 — 평가가 응답 조건에 좌우되는가', [
      ['교육학', '출석이 낮은 학생은 수업 경험이 제한적이어서 평가의 근거가 다를 수 있습니다. 출석 구간별 평균 차이가 크면 해석 시 출석 구성을 함께 봐야 합니다.'],
      ['통계학', '과목당 입력 시간(빠름/보통/느림)·제출 시기(응답 순서 4분할)별 평균·동일 응답·서술률을 비교합니다. 시간이 짧은 응답의 점수가 유난히 다르면 <b>저품질 응답의 영향</b>(응답 편향)을 의심합니다. 응답률은 계열·학년 단위로만 계산됩니다(재적 인원이 그 단위로 등록됨).'],
      ['관리자', '추첨 경품이 있는 설문에서 마감 직전 응답이 짧고 동일 응답이 많다면 보상 영향이 큽니다. 기준 시간은 슬라이더로 조절하며 추천값은 이 설문의 입력 시간 분포(하위 10%·상위 10%)로 계산한 것입니다.']]],
    rank: ['순위 안정성 — 이 순위는 조건이 바뀌어도 믿을 수 있는가', [
      ['통계학', '같은 대상을 <b>전체/점검 통과/동일 응답 제외/하위 집단 제외/표본 보정</b> 다섯 조건으로 다시 순위를 매겨 변동 폭을 봅니다. 변동이 기준(슬라이더)을 넘는 대상은 「특정 응답에 순위가 좌우됨」을 뜻합니다. 스피어만 상관 ρ가 1에 가까울수록 조건과 무관하게 안정적입니다.'],
      ['관리자', '교수에게 결과를 전달하기 전 마지막 점검용입니다. 순위가 불안정한 대상은 순위·등급 표현을 피하고 영역별 사실만 전달하는 편이 안전합니다. (응답 범위를 「전체」로 두고 보십시오. 이미 「유효 응답만」이면 조건 간 차이가 줄어듭니다.)']]],
    ipa: ['중요도-성과 — 무엇부터 개선할 것인가', [
      ['통계학', '성과 = 문항 평균, 중요도 = 그 문항과 <b>나머지 문항 평균</b>의 상관(자기 자신을 뺀 값)입니다. 상관이 높을수록 그 문항을 높이는 것이 전반적 만족과 함께 움직이는 경향입니다(인과 아님). 기준선은 슬라이더로 옮기며 기본은 전체 평균과 중앙값입니다.'],
      ['교육학', '「성과 낮음 · 중요도 높음」이 개선 효과가 큰 후보, 「성과 높음 · 중요도 높음」은 유지할 강점입니다. 점수가 낮아도 중요도가 낮으면 우선순위를 뒤로 미룰 수 있습니다.'],
      ['관리자', '한정된 예산·시간으로 개선과제(개선 과제 탭)를 정할 때 근거로 씁니다. 응답이 적으면 상관이 불안정하므로 점이 많이 흔들리는지 필터를 바꿔 확인하십시오.']]],
    txt: ['서술 키워드 — 낮게 평가한 학생은 무엇을 쓰는가', [
      ['통계학', '하위 집단과 나머지 집단의 서술 의견에서 단어(2글자 이상 한글)를 <b>의견 100건당 등장 횟수</b>로 비교합니다. 형태소 분석이 아닌 단순 빈도라 조사가 붙은 단어는 일부 분리되어도 한계가 있습니다. 3건 미만 단어는 제외합니다.'],
      ['교육학', '낮은 점수 집단에서 상대적으로 자주 나오는 단어는 불만 주제의 단서, 나머지 집단에서 자주 나오는 단어는 유지할 강점의 단서입니다.'],
      ['개인정보', '서술 원문은 이 화면에 표시하지 않고 단어 빈도만 보여 줍니다. 원문은 「서술형」 탭에서 확인합니다.']]]
  };
  var HELP = { lo: '하위 집단 비율. 낮출수록 가장 극단적인 불만만 보고, 높일수록 집단 표본은 커지지만 보통 평가가 섞입니다.', hi: '상위 집단 비율(비교 기준선).', scope: '순위를 매기는 범위. 전체: 모든 학생 대비 / 반: 같은 반 학생 대비 / 과목: 같은 과목 응답 대비. 후하게 주는 반·과목의 영향을 덜려면 범위를 좁힙니다.', item: '순위·평균을 계산할 문항 범위. 영역을 고르면 그 영역 점수만으로 집단을 나눕니다.', unit: '비교할 대상 단위.', minN: '이 값 미만으로 응답한 대상은 숫자를 가립니다. 소규모 응답으로 개인이 식별되는 것과 우연한 극단값을 막습니다.', k: '표본 보정 강도. 응답이 k건인 대상은 자기 평균을 절반만 신뢰하고 나머지는 학교 평균을 따릅니다.', ratio: '하위 비중이 실제 하위 비율의 몇 배 이상이면 「비중 높음」으로 볼지.', dev: '개인 보정 편차가 이 값(점)만큼 낮으면 「상대적 낮음」으로 봅니다. 추천값은 평균의 95% 오차 범위입니다.', z: '영역 히트맵 강조 기준(표준편차 단위).', shift: '순위가 이 칸 이상 움직이면 불안정으로 표시.', fast: '과목당 입력 시간(초)이 이 값 미만이면 빠른 응답.', slow: '과목당 입력 시간(초)이 이 값 초과이면 느린 응답.' };

  /* ───────────── 추천 기준(이 설문의 데이터로 계산) ───────────── */
  function recommend(P) {
    var nr = Object.keys(P.resp).length, ns = P.pairs.length, byU = {}, byK = {}, du = [];
    P.pairs.forEach(function (o) { byU[o.c.id] = (byU[o.c.id] || 0) + 1; var k = o.r.track + o.r.grade + o.r.klass; byK[k] = byK[k] || {}; byK[k][o.rid] = 1; });
    Object.keys(P.resp).forEach(function (id) { var r = P.resp[id].r, nc = Object.keys((r.answers && r.answers.course) || {}).length || 1; du.push(r.duration_sec / nc); });
    var cn = Object.keys(byU).map(function (k) { return byU[k]; }), kn = Object.keys(byK).map(function (k) { return Object.keys(byK[k]).length; }), mc = median(cn) || 0, mk = median(kn) || 0;
    var lo = Math.min(25, Math.max(10, Math.ceil(3000 / Math.max(nr, 1)))), pm = P.pairs.map(function (o) { return o.m; }), se = (sd(pm) || 0.8) / Math.sqrt(Math.max(mc, 1));
    return { nr: nr, ns: ns, mc: mc, mk: mk, lo: lo, hi: lo, scope: mk >= 30 ? 'klass' : 'school', minN: 5, k: Math.min(40, Math.max(5, Math.round(mc))), ratio: 2, dev: Math.max(0.1, Math.round(1.96 * se * 100) / 100), z: 1.5,
      shift: Math.max(3, Math.round(Object.keys(byU).length * 0.1)), fast: Math.max(10, Math.round(quant(du, 0.1) || 30)), slow: Math.max(60, Math.round(quant(du, 0.9) || 150)) };
  }
  function recBox(R) {
    return tip('추천 기준과 이유 (이 설문의 데이터로 계산)', [
      ['하위·상위 %', '추천 <b>' + R.lo + '%</b> — 응답자 ' + R.nr + '명 기준으로 집단이 약 30명 이상 되도록 10~25% 안에서 정했습니다. 집단이 너무 작으면 비율이 크게 흔들립니다.'],
      ['분위 범위', '추천 <b>' + (R.scope === 'klass' ? '같은 반' : '전체') + '</b> — 반별 응답자 중앙값이 ' + R.mk + '명입니다. 30명 이상이면 반 안에서도 순위를 안정적으로 매길 수 있어 반 효과를 줄이는 「같은 반」을, 미만이면 「전체」를 권합니다. 과목 범위는 과목 응답 중앙값(' + R.mc + '건)이 30건 이상일 때만 의미가 있습니다.'],
      ['최소 응답 수', '추천 <b>' + R.minN + '건</b> — 소규모 응답에서 개인이 식별되는 것을 막는 최소선이며, 5건 미만 평균은 표준오차가 커서 해석에 적합하지 않습니다.'],
      ['보정 강도 k', '추천 <b>' + R.k + '</b> — 대상별 응답 중앙값(' + R.mc + '건)입니다. 중앙값만큼 응답한 대상은 자기 평균을 절반 신뢰합니다.'],
      ['개인 보정 편차·배수', '편차 추천 <b>' + R.dev + '점</b>(대상 평균의 95% 오차 범위), 배수 <b>2배</b>(실제 비율의 2배면 우연보다 뚜렷한 쏠림으로 보는 일반적 관례).'],
      ['z·순위·시간', 'z <b>1.5</b>(상·하위 약 7%), 순위 변동 <b>' + R.shift + '칸</b>(대상 수의 약 10%), 입력 시간 <b>' + R.fast + '초 미만=빠름 / ' + R.slow + '초 초과=느림</b>(이 설문 분포의 하위·상위 10%).']
    ], true) + '<div class="row" style="margin:-4px 0 10px"><button class="btn btn-primary btn-sm" data-lab="rec">' + I('check', 14) + ' 추천값 적용</button><span class="muted" style="font-size:12.5px;align-self:center">현재 설정을 추천값으로 바꿉니다. 이후 슬라이더로 자유롭게 조절하십시오.</span></div>';
  }

  /* ───────────── 도구 ───────────── */
  function th(k, l, num) { var on = L.sort === k; return '<th class="' + (num ? 'num' : '') + '" aria-sort="' + (on ? (L.dir > 0 ? 'ascending' : 'descending') : 'none') + '"><button class="thsort' + (on ? ' on' : '') + '" data-lab="sort" data-k="' + k + '">' + l + (on ? (L.dir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>'; }
  function sorter(rows, vals) { var f = vals[L.sort] || vals.name; return rows.slice().sort(function (a, b) { var x = f(a), y = f(b), r = typeof x === 'string' ? x.localeCompare(y, 'ko') : (x == null ? -1e9 : x) - (y == null ? -1e9 : y); return r * L.dir || String(a.name).localeCompare(String(b.name), 'ko'); }); }
  function bar(v, max, col) { return '<div style="height:8px;background:#e5e7eb;border-radius:var(--r)"><div style="height:8px;width:' + Math.max(0, Math.min(100, v / max * 100)).toFixed(1) + '%;background:' + (col || 'var(--primary)') + ';border-radius:var(--r)"></div></div>'; }
  var GN = { L: '하위', M: '중간', H: '상위' }, GC = { L: '#d03b3b', M: '#94a3b8', H: '#2563eb' };

  function tGrp(P) {
    var G = { L: [], M: [], H: [] }; P.pairs.forEach(function (o) { G[o.g].push(o); });
    var S = {}; ['L', 'M', 'H'].forEach(function (g) { S[g] = pairStat(G[g]); });
    var nm = { L: '하위 ' + L.lo + '%', M: '중간', H: '상위 ' + L.hi + '%' };
    var D = ST.D, secs = D.Q.sections, aoa = [['지표', nm.L, nm.M, nm.H]];
    function cell(g, v, f) { return S[g] ? f(v(S[g])) : '-'; }
    var rows = [['응답(과목 단위)', function (s) { return s.np; }, String], ['학생 수', function (s) { return s.nr; }, String], ['평균', function (s) { return s.mean; }, f2], ['긍정률(4·5점)', function (s) { return s.pos; }, pc], ['부정률(1·2점)', function (s) { return s.neg; }, pc],
      ['개인 내 편차(과목 간 SD)', function (s) { return s.inn; }, f2], ['개인 보정 편차', function (s) { return s.dev; }, f2], ['서술 작성률', function (s) { return s.tx; }, pc], ['과목당 입력 시간 중앙값(초)', function (s) { return s.du; }, function (v) { return v == null ? '-' : Math.round(v); }],
      ['동일 응답 비율', function (s) { return s.st; }, pc], ['점검 실패 비율', function (s) { return s.fl; }, pc]];
    var h = '<div class="panel"><h3>집단별 요약 <span class="muted" style="font-weight:400">· 실제 하위 비율 ' + pc(P.base * 100) + ' (경계 동점 포함)</span></h3><div class="tbl-wrap"><table class="t"><thead><tr><th>지표</th>' + ['L', 'M', 'H'].map(function (g) { return '<th class="num" style="color:' + GC[g] + '">' + nm[g] + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { var line = [r[0]]; var tds = ['L', 'M', 'H'].map(function (g) { var t = cell(g, r[1], r[2]); line.push(t); return '<td class="num">' + t + '</td>'; }); aoa.push(line); return '<tr><td>' + E(r[0]) + '</td>' + tds.join('') + '</tr>'; }).join('') + '</tbody></table></div></div>';
    h += '<div class="panel"><h3>점수 분포 (1~5점 비율)</h3>' + ['L', 'M', 'H'].map(function (g) {
      var s = S[g]; if (!s) return ''; var cols = ['#b91c1c', '#ef8a62', '#cbd5e1', '#67a9cf', '#2166ac'];
      return '<div style="margin:8px 0"><div style="font-size:12.5px;color:' + GC[g] + ';font-weight:700">' + nm[g] + '</div><div style="display:flex;height:20px;border-radius:var(--r);overflow:hidden">' + s.dist.map(function (v, i) { return '<div title="' + (i + 1) + '점 ' + pc(v) + '" style="width:' + v + '%;background:' + cols[i] + '"></div>'; }).join('') + '</div><div class="muted" style="font-size:11.5px">' + s.dist.map(function (v, i) { return (i + 1) + '점 ' + pc(v); }).join(' · ') + '</div></div>';
    }).join('') + '</div>';
    var sm = secs.map(function (s) { var r = [secShort(s.title)]; ['L', 'M', 'H'].forEach(function (g) { var ss = 0, nn = 0; G[g].forEach(function (o) { var e = o.sec[s.id]; if (e) { ss += e.s; nn += e.n; } }); r.push(nn ? ss / nn : null); }); return r; });
    aoa.push([], ['영역별 평균', nm.L, nm.M, nm.H]); sm.forEach(function (r) { aoa.push([r[0], r[1], r[2], r[3]]); });
    h += '<div class="panel"><h3>영역별 평균 비교</h3>' + sm.map(function (r) { return '<div style="display:grid;grid-template-columns:110px 1fr;gap:8px;align-items:center;margin:6px 0"><div style="font-size:12.5px">' + E(r[0]) + '</div><div>' + [1, 2, 3].map(function (i) { return '<div style="display:flex;gap:6px;align-items:center"><div style="flex:1">' + bar(r[i] || 0, 5, GC['LMH'[i - 1]]) + '</div><span style="width:34px;font-size:12px">' + f2(r[i]) + '</span></div>'; }).join('') + '</div></div>'; }).join('') + '<div class="muted" style="font-size:12px">막대 색: 붉음 = 하위, 회색 = 중간, 파랑 = 상위</div></div>';
    return { h: h, x: aoa };
  }

  function tUnt(P) {
    var key = dimKey(L.unit), grand = P.grand, base = P.base, aoa = [['대상', '응답(과목 단위)', '학생', '평균', '하위 제외 평균', '하위 비중 %', '배수', '개인 보정 편차', '보정 응답 수', '표본 보정 평균', '판독']];
    var rows = groupBy(P.pairs, key).map(function (g) {
      var a = g.a, s = 0, n = 0, es = 0, en = 0, ls = 0, devs = [], rs = {};
      a.forEach(function (o) { s += o.s; n += o.n; rs[o.rid] = 1; if (o.g === 'L') ls++; else { es += o.s; en += o.n; } if (o.dev != null) devs.push(o.dev); });
      var np = a.length, share = ls / np * 100, ratio = base > 0 ? share / 100 / base : null, dev = mean(devs), mn = s / n, tag;
      if (np < L.minN) tag = '표본 부족';
      else { var hi = ratio != null && ratio >= L.ratio, lw = dev != null && dev <= -L.dev; tag = hi && lw ? '집중' : hi ? '비중 높음' : lw ? '상대적 낮음' : '분산'; }
      return { name: g.name, np: np, st: Object.keys(rs).length, mean: mn, exl: en ? es / en : null, share: share, ratio: ratio, dev: dev, nd: devs.length, shr: (np * mn + L.k * grand) / (np + L.k), tag: tag, ok: np >= L.minN };
    });
    var TC = { '집중': '#fee2e2;color:#b91c1c', '비중 높음': '#ffedd5;color:#c2410c', '상대적 낮음': '#fef9c3;color:#a16207', '분산': '#e5e7eb;color:#374151', '표본 부족': '#f3f4f6;color:#9ca3af' };
    var ok = rows.filter(function (r) { return r.ok; }), no = rows.filter(function (r) { return !r.ok; });
    var vals = { name: function (r) { return r.name; }, np: function (r) { return r.np; }, mean: function (r) { return r.mean; }, exl: function (r) { return r.exl; }, share: function (r) { return r.share; }, ratio: function (r) { return r.ratio; }, dev: function (r) { return r.dev; }, shr: function (r) { return r.shr; } };
    var H = API().heatColor, list = sorter(ok, vals);
    list.concat(no).forEach(function (r) { aoa.push(r.ok ? [r.name, r.np, r.st, r.mean, r.exl, r.share, r.ratio, r.dev, r.nd, r.shr, r.tag] : [r.name, r.np, '', '', '', '', '', '', '', '', r.tag]); });
    var cnt = {}; ok.forEach(function (r) { cnt[r.tag] = (cnt[r.tag] || 0) + 1; });
    var h = '<div class="panel"><div class="row" style="gap:14px;flex-wrap:wrap">' + ['집중', '비중 높음', '상대적 낮음', '분산'].map(function (t) { return '<div class="kpi" style="min-width:120px"><div class="l">' + t + '</div><div class="v">' + (cnt[t] || 0) + '</div></div>'; }).join('') + '<div class="kpi" style="min-width:120px"><div class="l">표본 부족</div><div class="v">' + no.length + '</div></div></div>' +
      '<p class="muted" style="font-size:12.5px;margin:8px 0">기준: 하위 비중 ≥ 실제 하위 비율(' + pc(base * 100) + ')의 ' + L.ratio + '배, 개인 보정 편차 ≤ −' + L.dev + '점. 평균은 점검 문항 제외 5점 만점이며 개인 보정 편차는 두 과목 이상 응답한 학생만 계산합니다.</p>' +
      '<div class="tbl-wrap" style="max-height:560px;overflow:auto"><table class="t cmpt"><thead><tr><th>판독</th>' + th('name', E(DIMS.filter(function (d) { return d[0] === L.unit; })[0][1]), false) + th('np', '응답', true) + th('mean', '평균', true) + th('exl', '하위 제외', true) + th('share', '하위 비중', true) + th('ratio', '배수', true) + th('dev', '개인 보정', true) + th('shr', '표본 보정', true) + '</tr></thead><tbody>' +
      list.map(function (r) { var hc = H(r.mean); return '<tr><td><span class="badge" style="background:' + TC[r.tag] + '">' + r.tag + '</span></td><td><b>' + E(r.name) + '</b></td><td class="num">' + r.np + '</td><td class="hc num" style="background:' + hc.bg + ';color:' + hc.fg + '">' + f2(r.mean) + '</td><td class="num">' + f2(r.exl) + '</td><td class="num">' + pc(r.share) + '</td><td class="num">' + (r.ratio == null ? '-' : r.ratio.toFixed(1) + '배') + '</td><td class="num">' + (r.dev == null ? '-' : (r.dev > 0 ? '+' : '') + r.dev.toFixed(2)) + '</td><td class="num">' + f2(r.shr) + '</td></tr>'; }).join('') +
      no.map(function (r) { return '<tr style="opacity:.55"><td><span class="badge" style="background:' + TC['표본 부족'] + '">표본 부족</span></td><td>' + E(r.name) + '</td><td class="num">' + r.np + '</td><td colspan="6" class="muted">응답 ' + L.minN + '건 미만 — 숫자를 가렸습니다</td></tr>'; }).join('') + '</tbody></table></div></div>';
    return { h: h, x: aoa };
  }

  function tSame(P) {
    var by = {}; P.pairs.forEach(function (o) { if (!o.c.prof) return; var b = by[o.c.name] || (by[o.c.name] = {}); (b[o.c.prof] = b[o.c.prof] || []).push(o.m); });
    var rows = [], aoa = [['과목명', '교수', '응답', '평균', '표준편차', '최고-최저 차이', '오차 범위 밖']];
    Object.keys(by).forEach(function (nm) {
      var ps = Object.keys(by[nm]).filter(function (p) { return by[nm][p].length >= L.minN; }).map(function (p) { var a = by[nm][p]; return { p: p, n: a.length, m: mean(a), sd: sd(a) || 0 }; }).sort(function (x, y) { return y.m - x.m; });
      if (ps.length < 2) return;
      var t = ps[0], b = ps[ps.length - 1], se = Math.sqrt(t.sd * t.sd / t.n + b.sd * b.sd / b.n), gap = t.m - b.m;
      rows.push({ name: nm, ps: ps, gap: gap, sig: se > 0 && gap > 1.96 * se, se: se });
    });
    rows.sort(function (a, b) { return b.gap - a.gap; });
    rows.forEach(function (r) { r.ps.forEach(function (p) { aoa.push([r.name, p.p, p.n, p.m, p.sd, r.gap, r.sig ? '예' : '아니오']); }); });
    var h = '<div class="panel"><h3>같은 과목을 맡은 교수 간 비교 <span class="muted" style="font-weight:400">· ' + rows.length + '개 과목명 (응답 ' + L.minN + '건 이상 교수 2명 이상)</span></h3>' +
      (rows.length ? '<div class="tbl-wrap" style="max-height:600px;overflow:auto"><table class="t"><thead><tr><th>과목명</th><th>교수별 평균 (응답)</th><th class="num">최고-최저</th><th>판독</th></tr></thead><tbody>' + rows.map(function (r) {
        return '<tr><td><b>' + E(r.name) + '</b></td><td>' + r.ps.map(function (p) { return '<div style="display:grid;grid-template-columns:90px 1fr 70px;gap:8px;align-items:center;font-size:12.5px"><span>' + E(p.p) + '</span>' + bar(p.m, 5, 'var(--primary)') + '<span>' + f2(p.m) + ' (' + p.n + ')</span></div>'; }).join('') + '</td><td class="num"><b>' + r.gap.toFixed(2) + '</b></td><td>' + (r.sig ? '<span class="badge" style="background:#fee2e2;color:#b91c1c">오차 범위 밖</span>' : '<span class="badge badge-gray">우연 범위</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>'
        : '<div class="t-empty">같은 과목명을 2명 이상의 교수가 맡고 각 ' + L.minN + '건 이상 응답받은 과목이 없습니다. 「최소 응답 수」를 낮추거나 필터를 확인해 주십시오.</div>') + '</div>';
    return { h: h, x: aoa };
  }

  function tVar(P) {
    var F = [['prof', '교수'], ['cname', '과목명'], ['course', '과목(반별)'], ['klass', '반'], ['track', '계열'], ['kind', '이론·실습']], aoa = [['요인', '집단 수', 'η²', '보정 ε²']], N = P.pairs.length, gm = mean(P.pairs.map(function (o) { return o.m; })), sst = 0;
    P.pairs.forEach(function (o) { sst += (o.m - gm) * (o.m - gm); });
    function calc(groups) {
      var k = groups.length, ssb = 0, n = 0; groups.forEach(function (g) { var m = mean(g); ssb += g.length * (m - gm) * (m - gm); n += g.length; });
      var dfb = k - 1, dfw = n - k; if (dfb < 1 || dfw < 1 || sst <= 0) return null;
      var ssw = 0; groups.forEach(function (g) { var m = mean(g); g.forEach(function (x) { ssw += (x - m) * (x - m); }); });
      return { k: k, eta: ssb / sst, eps: Math.max(0, (ssb - dfb * (ssw / dfw)) / sst) };
    }
    var rows = F.map(function (f) { var kf = dimKey(f[0]), g = {}; P.pairs.forEach(function (o) { (g[kf(o)] = g[kf(o)] || []).push(o.m); }); return { n: f[1], r: calc(Object.keys(g).map(function (k) { return g[k]; })) }; });
    var sg = {}; Object.keys(P.resp).forEach(function (id) { var R = P.resp[id]; if (R.pairs.length > 1) sg[id] = R.pairs.map(function (o) { return o.m; }); }); rows.push({ n: '학생(응답 성향)', r: calc(Object.keys(sg).map(function (k) { return sg[k]; })) });
    rows.forEach(function (r) { aoa.push([r.n, r.r ? r.r.k : '', r.r ? r.r.eta : '', r.r ? r.r.eps : '']); });
    var mx = Math.max.apply(null, rows.map(function (r) { return r.r ? Math.max(r.r.eta, r.r.eps) : 0; }).concat([0.05]));
    var h = '<div class="panel"><h3>점수 변동을 설명하는 요인 <span class="muted" style="font-weight:400">· 응답×과목 ' + N + '건 기준</span></h3><div class="tbl-wrap"><table class="t"><thead><tr><th>요인</th><th class="num">집단 수</th><th>η² (설명 비율)</th><th>보정 ε² (집단 수 보정)</th></tr></thead><tbody>' + rows.map(function (r) {
      return '<tr><td><b>' + E(r.n) + '</b></td><td class="num">' + (r.r ? r.r.k : '-') + '</td><td>' + (r.r ? '<div style="display:flex;gap:8px;align-items:center"><div style="flex:1">' + bar(r.r.eta, mx, '#94a3b8') + '</div><b>' + pc(r.r.eta * 100) + '</b></div>' : '-') + '</td><td>' + (r.r ? '<div style="display:flex;gap:8px;align-items:center"><div style="flex:1">' + bar(r.r.eps, mx, 'var(--primary)') + '</div><b>' + pc(r.r.eps * 100) + '</b></div>' : '-') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="muted" style="font-size:12.5px;margin-top:8px">요인끼리 겹치므로(교수⊂과목 등) 합이 100%가 아닙니다. 요인 사이의 상대 크기로 읽으십시오. 학생 요인은 두 과목 이상 응답한 학생만 포함합니다.</p></div>';
    return { h: h, x: aoa };
  }

  function tMap(P) {
    var D = ST.D, secs = D.Q.sections, key = dimKey(L.unit), H = API().heatColor, by = groupBy(P.pairs, key).filter(function (g) { return g.a.length >= L.minN; });
    var cells = by.map(function (g) { var r = { name: g.name, n: g.a.length, sec: {} }; secs.forEach(function (s) { var ss = 0, nn = 0; g.a.forEach(function (o) { var e = o.sec[s.id]; if (e) { ss += e.s; nn += e.n; } }); r.sec[s.id] = nn ? ss / nn : null; }); r.all = mean(g.a.map(function (o) { return o.m; })); return r; });
    var st = {}; secs.forEach(function (s) { var v = cells.map(function (r) { return r.sec[s.id]; }).filter(function (x) { return x != null; }); st[s.id] = { m: mean(v), sd: sd(v) }; });
    cells.sort(function (a, b) { return (a.all || 0) - (b.all || 0); });
    var aoa = [['대상', '응답'].concat(secs.map(function (s) { return secShort(s.title); }))], hit = [];
    function zc(z) { if (z == null) return '#f3f4f6'; var t = Math.min(1, Math.abs(z) / 2.5); return z < 0 ? SVY.mix('#ffffff', '#e5484d', t) : SVY.mix('#ffffff', '#3b82f6', t); }
    var shown = cells.slice(0, 80);
    var h = '<div class="panel"><h3>영역 히트맵 <span class="muted" style="font-weight:400">· 색 = 같은 영역 대상 간 z점수 (붉음 낮음 / 파랑 높음), 굵은 칸 = |z| ≥ ' + L.z + '</span></h3><div class="tbl-wrap" style="max-height:600px;overflow:auto"><table class="t"><thead><tr><th>' + E(DIMS.filter(function (d) { return d[0] === L.unit; })[0][1]) + '</th><th class="num">응답</th>' + secs.map(function (s) { return '<th class="num">' + E(secShort(s.title)) + '</th>'; }).join('') + '</tr></thead><tbody>' + shown.map(function (r) {
      return '<tr><td><b>' + E(r.name) + '</b></td><td class="num">' + r.n + '</td>' + secs.map(function (s) {
        var v = r.sec[s.id], z = v != null && st[s.id].sd > 0 ? (v - st[s.id].m) / st[s.id].sd : null, big = z != null && Math.abs(z) >= L.z; if (big) hit.push({ n: r.name, s: secShort(s.title), v: v, z: z });
        return '<td class="num" style="background:' + zc(z) + ';' + (big ? 'font-weight:800;outline:2px solid #374151;outline-offset:-2px' : '') + '" title="z ' + f2(z) + '">' + f2(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' + (cells.length > 80 ? '<div class="muted" style="font-size:12px">평균이 낮은 80개만 표시했습니다. (엑셀에는 전체 포함)</div>' : '') + '</div>';
    cells.forEach(function (r) { aoa.push([r.name, r.n].concat(secs.map(function (s) { return r.sec[s.id]; }))); });
    hit.sort(function (a, b) { return a.z - b.z; });
    h += '<div class="panel"><h3>이례적인 칸 (|z| ≥ ' + L.z + ') <span class="muted" style="font-weight:400">· ' + hit.length + '개</span></h3>' + (hit.length ? '<div class="tbl-wrap" style="max-height:300px;overflow:auto"><table class="t"><thead><tr><th>대상</th><th>영역</th><th class="num">평균</th><th class="num">z</th></tr></thead><tbody>' + hit.map(function (x) { return '<tr><td>' + E(x.n) + '</td><td>' + E(x.s) + '</td><td class="num">' + f2(x.v) + '</td><td class="num" style="color:' + (x.z < 0 ? '#b91c1c' : '#1d4ed8') + '">' + (x.z > 0 ? '+' : '') + x.z.toFixed(2) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="t-empty">기준을 넘는 칸이 없습니다. 기준을 낮춰 보십시오.</div>') + '</div>';
    return { h: h, x: aoa };
  }

  function tBeh(P) {
    var D = ST.D, aoa = [['구분', '항목', '응답(과목 단위)', '평균', '동일 응답 %', '서술 작성 %', '하위 비중 %']];
    function line(grp, lab, a) { var s = pairStat(a); aoa.push([grp, lab, s.np, s.mean, s.st, s.tx, s.low]); return '<tr><td>' + E(lab) + '</td><td class="num">' + s.np + '</td><td class="num"><b>' + f2(s.mean) + '</b></td><td class="num">' + pc(s.st) + '</td><td class="num">' + pc(s.tx) + '</td><td class="num">' + pc(s.low) + '</td></tr>'; }
    function tbl(title, rows, note) { return '<div class="panel"><h3>' + E(title) + '</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>구분</th><th class="num">응답</th><th class="num">평균</th><th class="num">동일 응답</th><th class="num">서술 작성</th><th class="num">하위 비중</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>' + (note ? '<p class="muted" style="font-size:12.5px;margin-top:6px">' + note + '</p>' : '') + '</div>'; }
    var h = '', bq = ((A.cur.survey.def.basic || []).filter(function (q) { return q.type === 'single' && (/attend/i.test(q.id) || /출석/.test(q.label || '')); })[0]);
    if (bq) { var g = {}; P.pairs.forEach(function (o) { var v = o.r.answers.common && o.r.answers.common[bq.id]; (g[v == null ? '(무응답)' : v] = g[v == null ? '(무응답)' : v] || []).push(o); });
      h += tbl('출석 정도별 (' + bq.label + ')', (bq.options || []).map(function (op) { return g[op.id] && g[op.id].length >= L.minN ? line('출석', op.label, g[op.id]) : '<tr style="opacity:.55"><td>' + E(op.label) + '</td><td colspan="5" class="muted">응답 ' + L.minN + '건 미만 — 가림</td></tr>'; }), '출석이 낮은 집단의 평균이 크게 다르면 대상별 비교를 읽을 때 출석 구성을 함께 보십시오.'); }
    var bk = { fast: [], mid: [], slow: [] }; P.pairs.forEach(function (o) { var nc = Object.keys((o.r.answers && o.r.answers.course) || {}).length || 1, sec = o.r.duration_sec / nc; bk[sec < L.fast ? 'fast' : sec > L.slow ? 'slow' : 'mid'].push(o); });
    h += tbl('과목당 입력 시간별 (빠름 &lt; ' + L.fast + '초 &lt; 보통 &lt; ' + L.slow + '초 &lt; 느림)', [['fast', '빠름'], ['mid', '보통'], ['slow', '느림']].map(function (b) { return bk[b[0]].length >= L.minN ? line('입력시간', b[1], bk[b[0]]) : '<tr style="opacity:.55"><td>' + b[1] + '</td><td colspan="5" class="muted">응답 ' + L.minN + '건 미만 — 가림</td></tr>'; }), '빠른 응답의 평균·동일 응답 비율이 다르면 성의 없는 응답이 결과에 미치는 영향을 의심합니다.');
    var ids = Object.keys(P.resp).sort(function (a, b) { return P.resp[a].r.seq - P.resp[b].r.seq; }), q = Math.ceil(ids.length / 4), qs = [];
    for (var i = 0; i < 4; i++) { var a = []; ids.slice(i * q, (i + 1) * q).forEach(function (id) { a = a.concat(P.resp[id].pairs); }); qs.push(a); }
    h += tbl('제출 시기별 (응답 순서 4등분)', qs.map(function (a, i) { return a.length >= L.minN ? line('제출시기', (i + 1) + '/4 구간' + (i === 0 ? ' (초기)' : i === 3 ? ' (마감 쪽)' : ''), a) : ''; }), '마감 쪽 응답이 짧고 동일 응답이 많다면 경품 등 보상의 영향을 의심합니다.');
    var tg = {}; (A.cur.targets || []).forEach(function (t) { if (t.headcount > 0) tg[t.track + '|' + t.grade] = t.headcount; });
    var rg = groupBy(Object.keys(P.resp).map(function (id) { return P.resp[id]; }), function (R) { return R.r.track + '|' + R.r.grade; });
    if (Object.keys(tg).length) h += '<div class="panel"><h3>계열·학년별 응답률</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>계열·학년</th><th class="num">재적</th><th class="num">응답 학생</th><th class="num">응답률</th><th class="num">평균</th></tr></thead><tbody>' + rg.filter(function (g) { return tg[g.name]; }).map(function (g) { var pr = []; g.a.forEach(function (R) { pr = pr.concat(R.pairs); }); var s = pairStat(pr); aoa.push(['응답률', g.name.replace('|', ' '), tg[g.name], g.a.length, g.a.length / tg[g.name] * 100, s.mean]); return '<tr><td>' + E(g.name.replace('|', ' ')) + '</td><td class="num">' + tg[g.name] + '</td><td class="num">' + g.a.length + '</td><td class="num">' + pc(g.a.length / tg[g.name] * 100) + '</td><td class="num">' + f2(s.mean) + '</td></tr>'; }).join('') + '</tbody></table></div><p class="muted" style="font-size:12.5px;margin-top:6px">응답률이 낮은 단위의 평균이 극단적이면 자발 응답 편향(불만이 큰 학생만 응답)을 의심합니다. 단위가 적어 상관계수는 계산하지 않습니다.</p></div>';
    return { h: h, x: aoa };
  }

  function tRank(P) {
    var key = dimKey(L.unit), aoa = [['대상', '전체 순위', '점검 통과 순위', '동일 응답 제외 순위', '하위 제외 순위', '표본 보정 순위', '최대 변동', '불안정']];
    function ag(f) { var g = {}; P.pairs.filter(f).forEach(function (o) { var k = key(o); var e = g[k] || (g[k] = { s: 0, n: 0, np: 0 }); e.s += o.s; e.n += o.n; e.np++; }); return g; }
    var A0 = ag(function () { return true; }), conds = [ag(function (o) { return API().passResp(o.r); }), ag(function (o) { return !o.r.straight; }), ag(function (o) { return o.g !== 'L'; })];
    var names = Object.keys(A0).filter(function (k) { return A0[k].np >= L.minN; });
    function rk(vf) { var arr = names.filter(function (k) { return vf(k) != null; }), v = arr.map(function (k) { return -vf(k); }), r = ranks(v), o = {}; arr.forEach(function (k, i) { o[k] = r[i]; }); return o; }
    var rs = [rk(function (k) { return A0[k].s / A0[k].n; })].concat(conds.map(function (c) { return rk(function (k) { return c[k] && c[k].np >= L.minN ? c[k].s / c[k].n : null; }); })).concat([rk(function (k) { var e = A0[k], m = e.s / e.n; return (e.np * m + L.k * P.grand) / (e.np + L.k); })]);
    var rows = names.map(function (k) { var rr = rs.map(function (o) { return o[k]; }), mx = 0; rr.forEach(function (x) { if (x != null) mx = Math.max(mx, Math.abs(x - rr[0])); }); return { name: k, r: rr, shift: mx, bad: mx >= L.shift, m: A0[k].s / A0[k].n }; }).sort(function (a, b) { return a.r[0] - b.r[0]; });
    var rho = [1, 2, 3, 4].map(function (c) { var pr = rows.filter(function (r) { return r.r[c] != null; }); return pr.length > 2 ? pearson(ranks(pr.map(function (r) { return r.r[0]; })), ranks(pr.map(function (r) { return r.r[c]; }))) : null; });
    rows.forEach(function (r) { aoa.push([r.name].concat(r.r, [r.shift, r.bad ? '예' : '아니오'])); });
    var nb = rows.filter(function (r) { return r.bad; }).length;
    var h = '<div class="panel"><div class="row" style="gap:14px;flex-wrap:wrap"><div class="kpi" style="min-width:140px"><div class="l">불안정 대상</div><div class="v">' + nb + '<span style="font-size:15px;font-weight:500"> / ' + rows.length + '</span></div><div class="s">순위 변동 ' + L.shift + '칸 이상</div></div>' +
      ['점검 통과', '동일 응답 제외', '하위 제외', '표본 보정'].map(function (n, i) { return '<div class="kpi" style="min-width:120px"><div class="l">ρ (전체 순위와 ' + n + ')</div><div class="v" style="font-size:20px">' + f2(rho[i]) + '</div></div>'; }).join('') + '</div>' +
      '<div class="tbl-wrap" style="max-height:560px;overflow:auto;margin-top:10px"><table class="t"><thead><tr><th>' + E(DIMS.filter(function (d) { return d[0] === L.unit; })[0][1]) + '</th><th class="num">평균</th><th class="num">전체</th><th class="num">점검 통과</th><th class="num">동일 응답 제외</th><th class="num">하위 제외</th><th class="num">표본 보정</th><th class="num">최대 변동</th></tr></thead><tbody>' + rows.map(function (r) {
        return '<tr' + (r.bad ? ' style="background:#fff1f2"' : '') + '><td><b>' + E(r.name) + '</b></td><td class="num">' + f2(r.m) + '</td>' + r.r.map(function (x) { return '<td class="num">' + (x == null ? '-' : x) + '</td>'; }).join('') + '<td class="num"><b>' + r.shift + '</b></td></tr>'; }).join('') + '</tbody></table></div><p class="muted" style="font-size:12.5px;margin-top:6px">순위 1 = 평균이 가장 높은 대상. 최소 응답 수 미만이 되는 조건은 「-」로 표시하고 변동 계산에서 뺍니다.</p></div>';
    return { h: h, x: aoa };
  }

  function tIpa(P) {
    var D = ST.D, its = D.Q.scale.map(function (x) {
      var v = [], o2 = [], s = 0; P.pairs.forEach(function (o) { var a = o.vals[x.q.id]; if (a == null || o.aN < 2) return; v.push(a); o2.push((o.aS - a) / (o.aN - 1)); s += a; });
      return { id: x.q.id, label: x.q.label, sec: secShort(x.s.title), n: v.length, perf: v.length ? s / v.length : null, imp: pearson(v, o2) };
    }).filter(function (r) { return r.perf != null && r.imp != null; });
    if (!its.length) return { h: '<div class="panel"><div class="t-empty">계산할 문항이 부족합니다.</div></div>', x: [] };
    var ps = its.map(function (r) { return r.perf; }), ms = its.map(function (r) { return r.imp; }), ax = L.qx != null ? L.qx : mean(ps), ay = L.qy != null ? L.qy : median(ms);
    var x0 = Math.min.apply(null, ps), x1 = Math.max.apply(null, ps), y0 = Math.min.apply(null, ms), y1 = Math.max.apply(null, ms), px = (x1 - x0) * 0.1 || 0.1, py = (y1 - y0) * 0.1 || 0.1; x0 = Math.min(x0 - px, ax - px); x1 = Math.max(x1 + px, ax + px); y0 = Math.min(y0 - py, ay - py); y1 = Math.max(y1 + py, ay + py);
    var W = 620, Ht = 340, mL = 46, mB = 30; function X(v) { return mL + (v - x0) / (x1 - x0) * (W - mL - 10); } function Y(v) { return Ht - mB - (v - y0) / (y1 - y0) * (Ht - mB - 10); }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + Ht + '" style="width:100%;max-width:' + W + 'px;background:#fff;border:1px solid var(--border);border-radius:var(--r)"><line x1="' + X(ax) + '" x2="' + X(ax) + '" y1="10" y2="' + (Ht - mB) + '" stroke="#374151" stroke-dasharray="5 4"/><line x1="' + mL + '" x2="' + (W - 10) + '" y1="' + Y(ay) + '" y2="' + Y(ay) + '" stroke="#374151" stroke-dasharray="5 4"/>' +
      '<text x="' + (mL + 4) + '" y="22" font-size="11" fill="#b91c1c">성과 낮음 · 중요도 높음 (우선 개선)</text><text x="' + (W - 14) + '" y="22" font-size="11" text-anchor="end" fill="#1d4ed8">성과 높음 · 중요도 높음 (유지)</text><text x="' + (mL + 4) + '" y="' + (Ht - mB - 6) + '" font-size="11" fill="#6b7280">성과 낮음 · 중요도 낮음</text><text x="' + (W - 14) + '" y="' + (Ht - mB - 6) + '" font-size="11" text-anchor="end" fill="#6b7280">성과 높음 · 중요도 낮음</text>' +
      its.map(function (r) { var bad = r.perf < ax && r.imp > ay; return '<circle cx="' + X(r.perf) + '" cy="' + Y(r.imp) + '" r="5" fill="' + (bad ? '#d03b3b' : '#3b82f6') + '"><title>' + E(r.id + ' ' + r.label + ' · 성과 ' + f2(r.perf) + ' · 중요도 ' + f2(r.imp)) + '</title></circle><text x="' + (X(r.perf) + 7) + '" y="' + (Y(r.imp) + 4) + '" font-size="10.5" fill="#374151">' + E(r.id) + '</text>'; }).join('') +
      '<text x="' + (W / 2) + '" y="' + (Ht - 8) + '" font-size="11" text-anchor="middle" fill="#6b7280">성과 (문항 평균)</text><text x="12" y="' + (Ht / 2) + '" font-size="11" fill="#6b7280" transform="rotate(-90 12 ' + (Ht / 2) + ')" text-anchor="middle">중요도 (나머지 문항과의 상관)</text></svg>';
    var aoa = [['문항', '영역', '내용', '응답', '성과(평균)', '중요도(상관)', '사분면']], rows = its.slice().sort(function (a, b) { return a.perf - b.perf; });
    function qd(r) { return r.perf < ax && r.imp > ay ? '우선 개선' : r.perf >= ax && r.imp > ay ? '유지(강점)' : r.perf < ax ? '낮은 성과·낮은 중요도' : '과잉 투자 가능'; }
    rows.forEach(function (r) { aoa.push([r.id, r.sec, r.label, r.n, r.perf, r.imp, qd(r)]); });
    var sl = function (id, lbl, lo, hi, st, v) { return '<div style="min-width:220px;flex:1"><label class="f">' + lbl + ' <b data-labv="' + id + '">' + v.toFixed(2) + '</b></label><input type="range" data-lab="p" data-p="' + id + '" min="' + lo + '" max="' + hi + '" step="' + st + '" value="' + v + '" style="width:100%"></div>'; };
    var h = '<div class="panel"><h3>중요도-성과 매트릭스 <span class="muted" style="font-weight:400">· 기준선을 끌어 사분면을 바꿉니다</span></h3><div class="row" style="gap:14px;flex-wrap:wrap;margin-bottom:8px">' + sl('qx', '성과 기준선', 1, 5, 0.01, ax) + sl('qy', '중요도 기준선', -1, 1, 0.01, ay) + '<button class="btn btn-ghost btn-sm" data-lab="qauto" style="align-self:flex-end">자동(평균·중앙값)</button></div></div><div id="ipaview"><div class="panel">' + svg + '</div>' +
      '<div class="panel"><h3>문항 목록</h3><div class="tbl-wrap" style="max-height:420px;overflow:auto"><table class="t"><thead><tr><th>사분면</th><th>문항</th><th class="num">성과</th><th class="num">중요도</th></tr></thead><tbody>' + rows.map(function (r) { var q = qd(r); return '<tr><td><span class="badge ' + (q === '우선 개선' ? '' : 'badge-gray') + '"' + (q === '우선 개선' ? ' style="background:#fee2e2;color:#b91c1c"' : '') + '>' + q + '</span></td><td class="wrapcell"><b>' + E(r.id) + '</b> ' + E(String(r.label).slice(0, 50)) + ' <span class="muted">(' + E(r.sec) + ')</span></td><td class="num">' + f2(r.perf) + '</td><td class="num">' + f2(r.imp) + '</td></tr>'; }).join('') + '</tbody></table></div></div></div>';
    return { h: h, x: aoa };
  }

  var STOP = { '있다': 1, '없다': 1, '하는': 1, '해서': 1, '때문': 1, '그리고': 1, '하지만': 1, '그런데': 1, '정말': 1, '너무': 1, '조금': 1, '많이': 1, '같습니다': 1, '합니다': 1, '입니다': 1, '있습니다': 1, '없습니다': 1, '좋겠습니다': 1, '수업': 1, '교수': 1, '교수님': 1, '선생님': 1 };
  function toks(t) { var seen = {}; (String(t).match(/[가-힣]{2,}/g) || []).forEach(function (w) { if (w.length >= 3) w = w.replace(/(에서|에게|으로|으로는|에는|이다|이고|하고|해서|하는|입니다|합니다|습니다|은|는|이|가|을|를|의|에|도|로|와|과|만)$/, ''); if (w.length >= 2 && !STOP[w]) seen[w] = 1; }); return Object.keys(seen); }
  function tTxt(P) {
    var cl = [], co = [], cnt = { l: {}, o: {} }; P.pairs.forEach(function (o) { if (!o.tx.length) return; (o.g === 'L' ? cl : co).push(o); toks(o.tx.join(' ')).forEach(function (w) { var c = cnt[o.g === 'L' ? 'l' : 'o']; c[w] = (c[w] || 0) + 1; }); });
    var nl = cl.length, no = co.length, ws = {}; Object.keys(cnt.l).concat(Object.keys(cnt.o)).forEach(function (w) { ws[w] = 1; });
    var rows = Object.keys(ws).map(function (w) { var a = cnt.l[w] || 0, b = cnt.o[w] || 0, ra = nl ? a / nl * 100 : 0, rb = no ? b / no * 100 : 0; return { w: w, a: a, b: b, ra: ra, rb: rb, d: ra - rb }; }).filter(function (r) { return r.a + r.b >= 3; });
    var up = rows.filter(function (r) { return r.d > 0; }).sort(function (x, y) { return y.d - x.d; }).slice(0, 15), dn = rows.filter(function (r) { return r.d < 0; }).sort(function (x, y) { return x.d - y.d; }).slice(0, 15);
    var aoa = [['구분', '단어', '하위 집단 건수', '하위 100건당', '나머지 건수', '나머지 100건당']]; up.forEach(function (r) { aoa.push(['하위에서 많음', r.w, r.a, r.ra, r.b, r.rb]); }); dn.forEach(function (r) { aoa.push(['나머지에서 많음', r.w, r.a, r.ra, r.b, r.rb]); });
    function t(list, col) { return '<div class="tbl-wrap"><table class="t"><thead><tr><th>단어</th><th class="num">하위 100건당</th><th class="num">나머지 100건당</th><th class="num">건수(하/나)</th></tr></thead><tbody>' + (list.length ? list.map(function (r) { return '<tr><td><b style="color:' + col + '">' + E(r.w) + '</b></td><td class="num">' + r.ra.toFixed(1) + '</td><td class="num">' + r.rb.toFixed(1) + '</td><td class="num">' + r.a + ' / ' + r.b + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="t-empty">해당 단어가 없습니다.</td></tr>') + '</tbody></table></div>'; }
    var h = '<div class="panel"><h3>서술 의견 키워드 비교 <span class="muted" style="font-weight:400">· 하위 집단 의견 ' + nl + '건 / 나머지 ' + no + '건</span></h3>' + (nl < 5 ? '<div class="msg warn">' + I('alert', 18) + '<div>하위 집단의 서술 의견이 5건 미만이라 비교가 불안정합니다. 하위 %를 높이거나 분위 범위를 바꿔 보십시오.</div></div>' : '') + '<div class="grid g2"><div><h4 style="margin:6px 0">하위 집단에서 상대적으로 많은 단어</h4>' + t(up, '#b91c1c') + '</div><div><h4 style="margin:6px 0">나머지 집단에서 상대적으로 많은 단어</h4>' + t(dn, '#1d4ed8') + '</div></div></div>';
    return { h: h, x: aoa };
  }

  // 도구마다 의미 있는 조절 항목만 보여 줍니다.
  var NEED = { grp: ['scope', 'item', 'lo', 'hi'], unt: ['scope', 'item', 'unit', 'lo', 'hi', 'minN', 'k', 'ratio', 'dev'], same: ['item', 'minN'], 'var': ['item'], map: ['unit', 'minN', 'z'], beh: ['scope', 'item', 'lo', 'hi', 'minN', 'fast', 'slow'], rank: ['scope', 'item', 'unit', 'lo', 'hi', 'minN', 'k', 'shift'], ipa: [], txt: ['scope', 'item', 'lo', 'hi'] };
  var FN = { grp: tGrp, unt: tUnt, same: tSame, 'var': tVar, map: tMap, beh: tBeh, rank: tRank, ipa: tIpa, txt: tTxt };

  /* ───────────── 화면 ───────────── */
  function result(D) {
    var P = prep(D); if (!P.pairs.length) return { h: '<div class="panel"><div class="t-empty">분석할 응답이 없습니다. 위쪽 응답 범위·필터를 확인해 주십시오.</div></div>', x: [] };
    assign(P); var r = FN[L.tool](P); LAST = { name: (TOOLS.filter(function (t) { return t[0] === L.tool; })[0] || [0, '분석'])[1], aoa: r.x }; return r;
  }
  function rng(id, lbl, lo, hi, st, unit) { return '<div style="min-width:200px;flex:1"><label class="f">' + lbl + hp(HELP[id]) + ' <b data-labv="' + id + '">' + L[id] + '</b>' + (unit || '') + '</label><input type="range" data-lab="p" data-p="' + id + '" min="' + lo + '" max="' + hi + '" step="' + st + '" value="' + L[id] + '" style="width:100%"></div>'; }
  function opts(arr, cur) { return arr.map(function (o) { return '<option value="' + E(o[0]) + '"' + (String(cur) === String(o[0]) ? ' selected' : '') + '>' + E(o[1]) + '</option>'; }).join(''); }
  V.lab = function (D) {
    var P = prep(D), R = P.pairs.length ? recommend(P) : null, t = L.tool, nd = function (x) { return NEED[t].indexOf(x) >= 0; };
    var items = [['all', '종합(전체 문항)']].concat(D.Q.sections.map(function (s) { return ['s:' + s.id, '영역 · ' + s.title]; })).concat(D.Q.scale.map(function (x) { return ['q:' + x.q.id, x.q.id + ' ' + String(x.q.label).slice(0, 28)]; }));
    var h = '<div class="panel"><h3>비교 분석실 <span class="muted" style="font-weight:400">· 슬라이더와 버튼으로 기준을 바꾸며 여러 측면에서 대조합니다</span></h3>' +
      '<p class="muted" style="font-size:12.5px;margin:0 0 8px">5점 척도에서 <b>5점이 가장 좋은 평가</b>이며 점검 문항은 제외합니다. 위쪽 응답 범위(전체/유효 응답만)·계열·반 필터를 그대로 따르고, 모든 계산은 이 브라우저 안에서만 합니다(서버·AI 전송 없음).</p>' +
      (R ? recBox(R) : '') + '<div class="gpills">' + TOOLS.map(function (x) { return '<button class="pill" data-lab="tool" data-v="' + x[0] + '" aria-selected="' + (t === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>' + (TIPS[t] ? tip(TIPS[t][0], TIPS[t][1]) : '') +
      '<div class="row" style="gap:12px;flex-wrap:wrap;align-items:flex-end">' + (nd('scope') ? '<div><label class="f">분위 산정 범위' + hp(HELP.scope) + '</label><div class="gpills" style="margin:0">' + [['school', '전체 학생'], ['klass', '같은 반'], ['course', '같은 과목']].map(function (x) { return '<button class="pill" data-lab="scope" data-v="' + x[0] + '" aria-selected="' + (L.scope === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div>' : '') +
      (nd('item') ? '<div style="min-width:220px;flex:1"><label class="f">점수 기준' + hp(HELP.item) + '</label><select class="fld" data-lab="item">' + opts(items, L.item) + '</select></div>' : '') +
      (nd('unit') ? '<div style="min-width:190px"><label class="f">비교 단위' + hp(HELP.unit) + '</label><select class="fld" data-lab="unit">' + opts(DIMS, L.unit) + '</select></div>' : '') + '</div>' +
      '<div class="row" style="gap:14px;flex-wrap:wrap;margin-top:10px">' + (nd('lo') ? rng('lo', '하위 %', 1, 40, 1, '%') : '') + (nd('hi') ? rng('hi', '상위 %', 0, 40, 1, '%') : '') + (nd('minN') ? rng('minN', '최소 응답 수', 1, 40, 1, '건') : '') +
      (nd('k') ? rng('k', '표본 보정 k', 0, 60, 1) : '') + (nd('ratio') ? rng('ratio', '하위 비중 배수', 1, 5, 0.1, '배') : '') + (nd('dev') ? rng('dev', '개인 보정 편차', 0, 1, 0.05, '점') : '') + (nd('z') ? rng('z', '강조 기준 |z|', 0.5, 3, 0.1) : '') + (nd('shift') ? rng('shift', '불안정 순위 변동', 1, 30, 1, '칸') : '') +
      (nd('fast') ? rng('fast', '빠른 응답(초/과목)', 5, 120, 1, '초') : '') + (nd('slow') ? rng('slow', '느린 응답(초/과목)', 30, 600, 5, '초') : '') + '</div>' +
      '<div class="row" style="margin-top:10px"><button class="btn btn-secondary btn-sm" data-lab="xlsx">' + I('download', 14) + ' 현재 도구 엑셀</button><span class="muted" style="font-size:12.5px;align-self:center">PDF·인쇄는 위쪽 공통 버튼을 사용하십시오. 현재 설정값은 엑셀의 「설정」 시트에 함께 저장됩니다.</span></div></div>' +
      '<div id="labres">' + result(D).h + '</div>';
    return h;
  };
  // part 가 있으면 그 영역만 바꿉니다(끌고 있는 슬라이더를 다시 그리지 않기 위함)
  function refresh(part) {
    var el = document.getElementById('labres'); if (!el) return; var h = result(API().compute()).h;
    if (part) { var tmp = document.createElement('div'); tmp.innerHTML = h; var nw = tmp.querySelector('#' + part), old = el.querySelector('#' + part); if (nw && old) { old.innerHTML = nw.innerHTML; return; } }
    el.innerHTML = h;
  }
  function xlsx() {
    if (!window.XLSX) return A.toast('엑셀 라이브러리를 불러오지 못했습니다.', 'err');
    result(API().compute()); var wb = XLSX.utils.book_new(), nm = LAST.name;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(LAST.aoa.length ? LAST.aoa : [['데이터 없음']]), nm.slice(0, 31));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['항목', '값'], ['도구', nm], ['분위 산정 범위', L.scope], ['하위 %', L.lo], ['상위 %', L.hi], ['점수 기준', L.item], ['비교 단위', L.unit], ['최소 응답 수', L.minN], ['표본 보정 k', L.k], ['하위 비중 배수', L.ratio], ['개인 보정 편차', L.dev], ['z 기준', L.z], ['순위 변동', L.shift], ['빠른 응답(초)', L.fast], ['느린 응답(초)', L.slow], ['응답 범위 필터', API().F.sincere], ['출력 일시', new Date().toISOString()]]), '설정');
    A.download(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' }), '비교분석실_' + nm.replace(/[\\/:*?"<>|\s]+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx'); A.toast('엑셀 파일을 내려받았습니다.');
  }
  A.ext.labMath = { mean: mean, sd: sd, median: median, quant: quant, pearson: pearson, ranks: ranks };   // 계산 검증용
  var prevHook = A.ext.rhook;
  A.ext.rhook = function (e, type) {
    var t = e.target, el = t.closest && t.closest('[data-lab]');
    if (!el) return prevHook ? prevHook(e, type) : false;
    var k = el.getAttribute('data-lab'), isRange = el.tagName === 'INPUT' && el.type === 'range';
    if (isRange) {
      if (type === 'click') return true;
      var p = el.getAttribute('data-p'), v = Number(el.value); L[p] = v; ST.gk = ''; var lb = document.querySelector('[data-labv="' + p + '"]'); if (lb) lb.textContent = (p === 'qx' || p === 'qy' || p === 'z' || p === 'dev' || p === 'ratio') ? v.toFixed(p === 'ratio' || p === 'z' ? 1 : 2) : v; refresh(p === 'qx' || p === 'qy' ? 'ipaview' : ''); return true;
    }
    if (k === 'item' || k === 'unit') { if (type !== 'change') return true; L[k] = el.value; ST.gk = ''; API().render(); return true; }
    if (type !== 'click') return true;
    if (k === 'tool') { L.tool = el.getAttribute('data-v'); L.sort = { unt: 'share', rank: 'name' }[L.tool] || 'share'; L.dir = -1; if (L.tool === 'rank') L.dir = 1; API().render(); }
    else if (k === 'scope') { L.scope = el.getAttribute('data-v'); ST.gk = ''; API().render(); }
    else if (k === 'sort') { var sk = el.getAttribute('data-k'); if (L.sort === sk) L.dir = -L.dir; else { L.sort = sk; L.dir = sk === 'name' ? 1 : -1; } refresh(); }
    else if (k === 'qauto') { L.qx = L.qy = null; API().render(); }
    else if (k === 'rec') { var R = recommend(prep(API().compute())); ['lo', 'hi', 'scope', 'minN', 'k', 'ratio', 'dev', 'z', 'shift', 'fast', 'slow'].forEach(function (x) { L[x] = R[x]; }); ST.gk = ''; API().render(); A.toast('추천 기준을 적용했습니다.'); }
    else if (k === 'xlsx') xlsx();
    return true;
  };
})();
