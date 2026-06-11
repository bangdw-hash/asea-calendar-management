/* ═══════════════════════════════════════════════════════════════════
   print-frame.js — 통일 출력 프레임 v1.0 (2026-06-11)
   ───────────────────────────────────────────────────────────────────
   사용자가 출력하는 모든 문서폼(사직서·근로계약서·견적서·인사기록카드·
   보고서 등)을 동일한 레터헤드/제목/푸터/인쇄바/페이지 규격으로 감싼다.

   각 폼은 "본문(bodyHTML)"만 만들어 PrintFrame.open()에 넘긴다.
   바깥 틀(머리글·문서제목·푸터·인쇄버튼·A4 페이지설정·서체)은 프레임이 책임진다.

   API
   ─────────────────────────────────────────────────────────────────
   PrintFrame.open(opts)        새 창에 통일 문서를 그려 인쇄 미리보기
   PrintFrame.buildDoc(opts)    전체 HTML 문자열 반환 (창 없이)
   PrintFrame.css()             통일 CSS 문자열 (페이지 내 인쇄 재사용용)
   PrintFrame.letterheadHTML(o) 레터헤드 조각
   PrintFrame.footerHTML(o)     푸터 조각
   PrintFrame.actionBarHTML()   인쇄/닫기 바 조각 (.no-print)

   opts {
     title:      string  창 제목 (기본 = docTitle)
     docTitle:   string  큰 가운데 문서 제목 (예: '사 직 서') — 없으면 미표시
     subtitle:   string  문서 제목 아래 보조문구 (선택)
     category:   string  레터헤드 우측 작은 분류 라벨 (예: '인사 서식')
     bodyHTML:   string  폼 본문 (pf- 클래스 또는 자체 클래스 사용)
     extraCSS:   string  폼 고유 CSS (통일 CSS 뒤에 덧붙임)
     size:       'A4' | 'A4 landscape'  (기본 A4)
     footerLeft: string  푸터 좌측 (기본: 작성일시 등 자유)
     footerRight:string  푸터 우측 (기본: 담당자 연락처 자동)
     showLetterhead: bool (기본 true)
     showFooter:     bool (기본 true)
     autoPrint:  bool   열자마자 인쇄창 (기본 false)
   }
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ORG = '(재) 아세아항공직업전문학교';

  /* ── 관리자 로고 (없으면 기본 아이콘) ── */
  function _logo() {
    try { return localStorage.getItem('asea_logo') || ''; } catch (e) { return ''; }
  }
  /* ── 담당자 연락처 (관리자 연락처 관리와 동일 키) ── */
  function _contact() {
    var def = { name: '방시원', title: '차장', phone: '010-2055-5883' };
    try {
      var s = JSON.parse(localStorage.getItem('asea_contact_info') || 'null');
      if (s) return s;
    } catch (e) {}
    return def;
  }
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── 통일 CSS ───────────────────────────────────────────────── */
  function css(opts) {
    opts = opts || {};
    var size = opts.size || 'A4';
    return [
      '*{box-sizing:border-box;}',
      'html,body{margin:0;padding:0;}',
      'body{',
      "  font-family:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Noto Sans KR',sans-serif;",
      '  color:#1f2937;background:#eceff3;-webkit-font-smoothing:antialiased;',
      '}',

      /* 화면 미리보기 — 회색 배경 위 흰 종이 */
      '.pf-page{',
      '  width:190mm;min-height:277mm;margin:14mm auto;background:#fff;',
      '  padding:16mm 15mm 14mm;position:relative;',
      '  box-shadow:0 6px 30px rgba(15,23,42,.16);border-radius:2px;',
      '}',
      "@media print{ @page{ size:" + size + "; margin:14mm 15mm; } }",

      /* 레터헤드 */
      '.pf-letterhead{display:flex;align-items:center;gap:12px;',
      '  padding-bottom:8px;margin-bottom:14px;border-bottom:2.4px solid #1a3a5c;}',
      '.pf-lh-logo{height:30px;width:auto;max-width:160px;object-fit:contain;flex-shrink:0;}',
      '.pf-lh-logo-emoji{font-size:26px;line-height:1;flex-shrink:0;}',
      '.pf-lh-text{display:flex;flex-direction:column;gap:1px;min-width:0;}',
      '.pf-lh-org{font-size:13pt;font-weight:800;color:#1a3a5c;letter-spacing:.3px;}',
      '.pf-lh-sub{font-size:8.5pt;color:#8a94a3;}',
      '.pf-lh-cat{margin-left:auto;font-size:8.5pt;color:#5b6470;border:1px solid #d4dae2;',
      '  border-radius:999px;padding:2px 10px;white-space:nowrap;align-self:center;}',

      /* 문서 제목 */
      '.pf-doctitle{text-align:center;font-size:24pt;font-weight:900;letter-spacing:10px;',
      '  color:#111827;margin:6px 0 2px;padding-bottom:0;}',
      '.pf-subtitle{text-align:center;font-size:10.5pt;color:#4b5563;margin:0 0 10px;}',
      '.pf-titlewrap{margin-bottom:14px;}',
      '.pf-titlewrap::after{content:"";display:block;width:46mm;height:2.5px;background:#1a3a5c;',
      '  margin:8px auto 0;border-radius:2px;}',

      /* 본문 */
      '.pf-body{font-size:10pt;line-height:1.65;}',

      /* 통일 표 */
      '.pf-table{width:100%;border-collapse:collapse;margin:0 0 4mm;font-size:9.5pt;}',
      '.pf-table th,.pf-table td{border:1px solid #3a4452;padding:2.4mm 3mm;vertical-align:middle;}',
      '.pf-table th{background:#eef2f7;color:#1a3a5c;font-weight:700;text-align:center;}',
      '.pf-table .pf-th-label{background:#f4f6f9;color:#243447;font-weight:700;white-space:nowrap;}',

      /* 섹션 제목 */
      '.pf-sec{font-size:10pt;font-weight:800;color:#1a3a5c;background:#eff4fb;',
      '  border-left:3px solid #1a3a5c;padding:5px 10px;margin:0 0 7px;border-radius:0 4px 4px 0;}',

      /* 안내 박스 */
      '.pf-note{background:#fff8e7;border:1px solid #f3d27a;border-radius:6px;',
      '  padding:7px 10px;font-size:8.5pt;color:#8a6406;margin-top:6px;}',

      /* 서명/날인 */
      '.pf-signrow{display:flex;justify-content:flex-end;align-items:center;gap:9mm;margin:5mm 0;}',
      '.pf-signline{display:inline-block;min-width:38mm;height:0;border-bottom:1px solid #333;}',
      '.pf-muted{color:#6b7280;}',
      '.pf-center{text-align:center;}',
      '.pf-right{text-align:right;}',

      /* 푸터 */
      '.pf-footer{margin-top:10mm;padding-top:3mm;border-top:1px solid #d7dde5;',
      '  display:flex;justify-content:space-between;gap:12px;align-items:flex-end;',
      '  font-size:8pt;color:#94a0ae;}',
      '.pf-foot-right{text-align:right;white-space:nowrap;}',
      '.pf-foot-org{font-weight:700;color:#5b6470;}',

      /* 인쇄/닫기 액션바 */
      '.pf-actionbar{position:sticky;top:0;z-index:10;display:flex;justify-content:center;gap:10px;',
      '  padding:12px;background:rgba(236,239,243,.92);backdrop-filter:blur(4px);}',
      '.pf-btn{font-family:inherit;font-size:13px;font-weight:600;border:none;border-radius:8px;',
      '  padding:10px 24px;cursor:pointer;}',
      '.pf-btn-print{background:#1a3a5c;color:#fff;}',
      '.pf-btn-print:hover{background:#152f4a;}',
      '.pf-btn-close{background:#e2e6ec;color:#374151;}',
      '.pf-btn-close:hover{background:#d2d8e0;}',

      /* 인쇄 시 */
      '@media print{',
      '  body{background:#fff;}',
      '  .no-print{display:none !important;}',
      '  .pf-page{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none;border-radius:0;}',
      '  *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}',
      '}'
    ].join('\n');
  }

  /* ── 레터헤드 조각 ──────────────────────────────────────────── */
  function letterheadHTML(opts) {
    opts = opts || {};
    var logo = _logo();
    var mark = logo
      ? '<img class="pf-lh-logo" src="' + logo + '" alt="logo">'
      : '<span class="pf-lh-logo-emoji">📅</span>';
    return '<header class="pf-letterhead">' +
      mark +
      '<div class="pf-lh-text">' +
        '<span class="pf-lh-org">' + _esc(opts.orgName || ORG) + '</span>' +
        (opts.orgSub ? '<span class="pf-lh-sub">' + _esc(opts.orgSub) + '</span>' : '') +
      '</div>' +
      (opts.category ? '<span class="pf-lh-cat">' + _esc(opts.category) + '</span>' : '') +
    '</header>';
  }

  /* ── 푸터 조각 ──────────────────────────────────────────────── */
  function footerHTML(opts) {
    opts = opts || {};
    var c = _contact();
    var right = opts.footerRight != null
      ? opts.footerRight
      : ('문의: ' + _esc(c.name) + ' ' + _esc(c.title) + (c.phone ? ' · ' + _esc(c.phone) : '') +
         '<br><span class="pf-foot-org">' + _esc(opts.orgName || ORG) + '</span>');
    var left = opts.footerLeft != null ? opts.footerLeft : '';
    return '<footer class="pf-footer">' +
      '<div class="pf-foot-left">' + left + '</div>' +
      '<div class="pf-foot-right">' + right + '</div>' +
    '</footer>';
  }

  /* ── 액션바 조각 ────────────────────────────────────────────── */
  function actionBarHTML() {
    return '<div class="pf-actionbar no-print">' +
      '<button class="pf-btn pf-btn-print" onclick="window.print()">🖨 인쇄 / PDF 저장</button>' +
      '<button class="pf-btn pf-btn-close" onclick="window.close()">✕ 닫기</button>' +
    '</div>';
  }

  /* ── 전체 문서 ──────────────────────────────────────────────── */
  function buildDoc(opts) {
    opts = opts || {};
    var showLH = opts.showLetterhead !== false;
    var showFT = opts.showFooter !== false;

    var titleBlock = '';
    if (opts.docTitle) {
      titleBlock = '<div class="pf-titlewrap">' +
        '<h1 class="pf-doctitle">' + _esc(opts.docTitle) + '</h1>' +
        (opts.subtitle ? '<p class="pf-subtitle">' + _esc(opts.subtitle) + '</p>' : '') +
      '</div>';
    }

    var base = '';
    try { base = '<base href="' + location.href + '">'; } catch (e) {}

    return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">' +
      base +
      '<title>' + _esc(opts.title || opts.docTitle || '출력') + '</title>' +
      '<style>' + css(opts) + (opts.extraCSS || '') + '</style>' +
      '</head><body>' +
      actionBarHTML() +
      '<div class="pf-page">' +
        (showLH ? letterheadHTML(opts) : '') +
        titleBlock +
        '<div class="pf-body">' + (opts.bodyHTML || '') + '</div>' +
        (showFT ? footerHTML(opts) : '') +
      '</div>' +
      (opts.autoPrint
        ? '<script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>'
        : '') +
    '</body></html>';
  }

  /* ── 새 창에 열기 ──────────────────────────────────────────── */
  function open(opts) {
    opts = opts || {};
    var land = (opts.size === 'A4 landscape');
    var feat = land ? 'width=1100,height=800,scrollbars=yes' : 'width=920,height=820,scrollbars=yes';
    var win = window.open('', '_blank', feat);
    if (!win) {
      alert('팝업이 차단되었습니다. 이 사이트의 팝업을 허용한 후 다시 시도하세요.');
      return null;
    }
    win.document.open();
    win.document.write(buildDoc(opts));
    win.document.close();
    try { win.focus(); } catch (e) {}
    return win;
  }

  window.PrintFrame = {
    ORG: ORG,
    open: open,
    buildDoc: buildDoc,
    css: css,
    letterheadHTML: letterheadHTML,
    footerHTML: footerHTML,
    actionBarHTML: actionBarHTML
  };
})();
