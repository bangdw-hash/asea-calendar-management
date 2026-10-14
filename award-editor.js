'use strict';
/**
 * award-editor.js — 양식 편집기 (AW.Editor)
 *  · 배경(JPG/PNG/PDF) 위에 글상자·일괄입력항목({{이름}})·선·사각형·이미지를 배치/서식/정렬
 *  · 드래그 이동, 8방향 크기 조절, 중앙 가이드, 키보드 이동, 실행 취소/다시 실행, 인라인 글자 편집
 *  변경은 AW.emit('tplchange', kind) 로 알립니다. (kind: elems | page | bg | name)
 */
(function () {
  var AW = window.AW, S = AW.S, E = {};
  AW.Editor = E;
  var K1 = 96 / 25.4;                       // 100% = 1mm 당 3.78px
  var st = { zoom: 0, fit: true, snap: true, hist: [], hi: -1, root: null, stage: null, pg: null, ov: null, drag: null, editing: null, clip: null };

  function T() { return S.tpl; }
  function sel() { return S.sel.map(AW.get).filter(Boolean); }
  function scale() { return st.zoom || K1; }
  function changed(kind, noHist) { if (!noHist) pushHist(); S.dirty = true; if (kind === 'bg') S.bgDirty = true; AW.emit('tplchange', kind); }

  /* ───────────── 실행 취소 ───────────── */
  function snap() { return JSON.stringify({ e: T().elems, p: T().page }); }
  function pushHist() {
    var s = snap(); if (st.hist[st.hi] === s) return;
    st.hist = st.hist.slice(0, st.hi + 1); st.hist.push(s); if (st.hist.length > 80) st.hist.shift(); st.hi = st.hist.length - 1; updUndo();
  }
  E.resetHist = function () { st.hist = []; st.hi = -1; pushHist(); };
  function undo(dir) {
    var i = st.hi + dir; if (i < 0 || i >= st.hist.length) return;
    st.hi = i; var o = JSON.parse(st.hist[i]); T().elems = o.e; T().page = o.p;
    S.sel = S.sel.filter(function (id) { return AW.get(id); }); S.dirty = true; E.render(); AW.emit('tplchange', 'page'); updUndo();
  }
  function updUndo() { var u = AW.$('[data-a="undo"]', st.root), r = AW.$('[data-a="redo"]', st.root); if (u) u.disabled = st.hi <= 0; if (r) r.disabled = st.hi >= st.hist.length - 1; }

  /* ───────────── 마운트 ───────────── */
  var BTN = function (a, ic, tip, extra) { return '<button class="tb" data-a="' + a + '" title="' + tip + '" aria-label="' + tip + '"' + (extra || '') + '>' + AW.ic(ic, 17) + '</button>'; };
  E.mount = function (root) {
    st.root = root;
    root.innerHTML =
      '<div class="ed-tools">' +
        '<div class="tg">' + BTN('add-text', 'text', '글상자 추가') + BTN('add-field', 'field', '일괄 입력 항목 추가 — 엑셀 데이터가 들어갈 자리') + BTN('add-line', 'line', '선 추가') + BTN('add-rect', 'rect', '사각형 추가') + BTN('add-img', 'image', '이미지(직인·로고) 추가') + '</div>' +
        '<div class="tg">' + BTN('starter', 'wand', '기본 상장 배치 넣기') + BTN('page', 'page', '용지·배경 설정(JPG/PDF 올리기)') + '</div>' +
        '<div class="tg">' + BTN('undo', 'undo', '실행 취소 (Ctrl+Z)') + BTN('redo', 'redo', '다시 실행 (Ctrl+Y)') + '</div>' +
        '<div class="tg">' + BTN('dup', 'copy', '복제 (Ctrl+D)') + BTN('addline', 'plus', '줄 추가 — 선택한 상자 아래에 같은 서식으로 한 줄 더') + BTN('del', 'trash', '삭제 (Delete)') + '</div>' +
        '<div class="tg">' + BTN('zout', 'zoomOut', '축소') + '<button class="tb tb-txt" data-a="zlabel" title="맞춤/100%">맞춤</button>' + BTN('zin', 'zoomIn', '확대') + BTN('zfit', 'fit', '창에 맞춤') + BTN('snap', 'grid', '격자 맞춤(1mm) 켜기/끄기') + '</div>' +
      '</div>' +
      '<div class="ed-tools ed-fmt" data-g="fmt">' +
        '<select class="in sm" data-p="font" title="글꼴">' + AW.FONTS.map(function (f) { return '<option value="' + f[0] + '">' + f[1] + '</option>'; }).join('') + '</select>' +
        '<div class="tg"><button class="tb" data-a="sz-" title="글자 작게">' + AW.ic('minus', 15) + '</button><input class="in sm num" data-p="size" type="number" min="4" max="300" step="1" title="글자 크기(pt)" style="width:54px"><button class="tb" data-a="sz+" title="글자 크게">' + AW.ic('plus', 15) + '</button></div>' +
        '<div class="tg">' + BTN('bold', 'bold', '굵게') + BTN('italic', 'italic', '기울임') + BTN('ul', 'underline', '밑줄') + '<input type="color" class="clr" data-p="color" title="글자색" value="#111111"></div>' +
        '<div class="tg">' + BTN('al-l', 'alL', '왼쪽 정렬') + BTN('al-c', 'alC', '가운데 정렬') + BTN('al-r', 'alR', '오른쪽 정렬') + '</div>' +
        '<div class="tg">' + BTN('v-t', 'vT', '위쪽 맞춤') + BTN('v-m', 'vM', '세로 가운데') + BTN('v-b', 'vB', '아래쪽 맞춤') + '</div>' +
        '<label class="mini" title="줄 간격(배)">행간<input class="in sm num" data-p="lh" type="number" min="0.8" max="4" step="0.1" style="width:56px"></label>' +
        '<label class="mini" title="글자 간격(pt)">자간<input class="in sm num" data-p="ls" type="number" min="-5" max="60" step="0.5" style="width:56px"></label>' +
        '<label class="mini chk" title="긴 이름이 상자 안에 한 줄로 들어가도록 글자 크기를 자동으로 줄입니다"><input type="checkbox" data-p="fit"> 글자 자동 맞춤</label>' +
      '</div>' +
      '<div class="ed-tools ed-arr">' +
        '<div class="tg" title="선택이 1개면 용지 기준, 2개 이상이면 선택 영역 기준으로 정렬합니다">' + BTN('ag-l', 'gL', '왼쪽 맞춤') + BTN('ag-ch', 'gCH', '가로 가운데') + BTN('ag-r', 'gR', '오른쪽 맞춤') + BTN('ag-t', 'gT', '위 맞춤') + BTN('ag-cv', 'gCV', '세로 가운데') + BTN('ag-b', 'gB', '아래 맞춤') + '</div>' +
        '<div class="tg">' + BTN('dist-h', 'dH', '가로 간격 같게(3개 이상)') + BTN('dist-v', 'dV', '세로 간격 같게(3개 이상)') + BTN('front', 'front', '맨 앞으로') + BTN('back', 'back', '맨 뒤로') + BTN('lock', 'lock', '잠금/해제') + '</div>' +
        '<div class="tg pos">' + ['x:X', 'y:Y', 'w:가로', 'h:세로'].map(function (s) { var p = s.split(':'); return '<label class="mini">' + p[1] + '<input class="in sm num" data-g2="' + p[0] + '" type="number" step="0.5" style="width:62px"></label>'; }).join('') + '<span class="mini">mm</span></div>' +
      '</div>' +
      '<div class="ed-stage" tabindex="0" aria-label="양식 편집 영역"><div class="ed-wrap"></div><div class="ed-hint"></div></div>' +
      '<div class="ed-text"><div class="muted"><b>선택한 글상자 내용</b> — <code>{{항목명}}</code>을 쓰면 엑셀 데이터가 들어갑니다. 상자를 더블클릭하면 화면에서 바로 입력할 수 있습니다.</div><textarea class="in" data-p="text" rows="2" disabled placeholder="글상자를 선택하면 여기에서도 내용을 고칠 수 있습니다."></textarea></div>' +
      '<input type="file" class="hide" data-f="img" accept="image/*">';
    st.stage = AW.$('.ed-stage', root);
    bind();
    if (window.ResizeObserver) new ResizeObserver(AW.debounce(function () { E.relayout(); }, 80)).observe(st.stage);
  };

  function bind() {
    var root = st.root;
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b || b.disabled) return; act(b.dataset.a);
    });
    root.addEventListener('input', function (e) {
      var p = e.target.dataset.p, g = e.target.dataset.g2;
      if (p) setProp(p, e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value, true);
      if (g) { var v = parseFloat(e.target.value); if (!isNaN(v)) { sel().forEach(function (el) { el[g] = AW.round(g === 'w' || g === 'h' ? Math.max(0, v) : v, 2); }); liveUpdate(); } }
    });
    root.addEventListener('change', function (e) { if (e.target.dataset.p || e.target.dataset.g2) { commitLive(); } if (e.target.dataset.f === 'img') pickImg(e.target); });
    st.stage.addEventListener('pointerdown', onDown);
    st.stage.addEventListener('dblclick', onDbl);
    st.stage.addEventListener('dragover', function (e) { e.preventDefault(); });
    st.stage.addEventListener('drop', function (e) { e.preventDefault(); var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) E.loadBackgroundFile(f); });
    if (!st.docBound) { st.docBound = true; document.addEventListener('keydown', onKey); document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp); }
  }

  /* ───────────── 렌더 ───────────── */
  function fitScale() {
    var w = st.stage.clientWidth - 28, h = st.stage.clientHeight - 28, pg = T().page;
    if (w < 50 || h < 50) return K1 * 0.5;
    return Math.max(0.6, Math.min(w / pg.w, h / pg.h));
  }
  E.render = function () {
    if (!T() || !st.stage) return;
    var wrap = AW.$('.ed-wrap', st.stage);
    st.zoom = st.fit ? fitScale() : st.zoom || K1;
    wrap.innerHTML = '';
    var pg = AW.renderPage(T(), { scale: st.zoom, mode: 'edit' });
    pg.classList.add('ed-pg'); wrap.appendChild(pg); st.pg = pg;
    var ov = document.createElement('div'); ov.className = 'ed-ov'; pg.appendChild(ov); st.ov = ov;
    AW.$$('.el[data-fit="1"]', pg).forEach(function (d) { d.dataset.fit = ''; });   // 편집 중에는 자동 맞춤 미적용(원본 크기 그대로 확인)
    markSel(); updTools();
    var zl = AW.$('[data-a="zlabel"]', st.root); if (zl) zl.textContent = st.fit ? '맞춤' : Math.round(st.zoom / K1 * 100) + '%';
    var sn = AW.$('[data-a="snap"]', st.root); if (sn) sn.classList.toggle('on', st.snap);
    updHint();
  };
  function updHint() {
    var hint = AW.$('.ed-hint', st.stage);
    hint.textContent = (T().elems.length || T().bg) ? '' : '배경(JPG·PNG·PDF)을 올리거나, 위의 도구로 글상자를 추가해 주십시오. 파일을 이 영역에 끌어다 놓아도 됩니다.';
  }
  E.refreshElems = function () {            // 요소 레이어만 다시 그림 (배경 이미지 재생성 방지)
    if (!st.pg) return E.render();
    AW.$$('.el', st.pg).forEach(function (n) { n.remove(); });
    T().elems.forEach(function (e) { var d = AW.renderElem(e, st.zoom, { mode: 'edit' }); d.dataset.fit = ''; st.pg.insertBefore(d, st.ov); });
    markSel(); updTools(); updHint();
  };
  function markSel() {
    if (!st.ov) return;
    st.ov.innerHTML = '';
    var list = sel(), single = list.length === 1;
    list.forEach(function (e) {
      var b = document.createElement('div'); b.className = 'sb' + (e.lock ? ' lk' : ''); b.dataset.id = e.id;
      placeBox(b, e);
      if (single && !e.lock) {
        (e.t === 'line' ? ['w', 'e'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']).forEach(function (h) { var hd = document.createElement('i'); hd.className = 'hd hd-' + h; hd.dataset.h = h; b.appendChild(hd); });
      }
      st.ov.appendChild(b);
    });
  }
  function placeBox(b, e) { var k = st.zoom; b.style.cssText = 'left:' + (e.x * k) + 'px;top:' + (e.y * k - (e.t === 'line' ? 4 : 0)) + 'px;width:' + (e.w * k) + 'px;height:' + (e.t === 'line' ? 8 : Math.max(e.h, 0.5) * k) + 'px'; }
  function domOf(e) { return AW.$('.el[data-id="' + e.id + '"]', st.pg); }
  function placeEl(e) { var d = domOf(e); if (!d) return; var k = st.zoom; d.style.left = e.x * k + 'px'; d.style.top = e.y * k + 'px'; d.style.width = e.w * k + 'px'; if (e.t !== 'line') d.style.height = Math.max(e.h, 1) * k + 'px'; }
  function liveUpdate() { sel().forEach(function (e) { placeEl(e); var b = AW.$('.sb[data-id="' + e.id + '"]', st.ov); if (b) placeBox(b, e); }); updPos(); }
  function commitLive() { changed('elems'); }

  function updPos() {
    var list = sel(), one = list.length === 1 ? list[0] : null;
    ['x', 'y', 'w', 'h'].forEach(function (g) { var i = AW.$('[data-g2="' + g + '"]', st.root); if (i && document.activeElement !== i) i.value = one ? AW.round(one[g], 2) : ''; if (i) i.disabled = !one; });
  }
  function updTools() {
    var list = sel(), tx = list.filter(function (e) { return e.t === 'text'; }), one = tx[0];
    var fmt = AW.$('.ed-fmt', st.root); fmt.classList.toggle('off', !tx.length);
    AW.$$('[data-p]', fmt).forEach(function (i) { i.disabled = !tx.length; });
    AW.$$('button', fmt).forEach(function (b) { b.disabled = !tx.length; });
    if (one) {
      var f = function (p) { return AW.$('[data-p="' + p + '"]', st.root); };
      f('font').value = one.font; f('size').value = one.size; f('lh').value = one.lh; f('ls').value = one.ls || 0; f('color').value = /^#[0-9a-f]{6}$/i.test(one.color) ? one.color : '#111111'; f('fit').checked = !!one.fit;
      [['bold', one.bold], ['italic', one.italic], ['ul', one.ul], ['al-l', one.align === 'left'], ['al-c', one.align === 'center'], ['al-r', one.align === 'right'], ['v-t', one.valign === 'top'], ['v-m', one.valign === 'middle'], ['v-b', one.valign === 'bottom']].forEach(function (p) {
        var b = AW.$('[data-a="' + p[0] + '"]', fmt); if (b) b.classList.toggle('on', !!p[1]);
      });
    }
    var box = AW.$('.ed-text', st.root), ta = AW.$('[data-p="text"]', st.root);
    var one1 = list.length === 1 && list[0].t === 'text';
    ta.disabled = !one1;
    if (document.activeElement !== ta) ta.value = one1 ? list[0].text : '';
    var lk = AW.$('[data-a="lock"]', st.root); if (lk) { var all = list.length && list.every(function (e) { return e.lock; }); lk.classList.toggle('on', !!all); lk.innerHTML = AW.ic(all ? 'lock' : 'unlock', 17); }
    updPos(); updUndo();
  }
  E.setSel = function (ids, noRender) { S.sel = ids; markSel(); updTools(); AW.emit('selchange'); };

  /* ───────────── 속성 변경 ───────────── */
  function setProp(p, v, live) {
    var tx = sel().filter(function (e) { return e.t === 'text'; });
    if (!tx.length) return;
    if (typeof v === 'number' && isNaN(v)) return;
    tx.forEach(function (e) {
      if (p === 'size') v = Math.max(4, Math.min(300, v));
      e[p] = v;
    });
    if (p === 'text' || p === 'fit') { E.refreshElems(); } else E.refreshElems();
    if (live) { S.dirty = true; AW.emit('tplchange', 'elems'); debHist(); } else changed('elems');
  }
  var debHist = AW.debounce(function () { pushHist(); }, 500);

  /* ───────────── 동작 ───────────── */
  function act(a) {
    var list = sel(), tx = list.filter(function (e) { return e.t === 'text'; });
    var T1 = function (p, v) { setProp(p, v); };
    switch (a) {
      case 'add-text': return add(AW.elem('text', { text: '텍스트를 입력하세요' }));
      case 'add-field': return fieldDialog();
      case 'add-line': return add(AW.elem('line', { w: T().page.w * 0.5, x: T().page.w * 0.25 }));
      case 'add-rect': return add(AW.elem('rect'));
      case 'add-img': return AW.$('[data-f="img"]', st.root).click();
      case 'starter': return starter();
      case 'page': return E.pageDialog();
      case 'undo': return undo(-1);
      case 'redo': return undo(1);
      case 'dup': return dup();
      case 'addline': return addLine();
      case 'del': return del();
      case 'zin': st.fit = false; st.zoom = Math.min(K1 * 3, scale() * 1.2); return E.render();
      case 'zout': st.fit = false; st.zoom = Math.max(1, scale() / 1.2); return E.render();
      case 'zfit': st.fit = true; return E.render();
      case 'zlabel': if (st.fit) { st.fit = false; st.zoom = K1; } else st.fit = true; return E.render();
      case 'snap': st.snap = !st.snap; return AW.$('[data-a="snap"]', st.root).classList.toggle('on', st.snap);
      case 'sz-': return tx.length && T1('size', (tx[0].size || 16) - 1);
      case 'sz+': return tx.length && T1('size', (tx[0].size || 16) + 1);
      case 'bold': return tx.length && T1('bold', !tx[0].bold);
      case 'italic': return tx.length && T1('italic', !tx[0].italic);
      case 'ul': return tx.length && T1('ul', !tx[0].ul);
      case 'al-l': return T1('align', 'left'); case 'al-c': return T1('align', 'center'); case 'al-r': return T1('align', 'right');
      case 'v-t': return T1('valign', 'top'); case 'v-m': return T1('valign', 'middle'); case 'v-b': return T1('valign', 'bottom');
      case 'front': return order(true); case 'back': return order(false);
      case 'lock': var all = list.length && list.every(function (e) { return e.lock; }); list.forEach(function (e) { e.lock = !all; }); markSel(); updTools(); return changed('elems');
      case 'dist-h': return dist('x', 'w'); case 'dist-v': return dist('y', 'h');
    }
    if (a.indexOf('ag-') === 0) return align(a.slice(3));
  }
  function add(e, keepSel) {
    T().elems.push(e); E.refreshElems(); E.setSel([e.id]); changed('elems'); return e;
  }
  function del() {
    if (!S.sel.length) return;
    T().elems = T().elems.filter(function (e) { return S.sel.indexOf(e.id) < 0; }); S.sel = []; E.refreshElems(); AW.emit('selchange'); changed('elems');
  }
  function dup() {
    var list = sel(); if (!list.length) return;
    var ids = list.map(function (e) { var c = AW.clone(e); c.id = AW.uid(); c.x = AW.round(c.x + 4, 2); c.y = AW.round(c.y + 4, 2); c.lock = false; T().elems.push(c); return c.id; });
    E.refreshElems(); E.setSel(ids); changed('elems');
  }
  function addLine() {                       // 줄 추가: 선택한 글상자 아래에 같은 서식·크기의 상자를 한 줄 더
    var e = sel().filter(function (x) { return x.t === 'text'; })[0];
    if (!e) return AW.toast('줄을 추가할 글상자를 먼저 선택해 주십시오.');
    var c = AW.clone(e); c.id = AW.uid(); c.y = AW.round(e.y + e.h, 2); c.text = '새 줄'; c.lock = false;
    if (c.y + c.h > T().page.h) c.y = AW.round(Math.max(0, T().page.h - c.h), 2);
    T().elems.push(c); E.refreshElems(); E.setSel([c.id]); changed('elems');
  }
  function order(front) {
    var ids = S.sel.slice(), a = T().elems.filter(function (e) { return ids.indexOf(e.id) < 0; }), b = T().elems.filter(function (e) { return ids.indexOf(e.id) >= 0; });
    T().elems = front ? a.concat(b) : b.concat(a); E.refreshElems(); changed('elems');
  }
  function align(how) {
    var list = sel().filter(function (e) { return !e.lock; }); if (!list.length) return;
    var b = list.length === 1 ? { x: 0, y: 0, w: T().page.w, h: T().page.h } : bounds(list);
    list.forEach(function (e) {
      if (how === 'l') e.x = b.x; if (how === 'r') e.x = b.x + b.w - e.w; if (how === 'ch') e.x = b.x + (b.w - e.w) / 2;
      if (how === 't') e.y = b.y; if (how === 'b') e.y = b.y + b.h - e.h; if (how === 'cv') e.y = b.y + (b.h - e.h) / 2;
      e.x = AW.round(e.x, 2); e.y = AW.round(e.y, 2);
    });
    E.refreshElems(); changed('elems');
  }
  function bounds(list) {
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    list.forEach(function (e) { x1 = Math.min(x1, e.x); y1 = Math.min(y1, e.y); x2 = Math.max(x2, e.x + e.w); y2 = Math.max(y2, e.y + e.h); });
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function dist(pos, size) {
    var list = sel().filter(function (e) { return !e.lock; }).sort(function (a, b) { return a[pos] - b[pos]; });
    if (list.length < 3) return AW.toast('간격을 맞추려면 3개 이상 선택해 주십시오.');
    var first = list[0], last = list[list.length - 1], total = (last[pos] + last[size]) - first[pos], used = 0;
    list.forEach(function (e) { used += e[size]; });
    var gap = (total - used) / (list.length - 1), cur = first[pos];
    list.forEach(function (e) { e[pos] = AW.round(cur, 2); cur += e[size] + gap; });
    E.refreshElems(); changed('elems');
  }

  /* ───────────── 입력 항목 추가 ───────────── */
  var PRESET = ['번호', '성명', '소속', '상명', '내용', '수여일', '수여자', '학번', '기간'];
  function fieldDialog() {
    var one = sel().filter(function (e) { return e.t === 'text'; })[0];
    var existing = AW.fieldNames();
    var m = AW.modal({
      title: '일괄 입력 항목 추가',
      body: '<p class="muted" style="margin-top:0">엑셀의 열 하나가 되는 항목입니다. 글상자 안의 <b>{{항목명}}</b> 자리에 각 행의 값이 들어가 장마다 달라집니다. 같은 항목명을 여러 곳에 쓰면 모두 같은 값이 들어갑니다.</p>' +
        '<label class="f">항목명</label><input class="in" id="fd-name" maxlength="30" placeholder="예: 성명">' +
        '<div class="chips">' + PRESET.map(function (p) { return '<button type="button" class="chip' + (existing.indexOf(p) >= 0 ? ' used' : '') + '" data-n="' + p + '">' + p + '</button>'; }).join('') + '</div>' +
        '<p class="muted" style="margin-bottom:0">내장 항목: <code>{{@번호}}</code> 일련번호 · <code>{{@오늘}}</code> 출력일 — 엑셀 열이 필요 없습니다.</p>',
      actions: [{ label: '취소', cls: 'btn-ghost' }].concat(one ? [{ label: '선택한 상자에 삽입', cls: 'btn-secondary', onClick: function (c) { go(c, true); } }] : []).concat([{ label: '새 상자로 추가', cls: 'btn-primary', onClick: function (c) { go(c, false); } }]),
      onOpen: function (el) {
        var inp = AW.$('#fd-name', el);
        AW.$$('.chip', el).forEach(function (b) { b.onclick = function () { inp.value = b.dataset.n; inp.focus(); }; });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var c = AW.$('.btn-primary', el); c && c.click(); } });
      }
    });
    function go(close, into) {
      var n = AW.$('#fd-name', m.el).value.replace(/[{}]/g, '').trim();
      if (!n) { AW.toast('항목명을 입력해 주십시오.', 'error'); return; }
      close();
      var tk = '{{' + n + '}}';
      if (into && one) { one.text = (!one.text || one.text === '텍스트' || one.text === '텍스트를 입력하세요') ? tk : one.text + tk; E.refreshElems(); changed('elems'); }
      else add(AW.elem('text', { text: tk, size: 22, w: Math.min(120, T().page.w * 0.5), x: AW.round((T().page.w - Math.min(120, T().page.w * 0.5)) / 2, 1), y: AW.round(T().page.h * 0.4, 1), h: 14 }));
    }
  }
  function starter() {
    var go = function () {
      var p = T().page, W = p.w, H = p.h, mk = function (o) { return AW.elem('text', o); };
      var L = [
        mk({ text: '제 {{번호}} 호', x: W * 0.08, y: H * 0.07, w: W * 0.3, h: H * 0.06, size: 14, align: 'left' }),
        mk({ text: '상  장', x: W * 0.25, y: H * 0.14, w: W * 0.5, h: H * 0.13, size: 44, bold: true, ls: 14 }),
        mk({ text: '소  속 : {{소속}}', x: W * 0.26, y: H * 0.31, w: W * 0.5, h: H * 0.06, size: 20, align: 'left' }),
        mk({ text: '성  명 : {{성명}}', x: W * 0.26, y: H * 0.375, w: W * 0.5, h: H * 0.07, size: 26, bold: true, align: 'left', fit: true }),
        mk({ text: '{{상명}}', x: W * 0.2, y: H * 0.46, w: W * 0.6, h: H * 0.08, size: 28, bold: true, fit: true }),
        mk({ text: '{{내용}}', x: W * 0.15, y: H * 0.55, w: W * 0.7, h: H * 0.2, size: 20, lh: 1.9 }),
        mk({ text: '{{수여일}}', x: W * 0.25, y: H * 0.77, w: W * 0.5, h: H * 0.06, size: 20 }),
        mk({ text: '{{수여자}}', x: W * 0.2, y: H * 0.85, w: W * 0.6, h: H * 0.09, size: 30, bold: true, ls: 2 })
      ];
      L.forEach(function (e) { ['x', 'y', 'w', 'h'].forEach(function (k) { e[k] = AW.round(e[k], 1); }); T().elems.push(e); });
      E.refreshElems(); E.setSel([]); changed('elems');
      AW.toast('기본 상장 배치를 넣었습니다. 배경 양식에 맞게 위치를 옮겨 주십시오.', 'ok');
    };
    if (T().elems.length) AW.confirm('기본 배치 추가', '현재 양식에 기본 상장 배치(8개 상자)를 추가합니다. 계속하시겠습니까?', '추가').then(function (ok) { if (ok) go(); }); else go();
  }
  function pickImg(inp) {
    var f = inp.files[0]; inp.value = ''; if (!f) return;
    readImage(f, 700, 'image/png').then(function (r) {
      var w = 28, h = AW.round(w * r.h / r.w, 1);
      add(AW.elem('img', { src: r.url, w: w, h: h, x: AW.round(T().page.w * 0.65, 1), y: AW.round(T().page.h * 0.8, 1) }));
    }).catch(function () { AW.toast('이미지를 읽지 못했습니다.', 'error'); });
  }

  /* ───────────── 포인터 ───────────── */
  function toMM(ev) { var r = st.pg.getBoundingClientRect(); return { x: (ev.clientX - r.left) / st.zoom, y: (ev.clientY - r.top) / st.zoom }; }
  function onDown(ev) {
    if (!st.pg || ev.button > 0) return;
    if (st.editing) { if (ev.target.closest('.el') && ev.target.closest('.el').dataset.id === st.editing.id) return; endEdit(); }
    var hd = ev.target.closest('.hd'), elNode = ev.target.closest('.el');
    if (hd) {
      var e0 = sel()[0]; if (!e0) return;
      st.drag = { mode: 'rs', h: hd.dataset.h, start: toMM(ev), o: { x: e0.x, y: e0.y, w: e0.w, h: e0.h }, e: e0 }; ev.preventDefault(); return;
    }
    if (elNode) {
      var id = elNode.dataset.id;
      if (ev.shiftKey || ev.ctrlKey || ev.metaKey) { var s = S.sel.slice(), i = s.indexOf(id); if (i >= 0) s.splice(i, 1); else s.push(id); E.setSel(s); }
      else if (S.sel.indexOf(id) < 0) E.setSel([id]);
      var list = sel().filter(function (e) { return !e.lock; });
      if (list.length) st.drag = { mode: 'mv', start: toMM(ev), list: list.map(function (e) { return { e: e, x: e.x, y: e.y }; }), moved: false };
      ev.preventDefault(); st.stage.focus({ preventScroll: true });
    } else if (ev.target.closest('.ed-pg')) {
      E.setSel([]); st.stage.focus({ preventScroll: true });
    }
  }
  function onMove(ev) {
    var d = st.drag; if (!d) return;
    var p = toMM(ev), dx = p.x - d.start.x, dy = p.y - d.start.y, sn = st.snap && !ev.altKey, pg = T().page;
    function sp(v) { return AW.round(sn ? Math.round(v) : v, 2); }
    if (d.mode === 'mv') {
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 0.4) return; d.moved = true;
      d.list.forEach(function (it) { it.e.x = sp(it.x + dx); it.e.y = sp(it.y + dy); });
      showGuides(d.list.length === 1 ? d.list[0].e : null);
      liveUpdate();
    } else {
      var e = d.e, o = d.o, h = d.h, x = o.x, y = o.y, w = o.w, hh = o.h;
      if (h.indexOf('e') >= 0) w = o.w + dx; if (h.indexOf('s') >= 0) hh = o.h + dy;
      if (h.indexOf('w') >= 0) { x = o.x + dx; w = o.w - dx; } if (h.indexOf('n') >= 0) { y = o.y + dy; hh = o.h - dy; }
      if (w < 1) { if (h.indexOf('w') >= 0) x = o.x + o.w - 1; w = 1; } if (hh < 1 && e.t !== 'line') { if (h.indexOf('n') >= 0) y = o.y + o.h - 1; hh = 1; }
      e.x = sp(x); e.y = sp(y); e.w = Math.max(1, sp(w)); if (e.t !== 'line') e.h = Math.max(1, sp(hh));
      liveUpdate();
    }
  }
  function showGuides(e) {
    AW.$$('.snapg', st.ov).forEach(function (g) { g.remove(); });
    if (!e) return; var pg = T().page, k = st.zoom;
    if (Math.abs((e.x + e.w / 2) - pg.w / 2) < 0.6) { e.x = AW.round((pg.w - e.w) / 2, 2); var g = document.createElement('div'); g.className = 'snapg gv'; g.style.left = (pg.w / 2 * k) + 'px'; st.ov.appendChild(g); }
    if (Math.abs((e.y + e.h / 2) - pg.h / 2) < 0.6) { e.y = AW.round((pg.h - e.h) / 2, 2); var g2 = document.createElement('div'); g2.className = 'snapg gh'; g2.style.top = (pg.h / 2 * k) + 'px'; st.ov.appendChild(g2); }
  }
  function onUp() {
    var d = st.drag; if (!d) return; st.drag = null;
    AW.$$('.snapg', st.ov || document).forEach(function (g) { g.remove(); });
    if (d.mode === 'rs' || d.moved) { E.refreshElems(); changed('elems'); }
    if (st.pending) { st.pending = false; E.relayout(); }
  }

  /* ───────────── 인라인 편집 ───────────── */
  function onDbl(ev) {
    var n = ev.target.closest('.el-text'); if (!n) return;
    var e = AW.get(n.dataset.id); if (!e || e.lock) return;
    E.setSel([e.id]); beginEdit(e, n);
  }
  function beginEdit(e, node) {
    var b = node.firstChild; b.textContent = e.text; b.style.outline = '2px solid #0EA5E9'; b.style.cursor = 'text'; b.style.background = 'rgba(255,255,255,.85)';
    try { b.contentEditable = 'plaintext-only'; } catch (x) {} if (b.contentEditable !== 'plaintext-only') b.contentEditable = 'true';
    st.editing = { id: e.id, node: b };
    b.addEventListener('blur', function () { if (st.editing && st.editing.node === b) endEdit(); }, { once: true });
    b.focus();
    var r = document.createRange(); r.selectNodeContents(b); r.collapse(false); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    b.addEventListener('keydown', function kd(k) { if (k.key === 'Escape') { b.removeEventListener('keydown', kd); endEdit(); } k.stopPropagation(); });
  }
  function endEdit() {
    var ed = st.editing; if (!ed) return; st.editing = null;
    var e = AW.get(ed.id); if (e) { var t = ed.node.innerText.replace(/ /g, ' ').replace(/\n$/, ''); if (t !== e.text) { e.text = t; changed('elems'); } }
    E.refreshElems();
    if (st.pending) { st.pending = false; E.relayout(); }
  }

  /* ───────────── 키보드 ───────────── */
  function onKey(ev) {
    if (!st.root || !st.root.offsetParent) return;
    var tg = ev.target, typing = tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable);
    var mod = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase();
    if (mod && k === 's') { ev.preventDefault(); AW.emit('savenow'); return; }
    if (typing) return;
    if (mod && k === 'z') { ev.preventDefault(); return undo(ev.shiftKey ? 1 : -1); }
    if (mod && k === 'y') { ev.preventDefault(); return undo(1); }
    if (mod && k === 'd') { ev.preventDefault(); return dup(); }
    if (mod && k === 'a' && st.stage.contains(document.activeElement)) { ev.preventDefault(); return E.setSel(T().elems.map(function (e) { return e.id; })); }
    if (mod && k === 'c') { st.clip = sel().map(AW.clone); return; }
    if (mod && k === 'v' && st.clip && st.clip.length) {
      ev.preventDefault(); var ids = st.clip.map(function (c) { var n = AW.clone(c); n.id = AW.uid(); n.x = AW.round(n.x + 5, 2); n.y = AW.round(n.y + 5, 2); T().elems.push(n); return n.id; });
      E.refreshElems(); E.setSel(ids); return changed('elems');
    }
    if (!S.sel.length) return;
    if (k === 'delete' || k === 'backspace') { ev.preventDefault(); return del(); }
    if (k === 'escape') return E.setSel([]);
    var step = ev.shiftKey ? 5 : 0.5, dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0, dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
    if (dx || dy) { ev.preventDefault(); sel().forEach(function (e) { if (!e.lock) { e.x = AW.round(e.x + dx, 2); e.y = AW.round(e.y + dy, 2); } }); liveUpdate(); debCommit(); }
    if (k === 'enter' && sel().length === 1 && sel()[0].t === 'text') { ev.preventDefault(); var d = domOf(sel()[0]); if (d) beginEdit(sel()[0], d); }
  }
  var debCommit = AW.debounce(function () { changed('elems'); }, 400);

  /* ───────────── 용지·배경 ───────────── */
  function readImage(file, max, mime) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var r = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * r); c.height = Math.round(im.naturalHeight * r);
        var g = c.getContext('2d'); if (mime === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
        g.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        res({ url: c.toDataURL(mime, 0.9), w: c.width, h: c.height });
      };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('image')); }; im.src = u;
    });
  }
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(window.pdfjsLib); };
      s.onerror = function () { rej(new Error('PDF 처리 모듈을 불러오지 못했습니다. 네트워크를 확인하거나 PDF를 JPG로 변환해 올려 주십시오.')); }; document.head.appendChild(s);
    });
  }
  function pdfPage(file) {
    return loadPdfJs().then(function (lib) {
      return file.arrayBuffer().then(function (buf) { return lib.getDocument({ data: buf }).promise; });
    }).then(function (doc) {
      if (doc.numPages === 1) return { doc: doc, n: 1 };
      return new Promise(function (res, rej) {
        var done = false;
        AW.modal({ title: 'PDF 페이지 선택', body: '<p style="margin-top:0">총 ' + doc.numPages + '쪽입니다. 양식으로 사용할 쪽 번호를 입력해 주십시오.</p><input class="in" id="pdf-n" type="number" min="1" max="' + doc.numPages + '" value="1">',
          onClose: function () { if (!done) rej(new Error('cancel')); },
          actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '사용', cls: 'btn-primary', onClick: function (c) { var n = Math.max(1, Math.min(doc.numPages, parseInt(AW.$('#pdf-n').value, 10) || 1)); done = true; c(); res({ doc: doc, n: n }); } }] });
      });
    }).then(function (o) {
      return o.doc.getPage(o.n).then(function (pg) {
        var v1 = pg.getViewport({ scale: 1 }), sc = 2480 / Math.max(v1.width, v1.height), v = pg.getViewport({ scale: sc });
        var c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        return pg.render({ canvasContext: g, viewport: v }).promise.then(function () { return { url: c.toDataURL('image/jpeg', 0.9), w: v1.width * 25.4 / 72, h: v1.height * 25.4 / 72 }; });
      });
    });
  }
  function fitPaper(wmm, hmm) {
    var best = null;
    Object.keys(AW.PAPERS).forEach(function (k) {
      var p = AW.PAPERS[k];
      [[p[0], p[1], 'P'], [p[1], p[0], 'L']].forEach(function (o) { if (Math.abs(o[0] - wmm) < 3 && Math.abs(o[1] - hmm) < 3) best = { w: o[0], h: o[1], paper: k, orient: o[2] }; });
    });
    return best;
  }
  E.loadBackgroundFile = function (file) {
    var isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
    if (!isPdf && !/^image\//.test(file.type)) return AW.toast('JPG·PNG·PDF 파일만 올릴 수 있습니다.', 'error');
    if (file.size > 30 * 1024 * 1024) return AW.toast('파일이 너무 큽니다(30MB 이하).', 'error');
    AW.toast('양식 파일을 처리하는 중입니다…');
    var p = isPdf ? pdfPage(file) : readImage(file, 2480, 'image/jpeg').then(function (r) { return { url: r.url, w: r.w, h: r.h, px: true }; });
    return p.then(function (r) {
      var wmm = r.w, hmm = r.h;
      if (r.px) { var A4r = 297 / 210, ir = Math.max(r.w, r.h) / Math.min(r.w, r.h); if (Math.abs(ir - A4r) / A4r < 0.04) { wmm = r.w >= r.h ? 297 : 210; hmm = r.w >= r.h ? 210 : 297; } else { wmm = r.w >= r.h ? 297 : 297 * r.w / r.h; hmm = r.w >= r.h ? 297 * r.h / r.w : 297; } }
      var fp = fitPaper(wmm, hmm), pg = fp ? { w: fp.w, h: fp.h, paper: fp.paper, orient: fp.orient } : { w: AW.round(wmm, 1), h: AW.round(hmm, 1), paper: 'custom', orient: wmm >= hmm ? 'L' : 'P' };
      T().bg = r.url; T().bgName = file.name; T().page = pg;
      if (!T().name || /^새 상장/.test(T().name)) T().name = file.name.replace(/\.[^.]+$/, '');
      E.render(); changed('bg'); AW.emit('tplchange', 'name');
      AW.toast('양식 배경을 적용했습니다 (' + pg.w + '×' + pg.h + 'mm' + (fp ? ' · ' + fp.paper : '') + ').', 'ok');
    }).catch(function (e) { if (e && e.message !== 'cancel') AW.toast(e.message || '양식 파일을 처리하지 못했습니다.', 'error'); });
  };
  // 배경 이미지를 90도 회전(dir: 1=오른쪽, -1=왼쪽)하고 용지 가로·세로를 맞바꿈
  E.rotateBg = function (dir) {
    if (!T().bg) return Promise.resolve();
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () {
        var c = document.createElement('canvas'), w = im.naturalWidth, h = im.naturalHeight; c.width = h; c.height = w;
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, h, w);
        if (dir > 0) { g.translate(h, 0); g.rotate(Math.PI / 2); } else { g.translate(0, w); g.rotate(-Math.PI / 2); }
        g.drawImage(im, 0, 0);
        var p = T().page; T().bg = c.toDataURL('image/jpeg', 0.9);
        T().page = { w: p.h, h: p.w, paper: p.paper, orient: p.h >= p.w ? 'L' : 'P' };
        E.render(); changed('bg'); res();
      };
      im.src = T().bg;
    });
  };
  E.pageDialog = function () {
    var p = T().page;
    var m = AW.modal({
      title: '용지·배경 설정',
      body: '<div class="drop" id="pd-drop"><div>' + AW.ic('upload', 28) + '</div><b>양식 파일(JPG·PNG·PDF) 올리기</b><div class="muted">끌어다 놓거나 눌러서 선택합니다. 올린 파일이 배경이 되고 용지 크기·방향이 자동으로 맞춰집니다.' + (T().bgName ? '<br>현재 배경: ' + AW.esc(T().bgName) : '') + '</div><input type="file" id="pd-file" class="hide" accept="image/*,application/pdf"></div>' +
        (T().bg ? '<div style="display:flex;gap:6px;margin-bottom:8px"><button class="btn btn-secondary btn-sm" id="pd-rl">' + AW.ic('undo', 16) + ' 배경 왼쪽 90° 회전</button><button class="btn btn-secondary btn-sm" id="pd-rr">' + AW.ic('redo', 16) + ' 배경 오른쪽 90° 회전</button><span class="muted" style="align-self:center">가로·세로가 함께 바뀝니다</span></div>' : '') +
        '<div class="grid2"><div><label class="f">용지</label><select class="in" id="pd-paper">' + Object.keys(AW.PAPERS).map(function (k) { return '<option value="' + k + '"' + (p.paper === k ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '<option value="custom"' + (p.paper === 'custom' ? ' selected' : '') + '>직접 입력</option></select></div>' +
        '<div><label class="f">방향</label><select class="in" id="pd-or"><option value="L"' + (p.w >= p.h ? ' selected' : '') + '>가로</option><option value="P"' + (p.w < p.h ? ' selected' : '') + '>세로</option></select></div>' +
        '<div><label class="f">가로(mm)</label><input class="in num" id="pd-w" type="number" step="0.1" min="50" max="1000" value="' + p.w + '"></div>' +
        '<div><label class="f">세로(mm)</label><input class="in num" id="pd-h" type="number" step="0.1" min="50" max="1000" value="' + p.h + '"></div></div>' +
        '<p class="muted" style="margin-bottom:0">배경과 용지 비율이 다르면 배경이 용지 크기에 맞춰 늘어납니다. 실물 상장용지에 글자만 인쇄할 때는 배경 없이 용지 크기만 맞춰 두고, 출력 화면에서 「배경 제외」를 선택합니다.</p>',
      actions: [].concat(T().bg ? [{ label: '배경 삭제', cls: 'btn-ghost', onClick: function (c) { T().bg = null; T().bgName = ''; c(); E.render(); changed('bg'); AW.emit('tplchange', 'name'); } }] : []).concat([{ label: '닫기', cls: 'btn-primary' }]),
      onOpen: function (el) {
        var dz = AW.$('#pd-drop', el), fi = AW.$('#pd-file', el);
        dz.onclick = function () { fi.click(); };
        fi.onchange = function () { if (fi.files[0]) { E.loadBackgroundFile(fi.files[0]).then(function () { var q = T().page; AW.$('#pd-w', el).value = q.w; AW.$('#pd-h', el).value = q.h; AW.$('#pd-paper', el).value = q.paper; AW.$('#pd-or', el).value = q.w >= q.h ? 'L' : 'P'; }); } };
        dz.ondragover = function (e) { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = function () { dz.classList.remove('over'); };
        dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove('over'); var f = e.dataTransfer.files[0]; if (f) { fi.onchange = null; E.loadBackgroundFile(f); } };
        function apply(from) {
          var pp = AW.$('#pd-paper', el).value, o = AW.$('#pd-or', el).value, w = parseFloat(AW.$('#pd-w', el).value), h = parseFloat(AW.$('#pd-h', el).value);
          if (from !== 'wh' && pp !== 'custom') { var a = AW.PAPERS[pp]; w = o === 'L' ? a[1] : a[0]; h = o === 'L' ? a[0] : a[1]; AW.$('#pd-w', el).value = w; AW.$('#pd-h', el).value = h; }
          if (from === 'wh') { pp = 'custom'; AW.$('#pd-paper', el).value = 'custom'; }
          if (!(w >= 50 && h >= 50)) return;
          T().page = { w: w, h: h, paper: pp, orient: w >= h ? 'L' : 'P' }; E.render(); changed('page');
        }
        function sync() { var q = T().page; AW.$('#pd-w', el).value = q.w; AW.$('#pd-h', el).value = q.h; AW.$('#pd-or', el).value = q.w >= q.h ? 'L' : 'P'; }
        var rl = AW.$('#pd-rl', el), rr = AW.$('#pd-rr', el);
        if (rl) rl.onclick = function () { E.rotateBg(-1).then(sync); }; if (rr) rr.onclick = function () { E.rotateBg(1).then(sync); };
        AW.$('#pd-paper', el).onchange = function () { apply('p'); }; AW.$('#pd-or', el).onchange = function () { apply('o'); };
        AW.$('#pd-w', el).oninput = function () { apply('wh'); }; AW.$('#pd-h', el).oninput = function () { apply('wh'); };
      }
    });
  };

  E.getStage = function () { return st.stage; };
  E.relayout = function () {
    if (!st.fit || !T() || !st.pg) return;
    if (st.editing || st.drag) { st.pending = true; return; }
    if (Math.abs(fitScale() - st.zoom) > 0.02) E.render();
  };
})();
