'use strict';
/**
 * monoicons.js — 관리자·설정 메뉴의 컬러 이모지를 단색 라인 SVG로 일괄 치환
 *
 * - 대상 요소의 "앞머리 이모지"만 SVG(.mono-ico)로 교체, 텍스트/뱃지/활성색은 보존
 * - stroke=currentColor → 글자색 상속(활성 메뉴는 흰색 등 자동 일치)
 * - 동적 렌더(관리자 섹션 전환)도 MutationObserver로 반영
 */
(function () {
  function s(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
  var EMAP = {
    '📋': s('<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/>'),
    '✅': s('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
    '📣': s('<path d="M3 11l15-6v14L3 13z"/><path d="M3 11v2a2 2 0 0 0 2 2h1"/><path d="M8 16v3a1 1 0 0 0 1 1h1"/>'),
    '📢': s('<path d="M3 11l15-6v14L3 13z"/><path d="M3 11v2a2 2 0 0 0 2 2h1"/><path d="M8 16v3a1 1 0 0 0 1 1h1"/>'),
    '✉': s('<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/>'),
    '🔍': s('<circle cx="11" cy="11" r="7"/><path d="m21 21-3.5-3.5"/>'),
    '📝': s('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    '🏢': s('<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>'),
    '🚗': s('<path d="M5 17H3v-4l2.5-5h11L19 13v4h-2"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/><path d="M5 13h14"/>'),
    '🏫': s('<path d="M2 20h20M4 20V9l8-5 8 5v11"/><rect x="9" y="14" width="6" height="6"/>'),
    '🔧': s('<path d="M14.7 6.3a4 4 0 0 0 5 5L21 21l-3 1-9-9-1-3 3-1z" /><path d="M14.7 6.3 9 12"/>'),
    '🚪': s('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>'),
    '💬': s('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
    '📌': s('<path d="M9 4h6l-1 6 4 3v2H6v-2l4-3z"/><line x1="12" y1="15" x2="12" y2="21"/>'),
    '👥': s('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    '🎥': s('<rect x="2" y="6" width="13" height="12" rx="2"/><path d="M15 10l6-3v10l-6-3z"/>'),
    '🔗': s('<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 1 0-7.07-7.07l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 1 0 7.07 7.07l1.7-1.7"/>'),
    '🪪': s('<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2.2"/><line x1="13" y1="10" x2="18" y2="10"/><line x1="13" y1="14" x2="17" y2="14"/>'),
    '⚙': s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
    '❓': s('<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    '🖼': s('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
    '📂': s('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    '📞': s('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>'),
    '📚': s('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
    '🧭': s('<circle cx="12" cy="12" r="10"/><polygon points="16 8 10 10 8 16 14 14 16 8"/>'),
    '🔑': s('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9"/><path d="M17 6l3 3"/><path d="M15 8l2 2"/>'),
    '🗑': s('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/>'),
    '🗄': s('<rect x="4" y="3" width="16" height="18" rx="2"/><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><circle cx="12" cy="6" r=".5"/>'),
    '📥': s('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
    '📤': s('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
    '🎨': s('<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="8" r="1"/><circle cx="16" cy="10" r="1"/><path d="M12 21a3 3 0 0 1 0-6h1a2 2 0 0 0 0-4"/>'),
    '☁': s('<path d="M18 10h-1.3A5 5 0 1 0 7 13H18a4 4 0 0 0 0-8 4 4 0 0 0-.3.05"/>'),
    '🙏': s('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/>'),
    '💰': s('<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><circle cx="12" cy="15" r="2"/>'),
    '➕': s('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
    '🔔': s('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
    '📅': s('<rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
    '📊': s('<line x1="3" y1="20" x2="21" y2="20"/><rect x="5" y="10" width="3" height="8"/><rect x="10.5" y="5" width="3" height="13"/><rect x="16" y="13" width="3" height="5"/>'),
    '_default': s('<circle cx="12" cy="12" r="3"/>')
  };

  var SEL = '.admin-nav-btn, .admin-sec-title, .settings-section-title, .mm-label, #tab-settings h3, #tab-admin h3, #tab-admin h4, .subtab-btn, .bdg-subtab-bar .subtab-btn, .ctrl-table td:first-child, .board-filter-btn';
  var EMOJI_RE = /^\s*(\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)\s*/u;

  function processEl(el) {
    if (el.dataset.monoDone) return;
    var node = el.firstChild;
    while (node && node.nodeType === 3 && !node.nodeValue.trim()) node = node.nextSibling;
    el.dataset.monoDone = '1';
    if (!node || node.nodeType !== 3) return;
    var m = node.nodeValue.match(EMOJI_RE);
    if (!m) return;
    var key = m[1].replace(/[️‍]/g, '').trim();
    var svg = EMAP[key] || EMAP._default;
    node.nodeValue = node.nodeValue.replace(EMOJI_RE, '');
    var span = document.createElement('span');
    span.className = 'mono-ico';
    span.innerHTML = svg;
    el.insertBefore(span, node);
  }
  function scan(root) {
    try { (root || document).querySelectorAll(SEL).forEach(processEl); } catch (e) {}
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
