'use strict';
/**
 * award-scan.js — 스캔본(JPG·PNG·PDF) → 양식 자동 만들기 (AW.Scan)
 *  1) 기울기·여백 보정: 수평/수직 정렬(deskew) + 스캐너 바탕 자동 자르기 + 용지 규격 맞춤(필요 시 수동 미세 조정)
 *  2) 영역 검출: 이미지 분석으로 글자 줄·직인을 원본 위치 그대로 검출(테두리·장식 제외). AI 는 번호가 붙은 상자의 글자 읽기·분류만 담당
 *  3) 글자 지우기: 판독한 글자 영역만 주변 배경으로 메워 「글자 없는 배경」 생성 (직인·무늬는 그대로)
 *  4) 새 양식으로 조립: 글상자 + {{항목}} 메일머지 + 가장 비슷한 보유 글꼴
 */
(function () {
  var AW = window.AW, S = AW.S, Sc = AW.Scan = {}, PT = 25.4 / 72;
  function lum(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }
  function cv(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function loadImg(src) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error('이미지를 읽지 못했습니다.')); }; i.src = src; }); }
  function median(a) { if (!a.length) return 0; a = a.slice().sort(function (x, y) { return x - y; }); return a[a.length >> 1]; }

  /* ───────────── 1) 보정: 기울기 · 여백 ───────────── */
  Sc.estimateSkew = function (src) {   // src: canvas → 보정해야 할 각도(deg, 시계 방향이 +)
    var k = 700 / Math.max(src.width, src.height), w = Math.round(src.width * k), h = Math.round(src.height * k), c = cv(w, h), g = c.getContext('2d'); g.drawImage(src, 0, 0, w, h);
    var d = g.getImageData(0, 0, w, h).data, L = new Uint8Array(w * h), hist = new Array(256).fill(0), i;
    for (i = 0; i < w * h; i++) { L[i] = lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); hist[L[i]]++; }
    var tot = w * h, sum = 0; for (i = 0; i < 256; i++) sum += i * hist[i];
    var wb = 0, sb = 0, mx = 0, th = 128; for (i = 0; i < 256; i++) { wb += hist[i]; if (!wb) continue; var wf = tot - wb; if (!wf) break; sb += i * hist[i]; var m1 = sb / wb, m2 = (sum - sb) / wf, v = wb * wf * (m1 - m2) * (m1 - m2); if (v > mx) { mx = v; th = i; } }
    // 스캐너 바탕(가장자리에서 이어진, 가장자리 색과 같은 영역)은 기울기 계산에서 제외
    var ign = new Uint8Array(tot), pcol = [], x, y;
    for (x = 0; x < w; x++) { pcol.push(L[x], L[(h - 1) * w + x]); } for (y = 0; y < h; y++) { pcol.push(L[y * w], L[y * w + w - 1]); }
    var Bl = median(pcol), inner = L[Math.round(h * 0.12) * w + Math.round(w * 0.12)];
    if (Math.abs(Bl - inner) > 30) {
      var qu = new Int32Array(tot), qh = 0, qt = 0; function seed(ix) { if (!ign[ix] && Math.abs(L[ix] - Bl) < 28) { ign[ix] = 1; qu[qt++] = ix; } }
      for (x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); } for (y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
      while (qh < qt) { var ix2 = qu[qh++], cx = ix2 % w, cy2 = (ix2 / w) | 0; if (cx > 0) seed(ix2 - 1); if (cx < w - 1) seed(ix2 + 1); if (cy2 > 0) seed(ix2 - w); if (cy2 < h - 1) seed(ix2 + w); }
      // 종이 가장자리 한 줄(경계선)도 제외하도록 한 칸 확장
      var ign2 = ign.slice(); for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) { var ii = y * w + x; if (ign[ii - 1] || ign[ii + 1] || ign[ii - w] || ign[ii + w]) ign2[ii] = 1; } ign = ign2;
    }
    var pts = [], dark = 0; for (i = 0; i < tot; i++) if (L[i] < th && !ign[i]) dark++;
    var step = Math.max(1, Math.floor(dark / 50000)), n = 0;
    for (i = 0; i < tot; i++) if (L[i] < th && !ign[i]) { if (n++ % step === 0) pts.push(i % w, (i / w) | 0); }
    if (pts.length < 200) return 0;
    var bins = new Float32Array(w + h + 4);
    function score(a) {
      var r = a * Math.PI / 180, sn = Math.sin(r), cs = Math.cos(r), off = w * 0.5 + 2; bins.fill(0);
      for (var j = 0; j < pts.length; j += 2) bins[Math.round(pts[j + 1] * cs - pts[j] * sn + off)]++;
      var s2 = 0; for (var q = 0; q < bins.length; q++) s2 += bins[q] * bins[q]; return s2;
    }
    var best = 0, bs = -1, a; for (a = -6; a <= 6.001; a += 0.25) { var sc = score(a); if (sc > bs) { bs = sc; best = a; } }
    var c0 = best; for (a = c0 - 0.3; a <= c0 + 0.3001; a += 0.05) { var s3 = score(a); if (s3 > bs) { bs = s3; best = a; } }
    return -Math.round(best * 100) / 100;   // 기운 각도의 반대 = 돌려야 할 각도
  };
  function perimeterColor(c) {
    var g = c.getContext('2d'), w = c.width, h = c.height, t = Math.max(2, Math.round(Math.min(w, h) * 0.006)), rs = [], gs = [], bs = [];
    [[0, 0, w, t], [0, h - t, w, t], [0, 0, t, h], [w - t, 0, t, h]].forEach(function (r) { var d = g.getImageData(r[0], r[1], r[2], r[3]).data; for (var i = 0; i < d.length; i += 16) { rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); } });
    return [median(rs), median(gs), median(bs)];
  }
  // 회전(90° 단위) + 미세 각도 보정 → 새 캔버스 (모서리는 가장자리 색으로 채움)
  Sc.straighten = function (src, quarter, angle) {
    var q = ((quarter % 4) + 4) % 4, sw = q % 2 ? src.height : src.width, sh = q % 2 ? src.width : src.height, c = cv(sw, sh), g = c.getContext('2d'), pc = perimeterColor(src);
    g.fillStyle = 'rgb(' + pc.join(',') + ')'; g.fillRect(0, 0, sw, sh);
    g.save(); g.translate(sw / 2, sh / 2); g.rotate(q * Math.PI / 2 + angle * Math.PI / 180); g.drawImage(src, -src.width / 2, -src.height / 2); g.restore(); return c;
  };
  Sc.autoTrim = function (c) {   // 스캐너 바탕(가장자리와 같은 색의 균일한 띠) 비율 {l,r,t,b}
    var w = c.width, h = c.height, g = c.getContext('2d'), d = g.getImageData(0, 0, w, h).data, B = perimeterColor(c);
    var ix = Math.round(w * 0.1), iy = Math.round(h * 0.1), id = g.getImageData(ix, iy, 6, 6).data, P = [id[0], id[1], id[2]];
    if (Math.abs(lum(B[0], B[1], B[2]) - lum(P[0], P[1], P[2])) < 30 && Math.abs(B[0] - P[0]) + Math.abs(B[1] - P[1]) + Math.abs(B[2] - P[2]) < 60) return { l: 0, r: 0, t: 0, b: 0 };   // 바탕과 종이가 같은 색 → 자르지 않음
    function isBg(i) { return Math.abs(d[i] - B[0]) + Math.abs(d[i + 1] - B[1]) + Math.abs(d[i + 2] - B[2]) < 45; }
    function rowBg(y) { var n = 0, st = Math.max(1, w >> 8); for (var x = 0; x < w; x += st) if (isBg((y * w + x) * 4)) n++; return n / Math.ceil(w / st) > 0.97; }
    function colBg(x) { var n = 0, st = Math.max(1, h >> 8); for (var y = 0; y < h; y += st) if (isBg((y * w + x) * 4)) n++; return n / Math.ceil(h / st) > 0.97; }
    var t = 0, b = 0, l = 0, r = 0;
    while (t < h * 0.15 && rowBg(t)) t++; while (b < h * 0.15 && rowBg(h - 1 - b)) b++; while (l < w * 0.15 && colBg(l)) l++; while (r < w * 0.15 && colBg(w - 1 - r)) r++;
    return { l: l / w, r: r / w, t: t / h, b: b / h };
  };
  function paperFor(w, h) {   // 가로·세로 비율 → 표준 용지(오차 5%) 또는 직접 규격
    var land = w >= h, ratio = Math.max(w, h) / Math.min(w, h), best = null, bd = 0.05;
    ['A4', 'B5', 'B4', 'Letter', 'A3'].forEach(function (k) { var p = AW.PAPERS[k]; if (!p) return; var r = p[1] / p[0], d = Math.abs(ratio - r) / r; if (d < bd - 0.01 || (d < 0.05 && !best)) { bd = Math.min(bd, d); best = { paper: k, w: land ? p[1] : p[0], h: land ? p[0] : p[1] }; } });
    if (best) { best.orient = land ? 'L' : 'P'; return best; }
    var big = 297; return { paper: 'custom', w: land ? big : AW.round(big * w / h, 1), h: land ? AW.round(big * h / w, 1) : big, orient: land ? 'L' : 'P' };
  }
  Sc.finalize = function (c, trim, maxPx) {   // 자르기 → 용지 비율로 맞춤 → {canvas, page}
    var sx = Math.round(c.width * trim.l), sy = Math.round(c.height * trim.t), sw = c.width - sx - Math.round(c.width * trim.r), sh = c.height - sy - Math.round(c.height * trim.b);
    var pg = paperFor(sw, sh), k = Math.min(1, (maxPx || 2480) / Math.max(sw, sh)), ow = Math.round(sw * k), oh = Math.round(ow * pg.h / pg.w), o = cv(ow, oh), g = o.getContext('2d');
    g.imageSmoothingQuality = 'high'; g.drawImage(c, sx, sy, sw, sh, 0, 0, ow, oh); return { canvas: o, page: pg };
  };

  /* ───────────── 2) 글자 영역 검출 (이미지 분석 — 위치·크기는 원본 픽셀 그대로) ─────────────
   * Otsu 이진화 → 연결 성분 → 테두리·장식 제외 → 붉은 직인 묶음 → 줄 단위 묶음. AI는 위치를 정하지 않고 읽기·분류만 한다.
   */
  function bandExtent(prof, n, cap) {   // 가장자리 안쪽의 빽빽한 테두리 무늬 띠 두께(px). 상한 cap(비율)으로 본문 글자를 보호
    var lim = Math.floor(n * cap), gapMax = Math.max(3, Math.round(n * 0.02)), end = -1, gap = 0, started = false, i;
    for (i = Math.round(n * 0.012); i < lim; i++) {   // 맨 가장자리 1.2%는 스캔 잔여선이 있을 수 있어 제외
      if (prof[i] > 0.12) { end = i; gap = 0; started = true; } else if (started) { gap++; if (gap > gapMax) break; } else if (i > n * 0.06) break;
    }
    return end < 0 ? 0 : end + Math.max(2, Math.round(n * 0.004));
  }
  Sc.detect = function (cvs) {
    var W = cvs.width, H = cvs.height, N = W * H, d = cvs.getContext('2d').getImageData(0, 0, W, H).data, L = new Uint8Array(N), hist = new Int32Array(256), i, x, y, sum = 0;
    for (i = 0; i < N; i++) { var v = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8; L[i] = v; hist[v]++; sum += v; }
    var wB = 0, sB = 0, mx = 0, T = 128, tot = 0; for (i = 0; i < 256; i++) tot += i * hist[i];
    for (i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; var wF = N - wB; if (!wF) break; sB += i * hist[i]; var m1 = sB / wB, m2 = (tot - sB) / wF, vv = wB * wF * (m1 - m2) * (m1 - m2); if (vv > mx) { mx = vv; T = i; } }
    var light = sum / N < 100, ink = new Uint8Array(N); for (i = 0; i < N; i++) ink[i] = (light ? L[i] > T : L[i] < T) ? 1 : 0;
    // 연결 성분(8방향)
    var lab = new Int32Array(N), par = new Int32Array((N >> 1) + 2), nl = 0;
    function find(a) { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var idx = y * W + x; if (!ink[idx]) continue; var a = 0, b = 0, c2 = 0, e = 0;
      if (x > 0) a = lab[idx - 1]; if (y > 0) { if (x > 0) b = lab[idx - W - 1]; c2 = lab[idx - W]; if (x < W - 1) e = lab[idx - W + 1]; }
      var mn = 0; [a, b, c2, e].forEach(function (q) { if (q && (!mn || q < mn)) mn = q; });
      if (!mn) { nl++; par[nl] = nl; lab[idx] = nl; } else { lab[idx] = mn; [a, b, c2, e].forEach(function (q) { if (q && q !== mn) { var r1 = find(q), r2 = find(mn); if (r1 !== r2) { if (r1 < r2) par[r2] = r1; else par[r1] = r2; } } }); }
    }
    var map = new Int32Array(nl + 1), nc = 0; for (i = 1; i <= nl; i++) if (find(i) === i) map[i] = ++nc;
    var C = []; for (i = 0; i <= nc; i++) C.push({ x0: W, y0: H, x1: -1, y1: -1, n: 0, r: 0, g: 0, b: 0 });
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) { var id = y * W + x, l = lab[id]; if (!l) continue; var k = map[find(l)]; lab[id] = k; var c = C[k]; if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y; c.n++; c.r += d[id * 4]; c.g += d[id * 4 + 1]; c.b += d[id * 4 + 2]; }
    // 테두리 띠(가장자리 무늬) 두께
    var colP = new Float32Array(W), rowP = new Float32Array(H); for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (ink[y * W + x]) { colP[x]++; rowP[y]++; }
    for (x = 0; x < W; x++) colP[x] /= H; for (y = 0; y < H; y++) rowP[y] /= W;
    var bl = bandExtent(colP, W, 0.14), br = bandExtent(colP.slice().reverse(), W, 0.14), bt = bandExtent(rowP, H, 0.12), bb = bandExtent(rowP.slice().reverse(), H, 0.12);
    var prot = new Uint8Array(nc + 1), cand = [];
    for (i = 1; i <= nc; i++) {
      var q = C[i]; q.w = q.x1 - q.x0 + 1; q.h = q.y1 - q.y0 + 1; q.cx = (q.x0 + q.x1) / 2; q.cy = (q.y0 + q.y1) / 2;
      var fr = q.w > 0.35 * W || q.h > 0.35 * H || (q.w / q.h > 25 && q.w > 0.06 * W) || (q.h / q.w > 25 && q.h > 0.06 * H);
      var inBand = q.cx < bl || q.cx > W - br || q.cy < bt || q.cy > H - bb;
      if (fr || (inBand && !(q.w > 0.06 * W && q.h > 0.05 * H))) { prot[i] = 1; continue; }
      if (q.n < 6) continue; cand.push(i);
    }
    var minDim = Math.max(W, H);
    // 붉은 직인 묶음
    var reds = cand.filter(function (i2) { var q2 = C[i2], r = q2.r / q2.n, g = q2.g / q2.n, b = q2.b / q2.n; return r > g + 55 && r > b + 45 && q2.n >= 10; }), cl = [];
    reds.forEach(function (i2) { var q2 = C[i2], hit = null; cl.forEach(function (k2) { var gp = minDim * 0.025; if (q2.x0 <= k2.x1 + gp && q2.x1 >= k2.x0 - gp && q2.y0 <= k2.y1 + gp && q2.y1 >= k2.y0 - gp) hit = hit || k2; }); if (hit) { hit.ids.push(i2); hit.x0 = Math.min(hit.x0, q2.x0); hit.y0 = Math.min(hit.y0, q2.y0); hit.x1 = Math.max(hit.x1, q2.x1); hit.y1 = Math.max(hit.y1, q2.y1); } else cl.push({ ids: [i2], x0: q2.x0, y0: q2.y0, x1: q2.x1, y1: q2.y1 }); });
    var regions = [], used = {};
    cl.forEach(function (k2) {
      var n = 0; k2.ids.forEach(function (i2) { n += C[i2].n; }); if ((k2.x1 - k2.x0) < W * 0.025 || n < 60) return;
      k2.ids.forEach(function (i2) { used[i2] = 1; }); cand.forEach(function (i2) { var q3 = C[i2]; if (!used[i2] && q3.cx >= k2.x0 && q3.cx <= k2.x1 && q3.cy >= k2.y0 && q3.cy <= k2.y1) used[i2] = 1; });
      regions.push({ kind: 'object', type: 'seal', box: { x: k2.x0, y: k2.y0, w: k2.x1 - k2.x0 + 1, h: k2.y1 - k2.y0 + 1 }, hs: [], xs: [] });
    });
    // 줄·덩어리 나누기 (XY-cut): 가로 틈 → 세로 틈을 번갈아 재귀적으로 나눠 더 못 나누면 한 영역
    var rest = cand.filter(function (i2) { return !used[i2]; }), leaves = [];
    function xycut(ids, depth) {
      if (!ids.length) return; var hs0 = ids.map(function (k3) { return C[k3].h; }).sort(function (a2, b2) { return a2 - b2; }), p80 = hs0[Math.floor(0.9 * (hs0.length - 1))];   // 글자 한 칸 높이(조각난 자모를 감안해 상위 값)
      function split(key0, key1, th) {
        var so = ids.slice().sort(function (a2, b2) { return C[a2][key0] - C[b2][key0]; }), gs = [[so[0]]], reach = C[so[0]][key1];
        for (var k4 = 1; k4 < so.length; k4++) { var cc = C[so[k4]]; if (cc[key0] - reach > th) { gs.push([so[k4]]); reach = cc[key1]; } else { gs[gs.length - 1].push(so[k4]); reach = Math.max(reach, cc[key1]); } }
        return gs;
      }
      var g1 = split('y0', 'y1', Math.max(1, 0.2 * p80)); if (g1.length > 1 && depth < 80) { g1.forEach(function (g) { xycut(g, depth + 1); }); return; }
      var g2 = split('x0', 'x1', Math.max(2, 1.3 * p80)); if (g2.length > 1 && depth < 80) { g2.forEach(function (g) { xycut(g, depth + 1); }); return; }
      leaves.push(ids);
    }
    xycut(rest, 0);
    // 쉼표·마침표·콜론처럼 작은 조각은 같은 줄의 이웃 영역에 붙임
    function lbox(ids) { var b = { x0: W, y0: H, x1: -1, y1: -1 }; ids.forEach(function (k) { var q = C[k]; b.x0 = Math.min(b.x0, q.x0); b.y0 = Math.min(b.y0, q.y0); b.x1 = Math.max(b.x1, q.x1); b.y1 = Math.max(b.y1, q.y1); }); b.h = b.y1 - b.y0 + 1; b.w = b.x1 - b.x0 + 1; return b; }
    var lb = leaves.map(lbox);
    lb.forEach(function (sb, i) {
      if (!leaves[i] || sb.w > minDim * 0.03 || sb.h > minDim * 0.03) return; var best = -1, bg = 1e9;
      lb.forEach(function (nb, j) { if (j === i || !leaves[j] || nb.h < sb.h * 1.8) return; var cy = (sb.y0 + sb.y1) / 2; if (cy < nb.y0 - nb.h * 0.2 || cy > nb.y1 + nb.h * 0.2) return; var gp = Math.max(nb.x0 - sb.x1, sb.x0 - nb.x1, 0); if (gp <= 1.3 * nb.h && gp < bg) { bg = gp; best = j; } });
      if (best >= 0) { leaves[best] = leaves[best].concat(leaves[i]); leaves[i] = null; lb[best] = lbox(leaves[best]); }
    });
    leaves = leaves.filter(Boolean);
    leaves.forEach(function (ids) {
      var x0 = W, y0 = H, x1 = -1, y1 = -1, nn = 0, r = 0, g = 0, b = 0; ids.forEach(function (k5) { var q5 = C[k5]; x0 = Math.min(x0, q5.x0); y0 = Math.min(y0, q5.y0); x1 = Math.max(x1, q5.x1); y1 = Math.max(y1, q5.y1); nn += q5.n; r += q5.r; g += q5.g; b += q5.b; });
      var w = x1 - x0 + 1, h = y1 - y0 + 1; if (ids.length < 2 && (h < H * 0.007 || nn < 25)) return; if (w * h < 120) return;
      regions.push({ kind: 'text', type: 'text', box: { x: x0, y: y0, w: w, h: h }, rows: [{ x: x0, w: w, h: h, cy: y0 + h / 2, top: y0 }], hs: ids.map(function (k6) { return C[k6].h; }), xs: ids.map(function (k7) { return [C[k7].x0, C[k7].x1]; }).sort(function (a3, b3) { return a3[0] - b3[0]; }), color: '#' + [r / nn, g / nn, b / nn].map(function (v2) { return ('0' + Math.round(Math.max(0, Math.min(255, v2 * 0.8))).toString(16)).slice(-2); }).join('') });
    });
    regions.sort(function (p, q8) { return (p.box.y + p.box.h / 2) - (q8.box.y + q8.box.h / 2) || p.box.x - q8.box.x; });
    if (regions.length > 110) regions = regions.sort(function (p, q9) { return q9.box.w * q9.box.h - p.box.w * p.box.h; }).slice(0, 110).sort(function (p, q10) { return (p.box.y + p.box.h / 2) - (q10.box.y + q10.box.h / 2) || p.box.x - q10.box.x; });
    regions.forEach(function (r2, n2) { r2.id = n2 + 1; });
    return { W: W, H: H, regions: regions, lab: lab, prot: prot, ink: ink, T: T };
  };

  /* ───────────── 3) 글자 지우기 · 개체 잘라내기 ───────────── */
  function dist(d, i, c) { return Math.max(Math.abs(d[i] - c[0]), Math.abs(d[i + 1] - c[1]), Math.abs(d[i + 2] - c[2])); }
  function objBg(d, w, h) {   // 영역 테두리 픽셀의 중앙값 = 종이 색
    var v = [[], [], []]; for (var x = 0; x < w; x++) for (var k = 0; k < 2; k++) { var t = ((k ? h - 1 : 0) * w + x) * 4; for (var c = 0; c < 3; c++) v[c].push(d[t + c]); }
    for (var y = 0; y < h; y++) for (var k2 = 0; k2 < 2; k2++) { var t2 = (y * w + (k2 ? w - 1 : 0)) * 4; for (var c2 = 0; c2 < 3; c2++) v[c2].push(d[t2 + c2]); }
    return [median(v[0]), median(v[1]), median(v[2])];
  }
  function cutout(g, b) {   // 종이 색을 투명하게 → PNG 개체
    var id = g.getImageData(b.x, b.y, b.w, b.h), d = id.data, bg = objBg(d, b.w, b.h);
    for (var i = 0; i < d.length; i += 4) { var a = Math.max(0, Math.min(1, (dist(d, i, bg) - 14) / 56)); d[i + 3] = Math.round(a * 255); }
    var c = cv(b.w, b.h); c.getContext('2d').putImageData(id, 0, 0); return c.toDataURL('image/png');
  }
  // 상자 안의 글자 픽셀(테두리·장식은 제외)만 골라 좌우 배경색을 보간해 메움
  function eraseBox(g, det, b, R) {
    R = R || 2; var W = det.W, H = det.H, pad = R + 8, X0 = Math.max(0, Math.floor(b.x) - pad), Y0 = Math.max(0, Math.floor(b.y) - pad), X1 = Math.min(W, Math.ceil(b.x + b.w) + pad), Y1 = Math.min(H, Math.ceil(b.y + b.h) + pad), w = X1 - X0, h = Y1 - Y0;
    if (w < 3 || h < 3) return;
    var im = g.getImageData(X0, Y0, w, h), d = im.data, mk = new Uint8Array(w * h), x, y, bx0 = Math.floor(b.x), by0 = Math.floor(b.y), bx1 = Math.ceil(b.x + b.w), by1 = Math.ceil(b.y + b.h);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var gx = X0 + x, gy = Y0 + y; if (gx < bx0 || gx >= bx1 || gy < by0 || gy >= by1) continue; var gi = gy * W + gx; if (det.ink[gi] && !det.prot[det.lab[gi]]) mk[y * w + x] = 1; }
    var m2 = new Uint8Array(w * h); for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (mk[y * w + x]) for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) { var yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w) { var gi2 = (Y0 + yy) * W + X0 + xx; if (det.ink[gi2] && det.prot[det.lab[gi2]]) continue; m2[yy * w + xx] = 1; } }   // 번지는 가장자리까지 지우되 테두리·장식 픽셀은 보존
    for (y = 0; y < h; y++) {
      x = 0; while (x < w) {
        if (!m2[y * w + x]) { x++; continue; } var s = x; while (x < w && m2[y * w + x]) x++; var e = x - 1, lx = s - 1, rx = e + 1;
        function px(xx2) { var o = (y * w + xx2) * 4; return [d[o], d[o + 1], d[o + 2]]; }
        var lc = lx >= 0 ? px(lx) : null, rc = rx < w ? px(rx) : null; if (!lc) lc = rc; if (!rc) rc = lc; if (!lc) continue;
        for (var q = s; q <= e; q++) { var t = e === s ? 0.5 : (q - s) / (e - s), o2 = (y * w + q) * 4; d[o2] = lc[0] * (1 - t) + rc[0] * t; d[o2 + 1] = lc[1] * (1 - t) + rc[1] * t; d[o2 + 2] = lc[2] * (1 - t) + rc[2] * t; }
      }
    }
    g.putImageData(im, X0, Y0);
  }

  /* ───────────── 4) AI: 번호가 붙은 상자를 읽고 분류 (위치는 건드리지 않음) ───────────── */
  var COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#008080', '#9a6324', '#800000'];
  function marked(canvas, regions) {
    var k = Math.min(1, 1600 / Math.max(canvas.width, canvas.height)), c = cv(canvas.width * k, canvas.height * k), g = c.getContext('2d'); g.drawImage(canvas, 0, 0, c.width, c.height);
    regions.forEach(function (r) {
      var col = COLORS[r.id % COLORS.length], x = r.box.x * k, y = r.box.y * k, w = r.box.w * k, h = r.box.h * k; g.strokeStyle = col; g.lineWidth = 2; g.strokeRect(x - 2, y - 2, w + 4, h + 4);
      var t = String(r.id), tw = g.measureText(t).width; g.font = 'bold 15px sans-serif'; tw = g.measureText(t).width + 6; g.fillStyle = col; g.fillRect(x - 2, Math.max(0, y - 18), tw, 17); g.fillStyle = '#fff'; g.textBaseline = 'top'; g.fillText(t, x + 1, Math.max(0, y - 17));
    });
    return c;
  }
  var SYS = '당신은 한국어 상장·증서 스캔 이미지의 글자를 읽는 전문가입니다. 출력은 JSON 객체 하나만, 마크다운·설명 금지.\n' +
    '입력: ① 원본 이미지 ② 같은 이미지에 검출된 영역마다 번호(색 상자)를 표시한 이미지. 상자의 위치는 이미 정확하므로 좌표를 답하지 마십시오. 번호별로 내용만 판독합니다.\n' +
    '형식: {"regions":[{"id":1,"type":"text|seal|logo|signature|ornament|noise","text":"글자 그대로","variable":false,"field":"","bold":false,"font":"글꼴ID","splitAt":0}],"groups":[{"ids":[3,4],"type":"text|logo|seal|signature"}]}\n' +
    '규칙: 1) type=text 는 읽을 수 있는 글자 영역(text 필수, 오탈자 없이 보이는 그대로). 직인·도장=seal, 학교 로고·엠블럼=logo, 손글씨 서명=signature, 테두리 무늬·꽃·장식 조각=ornament, 얼룩·점=noise. 2) 같은 문단의 여러 줄처럼 한 글상자로 합쳐야 하는 번호들, 또는 하나의 로고·직인을 이룬 번호들은 groups 에 묶습니다(묶인 text 는 줄바꿈으로 이어 붙임). 묶음에 속한 번호는 regions 에도 적습니다. 3) 「성명 : 홍길동」처럼 한 상자에 라벨과 값이 함께 있으면 splitAt 에 라벨(콜론 포함)의 글자 수(공백 제외)를 적습니다(없으면 0). 4) variable=true 는 수여자마다 달라지는 값(성명, 소속·학과·반, 학번, 수여일·발급일, 상장 번호, 바뀔 수 있는 상 이름)이며 field 에 짧은 한글 항목명을 적습니다. 제목(상장), 정형 문구, 라벨, 학교명, 학교장 직함은 고정입니다. 5) font 는 제공된 글꼴ID 중 가장 닮은 하나(궁서 느낌=Gungsuh, 바탕·명조=Batang 또는 Nanum Myeongjo, 굵은 제목 고딕=Black Han Sans, 일반 고딕=Noto Sans KR, 영문 격식=Times New Roman). 6) 모든 번호에 대해 빠짐없이 답합니다.';
  Sc.label = function (canvas, regions) {
    var k = Math.min(1, 1600 / Math.max(canvas.width, canvas.height)), cl = cv(canvas.width * k, canvas.height * k); cl.getContext('2d').drawImage(canvas, 0, 0, cl.width, cl.height);
    var fonts = AW.FONTS.map(function (f) { return f.id + '(' + f.label + ')'; }).join(', ');
    var content = [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: cl.toDataURL('image/jpeg', 0.85).split(',')[1] } }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: marked(canvas, regions).toDataURL('image/jpeg', 0.85).split(',')[1] } },
      { type: 'text', text: '번호 1~' + regions.length + ' 영역을 판독해 JSON 으로 답하십시오. 사용 가능한 글꼴ID: ' + fonts }];
    return AW.AI.json(SYS, content, 9000);
  };
  Sc.readRegion = function (canvas, box) {   // 사용자가 그린 영역의 글자를 AI 로 읽기
    var px = Math.round(Math.max(box.w, box.h) * 0.12) + 4, x0 = Math.max(0, box.x - px), y0 = Math.max(0, box.y - px), w = Math.min(canvas.width - x0, box.w + 2 * px), h = Math.min(canvas.height - y0, box.h + 2 * px), k = Math.min(2, 1000 / Math.max(w, h)), c = cv(w * k, h * k);
    c.getContext('2d').drawImage(canvas, x0, y0, w, h, 0, 0, c.width, c.height);
    return AW.AI.call('이미지에 보이는 한글·영문·숫자를 오탈자 없이 그대로 옮깁니다. 줄바꿈은 유지하고 설명 없이 글자만 출력합니다. 글자가 없으면 빈 응답을 합니다.', [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85).split(',')[1] } }, { type: 'text', text: '이 영역의 글자를 그대로 적어 주십시오.' }], 800).then(function (t) { return String(t || '').replace(/^```[a-z]*\s*|\s*```$/g, '').trim(); });
  };

  /* ───────────── UI ───────────── */
  var st = null;
  Sc.open = function () {
    st = { src: null, quarter: 0, angle: 0, trim: { l: 0, r: 0, t: 0, b: 0 }, auto: null, items: [], erase: true, name: '' };
    var m = { el: null };
    AW.modal({ title: '스캔본으로 양식 자동 만들기 (AI)', wide: true, sticky: true, body: '<div id="sc-b"></div>', actions: [{ label: '닫기', cls: 'btn-ghost' }], onOpen: function (el) { m.el = el; step1(el); } });
  };
  function body(el) { return AW.$('#sc-b', el); }
  function step1(el) {
    body(el).innerHTML = '<p style="margin-top:0">이미 출력했거나 스캔한 상장·양식 파일(JPG·PNG·PDF)을 올리면 <b>① 기울기·여백 보정 → ② AI 글자 판독 → ③ 글자를 지운 배경 생성 → ④ 글상자·메일머지 항목 자동 배치</b>까지 한 번에 진행합니다. 결과는 <b>새 양식</b>으로 만들어지며 현재 양식은 그대로 저장됩니다.</p>' +
      '<label class="drop" id="sc-drop" style="display:block;padding:30px;text-align:center;border:2px dashed var(--border);border-radius:12px;cursor:pointer"><input type="file" id="sc-f" accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf" class="hide" multiple>' + AW.ic('upload', 22) + '<br><b>파일을 끌어 놓거나 눌러서 선택</b> <span class="muted">(여러 장을 한꺼번에 선택하면 일괄 처리)</span><br><span class="muted">PDF 는 한 쪽 파일은 그대로, 여러 쪽이면 쪽마다 양식 한 개씩 만들 수 있습니다. 사진보다 스캔본이 정확합니다.</span></label>';
    var f = AW.$('#sc-f', el), dz = AW.$('#sc-drop', el);
    f.onchange = function () { pick(el, f.files); };
    dz.ondragover = function (e) { e.preventDefault(); }; dz.ondrop = function (e) { e.preventDefault(); pick(el, e.dataTransfer.files); };
  }
  function load(el, file) {
    body(el).innerHTML = '<div class="loading">파일을 읽는 중…</div>';
    AW.Editor.readSource(file, 2480).then(function (r) { return loadImg(r.url).then(function (im) { var c = cv(im.naturalWidth, im.naturalHeight); c.getContext('2d').drawImage(im, 0, 0); st.src = c; st.name = (file.name || '스캔').replace(/\.[^.]+$/, '') + (file.__page ? ' ' + file.__page + '쪽' : ''); autoFit(el); }); })
      .catch(function (e) { AW.toast(e.message, 'error'); step1(el); });
  }
  function autoFit(el) {
    body(el).innerHTML = '<div class="loading">기울기와 여백을 맞추는 중…</div>';
    setTimeout(function () {
      st.angle = Sc.estimateSkew(st.src); var c = Sc.straighten(st.src, st.quarter, st.angle); st.trim = Sc.autoTrim(c); if (st.auto) run(el); else step2(el);
    }, 30);
  }
  function step2(el) {
    var k = Math.min(1, 560 / Math.max(st.src.width, st.src.height)), small = cv(st.src.width * k, st.src.height * k); small.getContext('2d').drawImage(st.src, 0, 0, small.width, small.height);
    body(el).innerHTML = '<div class="sc-grid"><div><div class="sc-pv" id="sc-pv"></div><div class="muted" id="sc-info" style="margin-top:6px"></div></div><div>' +
      '<p style="margin-top:0">기울기와 여백을 자동으로 맞췄습니다. 미리보기를 보고 필요하면 조정해 주십시오. 용지 규격(A4 등)에는 자동으로 맞춰집니다.</p>' +
      '<label class="f">기울기 보정 <b id="sc-av"></b>°</label><input type="range" id="sc-a" min="-8" max="8" step="0.05" style="width:100%">' +
      '<div class="grid2"><div><label class="f">왼쪽 자르기 %</label><input class="in sm" type="number" id="sc-tl" min="0" max="20" step="0.1"></div><div><label class="f">오른쪽 자르기 %</label><input class="in sm" type="number" id="sc-tr" min="0" max="20" step="0.1"></div><div><label class="f">위쪽 자르기 %</label><input class="in sm" type="number" id="sc-tt" min="0" max="20" step="0.1"></div><div><label class="f">아래쪽 자르기 %</label><input class="in sm" type="number" id="sc-tb" min="0" max="20" step="0.1"></div></div>' +
      '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-secondary btn-sm" data-s="rl">' + AW.ic('undo', 14) + ' 왼쪽 90° 회전</button><button class="btn btn-secondary btn-sm" data-s="rr">오른쪽 90° 회전</button><button class="btn btn-ghost btn-sm" data-s="auto">자동 다시 맞춤</button><button class="btn btn-ghost btn-sm" data-s="file">다른 파일</button></div>' +
      '<div class="radios" style="margin-top:12px"><label><input type="checkbox" id="sc-er" ' + (st.erase ? 'checked' : '') + '> 판독한 글자를 배경에서 지우기 <span class="muted">(직인·무늬는 그대로)</span></label></div>' +
      '<div style="margin-top:12px"><button class="btn btn-primary" data-s="go">' + AW.ic('sparkle', 16) + ' AI 판독 시작</button></div></div></div>';
    var P = AW.$('#sc-pv', el), I = AW.$('#sc-info', el);
    function draw() {
      var q = ((st.quarter % 4) + 4) % 4, c = Sc.straighten(small, q, st.angle), fin = Sc.finalize(c, st.trim, 560); fin.canvas.style.cssText = 'max-width:100%;border:1px solid var(--border);display:block'; P.innerHTML = ''; P.appendChild(fin.canvas);
      I.textContent = '결과 용지: ' + (fin.page.paper === 'custom' ? '직접 규격' : fin.page.paper) + ' ' + fin.page.w + '×' + fin.page.h + 'mm (' + (fin.page.orient === 'L' ? '가로' : '세로') + ')';
      AW.$('#sc-av', el).textContent = st.angle.toFixed(2);
    }
    function sync() { AW.$('#sc-a', el).value = st.angle; AW.$('#sc-tl', el).value = AW.round(st.trim.l * 100, 1); AW.$('#sc-tr', el).value = AW.round(st.trim.r * 100, 1); AW.$('#sc-tt', el).value = AW.round(st.trim.t * 100, 1); AW.$('#sc-tb', el).value = AW.round(st.trim.b * 100, 1); draw(); }
    sync();
    AW.$('#sc-a', el).oninput = function (e) { st.angle = +e.target.value; draw(); };
    [['tl', 'l'], ['tr', 'r'], ['tt', 't'], ['tb', 'b']].forEach(function (p) { AW.$('#sc-' + p[0], el).onchange = function (e) { st.trim[p[1]] = Math.max(0, Math.min(20, +e.target.value || 0)) / 100; draw(); }; });
    AW.$('#sc-er', el).onchange = function (e) { st.erase = e.target.checked; };
    AW.$$('[data-s]', el).forEach(function (b) { b.onclick = function () {
      var a = b.dataset.s;
      if (a === 'rl') { st.quarter--; sync(); } else if (a === 'rr') { st.quarter++; sync(); } else if (a === 'auto') autoFit(el); else if (a === 'file') step1(el); else if (a === 'go') run(el);
    }; });
  }
  /* ───────────── 여러 장 처리 ───────────── */
  var OKF = /\.(jpe?g|png|pdf)$/i;
  function expand(files) {   // 파일 → 작업 목록(PDF 는 쪽마다)
    var tasks = [];
    return files.reduce(function (p, f) {
      return p.then(function () {
        if (!/\.pdf$/i.test(f.name) && !/pdf$/i.test(f.type)) { tasks.push({ file: f, page: 0, label: f.name }); return; }
        return AW.Editor.pdfCount(f).then(function (n) { for (var k = 1; k <= Math.min(n, 30); k++) tasks.push({ file: f, page: k, label: f.name + (n > 1 ? ' · ' + k + '쪽' : '') }); }).catch(function () { tasks.push({ file: f, page: 1, label: f.name }); });
      });
    }, Promise.resolve()).then(function () { return tasks.slice(0, 40); });
  }
  function pick(el, files) {
    files = Array.prototype.filter.call(files || [], function (f) { return OKF.test(f.name) || /^image\//.test(f.type) || /pdf$/i.test(f.type); }); if (!files.length) return AW.toast('JPG·PNG·PDF 파일만 올릴 수 있습니다.', 'error');
    if (files.length === 1 && !/pdf$/i.test(files[0].type) && !/\.pdf$/i.test(files[0].name)) { st.queue = []; st.auto = false; return load(el, files[0]); }
    body(el).innerHTML = '<div class="loading">파일을 확인하는 중…</div>';
    expand(files).then(function (tasks) {
      if (tasks.length === 1 && !tasks[0].page) { st.queue = []; return load(el, tasks[0].file); }
      body(el).innerHTML = '<p style="margin-top:0"><b>' + tasks.length + '장</b>을 처리합니다' + (tasks.length >= 40 ? ' (한 번에 최대 40장)' : '') + '. PDF 는 쪽마다 양식 한 개가 만들어집니다.</p><div class="sc-bl">' + tasks.map(function (t, i) { return '<div class="sc-br">' + (i + 1) + '. ' + AW.esc(t.label) + '</div>'; }).join('') + '</div>' +
        '<div class="radios" style="margin-top:10px"><label><input type="radio" name="sc-m" value="auto" checked> <b>자동으로 모두 만들기</b> <span class="muted">(기울기·글자 판독·배경 정리·항목 지정을 장마다 자동 진행 → 양식 목록에 저장, 완료 후 열기/수정)</span></label>' +
        '<label><input type="radio" name="sc-m" value="review"> <b>한 장씩 영역을 확인하며 만들기</b> <span class="muted">(장마다 영역 편집 화면에서 확인 후 새 탭으로 열림)</span></label>' +
        '<label><input type="checkbox" id="sc-e2" checked> 판독한 글자를 배경에서 지우기</label></div><div style="margin-top:10px"><button class="btn btn-primary" id="sc-go">' + AW.ic('sparkle', 16) + ' 시작</button> <button class="btn btn-ghost" id="sc-bk">다시 선택</button></div>';
      AW.$('#sc-bk', el).onclick = function () { step1(el); };
      AW.$('#sc-go', el).onclick = function () { var mode = AW.$('input[name="sc-m"]:checked', el).value; st.erase = AW.$('#sc-e2', el).checked; if (mode === 'auto') runBatch(el, tasks); else { st.queue = tasks.slice(); st.auto = true; nextTask(el); } };
    }).catch(function (e) { AW.toast(e.message, 'error'); step1(el); });
  }
  function readTask(t) {   // 작업 → {src canvas, name}
    return AW.Editor.readSource(t.file, 2480, t.page || 0).then(function (r) { return loadImg(r.url).then(function (im) { var c = cv(im.naturalWidth, im.naturalHeight); c.getContext('2d').drawImage(im, 0, 0); return { src: c, name: (t.file.name || '스캔').replace(/\.[^.]+$/, '') + (t.page && t.label.indexOf('쪽') >= 0 ? ' ' + t.page + '쪽' : '') }; }); });
  }
  function nextTask(el) {   // 한 장씩 확인 모드: 대기열의 다음 파일을 불러와 영역 편집 화면까지
    if (!st.queue || !st.queue.length) { AW.$$('.aw-ov').forEach(function (o) { o.remove(); }); return AW.toast('모든 스캔본을 처리했습니다.', 'ok'); }
    var t = st.queue[0], n = st.queue.length; st.erase = st.erase !== false; body(el).innerHTML = '<div class="loading">' + AW.esc(t.label) + ' 를 읽는 중… (남은 ' + n + '장)</div>';
    readTask(t).then(function (r) { st.src = r.src; st.name = r.name; st.quarter = 0; st.auto = true; st.qinfo = '남은 장수 ' + n + ' · ' + t.label; autoFit(el); }).catch(function (e) { AW.toast(t.label + ': ' + e.message, 'error'); st.queue.shift(); nextTask(el); });
  }
  function saveDirect(r) {   // 탭을 열지 않고 서버에 바로 저장 (일괄 처리)
    var fields = r.keys.map(function (n) { var g = AW.guessHint(n); return { name: n, hint: g.hint, example: r.rows0[n], sample: r.rows0[n], max: 0, req: true }; });
    return AW.call('award_tpl_save', { p_id: null, p_base_ver: 0, p_force: false, p_name: r.nt.name, p_page: r.nt.page, p_elems: r.nt.elems, p_fields: fields, p_rows: r.keys.length ? [r.rows0] : [], p_bg: r.nt.bg, p_bg_name: r.nt.bgName || '', p_note: '스캔 일괄 생성' }).then(function (x) { if (!x || !x.ok) throw new Error((x && x.error) || '저장 실패'); AW.log('scan_make', x.id, { texts: r.nTxt, objects: r.nObj, fields: r.keys, batch: true }); return x.id; });
  }
  function runBatch(el, tasks) {
    var res = [], stop = false; body(el).innerHTML = '<p style="margin-top:0"><b id="sb-t">처리 중…</b></p><div class="sc-bl" id="sb-l">' + tasks.map(function (t, i) { return '<div class="sc-br" data-i="' + i + '"><span class="sc-st">대기</span> ' + AW.esc(t.label) + '</div>'; }).join('') + '</div><div style="margin-top:8px"><button class="btn btn-ghost btn-sm" id="sb-x">중단</button></div>';
    AW.$('#sb-x', el).onclick = function () { stop = true; this.disabled = true; };
    var row = function (i, cls, txt) { var r = AW.$('.sc-br[data-i="' + i + '"]', el); if (r) { r.className = 'sc-br ' + cls; AW.$('.sc-st', r).textContent = txt; } };
    tasks.reduce(function (p, t, i) {
      return p.then(function () {
        if (stop) return row(i, 'skip', '중단됨'); row(i, 'run', '처리 중'); AW.$('#sb-t', el).textContent = (i + 1) + ' / ' + tasks.length + ' 장 처리 중…';
        return readTask(t).then(function (r) {
          var ang = Sc.estimateSkew(r.src), c = Sc.straighten(r.src, 0, ang), trim = Sc.autoTrim(c), fin = Sc.finalize(Sc.straighten(r.src, 0, ang), trim, 2480);
          return analyzeFin(fin).then(function (a) {
            if (!a.aiOk) throw new Error('AI 판독 실패 — ' + (a.err && a.err.message || '')); var any = a.items.some(function (it) { return it.kind === 'text' && it.text; }); if (!any && !a.items.some(function (it) { return it.kind === 'object'; })) throw new Error('글자를 찾지 못했습니다');
            var asm = assemble({ fin: fin, det: a.det, items: a.items, name: r.name, erase: st.erase }); return saveDirect(asm).then(function (id) { res.push({ id: id, name: r.name, asm: asm }); row(i, 'ok', '완료 · 글상자 ' + asm.nTxt + ' · 개체 ' + asm.nObj + ' · 항목 ' + asm.keys.length); });
          });
        }).catch(function (e) { row(i, 'bad', '실패: ' + (e.message || '').slice(0, 60)); });
      });
    }, Promise.resolve()).then(function () {
      AW.$('#sb-t', el).textContent = '완료 — 성공 ' + res.length + '장 / 전체 ' + tasks.length + '장'; AW.$('#sb-x', el).remove();
      var cap = 12; if (res.length) { var b = AW.$('#sb-l', el); b.insertAdjacentHTML('afterend', '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" id="sb-o">' + AW.ic('folder', 16) + ' 만든 양식 탭으로 열기 (최대 ' + cap + '개)</button><button class="btn btn-ghost" id="sb-c">닫기</button></div><p class="muted">모두 「양식 목록」에 저장되어 있습니다. 각 양식은 열어서 위치·글꼴을 다듬을 수 있습니다.</p>');
        AW.$('#sb-c', el).onclick = function () { AW.$$('.aw-ov').forEach(function (o) { o.remove(); }); };
        AW.$('#sb-o', el).onclick = function () { var list = res.slice(0, cap); AW.$$('.aw-ov').forEach(function (o) { o.remove(); }); list.reduce(function (p, x) { return p.then(function () { return AW.App.openId(x.id); }); }, Promise.resolve()); };
      }
      AW.toast('스캔 일괄 처리를 마쳤습니다. 성공 ' + res.length + '장', res.length ? 'ok' : 'error');
    });
  }
  function analyzeFin(fin) {   // 검출 → AI 읽기·분류 → 항목. 실패해도 검출 결과는 돌려줌
    var det = Sc.detect(fin.canvas), p = det.regions.length ? AW.AI.ensure().then(function () { return Sc.label(fin.canvas, det.regions); }) : Promise.resolve({});
    return p.then(function (r) { return { det: det, items: buildItems(det, r || {}), aiOk: true }; }, function (e) { return { det: det, items: buildItems(det, {}), aiOk: false, err: e }; });
  }
  function run(el) {
    var q = ((st.quarter % 4) + 4) % 4, c = Sc.straighten(st.src, q, st.angle), fin = Sc.finalize(c, st.trim, 2480); st.fin = fin;
    body(el).innerHTML = '<div class="loading">글자 영역을 검출하고 AI가 글자를 읽는 중입니다… (10~40초)</div>';
    setTimeout(function () {
      var done = function (r) { st.det = r.det; st.aiOk = r.aiOk; if (!r.aiOk) AW.toast('AI 판독을 건너뜁니다(' + (r.err && r.err.message || '실패') + '). 글자는 직접 입력하거나 「글자 AI로 읽기」를 사용하십시오.', 'error'); else if (!r.det.regions.length) AW.toast('글자로 보이는 영역을 찾지 못했습니다. 보정 값을 확인하거나 영역을 직접 그려 주십시오.'); start(el, r.items); };
      try { analyzeFin(fin).then(done); } catch (e) { AW.toast('영역 검출 실패: ' + e.message, 'error'); step2(el); }
    }, 30);
  }
  var uidn = 0;
  function hangul(s) { return /[가-힣]/.test(s); }
  function suggestField(t, used) {
    t = String(t || '').trim(); var m = [[/^\d{4}\s*[.\-년]/, '수여일'], [/학과|과정|전공|계열|\d\s*학년|\d\s*반/, '소속'], [/학교장|원장|총장|대표/, '수여자'], [/^제?\s*\d+\s*호?$|번호/, '번호'], [/상$|상장|표창/, '상명'], [/^[가-힣]{2,4}$/, '성명']], n = '';
    for (var i = 0; i < m.length; i++) if (m[i][0].test(t)) { n = m[i][1]; break; } n = n || '항목'; var f = n, k = 2; while (used[f]) f = n + (k++); return f;
  }
  function splitItem(it, n) {   // 「성명 : 홍길동」을 라벨/값 두 상자로
    var chars = it.text.replace(/\s+/g, ''); if (!it.xs || it.xs.length < 2 || n <= 0 || n >= chars.length) return [it];
    var mg = []; it.xs.forEach(function (p) { var l = mg[mg.length - 1]; if (l && p[0] <= l[1] + 1) l[1] = Math.max(l[1], p[1]); else mg.push([p[0], p[1]]); });
    var f = n / chars.length, tx = it.box.x + it.box.w * f, best = -1, bw = 0; for (var i = 0; i < mg.length - 1; i++) { var gw = mg[i + 1][0] - mg[i][1], gc = (mg[i + 1][0] + mg[i][1]) / 2; if (Math.abs(gc - tx) <= it.box.w * 0.3 && gw > bw) { bw = gw; best = i; } }
    if (best < 0 || bw < it.box.h * 0.3) return [it];
    var cnt = 0, pos = 0; for (pos = 0; pos < it.text.length && cnt < n; pos++) if (!/\s/.test(it.text[pos])) cnt++;
    var lt = it.text.slice(0, pos).trim(), vt = it.text.slice(pos).trim(); if (/^[:：]/.test(vt)) { lt += ' ' + vt[0]; vt = vt.slice(1).trim(); }
    var a = Object.assign({}, it, { uid: ++uidn, text: lt, variable: false, field: '', box: { x: it.box.x, y: it.box.y, w: mg[best][1] - it.box.x + 1, h: it.box.h }, xs: it.xs.filter(function (p) { return p[1] <= mg[best][1]; }) }); a.box0 = Object.assign({}, a.box); a.rows = [{ x: a.box.x, w: a.box.w, h: a.box.h, cy: a.box.y + a.box.h / 2, top: a.box.y }];
    var b = Object.assign({}, it, { uid: ++uidn, text: vt, box: { x: mg[best + 1][0], y: it.box.y, w: it.box.x + it.box.w - mg[best + 1][0], h: it.box.h }, xs: it.xs.filter(function (p) { return p[0] >= mg[best + 1][0]; }) }); b.box0 = Object.assign({}, b.box); b.rows = [{ x: b.box.x, w: b.box.w, h: b.box.h, cy: b.box.y + b.box.h / 2, top: b.box.y }];
    return [a, b];
  }
  function joinByRows(items, rows) {   // 같은 줄은 공백, 줄 사이는 줄바꿈으로 글자 잇기
    var ls = rows.map(function () { return []; });
    items.forEach(function (o) { var k = 0, bd = 1e9; rows.forEach(function (q, i) { var dd = Math.abs(q.cy - o.cy); if (dd < bd) { bd = dd; k = i; } }); if (o.t) ls[k].push(o); });
    return ls.map(function (l) { return l.sort(function (p, q) { return p.x - q.x; }).map(function (z) { return z.t; }).join(' '); }).filter(Boolean).join('\n');
  }
  function mergeRows(list) {   // 같은 줄에 놓인 조각은 한 줄로, 위에서 아래로 정렬
    var rows = []; list.slice().sort(function (a, b) { return a.cy - b.cy; }).forEach(function (r) { var l = rows.filter(function (q) { return Math.abs(q.cy - r.cy) < 0.5 * Math.min(q.h, r.h); })[0]; if (l) { var x1 = Math.max(l.x + l.w, r.x + r.w); l.x = Math.min(l.x, r.x); l.w = x1 - l.x; l.h = Math.max(l.h, r.h); } else rows.push({ x: r.x, w: r.w, h: r.h, cy: r.cy, top: r.top }); });
    return rows;
  }
  function buildItems(det, ai) {
    var regs = det.regions.map(function (r) { return Object.assign({}, r); }), A = {}, byId = {}, gone = {};
    (ai.regions || []).forEach(function (x) { if (x && x.id != null) A[x.id] = x; }); regs.forEach(function (r) { byId[r.id] = r; });
    (ai.groups || []).forEach(function (gp) {
      var ms = (gp.ids || []).map(function (id) { return byId[id]; }).filter(function (r) { return r && !gone[r.id]; }); if (ms.length < 2) return;
      ms.sort(function (p, q) { return p.box.y - q.box.y || p.box.x - q.box.x; }); var m = ms[0], x0 = Infinity, y0 = Infinity, x1 = 0, y1 = 0, texts = [];
      ms.forEach(function (r) { x0 = Math.min(x0, r.box.x); y0 = Math.min(y0, r.box.y); x1 = Math.max(x1, r.box.x + r.box.w); y1 = Math.max(y1, r.box.y + r.box.h); var a = A[r.id]; texts.push(a && a.text ? a.text : ''); if (r !== m) { gone[r.id] = 1; m.hs = m.hs.concat(r.hs); m.xs = m.xs.concat(r.xs); } });
      var its = ms.map(function (r) { var a = A[r.id]; return { cy: r.box.y + r.box.h / 2, x: r.box.x, t: a && a.text ? a.text : '' }; });   // 상자를 바꾸기 전에 위치 기록
      m.rows = mergeRows([].concat.apply([], ms.map(function (r) { return r.rows || []; }))); m.box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; m.gtype = gp.type; m.gtext = joinByRows(its, m.rows);
    });
    var out = [];
    regs.forEach(function (r) {
      if (gone[r.id]) return; var a = A[r.id] || {}, ty = r.gtype || a.type || r.type || 'text', kind = ty === 'text' ? 'text' : /^(seal|logo|signature)$/.test(ty) ? 'object' : (a.type || ty) === 'ornament' || ty === 'noise' || ty === 'ornament' ? 'ignore' : 'text';
      if (!ai.regions && r.kind === 'object') kind = 'object'; var text = r.gtext || a.text || '';
      var it = { uid: ++uidn, kind: kind, type: ty, text: String(text).replace(/\s+$/, ''), box: r.box, box0: Object.assign({}, r.box), hs: r.hs, xs: r.xs, rows: r.rows || [], color: r.color || '#111111', variable: !!a.variable, field: String(a.field || '').replace(/[{}]/g, '').trim(), font: AW.FONTS.some(function (f) { return f.id === a.font; }) ? a.font : (hangul(text) || !text ? 'Noto Serif KR' : 'Times New Roman'), bold: !!a.bold, label: ty === 'logo' ? '로고' : ty === 'signature' ? '서명' : '직인', on: true };
      if (kind === 'text' && a.splitAt > 0) out = out.concat(splitItem(it, a.splitAt)); else out.push(it);
    });
    var used = {}; out.forEach(function (it) { if (it.kind === 'text' && it.variable) { if (!it.field) it.field = suggestField(it.text, used); used[it.field] = 1; } });
    return out;
  }

  /* ───────────── 영역 편집 화면 (선택·범위 선택·이동·크기·추가·묶기·레이어 순서) ───────────── */
  var KIND = { text: ['글자', 'rb-t'], object: ['이미지', 'rb-o'], ignore: ['배경 유지', 'rb-i'] };
  function start(el, items) {
    st.items = items; st.sel = {}; st.mode = 'select';
    var url = st.fin.canvas.toDataURL('image/jpeg', 0.75);
    body(el).innerHTML = (st.queue && st.queue.length ? '<div class="alert" style="margin-bottom:8px"><b>여러 장 처리</b> — ' + AW.esc(st.qinfo || '') + ' · 「새 양식 만들기」를 누르면 다음 장으로 넘어갑니다.</div>' : '') + '<div class="sc-help"><b>영역 편집 안내</b><ol><li><b>선택</b>: 상자를 누르면 선택, <b>Ctrl 또는 Shift</b>를 누른 채 누르면 여러 개 선택, <b>빈 곳을 끌면</b> 범위 안의 상자가 한 번에 선택됩니다. 오른쪽 목록(레이어)에서도 선택됩니다.</li>' +
      '<li><b>바뀌는 자리 지정</b>: 성명·소속·날짜처럼 사람마다 달라지는 글자 상자를 선택하고 「바뀌는 자리로」를 누르면 메일머지 항목({{항목}})이 됩니다. 항목명은 아래에서 고칠 수 있습니다.</li>' +
      '<li><b>위치·크기</b>: 선택한 상자를 끌어 옮기고, 모서리·변의 점을 끌어 크기를 조절합니다. 빠진 글자는 「영역 추가」로 끌어서 그리면 AI가 글자를 읽어 줍니다.</li>' +
      '<li><b>종류 바꾸기</b>: 글자 / 이미지(직인·로고) / 배경 유지(장식 등) 중에서 고르고, 줄이 나뉜 문단은 「묶기」로 하나의 글상자로 합칩니다. 목록을 끌면 겹침 순서(레이어)가 바뀝니다.</li></ol></div>' +
      '<div class="sc-grid2"><div><div class="sc-tb" id="rv-tb"></div><div class="sc-stage" id="rv-st"><img src="' + url + '" alt="" draggable="false"><div class="sc-ov" id="rv-ov"></div></div><div class="muted" style="margin-top:6px">파랑=글자 · 주황=바뀌는 자리 · 초록=이미지 개체 · 회색 점선=배경 유지 · 상자 위치는 원본 이미지에서 검출한 값입니다.</div></div>' +
      '<div><div class="sc-layers" id="rv-ly"></div><div class="sc-props" id="rv-pp"></div>' +
      '<div class="radios" style="margin-top:8px"><label><input type="checkbox" id="rv-er" ' + (st.erase ? 'checked' : '') + '> 글자 상자를 배경에서 지우기 <span class="muted">(이미지 개체는 항상 배경에서 빼냅니다)</span></label></div>' +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" data-s="make">' + AW.ic('check', 16) + ' 새 양식 만들기</button><button class="btn btn-ghost" data-s="back">보정 단계로</button></div></div></div>';
    AW.$('#rv-er', el).onchange = function (e) { st.erase = e.target.checked; };
    AW.$('[data-s="back"]', el).onclick = function () { step2(el); }; AW.$('[data-s="make"]', el).onclick = function () { make(el); };
    wireStage(el); drawAll(el);
  }
  function itemBy(u) { return st.items.filter(function (i) { return String(i.uid) === String(u); })[0]; }
  function selItems() { return st.items.filter(function (i) { return st.sel[i.uid]; }); }
  function drawAll(el) { drawToolbar(el); drawBoxes(el); drawLayers(el); drawProps(el); }
  function drawToolbar(el) {
    var n = selItems().length, B = function (a, label, on) { return '<button class="btn btn-secondary btn-sm' + (on ? ' on' : '') + '" data-a="' + a + '"' + (!on && /^(var|fix|obj|txt|ign|merge|del|read|front|back)$/.test(a) && !n ? ' disabled' : '') + '>' + label + '</button>'; };
    AW.$('#rv-tb', el).innerHTML = B('mode-sel', '선택', st.mode === 'select') + B('mode-add', '영역 추가', st.mode === 'add') + '<span class="sp-v"></span>' + B('var', '바뀌는 자리로') + B('fix', '고정 글자로') + B('txt', '글자') + B('obj', '이미지 개체') + B('ign', '배경 유지') + '<span class="sp-v"></span>' + B('merge', '묶기') + B('read', '글자 AI로 읽기') + B('front', '앞으로') + B('back', '뒤로') + B('del', '삭제') + '<span class="muted" style="margin-left:6px">' + (n ? n + '개 선택' : '선택 없음') + '</span>';
    AW.$$('[data-a]', AW.$('#rv-tb', el)).forEach(function (b) { b.onclick = function () { act(el, b.dataset.a); }; });
  }
  function drawBoxes(el) {
    var ov = AW.$('#rv-ov', el), W = st.det.W, H = st.det.H, one = selItems().length === 1;
    ov.querySelectorAll('.rb').forEach(function (n) { n.remove(); });
    st.items.forEach(function (it, i) {
      var d = document.createElement('div'), k = KIND[it.kind] || KIND.text; d.className = 'rb ' + k[1] + (it.kind === 'text' && it.variable ? ' rb-v' : '') + (st.sel[it.uid] ? ' sel' : '') + (it.on ? '' : ' off'); d.dataset.u = it.uid;
      d.style.cssText = 'left:' + it.box.x / W * 100 + '%;top:' + it.box.y / H * 100 + '%;width:' + it.box.w / W * 100 + '%;height:' + it.box.h / H * 100 + '%';
      d.innerHTML = '<span class="lb">' + (i + 1) + (it.kind === 'text' && it.variable ? ' {{' + AW.esc(it.field) + '}}' : it.kind === 'object' ? ' ' + AW.esc(it.label) : '') + '</span>' + (st.sel[it.uid] && one ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(function (h) { return '<i class="hd hd-' + h + '" data-h="' + h + '"></i>'; }).join('') : '');
      ov.appendChild(d);
    });
  }
  function snip(it) { var t = it.kind === 'object' ? '[' + it.label + ']' : (it.text || '(글자 없음 — AI로 읽기)').replace(/\n/g, ' ↵ '); return t.length > 26 ? t.slice(0, 26) + '…' : t; }
  function drawLayers(el) {
    var box = AW.$('#rv-ly', el), rows = st.items.map(function (it, i) { return { it: it, i: i }; }).reverse();
    box.innerHTML = '<div class="sc-lh">레이어 <span class="muted">(위쪽이 앞면 · 끌어서 순서 변경)</span></div>' + rows.map(function (r) {
      var it = r.it, k = KIND[it.kind] || KIND.text;
      return '<div class="sc-lr' + (st.sel[it.uid] ? ' sel' : '') + '" draggable="true" data-u="' + it.uid + '"><input type="checkbox" data-on="' + it.uid + '" ' + (it.on ? 'checked' : '') + ' title="사용"><span class="tag ' + k[1] + '">' + k[0] + '</span><span class="sc-tx">' + (r.i + 1) + '. ' + AW.esc(snip(it)) + '</span>' + (it.kind === 'text' && it.variable ? '<span class="badge warn">{{' + AW.esc(it.field) + '}}</span>' : '') + '</div>';
    }).join('');
    var drag = null;
    AW.$$('.sc-lr', box).forEach(function (row) {
      row.onclick = function (e) { if (e.target.closest('input')) return; var u = row.dataset.u; if (!(e.ctrlKey || e.metaKey || e.shiftKey)) st.sel = {}; st.sel[u] = e.ctrlKey || e.metaKey || e.shiftKey ? !st.sel[u] : true; drawAll(el); };
      row.ondragstart = function (e) { drag = row.dataset.u; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', drag); } catch (x) {} };
      row.ondragover = function (e) { e.preventDefault(); row.classList.add('ov'); }; row.ondragleave = function () { row.classList.remove('ov'); };
      row.ondrop = function (e) {
        e.preventDefault(); row.classList.remove('ov'); var mv = itemBy(drag), tg = itemBy(row.dataset.u); if (!mv || !tg || mv === tg) return; var up = e.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
        st.items.splice(st.items.indexOf(mv), 1); var t = st.items.indexOf(tg); st.items.splice(up ? t + 1 : t, 0, mv); drawAll(el);
      };
    });
    AW.$$('input[data-on]', box).forEach(function (c) { c.onchange = function () { itemBy(c.dataset.on).on = c.checked; drawBoxes(el); }; });
  }
  function drawProps(el) {
    var pp = AW.$('#rv-pp', el), s = selItems(); if (!s.length) { pp.innerHTML = '<div class="muted">상자나 레이어를 선택하면 내용을 고칠 수 있습니다.</div>'; return; }
    if (s.length > 1) { pp.innerHTML = '<div class="muted">' + s.length + '개를 선택했습니다. 위 도구 모음에서 한꺼번에 종류를 바꾸거나 묶을 수 있습니다.</div>'; return; }
    var it = s[0], fo = AW.FONTS.map(function (f) { return '<option value="' + AW.esc(f.id) + '"' + (f.id === it.font ? ' selected' : '') + '>' + AW.esc(f.label) + '</option>'; }).join('');
    pp.innerHTML = it.kind === 'object' ? '<label class="f">개체 이름</label><input class="in sm" data-k="label" value="' + AW.esc(it.label) + '">' :
      it.kind === 'ignore' ? '<div class="muted">배경에 그대로 둘 영역입니다(장식·무늬·테두리). 글자라면 「글자」를 눌러 바꾸십시오.</div>' :
      '<label class="f">글자 내용</label><textarea class="in sm" data-k="text" rows="' + Math.min(4, Math.max(2, it.text.split('\n').length)) + '">' + AW.esc(it.text) + '</textarea><div class="sc-r2"><select class="in sm" data-k="font">' + fo + '</select><label class="mini chk"><input type="checkbox" data-k="variable" ' + (it.variable ? 'checked' : '') + '> 바뀌는 자리</label><input class="in sm" data-k="field" value="' + AW.esc(it.field) + '" placeholder="항목명" style="width:100px;' + (it.variable ? '' : 'display:none') + '"></div>';
    AW.$$('[data-k]', pp).forEach(function (x) { x.oninput = x.onchange = function () {
      var k = x.dataset.k; it[k] = x.type === 'checkbox' ? x.checked : x.value;
      if (k === 'variable') { var used = {}; st.items.forEach(function (o) { if (o !== it && o.kind === 'text' && o.variable) used[o.field] = 1; }); if (it.variable && !it.field) it.field = suggestField(it.text, used); drawAll(el); } else { drawBoxes(el); var tx = AW.$('.sc-lr[data-u="' + it.uid + '"] .sc-tx', el); if (tx) tx.textContent = (st.items.indexOf(it) + 1) + '. ' + snip(it); }
    }; });
  }
  function act(el, a) {
    var s = selItems(), used = {}; st.items.forEach(function (o) { if (o.kind === 'text' && o.variable) used[o.field] = 1; });
    if (a === 'mode-sel' || a === 'mode-add') { st.mode = a === 'mode-add' ? 'add' : 'select'; AW.$('#rv-ov', el).classList.toggle('add', st.mode === 'add'); return drawToolbar(el); }
    if (!s.length) return;
    if (a === 'var') s.forEach(function (it) { it.kind = 'text'; it.variable = true; if (!it.field || used[it.field] && s.length > 1) it.field = suggestField(it.text, used); used[it.field] = 1; });
    else if (a === 'fix') s.forEach(function (it) { it.variable = false; });
    else if (a === 'txt') s.forEach(function (it) { it.kind = 'text'; });
    else if (a === 'obj') s.forEach(function (it) { it.kind = 'object'; it.variable = false; });
    else if (a === 'ign') s.forEach(function (it) { it.kind = 'ignore'; it.variable = false; });
    else if (a === 'del') { st.items = st.items.filter(function (it) { return !st.sel[it.uid]; }); st.sel = {}; }
    else if (a === 'front') { st.items = st.items.filter(function (it) { return !st.sel[it.uid]; }).concat(s); }
    else if (a === 'back') { st.items = s.concat(st.items.filter(function (it) { return !st.sel[it.uid]; })); }
    else if (a === 'merge') {
      var tx = s.filter(function (it) { return it.kind === 'text'; }).sort(function (p, q) { return p.box.y - q.box.y || p.box.x - q.box.x; }); if (tx.length < 2) return AW.toast('글자 상자를 2개 이상 선택해 주십시오.');
      var m = tx[0], x0 = Infinity, y0 = Infinity, x1 = 0, y1 = 0, rows = []; tx.forEach(function (it) { x0 = Math.min(x0, it.box.x); y0 = Math.min(y0, it.box.y); x1 = Math.max(x1, it.box.x + it.box.w); y1 = Math.max(y1, it.box.y + it.box.h); if (it !== m) { m.hs = m.hs.concat(it.hs); m.xs = m.xs.concat(it.xs); } rows = rows.concat(rowsFor(it, Math.max(1, String(it.text).split('\n').length))); });
      m.rows = mergeRows(rows); m.text = joinByRows(tx.map(function (it) { return { cy: it.box.y + it.box.h / 2, x: it.box.x, t: it.text }; }), m.rows); m.box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; m.box0 = Object.assign({}, m.box); m.src = tx.map(function (it) { return it.src || [it.box0 || it.box]; }).reduce(function (a, b2) { return a.concat(b2); }, []); m.variable = false;
      st.items = st.items.filter(function (it) { return it === m || tx.indexOf(it) < 0; }); st.sel = {}; st.sel[m.uid] = true;
    }
    else if (a === 'read') {
      var todo = s.filter(function (it) { return it.kind === 'text'; }); if (!todo.length) return; AW.toast('AI가 글자를 읽는 중입니다…');
      return todo.reduce(function (p, it) { return p.then(function () { return Sc.readRegion(st.fin.canvas, it.box).then(function (t) { if (t) { it.text = t; } }).catch(function (e) { AW.toast('AI 판독 실패: ' + e.message, 'error'); }); }); }, Promise.resolve()).then(function () { drawAll(el); });
    }
    drawAll(el);
  }
  function wireStage(el) {
    var ov = AW.$('#rv-ov', el), stg = AW.$('#rv-st', el), drag = null, rb = null;
    function toImg(e) { var r = stg.getBoundingClientRect(), k = st.det.W / r.width; return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k }; }
    function rect(a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; }
    function showRb(r, cls) { if (!rb) { rb = document.createElement('div'); ov.appendChild(rb); } rb.className = 'rb-m ' + cls; rb.style.cssText = 'left:' + r.x / st.det.W * 100 + '%;top:' + r.y / st.det.H * 100 + '%;width:' + r.w / st.det.W * 100 + '%;height:' + r.h / st.det.H * 100 + '%'; }
    ov.onpointerdown = function (e) {
      e.preventDefault(); try { ov.setPointerCapture(e.pointerId); } catch (x) {} var p = toImg(e), hEl = e.target.closest('[data-h]'), bEl = e.target.closest('[data-u]'), multi = e.ctrlKey || e.metaKey || e.shiftKey;
      if (hEl) { var one = selItems()[0]; if (one) drag = { t: 'resize', h: hEl.dataset.h, it: one, p0: p, b0: Object.assign({}, one.box) }; return; }
      if (bEl && st.mode !== 'add') { var u = bEl.dataset.u; if (multi) { st.sel[u] = !st.sel[u]; return drawAll(el); } if (!st.sel[u]) { st.sel = {}; st.sel[u] = true; drawAll(el); } drag = { t: 'move', p0: p, list: selItems().map(function (it) { return { it: it, b0: Object.assign({}, it.box) }; }) }; return; }
      if (st.mode === 'add') { drag = { t: 'draw', p0: p, p1: p }; return; }
      if (!multi) { st.sel = {}; drawAll(el); } drag = { t: 'marq', p0: p, p1: p, add: multi };
    };
    ov.onpointermove = function (e) {
      if (!drag) return; var p = toImg(e), W = st.det.W, H = st.det.H;
      if (drag.t === 'move') { var dx = p.x - drag.p0.x, dy = p.y - drag.p0.y; drag.list.forEach(function (o) { o.it.box.x = Math.round(Math.max(0, Math.min(W - o.b0.w, o.b0.x + dx))); o.it.box.y = Math.round(Math.max(0, Math.min(H - o.b0.h, o.b0.y + dy))); }); drawBoxes(el); }
      else if (drag.t === 'resize') {
        var b = Object.assign({}, drag.b0), dx2 = p.x - drag.p0.x, dy2 = p.y - drag.p0.y, h = drag.h;
        if (/w/.test(h)) { b.x = Math.min(b.x + dx2, drag.b0.x + drag.b0.w - 4); b.w = drag.b0.x + drag.b0.w - b.x; } if (/e/.test(h)) b.w = Math.max(4, drag.b0.w + dx2);
        if (/n/.test(h)) { b.y = Math.min(b.y + dy2, drag.b0.y + drag.b0.h - 4); b.h = drag.b0.y + drag.b0.h - b.y; } if (/s/.test(h)) b.h = Math.max(4, drag.b0.h + dy2);
        drag.it.box = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) }; drawBoxes(el);
      }
      else { drag.p1 = p; showRb(rect(drag.p0, p), drag.t === 'draw' ? 'draw' : 'marq'); }
    };
    ov.onpointerup = function (e) {
      if (!drag) return; var d = drag; drag = null; try { ov.releasePointerCapture(e.pointerId); } catch (x) {}
      if (rb) { rb.remove(); rb = null; }
      if (d.t === 'marq') {
        var r = rect(d.p0, d.p1); if (r.w > 3 || r.h > 3) { if (!d.add) st.sel = {}; st.items.forEach(function (it) { if (it.box.x < r.x + r.w && it.box.x + it.box.w > r.x && it.box.y < r.y + r.h && it.box.y + it.box.h > r.y) st.sel[it.uid] = true; }); }
        return drawAll(el);
      }
      if (d.t === 'draw') {
        var r2 = rect(d.p0, d.p1); st.mode = 'select'; ov.classList.remove('add'); if (r2.w < 8 || r2.h < 8) return drawAll(el);
        var it = { uid: ++uidn, kind: 'text', type: 'text', text: '', box: { x: Math.round(r2.x), y: Math.round(r2.y), w: Math.round(r2.w), h: Math.round(r2.h) }, hs: [Math.round(r2.h * 0.9)], xs: [], rows: [], box0: { x: Math.round(r2.x), y: Math.round(r2.y), w: Math.round(r2.w), h: Math.round(r2.h) }, color: '#111111', variable: false, field: '', font: 'Noto Serif KR', bold: false, label: '직인', on: true };
        st.items.push(it); st.sel = {}; st.sel[it.uid] = true; drawAll(el);
        if (st.aiOk !== false) { AW.toast('AI가 글자를 읽는 중입니다…'); Sc.readRegion(st.fin.canvas, it.box).then(function (t) { if (t) { it.text = t; drawAll(el); } }).catch(function () {}); }
        return;
      }
      drawAll(el);
    };
    ov.onpointercancel = function () { drag = null; if (rb) { rb.remove(); rb = null; } };
    document.addEventListener('keydown', function kd(e) {
      if (!ov.isConnected) return document.removeEventListener('keydown', kd); var t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selItems().length) { e.preventDefault(); act(el, 'del'); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); st.items.forEach(function (it) { st.sel[it.uid] = true; }); drawAll(el); }
    });
  }

  /* ───────────── 5) 새 양식 조립 ───────────── */
  function rowsFor(it, lines) {   // 줄별 위치: 검출값을 쓰되, 상자를 고쳤거나 줄 수가 다르면 상자를 균등 분할
    var b = it.box, b0 = it.box0, same = b0 && b0.x === b.x && b0.y === b.y && b0.w === b.w && b0.h === b.h;
    if (same && it.rows && it.rows.length === lines) return it.rows;
    var out = []; for (var i = 0; i < lines; i++) out.push({ x: b.x, w: b.w, h: b.h / lines, cy: b.y + (i + 0.5) * b.h / lines, top: b.y + i * b.h / lines }); return out;
  }
  function p80(a) { if (!a.length) return 0; a = a.slice().sort(function (x, y) { return x - y; }); return a[Math.min(a.length - 1, Math.floor(0.8 * (a.length - 1)))]; }
  function measure(text, font, px, bold) {
    try { var g = cv(2, 2).getContext('2d'), f = AW.FONTS.filter(function (x) { return x.id === font; })[0]; g.font = (bold ? 'bold ' : '') + px + 'px ' + (f ? f.stack : 'serif'); return g.measureText(text).width; } catch (e) { return 0; }
  }
  function assemble(ctx) {   // 화면 없이 양식(nt)과 항목 예시(rows0)를 조립 — 한 장씩·일괄 처리 공용
    var cvs = ctx.fin.canvas, W = cvs.width, H = cvs.height, pg = ctx.fin.page, det = ctx.det, bgc = cv(W, H), bg = bgc.getContext('2d'), kx = pg.w / W, ky = pg.h / H;
    bg.drawImage(cvs, 0, 0);
    var on = ctx.items.filter(function (it) { return it.on && it.kind !== 'ignore'; }), src = {};
    on.forEach(function (it) { if (it.kind === 'object') src[it.uid] = cutout(bg, it.box); });            // 먼저 잘라 내고
    on.forEach(function (it) {   // 배경에서 지움: 원본에서 검출된 자리(옮겨도 원래 자리를 지움) + 크기를 고쳐 겹치는 영역
      if (it.kind !== 'object' && !ctx.erase) return; var R = it.kind === 'object' ? 6 : 4, srcs = (it.src && it.src.length ? it.src : [it.box0 || it.box]).slice(), b = it.box;
      var hit = srcs.some(function (o) { return b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y; }); if (hit) srcs.push(b); srcs.forEach(function (o) { eraseBox(bg, det, o, R); });
    });
    var nt = AW.newTpl(ctx.name || '스캔 양식'); nt.page = { w: pg.w, h: pg.h, paper: pg.paper, orient: pg.orient }; nt.bg = bgc.toDataURL('image/jpeg', 0.9); nt.bgName = ctx.name || '스캔';
    var rows0 = {}, used = {};
    on.forEach(function (it) {
      var b = it.box;
      if (it.kind === 'object') { nt.elems.push(AW.elem('img', { x: AW.round(b.x * kx, 2), y: AW.round(b.y * ky, 2), w: AW.round(b.w * kx, 2), h: AW.round(b.h * ky, 2), src: src[it.uid], name: it.label })); return; }
      var text = String(it.text || '').trim(), tl = text.split('\n'), lines = Math.max(1, tl.length), hasKo = hangul(text) || !text, rows = rowsFor(it, lines);
      var rh = rows.map(function (r) { return r.h; }).sort(function (a, c) { return a - c; })[Math.floor((rows.length - 1) / 2)], szPx = rh / (hasKo ? 0.95 : 0.78);
      var pitch = lines > 1 ? (rows[lines - 1].cy - rows[0].cy) / (lines - 1) : 0, lh = lines > 1 ? Math.max(1.0, Math.min(2.4, pitch / szPx)) : 1.2;
      var wi = 0; rows.forEach(function (r, k) { if (r.w > rows[wi].w) wi = k; }); var wl = (tl[wi] || '').trim();
      if (wl.replace(/\s+/g, '').length >= 3) { var mw = measure(wl, it.font, szPx, it.bold); if (mw > 0) { var rt = rows[wi].w / mw; if (rt > 0.6 && rt < 1.6) szPx *= Math.max(0.85, Math.min(1.2, rt)); } }
      var field = '', out = text;
      if (it.variable && it.field) { field = it.field; if (used[field]) { var n = 2; while (used[field + n]) n++; field += n; } used[field] = 1; rows0[field] = text.replace(/\n/g, ' '); out = '{{' + field + '}}'; }
      var cxs = rows.map(function (r) { return r.x + r.w / 2; }), lxs = rows.map(function (r) { return r.x; }), spread = function (a) { return Math.max.apply(null, a) - Math.min.apply(null, a); }, cx = b.x + b.w / 2;
      var centered = lines === 1 ? Math.abs(cx - W / 2) < W * 0.03 : (spread(cxs) <= W * 0.02 || spread(lxs) > W * 0.02), align = centered ? 'center' : 'left';
      var ex = align === 'center' ? cx - (b.w * 1.06) / 2 : b.x, ew = align === 'center' ? b.w * 1.06 : b.w * 1.04, ey, eh;
      if (lines === 1) { eh = Math.max(b.h * 1.3, szPx * 1.3); ey = b.y + b.h / 2 - eh / 2; } else { eh = pitch * lines; ey = rows[0].cy - pitch / 2; }
      nt.elems.push(AW.elem('text', { x: AW.round(Math.max(0, ex * kx), 2), y: AW.round(Math.max(0, ey * ky), 2), w: AW.round(ew * kx, 2), h: AW.round(eh * ky, 2), text: out, font: it.font, size: Math.max(5, Math.min(150, AW.round(szPx * ky / PT, 1))), color: it.color || '#111111', bold: !!it.bold, align: align, valign: lines > 1 ? 'top' : 'middle', lh: AW.round(lh, 2), fit: lines === 1 }));
    });
    var keys = Object.keys(rows0); nt.name = ctx.name || '스캔 양식'; var no = on.filter(function (i) { return i.kind === 'object'; }).length;
    return { nt: nt, rows0: rows0, keys: keys, nObj: no, nTxt: on.length - no };
  }
  function make(el) {
    var r = assemble({ fin: st.fin, det: st.det, items: st.items, name: st.name, erase: st.erase }), nt = r.nt, rows0 = r.rows0, keys = r.keys, queued = st.queue && st.queue.length > 1;
    var bt = AW.$('[data-s="make"]', el); if (bt) bt.disabled = true;
    if (!queued) AW.$$('.aw-ov').forEach(function (o) { o.remove(); });
    AW.App.adopt(nt).then(function () {
      if (keys.length) { S.tpl.rows = [rows0]; S.sampleOnly = true; AW.syncFields(); S.tpl.fields.forEach(function (f) { if (rows0[f.name] != null) { f.example = rows0[f.name]; f.sample = rows0[f.name]; } }); AW.Data.refresh(true); AW.emit('datachange'); AW.emit('stepchange'); }
      AW.toast('스캔본으로 새 양식을 만들었습니다. 글상자 ' + r.nTxt + '개 · 이미지 개체 ' + r.nObj + '개 · 메일머지 항목 ' + keys.length + '개. 위치와 글꼴을 확인해 다듬어 주십시오.', 'ok'); AW.log('scan_make', '', { texts: r.nTxt, objects: r.nObj, fields: keys });
      if (queued) { st.queue.shift(); return nextTask(el); }
    }).catch(function () { if (bt) bt.disabled = false; });
  }
})();
