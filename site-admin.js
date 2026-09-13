// ASEA 사이트 관리자 패널 — 외관 설정 전체 동기화
(function () {
  'use strict';

  var SUPA_URL  = 'https://zbpeyklwpotjyveipzxd.supabase.co';
  var SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV5a2x3cG90anl2ZWlwenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTYxMDcsImV4cCI6MjA5NzA5MjEwN30.6JgoQ6rPRnmrbBTG68A-Y9HDQk40mnwubhXVnkZvHrQ';
  var SK        = 'global_appearance';
  var AH        = '8934dd487024b17ffae0cf13d4ed7809ec3beb0058b874a693ee6f457792fb6c';
  var SALT      = 'asea-admin-v1';

  // ── SHA-256 ──────────────────────────────────────────────────
  function sha256(str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }

  // ── Supabase REST ────────────────────────────────────────────
  var HDR = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

  function sbGet() {
    return fetch(SUPA_URL + '/rest/v1/site_settings?key=eq.' + SK + '&select=value', { headers: HDR })
      .then(function (r) { return r.json(); })
      .then(function (d) { return d && d[0] ? d[0].value : null; })
      .catch(function () { return null; });
  }

  function sbSet(val) {
    return fetch(SUPA_URL + '/rest/v1/site_settings', {
      method: 'POST',
      headers: Object.assign({}, HDR, { 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify({ key: SK, value: val, updated_at: new Date().toISOString() })
    }).catch(function () {});
  }

  // ── 클라우드 → 로컬 → 화면 동기화 ──────────────────────────
  function syncDown() {
    sbGet().then(function (remote) {
      if (!remote || typeof remote !== 'object') return;
      try { localStorage.setItem('app-appearance', JSON.stringify(remote)); } catch (e) {}
      if (window.AppApply)   AppApply();
      if (window._AppSyncUI) _AppSyncUI();
    });
  }
  syncDown();

  // ── 탭 카운터 (헤더 영역 3회 탭으로 패널 오픈) ──────────────
  var _tc = 0, _tt = null;
  function onTap() {
    _tc++;
    clearTimeout(_tt);
    _tt = setTimeout(function () { _tc = 0; }, 700);
    if (_tc >= 3) { _tc = 0; openAdmin(); }
  }

  // ── DOM 준비 후 트리거 설치 + 패널 DOM 삽입 ─────────────────
  function init() {
    // 트리거 요소
    var tels = document.querySelectorAll('header, .header, h1, .logo, .app-title, .hdr-title, .page-title');
    if (!tels.length) tels = [document.body];
    [].forEach.call(tels, function (el) {
      el.addEventListener('click',      onTap);
      el.addEventListener('touchstart', onTap, { passive: true });
    });
    buildPanel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── 패널 DOM 생성 ────────────────────────────────────────────
  var panel, overlay, pwModal, pwInput, pwErr;

  function buildPanel() {
    // 패널 CSS
    var style = document.createElement('style');
    style.textContent = [
      '.sa-ovl{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9000;opacity:0;pointer-events:none;transition:opacity .25s}',
      '.sa-ovl.on{opacity:1;pointer-events:auto}',
      '.sa-panel{position:fixed;bottom:0;left:0;right:0;z-index:9001;height:58vh;background:#fff;border-radius:20px 20px 0 0;',
        'box-shadow:0 -6px 32px rgba(0,0,0,.18);display:flex;flex-direction:column;',
        'transform:translateY(100%);transition:transform .32s cubic-bezier(.22,1,.36,1)}',
      '.sa-panel.on{transform:translateY(0)}',
      '.sa-drag{width:44px;height:4px;background:#e0e0e0;border-radius:2px;margin:10px auto 0;flex-shrink:0;cursor:grab}',
      '.sa-hdr{display:flex;align-items:center;gap:10px;padding:10px 16px 8px;border-bottom:1px solid #eee;flex-shrink:0}',
      '.sa-icon{width:32px;height:32px;border-radius:10px;background:#E8F0FE;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
      '.sa-ttl{flex:1;font-size:14px;font-weight:700;color:#202124;font-family:-apple-system,sans-serif}',
      '.sa-page{font-size:10px;color:#5F6368;font-family:monospace}',
      '.sa-x{width:26px;height:26px;border:none;background:#f1f3f4;color:#5F6368;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center}',
      '.sa-tabs{display:flex;gap:4px;padding:8px 14px 0;border-bottom:1px solid #eee;overflow-x:auto;flex-shrink:0;scrollbar-width:none}',
      '.sa-tabs::-webkit-scrollbar{display:none}',
      '.sa-tab{height:30px;padding:0 12px;border-radius:6px;border:none;background:transparent;font-size:12px;font-weight:500;color:#5F6368;cursor:pointer;white-space:nowrap;font-family:-apple-system,sans-serif}',
      '.sa-tab.on{background:#E8F0FE;color:#1A73E8;font-weight:700}',
      '.sa-body{flex:1;overflow-y:auto;padding:14px 16px 80px}',
      '.sa-sec{font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#9AA0A6;padding:10px 0 4px;border-top:1px solid #f1f3f4;margin-top:6px}',
      '.sa-sec:first-child{border-top:none;margin-top:0;padding-top:0}',
      '.sa-row{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}',
      '.sa-lbl{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:600;color:#5F6368;font-family:-apple-system,sans-serif}',
      '.sa-val{font-size:11px;font-weight:800;color:#1A73E8;font-family:monospace}',
      '.sa-row input[type="range"]{width:100%;accent-color:#1A73E8;height:4px;cursor:pointer}',
      '.sa-cbox{display:flex;gap:5px;flex-wrap:wrap}',
      '.sa-color-row{display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid #e8eaed;border-radius:8px;background:#fafafa}',
      '.sa-color-row input[type="color"]{width:26px;height:26px;border:none;padding:0;border-radius:6px;cursor:pointer;background:none;outline:none}',
      '.sa-chex{font-size:11px;font-family:monospace;color:#5F6368;flex:1}',
      '.sa-presets{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}',
      '.sa-cp{width:20px;height:20px;border-radius:5px;border:2px solid transparent;cursor:pointer;transition:transform .1s}',
      '.sa-cp:hover{transform:scale(1.25)}',
      '.sa-cp.on{border-color:#202124}',
      '.sa-chips{display:flex;gap:5px;flex-wrap:wrap}',
      '.sa-chip{padding:4px 10px;border-radius:7px;border:1.5px solid #e8eaed;font-size:11px;font-weight:600;color:#5F6368;cursor:pointer;font-family:-apple-system,sans-serif;user-select:none}',
      '.sa-chip.on{background:#E8F0FE;border-color:#1A73E8;color:#1A73E8}',
      '.sa-theme-row{display:flex;gap:8px;margin-top:4px}',
      '.sa-swatch{width:32px;height:32px;border-radius:50%;cursor:pointer;border:3px solid transparent;transition:transform .12s}',
      '.sa-swatch:hover{transform:scale(1.15)}',
      '.sa-swatch.on{border-color:#202124}',
      '.sa-footer{position:absolute;bottom:0;left:0;right:0;padding:10px 16px;background:#fff;border-top:1px solid #eee;display:flex;gap:8px}',
      '.sa-save-btn{flex:1;height:40px;background:#1A73E8;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;gap:6px}',
      '.sa-save-btn:disabled{opacity:.5;cursor:default}',
      '.sa-reset-btn{height:40px;padding:0 14px;background:transparent;color:#EA4335;border:1.5px solid #EA4335;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;font-family:-apple-system,sans-serif}',
      '.sa-saved{font-size:11px;color:#34A853;font-weight:700;display:none;align-items:center;gap:4px;font-family:-apple-system,sans-serif}',
      '.sa-pw-modal{position:fixed;inset:0;z-index:9100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)}',
      '.sa-pw-box{background:#fff;border-radius:16px;padding:24px;width:300px;max-width:calc(100vw - 32px);font-family:-apple-system,sans-serif}',
      '.sa-pw-ttl{font-size:15px;font-weight:700;color:#202124;margin-bottom:4px}',
      '.sa-pw-sub{font-size:12px;color:#5F6368;margin-bottom:16px}',
      '.sa-pw-inp{width:100%;height:42px;border:1.5px solid #e8eaed;border-radius:10px;padding:0 12px;font-size:14px;outline:none;font-family:-apple-system,sans-serif;box-sizing:border-box}',
      '.sa-pw-inp:focus{border-color:#1A73E8}',
      '.sa-pw-err{font-size:11px;color:#EA4335;margin-top:6px;min-height:16px}',
      '.sa-pw-btns{display:flex;gap:8px;margin-top:14px}',
      '.sa-pw-ok{flex:1;height:38px;background:#1A73E8;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;font-family:-apple-system,sans-serif}',
      '.sa-pw-cancel{height:38px;padding:0 14px;background:transparent;border:1.5px solid #e8eaed;border-radius:9px;font-size:13px;color:#5F6368;cursor:pointer;font-family:-apple-system,sans-serif}',
      '@media(prefers-color-scheme:dark){.sa-panel,.sa-footer{background:#1c2535}.sa-hdr,.sa-tabs{border-color:#2d3748}.sa-sec{border-color:#2d3748;color:#718096}.sa-ttl{color:#e2e8f0}.sa-page{color:#718096}.sa-x{background:#2d3748;color:#a0aec0}.sa-tab{color:#a0aec0}.sa-tab.on{background:#1e3a5f;color:#63b3ed}.sa-row input[type="range"]{accent-color:#63b3ed}.sa-lbl{color:#a0aec0}.sa-color-row{background:#2d3748;border-color:#4a5568}.sa-chex{color:#a0aec0}.sa-chip{border-color:#4a5568;color:#a0aec0}.sa-chip.on{background:#1e3a5f;border-color:#63b3ed;color:#63b3ed}.sa-save-btn{background:#2b6cb0}.sa-pw-box{background:#1c2535}.sa-pw-ttl{color:#e2e8f0}.sa-pw-sub{color:#a0aec0}.sa-pw-inp{background:#2d3748;border-color:#4a5568;color:#e2e8f0}.sa-saved{color:#68d391}}'
    ].join('');
    document.head.appendChild(style);

    // 오버레이
    overlay = document.createElement('div');
    overlay.className = 'sa-ovl';
    overlay.addEventListener('click', closeAdmin);
    document.body.appendChild(overlay);

    // 패널
    panel = document.createElement('div');
    panel.className = 'sa-panel';
    panel.innerHTML =
      '<div class="sa-drag"></div>' +
      '<div class="sa-hdr">' +
        '<div class="sa-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="#1A73E8"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a5 5 0 110 10A5 5 0 018 3zm-1 4h2v5H7V7zm0-3h2v2H7V4z"/></svg></div>' +
        '<div class="sa-ttl">외관 설정 <span class="sa-page" id="sa-page-id"></span></div>' +
        '<button class="sa-x" onclick="window._saClose()">×</button>' +
      '</div>' +
      '<div class="sa-tabs" id="sa-tabs"></div>' +
      '<div class="sa-body" id="sa-body"></div>' +
      '<div class="sa-footer">' +
        '<button class="sa-reset-btn" id="sa-reset">초기화</button>' +
        '<span class="sa-saved" id="sa-saved"><svg width="12" height="12" viewBox="0 0 12 12" fill="#34A853"><path d="M2 6l3 3 5-5"/></svg>저장됨</span>' +
        '<button class="sa-save-btn" id="sa-save">☁ 전체 저장 (크로스 단말 동기화)</button>' +
      '</div>';
    document.body.appendChild(panel);

    // 비밀번호 모달
    pwModal = document.createElement('div');
    pwModal.className = 'sa-pw-modal';
    pwModal.style.display = 'none';
    pwModal.innerHTML =
      '<div class="sa-pw-box">' +
        '<div class="sa-pw-ttl">관리자 인증</div>' +
        '<div class="sa-pw-sub">사이트 외관 설정 관리자만 접근할 수 있습니다</div>' +
        '<input class="sa-pw-inp" id="sa-pw-inp" type="password" placeholder="관리자 비밀번호" autocomplete="off">' +
        '<div class="sa-pw-err" id="sa-pw-err"></div>' +
        '<div class="sa-pw-btns">' +
          '<button class="sa-pw-cancel" id="sa-pw-cancel">취소</button>' +
          '<button class="sa-pw-ok" id="sa-pw-ok">확인</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(pwModal);

    pwInput = document.getElementById('sa-pw-inp');
    pwErr   = document.getElementById('sa-pw-err');

    document.getElementById('sa-pw-ok').addEventListener('click', doLogin);
    document.getElementById('sa-pw-cancel').addEventListener('click', function () { pwModal.style.display = 'none'; });
    pwInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    document.getElementById('sa-save').addEventListener('click', doSave);
    document.getElementById('sa-reset').addEventListener('click', doReset);

    window._saClose = closeAdmin;
  }

  // ── 관리자 오픈 흐름 ─────────────────────────────────────────
  function openAdmin() {
    if (sessionStorage.getItem('sa_auth') === '1') {
      showPanel();
    } else {
      pwModal.style.display = 'flex';
      pwErr.textContent = '';
      setTimeout(function () { pwInput.focus(); }, 50);
    }
  }

  function doLogin() {
    var pw = pwInput.value;
    if (!pw) return;
    sha256(pw + SALT).then(function (h) {
      if (h === AH) {
        sessionStorage.setItem('sa_auth', '1');
        pwModal.style.display = 'none';
        pwInput.value = '';
        showPanel();
      } else {
        pwErr.textContent = '비밀번호가 올바르지 않습니다';
        pwInput.select();
      }
    });
  }

  function showPanel() {
    overlay.classList.add('on');
    panel.classList.add('on');
    renderPanel();
    document.getElementById('sa-page-id').textContent = '— ' + detectPageName();
  }

  function closeAdmin() {
    overlay.classList.remove('on');
    panel.classList.remove('on');
  }

  // ── 현재 페이지 이름 감지 ────────────────────────────────────
  function detectPageName() {
    var path = location.pathname.replace(/.*\//, '') || 'index.html';
    var MAP = {
      'index.html':          '캘린더',
      'schedule.html':       '일정 관리',
      'forum.html':          'AI 포럼',
      'checkin.html':        '체크인',
      'reservation.html':    '시설 예약',
      'deadline.html':       '마감일',
      'parking.html':        '주차 현황',
      'parking-history.html':'주차 이력',
      'park.html':           '주차 신청',
      'dormitory/resident.html':      '기숙사 거주자',
      'dormitory/complaint.html':     '기숙사 민원',
      'dormitory/contract-sign.html': '기숙사 계약',
      'blog.html':           'N블로그 자동화',
      'survey.html':         '설문',
      'assessment.html':     '역량 평가',
      'wayfind.html':        '교내 길찾기',
      'card.html':           '명함',
      'hr-form.html':        'HR 양식',
      'report.html':         '보고서',
      'map.html':            '지도',
      'amulbo.html':         '아울보',
      'form.html':           '양식',
      'kiosk.html':          '키오스크',
      'share.html':          '공유',
      'calendar-share.html': '캘린더 공유',
      'staff-calendar.html': '직원 캘린더',
      'tasks-window.html':   '태스크',
      'facility-request.html':'시설 요청',
      'docgate.html':        '문서 게이트',
      'contract-sign.html':  '계약 서명',
      'contract-verify.html':'계약 확인',
      'retire-form.html':    '퇴직 양식',
      'promo-public.html':   '홍보 페이지',
      'cal-access-check.html':'캘린더 접근 확인',
      'manager/index.html':  '관리자',
    };
    return MAP[path] || path;
  }

  // ── 패널 탭 렌더링 ────────────────────────────────────────────
  var TABS = [
    { id: 'theme',   label: '🎨 테마',    render: renderTheme    },
    { id: 'color',   label: '🖌 색상',    render: renderColor    },
    { id: 'typo',    label: '📝 글꼴',    render: renderTypo     },
    { id: 'shape',   label: '⬜ 모양',   render: renderShape    },
    { id: 'layout',  label: '📐 레이아웃', render: renderLayout   },
  ];
  var _curTab = 'theme';

  function renderPanel() {
    var tabBar = document.getElementById('sa-tabs');
    tabBar.innerHTML = TABS.map(function (t) {
      return '<button class="sa-tab' + (t.id === _curTab ? ' on' : '') + '" onclick="window._saTab(\'' + t.id + '\')">' + t.label + '</button>';
    }).join('');
    renderTab();
  }

  window._saTab = function (id) {
    _curTab = id;
    document.querySelectorAll('.sa-tab').forEach(function (b) {
      b.classList.toggle('on', b.textContent.includes(TABS.find(function (t) { return t.id === id; }).label));
    });
    renderTab();
  };

  function renderTab() {
    var tab = TABS.find(function (t) { return t.id === _curTab; });
    if (tab) tab.render();
  }

  // ── 설정 헬퍼 ────────────────────────────────────────────────
  function _load() { try { return JSON.parse(localStorage.getItem('app-appearance') || '{}'); } catch (e) { return {}; } }
  var DEF_KEYS = { theme:'blue', colorBg:'#F8F9FB', colorCard:'#FFFFFF', colorBorder:'#E8EAED', colorText:'#202124', colorTextSec:'#5F6368', fontBase:14, fontSm:12, fontLg:16, radius:12, shadow:'md', spacing:1, mHeaderH:56, mTabH:48, pcMaxW:1280, pcFontBase:14, pcHeaderH:60 };
  function _get(k) { var d = _load(); return d[k] !== undefined ? d[k] : DEF_KEYS[k]; }
  function _set(k, v) { if (window.AppSave) AppSave(k, v); else { var d = _load(); d[k] = v; try { localStorage.setItem('app-appearance', JSON.stringify(d)); } catch(e) {} } }
  function _apply() { if (window.AppApply) AppApply(); }

  function makeSlider(k, label, min, max, step, unit) {
    var val = _get(k);
    return '<div class="sa-row">' +
      '<div class="sa-lbl">' + label + '<span class="sa-val" id="sav_' + k + '">' + val + (unit || '') + '</span></div>' +
      '<input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" oninput="window._saSlider(\'' + k + '\',this,' + (unit ? '\'' + unit + '\'' : 'null') + ')">' +
    '</div>';
  }

  window._saSlider = function (k, el, unit) {
    var v = parseFloat(el.value);
    var dispEl = document.getElementById('sav_' + k);
    if (dispEl) dispEl.textContent = v + (unit || '');
    _set(k, v); _apply();
  };

  function makeColorPicker(k, label, presets) {
    var cur = _get(k) || '#000000';
    var prs = (presets || []).map(function (h) {
      return '<div class="sa-cp' + (h.toLowerCase() === cur.toLowerCase() ? ' on' : '') + '" style="background:' + h + '" onclick="window._saColor(\'' + k + '\',\'' + h + '\')" title="' + h + '"></div>';
    }).join('');
    return '<div class="sa-row">' +
      '<div class="sa-lbl">' + label + '</div>' +
      '<div class="sa-color-row">' +
        '<input type="color" value="' + cur + '" oninput="window._saColor(\'' + k + '\',this.value)" id="scc_' + k + '">' +
        '<span class="sa-chex" id="scx_' + k + '">' + cur + '</span>' +
      '</div>' +
      (prs ? '<div class="sa-presets">' + prs + '</div>' : '') +
    '</div>';
  }

  window._saColor = function (k, val) {
    _set(k, val); _apply();
    var inp = document.getElementById('scc_' + k);
    if (inp) inp.value = val;
    var lbl = document.getElementById('scx_' + k);
    if (lbl) lbl.textContent = val;
    document.querySelectorAll('.sa-presets .sa-cp').forEach(function (el) {
      var bg = el.style.background;
      if (bg) el.classList.toggle('on', bg.toLowerCase() === val.toLowerCase());
    });
  };

  function makeChips(k, label, vals, labels) {
    var cur = String(_get(k));
    return '<div class="sa-row">' +
      '<div class="sa-lbl" style="margin-bottom:6px">' + label + '</div>' +
      '<div class="sa-chips">' +
        vals.map(function (v, i) {
          return '<div class="sa-chip' + (cur === String(v) ? ' on' : '') + '" onclick="window._saChip(\'' + k + '\',\'' + v + '\')">' + (labels[i] || v) + '</div>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  window._saChip = function (k, v) {
    _set(k, v); _apply();
    document.querySelectorAll('.sa-chips .sa-chip').forEach(function (el) {
      el.classList.toggle('on', el.textContent === v || el.onclick.toString().includes("'" + v + "'"));
    });
    // re-render current tab to update chip visual
    renderTab();
  };

  // ── 탭별 렌더 함수 ───────────────────────────────────────────
  function renderTheme() {
    var cur = _get('theme');
    var themes = [
      { id:'blue',   color:'#1A73E8', label:'블루'   },
      { id:'green',  color:'#16a34a', label:'그린'   },
      { id:'purple', color:'#7c3aed', label:'퍼플'   },
      { id:'rose',   color:'#e11d48', label:'로즈'   },
    ];
    document.getElementById('sa-body').innerHTML =
      '<div class="sa-sec">프리셋 테마</div>' +
      '<div class="sa-row"><div class="sa-lbl">테마 색상</div>' +
        '<div class="sa-theme-row">' +
          themes.map(function (t) {
            return '<div title="' + t.label + '" class="sa-swatch' + (cur === t.id ? ' on' : '') + '" style="background:' + t.color + '" onclick="window._saTheme(\'' + t.id + '\')"></div>';
          }).join('') +
        '</div>' +
      '</div>' +
      makeChips('shadow', '그림자', ['none','sm','md','lg'], ['없음','약하게','보통','강하게']) +
      makeSlider('spacing', '간격 배율', 0.5, 2, 0.1, '×');
  }

  window._saTheme = function (name) {
    if (window.applyAppTheme) applyAppTheme(name);
    renderTab();
  };

  function renderColor() {
    document.getElementById('sa-body').innerHTML =
      '<div class="sa-sec">배경</div>' +
      makeColorPicker('colorBg',   '페이지 배경', ['#F8F9FB','#F0F9FF','#FFFFFF','#F5F3FF','#ECFDF5','#FFFBEB']) +
      makeColorPicker('colorCard', '카드 배경',   ['#FFFFFF','#F9FAFB','#F8F9FA']) +
      '<div class="sa-sec">텍스트</div>' +
      makeColorPicker('colorText',    '기본 텍스트',  ['#202124','#111827','#0f172a','#000000']) +
      makeColorPicker('colorTextSec', '보조 텍스트',  ['#5F6368','#64748b','#6b7280']) +
      '<div class="sa-sec">테두리</div>' +
      makeColorPicker('colorBorder', '테두리 색상', ['#E8EAED','#D3DAE6','#e2e8f0','#c9d1d9']);
  }

  function renderTypo() {
    document.getElementById('sa-body').innerHTML =
      '<div class="sa-sec">폰트 크기 (모바일)</div>' +
      makeSlider('fontBase', '기본 크기', 12, 18, 1, 'px') +
      makeSlider('fontSm',   '소형 크기', 10, 16, 1, 'px') +
      makeSlider('fontLg',   '대형 크기', 14, 24, 1, 'px') +
      '<div class="sa-sec">폰트 크기 (PC)</div>' +
      makeSlider('pcFontBase', 'PC 기본 크기', 12, 18, 1, 'px');
  }

  function renderShape() {
    document.getElementById('sa-body').innerHTML =
      '<div class="sa-sec">모서리 반경</div>' +
      makeSlider('radius', '테두리 반경', 0, 24, 1, 'px') +
      '<div class="sa-sec">그림자</div>' +
      makeChips('shadow', '그림자 강도', ['none','sm','md','lg'], ['없음','약하게','보통','강하게']);
  }

  function renderLayout() {
    document.getElementById('sa-body').innerHTML =
      '<div class="sa-sec">헤더 / 탭바</div>' +
      makeSlider('mHeaderH',  '헤더 높이 (모바일)', 44, 72, 2, 'px') +
      makeSlider('mTabH',     '탭바 높이',           36, 64, 2, 'px') +
      makeSlider('pcHeaderH', '헤더 높이 (PC)',      48, 80, 2, 'px') +
      '<div class="sa-sec">PC 레이아웃</div>' +
      makeSlider('pcMaxW', 'PC 최대 너비', 900, 1600, 20, 'px');
  }

  // ── 저장 & 초기화 ────────────────────────────────────────────
  function doSave() {
    var btn = document.getElementById('sa-save');
    var saved = document.getElementById('sa-saved');
    btn.disabled = true;
    btn.textContent = '저장 중…';
    var d = _load();
    sbSet(d).then(function () {
      btn.textContent = '☁ 전체 저장 (크로스 단말 동기화)';
      btn.disabled = false;
      saved.style.display = 'flex';
      setTimeout(function () { saved.style.display = 'none'; }, 2500);
    });
  }

  function doReset() {
    if (!confirm('모든 외관 설정을 기본값으로 초기화하겠습니까?\n클라우드에도 동기화됩니다.')) return;
    try { localStorage.removeItem('app-appearance'); } catch (e) {}
    if (window.AppApply) AppApply();
    sbSet({}).then(function () { renderTab(); });
  }

})();
