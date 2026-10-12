'use strict';
/**
 * aseasurvey-admin-gresults.js — 일반 설문(행사·교직원 등) 결과 대시보드
 *  요약(KPI·일별 추이·정원·퀴즈) / 문항별(형식마다 알맞은 집계) / 개별 응답(첨부·서명 열람, 제외) + 엑셀 출력
 *  과목별 평가 설문은 aseasurvey-admin-results.js 가 그대로 담당합니다.
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico, N = SVY.num;
  var orig = A.tabs.results;
  var G = { sid: '', rows: [], maxSeq: 0, timer: 0, live: true, last: 0, polls: 0, err: '', data: 'real', sub: 'rep', page: 1, kw: '', x: {} };
  var BLUE = '#3987e5', GRAY = '#d9d8d0', GREEN = '#1E8E3E', RED = '#D93025';

  /* ───────────── 적재 · 실시간 ───────────── */
  async function fullLoad() {
    G.rows = []; G.maxSeq = 0; var after = 0, guard = 0;
    for (;;) {
      var r = await A.rpc('svy_a_results', { p_id: G.sid, p_after: after });
      G.rows = G.rows.concat(r.rows); if (r.rows.length) after = r.rows[r.rows.length - 1].seq; G.maxSeq = after; G.total = r.total;
      if (r.rows.length < 2000 || ++guard > 20) break;
    }
    G.last = Date.now();
  }
  async function poll() {
    clearTimeout(G.timer);
    if (A.view !== 'survey' || A.tab !== 'results' || !A.cur || A.cur.survey.id !== G.sid) return;
    if (G.live && !document.hidden) {
      try {
        G.polls++;
        if (G.polls % 12 === 0) { await fullLoad(); render(); }
        else {
          var r = await A.rpc('svy_a_results', { p_id: G.sid, p_after: G.maxSeq });
          if (r.rows.length) { G.rows = G.rows.concat(r.rows); G.maxSeq = r.rows[r.rows.length - 1].seq; }
          G.total = r.total; G.last = Date.now();
          if (G.total !== G.rows.length) { await fullLoad(); render(); } else if (r.rows.length) render(); else live();
        }
        G.err = '';
      } catch (e) { G.err = e.message; live(); }
    }
    G.timer = setTimeout(poll, 5000);
  }
  function live() {
    var el = document.getElementById('glive'); if (!el) return;
    el.className = 'live' + (G.live ? '' : ' off');
    el.innerHTML = '<i></i>' + (G.err ? '연결 오류: ' + E(G.err) : (G.live ? '실시간 (5초) · ' : '일시 정지 · ') + '최종 갱신 ' + new Date(G.last).toLocaleTimeString('ko-KR'));
  }

  /* ───────────── 집계 도우미 ───────────── */
  function def() { return A.cur.survey.def; }
  function qlist() { return SVY.allQuestions(def()).filter(function (x) { return x.q.type !== 'block'; }); }
  function pick() { return G.rows.filter(function (r) { return (G.data === 'all' || (G.data === 'test') === !!r.is_test) && !r.excluded; }); }
  function val(r, q) { return ((r.answers || {}).common || {})[q.id]; }
  function pct(n, d) { return d ? Math.round(n / d * 1000) / 10 : 0; }
  function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : null; }
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function r2(x) { return x == null ? '-' : Math.round(x * 100) / 100; }
  function optLabel(q, id, a) { return SVY.fmtAnswer({ type: 'single', options: q.options, id: q.id }, id, def(), a); }
  function isCorrect(q, v) {
    if (q.answer == null || SVY.isEmpty(q, v)) return null;
    if (q.type === 'single') return v === q.answer;
    if (q.type === 'multi') return Array.isArray(v) && Array.isArray(q.answer) && v.length === q.answer.length && q.answer.every(function (a) { return v.indexOf(a) >= 0; });
    if (typeof q.answer === 'number' || q.type === 'scale' || ['linear', 'rating', 'nps', 'slider'].indexOf(q.type) >= 0) return N(v) != null && N(v) === N(q.answer);
    var al = [].concat(q.answer).map(function (x) { return String(x).trim().toLowerCase(); }), s = String(v).trim().toLowerCase();
    return al.indexOf(s) >= 0 || (N(s) != null && al.some(function (x) { return N(x) === N(s); }));
  }
  function bar(label, n, tot, color, extra) { var p = pct(n, tot); return '<div class="drow"><div class="dl" title="' + E(label) + '">' + E(label) + '</div><div class="dbar"><i style="width:' + Math.min(p, 100) + '%;background:' + (color || BLUE) + '"></i></div><div class="dv">' + n + '명 · ' + p + '%' + (extra || '') + '</div></div>'; }

  /* ───────────── 문항별 집계 카드 ───────────── */
  function summarize(q, rows) {
    var vals = rows.map(function (r) { return { r: r, v: val(r, q) }; }).filter(function (x) { return !SVY.isEmpty(q, x.v); }), n = vals.length, t = q.type, h = '';
    if (!n) return '<p class="muted" style="margin:6px 0 0">아직 응답이 없습니다.</p>';
    if (t === 'single' || t === 'multi' || t === 'scale') {
      var list = t === 'scale' ? SVY.scaleOf(def(), q).map(function (o) { return { id: o.v, label: o.label }; }) : (q.options || []).slice().concat(q.other ? [{ id: '__other', label: '기타' }] : []);
      var cnt = {}; vals.forEach(function (x) { [].concat(x.v).forEach(function (id) { cnt[id] = (cnt[id] || 0) + 1; }); });
      list.forEach(function (o) { h += bar(o.label, cnt[o.id] || 0, n, (q.answer != null && ((t === 'single' && o.id === q.answer) || (t === 'multi' && (q.answer || []).indexOf(o.id) >= 0))) ? GREEN : BLUE, o.max ? ' / 정원 ' + o.max : ''); });
      if (t === 'scale') { var nums = vals.map(function (x) { return x.v; }); h += '<div class="muted" style="margin-top:6px">평균 <b>' + r2(mean(nums)) + '</b></div>'; }
      if (q.other) { var ot = rows.map(function (r) { return ((r.answers || {}).common || {})[q.id + '_other']; }).filter(Boolean); if (ot.length) h += '<div class="muted" style="margin-top:6px">기타 의견: ' + ot.slice(0, 20).map(E).join(' · ') + '</div>'; }
    } else if (t === 'nps') {
      var nv = vals.map(function (x) { return x.v; }), pro = nv.filter(function (v) { return v >= 9; }).length, pas = nv.filter(function (v) { return v >= 7 && v <= 8; }).length, det = n - pro - pas;
      h += '<div class="npsbar"><i style="width:' + pct(det, n) + '%;background:' + RED + '"></i><i style="width:' + pct(pas, n) + '%;background:' + GRAY + '"></i><i style="width:' + pct(pro, n) + '%;background:' + BLUE + '"></i></div><div class="row" style="font-size:13px;margin:4px 0"><span>비추천(0~6) ' + det + '명 ' + pct(det, n) + '%</span><span>중립(7~8) ' + pas + '명</span><span>추천(9~10) ' + pro + '명 ' + pct(pro, n) + '%</span><span class="sp"></span><b>NPS ' + Math.round(pct(pro, n) - pct(det, n)) + '</b></div>';
      for (var k = 0; k <= 10; k++) h += bar(String(k), nv.filter(function (v) { return v === k; }).length, n);
    } else if (['linear', 'rating', 'slider'].indexOf(t) >= 0 || (t === 'text' && q.format === 'number')) {
      var nums2 = vals.map(function (x) { return Number(x.v); }).filter(function (v) { return isFinite(v); }), d = {}; nums2.forEach(function (v) { d[v] = (d[v] || 0) + 1; });
      h += '<div class="row kv"><span>평균 <b>' + r2(mean(nums2)) + '</b></span><span>중앙값 <b>' + r2(median(nums2)) + '</b></span><span>최소 <b>' + Math.min.apply(null, nums2) + '</b></span><span>최대 <b>' + Math.max.apply(null, nums2) + '</b></span></div>';
      var keys = Object.keys(d).map(Number).sort(function (a, b) { return a - b; }); if (keys.length <= 21) keys.forEach(function (k2) { h += bar(String(k2) + (q.unit || ''), d[k2], nums2.length); });
    } else if (t === 'grid') {
      h += '<div class="tbl-wrap"><table class="t"><thead><tr><th></th>' + (q.cols || []).map(function (c) { return '<th class="num">' + E(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' + (q.rows || []).map(function (rw) {
        var rv = vals.map(function (x) { return (x.v || {})[rw.id]; }).filter(function (z) { return z != null; });
        return '<tr><td>' + E(rw.label) + '</td>' + (q.cols || []).map(function (c) { var m = rv.filter(function (z) { return [].concat(z).indexOf(c.id) >= 0; }).length; return '<td class="num">' + m + ' <span class="muted">(' + pct(m, rv.length) + '%)</span></td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
    } else if (t === 'ranking') {
      var st = {}; (q.options || []).forEach(function (o) { st[o.id] = { sum: 0, n: 0, first: 0 }; }); vals.forEach(function (x) { (x.v || []).forEach(function (id, i) { if (st[id]) { st[id].sum += i + 1; st[id].n++; if (i === 0) st[id].first++; } }); });
      var arr = (q.options || []).filter(function (o) { return st[o.id].n; }).sort(function (a, b) { return st[a.id].sum / st[a.id].n - st[b.id].sum / st[b.id].n; });
      h += '<p class="hint" style="margin:0 0 4px">평균 순위가 낮을수록(1에 가까울수록) 선호도가 높습니다.</p>' + arr.map(function (o) { var s = st[o.id]; return '<div class="drow"><div class="dl">' + E(o.label) + '</div><div class="dbar"><i style="width:' + Math.max(4, 100 - (s.sum / s.n - 1) * 100 / Math.max((q.options || []).length - 1, 1)) + '%;background:' + BLUE + '"></i></div><div class="dv">평균 ' + r2(s.sum / s.n) + '위 · 1위 ' + s.first + '명</div></div>'; }).join('');
    } else if (t === 'constsum') {
      var tot = N(q.total) != null ? N(q.total) : 100;
      h += (q.options || []).map(function (o) { var m = mean(vals.map(function (x) { return Number((x.v || {})[o.id]) || 0; })); return '<div class="drow"><div class="dl">' + E(o.label) + '</div><div class="dbar"><i style="width:' + Math.min(100, (m || 0) / tot * 100) + '%;background:' + BLUE + '"></i></div><div class="dv">평균 ' + r2(m) + (q.unit || '') + '</div></div>'; }).join('');
    } else if (t === 'file' || t === 'signature') {
      h += '<div class="muted">제출 ' + n + '건 · 첨부 ' + vals.reduce(function (s, x) { return s + (x.v || []).length; }, 0) + '개 — 「개별 응답」 탭에서 열람합니다.</div>';
    } else if (t === 'consent') {
      h += bar('동의', n, rows.length);
    } else if (t === 'location') {
      h += '<div class="muted">위치 수집 ' + n + '건 (좌표는 「개별 응답」·엑셀에서 확인)</div>';
    } else {
      var shown = vals.slice().sort(function (a, b) { return b.r.seq - a.r.seq; }).slice(0, 30);
      if (t === 'qr') { var qc = {}; vals.forEach(function (x) { qc[x.v] = (qc[x.v] || 0) + 1; }); h += Object.keys(qc).sort(function (a, b) { return qc[b] - qc[a]; }).slice(0, 15).map(function (k3) { return bar(k3, qc[k3], n); }).join(''); }
      else h += '<div class="textlist">' + shown.map(function (x) { return '<div class="tl"><span class="muted">' + A.fmt(x.r.created_at) + '</span> ' + E(SVY.fmtAnswer(q, x.v, def(), (x.r.answers || {}).common)) + '</div>'; }).join('') + (n > 30 ? '<div class="muted">최근 30건만 표시 · 전체는 엑셀로 내려받으십시오 (총 ' + n + '건)</div>' : '') + '</div>';
    }
    return h;
  }
  function quizTag(q, rows) {
    if (q.answer == null) return '';
    var c = rows.map(function (r) { return isCorrect(q, val(r, q)); }).filter(function (x) { return x !== null; });
    return '<span class="tag blue">정답률 ' + pct(c.filter(Boolean).length, c.length) + '% (' + c.filter(Boolean).length + '/' + c.length + ')</span>';
  }

  /* ───────────── 리포트(교차 필터 · 눌러서 바로 보는 보고서) ───────────── */
  var CAT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6'], SOFT = '#cfe0f7', INK = '#52514e';
  var CLICKABLE = ['single', 'multi', 'scale', 'linear', 'rating', 'slider', 'nps'];
  function keyOf(q, v) { if (q.type === 'nps') return v >= 9 ? 'pro' : v >= 7 ? 'pas' : 'det'; return String(v); }
  function rowMatch(r, q, keys) {
    var v = val(r, q); if (SVY.isEmpty(q, v)) return false;
    if (q.type === 'multi') return [].concat(v).some(function (x) { return keys.indexOf(String(x)) >= 0; });
    if (q.type === 'text' && q.format === 'number') return keys.indexOf(String(Number(v))) >= 0;
    return keys.indexOf(keyOf(q, v)) >= 0;
  }
  function rowsFor(skipId) {
    var qm = {}; qlist().forEach(function (x) { qm[x.q.id] = x.q; });
    return pick().filter(function (r) { return Object.keys(G.x).every(function (id) { return id === skipId || !G.x[id].length || !qm[id] || rowMatch(r, qm[id], G.x[id]); }); });
  }
  function isOn(q, k) { return (G.x[q.id] || []).indexOf(String(k)) >= 0; }
  function dim(q, k) { return (G.x[q.id] || []).length && !isOn(q, k) ? ' dim' : ''; }
  function btn(q, k, inner, cls, tip) { return '<button type="button" class="gx ' + (cls || '') + (isOn(q, k) ? ' on' : '') + dim(q, k) + '" data-act="gx" data-q="' + E(q.id) + '" data-k="' + E(k) + '" title="' + E(tip || '눌러서 이 응답만 모아 보기') + '" aria-pressed="' + isOn(q, k) + '">' + inner + '</button>'; }
  function donut(q, items, n) {
    var R = 46, C = 2 * Math.PI * R, off = 0, svg = '<svg viewBox="0 0 120 120" class="donut" role="img" aria-label="' + E(q.label) + ' 비율"><circle cx="60" cy="60" r="' + R + '" fill="none" stroke="#eee" stroke-width="16"/>';
    items.forEach(function (it, i) { var len = n ? it.n / n * C : 0; svg += '<circle class="seg gx' + (isOn(q, it.k) ? ' on' : '') + dim(q, it.k) + '" data-act="gx" data-q="' + E(q.id) + '" data-k="' + E(it.k) + '" cx="60" cy="60" r="' + R + '" fill="none" stroke="' + CAT[i % CAT.length] + '" stroke-width="16" stroke-dasharray="' + Math.max(len - 2, 0) + ' ' + (C - Math.max(len - 2, 0)) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 60 60)"><title>' + E(it.label) + ' ' + it.n + '명 (' + pct(it.n, n) + '%)</title></circle>'; off += len; });
    return svg + '<text x="60" y="58" text-anchor="middle" class="dn">' + n + '</text><text x="60" y="74" text-anchor="middle" class="dl2">명 응답</text></svg>';
  }
  function legend(q, items, n) { return '<div class="lg">' + items.map(function (it, i) { return btn(q, it.k, '<i style="background:' + CAT[i % CAT.length] + '"></i><span class="t">' + E(it.label) + '</span><b>' + it.n + '</b><span class="m">' + pct(it.n, n) + '%</span>', 'lgrow'); }).join('') + '</div>'; }
  function hbars(q, items, n) { var mx = Math.max.apply(null, items.map(function (i) { return i.n; }).concat([1])); return '<div class="hb">' + items.map(function (it) { return btn(q, it.k, '<span class="t">' + E(it.label) + '</span><span class="bt"><i style="width:' + (it.n / mx * 100) + '%"></i></span><b>' + it.n + '</b><span class="m">' + pct(it.n, n) + '%</span>', 'hbrow'); }).join('') + '</div>'; }
  function histo(q, items, n, mean) {
    var mx = Math.max.apply(null, items.map(function (i) { return i.n; }).concat([1]));
    return (mean != null ? '<div class="big">' + r2(mean) + '<small> 평균</small></div>' : '') + '<div class="hist">' + items.map(function (it) { return btn(q, it.k, '<b>' + it.n + '</b><i style="height:' + Math.max(it.n / mx * 100, it.n ? 4 : 0) + '%"></i><span>' + E(it.label) + '</span>', 'hcol'); }).join('') + '</div>';
  }
  function words(texts) {
    var stop = { '그리고': 1, '하지만': 1, '있습니다': 1, '합니다': 1, '입니다': 1, '있는': 1, '있어서': 1, '같습니다': 1, '좋았습니다': 0, '너무': 1, '정말': 1, '조금': 1, '더': 1 }, c = {};
    texts.forEach(function (t) { (String(t).match(/[가-힣A-Za-z0-9]{2,}/g) || []).forEach(function (w) { w = w.replace(/(은|는|이|가|을|를|에|의|도|로|과|와)$/, function (m, a, off, str) { return str.length - 1 > 2 ? '' : m; }); if (w.length >= 2 && !stop[w]) c[w] = (c[w] || 0) + 1; }); });
    return Object.keys(c).filter(function (w) { return c[w] >= 2; }).sort(function (a, b) { return c[b] - c[a]; }).slice(0, 10).map(function (w) { return { w: w, n: c[w] }; });
  }
  function reportCard(x) {
    var q = x.q, rows = rowsFor(q.id), t = q.type, vals = rows.map(function (r) { return val(r, q); }).filter(function (v) { return !SVY.isEmpty(q, v); }), n = vals.length, body = '', wide = false;
    if (!n) body = '<p class="muted">해당하는 응답이 없습니다.</p>';
    else if (t === 'single' || t === 'multi' || t === 'scale') {
      var lst = t === 'scale' ? SVY.scaleOf(def(), q).slice().sort(function (a, b) { return a.v - b.v; }).map(function (o) { return { k: String(o.v), label: o.label }; }) : (q.options || []).map(function (o) { return { k: o.id, label: o.label }; }).concat(q.other ? [{ k: '__other', label: '기타' }] : []), c = {};
      vals.forEach(function (v) { [].concat(v).forEach(function (id) { c[id] = (c[id] || 0) + 1; }); }); var items = lst.map(function (o) { return { k: o.k, label: o.label, n: c[o.k] || 0 }; });
      if (t === 'single' && items.length <= 6) body = '<div class="dwrap">' + donut(q, items, n) + legend(q, items, n) + '</div>';
      else if (t === 'scale') body = histo(q, items, n, mean(vals.map(Number)));
      else body = hbars(q, items.sort(function (a, b) { return b.n - a.n; }), n);
    } else if (t === 'rating' || t === 'linear' || t === 'slider' || (t === 'text' && q.format === 'number')) {
      var nums = vals.map(Number).filter(isFinite), d = {}; nums.forEach(function (v) { d[v] = (d[v] || 0) + 1; }); var ks = Object.keys(d).map(Number).sort(function (a, b) { return a - b; });
      if (t === 'rating') { var mxr = N(q.max) || 5; ks = []; for (var i = 1; i <= mxr; i++) ks.push(i); } else if (t === 'linear') { var lo = N(q.min) != null ? N(q.min) : 1, hi = N(q.max) != null ? N(q.max) : 5; ks = []; for (var j = lo; j <= hi; j++) ks.push(j); }
      body = ks.length <= 12 ? histo(q, ks.map(function (k) { return { k: String(k), label: String(k), n: d[k] || 0 }; }), nums.length, mean(nums)) : '<div class="big">' + r2(mean(nums)) + '<small> 평균 · 중앙 ' + r2(median(nums)) + ' · ' + Math.min.apply(null, nums) + '~' + Math.max.apply(null, nums) + '</small></div>';
    } else if (t === 'nps') {
      var pro = vals.filter(function (v) { return v >= 9; }).length, pas = vals.filter(function (v) { return v >= 7 && v <= 8; }).length, det = n - pro - pas, sc = Math.round(pct(pro, n) - pct(det, n));
      body = '<div class="big ' + (sc >= 0 ? 'pos' : 'neg') + '">' + (sc > 0 ? '+' : '') + sc + '<small> NPS</small></div><div class="npsr">' + [['det', det, RED, '비추천 0~6'], ['pas', pas, '#c9c8c0', '중립 7~8'], ['pro', pro, CAT[0], '추천 9~10']].map(function (z) { return btn(q, z[0], '<i style="background:' + z[2] + '"></i><span class="t">' + z[3] + '</span><b>' + z[1] + '</b><span class="m">' + pct(z[1], n) + '%</span>', 'lgrow'); }).join('') + '</div><div class="stack">' + [['det', det, RED], ['pas', pas, '#c9c8c0'], ['pro', pro, CAT[0]]].map(function (z) { return '<i style="width:' + pct(z[1], n) + '%;background:' + z[2] + '"></i>'; }).join('') + '</div>';
    } else if (t === 'grid') {
      wide = true; var mxg = 1, cells = {}; (q.rows || []).forEach(function (rw) { cells[rw.id] = {}; vals.forEach(function (v) { var z = (v || {})[rw.id]; [].concat(z == null ? [] : z).forEach(function (cid) { cells[rw.id][cid] = (cells[rw.id][cid] || 0) + 1; mxg = Math.max(mxg, cells[rw.id][cid]); }); }); });
      body = '<div class="tbl-wrap"><table class="t heat"><thead><tr><th></th>' + (q.cols || []).map(function (c2) { return '<th class="num">' + E(c2.label) + '</th>'; }).join('') + '</tr></thead><tbody>' + (q.rows || []).map(function (rw) { return '<tr><td>' + E(rw.label) + '</td>' + (q.cols || []).map(function (c2) { var m = cells[rw.id][c2.id] || 0; return '<td class="num" style="background:rgba(42,120,214,' + (m / mxg * 0.75).toFixed(2) + ');color:' + (m / mxg > 0.55 ? '#fff' : 'inherit') + '" title="' + m + '명">' + m + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
    } else if (t === 'ranking') {
      var st = {}; (q.options || []).forEach(function (o) { st[o.id] = 0; }); var L = (q.options || []).length; vals.forEach(function (v) { v.forEach(function (id, i) { if (st[id] != null) st[id] += L - i; }); });
      body = hbars(q, (q.options || []).map(function (o) { return { k: o.id, label: o.label, n: st[o.id] }; }).sort(function (a, b) { return b.n - a.n; }), n).replace(/<b>(\d+)<\/b><span class="m">[^<]*<\/span>/g, '<b>$1점</b>');
    } else if (t === 'constsum') {
      body = hbars(q, (q.options || []).map(function (o) { return { k: o.id, label: o.label, n: Math.round(mean(vals.map(function (v) { return Number((v || {})[o.id]) || 0; }))) }; }), 1).replace(/<span class="m">[^<]*<\/span>/g, '<span class="m">' + E(q.unit || '') + '</span>');
    } else if (t === 'address') {
      var ac = {}; vals.forEach(function (v) { var a = String(v.road || v.jibun || '').split(/\s+/).slice(0, 2).join(' ') || '(미상)'; ac[a] = (ac[a] || 0) + 1; }); body = hbars(q, Object.keys(ac).sort(function (a, b) { return ac[b] - ac[a]; }).slice(0, 8).map(function (k) { return { k: k, label: k, n: ac[k] }; }), n).replace(/class="gx hbrow/g, 'class="gx static hbrow').replace(/data-act="gx"/g, '');
    } else if (t === 'date' || t === 'time') {
      var dc = {}; vals.forEach(function (v) { var k = String(v).slice(0, t === 'date' ? 10 : 2); dc[k] = (dc[k] || 0) + 1; }); body = hbars(q, Object.keys(dc).sort().slice(0, 14).map(function (k) { return { k: k, label: t === 'time' ? k + '시' : k, n: dc[k] }; }), n).replace(/data-act="gx"/g, '');
    } else if (t === 'file' || t === 'signature' || t === 'location' || t === 'qr' || t === 'consent') {
      body = '<div class="big">' + n + '<small> 건 제출</small></div>' + (t === 'file' || t === 'signature' ? '<p class="muted">첨부 ' + vals.reduce(function (s2, v) { return s2 + v.length; }, 0) + '개 · 「개별 응답」에서 열람</p>' : t === 'location' ? '<p class="muted">좌표는 「개별 응답」·엑셀에서 확인</p>' : '');
    } else {
      wide = true; var texts = vals.map(function (v) { return String(v); }), kw = words(texts), recent = rows.filter(function (r) { return !SVY.isEmpty(q, val(r, q)); }).sort(function (a, b) { return b.seq - a.seq; }).slice(0, 3);
      body = (kw.length ? '<div class="kws">' + kw.map(function (k) { return '<button type="button" class="kw" data-act="gtext" data-q="' + E(q.id) + '" data-w="' + E(k.w) + '">' + E(k.w) + ' <b>' + k.n + '</b></button>'; }).join('') + '</div>' : '') + recent.map(function (r) { return '<blockquote>' + E(SVY.fmtAnswer(q, val(r, q), def(), (r.answers || {}).common)) + '</blockquote>'; }).join('') + '<button class="btn btn-ghost btn-sm" data-act="gtext" data-q="' + E(q.id) + '" data-w="">' + I('list', 14) + ' 전체 ' + n + '건 보기</button>';
    }
    var act = (G.x[q.id] || []).length;
    return '<section class="rc' + (wide ? ' wide' : '') + (act ? ' filtered' : '') + '"><header><span class="tag blue">' + E(SVY.typeLabel(q)) + '</span>' + quizTag(q, rows) + '<span class="sp"></span>' + (act ? '<button class="x" data-act="gxq" data-q="' + E(q.id) + '" title="이 문항 필터 해제">필터 해제 ' + I('x', 12) + '</button>' : '<span class="muted n">' + n + '명</span>') + '</header><h4>' + E(q.label) + '</h4>' + body + '</section>';
  }
  function insights(rows) {
    var out = [], qs = qlist(), means = [];
    qs.forEach(function (x) { var q = x.q; if (!(q.type === 'rating' || q.type === 'linear' || (q.type === 'scale' && !(q.check && q.check.valid != null)))) return; var v = rows.map(function (r) { return N(val(r, q)); }).filter(function (z) { return z != null; }); if (v.length >= 3) means.push({ q: q, m: mean(v), max: q.type === 'rating' ? (N(q.max) || 5) : q.type === 'linear' ? (N(q.max) != null ? N(q.max) : 5) : 5 }); });
    if (means.length > 1) { means.sort(function (a, b) { return b.m / b.max - a.m / a.max; }); out.push(['pos', '가장 만족도가 높은 항목은 「' + String(means[0].q.label).slice(0, 24) + '」(' + r2(means[0].m) + '점)입니다.']); out.push(['neg', '가장 낮은 항목은 「' + String(means[means.length - 1].q.label).slice(0, 24) + '」(' + r2(means[means.length - 1].m) + '점)로 개선 검토 대상입니다.']); } else if (means.length) out.push(['pos', '「' + String(means[0].q.label).slice(0, 24) + '」 평균은 ' + r2(means[0].m) + '점입니다.']);
    qs.filter(function (x) { return x.q.type === 'nps'; }).forEach(function (x) { var v = rows.map(function (r) { return N(val(r, x.q)); }).filter(function (z) { return z != null; }); if (v.length >= 3) { var p = v.filter(function (z) { return z >= 9; }).length, d = v.filter(function (z) { return z <= 6; }).length, sc = Math.round(pct(p, v.length) - pct(d, v.length)); out.push([sc >= 0 ? 'pos' : 'neg', '추천 의향 NPS는 ' + (sc > 0 ? '+' : '') + sc + '입니다. (추천 ' + pct(p, v.length) + '% · 비추천 ' + pct(d, v.length) + '%)']); } });
    var byDay = {}; rows.forEach(function (r) { var k = String(r.created_at).slice(5, 10); byDay[k] = (byDay[k] || 0) + 1; }); var dk = Object.keys(byDay).sort(function (a, b) { return byDay[b] - byDay[a]; }); if (dk.length > 1) out.push(['info', '응답이 가장 많았던 날은 ' + dk[0] + '(' + byDay[dk[0]] + '건)입니다.']);
    var qz = qs.filter(function (x) { return x.q.answer != null; }).map(function (x) { var c = rows.map(function (r) { return isCorrect(x.q, val(r, x.q)); }).filter(function (z) { return z !== null; }); return { q: x.q, p: c.length ? pct(c.filter(Boolean).length, c.length) : null }; }).filter(function (z) { return z.p != null; }).sort(function (a, b) { return a.p - b.p; }); if (qz.length) out.push(['info', '정답률이 가장 낮은 문항은 「' + String(qz[0].q.label).slice(0, 24) + '」(' + qz[0].p + '%)입니다.']);
    var tq = qs.filter(function (x) { return x.q.type === 'text' && (!x.q.format || x.q.format === 'text'); }); tq.forEach(function (x) { var tx = rows.map(function (r) { return val(r, x.q); }).filter(function (v) { return !SVY.isEmpty(x.q, v); }), kw = words(tx).slice(0, 3); if (kw.length) out.push(['info', '「' + String(x.q.label).slice(0, 18) + '」에서 자주 나온 말: ' + kw.map(function (k) { return k.w + '(' + k.n + ')'; }).join(', ')]); });
    return out.slice(0, 6);
  }
  function viewReport() {
    var all = pick(), rows = rowsFor(''), d = def(), lim = d.limit && N(d.limit.max), keys = Object.keys(G.x).filter(function (k) { return G.x[k].length; }), qm = {};
    qlist().forEach(function (x) { qm[x.q.id] = x.q; });
    var chips = keys.map(function (id) { return G.x[id].map(function (k) { var q = qm[id], lab = q ? (q.type === 'nps' ? ({ det: '비추천', pas: '중립', pro: '추천' })[k] : q.type === 'single' || q.type === 'multi' ? ((q.options || []).filter(function (o) { return o.id === k; })[0] || { label: k === '__other' ? '기타' : k }).label : q.type === 'scale' ? ((SVY.scaleOf(d, q).filter(function (o) { return String(o.v) === k; })[0] || {}).label || k) : k) : k; return '<button class="fchip" data-act="gx" data-q="' + E(id) + '" data-k="' + E(k) + '">' + E(String((q && q.label) || id).slice(0, 14)) + ': <b>' + E(lab) + '</b> ' + I('x', 12) + '</button>'; }).join(''); }).join('');
    var h = '<div class="fbar"><div class="fcount"><b>' + rows.length + '</b>명' + (keys.length ? ' <span class="muted">/ 전체 ' + all.length + '명 (' + pct(rows.length, all.length) + '%)</span>' : '') + '</div><div class="fchips">' + (chips || '<span class="muted">차트의 항목을 누르면 그 응답자만 모아 모든 문항을 다시 집계합니다.</span>') + '</div>' + (keys.length ? '<button class="btn btn-ghost btn-sm" data-act="gxclear">모두 해제</button>' : '') + '</div>';
    var dur = rows.map(function (r) { return r.duration_sec; }).filter(function (v) { return v > 0; }), sc = rows.filter(function (r) { return r.max_score != null; });
    h += '<div class="hero"><div class="tile"><div class="l">응답</div><div class="v">' + rows.length + '</div>' + (lim ? '<div class="meter"><i style="width:' + Math.min(100, pct(all.length, lim)) + '%"></i></div><div class="s">정원 ' + lim + '명 중 ' + all.length + '명 (' + pct(all.length, lim) + '%)</div>' : '<div class="s">' + (G.data === 'real' ? '정식 응답' : G.data === 'test' ? '테스트 응답' : '정식+테스트') + '</div>') + '</div>' +
      '<div class="tile"><div class="l">중앙 소요 시간</div><div class="v">' + (dur.length ? Math.round(median(dur)) + '<small>초</small>' : '-') + '</div><div class="s">입력 화면 체류 기준</div></div>' +
      (sc.length ? '<div class="tile"><div class="l">퀴즈 평균</div><div class="v">' + r2(mean(sc.map(function (r) { return Number(r.score); }))) + '<small> / ' + r2(Number(sc[0].max_score)) + '</small></div><div class="s">' + Math.round(mean(sc.map(function (r) { return Number(r.score) / Number(r.max_score) * 100; }))) + '점 (100점 환산)</div></div>' : '') + '</div>';
    var ins = insights(rows); if (ins.length) h += '<div class="insights"><h3>' + I('sparkle', 15) + ' 핵심 요약</h3>' + ins.map(function (z) { return '<div class="ins ' + z[0] + '"><i></i><span>' + E(z[1]) + '</span></div>'; }).join('') + '</div>';
    var secs = {}; qlist().forEach(function (x) { var k = x.section ? x.section.title : '기본 정보'; (secs[k] = secs[k] || []).push(x); });
    Object.keys(secs).forEach(function (k) { h += '<h3 class="rsec">' + E(k) + '</h3><div class="rgrid">' + secs[k].map(reportCard).join('') + '</div>'; });
    return h;
  }
  function textModal(qid, w) {
    var q = qlist().filter(function (x) { return x.q.id === qid; })[0].q, rows = rowsFor(qid).filter(function (r) { var v = val(r, q); return !SVY.isEmpty(q, v) && (!w || String(v).indexOf(w) >= 0); }).sort(function (a, b) { return b.seq - a.seq; });
    A.modal('<h3>' + E(q.label) + (w ? ' · 「' + E(w) + '」 포함' : '') + ' (' + rows.length + '건)</h3><div class="textlist" style="max-height:60vh">' + rows.map(function (r) { return '<div class="tl"><span class="muted">' + A.fmt(r.created_at) + '</span> ' + E(SVY.fmtAnswer(q, val(r, q), def(), (r.answers || {}).common)) + '</div>'; }).join('') + '</div><div class="btn-row"><button class="btn btn-primary" data-r="1">닫기</button></div>', function (bg, close) { bg.addEventListener('click', function (e) { if (e.target.closest('[data-r]')) close(); }); }, 'wide');
  }

  /* ───────────── 화면 ───────────── */
  function viewSummary(rows) {
    var d = def(), lim = d.limit && N(d.limit.max), score = rows.filter(function (r) { return r.max_score != null; }), dur = rows.map(function (r) { return r.duration_sec; }).filter(function (v) { return v > 0; }), byDay = {};
    rows.forEach(function (r) { var k = String(r.created_at).slice(0, 10); byDay[k] = (byDay[k] || 0) + 1; });
    var days = Object.keys(byDay).sort(), mx = Math.max.apply(null, days.map(function (k) { return byDay[k]; }).concat([1]));
    var h = '<div class="kpis"><div class="kpi"><div class="l">응답 수</div><div class="v">' + rows.length + '</div><div class="s">' + (G.data === 'real' ? '정식' : G.data === 'test' ? '테스트' : '정식+테스트') + (lim ? ' · 정원 ' + lim + '명 (' + pct(rows.length, lim) + '%)' : '') + '</div></div>' +
      '<div class="kpi"><div class="l">중앙 소요 시간</div><div class="v">' + (dur.length ? Math.round(median(dur)) + '초' : '-') + '</div><div class="s">입력 화면 체류 기준</div></div>';
    if (score.length) { var sc = score.map(function (r) { return Number(r.score) / Number(r.max_score) * 100; }), pass = d.quiz && N(d.quiz.passScore) != null ? score.filter(function (r) { return Number(r.score) >= N(d.quiz.passScore); }).length : null; h += '<div class="kpi"><div class="l">퀴즈 평균 점수</div><div class="v">' + r2(mean(score.map(function (r) { return Number(r.score); }))) + '<small> / ' + r2(Number(score[0].max_score)) + '</small></div><div class="s">평균 ' + Math.round(mean(sc)) + '점(100점 환산)' + (pass != null ? ' · 통과 ' + pass + '명 (' + pct(pass, score.length) + '%)' : '') + '</div></div>'; }
    h += '<div class="kpi"><div class="l">제외 처리</div><div class="v">' + G.rows.filter(function (r) { return r.excluded && (G.data === 'all' || (G.data === 'test') === !!r.is_test); }).length + '</div><div class="s">집계에서 빠진 응답</div></div></div>';
    if (lim) h += '<div class="panel"><h3>정원 현황</h3><div class="meter"><i style="width:' + Math.min(100, pct(rows.length, lim)) + '%"></i></div><div class="muted" style="margin-top:4px">' + rows.length + ' / ' + lim + '명' + (rows.length >= lim ? ' · 마감' : ' · 남은 자리 ' + (lim - rows.length) + '명') + '</div></div>';
    h += '<div class="panel"><h3>일별 응답 추이</h3>' + (days.length ? '<div class="spark">' + days.map(function (k) { return '<div class="sp1" title="' + k + ' ' + byDay[k] + '건"><i style="height:' + Math.max(4, byDay[k] / mx * 100) + '%"></i><span>' + k.slice(5) + '</span><b>' + byDay[k] + '</b></div>'; }).join('') + '</div>' : '<p class="muted">응답이 없습니다.</p>') + '</div>';
    // 핵심 문항 미리보기: 척도·별점·NPS 평균
    var key = qlist().filter(function (x) { return ['scale', 'rating', 'nps', 'linear', 'slider'].indexOf(x.q.type) >= 0 && !(x.q.check && x.q.check.valid != null); });
    if (key.length) h += '<div class="panel"><h3>핵심 지표 (평균)</h3><div class="tbl-wrap"><table class="t"><tbody>' + key.map(function (x) { var v = rows.map(function (r) { return N(val(r, x.q)); }).filter(function (z) { return z != null; }); return '<tr><td class="wrapcell">' + E(x.q.id) + ' · ' + E(x.q.label) + '</td><td>' + E(SVY.typeLabel(x.q)) + '</td><td class="num"><b>' + r2(mean(v)) + '</b></td><td class="num">' + v.length + '명</td></tr>'; }).join('') + '</tbody></table></div></div>';
    return h;
  }
  function viewQuestions(rows) {
    var secs = {}, h = '';
    qlist().forEach(function (x) { var k = x.section ? x.section.title : '기본 정보'; (secs[k] = secs[k] || []).push(x); });
    Object.keys(secs).forEach(function (k) {
      h += '<h3 style="margin:16px 0 6px;color:var(--primary-dk)">' + E(k) + '</h3>';
      secs[k].forEach(function (x) { var q = x.q; h += '<div class="panel"><div class="row"><span class="qid">' + E(q.id) + '</span><span class="tag blue">' + E(SVY.typeLabel(q)) + '</span>' + quizTag(q, rows) + '<span class="sp"></span><span class="muted" style="font-size:12.5px">응답 ' + rows.filter(function (r) { return !SVY.isEmpty(q, val(r, q)); }).length + ' / ' + rows.length + '</span></div><div style="font-weight:600;margin:6px 0">' + E(q.label) + '</div>' + summarize(q, rows) + '</div>'; });
    });
    return h || '<div class="panel t-empty">문항이 없습니다.</div>';
  }
  function respDetail(r) {
    var a = (r.answers || {}).common || {};
    return qlist().map(function (x) {
      var v = a[x.q.id]; if (SVY.isEmpty(x.q, v)) return '';
      var body;
      if (x.q.type === 'file' || x.q.type === 'signature') body = v.map(function (f) { return '<button class="btn btn-secondary btn-sm" data-act="gfile" data-fid="' + E(f.id) + '">' + I('eye', 13) + ' ' + E(f.name || '첨부') + '</button>'; }).join(' ');
      else if (x.q.type === 'location') body = E(SVY.fmtAnswer(x.q, v, def())) + ' <a href="https://www.openstreetmap.org/?mlat=' + v.lat + '&mlon=' + v.lng + '&zoom=17" target="_blank" rel="noopener">지도</a>';
      else body = E(SVY.fmtAnswer(x.q, v, def(), a));
      var ok = isCorrect(x.q, v);
      return '<div class="rd"><span class="muted">' + E(x.q.id) + ' ' + E(String(x.q.label).slice(0, 40)) + '</span><div>' + body + (ok === null ? '' : ok ? ' <span class="badge badge-green">정답</span>' : ' <span class="badge badge-red">오답</span>') + '</div></div>';
    }).join('');
  }
  function viewResp() {
    var all = G.rows.filter(function (r) { return G.data === 'all' || (G.data === 'test') === !!r.is_test; }).sort(function (a, b) { return b.seq - a.seq; }), kw = G.kw.trim().toLowerCase();
    if (kw) all = all.filter(function (r) { return (r.ticket || '').toLowerCase().indexOf(kw) >= 0 || JSON.stringify(r.answers || {}).toLowerCase().indexOf(kw) >= 0; });
    var per = 20, pages = Math.max(1, Math.ceil(all.length / per)); G.page = Math.min(G.page, pages); var rows = all.slice((G.page - 1) * per, G.page * per);
    return '<div class="panel"><div class="row"><h3 class="sp">개별 응답 (' + all.length + '건)</h3><input class="fld" id="gkw" placeholder="추첨번호·응답 내용 검색" value="' + E(G.kw) + '" style="max-width:260px"></div><p class="panel-sub">부적절한 응답은 「제외」하면 집계에서 빠집니다.</p>' + (rows.length ? rows.map(function (r) {
      return '<details class="resp' + (r.excluded ? ' ex' : '') + '"><summary><b>#' + r.seq + '</b> ' + A.fmt(r.created_at) + (r.is_test ? ' <span class="badge badge-amber">테스트</span>' : '') + (r.excluded ? ' <span class="badge badge-gray">제외됨</span>' : '') + (r.max_score != null ? ' <span class="tag blue">' + r2(Number(r.score)) + '/' + r2(Number(r.max_score)) + '점</span>' : '') + ' <span class="muted">' + (r.duration_sec ? r.duration_sec + '초' : '') + '</span><span class="sp"></span></summary><div class="rdbody">' + respDetail(r) + '<div class="row" style="margin-top:8px"><span class="muted">추첨번호 ' + E(r.ticket) + '</span><span class="sp"></span><button class="btn btn-ghost btn-sm" data-act="gexclude" data-id="' + r.id + '" data-v="' + (r.excluded ? 0 : 1) + '">' + (r.excluded ? '제외 해제' : '집계에서 제외') + '</button></div></div></details>'; }).join('') : '<p class="muted">응답이 없습니다.</p>') +
      (pages > 1 ? '<div class="row" style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-act="gpg" data-d="-1" ' + (G.page <= 1 ? 'disabled' : '') + '>이전</button><span class="muted">' + G.page + ' / ' + pages + '</span><button class="btn btn-ghost btn-sm" data-act="gpg" data-d="1" ' + (G.page >= pages ? 'disabled' : '') + '>다음</button></div>' : '') + '</div>';
  }
  function render() {
    var body = document.getElementById('gbody'); if (!body) return;
    var rows = pick(), y = window.scrollY, focus = document.activeElement && document.activeElement.id === 'gkw';
    body.className = ''; body.innerHTML = G.sub === 'rep' ? viewReport() : G.sub === 'sum' ? viewSummary(rows) : G.sub === 'q' ? viewQuestions(rows) : viewResp();
    if (focus) { var n = document.getElementById('gkw'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }
    window.scrollTo(0, y); live();
  }

  /* ───────────── 엑셀 ───────────── */
  function exportXlsx() {
    if (!window.XLSX) return A.toast('엑셀 라이브러리를 불러오지 못했습니다.', 'err');
    var rows = pick().slice().sort(function (a, b) { return a.seq - b.seq; }), qs = qlist(), wb = XLSX.utils.book_new();
    function sheet(name, aoa, w) { var ws = XLSX.utils.aoa_to_sheet(aoa); if (w) ws['!cols'] = w.map(function (x) { return { wch: x }; }); XLSX.utils.book_append_sheet(wb, ws, name); }
    sheet('요약', [['설문', A.cur.survey.title], ['출력 일시', A.fmt(new Date().toISOString())], ['데이터', G.data === 'real' ? '정식 응답' : G.data === 'test' ? '테스트 응답' : '정식+테스트'], ['응답 수', rows.length]], [16, 50]);
    var hasScore = rows.some(function (r) { return r.max_score != null; });
    var head = ['번호', '제출일시', '소요(초)', '추첨번호'].concat(hasScore ? ['점수', '만점'] : []).concat(qs.map(function (x) { return x.q.id + ' ' + String(x.q.label).slice(0, 30); }));
    sheet('응답', [head].concat(rows.map(function (r) { var a = (r.answers || {}).common || {}; return [r.seq, A.fmt(r.created_at), r.duration_sec || '', r.ticket].concat(hasScore ? [r.score == null ? '' : Number(r.score), r.max_score == null ? '' : Number(r.max_score)] : []).concat(qs.map(function (x) { var v = a[x.q.id]; return SVY.isEmpty(x.q, v) ? '' : (['single', 'multi', 'scale', 'grid', 'ranking', 'constsum', 'file', 'signature', 'address', 'location', 'consent'].indexOf(x.q.type) >= 0 || x.q.type === 'date' ? SVY.fmtAnswer(x.q, v, def(), a) : (N(v) != null && typeof v === 'number' ? v : String(v))); })); })), [6, 18, 8, 12].concat(hasScore ? [6, 6] : []).concat(qs.map(function () { return 22; })));
    var st = [['문항', '내용', '형식', '응답 수', '요약']];
    qs.forEach(function (x) {
      var q = x.q, vals = rows.map(function (r) { return val(r, q); }).filter(function (v) { return !SVY.isEmpty(q, v); }), s = '';
      if (q.type === 'single' || q.type === 'multi' || q.type === 'scale') { var c = {}; vals.forEach(function (v) { [].concat(v).forEach(function (id) { c[id] = (c[id] || 0) + 1; }); }); var lst = q.type === 'scale' ? SVY.scaleOf(def(), q).map(function (o) { return { id: o.v, label: o.label }; }) : (q.options || []).concat(q.other ? [{ id: '__other', label: '기타' }] : []); s = lst.map(function (o) { return o.label + ' ' + (c[o.id] || 0) + '명(' + pct(c[o.id] || 0, vals.length) + '%)'; }).join(' / '); }
      else if (['linear', 'rating', 'nps', 'slider'].indexOf(q.type) >= 0) { var nn = vals.map(Number); s = '평균 ' + r2(mean(nn)) + ' · 중앙값 ' + r2(median(nn)); if (q.type === 'nps') { var p = nn.filter(function (v) { return v >= 9; }).length, dd = nn.filter(function (v) { return v <= 6; }).length; s += ' · NPS ' + Math.round(pct(p, nn.length) - pct(dd, nn.length)); } }
      if (q.answer != null) { var cc = rows.map(function (r) { return isCorrect(q, val(r, q)); }).filter(function (z) { return z !== null; }); s += (s ? ' · ' : '') + '정답률 ' + pct(cc.filter(Boolean).length, cc.length) + '%'; }
      st.push([q.id, q.label, SVY.typeLabel(q), vals.length, s]);
    });
    sheet('문항별 통계', st, [8, 50, 14, 8, 90]);
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    A.download(new Blob([out], { type: 'application/octet-stream' }), '설문결과_' + A.cur.survey.title.replace(/[\\/:*?"<>|\s]+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    A.toast('엑셀 파일을 내려받았습니다.');
  }

  /* ───────────── 탭 ───────────── */
  async function general(box) {
    if (G.sid !== A.cur.survey.id) { G.sid = A.cur.survey.id; G.rows = []; G.maxSeq = 0; G.sub = 'rep'; G.page = 1; G.kw = ''; G.x = {}; G.data = A.cur.survey.test_mode ? 'test' : 'real'; }
    var SUBS = [['rep', '리포트'], ['q', '문항 상세'], ['resp', '개별 응답']];
    box.innerHTML = '<div class="row" style="margin-bottom:12px"><div class="tabs" style="margin:0;border:0;flex:1">' + SUBS.map(function (s) { return '<button class="tab" data-act="gsub" data-s="' + s[0] + '" aria-selected="' + (G.sub === s[0]) + '">' + s[1] + '</button>'; }).join('') + '</div><span id="glive" class="live"></span><button class="btn btn-ghost btn-sm" data-act="glivetoggle">일시정지/재개</button><button class="btn btn-secondary btn-sm" data-act="greload">' + I('refresh', 14) + ' 새로고침</button><button class="btn btn-primary btn-sm" data-act="gxlsx">' + I('download', 14) + ' 엑셀 내려받기</button></div>' +
      '<div class="filters"><div><label class="f">데이터</label><select class="fld" id="gdata"><option value="real"' + (G.data === 'real' ? ' selected' : '') + '>정식 응답</option><option value="test"' + (G.data === 'test' ? ' selected' : '') + '>테스트 응답</option><option value="all"' + (G.data === 'all' ? ' selected' : '') + '>정식+테스트</option></select></div></div><div id="gbody" class="loading">불러오는 중…</div>';
    box.onchange = function (e) { if (e.target.id === 'gdata') { G.data = e.target.value; G.page = 1; render(); } };
    box.oninput = function (e) { if (e.target.id === 'gkw') { G.kw = e.target.value; G.page = 1; clearTimeout(G._k); G._k = setTimeout(render, 250); } };
    box.onclick = async function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return; var act = t.getAttribute('data-act');
      if (act === 'gsub') { G.sub = t.getAttribute('data-s'); box.querySelectorAll('[data-act=gsub]').forEach(function (b) { b.setAttribute('aria-selected', b === t); }); G.page = 1; render(); }
      else if (act === 'glivetoggle') { G.live = !G.live; live(); if (G.live) poll(); }
      else if (act === 'greload') fullLoad().then(function () { render(); A.toast('새로 불러왔습니다.'); }).catch(function (er) { A.toast(er.message, 'err'); });
      else if (act === 'gxlsx') exportXlsx();
      else if (act === 'gx') { var qid = t.getAttribute('data-q'), k = t.getAttribute('data-k'), qq = qlist().filter(function (x) { return x.q.id === qid; })[0].q, cur = G.x[qid] || [], ix = cur.indexOf(k); if (ix >= 0) cur.splice(ix, 1); else if (qq.type === 'single' || qq.type === 'scale' || qq.type === 'nps') cur = [k]; else cur.push(k); G.x[qid] = cur; render(); }
      else if (act === 'gxq') { delete G.x[t.getAttribute('data-q')]; render(); }
      else if (act === 'gxclear') { G.x = {}; render(); }
      else if (act === 'gtext') textModal(t.getAttribute('data-q'), t.getAttribute('data-w'));
      else if (act === 'gpg') { G.page += Number(t.getAttribute('data-d')); render(); }
      else if (act === 'gexclude') { try { await A.rpc('svy_a_response_flag', { p_resp_id: t.getAttribute('data-id'), p_excluded: t.getAttribute('data-v') === '1' }); var r = G.rows.filter(function (x) { return x.id === t.getAttribute('data-id'); })[0]; if (r) r.excluded = t.getAttribute('data-v') === '1'; render(); } catch (er) { A.toast(er.message, 'err'); } }
      else if (act === 'gfile') {
        try {
          var f = await A.rpc('svy_a_file_get', { p_id: t.getAttribute('data-fid') }), bin = atob(f.data), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          var url = URL.createObjectURL(new Blob([u8], { type: f.mime }));
          A.modal('<h3>' + E(f.name) + '</h3>' + (/^image\//.test(f.mime) ? '<img src="' + url + '" alt="" style="max-width:100%;border-radius:var(--r);background:#fff">' : '<p class="muted">미리보기를 지원하지 않는 형식입니다.</p>') + '<div class="btn-row"><a class="btn btn-secondary" href="' + url + '" download="' + E(f.name) + '">내려받기</a><button class="btn btn-primary" data-r="1">닫기</button></div>', function (bg, close) { bg.addEventListener('click', function (ev) { if (ev.target.closest('[data-r]')) close(); }); });
        } catch (er) { A.toast(er.message, 'err'); }
      }
    };
    try { await fullLoad(); } catch (e) { document.getElementById('gbody').innerHTML = '<div class="msg err">' + E(e.message) + '</div>'; return; }
    render(); clearTimeout(G.timer); G.timer = setTimeout(poll, 5000);
  }
  var wrapper = function (box) { return A.cur.survey.def.mode === 'general' ? general(box) : orig(box); };
  wrapper.redraw = orig.redraw;
  A.tabs.results = wrapper;
})();
