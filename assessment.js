'use strict';
/**
 * assessment.js — 2026년도 개인별 직무역량 자가진단(자기진단표)  window.AssessmentModule
 *
 * 목적
 *  - PDF 「개인별 직무역량 자기진단표」 작성양식을 웹 폼으로 구현한 독립 페이지(assessment.html)의 로직.
 *  - 개인 Google 계정 로그인 → 소속·성명 최초 등록(온보딩) → 연도별 자가진단 작성.
 *  - 기록은 Supabase(app_submissions)에 저장(CloudForms) + localStorage 캐시 → 어느 기기에서든 불러오기.
 *  - 중간저장(draft) / 제출(submitted) 지원.
 *  - 관리자(bangdw@gmail.com)는 전체 작성 인원 기록을 연도별로 조회.
 *  - 2026 / 2027 / 2028 연도 탭 → 향후 연도 확장 여지.
 *
 * 저장 스키마 (Supabase app_submissions)
 *  - kind='competency_profile', ref=<email>              → { dept, name, position, jobGroup }
 *  - kind='competency_assessment', ref='<email>::<year>' → 폼 전체 JSON(status: draft|submitted)
 *
 * 의존성: config.js(선택), auth.js(window.Auth), cloudforms.js(window.CloudForms), supabase-js
 */
