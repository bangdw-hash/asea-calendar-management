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
  var CFG0 = { ruler: false, gshow: true, grid: 1, snap: true, show: false, guides: true, th: 1.2, nudge: 0.5, big: 5 };
  var st = { cfg: Object.assign({}, CFG0, AW.lsGet('award_ed_cfg', {})), sty: null, zoom: 0, fit: true, hist: [], hi: -1, root: null, stage: null, pg: null, ov: null, drag: null, editing: null, clip: null };

  function T() { return S.tpl; }
  function LG() { return (T().page && T().page.lang) || 'ko'; }
  function tk() { return LG() === 'en' ? 'en' : 'text'; }          // 편집 중인 언어의 글 필드
  function keepPage(np) { return Object.assign({}, T().page, np); }   // 용지 크기를 바꿀 때 언어·번호 규칙·안내선 유지
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
        '<div class="tg">' + BTN('add-text', 'text', '글상자 추가') + BTN('add-field', 'field', '일괄 입력 항목 추가 — 엑셀 데이터가 들어갈 자리') + BTN('add-line', 'line', '선 추가') + BTN('add-rect', 'rect', '사각형 추가') + BTN('add-img', 'image', '이미지(직인·로고) 추가') + BTN('add-qr', 'qr', '위조 방지 인증 QR 추가') + '</div>' +
        '<div class="tg"><button class="tb tb-txt" data-a="lang-ko" title="한글 버전 편집·보기">한글</button><button class="tb tb-txt" data-a="lang-en" title="영문 버전 편집·보기">영문</button><button class="tb tb-txt" data-a="lang-both" title="한글+영문 병기 보기(출력 기본값)">한영</button>' + BTN('langcfg', 'cols', '영문 크기·병기 순서 설정') + '</div>' +
        '<div class="tg">' + BTN('starter', 'wand', '기본 상장 배치 넣기') + BTN('page', 'page', '용지·배경 설정(JPG/PDF 올리기)') + '<button class="tb tb-txt" data-a="orient" title="가로·세로 전환"></button></div>' +
        '<div class="tg">' + BTN('undo', 'undo', '실행 취소 (Ctrl+Z)') + BTN('redo', 'redo', '다시 실행 (Ctrl+Y)') + '</div>' +
        '<div class="tg">' + BTN('dup', 'copy', '복제 (Ctrl+D)') + BTN('addline', 'plus', '줄 추가 — 선택한 상자 아래에 같은 서식으로 한 줄 더') + BTN('del', 'trash', '삭제 (Delete)') + '</div>' +
        '<div class="tg">' + BTN('zout', 'zoomOut', '축소') + '<button class="tb tb-txt" data-a="zlabel" title="맞춤/100%">맞춤</button>' + BTN('zin', 'zoomIn', '확대') + BTN('zfit', 'fit', '창에 맞춤') + BTN('snap', 'grid', '격자 자석 켜기/끄기') + BTN('gridcfg', 'cols', '격자·자석·이동 간격 설정') + BTN('keys', 'info', '편집 단축키·마우스 조합 안내') + '</div>' +
      '</div>' +
      '<div class="ed-tools ed-fmt" data-g="fmt">' +
        '<select class="in sm" data-p="font" title="글꼴 (한글)" style="max-width:170px">' + AW.fontOptions() + '</select>' +
        '<select class="in sm" data-p="fontEn" title="영문 글꼴 — 영문·한영 병기에서 영문에 적용" style="max-width:150px">' + AW.fontOptions('영문: 한글과 같음') + '</select>' +
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
        '<div class="tg pos">' + ['x:X', 'y:Y', 'w:가로', 'h:세로', 'rot:각도'].map(function (s) { var p = s.split(':'); return '<label class="mini">' + p[1] + '<input class="in sm num" data-g2="' + p[0] + '" type="number" step="0.5" style="width:62px"></label>'; }).join('') + '<span class="mini">mm</span></div>' +
      '</div>' +
      '<div class="ed-stage" tabindex="0" aria-label="양식 편집 영역"><div class="ed-wrap"></div><div class="ed-hint"></div></div>' +
      '<div class="ed-layers"><button class="ly-h" type="button" aria-label="레이어 창 열기/닫기"></button><div class="ly-b"></div></div>' +
      '<div class="ed-text"><div class="muted"><b>선택한 글상자 내용</b> — <code>{{항목명}}</code>을 쓰면 엑셀 데이터가 들어갑니다. 상자를 더블클릭하면 화면에서 바로 입력할 수 있습니다.</div><textarea class="in" data-p="text" rows="2" disabled placeholder="글상자를 선택하면 여기에서도 내용을 고칠 수 있습니다."></textarea></div>' +
      '<input type="file" class="hide" data-f="img" accept="image/*">';
    st.stage = AW.$('.ed-stage', root);
    bind(); bindLayers();
    if (window.ResizeObserver) new ResizeObserver(AW.debounce(function () { E.relayout(); }, 80)).observe(st.stage);
  };

  function bind() {
    var root = st.root;
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b || b.disabled) return; st.at = null; act(b.dataset.a);
    });
    root.addEventListener('input', function (e) {
      var p = e.target.dataset.p, g = e.target.dataset.g2;
      if (p) setProp(p, e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value, true);
      if (g) { var v = parseFloat(e.target.value); if (!isNaN(v)) { sel().forEach(function (el) { el[g] = g === 'rot' ? normRot(v) : AW.round(g === 'w' || g === 'h' ? Math.max(0, v) : v, 2); }); if (g === 'rot') E.refreshElems(); else liveUpdate(); } }
    });
    root.addEventListener('change', function (e) { if (e.target.dataset.p || e.target.dataset.g2) { commitLive(); } if (e.target.dataset.f === 'img') pickImg(e.target); });
    st.stage.addEventListener('pointerdown', onDown);
    st.stage.addEventListener('dblclick', onDbl);
    st.stage.addEventListener('contextmenu', onCtx);
    st.stage.addEventListener('wheel', function (e) { if (!(e.ctrlKey || e.metaKey) || !T()) return; e.preventDefault(); st.fit = false; st.zoom = Math.max(1, Math.min(K1 * 3, scale() * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); E.render(); }, { passive: false });
    st.stage.addEventListener('dragover', function (e) { e.preventDefault(); });
    st.stage.addEventListener('drop', function (e) { e.preventDefault(); var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) E.loadBackgroundFile(f); });
    if (!st.docBound) { st.docBound = true; document.addEventListener('paste', onPasteDoc); document.addEventListener('keydown', onKey); document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp); }
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
    wrap.classList.toggle('rul', !!st.cfg.ruler);
    if (st.cfg.ruler) { ['top', 'left'].forEach(function (s) { var cv = document.createElement('canvas'); cv.className = 'rl rl-' + s; cv.title = '눈금자 — 여기서 끌어내면 안내선이 만들어집니다'; wrap.appendChild(cv); drawRuler(cv, s === 'top' ? T().page.w : T().page.h, s === 'top'); }); }
    AW.$$('.el[data-fit="1"]', pg).forEach(function (d) { d.dataset.fit = ''; });   // 편집 중에는 자동 맞춤 미적용(원본 크기 그대로 확인)
    markSel(); updTools();
    var zl = AW.$('[data-a="zlabel"]', st.root); if (zl) zl.textContent = st.fit ? '맞춤' : Math.round(st.zoom / K1 * 100) + '%';
    ['ko', 'en', 'both'].forEach(function (l) { var b = AW.$('[data-a="lang-' + l + '"]', st.root); if (b) b.classList.toggle('on', LG() === l); });
    var ob = AW.$('[data-a="orient"]', st.root); if (ob) ob.innerHTML = AW.ic('rotate', 15) + ' ' + (T().page.w >= T().page.h ? '가로' : '세로');
    var sn = AW.$('[data-a="snap"]', st.root); if (sn) sn.classList.toggle('on', st.cfg.snap);
    drawGrid();
    updHint();
  };
  function updHint() {
    var hint = AW.$('.ed-hint', st.stage);
    hint.textContent = (T().elems.length || T().bg) ? '' : '배경(JPG·PNG·PDF)을 올리거나, 위의 도구로 글상자를 추가해 주십시오. 파일을 이 영역에 끌어다 놓아도 됩니다.';
  }
  E.refreshElems = function () {            // 요소 레이어만 다시 그림 (배경 이미지 재생성 방지)
    if (!st.pg) return E.render();
    AW.$$('.el', st.pg).forEach(function (n) { n.remove(); });
    T().elems.forEach(function (e) { var d = AW.renderElem(e, st.zoom, { mode: 'edit', lang: LG() }); d.dataset.fit = ''; st.pg.insertBefore(d, st.ov); });
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
        var rotated = !!(e.rot && e.rot % 360);
        (rotated ? [] : e.t === 'line' ? ['w', 'e'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']).forEach(function (h) { var hd = document.createElement('i'); hd.className = 'hd hd-' + h; hd.dataset.h = h; b.appendChild(hd); });
        var rh = document.createElement('i'); rh.className = 'rh'; rh.title = '끌어서 회전 (Shift: 15°, 0·90°·180°는 자동 맞춤)'; b.appendChild(rh);
      }
      st.ov.appendChild(b);
    });
    if (list.length > 1 && list[0].grp && list.every(function (e) { return e.grp === list[0].grp; })) {   // 그룹 전체 영역
      var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, k = st.zoom; list.forEach(function (e) { x1 = Math.min(x1, e.x); y1 = Math.min(y1, e.y); x2 = Math.max(x2, e.x + e.w); y2 = Math.max(y2, e.y + e.h); });
      var gb = document.createElement('div'); gb.className = 'sb gb'; gb.style.cssText = 'left:' + x1 * k + 'px;top:' + y1 * k + 'px;width:' + (x2 - x1) * k + 'px;height:' + (y2 - y1) * k + 'px'; st.ov.appendChild(gb);
    }
    drawGuides();
  }
  function normRot(v) { v = ((v % 360) + 360) % 360; return AW.round(v > 180 ? v - 360 : v, 1); }
  function rotBy(d) { sel().forEach(function (e) { if (!e.lock) e.rot = normRot((e.rot || 0) + d); }); E.refreshElems(); changed('elems'); }
  function grouping(on) {
    var l = sel(); if (on) { if (l.length < 2) return AW.toast('그룹으로 묶으려면 2개 이상 선택해 주십시오.'); var g = AW.uid('g'); l.forEach(function (e) { e.grp = g; }); AW.toast(l.length + '개를 그룹으로 묶었습니다.'); }
    else { if (!l.some(function (e) { return e.grp; })) return AW.toast('선택한 요소 중 그룹이 없습니다.'); l.forEach(function (e) { delete e.grp; }); AW.toast('그룹을 해제했습니다.'); }
    E.refreshElems(); changed('elems');
  }
  function langDialog() {
    var p = T().page;
    AW.modal({ title: '영문 · 한영 병기 설정', body: '<p class="muted" style="margin-top:0">글상자마다 한글과 영문을 함께 보관합니다. 위쪽 「한글 / 영문 / 한영」 버튼으로 편집·보기 언어를 바꾸고, 출력할 때도 같은 선택지가 있습니다. 한영 병기에서는 한글 아래(또는 위)에 영문이 작게 이어서 출력됩니다.</p>' +
      '<label class="f">병기할 때 영문 글자 크기 (한글 대비)</label><input class="in num" id="lc-s" type="number" min="0.4" max="1.5" step="0.05" value="' + (p.enScale || 0.8) + '">' +
      '<label class="f">영문 위치</label><div class="radios"><label><input type="radio" name="lc-o" value="0"' + (p.enFirst ? '' : ' checked') + '> 한글 아래에 영문</label><label><input type="radio" name="lc-o" value="1"' + (p.enFirst ? ' checked' : '') + '> 한글 위에 영문</label></div>',
      actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '적용', cls: 'btn-primary', onClick: function (c) { var s = parseFloat(AW.$('#lc-s').value); p.enScale = isNaN(s) ? 0.8 : Math.max(0.4, Math.min(1.5, s)); p.enFirst = AW.$('input[name="lc-o"]:checked').value === '1'; c(); E.render(); changed('page'); } }] });
  }
  // 눈금자·안내선
  function drawRuler(cv, len, horiz) {
    var k = st.zoom, dpr = window.devicePixelRatio || 1, W = horiz ? len * k : 18, H = horiz ? 18 : len * k;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    var g = cv.getContext('2d'); g.scale(dpr, dpr); g.fillStyle = '#F8FBFE'; g.fillRect(0, 0, W, H); g.strokeStyle = '#94A3B8'; g.fillStyle = '#5F6368'; g.font = '9px sans-serif'; g.lineWidth = 1;
    var step = k >= 3 ? 1 : k >= 1.5 ? 5 : 10;
    for (var m = 0; m <= len; m += step) {
      var pos = m * k + 0.5, big = m % 10 === 0, mid = m % 5 === 0, ln = big ? 18 : mid ? 10 : 5;
      g.beginPath(); if (horiz) { g.moveTo(pos, 18); g.lineTo(pos, 18 - ln); } else { g.moveTo(18, pos); g.lineTo(18 - ln, pos); } g.stroke();
      if (big && m) { if (horiz) g.fillText(m, pos + 2, 9); else { g.save(); g.translate(9, pos + 2); g.rotate(-Math.PI / 2); g.fillText(m, 0, 0); g.restore(); } }
    }
  }
  function guides() { var pg = T().page; if (!pg.guides) pg.guides = { v: [], h: [] }; return pg.guides; }
  function drawGuides() {
    if (!st.ov) return; AW.$$('.gl', st.ov).forEach(function (n) { n.remove(); });
    if (st.cfg.gshow === false) return; var g = T().page.guides; if (!g) return; var k = st.zoom;
    ['v', 'h'].forEach(function (ax) { (g[ax] || []).forEach(function (pos, i) { var d = document.createElement('div'); d.className = 'gl ' + (ax === 'v' ? 'glv' : 'glh'); d.dataset.ax = ax; d.dataset.i = i; d.title = '안내선 ' + pos + 'mm — 끌어서 이동, 눈금자로 끌어내면 삭제'; d.style[ax === 'v' ? 'left' : 'top'] = pos * k + 'px'; st.ov.appendChild(d); }); });
  }
  function ctxFlip() {}
  function placeBox(b, e) { var k = st.zoom; b.style.cssText = 'left:' + (e.x * k) + 'px;top:' + (e.y * k - (e.t === 'line' ? 4 : 0)) + 'px;width:' + (e.w * k) + 'px;height:' + (e.t === 'line' ? 8 : Math.max(e.h, 0.5) * k) + 'px' + (e.rot ? ';transform:rotate(' + e.rot + 'deg)' : ''); }
  function domOf(e) { return AW.$('.el[data-id="' + e.id + '"]', st.pg); }
  function placeEl(e) { var d = domOf(e); if (!d) return; var k = st.zoom; d.style.left = e.x * k + 'px'; d.style.top = e.y * k + 'px'; d.style.width = e.w * k + 'px'; if (e.t !== 'line') d.style.height = Math.max(e.h, 1) * k + 'px'; var tr = (e.rot ? 'rotate(' + e.rot + 'deg) ' : '') + ((e.flipX || e.flipY) ? 'scale(' + (e.flipX ? -1 : 1) + ',' + (e.flipY ? -1 : 1) + ')' : ''); d.style.transform = tr.trim(); }
  function liveUpdate() { sel().forEach(function (e) { placeEl(e); var b = AW.$('.sb[data-id="' + e.id + '"]', st.ov); if (b) placeBox(b, e); }); updPos(); }
  function commitLive() { changed('elems'); }

  function updPos() {
    var list = sel(), one = list.length === 1 ? list[0] : null;
    ['x', 'y', 'w', 'h', 'rot'].forEach(function (g) { var i = AW.$('[data-g2="' + g + '"]', st.root); if (i && document.activeElement !== i) i.value = one ? AW.round(one[g] || 0, 2) : ''; if (i) i.disabled = !one; });
  }
  function updTools() {
    var list = sel(), tx = list.filter(function (e) { return e.t === 'text'; }), one = tx[0];
    var fmt = AW.$('.ed-fmt', st.root); fmt.classList.toggle('off', !tx.length);
    AW.$$('[data-p]', fmt).forEach(function (i) { i.disabled = !tx.length; });
    AW.$$('button', fmt).forEach(function (b) { b.disabled = !tx.length; });
    if (one) {
      var f = function (p) { return AW.$('[data-p="' + p + '"]', st.root); };
      f('font').value = one.font; f('fontEn').value = one.fontEn || ''; f('size').value = one.size; f('lh').value = one.lh; f('ls').value = one.ls || 0; f('color').value = /^#[0-9a-f]{6}$/i.test(one.color) ? one.color : '#111111'; f('fit').checked = !!one.fit;
      [['bold', one.bold], ['italic', one.italic], ['ul', one.ul], ['al-l', one.align === 'left'], ['al-c', one.align === 'center'], ['al-r', one.align === 'right'], ['v-t', one.valign === 'top'], ['v-m', one.valign === 'middle'], ['v-b', one.valign === 'bottom']].forEach(function (p) {
        var b = AW.$('[data-a="' + p[0] + '"]', fmt); if (b) b.classList.toggle('on', !!p[1]);
      });
    }
    var box = AW.$('.ed-text', st.root), ta = AW.$('[data-p="text"]', st.root);
    var one1 = list.length === 1 && list[0].t === 'text';
    ta.disabled = !one1; ta.placeholder = '글상자를 선택하면 여기에서도 내용을 고칠 수 있습니다.' + (LG() === 'both' ? ' (한영 병기 보기에서는 한글을 편집합니다)' : LG() === 'en' ? ' (영문 편집 중)' : '');
    if (document.activeElement !== ta) ta.value = one1 ? (list[0][tk()] || '') : '';
    var lk = AW.$('[data-a="lock"]', st.root); if (lk) { var all = list.length && list.every(function (e) { return e.lock; }); lk.classList.toggle('on', !!all); lk.innerHTML = AW.ic(all ? 'lock' : 'unlock', 17); }
    updPos(); updUndo(); updLayers();
  }
  function expandGrp(ids) {
    var gs = {}; ids.forEach(function (id) { var e = AW.get(id); if (e && e.grp) gs[e.grp] = 1; });
    if (!Object.keys(gs).length) return ids;
    var out = ids.slice(); T().elems.forEach(function (e) { if (e.grp && gs[e.grp] && out.indexOf(e.id) < 0) out.push(e.id); }); return out;
  }
  E.setSel = function (ids, noRender) { S.sel = expandGrp(ids); markSel(); updTools(); AW.emit('selchange'); };

  /* ───────────── 속성 변경 ───────────── */
  function setProp(p, v, live) {
    var tx = sel().filter(function (e) { return e.t === 'text'; });
    if (!tx.length) return;
    if (typeof v === 'number' && isNaN(v)) return;
    tx.forEach(function (e) {
      if (p === 'size') v = Math.max(4, Math.min(300, v));
      e[p === 'text' ? tk() : p] = v;
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
      case 'add-text': return add(AW.elem('text', { text: '텍스트를 입력하세요', en: 'Enter text' }));
      case 'add-qr': return add(AW.elem('qr'));
      case 'lang-ko': case 'lang-en': case 'lang-both': T().page.lang = a.slice(5); E.render(); return changed('page', true);
      case 'langcfg': return langDialog();
      case 'group': return grouping(true); case 'ungroup': return grouping(false);
      case 'rot-l': return rotBy(-90); case 'rot-r': return rotBy(90); case 'rot-180': return rotBy(180); case 'rot-0': sel().forEach(function (e) { e.rot = 0; }); E.refreshElems(); return changed('elems');
      case 'flip-x': case 'flip-y': sel().forEach(function (e) { e[a === 'flip-x' ? 'flipX' : 'flipY'] = !e[a === 'flip-x' ? 'flipX' : 'flipY']; }); E.refreshElems(); return changed('elems');
      case 'ruler': st.cfg.ruler = !st.cfg.ruler; saveCfg(); return E.render();
      case 'gridshow': st.cfg.show = !st.cfg.show; saveCfg(); return drawGrid();
      case 'gshow': st.cfg.gshow = st.cfg.gshow === false; saveCfg(); return markSel();
      case 'gclear': T().page.guides = { v: [], h: [] }; markSel(); return changed('page');
      case 'usermenu': return null;
      case 'add-field': return fieldDialog();
      case 'add-line': return add(AW.elem('line', { w: T().page.w * 0.5, x: T().page.w * 0.25 }));
      case 'add-rect': return add(AW.elem('rect'));
      case 'add-img': return AW.$('[data-f="img"]', st.root).click();
      case 'starter': return starter();
      case 'page': return E.pageDialog();
      case 'orient': return E.orientDialog();
      case 'layers': return toggleLayers();
      case 'noprint': var allN = list.length && list.every(function (e) { return e.noprint; }); list.forEach(function (e) { e.noprint = !allN; }); E.refreshElems(); changed('elems'); return AW.toast(allN ? '출력에 포함합니다.' : '화면에서만 보이고 인쇄·미리보기에서는 제외됩니다.');
      case 'hide': var allH = list.length && list.every(function (e) { return e.hide; }); list.forEach(function (e) { e.hide = !allH; }); E.refreshElems(); return changed('elems');
      case 'tr-sel': var te = tx[0]; return te && AW.AI.translateText({ text: te.text, elemId: te.id, apply: function (v) { te.en = v; if (LG() === 'ko') { T().page.lang = 'both'; E.render(); } else E.refreshElems(); changed('elems'); AW.toast('영문 칸에 저장했습니다. 한영 병기 보기로 확인합니다.', 'ok'); } });
      case 'tr-doc': return AW.AI.translateDoc();
      case 'gloss': return AW.AI.glossDialog();
      case 'ai-test': return AW.AI.test(false);
      case 'nu': return nudgeBy(0, -st.cfg.nudge); case 'nd': return nudgeBy(0, st.cfg.nudge); case 'nl': return nudgeBy(-st.cfg.nudge, 0); case 'nr': return nudgeBy(st.cfg.nudge, 0);
      case 'Nu': return nudgeBy(0, -st.cfg.big); case 'Nd': return nudgeBy(0, st.cfg.big); case 'Nl': return nudgeBy(-st.cfg.big, 0); case 'Nr': return nudgeBy(st.cfg.big, 0);
      case 'keys': return keysHelp();
      case 'selall': return E.setSel(T().elems.map(function (e) { return e.id; }));
      case 'copy': return copy();
      case 'cut': copy(); return del();
      case 'paste': return pasteClip(st.at);
      case 'edit': var o1 = sel()[0], d1 = o1 && domOf(o1); return d1 && o1.t === 'text' && !o1.lock && setTimeout(function () { beginEdit(o1, d1); }, 0);
      case 'fwd': return orderStep(1); case 'bwd': return orderStep(-1);
      case 'undo': return undo(-1);
      case 'redo': return undo(1);
      case 'dup': return dup();
      case 'addline': return addLine();
      case 'del': return del();
      case 'zin': st.fit = false; st.zoom = Math.min(K1 * 3, scale() * 1.2); return E.render();
      case 'zout': st.fit = false; st.zoom = Math.max(1, scale() / 1.2); return E.render();
      case 'zfit': st.fit = true; return E.render();
      case 'zlabel': if (st.fit) { st.fit = false; st.zoom = K1; } else st.fit = true; return E.render();
      case 'snap': st.cfg.snap = !st.cfg.snap; saveCfg(); return AW.$('[data-a="snap"]', st.root).classList.toggle('on', st.cfg.snap);
      case 'gridcfg': return gridDialog();
      case 'cstyle': return copyStyle();
      case 'pstyle': return pasteStyle();
      case 'pinplace': return pasteClip(null, true);
      case 'same-w': return sameSize('w'); case 'same-h': return sameSize('h'); case 'same-wh': return sameSize('wh');
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
    if (st.at) { e.x = AW.round(Math.max(0, Math.min(T().page.w - e.w, st.at.x - e.w / 2)), 1); e.y = AW.round(Math.max(0, Math.min(T().page.h - Math.max(e.h, 0), st.at.y - e.h / 2)), 1); st.at = null; }
    T().elems.push(e); E.refreshElems(); E.setSel([e.id]); changed('elems'); return e;
  }
  function del() {
    if (!S.sel.length) return;
    T().elems = T().elems.filter(function (e) { return S.sel.indexOf(e.id) < 0; }); S.sel = []; E.refreshElems(); AW.emit('selchange'); changed('elems');
  }
  function dup() {
    var list = sel(); if (!list.length) return;
    var gm = {}, ids = list.map(function (e) { var c = AW.clone(e); c.id = AW.uid(); c.x = AW.round(c.x + 4, 2); c.y = AW.round(c.y + 4, 2); c.lock = false; if (c.grp) c.grp = gm[c.grp] = gm[c.grp] || AW.uid('g'); T().elems.push(c); return c.id; });
    E.refreshElems(); E.setSel(ids); changed('elems');
  }
  function addLine() {                       // 줄 추가: 선택한 글상자 아래에 같은 서식·크기의 상자를 한 줄 더
    var e = sel().filter(function (x) { return x.t === 'text'; })[0];
    if (!e) return AW.toast('줄을 추가할 글상자를 먼저 선택해 주십시오.');
    var c = AW.clone(e); c.id = AW.uid(); c.y = AW.round(e.y + e.h, 2); c.text = '새 줄'; c.lock = false;
    if (c.y + c.h > T().page.h) c.y = AW.round(Math.max(0, T().page.h - c.h), 2);
    T().elems.push(c); E.refreshElems(); E.setSel([c.id]); changed('elems');
  }
  function saveCfg() { AW.lsSet('award_ed_cfg', st.cfg); }
  function drawGrid() {
    if (!st.ov) return; var g = AW.$('.gridl', st.pg); if (g) g.remove();
    if (!st.cfg.show) return;
    var s = (st.cfg.grid || 1) * st.zoom, major = s * 5; if (s < 4) { s *= Math.ceil(4 / s); major = s * 5; }
    g = document.createElement('div'); g.className = 'gridl';
    g.style.cssText = 'background-image:linear-gradient(rgba(14,165,233,.18) 1px,transparent 1px),linear-gradient(90deg,rgba(14,165,233,.18) 1px,transparent 1px),linear-gradient(rgba(14,165,233,.32) 1px,transparent 1px),linear-gradient(90deg,rgba(14,165,233,.32) 1px,transparent 1px);background-size:' + s + 'px ' + s + 'px,' + s + 'px ' + s + 'px,' + major + 'px ' + major + 'px,' + major + 'px ' + major + 'px';
    st.pg.insertBefore(g, st.ov);
  }
  function gridDialog() {
    var c = st.cfg, opt = [0.1, 0.25, 0.5, 1, 2, 2.5, 5, 10];
    AW.modal({ title: '격자 · 자석 · 이동 간격', body:
      '<label class="f">격자 간격(mm)</label><select class="in" id="gc-g">' + opt.map(function (v) { return '<option value="' + v + '"' + (c.grid === v ? ' selected' : '') + '>' + v + ' mm</option>'; }).join('') + '<option value="x"' + (opt.indexOf(c.grid) < 0 ? ' selected' : '') + '>직접 입력</option></select>' +
      '<input class="in num" id="gc-gx" type="number" min="0.05" max="50" step="0.05" value="' + c.grid + '" style="margin-top:6px">' +
      '<div class="radios" style="margin-top:10px"><label><input type="checkbox" id="gc-snap"' + (c.snap ? ' checked' : '') + '> 격자 자석 (끌 때 격자에 맞춤, Ctrl 누르면 일시 해제)</label>' +
      '<label><input type="checkbox" id="gc-show"' + (c.show ? ' checked' : '') + '> 격자선 표시 (5칸마다 굵게)</label>' +
      '<label><input type="checkbox" id="gc-gd"' + (c.guides ? ' checked' : '') + '> 스마트 가이드 (용지·다른 상자의 가장자리·중앙에 붙음)</label></div>' +
      '<div class="grid2"><div><label class="f">가이드 붙는 거리(mm)</label><input class="in num" id="gc-th" type="number" min="0.2" max="10" step="0.1" value="' + c.th + '"></div><div></div>' +
      '<div><label class="f">화살표 이동(mm)</label><input class="in num" id="gc-n" type="number" min="0.05" max="20" step="0.05" value="' + c.nudge + '"></div><div><label class="f">Shift+화살표(mm)</label><input class="in num" id="gc-b" type="number" min="0.1" max="100" step="0.5" value="' + c.big + '"></div></div>' +
      '<p class="muted" style="margin-bottom:0">설정은 이 브라우저에 저장됩니다. 격자는 이동·크기 조절에 적용됩니다.</p>',
      actions: [{ label: '기본값', cls: 'btn-ghost', onClick: function (cl) { st.cfg = Object.assign({}, CFG0); saveCfg(); cl(); E.render(); } }, { label: '적용', cls: 'btn-primary', onClick: function (cl) {
        var sel2 = AW.$('#gc-g').value, gv = sel2 === 'x' ? parseFloat(AW.$('#gc-gx').value) : parseFloat(sel2), num = function (id, d, lo, hi) { var v = parseFloat(AW.$(id).value); return isNaN(v) ? d : Math.max(lo, Math.min(hi, v)); };
        st.cfg = { grid: isNaN(gv) ? 1 : Math.max(0.05, Math.min(50, gv)), snap: AW.$('#gc-snap').checked, show: AW.$('#gc-show').checked, guides: AW.$('#gc-gd').checked, th: num('#gc-th', 1.2, 0.2, 10), nudge: num('#gc-n', 0.5, 0.05, 20), big: num('#gc-b', 5, 0.1, 100) };
        saveCfg(); cl(); E.render(); } }],
      onOpen: function (el) { var s = AW.$('#gc-g', el), x = AW.$('#gc-gx', el); s.onchange = function () { if (s.value !== 'x') x.value = s.value; }; x.oninput = function () { s.value = opt.indexOf(parseFloat(x.value)) >= 0 ? x.value : 'x'; }; } });
  }
  // 서식(속성) 복사·붙여넣기 — 같은 종류의 요소에 글꼴·크기·색·굵기·정렬·행간·자간 등을 적용
  var SK = { text: ['font', 'size', 'color', 'bold', 'italic', 'ul', 'align', 'valign', 'lh', 'ls', 'fit'], rect: ['fill', 'stroke', 'sw'], line: ['stroke', 'sw'], img: ['opacity'] };
  function copyStyle() {
    var e = sel()[0]; if (!e) return AW.toast('서식을 복사할 요소를 먼저 선택해 주십시오.');
    st.sty = { t: e.t, v: {} }; (SK[e.t] || []).forEach(function (k) { st.sty.v[k] = e[k]; }); AW.toast('서식을 복사했습니다. 대상을 선택하고 서식 붙여넣기(Ctrl+Alt+V)를 누르십시오.');
  }
  function pasteStyle() {
    if (!st.sty) return AW.toast('복사한 서식이 없습니다. 먼저 서식 복사(Ctrl+Alt+C)를 하십시오.');
    var n = 0; sel().forEach(function (e) {
      var ok = e.t === st.sty.t || ((e.t === 'rect' || e.t === 'line') && (st.sty.t === 'rect' || st.sty.t === 'line'));
      if (!ok) return; (SK[e.t] || []).forEach(function (k) { if (k in st.sty.v) e[k] = st.sty.v[k]; }); n++;
    });
    if (!n) return AW.toast('같은 종류의 요소에만 서식을 붙여넣을 수 있습니다.', 'error');
    E.refreshElems(); changed('elems');
  }
  function sameSize(how) {                   // 첫 번째로 선택한 요소를 기준으로 크기 맞춤
    var l = sel().filter(function (e) { return !e.lock; }); if (l.length < 2) return AW.toast('2개 이상 선택해 주십시오.');
    var r = l[0]; l.slice(1).forEach(function (e) { if (how !== 'h') e.w = r.w; if (how !== 'w' && e.t !== 'line') e.h = r.h; });
    E.refreshElems(); changed('elems');
  }
  function nudgeBy(dx, dy) { sel().forEach(function (e) { if (!e.lock) { e.x = AW.round(e.x + dx, 2); e.y = AW.round(e.y + dy, 2); } }); E.refreshElems(); changed('elems'); }

  /* ───────────── 레이어 창 (아래에서 슬라이드) ───────────── */
  function lyName(e) { return e.name || (e.t === 'text' ? (String(e.text).replace(/\s+/g, ' ').trim().slice(0, 18) || '(빈 글상자)') : e.t === 'rect' ? '사각형' : e.t === 'line' ? '선' : e.t === 'qr' ? '인증 QR' : '이미지'); }
  function toggleLayers() { st.lyOpen = !st.lyOpen; AW.lsSet('award_ly_open', st.lyOpen); AW.$('.ed-layers', st.root).classList.toggle('open', st.lyOpen); updLayers(); setTimeout(function () { E.relayout(); }, 260); }
  function updLayers() {
    var box = AW.$('.ed-layers', st.root); if (!box || !T()) return;
    if (st.lyOpen == null) { st.lyOpen = !!AW.lsGet('award_ly_open', false); box.classList.toggle('open', st.lyOpen); }
    var els = T().elems, h = AW.$('.ly-h', box); h.innerHTML = AW.ic('layers', 16) + ' <b>레이어</b> <span class="muted">' + els.length + '개</span><span class="sp"></span>' + AW.ic(st.lyOpen ? 'chevD' : 'chevU', 16);
    var b = AW.$('.ly-b', box); if (!st.lyOpen || (b.querySelector('input:focus'))) return;
    var ic = { text: 'text', rect: 'rect', line: 'line', img: 'image', qr: 'qr' };
    b.innerHTML = els.slice().reverse().map(function (e) {
      return '<div class="ly' + (S.sel.indexOf(e.id) >= 0 ? ' on' : '') + (e.hide ? ' hid' : '') + '" draggable="true" data-id="' + e.id + '"><span class="li">' + AW.ic(ic[e.t] || 'text', 15) + '</span>' + (e.grp ? '<span class="gdot" title="그룹" style="background:hsl(' + (parseInt(e.grp.slice(-4), 36) % 360) + ',65%,50%)"></span>' : '') + '<span class="ln" title="더블클릭하여 이름 변경">' + AW.esc(lyName(e)) + '</span>' + (e.noprint ? '<span class="npb" title="인쇄 제외">인쇄 제외</span>' : '') +
        '<button class="icon-btn" data-ly="hide" title="' + (e.hide ? '보이기' : '숨기기') + '" aria-label="표시 전환">' + AW.ic(e.hide ? 'close' : 'eye', 15) + '</button><button class="icon-btn' + (e.lock ? ' on' : '') + '" data-ly="lock" title="잠금 전환" aria-label="잠금 전환">' + AW.ic(e.lock ? 'lock' : 'unlock', 15) + '</button></div>';
    }).join('') + (T().bg ? '<div class="ly bgrow' + (T().page.bgHide ? ' hid' : '') + '"><span class="li">' + AW.ic('image', 15) + '</span><span class="ln">배경: ' + AW.esc(T().bgName || '양식') + '</span><button class="icon-btn" data-ly="bg" title="배경 표시 전환" aria-label="배경 표시 전환">' + AW.ic(T().page.bgHide ? 'close' : 'eye', 15) + '</button></div>' : '') +
      (els.length ? '' : '<div class="empty" style="padding:10px">요소가 없습니다.</div>');
  }
  function bindLayers() {
    var box = AW.$('.ed-layers', st.root), b = AW.$('.ly-b', box), dragId = null;
    AW.$('.ly-h', box).onclick = toggleLayers;
    b.addEventListener('click', function (ev) {
      var row = ev.target.closest('.ly'); if (!row) return; var id = row.dataset.id, a = ev.target.closest('[data-ly]');
      if (a) { var k = a.dataset.ly; if (k === 'bg') { T().page.bgHide = !T().page.bgHide; E.render(); return changed('page'); } var e = AW.get(id); if (!e) return; if (k === 'hide') e.hide = !e.hide; else e.lock = !e.lock; E.refreshElems(); return changed('elems'); }
      if (!id) return; if (ev.shiftKey || ev.ctrlKey || ev.metaKey) { var s = S.sel.slice(), i = s.indexOf(id), ge = AW.get(id), gm = ge && ge.grp ? T().elems.filter(function (x) { return x.grp === ge.grp; }).map(function (x) { return x.id; }) : [id]; if (i >= 0) s = s.filter(function (x) { return gm.indexOf(x) < 0; }); else s = s.concat(gm); E.setSel(s); } else E.setSel([id]);
    });
    b.addEventListener('dblclick', function (ev) {
      var n = ev.target.closest('.ln'), row = n && n.closest('.ly'); if (!row || !row.dataset.id) return; var e = AW.get(row.dataset.id);
      n.innerHTML = '<input class="in sm" style="width:100%" value="' + AW.esc(lyName(e)) + '">'; var inp = n.firstChild; inp.focus(); inp.select();
      var done = function (ok) { if (ok) { e.name = inp.value.trim().slice(0, 30); changed('elems'); } updLayers(); };
      inp.onkeydown = function (k) { k.stopPropagation(); if (k.key === 'Enter') done(true); if (k.key === 'Escape') done(false); }; inp.onblur = function () { done(true); };
    });
    b.addEventListener('contextmenu', function (ev) { var row = ev.target.closest('.ly[data-id]'); if (!row) return; ev.preventDefault(); if (S.sel.indexOf(row.dataset.id) < 0) E.setSel([row.dataset.id]); openCtx(ev.clientX, ev.clientY, buildCtx(true)); });
    b.addEventListener('dragstart', function (ev) { var row = ev.target.closest('.ly[data-id]'); if (!row) return; dragId = row.dataset.id; ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', dragId); } catch (e) {} });
    b.addEventListener('dragover', function (ev) { var row = ev.target.closest('.ly[data-id]'); if (!row || !dragId) return; ev.preventDefault(); AW.$$('.ly', b).forEach(function (r) { r.classList.remove('dt', 'db'); }); var r = row.getBoundingClientRect(); row.classList.add(ev.clientY < r.top + r.height / 2 ? 'dt' : 'db'); });
    b.addEventListener('drop', function (ev) {
      var row = ev.target.closest('.ly[data-id]'); if (!row || !dragId || row.dataset.id === dragId) { dragId = null; return updLayers(); } ev.preventDefault();
      var r = row.getBoundingClientRect(), above = ev.clientY < r.top + r.height / 2, a = T().elems, from = a.filter(function (e) { return e.id === dragId; })[0];
      a.splice(a.indexOf(from), 1); var ti = a.indexOf(AW.get(row.dataset.id)); a.splice(above ? ti + 1 : ti, 0, from);   // 화면 위쪽 = 배열 뒤쪽(앞면)
      dragId = null; E.refreshElems(); changed('elems');
    });
    b.addEventListener('dragend', function () { dragId = null; updLayers(); });
  }

  function keysHelp() {
    var R = [['끌어서 이동', 'Shift: 가로·세로 한 방향 고정 / Alt: 복제하며 이동 / Ctrl: 자석(격자·가이드) 끄기'], ['모서리 크기 조절', 'Shift: 비율 유지(글상자는 글자 크기도 확대) / Alt: 중심 기준 확대·축소'], ['변 크기 조절', '글상자 폭·높이만 변경'], ['선택', '클릭 / Shift·Ctrl+클릭: 추가·해제 / 빈 곳 끌기: 범위 선택 / Ctrl+A: 전체'], ['화살표', '0.5mm 이동 (Shift: 5mm)'], ['Ctrl+C / X / V', '복사 / 잘라내기 / 붙여넣기'], ['Ctrl+D', '복제'], ['Ctrl+G / Ctrl+Shift+G', '그룹 만들기 / 해제 (그룹은 더블클릭하면 안의 요소만 선택)'], ['Alt+R', '눈금자 보기·숨기기 — 눈금자에서 끌어내면 안내선, 안내선을 눈금자로 끌어 넣으면 삭제'], ['Alt+G', '격자선 보기·숨기기 (간격은 격자 설정에서)'], ['회전 손잡이', '선택한 요소 위쪽의 동그란 손잡이를 끌기 — Shift: 15° 단위, 0·90·180°는 자동 맞춤, Ctrl: 자동 맞춤 해제'], ['키 조합 선택 기준', 'Ctrl+R(새로고침)·Ctrl+H 같은 브라우저 예약 키를 피해 눈금자·격자는 Alt 조합으로 두었습니다'], ['Ctrl+Shift+V', '제자리에 붙여넣기'], ['Ctrl+Alt+C / V', '서식(글꼴·크기·색·정렬 등) 복사 / 붙여넣기'], ['Tab / Shift+Tab', '다음 / 이전 요소 선택'], ['Ctrl+] / [', '한 칸 앞으로 / 뒤로 (Shift 추가: 맨 앞 / 맨 뒤)'], ['Ctrl+Z / Y', '실행 취소 / 다시 실행'], ['인쇄 제외', '우클릭 → 순서·잠금·표시 → 「인쇄에서 제외」 — 화면 안내용 개체(주황 점선)는 미리보기·인쇄에서 빠집니다. 직인은 기본적으로 출력됩니다'], ['모든 기능', '단축키가 겹칠 때는 오른쪽 클릭 메뉴(서브메뉴)에서 같은 기능을 실행할 수 있습니다'], ['레이어 창', '아래 「레이어」 막대를 누르면 올라옵니다 — 클릭 선택, 눈·자물쇠, 끌어서 순서 변경, 더블클릭 이름 변경'], ['Ctrl+휠', '확대·축소'], ['Enter / 더블클릭', '글상자 직접 편집 (Esc: 마침)'], ['오른쪽 클릭', '바로 실행 메뉴'], ['Delete', '삭제'], ['Ctrl+S', '저장']];
    AW.modal({ title: '편집 단축키 · 마우스 조합', wide: true, body: '<div class="tbl-wrap"><table class="gt"><tbody>' + R.map(function (r) { return '<tr><td class="nowrap"><b>' + AW.esc(r[0]) + '</b></td><td>' + AW.esc(r[1]) + '</td></tr>'; }).join('') + '</tbody></table></div><p class="muted" style="margin-bottom:0">Mac 은 Ctrl 대신 Command, Alt 대신 Option 을 사용합니다.</p>', actions: [{ label: '닫기', cls: 'btn-primary' }] });
  }
  function copy() { var l = sel(); if (!l.length) return; st.clip = l.map(AW.clone); AW.toast(l.length + '개를 복사했습니다.'); }
  function pasteClip(pos, inPlace) {
    if (!st.clip || !st.clip.length) return;
    var x0 = Infinity, y0 = Infinity; st.clip.forEach(function (c) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); });
    var dx = inPlace ? 0 : pos ? pos.x - x0 : 5, dy = inPlace ? 0 : pos ? pos.y - y0 : 5;
    var gm = {}, ids = st.clip.map(function (c) { var n = AW.clone(c); n.id = AW.uid(); if (n.grp) n.grp = gm[n.grp] = gm[n.grp] || AW.uid('g'); n.x = AW.round(Math.max(0, c.x + dx), 2); n.y = AW.round(Math.max(0, c.y + dy), 2); n.lock = false; T().elems.push(n); return n.id; });
    E.refreshElems(); E.setSel(ids); changed('elems');
  }
  function orderStep(dir) {                  // 한 칸 앞으로(+1)/뒤로(-1)
    var a = T().elems, ids = S.sel.slice(), i;
    if (dir > 0) { for (i = a.length - 2; i >= 0; i--) if (ids.indexOf(a[i].id) >= 0 && ids.indexOf(a[i + 1].id) < 0) { var t = a[i]; a[i] = a[i + 1]; a[i + 1] = t; } }
    else { for (i = 1; i < a.length; i++) if (ids.indexOf(a[i].id) >= 0 && ids.indexOf(a[i - 1].id) < 0) { var t2 = a[i]; a[i] = a[i - 1]; a[i - 1] = t2; } }
    E.refreshElems(); changed('elems');
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
    var rh = ev.target.closest('.rh'), gl = ev.target.closest('.gl'), rl = ev.target.closest('.rl');
    if (rh) { var er = sel()[0]; if (er) { st.drag = { mode: 'rot', e: er, start: toMM(ev) }; ev.preventDefault(); } return; }
    if (gl) { st.drag = { mode: 'gmv', ax: gl.dataset.ax, i: +gl.dataset.i, start: toMM(ev) }; ev.preventDefault(); return; }
    if (rl) { st.drag = { mode: 'gnew', ax: rl.classList.contains('rl-top') ? 'h' : 'v', pos: null, start: toMM(ev) }; ev.preventDefault(); return; }
    var hd = ev.target.closest('.hd'), elNode = ev.target.closest('.el');
    if (hd) {
      var e0 = sel()[0]; if (!e0) return;
      st.drag = { mode: 'rs', h: hd.dataset.h, start: toMM(ev), o: { x: e0.x, y: e0.y, w: e0.w, h: e0.h, size: e0.size }, e: e0 }; ev.preventDefault(); return;
    }
    if (elNode) {
      var id = elNode.dataset.id;
      if (ev.shiftKey || ev.ctrlKey || ev.metaKey) { var s = S.sel.slice(), i = s.indexOf(id); if (i >= 0) s.splice(i, 1); else s.push(id); E.setSel(s); }
      else if (S.sel.indexOf(id) < 0) E.setSel([id]);
      var list = sel().filter(function (e) { return !e.lock; });
      if (list.length) st.drag = { mode: 'mv', start: toMM(ev), list: list.map(function (e) { return { e: e, x: e.x, y: e.y }; }), moved: false, alt: ev.altKey };
      ev.preventDefault(); st.stage.focus({ preventScroll: true });
    } else if (ev.target.closest('.ed-pg')) {
      var add = ev.shiftKey || ev.ctrlKey || ev.metaKey;
      if (!add) E.setSel([]);
      st.drag = { mode: 'mq', start: toMM(ev), base: add ? S.sel.slice() : [], box: null };
      st.stage.focus({ preventScroll: true });
    }
  }
  function onMove(ev) {
    var d = st.drag; if (!d) return;
    var p = toMM(ev), dx = p.x - d.start.x, dy = p.y - d.start.y, sn = st.cfg.snap && !(ev.ctrlKey || ev.metaKey), pg = T().page, gs = st.cfg.grid || 1;
    function sp(v) { return AW.round(sn ? Math.round(v / gs) * gs : v, 2); }
    if (d.mode === 'rot') {                  // 회전: Shift 15°, 0·90·180°에서 자동 맞춤(Ctrl 로 해제)
      var pr = st.pg.getBoundingClientRect(), cx = pr.left + (d.e.x + d.e.w / 2) * st.zoom, cy = pr.top + (d.e.y + d.e.h / 2) * st.zoom;
      var ang = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90;
      if (ev.shiftKey) ang = Math.round(ang / 15) * 15; else if (!(ev.ctrlKey || ev.metaKey)) { var q = Math.round(ang / 90) * 90; if (Math.abs(ang - q) < 3) ang = q; }
      d.e.rot = normRot(ang); d.moved = true; liveUpdate(); return;
    }
    if (d.mode === 'gnew' || d.mode === 'gmv') {
      var gv = d.ax === 'v' ? p.x : p.y, lim = d.ax === 'v' ? pg.w : pg.h; if (sn) gv = Math.round(gv / gs) * gs; gv = AW.round(gv, 1); d.moved = true; d.pos = gv;
      if (d.mode === 'gmv') { guides()[d.ax][d.i] = gv; drawGuides(); }
      else { var pv = AW.$('.gl.prev', st.ov); if (!pv) { pv = document.createElement('div'); pv.className = 'gl prev ' + (d.ax === 'v' ? 'glv' : 'glh'); st.ov.appendChild(pv); } pv.style[d.ax === 'v' ? 'left' : 'top'] = gv * st.zoom + 'px'; pv.style.display = gv < 0 || gv > lim ? 'none' : ''; }
      return;
    }
    if (d.mode === 'mq') {                   // 빈 곳 드래그: 범위 선택(Shift/Ctrl 로 추가)
      if (!d.box) { if (Math.abs(dx) + Math.abs(dy) < 0.8) return; d.box = document.createElement('div'); d.box.className = 'mq'; st.ov.appendChild(d.box); }
      var k = st.zoom, x1 = Math.min(d.start.x, p.x), y1 = Math.min(d.start.y, p.y), x2 = Math.max(d.start.x, p.x), y2 = Math.max(d.start.y, p.y);
      d.box.style.cssText = 'left:' + x1 * k + 'px;top:' + y1 * k + 'px;width:' + (x2 - x1) * k + 'px;height:' + (y2 - y1) * k + 'px';
      var ids = d.base.slice(); T().elems.forEach(function (e) { if (e.x < x2 && e.x + e.w > x1 && e.y - 1 < y2 && e.y + e.h + 1 > y1 && ids.indexOf(e.id) < 0) ids.push(e.id); });
      ids = expandGrp(ids); if (ids.join() !== S.sel.join()) { S.sel = ids; var bx = d.box; markSel(); st.ov.appendChild(bx); updTools(); }
      return;
    }
    if (d.mode === 'mv') {
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 0.4) return;
      if (!d.moved && d.alt) {              // Alt+드래그: 복제본을 끌어서 이동 (원본은 제자리)
        var ids2 = d.list.map(function (it) { var c = AW.clone(it.e); c.id = AW.uid(); c.lock = false; T().elems.push(c); it.e = c; return c.id; });
        E.refreshElems(); S.sel = ids2; markSel(); updTools();
      }
      d.moved = true;
      if (ev.shiftKey) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }   // Shift: 가로/세로 한 방향으로만
      d.list.forEach(function (it) { it.e.x = sp(it.x + dx); it.e.y = sp(it.y + dy); });
      smartGuides(st.cfg.guides && d.list.length === 1 && !(ev.ctrlKey || ev.metaKey) ? d.list[0].e : null);
      liveUpdate();
    } else {
      var e = d.e, o = d.o, h = d.h, cen = ev.altKey, m = cen ? 2 : 1;
      var w = o.w + (h.indexOf('e') >= 0 ? dx : h.indexOf('w') >= 0 ? -dx : 0) * m;
      var hh = e.t === 'line' ? o.h : o.h + (h.indexOf('s') >= 0 ? dy : h.indexOf('n') >= 0 ? -dy : 0) * m;
      var sc = null;
      if (ev.shiftKey && h.length === 2 && o.h > 0) { sc = Math.max(1 / o.w, Math.max(w / o.w, hh / o.h)); w = o.w * sc; hh = o.h * sc; }   // Shift+모서리: 비율 유지
      w = Math.max(1, w); if (e.t !== 'line') hh = Math.max(1, hh);
      var x = cen ? o.x + (o.w - w) / 2 : (h.indexOf('w') >= 0 ? o.x + o.w - w : o.x);
      var y = cen ? o.y + (o.h - hh) / 2 : (h.indexOf('n') >= 0 ? o.y + o.h - hh : o.y);
      e.x = sp(x); e.y = sp(y); e.w = Math.max(1, sp(w)); if (e.t !== 'line') e.h = Math.max(1, sp(hh));
      if (sc && e.t === 'text' && o.size) { e.size = Math.max(4, Math.min(300, AW.round(o.size * sc, 1))); var dn = domOf(e); if (dn) dn.style.fontSize = e.size * 25.4 / 72 * st.zoom + 'px'; }   // 글상자는 글자 크기도 함께 확대
      liveUpdate();
    }
  }
  // 스마트 가이드: 용지·다른 요소의 왼쪽/가운데/오른쪽(위/중간/아래)에 1.2mm 이내로 다가가면 달라붙고 분홍 선을 표시
  function smartGuides(e) {
    AW.$$('.snapg', st.ov).forEach(function (g) { g.remove(); });
    if (!e) return; var pg = T().page, k = st.zoom, TH = st.cfg.th || 1.2, others = T().elems.filter(function (o) { return o.id !== e.id && S.sel.indexOf(o.id) < 0; });
    function best(lines, targets) { var r = null; lines.forEach(function (l) { targets.forEach(function (t) { var d = t - l; if (Math.abs(d) < TH && (!r || Math.abs(d) < Math.abs(r.d))) r = { d: d, at: t }; }); }); return r; }
    var tx = [0, pg.w / 2, pg.w], ty = [0, pg.h / 2, pg.h];
    others.forEach(function (o) { tx.push(o.x, o.x + o.w / 2, o.x + o.w); ty.push(o.y, o.y + o.h / 2, o.y + o.h); });
    var gd = T().page.guides; if (gd && st.cfg.gshow !== false) { (gd.v || []).forEach(function (v) { tx.push(v); }); (gd.h || []).forEach(function (h) { ty.push(h); }); }
    var rx = best([e.x, e.x + e.w / 2, e.x + e.w], tx), ry = best([e.y, e.y + e.h / 2, e.y + e.h], ty);
    if (rx) { e.x = AW.round(e.x + rx.d, 2); var g = document.createElement('div'); g.className = 'snapg gv'; g.style.left = rx.at * k + 'px'; st.ov.appendChild(g); }
    if (ry) { e.y = AW.round(e.y + ry.d, 2); var g2 = document.createElement('div'); g2.className = 'snapg gh'; g2.style.top = ry.at * k + 'px'; st.ov.appendChild(g2); }
  }
  function onUp() {
    var d = st.drag; if (!d) return; st.drag = null;
    AW.$$('.snapg,.mq,.gl.prev', st.ov || document).forEach(function (g) { g.remove(); });
    if (d.mode === 'rot') { if (d.moved) { E.refreshElems(); changed('elems'); } return; }
    if (d.mode === 'gnew' || d.mode === 'gmv') {
      var lim2 = d.ax === 'v' ? T().page.w : T().page.h, g = guides();
      if (d.mode === 'gnew') { if (d.moved && d.pos != null && d.pos >= 0 && d.pos <= lim2) { g[d.ax].push(d.pos); changed('page'); } }
      else if (d.moved) { if (d.pos < 0 || d.pos > lim2) g[d.ax].splice(d.i, 1); changed('page'); }
      markSel(); return;
    }
    if (d.mode === 'mq') { AW.emit('selchange'); return; }
    if (d.mode === 'rs' || d.moved) { E.refreshElems(); changed('elems'); }
    if (st.pending) { st.pending = false; E.relayout(); }
  }

  /* ───────────── 인라인 편집 ───────────── */
  function onDbl(ev) {
    var n = ev.target.closest('.el-text'); if (!n) return;
    var e = AW.get(n.dataset.id); if (!e || e.lock) return;
    if (e.grp && S.sel.length > 1) { S.sel = [e.id]; markSel(); updTools(); AW.emit('selchange'); return; }   // 그룹 안에서 더블클릭: 이 요소만 선택
    E.setSel([e.id]); beginEdit(e, n);
  }
  function beginEdit(e, node) {
    var b = node.firstChild; b.textContent = e[tk()] || ''; b.style.outline = '2px solid #0EA5E9'; b.style.cursor = 'text'; b.style.background = 'rgba(255,255,255,.85)';
    try { b.contentEditable = 'plaintext-only'; } catch (x) {} if (b.contentEditable !== 'plaintext-only') b.contentEditable = 'true';
    st.editing = { id: e.id, node: b };
    b.addEventListener('blur', function () { if (st.editing && st.editing.node === b) endEdit(); }, { once: true });
    b.focus();
    var r = document.createRange(); r.selectNodeContents(b); r.collapse(false); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    b.addEventListener('keydown', function kd(k) { if (k.key === 'Escape') { b.removeEventListener('keydown', kd); endEdit(); } k.stopPropagation(); });
  }
  function endEdit() {
    var ed = st.editing; if (!ed) return; st.editing = null;
    var e = AW.get(ed.id); if (e) { var t = ed.node.innerText.replace(/ /g, ' ').replace(/\n$/, ''); if (t !== (e[tk()] || '')) { e[tk()] = t; changed('elems'); } }
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
    if (mod && (k === ']' || k === '[')) { ev.preventDefault(); return ev.shiftKey ? order(k === ']') : orderStep(k === ']' ? 1 : -1); }
    if (ev.altKey && !mod && ev.code === 'KeyR') { ev.preventDefault(); return act('ruler'); }
    if (ev.altKey && !mod && ev.code === 'KeyG') { ev.preventDefault(); return act('gridshow'); }
    if (mod && k === 'g') { ev.preventDefault(); return grouping(!ev.shiftKey); }
    if (mod && k === 'd') { ev.preventDefault(); return dup(); }
    if (mod && k === 'a' && st.stage.contains(document.activeElement)) { ev.preventDefault(); return E.setSel(T().elems.map(function (e) { return e.id; })); }
    if (mod && ev.altKey && k === 'c') { ev.preventDefault(); return copyStyle(); }
    if (mod && ev.altKey && k === 'v') { ev.preventDefault(); return pasteStyle(); }
    if (mod && ev.shiftKey && k === 'v' && st.clip && st.clip.length) { ev.preventDefault(); return pasteClip(null, true); }
    if (k === 'tab' && T().elems.length) { ev.preventDefault(); var ids3 = T().elems.map(function (e) { return e.id; }), ci = ids3.indexOf(S.sel[S.sel.length - 1]); return E.setSel([ids3[(ci + (ev.shiftKey ? -1 : 1) + ids3.length) % ids3.length]]); }
    if (mod && k === 'c') { if (sel().length) st.clip = sel().map(AW.clone); return; }
    if (mod && k === 'x') { if (sel().length) { ev.preventDefault(); st.clip = sel().map(AW.clone); return del(); } return; }
    if (mod && k === 'v' && st.clip && st.clip.length) {
      ev.preventDefault(); return pasteClip(null);
    }
    if (!S.sel.length) return;
    if (k === 'delete' || k === 'backspace') { ev.preventDefault(); return del(); }
    if (k === 'escape') return E.setSel([]);
    var step = ev.shiftKey ? st.cfg.big : st.cfg.nudge, dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0, dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
    if (dx || dy) { ev.preventDefault(); sel().forEach(function (e) { if (!e.lock) { e.x = AW.round(e.x + dx, 2); e.y = AW.round(e.y + dy, 2); } }); liveUpdate(); debCommit(); }
    if (k === 'enter' && sel().length === 1 && sel()[0].t === 'text') { ev.preventDefault(); var d = domOf(sel()[0]); if (d) beginEdit(sel()[0], d); }
  }
  function onPasteDoc(ev) {                  // 외부에서 복사한 글/이미지를 새 요소로 붙여넣기 (내부 복사본이 없을 때)
    if (!st.root || !st.root.offsetParent || !T() || (st.clip && st.clip.length)) return;
    var tg = ev.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    var cd = ev.clipboardData; if (!cd) return;
    var f = Array.prototype.filter.call(cd.files || [], function (x) { return /^image\//.test(x.type); })[0];
    if (f) { ev.preventDefault(); readImage(f, 700, 'image/png').then(function (r) { var w = 40; add(AW.elem('img', { src: r.url, w: w, h: AW.round(w * r.h / r.w, 1), x: AW.round((T().page.w - w) / 2, 1), y: AW.round(T().page.h * 0.4, 1) })); }); return; }
    var t = cd.getData('text'); if (t && t.trim()) { ev.preventDefault(); var w2 = Math.min(120, T().page.w * 0.6); add(AW.elem('text', { text: t.replace(/\r/g, '').slice(0, 2000), w: w2, h: 14, x: AW.round((T().page.w - w2) / 2, 1), y: AW.round(T().page.h * 0.4, 1), size: 20 })); }
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
      T().bg = r.url; T().bgName = file.name; T().page = keepPage(pg);
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
        T().page = keepPage({ w: p.h, h: p.w, paper: p.paper, orient: p.h >= p.w ? 'L' : 'P' });
        E.render(); changed('bg'); res();
      };
      im.src = T().bg;
    });
  };
  function rotateImg(src, dir) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () {
        var c = document.createElement('canvas'), w = im.naturalWidth, h = im.naturalHeight; c.width = h; c.height = w;
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, h, w);
        if (dir > 0) { g.translate(h, 0); g.rotate(Math.PI / 2); } else { g.translate(0, w); g.rotate(-Math.PI / 2); }
        g.drawImage(im, 0, 0); res(c.toDataURL('image/jpeg', 0.9));
      };
      im.src = src;
    });
  }
  // 가로↔세로 전환. o.bg: 'r' 배경 오른쪽 회전 | 'l' 왼쪽 회전 | 'keep' 배경 유지(늘어남), o.move: 글상자 위치·크기를 새 용지 비율로 이동
  E.setOrient = function (o) {
    var p = T().page, W = p.w, H = p.h, nw = H, nh = W, sx = nw / W, sy = nh / H;
    var go = function (bg) {
      if (o.move) T().elems.forEach(function (e) { e.x = AW.round(e.x * sx, 2); e.y = AW.round(e.y * sy, 2); e.w = AW.round(e.w * sx, 2); if (e.t !== 'line') e.h = AW.round(e.h * sy, 2); });
      T().page = keepPage({ w: nw, h: nh, paper: p.paper, orient: nw >= nh ? 'L' : 'P' });
      if (bg) T().bg = bg;
      S.sel = []; E.render(); changed(bg ? 'bg' : 'page');
    };
    if (T().bg && (o.bg === 'r' || o.bg === 'l')) return rotateImg(T().bg, o.bg === 'r' ? 1 : -1).then(go);
    go(null); return Promise.resolve();
  };
  E.orientDialog = function () {
    var p = T().page, toL = p.w < p.h, hasBg = !!T().bg;
    AW.modal({
      title: (toL ? '가로' : '세로') + '로 전환',
      body: '<p style="margin-top:0">현재 <b>' + (toL ? '세로' : '가로') + '</b> ' + p.w + '×' + p.h + 'mm 용지를 <b>' + (toL ? '가로' : '세로') + '</b> ' + p.h + '×' + p.w + 'mm 로 바꿉니다.</p>' +
        (hasBg ? '<label class="f">배경 양식</label><div class="radios"><label><input type="radio" name="or-bg" value="r" checked> 배경도 함께 오른쪽 90° 회전 (권장)</label><label><input type="radio" name="or-bg" value="l"> 배경도 함께 왼쪽 90° 회전</label><label><input type="radio" name="or-bg" value="keep"> 배경은 그대로 (새 용지에 맞춰 늘어남)</label></div>' : '') +
        '<div class="radios" style="margin-top:12px"><label><input type="checkbox" id="or-mv" checked> 글상자 위치·크기도 새 용지 비율에 맞춰 이동</label></div>' +
        '<p class="muted" style="margin-bottom:0">전환 후에도 실행 취소(Ctrl+Z)로 되돌릴 수 있습니다.</p>',
      actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '전환', cls: 'btn-primary', onClick: function (c) {
        var r = AW.$('input[name="or-bg"]:checked'), mv = AW.$('#or-mv').checked; c(); E.setOrient({ bg: r ? r.value : 'keep', move: mv });
      } }]
    });
  };

  /* ───────────── 오른쪽 클릭 메뉴 ───────────── */
  function closeCtx() { AW.$$('.ctx').forEach(function (n) { n.remove(); }); document.removeEventListener('pointerdown', ctxOut, true); document.removeEventListener('keydown', ctxKey, true); window.removeEventListener('blur', closeCtx); window.removeEventListener('resize', closeCtx); st.stage && st.stage.removeEventListener('scroll', closeCtx); }
  function ctxOut(e) { if (!e.target.closest('.ctx')) closeCtx(); }
  function ctxKey(e) {
    var cur = document.activeElement, menu = (cur && cur.closest && cur.closest('.ctx')) || AW.$('.ctx');
    if (!menu) return;
    var bs = AW.$$('button:not(:disabled)', menu).filter(function (b) { return b.closest('.ctx') === menu; }), i = bs.indexOf(cur);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCtx(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); (bs[i + 1] || bs[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (bs[i - 1] || bs[bs.length - 1]).focus(); }
    else if (e.key === 'ArrowRight' && cur && cur._sub) { e.preventDefault(); openSub(cur, cur._sub, true); }
    else if (e.key === 'ArrowLeft' && menu._from) { e.preventDefault(); var f = menu._from; closeSubs(f.closest('.ctx')); f.focus(); }
  }
  function onCtx(ev) {
    if (!T() || !st.pg) return;
    var pg = T().page, pos = toMM(ev); pos = { x: AW.round(Math.max(0, Math.min(pg.w, pos.x)), 1), y: AW.round(Math.max(0, Math.min(pg.h, pos.y)), 1) };
    if (st.editing && st.editing.node.contains(ev.target)) {            // 글 편집 중: 선택 문구 번역·복사 메뉴
      ev.preventDefault(); var nd = st.editing.node, sl = window.getSelection(), rg = sl.rangeCount ? sl.getRangeAt(0) : null, txt = rg ? rg.toString() : '';
      var off = null; if (rg && txt) { var pre = rg.cloneRange(); pre.selectNodeContents(nd); pre.setEnd(rg.startContainer, rg.startOffset); off = [pre.toString().length, pre.toString().length + txt.length]; }
      var eid = st.editing.id, hasT = !!txt.trim();
      var tr = function () { var base = nd.innerText.replace(/ /g, ' ').replace(/\n$/, ''); endEdit(); var e = AW.get(eid); if (!e) return; e.text = base; AW.AI.translateText({ text: base.slice(off[0], off[1]), elemId: eid, apply: function (v) { e.text = base.slice(0, off[0]) + v + base.slice(off[1]); E.refreshElems(); changed('elems'); } }); };
      var I2 = function (label, ic, a, o) { return Object.assign({ k: 'i', label: label, ic: ic, fn: a }, o || {}); };
      openCtx(ev.clientX, ev.clientY, [I2('선택 문구 영문으로 바꾸기 (AI)…', 'sparkle', tr, { disabled: !hasT }), I2('상자 전체 영문으로 바꾸기 (AI)…', 'sparkle', function () { var e = AW.get(eid); endEdit(); if (e) act('tr-sel'); }), { k: 'sep' },
        I2('잘라내기', 'cut', function () { nd.focus(); document.execCommand('cut'); }, { disabled: !hasT }), I2('복사', 'copy', function () { nd.focus(); document.execCommand('copy'); }, { disabled: !hasT }),
        I2('붙여넣기', 'paste', function () { nd.focus(); if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { document.execCommand('insertText', false, t); }).catch(function () { AW.toast('붙여넣기는 Ctrl+V 를 사용해 주십시오.'); }); })]);
      return;
    }
    ev.preventDefault(); endEdit();
    var elNode = ev.target.closest('.el'), onHd = !elNode && !!ev.target.closest('.hd') && S.sel.length > 0;   // 선택 핸들 위에서도 요소 메뉴
    if (elNode) { var id = elNode.dataset.id; if (S.sel.indexOf(id) < 0) E.setSel([id]); } else if (!onHd) E.setSel([]);
    st.at = (elNode || onHd) ? null : pos;
    openCtx(ev.clientX, ev.clientY, buildCtx(!!elNode || onHd));
  }
  function buildCtx(onEl) {
    var list = sel(), one = list.length === 1 ? list[0] : null, tx = list.filter(function (e) { return e.t === 'text'; }), t1 = tx[0], it = [], hasClip = !!(st.clip && st.clip.length);
    var I = function (label, ic, key, a, o) { return Object.assign({ k: 'i', label: label, ic: ic, key: key, a: a }, o || {}); };
    var SUB = function (label, ic, arr) { return { k: 'i', label: label, ic: ic, sub: arr }; };
    var STRIP = function (label, arr) { return { k: 's', label: label, arr: arr }; };
    var B = function (ic, tip, a, on) { return { ic: ic, tip: tip, a: a, on: on }; };
    var AI = SUB('영문 번역 (AI)', 'sparkle', [].concat(one && one.t === 'text' ? [I('이 글상자 영문으로 바꾸기…', 'sparkle', '', 'tr-sel')] : [], [I('시안 전체 영문 번역본 만들기…', 'sparkle', '', 'tr-doc'), I('번역 용어집(직급·학과)…', 'edit', '', 'gloss'), I('AI 연결 테스트', 'check', '', 'ai-test')]));
    var LANGM = SUB('언어 (한글·영문·한영)', 'text', [I('한글 보기·편집', 'text', '', 'lang-ko', { on: LG() === 'ko' }), I('영문 보기·편집', 'text', '', 'lang-en', { on: LG() === 'en' }), I('한영 병기 보기', 'text', '', 'lang-both', { on: LG() === 'both' }), { k: 'sep' }, I('영문 크기·병기 순서 설정…', 'cols', '', 'langcfg')]);
    var VIEW = SUB('보기', 'eye', [I('눈금자 보기', 'cols', 'Alt+R', 'ruler', { on: !!st.cfg.ruler }), I('격자선 보기', 'grid', 'Alt+G', 'gridshow', { on: !!st.cfg.show }), I('안내선 보기', 'line', '', 'gshow', { on: st.cfg.gshow !== false }), I('안내선 모두 지우기', 'trash', '', 'gclear'), { k: 'sep' }, I('확대', 'zoomIn', 'Ctrl+휠', 'zin'), I('축소', 'zoomOut', 'Ctrl+휠', 'zout'), I('창에 맞춤', 'fit', '', 'zfit'), I('격자 자석 ' + (st.cfg.snap ? '끄기' : '켜기'), 'grid', '', 'snap'), I('격자·자석·이동 간격 설정…', 'cols', '', 'gridcfg'), I('레이어 창 열기/닫기', 'layers', '', 'layers'), I('단축키·마우스 조합 안내', 'info', '', 'keys')]);
    var EDIT = function (extra) { return SUB('편집', 'edit', (extra || []).concat([I('실행 취소', 'undo', 'Ctrl+Z', 'undo', { disabled: st.hi <= 0 }), I('다시 실행', 'redo', 'Ctrl+Y', 'redo', { disabled: st.hi >= st.hist.length - 1 }), I('붙여넣기', 'paste', 'Ctrl+V', 'paste', { disabled: !hasClip }), I('제자리에 붙여넣기', 'paste', 'Ctrl+Shift+V', 'pinplace', { disabled: !hasClip }), I('모두 선택', 'sel', 'Ctrl+A', 'selall', { disabled: !T().elems.length })])); };
    if (onEl && list.length) {
      if (one && one.t === 'text') it.push(I('글 직접 편집', 'edit', 'Enter', 'edit', { disabled: one.lock }));
      it.push(AI, LANGM, { k: 'sep' }, I('잘라내기', 'cut', 'Ctrl+X', 'cut'), I('복사', 'copy', 'Ctrl+C', 'copy'), I('붙여넣기', 'paste', 'Ctrl+V', 'paste', { disabled: !hasClip }), I('복제', 'copy', 'Ctrl+D', 'dup'), I('삭제', 'trash', 'Del', 'del'), { k: 'sep' });
      it.push(EDIT([I('제자리에 붙여넣기 이외…', 'copy', '', 'dup')].slice(0, 0).concat([I('서식 복사', 'wand', 'Ctrl+Alt+C', 'cstyle'), I('서식 붙여넣기', 'wand', 'Ctrl+Alt+V', 'pstyle', { disabled: !st.sty })], tx.length ? [I('아래에 줄 추가', 'plus', '', 'addline')] : [])));
      var al = [STRIP(list.length > 1 ? '정렬(선택 기준)' : '정렬(용지 기준)', [B('gL', '왼쪽', 'ag-l'), B('gCH', '가로 가운데', 'ag-ch'), B('gR', '오른쪽', 'ag-r'), B('gT', '위', 'ag-t'), B('gCV', '세로 가운데', 'ag-cv'), B('gB', '아래', 'ag-b')])];
      if (list.length >= 2) al.push(I('가로 크기 같게(첫 선택 기준)', 'dH', '', 'same-w'), I('세로 크기 같게', 'dV', '', 'same-h'), I('가로·세로 크기 같게', 'rect', '', 'same-wh'));
      if (list.length >= 3) al.push(I('가로 간격 같게', 'dH', '', 'dist-h'), I('세로 간격 같게', 'dV', '', 'dist-v'));
      it.push(SUB('정렬 · 크기 맞춤', 'gCH', al));
      var allLk = list.every(function (e) { return e.lock; }), allHd = list.every(function (e) { return e.hide; });
      it.push(SUB('순서 · 잠금 · 표시', 'layers', [I('맨 앞으로', 'front', 'Ctrl+Shift+]', 'front'), I('앞으로 한 칸', 'chevU', 'Ctrl+]', 'fwd'), I('뒤로 한 칸', 'chevD', 'Ctrl+[', 'bwd'), I('맨 뒤로', 'back', 'Ctrl+Shift+[', 'back'), { k: 'sep' }, I(allLk ? '잠금 해제' : '잠금(이동·크기 고정)', allLk ? 'unlock' : 'lock', '', 'lock'), I(allHd ? '보이기' : '숨기기', 'eye', '', 'hide'), I('인쇄에서 제외 (화면 안내용)', 'print', '', 'noprint', { on: list.every(function (e) { return e.noprint; }) })]));
      it.push(SUB('회전 · 반전', 'rotate', [I('왼쪽 90° 회전', 'undo', '', 'rot-l'), I('오른쪽 90° 회전', 'redo', '', 'rot-r'), I('180° 회전', 'rotate', '', 'rot-180'), { k: 'sep' }, I('좌우 대칭 (좌우 반전)', 'gCH', '', 'flip-x'), I('상하 대칭 (상하 반전)', 'gCV', '', 'flip-y'), { k: 'sep' }, I('회전 초기화', 'close', '', 'rot-0')]));
      it.push(I('그룹 만들기', 'layers', 'Ctrl+G', 'group', { disabled: list.length < 2 }), I('그룹 해제', 'layers', 'Ctrl+Shift+G', 'ungroup', { disabled: !list.some(function (e) { return e.grp; }) }));
      it.push(SUB('이동', 'plus', [I('위로 (작게)', 'chevU', '↑', 'nu'), I('아래로 (작게)', 'chevD', '↓', 'nd'), I('왼쪽으로 (작게)', 'chevL', '←', 'nl'), I('오른쪽으로 (작게)', 'chevR', '→', 'nr'), { k: 'sep' }, I('위로 (크게)', 'chevU', 'Shift+↑', 'Nu'), I('아래로 (크게)', 'chevD', 'Shift+↓', 'Nd'), I('왼쪽으로 (크게)', 'chevL', 'Shift+←', 'Nl'), I('오른쪽으로 (크게)', 'chevR', 'Shift+→', 'Nr')]));
      if (tx.length) {
        it.push(SUB('서식', 'text', [STRIP('글자', [B('bold', '굵게', 'bold', t1.bold), B('italic', '기울임', 'italic', t1.italic), B('underline', '밑줄', 'ul', t1.ul), B('alL', '왼쪽 정렬', 'al-l', t1.align === 'left'), B('alC', '가운데 정렬', 'al-c', t1.align === 'center'), B('alR', '오른쪽 정렬', 'al-r', t1.align === 'right')]),
          STRIP('세로·크기', [B('vT', '위쪽', 'v-t', t1.valign === 'top'), B('vM', '가운데', 'v-m', t1.valign === 'middle'), B('vB', '아래쪽', 'v-b', t1.valign === 'bottom'), B('plus', '글자 크게', 'sz+'), B('minus', '글자 작게', 'sz-')]),
          I('글자 자동 맞춤', 'fit', '', 'fit', { on: !!t1.fit }), I('서식 복사', 'wand', 'Ctrl+Alt+C', 'cstyle'), I('서식 붙여넣기', 'wand', 'Ctrl+Alt+V', 'pstyle', { disabled: !st.sty })]));
        if (one) it.push(I('입력 항목 {{ }} 삽입…', 'field', '', 'add-field'));
      }
    } else {
      it.push(SUB('추가', 'plus', [I('여기에 글상자 추가', 'text', '', 'add-text'), I('여기에 입력 항목 추가…', 'field', '', 'add-field'), I('선 추가', 'line', '', 'add-line'), I('사각형 추가', 'rect', '', 'add-rect'), I('이미지 추가…', 'image', '', 'add-img'), I('위조 방지 인증 QR 추가', 'qr', '', 'add-qr')]), EDIT(), VIEW, LANGM,
        SUB('용지', 'page', [I((T().page.w >= T().page.h ? '세로' : '가로') + '로 전환…', 'rotate', '', 'orient'), I('용지·배경 설정…', 'page', '', 'page'), I('기본 상장 배치 넣기', 'wand', '', 'starter')]), AI);
    }
    return it;
  }
  function closeSubs(menu) { if (menu && menu._open) { closeSubs(menu._open); menu._open.remove(); menu._open = null; } }
  function openSub(btn, sub, focus) {
    var parent = btn.closest('.ctx'); if (parent._open && parent._open._from === btn) { if (focus) { var f0 = AW.$('button:not(:disabled)', parent._open); f0 && f0.focus(); } return; }
    closeSubs(parent); var m = mkMenu(sub); m._from = btn; document.body.appendChild(m); parent._open = m;
    var r = btn.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    m.style.left = (r.right + 2 + w > vw ? Math.max(4, r.left - w - 2) : r.right + 2) + 'px'; m.style.top = Math.max(4, Math.min(r.top - 6, vh - h - 4)) + 'px';
    if (focus) { var f = AW.$('button:not(:disabled)', m); f && f.focus({ preventScroll: true }); }
  }
  function mkMenu(items) {
    var m = document.createElement('div'); m.className = 'ctx'; m.setAttribute('role', 'menu');
    var run = function (a, fn) { var at = st.at; closeCtx(); st.at = at; setTimeout(function () { if (fn) fn(); else if (a === 'fit') { var t = sel().filter(function (e) { return e.t === 'text'; }); if (t.length) setProp('fit', !t[0].fit); } else act(a); }, 0); };
    items.forEach(function (o) {
      if (o.k === 'sep') { var s = document.createElement('div'); s.className = 'cs'; m.appendChild(s); return; }
      if (o.k === 's') {
        var r = document.createElement('div'); r.className = 'cstrip'; r.innerHTML = '<span class="cl">' + AW.esc(o.label) + '</span>';
        o.arr.forEach(function (b) { var bt = document.createElement('button'); bt.type = 'button'; bt.className = 'tb' + (b.on ? ' on' : ''); bt.title = b.tip; bt.setAttribute('aria-label', b.tip); bt.innerHTML = AW.ic(b.ic, 16); bt.onmouseenter = function () { closeSubs(m); }; bt.onclick = function () { run(b.a); }; r.appendChild(bt); });
        m.appendChild(r); return;
      }
      var b2 = document.createElement('button'); b2.type = 'button'; b2.className = 'ci' + (o.on ? ' on' : ''); b2.setAttribute('role', 'menuitem'); b2.disabled = !!o.disabled;
      b2.innerHTML = '<span class="cic">' + AW.ic(o.ic, 16) + '</span><span>' + AW.esc(o.label) + '</span>' + (o.sub ? '<span class="k">' + AW.ic('chevR', 14) + '</span>' : o.on ? '<span class="k">' + AW.ic('check', 14) + '</span>' : o.key ? '<span class="k">' + AW.esc(o.key) + '</span>' : '');
      if (o.sub) { b2._sub = o.sub; b2.onmouseenter = function () { openSub(b2, o.sub); }; b2.onclick = function () { openSub(b2, o.sub, true); }; }
      else { b2.onmouseenter = function () { closeSubs(m); }; b2.onclick = function () { run(o.a, o.fn); }; }
      m.appendChild(b2);
    });
    return m;
  }
  function openCtx(x, y, items) {
    closeCtx(); var m = mkMenu(items); document.body.appendChild(m);
    var w = m.offsetWidth, h = m.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    m.style.left = Math.max(4, Math.min(x, vw - w - 4)) + 'px'; m.style.top = Math.max(4, Math.min(y, vh - h - 4)) + 'px';
    document.addEventListener('pointerdown', ctxOut, true); document.addEventListener('keydown', ctxKey, true);
    window.addEventListener('blur', closeCtx); window.addEventListener('resize', closeCtx); st.stage.addEventListener('scroll', closeCtx);
    var f = AW.$('button:not(:disabled)', m); if (f) f.focus({ preventScroll: true });
  }

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
          T().page = keepPage({ w: w, h: h, paper: pp, orient: w >= h ? 'L' : 'P' }); E.render(); changed('page');
        }
        function sync() { var q = T().page; AW.$('#pd-w', el).value = q.w; AW.$('#pd-h', el).value = q.h; AW.$('#pd-or', el).value = q.w >= q.h ? 'L' : 'P'; }
        var rl = AW.$('#pd-rl', el), rr = AW.$('#pd-rr', el);
        if (rl) rl.onclick = function () { E.rotateBg(-1).then(sync); }; if (rr) rr.onclick = function () { E.rotateBg(1).then(sync); };
        AW.$('#pd-paper', el).onchange = function () { apply('p'); }; AW.$('#pd-or', el).onchange = function () { apply('o'); };
        AW.$('#pd-w', el).oninput = function () { apply('wh'); }; AW.$('#pd-h', el).oninput = function () { apply('wh'); };
      }
    });
  };

  E.act = function (a) { act(a); };
  E.menuAt = function (x, y, items) { openCtx(x, y, items); };
  E.getStage = function () { return st.stage; };
  E.relayout = function () {
    if (!st.fit || !T() || !st.pg) return;
    if (st.editing || st.drag) { st.pending = true; return; }
    if (Math.abs(fitScale() - st.zoom) > 0.02) E.render();
  };
})();
