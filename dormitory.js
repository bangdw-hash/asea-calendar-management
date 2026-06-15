'use strict';
/**
 * dormitory.js — 기숙사 관리 (시설·자원 ▸ 기숙사관리)
 *  백엔드: Supabase (CDN @supabase/supabase-js@2)
 *  인증  : 관리자 Supabase Auth(이메일+비밀번호) → RLS authenticated 전체 CRUD
 *
 *  [1단계 구현] Supabase 연결 설정 · 관리자 로그인 · 건물/호실 마스터 ·
 *               계약 개별 등록/조회 (+대시보드 요약)
 *  [예정] xlsx 일괄·OCR 등록 / 납부·지출 / 단가 역산 / 고지서 / 통계 / 외부 포털
 */
(function () {
  var ROOT = 'dorm-root';
  var SK_URL = 'asea_dorm_supabase_url';
  var SK_KEY = 'asea_dorm_supabase_key';

  var _db = null, _session = null;
  var _st = { sub: 'dash', bid: null };

  function root() { return document.getElementById(ROOT); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function won(n) { return (Number(n) || 0).toLocaleString('ko-KR'); }
  function toast(m, t) { try { if (typeof window.aseaToast === 'function') window.aseaToast(m, t); else console.log(m); } catch (e) {} }
  function cfg() { return { url: localStorage.getItem(SK_URL) || '', key: localStorage.getItem(SK_KEY) || '' }; }

  function libReady() { return !!(window.supabase && window.supabase.createClient); }
  function ensureClient() {
    var c = cfg();
    if (!c.url || !c.key || !libReady()) return null;
    if (_db) return _db;
    _db = window.supabase.createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true } });
    return _db;
  }

  /* ── 진입 ─────────────────────────────────────────────── */
  async function onTabOpen() {
    var r = root(); if (!r) return;
    if (!libReady()) {
      r.innerHTML = '<p style="padding:40px;text-align:center;color:#9ca3af">Supabase 라이브러리 로딩 중… 잠시 후 다시 들어와 주세요.</p>';
      setTimeout(function () { if (libReady()) onTabOpen(); }, 600);
      return;
    }
    var c = cfg();
    if (!c.url || !c.key) { renderSetup(); return; }
    if (!ensureClient()) { renderSetup('연결 정보를 확인하세요.'); return; }
    try { var s = await _db.auth.getSession(); _session = s && s.data ? s.data.session : null; }
    catch (e) { _session = null; }
    if (!_session) { renderLogin(); return; }
    renderApp();
  }

  /* ── 연결 설정 ─────────────────────────────────────────── */
  function renderSetup(msg) {
    var c = cfg();
    root().innerHTML =
      '<div class="dorm-card" style="max-width:560px;margin:24px auto">' +
        '<h2 class="dorm-h2">🏢 기숙사 관리 — Supabase 연결 설정</h2>' +
        '<p class="dorm-muted">최초 1회만 설정합니다. Supabase 프로젝트의 <b>Project URL</b>과 <b>anon public key</b>를 입력하세요. ' +
          '(대시보드 → Project Settings → API)</p>' +
        (msg ? '<p style="color:#dc2626;font-size:13px">' + esc(msg) + '</p>' : '') +
        '<label class="dorm-label">Project URL</label>' +
        '<input id="dorm-cfg-url" class="form-input" placeholder="https://xxxx.supabase.co" value="' + esc(c.url) + '">' +
        '<label class="dorm-label">anon public key</label>' +
        '<input id="dorm-cfg-key" class="form-input" placeholder="eyJhbGci..." value="' + esc(c.key) + '">' +
        '<p class="dorm-muted" style="margin-top:8px">먼저 <code>dormitory/schema.sql</code> 을 Supabase SQL Editor에서 실행해 테이블을 만들어 주세요.</p>' +
        '<div class="dorm-actions"><button id="dorm-cfg-save" class="btn btn-primary">저장하고 계속</button></div>' +
      '</div>';
    document.getElementById('dorm-cfg-save').addEventListener('click', function () {
      var u = (document.getElementById('dorm-cfg-url').value || '').trim().replace(/\/$/, '');
      var k = (document.getElementById('dorm-cfg-key').value || '').trim();
      if (!u || !k) { toast('URL과 키를 모두 입력하세요.', 'error'); return; }
      localStorage.setItem(SK_URL, u); localStorage.setItem(SK_KEY, k);
      _db = null; onTabOpen();
    });
  }

  /* ── 관리자 로그인 (Supabase Auth) ─────────────────────── */
  function renderLogin() {
    root().innerHTML =
      '<div class="dorm-card" style="max-width:420px;margin:24px auto">' +
        '<h2 class="dorm-h2">🔐 기숙사 관리자 로그인</h2>' +
        '<p class="dorm-muted">Supabase에 등록된 관리자 계정으로 로그인하세요.</p>' +
        '<label class="dorm-label">이메일</label>' +
        '<input id="dorm-li-email" type="email" class="form-input" autocomplete="username">' +
        '<label class="dorm-label">비밀번호</label>' +
        '<input id="dorm-li-pw" type="password" class="form-input" autocomplete="current-password">' +
        '<div id="dorm-li-err" style="color:#dc2626;font-size:12px;margin-top:6px;display:none"></div>' +
        '<div class="dorm-actions">' +
          '<button id="dorm-li-btn" class="btn btn-primary">로그인</button>' +
          '<button id="dorm-li-signup" class="btn btn-secondary">관리자 등록</button>' +
          '<button id="dorm-li-cfg" class="btn btn-ghost btn-sm">연결 설정</button>' +
        '</div>' +
      '</div>';
    var err = document.getElementById('dorm-li-err');
    function showErr(m) { err.style.display = 'block'; err.textContent = m; }
    document.getElementById('dorm-li-cfg').addEventListener('click', function () { renderSetup(); });
    document.getElementById('dorm-li-btn').addEventListener('click', async function () {
      var email = (document.getElementById('dorm-li-email').value || '').trim();
      var pw = document.getElementById('dorm-li-pw').value || '';
      if (!email || !pw) { showErr('이메일과 비밀번호를 입력하세요.'); return; }
      this.disabled = true;
      var res = await _db.auth.signInWithPassword({ email: email, password: pw });
      this.disabled = false;
      if (res.error) { showErr('로그인 실패: ' + res.error.message); return; }
      _session = res.data.session; renderApp();
    });
    document.getElementById('dorm-li-signup').addEventListener('click', async function () {
      var email = (document.getElementById('dorm-li-email').value || '').trim();
      var pw = document.getElementById('dorm-li-pw').value || '';
      if (!email || pw.length < 6) { showErr('이메일과 6자 이상 비밀번호를 입력하세요.'); return; }
      var res = await _db.auth.signUp({ email: email, password: pw });
      if (res.error) { showErr('등록 실패: ' + res.error.message); return; }
      if (res.data.session) { _session = res.data.session; renderApp(); }
      else toast('확인 메일이 발송되었습니다. 메일 인증 후 로그인하세요.', 'info');
    });
  }

  /* ── 앱 본체 ───────────────────────────────────────────── */
  var SUBS = [
    { id: 'dash',     label: '대시보드' },
    { id: 'master',   label: '건물·호실' },
    { id: 'contract', label: '계약 등록·조회' },
    { id: 'payment',  label: '기숙사비' },
    { id: 'expense',  label: '지출' },
    { id: 'price',    label: '단가 역산' },
    { id: 'notice',   label: '고지서' },
    { id: 'stat',     label: '통계' },
    { id: 'complaint',label: '민원' },
  ];
  function renderApp() {
    var email = (_session && _session.user && _session.user.email) || '';
    root().innerHTML =
      '<div class="dorm-top">' +
        '<h2 class="dorm-title">🏢 기숙사 관리</h2>' +
        '<div class="dorm-user">' + esc(email) + ' <button id="dorm-logout" class="btn btn-ghost btn-sm">로그아웃</button></div>' +
      '</div>' +
      '<div class="dorm-subtabs facility-subtab-bar" role="tablist">' +
        SUBS.map(function (s) { return '<button class="subtab-btn' + (_st.sub === s.id ? ' active' : '') + '" data-dsub="' + s.id + '">' + s.label + '</button>'; }).join('') +
      '</div>' +
      '<div id="dorm-body"></div>';
    document.getElementById('dorm-logout').addEventListener('click', async function () {
      try { await _db.auth.signOut(); } catch (e) {}
      _session = null; renderLogin();
    });
    root().querySelectorAll('[data-dsub]').forEach(function (b) {
      b.addEventListener('click', function () { _st.sub = b.dataset.dsub; renderApp(); });
    });
    renderBody();
  }

  function body() { return document.getElementById('dorm-body'); }
  function loading() { body().innerHTML = '<p class="dorm-muted" style="padding:24px">불러오는 중…</p>'; }
  function placeholder(label) {
    body().innerHTML = '<div class="dorm-card"><h3 class="dorm-h3">🚧 ' + esc(label) + '</h3>' +
      '<p class="dorm-muted">이 메뉴는 다음 단계에서 개발 예정입니다. (현재 1단계: 건물·호실 / 계약 등록)</p></div>';
  }

  async function renderBody() {
    if (_st.sub === 'dash')      return renderDash();
    if (_st.sub === 'master')    return renderMaster();
    if (_st.sub === 'contract')  return renderContract();
    placeholder(SUBS.filter(function (s) { return s.id === _st.sub; })[0].label);
  }

  /* ── 대시보드 ─────────────────────────────────────────── */
  async function renderDash() {
    loading();
    try {
      var b = await _db.from('dormitory_buildings').select('id', { count: 'exact', head: true });
      var r = await _db.from('dormitory_rooms').select('id', { count: 'exact', head: true });
      var rv = await _db.from('dormitory_rooms').select('id', { count: 'exact', head: true }).eq('is_vacant', true);
      var ct = await _db.from('dormitory_contracts').select('id', { count: 'exact', head: true }).eq('status', 'active');
      var cards = [
        ['건물', b.count || 0, '동'], ['호실', r.count || 0, '실'],
        ['공실', rv.count || 0, '실'], ['진행 계약', ct.count || 0, '건'],
      ];
      body().innerHTML = '<div class="dorm-kpis">' + cards.map(function (c) {
        return '<div class="dorm-kpi"><div class="dorm-kpi-num">' + won(c[1]) + '<span>' + c[2] + '</span></div><div class="dorm-kpi-label">' + c[0] + '</div></div>';
      }).join('') + '</div>' +
      '<div class="dorm-card"><p class="dorm-muted">시작하려면 <b>건물·호실</b>에서 마스터를 설정한 뒤 <b>계약 등록·조회</b>에서 입소자 계약을 등록하세요.</p></div>';
    } catch (e) { body().innerHTML = errBox(e); }
  }
  function errBox(e) {
    return '<div class="dorm-card"><p style="color:#dc2626">오류: ' + esc(e && e.message || e) +
      '</p><p class="dorm-muted">테이블이 없으면 <code>dormitory/schema.sql</code>을 Supabase에서 먼저 실행하세요.</p></div>';
  }

  /* ── 건물·호실 마스터 ─────────────────────────────────── */
  async function renderMaster() {
    loading();
    var bs;
    try { bs = await _db.from('dormitory_buildings').select('*').order('name'); if (bs.error) throw bs.error; }
    catch (e) { body().innerHTML = errBox(e); return; }
    var list = bs.data || [];
    var html = '<div class="dorm-grid2">' +
      '<div class="dorm-card">' +
        '<h3 class="dorm-h3">건물 등록</h3>' +
        '<label class="dorm-label">건물명 *</label><input id="db-name" class="form-input">' +
        '<div class="dorm-row"><div><label class="dorm-label">등급</label><input id="db-grade" class="form-input" placeholder="A/B/C"></div>' +
          '<div><label class="dorm-label">기본 단가(월,원)</label><input id="db-price" class="form-input" inputmode="numeric" placeholder="350000"></div></div>' +
        '<label class="dorm-label">비고</label><input id="db-note" class="form-input">' +
        '<div class="dorm-actions"><button id="db-add" class="btn btn-primary">건물 추가</button></div>' +
      '</div>' +
      '<div class="dorm-card">' +
        '<h3 class="dorm-h3">건물 목록</h3>' +
        (list.length ? '<div class="scroll-x"><table class="dorm-table"><thead><tr><th>건물</th><th>등급</th><th>기본단가</th><th>호실</th><th></th></tr></thead><tbody>' +
          list.map(function (b) {
            return '<tr><td>' + esc(b.name) + '</td><td>' + esc(b.grade || '-') + '</td><td>' + won(b.base_price) + '</td>' +
              '<td>' + (b.total_rooms || 0) + '</td>' +
              '<td><button class="btn btn-secondary btn-sm db-rooms" data-id="' + b.id + '" data-name="' + esc(b.name) + '" data-price="' + (b.base_price || 0) + '">호실 관리</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<p class="dorm-muted">등록된 건물이 없습니다.</p>') +
      '</div>' +
    '</div>' +
    '<div id="dorm-rooms"></div>';
    body().innerHTML = html;

    document.getElementById('db-add').addEventListener('click', async function () {
      var name = (document.getElementById('db-name').value || '').trim();
      if (!name) { toast('건물명을 입력하세요.', 'error'); return; }
      var rec = { name: name, grade: (document.getElementById('db-grade').value || '').trim(),
        base_price: parseInt((document.getElementById('db-price').value || '0').replace(/[^\d]/g, ''), 10) || 0,
        note: (document.getElementById('db-note').value || '').trim() };
      var res = await _db.from('dormitory_buildings').insert(rec);
      if (res.error) { toast('저장 실패: ' + res.error.message, 'error'); return; }
      toast('건물이 등록되었습니다.', 'success'); renderMaster();
    });
    body().querySelectorAll('.db-rooms').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _st.bid = this.dataset.id;
        renderRooms(this.dataset.id, this.dataset.name, parseInt(this.dataset.price, 10) || 0);
      });
    });
    if (_st.bid) {
      var cur = list.filter(function (b) { return b.id === _st.bid; })[0];
      if (cur) renderRooms(cur.id, cur.name, cur.base_price || 0);
    }
  }

  async function renderRooms(bid, bname, basePrice) {
    var wrap = document.getElementById('dorm-rooms');
    wrap.innerHTML = '<div class="dorm-card"><p class="dorm-muted">호실 불러오는 중…</p></div>';
    var rs;
    try { rs = await _db.from('dormitory_rooms').select('*').eq('building_id', bid).order('room_number'); if (rs.error) throw rs.error; }
    catch (e) { wrap.innerHTML = errBox(e); return; }
    var rooms = rs.data || [];
    wrap.innerHTML = '<div class="dorm-card">' +
      '<h3 class="dorm-h3">🚪 ' + esc(bname) + ' — 호실 관리</h3>' +
      '<div class="dorm-row4">' +
        '<div><label class="dorm-label">호실번호 *</label><input id="rm-no" class="form-input" placeholder="201"></div>' +
        '<div><label class="dorm-label">유형</label><select id="rm-type" class="form-select"><option>1인실</option><option>2인실</option><option>다인실</option></select></div>' +
        '<div><label class="dorm-label">층</label><input id="rm-floor" class="form-input" inputmode="numeric"></div>' +
        '<div><label class="dorm-label">단가(월,원)</label><input id="rm-price" class="form-input" inputmode="numeric" value="' + (basePrice || '') + '"></div>' +
      '</div>' +
      '<div class="dorm-actions"><button id="rm-add" class="btn btn-primary">호실 추가</button></div>' +
      (rooms.length ? '<div class="scroll-x" style="margin-top:12px"><table class="dorm-table"><thead><tr><th>호실</th><th>유형</th><th>층</th><th>단가</th><th>상태</th><th></th></tr></thead><tbody>' +
        rooms.map(function (r) {
          return '<tr><td>' + esc(r.room_number) + '</td><td>' + esc(r.room_type) + '</td><td>' + (r.floor == null ? '-' : r.floor) + '</td>' +
            '<td>' + won(r.unit_price) + '</td><td>' + (r.is_vacant ? '<span class="dorm-badge vac">공실</span>' : '<span class="dorm-badge occ">입실</span>') + '</td>' +
            '<td><button class="btn btn-ghost btn-sm rm-del" data-id="' + r.id + '">삭제</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="dorm-muted" style="margin-top:12px">등록된 호실이 없습니다.</p>') +
    '</div>';

    document.getElementById('rm-add').addEventListener('click', async function () {
      var no = (document.getElementById('rm-no').value || '').trim();
      if (!no) { toast('호실번호를 입력하세요.', 'error'); return; }
      var rec = { building_id: bid, room_number: no,
        room_type: document.getElementById('rm-type').value,
        floor: parseInt(document.getElementById('rm-floor').value, 10) || null,
        unit_price: parseInt((document.getElementById('rm-price').value || '0').replace(/[^\d]/g, ''), 10) || 0,
        is_vacant: true };
      var res = await _db.from('dormitory_rooms').insert(rec);
      if (res.error) { toast('저장 실패: ' + res.error.message, 'error'); return; }
      await _db.from('dormitory_buildings').update({ total_rooms: rooms.length + 1 }).eq('id', bid);
      toast('호실이 등록되었습니다.', 'success'); renderRooms(bid, bname, basePrice);
    });
    wrap.querySelectorAll('.rm-del').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('이 호실을 삭제할까요?')) return;
        var res = await _db.from('dormitory_rooms').delete().eq('id', this.dataset.id);
        if (res.error) { toast('삭제 실패: ' + res.error.message, 'error'); return; }
        renderRooms(bid, bname, basePrice);
      });
    });
  }

  /* ── 계약 등록·조회 (개별 입력) ────────────────────────── */
  async function renderContract() {
    loading();
    var bs;
    try { bs = await _db.from('dormitory_buildings').select('id,name,base_price').order('name'); if (bs.error) throw bs.error; }
    catch (e) { body().innerHTML = errBox(e); return; }
    var blds = bs.data || [];
    if (!blds.length) { body().innerHTML = '<div class="dorm-card"><p class="dorm-muted">먼저 <b>건물·호실</b>에서 건물·호실을 등록하세요.</p></div>'; return; }

    body().innerHTML =
      '<div class="dorm-card">' +
        '<h3 class="dorm-h3">계약 개별 등록</h3>' +
        '<div class="dorm-row4">' +
          '<div><label class="dorm-label">건물 *</label><select id="ct-bld" class="form-select">' +
            blds.map(function (b) { return '<option value="' + b.id + '" data-price="' + (b.base_price || 0) + '">' + esc(b.name) + '</option>'; }).join('') + '</select></div>' +
          '<div><label class="dorm-label">호실 *</label><select id="ct-room" class="form-select"><option value="">—</option></select></div>' +
          '<div><label class="dorm-label">성명 *</label><input id="ct-name" class="form-input"></div>' +
          '<div><label class="dorm-label">학번/사번</label><input id="ct-sno" class="form-input"></div>' +
        '</div>' +
        '<div class="dorm-row4">' +
          '<div><label class="dorm-label">연락처</label><input id="ct-phone" class="form-input" placeholder="010-…"></div>' +
          '<div><label class="dorm-label">유형</label><select id="ct-type" class="form-select"><option>학기별</option><option>월별</option><option>연간</option></select></div>' +
          '<div><label class="dorm-label">시작일 *</label><input id="ct-start" type="date" class="form-input"></div>' +
          '<div><label class="dorm-label">종료일 *</label><input id="ct-end" type="date" class="form-input"></div>' +
        '</div>' +
        '<div class="dorm-row4">' +
          '<div><label class="dorm-label">단가(월,원)</label><input id="ct-price" class="form-input" inputmode="numeric"></div>' +
          '<div><label class="dorm-label">보증금(원)</label><input id="ct-dep" class="form-input" inputmode="numeric"></div>' +
          '<div style="grid-column:span 2"><label class="dorm-label">비고</label><input id="ct-note" class="form-input"></div>' +
        '</div>' +
        '<div class="dorm-actions"><button id="ct-save" class="btn btn-primary">계약 저장</button></div>' +
      '</div>' +
      '<div id="dorm-ct-list" class="dorm-card"><p class="dorm-muted">계약 목록 불러오는 중…</p></div>';

    var bldSel = document.getElementById('ct-bld');
    async function loadRooms() {
      var bid = bldSel.value;
      var rs = await _db.from('dormitory_rooms').select('id,room_number,room_type,unit_price,is_vacant').eq('building_id', bid).order('room_number');
      var rooms = (rs.data || []);
      var sel = document.getElementById('ct-room');
      sel.innerHTML = '<option value="">—</option>' + rooms.map(function (r) {
        return '<option value="' + r.id + '" data-price="' + (r.unit_price || 0) + '"' + (r.is_vacant ? '' : ' data-occ="1"') + '>' +
          esc(r.room_number) + ' (' + esc(r.room_type) + ')' + (r.is_vacant ? '' : ' · 입실중') + '</option>';
      }).join('');
    }
    bldSel.addEventListener('change', loadRooms);
    document.getElementById('ct-room').addEventListener('change', function () {
      var opt = this.options[this.selectedIndex];
      var p = opt && opt.getAttribute('data-price');
      if (p && !document.getElementById('ct-price').value) document.getElementById('ct-price').value = p;
    });
    await loadRooms();

    document.getElementById('ct-save').addEventListener('click', onSaveContract);
    loadContractList();
  }

  async function onSaveContract() {
    var name = (document.getElementById('ct-name').value || '').trim();
    var bid = document.getElementById('ct-bld').value;
    var rid = document.getElementById('ct-room').value;
    var start = document.getElementById('ct-start').value;
    var end = document.getElementById('ct-end').value;
    if (!name || !rid || !start || !end) { toast('건물·호실·성명·기간은 필수입니다.', 'error'); return; }
    if (start > end) { toast('종료일이 시작일보다 빠릅니다.', 'error'); return; }
    var sno = (document.getElementById('ct-sno').value || '').trim();
    var phone = (document.getElementById('ct-phone').value || '').trim();
    var price = parseInt((document.getElementById('ct-price').value || '0').replace(/[^\d]/g, ''), 10) || 0;
    var dep = parseInt((document.getElementById('ct-dep').value || '0').replace(/[^\d]/g, ''), 10) || 0;
    var who = (_session && _session.user && _session.user.email) || '';

    var btn = document.getElementById('ct-save'); btn.disabled = true;
    try {
      // 입소자 upsert (이름+학번 기준, 단순화)
      var resId = null;
      var ins = await _db.from('dormitory_residents').insert({ name: name, student_no: sno, phone: phone }).select('id').single();
      if (!ins.error && ins.data) resId = ins.data.id;
      var c = await _db.from('dormitory_contracts').insert({
        resident_id: resId, building_id: bid, room_id: rid,
        resident_name: name, student_no: sno, phone: phone,
        start_date: start, end_date: end, contract_type: document.getElementById('ct-type').value,
        unit_price: price, deposit: dep, source: 'manual', status: 'active',
        note: (document.getElementById('ct-note').value || '').trim(), created_by: who,
      });
      if (c.error) throw c.error;
      await _db.from('dormitory_rooms').update({ is_vacant: false }).eq('id', rid);  // 입실 자동 반영
      toast('계약이 등록되었습니다.', 'success');
      ['ct-name', 'ct-sno', 'ct-phone', 'ct-note'].forEach(function (id) { document.getElementById(id).value = ''; });
      loadContractList();
    } catch (e) { toast('저장 실패: ' + (e.message || e), 'error'); }
    finally { btn.disabled = false; }
  }

  async function loadContractList() {
    var wrap = document.getElementById('dorm-ct-list');
    var cs = await _db.from('dormitory_contracts').select('*, dormitory_buildings(name), dormitory_rooms(room_number)')
      .order('created_at', { ascending: false }).limit(50);
    if (cs.error) { wrap.innerHTML = errBox(cs.error); return; }
    var rows = cs.data || [];
    wrap.innerHTML = '<h3 class="dorm-h3">최근 계약 (' + rows.length + ')</h3>' +
      (rows.length ? '<div class="scroll-x"><table class="dorm-table"><thead><tr><th>성명</th><th>학번</th><th>건물·호실</th><th>기간</th><th>유형</th><th>단가</th><th>상태</th></tr></thead><tbody>' +
        rows.map(function (c) {
          var loc = (c.dormitory_buildings ? c.dormitory_buildings.name : '') + ' ' + (c.dormitory_rooms ? c.dormitory_rooms.room_number + '호' : '');
          return '<tr><td>' + esc(c.resident_name) + '</td><td>' + esc(c.student_no || '-') + '</td><td>' + esc(loc.trim() || '-') + '</td>' +
            '<td>' + esc(c.start_date) + '~' + esc(c.end_date) + '</td><td>' + esc(c.contract_type) + '</td><td>' + won(c.unit_price) + '</td>' +
            '<td><span class="dorm-badge ' + (c.status === 'active' ? 'occ' : 'vac') + '">' + esc(c.status) + '</span></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="dorm-muted">등록된 계약이 없습니다.</p>');
  }

  window.DormModule = { onTabOpen: onTabOpen };
})();
