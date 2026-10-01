'use strict';
/**
 * budget-dept.js — 접속(부서 선택 + 비밀번호) · 부서 작업 화면 · 부팅 (BudgetBoot)
 *  - Google 계정 없이 부서 선택 후 비밀번호로 입장. 최초 입장 시 담당자가 비밀번호를 직접 설정합니다.
 *  - 로그인 토큰만 sessionStorage에 보관(탭을 닫으면 사라짐). 예산 데이터는 서버에만 저장됩니다.
 */
(function () {
  var W = window.BW, $ = W.$, $$ = W.$$, esc = W.esc, ico = W.ico, toast = W.toast;
  var root = document.getElementById('app');
  var info = null, year = null;

  function sessSave() { try { sessionStorage.setItem('bgt_sess', JSON.stringify(W.sess)); } catch (e) {} }
  function sessClear() { W.sess.role = ''; W.sess.token = ''; W.sess.dept = ''; try { sessionStorage.removeItem('bgt_sess'); } catch (e) {} }
  function sessRestore() { try { var s = JSON.parse(sessionStorage.getItem('bgt_sess') || 'null'); if (s && s.token) { W.sess.role = s.role; W.sess.token = s.token; W.sess.dept = s.dept || ''; return true; } } catch (e) {} return false; }
  function lastDept() { try { return localStorage.getItem('bgt_last_dept') || ''; } catch (e) { return ''; } }
  function setLastDept(d) { try { localStorage.setItem('bgt_last_dept', d); } catch (e) {} }

  var STATUS_TXT = { draft: '작성 준비중', open: '작성 중', closed: '마감', finalized: '최종 확정' };
  function settingsOf(y) { for (var i = 0; i < info.settings.length; i++) if (info.settings[i].year === y) return info.settings[i]; return null; }
  function periodText(s) {
    if (!s) return '';
    var a = s.open_at ? W.fmtDT(s.open_at) : '', b = s.close_at ? W.fmtDT(s.close_at) : '';
    return (a || b) ? (a || '시작 제한 없음') + ' ~ ' + (b || '마감 제한 없음') : '';
  }

  function logout() { if (W.sess.token) W.rpc('bgt_logout', { p_token: W.sess.token }).catch(function () {}); sessClear(); renderLogin(); }

  /* ───────── 접속 화면 ───────── */
  function renderLogin(msg) {
    var s = settingsOf(year), st = s ? s.status : 'draft';
    var depts = info.depts, sel = lastDept();
    if (!depts.some(function (d) { return d.dept === sel; })) sel = '';
    root.innerHTML =
      '<div class="login"><div class="login-card">' +
      '<div class="brand lg"><span class="logo">' + ico('coins', 24) + '</span><div><div class="b-t">부서 예산안 작성</div><div class="b-s">아세아항공직업전문학교 · ' + year + '년도 세입·세출</div></div></div>' +
      '<div class="period"><span class="chip ' + (st === 'open' ? 'c-green' : 'c-gray') + '">' + STATUS_TXT[st] + '</span><span class="muted">' + esc(periodText(s)) + '</span></div>' +
      (s && s.note ? '<div class="note info">' + esc(s.note) + '</div>' : '') +
      (msg ? '<div class="note err">' + ico('alert', 16) + ' ' + esc(msg) + '</div>' : '') +
      '<form id="lg-form" autocomplete="off"><label>부서<select id="lg-dept" class="in"><option value="">부서를 선택하십시오</option>' + depts.map(function (d) { return '<option' + (d.dept === sel ? ' selected' : '') + '>' + esc(d.dept) + '</option>'; }).join('') + '</select></label><div id="lg-pw"></div>' +
      '<button class="btn btn-primary block" id="lg-go" type="submit"></button></form>' +
      '<p class="muted lg-help">부서 대표자 누구나 부서를 선택하고 비밀번호를 입력해 입장할 수 있습니다. 다른 부서의 내용은 볼 수 없습니다. 비밀번호를 잊었다면 기획처(예산관리자)에 초기화를 요청하십시오.</p>' +
      '<button class="lnk adm-link" id="lg-adm" type="button">' + ico('shield', 15) + ' 예산관리자 로그인</button></div></div>';
    var form = $('#lg-form', root);
    function pwMode() {
      var d = $('#lg-dept', root).value, hasPw = (info.depts.filter(function (x) { return x.dept === d; })[0] || {}).has_pw;
      $('#lg-go', root).disabled = !d;
      if (!d) { $('#lg-pw', root).innerHTML = ''; $('#lg-go', root).textContent = '입장'; return false; }
      $('#lg-pw', root).innerHTML = hasPw
        ? '<label>비밀번호<input id="lg-p1" class="in" type="password" autocomplete="current-password" required></label>'
        : '<div class="note info">' + ico('key', 16) + ' 처음 접속하는 부서입니다. 사용할 비밀번호를 정해 주십시오. 이후 부서원 누구나 이 비밀번호로 입장합니다.</div>' +
          '<label><span>새 비밀번호 <span class="muted">(4자 이상)</span></span><input id="lg-p1" class="in" type="password" autocomplete="new-password" required></label>' +
          '<label>비밀번호 확인<input id="lg-p2" class="in" type="password" autocomplete="new-password" required></label>';
      $('#lg-go', root).textContent = hasPw ? '입장' : '비밀번호 설정 후 입장';
      return hasPw;
    }
    pwMode();
    $('#lg-dept', root).onchange = pwMode;
    form.onsubmit = function (e) {
      e.preventDefault();
      var d = $('#lg-dept', root).value, hasPw = (info.depts.filter(function (x) { return x.dept === d; })[0] || {}).has_pw;
      if (!d) return toast('부서를 선택해 주십시오.', 'err');
      var p1 = $('#lg-p1', root).value, btn = $('#lg-go', root);
      var call;
      if (hasPw) call = W.rpc('bgt_dept_login', { p_dept: d, p_pw: p1 });
      else {
        if (p1 !== $('#lg-p2', root).value) return toast('비밀번호 확인이 일치하지 않습니다.', 'err');
        call = W.rpc('bgt_dept_set_password', { p_dept: d, p_pw: p1 });
      }
      btn.disabled = true;
      call.then(function (r) {
        btn.disabled = false;
        if (!r.ok) {
          var m = W.errMsg(r.error);
          if (r.error === 'BAD_PASSWORD') m += ' (남은 시도 ' + r.left + '회)';
          if (r.error === 'LOCKED_OUT') m = '시도 횟수를 초과했습니다. ' + W.fmtDT(r.until) + ' 이후에 다시 시도하십시오.';
          if (r.error === 'ALREADY_SET') { return refreshInfo().then(function () { renderLogin(m); }); }
          return toast(m, 'err');
        }
        W.sess.role = 'dept'; W.sess.token = r.token; W.sess.dept = r.dept; sessSave(); setLastDept(r.dept);
        loadDept();
      }).catch(function (e2) { btn.disabled = false; toast(e2.message, 'err'); });
    };
    $('#lg-adm', root).onclick = renderAdminLogin;
  }

  function renderAdminLogin() {
    root.innerHTML = '<div class="login"><div class="login-card"><div class="brand lg"><span class="logo">' + ico('shield', 24) + '</span><div><div class="b-t">예산관리자 로그인</div><div class="b-s">검증 · 승인 · 설정</div></div></div>' +
      '<form id="ad-form"><label>관리자 비밀번호<input id="ad-pw" class="in" type="password" autocomplete="current-password" required></label><button class="btn btn-primary block" id="ad-go" type="submit">로그인</button></form>' +
      '<button class="lnk adm-link" id="ad-back" type="button">← 부서 접속으로 돌아가기</button></div></div>';
    $('#ad-back', root).onclick = function () { renderLogin(); };
    $('#ad-form', root).onsubmit = function (e) {
      e.preventDefault(); var b = $('#ad-go', root); b.disabled = true;
      W.rpc('bgt_admin_login', { p_pw: $('#ad-pw', root).value }).then(function (r) {
        b.disabled = false;
        if (!r.ok) {
          var m = W.errMsg(r.error);
          if (r.error === 'BAD_PASSWORD') m += ' (남은 시도 ' + r.left + '회)';
          if (r.error === 'LOCKED_OUT') m = '시도 횟수를 초과했습니다. ' + W.fmtDT(r.until) + ' 이후에 다시 시도하십시오.';
          return toast(m, 'err');
        }
        W.sess.role = 'admin'; W.sess.token = r.token; W.sess.dept = ''; sessSave();
        BudgetAdmin.show(root, year);
      }).catch(function (e2) { b.disabled = false; toast(e2.message, 'err'); });
    };
  }

  /* ───────── 부서 작업 화면 ───────── */
  function loadDept() {
    root.innerHTML = '<div class="loading">불러오는 중…</div>';
    W.rpc('bgt_d_load', { p_token: W.sess.token, p_year: year }).then(renderDept).catch(function (e) {
      if (e.code === 'AUTH_REQUIRED') return;     // onAuthLost 에서 처리
      toast(e.message, 'err'); renderLogin();
    });
  }
  function renderDept(data) {
    var s = data.settings || { status: 'draft' }, dept = data.dept;
    root.innerHTML =
      '<header class="top"><div class="brand"><span class="logo">' + ico('coins', 20) + '</span><div><div class="b-t">' + esc(dept) + '</div><div class="b-s">' + year + '년도 세입·세출 예산안</div></div></div>' +
      '<div class="top-r"><span class="chip ' + (data.open ? 'c-green' : 'c-gray') + '">' + STATUS_TXT[s.status] + '</span>' +
      '<button class="btn btn-ghost btn-sm" id="pw-chg">' + ico('key', 16) + ' <span class="hide-sm">비밀번호 변경</span></button>' +
      '<button class="btn btn-ghost btn-sm" id="d-out">' + ico('logout', 16) + ' <span class="hide-sm">로그아웃</span></button></div></header>' +
      '<main class="page"><div class="period-bar"><span class="muted">작성 기간</span> <b>' + esc(periodText(s) || (s.status === 'open' ? '제한 없음' : '관리자가 정합니다')) + '</b>' + (s.note ? ' <span class="sep">·</span> ' + esc(s.note) : '') + '</div>' +
      '<div id="ws"></div></main>';
    $('#d-out', root).onclick = logout;
    $('#pw-chg', root).onclick = changePw;
    var base = { p_token: W.sess.token };
    function rp(fn, extra) { return W.rpc(fn, Object.assign({}, base, extra)); }
    W.mount($('#ws', root), {
      admin: false, dept: dept, year: year, data: data,
      api: {
        saveLine: function (line) { return rp('bgt_d_line_save', { p_year: year, p_line: line }); },
        deleteLine: function (id) { return rp('bgt_d_line_delete', { p_id: id }); },
        saveSpend: function (lineId, entry) { return rp('bgt_d_spend_save', { p_line_id: lineId, p_entry: entry }); },
        deleteSpend: function (id) { return rp('bgt_d_spend_delete', { p_id: id }); },
        submit: function (type) { return rp('bgt_d_submit', { p_year: year, p_type: type }); },
        recall: function (type) { return rp('bgt_d_recall', { p_year: year, p_type: type }); }
      }
    });
  }
  function changePw() {
    W.modal({
      title: '비밀번호 변경', body: '<div class="form"><label>현재 비밀번호<input id="cp-old" class="in" type="password" autocomplete="current-password"></label><label><span>새 비밀번호 <span class="muted">(4자 이상)</span></span><input id="cp-new" class="in" type="password" autocomplete="new-password"></label></div><p class="muted">부서원 모두가 같은 비밀번호를 사용하므로, 변경 후 부서원에게 알려 주십시오.</p>',
      actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '변경', cls: 'btn-primary', onClick: function (m) {
        W.rpc('bgt_d_change_password', { p_token: W.sess.token, p_old: $('#cp-old', m.el).value, p_new: $('#cp-new', m.el).value }).then(function (r) {
          if (r.ok === false) return toast(W.errMsg(r.error), 'err');
          m.close(); toast('비밀번호를 변경했습니다.');
        }).catch(function (e) { toast(e.message, 'err'); });
      } }]
    });
  }

  /* ───────── 부팅 ───────── */
  function refreshInfo() {
    return W.rpc('bgt_info').then(function (i) {
      info = i;
      var cur = new Date().getFullYear();
      year = info.settings.length ? info.settings[0].year : cur + 1;
    });
  }
  function boot() {
    W.setAuthLost(function () { if (!W.sess.token) return; sessClear(); refreshInfo().then(function () { renderLogin('로그인이 만료되었습니다. 다시 접속해 주십시오.'); }); });
    root.innerHTML = '<div class="loading">불러오는 중…</div>';
    refreshInfo().then(function () {
      if (sessRestore()) { if (W.sess.role === 'admin') BudgetAdmin.show(root, year); else loadDept(); }
      else renderLogin();
    }).catch(function (e) {
      root.innerHTML = '<div class="login"><div class="login-card"><div class="note err">' + ico('alert', 16) + ' ' + esc(e.message) + '</div><p class="muted">예산 서버(Supabase)에 연결하지 못했습니다. 잠시 후 새로고침하십시오. 관리자 설정이 아직 완료되지 않았을 수도 있습니다.</p></div></div>';
    });
  }

  window.BudgetBoot = { logout: logout };
  boot();
})();
