'use strict';
window.PromoModule = (function () {

  /* ══════════════════════════════════════════════════════════════
     상수 정의
  ══════════════════════════════════════════════════════════════ */

  var PRES_TYPES = [
    { id: 'external',     label: '대외형',     icon: '🌐',
      desc: '로비·외부 모니터. 슬라이드 누적, 5초 전환', badge: '5초' },
    { id: 'event-single', label: '행사단일용', icon: '🎯',
      desc: '행사 전용 단독화면. 등록 시 기존 슬라이드 교체', badge: '단독' },
    { id: 'internal',     label: '내부행사용', icon: '📋',
      desc: '내부 공지용. 슬라이드 누적, 3초 빠른전환', badge: '3초' },
    { id: 'general',      label: '일반용',     icon: '📌',
      desc: '일반 안내용. 슬라이드 누적, 8초 전환', badge: '8초' },
  ];

  var LAYOUTS = [
    { id: 'full-top',   label: '상단 배경',   desc: '상단 2/3 색상 + 하단 흰색' },
    { id: 'full-color', label: '전체 색상',   desc: '전체 배경색' },
    { id: 'dark-left',  label: '좌측 강조',   desc: '좌측 색상띠 + 흰 배경' },
    { id: 'img-bg',     label: '이미지 배경', desc: '업로드 이미지를 배경으로' },
  ];

  var FONTS = [
    { id: 'Noto Sans KR',   label: 'Noto Sans KR (기본)' },
    { id: 'Nanum Gothic',   label: '나눔 고딕' },
    { id: 'Nanum Myeongjo', label: '나눔 명조' },
    { id: 'Black Han Sans', label: '블랙 한산스 (굵음)' },
    { id: 'Jua',            label: '주아 (둥글굵음)' },
    { id: 'Gugi',           label: '구기 (포인트)' },
    { id: 'Do Hyeon',       label: '도현 (슬림굵음)' },
    { id: 'Gowun Dodum',    label: '고운 돋음 (깔끔)' },
  ];

  var THEMES = [
    { id: '홍보', label: '📢 홍보', bg: '#C8185A' },
    { id: '안내', label: '📋 안내', bg: '#1565C0' },
    { id: '행사', label: '🎉 행사', bg: '#2E7D32' },
    { id: '경고', label: '⚠️ 경고', bg: '#E65100' },
    { id: '직접', label: '🎨 직접', bg: '#444444' },
  ];

  var SK_HISTORY  = 'asea_promo_history';
  var SK_SETTINGS = 'asea_promo_settings';

  /* ══════════════════════════════════════════════════════════════
     상태
  ══════════════════════════════════════════════════════════════ */
  var _history    = [];
  var _publishing = false;
  var _switching  = false;
  var _inited     = false;
  var _bgImageB64 = null;
  var _insImages  = [];

  /* 현재 라이브 상태 (GAS에서 받아옴) */
  var _liveType   = '';
  var _liveTs     = '';

  var _cfg = {
    font:      'Noto Sans KR',
    layout:    'full-top',
    theme:     '홍보',
    customBg:  '#C8185A',
    presType:  'general',
    switchNow: false,   // 등록 후 즉시 전환 여부
  };

  /* ══════════════════════════════════════════════════════════════
     유틸
  ══════════════════════════════════════════════════════════════ */
  function $p(id) { return document.getElementById(id); }
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function uid()  { return Date.now() + '_' + Math.random().toString(36).slice(2,6); }
  function pad(n) { return String(n).padStart(2,'0'); }
  function fmtDT(iso) {
    var d = new Date(iso);
    return d.getFullYear()+'.'+pad(d.getMonth()+1)+'.'+pad(d.getDate())
      +' '+pad(d.getHours())+':'+pad(d.getMinutes());
  }
  function toast(msg, type) { if (typeof window.toast === 'function') window.toast(msg, type); }
  function getBg() {
    if (_cfg.theme === '직접') return _cfg.customBg;
    var t = THEMES.find(function(x){ return x.id === _cfg.theme; });
    return t ? t.bg : '#C8185A';
  }
  function getGasUrl()  { return (typeof CONFIG !== 'undefined' && CONFIG.promoGasUrl) || localStorage.getItem('asea_promo_gas_url') || ''; }
  function getApiKey()  {
    if (window.getClaudeConfig) { var _c = getClaudeConfig(); return _c.apiKey; }
    return (typeof CONFIG !== 'undefined' && CONFIG.anthropicApiKey) || localStorage.getItem('asea_anthropic_api_key') || '';
  }
  function getToken()   { return localStorage.getItem('asea_promo_access_token') || ''; }
  function getTypeById(id) { return PRES_TYPES.find(function(t){ return t.id === id; }) || PRES_TYPES[3]; }

  function loadAll() {
    try { _history = JSON.parse(localStorage.getItem(SK_HISTORY)) || []; } catch(e) { _history = []; }
    try {
      var s = JSON.parse(localStorage.getItem(SK_SETTINGS));
      if (s) {
        _cfg.font      = s.font      || _cfg.font;
        _cfg.layout    = s.layout    || _cfg.layout;
        _cfg.theme     = s.theme     || _cfg.theme;
        _cfg.customBg  = s.customBg  || _cfg.customBg;
        _cfg.presType  = s.presType  || _cfg.presType;
        _cfg.switchNow = !!s.switchNow;
      }
    } catch(e) {}
  }
  function saveCfg() { try { localStorage.setItem(SK_SETTINGS, JSON.stringify(_cfg)); } catch(e) {} }
  function saveHistory(rec) {
    _history.unshift(rec);
    if (_history.length > 50) _history = _history.slice(0, 50);
    try { localStorage.setItem(SK_HISTORY, JSON.stringify(_history)); } catch(e) {}
  }

  function resolveEndpoint(key) {
    var off = /^sk-ant-/.test(key);
    return {
      url: off ? 'https://api.anthropic.com/v1/messages' : 'https://api.amplifuse.io/v1/messages',
      isOfficial: off,
    };
  }

  /* ══════════════════════════════════════════════════════════════
     초기화
  ══════════════════════════════════════════════════════════════ */
  function init() {
    if (!_inited) { _inited = true; loadAll(); }
    render();
    injectFonts();
    fetchLiveStatus();
  }

  function injectFonts() {
    if (document.getElementById('prm-gfonts')) return;
    var l = document.createElement('link');
    l.id = 'prm-gfonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&family=Nanum+Gothic:wght@400;700;800&family=Nanum+Myeongjo:wght@400;700&family=Black+Han+Sans&family=Jua&family=Gugi&family=Do+Hyeon&family=Gowun+Dodum&display=swap';
    document.head.appendChild(l);
  }

  /* GAS에서 현재 송출 상태 조회 */
  async function fetchLiveStatus() {
    var gasUrl = getGasUrl();
    if (!gasUrl) return;
    try {
      var resp = await fetch(gasUrl + '?_t=' + Date.now());
      var data = await resp.json();
      if (data.active) {
        _liveType = data.active.type || '';
        _liveTs   = data.active.ts   || '';
        renderStatusPanel();
      }
    } catch(e) {}
  }

  /* ══════════════════════════════════════════════════════════════
     렌더링
  ══════════════════════════════════════════════════════════════ */
  function render() {
    var el = $p('tab-promo'); if (!el) return;
    el.innerHTML = buildPage();
    bindEvents();
    renderPreview();
    renderHistory();
    renderInsImages();
    renderStatusPanel();
  }

  /* ── 전체 페이지 ── */
  function buildPage() {
    return '<div class="prm-wrap">' +

      /* ① 송출 현황 패널 */
      '<div class="prm-status-panel" id="prm-status-panel">' +
        buildStatusPanel() +
      '</div>' +

      /* ② 슬라이드 작성 */
      '<div class="prm-card">' +
        '<div class="prm-card-title">✏️ 슬라이드 작성</div>' +
        buildTypeSelector() +
        buildFormatSection() +
        buildTextSection() +
        buildImageSection() +
      '</div>' +

      /* ③ 미리보기 + 등록 */
      '<div class="prm-card" id="prm-preview-area">' +
        '<div class="prm-card-title">👁️ 미리보기</div>' +
        '<div id="prm-preview-box"></div>' +
        buildSubmitSection() +
      '</div>' +

      /* ④ 등록 이력 */
      '<div class="prm-card">' +
        '<div class="prm-card-title" style="display:flex;justify-content:space-between;align-items:center">' +
          '🕘 등록 이력' +
          '<button id="prm-refresh-btn" class="prm-btn prm-btn-ghost prm-btn-sm">🔄 새로고침</button>' +
        '</div>' +
        '<div id="prm-history-tbl"></div>' +
      '</div>' +

    '</div>';
  }

  /* ── ① 송출 현황 패널 ── */
  function buildStatusPanel() {
    var gasOk   = !!getGasUrl();
    var liveT   = getTypeById(_liveType);
    var liveLabel = _liveType ? (liveT.icon + ' ' + liveT.label) : '—';
    var liveTime  = _liveTs   ? fmtDT(new Date(parseInt(_liveTs)).toISOString()) : '—';

    var switchBtns = PRES_TYPES.map(function(t){
      var active = (t.id === _liveType);
      return '<button class="prm-sw-btn'+(active?' prm-sw-active':'')+'" data-type="'+t.id+'" title="'+t.desc+'">' +
        t.icon + ' ' + t.label +
        (active ? ' <span class="prm-live-dot"></span>' : '') +
      '</button>';
    }).join('');

    var kioskUrl = buildKioskUrl();
    var publicUrl = buildPublicUrl(_cfg.presType);

    return '<div class="prm-status-inner">' +
      '<div class="prm-status-left">' +
        '<div class="prm-status-label">현재 송출 중</div>' +
        '<div class="prm-status-live">' +
          (gasOk
            ? '<span class="prm-status-type">' + liveLabel + '</span>' +
              '<span class="prm-status-time">마지막 등록: ' + liveTime + '</span>'
            : '<span class="prm-status-nogas">⚠️ 설정 탭에서 GAS URL을 먼저 등록하세요</span>'
          ) +
        '</div>' +
      '</div>' +
      '<div class="prm-status-right">' +
        '<div class="prm-status-label">타입 즉시 전환 (슬라이드 추가 없이)</div>' +
        '<div class="prm-sw-row" id="prm-sw-row">' + switchBtns + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="prm-status-urls">' +
      '<div class="prm-url-item">' +
        '<span class="prm-url-lbl">🖥️ 키오스크 URL</span>' +
        '<span class="prm-url-val" id="prm-kiosk-url-val">' + (kioskUrl ? esc(kioskUrl) : '등록 후 표시') + '</span>' +
        (kioskUrl ? '<button class="prm-btn prm-btn-ghost prm-btn-xs" id="prm-copy-kiosk">복사</button>' : '') +
      '</div>' +
      '<div class="prm-url-item">' +
        '<span class="prm-url-lbl">🔗 외부 입력 공개 URL</span>' +
        '<span class="prm-url-val" id="prm-public-url-val">' + esc(publicUrl) + '</span>' +
        '<button class="prm-btn prm-btn-ghost prm-btn-xs" id="prm-copy-public">복사</button>' +
      '</div>' +
    '</div>';
  }

  function renderStatusPanel() {
    var el = $p('prm-status-panel');
    if (!el) return;
    el.innerHTML = buildStatusPanel();
    bindStatusEvents();
  }

  /* ── ② 타입 선택 ── */
  function buildTypeSelector() {
    var cards = PRES_TYPES.map(function(t){
      var sel = (_cfg.presType === t.id);
      return '<label class="prm-type-card' + (sel ? ' prm-type-sel' : '') + '" title="' + t.desc + '">' +
        '<input type="radio" name="prm-pres-type" value="' + t.id + '"' + (sel?' checked':'') + ' hidden>' +
        '<div class="prm-type-icon">' + t.icon + '</div>' +
        '<div class="prm-type-lbl">' + t.label + '</div>' +
        '<div class="prm-type-badge">' + t.badge + '</div>' +
      '</label>';
    }).join('');
    return '<div class="prm-section">' +
      '<div class="prm-section-label">등록할 슬라이드쇼 타입</div>' +
      '<div class="prm-type-row">' + cards + '</div>' +
      '<div class="prm-type-desc" id="prm-type-desc">' + getTypeDesc(_cfg.presType) + '</div>' +
    '</div>';
  }

  function getTypeDesc(id) {
    var map = {
      'external':     '로비·외부 모니터용으로 슬라이드가 <strong>누적</strong>됩니다. 5초마다 자동전환하며 무한 루프합니다.',
      'event-single': '특정 행사 전용입니다. 등록 시 기존 슬라이드를 <strong>모두 교체</strong>하여 항상 1장만 표시됩니다. 자동전환 없는 정지화면입니다.',
      'internal':     '내부 강당·공지용입니다. 슬라이드가 <strong>누적</strong>되며 3초마다 빠르게 전환합니다.',
      'general':      '일반 안내용입니다. 슬라이드가 <strong>누적</strong>되며 8초마다 여유있게 전환합니다.',
    };
    return map[id] || '';
  }

  /* ── 서식 설정 ── */
  function buildFormatSection() {
    var layoutCards = LAYOUTS.map(function(l){
      return '<label class="prm-lt-card' + (_cfg.layout===l.id?' prm-lt-sel':'') + '" title="'+l.desc+'">' +
        '<input type="radio" name="prm-layout" value="'+l.id+'"'+(_cfg.layout===l.id?' checked':'')+' hidden>' +
        '<span class="prm-lt-thumb prm-lt-'+l.id+'"></span>' +
        '<span class="prm-lt-lbl">'+l.label+'</span>' +
      '</label>';
    }).join('');

    var themeChips = THEMES.map(function(t){
      return '<label class="prm-theme-lbl" style="--tc:'+t.bg+'">' +
        '<input type="radio" name="prm-theme" value="'+t.id+'"'+(_cfg.theme===t.id?' checked':'')+' hidden>' +
        '<span class="prm-theme-chip">'+t.label+'</span>' +
      '</label>';
    }).join('');

    var fontOpts = FONTS.map(function(f){
      return '<option value="'+f.id+'"'+(_cfg.font===f.id?' selected':'')+'>'+f.label+'</option>';
    }).join('');

    return '<details class="prm-format-details" id="prm-format-details">' +
      '<summary class="prm-format-summary">🎨 서식 설정 <span class="prm-format-hint">레이아웃 · 폰트 · 색상</span></summary>' +
      '<div class="prm-format-body">' +

        '<div class="prm-format-row">' +
          '<div class="prm-section-label">레이아웃</div>' +
          '<div class="prm-lt-row">' + layoutCards + '</div>' +
        '</div>' +

        '<div class="prm-format-row">' +
          '<div class="prm-section-label">서체</div>' +
          '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
            '<select id="prm-font-sel" class="prm-sel" style="max-width:220px">' + fontOpts + '</select>' +
            '<div id="prm-font-sample" class="prm-font-sample">가나다 ASEA</div>' +
          '</div>' +
        '</div>' +

        '<div class="prm-format-row">' +
          '<div class="prm-section-label">배경 색상</div>' +
          '<div class="prm-theme-row">' + themeChips + '</div>' +
          '<div id="prm-custom-color-row" class="prm-custom-row"' + (_cfg.theme!=='직접'?' hidden':'') + '>' +
            '<input type="color" id="prm-custom-color" value="' + _cfg.customBg + '" class="prm-color-inp">' +
            '<span style="font-size:12px;color:#666">색상 직접 선택</span>' +
          '</div>' +
        '</div>' +

      '</div>' +
    '</details>';
  }

  /* ── 텍스트 입력 ── */
  function buildTextSection() {
    return '<div class="prm-section">' +
      '<div class="prm-section-label">텍스트 내용</div>' +

      '<div class="prm-field-row">' +
        '<span class="prm-field-badge prm-badge-tag">태그</span>' +
        '<input type="text" id="prm-tag" class="prm-field-inp" placeholder="#태그1 #태그2  예) #신입생모집 #항공정비" maxlength="60">' +
      '</div>' +

      '<div class="prm-field-row">' +
        '<span class="prm-field-badge prm-badge-title">제목</span>' +
        '<input type="text" id="prm-title" class="prm-field-inp" placeholder="20자 이내 핵심 제목" maxlength="40">' +
      '</div>' +

      '<div class="prm-field-row">' +
        '<span class="prm-field-badge prm-badge-body">본문</span>' +
        '<textarea id="prm-body" class="prm-field-ta" rows="3" placeholder="80자 이내 본문  예) 원서접수 6/1~7/31 / 문의 02-714-9710"></textarea>' +
      '</div>' +

      '<div class="prm-ai-row">' +
        '<input type="text" id="prm-ai-input" class="prm-field-inp" placeholder="AI 자동 생성: 홍보할 내용 요약 입력">' +
        '<button id="prm-gen-btn" class="prm-btn prm-btn-ai">🤖 AI 생성</button>' +
      '</div>' +
      '<div id="prm-err" class="prm-err" hidden></div>' +
    '</div>';
  }

  /* ── 이미지 ── */
  function buildImageSection() {
    return '<div class="prm-section">' +
      '<div class="prm-section-label">이미지 <span style="font-size:11px;color:#999;font-weight:400">(선택)</span></div>' +
      '<div class="prm-img-grid">' +

        '<div class="prm-img-zone">' +
          '<div style="font-size:12px;color:#666;margin-bottom:4px">배경 이미지 <span style="font-size:11px">(이미지 배경 레이아웃 전용)</span></div>' +
          '<div class="prm-drop" id="prm-bg-drop">' +
            '<input type="file" id="prm-bg-file" accept="image/*" hidden>' +
            '<div id="prm-bg-preview"><span>📷 클릭하거나 드래그</span></div>' +
          '</div>' +
          '<button id="prm-bg-clear" class="prm-btn prm-btn-ghost prm-btn-sm"' + (!_bgImageB64?' hidden':'') + '>× 제거</button>' +
        '</div>' +

        '<div class="prm-img-zone">' +
          '<div style="font-size:12px;color:#666;margin-bottom:4px">삽입 이미지 <span style="font-size:11px">(여러 장 가능)</span></div>' +
          '<div class="prm-drop" id="prm-ins-drop">' +
            '<input type="file" id="prm-ins-file" accept="image/*" multiple hidden>' +
            '<div class="prm-drop-inner"><span>📎 클릭하거나 드래그</span></div>' +
          '</div>' +
          '<div id="prm-ins-list" class="prm-ins-list"></div>' +
        '</div>' +

      '</div>' +
    '</div>';
  }

  /* ── 등록 섹션 ── */
  function buildSubmitSection() {
    /* 행사단일용이면 즉시 전환 기본 체크 */
    var defSwitch = (_cfg.presType === 'event-single') ? true : _cfg.switchNow;
    return '<div class="prm-submit-row">' +
      '<label class="prm-switch-label">' +
        '<input type="checkbox" id="prm-switch-now"' + (defSwitch?' checked':'') + '>' +
        '<span class="prm-switch-txt">등록 후 이 타입으로 키오스크 <strong>즉시 전환</strong></span>' +
        '<span class="prm-switch-hint">체크 해제 시 슬라이드만 추가되고 현재 화면은 유지됩니다</span>' +
      '</label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button id="prm-reset-btn" class="prm-btn prm-btn-ghost">↺ 초기화</button>' +
        '<button id="prm-publish-btn" class="prm-btn prm-btn-accent">📺 슬라이드 등록</button>' +
      '</div>' +
    '</div>';
  }

  /* ── 키오스크 / 공개 URL 생성 ── */
  function buildKioskUrl() {
    var gasUrl = getGasUrl();
    if (!gasUrl) return '';
    return window.location.origin +
      window.location.pathname.replace(/\/[^/]*$/, '') +
      '/kiosk.html?gas=' + encodeURIComponent(gasUrl);
  }

  function buildPublicUrl(type) {
    var gasUrl = getGasUrl();
    var base   = window.location.origin +
      window.location.pathname.replace(/\/[^/]*$/, '') + '/promo-public.html';
    var p = new URLSearchParams();
    if (gasUrl) p.set('gas', gasUrl);
    if (type)   p.set('type', type);
    var tok = getToken(); if (tok) p.set('token', tok);
    return base + '?' + p.toString();
  }

  /* ══════════════════════════════════════════════════════════════
     미리보기
  ══════════════════════════════════════════════════════════════ */
  function renderPreview() {
    var box = $p('prm-preview-box'); if (!box) return;
    var tag   = ($p('prm-tag')  ||{}).value || '';
    var title = ($p('prm-title')||{}).value || '';
    var body  = ($p('prm-body') ||{}).value || '';
    var bg = getBg(), font = _cfg.font, layout = _cfg.layout;
    var ff = "'" + font + "',sans-serif";

    var tagH   = tag   ? '<div class="prm-pv-tag">'   + esc(tag)   + '</div>' : '';
    var titleH = title ? '<div class="prm-pv-title">'  + esc(title) + '</div>'
                       : '<div class="prm-pv-title prm-pv-ph">메인 제목을 입력하세요</div>';
    var bodyH  = body  ? '<div class="prm-pv-body">'   + esc(body).replace(/\n/g,'<br>') + '</div>' : '';
    var html = '';

    if (layout === 'full-top') {
      html = '<div class="prm-pv-slide prm-pv-full-top" style="font-family:'+ff+'">' +
        '<div class="prm-pv-top-band" style="background:'+bg+'">'+tagH+titleH+'</div>' +
        '<div class="prm-pv-bottom-band">'+bodyH+'</div></div>';
    } else if (layout === 'full-color') {
      html = '<div class="prm-pv-slide prm-pv-full-color" style="background:'+bg+';font-family:'+ff+'">' +
        tagH+titleH+bodyH+'</div>';
    } else if (layout === 'dark-left') {
      html = '<div class="prm-pv-slide prm-pv-dark-left" style="font-family:'+ff+'">' +
        '<div class="prm-pv-left-band" style="background:'+bg+'">' +
          '<div class="prm-pv-left-text">'+esc(tag||'ASEA')+'</div></div>' +
        '<div class="prm-pv-right-content">'+titleH+bodyH+'</div></div>';
    } else {
      var bgS = (_bgImageB64 && layout==='img-bg')
        ? 'background-image:url('+_bgImageB64+');background-size:cover;background-position:center;'
        : 'background:'+bg+';';
      html = '<div class="prm-pv-slide prm-pv-img-bg" style="'+bgS+'font-family:'+ff+'">' +
        '<div class="prm-pv-img-overlay" style="background:'+bg+'55">'+tagH+titleH+bodyH+'</div></div>';
    }

    if (_insImages.length) {
      html += '<div class="prm-ins-thumbs">' +
        _insImages.map(function(img){ return '<img src="'+img.b64+'" class="prm-ins-thumb" title="'+esc(img.name)+'">'; }).join('') +
      '</div>';
    }
    box.innerHTML = html;

    var sample = $p('prm-font-sample');
    if (sample) sample.style.fontFamily = ff;
  }

  function renderInsImages() {
    var el = $p('prm-ins-list'); if (!el) return;
    if (!_insImages.length) { el.innerHTML = ''; return; }
    el.innerHTML = _insImages.map(function(img, i){
      return '<div class="prm-ins-item">' +
        '<img src="'+img.b64+'" class="prm-ins-item-img">' +
        '<span class="prm-ins-item-name">'+esc(img.name)+'</span>' +
        '<button class="prm-ins-del" data-i="'+i+'">×</button>' +
      '</div>';
    }).join('');
    el.querySelectorAll('.prm-ins-del').forEach(function(btn){
      btn.addEventListener('click', function(){
        _insImages.splice(parseInt(btn.dataset.i), 1);
        renderInsImages(); renderPreview();
      });
    });
  }

  function renderHistory() {
    var el = $p('prm-history-tbl'); if (!el) return;
    if (!_history.length) {
      el.innerHTML = '<p class="prm-empty-state">등록 이력이 없습니다.</p>'; return;
    }
    var rows = _history.map(function(r){
      var sc = r.status==='success'?'prm-s-ok':r.status==='failed'?'prm-s-fail':'prm-s-pend';
      var sl = r.status==='success'?'✅ 성공':r.status==='failed'?'❌ 실패':'⏳';
      var tm = getTypeById(r.presType || '');
      var link = r.slideLink ? '<a href="'+r.slideLink+'" target="_blank" class="prm-link">열기</a>' : '-';
      return '<tr><td>'+fmtDT(r.createdAt)+'</td>' +
        '<td>'+(tm.icon+' '+tm.label)+'</td>' +
        '<td class="prm-td-title">'+esc(r.title||'-')+'</td>' +
        '<td><span class="prm-chip '+sc+'">'+sl+(r.switched?' 전환':'')+'</span></td>' +
        '<td>'+link+'</td></tr>';
    }).join('');
    el.innerHTML = '<div class="prm-tbl-wrap"><table class="prm-tbl">' +
      '<thead><tr><th>일시</th><th>타입</th><th>제목</th><th>상태</th><th>링크</th></tr></thead>' +
      '<tbody>'+rows+'</tbody></table></div>';
  }

  /* ══════════════════════════════════════════════════════════════
     이벤트 바인딩
  ══════════════════════════════════════════════════════════════ */
  function bindEvents() {
    /* 텍스트 → 실시간 미리보기 */
    ['prm-tag','prm-title','prm-body'].forEach(function(id){
      var el = $p(id); if (el) el.addEventListener('input', renderPreview);
    });

    /* 타입 선택 */
    document.querySelectorAll('input[name="prm-pres-type"]').forEach(function(r){
      r.addEventListener('change', function(){
        _cfg.presType = r.value; saveCfg();
        document.querySelectorAll('.prm-type-card').forEach(function(c){ c.classList.remove('prm-type-sel'); });
        r.closest('.prm-type-card').classList.add('prm-type-sel');
        var desc = $p('prm-type-desc'); if (desc) desc.innerHTML = getTypeDesc(r.value);
        /* 행사단일용이면 즉시전환 자동 체크 */
        var sn = $p('prm-switch-now');
        if (sn) sn.checked = (r.value === 'event-single') ? true : _cfg.switchNow;
        /* 공개 URL 갱신 */
        var pubEl = $p('prm-public-url-val');
        if (pubEl) pubEl.textContent = buildPublicUrl(r.value);
      });
    });

    /* 레이아웃 */
    document.querySelectorAll('input[name="prm-layout"]').forEach(function(r){
      r.addEventListener('change', function(){
        _cfg.layout = r.value; saveCfg();
        document.querySelectorAll('.prm-lt-card').forEach(function(c){ c.classList.remove('prm-lt-sel'); });
        r.closest('.prm-lt-card').classList.add('prm-lt-sel');
        renderPreview();
      });
    });

    /* 테마 */
    document.querySelectorAll('input[name="prm-theme"]').forEach(function(r){
      r.addEventListener('change', function(){
        _cfg.theme = r.value; saveCfg();
        var ccRow = $p('prm-custom-color-row');
        if (ccRow) ccRow.hidden = (_cfg.theme !== '직접');
        renderPreview();
      });
    });

    /* 직접 색상 */
    var cc = $p('prm-custom-color');
    if (cc) cc.addEventListener('input', function(){ _cfg.customBg = cc.value; saveCfg(); renderPreview(); });

    /* 폰트 */
    var fs = $p('prm-font-sel');
    if (fs) fs.addEventListener('change', function(){ _cfg.font = fs.value; saveCfg(); renderPreview(); });

    /* 즉시전환 체크박스 저장 */
    var sn = $p('prm-switch-now');
    if (sn) sn.addEventListener('change', function(){
      if (_cfg.presType !== 'event-single') { _cfg.switchNow = sn.checked; saveCfg(); }
    });

    /* 배경 이미지 */
    bindImageDrop('prm-bg-drop', 'prm-bg-file', function(file){ loadBgImg(file); });
    var bgClear = $p('prm-bg-clear');
    if (bgClear) bgClear.addEventListener('click', function(){
      _bgImageB64 = null; bgClear.hidden = true;
      var prev = $p('prm-bg-preview'); if (prev) prev.innerHTML = '<span>📷 클릭하거나 드래그</span>';
      renderPreview();
    });

    /* 삽입 이미지 */
    bindImageDrop('prm-ins-drop', 'prm-ins-file', function(file){ loadInsImg(file); }, true);

    /* AI 생성 */
    var gb = $p('prm-gen-btn'); if (gb) gb.addEventListener('click', onGenerate);

    /* 등록 */
    var pb = $p('prm-publish-btn'); if (pb) pb.addEventListener('click', onPublish);

    /* 초기화 */
    var rb = $p('prm-reset-btn');
    if (rb) rb.addEventListener('click', function(){
      _bgImageB64 = null; _insImages = [];
      ['prm-tag','prm-title','prm-body','prm-ai-input'].forEach(function(id){
        var e = $p(id); if (e) e.value = '';
      });
      var prev = $p('prm-bg-preview'); if (prev) prev.innerHTML = '<span>📷 클릭하거나 드래그</span>';
      var bc = $p('prm-bg-clear'); if (bc) bc.hidden = true;
      renderInsImages(); renderPreview();
    });

    /* 이력 새로고침 */
    var rfb = $p('prm-refresh-btn');
    if (rfb) rfb.addEventListener('click', function(){ loadAll(); renderHistory(); fetchLiveStatus(); });
  }

  function bindStatusEvents() {
    /* 즉시 전환 버튼들 */
    document.querySelectorAll('.prm-sw-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        onSwitchOnly(btn.dataset.type);
      });
    });

    /* 키오스크 URL 복사 */
    var ck = $p('prm-copy-kiosk');
    if (ck) ck.addEventListener('click', function(){
      copyToClipboard(buildKioskUrl(), '키오스크 URL 복사됨');
    });

    /* 공개 URL 복사 */
    var cp = $p('prm-copy-public');
    if (cp) cp.addEventListener('click', function(){
      copyToClipboard(buildPublicUrl(_cfg.presType), '공개 URL 복사됨');
    });
  }

  function bindImageDrop(dropId, fileId, onFile, multiple) {
    var drop = $p(dropId), file = $p(fileId);
    if (!drop) return;
    drop.addEventListener('click', function(){ if (file) file.click(); });
    drop.addEventListener('dragover', function(e){ e.preventDefault(); drop.classList.add('prm-drop-over'); });
    drop.addEventListener('dragleave', function(){ drop.classList.remove('prm-drop-over'); });
    drop.addEventListener('drop', function(e){
      e.preventDefault(); drop.classList.remove('prm-drop-over');
      var files = Array.from(e.dataTransfer.files).filter(function(f){ return f.type.startsWith('image/'); });
      if (multiple) files.forEach(onFile); else if (files[0]) onFile(files[0]);
    });
    if (file) file.addEventListener('change', function(){
      var files = Array.from(file.files);
      if (multiple) files.forEach(onFile); else if (files[0]) onFile(files[0]);
      file.value = '';
    });
  }

  function loadBgImg(file) {
    var r = new FileReader();
    r.onload = function(e){
      _bgImageB64 = e.target.result;
      var prev = $p('prm-bg-preview');
      if (prev) prev.innerHTML = '<img src="'+_bgImageB64+'" style="max-height:70px;max-width:100%;border-radius:4px">';
      var bc = $p('prm-bg-clear'); if (bc) bc.hidden = false;
      _cfg.layout = 'img-bg'; saveCfg();
      var lr = document.querySelector('input[name="prm-layout"][value="img-bg"]');
      if (lr) { lr.checked = true; document.querySelectorAll('.prm-lt-card').forEach(function(c){ c.classList.remove('prm-lt-sel'); }); lr.closest('.prm-lt-card').classList.add('prm-lt-sel'); }
      renderPreview();
    };
    r.readAsDataURL(file);
  }

  function loadInsImg(file) {
    var r = new FileReader();
    r.onload = function(e){ _insImages.push({ b64: e.target.result, name: file.name }); renderInsImages(); renderPreview(); };
    r.readAsDataURL(file);
  }

  function copyToClipboard(text, msg) {
    navigator.clipboard.writeText(text).then(function(){ toast(msg, 'success'); })
      .catch(function(){ window.prompt('URL을 복사하세요:', text); });
  }

  /* ══════════════════════════════════════════════════════════════
     AI 문구 생성
  ══════════════════════════════════════════════════════════════ */
  async function onGenerate() {
    var inp = $p('prm-ai-input');
    var txt = (inp && inp.value.trim()) || '';
    if (!txt) { showErr('AI 생성: 홍보 내용을 먼저 입력하세요.'); return; }
    var _cc = window.getClaudeConfig ? getClaudeConfig() : { apiKey: getApiKey(), endpoint: 'https://api.anthropic.com/v1/messages', isOfficial: true };
    var key = _cc.apiKey;
    if (!key) { showErr('설정 탭에서 Claude API 키를 먼저 등록하세요.'); return; }
    var btn = $p('prm-gen-btn');
    btn.disabled = true; btn.innerHTML = '<span class="prm-spin"></span>';
    hideErr();
    try {
      var hdrs = { 'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01' };
      if (_cc.isOfficial) hdrs['anthropic-dangerous-direct-browser-access'] = 'true';
      var resp = await window.claudeFetch(_cc.endpoint, { method:'POST', headers:hdrs, body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 300,
        system: '아세아항공직업전문학교 홍보 담당자입니다.\nJSON만 반환하세요. 형식: {"title":"20자이내","body":"80자이내(줄바꿈\\n허용)","tag":"#태그1 #태그2"}',
        messages: [{ role:'user', content:'테마:'+_cfg.theme+'\n내용:'+txt }],
      })});
      if (!resp.ok) throw new Error('API ' + resp.status);
      var data = await resp.json();
      var text = (window.claudeExtractText ? window.claudeExtractText(data) : (data.content&&data.content[0]&&data.content[0].text)) || '';
      var m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error('JSON 없음');
      var parsed = JSON.parse(m[0]);
      var ti=$p('prm-title'), bo=$p('prm-body'), ta=$p('prm-tag');
      if (ti) ti.value = parsed.title || '';
      if (bo) bo.value = parsed.body  || '';
      if (ta) ta.value = parsed.tag   || '';
      renderPreview();
      toast('AI 문구 생성 완료!', 'success');
    } catch(err){ showErr('생성 실패: ' + err.message); }
    finally { btn.disabled = false; btn.innerHTML = '🤖 AI 생성'; }
  }

  /* ══════════════════════════════════════════════════════════════
     슬라이드 등록
  ══════════════════════════════════════════════════════════════ */
  async function onPublish() {
    if (_publishing) return;
    var gasUrl = getGasUrl();
    if (!gasUrl) { toast('설정 탭에서 GAS URL을 먼저 등록하세요.', 'error'); return; }
    var title = ($p('prm-title')||{}).value || '';
    var body  = ($p('prm-body') ||{}).value || '';
    if (!title && !body) { toast('제목 또는 본문을 입력하세요.', 'error'); return; }

    var switchNow = ($p('prm-switch-now')||{}).checked || false;
    _publishing = true;
    var pb = $p('prm-publish-btn');
    if (pb) { pb.disabled = true; pb.innerHTML = '<span class="prm-spin"></span> 등록 중...'; }

    try {
      var payload = {
        title: title, body: body, tag: ($p('prm-tag')||{}).value||'',
        presentationType: _cfg.presType,
        switchNow: switchNow,
        accessToken: getToken(),
        bg: getBg(), font: _cfg.font, layout: _cfg.layout,
        bgImage: (_cfg.layout==='img-bg' && _bgImageB64) ? _bgImageB64 : null,
        insertImages: _insImages.map(function(i){ return { b64:i.b64, name:i.name }; }),
      };
      var resp = await fetch(gasUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      var result = await resp.json();
      if (!resp.ok || result.error) throw new Error(result.error || 'GAS 오류 ' + resp.status);

      /* 이력 저장 */
      saveHistory({
        id: uid(), presType: _cfg.presType, title: title, body: body,
        tag: ($p('prm-tag')||{}).value||'',
        status: 'success', switched: switchNow,
        slideLink: result.presentationUrl || null,
        createdAt: new Date().toISOString(),
      });

      var msg = switchNow
        ? '슬라이드 등록 + 키오스크 전환 완료! 🎉 (최대 90초 후 반영)'
        : '슬라이드 등록 완료! 🎉 (키오스크 화면은 유지됩니다)';
      toast(msg, 'success');

      /* 입력 초기화 */
      ['prm-tag','prm-title','prm-body','prm-ai-input'].forEach(function(id){ var e=$p(id); if(e) e.value=''; });
      _bgImageB64 = null; _insImages = [];
      var prev = $p('prm-bg-preview'); if (prev) prev.innerHTML='<span>📷 클릭하거나 드래그</span>';
      var bc = $p('prm-bg-clear'); if (bc) bc.hidden = true;
      renderPreview(); renderInsImages(); renderHistory();

      /* 라이브 상태 갱신 */
      if (switchNow) {
        _liveType = _cfg.presType;
        _liveTs   = Date.now().toString();
      }
      renderStatusPanel();

    } catch(err){
      saveHistory({
        id: uid(), presType: _cfg.presType, title: title, body: body, tag:'',
        status: 'failed', switched: false, slideLink: null,
        createdAt: new Date().toISOString(),
      });
      toast('등록 실패: ' + err.message, 'error'); renderHistory();
    } finally {
      _publishing = false;
      if (pb) { pb.disabled = false; pb.innerHTML = '📺 슬라이드 등록'; }
    }
  }

  /* ══════════════════════════════════════════════════════════════
     타입 즉시 전환 (슬라이드 추가 없이)
  ══════════════════════════════════════════════════════════════ */
  async function onSwitchOnly(type) {
    if (_switching) return;
    var gasUrl = getGasUrl();
    if (!gasUrl) { toast('설정 탭에서 GAS URL을 먼저 등록하세요.', 'error'); return; }
    _switching = true;
    var btn = document.querySelector('.prm-sw-btn[data-type="'+type+'"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="prm-spin"></span>'; }

    try {
      var resp = await fetch(gasUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        action: 'switch',
        presentationType: type,
        accessToken: getToken(),
      })});
      var result = await resp.json();
      if (result.error) throw new Error(result.error);
      _liveType = type;
      _liveTs   = Date.now().toString();
      var tm = getTypeById(type);
      toast(tm.icon + ' ' + tm.label + ' 타입으로 전환됩니다. (최대 90초 소요)', 'success');
      renderStatusPanel();
    } catch(err){ toast('전환 실패: ' + err.message, 'error'); }
    finally { _switching = false; }
  }

  function showErr(m){ var e=$p('prm-err'); if(e){ e.textContent=m; e.hidden=false; } }
  function hideErr(){ var e=$p('prm-err'); if(e) e.hidden=true; }

  return { init: init };
})();
