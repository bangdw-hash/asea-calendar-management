'use strict';
/**
 * whiteboard.js — 실시간 수업 노트
 *  · 학생 화면(?r=수업코드) / 교수자 화면(?mode=teacher) / 입장 화면(파라미터 없음)
 *  · 서버: Supabase wbd 스키마 + public.wb_* RPC (db/whiteboard_schema.sql), 실시간은 Broadcast + 4초 폴링 백업
 *  · PDF 교안은 Storage 버킷 wb-files, 화면 표시는 PDF.js
 */
(function () {
  var SUPA_URL = 'https://zbpeyklwpotjyveipzxd.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV5a2x3cG90anl2ZWlwenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTYxMDcsImV4cCI6MjA5NzA5MjEwN30.6JgoQ6rPRnmrbBTG68A-Y9HDQk40mnwubhXVnkZvHrQ';
  var BUCKET = 'wb-files';
  var POLL_MS = 4000;
  var TOKEN_KEY = 'wb_token';

  var sb = window.supabase.createClient(SUPA_URL, SUPA_KEY, { realtime: { params: { eventsPerSecond: 20 } } });
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
    play: '<path d="m6 3 14 9-14 9z"/>',
    stop: '<rect width="14" height="14" x="5" y="5" rx="1"/>'
  };
  function ic(n, sz) {
    sz = sz || 18;
    return '<svg class="ic" width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>';
  }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rid(n) { var a = new Uint8Array(n || 8); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; }); return Array.prototype.map.call(a, function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
  var lastTs = 0;
  function tsNow() { lastTs = Math.max(lastTs + 1, Date.now()); return lastTs; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }

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
        if (!OK_TAGS[t]) { walk(n, dst); return; }
        var c = document.createElement(t.toLowerCase());
        var st = cleanStyle(n.getAttribute('style')); if (st) c.setAttribute('style', st);
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

  /* ───────────── PDF 뷰어 (현재 쪽을 영역에 맞춰 그림) ───────────── */
  function Viewer(box, canvas) {
    var doc = null, n = 1, seq = 0, task = null;
    function draw() {
      if (!doc) return;
      var my = ++seq, pageNo = Math.min(Math.max(n, 1), doc.numPages);
      doc.getPage(pageNo).then(function (pg) {
        if (my !== seq) return;
        var w = box.clientWidth - 16, h = box.clientHeight - 16;
        if (w < 50 || h < 50) return;
        var v1 = pg.getViewport({ scale: 1 });
        var sc = Math.min(w / v1.width, h / v1.height);
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var vp = pg.getViewport({ scale: sc * dpr });
        var off = document.createElement('canvas'); off.width = Math.floor(vp.width); off.height = Math.floor(vp.height);
        if (task) { try { task.cancel(); } catch (e) {} }
        task = pg.render({ canvasContext: off.getContext('2d'), viewport: vp });
        task.promise.then(function () {
          if (my !== seq) return;
          canvas.width = off.width; canvas.height = off.height;
          canvas.style.width = (off.width / dpr) + 'px'; canvas.style.height = (off.height / dpr) + 'px';
          canvas.getContext('2d').drawImage(off, 0, 0);
        }).catch(function () {});
      }).catch(function () {});
    }
    var rt = null;
    if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(draw, 120); }).observe(box);
    else window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(draw, 120); });
    return {
      setDoc: function (d) { doc = d; draw(); },
      show: function (p) { n = p; draw(); },
      clear: function () { doc = null; seq++; canvas.width = canvas.height = 0; canvas.style.width = canvas.style.height = '0'; }
    };
  }
  function loadPdf(url) { return window.pdfjsLib.getDocument({ url: url }).promise; }

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
      code: code, ver: null, tkHash: null, tkOk: null, follow: true, cur: 1, tPage: 1, pageTs: 0, noteTs: 0,
      saved: null, pages: 0, docUrl: null, doc: null, seen: {}, links: [], sig: 0, rt: false, pollOk: true, ended: false, noteHtml: ''
    };
    var cid = store('wb_cid'); if (!cid || cid.length < 8) { cid = rid(10); store('wb_cid', cid); }
    S.sig = parseInt(store('wb_sig_' + code) || '0', 10) || 0;

    document.title = '수업 ' + code;
    document.body.classList.toggle('beam', !!beam);
    root.innerHTML =
      '<div class="s-app">' +
      '<header class="hdr"><div class="hdr-l"><span class="brand">실시간 수업 노트</span><span class="ttl" id="sTitle"></span></div>' +
      '<div class="hdr-r"><span class="chip">수업코드 <b>' + esc(code) + '</b></span><span class="conn" id="sConn"><i class="dot"></i><span>연결 중</span></span></div></header>' +
      '<div class="s-main"><section class="s-doc">' +
      '<div class="bar" id="sBar">' +
      '<button class="btn icon" id="sPrev" aria-label="이전 쪽">' + ic('chevL') + '</button>' +
      '<span class="pg"><input id="sPg" type="number" min="1" inputmode="numeric" aria-label="쪽 번호"> / <b id="sTot">0</b></span>' +
      '<button class="btn icon" id="sNext" aria-label="다음 쪽">' + ic('chevR') + '</button>' +
      '<button class="btn pri hide" id="sToT">' + ic('monitor', 16) + ' <span>교수 화면으로 돌아가기</span></button>' +
      '<button class="btn hide" id="sToMine">' + ic('back', 16) + ' <span></span></button>' +
      '<button class="btn hide" id="sFree">' + ic('users', 16) + ' 내 속도로 보기</button>' +
      '<span class="mode" id="sMode"></span></div>' +
      '<div class="stage" id="sStage"><canvas id="sCv"></canvas><div class="empty" id="sEmpty">교수자가 자료를 올리면 이곳에 표시됩니다.</div></div>' +
      '</section>' +
      '<aside class="s-side">' +
      '<div class="sec grow"><h3>' + ic('note', 15) + ' 노트</h3><div class="body"><div class="noteBox"></div></div></div>' +
      '<div class="sec"><h3>' + ic('link', 15) + ' 링크</h3><div class="body" style="max-height:30vh"><ul class="linkList"></ul></div></div>' +
      '<div class="sec sg"><h3>' + ic('help', 15) + ' 이해도 신호</h3><div class="sig">' +
      '<button class="btn sg-got" data-v="1">' + ic('check', 16) + ' 이해했어요</button>' +
      '<button class="btn sg-hard" data-v="2">' + ic('help', 16) + ' 어려워요</button></div></div>' +
      '</aside></div>' +
      '<nav class="s-tabs"><button class="btn" id="tNote">' + ic('note', 16) + ' 노트<i class="badge hide" id="bNote"></i></button>' +
      '<button class="btn" id="tLink">' + ic('link', 16) + ' 링크<i class="badge hide" id="bLink"></i></button>' +
      '<button class="btn sg-got" data-v="1">' + ic('check', 16) + ' 이해</button>' +
      '<button class="btn sg-hard" data-v="2">' + ic('help', 16) + ' 어려움</button></nav>' +
      '<div class="sheet" id="shNote"><div class="sh-h"><span>노트</span><button class="btn sm icon" data-close aria-label="닫기">' + ic('x', 16) + '</button></div><div class="sh-b"><div class="noteBox"></div></div></div>' +
      '<div class="sheet" id="shLink"><div class="sh-h"><span>링크</span><button class="btn sm icon" data-close aria-label="닫기">' + ic('x', 16) + '</button></div><div class="sh-b"><ul class="linkList"></ul></div></div>' +
      '</div>';

    var viewer = Viewer($('#sStage'), $('#sCv'));
    var ids = {
      prev: $('#sPrev'), next: $('#sNext'), pg: $('#sPg'), tot: $('#sTot'), toT: $('#sToT'), toMine: $('#sToMine'),
      free: $('#sFree'), mode: $('#sMode'), empty: $('#sEmpty'), conn: $('#sConn'), title: $('#sTitle')
    };

    function showPage() {
      var p = Math.max(1, S.pages ? Math.min(S.cur, S.pages) : S.cur);
      ids.pg.value = p; ids.tot.textContent = S.pages || 0;
      viewer.show(p);
      var behind = S.tPage !== S.cur;
      ids.toT.classList.toggle('hide', S.follow || beam);
      $('span', ids.toT).textContent = '교수 화면으로 돌아가기 (' + S.tPage + '쪽)';
      var showMine = S.follow && S.saved != null && S.saved !== S.tPage && !beam;
      ids.toMine.classList.toggle('hide', !showMine);
      if (showMine) $('span', ids.toMine).textContent = '내가 보던 ' + S.saved + '쪽으로 돌아가기';
      ids.free.classList.toggle('hide', !S.follow || beam);
      ids.mode.className = 'mode ' + (S.follow ? 'follow' : 'free');
      ids.mode.innerHTML = S.follow ? '<b>교수자 화면을 따라가는 중</b>' : '<b>내 속도로 보는 중</b> · 교수자는 ' + S.tPage + '쪽' + (behind ? '' : '');
    }
    function moveOwn(p) {
      if (!S.pages || beam) return;
      p = Math.max(1, Math.min(S.pages, p));
      S.follow = false; S.cur = p; showPage();
    }
    ids.prev.onclick = function () { moveOwn(S.cur - 1); };
    ids.next.onclick = function () { moveOwn(S.cur + 1); };
    ids.pg.onchange = function () { moveOwn(parseInt(ids.pg.value, 10) || S.cur); };
    ids.free.onclick = function () { S.follow = false; showPage(); };
    ids.toT.onclick = function () { S.saved = S.cur; S.follow = true; S.cur = S.tPage; showPage(); };
    ids.toMine.onclick = function () { S.follow = false; S.cur = S.saved; S.saved = null; showPage(); };
    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') moveOwn(S.cur + 1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') moveOwn(S.cur - 1);
    });

    /* 노트 · 링크 표시 */
    function setNote(html) {
      S.noteHtml = sanitize(html);
      $$('.noteBox').forEach(function (b) { b.innerHTML = S.noteHtml; });
    }
    function renderLinks() {
      var h = S.links.slice().reverse().map(function (l) {
        var isNew = !S.opened || !S.opened[l.id];
        return '<li><a class="lk' + (isNew ? ' new' : '') + '" href="' + esc(l.u) + '" target="_blank" rel="noopener noreferrer" data-id="' + esc(l.id) + '">' +
          '<span class="lt">' + esc(l.t) + '<span class="lu">' + esc(l.u) + '</span></span>' + ic('ext', 16) + '</a></li>';
      }).join('');
      $$('.linkList').forEach(function (u) { u.innerHTML = h; });
    }
    S.opened = {};
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a.lk'); if (a) { S.opened[a.getAttribute('data-id')] = 1; a.classList.remove('new'); }
    });
    function addLinks(list, quiet) {
      var fresh = [];
      list.forEach(function (l) { if (!S.seen[l.id]) { S.seen[l.id] = 1; fresh.push(l); } });
      S.links = list.slice();
      renderLinks();
      if (fresh.length && !quiet) {
        var l = fresh[fresh.length - 1];
        $('#bLink').classList.remove('hide');
        toast('새 링크: ' + l.t, '열기', function () { S.opened[l.id] = 1; window.open(l.u, '_blank', 'noopener'); renderLinks(); });
      }
    }
    function sheet(id, open) {
      $$('.sheet').forEach(function (s) { s.classList.remove('open'); });
      if (open) { $(id).classList.add('open'); if (id === '#shNote') $('#bNote').classList.add('hide'); if (id === '#shLink') $('#bLink').classList.add('hide'); }
    }
    $('#tNote').onclick = function () { sheet('#shNote', !$('#shNote').classList.contains('open')); };
    $('#tLink').onclick = function () { sheet('#shLink', !$('#shLink').classList.contains('open')); };
    $$('[data-close]').forEach(function (b) { b.onclick = function () { sheet(null, false); }; });

    /* 이해도 신호 */
    function paintSig() {
      $$('.sg-got').forEach(function (b) { b.classList.toggle('on', S.sig === 1); b.classList.toggle('got', true); });
      $$('.sg-hard').forEach(function (b) { b.classList.toggle('on', S.sig === 2); b.classList.toggle('hard', true); });
    }
    $$('[data-v]').forEach(function (b) {
      b.onclick = function () {
        var v = parseInt(b.getAttribute('data-v'), 10);
        var nv = S.sig === v ? 0 : v;
        var old = S.sig; S.sig = nv; paintSig();
        rpc('wb_sig', { p_code: code, p_cid: cid, p_val: nv }).then(function () {
          store('wb_sig_' + code, String(nv));
          if (S.ch) S.ch.send({ type: 'broadcast', event: 'sig', payload: { c: cid } });
        }).catch(function () { S.sig = old; paintSig(); toast('전송하지 못했습니다. 연결을 확인해 주십시오.'); });
      };
    });
    paintSig();

    /* 서버 상태 반영 */
    function applyRoom(r) {
      if (!r || r.ok === false) {
        ids.empty.classList.remove('hide'); ids.empty.textContent = '수업 코드 ' + code + '번 수업을 찾을 수 없습니다. 코드를 다시 확인해 주십시오.';
        return;
      }
      if (r.same) return;
      S.ver = r.ver; S.tkHash = r.tk_hash || S.tkHash;
      ids.title.textContent = r.title || '';
      document.title = (r.title ? r.title + ' · ' : '') + '수업 ' + code;
      S.ended = r.active === false;
      if (S.ended) ids.empty.textContent = '수업이 종료되었습니다.';
      S.pages = r.pages || 0;
      if (r.pdf_url && r.pdf_url !== S.docUrl) {
        S.docUrl = r.pdf_url; ids.empty.classList.add('hide');
        loadPdf(r.pdf_url).then(function (d) { S.doc = d; S.pages = d.numPages; viewer.setDoc(d); showPage(); })
          .catch(function () { ids.empty.classList.remove('hide'); ids.empty.textContent = '자료를 불러오지 못했습니다. 잠시 후 다시 시도합니다.'; S.docUrl = null; });
      }
      if (!r.pdf_url) { ids.empty.classList.remove('hide'); ids.empty.textContent = S.ended ? '수업이 종료되었습니다.' : '교수자가 자료를 올리면 이곳에 표시됩니다.'; viewer.clear(); S.docUrl = null; }
      if ((r.page_ts || 0) >= S.pageTs) setTeacherPage(r.page, r.page_ts || 0, true);
      if ((r.note_ts || 0) >= S.noteTs && sanitize(r.note) !== S.noteHtml) { S.noteTs = r.note_ts || 0; setNote(r.note); }
      addLinks(r.links || [], !S.firstDone);
      S.firstDone = true;
      showPage();
    }
    function setTeacherPage(p, ts, quiet) {
      var moved = p !== S.tPage;
      S.tPage = p; S.pageTs = ts;
      if (S.follow) S.cur = p;
      else if (moved && !quiet) toast('교수자가 ' + p + '쪽으로 이동했습니다.', '따라가기', function () { ids.toT.click(); });
      showPage();
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
    function onEvent(m) {
      var p = m && m.payload; if (!p || !p.tk || !S.tkHash) return;
      sha256(p.tk).then(function (h) {
        if (!h || h !== S.tkHash) return;
        if (p.t === 'page') { if (p.ts >= S.pageTs) setTeacherPage(p.page, p.ts, false); }
        else if (p.t === 'note') { if (p.ts >= S.noteTs) { S.noteTs = p.ts; setNote(p.html); if (!$('#shNote').classList.contains('open')) $('#bNote').classList.remove('hide'); } }
        else if (p.t === 'link') { var l = S.links.filter(function (x) { return x.id === p.link.id; }); if (!l.length) addLinks(S.links.concat([p.link]), false); }
        else if (p.t === 'sigreset') { S.sig = 0; store('wb_sig_' + code, '0'); paintSig(); }
        else if (p.t === 'doc' || p.t === 'links' || p.t === 'end') { S.ver = null; poll(); }
      });
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
        '<div class="land"><div class="box card"><h1>교수자 로그인</h1><p>상장 출력기 관리자 비밀번호와 동일합니다.</p>' +
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
        code: R.code, tk: R.tk, page: R.page || 1, pageTs: R.page_ts || 0, pages: R.pages || 0, pdfUrl: R.pdf_url, pdfName: R.pdf_name,
        noteTs: R.note_ts || 0, links: R.links || [], active: R.active !== false, pending: {}, saving: false, dirtyAt: 0, doc: null, users: 0, ch: null
      };
      var base = location.origin + location.pathname;
      var joinUrl = base + '?r=' + C.code;
      document.title = '[' + C.code + '] ' + (R.title || '') + ' · 교수자';

      root.innerHTML =
        '<div class="t-app"><header class="hdr"><div class="hdr-l"><button class="btn sm" id="bList">' + ic('list', 15) + ' 목록</button>' +
        '<input id="tTitle" class="inp" style="width:min(36vw,320px);height:32px;font-weight:700" maxlength="80" aria-label="수업 이름"></div>' +
        '<div class="hdr-r"><span class="chip">수업코드 <b style="font-size:16px;letter-spacing:.1em">' + esc(C.code) + '</b></span>' +
        '<button class="btn sm pri" id="bQr">' + ic('qr', 15) + ' 입장 안내</button>' +
        '<a class="btn sm" id="bView" target="_blank" rel="noopener" href="' + esc(joinUrl + '&view=1') + '">' + ic('monitor', 15) + ' 학생 화면 보기</a>' +
        '<button class="btn sm" id="bEnd"></button></div></header>' +
        '<div class="t-main"><section class="t-left"><div class="bar">' +
        '<button class="btn icon" id="tPrev" aria-label="이전 쪽">' + ic('chevL') + '</button>' +
        '<span class="pg"><input id="tPg" type="number" min="1" inputmode="numeric" aria-label="쪽 번호"> / <b id="tTot">0</b></span>' +
        '<button class="btn icon" id="tNext" aria-label="다음 쪽">' + ic('chevR') + '</button>' +
        '<label class="btn" for="tFile">' + ic('upload', 16) + ' PDF 올리기</label><input type="file" id="tFile" accept="application/pdf" class="hide">' +
        '<span class="mode" id="tFn"></span></div>' +
        '<div class="stage" id="tStage"><canvas id="tCv"></canvas><div class="empty" id="tEmpty">PDF 교안을 올려 주십시오. (PPT는 PDF로 저장해 올립니다)</div></div></section>' +
        '<aside class="t-right">' +
        '<div class="blk"><h3>' + ic('users', 15) + ' 학생 현황</h3><div class="stat"><span class="pill usr">접속 <span id="stU">0</span>명</span>' +
        '<span class="pill got">이해 <span id="stG">0</span></span><span class="pill hard">어려움 <span id="stH">0</span></span>' +
        '<button class="btn sm" id="bSigR">' + ic('refresh', 14) + ' 초기화</button></div></div>' +
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
        '<button class="btn" data-c="removeFormat" title="서식 지우기">서식 해제</button></div>' +
        '<div id="ed" contenteditable="true" spellcheck="false" role="textbox" aria-multiline="true" aria-label="수업 노트"></div></div>' +
        '<div class="blk"><h3>' + ic('link', 15) + ' 링크 보내기</h3>' +
        '<div class="fr"><input id="lT" class="inp" placeholder="이름 (선택)" maxlength="60"></div>' +
        '<div class="fr"><input id="lU" class="inp" placeholder="https://..." inputmode="url"><button class="btn pri" id="lB">' + ic('send', 15) + ' 보내기</button></div>' +
        '<ul class="tl-list" id="lL"></ul></div></aside></div></div>';

      var viewer = Viewer($('#tStage'), $('#tCv'));
      var ed = $('#ed'); ed.innerHTML = sanitize(R.note);
      var ui = { title: $('#tTitle'), pg: $('#tPg'), tot: $('#tTot'), empty: $('#tEmpty'), save: $('#tSave'), fn: $('#tFn') };
      ui.title.value = R.title || '';

      /* 서버 저장 (묶어서 전송, 실패 시 4초 뒤 재시도) */
      function persist(patch, delay) {
        Object.keys(patch).forEach(function (k) { C.pending[k] = patch[k]; });
        ui.save.textContent = '저장 중...'; ui.save.classList.remove('bad');
        clearTimeout(C.saveTimer); C.saveTimer = setTimeout(flush, delay == null ? 250 : delay);
      }
      function flush() {
        if (C.saving) { C.saveTimer = setTimeout(flush, 400); return; }
        var patch = C.pending; if (!Object.keys(patch).length) return;
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

      /* 쪽 이동 */
      function paintPage() { ui.pg.value = C.page; ui.tot.textContent = C.pages || 0; viewer.show(C.page); }
      function goPage(p, quiet) {
        if (!C.pages) return;
        p = Math.max(1, Math.min(C.pages, p)); if (p === C.page && !quiet) return;
        C.page = p; C.pageTs = tsNow(); paintPage();
        send({ t: 'page', page: p, ts: C.pageTs });
        persist({ page: p, page_ts: C.pageTs }, 150);
      }
      $('#tPrev').onclick = function () { goPage(C.page - 1); };
      $('#tNext').onclick = function () { goPage(C.page + 1); };
      ui.pg.onchange = function () { goPage(parseInt(ui.pg.value, 10) || C.page); };
      document.addEventListener('keydown', function (e) {
        var t = e.target; if (t && (/INPUT|TEXTAREA/.test(t.tagName) || t.isContentEditable)) return;
        if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goPage(C.page + 1); }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goPage(C.page - 1); }
      });

      /* 자료 불러오기 */
      function showDoc(url) {
        if (!url) { ui.empty.classList.remove('hide'); return Promise.resolve(); }
        return loadPdf(url).then(function (d) {
          C.doc = d; C.pages = d.numPages; ui.empty.classList.add('hide'); viewer.setDoc(d); paintPage();
          ui.fn.textContent = C.pdfName ? C.pdfName + ' · ' + C.pages + '쪽' : '';
        }).catch(function () { toast('자료를 불러오지 못했습니다. PDF를 다시 올려 주십시오.'); });
      }
      showDoc(C.pdfUrl);

      $('#tFile').onchange = function () {
        var f = this.files && this.files[0]; this.value = '';
        if (!f) return;
        if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) { toast('PDF 파일만 올릴 수 있습니다.'); return; }
        if (f.size > 50 * 1024 * 1024) { toast('50MB 이하 파일만 올릴 수 있습니다.'); return; }
        ui.fn.textContent = '올리는 중... (' + Math.round(f.size / 1024 / 1024 * 10) / 10 + 'MB)';
        var path = rid(16) + '.pdf';
        sb.storage.from(BUCKET).upload(path, f, { contentType: 'application/pdf', upsert: false }).then(function (res) {
          if (res.error) throw res.error;
          var url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          return loadPdf(url).then(function (d) {
            C.pdfUrl = url; C.pdfName = f.name; C.doc = d; C.pages = d.numPages; C.page = 1; C.pageTs = tsNow();
            ui.empty.classList.add('hide'); viewer.setDoc(d); paintPage();
            ui.fn.textContent = f.name + ' · ' + C.pages + '쪽';
            persist({ pdf_url: url, pdf_name: f.name, pages: C.pages, page: 1, page_ts: C.pageTs }, 0);
            return flush();
          }).then(function () { send({ t: 'doc' }); toast('자료를 올렸습니다. 학생 화면에 바로 표시됩니다.'); });
        }).catch(function (e) { ui.fn.textContent = ''; toast('올리지 못했습니다: ' + (e.message || e)); });
      };

      /* 노트 편집기 */
      var noteBackup = 'wb_note_' + C.code;
      function emitNote(final) {
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
        if (b.dataset.c) document.execCommand(b.dataset.c, false, null);
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
        $$('[data-rm]').forEach(function (b) {
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

      /* 제목 · 종료 */
      ui.title.onchange = function () { persist({ title: ui.title.value }, 0); };
      function paintEnd() {
        $('#bEnd').innerHTML = C.active ? ic('stop', 14) + ' 수업 종료' : ic('play', 14) + ' 수업 다시 열기';
      }
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

      /* 이해도 현황 · 접속자 */
      function pollSig() {
        call('wb_sig_get', { p_code: C.code }).then(function (r) { $('#stG').textContent = r.got; $('#stH').textContent = r.hard; }).catch(function () {});
      }
      C.sigTimer = setInterval(pollSig, 3000); pollSig();
      $('#bSigR').onclick = function () {
        call('wb_sig_reset', { p_code: C.code }).then(function () { send({ t: 'sigreset' }); pollSig(); toast('이해도 신호를 초기화했습니다.'); }).catch(function () {});
      };

      /* 실시간 연결 */
      var ch = sb.channel('wb-' + C.code, { config: { broadcast: { self: false }, presence: { key: 't-' + rid(4) } } });
      C.ch = ch;
      ch.on('broadcast', { event: 'sig' }, function () { pollSig(); });
      ch.on('presence', { event: 'sync' }, function () {
        var st = ch.presenceState(), n = 0;
        Object.keys(st).forEach(function (k) { if (st[k].some(function (m) { return m.role === 's'; })) n++; });
        $('#stU').textContent = n;
      });
      ch.subscribe(function (s) { if (s === 'SUBSCRIBED') ch.track({ role: 't' }); });
    }

    /* 시작 */
    if (T.token) {
      rpc('wb_check', { p_token: T.token }).then(function (ok) { ok ? list() : login(); }).catch(function () { login(); });
    } else login();
  }

  boot();
})();
