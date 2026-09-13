// 외관 설정 — 조기 적용 (FOUC 방지). 모든 페이지 <head>에서 로드.
(function () {
  var THEMES = {
    blue:   { accent: '#1A73E8', hover: '#1557B0', light: '#E8F0FE' },
    green:  { accent: '#16a34a', hover: '#15803d', light: '#dcfce7' },
    purple: { accent: '#7c3aed', hover: '#6d28d9', light: '#ede9fe' },
    rose:   { accent: '#e11d48', hover: '#be123c', light: '#ffe4e6' },
  };
  var DEF = {
    theme: 'blue',
    colorBg: '#F8F9FB', colorCard: '#FFFFFF', colorBorder: '#E8EAED',
    colorText: '#202124', colorTextSec: '#5F6368',
    fontBase: 14, fontSm: 12, fontLg: 16,
    radius: 12, shadow: 'md', spacing: 1,
    mHeaderH: 56, mTabH: 48,
    pcMaxW: 1280, pcFontBase: 14, pcHeaderH: 60,
  };
  function _load() { try { return JSON.parse(localStorage.getItem('app-appearance') || '{}'); } catch (e) { return {}; } }
  function _get(k) { var d = _load(); return d[k] !== undefined ? d[k] : DEF[k]; }

  window.AppSave = function (k, v) {
    var d = _load(); d[k] = v;
    try { localStorage.setItem('app-appearance', JSON.stringify(d)); } catch (e) {}
  };
  window.AppReset = function (k) { AppSave(k, DEF[k]); AppApply(); window._AppSyncUI && _AppSyncUI(); };
  window.AppResetAll = function () {
    try { localStorage.removeItem('app-appearance'); } catch (e) {}
    AppApply(); window._AppSyncUI && _AppSyncUI();
  };
  window.AppSegSave = function (btn) {
    AppSave(btn.dataset.key, btn.dataset.val); AppApply();
    document.querySelectorAll('.appear-seg-btn[data-key="' + btn.dataset.key + '"]').forEach(function (b) {
      b.classList.toggle('active', b === btn);
    });
  };

  window.applyAppTheme = function (name) {
    var t = THEMES[name] || THEMES.blue;
    var r = document.documentElement.style;
    // 표준 토큰
    r.setProperty('--color-accent',       t.accent);
    r.setProperty('--color-accent-hover', t.hover);
    r.setProperty('--color-accent-light', t.light);
    r.setProperty('--color-bg-hover',     t.light);
    r.setProperty('--color-primary',      t.accent);
    // 개별 페이지 alias (--primary 계열)
    r.setProperty('--primary',       t.accent);
    r.setProperty('--primary-dark',  t.hover);
    r.setProperty('--primary-light', t.light);
    r.setProperty('--primary-hover', t.hover);
    document.querySelectorAll('.theme-swatch').forEach(function (s) {
      s.classList.toggle('active', s.dataset.theme === name);
    });
    AppSave('theme', name);
  };

  window.AppApply = function () {
    var r = document.documentElement.style;
    var bg = _get('colorBg');
    r.setProperty('--color-bg',             bg);
    r.setProperty('--color-card',           _get('colorCard'));
    r.setProperty('--color-border',         _get('colorBorder'));
    r.setProperty('--color-text',           _get('colorText'));
    r.setProperty('--color-text-secondary', _get('colorTextSec'));
    // body background override (pages with hardcoded body bg)
    var bsEl = document.getElementById('__body-bg');
    if (!bsEl) { bsEl = document.createElement('style'); bsEl.id = '__body-bg'; document.head.appendChild(bsEl); }
    bsEl.textContent = 'body{background:' + bg + '!important}';

    var fb = parseInt(_get('fontBase')) || 14;
    r.setProperty('--font-xs',   (fb - 3) + 'px');
    r.setProperty('--font-sm',   _get('fontSm') + 'px');
    r.setProperty('--font-base', fb + 'px');
    r.setProperty('--font-md',   (fb + 1) + 'px');
    r.setProperty('--font-lg',   _get('fontLg') + 'px');
    r.setProperty('--font-xl',   (parseInt(_get('fontLg')) + 2) + 'px');
    r.setProperty('--font-2xl',  (parseInt(_get('fontLg')) + 6) + 'px');

    var rad = parseInt(_get('radius')) || 12;
    ['--r-sm', '--r-md', '--r-lg', '--r-xl', '--r-full'].forEach(function (v) { r.setProperty(v, rad + 'px'); });
    // 개별 페이지 alias
    r.setProperty('--radius', rad + 'px');
    r.setProperty('--r',      rad + 'px');

    var SH = {
      none: ['none', 'none', 'none', 'none'],
      sm:   ['0 1px 2px rgba(0,0,0,.06)', '0 1px 4px rgba(0,0,0,.09)', '0 2px 8px rgba(0,0,0,.12)', '0 6px 20px rgba(0,0,0,.15)'],
      md:   ['0 1px 3px rgba(60,64,67,.08),0 1px 2px rgba(60,64,67,.06)',
             '0 2px 8px rgba(60,64,67,.12),0 2px 4px rgba(60,64,67,.08)',
             '0 8px 24px rgba(60,64,67,.14),0 4px 8px rgba(60,64,67,.10)',
             '0 12px 40px rgba(60,64,67,.22)'],
      lg:   ['0 2px 6px rgba(0,0,0,.14)', '0 4px 16px rgba(0,0,0,.18)', '0 10px 32px rgba(0,0,0,.22)', '0 16px 56px rgba(0,0,0,.28)'],
    };
    var sh = SH[_get('shadow')] || SH.md;
    r.setProperty('--shadow-sm',      sh[0]);
    r.setProperty('--shadow-md',      sh[1]);
    r.setProperty('--shadow-lg',      sh[2]);
    r.setProperty('--shadow-overlay', sh[3]);
    // 개별 페이지 shadow alias
    r.setProperty('--sh',    sh[0]);
    r.setProperty('--sh-md', sh[1]);
    r.setProperty('--sh-lg', sh[2]);

    var sc = parseFloat(_get('spacing')) || 1;
    [1, 2, 3, 4, 5, 6, 8].forEach(function (n) { r.setProperty('--sp-' + n, Math.round(n * 4 * sc) + 'px'); });
    r.setProperty('--header-h', _get('mHeaderH') + 'px');
    r.setProperty('--tab-h',    _get('mTabH') + 'px');

    var el = document.getElementById('__pc-style');
    if (!el) { el = document.createElement('style'); el.id = '__pc-style'; document.head.appendChild(el); }
    el.textContent = '@media(min-width:769px){:root{' +
      '--max-content-w:' + _get('pcMaxW') + 'px;' +
      '--header-h:' + _get('pcHeaderH') + 'px;' +
      '--font-base:' + _get('pcFontBase') + 'px' +
    '}}';

    applyAppTheme(_get('theme'));
  };

  window._AppSyncUI = function () {
    var d = _load();
    function get(k) { return d[k] !== undefined ? d[k] : DEF[k]; }
    function sv(id, val) { var el = document.getElementById(id); if (el) el.value = String(val); }
    function st(id, val) { var el = document.getElementById(id); if (el) el.textContent = String(val); }
    sv('ap-colorBg',      get('colorBg'));      st('ap-colorBg-v',      get('colorBg'));
    sv('ap-colorCard',    get('colorCard'));     st('ap-colorCard-v',    get('colorCard'));
    sv('ap-colorBorder',  get('colorBorder'));   st('ap-colorBorder-v',  get('colorBorder'));
    sv('ap-colorText',    get('colorText'));     st('ap-colorText-v',    get('colorText'));
    sv('ap-colorTextSec', get('colorTextSec')); st('ap-colorTextSec-v', get('colorTextSec'));
    sv('ap-fontBase',     get('fontBase'));      st('ap-fontBase-v',     get('fontBase') + 'px');
    sv('ap-fontSm',       get('fontSm'));        st('ap-fontSm-v',       get('fontSm') + 'px');
    sv('ap-fontLg',       get('fontLg'));        st('ap-fontLg-v',       get('fontLg') + 'px');
    sv('ap-radius',       get('radius'));        st('ap-radius-v',       get('radius') + 'px');
    sv('ap-mHeaderH',     get('mHeaderH'));      st('ap-mHeaderH-v',     get('mHeaderH') + 'px');
    sv('ap-mTabH',        get('mTabH'));         st('ap-mTabH-v',        get('mTabH') + 'px');
    sv('ap-pcMaxW',       get('pcMaxW'));        st('ap-pcMaxW-v',       get('pcMaxW') + 'px');
    sv('ap-pcFontBase',   get('pcFontBase'));    st('ap-pcFontBase-v',   get('pcFontBase') + 'px');
    sv('ap-pcHeaderH',    get('pcHeaderH'));     st('ap-pcHeaderH-v',    get('pcHeaderH') + 'px');
    document.querySelectorAll('.appear-seg-btn').forEach(function (b) {
      b.classList.toggle('active', String(b.dataset.val) === String(get(b.dataset.key)));
    });
    applyAppTheme(get('theme'));
  };

  try { AppApply(); } catch (e) {}
})();
