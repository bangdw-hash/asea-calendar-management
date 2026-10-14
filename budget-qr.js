'use strict';
/**
 * budget-qr.js — 결재 QR 스캔 화면 (budget-qr.html?t=<토큰>)
 *  - 반영 전: 결재번호 입력 + 금액 확인 후 [반영] (로그인 불필요, 1회만)
 *  - 반영 후: 「이미 반영된 내역입니다」 + 현재 예산 · 집행 누계 · 잔액 · 집행 내역
 *  - 수정반영: 해당 QR의 부서 계정 또는 관리자 로그인 후, 사유를 적고 수정 (이력은 서버에 남음)
 *  서버 규칙은 db/budget_schema_5.sql (bgt_q_view / bgt_q_apply / bgt_q_reapply).
 */
(function () {
  var W = window.BW, $ = W.$, $$ = W.$$, esc = W.esc, won = W.won, num = W.num, ico = W.ico, toast = W.toast, T = window.BudgetTicket;
  var root = document.getElementById('app');
  var qr = new URLSearchParams(location.search).get('t') || '';
  var view = null, mode = 'view', notice = '', negOk = false, depts = null;

  function sessRestore() { try { var s = JSON.parse(sessionStorage.getItem('bgt_sess') || 'null'); if (s && s.token) { W.sess.role = s.role; W.sess.token = s.token; W.sess.dept = s.dept || ''; } } catch (e) {} }
  function sessSave() { try { sessionStorage.setItem('bgt_sess', JSON.stringify(W.sess)); } catch (e) {} }
  function sessClear() { W.sess.role = ''; W.sess.token = ''; W.sess.dept = ''; try { sessionStorage.removeItem('bgt_sess'); } catch (e) {} }
  function tok() { return W.sess.token || null; }
  function fail(e) { toast(e.message, 'err'); }
  function dstr(v) { return v ? String(v).slice(0, 10) : ''; }
  function today() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); }

  function head(sub) {
    return '<header class="top"><div class="brand"><span class="logo">' + ico('qr', 20) + '</span><div><div class="b-t">결재 집행 확인</div><div class="b-s">아세아항공직업전문학교' + (sub ? ' · ' + esc(sub) : '') + '</div></div></div>' +
      '<div class="top-r">' + (tok() ? '<span class="chip c-blue">' + (W.sess.role === 'admin' ? '관리자' : esc(W.sess.dept)) + ' 로그인</span><button class="btn btn-ghost btn-sm" id="q-out">' + ico('logout', 16) + ' 로그아웃</button>' : '') + '</div></header>';
  }
  function bindOut() { var b = $('#q-out', root); if (b) b.onclick = function () { W.rpc('bgt_logout', { p_token: tok() }).catch(function () {}); sessClear(); mode = 'view'; load(); }; }

  /* ───────── 불러오기 ───────── */
  function load() {
    if (!qr) { root.innerHTML = head() + '<main class="page"><div class="note err">' + ico('alert', 16) + ' QR 주소가 올바르지 않습니다. 기안문의 QR을 다시 스캔해 주십시오.</div></main>'; return; }
    root.innerHTML = head() + '<div class="loading">불러오는 중…</div>';
    W.rpc('bgt_q_view', { p_qr: qr, p_token: tok() }).then(function (r) {
      if (r.ok === false) { root.innerHTML = head() + '<main class="page"><div class="note err">' + ico('alert', 16) + ' 확인할 수 없는 QR입니다. 발급 부서에 문의해 주십시오.</div></main>'; return; }
      view = r; draw();
    }).catch(function (e) { root.innerHTML = head() + '<main class="page"><div class="note err">' + ico('alert', 16) + ' ' + esc(e.message) + '</div></main>'; });
  }

  /* ───────── 공통 조각 ───────── */
  function kpi(l, v, cls) { return '<div class="kpi ' + (cls || '') + '"><div class="kpi-l">' + l + '</div><div class="kpi-v sm">' + v + '</div></div>'; }
  function budgetBox(l, used, add) {
    var tg = l.target; if (!tg) return '<div class="muted qr-pend">귀속 미정 — 기획처가 부서·과목(또는 예비비)을 확정합니다. 확정 전에는 부서 집행 합계에 들어가지 않습니다.</div>';
    var after = used + add, bal = (Number(tg.budget) || 0) - after;
    return '<div class="bbox' + (bal < 0 ? ' neg' : '') + '"><div><span>현재 예산</span><b>' + won(tg.budget) + '</b></div><div><span>기존 집행</span><b data-u>' + won(used) + '</b></div><div><span>이번 집행</span><b data-a>' + won(add) + '</b></div><div><span>잔액</span><b data-b>' + won(bal) + '</b></div></div>';
  }
  function histHtml(l, canVendor) {
    var tg = l.target; if (!tg || !tg.hist || !tg.hist.length) return '';
    return '<details class="qr-hist"><summary>이 항목의 집행 내역 (' + tg.hist.length + '건' + (tg.hist.length >= 30 ? ' 이상, 최근 30건' : '') + ')</summary><div class="tbl-wrap"><table class="bt spt"><thead><tr><th>일자</th><th>적요</th>' + (canVendor ? '<th>거래처</th>' : '') + '<th>결재번호</th><th class="num">금액</th></tr></thead><tbody>' +
      tg.hist.map(function (h) { return '<tr><td class="nowrap">' + esc(dstr(h.on) || '-') + '</td><td>' + esc(h.memo) + '</td>' + (canVendor ? '<td>' + esc(h.vendor || '') + '</td>' : '') + '<td>' + esc(h.doc_no || '-') + '</td><td class="num">' + won(h.amount) + '</td></tr>'; }).join('') + '</tbody></table></div></details>';
  }

  /* ───────── 화면 ───────── */
  function draw() {
    var t = view.ticket, h = head(t.dept + ' 발급');
    h += '<main class="page qr-main"><section class="card"><div class="qr-ttl"><div><h3>' + esc(t.title) + '</h3><div class="muted">발급 부서 ' + esc(t.dept) + ' · 발급 ' + W.fmtDT(t.issued_at) + '</div></div>' + T.statusChip(t.status) + '</div>' +
      (notice ? '<div class="note ok">' + ico('check', 16) + ' ' + esc(notice) + '</div>' : '');
    if (t.status === 'void') h += '<div class="note err">' + ico('alert', 16) + ' 무효 처리된 QR입니다. 반영할 수 없습니다.' + (t.void_reason ? ' (사유: ' + esc(t.void_reason) + ')' : '') + '</div></section>';
    else if (t.status === 'issued') h += '<div class="note info">' + ico('check', 16) + ' <span>결재가 완료된 문서의 QR인지 확인한 뒤 결재(문서)번호를 입력하고 반영하십시오. 반영은 <b>한 번만</b> 가능하며, 이후 수정은 부서·관리자 로그인이 필요합니다.</span></div></section>' + formHtml(false);
    else if (mode === 'edit' && view.can_edit) h += '<div class="note info">' + ico('edit', 16) + ' <span>수정반영 중입니다. 결재번호 ' + esc(t.doc_no || '-') + ' · 반영 ' + W.fmtDT(t.applied_at) + '</span></div></section>' + formHtml(true);
    else h += appliedHtml();
    h += '</main>';
    root.oninput = null; root.innerHTML = h; notice = ''; bindOut();
    if (t.status === 'issued' || (t.status === 'applied' && mode === 'edit' && view.can_edit)) wireForm(t.status === 'applied');
    else if (t.status === 'applied') wireApplied();
  }

  /* 반영 / 수정반영 입력 */
  function formHtml(edit) {
    var t = view.ticket, lines = view.lines;
    // 수정 중에는 이 QR이 이미 넣은 금액을 빼고 계산합니다.
    var own = {}; if (edit) lines.forEach(function (l) { if (l.target) own[l.target.line_id] = (own[l.target.line_id] || 0) + (Number(l.applied) || 0); });
    var cards = lines.map(function (l, i) {
      var amt = edit ? (l.applied == null ? l.planned : l.applied) : l.planned, used = l.target ? (Number(l.target.used) || 0) - (own[l.target.line_id] || 0) : 0;
      return '<div class="card qr-line" data-id="' + l.id + '" data-lid="' + (l.target ? l.target.line_id : '') + '" data-budget="' + (l.target ? l.target.budget : 0) + '" data-used="' + used + '" data-plan="' + l.planned + '"><div class="ed-t">' + (i + 1) + '. ' + T.lineTitle(l) + '</div>' +
        budgetBox(l, used, amt) +
        '<div class="form row"><label>적요<input class="in" data-k="memo" value="' + esc(l.memo) + '"></label><label>집행일<input class="in" type="date" data-k="spent_on" value="' + esc(dstr(l.spent_on) || today()) + '"></label>' +
        '<label>금액(원) <span class="muted">결재 기준 ' + won(l.planned) + '</span><input class="in num money" data-k="amount" inputmode="numeric" value="' + won(amt) + '"></label></div></div>';
    }).join('');
    return '<section class="card"><div class="form"><label><span>결재(문서)번호 <b class="req">필수</b></span><input id="q-doc" class="in" maxlength="60" autocomplete="off" placeholder="예: 기획처-2026-0123" value="' + esc(edit ? (t.doc_no || '') : '') + '"></label></div></section>' + cards +
      '<section class="card"><p class="sum-line">합계 <b id="q-sum">0</b>원 <span class="muted" id="q-dif"></span></p><div id="q-rwrap" class="form' + (edit ? '' : ' hide') + '"><label><span id="q-rlab">사유 <b class="req">필수</b></span><textarea id="q-reason" class="in" rows="3" placeholder="' + (edit ? '무엇을 왜 고치는지 적어 주십시오. 변경 전후 값과 함께 서버 이력에 남습니다.' : '결재 기준액과 다르게 반영하거나 예산을 넘는 경우 사유를 적어 주십시오.') + '"></textarea></label></div>' +
      '<div class="acts"><button class="btn btn-primary block" id="q-go">' + ico('check', 16) + ' ' + (edit ? '수정반영' : '반영') + '</button>' + (edit ? '<button class="btn btn-ghost block" id="q-cancel" type="button">취소</button>' : '') + '</div>' +
      '<p class="muted">' + (edit ? '수정반영은 이 QR의 부서 또는 관리자만 할 수 있으며, 사유와 변경 전후 값이 삭제할 수 없는 이력으로 남습니다.' : '반영하면 해당 부서의 지출 기록에 즉시 들어갑니다. 귀속 미정 줄은 미배정으로 기록됩니다.') + '</p></section>';
  }
  function wireForm(edit) {
    var go = $('#q-go', root);
    function recalc() {
      var sum = 0, plan = 0, diff = false, neg = false, by = {};
      $$('.qr-line', root).forEach(function (c) {
        var a = num($('[data-k=amount]', c).value) || 0; sum += a; plan += Number(c.dataset.plan); if (a !== Number(c.dataset.plan)) diff = true;
        if (c.dataset.lid) by[c.dataset.lid] = (by[c.dataset.lid] || 0) + a;
      });
      $$('.qr-line', root).forEach(function (c) {
        if (!c.dataset.lid) return;
        var a = num($('[data-k=amount]', c).value) || 0, used = Number(c.dataset.used), bal = Number(c.dataset.budget) - used - by[c.dataset.lid];
        $('[data-a]', c).textContent = won(a); $('[data-b]', c).textContent = won(bal);
        var bx = $('.bbox', c); bx.classList.toggle('neg', bal < 0); if (bal < 0) neg = true;
      });
      $('#q-sum', root).textContent = won(sum);
      $('#q-dif', root).textContent = sum === plan ? '(결재 기준액과 같음)' : '(결재 기준액 ' + won(plan) + '원 대비 ' + (sum > plan ? '+' : '') + won(sum - plan) + '원)';
      if (!edit) $('#q-rwrap', root).classList.toggle('hide', !(diff || neg || negOk));
      return { diff: diff, neg: neg };
    }
    root.oninput = function (e) { if (e.target.dataset && e.target.dataset.k === 'amount') recalc(); };
    recalc();
    if (edit) $('#q-cancel', root).onclick = function () { mode = 'view'; draw(); };
    function submit() {
      var doc = $('#q-doc', root).value.trim(); if (!doc) { $('#q-doc', root).focus(); return toast('결재(문서)번호를 입력해 주십시오.', 'err'); }
      var st = recalc(), reason = $('#q-reason', root).value.trim();
      var lines = $$('.qr-line', root).map(function (c) { var o = { id: c.dataset.id }; $$('[data-k]', c).forEach(function (i) { o[i.dataset.k] = i.dataset.k === 'amount' ? num(i.value) : i.value; }); return o; });
      if (lines.some(function (l) { return l.amount == null || l.amount < 0; })) return toast('금액을 확인해 주십시오.', 'err');
      if ((edit || st.diff) && !reason) { $('#q-rwrap', root).classList.remove('hide'); $('#q-reason', root).focus(); return toast(edit ? '수정 사유를 입력해 주십시오.' : '결재 기준액과 다르게 반영하려면 사유가 필요합니다.', 'err'); }
      go.disabled = true;
      var args = { p_qr: qr, p_doc_no: doc, p_lines: lines, p_reason: reason, p_neg: negOk, p_token: tok() };
      var call = edit ? W.rpc('bgt_q_reapply', args) : W.rpc('bgt_q_apply', args);
      call.then(function (r) {
        go.disabled = false;
        if (r.ok === false) {
          if (r.error === 'NEGATIVE_CONFIRM') {
            return W.confirmBox('반영하면 예산을 넘는(마이너스) 항목이 있습니다.\n\n' + T.negText(r.negatives) + '\n\n이 상태로 반영하시겠습니까? 이 건은 기획처 「조정 필요」 목록에 표시됩니다.', '초과 반영', true).then(function (ok) {
              if (!ok) return; negOk = true; $('#q-rwrap', root).classList.remove('hide'); $('#q-rlab', root).innerHTML = '초과 반영 사유 <b class="req">필수</b>';
              if (!$('#q-reason', root).value.trim()) { $('#q-reason', root).focus(); return toast('초과 반영 사유를 입력한 뒤 다시 눌러 주십시오.', 'err'); }
              submit();
            });
          }
          if (r.view) { view = r.view; mode = 'view'; notice = ''; draw(); }
          return toast(W.errMsg(r.error), 'err');
        }
        negOk = false; view = r.view; mode = 'view'; notice = edit ? '수정반영했습니다. 변경 이력이 서버에 기록되었습니다.' : '반영되었습니다. 아래에서 반영 결과와 현재 예산·집행 현황을 확인하십시오.'; draw(); window.scrollTo(0, 0);
      }).catch(function (e) { go.disabled = false; fail(e); });
    }
    go.onclick = submit;
  }

  /* 반영 완료 화면 */
  function appliedHtml() {
    var t = view.ticket, full = view.viewer === 'dept' || view.viewer === 'admin', diff = Number(t.applied_total) !== Number(t.planned_total);
    var h = '<div class="note warn">' + ico('alert', 16) + ' <span><b>이미 반영된 내역입니다.</b> ' + W.fmtDT(t.applied_at) + ' · 결재번호 ' + esc(t.doc_no || '-') + '<br>중복 반영을 막기 위해 다시 반영할 수 없습니다. 수정이 필요하면 아래 [수정반영]을 이용하십시오.</span></div>' +
      '<div class="kpis">' + kpi('결재번호', esc(t.doc_no || '-')) + kpi('결재 기준액', won(t.planned_total) + '<small>원</small>') + kpi('반영액', won(t.applied_total) + '<small>원</small>', diff ? 'warnk' : '') + '</div>' +
      (diff ? '<div class="note warn">' + ico('alert', 16) + ' 반영액이 결재 기준액과 ' + won(Math.abs(t.applied_total - t.planned_total)) + '원 다릅니다.</div>' : '') + '</section>';
    view.lines.forEach(function (l, i) {
      var tg = l.target;
      h += '<section class="card qr-line"><div class="ed-t">' + (i + 1) + '. ' + T.lineTitle(l) + '</div><div class="qr-amt"><span class="muted">' + esc(l.memo || '') + (l.vendor ? ' · ' + esc(l.vendor) : '') + (l.spent_on ? ' · ' + esc(dstr(l.spent_on)) : '') + '</span><b>' + won(l.applied == null ? l.planned : l.applied) + '원</b></div>' +
        (tg ? '<div class="bbox' + (tg.budget - tg.used < 0 ? ' neg' : '') + '"><div><span>현재 예산</span><b>' + won(tg.budget) + '</b></div><div><span>집행 누계</span><b>' + won(tg.used) + '</b></div><div><span>잔액</span><b>' + won(tg.budget - tg.used) + '</b></div></div>' : '<div class="muted qr-pend">귀속 미정(미배정) — 기획처 확정 후 부서 집행에 반영됩니다.</div>') + histHtml(l, full) + '</section>';
    });
    h += '<section class="card"><div class="acts" id="q-act"></div><div id="q-login"></div></section>';
    return h;
  }
  function wireApplied() {
    var act = $('#q-act', root), box = $('#q-login', root), full = view.viewer === 'dept' || view.viewer === 'admin';
    var h = '';
    if (view.can_edit) h += '<button class="btn btn-primary" id="q-edit">' + ico('edit', 16) + ' 수정반영</button>';
    else if (view.viewer === 'other') h += '<div class="note warn">' + ico('alert', 16) + ' 로그인한 부서(' + esc(W.sess.dept) + ')는 이 QR의 관련 부서가 아닙니다. 해당 부서 또는 관리자로 로그인해야 수정할 수 있습니다.</div>';
    else h += '<button class="btn btn-primary" id="q-edit">' + ico('edit', 16) + ' 수정반영 (부서·관리자 로그인)</button>';
    if (full) h += '<button class="btn btn-secondary" id="q-ev">' + ico('list', 16) + ' 변경 이력</button>';
    if (view.viewer === 'other') h += '<button class="btn btn-secondary" id="q-relogin">다른 계정으로 로그인</button>';
    act.innerHTML = h;
    var ed = $('#q-edit', root);
    if (ed) ed.onclick = function () { if (view.can_edit) { mode = 'edit'; negOk = false; draw(); } else loginPanel(box); };
    var ev = $('#q-ev', root); if (ev) ev.onclick = function () { T.eventsModal(view, { token: tok() }); };
    var rl = $('#q-relogin', root); if (rl) rl.onclick = function () { loginPanel(box); };
  }

  /* 로그인 (수정반영용) */
  function loginPanel(box) {
    function render() {
      box.innerHTML = '<div class="form qr-login"><h4>수정반영을 위한 로그인</h4><p class="muted">이 QR을 발급했거나 관련된 부서의 비밀번호, 또는 예산관리자 비밀번호로 입장합니다.</p>' +
        '<label>구분<select id="ql-kind" class="in"><option value="dept">부서</option><option value="admin">예산관리자</option></select></label><label id="ql-dl">부서<select id="ql-dept" class="in">' + (depts || []).map(function (d) { return '<option' + (d.dept === view.ticket.dept ? ' selected' : '') + '>' + esc(d.dept) + '</option>'; }).join('') + '</select></label>' +
        '<label>비밀번호<input id="ql-pw" class="in" type="password" autocomplete="current-password"></label><button class="btn btn-primary" id="ql-go" type="button">로그인</button></div>';
      var kind = $('#ql-kind', box); kind.onchange = function () { $('#ql-dl', box).classList.toggle('hide', kind.value === 'admin'); };
      $('#ql-pw', box).onkeydown = function (e) { if (e.key === 'Enter') $('#ql-go', box).click(); };
      $('#ql-go', box).onclick = function () {
        var b = this, pw = $('#ql-pw', box).value; if (!pw) return toast('비밀번호를 입력해 주십시오.', 'err');
        b.disabled = true;
        (kind.value === 'admin' ? W.rpc('bgt_admin_login', { p_pw: pw }) : W.rpc('bgt_dept_login', { p_dept: $('#ql-dept', box).value, p_pw: pw })).then(function (r) {
          b.disabled = false;
          if (!r.ok) { var m = W.errMsg(r.error); if (r.error === 'BAD_PASSWORD') m += ' (남은 시도 ' + r.left + '회)'; if (r.error === 'LOCKED_OUT') m = '시도 횟수를 초과했습니다. ' + W.fmtDT(r.until) + ' 이후에 다시 시도하십시오.'; return toast(m, 'err'); }
          W.sess.role = kind.value === 'admin' ? 'admin' : 'dept'; W.sess.token = r.token; W.sess.dept = r.dept || ''; sessSave();
          W.rpc('bgt_q_view', { p_qr: qr, p_token: tok() }).then(function (v) {
            view = v;
            if (view.can_edit) { mode = 'edit'; negOk = false; } else { mode = 'view'; toast('이 QR을 수정할 수 있는 계정이 아닙니다.', 'err'); }
            draw();
          }).catch(fail);
        }).catch(function (e) { b.disabled = false; fail(e); });
      };
    }
    if (depts) return render();
    W.rpc('bgt_info').then(function (i) { depts = i.depts; render(); }).catch(fail);
  }

  W.setAuthLost(function () { sessClear(); mode = 'view'; toast('로그인이 만료되었습니다. 다시 로그인해 주십시오.', 'err'); load(); });
  T.moneyFmt(root);
  sessRestore();
  load();
})();
