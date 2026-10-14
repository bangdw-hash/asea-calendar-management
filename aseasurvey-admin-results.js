'use strict';
/**
 * aseasurvey-admin-results.js — 결과 대시보드 (실시간 5초 갱신)
 *  요약(KPI·응답률) / 문항별 분포 / 과목×문항 히트맵 / 교수별 현황판 / 이론·실습 비교 / 서술형 / 응답 관리 + 엑셀 출력
 *  시각화 원칙: 리커트 = 중앙 정렬 발산형 누적 막대(파랑↔빨강, 중립 회색), 크기 = 단일 색상 순차 램프, 얇은 막대·2px 간격, 범례 상시 표시
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico;
  var R = A.R = { sid: '', rows: [], maxSeq: 0, timer: 0, live: true, last: 0, polls: 0, newCount: 0, err: '' };
  var F = A.ext.F = { track: '', grade: '', klass: '', kind: '', prof: '', course: '', sincere: 'all', data: 'real' };
  var SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
  var BLUE = '#3987e5', POS = ['#256abf', '#86b6ef'], NEU = '#d9d8d0', NEG = ['#f2a9a8', '#d03b3b'];

  /* ───────────── 데이터 적재 · 실시간 폴링 ───────────── */
  async function fullLoad() {
    R.rows = []; R.maxSeq = 0; var after = 0, guard = 0;
    for (;;) {
      var r = await A.rpc('svy_a_results', { p_id: R.sid, p_after: after });
      R.rows = R.rows.concat(r.rows); if (r.rows.length) after = r.rows[r.rows.length - 1].seq; R.maxSeq = after; R.total = r.total;
      if (r.rows.length < 2000 || ++guard > 20) break;
    }
    R.last = Date.now();
  }
  async function poll() {
    clearTimeout(R.timer);
    if (A.view !== 'survey' || A.tab !== 'results' || !A.cur || A.cur.survey.id !== R.sid) return;
    if (R.live && !document.hidden) {
      try {
        R.polls++;
        var before = R.rows.length;
        if (R.polls % 12 === 0) { await fullLoad(); render(); }
        else {
          var r = await A.rpc('svy_a_results', { p_id: R.sid, p_after: R.maxSeq });
          if (r.rows.length) { R.rows = R.rows.concat(r.rows); R.maxSeq = r.rows[r.rows.length - 1].seq; }
          R.total = r.total; R.last = Date.now();
          if (R.total !== R.rows.length) { await fullLoad(); render(); }
          else if (r.rows.length) { R.newCount += r.rows.length; render(true); }
          else updateLive();
        }
        R.err = '';
      } catch (e) { R.err = e.message; updateLive(); }
    }
    R.timer = setTimeout(poll, 5000);
  }
  function updateLive() {
    var el = document.getElementById('live'); if (!el) return;
    el.className = 'live' + (R.live ? '' : ' off');
    el.innerHTML = '<i></i>' + (R.err ? '연결 오류: ' + E(R.err) : (R.live ? '실시간 (5초) · ' : '일시 정지 · ') + '최종 갱신 ' + new Date(R.last).toLocaleTimeString('ko-KR')) + (R.newCount ? ' · 새 응답 +' + R.newCount : '');
  }

  /* ───────────── 집계 ───────────── */
  function courseMap() { var m = {}; A.cur.courses.forEach(function (c) { m[c.id] = c; }); return m; }
  function questions() {
    var def = A.cur.survey.def, out = { scale: [], check: [], multi: [], single: [], text: [], common: [] }, sec = {};
    (def.sections || []).forEach(function (s) { sec[s.id] = s; (s.questions || []).forEach(function (q) {
      var item = { q: q, s: s };
      if ((q.scope || 'course') === 'common') { out.common.push(item); return; }
      if (q.type === 'scale') (q.check && q.check.valid != null ? out.check : out.scale).push(item);
      else if (q.type === 'multi') out.multi.push(item); else if (q.type === 'single') out.single.push(item); else if (q.type === 'text') out.text.push(item);
    }); });
    out.sections = (def.sections || []).filter(function (s) { return out.scale.some(function (x) { return x.s.id === s.id; }); });
    return out;
  }
  function passResp(r) { return r.attn_total > 0 ? r.attn_fail === 0 : true; }
  var SINC = { all: '전체(제외 처리한 응답만 뺌)', pass: '유효 응답만 (점검 문항 통과 · 직선 응답 제외)', fail: '점검 실패 응답만', straight: '동일 응답(직선)만', excluded: '관리자 제외 응답만' };
  A.ext.SINC = SINC;
  A.ext.sincereOk = function (r) {
    var m = F.sincere;
    if (m === 'pass') return passResp(r) && !r.straight && !r.excluded;
    if (m === 'fail') return !passResp(r); if (m === 'straight') return !!r.straight; if (m === 'excluded') return !!r.excluded;
    return !r.excluded;
  };
  function respFilter(r, cm) {
    if (F.data === 'real' && r.is_test) return false; if (F.data === 'test' && !r.is_test) return false;
    if (F.track && r.track !== F.track) return false; if (F.grade && r.grade !== F.grade) return false; if (F.klass && r.klass !== F.klass) return false;
    if (!A.ext.sincereOk(r)) return false;
    return true;
  }
  function add(o, k, v) { var a = o[k] || (o[k] = { sum: 0, n: 0 }); a.sum += v; a.n++; }
  function mean(a) { return a && a.n ? a.sum / a.n : null; }
  function median(arr) { if (!arr.length) return null; var s = arr.slice().sort(function (a, b) { return a - b; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function compute() {
    var cm = courseMap(), Q = questions(), D = { Q: Q, cm: cm, resp: [], pairs: [], qAgg: {}, cqAgg: {}, cAll: {}, pAgg: {}, pq: {}, kindSec: {}, secAgg: {}, multi: {}, texts: [], all: { sum: 0, n: 0 }, dur: [], pass: 0 };
    D.resp = R.rows.filter(function (r) { return respFilter(r, cm); });
    var secOf = {}; Q.scale.forEach(function (x) { secOf[x.q.id] = x.s.id; });
    D.resp.forEach(function (r) {
      D.dur.push(r.duration_sec); if (passResp(r) && !r.straight) D.pass++;
      var ans = (r.answers && r.answers.course) || {}, tm = (r.answers && r.answers._t) || {};
      Object.keys(ans).forEach(function (cid) {
        var c = cm[cid]; if (!c) return;
        if (F.kind && c.kind !== F.kind) return; if (F.prof && (c.prof || '(교수 미입력)') !== F.prof) return; if (F.course && c.id !== F.course) return;
        var a = ans[cid], prof = c.prof || '(교수 미입력)';
        D.pairs.push({ r: r, c: c });
        (D.cAll[cid] || (D.cAll[cid] = { n: 0, sum: 0, cnt: 0, t: 0 })).n++;
        (D.pAgg[prof] || (D.pAgg[prof] = { prof: prof, courses: {}, resp: 0, sum: 0, cnt: 0, secs: {}, texts: 0, ethics: 0 })).resp++; D.pAgg[prof].courses[cid] = 1;
        D.cAll[cid].t += tm[cid] || 0;
        Q.scale.forEach(function (x) {
          var v = a[x.q.id]; if (v == null) return;
          var qa = D.qAgg[x.q.id] || (D.qAgg[x.q.id] = { cnt: {}, sum: 0, n: 0 }); qa.cnt[v] = (qa.cnt[v] || 0) + 1; qa.sum += v; qa.n++;
          add(D.cqAgg[cid] || (D.cqAgg[cid] = {}), x.q.id, v);
          var pq = D.pq[prof] || (D.pq[prof] = {}); var pa = pq[x.q.id] || (pq[x.q.id] = { cnt: {}, sum: 0, n: 0 }); pa.cnt[v] = (pa.cnt[v] || 0) + 1; pa.sum += v; pa.n++;
          D.cAll[cid].sum += v; D.cAll[cid].cnt++; D.pAgg[prof].sum += v; D.pAgg[prof].cnt++; D.all.sum += v; D.all.n++;
          add(D.secAgg, x.s.id, v); add(D.pAgg[prof].secs, x.s.id, v); add(D.kindSec[c.kind || '(구분 없음)'] || (D.kindSec[c.kind || '(구분 없음)'] = {}), x.s.id, v);
        });
        Q.multi.concat(Q.single).forEach(function (x) {
          var v = a[x.q.id]; if (v == null) return; var arr = Array.isArray(v) ? v : [v], m = D.multi[x.q.id] || (D.multi[x.q.id] = { n: 0, byOpt: {}, byCourse: {}, byProf: {} });
          m.n++; var ex = (x.q.options || []).filter(function (o) { return o.exclusive; }).map(function (o) { return o.id; }), real = arr.filter(function (o) { return ex.indexOf(o) < 0; });
          arr.forEach(function (o) { m.byOpt[o] = (m.byOpt[o] || 0) + 1; (m.byCourse[cid] || (m.byCourse[cid] = {}))[o] = ((m.byCourse[cid] || {})[o] || 0) + 1; });
          if (x.q.id === 'F1' || /윤리/.test(x.s.title || '')) if (real.length) D.pAgg[prof].ethics++;
        });
        Q.text.forEach(function (x) { var v = a[x.q.id]; if (v && String(v).trim()) { D.texts.push({ qid: x.q.id, q: x.q, c: c, r: r, text: String(v).trim() }); D.pAgg[prof].texts++; } });
      });
      Q.common.forEach(function (x) { if (x.q.type === 'text') { var v = r.answers.common && r.answers.common[x.q.id]; if (v && String(v).trim()) D.texts.push({ qid: x.q.id, q: x.q, c: null, r: r, text: String(v).trim() }); } });
    });
    return D;
  }
  function targetsFor() {
    var out = 0, by = {};
    A.cur.targets.forEach(function (t) { if ((F.track && t.track !== F.track) || (F.grade && t.grade !== F.grade)) return; out += t.headcount; by[t.track + '|' + t.grade] = t; });
    return { total: out, by: by };
  }

  /* ───────────── 색·차트 도우미 ───────────── */
  function scaleColors(sc) {
    var s = sc.slice().sort(function (a, b) { return b.v - a.v; }), n = s.length, out = {};
    if (n === 2) { out[s[0].v] = POS[0]; out[s[1].v] = NEG[1]; return out; }
    var h = Math.floor(n / 2), odd = n % 2;
    s.forEach(function (o, i) { if (i < h) out[o.v] = i === 0 ? POS[0] : (h > 1 ? SVY.mix(POS[0], POS[1], i / (h - 1)) : POS[0]); else if (odd && i === h) out[o.v] = NEU; else { var k = i - h - odd; out[o.v] = k === h - 1 ? NEG[1] : (h > 1 ? SVY.mix(NEG[0], NEG[1], k / (h - 1)) : NEG[1]); } });
    return out;
  }
  function heatColor(m) { if (m == null) return { bg: '#F3F4F6', fg: '#898781' }; var t = Math.max(0, Math.min(1, (m - 1) / 4)) * (SEQ.length - 1), i = Math.floor(t), f = t - i, bg = i >= SEQ.length - 1 ? SEQ[SEQ.length - 1] : SVY.mix(SEQ[i], SEQ[i + 1], f); return { bg: bg, fg: SVY.onColor(bg) === '#FFFFFF' ? '#FFFFFF' : '#0b0b0b' }; }
  function legend(sc, colors) { return '<div class="legend">' + sc.map(function (o) { return '<span><i style="background:' + colors[o.v] + '"></i>' + E(o.label) + '</span>'; }).join('') + '</div>'; }
  function pct(n, d) { return d ? Math.round(n / d * 1000) / 10 : 0; }
  // 중앙 정렬 발산형 누적 막대 한 줄. agg = {cnt, n}; X = 축 반폭(%)
  function divBar(agg, sc, colors, X, tipPrefix) {
    if (!agg || !agg.n) return '<div class="muted" style="font-size:12px">응답 없음</div>';
    var s = sc.slice().sort(function (a, b) { return b.v - a.v; }), n = s.length, odd = n % 2, h = Math.floor(n / 2), p = {}; s.forEach(function (o) { p[o.v] = pct(agg.cnt[o.v] || 0, agg.n); });
    var neg = 0, posv = 0; s.forEach(function (o, i) { if (i < h) posv += p[o.v]; else if (odd && i === h) { neg += p[o.v] / 2; posv += p[o.v] / 2; } else neg += p[o.v]; });
    var segs = []; // [왼쪽→오른쪽] 부정 → 중립 → 긍정
    var order = s.slice().reverse(); // 낮은 점수부터
    order.forEach(function (o, idx) { var isMid = odd && idx === h; if (isMid) { segs.push({ o: o, w: p[o.v] / 2 }); segs.push({ o: o, w: p[o.v] / 2, tip: false }); } else segs.push({ o: o, w: p[o.v] }); });
    var left = (X - neg) / (2 * X) * 100;
    return '<div class="dist" style="margin-left:' + left.toFixed(2) + '%;width:' + ((neg + posv) / (2 * X) * 100).toFixed(2) + '%">' + segs.map(function (g) { var w = (g.w / Math.max(neg + posv, 0.0001) * 100); return g.w > 0 ? '<i data-tip="' + E(tipPrefix + g.o.label + ' ' + (agg.cnt[g.o.v] || 0) + '건 (' + p[g.o.v] + '%)') + '" style="width:' + w.toFixed(2) + '%;background:' + colors[g.o.v] + '"></i>' : ''; }).join('') + '</div>';
  }
  // 발산형 막대의 축 반폭(%): 모든 막대에서 한쪽 최대 비율을 10% 단위로 올림(최소 50)
  function axisX(D) {
    var m = 50, sc = A.cur.survey.def.scales.likert5 || [];
    function side(a) { if (!a || !a.n) return; var s = sc.slice().sort(function (x, y) { return y.v - x.v; }), h = Math.floor(s.length / 2), odd = s.length % 2, neg = 0, pos = 0; s.forEach(function (o, i) { var p = pct(a.cnt[o.v] || 0, a.n); if (i < h) pos += p; else if (odd && i === h) { neg += p / 2; pos += p / 2; } else neg += p; }); m = Math.max(m, Math.ceil(Math.max(neg, pos) / 10) * 10); }
    Object.keys(D.qAgg).forEach(function (k) { side(D.qAgg[k]); }); Object.keys(D.pq).forEach(function (p) { Object.keys(D.pq[p]).forEach(function (k) { side(D.pq[p][k]); }); });
    return m;
  }

  /* ───────────── 요약 ───────────── */
  function viewSummary(D) {
    var tg = targetsFor(), n = D.resp.length, rate = tg.total ? Math.round(n / tg.total * 1000) / 10 : null;
    var avg = D.all.n ? D.all.sum / D.all.n : null, dur = median(D.dur), last = D.resp.length ? D.resp.reduce(function (a, r) { return a > r.created_at ? a : r.created_at; }, '') : '';
    var h = '<div class="kpis">' +
      '<div class="kpi"><div class="l">응답 수</div><div class="v">' + n + '</div><div class="s">' + (F.data === 'test' ? '테스트 응답' : '정식 응답') + (R.newCount ? ' · 새 응답 +' + R.newCount : '') + '</div></div>' +
      '<div class="kpi"><div class="l">응답률</div><div class="v">' + (rate == null ? '-' : rate + '%') + '</div><div class="s">' + (tg.total ? '배포 ' + tg.total + '명 기준' : '배포 인원 미등록') + '</div></div>' +
      '<div class="kpi"><div class="l">성실 응답률</div><div class="v">' + (n ? pct(D.pass, n) + '%' : '-') + '</div><div class="s">점검 통과 · 직선응답 아님</div></div>' +
      '<div class="kpi"><div class="l">전체 평균 (5점)</div><div class="v">' + (avg == null ? '-' : avg.toFixed(2)) + '</div><div class="s">점검 문항 제외</div></div>' +
      '<div class="kpi"><div class="l">입력 시간 (중앙값)</div><div class="v">' + (dur == null ? '-' : Math.floor(dur / 60) + '분 ' + (dur % 60) + '초') + '</div><div class="s">최근 응답 ' + (last ? A.fmt(last) : '-') + '</div></div></div>';
    // 응답률(계열·학년)
    var byTG = {}; D.resp.forEach(function (r) { var k = r.track + '|' + r.grade; byTG[k] = (byTG[k] || 0) + 1; });
    var keys = Object.keys(Object.assign({}, byTG, tg.by)).sort();
    h += '<div class="panel"><h3>응답률 (계열·학년)</h3><p class="panel-sub">막대 길이는 배포 인원 대비 응답 비율입니다.</p>' + (keys.length ? keys.map(function (k) {
      var t = tg.by[k], c = byTG[k] || 0, p = t && t.headcount ? Math.min(c / t.headcount * 100, 100) : 0, nm = k.replace('|', ' ');
      return '<div class="meter-row"><div>' + E(nm) + '</div><div class="bar-bg" data-tip="' + E(nm + ': 응답 ' + c + '명' + (t ? ' / 배포 ' + t.headcount + '명' : '')) + '"><div class="bar-fg" style="width:' + p.toFixed(1) + '%"></div></div><div class="num">' + c + (t && t.headcount ? ' / ' + t.headcount + ' (' + (c / t.headcount * 100).toFixed(1) + '%)' : '명') + '</div></div>';
    }).join('') : '<div class="t-empty">응답이 없습니다.</div>') + '</div>';
    // 영역별 평균
    h += '<div class="panel"><h3>영역별 평균 (5점 만점)</h3>' + (D.Q.sections.length ? D.Q.sections.map(function (s) { var a = D.secAgg[s.id], m = mean(a); return '<div class="meter-row"><div>' + E(s.title) + '</div><div class="bar-bg" data-tip="' + E(s.title + ' 평균 ' + (m == null ? '-' : m.toFixed(2)) + ' (' + (a ? a.n : 0) + '건)') + '"><div class="bar-fg" style="width:' + (m ? (m / 5 * 100).toFixed(1) : 0) + '%"></div></div><div class="num"><b>' + (m == null ? '-' : m.toFixed(2)) + '</b></div></div>'; }).join('') : '<div class="t-empty">척도 문항이 없습니다.</div>') + '</div>';
    // 신뢰도 점검 요약
    var fails = {}; D.Q.check.forEach(function (x) { fails[x.q.id] = { ok: 0, bad: 0 }; });
    D.pairs.forEach(function (p) { var a = (p.r.answers.course || {})[p.c.id] || {}; D.Q.check.forEach(function (x) { if (a[x.q.id] == null) return; if (a[x.q.id] === x.q.check.valid) fails[x.q.id].ok++; else fails[x.q.id].bad++; }); });
    if (D.Q.check.length) h += '<div class="panel"><h3>신뢰도 점검 문항 결과</h3><p class="panel-sub">정답(유효값)과 다르게 응답한 건수입니다. 상단 필터의 「신뢰도」에서 점검 실패 응답만 따로 볼 수 있습니다.</p><div class="tbl-wrap"><table class="t"><thead><tr><th>문항</th><th>정답</th><th class="num">정답 응답</th><th class="num">오답 응답</th><th class="num">오답률</th></tr></thead><tbody>' + D.Q.check.map(function (x) { var f = fails[x.q.id], sc = (A.cur.survey.def.scales[x.q.scale || 'likert5'] || []).filter(function (o) { return o.v === x.q.check.valid; })[0]; return '<tr><td class="wrapcell">[' + E(x.q.id) + '] ' + E(x.q.label) + '</td><td>' + E(sc ? sc.label : x.q.check.valid) + '</td><td class="num">' + f.ok + '</td><td class="num">' + f.bad + '</td><td class="num">' + pct(f.bad, f.ok + f.bad) + '%</td></tr>'; }).join('') + '</tbody></table></div></div>';
    return h;
  }

  /* ───────────── 문항별 분포 ───────────── */
  function viewQuestions(D) {
    var def = A.cur.survey.def; if (!D.Q.scale.length) return '<div class="panel t-empty">척도 문항이 없습니다.</div>';
    var h = '', secs = {};
    var sc = def.scales.likert5, colors = scaleColors(sc);
    h += '<div class="panel"><h3>문항별 응답 분포</h3><p class="panel-sub">중립(보통)을 가운데 기준선에 맞춰 긍정은 오른쪽(파랑), 부정은 왼쪽(빨강)으로 표시합니다. 막대에 마우스를 올리면 건수가 표시됩니다.</p>' + legend(sc, colors);
    D.Q.sections.forEach(function (s) {
      h += '<h4 style="margin:14px 0 4px;color:var(--primary-dk)">' + E(s.title) + '</h4>';
      D.Q.scale.filter(function (x) { return x.s.id === s.id; }).forEach(function (x) {
        var a = D.qAgg[x.q.id], sc2 = def.scales[x.q.scale || 'likert5'], col2 = scaleColors(sc2), m = a && a.n ? a.sum / a.n : null;
        h += '<div class="qrow"><div class="qt" title="' + E(x.q.label) + '"><b>' + E(x.q.id) + '</b> ' + E(x.q.label) + '</div><div style="position:relative">' + divBar(a, sc2, col2, axisX(D), '[' + x.q.id + '] ') + '<div style="position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:var(--border-2)"></div></div><div class="num"><b>' + (m == null ? '-' : m.toFixed(2)) + '</b></div></div>';
      });
    });
    h += '</div>';
    // 복수선택/단일선택
    var ms = D.Q.multi.concat(D.Q.single);
    ms.forEach(function (x) {
      var m = D.multi[x.q.id]; if (!m) return;
      h += '<div class="panel"><h3>[' + E(x.q.id) + '] ' + E(x.q.label) + '</h3><p class="panel-sub">응답 ' + m.n + '건 (과목 단위) · 선택 비율</p>' + (x.q.options || []).map(function (o) { var c = m.byOpt[o.id] || 0, p = pct(c, m.n); return '<div class="meter-row" style="grid-template-columns:minmax(120px,300px) 1fr 110px"><div style="white-space:normal">' + E(o.label) + '</div><div class="bar-bg" data-tip="' + E(o.label + ': ' + c + '건 (' + p + '%)') + '"><div class="bar-fg" style="width:' + p + '%;background:' + (o.exclusive ? '#898781' : BLUE) + '"></div></div><div class="num">' + c + ' (' + p + '%)</div></div>'; }).join('') + '</div>';
    });
    return h;
  }

  /* ───────────── 과목 × 문항 히트맵 ───────────── */
  function viewHeat(D) {
    var cs = Object.keys(D.cAll).map(function (id) { return D.cm[id]; }).sort(function (a, b) { return (a.track + a.grade + a.klass + a.name).localeCompare(b.track + b.grade + b.klass + b.name, 'ko'); });
    if (!cs.length) return '<div class="panel t-empty">표시할 응답이 없습니다.</div>';
    var qs = D.Q.scale;
    return '<div class="panel"><h3>과목 × 문항 평균 히트맵</h3><p class="panel-sub">색이 진할수록 평균이 높습니다 (1점 → 5점). 칸에 마우스를 올리면 응답 수가 표시됩니다.</p>' +
      '<div class="row" style="margin-bottom:8px"><span class="muted" style="font-size:12px">1점</span><div style="width:200px;height:10px;border-radius:5px;background:linear-gradient(90deg,' + SEQ.join(',') + ')"></div><span class="muted" style="font-size:12px">5점</span></div>' +
      '<div class="tbl-wrap heat"><table class="t"><thead><tr><th>계열·학년·반</th><th>과목</th><th>교수</th><th class="num">응답</th>' + qs.map(function (x) { return '<th class="num" title="' + E(x.q.label) + '">' + E(x.q.id) + '</th>'; }).join('') + '<th class="num">평균</th></tr></thead><tbody>' +
      cs.map(function (c) { var ca = D.cAll[c.id], cq = D.cqAgg[c.id] || {}, tm = mean({ sum: ca.sum, n: ca.cnt }); return '<tr><td>' + E(c.track + ' ' + c.grade + ' ' + c.klass) + '</td><td>' + E(c.name) + (c.kind ? ' <span class="tag">' + E(c.kind) + '</span>' : '') + '</td><td>' + E(c.prof || '-') + '</td><td class="num">' + ca.n + '</td>' + qs.map(function (x) { var a = cq[x.q.id], m = mean(a), hc = heatColor(m); return '<td class="hc" style="background:' + hc.bg + ';color:' + hc.fg + '" data-tip="' + E(c.name + ' · ' + x.q.id + ' — ' + (m == null ? '응답 없음' : '평균 ' + m.toFixed(2) + ' (' + a.n + '건)')) + '">' + (m == null ? '-' : m.toFixed(1)) + '</td>'; }).join('') + (function () { var hc = heatColor(tm); return '<td class="hc" style="background:' + hc.bg + ';color:' + hc.fg + '"><b>' + (tm == null ? '-' : tm.toFixed(2)) + '</b></td>'; })() + '</tr>'; }).join('') + '</tbody></table></div></div>';
  }

  /* ───────────── 교수별 현황판 ───────────── */
  function viewProf(D) {
    var ps = Object.keys(D.pAgg).map(function (k) { return D.pAgg[k]; });
    if (!ps.length) return '<div class="panel t-empty">표시할 응답이 없습니다.</div>';
    var secs = D.Q.sections, sort = A.ext.psort || 'avg';
    ps.forEach(function (p) { p.avg = p.cnt ? p.sum / p.cnt : null; });
    ps.sort(function (a, b) { return sort === 'name' ? a.prof.localeCompare(b.prof, 'ko') : sort === 'resp' ? b.resp - a.resp : (b.avg || 0) - (a.avg || 0); });
    var overall = D.all.n ? D.all.sum / D.all.n : null;
    return '<div class="panel"><div class="row"><h3 class="sp" style="margin:0">교수별 현황판</h3><label class="f" style="margin:0">정렬</label><select class="fld" id="psort" style="width:150px"><option value="avg"' + (sort === 'avg' ? ' selected' : '') + '>평균 높은 순</option><option value="resp"' + (sort === 'resp' ? ' selected' : '') + '>응답 많은 순</option><option value="name"' + (sort === 'name' ? ' selected' : '') + '>이름순</option></select></div>' +
      '<p class="panel-sub">교수를 누르면 문항별 분포·서술형·윤리 항목을 볼 수 있습니다. 전체 평균 ' + (overall == null ? '-' : overall.toFixed(2)) + ' 대비 차이를 함께 표시합니다. (응답 5건 미만은 참고용)</p>' +
      '<div class="tbl-wrap"><table class="t"><thead><tr><th>교수</th><th class="num">담당 과목</th><th class="num">응답(과목 단위)</th><th class="num">평균</th><th class="num">전체 대비</th>' + secs.map(function (s) { return '<th class="num" title="' + E(s.title) + '">' + E(String(s.title).replace(/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\.\s*/, '').slice(0, 8)) + '</th>'; }).join('') + '<th class="num">서술</th><th class="num">윤리 선택</th></tr></thead><tbody>' +
      ps.map(function (p) { var d = p.avg != null && overall != null ? p.avg - overall : null, hc = heatColor(p.avg); return '<tr style="cursor:pointer" data-act="profdetail" data-p="' + E(p.prof) + '"><td><b>' + E(p.prof) + '</b>' + (p.resp < 5 ? ' <span class="badge badge-gray">참고용</span>' : '') + '</td><td class="num">' + Object.keys(p.courses).length + '</td><td class="num">' + p.resp + '</td><td class="hc num" style="background:' + hc.bg + ';color:' + hc.fg + ';font-weight:700">' + (p.avg == null ? '-' : p.avg.toFixed(2)) + '</td><td class="num" style="color:' + (d == null ? '' : d >= 0 ? '#1c5cab' : '#d03b3b') + '">' + (d == null ? '-' : (d >= 0 ? '+' : '') + d.toFixed(2)) + '</td>' + secs.map(function (s) { var m = mean(p.secs[s.id]), c = heatColor(m); return '<td class="hc num" style="background:' + c.bg + ';color:' + c.fg + '">' + (m == null ? '-' : m.toFixed(2)) + '</td>'; }).join('') + '<td class="num">' + p.texts + '</td><td class="num">' + (p.ethics ? '<span class="badge badge-red">' + p.ethics + '건</span>' : '0') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
  }
  function profDetail(name) {
    var D = A.ext.D, p = D.pAgg[name]; if (!p) return;
    var def = A.cur.survey.def, sc = def.scales.likert5, colors = scaleColors(sc);
    var texts = D.texts.filter(function (t) { return t.c && (t.c.prof || '(교수 미입력)') === name; });
    var courses = Object.keys(p.courses).map(function (id) { return D.cm[id]; });
    var h = '<h3>' + E(name) + ' — 상세</h3><p class="muted">담당 과목: ' + courses.map(function (c) { return E(c.track + ' ' + c.grade + ' ' + c.klass + ' ' + c.name); }).join(' · ') + '</p>' + legend(sc, colors);
    D.Q.sections.forEach(function (s) {
      h += '<h4 style="margin:12px 0 4px;color:var(--primary-dk)">' + E(s.title) + '</h4>';
      D.Q.scale.filter(function (x) { return x.s.id === s.id; }).forEach(function (x) { var a = (D.pq[name] || {})[x.q.id], all = D.qAgg[x.q.id], m = a && a.n ? a.sum / a.n : null, mm = all && all.n ? all.sum / all.n : null; h += '<div class="qrow"><div class="qt" title="' + E(x.q.label) + '"><b>' + E(x.q.id) + '</b> ' + E(x.q.label) + '</div><div style="position:relative">' + divBar(a, def.scales[x.q.scale || 'likert5'], scaleColors(def.scales[x.q.scale || 'likert5']), axisX(D), '[' + x.q.id + '] ') + '<div style="position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:var(--border-2)"></div></div><div class="num"><b>' + (m == null ? '-' : m.toFixed(2)) + '</b><div class="muted" style="font-size:11px">전체 ' + (mm == null ? '-' : mm.toFixed(2)) + '</div></div></div>'; });
    });
    var f1 = D.multi.F1; if (f1) { var ex = {}; D.pairs.forEach(function (pr) { if ((pr.c.prof || '(교수 미입력)') !== name) return; var v = ((pr.r.answers.course || {})[pr.c.id] || {}).F1; if (Array.isArray(v)) v.forEach(function (o) { ex[o] = (ex[o] || 0) + 1; }); }); var q = D.Q.multi.filter(function (x) { return x.q.id === 'F1'; })[0]; if (q) h += '<h4 style="margin:12px 0 4px;color:var(--primary-dk)">교육윤리 응답 (본 영역은 만족도에 합산되지 않음)</h4>' + (q.q.options || []).map(function (o) { return '<div class="meter-row" style="grid-template-columns:minmax(120px,320px) 1fr 70px"><div style="white-space:normal">' + E(o.label) + '</div><div class="bar-bg"><div class="bar-fg" style="width:' + pct(ex[o.id] || 0, p.resp) + '%;background:' + (o.exclusive ? '#898781' : '#d03b3b') + '"></div></div><div class="num">' + (ex[o.id] || 0) + '</div></div>'; }).join(''); }
    h += '<h4 style="margin:12px 0 4px;color:var(--primary-dk)">서술형 의견 ' + texts.length + '건</h4>' + (texts.slice(0, 80).map(function (t) { return '<div class="cmt"><div class="who"><span class="tag blue">' + E(t.qid) + '</span><span>' + E(t.c.name) + ' · ' + E(t.c.klass) + '</span><span>' + A.fmt(t.r.created_at) + '</span></div><p>' + E(t.text) + '</p></div>'; }).join('') || '<div class="muted">서술형 의견이 없습니다.</div>');
    A.modal(h + '<div class="btn-row"><button class="btn btn-primary" data-r="1">닫기</button></div>', function (bg, close) { bg.addEventListener('click', function (e) { if (e.target.closest('[data-r]')) close(); }); }, 'xl');
  }


  /* ───────────── 비교 (계열·학년·반·교수·과목·구분) ───────────── */
  var CMP = A.ext.cmp = { dim: 'prof', met: 'all', sort: 'met', dir: -1, q: '', zoom: 'full' };
  var DIMS = [['track', '계열'], ['grade', '학년'], ['klass', '반'], ['prof', '교수'], ['course', '과목'], ['kind', '이론·실습']];
  function shortSec(t) { return String(t).replace(/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\.\s*/, '').slice(0, 8); }
  function cmpGroups(D, dim) {
    var key = { track: function (p) { return p.r.track; }, grade: function (p) { return p.r.track + ' ' + p.r.grade; }, klass: function (p) { return p.r.track + ' ' + p.r.grade + ' ' + p.r.klass; },
      prof: function (p) { return p.c.prof || '(교수 미입력)'; }, course: function (p) { return p.c.name + ' · ' + (p.c.klass || '') + (p.c.prof ? ' · ' + p.c.prof : ''); }, kind: function (p) { return p.c.kind || '(구분 없음)'; } }[dim];
    var secOf = {}; D.Q.scale.forEach(function (x) { secOf[x.q.id] = x.s.id; });
    var g = {};
    D.pairs.forEach(function (p) {
      var k = key(p), o = g[k] || (g[k] = { name: k, n: 0, rs: {}, all: { sum: 0, n: 0 }, sec: {}, q: {} }), a = (p.r.answers.course || {})[p.c.id] || {};
      o.n++; o.rs[p.r.id] = 1;
      D.Q.scale.forEach(function (x) { var v = a[x.q.id]; if (v == null) return; add(o.q, x.q.id, v); add(o.sec, x.s.id, v); o.all.sum += v; o.all.n++; });
    });
    return Object.keys(g).map(function (k) { var o = g[k]; o.resp = Object.keys(o.rs).length; return o; });
  }
  function cmpVal(o, met) { if (met === 'all') return mean(o.all); if (met.indexOf('s:') === 0) return mean(o.sec[met.slice(2)]); return mean(o.q[met.slice(2)]); }
  function viewCmp(D) {
    var c = CMP, rows = cmpGroups(D, c.dim), secs = D.Q.sections;
    if (!rows.length) return cmpBar(D) + '<div class="panel t-empty">표시할 응답이 없습니다.</div>';
    var overall = D.all.n ? D.all.sum / D.all.n : null;
    rows.forEach(function (o) { o.v = cmpVal(o, c.met); o.tot = mean(o.all); });
    var ranked = rows.filter(function (o) { return o.v != null; }).sort(function (a, b) { return b.v - a.v; }); ranked.forEach(function (o, i) { o.rank = i + 1; });
    var q = (c.q || '').trim().toLowerCase(); var list = rows.filter(function (o) { return !q || o.name.toLowerCase().indexOf(q) >= 0; });
    var val = { name: function (o) { return o.name; }, resp: function (o) { return o.resp; }, rank: function (o) { return o.rank == null ? 1e9 : o.rank; }, met: function (o) { return o.v == null ? -1 : o.v; }, all: function (o) { return o.tot == null ? -1 : o.tot; } };
    secs.forEach(function (sc) { val['s:' + sc.id] = function (o) { var m = mean(o.sec[sc.id]); return m == null ? -1 : m; }; });
    var f = val[c.sort] || val.met, dir = c.dir;
    list.sort(function (a, b) { var x = f(a), y = f(b); var r = typeof x === 'string' ? x.localeCompare(y, 'ko') : x - y; return r * dir || a.name.localeCompare(b.name, 'ko'); });
    var metLabel = metName(D, c.met), dimLabel = DIMS.filter(function (d) { return d[0] === c.dim; })[0][1];
    var top = list.slice(0, 30);
    var lo = 0; if (c.zoom === 'zoom') { var mn = list.reduce(function (m, o) { return o.v != null && o.v < m ? o.v : m; }, 5); lo = Math.max(0, Math.floor((mn - 0.3) * 2) / 2); }
    var chart = '<div class="panel"><h3>' + E(dimLabel) + '별 ' + E(metLabel) + ' 비교</h3><p class="panel-sub">막대 길이는 ' + (lo ? '<b>' + lo + '~5점 구간을 확대한 값</b>(차이를 키워 보여 주므로 비교용으로만 보십시오)' : '5점 만점 기준') + ', 세로선은 전체 평균(' + (overall == null ? '-' : overall.toFixed(2)) + ')입니다. 아래 표의 정렬 순서를 따르며 최대 30개까지 그립니다. (응답 5건 미만은 흐리게 표시)</p>' +
      '<div class="cmpchart">' + top.map(function (o) {
        var w = o.v == null ? 0 : Math.max(0, Math.min(100, (o.v - lo) / (5 - lo) * 100)), ov = overall == null ? 0 : Math.max(0, Math.min(100, (overall - lo) / (5 - lo) * 100));
        return '<div class="cmprow" data-tip="' + E(o.name + ' · ' + metLabel + ' ' + (o.v == null ? '-' : o.v.toFixed(2)) + ' · 응답 ' + o.resp) + '"><span class="cn">' + E(o.name) + '</span><span class="cb"><i style="width:' + w + '%;' + (o.resp < 5 ? 'opacity:.45;' : '') + '"></i><u style="left:' + ov + '%"></u></span><span class="cv">' + (o.v == null ? '-' : o.v.toFixed(2)) + '</span></div>';
      }).join('') + '</div>' + (list.length > 30 ? '<div class="muted" style="margin-top:6px">상위 30개만 그렸습니다. 전체는 표에서 확인하십시오.</div>' : '') + '</div>';
    function th(k, label, num, title) { var on = c.sort === k; return '<th class="num' + (num ? '' : '" style="text-align:left') + '" aria-sort="' + (on ? (dir > 0 ? 'ascending' : 'descending') : 'none') + '"' + (title ? ' title="' + E(title) + '"' : '') + '><button class="thsort' + (on ? ' on' : '') + '" data-act="cmpsort" data-k="' + E(k) + '">' + E(label) + (on ? (dir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>'; }
    var tbl = '<div class="panel"><h3>' + E(dimLabel) + '별 비교표</h3><p class="panel-sub">열 제목을 누르면 그 열 기준으로 정렬되고, 다시 누르면 오름차순·내림차순이 바뀝니다. 순위는 조회 항목(' + E(metLabel) + ') 기준입니다.</p>' +
      '<div class="tbl-wrap" style="max-height:520px;overflow:auto"><table class="t cmpt"><thead><tr>' + th('rank', '순위', true, '조회 항목 기준 순위') + th('name', dimLabel, false) + th('resp', '응답', true) + th('met', metLabel.slice(0, 10), true, '조회 항목 평균') + th('all', '종합', true) +
      secs.map(function (sc) { return th('s:' + sc.id, shortSec(sc.title), true, sc.title); }).join('') + '</tr></thead><tbody>' +
      (list.map(function (o) {
        var hm = heatColor(o.v);
        return '<tr' + (c.dim === 'prof' ? ' style="cursor:pointer" data-act="profdetail" data-p="' + E(o.name) + '"' : '') + '><td class="num">' + (o.rank == null ? '-' : o.rank) + '</td><td><b>' + E(o.name) + '</b>' + (o.resp < 5 ? ' <span class="badge badge-gray">참고용</span>' : '') + '</td><td class="num">' + o.resp + '</td><td class="hc num" style="background:' + hm.bg + ';color:' + hm.fg + '">' + (o.v == null ? '-' : o.v.toFixed(2)) + '</td><td class="num">' + (o.tot == null ? '-' : o.tot.toFixed(2)) + '</td>' +
          secs.map(function (sc) { var m = mean(o.sec[sc.id]), h2 = heatColor(m); return '<td class="hc num" style="background:' + h2.bg + ';color:' + h2.fg + '">' + (m == null ? '-' : m.toFixed(2)) + '</td>'; }).join('') + '</tr>';
      }).join('') || '<tr><td colspan="' + (5 + secs.length) + '" class="t-empty">검색 결과가 없습니다.</td></tr>') + '</tbody></table></div></div>';
    return cmpBar(D) + chart + tbl;
  }
  function metName(D, met) {
    if (met === 'all') return '종합 평균'; if (met.indexOf('s:') === 0) { var s = D.Q.sections.filter(function (x) { return x.id === met.slice(2); })[0]; return s ? shortSec(s.title) : met; }
    var x = D.Q.scale.filter(function (y) { return y.q.id === met.slice(2); })[0]; return x ? x.q.id + ' ' + String(x.q.label).slice(0, 14) : met;
  }
  function cmpBar(D) {
    var c = CMP, sel = function (id, opts, cur) { return '<select class="fld" data-cmp="' + id + '">' + opts + '</select>'; };
    var dims = DIMS.map(function (d) { return '<option value="' + d[0] + '"' + (c.dim === d[0] ? ' selected' : '') + '>' + d[1] + '</option>'; }).join('');
    var mets = '<option value="all"' + (c.met === 'all' ? ' selected' : '') + '>종합 평균</option><optgroup label="영역별">' + D.Q.sections.map(function (s) { return '<option value="s:' + E(s.id) + '"' + (c.met === 's:' + s.id ? ' selected' : '') + '>' + E(s.title) + '</option>'; }).join('') + '</optgroup><optgroup label="문항별">' + D.Q.scale.map(function (x) { return '<option value="q:' + E(x.q.id) + '"' + (c.met === 'q:' + x.q.id ? ' selected' : '') + '>' + E(x.q.id + ' ' + String(x.q.label).slice(0, 30)) + '</option>'; }).join('') + '</optgroup>';
    return '<div class="panel"><div class="row" style="gap:12px;align-items:flex-end;flex-wrap:wrap"><div><label class="f">비교 기준</label>' + sel('dim', dims) + '</div><div style="min-width:220px;flex:1"><label class="f">조회 항목</label>' + sel('met', mets) + '</div><div><label class="f">막대 축</label>' + sel('zoom', '<option value="full"' + (c.zoom !== 'zoom' ? ' selected' : '') + '>0~5점 전체</option><option value="zoom"' + (c.zoom === 'zoom' ? ' selected' : '') + '>차이 확대(최저점~5)</option>') + '</div><div><label class="f">이름 검색</label><input class="fld" id="cmpq" data-cmp="q" value="' + E(c.q) + '" placeholder="예: 홍길동, 1반"></div></div></div>';
  }

  /* ───────────── 이론·실습 비교 ───────────── */
  function viewKind(D) {
    var kinds = Object.keys(D.kindSec); if (!kinds.length) return '<div class="panel t-empty">표시할 응답이 없습니다.</div>';
    var cols = ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6'];
    return '<div class="panel"><h3>이론·실습 비교 (영역별 평균)</h3><p class="panel-sub">구분이 등록된 과목만 비교됩니다.</p><div class="legend">' + kinds.map(function (k, i) { return '<span><i style="background:' + cols[i % 4] + '"></i>' + E(k) + '</span>'; }).join('') + '</div>' +
      D.Q.sections.map(function (s) { return '<div style="padding:8px 0;border-bottom:1px solid var(--gray-lt)"><div style="font-weight:600;margin-bottom:4px">' + E(s.title) + '</div>' + kinds.map(function (k, i) { var m = mean((D.kindSec[k] || {})[s.id]); return '<div class="meter-row" style="grid-template-columns:80px 1fr 60px;padding:2px 0"><div class="muted">' + E(k) + '</div><div class="bar-bg" data-tip="' + E(k + ' · ' + s.title + ' 평균 ' + (m == null ? '-' : m.toFixed(2))) + '"><div class="bar-fg" style="width:' + (m ? (m / 5 * 100).toFixed(1) : 0) + '%;background:' + cols[i % 4] + '"></div></div><div class="num"><b>' + (m == null ? '-' : m.toFixed(2)) + '</b></div></div>'; }).join('') + '</div>'; }).join('') + '</div>';
  }

  /* ───────────── 서술형 ───────────── */
  function viewText(D) {
    var qf = A.ext.tq || '', kw = (A.ext.tkw || '').trim(), qlist = D.Q.text.map(function (x) { return x.q; }).concat(D.Q.common.filter(function (x) { return x.q.type === 'text'; }).map(function (x) { return x.q; }));
    var list = D.texts.filter(function (t) { return (!qf || t.qid === qf) && (!kw || t.text.indexOf(kw) >= 0); }).sort(function (a, b) { return a.r.created_at < b.r.created_at ? 1 : -1; });
    var page = Math.min(A.ext.tpg || 1, Math.max(Math.ceil(list.length / 40), 1));
    return '<div class="panel"><div class="row"><h3 class="sp" style="margin:0">서술형 의견 모아보기 (' + list.length + '건)</h3><select class="fld" id="tq" style="width:260px"><option value="">모든 문항</option>' + qlist.map(function (q) { return '<option value="' + E(q.id) + '"' + (qf === q.id ? ' selected' : '') + '>[' + E(q.id) + '] ' + E(String(q.label).slice(0, 30)) + '</option>'; }).join('') + '</select><input class="fld" id="tkw" style="width:180px" placeholder="키워드 검색" value="' + E(kw) + '"></div>' +
      '<p class="panel-sub">익명으로 수집된 의견입니다. 상단 필터(계열·교수·과목 등)가 그대로 적용됩니다.</p>' +
      (list.slice((page - 1) * 40, page * 40).map(function (t) { return '<div class="cmt"><div class="who"><span class="tag blue">' + E(t.qid) + '</span>' + (t.c ? '<span>' + E(t.c.track + ' ' + t.c.grade + ' ' + t.c.klass) + ' · <b>' + E(t.c.name) + '</b> · ' + E(t.c.prof || '교수 미입력') + '</span>' : '<span>공통(학교 건의)</span>') + '<span>' + A.fmt(t.r.created_at) + '</span></div><p>' + E(t.text) + '</p></div>'; }).join('') || '<div class="t-empty">의견이 없습니다.</div>') +
      (list.length > 40 ? '<div class="row" style="margin-top:10px"><button class="btn btn-sm btn-ghost" data-act="tpg" data-d="-1" ' + (page <= 1 ? 'disabled' : '') + '>이전</button><span class="muted">' + page + ' / ' + Math.ceil(list.length / 40) + '</span><button class="btn btn-sm btn-ghost" data-act="tpg" data-d="1" ' + (page >= Math.ceil(list.length / 40) ? 'disabled' : '') + '>다음</button></div>' : '') + '</div>';
  }

  /* ───────────── 응답 관리(제외 처리) ───────────── */
  function viewManage(D) {
    var rows = D.resp.slice().sort(function (a, b) { return b.seq - a.seq; }).slice(0, 300);
    return '<div class="panel"><h3>응답 관리</h3><p class="panel-sub">최근 응답 300건까지 표시합니다. 성실도가 의심되는 응답은 「제외」 처리하면 집계와 추첨에서 빠집니다. (필터의 신뢰도 → 「관리자 제외」에서 다시 볼 수 있습니다.)</p>' +
      '<div class="tbl-wrap"><table class="t"><thead><tr><th>시각</th><th>추첨번호</th><th>계열·학년·반</th><th class="num">과목</th><th class="num">입력 시간</th><th class="num">과목당(초)</th><th>점검</th><th>직선</th><th class="num">서술(자)</th><th></th></tr></thead><tbody>' +
      (rows.map(function (r) { var nc = Object.keys((r.answers && r.answers.course) || {}).length || 1; return '<tr' + (r.excluded ? ' style="opacity:.55"' : '') + '><td>' + A.fmt(r.created_at) + (r.is_test ? ' <span class="badge badge-amber">테스트</span>' : '') + '</td><td><span class="ticket-chip">' + E(r.ticket) + '</span></td><td>' + E(r.track + ' ' + r.grade + ' ' + r.klass) + '</td><td class="num">' + nc + '</td><td class="num">' + Math.floor(r.duration_sec / 60) + ':' + ('0' + r.duration_sec % 60).slice(-2) + '</td><td class="num">' + Math.round(r.duration_sec / nc) + '</td><td>' + (r.attn_total ? (r.attn_fail ? '<span class="badge badge-red">실패 ' + r.attn_fail + '/' + r.attn_total + '</span>' : '<span class="badge badge-green">통과</span>') : '-') + '</td><td>' + (r.straight ? '<span class="badge badge-amber">동일응답</span>' : '-') + '</td><td class="num">' + r.text_len + '</td><td><button class="btn btn-ghost btn-sm" data-act="exclude" data-id="' + r.id + '" data-v="' + (r.excluded ? 0 : 1) + '">' + (r.excluded ? '제외 해제' : '제외') + '</button></td></tr>'; }).join('') || '<tr><td colspan="10" class="t-empty">응답이 없습니다.</td></tr>') + '</tbody></table></div></div>';
  }

  /* ───────────── 엑셀 출력 ───────────── */
  function exportXlsx(extWb, pre) {
    if (!window.XLSX) return A.toast('엑셀 라이브러리를 불러오지 못했습니다.', 'err');
    var D = compute(), def = A.cur.survey.def, Q = D.Q, wb = extWb || XLSX.utils.book_new(), tg = targetsFor(); pre = pre || '';
    function sheet(name, aoa, widths) { name = (pre + name).slice(0, 31); var ws = XLSX.utils.aoa_to_sheet(aoa); if (widths) ws['!cols'] = widths.map(function (w) { return { wch: w }; }); XLSX.utils.book_append_sheet(wb, ws, name); }
    var n = D.resp.length, avg = D.all.n ? D.all.sum / D.all.n : '';
    sheet('요약', [['설문', A.cur.survey.title], ['출력 일시', A.fmt(new Date().toISOString())], ['데이터', F.data === 'real' ? '정식 응답' : F.data === 'test' ? '테스트 응답' : '정식+테스트'], ['응답 범위(유효성)', SINC[F.sincere] || '전체'], ['적용 필터', ['계열', 'track', '학년', 'grade', '반', 'klass', '구분', 'kind', '교수', 'prof', '과목', 'course'].reduce(function (s, v, i, a) { return i % 2 ? s : s + (F[a[i + 1]] ? a[i] + ': ' + F[a[i + 1]] + ' ' : ''); }, '') || '없음'], [],
      ['응답 수', n], ['배포 인원', tg.total || ''], ['응답률(%)', tg.total ? Math.round(n / tg.total * 1000) / 10 : ''], ['성실 응답 수', D.pass], ['전체 평균(5점)', avg === '' ? '' : Math.round(avg * 100) / 100], [], ['계열', '학년', '배포 인원', '응답 수', '응답률(%)']].concat(
      (function () { var by = {}; D.resp.forEach(function (r) { var k = r.track + '|' + r.grade; by[k] = (by[k] || 0) + 1; }); return Object.keys(Object.assign({}, by, tg.by)).sort().map(function (k) { var p = k.split('|'), t = tg.by[k]; return [p[0], p[1], t ? t.headcount : '', by[k] || 0, t && t.headcount ? Math.round((by[k] || 0) / t.headcount * 1000) / 10 : '']; }); })()), [26, 18, 12, 10, 12]);
    var hdr = ['문항', '내용', '응답 수', '평균'].concat(def.scales.likert5.map(function (o) { return o.label + '(' + o.v + ')'; }));
    sheet('문항별 통계', [hdr].concat(Q.scale.map(function (x) { var a = D.qAgg[x.q.id] || { cnt: {}, n: 0, sum: 0 }; return [x.q.id, x.q.label, a.n, a.n ? Math.round(a.sum / a.n * 100) / 100 : ''].concat(def.scales.likert5.map(function (o) { return a.cnt[o.v] || 0; })); })), [8, 60, 10, 8, 12, 12, 12, 12, 12]);
    var cs = Object.keys(D.cAll).map(function (id) { return D.cm[id]; }).sort(function (a, b) { return (a.track + a.grade + a.klass + a.name).localeCompare(b.track + b.grade + b.klass + b.name, 'ko'); });
    sheet('과목별 평균', [['계열', '학년', '반', '과목', '구분', '교수', '응답 수'].concat(Q.scale.map(function (x) { return x.q.id; })).concat(['평균'])].concat(cs.map(function (c) { var ca = D.cAll[c.id], cq = D.cqAgg[c.id] || {}; return [c.track, c.grade, c.klass, c.name, c.kind, c.prof, ca.n].concat(Q.scale.map(function (x) { var m = mean(cq[x.q.id]); return m == null ? '' : Math.round(m * 100) / 100; })).concat([ca.cnt ? Math.round(ca.sum / ca.cnt * 100) / 100 : '']); })), [12, 8, 8, 22, 8, 12, 8]);
    var ps = Object.keys(D.pAgg).map(function (k) { return D.pAgg[k]; });
    sheet('교수별 평균', [['교수', '담당 과목 수', '응답(과목 단위)', '평균'].concat(Q.sections.map(function (s) { return s.title; })).concat(['서술 의견 수', '윤리 항목 선택'])].concat(ps.map(function (p) { return [p.prof, Object.keys(p.courses).length, p.resp, p.cnt ? Math.round(p.sum / p.cnt * 100) / 100 : ''].concat(Q.sections.map(function (s) { var m = mean(p.secs[s.id]); return m == null ? '' : Math.round(m * 100) / 100; })).concat([p.texts, p.ethics]); })), [14, 10, 12, 8, 14, 14, 14, 14, 14, 14, 10, 10]);
    // 원자료 (응답 × 과목)
    var allQ = Q.scale.concat(Q.check, Q.multi, Q.single, Q.text);
    function cell(x, v) { if (v == null) return ''; if (x.q.type === 'scale') return v; if (x.q.type === 'single') { var o = (x.q.options || []).filter(function (o) { return o.id === v; })[0]; return o ? o.label : v; } if (x.q.type === 'multi') return (Array.isArray(v) ? v : []).map(function (id) { var o = (x.q.options || []).filter(function (o) { return o.id === id; })[0]; return o ? o.label : id; }).join('; '); return v; }
    var raw = [['응답일시', '구분', '추첨번호', '계열', '학년', '반', '과목', '과목구분', '교수', '총 입력시간(초)', '과목 입력시간(초)', '성실응답 점검', '동일응답', '관리자 제외'].concat(allQ.map(function (x) { return x.q.id + ' ' + String(x.q.label).slice(0, 20); }))];
    D.pairs.sort(function (a, b) { return a.r.seq - b.r.seq; }).forEach(function (p) { var a = (p.r.answers.course || {})[p.c.id] || {}, t = ((p.r.answers._t) || {})[p.c.id]; raw.push([A.fmt(p.r.created_at), p.r.is_test ? '테스트' : '정식', p.r.ticket, p.r.track, p.r.grade, p.r.klass, p.c.name, p.c.kind, p.c.prof, p.r.duration_sec, t == null ? '' : t, p.r.attn_total ? (p.r.attn_fail ? '실패(' + p.r.attn_fail + ')' : '통과') : '', p.r.straight ? 'Y' : '', p.r.excluded ? 'Y' : ''].concat(allQ.map(function (x) { return cell(x, a[x.q.id]); }))); });
    sheet('원자료(응답×과목)', raw, [18, 8, 12, 12, 8, 8, 22, 8, 12, 10, 10, 12, 8, 8]);
    var tx = [['응답일시', '문항', '계열', '학년', '반', '과목', '교수', '내용']]; D.texts.sort(function (a, b) { return a.r.seq - b.r.seq; }).forEach(function (t) { tx.push([A.fmt(t.r.created_at), t.qid + ' ' + String(t.q.label).slice(0, 24), t.r.track, t.r.grade, t.r.klass, t.c ? t.c.name : '(공통)', t.c ? t.c.prof : '', t.text]); });
    sheet('서술형', tx, [18, 30, 12, 8, 8, 22, 12, 80]);
    var pub = (A.cur.draws || []).filter(function (d) { return d.published; })[0];
    if (A.cur.draws && A.cur.draws.length) { var dr = [['회차', '추첨번호', '인원', '추첨 일시', '공개', '수령']]; var claimed = {}; (A.cur.claims || []).forEach(function (c) { claimed[c.ticket] = A.fmt(c.claimed_at); }); A.cur.draws.slice().reverse().forEach(function (d, i) { d.tickets.forEach(function (t) { dr.push([d.id, t, d.n, A.fmt(d.created_at), d.published ? '공개' : '비공개', claimed[t] || '']); }); }); sheet('추첨', dr, [8, 14, 8, 18, 8, 18]); }
    // 비교 시트: 기준별 순위·영역 평균·문항 평균 (현재 응답 범위 기준)
    DIMS.forEach(function (d) {
      var gs = cmpGroups(D, d[0]); if (!gs.length) return;
      gs.forEach(function (o) { o.tot = mean(o.all); }); gs.sort(function (x, y) { return (y.tot == null ? -1 : y.tot) - (x.tot == null ? -1 : x.tot) || x.name.localeCompare(y.name, 'ko'); });
      sheet('비교-' + d[1], [['순위', d[1], '응답', '종합 평균'].concat(Q.sections.map(function (sc) { return sc.title; })).concat(Q.scale.map(function (x) { return x.q.id + ' ' + String(x.q.label).slice(0, 20); }))].concat(gs.map(function (o, i) {
        function r2(m) { return m == null ? '' : Math.round(m * 100) / 100; }
        return [o.tot == null ? '' : i + 1, o.name, o.resp, r2(o.tot)].concat(Q.sections.map(function (sc) { return r2(mean(o.sec[sc.id])); })).concat(Q.scale.map(function (x) { return r2(mean(o.q[x.q.id])); }));
      })), [6, 34, 8, 10]);
    });
    if (extWb) return;
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    A.download(new Blob([out], { type: 'application/octet-stream' }), '설문결과_' + A.cur.survey.title.replace(/[\\/:*?"<>|\s]+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    A.toast('엑셀 파일을 내려받았습니다. (현재 필터가 적용된 결과)');
  }

  /* ───────────── 화면 구성 ───────────── */
  var SUBS = [['sum', '요약'], ['q', '문항별'], ['heat', '과목 히트맵'], ['cmp', '비교'], ['prof', '교수별 현황판'], ['kind', '이론·실습'], ['text', '서술형'], ['mng', '응답 관리']];
  function uniqSorted(arr) { return Array.from(new Set(arr.filter(Boolean))).sort(function (a, b) { return a.localeCompare(b, 'ko'); }); }
  function filterBar() {
    var cs = A.cur.courses, opt = function (arr, cur) { return '<option value="">전체</option>' + arr.map(function (v) { return '<option' + (cur === v ? ' selected' : '') + '>' + E(v) + '</option>'; }).join(''); };
    var scope = function (f) { return cs.filter(function (c) { return (!F.track || c.track === F.track) && (!F.grade || c.grade === F.grade) && (!F.klass || c.klass === F.klass) && (f ? f(c) : true); }); };
    return '<div class="filters" id="rfilters"><div><label class="f">계열</label><select class="fld" data-ff="track">' + opt(uniqSorted(cs.map(function (c) { return c.track; })), F.track) + '</select></div>' +
      '<div><label class="f">학년</label><select class="fld" data-ff="grade">' + opt(uniqSorted(scope().map(function (c) { return c.grade; })), F.grade) + '</select></div>' +
      '<div><label class="f">반</label><select class="fld" data-ff="klass">' + opt(uniqSorted(scope().map(function (c) { return c.klass; })), F.klass) + '</select></div>' +
      '<div><label class="f">구분</label><select class="fld" data-ff="kind">' + opt(uniqSorted(cs.map(function (c) { return c.kind; })), F.kind) + '</select></div>' +
      '<div><label class="f">교수</label><select class="fld" data-ff="prof">' + opt(uniqSorted(cs.map(function (c) { return c.prof || '(교수 미입력)'; })), F.prof) + '</select></div>' +
      '<div><label class="f">과목</label><select class="fld" data-ff="course"><option value="">전체</option>' + scope(function (c) { return (!F.prof || (c.prof || '(교수 미입력)') === F.prof) && (!F.kind || c.kind === F.kind); }).map(function (c) { return '<option value="' + c.id + '"' + (F.course === c.id ? ' selected' : '') + '>' + E(c.name + ' (' + c.klass + ')') + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="f">응답 범위(유효성)</label><select class="fld" data-ff="sincere"><option value="all"' + (F.sincere === 'all' ? ' selected' : '') + '>전체</option><option value="pass"' + (F.sincere === 'pass' ? ' selected' : '') + '>유효 응답만 (점검 통과·직선 응답 제외)</option><option value="fail"' + (F.sincere === 'fail' ? ' selected' : '') + '>점검 실패 응답만</option><option value="straight"' + (F.sincere === 'straight' ? ' selected' : '') + '>동일 응답(직선)만</option><option value="excluded"' + (F.sincere === 'excluded' ? ' selected' : '') + '>관리자 제외 응답</option></select></div>' +
      '<div><label class="f">데이터</label><select class="fld" data-ff="data"><option value="real"' + (F.data === 'real' ? ' selected' : '') + '>정식 응답</option><option value="test"' + (F.data === 'test' ? ' selected' : '') + '>테스트 응답</option><option value="all"' + (F.data === 'all' ? ' selected' : '') + '>모두</option></select></div>' +
      '<div class="sp"></div><button class="btn btn-ghost btn-sm" data-act="fclear">필터 초기화</button></div>';
  }
  function render(keepFilters) {
    var body = document.getElementById('rbody'); if (!body) return;
    var D = A.ext.D = compute(), sub = A.ext.rsub || 'sum';
    var fn = { sum: viewSummary, q: viewQuestions, heat: viewHeat, prof: viewProf, cmp: viewCmp, kind: viewKind, text: viewText, mng: viewManage }[sub];
    var y = window.scrollY; body.className = ''; body.innerHTML = fn(D); updateLive(); if (R.newCount && sub !== 'sum') { /* 새 응답 표시는 상단 라이브 표시에 반영 */ }
    window.scrollTo(0, y);
  }
  A.ext.courseSheets = function (wb, rows) { var sv = { rows: R.rows, f: Object.assign({}, F), sid: R.sid }; try { R.rows = rows; F.track = F.grade = F.klass = F.kind = F.prof = F.course = ''; exportXlsx(wb, '현황-'); } finally { R.rows = sv.rows; Object.assign(F, sv.f); } };
  A.tabs.results = async function (box) {
    if (R.sid !== A.cur.survey.id) { R.sid = A.cur.survey.id; R.rows = []; R.maxSeq = 0; R.newCount = 0; F.track = F.grade = F.klass = F.kind = F.prof = F.course = ''; if (!A.ext.keepShared) { F.sincere = 'all'; F.data = A.cur.survey.test_mode ? 'test' : 'real'; } A.ext.rsub = A.ext.rsubInit || 'sum'; }
    var sub = A.ext.rsub || 'sum';
    box.innerHTML = '<div class="row" style="margin-bottom:12px"><div class="tabs" style="margin:0;border:0;flex:1">' + SUBS.map(function (s) { return '<button class="tab" data-act="rsub" data-s="' + s[0] + '" aria-selected="' + (sub === s[0]) + '">' + s[1] + '</button>'; }).join('') + '</div><span id="live" class="live"></span><button class="btn btn-ghost btn-sm" data-act="livetoggle">일시정지/재개</button><button class="btn btn-secondary btn-sm" data-act="reload">' + I('refresh', 14) + ' 새로고침</button><button class="btn btn-primary btn-sm" data-act="xlsx">' + I('download', 14) + ' 엑셀 내려받기</button></div>' +
      filterBar() + '<div id="rbody" class="loading">불러오는 중…</div>';
    box.onchange = function (e) { var cp = e.target.getAttribute('data-cmp'); if (cp && cp !== 'q') { CMP[cp] = e.target.value; if (cp === 'dim') { CMP.sort = 'met'; CMP.dir = -1; } render(); return; } var f = e.target.getAttribute('data-ff'); if (f) { F[f] = e.target.value; if (f === 'track') { F.grade = F.klass = F.course = ''; } if (f === 'grade') { F.klass = F.course = ''; } if (f === 'prof' || f === 'kind' || f === 'klass') F.course = ''; A.tabs.results.redraw(box); } else if (e.target.id === 'psort') { A.ext.psort = e.target.value; render(); } else if (e.target.id === 'tq') { A.ext.tq = e.target.value; A.ext.tpg = 1; render(); } };
    box.oninput = function (e) { if (e.target.id === 'cmpq') { CMP.q = e.target.value; clearTimeout(A._ck); A._ck = setTimeout(function () { render(); var n = document.getElementById('cmpq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); return; } if (e.target.id === 'tkw') { A.ext.tkw = e.target.value; A.ext.tpg = 1; clearTimeout(A._tk); A._tk = setTimeout(function () { render(); var n = document.getElementById('tkw'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); } };
    box.onclick = function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return; var act = t.getAttribute('data-act');
      if (act === 'rsub') { A.ext.rsub = t.getAttribute('data-s'); box.querySelectorAll('[data-act=rsub]').forEach(function (b) { b.setAttribute('aria-selected', b === t); }); render(); }
      else if (act === 'fclear') { F.track = F.grade = F.klass = F.kind = F.prof = F.course = ''; F.sincere = 'all'; A.tabs.results.redraw(box); }
      else if (act === 'livetoggle') { R.live = !R.live; updateLive(); if (R.live) poll(); }
      else if (act === 'reload') { R.newCount = 0; fullLoad().then(function () { render(); A.toast('새로 불러왔습니다.'); }).catch(function (er) { A.toast(er.message, 'err'); }); }
      else if (act === 'cmpsort') { var k2 = t.getAttribute('data-k'); if (CMP.sort === k2) CMP.dir = -CMP.dir; else { CMP.sort = k2; CMP.dir = (k2 === 'name' || k2 === 'rank') ? 1 : -1; } render(); }
      else if (act === 'xlsx') exportXlsx();
      else if (act === 'profdetail') profDetail(t.getAttribute('data-p'));
      else if (act === 'tpg') { A.ext.tpg = (A.ext.tpg || 1) + Number(t.getAttribute('data-d')); render(); }
      else if (act === 'exclude') { A.rpc('svy_a_response_flag', { p_resp_id: t.getAttribute('data-id'), p_excluded: t.getAttribute('data-v') === '1' }).then(function () { var r = R.rows.filter(function (x) { return x.id === t.getAttribute('data-id'); })[0]; if (r) r.excluded = t.getAttribute('data-v') === '1'; render(); }).catch(function (er) { A.toast(er.message, 'err'); }); }
    };
    // 툴팁
    var tip = null; box.onmousemove = function (e) { var el = e.target.closest('[data-tip]'); if (!el) { if (tip) { tip.remove(); tip = null; } return; } if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip); } tip.textContent = el.getAttribute('data-tip'); tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 300) + 'px'; tip.style.top = (e.clientY + 16) + 'px'; };
    box.onmouseleave = function () { if (tip) { tip.remove(); tip = null; } };
    try { await fullLoad(); } catch (e) { document.getElementById('rbody').innerHTML = '<div class="msg err">' + E(e.message) + '</div>'; return; }
    render(); clearTimeout(R.timer); R.timer = setTimeout(poll, 5000);
  };
  A.tabs.results.redraw = function (box) { var sel = box.querySelector('#rfilters'); if (sel) sel.outerHTML = filterBar(); render(); };
})();
