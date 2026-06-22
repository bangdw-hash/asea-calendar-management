'use strict';
/**
 * monoicons.js — 앱 전역 컬러 이모지 → 파란/단색 라인 SVG 아이콘 일괄 치환
 *
 * - 버튼·탭·메뉴·툴바·헤더·카드 라벨 등 UI 요소의 이모지를 깔끔한 단색 SVG(.mono-ico)로 교체
 * - stroke=currentColor → 글자색 상속(파란 버튼=파란 아이콘, 흰글자 버튼=흰 아이콘)
 * - 매핑 안 된 이모지는 그대로 둠(의미 훼손 방지) · 화살표/체크(→ ✓ ✕ ★)는 대상 아님
 * - 동적 렌더도 MutationObserver로 반영
 */
(function () {
  function s(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
  var EMAP = {
    '📋': s('<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/>'),
    '✅': s('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
    '✔': s('<polyline points="20 6 9 17 4 12"/>'),
    '☑': s('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
    '❌': s('<circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'),
    '⚠': s('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    '📣': s('<path d="M3 11l15-6v14L3 13z"/><path d="M3 11v2a2 2 0 0 0 2 2h1"/><path d="M8 16v3a1 1 0 0 0 1 1h1"/>'),
    '📢': s('<path d="M3 11l15-6v14L3 13z"/><path d="M3 11v2a2 2 0 0 0 2 2h1"/><path d="M8 16v3a1 1 0 0 0 1 1h1"/>'),
    '✉': s('<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/>'),
    '📨': s('<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/>'),
    '📭': s('<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/>'),
    '🔍': s('<circle cx="11" cy="11" r="7"/><path d="m21 21-3.5-3.5"/>'),
    '📝': s('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    '✏': s('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    '✍': s('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    '🏢': s('<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>'),
    '🚗': s('<path d="M5 17H3v-4l2.5-5h11L19 13v4h-2"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/><path d="M5 13h14"/>'),
    '🏫': s('<path d="M2 20h20M4 20V9l8-5 8 5v11"/><rect x="9" y="14" width="6" height="6"/>'),
    '🎓': s('<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5"/>'),
    '🔧': s('<path d="M14.7 6.3a4 4 0 0 0 5 5L21 21l-3 1-9-9-1-3 3-1z" /><path d="M14.7 6.3 9 12"/>'),
    '🚪': s('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>'),
    '💬': s('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
    '📌': s('<path d="M9 4h6l-1 6 4 3v2H6v-2l4-3z"/><line x1="12" y1="15" x2="12" y2="21"/>'),
    '📍': s('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
    '👥': s('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    '👤': s('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    '🙋': s('<circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/><line x1="19" y1="3" x2="19" y2="8"/>'),
    '👔': s('<circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/>'),
    '🎥': s('<rect x="2" y="6" width="13" height="12" rx="2"/><path d="M15 10l6-3v10l-6-3z"/>'),
    '📺': s('<rect x="2" y="4" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/>'),
    '📷': s('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'),
    '📱': s('<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>'),
    '🔗': s('<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 1 0-7.07-7.07l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 1 0 7.07 7.07l1.7-1.7"/>'),
    '🪪': s('<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2.2"/><line x1="13" y1="10" x2="18" y2="10"/><line x1="13" y1="14" x2="17" y2="14"/>'),
    '⚙': s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
    '❓': s('<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    '💡': s('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>'),
    '🖼': s('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
    '📂': s('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    '📞': s('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>'),
    '📚': s('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
    '🧭': s('<circle cx="12" cy="12" r="10"/><polygon points="16 8 10 10 8 16 14 14 16 8"/>'),
    '🔑': s('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9"/><path d="M17 6l3 3"/><path d="M15 8l2 2"/>'),
    '🔒': s('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    '🔐': s('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    '🛡': s('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
    '🗑': s('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/>'),
    '🗄': s('<rect x="4" y="3" width="16" height="18" rx="2"/><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><circle cx="12" cy="6" r=".5"/>'),
    '📥': s('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
    '📤': s('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
    '📦': s('<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><line x1="12" y1="13" x2="12" y2="21"/>'),
    '💾': s('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>'),
    '📄': s('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>'),
    '📎': s('<path d="M21 9.5 12 18.5a4.5 4.5 0 0 1-6.4-6.4l8.8-8.8a3 3 0 0 1 4.3 4.3l-8.8 8.8a1.5 1.5 0 0 1-2.1-2.1l7.8-7.8"/>'),
    '🖨': s('<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
    '🎨': s('<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="8" r="1"/><circle cx="16" cy="10" r="1"/><path d="M12 21a3 3 0 0 1 0-6h1a2 2 0 0 0 0-4"/>'),
    '☁': s('<path d="M18 10h-1.3A5 5 0 1 0 7 13H18a4 4 0 0 0 0-8 4 4 0 0 0-.3.05"/>'),
    '📡': s('<path d="M5 12a7 7 0 0 1 7-7"/><path d="M8 12a4 4 0 0 1 4-4"/><circle cx="11" cy="12" r="1.5" fill="currentColor" stroke="none"/><path d="M12 13l4 8M12 13l-4 8"/>'),
    '🙏': s('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/>'),
    '💰': s('<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><circle cx="12" cy="15" r="2"/>'),
    '➕': s('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
    '🔔': s('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
    '📅': s('<rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
    '🗓': s('<rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
    '📊': s('<line x1="3" y1="20" x2="21" y2="20"/><rect x="5" y="10" width="3" height="8"/><rect x="10.5" y="5" width="3" height="13"/><rect x="16" y="13" width="3" height="5"/>'),
    '📈': s('<polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/>'),
    '👀': s('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/>'),
    '👁': s('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/>'),
    '🤖': s('<rect x="4" y="8" width="16" height="11" rx="2"/><path d="M12 8V4.5"/><circle cx="12" cy="3.2" r="1.2"/><circle cx="9" cy="13" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="13" r="1" fill="currentColor" stroke="none"/><line x1="9.5" y1="16" x2="14.5" y2="16"/>'),
    '✨': s('<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M19 15l.7 1.8L21.5 17l-1.8.7L19 19l-.7-1.3-1.8-.7 1.8-.7z"/>'),
    '⚡': s('<polygon points="13 2 3 14 10 14 9 22 21 10 13 10 13 2"/>'),
    '🎯': s('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>'),
    '🕐': s('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>'),
    '⏰': s('<circle cx="12" cy="13" r="8"/><polyline points="12 9 12 13 15 15"/><path d="M5 3 2 6M22 6l-3-3"/>'),
    '🔄': s('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>'),
    '🔁': s('<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'),
    '🎉': s('<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/>'),
    '_default': null
  };

  // 앞머리 이모지 1개만 교체할 UI 요소
  var SEL = 'button, .btn, .tab-btn, .view-btn, .ev-ctx-item, .nav-sheet-item, .cal-jump-qbtn, .tw-tbtn, .tw-selbtn, .subtab-btn, .board-filter-btn'
    + ', .admin-nav-btn, .admin-sec-title, .settings-section-title, .mm-label, #tab-settings h3, #tab-admin h3, #tab-admin h4'
    + ', .ctrl-table td:first-child, .hr-subtab-btn, .hr-role-icon, .hr-home-icon, .hr-auth-icon, .hr-done-icon, .hr-section-title, .hr-card-title, .hr-portal-title, .hr-share-title'
    + ', .rt-role-icon, .rt-home-icon, .rt-auth-icon, .rt-complete-icon, .rt-role-title, .rt-card-title, .rt-card-subtitle'
    + ', .section-title, .card-title, .modal-title, legend';
  // 내부 모든 텍스트노드의 앞머리 이모지를 교체(여러 줄 라벨)
  var INLINE_SEL = '.extract-event-meta';

  var EMOJI_RE = /^\s*(\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)\s*/u;

  function svgFor(textVal) {
    var m = textVal.match(EMOJI_RE);
    if (!m) return null;
    var key = m[1].replace(/[️‍]/g, '').trim();
    var svg = EMAP[key];
    if (!svg) return null;   // 매핑 안 된 이모지는 보존
    return svg;
  }
  function replaceLeading(el, node) {
    var svg = svgFor(node.nodeValue);
    if (!svg) return;
    node.nodeValue = node.nodeValue.replace(EMOJI_RE, '');
    var span = document.createElement('span');
    span.className = 'mono-ico';
    span.innerHTML = svg;
    el.insertBefore(span, node);
  }
  function processEl(el) {
    if (el.dataset.monoDone) return;
    el.dataset.monoDone = '1';
    var node = el.firstChild;
    while (node && node.nodeType === 3 && !node.nodeValue.trim()) node = node.nextSibling;
    if (node && node.nodeType === 3) replaceLeading(el, node);
  }
  function processInline(el) {
    if (el.dataset.monoDone) return;
    el.dataset.monoDone = '1';
    Array.prototype.slice.call(el.childNodes).forEach(function (node) {
      if (node.nodeType === 3 && node.nodeValue.trim()) replaceLeading(el, node);
    });
  }
  function scan(root) {
    var r = root || document;
    try { r.querySelectorAll(SEL).forEach(processEl); } catch (e) {}
    try { r.querySelectorAll(INLINE_SEL).forEach(processInline); } catch (e) {}
  }

  var t;
  function start() {
    scan(document);
    if (window.MutationObserver) {
      new MutationObserver(function () { clearTimeout(t); t = setTimeout(function () { scan(document); }, 150); })
        .observe(document.body, { childList: true, subtree: true });
    }
    window.MonoIcons = { scan: function () { scan(document); } };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
