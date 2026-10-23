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
        '<div class="tg">' + BTN('add-text', 'text', '글상자 추가') + BTN('add-field', 'field', '일괄 입력 항목 추가 — 엑셀 데이터가 들어갈 자리') + BTN('add-line', 'line', '선 추가') + BTN('add-rect', 'rect', '사각형 추가') + BTN('add-table', 'table', '표 넣기 — 가로 칸 × 세로 줄') + BTN('add-img', 'image', '이미지(직인·로고) 추가') + BTN('add-qr', 'qr', '위조 방지 인증 QR 추가') + '</div>' +
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
        '<div class="tg">' + BTN('al-l', 'alL', '왼쪽 정렬') + BTN('al-c', 'alC', '가운데 정렬') + BTN('al-r', 'alR', '오른쪽 정렬') + BTN('al-j', 'alJ', '양쪽 정렬 — 좌우 폭을 채우고 마지막 줄은 왼쪽(한글의 양쪽 정렬)') + BTN('al-d', 'alD', '균등 분배 — 마지막 줄까지 좌우 폭을 채움(한글의 배분 정렬)') + '</div>' +
        '<div class="tg">' + BTN('v-t', 'vT', '위쪽 맞춤') + BTN('v-m', 'vM', '세로 가운데') + BTN('v-b', 'vB', '아래쪽 맞춤') + '</div>' +
        '<label class="mini" title="줄 간격(배)">행간<input class="in sm num" data-p="lh" type="number" min="0.8" max="4" step="0.1" style="width:56px"></label>' +
        '<label class="mini" title="글자 간격(pt)">자간<input class="in sm num" data-p="ls" type="number" min="-5" max="60" step="0.5" style="width:56px"></label>' +
        '<label class="mini chk" title="긴 이름이 상자 안에 한 줄로 들어가도록 글자 크기를 자동으로 줄입니다"><input type="checkbox" data-p="fit"> 글자 자동 맞춤</label>' +
      '</div>' +
      '<div class="ed-tools ed-arr">' +
        '<div class="tg" title="선택이 1개면 용지 기준, 2개 이상이면 선택 영역 기준으로 정렬합니다">' + BTN('ag-l', 'gL', '왼쪽 맞춤') + BTN('ag-ch', 'gCH', '가로 가운데') + BTN('ag-r', 'gR', '오른쪽 맞춤') + BTN('ag-t', 'gT', '위 맞춤') + BTN('ag-cv', 'gCV', '세로 가운데') + BTN('ag-b', 'gB', '아래 맞춤') + '</div>' +
        '<div class="tg">' + BTN('dist-h', 'dH', '가로 간격 같게(3개 이상)') + BTN('dist-v', 'dV', '세로 간격 같게(3개 이상)') + BTN('gapdlg', 'dH', '간격 지정 배치·몰기(2개 이상)') + BTN('front', 'front', '맨 앞으로') + BTN('back', 'back', '맨 뒤로') + BTN('lock', 'lock', '선택 잠금/해제 (그룹은 그룹 전체)') + '<button class="tb tb-txt" data-a="lockall" title="모든 요소를 한 번에 잠금/해제">전체 잠금</button></div>' +
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
      if (t.dataset.p === 'size') { var v = parseFloat(t.value); if (isNaN(v)) return updTools(); if (st.editing && st.editing.runs && applyRunSize(Math.max(4, Math.min(300, v)))) return; setProp('size', Math.round(Math.max(4, Math.min(300, v)) * 2) / 2); return; }
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
    if (T().page.plate) AW.fitAll(pg); else AW.$$('.el[data-fit="1"]', pg).forEach(function (d) { d.dataset.fit = ''; });   // 편집 중에는 자동 맞춤 미적용(원본 크기 그대로 확인)
    markSel(); updTools();
    var zl = AW.$('[data-a="zlabel"]', st.root); if (zl) zl.textContent = st.fit ? '맞춤' : Math.round(st.zoom / K1 * 100) + '%';
    ['ko', 'en', 'both'].forEach(function (l) { var b = AW.$('[data-a="lang-' + l + '"]', st.root); if (b) b.classList.toggle('on', LG() === l); });
    var ob = AW.$('[data-a="orient"]', st.root); if (ob) ob.innerHTML = AW.ic('rotate', 15) + ' ' + (T().page.w >= T().page.h ? '가로' : '세로');
    var sn = AW.$('[data-a="snap"]', st.root); if (sn) sn.classList.toggle('on', st.cfg.snap);
    drawGrid();
    updHint();
    if (AW.Plate) AW.Plate.onRender(st.root, T());
  };
  function updHint() {
    var hint = AW.$('.ed-hint', st.stage);
    hint.textContent = (T().elems.length || T().bg) ? '' : '배경(JPG·PNG·PDF)을 올리거나, 위의 도구로 글상자를 추가해 주십시오. 파일을 이 영역에 끌어다 놓아도 됩니다.';
  }
  E.refreshElems = function () {            // 요소 레이어만 다시 그림 (배경 이미지 재생성 방지)
    if (!st.pg) return E.render();
    AW.$$('.el', st.pg).forEach(function (n) { n.remove(); });
    T().elems.forEach(function (e) { var d = AW.renderElem(e, st.zoom, { mode: 'edit', lang: LG() }); if (!T().page.plate) d.dataset.fit = ''; st.pg.insertBefore(d, st.ov); });
    if (T().page.plate) AW.fitAll(st.pg);
    markSel(); updTools(); updHint();
    if (AW.Plate && T().page.plate) AW.Plate.refresh(st.pg, T(), st.zoom, LG());
  };
  // 글이 상자보다 길어 밖으로 넘치면 선택할 때 상자 높이를 글 높이에 맞춤 — 선택 영역·점선·크기 조절 손잡이가 하나의 박스로 일치
  function growToText(e) {
    if (!e || e.t !== 'text' || e.lock || e.fit || (e.rot && e.rot % 360) || st.editing) return;
    var d = domOf(e), c = d && d.firstChild; if (!c) return; var over = c.offsetHeight - d.clientHeight; if (over < 2) return;
    var dh = AW.round(over / st.zoom + 0.4, 1); e.h = AW.round(e.h + dh, 1);
    if (e.valign === 'bottom') e.y = AW.round(e.y - dh, 1); else if (e.valign !== 'top') e.y = AW.round(e.y - dh / 2, 1);
    placeEl(e); changed('elems', false, '상자 높이를 글에 맞춤');
  }
  function markSel() {
    if (!st.ov) return;
    st.ov.innerHTML = '';
    if (S.sel.length === 1) growToText(AW.get(S.sel[0]));
    var list = sel(), single = list.length === 1;
    list.forEach(function (e) {
      var b = document.createElement('div'); b.className = 'sb' + (e.lock ? ' lk' : ''); b.dataset.id = e.id;
      placeBox(b, e);
      if (single && !e.lock) {
        var rotated = !!(e.rot && e.rot % 360);
        (rotated ? [] : e.t === 'line' ? ['w', 'e'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']).forEach(function (h) { var hd = document.createElement('i'); hd.className = 'hd hd-' + h; hd.dataset.h = h; b.appendChild(hd); });
        if (e.t === 'table') { var mv = document.createElement('i'); mv.className = 'tmv'; mv.title = '끌어서 표 이동'; b.appendChild(mv); }
        var rh = document.createElement('i'); rh.className = 'rh'; rh.title = '끌어서 회전 (Shift: 15°, 0·90°·180°는 자동 맞춤)'; b.appendChild(rh);
      }
      st.ov.appendChild(b);
    });
    if (list.length > 1 && list[0].grp && list.every(function (e) { return e.grp === list[0].grp; })) {   // 그룹 전체 영역
      var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, k = st.zoom; list.forEach(function (e) { x1 = Math.min(x1, e.x); y1 = Math.min(y1, e.y); x2 = Math.max(x2, e.x + e.w); y2 = Math.max(y2, e.y + e.h); });
      var gb = document.createElement('div'); gb.className = 'sb gb'; gb.style.cssText = 'left:' + x1 * k + 'px;top:' + y1 * k + 'px;width:' + (x2 - x1) * k + 'px;height:' + (y2 - y1) * k + 'px'; st.ov.appendChild(gb);
    }
    drawGuides(); drawTSel();
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
    ['v', 'h'].forEach(function (ax) { var srt = (g[ax] || []).slice().sort(function (a, b) { return a - b; }), gaps = []; for (var q = 0; q < srt.length - 1; q++) gaps.push(srt[q + 1] - srt[q]); gaps.forEach(function (gp, q) { if (gp < 0.5) return; var eq = (q > 0 && Math.abs(gaps[q - 1] - gp) < 0.06) || (q < gaps.length - 1 && Math.abs(gaps[q + 1] - gp) < 0.06), l = document.createElement('div'); l.className = 'gl gd ' + (eq ? 'eq ' : '') + (ax === 'h' ? 'hz' : ''); l.textContent = (eq ? '= ' : '') + AW.round(gp, 1) + ' mm'; l.style[ax === 'v' ? 'left' : 'top'] = ((srt[q] + srt[q + 1]) / 2) * k + 'px'; l.style[ax === 'v' ? 'top' : 'left'] = '24px'; st.ov.appendChild(l); }); });
    ['v', 'h'].forEach(function (ax) { (g[ax] || []).forEach(function (pos, i) { var d = document.createElement('div'); d.className = 'gl ' + (ax === 'v' ? 'glv' : 'glh'); d.dataset.ax = ax; d.dataset.i = i; d.title = '안내선 ' + pos + 'mm — 끌어서 이동, 눈금자로 끌어내면 삭제'; d.style[ax === 'v' ? 'left' : 'top'] = pos * k + 'px'; st.ov.appendChild(d); }); });
  }
  function ctxFlip() {}
  function placeBox(b, e) { var k = st.zoom; b.style.cssText = 'left:' + (e.x * k) + 'px;top:' + (e.y * k - (e.t === 'line' ? 4 : 0)) + 'px;width:' + (e.w * k) + 'px;height:' + (e.t === 'line' ? 8 : Math.max(e.h, 0.5) * k) + 'px' + (e.rot ? ';transform:rotate(' + e.rot + 'deg)' : ''); }
  function domOf(e) { return AW.$('.el[data-id="' + e.id + '"]', st.pg); }
  function placeEl(e) { var d = domOf(e); if (!d) return; var k = st.zoom; d.style.left = e.x * k + 'px'; d.style.top = e.y * k + 'px'; d.style.width = e.w * k + 'px'; if (e.t !== 'line') d.style.height = Math.max(e.h, 1) * k + 'px'; var tr = (e.rot ? 'rotate(' + e.rot + 'deg) ' : '') + ((e.flipX || e.flipY) ? 'scale(' + (e.flipX ? -1 : 1) + ',' + (e.flipY ? -1 : 1) + ')' : ''); d.style.transform = tr.trim(); }
  function liveUpdate() { sel().forEach(function (e) { placeEl(e); var b = AW.$('.sb[data-id="' + e.id + '"]', st.ov); if (b) placeBox(b, e); }); updPos(); if (AW.Plate && T().page.plate) AW.Plate.decorate(st.pg, T(), st.zoom, { mode: 'edit', lang: LG(), scale: st.zoom }, 'edit'); AW.fitAll(st.pg); }
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
      f('font').value = one.font; f('fontEn').value = one.fontEn || ''; if (!(st.editing && st.editing.runs)) f('size').value = one.size; f('lh').value = one.lh; f('ls').value = one.ls || 0; f('color').value = /^#[0-9a-f]{6}$/i.test(one.color) ? one.color : '#111111'; f('fit').checked = !!one.fit;
      [['bold', one.bold], ['italic', one.italic], ['ul', one.ul], ['al-l', one.align === 'left'], ['al-c', one.align === 'center'], ['al-r', one.align === 'right'], ['al-j', one.align === 'justify'], ['al-d', one.align === 'dist'], ['v-t', one.valign === 'top'], ['v-m', one.valign === 'middle'], ['v-b', one.valign === 'bottom']].forEach(function (p) {
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
    if (a.indexOf('t-') === 0) return tAct(a);
    if (a.indexOf('pl-') === 0) return AW.Plate.act(a, { changed: changed, sel: sel });
    var list = sel(), tx = list.filter(function (e) { return e.t === 'text'; });
    var T1 = function (p, v) { setProp(p, v); };
    st.lbl = LBLS[a] || null;
    switch (a) {
      case 'add-text': return add(AW.elem('text', { text: '텍스트를 입력하세요', en: 'Enter text' }));
      case 'add-qr': return add(AW.elem('qr'));
      case 'verify-cfg': return AW.Output.verifyDialog();
      case 'add-table': return AW.Table.insertDialog(function (el) { add(el); });
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
      case 'sz-': if (st.editing && st.editing.runs) return applyRunSize(Math.max(4, runSizeNow() - 1)); return tx.length && T1('size', (tx[0].size || 16) - 1);
      case 'sz+': if (st.editing && st.editing.runs) return applyRunSize(Math.min(300, runSizeNow() + 1)); return tx.length && T1('size', (tx[0].size || 16) + 1);
      case 'bold': return tx.length && T1('bold', !tx[0].bold);
      case 'italic': return tx.length && T1('italic', !tx[0].italic);
      case 'ul': return tx.length && T1('ul', !tx[0].ul);
      case 'al-l': return T1('align', 'left'); case 'al-c': return T1('align', 'center'); case 'al-r': return T1('align', 'right'); case 'al-j': return T1('align', 'justify'); case 'al-d': return T1('align', 'dist');
      case 'v-t': return T1('valign', 'top'); case 'v-m': return T1('valign', 'middle'); case 'v-b': return T1('valign', 'bottom');
      case 'front': return order(true); case 'back': return order(false);
      case 'lock': var all = list.length && list.every(function (e) { return e.lock; }); list.forEach(function (e) { e.lock = !all; }); markSel(); updTools(); return changed('elems');
      case 'dist-h': return dist('x', 'w'); case 'dist-v': return dist('y', 'h');
      case 'pack-l': return pack('l'); case 'pack-r': return pack('r'); case 'pack-t': return pack('t'); case 'pack-b': return pack('b'); case 'gapdlg': return gapDialog();
      case 'props': return E.propDialog();
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
    var R = [['한 글자 단축키', 'T 글상자 / R 사각형 / L 선 / B 표 추가 (캔버스를 클릭해 둔 상태에서)'], ['화면 이동', '스페이스바를 누른 채 끌기'], ['개체 위에 올리기', '선택하지 않은 개체의 위치·크기를 표시'], ['표 복사·붙여넣기', '셀 선택 후 Ctrl+C·X: 엑셀·메모장으로 / 엑셀에서 복사 → 셀 선택 → Ctrl+V: 칸·줄 자동 확장'], ['표', '표 넣기 버튼 → 칸·줄 수 입력 / F5: 셀 선택 → 한 번 더: 표 전체 → 한 번 더: 해제 / 선택된 표를 클릭·끌기: 셀 범위 선택, 칸 경계 끌기: 너비·높이, 왼쪽 위 손잡이: 표 이동 / 화살표·Tab·Enter·Del·Esc / P: 선 두께·방향별 선·합치기·서식'], ['끌어서 이동', 'Shift: 가로·세로 한 방향 고정 / Alt: 복제하며 이동 / Ctrl: 자석(격자·가이드) 끄기'], ['크기 조절', '글상자는 글자 크기도 함께 비례 / Shift: 비율 유지 / Alt: 글자 크기 고정 / Ctrl: 중심 기준'], ['변 크기 조절', '글상자 폭·높이만 변경'], ['선택', '클릭 / Shift·Ctrl+클릭: 추가·해제 / 빈 곳 끌기: 범위 선택 / Ctrl+A: 전체'], ['화살표', '0.5mm 이동 (Shift: 5mm)'], ['Ctrl+C / X / V', '복사 / 잘라내기 / 붙여넣기'], ['Ctrl+D', '복제'], ['Ctrl+G / Ctrl+Shift+G', '그룹 만들기 / 해제 (그룹은 더블클릭하면 안의 요소만 선택)'], ['Alt+R', '눈금자 보기·숨기기 — 눈금자에서 끌어내면 안내선, 안내선을 눈금자로 끌어 넣으면 삭제'], ['Alt+G', '격자선 보기·숨기기 (간격은 격자 설정에서)'], ['회전 손잡이', '선택한 요소 위쪽의 동그란 손잡이를 끌기 — Shift: 15° 단위, 0·90·180°는 자동 맞춤, Ctrl: 자동 맞춤 해제'], ['키 조합 선택 기준', 'Ctrl+R(새로고침)·Ctrl+H 같은 브라우저 예약 키를 피해 눈금자·격자는 Alt 조합으로 두었습니다'], ['Ctrl+Shift+V', '제자리에 붙여넣기'], ['Ctrl+Alt+C / V', '서식(글꼴·크기·색·정렬 등) 복사 / 붙여넣기'], ['Tab / Shift+Tab', '다음 / 이전 요소 선택'], ['Ctrl+] / [', '한 칸 앞으로 / 뒤로 (Shift 추가: 맨 앞 / 맨 뒤)'], ['Ctrl+Z / Y', '실행 취소 / 다시 실행'], ['인쇄 제외', '우클릭 → 순서·잠금·표시 → 「인쇄에서 제외」 — 화면 안내용 개체(주황 점선)는 미리보기·인쇄에서 빠집니다. 직인은 기본적으로 출력됩니다'], ['모든 기능', '단축키가 겹칠 때는 오른쪽 클릭 메뉴(서브메뉴)에서 같은 기능을 실행할 수 있습니다'], ['오른쪽 사이드바', '오른쪽 세로 막대의 아이콘(레이어·속성·색상·기록)을 누르면 패널이 펼쳐집니다'], ['메일머지 지정', '글상자를 더블클릭 → 바뀔 문구를 드래그 → 우클릭 → 「메일머지 항목으로 만들기」(노란 표시가 바뀌는 자리)'], ['Ctrl+휠', '확대·축소'], ['Enter / 더블클릭', '글상자 직접 편집 (Esc: 마침)'], ['오른쪽 클릭', '바로 실행 메뉴'], ['Delete', '삭제'], ['Ctrl+S', '저장']];
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
  /* ───────────── 개체 속성 창 (P) — 한글의 「개체 속성」처럼 위치·크기·모양을 한곳에서 ───────────── */
  E.propDialog = function () {
    var list = sel(); if (!list.length) return AW.toast('속성을 볼 개체를 먼저 선택해 주십시오.'); if (list.length === 1 && list[0].t === 'table') return AW.Table.dialog(list[0]); var one = list.length === 1 ? list[0] : null, B = bounds(list), tx = list.filter(function (e) { return e.t === 'text'; }), sh = list.filter(function (e) { return e.t === 'rect' || e.t === 'line'; }), im = list.filter(function (e) { return e.t === 'img'; }), f0 = tx[0] || {}, s0 = sh[0] || {}, i0 = im[0] || {};
    var NUM = function (id, label, v, st2, ex) { return '<div><label class="f" for="' + id + '">' + label + '</label><input class="in sm" id="' + id + '" type="number" step="' + (st2 || 0.1) + '" value="' + v + '"' + (ex || '') + '></div>'; };
    var CHK = function (id, label, on) { return '<label class="chk"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + label + '</label>'; };
    var COL = function (id, v, none) { return '<div style="display:flex;gap:6px;align-items:center"><input type="color" id="' + id + '" value="' + (/^#[0-9a-f]{6}$/i.test(v) ? v : '#111111') + '" style="width:38px;height:30px;padding:0;border:1px solid var(--border);border-radius:var(--r)"><input class="in sm" id="' + id + '-h" value="' + AW.esc(v || '') + '" style="width:92px" placeholder="#RRGGBB">' + (none ? '<label class="mini chk"><input type="checkbox" id="' + id + '-n"' + (!v ? ' checked' : '') + '> 없음</label>' : '') + '</div>'; };
    var body = '<div class="pp"><div class="pp-sec"><b>' + (one ? ({ text: '글상자', rect: '사각형', line: '선', img: '이미지', qr: 'QR' }[one.t] || '개체') : list.length + '개 개체') + '</b>' + (one ? ' <span class="muted">' + AW.esc(one.name || '') + '</span>' : '') + '</div>' +
      '<div class="grid2 pp-g">' + NUM('pp-x', '가로 위치 X (mm)', AW.round(B.x, 2)) + NUM('pp-y', '세로 위치 Y (mm)', AW.round(B.y, 2)) + NUM('pp-w', '너비 (mm)', AW.round(B.w, 2), 0.1, one && one.t === 'line' ? '' : ' min="0.5"') + NUM('pp-h', '높이 (mm)', AW.round(B.h, 2), 0.1, one && one.t === 'line' ? ' disabled' : ' min="0.5"') + (one ? NUM('pp-r', '회전 (°)', AW.round(one.rot || 0, 1), 1) : '') + '</div>' +
      '<div class="pp-op">' + CHK('pp-ratio', '너비·높이 비율 유지', st.ratio) + CHK('pp-lock', '잠금', list.every(function (e) { return e.lock; })) + CHK('pp-np', '인쇄 제외 (편집 화면에만 표시)', list.every(function (e) { return e.noprint; })) + CHK('pp-hide', '숨김', list.every(function (e) { return e.hide; })) + '</div>' +
      (list.some(function (e) { return e.t !== 'img'; }) ? '<div class="grid2 pp-g">' + NUM('pp-opa', '투명도 (%) — 100 은 불투명', Math.round((((list.filter(function (e) { return e.t !== 'img'; })[0] || {}).opacity == null ? 1 : list.filter(function (e) { return e.t !== 'img'; })[0].opacity)) * 100), 5, ' min="0" max="100"') + '</div>' : '') +
      (tx.length ? '<div class="pp-sec"><b>글자</b>' + (tx.length > 1 ? ' <span class="muted">(글상자 ' + tx.length + '개에 적용)</span>' : '') + '</div><div class="grid2 pp-g"><div><label class="f">글꼴</label><select class="in sm" id="pp-font">' + AW.fontOptions() + '</select></div>' + NUM('pp-size', '글자 크기 (pt)', f0.size || 16, 0.5, ' min="4"') + NUM('pp-lh', '줄 간격 (배)', f0.lh || 1.4, 0.05) + NUM('pp-ls', '자간 (pt)', f0.ls || 0, 0.1) + '<div><label class="f">가로 정렬</label><select class="in sm" id="pp-al"><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></div><div><label class="f">세로 정렬</label><select class="in sm" id="pp-va"><option value="top">위</option><option value="middle">가운데</option><option value="bottom">아래</option></select></div></div><div class="pp-op">' + CHK('pp-b', '굵게', f0.bold) + CHK('pp-i', '기울임', f0.italic) + CHK('pp-u', '밑줄', f0.ul) + CHK('pp-fit', '글자 자동 맞춤(한 줄)', f0.fit) + '</div><div class="grid2 pp-g"><div><label class="f">글자 색</label>' + COL('pp-c', f0.color || '#111111') + '</div></div>' : '') +
      (list.some(function (e) { return e.t === 'qr'; }) ? '<div class="pp-sec"><b>QR</b></div><div class="pp-op"><button class="btn btn-secondary btn-sm" id="pp-vf">진위 확인 문구·공개 항목 설정…</button></div>' : '') +
      (sh.length ? '<div class="pp-sec"><b>도형·선</b></div><div class="grid2 pp-g"><div><label class="f">채우기 색</label>' + COL('pp-f', s0.fill || '', true) + '</div><div><label class="f">선 색</label>' + COL('pp-s', s0.stroke || '#111111') + '</div>' + NUM('pp-sw', '선 두께 (mm)', s0.sw != null ? s0.sw : 0.5, 0.1, ' min="0"') + '</div>' : '') +
      (im.length ? '<div class="pp-sec"><b>이미지</b></div><div class="grid2 pp-g">' + NUM('pp-op', '투명도 (%)', Math.round((i0.opacity == null ? 1 : i0.opacity) * 100), 5, ' min="0" max="100"') + '</div><div class="pp-op">' + CHK('pp-fx', '좌우 반전', im.every(function (e) { return e.flipX; })) + CHK('pp-fy', '상하 반전', im.every(function (e) { return e.flipY; })) + '</div>' : '') + '</div>';
    var m = { el: null }, dirty = {};
    AW.modal({ title: '개체 속성 (P)', wide: true, body: body, actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '적용', cls: 'btn-secondary', onClick: function () { apply(false); return false; } }, { label: '확인', cls: 'btn-primary', onClick: function (c) { apply(true); c(); } }],
      onOpen: function (el) {
        m.el = el; var set = function (id, v) { var n = AW.$('#' + id, el); if (n) n.value = v; }; if (tx.length) { set('pp-font', f0.font || 'Noto Serif KR'); set('pp-al', f0.align || 'center'); set('pp-va', f0.valign || 'middle'); }
        AW.$$('input,select', el).forEach(function (n) { n.addEventListener('keydown', function (k) { k.stopPropagation(); if (k.key === 'Enter' && n.tagName === 'INPUT' && n.type !== 'checkbox') { apply(true); var c = AW.$('.md-x', el); c && c.click(); } }); n.addEventListener('input', function () { dirty[n.id] = 1; }); n.addEventListener('change', function () { dirty[n.id] = 1; });
          if (n.type === 'color') n.addEventListener('input', function () { var h = AW.$('#' + n.id + '-h', el); if (h) { h.value = n.value; dirty[n.id + '-h'] = 1; } }); });
        AW.$$('[id$="-h"]', el).forEach(function (h) { h.addEventListener('input', function () { var c = AW.$('#' + h.id.replace(/-h$/, ''), el); if (c && /^#[0-9a-f]{6}$/i.test(h.value)) c.value = h.value; }); });
        var vf = AW.$('#pp-vf', el); if (vf) vf.onclick = function () { var x = AW.$('.md-x', el); x && x.click(); AW.Output.verifyDialog(); };
        var W = AW.$('#pp-w', el), H = AW.$('#pp-h', el), rt = B.h ? B.w / B.h : 1; W.addEventListener('input', function () { if (AW.$('#pp-ratio', el).checked && H && !H.disabled && rt) { H.value = AW.round((+W.value || 0) / rt, 2); dirty['pp-h'] = 1; } }); H.addEventListener('input', function () { if (AW.$('#pp-ratio', el).checked && rt) { W.value = AW.round((+H.value || 0) * rt, 2); dirty['pp-w'] = 1; } });
      } });
    function apply(close) {
      var el = m.el, g = function (id) { return AW.$('#' + id, el); }, v = function (id) { return parseFloat(g(id).value); }, d = function (id) { return dirty[id]; };
      st.ratio = g('pp-ratio').checked;
      if (d('pp-x') || d('pp-y') || d('pp-w') || d('pp-h')) {
        var nx = d('pp-x') && !isNaN(v('pp-x')) ? v('pp-x') : B.x, ny = d('pp-y') && !isNaN(v('pp-y')) ? v('pp-y') : B.y, nw = d('pp-w') && v('pp-w') > 0 ? v('pp-w') : B.w, nh = d('pp-h') && v('pp-h') > 0 ? v('pp-h') : B.h;
        if (one) { one.x = AW.round(nx, 2); one.y = AW.round(ny, 2); one.w = AW.round(nw, 2); if (one.t !== 'line') one.h = AW.round(nh, 2); }
        else { var sx = B.w ? nw / B.w : 1, sy = B.h ? nh / B.h : 1; list.forEach(function (e) { e.x = AW.round(nx + (e.x - B.x) * sx, 2); e.y = AW.round(ny + (e.y - B.y) * sy, 2); e.w = AW.round(e.w * sx, 2); e.h = AW.round(e.h * sy, 2); }); }
        B = bounds(list);
      }
      if (one && d('pp-r')) one.rot = normRot(v('pp-r') || 0);
      if (d('pp-lock')) list.forEach(function (e) { e.lock = g('pp-lock').checked; }); if (d('pp-np')) list.forEach(function (e) { e.noprint = g('pp-np').checked; }); if (d('pp-hide')) list.forEach(function (e) { e.hide = g('pp-hide').checked; });
      tx.forEach(function (e) {
        if (d('pp-font')) e.font = g('pp-font').value; if (d('pp-size') && v('pp-size') > 0) e.size = v('pp-size'); if (d('pp-lh') && v('pp-lh') > 0) e.lh = v('pp-lh'); if (d('pp-ls')) e.ls = v('pp-ls') || 0; if (d('pp-al')) e.align = g('pp-al').value; if (d('pp-va')) e.valign = g('pp-va').value;
        if (d('pp-b')) e.bold = g('pp-b').checked; if (d('pp-i')) e.italic = g('pp-i').checked; if (d('pp-u')) e.ul = g('pp-u').checked; if (d('pp-fit')) e.fit = g('pp-fit').checked; if (d('pp-c') || d('pp-c-h')) e.color = g('pp-c-h').value || g('pp-c').value;
      });
      sh.forEach(function (e) { if (d('pp-f') || d('pp-f-h') || d('pp-f-n')) e.fill = g('pp-f-n').checked ? '' : (g('pp-f-h').value || g('pp-f').value); if (d('pp-s') || d('pp-s-h')) e.stroke = g('pp-s-h').value || g('pp-s').value; if (d('pp-sw')) e.sw = Math.max(0, v('pp-sw') || 0); });
      im.forEach(function (e) { if (d('pp-op')) e.opacity = Math.max(0, Math.min(100, v('pp-op'))) / 100; if (d('pp-fx')) e.flipX = g('pp-fx').checked; if (d('pp-fy')) e.flipY = g('pp-fy').checked; });
      if (d('pp-opa')) list.forEach(function (e) { if (e.t !== 'img') { var ov = Math.max(0, Math.min(100, v('pp-opa'))) / 100; if (ov >= 1) delete e.opacity; else e.opacity = ov; } });
      dirty = {}; E.refreshElems(); markSel(); updTools(); changed('elems', false, '개체 속성 변경'); if (AW.Side) AW.Side.update('props');
    }
  };
  function pack(dir, gap) {   // 선택한 개체를 한쪽으로 몰아 일정 간격으로 붙임 (첫 개체 위치 유지)
    var list = sel().filter(function (e) { return !e.lock; }); if (list.length < 2) return AW.toast('2개 이상 선택해 주십시오.');
    var ax = dir === 'l' || dir === 'r' ? 'x' : 'y', sz = ax === 'x' ? 'w' : 'h'; gap = gap == null ? (st.cfg.packGap == null ? 2 : st.cfg.packGap) : gap; var cur, i;
    if (dir === 'l' || dir === 't') { list.sort(function (a, b) { return a[ax] - b[ax]; }); cur = list[0][ax] + list[0][sz] + gap; for (i = 1; i < list.length; i++) { list[i][ax] = AW.round(cur, 2); cur += list[i][sz] + gap; } }
    else { list.sort(function (a, b) { return (b[ax] + b[sz]) - (a[ax] + a[sz]); }); cur = list[0][ax] - gap; for (i = 1; i < list.length; i++) { list[i][ax] = AW.round(cur - list[i][sz], 2); cur = list[i][ax] - gap; } }
    E.refreshElems(); changed('elems', false, '몰기 배치');
  }
  function gapDialog() {
    var n = sel().filter(function (e) { return !e.lock; }).length; if (n < 2) return AW.toast('2개 이상 선택해 주십시오.');
    AW.modal({ title: '간격 지정 배치', body: '<p style="margin-top:0">선택한 ' + n + '개를 한쪽으로 모아 <b>일정한 간격</b>으로 붙입니다. 기준이 되는 첫 개체(왼쪽·위쪽·오른쪽·아래쪽 끝)는 움직이지 않습니다.</p><label class="f">방향</label><select class="in" id="gp-d"><option value="l">왼쪽으로 몰기 (가로로 이어 붙이기)</option><option value="r">오른쪽으로 몰기</option><option value="t">위로 몰기 (세로로 이어 붙이기)</option><option value="b">아래로 몰기</option></select><label class="f">간격 (mm)</label><input class="in" id="gp-g" type="number" step="0.5" min="0" value="' + (st.cfg.packGap == null ? 2 : st.cfg.packGap) + '">',
      actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '배치', cls: 'btn-primary', onClick: function (c) { var g = Math.max(0, parseFloat(AW.$('#gp-g').value) || 0), dv = AW.$('#gp-d').value; st.cfg.packGap = g; saveCfg(); c(); pack(dv, g); } }],
      onOpen: function (el) { var i = AW.$('#gp-g', el); i.addEventListener('keydown', function (k) { k.stopPropagation(); if (k.key === 'Enter') AW.$('.btn-primary', el).click(); }); } });
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
        if (!pos && AW.Plate && pg.plate) AW.Plate.placeLogo(T(), el);
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
    if (st.editing) { var ee = ev.target.closest('.el'); if (ee && ee.dataset.id === st.editing.id && (!st.editing.cell || st.editing.node.contains(ev.target))) return; endEdit(); }
    if (st.space) { st.drag = { mode: 'pan', sx: ev.clientX, sy: ev.clientY, l: st.stage.scrollLeft, t: st.stage.scrollTop, start: toMM(ev) }; ev.preventDefault(); return; }
    var rh = ev.target.closest('.rh'), gl = ev.target.closest('.gl'), rl = ev.target.closest('.rl');
    if (rh) { var er = sel()[0]; if (er) { st.drag = { mode: 'rot', e: er, start: toMM(ev) }; ev.preventDefault(); } return; }
    if (gl) { st.drag = { mode: 'gmv', ax: gl.dataset.ax, i: +gl.dataset.i, start: toMM(ev) }; ev.preventDefault(); return; }
    if (rl) { st.drag = { mode: 'gnew', ax: rl.classList.contains('rl-top') ? 'h' : 'v', pos: null, start: toMM(ev) }; ev.preventDefault(); return; }
    var hd = ev.target.closest('.hd'), elNode = ev.target.closest('.el'), tmv = ev.target.closest('.tmv');
    if (hd) {
      var e0 = sel()[0]; if (!e0) return;
      st.drag = { mode: 'rs', h: hd.dataset.h, start: toMM(ev), o: { x: e0.x, y: e0.y, w: e0.w, h: e0.h, size: e0.size }, oT: e0.t === 'table' ? { cw: e0.cw.slice(), rh: e0.rh.slice() } : null, e: e0 }; ev.preventDefault(); return;
    }
    if (tmv) { var te0 = sel()[0]; if (te0 && !te0.lock) { st.drag = { mode: 'mv', start: toMM(ev), list: [{ e: te0, x: te0.x, y: te0.y }], moved: false, alt: ev.altKey }; ev.preventDefault(); } return; }
    if (elNode && tTableDown(ev, elNode)) return;
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
    if (d.mode === 'pan') { st.stage.scrollLeft = d.l - (ev.clientX - d.sx); st.stage.scrollTop = d.t - (ev.clientY - d.sy); return; }
    if (d.mode === 'tcell') { var ch = tHit(d.e, ev), cc = ch && TB().cellAt(d.e, ch.x, ch.y); if (cc && (cc.r !== d.lr || cc.c !== d.lc)) { d.lr = cc.r; d.lc = cc.c; tSet(d.e, d.ar, d.ac, cc.r, cc.c); } return; }
    if (d.mode === 'tedge') {
      var lo = d.o, ee = d.e, dv = d.dir === 'v' ? dx : dy; d.moved = true;
      if (d.dir === 'v') { dv = Math.max(-(lo[0] - 3), Math.min(lo[1] - 3, dv)); ee.cw[d.i - 1] = AW.round(lo[0] + dv, 1); ee.cw[d.i] = AW.round(lo[1] - dv, 1); }
      else { dv = Math.max(-(lo[0] - 3), dv); ee.rh[d.i - 1] = AW.round(lo[0] + dv, 1); }
      TB().fit(ee); E.refreshElems(); updPos(); return;
    }
    if (d.mode === 'gnew' || d.mode === 'gmv') {
      var gv = d.ax === 'v' ? p.x : p.y, lim = d.ax === 'v' ? pg.w : pg.h; if (sn) gv = Math.round(gv / gs) * gs; gv = AW.round(gv, 1); d.moved = true;
      var gsn = (ev.ctrlKey || ev.metaKey) ? { best: null, P: [] } : guideSnap(d.ax, gv, d.mode === 'gmv' ? d.i : -1); if (gsn.best) gv = AW.round(gsn.best.v, 2); d.pos = gv; guideDims(d.ax, gv, gsn.P, !!gsn.best);
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
      if (AW.Plate && pg.plate) AW.Plate.clampMove(d.list.map(function (it) { return it.e; }), pg);
      smartGuides(st.cfg.guides && !(ev.ctrlKey || ev.metaKey) ? d.list.map(function (it) { return it.e; }) : null);
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
      if (e.t === 'table' && d.oT) { TB().scaleFrom(e, d.oT, e.w, e.h); if (h.indexOf('w') >= 0) e.x = AW.round(o.x + o.w - e.w, 2); if (h.indexOf('n') >= 0) e.y = AW.round(o.y + o.h - e.h, 2); }
      if (e.t === 'text' && o.size && !ev.altKey && o.w > 0 && o.h > 0) {      // 크기를 바꾸면 글자 크기도 비례(모서리: 가로·세로 평균, 위·아래 변: 높이). Alt: 글자 크기 고정
        var wr = e.w / o.w, hr = e.h / o.h, fr = h.length === 2 ? Math.sqrt(wr * hr) : (h === 'n' || h === 's') ? hr : 1;
        e.size = Math.max(4, Math.min(300, Math.round(o.size * fr * 2) / 2)); var dn = domOf(e); if (dn) dn.style.fontSize = e.size * 25.4 / 72 * st.zoom + 'px';
      }
      if (!ev.shiftKey && !cen) resizeSnap(e, h);
      liveUpdate();
    }
  }
  // 스마트 가이드(이동·크기): 선택 전체의 왼쪽/가운데/오른쪽(위/중간/아래)을 용지·다른 개체·안내선에 붙이고 분홍 선 표시.
  // 용지 가운데는 자주색 「가운데」 표시. 개체 사이가 같은 간격이 되면 간격(mm)을 막대로 표시하며 붙임.
  function sgLine(ax, at, cls, label) { var g = document.createElement('div'); g.className = 'snapg ' + (ax === 'x' ? 'gv' : 'gh') + (cls ? ' ' + cls : ''); g.style[ax === 'x' ? 'left' : 'top'] = at * st.zoom + 'px'; if (label) g.innerHTML = '<i>' + label + '</i>'; st.ov.appendChild(g); }
  function sgGap(ax, a, b, cross, val) {
    var k = st.zoom, g = document.createElement('div'); g.className = 'snapg gap ' + (ax === 'x' ? 'gp-h' : 'gp-v');
    g.style.cssText = ax === 'x' ? 'left:' + a * k + 'px;width:' + (b - a) * k + 'px;top:' + cross * k + 'px' : 'top:' + a * k + 'px;height:' + (b - a) * k + 'px;left:' + cross * k + 'px'; g.innerHTML = '<i>' + AW.round(val, 1) + '</i>'; st.ov.appendChild(g);
  }
  function guideTargets(others) {
    var pg = T().page, tx = [{ v: 0, k: 'page' }, { v: pg.w / 2, k: 'pc' }, { v: pg.w, k: 'page' }], ty = [{ v: 0, k: 'page' }, { v: pg.h / 2, k: 'pc' }, { v: pg.h, k: 'page' }];
    others.forEach(function (o) { tx.push({ v: o.x }, { v: o.x + o.w / 2 }, { v: o.x + o.w }); ty.push({ v: o.y }, { v: o.y + o.h / 2 }, { v: o.y + o.h }); });
    if (AW.Plate && pg.plate) AW.Plate.targets(pg, tx, ty);
    var gd = pg.guides; if (gd && st.cfg.gshow !== false) { (gd.v || []).forEach(function (v) { tx.push({ v: v, k: 'guide' }); }); (gd.h || []).forEach(function (h) { ty.push({ v: h, k: 'guide' }); }); }
    return { x: tx, y: ty };
  }
  function bestSnap(lines, targets, TH) { var r = null; lines.forEach(function (l) { targets.forEach(function (t) { var d = t.v - l; if (Math.abs(d) < TH && (!r || Math.abs(d) < Math.abs(r.d) - 1e-6 || (Math.abs(Math.abs(d) - Math.abs(r.d)) < 1e-6 && t.k === 'pc'))) r = { d: d, at: t.v, k: t.k }; }); }); return r; }
  function spaceSnap(ax, B, others, TH) {   // 같은 간격 찾기: ① 양옆 개체와의 간격이 같음 ② 이미 있는 두 개체 사이 간격과 같음
    var p = ax === 'x' ? 'x' : 'y', sz = ax === 'x' ? 'w' : 'h', c = ax === 'x' ? 'y' : 'x', cs = ax === 'x' ? 'h' : 'w';
    var arr = others.filter(function (o) { return o[c] < B[c] + B[cs] && o[c] + o[cs] > B[c]; }).sort(function (a, b) { return a[p] - b[p]; }); if (!arr.length) return null;
    var left = null, right = null; arr.forEach(function (o) { var r = o[p] + o[sz]; if (r <= B[p] + 0.01 && (!left || r > left[p] + left[sz])) left = o; if (o[p] >= B[p] + B[sz] - 0.01 && (!right || o[p] < right[p])) right = o; });
    var cands = [], mid = function (o) { return (Math.max(o[c], B[c]) + Math.min(o[c] + o[cs], B[c] + B[cs])) / 2; };
    if (left && right) { var gl = B[p] - (left[p] + left[sz]), gr = right[p] - (B[p] + B[sz]), d0 = (gr - gl) / 2; if (Math.abs(d0) < TH && gl > 0.3 && gr > 0.3) cands.push({ d: d0, gaps: [[left[p] + left[sz], B[p] + d0], [B[p] + B[sz] + d0, right[p]]], ref: left }); }
    for (var i = 0; i < arr.length - 1; i++) {
      var A = arr[i], C = arr[i + 1], g = C[p] - (A[p] + A[sz]); if (g < 0.5) continue;
      if (B[p] >= C[p] + C[sz] - 0.01) { var t = C[p] + C[sz] + g, d1 = t - B[p]; if (Math.abs(d1) < TH) cands.push({ d: d1, gaps: [[A[p] + A[sz], C[p]], [C[p] + C[sz], t]], ref: C }); }
      if (B[p] + B[sz] <= A[p] + 0.01) { var t2 = A[p] - g - B[sz], d2 = t2 - B[p]; if (Math.abs(d2) < TH) cands.push({ d: d2, gaps: [[t2 + B[sz], A[p]], [A[p] + A[sz], C[p]]], ref: A }); }
    }
    if (!cands.length) return null; cands.sort(function (a, b) { return Math.abs(a.d) - Math.abs(b.d); }); var r0 = cands[0]; r0.cross = mid(r0.ref); return r0;
  }
  function smartGuides(list) {
    AW.$$('.snapg', st.ov).forEach(function (g) { g.remove(); });
    if (!list || !list.length) return; var TH = st.cfg.th || 1.2, ids = {}; list.forEach(function (e) { ids[e.id] = 1; });
    var others = T().elems.filter(function (o) { return !ids[o.id] && !o.hide; }), B = bounds(list), tg = guideTargets(others);
    var rx = bestSnap([B.x, B.x + B.w / 2, B.x + B.w], tg.x, TH), ry = bestSnap([B.y, B.y + B.h / 2, B.y + B.h], tg.y, TH);
    if (rx) { list.forEach(function (e) { e.x = AW.round(e.x + rx.d, 2); }); B.x += rx.d; } if (ry) { list.forEach(function (e) { e.y = AW.round(e.y + ry.d, 2); }); B.y += ry.d; }
    var sx = rx ? null : spaceSnap('x', B, others, TH), sy = ry ? null : spaceSnap('y', B, others, TH);
    if (sx) { list.forEach(function (e) { e.x = AW.round(e.x + sx.d, 2); }); B.x += sx.d; sx.gaps.forEach(function (g) { sgGap('x', g[0], g[1], sx.cross, g[1] - g[0]); }); }
    if (sy) { list.forEach(function (e) { e.y = AW.round(e.y + sy.d, 2); }); B.y += sy.d; sy.gaps.forEach(function (g) { sgGap('y', g[0], g[1], sy.cross, g[1] - g[0]); }); }
    if (rx) sgLine('x', rx.at, rx.k === 'pc' ? 'pc' : '', rx.k === 'pc' ? '가운데' : ''); if (ry) sgLine('y', ry.at, ry.k === 'pc' ? 'pc' : '', ry.k === 'pc' ? '가운데' : '');
  }
  function resizeSnap(e, h) {   // 크기 조절 중 움직이는 변을 용지·다른 개체·안내선에 붙임
    AW.$$('.snapg', st.ov).forEach(function (g) { g.remove(); }); if (!st.cfg.guides) return; var TH = st.cfg.th || 1.2, others = T().elems.filter(function (o) { return o.id !== e.id && S.sel.indexOf(o.id) < 0 && !o.hide; }), tg = guideTargets(others), r;
    if (h.indexOf('e') >= 0 && (r = bestSnap([e.x + e.w], tg.x, TH))) { e.w = AW.round(e.w + r.d, 2); sgLine('x', r.at, r.k === 'pc' ? 'pc' : '', r.k === 'pc' ? '가운데' : ''); }
    if (h.indexOf('w') >= 0 && (r = bestSnap([e.x], tg.x, TH))) { e.x = AW.round(e.x + r.d, 2); e.w = AW.round(e.w - r.d, 2); sgLine('x', r.at, r.k === 'pc' ? 'pc' : '', r.k === 'pc' ? '가운데' : ''); }
    if (e.t !== 'line') {
      if (h.indexOf('s') >= 0 && (r = bestSnap([e.y + e.h], tg.y, TH))) { e.h = AW.round(e.h + r.d, 2); sgLine('y', r.at, r.k === 'pc' ? 'pc' : '', r.k === 'pc' ? '가운데' : ''); }
      if (h.indexOf('n') >= 0 && (r = bestSnap([e.y], tg.y, TH))) { e.y = AW.round(e.y + r.d, 2); e.h = AW.round(e.h - r.d, 2); sgLine('y', r.at, r.k === 'pc' ? 'pc' : '', r.k === 'pc' ? '가운데' : ''); }
    }
  }
  // 안내선 사이 간격: 끌 때 가운데·같은 간격에 붙이고 간격(mm)을 표시, 안내선이 2개 이상이면 항상 간격을 표시(같은 간격은 초록 「=」)
  function guideSnap(ax, gv, skipI) {
    var lim = ax === 'v' ? T().page.w : T().page.h, arr = (guides()[ax] || []).filter(function (_, j) { return j !== skipI; }), P = arr.concat([0, lim]).sort(function (a, b) { return a - b; }), TH = st.cfg.th || 1.2, best = null;
    var a = null, b = null; P.forEach(function (q) { if (q <= gv && (a === null || q > a)) a = q; if (q >= gv && (b === null || q < b)) b = q; });
    if (a !== null && b !== null && b - a > 1) { var m = (a + b) / 2; if (Math.abs(gv - m) < TH) best = { v: m, eq: true }; }
    for (var i = 0; i < P.length - 1; i++) { var g = P[i + 1] - P[i]; if (g < 0.5) continue; [P[i + 1] + g, P[i] - g].forEach(function (t) { if (t >= 0 && t <= lim && Math.abs(gv - t) < TH && (!best || Math.abs(gv - t) < Math.abs(gv - best.v))) best = { v: t, eq: true }; }); }
    return { best: best, P: P };
  }
  function guideDims(ax, gv, P, eq) {
    AW.$$('.gdim', st.ov).forEach(function (n) { n.remove(); }); var a = null, b = null, k = st.zoom; P.forEach(function (q) { if (q < gv - 0.01 && (a === null || q > a)) a = q; if (q > gv + 0.01 && (b === null || q < b)) b = q; });
    [[a, gv], [gv, b]].forEach(function (pr) { if (pr[0] === null || pr[1] === null) return; var d = document.createElement('div'); d.className = 'gdim ' + (eq ? 'eq ' : '') + (ax === 'h' ? 'hz' : ''); d.textContent = AW.round(pr[1] - pr[0], 1) + ' mm'; d.style[ax === 'v' ? 'left' : 'top'] = ((pr[0] + pr[1]) / 2) * k + 'px'; d.style[ax === 'v' ? 'top' : 'left'] = '8px'; st.ov.appendChild(d); });
  }
  function onUp() {
    var d = st.drag; if (!d) return; st.drag = null;
    AW.$$('.snapg,.mq,.gl.prev,.gdim', st.ov || document).forEach(function (g) { g.remove(); });
    if (d.mode === 'rot') { if (d.moved) { E.refreshElems(); changed('elems', false, '회전'); } return; }
    if (d.mode === 'gnew' || d.mode === 'gmv') {
      var lim2 = d.ax === 'v' ? T().page.w : T().page.h, g = guides();
      if (d.mode === 'gnew') { if (d.moved && d.pos != null && d.pos >= 0 && d.pos <= lim2) { g[d.ax].push(d.pos); changed('page', false, '안내선 추가'); } }
      else if (d.moved) { if (d.pos < 0 || d.pos > lim2) g[d.ax].splice(d.i, 1); changed('page'); }
      markSel(); return;
    }
    if (d.mode === 'mq') { AW.emit('selchange'); return; }
    if (d.mode === 'tcell' || d.mode === 'pan') return;
    if (d.mode === 'tedge') { if (d.moved) changed('elems', false, d.dir === 'v' ? '표 칸 너비' : '표 줄 높이'); return; }
    if (d.mode === 'rs' || d.moved) { E.refreshElems(); changed('elems', false, d.mode === 'rs' ? '크기 조절' : '이동'); }
    if (st.pending) { st.pending = false; E.relayout(); }
  }


  /* ───────────── 표: 셀 선택·편집 ───────────── */
  function TB() { return AW.Table; }
  E.tsel = function () { return st.tsel || null; };
  E.autoFit = function () { var ch = st.pg && AW.Table.autoFit(st.pg, true); if (ch) { E.refreshElems(); S.dirty = true; } return ch; };
  E.drawTSel = function () { drawTSel(); };
  function tTable() { var s = st.tsel, e = s && AW.get(s.id); return e && e.t === 'table' ? e : null; }
  function tLast(e) { var s = st.tsel && st.tsel.id === e.id ? st.tsel : null; if (s) return { r: s.r0, c: s.c0 }; var l = st.tlast; return l && l.id === e.id && l.r < e.rows && l.c < e.cols ? l : { r: 0, c: 0 }; }
  function tSet(e, ar, ac, fr, fc, all) {
    var n = TB().norm(e, { r0: ar, c0: ac, r1: fr, c1: fc }); st.tsel = { id: e.id, ar: ar, ac: ac, fr: fr, fc: fc, r0: n.r0, c0: n.c0, r1: n.r1, c1: n.c1, all: !!all }; st.tlast = { id: e.id, r: n.r0, c: n.c0 }; drawTSel();
  }
  function drawTSel() {
    if (!st.ov) return; AW.$$('.tcs', st.ov).forEach(function (n) { n.remove(); });
    var s = st.tsel, e = s && AW.get(s.id);
    if (!e || e.t !== 'table' || S.sel.length !== 1 || S.sel[0] !== e.id) { if (s) st.tsel = null; return; }
    if (s.r1 >= e.rows || s.c1 >= e.cols) { st.tsel = null; return; }
    var rc = TB().rect(e, s), g = TB().geom(e), box = document.createElement('div'); box.className = 'tcs'; placeBox(box, e);
    var q = document.createElement('div'); q.className = 'tc-sel'; q.style.cssText = 'left:' + rc.x / g.sw * 100 + '%;top:' + rc.y / g.sh * 100 + '%;width:' + rc.w / g.sw * 100 + '%;height:' + rc.h / g.sh * 100 + '%';
    q.innerHTML = '<i>' + (s.all ? '표 전체' : (s.r0 === s.r1 && s.c0 === s.c1 ? (s.r0 + 1) + '줄 ' + (s.c0 + 1) + '칸' : (s.r1 - s.r0 + 1) + '줄 × ' + (s.c1 - s.c0 + 1) + '칸 선택')) + '</i>';
    box.appendChild(q); st.ov.appendChild(box);
  }
  function tF5() {
    var l = sel(), e = l.length === 1 && l[0].t === 'table' ? l[0] : null; if (!e || e.lock) return false;
    var s = st.tsel && st.tsel.id === e.id ? st.tsel : null;
    if (!s) { var lc = tLast(e); tSet(e, lc.r, lc.c, lc.r, lc.c); }
    else if (!s.all) tSet(e, 0, 0, e.rows - 1, e.cols - 1, true);
    else { st.tsel = null; drawTSel(); }
    return true;
  }
  function tHit(e, ev) {   // 포인터 → 표 안쪽 좌표(mm, 왼쪽 위 기준). 회전·반전 반영
    var p = toMM(ev), dx = p.x - (e.x + e.w / 2), dy = p.y - (e.y + e.h / 2);
    if (e.rot) { var a = -e.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), rx = dx * c - dy * s, ry = dx * s + dy * c; dx = rx; dy = ry; }
    if (e.flipX) dx = -dx; if (e.flipY) dy = -dy; return { x: dx + e.w / 2, y: dy + e.h / 2 };
  }
  function tEdgeAt(e, h) {   // 안쪽 칸 경계 근처인지
    var g = TB().geom(e), tol = Math.max(0.8, 4 / st.zoom), i;
    for (i = 1; i < e.cols; i++) if (Math.abs(h.x - g.X[i]) < tol && h.y >= -tol && h.y <= g.sh + tol) return { dir: 'v', i: i };
    for (i = 1; i < e.rows; i++) if (Math.abs(h.y - g.Y[i]) < tol && h.x >= -tol && h.x <= g.sw + tol) return { dir: 'h', i: i };
    return null;
  }
  function tTableDown(ev, node) {   // 이미 선택된 표를 누르면 셀 선택·칸 경계 조절. 처음 누르면 표 선택(이동 가능)
    var e = AW.get(node.dataset.id); if (!e || e.t !== 'table' || e.lock || ev.ctrlKey || ev.metaKey) return false;
    var was = S.sel.length === 1 && S.sel[0] === e.id, h = tHit(e, ev), cell = TB().cellAt(e, h.x, h.y);
    if (!was) { if (cell && !ev.shiftKey) st.tlast = { id: e.id, r: cell.r, c: cell.c }; return false; }
    var eg = tEdgeAt(e, h);
    if (eg) { st.drag = { mode: 'tedge', e: e, dir: eg.dir, i: eg.i, start: toMM(ev), o: eg.dir === 'v' ? [e.cw[eg.i - 1], e.cw[eg.i]] : [e.rh[eg.i - 1]], moved: false }; ev.preventDefault(); return true; }
    if (!cell) return false;
    var s = st.tsel && st.tsel.id === e.id ? st.tsel : null, ar = ev.shiftKey && s ? s.ar : cell.r, ac = ev.shiftKey && s ? s.ac : cell.c;
    tSet(e, ar, ac, cell.r, cell.c); st.drag = { mode: 'tcell', e: e, ar: ar, ac: ac, lr: cell.r, lc: cell.c, start: toMM(ev) };
    ev.preventDefault(); st.stage.focus({ preventScroll: true }); return true;
  }
  function tCopy(cut) {
    var e = tTable(), s = st.tsel, own = TB().own(e), rows = [], r, c, n = 0;
    for (r = s.r0; r <= s.r1; r++) { var row = []; for (c = s.c0; c <= s.c1; c++) { var o = own[r][c], t = o[0] === r && o[1] === c ? (e.cells[r][c].text || '') : ''; row.push(/[\t\n"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t); if (cut && t) { e.cells[r][c].text = ''; n++; } } rows.push(row.join('\t')); }
    var txt = rows.join('\n'); try { navigator.clipboard.writeText(txt); } catch (x) {}
    AW.toast((cut ? '잘라냈습니다' : '복사했습니다') + ' (엑셀·메모장에 붙여넣을 수 있습니다)'); if (n) { E.refreshElems(); changed('elems', false, '표 셀 잘라내기'); }
  }
  function tPaste(text) {   // 엑셀·메모장에서 복사한 칸 → 선택한 셀부터 채움. 모자라는 줄·칸은 자동 추가
    var e = tTable(), s = st.tsel, Tb = TB(), rows = [], cur = '', row = [], q = false, i, ch;
    text = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
    for (i = 0; i < text.length; i++) { ch = text.charAt(i); if (q) { if (ch === '"') { if (text.charAt(i + 1) === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"' && !cur) q = true; else if (ch === '\t') { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch; }
    row.push(cur); rows.push(row);
    var nc = Math.max.apply(null, rows.map(function (r) { return r.length; })); rows = rows.slice(0, 200);
    while (s.r0 + rows.length > e.rows && e.rows < 60) Tb.insertRow(e, e.rows); while (s.c0 + nc > e.cols && e.cols < 30) Tb.insertCol(e, e.cols);
    var own = Tb.own(e), n = 0; rows.forEach(function (rw, a) { rw.forEach(function (v, b) { var r = s.r0 + a, c = s.c0 + b; if (r >= e.rows || c >= e.cols) return; var o = own[r][c]; e.cells[o[0]][o[1]].text = v; n++; }); });
    E.refreshElems(); E.autoFit(); tSet(e, s.r0, s.c0, Math.min(e.rows - 1, s.r0 + rows.length - 1), Math.min(e.cols - 1, s.c0 + nc - 1)); changed('elems', false, '표에 붙여넣기'); AW.toast(n + '칸을 붙여넣었습니다.', 'ok');
  }
  function tMove(e, dr, dc, ext) {
    var s = st.tsel, own = TB().own(e), br = ext ? s.fr : s.ar, bc = ext ? s.fc : s.ac, o = own[br][bc], k = e.cells[o[0]][o[1]], r = br, c = bc;
    if (dr > 0) r = o[0] + (k.rs || 1); else if (dr < 0) r = o[0] - 1; if (dc > 0) c = o[1] + (k.cs || 1); else if (dc < 0) c = o[1] - 1;
    r = Math.max(0, Math.min(e.rows - 1, r)); c = Math.max(0, Math.min(e.cols - 1, c)); var o2 = own[r][c];
    if (ext) tSet(e, s.ar, s.ac, o2[0], o2[1]); else tSet(e, o2[0], o2[1], o2[0], o2[1]);
  }
  function tNext(e, back) {   // Tab: 다음 칸(마지막 칸에서는 줄을 하나 더 넣음)
    var s = st.tsel, own = TB().own(e), o = own[s.r0][s.c0], k = e.cells[o[0]][o[1]], r = o[0], c = back ? o[1] - 1 : o[1] + (k.cs || 1);
    if (c >= e.cols) { c = 0; r = o[0] + (k.rs || 1); } if (c < 0) { c = e.cols - 1; r = o[0] - 1; } if (r < 0) return null;
    if (r >= e.rows) { TB().insertRow(e, e.rows); changed('elems', false, '표 줄 추가'); E.refreshElems(); }
    var o2 = TB().own(e)[r][c]; tSet(e, o2[0], o2[1], o2[0], o2[1]); return o2;
  }
  function tKey(ev, k, mod) {
    var e = tTable(); if (!e || mod || ev.altKey || e.lock || S.sel.length !== 1) return false;
    var s = st.tsel, ar = k === 'arrowdown' ? [1, 0] : k === 'arrowup' ? [-1, 0] : k === 'arrowright' ? [0, 1] : k === 'arrowleft' ? [0, -1] : null;
    if (ar) { ev.preventDefault(); tMove(e, ar[0], ar[1], ev.shiftKey); return true; }
    if (k === 'tab') { ev.preventDefault(); tNext(e, ev.shiftKey); return true; }
    if (k === 'enter' || k === 'f2') { ev.preventDefault(); beginCellEdit(e, s.r0, s.c0); return true; }
    if (k === 'delete' || k === 'backspace') { ev.preventDefault(); var own = TB().own(e), n = 0; for (var r = s.r0; r <= s.r1; r++) for (var c = s.c0; c <= s.c1; c++) { var o = own[r][c], kc = e.cells[o[0]][o[1]]; if (kc.text) { kc.text = ''; n++; } } if (n) { E.refreshElems(); changed('elems', false, '표 셀 내용 지움'); } return true; }
    if (k === 'escape') { st.tsel = null; drawTSel(); return true; }
    return false;
  }
  function beginCellEdit(e, r, c) {
    endEdit(); var d = domOf(e), n = d && AW.$('.tc[data-r="' + r + '"][data-c="' + c + '"] .tx', d); if (!n) return;
    tSet(e, r, c, r, c); n.textContent = e.cells[r][c].text || '';
    var cell = n.parentNode; cell.style.outline = '2px solid #0EA5E9'; cell.style.background = 'rgba(255,255,255,.9)'; cell.style.overflow = 'visible'; n.style.cursor = 'text'; n.style.minHeight = '1em';
    try { n.contentEditable = 'plaintext-only'; } catch (x) {} if (n.contentEditable !== 'plaintext-only') n.contentEditable = 'true';
    st.editing = { id: e.id, node: n, cell: [r, c] };
    n.addEventListener('blur', function () { if (st.editing && st.editing.node === n) endEdit(); }, { once: true });
    n.focus(); var rg = document.createRange(); rg.selectNodeContents(n); rg.collapse(false); var sl = window.getSelection(); sl.removeAllRanges(); sl.addRange(rg);
    n.addEventListener('keydown', function kd(k) {
      if (k.key === 'Escape') { n.removeEventListener('keydown', kd); endEdit(); k.stopPropagation(); return; }
      if (k.key === 'Tab') { k.preventDefault(); n.removeEventListener('keydown', kd); endEdit(); var o2 = tNext(e, k.shiftKey); if (o2) beginCellEdit(e, o2[0], o2[1]); }
      k.stopPropagation();
    });
  }
  function tAct(a) {
    var e = sel()[0]; if (!e || e.t !== 'table' || sel().length !== 1) return; var Tb = TB(), l = tLast(e), s = st.tsel && st.tsel.id === e.id ? st.tsel : { r0: l.r, c0: l.c, r1: l.r, c1: l.c };
    var rg = Tb.norm(e, s), done = function (label) { st.tsel = null; Tb.fit(e); E.refreshElems(); changed('elems', false, label); }, r, c;
    if (a === 't-f5') return tF5(); if (a === 't-edit') return beginCellEdit(e, rg.r0, rg.c0);
    if (a === 't-merge') { if (!Tb.merge(e, rg)) return AW.toast('합칠 셀을 2개 이상 선택해 주십시오. (F5 → Shift+화살표 또는 끌기)'); done('셀 합치기'); return tSet(e, rg.r0, rg.c0, rg.r0, rg.c0); }
    if (a === 't-split') { var any = false, own = Tb.own(e); for (r = rg.r0; r <= rg.r1; r++) for (c = rg.c0; c <= rg.c1; c++) if (own[r][c][0] === r && own[r][c][1] === c && Tb.unmerge(e, r, c)) any = true; if (!any) return AW.toast('합쳐진 셀이 아닙니다.'); return done('셀 나누기'); }
    if (a === 't-rowA') { Tb.insertRow(e, rg.r0); return done('줄 넣기'); } if (a === 't-rowB') { Tb.insertRow(e, rg.r1 + 1); return done('줄 넣기'); }
    if (a === 't-colA') { Tb.insertCol(e, rg.c0); return done('칸 넣기'); } if (a === 't-colB') { Tb.insertCol(e, rg.c1 + 1); return done('칸 넣기'); }
    if (a === 't-rowD') { for (r = rg.r1; r >= rg.r0; r--) if (!Tb.deleteRow(e, r)) break; return done('줄 지우기'); }
    if (a === 't-colD') { for (c = rg.c1; c >= rg.c0; c--) if (!Tb.deleteCol(e, c)) break; return done('칸 지우기'); }
    if (a === 't-eqw') { if (!Tb.equalize(e, 'w', rg.c1 > rg.c0 ? rg : null)) return AW.toast('같게 할 칸이 없습니다.'); return done('칸 너비 같게'); }
    if (a === 't-eqh') { if (!Tb.equalize(e, 'h', rg.r1 > rg.r0 ? rg : null)) return AW.toast('같게 할 줄이 없습니다.'); return done('줄 높이 같게'); }
  }
  document.addEventListener('keyup', function (ev) { if (ev.key === ' ' && st.space) { st.space = false; st.stage && st.stage.classList.remove('pan'); } });
  window.addEventListener('blur', function () { st.space = false; st.stage && st.stage.classList.remove('pan'); });
  function hoverChip(ev) {   // 마우스를 올린 개체의 위치·크기 표시 (선택되지 않은 개체)
    var n = ev.target.closest && ev.target.closest('.el'), id = n && st.stage.contains(n) && S.sel.indexOf(n.dataset.id) < 0 ? n.dataset.id : null, cur = AW.$('.hv', st.ov);
    if (cur && cur.dataset.id === id) return; if (cur) cur.remove(); if (!id) return;
    var e = AW.get(id); if (!e || e.hide) return; var b = document.createElement('div'); b.className = 'hv'; b.dataset.id = id; placeBox(b, e);
    b.innerHTML = '<i>' + AW.round(e.w, 1) + ' × ' + AW.round(e.t === 'line' ? e.sw || 0.5 : e.h, 1) + ' mm · (' + AW.round(e.x, 1) + ', ' + AW.round(e.y, 1) + ')</i>'; st.ov.insertBefore(b, st.ov.firstChild);
  }
  // 선택된 표의 칸 경계 위에서는 마우스 모양을 바꿔 알려 줌
  document.addEventListener('pointermove', function (ev) {
    if (!st.stage || st.drag || !st.pg || ev.buttons) return; if (st.ov && !st.editing) hoverChip(ev); var n = ev.target.closest && ev.target.closest('.el-table'), e = n && AW.get(n.dataset.id), cur = '';
    if (e && S.sel.length === 1 && S.sel[0] === e.id && !e.lock) { var eg = tEdgeAt(e, tHit(e, ev)); if (eg) cur = eg.dir === 'v' ? 'col-resize' : 'row-resize'; }
    if (st.stage.style.cursor !== cur) st.stage.style.cursor = cur;
  });

  /* ───────────── 인라인 편집 ───────────── */
  function onDbl(ev) {
    var tcn = ev.target.closest('.el-table .tc');
    if (tcn) { var te = AW.get(tcn.closest('.el').dataset.id); if (te && !te.lock) { E.setSel([te.id]); beginCellEdit(te, +tcn.dataset.r, +tcn.dataset.c); } return; }
    var n = ev.target.closest('.el-text'); if (!n) return;
    var e = AW.get(n.dataset.id); if (!e || e.lock) return;
    if (e.grp && S.sel.length > 1) { S.sel = [e.id]; markSel(); updTools(); AW.emit('selchange'); return; }   // 그룹 안에서 더블클릭: 이 요소만 선택
    E.setSel([e.id]); beginEdit(e, n);
  }
  /* 글상자 안 부분 글자 크기(워드 방식): 더블클릭 → 줄일 글자를 드래그 → 글자 크기 칸 입력/±.
   * 저장 형식은 [s=N]글[/s](N = 상자 글자 크기 대비 %). 편집 중에는 실제 크기로 보이고, 끝나면 다시 표기로 저장. */
  function runsOf(text) {
    var out = [], re = /\[s=(\d{2,3})\]([\s\S]*?)\[\/s\]/g, i = 0, m;
    while ((m = re.exec(text))) { if (m.index > i) out.push({ t: text.slice(i, m.index), p: 100 }); out.push({ t: m[2], p: +m[1] }); i = re.lastIndex; }
    if (i < text.length) out.push({ t: text.slice(i), p: 100 }); return out;
  }
  function mergeRuns(rs) { var o = []; rs.forEach(function (r) { if (!r.t) return; var l = o[o.length - 1]; if (l && l.p === r.p) l.t += r.t; else o.push({ t: r.t, p: r.p }); }); return o; }
  function runsText(rs) { return mergeRuns(rs).map(function (r) { return r.p === 100 ? r.t : '[s=' + r.p + ']' + r.t + '[/s]'; }).join(''); }
  function runsHtml(rs) { return rs.map(function (r) { return r.p === 100 ? AW.esc(r.t) : '<span data-p="' + r.p + '" style="font-size:' + r.p + '%">' + AW.esc(r.t) + '</span>'; }).join(''); }
  function domRuns(b) {
    var out = []; (function walk(n, p) { Array.prototype.forEach.call(n.childNodes, function (c) { if (c.nodeType === 3) out.push({ t: c.nodeValue.replace(/ /g, ' '), p: p }); else if (c.nodeName === 'BR') out.push({ t: '\n', p: p }); else if (c.nodeType === 1) walk(c, c.dataset && c.dataset.p ? +c.dataset.p : p); }); })(b, 100); return out;
  }
  function selOffsets(b) {
    var s = window.getSelection(); if (!s.rangeCount) return null; var r = s.getRangeAt(0); if (!b.contains(r.startContainer) || !b.contains(r.endContainer)) return null;
    var off = function (node, o) { var pr = document.createRange(); pr.selectNodeContents(b); pr.setEnd(node, o); return pr.cloneContents().textContent.length; };
    return [off(r.startContainer, r.startOffset), off(r.endContainer, r.endOffset)];
  }
  function setOffsets(b, s, e) {
    var pos = 0, r = document.createRange(), got = false; r.selectNodeContents(b); r.collapse(false);
    (function walk(n) {
      for (var i = 0; i < n.childNodes.length; i++) {
        var c = n.childNodes[i];
        if (c.nodeType === 3) { var l = c.nodeValue.length; if (!got && s <= pos + l) { r.setStart(c, s - pos); r.setEnd(c, s - pos); got = true; } if (got && e <= pos + l) { r.setEnd(c, e - pos); return true; } pos += l; }
        else if (c.nodeType === 1 && walk(c)) return true;
      }
      return false;
    })(b);
    var sl = window.getSelection(); sl.removeAllRanges(); sl.addRange(r);
  }
  function runSizeAt(ed, sel) {   // 선택(또는 커서)에 걸린 글자의 크기(pt). 크기가 섞여 있으면 null
    var e = AW.get(ed.id), base = e ? e.size || 16 : 16, rs = domRuns(ed.node), s = sel ? sel[0] : 0, en = sel ? Math.max(sel[1], s + 1) : 0, pos = 0, ps = {};
    rs.forEach(function (r) { var a = pos, b = pos + r.t.length; pos = b; if (b > s && a < en) ps[r.p] = 1; });
    var k = Object.keys(ps); return k.length === 1 ? AW.round(base * k[0] / 100, 1) : k.length ? null : base;
  }
  function runSizeNow() { var ed = st.editing, v = ed && runSizeAt(ed, ed.sel); return v == null ? (AW.get(ed.id).size || 16) : v; }
  function applyRunSize(pt) {
    var ed = st.editing; if (!ed || !ed.runs) return false;
    var e = AW.get(ed.id), base = e.size || 16, pct = Math.max(10, Math.min(999, Math.round(pt / base * 100))), s = ed.sel && ed.sel[0], en = ed.sel && ed.sel[1];
    if (s == null || s === en) { AW.toast('크기를 바꿀 글자를 먼저 드래그해 선택해 주십시오. (상자 전체 크기는 글상자를 선택만 한 상태에서 바꿉니다)'); ed.node.focus(); return true; }
    var out = [], pos = 0;
    domRuns(ed.node).forEach(function (r) {
      var a = pos, b = pos + r.t.length; pos = b; if (b <= s || a >= en) { out.push(r); return; }
      var i0 = Math.max(s, a) - a, i1 = Math.min(en, b) - a;
      if (i0 > 0) out.push({ t: r.t.slice(0, i0), p: r.p }); out.push({ t: r.t.slice(i0, i1), p: pct }); if (i1 < r.t.length) out.push({ t: r.t.slice(i1), p: r.p });
    });
    ed.node.innerHTML = runsHtml(mergeRuns(out)); ed.node.focus(); setOffsets(ed.node, s, en); ed.sel = [s, en]; syncRunSize(ed); return true;
  }
  function syncRunSize(ed) { var i = AW.$('[data-p="size"]', st.root); if (i && document.activeElement !== i) { var v = runSizeAt(ed, ed.sel); i.value = v == null ? '' : v; i.placeholder = v == null ? '여러 크기' : ''; } }
  document.addEventListener('selectionchange', function () { var ed = st.editing; if (!ed || !ed.runs) return; var o = selOffsets(ed.node); if (o) { ed.sel = o; syncRunSize(ed); } });
  function beginEdit(e, node) {
    var b = node.firstChild; b.innerHTML = runsHtml(runsOf(e[tk()] || '')); b.style.outline = '2px solid #0EA5E9'; b.style.cursor = 'text'; b.style.background = 'rgba(255,255,255,.85)'; b.style.whiteSpace = 'pre-wrap';
    try { b.contentEditable = 'plaintext-only'; } catch (x) {} if (b.contentEditable !== 'plaintext-only') b.contentEditable = 'true';
    var ed = st.editing = { id: e.id, node: b, runs: true, sel: null };
    var keepOn = function (t) { return t && t.dataset && (t.dataset.p === 'size' || t.dataset.a === 'sz-' || t.dataset.a === 'sz+'); };
    ed.onBlur = function (ev) { if (st.editing === ed && !keepOn(ev.relatedTarget)) endEdit(); };      // 글자 크기 칸·± 로 옮길 때는 편집 유지
    ed.onDown = function (ev) { if (st.editing === ed && !b.contains(ev.target) && !(ev.target.closest && ev.target.closest('[data-p="size"],[data-a="sz-"],[data-a="sz+"]'))) endEdit(); };
    b.addEventListener('blur', ed.onBlur); document.addEventListener('mousedown', ed.onDown, true);
    b.focus();
    var r = document.createRange(); r.selectNodeContents(b); r.collapse(false); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    b.addEventListener('keydown', function kd(k) { if (k.key === 'Escape') { b.removeEventListener('keydown', kd); endEdit(); } k.stopPropagation(); });
  }
  function endEdit() {
    var ed = st.editing; if (!ed) return; st.editing = null;
    if (ed.onBlur) { ed.node.removeEventListener('blur', ed.onBlur); document.removeEventListener('mousedown', ed.onDown, true); }
    var e = AW.get(ed.id);
    if (e && ed.cell) { var kc = e.cells[ed.cell[0]] && e.cells[ed.cell[0]][ed.cell[1]], tt = ed.node.innerText.replace(/\u00a0/g, ' ').replace(/\n$/, ''); if (kc && tt !== (kc.text || '')) { kc.text = tt; changed('elems', false, '표 글 입력'); } }
    else if (e) { var t = (ed.runs ? runsText(domRuns(ed.node)) : ed.node.innerText.replace(/\u00a0/g, ' ')).replace(/\n$/, ''); if (t !== (e[tk()] || '')) { e[tk()] = t; changed('elems'); } }
    E.refreshElems(); if (ed.cell && E.autoFit()) changed('elems', false, '표 줄 높이 자동');
    if (st.pending) { st.pending = false; E.relayout(); }
  }

  /* ───────────── 키보드 ───────────── */
  function onKey(ev) {
    if (!st.root || !st.root.offsetParent) return;
    var tg = ev.target, typing = tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable);
    var mod = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase();
    if (mod && k === 's') { ev.preventDefault(); AW.emit('savenow'); return; }
    if (typing) return;
    if (k === 'f5' && !mod && !ev.altKey && tF5()) { ev.preventDefault(); return; }
    if (tKey(ev, k, mod)) return;
    if (mod && k === 'z') { ev.preventDefault(); return undo(ev.shiftKey ? 1 : -1); }
    if (mod && k === 'y') { ev.preventDefault(); return undo(1); }
    if (mod && (k === ']' || k === '[')) { ev.preventDefault(); return ev.shiftKey ? order(k === ']') : orderStep(k === ']' ? 1 : -1); }
    if (ev.altKey && !mod && ev.code === 'KeyR') { ev.preventDefault(); return act('ruler'); }
    if (ev.altKey && !mod && ev.code === 'KeyG') { ev.preventDefault(); return act('gridshow'); }
    if (mod && k === 'g') { ev.preventDefault(); return grouping(!ev.shiftKey); }
    var inStage = st.stage.contains(document.activeElement);
    if (k === ' ' && !mod && inStage) { ev.preventDefault(); if (!st.space) { st.space = true; st.stage.classList.add('pan'); } return; }
    if (!mod && !ev.altKey && !ev.shiftKey && inStage && { t: 'add-text', r: 'add-rect', l: 'add-line', b: 'add-table' }[k] && !st.editing) { ev.preventDefault(); st.at = null; return act({ t: 'add-text', r: 'add-rect', l: 'add-line', b: 'add-table' }[k]); }
    if (mod && (k === 'c' || k === 'x') && tTable() && st.tsel && S.sel.length === 1) { ev.preventDefault(); return tCopy(k === 'x'); }
    if (!mod && !ev.altKey && !ev.shiftKey && k === 'p' && sel().length) { ev.preventDefault(); return E.propDialog(); }
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
    if (k === 'enter' && sel().length === 1 && sel()[0].t === 'table') { ev.preventDefault(); var tq = tLast(sel()[0]); return beginCellEdit(sel()[0], tq.r, tq.c); }
    if (k === 'enter' && sel().length === 1 && sel()[0].t === 'text') { ev.preventDefault(); var d = domOf(sel()[0]); if (d) beginEdit(sel()[0], d); }
  }
  function onPasteDoc(ev) {                  // 외부에서 복사한 글/이미지를 새 요소로 붙여넣기 (내부 복사본이 없을 때)
    if (!st.root || !st.root.offsetParent || !T()) return;
    var tg = ev.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    var cd = ev.clipboardData; if (!cd) return;
    if (tTable() && st.tsel && S.sel.length === 1) { var tt0 = cd.getData('text'); if (tt0 && tt0.trim()) { ev.preventDefault(); return tPaste(tt0); } }
    if (st.clip && st.clip.length) return;
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
    var tcx = ev.target.closest('.el-table .tc'); if (tcx) { var tx0 = AW.get(tcx.closest('.el').dataset.id), r0 = +tcx.dataset.r, c0 = +tcx.dataset.c, ts = st.tsel; if (tx0 && !(ts && ts.id === tx0.id && r0 >= ts.r0 && r0 <= ts.r1 && c0 >= ts.c0 && c0 <= ts.c1)) { S.sel = [tx0.id]; tSet(tx0, r0, c0, r0, c0); } }
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
      if (one && one.t === 'table') {
        var TI = function (label, a, o) { return I(label, 'table', '', a, o); }, hs = !!(st.tsel && st.tsel.id === one.id);
        it.push(TI('셀 글 입력', 't-edit', { key: 'Enter' }), SUB('셀 · 줄 · 칸', 'table', [TI('셀 합치기', 't-merge', { disabled: !hs }), TI('셀 나누기', 't-split', { disabled: !hs }), { k: 'sep' }, TI('위에 줄 넣기', 't-rowA'), TI('아래에 줄 넣기', 't-rowB'), TI('줄 지우기', 't-rowD'), { k: 'sep' }, TI('왼쪽에 칸 넣기', 't-colA'), TI('오른쪽에 칸 넣기', 't-colB'), TI('칸 지우기', 't-colD'), { k: 'sep' }, TI('칸 너비 같게', 't-eqw'), TI('줄 높이 같게', 't-eqh')]), I('셀 선택 · 표 전체 선택', 'sel', 'F5', 't-f5'), I('표 선·서식 속성…', 'edit', 'P', 'props'), { k: 'sep' });
      }
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
      if (list.length >= 2) al.push({ k: 'sep' }, I('왼쪽으로 몰기', 'gL', '', 'pack-l'), I('오른쪽으로 몰기', 'gR', '', 'pack-r'), I('위로 몰기', 'gT', '', 'pack-t'), I('아래로 몰기', 'gB', '', 'pack-b'), I('간격 지정 배치…', 'dH', '', 'gapdlg'));
      it.push(SUB('정렬 · 크기 맞춤', 'gCH', al));
      var allLk = list.every(function (e) { return e.lock; }), allHd = list.every(function (e) { return e.hide; });
      it.push(SUB('순서 · 잠금 · 표시', 'layers', [I('맨 앞으로', 'front', 'Ctrl+Shift+]', 'front'), I('앞으로 한 칸', 'chevU', 'Ctrl+]', 'fwd'), I('뒤로 한 칸', 'chevD', 'Ctrl+[', 'bwd'), I('맨 뒤로', 'back', 'Ctrl+Shift+[', 'back'), { k: 'sep' }, I((list.some(function (e) { return e.grp; }) ? '그룹 ' : '선택 ') + (allLk ? '잠금 해제' : '잠금(이동·크기 고정)'), allLk ? 'unlock' : 'lock', '', 'lock'), I('전체 잠금 / 해제', 'lock', '', 'lockall'), I(allHd ? '보이기' : '숨기기', 'eye', '', 'hide'), I('인쇄에서 제외 (화면 안내용)', 'print', '', 'noprint', { on: list.every(function (e) { return e.noprint; }) })]));
      if (list.some(function (e) { return e.t === 'qr'; })) it.push(I('QR 진위 확인 문구·공개 항목…', 'qr', '', 'verify-cfg'));
      it.push(I('개체 속성…', 'edit', 'P', 'props'));
      it.push(SUB('회전 · 반전', 'rotate', [I('왼쪽 90° 회전', 'undo', '', 'rot-l'), I('오른쪽 90° 회전', 'redo', '', 'rot-r'), I('180° 회전', 'rotate', '', 'rot-180'), { k: 'sep' }, I('좌우 대칭 (좌우 반전)', 'gCH', '', 'flip-x'), I('상하 대칭 (상하 반전)', 'gCV', '', 'flip-y'), { k: 'sep' }, I('회전 초기화', 'close', '', 'rot-0')]));
      it.push(I('그룹 만들기', 'layers', 'Ctrl+G', 'group', { disabled: list.length < 2 }), I('그룹 해제', 'layers', 'Ctrl+Shift+G', 'ungroup', { disabled: !list.some(function (e) { return e.grp; }) }));
      it.push(SUB('이동', 'plus', [I('위로 (작게)', 'chevU', '↑', 'nu'), I('아래로 (작게)', 'chevD', '↓', 'nd'), I('왼쪽으로 (작게)', 'chevL', '←', 'nl'), I('오른쪽으로 (작게)', 'chevR', '→', 'nr'), { k: 'sep' }, I('위로 (크게)', 'chevU', 'Shift+↑', 'Nu'), I('아래로 (크게)', 'chevD', 'Shift+↓', 'Nd'), I('왼쪽으로 (크게)', 'chevL', 'Shift+←', 'Nl'), I('오른쪽으로 (크게)', 'chevR', 'Shift+→', 'Nr')]));
      if (tx.length) {
        it.push(SUB('서식', 'text', [STRIP('글자', [B('bold', '굵게', 'bold', t1.bold), B('italic', '기울임', 'italic', t1.italic), B('underline', '밑줄', 'ul', t1.ul), B('alL', '왼쪽 정렬', 'al-l', t1.align === 'left'), B('alC', '가운데 정렬', 'al-c', t1.align === 'center'), B('alR', '오른쪽 정렬', 'al-r', t1.align === 'right'), B('alJ', '양쪽 정렬(마지막 줄 왼쪽)', 'al-j', t1.align === 'justify'), B('alD', '균등 분배(마지막 줄도 채움)', 'al-d', t1.align === 'dist')]),
          STRIP('세로·크기', [B('vT', '위쪽', 'v-t', t1.valign === 'top'), B('vM', '가운데', 'v-m', t1.valign === 'middle'), B('vB', '아래쪽', 'v-b', t1.valign === 'bottom'), B('plus', '글자 크게', 'sz+'), B('minus', '글자 작게', 'sz-')]),
          I('글자 자동 맞춤', 'fit', '', 'fit', { on: !!t1.fit }), I('서식 복사', 'wand', 'Ctrl+Alt+C', 'cstyle'), I('서식 붙여넣기', 'wand', 'Ctrl+Alt+V', 'pstyle', { disabled: !st.sty })]));
        if (one) it.push(I('입력 항목 {{ }} 삽입…', 'field', '', 'add-field'));
      }
    } else {
      it.push(SUB('추가', 'plus', [I('여기에 글상자 추가', 'text', '', 'add-text'), I('여기에 입력 항목 추가…', 'field', '', 'add-field'), I('선 추가', 'line', '', 'add-line'), I('사각형 추가', 'rect', '', 'add-rect'), I('이미지 추가…', 'image', '', 'add-img'), I('위조 방지 인증 QR 추가', 'qr', '', 'add-qr'), I('표 넣기…', 'table', '', 'add-table')]), EDIT(), VIEW, LANGM,
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
