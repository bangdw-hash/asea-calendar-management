'use strict';
/**
 * award-table.js — 표 개체 (AW.Table) : 한글·워드 같은 표
 *  요소: {t:'table', rows, cols, cw[열 너비 mm], rh[줄 높이 mm], cells[r][c]:{text, rs, cs, m(합쳐져 가려진 칸), font,size,bold,color,align,valign,fill},
 *         style:{글자 기본값}, bo:{바깥 선}, bi:{안쪽 선}, hb:{'r,c':선}, vb:{'r,c':선}}   선 = {w(mm), c(색), s(solid|dashed|dotted|double)}, w=0 이면 없음
 *  hb['r,c'] = r번째 줄 위쪽 가로선(c열 구간), vb['r,c'] = c번째 열 왼쪽 세로선(r줄 구간)
 */
(function () {
  var AW = window.AW, Tb = AW.Table = {};
  function sum(a) { var s = 0; a.forEach(function (v) { s += v; }); return s; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function rnd(v) { return Math.round(v * 100) / 100; }
  Tb.STYLES = [['solid', '실선'], ['dashed', '파선'], ['dotted', '점선'], ['double', '이중선']];

  Tb.make = function (R, C, o) {
    o = o || {}; R = Math.max(1, Math.min(60, R | 0)); C = Math.max(1, Math.min(30, C | 0)); var w = o.w || 120, rh0 = o.rh || 9, e = AW.elem('table', { x: o.x || 20, y: o.y || 40, w: w, h: rh0 * R });
    e.rows = R; e.cols = C; e.cw = []; e.rh = []; e.cells = []; var i, j;
    for (i = 0; i < C; i++) e.cw.push(rnd(w / C)); for (i = 0; i < R; i++) e.rh.push(rh0);
    for (i = 0; i < R; i++) { var row = []; for (j = 0; j < C; j++) row.push({ text: '' }); e.cells.push(row); }
    e.auto = true; e.style = { font: o.font || 'Noto Serif KR', size: o.size || 12, color: '#111111', bold: false, align: 'center', valign: 'middle', lh: 1.3, pad: 1.5 };
    e.bo = { w: o.bw != null ? o.bw : 0.4, c: '#111111', s: 'solid' }; e.bi = { w: o.iw != null ? o.iw : 0.2, c: '#111111', s: 'solid' }; e.hb = {}; e.vb = {};
    if (o.head) for (j = 0; j < C; j++) { e.cells[0][j].fill = '#EEF1F4'; e.cells[0][j].bold = true; }
    Tb.fit(e); return e;
  };
  Tb.fit = function (e) { e.w = rnd(sum(e.cw)); e.h = rnd(sum(e.rh)); };
  Tb.geom = function (e) { var X = [0], Y = [0]; e.cw.forEach(function (v) { X.push(X[X.length - 1] + v); }); e.rh.forEach(function (v) { Y.push(Y[Y.length - 1] + v); }); return { X: X, Y: Y, sw: X[X.length - 1] || 1, sh: Y[Y.length - 1] || 1 }; };
  Tb.own = function (e) {   // 각 칸이 속한 (합쳐진) 칸의 기준 좌표
    var R = e.rows, C = e.cols, o = [], r, c, i, j; for (r = 0; r < R; r++) { o[r] = []; for (c = 0; c < C; c++) o[r][c] = [r, c]; }
    for (r = 0; r < R; r++) for (c = 0; c < C; c++) { var k = e.cells[r][c]; if (k && ((k.rs || 1) > 1 || (k.cs || 1) > 1)) for (i = 0; i < (k.rs || 1); i++) for (j = 0; j < (k.cs || 1); j++) if (r + i < R && c + j < C) o[r + i][c + j] = [r, c]; }
    return o;
  };
  Tb.edge = function (e, dir, r, c) { var m = (dir === 'h' ? e.hb : e.vb) || {}, k = r + ',' + c; if (m[k] !== undefined) return m[k]; var outer = dir === 'h' ? (r === 0 || r === e.rows) : (c === 0 || c === e.cols); return outer ? e.bo : e.bi; };
  Tb.edgeHidden = function (e, own, dir, r, c) { if (dir === 'h') return r > 0 && r < e.rows && own[r - 1][c][0] === own[r][c][0] && own[r - 1][c][1] === own[r][c][1]; return c > 0 && c < e.cols && own[r][c - 1][0] === own[r][c][0] && own[r][c - 1][1] === own[r][c][1]; };
  Tb.cellAt = function (e, px, py) {   // 표 왼쪽 위 기준 mm → {r,c} (합쳐진 칸이면 기준 칸)
    var g = Tb.geom(e), r = -1, c = -1, i; if (px < 0 || py < 0 || px > g.sw + 0.01 || py > g.sh + 0.01) return null;
    for (i = 0; i < e.cols; i++) if (px >= g.X[i] && px <= g.X[i + 1] + 0.0001) { c = i; break; } for (i = 0; i < e.rows; i++) if (py >= g.Y[i] && py <= g.Y[i + 1] + 0.0001) { r = i; break; }
    if (r < 0 || c < 0) return null; var o = Tb.own(e)[r][c]; return { r: o[0], c: o[1] };
  };
  Tb.rect = function (e, rg) {   // 선택 범위의 mm 사각형(표 기준)
    var g = Tb.geom(e); return { x: g.X[rg.c0], y: g.Y[rg.r0], w: g.X[rg.c1 + 1] - g.X[rg.c0], h: g.Y[rg.r1 + 1] - g.Y[rg.r0] };
  };
  Tb.norm = function (e, rg) {   // 범위 정규화 + 합쳐진 칸을 온전히 포함하도록 확장
    var r0 = Math.min(rg.r0, rg.r1), r1 = Math.max(rg.r0, rg.r1), c0 = Math.min(rg.c0, rg.c1), c1 = Math.max(rg.c0, rg.c1), ch = true, own;
    while (ch) { ch = false; own = Tb.own(e); for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) { var o = own[r][c], k = e.cells[o[0]][o[1]], er = o[0] + (k.rs || 1) - 1, ec = o[1] + (k.cs || 1) - 1; if (o[0] < r0) { r0 = o[0]; ch = true; } if (o[1] < c0) { c0 = o[1]; ch = true; } if (er > r1) { r1 = er; ch = true; } if (ec > c1) { c1 = ec; ch = true; } } }
    return { r0: r0, c0: c0, r1: Math.min(r1, e.rows - 1), c1: Math.min(c1, e.cols - 1) };
  };
  Tb.all = function (e) { return { r0: 0, c0: 0, r1: e.rows - 1, c1: e.cols - 1 }; };

  /* ── 구조 편집 ── */
  function shiftKeys(m, dir, at, d) {   // dir 'r' = 첫 번째 인덱스, 'c' = 두 번째 인덱스를 at 이상일 때 d 만큼 이동
    var out = {}; Object.keys(m || {}).forEach(function (k) { var p = k.split(',').map(Number); if (dir === 'r') { if (p[0] >= at) p[0] += d; } else if (p[1] >= at) p[1] += d; if (p[0] >= 0 && p[1] >= 0) out[p[0] + ',' + p[1]] = m[k]; }); return out;
  }
  Tb.insertRow = function (e, at, h) {
    at = Math.max(0, Math.min(e.rows, at)); h = h || e.rh[Math.min(at, e.rows - 1)] || 9; var own = Tb.own(e), row = [], c, crossing = {};
    for (c = 0; c < e.cols; c++) row.push({ text: '' });
    if (at > 0 && at < e.rows) for (c = 0; c < e.cols; c++) { var a = own[at - 1][c], b = own[at][c]; if (a[0] === b[0] && a[1] === b[1]) { var key = a.join(','); if (!crossing[key]) { crossing[key] = 1; e.cells[a[0]][a[1]].rs = (e.cells[a[0]][a[1]].rs || 1) + 1; } row[c] = { text: '', m: 1 }; } }
    e.cells.splice(at, 0, row); e.rh.splice(at, 0, h); e.rows++; e.hb = shiftKeys(e.hb, 'r', at, 1); e.vb = shiftKeys(e.vb, 'r', at, 1); Tb.fit(e);
  };
  Tb.insertCol = function (e, at, w) {
    at = Math.max(0, Math.min(e.cols, at)); w = w || e.cw[Math.min(at, e.cols - 1)] || 20; var own = Tb.own(e), r, crossing = {};
    for (r = 0; r < e.rows; r++) { var nc = { text: '' }; if (at > 0 && at < e.cols) { var a = own[r][at - 1], b = own[r][at]; if (a[0] === b[0] && a[1] === b[1]) { var key = a.join(','); if (!crossing[key]) { crossing[key] = 1; e.cells[a[0]][a[1]].cs = (e.cells[a[0]][a[1]].cs || 1) + 1; } nc.m = 1; } } e.cells[r].splice(at, 0, nc); }
    e.cw.splice(at, 0, w); e.cols++; e.hb = shiftKeys(e.hb, 'c', at, 1); e.vb = shiftKeys(e.vb, 'c', at, 1); Tb.fit(e);
  };
  function unmergeTouching(e, r0, r1, c0, c1) { var own = Tb.own(e); for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) { var o = own[r][c]; if ((e.cells[o[0]][o[1]].rs || 1) > 1 || (e.cells[o[0]][o[1]].cs || 1) > 1) Tb.unmerge(e, o[0], o[1]); } }
  Tb.deleteRow = function (e, r) {
    if (e.rows <= 1) return false; unmergeTouching(e, r, r, 0, e.cols - 1); e.cells.splice(r, 1); e.rh.splice(r, 1); e.rows--;
    var drop = function (m) { var o = {}; Object.keys(m || {}).forEach(function (k) { var p = k.split(',').map(Number); if (p[0] === r && m === e.vb) return; if (p[0] > r) p[0]--; else if (p[0] === r && m === e.hb) { return; } o[p[0] + ',' + p[1]] = m[k]; }); return o; };
    e.hb = drop(e.hb); e.vb = drop(e.vb); Tb.fit(e); return true;
  };
  Tb.deleteCol = function (e, c) {
    if (e.cols <= 1) return false; unmergeTouching(e, 0, e.rows - 1, c, c); e.cells.forEach(function (row) { row.splice(c, 1); }); e.cw.splice(c, 1); e.cols--;
    var drop = function (m) { var o = {}; Object.keys(m || {}).forEach(function (k) { var p = k.split(',').map(Number); if (p[1] === c && m === e.hb) return; if (p[1] > c) p[1]--; else if (p[1] === c && m === e.vb) return; o[p[0] + ',' + p[1]] = m[k]; }); return o; };
    e.hb = drop(e.hb); e.vb = drop(e.vb); Tb.fit(e); return true;
  };
  Tb.merge = function (e, rg) {
    rg = Tb.norm(e, rg); if (rg.r0 === rg.r1 && rg.c0 === rg.c1) return false; var txt = [], r, c;
    for (r = rg.r0; r <= rg.r1; r++) for (c = rg.c0; c <= rg.c1; c++) { var k = e.cells[r][c]; if (!k.m && k.text) txt.push(k.text); if (r !== rg.r0 || c !== rg.c0) { e.cells[r][c] = { text: '', m: 1 }; } }
    var o = e.cells[rg.r0][rg.c0]; o.text = txt.join('\n'); o.rs = rg.r1 - rg.r0 + 1; o.cs = rg.c1 - rg.c0 + 1; delete o.m; return true;
  };
  Tb.unmerge = function (e, r, c) { var k = e.cells[r][c], rs = k.rs || 1, cs = k.cs || 1; if (rs === 1 && cs === 1) return false; k.rs = 1; k.cs = 1; for (var i = 0; i < rs; i++) for (var j = 0; j < cs; j++) if ((i || j) && e.cells[r + i] && e.cells[r + i][c + j]) delete e.cells[r + i][c + j].m; return true; };

  /* ── 선·서식 ── */
  Tb.setEdges = function (e, rg, which, spec) {   // which: all|outer|inner|innerH|innerV|top|bottom|left|right
    rg = Tb.norm(e, rg); var v = spec && spec.w > 0 ? { w: spec.w, c: spec.c || '#111111', s: spec.s || 'solid' } : { w: 0, c: '#111111', s: 'solid' }, r, c;
    var H = function (rr, cc) { e.hb[rr + ',' + cc] = clone(v); }, V = function (rr, cc) { e.vb[rr + ',' + cc] = clone(v); };
    var top = which === 'top' || which === 'outer' || which === 'all', bot = which === 'bottom' || which === 'outer' || which === 'all', lef = which === 'left' || which === 'outer' || which === 'all', rig = which === 'right' || which === 'outer' || which === 'all';
    var ih = which === 'innerH' || which === 'inner' || which === 'all', iv = which === 'innerV' || which === 'inner' || which === 'all';
    if (top) for (c = rg.c0; c <= rg.c1; c++) H(rg.r0, c); if (bot) for (c = rg.c0; c <= rg.c1; c++) H(rg.r1 + 1, c);
    if (lef) for (r = rg.r0; r <= rg.r1; r++) V(r, rg.c0); if (rig) for (r = rg.r0; r <= rg.r1; r++) V(r, rg.c1 + 1);
    if (ih) for (r = rg.r0 + 1; r <= rg.r1; r++) for (c = rg.c0; c <= rg.c1; c++) H(r, c); if (iv) for (c = rg.c0 + 1; c <= rg.c1; c++) for (r = rg.r0; r <= rg.r1; r++) V(r, c);
  };
  Tb.setDefaultEdges = function (e, which, spec) {   // 표 전체의 바깥/안쪽 기본 선 (개별 지정은 모두 해제)
    var v = spec && spec.w > 0 ? { w: spec.w, c: spec.c, s: spec.s || 'solid' } : { w: 0, c: '#111111', s: 'solid' }; if (which === 'outer' || which === 'all') e.bo = clone(v); if (which === 'inner' || which === 'all') e.bi = clone(v); e.hb = {}; e.vb = {};
  };
  Tb.setCells = function (e, rg, props) {
    rg = Tb.norm(e, rg); var own = Tb.own(e); for (var r = rg.r0; r <= rg.r1; r++) for (var c = rg.c0; c <= rg.c1; c++) { var o = own[r][c]; if (o[0] !== r || o[1] !== c) continue; var k = e.cells[r][c]; Object.keys(props).forEach(function (p) { if (props[p] === undefined || props[p] === null || props[p] === '') delete k[p]; else k[p] = props[p]; }); }
  };
  Tb.equalize = function (e, axis, rg) {
    rg = Tb.norm(e, rg || Tb.all(e)); var arr = axis === 'w' ? e.cw : e.rh, a = axis === 'w' ? rg.c0 : rg.r0, b = axis === 'w' ? rg.c1 : rg.r1, s = 0, i; if (b <= a) return false;
    for (i = a; i <= b; i++) s += arr[i]; for (i = a; i <= b; i++) arr[i] = rnd(s / (b - a + 1)); Tb.fit(e); return true;
  };
  Tb.scaleFrom = function (e, o, nw, nh) {   // 크기 조절: 열 너비·줄 높이를 같은 비율로 늘이고 줄임
    var sw = sum(o.cw), sh = sum(o.rh); e.cw = o.cw.map(function (v) { return rnd(v * nw / sw); }); e.rh = o.rh.map(function (v) { return rnd(v * nh / sh); }); Tb.fit(e);
  };
  Tb.texts = function (e) { var out = []; (e.cells || []).forEach(function (r) { r.forEach(function (c) { if (c && c.text) out.push(c.text); }); }); return out; };


  /* ── 그리기: 칸(글) + 선. 좌표는 % 라서 크기를 바꿔도 그대로 늘어납니다 ── */
  Tb.render = function (e, d, k, o, tok) {
    var mode = o.mode || 'view', g = Tb.geom(e), own = Tb.own(e), st = e.style || {}, PT = 25.4 / 72, out = [], r, c;
    var px = function (v) { return (v / g.sw * 100).toFixed(4) + '%'; }, py = function (v) { return (v / g.sh * 100).toFixed(4) + '%'; };
    for (r = 0; r < e.rows; r++) for (c = 0; c < e.cols; c++) {
      var kc = e.cells[r][c]; if (!kc || kc.m) continue;
      var rs = kc.rs || 1, cs = kc.cs || 1, x = g.X[c], y = g.Y[r], w = g.X[Math.min(c + cs, e.cols)] - x, h = g.Y[Math.min(r + rs, e.rows)] - y, S = Object.assign({}, st, kc);
      var fs = (S.size || 12) * PT * k, va = S.valign === 'top' ? 'flex-start' : S.valign === 'bottom' ? 'flex-end' : 'center';
      out.push('<div class="tc" data-r="' + r + '" data-c="' + c + '" style="left:' + px(x) + ';top:' + py(y) + ';width:' + px(w) + ';height:' + py(h) + ';padding:' + ((S.pad == null ? 1.5 : S.pad) * k).toFixed(2) + 'px;justify-content:' + va + ';font-family:' + AW.fontStack(S.font) + ';font-size:' + fs.toFixed(2) + 'px;line-height:' + (S.lh || 1.3) + ';color:' + (S.color || '#111') + ';font-weight:' + (S.bold ? 700 : 400) + ';text-align:' + (S.align || 'center') + (kc.fill ? ';background:' + kc.fill : '') + '"><div class="tx">' + tok(kc.text || '', 'ko') + '</div></div>');
    }
    var line = function (dir, rr, cc) {
      var ed = Tb.edge(e, dir, rr, cc); if (Tb.edgeHidden(e, own, dir, rr, cc)) return;
      var wpx = Math.max(ed.w * k, ed.w > 0 ? 1 : 0), half = ed.w / 2;
      if (dir === 'h') { var x0 = g.X[cc] - (ed.w > 0 ? half : 0), x1 = g.X[cc + 1] + (ed.w > 0 ? half : 0);
        if (ed.w > 0) out.push('<div class="tl" style="left:' + px(x0) + ';top:' + py(g.Y[rr]) + ';width:' + px(x1 - x0) + ';height:0;margin-top:' + (-wpx / 2).toFixed(2) + 'px;border-top:' + wpx.toFixed(2) + 'px ' + ed.s + ' ' + ed.c + '"></div>');
        else if (mode === 'edit') out.push('<div class="tz" style="left:' + px(g.X[cc]) + ';top:' + py(g.Y[rr]) + ';width:' + px(g.X[cc + 1] - g.X[cc]) + ';height:0;border-top:1px dashed rgba(14,165,233,.45)"></div>'); }
      else { var y0 = g.Y[rr] - (ed.w > 0 ? half : 0), y1 = g.Y[rr + 1] + (ed.w > 0 ? half : 0);
        if (ed.w > 0) out.push('<div class="tl" style="left:' + px(g.X[cc]) + ';top:' + py(y0) + ';height:' + py(y1 - y0) + ';width:0;margin-left:' + (-wpx / 2).toFixed(2) + 'px;border-left:' + wpx.toFixed(2) + 'px ' + ed.s + ' ' + ed.c + '"></div>');
        else if (mode === 'edit') out.push('<div class="tz" style="left:' + px(g.X[cc]) + ';top:' + py(g.Y[rr]) + ';height:' + py(g.Y[rr + 1] - g.Y[rr]) + ';width:0;border-left:1px dashed rgba(14,165,233,.45)"></div>'); }
    };
    for (r = 0; r <= e.rows; r++) for (c = 0; c < e.cols; c++) line('h', r, c);
    for (c = 0; c <= e.cols; c++) for (r = 0; r < e.rows; r++) line('v', r, c);
    d.innerHTML = out.join(''); d._tb = { e: e, k: k, o: o, tok: tok };
  };


  /* ── 글이 길면 줄 높이 자동 늘림 (e.auto !== false). 편집 화면은 저장(persist), 미리보기·출력은 화면에서만 ── */
  Tb.autoFit = function (root, persist) {
    var any = false;
    AW.$$('.el-table', root).forEach(function (d) {
      var t = d._tb, e = t && t.e; if (!e || e.auto === false) return;
      var need = e.rh.slice(), ch = false;
      AW.$$('.tc', d).forEach(function (n) {
        var r = +n.dataset.r, c = +n.dataset.c, kc = e.cells[r] && e.cells[r][c]; if (!kc || (kc.rs || 1) > 1 || !n.firstChild) return;
        var h = (n.firstChild.offsetHeight + (parseFloat(n.style.paddingTop) || 0) * 2) / t.k;
        if (h > need[r] + 0.05) { need[r] = Math.ceil(h * 10) / 10; ch = true; }
      });
      if (!ch) return; any = true;
      if (persist) { e.rh = need; Tb.fit(e); }
      else { var cl = Object.assign({}, e, { rh: need }); Tb.fit(cl); t.e = cl; Tb.render(cl, d, t.k, t.o, t.tok); d.style.height = cl.h * t.k + 'px'; }
    });
    return any;
  };

  /* ── 표 서식(자주 쓰는 표 모양) 저장·불러오기: 이 브라우저 + 서버 설정 ── */
  var PK = 'award_table_presets';
  Tb.presets = function () { return AW.lsGet(PK, []) || []; };
  function syncPresets(list) { AW.lsSet(PK, list); try { AW.pref.set('table_presets', list).catch(function () {}); } catch (x) {} }
  Tb.savePreset = function (e, name) {
    var list = Tb.presets().filter(function (p) { return p.name !== name; }), c = clone(e); delete c.id; delete c.grp; delete c.lock; delete c.hide; list.unshift({ name: name, el: c }); syncPresets(list.slice(0, 30));
  };
  Tb.deletePreset = function (name) { syncPresets(Tb.presets().filter(function (p) { return p.name !== name; })); };
  Tb.fromPreset = function (p) {
    var c = clone(p.el), pg = AW.S.tpl.page; c.id = AW.uid(); c.t = 'table'; c.lock = false; Tb.fit(c); c.x = Math.max(0, AW.round((pg.w - c.w) / 2, 1)); c.y = Math.max(10, AW.round(pg.h * 0.3, 1)); return c;
  };
  Tb.loadServerPresets = function (done) {
    try { AW.pref.get('table_presets').then(function (v) { if (Array.isArray(v) && v.length) { var loc = Tb.presets(), names = loc.map(function (p) { return p.name; }); v.forEach(function (p) { if (names.indexOf(p.name) < 0) loc.push(p); }); AW.lsSet(PK, loc); } done(); }).catch(done); } catch (x) { done(); }
  };

  /* ── 표 넣기 대화상자 ── */
  Tb.insertDialog = function (cb) {
    var pg = AW.S.tpl.page, dw = Math.round(Math.min(170, pg.w * 0.7));
    AW.modal({ title: '표 넣기', body: '<p style="margin-top:0">가로(칸)와 세로(줄) 수를 정하면 표가 용지 가운데에 놓입니다. 이후 선·합치기·크기는 표를 선택하고 <b>P</b> 키 또는 우클릭으로 바꿀 수 있습니다.</p><div class="grid2"><div><label class="f">가로 칸 수 (열)</label><input class="in" id="tb-c" type="number" min="1" max="30" value="3"></div><div><label class="f">세로 줄 수 (행)</label><input class="in" id="tb-r" type="number" min="1" max="60" value="3"></div><div><label class="f">표 너비 (mm)</label><input class="in" id="tb-w" type="number" min="20" step="1" value="' + dw + '"></div><div><label class="f">줄 높이 (mm)</label><input class="in" id="tb-h" type="number" min="4" step="0.5" value="9"></div><div><label class="f">바깥 선 두께 (mm)</label><input class="in" id="tb-bw" type="number" min="0" step="0.1" value="0.4"></div><div><label class="f">안쪽 선 두께 (mm)</label><input class="in" id="tb-iw" type="number" min="0" step="0.1" value="0.2"></div></div><div class="radios" style="margin-top:8px"><label><input type="checkbox" id="tb-hd" checked> 첫 줄을 제목 줄로 (음영·굵게)</label></div><div id="tb-ps"></div>',
      actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '표 넣기', cls: 'btn-primary', onClick: function (c) {
        var g = function (id) { return parseFloat(AW.$('#' + id).value); }, o = { w: g('tb-w') || dw, rh: g('tb-h') || 9, bw: g('tb-bw'), iw: g('tb-iw'), head: AW.$('#tb-hd').checked }, R = g('tb-r') || 3, C = g('tb-c') || 3; c();
        o.x = Math.max(0, (pg.w - o.w) / 2); o.y = Math.max(10, pg.h * 0.3); cb(Tb.make(R, C, o));
      } }],
      onOpen: function (el) {
        AW.$$('input', el).forEach(function (i) { i.addEventListener('keydown', function (k) { k.stopPropagation(); if (k.key === 'Enter') AW.$('.btn-primary', el).click(); }); });
        var box = AW.$('#tb-ps', el), draw = function () {
          var l = Tb.presets(); box.innerHTML = l.length ? '<div class="pp-sec" style="margin-top:12px"><b>저장한 표 서식</b> <span class="muted">클릭하면 바로 넣습니다</span></div><div class="pp-op">' + l.map(function (p, i) { return '<span class="chip-b"><button class="btn btn-secondary btn-sm" data-pi="' + i + '">' + AW.esc(p.name) + ' (' + p.el.rows + '×' + p.el.cols + ')</button><button class="btn btn-ghost btn-sm" data-pd="' + i + '" title="삭제" aria-label="삭제">' + AW.ic('close', 13) + '</button></span>'; }).join('') + '</div>' : '';
          AW.$$('[data-pi]', box).forEach(function (b) { b.onclick = function () { var p = Tb.presets()[+b.dataset.pi]; AW.$('.md-x', el).click(); cb(Tb.fromPreset(p)); }; });
          AW.$$('[data-pd]', box).forEach(function (b) { b.onclick = function () { Tb.deletePreset(Tb.presets()[+b.dataset.pd].name); draw(); }; });
        };
        draw(); Tb.loadServerPresets(draw);
      } });
  };

  /* ── 표 속성 대화상자 (P) ── */
  Tb.dialog = function (e) {
    var E = AW.Editor, rg0 = (E.tsel && E.tsel() && E.tsel().id === e.id) ? E.tsel() : null, rg = rg0 ? { r0: rg0.r0, c0: rg0.c0, r1: rg0.r1, c1: rg0.c1 } : Tb.all(e), m = { el: null }, refresh;
    var N = function (id, label, v, st, ex) { return '<div><label class="f" for="' + id + '">' + label + '</label><input class="in sm" id="' + id + '" type="number" step="' + (st || 0.1) + '" value="' + v + '"' + (ex || '') + '></div>'; };
    var COL = function (id, v, none) { return '<div style="display:flex;gap:6px;align-items:center"><input type="color" id="' + id + '" value="' + (/^#[0-9a-f]{6}$/i.test(v) ? v : '#111111') + '" style="width:38px;height:30px;padding:0;border:1px solid var(--border);border-radius:var(--r)"><input class="in sm" id="' + id + '-h" value="' + AW.esc(v || '') + '" style="width:92px" placeholder="#RRGGBB">' + (none ? '<label class="mini chk"><input type="checkbox" id="' + id + '-n"' + (!v ? ' checked' : '') + '> 없음</label>' : '') + '</div>'; };
    var STY = function (id) { return '<select class="in sm" id="' + id + '">' + Tb.STYLES.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('') + '</select>'; };
    var cell0 = e.cells[rg.r0][rg.c0] || {}, S0 = Object.assign({}, e.style, cell0);
    var body = '<div class="pp"><div class="pp-op"><label class="chk"><input type="checkbox" id="tb-auto"' + (e.auto !== false ? ' checked' : '') + '> 글이 길면 줄 높이 자동으로 늘림</label><button class="btn btn-ghost btn-sm" data-t="preset">이 표를 서식으로 저장…</button></div><div class="pp-sec"><b>표 위치·크기</b> <span class="muted">' + e.rows + '줄 × ' + e.cols + '칸</span></div><div class="grid2 pp-g">' + N('tb-x', '가로 위치 X (mm)', rnd(e.x)) + N('tb-y', '세로 위치 Y (mm)', rnd(e.y)) + N('tb-w', '표 너비 (mm)', rnd(e.w), 0.5, ' min="10"') + N('tb-h', '표 높이 (mm)', rnd(e.h), 0.5, ' min="4"') + '</div>' +
      '<div class="pp-sec"><b>구조</b> <span class="muted" id="tb-sel"></span></div><div class="pp-op"><button class="btn btn-secondary btn-sm" data-t="rowA">줄 위에 추가</button><button class="btn btn-secondary btn-sm" data-t="rowB">줄 아래에 추가</button><button class="btn btn-secondary btn-sm" data-t="rowD">줄 삭제</button><button class="btn btn-secondary btn-sm" data-t="colA">칸 왼쪽에 추가</button><button class="btn btn-secondary btn-sm" data-t="colB">칸 오른쪽에 추가</button><button class="btn btn-secondary btn-sm" data-t="colD">칸 삭제</button><button class="btn btn-secondary btn-sm" data-t="mrg">셀 합치기</button><button class="btn btn-secondary btn-sm" data-t="umg">셀 나누기</button><button class="btn btn-secondary btn-sm" data-t="eqw">칸 너비 같게</button><button class="btn btn-secondary btn-sm" data-t="eqh">줄 높이 같게</button></div>' +
      '<div class="pp-sec"><b>선</b> <span class="muted">선택한 셀(없으면 표 전체)의 선을 방향별로 지정합니다</span></div><div class="grid2 pp-g"><div><label class="f">적용할 선</label><select class="in sm" id="tb-wh"><option value="all">모든 선</option><option value="outer">바깥 테두리</option><option value="inner">안쪽 선 전체</option><option value="innerH">안쪽 가로선</option><option value="innerV">안쪽 세로선</option><option value="top">위쪽 선</option><option value="bottom">아래쪽 선</option><option value="left">왼쪽 선</option><option value="right">오른쪽 선</option></select></div><div><label class="f">종류</label>' + STY('tb-st') + '</div>' + N('tb-lw', '두께 (mm, 0=없음)', 0.3, 0.1, ' min="0"') + '<div><label class="f">색</label>' + COL('tb-lc', '#111111') + '</div></div><div class="pp-op"><button class="btn btn-primary btn-sm" data-t="edge">선 적용</button><button class="btn btn-ghost btn-sm" data-t="edgeNone">선 모두 없애기</button></div>' +
      '<div class="pp-sec"><b>셀 서식</b> <span class="muted">선택한 셀(없으면 표 전체)</span></div><div class="grid2 pp-g"><div><label class="f">글꼴</label><select class="in sm" id="tb-font">' + AW.fontOptions() + '</select></div>' + N('tb-size', '글자 크기 (pt)', S0.size || 12, 0.5, ' min="4"') + '<div><label class="f">가로 정렬</label><select class="in sm" id="tb-al"><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></div><div><label class="f">세로 정렬</label><select class="in sm" id="tb-va"><option value="top">위</option><option value="middle">가운데</option><option value="bottom">아래</option></select></div><div><label class="f">글자 색</label>' + COL('tb-fc', S0.color || '#111111') + '</div><div><label class="f">배경색</label>' + COL('tb-bg', cell0.fill || '', true) + '</div></div><div class="pp-op"><label class="chk"><input type="checkbox" id="tb-b"' + (S0.bold ? ' checked' : '') + '> 굵게</label><button class="btn btn-primary btn-sm" data-t="cell">서식 적용</button></div>' +
      '<div class="pp-sec"><b>칸 너비 · 줄 높이 (mm)</b></div><div class="grid2 pp-g"><div><label class="f">칸 너비 (쉼표로 구분)</label><input class="in sm" id="tb-cw" value="' + e.cw.map(rnd).join(', ') + '"></div><div><label class="f">줄 높이 (쉼표로 구분)</label><input class="in sm" id="tb-rh" value="' + e.rh.map(rnd).join(', ') + '"></div></div><div class="pp-op"><button class="btn btn-primary btn-sm" data-t="size">크기 적용</button></div></div>';
    AW.modal({ title: '표 속성 (P)', wide: true, body: body, actions: [{ label: '위치·크기 적용', cls: 'btn-secondary', onClick: function () { applyPos(); return false; } }, { label: '닫기', cls: 'btn-primary' }],
      onOpen: function (el) {
        m.el = el; var g = function (id) { return AW.$('#' + id, el); }, set = function (id, v) { var n = g(id); if (n) n.value = v; }; set('tb-font', S0.font || e.style.font); set('tb-al', S0.align || 'center'); set('tb-va', S0.valign || 'middle');
        AW.$$('input,select', el).forEach(function (n) { n.addEventListener('keydown', function (k) { k.stopPropagation(); }); });
        AW.$$('input[type=color]', el).forEach(function (n) { n.addEventListener('input', function () { var h = g(n.id + '-h'); if (h) h.value = n.value; }); }); AW.$$('[id$="-h"]', el).forEach(function (h) { h.addEventListener('input', function () { var c = g(h.id.replace(/-h$/, '')); if (c && /^#[0-9a-f]{6}$/i.test(h.value)) c.value = h.value; }); });
        var lbl = function () { g('tb-sel').textContent = rg0 || (E.tsel && E.tsel() && E.tsel().id === e.id) ? '선택 셀: ' + (rg.r0 + 1) + '줄 ' + (rg.c0 + 1) + '칸' + (rg.r1 > rg.r0 || rg.c1 > rg.c0 ? ' ~ ' + (rg.r1 + 1) + '줄 ' + (rg.c1 + 1) + '칸' : '') : '선택한 셀이 없어 표 전체에 적용합니다'; };
        refresh = function () { Tb.fit(e); E.refreshElems(); if (E.autoFit) E.autoFit(); E.drawTSel && E.drawTSel(); set('tb-x', rnd(e.x)); set('tb-y', rnd(e.y)); set('tb-w', rnd(e.w)); set('tb-h', rnd(e.h)); set('tb-cw', e.cw.map(rnd).join(', ')); set('tb-rh', e.rh.map(rnd).join(', ')); lbl(); };
        g('tb-auto').addEventListener('change', function () { e.auto = g('tb-auto').checked; refresh(); E.api.changed('elems', false, '표 줄 높이 자동'); });
        lbl(); AW.$$('[data-t]', el).forEach(function (b) { b.onclick = function () { act(b.dataset.t); }; });
        function applyPos() { var nx = parseFloat(g('tb-x').value), ny = parseFloat(g('tb-y').value), nw = parseFloat(g('tb-w').value), nh = parseFloat(g('tb-h').value); if (!isNaN(nx)) e.x = rnd(nx); if (!isNaN(ny)) e.y = rnd(ny); if (nw > 0 && nh > 0 && (Math.abs(nw - e.w) > 0.01 || Math.abs(nh - e.h) > 0.01)) Tb.scaleFrom(e, { cw: e.cw.slice(), rh: e.rh.slice() }, nw, nh); refresh(); E.api.changed('elems', false, '표 위치·크기'); }
        function act(a) {
          if (a === 'preset') { var nm = window.prompt('표 서식 이름', '내 표 ' + (Tb.presets().length + 1)); if (nm && nm.trim()) { Tb.savePreset(e, nm.trim().slice(0, 30)); AW.toast('표 서식으로 저장했습니다. 표 넣기 창에서 불러올 수 있습니다.', 'ok'); } return; }
          var done = function (label) { refresh(); E.api.changed('elems', false, label); }, ok;
          if (a === 'rowA') { Tb.insertRow(e, rg.r0); rg.r0++; rg.r1++; return done('줄 추가'); } if (a === 'rowB') { Tb.insertRow(e, rg.r1 + 1); return done('줄 추가'); }
          if (a === 'rowD') { for (var r = rg.r1; r >= rg.r0; r--) { if (!Tb.deleteRow(e, r)) break; } rg = { r0: 0, c0: rg.c0, r1: Math.min(rg.r1, e.rows - 1), c1: rg.c1 }; rg.r0 = Math.min(rg.r0, rg.r1); return done('줄 삭제'); }
          if (a === 'colA') { Tb.insertCol(e, rg.c0); rg.c0++; rg.c1++; return done('칸 추가'); } if (a === 'colB') { Tb.insertCol(e, rg.c1 + 1); return done('칸 추가'); }
          if (a === 'colD') { for (var c = rg.c1; c >= rg.c0; c--) { if (!Tb.deleteCol(e, c)) break; } rg = { r0: rg.r0, c0: 0, r1: rg.r1, c1: Math.min(rg.c1, e.cols - 1) }; rg.c0 = Math.min(rg.c0, rg.c1); return done('칸 삭제'); }
          if (a === 'mrg') { ok = Tb.merge(e, rg); if (!ok) return AW.toast('합칠 셀을 2개 이상 선택해 주십시오. (표에서 F5 → 화살표 또는 끌기로 셀 선택)'); return done('셀 합치기'); }
          if (a === 'umg') { var any = false, own = Tb.own(e); for (var r2 = rg.r0; r2 <= rg.r1; r2++) for (var c2 = rg.c0; c2 <= rg.c1; c2++) if (own[r2][c2][0] === r2 && own[r2][c2][1] === c2 && Tb.unmerge(e, r2, c2)) any = true; if (!any) return AW.toast('합쳐진 셀이 없습니다.'); return done('셀 나누기'); }
          if (a === 'eqw') { if (!Tb.equalize(e, 'w', rg0 ? rg : null)) return AW.toast('같게 할 칸을 2개 이상 선택하거나 선택 없이 표 전체에 적용해 주십시오.'); return done('칸 너비 같게'); }
          if (a === 'eqh') { if (!Tb.equalize(e, 'h', rg0 ? rg : null)) return AW.toast('같게 할 줄을 2개 이상 선택하거나 선택 없이 표 전체에 적용해 주십시오.'); return done('줄 높이 같게'); }
          if (a === 'edge' || a === 'edgeNone') { var spec = a === 'edgeNone' ? { w: 0 } : { w: Math.max(0, parseFloat(g('tb-lw').value) || 0), c: g('tb-lc-h').value || g('tb-lc').value, s: g('tb-st').value }, wh = a === 'edgeNone' ? 'all' : g('tb-wh').value, whole = !rg0 && (wh === 'all' || wh === 'outer' || wh === 'inner');
            if (whole && !rg0) { Tb.setDefaultEdges(e, wh, spec); } else Tb.setEdges(e, rg, wh, spec); return done('표 선 변경'); }
          if (a === 'cell') { var pr = { font: g('tb-font').value, size: parseFloat(g('tb-size').value) || undefined, bold: g('tb-b').checked ? true : undefined, align: g('tb-al').value, valign: g('tb-va').value, color: g('tb-fc-h').value || g('tb-fc').value, fill: g('tb-bg-n').checked ? undefined : (g('tb-bg-h').value || g('tb-bg').value) };
            if (!rg0) { e.style = Object.assign({}, e.style, { font: pr.font, size: pr.size || e.style.size, bold: !!pr.bold, align: pr.align, valign: pr.valign, color: pr.color }); e.cells.forEach(function (row) { row.forEach(function (k) { ['font', 'size', 'bold', 'align', 'valign', 'color'].forEach(function (p) { delete k[p]; }); }); }); if (pr.fill !== undefined || g('tb-bg-n').checked) { e.cells.forEach(function (row) { row.forEach(function (k) { if (pr.fill) k.fill = pr.fill; else delete k.fill; }); }); } }
            else Tb.setCells(e, rg, pr); return done('셀 서식'); }
          if (a === 'size') { var cw = g('tb-cw').value.split(/[,\s]+/).map(parseFloat).filter(function (v) { return v > 0; }), rh = g('tb-rh').value.split(/[,\s]+/).map(parseFloat).filter(function (v) { return v > 0; }); if (cw.length !== e.cols || rh.length !== e.rows) return AW.toast('칸 너비는 ' + e.cols + '개, 줄 높이는 ' + e.rows + '개의 값이 필요합니다.', 'error'); e.cw = cw; e.rh = rh; return done('표 크기'); }
        }
      } });
  };
})();
