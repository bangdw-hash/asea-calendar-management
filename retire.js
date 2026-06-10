/* ════════════════════════════════════════════════════
   퇴직자 관리 모듈 — retire.js  v=20260611rt2
   코드+PIN 접수 시스템
   ════════════════════════════════════════════════════ */
window.RetireModule = (function () {
  'use strict';

  var ADMIN_PW  = 'asea2024hr';
  var CODES_KEY = 'asea_retire_codes';  // [{id, code, name, dept, empNo, note, createdAt, used}]
  var APPS_KEY  = 'asea_retire_apps';   // [{id, code, pin, form:{...}, irp:{...}, status, createdAt, submittedAt}]

  var _st = { view: 'home', step: 0, app: null, isAdmin: false, mgrTab: 'codes' };

  /* ── 스토리지 ── */
  function loadCodes() {
    try { return JSON.parse(localStorage.getItem(CODES_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveCodes(a) { localStorage.setItem(CODES_KEY, JSON.stringify(a)); }
  function loadApps() {
    try { return JSON.parse(localStorage.getItem(APPS_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveApps(a) { localStorage.setItem(APPS_KEY, JSON.stringify(a)); }
  function saveApp(app) {
    var apps = loadApps();
    var i = apps.findIndex(function (a) { return a.id === app.id; });
    if (i > -1) apps[i] = app; else apps.push(app);
    saveApps(apps);
  }

  /* ── 코드 생성 ── */
  function genCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var r = 'RT';
    for (var i = 0; i < 6; i++) r += chars[Math.floor(Math.random() * chars.length)];
    return r;
  }

  /* ── 빈 앱 데이터 ── */
  function blankApp(code) {
    return {
      id: 'RT' + Date.now() + Math.random().toString(36).slice(2,5),
      code: code,
      pin: '',
      createdAt: Date.now(),
      submittedAt: null,
      status: 'draft',
      form: {
        dept: '', rank: '', duty: '', name: '',
        empNo: '', regNo: '', hireDate: '', retireDate: '',
        reasonType: '', reasonDetail: '',
        signDate: todayStr(), signB64: ''
      },
      irp: {
        bank: '하나은행', account: '', holder: '',
        agreedSubmit: false, agreedSecurity: false
      }
    };
  }
  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  /* ── DOM 헬퍼 ── */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls)  e.className   = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function row(children) {
    var r = el('div', 'rt-row');
    children.forEach(function (c) { if (c) r.appendChild(c); });
    return r;
  }
  function sectionTitle(text) {
    return el('div', 'rt-section-title', text);
  }
  function toast(msg, color) {
    var t = el('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:' +
      (color || '#1a3a5c') + ';color:#fff;padding:10px 22px;border-radius:8px;font-size:14px;z-index:9999;pointer-events:none';
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2500);
  }

  /* ── 필드 빌더 ── */
  function field(label, type, val, onChange, widthCls, opts, ph) {
    var wrap = el('div', 'rt-field ' + (widthCls || 'flex1'));
    var lbl  = el('label', 'rt-label', label);
    wrap.appendChild(lbl);
    var inp;
    if (type === 'select') {
      inp = document.createElement('select'); inp.className = 'rt-input';
      (opts || []).forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o; opt.textContent = o;
        if (o === val) opt.selected = true;
        inp.appendChild(opt);
      });
    } else if (type === 'textarea') {
      inp = document.createElement('textarea'); inp.className = 'rt-input';
      inp.rows = 4; inp.value = val || ''; inp.placeholder = ph || '';
    } else {
      inp = document.createElement('input'); inp.className = 'rt-input';
      inp.type = type; inp.value = val || ''; inp.placeholder = ph || '';
    }
    inp.addEventListener('change', function () { onChange(this.value); });
    inp.addEventListener('input',  function () { onChange(this.value); });
    wrap.appendChild(inp);
    return wrap;
  }

  /* ── 서명 패드 ── */
  function buildSigPad(canvasId, initB64, onChange) {
    var wrap   = el('div', 'rt-sig-wrap');
    var lbl    = el('div', 'rt-label', '서명 (직접 서명)');
    var canvas = document.createElement('canvas');
    canvas.id  = canvasId; canvas.width = 260; canvas.height = 90;
    canvas.className = 'rt-sig-canvas';
    var hint   = el('div', 'rt-sig-hint', '마우스 또는 터치로 서명하세요');
    var btnRow = el('div'); btnRow.style.cssText = 'display:flex;gap:6px;margin-top:4px';
    var clrBtn = el('button', 'rt-btn rt-btn-ghost rt-btn-sm', '지우기');
    btnRow.appendChild(clrBtn);
    wrap.appendChild(lbl); wrap.appendChild(hint); wrap.appendChild(canvas); wrap.appendChild(btnRow);

    var ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    if (initB64) { var img = new Image(); img.onload = function () { ctx.drawImage(img, 0, 0); }; img.src = initB64; }
    var drawing = false;
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      var s = e.touches ? e.touches[0] : e;
      return { x: s.clientX - r.left, y: s.clientY - r.top };
    }
    canvas.addEventListener('mousedown',  function (e) { drawing = true; ctx.beginPath(); var p = pos(e); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('mousemove',  function (e) { if (!drawing) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
    canvas.addEventListener('mouseup',    function ()  { drawing = false; onChange(canvas.toDataURL()); });
    canvas.addEventListener('mouseleave', function ()  { drawing = false; });
    canvas.addEventListener('touchstart', function (e) { e.preventDefault(); drawing = true; ctx.beginPath(); var p = pos(e); ctx.moveTo(p.x, p.y); }, { passive: false });
    canvas.addEventListener('touchmove',  function (e) { e.preventDefault(); if (!drawing) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }, { passive: false });
    canvas.addEventListener('touchend',   function ()  { drawing = false; onChange(canvas.toDataURL()); });
    clrBtn.addEventListener('click', function () { ctx.clearRect(0, 0, canvas.width, canvas.height); onChange(''); });
    return wrap;
  }

  /* ════ RENDER ════ */
  function _render() {
    var root = document.getElementById('retire-root');
    if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);
    if      (_st.view === 'home')      _renderHome(root);
    else if (_st.view === 'new-entry') _renderNewEntry(root);
    else if (_st.view === 'edit-entry') _renderEditEntry(root);
    else if (_st.view === 'form')      _renderForm(root);
    else if (_st.view === 'manager')   _renderManager(root);
  }

  /* ── 홈 ── */
  function _renderHome(root) {
    var wrap  = el('div', 'rt-home-wrap');
    var title = el('div', 'rt-home-title', '퇴직자 관리');
    var sub   = el('div', 'rt-home-sub',   '사직서 온라인 제출 및 퇴직 절차 안내 시스템');
    wrap.appendChild(title); wrap.appendChild(sub);

    var cards = el('div', 'rt-role-cards');

    /* ✍️ 최초 작성 */
    var c1 = el('div', 'rt-role-card');
    c1.innerHTML =
      '<div class="rt-role-icon">✍️</div>' +
      '<div class="rt-role-title">최초 작성</div>' +
      '<div class="rt-role-desc">인사담당자로부터 받은 접수 코드로<br>사직서 작성</div>';
    c1.addEventListener('click', function () {
      _st.view = 'new-entry'; _render();
    });

    /* ✏️ 중간 수정 */
    var c2 = el('div', 'rt-role-card');
    c2.innerHTML =
      '<div class="rt-role-icon">✏️</div>' +
      '<div class="rt-role-title">중간 수정</div>' +
      '<div class="rt-role-desc">코드 + 비밀번호로<br>작성 중인 사직서 수정</div>';
    c2.addEventListener('click', function () {
      _st.view = 'edit-entry'; _render();
    });

    /* 👔 인사관리자 */
    var c3 = el('div', 'rt-role-card');
    c3.innerHTML =
      '<div class="rt-role-icon">👔</div>' +
      '<div class="rt-role-title">인사관리자</div>' +
      '<div class="rt-role-desc">제출된 사직서 조회<br>코드 발급 및 관리</div>';
    c3.addEventListener('click', function () {
      _renderAdminAuth(c3);
    });

    cards.appendChild(c1); cards.appendChild(c2); cards.appendChild(c3);
    wrap.appendChild(cards);
    root.appendChild(wrap);
  }

  function _renderAdminAuth(triggerEl) {
    /* 홈 화면에서 인사관리자 카드 클릭 시 — 간단 인라인 비밀번호 */
    var pw = prompt('인사관리자 비밀번호를 입력하세요.');
    if (pw === ADMIN_PW) { _st.isAdmin = true; _st.view = 'manager'; _st.mgrTab = 'codes'; _render(); }
    else if (pw !== null) toast('비밀번호가 올바르지 않습니다.', '#DC2626');
  }

  /* ── 최초 작성 (코드 + PIN 설정) ── */
  function _renderNewEntry(root) {
    var wrap = el('div', 'rt-auth-wrap');
    var box  = el('div', 'rt-auth-box');
    box.innerHTML =
      '<div class="rt-auth-icon">✍️</div>' +
      '<div class="rt-auth-title">최초 작성</div>' +
      '<div class="rt-auth-desc">인사담당자로부터 받은 <strong>접수 코드</strong>를 입력하고<br>본인만 알 수 있는 <strong>비밀번호</strong>를 설정하세요.</div>' +
      '<label class="rt-auth-label">접수 코드</label>' +
      '<input class="rt-auth-input" id="rt-ne-code" type="text" maxlength="10" placeholder="RT-XXXXXX" autocomplete="off" style="text-transform:uppercase">' +
      '<label class="rt-auth-label" style="margin-top:10px">비밀번호 설정 (4~8자리)</label>' +
      '<input class="rt-auth-input" id="rt-ne-pin" type="password" maxlength="8" placeholder="숫자 4~8자리">' +
      '<label class="rt-auth-label" style="margin-top:8px">비밀번호 확인</label>' +
      '<input class="rt-auth-input" id="rt-ne-pinc" type="password" maxlength="8" placeholder="비밀번호 재입력">' +
      '<div class="rt-auth-err" id="rt-ne-err"></div>' +
      '<button class="rt-btn rt-btn-primary" id="rt-ne-btn" style="width:100%;margin-top:14px;margin-bottom:10px">확인 → 사직서 작성 시작</button>' +
      '<button class="rt-btn rt-btn-ghost" id="rt-ne-back" style="width:100%">← 돌아가기</button>';
    wrap.appendChild(box);
    root.appendChild(wrap);

    /* 코드 자동 대문자 */
    document.getElementById('rt-ne-code').addEventListener('input', function() {
      var v = this.value.toUpperCase(); this.value = v;
    });

    document.getElementById('rt-ne-btn').addEventListener('click', function() {
      var code = document.getElementById('rt-ne-code').value.trim().toUpperCase();
      var pin  = document.getElementById('rt-ne-pin').value.trim();
      var pinC = document.getElementById('rt-ne-pinc').value.trim();
      var err  = document.getElementById('rt-ne-err');
      err.textContent = '';

      if (!code) { err.textContent = '접수 코드를 입력해 주세요.'; return; }
      var codes = loadCodes();
      var slot  = codes.find(function(c){ return c.code === code; });
      if (!slot) { err.textContent = '유효하지 않은 접수 코드입니다.'; return; }

      if (!pin || pin.length < 4) { err.textContent = '비밀번호는 4자리 이상 입력해 주세요.'; return; }
      if (pin !== pinC) { err.textContent = '비밀번호가 일치하지 않습니다.'; return; }

      var apps = loadApps();
      var existing = apps.find(function(a){ return a.code === code; });
      if (existing) {
        toast('이미 작성 중인 사직서가 있습니다. 중간 수정 메뉴를 이용하세요.', '#D97706');
        return;
      }

      var app = blankApp(code);
      app.pin = pin;
      app.form.name  = slot.name  || '';
      app.form.dept  = slot.dept  || '';
      app.form.empNo = slot.empNo || '';
      apps.push(app);
      saveApps(apps);

      /* 코드 사용됨 표시 */
      var ci = codes.findIndex(function(c){ return c.code === code; });
      if (ci > -1) { codes[ci].used = true; saveCodes(codes); }

      _st.app  = app;
      _st.step = 0;
      _st.view = 'form';
      _render();
    });
    document.getElementById('rt-ne-back').addEventListener('click', function() {
      _st.view = 'home'; _render();
    });
  }

  /* ── 중간 수정 (코드 + PIN 입력) ── */
  function _renderEditEntry(root) {
    var wrap = el('div', 'rt-auth-wrap');
    var box  = el('div', 'rt-auth-box');
    box.innerHTML =
      '<div class="rt-auth-icon">✏️</div>' +
      '<div class="rt-auth-title">중간 수정</div>' +
      '<div class="rt-auth-desc">접수 코드와 설정한 <strong>비밀번호</strong>를 입력하세요.</div>' +
      '<label class="rt-auth-label">접수 코드</label>' +
      '<input class="rt-auth-input" id="rt-ee-code" type="text" maxlength="10" placeholder="RT-XXXXXX" autocomplete="off" style="text-transform:uppercase">' +
      '<label class="rt-auth-label" style="margin-top:10px">비밀번호</label>' +
      '<input class="rt-auth-input" id="rt-ee-pin" type="password" maxlength="8" placeholder="비밀번호">' +
      '<div class="rt-auth-err" id="rt-ee-err"></div>' +
      '<button class="rt-btn rt-btn-primary" id="rt-ee-btn" style="width:100%;margin-top:14px;margin-bottom:10px">확인</button>' +
      '<button class="rt-btn rt-btn-ghost" id="rt-ee-back" style="width:100%">← 돌아가기</button>';
    wrap.appendChild(box);
    root.appendChild(wrap);

    document.getElementById('rt-ee-code').addEventListener('input', function() {
      this.value = this.value.toUpperCase();
    });

    document.getElementById('rt-ee-btn').addEventListener('click', function() {
      var code = document.getElementById('rt-ee-code').value.trim().toUpperCase();
      var pin  = document.getElementById('rt-ee-pin').value.trim();
      var err  = document.getElementById('rt-ee-err');
      err.textContent = '';

      if (!code) { err.textContent = '접수 코드를 입력해 주세요.'; return; }
      if (!pin)  { err.textContent = '비밀번호를 입력해 주세요.'; return; }

      var apps = loadApps();
      var app  = apps.find(function(a){ return a.code === code; });
      if (!app) { err.textContent = '해당 코드로 작성된 사직서가 없습니다. 최초 작성을 이용해 주세요.'; return; }
      if (app.pin !== pin) { err.textContent = '비밀번호가 올바르지 않습니다.'; return; }
      if (app.status === 'submitted') {
        toast('이미 최종 제출된 사직서입니다.', '#D97706'); return;
      }

      _st.app  = app;
      _st.step = 0;
      _st.view = 'form';
      _render();
    });
    document.getElementById('rt-ee-pin').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') document.getElementById('rt-ee-btn').click();
    });
    document.getElementById('rt-ee-back').addEventListener('click', function() {
      _st.view = 'home'; _render();
    });
  }

  /* ── 폼 래퍼 ── */
  function _renderForm(root) {
    var wrap  = el('div', 'rt-wrap');
    var steps = ['① 사직서 작성', '② 퇴직급여 안내', '③ 제출 완료'];
    var bar   = el('div', 'rt-step-bar');
    steps.forEach(function (s, i) {
      var cls = 'rt-step-item' + (_st.step === i ? ' active' : (_st.step > i ? ' done' : ''));
      bar.appendChild(el('div', cls, s));
    });
    wrap.appendChild(bar);
    if      (_st.step === 0) _renderStep0(wrap);
    else if (_st.step === 1) _renderStep1(wrap);
    else                      _renderStep2(wrap);
    root.appendChild(wrap);
  }

  /* ════ STEP 0 — 사직서 작성 ════ */
  function _renderStep0(wrap) {
    var app = _st.app; var f = app.form;

    var card = el('div', 'rt-card');
    var head = el('div', 'rt-card-head');
    head.innerHTML = '<div class="rt-card-title">사 직 서</div>' +
      '<div class="rt-card-subtitle">(재)아세아항공직업전문학교장 귀하</div>';
    card.appendChild(head);

    var body = el('div', 'rt-card-body');

    /* 인적 사항 */
    body.appendChild(sectionTitle('■ 인적 사항'));
    body.appendChild(row([
      field('1. 소속 (부서)', 'text', f.dept,  function (v) { f.dept  = v; saveApp(app); }, 'flex2', null, '예: 기획처'),
      field('2. 직위',        'text', f.rank,  function (v) { f.rank  = v; saveApp(app); }, 'flex1', null, '예: 차장'),
    ]));
    body.appendChild(row([
      field('3. 직무',  'text', f.duty, function (v) { f.duty = v; saveApp(app); }, 'flex2', null, '담당 업무명'),
      field('4. 성명',  'text', f.name, function (v) { f.name = v; saveApp(app); }, 'flex1', null, '홍길동'),
    ]));
    body.appendChild(row([
      field('5. 사원번호',      'text', f.empNo, function (v) { f.empNo = v; saveApp(app); }, 'flex1', null, ''),
      field('6. 주민등록번호',  'text', f.regNo, function (v) { f.regNo = v; saveApp(app); }, 'flex1', null, '000000-0000000'),
    ]));
    body.appendChild(row([
      field('7. 입사일',            'date', f.hireDate,   function (v) { f.hireDate   = v; saveApp(app); }, 'flex1'),
      field('8. 퇴사일 (마지막 근무일)', 'date', f.retireDate, function (v) { f.retireDate = v; saveApp(app); }, 'flex1'),
    ]));

    /* 퇴직 사유 */
    body.appendChild(sectionTitle('■ 퇴직 사유 (9번)'));
    var reasonOpts = ['선택하세요', '일신상의 사유', '권고사직', '계약기간 만료', '직접 입력'];
    body.appendChild(row([
      field('사유 유형', 'select', f.reasonType || '선택하세요', function (v) {
        f.reasonType = v;
        if (v !== '직접 입력' && v !== '선택하세요') { f.reasonDetail = v; }
        else if (v === '선택하세요') { f.reasonDetail = ''; }
        saveApp(app); _render();
      }, 'w200', reasonOpts),
    ]));

    if (f.reasonType && f.reasonType !== '선택하세요') {
      var isManual = f.reasonType === '직접 입력';
      var taWrap = field('퇴직 사유 상세', 'textarea',
        isManual ? f.reasonDetail : f.reasonType,
        function (v) { f.reasonDetail = v; saveApp(app); },
        'flex1', null, '퇴직 사유를 구체적으로 기재하여 주십시오.');
      if (!isManual) {
        var ta = taWrap.querySelector('textarea');
        if (ta) { ta.readOnly = true; ta.style.background = '#F9FAFB'; }
      }
      body.appendChild(row([taWrap]));
    }

    /* 확인 문구 */
    var decl = el('div');
    decl.style.cssText = 'font-size:12px;color:#374151;margin:14px 0 6px;padding:10px 14px;background:#F9FAFB;border-radius:6px;line-height:1.8;font-style:italic';
    decl.textContent = '상기본인은 위와 같은 사유로 퇴직하고자 하오니, 이를 승인하여 주시기 바랍니다.';
    body.appendChild(decl);

    /* 서명 */
    body.appendChild(sectionTitle('■ 작성일 및 서명'));
    var sigRow = el('div', 'rt-row'); sigRow.style.flexWrap = 'wrap'; sigRow.style.alignItems = 'flex-end';
    sigRow.appendChild(field('작성일', 'date', f.signDate, function (v) { f.signDate = v; saveApp(app); }, 'w160'));
    sigRow.appendChild(buildSigPad('retire-sig', f.signB64, function (b64) { f.signB64 = b64; saveApp(app); }));
    body.appendChild(sigRow);

    /* 반납 안내 */
    var retBox = el('div', 'rt-return-box');
    retBox.innerHTML =
      '<strong>📦 퇴직 시 반납 항목 안내</strong><br>' +
      '① 의료보험 카드&nbsp;&nbsp;② 물품 및 비품&nbsp;&nbsp;③ 서류&nbsp;&nbsp;④ 유니폼&nbsp;&nbsp;⑤ 기타<br>' +
      '<small style="color:#A16207">* 부서장과 면담 후 반납 여부를 확인하시기 바랍니다.</small>';
    body.appendChild(retBox);

    card.appendChild(body);
    wrap.appendChild(card);

    /* 미리보기 버튼 */
    var pvBtn = el('button', 'rt-btn rt-btn-outline', '👁️ 사직서 미리보기');
    pvBtn.style.cssText = 'width:100%;margin-bottom:6px';
    pvBtn.addEventListener('click', function () { _printResignation(app); });
    wrap.appendChild(pvBtn);

    /* 다음 버튼 */
    var nextBtn = el('button', 'rt-btn rt-btn-primary', '다음: 퇴직급여 안내 →');
    nextBtn.style.cssText = 'width:100%;margin-bottom:6px';
    nextBtn.addEventListener('click', function () {
      if (!f.name.trim())     { toast('성명을 입력해 주세요.', '#DC2626'); return; }
      if (!f.retireDate)      { toast('퇴사일(마지막 근무일)을 입력해 주세요.', '#DC2626'); return; }
      if (!f.reasonType || f.reasonType === '선택하세요') { toast('퇴직 사유를 선택해 주세요.', '#DC2626'); return; }
      if (!f.signB64)         { toast('서명을 완료해 주세요.', '#DC2626'); return; }
      saveApp(app);
      _st.step = 1; _render();
    });
    wrap.appendChild(nextBtn);

    var backBtn = el('button', 'rt-btn rt-btn-ghost', '← 처음으로');
    backBtn.style.cssText = 'width:100%';
    backBtn.addEventListener('click', function () { _st.view = 'home'; _st.app = null; _render(); });
    wrap.appendChild(backBtn);
  }

  /* ════ STEP 1 — 퇴직급여 안내 ════ */
  function _renderStep1(wrap) {
    var app = _st.app; var irp = app.irp;

    var card = el('div', 'rt-card');
    var head = el('div', 'rt-card-head');
    head.innerHTML = '<div class="rt-card-title">퇴직급여 신청 안내</div>';
    card.appendChild(head);
    var body = el('div', 'rt-card-body');

    /* 절차 안내 */
    body.appendChild(sectionTitle('■ 퇴직 처리 절차'));
    var steps = [
      { title: '사직서 제출 — 본 시스템 완료', desc: '마지막 근무일을 정확히 기재한 사직서를 온라인으로 제출합니다 (현재 단계).', done: true },
      { title: '퇴직급여 지급신청서 대면 제출', desc: '퇴직급여 지급신청서(2장)를 출력·자필 서명 후 기획처 방시원 차장에게 직접 제출합니다.\n담당: 방시원 차장 | 내선 288 | 010-2055-5883 | bangsw@asea.or.kr' },
      { title: '보안 서약서 및 업무 인계인수서', desc: '해당자에 한해 기획처에 함께 제출합니다.' },
      { title: '퇴직급여 지급', desc: '퇴직일(마지막 근무일)로부터 14일 이내에 IRP 계좌로 입금됩니다.\n본교 퇴직연금 운용사: 하나은행' },
    ];
    steps.forEach(function (s, idx) {
      var div = el('div', 'rt-irp-step');
      var num = el('div', 'rt-irp-step-num');
      num.textContent = idx + 1;
      if (s.done) { num.style.background = '#16A34A'; }
      var bd = el('div', 'rt-irp-step-body');
      var t = el('div', 'rt-irp-step-title', s.title);
      var d = el('div', 'rt-irp-step-desc', s.desc);
      bd.appendChild(t); bd.appendChild(d);
      div.appendChild(num); div.appendChild(bd);
      body.appendChild(div);
    });

    /* IRP 계좌 */
    body.appendChild(sectionTitle('■ IRP 계좌 정보'));
    var bankNote = el('div');
    bankNote.style.cssText = 'font-size:11px;color:#6B7280;margin-bottom:8px;line-height:1.8';
    bankNote.innerHTML =
      '• <strong>하나은행 IRP 계좌</strong> 보유자: 통장 사본 제출 불필요 (전산 자동 확인)<br>' +
      '• <strong>타 은행 IRP 계좌</strong> 보유자: 통장 사본(계좌번호 및 예금주 확인 면) 별도 제출 필수';
    body.appendChild(bankNote);

    var bankOpts = ['하나은행', '국민은행', '신한은행', '우리은행', 'NH농협', 'IBK기업', 'SC제일', '카카오뱅크', '케이뱅크', '토스뱅크', '기타'];
    body.appendChild(row([
      field('IRP 은행명', 'select', irp.bank, function (v) { irp.bank = v; saveApp(app); _render(); }, 'flex1', bankOpts),
      field('IRP 계좌번호', 'text', irp.account, function (v) { irp.account = v; saveApp(app); }, 'flex2', null, '숫자만 입력'),
    ]));
    body.appendChild(row([
      field('예금주', 'text', irp.holder, function (v) { irp.holder = v; saveApp(app); }, 'flex1', null, '성명'),
    ]));

    if (irp.bank && irp.bank !== '하나은행') {
      var warnBox = el('div', 'rt-warn-box');
      warnBox.innerHTML = '⚠️ 타 은행 IRP 계좌 보유자는 <strong>통장 사본을 방시원 차장에게 별도 제출</strong>하시기 바랍니다. (문자·메신저 별도 전송 가능)';
      body.appendChild(warnBox);
    }

    /* 하나은행 계좌 개설 안내 */
    var irpGuide = el('div');
    irpGuide.style.cssText = 'font-size:11px;color:#6B7280;margin-top:8px;padding:10px;background:#F9FAFB;border-radius:6px;line-height:1.8';
    irpGuide.innerHTML =
      '<strong>하나은행 IRP 계좌 미보유 시 개설 방법</strong><br>' +
      '나원만 앱 → 메뉴 → 퇴직연금 → IRP/DC 가입 → 퇴직 IRP → 가입 시작하기 → 개설 진행';
    body.appendChild(irpGuide);

    /* 확인 체크박스 */
    body.appendChild(sectionTitle('■ 확인 사항'));
    [
      { key: 'agreedSubmit',   label: '퇴직급여 지급신청서(2장)를 기획처 방시원 차장에게 대면 제출하겠습니다. (필수)' },
      { key: 'agreedSecurity', label: '보안 서약서 및 업무 인계인수서 제출 의무를 확인하였습니다. (해당자)' },
    ].forEach(function (ck) {
      var lbl = el('label', 'rt-cb-item');
      var cb  = document.createElement('input'); cb.type = 'checkbox';
      if (irp[ck.key]) cb.checked = true;
      cb.addEventListener('change', function () { irp[ck.key] = this.checked; saveApp(app); });
      lbl.appendChild(cb);
      var span = document.createElement('span'); span.textContent = ck.label;
      lbl.appendChild(span);
      body.appendChild(lbl);
    });

    card.appendChild(body);
    wrap.appendChild(card);

    /* 최종 제출 */
    var submitBtn = el('button', 'rt-btn rt-btn-primary', '✅ 사직서 최종 제출');
    submitBtn.style.cssText = 'width:100%;margin-bottom:6px';
    submitBtn.addEventListener('click', function () {
      if (!irp.agreedSubmit) { toast('퇴직급여 신청서 대면 제출 확인이 필요합니다.', '#DC2626'); return; }
      app.submittedAt = Date.now();
      app.status      = 'submitted';
      saveApp(app);
      _st.step = 2; _render();
    });
    wrap.appendChild(submitBtn);

    var prevBtn = el('button', 'rt-btn rt-btn-ghost', '← 이전: 사직서 수정');
    prevBtn.style.cssText = 'width:100%;margin-bottom:6px';
    prevBtn.addEventListener('click', function () { _st.step = 0; _render(); });
    wrap.appendChild(prevBtn);

    var pvBtn = el('button', 'rt-btn rt-btn-outline', '👁️ 사직서 미리보기');
    pvBtn.style.cssText = 'width:100%';
    pvBtn.addEventListener('click', function () { _printResignation(app); });
    wrap.appendChild(pvBtn);
  }

  /* ════ STEP 2 — 완료 ════ */
  function _renderStep2(wrap) {
    var app = _st.app; var f = app.form;

    var card = el('div', 'rt-card');
    var body = el('div', 'rt-card-body');

    var cw = el('div', 'rt-complete-wrap');
    cw.innerHTML =
      '<div class="rt-complete-icon">✅</div>' +
      '<div class="rt-complete-title">사직서가 제출되었습니다</div>';

    var desc = el('div', 'rt-complete-desc');
    desc.innerHTML =
      '퇴사 예정일: <strong>' + _fmtKo(f.retireDate) + '</strong><br>' +
      '제출 일시: ' + new Date(app.submittedAt).toLocaleString('ko-KR') + '<br><br>' +
      '<strong>📋 다음 단계: 퇴직급여 지급신청서 대면 제출</strong><br>' +
      '기획처 방시원 차장 &nbsp;|&nbsp; 내선 288<br>' +
      '010-2055-5883 &nbsp;|&nbsp; bangsw@asea.or.kr<br><br>' +
      (app.irp.bank !== '하나은행'
        ? '<strong style="color:#D97706">⚠️ 타 은행 IRP 계좌 통장 사본을 별도 제출하시기 바랍니다.</strong>'
        : '하나은행 IRP 계좌: 통장 사본 제출 불필요');
    cw.appendChild(desc);

    var pvBtn = el('button', 'rt-btn rt-btn-primary', '🖨️ 사직서 인쇄');
    pvBtn.style.cssText = 'width:100%;max-width:280px;margin:0 auto 8px;display:block';
    pvBtn.addEventListener('click', function () { _printResignation(app); });
    cw.appendChild(pvBtn);

    var homeBtn = el('button', 'rt-btn rt-btn-ghost', '처음으로');
    homeBtn.style.cssText = 'width:100%;max-width:280px;margin:0 auto;display:block';
    homeBtn.addEventListener('click', function () { _st.view = 'home'; _st.app = null; _render(); });
    cw.appendChild(homeBtn);

    body.appendChild(cw);
    card.appendChild(body);
    wrap.appendChild(card);
  }

  /* ════ 관리자 ════ */
  function _renderManager(root) {
    var wrap = el('div', 'rt-wrap');

    /* 상단 바 */
    var topBar = el('div', 'rt-mgr-topbar');
    var titleEl = el('strong'); titleEl.style.cssText = 'font-size:16px;color:#1a3a5c';
    titleEl.textContent = '퇴직자 관리 — 인사관리자';
    topBar.appendChild(titleEl);
    var backBtn = el('button', 'rt-btn rt-btn-ghost rt-btn-sm', '← 나가기');
    backBtn.style.marginLeft = 'auto';
    backBtn.addEventListener('click', function () { _st.isAdmin = false; _st.view = 'home'; _render(); });
    topBar.appendChild(backBtn);
    wrap.appendChild(topBar);

    /* 탭 */
    var tabBar = el('div', 'rt-mgr-tabs');
    var tabs = [
      { key: 'codes', label: '🔑 코드 관리' },
      { key: 'apps',  label: '📋 제출 목록' },
    ];
    tabs.forEach(function(t) {
      var btn = el('button', 'rt-mgr-tab' + (_st.mgrTab === t.key ? ' active' : ''), t.label);
      btn.addEventListener('click', function() { _st.mgrTab = t.key; _render(); });
      tabBar.appendChild(btn);
    });
    wrap.appendChild(tabBar);

    if (_st.mgrTab === 'codes') _renderMgrCodes(wrap);
    else                         _renderMgrApps(wrap);

    root.appendChild(wrap);
  }

  /* ── 코드 관리 탭 ── */
  function _renderMgrCodes(wrap) {
    var section = el('div', 'rt-mgr-section');

    /* 신규 코드 발급 폼 */
    var genCard = el('div', 'rt-card');
    var genHead = el('div', 'rt-card-head');
    genHead.innerHTML = '<div class="rt-card-title">신규 코드 발급</div>';
    genCard.appendChild(genHead);
    var genBody = el('div', 'rt-card-body');

    var genRow = el('div'); genRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px';

    var nameWrap = el('div', 'rt-field flex1');
    nameWrap.appendChild(el('label', 'rt-label', '대상자 성명 (필수)'));
    var nameInp = document.createElement('input'); nameInp.className = 'rt-input'; nameInp.id = 'rt-mgr-name'; nameInp.placeholder = '홍길동';
    nameWrap.appendChild(nameInp);

    var deptWrap = el('div', 'rt-field flex1');
    deptWrap.appendChild(el('label', 'rt-label', '부서'));
    var deptInp = document.createElement('input'); deptInp.className = 'rt-input'; deptInp.id = 'rt-mgr-dept'; deptInp.placeholder = '기획처';
    deptWrap.appendChild(deptInp);

    var empWrap = el('div', 'rt-field w120');
    empWrap.appendChild(el('label', 'rt-label', '사원번호'));
    var empInp = document.createElement('input'); empInp.className = 'rt-input'; empInp.id = 'rt-mgr-emp'; empInp.placeholder = '';
    empWrap.appendChild(empInp);

    var noteWrap = el('div', 'rt-field flex1');
    noteWrap.appendChild(el('label', 'rt-label', '비고'));
    var noteInp = document.createElement('input'); noteInp.className = 'rt-input'; noteInp.id = 'rt-mgr-note'; noteInp.placeholder = '';
    noteWrap.appendChild(noteInp);

    var genBtn = el('button', 'rt-btn rt-btn-primary', '코드 생성');
    genBtn.style.cssText = 'margin-top:auto;flex-shrink:0';
    genBtn.addEventListener('click', function() {
      var name = document.getElementById('rt-mgr-name').value.trim();
      if (!name) { toast('대상자 성명을 입력해 주세요.', '#DC2626'); return; }
      var dept  = document.getElementById('rt-mgr-dept').value.trim();
      var emp   = document.getElementById('rt-mgr-emp').value.trim();
      var note  = document.getElementById('rt-mgr-note').value.trim();
      var codes = loadCodes();
      var code;
      /* 중복 방지 */
      do { code = genCode(); } while (codes.find(function(c){ return c.code === code; }));
      codes.push({ id: 'C' + Date.now(), code: code, name: name, dept: dept, empNo: emp, note: note, createdAt: Date.now(), used: false });
      saveCodes(codes);
      toast('코드 발급: ' + code);
      _render();
    });

    genRow.appendChild(nameWrap); genRow.appendChild(deptWrap);
    genRow.appendChild(empWrap);  genRow.appendChild(noteWrap);
    genRow.appendChild(genBtn);
    genBody.appendChild(genRow);
    genCard.appendChild(genBody);
    section.appendChild(genCard);

    /* 기존 코드 목록 */
    var codes = loadCodes();
    var apps  = loadApps();

    if (!codes.length) {
      var empty = el('div', 'rt-empty'); empty.textContent = '발급된 코드가 없습니다.';
      section.appendChild(empty);
    } else {
      var statusLabel = { submitted: '제출완료', processing: '처리중', completed: '완료', draft: '작성중' };
      codes.slice().reverse().forEach(function(c) {
        var appForCode = apps.find(function(a){ return a.code === c.code; });
        var pinDisplay = appForCode && appForCode.pin
          ? '비밀번호: ●●●● (복구: <strong>' + _esc(appForCode.pin) + '</strong>)'
          : '비밀번호: 미설정';

        var statusText = !appForCode ? '미사용' : (appForCode.status === 'submitted' || appForCode.status === 'processing' || appForCode.status === 'completed') ? statusLabel[appForCode.status] || '제출완료' : '작성중';
        var statusColor = !appForCode ? '#9CA3AF' : (appForCode.status === 'submitted' || appForCode.status === 'completed') ? '#16A34A' : '#A16207';

        var codeCard = el('div', 'rt-code-card');

        var codeMeta = el('div', 'rt-code-meta');
        codeMeta.innerHTML =
          '<div class="rt-code-val">' + _esc(c.code) + '</div>' +
          '<div class="rt-code-info">' +
            '<strong>' + _esc(c.name || '(이름없음)') + '</strong>' +
            (c.dept ? ' · ' + _esc(c.dept) : '') +
            (c.empNo ? ' · ' + _esc(c.empNo) : '') + '<br>' +
            '발급: ' + _fmtDT(c.createdAt) + '<br>' +
            pinDisplay + '<br>' +
            '상태: <span style="color:' + statusColor + ';font-weight:600">' + statusText + '</span>' +
          '</div>';

        var btnWrap = el('div'); btnWrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0;margin-top:8px';

        var copyBtn = el('button', 'rt-btn rt-btn-outline rt-btn-sm', '📋 코드 복사');
        copyBtn.addEventListener('click', function() {
          var msg =
            '[퇴직 사직서 접수 코드]\n' +
            '코드: ' + c.code + '\n' +
            '작성 방법: ASEA 캘린더 관리 → 인사관리 탭 → 퇴직관리 → 최초 작성\n' +
            '위 코드를 입력하고 본인 비밀번호를 설정하여 작성을 시작하세요.\n' +
            '담당: 방시원 차장 (내선 288, bangsw@asea.or.kr)';
          if (navigator.clipboard) {
            navigator.clipboard.writeText(msg).then(function(){ toast('안내 메시지가 복사되었습니다.'); });
          } else {
            prompt('아래 내용을 복사하세요.', msg);
          }
        });

        var delBtn = el('button', 'rt-btn rt-btn-danger rt-btn-sm', '삭제');
        delBtn.addEventListener('click', function() {
          if (!confirm(c.name + '(' + c.code + ') 코드 및 사직서 데이터를 삭제하시겠습니까?')) return;
          var cs = loadCodes().filter(function(x){ return x.code !== c.code; });
          var as = loadApps().filter(function(x){ return x.code !== c.code; });
          saveCodes(cs); saveApps(as);
          toast('삭제되었습니다.'); _render();
        });

        btnWrap.appendChild(copyBtn);
        btnWrap.appendChild(delBtn);
        codeCard.appendChild(codeMeta);
        codeCard.appendChild(btnWrap);
        section.appendChild(codeCard);
      });
    }

    wrap.appendChild(section);
  }

  /* ── 제출 목록 탭 ── */
  function _renderMgrApps(wrap) {
    var section = el('div', 'rt-mgr-section');
    var apps = loadApps().filter(function(a){ return a.status !== 'draft' || (a.form && a.form.name); });

    if (!apps.length) {
      var empty = el('div', 'rt-empty'); empty.textContent = '제출된 사직서가 없습니다.';
      section.appendChild(empty);
      wrap.appendChild(section);
      return;
    }

    var statusLabel = { draft: '작성중', submitted: '접수', processing: '처리중', completed: '완료' };
    var statusBadge = { draft: 'rt-badge rt-badge-draft', submitted: 'rt-badge rt-badge-submitted', processing: 'rt-badge rt-badge-processing', completed: 'rt-badge rt-badge-completed' };

    apps.slice().reverse().forEach(function (app) {
      var f = app.form;
      var r = el('div', 'rt-mgr-row');

      var info = el('div', 'rt-mgr-info');
      info.innerHTML =
        '<strong style="font-size:14px">' + _esc(f.name || '이름없음') + '</strong>' +
        ' <span style="color:#6B7280;font-size:12px">' + _esc(f.dept) + ' ' + _esc(f.rank) + '</span><br>' +
        '<span style="font-size:12px;color:#4B5563">' +
        '퇴사예정: <strong>' + (f.retireDate || '미입력') + '</strong>' +
        ' &nbsp;|&nbsp; 제출: ' + (app.submittedAt ? new Date(app.submittedAt).toLocaleDateString('ko-KR') : '미제출') +
        ' &nbsp;|&nbsp; IRP: ' + (app.irp.bank || '-') +
        '</span>';

      var badge = el('span', statusBadge[app.status] || 'rt-badge rt-badge-draft');
      badge.textContent = statusLabel[app.status] || app.status;

      var btnWrap = el('div'); btnWrap.style.cssText = 'display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap';

      var pvBtn = el('button', 'rt-btn rt-btn-outline rt-btn-sm', '📄 사직서');
      pvBtn.addEventListener('click', function () { _printResignation(app); });

      var stSel = document.createElement('select'); stSel.className = 'rt-input';
      stSel.style.cssText = 'font-size:12px;padding:4px 6px;width:auto';
      ['submitted','processing','completed'].forEach(function (s) {
        var o = document.createElement('option'); o.value = s; o.textContent = statusLabel[s];
        if (s === app.status) o.selected = true;
        stSel.appendChild(o);
      });
      stSel.addEventListener('change', function () { app.status = this.value; saveApp(app); _render(); });

      btnWrap.appendChild(pvBtn); btnWrap.appendChild(stSel);
      r.appendChild(info); r.appendChild(badge); r.appendChild(btnWrap);
      section.appendChild(r);
    });

    wrap.appendChild(section);
  }

  /* ════ 인쇄 ════ */
  function _printResignation(app) {
    var f = app.form;

    var html =
      '<div style="width:185mm;margin:0 auto;font-family:\'맑은 고딕\',sans-serif;font-size:10pt;line-height:1.6;color:#000">' +

      /* 타이틀 + 결재란 */
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5mm">' +
      '<h1 style="font-size:28pt;letter-spacing:12px;font-weight:900;margin:0;border-bottom:2px solid #000;padding-bottom:2mm">사 직 서</h1>' +
      '<table style="border-collapse:collapse;font-size:9pt;flex-shrink:0">' +
      '<tr><td rowspan="2" style="border:1px solid #000;padding:2mm 4mm;text-align:center;vertical-align:middle;font-size:9pt">인사<br>부서</td>' +
      '<td style="border:1px solid #000;padding:1mm 6mm;text-align:center;background:#f5f5f5">기획처장</td>' +
      '<td style="border:1px solid #000;padding:1mm 6mm;text-align:center;background:#f5f5f5">총괄이사</td>' +
      '<td style="border:1px solid #000;padding:1mm 6mm;text-align:center;background:#f5f5f5">이 사 장</td></tr>' +
      '<tr><td style="border:1px solid #000;padding:5mm 8mm">&nbsp;</td>' +
      '<td style="border:1px solid #000;padding:5mm 8mm">&nbsp;</td>' +
      '<td style="border:1px solid #000;padding:4mm 8mm;text-align:right;vertical-align:bottom;font-size:11pt">ㅣ</td></tr>' +
      '</table></div>' +

      /* 인적사항 테이블 */
      '<table style="width:100%;border-collapse:collapse;margin-bottom:4mm">' +
      '<tr>' +
      '<td style="border:1px solid #000;padding:2mm;width:12%;background:#f5f5f5;font-weight:700">1. 소 속</td>' +
      '<td style="border:1px solid #000;padding:2mm;width:30%">' + _esc(f.dept) + '</td>' +
      '<td style="border:1px solid #000;padding:2mm;width:15%;background:#f5f5f5;font-weight:700">5. 사원번호</td>' +
      '<td style="border:1px solid #000;padding:2mm">' + _esc(f.empNo) + '</td>' +
      '</tr><tr>' +
      '<td style="border:1px solid #000;padding:2mm;background:#f5f5f5;font-weight:700">2. 직 위</td>' +
      '<td style="border:1px solid #000;padding:2mm">' + _esc(f.rank) + '</td>' +
      '<td style="border:1px solid #000;padding:2mm;background:#f5f5f5;font-weight:700">6. 주민등록번호</td>' +
      '<td style="border:1px solid #000;padding:2mm">' + _esc(f.regNo) + '</td>' +
      '</tr><tr>' +
      '<td style="border:1px solid #000;padding:2mm;background:#f5f5f5;font-weight:700">3. 직 무</td>' +
      '<td style="border:1px solid #000;padding:2mm">' + _esc(f.duty) + '</td>' +
      '<td style="border:1px solid #000;padding:2mm;background:#f5f5f5;font-weight:700">7. 입 사 일</td>' +
      '<td style="border:1px solid #000;padding:2mm">' + _fmtKo(f.hireDate) + '</td>' +
      '</tr><tr>' +
      '<td style="border:1px solid #000;padding:2mm;background:#f5f5f5;font-weight:700">4. 성 명</td>' +
      '<td style="border:1px solid #000;padding:2mm">' + _esc(f.name) + '</td>' +
      '<td style="border:1px solid #000;padding:2mm;background:#f5f5f5;font-weight:700">8. 퇴 사 일</td>' +
      '<td style="border:1px solid #000;padding:2mm;font-weight:700;color:#c00">' + _fmtKo(f.retireDate) + '</td>' +
      '</tr></table>' +

      /* 퇴직사유 */
      '<div style="font-weight:700;font-size:10pt;margin-bottom:2mm">9. 퇴사 사유</div>' +
      '<div style="border:1px solid #000;padding:4mm;min-height:20mm;font-size:10pt;color:#222">' +
        _esc(f.reasonDetail || f.reasonType || '') +
      '</div>' +

      /* 선언문 */
      '<p style="margin:5mm 0 3mm;font-size:10pt">상기본인은 위와 같은 사유로 퇴직하고자 하오니, 이를 승인하여 주시기 바랍니다.</p>' +

      /* 날짜 + 서명 */
      '<div style="display:flex;justify-content:flex-end;align-items:center;gap:8mm;margin:4mm 0">' +
      '<span style="font-size:11pt">' + _fmtKo(f.signDate) + '</span>' +
      '<span style="font-size:11pt">&nbsp;&nbsp;상기본인&nbsp;&nbsp;' + _esc(f.name) + '&nbsp;&nbsp;(인)</span>' +
      (f.signB64
        ? '<img src="' + f.signB64 + '" style="height:22mm;width:38mm;object-fit:contain;border-bottom:1px solid #000">'
        : '<div style="width:38mm;height:22mm;border-bottom:1px solid #000"></div>') +
      '</div>' +

      '<p style="text-align:center;font-size:12pt;font-weight:700;margin:4mm 0">(재) 아세아항공직업전문학교 이사장 귀하</p>' +

      /* 반납 테이블 */
      '<table style="width:100%;border-collapse:collapse;margin-top:5mm;font-size:9pt">' +
      '<tr>' +
      '<th style="border:1px solid #000;padding:2mm;background:#eee;width:20%">부서장 면담 소견</th>' +
      '<th style="border:1px solid #000;padding:2mm;background:#eee;width:50%" colspan="2">반납하여야할 비품 및 서류</th>' +
      '<th style="border:1px solid #000;padding:2mm;background:#eee" colspan="2">부서장 확인</th>' +
      '</tr>' +
      '<tr>' +
      '<td rowspan="6" style="border:1px solid #000;padding:2mm;vertical-align:top"></td>' +
      '<td style="border:1px solid #000;padding:2mm;text-align:center">1</td>' +
      '<td style="border:1px solid #000;padding:2mm">의료보험 카드(&nbsp;&nbsp;&nbsp;&nbsp;)</td>' +
      '<td style="border:1px solid #000;padding:1mm;text-align:center;background:#f5f5f5">직위</td>' +
      '<td style="border:1px solid #000;padding:1mm;text-align:center;background:#f5f5f5">성명</td>' +
      '</tr>' +
      '<tr><td style="border:1px solid #000;padding:2mm;text-align:center">2</td>' +
      '<td style="border:1px solid #000;padding:2mm">물품 및 비품(&nbsp;&nbsp;&nbsp;&nbsp;)</td>' +
      '<td rowspan="4" style="border:1px solid #000;padding:2mm"></td><td rowspan="4" style="border:1px solid #000;padding:2mm"></td></tr>' +
      '<tr><td style="border:1px solid #000;padding:2mm;text-align:center">3</td>' +
      '<td style="border:1px solid #000;padding:2mm">서&nbsp;&nbsp;류(&nbsp;&nbsp;&nbsp;&nbsp;)</td></tr>' +
      '<tr><td style="border:1px solid #000;padding:2mm;text-align:center">4</td>' +
      '<td style="border:1px solid #000;padding:2mm">유니폼(&nbsp;&nbsp;&nbsp;&nbsp;)</td></tr>' +
      '<tr><td style="border:1px solid #000;padding:2mm;text-align:center">5</td>' +
      '<td style="border:1px solid #000;padding:2mm">기&nbsp;&nbsp;타(&nbsp;&nbsp;&nbsp;&nbsp;)</td></tr>' +
      '<tr><td style="border:1px solid #000;padding:2mm" colspan="3">직위:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 성명:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; (비고란)</td>' +
      '<td style="border:1px solid #000;padding:2mm"></td><td style="border:1px solid #000;padding:2mm"></td></tr>' +
      '</table>' +

      '<p style="font-size:8pt;color:#888;margin-top:6mm;border-top:1px solid #ddd;padding-top:2mm">' +
      '작성일시: ' + new Date(app.createdAt).toLocaleString('ko-KR') +
      (app.submittedAt ? ' &nbsp;|&nbsp; 제출일시: ' + new Date(app.submittedAt).toLocaleString('ko-KR') : '') +
      '</p>' +
      '</div>';

    var win = window.open('', '_blank', 'width:920,height:780,scrollbars=yes');
    if (!win) { alert('팝업이 차단되었습니다. 팝업을 허용한 후 다시 시도하세요.'); return; }
    win.document.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>사직서 — ' + _esc(f.name) + '</title>' +
      '<style>body{margin:0;padding:12mm;background:#fff}@media print{@page{size:A4;margin:0}body{padding:0}}</style>' +
      '</head><body>' + html +
      '<div style="text-align:center;padding:16px;margin-top:8mm">' +
      '<button onclick="window.print()" style="padding:10px 28px;font-size:14px;background:#1a3a5c;color:#fff;border:none;border-radius:6px;cursor:pointer">🖨️ 인쇄</button>' +
      '&nbsp;<button onclick="window.close()" style="padding:10px 20px;font-size:14px;background:#6B7280;color:#fff;border:none;border-radius:6px;cursor:pointer">닫기</button>' +
      '</div></body></html>'
    );
    win.document.close();
  }

  /* ── 유틸 ── */
  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function _fmtKo(v) {
    if (!v) return '';
    var p = v.split('-');
    if (p.length === 3) return p[0] + '년 ' + parseInt(p[1]) + '월 ' + parseInt(p[2]) + '일';
    return v;
  }
  function _fmtDT(ts) {
    if (!ts) return '-';
    var d = new Date(ts);
    return d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0') +
           ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }

  /* ── CSS 클래스 추가 (rt-auth-wrap 등 없으면 기존 스타일 활용) ── */

  /* ── 초기화 ── */
  function init() {
    var root = document.getElementById('retire-root');
    if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);
    _st = { view: 'home', isAdmin: false, app: null, step: 0, mgrTab: 'codes' };
    _render();
  }

  return { init: init };
})();
