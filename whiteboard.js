'use strict';
/**
 * whiteboard.js — 실시간 수업 노트
 *  · 학생 화면(?r=수업코드) / 교수자 화면(?mode=teacher) / 입장 화면(파라미터 없음)
 *  · 서버: Supabase wbd 스키마 + public.wb_* RPC (db/whiteboard_schema.sql, db/whiteboard_schema_2.sql)
 *  · 실시간은 Broadcast(교수자 키 해시 검증) + 학생 화면 4초 폴링 백업, PDF 는 PDF.js(글자 선택 층 포함)
 */
(function () {
  var SUPA_URL = 'https://zbpeyklwpotjyveipzxd.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV5a2x3cG90anl2ZWlwenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTYxMDcsImV4cCI6MjA5NzA5MjEwN30.6JgoQ6rPRnmrbBTG68A-Y9HDQk40mnwubhXVnkZvHrQ';
  var BUCKET = 'wb-files';
  var POLL_MS = 4000;
  var TOKEN_KEY = 'wb_token';
  var MAX_BYTES = 50 * 1024 * 1024;
  /* 올릴 수 있는 형식 (확장자 → MIME). 저장소 버킷의 허용 목록과 같아야 함 */
  var MIME = {
    '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.txt': 'text/plain', '.csv': 'text/csv', '.zip': 'application/zip',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.doc': 'application/msword', '.xls': 'application/vnd.ms-excel', '.ppt': 'application/vnd.ms-powerpoint',
    '.hwp': 'application/x-hwp', '.hwpx': 'application/vnd.hancom.hwpx'
  };

  var sb = window.supabase.createClient(SUPA_URL, SUPA_KEY, { realtime: { params: { eventsPerSecond: 25 } } });
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  /* ───────────── 공통 도구 ───────────── */
  var IC = {
    chevL: '<path d="m15 18-6-6 6-6"/>',
    chevR: '<path d="m9 18 6-6-6-6"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    qr: '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    note: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    back: '<path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    play: '<path d="m6 3 14 9-14 9z"/>',
    stop: '<rect width="14" height="14" x="5" y="5" rx="1"/>',
    zin: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>',
    zout: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    edit: '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
    code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/>'
  };
  function ic(n, sz) {
    sz = sz || 18;
    return '<svg class="ic" width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>';
  }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rid(n) { var a = new Uint8Array(n || 8); if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else for (var i = 0; i < a.length; i++) a[i] = Math.random() * 256; return Array.prototype.map.call(a, function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
  var lastTs = 0;
  function tsNow() { lastTs = Math.max(lastTs + 1, Date.now()); return lastTs; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
  function sizeText(b) { return b >= 1048576 ? (Math.round(b / 104857.6) / 10) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB'; }
  function dlUrl(m) { return m.url + '?download=' + encodeURIComponent(m.name); }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
  function saveText(name, text) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function toast(msg, label, fn, ms) {
    var box = $('#toasts'); var t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = '<span>' + esc(msg) + '</span>';
    if (label) { var b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.onclick = function () { fn && fn(); t.remove(); }; t.appendChild(b); }
    box.appendChild(t); setTimeout(function () { t.remove(); }, ms || (label ? 9000 : 3200));
  }

  function rpc(fn, args) {
    return fetch(SUPA_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST', headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        if (!r.ok) { var e = new Error((j && j.message) || ('HTTP ' + r.status)); e.code = (j && j.message) || ''; throw e; }
        return j;
      });
    }, function () { var e = new Error('네트워크 연결을 확인해 주십시오.'); e.code = 'NETWORK'; throw e; });
  }

  function sha256(s) {
    if (!window.crypto || !crypto.subtle) return Promise.resolve(null);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    });
  }

  /* ───────────── 클립보드 ───────────── */
  var copying = false;
  function copyText(t, msg) {
    t = String(t || '');
    if (!t.trim()) { toast('복사할 내용이 없습니다.'); return; }
    function done() { copying = false; toast(msg || '복사했습니다.'); }
    function legacy() {
      var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'; document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      ta.remove(); copying = false;
      if (ok) toast(msg || '복사했습니다.'); else toast('복사하지 못했습니다. 글자를 직접 선택해 복사해 주십시오.');
    }
    copying = true;
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, legacy); else legacy();
  }
  document.addEventListener('copy', function () {
    if (copying) return;
    var sel = window.getSelection && String(window.getSelection());
    if (sel && sel.trim()) toast('선택한 글자를 복사했습니다.');
  });
  function offscreenText(node) {
    var d = document.createElement('div'); d.style.cssText = 'position:fixed;left:-9999px;top:0;width:600px'; d.appendChild(node);
    document.body.appendChild(d); var t = d.innerText; d.remove(); return t.replace(/\n{3,}/g, '\n\n').trim();
  }
  function htmlToText(html) { var d = document.createElement('div'); d.innerHTML = sanitize(html); return offscreenText(d); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-copy]');
    if (b) { e.preventDefault(); copyText(b.getAttribute('data-copy'), '주소를 복사했습니다.'); return; }
    var c = e.target.closest && e.target.closest('[data-cpb]');
    if (c) {
      var blk = c.parentNode.cloneNode(true); $$('.cpb-btn', blk).forEach(function (x) { x.remove(); });
      copyText(offscreenText(blk), '복사했습니다.');
    }
  });

  /* ───────────── 노트 HTML 정리 (학생 화면에는 허용된 서식만 표시) ───────────── */
  var OK_TAGS = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, DEL: 1, SPAN: 1, FONT: 1, BR: 1, DIV: 1, P: 1, UL: 1, OL: 1, LI: 1, H1: 1, H2: 1, H3: 1, A: 1, BLOCKQUOTE: 1, MARK: 1, CODE: 1 };
  var DROP = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, TEMPLATE: 1, NOSCRIPT: 1, SVG: 1, MATH: 1, TEXTAREA: 1, SELECT: 1, FORM: 1, INPUT: 1, BUTTON: 1, LINK: 1, META: 1 };
  function cleanStyle(st) {
    var out = [];
    String(st || '').split(';').forEach(function (d) {
      var i = d.indexOf(':'); if (i < 0) return;
      var k = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim();
      if (!/^(color|background-color|background|font-size|font-weight|font-style|text-decoration|text-decoration-line|text-align)$/.test(k)) return;
      if (!/^[#a-z0-9(),.%\s-]+$/i.test(v) || /url|expression|javascript/i.test(v)) return;
      out.push(k + ':' + v);
    });
    return out.join(';');
  }
  function sanitize(html) {
    var doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
    var out = document.createElement('div');
    (function walk(src, dst) {
      Array.prototype.forEach.call(src.childNodes, function (n) {
        if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.nodeValue)); return; }
        if (n.nodeType !== 1) return;
        var t = n.tagName;
        if (DROP[t]) return;
        if (n.classList && n.classList.contains('cpb-btn')) return;
        if (!OK_TAGS[t]) { walk(n, dst); return; }
        var c = document.createElement(t.toLowerCase());
        var st = cleanStyle(n.getAttribute('style')); if (st) c.setAttribute('style', st);
        if (t === 'DIV' && n.getAttribute('class') === 'cpb') c.setAttribute('class', 'cpb');
        if (t === 'FONT') {
          var col = n.getAttribute('color'); if (col && /^#?[a-z0-9]{3,20}$/i.test(col)) c.setAttribute('color', col);
          var sz = n.getAttribute('size'); if (sz && /^[1-7]$/.test(sz)) c.setAttribute('size', sz);
        }
        if (t === 'A') {
          var h = n.getAttribute('href') || '';
          if (/^https?:\/\//i.test(h)) { c.setAttribute('href', h); c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener noreferrer'); }
        }
        walk(n, c); dst.appendChild(c);
      });
    })(doc.body, out);
    return out.innerHTML;
  }
  /* 학생 화면 노트에서 「복사 블록」마다 복사 버튼을 붙인다 */
  function enhanceNote(root) {
    $$('.cpb', root).forEach(function (b) {
      if (b.querySelector('.cpb-btn')) return;
      var bt = document.createElement('button'); bt.type = 'button'; bt.className = 'btn sm cpb-btn'; bt.setAttribute('data-cpb', '');
      bt.innerHTML = ic('copy', 13) + ' 복사'; b.appendChild(bt);
    });
  }

  /* ───────────── PDF 뷰어: 맞춤·확대(휠·핀치·끌기)·글자 선택 층·교수자 포인터 ───────────── */
  function Viewer(box, canvas) {
    var doc = null, n = 1, seq = 0, task = null, tlTask = null, z = 1, baseW = 0, baseH = 0, hand = false;
    var wrap = document.createElement('div'); wrap.className = 'pdfwrap';
    canvas.parentNode.insertBefore(wrap, canvas); wrap.appendChild(canvas);
    var tl = document.createElement('div'); tl.className = 'textLayer'; wrap.appendChild(tl);
    var ptr = document.createElement('div'); ptr.className = 'ptr hide'; wrap.appendChild(ptr);
    var api = {};
    function cur() { return Math.min(Math.max(n, 1), doc ? doc.numPages : 1); }
    function draw() {
      if (!doc) return;
      var my = ++seq;
      doc.getPage(cur()).then(function (pg) {
        if (my !== seq) return;
        var w = box.clientWidth - 16, h = box.clientHeight - 16;
        if (w < 50 || h < 50) return;
        var v1 = pg.getViewport({ scale: 1 });
        var fit = Math.min(w / v1.width, h / v1.height);
        var sc = fit * z;
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var rs = sc * dpr; if (v1.width * rs > 4096) rs = 4096 / v1.width;
        var vp = pg.getViewport({ scale: rs });
        var cssVp = pg.getViewport({ scale: sc });
        baseW = v1.width * fit; baseH = v1.height * fit;
        var off = document.createElement('canvas'); off.width = Math.floor(vp.width); off.height = Math.floor(vp.height);
        if (task) { try { task.cancel(); } catch (e) {} }
        task = pg.render({ canvasContext: off.getContext('2d'), viewport: vp });
        task.promise.then(function () {
          if (my !== seq) return;
          canvas.width = off.width; canvas.height = off.height;
          canvas.style.width = cssVp.width + 'px'; canvas.style.height = cssVp.height + 'px';
          canvas.getContext('2d').drawImage(off, 0, 0);
          wrap.style.width = cssVp.width + 'px'; wrap.style.height = cssVp.height + 'px';
          if (tlTask) { try { tlTask.cancel(); } catch (e) {} }
          tl.innerHTML = ''; tl.style.width = cssVp.width + 'px'; tl.style.height = cssVp.height + 'px'; tl.style.setProperty('--scale-factor', cssVp.scale);
          if (window.pdfjsLib.renderTextLayer) {
            tlTask = window.pdfjsLib.renderTextLayer({ textContentSource: pg.streamTextContent(), container: tl, viewport: cssVp, textDivs: [] });
            tlTask.promise.catch(function () {});
          }
        }).catch(function () {});
      }).catch(function () {});
    }
    var rt = null;
    function later() { clearTimeout(rt); rt = setTimeout(draw, 140); }
    if (window.ResizeObserver) new ResizeObserver(later).observe(box); else window.addEventListener('resize', later);

    /* 확대 */
    function setZoom(nz, fx, fy) {
      nz = Math.max(1, Math.min(4, Math.round(nz * 100) / 100));
      if (nz === z) return;
      var bw = wrap.offsetWidth || 1, bh = wrap.offsetHeight || 1;
      var rx = box.scrollLeft + (fx == null ? box.clientWidth / 2 : fx), ry = box.scrollTop + (fy == null ? box.clientHeight / 2 : fy);
      var px = rx / bw, py = ry / bh;
      z = nz;
      if (baseW) { wrap.style.width = (baseW * z) + 'px'; wrap.style.height = (baseH * z) + 'px'; canvas.style.width = wrap.style.width; canvas.style.height = wrap.style.height; }
      box.scrollLeft = px * wrap.offsetWidth - (fx == null ? box.clientWidth / 2 : fx);
      box.scrollTop = py * wrap.offsetHeight - (fy == null ? box.clientHeight / 2 : fy);
      box.classList.toggle('zoomed', z > 1);
      later(); if (api.onZoom) api.onZoom(z);
    }
    box.addEventListener('wheel', function (e) {
      if (!e.ctrlKey || !doc) return;
      e.preventDefault();
      var r = box.getBoundingClientRect();
      setZoom(z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    /* 핀치(두 손가락) 확대와 끌어서 이동(손 도구·바깥 여백) */
    var pts = {}, pinch0 = null, pan = null;
    box.style.touchAction = 'pan-x pan-y';
    box.addEventListener('pointerdown', function (e) {
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pts);
      if (ids.length === 2) {
        var a = pts[ids[0]], b = pts[ids[1]];
        pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: z }; pan = null;
      } else if (ids.length === 1 && e.pointerType !== 'touch' && (hand || e.target === box) && z > 1) {
        pan = { x: e.clientX, y: e.clientY, l: box.scrollLeft, t: box.scrollTop };
        try { box.setPointerCapture(e.pointerId); } catch (x) {}
        box.classList.add('panning');
      }
    });
    box.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId]) return;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pts);
      if (ids.length === 2 && pinch0) {
        var a = pts[ids[0]], b = pts[ids[1]], r = box.getBoundingClientRect();
        setZoom(pinch0.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch0.d), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      } else if (pan) {
        box.scrollLeft = pan.l - (e.clientX - pan.x); box.scrollTop = pan.t - (e.clientY - pan.y);
      }
    });
    function up(e) { delete pts[e.pointerId]; pinch0 = null; if (!Object.keys(pts).length) { pan = null; box.classList.remove('panning'); } }
    box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);

    api.setDoc = function (d) { doc = d; draw(); };
    api.show = function (p) { n = p; draw(); };
    api.clear = function () { doc = null; seq++; canvas.width = canvas.height = 0; wrap.style.width = wrap.style.height = '0'; tl.innerHTML = ''; };
    api.zoom = function (d) { setZoom(d === 0 ? 1 : z * d); };
    api.getZoom = function () { return z; };
    api.setHand = function (on) { hand = !!on; box.classList.toggle('hand', hand); };
    api.getHand = function () { return hand; };
    api.wrap = wrap;
    /* 교수자 포인터(정규화 좌표 0~1) */
    api.setPtr = function (x, y, on) {
      if (!on) { ptr.classList.add('hide'); return; }
      ptr.style.left = (x * 100) + '%'; ptr.style.top = (y * 100) + '%'; ptr.classList.remove('hide');
    };
    api.ripple = function (x, y) {
      var r = document.createElement('div'); r.className = 'rip'; r.style.left = (x * 100) + '%'; r.style.top = (y * 100) + '%';
      wrap.appendChild(r); setTimeout(function () { r.remove(); }, 1300);
    };
    api.norm = function (e) {
      var r = wrap.getBoundingClientRect();
      return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1))), y: Math.min(1, Math.max(0, (e.clientY - r.top) / (r.height || 1))) };
    };
    /* 현재 쪽의 글자 전체 (줄바꿈 유지) */
    api.text = function () {
      if (!doc) return Promise.resolve('');
      return doc.getPage(cur()).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
        var out = '', lastY = null;
        tc.items.forEach(function (it) {
          if (typeof it.str !== 'string') return;
          var y = it.transform ? it.transform[5] : 0;
          if (lastY !== null && Math.abs(y - lastY) > 2 && out && !/\n$/.test(out)) out += '\n';
          out += it.str; if (it.hasEOL) out += '\n'; lastY = y;
        });
        return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      });
    };
    return api;
  }
  function loadPdf(url) { return window.pdfjsLib.getDocument({ url: url }).promise; }

  /* 확대 조작 줄(학생·교수자 공통) */
  function zoomHtml() {
    return '<span class="zm"><button class="btn icon sm" data-z="out" title="축소" aria-label="축소">' + ic('zout', 16) + '</button>' +
      '<button class="btn sm zl" data-z="fit" title="화면에 맞춤">100%</button>' +
      '<button class="btn icon sm" data-z="in" title="확대 (Ctrl+휠, 두 손가락 벌리기)" aria-label="확대">' + ic('zin', 16) + '</button>' +
      '<button class="btn icon sm" data-z="hand" title="끌어서 이동 (확대했을 때)" aria-label="끌어서 이동">' + ic('hand', 16) + '</button></span>';
  }
  function bindZoom(root, viewer) {
    var lab = $('.zl', root);
    viewer.onZoom = function (z) { lab.textContent = Math.round(z * 100) + '%'; };
    $$('[data-z]', root).forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-z');
        if (k === 'in') viewer.zoom(1.25); else if (k === 'out') viewer.zoom(1 / 1.25); else if (k === 'fit') viewer.zoom(0);
        else { viewer.setHand(!viewer.getHand()); b.classList.toggle('on', viewer.getHand()); }
      };
    });
  }

  /* ───────────── 쪽 썸네일 목록 ───────────── */
  function Thumbs(panel, onPick) {
    var doc = null, items = [], queue = [], busy = false, io = null, tok = 0;
    function pump() {
      if (busy || !queue.length) return;
      busy = true; var it = queue.shift(), my = tok;
      doc.getPage(+it.dataset.p).then(function (pg) {
        var v1 = pg.getViewport({ scale: 1 }), sc = 150 / v1.width, vp = pg.getViewport({ scale: sc });
        var cv = $('canvas', it); cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
        return pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      }).catch(function () {}).then(function () { busy = false; if (my === tok) pump(); else { busy = false; } });
    }
    function build(d) {
      tok++; doc = d; panel.innerHTML = ''; items = []; queue = []; busy = false;
      if (io) io.disconnect();
      if (!d) return;
      io = window.IntersectionObserver ? new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && !e.target.dataset.done) { e.target.dataset.done = 1; queue.push(e.target); pump(); } });
      }, { root: panel, rootMargin: '200px' }) : null;
      for (var p = 1; p <= d.numPages; p++) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'th'; b.dataset.p = p;
        b.innerHTML = '<canvas></canvas><span class="tn">' + p + '</span><i class="tb hide"></i>';
        panel.appendChild(b); items.push(b); if (io) io.observe(b);
      }
    }
    panel.addEventListener('click', function (e) { var b = e.target.closest('.th'); if (b) onPick(+b.dataset.p); });
    return {
      build: build,
      mark: function (cur, tp) {
        items.forEach(function (b, i) { b.classList.toggle('cur', i + 1 === cur); b.classList.toggle('tpg', i + 1 === tp); });
        var c = items[cur - 1]; if (c && !panel.classList.contains('hide') && c.scrollIntoView) { try { c.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
      },
      badges: function (map) {
        items.forEach(function (b, i) { var n = map[i + 1] || 0, t = $('.tb', b); t.classList.toggle('hide', !n); t.textContent = n || ''; });
      }
    };
  }

  /* ───────────── 라우터 ───────────── */
  var P = new URLSearchParams(location.search);
  var root = $('#root');
  function boot() {
    if (P.get('r')) return Student(String(P.get('r')).replace(/\D/g, '').slice(0, 8), P.get('view') === '1');
    if (P.get('mode') === 'teacher') return Teacher();
    return Landing();
  }

  /* ───────────── 입장 화면 ───────────── */
  function Landing() {
    document.title = '실시간 수업 노트';
    root.innerHTML =
      '<div class="land"><div class="box card">' +
      '<h1>실시간 수업 노트</h1><p>교수자 화면에 안내된 4자리 수업 코드를 입력해 주십시오.</p>' +
      '<input id="lc" class="inp code-in" inputmode="numeric" maxlength="4" placeholder="0000" autocomplete="off" aria-label="수업 코드">' +
      '<div class="err" id="le"></div>' +
      '<div class="row"><button class="btn pri" id="lg">' + ic('play', 16) + ' 입장</button></div>' +
      '<div class="alt"><a href="?mode=teacher">교수자 입장</a></div></div></div>';
    var inp = $('#lc');
    function go() {
      var c = inp.value.replace(/\D/g, '');
      if (c.length !== 4) { $('#le').textContent = '4자리 숫자를 입력해 주십시오.'; return; }
      location.search = '?r=' + c;
    }
    $('#lg').onclick = go;
    inp.onkeydown = function (e) { if (e.key === 'Enter') go(); };
    inp.focus();
  }

  /* ───────────── 학생 화면 ───────────── */
  function Student(code, beam) {
    var S = {
      code: code, ver: null, tkHash: null, tkVerified: null, follow: true, mat: null, cur: 1, tMat: null, tPage: 1, pageTs: 0, noteTs: 0,
      saved: null, mats: [], docs: {}, own: {}, shown: null, pages: 0, seen: {}, links: [], opened: {}, sigMap: {}, rt: false, pollOk: true,
      ended: false, noteHtml: '', dl: true, flash: false, flashUntil: 0, modeHtml: '', firstDone: false, title: '', memo: {}
    };
    var cid = store('wb_cid'); if (!cid || cid.length < 8) { cid = rid(10); store('wb_cid', cid); }
    try { S.sigMap = JSON.parse(store('wb_sigm_' + code) || '{}') || {}; } catch (e) { S.sigMap = {}; }
    try { S.memo = JSON.parse(store('wb_memo_' + code) || '{}') || {}; } catch (e) { S.memo = {}; }

    document.title = '수업 ' + code;
    document.body.classList.toggle('beam', !!beam);
    root.innerHTML =
      '<div class="s-app">' +
      '<header class="hdr"><div class="hdr-l"><span class="brand">실시간 수업 노트</span><span class="ttl" id="sTitle"></span></div>' +
      '<div class="hdr-r"><span class="chip">수업코드 <b>' + esc(code) + '</b></span><span class="conn" id="sConn"><i class="dot"></i><span>연결 중</span></span></div></header>' +
      '<div class="s-main"><section class="s-doc">' +
      '<div class="mtabs hide" id="sTabs"></div>' +
      '<div class="bar" id="sBar">' +
      '<button class="btn icon" id="sTh" title="쪽 목록" aria-label="쪽 목록">' + ic('grid', 17) + '</button>' +
      '<button class="btn icon" id="sPrev" aria-label="이전 쪽">' + ic('chevL') + '</button>' +
      '<span class="pg"><input id="sPg" type="number" min="1" inputmode="numeric" aria-label="쪽 번호"> / <b id="sTot">0</b></span>' +
      '<button class="btn icon" id="sNext" aria-label="다음 쪽">' + ic('chevR') + '</button>' + zoomHtml() +
      '<button class="btn pri hide" id="sToT">' + ic('monitor', 16) + ' <span>교수 화면으로 돌아가기</span></button>' +
      '<button class="btn hide" id="sToMine">' + ic('back', 16) + ' <span></span></button>' +
      '<button class="btn hide" id="sFree">' + ic('users', 16) + ' 내 속도로 보기</button>' +
      '<button class="btn" id="sCopy" title="이 쪽의 글자를 모두 복사">' + ic('copy', 16) + ' <span class="lbl">이 쪽 글자 복사</span></button>' +
      '<span class="mode" id="sMode"></span></div>' +
      '<div class="stagebox"><div class="stage" id="sStage"><canvas id="sCv"></canvas><div class="empty" id="sEmpty">교수자가 자료를 올리면 이곳에 표시됩니다.</div></div>' +
      '<div class="thumbs hide" id="sThumbs"></div></div>' +
      '</section>' +
      '<aside class="s-side">' +
      '<div class="sec grow"><h3>' + ic('note', 15) + ' 노트<button class="btn sm" data-copynote style="margin-left:auto">' + ic('copy', 14) + ' 노트 복사</button></h3><div class="body"><div class="noteBox"></div></div></div>' +
      '<div class="sec"><h3>' + ic('link', 15) + ' 링크 · 자료<button class="btn sm" data-savetxt style="margin-left:auto" title="노트와 링크를 텍스트 파일로 저장">' + ic('download', 14) + ' 노트·링크 저장</button></h3><div class="body" style="max-height:30vh"><ul class="linkList"></ul><ul class="matList"></ul></div></div>' +
      '<div class="sec mm"><h3>' + ic('edit', 15) + ' <span class="mmt">내 메모</span><button class="btn sm" data-savememo style="margin-left:auto">' + ic('download', 14) + ' 메모 저장</button></h3><div class="body"><textarea class="memoTa" rows="3" placeholder="이 쪽에 대한 내 메모 (이 PC에만 저장됩니다)"></textarea></div></div>' +
      '<div class="sec sg"><h3>' + ic('help', 15) + ' 이 쪽 이해도</h3><div class="sig">' +
      '<button class="btn sg-got" data-v="1">' + ic('check', 16) + ' 이해했어요</button>' +
      '<button class="btn sg-hard" data-v="2">' + ic('help', 16) + ' 어려워요</button></div></div>' +
      '</aside></div>' +
      '<nav class="s-tabs"><button class="btn" id="tNote">' + ic('note', 16) + ' 노트<i class="badge hide" id="bNote"></i></button>' +
      '<button class="btn" id="tLink">' + ic('link', 16) + ' 링크<i class="badge hide" id="bLink"></i></button>' +
      '<button class="btn" id="tMemo">' + ic('edit', 16) + ' 메모</button>' +
      '<button class="btn sg-got" data-v="1">' + ic('check', 16) + ' 이해</button>' +
      '<button class="btn sg-hard" data-v="2">' + ic('help', 16) + ' 어려움</button></nav>' +
      '<div class="sheet" id="shNote"><div class="sh-h"><span>노트</span><span style="display:flex;gap:6px"><button class="btn sm" data-copynote>' + ic('copy', 14) + ' 복사</button><button class="btn sm icon" data-close aria-label="닫기">' + ic('x', 16) + '</button></span></div><div class="sh-b"><div class="noteBox"></div></div></div>' +
      '<div class="sheet" id="shLink"><div class="sh-h"><span>링크 · 자료</span><span style="display:flex;gap:6px"><button class="btn sm" data-savetxt>' + ic('download', 14) + ' 저장</button><button class="btn sm icon" data-close aria-label="닫기">' + ic('x', 16) + '</button></span></div><div class="sh-b"><ul class="linkList"></ul><ul class="matList"></ul></div></div>' +
      '<div class="sheet" id="shMemo"><div class="sh-h"><span class="mmt">내 메모</span><span style="display:flex;gap:6px"><button class="btn sm" data-savememo>' + ic('download', 14) + ' 저장</button><button class="btn sm icon" data-close aria-label="닫기">' + ic('x', 16) + '</button></span></div><div class="sh-b"><textarea class="memoTa" rows="4" placeholder="이 쪽에 대한 내 메모 (이 PC에만 저장됩니다)"></textarea></div></div>' +
      '</div>';

    var viewer = Viewer($('#sStage'), $('#sCv'));
    bindZoom($('#sBar'), viewer);
    var thumbs = Thumbs($('#sThumbs'), function (p) { moveOwn(p); });
    var ids = {
      prev: $('#sPrev'), next: $('#sNext'), pg: $('#sPg'), tot: $('#sTot'), toT: $('#sToT'), toMine: $('#sToMine'),
      free: $('#sFree'), mode: $('#sMode'), empty: $('#sEmpty'), conn: $('#sConn'), title: $('#sTitle'), tabs: $('#sTabs')
    };

    function matById(id) { for (var i = 0; i < S.mats.length; i++) if (S.mats[i].id === id) return S.mats[i]; return null; }
    function pdfs() { return S.mats.filter(function (m) { return m.kind === 'pdf'; }); }
    function mname(id) { var m = matById(id); return m ? m.name.replace(/\.pdf$/i, '') : ''; }
    function sk() { return S.mat + ':' + S.cur; }
    function pageCount() { var m = matById(S.mat); return (S.shown === S.mat && S.pages) ? S.pages : (m ? m.pages : 0); }
    function clampPage(p) { var n = pageCount(); return Math.max(1, n ? Math.min(p, n) : p); }

    /* 화면 갱신: 쪽 번호, 자료 탭, 안내 문구, 버튼 */
    function paint() {
      var n = pageCount(), p = clampPage(S.cur);
      ids.pg.value = p; ids.tot.textContent = n || 0;
      var ps = pdfs();
      ids.tabs.classList.toggle('hide', ps.length < 2 || beam);
      ids.tabs.innerHTML = ps.map(function (m) {
        return '<button class="mt' + (m.id === S.mat ? ' on' : '') + (m.id === S.tMat ? ' tm' : '') + '" data-m="' + esc(m.id) + '" title="' + esc(m.name) + '"><span>' + esc(m.name.replace(/\.pdf$/i, '')) + '</span>' + (m.id === S.tMat && m.id !== S.mat ? '<i class="tdot" title="교수자가 보고 있는 자료"></i>' : '') + '</button>';
      }).join('');
      var diffMat = S.tMat && S.tMat !== S.mat;
      var tLabel = (diffMat ? mname(S.tMat) + ' ' : '') + S.tPage + '쪽';
      ids.toT.classList.toggle('hide', S.follow || beam);
      $('span', ids.toT).textContent = '교수 화면으로 돌아가기 (' + tLabel + ')';
      var showMine = S.follow && S.saved && (S.saved.mat !== S.tMat || S.saved.page !== S.tPage) && !beam;
      ids.toMine.classList.toggle('hide', !showMine);
      if (showMine) $('span', ids.toMine).textContent = '내가 보던 ' + (S.saved.mat !== S.tMat ? mname(S.saved.mat) + ' ' : '') + S.saved.page + '쪽으로 돌아가기';
      ids.free.classList.toggle('hide', !S.follow || beam);
      ids.mode.className = 'mode ' + (S.follow ? 'follow' : 'free');
      /* 교수자 위치는 같은 자리에서 숫자만 바뀌고, 따로 움직였을 때만 깜빡여 주의를 끈다 (갱신이 와도 깜빡임은 끊기지 않음) */
      var flashing = !S.follow && Date.now() < S.flashUntil;
      var mh = S.follow
        ? '<b>교수자 화면을 따라가는 중</b> · <span class="tpos">교수자 ' + esc(tLabel) + '</span>'
        : '<b>내 속도로 보는 중</b> · <span class="tpos' + (flashing ? ' flash' : '') + '">교수자는 ' + esc(tLabel) + '</span>';
      if (mh !== S.modeHtml) { S.modeHtml = mh; ids.mode.innerHTML = mh; }
      if (S.flash && !S.follow) { ids.toT.classList.remove('flash'); void ids.toT.offsetWidth; ids.toT.classList.add('flash'); vibrate(80); }
      S.flash = false;
      thumbs.mark(p, S.tMat === S.mat ? S.tPage : 0);
      paintSig(); paintMemo();
    }

    /* 현재 자료를 불러와 보여준다 */
    function getDoc(m) {
      if (!S.docs[m.id]) S.docs[m.id] = loadPdf(m.url).catch(function (e) { delete S.docs[m.id]; throw e; });
      return S.docs[m.id];
    }
    function show() {
      var m = matById(S.mat);
      if (!m || m.kind !== 'pdf') {
        S.shown = null; viewer.clear(); thumbs.build(null); ids.empty.classList.remove('hide');
        ids.empty.textContent = S.ended ? '수업이 종료되었습니다.' : '교수자가 자료를 올리면 이곳에 표시됩니다.';
        paint(); return;
      }
      ids.empty.classList.add('hide');
      if (S.shown !== m.id) {
        S.shown = m.id; var id = m.id;
        getDoc(m).then(function (d) {
          if (S.shown !== id) return;
          S.pages = d.numPages; viewer.setDoc(d); thumbs.build(d); viewer.show(clampPage(S.cur)); paint();
        }).catch(function () {
          if (S.shown !== id) return;
          S.shown = null; ids.empty.classList.remove('hide'); ids.empty.textContent = '자료를 불러오지 못했습니다. 잠시 후 다시 시도합니다.';
        });
      } else viewer.show(clampPage(S.cur));
      paint();
    }
    function moveOwn(p) {
      if (beam) return;
      var n = pageCount(); if (!n) return;
      p = Math.max(1, Math.min(n, p));
      S.follow = false; S.cur = p; S.own[S.mat] = p; show();
    }
    function selectMat(id) {
      if (beam || id === S.mat) return;
      S.follow = false; S.mat = id; S.cur = S.own[id] || 1; show();
    }
    ids.prev.onclick = function () { moveOwn(S.cur - 1); };
    ids.next.onclick = function () { moveOwn(S.cur + 1); };
    ids.pg.onchange = function () { moveOwn(parseInt(ids.pg.value, 10) || S.cur); };
    ids.free.onclick = function () { S.follow = false; S.own[S.mat] = S.cur; paint(); };
    ids.toT.onclick = function () { S.saved = { mat: S.mat, page: S.cur }; S.follow = true; S.mat = S.tMat; S.cur = S.tPage; show(); };
    ids.toMine.onclick = function () { var sv = S.saved; S.saved = null; S.follow = false; S.mat = sv.mat; S.cur = sv.page; show(); };
    ids.tabs.addEventListener('click', function (e) { var b = e.target.closest('.mt'); if (b) selectMat(b.getAttribute('data-m')); });
    $('#sTh').onclick = function () { $('#sThumbs').classList.toggle('hide'); thumbs.mark(clampPage(S.cur), S.tMat === S.mat ? S.tPage : 0); };
    $('#sCopy').onclick = function () { viewer.text().then(function (t) { copyText(t, '이 쪽의 글자를 복사했습니다.'); }); };
    document.addEventListener('keydown', function (e) {
      if (e.target && (/INPUT|TEXTAREA/.test(e.target.tagName) || e.target.isContentEditable)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') moveOwn(S.cur + 1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') moveOwn(S.cur - 1);
    });

    /* 노트 · 링크 · 자료 */
    function setNote(html) {
      S.noteHtml = sanitize(html);
      $$('.noteBox').forEach(function (b) { b.innerHTML = S.noteHtml; enhanceNote(b); });
    }
    function renderLinks() {
      var h = S.links.slice().reverse().map(function (l) {
        var isNew = !S.opened[l.id];
        return '<li class="lkrow"><a class="lk' + (isNew ? ' new' : '') + '" href="' + esc(l.u) + '" target="_blank" rel="noopener noreferrer" data-id="' + esc(l.id) + '">' +
          '<span class="lt">' + esc(l.t) + '<span class="lu">' + esc(l.u) + '</span></span>' + ic('ext', 16) + '</a>' +
          '<button class="btn icon cp" data-copy="' + esc(l.u) + '" title="주소 복사" aria-label="주소 복사">' + ic('copy', 15) + '</button></li>';
      }).join('');
      $$('.linkList').forEach(function (u) { u.innerHTML = h; });
    }
    function renderMats() {
      var list = S.dl ? S.mats : [];
      var h = list.map(function (m) {
        return '<li class="lkrow"><a class="lk mt-file" href="' + esc(dlUrl(m)) + '" download="' + esc(m.name) + '">' + ic(m.kind === 'pdf' ? 'note' : 'file', 16) +
          '<span class="lt">' + esc(m.name) + '<span class="lu">' + (m.kind === 'pdf' ? m.pages + '쪽 · ' : '') + sizeText(m.size) + '</span></span>' + ic('download', 16) + '</a></li>';
      }).join('');
      $$('.matList').forEach(function (u) { u.innerHTML = h; });
    }
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a.lk[data-id]'); if (a) { S.opened[a.getAttribute('data-id')] = 1; a.classList.remove('new'); }
      if (e.target.closest && e.target.closest('[data-copynote]')) copyText(htmlToText(S.noteHtml), '노트를 복사했습니다.');
      if (e.target.closest && e.target.closest('[data-savetxt]')) {
        var t = '[' + (S.title || '수업') + '] 수업코드 ' + code + '\n\n■ 노트\n' + htmlToText(S.noteHtml) + '\n\n■ 링크\n' +
          S.links.map(function (l) { return l.t + '\n' + l.u; }).join('\n\n');
        saveText('수업노트_' + code + '.txt', t);
      }
      if (e.target.closest && e.target.closest('[data-savememo]')) {
        var keys = Object.keys(S.memo).filter(function (k) { return (S.memo[k] || '').trim(); });
        if (!keys.length) { toast('저장할 메모가 없습니다.'); return; }
        var order = S.mats.map(function (m) { return m.id; });
        keys.sort(function (a, b) { var A = a.split(':'), B = b.split(':'); return (order.indexOf(A[0]) - order.indexOf(B[0])) || (+A[1] - +B[1]); });
        saveText('내메모_' + code + '.txt', '[' + (S.title || '수업') + '] 수업코드 ' + code + ' 내 메모\n\n' + keys.map(function (k) {
          var p = k.split(':'); return '■ ' + (mname(p[0]) || '자료') + ' ' + p[1] + '쪽\n' + S.memo[k];
        }).join('\n\n'));
      }
    });
    function addLinks(list, quiet) {
      var fresh = [];
      list.forEach(function (l) { if (!S.seen[l.id]) { S.seen[l.id] = 1; fresh.push(l); } });
      S.links = list.slice();
      renderLinks();
      if (fresh.length && !quiet) {
        var l = fresh[fresh.length - 1];
        $('#bLink').classList.remove('hide'); vibrate(60);
        toast('새 링크: ' + l.t, '열기', function () { S.opened[l.id] = 1; window.open(l.u, '_blank', 'noopener'); renderLinks(); });
      }
    }
    function sheet(id, open) {
      $$('.sheet').forEach(function (s) { s.classList.remove('open'); });
      if (open) { $(id).classList.add('open'); if (id === '#shNote') $('#bNote').classList.add('hide'); if (id === '#shLink') $('#bLink').classList.add('hide'); }
    }
    $('#tNote').onclick = function () { sheet('#shNote', !$('#shNote').classList.contains('open')); };
    $('#tLink').onclick = function () { sheet('#shLink', !$('#shLink').classList.contains('open')); };
    $('#tMemo').onclick = function () { sheet('#shMemo', !$('#shMemo').classList.contains('open')); };
    $$('[data-close]').forEach(function (b) { b.onclick = function () { sheet(null, false); }; });

    /* 내 메모 (쪽별, 이 PC 브라우저에만 저장) */
    function paintMemo() {
      var key = sk(), v = S.memo[key] || '';
      $$('.memoTa').forEach(function (t) { if (document.activeElement !== t || t.dataset.key !== key) t.value = v; t.dataset.key = key; });
      $$('.mmt').forEach(function (s) { s.textContent = '내 메모 · ' + (mname(S.mat) ? mname(S.mat) + ' ' : '') + S.cur + '쪽'; });
    }
    $$('.memoTa').forEach(function (t) {
      t.addEventListener('input', function () {
        var key = t.dataset.key || sk(); S.memo[key] = t.value;
        store('wb_memo_' + code, JSON.stringify(S.memo));
        $$('.memoTa').forEach(function (o) { if (o !== t && o.dataset.key === key) o.value = t.value; });
      });
    });

    /* 이해도 신호 (쪽마다 따로 집계) */
    function paintSig() {
      var v = S.sigMap[sk()] || 0;
      $$('.sg-got').forEach(function (b) { b.classList.toggle('on', v === 1); b.classList.add('got'); });
      $$('.sg-hard').forEach(function (b) { b.classList.toggle('on', v === 2); b.classList.add('hard'); });
    }
    $$('[data-v]').forEach(function (b) {
      b.onclick = function () {
        if (!S.mat) { toast('자료가 표시된 뒤에 눌러 주십시오.'); return; }
        var key = sk(), mat = S.mat, page = S.cur;
        var v = parseInt(b.getAttribute('data-v'), 10), old = S.sigMap[key] || 0, nv = old === v ? 0 : v;
        S.sigMap[key] = nv; paintSig();
        rpc('wb_sigp', { p_code: code, p_cid: cid, p_val: nv, p_mat: mat, p_page: page }).then(function () {
          store('wb_sigm_' + code, JSON.stringify(S.sigMap));
          if (S.ch) S.ch.send({ type: 'broadcast', event: 'sig', payload: { c: cid } });
        }).catch(function () { S.sigMap[key] = old; paintSig(); toast('전송하지 못했습니다. 연결을 확인해 주십시오.'); });
      };
    });

    /* 서버 상태 반영 */
    function setTeacherPos(mat, page, ts) {
      if (ts < S.pageTs) return;
      var moved = mat !== S.tMat || page !== S.tPage;
      S.tMat = mat; S.tPage = page; S.pageTs = ts;
      if (!S.mat) { S.mat = mat; S.cur = page; }
      if (S.follow) { S.mat = mat; S.cur = page; show(); }
      else { if (moved) { S.flash = true; S.flashUntil = Date.now() + 2800; } paint(); }
    }
    function applyRoom(r) {
      if (!r || r.ok === false) {
        ids.empty.classList.remove('hide'); ids.empty.textContent = '수업 코드 ' + code + '번 수업을 찾을 수 없습니다. 코드를 다시 확인해 주십시오.';
        return;
      }
      if (r.same) return;
      S.ver = r.ver; S.tkHash = r.tk_hash || S.tkHash;
      S.title = r.title || ''; ids.title.textContent = S.title;
      document.title = (S.title ? S.title + ' · ' : '') + '수업 ' + code;
      S.ended = r.active === false;
      S.dl = r.dl !== false;
      S.mats = r.mats || [];
      renderMats();
      var tm = r.cur_mat && matById(r.cur_mat) ? r.cur_mat : (pdfs()[0] ? pdfs()[0].id : null);
      if (S.mat && !matById(S.mat)) { S.mat = tm; S.cur = 1; S.shown = null; }
      if (!S.mat) { S.mat = tm; S.cur = r.page || 1; }
      if ((r.page_ts || 0) >= S.pageTs) { S.tMat = tm; S.tPage = r.page || 1; S.pageTs = r.page_ts || 0; if (S.follow) { S.mat = tm; S.cur = S.tPage; } }
      if ((r.note_ts || 0) >= S.noteTs && sanitize(r.note) !== S.noteHtml) { S.noteTs = r.note_ts || 0; setNote(r.note); }
      addLinks(r.links || [], !S.firstDone);
      S.firstDone = true;
      show();
    }

    /* 폴링 백업 */
    function poll() {
      rpc('wb_room_get', { p_code: code, p_ver: S.ver }).then(function (r) { S.pollOk = true; applyRoom(r); paintConn(); })
        .catch(function () { S.pollOk = false; paintConn(); });
    }
    function paintConn() {
      var c = ids.conn, t = $('span', c);
      c.className = 'conn ' + (!S.pollOk ? 'bad' : S.rt ? 'ok' : 'warn');
      t.textContent = !S.pollOk ? '연결 끊김 · 다시 연결 중' : S.rt ? '실시간 연결' : '대체 연결 (4초 간격)';
    }
    setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
    window.addEventListener('online', poll);

    /* 실시간(Broadcast) */
    var ptrTimer = null;
    function handle(p) {
      if (p.t === 'page' || p.t === 'mat') setTeacherPos(p.mat, p.page, p.ts);
      else if (p.t === 'note') { if (p.ts >= S.noteTs) { S.noteTs = p.ts; setNote(p.html); if (!$('#shNote').classList.contains('open')) $('#bNote').classList.remove('hide'); } }
      else if (p.t === 'link') { if (!S.links.filter(function (x) { return x.id === p.link.id; }).length) addLinks(S.links.concat([p.link]), false); }
      else if (p.t === 'sigreset') { S.sigMap[p.m + ':' + p.p] = 0; store('wb_sigm_' + code, JSON.stringify(S.sigMap)); paintSig(); }
      else if (p.t === 'ptr') {
        var here = S.mat === p.m && S.cur === p.p;
        viewer.setPtr(p.x, p.y, !!p.on && here);
        clearTimeout(ptrTimer); ptrTimer = setTimeout(function () { viewer.setPtr(0, 0, false); }, 2500);
      } else if (p.t === 'clk') { if (S.mat === p.m && S.cur === p.p) viewer.ripple(p.x, p.y); }
      else if (p.t === 'doc' || p.t === 'links' || p.t === 'end') { S.ver = null; poll(); }
    }
    function onEvent(m) {
      var p = m && m.payload; if (!p || !p.tk || !S.tkHash) return;
      if (S.tkVerified === p.tk) { handle(p); return; }
      sha256(p.tk).then(function (h) { if (h && h === S.tkHash) { S.tkVerified = p.tk; handle(p); } });
    }
    function connect() {
      var ch = sb.channel('wb-' + code, { config: { broadcast: { self: false }, presence: { key: cid } } });
      S.ch = ch;
      ch.on('broadcast', { event: 'ev' }, onEvent);
      ch.subscribe(function (st) {
        if (st === 'SUBSCRIBED') { S.rt = true; ch.track({ role: 's' }); paintConn(); }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') { S.rt = false; paintConn(); }
      });
    }
    connect();
    poll();
  }

  /* ───────────── 교수자 화면 ───────────── */
  function Teacher() {
    document.title = '교수자 · 실시간 수업 노트';
    var T = { token: null };
    try { T.token = sessionStorage.getItem(TOKEN_KEY); } catch (e) {}
    function setToken(t) { T.token = t; try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} }

    function call(fn, args) {
      args = args || {}; args.p_token = T.token;
      return rpc(fn, args).catch(function (e) { if (e.code === 'AUTH_REQUIRED') { setToken(null); login('로그인이 만료되었습니다. 다시 로그인해 주십시오.'); } throw e; });
    }

    function login(msg) {
      root.innerHTML =
        '<div class="land"><div class="box card"><h1>교수자 로그인</h1><p>교수자 비밀번호를 입력해 주십시오.</p>' +
        '<input id="pw" class="inp" type="password" placeholder="비밀번호" autocomplete="current-password">' +
        '<div class="err" id="le">' + esc(msg || '') + '</div>' +
        '<div class="row"><button class="btn pri" id="lg">로그인</button></div>' +
        '<div class="alt"><a href="whiteboard.html">학생 입장 화면</a></div></div></div>';
      function go() {
        var pw = $('#pw').value; if (!pw) return;
        $('#lg').disabled = true;
        rpc('wb_login', { p_pw: pw }).then(function (r) {
          if (r && r.ok) { setToken(r.token); list(); return; }
          var m = r && r.error === 'LOCKED_OUT' ? '시도 횟수를 초과했습니다. 15분 뒤에 다시 시도해 주십시오.' : r && r.error === 'ADMIN_NOT_SET' ? '비밀번호가 등록되지 않았습니다.' : '비밀번호가 올바르지 않습니다. (남은 시도 ' + ((r && r.left) || 0) + '회)';
          $('#le').textContent = m; $('#lg').disabled = false;
        }).catch(function (e) { $('#le').textContent = e.message; $('#lg').disabled = false; });
      }
      $('#lg').onclick = go; $('#pw').onkeydown = function (e) { if (e.key === 'Enter') go(); }; $('#pw').focus();
    }

    function list() {
      root.innerHTML = '<div class="t-app"><header class="hdr"><div class="hdr-l"><span class="brand">실시간 수업 노트</span><span class="ttl">교수자</span></div></header>' +
        '<div style="overflow:auto"><div class="rooms"><div class="card" style="padding:14px"><div class="fr"><input id="nt" class="inp" placeholder="새 수업 이름 (예: AI 활용법 1회차)" maxlength="80"><button class="btn pri" id="nb">' + ic('plus', 16) + ' 새 수업 만들기</button></div></div>' +
        '<div id="rl" class="muted" style="margin-top:12px">불러오는 중...</div></div></div></div>';
      $('#nb').onclick = function () {
        $('#nb').disabled = true;
        call('wb_room_create', { p_title: $('#nt').value || '새 수업' }).then(function (r) { openRoom(r.code); })
          .catch(function (e) { toast('만들지 못했습니다: ' + e.message); $('#nb').disabled = false; });
      };
      call('wb_room_list').then(function (rows) {
        rows = rows.filter(function (r) { return r.title !== '시험용 (사용 안 함)'; });
        $('#rl').innerHTML = rows.length ? rows.map(function (r) {
          return '<div class="card item"><div class="cd">' + esc(r.code) + '</div><div class="nm"><b>' + esc(r.title) + '</b><span class="muted">' +
            (r.pdf_name ? esc(r.pdf_name) + ' · ' + r.pages + '쪽' : '자료 없음') + (r.active ? '' : ' · 종료됨') + ' · ' + new Date(r.updated_at).toLocaleString('ko-KR') + '</span></div>' +
            '<button class="btn pri sm" data-c="' + esc(r.code) + '">열기</button></div>';
        }).join('') : '<span class="muted">아직 만든 수업이 없습니다. 위에서 새 수업을 만들어 주십시오.</span>';
        $$('[data-c]').forEach(function (b) { b.onclick = function () { openRoom(b.getAttribute('data-c')); }; });
      }).catch(function () {});
    }

    function openRoom(code) {
      call('wb_room_open', { p_code: code }).then(function (r) { console_(r); }).catch(function (e) { toast('수업을 열지 못했습니다: ' + e.message); list(); });
    }

    /* ── 수업 진행 화면 ── */
    function console_(R) {
      var C = {
        code: R.code, tk: R.tk, mats: R.mats || [], curMat: R.cur_mat || null, page: R.page || 1, pageTs: R.page_ts || 0,
        noteTs: R.note_ts || 0, links: R.links || [], dl: R.dl !== false, active: R.active !== false, pending: {}, saving: false,
        docs: {}, users: 0, ch: null, H: { hard: 0, got: 0, pages: [] }, lastHard: -1, ptrOn: true, shown: null, pages: 0
      };
      var base = location.origin + location.pathname;
      var joinUrl = base + '?r=' + C.code;
      document.title = '[' + C.code + '] ' + (R.title || '') + ' · 교수자';

      root.innerHTML =
        '<div class="t-app"><header class="hdr"><div class="hdr-l"><button class="btn sm" id="bList">' + ic('list', 15) + ' 목록</button>' +
        '<input id="tTitle" class="inp" style="width:min(30vw,300px);height:32px;font-weight:700" maxlength="80" aria-label="수업 이름"></div>' +
        '<div class="hdr-r"><span class="chip">수업코드 <b style="font-size:16px;letter-spacing:.1em">' + esc(C.code) + '</b></span>' +
        '<button class="btn sm pri" id="bQr">' + ic('qr', 15) + ' 입장 안내</button>' +
        '<a class="btn sm" id="bView" target="_blank" rel="noopener" href="' + esc(joinUrl + '&view=1') + '">' + ic('monitor', 15) + ' 학생 화면 보기</a>' +
        '<button class="btn sm" id="bEnd"></button></div></header>' +
        '<div class="t-main"><section class="t-left">' +
        '<div class="mtabs" id="tTabs"></div>' +
        '<div class="bar">' +
        '<button class="btn icon" id="tTh" title="쪽 목록" aria-label="쪽 목록">' + ic('grid', 17) + '</button>' +
        '<button class="btn icon" id="tPrev" aria-label="이전 쪽">' + ic('chevL') + '</button>' +
        '<span class="pg"><input id="tPg" type="number" min="1" inputmode="numeric" aria-label="쪽 번호"> / <b id="tTot">0</b></span>' +
        '<button class="btn icon" id="tNext" aria-label="다음 쪽">' + ic('chevR') + '</button>' + zoomHtml() +
        '<button class="btn on" id="tPtr" title="학생 화면에 레이저 포인터 표시 (클릭하면 초록 표시)">' + ic('target', 16) + ' 포인터</button>' +
        '<button class="btn" id="tCopy" title="이 쪽의 글자를 모두 복사">' + ic('copy', 16) + ' <span class="lbl">이 쪽 글자 복사</span></button>' +
        '<span class="mode" id="tFn"></span></div>' +
        '<div class="stagebox"><div class="stage" id="tStage"><canvas id="tCv"></canvas><div class="empty" id="tEmpty">PDF 교안을 올려 주십시오. 파일을 이 화면에 끌어다 놓아도 됩니다. (PPT는 PDF로 저장해 올립니다)</div></div>' +
        '<div class="thumbs hide" id="tThumbs"></div><div class="hardbar hide" id="tHard"></div></div></section>' +
        '<aside class="t-right">' +
        '<div class="blk"><h3>' + ic('users', 15) + ' 학생 현황 <span class="muted" style="margin-left:auto;font-weight:400">이해도는 현재 쪽 기준</span></h3><div class="stat"><span class="pill usr">접속 <span id="stU">0</span>명</span>' +
        '<span class="pill got">이해 <span id="stG">0</span></span><span class="pill hard">어려움 <span id="stH">0</span></span>' +
        '<button class="btn sm" id="bSigR" title="현재 쪽의 이해도 신호를 모두 해제">' + ic('refresh', 14) + ' 이 쪽 초기화</button>' +
        '<button class="btn sm" id="bStat">' + ic('chart', 14) + ' 쪽별 집계</button></div>' +
        '<label class="chk"><input type="checkbox" id="tDl"> 학생 내려받기 허용 (PDF·첨부 자료)</label></div>' +
        '<div class="blk"><h3>' + ic('note', 15) + ' 노트 <span class="save" id="tSave" style="margin-left:auto"></span></h3>' +
        '<div class="tools" id="tools">' +
        '<button class="btn" data-c="bold" title="굵게"><b>B</b></button><button class="btn" data-c="italic" title="기울임"><i>I</i></button>' +
        '<button class="btn" data-c="underline" title="밑줄"><u>U</u></button><button class="btn" data-c="strikeThrough" title="취소선"><s>S</s></button><span class="gap"></span>' +
        '<button class="btn sw" data-fg="#dc2626" style="background:#dc2626" title="빨강" aria-label="빨강"></button><button class="btn sw" data-fg="#1A73E8" style="background:#1A73E8" title="파랑" aria-label="파랑"></button>' +
        '<button class="btn sw" data-fg="#16a34a" style="background:#16a34a" title="초록" aria-label="초록"></button><button class="btn sw" data-fg="#1f2937" style="background:#1f2937" title="검정" aria-label="검정"></button><span class="gap"></span>' +
        '<button class="btn sw" data-bg="#fef08a" style="background:#fef08a" title="노랑 형광펜" aria-label="노랑 형광펜"></button><button class="btn sw" data-bg="#bbf7d0" style="background:#bbf7d0" title="초록 형광펜" aria-label="초록 형광펜"></button>' +
        '<button class="btn sw" data-bg="#bfdbfe" style="background:#bfdbfe" title="파랑 형광펜" aria-label="파랑 형광펜"></button><span class="gap"></span>' +
        '<button class="btn" data-fs="3" title="보통">가</button><button class="btn" data-fs="5" title="크게" style="font-size:17px">가</button><button class="btn" data-fs="6" title="아주 크게" style="font-size:20px">가</button><span class="gap"></span>' +
        '<button class="btn" data-c="insertUnorderedList" title="글머리 목록">• 목록</button><button class="btn" data-c="insertOrderedList" title="번호 목록">1. 목록</button>' +
        '<button class="btn" data-c="removeFormat" title="서식 지우기">서식 해제</button>' +
        '<button class="btn pri" id="tBlk" title="선택한 글(또는 빈 칸)을 학생이 한 번에 복사하는 블록으로 만듭니다">' + ic('code', 15) + ' 복사 블록</button></div>' +
        '<div id="ed" contenteditable="true" spellcheck="false" role="textbox" aria-multiline="true" aria-label="수업 노트"></div></div>' +
        '<div class="blk"><h3>' + ic('link', 15) + ' 링크 보내기</h3>' +
        '<div class="fr"><input id="lT" class="inp" placeholder="이름 (선택)" maxlength="60"></div>' +
        '<div class="fr"><input id="lU" class="inp" placeholder="https://..." inputmode="url"><button class="btn pri" id="lB">' + ic('send', 15) + ' 보내기</button></div>' +
        '<ul class="tl-list" id="lL"></ul></div>' +
        '<div class="blk"><h3>' + ic('file', 15) + ' 첨부 자료 <label class="btn sm" for="tFile2" style="margin-left:auto">' + ic('plus', 14) + ' 파일 추가</label></h3>' +
        '<div class="muted">그림·문서·텍스트 파일 등(50MB 이하)을 올리면 학생이 내려받을 수 있습니다.</div><ul class="tl-list" id="fL"></ul></div>' +
        '</aside></div>' +
        '<input type="file" id="tFile" multiple class="hide"><input type="file" id="tFile2" multiple class="hide">' +
        '<div class="dropov hide" id="dropOv"><div>' + ic('upload', 40) + '<p>여기에 놓으면 올라갑니다</p><span>PDF는 수업 자료로, 그 밖의 파일은 첨부 자료로 올립니다</span></div></div></div>';

      var viewer = Viewer($('#tStage'), $('#tCv'));
      bindZoom($('.bar', root), viewer);
      var thumbs = Thumbs($('#tThumbs'), function (p) { goPage(p); });
      var ed = $('#ed'); ed.innerHTML = sanitize(R.note);
      var ui = { title: $('#tTitle'), pg: $('#tPg'), tot: $('#tTot'), empty: $('#tEmpty'), save: $('#tSave'), fn: $('#tFn'), tabs: $('#tTabs') };
      ui.title.value = R.title || '';
      $('#tDl').checked = C.dl;

      function matById(id) { for (var i = 0; i < C.mats.length; i++) if (C.mats[i].id === id) return C.mats[i]; return null; }
      function pdfs() { return C.mats.filter(function (m) { return m.kind === 'pdf'; }); }

      /* 서버 저장 (묶어서 전송, 실패 시 4초 뒤 재시도) */
      function persist(patch, delay) {
        Object.keys(patch).forEach(function (k) { C.pending[k] = patch[k]; });
        ui.save.textContent = '저장 중...'; ui.save.classList.remove('bad');
        clearTimeout(C.saveTimer); C.saveTimer = setTimeout(flush, delay == null ? 250 : delay);
      }
      function flush() {
        if (C.saving) { C.saveTimer = setTimeout(flush, 400); return Promise.resolve(); }
        var patch = C.pending; if (!Object.keys(patch).length) return Promise.resolve();
        C.pending = {}; C.saving = true;
        return call('wb_room_set', { p_code: C.code, p_patch: patch }).then(function () {
          C.saving = false; if (!Object.keys(C.pending).length) { ui.save.textContent = '저장됨'; ui.save.classList.remove('bad'); }
        }).catch(function () {
          C.saving = false; Object.keys(patch).forEach(function (k) { if (!(k in C.pending)) C.pending[k] = patch[k]; });
          ui.save.textContent = '저장 실패 · 다시 시도 중'; ui.save.classList.add('bad');
          clearTimeout(C.saveTimer); C.saveTimer = setTimeout(flush, 4000);
        });
      }
      window.addEventListener('beforeunload', function (e) { if (Object.keys(C.pending).length) { e.preventDefault(); e.returnValue = ''; } });

      /* 실시간 송신 */
      function send(p) { p.tk = C.tk; if (C.ch) C.ch.send({ type: 'broadcast', event: 'ev', payload: p }); }

      /* 자료 · 쪽 */
      function getDoc(m) {
        if (!C.docs[m.id]) C.docs[m.id] = loadPdf(m.url).catch(function (e) { delete C.docs[m.id]; throw e; });
        return C.docs[m.id];
      }
      function paintPage() {
        ui.pg.value = C.page; ui.tot.textContent = C.pages || 0;
        viewer.show(C.page); thumbs.mark(C.page, C.page); paintHard();
      }
      function showMat() {
        var m = matById(C.curMat);
        if (!m || m.kind !== 'pdf') { C.shown = null; C.pages = 0; viewer.clear(); thumbs.build(null); ui.empty.classList.remove('hide'); ui.fn.textContent = ''; paintPage(); renderTabs(); return; }
        ui.empty.classList.add('hide');
        ui.fn.textContent = m.name + ' · ' + m.pages + '쪽';
        if (C.shown !== m.id) {
          C.shown = m.id; var id = m.id;
          getDoc(m).then(function (d) {
            if (C.shown !== id) return;
            C.pages = d.numPages; viewer.setDoc(d); thumbs.build(d); paintPage();
          }).catch(function () { toast('자료를 불러오지 못했습니다. 다시 올려 주십시오.'); C.shown = null; });
        } else paintPage();
        renderTabs();
      }
      function openMat(id) {
        C.curMat = id; C.page = 1; C.pageTs = tsNow();
        showMat();
        send({ t: 'mat', mat: id, page: 1, ts: C.pageTs });
        persist({ cur_mat: id, page: 1, page_ts: C.pageTs }, 0);
        pollSig();
      }
      function goPage(p) {
        if (!C.pages) return;
        p = Math.max(1, Math.min(C.pages, p)); if (p === C.page) return;
        C.page = p; C.pageTs = tsNow(); paintPage();
        send({ t: 'page', mat: C.curMat, page: p, ts: C.pageTs });
        persist({ page: p, page_ts: C.pageTs }, 150);
        pollSig();
      }
      $('#tPrev').onclick = function () { goPage(C.page - 1); };
      $('#tNext').onclick = function () { goPage(C.page + 1); };
      ui.pg.onchange = function () { goPage(parseInt(ui.pg.value, 10) || C.page); };
      $('#tTh').onclick = function () { $('#tThumbs').classList.toggle('hide'); thumbs.mark(C.page, C.page); };
      $('#tCopy').onclick = function () { viewer.text().then(function (t) { copyText(t, '이 쪽의 글자를 복사했습니다.'); }); };
      document.addEventListener('keydown', function (e) {
        var t = e.target; if (t && (/INPUT|TEXTAREA/.test(t.tagName) || t.isContentEditable)) return;
        if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goPage(C.page + 1); }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goPage(C.page - 1); }
      });

      /* 자료 탭 (끌어서 순서 바꾸기, 숨김) */
      function renderTabs() {
        var ps = pdfs();
        ui.tabs.innerHTML = ps.map(function (m) {
          return '<button class="mt' + (m.id === C.curMat ? ' on' : '') + '" draggable="true" data-m="' + esc(m.id) + '" title="' + esc(m.name) + ' · 끌어서 순서 변경"><span>' + esc(m.name.replace(/\.pdf$/i, '')) + '</span><i class="x" data-rm="' + esc(m.id) + '" title="자료 숨기기">' + ic('x', 12) + '</i></button>';
        }).join('') + '<label class="btn sm addm" for="tFile">' + ic('plus', 14) + ' 자료 추가</label>';
        renderFiles();
      }
      function renderFiles() {
        var fs = C.mats.filter(function (m) { return m.kind === 'file'; });
        $('#fL').innerHTML = fs.length ? fs.map(function (m) {
          return '<li><span title="' + esc(m.name) + '">' + esc(m.name) + ' · ' + sizeText(m.size) + '</span><a class="btn sm" href="' + esc(dlUrl(m)) + '" download>' + ic('download', 13) + '</a><button class="btn sm red" data-rmf="' + esc(m.id) + '">삭제</button></li>';
        }).join('') : '<li class="muted">첨부한 파일이 없습니다.</li>';
      }
      function hideMat(id) {
        var m = matById(id); if (!m) return;
        if (!confirm('「' + m.name + '」을(를) 수업에서 제외하시겠습니까?')) return;
        call('wb_mat_patch', { p_code: C.code, p_id: id, p_patch: { hidden: true } }).then(function () {
          C.mats = C.mats.filter(function (x) { return x.id !== id; });
          if (C.curMat === id) { var nx = pdfs()[0]; if (nx) openMat(nx.id); else { C.curMat = null; showMat(); } }
          else renderTabs();
          send({ t: 'doc' });
        }).catch(function (e) { toast('처리하지 못했습니다: ' + e.message); });
      }
      ui.tabs.addEventListener('click', function (e) {
        var x = e.target.closest('[data-rm]'); if (x) { e.preventDefault(); e.stopPropagation(); hideMat(x.getAttribute('data-rm')); return; }
        var b = e.target.closest('.mt'); if (b && b.getAttribute('data-m') !== C.curMat) openMat(b.getAttribute('data-m'));
      });
      $('#fL').addEventListener('click', function (e) { var b = e.target.closest('[data-rmf]'); if (b) hideMat(b.getAttribute('data-rmf')); });
      var dragId = null;
      ui.tabs.addEventListener('dragstart', function (e) { var b = e.target.closest('.mt'); if (!b) return; dragId = b.getAttribute('data-m'); e.dataTransfer.setData('text/wb-tab', dragId); e.dataTransfer.effectAllowed = 'move'; });
      ui.tabs.addEventListener('dragover', function (e) { if (dragId && e.target.closest('.mt')) e.preventDefault(); });
      ui.tabs.addEventListener('drop', function (e) {
        var b = e.target.closest('.mt'); if (!dragId || !b) return;
        e.preventDefault(); e.stopPropagation();
        var to = b.getAttribute('data-m'); if (to === dragId) { dragId = null; return; }
        var ps = pdfs(), from = ps.filter(function (m) { return m.id === dragId; })[0], at = ps.map(function (m) { return m.id; }).indexOf(to);
        ps = ps.filter(function (m) { return m.id !== dragId; }); ps.splice(at, 0, from);
        C.mats = ps.concat(C.mats.filter(function (m) { return m.kind !== 'pdf'; })); dragId = null;
        renderTabs();
        call('wb_mat_order', { p_code: C.code, p_ids: C.mats.map(function (m) { return m.id; }) }).then(function () { send({ t: 'doc' }); }).catch(function () {});
      });
      ui.tabs.addEventListener('dragend', function () { dragId = null; });

      /* 파일 올리기 (선택·끌어서 놓기 공통) */
      function uploadOne(f) {
        var ext = (f.name.match(/\.[A-Za-z0-9]+$/) || [''])[0].toLowerCase(), mime = MIME[ext];
        if (!mime) { toast('올릴 수 없는 형식입니다: ' + f.name); return Promise.resolve(); }
        if (f.size > MAX_BYTES) { toast('50MB 이하 파일만 올릴 수 있습니다: ' + f.name); return Promise.resolve(); }
        var isPdf = ext === '.pdf';
        toast('올리는 중: ' + f.name + ' (' + sizeText(f.size) + ')', null, null, 2500);
        var path = rid(16) + ext;
        return sb.storage.from(BUCKET).upload(path, f, { contentType: mime, upsert: false }).then(function (res) {
          if (res.error) throw res.error;
          var url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          return (isPdf ? loadPdf(url).then(function (d) { return d.numPages; }) : Promise.resolve(0)).then(function (pages) {
            return call('wb_mat_add', { p_code: C.code, p_kind: isPdf ? 'pdf' : 'file', p_name: f.name, p_url: url, p_size: f.size, p_pages: pages }).then(function (r) {
              C.mats.push({ id: r.id, kind: isPdf ? 'pdf' : 'file', name: f.name, url: url, size: f.size, pages: pages });
              if (isPdf && !C.curMat) { C.curMat = r.id; C.page = 1; C.pageTs = tsNow(); showMat(); send({ t: 'mat', mat: r.id, page: 1, ts: C.pageTs }); persist({ page: 1, page_ts: C.pageTs }, 0); }
              else renderTabs();
              if (ext === '.pptx' || ext === '.ppt') toast('PPT 파일은 화면에 표시되지 않아 첨부 자료로 올렸습니다. 화면으로 보려면 PDF로 저장해 올려 주십시오.', null, null, 6000);
              else toast('올렸습니다: ' + f.name);
            });
          });
        }).catch(function (e) { toast('올리지 못했습니다: ' + f.name + ' (' + (e.message || e) + ')'); });
      }
      function handleFiles(list) {
        var files = Array.prototype.slice.call(list || []).sort(function (a, b) { return a.name.localeCompare(b.name, 'ko', { numeric: true }); });
        if (!files.length) return;
        var chain = Promise.resolve();
        files.forEach(function (f) { chain = chain.then(function () { return uploadOne(f); }); });
        chain.then(function () { send({ t: 'doc' }); });
      }
      $('#tFile').onchange = function () { var l = this.files; handleFiles(l); this.value = ''; };
      $('#tFile2').onchange = function () { var l = this.files; handleFiles(l); this.value = ''; };
      var ov = $('#dropOv');
      function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
      window.addEventListener('dragenter', function (e) { if (hasFiles(e)) { e.preventDefault(); ov.classList.remove('hide'); } });
      window.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
      ov.addEventListener('dragleave', function (e) { if (e.target === ov) ov.classList.add('hide'); });
      window.addEventListener('drop', function (e) { if (hasFiles(e)) { e.preventDefault(); ov.classList.add('hide'); handleFiles(e.dataTransfer.files); } });

      /* 노트 편집기 */
      var noteBackup = 'wb_note_' + C.code;
      function emitNote() {
        var html = ed.innerHTML; C.noteTs = tsNow();
        send({ t: 'note', html: html, ts: C.noteTs });
        store(noteBackup, html);
        persist({ note: html, note_ts: C.noteTs }, 1200);
      }
      var nTimer = null, nLast = 0;
      ed.addEventListener('input', function () {
        var now = Date.now();
        if (now - nLast > 200) { nLast = now; emitNote(); }
        else { clearTimeout(nTimer); nTimer = setTimeout(function () { nLast = Date.now(); emitNote(); }, 200); }
      });
      ed.addEventListener('paste', function (e) {
        var h = e.clipboardData && e.clipboardData.getData('text/html');
        e.preventDefault();
        if (h) document.execCommand('insertHTML', false, sanitize(h));
        else document.execCommand('insertText', false, (e.clipboardData && e.clipboardData.getData('text/plain')) || '');
      });
      document.execCommand('styleWithCSS', false, true);
      $('#tools').addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
      $('#tools').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        ed.focus();
        if (b.id === 'tBlk') {
          var sel = window.getSelection(), html = '프롬프트를 여기에 입력하세요';
          if (sel.rangeCount && !sel.isCollapsed) { var d = document.createElement('div'); d.appendChild(sel.getRangeAt(0).cloneContents()); html = d.innerHTML; }
          document.execCommand('insertHTML', false, '<div class="cpb">' + html + '</div><div><br></div>');
        } else if (b.dataset.c) document.execCommand(b.dataset.c, false, null);
        else if (b.dataset.fg) document.execCommand('foreColor', false, b.dataset.fg);
        else if (b.dataset.bg) document.execCommand('hiliteColor', false, b.dataset.bg);
        else if (b.dataset.fs) document.execCommand('fontSize', false, b.dataset.fs);
        emitNote();
      });

      /* 링크 보내기 */
      function paintLinks() {
        $('#lL').innerHTML = C.links.slice().reverse().map(function (l) {
          return '<li><span title="' + esc(l.u) + '"><b>' + esc(l.t) + '</b> · ' + esc(l.u) + '</span><button class="btn sm red" data-rm="' + esc(l.id) + '">삭제</button></li>';
        }).join('');
        $$('#lL [data-rm]').forEach(function (b) {
          b.onclick = function () {
            C.links = C.links.filter(function (l) { return l.id !== b.getAttribute('data-rm'); }); paintLinks();
            persist({ links: C.links }, 0); Promise.resolve(flush()).then(function () { send({ t: 'links' }); });
          };
        });
      }
      paintLinks();
      function pushLink() {
        var u = $('#lU').value.trim(); if (!u) return;
        if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u;
        if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(u)) { toast('올바른 주소를 입력해 주십시오.'); return; }
        var t = $('#lT').value.trim(); if (!t) { try { t = new URL(u).hostname.replace(/^www\./, ''); } catch (e) { t = u; } }
        var l = { id: rid(5), t: t, u: u, ts: Date.now() };
        C.links.push(l); paintLinks(); $('#lU').value = ''; $('#lT').value = '';
        persist({ links: C.links }, 0);
        Promise.resolve(flush()).then(function () { send({ t: 'link', link: l }); toast('학생 화면으로 보냈습니다.'); });
      }
      $('#lB').onclick = pushLink;
      $('#lU').onkeydown = function (e) { if (e.key === 'Enter') pushLink(); };

      /* 제목 · 내려받기 허용 · 종료 */
      ui.title.onchange = function () { persist({ title: ui.title.value }, 0); };
      $('#tDl').onchange = function () { C.dl = this.checked; persist({ dl: C.dl }, 0); Promise.resolve(flush()).then(function () { send({ t: 'doc' }); }); };
      function paintEnd() { $('#bEnd').innerHTML = C.active ? ic('stop', 14) + ' 수업 종료' : ic('play', 14) + ' 수업 다시 열기'; }
      paintEnd();
      $('#bEnd').onclick = function () {
        if (C.active && !confirm('수업을 종료하시겠습니까? 학생 화면에 종료 안내가 표시됩니다. (자료와 노트는 보관됩니다)')) return;
        C.active = !C.active; paintEnd(); persist({ active: C.active }, 0); Promise.resolve(flush()).then(function () { send({ t: 'end' }); });
      };
      $('#bList').onclick = function () { if (C.ch) sb.removeChannel(C.ch); clearInterval(C.sigTimer); location.href = base + '?mode=teacher'; };

      /* 입장 안내 (QR) */
      $('#bQr').onclick = function () {
        var qr = qrcode(0, 'M'); qr.addData(joinUrl); qr.make();
        var o = document.createElement('div'); o.className = 'qrov';
        o.innerHTML = '<button class="btn x" aria-label="닫기">' + ic('x', 18) + ' 닫기</button><div class="muted" style="font-size:min(3.4vmin,26px)">휴대폰 카메라로 QR을 찍거나, 아래 주소에서 수업 코드를 입력하십시오.</div>' +
          '<div class="qr">' + qr.createSvgTag({ scalable: true, margin: 2 }) + '</div><div class="big">' + esc(C.code) + '</div>' +
          '<div class="url">' + esc(base) + '</div>';
        document.body.appendChild(o);
        function close() { o.remove(); document.removeEventListener('keydown', onk); }
        function onk(e) { if (e.key === 'Escape') close(); }
        o.onclick = close; document.addEventListener('keydown', onk);
      };

      /* 포인터: 마우스를 움직이면 학생 화면에 레이저 점, 클릭하면 초록 표시 */
      $('#tPtr').onclick = function () { C.ptrOn = !C.ptrOn; this.classList.toggle('on', C.ptrOn); if (!C.ptrOn) send({ t: 'ptr', on: 0, m: C.curMat, p: C.page, x: 0, y: 0 }); };
      var pLast = 0, pw = viewer.wrap;
      pw.addEventListener('mousemove', function (e) {
        if (!C.ptrOn || !C.curMat) return;
        var now = Date.now(); if (now - pLast < 70) return; pLast = now;
        var q = viewer.norm(e); send({ t: 'ptr', on: 1, m: C.curMat, p: C.page, x: q.x, y: q.y });
      });
      pw.addEventListener('mouseleave', function () { if (C.ptrOn) send({ t: 'ptr', on: 0, m: C.curMat, p: C.page, x: 0, y: 0 }); });
      pw.addEventListener('click', function (e) {
        if (!C.ptrOn || !C.curMat || String(window.getSelection()).length) return;
        var q = viewer.norm(e); viewer.ripple(q.x, q.y); send({ t: 'clk', m: C.curMat, p: C.page, x: q.x, y: q.y });
      });

      /* 이해도 현황 · 어려움 경고 */
      function paintHard() {
        var h = C.H.hard, bar = $('#tHard');
        $('#stG').textContent = C.H.got; $('#stH').textContent = h;
        if (h < 1) { bar.classList.add('hide'); C.lastHard = 0; thumbs.badges(hardMap()); return; }
        var strong = h >= 3 || (C.users > 0 && h / C.users >= 0.1);
        bar.className = 'hardbar ' + (strong ? 'strong' : 'mild');
        bar.innerHTML = ic('alert', 18) + ' <b>어려움 존재</b> · 이 쪽에서 ' + h + '명이 어렵다고 표시했습니다' + (strong && C.users ? ' (접속 ' + C.users + '명 중 ' + Math.round(h / C.users * 100) + '%)' : '') + (strong ? ' — 설명을 더 하시는 것이 좋습니다' : '');
        if (h > C.lastHard) { bar.classList.remove('pulse'); void bar.offsetWidth; bar.classList.add('pulse'); }
        C.lastHard = h;
        thumbs.badges(hardMap());
      }
      function hardMap() {
        var m = {}; C.H.pages.forEach(function (r) { if (r.m === C.curMat && r.h > 0) m[r.p] = r.h; }); return m;
      }
      var sigBusy = false;
      function pollSig() {
        if (!C.curMat || sigBusy) return;
        sigBusy = true;
        call('wb_sigp_get', { p_code: C.code, p_mat: C.curMat, p_page: C.page }).then(function (r) {
          sigBusy = false; C.H = { hard: r.hard, got: r.got, pages: r.pages || [] }; paintHard();
        }).catch(function () { sigBusy = false; });
      }
      C.sigTimer = setInterval(pollSig, 3000); pollSig();
      $('#bSigR').onclick = function () {
        if (!C.curMat) return;
        var m = C.curMat, p = C.page;
        call('wb_sigp_reset', { p_code: C.code, p_mat: m, p_page: p }).then(function () { send({ t: 'sigreset', m: m, p: p }); pollSig(); toast('이 쪽의 이해도 신호를 초기화했습니다.'); }).catch(function () {});
      };
      /* 쪽별 집계 표 + 텍스트 저장 */
      $('#bStat').onclick = function () {
        call('wb_sigp_get', { p_code: C.code, p_mat: C.curMat || '-', p_page: C.page }).then(function (r) {
          var order = C.mats.map(function (m) { return m.id; });
          var rows = (r.pages || []).filter(function (x) { return x.g + x.h > 0; }).sort(function (a, b) { return (b.h - a.h) || (order.indexOf(a.m) - order.indexOf(b.m)) || (a.p - b.p); });
          var name = function (id) { var m = matById(id); return m ? m.name.replace(/\.pdf$/i, '') : '(제외된 자료)'; };
          var o = document.createElement('div'); o.className = 'modal';
          o.innerHTML = '<div class="mbox card"><div class="mh"><b>쪽별 이해도 집계</b><button class="btn sm icon" data-x aria-label="닫기">' + ic('x', 16) + '</button></div><div class="mb">' +
            (rows.length ? '<table class="stt"><thead><tr><th>자료</th><th>쪽</th><th>어려움</th><th>이해</th></tr></thead><tbody>' + rows.map(function (x) {
              return '<tr' + (x.h >= 3 ? ' class="hot"' : '') + '><td>' + esc(name(x.m)) + '</td><td>' + x.p + '</td><td>' + x.h + '</td><td>' + x.g + '</td></tr>';
            }).join('') + '</tbody></table>' : '<p class="muted">아직 기록된 신호가 없습니다.</p>') +
            '</div><div class="mf"><button class="btn pri" data-dl' + (rows.length ? '' : ' disabled') + '>' + ic('download', 15) + ' 텍스트로 저장</button></div></div>';
          document.body.appendChild(o);
          o.onclick = function (e) { if (e.target === o || e.target.closest('[data-x]')) o.remove(); };
          var dl = $('[data-dl]', o);
          if (dl) dl.onclick = function () {
            saveText('쪽별이해도_' + C.code + '.txt', '[' + (ui.title.value || '수업') + '] 수업코드 ' + C.code + ' 쪽별 이해도 (학생 이름은 저장하지 않고 인원수만 기록합니다)\n\n' +
              rows.map(function (x) { return name(x.m) + ' ' + x.p + '쪽 — 어려움 ' + x.h + '명 / 이해 ' + x.g + '명'; }).join('\n'));
          };
        }).catch(function () { toast('집계를 불러오지 못했습니다.'); });
      };

      /* 실시간 연결 */
      var ch = sb.channel('wb-' + C.code, { config: { broadcast: { self: false }, presence: { key: 't-' + rid(4) } } });
      C.ch = ch;
      var sTimer = null;
      ch.on('broadcast', { event: 'sig' }, function () { clearTimeout(sTimer); sTimer = setTimeout(pollSig, 250); });
      ch.on('presence', { event: 'sync' }, function () {
        var st = ch.presenceState(), n = 0;
        Object.keys(st).forEach(function (k) { if (st[k].some(function (m) { return m.role === 's'; })) n++; });
        C.users = n; $('#stU').textContent = n; paintHard();
      });
      ch.subscribe(function (s) { if (s === 'SUBSCRIBED') ch.track({ role: 't' }); });

      showMat();
    }

    /* 시작 */
    if (T.token) {
      rpc('wb_check', { p_token: T.token }).then(function (ok) { ok ? list() : login(); }).catch(function () { login(); });
    } else login();
  }

  boot();
})();
