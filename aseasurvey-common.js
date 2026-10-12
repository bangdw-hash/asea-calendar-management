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
    BAD_SCOPE: '초기화 범위가 올바르지 않습니다.'
  };
  function errMsg(code, raw) {
    if (!code) return '알 수 없는 오류가 발생했습니다.';
    if (ERR[code]) return ERR[code];
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
