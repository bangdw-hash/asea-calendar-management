/* ════════════════════════════════════════════════════
   퇴직자 관리 모듈 — retire.js  v=20260611rt3
   링크 기반 신청 + 저장코드 이어쓰기 시스템
   ════════════════════════════════════════════════════ */
window.RetireModule = (function () {
  'use strict';

  var STANDALONE = !!window.RETIRE_STANDALONE; // retire-form.html에서 설정됨
  var ADMIN_PW   = 'asea2024hr';
  var APPS_KEY   = 'asea_retire_apps';

  var _st = { view: 'home', step: 0, app: null, isAdmin: false, mgrTab: 'link' };

  /* ── 스토리지 ── */
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

  /* ── 저장 코드 생성 (6자리) ── */
  function _genResumeCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = '';
    for (var i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  /* ── 빈 앱 데이터 ── */
  function blankApp() {
    return {
      id: 'RT' + Date.now() + Math.random().toString(36).slice(2,5),
      resumeCode: '',
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
    var sub   = el('div', 'rt-home-sub',
      STANDALONE ? '사직서를 온라인으로 작성·제출하는 시스템입니다.'
                 : '사직서 온라인 제출 및 퇴직 절차 안내 시스템');
    wrap.appendChild(title); wrap.appendChild(sub);

    var cards = el('div', 'rt-role-cards');

    if (STANDALONE) {
      /* ── 공개 링크 진입 화면 ── */
      var c1 = el('div', 'rt-role-card');
      c1.innerHTML =
        '<div class="rt-role-icon">✍️</div>' +
        '<div class="rt-role-title">새로 작성하기</div>' +
        '<div class="rt-role-desc">처음 작성하시는 분<br>이름을 입력하고 바로 시작하세요</div>';
      c1.addEventListener('click', function () { _st.view = 'new-entry'; _render(); });

      var c2 = el('div', 'rt-role-card');
      c2.innerHTML =
        '<div class="rt-role-icon">🔄</div>' +
        '<div class="rt-role-title">이어서 작성하기</div>' +
        '<div class="rt-role-desc">이전에 저장한 코드가 있는 분<br>저장 코드 + 이름으로 이어쓰세요</div>';
      c2.addEventListener('click', function () { _st.view = 'edit-entry'; _render(); });

      cards.appendChild(c1); cards.appendChild(c2);
    } else {
      /* ── index.html 관리자 진입 화면 ── */
      var apps = loadApps();
      var draftCount = apps.filter(function(a){ return a.status === 'draft'; }).length;
      var subCount   = apps.filter(function(a){ return a.status !== 'draft'; }).length;

      var cLink = el('div', 'rt-role-card');
      cLink.innerHTML =
        '<div class="rt-role-icon">📋</div>' +
        '<div class="rt-role-title">신청 링크 복사</div>' +
        '<div class="rt-role-desc">퇴직 대상자에게 보낼<br>작성 링크를 복사합니다</div>';
      cLink.addEventListener('click', function () {
        var url = _getFormUrl('retire-form.html');
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(function(){ toast('링크가 복사되었습니다.'); });
        } else {
          prompt('아래 링크를 복사하여 전달하세요.', url);
        }
      });

      var cAdmin = el('div', 'rt-role-card');
      cAdmin.innerHTML =
        '<div class="rt-role-icon">👔</div>' +
        '<div class="rt-role-title">인사관리자</div>' +
        '<div class="rt-role-desc">제출된 사직서 조회<br>' +
        '(작성중 ' + draftCount + '건 · 제출 ' + subCount + '건)</div>';
      cAdmin.addEventListener('click', function () { _renderAdminAuth(); });

      cards.appendChild(cLink); cards.appendChild(cAdmin);
    }

    wrap.appendChild(cards);
    root.appendChild(wrap);
  }

  function _getFormUrl(filename) {
    var base = window.location.href.replace(/[^/]*$/, '');
    return base + filename;
  }

  function _renderAdminAuth() {
    var pw = prompt('인사관리자 비밀번호를 입력하세요.');
    if (pw === ADMIN_PW) { _st.isAdmin = true; _st.view = 'manager'; _st.mgrTab = 'link'; _render(); }
    else if (pw !== null) toast('비밀번호가 올바르지 않습니다.', '#DC2626');
  }

  /* ── 새로 작성하기 (이름 입력 → 폼 진입) ── */
  function _renderNewEntry(root) {
    var wrap = el('div', 'rt-auth-wrap');
    var box  = el('div', 'rt-auth-box');
    box.innerHTML =
      '<div class="rt-auth-icon">✍️</div>' +
      '<div class="rt-auth-title">새로 작성하기</div>' +
      '<div class="rt-auth-desc">성명을 입력하면 바로 작성이 시작됩니다.<br>' +
      '<span style="font-size:11px;color:#6B7280">작성 중에 <strong>💾 중간 저장</strong> 버튼을 누르면<br>저장 코드가 발급되어 나중에 이어쓸 수 있습니다.</span></div>' +
      '<label class="rt-auth-label">성명 (실명)</label>' +
      '<input class="rt-auth-input" id="rt-ne-name" type="text" placeholder="홍길동" autocomplete="off">' +
      '<div class="rt-auth-err" id="rt-ne-err"></div>' +
      '<button class="rt-btn rt-btn-primary" id="rt-ne-btn" style="width:100%;margin-top:14px;margin-bottom:10px">작성 시작 →</button>' +
      '<button class="rt-btn rt-btn-ghost" id="rt-ne-back" style="width:100%">← 돌아가기</button>';
    wrap.appendChild(box);
    root.appendChild(wrap);

    var nameInp = document.getElementById('rt-ne-name');
    nameInp.focus();
    nameInp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') document.getElementById('rt-ne-btn').click();
    });

    document.getElementById('rt-ne-btn').addEventListener('click', function() {
      var name = document.getElementById('rt-ne-name').value.trim();
      var err  = document.getElementById('rt-ne-err');
      if (!name) { err.textContent = '성명을 입력해 주세요.'; return; }
      var app = blankApp();
      app.form.name = name;
      saveApp(app);
      _st.app  = app;
      _st.step = 0;
      _st.view = 'form';
      _render();
    });
    document.getElementById('rt-ne-back').addEventListener('click', function() {
      _st.view = 'home'; _render();
    });
  }

  /* ── 이어서 작성하기 (저장 코드 + 이름) ── */
  function _renderEditEntry(root) {
    var wrap = el('div', 'rt-auth-wrap');
    var box  = el('div', 'rt-auth-box');
    box.innerHTML =
      '<div class="rt-auth-icon">🔄</div>' +
      '<div class="rt-auth-title">이어서 작성하기</div>' +
      '<div class="rt-auth-desc">중간 저장 시 발급된 <strong>저장 코드</strong>와<br>본인 <strong>이름</strong>을 입력하세요.</div>' +
      '<label class="rt-auth-label">저장 코드 (6자리)</label>' +
      '<input class="rt-auth-input" id="rt-ee-code" type="text" maxlength="8" placeholder="XXXXXX" autocomplete="off" style="text-transform:uppercase;letter-spacing:4px;font-size:18px;text-align:center">' +
      '<label class="rt-auth-label" style="margin-top:10px">성명</label>' +
      '<input class="rt-auth-input" id="rt-ee-name" type="text" placeholder="홍길동" autocomplete="off">' +
      '<div class="rt-auth-err" id="rt-ee-err"></div>' +
      '<button class="rt-btn rt-btn-primary" id="rt-ee-btn" style="width:100%;margin-top:14px;margin-bottom:10px">이어서 작성하기</button>' +
      '<button class="rt-btn rt-btn-ghost" id="rt-ee-back" style="width:100%">← 돌아가기</button>';
    wrap.appendChild(box);
    root.appendChild(wrap);

    document.getElementById('rt-ee-code').addEventListener('input', function() {
      this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });

    var doResume = function() {
      var code = document.getElementById('rt-ee-code').value.trim().toUpperCase();
      var name = document.getElementById('rt-ee-name').value.trim();
      var err  = document.getElementById('rt-ee-err');
      err.textContent = '';
      if (!code || code.length < 6) { err.textContent = '저장 코드 6자리를 입력해 주세요.'; return; }
      if (!name) { err.textContent = '성명을 입력해 주세요.'; return; }
      var apps = loadApps();
      var app  = apps.find(function(a){
        return a.resumeCode === code && (a.form.name || '').trim() === name;
      });
      if (!app) { err.textContent = '저장 코드 또는 이름이 일치하지 않습니다.'; return; }
      if (app.status === 'submitted') {
        err.textContent = '이미 최종 제출된 사직서입니다.'; return;
      }
      _st.app  = app;
      _st.step = 0;
      _st.view = 'form';
      _render();
    };
    document.getElementById('rt-ee-btn').addEventListener('click', doResume);
    document.getElementById('rt-ee-name').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doResume();
    });
    document.getElementById('rt-ee-back').addEventListener('click', function() {
      _st.view = 'home'; _render();
    });
  }

  /* ── 중간 저장 + 코드 오버레이 ── */
  function _midSave() {
    var app = _st.app;
    if (!app.resumeCode) {
      var codes = loadApps().map(function(a){ return a.resumeCode; });
      var c;
      do { c = _genResumeCode(); } while (codes.indexOf(c) > -1);
      app.resumeCode = c;
    }
    saveApp(app);
    _showSaveCodeOverlay(app);
  }

  function _showSaveCodeOverlay(app) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9990;display:flex;align-items:center;justify-content:center;padding:16px';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:16px;padding:28px 24px;max-width:360px;width:100%;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.3)';
    box.innerHTML =
      '<div style="font-size:36px;margin-bottom:8px">✅</div>' +
      '<div style="font-size:18px;font-weight:700;color:#1a3a5c;margin-bottom:6px">중간 저장 완료</div>' +
      '<div style="font-size:12px;color:#6B7280;line-height:1.7;margin-bottom:18px">아래 저장 코드를 반드시 메모해 두세요.<br>같은 링크에서 <strong>이어서 작성하기</strong> → 코드+이름 입력으로<br>언제든 이어서 작성할 수 있습니다.</div>' +
      '<div style="background:#EFF6FF;border:2px solid #2563EB;border-radius:10px;padding:16px;margin-bottom:16px">' +
        '<div style="font-size:11px;color:#6B7280;margin-bottom:6px;font-weight:600">저장 코드</div>' +
        '<div style="font-size:30px;font-weight:900;letter-spacing:8px;color:#1D4ED8;font-family:monospace">' + _esc(app.resumeCode) + '</div>' +
        '<div style="font-size:12px;color:#374151;margin-top:8px">이름: <strong>' + _esc(app.form.name) + '</strong></div>' +
      '</div>' +
      '<button id="rt-ov-copy" style="display:block;width:100%;padding:10px;background:#1a3a5c;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px">📋 코드 복사</button>' +
      '<button id="rt-ov-close" style="display:block;width:100%;padding:10px;background:#F3F4F6;color:#374151;border:none;border-radius:8px;font-size:14px;cursor:pointer">계속 작성하기</button>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    box.querySelector('#rt-ov-copy').addEventListener('click', function() {
      var msg = '[퇴직 사직서 저장 코드]\n저장 코드: ' + app.resumeCode + '\n이름: ' + app.form.name + '\n\n이 코드와 이름으로 동일한 링크에서 이어서 작성할 수 있습니다.';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(msg).then(function(){ toast('복사되었습니다.'); });
      } else { prompt('아래 내용을 복사하세요.', msg); }
    });
    box.querySelector('#rt-ov-close').addEventListener('click', function() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
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

    var saveBtn = el('button', 'rt-btn rt-btn-outline', '💾 중간 저장 (저장 코드 발급)');
    saveBtn.style.cssText = 'width:100%;margin-bottom:6px';
    saveBtn.addEventListener('click', function () { saveApp(_st.app); _midSave(); });
    wrap.appendChild(saveBtn);

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

    var saveBtn2 = el('button', 'rt-btn rt-btn-outline', '💾 중간 저장 (저장 코드 발급)');
    saveBtn2.style.cssText = 'width:100%;margin-bottom:6px';
    saveBtn2.addEventListener('click', function () { saveApp(_st.app); _midSave(); });
    wrap.appendChild(saveBtn2);

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
      { key: 'link', label: '🔗 신청 링크' },
      { key: 'apps', label: '📋 신청 목록' },
    ];
    tabs.forEach(function(t) {
      var btn = el('button', 'rt-mgr-tab' + (_st.mgrTab === t.key ? ' active' : ''), t.label);
      btn.addEventListener('click', function() { _st.mgrTab = t.key; _render(); });
      tabBar.appendChild(btn);
    });
    wrap.appendChild(tabBar);

    if (_st.mgrTab === 'link') _renderMgrLink(wrap);
    else                        _renderMgrApps(wrap);

    root.appendChild(wrap);
  }

  /* ── 신청 링크 탭 ── */
  function _renderMgrLink(wrap) {
    var section = el('div', 'rt-mgr-section');
    var formUrl = _getFormUrl('retire-form.html');

    var card = el('div', 'rt-card');
    var head = el('div', 'rt-card-head');
    head.innerHTML = '<div class="rt-card-title">🔗 퇴직 신청 링크</div>';
    card.appendChild(head);

    var body = el('div', 'rt-card-body');
    var desc = el('div');
    desc.style.cssText = 'font-size:13px;color:#374151;line-height:1.8;margin-bottom:14px';
    desc.innerHTML =
      '퇴직 대상자에게 아래 링크를 전달하세요.<br>' +
      '대상자가 링크를 열면 <strong>이름을 입력하고 바로 사직서를 작성</strong>할 수 있습니다.<br>' +
      '<span style="font-size:11px;color:#6B7280">작성 중 <strong>중간 저장</strong> 시 저장 코드가 발급되며, 같은 링크에서 이어서 작성 가능합니다.</span>';
    body.appendChild(desc);

    var urlBox = el('div');
    urlBox.style.cssText = 'background:#F9FAFB;border:1px solid #D1D5DB;border-radius:8px;padding:12px;font-size:13px;word-break:break-all;color:#1D4ED8;margin-bottom:12px';
    urlBox.textContent = formUrl;
    body.appendChild(urlBox);

    var btnRow = el('div'); btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';

    var copyBtn = el('button', 'rt-btn rt-btn-primary', '📋 링크 복사');
    copyBtn.addEventListener('click', function() {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(formUrl).then(function(){ toast('링크가 복사되었습니다.'); });
      } else { prompt('아래 링크를 복사하세요.', formUrl); }
    });

    var msgBtn = el('button', 'rt-btn rt-btn-outline', '📨 안내 메시지 복사');
    msgBtn.addEventListener('click', function() {
      var msg = '[퇴직 사직서 온라인 작성 안내]\n\n아래 링크를 열어 사직서를 작성해 주세요.\n' + formUrl + '\n\n' +
        '✅ 이름을 입력하면 바로 작성 시작\n💾 중간 저장 후 저장 코드 보관 → 나중에 이어서 작성 가능\n\n담당: 방시원 차장 (내선 288, bangsw@asea.or.kr)';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(msg).then(function(){ toast('안내 메시지가 복사되었습니다.'); });
      } else { prompt('아래 내용을 복사하세요.', msg); }
    });

    btnRow.appendChild(copyBtn); btnRow.appendChild(msgBtn);
    body.appendChild(btnRow);
    card.appendChild(body);
    section.appendChild(card);
    wrap.appendChild(section);
  }

  /* ── 신청 목록 탭 ── */
  function _renderMgrApps(wrap) {
    var section = el('div', 'rt-mgr-section');
    var apps = loadApps().filter(function(a){ return a.form && a.form.name; });

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
        (app.resumeCode ? ' &nbsp;|&nbsp; 저장코드: <strong style="color:#2563EB">' + _esc(app.resumeCode) + '</strong>' : '') +
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
