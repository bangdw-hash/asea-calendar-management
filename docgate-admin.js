'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = DocGate.esc, IC = DocGate.ICON, api = DocGate.api;
  var MAX_UP = 15 * 1024 * 1024;
  var BLOCK_EXT = /\.(exe|bat|cmd|com|scr|msi|ps1|vbs|js|jar|dll|apk|sh)$/i;

  var A = null;                       // adminData
  var X = null;                       // 인덱스
  var cur = { sec: '', folder: '', trash: false };
  var sel = new Set(), anchor = '', focusId = '';
  var renaming = '';                  // 인라인 이름 변경 중인 id
  var expanded = {};                  // 트리 펼침 상태
  var undoStack = [];
  var DRAG = null;                    // 내부 드래그 { ids }
  var busy = false;
  var logsAll = [];
  var ctxTarget = null;

  /* ── 메시지 ────────────────────────────────────────────────────── */
  var stTimer = null;
  function status(text, cls) {
    var el = $('st'); el.className = 'st' + (cls ? ' ' + cls : ''); el.textContent = text || '';
    clearTimeout(stTimer);
    if (text && cls) stTimer = setTimeout(function () { el.textContent = ''; el.className = 'st'; }, 6000);
  }
  function msg(id, text, type) { var el = $(id); el.className = 'msg ' + (type || 'info'); el.textContent = text; }
  function clr(id) { var el = $(id); el.className = 'msg'; el.textContent = ''; }
  function fail(e) {
    if (e && e.code === 'AUTH') { Auth.logout(); return; }
    status((e && e.message) || '실패했습니다', 'err');
  }

  /* ── 인증·로딩 ─────────────────────────────────────────────────── */
  document.querySelectorAll('[data-i]').forEach(function (el) { el.innerHTML = IC[el.dataset.i] || ''; });
  Auth.onAuthChange(function (ok) {
    if (ok) start(); else { $('gate').style.display = ''; $('app').style.display = 'none'; }
  });
  document.addEventListener('DOMContentLoaded', function () { Auth.tryRestoreSession(); });
  $('loginBtn').addEventListener('click', async function () {
    var b = $('loginBtn'); b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
    try { await Auth.login({ chooseAccount: true }); }
    catch (e) { msg('gateMsg', e.message, 'error'); b.disabled = false; b.textContent = 'Google로 로그인'; }
  });

  async function start() {
    try { A = await api('adminData'); }
    catch (e) {
      $('gate').style.display = ''; $('app').style.display = 'none';
      var b = $('loginBtn'); b.disabled = false; b.textContent = 'Google로 로그인';
      if (e.code === 'PERM') msg('gateMsg', '이 계정에는 관리 권한이 없습니다. 전체 관리자에게 담당자 지정을 요청하세요.', 'error');
      else msg('gateMsg', e.message, 'error');
      if (e.code === 'PERM') { try { Auth.logout(); } catch (x) {} }
      return;
    }
    $('gate').style.display = 'none'; $('app').style.display = '';
    $('who2').textContent = A.me.email + (A.me.isSuper ? ' (전체 관리자)' : ' (섹션 담당자)');
    $('tabSettings').style.display = A.me.isSuper ? '' : 'none';
    index();
    if (!cur.sec || !X.secs[cur.sec]) cur = { sec: A.sections[0].id, folder: '', trash: false };
    renderAll();
  }
  async function reload(keep) {
    var d = await api('adminData'); A = d; index();
    if (!X.secs[cur.sec]) cur = { sec: A.sections[0] ? A.sections[0].id : '', folder: '', trash: false };
    if (cur.folder && (!X.byId[cur.folder] || X.byId[cur.folder].status === 'trash')) cur.folder = '';
    if (!keep) sel.clear();
    renderAll();
  }
  function index() {
    X = { byId: {}, secs: {} };
    A.sections.forEach(function (s) { X.secs[s.id] = s; });
    A.items.forEach(function (i) { X.byId[i.id] = i; });
  }

  /* ── 데이터 헬퍼 ───────────────────────────────────────────────── */
  function cmp(a, b) {
    return (a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1) || a.order - b.order || a.name.localeCompare(b.name, 'ko');
  }
  function kids(sec, parent) {
    return A.items.filter(function (i) { return i.sectionId === sec && i.parentId === parent && i.status !== 'trash'; }).sort(cmp);
  }
  function trashTop() {
    return A.items.filter(function (i) {
      if (i.status !== 'trash' || i.sectionId !== cur.sec) return false;
      var p = i.parentId && X.byId[i.parentId];
      return !p || p.status !== 'trash';
    }).sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
  }
  function pathOf(id) {
    var p = [], c = X.byId[id];
    while (c) { p.unshift(c); c = c.parentId ? X.byId[c.parentId] : null; }
    return p;
  }
  function descendants(id) {
    var out = [id];
    A.items.forEach(function (i) { if (i.parentId === id) out = out.concat(descendants(i.id)); });
    return out;
  }
  function fmtDate(s) { return String(s || '').slice(0, 16); }
  function visible() {
    if (cur.trash) return trashTop();
    var list = kids(cur.sec, cur.folder), q = $('flt').value.trim().toLowerCase();
    return q ? list.filter(function (i) { return (i.name + ' ' + i.aliases).toLowerCase().indexOf(q) >= 0; }) : list;
  }
  function uniqueName(base, sec, parent, ext) {
    var names = {};
    kids(sec, parent).forEach(function (i) { names[i.name.toLowerCase()] = 1; });
    var n = base, k = 2;
    while (names[n.toLowerCase()]) n = base + ' (' + (k++) + ')';
    return n;
  }
  function nameTaken(sec, parent, name, exceptIds) {
    var low = name.toLowerCase();
    return kids(sec, parent).some(function (i) { return exceptIds.indexOf(i.id) < 0 && i.name.toLowerCase() === low; });
  }

  /* ── 렌더 ──────────────────────────────────────────────────────── */
  function renderAll() { renderTree(); renderAddr(); renderRows(); renderToolbar(); renderSecSel(); }

  function renderSecSel() {
    var s = $('secSel');
    s.innerHTML = A.sections.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === cur.sec && !cur.trash ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') +
      '<option value="__trash"' + (cur.trash ? ' selected' : '') + '>휴지통</option>';
  }
  $('secSel').addEventListener('change', function () {
    if (this.value === '__trash') nav(cur.sec, '', true); else nav(this.value, '', false);
  });

  function treeKids(sec, parent, level) {
    var h = '';
    kids(sec, parent).filter(function (i) { return i.type === 'folder'; }).forEach(function (f) {
      var has = A.items.some(function (i) { return i.parentId === f.id && i.type === 'folder' && i.status !== 'trash'; });
      var open = !!expanded['f' + f.id];
      h += '<div class="tn' + (!cur.trash && cur.folder === f.id ? ' cur' : '') + '" data-tf="' + esc(f.id) + '" style="padding-left:' + (6 + level * 16) + 'px">' +
        '<span class="tg' + (has ? (open ? ' open' : '') : ' none') + '" data-tg="f' + esc(f.id) + '">' + IC.chev + '</span>' +
        '<span class="ic">' + IC.folder + '</span><span class="nm">' + esc(f.name) + '</span></div>';
      if (open && has) h += treeKids(sec, f.id, level + 1);
    });
    return h;
  }
  function renderTree() {
    var h = '';
    A.sections.forEach(function (s) {
      var open = expanded['s' + s.id] !== false;
      var has = A.items.some(function (i) { return i.sectionId === s.id && i.parentId === '' && i.type === 'folder' && i.status !== 'trash'; });
      h += '<div class="tn sect' + (!cur.trash && cur.sec === s.id && !cur.folder ? ' cur' : '') + '" data-ts="' + esc(s.id) + '">' +
        '<span class="tg' + (has ? (open ? ' open' : '') : ' none') + '" data-tg="s' + esc(s.id) + '">' + IC.chev + '</span>' +
        '<span class="ic">' + IC.folder + '</span><span class="nm">' + esc(s.name) + '</span>' +
        (s.access === 'restricted' ? '<span class="lk" title="허용 목록만 열람">' + IC.lock + '</span>' : '') + '</div>';
      if (open && has) h += treeKids(s.id, '', 1);
    });
    h += '<div class="tn trash' + (cur.trash ? ' cur' : '') + '" data-trash="1" style="margin-top:8px"><span class="tg none">' + IC.chev + '</span><span class="ic">' + IC.folder + '</span><span class="nm">휴지통</span></div>';
    $('tree').innerHTML = h;
  }

  function renderAddr() {
    var s = X.secs[cur.sec], h = '';
    if (cur.trash) { $('addr').innerHTML = '<button type="button" data-asec="' + esc(cur.sec) + '">' + esc(s ? s.name : '') + '</button><span class="ch">' + IC.chev + '</span><button type="button" disabled>휴지통</button>'; return; }
    h = '<button type="button" data-asec="' + esc(cur.sec) + '">' + esc(s ? s.name : '') + '</button>';
    pathOf(cur.folder).forEach(function (f) { h += '<span class="ch">' + IC.chev + '</span><button type="button" data-af="' + esc(f.id) + '">' + esc(f.name) + '</button>'; });
    $('addr').innerHTML = h;
  }

  function renderRows() {
    var list = visible(), h = '';
    list.forEach(function (it) {
      var isF = it.type === 'folder';
      var link = isF ? '' : (it.hasFile ? it.fileName : (it.keyword ? '폴더 검색: ' + it.keyword : '미연결'));
      var where = cur.trash ? ' <span style="color:var(--mute)">(' + esc(pathOf(it.parentId).map(function (p) { return p.name; }).concat('').join(' / ')) + ')</span>' : '';
      h += '<div class="row2' + (sel.has(it.id) ? ' sel' : '') + (focusId === it.id ? ' foc' : '') + '" data-id="' + esc(it.id) + '"' + (renaming === it.id || cur.trash ? '' : ' draggable="true"') + '>' +
        '<div class="c-nm"><span class="ic">' + (isF ? IC.folder : IC.file) + '</span>' +
        (renaming === it.id ? '<input class="rn" id="rnInput" value="' + esc(it.name) + '" maxlength="100">' : '<span class="t" title="' + esc(it.name) + '">' + esc(it.name) + '</span>' + where) + '</div>' +
        '<span class="m">' + (isF ? '폴더' : '서식') + '</span><span class="m">' + esc(fmtDate(it.updatedAt)) + '</span>' +
        '<span class="m" title="' + esc(link) + '">' + esc(link) + '</span>' +
        '<span class="m">' + (isF ? '' : (it.versions || 0)) + '</span><span class="m">' + (isF ? '' : it.dl) + '</span>' +
        '<button class="more" type="button" data-more="' + esc(it.id) + '" aria-label="메뉴">&#8942;</button></div>';
    });
    if (!list.length) h = '<div class="empty2">' + (cur.trash ? '휴지통이 비어 있습니다.' : ($('flt').value.trim() ? '찾는 항목이 없습니다.' : '비어 있는 폴더입니다.<br>PC의 파일을 이 영역으로 끌어다 놓으면 서식으로 등록됩니다.')) + '</div>';
    $('rows').innerHTML = h;
    $('cnt').textContent = list.length + '개 항목' + (sel.size ? ' · ' + sel.size + '개 선택' : '');
    if (renaming) { var inp = $('rnInput'); if (inp) { inp.focus(); var dot = inp.value.lastIndexOf('.'); inp.setSelectionRange(0, inp.value.length); } }
  }

  function updateSel() {                // 선택 표시만 갱신(행을 다시 그리지 않아 더블클릭이 끊기지 않음)
    rowsEl.querySelectorAll('.row2').forEach(function (r) {
      r.classList.toggle('sel', sel.has(r.dataset.id)); r.classList.toggle('foc', focusId === r.dataset.id);
    });
    $('cnt').textContent = visible().length + '개 항목' + (sel.size ? ' · ' + sel.size + '개 선택' : '');
    renderToolbar();
  }

  function renderToolbar() {
    var one = sel.size === 1, any = sel.size > 0, t = cur.trash;
    $('bFolder').disabled = $('bDoc').disabled = $('bUpload').disabled = t;
    $('bRename').disabled = !one || t;
    $('bDel').disabled = !any;
    $('bDel').firstChild.nodeValue = t ? '영구 삭제 ' : '삭제 ';
    $('bUndo').disabled = !undoStack.length;
  }

  /* ── 이동·선택 ─────────────────────────────────────────────────── */
  function nav(sec, folder, trash) {
    cur = { sec: sec, folder: folder || '', trash: !!trash };
    sel.clear(); anchor = focusId = ''; renaming = ''; $('flt').value = '';
    pathOf(folder).forEach(function (p) { expanded['f' + p.id] = true; });
    expanded['s' + sec] = true;
    renderAll();
  }
  $('tree').addEventListener('click', function (e) {
    var tg = e.target.closest('[data-tg]');
    if (tg && !tg.classList.contains('none')) {
      var k = tg.dataset.tg, isOpen = k.charAt(0) === 's' ? expanded[k] !== false : !!expanded[k];
      expanded[k] = !isOpen; renderTree(); return;
    }
    var n = e.target.closest('.tn'); if (!n) return;
    if (n.dataset.trash) nav(cur.sec, '', true);
    else if (n.dataset.ts) nav(n.dataset.ts, '', false);
    else if (n.dataset.tf) nav(X.byId[n.dataset.tf].sectionId, n.dataset.tf, false);
  });
  $('addr').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.asec) nav(b.dataset.asec, '', false); else if (b.dataset.af) nav(cur.sec, b.dataset.af, false);
  });
  function openItem(id) {
    var it = X.byId[id]; if (!it) return;
    if (cur.trash) return;
    if (it.type === 'folder') nav(it.sectionId, it.id, false); else openProps(id);
  }

  var rowsEl = $('rows');
  rowsEl.addEventListener('mousedown', function (e) { if (!e.target.closest('input')) rowsEl.focus({ preventScroll: true }); });
  rowsEl.addEventListener('click', function (e) {
    if (e.target.closest('input')) return;
    var more = e.target.closest('[data-more]');
    if (more) { var r = more.getBoundingClientRect(); sel.clear(); sel.add(more.dataset.more); updateSel(); showCtx(r.left - 150, r.bottom, 'row'); return; }
    var row = e.target.closest('.row2');
    if (!row) { sel.clear(); anchor = focusId = ''; updateSel(); return; }
    var id = row.dataset.id, ids = visible().map(function (i) { return i.id; });
    if (e.shiftKey && anchor) {
      var a = ids.indexOf(anchor), b = ids.indexOf(id);
      if (!e.ctrlKey && !e.metaKey) sel.clear();
      for (var i = Math.min(a, b); i <= Math.max(a, b); i++) sel.add(ids[i]);
    } else if (e.ctrlKey || e.metaKey) {
      if (sel.has(id)) sel.delete(id); else sel.add(id); anchor = id;
    } else { sel.clear(); sel.add(id); anchor = id; }
    focusId = id; updateSel();
  });
  rowsEl.addEventListener('dblclick', function (e) {
    var row = e.target.closest('.row2'); if (row && !e.target.closest('input')) openItem(row.dataset.id);
  });
  rowsEl.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    var row = e.target.closest('.row2');
    if (row) { if (!sel.has(row.dataset.id)) { sel.clear(); sel.add(row.dataset.id); focusId = row.dataset.id; updateSel(); } showCtx(e.clientX, e.clientY, 'row'); }
    else { sel.clear(); updateSel(); showCtx(e.clientX, e.clientY, 'bg'); }
  });
  $('flt').addEventListener('input', function () { sel.clear(); renderRows(); renderToolbar(); });

  /* ── 컨텍스트 메뉴 ─────────────────────────────────────────────── */
  function showCtx(x, y, kind) {
    var one = sel.size === 1 && X.byId[[].concat(Array.from(sel))[0]], items = [];
    if (cur.trash) {
      if (sel.size) items = [['복원', restoreSel], ['영구 삭제', purgeSel, 'dn']];
    } else if (kind === 'bg') {
      items = [['새 폴더', newFolder], ['서식 추가', newDoc], ['파일 올리기...', function () { $('fileIn').click(); }]];
    } else if (sel.size) {
      if (one && one.type === 'folder') items.push(['열기', function () { openItem(one.id); }, '', 'Enter']);
      if (one && one.type === 'doc') items.push(['속성·파일 관리...', function () { openProps(one.id); }, '', 'Enter'], ['새 버전 올리기...', function () { pickVersion(one.id); }], ['버전 이력...', function () { openVersions(one.id); }]);
      if (one && one.type === 'folder') items.push(['속성...', function () { openProps(one.id); }]);
      if (one) items.push(['이름 바꾸기', startRename, '', 'F2']);
      items.push(['삭제', trashSel, 'dn', 'Del']);
    }
    if (!items.length) return;
    var m = $('ctx');
    m.innerHTML = items.map(function (it, i) { return '<button type="button" class="' + (it[2] || '') + '" data-ci="' + i + '"><span>' + esc(it[0]) + '</span>' + (it[3] ? '<kbd>' + it[3] + '</kbd>' : '') + '</button>'; }).join('');
    m.style.display = 'block';
    m.style.left = Math.max(4, Math.min(x, window.innerWidth - 220)) + 'px';
    m.style.top = Math.max(4, Math.min(y, window.innerHeight - items.length * 38 - 16)) + 'px';
    ctxTarget = items;
  }
  $('ctx').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ci]'); if (!b) return;
    var fn = ctxTarget[Number(b.dataset.ci)][1]; hideCtx(); fn();
  });
  function hideCtx() { $('ctx').style.display = 'none'; }
  document.addEventListener('click', function (e) { if (!e.target.closest('#ctx')) hideCtx(); });
  window.addEventListener('blur', hideCtx);
  window.addEventListener('scroll', hideCtx, true);

  /* ── 낙관적 변경 + 실패 시 복구 ────────────────────────────────── */
  async function run(label, local, remote, undoFn) {
    if (busy) { status('이전 작업을 처리하는 중입니다. 잠시만 기다리세요', 'err'); return false; }
    busy = true;
    try {
      if (local) local();
      renderAll();
      status(label + ' 중…');
      var r = await remote();
      if (undoFn) { undoStack.push({ label: label, fn: undoFn(r) }); if (undoStack.length > 30) undoStack.shift(); }
      status(label + ' 완료', 'ok');
      renderToolbar();
      return r === undefined ? true : r;
    } catch (e) {
      fail(e);
      try { await reload(true); } catch (x) {}
      return false;
    } finally { busy = false; }
  }

  /* ── 작업: 새 폴더·서식 ────────────────────────────────────────── */
  async function create(type, name, parent) {
    var r = await api('itemCreate', { sectionId: cur.sec, parentId: parent === undefined ? cur.folder : parent, type: type, name: name });
    return r.id;
  }
  async function newFolder() {
    if (cur.trash) return;
    var name = uniqueName('새 폴더', cur.sec, cur.folder), id;
    var ok = await run('새 폴더 만들기', null, async function () { id = await create('folder', name); await reload(true); return id; },
      function (nid) { return function () { return doTrash([nid], true); }; });
    if (ok && id) { sel.clear(); sel.add(id); focusId = id; renaming = id; renderRows(); renderToolbar(); }
  }
  async function newDoc() {
    if (cur.trash) return;
    var name = uniqueName('새 서식', cur.sec, cur.folder), id;
    var ok = await run('서식 추가', null, async function () { id = await create('doc', name); await reload(true); return id; },
      function (nid) { return function () { return doTrash([nid], true); }; });
    if (ok && id) { sel.clear(); sel.add(id); focusId = id; renaming = id; renderRows(); renderToolbar(); }
  }
  $('bFolder').addEventListener('click', newFolder);
  $('bDoc').addEventListener('click', newDoc);

  /* ── 이름 바꾸기 (F2) ──────────────────────────────────────────── */
  function startRename() {
    if (cur.trash || sel.size !== 1) return;
    renaming = [].concat(Array.from(sel))[0]; renderRows();
  }
  $('bRename').addEventListener('click', startRename);
  rowsEl.addEventListener('keydown', function (e) {
    if (e.target.id !== 'rnInput') return;
    if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
    if (e.key === 'Escape') { e.preventDefault(); renaming = ''; renderRows(); rowsEl.focus(); }
    e.stopPropagation();
  });
  rowsEl.addEventListener('focusout', function (e) { if (e.target.id === 'rnInput' && renaming) commitRename(); });
  async function commitRename() {
    var id = renaming, inp = $('rnInput'); if (!id || !inp) return;
    renaming = '';
    var it = X.byId[id], nn = inp.value.replace(/[\\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim(), old = it.name;
    if (!nn || nn === old) { renderRows(); return; }
    if (nameTaken(it.sectionId, it.parentId, nn, [id])) { status('같은 이름이 이미 있습니다: ' + nn, 'err'); renderRows(); return; }
    await run('이름 바꾸기', function () { it.name = nn; }, function () { return api('itemUpdate', { id: id, name: nn }); },
      function () { return function () { return doRename(id, old); }; });
  }
  function doRename(id, name) {
    var it = X.byId[id];
    return run('이름 되돌리기', function () { if (it) it.name = name; }, function () { return api('itemUpdate', { id: id, name: name }); });
  }

  /* ── 삭제·복원·영구삭제 ────────────────────────────────────────── */
  function doTrash(ids, quiet) {
    var all = []; ids.forEach(function (i) { all = all.concat(descendants(i)); });
    return run('삭제', function () {
      all.forEach(function (i) { if (X.byId[i]) X.byId[i].status = 'trash'; });
      sel.clear();
    }, function () { return api('itemTrash', { ids: ids }); },
      function () { return function () { return doRestore(ids); }; });
  }
  function doRestore(ids) {
    return run('복원', null, async function () { await api('itemRestore', { ids: ids }); await reload(true); },
      function () { return function () { return doTrash(ids); }; });
  }
  function trashSel() {
    if (!sel.size) return;
    var ids = Array.from(sel), n = ids.length;
    var hasFolder = ids.some(function (i) { return X.byId[i] && X.byId[i].type === 'folder'; });
    if (hasFolder && !confirm('선택한 ' + n + '개 항목(하위 항목 포함)을 휴지통으로 보냅니다.\n휴지통에서 복원할 수 있습니다.')) return;
    doTrash(ids);
  }
  function restoreSel() { if (sel.size) { var ids = Array.from(sel); sel.clear(); doRestore(ids); } }
  function purgeSel() {
    if (!sel.size) return;
    var ids = Array.from(sel);
    if (!confirm('선택한 ' + ids.length + '개 항목을 영구 삭제합니다.\n하위 항목과 서버에 올린 파일도 함께 지워지며 되돌릴 수 없습니다(Drive 휴지통에는 30일 보관).\n계속하시겠습니까?')) return;
    run('영구 삭제', function () { descendants_all(ids).forEach(function (i) { A.items = A.items.filter(function (x) { return x.id !== i; }); }); sel.clear(); index(); },
      function () { return api('itemPurge', { ids: ids }); });
  }
  function descendants_all(ids) { var o = []; ids.forEach(function (i) { o = o.concat(descendants(i)); }); return o; }
  $('bDel').addEventListener('click', function () { if (cur.trash) purgeSel(); else trashSel(); });

  /* ── 이동(드래그앤드롭) ───────────────────────────────────────── */
  function move(ids, secId, parentId, beforeId) {
    // 검증: 자기 안으로 이동 금지, 중복 이름 금지
    for (var i = 0; i < ids.length; i++) {
      var it = X.byId[ids[i]];
      if (!it) return Promise.resolve(false);
      if (parentId && descendants(it.id).indexOf(parentId) >= 0) { status('폴더를 자기 자신 안으로 옮길 수 없습니다', 'err'); return Promise.resolve(false); }
      if (it.sectionId !== secId && descendants(it.id).some(function (d) { var x = X.byId[d]; return x.type === 'doc' && !x.hasFile; })) {
        status('폴더 검색 방식 서식은 다른 섹션으로 옮길 수 없습니다. 먼저 파일을 올려 연결하세요', 'err'); return Promise.resolve(false);
      }
      if (nameTaken(secId, parentId, it.name, ids)) { status('대상 위치에 같은 이름이 있습니다: ' + it.name, 'err'); return Promise.resolve(false); }
    }
    var prev = ids.map(function (id) {
      var it = X.byId[id], sibs = kids(it.sectionId, it.parentId), at = sibs.map(function (s) { return s.id; }).indexOf(id), nxt = sibs[at + 1];
      return { id: id, sec: it.sectionId, parent: it.parentId, before: nxt && ids.indexOf(nxt.id) < 0 ? nxt.id : '' };
    });
    return run('이동', function () {
      ids.forEach(function (id) {
        var it = X.byId[id];
        it.parentId = parentId;
        descendants(id).forEach(function (d) { X.byId[d].sectionId = secId; });
      });
      var order = kids(secId, parentId).filter(function (s) { return ids.indexOf(s.id) < 0; }).map(function (s) { return s.id; });
      var at = beforeId ? order.indexOf(beforeId) : -1; if (at < 0) at = order.length;
      order.splice.apply(order, [at, 0].concat(ids));
      order.forEach(function (id, k) { X.byId[id].order = (k + 1) * 10; });
      sel.clear(); ids.forEach(function (i) { sel.add(i); });
    }, function () { return api('itemMove', { ids: ids, sectionId: secId, parentId: parentId, beforeId: beforeId || '' }); },
      function () {
        return async function () {
          // 이전 위치별로 되돌림
          for (var k = 0; k < prev.length; k++) {
            var p = prev[k];
            await move([p.id], p.sec, p.parent, p.before);
          }
        };
      });
  }

  rowsEl.addEventListener('dragstart', function (e) {
    var row = e.target.closest('.row2'); if (!row || cur.trash) { e.preventDefault(); return; }
    var id = row.dataset.id;
    if (!sel.has(id)) { sel.clear(); sel.add(id); updateSel(); }
    DRAG = { ids: Array.from(sel) };
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', 'docgate:' + DRAG.ids.join(',')); } catch (x) {}
    setTimeout(function () { DRAG.ids.forEach(function (i) { var r = rowsEl.querySelector('[data-id="' + i + '"]'); if (r) r.classList.add('dragging'); }); }, 0);
  });
  document.addEventListener('dragend', function () { DRAG = null; clearDrop(); $('pane').classList.remove('filedrag'); });

  function clearDrop() {
    document.querySelectorAll('.drop-into,.drop-before,.drop-after,.dragging').forEach(function (el) { el.classList.remove('drop-into', 'drop-before', 'drop-after', 'dragging'); });
  }
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
  function zoneOf(row, e) {
    var it = X.byId[row.dataset.id], r = row.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
    if (it.type === 'folder') return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'into';
    return y < 0.5 ? 'before' : 'after';
  }
  function canDropOn(targetId) {   // 자기 자신·하위로는 불가
    if (!DRAG) return true;
    return DRAG.ids.every(function (i) { return i !== targetId && descendants(i).indexOf(targetId) < 0; });
  }

  rowsEl.addEventListener('dragover', function (e) {
    if (cur.trash) return;
    var files = hasFiles(e);
    if (!DRAG && !files) return;
    e.preventDefault(); clearDrop();
    if (DRAG) DRAG.ids.forEach(function (i) { var r = rowsEl.querySelector('[data-id="' + i + '"]'); if (r) r.classList.add('dragging'); });
    var row = e.target.closest('.row2');
    if (files) {
      $('pane').classList.add('filedrag');
      var it = row && X.byId[row.dataset.id];
      $('dz').innerHTML = it ? (it.type === 'folder' ? '「' + esc(it.name) + '」 폴더에 서식으로 등록' : '「' + esc(it.name) + '」의 새 버전으로 올리기') : '이 폴더에 서식으로 등록<br><span style="font-weight:500;font-size:13px">파일 이름이 서식 이름이 되며, 같은 이름이 있으면 새 버전으로 올립니다</span>';
      if (row) row.classList.add('drop-into');
      return;
    }
    e.dataTransfer.dropEffect = 'move';
    if (!row) { rowsEl.dataset.zone = 'end'; return; }
    if (!canDropOn(row.dataset.id)) { e.dataTransfer.dropEffect = 'none'; return; }
    var z = zoneOf(row, e); rowsEl.dataset.zone = z;
    row.classList.add(z === 'into' ? 'drop-into' : z === 'before' ? 'drop-before' : 'drop-after');
  });
  rowsEl.addEventListener('dragleave', function (e) {
    if (!rowsEl.contains(e.relatedTarget)) { clearDrop(); $('pane').classList.remove('filedrag'); }
  });
  rowsEl.addEventListener('drop', function (e) {
    if (cur.trash) return;
    var row = e.target.closest('.row2'), files = hasFiles(e);
    e.preventDefault(); $('pane').classList.remove('filedrag');
    if (files) { var fl = Array.from(e.dataTransfer.files); clearDrop(); dropFiles(fl, row ? row.dataset.id : ''); return; }
    if (!DRAG) return;
    var ids = DRAG.ids.slice(); clearDrop(); DRAG = null;
    if (!row) { move(ids, cur.sec, cur.folder, ''); return; }
    var tid = row.dataset.id; if (ids.indexOf(tid) >= 0) return;
    var z = zoneOf(row, e), t = X.byId[tid];
    if (z === 'into' && t.type === 'folder') { move(ids, t.sectionId, t.id, ''); return; }
    var sibs = kids(t.sectionId, t.parentId).filter(function (s) { return ids.indexOf(s.id) < 0; });
    var at = sibs.map(function (s) { return s.id; }).indexOf(tid);
    var before = z === 'before' ? tid : (sibs[at + 1] ? sibs[at + 1].id : '');
    move(ids, t.sectionId, t.parentId, before);
  });

  // 트리·주소줄·섹션으로 드롭
  function dropTargetOf(el) {
    var n = el.closest('.tn'), b = el.closest('#addr button');
    if (n && n.dataset.ts) return { sec: n.dataset.ts, parent: '', el: n };
    if (n && n.dataset.tf) return { sec: X.byId[n.dataset.tf].sectionId, parent: n.dataset.tf, el: n };
    if (b && b.dataset.asec) return { sec: b.dataset.asec, parent: '', el: b };
    if (b && b.dataset.af) return { sec: cur.sec, parent: b.dataset.af, el: b };
    return null;
  }
  ['tree', 'addr'].forEach(function (id) {
    $(id).addEventListener('dragover', function (e) {
      var t = dropTargetOf(e.target);
      if (!t || (!DRAG && !hasFiles(e))) return;
      if (DRAG && !canDropOn(t.parent)) return;
      e.preventDefault(); clearDrop(); t.el.classList.add('drop-into');
      if (DRAG) DRAG.ids.forEach(function (i) { var r = rowsEl.querySelector('[data-id="' + i + '"]'); if (r) r.classList.add('dragging'); });
    });
    $(id).addEventListener('dragleave', function (e) { if (!$(id).contains(e.relatedTarget)) clearDrop(); });
    $(id).addEventListener('drop', function (e) {
      var t = dropTargetOf(e.target); if (!t) return;
      e.preventDefault();
      if (hasFiles(e)) { var fl = Array.from(e.dataTransfer.files); clearDrop(); uploadFiles(fl, { sec: t.sec, parent: t.parent }); return; }
      if (!DRAG) return;
      var ids = DRAG.ids.slice(); clearDrop(); DRAG = null;
      move(ids, t.sec, t.parent, '');
    });
  });
  // 창 밖에 파일을 떨어뜨려 브라우저가 파일을 여는 사고 방지
  window.addEventListener('dragover', function (e) { if (hasFiles(e) && !e.target.closest('#rows,#tree,#addr')) e.preventDefault(); });
  window.addEventListener('drop', function (e) { if (hasFiles(e) && !e.target.closest('#rows,#tree,#addr')) e.preventDefault(); });

  /* ── 파일 업로드 ───────────────────────────────────────────────── */
  function readB64(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(',')[1] || ''); };
      fr.onerror = function () { rej(new Error('파일을 읽을 수 없습니다: ' + file.name)); };
      fr.readAsDataURL(file);
    });
  }
  function dropFiles(files, rowId) {
    var it = rowId && X.byId[rowId];
    if (it && it.type === 'doc') { uploadFiles(files.slice(0, 1), { docId: it.id }); }
    else if (it && it.type === 'folder') uploadFiles(files, { sec: it.sectionId, parent: it.id });
    else uploadFiles(files, { sec: cur.sec, parent: cur.folder });
  }
  async function uploadFiles(files, target) {
    if (busy) { status('이전 작업을 처리하는 중입니다', 'err'); return; }
    if (!files.length) return;
    var bad = files.filter(function (f) { return f.size > MAX_UP || BLOCK_EXT.test(f.name) || !f.size; });
    if (bad.length) status('올릴 수 없는 파일 제외: ' + bad.map(function (f) { return f.name; }).join(', ') + ' (15MB 초과·실행 파일·빈 파일)', 'err');
    files = files.filter(function (f) { return bad.indexOf(f) < 0; });
    if (!files.length) return;
    // 같은 이름 서식이 있으면 새 버전으로 올릴지 확인
    var plan = files.map(function (f) {
      var base = f.name.replace(/\.[^.]+$/, '').replace(/[\\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || f.name;
      var exist = target.docId ? X.byId[target.docId] : kids(target.sec, target.parent).filter(function (i) { return i.type === 'doc' && i.name.toLowerCase() === base.toLowerCase(); })[0];
      return { file: f, name: base, doc: exist };
    });
    var dup = plan.filter(function (p) { return p.doc; });
    if (dup.length && !confirm('다음 서식은 이미 있어 새 버전으로 올립니다. 이전 버전은 이력에 보관됩니다.\n\n' + dup.map(function (p) { return '- ' + p.doc.name; }).join('\n') + '\n\n계속하시겠습니까?')) return;
    busy = true;
    var done = 0;
    try {
      for (var i = 0; i < plan.length; i++) {
        var p = plan[i];
        status('업로드 중 (' + (i + 1) + '/' + plan.length + ') ' + p.file.name + ' …');
        var b64 = await readB64(p.file), id = p.doc ? p.doc.id : null;
        if (!id) id = (await api('itemCreate', { sectionId: target.sec, parentId: target.parent, type: 'doc', name: p.name })).id;
        try { await api('upload', { itemId: id, fileName: p.file.name, mime: p.file.type || 'application/octet-stream', b64: b64 }); }
        catch (e) { if (!p.doc) { try { await api('itemTrash', { ids: [id] }); } catch (x) {} } throw e; }
        done++;
      }
      status(done + '개 파일을 올렸습니다', 'ok');
    } catch (e) { fail(e); status((e.message || '') + (done ? ' (' + done + '개는 완료)' : ''), 'err'); }
    finally { busy = false; try { await reload(true); } catch (x) {} }
  }
  $('bUpload').addEventListener('click', function () { $('fileIn').value = ''; $('fileIn').click(); });
  $('fileIn').addEventListener('change', function () { var f = Array.from(this.files); this.value = ''; uploadFiles(f, { sec: cur.sec, parent: cur.folder }); });
  var verFor = '';
  function pickVersion(id) { verFor = id; $('verIn').value = ''; $('verIn').click(); }
  $('verIn').addEventListener('change', function () { var f = Array.from(this.files); this.value = ''; if (f.length && verFor) uploadFiles(f.slice(0, 1), { docId: verFor }); });

  /* ── 속성 ──────────────────────────────────────────────────────── */
  var propId = '';
  function openProps(id) {
    var it = X.byId[id]; if (!it) return; propId = id;
    $('dpTitle').textContent = (it.type === 'folder' ? '폴더 속성' : '서식 속성');
    $('dpName').value = it.name; $('dpAlias').value = it.aliases || ''; $('dpNote').value = it.note || ''; $('dpKw').value = it.keyword || '';
    $('dpKwWrap').style.display = it.type === 'doc' ? '' : 'none';
    $('dpVer').style.display = $('dpUp').style.display = it.type === 'doc' ? '' : 'none';
    $('dpInfo').innerHTML = '위치: ' + esc(X.secs[it.sectionId].name + ' / ' + pathOf(it.parentId).map(function (p) { return p.name; }).concat(it.name).join(' / ')) + '<br>' +
      (it.type === 'doc' ? '연결: ' + esc(it.hasFile ? '업로드 파일 ' + it.fileName + ' (버전 ' + it.versions + '개)' : (it.keyword ? '폴더에서 「' + it.keyword + '」 검색' : '아직 연결되지 않음 — 파일을 올리거나 검색어를 입력하세요')) + '<br>' : '') +
      '마지막 수정: ' + esc(fmtDate(it.updatedAt) + ' ' + (it.updatedBy || ''));
    clr('dpMsg'); $('dProp').showModal();
  }
  $('dpCancel').addEventListener('click', function () { $('dProp').close(); });
  $('dpUp').addEventListener('click', function () { $('dProp').close(); pickVersion(propId); });
  $('dpVer').addEventListener('click', function () { $('dProp').close(); openVersions(propId); });
  $('dpSave').addEventListener('click', async function () {
    var it = X.byId[propId], p = { id: propId };
    var nn = $('dpName').value.trim();
    if (!nn) return msg('dpMsg', '이름을 입력하세요', 'error');
    if (nn !== it.name) p.name = nn;
    if ($('dpAlias').value.trim() !== (it.aliases || '')) p.aliases = $('dpAlias').value.trim();
    if ($('dpNote').value.trim() !== (it.note || '')) p.note = $('dpNote').value.trim();
    if (it.type === 'doc' && $('dpKw').value.trim() !== (it.keyword || '')) p.keyword = $('dpKw').value.trim();
    if (Object.keys(p).length === 1) { $('dProp').close(); return; }
    if (p.name && nameTaken(it.sectionId, it.parentId, p.name, [it.id])) return msg('dpMsg', '같은 이름이 이미 있습니다', 'error');
    var b = $('dpSave'); b.disabled = true;
    try { await api('itemUpdate', p); $('dProp').close(); await reload(true); status('저장했습니다', 'ok'); }
    catch (e) { msg('dpMsg', e.message, 'error'); }
    finally { b.disabled = false; }
  });

  /* ── 버전 ──────────────────────────────────────────────────────── */
  async function openVersions(id) {
    var it = X.byId[id]; if (!it) return;
    $('dvTitle').textContent = '버전 이력 — ' + it.name;
    $('dvBody').innerHTML = '<div class="loading-row">불러오는 중…</div>'; $('dVer').showModal();
    try {
      var vs = await api('versions', { itemId: id });
      $('dvBody').innerHTML = vs.length ? vs.map(function (v) {
        return '<div class="ver-row"><div class="vi"><div class="vn">' + esc(v.fileName) + (v.current ? ' <span class="badge">현재</span>' : '') + '</div>' +
          '<div class="vm">' + esc(v.at) + ' · ' + esc(v.uploadedBy) + ' · ' + Math.max(1, Math.round(v.size / 1024)) + 'KB</div></div>' +
          (v.current ? '' : '<button class="btn btn-outline btn-sm btn-auto" type="button" data-vr="' + esc(v.id) + '">이 버전으로 되돌리기</button>') + '</div>';
      }).join('') : '<div class="empty2">올린 파일이 없습니다.</div>';
      $('dvBody').dataset.item = id;
    } catch (e) { $('dvBody').innerHTML = '<div class="msg error">' + esc(e.message) + '</div>'; }
  }
  $('dvBody').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-vr]'); if (!b) return;
    if (!confirm('이 버전을 현재 버전으로 되돌립니다. 사용자는 이 파일을 받게 됩니다.')) return;
    b.disabled = true;
    try { await api('versionRestore', { itemId: this.dataset.item, versionId: b.dataset.vr }); $('dVer').close(); await reload(true); status('버전을 되돌렸습니다', 'ok'); }
    catch (er) { b.disabled = false; alert(er.message); }
  });
  $('dvClose').addEventListener('click', function () { $('dVer').close(); });

  /* ── 실행 취소 ─────────────────────────────────────────────────── */
  async function undo() {
    var u = undoStack.pop(); renderToolbar();
    if (!u) { status('되돌릴 작업이 없습니다'); return; }
    // 되돌리기 자체는 스택에 쌓지 않도록 임시 보관
    var keep = undoStack.slice();
    await u.fn();
    undoStack = keep; renderToolbar();
  }
  $('bUndo').addEventListener('click', undo);
  $('bRefresh').addEventListener('click', function () { reload(true).then(function () { status('새로 불러왔습니다', 'ok'); }).catch(fail); });

  /* ── 키보드 ────────────────────────────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    if (!A || $('p-files').style.display === 'none') return;
    if (document.querySelector('dialog[open]')) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    var list = visible(), ids = list.map(function (i) { return i.id; });
    var k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (k === 'F2') { e.preventDefault(); startRename(); }
    else if (k === 'Delete') { e.preventDefault(); if (cur.trash) purgeSel(); else trashSel(); }
    else if (ctrl && (k === 'a' || k === 'A')) { e.preventDefault(); sel = new Set(ids); updateSel(); }
    else if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); undo(); }
    else if (k === 'Escape') { sel.clear(); hideCtx(); updateSel(); }
    else if (k === 'Enter') { if (sel.size === 1) { e.preventDefault(); openItem([].concat(Array.from(sel))[0]); } }
    else if (k === 'Backspace' || (e.altKey && k === 'ArrowLeft')) {
      e.preventDefault();
      if (cur.trash) return;
      var f = cur.folder && X.byId[cur.folder]; if (f) nav(f.sectionId, f.parentId, false);
    }
    else if (k === 'ArrowDown' || k === 'ArrowUp') {
      if (!ids.length) return; e.preventDefault();
      var at = ids.indexOf(focusId); at = k === 'ArrowDown' ? Math.min(ids.length - 1, at + 1) : Math.max(0, at < 0 ? 0 : at - 1);
      var id = ids[at];
      if (e.shiftKey && anchor) { var a = ids.indexOf(anchor); sel = new Set(ids.slice(Math.min(a, at), Math.max(a, at) + 1)); }
      else { sel = new Set([id]); anchor = id; }
      focusId = id; updateSel();
      var r = rowsEl.querySelector('[data-id="' + id + '"]'); if (r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest' });
    }
  });

  /* ── 탭 ────────────────────────────────────────────────────────── */
  document.querySelector('.tabs').addEventListener('click', function (e) {
    var t = e.target.closest('.tab'); if (!t) return;
    document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('active', x === t); });
    ['files', 'logs', 'audit', 'settings'].forEach(function (n) { $('p-' + n).style.display = n === t.dataset.tab ? '' : 'none'; });
    if (t.dataset.tab === 'logs') loadLogs();
    if (t.dataset.tab === 'audit') loadAudit();
    if (t.dataset.tab === 'settings') renderSettings();
  });

  /* ── 로그·이력 ─────────────────────────────────────────────────── */
  async function loadLogs() {
    $('logBody').innerHTML = '<tr><td colspan="7" class="loading-row">불러오는 중…</td></tr>'; clr('logMsg');
    try { logsAll = await api('logs'); renderLogs(); } catch (e) { msg('logMsg', e.message, 'error'); $('logBody').innerHTML = ''; }
  }
  function logFiltered() {
    var q = $('logQ').value.trim().toLowerCase();
    return q ? logsAll.filter(function (r) { return (r['이름'] + r['이메일'] + r['서류명']).toLowerCase().indexOf(q) >= 0; }) : logsAll;
  }
  function renderLogs() {
    var rows = logFiltered();
    $('logBody').innerHTML = rows.length ? rows.map(function (r) {
      return '<tr>' + ['신청일시', '이름', '이메일', '직함', '서류명', '사유', '다운로드'].map(function (k) { return '<td title="' + esc(r[k]) + '">' + esc(r[k]) + '</td>'; }).join('') + '</tr>';
    }).join('') : '<tr><td colspan="7" class="loading-row">기록이 없습니다.</td></tr>';
    $('logCnt').textContent = '총 ' + rows.length + '건 (최근 3000건까지)';
  }
  $('logQ').addEventListener('input', renderLogs);
  $('logCsv').addEventListener('click', function () {
    var rows = logFiltered(); if (!rows.length) return alert('내려받을 데이터가 없습니다.');
    var cols = ['신청일시', '이름', '이메일', '직함', '서류명', '사유', '다운로드'];
    var csv = '﻿' + cols.join(',') + '\n' + rows.map(function (r) {
      return cols.map(function (k) { return '"' + String(r[k] || '').replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = '서류_다운로드로그_' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  });
  async function loadAudit() {
    $('audBody').innerHTML = '<tr><td colspan="5" class="loading-row">불러오는 중…</td></tr>'; clr('audMsg');
    try {
      var rows = await api('audit');
      $('audBody').innerHTML = rows.length ? rows.map(function (r) {
        return '<tr>' + ['at', 'email', 'action', 'target', 'detail'].map(function (k) { return '<td title="' + esc(r[k]) + '">' + esc(r[k]) + '</td>'; }).join('') + '</tr>';
      }).join('') : '<tr><td colspan="5" class="loading-row">기록이 없습니다.</td></tr>';
    } catch (e) { msg('audMsg', e.message, 'error'); $('audBody').innerHTML = ''; }
  }

  /* ── 설정(전체 관리자) ─────────────────────────────────────────── */
  function renderSettings() {
    clr('setMsg');
    $('secList').innerHTML = A.sections.map(function (s, i) {
      var cnt = A.items.filter(function (x) { return x.sectionId === s.id && x.type === 'doc' && x.status !== 'trash'; }).length;
      return '<div class="sec-line"><div class="ord"><button type="button" data-so="' + esc(s.id) + '" data-d="-1" aria-label="위로">&#9650;</button><button type="button" data-so="' + esc(s.id) + '" data-d="1" aria-label="아래로">&#9660;</button></div>' +
        '<div class="si"><div class="sn">' + esc(s.name) + (s.hidden ? ' <span class="badge" style="background:var(--orange-lt);color:var(--orange)">숨김</span>' : '') + '</div>' +
        '<div class="sm">서류 ' + cnt + '건 · 열람: ' + (s.access === 'all' ? '로그인한 모든 Google 계정' : '허용 목록 (' + esc(s.allowed || '없음 — 담당자만') + ')') + '<br>담당자: ' + esc(s.managers || '없음') + '</div></div>' +
        '<div class="btns"><button class="btn btn-outline btn-sm btn-auto" type="button" data-se="' + esc(s.id) + '">설정</button></div></div>';
    }).join('');
    $('deptTxt').value = A.depts || '';
    $('superTxt').value = A.supers || '';
  }
  $('secList').addEventListener('click', async function (e) {
    var ed = e.target.closest('[data-se]'), so = e.target.closest('[data-so]');
    if (ed) return openSec(ed.dataset.se);
    if (so) {
      var ids = A.sections.map(function (s) { return s.id; }), i = ids.indexOf(so.dataset.so), j = i + Number(so.dataset.d);
      if (j < 0 || j >= ids.length) return;
      ids.splice(j, 0, ids.splice(i, 1)[0]);
      try { await api('secOrder', { ids: ids }); await reload(true); renderSettings(); } catch (er) { msg('setMsg', er.message, 'error'); }
    }
  });
  $('secNew').addEventListener('click', function () { openSec(''); });

  var secId = '';
  function parseFolder(v) {
    v = String(v || '').trim();
    var m = v.match(/\/folders\/([\w-]{10,})/) || v.match(/[?&]id=([\w-]{10,})/);
    return m ? m[1] : v;
  }
  function openSec(id) {
    secId = id; var s = id ? X.secs[id] : null; clr('dsMsg');
    $('dsTitle').textContent = s ? '섹션 설정 — ' + s.name : '섹션 추가';
    $('dsName').value = s ? s.name : ''; $('dsFolder').value = s ? s.folderId : '';
    document.querySelector('input[name=dsAcc][value=' + (s && s.access === 'all' ? 'all' : 'restricted') + ']').checked = true;
    $('dsAllowed').value = s ? String(s.allowed || '').split(',').join('\n') : '';
    $('dsMgr').value = s ? String(s.managers || '').split(',').join('\n') : A.me.email;
    $('dsHidden').checked = !!(s && s.hidden);
    $('dsDel').style.display = s ? '' : 'none';
    $('dSec').showModal();
  }
  $('dsCancel').addEventListener('click', function () { $('dSec').close(); });
  $('dsSave').addEventListener('click', async function () {
    var b = $('dsSave'); b.disabled = true;
    try {
      var r = await api('secSave', { id: secId || undefined, name: $('dsName').value, folderId: parseFolder($('dsFolder').value),
        access: document.querySelector('input[name=dsAcc]:checked').value, allowed: $('dsAllowed').value, managers: $('dsMgr').value, hidden: $('dsHidden').checked });
      $('dSec').close(); await reload(true); renderSettings();
      msg('setMsg', '저장했습니다. 연결된 폴더: ' + r.folderName, 'success');
    } catch (e) { msg('dsMsg', e.message, 'error'); }
    finally { b.disabled = false; }
  });
  $('dsDel').addEventListener('click', async function () {
    if (!confirm('이 섹션을 삭제합니다. 섹션 안에 항목이 남아 있으면 삭제되지 않습니다.')) return;
    try { await api('secDelete', { id: secId }); $('dSec').close(); await reload(true); renderSettings(); msg('setMsg', '삭제했습니다', 'success'); }
    catch (e) { msg('dsMsg', e.message, 'error'); }
  });
  $('deptSave').addEventListener('click', async function () {
    try { await api('cfgSave', { depts: $('deptTxt').value }); A.depts = $('deptTxt').value; msg('setMsg', '부서 목록을 저장했습니다', 'success'); } catch (e) { msg('setMsg', e.message, 'error'); }
  });
  $('superSave').addEventListener('click', async function () {
    try { await api('cfgSave', { supers: $('superTxt').value }); A.supers = $('superTxt').value; msg('setMsg', '전체 관리자를 저장했습니다', 'success'); } catch (e) { msg('setMsg', e.message, 'error'); }
  });
  $('migrate').addEventListener('click', async function () {
    if (!confirm('기존 법인서류 목록을 「법인 서류」 섹션으로 가져옵니다. 계속하시겠습니까?')) return;
    var b = $('migrate'); b.disabled = true;
    try {
      var r = await api('migrate', { folderId: DocGate.LEGACY_FOLDER_ID, sectionName: '법인 서류' });
      await reload(true); renderSettings();
      msg('setMsg', r.added + '건을 가져왔습니다. 섹션 설정에서 열람 범위(허용 목록)와 담당자를 지정하세요.', 'success');
    } catch (e) { msg('setMsg', e.message, 'error'); }
    finally { b.disabled = false; }
  });
})();
