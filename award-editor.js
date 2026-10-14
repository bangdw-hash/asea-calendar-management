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
  var st = { bgs: [], hist: [], hl: [], ratio: true, cfg: Object.assign({}, CFG0, AW.lsGet('award_ed_cfg', {})), sty: null, zoom: 0, fit: true, hist: [], hi: -1, root: null, stage: null, pg: null, ov: null, drag: null, editing: null, clip: null };

  function T() { return S.tpl; }
  function LG() { return (T().page && T().page.lang) || 'ko'; }
  function tk() { return LG() === 'en' ? 'en' : 'text'; }          // 편집 중인 언어의 글 필드
  function keepPage(np) { return Object.assign({}, T().page, np); }   // 용지 크기를 바꿀 때 언어·번호 규칙·안내선 유지
  function sel() { return S.sel.map(AW.get).filter(Boolean); }
  function scale() { return st.zoom || K1; }
  var KL = { elems: '요소 편집', bg: '배경 변경', page: '용지 변경' };
  function changed(kind, noHist, label) { if (!noHist) pushHist(label || KL[kind]); S.dirty = true; if (kind === 'bg') S.bgDirty = true; AW.emit('tplchange', kind); }

  /* ───────────── 실행 취소 (요소·용지·배경 포함) ───────────── */
  function bgRef() { var b = T().bg; if (!b) return -1; var i = st.bgs.indexOf(b); if (i < 0) { st.bgs.push(b); i = st.bgs.length - 1; } return i; }   // 배경 이미지는 참조 번호만 기록
  function snap() { return JSON.stringify({ e: T().elems, p: T().page, b: bgRef(), bn: T().bgName || '' }); }
  function pushHist(label) {
    var s = snap(); if (st.hist[st.hi] === s) return;
    st.hist = st.hist.slice(0, st.hi + 1); st.hl = st.hl.slice(0, st.hi + 1); st.hist.push(s); st.hl.push(label || st.lbl || '편집'); st.lbl = null;
    if (st.hist.length > 50) { st.hist.shift(); st.hl.shift(); } st.hi = st.hist.length - 1; updUndo();
  }
  E.getHist = function () { return { hist: st.hist.slice(), hl: st.hl.slice(), bgs: st.bgs.slice(), hi: st.hi }; };
  E.setHist = function (h) { st.hist = h.hist.slice(); st.hl = h.hl.slice(); st.bgs = h.bgs.slice(); st.hi = h.hi; updUndo(); };
  E.resetHist = function () { st.hist = []; st.hl = []; st.bgs = []; st.hi = -1; pushHist('시작'); };
  function jumpTo(i) {
    if (i < 0 || i >= st.hist.length) return;
    st.hi = i; var o = JSON.parse(st.hist[i]); T().elems = o.e; T().page = o.p;
    var nb = o.b >= 0 ? st.bgs[o.b] : null; if (nb !== T().bg) { T().bg = nb; T().bgName = o.bn || ''; S.bgDirty = true; }
    S.sel = S.sel.filter(function (id) { return AW.get(id); }); S.dirty = true; E.render(); AW.emit('tplchange', 'page'); updUndo();
  }
  function undo(dir) { jumpTo(st.hi + dir); }
  function updUndo() {
    var u = AW.$('[data-a="undo"]', st.root), r = AW.$('[data-a="redo"]', st.root); if (u) u.disabled = st.hi <= 0; if (r) r.disabled = st.hi >= st.hist.length - 1;
    var hu = document.getElementById('h-undo'), hr = document.getElementById('h-redo'); if (hu) hu.disabled = st.hi <= 0; if (hr) hr.disabled = st.hi >= st.hist.length - 1;
    if (AW.Side) AW.Side.update('hist');
  }
  E.histMenu = function (x, y) {
    var items = [], from = Math.max(0, st.hist.length - 15);
    for (var i = st.hist.length - 1; i >= from; i--) (function (i) { items.push({ k: 'i', label: (i + 1) + '. ' + st.hl[i], ic: 'history', on: i === st.hi, fn: function () { jumpTo(i); } }); })(i);
    items.push({ k: 'sep' }, { k: 'i', label: '마지막 저장 상태로 되돌리기…', ic: 'undo', fn: function () { AW.App.revertSaved(); } });
    openCtx(x, y, items);
  };
  E.hist = function () { return { labels: st.hl.slice(), idx: st.hi }; };
  E.jump = jumpTo;

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
        '<div class="tg">' + BTN('dist-h', 'dH', '가로 간격 같게(3개 이상)') + BTN('dist-v', 'dV', '세로 간격 같게(3개 이상)') + BTN('front', 'front', '맨 앞으로') + BTN('back', 'back', '맨 뒤로') + BTN('lock', 'lock', '선택 잠금/해제 (그룹은 그룹 전체)') + '<button class="tb tb-txt" data-a="lockall" title="모든 요소를 한 번에 잠금/해제">전체 잠금</button></div>' +
      '</div>' +
      '<div class="ed-main"><div class="ed-col"><div class="ed-stage" tabindex="0" aria-label="양식 편집 영역"><div class="ed-wrap"></div><div class="ed-hint"></div></div>' +
      '<div class="ed-text"><div class="muted"><b>선택한 글상자 내용</b> — <code>{{항목명}}</code>을 쓰면 엑셀 데이터가 들어갑니다. 상자를 더블클릭하면 화면에서 바로 입력할 수 있습니다.</div><textarea class="in" data-p="text" rows="2" disabled placeholder="글상자를 선택하면 여기에서도 내용을 고칠 수 있습니다."></textarea></div>' +
      '</div><aside class="ed-side"><div class="side-panel" id="side-panel"></div><nav class="side-rail" id="side-rail" aria-label="편집 패널"></nav></aside></div>' +
      '<input type="file" class="hide" data-f="img" accept="image/*,application/pdf"><input type="file" class="hide" data-f="bg" accept="image/*,application/pdf">';
    st.stage = AW.$('.ed-stage', root);
    if (AW.Side) AW.Side.mount(root);
    bind();
    if (window.ResizeObserver) new ResizeObserver(AW.debounce(function () { E.relayout(); }, 80)).observe(st.stage);
  };

  function bind() {
    var root = st.root;
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b || b.disabled) return; st.at = null; act(b.dataset.a);
    });
    root.addEventListener('input', function (e) {
      var p = e.target.dataset.p, g = e.target.dataset.g2;
      if (p === 'size') return;   // 글자 크기는 입력이 끝난 뒤(Enter·칸 이동) 적용
      if (p) setProp(p, e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value, true);
      if (g) { var v = parseFloat(e.target.value); if (!isNaN(v)) { sel().forEach(function (el) { if ((g === 'w' || g === 'h') && st.ratio && (el.t === 'img' || el.t === 'qr') && el.w > 0 && el.h > 0) { var rt = el.w / el.h, v2 = Math.max(0.5, v); if (g === 'w') { el.w = AW.round(v2, 2); el.h = AW.round(v2 / rt, 2); } else { el.h = AW.round(v2, 2); el.w = AW.round(v2 * rt, 2); } } else el[g] = g === 'rot' ? normRot(v) : AW.round(g === 'w' || g === 'h' ? Math.max(0, v) : v, 2); }); if (g === 'rot') E.refreshElems(); else liveUpdate(); } }
    });
    root.addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset.p === 'size') { var v = parseFloat(t.value); if (isNaN(v)) return updTools(); setProp('size', Math.round(Math.max(4, Math.min(300, v)) * 2) / 2); return; }
      if (t.dataset.p || t.dataset.g2) { commitLive(); }
      if (t.dataset.f === 'img') pickImg(t);
      if (t.dataset.f === 'bg') { var f = t.files[0]; t.value = ''; if (f) E.loadBackgroundFile(f); }
    });
    root.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.dataset && (e.target.dataset.p === 'size' || e.target.dataset.g2)) { e.preventDefault(); e.target.blur(); } });
    st.stage.addEventListener('pointerdown', onDown);
    st.stage.addEventListener('dblclick', onDbl);
    st.stage.addEventListener('contextmenu', onCtx);
    st.stage.addEventListener('wheel', function (e) { if (!(e.ctrlKey || e.metaKey) || !T()) return; e.preventDefault(); st.fit = false; st.zoom = Math.max(1, Math.min(K1 * 3, scale() * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); E.render(); }, { passive: false });
    st.stage.addEventListener('dragover', function (e) { e.preventDefault(); });
    st.stage.addEventListener('drop', function (e) { e.preventDefault(); var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) addImageFile(f, st.pg ? toMM(e) : null, true); });   // 끌어다 놓은 파일은 개체로 삽입(배경은 안내 칩에서 선택)
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
    var la = AW.$('[data-a="lockall"]', st.root); if (la) { var allLk2 = T().elems.length && T().elems.every(function (e) { return e.lock; }); la.textContent = allLk2 ? '전체 해제' : '전체 잠금'; la.classList.toggle('on', !!allLk2); }
    var lk = AW.$('[data-a="lock"]', st.root); if (lk) { var all = list.length && list.every(function (e) { return e.lock; }); lk.classList.toggle('on', !!all); lk.innerHTML = AW.ic(all ? 'lock' : 'unlock', 17); }
    updPos(); updUndo(); if (AW.Side) AW.Side.update();
  }
  function expandGrp(ids) {
    var gs = {}; ids.forEach(function (id) { var e = AW.get(id); if (e && e.grp) gs[e.grp] = 1; });
    if (!Object.keys(gs).length) return ids;
    var out = ids.slice(); T().elems.forEach(function (e) { if (e.grp && gs[e.grp] && out.indexOf(e.id) < 0) out.push(e.id); }); return out;
  }
  E.setSel = function (ids, noRender) { S.sel = expandGrp(ids); markSel(); updTools(); AW.emit('selchange'); };

  /* ───────────── 속성 변경 ───────────── */
  E.fontSelects = function () {
    var a = AW.$('select[data-p="font"]', st.root), b = AW.$('select[data-p="fontEn"]', st.root); if (!a) return;
    a.innerHTML = AW.fontOptions(); b.innerHTML = AW.fontOptions('영문: 한글과 같음'); updTools();
  };
  function setProp(p, v, live) {
    if ((p === 'font' || p === 'fontEn') && v) AW.ensureFont(v).then(function (n) { if (n) { E.refreshElems(); AW.Preview.render(); } });
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
  var LBLS = { 'add-text': '글상자 추가', 'add-line': '선 추가', 'add-rect': '사각형 추가', 'add-qr': 'QR 추가', dup: '복제', del: '삭제', addline: '줄 추가', paste: '붙여넣기', cut: '잘라내기', pinplace: '제자리 붙여넣기', front: '맨 앞으로', back: '맨 뒤로', fwd: '앞으로 한 칸', bwd: '뒤로 한 칸', lock: '잠금 전환', hide: '표시 전환', noprint: '인쇄 제외 전환', group: '그룹', ungroup: '그룹 해제', bold: '굵게', italic: '기울임', ul: '밑줄', 'sz+': '글자 크게', 'sz-': '글자 작게', starter: '기본 배치', 'rot-l': '회전', 'rot-r': '회전', 'rot-180': '회전', 'flip-x': '좌우 반전', 'flip-y': '상하 반전', 'rot-0': '회전 초기화', cstyle: '서식 복사', pstyle: '서식 붙여넣기' };
  function act(a) {
    var list = sel(), tx = list.filter(function (e) { return e.t === 'text'; });
    var T1 = function (p, v) { setProp(p, v); };
    st.lbl = LBLS[a] || null;
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
      case 'layers': return AW.Side && AW.Side.open('layers');
      case 'side-props': return AW.Side && AW.Side.open('props'); case 'side-color': return AW.Side && AW.Side.open('color'); case 'side-hist': return AW.Side && AW.Side.open('hist');
      case 'ratio': st.ratio = !st.ratio; if (AW.Side) AW.Side.update('props'); return;
      case 'origsize': var oi = false; list.forEach(function (e) { if (e.t === 'img' && e.nat) { e.w = e.nat.w; e.h = e.nat.h; oi = true; } }); if (!oi) return AW.toast('원본 크기 정보가 있는 이미지를 선택해 주십시오.'); E.refreshElems(); return changed('elems', false, '이미지 원본 크기');
      case 'bg-toggle': T().page.bgHide = !T().page.bgHide; E.render(); return changed('page', false, T().page.bgHide ? '배경 숨기기' : '배경 보이기');
      case 'bg-del': if (!T().bg) return; T().bg = null; T().bgName = ''; S.bgDirty = true; E.render(); return changed('bg', false, '배경 삭제');
      case 'bg-replace': return AW.$('[data-f="bg"]', st.root).click();
      case 'bg-lib': return E.bgLibDialog(); case 'bg-reg': return E.bgRegister();
      case 'lockall': var allL = T().elems.length && T().elems.every(function (e) { return e.lock; }); T().elems.forEach(function (e) { e.lock = !allL; }); E.refreshElems(); changed('elems', false, allL ? '전체 잠금 해제' : '전체 잠금'); return AW.toast(allL ? '모든 요소의 잠금을 풀었습니다.' : '모든 요소를 잠갔습니다. (이동·크기 조절·편집 불가)');
      case 'bg-rot-l': return E.rotateBg(-1); case 'bg-rot-r': return E.rotateBg(1);
      case 'mg-all': var tm = tx[0]; if (!tm) return; if (LG() === 'en') return AW.toast('한글 보기에서 지정해 주십시오.'); return mergeDialog({ text: tm.text || '', elemId: tm.id, key: 'text', whole: true });
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

  // ───── 메일머지: 문구를 드래그 → 우클릭 → 항목으로 만들기 ─────
  function suggestName(t) {
    t = String(t || '').trim(); var m = [[/^\d{4}\s*[.\-년]/, '수여일'], [/학과|과정|전공/, '소속'], [/상$|상장|표창/, '상명'], [/학교장|원장|총장|대표/, '수여자'], [/^제?\s*\d+\s*호?$/, '번호'], [/^[가-힣]{2,4}$/, '성명']];
    for (var i = 0; i < m.length; i++) if (m[i][0].test(t)) return m[i][1]; return '항목' + (AW.fieldNames().length + 1);
  }
  function sampleOf(name) { var f = T().fields.filter(function (x) { return x.name === name; })[0], r = T().rows[0]; return (r && r[name]) || (f && f.example) || name; }
  function mergeDialog(o) {   // o: {text, elemId, key, start, end, whole}
    var others = T().elems.filter(function (e) { return e.t === 'text' && e.id !== o.elemId && o.text && String(e[o.key] || '').indexOf(o.text) >= 0; }), have = AW.fieldNames();
    var chips = have.concat(['성명', '소속', '상명', '수여일', '번호', '내용']).filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 10);
    AW.modal({ title: '메일머지 항목으로 만들기',
      body: '<p style="margin-top:0">선택한 문구 <span class="box-ro" style="display:inline-block;padding:2px 8px">' + AW.esc(o.text.length > 40 ? o.text.slice(0, 40) + '…' : o.text) + '</span> 를 엑셀의 열 하나(바뀌는 값)로 지정합니다. 이 문구는 첫 번째 행의 예시 값으로 저장됩니다.</p>' +
        '<label class="f">항목명</label><input class="in" id="mg-n" maxlength="30" value="' + AW.esc(suggestName(o.text)) + '">' +
        '<div class="chips">' + chips.map(function (c) { return '<button type="button" class="chip' + (have.indexOf(c) >= 0 ? ' used' : '') + '" data-n="' + AW.esc(c) + '">' + AW.esc(c) + '</button>'; }).join('') + '</div>' +
        (others.length ? '<div class="radios"><label><input type="checkbox" id="mg-o" checked> 같은 문구가 있는 다른 글상자 <b>' + others.length + '</b>개도 함께 바꾸기</label></div>' : ''),
      actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '항목으로 만들기', cls: 'btn-primary', onClick: function (c) {
        var name = AW.$('#mg-n').value.replace(/[{}]/g, '').trim(); if (!name) return AW.toast('항목명을 입력해 주십시오.', 'error');
        var e = AW.get(o.elemId), key = o.key, tok = '{{' + name + '}}', all = AW.$('#mg-o') && AW.$('#mg-o').checked; c(); if (!e) return;
        var cur = e[key] || ''; e[key] = o.whole ? tok : cur.slice(0, o.start) + tok + cur.slice(o.end);
        if (all) others.forEach(function (x) { x[key] = String(x[key]).split(o.text).join(tok); });
        var made = !T().rows.length; if (made) { T().rows = [{}]; S.sampleOnly = true; } if (!T().rows[0][name]) T().rows[0][name] = o.text;   // 예시 행만 있는 상태는 「데이터 입력」 미완료로 봄
        AW.syncFields(); var f = T().fields.filter(function (x) { return x.name === name; })[0]; if (f && (have.indexOf(name) < 0 || !f.example)) { f.example = o.text; f.sample = o.text; }   // 편집창에서 고른 원문이 예시·형식 판독 기준 (추천 예시보다 우선)
        E.refreshElems(); changed('elems', false, '메일머지 항목 지정'); AW.emit('datachange'); AW.toast('「' + name + '」 항목으로 지정했습니다. 노란 표시가 바뀌는 자리입니다.', 'ok');
      } }],
      onOpen: function (el) { var i = AW.$('#mg-n', el); AW.$$('.chip', el).forEach(function (b) { b.onclick = function () { i.value = b.dataset.n; }; }); i.select(); i.addEventListener('keydown', function (k) { if (k.key === 'Enter') AW.$('.btn-primary', el).click(); }); } });
  }
  function unmergeText(src) { return String(src).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function (m, n) { return n.charAt(0) === '@' ? m : sampleOf(n); }); }

  function keysHelp() {
    var R = [['끌어서 이동', 'Shift: 가로·세로 한 방향 고정 / Alt: 복제하며 이동 / Ctrl: 자석(격자·가이드) 끄기'], ['크기 조절', '글상자는 글자 크기도 함께 비례 / Shift: 비율 유지 / Alt: 글자 크기 고정 / Ctrl: 중심 기준'], ['변 크기 조절', '글상자 폭·높이만 변경'], ['선택', '클릭 / Shift·Ctrl+클릭: 추가·해제 / 빈 곳 끌기: 범위 선택 / Ctrl+A: 전체'], ['화살표', '0.5mm 이동 (Shift: 5mm)'], ['Ctrl+C / X / V', '복사 / 잘라내기 / 붙여넣기'], ['Ctrl+D', '복제'], ['Ctrl+G / Ctrl+Shift+G', '그룹 만들기 / 해제 (그룹은 더블클릭하면 안의 요소만 선택)'], ['Alt+R', '눈금자 보기·숨기기 — 눈금자에서 끌어내면 안내선, 안내선을 눈금자로 끌어 넣으면 삭제'], ['Alt+G', '격자선 보기·숨기기 (간격은 격자 설정에서)'], ['회전 손잡이', '선택한 요소 위쪽의 동그란 손잡이를 끌기 — Shift: 15° 단위, 0·90·180°는 자동 맞춤, Ctrl: 자동 맞춤 해제'], ['키 조합 선택 기준', 'Ctrl+R(새로고침)·Ctrl+H 같은 브라우저 예약 키를 피해 눈금자·격자는 Alt 조합으로 두었습니다'], ['Ctrl+Shift+V', '제자리에 붙여넣기'], ['Ctrl+Alt+C / V', '서식(글꼴·크기·색·정렬 등) 복사 / 붙여넣기'], ['Tab / Shift+Tab', '다음 / 이전 요소 선택'], ['Ctrl+] / [', '한 칸 앞으로 / 뒤로 (Shift 추가: 맨 앞 / 맨 뒤)'], ['Ctrl+Z / Y', '실행 취소 / 다시 실행'], ['인쇄 제외', '우클릭 → 순서·잠금·표시 → 「인쇄에서 제외」 — 화면 안내용 개체(주황 점선)는 미리보기·인쇄에서 빠집니다. 직인은 기본적으로 출력됩니다'], ['모든 기능', '단축키가 겹칠 때는 오른쪽 클릭 메뉴(서브메뉴)에서 같은 기능을 실행할 수 있습니다'], ['오른쪽 사이드바', '오른쪽 세로 막대의 아이콘(레이어·속성·색상·기록)을 누르면 패널이 펼쳐집니다'], ['메일머지 지정', '글상자를 더블클릭 → 바뀔 문구를 드래그 → 우클릭 → 「메일머지 항목으로 만들기」(노란 표시가 바뀌는 자리)'], ['Ctrl+휠', '확대·축소'], ['Enter / 더블클릭', '글상자 직접 편집 (Esc: 마침)'], ['오른쪽 클릭', '바로 실행 메뉴'], ['Delete', '삭제'], ['Ctrl+S', '저장']];
    AW.modal({ title: '편집 단축키 · 마우스 조합', wide: true, body: '<div class="tbl-wrap"><table class="gt"><tbody>' + R.map(function (r) { return '<tr><td class="nowrap"><b>' + AW.esc(r[0]) + '</b></td><td>' + AW.esc(r[1]) + '</td></tr>'; }).join('') + '</tbody></table></div><p class="muted" style="margin-bottom:0">Mac 은 Ctrl 대신 Command, Alt 대신 Option 을 사용합니다.</p>', actions: [{ label: '닫기', cls: 'btn-primary' }] });
  }
  function copy() { var l = sel(); if (!l.length) return; st.clip = l.map(AW.clone); AW.toast(l.length + '개를 복사했습니다.'); }
  function pasteClip(pos, inPlace) {
    if (!st.clip || !st.clip.length) return;
    var x0 = Infinity, y0 = Infinity; st.clip.forEach(function (c) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); });
    var dx = inPlace ? 0 : pos ? pos.x - x0 : 5, dy = inPlace ? 0 : pos ? pos.y - y0 : 5;
    var gm = {}, ids = st.clip.map(function (c) { var n = AW.clone(c); n.id = AW.uid(); if (n.grp) n.grp = gm[n.grp] = gm[n.grp] || AW.uid('g'); n.x = AW.round(Math.max(0, Math.min(T().page.w - Math.min(c.w, T().page.w), c.x + dx)), 2); n.y = AW.round(Math.max(0, Math.min(T().page.h - Math.min(c.h || 0, T().page.h), c.y + dy)), 2); n.lock = false; T().elems.push(n); return n.id; });
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
  function pickImg(inp) { var f = inp.files[0]; inp.value = ''; if (f) addImageFile(f, null, false); }
  // 이미지·PDF 를 개체로 삽입. 용지보다 크면 맞춤 여부를 묻고, 긴 변 1600px 로 압축 저장
  function addImageFile(file, pos, fromDrop) {
    var isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
    if (!isPdf && !/^image\//.test(file.type)) return AW.toast('이미지(JPG·PNG 등) 또는 PDF 파일만 넣을 수 있습니다.', 'error');
    if (file.size > 30 * 1024 * 1024) return AW.toast('파일이 너무 큽니다(30MB 이하).', 'error');
    AW.toast('이미지를 처리하는 중입니다…');
    var pr = isPdf ? pdfPage(file, 1600).then(function (r) { return { url: r.url, mw: r.w, mh: r.h, px: 1600 }; })
      : readImage(file, 1600, /png|gif|webp|svg/i.test(file.type) ? 'image/png' : 'image/jpeg').then(function (r) { return { url: r.url, mw: r.ow * 25.4 / 150, mh: r.oh * 25.4 / 150, px: r.w }; });   // 원본 해상도 150dpi 기준 mm
    pr.then(function (r) {
      var pg = T().page, w = r.mw, h = r.mh, nat = { w: AW.round(w, 1), h: AW.round(h, 1) };
      var place = function (sc) {
        w = nat.w * sc; h = nat.h * sc; if (w < 12 && sc === 1) { var k = 25 / w; w *= k; h *= k; }
        w = AW.round(w, 1); h = AW.round(h, 1);
        var cx = pos ? pos.x : pg.w / 2, cy = pos ? pos.y : pg.h * 0.5;
        var el = AW.elem('img', { src: r.url, w: w, h: h, x: AW.round(Math.max(0, Math.min(pg.w - w, cx - w / 2)), 1), y: AW.round(Math.max(0, Math.min(pg.h - h, cy - h / 2)), 1), nat: nat, px: { w: r.px, h: AW.round(r.px * r.mh / r.mw, 0) } });
        st.lbl = '이미지 삽입'; add(el);
        if (fromDrop) dropChip(file, el.id);
      };
      if (w > pg.w || h > pg.h) {                 // 용지보다 큰 이미지: 안내 후 선택
        var fit = Math.min(pg.w * 0.7 / w, pg.h * 0.7 / h), done = false;
        AW.modal({ title: '이미지가 용지보다 큽니다', sticky: true,
          body: '<p style="margin-top:0">이미지 원본 크기 약 <b>' + AW.round(w, 0) + ' × ' + AW.round(h, 0) + 'mm</b>, 현재 용지는 <b>' + pg.w + ' × ' + pg.h + 'mm</b> 입니다. 그대로 넣으면 용지 밖으로 넘칩니다. 넣은 뒤에도 크기는 mm 로 조절할 수 있습니다.</p>',
          onClose: function () { if (!done) AW.toast('이미지 넣기를 취소했습니다.'); },
          actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '원래 크기 유지', cls: 'btn-secondary', onClick: function (c) { done = true; c(); place(1); } }, { label: '용지에 맞춤 <span class="badge ok" style="margin-left:6px">추천</span>', cls: 'btn-primary', onClick: function (c) { done = true; c(); place(fit); } }] });
      } else place(1);
    }).catch(function (e) { if (!(e && e.message === 'cancel')) AW.toast('이미지를 읽지 못했습니다' + (e && e.message ? ': ' + e.message : '.'), 'error'); });
  }
  // 드롭한 직후 안내 칩: 배경으로 쓰려면 한 번 더 선택
  function showChip(html, fn) {
    AW.$$('.dropchip', st.stage).forEach(function (n) { n.remove(); });
    var c = document.createElement('div'); c.className = 'dropchip'; c.innerHTML = html; st.stage.appendChild(c); var t = setTimeout(function () { c.remove(); }, 12000);
    c.onclick = function (e) { var k = e.target.dataset.k; if (!k) return; clearTimeout(t); c.remove(); fn(k); };
  }
  function dropChip(file, id) {
    AW.$$('.dropchip', st.stage).forEach(function (n) { n.remove(); });
    var c = document.createElement('div'); c.className = 'dropchip'; c.innerHTML = '개체로 넣었습니다 · <button class="lnk" data-k="bg">배경으로 사용</button> · <button class="lnk" data-k="x">닫기</button>';
    st.stage.appendChild(c); var t = setTimeout(function () { c.remove(); }, 9000);
    c.onclick = function (e) {
      var k = e.target.dataset.k; if (!k) return; clearTimeout(t); c.remove();
      if (k === 'bg') E.loadBackgroundFile(file).then(function () { T().elems = T().elems.filter(function (x) { return x.id !== id; }); S.sel = []; E.refreshElems(); changed('elems', false, '개체를 배경으로 변경'); });
    };
  }
  E.addImageFile = addImageFile;

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
      var e = d.e, o = d.o, h = d.h, cen = ev.ctrlKey || ev.metaKey, m = cen ? 2 : 1;
      var w = o.w + (h.indexOf('e') >= 0 ? dx : h.indexOf('w') >= 0 ? -dx : 0) * m;
      var hh = e.t === 'line' ? o.h : o.h + (h.indexOf('s') >= 0 ? dy : h.indexOf('n') >= 0 ? -dy : 0) * m;
      var sc = null;
      if (ev.shiftKey && h.length === 2 && o.h > 0) { sc = Math.max(1 / o.w, Math.max(w / o.w, hh / o.h)); w = o.w * sc; hh = o.h * sc; }   // Shift+모서리: 비율 유지
      w = Math.max(1, w); if (e.t !== 'line') hh = Math.max(1, hh);
      var x = cen ? o.x + (o.w - w) / 2 : (h.indexOf('w') >= 0 ? o.x + o.w - w : o.x);
      var y = cen ? o.y + (o.h - hh) / 2 : (h.indexOf('n') >= 0 ? o.y + o.h - hh : o.y);
      e.x = sp(x); e.y = sp(y); e.w = Math.max(1, sp(w)); if (e.t !== 'line') e.h = Math.max(1, sp(hh));
      if (e.t === 'text' && o.size && !ev.altKey && o.w > 0 && o.h > 0) {      // 크기를 바꾸면 글자 크기도 비례(모서리: 가로·세로 평균, 위·아래 변: 높이). Alt: 글자 크기 고정
        var wr = e.w / o.w, hr = e.h / o.h, fr = h.length === 2 ? Math.sqrt(wr * hr) : (h === 'n' || h === 's') ? hr : 1;
        e.size = Math.max(4, Math.min(300, Math.round(o.size * fr * 2) / 2)); var dn = domOf(e); if (dn) dn.style.fontSize = e.size * 25.4 / 72 * st.zoom + 'px';
      }
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
    if (d.mode === 'rot') { if (d.moved) { E.refreshElems(); changed('elems', false, '회전'); } return; }
    if (d.mode === 'gnew' || d.mode === 'gmv') {
      var lim2 = d.ax === 'v' ? T().page.w : T().page.h, g = guides();
      if (d.mode === 'gnew') { if (d.moved && d.pos != null && d.pos >= 0 && d.pos <= lim2) { g[d.ax].push(d.pos); changed('page', false, '안내선 추가'); } }
      else if (d.moved) { if (d.pos < 0 || d.pos > lim2) g[d.ax].splice(d.i, 1); changed('page'); }
      markSel(); return;
    }
    if (d.mode === 'mq') { AW.emit('selchange'); return; }
    if (d.mode === 'rs' || d.moved) { E.refreshElems(); changed('elems', false, d.mode === 'rs' ? '크기 조절' : '이동'); }
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
    if (f) { ev.preventDefault(); addImageFile(f, null, false); return; }
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
        res({ url: c.toDataURL(mime, 0.9), w: c.width, h: c.height, ow: im.naturalWidth, oh: im.naturalHeight });
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
  function pdfPage(file, maxPx, page) {
    return loadPdfJs().then(function (lib) {
      return file.arrayBuffer().then(function (buf) { return lib.getDocument({ data: buf }).promise; });
    }).then(function (doc) {
      if (doc.numPages === 1 || page) return { doc: doc, n: Math.min(doc.numPages, page || 1) };
      return new Promise(function (res, rej) {
        var done = false;
        AW.modal({ title: 'PDF 페이지 선택', body: '<p style="margin-top:0">총 ' + doc.numPages + '쪽입니다. 양식으로 사용할 쪽 번호를 입력해 주십시오.</p><input class="in" id="pdf-n" type="number" min="1" max="' + doc.numPages + '" value="1">',
          onClose: function () { if (!done) rej(new Error('cancel')); },
          actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '사용', cls: 'btn-primary', onClick: function (c) { var n = Math.max(1, Math.min(doc.numPages, parseInt(AW.$('#pdf-n').value, 10) || 1)); done = true; c(); res({ doc: doc, n: n }); } }] });
      });
    }).then(function (o) {
      return o.doc.getPage(o.n).then(function (pg) {
        var v1 = pg.getViewport({ scale: 1 }), sc = (maxPx || 2480) / Math.max(v1.width, v1.height), v = pg.getViewport({ scale: sc });
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
  E.pdfCount = function (file) { return loadPdfJs().then(function (lib) { return file.arrayBuffer().then(function (buf) { return lib.getDocument({ data: buf }).promise; }); }).then(function (d) { return d.numPages; }); };
  E.readSource = function (file, maxPx, page) {   // 스캔 도우미용: JPG·PNG·PDF → 이미지 data URL
    var isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
    if (!isPdf && !/^image\//.test(file.type)) return Promise.reject(new Error('JPG·PNG·PDF 파일만 올릴 수 있습니다.'));
    if (file.size > 30 * 1024 * 1024) return Promise.reject(new Error('파일이 너무 큽니다(30MB 이하).'));
    return isPdf ? pdfPage(file, maxPx, page) : readImage(file, maxPx || 2480, 'image/jpeg');
  };
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
      AW.toast('양식 배경을 적용했습니다 (' + pg.w + '×' + pg.h + 'mm' + (fp ? ' · ' + fp.paper : '') + ').', 'ok'); showChip('이 배경을 <b>이름을 붙여 등록</b>해 두면 다른 양식에서도 불러올 수 있습니다. <button class="lnk" data-k="reg">등록</button> · <button class="lnk" data-k="x">닫기</button>', function (k) { if (k === 'reg') E.bgRegister(); });
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
      var kk = tk(), base0 = function () { return nd.innerText.replace(/\u00a0/g, ' ').replace(/\n$/, ''); };
      var mg = function () { if (kk === 'en') return AW.toast('메일머지 항목은 한글 보기에서 지정해 주십시오.'); var base = base0(); endEdit(); var e = AW.get(eid); if (!e) return; e.text = base; mergeDialog({ text: base.slice(off[0], off[1]), elemId: eid, key: 'text', start: off[0], end: off[1] }); };
      var um = function () { var base = base0(); endEdit(); var e = AW.get(eid); if (!e) return; e[kk] = base.slice(0, off[0]) + unmergeText(base.slice(off[0], off[1])) + base.slice(off[1]); E.refreshElems(); changed('elems', false, '메일머지 항목 해제'); };
      var tr = function () { var base = base0(); endEdit(); var e = AW.get(eid); if (!e) return; e[kk] = base; AW.AI.translateText({ text: base.slice(off[0], off[1]), elemId: eid, apply: function (v) { e[kk] = base.slice(0, off[0]) + v + base.slice(off[1]); E.refreshElems(); changed('elems', false, '문구 번역'); } }); };
      var I2 = function (label, ic, a, o) { return Object.assign({ k: 'i', label: label, ic: ic, fn: a }, o || {}); };
      openCtx(ev.clientX, ev.clientY, [I2('메일머지 항목으로 만들기…', 'field', mg, { disabled: !hasT }), I2('메일머지 항목 해제 (원래 문구로)', 'close', um, { disabled: !/\{\{[^{}]+\}\}/.test(txt) }), { k: 'sep' }, I2('선택 문구 영문으로 바꾸기 (AI)…', 'sparkle', tr, { disabled: !hasT }), I2('상자 전체 영문으로 바꾸기 (AI)…', 'sparkle', function () { var e = AW.get(eid); endEdit(); if (e) act('tr-sel'); }), { k: 'sep' },
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
      if (one && one.t === 'text') {
        it.push(I('글 직접 편집', 'edit', 'Enter', 'edit', { disabled: one.lock }));
        var mgs = [I('글상자 전체를 항목으로 만들기…', 'field', '', 'mg-all')]; AW.tokensOf(one[tk()] || '').filter(function (n) { return n.charAt(0) !== '@'; }).forEach(function (n) { mgs.push(I('항목 해제: {{' + n + '}} → 원래 문구', 'close', '', '', { fn: function () { one[tk()] = String(one[tk()]).split('{{' + n + '}}').join(sampleOf(n)); E.refreshElems(); changed('elems', false, '메일머지 항목 해제'); } })); });
        it.push(SUB('메일머지 (바뀌는 값)', 'field', mgs.concat([{ k: 'sep' }, I('안내: 글상자를 더블클릭 → 문구 드래그 → 우클릭', 'info', '', '', { disabled: true })])));
      }
      it.push(AI, LANGM, { k: 'sep' }, I('잘라내기', 'cut', 'Ctrl+X', 'cut'), I('복사', 'copy', 'Ctrl+C', 'copy'), I('붙여넣기', 'paste', 'Ctrl+V', 'paste', { disabled: !hasClip }), I('복제', 'copy', 'Ctrl+D', 'dup'), I('삭제', 'trash', 'Del', 'del'), { k: 'sep' });
      it.push(EDIT([I('제자리에 붙여넣기 이외…', 'copy', '', 'dup')].slice(0, 0).concat([I('서식 복사', 'wand', 'Ctrl+Alt+C', 'cstyle'), I('서식 붙여넣기', 'wand', 'Ctrl+Alt+V', 'pstyle', { disabled: !st.sty })], tx.length ? [I('아래에 줄 추가', 'plus', '', 'addline')] : [])));
      var al = [STRIP(list.length > 1 ? '정렬(선택 기준)' : '정렬(용지 기준)', [B('gL', '왼쪽', 'ag-l'), B('gCH', '가로 가운데', 'ag-ch'), B('gR', '오른쪽', 'ag-r'), B('gT', '위', 'ag-t'), B('gCV', '세로 가운데', 'ag-cv'), B('gB', '아래', 'ag-b')])];
      if (list.length >= 2) al.push(I('가로 크기 같게(첫 선택 기준)', 'dH', '', 'same-w'), I('세로 크기 같게', 'dV', '', 'same-h'), I('가로·세로 크기 같게', 'rect', '', 'same-wh'));
      if (list.length >= 3) al.push(I('가로 간격 같게', 'dH', '', 'dist-h'), I('세로 간격 같게', 'dV', '', 'dist-v'));
      it.push(SUB('정렬 · 크기 맞춤', 'gCH', al));
      var allLk = list.every(function (e) { return e.lock; }), allHd = list.every(function (e) { return e.hide; });
      it.push(SUB('순서 · 잠금 · 표시', 'layers', [I('맨 앞으로', 'front', 'Ctrl+Shift+]', 'front'), I('앞으로 한 칸', 'chevU', 'Ctrl+]', 'fwd'), I('뒤로 한 칸', 'chevD', 'Ctrl+[', 'bwd'), I('맨 뒤로', 'back', 'Ctrl+Shift+[', 'back'), { k: 'sep' }, I((list.some(function (e) { return e.grp; }) ? '그룹 ' : '선택 ') + (allLk ? '잠금 해제' : '잠금(이동·크기 고정)'), allLk ? 'unlock' : 'lock', '', 'lock'), I('전체 잠금 / 해제', 'lock', '', 'lockall'), I(allHd ? '보이기' : '숨기기', 'eye', '', 'hide'), I('인쇄에서 제외 (화면 안내용)', 'print', '', 'noprint', { on: list.every(function (e) { return e.noprint; }) })]));
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
        SUB('배경', 'image', [I(T().page.bgHide ? '배경 보이기' : '배경 숨기기', 'eye', '', 'bg-toggle', { disabled: !T().bg }), I('배경 삭제', 'trash', '', 'bg-del', { disabled: !T().bg }), I('배경 교체…', 'upload', '', 'bg-replace'), I('배경 양식 등록하기…', 'save', '', 'bg-reg', { disabled: !T().bg }), I('배경 양식 불러오기…', 'folder', '', 'bg-lib'), I('배경 왼쪽 90° 회전', 'undo', '', 'bg-rot-l', { disabled: !T().bg }), I('배경 오른쪽 90° 회전', 'redo', '', 'bg-rot-r', { disabled: !T().bg })]),
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
  function setAny(key, v, live, types) {
    var l = sel().filter(function (e) { return !types || types.indexOf(e.t) >= 0; }); if (!l.length) return false;
    l.forEach(function (e) { e[key] = v; }); E.refreshElems(); if (live) { S.dirty = true; AW.emit('tplchange', 'elems'); debHist(); } else changed('elems', false, '속성 변경'); return true;
  }
  E.api = { sel: sel, T: T, setAny: setAny, setProp: setProp, changed: changed, ratio: function () { return st.ratio; }, ctxFor: function (x, y) { openCtx(x, y, buildCtx(true)); }, menuAt: function (x, y, it) { openCtx(x, y, it); }, lbl: function (l) { st.lbl = l; } };
  // ───── 배경 양식 라이브러리(서버 저장, 개수 제한 없음, 이름 부여) ─────
  function makeThumb(src) {
    return new Promise(function (res) { var im = new Image(); im.onload = function () { var r = 260 / Math.max(im.naturalWidth, im.naturalHeight), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.naturalWidth * r)); c.height = Math.max(1, Math.round(im.naturalHeight * r)); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.72)); }; im.onerror = function () { res(''); }; im.src = src; });
  }
  // 배경 + 직인·이미지·도형(글상자·QR 제외)을 한 장의 그림으로 합성 — 배경의 자연 해상도 기준 JPEG
  function flatCand() { return T().elems.filter(function (e) { return (e.t === 'img' && e.src || e.t === 'rect' || e.t === 'line') && !e.hide && !e.noprint; }); }
  function loadImg(src) { return new Promise(function (res) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = src; }); }
  E.flattenBg = function (list) {
    var t = T(), pg = t.page;
    return loadImg(t.bg).then(function (bi) {
      var W = bi ? bi.naturalWidth : 1600, H = bi ? bi.naturalHeight : Math.round(1600 * pg.h / pg.w), mx = 3200, f = Math.min(1, mx / Math.max(W, H)); W = Math.round(W * f); H = Math.round(H * f);
      var c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d'), k = W / pg.w;
      x.fillStyle = pg.bgc || '#fff'; x.fillRect(0, 0, W, H); if (bi) x.drawImage(bi, 0, 0, W, H);
      return Promise.all(list.map(function (e) { return e.t === 'img' ? loadImg(e.src) : Promise.resolve(null); })).then(function (ims) {
        list.forEach(function (e, n) {
          x.save(); x.translate((e.x + e.w / 2) * k, (e.y + e.h / 2) * k); if (e.rot) x.rotate(e.rot * Math.PI / 180); x.scale(e.flipX ? -1 : 1, e.flipY ? -1 : 1);
          var w = e.w * k, h = e.h * k;
          if (e.t === 'img' && ims[n]) { x.globalAlpha = e.opacity == null ? 1 : e.opacity; var iw = ims[n].naturalWidth, ih = ims[n].naturalHeight, r = Math.min(w / iw, h / ih); x.drawImage(ims[n], -iw * r / 2, -ih * r / 2, iw * r, ih * r); }
          else if (e.t === 'rect') { if (e.fill && e.fill !== 'transparent') { x.fillStyle = e.fill; x.fillRect(-w / 2, -h / 2, w, h); } if (e.sw && e.stroke && e.stroke !== 'transparent') { x.lineWidth = e.sw * k; x.strokeStyle = e.stroke; x.strokeRect(-w / 2 + x.lineWidth / 2, -h / 2 + x.lineWidth / 2, w - x.lineWidth, h - x.lineWidth); } }
          else if (e.t === 'line') { x.lineWidth = (e.sw || 0.5) * k; x.strokeStyle = e.stroke || '#111'; x.beginPath(); x.moveTo(-w / 2, 0); x.lineTo(w / 2, 0); x.stroke(); }
          x.restore();
        });
        return c.toDataURL('image/jpeg', 0.92);
      });
    });
  };
  E.bgRegister = function () {
    if (!T().bg) return AW.toast('등록할 배경이 없습니다.', 'error');
    var cand = flatCand(), imgs = cand.filter(function (e) { return e.t === 'img'; }).length;
    AW.modal({ title: '배경 양식 등록하기', body: '<p style="margin-top:0">현재 배경을 이름을 붙여 서버에 저장합니다. 다른 양식·다른 PC에서도 「배경 양식 불러오기」로 쓸 수 있고, 개수 제한은 없습니다.</p><label class="f">이름</label><input class="in" id="bl-n" maxlength="60" value="' + AW.esc((T().bgName || T().name || '').replace(/\.[^.]+$/, '')) + '" placeholder="예: 2026 우수상 양식">' +
      (cand.length ? '<div class="radios" style="margin-top:10px"><label><input type="checkbox" id="bl-f" checked> <b>직인·이미지·도형 ' + cand.length + '개를 배경에 합쳐서 저장</b> <span class="muted">(학교장 직인' + (imgs ? ' ' + imgs + '개' : '') + ' 포함, 한 장의 완성된 양식으로 보관 — 추천)</span></label><label style="margin-left:22px"><input type="checkbox" id="bl-a" checked> 저장 후 이 양식에도 합친 배경을 적용 <span class="muted">(합친 개체는 배경으로 옮겨지며, 되돌리기로 복구 가능)</span></label></div>' : '<p class="muted">직인·이미지 개체가 없어 배경만 저장합니다. 직인을 넣었다면 인쇄 제외로 설정하지 않았는지 확인해 주십시오.</p>'),
      actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '등록', cls: 'btn-primary', onClick: function (c, b) {
        var nm = AW.$('#bl-n').value.trim(); if (!nm) return AW.toast('이름을 입력해 주십시오.', 'error'); b.disabled = true; var pg = T().page, fl = AW.$('#bl-f') && AW.$('#bl-f').checked, ap = fl && AW.$('#bl-a').checked, bg0 = T().bg;
        (fl ? E.flattenBg(cand) : Promise.resolve(bg0)).then(function (bg) {
          return makeThumb(bg).then(function (th) { return AW.call('award_bglib_add', { p_name: nm, p_bg: bg, p_thumb: th, p_w: pg.w, p_h: pg.h, p_paper: pg.paper || '', p_orient: pg.orient || '' }); }).then(function () {
            if (ap) { var ids = {}; cand.forEach(function (e) { ids[e.id] = 1; }); T().bg = bg; T().bgName = nm; T().elems = T().elems.filter(function (e) { return !ids[e.id]; }); S.sel = []; E.render(); changed('bg', false, '직인 포함 배경 적용'); }
            c(); AW.toast('「' + nm + '」 배경 양식을 등록했습니다' + (fl ? ' (직인·도형 ' + cand.length + '개 합성)' : '') + '.', 'ok'); AW.log('bglib_add', '', { name: nm, flat: !!fl });
          });
        }).catch(function (e) { b.disabled = false; AW.toast(e.message + ' (db/award_schema_5.sql 설치 여부를 확인하십시오)', 'error'); }); } }],
      onOpen: function (el) { var i = AW.$('#bl-n', el); i.select(); i.addEventListener('keydown', function (k) { if (k.key === 'Enter') AW.$('.btn-primary', el).click(); }); var f = AW.$('#bl-f', el); if (f) f.onchange = function () { AW.$('#bl-a', el).disabled = !f.checked; }; } });
  };
  E.bgLibDialog = function () {
    var m = { el: null, all: [] };
    AW.modal({ title: '배경 양식 불러오기', wide: true, body: '<div class="sp-row" style="margin-top:0"><input class="in sm" id="bl-q" placeholder="이름 검색" style="flex:1"><button class="btn btn-secondary btn-sm" id="bl-add">' + AW.ic('save', 15) + ' 현재 배경 등록</button></div><div id="bl-b"><div class="loading">불러오는 중…</div></div>', actions: [{ label: '닫기', cls: 'btn-ghost' }], onOpen: function (el, close) { m.el = el; m.close = close; AW.$('#bl-q', el).oninput = draw; AW.$('#bl-add', el).onclick = function () { E.bgRegister(); }; load(); } });
    function load() { AW.call('award_bglib_list').then(function (l) { m.all = l || []; draw(); }).catch(function (e) { var b = AW.$('#bl-b', m.el); if (b) b.innerHTML = '<div class="alert warn">' + AW.esc(e.message) + ' (db/award_schema_5.sql 설치 여부를 확인하십시오)</div>'; }); }
    function draw() {
      var b = AW.$('#bl-b', m.el); if (!b) return; var q = AW.$('#bl-q', m.el).value.trim().toLowerCase(), l = m.all.filter(function (x) { return !q || x.name.toLowerCase().indexOf(q) >= 0; }), tot = m.all.reduce(function (a, x) { return a + (x.size || 0); }, 0);
      b.innerHTML = (l.length ? '<div class="cards">' + l.map(function (x) { return '<div class="card"><div class="bhimg">' + (x.thumb ? '<img alt="" style="width:100%;max-height:130px;object-fit:contain" src="' + x.thumb + '">' : '<span class="muted">미리보기 없음</span>') + '</div><div class="card-t">' + AW.esc(x.name) + '</div><div class="muted">' + Math.round(x.w || 0) + '×' + Math.round(x.h || 0) + 'mm · ' + ((x.size || 0) / 1048576).toFixed(1) + 'MB · ' + AW.fmtTime(x.created_at) + '</div><div class="card-a"><button class="btn btn-primary btn-sm" data-u="' + x.id + '">적용</button><button class="btn btn-ghost btn-sm" data-n="' + x.id + '">이름 변경</button><button class="btn btn-ghost btn-sm" data-d="' + x.id + '">삭제</button></div></div>'; }).join('') + '</div>' : '<div class="empty">' + (m.all.length ? '검색 결과가 없습니다.' : '등록된 배경 양식이 없습니다. 「현재 배경 등록」으로 저장해 두십시오.') + '</div>') + '<p class="muted" style="margin:10px 0 0">등록 ' + m.all.length + '개 · 사용 ' + (tot / 1048576).toFixed(1) + 'MB (제한 없음, 서버 DB 용량 안에서 저장됩니다)</p>';
      AW.$$('[data-u]', b).forEach(function (x) { x.onclick = function () { x.disabled = true; AW.call('award_bglib_get', { p_id: x.dataset.u }).then(function (r) { if (!r) throw new Error('찾을 수 없습니다.'); T().bg = r.bg; T().bgName = r.name; if (r.w && r.h) T().page = keepPage({ w: +r.w, h: +r.h, paper: r.paper || 'custom', orient: +r.w >= +r.h ? 'L' : 'P' }); S.bgDirty = true; E.render(); changed('bg', false, '배경 양식 불러오기'); AW.toast('「' + r.name + '」 배경을 적용했습니다.', 'ok'); m.close(); }).catch(function (e) { x.disabled = false; AW.toast(e.message, 'error'); }); }; });
      AW.$$('[data-n]', b).forEach(function (x) { x.onclick = function () { var it = m.all.filter(function (y) { return y.id === x.dataset.n; })[0], nn = window.prompt('새 이름', it.name); if (nn && nn.trim()) AW.call('award_bglib_rename', { p_id: it.id, p_name: nn.trim().slice(0, 60) }).then(load).catch(function (e) { AW.toast(e.message, 'error'); }); }; });
      AW.$$('[data-d]', b).forEach(function (x) { x.onclick = function () { AW.confirm('배경 양식 삭제', '서버에서 이 배경 양식을 삭제합니다. 이미 양식에 적용한 배경에는 영향이 없습니다.', '삭제', true).then(function (ok) { if (ok) AW.call('award_bglib_delete', { p_id: x.dataset.d }).then(load).catch(function (e) { AW.toast(e.message, 'error'); }); }); }; });
    }
  };
  E.menuAt = function (x, y, items) { openCtx(x, y, items); };
  E.getStage = function () { return st.stage; };
  E.relayout = function () {
    if (!st.fit || !T() || !st.pg) return;
    if (st.editing || st.drag) { st.pending = true; return; }
    if (Math.abs(fitScale() - st.zoom) > 0.02) E.render();
  };
})();
