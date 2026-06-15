'use strict';
/**
 * dormitory.js — 기숙사 관리 (시설·자원 ▸ 기숙사관리)
 *  백엔드: Supabase (CDN @supabase/supabase-js@2) · 관리자 Supabase Auth
 *
 *  구현 범위(프론트엔드 전체):
 *   대시보드 · 건물/호실 마스터 · 계약(개별/ xlsx 일괄 / OCR) ·
 *   기숙사비 납부 · 지출 · 단가 역산 엔진 · 고지서 발행(PDF 인쇄) ·
 *   수익·손익 통계 · 민원 관리
 *  외부 포털(민원 접수 / 입소자 셀프)은 dormitory/complaint.html · resident.html
 */
(function () {
  var ROOT = 'dorm-root';
  var SK_URL = 'asea_dorm_supabase_url', SK_KEY = 'asea_dorm_supabase_key';
  // 공용 기본 연결정보 — 모든 기기/사용자가 별도 입력 없이 자동 연결.
  // (anon 키는 공개용이라 노출돼도 안전 — 데이터 접근은 RLS+로그인으로 보호)
  var DEFAULT_URL = 'https://zbpeyklwpotjyveipzxd.supabase.co';
  var DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV5a2x3cG90anl2ZWlwenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTYxMDcsImV4cCI6MjA5NzA5MjEwN30.6JgoQ6rPRnmrbBTG68A-Y9HDQk40mnwubhXVnkZvHrQ';
  var _db = null, _session = null;
  var _st = { sub: 'dash', bid: null, cmode: 'manual' };

  /* ── 공통 헬퍼 ─────────────────────────────────────────── */
  function root() { return document.getElementById(ROOT); }
  function body() { return document.getElementById('dorm-body'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function won(n) { return (Number(n) || 0).toLocaleString('ko-KR'); }
  function num(v) { return parseInt(String(v == null ? '' : v).replace(/[^\d-]/g, ''), 10) || 0; }
  function toast(m, t) { try { if (typeof window.aseaToast === 'function') window.aseaToast(m, t); else console.log(m); } catch (e) {} }
  function cfg() { return { url: localStorage.getItem(SK_URL) || DEFAULT_URL, key: localStorage.getItem(SK_KEY) || DEFAULT_KEY }; }
  function who() { return (_session && _session.user && _session.user.email) || ''; }
  function loading() { body().innerHTML = '<p class="dorm-muted" style="padding:24px">불러오는 중…</p>'; }
  function errBox(e) { return '<div class="dorm-card"><p style="color:#dc2626">오류: ' + esc(e && e.message || e) +
    '</p><p class="dorm-muted">테이블이 없으면 <code>dormitory/schema.sql</code>을 Supabase에서 먼저 실행하세요.</p></div>'; }
  function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function monthsBetween(s, e) {
    var out = [], a = new Date(s + 'T00:00:00'), b = new Date(e + 'T00:00:00');
    var y = a.getFullYear(), m = a.getMonth();
    while (y < b.getFullYear() || (y === b.getFullYear() && m <= b.getMonth())) {
      out.push(y + '-' + pad(m + 1)); m++; if (m > 11) { m = 0; y++; } if (out.length > 60) break;
    }
    return out;
  }
  function fileToB64(file) { return new Promise(function (res, rej) {
    var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1]); }; r.onerror = rej; r.readAsDataURL(file); }); }

  function libReady() { return !!(window.supabase && window.supabase.createClient); }
  function ensureClient() {
    var c = cfg(); if (!c.url || !c.key || !libReady()) return null;
    if (_db) return _db;
    _db = window.supabase.createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true } });
    return _db;
  }

  /* ── 진입 ─────────────────────────────────────────────── */
  async function onTabOpen() {
    var r = root(); if (!r) return;
    if (!libReady()) { r.innerHTML = '<p style="padding:40px;text-align:center;color:#9ca3af">Supabase 라이브러리 로딩 중…</p>';
      setTimeout(function () { if (libReady()) onTabOpen(); }, 600); return; }
    var c = cfg();
    if (!c.url || !c.key) { renderSetup(); return; }
    if (!ensureClient()) { renderSetup('연결 정보를 확인하세요.'); return; }
    try { var s = await _db.auth.getSession(); _session = s && s.data ? s.data.session : null; } catch (e) { _session = null; }
    if (!_session) { renderLogin(); return; }
    renderApp();
  }

  /* ── 연결 설정 ─────────────────────────────────────────── */
  function renderSetup(msg) {
    var c = cfg();
    root().innerHTML = '<div class="dorm-card" style="max-width:560px;margin:24px auto">' +
      '<h2 class="dorm-h2">🏢 기숙사 관리 — Supabase 연결 설정</h2>' +
      '<p class="dorm-muted">최초 1회만 설정합니다. Supabase 프로젝트의 <b>Project URL</b>과 <b>anon public key</b>를 입력하세요. (대시보드 → Project Settings → API)</p>' +
      (msg ? '<p style="color:#dc2626;font-size:13px">' + esc(msg) + '</p>' : '') +
      '<label class="dorm-label">Project URL</label><input id="dorm-cfg-url" class="form-input" placeholder="https://xxxx.supabase.co" value="' + esc(c.url) + '">' +
      '<label class="dorm-label">anon public key</label><input id="dorm-cfg-key" class="form-input" placeholder="eyJhbGci..." value="' + esc(c.key) + '">' +
      '<p class="dorm-muted" style="margin-top:8px">먼저 <code>dormitory/schema.sql</code> 을 SQL Editor에서 실행해 테이블을 만들어 주세요.</p>' +
      '<div class="dorm-actions"><button id="dorm-cfg-save" class="btn btn-primary">저장하고 계속</button></div></div>';
    document.getElementById('dorm-cfg-save').addEventListener('click', function () {
      var u = (val('dorm-cfg-url') || '').trim().replace(/\/$/, ''), k = (val('dorm-cfg-key') || '').trim();
      if (!u || !k) { toast('URL과 키를 모두 입력하세요.', 'error'); return; }
      localStorage.setItem(SK_URL, u); localStorage.setItem(SK_KEY, k); _db = null; onTabOpen();
    });
  }

  /* ── 관리자 로그인 ─────────────────────────────────────── */
  function renderLogin() {
    root().innerHTML = '<div class="dorm-card" style="max-width:420px;margin:24px auto">' +
      '<h2 class="dorm-h2">🔐 기숙사 관리자 로그인</h2>' +
      '<p class="dorm-muted">Supabase에 등록된 관리자 계정으로 로그인하세요.</p>' +
      '<label class="dorm-label">이메일</label><input id="dorm-li-email" type="email" class="form-input">' +
      '<label class="dorm-label">비밀번호</label><input id="dorm-li-pw" type="password" class="form-input">' +
      '<div id="dorm-li-err" style="color:#dc2626;font-size:12px;margin-top:6px;display:none"></div>' +
      '<div class="dorm-actions"><button id="dorm-li-btn" class="btn btn-primary">로그인</button>' +
      '<button id="dorm-li-signup" class="btn btn-secondary">관리자 등록</button>' +
      '<button id="dorm-li-cfg" class="btn btn-ghost btn-sm">연결 설정</button></div></div>';
    var err = document.getElementById('dorm-li-err');
    function showErr(m) { err.style.display = 'block'; err.textContent = m; }
    document.getElementById('dorm-li-cfg').addEventListener('click', function () { renderSetup(); });
    document.getElementById('dorm-li-btn').addEventListener('click', async function () {
      var email = (val('dorm-li-email') || '').trim(), pw = val('dorm-li-pw');
      if (!email || !pw) { showErr('이메일과 비밀번호를 입력하세요.'); return; }
      this.disabled = true; var res = await _db.auth.signInWithPassword({ email: email, password: pw }); this.disabled = false;
      if (res.error) { showErr('로그인 실패: ' + res.error.message); return; }
      _session = res.data.session; renderApp();
    });
    document.getElementById('dorm-li-signup').addEventListener('click', async function () {
      var email = (val('dorm-li-email') || '').trim(), pw = val('dorm-li-pw');
      if (!email || pw.length < 6) { showErr('이메일과 6자 이상 비밀번호.'); return; }
      var res = await _db.auth.signUp({ email: email, password: pw });
      if (res.error) { showErr('등록 실패: ' + res.error.message); return; }
      if (res.data.session) { _session = res.data.session; renderApp(); }
      else toast('확인 메일 발송됨. 인증 후 로그인하세요.', 'info');
    });
  }

  /* ── 앱 본체 ───────────────────────────────────────────── */
  var SUBS = [
    { id: 'dash', label: '대시보드' }, { id: 'master', label: '건물·호실' },
    { id: 'contract', label: '계약 등록·조회' }, { id: 'esign', label: '전자계약' }, { id: 'payment', label: '기숙사비' },
    { id: 'expense', label: '지출' }, { id: 'price', label: '단가 역산' },
    { id: 'notice', label: '고지서' }, { id: 'stat', label: '수익·손익' }, { id: 'complaint', label: '민원' },
  ];
  function renderApp() {
    root().innerHTML = '<div class="dorm-top"><h2 class="dorm-title">🏢 기숙사 관리</h2>' +
      '<div class="dorm-user">' + esc(who()) + ' <button id="dorm-logout" class="btn btn-ghost btn-sm">로그아웃</button></div></div>' +
      '<div class="dorm-subtabs facility-subtab-bar" role="tablist">' +
      SUBS.map(function (s) { return '<button class="subtab-btn' + (_st.sub === s.id ? ' active' : '') + '" data-dsub="' + s.id + '">' + s.label + '</button>'; }).join('') +
      '</div><div id="dorm-body"></div>';
    document.getElementById('dorm-logout').addEventListener('click', async function () { try { await _db.auth.signOut(); } catch (e) {} _session = null; renderLogin(); });
    root().querySelectorAll('[data-dsub]').forEach(function (b) { b.addEventListener('click', function () { _st.sub = b.dataset.dsub; renderApp(); }); });
    renderBody();
  }
  function renderBody() {
    var f = { dash: renderDash, master: renderMaster, contract: renderContract, esign: renderEsign, payment: renderPayment,
      expense: renderExpense, price: renderPrice, notice: renderNotice, stat: renderStat, complaint: renderComplaint };
    (f[_st.sub] || renderDash)();
  }

  /* ── 대시보드 ─────────────────────────────────────────── */
  /* 계열·학생 임의 생성용 */
  var DEPTS = ['항공정비계열', '스마트안전진단계열', '항공관광계열', '항공보안계열', '국방경찰계열'];
  var SUR = '김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남'.split('');
  var GIV = '민서지현준우예수은하도윤시주연채다건정진성호영선경태승재원석아빈'.split('');
  function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function makeStudent(i) {
    var name = SUR[rint(0, SUR.length - 1)] + GIV[rint(0, GIV.length - 1)] + GIV[rint(0, GIV.length - 1)];
    var grade = Math.random() < 0.5 ? 1 : 2;
    var sno = (grade === 1 ? '2025' : '2024') + ('000' + (i + 1)).slice(-4);
    return { name: name, grade: grade, sno: sno, dept: DEPTS[rint(0, DEPTS.length - 1)],
      phone: '010-' + ('000' + rint(0, 9999)).slice(-4) + '-' + ('000' + rint(0, 9999)).slice(-4) };
  }

  async function renderDash() {
    loading();
    try {
      var b = await _db.from('dormitory_buildings').select('id', { count: 'exact', head: true });
      var r = await _db.from('dormitory_rooms').select('id', { count: 'exact', head: true });
      var rv = await _db.from('dormitory_rooms').select('id', { count: 'exact', head: true }).eq('is_vacant', true);
      var od = await _db.from('dormitory_payments').select('id', { count: 'exact', head: true }).eq('status', 'overdue');
      // 진행 계약 + 분류 집계
      var cs = await _db.from('dormitory_contracts').select('department,grade,dormitory_buildings(name),dormitory_rooms(room_type)').eq('status', 'active');
      var rows = (cs.data || []);
      var byB = {}, byD = {}, byG = { 1: 0, 2: 0 }, single = 0, dbl = 0;
      rows.forEach(function (x) {
        var bn = x.dormitory_buildings ? x.dormitory_buildings.name : '-'; byB[bn] = (byB[bn] || 0) + 1;
        if (x.department) byD[x.department] = (byD[x.department] || 0) + 1;
        if (x.grade) byG[x.grade] = (byG[x.grade] || 0) + 1;
        var t = x.dormitory_rooms ? x.dormitory_rooms.room_type : ''; if (t === '1인실') single++; else if (t === '2인실') dbl++;
      });
      var cards = [['건물', b.count || 0, '동'], ['호실', r.count || 0, '실'], ['공실', rv.count || 0, '실'],
        ['재실 인원', rows.length, '명'], ['미납(연체)', od.count || 0, '건']];
      function tile(map, unit) { var ks = Object.keys(map); if (!ks.length) return '<span class="dorm-muted">데이터 없음</span>';
        return ks.map(function (k) { return '<span class="dorm-chip">' + esc(k) + ' <b>' + (map[k]) + (unit || '명') + '</b></span>'; }).join(' '); }
      var html = '<div class="dorm-kpis">' + cards.map(function (c) {
        return '<div class="dorm-kpi"><div class="dorm-kpi-num">' + won(c[1]) + '<span>' + c[2] + '</span></div><div class="dorm-kpi-label">' + c[0] + '</div></div>'; }).join('') + '</div>';
      if (rows.length) {
        html += '<div class="dorm-card"><h3 class="dorm-h3">📊 현황 요약 (재실 ' + rows.length + '명)</h3>' +
          '<div class="dorm-sum"><div><div class="dorm-sum-t">건물별</div>' + tile(byB) + '</div>' +
          '<div><div class="dorm-sum-t">계열별</div>' + tile(byD) + '</div>' +
          '<div><div class="dorm-sum-t">학년별</div>' + tile({ '1학년': byG[1], '2학년': byG[2] }) + '</div>' +
          '<div><div class="dorm-sum-t">실 유형</div><span class="dorm-chip">독실 <b>' + single + '명</b></span> <span class="dorm-chip">2인1실 <b>' + dbl + '명</b></span></div></div></div>';
      }
      html += '<div class="dorm-card"><h3 class="dorm-h3">🧪 데모(샘플) 데이터 — 2025‑2학기</h3>' +
        '<p class="dorm-muted">교육·시연용으로 165명(6개 생활관, 독실/2인1실 혼합, 계열·학년 임의, 월 40~60만원)을 생성합니다. ' +
        '먼저 <code>dormitory/migration_2025_demo.sql</code> 을 Supabase에서 1회 실행하세요(필드 추가). 시연 후 일괄 삭제 가능합니다.</p>' +
        '<div class="dorm-actions"><button id="seed-gen" class="btn btn-primary">2025‑2학기 165명 생성</button>' +
        '<button id="seed-del" class="btn btn-ghost" style="color:#dc2626">데모 데이터 일괄 삭제</button></div>' +
        '<p id="seed-prog" class="dorm-muted" style="margin-top:8px"></p></div>';
      body().innerHTML = html;
      var g = document.getElementById('seed-gen'); if (g) g.addEventListener('click', function () { generateSeed(this); });
      var d = document.getElementById('seed-del'); if (d) d.addEventListener('click', function () { deleteDemo(this); });
    } catch (e) { body().innerHTML = errBox(e); }
  }

  /* ── 데모 데이터 생성 (2025‑2학기 165명) ──────────────── */
  async function generateSeed(btn) {
    if (!confirm('2025‑2학기 샘플(데모) 데이터 165명을 생성합니다. 계속할까요?')) return;
    if (btn) btn.disabled = true;
    var prog = document.getElementById('seed-prog'); function P(t) { if (prog) prog.textContent = t; }
    try {
      P('건물 생성 중…');
      var bnames = ['1생활관', '2생활관', '3생활관', '4생활관', '5생활관', '6생활관'];
      var bIns = await _db.from('dormitory_buildings').insert(bnames.map(function (n) {
        return { name: n, grade: 'A', base_price: 500000, is_demo: true, note: '[DEMO 2025-2]' }; })).select('id,name');
      if (bIns.error) throw bIns.error;
      var bByName = {}; bIns.data.forEach(function (x) { bByName[x.name] = x.id; });

      var students = []; for (var i = 0; i < 165; i++) students.push(makeStudent(i));

      P('호실 배정 중…');
      var rooms = [], seq = [1, 1, 1, 1, 1, 1], idx = 0, bi = 0;
      while (idx < 165) {
        var b = bi % 6, remaining = 165 - idx;
        var type = (remaining === 1) ? '독실' : (Math.random() < 0.5 ? '독실' : '2인1실');
        var cap = type === '독실' ? 1 : 2, occ = Math.min(cap, remaining);
        var s = seq[b]++; var floor = Math.floor((s - 1) / 10) + 1; var roomNum = floor * 100 + (((s - 1) % 10) + 1);
        var price = (type === '독실' ? rint(50, 60) : rint(40, 50)) * 10000;
        var ro = { building_id: bByName[bnames[b]], room_number: String(roomNum), room_type: type === '독실' ? '1인실' : '2인실',
          capacity: cap, floor: floor, unit_price: price, is_vacant: false, is_demo: true, _stu: [] };
        for (var k = 0; k < occ; k++) { ro._stu.push(idx); idx++; }
        rooms.push(ro); bi++;
      }
      P('호실 생성 중… (' + rooms.length + '실)');
      var rIns = await _db.from('dormitory_rooms').insert(rooms.map(function (x) {
        return { building_id: x.building_id, room_number: x.room_number, room_type: x.room_type, capacity: x.capacity,
          floor: x.floor, unit_price: x.unit_price, is_vacant: false, is_demo: true }; })).select('id,building_id,room_number');
      if (rIns.error) throw rIns.error;
      var rmap = {}; rIns.data.forEach(function (x) { rmap[x.building_id + '|' + x.room_number] = x.id; });
      rooms.forEach(function (x) { x._id = rmap[x.building_id + '|' + x.room_number]; });

      P('입소자 생성 중…');
      var resIns = await _db.from('dormitory_residents').insert(students.map(function (s2) {
        return { name: s2.name, student_no: s2.sno, phone: s2.phone, department: s2.dept, grade: s2.grade, is_demo: true }; })).select('id,student_no');
      if (resIns.error) throw resIns.error;
      var resByNo = {}; resIns.data.forEach(function (x) { resByNo[x.student_no] = x.id; });

      P('계약 생성 중…');
      var contracts = [];
      rooms.forEach(function (x) { x._stu.forEach(function (si) { var s3 = students[si];
        contracts.push({ resident_id: resByNo[s3.sno] || null, building_id: x.building_id, room_id: x._id, resident_name: s3.name,
          student_no: s3.sno, phone: s3.phone, start_date: '2025-09-01', end_date: '2026-02-28', contract_type: '학기별',
          unit_price: x.unit_price, deposit: 200000, source: 'seed', status: 'active', department: s3.dept, grade: s3.grade,
          semester: '2025-2', is_demo: true }); }); });
      var cIns = await _db.from('dormitory_contracts').insert(contracts).select('id,unit_price');
      if (cIns.error) throw cIns.error;

      P('납부 스케줄 생성 중…');
      var months = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02'];
      var pays = [];
      cIns.data.forEach(function (c) { months.forEach(function (m) { var paid = Math.random() < 0.6;
        pays.push({ contract_id: c.id, period: m, amount: c.unit_price, due_date: m + '-01', status: paid ? 'paid' : 'pending', paid_date: paid ? (m + '-03') : null }); }); });
      for (var ci = 0; ci < pays.length; ci += 300) { var pr = await _db.from('dormitory_payments').insert(pays.slice(ci, ci + 300)); if (pr.error) throw pr.error; }

      P('지출 샘플 생성 중…');
      var exC = ['유지보수비', '관리비', '인건비', '보험료', '행정비용'];
      var exs = []; for (var e = 0; e < 15; e++) exs.push({ expense_date: months[e % 6] + '-15', item_name: exC[e % 5] + ' ' + (e + 1) + '월분', category: exC[e % 5], amount: rint(50, 250) * 10000, is_demo: true });
      await _db.from('dormitory_expenses').insert(exs);

      P('완료! 165명 생성됨.');
      toast('2025‑2학기 샘플 데이터가 생성되었습니다.', 'success');
      renderDash();
    } catch (err) {
      var msg = (err && err.message) || err;
      if (/column .* does not exist|is_demo|department|grade|semester/i.test(String(msg)))
        msg = '필드가 없습니다 — Supabase에서 dormitory/migration_2025_demo.sql 을 먼저 실행하세요. (' + msg + ')';
      P('실패: ' + msg); toast('생성 실패: ' + msg, 'error');
    } finally { if (btn) btn.disabled = false; }
  }

  /* ── 데모 데이터 일괄 삭제 ─────────────────────────────── */
  async function deleteDemo(btn) {
    if (!confirm('데모(2025‑2학기) 데이터를 모두 삭제합니다. 되돌릴 수 없습니다. 계속할까요?')) return;
    if (btn) btn.disabled = true;
    var prog = document.getElementById('seed-prog'); function P(t) { if (prog) prog.textContent = t; }
    try {
      P('계약·납부 삭제 중…'); await _db.from('dormitory_contracts').delete().eq('is_demo', true);   // payments cascade
      P('입소자 삭제 중…');    await _db.from('dormitory_residents').delete().eq('is_demo', true);
      P('지출 삭제 중…');      await _db.from('dormitory_expenses').delete().eq('is_demo', true);
      P('건물·호실 삭제 중…'); await _db.from('dormitory_buildings').delete().eq('is_demo', true);    // rooms cascade
      await _db.from('dormitory_rooms').delete().eq('is_demo', true);
      P('데모 데이터 삭제 완료.');
      toast('데모 데이터를 삭제했습니다.', 'success'); renderDash();
    } catch (err) { P('실패: ' + (err.message || err)); toast('삭제 실패: ' + (err.message || err), 'error'); }
    finally { if (btn) btn.disabled = false; }
  }

  /* ── 건물·호실 마스터 ─────────────────────────────────── */
  async function renderMaster() {
    loading();
    var bs; try { bs = await _db.from('dormitory_buildings').select('*').order('name'); if (bs.error) throw bs.error; }
    catch (e) { body().innerHTML = errBox(e); return; }
    var list = bs.data || [];
    body().innerHTML = '<div class="dorm-grid2">' +
      '<div class="dorm-card"><h3 class="dorm-h3">건물 등록</h3>' +
        '<label class="dorm-label">건물명 *</label><input id="db-name" class="form-input">' +
        '<div class="dorm-row"><div><label class="dorm-label">등급</label><input id="db-grade" class="form-input" placeholder="A/B/C"></div>' +
        '<div><label class="dorm-label">기본 단가(월,원)</label><input id="db-price" class="form-input" inputmode="numeric" placeholder="350000"></div></div>' +
        '<label class="dorm-label">비고</label><input id="db-note" class="form-input">' +
        '<div class="dorm-actions"><button id="db-add" class="btn btn-primary">건물 추가</button></div></div>' +
      '<div class="dorm-card"><h3 class="dorm-h3">건물 목록</h3>' +
        (list.length ? '<div class="scroll-x"><table class="dorm-table"><thead><tr><th>건물</th><th>등급</th><th>기본단가</th><th>호실</th><th></th></tr></thead><tbody>' +
          list.map(function (b) { return '<tr><td>' + esc(b.name) + '</td><td>' + esc(b.grade || '-') + '</td><td>' + won(b.base_price) + '</td><td>' + (b.total_rooms || 0) + '</td>' +
            '<td><button class="btn btn-secondary btn-sm db-rooms" data-id="' + b.id + '" data-name="' + esc(b.name) + '" data-price="' + (b.base_price || 0) + '">호실 관리</button> ' +
            '<button class="btn btn-ghost btn-sm db-del" data-id="' + b.id + '">삭제</button></td></tr>'; }).join('') + '</tbody></table></div>'
          : '<p class="dorm-muted">등록된 건물이 없습니다.</p>') + '</div></div><div id="dorm-rooms"></div>';
    document.getElementById('db-add').addEventListener('click', async function () {
      var name = (val('db-name') || '').trim(); if (!name) { toast('건물명을 입력하세요.', 'error'); return; }
      var res = await _db.from('dormitory_buildings').insert({ name: name, grade: (val('db-grade') || '').trim(), base_price: num(val('db-price')), note: (val('db-note') || '').trim() });
      if (res.error) { toast('저장 실패: ' + res.error.message, 'error'); return; } toast('건물 등록 완료', 'success'); renderMaster();
    });
    body().querySelectorAll('.db-del').forEach(function (b) { b.addEventListener('click', async function () {
      if (!confirm('건물과 하위 호실이 모두 삭제됩니다. 계속할까요?')) return;
      var res = await _db.from('dormitory_buildings').delete().eq('id', this.dataset.id);
      if (res.error) { toast('삭제 실패: ' + res.error.message, 'error'); return; } _st.bid = null; renderMaster(); }); });
    body().querySelectorAll('.db-rooms').forEach(function (btn) { btn.addEventListener('click', function () {
      _st.bid = this.dataset.id; renderRooms(this.dataset.id, this.dataset.name, num(this.dataset.price)); }); });
    if (_st.bid) { var cur = list.filter(function (b) { return b.id === _st.bid; })[0]; if (cur) renderRooms(cur.id, cur.name, cur.base_price || 0); }
  }
  async function renderRooms(bid, bname, basePrice) {
    var wrap = document.getElementById('dorm-rooms'); wrap.innerHTML = '<div class="dorm-card"><p class="dorm-muted">호실 불러오는 중…</p></div>';
    var rs; try { rs = await _db.from('dormitory_rooms').select('*').eq('building_id', bid).order('room_number'); if (rs.error) throw rs.error; }
    catch (e) { wrap.innerHTML = errBox(e); return; }
    var rooms = rs.data || [];
    wrap.innerHTML = '<div class="dorm-card"><h3 class="dorm-h3">🚪 ' + esc(bname) + ' — 호실 관리</h3>' +
      '<div class="dorm-row4"><div><label class="dorm-label">호실번호 *</label><input id="rm-no" class="form-input" placeholder="201"></div>' +
      '<div><label class="dorm-label">유형</label><select id="rm-type" class="form-select"><option>1인실</option><option>2인실</option><option>다인실</option></select></div>' +
      '<div><label class="dorm-label">층</label><input id="rm-floor" class="form-input" inputmode="numeric"></div>' +
      '<div><label class="dorm-label">단가(월,원)</label><input id="rm-price" class="form-input" inputmode="numeric" value="' + (basePrice || '') + '"></div></div>' +
      '<div class="dorm-actions"><button id="rm-add" class="btn btn-primary">호실 추가</button></div>' +
      (rooms.length ? '<div class="scroll-x" style="margin-top:12px"><table class="dorm-table"><thead><tr><th>호실</th><th>유형</th><th>층</th><th>단가</th><th>상태</th><th></th></tr></thead><tbody>' +
        rooms.map(function (r) { return '<tr><td>' + esc(r.room_number) + '</td><td>' + esc(r.room_type) + '</td><td>' + (r.floor == null ? '-' : r.floor) + '</td><td>' + won(r.unit_price) + '</td>' +
          '<td>' + (r.is_vacant ? '<span class="dorm-badge vac">공실</span>' : '<span class="dorm-badge occ">입실</span>') + '</td>' +
          '<td><button class="btn btn-ghost btn-sm rm-del" data-id="' + r.id + '">삭제</button></td></tr>'; }).join('') + '</tbody></table></div>'
        : '<p class="dorm-muted" style="margin-top:12px">등록된 호실이 없습니다.</p>') + '</div>';
    document.getElementById('rm-add').addEventListener('click', async function () {
      var no = (val('rm-no') || '').trim(); if (!no) { toast('호실번호를 입력하세요.', 'error'); return; }
      var res = await _db.from('dormitory_rooms').insert({ building_id: bid, room_number: no, room_type: val('rm-type'),
        floor: parseInt(val('rm-floor'), 10) || null, unit_price: num(val('rm-price')), is_vacant: true });
      if (res.error) { toast('저장 실패: ' + res.error.message, 'error'); return; }
      await _db.from('dormitory_buildings').update({ total_rooms: rooms.length + 1 }).eq('id', bid);
      toast('호실 등록 완료', 'success'); renderRooms(bid, bname, basePrice);
    });
    wrap.querySelectorAll('.rm-del').forEach(function (b) { b.addEventListener('click', async function () {
      if (!confirm('이 호실을 삭제할까요?')) return; var res = await _db.from('dormitory_rooms').delete().eq('id', this.dataset.id);
      if (res.error) { toast('삭제 실패: ' + res.error.message, 'error'); return; } renderRooms(bid, bname, basePrice); }); });
  }

  /* ── 계약 등록·조회 (개별 / xlsx / OCR) ────────────────── */
  async function renderContract() {
    loading();
    var bs; try { bs = await _db.from('dormitory_buildings').select('id,name,base_price').order('name'); if (bs.error) throw bs.error; }
    catch (e) { body().innerHTML = errBox(e); return; }
    var blds = bs.data || [];
    if (!blds.length) { body().innerHTML = '<div class="dorm-card"><p class="dorm-muted">먼저 <b>건물·호실</b>에서 건물·호실을 등록하세요.</p></div>'; return; }

    body().innerHTML = '<div class="dorm-modebar">' +
        ['manual', 'xlsx', 'ocr'].map(function (m) { var lab = { manual: '개별 입력', xlsx: 'xlsx 일괄', ocr: 'OCR 스캔' }[m];
          return '<button class="dorm-mode' + (_st.cmode === m ? ' active' : '') + '" data-cmode="' + m + '">' + lab + '</button>'; }).join('') + '</div>' +
      '<div id="dorm-cform"></div><div id="dorm-ct-list" class="dorm-card"><p class="dorm-muted">목록 불러오는 중…</p></div>';
    body().querySelectorAll('[data-cmode]').forEach(function (b) { b.addEventListener('click', function () { _st.cmode = b.dataset.cmode; renderContract(); }); });

    if (_st.cmode === 'xlsx') renderXlsx(blds);
    else if (_st.cmode === 'ocr') renderOcr(blds);
    else renderManual(blds);
    loadContractList();
  }

  function bldOptions(blds) { return blds.map(function (b) { return '<option value="' + b.id + '" data-price="' + (b.base_price || 0) + '">' + esc(b.name) + '</option>'; }).join(''); }
  async function fillRoomSelect(bid, sel) {
    var rs = await _db.from('dormitory_rooms').select('id,room_number,room_type,unit_price,is_vacant').eq('building_id', bid).order('room_number');
    sel.innerHTML = '<option value="">—</option>' + (rs.data || []).map(function (r) {
      return '<option value="' + r.id + '" data-price="' + (r.unit_price || 0) + '">' + esc(r.room_number) + ' (' + esc(r.room_type) + ')' + (r.is_vacant ? '' : ' · 입실중') + '</option>'; }).join('');
  }
  function renderManual(blds) {
    document.getElementById('dorm-cform').innerHTML = '<div class="dorm-card"><h3 class="dorm-h3">계약 개별 등록</h3>' +
      '<div class="dorm-row4"><div><label class="dorm-label">건물 *</label><select id="ct-bld" class="form-select">' + bldOptions(blds) + '</select></div>' +
      '<div><label class="dorm-label">호실 *</label><select id="ct-room" class="form-select"><option value="">—</option></select></div>' +
      '<div><label class="dorm-label">성명 *</label><input id="ct-name" class="form-input"></div>' +
      '<div><label class="dorm-label">학번/사번</label><input id="ct-sno" class="form-input"></div></div>' +
      '<div class="dorm-row4"><div><label class="dorm-label">연락처</label><input id="ct-phone" class="form-input"></div>' +
      '<div><label class="dorm-label">계열</label><select id="ct-dept" class="form-select"><option value="">—</option>' + DEPTS.map(function (d) { return '<option>' + d + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="dorm-label">학년</label><select id="ct-grade" class="form-select"><option value="">—</option><option value="1">1학년</option><option value="2">2학년</option></select></div>' +
      '<div><label class="dorm-label">유형</label><select id="ct-type" class="form-select"><option>학기별</option><option>월별</option><option>연간</option></select></div></div>' +
      '<div class="dorm-row4"><div><label class="dorm-label">시작일 *</label><input id="ct-start" type="date" class="form-input"></div>' +
      '<div><label class="dorm-label">종료일 *</label><input id="ct-end" type="date" class="form-input"></div>' +
      '<div></div><div></div></div>' +
      '<div class="dorm-row4"><div><label class="dorm-label">단가(월,원)</label><input id="ct-price" class="form-input" inputmode="numeric"></div>' +
      '<div><label class="dorm-label">보증금(원)</label><input id="ct-dep" class="form-input" inputmode="numeric"></div>' +
      '<div style="grid-column:span 2"><label class="dorm-label">비고</label><input id="ct-note" class="form-input"></div></div>' +
      '<div class="dorm-actions"><button id="ct-save" class="btn btn-primary">계약 저장</button></div></div>';
    var bldSel = document.getElementById('ct-bld');
    bldSel.addEventListener('change', function () { fillRoomSelect(this.value, document.getElementById('ct-room')); });
    document.getElementById('ct-room').addEventListener('change', function () {
      var o = this.options[this.selectedIndex], p = o && o.getAttribute('data-price');
      if (p && !val('ct-price')) document.getElementById('ct-price').value = p; });
    fillRoomSelect(bldSel.value, document.getElementById('ct-room'));
    document.getElementById('ct-save').addEventListener('click', onSaveManual);
  }
  async function onSaveManual() {
    var name = (val('ct-name') || '').trim(), bid = val('ct-bld'), rid = val('ct-room'), start = val('ct-start'), end = val('ct-end');
    if (!name || !rid || !start || !end) { toast('건물·호실·성명·기간은 필수입니다.', 'error'); return; }
    if (start > end) { toast('종료일이 시작일보다 빠릅니다.', 'error'); return; }
    var btn = document.getElementById('ct-save'); btn.disabled = true;
    try {
      var dept = val('ct-dept') || null, grade = val('ct-grade') ? parseInt(val('ct-grade'), 10) : null;
      var resId = null; var ins = await _db.from('dormitory_residents').insert({ name: name, student_no: (val('ct-sno') || '').trim(), phone: (val('ct-phone') || '').trim(), department: dept, grade: grade }).select('id').single();
      if (!ins.error && ins.data) resId = ins.data.id;
      var c = await _db.from('dormitory_contracts').insert({ resident_id: resId, building_id: bid, room_id: rid, resident_name: name,
        student_no: (val('ct-sno') || '').trim(), phone: (val('ct-phone') || '').trim(), start_date: start, end_date: end,
        contract_type: val('ct-type'), unit_price: num(val('ct-price')), deposit: num(val('ct-dep')), source: 'manual', status: 'active',
        department: dept, grade: grade, semester: '2025-2', note: (val('ct-note') || '').trim(), created_by: who() });
      if (c.error) throw c.error;
      await _db.from('dormitory_rooms').update({ is_vacant: false }).eq('id', rid);
      toast('계약이 등록되었습니다.', 'success'); ['ct-name', 'ct-sno', 'ct-phone', 'ct-note', 'ct-price', 'ct-dep'].forEach(function (id) { document.getElementById(id).value = ''; });
      loadContractList();
    } catch (e) { toast('저장 실패: ' + (e.message || e), 'error'); } finally { btn.disabled = false; }
  }

  /* xlsx 일괄 */
  var XL_COLS = ['건물명', '호실', '성명', '학번/사번', '연락처', '계약시작일', '계약종료일', '유형', '단가', '보증금', '비고'];
  function renderXlsx(blds) {
    document.getElementById('dorm-cform').innerHTML = '<div class="dorm-card"><h3 class="dorm-h3">xlsx 일괄 업로드</h3>' +
      '<div class="dorm-actions"><button id="xl-tmpl" class="btn btn-secondary btn-sm">📥 양식 다운로드</button>' +
      '<label class="btn btn-primary btn-sm" style="cursor:pointer">📤 파일 선택<input id="xl-file" type="file" accept=".xlsx,.xls" hidden></label></div>' +
      '<p class="dorm-muted" style="margin-top:6px">컬럼: ' + XL_COLS.join(' | ') + '</p><div id="xl-preview"></div></div>';
    document.getElementById('xl-tmpl').addEventListener('click', function () {
      if (!window.XLSX) { toast('xlsx 라이브러리 로딩 중', 'error'); return; }
      var ws = XLSX.utils.aoa_to_sheet([XL_COLS, ['A동', '201', '홍길동', '20241234', '010-1234-5678', '2025-03-01', '2025-08-31', '학기별', 350000, 200000, '']]);
      var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '계약'); XLSX.writeFile(wb, '기숙사_계약_양식.xlsx');
    });
    document.getElementById('xl-file').addEventListener('change', function (e) { var f = e.target.files[0]; if (f) parseXlsx(f, blds); });
  }
  async function parseXlsx(file, blds) {
    var buf = await file.arrayBuffer(); var wb = XLSX.read(buf, { type: 'array' });
    var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    // 건물/호실 맵
    var bmap = {}; blds.forEach(function (b) { bmap[b.name.trim()] = b; });
    var rs = await _db.from('dormitory_rooms').select('id,building_id,room_number,unit_price,is_vacant');
    var rmap = {}; (rs.data || []).forEach(function (r) { rmap[r.building_id + '|' + String(r.room_number).trim()] = r; });
    var parsed = rows.map(function (r) {
      var bname = String(r['건물명'] || '').trim(), rno = String(r['호실'] || '').trim();
      var b = bmap[bname], room = b ? rmap[b.id + '|' + rno] : null;
      var errs = [];
      if (!bname || !b) errs.push('건물없음'); if (!rno || !room) errs.push('호실없음');
      if (!String(r['성명'] || '').trim()) errs.push('성명');
      var sd = fmtDate(r['계약시작일']), ed = fmtDate(r['계약종료일']);
      if (!sd) errs.push('시작일'); if (!ed) errs.push('종료일');
      return { raw: r, b: b, room: room, sd: sd, ed: ed, errs: errs };
    });
    var ok = parsed.filter(function (p) { return !p.errs.length; }), bad = parsed.filter(function (p) { return p.errs.length; });
    document.getElementById('xl-preview').innerHTML = '<div class="scroll-x" style="margin-top:12px"><table class="dorm-table"><thead><tr><th>상태</th><th>건물</th><th>호실</th><th>성명</th><th>기간</th><th>단가</th><th>오류</th></tr></thead><tbody>' +
      parsed.map(function (p) { return '<tr style="' + (p.errs.length ? 'background:#fef2f2' : '') + '"><td>' + (p.errs.length ? '⚠️' : '✅') + '</td>' +
        '<td>' + esc(p.raw['건물명']) + '</td><td>' + esc(p.raw['호실']) + '</td><td>' + esc(p.raw['성명']) + '</td><td>' + esc(p.sd || p.raw['계약시작일']) + '~' + esc(p.ed || p.raw['계약종료일']) + '</td>' +
        '<td>' + won(num(p.raw['단가'])) + '</td><td style="color:#dc2626">' + p.errs.join(',') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="dorm-actions"><button id="xl-save" class="btn btn-primary"' + (ok.length ? '' : ' disabled') + '>정상 ' + ok.length + '건 저장 (오류 ' + bad.length + '건 제외)</button></div>';
    document.getElementById('xl-save').addEventListener('click', async function () {
      this.disabled = true; var recs = ok.map(function (p) { return { building_id: p.b.id, room_id: p.room.id, resident_name: String(p.raw['성명']).trim(),
        student_no: String(p.raw['학번/사번'] || '').trim(), phone: String(p.raw['연락처'] || '').trim(), start_date: p.sd, end_date: p.ed,
        contract_type: String(p.raw['유형'] || '학기별').trim() || '학기별', unit_price: num(p.raw['단가']) || p.room.unit_price, deposit: num(p.raw['보증금']),
        source: 'xlsx', status: 'active', note: String(p.raw['비고'] || '').trim(), created_by: who() }; });
      var res = await _db.from('dormitory_contracts').insert(recs);
      if (res.error) { toast('저장 실패: ' + res.error.message, 'error'); this.disabled = false; return; }
      var rids = ok.map(function (p) { return p.room.id; });
      if (rids.length) await _db.from('dormitory_rooms').update({ is_vacant: false }).in('id', rids);
      toast(ok.length + '건 일괄 등록 완료', 'success'); loadContractList(); document.getElementById('xl-preview').innerHTML = '';
    });
  }
  function fmtDate(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && window.XLSX && XLSX.SSF) { var d = XLSX.SSF.parse_date_code(v); if (d) return d.y + '-' + pad(d.m) + '-' + pad(d.d); }
    var s = String(v).trim().replace(/[./]/g, '-'); var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]) : '';
  }

  /* OCR 스캔 */
  function renderOcr(blds) {
    document.getElementById('dorm-cform').innerHTML = '<div class="dorm-card"><h3 class="dorm-h3">OCR 스캔 등록 (종이 계약서)</h3>' +
      '<p class="dorm-muted">계약서 이미지를 올리면 AI가 항목을 추출해 개별 입력 폼에 채웁니다. 검토 후 저장하세요. (jpg/png)</p>' +
      '<div class="dorm-actions"><label class="btn btn-primary btn-sm" style="cursor:pointer">📷 이미지 선택<input id="oc-file" type="file" accept="image/*" hidden></label>' +
      '<span id="oc-status" class="dorm-muted"></span></div><div id="oc-form"></div></div>';
    document.getElementById('oc-file').addEventListener('change', async function (e) {
      var f = e.target.files[0]; if (!f) return;
      var st = document.getElementById('oc-status'); st.textContent = '🤖 AI 분석 중…';
      try {
        var data = await ocrExtract(f); st.textContent = '✅ 추출 완료 — 검토 후 저장';
        renderManual(blds);
        // prefill (개별 폼이 dorm-cform을 덮으므로 다시 oc 영역 없음 — 값 채움)
        if (data['성명']) document.getElementById('ct-name').value = data['성명'];
        if (data['연락처']) document.getElementById('ct-phone').value = data['연락처'];
        if (data['계약시작일']) document.getElementById('ct-start').value = data['계약시작일'];
        if (data['계약종료일']) document.getElementById('ct-end').value = data['계약종료일'];
        if (data['월납부금액']) document.getElementById('ct-price').value = data['월납부금액'];
        if (data['보증금']) document.getElementById('ct-dep').value = data['보증금'];
        toast('AI 추출값을 채웠습니다. 건물·호실을 선택하고 저장하세요.', 'info');
      } catch (err) { st.textContent = '⚠️ 추출 실패: ' + (err.message || err); }
    });
  }
  async function ocrExtract(file) {
    var cc = window.getClaudeConfig ? window.getClaudeConfig() : null;
    if (!cc || !cc.apiKey) throw new Error('설정 탭에서 Claude API 키를 먼저 저장하세요.');
    var b64 = await fileToB64(file); var media = file.type || 'image/jpeg';
    var prompt = '아래 이미지는 기숙사 입사 계약서입니다. 다음 정보를 JSON으로만 추출하세요. ' +
      '추출 항목: 성명, 연락처, 건물명, 호실, 계약시작일(YYYY-MM-DD), 계약종료일(YYYY-MM-DD), 월납부금액(숫자만), 보증금(숫자만). ' +
      '확인 불가는 null. 반드시 JSON만 반환.';
    var headers = { 'Content-Type': 'application/json', 'x-api-key': cc.apiKey, 'anthropic-version': '2023-06-01' };
    if (cc.isOfficial) headers['anthropic-dangerous-direct-browser-access'] = 'true';
    var res = await fetch(cc.endpoint, { method: 'POST', headers: headers, body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1024,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: media, data: b64 } }, { type: 'text', text: prompt }] }] }) });
    if (!res.ok) { var t = ''; try { var j = await res.json(); t = j.error && j.error.message; } catch (e) {} throw new Error(t || ('HTTP ' + res.status)); }
    var d = await res.json(); var text = d.content && d.content[0] && d.content[0].text || '';
    var mm = text.match(/\{[\s\S]*\}/); if (!mm) throw new Error('추출 결과 파싱 실패');
    try { _db.from('dormitory_ocr_logs').insert({ result_json: JSON.parse(mm[0]), success: true, created_by: who() }); } catch (e) {}
    return JSON.parse(mm[0]);
  }

  async function loadContractList() {
    var wrap = document.getElementById('dorm-ct-list'); if (!wrap) return;
    var cs = await _db.from('dormitory_contracts').select('*, dormitory_buildings(name), dormitory_rooms(room_number)').order('created_at', { ascending: false }).limit(50);
    if (cs.error) { wrap.innerHTML = errBox(cs.error); return; }
    var rows = cs.data || [];
    wrap.innerHTML = '<h3 class="dorm-h3">최근 계약 (' + rows.length + ')</h3>' + (rows.length ?
      '<div class="scroll-x"><table class="dorm-table"><thead><tr><th>성명</th><th>학번</th><th>계열</th><th>학년</th><th>건물·호실</th><th>기간</th><th>단가</th><th>상태</th></tr></thead><tbody>' +
      rows.map(function (c) { var loc = (c.dormitory_buildings ? c.dormitory_buildings.name : '') + ' ' + (c.dormitory_rooms ? c.dormitory_rooms.room_number + '호' : '');
        return '<tr><td>' + esc(c.resident_name) + '</td><td>' + esc(c.student_no || '-') + '</td><td>' + esc(c.department || '-') + '</td><td>' + (c.grade ? esc(c.grade) + '학년' : '-') + '</td><td>' + esc(loc.trim() || '-') + '</td><td>' + esc(c.start_date) + '~' + esc(c.end_date) + '</td>' +
          '<td>' + won(c.unit_price) + '</td><td><span class="dorm-badge ' + (c.status === 'active' ? 'occ' : 'vac') + '">' + esc(c.status) + '</span></td></tr>'; }).join('') +
      '</tbody></table></div>' : '<p class="dorm-muted">등록된 계약이 없습니다.</p>');
  }

  /* ── 기숙사비(납부) ────────────────────────────────────── */
  async function renderPayment() {
    loading();
    var cs; try { cs = await _db.from('dormitory_contracts').select('id,resident_name,student_no,unit_price,start_date,end_date,status').eq('status', 'active').order('resident_name'); if (cs.error) throw cs.error; }
    catch (e) { body().innerHTML = errBox(e); return; }
    var contracts = cs.data || [];
    var ps = await _db.from('dormitory_payments').select('*').order('due_date');
    var pays = (ps.data || []); var byC = {}; pays.forEach(function (p) { (byC[p.contract_id] = byC[p.contract_id] || []).push(p); });
    // 연체 자동 표시 갱신은 조회 시 계산만
    var billed = 0, paid = 0; pays.forEach(function (p) { billed += p.amount || 0; if (p.status === 'paid') paid += p.amount || 0; });
    var unpaid = billed - paid;
    body().innerHTML = '<div class="dorm-kpis"><div class="dorm-kpi"><div class="dorm-kpi-num">' + won(billed) + '<span>원</span></div><div class="dorm-kpi-label">총 청구</div></div>' +
      '<div class="dorm-kpi"><div class="dorm-kpi-num">' + won(paid) + '<span>원</span></div><div class="dorm-kpi-label">수납</div></div>' +
      '<div class="dorm-kpi"><div class="dorm-kpi-num" style="color:#dc2626">' + won(unpaid) + '<span>원</span></div><div class="dorm-kpi-label">미납</div></div></div>' +
      '<div class="dorm-card"><h3 class="dorm-h3">납부 스케줄 / 현황</h3><p class="dorm-muted">계약별로 월 납부 일정을 생성하고, 입금 확인 시 「수납」을 누르세요. (납부일 1일 기준)</p>' +
      (contracts.length ? contracts.map(function (c) {
        var list = (byC[c.id] || []); var has = list.length;
        return '<div class="dorm-paybox"><div class="dorm-payhd"><b>' + esc(c.resident_name) + '</b> <span class="dorm-muted">' + esc(c.student_no || '') + ' · ' + won(c.unit_price) + '원/월</span>' +
          (has ? '' : '<button class="btn btn-secondary btn-sm pay-gen" data-id="' + c.id + '" data-s="' + c.start_date + '" data-e="' + c.end_date + '" data-p="' + c.unit_price + '">납부 스케줄 생성</button>') + '</div>' +
          (has ? '<div class="scroll-x"><table class="dorm-table"><thead><tr><th>기간</th><th>금액</th><th>납부기한</th><th>상태</th><th></th></tr></thead><tbody>' +
            list.map(function (p) { var od = p.status !== 'paid' && p.due_date && p.due_date < todayStr();
              return '<tr><td>' + esc(p.period) + '</td><td>' + won(p.amount) + '</td><td>' + esc(p.due_date || '-') + '</td>' +
              '<td>' + (p.status === 'paid' ? '<span class="dorm-badge occ">완납</span>' : (od ? '<span class="dorm-badge" style="background:#fef2f2;color:#dc2626">연체</span>' : '<span class="dorm-badge vac">미납</span>')) + '</td>' +
              '<td>' + (p.status === 'paid' ? '<button class="btn btn-ghost btn-sm pay-un" data-id="' + p.id + '">취소</button>' : '<button class="btn btn-primary btn-sm pay-ok" data-id="' + p.id + '">수납</button>') + '</td></tr>'; }).join('') +
            '</tbody></table></div>' : '') + '</div>';
      }).join('') : '<p class="dorm-muted">진행 중 계약이 없습니다.</p>') + '</div>';
    body().querySelectorAll('.pay-gen').forEach(function (b) { b.addEventListener('click', async function () {
      var months = monthsBetween(this.dataset.s, this.dataset.e); var p = num(this.dataset.p), cid = this.dataset.id;
      var recs = months.map(function (m) { return { contract_id: cid, period: m, amount: p, due_date: m + '-01', status: 'pending' }; });
      var res = await _db.from('dormitory_payments').insert(recs); if (res.error) { toast('생성 실패: ' + res.error.message, 'error'); return; }
      toast(months.length + '개월 스케줄 생성', 'success'); renderPayment(); }); });
    body().querySelectorAll('.pay-ok').forEach(function (b) { b.addEventListener('click', async function () {
      await _db.from('dormitory_payments').update({ status: 'paid', paid_date: todayStr(), method: '수동' }).eq('id', this.dataset.id); renderPayment(); }); });
    body().querySelectorAll('.pay-un').forEach(function (b) { b.addEventListener('click', async function () {
      await _db.from('dormitory_payments').update({ status: 'pending', paid_date: null }).eq('id', this.dataset.id); renderPayment(); }); });
  }

  /* ── 지출 ──────────────────────────────────────────────── */
  var EXP_CATS = ['유지보수비', '관리비', '인건비', '보험료', '행정비용', '기타'];
  async function renderExpense() {
    loading();
    var es; try { es = await _db.from('dormitory_expenses').select('*, dormitory_buildings(name)').order('expense_date', { ascending: false }).limit(200); if (es.error) throw es.error; }
    catch (e) { body().innerHTML = errBox(e); return; }
    var rows = es.data || []; var bs = await _db.from('dormitory_buildings').select('id,name').order('name');
    var totals = {}; EXP_CATS.forEach(function (c) { totals[c] = 0; }); var sum = 0;
    rows.forEach(function (r) { totals[r.category] = (totals[r.category] || 0) + (r.amount || 0); sum += r.amount || 0; });
    var maxC = Math.max.apply(null, EXP_CATS.map(function (c) { return totals[c]; }).concat([1]));
    body().innerHTML = '<div class="dorm-grid2"><div class="dorm-card"><h3 class="dorm-h3">지출 등록</h3>' +
      '<div class="dorm-row"><div><label class="dorm-label">지출일</label><input id="ex-date" type="date" class="form-input" value="' + todayStr() + '"></div>' +
      '<div><label class="dorm-label">카테고리</label><select id="ex-cat" class="form-select">' + EXP_CATS.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></div></div>' +
      '<label class="dorm-label">항목명 *</label><input id="ex-item" class="form-input">' +
      '<div class="dorm-row"><div><label class="dorm-label">금액(원) *</label><input id="ex-amt" class="form-input" inputmode="numeric"></div>' +
      '<div><label class="dorm-label">건물 귀속</label><select id="ex-bld" class="form-select"><option value="">전체 공통</option>' + (bs.data || []).map(function (b) { return '<option value="' + b.id + '">' + esc(b.name) + '</option>'; }).join('') + '</select></div></div>' +
      '<label class="dorm-label">비고</label><input id="ex-note" class="form-input">' +
      '<div class="dorm-actions"><button id="ex-add" class="btn btn-primary">지출 추가</button></div></div>' +
      '<div class="dorm-card"><h3 class="dorm-h3">카테고리별 집계 (총 ' + won(sum) + '원)</h3>' +
      EXP_CATS.map(function (c) { var w = Math.round((totals[c] / maxC) * 100); return '<div class="dorm-bar-row"><span class="dorm-bar-lab">' + c + '</span><span class="dorm-bar"><span style="width:' + w + '%"></span></span><span class="dorm-bar-val">' + won(totals[c]) + '</span></div>'; }).join('') +
      '<div class="dorm-actions"><button id="ex-xls" class="btn btn-secondary btn-sm">📥 엑셀 내보내기</button></div></div></div>' +
      '<div class="dorm-card"><h3 class="dorm-h3">지출 목록</h3>' + (rows.length ?
        '<div class="scroll-x"><table class="dorm-table"><thead><tr><th>일자</th><th>카테고리</th><th>항목</th><th>건물</th><th>금액</th><th></th></tr></thead><tbody>' +
        rows.map(function (r) { return '<tr><td>' + esc(r.expense_date) + '</td><td>' + esc(r.category) + '</td><td>' + esc(r.item_name) + '</td><td>' + esc(r.dormitory_buildings ? r.dormitory_buildings.name : '공통') + '</td><td>' + won(r.amount) + '</td>' +
          '<td><button class="btn btn-ghost btn-sm ex-del" data-id="' + r.id + '">삭제</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="dorm-muted">지출 내역이 없습니다.</p>') + '</div>';
    document.getElementById('ex-add').addEventListener('click', async function () {
      var item = (val('ex-item') || '').trim(), amt = num(val('ex-amt')); if (!item || !amt) { toast('항목명과 금액을 입력하세요.', 'error'); return; }
      var res = await _db.from('dormitory_expenses').insert({ expense_date: val('ex-date') || todayStr(), item_name: item, category: val('ex-cat'), amount: amt, building_id: val('ex-bld') || null, note: (val('ex-note') || '').trim(), created_by: who() });
      if (res.error) { toast('저장 실패: ' + res.error.message, 'error'); return; } toast('지출 등록 완료', 'success'); renderExpense();
    });
    body().querySelectorAll('.ex-del').forEach(function (b) { b.addEventListener('click', async function () {
      if (!confirm('삭제할까요?')) return; await _db.from('dormitory_expenses').delete().eq('id', this.dataset.id); renderExpense(); }); });
    document.getElementById('ex-xls').addEventListener('click', function () {
      if (!window.XLSX) return; var aoa = [['일자', '카테고리', '항목', '건물', '금액', '비고']].concat(rows.map(function (r) { return [r.expense_date, r.category, r.item_name, r.dormitory_buildings ? r.dormitory_buildings.name : '공통', r.amount, r.note || '']; }));
      var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '지출'); XLSX.writeFile(wb, '기숙사_지출.xlsx');
    });
  }

  /* ── 단가 역산 엔진 ────────────────────────────────────── */
  async function renderPrice() {
    loading();
    var rs = await _db.from('dormitory_rooms').select('*, dormitory_buildings(name)').order('building_id');
    if (rs.error) { body().innerHTML = errBox(rs.error); return; }
    var rooms = rs.data || [];
    var ps = await _db.from('dormitory_payments').select('amount,status'); var income = 0; (ps.data || []).forEach(function (p) { if (p.status === 'paid') income += p.amount || 0; });
    var ex = await _db.from('dormitory_expenses').select('amount'); var expense = 0; (ex.data || []).forEach(function (e) { expense += e.amount || 0; });
    var avgCur = rooms.length ? Math.round(rooms.reduce(function (s, r) { return s + (r.unit_price || 0); }, 0) / rooms.length) : 0;
    body().innerHTML = '<div class="dorm-card"><h3 class="dorm-h3">📐 단가 역산 계산기</h3>' +
      '<div class="dorm-row4"><div><label class="dorm-label">기준 학기</label><input id="pr-sem" class="form-input" placeholder="2025-2학기"></div>' +
      '<div><label class="dorm-label">현재 총수입(자동)</label><input id="pr-inc" class="form-input" inputmode="numeric" value="' + income + '"></div>' +
      '<div><label class="dorm-label">현재 총지출(자동)</label><input id="pr-exp" class="form-input" inputmode="numeric" value="' + expense + '"></div>' +
      '<div><label class="dorm-label">학기 개월수</label><input id="pr-mon" class="form-input" inputmode="numeric" value="6"></div></div>' +
      '<div class="dorm-row4"><div><label class="dorm-label">목표 손익(원, 흑자+ / 적자-)</label><input id="pr-goal" class="form-input" inputmode="numeric" value="0"></div>' +
      '<div><label class="dorm-label">다음 학기 예상 입실(명)</label><input id="pr-head" class="form-input" inputmode="numeric"></div>' +
      '<div><label class="dorm-label">다음 학기 예상 지출</label><input id="pr-nexp" class="form-input" inputmode="numeric" value="' + expense + '"></div>' +
      '<div style="align-self:end"><button id="pr-calc" class="btn btn-primary" style="width:100%">단가 계산</button></div></div>' +
      '<div id="pr-result"></div></div><div id="pr-table"></div>';
    document.getElementById('pr-calc').addEventListener('click', function () {
      var months = num(val('pr-mon')) || 1, head = num(val('pr-head')), goal = num(val('pr-goal')), nexp = num(val('pr-nexp'));
      if (!head) { toast('예상 입실 인원을 입력하세요.', 'error'); return; }
      var targetIncome = nexp + goal; var avgNeed = Math.round(targetIncome / head / months);
      var rate = avgCur ? ((avgNeed - avgCur) / avgCur * 100) : 0;
      document.getElementById('pr-result').innerHTML = '<div class="dorm-kpis" style="margin-top:14px">' +
        '<div class="dorm-kpi"><div class="dorm-kpi-num">' + won(targetIncome) + '<span>원</span></div><div class="dorm-kpi-label">목표 수입</div></div>' +
        '<div class="dorm-kpi"><div class="dorm-kpi-num">' + won(avgNeed) + '<span>원</span></div><div class="dorm-kpi-label">평균 필요 단가</div></div>' +
        '<div class="dorm-kpi"><div class="dorm-kpi-num">' + won(avgCur) + '<span>원</span></div><div class="dorm-kpi-label">현재 평균 단가</div></div>' +
        '<div class="dorm-kpi"><div class="dorm-kpi-num" style="color:' + (rate >= 0 ? '#dc2626' : '#059669') + '">' + rate.toFixed(1) + '<span>%</span></div><div class="dorm-kpi-label">필요 인상률</div></div></div>';
      renderPriceTable(rooms, rate, val('pr-sem'));
    });
  }
  function renderPriceTable(rooms, rate, sem) {
    var wrap = document.getElementById('pr-table');
    wrap.innerHTML = '<div class="dorm-card"><h3 class="dorm-h3">건물·호실별 추천 단가 <span class="dorm-muted">(추천 = 현재×(1+인상률), 수동 조정 가능)</span></h3>' +
      '<div class="scroll-x"><table class="dorm-table"><thead><tr><th>건물</th><th>호실</th><th>현재</th><th>추천</th><th>최종(조정)</th></tr></thead><tbody>' +
      rooms.map(function (r) { var rec = Math.round((r.unit_price || 0) * (1 + rate / 100));
        return '<tr data-rid="' + r.id + '" data-cur="' + (r.unit_price || 0) + '"><td>' + esc(r.dormitory_buildings ? r.dormitory_buildings.name : '') + '</td><td>' + esc(r.room_number) + '</td>' +
        '<td>' + won(r.unit_price) + '</td><td class="pr-rec">' + won(rec) + '</td><td><input class="form-input pr-fin" inputmode="numeric" value="' + rec + '" style="width:120px"></td></tr>'; }).join('') +
      '</tbody></table></div><div id="pr-proj" class="dorm-muted" style="margin-top:8px"></div>' +
      '<div class="dorm-actions"><button id="pr-save" class="btn btn-primary">단가 확정 저장</button></div></div>';
    function recalc() { var sum = 0; wrap.querySelectorAll('tr[data-rid]').forEach(function (tr) { sum += num(tr.querySelector('.pr-fin').value); });
      document.getElementById('pr-proj').textContent = '최종 단가 월 합계: ' + won(sum) + '원 (입실 가정 시 월 수입 추정)'; }
    wrap.querySelectorAll('.pr-fin').forEach(function (i) { i.addEventListener('input', function () {
      var tr = i.closest('tr'), cur = num(tr.dataset.cur), v = num(i.value);
      var rec = num(tr.querySelector('.pr-rec').textContent);
      i.style.background = (rec && Math.abs(v - rec) > rec * 0.1) ? '#fff7ed' : ''; recalc(); }); });
    recalc();
    document.getElementById('pr-save').addEventListener('click', async function () {
      this.disabled = true; var hist = [], changed = 0;
      var ops = [];
      wrap.querySelectorAll('tr[data-rid]').forEach(function (tr) { var rid = tr.dataset.rid, cur = num(tr.dataset.cur), fin = num(tr.querySelector('.pr-fin').value);
        if (fin && fin !== cur) { ops.push(_db.from('dormitory_rooms').update({ unit_price: fin }).eq('id', rid)); hist.push({ room_id: rid, old_price: cur, new_price: fin, semester: sem, reason: '역산 단가 적용', changed_by: who() }); changed++; } });
      try { await Promise.all(ops); if (hist.length) await _db.from('dormitory_price_history').insert(hist);
        await _db.from('dormitory_price_calc_logs').insert({ semester: sem, input_json: { rate: rate }, result_json: { changed: changed }, confirmed: true, created_by: who() });
        toast(changed + '개 호실 단가가 확정되었습니다.', 'success');
      } catch (e) { toast('저장 실패: ' + (e.message || e), 'error'); } finally { this.disabled = false; }
    });
  }

  /* ── 고지서 발행 (인쇄 → PDF) ──────────────────────────── */
  async function renderNotice() {
    loading();
    var cs = await _db.from('dormitory_contracts').select('*, dormitory_buildings(name), dormitory_rooms(room_number,room_type,floor)').eq('status', 'active').order('resident_name');
    if (cs.error) { body().innerHTML = errBox(cs.error); return; }
    var rows = cs.data || [];
    body().innerHTML = '<div class="dorm-card"><h3 class="dorm-h3">🧾 고지서 발행</h3>' +
      '<div class="dorm-row4"><div><label class="dorm-label">학기/기간 표기</label><input id="nt-sem" class="form-input" placeholder="25.09~02월"></div>' +
      '<div><label class="dorm-label">납부 마감일</label><input id="nt-due" type="date" class="form-input"></div>' +
      '<div style="grid-column:span 2"><label class="dorm-label">납부 계좌 안내</label><input id="nt-acc" class="form-input" value="우리은행 1234-567-890123 (예금주: 아세아항공직업전문학교)"></div></div>' +
      '<div class="dorm-actions"><label class="dorm-cb"><input type="checkbox" id="nt-all"> 전체 선택</label>' +
      '<button id="nt-print" class="btn btn-primary">선택 고지서 발행(인쇄/PDF)</button></div>' +
      (rows.length ? '<div class="scroll-x" style="margin-top:10px"><table class="dorm-table"><thead><tr><th></th><th>성명</th><th>학번</th><th>건물·호실</th><th>월단가</th></tr></thead><tbody>' +
        rows.map(function (c) { return '<tr><td><input type="checkbox" class="nt-cb" value="' + c.id + '"></td><td>' + esc(c.resident_name) + '</td><td>' + esc(c.student_no || '-') + '</td>' +
          '<td>' + esc((c.dormitory_buildings ? c.dormitory_buildings.name : '') + ' ' + (c.dormitory_rooms ? c.dormitory_rooms.room_number + '호' : '')) + '</td><td>' + won(c.unit_price) + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="dorm-muted">진행 중 계약이 없습니다.</p>') + '</div>' +
      '<div class="dorm-card"><h3 class="dorm-h3">발행 이력</h3><div id="nt-hist"><p class="dorm-muted">불러오는 중…</p></div></div>';
    document.getElementById('nt-all').addEventListener('change', function () { body().querySelectorAll('.nt-cb').forEach(function (cb) { cb.checked = this.checked; }.bind(this)); });
    document.getElementById('nt-print').addEventListener('click', function () { onPrintNotices(rows); });
    loadNoticeHist();
  }
  async function onPrintNotices(rows) {
    var ids = []; body().querySelectorAll('.nt-cb:checked').forEach(function (cb) { ids.push(cb.value); });
    if (!ids.length) { toast('대상을 선택하세요.', 'error'); return; }
    var sem = val('nt-sem'), due = val('nt-due'), acc = val('nt-acc');
    var sel = rows.filter(function (c) { return ids.indexOf(c.id) !== -1; });
    var html = sel.map(function (c, i) {
      var loc = (c.dormitory_buildings ? c.dormitory_buildings.name : '') + ' ' + (c.dormitory_rooms ? c.dormitory_rooms.room_number + '호' : '');
      var no = 'DRM-' + new Date().getFullYear() + '-' + pad(i + 1);
      var amt = c.unit_price || 0, dep = c.deposit || 0, tot = amt + dep;
      return '<div class="nt-page"><div class="nt-org">(재) 아세아항공직업전문학교</div><h1 class="nt-h1">기숙사비 납부 고지서</h1>' +
        '<div class="nt-meta">발행일: ' + todayStr() + ' &nbsp; 고지번호: ' + no + '</div>' +
        '<table class="nt-tb"><tr><th>성명</th><td>' + esc(c.resident_name) + '</td><th>학번</th><td>' + esc(c.student_no || '') + '</td></tr>' +
        '<tr><th>건물·호실</th><td colspan="3">' + esc(loc) + '</td></tr></table>' +
        '<table class="nt-tb"><tr><th>항목</th><th>기간</th><th>금액</th></tr>' +
        '<tr><td>기숙사비</td><td>' + esc(sem) + '</td><td style="text-align:right">' + won(amt) + '원</td></tr>' +
        (dep ? '<tr><td>보증금</td><td></td><td style="text-align:right">' + won(dep) + '원</td></tr>' : '') +
        '<tr><td><b>합계</b></td><td></td><td style="text-align:right"><b>' + won(tot) + '원</b></td></tr></table>' +
        '<div class="nt-note">납부 마감일: <b>' + esc(due || '-') + '</b><br>납부 계좌: ' + esc(acc) + '<br>입금자명은 [성명+학번] 형식으로 입력해 주세요.<br>' +
        '<span style="color:#888">기한 내 미납 시 연체료가 부과될 수 있습니다.</span></div></div>'; });
    var w = window.open('', '_blank');
    w.document.write('<html><head><title>기숙사비 고지서</title><meta charset="utf-8"><style>' +
      'body{font-family:"Malgun Gothic",sans-serif;margin:0;color:#222}.nt-page{page-break-after:always;padding:24mm 18mm}' +
      '.nt-org{font-weight:700;color:#1a3a5c}.nt-h1{text-align:center;letter-spacing:8px;font-size:22pt;margin:14px 0}' +
      '.nt-meta{text-align:right;font-size:10pt;color:#555;margin-bottom:10px}.nt-tb{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:11pt}' +
      '.nt-tb th,.nt-tb td{border:1px solid #444;padding:7px 10px}.nt-tb th{background:#eef2f7;width:90px}.nt-note{font-size:10.5pt;line-height:1.9;margin-top:10px;border-top:1px solid #ccc;padding-top:10px}' +
      '</style></head><body>' + html.join('') + '</body></html>');
    w.document.close(); setTimeout(function () { try { w.print(); } catch (e) {} }, 400);
    // 발행 이력 저장
    var recs = sel.map(function (c, i) { return { contract_id: c.id, notice_no: 'DRM-' + new Date().getFullYear() + '-' + pad(i + 1), semester: sem, amount: (c.unit_price || 0) + (c.deposit || 0),
      fee_breakdown: { rent: c.unit_price || 0, deposit: c.deposit || 0 }, due_date: due || null, issued_by: who(), status: 'issued' }; });
    var res = await _db.from('dormitory_notices').insert(recs); if (!res.error) { toast(sel.length + '건 발행 완료', 'success'); loadNoticeHist(); }
  }
  async function loadNoticeHist() {
    var el = document.getElementById('nt-hist'); if (!el) return;
    var ns = await _db.from('dormitory_notices').select('*').order('created_at', { ascending: false }).limit(50);
    var rows = ns.data || [];
    el.innerHTML = rows.length ? '<div class="scroll-x"><table class="dorm-table"><thead><tr><th>고지번호</th><th>학기</th><th>금액</th><th>마감</th><th>발행일</th><th>상태</th></tr></thead><tbody>' +
      rows.map(function (n) { return '<tr><td>' + esc(n.notice_no || '-') + '</td><td>' + esc(n.semester || '') + '</td><td>' + won(n.amount) + '</td><td>' + esc(n.due_date || '-') + '</td><td>' + esc((n.issue_date || '').slice(0, 10)) + '</td><td>' + esc(n.status) + '</td></tr>'; }).join('') + '</tbody></table></div>'
      : '<p class="dorm-muted">발행 이력이 없습니다.</p>';
  }

  /* ── 수익·손익 통계 ────────────────────────────────────── */
  async function renderStat() {
    loading();
    var ps = await _db.from('dormitory_payments').select('amount,status'); var income = 0; (ps.data || []).forEach(function (p) { if (p.status === 'paid') income += p.amount || 0; });
    var ex = await _db.from('dormitory_expenses').select('amount,category'); var expense = 0, cat = {}; (ex.data || []).forEach(function (e) { expense += e.amount || 0; cat[e.category] = (cat[e.category] || 0) + (e.amount || 0); });
    var rv = await _db.from('dormitory_rooms').select('unit_price,is_vacant'); var vac = 0, vacLoss = 0; (rv.data || []).forEach(function (r) { if (r.is_vacant) { vac++; vacLoss += (r.unit_price || 0); } });
    var profit = income - expense; var maxIE = Math.max(income, expense, 1);
    body().innerHTML = '<div class="dorm-kpis">' +
      '<div class="dorm-kpi"><div class="dorm-kpi-num">' + won(income) + '<span>원</span></div><div class="dorm-kpi-label">총 수입(수납)</div></div>' +
      '<div class="dorm-kpi"><div class="dorm-kpi-num">' + won(expense) + '<span>원</span></div><div class="dorm-kpi-label">총 지출</div></div>' +
      '<div class="dorm-kpi"><div class="dorm-kpi-num" style="color:' + (profit >= 0 ? '#059669' : '#dc2626') + '">' + won(profit) + '<span>원</span></div><div class="dorm-kpi-label">순손익</div></div>' +
      '<div class="dorm-kpi"><div class="dorm-kpi-num">' + won(vacLoss) + '<span>원/월</span></div><div class="dorm-kpi-label">공실 손실(' + vac + '실)</div></div></div>' +
      '<div class="dorm-grid2"><div class="dorm-card"><h3 class="dorm-h3">수입 vs 지출</h3>' +
        '<div class="dorm-bar-row"><span class="dorm-bar-lab">수입</span><span class="dorm-bar"><span style="width:' + Math.round(income / maxIE * 100) + '%;background:#059669"></span></span><span class="dorm-bar-val">' + won(income) + '</span></div>' +
        '<div class="dorm-bar-row"><span class="dorm-bar-lab">지출</span><span class="dorm-bar"><span style="width:' + Math.round(expense / maxIE * 100) + '%;background:#dc2626"></span></span><span class="dorm-bar-val">' + won(expense) + '</span></div></div>' +
      '<div class="dorm-card"><h3 class="dorm-h3">지출 카테고리</h3>' +
        EXP_CATS.map(function (c) { var v = cat[c] || 0, w = expense ? Math.round(v / expense * 100) : 0; return '<div class="dorm-bar-row"><span class="dorm-bar-lab">' + c + '</span><span class="dorm-bar"><span style="width:' + w + '%"></span></span><span class="dorm-bar-val">' + won(v) + '</span></div>'; }).join('') + '</div></div>';
  }

  /* ── 민원 관리 ─────────────────────────────────────────── */
  var CM_TEMPLATES = ['접수되었습니다. 담당자 확인 후 처리 예정입니다.', '현재 처리 중에 있습니다. 빠른 시일 내 완료 예정입니다.', '처리가 완료되었습니다. 추가 문의 사항이 있으시면 연락 주세요.'];
  var _cmFilter = 'all', _cmOpen = null;
  async function renderComplaint() {
    loading();
    var q = _db.from('dormitory_complaints').select('*').order('created_at', { ascending: false }).limit(200);
    if (_cmFilter === 'in_progress') q = _db.from('dormitory_complaints').select('*').eq('status', 'in_progress').order('created_at', { ascending: false });
    if (_cmFilter === 'done') q = _db.from('dormitory_complaints').select('*').eq('status', 'done').order('created_at', { ascending: false });
    var cs = await q; if (cs.error) { body().innerHTML = errBox(cs.error); return; }
    var rows = cs.data || [];
    var tabs = [['all', '전체'], ['received', '접수'], ['in_progress', '처리중'], ['done', '완료']];
    body().innerHTML = portalPanel() + '<div class="dorm-card"><div class="dorm-modebar">' +
      tabs.map(function (t) { return '<button class="dorm-mode' + (_cmFilter === t[0] ? ' active' : '') + '" data-cmf="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      (rows.length ? '<div class="scroll-x" style="margin-top:10px"><table class="dorm-table"><thead><tr><th>접수번호</th><th>호실</th><th>성명</th><th>제목</th><th>분류</th><th>접수일</th><th>상태</th></tr></thead><tbody>' +
        rows.filter(function (r) { return _cmFilter === 'all' || _cmFilter === 'received' ? (_cmFilter === 'all' || r.status === 'received') : true; }).map(function (c) {
          return '<tr class="cm-row" data-id="' + c.id + '" style="cursor:pointer"><td>' + esc(c.ticket_no || '-') + '</td><td>' + esc(c.room_label || '-') + '</td><td>' + esc(c.resident_name || '-') + '</td>' +
          '<td>' + esc(c.title) + '</td><td>' + esc(c.category || '-') + '</td><td>' + esc((c.created_at || '').slice(0, 10)) + '</td><td>' + cmBadge(c.status) + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="dorm-muted" style="margin-top:10px">민원이 없습니다.</p>') + '</div><div id="cm-detail"></div>';
    body().querySelectorAll('[data-cmf]').forEach(function (b) { b.addEventListener('click', function () { _cmFilter = b.dataset.cmf; _cmOpen = null; renderComplaint(); }); });
    body().querySelectorAll('.cm-row').forEach(function (tr) { tr.addEventListener('click', function () { openComplaint(this.dataset.id); }); });
    bindPortalPanel();
    if (_cmOpen) openComplaint(_cmOpen);
  }

  /* 외부 포털 링크(설정 내장) — 입소자/민원 포털을 모바일로 공유 */
  function portalBase() {
    try { return (location.origin + location.pathname).replace(/[^/]*$/, ''); } catch (e) { return ''; }
  }
  function portalLink(page) {
    var c = cfg(); var k = '';
    try { k = btoa(unescape(encodeURIComponent(c.url + '\n' + c.key))); } catch (e) {}
    return portalBase() + 'dormitory/' + page + '?k=' + k;
  }
  function portalPanel() {
    return '<div class="dorm-card"><h3 class="dorm-h3">🔗 외부 포털 링크 (입소자 공유용)</h3>' +
      '<p class="dorm-muted">아래 링크에는 연결 정보(공개 anon key)가 포함되어 있어, 입소자가 그대로 접속할 수 있습니다.</p>' +
      '<div class="dorm-actions">' +
        '<button class="btn btn-secondary btn-sm" id="pt-resident">입소자 셀프 포털 링크 복사</button>' +
        '<button class="btn btn-secondary btn-sm" id="pt-complaint">민원 접수 포털 링크 복사</button>' +
        '<a class="btn btn-ghost btn-sm" id="pt-open-r" target="_blank" rel="noopener">입소자 포털 열기</a>' +
        '<a class="btn btn-ghost btn-sm" id="pt-open-c" target="_blank" rel="noopener">민원 포털 열기</a>' +
      '</div></div>';
  }
  function bindPortalPanel() {
    var lr = portalLink('resident.html'), lc = portalLink('complaint.html');
    var or = document.getElementById('pt-open-r'), oc = document.getElementById('pt-open-c');
    if (or) or.href = lr; if (oc) oc.href = lc;
    function copy(t) { try { navigator.clipboard.writeText(t).then(function () { toast('링크가 복사되었습니다.', 'success'); }); } catch (e) { prompt('링크 복사', t); } }
    var br = document.getElementById('pt-resident'), bc = document.getElementById('pt-complaint');
    if (br) br.addEventListener('click', function () { copy(lr); });
    if (bc) bc.addEventListener('click', function () { copy(lc); });
  }
  function cmBadge(s) { var m = { received: ['접수', 'vac'], in_progress: ['처리중', 'occ'], done: ['완료', 'occ'] }; var x = m[s] || ['?', 'vac']; return '<span class="dorm-badge ' + x[1] + '">' + x[0] + '</span>'; }
  async function openComplaint(id) {
    _cmOpen = id; var el = document.getElementById('cm-detail'); el.innerHTML = '<div class="dorm-card"><p class="dorm-muted">불러오는 중…</p></div>';
    var c = (await _db.from('dormitory_complaints').select('*').eq('id', id).single()).data;
    var cm = (await _db.from('dormitory_complaint_comments').select('*').eq('complaint_id', id).order('created_at')).data || [];
    if (!c) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="dorm-card"><h3 class="dorm-h3">' + esc(c.title) + ' <span class="dorm-muted">' + esc(c.ticket_no || '') + '</span></h3>' +
      '<p class="dorm-muted">' + esc(c.resident_name || '') + ' · ' + esc(c.room_label || '') + ' · ' + esc(c.category || '') + ' · ' + esc((c.created_at || '').slice(0, 16).replace('T', ' ')) + '</p>' +
      '<div class="dorm-cm-content">' + esc(c.content || '') + '</div>' +
      (c.attachment_url ? '<p><a href="' + esc(c.attachment_url) + '" target="_blank">첨부 보기</a></p>' : '') +
      '<div class="dorm-row"><div><label class="dorm-label">상태</label><select id="cm-status" class="form-select">' +
        ['received', 'in_progress', 'done'].map(function (s) { return '<option value="' + s + '"' + (c.status === s ? ' selected' : '') + '>' + { received: '접수', in_progress: '처리중', done: '완료' }[s] + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="dorm-label">담당자</label><input id="cm-assignee" class="form-input" value="' + esc(c.assignee || '') + '"></div></div>' +
      '<div class="dorm-actions"><button id="cm-save" class="btn btn-secondary btn-sm">상태/담당 저장</button></div>' +
      '<h4 class="dorm-label" style="margin-top:14px">처리 내역</h4><div class="dorm-cm-list">' +
        (cm.length ? cm.map(function (m) { return '<div class="dorm-cm-item"><b>' + esc(m.author || '관리자') + '</b> <span class="dorm-muted">' + esc((m.created_at || '').slice(0, 16).replace('T', ' ')) + '</span><div>' + esc(m.body) + '</div></div>'; }).join('') : '<p class="dorm-muted">아직 없습니다.</p>') + '</div>' +
      '<label class="dorm-label">댓글/답변</label><select id="cm-tmpl" class="form-select"><option value="">템플릿 선택…</option>' + CM_TEMPLATES.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select>' +
      '<textarea id="cm-body" class="form-input" rows="2" style="margin-top:6px"></textarea>' +
      '<div class="dorm-actions"><button id="cm-add" class="btn btn-primary btn-sm">답변 등록</button></div></div>';
    document.getElementById('cm-tmpl').addEventListener('change', function () { if (this.value) document.getElementById('cm-body').value = this.value; });
    document.getElementById('cm-save').addEventListener('click', async function () {
      await _db.from('dormitory_complaints').update({ status: val('cm-status'), assignee: (val('cm-assignee') || '').trim() }).eq('id', id); toast('저장됨', 'success'); renderComplaint();
    });
    document.getElementById('cm-add').addEventListener('click', async function () {
      var b = (val('cm-body') || '').trim(); if (!b) return;
      await _db.from('dormitory_complaint_comments').insert({ complaint_id: id, author: who(), body: b }); openComplaint(id);
    });
  }

  /* ── 전자계약(서명) ────────────────────────────────────── */
  var DEFAULT_TEMPLATE =
'[기숙사 입소(생활관) 계약서]\n\n' +
'제1조(목적) 본 계약은 아세아항공직업전문학교 기숙사(생활관) 입소에 관한 사항을 정함을 목적으로 한다.\n' +
'제2조(입소기간) 입소기간은 계약서에 명시된 시작일부터 종료일까지로 한다.\n' +
'제3조(기숙사비) 입소자는 계약서에 명시된 월 기숙사비 및 보증금을 정해진 기일 내에 납부한다.\n' +
'제4조(환불) 중도 퇴실 시 학교 규정에 따라 잔여 기간분을 정산·환불한다.\n' +
'제5조(생활수칙) 입소자는 생활관 규칙 및 안전수칙을 준수하며, 위반 시 퇴실 조치될 수 있다.\n' +
'제6조(퇴실) 퇴실 시 사전에 신청하고 시설 원상복구 및 비품 반납을 완료한다.\n' +
'제7조(개인정보) 입소 관리를 위해 수집된 개인정보는 관련 법령에 따라 보호·관리된다.\n\n' +
'※ 본 약관 문구는 관리자(전자계약 ▸ 계약서 양식)에서 수정할 수 있습니다.';

  function genToken() { return 'sg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function signLink(token) { return portalBase() + 'dormitory/contract-sign.html?t=' + token; }
  function signMsg(name, link) { return '[아세아 기숙사] ' + (name || '') + '님, 기숙사 입소계약서 전자서명 안내입니다.\n아래 링크에서 계약서 확인 후 서명해 주세요.\n' + link; }

  /* 전자계약 상태(필터/선택/양식) */
  var _es = { rows: [], blds: [], depts: [], tpls: {}, sel: {}, filt: { b: '', g: '', d: '', s: '' }, q: '' };
  function esBadge(s) { var m = { signed: ['서명완료', 'occ'], pending: ['서명대기', 'vac'] }; var x = m[s] || ['미발송', 'vac']; return '<span class="dorm-badge ' + x[1] + '">' + x[0] + '</span>'; }
  function uniq(a) { var o = {}, r = []; a.forEach(function (x) { if (x && !o[x]) { o[x] = 1; r.push(x); } }); return r.sort(); }
  function esById(id) { return _es.rows.filter(function (r) { return r.id === id; })[0]; }
  function esSelectedRows() { return _es.rows.filter(function (r) { return _es.sel[r.id]; }); }

  async function renderEsign() {
    loading();
    try {
      var tr = await _db.from('dormitory_settings').select('value').eq('key', 'contract_templates').limit(1);
      var tpls = {}; try { tpls = JSON.parse((tr.data && tr.data[0] && tr.data[0].value) || '{}'); } catch (e) {}
      if (!tpls || !Object.keys(tpls).length) tpls = { '기본': DEFAULT_TEMPLATE };
      _es.tpls = tpls;
      var bs = await _db.from('dormitory_buildings').select('name').order('name'); _es.blds = (bs.data || []).map(function (x) { return x.name; });
      var cs = await _db.from('dormitory_contracts').select('id,resident_name,student_no,phone,department,grade,sign_status,sign_token,dormitory_buildings(name),dormitory_rooms(room_number)').eq('status', 'active').order('resident_name').limit(1000);
      if (cs.error) throw cs.error;
      _es.rows = (cs.data || []).map(function (c) { return { id: c.id, name: c.resident_name || '', sno: c.student_no || '', phone: c.phone || '', dept: c.department || '', grade: c.grade || '', status: c.sign_status || 'none', token: c.sign_token || '', bld: (c.dormitory_buildings ? c.dormitory_buildings.name : ''), room: (c.dormitory_rooms ? c.dormitory_rooms.room_number : '') }; });
      _es.depts = uniq(_es.rows.map(function (r) { return r.dept; }));
      _es.sel = {};
      esRender();
    } catch (e) { body().innerHTML = errBox(e); }
  }

  function esRender() {
    var names = Object.keys(_es.tpls);
    var opt = function (arr, sel) { return arr.map(function (v) { return '<option' + (v === sel ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join(''); };
    body().innerHTML =
      '<div class="dorm-card"><h3 class="dorm-h3">📄 계약서 양식 관리 (여러 개 저장 가능 — 그룹마다 다른 약관 사용)</h3>' +
        '<div class="dorm-row"><div><label class="dorm-label">양식 선택/편집</label><select id="es-tpl-sel" class="form-select">' + opt(names, '') + '</select></div>' +
        '<div><label class="dorm-label">양식 이름 (새 이름 입력 시 새 양식 추가)</label><input id="es-tpl-name" class="form-input" value="' + esc(names[0] || '기본') + '"></div></div>' +
        '<label class="dorm-label">약관 문구 (학생 서명 페이지에 표시)</label>' +
        '<textarea id="es-tpl-text" class="form-input" rows="9" style="font-family:inherit;line-height:1.6">' + esc(_es.tpls[names[0]] || DEFAULT_TEMPLATE) + '</textarea>' +
        '<div class="dorm-actions"><button id="es-tpl-save" class="btn btn-primary">양식 저장</button><button id="es-tpl-del" class="btn btn-ghost" style="color:#dc2626">양식 삭제</button></div></div>' +
      '<div class="dorm-card"><h3 class="dorm-h3">✍️ 대상 선택 → 일괄/선택 발송</h3>' +
        '<div class="dorm-row4">' +
          '<div><label class="dorm-label">건물</label><select id="es-f-b" class="form-select"><option value="">전체 건물</option>' + opt(_es.blds, _es.filt.b) + '</select></div>' +
          '<div><label class="dorm-label">계열</label><select id="es-f-d" class="form-select"><option value="">전체 계열</option>' + opt(_es.depts, _es.filt.d) + '</select></div>' +
          '<div><label class="dorm-label">학년</label><select id="es-f-g" class="form-select"><option value="">전체 학년</option><option value="1">1학년</option><option value="2">2학년</option></select></div>' +
          '<div><label class="dorm-label">서명상태</label><select id="es-f-s" class="form-select"><option value="">전체 상태</option><option value="none">미발송</option><option value="pending">서명대기</option><option value="signed">서명완료</option></select></div>' +
        '</div>' +
        '<div class="dorm-row"><div><label class="dorm-label">이름/학번/호실 검색</label><input id="es-q" class="form-input" value="' + esc(_es.q) + '" placeholder="검색"></div>' +
        '<div><label class="dorm-label">발송 시 사용할 양식</label><select id="es-send-tpl" class="form-select">' + opt(names, '') + '</select></div></div>' +
        '<div class="dorm-actions" style="align-items:center;flex-wrap:wrap">' +
          '<button id="es-all" class="btn btn-secondary btn-sm">전체 선택</button>' +
          '<button id="es-none" class="btn btn-ghost btn-sm">전체 취소</button>' +
          '<button id="es-send" class="btn btn-primary">선택 발송(문자)</button>' +
          '<button id="es-copy-sel" class="btn btn-secondary">선택 링크 복사</button>' +
          '<span id="es-selcnt" class="dorm-muted"></span></div>' +
        '<div id="es-table"></div><div id="es-links"></div></div>';
    document.getElementById('es-f-g').value = _es.filt.g; document.getElementById('es-f-s').value = _es.filt.s;
    var sel = document.getElementById('es-tpl-sel');
    sel.addEventListener('change', function () { document.getElementById('es-tpl-name').value = this.value; document.getElementById('es-tpl-text').value = _es.tpls[this.value] || ''; });
    document.getElementById('es-tpl-save').addEventListener('click', esSaveTpl);
    document.getElementById('es-tpl-del').addEventListener('click', esDelTpl);
    function fb(id, key) { document.getElementById(id).addEventListener('change', function () { _es.filt[key] = this.value; esRenderTable(); }); }
    fb('es-f-b', 'b'); fb('es-f-d', 'd'); fb('es-f-g', 'g'); fb('es-f-s', 's');
    document.getElementById('es-q').addEventListener('input', function () { _es.q = this.value; esRenderTable(); });
    document.getElementById('es-all').addEventListener('click', function () { esFiltered().forEach(function (r) { _es.sel[r.id] = true; }); esRenderTable(); });
    document.getElementById('es-none').addEventListener('click', function () { _es.sel = {}; esRenderTable(); });
    document.getElementById('es-send').addEventListener('click', function () { esSend(this); });
    document.getElementById('es-copy-sel').addEventListener('click', esCopySel);
    esRenderTable();
  }

  function esFiltered() {
    var q = (_es.q || '').toLowerCase();
    return _es.rows.filter(function (r) {
      if (_es.filt.b && r.bld !== _es.filt.b) return false;
      if (_es.filt.d && r.dept !== _es.filt.d) return false;
      if (_es.filt.g && String(r.grade) !== _es.filt.g) return false;
      if (_es.filt.s && r.status !== _es.filt.s) return false;
      if (q && (r.name + ' ' + r.sno + ' ' + r.room).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }
  function esRenderTable() {
    var rows = esFiltered();
    document.getElementById('es-selcnt').textContent = '필터 ' + rows.length + '명 · 선택 ' + Object.keys(_es.sel).filter(function (k) { return _es.sel[k]; }).length + '명';
    var html = '<div class="scroll-x" style="margin-top:10px"><table class="dorm-table"><thead><tr><th></th><th>성명</th><th>학번</th><th>계열</th><th>학년</th><th>건물·호실</th><th>연락처</th><th>상태</th><th></th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td><input type="checkbox" class="es-cb" data-id="' + r.id + '"' + (_es.sel[r.id] ? ' checked' : '') + '></td>' +
        '<td>' + esc(r.name) + '</td><td>' + esc(r.sno || '-') + '</td><td>' + esc(r.dept || '-') + '</td><td>' + (r.grade ? esc(r.grade) + '학년' : '-') + '</td>' +
        '<td>' + esc((r.bld + ' ' + (r.room ? r.room + '호' : '')).trim() || '-') + '</td><td>' + esc(r.phone || '-') + '</td><td>' + esBadge(r.status) + '</td>' +
        '<td>' + (r.token ? '<button class="btn btn-ghost btn-sm es-row-copy" data-id="' + r.id + '">링크</button>' + (r.status === 'signed' ? ' <button class="btn btn-ghost btn-sm es-row-view" data-id="' + r.id + '">서명본</button>' : '') : '') + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
    var t = document.getElementById('es-table'); t.innerHTML = rows.length ? html : '<p class="dorm-muted" style="margin-top:10px">대상이 없습니다.</p>';
    t.querySelectorAll('.es-cb').forEach(function (cb) { cb.addEventListener('change', function () { _es.sel[this.dataset.id] = this.checked; esRenderTable(); }); });
    t.querySelectorAll('.es-row-copy').forEach(function (b) { b.addEventListener('click', function () { var r = esById(this.dataset.id); var l = signLink(r.token); try { navigator.clipboard.writeText(l).then(function () { toast('링크 복사됨', 'success'); }); } catch (e) { prompt('링크', l); } }); });
    t.querySelectorAll('.es-row-view').forEach(function (b) { b.addEventListener('click', function () { viewSigned(this.dataset.id); }); });
  }

  async function esSaveTpl() {
    var name = (val('es-tpl-name') || '').trim(); if (!name) { toast('양식 이름을 입력하세요.', 'error'); return; }
    var text = val('es-tpl-text');
    var oldSel = val('es-tpl-sel');
    if (oldSel && oldSel !== name && _es.tpls[oldSel] !== undefined) delete _es.tpls[oldSel];
    _es.tpls[name] = text;
    var def = _es.tpls['기본'] || _es.tpls[Object.keys(_es.tpls)[0]] || text;
    var now = new Date().toISOString();
    var r1 = await _db.from('dormitory_settings').upsert({ key: 'contract_templates', value: JSON.stringify(_es.tpls), updated_at: now });
    var r2 = await _db.from('dormitory_settings').upsert({ key: 'contract_template', value: def, updated_at: now });
    if (r1.error || r2.error) { toast('저장 실패', 'error'); return; }
    toast('양식 저장됨', 'success'); esRender();
  }
  async function esDelTpl() {
    var name = val('es-tpl-sel'); if (!name) return;
    if (Object.keys(_es.tpls).length <= 1) { toast('최소 1개 양식은 있어야 합니다.', 'error'); return; }
    if (!confirm('"' + name + '" 양식을 삭제할까요?')) return;
    delete _es.tpls[name];
    await _db.from('dormitory_settings').upsert({ key: 'contract_templates', value: JSON.stringify(_es.tpls), updated_at: new Date().toISOString() });
    toast('삭제됨', 'success'); esRender();
  }

  async function esEnsureLink(r, tplText) {
    var patch = { sign_template: tplText };
    if (!r.token) { r.token = genToken(); patch.sign_token = r.token; }
    if (r.status !== 'signed') patch.sign_status = 'pending';
    var u = await _db.from('dormitory_contracts').update(patch).eq('id', r.id);
    if (u.error) throw u.error;
    if (r.status !== 'signed') r.status = 'pending';
    return signLink(r.token);
  }

  async function esSend(btn) {
    var rows = esSelectedRows(); if (!rows.length) { toast('대상을 선택하세요.', 'error'); return; }
    var tplName = val('es-send-tpl'); var tplText = _es.tpls[tplName] || '';
    var todo = rows.filter(function (r) { return r.status !== 'signed'; });
    if (!todo.length) { toast('선택 대상이 모두 서명완료 상태입니다.', 'info'); return; }
    if (!confirm(todo.length + '명에게 "' + tplName + '" 양식으로 서명 요청을 발송합니다. (이미 서명완료 제외) 계속할까요?')) return;
    var smsOk = !!(window.SmsModule && SmsModule.sendDirect);
    if (btn) btn.disabled = true;
    var cnt = document.getElementById('es-selcnt'); var sent = 0, fail = 0, nophone = 0, manual = [];
    for (var i = 0; i < todo.length; i++) {
      var r = todo[i], link;
      try { link = await esEnsureLink(r, tplText); } catch (e) { fail++; continue; }
      var msg = signMsg(r.name, link);
      if (r.phone && smsOk) { try { await SmsModule.sendDirect(r.phone, msg, '기숙사 계약'); sent++; } catch (e2) { fail++; manual.push({ name: r.name, phone: r.phone, link: link }); } }
      else { if (!r.phone) nophone++; manual.push({ name: r.name, phone: r.phone, link: link }); }
      if (cnt) cnt.textContent = '발송 중… ' + (i + 1) + '/' + todo.length;
    }
    if (btn) btn.disabled = false;
    toast('발송 완료 — 성공 ' + sent + ' / 실패 ' + fail + (nophone ? (' / 번호없음 ' + nophone) : ''), 'success');
    var le = document.getElementById('es-links');
    if (manual.length) {
      le.innerHTML = '<div class="dorm-card" style="margin-top:12px"><h3 class="dorm-h3">문자 미발송분 링크 (' + manual.length + ') — 복사해 직접 전달</h3>' +
        '<textarea class="form-input" rows="6" id="es-manual" readonly>' + esc(manual.map(function (m) { return m.name + ' ' + (m.phone || '') + ' : ' + m.link; }).join('\n')) + '</textarea>' +
        '<div class="dorm-actions"><button id="es-manual-copy" class="btn btn-secondary btn-sm">목록 복사</button></div></div>';
      document.getElementById('es-manual-copy').addEventListener('click', function () { var t = document.getElementById('es-manual'); t.select(); try { document.execCommand('copy'); } catch (e) {} toast('복사됨', 'success'); });
    } else le.innerHTML = '';
    esRenderTable();
  }

  async function esCopySel() {
    var rows = esSelectedRows(); if (!rows.length) { toast('대상을 선택하세요.', 'error'); return; }
    var tplText = _es.tpls[val('es-send-tpl')] || '';
    var out = [];
    for (var i = 0; i < rows.length; i++) { var r = rows[i]; try { var link = await esEnsureLink(r, tplText); out.push(r.name + ' ' + (r.phone || '') + ' : ' + link); } catch (e) {} }
    var text = out.join('\n');
    try { navigator.clipboard.writeText(text).then(function () { toast(out.length + '개 링크 복사됨', 'success'); }); } catch (e) { prompt('링크 목록', text); }
    esRenderTable();
  }

  async function viewSigned(cid) {
    var c = (await _db.from('dormitory_contracts').select('*, dormitory_buildings(name), dormitory_rooms(room_number)').eq('id', cid).single()).data;
    if (!c) return;
    var w = window.open('', '_blank');
    var loc = (c.dormitory_buildings ? c.dormitory_buildings.name : '') + ' ' + (c.dormitory_rooms ? c.dormitory_rooms.room_number + '호' : '');
    w.document.write('<html><head><meta charset="utf-8"><title>서명본 — ' + esc(c.resident_name) + '</title>' +
      '<style>body{font-family:sans-serif;padding:24px;color:#222}h2{color:#1a3a5c}img{border:1px solid #ccc;border-radius:6px;max-width:320px}table{border-collapse:collapse}td,th{border:1px solid #444;padding:6px 10px;text-align:left}</style></head><body>' +
      '<h2>기숙사 입소계약 — 전자서명본</h2>' +
      '<table><tr><th>성명</th><td>' + esc(c.resident_name) + '</td><th>학번</th><td>' + esc(c.student_no || '') + '</td></tr>' +
      '<tr><th>건물·호실</th><td>' + esc(loc) + '</td><th>기간</th><td>' + esc(c.start_date) + '~' + esc(c.end_date) + '</td></tr>' +
      '<tr><th>개인정보 동의</th><td>' + (c.agree_privacy ? '동의' : '미동의') + '</td><th>서명일시</th><td>' + esc((c.signed_at || '').replace('T', ' ').slice(0, 19)) + '</td></tr></table>' +
      '<h3>학생 서명</h3>' + (c.student_sign_b64 ? '<img src="' + c.student_sign_b64 + '">' : '(없음)') +
      (c.guardian_name ? '<h3>보호자: ' + esc(c.guardian_name) + '</h3>' + (c.guardian_sign_b64 ? '<img src="' + c.guardian_sign_b64 + '">' : '') : '') +
      '</body></html>'); w.document.close();
  }

  window.DormModule = { onTabOpen: onTabOpen };
})();
