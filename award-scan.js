'use strict';
/**
 * award-scan.js — 스캔본(JPG·PNG·PDF) → 양식 자동 만들기 (AW.Scan)
 *  1) 기울기·여백 보정: 수평/수직 정렬(deskew) + 스캐너 바탕 자동 자르기 + 용지 규격 맞춤(필요 시 수동 미세 조정)
 *  2) AI(비전): 글자 위치·내용(OCR)·글꼴 유형·크기·정렬 판독, 변경될 자리(성명·소속·날짜 등) 판단
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
    var pts = [], dark = 0; for (i = 0; i < tot; i++) if (L[i] < th) dark++;
    var step = Math.max(1, Math.floor(dark / 50000)), n = 0;
    for (i = 0; i < tot; i++) if (L[i] < th) { if (n++ % step === 0) pts.push(i % w, (i / w) | 0); }
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

  /* ───────────── 3) 글자 지우기 ───────────── */
  function refine(g, W, H, b, lines) {   // AI 상자를 실제 글자 픽셀에 맞게 조임
    var lh1 = b.h / Math.max(1, lines || 1), padx = Math.round(lh1 * 0.45), pady = Math.round(lh1 * 0.3), x0 = Math.max(0, b.x - padx), y0 = Math.max(0, b.y - pady), x1 = Math.min(W, b.x + b.w + padx), y1 = Math.min(H, b.y + b.h + pady), w = x1 - x0, h = y1 - y0;
    if (w < 4 || h < 4) return { box: b, ink: [] };
    var d = g.getImageData(x0, y0, w, h).data, L = new Float32Array(w * h), i; for (i = 0; i < w * h; i++) L[i] = lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    var bg = median(Array.prototype.slice.call(L).filter(function (_, k) { return k % 7 === 0; })), minx = w, maxx = -1, miny = h, maxy = -1, n = 0, cols = [];
    for (i = 0; i < w * h; i++) { if (Math.abs(L[i] - bg) > 55) { var x = i % w, y = (i / w) | 0; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; n++; if (n % 3 === 0) cols.push(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); } }
    var nb = { x: b.x, y: b.y, w: b.w, h: b.h }, color = '#111111';
    if (n > 12 && (maxx - minx + 1) * (maxy - miny + 1) < b.w * b.h * 1.7) { nb = { x: x0 + minx, y: y0 + miny, w: maxx - minx + 1, h: maxy - miny + 1 }; }
    if (cols.length > 9) { var rr = [], gg = [], bb = []; for (i = 0; i < cols.length; i += 3) { rr.push(cols[i]); gg.push(cols[i + 1]); bb.push(cols[i + 2]); } color = '#' + [median(rr), median(gg), median(bb)].map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join(''); }
    return { box: nb, color: color, ink: n };
  }
  function erase(g, W, H, b) {   // 글자 픽셀만 좌우 배경을 보간해 메움
    var pad = Math.round(b.h * 0.12) + 2, m = 8, X0 = Math.max(0, b.x - pad - m), Y0 = Math.max(0, b.y - pad), X1 = Math.min(W, b.x + b.w + pad + m), Y1 = Math.min(H, b.y + b.h + pad), w = X1 - X0, h = Y1 - Y0;
    if (w < 20 || h < 4) return;
    var im = g.getImageData(X0, Y0, w, h), d = im.data, mk = new Uint8Array(w * h), fill = new Uint8ClampedArray(d.length), x, y, c;
    var bgc = [0, 1, 2].map(function (cc) { var v = []; for (var q = 0; q < w * h; q += 5) v.push(d[q * 4 + cc]); return median(v); }), bgl = lum(bgc[0], bgc[1], bgc[2]);
    function ring(arr) { return Math.abs(lum(arr[0], arr[1], arr[2]) - bgl) > 28 ? bgc.slice() : arr; }   // 이웃 글자가 걸린 가장자리는 영역 배경색으로 대체
    for (y = 0; y < h; y++) {
      var lc = [0, 0, 0], rc = [0, 0, 0], ln = Math.min(4, Math.max(1, b.x - pad - X0)), rn = Math.min(4, Math.max(1, X1 - (b.x + b.w + pad)));
      for (x = 0; x < ln; x++) for (c = 0; c < 3; c++) lc[c] += d[(y * w + x) * 4 + c] / ln; for (x = w - rn; x < w; x++) for (c = 0; c < 3; c++) rc[c] += d[(y * w + x) * 4 + c] / rn;
      lc = ring(lc); rc = ring(rc);
      for (x = 0; x < w; x++) { var t = x / (w - 1); for (c = 0; c < 3; c++) fill[(y * w + x) * 4 + c] = lc[c] * (1 - t) + rc[c] * t; }
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var i = (y * w + x) * 4; if (Math.abs(lum(d[i], d[i + 1], d[i + 2]) - lum(fill[i], fill[i + 1], fill[i + 2])) > 28) mk[y * w + x] = 1; }
    var mk2 = new Uint8Array(w * h), R = 2; for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (mk[y * w + x]) for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) { var yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w) mk2[yy * w + xx] = 1; }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (mk2[y * w + x]) { var j = (y * w + x) * 4; d[j] = fill[j]; d[j + 1] = fill[j + 1]; d[j + 2] = fill[j + 2]; }
    g.putImageData(im, X0, Y0);
  }

  /* ───────────── 2) AI 판독 ───────────── */
  var SYS = '당신은 한국어 상장·증서 스캔 이미지를 분석해 편집 가능한 양식으로 복원하는 전문가입니다. 출력은 JSON 객체 하나만, 마크다운·설명 금지.\n' +
    '형식: {"texts":[{"text":"글자 그대로","x":0,"y":0,"w":0,"h":0,"lines":1,"align":"left|center|right","bold":false,"font":"글꼴ID","variable":false,"field":"","role":"title|label|value|body|date|sign|other"}],"notes":""}\n' +
    '규칙: 1) x,y,w,h 는 이미지 전체 폭·높이를 각각 1000으로 본 정수 좌표(좌상단 기준)이며 글자를 꼭 맞게 감쌉니다. 2) 가로쓰기 글자만 포함하고 원형 직인·학교 로고·워터마크 안의 글자, 장식 무늬는 제외합니다(배경에 그대로 둡니다). 3) 같은 문단(줄 간격이 일정한 여러 줄)은 하나의 상자로 묶고 lines 에 줄 수를 적으며 text 에는 줄바꿈(\\n)을 넣습니다. 4) 「성명 : 홍길동」처럼 라벨과 값이 함께 있으면 라벨 상자(고정)와 값 상자(variable)로 분리합니다. 5) variable=true 는 수여자마다 달라지는 값(성명, 소속·학과·반, 학번, 수여일·발급일, 상장 번호, 상 이름이 바뀔 수 있는 경우)이며 field 에 짧은 한글 항목명(성명, 소속, 학번, 수여일, 번호, 상명, 내용 등)을 적습니다. 제목(상장), 정형 문구, 라벨, 학교명, 학교장 직함·이름은 고정입니다. 6) font 는 제공된 글꼴ID 중 원본과 가장 닮은 것 하나를 고릅니다(궁서체 느낌=Gungsuh, 바탕·명조=Batang 또는 Nanum Myeongjo, 굵은 제목 고딕=Black Han Sans, 일반 고딕=Noto Sans KR, 영문 격식=Times New Roman 등). 7) 글자는 오탈자 없이 보이는 그대로 옮깁니다.';
  Sc.analyze = function (canvas) {
    var k = Math.min(1, 1600 / Math.max(canvas.width, canvas.height)), c = cv(canvas.width * k, canvas.height * k); c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    var data = c.toDataURL('image/jpeg', 0.85).split(',')[1], fonts = AW.FONTS.map(function (f) { return f.id + '(' + f.label + ')'; }).join(', ');
    var content = [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: data } }, { type: 'text', text: '이 상장 이미지의 글자를 판독해 JSON 으로 답하십시오. 사용 가능한 글꼴ID: ' + fonts }];
    return AW.AI.json(SYS, content, 8000);
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
      '<label class="drop" id="sc-drop" style="display:block;padding:30px;text-align:center;border:2px dashed var(--border);border-radius:12px;cursor:pointer"><input type="file" id="sc-f" accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf" class="hide">' + AW.ic('upload', 22) + '<br><b>파일을 끌어 놓거나 눌러서 선택</b><br><span class="muted">PDF 는 한 쪽만 사용합니다. 사진보다 스캔본이 정확합니다.</span></label>';
    var f = AW.$('#sc-f', el), dz = AW.$('#sc-drop', el);
    f.onchange = function () { if (f.files[0]) load(el, f.files[0]); };
    dz.ondragover = function (e) { e.preventDefault(); }; dz.ondrop = function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) load(el, e.dataTransfer.files[0]); };
  }
  function load(el, file) {
    body(el).innerHTML = '<div class="loading">파일을 읽는 중…</div>';
    AW.Editor.readSource(file, 2480).then(function (r) { return loadImg(r.url).then(function (im) { var c = cv(im.naturalWidth, im.naturalHeight); c.getContext('2d').drawImage(im, 0, 0); st.src = c; st.name = file.name.replace(/\.[^.]+$/, ''); autoFit(el); }); })
      .catch(function (e) { AW.toast(e.message, 'error'); step1(el); });
  }
  function autoFit(el) {
    body(el).innerHTML = '<div class="loading">기울기와 여백을 맞추는 중…</div>';
    setTimeout(function () {
      st.angle = Sc.estimateSkew(st.src); var c = Sc.straighten(st.src, st.quarter, st.angle); st.trim = Sc.autoTrim(c); step2(el);
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
  function run(el) {
    var q = ((st.quarter % 4) + 4) % 4, c = Sc.straighten(st.src, q, st.angle), fin = Sc.finalize(c, st.trim, 2480); st.fin = fin;
    body(el).innerHTML = '<div class="loading">AI가 글자와 변경될 자리를 판독하는 중입니다… (10~40초)</div>';
    AW.AI.ensure().then(function () { return Sc.analyze(fin.canvas); }).then(function (r) { build(el, r); }).catch(function (e) { AW.toast('AI 판독 실패: ' + (e.message || ''), 'error'); step2(el); });
  }
  function build(el, r) {
    var cvs = st.fin.canvas, W = cvs.width, H = cvs.height, g = cvs.getContext('2d'), list = (r && r.texts || []).filter(function (t) { return t && String(t.text || '').trim() && t.w > 0 && t.h > 0; }).slice(0, 80);
    st.items = list.map(function (t) {
      var b = { x: Math.round(t.x / 1000 * W), y: Math.round(t.y / 1000 * H), w: Math.round(t.w / 1000 * W), h: Math.round(t.h / 1000 * H) }, rf = refine(g, W, H, b, t.lines || String(t.text).split('\n').length), ok = AW.FONTS.some(function (f) { return f.id === t.font; });
      return { on: true, text: String(t.text).replace(/\s+$/, ''), box: rf.box, color: rf.color || '#111111', lines: Math.max(1, t.lines || String(t.text).split('\n').length), align: /^(left|right)$/.test(t.align) ? t.align : 'center', bold: !!t.bold, font: ok ? t.font : (/[A-Za-z]{4}/.test(t.text) && !/[가-힣]/.test(t.text) ? 'Times New Roman' : 'Noto Serif KR'), variable: !!t.variable, field: String(t.field || '').replace(/[{}]/g, '').trim() || (t.variable ? '항목' : '') };
    });
    review(el);
  }
  function review(el) {
    var W = st.fin.canvas.width, H = st.fin.canvas.height, url = st.fin.canvas.toDataURL('image/jpeg', 0.7);
    var fo = function (cur) { return AW.FONTS.map(function (f) { return '<option value="' + AW.esc(f.id) + '"' + (f.id === cur ? ' selected' : '') + '>' + AW.esc(f.label) + '</option>'; }).join(''); };
    body(el).innerHTML = '<div class="sc-grid"><div><div class="sc-pv" style="position:relative"><img src="' + url + '" style="width:100%;display:block;border:1px solid var(--border)">' +
      st.items.map(function (t, i) { return '<div class="sc-box ' + (t.variable ? 'var' : '') + '" data-i="' + i + '" style="left:' + (t.box.x / W * 100) + '%;top:' + (t.box.y / H * 100) + '%;width:' + (t.box.w / W * 100) + '%;height:' + (t.box.h / H * 100) + '%"><span>' + (i + 1) + '</span></div>'; }).join('') + '</div>' +
      '<div class="muted" style="margin-top:6px">파란 상자=고정 글자, 주황 상자=바뀌는 자리(메일머지). 위치는 만든 뒤 편집창에서 더 다듬을 수 있습니다.</div></div>' +
      '<div><p style="margin-top:0">AI 판독 결과 ' + st.items.length + '건입니다. 틀린 글자는 고치고, 필요 없는 항목은 체크를 해제하십시오.</p>' +
      '<div class="sc-list">' + st.items.map(function (t, i) {
        return '<div class="sc-row" data-i="' + i + '"><label class="chk"><input type="checkbox" data-k="on" ' + (t.on ? 'checked' : '') + '> <b>' + (i + 1) + '</b></label>' +
          '<textarea class="in sm" data-k="text" rows="' + Math.min(4, t.lines) + '">' + AW.esc(t.text) + '</textarea>' +
          '<div class="sc-r2"><select class="in sm" data-k="font">' + fo(t.font) + '</select><label class="mini chk"><input type="checkbox" data-k="variable" ' + (t.variable ? 'checked' : '') + '> 바뀌는 자리</label><input class="in sm" data-k="field" value="' + AW.esc(t.field) + '" placeholder="항목명" style="width:90px;' + (t.variable ? '' : 'display:none') + '"></div></div>';
      }).join('') + '</div><div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" data-s="make">' + AW.ic('check', 16) + ' 새 양식 만들기</button><button class="btn btn-ghost" data-s="back">보정 단계로</button></div></div></div>';
    AW.$$('.sc-row', el).forEach(function (row) {
      var i = +row.dataset.i; AW.$$('[data-k]', row).forEach(function (x) { x.onchange = x.oninput = function () {
        var k = x.dataset.k, t = st.items[i]; t[k] = x.type === 'checkbox' ? x.checked : x.value;
        if (k === 'variable') { AW.$('[data-k="field"]', row).style.display = t.variable ? '' : 'none'; if (t.variable && !t.field) t.field = '항목'; AW.$('[data-k="field"]', row).value = t.field; var bx = AW.$('.sc-box[data-i="' + i + '"]', el); if (bx) bx.classList.toggle('var', t.variable); }
        if (k === 'on') { var b2 = AW.$('.sc-box[data-i="' + i + '"]', el); if (b2) b2.style.opacity = t.on ? 1 : 0.2; }
      }; });
    });
    AW.$('[data-s="back"]', el).onclick = function () { step2(el); };
    AW.$('[data-s="make"]', el).onclick = function () { make(el); };
  }

  /* ───────────── 4) 새 양식 조립 ───────────── */
  function make(el) {
    var cvs = st.fin.canvas, W = cvs.width, H = cvs.height, pg = st.fin.page, on = st.items.filter(function (t) { return t.on; }), bgc = cv(W, H), bg = bgc.getContext('2d');
    bg.drawImage(cvs, 0, 0);
    if (st.erase) on.forEach(function (t) { erase(bg, W, H, t.box); });
    var nt = AW.newTpl(st.name || '스캔 양식'); nt.page = { w: pg.w, h: pg.h, paper: pg.paper, orient: pg.orient }; nt.bg = bgc.toDataURL('image/jpeg', 0.9); nt.bgName = st.name || '스캔';
    var kx = pg.w / W, ky = pg.h / H, rows0 = {}, used = {};
    on.forEach(function (t) {
      var lines = Math.max(1, String(t.text).split('\n').length), w = t.box.w * kx, h = t.box.h * ky, lineH = h / lines, size = Math.max(6, Math.min(120, AW.round(h / ((lines - 1) * 1.5 + 0.92) / PT, 1)));
      var text = t.text, field = '';
      if (t.variable && t.field) { field = t.field; if (used[field]) { var n = 2; while (used[field + n]) n++; field = field + n; } used[field] = 1; rows0[field] = t.text.replace(/\n/g, ' '); text = '{{' + field + '}}'; }
      var padw = lines > 1 ? w * 0.03 : 0;
      nt.elems.push(AW.elem('text', { x: AW.round(t.box.x * kx - padw, 2), y: AW.round(t.box.y * ky - (lines > 1 ? 0 : h * 0.12), 2), w: AW.round(w + padw * 2, 2), h: AW.round(lines > 1 ? h : h * 1.24, 2), text: text, font: t.font, size: size, color: t.color || '#111111', bold: !!t.bold, align: t.align, valign: 'middle', lh: lines > 1 ? 1.5 : 1.2, fit: lines === 1 }));
    });
    var keys = Object.keys(rows0); nt.name = st.name || '스캔 양식';
    var bt = AW.$('[data-s="make"]', el); if (bt) bt.disabled = true;
    var done = function () {
      AW.$$('.aw-ov').forEach(function (o) { o.remove(); });
      AW.App.adopt(nt).then(function () {
        if (keys.length) { S.tpl.rows = [rows0]; S.sampleOnly = true; AW.syncFields(); S.tpl.fields.forEach(function (f) { if (rows0[f.name] != null) { f.example = rows0[f.name]; f.sample = rows0[f.name]; } }); AW.Data.refresh(true); AW.emit('datachange'); AW.emit('stepchange'); }
        AW.toast('스캔본으로 새 양식을 만들었습니다. 글상자 ' + nt.elems.length + '개 · 메일머지 항목 ' + keys.length + '개. 위치와 글꼴을 확인해 다듬어 주십시오.', 'ok'); AW.log('scan_make', '', { texts: nt.elems.length, fields: keys });
      });
    };
    done();
  }
})();
