'use strict';
/**
 * aseasurvey-common.js — 교내 설문(aseasurvey.html / aseasurvey-admin.html) 공용 모듈
 *  · Supabase RPC 호출(svy 스키마는 public.svy_* RPC로만 접근)
 *  · 테마 적용(색상·서체·모서리·글자 크기, 헤더 배경 대비에 따른 로고 자동 전환)
 *  · 설문 정의(JSON) 순회 유틸
 */
window.SVY = (function () {
  var SUPA_URL = 'https://zbpeyklwpotjyveipzxd.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV5a2x3cG90anl2ZWlwenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTYxMDcsImV4cCI6MjA5NzA5MjEwN30.6JgoQ6rPRnmrbBTG68A-Y9HDQk40mnwubhXVnkZvHrQ';

  var ERR = {
    AUTH_REQUIRED: '로그인이 만료되었습니다. 다시 로그인해 주십시오.',
    NOT_FOUND: '설문을 찾을 수 없습니다.',
    NOT_OPEN: '현재 응답을 받지 않는 설문입니다.',
    BAD_CLASS: '선택한 반 정보가 올바르지 않습니다. 처음부터 다시 선택해 주십시오.',
    BAD_TOKEN: '기기 식별 정보가 올바르지 않습니다. 페이지를 새로고침해 주십시오.',
    TOO_LARGE: '응답 용량이 너무 큽니다. 서술형 내용을 줄여 주십시오.',
    NO_COURSES: '등록된 과목이 없어 시작할 수 없습니다. 과목을 먼저 등록해 주십시오.',
    HAS_RESPONSES: '응답이 있는 설문입니다.',
    TEST_DATA_EXISTS: '테스트 응답이 남아 있습니다. 먼저 「테스트 결과 초기화」를 실행해 주십시오.',
    HAS_REAL_RESPONSES: '정식 응답이 있어 테스트 모드를 켤 수 없습니다.',
    TITLE_REQUIRED: '설문 제목을 입력해 주십시오.',
    BAD_STATUS: '잘못된 상태 값입니다.',
    BAD_ROWS: '등록 데이터 형식이 올바르지 않거나 건수가 너무 많습니다.',
    BAD_N: '추첨 인원은 1~500명이어야 합니다.',
    TICKET_INVALID: '존재하지 않는 추첨번호가 포함되어 있습니다.',
    NOT_WINNER: '현재 공개된 추첨 결과의 당첨 번호가 아닙니다.',
    PUBLISHED: '공개 중인 추첨은 삭제할 수 없습니다. 먼저 공개를 해제해 주십시오.',
    BAD_SCOPE: '초기화 범위가 올바르지 않습니다.',
    FULL: '정원이 마감되었습니다.',
    EDIT_CLOSED: '수정할 수 있는 시간이 지났거나 수정이 허용되지 않은 설문입니다.',
    NO_RESPONSE: '이 기기에서 제출한 응답을 찾을 수 없습니다.',
    BAD_FILE_TYPE: '올릴 수 없는 파일 형식입니다. 사진·PDF·문서 파일만 가능합니다.',
    FILE_TOO_LARGE: '파일 용량이 너무 큽니다. 3MB 이하로 올려 주십시오.',
    FILE_LIMIT: '첨부 가능한 파일 수 또는 총 용량을 초과했습니다.'
  };
  function errMsg(code, raw) {
    if (!code) return '알 수 없는 오류가 발생했습니다.';
    if (ERR[code]) return ERR[code];
    if (code.indexOf('OPTION_FULL:') === 0) return '「' + code.slice(12) + '」 선택지는 정원이 마감되었습니다. 다른 항목을 선택해 주십시오.';
    if (code.indexOf('VALIDATION:') === 0) return '응답 검증 오류: ' + code.slice(11);
    if (code.indexOf('ROW_INVALID:') === 0) return code.slice(12) + '번째 행에 필수값(계열·학년·반·과목명)이 비어 있습니다.';
    if (/function .* does not exist|Could not find the function/i.test(raw || code)) return 'DB 함수가 아직 설치되지 않았습니다. db/README_survey.md 의 설치 순서를 확인해 주십시오.';
    return '서버 오류: ' + code;
  }

  function rpc(fn, args) {
    return fetch(SUPA_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        if (!r.ok) {
          var code = (j && j.message) || ('HTTP_' + r.status);
          var err = new Error(errMsg(code, (j && (j.message || j.hint)) || '')); err.code = code; err.status = r.status;
          throw err;
        }
        return j;
      });
    }, function () { var e = new Error('네트워크 연결을 확인해 주십시오.'); e.code = 'NETWORK'; throw e; });
  }

  /* ── 유틸 ── */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function uid(n) {
    var a = new Uint8Array(n || 16), s = '';
    try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); }
    for (var j = 0; j < a.length; j++) s += ('0' + a[j].toString(16)).slice(-2);
    return s;
  }
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
    getJSON: function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    setJSON: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  function cookieGet(k) { var m = document.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; }
  function cookieSet(k, v) { try { document.cookie = k + '=' + encodeURIComponent(v) + '; max-age=' + (400 * 86400) + '; path=/; SameSite=Lax'; } catch (e) {} }

  /* ── 아이콘(인라인 SVG, 이모지 금지) ── */
  var ICONS = {
    check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8a1 1 0 001 1h12a1 1 0 001-1v-8M7.5 8a2.5 2.5 0 010-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 010 5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    alert: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.8a3.5 3.5 0 010 6.4M18 14.2a6.5 6.5 0 013.5 5.8"/>',
    link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
    refresh: '<path d="M20 11a8 8 0 00-14-4L4 9M4 5v4h4M4 13a8 8 0 0014 4l2-2M20 19v-4h-4"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z"/>',
    upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 001.3 2.2h12.4a1.5 1.5 0 001.3-2.2L14 9V3M7.5 15h9"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 01-8 0V4zM8 6H4v1a4 4 0 004 4M16 6h4v1a4 4 0 01-4 4M12 13v4M8 21h8M10 17h4"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    palette: '<path d="M12 3a9 9 0 100 18c1.4 0 2-.9 2-1.8 0-1-.8-1.4-.8-2.4 0-1 .8-1.8 1.9-1.8H17a4 4 0 004-4c0-4-4-8-9-8z"/><path d="M7.5 11h.01M10 7.5h.01M14.5 7.5h.01"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    file: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"/><path d="M14 3v5h5"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>'
  };
  function ico(name, size) {
    size = size || 18;
    return '<svg class="ico" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  /* ── 테마 ── */
  var DEFAULT_THEME = { primary: '#0EA5E9', headerBg: '#FFFFFF', bg: '#F0F9FF', text: '#202124', font: 'noto', radius: 12, fontScale: 1 };
  var FONTS = {
    noto: { label: 'Noto Sans KR', css: "'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Malgun Gothic', sans-serif", href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap' },
    pretendard: { label: 'Pretendard', css: "'Pretendard Variable', Pretendard, -apple-system, 'Malgun Gothic', sans-serif", href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css' },
    nanum: { label: '나눔고딕', css: "'Nanum Gothic', 'Malgun Gothic', sans-serif", href: 'https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700&display=swap' },
    system: { label: '시스템 기본', css: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif", href: '' }
  };
  function hex2rgb(h) {
    h = String(h || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgb2hex(c) { return '#' + c.map(function (x) { return ('0' + Math.max(0, Math.min(255, Math.round(x))).toString(16)).slice(-2); }).join(''); }
  function mix(a, b, t) { var A = hex2rgb(a), B = hex2rgb(b); if (!A || !B) return a; return rgb2hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); }
  function lum(h) {
    var c = hex2rgb(h); if (!c) return 1;
    var f = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  }
  function contrast(a, b) { var la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
  function onColor(bg) { return contrast(bg, '#FFFFFF') >= contrast(bg, '#202124') ? '#FFFFFF' : '#202124'; }
  // 버튼 글자색: 저장소 공통 스카이 블루(흰 글자)를 유지하되, 흰색 대비가 너무 낮은 밝은 색상에서만 어두운 글자 사용
  function onBtn(bg) { return contrast(bg, '#FFFFFF') >= 2.6 ? '#FFFFFF' : '#202124'; }

  function themeVars(t) {
    t = Object.assign({}, DEFAULT_THEME, t || {});
    var p = hex2rgb(t.primary) ? t.primary : DEFAULT_THEME.primary;
    var hb = hex2rgb(t.headerBg) ? t.headerBg : DEFAULT_THEME.headerBg;
    var bg = hex2rgb(t.bg) ? t.bg : DEFAULT_THEME.bg;
    var tx = hex2rgb(t.text) ? t.text : DEFAULT_THEME.text;
    var hfg = onColor(hb);
    var f = FONTS[t.font] || FONTS.noto;
    return {
      '--primary': p, '--primary-dk': mix(p, '#000000', 0.18), '--primary-lt': mix(p, '#FFFFFF', 0.88),
      '--on-primary': onBtn(p), '--bg': bg, '--text': tx, '--text-2': mix(tx, '#FFFFFF', 0.4),
      '--hdr-bg': hb, '--hdr-fg': hfg, '--logo-filter': hfg === '#FFFFFF' ? 'brightness(0) invert(1)' : 'none',
      '--r': Math.max(0, Math.min(24, Number(t.radius) || 0)) + 'px', '--fs': String(Math.max(0.85, Math.min(1.3, Number(t.fontScale) || 1))),
      '--font': f.css
    };
  }
  function applyTheme(t, root) {
    root = root || document.documentElement;
    var v = themeVars(t);
    Object.keys(v).forEach(function (k) { root.style.setProperty(k, v[k]); });
    var f = FONTS[(t && t.font) || 'noto'] || FONTS.noto;
    if (f.href && !document.querySelector('link[data-svy-font="' + (t && t.font || 'noto') + '"]')) {
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = f.href; l.setAttribute('data-svy-font', (t && t.font) || 'noto'); document.head.appendChild(l);
    }
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', v['--hdr-bg']);
  }

  /* ── 설문 정의 순회 ── */
  function scaleOf(def, q) { return ((def.scales || {})[q.scale || 'likert5']) || []; }
  function allQuestions(def) {
    var out = [], gen = def.mode === 'general';
    (def.basic || []).forEach(function (q) { out.push({ q: q, scope: 'common', basic: true, section: null }); });
    (def.sections || []).forEach(function (s) {
      (s.questions || []).forEach(function (q) { out.push({ q: q, scope: (gen || q.scope === 'common') ? 'common' : 'course', basic: false, section: s }); });
    });
    return out;
  }
  function isCheck(q) { return !!((q.check && q.check.valid != null) || q.attn); }
  function exclusiveIds(def, qid) {
    var ids = [];
    allQuestions(def).forEach(function (x) { if (x.q.id === qid) (x.q.options || []).forEach(function (o) { if (o.exclusive) ids.push(o.id); }); });
    return ids;
  }
  /* ── 조건 평가 (서버 svy.cond_one / svy.vis 와 같은 규칙) ──
     cond: {q, op, v}  op = eq|ne|in|nin|has|nhas|answered|empty|gt|gte|lt|lte
     그룹: {all:[...]} | {all/any 중첩} | 옛 형식 {q:'F1'}(복수선택에서 단독 선택 외 항목을 고른 경우) */
  function nil(v) { return v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && v !== null && !Object.keys(v).length); }
  function num(x) { return (x !== '' && x != null && isFinite(Number(x)) && typeof x !== 'boolean' && typeof x !== 'object') ? Number(x) : null; }
  function condOne(p, a, c) {
    var v = (a && a[p.q] !== undefined) ? a[p.q] : (c ? c[p.q] : undefined), op = p.op, x = p.v;
    if (op === 'answered') return !nil(v);
    if (op === 'empty') return nil(v);
    if (nil(v)) return op === 'ne' || op === 'nin' || op === 'nhas';
    var scalar = (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') ? String(v) : null, xs = String(x);
    if (op === 'eq' || op === 'ne') { var r = (num(scalar) !== null && num(xs) !== null) ? num(scalar) === num(xs) : scalar === xs; return op === 'eq' ? r : !r; }
    if (op === 'in' || op === 'nin') { var r2 = scalar !== null && Array.isArray(x) && x.map(String).indexOf(scalar) >= 0; return op === 'in' ? r2 : !r2; }
    if (op === 'has' || op === 'nhas') { var r3 = Array.isArray(v) && v.map(String).indexOf(xs) >= 0; return op === 'has' ? r3 : !r3; }
    var nv = num(scalar), nx = num(xs); if (nv === null || nx === null) return false;
    return op === 'gt' ? nv > nx : op === 'gte' ? nv >= nx : op === 'lt' ? nv < nx : nv <= nx;
  }
  function evalCond(cond, def, a, c) {
    if (!cond || typeof cond !== 'object') return true;
    if (cond.all) return cond.all.every(function (e) { return evalCond(e, def, a, c); });
    if (cond.any) return cond.any.some(function (e) { return evalCond(e, def, a, c); });
    if (cond.op) return condOne(cond, a, c);
    if (cond.q) { // 옛 형식
      var v = a && a[cond.q]; if (!Array.isArray(v) || !v.length) return false;
      var ex = exclusiveIds(def, cond.q); return v.some(function (x) { return ex.indexOf(x) < 0; });
    }
    return true;
  }
  // 문항 표시 여부(영역 조건은 호출 측에서 evalCond 로 별도 판단)
  function visible(def, q, ans, common) { return evalCond(q.showIf, def, ans, common); }
  function isEmpty(q, v) {
    if (v === undefined || v === null) return true;
    if (q.type === 'consent') return v !== true;
    return nil(v);
  }
  function isRequired(q) { return !!q.required || isCheck(q); }

  function fmtDate(s) {
    if (!s) return '';
    var d = new Date(s); if (isNaN(d)) return '';
    function p(n) { return ('0' + n).slice(-2); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  return {
    SUPA_URL: SUPA_URL, rpc: rpc, errMsg: errMsg, esc: esc, uid: uid, ls: ls, cookieGet: cookieGet, cookieSet: cookieSet,
    ico: ico, DEFAULT_THEME: DEFAULT_THEME, FONTS: FONTS, applyTheme: applyTheme, themeVars: themeVars, onColor: onColor, onBtn: onBtn, contrast: contrast, mix: mix, lum: lum,
    scaleOf: scaleOf, allQuestions: allQuestions, isCheck: isCheck, visible: visible, evalCond: evalCond, nil: nil, num: num, isEmpty: isEmpty, isRequired: isRequired, fmtDate: fmtDate
  };
})();

/* 연동 목록(일괄 업로드 목록) 열 이름 — def.link 가 없으면 기존 「과목별 평가」 용어를 그대로 씁니다. */
SVY.LINK_KEYS = ['track', 'grade', 'klass', 'name', 'kind', 'prof'];
SVY.linkInfo = function (def) {
  var L = (def && def.link) || {}, C = L.cols || {}, custom = !!(def && def.link && def.link.cols);
  var dflt = { track: '계열', grade: '학년', klass: '반', name: '과목명', kind: '구분', prof: '담당교수' };
  var out = { custom: custom, unit: L.unit || '과목', stepTitle: L.stepTitle || (custom ? (L.unit || '대상') + ' 선택' : '수강 반 선택'), cols: {} };
  SVY.LINK_KEYS.forEach(function (k) {
    var c = C[k] || {}; out.cols[k] = { label: c.label || dflt[k], use: custom ? c.use !== false : true, sample: c.sample || '' };
    if (k === 'name') out.cols[k].use = true;
  });
  return out;
};


/* 영역별 무작위 성실 응답 확인 (def.integrity)
 *  def.integrity = { on:true, sections:['S2',...], place:'rotate'|'first', scale:'likert5', maxFail:1, text:'(선택) {ans} 자리에 표시할 보기가 들어갑니다' }
 *  · 학생 화면이 각 영역 끝에 확인 문항('_I<영역ID>')을 넣고, 학생마다 다른 요구값(ask)을 만듭니다.
 *  · 과목 평가형에서는 과목 수만큼 반복하지 않고 한 번만 묻습니다. place='rotate' 는 영역 순서대로 수강 과목에 돌려가며, 'first' 는 첫 과목에 모아서 표시합니다.
 *  · 응답에는 chk[영역ID]={cid,ask} 가 함께 저장되고, 서버(db/survey_schema_12.sql)가 같은 규칙으로 다시 검증합니다.
 *  · 조건(showIf)이 걸린 영역은 숨겨질 수 있어 확인 문항을 넣지 않습니다. */
SVY.integ = (function () {
  var DEF_TEXT = '이 문항은 응답이 성실하게 이루어지고 있는지 확인하기 위한 것입니다. 내용과 관계없이 「{ans}」에 표시해 주십시오.';
  function cfg(def) {
    var g = (def && def.integrity) || null, on = !!(g && g.on);
    var exist = {}; ((def && def.sections) || []).forEach(function (s) { exist[s.id] = s; });
    var mf = g && g.maxFail != null && isFinite(Number(g.maxFail)) ? Math.max(0, Math.floor(Number(g.maxFail))) : 1;
    return { on: on, sections: on ? (g.sections || []).filter(function (id) { return exist[id]; }) : [], place: g && g.place === 'first' ? 'first' : 'rotate',
      scale: (g && g.scale) || 'likert5', maxFail: mf, text: (g && g.text) || DEF_TEXT };
  }
  // 점검 실패를 허용하는 횟수: 무작위 확인을 켠 설문만 허용치(기본 1회)를 쓰고, 그 외에는 0회
  function maxFail(def) { var c = cfg(def); return c.on ? c.maxFail : 0; }
  function courseScoped(def, s) { return def.mode !== 'general' && (s.questions || []).some(function (q) { return q.scope !== 'common'; }); }
  // 새 설문에서 처음 켤 때 기본으로 선택할 영역: 조건이 없고 척도 문항이 있는 영역
  function defaultSections(def) {
    return ((def && def.sections) || []).filter(function (s) { return !s.showIf && (s.questions || []).some(function (q) { return q.type === 'scale' && !(q.check && q.check.valid != null); }); }).map(function (s) { return s.id; });
  }
  function hashSeed(str) { var h = 1779033703 ^ str.length; for (var i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^ (h >>> 16)) >>> 0; }
  function prng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(arr, rnd) { for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
  // 요구값 배정: 척도 값(1~5)을 섞은 묶음에서 차례로 뽑아, 한 학생에게 같은 값이 겹치거나 이어지지 않게 합니다.
  function asks(vals, n, rnd) {
    var out = [];
    while (out.length < n) {
      var b = shuffle(vals.slice(), rnd);
      if (out.length && b.length > 1 && b[0] === out[out.length - 1]) { var t = b[0]; b[0] = b[1]; b[1] = t; }
      out = out.concat(b);
    }
    return out.slice(0, n);
  }
  /* 배치 계획: { 영역ID: { cid, ask, at } }
   *  at = 'course'(과목 칸 안, cid=과목 ID) | 'matrix'(질문별 표 화면, cid='common') | 'common'(공통 문항·일반 설문, cid='common')
   *  o = { courses:[과목 ID...], seed:'문자열', matrix:boolean } */
  function plan(def, o) {
    var c = cfg(def), out = {}; if (!c.on) return out;
    var vals = ((def.scales || {})[c.scale] || []).map(function (x) { return x.v; });
    if (!vals.length) return out;
    var secs = ((def && def.sections) || []).filter(function (s) { return c.sections.indexOf(s.id) >= 0 && !s.showIf; });
    var a = asks(vals, secs.length, prng(hashSeed(String(o.seed || 'x')))), cids = o.courses || [], j = 0;
    secs.forEach(function (s, i) {
      var cs = courseScoped(def, s), e = { ask: a[i] };
      if (!cs || !cids.length && !o.matrix) { e.at = 'common'; e.cid = 'common'; }
      else if (o.matrix) { e.at = 'matrix'; e.cid = 'common'; }
      else { e.at = 'course'; e.cid = c.place === 'first' ? cids[0] : cids[j % cids.length]; j++; }
      out[s.id] = e;
    });
    return out;
  }
  // 학생에게 보이는 확인 문항 (id '_I<영역ID>', 정답은 문항에 넣지 않고 chk 로 따로 관리)
  function question(def, sid, ask, scope) {
    var c = cfg(def), sc = ((def.scales || {})[c.scale] || []), hit = sc.filter(function (x) { return x.v === ask; })[0];
    return { id: '_I' + sid, type: 'scale', scope: scope === 'course' ? 'course' : 'common', scale: c.scale, required: true, attn: true, label: c.text.replace('{ans}', hit ? hit.label : String(ask)) };
  }
  return { cfg: cfg, maxFail: maxFail, plan: plan, question: question, defaultSections: defaultSections, courseScoped: courseScoped, DEF_TEXT: DEF_TEXT };
})();
SVY.maxFail = SVY.integ.maxFail;
