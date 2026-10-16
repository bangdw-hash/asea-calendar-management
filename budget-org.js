'use strict';
/**
 * budget-org.js — 관리자 「조직 개편」 탭 (BudgetOrg)
 *  · 조직 현황: 순서·상위 조직·하위 팀·사용 여부 수정, 부서 추가
 *  · 개편 예약: 이름 변경 / 통합(흡수) / 하위 편입 / 소속 해제 — 적용일을 정하면 그 날 이후 첫 접속에서 자동 적용
 *  · 항목 이동: 조직 개편 중 일부 예산 항목만 다른 부서로 조정
 *  서버 규칙: db/budget_schema_11.sql
 */
(function () {
  var W = window.BW, $ = W.$, $$ = W.$$, esc = W.esc, won = W.won, ico = W.ico, toast = W.toast;
  var KIND = { rename: '이름 변경', merge: '통합(흡수)', under: '하위 편입', detach: '소속 해제' };
  var ST = { planned: ['예약됨', 'c-blue'], applied: ['적용됨', 'c-green'], cancelled: ['취소', 'c-gray'], failed: ['실패', 'c-red'] };
  var UI = { from: '' };

  function arpc(fn, args) { args = args || {}; args.p_token = W.sess.token; return W.rpc(fn, args); }
  function fail(e) { toast(e.message, 'err'); }
  function opts(list, sel, blank) { return (blank ? '<option value="">' + esc(blank) + '</option>' : '') + list.map(function (d) { return '<option' + (d === sel ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join(''); }
  function today() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); }

  function mount(box, ctx) {
    box.innerHTML = '<div class="loading">불러오는 중…</div>';
    arpc('bgt_a_reorg_list').then(function (list) { draw(box, ctx, list); }).catch(fail);
  }

  function draw(box, ctx, reorg) {
    var depts = ctx.depts, names = depts.map(function (d) { return d.dept; }), act = depts.filter(function (d) { return d.active; }).map(function (d) { return d.dept; });
    var h = '<div class="note info">' + ico('check', 16) + ' <span>조직이 바뀌면 이름·소속·예산 항목을 여기서 한꺼번에 조정합니다. <b>이름 변경</b>은 항목·지출·입력판·결재 QR·한도·비밀번호가 모두 새 이름으로 따라가고, <b>통합(흡수)</b>은 선택한 연도의 항목·입력판 줄·결재 QR·한도를 다른 부서로 옮기며, <b>하위 편입</b>은 상위 조직만 지정합니다. 적용일을 정해 두면 그 날짜 이후 첫 접속에서 자동으로 적용됩니다.</span></div>';
    /* 1. 조직 현황 */
    h += '<h3 class="org-h">조직 현황 <span class="muted">· ▲▼로 순서를 바꾸고 「순서 저장」을 누르십시오. 「노출」을 끄면 로그인·입력 화면 목록에서 숨겨지며 데이터는 그대로 보존됩니다.</span></h3><div class="acts" style="margin-bottom:6px"><button class="btn btn-primary btn-sm" id="og-order" type="button">순서 저장</button></div><div class="tbl-wrap"><table class="bt org-t"><thead><tr><th>순서</th><th>부서명</th><th>상위 조직</th><th>하위 팀 (쉼표로 구분)</th><th>노출</th><th></th></tr></thead><tbody>' + depts.map(function (d) {
      return '<tr data-d="' + esc(d.dept) + '" data-s="' + d.sort + '"><td class="nowrap"><button class="btn btn-ghost btn-sm" data-mv="-1" type="button" aria-label="위로">▲</button><button class="btn btn-ghost btn-sm" data-mv="1" type="button" aria-label="아래로">▼</button></td><td><b>' + esc(d.dept) + '</b>' + (d.active ? '' : ' <span class="chip c-gray">비노출</span>') + '</td>' +
        '<td><select class="in sm" data-f="parent">' + opts(names.filter(function (x) { return x !== d.dept; }), d.parent || '', '(없음)') + '</select></td>' +
        '<td><input class="in sm" data-f="units" value="' + esc((d.sub_units || []).join(', ')) + '" placeholder="예: 교육운영팀, 직업훈련팀"></td>' +
        '<td><label class="inl"><input type="checkbox" data-f="active"' + (d.active ? ' checked' : '') + ' aria-label="노출"> 노출</label></td>' +
        '<td class="nowrap"><button class="btn btn-secondary btn-sm" data-sv="1" type="button">저장</button> <button class="btn btn-ghost btn-sm" data-rn="1" type="button">이름 변경</button></td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="acts org-add"><input class="in sm" id="og-new" placeholder="새 부서 이름" maxlength="40"><button class="btn btn-secondary btn-sm" id="og-add" type="button">' + ico('plus', 16) + ' 부서 추가</button></div>';
    /* 2. 개편 예약 */
    h += '<h3 class="org-h">조직 개편 예약</h3><div class="card org-form"><div class="form row">' +
      '<label>유형<select id="og-kind" class="in sm"><option value="under">하위 편입 (상위 조직 지정)</option><option value="rename">이름 변경</option><option value="merge">통합(흡수)</option><option value="detach">소속 해제</option></select></label>' +
      '<label>대상 부서<select id="og-src" class="in sm">' + opts(names, '') + '</select></label>' +
      '<label id="og-dl"><span id="og-dlab">편입될 상위 조직</span><select id="og-dst" class="in sm">' + opts(act, '') + '</select><input id="og-dtx" class="in sm hide" placeholder="새 이름" maxlength="40"></label>' +
      '<label id="og-yl" class="hide">적용 연도<input id="og-year" class="in sm num" value="' + ctx.year + '" style="width:80px"></label>' +
      '<label id="og-ml" class="hide">이전 예산<select id="og-mode" class="in sm"><option value="carry">받는 부서로 가져가기 (항목·지출·입력판·결재 QR·한도 이동)</option><option value="leave">이전 부서에 남겨 두기 (데이터는 그대로, 부서만 정리)</option></select></label>' +
      '<label>적용일 <span class="muted">(비우면 지금)</span><input id="og-on" type="date" class="in sm"></label></div>' +
      '<label>비고<input id="og-note" class="in sm" maxlength="200" placeholder="예: 2027학년도 조직 개편"></label><div class="acts"><button class="btn btn-primary" id="og-go" type="button">예약 / 적용</button></div></div>' +
      (reorg.length ? '<div class="tbl-wrap"><table class="bt"><thead><tr><th>상태</th><th>유형</th><th>대상</th><th>변경 후</th><th>적용일</th><th>비고 / 결과</th><th></th></tr></thead><tbody>' + reorg.map(function (r) {
        var s = r.undone_at ? ['되돌림', 'c-gray'] : (ST[r.status] || ST.planned), res = r.result ? (r.result.error ? '오류: ' + r.result.error : (r.result.lines != null ? '항목 ' + r.result.lines + '건 이동' : '')) : '';
        return '<tr data-r="' + r.id + '"><td><span class="chip ' + s[1] + '">' + s[0] + '</span></td><td>' + KIND[r.kind] + '</td><td>' + esc(r.src) + '</td><td>' + esc(r.dst || '-') + (r.kind === 'merge' ? ' <span class="muted">(' + (r.year ? r.year + '년도, ' : '전체 연도, ') + (r.mode === 'leave' ? '예산 남겨 둠' : '예산 가져감') + ')</span>' : '') + '</td><td class="nowrap">' + esc(r.effective_on || '지금') + '</td><td>' + esc(r.note || '') + (res ? '<div class="muted">' + esc(res) + '</div>' : '') + '</td>' +
          '<td class="nowrap">' + (r.status === 'planned' ? '<button class="btn btn-secondary btn-sm" data-ap="1" type="button">지금 적용</button> <button class="btn btn-ghost btn-sm" data-cn="1" type="button">취소</button>' : r.undoable ? '<button class="btn btn-secondary btn-sm" data-ud="1" type="button">되돌리기</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">예약된 조직 개편이 없습니다.</p>');
    /* 3. 항목 이동 */
    h += '<h3 class="org-h">예산 항목 이동 <span class="muted">(' + ctx.year + '년도, 일부 항목만 다른 부서로 조정)</span></h3><div class="form row"><label>이동할 항목이 있는 부서<select id="mv-from" class="in sm">' + opts(names, UI.from, '부서를 선택하십시오') + '</select></label>' +
      '<label>옮길 부서<select id="mv-to" class="in sm">' + opts(act, '', '부서를 선택하십시오') + '</select></label><div class="acts"><button class="btn btn-primary" id="mv-go" type="button" disabled>선택한 항목 이동</button></div></div><div id="mv-list"></div>';
    box.innerHTML = h;
    wire(box, ctx);
  }

  function wire(box, ctx) {
    var again = function () { ctx.refresh(); };
    $$('tr[data-d]', box).forEach(function (tr) {
      $('[data-sv]', tr).onclick = function () {
        var units = $('[data-f=units]', tr).value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        arpc('bgt_a_dept_edit', { p_dept: tr.dataset.d, p_sort: Number(tr.dataset.s) || 0, p_active: $('[data-f=active]', tr).checked, p_parent: $('[data-f=parent]', tr).value, p_units: units }).then(function () { toast(tr.dataset.d + ' 저장했습니다.'); again(); }).catch(fail);
      };
      $('[data-rn]', tr).onclick = function () {
        var d = tr.dataset.d, m = W.modal({ title: d + ' 이름 변경', body: '<p class="muted">이름을 바꾸면 이 부서의 항목·지출·입력판·결재 QR·한도·비밀번호가 모두 새 이름으로 따라갑니다. (확정안 이력은 당시 이름으로 남습니다.)</p><div class="form"><label>새 이름<input id="rn-n" class="in" maxlength="40"></label><label>적용일 <span class="muted">(비우면 지금 바로 적용)</span><input id="rn-on" type="date" class="in"></label></div>',
          actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '적용', cls: 'btn-primary', onClick: function (mm, b) {
            var nn = $('#rn-n', mm.el).value.trim(); if (!nn) return toast('새 이름을 입력해 주십시오.', 'err'); b.disabled = true;
            arpc('bgt_a_reorg_add2', { p_kind: 'rename', p_src: d, p_dst: nn, p_year: null, p_effective_on: $('#rn-on', mm.el).value || null, p_note: '', p_mode: 'carry' }).then(function (r) { mm.close(); toast(r.applied ? '이름을 바꿨습니다.' : '예약했습니다.'); again(); }).catch(function (e) { b.disabled = false; fail(e); }); } }] });
        $('#rn-n', m.el).focus();
      };
    });
    var tb = $('.org-t tbody', box);
    $$('[data-mv]', box).forEach(function (b) { b.onclick = function () {
      var tr = b.closest('tr'), dir = Number(b.dataset.mv), sib = dir < 0 ? tr.previousElementSibling : tr.nextElementSibling;
      if (!sib) return; if (dir < 0) tb.insertBefore(tr, sib); else tb.insertBefore(sib, tr);
    }; });
    $('#og-order', box).onclick = function () { arpc('bgt_a_dept_order', { p_order: $$('tr[data-d]', tb).map(function (t) { return t.dataset.d; }) }).then(function () { toast('순서를 저장했습니다.'); again(); }).catch(fail); };
    $('#og-add', box).onclick = function () { var n = $('#og-new', box).value.trim(); if (!n) return toast('부서 이름을 입력해 주십시오.', 'err'); arpc('bgt_a_dept_save', { p_dept: n, p_sort: 50, p_active: true }).then(function () { toast('부서를 추가했습니다.'); again(); }).catch(fail); };
    var kind = $('#og-kind', box);
    function kindUi() {
      var k = kind.value;
      $('#og-dl', box).classList.toggle('hide', k === 'detach'); $('#og-yl', box).classList.toggle('hide', k !== 'merge'); $('#og-ml', box).classList.toggle('hide', k !== 'merge');
      $('#og-dst', box).classList.toggle('hide', k === 'rename'); $('#og-dtx', box).classList.toggle('hide', k !== 'rename');
      $('#og-dlab', box).textContent = k === 'rename' ? '새 이름' : k === 'merge' ? '흡수할 부서(받는 부서)' : '편입될 상위 조직';
    }
    kind.onchange = kindUi; kindUi();
    $('#og-go', box).onclick = function () {
      var k = kind.value, src = $('#og-src', box).value, dst = k === 'rename' ? $('#og-dtx', box).value.trim() : k === 'detach' ? '' : $('#og-dst', box).value, on = $('#og-on', box).value || null;
      if (k !== 'detach' && !dst) return toast(k === 'rename' ? '새 이름을 입력해 주십시오.' : '대상 부서를 선택해 주십시오.', 'err');
      var msg = KIND[k] + ': ' + src + (dst ? ' → ' + dst : '') + (on && on > today() ? '\n적용일 ' + on + '에 자동 적용됩니다.' : '\n지금 바로 적용됩니다.') + (k === 'merge' ? '\n방식: ' + ($('#og-mode', box).value === 'leave' ? '이전 부서에 예산을 남겨 두고 부서만 정리' : '이전 예산을 받는 부서로 가져감') + '\n※ 적용 뒤 「되돌리기」로 원래 부서로 돌릴 수 있습니다.' : '');
      W.confirmBox(msg, '확인', k === 'merge').then(function (ok) {
        if (!ok) return;
        arpc('bgt_a_reorg_add2', { p_kind: k, p_src: src, p_dst: dst, p_year: k === 'merge' ? (Number($('#og-year', box).value) || ctx.year) : null, p_effective_on: on, p_note: $('#og-note', box).value.trim(), p_mode: k === 'merge' ? $('#og-mode', box).value : 'carry' }).then(function (r) { toast(r.applied ? '적용했습니다.' : '예약했습니다.'); again(); }).catch(fail);
      });
    };
    $$('tr[data-r]', box).forEach(function (tr) {
      var a = $('[data-ap]', tr), c = $('[data-cn]', tr), ud = $('[data-ud]', tr);
      if (ud) ud.onclick = function () { W.confirmBox('이 개편을 되돌립니다.\n옮겨졌던 항목·지출·입력판·결재 QR·한도를 원래 부서로 돌려보내고 부서 이름·소속·노출을 원래대로 되돌립니다.\n(개편 뒤 받는 부서에서 새로 만든 항목은 그대로 남습니다.)', '되돌리기', true).then(function (ok) { if (ok) arpc('bgt_a_reorg_undo', { p_id: tr.dataset.r }).then(function () { toast('되돌렸습니다.'); again(); }).catch(fail); }); };
      if (a) a.onclick = function () { W.confirmBox('지금 바로 적용하시겠습니까?', '적용').then(function (ok) { if (ok) arpc('bgt_a_reorg_apply', { p_id: tr.dataset.r }).then(function () { toast('적용했습니다.'); again(); }).catch(fail); }); };
      if (c) c.onclick = function () { arpc('bgt_a_reorg_cancel', { p_id: tr.dataset.r }).then(function () { toast('취소했습니다.'); again(); }).catch(fail); };
    });
    var from = $('#mv-from', box), go = $('#mv-go', box), list = $('#mv-list', box);
    function drawList() {
      UI.from = from.value;
      var ls = ctx.lines.filter(function (l) { return l.dept === UI.from; }).sort(function (a, b) { return W.cmpMok(a.mok, b.mok); });
      go.disabled = true;
      list.innerHTML = !UI.from ? '' : !ls.length ? '<p class="muted">이 부서에 ' + ctx.year + '년도 항목이 없습니다.</p>' :
        '<div class="tbl-wrap"><table class="bt"><thead><tr><th><input type="checkbox" id="mv-all" aria-label="전체 선택"></th><th>구분</th><th>코드</th><th>세부명칭</th><th class="num">전년 예산</th><th class="num">요구액</th></tr></thead><tbody>' + ls.map(function (l) {
          return '<tr><td><input type="checkbox" class="mv-c" value="' + l.id + '"></td><td>' + l.type + '</td><td class="c-code">' + esc(l.mok) + '</td><td>' + esc(l.name) + '</td><td class="num">' + won(l.base_amount) + '</td><td class="num">' + won(l.amount) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    from.onchange = drawList; drawList();
    list.onchange = function (e) {
      if (e.target.id === 'mv-all') $$('.mv-c', list).forEach(function (c) { c.checked = e.target.checked; });
      go.disabled = !$$('.mv-c:checked', list).length;
    };
    go.onclick = function () {
      var ids = $$('.mv-c:checked', list).map(function (c) { return c.value; }), to = $('#mv-to', box).value;
      if (!to) return toast('옮길 부서를 선택해 주십시오.', 'err'); if (to === UI.from) return toast('같은 부서입니다.', 'err');
      W.confirmBox(ids.length + '개 항목을 ' + UI.from + ' → ' + to + ' 로 옮깁니다.\n지출 내역과 입력판 줄도 함께 이동합니다.', '이동').then(function (ok) {
        if (ok) arpc('bgt_a_lines_move', { p_ids: ids, p_dst: to }).then(function (r) { toast(r.moved + '개 항목을 옮겼습니다.'); again(); }).catch(fail);
      });
    };
  }

  window.BudgetOrg = { mount: mount };
})();
