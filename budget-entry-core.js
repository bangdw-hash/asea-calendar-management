'use strict';
/**
 * budget-entry-core.js — 부서 입력판 (BudgetEntry.mount)
 *  - 올해 집행(수납) / 내년 계획 × 세출 / 세입 건별 입력 → 「AI로 코드 매칭하기」 → 항목·지출에 자동 반영
 *  - 같은 부서 여러 명이 동시에 입력: 줄 단위 즉시 저장(2.5초) · 4초마다 변경 가져오기 · 입력 중 표시 · 버전 충돌 안내
 *  - 5분마다 자동 저장 · 저장 버튼 · 변경 이력(오른쪽 끝 「이력」)
 *  서버 규칙: db/budget_schema_9.sql
 */
(function () {
  var W = window.BW, $ = W.$, $$ = W.$$, esc = W.esc, won = W.won, num = W.num, ico = W.ico, toast = W.toast;
  var PH = { actual: '올해 집행', plan: '내년 계획' };
  var SRC = { none: ['미판정', 'gr'], ai: ['AI', 'ai'], manual: ['직접 선택', 'ok'], admin: ['기획처', 'ok'] };
  var KIND = { add: '입력', edit: '수정', code: '코드 변경', delete: '삭제' };
  var FIELD = { entry_date: '일자', memo: '내용', vendor: '거래처', amount: '금액', calc: '산출 근거', mok: '코드' };
  var tmpN = 0;

  function whoGet() { try { return localStorage.getItem('bgt_entry_who') || ''; } catch (e) { return ''; } }
  function whoSet(v) { try { localStorage.setItem('bgt_entry_who', v); } catch (e) {} }
  function hhmmss(d) { d = d || new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); }
  function todayStr() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); }

  function mount(root, o) {
    var S = {
      token: o.token, year: o.year, role: o.role || 'dept', dept: o.dept || '', depts: o.depts || [],
      phase: 'actual', type: '세출', only: false, rows: {}, codes: [], moks: { '세입': [], '세출': [] }, open: true, win: null,
      who: whoGet() || (o.role === 'admin' ? '기획처' : ''), asOf: null, locks: {}, online: [], saving: false, again: false, lastSaved: null, focusId: null, lastDate: todayStr(), dead: false, matching: false
    };
    var timers = {}, flushT = null;
    var admin = S.role === 'admin';
    function dp() { return admin ? (S.dept || null) : null; }
    function api(fn, args) { return W.rpc(fn, Object.assign({ p_token: S.token, p_year: S.year }, args)); }

    /* ── 코드 색인 ── */
    function indexCodes() {
      var g = {}, h = {};
      S.codes.forEach(function (c) { if (c.level === 'gwan') g[c.type + '|' + c.code] = c.name; if (c.level === 'hang') h[c.type + '|' + c.code] = c.name; });
      S.moks = { '세입': [], '세출': [] };
      S.codes.forEach(function (c) {
        if (c.level !== 'mok') return;
        var p = c.code.split('.');
        S.moks[c.type].push({ code: c.code, name: c.name, descr: c.descr, g: g[c.type + '|' + p[0]] || '', h: h[c.type + '|' + p[0] + '.' + p[1]] || '' });
      });
    }
    function mokName(type, code) { var l = S.moks[type] || []; for (var i = 0; i < l.length; i++) if (l[i].code === code) return l[i].name; return ''; }

    /* ── 표시용 ── */
    function list() {
      return Object.keys(S.rows).map(function (k) { return S.rows[k]; }).filter(function (r) { return !r._gone; })
        .sort(function (a, b) { return (a.dept || '').localeCompare(b.dept || '') || (Number(a.sort) - Number(b.sort)); });
    }
    function view() {
      return list().filter(function (r) {
        return r.phase === S.phase && r.type === S.type && (!admin || !S.dept || r.dept === S.dept) && (!S.only || !r.mok || r.needs_check);
      });
    }
    function canEdit() { return S.open; }
    function dirtyN() { return list().filter(function (r) { return r._tmp || (r._dirty && Object.keys(r._dirty).length); }).length; }

    function codeSelect(r, dis) {
      var cur = r.mok || '', gs = {}, order = [];
      (S.moks[r.type] || []).forEach(function (m) { var k = m.g + ' > ' + m.h; if (!gs[k]) { gs[k] = []; order.push(k); } gs[k].push(m); });
      return '<select class="in sm" data-f="mok"' + (dis ? ' disabled' : '') + ' aria-label="예산 코드(목)"><option value="">코드 미판정</option>' +
        order.map(function (k) { return '<optgroup label="' + esc(k) + '">' + gs[k].map(function (m) { return '<option value="' + m.code + '"' + (m.code === cur ? ' selected' : '') + '>' + esc(m.code + ' ' + m.name) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select>';
    }
    function badge(r) {
      if (!r.mok) return '<span class="eb gr">미판정</span>';
      if (r.needs_check) return '<span class="eb wa" title="' + esc(r.ai_why || '') + '">확인 필요' + (r.ai_conf != null ? ' ' + r.ai_conf + '%' : '') + '</span>';
      if (r.code_src === 'ai') return '<span class="eb ai" title="' + esc(r.ai_why || '') + '">AI ' + (r.ai_conf != null ? r.ai_conf + '%' : '') + '</span>';
      return '<span class="eb ok">' + (SRC[r.code_src] || SRC.manual)[0] + '</span>';
    }
    function val(r, f) { return r._dirty && f in r._dirty ? r._dirty[f] : r[f]; }
    function trHtml(r, idx) {
      var lockedBy = S.locks[r.id], dis = !canEdit() || !!lockedBy, d = r._dirty && Object.keys(r._dirty).length;
      var amt = val(r, 'amount');
      var cells = '<td class="en">' + (idx + 1) + '</td>' + (admin && !S.dept ? '<td class="ed">' + esc(r.dept) + '</td>' : '');
      if (r.phase === 'actual') {
        cells += '<td><input class="in sm" type="date" data-f="entry_date" value="' + esc(String(val(r, 'entry_date') || '').slice(0, 10)) + '"' + (dis ? ' disabled' : '') + '></td>' +
          '<td><input class="in sm" data-f="memo" value="' + esc(val(r, 'memo')) + '" maxlength="300"' + (dis ? ' disabled' : '') + '></td>' +
          '<td><input class="in sm" data-f="vendor" value="' + esc(val(r, 'vendor')) + '" maxlength="120"' + (dis ? ' disabled' : '') + '></td>';
      } else {
        cells += '<td><input class="in sm" data-f="memo" value="' + esc(val(r, 'memo')) + '" maxlength="300"' + (dis ? ' disabled' : '') + '></td>' +
          '<td><input class="in sm" data-f="calc" value="' + esc(val(r, 'calc')) + '" maxlength="300" placeholder="예: 100,000원 × 12회"' + (dis ? ' disabled' : '') + '></td>';
      }
      cells += '<td><input class="in sm num" data-f="amount" inputmode="numeric" value="' + (amt ? won(amt) : '') + '"' + (dis ? ' disabled' : '') + '></td>' +
        '<td class="ec">' + codeSelect(Object.assign({}, r, { mok: val(r, 'mok') }), dis) + ' ' + badge(r) + (r.ai_why && r.code_src === 'ai' ? '<div class="ewhy">' + esc(r.ai_why) + '</div>' : '') +
        (r.needs_check && r.ai_alt && r.ai_alt.length ? '<div class="ewhy">대안: ' + r.ai_alt.map(function (m) { return '<button class="lnk alt" type="button" data-alt="' + esc(m) + '">' + esc(m + ' ' + mokName(r.type, m)) + '</button>'; }).join(' · ') + '</div>' : '') + '</td>' +
        '<td class="eh">' + (lockedBy ? '<span class="eb lk">' + esc(lockedBy) + ' 입력 중</span> ' : '') +
        (r.hist_n ? '<button class="lnk" type="button" data-act="hist" title="변경 이력 ' + r.hist_n + '건">이력 ' + r.hist_n + '</button>' : '') +
        (canEdit() ? ' <button class="icon-btn danger" type="button" data-act="del" aria-label="삭제" title="삭제">' + ico('trash', 16) + '</button>' : '') + '</td>';
      var conf = r._conf ? '<tr class="econf" data-cf="' + r.id + '"><td colspan="9">' + ico('alert', 14) + ' 다른 사람이 먼저 이 줄을 고쳤습니다. <button class="btn btn-secondary btn-sm" data-act="cf-server" type="button">상대 입력 사용</button> <button class="btn btn-primary btn-sm" data-act="cf-mine" type="button">내 입력으로 덮어쓰기</button></td></tr>' : '';
      return '<tr class="er' + (d || r._tmp ? ' dirty' : '') + (lockedBy ? ' locked' : '') + (r.needs_check || !r.mok ? ' chk' : '') + '" data-id="' + r.id + '">' + cells + '</tr>' + conf;
    }

    /* ── 전체 화면 ── */
    function addRowHtml() {
      var dis = !canEdit() || (admin && !S.dept);
      if (S.phase === 'actual') return '<tr class="eadd"><td class="en">+</td>' + (admin && !S.dept ? '<td></td>' : '') +
        '<td><input class="in sm" type="date" id="ea-date" value="' + esc(S.lastDate) + '"' + (dis ? ' disabled' : '') + '></td><td><input class="in sm" id="ea-memo" placeholder="무엇에 썼나요 (적요)" maxlength="300"' + (dis ? ' disabled' : '') + '></td>' +
        '<td><input class="in sm" id="ea-vendor" placeholder="거래처" maxlength="120"' + (dis ? ' disabled' : '') + '></td><td><input class="in sm num" id="ea-amount" inputmode="numeric" placeholder="금액"' + (dis ? ' disabled' : '') + '></td>' +
        '<td colspan="2"><button class="btn btn-primary btn-sm" id="ea-add" type="button"' + (dis ? ' disabled' : '') + '>추가 (Enter)</button></td></tr>';
      return '<tr class="eadd"><td class="en">+</td>' + (admin && !S.dept ? '<td></td>' : '') +
        '<td><input class="in sm" id="ea-memo" placeholder="계획 내용 (세부명칭)" maxlength="300"' + (dis ? ' disabled' : '') + '></td><td><input class="in sm" id="ea-calc" placeholder="산출 근거 (예: 100,000원 × 12회)" maxlength="300"' + (dis ? ' disabled' : '') + '></td>' +
        '<td><input class="in sm num" id="ea-amount" inputmode="numeric" placeholder="금액"' + (dis ? ' disabled' : '') + '></td><td colspan="2"><button class="btn btn-primary btn-sm" id="ea-add" type="button"' + (dis ? ' disabled' : '') + '>추가 (Enter)</button></td></tr>';
    }
    function heads() {
      var h = admin && !S.dept ? '<th style="width:110px">부서</th>' : '';
      return '<tr><th class="en" style="width:34px">#</th>' + h + (S.phase === 'actual' ? '<th style="width:128px">일자</th><th>적요</th><th style="width:130px">거래처</th>' : '<th>내용(세부명칭)</th><th style="width:230px">산출 근거</th>') +
        '<th class="num" style="width:112px">금액(원)</th><th style="width:262px">예산 코드(목)</th><th style="width:96px"></th></tr>';
    }
    function counts() {
      var all = list().filter(function (r) { return !admin || !S.dept || r.dept === S.dept; });
      var c = { n: all.length, none: 0, chk: 0 }; all.forEach(function (r) { if (!r.mok) c.none++; else if (r.needs_check) c.chk++; });
      var cur = view(), sum = cur.reduce(function (s, r) { return s + (Number(val(r, 'amount')) || 0); }, 0);
      return { c: c, sum: sum, n: cur.length };
    }
    function draw() {
      var p = counts(), dis = !canEdit();
      var h = '<div class="eb-wrap">' +
        (dis ? '<div class="note warn">' + ico('lock', 16) + ' <span>지금은 입력할 수 없는 기간입니다.' + (S.win && (S.win.open_at || S.win.close_at) ? ' 입력 가능 기간: ' + (S.win.open_at ? W.fmtDT(S.win.open_at) : '') + ' ~ ' + (S.win.close_at ? W.fmtDT(S.win.close_at) : '') : '') + ' 내용은 조회만 가능합니다.' + (o.testUrl ? ' <a href="' + esc(o.testUrl) + '">시험용 주소</a>에서는 연습으로 입력해 볼 수 있습니다.' : '') + '</span></div>' : '') +
        '<div class="etabs"><div class="ws-tabs" id="e-ph">' + ['actual', 'plan'].map(function (k) { return '<button class="ws-tab' + (S.phase === k ? ' on' : '') + '" data-ph="' + k + '">' + PH[k] + '</button>'; }).join('') + '</div>' +
        '<div class="ws-tabs sub" id="e-ty">' + ['세출', '세입'].map(function (k) { return '<button class="ws-tab' + (S.type === k ? ' on' : '') + '" data-ty="' + k + '">' + k + '</button>'; }).join('') + '</div></div>' +
        '<p class="muted etip">' + (S.phase === 'actual' ? '올해 실제로 ' + (S.type === '세출' ? '쓴' : '받은') + ' 내역을 한 줄에 한 건씩 적습니다. 코드는 적지 않아도 됩니다. 다 적은 뒤 「AI로 코드 매칭하기」를 누르십시오.' : '내년에 쓸(받을) 계획을 한 줄에 하나씩 적습니다. 코드는 적지 않아도 됩니다. 다 적은 뒤 「AI로 코드 매칭하기」를 누르십시오.') + '</p>' +
        '<div class="etool"><div class="acts"><button class="btn btn-primary" id="e-ai" type="button"' + (dis ? ' disabled' : '') + '>' + ico('check', 16) + ' AI로 코드 매칭하기' + (p.c.none ? ' <span class="cnt hot">' + p.c.none + '</span>' : '') + '</button>' +
        '<button class="btn btn-secondary" id="e-qa" type="button">코드 질문하기</button><button class="btn btn-secondary" id="e-xl" type="button">' + ico('download', 16) + ' 양식 받기</button>' +
        '<button class="btn btn-secondary" id="e-up" type="button"' + (dis ? ' disabled' : '') + '>' + ico('plus', 16) + ' 엑셀 올리기</button><input type="file" id="e-file" accept=".xlsx,.xls" hidden></div>' +
        '<div class="acts"><span class="muted" id="e-stat"></span><button class="btn btn-primary" id="e-save" type="button"' + (dis ? ' disabled' : '') + '>저장</button></div></div>' +
        '<div class="esum"><span>이 화면 <b>' + p.n + '건</b></span><span>합계 <b>' + won(p.sum) + '원</b></span><span>미판정 <b class="' + (p.c.none ? 'neg' : '') + '">' + p.c.none + '</b></span><span>확인 필요 <b class="' + (p.c.chk ? 'warn' : '') + '">' + p.c.chk + '</b></span>' +
        '<label class="inl"><input type="checkbox" id="e-only"' + (S.only ? ' checked' : '') + '> 확인 필요·미판정만 보기</label>' +
        '<span class="eonline" id="e-online"></span></div>' +
        '<div class="tbl-wrap"><table class="bt etbl"><thead>' + heads() + '</thead><tbody id="e-body">' + addRowHtml() + view().map(trHtml).join('') + '</tbody></table></div>' +
        (view().length ? '' : '<div class="empty small"><p>입력한 내용이 없습니다. 위 줄에 첫 내용을 적고 Enter를 누르십시오.</p></div>') + '<div id="e-codesum"></div></div>';
      root.innerHTML = h;
      updStat(); updOnline(); updCodeSum();
    }
    function redrawBody() {
      var b = $('#e-body', root); if (!b) return draw();
      var act = document.activeElement, keep = act && act.id && act.id.indexOf('ea-') === 0 ? { id: act.id, v: act.value } : null;
      var vals = {}; $$('.eadd input', root).forEach(function (i) { vals[i.id] = i.value; });
      b.innerHTML = addRowHtml() + view().map(trHtml).join('');
      $$('.eadd input', root).forEach(function (i) { if (vals[i.id] != null && i.id !== 'ea-date') i.value = vals[i.id]; else if (i.id === 'ea-date' && vals[i.id]) i.value = vals[i.id]; });
      if (keep) { var e2 = $('#' + keep.id, root); if (e2) e2.focus(); }
      updCodeSum();
    }
    function patchRow(id) {
      var r = S.rows[id], tr = root.querySelector('tr.er[data-id="' + id + '"]');
      if (!tr) return redrawBody();
      if (!r || r._gone) { var cf0 = root.querySelector('tr.econf[data-cf="' + id + '"]'); if (cf0) cf0.remove(); tr.remove(); return; }
      var idx = Array.prototype.indexOf.call($('#e-body', root).querySelectorAll('tr.er'), tr);
      var cf = root.querySelector('tr.econf[data-cf="' + id + '"]'); if (cf) cf.remove();
      var tmp = document.createElement('tbody'); tmp.innerHTML = trHtml(r, idx);
      tr.replaceWith.apply(tr, Array.prototype.slice.call(tmp.children)); updCodeSum();
    }
    // 코드별 합계: 같은 코드의 여러 줄은 한 항목으로 합쳐 예산에 반영됩니다. 그 결과를 미리 보여 줍니다.
    function updCodeSum() {
      var el = $('#e-codesum', root); if (!el) return;
      var g = {};
      list().forEach(function (r) {
        if (r.type !== S.type || !r.mok || (admin && S.dept && r.dept !== S.dept)) return;
        var k = (admin && !S.dept ? r.dept + '|' : '') + r.mok, o = g[k] || (g[k] = { dept: r.dept, mok: r.mok, a: 0, an: 0, p: 0, pn: 0 });
        var amt = Number(val(r, 'amount')) || 0; if (r.phase === 'actual') { o.a += amt; o.an++; } else { o.p += amt; o.pn++; }
      });
      var keys = Object.keys(g).sort(function (x, y) { return W.cmpMok(g[x].mok, g[y].mok); });
      if (!keys.length) { el.innerHTML = ''; return; }
      var ta = 0, tp = 0;
      el.innerHTML = '<div class="ecs"><div class="ecs-h"><b>코드별 합계</b> <span class="muted">같은 코드로 적은 줄은 한 항목으로 합쳐 예산에 반영됩니다. 코드는 정해진 코드표 안에서만 움직입니다.</span></div><div class="tbl-wrap"><table class="bt ecs-t"><thead><tr>' + (admin && !S.dept ? '<th>부서</th>' : '') +
        '<th>코드(목)</th><th class="num">올해 ' + (S.type === '세출' ? '집행' : '수납') + ' 건수</th><th class="num">올해 합계(원)</th><th class="num">내년 계획 건수</th><th class="num">내년 합계(원)</th></tr></thead><tbody>' + keys.map(function (k) {
          var o = g[k]; ta += o.a; tp += o.p;
          return '<tr>' + (admin && !S.dept ? '<td>' + esc(o.dept) + '</td>' : '') + '<td><span class="code">' + esc(o.mok) + '</span> ' + esc(mokName(S.type, o.mok)) + '</td><td class="num">' + o.an + '</td><td class="num">' + (o.an ? won(o.a) : '-') + '</td><td class="num">' + o.pn + '</td><td class="num">' + (o.pn ? won(o.p) : '-') + '</td></tr>'; }).join('') +
        '<tr class="ecs-tot"><td' + (admin && !S.dept ? ' colspan="2"' : '') + '><b>합계</b></td><td></td><td class="num"><b>' + won(ta) + '</b></td><td></td><td class="num"><b>' + won(tp) + '</b></td></tr></tbody></table></div></div>';
    }
    function updStat() {
      var el = $('#e-stat', root); if (!el) return;
      var n = dirtyN();
      el.textContent = S.saving ? '저장 중…' : n ? '변경 ' + n + '건 (곧 자동 저장)' : S.lastSaved ? '모두 저장됨 ' + hhmmss(S.lastSaved) : '실시간 공유 중 · 5분마다 자동 저장';
      el.className = 'muted' + (n ? ' warn' : '');
    }
    function updOnline() {
      var el = $('#e-online', root); if (!el) return;
      el.innerHTML = S.online.length ? '지금 접속: ' + S.online.map(function (n) { return '<span class="eb ok">' + esc(n) + (n === S.who ? ' (나)' : '') + '</span>'; }).join(' ') : '';
    }

    /* ── 저장 ── */
    function pendingItems() {
      var items = [], refs = [];
      list().forEach(function (r) {
        if (r._tmp) {
          var it = { phase: r.phase, type: r.type, entry_date: r.entry_date || null, memo: r.memo, vendor: r.vendor, amount: r.amount, calc: r.calc, mok: r.mok || '' };
          if (admin) it.dept = r.dept; items.push(it); refs.push({ r: r, snap: Object.assign({}, it) });
        } else if (r._dirty && Object.keys(r._dirty).length && !r._conf) {
          var it2 = Object.assign({ id: r.id, ver: r.ver }, r._dirty); if (admin) it2.dept = r.dept; items.push(it2); refs.push({ r: r, snap: Object.assign({}, r._dirty) });
        }
      });
      return { items: items, refs: refs };
    }
    function flush() {
      clearTimeout(flushT); flushT = null;
      if (S.dead) return Promise.resolve();
      if (S.saving) { S.again = true; return Promise.resolve(); }
      var p = pendingItems(); if (!p.items.length) { updStat(); return Promise.resolve(); }
      S.saving = true; updStat();
      return api('bgt_e_save', { p_dept: dp(), p_items: p.items, p_who: S.who }).then(function (res) {
        var conf = {}; (res.conflicts || []).forEach(function (c) { conf[c.id] = c; });
        var ri = 0, touched = [];
        p.refs.forEach(function (ref) {
          var r = ref.r;
          if (!r._tmp && conf[r.id]) { r._conf = conf[r.id]; touched.push(r.id); return; }
          var srv = res.rows[ri++]; if (!srv) return;
          if (r._tmp) { delete S.rows[r.id]; srv._dirty = null; S.rows[srv.id] = srv; ref.newId = srv.id; touched.push('*'); }
          else {
            Object.keys(ref.snap).forEach(function (k) { if (r._dirty && String(r._dirty[k]) === String(ref.snap[k])) delete r._dirty[k]; });
            var keepD = r._dirty; Object.assign(r, srv); r._dirty = keepD && Object.keys(keepD).length ? keepD : null; touched.push(r.id);
          }
        });
        S.lastSaved = new Date(); S.saving = false;
        if (touched.indexOf('*') >= 0) redrawBody(); else touched.forEach(patchRow);
        updStat();
        if (S.again || pendingItems().items.length) { S.again = false; scheduleFlush(600); }
      }).catch(function (e) {
        S.saving = false; updStat();
        if (e.code === 'PERIOD_CLOSED') { S.open = false; draw(); }
        toast(e.message, 'err');
      });
    }
    function scheduleFlush(ms) { clearTimeout(flushT); flushT = setTimeout(flush, ms == null ? 2500 : ms); updStat(); }

    /* ── 줄 추가 · 수정 · 삭제 ── */
    function newTmp(type, phase, f) {
      var id = 't' + (++tmpN) + '_' + Date.now();
      var r = Object.assign({ id: id, _tmp: true, phase: phase, type: type, dept: S.dept || '', entry_date: null, memo: '', vendor: '', amount: 0, calc: '', mok: '', code_src: 'none', needs_check: false, hist_n: 0, ver: 0, sort: Date.now() * 1000 + tmpN }, f || {});
      S.rows[id] = r; return r;
    }
    function addFromInputs() {
      if (!canEdit()) return;
      if (admin && !S.dept) return toast('부서를 먼저 선택해 주십시오.', 'err');
      var g = function (id) { var e = $('#' + id, root); return e ? e.value.trim() : ''; };
      var f = { memo: g('ea-memo'), amount: num(g('ea-amount')) || 0 };
      if (S.phase === 'actual') { f.entry_date = g('ea-date') || null; f.vendor = g('ea-vendor'); if (f.entry_date) S.lastDate = f.entry_date; } else f.calc = g('ea-calc');
      if (!f.memo && !f.amount) return toast('내용이나 금액을 입력해 주십시오.', 'err');
      newTmp(S.type, S.phase, f);
      ['ea-memo', 'ea-vendor', 'ea-calc', 'ea-amount'].forEach(function (id) { var e = $('#' + id, root); if (e) e.value = ''; });
      redrawBody(); var m = $('#ea-memo', root); if (m) m.focus();
      flush();
    }
    function addMany(items, qtype, qphase) {
      var n = 0;
      items.forEach(function (it) { newTmp(it.type || qtype || S.type, it.phase || qphase || S.phase, it); n++; });
      redrawBody(); return flush().then(function () { return n; });
    }
    function setDirty(r, f, v) {
      if (!r._dirty) r._dirty = {};
      if (String(r[f] == null ? '' : r[f]) === String(v == null ? '' : v) && !r._tmp) delete r._dirty[f]; else r._dirty[f] = v;
      if (r._tmp) r[f] = v;
    }
    function remove(id) {
      var r = S.rows[id]; if (!r) return;
      if (r._tmp) { delete S.rows[id]; return redrawBody(); }
      W.confirmBox('이 줄을 삭제하시겠습니까?\n삭제한 내용은 이력에 남습니다.' + (r.mok ? '\n이미 반영된 지출·항목에서도 빠집니다.' : ''), '삭제', true).then(function (ok) {
        if (!ok) return;
        api('bgt_e_delete', { p_dept: dp(), p_ids: [id], p_who: S.who }).then(function () { r._gone = true; patchRow(id); updStat(); S.lastSaved = new Date(); }).catch(function (e) { toast(e.message, 'err'); });
      });
    }
    function histModal(id) {
      W.rpc('bgt_e_hist', { p_token: S.token, p_id: id }).then(function (rows) {
        var fmt = function (o) { return o ? Object.keys(o).map(function (k) { return (FIELD[k] || k) + ' ' + (k === 'amount' && o[k] != null ? won(o[k]) : (o[k] == null || o[k] === '' ? '(비움)' : (k === 'mok' ? o[k] + ' ' + mokName((S.rows[id] || {}).type, o[k]) : o[k]))); }).join(' · ') : ''; };
        W.modal({ title: '변경 이력', body: rows.length ? '<div class="tbl-wrap"><table class="bt"><thead><tr><th>시각</th><th>구분</th><th>변경자</th><th>내용</th></tr></thead><tbody>' + rows.map(function (h) {
          return '<tr><td class="nowrap">' + esc(W.fmtDT(h.at)) + '</td><td>' + esc(KIND[h.kind] || h.kind) + '</td><td>' + esc(h.actor) + '</td><td>' + (h.kind === 'add' ? '입력' : h.kind === 'delete' ? '삭제' : esc(fmt(h.old)) + ' → ' + esc(fmt(h.new))) + (h.note ? '<div class="muted">' + esc(h.note) + '</div>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="muted">이력이 없습니다.</p>', cls: 'wide', actions: [{ label: '닫기', cls: 'btn-ghost' }] });
      }).catch(function (e) { toast(e.message, 'err'); });
    }

    /* ── 입력 중 표시(줄 잠금) ── */
    function lockOn(id) {
      var r = S.rows[id]; if (!r || r._tmp || !S.who) return;
      S.focusId = id; W.rpc('bgt_e_lock', { p_token: S.token, p_year: S.year, p_dept: dp(), p_id: id, p_who: S.who, p_on: true }).catch(function () {});
    }
    function lockOff(id) {
      if (!id) return; if (S.focusId === id) S.focusId = null;
      var r = S.rows[id]; if (!r || r._tmp || !S.who) return;
      W.rpc('bgt_e_lock', { p_token: S.token, p_year: S.year, p_dept: dp(), p_id: id, p_who: S.who, p_on: false }).catch(function () {});
    }

    /* ── 변경 가져오기(4초) ── */
    function poll() {
      if (S.dead || S.saving) return;
      api('bgt_e_changes', { p_dept: dp(), p_since: S.asOf, p_who: S.who }).then(function (r) {
        if (S.dead) return;
        var redraw = false, ids = [];
        (r.rows || []).forEach(function (srv) {
          var loc = S.rows[srv.id];
          if (srv.gone) { if (loc && !loc._tmp) { loc._gone = true; ids.push(srv.id); } return; }
          if (!loc) { S.rows[srv.id] = srv; if (srv.phase === S.phase && srv.type === S.type) redraw = true; return; }
          if ((loc._dirty && Object.keys(loc._dirty).length) || S.focusId === srv.id) { if (srv.ver > loc.ver) { loc._srv = srv; } return; }
          if (srv.ver !== loc.ver || srv.hist_n !== loc.hist_n) { S.rows[srv.id] = Object.assign(srv, { _dirty: null }); ids.push(srv.id); }
        });
        var lk = {}; (r.locks || []).forEach(function (l) { lk[l.id] = l.by; });
        Object.keys(Object.assign({}, S.locks, lk)).forEach(function (id) { if (S.locks[id] !== lk[id]) { S.locks[id] = lk[id]; if (!lk[id]) delete S.locks[id]; ids.push(id); } });
        S.online = r.online || []; S.asOf = new Date(new Date(r.as_of).getTime() - 1500).toISOString();
        if (r.open !== S.open) { S.open = r.open; draw(); return; }
        if (redraw) redrawBody(); else ids.forEach(function (id) { if (S.focusId !== id) patchRow(id); });
        updOnline();
        var c = counts(); var aiBtn = $('#e-ai .cnt', root); if (aiBtn && !c.c.none) aiBtn.remove();
      }).catch(function () {});
    }

    /* ── AI 코드 매칭 · Q&A ── */
    function runMatch(all) {
      if (S.matching) return;
      var target = list().filter(function (r) { return !r._tmp && (!admin || !S.dept || r.dept === S.dept) && (all ? r.code_src !== 'manual' && r.code_src !== 'admin' : !r.mok); });
      if (!target.length) return toast(all ? '다시 매칭할 줄이 없습니다.' : '코드가 비어 있는 줄이 없습니다. (직접 고른 코드는 바꾸지 않습니다.)', 'ok');
      S.matching = true; var btn = $('#e-ai', root); if (btn) btn.disabled = true;
      flush().then(function () {
        var done = 0, byDept = {};
        target.forEach(function (r) { (byDept[r.dept] = byDept[r.dept] || []).push(r); });
        var chain = Promise.resolve();
        Object.keys(byDept).forEach(function (d) {
          for (var i = 0; i < byDept[d].length; i += 25) (function (chunk) {
            chain = chain.then(function () {
              toast('AI가 코드를 찾는 중… (' + done + '/' + target.length + ')');
              return BudgetEntryAI.match({ token: S.token, year: S.year, dept: d }, chunk).then(function (results) {
                return W.rpc('bgt_e_code_apply', { p_token: S.token, p_year: S.year, p_dept: admin ? d : null, p_items: results, p_who: S.who });
              }).then(function (res) { (res.rows || []).forEach(function (srv) { S.rows[srv.id] = srv; }); done += chunk.length; });
            });
          })(byDept[d].slice(i, i + 25));
        });
        return chain.then(function () { toast('AI 코드 매칭을 마쳤습니다 (' + done + '건). 「확인 필요」 표시가 있는 줄을 확인하십시오.'); });
      }).catch(function (e) { toast(e.message, 'err'); }).then(function () { S.matching = false; S.lastSaved = new Date(); draw(); });
    }
    function qaModal() {
      var m = W.modal({ title: '코드 질문하기', cls: 'wide', body: '<p class="muted">어떤 목적으로 쓰려는지 적으면 알맞은 예산 코드를 알려 드립니다. 예) 학생 행사 다과비는 어떤 코드인가요?</p>' +
        '<div class="form"><label>질문<textarea id="qa-q" class="in" rows="3" maxlength="500" placeholder="예: 외부 강사를 불러 특강을 하고 사례비를 주려는데 어떤 코드인가요?"></textarea></label></div><div class="acts"><button class="btn btn-primary" id="qa-go" type="button">물어보기</button></div><div id="qa-out"></div>',
        actions: [{ label: '닫기', cls: 'btn-ghost' }] });
      var out = $('#qa-out', m.el);
      $('#qa-go', m.el).onclick = function () {
        var q = $('#qa-q', m.el).value.trim(); if (!q) return toast('질문을 입력해 주십시오.', 'err');
        var b = this; b.disabled = true; out.innerHTML = '<div class="loading">AI가 찾는 중…</div>';
        BudgetEntryAI.ask({ token: S.token, year: S.year, dept: S.dept || null }, q).then(function (r) {
          b.disabled = false;
          out.innerHTML = '<div class="note info">' + ico('check', 16) + ' <span>' + esc(r.answer || '') + '</span></div>' + (r.suggestions || []).map(function (s, i) {
            var ex = s.example || {};
            return '<div class="card qa-card"><div><span class="code">' + esc(s.mok) + '</span> <b>' + esc(s.name || mokName(s.type, s.mok)) + '</b> <span class="chip c-blue">' + esc(s.type) + '</span></div><div class="muted">' + esc(s.why || '') + '</div>' +
              '<div class="qa-ex">입력 예시: <b>' + esc(PH[ex.phase] || PH.actual) + '</b> · ' + esc(ex.memo || '') + (ex.vendor ? ' · ' + esc(ex.vendor) : '') + (ex.amount ? ' · ' + won(ex.amount) + '원' : '') + (ex.calc ? ' · ' + esc(ex.calc) : '') + '</div>' +
              '<div class="acts"><button class="btn btn-secondary btn-sm" data-qf="' + i + '" type="button">입력란에 채우기 (직접 입력)</button><button class="btn btn-primary btn-sm" data-qa="' + i + '" type="button"' + (canEdit() && !(admin && !S.dept) ? '' : ' disabled') + '>이 내용으로 바로 추가 (자동 반영)</button></div></div>';
          }).join('');
          out.onclick = function (e) {
            var f = e.target.closest('[data-qf]'), a = e.target.closest('[data-qa]'); if (!f && !a) return;
            var s = r.suggestions[Number((f || a).dataset.qf || (f || a).dataset.qa)], ex = s.example || {};
            S.phase = ex.phase === 'plan' ? 'plan' : 'actual'; S.type = s.type;
            if (a) { addMany([{ type: s.type, phase: S.phase, memo: ex.memo || s.name, vendor: ex.vendor || '', amount: ex.amount || 0, calc: ex.calc || '', mok: s.mok, entry_date: S.phase === 'actual' ? S.lastDate : null }]).then(function () { toast('추가했습니다. 코드 ' + s.mok + ' 로 반영되었습니다.'); }); m.close(); draw(); return; }
            m.close(); draw();
            var set = function (id, v) { var e2 = $('#' + id, root); if (e2 && v) e2.value = v; };
            set('ea-memo', ex.memo); set('ea-vendor', ex.vendor); set('ea-calc', ex.calc); set('ea-amount', ex.amount ? won(ex.amount) : '');
            toast('입력란에 채웠습니다. 코드는 ' + s.mok + ' ' + (s.name || '') + ' 입니다. 추가 후 코드 칸에서 선택하십시오.');
          };
        }).catch(function (e) { b.disabled = false; out.innerHTML = '<div class="note err">' + ico('alert', 16) + ' ' + esc(e.message) + '</div>'; });
      };
    }

    /* ── 이벤트 ── */
    var hs = [];
    function on(type, fn) { root.addEventListener(type, fn); hs.push([type, fn]); }
    on('click', function (e) {
      var t = e.target;
      var ph = t.closest('[data-ph]'); if (ph) { S.phase = ph.dataset.ph; return draw(); }
      var ty = t.closest('[data-ty]'); if (ty) { S.type = ty.dataset.ty; return draw(); }
      if (t.closest('#ea-add')) return addFromInputs();
      if (t.closest('#e-save')) { flush().then(function () { toast('저장했습니다.'); }); return; }
      if (t.closest('#e-ai')) { var all = e.shiftKey; return runMatch(all); }
      if (t.closest('#e-qa')) return qaModal();
      if (t.closest('#e-xl')) return BudgetEntryXlsx.template({ dept: S.dept || o.dept, year: S.year });
      if (t.closest('#e-up')) return $('#e-file', root).click();
      var tr = t.closest('tr.er'), cf = t.closest('tr.econf'), id = tr ? tr.dataset.id : cf ? cf.dataset.cf : null;
      var alt = t.closest('[data-alt]');
      if (alt && id) { var r0 = S.rows[id]; setDirty(r0, 'mok', alt.dataset.alt); r0.needs_check = false; patchRow(id); scheduleFlush(300); return; }
      var act = t.closest('[data-act]'); if (!act || !id) return;
      var r = S.rows[id];
      if (act.dataset.act === 'del') return remove(id);
      if (act.dataset.act === 'hist') return histModal(id);
      if (act.dataset.act === 'cf-server') { var srv = r._conf; S.rows[id] = Object.assign(srv, { _dirty: null }); patchRow(id); return; }
      if (act.dataset.act === 'cf-mine') { r.ver = r._conf.ver; r._conf = null; patchRow(id); return flush(); }
    });
    on('input', function (e) {
      var i = e.target, f = i.dataset && i.dataset.f; if (!f || f === 'mok') return;
      var tr = i.closest('tr.er'); if (!tr) return; var r = S.rows[tr.dataset.id]; if (!r) return;
      setDirty(r, f, f === 'amount' ? (num(i.value) || 0) : i.value); tr.classList.add('dirty'); scheduleFlush(); if (f === 'amount') updCodeSum();
    });
    on('change', function (e) {
      var i = e.target;
      if (i.id === 'e-only') { S.only = i.checked; return redrawBody(); }
      if (i.id === 'e-file') { var f = i.files[0]; i.value = ''; if (f) BudgetEntryXlsx.upload(f, { dept: S.dept || o.dept, board: api0 }); return; }
      var tr = i.closest && i.closest('tr.er'), f2 = i.dataset && i.dataset.f; if (!tr || f2 !== 'mok') return;
      var r = S.rows[tr.dataset.id]; if (!r) return; setDirty(r, 'mok', i.value); r.needs_check = false; patchRow(tr.dataset.id); flush();
    });
    on('focusin', function (e) { var tr = e.target.closest && e.target.closest('tr.er'); if (tr && tr.dataset.id !== S.focusId) { if (S.focusId) lockOff(S.focusId); lockOn(tr.dataset.id); } });
    on('focusout', function (e) {
      var tr = e.target.closest && e.target.closest('tr.er'); if (!tr) return;
      var rt = e.relatedTarget; if (rt && tr.contains(rt)) return;
      var id = tr.dataset.id; var r = S.rows[id];
      if (e.target.classList && e.target.classList.contains('money')) return;
      if (e.target.dataset && e.target.dataset.f === 'amount') { e.target.value = e.target.value ? won(num(e.target.value) || 0) : ''; }
      lockOff(id); if (r && r._dirty && Object.keys(r._dirty).length) flush();
      if (r && r._srv && !(r._dirty && Object.keys(r._dirty).length)) { S.rows[id] = Object.assign(r._srv, { _dirty: null }); patchRow(id); }
    });
    on('keydown', function (e) {
      if (e.key === 'Enter' && e.target.closest && e.target.closest('.eadd')) { e.preventDefault(); addFromInputs(); }
    });
    on('paste', function (e) {   // 엑셀·메모장에서 여러 줄 붙여넣기: 입력 줄에 붙이면 한 번에 추가
      if (!e.target.closest || !e.target.closest('.eadd')) return;
      var tx = (e.clipboardData || window.clipboardData).getData('text'); if (!tx || (tx.indexOf('\n') < 0 && tx.indexOf('\t') < 0)) return;
      e.preventDefault();
      if (!canEdit() || (admin && !S.dept)) return toast(admin && !S.dept ? '부서를 먼저 선택해 주십시오.' : '지금은 입력할 수 없습니다.', 'err');
      var items = tx.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim(); }).map(function (l) {
        var c = l.split('\t');
        return S.phase === 'actual' ? { entry_date: /^\d{4}-\d{1,2}-\d{1,2}$/.test((c[0] || '').trim()) ? c[0].trim().replace(/-(\d)(?!\d)/g, '-0$1') : null, memo: (c[1] || c[0] || '').trim(), vendor: (c[2] || '').trim(), amount: num(c[3]) || 0 }
          : { memo: (c[0] || '').trim(), calc: (c[1] || '').trim(), amount: num(c[2]) || 0 };
      });
      addMany(items).then(function (n) { toast(n + '건을 붙여넣었습니다.'); });
    });
    var api0 = { addMany: addMany, phase: function () { return S.phase; }, type: function () { return S.type; }, canEdit: canEdit, admin: admin, dept: function () { return S.dept; } };

    /* ── 시작 ── */
    function boot() {
      indexCodes(); S.asOf = null;
      timers.poll = setInterval(poll, 4000);
      timers.auto = setInterval(function () { flush().then(function () { if (!dirtyN()) { S.lastSaved = new Date(); updStat(); } }); }, 5 * 60 * 1000);
      timers.keep = setInterval(function () { if (S.focusId) lockOn(S.focusId); }, 20000);
      window.addEventListener('beforeunload', onUnload);
      draw();
    }
    function onUnload(e) { if (dirtyN()) { e.preventDefault(); e.returnValue = ''; } }
    function ensureWho() {
      if (S.who) return Promise.resolve();
      return new Promise(function (res) {
        var m = W.modal({ title: '이름을 알려 주십시오', body: '<p class="muted">같은 부서에서 여러 명이 함께 입력할 때 누가 어느 줄을 고치는지 서로 보이도록 사용합니다. 변경 이력에도 남습니다.</p><div class="form"><label>이름 또는 별칭<input id="who-i" class="in" maxlength="20" placeholder="예: 홍길동"></label></div>',
          actions: [{ label: '확인', cls: 'btn-primary', onClick: function (mm) { var v = $('#who-i', mm.el).value.trim(); if (!v) return toast('이름을 입력해 주십시오.', 'err'); S.who = v; whoSet(v); mm.close(); res(); } }], onClose: function () { if (!S.who) { S.who = '익명'; res(); } } });
        $('#who-i', m.el).focus();
        $('#who-i', m.el).onkeydown = function (ev) { if (ev.key === 'Enter') m.el.querySelector('[data-a="0"]').click(); };
      });
    }
    function start() {
      root.innerHTML = '<div class="loading">불러오는 중…</div>';
      return ensureWho().then(function () {
        return W.rpc('bgt_e_load', { p_token: S.token, p_year: S.year, p_dept: dp() });
      }).then(function (r) {
        S.codes = r.codes; S.open = r.open; S.win = r.window; S.asOf = new Date(new Date(r.now).getTime() - 1500).toISOString();
        r.entries.forEach(function (e) { S.rows[e.id] = e; });
        boot();
      }).catch(function (e) { root.innerHTML = '<div class="note err">' + ico('alert', 16) + ' ' + esc(e.message) + '</div>'; });
    }
    function destroy() { S.dead = true; hs.forEach(function (h) { root.removeEventListener(h[0], h[1]); }); Object.keys(timers).forEach(function (k) { clearInterval(timers[k]); }); window.removeEventListener('beforeunload', onUnload); }
    start();
    return { destroy: destroy, setDept: function (d) { S.dept = d || ''; draw(); }, state: S, flush: flush, who: function () { return S.who; }, changeWho: function () { S.who = ''; ensureWho().then(updOnline); } };
  }

  window.BudgetEntry = { mount: mount, whoGet: whoGet };
})();
