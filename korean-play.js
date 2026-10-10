'use strict';
/* 시윤이 한글놀이 — 놀이(소리 찾기·첫소리·모양 맞추기·낱말 조립), 글자 합체, 펜 쓰기 */
(function () {
  var KA = window.KA, K = KA.K, S = KA.S, ICON = KA.ICON, $ = KA.$, shuffle = KA.shuffle, pick = KA.pick;
  var V = function () { return KA.view(); };

  /* ───────── 놀이 허브 ───────── */
  KA.viewPlay = function () {
    var h = '<div class="modes">' +
      '<button class="mode" data-m="find">' + ICON.ear + '소리 찾기<small>듣고 맞는 것 고르기</small></button>' +
      '<button class="mode" data-m="first">' + ICON.abc + '첫소리 찾기<small>그림의 첫소리 글자</small></button>' +
      '<button class="mode" data-m="shape">' + ICON.shape + '모양 맞추기<small>끌어서 맞추기</small></button>' +
      '<button class="mode" data-m="build">' + ICON.blocks + '낱말 조립<small>글자를 모아 낱말</small></button></div>';
    V().innerHTML = h;
    V().onclick = function (e) { var b = e.target.closest('[data-m]'); if (b) { KA.touchStart(); KA.startGame(b.dataset.m); } };
  };

  /* ───────── 공통: 끌어 놓기 ───────── */
  function makeDrag(tile, zoneSel, onDrop) {
    var sx, sy, down = false, moved = false;
    function reset() { tile.classList.remove('drag'); tile.classList.add('ret'); tile.style.transform = ''; }
    tile.addEventListener('pointerdown', function (e) {
      if (tile.classList.contains('used')) return;
      sx = e.clientX; sy = e.clientY; down = true; moved = false;
      try { tile.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ }
      tile.classList.remove('ret');
    });
    tile.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.hypot(dx, dy) > 8) { moved = true; tile.classList.add('drag'); }
      if (moved) {
        tile.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        tile.style.pointerEvents = 'none'; var el = document.elementFromPoint(e.clientX, e.clientY); tile.style.pointerEvents = '';
        document.querySelectorAll(zoneSel + '.hot').forEach(function (z) { z.classList.remove('hot'); });
        var z = el && el.closest(zoneSel); if (z) z.classList.add('hot');
      }
    });
    function up(e) {
      if (!down) return; down = false;
      document.querySelectorAll(zoneSel + '.hot').forEach(function (z) { z.classList.remove('hot'); });
      var zone = null;
      if (moved) { tile.style.pointerEvents = 'none'; var el = document.elementFromPoint(e.clientX, e.clientY); tile.style.pointerEvents = ''; zone = el && el.closest(zoneSel); }
      tile.classList.remove('drag');
      var ok = e.type === 'pointercancel' ? false : onDrop(tile, zone, moved);
      if (!ok) { reset(); } else { tile.style.transform = ''; }
    }
    tile.addEventListener('pointerup', up); tile.addEventListener('pointercancel', up);
  }

  /* ───────── 문항 생성 ───────── */
  var SIM = { 'ㄱ': ['ㄴ', 'ㅋ'], 'ㄴ': ['ㄱ', 'ㄷ'], 'ㄷ': ['ㄴ', 'ㅌ'], 'ㄹ': ['ㄷ', 'ㅁ'], 'ㅁ': ['ㅂ', 'ㅇ'], 'ㅂ': ['ㅁ', 'ㅍ'], 'ㅅ': ['ㅈ', 'ㅊ'], 'ㅇ': ['ㅁ', 'ㅎ'], 'ㅈ': ['ㅅ', 'ㅊ'], 'ㅊ': ['ㅈ', 'ㅅ'], 'ㅋ': ['ㄱ', 'ㅌ'], 'ㅌ': ['ㄷ', 'ㅋ'], 'ㅍ': ['ㅂ', 'ㅁ'], 'ㅎ': ['ㅇ', 'ㅊ'],
    'ㅏ': ['ㅓ', 'ㅑ'], 'ㅑ': ['ㅏ', 'ㅕ'], 'ㅓ': ['ㅏ', 'ㅕ'], 'ㅕ': ['ㅓ', 'ㅑ'], 'ㅗ': ['ㅜ', 'ㅛ'], 'ㅛ': ['ㅗ', 'ㅠ'], 'ㅜ': ['ㅗ', 'ㅠ'], 'ㅠ': ['ㅜ', 'ㅛ'], 'ㅡ': ['ㅣ', 'ㅜ'], 'ㅣ': ['ㅡ', 'ㅏ'] };
  function openList(type) { return S.settings.unlocked.filter(function (c) { return K.LET[c] && (!type || K.LET[c].type === type); }); }
  function distract(t, n, type) {
    var pool = openList(type || K.LET[t].type).filter(function (c) { return c !== t; });
    var sim = (SIM[t] || []).filter(function (c) { return c !== t; });
    var rest = shuffle(pool.filter(function (c) { return sim.indexOf(c) < 0; }));
    var all = shuffle(pool.filter(function (c) { return sim.indexOf(c) >= 0; })).concat(rest);
    if (all.length < n) all = all.concat(shuffle(sim.concat(K.CORDER).filter(function (c) { return c !== t && all.indexOf(c) < 0 && K.LET[c].type === K.LET[t].type; })));
    return all.slice(0, n);
  }
  function openWords() { return Object.keys(K.W).filter(function (w) { return KA.isOpen(K.W[w].init); }); }
  function sylFor(t) {
    var cs = openList('c'), vs = openList('v'); if (!vs.length) vs = ['ㅏ']; if (!cs.length) cs = ['ㄱ'];
    return K.LET[t].type === 'c' ? K.comp(t, pick(vs)) : K.comp(pick(cs), t);
  }

  function buildFind(t, n) {
    var units = S.settings.units.filter(function (u) { return u !== 'noop'; }); if (!units.length) units = ['sound'];
    var u = pick(units), l = K.LET[t], q;
    if (u === 'name' || u === 'sound') {
      var txt = (u === 'name' || l.silent) ? l.name : l.sound;
      var o = shuffle([t].concat(distract(t, n - 1)));
      q = { key: (u === 'name' ? 'n:' : 's:') + t, say: [txt, K.PHR.where], ans: t, opts: o.map(function (c) { return { v: c, g: c, c: K.LET[c].color }; }), replay: [txt] };
    } else if (u === 'syll') {
      var s = sylFor(t), d = K.decomp(s), set = [s], guard = 0;
      while (set.length < n && guard++ < 40) { var x = sylFor(pick(openList())); if (set.indexOf(x) < 0) set.push(x); }
      q = { key: 'y:' + t, say: [s, K.PHR.where], ans: s, opts: shuffle(set).map(function (c) { return { v: c, g: c, c: K.LET[K.decomp(c).cho].color }; }), replay: [s] };
    } else {
      var ws = openWords(), cand = ws.filter(function (w) { return K.W[w].init === t || K.LET[t].type === 'v'; });
      var w = pick(cand.length ? cand : ws), set2 = [w], g2 = 0;
      while (set2.length < n && g2++ < 60) { var y = pick(ws); if (set2.indexOf(y) < 0 && K.W[y].init !== K.W[w].init) set2.push(y); }
      q = { key: 'd:' + w, ans: w, say: [w, K.PHR.where], replay: [w], opts: shuffle(set2).map(function (c) { return { v: c, art: c, c: K.LET[K.W[c].init].color }; }) };
    }
    return q;
  }
  function buildFirst(t, n) {
    var l = K.LET[t], w = pick(l.words);
    var o = shuffle([t].concat(distract(t, n - 1, 'c')));
    return { key: 'f:' + t, word: w, ans: t, say: [w, K.PHR.firstQ], replay: [w, K.PHR.firstQ], okSay: [l.silent ? l.name : l.sound, w], opts: o.map(function (c) { return { v: c, g: c, c: K.LET[c].color }; }) };
  }
  function buildShape(t, n) {
    var o = shuffle([t].concat(distract(t, n - 1)));
    return { key: 'm:' + t, ans: t, say: [K.PHR.shape], replay: [K.PHR.shape], opts: o, okSay: [K.LET[t].silent ? K.LET[t].name : (KA.unitOn('name') ? K.LET[t].name : K.LET[t].sound)] };
  }
  function buildBuild() {
    var lvl = S.settings.buildLevel === 2 ? 2 : 1;
    var ws = openWords().filter(function (w) { return w.length <= 4; });
    var w = pick(ws), syl = w.split('');
    var groups = syl.map(function (c) { return lvl === 1 ? [c] : jamoOf(c); });
    var need = [].concat.apply([], groups), n = Math.max(2, S.settings.choices);
    var extra = [];
    if (lvl === 1) { var pool = shuffle(ws.join('').split('').filter(function (c) { return syl.indexOf(c) < 0; })); extra = Array.from(new Set(pool)).slice(0, n); }
    else { extra = shuffle(openList().concat(K.VORDER.slice(0, 4)).filter(function (c) { return need.indexOf(c) < 0; })).slice(0, n); }
    return { key: 'b:' + w, word: w, groups: groups, lvl: lvl, tiles: shuffle(need.concat(extra)), say: [K.PHR.build, w], replay: [w] };
  }
  function jamoOf(syl) { var d = K.decomp(syl); var a = [d.cho, d.jung]; if (d.jong) a.push(d.jong); return a; }

  /* ───────── 게임 진행기 ───────── */
  var G = null;
  KA.startGame = function (mode, forceT) {
    KA.stopAudio();
    var n = S.settings.rounds, ch = Math.min(4, Math.max(2, S.settings.choices)), qs = [], i;
    if (mode === 'build') { for (i = 0; i < n; i++) qs.push(buildBuild()); }
    else {
      var ts = forceT ? Array.apply(null, Array(n)).map(function (_, k) { return forceT[k % forceT.length]; }) : KA.targets(n, mode === 'first' ? 'c' : null);
      qs = ts.map(function (t) { return mode === 'find' ? buildFind(t, ch) : mode === 'first' ? buildFirst(t, ch) : buildShape(t, ch); });
    }
    G = { mode: mode, qs: qs, i: 0, ok: 0, tr: 0, lock: false, forceT: forceT };
    nextQ();
  };
  function dots() { return '<div class="dots">' + G.qs.map(function (_, i) { return '<i class="' + (i < G.i ? 'ok' : i === G.i ? 'on' : '') + '"></i>'; }).join('') + '</div>'; }
  function bar() { return '<div class="qbar"><button class="back" data-x="exit">' + ICON.back + '</button>' + dots() + '<span style="width:44px"></span></div>'; }
  function nextQ() {
    if (G.i >= G.qs.length) { endGame(); return; }
    G.tr = 0; G.lock = false;
    var q = G.qs[G.i];
    ({ find: renderChoice, first: renderChoice, shape: renderShape, build: renderBuild })[G.mode](q);
    V().onclick = function (e) { if (e.target.closest('[data-x=exit]')) { KA.stopAudio(); KA.flush(); KA.go('play'); } };
  }
  function spkBtn(q) { return '<button class="spk" data-r="1" aria-label="다시 듣기">' + ICON.spk + '</button>'; }
  function bindReplay(q) {
    V().querySelectorAll('[data-r]').forEach(function (b) { b.addEventListener('click', function () { KA.sayAll(q.replay || q.say); }); });
  }
  function hit(q, correct) {
    var n = G.tr + 1;
    KA.record(q.key, 1, correct && G.tr === 0 ? 1 : 0, 0);
    if (!correct) { G.tr++; }
  }
  function advance(q, delay) {
    G.lock = true; G.ok += (G.tr === 0 ? 1 : 0); G.i++;
    setTimeout(nextQ, delay || 1900);
  }

  function renderChoice(q) {
    var h = bar() + '<div class="stage">';
    if (G.mode === 'first') h += '<div class="picture">' + KA.art(q.word) + '</div>';
    h += '<div class="prompt">' + spkBtn(q) + '</div><div class="msg" id="msg"></div><div class="opts n' + q.opts.length + '">';
    q.opts.forEach(function (o) {
      h += '<button class="opt" style="--lc:' + o.c + '" data-v="' + o.v + '">' + (o.art ? KA.art(o.art) + '<span class="cap">' + o.v + '</span>' : '<span class="g">' + o.g + '</span>') + '</button>';
    });
    V().innerHTML = h + '</div></div>';
    bindReplay(q);
    V().querySelectorAll('.opt').forEach(function (b) {
      b.addEventListener('click', function () {
        if (G.lock) return;
        if (b.dataset.v === q.ans) {
          hit(q, true); b.classList.add('ok');
          V().querySelectorAll('.opt').forEach(function (x) { if (x !== b) x.classList.add('dim'); });
          KA.sayAll((G.mode === 'first' ? q.okSay : [q.say[0]]).concat([pick(K.PRAISE.map(function (k) { return K.PHR[k]; }))]));
          advance(q);
        } else {
          hit(q, false); b.classList.add('no'); setTimeout(function () { b.classList.remove('no'); }, 450);
          KA.sayAll([K.PHR.retry].concat(q.replay));
        }
      });
    });
    setTimeout(function () { if (G && G.qs[G.i] === q) KA.sayAll(q.say); }, 350);
  }

  function renderShape(q) {
    var l = K.LET[q.ans];
    var h = bar() + '<div class="stage"><div class="prompt">' + spkBtn(q) + '</div>' +
      '<div class="drop" id="drop" style="--lc:' + l.color + '"><span class="ghost">' + q.ans + '</span></div><div class="msg"></div>' +
      '<div class="tray">' + q.opts.map(function (c) { return '<button class="tile" style="--lc:' + K.LET[c].color + '" data-v="' + c + '">' + c + '</button>'; }).join('') + '</div></div>';
    V().innerHTML = h; bindReplay(q);
    var drop = $('#drop');
    V().querySelectorAll('.tile').forEach(function (t) {
      makeDrag(t, '.drop', function (tile, zone, moved) {
        if (G.lock) return false;
        if (moved && !zone) return false;
        if (tile.dataset.v === q.ans) {
          hit(q, true); drop.classList.add('fill'); drop.querySelector('.ghost').textContent = q.ans; tile.classList.add('used');
          KA.sayAll(q.okSay.concat([pick(K.PRAISE.map(function (k) { return K.PHR[k]; }))])); advance(q); return true;
        }
        hit(q, false); tile.classList.add('no'); setTimeout(function () { tile.classList.remove('no'); }, 450); KA.sayAll([K.PHR.retry, K.PHR.shape]); return false;
      });
    });
    setTimeout(function () { if (G && G.qs[G.i] === q) KA.sayAll(q.say); }, 350);
  }

  function renderBuild(q) {
    var flat = [].concat.apply([], q.groups), fi = 0;
    var h = bar() + '<div class="stage"><div class="picture">' + KA.art(q.word) + '</div><div style="font-size:30px;font-weight:900;color:#B6BECB;letter-spacing:6px">' + q.word + '</div><div class="prompt">' + spkBtn(q) + '</div><div class="slots">';
    q.groups.forEach(function (g, gi) {
      h += '<div class="slotg" data-g="' + gi + '">';
      g.forEach(function (c) { h += '<div class="slot" data-i="' + fi + '" data-e="' + c + '" style="--lc:' + K.LET[K.decomp(q.word[gi]).cho].color + '"></div>'; fi++; });
      if (q.lvl === 2) h += '<div class="comb" data-c="' + gi + '" style="--lc:' + K.LET[K.decomp(q.word[gi]).cho].color + '"></div>';
      h += '</div>';
    });
    h += '</div><div class="tray">' + q.tiles.map(function (c, i) {
      var col = K.LET[c] ? K.LET[c].color : K.LET[K.decomp(c).cho].color;
      return '<button class="tile' + (q.lvl === 1 ? ' sy' : '') + '" style="--lc:' + col + '" data-v="' + c + '" data-t="' + i + '">' + c + '</button>';
    }).join('') + '</div></div>';
    V().innerHTML = h; bindReplay(q);
    var slots = Array.prototype.slice.call(V().querySelectorAll('.slot'));
    function firstEmpty() { return slots.filter(function (s) { return !s.classList.contains('fill'); })[0]; }
    V().querySelectorAll('.tile').forEach(function (t) {
      makeDrag(t, '.slot', function (tile, zone, moved) {
        if (G.lock) return false;
        var s = moved ? zone : firstEmpty();
        if (!s || s.classList.contains('fill')) return false;
        if (s.dataset.e !== tile.dataset.v) { hit(q, false); tile.classList.add('no'); setTimeout(function () { tile.classList.remove('no'); }, 450); KA.sayAll([K.PHR.retry]); return false; }
        s.textContent = tile.dataset.v; s.classList.add('fill'); tile.classList.add('used');
        KA.say(tile.dataset.v);
        var gi = +s.parentNode.dataset.g, grp = s.parentNode.querySelectorAll('.slot');
        if (q.lvl === 2 && Array.prototype.every.call(grp, function (x) { return x.classList.contains('fill'); })) s.parentNode.querySelector('.comb').textContent = q.word[gi];
        if (slots.every(function (x) { return x.classList.contains('fill'); })) {
          hit(q, true);
          KA.stopAudio(); KA.sayAll([q.word, pick(K.PRAISE.map(function (k) { return K.PHR[k]; }))]); advance(q, 2300);
        }
        return true;
      });
    });
    setTimeout(function () { if (G && G.qs[G.i] === q) KA.sayAll(q.say); }, 350);
  }

  function endGame() {
    var st = KA.newSticker();
    S.log.q += G.qs.length; S.log.ok += G.ok;
    KA.maybeUnlock(); KA.flush();
    V().innerHTML = '<div class="end"><h3>잘했어요</h3>' + (st ? '<svg class="sticker" viewBox="0 0 100 100">' + st.body + '</svg>' : '') +
      '<div class="row" style="justify-content:center"><button class="btn" data-x="again">' + ICON.replay + '</button><button class="btn sec" data-x="home">' + ICON.home + '</button></div></div>';
    KA.sayAll([K.PHR.good, st ? K.PHR.sticker : '']);
    V().onclick = function (e) {
      var b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'again') KA.startGame(G.mode, G.forceT); else KA.go('play');
    };
  }

  /* ───────── 만들기 허브 / 글자 합체 ───────── */
  KA.viewMake = function () {
    V().innerHTML = '<div class="modes" style="grid-template-columns:1fr 1fr 1fr">' +
      '<button class="mode" data-m="combine">' + ICON.blocks + '글자 합체<small>자음+모음</small></button>' +
      '<button class="mode" data-m="build">' + ICON.abc + '낱말 조립<small>조각 모아 낱말</small></button>' +
      '<button class="mode" data-m="words">' + ICON.pen + '낱말 쓰기<small>그림 보고 쓰기</small></button></div>';
    V().onclick = function (e) {
      var b = e.target.closest('[data-m]'); if (!b) return; KA.touchStart();
      if (b.dataset.m === 'combine') viewCombine(); else if (b.dataset.m === 'build') KA.startGame('build'); else { KA.S.tab = 'write'; KA.drawNav(); viewWrite(true); }
    };
  };
  var cb = { c: null, v: null, f: '' };
  function viewCombine() {
    var cs = openList('c'), vs = openList('v');
    if (!cs.length || !vs.length) { KA.toast('자음과 모음이 열려 있어야 해요'); return; }
    if (!cb.c || cs.indexOf(cb.c) < 0) cb.c = cs[0]; if (!cb.v || vs.indexOf(cb.v) < 0) cb.v = vs[0];
    var syl = K.comp(cb.c, cb.v, cb.f), col = K.LET[cb.c].color;
    function row(list, key, none) {
      return '<div class="chips" style="margin-bottom:10px">' + (none ? '<button class="chip' + (cb.f === '' ? ' c' : '') + '" style="--lc:#5F6368" data-k="f" data-x="">없음</button>' : '') +
        list.map(function (c) { return '<button class="chip' + (cb[key] === c ? ' c' : '') + '" style="--lc:' + K.LET[c].color + '" data-k="' + key + '" data-x="' + c + '">' + c + '</button>'; }).join('') + '</div>';
    }
    V().innerHTML = '<button class="back" data-x2="back">' + ICON.back + '만들기</button><div class="combo" style="--lc:' + col + '"><div class="res">' + syl + '</div></div>' +
      '<div class="row" style="justify-content:center;margin:8px 0 16px"><button class="btn lc" style="--lc:' + col + '" data-x2="say">' + ICON.spk + '</button><button class="btn sec" data-x2="write">' + ICON.pen + '</button></div>' +
      '<div class="h2">첫소리</div>' + row(cs, 'c') + '<div class="h2">모음</div>' + row(vs, 'v') + '<div class="h2">받침 <span class="sub">(선택)</span></div>' + row(cs, 'f', true);
    V().onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return; KA.touchStart();
      if (b.dataset.k) { cb[b.dataset.k] = b.dataset.x; viewCombine(); KA.sayAll([K.comp(cb.c, cb.v, cb.f)]); }
      else if (b.dataset.x2 === 'say') KA.sayAll([K.comp(cb.c, cb.v, cb.f)]);
      else if (b.dataset.x2 === 'write') KA.openWriter([{ t: 's', text: K.comp(cb.c, cb.v, cb.f) }], '글자 쓰기', 'make');
      else if (b.dataset.x2 === 'back') KA.viewMake();
    };
    KA.sayAll([syl]);
  }

  /* ───────── 쓰기 허브 ───────── */
  var writeTab = 'j';
  function viewWrite(toWords) {
    if (toWords === true) writeTab = 'w';
    var h = '<div class="seg"><button data-wt="j" class="' + (writeTab === 'j' ? 'on' : '') + '">글자</button><button data-wt="s" class="' + (writeTab === 's' ? 'on' : '') + '">음절</button><button data-wt="w" class="' + (writeTab === 'w' ? 'on' : '') + '">낱말</button></div>';
    if (writeTab === 'j') {
      h += '<div class="grid">' + openList().map(function (c) { var l = K.LET[c]; return '<button class="lcard" style="--lc:' + l.color + '" data-j="' + c + '">' + KA.starRow(KA.stars('wc:' + c)) + '<span class="g">' + c + '</span><small>' + l.name + '</small></button>'; }).join('') + '</div>';
    } else if (writeTab === 's') {
      var cs = openList('c'), vs = openList('v'), list = [];
      cs.forEach(function (c) { vs.forEach(function (v) { list.push(K.comp(c, v)); }); });
      h += '<div class="wlist">' + list.map(function (s) { return '<button class="syl" style="--lc:' + K.LET[K.decomp(s).cho].color + '" data-s="' + s + '">' + s + '</button>'; }).join('') + '</div>';
      if (!list.length) h += '<p class="sub">자음과 모음이 열려 있어야 해요.</p>';
    } else {
      h += '<div class="wcards">' + openWords().map(function (w) { return '<button class="wcard" style="--lc:' + K.LET[K.W[w].init].color + '" data-w="' + w + '">' + KA.art(w) + '<div class="wt">' + KA.starRow(KA.stars('ww:' + w)) + '</div></button>'; }).join('') + '</div>';
    }
    V().innerHTML = h;
    V().onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return; KA.touchStart();
      if (b.dataset.wt) { writeTab = b.dataset.wt; viewWrite(); }
      else if (b.dataset.j) KA.openWriter([{ t: 'j', text: b.dataset.j }], K.LET[b.dataset.j].name, 'write');
      else if (b.dataset.s) KA.openWriter([{ t: 's', text: b.dataset.s }], b.dataset.s, 'write');
      else if (b.dataset.w) KA.openWriter(b.dataset.w.split('').map(function (c) { return { t: 's', text: c, word: b.dataset.w }; }), b.dataset.w, 'write', b.dataset.w);
    };
  }
  KA.viewWrite = viewWrite;

  /* ───────── 펜 쓰기 ───────── */
  var LAYOUT = {
    vNo: { c: [0.52, 0.8, 2, 10], v: [0.42, 0.9, 55, 5], f: null },
    vF: { c: [0.5, 0.5, 2, 4], v: [0.4, 0.5, 56, 4], f: [0.6, 0.4, 20, 56] },
    hNo: { c: [0.8, 0.5, 10, 2], v: [0.9, 0.42, 5, 55], f: null },
    hF: { c: [0.55, 0.4, 22, 2], v: [0.75, 0.28, 12, 36], f: [0.6, 0.36, 20, 62] }
  };
  function tr(strokes, m) { return strokes.map(function (st) { return st.map(function (p) { return [p[0] * m[0] + m[2], p[1] * m[1] + m[3]]; }); }); }
  function guideOf(item) {
    if (item.t === 'j') return K.LET[item.text].strokes;
    var d = K.decomp(item.text); if (!d) return null;
    var c = K.LET[d.cho], v = K.LET[d.jung], f = d.jong ? K.LET[d.jong] : null;
    if (!c || !v || (d.jong && !f)) return null;
    var L = LAYOUT[(v.vertical ? 'v' : 'h') + (f ? 'F' : 'No')];
    return tr(c.strokes, L.c).concat(tr(v.strokes, L.v), f ? tr(f.strokes, L.f) : []);
  }
  KA.guideOf = guideOf;
  function itemColor(item) { return item.t === 'j' ? K.LET[item.text].color : K.LET[K.decomp(item.text).cho].color; }
  function itemKey(item) { return (item.t === 'j' ? 'wc:' : 'ws:') + item.text; }

  var W = null;
  KA.openWriter = function (items, title, back, wordKey) {
    KA.stopAudio();
    items = items.filter(function (it) { return guideOf(it); });
    if (!items.length) { KA.toast('쓰기 모양이 아직 없는 글자예요'); return; }
    W = { items: items, i: 0, res: [], back: back || 'write', word: wordKey || null, title: title, attempts: 0, busy: false };
    renderWriter();
  };

  function renderWriter() {
    var it = W.items[W.i], col = itemColor(it);
    var h = '<div class="qbar"><button class="back" data-w="exit">' + ICON.back + '</button><div class="dots">' + W.items.map(function (_, i) { return '<i class="' + (i < W.i ? 'ok' : i === W.i ? 'on' : '') + '"></i>'; }).join('') + '</div><button class="spk" style="width:52px;height:52px" data-w="say" aria-label="듣기">' + ICON.spk + '</button></div>';
    h += '<div class="wr" style="--lc:' + col + '"><div class="stage">' + (W.word ? '<div class="picture" style="width:min(36vw,130px)">' + KA.art(W.word) + '</div>' : '') +
      '<div class="cv" id="cv"><canvas id="cg"></canvas><canvas id="cd"></canvas></div></div>' +
      '<div class="stage"><div class="stars" id="stars">' + [0, 1, 2].map(function () { return KA.ICON.star; }).join('') + '</div><div class="msg" id="wmsg"></div>' +
      '<div class="wtools"><button class="btn sec" data-w="demo" aria-label="획순 보기">' + ICON.hand + '</button><button class="btn sec" data-w="clear" aria-label="지우기">' + ICON.erase + '</button><button class="btn lc" style="--lc:' + col + '" data-w="check" aria-label="다 썼어요">' + ICON.check + '</button></div></div></div>';
    V().innerHTML = h;
    W.attempts = 0; W.busy = false;
    setupCanvas();
    V().onclick = function (e) {
      var b = e.target.closest('[data-w]'); if (!b) return; KA.touchStart();
      var a = b.dataset.w;
      if (a === 'exit') { KA.stopAudio(); cancelAnimationFrame(W.raf); exitWriter(); }
      else if (a === 'say') KA.sayAll([speakOf(it)]);
      else if (a === 'demo') demo();
      else if (a === 'clear') { clearInk(); }
      else if (a === 'check') check(true);
    };
    KA.sayAll([it.t === 'j' ? (KA.unitOn('name') ? K.LET[it.text].name : K.LET[it.text].sound) : it.text, K.PHR.writeIt]);
    setTimeout(demo, 900);
  }
  function speakOf(it) { return it.t === 'j' ? (K.LET[it.text].silent || KA.unitOn('name') ? K.LET[it.text].name : K.LET[it.text].sound) : it.text; }
  function exitWriter() { KA.S.tab = W.back === 'make' ? 'make' : W.back === 'learn' ? 'learn' : 'write'; KA.drawNav(); KA.show(); }

  var cv, cg, cd, gctx, dctx, U = 1;
  function setupCanvas() {
    cv = $('#cv'); cg = $('#cg'); cd = $('#cd');
    var size = Math.round(cv.clientWidth * (window.devicePixelRatio || 1));
    cg.width = cg.height = cd.width = cd.height = size; U = size / 100;
    gctx = cg.getContext('2d'); dctx = cd.getContext('2d');
    drawGuide(0);
    var drawing = false, last = null, penSeen = false, it = W.items[W.i];
    var col = itemColor(it);
    function pos(e) { var r = cd.getBoundingClientRect(); return [(e.clientX - r.left) * size / r.width, (e.clientY - r.top) * size / r.height]; }
    cd.addEventListener('pointerdown', function (e) {
      if (W.busy) return;
      if (e.pointerType === 'pen') penSeen = true;
      if (e.pointerType === 'touch' && penSeen) return;   // 펜 사용 중 손바닥 입력 무시
      drawing = true; last = pos(e); try { cd.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ }
      dctx.fillStyle = col; dctx.beginPath(); dctx.arc(last[0], last[1], 3.4 * U, 0, 6.3); dctx.fill();
      W.dirty = true; e.preventDefault();
    });
    cd.addEventListener('pointermove', function (e) {
      if (!drawing) return;
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; if (!evs.length) evs = [e];
      evs.forEach(function (ev) {
        var p = pos(ev), w = (e.pointerType === 'pen' && ev.pressure ? 4 + ev.pressure * 5 : 7) * U;
        dctx.strokeStyle = col; dctx.lineWidth = w; dctx.lineCap = 'round'; dctx.lineJoin = 'round';
        dctx.beginPath(); dctx.moveTo(last[0], last[1]); dctx.lineTo(p[0], p[1]); dctx.stroke(); last = p;
      });
      e.preventDefault();
    });
    function end() { if (!drawing) return; drawing = false; check(false); }
    cd.addEventListener('pointerup', end); cd.addEventListener('pointercancel', end);
  }
  function clearInk() { dctx.clearRect(0, 0, cd.width, cd.height); W.dirty = false; showStars(0); $('#wmsg').textContent = ''; }

  /* 가이드(밑글씨) 그리기. progress: 0이면 기본, 양수면 그 길이만큼 색칠 */
  function drawGuide(progress) {
    var it = W.items[W.i], st = guideOf(it), col = itemColor(it);
    gctx.clearRect(0, 0, cg.width, cg.height); gctx.lineCap = 'round'; gctx.lineJoin = 'round';
    st.forEach(function (s) { line(gctx, s, '#E6EBF3', 13 * U); });
    st.forEach(function (s) { gctx.setLineDash([2 * U, 3 * U]); line(gctx, s, '#BCC6D6', 1.2 * U); gctx.setLineDash([]); });
    if (progress > 0) {
      var left = progress;
      st.forEach(function (s) {
        if (left <= 0) return; var L = KA.plen(s), part = Math.min(L, left); left -= L;
        line(gctx, cut(s, part), col, 10 * U);
      });
    }
    st.forEach(function (s, i) {
      var p = s[0]; gctx.fillStyle = '#fff'; gctx.strokeStyle = col; gctx.lineWidth = 1.6 * U;
      gctx.beginPath(); gctx.arc(p[0] * U, p[1] * U, 4.2 * U, 0, 6.3); gctx.fill(); gctx.stroke();
      gctx.fillStyle = col; gctx.font = '900 ' + (5 * U) + 'px sans-serif'; gctx.textAlign = 'center'; gctx.textBaseline = 'middle'; gctx.fillText(String(i + 1), p[0] * U, p[1] * U + 0.3 * U);
    });
  }
  function line(ctx, s, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath();
    s.forEach(function (p, i) { if (i) ctx.lineTo(p[0] * U, p[1] * U); else ctx.moveTo(p[0] * U, p[1] * U); }); ctx.stroke();
  }
  function cut(s, len) {
    var out = [s[0]], acc = 0;
    for (var i = 1; i < s.length; i++) {
      var d = Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
      if (acc + d >= len) { var t = (len - acc) / d; out.push([s[i - 1][0] + (s[i][0] - s[i - 1][0]) * t, s[i - 1][1] + (s[i][1] - s[i - 1][1]) * t]); return out; }
      out.push(s[i]); acc += d;
    }
    return out;
  }
  function demo() {
    if (!W || W.busy) return;
    var st = guideOf(W.items[W.i]), total = st.reduce(function (a, s) { return a + KA.plen(s); }, 0), t0 = performance.now(), dur = Math.max(1400, total * 14);
    cancelAnimationFrame(W.raf);
    (function step(now) {
      var p = Math.min(1, (now - t0) / dur); drawGuide(total * p);
      if (p < 1) W.raf = requestAnimationFrame(step); else setTimeout(function () { drawGuide(0); }, 500);
    })(t0);
  }

  var TOL = { easy: 12, normal: 9, hard: 6.5 };
  function evaluate() {
    var st = guideOf(W.items[W.i]), Wd = cd.width, tol = TOL[S.settings.tol] || 9;
    var img = dctx.getImageData(0, 0, Wd, Wd).data, r = Math.round(tol * U), step = Math.max(2, Math.round(U * 0.9));
    var pts = [];
    st.forEach(function (s) {
      for (var i = 1; i < s.length; i++) {
        var a = s[i - 1], b = s[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 2.5));
        for (var k = 0; k <= n; k++) pts.push([(a[0] + (b[0] - a[0]) * k / n) * U, (a[1] + (b[1] - a[1]) * k / n) * U]);
      }
    });
    var covered = 0;
    pts.forEach(function (p) {
      var f = false;
      for (var yy = -r; yy <= r && !f; yy += step) for (var xx = -r; xx <= r; xx += step) {
        if (xx * xx + yy * yy > r * r) continue;
        var X = Math.round(p[0] + xx), Y = Math.round(p[1] + yy);
        if (X < 0 || Y < 0 || X >= Wd || Y >= Wd) continue;
        if (img[(Y * Wd + X) * 4 + 3] > 40) { f = true; break; }
      }
      if (f) covered++;
    });
    var m = document.createElement('canvas'); m.width = m.height = Wd; var mc = m.getContext('2d');
    mc.lineCap = mc.lineJoin = 'round'; mc.strokeStyle = '#000'; mc.lineWidth = 2 * (tol * 1.2 + 3.5) * U;
    st.forEach(function (s) { mc.beginPath(); s.forEach(function (p, i) { if (i) mc.lineTo(p[0] * U, p[1] * U); else mc.moveTo(p[0] * U, p[1] * U); }); mc.stroke(); });
    var md = mc.getImageData(0, 0, Wd, Wd).data, tot = 0, out = 0;
    for (var y = 0; y < Wd; y += 2) for (var x = 0; x < Wd; x += 2) { var o = (y * Wd + x) * 4 + 3; if (img[o] > 40) { tot++; if (md[o] < 40) out++; } }
    var cov = covered / pts.length, stray = tot ? out / tot : 1;
    return { cov: cov, stray: stray, ink: tot, stars: !tot ? 0 : cov >= 0.88 && stray <= 0.18 ? 3 : cov >= 0.78 && stray <= 0.32 ? 2 : cov >= 0.62 ? 1 : 0 };
  }
  function showStars(n) { document.querySelectorAll('#stars svg').forEach(function (s, i) { s.classList.toggle('on', i < n); s.style.color = i < n ? '#FBBC05' : ''; }); }

  function check(manual) {
    if (!W || W.busy || !W.dirty) { if (manual && W && !W.dirty) KA.sayAll([K.PHR.writeIt]); return; }
    var r = evaluate(), s = r.stars;
    if (!manual && s < 3) return;                // 자동 판정은 아주 잘 쓴 경우만
    W.attempts++;
    if (s === 0 && W.attempts >= 3) s = 1;       // 세 번 도전하면 함께 해낸 것으로 인정
    if (s === 0) {
      $('#wmsg').textContent = '조금만 더 따라가 볼까요'; cv.classList.add('no'); setTimeout(function () { cv.classList.remove('no'); }, 450);
      KA.record(itemKey(W.items[W.i]), 1, 0, 0); KA.sayAll([K.PHR.again]); return;
    }
    W.busy = true; showStars(s); W.res.push(s);
    KA.record(itemKey(W.items[W.i]), 1, 1, s);
    KA.sayAll([s === 3 ? K.PHR.wow : K.PHR.good]);
    setTimeout(function () {
      W.i++; if (W.i >= W.items.length) finishWriter(); else renderWriter();
    }, 1900);
  }
  function finishWriter() {
    var avg = W.res.reduce(function (a, b) { return a + b; }, 0) / W.res.length, st = Math.round(avg);
    if (W.word) KA.record('ww:' + W.word, 1, 1, st);
    var stk = (W.items.length > 1 || st === 3) && st >= 2 ? KA.newSticker() : null;
    S.log.q += W.items.length; S.log.ok += W.res.filter(function (x) { return x >= 2; }).length;
    KA.maybeUnlock(); KA.flush();
    V().innerHTML = '<div class="end"><h3>' + KA.esc(W.title || '') + '</h3><div class="stars">' + [0, 1, 2].map(function (i) { return '<span style="color:' + (i < st ? '#FBBC05' : '#E0E4EA') + ';width:64px;height:64px">' + KA.ICON.star + '</span>'; }).join('') + '</div>' +
      (stk ? '<svg class="sticker" viewBox="0 0 100 100">' + stk.body + '</svg>' : '') +
      '<div class="row" style="justify-content:center"><button class="btn" data-e="again">' + ICON.replay + '</button><button class="btn sec" data-e="home">' + ICON.check + '</button></div></div>';
    KA.sayAll([K.PHR.good, stk ? K.PHR.sticker : '']);
    V().onclick = function (e) {
      var b = e.target.closest('[data-e]'); if (!b) return;
      if (b.dataset.e === 'again') KA.openWriter(W.items, W.title, W.back, W.word); else exitWriter();
    };
  }
})();
