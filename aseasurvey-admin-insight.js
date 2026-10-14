'use strict';
/**
 * aseasurvey-admin-insight.js — 결과 분석: 조건 검출(기준값 조절) · 같은 과목 비교 · 기간 중 참여 현황
 *  · 5점 척도에서 5점이 가장 좋은 평가입니다. 긍정률 = 4·5점 비율, 부정률 = 1·2점 비율 (점검 문항은 제외)
 *  · 결과 화면의 응답 범위(전체/유효 응답만)·계열·학년·반 필터를 그대로 따릅니다.
 *  · results.js 의 A.ext.resApi 와 A.ext.rviews / A.ext.rhook 확장 지점을 사용합니다.
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico, API = function () { return A.ext.resApi; };
  var V = A.ext.rviews = A.ext.rviews || {};
  var DIMS = [['prof', '교수'], ['course', '과목'], ['klass', '반'], ['grade', '학년'], ['track', '계열'], ['kind', '이론·실습']];
  var MET = { mean: { n: '평균 점수', lo: 1, hi: 5, st: 0.05, f: function (v) { return v.toFixed(2); } }, pos: { n: '긍정률(4·5점) %', lo: 0, hi: 100, st: 1, f: function (v) { return Math.round(v) + '%'; } },
    neg: { n: '부정률(1·2점) %', lo: 0, hi: 100, st: 1, f: function (v) { return Math.round(v) + '%'; } }, sd: { n: '의견 분산(표준편차)', lo: 0, hi: 2, st: 0.05, f: function (v) { return v.toFixed(2); } } };
  var DET = A.ext.det = { dim: 'prof', item: 'all', conds: [{ m: 'mean', op: 'le', v: 3.5 }], join: 'and', minN: 5, sort: 'mean', dir: 1, showAll: false };
  var SAME = A.ext.same = { sel: '', minN: 3, only2: true };
  var LIVE = A.ext.live = { target: 70 };

  function secShort(t) { return String(t).replace(/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\.\s*/, '').slice(0, 10); }
  function dimKey(dim) {
    return { track: function (p) { return p.r.track; }, grade: function (p) { return p.r.track + ' ' + p.r.grade; }, klass: function (p) { return p.r.track + ' ' + p.r.grade + ' ' + p.r.klass; },
      prof: function (p) { return p.c.prof || '(교수 미입력)'; }, course: function (p) { return p.c.name + ' · ' + (p.c.klass || '') + (p.c.prof ? ' · ' + p.c.prof : ''); }, kind: function (p) { return p.c.kind || '(구분 없음)'; } }[dim];
  }
  function itemQs(D, item) {
    if (item === 'all') return D.Q.scale;
    if (item.indexOf('s:') === 0) return D.Q.scale.filter(function (x) { return x.s.id === item.slice(2); });
    return D.Q.scale.filter(function (x) { return x.q.id === item.slice(2); });
  }
  function itemName(D, item) {
    if (item === 'all') return '종합(전체 문항)';
    if (item.indexOf('s:') === 0) { var s = D.Q.sections.filter(function (x) { return x.id === item.slice(2); })[0]; return s ? secShort(s.title) : item; }
    var x = D.Q.scale.filter(function (y) { return y.q.id === item.slice(2); })[0]; return x ? x.q.id + ' ' + String(x.q.label).slice(0, 14) : item;
  }
  /* 대상 단위별 집계: 응답 수, 평균, 긍정률, 부정률, 표준편차 */
  function aggregate(D, dim, item) {
    var key = dimKey(dim), qs = itemQs(D, item), g = {};
    D.pairs.forEach(function (p) {
      var k = key(p), o = g[k] || (g[k] = { name: k, rs: {}, n: 0, sum: 0, sq: 0, pos: 0, neg: 0 }), a = (p.r.answers.course || {})[p.c.id] || {};
      o.rs[p.r.id] = 1;
      qs.forEach(function (x) { var v = a[x.q.id]; if (v == null) return; o.n++; o.sum += v; o.sq += v * v; if (v >= 4) o.pos++; if (v <= 2) o.neg++; });
    });
    return Object.keys(g).map(function (k) {
      var o = g[k]; o.resp = Object.keys(o.rs).length;
      o.mean = o.n ? o.sum / o.n : null; o.posr = o.n ? o.pos / o.n * 100 : null; o.negr = o.n ? o.neg / o.n * 100 : null;
      o.sd = o.n > 1 ? Math.sqrt(Math.max(0, o.sq / o.n - Math.pow(o.sum / o.n, 2))) : null;
      return o;
    });
  }
  function mv(o, m) { return m === 'mean' ? o.mean : m === 'pos' ? o.posr : m === 'neg' ? o.negr : o.sd; }
  function sel(id, opts) { return '<select class="fld" data-det="' + id + '">' + opts + '</select>'; }
  function opt(v, label, cur) { return '<option value="' + E(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + E(label) + '</option>'; }
  var NOTE = '<div class="muted" style="font-size:12.5px">5점 척도에서 <b>5점이 가장 좋은 평가</b>입니다. 긍정률은 4·5점, 부정률은 1·2점 응답의 비율이며 점검 문항은 제외합니다. 위쪽 응답 범위(전체/유효 응답만)와 필터를 그대로 따릅니다.</div>';

  /* ───────────── 조건 검출 ───────────── */
  V.det = function (D) {
    var c = DET;
    var items = opt('all', '종합(전체 문항)', c.item) + '<optgroup label="영역별">' + D.Q.sections.map(function (s) { return opt('s:' + s.id, s.title, c.item); }).join('') + '</optgroup><optgroup label="문항별">' + D.Q.scale.map(function (x) { return opt('q:' + x.q.id, x.q.id + ' ' + String(x.q.label).slice(0, 30), c.item); }).join('') + '</optgroup>';
    var conds = c.conds.map(function (k, i) {
      var m = MET[k.m];
      return '<div class="row" style="gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px" data-ci="' + i + '"><b style="min-width:22px">' + (i + 1) + '</b>' +
        '<select class="fld" style="width:190px" data-det="cm">' + Object.keys(MET).map(function (x) { return opt(x, MET[x].n, k.m); }).join('') + '</select>' +
        '<select class="fld" style="width:110px" data-det="cop">' + opt('le', '이하', k.op) + opt('ge', '이상', k.op) + '</select>' +
        '<input type="range" data-det="cr" min="' + m.lo + '" max="' + m.hi + '" step="' + m.st + '" value="' + k.v + '" style="flex:1;min-width:160px">' +
        '<input class="fld" type="number" data-det="cv" min="' + m.lo + '" max="' + m.hi + '" step="' + m.st + '" value="' + k.v + '" style="width:90px">' +
        (c.conds.length > 1 ? '<button class="btn btn-ghost btn-sm" data-det="cdel" style="color:var(--red)">' + I('trash', 14) + '</button>' : '') + '</div>';
    }).join('');
    return '<div class="panel"><h3>조건 검출 <span class="muted" style="font-weight:400">· 기준값을 움직이며 해당 대상을 찾습니다</span></h3>' + NOTE +
      '<div class="row" style="gap:12px;align-items:flex-end;flex-wrap:wrap;margin-top:10px"><div><label class="f">대상 단위</label>' + sel('dim', DIMS.map(function (d) { return opt(d[0], d[1], c.dim); }).join('')) + '</div>' +
      '<div style="min-width:240px;flex:1"><label class="f">조회 항목</label>' + sel('item', items) + '</div>' +
      '<div><label class="f">조건 결합</label>' + sel('join', opt('and', '모두 만족 (그리고)', c.join) + opt('or', '하나라도 만족 (또는)', c.join)) + '</div>' +
      '<div style="min-width:220px"><label class="f">최소 응답 수 <b id="det-minv">' + c.minN + '</b>건 이상만 검출</label><input type="range" data-det="min" min="0" max="40" step="1" value="' + c.minN + '" style="width:100%"></div></div>' +
      '<div style="margin-top:10px"><label class="f">검출 조건</label>' + conds +
      '<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">' + (c.conds.length < 3 ? '<button class="btn btn-secondary btn-sm" data-det="cadd">' + I('plus', 14) + ' 조건 추가</button>' : '') +
      '<span class="muted" style="font-size:12.5px;align-self:center">빠른 설정:</span><button class="btn btn-ghost btn-sm" data-det="pre" data-p="bad">개선 필요 (평균 3.5 이하)</button><button class="btn btn-ghost btn-sm" data-det="pre" data-p="neg">부정 많음 (부정률 20% 이상)</button><button class="btn btn-ghost btn-sm" data-det="pre" data-p="good">우수 (평균 4.5 이상)</button><button class="btn btn-ghost btn-sm" data-det="pre" data-p="split">의견 갈림 (분산 1.0 이상)</button></div></div></div>' +
      '<div id="detres">' + detResult(D) + '</div>';
  };
  function detResult(D) {
    var c = DET, rows = aggregate(D, c.dim, c.item), dimL = DIMS.filter(function (d) { return d[0] === c.dim; })[0][1];
    var elig = rows.filter(function (o) { return o.n > 0 && o.resp >= c.minN; }), skip = rows.length - elig.length;
    function hit(o) { var res = c.conds.map(function (k) { var v = mv(o, k.m); if (v == null) return false; return k.op === 'le' ? v <= k.v + 1e-9 : v >= k.v - 1e-9; }); return c.join === 'and' ? res.every(Boolean) : res.some(Boolean); }
    elig.forEach(function (o) { o.hit = hit(o); });
    var hits = elig.filter(function (o) { return o.hit; }), k0 = c.conds[0], m0 = MET[k0.m];
    // 분포(첫 조건 지표) 히스토그램
    var bins = 20, cnt = [], hitc = [], span = m0.hi - m0.lo, i;
    for (i = 0; i < bins; i++) { cnt.push(0); hitc.push(0); }
    elig.forEach(function (o) { var v = mv(o, k0.m); if (v == null) return; var b = Math.min(bins - 1, Math.max(0, Math.floor((v - m0.lo) / span * bins))); cnt[b]++; if (o.hit) hitc[b]++; });
    var mx = Math.max.apply(null, cnt.concat([1])), tl = Math.max(0, Math.min(100, (k0.v - m0.lo) / span * 100));
    var hist = '<div style="position:relative;height:92px;display:flex;align-items:flex-end;gap:2px;margin-top:6px;border-bottom:1px solid #d9d8d0">' + cnt.map(function (n, j) {
      var h = Math.round(n / mx * 84), hh = Math.round(hitc[j] / mx * 84);
      return '<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%" title="' + E(MET[k0.m].n + ' ' + (m0.lo + span * j / bins).toFixed(2) + '~ · ' + n + '개') + '"><div style="height:' + (h - hh) + 'px;background:#cfd8e3"></div><div style="height:' + hh + 'px;background:#d03b3b"></div></div>';
    }).join('') + '<div style="position:absolute;top:0;bottom:0;left:' + tl + '%;border-left:2px dashed #374151"></div></div>' +
      '<div class="row" style="justify-content:space-between;font-size:11.5px;color:#6b7280"><span>' + m0.f(m0.lo) + '</span><span>' + E(m0.n) + ' 분포 (세로선 = 조건 1의 기준값 ' + m0.f(k0.v) + ')</span><span>' + m0.f(m0.hi) + '</span></div>';
    var sk = c.sort, dir = c.dir, val = { name: function (o) { return o.name; }, resp: function (o) { return o.resp; }, mean: function (o) { return o.mean == null ? -1 : o.mean; }, pos: function (o) { return o.posr == null ? -1 : o.posr; }, neg: function (o) { return o.negr == null ? -1 : o.negr; }, sd: function (o) { return o.sd == null ? -1 : o.sd; } };
    var list = (c.showAll ? elig : hits).slice().sort(function (a, b) { var x = (val[sk] || val.mean)(a), y = (val[sk] || val.mean)(b), r = typeof x === 'string' ? x.localeCompare(y, 'ko') : x - y; return r * dir || a.name.localeCompare(b.name, 'ko'); });
    function th(k, l, num) { var on = sk === k; return '<th class="' + (num ? 'num' : '') + '" aria-sort="' + (on ? (dir > 0 ? 'ascending' : 'descending') : 'none') + '"><button class="thsort' + (on ? ' on' : '') + '" data-det="sort" data-k="' + k + '">' + l + (on ? (dir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>'; }
    var H = API().heatColor;
    var tbl = '<div class="tbl-wrap" style="max-height:520px;overflow:auto"><table class="t cmpt"><thead><tr><th>상태</th>' + th('name', E(dimL), false) + th('resp', '응답', true) + th('mean', '평균', true) + th('pos', '긍정률', true) + th('neg', '부정률', true) + th('sd', '분산', true) + '</tr></thead><tbody>' +
      (list.map(function (o) { var hc = H(o.mean); return '<tr><td>' + (o.hit ? '<span class="badge" style="background:#fee2e2;color:#b91c1c">해당</span>' : '<span class="badge badge-gray">해당 없음</span>') + '</td><td><b>' + E(o.name) + '</b>' + (o.resp < 5 ? ' <span class="badge badge-gray">참고용</span>' : '') + '</td><td class="num">' + o.resp + '</td><td class="hc num" style="background:' + hc.bg + ';color:' + hc.fg + '">' + (o.mean == null ? '-' : o.mean.toFixed(2)) + '</td><td class="num">' + (o.posr == null ? '-' : Math.round(o.posr) + '%') + '</td><td class="num">' + (o.negr == null ? '-' : Math.round(o.negr) + '%') + '</td><td class="num">' + (o.sd == null ? '-' : o.sd.toFixed(2)) + '</td></tr>'; }).join('') || '<tr><td colspan="7" class="t-empty">조건에 해당하는 ' + E(dimL) + '이(가) 없습니다. 기준값을 조절해 보십시오.</td></tr>') + '</tbody></table></div>';
    var desc = c.conds.map(function (k, j) { return MET[k.m].n + ' ' + MET[k.m].f(k.v) + (k.op === 'le' ? ' 이하' : ' 이상'); }).join(c.join === 'and' ? ' 그리고 ' : ' 또는 ');
    return '<div class="panel"><div class="row" style="align-items:center;gap:14px;flex-wrap:wrap"><div class="kpi" style="min-width:180px"><div class="l">조건 해당</div><div class="v">' + hits.length + '<span style="font-size:15px;font-weight:500"> / ' + elig.length + '개</span></div><div class="s">' + (elig.length ? Math.round(hits.length / elig.length * 100) : 0) + '% · ' + E(dimL) + ' 단위</div></div>' +
      '<div style="flex:1;min-width:240px"><div><b>' + E(itemName(D, c.item)) + '</b> 기준 · ' + E(desc) + '</div><div class="muted" style="font-size:12.5px">응답 ' + c.minN + '건 미만 ' + skip + '개는 검출에서 제외했습니다. 붉은 막대가 조건에 해당하는 대상입니다.</div></div>' +
      '<label class="chk"><input type="checkbox" data-det="all"' + (c.showAll ? ' checked' : '') + '> 해당 없는 대상도 표시</label></div>' + hist + '</div><div class="panel"><h3>검출 결과 목록</h3>' + tbl + '</div>';
  }

  /* ───────────── 같은 과목 비교 ───────────── */
  V.same = function (D) {
    var by = {};
    D.pairs.forEach(function (p) {
      var nm = String(p.c.name || '').trim(), g = by[nm] || (by[nm] = { name: nm, ins: {} }), ik = p.c.id, o = g.ins[ik] || (g.ins[ik] = { c: p.c, rs: {}, n: 0, sum: 0, sec: {} }), a = (p.r.answers.course || {})[p.c.id] || {};
      o.rs[p.r.id] = 1;
      D.Q.scale.forEach(function (x) { var v = a[x.q.id]; if (v == null) return; o.n++; o.sum += v; var s = o.sec[x.s.id] || (o.sec[x.s.id] = { sum: 0, n: 0 }); s.sum += v; s.n++; });
    });
    var rows = Object.keys(by).map(function (k) {
      var g = by[k], ins = Object.keys(g.ins).map(function (i) { var o = g.ins[i]; o.resp = Object.keys(o.rs).length; o.mean = o.n ? o.sum / o.n : null; return o; }).filter(function (o) { return o.mean != null && o.resp >= SAME.minN; });
      g.list = ins; g.profs = {}; ins.forEach(function (o) { var p = o.c.prof || '(교수 미입력)'; (g.profs[p] = g.profs[p] || []).push(o); });
      var ms = ins.map(function (o) { return o.mean; });
      g.min = ms.length ? Math.min.apply(null, ms) : null; g.max = ms.length ? Math.max.apply(null, ms) : null; g.gap = ms.length > 1 ? g.max - g.min : 0;
      g.lo = ins.filter(function (o) { return o.mean === g.min; })[0]; g.hi = ins.filter(function (o) { return o.mean === g.max; })[0];
      return g;
    }).filter(function (g) { return g.list.length >= (SAME.only2 ? 2 : 1); }).sort(function (a, b) { return b.gap - a.gap || a.name.localeCompare(b.name, 'ko'); });
    function lab(o) { return o ? o.c.track.replace(/계열$/, '') + ' ' + o.c.grade + ' ' + o.c.klass + (o.c.prof ? ' · ' + o.c.prof : '') : '-'; }
    var H = API().heatColor;
    var h = '<div class="panel"><h3>같은 과목 비교 <span class="muted" style="font-weight:400">· 분반·교수 간 평가 차이</span></h3>' + NOTE +
      '<div class="row" style="gap:14px;align-items:center;flex-wrap:wrap;margin-top:10px"><div style="min-width:220px"><label class="f">반(분반)별 최소 응답 수 <b id="same-minv">' + SAME.minN + '</b>건 이상</label><input type="range" data-same="min" min="0" max="30" value="' + SAME.minN + '" style="width:100%"></div>' +
      '<label class="chk"><input type="checkbox" data-same="only2"' + (SAME.only2 ? ' checked' : '') + '> 두 개 이상 분반이 있는 과목만</label></div>' +
      '<p class="panel-sub">편차 = 같은 과목의 분반 중 최고 평균 − 최저 평균입니다. 편차가 큰 과목부터 정렬되며, 행을 누르면 분반별 영역 점수를 비교합니다.</p>' +
      '<div class="tbl-wrap" style="max-height:420px;overflow:auto"><table class="t cmpt"><thead><tr><th>과목</th><th class="num">분반</th><th class="num">교수</th><th class="num">최저</th><th class="num">최고</th><th class="num">편차</th><th>최저 분반</th><th>최고 분반</th></tr></thead><tbody>' +
      (rows.map(function (g) { return '<tr style="cursor:pointer" data-same="pick" data-n="' + E(g.name) + '"' + (SAME.sel === g.name ? ' class="sel"' : '') + '><td><b>' + E(g.name) + '</b></td><td class="num">' + g.list.length + '</td><td class="num">' + Object.keys(g.profs).length + '</td><td class="num">' + (g.min == null ? '-' : g.min.toFixed(2)) + '</td><td class="num">' + (g.max == null ? '-' : g.max.toFixed(2)) + '</td><td class="num" style="font-weight:700;color:' + (g.gap >= 0.5 ? '#b91c1c' : 'inherit') + '">' + g.gap.toFixed(2) + '</td><td>' + E(lab(g.lo)) + '</td><td>' + E(lab(g.hi)) + '</td></tr>'; }).join('') || '<tr><td colspan="8" class="t-empty">비교할 같은 과목이 없습니다. (최소 응답 수를 낮춰 보십시오)</td></tr>') + '</tbody></table></div></div>';
    var g = rows.filter(function (x) { return x.name === SAME.sel; })[0] || rows[0];
    if (g) {
      var secs = D.Q.sections, ins = g.list.slice().sort(function (a, b) { return b.mean - a.mean; });
      var pm = Object.keys(g.profs).map(function (p) { var l = g.profs[p]; return { p: p, m: l.reduce(function (s, o) { return s + o.mean; }, 0) / l.length, within: l.length > 1 ? Math.max.apply(null, l.map(function (o) { return o.mean; })) - Math.min.apply(null, l.map(function (o) { return o.mean; })) : 0 }; });
      var between = pm.length > 1 ? Math.max.apply(null, pm.map(function (x) { return x.m; })) - Math.min.apply(null, pm.map(function (x) { return x.m; })) : 0, within = Math.max.apply(null, pm.map(function (x) { return x.within; }).concat([0]));
      var hint = pm.length > 1 && within > 0 ? (between > within ? '교수 간 차이(' + between.toFixed(2) + ')가 같은 교수의 분반 간 차이(' + within.toFixed(2) + ')보다 큽니다. 교수 요인의 영향이 있을 가능성이 있습니다.' : '같은 교수의 분반 간 차이(' + within.toFixed(2) + ')가 교수 간 차이(' + between.toFixed(2) + ')와 비슷하거나 더 큽니다. 반 특성(학생 구성·시간대)의 영향 가능성이 있습니다.') : pm.length === 1 ? '이 과목은 한 명의 교수가 여러 분반을 맡았습니다. 분반 간 차이는 반 특성의 영향으로 볼 수 있습니다.' : '교수와 분반이 일대일로 대응되어 교수 요인과 반 요인을 분리하기 어렵습니다. 참고용으로만 보십시오.';
      h += '<div class="panel"><h3>' + E(g.name) + ' — 분반별 비교</h3><div class="muted" style="font-size:12.5px;margin-bottom:8px">' + E(hint) + ' (표본이 작으면 우연의 영향이 큽니다)</div>' +
        '<div class="cmpchart">' + ins.map(function (o) { return '<div class="cmprow"><span class="cn">' + E(lab(o)) + '</span><span class="cb"><i style="width:' + (o.mean / 5 * 100) + '%"></i></span><span class="cv">' + o.mean.toFixed(2) + '</span></div>'; }).join('') + '</div>' +
        '<div class="tbl-wrap" style="margin-top:10px"><table class="t"><thead><tr><th>분반</th><th class="num">응답</th><th class="num">평균</th>' + secs.map(function (s) { return '<th class="num" title="' + E(s.title) + '">' + E(secShort(s.title)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        ins.map(function (o) { return '<tr><td>' + E(lab(o)) + '</td><td class="num">' + o.resp + '</td><td class="num"><b>' + o.mean.toFixed(2) + '</b></td>' + secs.map(function (s) { var x = o.sec[s.id], m = x && x.n ? x.sum / x.n : null, hc = H(m); return '<td class="hc num" style="background:' + hc.bg + ';color:' + hc.fg + '">' + (m == null ? '-' : m.toFixed(2)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></div>';
    }
    return h;
  };

  /* ───────────── 기간 중 참여 현황 ───────────── */
  V.live = function (D) {
    var Ap = API(), H = Ap.honorClasses(), list = H.list.filter(function (o) { return o.head; }), F = Ap.F, tg = LIVE.target;
    var sv = A.cur.survey, now = Date.now(), oa = sv.open_at ? new Date(sv.open_at).getTime() : null, ca = sv.close_at ? new Date(sv.close_at).getTime() : null;
    var left = ca ? Math.ceil((ca - now) / 86400000) : null, period = (oa ? A.fmt(sv.open_at) : '미정') + ' ~ ' + (ca ? A.fmt(sv.close_at) : '미정');
    var th = list.reduce(function (n, o) { return n + o.head; }, 0), tv = list.reduce(function (n, o) { return n + o.valid; }, 0), below = list.filter(function (o) { return o.rate < tg; });
    var need = below.reduce(function (n, o) { return n + Math.max(0, Math.ceil(o.head * tg / 100) - o.valid); }, 0);
    var days = {}; Ap.rows().forEach(function (r) { if (F.data === 'real' && r.is_test) return; if (F.data === 'test' && !r.is_test) return; var d = new Date(new Date(r.created_at).getTime() + 9 * 3600e3).toISOString().slice(5, 10); days[d] = (days[d] || 0) + 1; });
    var dk = Object.keys(days).sort(), dmx = Math.max.apply(null, dk.map(function (k) { return days[k]; }).concat([1]));
    var asc = list.slice().sort(function (a, b) { return a.rate - b.rate || a.key.localeCompare(b.key, 'ko'); });
    var byT = {}; list.forEach(function (o) { var t = byT[o.track] || (byT[o.track] = { h: 0, v: 0 }); t.h += o.head; t.v += o.valid; });
    return '<div class="panel"><h3>기간 중 참여 현황 <span class="muted" style="font-weight:400">· 응답을 받는 동안 미달 반을 찾습니다</span></h3>' +
      '<div class="kpis"><div class="kpi"><div class="l">응답 기간</div><div class="v" style="font-size:15px">' + E(period) + '</div><div class="s">' + (left == null ? '' : left >= 0 ? 'D-' + left : '마감') + '</div></div>' +
      '<div class="kpi"><div class="l">전체 유효 응답률</div><div class="v">' + (th ? (tv / th * 100).toFixed(1) + '%' : '-') + '</div><div class="s">유효 ' + tv + ' / 재적 ' + th + '명</div></div>' +
      '<div class="kpi"><div class="l">목표 미달 반</div><div class="v">' + below.length + '<span style="font-size:15px;font-weight:500"> / ' + list.length + '개</span></div><div class="s">목표 ' + tg + '% 기준</div></div>' +
      '<div class="kpi"><div class="l">목표까지 필요한 응답</div><div class="v">' + need + '건</div><div class="s">미달 반의 합계</div></div></div>' +
      '<div style="margin-top:10px;max-width:520px"><label class="f">목표 응답률 <b id="live-tv">' + tg + '</b>%</label><input type="range" data-live="t" min="10" max="100" step="5" value="' + tg + '" style="width:100%"></div>' +
      (H.hasHead ? '' : '<div class="msg warn" style="margin-top:10px">' + I('alert', 18) + '<div>반별 재적 인원이 없어 응답률을 계산할 수 없습니다. 「과목·교수」 목록에서 입력하십시오.</div></div>') + '</div>' +
      '<div class="panel"><h3>반별 응답률 <span class="muted" style="font-weight:400">· 낮은 순 (유효 응답 기준)</span></h3><div class="cmpchart">' + asc.map(function (o) {
        var ok = o.rate >= tg, w = Math.min(100, o.rate);
        return '<div class="cmprow" style="grid-template-columns:minmax(150px,34%) 1fr 150px" data-tip="' + E(o.key.replace(/\|/g, ' ') + ' · 유효 ' + o.valid + ' / 재적 ' + o.head) + '"><span class="cn">' + E(o.track.replace(/계열$/, '') + ' ' + o.grade + ' ' + o.klass) + '</span><span class="cb"><i style="width:' + w + '%;background:' + (ok ? '#16a34a' : '#ea580c') + '"></i><u style="left:' + tg + '%"></u></span><span class="cv" style="width:auto">' + o.rate.toFixed(1) + '% · ' + o.valid + '/' + o.head + (ok ? '' : ' · +' + Math.max(0, Math.ceil(o.head * tg / 100) - o.valid)) + '</span></div>';
      }).join('') + '</div><div class="muted" style="margin-top:6px;font-size:12.5px">초록 = 목표 달성, 주황 = 미달(오른쪽 + 숫자는 목표까지 필요한 응답 수), 점선 = 목표선</div></div>' +
      '<div class="row" style="gap:12px;align-items:stretch;flex-wrap:wrap"><div class="panel" style="flex:1;min-width:280px"><h3>계열별 응답률</h3>' + (Object.keys(byT).map(function (t) { var o = byT[t]; return '<div class="cmprow" style="grid-template-columns:110px 1fr 120px"><span class="cn">' + E(t) + '</span><span class="cb"><i style="width:' + Math.min(100, o.v / o.h * 100) + '%"></i></span><span class="cv" style="width:auto">' + (o.v / o.h * 100).toFixed(1) + '% (' + o.v + '/' + o.h + ')</span></div>'; }).join('') || '<div class="muted">데이터 없음</div>') + '</div>' +
      '<div class="panel" style="flex:1;min-width:280px"><h3>일자별 응답 수 <span class="muted" style="font-weight:400">· 한국 시간</span></h3>' + (dk.length ? '<div style="display:flex;align-items:flex-end;gap:6px;height:110px">' + dk.map(function (k) { return '<div style="flex:1;text-align:center;font-size:11px"><div style="height:' + Math.round(days[k] / dmx * 80) + 'px;background:#3987e5;border-radius:3px 3px 0 0" title="' + E(k + ' · ' + days[k] + '건') + '"></div>' + days[k] + '<br>' + E(k) + '</div>'; }).join('') + '</div>' : '<div class="muted">아직 응답이 없습니다.</div>') + '</div></div>';
  };

  /* ───────────── 입력 처리 ───────────── */
  A.ext.rhook = function (e, type) {
    var t = e.target, d = t.getAttribute && t.getAttribute('data-det'), s = t.getAttribute && t.getAttribute('data-same'), l = t.getAttribute && t.getAttribute('data-live');
    if (!d && !s && !l) {
      var b = t.closest && t.closest('[data-det],[data-same],[data-live]'); if (!b || type !== 'click') return false; t = b; d = t.getAttribute('data-det'); s = t.getAttribute('data-same'); l = t.getAttribute('data-live');
    }
    var Ap = API(), redraw = function () { Ap.render(); };
    if (d) {
      var ci = t.closest('[data-ci]'), i = ci ? Number(ci.getAttribute('data-ci')) : -1, c = DET;
      if (type === 'input') {
        if (d === 'cr' || d === 'cv') { var v = Number(t.value); if (!isFinite(v)) return true; c.conds[i].v = v; var o = ci.querySelector(d === 'cr' ? '[data-det=cv]' : '[data-det=cr]'); if (o) o.value = v; document.getElementById('detres').innerHTML = detResult(Ap.compute()); return true; }
        if (d === 'min') { c.minN = Number(t.value); var mv0 = document.getElementById('det-minv'); if (mv0) mv0.textContent = c.minN; document.getElementById('detres').innerHTML = detResult(Ap.compute()); return true; }
        return true;
      }
      if (type === 'change') {
        if (d === 'dim' || d === 'item' || d === 'join') { c[d] = t.value; redraw(); return true; }
        if (d === 'cm') { c.conds[i].m = t.value; var m = MET[t.value]; c.conds[i].v = t.value === 'mean' ? 3.5 : t.value === 'sd' ? 1 : t.value === 'neg' ? 20 : 60; c.conds[i].op = t.value === 'pos' ? 'le' : t.value === 'neg' || t.value === 'sd' ? 'ge' : c.conds[i].op; redraw(); return true; }
        if (d === 'cop') { c.conds[i].op = t.value; redraw(); return true; }
        if (d === 'all') { c.showAll = t.checked; document.getElementById('detres').innerHTML = detResult(Ap.compute()); return true; }
        return true;
      }
      if (type === 'click') {
        if (d === 'cadd') { c.conds.push({ m: 'pos', op: 'le', v: 60 }); redraw(); return true; }
        if (d === 'cdel') { c.conds.splice(i, 1); redraw(); return true; }
        if (d === 'pre') { var p = t.getAttribute('data-p'); c.conds = p === 'bad' ? [{ m: 'mean', op: 'le', v: 3.5 }] : p === 'neg' ? [{ m: 'neg', op: 'ge', v: 20 }] : p === 'good' ? [{ m: 'mean', op: 'ge', v: 4.5 }] : [{ m: 'sd', op: 'ge', v: 1 }]; c.join = 'and'; c.sort = p === 'good' ? 'mean' : p === 'bad' ? 'mean' : p === 'neg' ? 'neg' : 'sd'; c.dir = p === 'bad' ? 1 : -1; redraw(); return true; }
        if (d === 'sort') { var k = t.getAttribute('data-k'); if (c.sort === k) c.dir = -c.dir; else { c.sort = k; c.dir = k === 'name' ? 1 : -1; } document.getElementById('detres').innerHTML = detResult(Ap.compute()); return true; }
        return d === 'dim' || d === 'item' || d === 'join' || d === 'cm' || d === 'cop' || d === 'cr' || d === 'cv' || d === 'min' || d === 'all';
      }
      return true;
    }
    if (s) {
      if (type === 'input' && s === 'min') { SAME.minN = Number(t.value); var sv0 = document.getElementById('same-minv'); if (sv0) sv0.textContent = SAME.minN; return true; }
      if (type === 'change' && s === 'min') { redraw(); return true; }
      if (type === 'change' && s === 'only2') { SAME.only2 = t.checked; redraw(); return true; }
      if (type === 'click' && s === 'pick') { SAME.sel = t.getAttribute('data-n'); redraw(); return true; }
      return true;
    }
    if (l) {
      if (type === 'input' && l === 't') { LIVE.target = Number(t.value); var lv = document.getElementById('live-tv'); if (lv) lv.textContent = LIVE.target; return true; }
      if (type === 'change' && l === 't') { redraw(); return true; }
      return true;
    }
    return false;
  };
})();
