/* ASEA UI Kit — 동작 모음 (의존성 없음). window.UX 로 노출. ui-kit.css 와 함께 사용.
   toast / undoToast / modal / drawer / confirm / tabs / collapse / accordion / theme / uiscale /
   saveState / debounce / bookmarks / dragSort / copy / busy */
'use strict';
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var UX = { $: $, $$: $$, esc: esc };

  /* 토스트: 2.6초 후 사라짐. 오류는 4.5초 */
  UX.toast = function (msg, kind, ms) {
    var box = $('.ux-toasts') || document.body.appendChild(el('div', 'ux-toasts'));
    box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
    var t = el('div', 'ux-toast' + (kind ? ' ' + kind : ''), esc(msg));
    box.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .2s'; t.style.opacity = 0; setTimeout(function () { t.remove(); }, 220); }, ms || (kind === 'err' ? 4500 : 2600));
    return t;
  };
  /* 되돌리기 토스트: onUndo 를 5초 안에 누르면 호출 */
  UX.undoToast = function (msg, onUndo) {
    var t = UX.toast(msg, '', 5000), b = el('button', '', '되돌리기');
    b.onclick = function () { t.remove(); onUndo && onUndo(); }; t.appendChild(b); return t;
  };

  /* 모달/서랍: ESC·바깥 클릭으로 닫힘, 포커스 이동·복귀 */
  function overlay(inner, right) {
    var prev = document.activeElement, shade = el('div', 'ux-shade' + (right ? ' right' : ''));
    shade.appendChild(inner); document.body.appendChild(shade);
    function close(v) { document.removeEventListener('keydown', key); shade.remove(); prev && prev.focus && prev.focus(); shade._done && shade._done(v); }
    function key(e) { if (e.key === 'Escape') close(null); }
    document.addEventListener('keydown', key);
    shade.addEventListener('mousedown', function (e) { if (e.target === shade) close(null); });
    inner.setAttribute('role', 'dialog'); inner.setAttribute('aria-modal', 'true');
    var f = $('input,textarea,select,button.primary', inner); f && f.focus();
    shade.close = close;
    return shade;
  }
  UX.modal = function (o) {
    var m = el('div', 'ux-modal');
    m.innerHTML = '<div class="ux-pn-h"><h3>' + esc(o.title || '') + '</h3><button class="ux-ibtn" data-x aria-label="닫기"><svg class="ux-ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="ux-pn-b"></div><div class="ux-pn-f"></div>';
    var body = $('.ux-pn-b', m); typeof o.body === 'string' ? body.innerHTML = o.body : body.appendChild(o.body);
    var sh = overlay(m, false);
    $('[data-x]', m).onclick = function () { sh.close(null); };
    (o.buttons || []).forEach(function (b) {
      var x = el('button', 'ux-btn ' + (b.cls || 'secondary'), esc(b.label)); x.onclick = function () { var r = b.onClick ? b.onClick(m) : b.value; if (r !== false) sh.close(r === undefined ? b.value : r); }; $('.ux-pn-f', m).appendChild(x);
    });
    return new Promise(function (res) { sh._done = res; });
  };
  UX.confirm = function (msg, okLabel, danger) {
    return UX.modal({ title: '확인', body: '<p style="margin:0">' + esc(msg) + '</p>', buttons: [{ label: '취소', cls: 'ghost', value: false }, { label: okLabel || '확인', cls: danger ? 'danger' : 'primary', value: true }] });
  };
  UX.drawer = function (o) {
    var d = el('div', 'ux-drawer');
    d.innerHTML = '<div class="ux-pn-h"><h3>' + esc(o.title || '') + '</h3><button class="ux-ibtn" data-x aria-label="닫기"><svg class="ux-ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="ux-pn-b"></div>';
    $('.ux-pn-b', d).innerHTML = o.body || ''; var sh = overlay(d, true); $('[data-x]', d).onclick = function () { sh.close(null); }; return sh;
  };

  /* 탭: [role=tab] 에 .on, 패널 data-panel 로 표시. 선택값은 localStorage(key)에 기억 */
  UX.tabs = function (root, key, onChange) {
    var tabs = $$('.ux-tab', root), saved = key && ls(key);
    function sel(id) {
      tabs.forEach(function (t) { var on = t.dataset.tab === id; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
      $$('[data-panel]', root.parentNode).forEach(function (p) { p.classList.toggle('ux-hide', p.dataset.panel !== id); });
      key && ls(key, id); onChange && onChange(id);
    }
    tabs.forEach(function (t, i) { t.setAttribute('role', 'tab'); t.onclick = function () { sel(t.dataset.tab); };
      t.onkeydown = function (e) { var n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (n) { var x = tabs[(i + n + tabs.length) % tabs.length]; x.focus(); x.click(); } }; });
    sel(saved && tabs.some(function (t) { return t.dataset.tab === saved; }) ? saved : tabs[0].dataset.tab);
  };

  /* 접기/펼치기: .ux-collapse > .head, .body. 상태 저장 */
  UX.collapse = function (root, key) {
    $$('.ux-collapse', root).forEach(function (c, i) {
      var k = key && key + ':' + (c.dataset.id || i), h = $('.head', c);
      if (k && ls(k) === '1') c.classList.add('collapsed');
      h.setAttribute('role', 'button'); h.tabIndex = 0;
      function tg() { c.classList.toggle('collapsed'); k && ls(k, c.classList.contains('collapsed') ? '1' : '0'); h.setAttribute('aria-expanded', !c.classList.contains('collapsed')); }
      h.onclick = tg; h.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tg(); } };
    });
  };
  UX.accordion = function (btn, panel) { btn.onclick = function () { var o = panel.classList.toggle('open'); btn.setAttribute('aria-expanded', o); }; };

  /* 테마(색상 3종) · 다크 · 글자 배율 */
  UX.theme = function (name) { document.documentElement.setAttribute('data-ux-theme', name); $$('.ux-swatch').forEach(function (s) { s.classList.toggle('on', s.dataset.theme === name); }); ls('ux-theme', name); };
  UX.dark = function (on) { document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light'); ls('ux-dark', on ? '1' : '0'); };
  UX.uiscale = function (v) { document.documentElement.style.setProperty('--ux-fs', v); ls('ux-scale', v); };
  UX.restore = function () { var t = ls('ux-theme'); t && UX.theme(t); ls('ux-dark') === '1' && UX.dark(true); var s = ls('ux-scale'); s && UX.uiscale(s); };

  /* 저장 상태 표시 + 디바운스 자동 저장 */
  UX.debounce = function (fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms || 600); }; };
  UX.saveState = function (node) {
    return { saving: function () { node.className = 'ux-savestate saving'; node.textContent = '저장 중'; },
      saved: function () { node.className = 'ux-savestate saved'; node.textContent = '저장됨 ' + new Date().toTimeString().slice(0, 5); },
      fail: function (m) { node.className = 'ux-savestate fail'; node.textContent = m || '저장 실패 — 다시 시도'; } };
  };
  UX.autosave = function (saveFn, node, ms) { var st = UX.saveState(node); var run = UX.debounce(function () { st.saving(); Promise.resolve(saveFn()).then(st.saved, function () { st.fail(); }); }, ms || 1200); run.state = st; return run; };

  /* 즐겨찾기(책갈피) — 항목 id 를 localStorage 에 보관, 버튼 aria-pressed 동기화 */
  UX.bookmarks = function (key) {
    var set = {}; try { set = JSON.parse(ls(key) || '{}'); } catch (e) {}
    function save() { ls(key, JSON.stringify(set)); }
    return { has: function (id) { return !!set[id]; }, toggle: function (id) { if (set[id]) delete set[id]; else set[id] = Date.now(); save(); return !!set[id]; },
      list: function () { return Object.keys(set).sort(function (a, b) { return set[b] - set[a]; }); },
      bind: function (btn, id) { var me = this; btn.setAttribute('aria-pressed', me.has(id)); btn.onclick = function (e) { e.stopPropagation(); var on = me.toggle(id); btn.setAttribute('aria-pressed', on); UX.toast(on ? '즐겨찾기에 추가했습니다' : '즐겨찾기에서 뺐습니다'); }; } };
  };

  /* 끌어서 순서 바꾸기: 위·아래 절반 기준으로 drop-before/after 막대 표시 */
  UX.dragSort = function (list, itemSel, onSort) {
    var drag = null;
    $$(itemSel, list).forEach(function (it) { it.draggable = true; });
    list.addEventListener('dragstart', function (e) { var it = e.target.closest(itemSel); if (!it) return; drag = it; it.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', ''); } catch (x) {} });
    list.addEventListener('dragover', function (e) {
      if (!drag) return; var it = e.target.closest(itemSel); if (!it || it === drag) return; e.preventDefault();
      $$(itemSel, list).forEach(function (n) { n.classList.remove('drop-before', 'drop-after'); });
      var r = it.getBoundingClientRect(); it.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
    });
    list.addEventListener('drop', function (e) {
      if (!drag) return; var it = e.target.closest(itemSel); if (!it) return; e.preventDefault();
      var before = it.classList.contains('drop-before'); it.parentNode.insertBefore(drag, before ? it : it.nextSibling); onSort && onSort($$(itemSel, list));
    });
    list.addEventListener('dragend', function () { if (drag) drag.classList.remove('dragging'); drag = null; $$(itemSel, list).forEach(function (n) { n.classList.remove('drop-before', 'drop-after'); }); });
  };

  /* 복사 · 버튼 처리중 표시 */
  UX.copy = function (text) { return (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { UX.toast('복사했습니다', 'ok'); }, function () { var t = el('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); UX.toast('복사했습니다', 'ok'); } catch (e) { UX.toast('복사에 실패했습니다', 'err'); } t.remove(); }); };
  UX.busy = function (btn, promiseFn) { btn.classList.add('busy'); btn.disabled = true; return Promise.resolve().then(promiseFn).finally(function () { btn.classList.remove('busy'); btn.disabled = false; }); };

  window.UX = UX;
})();
