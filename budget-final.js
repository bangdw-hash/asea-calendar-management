'use strict';
/**
 * budget-final.js — 확정안 작성 (BudgetFinal) · 관리자 「확정안」 탭
 *  금액 3단: 전년 예산 → 부서 요구액(덮어쓰지 않음) → 확정안(기획처 조정, 사유 필수, 이력 영구 보관)
 *  - 자동 초안: 증감 기준 이내는 자동 승인, 초과분은 「전년+기준% 또는 올해 실적 중 큰 값」으로 조정,
 *    부서 한도를 넘으면 증가분만 비례 삭감 (미리 보기 후 적용 → 검토 → 저장)
 *  - 세입·세출 균형 도우미, 실적 대비 과다 요구 표시, 임원 보고용 1쪽 인쇄, 엑셀
 *  서버 규칙은 db/budget_schema_6.sql (bgt_a_final_save · bgt_a_final_hist).
 */
(function () {
  var W = window.BW, $ = W.$, $$ = W.$$, esc = W.esc, won = W.won, num = W.num, ico = W.ico, toast = W.toast;
  var S = { year: null, type: '세출', dept: '', view: 'all', edits: {} };
  var CTX = null;

  function fail(e) { toast(e.message, 'err'); }
  function thr(ctx) { return Number(ctx.settings && ctx.settings.variance_pct) || 20; }
  function usedMap(spend) { var m = {}; (spend || []).forEach(function (s) { m[s.line_id] = (m[s.line_id] || 0) + (Number(s.amount) || 0); }); return m; }
  function ceil1000(n) { return Math.ceil(n / 1000) * 1000; }
  function floor1000(n) { return Math.floor(n / 1000) * 1000; }
  function capOf(ctx, dept, type) { var r = (ctx.data.caps || []).filter(function (c) { return c.dept === dept && c.type === type; })[0]; return r ? Number(r.amount) || 0 : 0; }
  function pctTxt(a, b) { if (!b) return a ? '신규' : '-'; var p = (a - b) * 100 / b; return (p > 0 ? '+' : '') + p.toFixed(1) + '%'; }
  function deptOrder(ctx) { return (ctx.data.depts || []).filter(function (d) { return d.active; }).map(function (d) { return d.dept; }); }

  /* 줄 하나의 파생값. edit가 있으면 저장 전 값까지 반영 */
  function calc(ctx, l, used, edit, t) {
    var base = Number(l.base_amount) || 0, req = Number(l.amount) || 0;
    var fin = edit ? edit.final : (l.final_amount == null ? null : Number(l.final_amount));
    var eff = fin == null ? req : fin;
    var actual = l.forecast != null ? Number(l.forecast) : (used > 0 ? used : null);
    var rate = base > 0 ? (req - base) * 100 / base : null, isNew = base === 0 && req > 0;
    return { base: base, req: req, fin: fin, eff: eff, used: used, actual: actual, rate: rate, isNew: isNew,
      review: isNew || (rate != null && rate > t),
      over: actual != null && req > base && req > actual * (1 + t / 100),
      adjusted: eff !== req };
  }

  /* ───────── 자동 초안 ───────── */
  function autoDraft(ctx, p) {
    var used = usedMap(ctx.data.spend), stats = { auto: 0, review: 0, trim: 0, cap: 0, capLow: [] }, byDept = {};
    ctx.data.lines.forEach(function (l) {
      if (l.type !== '세출') return;
      var x = calc(ctx, l, used[l.id] || 0, null, p.thr), f = x.req, reason = '';
      if (x.review) {
        stats.review++;
        if (!x.isNew && x.rate > p.thr) {
          var allow = Math.round(x.base * (1 + p.thr / 100)), basis = x.actual != null ? x.actual : 0, prop = Math.min(x.req, ceil1000(Math.max(allow, basis)));
          if (prop < x.req) {
            f = prop; stats.trim++;
            reason = '전년 대비 +' + x.rate.toFixed(1) + '% (기준 ' + p.thr + '% 초과): 전년+' + p.thr + '% 또는 올해 실적·추정(' + won(basis) + '원) 중 큰 값으로 조정';
          }
        }
      } else stats.auto++;
      (byDept[l.dept] = byDept[l.dept] || []).push({ l: l, base: x.base, req: x.req, f: f, reason: reason });
    });
    if (p.capCut) Object.keys(byDept).forEach(function (d) {
      var cap = capOf(ctx, d, '세출'); if (!(cap > 0)) return;
      var it = byDept[d], total = 0, baseline = 0, incs = 0;
      it.forEach(function (x) { total += x.f; baseline += Math.min(x.f, x.base); incs += Math.max(x.f - x.base, 0); });
      if (total <= cap) return;
      if (cap < baseline) stats.capLow.push(d);
      var k = incs > 0 ? Math.max(0, Math.min(1, (cap - baseline) / incs)) : 0;
      it.forEach(function (x) {
        if (x.f <= x.base) return;
        var nf = Math.max(x.base, floor1000(Math.min(x.f, x.base) + (x.f - x.base) * k));
        if (nf < x.f) { x.reason = (x.reason ? x.reason + ' → ' : '') + '부서 한도 ' + won(cap) + '원 초과분 비례 삭감 (증가분의 ' + Math.round(k * 100) + '% 인정)'; x.f = nf; stats.cap++; }
      });
    });
    var out = {};
    Object.keys(byDept).forEach(function (d) { byDept[d].forEach(function (x) { if (x.f !== x.req) out[x.l.id] = { final: x.f, reason: x.reason, src: 'auto' }; }); });
    return { edits: out, stats: stats };
  }

  function effTotals(ctx, type) {
    var used = usedMap(ctx.data.spend), t = thr(ctx), r = { base: 0, req: 0, eff: 0, used: 0, review: 0, over: 0, adj: 0, noReason: 0 };
    ctx.data.lines.forEach(function (l) {
      if (l.type !== type) return;
      var x = calc(ctx, l, used[l.id] || 0, S.edits[l.id], t);
      r.base += x.base; r.req += x.req; r.eff += x.eff; r.used += x.used; if (x.review) r.review++; if (x.over) r.over++; if (x.adjusted) r.adj++;
    });
    return r;
  }
  function dirtyIds() {
    return Object.keys(S.edits).filter(function (id) {
      var l = CTX.data.lines.filter(function (x) { return x.id === id; })[0]; if (!l) return false;
      var e = S.edits[id], db = l.final_amount == null ? null : Number(l.final_amount);
      return e.final !== db || (e.final != null && (e.reason || '') !== (l.final_reason || ''));
    });
  }

  /* ───────── 화면 ───────── */
  function show(box, ctx) {
    CTX = ctx;
    if (S.year !== ctx.year) { S.year = ctx.year; S.edits = {}; S.dept = ''; }
    draw(box);
  }

  function kpi(l, v, cls) { return '<div class="kpi ' + (cls || '') + '"><div class="kpi-l">' + l + '</div><div class="kpi-v sm">' + v + '</div></div>'; }
  function kpiHtml() {
    var a = effTotals(CTX, '세입'), b = effTotals(CTX, '세출'), gap = a.eff - b.eff, dirty = dirtyIds().length;
    return '<div class="kpis">' + kpi('세입 확정안', won(a.eff) + '<small>원</small>') + kpi('세출 확정안', won(b.eff) + '<small>원</small>') +
      kpi('세입 − 세출', '<span class="' + (gap < 0 ? 'neg' : '') + '">' + (gap > 0 ? '+' : '') + won(gap) + '</span><small>원</small>', gap < 0 ? 'warnk' : '') +
      kpi('세출 요구 → 확정', won(b.req) + ' → ' + won(b.eff) + '<small>원 (' + pctTxt(b.eff, b.req) + ')</small>') +
      kpi('세출 전년 대비', pctTxt(b.eff, b.base)) +
      kpi('검토 필요 / 실적 과다 / 조정', b.review + ' / ' + b.over + ' / ' + b.adj + '<small>건 (세출)</small>') + '</div>' +
      (gap < 0 ? '<div class="note warn">' + ico('alert', 16) + ' <span>세출 확정안이 세입 확정안보다 ' + won(-gap) + '원 큽니다. 「세입·세출 균형」으로 조정안을 만들 수 있습니다.</span></div>' : '') +
      (dirty ? '<div class="note info">' + ico('edit', 16) + ' <span>저장하지 않은 변경 <b>' + dirty + '건</b>이 있습니다. 확인 후 「변경 저장」을 누르십시오.</span></div>' : '');
  }

  function rowsFor(ctx) {
    var used = usedMap(ctx.data.spend), t = thr(ctx), order = deptOrder(ctx), out = [];
    ctx.data.lines.forEach(function (l) {
      if (l.type !== S.type || (S.dept && l.dept !== S.dept)) return;
      var x = calc(ctx, l, used[l.id] || 0, S.edits[l.id], t), ok = true;
      if (S.view === 'review') ok = x.review; else if (S.view === 'adjusted') ok = x.adjusted; else if (S.view === 'over') ok = x.over;
      if (ok) out.push({ l: l, x: x });
    });
    out.sort(function (p, q) { return (order.indexOf(p.l.dept) - order.indexOf(q.l.dept)) || W.cmpMok(p.l.mok, q.l.mok) || (p.l.sort - q.l.sort); });
    return out;
  }
  function chips(x) {
    return (x.isNew ? '<span class="flag warn">신규</span>' : x.review ? '<span class="flag warn">검토 필요</span>' : '') + (x.over ? ' <span class="flag err">실적 대비 과다</span>' : '') + (x.adjusted ? ' <span class="flag info">조정</span>' : '');
  }
  function rowHtml(r) {
    var l = r.l, x = r.x, e = S.edits[l.id], reason = e ? (e.reason || '') : (l.final_reason || '');
    return '<tr class="ln" data-id="' + l.id + '"><td class="nowrap">' + esc(l.dept) + '</td><td class="c-code">' + esc(l.mok) + '</td><td>' + esc(l.name) + '<div class="flags" data-ch>' + chips(x) + '</div></td>' +
      '<td class="num">' + won(x.base) + '</td><td class="num" title="' + (l.forecast != null ? '연말 추정' : '올해 집행') + '">' + (x.actual == null ? '<span class="muted">-</span>' : won(x.actual)) + '</td>' +
      '<td class="num">' + won(x.req) + '</td><td class="num" data-rate>' + pctTxt(x.req, x.base) + '</td>' +
      '<td class="num"><input class="in num fin" inputmode="numeric" value="' + (x.fin == null ? '' : won(x.fin)) + '" placeholder="' + won(x.req) + '" aria-label="확정안"></td>' +
      '<td class="num" data-frate>' + pctTxt(x.eff, x.base) + '</td>' +
      '<td><input class="in fre' + (x.adjusted && !reason.trim() ? ' need' : '') + '" value="' + esc(reason) + '" placeholder="' + (x.adjusted ? '조정 사유 (필수)' : '') + '" aria-label="조정 사유"></td></tr>';
  }

  function draw(box) {
    var ctx = CTX, rows = rowsFor(ctx), depts = deptOrder(ctx), t = thr(ctx);
    var views = [['all', '전체'], ['review', '검토 필요'], ['over', '실적 대비 과다'], ['adjusted', '조정됨']];
    box.innerHTML = '<div class="tools"><div><h3>확정안 (금액 3단: 전년 → 요구 → 확정)</h3><p class="muted">부서 요구액은 그대로 두고 확정안만 조정합니다. 비워 두면 확정안 = 요구액입니다. 조정 사유는 필수이며 변경 이력이 서버에 남습니다. 증감 기준은 ' + t + '%(일정·한도 설정)입니다.</p></div></div>' +
      '<div id="fn-kpi">' + kpiHtml() + '</div>' +
      '<div class="acts fn-acts"><button class="btn btn-primary" id="fn-draft">' + ico('refresh', 16) + ' 자동 초안</button><button class="btn btn-secondary" id="fn-bal">세입·세출 균형</button>' +
      '<button class="btn btn-primary" id="fn-save">' + ico('check', 16) + ' 변경 저장</button><button class="btn btn-ghost" id="fn-reset">저장 전 변경 취소</button>' +
      '<span class="fn-sp"></span><button class="btn btn-secondary btn-sm" id="fn-exec">' + ico('print', 16) + ' 임원 보고서(1쪽)</button><button class="btn btn-secondary btn-sm" id="fn-xls">' + ico('download', 16) + ' 엑셀</button><button class="btn btn-ghost btn-sm" id="fn-hist">' + ico('list', 16) + ' 조정 이력</button></div>' +
      '<div class="tools"><div class="acts"><div class="seg" id="fn-type"><button class="seg-b' + (S.type === '세출' ? ' on' : '') + '" data-t="세출">세출</button><button class="seg-b' + (S.type === '세입' ? ' on' : '') + '" data-t="세입">세입</button></div>' +
      '<label class="inl">부서<select id="fn-dept" class="in sm"><option value="">전체</option>' + depts.map(function (d) { return '<option' + (d === S.dept ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="ws-tabs fn-views" id="fn-views">' + views.map(function (v) { return '<button class="ws-tab' + (S.view === v[0] ? ' on' : '') + '" data-v="' + v[0] + '">' + v[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="tbl-wrap"><table class="bt fin-t"><thead><tr><th>부서</th><th>코드</th><th>세부명칭</th><th class="num">전년 예산</th><th class="num">올해 집행·추정</th><th class="num">부서 요구</th><th class="num">요구 증감</th><th class="num">확정안</th><th class="num">확정 증감</th><th>조정 사유</th></tr></thead><tbody>' +
      (rows.length ? rows.map(rowHtml).join('') : '<tr><td colspan="10" class="muted" style="text-align:center;padding:24px">해당 항목이 없습니다.</td></tr>') + '</tbody></table></div>';

    $('#fn-type', box).onclick = function (e) { var b = e.target.closest('[data-t]'); if (b) { S.type = b.dataset.t; draw(box); } };
    $('#fn-dept', box).onchange = function () { S.dept = this.value; draw(box); };
    $('#fn-views', box).onclick = function (e) { var b = e.target.closest('[data-v]'); if (b) { S.view = b.dataset.v; draw(box); } };
    var tb = box.querySelector('table.fin-t tbody');
    tb.addEventListener('input', function (e) {
      var tr = e.target.closest('tr[data-id]'); if (!tr) return;
      var id = tr.dataset.id, l = ctx.data.lines.filter(function (x) { return x.id === id; })[0], used = usedMap(ctx.data.spend);
      var ed = S.edits[id] || { final: l.final_amount == null ? null : Number(l.final_amount), reason: l.final_reason || '', src: 'manual' };
      if (e.target.classList.contains('fin')) { var v = num(e.target.value); ed.final = v; ed.src = 'manual'; }
      else ed.reason = e.target.value;
      S.edits[id] = ed;
      var x = calc(ctx, l, used[id] || 0, ed, thr(ctx));
      $('[data-ch]', tr).innerHTML = chips(x); $('[data-frate]', tr).textContent = pctTxt(x.eff, x.base);
      var re = $('.fre', tr); re.classList.toggle('need', x.adjusted && !String(ed.reason || '').trim()); re.placeholder = x.adjusted ? '조정 사유 (필수)' : '';
      $('#fn-kpi', box).innerHTML = kpiHtml();
    });
    tb.addEventListener('focusout', function (e) { if (e.target.classList.contains('fin')) { var v = num(e.target.value); e.target.value = v == null ? '' : won(v); } });
    $('#fn-draft', box).onclick = function () { draftModal(box); };
    $('#fn-bal', box).onclick = function () { balanceModal(box); };
    $('#fn-reset', box).onclick = function () { S.edits = {}; draw(box); toast('저장하지 않은 변경을 취소했습니다.'); };
    $('#fn-save', box).onclick = function () { save(box); };
    $('#fn-exec', box).onclick = function () { if (guardSaved()) printExec(ctx); };
    $('#fn-xls', box).onclick = function () { if (guardSaved()) exportXlsx(ctx); };
    $('#fn-hist', box).onclick = function () { histModal(); };
  }
  function guardSaved() { if (dirtyIds().length) { toast('저장하지 않은 변경이 있습니다. 먼저 「변경 저장」을 눌러 주십시오.', 'err'); return false; } return true; }

  /* ───────── 저장 ───────── */
  function save(box) {
    var ids = dirtyIds(); if (!ids.length) return toast('저장할 변경이 없습니다.');
    var groups = { manual: [], auto: [] };
    ids.forEach(function (id) { var e = S.edits[id]; groups[e.src === 'auto' ? 'auto' : 'manual'].push({ id: id, final: e.final, reason: e.reason || '' }); });
    function call(items, src) { return items.length ? W.rpc('bgt_a_final_save', { p_token: CTX.token, p_year: CTX.year, p_items: items, p_src: src }) : Promise.resolve({ ok: true, changed: 0 }); }
    var btn = $('#fn-save', box); btn.disabled = true;
    call(groups.manual, 'manual').then(function (r1) {
      if (r1.ok === false) { btn.disabled = false; var names = (r1.lines || []).slice(0, 5).join('\n'); return W.confirmBox('조정 사유가 없는 항목이 있습니다. 사유를 입력한 뒤 다시 저장해 주십시오.\n\n' + names + ((r1.lines || []).length > 5 ? '\n외 ' + (r1.lines.length - 5) + '건' : ''), '확인'); }
      return call(groups.auto, 'auto').then(function (r2) {
        S.edits = {}; toast((r1.changed + r2.changed) + '건을 저장했습니다. 조정 이력이 기록되었습니다.'); CTX.refresh();
      });
    }).catch(function (e) { btn.disabled = false; fail(e); });
  }

  /* ───────── 자동 초안 · 균형 ───────── */
  function draftModal(box) {
    var ctx = CTX, p0 = thr(ctx);
    var m = W.modal({ title: '자동 초안 만들기', cls: 'wide', body: '<p class="muted">규칙으로 1차 확정안을 만듭니다. 결과는 미리 보기 후 화면에 채워지며, 검토·수정한 뒤 「변경 저장」을 눌러야 저장됩니다. 세입은 요구액 그대로 두고 검토 표시만 합니다.</p>' +
      '<ol class="fn-rules"><li>전년 대비 증감이 기준 이내인 항목은 <b>자동 승인</b>(확정안 = 요구액)</li><li>기준을 넘는 증가 항목은 <b>전년 + 기준% 또는 올해 실적·추정 중 큰 값</b>까지만 인정 (신규 항목은 검토 표시만)</li><li>부서 세출 한도를 넘으면 <b>증가분만 비례 삭감</b> (전년 수준까지는 보호)</li></ol>' +
      '<div class="form row"><label>증감 기준(%)<input id="dr-thr" class="in num" inputmode="numeric" value="' + p0 + '"></label><label class="chk-l"><input type="checkbox" id="dr-cap" checked> 부서 한도 비례 삭감 적용</label><button class="btn btn-secondary" id="dr-go" type="button">미리 보기</button></div><div id="dr-out"></div>',
      actions: [{ label: '닫기', cls: 'btn-ghost' }, { label: '화면에 채우기', cls: 'btn-primary', onClick: function (mm) {
        if (!m._res) return toast('먼저 「미리 보기」를 눌러 주십시오.', 'err');
        Object.keys(m._res.edits).forEach(function (id) { S.edits[id] = m._res.edits[id]; });
        mm.close(); S.view = 'adjusted'; draw(box); toast(Object.keys(m._res.edits).length + '건의 조정안을 채웠습니다. 검토 후 「변경 저장」을 누르십시오.');
      } }] });
    $('#dr-go', m.el).onclick = function () {
      var p = { thr: num($('#dr-thr', m.el).value) || p0, capCut: $('#dr-cap', m.el).checked };
      var res = autoDraft(ctx, p); m._res = res;
      var used = usedMap(ctx.data.spend), ids = Object.keys(res.edits), sum = 0;
      var trs = ids.map(function (id) {
        var l = ctx.data.lines.filter(function (x) { return x.id === id; })[0], e = res.edits[id]; sum += (Number(l.amount) || 0) - e.final;
        return '<tr><td class="nowrap">' + esc(l.dept) + '</td><td>' + esc(l.mok + ' ' + l.name) + '</td><td class="num">' + won(l.base_amount) + '</td><td class="num">' + won(l.amount) + '</td><td class="num"><b>' + won(e.final) + '</b></td><td>' + esc(e.reason) + '</td></tr>';
      }).join('');
      $('#dr-out', m.el).innerHTML = '<div class="kpis">' + kpi('자동 승인(세출)', res.stats.auto + '건') + kpi('검토 필요(세출)', res.stats.review + '건') + kpi('증가 조정', res.stats.trim + '건') + kpi('한도 삭감', res.stats.cap + '건') + kpi('줄어드는 세출', won(sum) + '원') + '</div>' +
        (res.stats.capLow.length ? '<div class="note warn">' + ico('alert', 16) + ' <span>한도가 전년 예산 합계보다 낮은 부서: ' + esc(res.stats.capLow.join(', ')) + ' — 자동으로 줄일 수 없어 수동 검토가 필요합니다.</span></div>' : '') +
        '<div class="tbl-wrap"><table class="bt"><thead><tr><th>부서</th><th>항목</th><th class="num">전년</th><th class="num">요구</th><th class="num">초안 확정</th><th>사유(자동)</th></tr></thead><tbody>' + (trs || '<tr><td colspan="6" class="muted" style="text-align:center;padding:16px">조정할 항목이 없습니다. 모든 항목이 자동 승인됩니다.</td></tr>') + '</tbody></table></div>';
    };
  }

  function balanceModal(box) {
    var ctx = CTX, used = usedMap(ctx.data.spend), t = thr(ctx);
    var a = effTotals(ctx, '세입'), b = effTotals(ctx, '세출'), gap = b.eff - a.eff;
    if (gap <= 0) return toast('세입 확정안이 세출 확정안 이상입니다. 균형 조정이 필요하지 않습니다.');
    var cands = ctx.data.lines.filter(function (l) { return l.type === '세출'; }).map(function (l) { var x = calc(ctx, l, used[l.id] || 0, S.edits[l.id], t); return { l: l, x: x, cut: x.eff - x.base }; }).filter(function (c) { return c.cut > 0; });
    var total = cands.reduce(function (s, c) { return s + c.cut; }, 0);
    var m = W.modal({ title: '세입·세출 균형', cls: 'wide', body: '<p>세출 확정안이 세입보다 <b>' + won(gap) + '원</b> 큽니다. 전년 예산 아래로는 줄이지 않고 <b>증가분(' + won(total) + '원)</b>에서만 줄입니다.</p>' +
      '<div class="form row"><label>방식<select id="bl-mode" class="in"><option value="focus">실적 과다 항목부터 집중 (증가분이 큰 순)</option><option value="prop">증가분 비례 (균등)</option></select></label><button class="btn btn-secondary" id="bl-go" type="button">미리 보기</button></div><div id="bl-out"></div>',
      actions: [{ label: '닫기', cls: 'btn-ghost' }, { label: '화면에 채우기', cls: 'btn-primary', onClick: function (mm) {
        if (!m._res) return toast('먼저 「미리 보기」를 눌러 주십시오.', 'err');
        m._res.forEach(function (r) { var old = S.edits[r.c.l.id]; S.edits[r.c.l.id] = { final: r.nf, src: 'auto', reason: (old && old.reason ? old.reason + ' / ' : '') + '세입·세출 균형 조정: 증가분 ' + won(r.cut) + '원 축소' }; });
        mm.close(); S.type = '세출'; S.view = 'adjusted'; draw(box); toast('균형 조정안을 채웠습니다. 검토 후 「변경 저장」을 누르십시오.');
      } }] });
    $('#bl-go', m.el).onclick = function () {
      var mode = $('#bl-mode', m.el).value, res = [], rest = gap;
      if (mode === 'focus') {
        cands.slice().sort(function (p, q) { return (q.x.over - p.x.over) || (q.cut - p.cut); }).forEach(function (c) {
          if (rest <= 0) return; var cut = Math.min(c.cut, ceil1000(rest)); res.push({ c: c, cut: cut, nf: c.x.eff - cut }); rest -= cut;
        });
      } else {
        var k = Math.min(1, gap / total);
        cands.forEach(function (c) { var cut = Math.min(c.cut, ceil1000(c.cut * k)); if (cut > 0) { res.push({ c: c, cut: cut, nf: c.x.eff - cut }); rest -= cut; } });
      }
      m._res = res; var cutSum = res.reduce(function (s, r) { return s + r.cut; }, 0);
      $('#bl-out', m.el).innerHTML = '<div class="kpis">' + kpi('줄이는 금액', won(cutSum) + '원') + kpi('남는 차이', (rest > 0 ? won(rest) + '원 (증가분만으로는 부족, 세입 증대·전년분 조정 필요)' : '해소')) + '</div>' +
        '<div class="tbl-wrap"><table class="bt"><thead><tr><th>부서</th><th>항목</th><th class="num">현재 확정</th><th class="num">조정</th><th class="num">축소</th><th></th></tr></thead><tbody>' +
        res.map(function (r) { return '<tr><td class="nowrap">' + esc(r.c.l.dept) + '</td><td>' + esc(r.c.l.mok + ' ' + r.c.l.name) + '</td><td class="num">' + won(r.c.x.eff) + '</td><td class="num"><b>' + won(r.nf) + '</b></td><td class="num">-' + won(r.cut) + '</td><td>' + (r.c.x.over ? '<span class="flag err">실적 과다</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    };
  }

  function histModal() {
    W.rpc('bgt_a_final_hist', { p_token: CTX.token, p_year: CTX.year, p_limit: 300 }).then(function (list) {
      var h = list.length ? '<div class="tbl-wrap"><table class="bt"><thead><tr><th>일시</th><th>부서</th><th>항목</th><th class="num">요구</th><th class="num">변경 전</th><th class="num">변경 후</th><th>구분</th><th>사유</th></tr></thead><tbody>' +
        list.map(function (r) { return '<tr><td class="nowrap">' + W.fmtDT(r.at) + '</td><td class="nowrap">' + esc(r.dept) + '</td><td>' + esc(r.mok + ' ' + r.name) + '</td><td class="num">' + won(r.requested) + '</td><td class="num">' + (r.old_final == null ? '-' : won(r.old_final)) + '</td><td class="num"><b>' + (r.new_final == null ? '해제' : won(r.new_final)) + '</b></td><td>' + (r.src === 'auto' ? '자동' : '직접') + '</td><td>' + esc(r.reason) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">조정 이력이 없습니다.</p>';
      W.modal({ title: '확정안 조정 이력 (최근 300건)', cls: 'wide', body: '<p class="muted">변경 전후 값이 서버에 영구 보관되며 수정·삭제할 수 없습니다.</p>' + h, actions: [{ label: '닫기', cls: 'btn-ghost' }] });
    }).catch(fail);
  }

  /* ───────── 엑셀 · 임원 보고서 ───────── */
  function allRows(ctx) {
    var used = usedMap(ctx.data.spend), t = thr(ctx), order = deptOrder(ctx);
    return ctx.data.lines.map(function (l) { return { l: l, x: calc(ctx, l, used[l.id] || 0, null, t) }; })
      .sort(function (p, q) { return (p.l.type === q.l.type ? 0 : p.l.type === '세입' ? -1 : 1) || (order.indexOf(p.l.dept) - order.indexOf(q.l.dept)) || W.cmpMok(p.l.mok, q.l.mok) || (p.l.sort - q.l.sort); });
  }
  function exportXlsx(ctx) {
    if (!window.XLSX || !XLSX.utils) return toast('엑셀 라이브러리를 불러오지 못했습니다.', 'err');
    var aoa = [['구분', '부서', '코드', '세부명칭', '전년 예산', '올해 집행', '연말 추정', '부서 요구', '확정안', '요구 증감(%)', '확정 증감(%)', '상태', '조정 사유']];
    allRows(ctx).forEach(function (r) {
      var l = r.l, x = r.x; aoa.push([l.type, l.dept, l.mok, l.name, x.base, x.used, l.forecast == null ? '' : Number(l.forecast), x.req, x.eff,
        x.base ? Math.round((x.req - x.base) * 1000 / x.base) / 10 : '', x.base ? Math.round((x.eff - x.base) * 1000 / x.base) / 10 : '',
        (x.isNew ? '신규 ' : x.review ? '검토필요 ' : '') + (x.over ? '실적과다 ' : '') + (x.adjusted ? '조정' : ''), l.final_reason || '']);
    });
    var ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = [6, 16, 8, 40, 14, 14, 14, 14, 14, 10, 10, 18, 50].map(function (w) { return { wch: w }; });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '확정안');
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = '예산_확정안_' + ctx.year + '.xlsx';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  function printExec(ctx) {
    var rows = allRows(ctx), t = thr(ctx), depts = deptOrder(ctx), e = esc;
    var tot = { 세입: effTotals(ctx, '세입'), 세출: effTotals(ctx, '세출') }, gap = tot.세입.eff - tot.세출.eff;
    var byD = {}; depts.forEach(function (d) { byD[d] = { base: 0, req: 0, eff: 0 }; });
    rows.forEach(function (r) { if (r.l.type !== '세출' || !byD[r.l.dept]) return; var o = byD[r.l.dept]; o.base += r.x.base; o.req += r.x.req; o.eff += r.x.eff; });
    var over = [];
    var deptRows = depts.filter(function (d) { return byD[d].req || byD[d].eff || byD[d].base; }).map(function (d) {
      var o = byD[d], cap = capOf(ctx, d, '세출'), ex = cap && o.eff > cap; if (ex) over.push(d + ' (' + won(o.eff - cap) + '원 초과)');
      return '<tr><td>' + e(d) + '</td><td class="r">' + won(o.base) + '</td><td class="r">' + won(o.req) + '</td><td class="r"><b>' + won(o.eff) + '</b></td><td class="r">' + pctTxt(o.eff, o.base) + '</td><td class="r">' + (cap ? won(cap) : '-') + '</td><td class="c">' + (cap ? (ex ? '초과' : '이내') : '-') + '</td></tr>';
    }).join('');
    var top = rows.filter(function (r) { return r.l.type === '세출'; }).map(function (r) { return { r: r, d: r.x.eff - r.x.base }; }).filter(function (o) { return o.d > 0; }).sort(function (p, q) { return q.d - p.d; }).slice(0, 10);
    var topRows = top.length ? top.map(function (o) { var l = o.r.l, x = o.r.x; return '<tr><td>' + e(l.dept) + '</td><td>' + e(l.name) + '</td><td class="r">' + won(x.base) + '</td><td class="r"><b>' + won(x.eff) + '</b></td><td class="r">+' + won(o.d) + '</td><td>' + e(l.final_reason || '') + '</td></tr>'; }).join('') : '<tr><td colspan="6" class="c">전년 대비 증액된 세출 항목이 없습니다.</td></tr>';
    var pend = rows.filter(function (r) { return r.x.review && !r.x.adjusted; }).length;
    var overs = rows.filter(function (r) { return r.x.over; }).map(function (r) { return { r: r, d: r.x.req - (r.x.actual || 0) }; }).sort(function (p, q) { return q.d - p.d; }).slice(0, 3);
    var res = rows.filter(function (r) { return r.l.type === '세출' && r.l.mok === '7.2.1'; }), resLeft = res.reduce(function (s, r) { return s + r.x.base - r.x.used; }, 0);
    var dec = [];
    dec.push(gap < 0 ? '세출 확정안이 세입 확정안보다 <b>' + won(-gap) + '원</b> 큼 — 세출 조정 또는 세입 증대 결정 필요' : '세입 확정안이 세출 확정안보다 ' + won(gap) + '원 여유');
    if (over.length) dec.push('부서 한도 초과(확정안 기준): ' + e(over.join(', ')));
    if (pend) dec.push('증감 기준 초과 항목 중 조정 없이 요구액 그대로인 건 <b>' + pend + '건</b> — 결정 필요');
    if (overs.length) dec.push('실적 대비 과다 요구 상위: ' + overs.map(function (o) { return e(o.r.l.dept + ' ' + o.r.l.name) + ' (요구 ' + won(o.r.x.req) + ' / 실적·추정 ' + won(o.r.x.actual || 0) + ')'; }).join('; '));
    dec.push('예비비(7.2.1) 올해 잔액 합계: <b>' + won(resLeft) + '원</b> (전년 예산 − 집행·결재 QR 예비비 사용)');
    var today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
    function sumRow(label, o) { return '<tr><td>' + label + '</td><td class="r">' + won(o.base) + '</td><td class="r">' + won(o.req) + '</td><td class="r"><b>' + won(o.eff) + '</b></td><td class="r">' + pctTxt(o.eff, o.req) + '</td><td class="r">' + pctTxt(o.eff, o.base) + '</td></tr>'; }
    var h = '<section class="pg xp"><h1>' + ctx.year + '년도 예산 확정안 보고</h1><p class="pg-sub">아세아항공직업전문학교 · 기획처 · 출력일 ' + e(today) + ' · 금액 단위 원</p>' +
      '<table class="pt"><thead><tr><th>구분</th><th>전년 예산</th><th>부서 요구</th><th>확정안</th><th>요구 대비</th><th>전년 대비</th></tr></thead><tbody>' + sumRow('세입', tot.세입) + sumRow('세출', tot.세출) +
      '<tr><td>세입 − 세출</td><td class="r">' + won(tot.세입.base - tot.세출.base) + '</td><td class="r">' + won(tot.세입.req - tot.세출.req) + '</td><td class="r"><b>' + won(gap) + '</b></td><td colspan="2"></td></tr></tbody></table>' +
      '<div class="xg"><div><h2>부서별 세출</h2><table class="pt"><thead><tr><th>부서</th><th>전년</th><th>요구</th><th>확정안</th><th>전년 대비</th><th>한도</th><th>대비</th></tr></thead><tbody>' + deptRows + '</tbody></table></div>' +
      '<div><h2>결정이 필요한 사항</h2><ol class="xd">' + dec.map(function (d) { return '<li>' + d + '</li>'; }).join('') + '</ol><h2>세출 증액 상위 10 (확정안 − 전년)</h2><table class="pt"><thead><tr><th>부서</th><th>항목</th><th>전년</th><th>확정안</th><th>증액</th><th>조정 사유</th></tr></thead><tbody>' + topRows + '</tbody></table></div></div>' +
      '<p class="pg-note">※ 확정안은 부서 요구액을 조정한 금액이며 조정 사유와 이력은 서버에 보관됩니다. 증감 기준 ' + t + '%.</p></section>';
    var root = document.getElementById('print-root');
    if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
    root.innerHTML = h; document.body.classList.add('is-printing');
    var done = function () { document.body.classList.remove('is-printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); setTimeout(function () { window.print(); }, 50);
  }

  window.BudgetFinal = { show: show, autoDraft: autoDraft, calc: calc };
})();
