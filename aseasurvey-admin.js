'use strict';
/**
 * aseasurvey-admin.js — 설문 관리자 코어
 *  · 로그인(관리자 비밀번호, 12시간 토큰) · 해시 라우팅 · 설문 목록 · 새 설문 만들기
 *  · DB 연결 테스트(무료 플랜 활성 여부 점검) · AI 연결 테스트(index.html 과 동일한 AI 제공자 설정 사용)
 *  나머지 탭은 aseasurvey-admin-edit.js / -results.js / -ai.js 가 A.tabs 에 등록합니다.
 */
(function () {
  var E = SVY.esc, I = SVY.ico;
  var A = window.SVYA = { token: '', view: 'login', tab: 'overview', list: [], cur: null, work: null, tabs: {}, ext: {}, snap: '' };
  var $app;

  /* ───────────── 공통 도우미 ───────────── */
  A.toast = function (msg, kind) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; if (kind === 'err') t.style.background = '#B3261E';
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, kind === 'err' ? 4200 : 2600);
  };
  A.modal = function (html, bind, cls) {
    var bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal ' + (cls || '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(bg);
    var api = { el: bg, close: function () { bg.remove(); } };
    bg.addEventListener('mousedown', function (e) { if (e.target === bg && !bg.hasAttribute('data-sticky')) api.close(); });
    if (bind) bind(bg, api.close);
    return api;
  };
  A.confirm = function (title, body, ok, cancel, danger) {
    return new Promise(function (res) {
      var done = false;
      var m = A.modal('<h3>' + E(title) + '</h3><div class="muted" style="margin-top:8px">' + body + '</div><div class="btn-row"><button class="btn btn-ghost" data-r="0">' + E(cancel || '취소') + '</button><button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-r="1">' + E(ok || '확인') + '</button></div>',
        function (bg, close) { bg.addEventListener('click', function (e) { var b = e.target.closest('[data-r]'); if (b) { done = true; close(); res(b.getAttribute('data-r') === '1'); } }); });
      new MutationObserver(function (_, ob) { if (!document.body.contains(m.el)) { ob.disconnect(); if (!done) res(false); } }).observe(document.body, { childList: true });
    });
  };
  A.copy = function (text, msg) {
    var ok = function () { A.toast(msg || '복사했습니다.'); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
    function fallback() { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); ok(); } catch (e) { A.toast('복사할 수 없습니다.', 'err'); } t.remove(); }
  };
  A.download = function (blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  A.link = function (code) { return new URL('aseasurvey.html?c=' + encodeURIComponent(code), location.href).href; };
  A.fmt = SVY.fmtDate;
  A.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  A.phaseLabel = function (p) { return { draft: '준비 중', open: '응답 중', closed: '마감', result: '결과 공개' }[p] || p; };
  A.phaseBadge = function (p) { return '<span class="badge ' + ({ draft: 'badge-gray', open: 'badge-green', closed: 'badge-amber', result: 'badge-blue' }[p] || 'badge-gray') + '">' + A.phaseLabel(p) + '</span>'; };
  A.num = function (n, d) { return n == null || isNaN(n) ? '-' : Number(n).toFixed(d == null ? 2 : d); };
  A.toLocalInput = function (iso) { if (!iso) return ''; var d = new Date(iso); if (isNaN(d)) return ''; function p(n) { return ('0' + n).slice(-2); } return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };
  A.fromLocalInput = function (v) { return v ? new Date(v).toISOString() : ''; };

  A.rpc = function (fn, args) {
    args = Object.assign({ p_token: A.token }, args || {});
    return SVY.rpc(fn, args).catch(function (e) { if (e.code === 'AUTH_REQUIRED') { logout(true); } throw e; });
  };

  /* ───────────── 레이아웃 ───────────── */
  function shell(inner, opt) {
    opt = opt || {};
    $app.innerHTML = '<header class="hdr"><div class="hdr-in"><img class="logo" src="aseasurvey-logo.png" alt="아세아항공직업전문학교"><span class="hdr-title">설문 관리자</span>' +
      '<div class="hdr-actions"><button class="btn btn-ghost btn-sm" data-act="dbtest">' + I('server', 15) + ' DB 연결 테스트</button>' +
      (A.token ? '<button class="btn btn-ghost btn-sm" data-act="aitest">' + I('sparkle', 15) + ' AI 연결 테스트</button><button class="btn btn-ghost btn-sm" data-act="pw">비밀번호</button><button class="btn btn-ghost btn-sm" data-act="logout">로그아웃</button>' : '') +
      '</div></div></header><main class="wrap" id="main">' + inner + '</main>';
  }
  A.shell = shell;
  A.main = function () { return document.getElementById('main'); };

  /* ───────────── 로그인 ───────────── */
  function screenLogin(msg) {
    A.view = 'login';
    shell('<div class="card" style="max-width:420px;margin:48px auto"><div class="kicker">관리자 전용</div><h1 class="title" style="font-size:20px">설문 관리자 로그인</h1>' +
      '<label class="f" style="margin-top:14px">관리자 비밀번호</label><input id="pw" class="fld" type="password" autocomplete="current-password" placeholder="비밀번호">' +
      (msg ? '<div class="msg err">' + I('alert', 18) + '<div>' + E(msg) + '</div></div>' : '') +
      '<div class="btn-row"><button class="btn btn-primary" data-act="login">로그인</button></div>' +
      '<p class="hint" style="margin-top:12px">연결이 되지 않으면 상단의 「DB 연결 테스트」로 프로젝트 활성 상태를 먼저 확인해 주십시오.</p></div>');
    var pw = document.getElementById('pw'); if (pw) pw.focus();
  }
  async function login() {
    var pw = document.getElementById('pw').value;
    if (!pw) return;
    try {
      var r = await SVY.rpc('svy_a_login', { p_pw: pw });
      if (!r.ok) {
        var m = r.error === 'BAD_PASSWORD' ? '비밀번호가 올바르지 않습니다. 남은 시도 ' + r.left + '회' :
          r.error === 'LOCKED_OUT' ? '실패 횟수 초과로 잠겼습니다. ' + A.fmt(r.until) + ' 이후 다시 시도해 주십시오.' :
          r.error === 'ADMIN_NOT_SET' ? '관리자 비밀번호가 설정되지 않았습니다. db/README_survey.md 를 확인해 주십시오.' : '로그인할 수 없습니다.';
        return screenLogin(m);
      }
      A.token = r.token; try { sessionStorage.setItem('svya_token', A.token); } catch (e) {}
      route();
    } catch (e) { screenLogin(e.message); }
  }
  function logout(expired) {
    if (A.token && !expired) SVY.rpc('svy_a_logout', { p_token: A.token }).catch(function () {});
    A.token = ''; try { sessionStorage.removeItem('svya_token'); } catch (e) {}
    A.cur = null; A.work = null; screenLogin(expired ? '로그인이 만료되었습니다. 다시 로그인해 주십시오.' : '');
  }
  function changePw() {
    A.modal('<h3>비밀번호 변경</h3><label class="f">현재 비밀번호</label><input id="p0" class="fld" type="password"><label class="f">새 비밀번호 (8자 이상)</label><input id="p1" class="fld" type="password"><label class="f">새 비밀번호 확인</label><input id="p2" class="fld" type="password">' +
      '<div class="btn-row"><button class="btn btn-ghost" data-r="0">취소</button><button class="btn btn-primary" data-r="1">변경</button></div>', function (bg, close) {
      bg.addEventListener('click', async function (e) {
        var b = e.target.closest('[data-r]'); if (!b) return;
        if (b.getAttribute('data-r') === '0') return close();
        var p0 = bg.querySelector('#p0').value, p1 = bg.querySelector('#p1').value, p2 = bg.querySelector('#p2').value;
        if (p1 !== p2) return A.toast('새 비밀번호가 일치하지 않습니다.', 'err');
        try { var r = await A.rpc('svy_a_change_pw', { p_old: p0, p_new: p1 }); if (!r.ok) return A.toast(r.error === 'PW_TOO_SHORT' ? '8자 이상 입력해 주십시오.' : '현재 비밀번호가 올바르지 않습니다.', 'err'); close(); A.toast('비밀번호를 변경했습니다.'); }
        catch (er) { A.toast(er.message, 'err'); }
      });
    });
  }

  /* ───────────── DB 연결 테스트 (무료 플랜 활성 여부) ───────────── */
  function withTimeout(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { var e = new Error('TIMEOUT'); e.code = 'TIMEOUT'; rej(e); }, ms); })]); }
  function dbTest() {
    var steps = [
      { id: 'ping', t: '서버 응답 (프로젝트 활성 여부)' }, { id: 'speed', t: '응답 속도' }, { id: 'schema', t: '설문 테이블·함수 설치' },
      { id: 'size', t: 'DB 사용량 (무료 500MB)' }, { id: 'student', t: '학생 접속 경로' }, { id: 'write', t: '쓰기·삭제 (임시 설문 생성 후 삭제)' }
    ];
    var m = A.modal('<h3>DB 연결 테스트</h3><p class="muted" style="margin:4px 0 0">무료 플랜은 7일간 활동이 없으면 프로젝트가 일시정지됩니다. 배포 1~2일 전에 반드시 실행해 주십시오.</p>' +
      '<div class="steps" id="dbs">' + steps.map(function (s) { return '<div class="step" data-s="' + s.id + '"><span class="st wait">·</span><div><b>' + s.t + '</b><span>대기 중</span></div></div>'; }).join('') + '</div>' +
      '<label class="chk"><input type="checkbox" id="dbw" ' + (A.token ? '' : 'disabled') + '> 쓰기 점검 포함 (임시 설문을 만들었다가 바로 삭제합니다. 로그인 필요)</label>' +
      '<div id="dbsum"></div><div class="btn-row"><button class="btn btn-ghost" data-r="0">닫기</button><button class="btn btn-primary" data-r="1" id="dbgo">점검 실행</button></div>', function (bg, close) {
      bg.addEventListener('click', function (e) { var b = e.target.closest('[data-r]'); if (!b) return; if (b.getAttribute('data-r') === '0') close(); else run(bg); });
    }, 'wide');
    function set(bg, id, st, msg) {
      var el = bg.querySelector('[data-s="' + id + '"]'); if (!el) return;
      el.querySelector('.st').className = 'st ' + st; el.querySelector('.st').textContent = { ok: '✓', warn: '!', err: '×', wait: '·' }[st];
      el.querySelector('span:not(.st)').innerHTML = msg;
    }
    async function run(bg) {
      var btn = bg.querySelector('#dbgo'); btn.disabled = true; btn.textContent = '점검 중…';
      steps.forEach(function (s) { set(bg, s.id, 'wait', '대기 중'); }); bg.querySelector('#dbsum').innerHTML = '';
      var bad = 0, warn = 0, ms = null;
      // 1) 서버 응답
      try {
        var t0 = performance.now(); var r = await withTimeout(SVY.rpc('svy_ping'), 30000); ms = Math.round(performance.now() - t0);
        if (r && r.ok && r.schema) set(bg, 'ping', 'ok', '정상 응답 (프로젝트 활성 상태)'); else { set(bg, 'ping', 'err', '응답은 있으나 설문 스키마를 찾지 못했습니다. db/README_survey.md 를 확인해 주십시오.'); bad++; }
      } catch (e) {
        bad++;
        set(bg, 'ping', 'err', e.code === 'TIMEOUT' || e.code === 'NETWORK' ? '응답이 없습니다. <b>프로젝트가 일시정지되었을 수 있습니다.</b> Supabase 대시보드(<a href="https://supabase.com/dashboard/project/zbpeyklwpotjyveipzxd" target="_blank" rel="noopener">프로젝트 열기</a>)에서 「Restore project」를 누른 뒤 1~2분 후 다시 점검하십시오.' : E(e.message));
        ['speed', 'schema', 'size', 'student', 'write'].forEach(function (id) { set(bg, id, 'wait', '이전 단계 실패로 건너뜀'); });
        return end(bg, bad, warn);
      }
      // 2) 속도
      if (ms < 1500) set(bg, 'speed', 'ok', ms + 'ms · 양호'); else if (ms < 5000) { set(bg, 'speed', 'warn', ms + 'ms · 다소 느림 (재개 직후이거나 일시적 지연일 수 있습니다)'); warn++; } else { set(bg, 'speed', 'warn', ms + 'ms · 매우 느림 (방금 재개된 프로젝트일 수 있습니다. 1~2분 후 재점검)'); warn++; }
      // 3~4) 스키마·용량
      if (A.token) {
        try {
          var h = await withTimeout(A.rpc('svy_a_health'), 20000);
          if (h.tables >= 10 && h.functions >= 28) set(bg, 'schema', 'ok', '테이블 ' + h.tables + '개 · 함수 ' + h.functions + '개 설치됨');
          else { set(bg, 'schema', 'err', '테이블 ' + h.tables + '/10 · 함수 ' + h.functions + '/28 — 설치가 덜 되었습니다. db/README_survey.md 순서대로 SQL을 실행해 주십시오.'); bad++; }
          var pct = Math.round(h.db_mb / 500 * 100);
          set(bg, 'size', pct < 70 ? 'ok' : (pct < 90 ? 'warn' : 'err'), '약 ' + h.db_mb + 'MB / 500MB (' + pct + '%) · 설문 ' + h.surveys + '건 · 응답 ' + h.responses + '건 · 과목 ' + h.courses + '건');
          if (pct >= 70) warn++; if (pct >= 90) bad++;
        } catch (e) { set(bg, 'schema', 'err', E(e.message)); bad++; set(bg, 'size', 'wait', '건너뜀'); }
      } else { set(bg, 'schema', 'warn', '로그인 후 점검할 수 있습니다.'); set(bg, 'size', 'warn', '로그인 후 점검할 수 있습니다.'); warn += 2; }
      // 5) 학생 경로
      try { await SVY.rpc('svy_public', { p_code: 'zzzzzzzz' }); set(bg, 'student', 'warn', '예상과 다른 응답입니다.'); warn++; }
      catch (e) { if (e.code === 'NOT_FOUND') set(bg, 'student', 'ok', '학생용 함수 정상 (존재하지 않는 코드에 정상적으로 "없음" 응답)'); else { set(bg, 'student', 'err', E(e.message)); bad++; } }
      // 6) 쓰기
      if (bg.querySelector('#dbw').checked && A.token) {
        var tmp = null;
        try {
          var c = await withTimeout(A.rpc('svy_a_create', { p_title: '[연결 테스트] 자동 삭제', p_semester: '', p_def: {}, p_theme: {} }), 20000); tmp = c.id;
          await withTimeout(A.rpc('svy_a_delete', { p_id: tmp, p_force: true }), 20000); set(bg, 'write', 'ok', '임시 설문 생성 후 삭제까지 정상');
        } catch (e) { set(bg, 'write', 'err', E(e.message) + (tmp ? ' (임시 설문이 남았을 수 있습니다: 목록에서 삭제해 주십시오)' : '')); bad++; }
      } else set(bg, 'write', 'wait', '선택하지 않아 건너뜀');
      end(bg, bad, warn);
    }
    function end(bg, bad, warn) {
      try { localStorage.setItem('svya_last_dbtest', JSON.stringify({ at: Date.now(), bad: bad, warn: warn })); } catch (e) {}
      bg.querySelector('#dbgo').disabled = false; bg.querySelector('#dbgo').textContent = '다시 점검';
      bg.querySelector('#dbsum').innerHTML = bad ? '<div class="msg err">' + I('alert', 18) + '<div><b>문제가 있습니다.</b> 위 항목을 조치한 뒤 다시 점검해 주십시오.</div></div>' :
        warn ? '<div class="msg warn">' + I('alert', 18) + '<div><b>사용은 가능하나 확인이 필요합니다.</b></div></div>' : '<div class="msg ok">' + I('check', 18) + '<div><b>모두 정상입니다.</b> 설문을 배포하셔도 됩니다.</div></div>';
      if (A.view === 'list') renderListBanner();
    }
  }

  /* ───────────── AI 연결 테스트 ───────────── */
  function aiTest() {
    var P = window.getAIProviders ? window.getAIProviders() : null;
    var label = !P ? '(설정 모듈 없음)' : (P.active === 'official' ? '공식 Anthropic' : P.active === 'flow' ? 'Flow' : '서버 프록시');
    var m = A.modal('<h3>AI 연결 테스트</h3><p class="muted" style="margin:6px 0 0">index.html 의 「AI 제공자 설정」과 같은 설정을 그대로 사용합니다. (같은 브라우저·같은 주소에서 설정된 값)</p>' +
      '<div class="steps"><div class="step"><span class="st wait" id="aist">·</span><div><b>활성 제공자: ' + E(label) + '</b><span id="aimsg">점검 중…</span></div></div></div>' +
      '<div class="btn-row"><button class="btn btn-ghost" data-r="0">닫기</button><button class="btn btn-primary" data-r="1">다시 점검</button></div>', function (bg, close) {
      bg.addEventListener('click', function (e) { var b = e.target.closest('[data-r]'); if (!b) return; if (b.getAttribute('data-r') === '0') close(); else run(); });
    });
    async function run() {
      var st = m.el.querySelector('#aist'), msg = m.el.querySelector('#aimsg'); st.className = 'st wait'; st.textContent = '·'; msg.textContent = '점검 중…';
      if (!window.testClaudeConnection) { st.className = 'st err'; st.textContent = '×'; msg.textContent = 'AI 설정 모듈(config.js)을 불러오지 못했습니다. 페이지를 새로고침해 주십시오.'; return; }
      try { if (window.loadAIProvidersFromCloud) await window.loadAIProvidersFromCloud(); } catch (e) {}
      var r = await window.testClaudeConnection();
      st.className = 'st ' + (r.ok ? 'ok' : 'err'); st.textContent = r.ok ? '✓' : '×'; msg.textContent = r.message || (r.ok ? '정상' : '실패');
    }
    run();
  }

  /* ───────────── 설문 목록 ───────────── */
  async function loadList() { A.list = await A.rpc('svy_a_list'); return A.list; }
  function lastTestInfo() { try { return JSON.parse(localStorage.getItem('svya_last_dbtest') || 'null'); } catch (e) { return null; } }
  function renderListBanner() {
    var el = document.getElementById('dbban'); if (!el) return;
    var t = lastTestInfo(), days = t ? Math.floor((Date.now() - t.at) / 86400000) : null;
    var cls = !t ? 'warn' : (t.bad ? 'err' : (days >= 5 ? 'warn' : 'ok'));
    var txt = !t ? '아직 DB 연결 테스트를 실행하지 않았습니다. 무료 플랜은 7일간 활동이 없으면 일시정지되므로, 배포 전 점검해 주십시오.' :
      (t.bad ? '마지막 점검(' + A.fmt(t.at) + ')에서 문제가 있었습니다. 다시 점검해 주십시오.' : '마지막 DB 점검: ' + A.fmt(t.at) + ' (' + (days === 0 ? '오늘' : days + '일 전') + ')' + (days >= 5 ? ' — 일시정지 위험 기간입니다. 다시 점검해 주십시오.' : ' · 정상'));
    el.className = 'msg ' + cls; el.innerHTML = I(cls === 'ok' ? 'check' : 'alert', 18) + '<div style="flex:1">' + E(txt) + '</div><button class="btn btn-sm btn-ghost" data-act="dbtest">점검</button>';
  }
  async function screenList() {
    A.view = 'list'; A.cur = null; A.work = null;
    shell('<div class="pg-head"><h1>설문 목록</h1><span class="sp"></span><button class="btn btn-primary" data-act="newsvy">' + I('plus', 16) + ' 새 설문 만들기</button></div><div id="dbban" class="msg"></div><div id="cards" class="loading">불러오는 중…</div>');
    renderListBanner();
    try { await loadList(); } catch (e) { document.getElementById('cards').innerHTML = '<div class="msg err">' + E(e.message) + '</div>'; return; }
    var c = document.getElementById('cards');
    if (!A.list.length) { c.className = ''; c.innerHTML = '<div class="panel t-empty">등록된 설문이 없습니다. 「새 설문 만들기」로 시작해 주십시오.</div>'; return; }
    c.className = 'cards';
    c.innerHTML = A.list.map(function (s) {
      var rate = s.headcount ? Math.round((s.responses - (s.test_responses || 0)) / s.headcount * 100) : null;
      return '<div class="scard"><div class="row"><h3 class="sp">' + E(s.title) + '</h3>' + A.phaseBadge(s.phase) + '</div>' +
        '<div class="meta">' + (s.semester ? '<span class="badge badge-gray">' + E(s.semester) + '</span>' : '') + '<span class="badge badge-gray">v' + s.version + '</span>' +
        (s.test_mode ? '<span class="badge badge-amber">' + I('flask', 13) + ' 테스트 모드</span>' : '') + '</div>' +
        '<div class="stats"><div class="stat"><b>' + s.responses + '</b><span>응답' + (s.test_responses ? ' (테스트 ' + s.test_responses + ')' : '') + '</span></div><div class="stat"><b>' + (rate == null ? '-' : rate + '%') + '</b><span>응답률' + (s.headcount ? ' / ' + s.headcount + '명' : '') + '</span></div><div class="stat"><b>' + s.courses + '</b><span>등록 과목</span></div></div>' +
        '<div class="linkrow">' + I('link', 14) + '<code>' + E(A.link(s.code)) + '</code><button class="btn btn-sm btn-secondary" data-act="copylink" data-code="' + E(s.code) + '">복사</button></div>' +
        '<div class="row"><button class="btn btn-primary btn-sm" data-act="open" data-id="' + s.id + '">관리</button><button class="btn btn-secondary btn-sm" data-act="results" data-id="' + s.id + '">' + I('chart', 14) + ' 결과</button><button class="btn btn-ghost btn-sm" data-act="clone" data-id="' + s.id + '">복제</button><span class="sp"></span><button class="btn btn-ghost btn-sm" data-act="del" data-id="' + s.id + '" style="color:var(--red)">삭제</button></div></div>';
    }).join('');
  }
  function newSurvey() {
    var tpl = window.SVY_TEMPLATE;
    var past = A.list.map(function (s) { return '<option value="' + s.id + '">' + E(s.title) + (s.semester ? ' (' + E(s.semester) + ')' : '') + '</option>'; }).join('');
    A.modal('<h3>새 설문 만들기</h3><label class="f">설문 제목</label><input id="nt" class="fld" value="2026학년도 2학기 교육과정 개선 설문 조사"><label class="f">학기 표시 (선택)</label><input id="ns" class="fld" placeholder="예: 2026-2">' +
      '<label class="f">시작 방식</label><div class="opts list" id="nsrc">' +
      '<button type="button" class="opt" data-v="tpl" aria-pressed="true"><span class="box">' + I('check', 14) + '</span><span><b>기본 양식</b> (교육과정 개선 설문, docx 기준 · 문항 24개)</span></button>' +
      '<button type="button" class="opt" data-v="clone" aria-pressed="false"><span class="box">' + I('check', 14) + '</span><span><b>이전 설문 불러오기</b> (문항·안내문·디자인·과목·배포 인원 모두 복사)</span></button>' +
      '<button type="button" class="opt" data-v="ai" aria-pressed="false"><span class="box">' + I('check', 14) + '</span><span><b>AI로 설계</b> (docx·텍스트를 입력하면 설문 구성안 생성)</span></button>' +
      '<button type="button" class="opt" data-v="general" aria-pressed="false"><span class="box">' + I('check', 14) + '</span><span><b>일반 설문 (빈 양식)</b> — 행사 만족도·교직원 설문 등 1인 1회 응답. 문항 형식은 자유롭게 추가</span></button>' +
      '<button type="button" class="opt" data-v="blank" aria-pressed="false"><span class="box">' + I('check', 14) + '</span><span><b>과목별 평가 (빈 양식)</b></span></button></div>' +
      '<div id="nclone" class="hide"><label class="f">불러올 설문</label><select id="ncs" class="fld">' + (past || '<option value="">이력이 없습니다</option>') + '</select></div>' +
      '<div class="btn-row"><button class="btn btn-ghost" data-r="0">취소</button><button class="btn btn-primary" data-r="1">만들기</button></div>', function (bg, close) {
      var src = 'tpl';
      bg.addEventListener('click', async function (e) {
        var o = e.target.closest('#nsrc .opt');
        if (o) { src = o.getAttribute('data-v'); bg.querySelectorAll('#nsrc .opt').forEach(function (b) { b.setAttribute('aria-pressed', b === o); }); bg.querySelector('#nclone').classList.toggle('hide', src !== 'clone'); return; }
        var b = e.target.closest('[data-r]'); if (!b) return;
        if (b.getAttribute('data-r') === '0') return close();
        var title = bg.querySelector('#nt').value.trim(), sem = bg.querySelector('#ns').value.trim();
        if (src === 'ai') { close(); return A.ext.aiCreate && A.ext.aiCreate({ title: title, semester: sem }); }
        try {
          var def = src === 'tpl' ? tpl.def : src === 'general' ? { mode: 'general', intro: { title: title, subtitle: '', org: '아세아항공직업전문학교', notice: [] }, scales: tpl.def.scales, basic: [], sections: [{ id: 'S1', title: '설문 문항', note: '', questions: [] }] } : { intro: { title: title, subtitle: '', org: '아세아항공직업전문학교', notice: [] }, scales: tpl.def.scales, basic: [], sections: [] };
          var args = { p_title: title, p_semester: sem, p_def: def, p_theme: {} };
          if (src === 'clone') { var id = bg.querySelector('#ncs').value; if (!id) return A.toast('불러올 설문을 선택해 주십시오.', 'err'); args.p_clone_from = id; }
          var r = await A.rpc('svy_a_create', args); close(); A.toast('설문을 만들었습니다.'); location.hash = '#/s/' + r.id + '/overview';
        } catch (er) { A.toast(er.message, 'err'); }
      });
    });
  }

  /* ───────────── 설문 열기 / 저장 ───────────── */
  var WORK_KEYS = ['title', 'semester', 'status', 'def', 'theme', 'draw_cfg', 'open_at', 'close_at', 'result_from', 'draw_msg', 'test_mode'];
  A.load = async function (id) {
    var res = await Promise.all([A.rpc('svy_a_get', { p_id: id }), loadList()]);
    A.cur = res[0]; A.cur.item = A.list.filter(function (s) { return s.id === id; })[0] || {};
    A.work = {}; WORK_KEYS.forEach(function (k) { A.work[k] = A.clone(A.cur.survey[k] == null ? null : A.cur.survey[k]); });
    A.snap = JSON.stringify(A.work);
  };
  // 서버 데이터만 갱신하고 편집 중인 내용(A.work)은 유지
  A.refresh = async function () {
    var id = A.cur.survey.id, res = await Promise.all([A.rpc('svy_a_get', { p_id: id }), loadList()]);
    A.cur = res[0]; A.cur.item = A.list.filter(function (s) { return s.id === id; })[0] || {};
  };
  A.isDirty = function () { return !!A.work && JSON.stringify(A.work) !== A.snap; };
  A.save = async function (note) {
    var patch = {}, orig = A.cur.survey, defChanged = false;
    WORK_KEYS.forEach(function (k) { if (JSON.stringify(A.work[k]) !== JSON.stringify(orig[k] == null ? null : orig[k])) { patch[k] = A.work[k]; if (k === 'def') defChanged = true; } });
    if (!Object.keys(patch).length) { A.toast('변경 사항이 없습니다.'); return false; }
    if (defChanged && A.cur.item && A.cur.item.responses > 0) {
      var ok = await A.confirm('응답이 있는 설문입니다', '문항을 바꾸면 이미 받은 응답과 맞지 않을 수 있습니다. (문항 ID를 유지하면 기존 응답이 그대로 집계됩니다.) 계속 저장하시겠습니까?', '저장', '취소');
      if (!ok) return false;
    }
    try {
      var r = await A.rpc('svy_a_save', { p_id: orig.id, p_patch: patch, p_note: note || '' });
      await A.load(orig.id); A.toast('저장했습니다. (버전 v' + r.version + ')'); return true;
    } catch (e) { A.toast(e.message, 'err'); return false; }
  };
  var TAB_DEFS = [
    { id: 'overview', t: '개요·배포' }, { id: 'intro', t: '안내문' }, { id: 'questions', t: '문항' }, { id: 'courses', t: '과목·교수' },
    { id: 'targets', t: '배포 인원' }, { id: 'design', t: '디자인' }, { id: 'results', t: '결과 대시보드' }, { id: 'draw', t: '추첨·수령' }, { id: 'versions', t: '버전' }, { id: 'ai', t: 'AI 설계' }
  ];
  function tabsFor() { var gen = A.work && A.work.def && A.work.def.mode === 'general'; return TAB_DEFS.filter(function (t) { return !(gen && (t.id === 'courses' || t.id === 'targets')); }); }
  A.renderSurvey = function () {
    A.view = 'survey';
    var s = A.cur.survey, dirty = A.isDirty();
    shell('<div class="crumb"><a data-act="tolist">설문 목록</a> / ' + E(s.title) + '</div><div class="pg-head"><h1>' + E(A.work.title) + '</h1>' + A.phaseBadge(A.cur.phase) +
      (s.test_mode ? '<span class="badge badge-amber">' + I('flask', 13) + ' 테스트 모드</span>' : '') + '<span class="badge badge-gray">v' + s.version + '</span><span class="sp"></span>' +
      '<span id="dirty" class="badge badge-amber ' + (dirty ? '' : 'hide') + '">저장되지 않은 변경</span><button class="btn btn-primary" data-act="savework" ' + (dirty ? '' : 'disabled') + ' id="savebtn">' + I('check', 16) + ' 저장</button></div>' +
      '<div class="tabs" role="tablist">' + tabsFor().map(function (t) { return '<button class="tab" role="tab" data-act="tab" data-tab="' + t.id + '" aria-selected="' + (A.tab === t.id) + '">' + t.t + '</button>'; }).join('') + '</div><div id="tabbody"></div>');
    var fn = A.tabs[A.tab]; if (fn) fn(document.getElementById('tabbody')); else document.getElementById('tabbody').innerHTML = '<div class="panel t-empty">준비 중입니다.</div>';
  };
  A.markDirty = function () {
    var d = A.isDirty(), el = document.getElementById('dirty'), b = document.getElementById('savebtn');
    if (el) el.classList.toggle('hide', !d); if (b) b.disabled = !d;
  };
  window.addEventListener('beforeunload', function (e) { if (A.isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  /* ───────────── 라우팅 ───────────── */
  async function route() {
    if (!A.token) return screenLogin();
    var m = (location.hash || '').match(/^#\/s\/([0-9a-f-]{36})(?:\/(\w+))?/);
    if (!m) return screenList();
    A.tab = m[2] && TAB_DEFS.some(function (t) { return t.id === m[2]; }) ? m[2] : 'overview';
    if (A.cur && A.cur.survey.id === m[1] && A.work) return A.renderSurvey();
    shell('<div class="loading">불러오는 중…</div>');
    try { await A.load(m[1]); A.renderSurvey(); } catch (e) { A.toast(e.message, 'err'); location.hash = '#/'; }
  }
  A.go = function (tab) { if (A.cur) location.hash = '#/s/' + A.cur.survey.id + '/' + tab; };
  window.addEventListener('hashchange', function () { if (A.isDirty() && !/^#\/s\//.test(location.hash)) { if (!confirm('저장하지 않은 변경 사항이 있습니다. 이동하시겠습니까?')) { history.back(); return; } A.work = null; A.cur = null; } route(); });

  /* ───────────── 이벤트 ───────────── */
  document.addEventListener('click', async function (e) {
    var t = e.target.closest('[data-act]'); if (!t || !$app || !$app.contains(t)) return;
    var act = t.getAttribute('data-act'), id = t.getAttribute('data-id');
    if (act === 'login') login();
    else if (act === 'logout') logout();
    else if (act === 'pw') changePw();
    else if (act === 'dbtest') dbTest();
    else if (act === 'aitest') aiTest();
    else if (act === 'newsvy') newSurvey();
    else if (act === 'tolist') { location.hash = '#/'; }
    else if (act === 'open') location.hash = '#/s/' + id + '/overview';
    else if (act === 'results') location.hash = '#/s/' + id + '/results';
    else if (act === 'copylink') A.copy(A.link(t.getAttribute('data-code')), '설문 링크를 복사했습니다.');
    else if (act === 'clone') {
      var src = A.list.filter(function (s) { return s.id === id; })[0];
      var ok = await A.confirm('설문 복제', '「' + E(src.title) + '」의 문항·안내문·디자인·과목·배포 인원을 모두 복사해 새 설문을 만듭니다. (응답과 추첨은 복사하지 않습니다.)', '복제');
      if (ok) { try { var r = await A.rpc('svy_a_create', { p_title: '', p_semester: '', p_def: {}, p_theme: {}, p_clone_from: id }); A.toast('복제했습니다.'); location.hash = '#/s/' + r.id + '/overview'; } catch (er) { A.toast(er.message, 'err'); } }
    }
    else if (act === 'del') {
      var s = A.list.filter(function (x) { return x.id === id; })[0];
      var ok2 = await A.confirm('설문 삭제', '「' + E(s.title) + '」와(과) 과목·응답·추첨 기록이 모두 삭제됩니다.' + (s.responses ? '<br><b>응답 ' + s.responses + '건이 함께 삭제됩니다.</b>' : '') + '<br>삭제하면 복구할 수 없습니다.', '삭제', '취소', true);
      if (ok2) { try { await A.rpc('svy_a_delete', { p_id: id, p_force: true }); A.toast('삭제했습니다.'); screenList(); } catch (er) { A.toast(er.message, 'err'); } }
    }
    else if (act === 'tab') { A.go(t.getAttribute('data-tab')); }
    else if (act === 'savework') {
      var errs = A.beforeSave ? A.beforeSave() : [];
      if (errs.length) { A.toast('문항 오류 ' + errs.length + '건이 있어 저장할 수 없습니다. 문항 탭에서 확인해 주십시오.', 'err'); A.go('questions'); return; }
      await A.save(A.saveNote || ''); A.saveNote = ''; A.renderSurvey();
    }
  });

  A.start = async function () {
    $app = document.getElementById('app');
    try { A.token = sessionStorage.getItem('svya_token') || ''; } catch (e) { A.token = ''; }
    if (A.token) { try { await loadList(); } catch (e) { A.token = ''; } }
    route();
  };
})();
