'use strict';
/**
 * aseasurvey-admin-tabs.js — 작업 탭 바 (크롬 탭처럼 여러 설문을 열어 두고 전환)
 *  · 맨 왼쪽 고정 탭 「설문 목록」 + 설문별 탭. 탭마다 마지막 화면(하위 메뉴·정렬·선택 등)과 저장하지 않은 편집 내용을 보존합니다.
 *  · 닫기(x)·휠 클릭으로 닫기·끌어서 순서 변경·우클릭 메뉴(닫기/다른 탭 닫기/오른쪽 탭 닫기/복제)·닫은 탭 다시 열기·키보드 이동.
 *  · 저장하지 않은 변경이 있으면 탭에 점(●)을 표시하고 닫을 때 확인합니다. (기존 브라우저 임시저장과 함께 동작)
 *  · 탭 목록·마지막 화면은 이 브라우저(localStorage)에만 기억하며 설문 내용·응답은 저장하지 않습니다.
 *  · 설정(⚙): 복원·중복 열기·실시간 갱신·미저장 확인·최대 탭 수·단축키·목록 행 클릭 방식 (추천값이 기본)
 * 연결: aseasurvey-admin.js 의 A.tabsHook (shell·route·hashchange 에서 호출)
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico;
  var KEY = 'svya_tabs', PKEY = 'svya_prefs';
  var DEF = { restore: true, dupe: 'goto', refresh: 'current', dirtyConfirm: true, maxTabs: 12, keys: true, rowClick: 'replace' };
  var T = { tabs: [], cur: 'home', want: null, closed: [], seq: 0, counts: {}, timer: null };

  /* ───────────── 설정 ───────────── */
  function prefs() { var p = {}; try { p = JSON.parse(localStorage.getItem(PKEY) || '{}') || {}; } catch (e) {} return Object.assign({}, DEF, p); }
  function setPrefs(o) { try { localStorage.setItem(PKEY, JSON.stringify(Object.assign(prefs(), o))); } catch (e) {} }
  A.prefs = prefs;
  function home() { return { key: 'home', id: null, title: '설문 목록' }; }
  function tab(k) { if (k === 'home') return home(); return T.tabs.filter(function (t) { return t.key === k; })[0]; }
  function cur() { return tab(T.cur); }
  function idxOf(k) { var n = -1; T.tabs.forEach(function (t, i) { if (t.key === k) n = i; }); return n; }

  /* ───────────── 저장 / 복원 ───────────── */
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify({ cur: T.cur, seq: T.seq, tabs: T.tabs.map(function (t) { return { key: t.key, id: t.id, title: t.title, seen: t.seen || 0, st: t.st ? { tab: t.st.tab, g: t.st.g, F: t.st.F, rpt: t.st.rpt ? { unit: t.st.rpt.unit, view: t.st.rpt.view, sorts: t.st.rpt.sorts, q: t.st.rpt.q } : null } : null }; }) })); } catch (e) {}
  }
  function targetOf(t) { return t && t.id ? '#/s/' + t.id + '/' + ((t.st && t.st.tab) || 'overview') : '#/'; }

  // 현재 화면 상태 스냅샷 (탭을 떠날 때)
  function snapshot() {
    var st = { tab: A.tab || 'overview', y: window.scrollY || 0 }, G = A.ext && A.ext.gstate, R = A.ext && A.ext.rpt, F = A.ext && A.ext.F;
    if (G) st.g = G.get(); if (F) st.F = { data: F.data, sincere: F.sincere };
    if (R) st.rpt = { unit: R.unit, view: R.view, sel: Object.assign({}, R.sel || {}), sorts: (R.sorts || []).slice(), q: R.q || '', anchor: R.anchor || '', types: Object.assign({}, R.types || {}) };
    return st;
  }
  function stage(t) {
    if (!t || !t.id || !A.cur || A.cur.survey.id !== t.id || !A.work) return;
    t.dirty = A.isDirty(); t.work = t.dirty ? A.clone(A.work) : null; t.st = snapshot();
    try { var it = (A.list || []).filter(function (s) { return s.id === t.id; })[0]; if (it) t.seen = it.responses || 0; } catch (e) {}
  }
  // 새 화면이 그려지기 전에 상태를 미리 걸어 둠 (결과 화면이 초기화된 직후 적용됨)
  function applyPending(t) {
    if (!t || !t.st) return; var st = t.st;
    A.ext.pendingState = st.tab === 'results' ? { id: t.id, g: st.g, F: st.F, rpt: st.rpt } : null;
  }

  /* ───────────── 훅 (aseasurvey-admin.js 에서 호출) ───────────── */
  var H = A.tabsHook = {
    on: function () { return true; },
    // hashchange 직전: 지금 보던 탭을 보존
    leaving: function () { stage(cur()); },
    // 라우팅 후 화면 직전: 탭 생성·활성화·상태 복원
    arrived: function (id) {
      var t;
      if (!id) { T.cur = 'home'; T.want = null; paint(); persist(); return; }
      t = T.want && tab(T.want) && tab(T.want).id === id ? tab(T.want) : T.tabs.filter(function (x) { return x.id === id; })[0];
      if (!t) {
        if (T.tabs.length >= prefs().maxTabs) { A.toast('작업 탭은 최대 ' + prefs().maxTabs + '개까지 열 수 있습니다. 쓰지 않는 탭을 닫아 주십시오. (설정에서 변경)', 'err'); }
        t = { key: 't' + (++T.seq), id: id, title: A.cur ? A.cur.survey.title : '설문', st: null, work: null, dirty: false, seen: 0 }; T.tabs.push(t);
      }
      T.cur = t.key; T.want = null; if (A.cur) t.title = A.cur.survey.title;
      if (t.restore) {
        t.restore = false;
        A.ext.pendingState = null; if (t.work && A.work && !A.isDirty()) { A.work = A.clone(t.work); t.dirty = true; A.draftOffer = null; }
        applyPending(t);
        var y = t.st && t.st.y; if (y) setTimeout(function () { window.scrollTo(0, y); }, 250);
      }
      t.work = null; paint(); persist();
    },
    paint: function () { paint(); }
  };

  /* ───────────── 열기 · 전환 · 닫기 ───────────── */
  function go(t) {
    var target = targetOf(t);
    if (location.hash === target) { if (A.route) A.route(); return; }
    location.hash = target;
  }
  // 설문 목록 등에서 설문을 열 때 (중복 열기 정책 적용)
  H.open = function (id, tabName) {
    var ex = T.tabs.filter(function (x) { return x.id === id; })[0], p = prefs();
    stage(cur());
    if (ex && p.dupe === 'goto') { ex.restore = true; T.cur = ex.key; T.want = ex.key; if (tabName) { ex.st = ex.st || {}; ex.st.tab = tabName; } persist(); return go(ex); }
    if (T.tabs.length >= p.maxTabs && !ex) { A.toast('작업 탭은 최대 ' + p.maxTabs + '개까지 열 수 있습니다. 쓰지 않는 탭을 닫아 주십시오. (설정에서 변경)', 'err'); return; }
    var t = { key: 't' + (++T.seq), id: id, title: ((A.list || []).filter(function (s) { return s.id === id; })[0] || {}).title || '설문', st: { tab: tabName || 'overview' }, work: null, dirty: false, seen: 0 };
    T.tabs.push(t); T.cur = t.key; T.want = t.key; persist(); go(t);
  };
  function activate(key) {
    if (key === T.cur && key !== 'home') return; var t = tab(key); if (!t) return;
    if (key === 'home' && T.cur === 'home') return;
    stage(cur()); t.restore = true; T.want = key; T.cur = key; persist(); go(t);
  }
  function isDirty(t) { return t.key === T.cur ? A.isDirty() : !!t.dirty; }
  function remove(key) {
    var i = idxOf(key), t = T.tabs[i]; if (i < 0) return;
    T.closed.unshift({ id: t.id, title: t.title, st: t.st }); T.closed = T.closed.slice(0, 10);
    var wasCur = key === T.cur; T.tabs.splice(i, 1);
    try { var d = localStorage.getItem('svya_draft_' + t.id); void d; } catch (e) {}
    if (wasCur) { var nx = T.tabs[Math.min(i, T.tabs.length - 1)] || home(); nx.restore = true; T.want = nx.key; T.cur = nx.key; A.work = null; A.cur = null; persist(); go(nx); } else { paint(); persist(); }
  }
  // 닫기: 저장하지 않은 변경이 있으면 저장/저장 안 함/취소를 묻는다 (다른 탭이면 그 탭을 먼저 연다)
  async function close(key) {
    var t = tab(key); if (!t || key === 'home') return;
    if (prefs().dirtyConfirm && isDirty(t)) {
      if (key !== T.cur) { activate(key); await new Promise(function (r) { setTimeout(r, 700); }); if (T.cur !== key) return; }
      var ans = await ask3('「' + t.title + '」에 저장하지 않은 변경이 있습니다', '저장하지 않고 닫으면 이 브라우저의 임시저장 외에는 변경이 사라집니다.');
      if (ans === 'cancel') return;
      if (ans === 'save') { var errs = A.beforeSave ? A.beforeSave() : []; if (errs.length) { A.toast('문항 오류가 있어 저장할 수 없습니다. 문항 탭에서 확인해 주십시오.', 'err'); return; } var ok = await A.save(''); if (!ok) return; }
      else A.draftClear && A.draftClear(t.id);
    }
    remove(key);
  }
  function ask3(title, body) {
    return new Promise(function (res) {
      var done = false, m = A.modal('<h3>' + E(title) + '</h3><div class="muted" style="margin-top:8px">' + E(body) + '</div><div class="btn-row"><button class="btn btn-ghost" data-r="cancel">취소</button><button class="btn btn-secondary" data-r="drop">저장 안 함</button><button class="btn btn-primary" data-r="save">저장 후 닫기</button></div>', function (bg, c) { bg.addEventListener('click', function (e) { var b = e.target.closest('[data-r]'); if (b) { done = true; c(); res(b.getAttribute('data-r')); } }); });
      new MutationObserver(function (_, ob) { if (!document.body.contains(m.el)) { ob.disconnect(); if (!done) res('cancel'); } }).observe(document.body, { childList: true });
    });
  }
  async function closeMany(keys) { for (var i = 0; i < keys.length; i++) { if (tab(keys[i])) await close(keys[i]); } }
  function duplicate(key) {
    var t = tab(key); if (!t || !t.id) return; if (T.tabs.length >= prefs().maxTabs) return A.toast('작업 탭은 최대 ' + prefs().maxTabs + '개까지 열 수 있습니다.', 'err');
    if (key === T.cur) stage(cur());
    var n = { key: 't' + (++T.seq), id: t.id, title: t.title, st: t.st ? JSON.parse(JSON.stringify(t.st)) : { tab: A.tab || 'overview' }, work: null, dirty: false, seen: t.seen || 0 };
    if (n.st && n.st.rpt) n.st.rpt.sel = {};
    T.tabs.splice(idxOf(key) + 1, 0, n); n.restore = true; T.want = n.key; stage(cur()); T.cur = n.key; persist(); go(n);
  }
  function reopen() {
    var c = T.closed.shift(); if (!c) return A.toast('다시 열 탭이 없습니다.');
    if (T.tabs.filter(function (x) { return x.id === c.id; })[0] && prefs().dupe === 'goto') { var ex = T.tabs.filter(function (x) { return x.id === c.id; })[0]; return activate(ex.key); }
    if (T.tabs.length >= prefs().maxTabs) return A.toast('작업 탭은 최대 ' + prefs().maxTabs + '개까지 열 수 있습니다.', 'err');
    var t = { key: 't' + (++T.seq), id: c.id, title: c.title, st: c.st, work: null, dirty: false, seen: 0 }; T.tabs.push(t); stage(cur()); t.restore = true; T.want = t.key; T.cur = t.key; persist(); go(t);
  }

  /* ───────────── 화면 ───────────── */
  function dot(t) { var it = (A.list || []).filter(function (s) { return s.id === t.id; })[0]; var ph = it ? it.phase : ''; return '<span class="sdot ' + (ph === 'open' ? 'open' : ph === 'draft' ? 'draft' : 'done') + '" title="' + E(ph ? A.phaseLabel(ph) : '') + '"></span>'; }
  function paint() {
    var nav = document.getElementById('stabs'); if (!nav) return;
    if (!A.token) { nav.innerHTML = ''; nav.style.display = 'none'; return; } nav.style.display = '';
    var p = prefs();
    nav.innerHTML = '<div class="stabs-in"><div class="stab home' + (T.cur === 'home' ? ' on' : '') + '" data-k="home" role="tab" aria-selected="' + (T.cur === 'home') + '" title="설문 목록">' + I('list', 14) + '<span class="tt">설문 목록</span></div>' +
      T.tabs.map(function (t) {
        var on = t.key === T.cur, d = p.dirtyConfirm && isDirty(t), nb = !on && T.counts[t.id] > (t.seen || 0) ? T.counts[t.id] - (t.seen || 0) : 0;
        return '<div class="stab' + (on ? ' on' : '') + '" draggable="true" data-k="' + t.key + '" role="tab" aria-selected="' + on + '" title="' + E(t.title) + '">' + dot(t) + '<span class="tt">' + E(t.title) + '</span>' + (d ? '<span class="sdirty" title="저장하지 않은 변경">●</span>' : '') + (nb ? '<span class="snew" title="새 응답">+' + nb + '</span>' : '') + '<button class="sx" data-x="' + t.key + '" aria-label="탭 닫기" title="닫기">' + I('x', 12) + '</button></div>';
      }).join('') + '<button class="sadd" data-a="add" title="설문 목록에서 설문 열기">' + I('plus', 14) + '</button><span class="sp"></span>' +
      (T.closed.length ? '<button class="sico" data-a="reopen" title="닫은 탭 다시 열기 (Ctrl+Alt+T)">' + I('refresh', 14) + '</button>' : '') + '<button class="sico" data-a="prefs" title="작업 탭·화면 설정">' + I('gear', 15) + '</button></div>';
    var on = nav.querySelector('.stab.on'); if (on && on.scrollIntoView) { try { on.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
  }
  function menu(x, y, key) {
    closeMenu(); var t = tab(key), i = idxOf(key), m = document.createElement('div'); m.className = 'smenu'; m.id = 'smenu'; m.style.left = x + 'px'; m.style.top = y + 'px';
    var items = key === 'home' ? [['reopen', '닫은 탭 다시 열기' + (T.closed.length ? ' (' + T.closed.length + ')' : ''), !T.closed.length], ['prefs', '설정', false]] :
      [['close', '탭 닫기', false], ['others', '다른 탭 닫기', T.tabs.length < 2], ['right', '오른쪽 탭 닫기', i >= T.tabs.length - 1], ['dup', '탭 복제(같은 설문을 다른 화면으로)', !t.id], ['reopen', '닫은 탭 다시 열기' + (T.closed.length ? ' (' + T.closed.length + ')' : ''), !T.closed.length], ['prefs', '설정', false]];
    m.innerHTML = items.map(function (it) { return '<button data-m="' + it[0] + '"' + (it[2] ? ' disabled' : '') + '>' + E(it[1]) + '</button>'; }).join('');
    document.body.appendChild(m); var r = m.getBoundingClientRect(); if (r.right > innerWidth) m.style.left = Math.max(4, innerWidth - r.width - 8) + 'px';
    m.addEventListener('click', function (e) { var b = e.target.closest('[data-m]'); if (!b || b.disabled) return; closeMenu(); var a = b.getAttribute('data-m');
      if (a === 'close') close(key); else if (a === 'others') closeMany(T.tabs.filter(function (x) { return x.key !== key; }).map(function (x) { return x.key; })); else if (a === 'right') closeMany(T.tabs.slice(i + 1).map(function (x) { return x.key; })); else if (a === 'dup') duplicate(key); else if (a === 'reopen') reopen(); else if (a === 'prefs') openPrefs(); });
  }
  function closeMenu() { var m = document.getElementById('smenu'); if (m) m.remove(); }

  /* ───────────── 설정 창 ───────────── */
  function openPrefs() {
    var p = prefs(), opt = function (name, label, desc, choices) { return '<div class="prow"><div><b>' + label + '</b><div class="muted" style="font-size:12.5px">' + desc + '</div></div><select class="fld" data-p="' + name + '" style="width:auto">' + choices.map(function (c) { return '<option value="' + c[0] + '"' + (String(p[name]) === String(c[0]) ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') + '</select></div>'; };
    var m = A.modal('<h3>작업 탭·화면 설정</h3><p class="muted" style="margin:2px 0 8px">이 브라우저에만 저장됩니다. 「추천」 표시가 기본값입니다.</p>' +
      opt('restore', '탭 복원', '브라우저를 닫았다 다시 열면 열려 있던 탭과 마지막 화면을 복원합니다.', [[true, '복원 (추천)'], [false, '복원 안 함']]) +
      opt('dupe', '같은 설문 다시 열기', '목록에서 이미 열린 설문을 누를 때의 동작입니다.', [['goto', '열린 탭으로 이동 (추천)'], ['new', '새 탭으로 열기']]) +
      opt('refresh', '실시간 갱신', '결과 화면의 5초 갱신 범위입니다. 「모든 탭」은 다른 탭에 새 응답 수(+n)를 표시합니다.', [['current', '보고 있는 탭만 (추천)'], ['all', '모든 열린 탭(새 응답 수 표시)']]) +
      opt('dirtyConfirm', '저장 안 한 변경 표시·확인', '탭에 점(●)을 표시하고 닫을 때 저장 여부를 묻습니다.', [[true, '사용 (추천)'], [false, '사용 안 함']]) +
      opt('maxTabs', '최대 탭 수', '한 번에 열 수 있는 설문 탭의 수입니다.', [[8, '8개'], [12, '12개 (추천)'], [20, '20개']]) +
      opt('keys', '키보드 단축키', 'Ctrl+Alt+←/→ 탭 이동, Ctrl+Alt+W 탭 닫기, Ctrl+Alt+T 닫은 탭 다시 열기 (브라우저 기본 Ctrl+Tab/W/Shift+T는 웹페이지에서 쓸 수 없습니다)', [[true, '사용 (추천)'], [false, '사용 안 함']]) +
      opt('rowClick', '목록 행 클릭', '리포트 대상 목록에서 행을 그냥 눌렀을 때의 동작입니다. (Ctrl·Shift 동작은 항상 같습니다)', [['replace', '그 행만 선택 (추천)'], ['toggle', '누를 때마다 선택/해제']]) +
      '<div class="btn-row"><button class="btn btn-ghost" data-m="reset">추천값으로 되돌리기</button><button class="btn btn-primary" data-m="ok">닫기</button></div>', null, 'prefs-modal');
    m.el.addEventListener('change', function (e) {
      var k = e.target.getAttribute('data-p'); if (!k) return; var v = e.target.value; if (v === 'true') v = true; else if (v === 'false') v = false; else if (/^\d+$/.test(v)) v = Number(v);
      var o = {}; o[k] = v; setPrefs(o); if (k === 'refresh') pollSetup(); paint();
    });
    m.el.addEventListener('click', function (e) { var b = e.target.closest('[data-m]'); if (!b) return; if (b.getAttribute('data-m') === 'ok') m.close(); else if (b.getAttribute('data-m') === 'reset') { try { localStorage.removeItem(PKEY); } catch (x) {} m.close(); openPrefs(); pollSetup(); paint(); } });
  }

  /* ───────────── 이벤트 ───────────── */
  var drag = null;
  document.addEventListener('click', function (e) {
    var nav = e.target.closest('#stabs'); if (!nav) { if (!e.target.closest('#smenu')) closeMenu(); return; }
    closeMenu();
    var x = e.target.closest('[data-x]'); if (x) { e.stopPropagation(); return close(x.getAttribute('data-x')); }
    var a = e.target.closest('[data-a]'); if (a) { var v = a.getAttribute('data-a'); if (v === 'add') return activate('home'); if (v === 'reopen') return reopen(); if (v === 'prefs') return openPrefs(); }
    var t = e.target.closest('.stab'); if (t) activate(t.getAttribute('data-k'));
  }, true);
  document.addEventListener('auxclick', function (e) { if (e.button !== 1) return; var t = e.target.closest('#stabs .stab'); if (t && t.getAttribute('data-k') !== 'home') { e.preventDefault(); close(t.getAttribute('data-k')); } });
  document.addEventListener('mousedown', function (e) { if (e.button === 1 && e.target.closest('#stabs .stab')) e.preventDefault(); });
  document.addEventListener('contextmenu', function (e) { var t = e.target.closest('#stabs .stab'); if (!t) return; e.preventDefault(); menu(e.clientX, e.clientY, t.getAttribute('data-k')); });
  document.addEventListener('dragstart', function (e) { var t = e.target.closest && e.target.closest('#stabs .stab'); if (!t || t.getAttribute('data-k') === 'home') { return; } drag = t.getAttribute('data-k'); try { e.dataTransfer.setData('text/plain', drag); e.dataTransfer.effectAllowed = 'move'; } catch (x) {} });
  document.addEventListener('dragover', function (e) { if (drag && e.target.closest && e.target.closest('#stabs')) e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    var tg = e.target.closest && e.target.closest('#stabs .stab'); if (!drag || !tg) return; e.preventDefault(); var to = tg.getAttribute('data-k'); if (to === drag) { drag = null; return; }
    var mv = tab(drag); if (!mv) { drag = null; return; } var r = tg.getBoundingClientRect(), after = e.clientX >= r.left + r.width / 2;
    T.tabs = T.tabs.filter(function (x) { return x !== mv; }); var ti = to === 'home' ? -1 : idxOf(to); T.tabs.splice(to === 'home' ? 0 : (after ? ti + 1 : ti), 0, mv); drag = null; paint(); persist();
  });
  document.addEventListener('dragend', function () { drag = null; });
  document.addEventListener('keydown', function (e) {
    if (!prefs().keys || !A.token || !e.ctrlKey || !e.altKey) return; var k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); var all = ['home'].concat(T.tabs.map(function (t) { return t.key; })), i = all.indexOf(T.cur); activate(all[(i + (k === 'ArrowRight' ? 1 : -1) + all.length) % all.length]); }
    else if (/^w$/i.test(k)) { e.preventDefault(); close(T.cur); } else if (/^t$/i.test(k)) { e.preventDefault(); reopen(); }
  });
  window.addEventListener('beforeunload', function () { stage(cur()); persist(); });

  /* ───────────── 새 응답 수 표시 (설정: 모든 열린 탭) ───────────── */
  async function pollOnce() {
    if (!A.token || prefs().refresh !== 'all' || T.tabs.length < 1 || document.hidden) return;
    try { var l = await A.rpc('svy_a_list'); l.forEach(function (s) { T.counts[s.id] = s.responses || 0; }); paint(); } catch (e) {}
  }
  function pollSetup() { clearInterval(T.timer); T.timer = null; if (prefs().refresh === 'all') { T.timer = setInterval(pollOnce, 20000); pollOnce(); } else { T.counts = {}; paint(); } }

  /* ───────────── 시작: 저장된 탭 복원 ───────────── */
  H.init = function () {
    if (prefs().restore) {
      try {
        var s = JSON.parse(localStorage.getItem(KEY) || 'null'), ids = (A.list || []).map(function (x) { return x.id; });
        if (s && s.tabs) { T.seq = s.seq || 0; T.tabs = s.tabs.filter(function (t) { return ids.indexOf(t.id) >= 0; }).slice(0, prefs().maxTabs).map(function (t) { var it = (A.list || []).filter(function (x) { return x.id === t.id; })[0]; return { key: t.key, id: t.id, title: (it && it.title) || t.title, st: t.st || null, work: null, dirty: false, seen: t.seen || 0 }; });
          var c = s.cur !== 'home' && tab(s.cur) ? tab(s.cur) : null;
          if (c && (!location.hash || /^#\/?$/.test(location.hash))) { c.restore = true; T.cur = c.key; T.want = c.key; try { history.replaceState(null, '', targetOf(c)); } catch (e) {} }
          else if (c) { c.restore = true; }
        }
      } catch (e) {}
    }
    pollSetup();
  };
})();
