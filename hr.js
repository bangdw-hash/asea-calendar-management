/* =============================================================================
   hr.js — 인사관리 모듈  window.HRModule
   ============================================================================= */
'use strict';

window.HRModule = (function () {

  /* ── 상수 ── */
  var STANDALONE = !!window.HR_STANDALONE;  // hr-form.html에서 설정됨
  var ROOT_ID  = 'hr-root';
  var LS_APPS  = 'asea_hr_applicants';
  var LS_CODES = 'asea_hr_codes';
  var LS_CFG   = 'asea_hr_config';
  var MGR_PW   = 'asea2024hr';
  var ADM_PW   = 'asea2024admin';

  /* ── 상태 ── */
  var _st = {
    hrTab:        'onboard',
    view:         'home',      // home | portal | manager | admin
    applicant:    null,
    appStep:      0,
    mgrAuth:      false,
    admAuth:      false,
    viewTarget:   null,
    editCode:     null,
    isDemo:       false,
    _pendingCode: null,
    _pendingMode: null,
  };

  /* ── 유틸 ── */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtDT(ts) {
    if (!ts) return '-';
    var d = new Date(ts);
    return d.getFullYear() + '.' + pad2(d.getMonth()+1) + '.' + pad2(d.getDate()) +
           ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.getFullYear() + '년 ' + pad2(d.getMonth()+1) + '월 ' + pad2(d.getDate()) + '일';
  }
  function toast(msg, color) {
    var t = document.getElementById('hr-toast');
    if (!t) { t = document.createElement('div'); t.id = 'hr-toast'; document.body.appendChild(t); }
    t.className = 'hr-toast';
    t.style.background = color || '#1a3a5c';
    t.textContent = msg;
    clearTimeout(t._tid);
    t._tid = setTimeout(function() { t.remove(); }, 2600);
  }

  /* ── localStorage helpers ── */
  function loadApps() {
    try { return JSON.parse(localStorage.getItem(LS_APPS) || '[]'); } catch(e) { return []; }
  }
  function saveApps(arr) { localStorage.setItem(LS_APPS, JSON.stringify(arr)); }
  function loadCodes() {
    try { return JSON.parse(localStorage.getItem(LS_CODES) || '[]'); } catch(e) { return []; }
  }
  function saveCodes(arr) { localStorage.setItem(LS_CODES, JSON.stringify(arr)); }
  function loadCfg() {
    try { return JSON.parse(localStorage.getItem(LS_CFG) || '{}'); } catch(e) { return {}; }
  }
  function saveCfg(obj) { localStorage.setItem(LS_CFG, JSON.stringify(obj)); }

  /* ── 빈 지원자 객체 ── */
  function blankApp(code) {
    return {
      id: uid(), code: code || '', pin: '', resumeCode: '', type: 'onboard',
      status: 'pending',  // pending | partial | submitted | approved
      createdAt: Date.now(), submittedAt: null, printedAt: null,
      form1: {            // 채용지원서
        jobGroup: '', deptCheckboxes: [],
        nameKr: '', nameHj: '', gender: '', birth: '',
        address: '', mobile: '', email: '',
        married: '', familyHead: '', military: '', milBranch: '', milRank: '',
        education: [ {type:'고등학교',from:'',to:'',country:'',school:'',major:'',degree:'',gpa:''},
                     {type:'학사',from:'',to:'',country:'',school:'',major:'',degree:'',gpa:''},
                     {type:'석사',from:'',to:'',country:'',school:'',major:'',degree:'',gpa:''},
                     {type:'박사',from:'',to:'',country:'',school:'',major:'',degree:'',gpa:''} ],
        family: [{rel:'',name:'',birth:'',job:'',age:''},{rel:'',name:'',birth:'',job:'',age:''},
                 {rel:'',name:'',birth:'',job:'',age:''}],
        career: [{from:'',to:'',months:'',org:'',rank:'',duties:'',hours:''},
                 {from:'',to:'',months:'',org:'',rank:'',duties:'',hours:''},
                 {from:'',to:'',months:'',org:'',rank:'',duties:'',hours:''},
                 {from:'',to:'',months:'',org:'',rank:'',duties:'',hours:''}],
        langToeic:'', langTeps:'', langOther:'',
        pcLevel:'',
        aiTools: [{tool:'',purpose:'',level:''}],
        certs: [{date:'',type:'',issuer:''},{date:'',type:'',issuer:''},{date:'',type:'',issuer:''}],
        awards: [{date:'',type:'',org:''},{date:'',type:'',org:''}],
        thesis: [{type:'석사학위',title:'',date:'',school:'',summary:''},
                 {type:'박사학위',title:'',date:'',school:'',summary:''}],
        signDate: '', photoB64: '', signB64: ''
      },
      form2: {            // 개인정보 동의서
        agreeInfo: false, agreeId: false, agreePromo: false,
        signDate: '', signB64: '', nameConfirm: ''
      },
      files: {            // 서류 업로드
        career: [],       // 경력/재직증명서
        certs:  [],       // 자격증 사본
        edu:    [],       // 졸업/성적증명서
        reg:    [],       // 주민등록등본/가족관계증명서
        bank:   [],       // 급여통장 사본
      },
      pensionDone: false, // 퇴직연금 서류 안내 확인
    };
  }

  /* ── 메인 렌더 ── */
  function _render() {
    var root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.innerHTML = '';
    var wrap = el('div', 'hr-wrap');
    root.appendChild(wrap);

    if (STANDALONE) {
      // 공개 링크 모드: 서브탭 없이 입사 신청 폼만
      var content = el('div', 'hr-content');
      wrap.appendChild(content);
      _renderOnboard(content);
      return;
    }

    var content = el('div', 'hr-content');
    wrap.appendChild(content);
    _renderOnboard(content);
  }

  function _buildNav() {
    var tabs = [
      { id: 'onboard', label: '입사자 관리' },
      { id: 'resign',  label: '퇴사자 관리' },
      { id: 'leave',   label: '휴직자 관리' },
      { id: 'other',   label: '기타 관리' },
    ];
    var nav = el('div', 'hr-nav');
    tabs.forEach(function(t) {
      var b = el('button', 'hr-nav-btn' + (t.id === _st.hrTab ? ' active' : ''), t.label);
      if (t.id === 'onboard') {
        var apps = loadApps();
        var pending = apps.filter(function(a){ return a.status === 'submitted'; }).length;
        if (pending > 0) {
          var badge = el('span', 'hr-nav-badge', String(pending));
          b.appendChild(badge);
        }
      }
      b.addEventListener('click', function() {
        _st.hrTab = t.id; _st.view = 'home';
        _st.mgrAuth = false; _render();
      });
      nav.appendChild(b);
    });
    return nav;
  }

  function _renderComingSoon(wrap, name) {
    var box = el('div', 'hr-empty');
    box.innerHTML = '<span class="hr-empty-icon">🚧</span>' + name + ' 메뉴는 준비 중입니다.<br>입사자 관리 완성 후 순차 개발 예정입니다.';
    wrap.appendChild(box);
  }

  /* ══════════════════════════════════════════════
     입사자 관리
  ══════════════════════════════════════════════ */
  function _renderOnboard(wrap) {
    if (_st.view === 'home')     { _renderOnboardHome(wrap); return; }
    if (_st.view === 'portal')   { _renderApplicantPortal(wrap); return; }
    if (_st.view === 'manager')  { _renderManagerView(wrap); return; }
    if (_st.view === 'admin')    { _renderAdminView(wrap); return; }
    if (_st.view === 'contract') { _renderContractView(wrap); return; }
  }

  function _renderContractView(wrap) {
    var div = el('div', 'hr-wrap');
    var topBar = el('div', 'hr-mgr-topbar');
    var titleEl = el('strong'); titleEl.style.cssText = 'font-size:16px;color:#1a3a5c';
    titleEl.textContent = '근로계약서 관리';
    topBar.appendChild(titleEl);
    var backBtn = el('button', 'hr-btn hr-btn-ghost hr-btn-sm', '← 돌아가기');
    backBtn.style.marginLeft = 'auto';
    backBtn.addEventListener('click', function() { _st.view = 'home'; _render(); });
    topBar.appendChild(backBtn);
    div.appendChild(topBar);

    var rootDiv = el('div'); rootDiv.id = 'lc-embed-root';
    rootDiv.style.cssText = 'padding:16px 0';
    div.appendChild(rootDiv);
    wrap.appendChild(div);

    // LaborContractModule 초기화 (비동기로 DOM 생성 후)
    setTimeout(function() {
      if (window.LaborContractModule && window.LaborContractModule.init) {
        LaborContractModule.init('lc-embed-root');
      } else {
        rootDiv.innerHTML = '<p style="color:#e53935">근로계약서 모듈을 불러올 수 없습니다. 페이지를 새로고침 해주세요.</p>';
      }
    }, 50);
  }

  /* ── 홈: 역할 선택 ── */
  function _renderOnboardHome(wrap) {
    var screen = el('div', 'hr-role-screen');

    var icon = el('div'); icon.textContent = '🏢'; icon.style.cssText = 'font-size:48px;margin-bottom:12px';
    var title = el('div', 'hr-role-title', '입사자 관리 시스템');

    if (STANDALONE) {
      /* ── 공개 링크 진입: 새로 작성 / 이어서 작성 ── */
      var desc = el('div', 'hr-role-desc', '아세아항공직업전문학교 입사 예정자 서류 제출 시스템');
      var cards = el('div', 'hr-role-cards');

      var c1 = el('div', 'hr-role-card');
      c1.innerHTML = '<div class="hr-role-icon">✍️</div>' +
        '<div class="hr-role-name">새로 작성하기</div>' +
        '<div class="hr-role-hint">처음 서류를 작성하시는 분<br>이름을 입력하고 바로 시작하세요</div>';
      c1.addEventListener('click', function() { _st.view = 'portal'; _st._portalMode = 'new'; _render(); });

      var c2 = el('div', 'hr-role-card');
      c2.innerHTML = '<div class="hr-role-icon">🔄</div>' +
        '<div class="hr-role-name">이어서 작성하기</div>' +
        '<div class="hr-role-hint">이전에 저장한 코드가 있는 분<br>저장 코드 + 이름으로 이어쓰세요</div>';
      c2.addEventListener('click', function() { _st.view = 'portal'; _st._portalMode = 'resume'; _render(); });

      screen.appendChild(icon); screen.appendChild(title); screen.appendChild(desc);
      screen.appendChild(cards);
      cards.appendChild(c1); cards.appendChild(c2);
    } else {
      /* ── 관리자 모드 홈 ── */
      var apps = loadApps();
      var pendingCount = apps.filter(function(a){ return a.status==='submitted'; }).length;
      var draftCount   = apps.filter(function(a){ return a.status==='pending'; }).length;
      var formUrl = _getHRFormUrl();

      // ── 신청자 링크 박스 (항상 상단에 노출) ──
      var linkBox = document.createElement('div');
      linkBox.style.cssText = 'width:100%;max-width:540px;background:#EFF6FF;border:1.5px solid #93C5FD;border-radius:12px;padding:16px 18px;margin-bottom:20px;text-align:left';
      linkBox.innerHTML =
        '<div style="font-size:12px;font-weight:700;color:#1A73E8;margin-bottom:6px;letter-spacing:.4px">📎 입사 신청자 공유 링크</div>' +
        '<div style="font-size:12px;color:#374151;word-break:break-all;background:#fff;border:1px solid #BFDBFE;border-radius:6px;padding:8px 10px;margin-bottom:10px;font-family:monospace">' + formUrl + '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button id="hr-home-copy-link" style="flex:1;padding:8px 0;background:#2563EB;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer">📋 링크 복사</button>' +
          '<button id="hr-home-copy-msg"  style="flex:1;padding:8px 0;background:#fff;color:#2563EB;border:1.5px solid #93C5FD;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer">✉️ 안내 메시지 복사</button>' +
        '</div>';
      screen.appendChild(icon); screen.appendChild(title); screen.appendChild(linkBox);

      // 버튼 이벤트
      linkBox.querySelector('#hr-home-copy-link').addEventListener('click', function() {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(formUrl).then(function(){ toast('링크가 복사되었습니다.', '#16A34A'); });
        } else { prompt('아래 링크를 복사하세요.', formUrl); }
      });
      linkBox.querySelector('#hr-home-copy-msg').addEventListener('click', function() {
        var msg = '[입사 서류 제출 안내]\n\n아세아항공직업전문학교 입사 예정자 서류 제출 링크를 안내드립니다.\n\n▶ 서류 제출 링크:\n' + formUrl + '\n\n링크 접속 후 본인 이름을 입력하고 서류를 작성해 주세요.\n작성 중단 시 "💾 중간 저장" 버튼을 누르면 저장 코드가 발급됩니다.\n이후 같은 링크에서 저장 코드 + 이름으로 이어 작성하실 수 있습니다.';
        if (navigator.clipboard) {
          navigator.clipboard.writeText(msg).then(function(){ toast('안내 메시지가 복사되었습니다.', '#16A34A'); });
        } else { prompt('아래 메시지를 복사하세요.', msg); }
      });

      // ── 관리 버튼 ──
      var cards2 = el('div', 'hr-role-cards');
      var roles = [
        { icon: '👀', name: '인사관리자', hint: '제출된 서류 조회 · 출력\n제출 ' + pendingCount + '건', view: 'manager' },
        { icon: '📄', name: '근로계약서', hint: '계약서 작성 · 전자계약\n온라인 서명 링크 발송', view: 'contract' },
        { icon: '⚙️', name: '시스템 관리자', hint: '설정 관리\n작성중 ' + draftCount + '건', view: 'admin' },
      ];
      roles.forEach(function(r) {
        var card = el('div', 'hr-role-card');
        card.innerHTML = '<div class="hr-role-icon">' + r.icon + '</div>' +
          '<div class="hr-role-name">' + r.name + '</div>' +
          '<div class="hr-role-hint">' + r.hint.replace(/\n/g,'<br>') + '</div>';
        card.addEventListener('click', function() { _st.view = r.view; _render(); });
        cards2.appendChild(card);
      });
      screen.appendChild(cards2);

      // 통계 바
      var statRow = el('div', 'hr-stat-row');
      statRow.style.cssText = 'margin-top:20px;justify-content:center;max-width:480px;width:100%';
      var stats = [
        { num: apps.length, label: '전체 지원자' },
        { num: apps.filter(function(a){ return a.status==='submitted'||a.status==='approved'; }).length, label: '제출 완료' },
        { num: apps.filter(function(a){ return a.status==='approved'; }).length, label: '승인 완료' },
      ];
      stats.forEach(function(s) {
        var c = el('div', 'hr-stat-card');
        c.innerHTML = '<div class="hr-stat-num">' + s.num + '</div><div class="hr-stat-label">' + s.label + '</div>';
        statRow.appendChild(c);
      });
      screen.appendChild(statRow);
    }

    wrap.appendChild(screen);
  }

  function _getHRFormUrl() {
    var base = window.location.href.replace(/[^/]*$/, '');
    return base + 'hr-form.html';
  }

  /* ══════════════════════════════════════════════
     입사 예정자 포털
  ══════════════════════════════════════════════ */
  function _renderApplicantPortal(wrap) {
    if (!_st.applicant) {
      if (STANDALONE && _st._portalMode === 'new') {
        _renderStandaloneNew(wrap);
      } else if (STANDALONE && _st._portalMode === 'resume') {
        _renderStandaloneResume(wrap);
      } else {
        _renderCodeEntry(wrap);
      }
    } else {
      _renderApplicantForm(wrap);
    }
  }

  /* ── STANDALONE: 새로 작성하기 ── */
  function _renderStandaloneNew(wrap) {
    var box = el('div', 'hr-auth-box');
    box.innerHTML =
      '<div class="hr-auth-icon">✍️</div>' +
      '<div class="hr-auth-title">새로 작성하기</div>' +
      '<div class="hr-auth-desc">성명을 입력하면 바로 서류 작성이 시작됩니다.<br>' +
      '<span style="font-size:11px;color:#6B7280">작성 중에 <strong>💾 중간 저장</strong> 버튼을 누르면<br>저장 코드가 발급되어 나중에 이어쓸 수 있습니다.</span></div>' +
      '<input class="hr-auth-input" id="hr-sa-name" type="text" placeholder="성명 (실명)" autocomplete="off">' +
      '<div class="hr-auth-err" id="hr-sa-err"></div>' +
      '<button class="hr-btn hr-btn-primary" id="hr-sa-btn" style="width:100%;margin-bottom:10px">작성 시작 →</button>' +
      '<button class="hr-btn hr-btn-ghost" id="hr-sa-back" style="width:100%">← 돌아가기</button>';
    wrap.appendChild(box);

    var nameInp = document.getElementById('hr-sa-name');
    nameInp.focus();
    nameInp.addEventListener('keydown', function(e) { if (e.key==='Enter') document.getElementById('hr-sa-btn').click(); });

    document.getElementById('hr-sa-btn').addEventListener('click', function() {
      var name = document.getElementById('hr-sa-name').value.trim();
      var err  = document.getElementById('hr-sa-err');
      if (!name) { err.textContent = '성명을 입력해 주세요.'; return; }
      var app = blankApp();
      app.form1.nameKr = name;
      var apps = loadApps(); apps.push(app); saveApps(apps);
      _st.applicant = app; _st.appStep = 0;
      _render();
    });
    document.getElementById('hr-sa-back').addEventListener('click', function() {
      _st.view = 'home'; _st._portalMode = null; _render();
    });
  }

  /* ── STANDALONE: 이어서 작성하기 ── */
  function _renderStandaloneResume(wrap) {
    var box = el('div', 'hr-auth-box');
    box.innerHTML =
      '<div class="hr-auth-icon">🔄</div>' +
      '<div class="hr-auth-title">이어서 작성하기</div>' +
      '<div class="hr-auth-desc">중간 저장 시 발급된 <strong>저장 코드</strong>와<br>본인 <strong>이름</strong>을 입력하세요.</div>' +
      '<input class="hr-auth-input" id="hr-sr-code" maxlength="8" placeholder="XXXXXX" autocomplete="off" style="text-transform:uppercase;letter-spacing:4px;font-size:18px;text-align:center">' +
      '<input class="hr-auth-input" id="hr-sr-name" type="text" placeholder="성명" autocomplete="off" style="margin-top:8px">' +
      '<div class="hr-auth-err" id="hr-sr-err"></div>' +
      '<button class="hr-btn hr-btn-primary" id="hr-sr-btn" style="width:100%;margin-bottom:10px">이어서 작성하기</button>' +
      '<button class="hr-btn hr-btn-ghost" id="hr-sr-back" style="width:100%">← 돌아가기</button>';
    wrap.appendChild(box);

    document.getElementById('hr-sr-code').addEventListener('input', function() {
      this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });

    var doResume = function() {
      var code = document.getElementById('hr-sr-code').value.trim().toUpperCase();
      var name = document.getElementById('hr-sr-name').value.trim();
      var err  = document.getElementById('hr-sr-err');
      err.textContent = '';
      if (!code || code.length < 6) { err.textContent = '저장 코드 6자리를 입력해 주세요.'; return; }
      if (!name) { err.textContent = '성명을 입력해 주세요.'; return; }
      var apps = loadApps();
      var app  = apps.find(function(a) {
        return a.resumeCode === code && (a.form1.nameKr || '').trim() === name;
      });
      if (!app) { err.textContent = '저장 코드 또는 이름이 일치하지 않습니다.'; return; }
      if (app.status === 'submitted' || app.status === 'approved') {
        err.textContent = '이미 최종 제출된 서류입니다.'; return;
      }
      _st.applicant = app; _st.appStep = 0;
      _render();
    };
    document.getElementById('hr-sr-btn').addEventListener('click', doResume);
    document.getElementById('hr-sr-name').addEventListener('keydown', function(e) { if (e.key==='Enter') doResume(); });
    document.getElementById('hr-sr-back').addEventListener('click', function() {
      _st.view = 'home'; _st._portalMode = null; _render();
    });
  }

  /* ── 중간 저장 (공통) ── */
  function _hrMidSave() {
    var app = _st.applicant;
    if (!app) return;
    if (!app.resumeCode) {
      var existing = loadApps().map(function(a){ return a.resumeCode; });
      var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      var c;
      do {
        c = '';
        for (var i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
      } while (existing.indexOf(c) > -1);
      app.resumeCode = c;
    }
    app.status = 'pending';
    var apps = loadApps();
    var idx = apps.findIndex(function(a){ return a.id === app.id; });
    if (idx > -1) apps[idx] = app; else apps.push(app);
    saveApps(apps);
    _hrShowSaveOverlay(app);
  }

  function _hrShowSaveOverlay(app) {
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
        '<div style="font-size:30px;font-weight:900;letter-spacing:8px;color:#1A73E8;font-family:monospace">' + _esc(app.resumeCode) + '</div>' +
        '<div style="font-size:12px;color:#374151;margin-top:8px">이름: <strong>' + _esc(app.form1.nameKr) + '</strong></div>' +
      '</div>' +
      '<button id="hr-ov-copy" style="display:block;width:100%;padding:10px;background:#1a3a5c;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px">📋 코드 복사</button>' +
      '<button id="hr-ov-close" style="display:block;width:100%;padding:10px;background:#F3F4F6;color:#374151;border:none;border-radius:8px;font-size:14px;cursor:pointer">계속 작성하기</button>';
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    box.querySelector('#hr-ov-copy').addEventListener('click', function() {
      var msg = '[입사 서류 저장 코드]\n저장 코드: ' + app.resumeCode + '\n이름: ' + app.form1.nameKr + '\n\n이 코드와 이름으로 동일한 링크에서 이어서 작성할 수 있습니다.';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(msg).then(function(){ toast('복사되었습니다.', '#16A34A'); });
      } else { prompt('아래 내용을 복사하세요.', msg); }
    });
    box.querySelector('#hr-ov-close').addEventListener('click', function() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    });
  }

  function _renderCodeEntry(wrap) {
    // PIN 설정/입력 화면 분기
    if (_st._pendingCode && _st._pendingMode === 'new') {
      _renderPinSetup(wrap);
      return;
    }
    if (_st._pendingCode && _st._pendingMode === 'edit') {
      _renderPinEntry(wrap);
      return;
    }

    var box = el('div', 'hr-auth-box');
    box.innerHTML =
      '<div class="hr-auth-icon">📋</div>' +
      '<div class="hr-auth-title">입사 예정자 서류 제출</div>' +
      '<div class="hr-auth-desc">인사담당자로부터 발급받은<br><strong>접수 코드 6자리</strong>를 입력하세요.</div>' +
      '<input class="hr-auth-input" id="hr-code-inp" maxlength="6" placeholder="접수코드" autocomplete="off">' +
      '<div class="hr-auth-err" id="hr-code-err"></div>' +
      '<button class="hr-btn hr-btn-primary" id="hr-code-btn" style="width:100%;margin-bottom:10px">입력하기</button>' +
      '<button class="hr-btn hr-btn-ghost" id="hr-code-back" style="width:100%;margin-bottom:16px">← 돌아가기</button>' +
      '<div style="border-top:1px solid #E5E7EB;padding-top:16px;text-align:center">' +
        '<div style="font-size:12px;color:#6B7280;margin-bottom:10px">접수 코드가 없으신가요? 아래에서 작성 화면을 미리 체험해보세요.</div>' +
        '<button class="hr-btn hr-btn-demo" id="hr-demo-btn" style="width:100%">✨ 입사 예정자 작성 체험해보기</button>' +
      '</div>';

    wrap.appendChild(box);

    document.getElementById('hr-code-btn').addEventListener('click', _submitCode);
    document.getElementById('hr-code-inp').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') _submitCode();
    });
    document.getElementById('hr-code-back').addEventListener('click', function() {
      _st.view = 'home'; _render();
    });
    document.getElementById('hr-demo-btn').addEventListener('click', _startDemo);
  }

  function _renderPinSetup(wrap) {
    var box = el('div', 'hr-auth-box');
    box.innerHTML =
      '<div class="hr-auth-icon">🔐</div>' +
      '<div class="hr-auth-title">비밀번호 설정</div>' +
      '<div class="hr-auth-desc">중간 수정 시 사용할<br><strong>비밀번호(4~8자리)</strong>를 설정하세요.</div>' +
      '<input class="hr-auth-input" id="hr-pin-inp" type="password" maxlength="8" placeholder="비밀번호 (숫자 권장)">' +
      '<input class="hr-auth-input" id="hr-pin-conf" type="password" maxlength="8" placeholder="비밀번호 확인" style="margin-top:8px">' +
      '<div class="hr-auth-err" id="hr-pin-err"></div>' +
      '<button class="hr-btn hr-btn-primary" id="hr-pin-btn" style="width:100%;margin-bottom:10px">설정 완료 → 서류 작성 시작</button>' +
      '<button class="hr-btn hr-btn-ghost" id="hr-pin-back" style="width:100%">← 코드 다시 입력</button>';
    wrap.appendChild(box);

    document.getElementById('hr-pin-btn').addEventListener('click', function() {
      var pin  = document.getElementById('hr-pin-inp').value.trim();
      var pinC = document.getElementById('hr-pin-conf').value.trim();
      var err  = document.getElementById('hr-pin-err');
      if (!pin || pin.length < 4) { err.textContent = '비밀번호는 4자리 이상 입력해 주세요.'; return; }
      if (pin !== pinC) { err.textContent = '비밀번호가 일치하지 않습니다.'; return; }

      var code    = _st._pendingCode;
      var codes   = loadCodes();
      var codeObj = codes.find(function(c){ return c.code === code; });
      var apps    = loadApps();
      var newApp  = blankApp(code);
      newApp.pin  = pin;
      if (codeObj) { newApp.form1.nameKr = codeObj.name || ''; }
      apps.push(newApp);
      saveApps(apps);
      _st.applicant    = newApp;
      _st.appStep      = 0;
      _st._pendingCode = null;
      _st._pendingMode = null;
      _render();
    });
    document.getElementById('hr-pin-back').addEventListener('click', function() {
      _st._pendingCode = null; _st._pendingMode = null; _render();
    });
  }

  function _renderPinEntry(wrap) {
    var box = el('div', 'hr-auth-box');
    box.innerHTML =
      '<div class="hr-auth-icon">🔐</div>' +
      '<div class="hr-auth-title">비밀번호 입력</div>' +
      '<div class="hr-auth-desc">이전에 설정한<br><strong>비밀번호</strong>를 입력하세요.</div>' +
      '<input class="hr-auth-input" id="hr-pin-inp" type="password" maxlength="8" placeholder="비밀번호">' +
      '<div class="hr-auth-err" id="hr-pin-err"></div>' +
      '<button class="hr-btn hr-btn-primary" id="hr-pin-btn" style="width:100%;margin-bottom:10px">확인</button>' +
      '<button class="hr-btn hr-btn-ghost" id="hr-pin-back" style="width:100%">← 코드 다시 입력</button>';
    wrap.appendChild(box);

    document.getElementById('hr-pin-btn').addEventListener('click', function() {
      var pin  = document.getElementById('hr-pin-inp').value.trim();
      var err  = document.getElementById('hr-pin-err');
      var code = _st._pendingCode;
      var apps = loadApps();
      var app  = apps.find(function(a){ return a.code === code; });
      if (!app || app.pin !== pin) { err.textContent = '비밀번호가 올바르지 않습니다.'; return; }
      _st.applicant    = app;
      _st.appStep      = 0;
      _st._pendingCode = null;
      _st._pendingMode = null;
      _render();
    });
    document.getElementById('hr-pin-inp').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') document.getElementById('hr-pin-btn').click();
    });
    document.getElementById('hr-pin-back').addEventListener('click', function() {
      _st._pendingCode = null; _st._pendingMode = null; _render();
    });
  }

  function _startDemo() {
    // 기존 체험 데이터 제거 후 새로 생성
    var apps = loadApps();
    apps = apps.filter(function(a) { return a.code !== 'DEMO'; });
    var demoApp = blankApp('DEMO');
    demoApp.isDemo = true;
    demoApp.form1.nameKr = '홍길동 (체험)';
    apps.push(demoApp);
    saveApps(apps);
    _st.applicant = demoApp;
    _st.appStep = 0;
    _st.isDemo = true;
    _render();
  }

  function _submitCode() {
    var inp  = document.getElementById('hr-code-inp');
    var err  = document.getElementById('hr-code-err');
    var code = (inp ? inp.value.trim().toUpperCase() : '');
    if (!code || code.length < 4) { err.textContent = '접수 코드를 입력해주세요.'; return; }

    var codes   = loadCodes();
    var codeObj = codes.find(function(c) { return c.code === code && c.active; });
    if (!codeObj) { err.textContent = '유효하지 않은 접수 코드입니다.'; return; }

    var apps     = loadApps();
    var existing = apps.find(function(a) { return a.code === code; });

    if (existing && existing.pin) {
      // 재방문: PIN 입력 화면으로
      _st._pendingCode = code;
      _st._pendingMode = 'edit';
      _render();
    } else if (existing && !existing.pin) {
      // 구버전 앱 (pin 없음): 그냥 로드
      _st.applicant = existing; _st.appStep = 0; _render();
    } else {
      // 최초: PIN 설정 화면
      _st._pendingCode = code;
      _st._pendingMode = 'new';
      _render();
    }
  }

  /* ── 지원자 폼 ── */
  var STEPS = ['채용지원서', '개인정보 동의서', '서류 업로드', '퇴직연금 서류', '제출 완료'];

  function _renderApplicantForm(wrap) {
    var app = _st.applicant;

    // 체험 모드 배너
    if (_st.isDemo) {
      var demoBanner = el('div', 'hr-demo-banner');
      demoBanner.innerHTML =
        '<span style="font-size:16px">✨</span>' +
        '<span style="font-weight:700;margin:0 6px">체험 모드</span>' +
        '<span style="font-size:12px">실제 데이터는 저장되지 않습니다 — 각 단계를 자유롭게 작성하고 미리보기를 확인하세요.</span>';
      wrap.appendChild(demoBanner);
    }

    // 상단: 이름 + 단계 + 나가기
    var header = el('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:8px';
    var title = el('div');
    title.style.cssText = 'font-size:14px;font-weight:700;color:#1a3a5c';
    title.textContent = _st.isDemo ? '입사 예정자 작성 체험' : (app.form1.nameKr || '지원자') + '님의 서류 제출';
    var backBtn = el('button', 'hr-btn hr-btn-ghost hr-btn-sm', _st.isDemo ? '✕ 체험 종료' : '← 로그아웃');
    backBtn.addEventListener('click', function() {
      _st.applicant = null; _st.appStep = 0; _st.isDemo = false; _render();
    });
    header.appendChild(title);
    header.appendChild(backBtn);
    wrap.appendChild(header);

    // 단계 표시
    wrap.appendChild(_buildSteps());

    // 완료 상태
    if (app.status === 'submitted' || app.status === 'approved') {
      _renderDoneScreen(wrap, app);
      return;
    }

    // 단계별 폼
    if (_st.appStep === 0) _renderStep1(wrap, app);
    else if (_st.appStep === 1) _renderStep2(wrap, app);
    else if (_st.appStep === 2) _renderStep3(wrap, app);
    else if (_st.appStep === 3) _renderStep4(wrap, app);
    else if (_st.appStep === 4) _renderStep5Submit(wrap, app);
  }

  function _buildSteps() {
    var row = el('div', 'hr-steps');
    STEPS.forEach(function(s, i) {
      var step = el('div', 'hr-step' +
        (i < _st.appStep ? ' done' : i === _st.appStep ? ' active' : ''));
      var dot = el('div', 'hr-step-dot',
        i < _st.appStep ? '✓' : String(i + 1));
      var label = el('div', 'hr-step-label', s);
      step.appendChild(dot);
      step.appendChild(label);
      row.appendChild(step);
      if (i < STEPS.length - 1) {
        var line = el('div', 'hr-step-line');
        row.appendChild(line);
      }
    });
    return row;
  }

  function _renderDoneScreen(wrap, app) {
    var d = el('div', 'hr-done-screen');
    d.innerHTML =
      '<div class="hr-done-icon">✅</div>' +
      '<div class="hr-done-title">서류 제출이 완료되었습니다</div>' +
      '<div class="hr-done-desc">' + fmtDate(app.submittedAt) + ' 제출<br>' +
      '인사담당자의 검토 후 연락드리겠습니다.</div>';

    if (app.status === 'approved') {
      d.innerHTML += '<div style="margin-top:8px;font-size:13px;color:#7E22CE;font-weight:700">✨ 검토 완료 — 승인되었습니다</div>';
    }
    wrap.appendChild(d);
  }

  /* ════════════ STEP 1: 채용지원서 ════════════ */
  function _renderStep1(wrap, app) {
    var f = app.form1;

    var card = el('div', 'hr-card');
    var head = el('div', 'hr-card-head');
    head.innerHTML = '<div class="hr-card-title">① 교직원 채용(임용) 지원서</div>';
    card.appendChild(head);

    var body = el('div', 'hr-card-body');
    var form = el('div', 'hr-app-form');

    // 사진 + 직군 + 부서
    var topRow = el('div', 'hr-photo-row');

    // 사진 업로드
    var photoWrap = el('div', 'hr-photo-box');
    photoWrap.id = 'hr-photo-box';
    if (f.photoB64) {
      photoWrap.innerHTML = '<img src="' + f.photoB64 + '" alt="증명사진">';
    } else {
      photoWrap.innerHTML = '<div style="font-size:24px">📷</div><div class="hr-photo-hint">증명사진<br>클릭하여 업로드</div>';
    }
    var photoInp = document.createElement('input');
    photoInp.type = 'file'; photoInp.accept = 'image/*'; photoInp.style.display = 'none';
    photoInp.id = 'hr-photo-inp';
    photoInp.addEventListener('change', function() {
      var file = this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        f.photoB64 = e.target.result;
        var box = document.getElementById('hr-photo-box');
        if (box) box.innerHTML = '<img src="' + f.photoB64 + '" alt="증명사진" style="width:100%;height:100%;object-fit:cover">';
        _saveApplicant(app);
      };
      reader.readAsDataURL(file);
    });
    photoWrap.appendChild(photoInp);
    photoWrap.addEventListener('click', function() { photoInp.click(); });
    topRow.appendChild(photoWrap);

    // 직군 + 부서 박스
    var rightBox = el('div'); rightBox.style.flex = '1';

    // 직군 구분
    var sec1 = el('div', 'hr-form-section');
    sec1.innerHTML = '<div class="hr-section-title">1. 직군 구분</div>';
    var cbRow1 = el('div', 'hr-cb-row');
    ['교무직','행정직'].forEach(function(v) {
      var lbl = el('label', 'hr-cb-item');
      var inp = document.createElement('input'); inp.type = 'radio'; inp.name = 'hr-jg'; inp.value = v;
      if (f.jobGroup === v) inp.checked = true;
      inp.addEventListener('change', function() { f.jobGroup = v; _saveApplicant(app); });
      lbl.appendChild(inp); lbl.appendChild(document.createTextNode(v));
      cbRow1.appendChild(lbl);
    });
    var otherLbl = el('label', 'hr-cb-item');
    var otherInp = document.createElement('input'); otherInp.type = 'radio'; otherInp.name = 'hr-jg'; otherInp.value = '기타';
    if (f.jobGroup && !['교무직','행정직'].includes(f.jobGroup)) otherInp.checked = true;
    otherInp.addEventListener('change', function() { f.jobGroup = document.getElementById('hr-jg-other').value || '기타'; _saveApplicant(app); });
    otherLbl.appendChild(otherInp); otherLbl.appendChild(document.createTextNode('기타:'));
    var otherText = document.createElement('input'); otherText.type = 'text'; otherText.id = 'hr-jg-other';
    otherText.style.cssText = 'width:80px;margin-left:4px;padding:2px 6px;border:1px solid #D1D5DB;border-radius:4px;font-size:12px';
    otherText.value = (f.jobGroup && !['교무직','행정직'].includes(f.jobGroup)) ? f.jobGroup : '';
    otherText.addEventListener('input', function() { f.jobGroup = this.value; _saveApplicant(app); });
    otherLbl.appendChild(otherText);
    cbRow1.appendChild(otherLbl);
    sec1.appendChild(cbRow1);
    rightBox.appendChild(sec1);

    // 근무 예정 부서
    var sec2 = el('div', 'hr-form-section');
    sec2.innerHTML = '<div class="hr-section-title">2. 근무 예정 부서</div>';
    var depts1 = ['기획처','교육지원처','행정관리처','입학처'];
    var depts2 = ['항공정비계열','스마트안전진단계열','항공관광계열','항공보안계열','국방경찰계열'];
    var depts3 = ['기종교육원','무인항공교육원','비행교육원'];
    var cbRow2 = el('div', 'hr-cb-row');
    cbRow2.style.flexDirection = 'column'; cbRow2.style.gap = '4px';

    var allDeptGroups = [depts1, depts2, depts3];
    allDeptGroups.forEach(function(group) {
      var r = el('div', 'hr-cb-row');
      group.forEach(function(d) {
        var lbl = el('label', 'hr-cb-item');
        var inp = document.createElement('input'); inp.type = 'checkbox'; inp.value = d;
        if ((f.deptCheckboxes || []).includes(d)) inp.checked = true;
        inp.addEventListener('change', function() {
          if (!f.deptCheckboxes) f.deptCheckboxes = [];
          if (this.checked) { if (!f.deptCheckboxes.includes(d)) f.deptCheckboxes.push(d); }
          else f.deptCheckboxes = f.deptCheckboxes.filter(function(x){ return x !== d; });
          _saveApplicant(app);
        });
        lbl.appendChild(inp); lbl.appendChild(document.createTextNode(d));
        r.appendChild(lbl);
      });
      cbRow2.appendChild(r);
    });
    // 미정 체크박스
    var rMijeong = el('div', 'hr-cb-row');
    var lblMj = el('label', 'hr-cb-item'); lblMj.style.cssText = 'color:#D97706;font-weight:600';
    var inpMj = document.createElement('input'); inpMj.type = 'checkbox'; inpMj.value = '미정';
    if ((f.deptCheckboxes || []).includes('미정')) inpMj.checked = true;
    inpMj.addEventListener('change', function() {
      if (!f.deptCheckboxes) f.deptCheckboxes = [];
      if (this.checked) { if (!f.deptCheckboxes.includes('미정')) f.deptCheckboxes.push('미정'); }
      else f.deptCheckboxes = f.deptCheckboxes.filter(function(x){ return x !== '미정'; });
      _saveApplicant(app);
    });
    lblMj.appendChild(inpMj); lblMj.appendChild(document.createTextNode('미정'));
    rMijeong.appendChild(lblMj);
    cbRow2.appendChild(rMijeong);
    sec2.appendChild(cbRow2);
    rightBox.appendChild(sec2);

    topRow.appendChild(rightBox);
    form.appendChild(topRow);

    // ── 인적사항 ──
    form.appendChild(_sectionTitle('1. 인적사항'));
    form.appendChild(_row([
      _field('성명(한글)', 'text', f.nameKr, function(v){ f.nameKr=v; _saveApplicant(app); }, 'flex2'),
      _field('성명(한자)', 'text', f.nameHj, function(v){ f.nameHj=v; _saveApplicant(app); }, 'flex2'),
      _field('성별', 'select', f.gender, function(v){ f.gender=v; _saveApplicant(app); }, 'w80', ['','남','여']),
      _field('생년월일', 'date', f.birth, function(v){ f.birth=v; _saveApplicant(app); }, 'w140', null, ''),
    ]));
    form.appendChild(_row([
      _field('주소', 'text', f.address, function(v){ f.address=v; _saveApplicant(app); }, 'flex3'),
    ]));
    form.appendChild(_row([
      _field('휴대폰', 'text', f.mobile, function(v){ f.mobile=v; _saveApplicant(app); }, 'flex1'),
      _field('이메일', 'text', f.email, function(v){ f.email=v; _saveApplicant(app); }, 'flex2'),
    ]));
    form.appendChild(_row([
      _field('결혼유무', 'select', f.married, function(v){ f.married=v; _saveApplicant(app); }, 'w80', ['','유','무']),
      _field('호주와의관계', 'text', f.familyHead, function(v){ f.familyHead=v; _saveApplicant(app); }, 'w100'),
      _field('병역관계', 'select', f.military, function(v){ f.military=v; _saveApplicant(app); }, 'w80', ['','필','미필','군필']),
      _field('군종', 'text', f.milBranch, function(v){ f.milBranch=v; _saveApplicant(app); }, 'w80'),
      _field('계급', 'text', f.milRank, function(v){ f.milRank=v; _saveApplicant(app); }, 'w80'),
    ]));

    // ── 학력사항 ──
    form.appendChild(_sectionTitle('2. 학력사항'));
    var eduTable = _buildTable(
      ['구분','기간(시작)','기간(종료)','국가명','학교명','학과(전공)','학위명','평점평균'],
      f.education.map(function(e, i) {
        return [
          _tdFixed(e.type),
          _tdMonthInput(e.from, function(v){ f.education[i].from=v; _saveApplicant(app); }, 90),
          _tdMonthInput(e.to,   function(v){ f.education[i].to=v;   _saveApplicant(app); }, 90),
          _tdInput(e.country, function(v){ f.education[i].country=v; _saveApplicant(app); }, '', 60),
          _tdInput(e.school,  function(v){ f.education[i].school=v;  _saveApplicant(app); }, '', 140),
          _tdInput(e.major,   function(v){ f.education[i].major=v;   _saveApplicant(app); }, '', 100),
          _tdInput(e.degree,  function(v){ f.education[i].degree=v;  _saveApplicant(app); }, '', 80),
          _tdInput(e.gpa,     function(v){ f.education[i].gpa=v;     _saveApplicant(app); }, '', 60),
        ];
      })
    );
    form.appendChild(eduTable);

    // ── 가족사항 ──
    form.appendChild(_sectionTitle('3. 가족사항'));
    var famTable = _buildTable(
      ['관계','성명','생년월일','직업','나이(만)'],
      f.family.map(function(fm, i) {
        return [
          _tdInput(fm.rel,   function(v){ f.family[i].rel=v;   _saveApplicant(app); }, '', 60),
          _tdInput(fm.name,  function(v){ f.family[i].name=v;  _saveApplicant(app); }, '', 80),
          _tdDateInput(fm.birth, function(v){ f.family[i].birth=v; _saveApplicant(app); }, 110),
          _tdInput(fm.job,   function(v){ f.family[i].job=v;   _saveApplicant(app); }, '', 80),
          _tdInput(fm.age,   function(v){ f.family[i].age=v;   _saveApplicant(app); }, '', 50),
        ];
      })
    );
    form.appendChild(famTable);
    // 가족 행 추가
    var addFamBtn = el('button', 'hr-btn hr-btn-ghost hr-btn-sm', '+ 행 추가');
    addFamBtn.style.marginBottom = '8px';
    addFamBtn.addEventListener('click', function() {
      f.family.push({rel:'',name:'',birth:'',job:'',age:''});
      _saveApplicant(app); _render();
    });
    form.appendChild(addFamBtn);

    // ── 경력사항 ──
    form.appendChild(_sectionTitle('4. 경력사항 (교육경력 포함) ※ 경력 또는 재직증명서 첨부 가능 내용만 기재'));
    var carTable = _buildTable(
      ['기간(시작)','기간(종료)','근무년월(자동)','근무기관','최종직위','담당업무(담당과목)','주당담당시간수'],
      f.career.map(function(c, i) {
        return [
          _tdMonthInput(c.from,   function(v){ f.career[i].from=v; f.career[i].months=_calcMonths(v, f.career[i].to); _saveApplicant(app); _render(); }, 100),
          _tdMonthInput(c.to,     function(v){ f.career[i].to=v;   f.career[i].months=_calcMonths(f.career[i].from, v); _saveApplicant(app); _render(); }, 100),
          _tdInput(c.months, function(v){ f.career[i].months=v; _saveApplicant(app); }, '', 80),
          _tdInput(c.org,    function(v){ f.career[i].org=v;    _saveApplicant(app); }, '', 110),
          _tdInput(c.rank,   function(v){ f.career[i].rank=v;   _saveApplicant(app); }, '', 80),
          _tdInput(c.duties, function(v){ f.career[i].duties=v; _saveApplicant(app); }, '', 140),
          _tdInput(c.hours,  function(v){ f.career[i].hours=v;  _saveApplicant(app); }, '', 70),
        ];
      })
    );
    form.appendChild(carTable);

    // ── 자격취득사항 ──
    form.appendChild(_sectionTitle('5. 자격취득사항 (상위 3개) / 전공분야 수상내역'));
    var cr = el('div'); cr.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px';

    var certTable = _buildTable(['취득일자','종류','발행기관'],
      f.certs.map(function(c, i) {
        return [
          _tdMonthInput(c.date, function(v){ f.certs[i].date=v; _saveApplicant(app); }, 110),
          _tdInput(c.type,   function(v){ f.certs[i].type=v;   _saveApplicant(app); }, '', 120),
          _tdInput(c.issuer, function(v){ f.certs[i].issuer=v; _saveApplicant(app); }, '', 100),
        ];
      })
    );
    var awardTable = _buildTable(['수상일','종류','수여기관'],
      f.awards.map(function(a, i) {
        return [
          _tdMonthInput(a.date, function(v){ f.awards[i].date=v; _saveApplicant(app); }, 110),
          _tdInput(a.type, function(v){ f.awards[i].type=v; _saveApplicant(app); }, '', 120),
          _tdInput(a.org,  function(v){ f.awards[i].org=v;  _saveApplicant(app); }, '', 100),
        ];
      })
    );
    cr.appendChild(certTable); cr.appendChild(awardTable);
    form.appendChild(cr);

    // ── 외국어/전산/AI툴 ──
    form.appendChild(_sectionTitle('6. 외국어, 전산 및 AI툴 활용 능력'));
    form.appendChild(_row([
      _field('토익', 'text', f.langToeic, function(v){ f.langToeic=v; _saveApplicant(app); }, 'w80'),
      _field('텝스', 'text', f.langTeps,  function(v){ f.langTeps=v;  _saveApplicant(app); }, 'w80'),
      _field('기타 어학점수', 'text', f.langOther, function(v){ f.langOther=v; _saveApplicant(app); }, 'w100'),
      _field('전산가능분야 수준', 'select', f.pcLevel, function(v){ f.pcLevel=v; _saveApplicant(app); }, 'w100', ['','상','중','하']),
    ]));

    var aiTable = _buildTable(
      ['활용 AI툴 (모델명)','활용 목적 및 실제 사용 사례','숙련도'],
      f.aiTools.map(function(ai, i) {
        return [
          _tdInput(ai.tool,    function(v){ f.aiTools[i].tool=v;    _saveApplicant(app); }, 'ChatGPT, Claude 등', 140),
          _tdInput(ai.purpose, function(v){ f.aiTools[i].purpose=v; _saveApplicant(app); }, '프롬프트 설계를 통한 업무 자동화 등', 240),
          _tdInput(ai.level,   function(v){ f.aiTools[i].level=v;   _saveApplicant(app); }, '상/중/하', 60),
        ];
      })
    );
    form.appendChild(aiTable);
    var addAiBtn = el('button', 'hr-btn hr-btn-ghost hr-btn-sm', '+ AI툴 행 추가');
    addAiBtn.style.marginBottom = '8px';
    addAiBtn.addEventListener('click', function() {
      f.aiTools.push({tool:'',purpose:'',level:''});
      _saveApplicant(app); _render();
    });
    form.appendChild(addAiBtn);

    // ── 학위논문 ──
    form.appendChild(_sectionTitle('7. 학위논문'));
    var thTable = _buildTable(['구분','제목','발표년월일','취득학교','내용 요지'],
      f.thesis.map(function(t, i) {
        return [
          _tdFixed(t.type),
          _tdInput(t.title,  function(v){ f.thesis[i].title=v;  _saveApplicant(app); }, '', 160),
          _tdDateInput(t.date, function(v){ f.thesis[i].date=v; _saveApplicant(app); }, 120),
          _tdInput(t.school, function(v){ f.thesis[i].school=v; _saveApplicant(app); }, '', 100),
          _tdInput(t.summary,function(v){ f.thesis[i].summary=v;_saveApplicant(app); }, '', 160),
        ];
      })
    );
    form.appendChild(thTable);

    // ── 서명 ──
    form.appendChild(_sectionTitle('서명'));
    var notice = el('div');
    notice.style.cssText = 'font-size:11px;color:#6B7280;margin-bottom:10px;line-height:1.6';
    notice.textContent = '위 기재한 사항은 모두 사실이며, 허위 기재 또는 중요 사항 누락 시 채용 취소·임용 해지 등 학교의 인사 조치에 이의가 없음을 확인합니다.';
    form.appendChild(notice);

    var sigRow = el('div'); sigRow.style.cssText = 'display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start';
    var dateField = _field('작성일', 'date', f.signDate, function(v){ f.signDate=v; _saveApplicant(app); }, 'w160', null, '');
    sigRow.appendChild(dateField);
    sigRow.appendChild(_buildSigPad('hr-sig-app', f.signB64, function(b64) { f.signB64=b64; _saveApplicant(app); }));
    form.appendChild(sigRow);

    body.appendChild(form);
    card.appendChild(body);
    wrap.appendChild(card);

    // 채용지원서 미리보기 버튼
    var pvBtn1 = el('button', 'hr-btn hr-btn-primary', '👁️ 채용지원서 미리보기');
    pvBtn1.style.cssText = 'margin-bottom:10px;width:100%';
    pvBtn1.addEventListener('click', function() { _printApplicationForm(app); });
    wrap.appendChild(pvBtn1);

    // 하단 버튼
    wrap.appendChild(_buildNavButtons(null, function() {
      _st.appStep = 1; _render();
    }, '다음: 개인정보 동의서 →'));
  }

  /* ════════════ STEP 2: 개인정보 동의서 ════════════ */
  function _renderStep2(wrap, app) {
    var f = app.form2;
    var card = el('div', 'hr-card');
    var head = el('div', 'hr-card-head');
    head.innerHTML = '<div class="hr-card-title">② 개인정보 수집·활용 동의서</div>';
    card.appendChild(head);
    var body = el('div', 'hr-card-body');

    // 개인정보 내용 박스
    var infoBox = el('div');
    infoBox.style.cssText = 'background:#F8FAFF;border:1px solid #D0E4F5;border-radius:8px;padding:16px;font-size:12px;line-height:1.8;margin-bottom:16px;color:#374151';
    infoBox.innerHTML =
      '<strong style="color:#1a3a5c;font-size:13px">[ 개인정보 수집·이용에 대한 동의 ]</strong><br><br>' +
      '<strong>수집 항목:</strong> 개인식별정보(성명, 생년월일, 사진, 주소, 핸드폰번호, 전화번호, E-mail주소), 자격사항, 근무경력사항, 자기소개 등<br>' +
      '<strong>이용 목적:</strong> 서류심사 등 위촉절차 집행·관리, 경력·자격 확인, 위촉여부 결정, 민원처리<br>' +
      '<strong>보유 기간:</strong> 응모원서 제출 후 준영구 또는 삭제 요청 시까지<br><br>' +
      '※ 동의를 거부할 수 있으며, 동의가 없을 경우 채용전형 진행이 불가능합니다.<br><br>' +
      '<strong>[ 고유식별정보 처리에 대한 동의 ]</strong><br>' +
      '<strong>수집 항목:</strong> 주민(사업자)등록번호<br>' +
      '<strong>이용 목적:</strong> 응모에 따른 서류심사 및 위촉<br>' +
      '<strong>보유 기간:</strong> 응모원서 제출 후 준영구 또는 지원서 삭제 신청 시까지<br><br>' +
      '<strong style="color:#1a3a5c;font-size:13px">[ 홍보 목적 초상권·영상·음성 이용에 대한 동의 ]</strong><br><br>' +
      '<strong>수집 항목:</strong> 재직 기간 중 교내·외에서 촬영된 사진, 동영상, 인터뷰 내용 및 음성<br>' +
      '<strong>이용 목적:</strong> 학교 홍보물(리플렛, 홈페이지, SNS, 홍보영상, 입시 홍보물 등) 및 기관 평가 자료 등 공식 홍보 목적에 한정<br>' +
      '<strong>보유 기간:</strong> 재직 기간 및 퇴직 후 3년까지 (이후 요청 시 파기)<br>' +
      '<strong>법적 근거:</strong> 「개인정보 보호법」 제15조 제1항 제1호(정보주체의 동의), 민법상 초상권·성명권 관련 판례<br><br>' +
      '※ 본 동의는 거부할 수 있으며, 거부 시 채용 결정에 불이익이 없습니다.<br>' +
      '※ 이미 제작·배포된 홍보물의 경우, 동의 철회 시 이후 사용은 중단하되 기배포본의 전량 회수는 불가할 수 있습니다.';
    body.appendChild(infoBox);

    // 동의 체크박스
    var cbSection = el('div');
    cbSection.style.cssText = 'margin-bottom:18px;display:flex;flex-direction:column;gap:10px';

    var lbl1 = el('label', 'hr-cb-item');
    lbl1.style.cssText = 'font-size:13px;font-weight:600;color:#1a3a5c';
    var cb1 = document.createElement('input'); cb1.type = 'checkbox'; cb1.id = 'hr-agree-info';
    if (f.agreeInfo) cb1.checked = true;
    cb1.addEventListener('change', function() { f.agreeInfo = this.checked; _saveApplicant(app); });
    lbl1.appendChild(cb1); lbl1.appendChild(document.createTextNode('개인정보 수집 및 이용에 동의합니다'));
    cbSection.appendChild(lbl1);

    var lbl2 = el('label', 'hr-cb-item');
    lbl2.style.cssText = 'font-size:13px;font-weight:600;color:#1a3a5c';
    var cb2 = document.createElement('input'); cb2.type = 'checkbox'; cb2.id = 'hr-agree-id';
    if (f.agreeId) cb2.checked = true;
    cb2.addEventListener('change', function() { f.agreeId = this.checked; _saveApplicant(app); });
    lbl2.appendChild(cb2); lbl2.appendChild(document.createTextNode('고유식별정보 수집 및 이용에 동의합니다'));
    cbSection.appendChild(lbl2);

    var lbl3 = el('label', 'hr-cb-item');
    lbl3.style.cssText = 'font-size:13px;font-weight:600;color:#1a3a5c';
    var cb3 = document.createElement('input'); cb3.type = 'checkbox'; cb3.id = 'hr-agree-promo';
    if (f.agreePromo) cb3.checked = true;
    cb3.addEventListener('change', function() { f.agreePromo = this.checked; _saveApplicant(app); });
    lbl3.appendChild(cb3); lbl3.appendChild(document.createTextNode('홍보 목적 초상권·영상·음성 수집 및 이용에 동의합니다'));
    cbSection.appendChild(lbl3);

    body.appendChild(cbSection);

    // 서명
    var sigSection = el('div');
    var sigRow = el('div'); sigRow.style.cssText = 'display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start';
    var nameField = _field('이름 확인', 'text', f.nameConfirm, function(v){ f.nameConfirm=v; _saveApplicant(app); }, 'w120', null, '성명 입력');
    var dateField = _field('작성일', 'date', f.signDate, function(v){ f.signDate=v; _saveApplicant(app); }, 'w160', null, '');
    sigRow.appendChild(nameField);
    sigRow.appendChild(dateField);
    sigRow.appendChild(_buildSigPad('hr-sig-privacy', f.signB64, function(b64){ f.signB64=b64; _saveApplicant(app); }));
    sigSection.appendChild(sigRow);
    body.appendChild(sigSection);

    card.appendChild(body);
    wrap.appendChild(card);
    var pvBtn2 = el('button', 'hr-btn hr-btn-primary', '👁️ 개인정보동의서 미리보기');
    pvBtn2.style.cssText = 'margin-bottom:10px;width:100%';
    pvBtn2.addEventListener('click', function() { _printPrivacyForm(app); });
    wrap.appendChild(pvBtn2);

    wrap.appendChild(_buildNavButtons(
      function(){ _st.appStep=0; _render(); },
      function(){
        if (!f.agreeInfo || !f.agreeId || !f.agreePromo) { toast('세 항목 모두 동의가 필요합니다.', '#DC2626'); return; }
        _st.appStep=2; _render();
      }, '다음: 서류 업로드 →'
    ));
  }

  /* ════════════ STEP 3: 서류 업로드 ════════════ */
  function _renderStep3(wrap, app) {
    var files = app.files;
    var card = el('div', 'hr-card');
    var head = el('div', 'hr-card-head');
    head.innerHTML = '<div class="hr-card-title">③ 서류 업로드</div>';
    card.appendChild(head);
    var body = el('div', 'hr-card-body');

    var categories = [
      { key:'career', num:3, title:'경력 및 재직증명서 각 1부', hint:'채용지원서상의 전 경력 — PDF/이미지 형식' },
      { key:'certs',  num:4, title:'분야별 관련 자격증 사본 각 1부', hint:'자격증 스캔 또는 사진 파일' },
      { key:'edu',    num:5, title:'졸업 및 성적증명서 각 1부', hint:'졸업증명서, 성적증명서 각 1부' },
      { key:'reg',    num:6, title:'주민등록등본 및 가족관계증명서 각 1부', hint:'최근 3개월 이내 발급본' },
      { key:'bank',   num:7, title:'급여통장 사본 1부', hint:'통장 사본' },
    ];

    categories.forEach(function(cat) {
      var sec = el('div', 'hr-upload-section');
      var titleDiv = el('div', 'hr-upload-title');
      var numBadge = el('div', 'hr-upload-num', String(cat.num));
      titleDiv.appendChild(numBadge);
      titleDiv.appendChild(document.createTextNode(cat.title));
      sec.appendChild(titleDiv);

      var hint = el('div'); hint.style.cssText = 'font-size:11px;color:#9CA3AF;margin-bottom:8px';
      hint.textContent = cat.hint;
      sec.appendChild(hint);

      // 업로드 존
      var zone = el('div', 'hr-upload-zone');
      zone.innerHTML = '<div class="hr-upload-zone-icon">📄</div><div class="hr-upload-zone-text">클릭하거나 파일을 드래그하여 업로드<br><span style="font-size:11px;color:#9CA3AF">PDF, JPG, PNG 지원</span></div>';
      var fileInp = document.createElement('input');
      fileInp.type = 'file'; fileInp.multiple = true;
      fileInp.accept = '.pdf,.jpg,.jpeg,.png,.gif';
      fileInp.style.display = 'none';
      fileInp.addEventListener('change', function() {
        _handleFileUpload(app, cat.key, this.files, function() { _render(); });
      });
      zone.appendChild(fileInp);
      zone.addEventListener('click', function() { fileInp.click(); });
      zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('dragover'); });
      zone.addEventListener('dragleave', function() { zone.classList.remove('dragover'); });
      zone.addEventListener('drop', function(e) {
        e.preventDefault(); zone.classList.remove('dragover');
        _handleFileUpload(app, cat.key, e.dataTransfer.files, function() { _render(); });
      });
      sec.appendChild(zone);

      // 업로드된 파일 목록
      var uploaded = el('div', 'hr-uploaded-list');
      (files[cat.key] || []).forEach(function(f, fi) {
        var item = el('div', 'hr-uploaded-item ' + (f.type === 'pdf' ? 'pdf-file' : 'img-file'));
        var icon = f.type === 'pdf' ? '📄' : '🖼';
        item.innerHTML =
          '<span style="font-size:16px">' + icon + '</span>' +
          '<span class="hr-uploaded-name" title="' + _esc(f.name) + '">' + _esc(f.name) + '</span>' +
          '<span class="hr-uploaded-size">' + _fmtSize(f.size) + '</span>';
        var delBtn = el('button', 'hr-uploaded-del', '✕');
        delBtn.title = '삭제';
        (function(key, idx) {
          delBtn.addEventListener('click', function() {
            app.files[key].splice(idx, 1);
            _saveApplicant(app); _render();
          });
        })(cat.key, fi);
        item.appendChild(delBtn);
        uploaded.appendChild(item);
      });
      sec.appendChild(uploaded);
      body.appendChild(sec);

      if (cat !== categories[categories.length-1]) {
        var divider = el('hr', 'hr-divider');
        body.appendChild(divider);
      }
    });

    card.appendChild(body);
    wrap.appendChild(card);
    wrap.appendChild(_buildNavButtons(
      function(){ _st.appStep=1; _render(); },
      function(){ _st.appStep=3; _render(); },
      '다음: 퇴직연금 서류 →'
    ));
  }

  function _handleFileUpload(app, key, fileList, done) {
    if (!app.files[key]) app.files[key] = [];
    var MAX_SIZE = 5 * 1024 * 1024; // 5MB
    var arr = Array.from(fileList);
    var idx = 0;
    function next() {
      if (idx >= arr.length) { _saveApplicant(app); done(); return; }
      var file = arr[idx++];
      if (file.size > MAX_SIZE) {
        toast(file.name + ' 파일이 5MB를 초과합니다.', '#DC2626');
        next(); return;
      }
      var reader = new FileReader();
      reader.onload = function(e) {
        var nameBase = app.form1.nameKr || app.applicant || '지원자';
        var catLabel = {'career':'경력증명서','certs':'자격증','edu':'졸업증명서','reg':'주민등록','bank':'급여통장'}[key] || key;
        var ext = file.name.split('.').pop();
        var renamedName = '입사자_' + nameBase + '_' + catLabel + '_' + (app.files[key].length + 1) + '.' + ext;
        app.files[key].push({
          name: renamedName, originalName: file.name,
          size: file.size, type: ext === 'pdf' ? 'pdf' : 'image',
          b64: e.target.result
        });
        next();
      };
      reader.readAsDataURL(file);
    }
    next();
  }

  /* ════════════ STEP 4: 퇴직연금 서류 안내 ════════════ */
  function _renderStep4(wrap, app) {
    var card = el('div', 'hr-card');
    var head = el('div', 'hr-card-head');
    head.innerHTML = '<div class="hr-card-title">④ 퇴직연금(DC) 가입신청서</div>';
    card.appendChild(head);
    var body = el('div', 'hr-card-body');

    var banner = el('div', 'hr-pension-banner');
    banner.innerHTML =
      '<h3>📋 퇴직연금 서류 안내</h3>' +
      '<p>아래 서류는 출력하여 <strong>자필로 작성</strong> 후 <strong>인사담당자에게 직접 제출</strong>하세요.<br>' +
      '서면 원본 제출이 필수입니다. 이메일/팩스 제출 불가.</p>';
    body.appendChild(banner);

    var notice = el('div', 'hr-pension-notice');
    notice.innerHTML =
      '<div class="hr-pension-notice-title">📌 제출 방법 안내</div>' +
      '<p>출력하여 작성한 서류는 아래 인사담당자에게 제출해주세요.<br><br>' +
      '• <strong>담당자:</strong> 방시원 기획차장 (인사담당)<br>' +
      '• <strong>주소:</strong> 서울특별시 영등포구 당산로32길 16, 4층 사무동 기획처<br>' +
      '• <strong>이메일:</strong> bangsw@asea.or.kr (참고용 — 원본 제출 필수)<br><br>' +
      '노란색으로 표시된 항목은 반드시 자필로 기재하세요.<br>' +
      '견본 양식을 참고하여 각 항목을 정확히 작성하시기 바랍니다.</p>';
    body.appendChild(notice);

    // 파일 다운로드 카드들
    var filesRow = el('div', 'hr-pension-files');

    var penFiles = [
      { icon: '📝', name: '퇴직연금 가입신청서', desc: '하나은행 DC/기업형IRP\n실제 제출용 서식 — 출력 후 자필 작성', path: 'hr-forms/dc-pension-form.pdf' },
      { icon: '📖', name: '가입신청서 작성 견본', desc: '노란 표시 항목 기입 예시\n이 파일을 보고 참고하세요', path: 'hr-forms/dc-pension-sample.pdf' },
      { icon: '📊', name: '상품설명서', desc: '하나은행 디폴트옵션 안정형 포트폴리오\n투자 전 반드시 읽어보세요', path: 'hr-forms/dc-pension-product.pdf' },
    ];

    penFiles.forEach(function(pf) {
      var fc = el('div', 'hr-pension-file');
      fc.innerHTML =
        '<div class="hr-pension-file-icon">' + pf.icon + '</div>' +
        '<div class="hr-pension-file-name">' + pf.name + '</div>' +
        '<div class="hr-pension-file-desc">' + pf.desc.replace('\n','<br>') + '</div>';
      var dlBtn = el('a', 'hr-btn hr-btn-primary hr-btn-sm', '⬇ 다운로드');
      dlBtn.href = pf.path; dlBtn.download = '';
      dlBtn.style.marginTop = '4px';
      fc.appendChild(dlBtn);
      filesRow.appendChild(fc);
    });
    body.appendChild(filesRow);

    // 확인 체크박스
    var ckRow = el('div');
    ckRow.style.cssText = 'margin-top:16px;padding:12px 16px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px';
    var lbl = el('label', 'hr-cb-item');
    lbl.style.cssText = 'font-size:13px;font-weight:600;color:#15803D';
    var ck = document.createElement('input'); ck.type = 'checkbox'; ck.id = 'hr-pension-ck';
    if (app.pensionDone) ck.checked = true;
    ck.addEventListener('change', function() { app.pensionDone = this.checked; _saveApplicant(app); });
    lbl.appendChild(ck);
    lbl.appendChild(document.createTextNode('퇴직연금 서류 안내를 확인하였으며, 서류를 출력하여 자필 작성 후 인사담당자에게 제출하겠습니다.'));
    ckRow.appendChild(lbl);
    body.appendChild(ckRow);

    card.appendChild(body);
    wrap.appendChild(card);
    wrap.appendChild(_buildNavButtons(
      function(){ _st.appStep=2; _render(); },
      function(){ _st.appStep=4; _render(); },
      '최종 제출 →'
    ));
  }

  /* ════════════ STEP 5: 최종 제출 ════════════ */
  function _renderStep5Submit(wrap, app) {
    var card = el('div', 'hr-card');
    var body = el('div', 'hr-card-body');

    // 요약
    var summary = el('div');
    summary.style.cssText = 'margin-bottom:20px';
    summary.innerHTML = '<div class="hr-section-title" style="margin-top:0">제출 전 확인</div>';

    var checks = [
      { ok: !!(app.form1.nameKr && app.form1.mobile), label: '채용지원서 기본정보' },
      { ok: !!(app.form1.signB64), label: '채용지원서 서명' },
      { ok: !!(app.form2.agreeInfo && app.form2.agreeId && app.form2.agreePromo), label: '개인정보 동의서 동의 (3항목)' },
      { ok: !!(app.form2.signB64), label: '개인정보 동의서 서명' },
      { ok: app.files.career.length > 0, label: '경력/재직증명서 업로드' },
      { ok: app.files.bank.length > 0, label: '급여통장 사본 업로드' },
      { ok: app.pensionDone, label: '퇴직연금 서류 안내 확인' },
    ];

    checks.forEach(function(c) {
      var row = el('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #F3F4F6;font-size:13px';
      row.innerHTML = (c.ok ? '<span style="color:#16A34A;font-size:16px">✅</span>' : '<span style="color:#CA8A04;font-size:16px">⚠️</span>') +
        '<span style="color:' + (c.ok ? '#111827' : '#92400E') + '">' + c.label + '</span>';
      summary.appendChild(row);
    });
    body.appendChild(summary);

    if (_st.isDemo) {
      // 체험 모드: 미리보기 버튼만 제공
      var demoNotice = el('div');
      demoNotice.style.cssText = 'background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:13px;color:#92400E;text-align:center';
      demoNotice.innerHTML = '✨ <strong>체험 모드</strong>입니다 — 아래에서 작성한 내용을 미리보기로 확인하세요.';
      body.appendChild(demoNotice);

      var pvForm1Btn = el('button', 'hr-btn hr-btn-primary', '👁️  채용지원서 미리보기');
      pvForm1Btn.style.cssText = 'width:100%;padding:12px;font-size:14px;margin-bottom:8px';
      pvForm1Btn.addEventListener('click', function() { _printApplicationForm(app); });
      body.appendChild(pvForm1Btn);

      var pvForm2Btn = el('button', 'hr-btn hr-btn-primary', '👁️  개인정보 동의서 미리보기');
      pvForm2Btn.style.cssText = 'width:100%;padding:12px;font-size:14px;margin-bottom:8px';
      pvForm2Btn.addEventListener('click', function() { _printPrivacyForm(app); });
      body.appendChild(pvForm2Btn);

      var endDemoBtn = el('button', 'hr-btn hr-btn-ghost', '✕ 체험 종료');
      endDemoBtn.style.cssText = 'width:100%;margin-bottom:8px';
      endDemoBtn.addEventListener('click', function() {
        _st.applicant = null; _st.appStep = 0; _st.isDemo = false; _render();
      });
      body.appendChild(endDemoBtn);

      var restartDemoBtn = el('button', 'hr-btn hr-btn-demo', '🔄 처음부터 다시 체험');
      restartDemoBtn.style.width = '100%';
      restartDemoBtn.addEventListener('click', function() { _startDemo(); });
      body.appendChild(restartDemoBtn);
    } else {
      var submitBtn = el('button', 'hr-btn hr-btn-success', '📨  최종 제출하기');
      submitBtn.style.cssText = 'width:100%;padding:14px;font-size:15px;margin-bottom:8px';
      submitBtn.addEventListener('click', function() {
        app.status = 'submitted';
        app.submittedAt = Date.now();
        _saveApplicant(app);
        toast('서류가 성공적으로 제출되었습니다!', '#16A34A');
        _render();
      });
      body.appendChild(submitBtn);

      var backBtn = el('button', 'hr-btn hr-btn-ghost', '← 돌아가서 수정');
      backBtn.style.width = '100%';
      backBtn.addEventListener('click', function() { _st.appStep=0; _render(); });
      body.appendChild(backBtn);
    }

    card.appendChild(body);
    wrap.appendChild(_buildNavButtons(function(){ _st.appStep=3; _render(); }, null, ''));
    wrap.appendChild(card);
  }

  /* ══════════════════════════════════════════════
     인사관리자 뷰
  ══════════════════════════════════════════════ */
  function _renderManagerView(wrap) {
    if (!_st.mgrAuth) {
      _renderPasswordEntry(wrap, '인사관리자 인증', '인사관리자 비밀번호를 입력하세요.', function(pw) {
        var cfg = loadCfg();
        var correctPw = cfg.mgrPw || MGR_PW;
        if (pw === correctPw) { _st.mgrAuth = true; _render(); }
        else return '비밀번호가 올바르지 않습니다.';
      });
      return;
    }

    if (_st.viewTarget) {
      _renderApplicantDetail(wrap);
      return;
    }

    _renderManagerList(wrap);
  }

  function _renderManagerList(wrap) {
    var apps = loadApps().filter(function(a){ return a.type === 'onboard' || !a.type; });

    var toolbar = el('div', 'hr-mgr-toolbar');
    var srch = document.createElement('input');
    srch.className = 'hr-mgr-search'; srch.placeholder = '🔍 이름으로 검색';
    srch.id = 'hr-mgr-search';
    toolbar.appendChild(srch);

    var btnRow = el('div', 'hr-btn-row');
    var linkBtn = el('button', 'hr-btn hr-btn-primary hr-btn-sm', '🔗 신청 링크 복사');
    linkBtn.addEventListener('click', function() {
      var url = _getHRFormUrl();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function() { alert('✅ 입사 신청 링크가 복사되었습니다.\n\n' + url); });
      } else {
        var ta = document.createElement('textarea');
        ta.value = url; ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        alert('✅ 입사 신청 링크가 복사되었습니다.\n\n' + url);
      }
    });
    var excelBtn = el('button', 'hr-btn hr-btn-secondary hr-btn-sm', '⬇ 목록 다운로드');
    excelBtn.addEventListener('click', function() { _downloadCSV(apps); });
    var backBtn = el('button', 'hr-btn hr-btn-ghost hr-btn-sm', '← 돌아가기');
    backBtn.addEventListener('click', function() { _st.view='home'; _st.mgrAuth=false; _render(); });
    btnRow.appendChild(linkBtn);
    btnRow.appendChild(excelBtn);
    btnRow.appendChild(backBtn);
    toolbar.appendChild(btnRow);
    wrap.appendChild(toolbar);

    // 통계
    var statRow = el('div', 'hr-stat-row');
    var statData = [
      { label: '전체', num: apps.length, color: '#1a3a5c' },
      { label: '작성중', num: apps.filter(function(a){ return a.status==='pending'||a.status==='partial'; }).length, color: '#A16207' },
      { label: '제출완료', num: apps.filter(function(a){ return a.status==='submitted'; }).length, color: '#1A73E8' },
      { label: '승인완료', num: apps.filter(function(a){ return a.status==='approved'; }).length, color: '#15803D' },
    ];
    statData.forEach(function(s) {
      var c = el('div', 'hr-stat-card');
      c.innerHTML = '<div class="hr-stat-num" style="color:' + s.color + '">' + s.num + '</div><div class="hr-stat-label">' + s.label + '</div>';
      statRow.appendChild(c);
    });
    wrap.appendChild(statRow);

    var listWrap = el('div', 'hr-list-wrap');
    wrap.appendChild(listWrap);

    function renderList(filter) {
      listWrap.innerHTML = '';
      var filtered = apps.filter(function(a) {
        return !filter || (a.form1.nameKr || '').includes(filter);
      });
      if (!filtered.length) {
        listWrap.innerHTML = '<div class="hr-empty"><span class="hr-empty-icon">📭</span>제출된 서류가 없습니다.</div>';
        return;
      }
      filtered.forEach(function(app, i) {
        var card = el('div', 'hr-applicant-card');
        var numBadge = el('div', 'hr-applicant-num', String(i + 1));
        var info = el('div', 'hr-applicant-info');
        var name = el('div', 'hr-applicant-name', app.form1.nameKr || '(이름 미입력)');
        var meta = el('div', 'hr-applicant-meta');
        meta.textContent =
          '접수코드: ' + app.code +
          ' | 제출: ' + (app.submittedAt ? fmtDT(app.submittedAt) : '미제출') +
          ' | 부서: ' + (app.form1.deptCheckboxes || []).join(', ');
        info.appendChild(name); info.appendChild(meta);

        var statusClass = { pending:'hr-status-pending', partial:'hr-status-partial',
          submitted:'hr-status-submitted', approved:'hr-status-approved' }[app.status] || 'hr-status-pending';
        var statusLabel = { pending:'대기', partial:'작성중', submitted:'제출완료', approved:'승인완료' }[app.status] || '대기';
        var badge = el('span', 'hr-status-badge ' + statusClass, statusLabel);

        card.appendChild(numBadge); card.appendChild(info); card.appendChild(badge);
        card.addEventListener('click', function() { _st.viewTarget = app.id; _render(); });
        listWrap.appendChild(card);
      });
    }

    srch.addEventListener('input', function() { renderList(this.value.trim()); });
    renderList('');
  }

  function _renderApplicantDetail(wrap) {
    var apps = loadApps();
    var app = apps.find(function(a){ return a.id === _st.viewTarget; });
    if (!app) { _st.viewTarget=null; _render(); return; }

    var f = app.form1;
    var toolbar = el('div', 'hr-mgr-toolbar');
    var backBtn = el('button', 'hr-btn hr-btn-ghost hr-btn-sm', '← 목록으로');
    backBtn.addEventListener('click', function() { _st.viewTarget=null; _render(); });
    toolbar.appendChild(backBtn);

    var btnRow = el('div', 'hr-btn-row');
    var printBtn = el('button', 'hr-btn hr-btn-primary hr-btn-sm', '🖨 채용지원서 출력');
    printBtn.addEventListener('click', function() { _printApplicationForm(app); });
    var privacyPrintBtn = el('button', 'hr-btn hr-btn-secondary hr-btn-sm', '🖨 동의서 출력');
    privacyPrintBtn.addEventListener('click', function() { _printPrivacyForm(app); });

    var statusSel = document.createElement('select');
    statusSel.style.cssText = 'padding:6px 10px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px';
    var statusOpts = [['pending','대기'],['partial','작성중'],['submitted','제출완료'],['approved','승인완료']];
    statusOpts.forEach(function(o) {
      var opt = document.createElement('option');
      opt.value = o[0]; opt.textContent = o[1];
      if (app.status === o[0]) opt.selected = true;
      statusSel.appendChild(opt);
    });
    statusSel.addEventListener('change', function() {
      app.status = this.value;
      var idx = apps.findIndex(function(a){ return a.id === app.id; });
      if (idx > -1) { apps[idx] = app; saveApps(apps); }
      toast('상태가 변경되었습니다.');
    });

    btnRow.appendChild(printBtn); btnRow.appendChild(privacyPrintBtn);
    btnRow.appendChild(statusSel);
    toolbar.appendChild(btnRow);
    wrap.appendChild(toolbar);

    // 기본 정보
    var card = el('div', 'hr-card');
    var head = el('div', 'hr-card-head');
    head.innerHTML = '<div class="hr-card-title">① 채용지원서 — ' + (f.nameKr || '(이름 없음)') + '</div>';
    card.appendChild(head);
    var body = el('div', 'hr-card-body');

    var grid = el('div', 'hr-view-grid');
    var fields = [
      ['성명(한글)', f.nameKr], ['성명(한자)', f.nameHj],
      ['성별', f.gender], ['생년월일', f.birth],
      ['휴대폰', f.mobile], ['이메일', f.email],
      ['주소', f.address], ['결혼유무', f.married],
      ['병역', f.military + ' ' + f.milBranch + ' ' + f.milRank],
      ['직군', f.jobGroup], ['희망부서', (f.deptCheckboxes||[]).join(', ')],
    ];
    fields.forEach(function(fld) {
      var item = el('div', 'hr-view-item');
      item.innerHTML = '<div class="hr-view-label">' + _esc(fld[0]) + '</div><div class="hr-view-value">' + _esc(fld[1]||'-') + '</div>';
      grid.appendChild(item);
    });
    body.appendChild(grid);

    // 학력
    body.innerHTML += '<div class="hr-view-section-title">학력사항</div>';
    var tbl = _buildReadTable(['구분','기간','학교','전공','학위','평점'],
      f.education.map(function(e) {
        return [e.type, e.from+'~'+e.to, e.country+' '+e.school, e.major, e.degree, e.gpa];
      })
    );
    body.appendChild(tbl);

    // 경력
    var bodyEl = body;
    bodyEl.innerHTML += '<div class="hr-view-section-title">경력사항</div>';
    var ctbl = _buildReadTable(['기간','근무기관','직위','담당업무'],
      f.career.map(function(c) {
        return [c.from+'~'+c.to, c.org, c.rank, c.duties];
      })
    );
    bodyEl.appendChild(ctbl);

    // 업로드 파일
    bodyEl.innerHTML += '<div class="hr-view-section-title">제출 서류 파일</div>';
    var catLabels = {career:'경력/재직증명서',certs:'자격증 사본',edu:'졸업/성적증명서',reg:'주민등록등본 등',bank:'급여통장 사본'};
    Object.keys(app.files).forEach(function(key) {
      if (!app.files[key].length) return;
      bodyEl.innerHTML += '<div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:4px">' + catLabels[key] + '</div>';
      var linksRow = el('div'); linksRow.style.marginBottom = '10px';
      app.files[key].forEach(function(f) {
        var link = document.createElement('a');
        link.className = 'hr-file-link';
        link.href = f.b64; link.download = f.name;
        link.innerHTML = '📎 ' + _esc(f.name);
        linksRow.appendChild(link);
      });
      bodyEl.appendChild(linksRow);
    });

    // 서명 이미지
    if (f.signB64) {
      bodyEl.innerHTML += '<div class="hr-view-section-title">서명</div>';
      var sigImg = document.createElement('img');
      sigImg.src = f.signB64; sigImg.style.cssText = 'max-width:200px;max-height:80px;border:1px solid #E5E7EB;border-radius:4px';
      bodyEl.appendChild(sigImg);
    }

    // 타임스탬프
    var tsBox = el('div');
    tsBox.style.cssText = 'margin-top:14px;font-size:11px;color:#9CA3AF;background:#F9FAFB;padding:10px;border-radius:6px';
    tsBox.innerHTML =
      (app.code ? '접수코드: <strong>' + app.code + '</strong> | ' : '') +
      (app.resumeCode ? '저장코드: <strong style="color:#2563EB">' + app.resumeCode + '</strong> | ' : '') +
      '작성 시작: <strong>' + fmtDT(app.createdAt) + '</strong> | ' +
      '제출 완료: <strong>' + (app.submittedAt ? fmtDT(app.submittedAt) : '미제출') + '</strong>' +
      (app.printedAt ? ' | 마지막 출력: <strong>' + fmtDT(app.printedAt) + '</strong>' : '');
    bodyEl.appendChild(tsBox);

    card.appendChild(body);
    wrap.appendChild(card);
  }

  /* ══════════════════════════════════════════════
     시스템 관리자 뷰
  ══════════════════════════════════════════════ */
  function _renderAdminView(wrap) {
    if (!_st.admAuth) {
      _renderPasswordEntry(wrap, '시스템 관리자 인증', '관리자 비밀번호를 입력하세요.', function(pw) {
        var cfg = loadCfg();
        var correctPw = cfg.admPw || ADM_PW;
        if (pw === correctPw) { _st.admAuth = true; _render(); }
        else return '비밀번호가 올바르지 않습니다.';
      });
      return;
    }

    var backBtn = el('button', 'hr-btn hr-btn-ghost hr-btn-sm', '← 돌아가기');
    backBtn.style.marginBottom = '16px';
    backBtn.addEventListener('click', function() { _st.view='home'; _st.admAuth=false; _render(); });
    wrap.appendChild(backBtn);

    // 접수코드 관리
    var codeCard = el('div', 'hr-card');
    var codeHead = el('div', 'hr-card-head');
    codeHead.innerHTML = '<div class="hr-card-title">📋 접수코드 관리</div>';
    codeCard.appendChild(codeHead);
    var codeBody = el('div', 'hr-card-body');

    var genRow = el('div'); genRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:flex-end';
    var nameF = _field('입사자 이름', 'text', '', function(){}, 'w140', null, '홍길동');
    nameF.querySelector('input').id = 'hr-adm-name';
    genRow.appendChild(nameF);
    var genBtn = el('button', 'hr-btn hr-btn-primary', '➕ 접수코드 발급');
    genBtn.style.marginTop = 'auto';
    genBtn.addEventListener('click', function() {
      var nameInp = document.getElementById('hr-adm-name');
      var name = nameInp ? nameInp.value.trim() : '';
      _generateCode(name);
    });
    genRow.appendChild(genBtn);
    codeBody.appendChild(genRow);

    var codes = loadCodes();
    if (!codes.length) {
      codeBody.innerHTML += '<div class="hr-empty" style="padding:24px"><span class="hr-empty-icon">📭</span>발급된 접수코드가 없습니다.</div>';
    } else {
      var allApps = loadApps();
      codes.slice().reverse().forEach(function(c) {
        var appForCode  = allApps.find(function(a){ return a.code === c.code; });
        var pinDisplay  = appForCode && appForCode.pin
          ? '비밀번호(복구): <strong>' + _esc(appForCode.pin) + '</strong>'
          : '비밀번호: 미설정';
        var card = el('div', 'hr-code-card');
        card.innerHTML =
          '<div class="hr-code-val">' + c.code + '</div>' +
          '<div class="hr-code-meta">' +
            '<strong>' + _esc(c.name || '(이름없음)') + '</strong><br>' +
            '발급: ' + fmtDT(c.createdAt) + '<br>' +
            pinDisplay + '<br>' +
            '상태: <span style="color:' + (c.active ? '#16A34A' : '#9CA3AF') + '">' + (c.active ? '사용가능' : '비활성화') + '</span>' +
          '</div>';
        var toggleBtn = el('button', 'hr-btn hr-btn-sm ' + (c.active ? 'hr-btn-danger' : 'hr-btn-success'), c.active ? '비활성화' : '활성화');
        toggleBtn.addEventListener('click', function() {
          var allCodes = loadCodes();
          var ci = allCodes.findIndex(function(x){ return x.code === c.code; });
          if (ci > -1) { allCodes[ci].active = !allCodes[ci].active; saveCodes(allCodes); _render(); }
        });
        var copyBtn = el('button', 'hr-btn hr-btn-ghost hr-btn-sm', '복사');
        copyBtn.addEventListener('click', function() {
          navigator.clipboard.writeText(c.code).then(function(){ toast('코드가 복사되었습니다.'); });
        });
        var btnCol = el('div', 'hr-btn-row');
        btnCol.appendChild(copyBtn); btnCol.appendChild(toggleBtn);
        card.appendChild(btnCol);
        codeBody.appendChild(card);
      });
    }
    codeCard.appendChild(codeBody);
    wrap.appendChild(codeCard);

    // 비밀번호 변경
    var pwCard = el('div', 'hr-card');
    var pwHead = el('div', 'hr-card-head');
    pwHead.innerHTML = '<div class="hr-card-title">🔐 비밀번호 변경</div>';
    pwCard.appendChild(pwHead);
    var pwBody = el('div', 'hr-card-body');

    var pwGrid = el('div'); pwGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px';
    var mgrPwF = _field('인사관리자 비밀번호', 'password', '', function(){}, 'flex1');
    mgrPwF.querySelector('input').id = 'hr-adm-mgr-pw'; mgrPwF.querySelector('input').placeholder = '새 비밀번호';
    var admPwF = _field('최고관리자 비밀번호', 'password', '', function(){}, 'flex1');
    admPwF.querySelector('input').id = 'hr-adm-adm-pw'; admPwF.querySelector('input').placeholder = '새 비밀번호';
    pwGrid.appendChild(mgrPwF); pwGrid.appendChild(admPwF);
    pwBody.appendChild(pwGrid);
    var savePwBtn = el('button', 'hr-btn hr-btn-primary hr-btn-sm', '저장');
    savePwBtn.style.marginTop = '10px';
    savePwBtn.addEventListener('click', function() {
      var cfg = loadCfg();
      var mp = document.getElementById('hr-adm-mgr-pw').value.trim();
      var ap = document.getElementById('hr-adm-adm-pw').value.trim();
      if (mp) cfg.mgrPw = mp;
      if (ap) cfg.admPw = ap;
      saveCfg(cfg);
      toast('비밀번호가 저장되었습니다.');
    });
    pwBody.appendChild(savePwBtn);
    pwCard.appendChild(pwBody);
    wrap.appendChild(pwCard);

    // 데이터 초기화
    var resetCard = el('div', 'hr-card');
    var resetHead = el('div', 'hr-card-head');
    resetHead.innerHTML = '<div class="hr-card-title">⚠️ 데이터 관리</div>';
    resetCard.appendChild(resetHead);
    var resetBody = el('div', 'hr-card-body');
    var exportBtn = el('button', 'hr-btn hr-btn-secondary hr-btn-sm', '📥 전체 데이터 내보내기');
    exportBtn.addEventListener('click', _exportData);
    var clearBtn = el('button', 'hr-btn hr-btn-danger hr-btn-sm', '🗑 전체 삭제');
    clearBtn.addEventListener('click', function() {
      if (confirm('모든 지원자 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
        localStorage.removeItem(LS_APPS); localStorage.removeItem(LS_CODES);
        toast('삭제 완료', '#DC2626'); _render();
      }
    });
    var resetBtnRow = el('div', 'hr-btn-row');
    resetBtnRow.appendChild(exportBtn); resetBtnRow.appendChild(clearBtn);
    resetBody.appendChild(resetBtnRow);
    resetCard.appendChild(resetBody);
    wrap.appendChild(resetCard);
  }

  function _generateCode() {
    var nameInp = document.getElementById('hr-adm-name');
    var name = nameInp ? nameInp.value.trim() : '';
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = '';
    for (var i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    var codes = loadCodes();
    codes.push({ code: code, name: name, active: true, createdAt: Date.now() });
    saveCodes(codes);
    toast('접수코드 발급: ' + code);
    _render();
  }

  /* ══════════════════════════════════════════════
     출력 (인쇄)
  ══════════════════════════════════════════════ */
  /* 통일 레터헤드 밴드 (관리자 로고 + 기관명) */
  function _hrLetterhead() {
    var logo = '';
    try { logo = localStorage.getItem('asea_logo') || ''; } catch (e) {}
    var mark = logo
      ? '<img class="hr-lh-logo" src="' + logo + '" alt="logo">'
      : '<span class="hr-lh-emoji">📅</span>';
    return '<div class="hr-letterhead">' + mark +
      '<span class="hr-lh-org">(재) 아세아항공직업전문학교</span></div>';
  }

  function _printApplicationForm(app) {
    var f = app.form1;
    var now = Date.now();
    app.printedAt = now;
    var apps = loadApps();
    var idx = apps.findIndex(function(a){ return a.id === app.id; });
    if (idx > -1) { apps[idx] = app; saveApps(apps); }

    var html =
      '<div class="hr-print-page">' +
      _hrLetterhead() +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4mm">' +
      '<div>' +
      '<div class="hr-print-title">① 교직원 채용(임용) 지원서</div>' +
      '<div class="hr-print-subtitle">(재)아세아항공직업전문학교장 귀하</div>' +
      '</div>' +
      (f.photoB64 ? '<img class="hr-print-photo" src="' + f.photoB64 + '" alt="증명사진">' : '<div class="hr-print-photo" style="display:flex;align-items:center;justify-content:center;font-size:9pt;color:#888">증명사진</div>') +
      '</div>' +
      '<div class="hr-print-section-head">직군: ' + _esc(f.jobGroup || '') + '&nbsp;&nbsp;&nbsp;근무예정부서: ' + _esc((f.deptCheckboxes||[]).join(', ')) + '</div>' +
      '<div class="hr-print-section-head">1. 인적사항</div>' +
      '<table class="hr-print-table"><tr>' +
      '<th style="width:12%">성명(한글)</th><td>' + _esc(f.nameKr||'') + '</td>' +
      '<th style="width:12%">성명(한자)</th><td>' + _esc(f.nameHj||'') + '</td>' +
      '<th style="width:8%">성별</th><td>' + _esc(f.gender||'') + '</td>' +
      '<th style="width:13%">생년월일</th><td>' + _esc(f.birth||'') + '</td>' +
      '</tr><tr>' +
      '<th>주소</th><td colspan="7">' + _esc(f.address||'') + '</td>' +
      '</tr><tr>' +
      '<th>휴대폰</th><td colspan="3">' + _esc(f.mobile||'') + '</td>' +
      '<th>이메일</th><td colspan="3">' + _esc(f.email||'') + '</td>' +
      '</tr><tr>' +
      '<th>결혼유무</th><td>' + _esc(f.married||'') + '</td>' +
      '<th>호주와의관계</th><td>' + _esc(f.familyHead||'') + '</td>' +
      '<th>병역관계</th><td>' + _esc(f.military||'') + '</td>' +
      '<th>군종/계급</th><td>' + _esc((f.milBranch||'') + ' ' + (f.milRank||'')) + '</td>' +
      '</tr></table>' +
      '<div class="hr-print-section-head">2. 학력사항</div>' +
      '<table class="hr-print-table"><tr><th>구분</th><th>기간</th><th>국가명</th><th>학교명</th><th>학과(전공)</th><th>학위명</th><th>평점평균</th></tr>' +
      f.education.map(function(e) {
        return '<tr><td>' + _esc(e.type) + '</td><td>' + _fmtM(e.from) + '~' + _fmtM(e.to) + '</td>' +
          '<td>' + _esc(e.country||'') + '</td><td>' + _esc(e.school||'') + '</td>' +
          '<td>' + _esc(e.major||'') + '</td><td>' + _esc(e.degree||'') + '</td><td>' + _esc(e.gpa||'') + '</td></tr>';
      }).join('') + '</table>' +
      '<div class="hr-print-section-head">3. 가족사항</div>' +
      '<table class="hr-print-table"><tr><th>관계</th><th>성명</th><th>생년월일</th><th>직업</th><th>나이(만)</th><th>관계</th><th>성명</th><th>생년월일</th><th>직업</th><th>나이(만)</th></tr>' +
      (function() {
        var rows = '';
        for (var i = 0; i < f.family.length; i += 2) {
          var a = f.family[i] || {}; var b = f.family[i+1] || {};
          rows += '<tr><td>' + _esc(a.rel||'') + '</td><td>' + _esc(a.name||'') + '</td><td>' + _esc(a.birth||'') + '</td><td>' + _esc(a.job||'') + '</td><td>' + _esc(a.age||'') + '</td>' +
            '<td>' + _esc(b.rel||'') + '</td><td>' + _esc(b.name||'') + '</td><td>' + _esc(b.birth||'') + '</td><td>' + _esc(b.job||'') + '</td><td>' + _esc(b.age||'') + '</td></tr>';
        }
        return rows;
      })() + '</table>' +
      '<div class="hr-print-section-head">4. 경력사항</div>' +
      '<table class="hr-print-table"><tr><th>기간</th><th>근무년월</th><th>근무기관</th><th>최종직위</th><th>담당업무</th><th>주당담당시간수</th></tr>' +
      f.career.map(function(c) {
        return '<tr><td>' + _fmtM(c.from||'') + '~' + _fmtM(c.to||'') + '</td><td>' + _esc(c.months||'') + '</td>' +
          '<td>' + _esc(c.org||'') + '</td><td>' + _esc(c.rank||'') + '</td><td>' + _esc(c.duties||'') + '</td><td>' + _esc(c.hours||'') + '</td></tr>';
      }).join('') + '</table>' +
      '<div class="hr-print-section-head">5. 자격취득사항 / 수상내역</div>' +
      '<table style="width:100%;border-collapse:collapse"><tr><td style="width:50%;vertical-align:top"><table class="hr-print-table"><tr><th>취득일자</th><th>종류</th><th>발행기관</th></tr>' +
      f.certs.map(function(c) { return '<tr><td>' + _fmtM(c.date||'') + '</td><td>' + _esc(c.type||'') + '</td><td>' + _esc(c.issuer||'') + '</td></tr>'; }).join('') +
      '</table></td><td style="width:50%;vertical-align:top"><table class="hr-print-table"><tr><th>수상일</th><th>종류</th><th>수여기관</th></tr>' +
      f.awards.map(function(a) { return '<tr><td>' + _fmtM(a.date||'') + '</td><td>' + _esc(a.type||'') + '</td><td>' + _esc(a.org||'') + '</td></tr>'; }).join('') +
      '</table></td></tr></table>' +
      '<div class="hr-print-section-head">6. 외국어/전산/AI툴 활용능력</div>' +
      '<table class="hr-print-table"><tr><th>토익</th><td>' + _esc(f.langToeic||'') + '</td><th>텝스</th><td>' + _esc(f.langTeps||'') + '</td><th>기타</th><td>' + _esc(f.langOther||'') + '</td><th>전산수준</th><td>' + _esc(f.pcLevel||'') + '</td></tr></table>' +
      '<table class="hr-print-table" style="margin-top:1mm"><tr><th>AI툴</th><th>활용 목적 및 사례</th><th>숙련도</th></tr>' +
      (f.aiTools||[]).map(function(ai) {
        return '<tr><td>' + _esc(ai.tool||'') + '</td><td>' + _esc(ai.purpose||'') + '</td><td>' + _esc(ai.level||'') + '</td></tr>';
      }).join('') + '</table>' +
      '<div class="hr-print-section-head">7. 학위논문</div>' +
      '<table class="hr-print-table"><tr><th>구분</th><th>제목</th><th>발표년월일</th><th>취득학교</th><th>내용 요지</th></tr>' +
      (f.thesis||[]).map(function(t) { return '<tr><td>' + _esc(t.type||'') + '</td><td>' + _esc(t.title||'') + '</td><td>' + _esc(t.date||'') + '</td><td>' + _esc(t.school||'') + '</td><td>' + _esc(t.summary||'') + '</td></tr>'; }).join('') + '</table>' +
      '<div style="margin-top:3mm;font-size:7.5pt">위 기재한 사항은 모두 사실이며, 허위 기재 또는 중요 사항 누락 시 채용 취소·임용 해지 등 학교의 인사 조치에 이의가 없음을 확인합니다.</div>' +
      '<div class="hr-print-sig-row">' +
      '<span class="hr-print-date">' + _esc(f.signDate || fmtDate(Date.now())) + '&nbsp;&nbsp;지원자 :</span>' +
      (f.signB64 ? '<div class="hr-print-sig-box"><img class="hr-print-sig-img" src="' + f.signB64 + '" alt="서명"></div>' : '<div class="hr-print-sig-box"><div class="hr-print-sig-img"></div></div>') +
      '</div>' +
      '<div class="hr-print-footnote">' +
      '작성 시작: ' + fmtDT(app.createdAt) + ' &nbsp;|&nbsp; ' +
      '제출 완료: ' + (app.submittedAt ? fmtDT(app.submittedAt) : '미제출') + ' &nbsp;|&nbsp; ' +
      '출력 일시: ' + fmtDT(now) +
      '</div>' +
      '</div>';

    _doPrint(html);
  }

  function _printPrivacyForm(app) {
    var f2 = app.form2;
    var now = Date.now();
    app.printedAt = now;
    var apps = loadApps();
    var idx = apps.findIndex(function(a){ return a.id === app.id; });
    if (idx > -1) { apps[idx] = app; saveApps(apps); }

    var html =
      '<div class="hr-print-page">' +
      _hrLetterhead() +
      '<div class="hr-print-title">② 개인정보 수집·활용 동의서</div>' +
      '<table class="hr-print-table" style="margin-bottom:4mm">' +
      '<tr><th>수집 항목</th><td>성명, 생년월일, 사진, 주소, 핸드폰번호, 전화번호, E-mail주소, 자격사항, 근무경력사항 등</td></tr>' +
      '<tr><th>이용 목적</th><td>서류심사 등 위촉절차 집행·관리, 경력·자격 확인, 위촉여부 결정, 민원처리</td></tr>' +
      '<tr><th>보유 기간</th><td>응모원서 제출 후 준영구 또는 삭제 요청 시까지</td></tr>' +
      '</table>' +
      '<p style="font-size:8.5pt;line-height:1.7">귀하는 이에 대한 동의를 거부할 수 있으며, 동의가 없을 경우 채용전형 진행이 불가능할 수 있습니다.</p>' +
      '<table class="hr-print-table" style="margin:3mm 0"><tr>' +
      '<td><strong>' + (f2.agreeInfo ? '■' : '□') + ' 개인정보 수집 및 이용에 동의함</strong></td>' +
      '<td>' + (f2.agreeInfo ? '□' : '■') + ' 개인정보 수집 및 이용에 동의하지 않음</td>' +
      '</tr></table>' +
      '<div class="hr-print-section-head" style="margin-top:4mm">[ 고유식별정보 처리에 대한 동의 ]</div>' +
      '<table class="hr-print-table" style="margin-bottom:3mm">' +
      '<tr><th>수집 항목</th><td>주민(사업자)등록번호</td></tr>' +
      '<tr><th>이용 목적</th><td>응모에 따른 서류심사 및 위촉</td></tr>' +
      '<tr><th>보유 기간</th><td>응모원서 제출 후 준영구 또는 지원서 삭제 신청 시까지</td></tr>' +
      '</table>' +
      '<table class="hr-print-table" style="margin:3mm 0"><tr>' +
      '<td><strong>' + (f2.agreeId ? '■' : '□') + ' 고유식별정보 수집 및 이용에 동의함</strong></td>' +
      '<td>' + (f2.agreeId ? '□' : '■') + ' 고유식별정보 수집 및 이용에 동의하지 않음</td>' +
      '</tr></table>' +
      '<div class="hr-print-section-head" style="margin-top:4mm">[ 홍보 목적 초상권·영상·음성 이용에 대한 동의 ]</div>' +
      '<table class="hr-print-table" style="margin-bottom:3mm">' +
      '<tr><th>수집 항목</th><td>재직 기간 중 교내외에서 촬영된 사진, 동영상, 인터뷰 내용 및 음성</td></tr>' +
      '<tr><th>이용 목적</th><td>학교 홍보물(리플렛, 홈페이지, SNS, 홍보영상, 입시 홍보물 등) 및 공식 홍보 목적에 한정</td></tr>' +
      '<tr><th>보유 기간</th><td>재직 기간 및 퇴직 후 3년까지 (이후 요청 시 파기)</td></tr>' +
      '<tr><th>법적 근거</th><td>「개인정보 보호법」제15조 제1항 제1호, 민법상 초상권·성명권 관련 판례</td></tr>' +
      '</table>' +
      '<p style="font-size:8pt">※ 동의 거부 시 채용 결정에 불이익이 없으나 홍보 활동에는 포함되지 않습니다.<br>※ 기배포본 전량 회수는 불가할 수 있으나 이후 사용은 즉시 중단합니다.</p>' +
      '<table class="hr-print-table" style="margin:3mm 0"><tr>' +
      '<td><strong>' + ((f2.agreePromo) ? '■' : '□') + ' 홍보 목적 초상권·영상·음성 수집 및 이용에 동의함</strong></td>' +
      '<td>' + ((f2.agreePromo) ? '□' : '■') + ' 동의하지 않음</td>' +
      '</tr></table>' +
      '<p style="font-size:8pt;margin-top:4mm">「개인정보보호법」등 관련 법규에 의거하여 본인은 위와 같이 개인정보 수집 및 활용에 동의함.</p>' +
      '<div class="hr-print-sig-row">' +
      '<span class="hr-print-date">' + _esc(f2.signDate || fmtDate(Date.now())) + '&nbsp;&nbsp;성명 : ' + _esc(app.form1.nameKr || '') + '</span>' +
      (f2.signB64 ? '<div class="hr-print-sig-box"><img class="hr-print-sig-img" src="' + f2.signB64 + '" alt="서명"></div>' : '<div class="hr-print-sig-box"><div class="hr-print-sig-img"></div></div>') +
      '</div>' +
      '<div style="text-align:center;margin-top:8mm;font-size:11pt;font-weight:700">(재)아세아항공직업전문학교장 귀하</div>' +
      '<div class="hr-print-footnote">' +
      '작성 시작: ' + fmtDT(app.createdAt) + ' &nbsp;|&nbsp; ' +
      '제출 완료: ' + (app.submittedAt ? fmtDT(app.submittedAt) : '미제출') + ' &nbsp;|&nbsp; ' +
      '출력 일시: ' + fmtDT(now) +
      '</div>' +
      '</div>';

    _doPrint(html);
  }

  function _doPrint(html) {
    var printCSS = [
      "@font-face{font-family:'KoPubWorld Dotum';font-weight:300;src:url('fonts/KoPubWorld-Dotum-Light.ttf') format('truetype');}",
      "@font-face{font-family:'KoPubWorld Dotum';font-weight:400;src:url('fonts/KoPubWorld-Dotum-Medium.ttf') format('truetype');}",
      "@font-face{font-family:'KoPubWorld Dotum';font-weight:700;src:url('fonts/KoPubWorld-Dotum-Bold.ttf') format('truetype');}",
      "body{font-family:'KoPubWorld Dotum','Malgun Gothic','맑은 고딕',sans-serif;margin:0;padding:0;}",
      ".hr-print-page{width:210mm;padding:7mm 10mm;font-size:8pt;line-height:1.35;color:#000;box-sizing:border-box;page-break-after:always;}",
      ".hr-letterhead{display:flex;align-items:center;gap:8px;padding-bottom:4px;margin-bottom:3mm;border-bottom:2px solid #1a3a5c;}",
      ".hr-lh-logo{height:22px;width:auto;max-width:130px;object-fit:contain;}",
      ".hr-lh-emoji{font-size:18px;line-height:1;}",
      ".hr-lh-org{font-size:11pt;font-weight:800;color:#1a3a5c;letter-spacing:.3px;}",
      ".hr-print-title{font-size:13pt;font-weight:700;margin-bottom:2mm;letter-spacing:1px;}",
      ".hr-print-subtitle{font-size:9pt;font-weight:500;margin-bottom:2mm;}",
      ".hr-print-section-head{background:#eee;font-weight:700;padding:1mm 2mm;font-size:8pt;margin:2mm 0 1mm;}",
      ".hr-print-table{width:100%;border-collapse:collapse;font-size:7.5pt;margin-bottom:1.5mm;}",
      ".hr-print-table th{background:#f0f0f0;font-weight:700;padding:1mm 1.5mm;border:1px solid #000;text-align:center;white-space:nowrap;}",
      ".hr-print-table td{padding:1mm 1.5mm;border:1px solid #888;}",
      ".hr-print-sig-row{display:flex;justify-content:flex-end;margin-top:3mm;align-items:center;gap:6mm;}",
      ".hr-print-sig-box{text-align:center;}",
      ".hr-print-sig-img{width:30mm;height:15mm;border-bottom:1px solid #000;display:block;margin:0 auto;object-fit:contain;}",
      ".hr-print-date{font-size:9pt;}",
      ".hr-print-footnote{font-size:7pt;color:#555;margin-top:2mm;border-top:1px solid #ccc;padding-top:1mm;}",
      ".hr-print-photo{float:right;width:22mm;height:28mm;border:1px solid #000;margin-left:3mm;}",
      "@media print{@page{size:A4;margin:0;}.hr-print-page{page-break-after:always;}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}",
    ].join('');
    var win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
    if (!win) { alert('팝업이 차단되었습니다. 이 사이트의 팝업을 허용한 후 다시 시도하세요.'); return; }
    win.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><base href="' + location.href + '"><title>미리보기 / 출력</title><style>' + printCSS + '</style></head><body>' + html + '<div style="text-align:center;padding:16px;font-size:13px;color:#666"><button onclick="window.print()" style="padding:10px 28px;font-size:14px;background:#1a3a5c;color:#fff;border:none;border-radius:6px;cursor:pointer">🖨️ 인쇄</button>&nbsp;<button onclick="window.close()" style="padding:10px 20px;font-size:14px;background:#6B7280;color:#fff;border:none;border-radius:6px;cursor:pointer">닫기</button></div></body></html>');
    win.document.close();
  }

  /* ══════════════════════════════════════════════
     서명 패드
  ══════════════════════════════════════════════ */
  function _buildSigPad(id, existingB64, onChange) {
    var wrap = el('div', 'hr-sig-wrap');
    var label = el('div', 'hr-sig-label', '서명');
    var canvas = document.createElement('canvas');
    canvas.id = id; canvas.width = 200; canvas.height = 80;
    canvas.className = 'hr-sig-canvas';

    var ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    if (existingB64) {
      var img = new Image();
      img.onload = function() { ctx.drawImage(img, 0, 0); };
      img.src = existingB64;
    }

    var drawing = false;

    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      var sx = rect.width / canvas.width; var sy = rect.height / canvas.height;
      if (e.touches) {
        return { x: (e.touches[0].clientX - rect.left) / sx, y: (e.touches[0].clientY - rect.top) / sy };
      }
      return { x: (e.clientX - rect.left) / sx, y: (e.clientY - rect.top) / sy };
    }

    canvas.addEventListener('mousedown', function(e) {
      drawing = true; var p = getPos(e);
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
    });
    canvas.addEventListener('mousemove', function(e) {
      if (!drawing) return; var p = getPos(e);
      ctx.lineTo(p.x, p.y); ctx.stroke();
    });
    canvas.addEventListener('mouseup',   function() { drawing = false; if (onChange) onChange(canvas.toDataURL()); });
    canvas.addEventListener('mouseleave',function() { drawing = false; });

    canvas.addEventListener('touchstart', function(e) {
      drawing = true; var p = getPos(e);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', function(e) {
      if (!drawing) return; var p = getPos(e);
      ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', function() { drawing = false; if (onChange) onChange(canvas.toDataURL()); });

    var actions = el('div', 'hr-sig-actions');
    var clearBtn = el('button', 'hr-btn hr-btn-ghost hr-btn-sm', '지우기');
    clearBtn.addEventListener('click', function() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (onChange) onChange('');
    });
    var hint = el('span', 'hr-sig-hint', '마우스 또는 터치로 서명');
    actions.appendChild(clearBtn); actions.appendChild(hint);

    wrap.appendChild(label); wrap.appendChild(canvas); wrap.appendChild(actions);
    return wrap;
  }

  /* ══════════════════════════════════════════════
     공통 UI 헬퍼
  ══════════════════════════════════════════════ */
  function _field(label, type, value, onChange, cls, opts, placeholder) {
    var wrap = el('div', 'hr-field ' + (cls || ''));
    var lbl = el('label', null, label);
    var inp;
    if (type === 'select' && opts) {
      inp = document.createElement('select');
      opts.forEach(function(o) {
        var opt = document.createElement('option'); opt.value = o; opt.textContent = o;
        if (o === value) opt.selected = true;
        inp.appendChild(opt);
      });
      inp.value = value || '';
      inp.addEventListener('change', function() { onChange(this.value); });
    } else {
      inp = document.createElement('input'); inp.type = type || 'text';
      inp.value = value || '';
      if (placeholder) inp.placeholder = placeholder;
      inp.addEventListener('input', function() { onChange(this.value); });
    }
    wrap.appendChild(lbl); wrap.appendChild(inp);
    return wrap;
  }

  function _row(fields) {
    var r = el('div', 'hr-row');
    fields.forEach(function(f) { r.appendChild(f); });
    return r;
  }

  function _sectionTitle(txt) {
    var d = el('div', 'hr-section-title', txt);
    d.style.marginTop = '12px';
    return d;
  }

  function _buildTable(headers, rows) {
    var wrap = el('div', 'hr-table-wrap');
    var table = el('table', 'hr-table');
    var thead = el('thead'); var tr = el('tr');
    headers.forEach(function(h) { tr.appendChild(el('th', null, h)); });
    thead.appendChild(tr); table.appendChild(thead);
    var tbody = el('tbody');
    rows.forEach(function(cells) {
      var row = el('tr');
      cells.forEach(function(c) {
        var td = el('td');
        if (typeof c === 'string') td.textContent = c;
        else td.appendChild(c);
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody); wrap.appendChild(table);
    return wrap;
  }

  function _buildReadTable(headers, rows) {
    var wrap = el('div', 'hr-table-wrap');
    var table = el('table', 'hr-table');
    var thead = el('thead'); var tr = el('tr');
    headers.forEach(function(h) { tr.appendChild(el('th', null, h)); });
    thead.appendChild(tr); table.appendChild(thead);
    var tbody = el('tbody');
    rows.forEach(function(cells) {
      var row = el('tr');
      cells.forEach(function(c) {
        var td = el('td', null, c || '-');
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody); wrap.appendChild(table);
    return wrap;
  }

  function _tdInput(value, onChange, placeholder, width) {
    var inp = document.createElement('input');
    inp.type = 'text'; inp.value = value || '';
    if (placeholder) inp.placeholder = placeholder;
    if (width) inp.style.minWidth = width + 'px';
    inp.addEventListener('input', function() { onChange(this.value); });
    return inp;
  }

  function _tdDateInput(val, onChange, minW) {
    var td = document.createElement('td');
    var inp = document.createElement('input');
    inp.type = 'date';
    inp.value = val || '';
    inp.style.cssText = 'width:' + (minW||120) + 'px;padding:3px 5px;border:1px solid #D1D5DB;border-radius:4px;font-size:12px;box-sizing:border-box';
    inp.addEventListener('change', function() { onChange(this.value); });
    td.appendChild(inp);
    return td;
  }
  function _tdMonthInput(val, onChange, minW) {
    var td = document.createElement('td');
    var inp = document.createElement('input');
    inp.type = 'month';
    inp.value = val || '';
    inp.style.cssText = 'width:' + (minW||100) + 'px;padding:3px 5px;border:1px solid #D1D5DB;border-radius:4px;font-size:12px;box-sizing:border-box';
    inp.addEventListener('change', function() { onChange(this.value); });
    td.appendChild(inp);
    return td;
  }

  function _calcMonths(from, to) {
    if (!from || !to) return '';
    var a = from.split('-'), b = to.split('-');
    if (a.length < 2 || b.length < 2) return '';
    var total = (parseInt(b[0]) - parseInt(a[0])) * 12 + (parseInt(b[1]) - parseInt(a[1]));
    if (total <= 0) return '';
    var y = Math.floor(total / 12), m = total % 12;
    return (y > 0 ? y + '년 ' : '') + (m > 0 ? m + '개월' : '');
  }
  function _fmtM(v) { return (v || '').replace('-', '.'); }

  function _tdFixed(text) {
    var span = document.createElement('span');
    span.textContent = text;
    span.style.cssText = 'display:block;text-align:center;white-space:nowrap;font-weight:600;color:#1a3a5c';
    return span;
  }

  function _buildNavButtons(prevFn, nextFn, nextLabel) {
    var row = el('div');
    row.style.cssText = 'display:flex;justify-content:space-between;margin-top:16px;gap:8px';

    var left = el('div', 'hr-btn-row');
    if (prevFn) {
      var prevBtn = el('button', 'hr-btn hr-btn-ghost', '← 이전');
      prevBtn.addEventListener('click', prevFn);
      left.appendChild(prevBtn);
    }

    var right = el('div', 'hr-btn-row');
    if (nextFn && nextLabel) {
      var saveBtnLabel = STANDALONE ? '💾 중간 저장 (저장 코드 발급)' : '💾 임시 저장';
      var saveBtn = el('button', 'hr-btn hr-btn-ghost hr-btn-sm', saveBtnLabel);
      saveBtn.addEventListener('click', function() {
        var app = _st.applicant;
        if (!app) return;
        _saveApplicant(app);
        if (STANDALONE) { _hrMidSave(); } else { toast('임시 저장되었습니다.'); }
      });
      var nextBtn = el('button', 'hr-btn hr-btn-primary', nextLabel);
      nextBtn.addEventListener('click', nextFn);
      right.appendChild(saveBtn);
      right.appendChild(nextBtn);
    }

    row.appendChild(left); row.appendChild(right);
    return row;
  }

  function _renderPasswordEntry(wrap, title, desc, onSubmit) {
    var box = el('div', 'hr-auth-box');
    box.innerHTML =
      '<div class="hr-auth-icon">🔐</div>' +
      '<div class="hr-auth-title">' + _esc(title) + '</div>' +
      '<div class="hr-auth-desc">' + _esc(desc) + '</div>' +
      '<input class="hr-auth-input" id="hr-pw-inp" type="password" placeholder="비밀번호">' +
      '<div class="hr-auth-err" id="hr-pw-err"></div>' +
      '<button class="hr-btn hr-btn-primary" id="hr-pw-btn" style="width:100%;margin-bottom:10px">확인</button>' +
      '<button class="hr-btn hr-btn-ghost" id="hr-pw-back" style="width:100%">← 돌아가기</button>';

    wrap.appendChild(box);

    function submit() {
      var inp = document.getElementById('hr-pw-inp');
      var err = document.getElementById('hr-pw-err');
      var pw = inp ? inp.value : '';
      var result = onSubmit(pw);
      if (result) { err.textContent = result; }
    }

    document.getElementById('hr-pw-btn').addEventListener('click', submit);
    document.getElementById('hr-pw-inp').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') submit();
    });
    document.getElementById('hr-pw-back').addEventListener('click', function() {
      _st.view = 'home'; _render();
    });
  }

  /* ── 데이터 저장 ── */
  function _saveApplicant(app) {
    var apps = loadApps();
    var idx = apps.findIndex(function(a) { return a.id === app.id; });
    if (idx > -1) apps[idx] = app;
    else apps.push(app);
    try { saveApps(apps); } catch(e) { toast('저장 공간이 부족합니다. 파일 크기를 줄여주세요.', '#DC2626'); }
    // 상태 partial로 업데이트
    if (app.status === 'pending' && (app.form1.nameKr || app.form2.agreeInfo)) {
      app.status = 'partial';
    }
  }

  /* ── CSV 다운로드 ── */
  function _downloadCSV(apps) {
    var rows = [['이름','접수코드','상태','연락처','이메일','직군','희망부서','제출일']];
    apps.forEach(function(a) {
      rows.push([
        a.form1.nameKr || '', a.code, a.status,
        a.form1.mobile || '', a.form1.email || '',
        a.form1.jobGroup || '',
        (a.form1.deptCheckboxes || []).join('/'),
        a.submittedAt ? fmtDT(a.submittedAt) : ''
      ]);
    });
    var csv = rows.map(function(r) {
      return r.map(function(c) { return '"' + String(c).replace(/"/g,'""') + '"'; }).join(',');
    }).join('\n');
    var blob = new Blob(['﻿' + csv], {type:'text/csv;charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '입사자목록_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
  }

  /* ── 전체 데이터 내보내기 ── */
  function _exportData() {
    var data = {
      apps: loadApps(), codes: loadCodes(), exportedAt: Date.now()
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'asea_hr_backup_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
  }

  /* ── 유틸 ── */
  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _fmtSize(bytes) {
    if (bytes > 1024*1024) return (bytes/(1024*1024)).toFixed(1) + 'MB';
    if (bytes > 1024) return (bytes/1024).toFixed(0) + 'KB';
    return bytes + 'B';
  }

  /* ── Public API ── */
  return {
    init: function () {
      var root = document.getElementById(ROOT_ID);
      if (!root) return;
      _st.view = 'home'; _st.hrTab = 'onboard';
      _st.mgrAuth = false; _st.admAuth = false;
      _st.applicant = null; _st.viewTarget = null;
      _render();
    }
  };
})();
