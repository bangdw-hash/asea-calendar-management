'use strict';
/**
 * award-forensic.js — 의심 상장 이미지 점검 (AW.Forensic)
 *  ① 원본 겹쳐 보기: 발급 이력에 보관된 양식·데이터로 원본을 다시 그리고, 제출받은 사진·스캔본을 겹침/차이 모드로 비교
 *  ② 파일 흔적 분석: EXIF·PNG 텍스트의 편집 프로그램 기록, 편집 도구 문자열, 오류 수준 분석(ELA)
 *  ※ 자동 판정을 하지 않습니다. 메타데이터가 없거나 ELA 에 흔적이 없어도 정상이라는 증거가 아닙니다(캡처·재인쇄·재스캔 시 사라짐).
 */
(function () {
  var AW = window.AW, F = AW.Forensic = {};
  function esc(s) { return AW.esc(s); }
  function latin1(u8) { var s = '', i, n = u8.length; for (i = 0; i < n; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(n, i + 8192))); return s; }
  var TOOLS = ['Photoshop', 'Adobe', 'GIMP', 'Canva', 'Snapseed', 'Lightroom', 'Paint.NET', 'Pixelmator', 'Affinity', 'Illustrator', 'PicsArt', 'Picsart', 'Figma', 'Fotor', 'PhotoScape', 'Krita', 'Sketch', 'CorelDRAW', 'Paint Shop'];

  /* ── EXIF (JPEG) / tEXt (PNG) 읽기 ── */
  function exifOf(u8) {
    var out = {}, i = 2, dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8[0] !== 0xFF || u8[1] !== 0xD8) return out;
    while (i + 4 < u8.length && u8[i] === 0xFF) {
      var mk = u8[i + 1], len = dv.getUint16(i + 2);
      if (mk === 0xE1 && latin1(u8.subarray(i + 4, i + 10)) === 'Exif\0\0') { tiff(i + 10, len - 8); break; }
      if (mk === 0xDA) break; i += 2 + len;
    }
    function tiff(o, ln) {
      var le = latin1(u8.subarray(o, o + 2)) === 'II', g16 = function (p) { return dv.getUint16(p, le); }, g32 = function (p) { return dv.getUint32(p, le); };
      var NAMES = { 0x010F: '제조사', 0x0110: '기기', 0x0131: '편집 프로그램(Software)', 0x0132: '수정 일시', 0x9003: '촬영 일시', 0x9004: '디지털화 일시' };
      function ifd(p, depth) {
        if (p <= 0 || o + p + 2 > u8.length) return; var n = g16(o + p), k;
        for (k = 0; k < n && k < 60; k++) {
          var e = o + p + 2 + k * 12; if (e + 12 > u8.length) break; var tag = g16(e), type = g16(e + 2), cnt = g32(e + 4);
          if ((tag === 0x8769 || tag === 0x8825) && depth < 2) { if (tag === 0x8769) ifd(g32(e + 8), depth + 1); continue; }
          if (NAMES[tag] && type === 2) { var vo = cnt > 4 ? o + g32(e + 8) : e + 8; if (vo + cnt <= u8.length) out[NAMES[tag]] = latin1(u8.subarray(vo, vo + cnt)).replace(/\0.*$/, '').trim(); }
        }
      }
      try { ifd(g32(o + 4), 0); } catch (x) {}
    }
    return out;
  }
  function pngText(u8) {
    var out = {}, i = 8, dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (latin1(u8.subarray(1, 4)) !== 'PNG') return out;
    while (i + 12 <= u8.length) {
      var len = dv.getUint32(i), type = latin1(u8.subarray(i + 4, i + 8));
      if (type === 'tEXt' && len < 5000) { var s = latin1(u8.subarray(i + 8, i + 8 + len)), z = s.indexOf('\0'); if (z > 0) out[s.slice(0, z)] = s.slice(z + 1); }
      if (type === 'IEND') break; i += 12 + len;
    }
    return out;
  }
  function metaReport(buf, name) {
    var u8 = new Uint8Array(buf), meta = exifOf(u8), png = pngText(u8), txt = latin1(u8.subarray(0, Math.min(u8.length, 600000))), hits = TOOLS.filter(function (t) { return txt.indexOf(t) >= 0; });
    var rows = [], any = false; Object.keys(meta).forEach(function (k) { rows.push([k, meta[k]]); any = true; });
    Object.keys(png).forEach(function (k) { if (/software|creator|comment|source|author|description/i.test(k)) { rows.push([k, png[k]]); any = true; } });
    var sw = meta['편집 프로그램(Software)'] || png.Software || '', edited = hits.length > 0 || /photoshop|gimp|canva|snapseed|lightroom|picsart|pixelmator|affinity|figma/i.test(sw);
    var h = '<div class="alert ' + (edited ? 'warn' : 'info') + '" style="margin:0 0 8px"><b>' + (edited ? '편집 프로그램의 흔적이 있습니다' : '편집 프로그램의 흔적이 발견되지 않았습니다') + '</b><br>' +
      (edited ? esc((sw ? sw + ' · ' : '') + hits.join(', ')) + ' — 정상 업무용 보정(밝기·자르기)일 수도 있으므로 다음 단계의 겹쳐 보기로 내용 변경 여부를 확인하십시오.' : '메타데이터는 캡처·재인쇄·재스캔·메신저 전송 과정에서 쉽게 사라집니다. <b>흔적이 없다고 정상이라는 뜻은 아닙니다.</b>') + '</div>';
    h += rows.length ? '<div class="tbl-wrap"><table class="gt"><tbody>' + rows.map(function (r) { return '<tr><td class="nowrap"><b>' + esc(r[0]) + '</b></td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted" style="margin:0">읽을 수 있는 촬영·편집 정보(EXIF)가 없습니다.</p>';
    return h + '<p class="muted">파일: ' + esc(name || '') + ' · ' + Math.round(u8.length / 1024) + ' KB</p>';
  }

  /* ── 오류 수준 분석(ELA): 90% 로 다시 저장해 원본과의 차이를 증폭. 나중에 수정한 부분은 주변과 다르게 밝게 보일 수 있음 ── */
  function ela(img, cv) {
    return new Promise(function (res) {
      var max = 1400, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
      var a = document.createElement('canvas'); a.width = w; a.height = h; var x = a.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
      a.toBlob(function (bl) {
        var u = URL.createObjectURL(bl), im2 = new Image();
        im2.onload = function () {
          var b = document.createElement('canvas'); b.width = w; b.height = h; var y = b.getContext('2d'); y.drawImage(im2, 0, 0); URL.revokeObjectURL(u);
          var d1 = x.getImageData(0, 0, w, h), d2 = y.getImageData(0, 0, w, h), o = d1.data, p = d2.data, i;
          for (i = 0; i < o.length; i += 4) { var v = Math.min(255, (Math.abs(o[i] - p[i]) + Math.abs(o[i + 1] - p[i + 1]) + Math.abs(o[i + 2] - p[i + 2])) * 6); o[i] = o[i + 1] = o[i + 2] = v; o[i + 3] = 255; }
          cv.width = w; cv.height = h; cv.getContext('2d').putImageData(d1, 0, 0); res();
        }; im2.src = u;
      }, 'image/jpeg', 0.9);
    });
  }

  /* ── 대화상자 ── */
  // o = { tpl, row, idx, title }
  F.open = function (o) {
    var tpl = o.tpl, st = { url: null, file: null, img: null }, m = {};
    var body = '<p class="muted" style="margin-top:0">제출받은 상장 사진·스캔본(JPG·PNG·PDF)을 올리면 발급 이력의 원본과 겹쳐 비교합니다. 자동으로 위조 여부를 판정하지 않으며, 바뀐 글자·위치를 눈으로 확인하는 도구입니다.</p>' +
      '<div class="vb-bar"><input type="file" id="fx-f" accept="image/*,application/pdf" class="in sm" style="max-width:260px"> <select class="in sm" id="fx-mode"><option value="blend">겹쳐 보기</option><option value="diff">차이만 보기 (같으면 검정)</option><option value="orig">원본만</option><option value="shot">제출본만</option></select>' +
      '<button class="btn btn-secondary btn-sm" id="fx-an" disabled>파일 흔적 분석</button></div>' +
      '<div class="grid2 pp-g" style="margin:8px 0"><label class="mini" style="display:flex;align-items:center;gap:8px"><span style="min-width:56px">투명도</span><input style="flex:1" type="range" id="fx-op" min="0" max="100" value="50"></label><label class="mini" style="display:flex;align-items:center;gap:8px"><span style="min-width:56px">배율</span><input style="flex:1" type="range" id="fx-sc" min="70" max="130" value="100"></label><label class="mini" style="display:flex;align-items:center;gap:8px"><span style="min-width:56px">가로 이동</span><input style="flex:1" type="range" id="fx-dx" min="-25" max="25" value="0" step="0.1"></label><label class="mini" style="display:flex;align-items:center;gap:8px"><span style="min-width:56px">세로 이동</span><input style="flex:1" type="range" id="fx-dy" min="-25" max="25" value="0" step="0.1"></label><label class="mini" style="display:flex;align-items:center;gap:8px"><span style="min-width:56px">회전</span><input style="flex:1" type="range" id="fx-rt" min="-6" max="6" value="0" step="0.05"></label><button class="btn btn-ghost btn-sm" id="fx-rs">맞춤 초기화</button></div>' +
      '<div class="pv-stage" id="fx-st" style="min-height:240px;overflow:auto"></div><div id="fx-out" style="margin-top:10px"></div>' +
      '<p class="muted" style="margin-bottom:0">사진이면 상장 네 모서리가 화면에 꽉 차도록 자른 뒤 올리면 맞추기가 쉽습니다. 배율·이동·회전으로 맞추면 달라진 부분이 드러납니다.</p>';
    AW.modal({ title: o.title || '의심 이미지 대조', wide: true, body: body, actions: [{ label: '닫기', cls: 'btn-ghost' }],
      onOpen: function (el) {
        m.el = el; var g = function (id) { return AW.$('#' + id, el); }, pg, box, ov;
        function draw() {
          var stg = g('fx-st'), w = Math.max(280, stg.clientWidth - 24), h = Math.max(220, Math.min(window.innerHeight * 0.55, 620)), k = Math.min(w / tpl.page.w, h / tpl.page.h);
          stg.innerHTML = ''; box = document.createElement('div'); box.className = 'pv-sheet'; box.style.position = 'relative'; pg = AW.renderPage(tpl, { scale: k, mode: 'print', row: o.row, idx: o.idx }); pg.style.boxShadow = '0 0 0 1px #CBD5DF'; box.appendChild(pg); stg.appendChild(box); AW.fitAll(pg);
          if (st.url) { ov = document.createElement('img'); ov.src = st.url; ov.alt = ''; ov.draggable = false; ov.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;transform-origin:50% 50%'; box.appendChild(ov); apply(); }
        }
        function apply() {
          if (!ov) return; var mode = g('fx-mode').value, op = +g('fx-op').value / 100;
          ov.style.transform = 'translate(' + g('fx-dx').value + '%,' + g('fx-dy').value + '%) rotate(' + g('fx-rt').value + 'deg) scale(' + (+g('fx-sc').value / 100) + ')';
          ov.style.mixBlendMode = mode === 'diff' ? 'difference' : 'normal'; ov.style.opacity = mode === 'blend' ? op : mode === 'orig' ? 0 : 1; pg.style.visibility = mode === 'shot' ? 'hidden' : 'visible';
        }
        ['fx-op', 'fx-sc', 'fx-dx', 'fx-dy', 'fx-rt'].forEach(function (id) { g(id).addEventListener('input', apply); }); g('fx-mode').addEventListener('change', apply);
        g('fx-rs').onclick = function () { g('fx-sc').value = 100; g('fx-dx').value = 0; g('fx-dy').value = 0; g('fx-rt').value = 0; apply(); };
        g('fx-f').onchange = function (e) {
          var f = e.target.files[0]; if (!f) return; st.file = f; g('fx-out').innerHTML = '';
          AW.Editor.readSource(f, 2400, 0).then(function (r) {
            st.url = r.url; var im = new Image(); im.onload = function () { st.img = im; g('fx-an').disabled = false; draw(); }; im.src = r.url;
          }).catch(function (x) { AW.toast('이미지를 읽지 못했습니다: ' + x.message, 'error'); });
        };
        g('fx-an').onclick = function () {
          var out = g('fx-out'); out.innerHTML = '<div class="loading">분석 중…</div>';
          st.file.arrayBuffer().then(function (buf) {
            var cv = document.createElement('canvas'); cv.style.cssText = 'max-width:100%;border:1px solid var(--border);border-radius:var(--r)';
            return ela(st.img, cv).then(function () {
              out.innerHTML = '<div class="pp-sec"><b>① 파일에 남은 정보</b></div>' + metaReport(buf, st.file.name) + '<div class="pp-sec"><b>② 오류 수준 분석(ELA)</b> <span class="muted">밝게 보이는 곳이 주변과 다르게 압축된 곳</span></div>';
              out.appendChild(cv); var p = document.createElement('p'); p.className = 'muted'; p.innerHTML = '글자 주변이 전체적으로 비슷하게 밝으면 정상 범위일 수 있고, <b>특정 이름·숫자 부분만 유독 밝으면</b> 나중에 고쳐 넣었을 가능성이 있습니다. 이미 여러 번 저장·전송된 JPG는 전체가 밝게 나오므로 참고만 하십시오. 판단은 반드시 ‘겹쳐 보기’와 함께 하십시오.'; out.appendChild(p);
            });
          }).catch(function (x) { out.innerHTML = '<div class="alert warn">' + esc(x.message || '분석하지 못했습니다') + '</div>'; });
        };
        draw();
      } });
  };
})();
