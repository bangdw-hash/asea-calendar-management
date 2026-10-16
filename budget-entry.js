'use strict';
/**
 * budget-entry.js — 부서 입력판 화면 (budget-entry.html)
 *   ?d=<부서> 없음 : 시작 화면 — 부서 선택 → 비밀번호(처음이면 설정) → 입력 화면 주소·바로가기·양식 안내
 *   ?d=<부서>      : 입력 화면 주소 — 부서 비밀번호를 묻고 입력판(BudgetEntry)을 엽니다.
 *  비밀번호는 예산안 작성(budget.html)과 같은 부서 비밀번호를 씁니다.
 */
(function () {
  var W = window.BW, $ = W.$, $$ = W.$$, esc = W.esc, ico = W.ico, toast = W.toast;
  var root = document.getElementById('app'), info = null, year = null, board = null;
  var qd = new URLSearchParams(location.search).get('d') || '', TEST = new URLSearchParams(location.search).get('test') === '1', realYear = null;

  function sessSave() { try { sessionStorage.setItem('bgt_sess', JSON.stringify(W.sess)); } catch (e) {} }
  function sessRestore() { try { var s = JSON.parse(sessionStorage.getItem('bgt_sess') || 'null'); if (s && s.token) { W.sess.role = s.role; W.sess.token = s.token; W.sess.dept = s.dept || ''; return true; } } catch (e) {} return false; }
  function sessClear() { W.sess.role = ''; W.sess.token = ''; W.sess.dept = ''; try { sessionStorage.removeItem('bgt_sess'); } catch (e) {} }
  function base() { return location.origin + location.pathname.replace(/[^\/]*$/, ''); }
  function entryUrl(d, test) { return base() + 'budget-entry.html?d=' + encodeURIComponent(d) + (test ? '&test=1' : ''); }
  function execUrl(d) { return base() + 'budget.html?test=1&d=' + encodeURIComponent(d); }   // 편성 완료 후 사용(결재 QR·집행) 시험
  function hasPw(d) { return (info.depts.filter(function (x) { return x.dept === d; })[0] || {}).has_pw; }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function () { toast('주소를 복사했습니다.'); }, function () { toast(t); });
    var i = document.createElement('input'); i.value = t; document.body.appendChild(i); i.select(); try { document.execCommand('copy'); toast('주소를 복사했습니다.'); } catch (e) { toast(t); } i.remove();
  }
  function shortcut(d) {   // 윈도우 바탕화면 바로가기(.url): 내려받아 바탕화면으로 옮기면 더블클릭으로 바로 열립니다.
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['[InternetShortcut]\r\nURL=' + entryUrl(d) + '\r\n'], { type: 'application/octet-stream' }));
    a.download = '예산입력_' + d + '.url'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    toast('바로가기 파일을 내려받았습니다. 바탕화면으로 옮겨 두십시오.');
  }

  function guideHtml(d) {
    return '<ol class="eguide"><li><b>주소 전달</b> — 아래 주소를 복사해 부서원에게 알려 주십시오. 바탕화면 바로가기를 만들어 두면 편합니다.</li>' +
      '<li><b>입장</b> — 주소로 들어오면 부서 비밀번호를 묻습니다. 예산안 작성 화면과 같은 비밀번호입니다. 처음 입장할 때 이름(별칭)을 한 번 적습니다.</li>' +
      '<li><b>입력</b> — 「올해 집행」과 「내년 계획」, 세출과 세입을 나누어 한 줄씩 적거나, 엑셀 양식을 받아 적은 뒤 올립니다. 코드는 적지 않습니다.</li>' +
      '<li><b>코드 매칭</b> — 다 적은 뒤 위쪽 「AI로 코드 매칭하기」를 누릅니다. 「확인 필요」 표시가 있는 줄만 확인하고, 다르면 코드 칸에서 직접 고칩니다.</li>' +
      '<li><b>수정·공유</b> — 같은 부서 여러 명이 동시에 입력해도 서로 보입니다. 기획처 심의 중에도 수정할 수 있으며, 최종 확정 후에는 잠깁니다.</li></ol>';
  }
  function readyHtml(d) {
    var u = entryUrl(d);
    return '<div class="eready"><label>' + esc(d) + ' 입력 화면 주소</label><div class="eurl"><input class="in" id="r-url" readonly value="' + esc(u) + '"><button class="btn btn-primary" id="r-copy" type="button">주소 복사</button></div>' +
      '<div class="acts"><a class="btn btn-secondary" href="' + esc(u) + '">' + ico('list', 16) + ' 입력 화면 열기</a><button class="btn btn-secondary" id="r-sc" type="button">' + ico('download', 16) + ' 바탕화면 바로가기 만들기</button>' +
      '<button class="btn btn-secondary" id="r-xl" type="button">' + ico('download', 16) + ' 엑셀 입력 양식 받기</button></div>' +
      '<div class="eurl2"><label>시험 ① 작성용 주소 <span class="muted">— 예산을 작성·입력하는 연습입니다(시험용 연도 1999). 실제 예산과 분리됩니다.</span></label><div class="eurl"><input class="in" id="r-url2" readonly value="' + esc(entryUrl(d, true)) + '"><button class="btn btn-secondary" id="r-copy2" type="button">복사</button><a class="btn btn-secondary" href="' + esc(entryUrl(d, true)) + '">시험 열기</a></div></div>' +
      '<div class="eurl2"><label>시험 ② 편성 완료 후 사용 주소 <span class="muted">— 확정된 예산으로 지출 요청 QR 발급·결재 반영을 연습합니다(시험용 연도 1998).</span></label><div class="eurl"><input class="in" id="r-url3" readonly value="' + esc(execUrl(d)) + '"><button class="btn btn-secondary" id="r-copy3" type="button">복사</button><a class="btn btn-secondary" href="' + esc(execUrl(d)) + '">시험 열기</a></div></div>' +
      '<p class="muted">바로가기: 내려받은 파일(.url)을 바탕화면으로 옮기면 더블클릭으로 열립니다. 크롬에서는 주소창 오른쪽 ⋮ 메뉴 → 「저장 및 공유」 → 「바로가기 만들기」로도 만들 수 있습니다.</p></div>' + guideHtml(d);
  }
  function wireReady(box, d) {
    var c = $('#r-copy', box); if (c) c.onclick = function () { copyText(entryUrl(d)); };
    var c2 = $('#r-copy2', box); if (c2) c2.onclick = function () { copyText(entryUrl(d, true)); };
    var c3 = $('#r-copy3', box); if (c3) c3.onclick = function () { copyText(execUrl(d)); };
    var s = $('#r-sc', box); if (s) s.onclick = function () { shortcut(d); };
    var x = $('#r-xl', box); if (x) x.onclick = function () { BudgetEntryXlsx.template({ dept: d, year: year }); };
  }

  function loginPanel(d, onOk, msg) {
    var pw = hasPw(d);
    return '<form id="lg-form" autocomplete="off"><div class="note ' + (pw ? 'info' : 'warn') + '">' + ico('key', 16) + ' ' + (pw ? esc(d) + ' 비밀번호를 입력하십시오.' : '처음 접속하는 부서입니다. 사용할 비밀번호를 정해 주십시오. 이후 모든 절차(예산안 작성·입력판)에서 부서원 누구나 이 비밀번호를 씁니다.') + '</div>' +
      (msg ? '<div class="note err">' + ico('alert', 16) + ' ' + esc(msg) + '</div>' : '') +
      '<label>' + (pw ? '비밀번호' : '새 비밀번호 <span class="muted">(4자 이상)</span>') + '<input id="lg-p1" class="in" type="password" autocomplete="' + (pw ? 'current-password' : 'new-password') + '" required></label>' +
      (pw ? '' : '<label>비밀번호 확인<input id="lg-p2" class="in" type="password" autocomplete="new-password" required></label>') +
      '<button class="btn btn-primary block" id="lg-go" type="submit">' + (pw ? '입장' : '비밀번호 설정 후 입장') + '</button></form>';
  }
  function wireLogin(box, d, onOk) {
    $('#lg-form', box).onsubmit = function (e) {
      e.preventDefault();
      var p1 = $('#lg-p1', box).value, btn = $('#lg-go', box), pw = hasPw(d), call;
      if (pw) call = W.rpc('bgt_dept_login', { p_dept: d, p_pw: p1 });
      else { if (p1 !== $('#lg-p2', box).value) return toast('비밀번호 확인이 일치하지 않습니다.', 'err'); call = W.rpc('bgt_dept_set_password', { p_dept: d, p_pw: p1 }); }
      btn.disabled = true;
      call.then(function (r) {
        btn.disabled = false;
        if (!r.ok) {
          var m = W.errMsg(r.error); if (r.error === 'BAD_PASSWORD') m += ' (남은 시도 ' + r.left + '회)';
          if (r.error === 'LOCKED_OUT') m = '시도 횟수를 초과했습니다. ' + W.fmtDT(r.until) + ' 이후에 다시 시도하십시오.';
          if (r.error === 'ALREADY_SET') return refresh().then(function () { box.innerHTML = loginPanel(d); wireLogin(box, d, onOk); });
          return toast(m, 'err');
        }
        W.sess.role = 'dept'; W.sess.token = r.token; W.sess.dept = r.dept; sessSave(); onOk(r);
      }).catch(function (e2) { btn.disabled = false; toast(e2.message, 'err'); });
    };
    $('#lg-p1', box).focus();
  }

  function head(sub, right) {
    return '<header class="top"><div class="brand"><span class="logo">' + ico('coins', 20) + '</span><div><div class="b-t">' + esc(sub || '부서 입력판') + '</div><div class="b-s">아세아항공직업전문학교 · ' + year + '년도 예산 입력</div></div></div><div class="top-r">' + (right || '') + '</div></header>';
  }

  /* 시작 화면 */
  function renderStart() {
    root.innerHTML = head('부서 입력판 시작', '<a class="btn btn-ghost btn-sm" href="budget.html">예산안 작성 화면</a>') +
      '<main class="page"><section class="card"><h3>1. 부서를 선택하십시오</h3><div class="edept">' + info.depts.map(function (d) {
        return '<button class="btn btn-secondary edbtn" data-d="' + esc(d.dept) + '" type="button">' + esc(d.dept) + (d.parent ? ' <small>(' + esc(d.parent) + ' 소속)</small>' : '') + (d.has_pw ? '' : ' <small>(처음)</small>') + '</button>'; }).join('') + '</div></section>' +
      '<section class="card hide" id="s-step"></section><section class="card"><h3>사용 순서</h3>' + guideHtml('') + '</section></main>';
    $$('.edbtn', root).forEach(function (b) { b.onclick = function () { pick(b.dataset.d); }; });
  }
  function pick(d) {
    $$('.edbtn', root).forEach(function (b) { b.classList.toggle('btn-primary', b.dataset.d === d); b.classList.toggle('btn-secondary', b.dataset.d !== d); });
    var box = $('#s-step', root); box.classList.remove('hide');
    function ready() { box.innerHTML = '<h3>3. ' + esc(d) + ' 입력 화면 주소</h3>' + readyHtml(d); wireReady(box, d); box.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    if (sessRestore() && W.sess.role === 'dept' && W.sess.dept === d) return ready();
    box.innerHTML = '<h3>2. ' + esc(d) + ' 비밀번호</h3>' + loginPanel(d); wireLogin(box, d, function () { ready(); });
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* 입력 화면 */
  function renderGate(d) {
    if (!info.depts.some(function (x) { return x.dept === d; })) { root.innerHTML = head() + '<main class="page"><div class="note err">' + ico('alert', 16) + ' 알 수 없는 부서 주소입니다. <a href="budget-entry.html">시작 화면</a>에서 부서를 선택해 주십시오.</div></main>'; return; }
    if (sessRestore() && ((W.sess.role === 'dept' && W.sess.dept === d) || W.sess.role === 'admin')) return renderBoard(d);
    root.innerHTML = head(d + ' 입력판') + '<main class="page"><section class="card elogin"><h3>' + esc(d) + ' 입력 화면</h3><div id="g-box">' + loginPanel(d) + '</div></section></main>';
    wireLogin($('#g-box', root), d, function () { renderBoard(d); });
  }
  function renderBoard(d) {
    var adm = W.sess.role === 'admin';
    var testBar = TEST ? '<div class="etest"><b>시험 ① 작성용</b><span>실제 예산에 반영되지 않는 연습 공간입니다(시험용 연도). 입력·코드 매칭·삭제를 마음껏 해 보십시오. 기간 제한 없이 항상 열려 있습니다.</span><span class="acts">' +
      (adm ? '' : '<button class="btn btn-secondary btn-sm" id="t-reset" type="button">시험 데이터 처음으로 (내 부서 실제 항목 복사)</button>') + '<a class="btn btn-ghost btn-sm" href="' + esc(execUrl(d)) + '">② 편성 완료 후 사용 시험으로</a><a class="btn btn-ghost btn-sm" href="' + esc(entryUrl(d)) + '">실제 입력판으로</a></span></div>' : '';
    root.innerHTML = head(d + ' 입력판' + (TEST ? ' (시험)' : ''), '<span class="chip c-blue" id="h-who"></span><button class="btn btn-ghost btn-sm" id="h-url" type="button">' + ico('list', 16) + ' <span class="hide-sm">주소·바로가기</span></button>' +
      '<a class="btn btn-ghost btn-sm" href="budget.html">' + ico('edit', 16) + ' <span class="hide-sm">예산안 작성</span></a><button class="btn btn-ghost btn-sm" id="h-out" type="button">' + ico('logout', 16) + ' <span class="hide-sm">로그아웃</span></button>') +
      '<main class="page ewide">' + testBar + '<div id="board"></div></main>';
    var who = function () { var w = BudgetEntry.whoGet(); $('#h-who', root).textContent = w ? w + ' (이름 변경)' : '이름 입력'; $('#h-who', root).style.cursor = 'pointer'; };
    function mountBoard() { if (board) board.destroy(); board = BudgetEntry.mount($('#board', root), { token: W.sess.token, year: year, role: adm ? 'admin' : 'dept', dept: d, testUrl: TEST ? '' : entryUrl(d, true) }); }
    mountBoard();
    var tr = $('#t-reset', root); if (tr) tr.onclick = function () { W.confirmBox('시험 데이터를 모두 지우고 처음 상태로 되돌립니다.\n(내 부서의 실제 예산 항목이 연습용으로 복사됩니다. 실제 예산은 바뀌지 않습니다.)', '처음으로', true).then(function (ok) { if (!ok) return; W.rpc('bgt_e_test_reset', { p_token: W.sess.token, p_src_year: realYear }).then(function () { toast('시험 데이터를 처음 상태로 되돌렸습니다.'); mountBoard(); }).catch(function (e) { toast(e.message, 'err'); }); }); };
    setTimeout(who, 600); $('#h-who', root).onclick = function () { if (board) { board.changeWho(); setTimeout(who, 400); } };
    $('#h-url', root).onclick = function () { var m = W.modal({ title: d + ' 입력 화면 주소 · 바로가기', cls: 'wide', body: readyHtml(d), actions: [{ label: '닫기', cls: 'btn-ghost' }] }); wireReady(m.el, d); };
    $('#h-out', root).onclick = function () { if (board) board.destroy(); W.rpc('bgt_logout', { p_token: W.sess.token }).catch(function () {}); sessClear(); renderGate(d); };
  }

  function refresh() { return W.rpc('bgt_info').then(function (i) { info = i; var real = info.settings.filter(function (x) { return x.year > 2000; }); realYear = real.length ? real[0].year : new Date().getFullYear() + 1; year = TEST ? 1999 : realYear; }); }
  W.setAuthLost(function () { if (board) { board.destroy(); board = null; } sessClear(); toast('로그인이 만료되었습니다. 다시 입장해 주십시오.', 'err'); if (qd) renderGate(qd); else renderStart(); });
  refresh().then(function () { if (qd) renderGate(qd); else renderStart(); }).catch(function (e) { root.innerHTML = '<div class="note err">' + ico('alert', 16) + ' ' + esc(e.message) + '</div>'; });
})();
