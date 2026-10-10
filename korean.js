'use strict';
/* 시윤이 한글놀이 — 코어(상태·음성·저장·배우기 화면) */
(function () {
  var K = window.KOR, ART = window.KOR_ART;
  var SUPA_URL = 'https://zbpeyklwpotjyveipzxd.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV5a2x3cG90anl2ZWlwenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTYxMDcsImV4cCI6MjA5NzA5MjEwN30.6JgoQ6rPRnmrbBTG68A-Y9HDQk40mnwubhXVnkZvHrQ';

  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } }
  };
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var DEF = {
    units: ['sound', 'syll', 'word'],   // name 자모이름 / sound 자모소리 / syll 음절 / word 낱말
    review: 2,                          // 1 같은 글자 반복 / 2 어제+새 글자 / 3 자동 섞기
    focus: ['ㄱ'], sessionMin: 7, choices: 2, rounds: 5, speed: 1, volume: 1,
    tol: 'normal', buildLevel: 1,
    unlocked: ['ㄱ', 'ㄴ', 'ㄷ', 'ㅏ'], autoUnlock: true
  };

  var S = {
    pid: LS.get('kor_pid', null), name: '시윤', settings: copy(DEF),
    progress: LS.get('kor_progress', {}), stickers: LS.get('kor_stickers', []),
    pending: LS.get('kor_pending', {}), newStk: LS.get('kor_pstk', []),
    server: false, token: null, tab: 'learn', t0: 0, started: false, ended: false, log: { q: 0, ok: 0 }
  };
  var localSet = LS.get('kor_settings', null);
  if (localSet) S.settings = Object.assign(copy(DEF), localSet);

  /* ───────── 아이콘 (인라인 SVG) ───────── */
  function ic(d, extra) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + (extra || '') + '</svg>'; }
  var ICON = {
    book: ic('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/><path d="M9 8h6"/>'),
    play: ic('<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/>'),
    pen: ic('<path d="M3 21l3.5-1 12-12a2.1 2.1 0 0 0-3-3l-12 12z"/><path d="M14 6l3 3"/>'),
    blocks: ic('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><path d="M17 13v8M13 17h8"/>'),
    sticker: ic('<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>'),
    gear: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    spk: ic('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
    erase: ic('<path d="M20 20H9L3.5 14.5a2 2 0 0 1 0-2.8L12 3.2a2 2 0 0 1 2.8 0l6 6a2 2 0 0 1 0 2.8L13 20"/><path d="M7 11l6 6"/>'),
    check: ic('<path d="M4 12.5l5 5L20 6.5" stroke-width="3"/>'),
    back: ic('<path d="M15 5l-7 7 7 7"/>'),
    lock: ic('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    replay: ic('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
    next: ic('<path d="M9 5l7 7-7 7"/>'),
    hand: ic('<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6m0-2V4a1.5 1.5 0 0 1 3 0v7m0-5a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.5-1.5L8 15"/>'),
    hourglass: ic('<path d="M6 3h12M6 21h12M7 3v4l5 5-5 5v4M17 3v4l-5 5 5 5v4"/>'),
    home: ic('<path d="M3 11l9-8 9 8M5 10v10h14V10"/>'),
    shape: ic('<path d="M4 4h7v7H4zM13 13h7v7h-7z"/><circle cx="16.5" cy="7.5" r="3.5"/><path d="M7.5 13l3.5 7H4z"/>'),
    ear: ic('<path d="M6 8.5a6 6 0 0 1 12 0c0 3-3 4-3 7a3 3 0 0 1-6 0"/><path d="M9 9a3 3 0 0 1 6 0"/>'),
    abc: ic('<path d="M3 18l4-12 4 12M4.5 14h5M13 6v12h4a3 3 0 0 0 0-6h-4"/>'),
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21.1l1.4-7L2 9.3l7-.8z" fill="currentColor"/></svg>'
  };

  /* ───────── 서버(RPC) ───────── */
  function rpc(fn, args) {
    return fetch(SUPA_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) { /* 본문 없음 */ }
        if (!r.ok) { var er = new Error((j && (j.message || j.hint)) || ('HTTP ' + r.status)); er.status = r.status; throw er; }
        return j;
      });
    });
  }

  function setSync(mode) {
    var el = $('#sync'); if (!el) return;
    var m = { ok: ['서버 저장', ''], off: ['이 기기에만 저장', 'off'], busy: ['저장 중', ''] }[mode] || ['', ''];
    el.textContent = m[0]; el.className = 'sync ' + m[1];
  }

  /* ───────── 음성 ───────── */
  var MAN = {}, cur = null, curRes = null, seq = 0;
  function loadManifest() {
    return fetch('audio/korean/manifest.json').then(function (r) { return r.json(); }).then(function (j) { MAN = j; }).catch(function () { MAN = {}; });
  }
  function tts(t, done) {
    try {
      var u = new SpeechSynthesisUtterance(t); u.lang = 'ko-KR'; u.rate = 0.75 * S.settings.speed; u.volume = S.settings.volume;
      u.onend = done; u.onerror = done; speechSynthesis.speak(u);
    } catch (e) { done(); }
  }
  function say(t) {
    return new Promise(function (res) {
      if (!t) { res(); return; }
      var f = MAN[t]; curRes = res;
      if (f) {
        var a = new Audio('audio/korean/' + f);
        a.volume = S.settings.volume; a.playbackRate = S.settings.speed;
        try { a.preservesPitch = true; } catch (e) { /* 미지원 */ }
        cur = a; a.onended = function () { res(); };
        a.onerror = function () { tts(t, res); };
        var p = a.play(); if (p && p.catch) p.catch(function () { res(); });
      } else { tts(t, res); }
    });
  }
  function stopAudio() {
    seq++;
    try { if (cur) { cur.pause(); } if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* 무시 */ }
    cur = null; if (curRes) { var r = curRes; curRes = null; r(); }
  }
  function sayAll(list) {
    stopAudio(); var my = seq;
    return list.reduce(function (p, t) { return p.then(function () { if (my === seq) return say(t); }); }, Promise.resolve());
  }
  function praise() { return sayAll([pick(K.PRAISE.map(function (k) { return K.PHR[k]; }))]); }

  /* ───────── 진도 ───────── */
  function stars(key) { return (S.progress[key] || {}).stars || 0; }
  function playCorrect(ch) {
    return ['n:', 's:', 'm:', 'f:', 'y:'].reduce(function (a, p) { return a + ((S.progress[p + ch] || {}).correct || 0); }, 0);
  }
  function mastered(ch) { return stars('wc:' + ch) >= 2 && playCorrect(ch) >= 3; }
  function isOpen(ch) { return S.settings.unlocked.indexOf(ch) >= 0; }
  function lastOf(ch) {
    var m = 0; Object.keys(S.progress).forEach(function (k) { if (k.slice(-ch.length - 1) === ':' + ch) { var t = Date.parse(S.progress[k].last || 0) || S.progress[k].lt || 0; if (t > m) m = t; } });
    return m;
  }

  var flushT = null;
  function record(key, tries, correct, st) {
    var p = S.progress[key] || (S.progress[key] = { tries: 0, correct: 0, stars: 0 });
    p.tries += tries; p.correct += correct; p.stars = Math.max(p.stars, st || 0); p.lt = Date.now();
    var q = S.pending[key] || (S.pending[key] = { key: key, tries: 0, correct: 0, stars: 0 });
    q.tries += tries; q.correct += correct; q.stars = Math.max(q.stars, st || 0);
    LS.set('kor_progress', S.progress); LS.set('kor_pending', S.pending);
    clearTimeout(flushT); flushT = setTimeout(flush, 1500);
  }
  function addSticker(k) {
    if (S.stickers.indexOf(k) < 0) { S.stickers.push(k); S.newStk.push(k); LS.set('kor_stickers', S.stickers); LS.set('kor_pstk', S.newStk); }
    clearTimeout(flushT); flushT = setTimeout(flush, 800);
  }
  function flush() {
    var items = Object.keys(S.pending).map(function (k) { return S.pending[k]; });
    if (!S.pid) { setSync('off'); return Promise.resolve(); }
    if (!items.length && !S.newStk.length && !S._unl) return Promise.resolve();
    setSync('busy');
    var snapP = S.pending, snapS = S.newStk.slice(), unl = S._unl ? S.settings.unlocked : null;
    S.pending = {}; S.newStk = []; S._unl = false;
    return rpc('kor_progress_save', { p_pid: S.pid, p_items: items, p_stickers: snapS, p_unlocked: unl }).then(function () {
      LS.set('kor_pending', S.pending); LS.set('kor_pstk', S.newStk); setSync('ok');
    }).catch(function () {
      Object.keys(snapP).forEach(function (k) { var q = S.pending[k]; if (q) { q.tries += snapP[k].tries; q.correct += snapP[k].correct; q.stars = Math.max(q.stars, snapP[k].stars); } else S.pending[k] = snapP[k]; });
      S.newStk = snapS.concat(S.newStk); if (unl) S._unl = true;
      LS.set('kor_pending', S.pending); LS.set('kor_pstk', S.newStk); setSync('off');
    });
  }
  function logSession() {
    if (!S.t0 || !S.pid) return;
    var sec = Math.round((Date.now() - S.t0) / 1000);
    if (sec < 20) return;
    var body = JSON.stringify({ p_pid: S.pid, p_seconds: sec, p_summary: S.log });
    try { fetch(SUPA_URL + '/rest/v1/rpc/kor_session_log', { method: 'POST', keepalive: true, headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' }, body: body }); } catch (e) { /* 무시 */ }
    S.t0 = Date.now(); S.log = { q: 0, ok: 0 };
  }

  function maybeUnlock() {
    if (!S.settings.autoUnlock) return;
    var o = S.settings.unlocked, changed = false;
    var cs = o.filter(function (c) { return K.LET[c] && K.LET[c].type === 'c'; });
    var vs = o.filter(function (c) { return K.LET[c] && K.LET[c].type === 'v'; });
    if (cs.every(mastered)) { var nc = K.CORDER.filter(function (c) { return o.indexOf(c) < 0; }).slice(0, 2); if (nc.length) { o = o.concat(nc); changed = true; } }
    if (vs.length && vs.every(mastered)) { var nv = K.VORDER.filter(function (c) { return o.indexOf(c) < 0; }).slice(0, 1); if (nv.length) { o = o.concat(nv); changed = true; } }
    if (changed) { S.settings.unlocked = o; S._unl = true; LS.set('kor_settings', S.settings); toast('새 글자가 열렸어요'); flush(); }
  }

  /* 복습 방식에 따른 대상 글자 선정 */
  function targets(n, kind) {
    var open = S.settings.unlocked.filter(function (c) { return K.LET[c] && (kind === 'c' ? K.LET[c].type === 'c' : true); });
    if (!open.length) open = ['ㄱ'];
    var order = K.CORDER.concat(K.VORDER);
    open.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    var out = [], mode = S.settings.review;
    var base;
    if (mode === 1) {
      base = open.filter(function (c) { return S.settings.focus.indexOf(c) >= 0; });
      if (!base.length) base = [open[open.length - 1]];
    } else if (mode === 2) {
      var fresh = open.filter(function (c) { return !mastered(c); }).slice(-1);
      var prev = open.filter(function (c) { return fresh.indexOf(c) < 0; }).sort(function (a, b) { return lastOf(b) - lastOf(a); }).slice(0, 1);
      base = fresh.concat(prev); if (!base.length) base = open;
    } else {
      base = null;
    }
    for (var i = 0; i < n; i++) {
      var c;
      if (base) c = base[i % base.length];
      else {
        var wts = open.map(function (x) { var p = S.progress['s:' + x] || S.progress['n:' + x] || {}; var acc = p.tries ? p.correct / p.tries : 0; return 1 + (1 - acc) * 3 + (p.tries ? 0 : 2); });
        var tot = wts.reduce(function (a, b) { return a + b; }, 0), r = Math.random() * tot, k = 0;
        while (k < wts.length - 1 && r > wts[k]) { r -= wts[k]; k++; }
        c = open[k];
      }
      if (out.length && out[out.length - 1] === c && open.length > 1 && !base) { i--; continue; }
      out.push(c);
    }
    return base ? shuffle(out) : out;
  }

  /* ───────── 공통 UI ───────── */
  var view, tt;
  function toast(m) { var t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, 2200); }
  function colorOf(ch) { return (K.LET[ch] || {}).color || '#1A73E8'; }
  function starRow(n) { var s = ''; for (var i = 0; i < 3; i++) s += '<span style="color:' + (i < n ? '#FBBC05' : '#D8DDE6') + '">' + ICON.star + '</span>'; return '<span class="st">' + s + '</span>'; }
  function unitOn(u) { return S.settings.units.indexOf(u) >= 0; }
  function art(w, cls) { return ART.svg(w, cls || 'art'); }

  var NAV = [['learn', '배우기', ICON.book], ['play', '놀이', ICON.play], ['write', '쓰기', ICON.pen], ['make', '만들기', ICON.blocks], ['stk', '스티커', ICON.sticker]];
  function drawNav() {
    $('#nav').innerHTML = NAV.map(function (n) { return '<button data-tab="' + n[0] + '" class="' + (S.tab === n[0] ? 'on' : '') + '">' + n[2] + '<span>' + n[1] + '</span></button>'; }).join('');
  }
  function go(tab) { stopAudio(); S.tab = tab; drawNav(); show(); }
  function show() {
    S.cur = null;
    if (S.ended) return;
    ({ learn: viewLearn, play: KA.viewPlay, write: KA.viewWrite, make: KA.viewMake, stk: viewStickers })[S.tab]();
    view.scrollTop = 0;
  }
  function touchStart() { if (!S.t0) S.t0 = Date.now(); }

  /* ───────── 배우기 ───────── */
  var learnTab = 'c';
  function viewLearn() {
    var list = learnTab === 'c' ? K.C : K.V;
    var h = '<div class="seg"><button data-lt="c" class="' + (learnTab === 'c' ? 'on' : '') + '">자음</button><button data-lt="v" class="' + (learnTab === 'v' ? 'on' : '') + '">모음</button></div><div class="grid">';
    list.forEach(function (l) {
      var open = isOpen(l.ch);
      h += '<button class="lcard' + (open ? '' : ' locked') + '" style="--lc:' + l.color + '" data-letter="' + l.ch + '" aria-label="' + l.ch + '">' +
        (open ? starRow(stars('wc:' + l.ch)) : '<span class="lk">' + ICON.lock + '</span>') + '<span class="g">' + l.ch + '</span><small>' + l.name + '</small></button>';
    });
    view.innerHTML = h + '</div>';
    view.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.lt) { learnTab = b.dataset.lt; viewLearn(); }
      else if (b.dataset.letter) { if (!isOpen(b.dataset.letter)) { toast('보호자 메뉴에서 열 수 있어요'); return; } viewLetter(b.dataset.letter); }
    };
  }

  function pathD(poly) { return poly.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(''); }
  function plen(poly) { var s = 0; for (var i = 1; i < poly.length; i++) s += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]); return s; }
  function strokeSvg(ch) {
    var l = K.LET[ch], d = 0, s = '';
    l.strokes.forEach(function (st, i) {
      var len = Math.ceil(plen(st)) + 2, dur = Math.max(0.6, len / 90);
      s += '<path d="' + pathD(st) + '" fill="none" stroke="#DDE3EC" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path class="draw" d="' + pathD(st) + '" fill="none" stroke="' + l.color + '" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" style="stroke-dasharray:' + len + ';stroke-dashoffset:' + len + ';animation:draw ' + dur.toFixed(2) + 's linear ' + d.toFixed(2) + 's forwards"/>';
      d += dur + 0.25;
    });
    l.strokes.forEach(function (st, i) { s += '<circle cx="' + st[0][0] + '" cy="' + st[0][1] + '" r="7" fill="#fff" stroke="' + l.color + '" stroke-width="2"/><text x="' + st[0][0] + '" y="' + (st[0][1] + 4) + '" font-size="10" font-weight="900" text-anchor="middle" fill="' + l.color + '">' + (i + 1) + '</text>'; });
    return '<svg class="strokeBox" viewBox="0 0 100 100" aria-label="획순">' + s + '</svg>';
  }

  function wordCard(w, ch) {
    var syl = w.split(''), first = K.W[w] ? K.W[w].init : ch;
    var spans = syl.map(function (c, i) { return '<span class="' + (i === 0 && first === ch ? 'first' : '') + '" data-s="' + c + '">' + c + '</span>'; }).join('');
    return '<button class="wcard" data-word="' + w + '" style="--lc:' + colorOf(first) + '">' + art(w) + '<div class="wt">' + spans + '</div></button>';
  }

  function viewLetter(ch) {
    stopAudio();
    var l = K.LET[ch], h = '';
    h += '<button class="back" data-act="list">' + ICON.back + '목록</button>';
    h += '<div class="hero" style="--lc:' + l.color + '"><div class="bigg">' + ch + '</div><div class="stage" style="gap:10px">' + strokeSvg(ch) +
      '<div class="row" style="justify-content:center">';
    var any = false;
    if (unitOn('name')) { h += '<button class="btn lc" data-say="' + l.name + '">' + ICON.spk + l.name + '</button>'; any = true; }
    if (unitOn('sound') && !l.silent) { h += '<button class="btn lc" data-say="' + l.sound + '">' + ICON.spk + l.sound + '</button>'; any = true; }
    if (!any) h += '<button class="btn lc" data-say="' + (l.silent ? l.name : l.sound) + '">' + ICON.spk + '</button>';
    h += '<button class="btn sec" data-act="replay">' + ICON.replay + '</button></div></div></div>';

    if (l.silent) h += '<p class="sub">초성 ㅇ은 소리가 나지 않고, 모음 앞에서 자리를 채워요.</p>';

    var words, more;
    if (l.type === 'c') { words = l.words; more = l.more; }
    else {
      var all = Object.keys(K.W).filter(function (w) { return w.split('').some(function (c) { var d = K.decomp(c); return d && d.jung === ch; }); });
      var firstV = all.filter(function (w) { var d = K.decomp(w[0]); return d && d.jung === ch; });
      words = firstV.slice(0, 6); more = all.filter(function (w) { return words.indexOf(w) < 0; });
    }
    h += '<div class="h2">' + ICON.ear.replace('<svg', '<svg width="24" height="24"') + (l.type === 'c' ? '이 소리로 시작해요' : '이 모음이 들어 있어요') + '</div><div class="wcards" style="--lc:' + l.color + '">' + words.map(function (w) { return wordCard(w, ch); }).join('') + '</div>';
    if (more.length) h += '<div class="h2">더 많은 낱말</div><div class="chips" style="--lc:' + l.color + '">' + more.map(function (w) { return '<button class="chip c" data-word="' + w + '">' + '<span>' + (l.type === 'c' ? '<b>' + w[0] + '</b>' + w.slice(1) : w) + '</span>' + '</button>'; }).join('') + '</div>';

    var sy = [];
    if (l.type === 'c') K.V.forEach(function (v) { if (isOpen(v.ch)) sy.push(K.comp(ch, v.ch)); });
    else K.C.forEach(function (c) { if (isOpen(c.ch)) sy.push(K.comp(c.ch, ch)); });
    if (sy.length) h += '<div class="h2">글자가 되어요</div><div class="chips" style="--lc:' + l.color + '">' + sy.map(function (s) { return '<button class="syl" data-say="' + s + '">' + s + '</button>'; }).join('') + '</div>';

    h += '<div class="row" style="margin-top:20px"><button class="btn lc" style="--lc:' + l.color + '" data-act="write">' + ICON.pen + '써 볼까요</button><button class="btn sec" data-act="play">' + ICON.play + '놀이</button></div>';
    view.innerHTML = h;
    if (unitOn('sound') && !l.silent) sayAll([l.sound]); else if (unitOn('name')) sayAll([l.name]);
    view.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return; touchStart();
      if (b.dataset.say) { sayAll([b.dataset.say]); b.classList.add('hit'); setTimeout(function () { b.classList.remove('hit'); }, 400); }
      else if (b.dataset.word) spell(b.dataset.word, b);
      else if (b.dataset.act === 'list') viewLearn();
      else if (b.dataset.act === 'replay') { var s = $('.strokeBox'); s.outerHTML = strokeSvg(ch); }
      else if (b.dataset.act === 'write') KA.openWriter([{ t: 'j', text: ch }], l.name + ' 쓰기', 'learn');
      else if (b.dataset.act === 'play') KA.startGame('find', [ch]);
    };
  }

  /* 낱말 철자 듣기: 음절을 하나씩 짚고 마지막에 낱말 전체를 읽어 줍니다 */
  function spell(w, el) {
    var spans = el ? el.querySelectorAll('[data-s]') : [];
    var seqList = w.split('').filter(function (c) { return K.decomp(c); });
    stopAudio(); var my = seq;
    var p = Promise.resolve();
    seqList.forEach(function (c, i) {
      p = p.then(function () { if (my !== seq) return; if (spans[i]) spans[i].style.background = '#FFF3C4'; return say(c).then(function () { if (spans[i]) spans[i].style.background = ''; }); });
    });
    if (seqList.length > 1) p = p.then(function () { if (my === seq) return say(w); });
    return p;
  }

  /* ───────── 스티커 ───────── */
  function viewStickers() {
    var h = '<div class="h2" style="margin-top:0">자동차 도감 <span class="sub">' + S.stickers.length + ' / ' + ART.STICKERS.length + '</span></div><div class="stk">';
    ART.STICKERS.forEach(function (s) {
      var got = S.stickers.indexOf(s.k) >= 0;
      h += '<div class="' + (got ? '' : 'no') + '"><svg viewBox="0 0 100 100" aria-label="스티커">' + s.body + '</svg></div>';
    });
    view.innerHTML = h + '</div>'; view.onclick = null;
  }
  function newSticker() {
    var left = ART.STICKERS.filter(function (s) { return S.stickers.indexOf(s.k) < 0; });
    if (!left.length) return null;
    var s = pick(left); addSticker(s.k); return s;
  }

  /* ───────── 세션 시간 ───────── */
  var timer = null, warned = false;
  function startTimer() {
    clearInterval(timer);
    timer = setInterval(function () {
      if (!S.t0 || S.ended) return;
      var left = S.settings.sessionMin * 60 - (Date.now() - S.t0) / 1000;
      if (left <= 60 && !warned) { warned = true; var w = document.createElement('div'); w.className = 'warn'; w.id = 'warn'; w.innerHTML = ICON.hourglass + '곧 끝나요'; document.body.appendChild(w); setTimeout(function () { w.remove(); }, 6000); }
      if (left <= 0 && !S.busy) endSession();
    }, 1000);
  }
  function endSession() {
    S.ended = true; stopAudio(); logSession(); flush();
    var st = newSticker();
    var ov = $('#ov'); ov.hidden = false;
    ov.innerHTML = '<div class="sheet end"><h3>오늘은 여기까지</h3>' + (st ? '<svg class="sticker" viewBox="0 0 100 100">' + st.body + '</svg>' : '') +
      '<div class="row" style="justify-content:center"><button class="btn" data-end="home">' + ICON.home + '</button><button class="btn ghost" data-end="more">' + ICON.lock + '보호자</button></div></div>';
    sayAll([K.PHR.done, K.PHR.sticker]);
    ov.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.end === 'home') { ov.hidden = true; S.ended = false; S.t0 = 0; warned = false; S.started = false; startScreen(); }
      if (b.dataset.end === 'more') KA.pinPad(function (ok) { if (ok) { ov.hidden = true; S.ended = false; S.t0 = Date.now(); warned = false; show(); } });
    };
  }

  function startScreen() {
    drawNav(); $('#nav').style.display = 'none';
    view.innerHTML = '<div class="start"><button class="play" data-go aria-label="시작">' + ICON.play + '</button><div class="sub">' + esc(S.name) + '</div></div>';
    view.onclick = function (e) {
      if (!e.target.closest('[data-go]')) return;
      $('#nav').style.display = ''; S.started = true; S.t0 = Date.now(); warned = false;
      sayAll([K.PHR.hello]); go('learn');
    };
  }

  /* ───────── 초기화 ───────── */
  function loadProfile() {
    if (!S.pid) { setSync('off'); return Promise.resolve(); }
    return rpc('kor_state_get', { p_pid: S.pid }).then(function (st) {
      if (!st) { S.pid = null; LS.set('kor_pid', null); setSync('off'); return; }
      S.name = st.profile.name; S.settings = Object.assign(copy(DEF), st.profile.settings || {});
      var srv = {}; Object.keys(st.progress || {}).forEach(function (k) { srv[k] = st.progress[k]; });
      S.progress = srv; S.stickers = st.stickers || [];
      LS.set('kor_progress', S.progress); LS.set('kor_stickers', S.stickers);
      setSync('ok'); return flush();
    }).catch(function () { setSync('off'); });
  }

  var KA = window.KA = {
    S: S, K: K, ART: ART, ICON: ICON, LS: LS, DEF: DEF, rpc: rpc, say: say, sayAll: sayAll, stopAudio: stopAudio, praise: praise, spell: spell,
    record: record, flush: flush, targets: targets, maybeUnlock: maybeUnlock, newSticker: newSticker, mastered: mastered, stars: stars,
    shuffle: shuffle, pick: pick, $: $, esc: esc, copy: copy, toast: toast, go: go, art: art, isOpen: isOpen, unitOn: unitOn, colorOf: colorOf,
    starRow: starRow, touchStart: touchStart, pathD: pathD, plen: plen, setSync: setSync, loadProfile: loadProfile, drawNav: drawNav, show: show,
    view: function () { return view; }, startScreen: startScreen, logSession: logSession
  };

  document.addEventListener('DOMContentLoaded', function () {
    view = $('#view');
    $('#btnAdmin').innerHTML = ICON.gear;
    $('#nav').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { touchStart(); go(b.dataset.tab); } });
    $('#btnAdmin').addEventListener('click', function () { KA.openAdmin(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) { logSession(); flush(); } });
    window.addEventListener('pagehide', function () { logSession(); });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    $('#whoName').textContent = S.name;
    startTimer();
    Promise.all([loadManifest(), loadProfile()]).then(function () {
      $('#whoName').textContent = S.name; startScreen();
    });
  });
})();
