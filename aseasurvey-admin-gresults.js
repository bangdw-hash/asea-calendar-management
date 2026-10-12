'use strict';
/**
 * aseasurvey-admin-gresults.js — 일반 설문(행사·교직원 등) 결과 대시보드
 *  요약(KPI·일별 추이·정원·퀴즈) / 문항별(형식마다 알맞은 집계) / 개별 응답(첨부·서명 열람, 제외) + 엑셀 출력
 *  과목별 평가 설문은 aseasurvey-admin-results.js 가 그대로 담당합니다.
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico, N = SVY.num;
  var orig = A.tabs.results;
  var G = { sid: '', rows: [], maxSeq: 0, timer: 0, live: true, last: 0, polls: 0, err: '', data: 'real', sub: 'sum', page: 1, kw: '' };
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
    body.className = ''; body.innerHTML = G.sub === 'sum' ? viewSummary(rows) : G.sub === 'q' ? viewQuestions(rows) : viewResp();
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
    if (G.sid !== A.cur.survey.id) { G.sid = A.cur.survey.id; G.rows = []; G.maxSeq = 0; G.sub = 'sum'; G.page = 1; G.kw = ''; G.data = A.cur.survey.test_mode ? 'test' : 'real'; }
    var SUBS = [['sum', '요약'], ['q', '문항별'], ['resp', '개별 응답']];
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
