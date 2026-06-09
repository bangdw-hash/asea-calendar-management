// usersettings.js — 사용자 개인 설정 (캘린더 색상 테마 등) v1.0 (2026-06-10)
(function () {
  'use strict';

  var SK_COLORS = 'asea_user_colors';

  /* 기본 색상값 */
  var DEFAULTS = {
    chipDarkBg:       '#1a73e8',  /* 진한 배경색 */
    chipLightBg:      '#e8f0fe',  /* 연한 배경색 */
    chipGrayText:     '#70757a',  /* 회색 글씨 */
    chipDarkText:     '#ffffff',  /* 진한 배경 위 글자색 */
    headerBg:         '#1a73e8',  /* 헤더 배경 */
    accentColor:      '#1a73e8',  /* 강조색 */
    calWeekdayBg:     '#1a73e8',  /* 요일 행 배경 */
    calTodayBg:       '#1a73e8',  /* 오늘 날짜 배경 */
    calSundayColor:   '#d32f2f',  /* 일요일 숫자 색 */
    calSaturdayColor: '#1565c0'   /* 토요일 숫자 색 */
  };

  /* 프리셋 */
  var PRESETS = [
    {
      name: '기본 (파란색)',
      colors: {
        chipDarkBg: '#1a73e8', chipLightBg: '#e8f0fe', chipGrayText: '#70757a', chipDarkText: '#ffffff',
        headerBg: '#1a73e8', accentColor: '#1a73e8', calWeekdayBg: '#1a73e8', calTodayBg: '#1a73e8',
        calSundayColor: '#d32f2f', calSaturdayColor: '#1565c0'
      }
    },
    {
      name: '다크 네이비',
      colors: {
        chipDarkBg: '#1e3a5f', chipLightBg: '#dce8f5', chipGrayText: '#607d8b', chipDarkText: '#ffffff',
        headerBg: '#1e3a5f', accentColor: '#2196f3', calWeekdayBg: '#1e3a5f', calTodayBg: '#1e3a5f',
        calSundayColor: '#e53935', calSaturdayColor: '#1976d2'
      }
    },
    {
      name: '그린 포레스트',
      colors: {
        chipDarkBg: '#2e7d32', chipLightBg: '#e8f5e9', chipGrayText: '#558b2f', chipDarkText: '#ffffff',
        headerBg: '#2e7d32', accentColor: '#43a047', calWeekdayBg: '#2e7d32', calTodayBg: '#2e7d32',
        calSundayColor: '#c62828', calSaturdayColor: '#1565c0'
      }
    },
    {
      name: '퍼플 모드',
      colors: {
        chipDarkBg: '#6a1b9a', chipLightBg: '#f3e5f5', chipGrayText: '#7b1fa2', chipDarkText: '#ffffff',
        headerBg: '#6a1b9a', accentColor: '#9c27b0', calWeekdayBg: '#6a1b9a', calTodayBg: '#6a1b9a',
        calSundayColor: '#c62828', calSaturdayColor: '#283593'
      }
    },
    {
      name: '모노크롬',
      colors: {
        chipDarkBg: '#37474f', chipLightBg: '#eceff1', chipGrayText: '#78909c', chipDarkText: '#ffffff',
        headerBg: '#37474f', accentColor: '#546e7a', calWeekdayBg: '#37474f', calTodayBg: '#37474f',
        calSundayColor: '#d32f2f', calSaturdayColor: '#455a64'
      }
    }
  ];

  /* ── 스토리지 ─────────────────────────────────── */
  function load() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SK_COLORS) || '{}')); } catch(e) { return Object.assign({}, DEFAULTS); }
  }
  function save(colors) {
    try { localStorage.setItem(SK_COLORS, JSON.stringify(colors)); } catch(e) {}
  }

  /* ── CSS 변수 적용 ──────────────────────────────── */
  function apply(colors) {
    var c = colors || load();
    var root = document.documentElement;
    root.style.setProperty('--uc-chip-dark-bg',        c.chipDarkBg       || DEFAULTS.chipDarkBg);
    root.style.setProperty('--uc-chip-light-bg',       c.chipLightBg      || DEFAULTS.chipLightBg);
    root.style.setProperty('--uc-chip-gray-text',      c.chipGrayText     || DEFAULTS.chipGrayText);
    root.style.setProperty('--uc-chip-dark-text',      c.chipDarkText     || DEFAULTS.chipDarkText);
    root.style.setProperty('--uc-header-bg',           c.headerBg         || DEFAULTS.headerBg);
    root.style.setProperty('--uc-accent',              c.accentColor      || DEFAULTS.accentColor);
    root.style.setProperty('--uc-cal-weekday-bg',      c.calWeekdayBg     || DEFAULTS.calWeekdayBg);
    root.style.setProperty('--uc-cal-today-bg',        c.calTodayBg       || DEFAULTS.calTodayBg);
    root.style.setProperty('--uc-cal-sunday-color',    c.calSundayColor   || DEFAULTS.calSundayColor);
    root.style.setProperty('--uc-cal-saturday-color',  c.calSaturdayColor || DEFAULTS.calSaturdayColor);
  }

  /* ── 설정 UI 렌더 ────────────────────────────────── */
  function renderColorSettings() {
    var container = document.getElementById('user-color-settings');
    if (!container) return;
    var c = load();

    var FIELDS = [
      { key: 'chipDarkBg',       label: '진한 배경색',          desc: '강조 이벤트 배경 · 헤더 배경' },
      { key: 'chipLightBg',      label: '연한 배경색',          desc: '일반 이벤트 배경' },
      { key: 'chipGrayText',     label: '회색 글씨 색',         desc: '부가 텍스트, 날짜 메타' },
      { key: 'chipDarkText',     label: '진한 배경 위 글자색',  desc: '진한 배경색 버튼·배지 텍스트' },
      { key: 'headerBg',         label: '헤더 배경색',          desc: '상단 헤더 바' },
      { key: 'accentColor',      label: '강조색',               desc: '버튼·링크·탭 활성색' },
      { key: 'calWeekdayBg',     label: '요일 행 배경색',       desc: '일~토 요일 헤더 행' },
      { key: 'calTodayBg',       label: '오늘 날짜 배경색',     desc: '오늘 날짜 원형 배경' },
      { key: 'calSundayColor',   label: '일요일 숫자 색',       desc: '일요일 날짜 텍스트' },
      { key: 'calSaturdayColor', label: '토요일 숫자 색',       desc: '토요일 날짜 텍스트' }
    ];

    var html = '<div class="uc-settings">' +
      /* 프리셋 */
      '<div class="uc-presets">' +
        '<span class="form-label" style="margin-bottom:6px;display:block">🎨 프리셋</span>' +
        '<div class="uc-preset-row">' +
        PRESETS.map(function (p, i) {
          return '<button class="uc-preset-btn" data-preset="' + i + '" ' +
            'style="background:' + p.colors.chipDarkBg + ';color:' + p.colors.chipDarkText + '">' +
            p.name + '</button>';
        }).join('') +
        '</div>' +
      '</div>' +

      /* 컬러 필드 */
      '<div class="uc-fields">' +
      FIELDS.map(function (f) {
        return '<div class="uc-field-row">' +
          '<div class="uc-field-info">' +
            '<span class="uc-field-label">' + f.label + '</span>' +
            '<span class="uc-field-desc">' + f.desc + '</span>' +
          '</div>' +
          '<input type="color" class="uc-color-inp" data-key="' + f.key + '" value="' + (c[f.key] || DEFAULTS[f.key]) + '">' +
          '<input type="text"  class="uc-hex-inp form-input" data-key="' + f.key + '" value="' + (c[f.key] || DEFAULTS[f.key]) + '" maxlength="7" style="width:86px">' +
        '</div>';
      }).join('') +
      '</div>' +

      /* 저장/리셋 */
      '<div class="uc-actions">' +
        '<button id="uc-save-btn"  class="btn btn-primary btn-sm">💾 저장 · 적용</button>' +
        '<button id="uc-reset-btn" class="btn btn-ghost   btn-sm">↺ 기본값으로</button>' +
      '</div>' +

    '</div>';

    container.innerHTML = html;

    /* 프리셋 클릭 */
    container.querySelectorAll('.uc-preset-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var preset = PRESETS[parseInt(this.dataset.preset)];
        if (!preset) return;
        container.querySelectorAll('.uc-color-inp').forEach(function (inp) {
          inp.value = preset.colors[inp.dataset.key] || DEFAULTS[inp.dataset.key];
        });
        container.querySelectorAll('.uc-hex-inp').forEach(function (inp) {
          inp.value = preset.colors[inp.dataset.key] || DEFAULTS[inp.dataset.key];
        });
        /* 미리보기 */
        apply(preset.colors);
      });
    });

    /* color 인풋 ↔ hex 텍스트 동기화 */
    container.querySelectorAll('.uc-color-inp').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var hex = container.querySelector('.uc-hex-inp[data-key="' + inp.dataset.key + '"]');
        if (hex) hex.value = inp.value;
        _livePreview(container);
      });
    });
    container.querySelectorAll('.uc-hex-inp').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var val = inp.value;
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
          var col = container.querySelector('.uc-color-inp[data-key="' + inp.dataset.key + '"]');
          if (col) col.value = val;
          _livePreview(container);
        }
      });
    });

    /* 저장 */
    var saveBtn = document.getElementById('uc-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      var newColors = Object.assign({}, DEFAULTS);
      container.querySelectorAll('.uc-color-inp').forEach(function (inp) {
        newColors[inp.dataset.key] = inp.value;
      });
      save(newColors);
      apply(newColors);
      if (window.toast) toast('색상 설정이 저장되었습니다.', 'success');
    });

    /* 리셋 */
    var resetBtn = document.getElementById('uc-reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      if (!confirm('기본값으로 초기화하시겠습니까?')) return;
      save(DEFAULTS);
      apply(DEFAULTS);
      renderColorSettings(); // 재렌더
      if (window.toast) toast('기본 색상으로 초기화되었습니다.', 'success');
    });
  }

  function _livePreview(container) {
    var preview = {};
    container.querySelectorAll('.uc-color-inp').forEach(function (inp) {
      preview[inp.dataset.key] = inp.value;
    });
    apply(preview);
  }

  /* ── 초기화 ─────────────────────────────────────── */
  function init() {
    apply();
    renderColorSettings();
  }

  window.UserSettingsModule = {
    init: init,
    apply: apply,
    load: load,
    renderColorSettings: renderColorSettings,
    DEFAULTS: DEFAULTS,
    PRESETS: PRESETS
  };
})();
