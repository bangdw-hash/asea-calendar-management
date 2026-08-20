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
  var KIND_BROADCAST = 'competency_broadcast';   // 관리자 전사반영 항목(연도별 1행, data.items 배열)

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
    adminTab: 'list',     // 'list' | 'analysis'
    adminSort: { key: 'dept', dir: 1 },   // key + 방향(1 오름차순/-1 내림차순)
    adminSel: {},         // 선택된 ref 맵 { ref: true }
    analysis: { keywords: '', depts: [], jobGroup: '', results: null, sort: null },
    // 작성자 폼 표 정렬(경로별): { 'jobs': {key,dir}, 'admin.projects': {...}, ... }
    formSort: {},
  };

  /* ── 유틸 ─────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function isAdmin() { return (S.email || '').toLowerCase() === ADMIN_EMAIL; }
  function nowIso() { return new Date().toISOString(); }

  /* 서술형(rte) 필드 저장값 → 화면 삽입용 HTML.
     새로 입력된 값은 이미 브라우저의 기본 Enter 처리 결과(줄마다 <div>/<p> 또는 <br>)와
     글자 크기 조절용 <span style="font-size">를 포함한 안전한 HTML이고, 이전 버전에 저장된
     순수 텍스트(개행 문자 \n 포함) 값도 안전하게 escape 후 변환한다. */
  function toRteHtml(raw) {
    raw = raw == null ? '' : String(raw);
    if (/<br\s*\/?>|<div[\s>]|<p[\s>]|<span[^>]*font-size/i.test(raw)) return raw;   // 이미 우리 형식의 HTML
    return esc(raw).replace(/\r\n|\n/g, '<br>');
  }
  // rte HTML → 순수 텍스트(검색·CSV·마크다운 내보내기용). <br>/블록 경계는 공백으로
  // 치환한 뒤 읽어 줄이 바뀌는 지점에서 단어가 서로 붙어버리지 않게 한다.
  function stripHtml(html) {
    if (!html) return '';
    var d = document.createElement('div');
    // 여는/닫는 태그 경계 모두를 공백으로 치환 — 여는 태그 앞의 텍스트("word1<div>word2</div>")도
    // 분리되어야 붙어버리지 않는다.
    d.innerHTML = String(html).replace(/<br\s*\/?>/gi, ' ').replace(/<\/?(div|p)[^>]*>/gi, ' ');
    return (d.textContent || d.innerText || '').replace(/[ \t]+/g, ' ').trim();
  }
  // 입사일(YYYY-MM-DD) → 오늘 기준 전체근무경력("N년 M개월") 자동 계산
  function calcTotalCareer(hireDateStr) {
    if (!hireDateStr) return '';
    var hd = new Date(hireDateStr);
    if (isNaN(hd.getTime())) return '';
    var now = new Date();
    if (hd > now) return '';
    var years = now.getFullYear() - hd.getFullYear();
    var months = now.getMonth() - hd.getMonth();
    if (now.getDate() < hd.getDate()) months -= 1;
    if (months < 0) { years -= 1; months += 12; }
    if (years < 0) return '';
    var parts = [];
    if (years > 0) parts.push(years + '년');
    parts.push(months + '개월');
    return parts.join(' ');
  }
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
  /* ── 강의시수·지도학생 자동계산 유틸(순수 함수 — DOM 접근 없음) ──── */
  function numOrZero(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function pctStr(num, den) { den = numOrZero(den); if (den <= 0) return ''; return (numOrZero(num) / den * 100).toFixed(1) + '%'; }
  // 관리자 화면 등에서 이전 버전/불완전한 레코드를 열람할 수 있으므로, 하위 객체가
  // 없어도 안전하게 동작하도록 필요한 형태를 보장한다.
  function ensureLectureShape(lec) {
    ['banSu', 'credit', 'nonCredit', 'etc', 'total'].forEach(function (k) { if (!lec[k]) lec[k] = {}; });
    return lec;
  }
  // 전체시수(월별) = 학점 + 비학점 + 기타시수 자동 합산
  function computeLectureTotals(lec) {
    ensureLectureShape(lec);
    MONTHS.forEach(function (m) {
      var hasAny = lec.credit[m] !== '' || lec.nonCredit[m] !== '' || lec.etc[m] !== '';
      lec.total[m] = hasAny ? String(numOrZero(lec.credit[m]) + numOrZero(lec.nonCredit[m]) + numOrZero(lec.etc[m])) : '';
    });
  }
  // 해당 행(반수/학점/비학점/기타/전체)의 12개월 평균
  function lectureYearAvg(lec, key) {
    ensureLectureShape(lec);
    var sum = 0; MONTHS.forEach(function (m) { sum += numOrZero(lec[key][m]); });
    return (sum / 12).toFixed(1);
  }
  // 지도학생 행: 수료=등록-휴학-자퇴, 등록유지율=수료/등록, 계=1+2학기 합, 수료율=계수료/계등록
  function computeStudentRow(r) {
    r.s1 = r.s1 || { reg: '', leave: '', drop: '', done: '', rate: '' };
    r.s2 = r.s2 || { reg: '', leave: '', drop: '', done: '', rate: '' };
    r.sum = r.sum || { reg: '', done: '', rate: '' };
    var s1has = r.s1.reg !== '' || r.s1.leave !== '' || r.s1.drop !== '';
    if (s1has) {
      r.s1.done = String(Math.max(0, numOrZero(r.s1.reg) - numOrZero(r.s1.leave) - numOrZero(r.s1.drop)));
      r.s1.rate = pctStr(r.s1.done, r.s1.reg);
    } else { r.s1.done = ''; r.s1.rate = ''; }
    var s2has = r.s2.reg !== '' || r.s2.leave !== '' || r.s2.drop !== '';
    if (s2has) {
      r.s2.done = String(Math.max(0, numOrZero(r.s2.reg) - numOrZero(r.s2.leave) - numOrZero(r.s2.drop)));
      r.s2.rate = pctStr(r.s2.done, r.s2.reg);
    } else { r.s2.done = ''; r.s2.rate = ''; }
    if (s1has || s2has) {
      r.sum.reg = String(numOrZero(r.s1.reg) + numOrZero(r.s2.reg));
      r.sum.done = String(numOrZero(r.s1.done) + numOrZero(r.s2.done));
      r.sum.rate = pctStr(r.sum.done, r.sum.reg);
    } else { r.sum.reg = ''; r.sum.done = ''; r.sum.rate = ''; }
  }

  function blankProject() { return { period: '', name: '', role: '' }; }
  function blankStudentRow(yr) {
    return {
      year: yr,
      s1: { reg: '', leave: '', drop: '', done: '', rate: '' },
      s2: { reg: '', leave: '', drop: '', done: '', rate: '' },
      sum: { reg: '', done: '', rate: '' }
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
  // input/select/textarea는 .value, 서술형(rte) contenteditable은 .innerHTML을 값으로 사용
  function elValue(el) {
    return el.hasAttribute('contenteditable') ? el.innerHTML : el.value;
  }
  // 입력값을 S.form 으로 수집(data-path 속성 기반)
  function syncFormFromInputs() {
    if (!S.root) return;
    var els = S.root.querySelectorAll('[data-path]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      setByPath(S.form, el.getAttribute('data-path'), elValue(el));
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
  /* ── 인앱 브라우저 감지 ───────────────────────────────────────────
     카카오톡·네이버·라인·인스타그램·페이스북 등 인앱(웹뷰) 브라우저는
     Google이 정책적으로 로그인을 차단한다(disallowed_useragent) — 코드 문제가 아니라
     Google Identity Services 자체가 이런 웹뷰에서 초기화되지 않거나 거부된다.
     로그인 시도 전에 감지해 "기본 브라우저로 열기"를 안내한다. */
  function detectInAppBrowser() {
    var ua = navigator.userAgent || '';
    if (/KAKAOTALK/i.test(ua)) return { blocked: true, name: '카카오톡', scheme: 'kakaotalk://web/openExternal?url=' };
    if (/NAVER\(/i.test(ua)) return { blocked: true, name: '네이버 앱', scheme: null };
    if (/Line\//i.test(ua)) return { blocked: true, name: '라인', scheme: null };
    if (/FBAN|FBAV|FB_IAB/i.test(ua)) return { blocked: true, name: '페이스북', scheme: null };
    if (/Instagram/i.test(ua)) return { blocked: true, name: '인스타그램', scheme: null };
    // 일반 안드로이드 웹뷰(브랜드 앱 등): Chrome이지만 'Version/' 토큰이 없고 'wv' 포함
    if (/Android/i.test(ua) && /; wv\)/i.test(ua)) return { blocked: true, name: '앱 내장 브라우저', scheme: null };
    return { blocked: false };
  }
  function openInExternalBrowser(info) {
    var url = location.href;
    if (info.scheme) {
      location.href = info.scheme + encodeURIComponent(url);
      return;
    }
    try {
      navigator.clipboard.writeText(url).then(function () {
        toast('링크를 복사했습니다. 우측 상단 메뉴(⋮ 또는 •••)에서 "다른 브라우저로 열기"를 선택하거나, Chrome/Samsung Internet에 붙여넣어 접속해 주세요.', 'info');
      });
    } catch (e) {
      toast('우측 상단 메뉴(⋮ 또는 •••)에서 "다른 브라우저로 열기"를 선택해 접속해 주세요.', 'info');
    }
  }
  function inAppWarningHtml(info) {
    return '<div class="asm-inapp-warn">' +
      '<b>⚠️ ' + esc(info.name) + ' 인앱 브라우저에서는 Google 로그인이 차단됩니다.</b>' +
      '<p>Google 정책상 카카오톡·네이버·인스타그램 등 앱 내장 브라우저에서는 로그인 창이 열리지 않습니다. 아래 버튼으로 <b>기본 브라우저(Chrome/Samsung Internet 등)</b>에서 열어 주세요.</p>' +
      '<button class="asm-btn asm-btn-primary" id="asm-open-external">' + (info.scheme ? '기본 브라우저로 열기' : '링크 복사(브라우저에 붙여넣기)') + '</button>' +
    '</div>';
  }

  function renderLogin() {
    var inapp = detectInAppBrowser();
    S.root.innerHTML =
      '<div class="asm-gate">' +
        '<div class="asm-gate-card">' +
          '<div class="asm-gate-icon">📋</div>' +
          '<h1 class="asm-gate-title">개인별 직무역량 자가진단</h1>' +
          '<p class="asm-gate-desc">본 진단표는 개인별 직무역량을 파악하고 연말 인사고과 평가에 반영하기 위한 자료입니다.<br>' +
          '개인 <b>Google 계정</b>으로 로그인하면 작성 기록이 안전하게 저장되어, 다른 컴퓨터에서도 이어서 작성할 수 있습니다.</p>' +
          (inapp.blocked ? inAppWarningHtml(inapp) : '') +
          '<button class="asm-btn asm-btn-primary asm-btn-lg" id="asm-login-btn"' + (inapp.blocked ? ' disabled' : '') + '>' +
            '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#fff" d="M12 11v2.9h4.1c-.2 1-.9 2.5-2.6 3.3l-.02.1 2.5 1.9.2.02C18.9 17.6 20 15 20 12.2c0-.7-.1-1.3-.2-1.8H12z"/><path fill="#fff" d="M12 20c2.4 0 4.4-.8 5.8-2.1l-2.8-2.1c-.7.5-1.7.9-3 .9-2.3 0-4.2-1.5-4.9-3.6H4.2v2.2C5.6 18 8.5 20 12 20z" opacity=".85"/><path fill="#fff" d="M7.1 13.1c-.2-.5-.3-1.1-.3-1.6s.1-1.1.3-1.6V7.7H4.2C3.7 8.8 3.4 10 3.4 11.5s.3 2.7.8 3.8l2.9-2.2z" opacity=".6"/><path fill="#fff" d="M12 6.6c1.3 0 2.2.6 2.7 1l2-2C15.4 4.4 13.9 3.6 12 3.6 8.5 3.6 5.6 5.6 4.2 8.5l2.9 2.2C7.8 8.5 9.7 6.6 12 6.6z" opacity=".9"/></svg>' +
            'Google 계정으로 로그인' +
          '</button>' +
          '<p class="asm-gate-foot">주관: 기획처 · 제출기한: 2026. 12. 11.</p>' +
        '</div>' +
      '</div>';
    var openBtn = S.root.querySelector('#asm-open-external');
    if (openBtn) openBtn.addEventListener('click', function () { openInExternalBrowser(inapp); });
    var btn = S.root.querySelector('#asm-login-btn');
    btn.addEventListener('click', function () {
      btn.disabled = true; btn.textContent = '로그인 중…';
      if (window.Auth && Auth.login) {
        // 계정 선택 화면을 강제로 띄워 팝업이 클릭 제스처에 확실히 연결되도록 한다.
        Auth.login({ chooseAccount: true }).then(function () {}).catch(function (e) {
          try { console.error('[assessment] login rejected:', e); } catch (_) {}
          btn.disabled = false; btn.textContent = 'Google 계정으로 로그인';
          var again = detectInAppBrowser();
          var msg = again.blocked
            ? again.name + ' 인앱 브라우저에서는 Google 로그인이 차단됩니다. 기본 브라우저로 열어 주세요.'
            : '로그인 창을 열지 못했습니다. 팝업 차단을 해제하고 다시 시도해 주세요.' + (e && e.message ? ' (' + e.message + ')' : '');
          toast(msg, 'error');
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
      // 현재 연도 폼 준비 + 메타 반영 + 전사반영 항목 병합(신규 계정도 자동 적용)
      ensureFormLoaded().then(function () {
        applyProfileToForm();
        return mergeBroadcastForYear(S.year);
      }).then(function (changed) {
        if (changed) persistFormSilently();
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

  /* ── 관리자 전사반영(개인역량개발 일괄 적용) ────────────────────────
     관리자가 자신의 「개인역량개발」 행 옆 [전사반영] 버튼을 누르면, 그 행 내용이
     연도별 공용 저장소(kind=competency_broadcast, ref=연도)에 추가되고, 이후
     그 연도 폼을 불러오는 모든 계정(기존 작성자·신규 작성자 모두)의 개인역량개발
     맨 위에 자동으로 삽입된다. 이미 적용된 항목은 meta.appliedBroadcastIds 로
     추적해 다시 불러와도 중복 삽입되지 않는다(사용자가 삭제해도 재삽입되지 않음). */
  function fetchBroadcastItems(year) {
    if (!(window.CloudForms && CloudForms.ready())) return Promise.resolve([]);
    return CloudForms.list(KIND_BROADCAST).then(function (res) {
      if (!res.ok) return [];
      var row = (res.rows || []).filter(function (r) { return r.ref === String(year); })[0];
      return (row && row.data && row.data.items) || [];
    }).catch(function () { return []; });
  }
  function mergeBroadcastIntoForm(form, items) {
    if (!form || !items || !items.length) return false;
    if (!Array.isArray(form.meta.appliedBroadcastIds)) form.meta.appliedBroadcastIds = [];
    var applied = form.meta.appliedBroadcastIds;
    var toInsert = items.filter(function (it) { return applied.indexOf(it.id) < 0; });
    if (!toInsert.length) return false;
    for (var i = toInsert.length - 1; i >= 0; i--) {   // 나중 반영분이 맨 위로 오도록 역순 unshift
      var it = toInsert[i];
      form.development.unshift({
        div: it.div || '', course: it.course || '', org: it.org || '', period: it.period || '',
        cost: it.cost || '', content: it.content || '', scope: it.scope || '', broadcastId: it.id
      });
      applied.push(it.id);
    }
    return true;
  }
  // 연도의 전사반영 항목을 조회해 현재 S.form에 병합. 변경되었으면 true를 resolve.
  function mergeBroadcastForYear(year) {
    return fetchBroadcastItems(year).then(function (items) {
      if (String(S.year) !== String(year) || !S.form) return false;   // 그 사이 연도가 바뀌었으면 무시
      return mergeBroadcastIntoForm(S.form, items);
    });
  }
  // 토스트 없이 현재 폼을 로컬+클라우드에 조용히 저장(전사반영 병합 직후 자동 반영용)
  function persistFormSilently() {
    saveFormLocal(S.year, { form: S.form, status: S.status, updatedAt: S.lastSavedAt });
    if (!(window.CloudForms && CloudForms.ready()) || !S.email) return;
    var name = (S.profile && S.profile.name) || (S.form.meta && S.form.meta.name) || '';
    var ref = S.email + '::' + S.year;
    CloudForms.save(KIND_FORM, ref, name, S.status, { form: S.form, status: S.status, updatedAt: S.lastSavedAt, email: S.email, year: S.year }).catch(function () {});
  }
  // 관리자: 개인역량개발 특정 행을 전체 인원에게 일괄 반영
  function broadcastDevRow(idx) {
    if (!isAdmin()) return;
    syncFormFromInputs();
    var row = S.form.development[idx];
    if (!row || (!row.course && !row.div && !stripHtml(row.content))) {
      toast('반영할 내용(구분·교육과정명·교육 내용 등)을 먼저 입력해 주세요.', 'error');
      return;
    }
    if (!confirm('이 항목을 전체 인원(신규 계정 포함)의 개인역량개발 맨 위에 일괄 반영하시겠습니까?\n각자 기존에 작성한 내용은 아래로 밀려 그대로 유지됩니다.')) return;
    if (!(window.CloudForms && CloudForms.ready())) { toast('클라우드에 연결되지 않아 전사반영을 저장할 수 없습니다.', 'error'); return; }
    var id = 'bc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    var item = { id: id, div: row.div, course: row.course, org: row.org, period: row.period, cost: row.cost, content: row.content, scope: row.scope, createdAt: nowIso() };
    fetchBroadcastItems(S.year).then(function (items) {
      items.push(item);
      return CloudForms.save(KIND_BROADCAST, String(S.year), '', 'active', { items: items });
    }).then(function (r) {
      if (!r || r.ok === false) { toast('전사반영 저장에 실패했습니다: ' + ((r && r.err) || '알 수 없는 오류'), 'error'); return; }
      // 관리자 자신의 목록에서도 해당 행을 맨 위로 이동 + 적용 표시(중복 재삽입 방지)
      S.form.development.splice(idx, 1);
      row.broadcastId = id;
      S.form.development.unshift(row);
      if (!Array.isArray(S.form.meta.appliedBroadcastIds)) S.form.meta.appliedBroadcastIds = [];
      S.form.meta.appliedBroadcastIds.push(id);
      markDirty();
      renderForm();
      toast('전사반영 완료! 신규 계정을 포함한 모든 인원의 개인역량개발 맨 위에 표시됩니다.', 'success');
    }).catch(function (e) { toast('전사반영 실패: ' + ((e && e.message) || e), 'error'); });
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
    // 입사일 기준 전체근무경력을 오늘 날짜로 항상 자동 계산(수동 입력 불가) — 현직무경력만 수동.
    var totalCareer = calcTotalCareer(m.hireDate);
    if (totalCareer) m.totalCareer = totalCareer;
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
          '<th>전체근무경력 <small class="asm-auto-badge">자동</small></th><td><input id="asm-total-career" class="asm-cell-input asm-cell-readonly" value="' + esc(m.totalCareer || '') + '" readonly title="입사일 기준으로 오늘 날짜까지 자동 계산됩니다"></td>' +
          '<th>현직무경력</th><td><input data-path="meta.currentCareer" class="asm-cell-input" placeholder="예: 4년" value="' + esc(m.currentCareer) + '"></td>' +
        '</tr>' +
        '<tr>' +
          '<th>직 군</th><td><select data-path="meta.jobGroup" id="asm-jobgroup" class="asm-cell-input">' + jgOpts + '</select></td>' +
          '<th>주요 자격·면허</th><td colspan="3">' + rte('meta.licenses', m.licenses, '해당 자격증·면허·인증 등 모두 기재') + '</td>' +
        '</tr>' +
        '<tr>' +
          '<th>직책업무 요약</th><td colspan="5">' + rte('meta.roleSummary', m.roleSummary, '', 'asm-rte-lg') + '</td>' +
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
        '<td>' + rte('jobs.' + i + '.content', j.content, '구체적 업무 내용') + '</td>' +
        '<td>' + rte('jobs.' + i + '.competency', j.competency, '기술·지식') + '</td>' +
        '<td><select data-path="jobs.' + i + '.cycle" class="asm-cell-input asm-cell-sm">' + cyc + '</select></td>' +
        '<td><input data-path="jobs.' + i + '.relDept" class="asm-cell-input asm-cell-sm" value="' + esc(j.relDept) + '"></td>' +
        '<td class="asm-td-del"><button class="asm-rowdel" data-arr="jobs" data-idx="' + i + '" title="행 삭제">✕</button></td>' +
      '</tr>';
    }).join('');
    return section('2', '직무 분석',
      '<div class="asm-scroll"><table class="asm-table asm-table-grid">' +
        '<thead><tr>' +
          '<th class="asm-td-no">No</th>' + fsh('jobs', 'group', '직무구분') + fsh('jobs', 'title', '직무(업무)명') + '<th>업무 내용<br><small>(구체적)</small></th>' +
          '<th>필요역량<br><small>(기술·지식)</small></th>' + fsh('jobs', 'cycle', '수행<br>주기') + fsh('jobs', 'relDept', '관련부서') + '<th></th>' +
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
        '<td>' + rte('performance.' + i + '.result', p.result, '업무 성과 및 기여 내용 (수치·결과 포함)') + '</td>' +
        '<td>' + rte('performance.' + i + '.note', p.note, '협력부서·근거') + '</td>' +
        '<td class="asm-td-del"><button class="asm-rowdel" data-arr="performance" data-idx="' + i + '" title="행 삭제">✕</button></td>' +
      '</tr>';
    }).join('');
    return section('3', S.year + '년도 업무 성과 및 기여',
      '<div class="asm-scroll"><table class="asm-table asm-table-grid">' +
        '<thead><tr>' + fsh('performance', 'category', '구분') + fsh('performance', 'task', '해당 업무') + '<th>업무 성과 및 기여 내용 <small>(수치·결과 포함)</small></th><th>비고<br><small>(협력부서·근거)</small></th><th></th></tr></thead>' +
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
        '<td>' + rte('admin.projects.' + i + '.role', p.role, '담당업무 및 사업성과') + '</td>' +
        '<td class="asm-td-del"><button class="asm-rowdel" data-arr="admin.projects" data-idx="' + i + '" title="행 삭제">✕</button></td>' +
      '</tr>';
    }).join('');

    return '<h4 class="asm-h4">4-1-1. 연간 기안 상신 건수 <span class="asm-tag">행정직</span></h4>' +
      '<div class="asm-scroll"><table class="asm-table asm-table-month">' + head + body + '</table></div>' +
      '<h4 class="asm-h4">4-1-2. 연간 참여 사업 <span class="asm-tag">행정직</span></h4>' +
      '<div class="asm-scroll"><table class="asm-table asm-table-grid">' +
        '<thead><tr><th class="asm-td-no">연번</th>' + fsh('admin.projects', 'period', '사업 기간') + fsh('admin.projects', 'name', '참여 사업명') + '<th>담당업무 및 사업성과</th><th></th></tr></thead>' +
        '<tbody>' + projRows + '</tbody></table></div>' +
      '<div class="asm-rowadd"><button class="asm-btn asm-btn-ghost asm-btn-sm" data-add="admin.projects">+ 참여 사업 추가</button></div>';
  }

  /* 4-2 교무직 */
  function sec4Faculty() {
    var f = S.form.faculty;
    computeLectureTotals(f.lecture);
    var monthHead = '<tr><th>구분</th>' + MONTHS.map(function (m) { return '<th>' + m + '</th>'; }).join('') + '<th>연평균</th></tr>';
    var lecRow = function (label, key, editable) {
      var cells = MONTHS.map(function (m) {
        if (editable) return '<td><input data-path="faculty.lecture.' + key + '.' + m + '" class="asm-cell-input asm-cell-num" inputmode="numeric" value="' + esc(f.lecture[key][m]) + '"></td>';
        return '<td><input id="asm-lec-total-' + m + '" class="asm-cell-input asm-cell-num asm-cell-readonly" readonly value="' + esc(f.lecture[key][m]) + '"></td>';
      }).join('');
      return '<tr><th>' + label + '</th>' + cells + '<td class="asm-sum" id="asm-avg-lec-' + key + '">' + lectureYearAvg(f.lecture, key) + '</td></tr>';
    };
    var lecture =
      '<h4 class="asm-h4">4-2-1. 개인별 강의시수 <span class="asm-tag asm-tag-fac">교무직</span></h4>' +
      '<div class="asm-scroll"><table class="asm-table asm-table-month">' +
        monthHead +
        lecRow('반수', 'banSu', true) +
        lecRow('학점 시수', 'credit', true) +
        lecRow('비학점 시수', 'nonCredit', true) +
        lecRow('기타시수(국비 등)', 'etc', true) +
        lecRow('전체시수', 'total', false) +
      '</table></div>' +
      '<p class="asm-hint">※ 전체시수 = 학점 + 비학점 + 기타시수(자동 계산). 연평균은 12개월 평균입니다.</p>' +
      rte('faculty.lecture.note', f.lecture.note, '※ 비고: 참고사항 자유롭게 기재', 'asm-note-input');

    var stuRows = f.students.map(function (r, i) {
      computeStudentRow(r);
      var edCell = function (path, v) { return '<td><input data-path="' + path + '" class="asm-cell-input asm-cell-num" value="' + esc(v) + '"></td>'; };
      var roCell = function (id, v) { return '<td><input id="' + id + '" class="asm-cell-input asm-cell-num asm-cell-readonly" readonly value="' + esc(v) + '"></td>'; };
      return '<tr>' +
        '<td><input data-path="faculty.students.' + i + '.year" class="asm-cell-input asm-cell-sm" value="' + esc(r.year) + '"></td>' +
        edCell('faculty.students.' + i + '.s1.reg', r.s1.reg) + edCell('faculty.students.' + i + '.s1.leave', r.s1.leave) +
        edCell('faculty.students.' + i + '.s1.drop', r.s1.drop) +
        roCell('asm-stu-' + i + '-s1done', r.s1.done) + roCell('asm-stu-' + i + '-s1rate', r.s1.rate) +
        edCell('faculty.students.' + i + '.s2.reg', r.s2.reg) + edCell('faculty.students.' + i + '.s2.leave', r.s2.leave) +
        edCell('faculty.students.' + i + '.s2.drop', r.s2.drop) +
        roCell('asm-stu-' + i + '-s2done', r.s2.done) + roCell('asm-stu-' + i + '-s2rate', r.s2.rate) +
        roCell('asm-stu-' + i + '-sumreg', r.sum.reg) + roCell('asm-stu-' + i + '-sumdone', r.sum.done) + roCell('asm-stu-' + i + '-sumrate', r.sum.rate) +
        '<td class="asm-td-del"><button class="asm-rowdel" data-arr="faculty.students" data-idx="' + i + '" title="행 삭제">✕</button></td>' +
      '</tr>';
    }).join('');
    var students =
      '<h4 class="asm-h4">4-2-2. 지도교수 학생관리 현황 <span class="asm-tag asm-tag-fac">교무직</span></h4>' +
      '<div class="asm-scroll"><table class="asm-table asm-table-grid asm-table-student">' +
        '<thead>' +
          '<tr>' + '<th rowspan="2" class="asm-fsort" data-fsort="faculty.students::year" title="클릭하여 정렬">연도 ' + (S.formSort['faculty.students'] && S.formSort['faculty.students'].key === 'year' ? '<span class="asm-sort-ico on">' + (S.formSort['faculty.students'].dir > 0 ? '▲' : '▼') + '</span>' : '<span class="asm-sort-ico">⇅</span>') + '</th><th colspan="5">1학기</th><th colspan="5">2학기</th><th colspan="3">계</th><th rowspan="2"></th></tr>' +
          '<tr><th>등록</th><th>휴학</th><th>자퇴</th><th>수료</th><th>등록유지율</th><th>등록</th><th>휴학</th><th>자퇴</th><th>수료</th><th>등록유지율</th><th>등록</th><th>수료</th><th>수료율</th></tr>' +
        '</thead><tbody>' + stuRows + '</tbody></table></div>' +
        '<div class="asm-rowadd"><button class="asm-btn asm-btn-ghost asm-btn-sm" data-add="faculty.students">+ 연도 행 추가</button></div>' +
      '<p class="asm-hint">※ 수료=등록-휴학-자퇴, 등록유지율=수료÷등록, 계=1·2학기 합, 수료율=계 수료÷계 등록 (모두 자동 계산).</p>' +
      rte('faculty.studentsNote', f.studentsNote, '※ 비고: 참고사항 자유롭게 기재', 'asm-note-input');

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
    var admin = isAdmin();
    var rows = S.form.development.map(function (d, i) {
      var badge = d.broadcastId ? '<span class="asm-bcast-badge" title="관리자가 전사에 일괄 반영한 항목입니다">🏢 전사반영</span>' : '';
      // 관리자 전용 열: 좁은 삭제(✕) 열에 끼워 넣으면 표 오른쪽 끝으로 밀려 눈에 잘 안 띄므로
      // 별도의 넓은 열로 분리해 맨 왼쪽 가까이(구분 열 앞)에 크게 배치한다.
      var bcastCell = admin
        ? '<td class="asm-td-bcast"><button class="asm-broadcast-btn" data-bcast-idx="' + i + '" title="이 항목을 전체 인원의 개인역량개발 맨 위에 일괄 반영">🏢 전사반영</button></td>'
        : '';
      return '<tr' + (d.broadcastId ? ' class="asm-row-bcast"' : '') + '>' +
        bcastCell +
        '<td>' + badge + '<input data-path="development.' + i + '.div" class="asm-cell-input asm-cell-sm" value="' + esc(d.div) + '" placeholder="예: 2026년(실시)"></td>' +
        '<td><input data-path="development.' + i + '.course" class="asm-cell-input" placeholder="교육과정명" value="' + esc(d.course) + '"></td>' +
        '<td><input data-path="development.' + i + '.org" class="asm-cell-input asm-cell-sm" placeholder="주관기관" value="' + esc(d.org) + '"></td>' +
        '<td><input data-path="development.' + i + '.period" class="asm-cell-input asm-cell-sm" placeholder="시간" value="' + esc(d.period) + '"></td>' +
        '<td><input data-path="development.' + i + '.cost" class="asm-cell-input asm-cell-sm" placeholder="비용" value="' + esc(d.cost) + '"></td>' +
        '<td>' + rte('development.' + i + '.content', d.content, '교육 내용') + '</td>' +
        '<td>' + rte('development.' + i + '.scope', d.scope, '업무반영범위') + '</td>' +
        '<td class="asm-td-del"><button class="asm-rowdel" data-arr="development" data-idx="' + i + '" title="행 삭제">✕</button></td>' +
      '</tr>';
    }).join('');
    var bcastHead = admin ? '<th class="asm-td-bcast-h">전사반영</th>' : '';
    return section('5', '개인역량개발 <small>(교육 이수·희망)</small>',
      (admin ? '<p class="asm-hint asm-bcast-hint">🏢 관리자 전용: 각 행 맨 왼쪽의 [전사반영] 버튼을 누르면 해당 내용이 전체 인원(신규 계정 포함)의 개인역량개발 맨 위에 일괄 반영됩니다.</p>' : '') +
      '<div class="asm-scroll"><table class="asm-table asm-table-grid">' +
        '<thead><tr>' + bcastHead + fsh('development', 'div', '구분') + fsh('development', 'course', '교육과정명') + fsh('development', 'org', '주관기관') + '<th>교육기간<br><small>(시간)</small></th><th>비용</th><th>교육 내용</th><th>업무반영범위</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="asm-rowadd"><button class="asm-btn asm-btn-ghost asm-btn-sm" data-add="development">+ 교육 행 추가</button></div>');
  }

  /* 6. 애로사항 및 건의 */
  function sec6() {
    var s = S.form.issues;
    return section('6', '직무 관련 애로사항 및 건의',
      '<table class="asm-table asm-table-info">' +
        '<tr><th>애로사항</th><td>' + rte('issues.difficulty', s.difficulty, '', 'asm-rte-lg') + '</td></tr>' +
        '<tr><th>개선사항 건의</th><td>' + rte('issues.improvement', s.improvement, '', 'asm-rte-lg') + '</td></tr>' +
        '<tr><th>' + (parseInt(S.year, 10) + 1) + '년 목표 및 계획</th><td>' + rte('issues.nextPlan', s.nextPlan, '', 'asm-rte-lg') + '</td></tr>' +
      '</table>');
  }

  function sectionHead(no, title) {
    return '<div class="asm-sec-head"><span class="asm-sec-no">' + no + '</span><h3 class="asm-sec-title">' + title + '</h3></div>';
  }
  function section(no, title, body) {
    return '<div class="asm-section">' + sectionHead(no, title) + '<div class="asm-sec-body">' + body + '</div></div>';
  }

  /* 서술형 입력 셀(rte) — Enter로 줄바꿈되는 주관식 입력 + 선택 글자 크기 조절.
     <textarea> 대신 contenteditable div를 사용해 부분 선택 글자 크기 조절(가- / 가+)을 지원한다. */
  function rte(path, value, placeholder, extraClass) {
    return '<div class="asm-cell-input asm-rte' + (extraClass ? ' ' + extraClass : '') + '" contenteditable="true" ' +
      'data-path="' + path + '" data-ph="' + esc(placeholder || '') + '">' + toRteHtml(value) + '</div>';
  }

  /* ── 작성자 폼 표 정렬(직무 분석/업무 성과) ─────────────────────
     헤더를 클릭하면 엑셀처럼 해당 열 기준으로 행을 정렬한다.
     직무구분(주·부·희망업무)·구분(학교·부서·개인·기타)·수행주기는 지정된 순서로,
     그 외 텍스트 열은 한글 사전순으로 정렬한다. */
  // path: 배열 경로('jobs','performance','admin.projects','faculty.students','development')
  function fsh(path, key, label) {
    var s = S.formSort[path];
    var ico = (s && s.key === key)
      ? '<span class="asm-sort-ico on">' + (s.dir > 0 ? '▲' : '▼') + '</span>'
      : '<span class="asm-sort-ico">⇅</span>';
    return '<th class="asm-fsort" data-fsort="' + path + '::' + key + '" title="클릭하여 정렬">' + label + ' ' + ico + '</th>';
  }
  function sortFormArray(path, key) {
    syncFormFromInputs();
    var s = S.formSort[path] || (S.formSort[path] = { key: '', dir: 1 });
    if (s.key === key) s.dir *= -1; else { s.key = key; s.dir = 1; }
    var arr = getArr(path);
    if (!Array.isArray(arr)) return;
    var orderOf = function (list, v) { var i = list.indexOf(v); return i < 0 ? 999 : i; };
    var val = function (o) {
      switch (path) {
        case 'jobs':
          if (key === 'group') return orderOf(JOB_KINDS, o.group);
          if (key === 'cycle') return orderOf(CYCLES, o.cycle);
          return o[key] || '';                       // title, relDept
        case 'performance':
          if (key === 'category') return orderOf(PERF_CATS, o.category);
          return o[key] || '';                       // task
        case 'admin.projects':                       // period, name
          return o[key] || '';
        case 'faculty.students':                     // year (숫자 우선)
          var n = parseFloat(o[key]); return isNaN(n) ? (o[key] || '') : n;
        case 'development':                          // div, course, org
          return o[key] || '';
        default: return o[key] || '';
      }
    };
    arr.sort(function (a, b) {
      var va = val(a), vb = val(b), c;
      if (typeof va === 'number' && typeof vb === 'number') c = va - vb;
      else c = String(va).localeCompare(String(vb), 'ko');
      return c * s.dir;
    });
    markDirty();
    renderForm();
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
        if (S.form) setByPath(S.form, t.getAttribute('data-path'), elValue(t));
        markDirty();
        if (t.hasAttribute('data-sum')) recalcSums();
        autoGrow(t);
        var dp = t.getAttribute('data-path') || '';
        if (dp === 'meta.hireDate') updateTotalCareerDisplay();
        if (/^faculty\.lecture\.(banSu|credit|nonCredit|etc)\.\d+$/.test(dp)) recalcLectureTotalsDisplay();
        var stuM = dp.match(/^faculty\.students\.(\d+)\.(s1|s2)\.(reg|leave|drop)$/);
        if (stuM) recalcStudentRowDisplay(parseInt(stuM[1], 10));
      }
    });
    // 서술형(rte) 입력: Enter는 가로채지 않고 브라우저 기본 동작에 맡긴다.
    // (Range API로 <br>을 직접 삽입하면, 줄 끝에서의 캐럿 위치가 브라우저 렌더링
    //  주기 사이에 정규화되어 다음 글자가 br 앞으로 들어가는 문제가 실제 타이핑
    //  환경에서도 재현됨 — 브라우저 자체 Enter 처리가 훨씬 안정적이다.
    //  결과로 생기는 <div>/<p> 줄바꿈은 toRteHtml()/stripHtml()에서 함께 처리한다.)

    // 서술형(rte) 붙여넣기: 서식 없는 텍스트만 삽입(외부 서식·태그 유입 방지)
    S.root.addEventListener('paste', function (e) {
      if (e.target && e.target.matches && e.target.matches('.asm-rte')) {
        e.preventDefault();
        var text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
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
      // 작성자 폼 표 정렬 헤더(직무 분석/업무 성과)
      var fso = e.target.closest ? e.target.closest('.asm-fsort') : null;
      if (fso && fso.hasAttribute('data-fsort')) {
        var spec = fso.getAttribute('data-fsort').split('::');
        sortFormArray(spec[0], spec[1]);
        return;
      }
      var t = e.target.closest ? e.target.closest('button, .asm-year-tab') : null;
      if (!t) return;
      if (t.classList.contains('asm-year-tab') && t.hasAttribute('data-year')) { switchYear(t.getAttribute('data-year')); return; }
      if (t.hasAttribute('data-add')) { addRow(t.getAttribute('data-add')); return; }
      if (t.classList.contains('asm-rowdel')) { delRow(t.getAttribute('data-arr'), parseInt(t.getAttribute('data-idx'), 10)); return; }
      if (t.hasAttribute('data-bcast-idx')) { broadcastDevRow(parseInt(t.getAttribute('data-bcast-idx'), 10)); return; }
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

    initRteToolbar();
  }

  // 입사일 변경 시 전체근무경력 표시를 즉시 갱신(전체 재렌더 없이)
  function updateTotalCareerDisplay() {
    if (!S.form) return;
    var computed = calcTotalCareer(S.form.meta.hireDate);
    S.form.meta.totalCareer = computed;
    var el = S.root && S.root.querySelector('#asm-total-career');
    if (el) el.value = computed;
  }

  // 강의시수 월별 입력 변경 → 전체시수·연평균을 재계산해 화면에 즉시 반영(전체 재렌더 없이)
  function recalcLectureTotalsDisplay() {
    if (!S.form || !S.form.faculty) return;
    var lec = S.form.faculty.lecture;
    computeLectureTotals(lec);
    MONTHS.forEach(function (m) {
      var el = S.root.querySelector('#asm-lec-total-' + m);
      if (el) el.value = lec.total[m];
    });
    ['banSu', 'credit', 'nonCredit', 'etc', 'total'].forEach(function (key) {
      var el = S.root.querySelector('#asm-avg-lec-' + key);
      if (el) el.textContent = lectureYearAvg(lec, key);
    });
  }
  // 지도학생 행 입력 변경 → 수료·등록유지율·계·수료율을 재계산해 화면에 즉시 반영
  function recalcStudentRowDisplay(i) {
    if (!S.form || !S.form.faculty) return;
    var r = S.form.faculty.students[i];
    if (!r) return;
    computeStudentRow(r);
    var set = function (id, v) { var el = S.root.querySelector('#' + id); if (el) el.value = v; };
    set('asm-stu-' + i + '-s1done', r.s1.done); set('asm-stu-' + i + '-s1rate', r.s1.rate);
    set('asm-stu-' + i + '-s2done', r.s2.done); set('asm-stu-' + i + '-s2rate', r.s2.rate);
    set('asm-stu-' + i + '-sumreg', r.sum.reg); set('asm-stu-' + i + '-sumdone', r.sum.done); set('asm-stu-' + i + '-sumrate', r.sum.rate);
  }

  /* ── 서술형(rte) 글자 크기 조절 — 선택한 글자만 크기 변경 ──────────
     Word/Google Docs 방식: 텍스트를 드래그 선택하면 선택 영역 위에 작은 툴바가
     떠오르고, [가-]/[가+] 버튼을 누르면 선택된 부분의 글자 크기만 바뀐다. */
  var _rteToolbar = null;
  var _rteSel = null;   // 마지막으로 감지된 { rte, range } — 버튼 클릭 시 selection 유실 대비

  function initRteToolbar() {
    if (S._rteInit) return;
    S._rteInit = true;
    document.addEventListener('selectionchange', function () {
      if (S._rtePending) return;
      S._rtePending = true;
      window.requestAnimationFrame(function () { S._rtePending = false; onRteSelectionChange(); });
    });
    document.addEventListener('mousedown', function (e) {
      var tb = _rteToolbar;
      if (tb && !tb.contains(e.target) && !(e.target.closest && e.target.closest('.asm-rte'))) hideRteToolbar();
    });
  }

  function ensureRteToolbar() {
    if (_rteToolbar) return _rteToolbar;
    var tb = document.createElement('div');
    tb.className = 'asm-rte-toolbar';
    tb.innerHTML =
      '<button type="button" data-rtesize="-1" title="글자 작게">가<b>－</b></button>' +
      '<button type="button" data-rtesize="1" title="글자 크게">가<b>＋</b></button>' +
      '<button type="button" data-rtesize="0" title="기본 크기로">가↺</button>';
    document.body.appendChild(tb);
    // mousedown에서 preventDefault → 버튼 클릭 시 텍스트 선택(selection)이 풀리지 않게 함
    tb.addEventListener('mousedown', function (e) { e.preventDefault(); });
    tb.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-rtesize]');
      if (!b) return;
      applyFontSize(parseInt(b.getAttribute('data-rtesize'), 10));
    });
    _rteToolbar = tb;
    return tb;
  }
  function showRteToolbarAt(rect) {
    var tb = ensureRteToolbar();
    tb.style.display = 'flex';
    var top = rect.top + window.scrollY - tb.offsetHeight - 8;
    var left = rect.left + window.scrollX + (rect.width / 2) - (tb.offsetWidth / 2);
    if (top < window.scrollY + 4) top = rect.bottom + window.scrollY + 8;   // 화면 위로 넘치면 아래에 표시
    left = Math.max(4, Math.min(left, window.scrollX + document.documentElement.clientWidth - tb.offsetWidth - 4));
    tb.style.top = Math.max(4, top) + 'px';
    tb.style.left = left + 'px';
  }
  function hideRteToolbar() { if (_rteToolbar) _rteToolbar.style.display = 'none'; }

  function onRteSelectionChange() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { hideRteToolbar(); return; }
    var range = sel.getRangeAt(0);
    var node = range.commonAncestorContainer;
    var el = node.nodeType === 1 ? node : node.parentElement;
    var rte = el && el.closest ? el.closest('.asm-rte') : null;
    if (!rte || !S.root || !S.root.contains(rte)) { hideRteToolbar(); return; }
    var rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) { hideRteToolbar(); return; }
    _rteSel = { rte: rte, range: range.cloneRange() };
    showRteToolbarAt(rect);
  }

  function applyFontSize(dir) {
    var sel = window.getSelection();
    var range = (sel && sel.rangeCount && !sel.isCollapsed) ? sel.getRangeAt(0) : (_rteSel && _rteSel.range);
    if (!range) return;
    var node = range.commonAncestorContainer;
    var el = node.nodeType === 1 ? node : node.parentElement;
    var rte = (el && el.closest ? el.closest('.asm-rte') : null) || (_rteSel && _rteSel.rte);
    if (!rte) return;

    if (dir === 0) {
      unwrapFontSize(range);
    } else {
      var startEl = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
      var cur = parseFloat(getComputedStyle(startEl).fontSize) || 13;
      var next = Math.round(Math.min(24, Math.max(10, cur * (dir > 0 ? 1.15 : 0.87))));
      var span = document.createElement('span');
      span.style.fontSize = next + 'px';
      var frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
    setByPath(S.form, rte.getAttribute('data-path'), rte.innerHTML);
    markDirty();
    hideRteToolbar();
    try { window.getSelection().removeAllRanges(); } catch (e) {}
  }
  // 선택 영역 내 font-size 스타일을 제거해 기본 크기로 되돌린다
  function unwrapFontSize(range) {
    var frag = range.extractContents();
    var walker = document.createTreeWalker(frag, NodeFilter.SHOW_ELEMENT, null);
    var toClean = [];
    var n; while ((n = walker.nextNode())) { if (n.style && n.style.fontSize) toClean.push(n); }
    toClean.forEach(function (elx) { elx.style.fontSize = ''; if (!elx.getAttribute('style')) elx.removeAttribute('style'); });
    range.insertNode(frag);
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
      // 클라우드 최신본 재조회 + 전사반영 병합
      pullFromCloud().then(function () { return mergeBroadcastForYear(y); }).then(function (changed) {
        if (changed) persistFormSilently();
        render();
      });
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

  /* 연도·정렬 적용된 관리자 행 목록 */
  function adminYearRows() {
    var rows = (S.adminRows || []).filter(function (r) {
      return (r.data && r.data.year === S.adminYear) || (r.ref || '').indexOf('::' + S.adminYear) >= 0;
    });
    return sortAdminRows(rows);
  }
  function rowMeta(r) {
    var m = (r.data && r.data.form && r.data.form.meta) || {};
    return {
      email: (r.ref || '').split('::')[0],
      dept: m.dept || '', name: m.name || r.name || '', position: m.position || '',
      jobGroup: m.jobGroup || '', status: r.status || 'draft', updated: r.updated_at || '',
      form: (r.data && r.data.form) || null, meta: m
    };
  }
  function sortAdminRows(rows) {
    var key = S.adminSort.key, dir = S.adminSort.dir;
    var val = function (r) {
      var m = rowMeta(r);
      switch (key) {
        case 'dept': return m.dept;
        case 'name': return m.name;
        case 'position': return m.position;
        case 'jobGroup': return m.jobGroup;
        case 'status': return m.status;
        case 'email': return m.email;
        case 'updated': return m.updated;
        default: return m.dept;
      }
    };
    return rows.slice().sort(function (a, b) {
      var va = val(a) || '', vb = val(b) || '';
      var c;
      if (key === 'updated') c = String(va) < String(vb) ? -1 : (String(va) > String(vb) ? 1 : 0);
      else c = String(va).localeCompare(String(vb), 'ko');
      if (c === 0) {  // 2차 정렬: 성명
        c = String(rowMeta(a).name).localeCompare(String(rowMeta(b).name), 'ko');
      }
      return c * dir;
    });
  }
  function toggleSort(key) {
    if (S.adminSort.key === key) S.adminSort.dir *= -1;
    else { S.adminSort.key = key; S.adminSort.dir = 1; }
    renderAdmin();
  }
  function sortArrow(key) {
    if (S.adminSort.key !== key) return '<span class="asm-sort-ico">⇅</span>';
    return '<span class="asm-sort-ico on">' + (S.adminSort.dir > 0 ? '▲' : '▼') + '</span>';
  }

  function renderAdmin() {
    var yearTabs = YEARS.map(function (y) {
      return '<button class="asm-year-tab' + (y === S.adminYear ? ' active' : '') + '" data-ayear="' + y + '">' + y + '년</button>';
    }).join('');
    var tabBtns =
      '<div class="asm-adtab">' +
        '<button class="asm-adtab-btn' + (S.adminTab === 'list' ? ' active' : '') + '" data-adtab="list">📋 작성 현황</button>' +
        '<button class="asm-adtab-btn' + (S.adminTab === 'analysis' ? ' active' : '') + '" data-adtab="analysis">🎯 평가·분석</button>' +
      '</div>';

    S.root.innerHTML =
      '<div class="asm-toolbar">' +
        '<div class="asm-year-tabs">' + yearTabs + '</div>' +
        '<div class="asm-toolbar-right">' +
          '<button class="asm-btn asm-btn-ghost" id="asm-admin-refresh">새로고침</button>' +
          '<button class="asm-btn asm-btn-primary" id="asm-admin-back">← 내 작성으로</button>' +
        '</div>' +
      '</div>' +
      '<div class="asm-doc">' +
        '<div class="asm-doc-head"><h1 class="asm-doc-title">관리자 · 직무역량 자가진단</h1>' +
        '<p class="asm-doc-note">전체 작성 인원의 기록을 연도별로 조회·분석합니다. (관리자: ' + esc(S.email) + ')</p></div>' +
        tabBtns +
        '<div id="asm-admin-panel">' + (S.adminTab === 'analysis' ? analysisPanel() : listPanel()) + '</div>' +
      '</div>' +
      '<div id="asm-admin-modal"></div>';

    bindAdmin();
  }

  function listPanel() {
    if (S.adminLoading) return '<div class="asm-admin-empty">불러오는 중…</div>';
    if (!(window.CloudForms && CloudForms.ready())) return '<div class="asm-admin-empty">클라우드(Supabase)에 연결되지 않아 기록을 조회할 수 없습니다.</div>';
    var rows = adminYearRows();
    if (!rows.length) return '<div class="asm-admin-empty">' + S.adminYear + '년도에 작성된 기록이 없습니다.</div>';

    var submitted = rows.filter(function (r) { return r.status === 'submitted'; }).length;
    var selCount = rows.filter(function (r) { return S.adminSel[r.ref]; }).length;
    var allSel = selCount > 0 && selCount === rows.length;

    var th = function (key, label) {
      return '<th class="asm-th-sort" data-sortkey="' + key + '">' + esc(label) + ' ' + sortArrow(key) + '</th>';
    };
    var trs = rows.map(function (r, i) {
      var m = rowMeta(r);
      var badge = r.status === 'submitted'
        ? '<span class="asm-status asm-status-done">제출</span>'
        : '<span class="asm-status asm-status-draft">작성중</span>';
      return '<tr' + (S.adminSel[r.ref] ? ' class="asm-row-sel"' : '') + '>' +
        '<td class="asm-td-chk"><input type="checkbox" class="asm-rowchk" data-selref="' + esc(r.ref) + '"' + (S.adminSel[r.ref] ? ' checked' : '') + '></td>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(m.dept || '-') + '</td>' +
        '<td><b>' + esc(m.name || '-') + '</b></td>' +
        '<td>' + esc(m.position || '-') + '</td>' +
        '<td>' + esc(m.jobGroup || '-') + '</td>' +
        '<td>' + badge + '</td>' +
        '<td class="asm-admin-email">' + esc(m.email) + '</td>' +
        '<td>' + fmtDt(r.updated) + '</td>' +
        '<td><button class="asm-btn asm-btn-ghost asm-btn-sm asm-admin-view" data-ref="' + esc(r.ref) + '">보기</button></td>' +
      '</tr>';
    }).join('');

    return '' +
      '<div class="asm-admin-stat">' +
        '<div class="asm-stat"><span class="asm-stat-num">' + rows.length + '</span><span class="asm-stat-lbl">작성 인원</span></div>' +
        '<div class="asm-stat"><span class="asm-stat-num">' + submitted + '</span><span class="asm-stat-lbl">제출 완료</span></div>' +
        '<div class="asm-stat"><span class="asm-stat-num">' + (rows.length - submitted) + '</span><span class="asm-stat-lbl">작성 중</span></div>' +
        '<div class="asm-stat asm-stat-sel"><span class="asm-stat-num" id="asm-sel-count">' + selCount + '</span><span class="asm-stat-lbl">선택됨</span></div>' +
      '</div>' +
      '<div class="asm-admin-actions">' +
        '<button class="asm-btn asm-btn-ghost asm-btn-sm" id="asm-sel-all">전체선택</button>' +
        '<button class="asm-btn asm-btn-ghost asm-btn-sm" id="asm-sel-none">전체해제</button>' +
        '<span class="asm-flex1"></span>' +
        '<button class="asm-btn asm-btn-secondary asm-btn-sm" id="asm-admin-csv">CSV</button>' +
        '<button class="asm-btn asm-btn-primary asm-btn-sm" id="asm-admin-pdf">📥 선택 PDF 다운로드</button>' +
      '</div>' +
      '<p class="asm-hint">헤더를 클릭하면 엑셀처럼 정렬됩니다. 여러 건 선택 시 ZIP으로, 1건 선택 시 PDF로 내려받습니다.</p>' +
      '<div class="asm-scroll"><table class="asm-table asm-admin-table">' +
        '<thead><tr>' +
          '<th class="asm-td-chk"><input type="checkbox" id="asm-chk-all"' + (allSel ? ' checked' : '') + '></th>' +
          '<th>#</th>' + th('dept', '소속') + th('name', '성명') + th('position', '직책') +
          th('jobGroup', '직군') + th('status', '상태') + th('email', '계정') + th('updated', '최종수정') +
          '<th></th>' +
        '</tr></thead><tbody>' + trs + '</tbody></table></div>';
  }

  function bindAdmin() {
    var $ = function (id) { return S.root.querySelector(id); };
    $('#asm-admin-back').addEventListener('click', function () { S.view = 'form'; render(); });
    $('#asm-admin-refresh').addEventListener('click', function () { loadAdmin(); renderAdmin(); });
    S.root.querySelectorAll('[data-ayear]').forEach(function (b) {
      b.addEventListener('click', function () { S.adminYear = b.getAttribute('data-ayear'); renderAdmin(); });
    });
    S.root.querySelectorAll('[data-adtab]').forEach(function (b) {
      b.addEventListener('click', function () { S.adminTab = b.getAttribute('data-adtab'); renderAdmin(); });
    });
    // 정렬 헤더
    S.root.querySelectorAll('.asm-th-sort').forEach(function (thEl) {
      thEl.addEventListener('click', function () { toggleSort(thEl.getAttribute('data-sortkey')); });
    });
    // 체크박스
    S.root.querySelectorAll('.asm-rowchk').forEach(function (c) {
      c.addEventListener('change', function () {
        var ref = c.getAttribute('data-selref');
        if (c.checked) S.adminSel[ref] = true; else delete S.adminSel[ref];
        renderAdmin();
      });
    });
    var chkAll = $('#asm-chk-all');
    if (chkAll) chkAll.addEventListener('change', function () {
      var rows = adminYearRows();
      rows.forEach(function (r) { if (chkAll.checked) S.adminSel[r.ref] = true; else delete S.adminSel[r.ref]; });
      renderAdmin();
    });
    var selAll = $('#asm-sel-all'); if (selAll) selAll.addEventListener('click', function () { adminYearRows().forEach(function (r) { S.adminSel[r.ref] = true; }); renderAdmin(); });
    var selNone = $('#asm-sel-none'); if (selNone) selNone.addEventListener('click', function () { S.adminSel = {}; renderAdmin(); });
    var csv = $('#asm-admin-csv'); if (csv) csv.addEventListener('click', exportCsv);
    var pdf = $('#asm-admin-pdf'); if (pdf) pdf.addEventListener('click', exportSelectedPdf);
    S.root.querySelectorAll('.asm-admin-view').forEach(function (b) {
      b.addEventListener('click', function () { showDetail(b.getAttribute('data-ref')); });
    });
    // 분석 패널
    bindAnalysis();
  }

  function exportCsv() {
    var rows = adminYearRows();
    var head = ['소속', '성명', '직책', '직군', '상태', '계정', '최종수정'];
    var lines = [head.join(',')];
    rows.forEach(function (r) {
      var m = rowMeta(r);
      var f = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
      lines.push([m.dept, m.name, m.position, m.jobGroup, m.status, m.email, fmtDt(m.updated)].map(f).join(','));
    });
    downloadBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), '직무역량자가진단_' + S.adminYear + '.csv');
  }

  /* ── 예쁜 문서(HTML) 렌더 ─────────────────────────────────────── */
  function dv(v) { v = (v == null ? '' : String(v)).trim(); return v ? esc(v) : '<span class="pd-empty">-</span>'; }
  // 서술형(rte) 필드 표시용 — 이미 안전한 HTML(텍스트+<br>+font-size span)이므로 그대로 삽입
  function dvHtml(v) { v = (v == null ? '' : String(v)).trim(); return v ? toRteHtml(v) : '<span class="pd-empty">-</span>'; }
  function monthTableRows(obj, label) {
    var cells = MONTHS.map(function (mo) { return '<td>' + dv(obj && obj[mo]) + '</td>'; }).join('');
    var sum = 0; MONTHS.forEach(function (mo) { var n = parseFloat(obj && obj[mo]); if (!isNaN(n)) sum += n; });
    return '<tr><th>' + esc(label) + '</th>' + cells + '<td class="pd-sum">' + sum + '</td></tr>';
  }
  function buildDocHtml(form, meta) {
    if (!form) return '<div class="pd-empty">데이터 없음</div>';
    var m = meta || form.meta || {};
    var year = (form.meta && form.meta.year) || S.adminYear;
    var infoRow = function (a, av, b, bv, c, cv) {
      return '<tr><th>' + a + '</th><td>' + dv(av) + '</td><th>' + b + '</th><td>' + dv(bv) + '</td>' +
        (c ? '<th>' + c + '</th><td>' + dv(cv) + '</td>' : '<td colspan="2"></td>') + '</tr>';
    };
    // 1. 신상
    var sec1 = '<table class="pd-tbl pd-info">' +
      infoRow('소속', m.dept, '직책', m.position, '성명', m.name) +
      infoRow('입사일', m.hireDate, '전체근무경력', m.totalCareer, '현직무경력', m.currentCareer) +
      '<tr><th>직군</th><td>' + dv(m.jobGroup) + '</td><th>주요 자격·면허</th><td colspan="3">' + dvHtml(m.licenses) + '</td></tr>' +
      '<tr><th>직책업무 요약</th><td colspan="5">' + dvHtml(m.roleSummary) + '</td></tr>' +
      '</table>';
    // 2. 직무분석
    var jobsRows = (form.jobs || []).filter(function (j) { return j.title || j.content || j.competency; });
    var sec2 = jobsRows.length ? '<table class="pd-tbl"><thead><tr><th>No</th><th>구분</th><th>직무명</th><th>업무 내용</th><th>필요역량</th><th>주기</th><th>관련부서</th></tr></thead><tbody>' +
      jobsRows.map(function (j, i) { return '<tr><td>' + (i + 1) + '</td><td>' + dv(j.group) + '</td><td>' + dv(j.title) + '</td><td class="pd-l">' + dvHtml(j.content) + '</td><td class="pd-l">' + dvHtml(j.competency) + '</td><td>' + dv(j.cycle) + '</td><td>' + dv(j.relDept) + '</td></tr>'; }).join('') +
      '</tbody></table>' : '<div class="pd-empty">작성된 직무 없음</div>';
    // 3. 성과
    var perfRows = (form.performance || []).filter(function (p) { return p.task || p.result; });
    var sec3 = perfRows.length ? '<table class="pd-tbl"><thead><tr><th>구분</th><th>해당 업무</th><th>업무 성과 및 기여 내용</th><th>비고</th></tr></thead><tbody>' +
      perfRows.map(function (p) { return '<tr><td>' + dv(p.category) + '</td><td>' + dv(p.task) + '</td><td class="pd-l">' + dvHtml(p.result) + '</td><td>' + dvHtml(p.note) + '</td></tr>'; }).join('') +
      '</tbody></table>' : '<div class="pd-empty">작성된 성과 없음</div>';
    // 4. 직군별 실적
    var sec4;
    if (m.jobGroup === '교무직') {
      var f = form.faculty || {};
      var lec = f.lecture || {};
      if (lec.credit && lec.nonCredit && lec.etc && lec.total) computeLectureTotals(lec);
      var lecTbl = '<h4 class="pd-h4">4-2-1. 개인별 강의시수</h4><div class="pd-scroll"><table class="pd-tbl pd-month"><thead><tr><th>구분</th>' + MONTHS.map(function (mo) { return '<th>' + mo + '</th>'; }).join('') + '<th>계</th></tr></thead><tbody>' +
        monthTableRows(lec.banSu, '반수') + monthTableRows(lec.credit, '학점') + monthTableRows(lec.nonCredit, '비학점') + monthTableRows(lec.etc, '기타') + monthTableRows(lec.total, '전체') + '</tbody></table></div>';
      var stu = (f.students || []);
      stu.forEach(function (s) { if (s.s1 && s.s2 && s.sum) computeStudentRow(s); });
      var stuTbl = '<h4 class="pd-h4">4-2-2. 지도학생 관리 현황</h4><div class="pd-scroll"><table class="pd-tbl"><thead><tr><th>연도</th><th>1학기 등록</th><th>휴학</th><th>자퇴</th><th>수료</th><th>등록유지율</th><th>2학기 등록</th><th>휴학</th><th>자퇴</th><th>수료</th><th>등록유지율</th><th>계 등록</th><th>계 수료</th><th>수료율</th></tr></thead><tbody>' +
        stu.map(function (s) { var a = s.s1 || {}, b = s.s2 || {}, c = s.sum || {}; return '<tr><td>' + dv(s.year) + '</td><td>' + dv(a.reg) + '</td><td>' + dv(a.leave) + '</td><td>' + dv(a.drop) + '</td><td>' + dv(a.done) + '</td><td>' + dv(a.rate) + '</td><td>' + dv(b.reg) + '</td><td>' + dv(b.leave) + '</td><td>' + dv(b.drop) + '</td><td>' + dv(b.done) + '</td><td>' + dv(b.rate) + '</td><td>' + dv(c.reg) + '</td><td>' + dv(c.done) + '</td><td>' + dv(c.rate) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      var cnsTbl = '<h4 class="pd-h4">4-2-3. 학생 상담 횟수</h4><div class="pd-scroll"><table class="pd-tbl pd-month"><thead><tr><th>월</th>' + MONTHS.map(function (mo) { return '<th>' + mo + '</th>'; }).join('') + '<th>계</th></tr></thead><tbody>' + monthTableRows(f.counsel, '건수') + '</tbody></table></div>';
      sec4 = '<div class="pd-tag pd-tag-fac">교무직</div>' + lecTbl + stuTbl + cnsTbl;
    } else {
      var a2 = form.admin || {};
      var draftTbl = '<h4 class="pd-h4">4-1-1. 연간 기안 상신 건수</h4><div class="pd-scroll"><table class="pd-tbl pd-month"><thead><tr><th>월</th>' + MONTHS.map(function (mo) { return '<th>' + mo + '</th>'; }).join('') + '<th>계</th></tr></thead><tbody>' + monthTableRows(a2.draftCounts, '건수') + '</tbody></table></div>';
      var projs = (a2.projects || []).filter(function (p) { return p.name || p.period; });
      var projTbl = '<h4 class="pd-h4">4-1-2. 연간 참여 사업</h4>' + (projs.length ? '<table class="pd-tbl"><thead><tr><th>연번</th><th>사업 기간</th><th>참여 사업명</th><th>담당업무 및 사업성과</th></tr></thead><tbody>' +
        projs.map(function (p, i) { return '<tr><td>' + (i + 1) + '</td><td>' + dv(p.period) + '</td><td>' + dv(p.name) + '</td><td class="pd-l">' + dvHtml(p.role) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="pd-empty">작성된 참여 사업 없음</div>');
      sec4 = '<div class="pd-tag">행정직</div>' + draftTbl + projTbl;
    }
    // 5. 개인역량개발
    var devs = (form.development || []).filter(function (d) { return d.course || d.org; });
    var sec5 = devs.length ? '<table class="pd-tbl"><thead><tr><th>구분</th><th>교육과정명</th><th>주관기관</th><th>기간</th><th>비용</th><th>교육 내용</th><th>업무반영범위</th></tr></thead><tbody>' +
      devs.map(function (d) { return '<tr><td>' + dv(d.div) + (d.broadcastId ? ' <span class="pd-tag">전사반영</span>' : '') + '</td><td>' + dv(d.course) + '</td><td>' + dv(d.org) + '</td><td>' + dv(d.period) + '</td><td>' + dv(d.cost) + '</td><td class="pd-l">' + dvHtml(d.content) + '</td><td class="pd-l">' + dvHtml(d.scope) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="pd-empty">작성된 교육 이력 없음</div>';
    // 6. 애로사항
    var iss = form.issues || {};
    var sec6 = '<table class="pd-tbl pd-info">' +
      '<tr><th>애로사항</th><td class="pd-l">' + dvHtml(iss.difficulty) + '</td></tr>' +
      '<tr><th>개선사항 건의</th><td class="pd-l">' + dvHtml(iss.improvement) + '</td></tr>' +
      '<tr><th>' + (parseInt(year, 10) + 1) + '년 목표 및 계획</th><td class="pd-l">' + dvHtml(iss.nextPlan) + '</td></tr>' +
      '</table>';

    var sec = function (no, title, body) { return '<div class="pd-sec"><div class="pd-sec-h"><span class="pd-no">' + no + '</span>' + esc(title) + '</div>' + body + '</div>'; };
    return '<div class="pd-root">' +
      '<div class="pd-head"><div class="pd-conf">대외비</div><h1 class="pd-title">' + esc(year) + '년도 개인별 직무역량 자기진단표</h1>' +
      '<div class="pd-sub">' + dv(m.dept) + ' · ' + dv(m.name) + ' (' + dv(m.jobGroup) + ')</div></div>' +
      sec('1', '개인 신상 정보', sec1) +
      sec('2', '직무 분석', sec2) +
      sec('3', year + '년도 업무 성과 및 기여', sec3) +
      sec('4', '개인별 업무처리 실적', sec4) +
      sec('5', '개인역량개발', sec5) +
      sec('6', '직무 관련 애로사항 및 건의', sec6) +
      '</div>';
  }

  function showDetail(ref) {
    var row = (S.adminRows || []).filter(function (r) { return r.ref === ref; })[0];
    if (!row || !row.data || !row.data.form) { toast('상세 데이터를 찾을 수 없습니다.', 'error'); return; }
    var m = rowMeta(row);
    var modal = S.root.querySelector('#asm-admin-modal');
    modal.innerHTML =
      '<div class="asm-modal-back" id="asm-modal-back"><div class="asm-modal asm-modal-lg">' +
        '<div class="asm-modal-head"><b>' + esc(m.dept || '') + ' · ' + esc(m.name || '') + '</b>' +
          '<span class="asm-status ' + (m.status === 'submitted' ? 'asm-status-done' : 'asm-status-draft') + '">' + (m.status === 'submitted' ? '제출' : '작성중') + '</span>' +
          '<span class="asm-flex1"></span>' +
          '<button class="asm-btn asm-btn-primary asm-btn-sm" id="asm-detail-pdf">📥 PDF 저장</button>' +
          '<button class="asm-modal-x" id="asm-modal-x">✕</button></div>' +
        '<div class="asm-modal-body">' +
          buildDocHtml(m.form, m.meta) +
          '<details class="asm-json-details"><summary>개발용 원본 데이터(JSON)</summary><pre class="asm-detail-json">' + esc(JSON.stringify(m.form, null, 2)) + '</pre></details>' +
        '</div>' +
      '</div></div>';
    var close = function () { modal.innerHTML = ''; };
    S.root.querySelector('#asm-modal-x').addEventListener('click', close);
    S.root.querySelector('#asm-modal-back').addEventListener('click', function (e) { if (e.target.id === 'asm-modal-back') close(); });
    S.root.querySelector('#asm-detail-pdf').addEventListener('click', function () {
      S.adminSel = {}; S.adminSel[ref] = true; exportSelectedPdf();
    });
  }

  /* ── PDF / ZIP 내보내기 ───────────────────────────────────────── */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[data-src="' + src + '"]')) { res(); return; }
      var s = document.createElement('script'); s.src = src; s.setAttribute('data-src', src);
      s.onload = res; s.onerror = function () { rej(new Error('스크립트 로드 실패: ' + src)); };
      document.head.appendChild(s);
    });
  }
  function ensureLibs() {
    var jobs = [];
    if (!window.html2canvas) jobs.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'));
    if (!(window.jspdf && window.jspdf.jsPDF)) jobs.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'));
    if (!window.JSZip) jobs.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'));
    return Promise.all(jobs);
  }
  function fmtDate(iso) {
    if (!iso) return '';
    try { var d = new Date(iso); var p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
    catch (e) { return ''; }
  }
  function sanitizeFn(s) { return String(s == null ? '' : s).replace(/[\\\/:*?"<>|]/g, '').replace(/\s+/g, ''); }
  function filenameFor(r) {
    var m = rowMeta(r);
    return '직무역량자가진단_' + S.adminYear + '_' + (sanitizeFn(m.dept) || '미상') + '_' + (sanitizeFn(m.name) || '미상') + '_' + (fmtDate(m.updated) || '작성전') + '.pdf';
  }
  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function makePrintEl(html) {
    var el = document.createElement('div');
    el.className = 'pd-print';
    el.style.cssText = 'position:fixed;left:-99999px;top:0;width:760px;background:#fff;';
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  }
  function htmlToPdf(el) {
    return window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
      .then(function (canvas) {
        var JsPDF = window.jspdf.jsPDF;
        var pdf = new JsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        var pageW = pdf.internal.pageSize.getWidth();
        var pageH = pdf.internal.pageSize.getHeight();
        var imgW = pageW;
        var scale = imgW / canvas.width;
        var imgFullH = canvas.height * scale;
        if (imgFullH <= pageH) {
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, imgFullH);
        } else {
          var pxPerPage = Math.floor(canvas.width * pageH / pageW);   // 캔버스 픽셀 기준 페이지 높이
          var offset = 0, first = true;
          while (offset < canvas.height) {
            var sliceH = Math.min(pxPerPage, canvas.height - offset);
            var c2 = document.createElement('canvas');
            c2.width = canvas.width; c2.height = sliceH;
            var ctx = c2.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c2.width, c2.height);
            ctx.drawImage(canvas, 0, offset, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
            if (!first) pdf.addPage();
            pdf.addImage(c2.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, sliceH * scale);
            first = false; offset += sliceH;
          }
        }
        return pdf;
      });
  }
  function exportSelectedPdf() {
    var rows = adminYearRows().filter(function (r) { return S.adminSel[r.ref] && r.data && r.data.form; });
    if (!rows.length) { toast('선택된 항목이 없습니다. 표에서 체크박스를 선택하세요.', 'error'); return; }
    toast('PDF 생성 중… (' + rows.length + '건, 잠시만 기다려 주세요)', 'info');
    ensureLibs().then(function () {
      var items = [];
      var seq = rows.reduce(function (pr, r) {
        return pr.then(function () {
          var m = rowMeta(r);
          var el = makePrintEl(buildDocHtml(m.form, m.meta));
          return htmlToPdf(el).then(function (pdf) {
            el.remove();
            items.push({ name: filenameFor(r), blob: pdf.output('blob') });
          }).catch(function (e) { el.remove(); throw e; });
        });
      }, Promise.resolve());

      seq.then(function () {
        if (items.length === 1) {
          downloadBlob(items[0].blob, items[0].name);
          toast('PDF를 내려받았습니다: ' + items[0].name, 'success');
        } else {
          var zip = new window.JSZip();
          items.forEach(function (it) { zip.file(it.name, it.blob); });
          return zip.generateAsync({ type: 'blob' }).then(function (content) {
            downloadBlob(content, '직무역량자가진단_' + S.adminYear + '.zip');
            toast(items.length + '건을 ZIP으로 내려받았습니다.', 'success');
          });
        }
      }).catch(function (e) { toast('PDF 생성 실패: ' + (e && e.message || e), 'error'); });
    }).catch(function (e) { toast('필요 라이브러리 로드 실패: ' + (e && e.message || e), 'error'); });
  }

  /* ── 평가·분석 패널 ───────────────────────────────────────────── */
  function analysisSearchText(form) {
    if (!form) return '';
    var parts = [];
    var m = form.meta || {};
    // 서술형(rte) 필드는 HTML로 저장되므로 검색 전 태그를 제거한 순수 텍스트로 변환
    parts.push(stripHtml(m.licenses), stripHtml(m.roleSummary), m.position, m.dept);
    (form.jobs || []).forEach(function (j) { parts.push(j.title, stripHtml(j.content), stripHtml(j.competency)); });
    (form.performance || []).forEach(function (p) { parts.push(p.task, stripHtml(p.result)); });
    (form.development || []).forEach(function (d) { parts.push(d.course, stripHtml(d.content), stripHtml(d.scope), d.org); });
    if (form.issues) parts.push(stripHtml(form.issues.nextPlan));
    return parts.filter(Boolean).join(' \n ');
  }
  function ansh(key, label) {
    var s = S.analysis.sort;
    var ico = (s && s.key === key)
      ? '<span class="asm-sort-ico on">' + (s.dir > 0 ? '▲' : '▼') + '</span>'
      : '<span class="asm-sort-ico">⇅</span>';
    return '<th class="asm-th-sort" data-ansort="' + key + '">' + esc(label) + ' ' + ico + '</th>';
  }
  function sortAnalysis(key) {
    var s = S.analysis.sort;
    if (s && s.key === key) s.dir *= -1; else S.analysis.sort = { key: key, dir: 1 };
    s = S.analysis.sort;
    (S.analysis.results || []).sort(function (a, b) {
      var va = a[key], vb = b[key], c;
      if (typeof va === 'number' && typeof vb === 'number') c = va - vb;
      else c = String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb), 'ko');
      return c * s.dir;
    });
    renderAdmin();
  }
  function analysisPanel() {
    var rows = adminYearRows();
    var deptChips = DEPARTMENTS.map(function (d) {
      var on = S.analysis.depts.indexOf(d) >= 0;
      return '<label class="asm-chip' + (on ? ' on' : '') + '"><input type="checkbox" class="an-dept" value="' + esc(d) + '"' + (on ? ' checked' : '') + '> ' + esc(d) + '</label>';
    }).join('');
    var jgOpts = ['', '행정직', '교무직'].map(function (g) {
      return '<option value="' + esc(g) + '"' + (S.analysis.jobGroup === g ? ' selected' : '') + '>' + (g || '전체') + '</option>';
    }).join('');
    var results = S.analysis.results;
    var resHtml = '';
    if (results) {
      if (!results.length) resHtml = '<div class="asm-admin-empty">조건에 맞는 인원이 없습니다.</div>';
      else {
        resHtml = '<div class="asm-admin-actions"><b>분석 결과 ' + results.length + '명</b><span class="asm-flex1"></span>' +
          '<button class="asm-btn asm-btn-secondary asm-btn-sm" id="an-export-md">📄 AI 기초자료(.md) 내보내기</button>' +
          '<button class="asm-btn asm-btn-secondary asm-btn-sm" id="an-copy">📋 복사</button></div>' +
          '<div class="asm-scroll"><table class="asm-table asm-admin-table"><thead><tr><th>순위</th>' +
            ansh('dept', '소속') + ansh('name', '성명') + ansh('jobGroup', '직군') + ansh('score', '매치 점수') +
            '<th>매칭 키워드</th><th>근거</th><th></th></tr></thead><tbody>' +
          results.map(function (x, i) {
            return '<tr>' +
              '<td><b>' + (x.rank || (i + 1)) + '</b></td>' +
              '<td>' + esc(x.dept) + '</td><td><b>' + esc(x.name) + '</b></td><td>' + esc(x.jobGroup) + '</td>' +
              '<td><span class="an-score">' + x.score + '</span></td>' +
              '<td>' + (x.matched.length ? x.matched.map(function (k) { return '<span class="an-kw">' + esc(k) + '</span>'; }).join(' ') : '-') + '</td>' +
              '<td class="an-snip">' + esc(x.snippet || '-') + '</td>' +
              '<td><button class="asm-btn asm-btn-ghost asm-btn-sm asm-admin-view" data-ref="' + esc(x.ref) + '">보기</button></td>' +
            '</tr>';
          }).join('') + '</tbody></table></div>';
      }
    }
    return '' +
      '<div class="an-box">' +
        '<div class="an-desc">특정 프로젝트에 적합한 인원을 <b>' + S.adminYear + '년도 전체 데이터</b>에서 추려냅니다. 필요 역량 키워드를 입력하면, 각자의 직무·성과·교육·자격 기록에서 키워드 일치도를 계산해 순위를 매깁니다. ' +
          '<span class="asm-muted">예) 비행교육원 홈페이지 개설 → “홈페이지, 웹, 디자인, 콘텐츠, 촬영, 편집”</span></div>' +
        '<div class="an-field"><label class="asm-label">필요 역량 키워드 <span class="asm-muted">(쉼표 또는 공백으로 구분)</span></label>' +
          '<input id="an-keywords" class="asm-input" placeholder="예: 홈페이지, 웹, 디자인, 콘텐츠, 촬영, 편집" value="' + esc(S.analysis.keywords) + '"></div>' +
        '<div class="an-row">' +
          '<div class="an-field an-jg"><label class="asm-label">직군</label><select id="an-jobgroup" class="asm-input">' + jgOpts + '</select></div>' +
          '<div class="an-field an-tot"><label class="asm-label">대상 인원</label><div class="an-count">' + rows.length + '명 (' + S.adminYear + ')</div></div>' +
        '</div>' +
        '<div class="an-field"><label class="asm-label">소속 필터 <span class="asm-muted">(선택 안 하면 전체)</span></label><div class="an-chips">' + deptChips + '</div></div>' +
        '<div class="an-actions"><button class="asm-btn asm-btn-primary" id="an-run">🎯 분석 실행</button>' +
          '<button class="asm-btn asm-btn-ghost" id="an-reset">초기화</button></div>' +
      '</div>' +
      '<div id="an-results">' + resHtml + '</div>';
  }
  function bindAnalysis() {
    var kw = S.root.querySelector('#an-keywords');
    if (!kw) return;   // 분석 탭이 아님
    kw.addEventListener('input', function () { S.analysis.keywords = kw.value; });
    var jg = S.root.querySelector('#an-jobgroup');
    if (jg) jg.addEventListener('change', function () { S.analysis.jobGroup = jg.value; });
    S.root.querySelectorAll('.an-dept').forEach(function (c) {
      c.addEventListener('change', function () {
        var v = c.value; var idx = S.analysis.depts.indexOf(v);
        if (c.checked && idx < 0) S.analysis.depts.push(v);
        else if (!c.checked && idx >= 0) S.analysis.depts.splice(idx, 1);
        c.closest('.asm-chip').classList.toggle('on', c.checked);
      });
    });
    var run = S.root.querySelector('#an-run'); if (run) run.addEventListener('click', runAnalysis);
    var reset = S.root.querySelector('#an-reset'); if (reset) reset.addEventListener('click', function () {
      S.analysis = { keywords: '', depts: [], jobGroup: '', results: null, sort: null }; renderAdmin();
    });
    S.root.querySelectorAll('[data-ansort]').forEach(function (thEl) {
      thEl.addEventListener('click', function () { sortAnalysis(thEl.getAttribute('data-ansort')); });
    });
    var md = S.root.querySelector('#an-export-md'); if (md) md.addEventListener('click', exportAnalysisMd);
    var cp = S.root.querySelector('#an-copy'); if (cp) cp.addEventListener('click', function () {
      try { navigator.clipboard.writeText(buildAnalysisMd()).then(function () { toast('클립보드에 복사했습니다.', 'success'); }); }
      catch (e) { toast('복사 실패', 'error'); }
    });
  }
  function parseKeywords(s) {
    return String(s || '').split(/[,\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function runAnalysis() {
    var kws = parseKeywords(S.analysis.keywords);
    var rows = adminYearRows().filter(function (r) {
      var m = rowMeta(r);
      if (S.analysis.jobGroup && m.jobGroup !== S.analysis.jobGroup) return false;
      if (S.analysis.depts.length && S.analysis.depts.indexOf(m.dept) < 0) return false;
      return true;
    });
    var results = rows.map(function (r) {
      var m = rowMeta(r);
      var text = analysisSearchText(m.form);
      var low = text.toLowerCase();
      var score = 0, matched = [];
      kws.forEach(function (k) {
        var kl = k.toLowerCase(); if (!kl) return;
        var n = low.split(kl).length - 1;
        if (n > 0) { score += n; matched.push(k); }
      });
      // 근거 스니펫: 첫 매칭 키워드 주변 텍스트
      var snippet = '';
      if (matched.length) {
        var idx = low.indexOf(matched[0].toLowerCase());
        if (idx >= 0) snippet = text.substring(Math.max(0, idx - 20), idx + 50).replace(/\s+/g, ' ').trim();
      } else {
        snippet = (m.meta.roleSummary || '').substring(0, 60);
      }
      return { ref: r.ref, dept: m.dept, name: m.name, jobGroup: m.jobGroup, score: score, matched: matched, snippet: snippet };
    });
    // 키워드가 있으면 점수순, 없으면 이름순
    if (kws.length) results.sort(function (a, b) { return b.score - a.score || String(a.name).localeCompare(b.name, 'ko'); });
    else results.sort(function (a, b) { return String(a.dept).localeCompare(b.dept, 'ko') || String(a.name).localeCompare(b.name, 'ko'); });
    results.forEach(function (x, i) { x.rank = i + 1; });   // 점수 기준 순위 고정(헤더 정렬해도 유지)
    S.analysis.results = results;
    S.analysis.sort = null;
    renderAdmin();
    toast('분석 완료: ' + results.length + '명', 'success');
  }
  function buildAnalysisMd() {
    var kws = parseKeywords(S.analysis.keywords);
    var lines = [];
    lines.push('# 직무역량 분석 · ' + S.adminYear + '년도');
    lines.push('');
    lines.push('- 필요 역량 키워드: ' + (kws.length ? kws.join(', ') : '(없음)'));
    lines.push('- 직군 필터: ' + (S.analysis.jobGroup || '전체'));
    lines.push('- 소속 필터: ' + (S.analysis.depts.length ? S.analysis.depts.join(', ') : '전체'));
    lines.push('- 생성일: ' + fmtDate(nowIso()));
    lines.push('');
    lines.push('## 후보 순위');
    lines.push('');
    lines.push('| 순위 | 소속 | 성명 | 직군 | 매치점수 | 매칭키워드 |');
    lines.push('|---|---|---|---|---|---|');
    (S.analysis.results || []).forEach(function (x, i) {
      lines.push('| ' + (i + 1) + ' | ' + x.dept + ' | ' + x.name + ' | ' + x.jobGroup + ' | ' + x.score + ' | ' + (x.matched.join(', ') || '-') + ' |');
    });
    lines.push('');
    lines.push('## 후보별 상세(원문 발췌)');
    lines.push('');
    (S.analysis.results || []).forEach(function (x, i) {
      var row = (S.adminRows || []).filter(function (r) { return r.ref === x.ref; })[0];
      var m = row ? rowMeta(row) : null;
      lines.push('### ' + (i + 1) + '. ' + x.dept + ' ' + x.name + ' (' + x.jobGroup + ') — 점수 ' + x.score);
      if (m && m.form) {
        // 서술형(rte) 필드는 HTML로 저장되므로 마크다운에는 태그를 제거한 순수 텍스트로 기재
        var jobs = (m.form.jobs || []).filter(function (j) { return j.title; });
        if (jobs.length) { lines.push('- 직무: ' + jobs.map(function (j) { var c = stripHtml(j.competency); return j.title + (c ? '(' + c + ')' : ''); }).join(' / ')); }
        var licenses = stripHtml(m.meta.licenses);
        if (licenses) lines.push('- 자격·면허: ' + licenses);
        var devs = (m.form.development || []).filter(function (d) { return d.course; });
        if (devs.length) lines.push('- 교육이수: ' + devs.map(function (d) { return d.course; }).join(' / '));
        var perf = (m.form.performance || []).filter(function (p) { return p.result; });
        if (perf.length) lines.push('- 주요성과: ' + perf.map(function (p) { return (p.task ? p.task + '—' : '') + stripHtml(p.result); }).slice(0, 3).join(' / '));
      }
      lines.push('');
    });
    return lines.join('\n');
  }
  function exportAnalysisMd() {
    downloadBlob(new Blob([buildAnalysisMd()], { type: 'text/markdown;charset=utf-8' }),
      '직무역량분석_' + S.adminYear + '_' + fmtDate(nowIso()) + '.md');
    toast('AI 기초자료(.md)를 내려받았습니다.', 'success');
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
        return mergeBroadcastForYear(S.year);
      }).then(function (changed) {
        if (changed) persistFormSilently();
        render();             // 클라우드 병합(+ 전사반영 병합) 후 갱신
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
