'use strict';
/**
 * budget-admin.js — 예산관리자 화면 (BudgetAdmin)
 *  현황 · 검토/승인 · 부서/비밀번호 · 코드표 · 일정/한도/최종반영 · 내보내기 · 이력
 *  모든 호출은 관리자 토큰이 필요한 서버 RPC(bgt_a_*)를 통해서만 이루어집니다.
 */
(function () {
  var W = window.BW, $ = W.$, $$ = W.$$, esc = W.esc, won = W.won, ico = W.ico, toast = W.toast;
  var A = { year: null, tab: 'overview', data: null, rDept: null, rType: '세출', logs: null, codeType: '세출' };
  var rootEl = null;

  var TABS = [['overview', '현황'], ['review', '검토·승인'], ['depts', '부서·비밀번호'], ['codes', '코드표'], ['settings', '일정·한도·최종반영'], ['export', '내보내기·인쇄'], ['log', '이력']];
  var STATUS_TXT = { draft: '작성 준비중', open: '작성 중', closed: '마감', finalized: '최종 확정' };

  function arpc(fn, args) { args = args || {}; args.p_token = W.sess.token; return W.rpc(fn, args); }
  function fail(e) { toast(e.message, 'err'); }
  function load() { return arpc('bgt_a_load', { p_year: A.year }).then(function (d) { A.data = d; return d; }); }
  function ctxData() {
    var d = A.data;
    return { year: A.year, baseYear: (d.settings && d.settings.base_year) || A.year - 1, depts: d.depts, codes: d.codes, lines: d.lines, spend: d.spend, subs: d.subs, caps: d.caps };
  }
  function activeDepts() { return A.data.depts.filter(function (d) { return d.active; }); }
  function chip(st) { return '<span class="chip ' + (st === 'confirmed' ? 'c-green' : st === 'draft' ? 'c-gray' : 'c-blue') + '">' + W.stageLabel(st) + '</span>'; }

  /* ───────── 진입 ───────── */
  function show(root, year) {
    rootEl = root; A.year = year;
    root.innerHTML = '<div class="loading">불러오는 중…</div>';
    load().then(draw).catch(function (e) { fail(e); });
  }

  // 부서가 동시에 작성·제출하므로 탭을 옮길 때마다 서버의 최신 내용을 다시 받아 그립니다.
  function refresh(notify) { return load().then(function () { draw(); if (notify === true) toast('최신 내용을 불러왔습니다.'); }).catch(fail); }

  function draw() {
    var d = A.data, years = d.all_settings.map(function (s) { return s.year; });
    if (years.indexOf(A.year) < 0) years.unshift(A.year);
    var st = d.settings ? d.settings.status : 'draft';
    rootEl.innerHTML =
      '<header class="top"><div class="brand"><span class="logo">' + ico('coins', 20) + '</span><div><div class="b-t">예산안 관리자</div><div class="b-s">아세아항공직업전문학교 · ' + A.year + '년도 세입·세출</div></div></div>' +
      '<div class="top-r"><select id="ad-year" class="in sm" aria-label="연도">' + years.map(function (y) { return '<option value="' + y + '"' + (y === A.year ? ' selected' : '') + '>' + y + '년도</option>'; }).join('') + '</select>' +
      '<span class="chip ' + (st === 'open' ? 'c-green' : st === 'finalized' ? 'c-blue' : 'c-gray') + '">' + STATUS_TXT[st] + '</span>' +
      '<button class="btn btn-ghost btn-sm" id="ad-refresh" title="서버에서 최신 내용 불러오기">' + ico('refresh', 16) + ' <span class="hide-sm">새로고침</span></button>' +
      '<button class="btn btn-ghost btn-sm" id="ad-out">' + ico('logout', 16) + ' 로그아웃</button></div></header>' +
      '<nav class="ad-tabs" role="tablist">' + TABS.map(function (t) { return '<button role="tab" class="ws-tab' + (A.tab === t[0] ? ' on' : '') + '" data-ad="' + t[0] + '" aria-selected="' + (A.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</nav>' +
      '<main class="page"><div id="ad-body"></div></main>';
    $('#ad-year', rootEl).onchange = function () { A.year = Number(this.value); A.rDept = null; show(rootEl, A.year); };
    $('#ad-out', rootEl).onclick = function () { W.rpc('bgt_logout', { p_token: W.sess.token }).catch(function () {}); window.BudgetBoot.logout(); };
    $$('[data-ad]', rootEl).forEach(function (b) { b.onclick = function () { A.tab = b.dataset.ad; refresh(); }; });
    $('#ad-refresh', rootEl).onclick = function () { refresh(true); };
    var body = $('#ad-body', rootEl);
    ({ overview: overview, review: review, depts: deptsTab, codes: codesTab, settings: settingsTab, export: exportTab, log: logTab })[A.tab](body);
  }

  /* ───────── 현황 ───────── */
  function overview(box) {
    var d = A.data, c = ctxData(), tt = BudgetExport.totals(c), depts = activeDepts();
    var tin = 0, tout = 0, bin = 0, bout = 0, subs = 0, conf = 0;
    depts.forEach(function (x) { tin += tt.get(x.dept, '세입').amt; tout += tt.get(x.dept, '세출').amt; bin += tt.get(x.dept, '세입').base; bout += tt.get(x.dept, '세출').base; });
    d.subs.forEach(function (s) { if (tt.get(s.dept, s.type).n) { subs++; if (s.status === 'confirmed') conf++; } });
    var diff = tin - tout;
    var h = '<div class="kpis"><div class="kpi strong"><div class="kpi-l">' + A.year + ' 세입 요구 합계</div><div class="kpi-v">' + won(tin) + '<small>원</small></div></div>' +
      '<div class="kpi strong"><div class="kpi-l">' + A.year + ' 세출 요구 합계</div><div class="kpi-v">' + won(tout) + '<small>원</small></div></div>' +
      '<div class="kpi"><div class="kpi-l">세입 − 세출</div><div class="kpi-v ' + (diff < 0 ? 'down' : 'up') + '">' + (diff > 0 ? '+' : '') + won(diff) + '<small>원</small></div></div>' +
      '<div class="kpi"><div class="kpi-l">확정 진행</div><div class="kpi-v">' + conf + ' / ' + subs + '<small>건</small></div></div></div>';
    h += diff < 0 ? '<div class="note warn">' + ico('alert', 16) + ' 세출 요구액이 세입 요구액보다 ' + won(-diff) + '원 큽니다. 부서 요구 조정이 필요한지 검토하십시오.</div>'
      : '<div class="note ok">' + ico('check', 16) + ' 세입 요구액이 세출 요구액보다 ' + won(diff) + '원 큽니다.</div>';
    h += '<div class="tools"><div class="muted">부서 행을 누르면 해당 부서의 항목을 검토합니다. 세입 기준 전년(' + (c.baseYear) + ') 합계 ' + won(bin) + '원 / 세출 ' + won(bout) + '원</div>' +
      '<button class="btn btn-secondary btn-sm" id="ov-bulk">' + ico('check', 16) + ' 제출·검토 중인 건 일괄 승인</button></div>';
    h += '<div class="tbl-wrap"><table class="bt ov"><thead><tr><th>순번</th><th>부서</th><th class="num">세입 요구</th><th class="num">비율</th><th class="num">세출 요구</th><th class="num">비율</th><th class="num">세출 전년 대비</th><th class="num">세출 한도</th><th>세입</th><th>세출</th></tr></thead><tbody>';
    depts.forEach(function (x, i) {
      var a = tt.get(x.dept, '세입'), b = tt.get(x.dept, '세출'), cap = capOf(x.dept, '세출'), sIn = BudgetExport.statusOf(c, x.dept, '세입'), sOut = BudgetExport.statusOf(c, x.dept, '세출');
      var p = b.base ? W.pct(b.amt, b.base) : null;
      h += '<tr class="ln clk" data-dept="' + esc(x.dept) + '"><td class="c-code">' + i + '</td><td><b>' + esc(x.dept) + '</b></td>' +
        '<td class="num">' + won(a.amt) + '</td><td class="num">' + (tin ? (a.amt * 100 / tin).toFixed(1) : '0.0') + '%</td>' +
        '<td class="num">' + won(b.amt) + '</td><td class="num">' + (tout ? (b.amt * 100 / tout).toFixed(1) : '0.0') + '%</td>' +
        '<td class="num">' + (p == null ? '-' : p === 0 ? '<span class="muted">0%</span>' : '<span class="df ' + (p > 0 ? 'up' : 'down') + '">' + (p > 0 ? '+' : '') + p + '%</span>') + '</td>' +
        '<td class="num">' + (cap ? (b.amt > cap ? '<span class="flag err">' + won(b.amt - cap) + ' 초과</span>' : '<span class="muted">' + won(cap) + '</span>') : '<span class="muted">미설정</span>') + '</td>' +
        '<td>' + (a.n ? chip(sIn) : '<span class="muted">-</span>') + '</td><td>' + (b.n ? chip(sOut) : '<span class="muted">-</span>') + '</td></tr>';
    });
    h += '</tbody><tfoot><tr class="grp"><td colspan="2">합계</td><td class="num">' + won(tin) + '</td><td class="num">100%</td><td class="num">' + won(tout) + '</td><td class="num">100%</td><td colspan="4"></td></tr></tfoot></table></div>';
    box.innerHTML = h;
    $$('tr.clk', box).forEach(function (tr) { tr.onclick = function () { A.rDept = tr.dataset.dept; A.tab = 'review'; refresh(); }; });
    $('#ov-bulk', box).onclick = function () {
      var targets = d.subs.filter(function (s) { return (s.status === 'submitted' || s.status === 'reviewing') && tt.get(s.dept, s.type).n; });
      if (!targets.length) return toast('승인할 건이 없습니다.');
      W.confirmBox('제출·검토 중인 ' + targets.length + '건을 모두 승인(확정)하시겠습니까?', '일괄 승인').then(function (ok) {
        if (!ok) return;
        targets.reduce(function (p, s) { return p.then(function () { return arpc('bgt_a_review', { p_year: A.year, p_dept: s.dept, p_type: s.type, p_action: 'approve', p_reason: '' }); }); }, Promise.resolve())
          .then(function () { toast(targets.length + '건을 승인했습니다.'); return load(); }).then(draw).catch(fail);
      });
    };
  }
  function capOf(dept, type) { var r = A.data.caps.filter(function (c) { return c.dept === dept && c.type === type; })[0]; return r ? Number(r.amount) || 0 : 0; }

  /* ───────── 검토·승인 ───────── */
  function review(box) {
    var depts = activeDepts();
    if (!A.rDept || !depts.some(function (d) { return d.dept === A.rDept; })) A.rDept = depts.length ? depts[0].dept : null;
    if (!A.rDept) { box.innerHTML = '<div class="empty"><p>등록된 부서가 없습니다.</p></div>'; return; }
    var c = ctxData();
    box.innerHTML = '<div class="rv-bar"><label class="inl">부서<select id="rv-dept" class="in">' + depts.map(function (d) { return '<option' + (d.dept === A.rDept ? ' selected' : '') + '>' + esc(d.dept) + '</option>'; }).join('') + '</select></label>' +
      '<div class="rv-st" id="rv-st"></div></div><div id="rv-ws"></div>';
    function chips() {
      $('#rv-st', box).innerHTML = ['세출', '세입'].map(function (t) { return t + ' ' + chip(BudgetExport.statusOf(ctxData(), A.rDept, t)); }).join(' ');
    }
    chips();
    $('#rv-dept', box).onchange = function () { A.rDept = this.value; load().then(function () { review(box); }).catch(fail); };
    var dept = A.rDept;
    W.mount($('#rv-ws', box), {
      admin: true, dept: dept, year: A.year, data: A.data, startTab: A.rType === '세입' ? 'sein' : 'sechul',
      onChange: chips,
      api: {
        saveLine: function (line) { line.dept = dept; return arpc('bgt_a_line_save', { p_year: A.year, p_line: line }); },
        deleteLine: function (id) { return arpc('bgt_a_line_delete', { p_id: id }); },
        saveSpend: function (lineId, entry) { return arpc('bgt_a_spend_save', { p_line_id: lineId, p_entry: entry }); },
        deleteSpend: function (id) { return arpc('bgt_a_spend_delete', { p_id: id }); },
        submit: function () { return Promise.reject(new Error('관리자는 제출하지 않습니다.')); },
        recall: function () { return Promise.reject(new Error('관리자는 회수하지 않습니다.')); }
      },
      actionsFor: function (type, el, sub, rerender) {
        var st = sub.status, h = '';
        if (st === 'draft') h = '<span class="muted">부서가 작성 중입니다. 제출 전에도 관리자가 직접 수정할 수 있습니다.</span>';
        if (st === 'submitted') h = '<button class="btn btn-secondary" data-rv="review">검토 시작</button>';
        if (st === 'submitted' || st === 'reviewing') h += '<button class="btn btn-primary" data-rv="approve">' + ico('check', 16) + ' 승인(확정)</button><button class="btn btn-danger" data-rv="reject">반려</button>';
        if (st !== 'draft') h += '<button class="btn btn-ghost" data-rv="unlock">' + ico('undo', 16) + ' 작성 상태로 되돌리기</button>';
        el.innerHTML = h;
        el.onclick = function (e) {
          var b = e.target.closest('[data-rv]'); if (!b) return; var action = b.dataset.rv;
          function run(reason) {
            arpc('bgt_a_review', { p_year: A.year, p_dept: dept, p_type: type, p_action: action, p_reason: reason || '' }).then(function (r) {
              A.data.subs.forEach(function (s) {
                if (s.dept === dept && s.type === type) { s.status = r.status; if (action === 'reject') s.reject_reason = reason; if (action === 'approve') s.reject_reason = ''; }
              });
              chips(); rerender(); toast({ review: '검토를 시작했습니다.', approve: '승인(확정)했습니다.', reject: '반려했습니다.', unlock: '작성 상태로 되돌렸습니다.' }[action]);
            }).catch(fail);
          }
          if (action === 'reject') {
            W.modal({ title: type + '예산 반려', body: '<div class="form"><label><span>반려 사유 <span class="muted">(부서 화면에 표시됩니다)</span></span><textarea id="rj-r" class="in" rows="4" placeholder="보완이 필요한 내용을 적어 주십시오."></textarea></label></div>',
              actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '반려', cls: 'btn-danger', onClick: function (m) { var v = $('#rj-r', m.el).value.trim(); if (!v) return toast('반려 사유를 입력해 주십시오.', 'err'); m.close(); run(v); } }] });
          } else if (action === 'unlock') {
            W.confirmBox('작성 상태로 되돌리면 부서가 다시 수정할 수 있습니다. 진행하시겠습니까?', '되돌리기').then(function (ok) { if (ok) run(''); });
          } else run('');
        };
      }
    });
  }

  /* ───────── 부서·비밀번호 ───────── */
  function deptsTab(box) {
    var d = A.data;
    var h = '<div class="note info">' + ico('shield', 16) + ' 비밀번호는 서버에 암호화되어 저장되며, 조회·초기화·변경 내역은 이력에 기록됩니다. 초기화하면 해당 부서가 다음 접속 때 새 비밀번호를 직접 설정합니다.</div>' +
      '<div class="tbl-wrap"><table class="bt"><thead><tr><th>부서</th><th class="num">순서</th><th>사용</th><th>비밀번호</th><th>접속 잠금</th><th>관리</th></tr></thead><tbody>';
    d.depts.forEach(function (x) {
      var locked = x.locked_until && new Date(x.locked_until) > new Date();
      h += '<tr class="ln" data-dept="' + esc(x.dept) + '"><td><b>' + esc(x.dept) + '</b></td>' +
        '<td class="num"><input class="in num sm" data-df="sort" value="' + x.sort + '" inputmode="numeric" aria-label="순서"></td>' +
        '<td><label class="chk-l"><input type="checkbox" data-df="active"' + (x.active ? ' checked' : '') + '> 사용</label></td>' +
        '<td>' + (x.has_pw ? '<span class="chip c-green">설정됨</span> <span class="muted">' + W.fmtDT(x.pw_set_at) + '</span>' : '<span class="chip c-gray">미설정</span>') + '</td>' +
        '<td>' + (locked ? '<span class="chip c-red">~' + W.fmtDT(x.locked_until) + '</span>' : '<span class="muted">-</span>') + '</td>' +
        '<td class="acts"><button class="btn btn-secondary btn-sm" data-pw="view"' + (x.has_pw ? '' : ' disabled') + '>' + ico('eye', 15) + ' 조회</button>' +
        '<button class="btn btn-secondary btn-sm" data-pw="set">' + ico('key', 15) + ' 변경</button>' +
        '<button class="btn btn-secondary btn-sm" data-pw="reset"' + (x.has_pw ? '' : ' disabled') + '>' + ico('refresh', 15) + ' 초기화</button>' +
        (locked ? '<button class="btn btn-ghost btn-sm" data-pw="unlock">잠금 해제</button>' : '') + '</td></tr>';
    });
    h += '</tbody></table></div><div class="card add-dept"><h4>부서 추가</h4><div class="form row"><label>부서명<input id="nd-name" class="in" maxlength="40"></label><label>순서<input id="nd-sort" class="in num" inputmode="numeric" value="' + (d.depts.length) + '"></label><button class="btn btn-primary" id="nd-add">' + ico('plus', 16) + ' 추가</button></div>' +
      '<p class="muted">부서를 추가하면 다음 연도 초기화 때부터 세입·세출 제출 단위가 만들어집니다. 현재 연도에는 항목 추가 후 제출 단위가 자동 생성됩니다.</p></div>';
    box.innerHTML = h;
    box.onchange = function (e) {
      var t = e.target, tr = t.closest('tr[data-dept]'); if (!tr || !t.dataset.df) return;
      var dept = tr.dataset.dept, x = d.depts.filter(function (y) { return y.dept === dept; })[0];
      var sort = Number($('[data-df="sort"]', tr).value) || 0, active = $('[data-df="active"]', tr).checked;
      arpc('bgt_a_dept_save', { p_dept: dept, p_sort: sort, p_active: active }).then(function () { x.sort = sort; x.active = active; toast('저장했습니다.'); }).catch(fail);
    };
    box.onclick = function (e) {
      var add = e.target.closest('#nd-add');
      if (add) {
        var name = $('#nd-name', box).value.trim(); if (!name) return toast('부서명을 입력해 주십시오.', 'err');
        arpc('bgt_a_dept_save', { p_dept: name, p_sort: Number($('#nd-sort', box).value) || 0, p_active: true }).then(load).then(draw).then(function () { toast('부서를 추가했습니다.'); }).catch(fail);
        return;
      }
      var b = e.target.closest('[data-pw]'); if (!b) return;
      var dept = b.closest('tr').dataset.dept, act = b.dataset.pw;
      if (act === 'view') {
        arpc('bgt_a_dept_pw', { p_dept: dept, p_action: 'view' }).then(function (r) {
          W.modal({ title: dept + ' 비밀번호', body: '<p class="mdl-msg">현재 비밀번호</p><div class="pw-show"><code id="pw-v">' + esc(r.password || '(없음)') + '</code></div><p class="muted">조회 기록이 이력에 남습니다.</p>',
            actions: [{ label: '닫기', cls: 'btn-ghost' }, { label: '복사', cls: 'btn-primary', onClick: function (m, btn) {
              var txt = r.password || ''; var done = function () { btn.textContent = '복사됨'; };
              if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, function () { selectText($('#pw-v', m.el)); }); else selectText($('#pw-v', m.el));
            } }] });
        }).catch(fail);
      } else if (act === 'reset') {
        W.confirmBox(dept + '의 비밀번호를 초기화하시겠습니까?\n현재 접속 중인 담당자는 로그아웃되고, 다음 접속 때 새 비밀번호를 설정합니다.', '초기화', true).then(function (ok) {
          if (ok) arpc('bgt_a_dept_pw', { p_dept: dept, p_action: 'reset' }).then(load).then(draw).then(function () { toast('초기화했습니다.'); }).catch(fail);
        });
      } else if (act === 'set') {
        W.modal({ title: dept + ' 비밀번호 변경', body: '<div class="form"><label><span>새 비밀번호 <span class="muted">(4자 이상)</span></span><input id="np-v" class="in" type="text" autocomplete="off"></label></div>',
          actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '변경', cls: 'btn-primary', onClick: function (m) {
            arpc('bgt_a_dept_pw', { p_dept: dept, p_action: 'set', p_pw: $('#np-v', m.el).value }).then(function (r) {
              if (r.ok === false) return toast(W.errMsg(r.error), 'err');
              m.close(); load().then(draw).then(function () { toast('변경했습니다.'); });
            }).catch(fail);
          } }] });
      } else if (act === 'unlock') {
        arpc('bgt_a_dept_pw', { p_dept: dept, p_action: 'unlock' }).then(load).then(draw).catch(fail);
      }
    };
  }
  function selectText(el) { var r = document.createRange(); r.selectNodeContents(el); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); toast('선택했습니다. 복사(Ctrl+C) 하십시오.'); }

  /* ───────── 코드표 ───────── */
  function codesTab(box) {
    var type = A.codeType, list = A.data.codes.filter(function (c) { return c.type === type; }).sort(function (a, b) { return W.cmpMok(a.code, b.code); });
    var h = '<div class="note info">' + ico('list', 16) + ' 2026 xlsm 코드표를 그대로 이식했습니다. 코드를 바꾸면 이후 부서 입력 화면에 즉시 반영되며, 이미 사용 중인 코드는 삭제하지 말고 「사용」을 해제하십시오.</div>' +
      '<div class="seg"><button class="seg-b' + (type === '세출' ? ' on' : '') + '" data-ct="세출">세출 코드</button><button class="seg-b' + (type === '세입' ? ' on' : '') + '" data-ct="세입">세입 코드</button></div>' +
      '<div class="tbl-wrap"><table class="bt cd"><thead><tr><th>코드</th><th>구분</th><th>명칭</th><th>설명</th><th>예시</th><th>사용</th><th></th></tr></thead><tbody>';
    list.forEach(function (c) {
      var lv = { gwan: '관', hang: '항', mok: '목' }[c.level];
      h += '<tr class="ln cr-' + c.level + '" data-code="' + esc(c.code) + '" data-level="' + c.level + '" data-sort="' + c.sort + '"><td class="c-code"><span class="code">' + esc(c.code) + '</span></td><td>' + lv + '</td>' +
        '<td><input class="in" data-cf="name" value="' + esc(c.name) + '"></td><td><input class="in" data-cf="descr" value="' + esc(c.descr) + '"></td><td><input class="in" data-cf="example" value="' + esc(c.example) + '"></td>' +
        '<td><input type="checkbox" data-cf="active"' + (c.active ? ' checked' : '') + ' aria-label="사용"></td><td><button class="btn btn-secondary btn-sm" data-cs>저장</button></td></tr>';
    });
    h += '</tbody></table></div><div class="card"><h4>' + type + ' 코드 추가</h4><div class="form row"><label>코드<input id="cn-code" class="in" placeholder="예: 3.4.1"></label><label>명칭<input id="cn-name" class="in"></label><label>설명<input id="cn-desc" class="in"></label><button class="btn btn-primary" id="cn-add">' + ico('plus', 16) + ' 추가</button></div>' +
      '<p class="muted">코드의 점(.) 개수로 관(1) · 항(1.1) · 목(1.1.1)을 구분합니다. 부서가 선택할 수 있는 단위는 「목」입니다.</p></div>';
    box.innerHTML = h;
    box.onclick = function (e) {
      var ct = e.target.closest('[data-ct]'); if (ct) { A.codeType = ct.dataset.ct; codesTab(box); return; }
      var s = e.target.closest('[data-cs]');
      if (s) {
        var tr = s.closest('tr'), code = tr.dataset.code;
        arpc('bgt_a_code_save', { p_code: { type: type, code: code, level: tr.dataset.level, name: $('[data-cf="name"]', tr).value, descr: $('[data-cf="descr"]', tr).value, example: $('[data-cf="example"]', tr).value, sort: Number(tr.dataset.sort), active: $('[data-cf="active"]', tr).checked } })
          .then(function () { var c = A.data.codes.filter(function (x) { return x.type === type && x.code === code; })[0]; c.name = $('[data-cf="name"]', tr).value; c.descr = $('[data-cf="descr"]', tr).value; c.example = $('[data-cf="example"]', tr).value; c.active = $('[data-cf="active"]', tr).checked; toast('저장했습니다.'); }).catch(fail);
        return;
      }
      if (e.target.closest('#cn-add')) {
        var code = $('#cn-code', box).value.trim(), name = $('#cn-name', box).value.trim();
        if (!/^\d+(\.\d+){0,2}$/.test(code) || !name) return toast('코드(예: 3.4.1)와 명칭을 입력해 주십시오.', 'err');
        var level = ['gwan', 'hang', 'mok'][code.split('.').length - 1], sort = A.data.codes.filter(function (c) { return c.type === type; }).length;
        arpc('bgt_a_code_save', { p_code: { type: type, code: code, level: level, name: name, descr: $('#cn-desc', box).value, example: '', sort: sort, active: true } }).then(load).then(draw).then(function () { toast('코드를 추가했습니다.'); }).catch(fail);
      }
    };
  }

  /* ───────── 일정·한도·최종반영 ───────── */
  function settingsTab(box) {
    var d = A.data, s = d.settings || { year: A.year, base_year: A.year - 1, status: 'draft', variance_pct: 20, note: '' }, c = ctxData(), tt = BudgetExport.totals(c);
    var pending = d.subs.filter(function (x) { return x.status !== 'confirmed' && tt.get(x.dept, x.type).n; }).length;
    var fin = s.status === 'finalized';
    var h = '<div class="card"><h3>' + A.year + '년도 작성 일정</h3><div class="form grid">' +
      '<label>상태<select id="st-status" class="in">' + ['draft', 'open', 'closed'].map(function (k) { return '<option value="' + k + '"' + (s.status === k ? ' selected' : '') + '>' + STATUS_TXT[k] + '</option>'; }).join('') + (fin ? '<option value="finalized" selected>' + STATUS_TXT.finalized + '</option>' : '') + '</select></label>' +
      '<label>작성 시작<input id="st-open" type="datetime-local" class="in" value="' + W.toLocalInput(s.open_at) + '"></label>' +
      '<label>작성 마감<input id="st-close" type="datetime-local" class="in" value="' + W.toLocalInput(s.close_at) + '"></label>' +
      '<label>증감 사유 요구 기준(%)<input id="st-var" class="in num" inputmode="numeric" value="' + s.variance_pct + '"></label>' +
      '<label class="wide"><span>부서 안내 문구 <span class="muted">(선택)</span></span><input id="st-note" class="in" value="' + esc(s.note) + '" placeholder="예: 11월 30일까지 세입·세출 예산안을 제출해 주십시오."></label></div>' +
      '<div class="acts"><button class="btn btn-primary" id="st-save">저장</button>' +
      (s.status !== 'open' && !fin ? '<button class="btn btn-secondary" id="st-open-now">' + ico('check', 16) + ' 지금 작성 개시</button>' : '') +
      (s.status === 'open' ? '<button class="btn btn-secondary" id="st-close-now">' + ico('lock', 16) + ' 지금 마감</button>' : '') + '</div>' +
      '<p class="muted">「작성 중」이고 시작·마감 시각 안에 있을 때만 부서가 입력할 수 있습니다. 시각을 비우면 제한하지 않습니다. 기준연도(전년): ' + s.base_year + '년</p></div>';

    h += '<div class="card"><h3>부서별 한도</h3><p class="muted">한도를 넘으면 부서 화면과 현황에 경고만 표시되며 제출은 막지 않습니다. 0 또는 빈 칸은 미설정입니다.</p><div class="tbl-wrap"><table class="bt"><thead><tr><th>부서</th><th class="num">세입 한도</th><th class="num">세입 요구</th><th class="num">세출 한도</th><th class="num">세출 요구</th></tr></thead><tbody>';
    activeDepts().forEach(function (x) {
      h += '<tr data-dept="' + esc(x.dept) + '"><td><b>' + esc(x.dept) + '</b></td>' +
        '<td class="num"><input class="in num" data-cap="세입" inputmode="numeric" value="' + (capOf(x.dept, '세입') ? won(capOf(x.dept, '세입')) : '') + '"></td><td class="num">' + won(tt.get(x.dept, '세입').amt) + '</td>' +
        '<td class="num"><input class="in num" data-cap="세출" inputmode="numeric" value="' + (capOf(x.dept, '세출') ? won(capOf(x.dept, '세출')) : '') + '"></td><td class="num">' + won(tt.get(x.dept, '세출').amt) + '</td></tr>';
    });
    h += '</tbody></table></div><div class="acts"><button class="btn btn-primary" id="cap-save">한도 저장</button></div></div>';

    h += '<div class="card"><h3>최종 반영</h3>' + (fin
      ? '<div class="note ok">' + ico('check', 16) + ' ' + W.fmtDT(s.finalized_at) + ' 최종 반영되었습니다. 수정이 필요하면 위 상태를 「마감」 또는 「작성 중」으로 바꾼 뒤 저장하십시오.</div>'
      : '<p>모든 부서의 세입·세출이 「확정」이면 최종 반영할 수 있습니다. 현재 미확정 ' + pending + '건.</p><div class="acts"><button class="btn btn-primary" id="fin-btn"' + '>' + ico('shield', 16) + ' 최종 승인·반영</button></div>') + '</div>';

    h += '<div class="card"><h3>새 연도 만들기</h3><div class="form row"><label>새 연도<input id="ny-year" class="in num" inputmode="numeric" value="' + (A.year + 1) + '"></label><label>기준 연도<input id="ny-base" class="in num" inputmode="numeric" value="' + A.year + '"></label><button class="btn btn-secondary" id="ny-go">' + ico('plus', 16) + ' 기준 연도 항목으로 생성</button></div><p class="muted">기준 연도의 요구액이 새 연도의 「전년 예산」과 초기 요구액으로 복사됩니다.</p></div>';

    h += '<div class="card"><h3>관리자 비밀번호 변경</h3><div class="form row"><label>현재 비밀번호<input id="ap-old" class="in" type="password" autocomplete="current-password"></label><label><span>새 비밀번호 <span class="muted">(8자 이상)</span></span><input id="ap-new" class="in" type="password" autocomplete="new-password"></label><button class="btn btn-secondary" id="ap-go">변경</button></div></div>';
    box.innerHTML = h;

    function saveSettings(over) {
      var st = $('#st-status', box).value; if (over) st = over;
      return arpc('bgt_a_settings_save', { p_s: { year: A.year, base_year: s.base_year, status: st, open_at: W.fromLocalInput($('#st-open', box).value), close_at: W.fromLocalInput($('#st-close', box).value), variance_pct: Number($('#st-var', box).value) || 20, note: $('#st-note', box).value } })
        .then(load).then(draw).then(function () { toast('저장했습니다.'); }).catch(fail);
    }
    box.onclick = function (e) {
      var id = (e.target.closest('button') || {}).id;
      if (id === 'st-save') saveSettings();
      else if (id === 'st-open-now') W.confirmBox(A.year + '년도 작성을 개시합니다. 부서가 입력할 수 있게 됩니다.', '작성 개시').then(function (ok) { if (ok) saveSettings('open'); });
      else if (id === 'st-close-now') W.confirmBox('작성을 마감하면 부서는 조회만 할 수 있습니다.', '마감').then(function (ok) { if (ok) saveSettings('closed'); });
      else if (id === 'cap-save') {
        var caps = []; $$('tr[data-dept]', box).forEach(function (tr) { $$('[data-cap]', tr).forEach(function (i) { caps.push({ dept: tr.dataset.dept, type: i.dataset.cap, amount: W.num(i.value) || 0 }); }); });
        arpc('bgt_a_caps_save', { p_year: A.year, p_caps: caps }).then(load).then(draw).then(function () { toast('한도를 저장했습니다.'); }).catch(fail);
      } else if (id === 'fin-btn') {
        arpc('bgt_a_finalize', { p_year: A.year, p_force: false }).then(function (r) {
          if (r.ok) return load().then(draw).then(function () { toast('최종 반영했습니다.'); });
          W.confirmBox('미확정 ' + r.pending + '건이 남아 있습니다.\n그래도 최종 반영하시겠습니까?', '그대로 반영', true).then(function (ok) {
            if (ok) arpc('bgt_a_finalize', { p_year: A.year, p_force: true }).then(load).then(draw).then(function () { toast('최종 반영했습니다.'); }).catch(fail);
          });
        }).catch(fail);
      } else if (id === 'ny-go') {
        var ny = Number($('#ny-year', box).value), nb = Number($('#ny-base', box).value);
        arpc('bgt_a_init_year', { p_year: ny, p_base_year: nb }).then(function (r) { A.year = ny; toast(r.lines + '개 항목으로 ' + ny + '년도를 만들었습니다.'); show(rootEl, ny); }).catch(fail);
      } else if (id === 'ap-go') {
        arpc('bgt_a_change_password', { p_old: $('#ap-old', box).value, p_new: $('#ap-new', box).value }).then(function (r) {
          if (r.ok === false) return toast(W.errMsg(r.error), 'err');
          $('#ap-old', box).value = ''; $('#ap-new', box).value = ''; toast('관리자 비밀번호를 변경했습니다.');
        }).catch(fail);
      }
    };
    box.onfocusout = function (e) { var t = e.target; if (t.dataset && t.dataset.cap && t.value) t.value = won(W.num(t.value) || 0); };
  }

  /* ───────── 내보내기·인쇄 ───────── */
  function exportTab(box) {
    box.innerHTML = '<div class="grid2"><div class="card"><h3>엑셀 내보내기</h3><p class="muted">시트 구성: 기초자료(2026 xlsm 열 구조 동일) · 종합 · 증감분석 · ' + (A.data.settings ? A.data.settings.base_year : A.year - 1) + ' 사용내역</p>' +
      '<div class="acts"><button class="btn btn-primary" id="ex-all">' + ico('download', 16) + ' 전체 내보내기</button><button class="btn btn-secondary" id="ex-conf">확정된 건만</button></div></div>' +
      '<div class="card"><h3>인쇄 · PDF</h3><p class="muted">브라우저 인쇄 창에서 「PDF로 저장」을 선택하면 PDF가 만들어집니다.</p>' +
      '<div class="acts"><button class="btn btn-primary" id="pr-sum">' + ico('print', 16) + ' 종합만 인쇄</button><button class="btn btn-secondary" id="pr-all">부서별 상세 포함</button></div></div></div>';
    box.onclick = function (e) {
      var id = (e.target.closest('button') || {}).id, c = ctxData();
      if (id === 'ex-all') BudgetExport.xlsx(c);
      else if (id === 'ex-conf') BudgetExport.xlsx(c, { confirmedOnly: true });
      else if (id === 'pr-sum') BudgetExport.print(c);
      else if (id === 'pr-all') BudgetExport.print(c, { detail: true });
    };
  }

  /* ───────── 이력 ───────── */
  var ACT = { admin_login: '관리자 로그인', line_add: '항목 추가', line_save: '항목 수정', line_delete: '항목 삭제', spend_save: '내역 저장', spend_delete: '내역 삭제', submit: '제출', recall: '제출 회수', dept_pw_init: '비밀번호 최초 설정', dept_pw_change: '비밀번호 변경', dept_pw_view: '비밀번호 조회', dept_pw_reset: '비밀번호 초기화', dept_pw_set: '비밀번호 지정', dept_save: '부서 저장', settings_save: '일정 저장', caps_save: '한도 저장', code_save: '코드 저장', review_review: '검토 시작', review_reject: '반려', review_approve: '승인', review_unlock: '되돌리기', finalize: '최종 반영', init_year: '연도 생성', admin_pw_change: '관리자 비밀번호 변경' };
  function logTab(box) {
    box.innerHTML = '<div class="loading">불러오는 중…</div>';
    arpc('bgt_a_log', { p_limit: 300 }).then(function (rows) {
      var h = '<div class="tbl-wrap"><table class="bt"><thead><tr><th>시각</th><th>주체</th><th>동작</th><th>대상</th><th>내용</th></tr></thead><tbody>';
      rows.forEach(function (r) { h += '<tr><td class="nowrap">' + W.fmtDT(r.at) + '</td><td>' + esc(r.actor) + '</td><td>' + esc(ACT[r.action] || r.action) + '</td><td>' + esc(r.target) + '</td><td class="muted">' + esc(r.detail && (r.detail.name || r.detail.reason || r.detail.line) || '') + '</td></tr>'; });
      box.innerHTML = h + '</tbody></table></div>';
    }).catch(fail);
  }

  window.BudgetAdmin = { show: show };
})();