window.AssessmentModule = (function () {

  /* ── 상수 ─────────────────────────────────────────────────────── */
  var ADMIN_EMAIL = 'bangdw@gmail.com';
  var YEARS       = ['2026', '2027', '2028'];
  var KIND_FORM   = 'competency_assessment';
  var KIND_PROFILE = 'competency_profile';

  // 사용자 지정 소속(부서) 기본 세팅
  var DEPARTMENTS = [
    '기획처', '교육처', '입학처',
    '항공정비계열', '스마트안전진단계열', '항공관광계열', '항공보안계열', '국방경찰계열',
    '군사교육단', '기종교육원', '비행교육원', '무인항공교육원', '평생교육원'
  ];

  var JOB_GROUPS  = ['행정직', '교무직'];
  var JOB_KINDS   = ['주업무', '부업무', '희망업무'];
  var PERF_CATS   = ['학교', '부서', '개인', '기타'];
  var CYCLES      = ['일일', '주간', '월간', '분기', '반기', '연간', '발생시'];
  var MONTHS      = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

  /* ── 상태 ─────────────────────────────────────────────────────── */
  var S = {
    root: null,
    email: '',
    profile: null,        // { dept, name, position, jobGroup }
    year: YEARS.indexOf(String(new Date().getFullYear())) >= 0 ? String(new Date().getFullYear()) : '2026',
    form: null,           // 현재 연도 폼 데이터
    status: 'draft',
    dirty: false,
    saving: false,
    lastSavedAt: '',
    view: 'form',         // 'form' | 'admin'
    adminYear: '2026',
    adminRows: null,
    adminLoading: false,
  };

  /* ── 유틸 ─────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function isAdmin() { return (S.email || '').toLowerCase() === ADMIN_EMAIL; }
  function nowIso() { return new Date().toISOString(); }
  function fmtDt(iso) {
    if (!iso) return '-';
    try {
      var d = new Date(iso);
      var p = function (n) { return (n < 10 ? '0' : '') + n; };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
             ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return iso; }
  }
  function lsKeyForm(email, year) { return 'asea_assess_' + email + '_' + year; }
  function lsKeyProfile(email) { return 'asea_assess_profile_' + email; }

  function toast(msg, type) {
    if (typeof window.aseaToast === 'function') { window.aseaToast(msg, type || 'info'); return; }
    var t = document.createElement('div');
    t.className = 'asm-toast asm-toast-' + (type || 'info');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 2600);
  }

  /* ── 빈 폼 생성 ───────────────────────────────────────────────── */
  function blankForm(year) {
    var jobs = [];
    // 주업무 3 · 부업무 3 · 희망업무 3 (기본 9행, 추가 가능)
    JOB_KINDS.forEach(function (g) {
      for (var i = 0; i < 3; i++) jobs.push({ group: g, title: '', content: '', competency: '', cycle: '', relDept: '' });
    });
    var perf = [];
    PERF_CATS.forEach(function (c) {
      for (var i = 0; i < 3; i++) perf.push({ category: c, task: '', result: '', note: '' });
    });
    var monthObj = function () { var o = {}; MONTHS.forEach(function (m) { o[m] = ''; }); return o; };
    return {
      meta: {
        year: String(year),
        dept: '', position: '', name: '',
        jobGroup: '',
        hireDate: '', totalCareer: '', currentCareer: '',
        licenses: '', roleSummary: ''
      },
      jobs: jobs,                                   // 2. 직무 분석
      performance: perf,                            // 3. 업무 성과 및 기여
      admin: {                                      // 4-1. 행정직
        draftCounts: monthObj(),                    // 기안 상신 건수
        projects: [ blankProject(), blankProject(), blankProject() ]   // 참여 사업
      },
      faculty: {                                    // 4-2. 교무직
        lecture: {                                  // 4-2-1. 강의시수
          banSu: monthObj(), credit: monthObj(), nonCredit: monthObj(), etc: monthObj(), total: monthObj(),
          note: ''
        },
        students: [                                 // 4-2-2. 지도학생 관리
          blankStudentRow('2025'), blankStudentRow('2026')
        ],
        studentsNote: '',
        counsel: monthObj()                         // 4-2-3. 학생 상담 횟수
      },
      development: [                                // 5. 개인역량개발
        blankDev('2026년(실시)'), blankDev('2026년(실시)'),
        blankDev('2027년(예정)'), blankDev('2027년(예정)')
      ],
      issues: { difficulty: '', improvement: '', nextPlan: '' }   // 6. 애로사항 및 건의
    };
  }
  function blankProject() { return { period: '', name: '', role: '' }; }
  function blankStudentRow(yr) {
    return {
      year: yr,
      s1: { reg: '', leave: '', drop: '', done: '', rate: '' },
      s2: { reg: '', leave: '', drop: '', done: '', rate: '' },
      sum: { reg: '', done: '' }
    };
  }
  function blankDev(div) { return { div: div, course: '', org: '', period: '', cost: '', content: '', scope: '' }; }

  /* ── 데이터 로드/저장 ─────────────────────────────────────────── */
  function loadProfileLocal() {
    try { var s = localStorage.getItem(lsKeyProfile(S.email)); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function saveProfileLocal(p) {
    try { localStorage.setItem(lsKeyProfile(S.email), JSON.stringify(p)); } catch (e) {}
  }
  function loadFormLocal(year) {
    try { var s = localStorage.getItem(lsKeyForm(S.email, year)); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function saveFormLocal(year, obj) {
    try { localStorage.setItem(lsKeyForm(S.email, year), JSON.stringify(obj)); } catch (e) {}
  }

  // 클라우드에서 프로필 + 현재 연도 폼을 불러온다(로컬 캐시 우선 표시 후 클라우드 병합).
  function pullFromCloud() {
    if (!(window.CloudForms && CloudForms.ready())) return Promise.resolve();
    var jobs = [];
    // 프로필
    jobs.push(
      CloudForms.list(KIND_PROFILE).then(function (res) {
        if (!res.ok) return;
        var row = (res.rows || []).filter(function (r) { return r.ref === S.email; })[0];
        if (row && row.data) {
          S.profile = row.data;
          saveProfileLocal(S.profile);
        }
      }).catch(function () {})
    );
    // 현재 연도 폼
    jobs.push(
      CloudForms.list(KIND_FORM).then(function (res) {
        if (!res.ok) return;
        var ref = S.email + '::' + S.year;
        var row = (res.rows || []).filter(function (r) { return r.ref === ref; })[0];
        if (row && row.data && row.data.form) {
          S.form = row.data.form;
          S.status = row.status || 'draft';
          S.lastSavedAt = row.updated_at || '';
          saveFormLocal(S.year, { form: S.form, status: S.status, updatedAt: S.lastSavedAt });
        }
      }).catch(function () {})
    );
    return Promise.all(jobs);
  }

  // 현재 폼을 저장(status: draft|submitted) — 로컬 즉시 + 클라우드 upsert.
  function saveForm(status) {
    syncFormFromInputs();
    S.status = status;
    S.lastSavedAt = nowIso();
    var payload = { form: S.form, status: status, updatedAt: S.lastSavedAt, email: S.email, year: S.year };
    saveFormLocal(S.year, payload);
    S.dirty = false;
    updateSaveBadge();
    if (!(window.CloudForms && CloudForms.ready())) {
      toast(status === 'submitted' ? '제출됨(로컬 저장). 클라우드 연결 시 자동 동기화됩니다.' : '중간저장됨(로컬).', 'info');
      return Promise.resolve({ ok: false });
    }
    S.saving = true; updateSaveBadge();
    var name = (S.profile && S.profile.name) || (S.form.meta && S.form.meta.name) || '';
    var ref = S.email + '::' + S.year;
    return CloudForms.save(KIND_FORM, ref, name, status, payload).then(function (r) {
      S.saving = false;
      if (r.ok) {
        toast(status === 'submitted' ? '제출이 완료되었습니다.' : '중간저장되었습니다.', 'success');
      } else {
        toast('클라우드 저장 실패: ' + (r.err || '알 수 없음') + ' (로컬에는 저장됨)', 'error');
      }
      updateSaveBadge();
      return r;
    });
  }

  function saveProfile(p) {
    S.profile = p;
    saveProfileLocal(p);
    if (window.CloudForms && CloudForms.ready()) {
      CloudForms.save(KIND_PROFILE, S.email, p.name || '', 'profile', p).catch(function () {});
    }
  }

  /* ── DOM ↔ 상태 동기화 ────────────────────────────────────────── */
  // 입력값을 S.form 으로 수집(data-path 속성 기반)
  function syncFormFromInputs() {
    if (!S.root) return;
    var els = S.root.querySelectorAll('[data-path]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      setByPath(S.form, el.getAttribute('data-path'), el.value);
    }
  }
  function setByPath(obj, path, val) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i];
      if (cur[k] == null) cur[k] = {};
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = val;
  }

  function markDirty() { S.dirty = true; updateSaveBadge(); }

  function updateSaveBadge() {
    var el = S.root && S.root.querySelector('#asm-save-badge');
    if (!el) return;
    if (S.saving) { el.textContent = '저장 중…'; el.className = 'asm-badge asm-badge-saving'; return; }
    if (S.dirty) { el.textContent = '● 저장되지 않은 변경'; el.className = 'asm-badge asm-badge-dirty'; return; }
    if (S.status === 'submitted') { el.textContent = '제출 완료 · ' + fmtDt(S.lastSavedAt); el.className = 'asm-badge asm-badge-done'; return; }
    el.textContent = S.lastSavedAt ? ('중간저장됨 · ' + fmtDt(S.lastSavedAt)) : '작성 중';
    el.className = 'asm-badge';
  }

  /* ── 렌더링: 최상위 라우터 ────────────────────────────────────── */
  function render() {
    if (!S.root) return;
    bindRootOnce();
    if (!S.email) { renderLogin(); return; }
    if (S.view === 'admin' && isAdmin()) { renderAdmin(); return; }
    if (!S.profile || !S.profile.dept || !S.profile.name) { renderOnboarding(); return; }
    renderForm();
  }

  /* ── 로그인 화면 ─────────────────────────────────────────────── */
  function renderLogin() {
    S.root.innerHTML =
      '<div class="asm-gate">' +
        '<div class="asm-gate-card">' +
          '<div class="asm-gate-icon">📋</div>' +
          '<h1 class="asm-gate-title">개인별 직무역량 자가진단</h1>' +
          '<p class="asm-gate-desc">본 진단표는 개인별 직무역량을 파악하고 연말 인사고과 평가에 반영하기 위한 자료입니다.<br>' +
          '개인 <b>Google 계정</b>으로 로그인하면 작성 기록이 안전하게 저장되어, 다른 컴퓨터에서도 이어서 작성할 수 있습니다.</p>' +
          '<button class="asm-btn asm-btn-primary asm-btn-lg" id="asm-login-btn">' +
            '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#fff" d="M12 11v2.9h4.1c-.2 1-.9 2.5-2.6 3.3l-.02.1 2.5 1.9.2.02C18.9 17.6 20 15 20 12.2c0-.7-.1-1.3-.2-1.8H12z"/><path fill="#fff" d="M12 20c2.4 0 4.4-.8 5.8-2.1l-2.8-2.1c-.7.5-1.7.9-3 .9-2.3 0-4.2-1.5-4.9-3.6H4.2v2.2C5.6 18 8.5 20 12 20z" opacity=".85"/><path fill="#fff" d="M7.1 13.1c-.2-.5-.3-1.1-.3-1.6s.1-1.1.3-1.6V7.7H4.2C3.7 8.8 3.4 10 3.4 11.5s.3 2.7.8 3.8l2.9-2.2z" opacity=".6"/><path fill="#fff" d="M12 6.6c1.3 0 2.2.6 2.7 1l2-2C15.4 4.4 13.9 3.6 12 3.6 8.5 3.6 5.6 5.6 4.2 8.5l2.9 2.2C7.8 8.5 9.7 6.6 12 6.6z" opacity=".9"/></svg>' +
            'Google 계정으로 로그인' +
          '</button>' +
          '<p class="asm-gate-foot">주관: 기획처 · 제출기한: 2026. 12. 11.</p>' +
        '</div>' +
      '</div>';
    var btn = S.root.querySelector('#asm-login-btn');
    btn.addEventListener('click', function () {
      btn.disabled = true; btn.textContent = '로그인 중…';
      if (window.Auth && Auth.login) {
        Auth.login().then(function () {}).catch(function () {
          btn.disabled = false; btn.textContent = 'Google 계정으로 로그인';
          toast('로그인에 실패했습니다. 다시 시도해 주세요.', 'error');
        });
      }
    });
  }

  /* ── 온보딩(최초 1회): 소속 + 성명 등록 ──────────────────────── */
  function renderOnboarding() {
    var p = S.profile || {};
    var deptOpts = '<option value="">— 소속 선택 —</option>' + DEPARTMENTS.map(function (d) {
      return '<option value="' + esc(d) + '"' + (p.dept === d ? ' selected' : '') + '>' + esc(d) + '</option>';
    }).join('');
    var jgOpts = JOB_GROUPS.map(function (g) {
      return '<label class="asm-radio"><input type="radio" name="asm-jg" value="' + esc(g) + '"' + (p.jobGroup === g ? ' checked' : '') + '> ' + esc(g) +
        ' <span class="asm-radio-hint">' + (g === '행정직' ? '(기안·참여사업 실적)' : '(강의·지도학생·상담 실적)') + '</span></label>';
    }).join('');
    S.root.innerHTML =
      '<div class="asm-gate">' +
        '<div class="asm-gate-card asm-onboard">' +
          '<div class="asm-gate-icon">👋</div>' +
          '<h1 class="asm-gate-title">최초 등록</h1>' +
          '<p class="asm-gate-desc">처음 접속하셨습니다. 아래 정보를 등록하면 이후에는 바로 <b>작성하기</b>로 이어집니다.<br>' +
          '<span class="asm-muted">로그인 계정: ' + esc(S.email) + '</span></p>' +
          '<div class="asm-field"><label class="asm-label">소속 <span class="asm-req">*</span></label>' +
            '<select id="ob-dept" class="asm-input">' + deptOpts + '</select></div>' +
          '<div class="asm-field"><label class="asm-label">성명 <span class="asm-req">*</span></label>' +
            '<input id="ob-name" class="asm-input" value="' + esc(p.name || '') + '" placeholder="홍길동"></div>' +
          '<div class="asm-field"><label class="asm-label">직책</label>' +
            '<input id="ob-position" class="asm-input" value="' + esc(p.position || '') + '" placeholder="예: 팀장 / 교수 / 주임"></div>' +
          '<div class="asm-field"><label class="asm-label">직군 <span class="asm-req">*</span></label>' +
            '<div class="asm-radio-group">' + jgOpts + '</div>' +
            '<p class="asm-hint">직군에 따라 실적 입력 항목(행정직: 기안·참여사업 / 교무직: 강의·지도학생·상담)이 달라집니다.</p></div>' +
          '<button class="asm-btn asm-btn-primary asm-btn-lg" id="ob-save">등록하고 작성 시작</button>' +
        '</div>' +
      '</div>';
    S.root.querySelector('#ob-save').addEventListener('click', function () {
      var dept = S.root.querySelector('#ob-dept').value;
      var name = S.root.querySelector('#ob-name').value.trim();
      var position = S.root.querySelector('#ob-position').value.trim();
      var jgEl = S.root.querySelector('input[name="asm-jg"]:checked');
      var jobGroup = jgEl ? jgEl.value : '';
      if (!dept) { toast('소속을 선택해 주세요.', 'error'); return; }
      if (!name) { toast('성명을 입력해 주세요.', 'error'); return; }
      if (!jobGroup) { toast('직군을 선택해 주세요.', 'error'); return; }
      saveProfile({ dept: dept, name: name, position: position, jobGroup: jobGroup });
      // 현재 연도 폼 준비 + 메타 반영
      ensureFormLoaded().then(function () {
        applyProfileToForm();
        S.view = 'form';
        render();
        toast('등록되었습니다. 작성을 시작하세요.', 'success');
      });
    });
  }

  function applyProfileToForm() {
    if (!S.form || !S.profile) return;
    var m = S.form.meta;
    if (!m.dept) m.dept = S.profile.dept;
    if (!m.name) m.name = S.profile.name;
    if (!m.position) m.position = S.profile.position;
    if (!m.jobGroup) m.jobGroup = S.profile.jobGroup;
    saveFormLocal(S.year, { form: S.form, status: S.status, updatedAt: S.lastSavedAt });
  }

  // 현재 연도 폼을 로컬 → 없으면 빈 폼으로 준비
  function ensureFormLoaded() {
    var local = loadFormLocal(S.year);
    if (local && local.form) {
      S.form = local.form; S.status = local.status || 'draft'; S.lastSavedAt = local.updatedAt || '';
    } else {
      S.form = blankForm(S.year); S.status = 'draft'; S.lastSavedAt = '';
    }
    return Promise.resolve();
  }

  /* ── 메인 작성 폼 ─────────────────────────────────────────────── */
  function renderForm() {
    var readonly = (S.status === 'submitted');
    var yearTabs = YEARS.map(function (y) {
      return '<button class="asm-year-tab' + (y === S.year ? ' active' : '') + '" data-year="' + y + '">' + y + '년</button>';
    }).join('');

    var html =
      '<div class="asm-toolbar">' +
        '<div class="asm-year-tabs">' + yearTabs + '</div>' +
        '<div class="asm-toolbar-right">' +
          '<span id="asm-save-badge" class="asm-badge">작성 중</span>' +
          '<button class="asm-btn asm-btn-ghost" id="asm-reload">불러오기</button>' +
          '<button class="asm-btn asm-btn-secondary" id="asm-save-draft">중간저장</button>' +
          '<button class="asm-btn asm-btn-primary" id="asm-submit">제출하기</button>' +
          (isAdmin() ? '<button class="asm-btn asm-btn-admin" id="asm-goadmin">관리자</button>' : '') +
        '</div>' +
      '</div>' +
      (readonly ? '<div class="asm-notice asm-notice-done">이 연도(' + S.year + ')는 <b>제출 완료</b> 상태입니다. 수정하려면 아래에서 편집 후 다시 제출하세요. ' +
        '<button class="asm-linkbtn" id="asm-reopen">수정하기</button></div>' : '') +
      '<div class="asm-doc' + (readonly ? ' asm-readonly' : '') + '" id="asm-doc">' +
        '<div class="asm-doc-head">' +
          '<div class="asm-confidential">대외비</div>' +
          '<h1 class="asm-doc-title">' + S.year + '년도 개인별 직무역량 자기진단표</h1>' +
          '<p class="asm-doc-note">※ 본 조사표는 개인별 직무역량을 파악하고 연말 인사고과 평가에 반영하기 위한 자료입니다.</p>' +
        '</div>' +
        sec1() + sec2() + sec3() + sec4() + sec5() + sec6() +
        '<div class="asm-doc-actions">' +
          '<button class="asm-btn asm-btn-secondary asm-btn-lg" id="asm-save-draft2">중간저장</button>' +
          '<button class="asm-btn asm-btn-primary asm-btn-lg" id="asm-submit2">제출하기</button>' +
        '</div>' +
      '</div>';

    S.root.innerHTML = html;
    bindForm();
    updateSaveBadge();
    toggleJobGroupSections();
  }

  /* 1. 개인 신상 정보 */
  function sec1() {
    var m = S.form.meta;
    var deptOpts = '<option value="">— 선택 —</option>' + DEPARTMENTS.map(function (d) {
      return '<option value="' + esc(d) + '"' + (m.dept === d ? ' selected' : '') + '>' + esc(d) + '</option>';
    }).join('');
    var jgOpts = JOB_GROUPS.map(function (g) {
      return '<option value="' + esc(g) + '"' + (m.jobGroup === g ? ' selected' : '') + '>' + esc(g) + '</option>';
    }).join('');
    return section('1', '개인 신상 정보',
      '<table class="asm-table asm-table-info">' +
        '<tr>' +
          '<th>소 속</th><td><select data-path="meta.dept" class="asm-cell-input">' + deptOpts + '</select></td>' +
          '<th>직 책</th><td><input data-path="meta.position" class="asm-cell-input" value="' + esc(m.position) + '"></td>' +
          '<th>성 명</th><td><input data-path="meta.name" class="asm-cell-input" value="' + esc(m.name) + '"></td>' +
        '</tr>' +
        '<tr>' +
          '<th>입사일</th><td><input data-path="meta.hireDate" type="date" class="asm-cell-input" value="' + esc(m.hireDate) + '"></td>' +
          '<th>전체근무경력</th><td><input data-path="meta.totalCareer" class="asm-cell-input" placeholder="예: 10년 3개월" value="' + esc(m.totalCareer) + '"></td>' +
          '<th>현직무경력</th><td><input data-path="meta.currentCareer" class="asm-cell-input" placeholder="예: 4년" value="' + esc(m.currentCareer) + '"></td>' +
        '</tr>' +
        '<tr>' +
          '<th>직 군</th><td><select data-path="meta.jobGroup" id="asm-jobgroup" class="asm-cell-input">' + jgOpts + '</select></td>' +
          '<th>주요 자격·면허</th><td colspan="3"><input data-path="meta.licenses" class="asm-cell-input" placeholder="해당 자격증·면허·인증 등 모두 기재" value="' + esc(m.licenses) + '"></td>' +
        '</tr>' +
        '<tr>' +
          '<th>직책업무 요약</th><td colspan="5"><textarea data-path="meta.roleSummary" class="asm-cell-input asm-ta" rows="2">' + esc(m.roleSummary) + '</textarea></td>' +
        '</tr>' +
      '</table>');
  }

  /* 2. 직무 분석 */
  function sec2() {
    var rows = S.form.jobs.map(function (j, i) {
      var cyc = '<option value="">—</option>' + CYCLES.map(function (c) {
        return '<option value="' + esc(c) + '"' + (j.cycle === c ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('');
      var grpOpts = JOB_KINDS.map(function (g) {
        return '<option value="' + esc(g) + '"' + (j.group === g ? ' selected' : '') + '>' + esc(g) + '</option>';
      }).join('');
      return '<tr>' +
        '<td class="asm-td-no">' + (i + 1) + '</td>' +
        '<td><select data-path="jobs.' + i + '.group" class="asm-cell-input asm-cell-sm">' + grpOpts + '</select></td>' +
        '<td><input data-path="jobs.' + i + '.title" class="asm-cell-input" placeholder="직무명" value="' + esc(j.title) + '"></td>' +
        '<td><textarea data-path="jobs.' + i + '.content" class="asm-cell-input asm-ta" rows="1" placeholder="구체적 업무 내용">' + esc(j.content) + '</textarea></td>' +
        '<td><textarea data-path="jobs.' + i + '.competency" class="asm-cell-input asm-ta" rows="1" placeholder="기술·지식">' + esc(j.competency) + '</textarea></td>' +
        '<td><select data-path="jobs.' + i + '.cycle" class="asm-cell-input asm-cell-sm">' + cyc + '</select></td>' +
        '<td><input data-path="jobs.' + i + '.relDept" class="asm-cell-input asm-cell-sm" value="' + esc(j.relDept) + '"></td>' +
        '<td class="asm-td-del"><button class="asm-rowdel" data-arr="jobs" data-idx="' + i + '" title="행 삭제">✕</button></td>' +
      '</tr>';
    }).join('');
    return section('2', '직무 분석',
      '<div class="asm-scroll"><table class="asm-table asm-table-grid">' +
        '<thead><tr>' +
          '<th class="asm-td-no">No</th><th>직무구분</th><th>직무(업무)명</th><th>업무 내용<br><small>(구체적)</small></th>' +
          '<th>필요역량<br><small>(기술·지식)</small></th><th>수행<br>주기</th><th>관련부서</th><th></th>' +
        '</tr></thead><tbody>' + rows + '</tbody>' +
      '</table></div>' +
      '<div class="asm-rowadd"><button class="asm-btn asm-btn-ghost asm-btn-sm" data-add="jobs">+ 직무 행 추가</button></div>' +
      '<p class="asm-hint">① 필요역량은 관련 학위·자격증 등을 자유롭게 기재. ② 수행주기는 [일일·주간·월간·분기·반기·연간·발생시]로 구분.</p>');
  }

  /* 3. 업무 성과 및 기여 */
  function sec3() {
    var rows = S.form.performance.map(function (p, i) {
      var catOpts = PERF_CATS.map(function (c) {
        return '<option value="' + esc(c) + '"' + (p.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('');
      return '<tr>' +
        '<td><select data-path="performance.' + i + '.category" class="asm-cell-input asm-cell-sm">' + catOpts + '</select></td>' +
        '<td><input data-path="performance.' + i + '.task" class="asm-cell-input" placeholder="해당 업무명" value="' + esc(p.task) + '"></td>' +
        '<td><textarea data-path="performance.' + i + '.result" class="asm-cell-input asm-ta" rows="1" placeholder="업무 성과 및 기여 내용 (수치·결과 포함)">' + esc(p.result) + '</textarea></td>' +
        '<td><input data-path="performance.' + i + '.note" class="asm-cell-input asm-cell-sm" placeholder="협력부서·근거" value="' + esc(p.note) + '"></td>' +
        '<td class="asm-td-del"><button class="asm-rowdel" data-arr="performance" data-idx="' + i + '" title="행 삭제">✕</button></td>' +
      '</tr>';
    }).join('');
    return section('3', S.year + '년도 업무 성과 및 기여',
      '<div class="asm-scroll"><table class="asm-table asm-table-grid">' +
        '<thead><tr><th>구분</th><th>해당 업무</th><th>업무 성과 및 기여 내용 <small>(수치·결과 포함)</small></th><th>비고<br><small>(협력부서·근거)</small></th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>' +
      '<div class="asm-rowadd"><button class="asm-btn asm-btn-ghost asm-btn-sm" data-add="performance">+ 성과 행 추가</button></div>');
  }

  /* 4. 업무처리 실적 (직군별) */
  function sec4() {
    return '<div class="asm-section" id="asm-sec4">' +
      sectionHead('4', '개인별 업무처리 실적') +
      '<div class="asm-jobgroup-switch">' +
        '<span class="asm-muted">직군:</span> <b id="asm-jg-label">' + esc(S.form.meta.jobGroup || '미선택') + '</b>' +
        '<span class="asm-hint asm-inline">직군은 상단 「1. 개인 신상 정보」의 직군 선택에 따라 자동 전환됩니다.</span>' +
      '</div>' +
      '<div class="asm-subsec" id="asm-sec4-admin">' + sec4Admin() + '</div>' +
      '<div class="asm-subsec" id="asm-sec4-faculty">' + sec4Faculty() + '</div>' +
      '</div>';
  }

  /* 4-1 행정직 */
  function sec4Admin() {
    var d = S.form.admin;
    var head = '<tr><th>월</th>' + MONTHS.map(function (m) { return '<th>' + m + '</th>'; }).join('') + '<th>합계</th></tr>';
    var body = '<tr><th>건수</th>' + MONTHS.map(function (m) {
      return '<td><input data-path="admin.draftCounts.' + m + '" data-sum="draft" class="asm-cell-input asm-cell-num" inputmode="numeric" value="' + esc(d.draftCounts[m]) + '"></td>';
    }).join('') + '<td class="asm-sum" id="asm-sum-draft">0</td></tr>';

    var projRows = d.projects.map(function (p, i) {
      return '<tr>' +
        '<td class="asm-td-no">' + (i + 1) + '</td>' +
        '<td><input data-path="admin.projects.' + i + '.period" class="asm-cell-input asm-cell-sm" placeholder="예: 2026.03~06" value="' + esc(p.period) + '"></td>' +
        '<td><input data-path="admin.projects.' + i + '.name" class="asm-cell-input" placeholder="참여 사업명" value="' + esc(p.name) + '"></td>' +
        '<td><textarea data-path="admin.projects.' + i + '.role" class="asm-cell-input asm-ta" rows="1" placeholder="담당업무 및 사업성과">' + esc(p.role) + '</textarea></td>' +
        '<td class="asm-td-del"><button class="asm-rowdel" data-arr="admin.projects" data-idx="' + i + '" title="행 삭제">✕</button></td>' +
      '</tr>';
    }).join('');

    return '<h4 class="asm-h4">4-1-1. 연간 기안 상신 건수 <span class="asm-tag">행정직</span></h4>' +
      '<div class="asm-scroll"><table class="asm-table asm-table-month">' + head + body + '</table></div>' +
      '<h4 class="asm-h4">4-1-2. 연간 참여 사업 <span class="asm-tag">행정직</span></h4>' +
      '<div class="asm-scroll"><table class="asm-table asm-table-grid">' +
        '<thead><tr><th class="asm-td-no">연번</th><th>사업 기간</th><th>참여 사업명</th><th>담당업무 및 사업성과</th><th></th></tr></thead>' +
        '<tbody>' + projRows + '</tbody></table></div>' +
      '<div class="asm-rowadd"><button class="asm-btn asm-btn-ghost asm-btn-sm" data-add="admin.projects">+ 참여 사업 추가</button></div>';
  }

  /* 4-2 교무직 */
  function sec4Faculty() {
    var f = S.form.faculty;
    var monthHead = '<tr><th>구분</th>' + MONTHS.map(function (m) { return '<th>' + m + '</th>'; }).join('') + '</tr>';
    var lecRow = function (label, key) {
      return '<tr><th>' + label + '</th>' + MONTHS.map(function (m) {
        return '<td><input data-path="faculty.lecture.' + key + '.' + m + '" class="asm-cell-input asm-cell-num" inputmode="numeric" value="' + esc(f.lecture[key][m]) + '"></td>';
      }).join('') + '</tr>';
    };
    var lecture =
      '<h4 class="asm-h4">4-2-1. 개인별 강의시수 <span class="asm-tag asm-tag-fac">교무직</span></h4>' +
      '<div class="asm-scroll"><table class="asm-table asm-table-month">' +
        monthHead +
        lecRow('반수', 'banSu') +
        lecRow('학점 시수', 'credit') +
        lecRow('비학점 시수', 'nonCredit') +
        lecRow('기타시수(국비 등)', 'etc') +
        lecRow('전체시수', 'total') +
      '</table></div>' +
      '<input data-path="faculty.lecture.note" class="asm-cell-input asm-note-input" placeholder="※ 비고: 참고사항 자유롭게 기재" value="' + esc(f.lecture.note) + '">';

    var stuRows = f.students.map(function (r, i) {
      var cell = function (path, v) { return '<td><input data-path="' + path + '" class="asm-cell-input asm-cell-num" value="' + esc(v) + '"></td>'; };
      return '<tr>' +
        '<td><input data-path="faculty.students.' + i + '.year" class="asm-cell-input asm-cell-sm" value="' + esc(r.year) + '"></td>' +
        cell('faculty.students.' + i + '.s1.reg', r.s1.reg) + cell('faculty.students.' + i + '.s1.leave', r.s1.leave) +
        cell('faculty.students.' + i + '.s1.drop', r.s1.drop) + cell('faculty.students.' + i + '.s1.done', r.s1.done) +
        cell('faculty.students.' + i + '.s1.rate', r.s1.rate) +
        cell('faculty.students.' + i + '.s2.reg', r.s2.reg) + cell('faculty.students.' + i + '.s2.leave', r.s2.leave) +
        cell('faculty.students.' + i + '.s2.drop', r.s2.drop) + cell('faculty.students.' + i + '.s2.done', r.s2.done) +
        cell('faculty.students.' + i + '.s2.rate', r.s2.rate) +
        cell('faculty.students.' + i + '.sum.reg', r.sum.reg) + cell('faculty.students.' + i + '.sum.done', r.sum.done) +
        '<td class="asm-td-del"><button class="asm-rowdel" data-arr="faculty.students" data-idx="' + i + '" title="행 삭제">✕</button></td>' +
      '</tr>';
    }).join('');
    var students =
      '<h4 class="asm-h4">4-2-2. 지도교수 학생관리 현황 <span class="asm-tag asm-tag-fac">교무직</span></h4>' +
      '<div class="asm-scroll"><table class="asm-table asm-table-grid asm-table-student">' +
        '<thead>' +
          '<tr><th rowspan="2">연도</th><th colspan="5">1학기</th><th colspan="5">2학기</th><th colspan="2">계</th><th rowspan="2"></th></tr>' +
          '<tr><th>등록</th><th>휴학</th><th>자퇴</th><th>수료</th><th>등록률</th><th>등록</th><th>휴학</th><th>자퇴</th><th>수료</th><th>등록률</th><th>등록</th><th>수료</th></tr>' +
        '</thead><tbody>' + stuRows + '</tbody></table></div>' +
        '<div class="asm-rowadd"><button class="asm-btn asm-btn-ghost asm-btn-sm" data-add="faculty.students">+ 연도 행 추가</button></div>' +
      '<input data-path="faculty.studentsNote" class="asm-cell-input asm-note-input" placeholder="※ 비고: 참고사항 자유롭게 기재" value="' + esc(f.studentsNote) + '">';

    var cHead = '<tr><th>월</th>' + MONTHS.map(function (m) { return '<th>' + m + '</th>'; }).join('') + '<th>합계</th></tr>';
    var cBody = '<tr><th>건수</th>' + MONTHS.map(function (m) {
      return '<td><input data-path="faculty.counsel.' + m + '" data-sum="counsel" class="asm-cell-input asm-cell-num" inputmode="numeric" value="' + esc(f.counsel[m]) + '"></td>';
    }).join('') + '<td class="asm-sum" id="asm-sum-counsel">0</td></tr>';
    var counsel =
      '<h4 class="asm-h4">4-2-3. 학생 상담 횟수 <span class="asm-tag asm-tag-fac">교무직</span></h4>' +
      '<div class="asm-scroll"><table class="asm-table asm-table-month">' + cHead + cBody + '</table></div>' +
      '<p class="asm-hint">※ 상담 횟수는 학사정보시스템 상담 내역 기준으로 기입.</p>';

    return lecture + students + counsel;
  }

  /* 5. 개인역량개발 */
  function sec5() {
    var rows = S.form.development.map(function (d, i) {
      return '<tr>' +
        '<td><input data-path="development.' + i + '.div" class="asm-cell-input asm-cell-sm" value="' + esc(d.div) + '" placeholder="예: 2026년(실시)"></td>' +
        '<td><input data-path="development.' + i + '.course" class="asm-cell-input" placeholder="교육과정명" value="' + esc(d.course) + '"></td>' +
        '<td><input data-path="development.' + i + '.org" class="asm-cell-input asm-cell-sm" placeholder="주관기관" value="' + esc(d.org) + '"></td>' +
        '<td><input data-path="development.' + i + '.period" class="asm-cell-input asm-cell-sm" placeholder="시간" value="' + esc(d.period) + '"></td>' +
        '<td><input data-path="development.' + i + '.cost" class="asm-cell-input asm-cell-sm" placeholder="비용" value="' + esc(d.cost) + '"></td>' +
        '<td><textarea data-path="development.' + i + '.content" class="asm-cell-input asm-ta" rows="1" placeholder="교육 내용">' + esc(d.content) + '</textarea></td>' +
        '<td><input data-path="development.' + i + '.scope" class="asm-cell-input asm-cell-sm" placeholder="업무반영범위" value="' + esc(d.scope) + '"></td>' +
        '<td class="asm-td-del"><button class="asm-rowdel" data-arr="development" data-idx="' + i + '" title="행 삭제">✕</button></td>' +
      '</tr>';
    }).join('');
    return section('5', '개인역량개발 <small>(교육 이수·희망)</small>',
      '<div class="asm-scroll"><table class="asm-table asm-table-grid">' +
        '<thead><tr><th>구분</th><th>교육과정명</th><th>주관기관</th><th>교육기간<br><small>(시간)</small></th><th>비용</th><th>교육 내용</th><th>업무반영범위</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="asm-rowadd"><button class="asm-btn asm-btn-ghost asm-btn-sm" data-add="development">+ 교육 행 추가</button></div>');
  }

  /* 6. 애로사항 및 건의 */
  function sec6() {
    var s = S.form.issues;
    return section('6', '직무 관련 애로사항 및 건의',
      '<table class="asm-table asm-table-info">' +
        '<tr><th>애로사항</th><td><textarea data-path="issues.difficulty" class="asm-cell-input asm-ta" rows="3">' + esc(s.difficulty) + '</textarea></td></tr>' +
        '<tr><th>개선사항 건의</th><td><textarea data-path="issues.improvement" class="asm-cell-input asm-ta" rows="3">' + esc(s.improvement) + '</textarea></td></tr>' +
        '<tr><th>' + (parseInt(S.year, 10) + 1) + '년 목표 및 계획</th><td><textarea data-path="issues.nextPlan" class="asm-cell-input asm-ta" rows="3">' + esc(s.nextPlan) + '</textarea></td></tr>' +
      '</table>');
  }

  function sectionHead(no, title) {
    return '<div class="asm-sec-head"><span class="asm-sec-no">' + no + '</span><h3 class="asm-sec-title">' + title + '</h3></div>';
  }
  function section(no, title, body) {
    return '<div class="asm-section">' + sectionHead(no, title) + '<div class="asm-sec-body">' + body + '</div></div>';
  }

  /* ── 직군에 따른 4장 표시 전환 ────────────────────────────────── */
  function toggleJobGroupSections() {
    var jg = S.form.meta.jobGroup;
    var a = S.root.querySelector('#asm-sec4-admin');
    var f = S.root.querySelector('#asm-sec4-faculty');
    var lbl = S.root.querySelector('#asm-jg-label');
    if (lbl) lbl.textContent = jg || '미선택';
    if (!a || !f) return;
    if (jg === '교무직') { a.style.display = 'none'; f.style.display = ''; }
    else if (jg === '행정직') { a.style.display = ''; f.style.display = 'none'; }
    else { a.style.display = ''; f.style.display = ''; }   // 미선택 시 둘 다 표시
  }

  function recalcSums() {
    ['draft', 'counsel'].forEach(function (kind) {
      var els = S.root.querySelectorAll('[data-sum="' + kind + '"]');
      var sum = 0;
      for (var i = 0; i < els.length; i++) { var n = parseFloat(els[i].value); if (!isNaN(n)) sum += n; }
      var out = S.root.querySelector('#asm-sum-' + kind);
      if (out) out.textContent = String(sum);
    });
  }

  /* ── 이벤트 바인딩 ────────────────────────────────────────────────
     위임 리스너는 S.root(영속 요소)에 '단 한 번'만 부착한다.
     renderForm/renderAdmin이 innerHTML을 갈아끼워도 위임 핸들러는 유지되므로
     매 렌더마다 재부착하면 핸들러가 누적되어 클릭이 중복 실행된다(행 2개 추가 등). */
  function bindRootOnce() {
    if (S._bound || !S.root) return;
    S._bound = true;

    // 입력 변경 → 상태 반영 + dirty + (합계 재계산)
    S.root.addEventListener('input', function (e) {
      var t = e.target;
      if (t.matches && t.matches('[data-path]')) {
        if (S.form) setByPath(S.form, t.getAttribute('data-path'), t.value);
        markDirty();
        if (t.hasAttribute('data-sum')) recalcSums();
        autoGrow(t);
      }
    });
    // 직군 변경 → 4장 전환
    S.root.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'asm-jobgroup' && S.form) {
        S.form.meta.jobGroup = e.target.value;
        toggleJobGroupSections();
        markDirty();
      }
    });
    // 버튼(행 추가/삭제, 연도, 저장/제출/관리자)
    S.root.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('button, .asm-year-tab') : null;
      if (!t) return;
      if (t.classList.contains('asm-year-tab') && t.hasAttribute('data-year')) { switchYear(t.getAttribute('data-year')); return; }
      if (t.hasAttribute('data-add')) { addRow(t.getAttribute('data-add')); return; }
      if (t.classList.contains('asm-rowdel')) { delRow(t.getAttribute('data-arr'), parseInt(t.getAttribute('data-idx'), 10)); return; }
      switch (t.id) {
        case 'asm-save-draft': case 'asm-save-draft2': saveForm('draft'); break;
        case 'asm-submit': case 'asm-submit2': doSubmit(); break;
        case 'asm-reload': doReload(); break;
        case 'asm-goadmin':
          syncFormFromInputs();
          saveFormLocal(S.year, { form: S.form, status: S.status, updatedAt: S.lastSavedAt });
          S.view = 'admin'; loadAdmin(); render(); break;
        case 'asm-reopen': S.status = 'draft'; render(); break;
      }
    });
  }

  // 렌더 직후 1회성 DOM 후처리(textarea 높이·합계)
  function bindForm() {
    var tas = S.root.querySelectorAll('textarea.asm-ta');
    for (var i = 0; i < tas.length; i++) autoGrow(tas[i]);
    recalcSums();
  }

  function autoGrow(el) {
    if (!el || el.tagName !== 'TEXTAREA') return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight + 2, 400) + 'px';
  }

  function getArr(path) {
    var parts = path.split('.'); var cur = S.form;
    for (var i = 0; i < parts.length; i++) { cur = cur[parts[i]]; if (cur == null) return null; }
    return cur;
  }
  function addRow(arrPath) {
    syncFormFromInputs();
    var arr = getArr(arrPath);
    if (!Array.isArray(arr)) return;
    if (arrPath === 'jobs') arr.push({ group: '부업무', title: '', content: '', competency: '', cycle: '', relDept: '' });
    else if (arrPath === 'performance') arr.push({ category: '개인', task: '', result: '', note: '' });
    else if (arrPath === 'admin.projects') arr.push(blankProject());
    else if (arrPath === 'faculty.students') arr.push(blankStudentRow(''));
    else if (arrPath === 'development') arr.push(blankDev(''));
    markDirty(); renderForm();
  }
  function delRow(arrPath, idx) {
    syncFormFromInputs();
    var arr = getArr(arrPath);
    if (!Array.isArray(arr) || idx < 0 || idx >= arr.length) return;
    if (arr.length <= 1) { toast('최소 1개 행은 필요합니다.', 'info'); return; }
    arr.splice(idx, 1);
    markDirty(); renderForm();
  }

  function switchYear(y) {
    if (y === S.year) return;
    if (S.dirty) {
      syncFormFromInputs();
      saveFormLocal(S.year, { form: S.form, status: S.status, updatedAt: S.lastSavedAt });
    }
    S.year = y;
    ensureFormLoaded().then(function () {
      applyProfileToForm();
      // 클라우드 최신본 재조회
      pullFromCloud().then(function () { render(); });
      render();
    });
  }

  function doSubmit() {
    syncFormFromInputs();
    // 필수: 소속·성명
    if (!S.form.meta.dept || !S.form.meta.name) {
      toast('소속과 성명은 필수입니다. (1. 개인 신상 정보)', 'error');
      return;
    }
    if (!confirm(S.year + '년도 자가진단표를 제출하시겠습니까?\n제출 후에도 [수정하기]로 다시 편집·제출할 수 있습니다.')) return;
    saveForm('submitted').then(function () { render(); });
  }
  function doReload() {
    if (S.dirty && !confirm('저장하지 않은 변경이 있습니다. 클라우드 기록으로 다시 불러오면 현재 편집 내용이 사라질 수 있습니다. 계속할까요?')) return;
    toast('클라우드에서 불러오는 중…', 'info');
    pullFromCloud().then(function () { S.dirty = false; render(); toast('불러오기 완료.', 'success'); });
  }

  /* ── 관리자 화면 ─────────────────────────────────────────────── */
  function loadAdmin() {
    S.adminLoading = true; S.adminRows = null;
    if (!(window.CloudForms && CloudForms.ready())) { S.adminLoading = false; return; }
    CloudForms.list(KIND_FORM).then(function (res) {
      S.adminLoading = false;
      S.adminRows = res.ok ? (res.rows || []) : [];
      if (S.view === 'admin') renderAdmin();
    }).catch(function () { S.adminLoading = false; S.adminRows = []; if (S.view === 'admin') renderAdmin(); });
  }

  function renderAdmin() {
    var yearTabs = YEARS.map(function (y) {
      return '<button class="asm-year-tab' + (y === S.adminYear ? ' active' : '') + '" data-ayear="' + y + '">' + y + '년</button>';
    }).join('');
    var rowsForYear = (S.adminRows || []).filter(function (r) {
      return (r.data && r.data.year === S.adminYear) || (r.ref || '').indexOf('::' + S.adminYear) >= 0;
    });
    // 소속 → 인원 그룹핑
    var body;
    if (S.adminLoading) {
      body = '<div class="asm-admin-empty">불러오는 중…</div>';
    } else if (!(window.CloudForms && CloudForms.ready())) {
      body = '<div class="asm-admin-empty">클라우드(Supabase)에 연결되지 않아 기록을 조회할 수 없습니다.</div>';
    } else if (!rowsForYear.length) {
      body = '<div class="asm-admin-empty">' + S.adminYear + '년도에 작성된 기록이 없습니다.</div>';
    } else {
      var submitted = rowsForYear.filter(function (r) { return r.status === 'submitted'; }).length;
      var trs = rowsForYear.slice().sort(function (a, b) {
        var da = (a.data && a.data.form && a.data.form.meta && a.data.form.meta.dept) || '';
        var db = (b.data && b.data.form && b.data.form.meta && b.data.form.meta.dept) || '';
        if (da !== db) return da < db ? -1 : 1;
        return (b.updated_at || '') > (a.updated_at || '') ? 1 : -1;
      }).map(function (r, i) {
        var m = (r.data && r.data.form && r.data.form.meta) || {};
        var email = (r.ref || '').split('::')[0];
        var badge = r.status === 'submitted'
          ? '<span class="asm-status asm-status-done">제출</span>'
          : '<span class="asm-status asm-status-draft">작성중</span>';
        return '<tr>' +
          '<td>' + (i + 1) + '</td>' +
          '<td>' + esc(m.dept || '-') + '</td>' +
          '<td>' + esc(m.name || r.name || '-') + '</td>' +
          '<td>' + esc(m.position || '-') + '</td>' +
          '<td>' + esc(m.jobGroup || '-') + '</td>' +
          '<td>' + badge + '</td>' +
          '<td class="asm-admin-email">' + esc(email) + '</td>' +
          '<td>' + fmtDt(r.updated_at) + '</td>' +
          '<td><button class="asm-btn asm-btn-ghost asm-btn-sm asm-admin-view" data-ref="' + esc(r.ref) + '">보기</button></td>' +
        '</tr>';
      }).join('');
      body =
        '<div class="asm-admin-stat">' +
          '<div class="asm-stat"><span class="asm-stat-num">' + rowsForYear.length + '</span><span class="asm-stat-lbl">작성 인원</span></div>' +
          '<div class="asm-stat"><span class="asm-stat-num">' + submitted + '</span><span class="asm-stat-lbl">제출 완료</span></div>' +
          '<div class="asm-stat"><span class="asm-stat-num">' + (rowsForYear.length - submitted) + '</span><span class="asm-stat-lbl">작성 중</span></div>' +
        '</div>' +
        '<div class="asm-scroll"><table class="asm-table asm-admin-table">' +
          '<thead><tr><th>#</th><th>소속</th><th>성명</th><th>직책</th><th>직군</th><th>상태</th><th>계정</th><th>최종수정</th><th></th></tr></thead>' +
          '<tbody>' + trs + '</tbody></table></div>';
    }

    S.root.innerHTML =
      '<div class="asm-toolbar">' +
        '<div class="asm-year-tabs">' + yearTabs + '</div>' +
        '<div class="asm-toolbar-right">' +
          '<button class="asm-btn asm-btn-ghost" id="asm-admin-refresh">새로고침</button>' +
          '<button class="asm-btn asm-btn-secondary" id="asm-admin-csv">CSV 내보내기</button>' +
          '<button class="asm-btn asm-btn-primary" id="asm-admin-back">← 내 작성으로</button>' +
        '</div>' +
      '</div>' +
      '<div class="asm-doc">' +
        '<div class="asm-doc-head"><h1 class="asm-doc-title">관리자 · 직무역량 자가진단 현황</h1>' +
        '<p class="asm-doc-note">전체 작성 인원의 기록을 연도별로 조회합니다. (관리자: ' + esc(S.email) + ')</p></div>' +
        body +
      '</div>' +
      '<div id="asm-admin-modal"></div>';

    S.root.querySelector('#asm-admin-back').addEventListener('click', function () { S.view = 'form'; render(); });
    S.root.querySelector('#asm-admin-refresh').addEventListener('click', function () { loadAdmin(); renderAdmin(); });
    var csv = S.root.querySelector('#asm-admin-csv');
    if (csv) csv.addEventListener('click', exportCsv);
    S.root.querySelectorAll('[data-ayear]').forEach(function (b) {
      b.addEventListener('click', function () { S.adminYear = b.getAttribute('data-ayear'); renderAdmin(); });
    });
    S.root.querySelectorAll('.asm-admin-view').forEach(function (b) {
      b.addEventListener('click', function () { showDetail(b.getAttribute('data-ref')); });
    });
  }

  function exportCsv() {
    var rows = (S.adminRows || []).filter(function (r) {
      return (r.data && r.data.year === S.adminYear) || (r.ref || '').indexOf('::' + S.adminYear) >= 0;
    });
    var head = ['소속', '성명', '직책', '직군', '상태', '계정', '최종수정'];
    var lines = [head.join(',')];
    rows.forEach(function (r) {
      var m = (r.data && r.data.form && r.data.form.meta) || {};
      var email = (r.ref || '').split('::')[0];
      var f = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
      lines.push([m.dept, m.name || r.name, m.position, m.jobGroup, r.status, email, fmtDt(r.updated_at)].map(f).join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '직무역량자가진단_' + S.adminYear + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function showDetail(ref) {
    var row = (S.adminRows || []).filter(function (r) { return r.ref === ref; })[0];
    if (!row || !row.data || !row.data.form) { toast('상세 데이터를 찾을 수 없습니다.', 'error'); return; }
    var f = row.data.form; var m = f.meta || {};
    var pre = '<pre class="asm-detail-json">' + esc(JSON.stringify(f, null, 2)) + '</pre>';
    var jobsTbl = (f.jobs || []).filter(function (j) { return j.title; }).map(function (j) {
      return '<tr><td>' + esc(j.group) + '</td><td>' + esc(j.title) + '</td><td>' + esc(j.content) + '</td><td>' + esc(j.cycle) + '</td></tr>';
    }).join('');
    var modal = S.root.querySelector('#asm-admin-modal');
    modal.innerHTML =
      '<div class="asm-modal-back" id="asm-modal-back"><div class="asm-modal">' +
        '<div class="asm-modal-head"><b>' + esc(m.dept || '') + ' · ' + esc(m.name || '') + '</b>' +
          '<span class="asm-status ' + (row.status === 'submitted' ? 'asm-status-done' : 'asm-status-draft') + '">' + (row.status === 'submitted' ? '제출' : '작성중') + '</span>' +
          '<button class="asm-modal-x" id="asm-modal-x">✕</button></div>' +
        '<div class="asm-modal-body">' +
          '<div class="asm-detail-meta">직군: ' + esc(m.jobGroup || '-') + ' / 직책: ' + esc(m.position || '-') +
            ' / 입사일: ' + esc(m.hireDate || '-') + ' / 경력: ' + esc(m.totalCareer || '-') + '</div>' +
          (jobsTbl ? '<h4 class="asm-h4">직무 분석</h4><table class="asm-table asm-table-grid"><thead><tr><th>구분</th><th>직무명</th><th>내용</th><th>주기</th></tr></thead><tbody>' + jobsTbl + '</tbody></table>' : '') +
          '<h4 class="asm-h4">전체 데이터(JSON)</h4>' + pre +
        '</div>' +
      '</div></div>';
    var close = function () { modal.innerHTML = ''; };
    S.root.querySelector('#asm-modal-x').addEventListener('click', close);
    S.root.querySelector('#asm-modal-back').addEventListener('click', function (e) { if (e.target.id === 'asm-modal-back') close(); });
  }

  /* ── 공개 진입점 ─────────────────────────────────────────────── */
  function setEmail(email) {
    S.email = (email || '').trim();
  }

  // 로그인 후 초기 부트: 프로필/폼 로드 → 렌더
  function boot() {
    if (!S.email) { render(); return; }
    S.profile = loadProfileLocal();
    ensureFormLoaded().then(function () {
      render();               // 캐시로 즉시 표시
      pullFromCloud().then(function () {
        if (S.profile) applyProfileToForm();
        render();             // 클라우드 병합 후 갱신
      });
    });
  }

  function renderTab(root) {
    if (root) S.root = root;
    if (!S.root) S.root = document.getElementById('assessment-root');
    bindRootOnce();
    render();
  }

  return {
    renderTab: renderTab,
    setEmail: setEmail,
    boot: boot,
    isAdmin: isAdmin,
    // 자동저장(주기적) 훅
    autosave: function () { if (S.email && S.profile && S.dirty && S.status !== 'submitted') saveForm('draft'); },
    _state: S
  };
})();
