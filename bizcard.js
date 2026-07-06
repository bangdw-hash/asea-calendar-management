/* ═══════════════════════════════════════════════════════════════
   bizcard.js — 명함 신청 시스템
   BizcardModule: 신청자 / 관리자 / 인쇄업체 3자 워크플로우
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Storage keys ─────────────────────────────────────────── */
  var SK = {
    requests : 'asea_bizcard_requests',
    settings : 'asea_bizcard_settings',
    staffList: 'asea_bizcard_staff_session',
  };

  /* ── Fixed school info (never changes) ────────────────────── */
  var FIXED = {
    schoolKo: '아세아항공직업전문학교',
    schoolEn: 'ASEA AVIATION Occupational Training College',
    campus: [
      { ko: '영등포캠퍼스', addr: '서울특별시 영등포구 당산로 32길 16',
        en: '16, Dangsan-ro 32-gil, Yeongdeungpo-gu, Seoul, Korea' },
      { ko: '용산캠퍼스',   addr: '서울특별시 용산구 청파로 43다길 30',
        en: '30, Cheongpa-ro 43da-gil, Yongsan-gu, Seoul, Korea' },
      { ko: '이천캠퍼스',   addr: '경기도 이천시 율면 임오산로 362길 74-1',
        en: '74-1, Imosan-ro 362-gil, Yul-myeon, Icheon-city, Korea' },
    ],
  };

  var STATUS = {
    pending  : { label: '대기',   cls: 'bc-chip-pending'   },
    reviewing: { label: '검토중', cls: 'bc-chip-reviewing' },
    approved : { label: '승인',   cls: 'bc-chip-approved'  },
    rejected : { label: '반려',   cls: 'bc-chip-rejected'  },
  };

  var REASON_LABELS = { new:'신규입사', reorder:'명함소진', update:'내용수정', other:'기타' };

  /* ── Module state ─────────────────────────────────────────── */
  var _view      = 'home';     // current sub-view
  var _selStaff  = null;       // selected staff from AI parse
  var _staffList = [];         // parsed staff list (session)
  var _activeId  = null;       // manager: selected request id
  var _filter    = 'all';      // manager: status filter
  var _editForm  = null;       // current editing request (copy)

  /* ── Data helpers ─────────────────────────────────────────── */
  function loadRequests() {
    try { return JSON.parse(localStorage.getItem(SK.requests) || '[]'); } catch(e) { return []; }
  }
  function saveRequests(list) {
    localStorage.setItem(SK.requests, JSON.stringify(list));
  }
  function loadSettings() {
    var def = {
      round: 1, deadline: '', pearlPrice: 0, standardPrice: 0,
      printerName: '', printerContact: '', printerAccount: '', printerNote: '',
    };
    try {
      return Object.assign(def, JSON.parse(localStorage.getItem(SK.settings) || '{}'));
    } catch(e) { return def; }
  }
  function saveSettings(s) {
    localStorage.setItem(SK.settings, JSON.stringify(s));
  }

  function myEmail() {
    return localStorage.getItem('asea_user_email') || '';
  }
  function isManager() {
    try {
      if (window.AdminModule && AdminModule.isManager) return AdminModule.isManager();
    } catch(e) {}
    try {
      var roles = JSON.parse(localStorage.getItem('asea_user_roles') || '{}');
      var email = myEmail().toLowerCase();
      var r = roles[email];
      return r === 'admin' || r === 'manager';
    } catch(e) { return false; }
  }

  function genId() { return 'bc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.getFullYear() + '.' + pad2(d.getMonth()+1) + '.' + pad2(d.getDate());
  }
  function pad2(n) { return n < 10 ? '0'+n : ''+n; }
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function num(s) { return parseInt(s, 10) || 0; }
  function fmtMoney(n) {
    return n ? n.toLocaleString('ko-KR') + '원' : '—';
  }

  function countByStatus(list) {
    var c = { all: list.length, pending:0, reviewing:0, approved:0, rejected:0 };
    list.forEach(function(r){ c[r.status] = (c[r.status]||0)+1; });
    return c;
  }

  /* ── Root element ─────────────────────────────────────────── */
  function root() { return document.getElementById('bizcard-root'); }
  function q(sel)  { return root() ? root().querySelector(sel) : null; }
  function qAll(sel) { return root() ? root().querySelectorAll(sel) : []; }

  /* ══════════════════════════════════════════════════════════
     MAIN ENTRY
     ══════════════════════════════════════════════════════════ */
  function onTabOpen() {
    var el = root();
    if (!el) return;
    _view = isManager() ? 'mgr-list' : 'home';
    render();
  }

  function render() {
    var el = root();
    if (!el) return;
    el.innerHTML = renderUnified();
    bind();
  }

  /* ══════════════════════════════════════════════════════════
     UNIFIED RENDER — applicant tabs always visible;
     manager tabs shown only when isManager()
     ══════════════════════════════════════════════════════════ */
  function renderUnified() {
    var myReqs = loadRequests().filter(function(r){ return r.submittedBy === myEmail(); });
    var myPendingCount = myReqs.filter(function(r){ return r.status === 'pending'; }).length;

    var isMgr = isManager();
    var all = isMgr ? loadRequests() : [];
    var counts = isMgr ? countByStatus(all) : {};
    var pendingBadge  = (isMgr && counts.pending)   ? '<span class="bc-nav-badge">'        + counts.pending   + '</span>' : '';
    var reviewBadge   = (isMgr && counts.reviewing) ? '<span class="bc-nav-badge yellow">' + counts.reviewing + '</span>' : '';

    /* applicant nav (everyone) */
    var applicantNavActive = _view === 'home' || _view === 'staff-pick' || _view === 'form';
    var myNavActive        = _view === 'my'   || _view === 'edit';
    var nav =
      navBtn('home', '새 신청', applicantNavActive) +
      navBtn('my', '내 신청 내역' + (myPendingCount ? '<span class="bc-nav-badge">' + myPendingCount + '</span>' : ''), myNavActive);

    /* manager nav (managers only) */
    if (isMgr) {
      nav += '<span class="bc-nav-sep"></span>' +
        navBtn('mgr-list',     '신청 목록' + pendingBadge + reviewBadge, _view === 'mgr-list') +
        navBtn('mgr-settings', '설정·단가',  _view === 'mgr-settings') +
        navBtn('mgr-order',    '발주 문서',  _view === 'mgr-order');
    }

    /* content */
    var content = '';
    if      (_view === 'staff-pick')    content = renderStaffPicker();
    else if (_view === 'form')          content = renderForm();
    else if (_view === 'my')            content = renderMySubmissions();
    else if (_view === 'edit')          content = renderFormEdit();
    else if (_view === 'mgr-settings')  content = renderMgrSettings();
    else if (_view === 'mgr-order')     content = renderMgrOrder();
    else if (_view === 'mgr-list')      content = renderMgrList();
    else                                content = renderApplicantHome();

    var isMgrView = _view === 'mgr-list' || _view === 'mgr-settings' || _view === 'mgr-order';

    return '<div class="bc-root">' +
      '<nav class="bc-nav">' + nav + '</nav>' +
      (isMgrView
        ? content  /* manager views handle their own layout wrapper */
        : '<div class="bc-content">' + content + '</div>'
      ) +
    '</div>';
  }

  function navBtn(view, label, active) {
    return '<button class="bc-nav-btn' + (active ? ' active' : '') + '" data-bcview="' + view + '">' + label + '</button>';
  }

  /* ── Home (start page) ────────────────────────────────────── */
  function renderApplicantHome() {
    var sett = loadSettings();
    var deadlineBanner = sett.deadline
      ? '<div class="bc-banner info"><span class="bc-banner-icon">📅</span><div>' +
          '이번 회차 신청 마감: <strong>' + fmtDate(sett.deadline) + '</strong>' +
          (sett.round ? ' · ' + sett.round + '회차' : '') +
        '</div></div>'
      : '';

    return deadlineBanner +
      '<div class="bc-page-title">명함 신청</div>' +
      '<p class="bc-page-sub">엑셀 명단에서 본인을 선택하거나 직접 정보를 입력하여 명함을 신청하세요.</p>' +

      '<div class="bc-card">' +
        '<div class="bc-card-head"><span class="bc-card-title">📋 신청 방법</span></div>' +
        '<div class="bc-card-body">' +
          '<div style="display:flex;flex-direction:column;gap:12px;">' +
            stepItem('1', 'CSV 파일 업로드 또는 Excel 데이터 붙여넣기', '교직원 명단 파일을 업로드하면 AI가 자동으로 인식합니다.') +
            stepItem('2', '대상자 선택', '파싱된 목록에서 본인을 선택하면 기초정보가 자동 입력됩니다.') +
            stepItem('3', '추가 정보 확인·입력 후 제출', '앞면(한글)·뒷면(영문) 내용을 확인하고 제출합니다.') +
          '</div>' +
          '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--color-border)">' +
            '<button class="btn btn-ghost btn-sm" data-bcview="home" data-bcaction="direct-form">직접 입력으로 신청</button>' +
            '<button class="btn btn-primary" data-bcview="staff-pick">직원 명단에서 선택 →</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function stepItem(num, title, desc) {
    return '<div style="display:flex;gap:12px;align-items:flex-start">' +
      '<div style="width:26px;height:26px;border-radius:50%;background:var(--color-accent);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + num + '</div>' +
      '<div><div style="font-size:13px;font-weight:600;color:var(--color-text);margin-bottom:2px">' + esc(title) + '</div>' +
      '<div style="font-size:12px;color:var(--color-text-secondary)">' + esc(desc) + '</div></div></div>';
  }

  /* ── Staff Picker ─────────────────────────────────────────── */
  function renderStaffPicker() {
    var listHtml = '';
    if (_staffList.length) {
      listHtml = '<div style="margin-top:16px">' +
        '<div style="font-size:12px;font-weight:600;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">' +
          '파싱 결과 — ' + _staffList.length + '명 인식됨' +
        '</div>' +
        '<div class="bc-staff-list">' +
        _staffList.map(function(s, i) {
          var selected = _selStaff && _selStaff._idx === i;
          var initial = (s.nameKo || s.nameEn || '?').charAt(0);
          return '<div class="bc-staff-item' + (selected ? ' selected' : '') + '" data-bcaction="pick-staff" data-idx="' + i + '">' +
            '<div class="bc-staff-avatar">' + esc(initial) + '</div>' +
            '<div>' +
              '<div class="bc-staff-name">' + esc(s.nameKo || s.nameEn || '(이름 없음)') + '</div>' +
              '<div class="bc-staff-dept">' + esc([s.dept, s.position].filter(Boolean).join(' · ')) + '</div>' +
            '</div>' +
            (selected ? '<div class="bc-staff-check">✓</div>' : '') +
          '</div>';
        }).join('') +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">' +
          '<button class="btn btn-ghost btn-sm" data-bcaction="clear-staff">다시 업로드</button>' +
          (_selStaff
            ? '<button class="btn btn-primary" data-bcview="form">이 정보로 신청서 작성 →</button>'
            : '<span style="font-size:12px;color:var(--color-text-secondary);align-self:center;">위에서 본인을 선택하세요</span>'
          ) +
        '</div>' +
      '</div>';
    }

    return '<div class="bc-page-title">직원 명단 불러오기</div>' +
      '<p class="bc-page-sub">CSV 파일을 업로드하거나 Excel에서 복사한 데이터를 붙여넣으면 AI가 정보를 자동으로 인식합니다.</p>' +

      '<div class="bc-card">' +
        '<div class="bc-card-head"><span class="bc-card-title">📂 CSV 파일 업로드</span>' +
          '<span class="bc-card-sub">Excel에서 다른 이름으로 저장 → CSV 형식</span>' +
        '</div>' +
        '<div class="bc-card-body">' +
          '<div class="bc-upload-area" id="bc-drop-zone">' +
            '<input type="file" id="bc-file-input" accept=".csv,.txt,.tsv">' +
            '<div class="bc-upload-icon">📂</div>' +
            '<div class="bc-upload-title">CSV 파일을 끌어다 놓거나 클릭하여 선택</div>' +
            '<div class="bc-upload-desc">.csv, .txt 파일 지원 · Excel은 "파일 → 다른 이름으로 저장 → CSV"</div>' +
          '</div>' +

          '<div class="bc-or-divider">또는</div>' +

          '<div style="font-size:12px;font-weight:600;color:var(--color-text-secondary);margin-bottom:6px">' +
            'Excel에서 복사 붙여넣기' +
          '</div>' +
          '<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:6px">' +
            'Excel에서 전체 데이터를 Ctrl+A → Ctrl+C 후 아래에 붙여넣으세요.' +
          '</div>' +
          '<textarea class="bc-paste-box" id="bc-paste-area" placeholder="여기에 Excel 데이터를 붙여넣으세요 (Ctrl+V)…"></textarea>' +
          '<div style="display:flex;justify-content:flex-end;margin-top:8px">' +
            '<button class="btn btn-primary btn-sm" id="bc-parse-btn">AI로 분석하기 →</button>' +
          '</div>' +
          listHtml +
        '</div>' +
      '</div>' +

      '<div style="text-align:center;margin-top:8px">' +
        '<button class="btn btn-ghost btn-sm" data-bcaction="direct-form">직접 입력으로 신청하기</button>' +
      '</div>';
  }

  /* ── Application Form ─────────────────────────────────────── */
  function renderForm(isEditMode) {
    var data = _editForm || (_selStaff ? Object.assign({}, _selStaff) : {});
    var sett = loadSettings();
    var ai = !isEditMode && !!_selStaff;

    function field(id, label, val, opts) {
      opts = opts || {};
      var isAI = ai && val;
      var cls = 'bc-input' + (isAI ? ' ai-filled' : '') + (opts.fixed ? ' bc-fixed' : '');
      var inputEl;
      if (opts.fixed) {
        inputEl = '<input class="' + cls + '" value="' + esc(val) + '" disabled>';
      } else {
        inputEl = '<input class="' + cls + '" id="bcf-' + id + '" name="' + id + '"' +
          ' value="' + esc(val || '') + '"' +
          (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
          (opts.required ? ' required' : '') + '>';
      }
      return '<div class="' + (opts.full ? 'full ' : '') + 'bc-form-field" style="display:flex;flex-direction:column;gap:4px;">' +
        '<label class="bc-form-label" for="bcf-' + id + '">' + label +
          (opts.required ? '<span class="required">*</span>' : '') +
          (opts.fixed ? '<span class="fixed-tag">고정</span>' : '') +
          (isAI ? '<span style="font-size:10px;color:var(--color-success);margin-left:5px;font-weight:600">AI 자동입력</span>' : '') +
        '</label>' + inputEl + '</div>';
    }

    var reasonVal = data.reason || 'new';
    var paperVal  = data.paperType || 'standard';
    var qtyVal    = data.quantity || 200;
    var logoVal   = typeof data.logoWanted !== 'undefined' ? data.logoWanted : true;

    var priceInfo = '';
    if (sett.pearlPrice || sett.standardPrice) {
      var p = paperVal === 'pearl' ? sett.pearlPrice : sett.standardPrice;
      if (p) priceInfo = '<div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px">' +
        '예상 금액: <strong>' + fmtMoney(Math.ceil(qtyVal/200) * p) + '</strong> (VAT 별도)</div>';
    }

    return '<div class="bc-page-title">' + (isEditMode ? '신청 내용 수정' : '명함 신청서 작성') + '</div>' +
      (ai ? '<div class="bc-banner success"><span class="bc-banner-icon">✨</span>' +
        esc((data.nameKo || '') + '님의 정보가 자동으로 입력되었습니다. 내용을 확인 후 제출해주세요.' +
            (data._unmatched && data._unmatched.length ? ' 일부 항목은 직접 입력이 필요합니다.' : '')) +
      '</div>' : '') +

      '<form id="bc-app-form">' +

      /* ── 신청 기본 정보 ── */
      '<div class="bc-card" style="margin-bottom:14px">' +
        '<div class="bc-card-head"><span class="bc-card-title">📝 신청 기본 정보</span></div>' +
        '<div class="bc-card-body">' +
          '<div class="bc-form-grid">' +
            '<div style="display:flex;flex-direction:column;gap:4px;">' +
              '<label class="bc-form-label">제작 요청 사유<span class="required">*</span></label>' +
              '<select class="bc-select" id="bcf-reason">' +
                Object.entries(REASON_LABELS).map(function(e){
                  return '<option value="'+e[0]+'"'+(reasonVal===e[0]?' selected':'')+'>'+e[1]+'</option>';
                }).join('') +
              '</select>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:4px;">' +
              '<label class="bc-form-label">수량<span class="required">*</span></label>' +
              '<input class="bc-input" id="bcf-quantity" type="number" min="200" step="100" value="' + qtyVal + '" required>' +
              '<div style="font-size:11px;color:var(--color-text-secondary)">최소 200매 · 100매 단위</div>' +
            '</div>' +
            '<div class="full" style="display:flex;flex-direction:column;gap:4px;">' +
              '<label class="bc-form-label">용지 선택<span class="required">*</span></label>' +
              '<div class="bc-paper-grid">' +
                paperOption('pearl', '임원용 (펄지)', '유광 펄 코팅 · 고급 용지', paperVal) +
                paperOption('standard', '일반 직원용 (모조지)', '무광 코팅 · 스탠다드', paperVal) +
              '</div>' +
              priceInfo +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* ── 한글 앞면 ── */
      '<div class="bc-card" style="margin-bottom:14px">' +
        '<div class="bc-card-head">' +
          '<div class="bc-side-badge front">앞면</div>' +
          '<span class="bc-card-title">한글 명함 앞면</span>' +
        '</div>' +
        '<div class="bc-card-body">' +
          '<div class="bc-form-grid">' +
            field('nameKo',   '성명 (한글)',   data.nameKo,   {required:true, placeholder:'홍 길 동'}) +
            field('dept',     '소속 부서',     data.dept,     {required:true, placeholder:'기획처'}) +
            field('position', '직급',          data.position, {required:true, placeholder:'과장'}) +
            field('division', '부설기관명',    data.division, {placeholder:'예: 아세아기종교육원'}) +
            field('mobile',   'Mobile',        data.mobile,   {placeholder:'010-0000-0000'}) +
            field('tel',      'Tel (내선)',    data.tel,      {placeholder:'02-000-0000'}) +
            field('fax',      'Fax',           data.fax,      {placeholder:'02-000-0000'}) +
            field('email',    'E-mail',        data.email,    {required:true, placeholder:'xxxx@asea.or.kr'}) +
            field('schoolKo', '학교명',        FIXED.schoolKo,{fixed:true, full:true}) +
          '</div>' +
        '</div>' +
      '</div>' +

      /* ── 영문 뒷면 ── */
      '<div class="bc-card" style="margin-bottom:14px">' +
        '<div class="bc-card-head">' +
          '<div class="bc-side-badge back">뒷면</div>' +
          '<span class="bc-card-title">영문 명함 뒷면</span>' +
        '</div>' +
        '<div class="bc-card-body">' +
          '<div class="bc-form-grid">' +
            field('nameEn',     'Name (영문)',     data.nameEn,     {required:true, placeholder:'Gildong, Hong'}) +
            field('deptEn',     'Department (영문)', data.deptEn,   {placeholder:'Planning'}) +
            field('positionEn', 'Position (영문)', data.positionEn, {placeholder:'Manager'}) +
            field('divisionEn', 'Division (영문)', data.divisionEn, {placeholder:'ASEA Maintenance Training Center'}) +
            field('mobileEn',   'Mobile',          data.mobileEn,   {placeholder:'82-10-0000-0000'}) +
            field('telEn',      'Tel',             data.telEn,      {placeholder:'82-2-000-000-0000'}) +
            field('faxEn',      'Fax',             data.faxEn,      {placeholder:'82-2-000-000-0000'}) +
            field('emailEn',    'E-mail',          data.emailEn || data.email, {placeholder:'xxxx@asea.or.kr'}) +
            field('schoolEn',   'School Name',     FIXED.schoolEn,  {fixed:true, full:true}) +
            '<div class="full" style="display:flex;flex-direction:column;gap:4px;">' +
              '<label class="bc-form-label">영문 뒷면 로고 인쇄</label>' +
              '<div style="display:flex;gap:16px;">' +
                radioOpt('logoWanted', 'yes', '희망', logoVal === true || logoVal === 'yes') +
                radioOpt('logoWanted', 'no',  '비희망', logoVal === false || logoVal === 'no') +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* ── Actions ── */
      '<div class="bc-form-actions">' +
        '<button type="button" class="btn btn-ghost" data-bcaction="cancel-form">취소</button>' +
        '<button type="submit" class="btn btn-primary">' + (isEditMode ? '수정 저장' : '신청 제출') + '</button>' +
      '</div>' +

      '</form>';
  }

  function renderFormEdit() {
    return renderForm(true);
  }

  function paperOption(val, name, desc, selected) {
    return '<label class="bc-paper-option' + (selected===val?' selected':'') + '" data-paper="'+val+'">' +
      '<input type="radio" name="paperType" value="'+val+'"' + (selected===val?' checked':'') + '>' +
      '<div class="bc-paper-name">'+esc(name)+'</div>' +
      '<div class="bc-paper-desc">'+esc(desc)+'</div>' +
      '<div class="bc-paper-mark">✓</div>' +
    '</label>';
  }

  function radioOpt(name, val, label, checked) {
    return '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;color:var(--color-text)">' +
      '<input type="radio" name="'+name+'" value="'+val+'"'+(checked?' checked':'')+' style="accent-color:var(--color-accent)">' +
      label + '</label>';
  }

  /* ── My Submissions ───────────────────────────────────────── */
  function renderMySubmissions() {
    var reqs = loadRequests().filter(function(r){ return r.submittedBy === myEmail(); });
    reqs.sort(function(a,b){ return new Date(b.createdAt)-new Date(a.createdAt); });

    if (!reqs.length) {
      return '<div class="bc-empty"><div class="bc-empty-icon">📭</div>' +
        '<div class="bc-empty-title">신청 내역이 없습니다</div>' +
        '<div class="bc-empty-desc">명함 신청을 하면 여기에 표시됩니다.</div>' +
        '<button class="btn btn-primary" style="margin-top:8px" data-bcview="home">새 신청하기</button>' +
        '</div>';
    }

    return '<div class="bc-page-title">내 신청 내역</div>' +
      '<p class="bc-page-sub">대기 상태의 신청은 수정하거나 취소할 수 있습니다.</p>' +
      '<div class="bc-req-list">' +
      reqs.map(function(r) {
        var st = STATUS[r.status] || STATUS.pending;
        var canEdit = r.status === 'pending';
        return '<div class="bc-req-item" data-bcaction="view-my" data-id="'+r.id+'">' +
          '<div>' +
            '<div class="bc-req-name">' + esc(r.nameKo || r.nameEn || '이름 없음') + '</div>' +
            '<div class="bc-req-meta">' +
              esc(REASON_LABELS[r.reason]||r.reason||'') + ' · ' +
              (r.paperType==='pearl'?'펄지':'모조지') + ' · ' + (r.quantity||200) + '매' +
              (r.rejectionReason ? ' · 반려 사유: ' + r.rejectionReason : '') +
            '</div>' +
          '</div>' +
          '<div class="bc-req-right">' +
            '<span class="bc-chip ' + st.cls + '">' + st.label + '</span>' +
            '<span class="bc-req-date">' + fmtDate(r.createdAt) + '</span>' +
            (canEdit
              ? '<button class="btn btn-ghost btn-sm" data-bcaction="edit-my" data-id="'+r.id+'">수정</button>' +
                '<button class="btn btn-ghost btn-sm" style="color:var(--color-error)" data-bcaction="cancel-req" data-id="'+r.id+'">취소</button>'
              : ''
            ) +
          '</div>' +
        '</div>';
      }).join('') +
      '</div>';
  }

  /* ══════════════════════════════════════════════════════════
     MANAGER SIDE (content only — nav rendered by renderUnified)
     ══════════════════════════════════════════════════════════ */

  /* ── Manager: List ────────────────────────────────────────── */
  function renderMgrList() {
    var all = loadRequests();
    var counts = countByStatus(all);
    var filtered = _filter === 'all' ? all : all.filter(function(r){ return r.status === _filter; });
    filtered.sort(function(a,b){ return new Date(b.createdAt)-new Date(a.createdAt); });

    var filterBtns = [
      ['all','전체',counts.all],['pending','대기',counts.pending],
      ['reviewing','검토중',counts.reviewing],['approved','승인',counts.approved],
      ['rejected','반려',counts.rejected],
    ].map(function(f){
      return '<button class="bc-filter-btn'+((_filter===f[0])?' active':'') + '" data-bcaction="filter" data-val="'+f[0]+'">' +
        f[1] + (f[2]?' ('+f[2]+')':'') + '</button>';
    }).join('');

    var sidebarItems = filtered.length
      ? filtered.map(function(r) {
          var st = STATUS[r.status] || STATUS.pending;
          var active = r.id === _activeId;
          return '<div class="bc-sidebar-item'+(active?' active':'') + '" data-bcaction="select-req" data-id="'+r.id+'">' +
            '<div class="bc-sidebar-item-row">' +
              '<span class="bc-sidebar-item-name">' + esc(r.nameKo||r.nameEn||'이름없음') + '</span>' +
              '<span class="bc-chip ' + st.cls + '">' + st.label + '</span>' +
            '</div>' +
            '<div class="bc-sidebar-item-meta">' +
              esc(r.dept||'') + (r.dept&&r.position?' · ':'') + esc(r.position||'') + ' · ' + fmtDate(r.createdAt) +
            '</div>' +
          '</div>';
        }).join('')
      : '<div class="bc-empty" style="padding:24px"><div class="bc-empty-icon">📭</div><div class="bc-empty-title">해당 신청이 없습니다</div></div>';

    var detailPanel = _activeId
      ? renderMgrDetail(_activeId)
      : '<div class="bc-detail-empty"><div class="bc-detail-icon">👈</div><div>왼쪽 목록에서 신청을 선택하세요</div></div>';

    return '<div style="padding:12px 16px 0;background:var(--color-card);border-bottom:1px solid var(--color-border)">' +
        '<div class="bc-stats">' +
          statBox('전체', counts.all, false) +
          statBox('대기', counts.pending, false) +
          statBox('검토중', counts.reviewing, true) +
          statBox('승인', counts.approved, false) +
        '</div>' +
        '<div class="bc-filter-bar">' + filterBtns + '</div>' +
      '</div>' +
      '<div class="bc-mgr-layout" style="flex:1;overflow:hidden">' +
        '<div class="bc-mgr-sidebar">' + sidebarItems + '</div>' +
        '<div class="bc-mgr-detail">' + detailPanel + '</div>' +
      '</div>';
  }

  function statBox(label, num, accent) {
    return '<div class="bc-stat">' +
      '<div class="bc-stat-num'+(accent?' accent':'')+'">' + num + '</div>' +
      '<div class="bc-stat-lbl">' + label + '</div>' +
    '</div>';
  }

  /* ── Manager: Detail (edit + approve/reject) ──────────────── */
  function renderMgrDetail(id) {
    var req = loadRequests().find(function(r){ return r.id === id; });
    if (!req) return '<div class="bc-detail-empty"><div>신청을 찾을 수 없습니다</div></div>';

    var st = STATUS[req.status] || STATUS.pending;
    var canEdit = req.status !== 'approved';
    var edited   = req.editedFields || [];

    function mgrField(id, label, val, opts) {
      opts = opts || {};
      var wasEdited = edited.indexOf(id) !== -1;
      var cls = 'bc-input' + (wasEdited ? ' bc-mgr-edited' : '') + (opts.fixed ? ' bc-fixed' : '');
      var inputEl = opts.fixed
        ? '<input class="' + cls + '" value="' + esc(val) + '" disabled>'
        : '<input class="' + cls + '" id="bcm-' + id + '" name="' + id + '" value="' + esc(val||'') + '"' + (!canEdit ? ' disabled' : '') + '>';
      return '<div style="display:flex;flex-direction:column;gap:4px;">' +
        '<label class="bc-form-label">' + label +
          (wasEdited ? '<span style="font-size:10px;color:#C8861E;margin-left:5px;font-weight:600">관리자 수정됨</span>' : '') +
          (opts.fixed ? '<span class="fixed-tag">고정</span>' : '') +
        '</label>' + inputEl + '</div>';
    }

    var statusBtns = '';
    if (req.status === 'pending' || req.status === 'reviewing') {
      statusBtns =
        '<button class="btn btn-primary btn-sm" data-bcaction="mgr-approve" data-id="'+id+'">승인</button>' +
        '<button class="btn btn-ghost btn-sm" style="color:var(--color-error);border-color:var(--color-error)" data-bcaction="mgr-reject" data-id="'+id+'">반려</button>';
      if (req.status === 'pending') {
        statusBtns = '<button class="btn btn-ghost btn-sm" data-bcaction="mgr-reviewing" data-id="'+id+'">검토 시작</button>' + statusBtns;
      }
    }
    if (req.status === 'rejected') {
      statusBtns = '<button class="btn btn-ghost btn-sm" data-bcaction="mgr-restore" data-id="'+id+'">대기로 복구</button>';
    }

    var rejectBox = req.rejectionReason
      ? '<div class="bc-reject-box">반려 사유: ' + esc(req.rejectionReason) + '</div>' : '';

    return '<div class="bc-detail-header">' +
      '<div>' +
        '<div class="bc-detail-name">' + esc(req.nameKo||req.nameEn||'이름 없음') + '</div>' +
        '<div class="bc-detail-meta">' +
          esc(req.submittedBy) + ' · ' + fmtDate(req.createdAt) +
          (req.editedByManager ? ' · <span style="color:#C8861E">관리자 수정 있음</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="bc-detail-actions">' +
        '<span class="bc-chip ' + st.cls + '">' + st.label + '</span>' +
        statusBtns +
      '</div>' +
    '</div>' +
    rejectBox +

    '<form id="bc-mgr-form" data-id="'+id+'">' +

    /* Basic info */
    '<div class="bc-card" style="margin-bottom:12px">' +
      '<div class="bc-card-head"><span class="bc-card-title">신청 기본 정보</span></div>' +
      '<div class="bc-card-body">' +
        '<div class="bc-form-grid">' +
          '<div style="display:flex;flex-direction:column;gap:4px;">' +
            '<label class="bc-form-label">제작 사유</label>' +
            '<select class="bc-select" id="bcm-reason"' + (!canEdit?' disabled':'') + '>' +
              Object.entries(REASON_LABELS).map(function(e){
                return '<option value="'+e[0]+'"'+(req.reason===e[0]?' selected':'')+'>'+e[1]+'</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:4px;">' +
            '<label class="bc-form-label">수량</label>' +
            '<input class="bc-input" id="bcm-quantity" type="number" min="200" step="100" value="'+(req.quantity||200)+'"'+(!canEdit?' disabled':'')+'>'+
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:4px;">' +
            '<label class="bc-form-label">용지</label>' +
            '<select class="bc-select" id="bcm-paperType"'+(!canEdit?' disabled':'')+'>' +
              '<option value="standard"'+(req.paperType==='standard'?' selected':'')+'>일반 직원용 (모조지)</option>' +
              '<option value="pearl"'+(req.paperType==='pearl'?' selected':'')+'>임원용 (펄지)</option>' +
            '</select>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:4px;">' +
            '<label class="bc-form-label">신청자 이메일</label>' +
            '<input class="bc-input bc-fixed" value="'+esc(req.submittedBy)+'" disabled>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    /* Front */
    '<div class="bc-card" style="margin-bottom:12px">' +
      '<div class="bc-card-head"><div class="bc-side-badge front">앞면</div><span class="bc-card-title">한글 앞면</span></div>' +
      '<div class="bc-card-body"><div class="bc-form-grid">' +
        mgrField('nameKo',  '성명',       req.nameKo) +
        mgrField('dept',    '소속',       req.dept) +
        mgrField('position','직급',       req.position) +
        mgrField('division','부설기관',   req.division) +
        mgrField('mobile',  'Mobile',     req.mobile) +
        mgrField('tel',     'Tel',        req.tel) +
        mgrField('fax',     'Fax',        req.fax) +
        mgrField('email',   'E-mail',     req.email) +
        mgrField('schoolKo','학교명',     FIXED.schoolKo, {fixed:true}) +
      '</div></div>' +
    '</div>' +

    /* Back */
    '<div class="bc-card" style="margin-bottom:12px">' +
      '<div class="bc-card-head"><div class="bc-side-badge back">뒷면</div><span class="bc-card-title">영문 뒷면</span></div>' +
      '<div class="bc-card-body"><div class="bc-form-grid">' +
        mgrField('nameEn',    'Name (EN)',     req.nameEn) +
        mgrField('deptEn',    'Dept (EN)',     req.deptEn) +
        mgrField('positionEn','Position (EN)', req.positionEn) +
        mgrField('divisionEn','Division (EN)', req.divisionEn) +
        mgrField('mobileEn',  'Mobile',        req.mobileEn) +
        mgrField('telEn',     'Tel',           req.telEn) +
        mgrField('faxEn',     'Fax',           req.faxEn) +
        mgrField('emailEn',   'E-mail',        req.emailEn) +
        mgrField('schoolEn',  'School (EN)',   FIXED.schoolEn, {fixed:true}) +
        '<div style="display:flex;flex-direction:column;gap:4px;">' +
          '<label class="bc-form-label">로고 인쇄</label>' +
          '<select class="bc-select" id="bcm-logoWanted"'+(!canEdit?' disabled':'')+'>' +
            '<option value="yes"'+(req.logoWanted!==false?' selected':'')+'>희망</option>' +
            '<option value="no"'+(req.logoWanted===false?' selected':'')+'>비희망</option>' +
          '</select>' +
        '</div>' +
      '</div></div>' +
    '</div>' +

    /* Manager note */
    '<div class="bc-card" style="margin-bottom:12px">' +
      '<div class="bc-card-head"><span class="bc-card-title">관리자 메모</span></div>' +
      '<div class="bc-card-body">' +
        '<textarea class="bc-textarea" id="bcm-managerNote"'+(!canEdit?' disabled':'')+' placeholder="인쇄업체에 전달할 특이사항 등">' + esc(req.managerNote||'') + '</textarea>' +
      '</div>' +
    '</div>' +

    (canEdit
      ? '<div class="bc-form-actions">' +
          '<button type="submit" class="btn btn-primary">내용 저장</button>' +
        '</div>'
      : '') +

    '</form>';
  }

  /* ── Manager: Settings ────────────────────────────────────── */
  function renderMgrSettings() {
    var s = loadSettings();
    var all = loadRequests();
    var approved = all.filter(function(r){ return r.status === 'approved'; });
    var pearlQty  = approved.filter(function(r){ return r.paperType==='pearl'; }).reduce(function(a,r){ return a+(r.quantity||200); }, 0);
    var stdQty    = approved.filter(function(r){ return r.paperType!=='pearl'; }).reduce(function(a,r){ return a+(r.quantity||200); }, 0);
    var pearlAmt  = Math.ceil(pearlQty/200) * (s.pearlPrice||0);
    var stdAmt    = Math.ceil(stdQty/200)   * (s.standardPrice||0);
    var total     = pearlAmt + stdAmt;
    var vat       = Math.round(total * 0.1);

    return '<div class="bc-content">' +
      '<div class="bc-page-title">설정 · 단가 관리</div>' +
      '<p class="bc-page-sub">단가 설정 후 저장하면 견적이 자동으로 산출됩니다.</p>' +
      '<form id="bc-sett-form">' +

      '<div class="bc-card" style="margin-bottom:14px">' +
        '<div class="bc-card-head"><span class="bc-card-title">📅 신청 회차 · 기한</span></div>' +
        '<div class="bc-card-body"><div class="bc-settings-grid">' +
          settField('s-round',    '회차',     'number', s.round||1,     {min:1}) +
          settField('s-deadline', '신청 마감일', 'date',   s.deadline||'', {}) +
        '</div></div>' +
      '</div>' +

      '<div class="bc-card" style="margin-bottom:14px">' +
        '<div class="bc-card-head"><span class="bc-card-title">💰 용지별 단가 (200매 기준)</span></div>' +
        '<div class="bc-card-body"><div class="bc-settings-grid">' +
          settField('s-pearlPrice',    '임원용 (펄지) 단가',     'number', s.pearlPrice||'',    {placeholder:'예: 45000'}) +
          settField('s-standardPrice', '일반 직원용 (모조지) 단가', 'number', s.standardPrice||'', {placeholder:'예: 28000'}) +
        '</div></div>' +
      '</div>' +

      '<div class="bc-card" style="margin-bottom:14px">' +
        '<div class="bc-card-head"><span class="bc-card-title">🖨 인쇄업체 정보</span></div>' +
        '<div class="bc-card-body"><div class="bc-settings-grid">' +
          settField('s-printerName',    '업체명',    'text', s.printerName||'',    {full:false, placeholder:'예: ○○인쇄소'}) +
          settField('s-printerContact', '연락처',    'text', s.printerContact||'', {full:false, placeholder:'02-000-0000'}) +
          settField('s-printerAccount', '계좌번호',  'text', s.printerAccount||'', {full:false, placeholder:'은행명 000-000-0000'}) +
          settField('s-printerNote',    '특이사항',  'text', s.printerNote||'',    {full:false, placeholder:'납품 요청사항 등'}) +
        '</div></div>' +
      '</div>' +

      '<div class="bc-card" style="margin-bottom:14px">' +
        '<div class="bc-card-head"><span class="bc-card-title">📊 현재 견적 (승인된 신청 기준)</span></div>' +
        '<div class="bc-card-body">' +
          '<div class="bc-estimate-box">' +
            '<div class="bc-estimate-row"><span>임원용 펄지 ' + pearlQty + '매 ('+Math.ceil(pearlQty/200)+'묶음 × '+fmtMoney(s.pearlPrice)+')</span><span>'+fmtMoney(pearlAmt)+'</span></div>' +
            '<div class="bc-estimate-row"><span>일반 직원용 모조지 ' + stdQty + '매 ('+Math.ceil(stdQty/200)+'묶음 × '+fmtMoney(s.standardPrice)+')</span><span>'+fmtMoney(stdAmt)+'</span></div>' +
            '<div class="bc-estimate-row"><span>소계</span><span>'+fmtMoney(total)+'</span></div>' +
            '<div class="bc-estimate-row"><span>부가세 (VAT 10%)</span><span>'+fmtMoney(vat)+'</span></div>' +
            '<div class="bc-estimate-total"><span>최종 발주 금액</span><span>'+fmtMoney(total+vat)+'</span></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="bc-form-actions"><button type="submit" class="btn btn-primary">설정 저장</button></div>' +
      '</form>' +
    '</div>';
  }

  function settField(id, label, type, val, opts) {
    opts = opts || {};
    return '<div style="display:flex;flex-direction:column;gap:4px;"' + (opts.full?'':' class=""') + '>' +
      '<label class="bc-form-label" for="'+id+'">' + label + '</label>' +
      '<input class="bc-input" id="'+id+'" type="'+type+'" value="'+esc(val)+'"' +
        (opts.min!==undefined?' min="'+opts.min+'"':'') +
        (opts.placeholder?' placeholder="'+esc(opts.placeholder)+'"':'') + '>' +
      '</div>';
  }

  /* ── Manager: Order Document ──────────────────────────────── */
  function renderMgrOrder() {
    var all = loadRequests();
    var approved = all.filter(function(r){ return r.status === 'approved'; });
    var s = loadSettings();

    if (!approved.length) {
      return '<div class="bc-content">' +
        '<div class="bc-empty">' +
          '<div class="bc-empty-icon">📄</div>' +
          '<div class="bc-empty-title">승인된 신청이 없습니다</div>' +
          '<div class="bc-empty-desc">신청을 승인하면 발주 문서가 생성됩니다.</div>' +
        '</div>' +
      '</div>';
    }

    var html = buildOrderDocHTML(approved, s);

    return '<div class="bc-order-toolbar">' +
        '<span class="bc-order-toolbar-title">📄 발주 문서 — 승인 ' + approved.length + '건</span>' +
        '<button class="btn btn-ghost btn-sm" data-bcaction="order-print">🖨 인쇄</button>' +
        '<button class="btn btn-primary btn-sm" data-bcaction="order-newwin">새 창에서 보기 ↗</button>' +
      '</div>' +
      '<iframe id="bc-order-frame" style="width:100%;flex:1;border:none;background:#fff;" srcdoc="' + esc(html) + '"></iframe>';
  }

  function buildOrderDocHTML(reqs, s) {
    var now = new Date();
    var dateStr = now.getFullYear()+'년 '+(now.getMonth()+1)+'월 '+now.getDate()+'일';
    var pearlReqs  = reqs.filter(function(r){ return r.paperType === 'pearl'; });
    var stdReqs    = reqs.filter(function(r){ return r.paperType !== 'pearl'; });
    var pearlQty   = pearlReqs.reduce(function(a,r){ return a+(r.quantity||200); }, 0);
    var stdQty     = stdReqs.reduce(function(a,r){ return a+(r.quantity||200); }, 0);
    var pearlAmt   = Math.ceil(pearlQty/200) * (s.pearlPrice||0);
    var stdAmt     = Math.ceil(stdQty/200)   * (s.standardPrice||0);
    var total      = pearlAmt + stdAmt;
    var vat        = Math.round(total * 0.1);

    function row(r, bg) {
      return '<tr style="background:'+(bg?'#f8f9fb':'#fff')+'">' +
        '<td>'+esc(r.nameKo||'')+'</td>' +
        '<td>'+esc(r.dept||'')+'</td>' +
        '<td>'+esc(r.position||'')+'</td>' +
        '<td>'+(r.paperType==='pearl'?'펄지(임원)':'모조지(직원)')+'</td>' +
        '<td style="text-align:right">'+((r.quantity||200).toLocaleString())+'</td>' +
        '<td>'+esc(r.mobile||'')+'</td>' +
        '<td>'+esc(r.email||'')+'</td>' +
        '<td>'+(r.logoWanted===false?'비희망':'희망')+'</td>' +
        (r.managerNote?'<td>'+esc(r.managerNote)+'</td>':'<td></td>') +
      '</tr>';
    }

    return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">' +
      '<title>명함 발주서 — 아세아항공직업전문학교</title>' +
      '<style>' +
        'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;font-size:13px;color:#202124;padding:32px;max-width:1100px;margin:0 auto}' +
        'h1{font-size:20px;font-weight:700;margin-bottom:4px}' +
        '.sub{font-size:13px;color:#5f6368;margin-bottom:24px}' +
        'table{width:100%;border-collapse:collapse;margin:16px 0}' +
        'th,td{padding:8px 10px;border:1px solid #e8eaed;font-size:12px;text-align:left}' +
        'th{background:#1A73E8;color:#fff;font-weight:600}' +
        '.info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px}' +
        '.info-box{border:1px solid #e8eaed;border-radius:8px;padding:12px 14px}' +
        '.info-label{font-size:11px;color:#5f6368;font-weight:600;text-transform:uppercase;margin-bottom:4px}' +
        '.info-val{font-size:14px;font-weight:600;color:#202124}' +
        '.section-title{font-size:14px;font-weight:600;margin:20px 0 8px;padding-bottom:6px;border-bottom:2px solid #1A73E8}' +
        '.total-box{background:#e8f0fe;border:1px solid #c5d8fb;border-radius:8px;padding:16px;margin-top:16px}' +
        '.total-row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}' +
        '.total-final{font-size:16px;font-weight:700;border-top:1px solid #c5d8fb;padding-top:10px;margin-top:6px}' +
        '.campus-list{font-size:12px;color:#5f6368;line-height:1.6}' +
        '@media print{body{padding:16px}.no-print{display:none}}' +
      '</style></head><body>' +
      '<h1>명함 발주서</h1>' +
      '<div class="sub">아세아항공직업전문학교 · 발주일: ' + dateStr +
        (s.round ? ' · ' + s.round + '회차' : '') +
        (s.deadline ? ' · 마감: ' + fmtDate(s.deadline) : '') +
      '</div>' +
      '<div class="info-grid">' +
        infoBox('발주 기관', FIXED.schoolKo) +
        infoBox('인쇄업체', (s.printerName||'(미등록)') + (s.printerContact?' · '+s.printerContact:'')) +
        infoBox('계좌번호', s.printerAccount||'(미등록)') +
      '</div>' +
      '<div class="campus-list"><strong>캠퍼스 주소 (고정)</strong><br>' +
        FIXED.campus.map(function(c){ return c.ko + ': ' + c.addr; }).join('<br>') +
      '</div>' +

      '<div class="section-title">임원용 (펄지) — ' + pearlReqs.length + '명, ' + pearlQty + '매</div>' +
      (pearlReqs.length
        ? '<table><thead><tr><th>성명</th><th>소속</th><th>직급</th><th>용지</th><th style="text-align:right">수량</th><th>Mobile</th><th>E-mail</th><th>로고</th><th>특이사항</th></tr></thead><tbody>' +
            pearlReqs.map(function(r,i){ return row(r, i%2); }).join('') +
          '</tbody></table>'
        : '<p style="color:#5f6368;font-size:13px">해당 없음</p>') +

      '<div class="section-title">일반 직원용 (모조지) — ' + stdReqs.length + '명, ' + stdQty + '매</div>' +
      (stdReqs.length
        ? '<table><thead><tr><th>성명</th><th>소속</th><th>직급</th><th>용지</th><th style="text-align:right">수량</th><th>Mobile</th><th>E-mail</th><th>로고</th><th>특이사항</th></tr></thead><tbody>' +
            stdReqs.map(function(r,i){ return row(r, i%2); }).join('') +
          '</tbody></table>'
        : '<p style="color:#5f6368;font-size:13px">해당 없음</p>') +

      '<div class="total-box">' +
        '<div class="total-row"><span>임원용 펄지 '+pearlQty+'매 ('+Math.ceil(pearlQty/200)+'묶음 × '+fmtMoney(s.pearlPrice)+')</span><span>'+fmtMoney(pearlAmt)+'</span></div>' +
        '<div class="total-row"><span>일반직원용 모조지 '+stdQty+'매 ('+Math.ceil(stdQty/200)+'묶음 × '+fmtMoney(s.standardPrice)+')</span><span>'+fmtMoney(stdAmt)+'</span></div>' +
        '<div class="total-row total-final"><span>최종 발주 금액 (VAT 10% 포함)</span><span>' + fmtMoney(total+vat) + '</span></div>' +
      '</div>' +

      (s.printerNote ? '<p style="margin-top:16px;font-size:13px;color:#5f6368">특이사항: ' + esc(s.printerNote) + '</p>' : '') +
    '</body></html>';
  }

  function infoBox(label, val) {
    return '<div class="info-box"><div class="info-label">'+label+'</div><div class="info-val">'+esc(val)+'</div></div>';
  }

  /* ══════════════════════════════════════════════════════════
     AI PARSING
     ══════════════════════════════════════════════════════════ */
  function showParsingOverlay() {
    var card = root() ? root().querySelector('.bc-card-body') : null;
    if (!card) return;
    card.innerHTML = '<div class="bc-ai-overlay">' +
      '<div class="bc-ai-spinner"></div>' +
      '<div class="bc-ai-label">AI가 직원 명단을 분석 중입니다…</div>' +
      '<div class="bc-ai-sub">헤더를 자동으로 인식하고 컬럼을 매핑합니다.</div>' +
    '</div>';
  }

  async function parseWithAI(rawText) {
    var cfg = window.getClaudeConfig ? window.getClaudeConfig() : {};
    if (!cfg.apiKey) {
      throw new Error('Claude API 키가 설정되어 있지 않습니다. 설정 > AI 제공자에서 API 키를 입력해주세요.');
    }

    var prompt = '다음은 교직원 명단 데이터입니다. 헤더를 자동으로 인식하여 각 직원의 정보를 JSON 배열로 추출해주세요.\n\n' +
      '반드시 아래 필드명을 사용하고, 값이 없으면 빈 문자열("")로 채우세요:\n' +
      '- nameKo: 한글 성명\n- nameEn: 영문 성명 (없으면 한글 성명을 영문으로 변환 추정)\n' +
      '- dept: 소속 부서\n- position: 직급\n- division: 부설기관명\n' +
      '- mobile: 휴대폰 번호\n- tel: 내선전화\n- fax: 팩스\n- email: 이메일\n' +
      '- deptEn: 부서 영문명\n- positionEn: 직급 영문명\n\n' +
      '매핑하지 못한 컬럼이 있으면 _unmatched 배열에 컬럼명을 담아주세요.\n\n' +
      '응답은 반드시 JSON만: { "staff": [...], "unmatched": [] }\n\n' +
      '---\n' + rawText.slice(0, 6000);

    var res = await window.claudeFetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error('AI API 오류 (' + res.status + ')');
    var data = await res.json();
    var text = (data.content && data.content[0] && data.content[0].text) || '';

    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI 응답을 파싱할 수 없습니다.');
    var parsed = JSON.parse(jsonMatch[0]);
    return parsed.staff || [];
  }

  function parseCSV(text) {
    var lines = text.trim().split(/\r?\n/).filter(function(l){ return l.trim(); });
    if (lines.length < 2) return null;
    var sep = lines[0].indexOf('\t') !== -1 ? '\t' : ',';
    var headers = lines[0].split(sep).map(function(h){ return h.trim().replace(/^"|"$/g,''); });
    return lines.slice(1).map(function(line) {
      var vals = line.split(sep).map(function(v){ return v.trim().replace(/^"|"$/g,''); });
      var obj = {};
      headers.forEach(function(h, i){ obj[h] = vals[i] || ''; });
      return obj;
    });
  }

  /* ══════════════════════════════════════════════════════════
     EVENT BINDING
     ══════════════════════════════════════════════════════════ */
  function bind() {
    var el = root();
    if (!el) return;

    /* ── Nav tabs ── */
    el.querySelectorAll('[data-bcview]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        var v = btn.dataset.bcview;
        var action = btn.dataset.bcaction;

        if (action === 'direct-form') {
          _selStaff = null;
          _editForm = {};
          _view = 'form';
          render(); return;
        }
        _view = v;
        if (v === 'home' || v === 'staff-pick') { _selStaff = null; _editForm = null; }
        render();
      });
    });

    /* ── Action buttons ── */
    el.querySelectorAll('[data-bcaction]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        var action = btn.dataset.bcaction;
        var id = btn.dataset.id;
        var idx = btn.dataset.idx;

        if (action === 'pick-staff') {
          _selStaff = Object.assign({ _idx: parseInt(idx,10) }, _staffList[parseInt(idx,10)]);
          _view = 'staff-pick'; render(); return;
        }
        if (action === 'clear-staff') {
          _staffList = []; _selStaff = null; _view = 'staff-pick'; render(); return;
        }
        if (action === 'cancel-form') {
          _editForm = null;
          _view = (_view === 'edit') ? 'my' : (isManager() ? 'mgr-list' : 'home');
          render(); return;
        }
        if (action === 'view-my' || action === 'edit-my') {
          var req = loadRequests().find(function(r){ return r.id === id; });
          if (!req) return;
          _editForm = Object.assign({}, req);
          _view = 'edit'; render(); return;
        }
        if (action === 'cancel-req') {
          if (!confirm('신청을 취소하시겠습니까?')) return;
          var list = loadRequests();
          list = list.filter(function(r){ return r.id !== id; });
          saveRequests(list);
          _view = 'my'; render(); return;
        }
        if (action === 'filter') {
          _filter = btn.dataset.val; render(); return;
        }
        if (action === 'select-req') {
          _activeId = id; render(); return;
        }
        if (action === 'mgr-approve') {
          updateStatus(id, 'approved'); return;
        }
        if (action === 'mgr-reject') {
          var reason = prompt('반려 사유를 입력하세요:');
          if (reason === null) return;
          var list2 = loadRequests();
          var r2 = list2.find(function(r){ return r.id === id; });
          if (r2) { r2.status = 'rejected'; r2.rejectionReason = reason; r2.updatedAt = new Date().toISOString(); }
          saveRequests(list2); render(); return;
        }
        if (action === 'mgr-reviewing') {
          updateStatus(id, 'reviewing'); return;
        }
        if (action === 'mgr-restore') {
          updateStatus(id, 'pending'); return;
        }
        if (action === 'order-print') {
          var frame = el.querySelector('#bc-order-frame');
          if (frame && frame.contentWindow) frame.contentWindow.print();
          return;
        }
        if (action === 'order-newwin') {
          var all = loadRequests().filter(function(r){ return r.status === 'approved'; });
          var s2 = loadSettings();
          var html2 = buildOrderDocHTML(all, s2);
          var win = window.open('', '_blank');
          if (win) { win.document.write(html2); win.document.close(); }
          return;
        }
      });
    });

    /* ── Paper type toggle ── */
    el.querySelectorAll('.bc-paper-option').forEach(function(opt) {
      opt.addEventListener('click', function() {
        el.querySelectorAll('.bc-paper-option').forEach(function(o){ o.classList.remove('selected'); });
        opt.classList.add('selected');
        var radio = opt.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      });
    });

    /* ── File upload ── */
    var fileInput = el.querySelector('#bc-file-input');
    var dropZone  = el.querySelector('#bc-drop-zone');
    if (fileInput) {
      fileInput.addEventListener('change', function() {
        if (fileInput.files[0]) handleFile(fileInput.files[0]);
      });
    }
    if (dropZone) {
      dropZone.addEventListener('dragover', function(e){ e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', function(){ dropZone.classList.remove('drag-over'); });
      dropZone.addEventListener('drop', function(e){
        e.preventDefault(); dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
      });
    }

    /* ── Paste parse button ── */
    var parseBtn = el.querySelector('#bc-parse-btn');
    if (parseBtn) {
      parseBtn.addEventListener('click', function() {
        var ta = el.querySelector('#bc-paste-area');
        var text = ta ? ta.value.trim() : '';
        if (!text) { alert('붙여넣기 영역에 데이터가 없습니다.'); return; }
        runAIParse(text);
      });
    }

    /* ── Applicant form submit ── */
    var appForm = el.querySelector('#bc-app-form');
    if (appForm) {
      appForm.addEventListener('submit', function(e) {
        e.preventDefault();
        submitApplicantForm();
      });
    }

    /* ── Manager form submit ── */
    var mgrForm = el.querySelector('#bc-mgr-form');
    if (mgrForm) {
      mgrForm.addEventListener('submit', function(e) {
        e.preventDefault();
        saveMgrEdit(mgrForm.dataset.id);
      });
    }

    /* ── Settings form submit ── */
    var settForm = el.querySelector('#bc-sett-form');
    if (settForm) {
      settForm.addEventListener('submit', function(e) {
        e.preventDefault();
        saveSettingsForm();
      });
    }
  }

  /* ── File handler ─────────────────────────────────────────── */
  function handleFile(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var text = e.target.result;
      runAIParse(text);
    };
    reader.readAsText(file, 'utf-8');
  }

  async function runAIParse(text) {
    showParsingOverlay();
    try {
      var list = await parseWithAI(text);
      if (!list.length) {
        var raw = parseCSV(text);
        if (raw && raw.length) list = raw;
      }
      if (!list.length) throw new Error('인식된 직원 데이터가 없습니다.');
      _staffList = list;
      _selStaff = null;
      _view = 'staff-pick';
      render();
    } catch(err) {
      root().querySelector('.bc-card-body').innerHTML =
        '<div class="bc-banner error"><span class="bc-banner-icon">⚠️</span>' +
        '<div><strong>파싱 오류:</strong> ' + esc(err.message) + '<br>' +
        '<button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="BizcardModule._retry()">다시 시도</button></div></div>';
    }
  }

  /* ── Form submission (applicant) ──────────────────────────── */
  function collectForm(prefix) {
    var q2 = function(id){ var el = document.getElementById(prefix+id); return el ? el.value.trim() : ''; };
    var qr = function(name){ var el = root().querySelector('input[name="'+name+'"]:checked'); return el ? el.value : ''; };
    return {
      reason: q2('reason') || qr('reason'),
      paperType: (function(){
        var sel = root().querySelector('.bc-paper-option.selected');
        if (sel) return sel.dataset.paper;
        return q2('paperType') || 'standard';
      }()),
      quantity: Math.max(200, num(q2('quantity'))),
      nameKo: q2('nameKo'), dept: q2('dept'), position: q2('position'),
      division: q2('division'), mobile: q2('mobile'), tel: q2('tel'),
      fax: q2('fax'), email: q2('email'),
      nameEn: q2('nameEn'), deptEn: q2('deptEn'), positionEn: q2('positionEn'),
      divisionEn: q2('divisionEn'), mobileEn: q2('mobileEn'), telEn: q2('telEn'),
      faxEn: q2('faxEn'), emailEn: q2('emailEn'),
      logoWanted: qr('logoWanted') !== 'no',
    };
  }

  function submitApplicantForm() {
    var data = collectForm('bcf-');
    if (!data.nameKo || !data.email) { alert('성명과 이메일은 필수 입력 항목입니다.'); return; }
    if (data.quantity < 200) { alert('최소 주문 수량은 200매입니다.'); return; }

    var list = loadRequests();
    var now = new Date().toISOString();

    if (_editForm && _editForm.id) {
      /* Edit existing */
      var idx = list.findIndex(function(r){ return r.id === _editForm.id; });
      if (idx !== -1) {
        Object.assign(list[idx], data, { updatedAt: now });
        saveRequests(list);
        toast('신청 내용이 수정되었습니다.');
        _editForm = null; _view = 'my'; render(); return;
      }
    }

    /* New submission */
    var sett = loadSettings();
    list.push(Object.assign({
      id: genId(), round: sett.round || 1,
      status: 'pending',
      createdAt: now, updatedAt: now,
      submittedBy: myEmail(),
      submitterName: data.nameKo,
      editedFields: [], editedByManager: false,
      managerNote: '', rejectionReason: '',
    }, data));
    saveRequests(list);
    toast('명함 신청이 완료되었습니다.');
    _selStaff = null; _editForm = null; _view = 'my'; render();
  }

  /* ── Manager: save edit ────────────────────────────────────── */
  function saveMgrEdit(id) {
    var list = loadRequests();
    var req = list.find(function(r){ return r.id === id; });
    if (!req) return;

    var q2 = function(fid){ var el = document.getElementById('bcm-'+fid); return el ? el.value.trim() : undefined; };
    var fields = ['nameKo','dept','position','division','mobile','tel','fax','email',
                  'nameEn','deptEn','positionEn','divisionEn','mobileEn','telEn','faxEn','emailEn',
                  'reason','quantity','paperType','logoWanted','managerNote'];
    var edited = req.editedFields ? req.editedFields.slice() : [];

    fields.forEach(function(f) {
      var val = q2(f);
      if (val === undefined) return;
      if (f === 'quantity') val = Math.max(200, num(val));
      else if (f === 'logoWanted') val = val !== 'no';
      if (String(req[f]) !== String(val)) {
        if (edited.indexOf(f) === -1) edited.push(f);
      }
      req[f] = val;
    });

    req.editedFields = edited;
    req.editedByManager = edited.length > 0;
    req.updatedAt = new Date().toISOString();
    if (req.status === 'pending') req.status = 'reviewing';

    saveRequests(list);
    toast('저장되었습니다.');
    render();
  }

  /* ── Settings save ────────────────────────────────────────── */
  function saveSettingsForm() {
    var q2 = function(id){ var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var s = {
      round:           num(q2('s-round')) || 1,
      deadline:        q2('s-deadline'),
      pearlPrice:      num(q2('s-pearlPrice')),
      standardPrice:   num(q2('s-standardPrice')),
      printerName:     q2('s-printerName'),
      printerContact:  q2('s-printerContact'),
      printerAccount:  q2('s-printerAccount'),
      printerNote:     q2('s-printerNote'),
    };
    saveSettings(s);
    toast('설정이 저장되었습니다.');
    render();
  }

  /* ── Status update ────────────────────────────────────────── */
  function updateStatus(id, status) {
    var list = loadRequests();
    var req = list.find(function(r){ return r.id === id; });
    if (req) { req.status = status; req.updatedAt = new Date().toISOString(); if (status !== 'rejected') req.rejectionReason = ''; }
    saveRequests(list);
    render();
  }

  /* ── Toast ────────────────────────────────────────────────── */
  function toast(msg) {
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:#202124;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;' +
      'z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.3);pointer-events:none;';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function(){ el.remove(); }, 2500);
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════════════════════════ */
  window.BizcardModule = {
    onTabOpen: onTabOpen,
    _retry: function() { _view = 'staff-pick'; render(); },
  };

})();
