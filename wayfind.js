'use strict';
/**
 * wayfind.js — 안내도(실내 길찾기) 설계기 (관리자)
 *  도면(층별) 업로드 → 지점(노드) 찍기 → 지점 연결(간선) → 지점별 QR 발급
 *  공개 길찾기 페이지: wayfind.html (?from=노드ID)
 *  데이터: Supabase wayfind_data(jsonb) — 기숙사와 동일 프로젝트
 */
(function () {
  var ROOT = 'wayfind-root';
  var DEFAULT_URL = 'https://zbpeyklwpotjyveipzxd.supabase.co';
  var DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV5a2x3cG90anl2ZWlwenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTYxMDcsImV4cCI6MjA5NzA5MjEwN30.6JgoQ6rPRnmrbBTG68A-Y9HDQk40mnwubhXVnkZvHrQ';
  var TYPES = ['일반', '입구', '계단', '엘리베이터', '화장실', '강의실', '사무실', '편의시설', '경유'];
  var ATTACH_TH = 10;   // 자동 연결 허용 거리(%)
  var _db = null, _session = null;
  var W = { floors: [], nodes: [], edges: [], cur: null, mode: 'node', sel: null, linkFrom: null, wireFrom: null, autoLink: true, snap: false, grid: 2.5, alignSel: [], nodeType: '일반', ortho: true };

  function root() { return document.getElementById(ROOT); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m, t) { try { if (typeof window.aseaToast === 'function') window.aseaToast(m, t); } catch (e) {} }
  function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function uid() { return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function cfg() { return { url: localStorage.getItem('asea_dorm_supabase_url') || DEFAULT_URL, key: localStorage.getItem('asea_dorm_supabase_key') || DEFAULT_KEY }; }
  function libReady() { return !!(window.supabase && window.supabase.createClient); }
  function ensure() { if (_db) return _db; if (!libReady()) return null; var c = cfg(); _db = window.supabase.createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true } }); return _db; }
  function curFloor() { return W.floors.filter(function (f) { return f.id === W.cur; })[0]; }
  function nodeById(id) { return W.nodes.filter(function (n) { return n.id === id; })[0]; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function snap(v) { if (W.snap) { var g = W.grid || 2.5; return Math.round(v / g) * g; } return r1(v); }
  function edgeExists(a, b) { return W.edges.some(function (e) { return (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a); }); }
  function addEdge(a, b) { if (a && b && a !== b && !edgeExists(a, b)) W.edges.push([a, b]); }
  function mkWaypoint(x, y) { var n = { id: uid(), floor: W.cur, x: r1(x), y: r1(y), name: '', type: '경유', qr: false }; W.nodes.push(n); return n; }
  // (x,y)에서 같은 층 선분/지점 중 가장 가까운 부착 대상 찾기
  function nearestOnFloor(x, y, excludeId) {
    var best = null;
    // 1) 선(이동선)에 수직 발 내리기
    W.edges.forEach(function (ed, ei) {
      var a = nodeById(ed[0]), b = nodeById(ed[1]); if (!a || !b || a.floor !== W.cur || b.floor !== W.cur) return;
      if (a.id === excludeId || b.id === excludeId) return;
      var dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      var t = L2 ? ((x - a.x) * dx + (y - a.y) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
      var fx = a.x + t * dx, fy = a.y + t * dy, d = Math.hypot(x - fx, y - fy);
      if (d <= ATTACH_TH && (!best || d < best.d)) best = { type: 'edge', ei: ei, fx: fx, fy: fy, d: d };
    });
    // 2) 가까운 지점
    W.nodes.forEach(function (n) {
      if (n.floor !== W.cur || n.id === excludeId) return;
      var d = Math.hypot(x - n.x, y - n.y);
      if (d <= ATTACH_TH && (!best || d < best.d)) best = { type: 'node', id: n.id, d: d };
    });
    return best;
  }
  function splitEdgeAt(ei, fx, fy) {
    var ed = W.edges[ei]; if (!ed) return null;
    var j = mkWaypoint(fx, fy);
    W.edges.splice(ei, 1, [ed[0], j.id], [j.id, ed[1]]);
    return j.id;
  }
  // 새 지점을 가장 가까운 이동선/지점에 자동 연결 (전기선 흐름도식)
  function autoAttach(nid) {
    if (!W.autoLink) return;
    var n = nodeById(nid); if (!n) return;
    var hit = nearestOnFloor(n.x, n.y, nid); if (!hit) return;
    var target = hit.type === 'edge' ? splitEdgeAt(hit.ei, hit.fx, hit.fy) : hit.id;
    addEdge(nid, target);
  }
  // 시뮬레이션 출발/도착 선택용 옵션(층별 그룹, 경유점 제외)
  function nodeOpts(sel) {
    return W.floors.map(function (f) {
      var ns = W.nodes.filter(function (n) { return n.floor === f.id && n.name && n.type !== '경유'; });
      if (!ns.length) return '';
      return '<optgroup label="' + esc(f.name) + '">' + ns.map(function (n) { return '<option value="' + n.id + '"' + (n.id === sel ? ' selected' : '') + '>' + esc(n.name) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
  }
  function clamp(v) { return Math.max(0, Math.min(100, v)); }
  // 선택한 지점들 정렬: h(같은 높이)·v(같은 가로)·left·right·top·bottom·disth(가로 균등)·distv(세로 균등)
  function alignSelected(mode) {
    var ns = W.alignSel.map(nodeById).filter(Boolean);
    if (ns.length < 2) { toast('정렬할 지점을 2개 이상 선택하세요.', 'warning'); return; }
    var xs = ns.map(function (n) { return n.x; }), ys = ns.map(function (n) { return n.y; });
    var avg = function (a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; };
    if (mode === 'h')           ns.forEach(function (n) { n.y = r1(avg(ys)); });
    else if (mode === 'v')      ns.forEach(function (n) { n.x = r1(avg(xs)); });
    else if (mode === 'left')   ns.forEach(function (n) { n.x = r1(Math.min.apply(null, xs)); });
    else if (mode === 'right')  ns.forEach(function (n) { n.x = r1(Math.max.apply(null, xs)); });
    else if (mode === 'top')    ns.forEach(function (n) { n.y = r1(Math.min.apply(null, ys)); });
    else if (mode === 'bottom') ns.forEach(function (n) { n.y = r1(Math.max.apply(null, ys)); });
    else if (mode === 'disth')  { ns.sort(function (a, b) { return a.x - b.x; }); var x0 = ns[0].x, st = (ns[ns.length - 1].x - x0) / (ns.length - 1); ns.forEach(function (n, i) { n.x = r1(x0 + st * i); }); }
    else if (mode === 'distv')  { ns.sort(function (a, b) { return a.y - b.y; }); var y0 = ns[0].y, sv = (ns[ns.length - 1].y - y0) / (ns.length - 1); ns.forEach(function (n, i) { n.y = r1(y0 + sv * i); }); }
    wfRenderGraph(); toast('정렬했습니다.', 'success');
  }
  // 이동선 직각(ㄱ자) 연결 — 두 점 사이에 코너 경유점을 끼워 수평/수직 2구간으로 잇는다
  function elbowCorner(a, b) {
    return (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  }
  function connectWire(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    var a = nodeById(fromId), b = nodeById(toId);
    if (W.ortho && a && b && a.floor === b.floor && Math.abs(b.x - a.x) > 0.3 && Math.abs(b.y - a.y) > 0.3) {
      var c = elbowCorner(a, b), cor = mkWaypoint(snap(c.x), snap(c.y));
      addEdge(fromId, cor.id); addEdge(cor.id, toId);
    } else { addEdge(fromId, toId); }
  }
  var SNAP_NODE = 6;   // 이동선을 그릴 때 '이름 있는 지점'에 자동으로 붙는 거리(%)
  // (x,y) 근처에서 가장 가까운 '이름 있는 지점' 찾기 (끝점은 이름 지점이 되도록 스냅)
  function nearestNamedNode(x, y, maxD) {
    var best = null;
    W.nodes.forEach(function (n) {
      if (n.floor !== W.cur || !n.name) return;
      var d = Math.hypot(x - n.x, y - n.y);
      if (d <= (maxD || SNAP_NODE) && (!best || d < best.d)) best = { id: n.id, d: d };
    });
    return best;
  }
  // 이동선 그리기 종료 — 끝이 이름 없는 경유점(허공)이면 가까운 지점에 붙이거나 경고
  function finishWire() {
    var n = nodeById(W.wireFrom);
    if (n && !n.name) {
      var deg = W.edges.filter(function (e) { return e[0] === n.id || e[1] === n.id; }).length;
      if (deg <= 1) {
        var hit = nearestNamedNode(n.x, n.y, 10);
        if (hit && hit.id !== n.id) { addEdge(n.id, hit.id); toast('끝점을 가까운 지점에 붙였습니다.', 'success'); }
        else toast('이동선의 끝은 이름 있는 지점에 연결하세요. (빨간 점=허공 끝) 지점 근처로 그리면 자동으로 붙습니다.', 'warning');
      }
    }
    W.wireFrom = null; wfRenderGraph();
  }

  /* ── 지점 자동 연결 — 이름 있는 지점들을 최소경로 트리(MST)로 직각(ㄱ자) 연결 ── */
  function autoElbowConnect(a, b) {
    if (Math.abs(b.x - a.x) > 0.3 && Math.abs(b.y - a.y) > 0.3) {
      var c = elbowCorner(a, b), cor = mkWaypoint(snap(c.x), snap(c.y));   // 직각 코너 경유점 삽입
      addEdge(a.id, cor.id); addEdge(cor.id, b.id);
    } else { addEdge(a.id, b.id); }
  }
  function autoRoute() {
    var named = W.nodes.filter(function (n) { return n.floor === W.cur && n.name; });
    if (named.length < 2) { toast('이름 있는 지점을 2개 이상 먼저 찍어 주세요.', 'warning'); return; }
    if (!confirm('이름 있는 지점 ' + named.length + '개를 가장 가까운 순서로 직각(ㄱ자) 경로로 자동 연결합니다.\n(기존 선은 그대로 두고 추가) 진행할까요?')) return;
    // Prim MST — 맨해튼(직각) 거리 기준
    var inTree = [named[0]], rest = named.slice(1), added = 0, guard = 0;
    while (rest.length && guard++ < 2000) {
      var best = null;
      inTree.forEach(function (a) { rest.forEach(function (b) {
        var d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (!best || d < best.d) best = { a: a, b: b, d: d };
      }); });
      if (!best) break;
      if (!edgeExists(best.a.id, best.b.id)) { autoElbowConnect(best.a, best.b); added++; }
      inTree.push(best.b); rest = rest.filter(function (x) { return x !== best.b; });
    }
    wfRenderGraph();
    toast('자동 연결 완료 — ' + added + '개 구간(직각). 필요 없는 선은 우클릭 → 삭제하세요.', 'success');
  }

  /* ── 선(간선) 우클릭 메뉴 — 그 구간만 삭제 ── */
  function hideEdgeMenu() { var m = document.getElementById('wf-edge-menu'); if (m) m.remove(); }
  function cleanupOrphanWaypoints() {
    var deg = {}; W.edges.forEach(function (e) { deg[e[0]] = (deg[e[0]] || 0) + 1; deg[e[1]] = (deg[e[1]] || 0) + 1; });
    W.nodes = W.nodes.filter(function (n) { return n.name || (deg[n.id] || 0) > 0; });   // 이름 없는 0연결 경유점(허공 잔재) 제거
  }
  function showEdgeMenu(ei, x, y) {
    hideEdgeMenu();
    if (ei < 0 || ei >= W.edges.length) return;
    var m = document.createElement('div');
    m.id = 'wf-edge-menu'; m.className = 'wf-edge-menu';
    m.style.left = x + 'px'; m.style.top = y + 'px';
    m.innerHTML = '<button class="wf-em-del">🗑 이 구간 선 삭제</button><button class="wf-em-cancel">취소</button>';
    document.body.appendChild(m);
    m.querySelector('.wf-em-del').addEventListener('click', function (e) {
      e.stopPropagation();
      W.edges.splice(ei, 1);
      cleanupOrphanWaypoints();
      hideEdgeMenu(); wfRenderGraph();
      toast('이 구간 선을 삭제했습니다.', 'success');
    });
    m.querySelector('.wf-em-cancel').addEventListener('click', function (e) { e.stopPropagation(); hideEdgeMenu(); });
    setTimeout(function () {
      document.addEventListener('click', hideEdgeMenu, { once: true });
      document.addEventListener('contextmenu', hideEdgeMenu, { once: true });
    }, 0);
  }

  function portalBase() { try { return (location.origin + location.pathname).replace(/[^/]*$/, ''); } catch (e) { return ''; } }
  function qrImg(text, size) { return 'https://api.qrserver.com/v1/create-qr-code/?size=' + (size || 180) + 'x' + (size || 180) + '&data=' + encodeURIComponent(text); }
  function compressImage(file, maxW) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { var img = new Image(); img.onload = function () {
      var s = Math.min(1, (maxW || 1400) / img.width); var w = Math.round(img.width * s), h = Math.round(img.height * s);
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); res(cv.toDataURL('image/jpeg', 0.82)); }; img.onerror = rej; img.src = r.result; }; r.onerror = rej; r.readAsDataURL(file); });
  }

  async function onTabOpen() {
    var r = root(); if (!r) return;
    if (!libReady()) { r.innerHTML = '<p style="padding:40px;text-align:center;color:#9ca3af">라이브러리 로딩 중…</p>'; setTimeout(function () { if (libReady()) onTabOpen(); }, 600); return; }
    ensure();
    try { var s = await _db.auth.getSession(); _session = s && s.data ? s.data.session : null; } catch (e) { _session = null; }
    if (!_session) { renderLogin(); return; }
    try { await loadData(); } catch (e) { r.innerHTML = errBox(e); return; }
    render();
  }
  function errBox(e) { return '<div class="dorm-card"><p style="color:#dc2626">오류: ' + esc(e && e.message || e) + '</p><p class="dorm-muted">테이블이 없으면 wayfind 마이그레이션 SQL을 먼저 실행하세요.</p></div>'; }

  function renderLogin() {
    root().innerHTML = '<div class="dorm-card" style="max-width:420px;margin:24px auto"><h2 class="dorm-h2">🔐 안내도 관리자 로그인</h2>' +
      '<p class="dorm-muted">기숙사관리와 동일한 Supabase 계정으로 로그인하세요.</p>' +
      '<label class="dorm-label">이메일</label><input id="wf-e" class="form-input" type="email">' +
      '<label class="dorm-label">비밀번호</label><input id="wf-p" class="form-input" type="password">' +
      '<div id="wf-err" style="color:#dc2626;font-size:12px;margin-top:6px;display:none"></div>' +
      '<div class="dorm-actions"><button id="wf-login" class="btn btn-primary">로그인</button></div></div>';
    document.getElementById('wf-login').addEventListener('click', async function () {
      var e = document.getElementById('wf-err'); e.style.display = 'none';
      var res = await _db.auth.signInWithPassword({ email: (val('wf-e') || '').trim(), password: val('wf-p') || '' });
      if (res.error) { e.textContent = '로그인 실패: ' + res.error.message; e.style.display = 'block'; return; }
      _session = res.data.session; onTabOpen();
    });
  }

  async function loadData() {
    var d = await _db.from('wayfind_data').select('data').eq('id', 'main').limit(1);
    if (d.error) throw d.error;
    var data = (d.data && d.data[0] && d.data[0].data) || {};
    W.floors = data.floors || []; W.nodes = data.nodes || []; W.edges = data.edges || [];
    if ((!W.cur || !curFloor()) && W.floors.length) W.cur = W.floors[0].id;
  }
  async function saveData() {
    var res = await _db.from('wayfind_data').upsert({ id: 'main', data: { floors: W.floors, nodes: W.nodes, edges: W.edges }, updated_at: new Date().toISOString() });
    if (res.error) { toast('저장 실패: ' + res.error.message, 'error'); return false; }
    toast('저장되었습니다.', 'success'); return true;
  }

  /* ── 화면 ─────────────────────────────────────────────── */
  function bindEsc() {
    if (W._escBound) return; W._escBound = true;
    document.addEventListener('keydown', function (e) {
      var panel = document.getElementById('tab-wayfind');
      if (panel && panel.hidden) return;                 // 안내도 탭이 열려 있을 때만
      if (e.key === 'Escape') {
        if (W._cancelDrag) { W._cancelDrag(); }
        else if (W.linkFrom) { W.linkFrom = null; wfRenderGraph(); toast('연결을 취소했습니다.', 'info'); }
        else if (W.wireFrom) finishWire();
        return;
      }
      // 화살표 = 선택 지점 미세 이동 (Shift=격자 한 칸, 기본=0.2%)
      if (e.key.indexOf('Arrow') !== 0) return;
      var ae = document.activeElement;
      if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;   // 입력 중엔 제외
      var ids = (W.mode === 'align' && W.alignSel.length) ? W.alignSel : (W.sel ? [W.sel] : []);
      if (!ids.length) return;
      e.preventDefault();
      var step = e.shiftKey ? (W.grid || 2.5) : 0.2;
      var dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      var dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      ids.map(nodeById).filter(Boolean).forEach(function (n) { n.x = clamp(r1(n.x + dx)); n.y = clamp(r1(n.y + dy)); });
      wfRenderGraph();
    });
  }
  function render() {
    bindEsc();
    var f = curFloor();
    var portalUrl = portalBase() + 'wayfind.html';
    root().innerHTML =
      '<div class="dorm-top"><h2 class="dorm-title">🧭 안내도 설계</h2>' +
        '<div class="dorm-user">' + esc((_session && _session.user && _session.user.email) || '') + ' <button id="wf-logout" class="btn btn-ghost btn-sm">로그아웃</button></div></div>' +
      '<div class="dorm-card"><div class="dorm-row4">' +
        '<div><label class="dorm-label">층(도면)</label><select id="wf-floor" class="form-select">' +
          (W.floors.length ? W.floors.map(function (x) { return '<option value="' + x.id + '"' + (x.id === W.cur ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') : '<option value="">- 없음 -</option>') + '</select></div>' +
        '<div style="align-self:end"><button id="wf-addfloor" class="btn btn-secondary btn-sm">+ 층/도면 추가</button></div>' +
        '<div style="align-self:end"><label class="btn btn-secondary btn-sm" style="cursor:pointer">🖼 도면 업로드<input id="wf-img" type="file" accept="image/*" hidden></label></div>' +
        '<div style="align-self:end"><button id="wf-save" class="btn btn-primary">경로 그래프 저장</button></div>' +
      '</div>' +
      (f ? '<div class="dorm-actions" style="margin-top:6px;align-items:center">' +
        ['node', 'wire', 'link', 'move', 'align'].map(function (m) { var lab = { node: '지점 추가', wire: '이동선 그리기', link: '지점 연결', move: '이동', align: '정렬' }[m]; return '<button class="dorm-mode' + (W.mode === m ? ' active' : '') + '" data-wfm="' + m + '">' + lab + '</button>'; }).join('') +
        '<label class="dorm-cb" style="margin-left:4px"><input type="checkbox" id="wf-autolink"' + (W.autoLink ? ' checked' : '') + '> 자동 연결</label>' +
        '<label class="dorm-cb"><input type="checkbox" id="wf-snap"' + (W.snap ? ' checked' : '') + '> 격자 맞춤</label>' +
        '<select id="wf-grid" class="form-select" style="width:auto;padding:4px 8px;font-size:12px" title="격자 간격(작을수록 세밀)">' +
          [0.5, 1, 2, 2.5, 5].map(function (g) { return '<option value="' + g + '"' + (W.grid === g ? ' selected' : '') + '>격자 ' + g + '%</option>'; }).join('') + '</select>' +
        '<label class="dorm-cb"><input type="checkbox" id="wf-ortho"' + (W.ortho ? ' checked' : '') + '> 직각(ㄱ자) 이동선</label>' +
        '<button id="wf-autoroute" class="btn btn-secondary btn-sm" title="이름 있는 지점들을 가장 가까운 순서로 직각(ㄱ자) 경로로 자동 연결합니다">🪄 지점 자동 연결</button>' +
        '<button id="wf-delfloor" class="btn btn-ghost btn-sm" style="color:#dc2626;margin-left:auto">이 층 삭제</button></div>' +
        (W.mode === 'node' ? '<div class="dorm-actions" style="margin-top:4px;flex-wrap:wrap">' +
          [['일반', '📍 일반'], ['계단', '🪜 계단'], ['엘리베이터', '🛗 엘리베이터'], ['출입구', '🚪 출입구(대피)']].map(function (t) {
            return '<button class="dorm-mode' + (W.nodeType === t[0] ? ' active' : '') + '" data-wfnt="' + t[0] + '">' + t[1] + '</button>'; }).join('') +
          '<span class="dorm-muted" style="align-self:center">유형을 고르고 빈 곳을 클릭하면 그 유형의 점이 생깁니다.</span></div>' : '') +
        (W.mode === 'align' ? '<div class="dorm-actions" style="margin-top:4px;flex-wrap:wrap">' +
          '<button id="wf-al-h" class="btn btn-secondary btn-sm">↔ 수평(같은 높이)</button>' +
          '<button id="wf-al-v" class="btn btn-secondary btn-sm">↕ 수직(같은 가로)</button>' +
          '<button data-al="left" class="btn btn-ghost btn-sm">⇤ 왼쪽</button>' +
          '<button data-al="right" class="btn btn-ghost btn-sm">⇥ 오른쪽</button>' +
          '<button data-al="top" class="btn btn-ghost btn-sm">⤒ 위</button>' +
          '<button data-al="bottom" class="btn btn-ghost btn-sm">⤓ 아래</button>' +
          '<button data-al="disth" class="btn btn-ghost btn-sm">⇿ 가로 균등</button>' +
          '<button data-al="distv" class="btn btn-ghost btn-sm">↥↧ 세로 균등</button>' +
          '<button id="wf-al-c" class="btn btn-ghost btn-sm">선택 해제</button>' +
          '<span class="dorm-muted" style="align-self:center">선택: ' + W.alignSel.length + '개</span></div>' : '') +
        '<p class="dorm-muted">' + (
          W.mode === 'node' ? '빈 곳을 클릭하면 <b>점이 바로 생깁니다</b>(이름 입력창 없이). 점을 <b>드래그</b>하거나 점 선택 후 <b>←↑↓→(미세)·Shift+←↑↓→(격자 한 칸)</b>로 위치를 맞추고, 점을 클릭하면 아래 <b>속성창에서 이름</b>을 입력합니다(더블클릭=빠른 이름). 위 유형(일반·계단·엘리베이터·출입구)을 골라 찍을 수 있어요.'
          : W.mode === 'wire' ? '빈 곳을 차례로 클릭해 <b>이동선(복도)</b>을 그립니다. <b>이름 있는 지점 근처를 클릭하면 그 지점에 자동으로 붙습니다(스냅)</b> — 끝점은 항상 이름 지점이 되도록 하세요. <b>직각(ㄱ자)</b>이 켜져 있으면 대각선 대신 <b>꺾인 직각선</b>으로 이어집니다. <b>Shift</b>=1구간 직선. <b style="color:#dc2626">빨간 점</b>=허공에 떠 있는 끝(지점에 연결 필요). (ESC·우클릭·더블클릭=선 끝내기)'
          : W.mode === 'link' ? '연결할 지점을 차례로 클릭하면 경로가 이어집니다. (ESC=연결 취소)'
          : W.mode === 'align' ? '정렬할 지점들을 <b>클릭해 여러 개 선택</b>한 뒤 <b>수평/수직 정렬</b>을 누르면 한 줄로 깔끔하게 맞춰집니다.'
          : '지점을 드래그해 위치를 옮깁니다. 드래그 중 <b>ESC·우클릭</b>이면 취소. <b>더블클릭=이름 변경</b>.') +
        ' <b style="color:#dc2626">우클릭</b>: 경로(선)=그 경로 삭제 · 지점=그 지점 삭제. (계단/엘리베이터는 <b>여러 층에 같은 이름</b>으로 두면 층간 자동 연결됩니다.) <b>격자 맞춤</b> 켜면 점이 격자(약 ' + W.grid + '%)에 붙어 정렬이 쉬워집니다.</p>' : '') +
      '<div id="wf-stage" class="wf-stage' + (f && f.image ? '' : ' empty') + '">' + (f && f.image ? '<img src="' + f.image + '" class="wf-img"><svg class="wf-svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg><div class="wf-nodes"></div>' : '<div class="dorm-muted">' + (f ? '도면 이미지를 업로드하세요.' : '먼저 「+ 층/도면 추가」로 층을 만드세요.') + '</div>') + '</div>' +
      '</div><div id="wf-prop"></div>' +
      '<div class="dorm-card"><h3 class="dorm-h3">🔗 안내 포털 / QR</h3>' +
        '<p class="dorm-muted">방문자는 각 지점의 QR을 찍으면 그 지점이 출발지로 설정됩니다. 포털 주소: <b>' + esc(portalUrl) + '</b></p>' +
        '<div class="dorm-actions"><a class="btn btn-secondary btn-sm" href="' + portalUrl + '" target="_blank" rel="noopener">안내 포털 열기</a></div></div>' +
      '<div class="dorm-card"><h3 class="dorm-h3">🧪 시뮬레이션 / QR 화면 미리보기</h3>' +
        '<div class="dorm-row4">' +
          '<div><label class="dorm-label">출발(현재 위치)</label><select id="wf-sim-from" class="form-select">' + nodeOpts('') + '</select></div>' +
          '<div><label class="dorm-label">도착(목적지)</label><select id="wf-sim-to" class="form-select">' + nodeOpts('') + '</select></div>' +
          '<div><label class="dorm-label">이동수단</label><select id="wf-sim-mode" class="form-select"><option value="walk">도보(계단)</option><option value="elevator">엘리베이터</option></select></div>' +
          '<div style="align-self:end"><button id="wf-sim-go" class="btn btn-primary btn-sm">시뮬레이션 열기</button></div>' +
        '</div>' +
        '<div class="dorm-actions"><button id="wf-sim-qr" class="btn btn-secondary btn-sm">📱 QR 스캔 화면 미리보기(출발 지점)</button>' +
          '<button id="wf-sim-evac" class="btn btn-sm" style="background:#dc2626;color:#fff;border:none">🚨 대피 경로 미리보기(가장 가까운 출구)</button></div>' +
        '<p class="dorm-muted">방문자가 실제로 보는 길찾기 화면이 새 창으로 열립니다. (출발→도착 경로가 자동 재생됩니다) · 대피 미리보기는 <b>출입구(대피)</b>로 표시한 지점 중 가장 가까운 곳으로 안내합니다.</p></div>';
    document.getElementById('wf-logout').addEventListener('click', async function () { try { await _db.auth.signOut(); } catch (e) {} _session = null; renderLogin(); });
    document.getElementById('wf-floor').addEventListener('change', function () { W.cur = this.value; W.sel = null; W.linkFrom = null; render(); });
    document.getElementById('wf-addfloor').addEventListener('click', wfAddFloor);
    document.getElementById('wf-img').addEventListener('change', wfUploadImg);
    document.getElementById('wf-save').addEventListener('click', saveData);
    var sg = document.getElementById('wf-sim-go'); if (sg) sg.addEventListener('click', function () {
      var a = val('wf-sim-from'), b = val('wf-sim-to'), md = val('wf-sim-mode') || 'walk';
      if (!a || !b) { toast('출발/도착 지점을 선택하세요.', 'warning'); return; }
      if (a === b) { toast('출발과 도착이 같습니다.', 'warning'); return; }
      window.open(portalBase() + 'wayfind.html?from=' + encodeURIComponent(a) + '&to=' + encodeURIComponent(b) + '&mode=' + md + '&auto=1', '_blank', 'noopener');
    });
    var sq = document.getElementById('wf-sim-qr'); if (sq) sq.addEventListener('click', function () {
      var a = val('wf-sim-from'); if (!a) { toast('출발(QR) 지점을 선택하세요.', 'warning'); return; }
      window.open(portalBase() + 'wayfind.html?from=' + encodeURIComponent(a), '_blank', 'noopener');
    });
    var sev = document.getElementById('wf-sim-evac'); if (sev) sev.addEventListener('click', function () {
      var a = val('wf-sim-from') || W.sel;
      if (!a) { toast('출발 지점을 선택(또는 도면에서 지점 클릭)하세요.', 'warning'); return; }
      if (!W.nodes.some(function (n) { return n.exit; })) { toast('출입구(대피) 지점을 먼저 추가하세요. (지점 추가 → 🚪 출입구)', 'warning'); return; }
      window.open(portalBase() + 'wayfind.html?from=' + encodeURIComponent(a) + '&evac=1', '_blank', 'noopener');
    });
    if (f) {
      root().querySelectorAll('[data-wfm]').forEach(function (b) { b.addEventListener('click', function () { W.mode = b.dataset.wfm; W.linkFrom = null; W.wireFrom = null; render(); }); });
      var al = document.getElementById('wf-autolink'); if (al) al.addEventListener('change', function () { W.autoLink = this.checked; });
      var sn = document.getElementById('wf-snap'); if (sn) sn.addEventListener('change', function () { W.snap = this.checked; render(); });
      var gr = document.getElementById('wf-grid'); if (gr) gr.addEventListener('change', function () { W.grid = parseFloat(this.value) || 2.5; if (W.snap) render(); });
      var or = document.getElementById('wf-ortho'); if (or) or.addEventListener('change', function () { W.ortho = this.checked; });
      var arb = document.getElementById('wf-autoroute'); if (arb) arb.addEventListener('click', autoRoute);
      root().querySelectorAll('[data-wfnt]').forEach(function (b) { b.addEventListener('click', function () { W.nodeType = b.dataset.wfnt; render(); }); });
      if (W.mode === 'align') {
        var ah = document.getElementById('wf-al-h'), av = document.getElementById('wf-al-v'), ac = document.getElementById('wf-al-c');
        if (ah) ah.addEventListener('click', function () { alignSelected('h'); });
        if (av) av.addEventListener('click', function () { alignSelected('v'); });
        if (ac) ac.addEventListener('click', function () { W.alignSel = []; render(); });
        root().querySelectorAll('[data-al]').forEach(function (b) { b.addEventListener('click', function () { alignSelected(b.dataset.al); }); });
      }
      document.getElementById('wf-delfloor').addEventListener('click', wfDelFloor);
      wfBindStage();
      wfRenderGraph();
      if (W.sel) wfRenderProp();
    }
  }

  // 층 이름에서 정렬용 층번호 자동 추출 (지하/B → 음수)
  function parseLvl(name) {
    var s = String(name || ''); var m = s.match(/-?\d+/); var num = m ? parseInt(m[0], 10) : 0;
    if (/지하|\bB/i.test(s)) return -Math.abs(num || 1);
    return num;
  }
  function sortFloors() { W.floors.sort(function (a, b) { return (b.level || 0) - (a.level || 0); }); } // 고층→지하 순
  function wfAddFloor() {
    var name = prompt('층/도면 이름 (예: 본관 3층 · 지하 1층 · B2)\n※ "지하"·"B"가 있으면 지하층으로 자동 정렬됩니다.', '');
    if (name == null) return; name = name.trim(); if (!name) return;
    var id = uid();
    W.floors.push({ id: id, name: name, level: parseLvl(name), image: '' });
    sortFloors();
    W.cur = id; render();
  }
  async function wfDelFloor() {
    var f = curFloor(); if (!f) return;
    if (!confirm('"' + f.name + '" 층과 그 지점·연결을 삭제할까요?')) return;
    var nids = W.nodes.filter(function (n) { return n.floor === f.id; }).map(function (n) { return n.id; });
    W.nodes = W.nodes.filter(function (n) { return n.floor !== f.id; });
    W.edges = W.edges.filter(function (e) { return nids.indexOf(e[0]) === -1 && nids.indexOf(e[1]) === -1; });
    W.floors = W.floors.filter(function (x) { return x.id !== f.id; });
    W.cur = W.floors.length ? W.floors[0].id : null; W.sel = null;
    await saveData(); render();
  }
  async function wfUploadImg(e) {
    var file = e.target.files[0]; var f = curFloor(); if (!file || !f) return;
    toast('도면 처리 중…', 'info');
    try { f.image = await compressImage(file, 1400); render(); } catch (err) { toast('업로드 실패', 'error'); }
  }

  function stageXY(stage, e) { var r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100 }; }
  function wfBindStage() {
    var stage = document.getElementById('wf-stage');
    stage.addEventListener('click', function (e) {
      if (e.target.closest('.wf-mk')) return;       // 지점 위 클릭은 마커 핸들러가 처리
      var p = stageXY(stage, e);
      if (W.mode === 'node') {
        // 이름 입력창 없이 점을 바로 생성 → 위치 조정 후 속성창에서 이름 입력
        var t = W.nodeType || '일반', isExit = (t === '출입구');
        var n = { id: uid(), floor: W.cur, x: snap(p.x), y: snap(p.y), name: '', type: isExit ? '입구' : t, qr: false };
        if (isExit) n.exit = true;
        W.nodes.push(n); W.sel = n.id;
        autoAttach(n.id);                             // 가장 가까운 이동선/지점에 자동 연결
        wfRenderGraph(); wfRenderProp();
        var nmInp = document.getElementById('wf-n-name'); if (nmInp) { try { nmInp.focus(); } catch (_) {} }
        toast('점을 드래그(또는 ←↑↓→)로 맞춘 뒤 이름을 입력하세요.', 'info');
      } else if (W.mode === 'wire') {
        // 가까운 '이름 있는 지점'이 있으면 새 경유점 대신 그 지점에 자동 스냅·연결 (끝점=이름 지점)
        var snapHit = nearestNamedNode(p.x, p.y, SNAP_NODE);
        if (snapHit) {
          if (W.wireFrom && W.wireFrom !== snapHit.id) connectWire(W.wireFrom, snapHit.id);
          W.wireFrom = snapHit.id; wfRenderGraph(); return;
        }
        var x = p.x, y = p.y;
        if (e.shiftKey && W.wireFrom) {               // Shift: 직전 점 기준 수평/수직 고정(직선)
          var pf = nodeById(W.wireFrom);
          if (pf) { if (Math.abs(x - pf.x) >= Math.abs(y - pf.y)) y = pf.y; else x = pf.x; }
        }
        var w = mkWaypoint(snap(x), snap(y));
        if (W.wireFrom) { if (e.shiftKey) addEdge(W.wireFrom, w.id); else connectWire(W.wireFrom, w.id); }
        else { var near = nearestOnFloor(w.x, w.y, w.id); if (near) addEdge(w.id, near.type === 'edge' ? splitEdgeAt(near.ei, near.fx, near.fy) : near.id); }
        W.wireFrom = w.id; wfRenderGraph();
      }
    });
    stage.addEventListener('dblclick', function (e) { if (W.mode === 'wire' && W.wireFrom) finishWire(); });
    // 빈 곳 우클릭: 브라우저 메뉴 차단 + 연결/이동선/드래그 중이면 종료
    stage.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (W._cancelDrag) { W._cancelDrag(); return; }
      if (W.linkFrom) { W.linkFrom = null; wfRenderGraph(); toast('연결을 취소했습니다.', 'info'); return; }
      if (W.wireFrom) finishWire();
    });
  }
  function wfRenameNode(id) {
    var n = nodeById(id); if (!n) return;
    var nm = prompt('지점 이름 (예: 항공보안 무도장)\n※ 이 이름이 방문자 목적지 검색에 사용됩니다.', n.name || '');
    if (nm == null) return;                 // 취소
    nm = nm.trim(); if (!nm) return;        // 빈 값은 무시
    n.name = nm; W.sel = id; wfRenderGraph(); wfRenderProp();
    toast('이름을 "' + nm + '"(으)로 변경했습니다.', 'success');
  }
  function wfDeleteNode(id) {
    var n = nodeById(id); if (!n) return;
    W.nodes = W.nodes.filter(function (x) { return x.id !== id; });
    W.edges = W.edges.filter(function (e) { return e[0] !== id && e[1] !== id; });
    if (W.sel === id) { W.sel = null; var p = document.getElementById('wf-prop'); if (p) p.innerHTML = ''; }
    wfRenderGraph(); toast('지점을 삭제했습니다.', 'success');
  }
  function wfRenderGraph() {
    var f = curFloor(); if (!f) return;
    var nodes = W.nodes.filter(function (n) { return n.floor === W.cur; });
    var svg = document.querySelector('#wf-stage .wf-svg');
    if (svg) {
      var grid = '';
      if (W.snap) { var g = W.grid || 2.5, gv; for (gv = g; gv < 100; gv += g) { grid += '<line class="wf-grid" x1="' + gv + '" y1="0" x2="' + gv + '" y2="100"/><line class="wf-grid" x1="0" y1="' + gv + '" x2="100" y2="' + gv + '"/>'; } }
      var lines = grid;
      W.edges.forEach(function (ed, idx) { var a = nodeById(ed[0]), b = nodeById(ed[1]); if (a && b && a.floor === W.cur && b.floor === W.cur) {
        lines += '<line class="wf-edge" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>';
        lines += '<line class="wf-hit" data-ei="' + idx + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"><title>우클릭으로 이 경로 삭제</title></line>';
      } });
      svg.innerHTML = lines;
      svg.querySelectorAll('.wf-hit').forEach(function (h) {
        h.addEventListener('contextmenu', function (ev) { ev.preventDefault(); ev.stopPropagation(); showEdgeMenu(+this.dataset.ei, ev.clientX, ev.clientY); });
      });
    }
    var wrap = document.querySelector('#wf-stage .wf-nodes'); if (!wrap) return;
    var deg = {}, adj = {};
    W.edges.forEach(function (e) {
      deg[e[0]] = (deg[e[0]] || 0) + 1; deg[e[1]] = (deg[e[1]] || 0) + 1;
      var a = nodeById(e[0]), b = nodeById(e[1]);
      if (a && b && a.floor === W.cur && b.floor === W.cur) { (adj[a.id] = adj[a.id] || []).push(b); (adj[b.id] = adj[b.id] || []).push(a); }
    });
    // 이름표를 연결선 반대쪽으로 자동 배치 (선이 이름표를 가리지 않게)
    function labelPos(n) {
      var nb = adj[n.id] || []; if (!nb.length) return 'lp-bottom';
      var sx = 0, sy = 0;
      nb.forEach(function (m) { var dx = m.x - n.x, dy = m.y - n.y, L = Math.hypot(dx, dy) || 1; sx += dx / L; sy += dy / L; });
      if (Math.abs(sx) < 0.05 && Math.abs(sy) < 0.05) return 'lp-bottom';
      if (Math.abs(sx) >= Math.abs(sy)) return sx > 0 ? 'lp-left' : 'lp-right';   // 선이 오른쪽 → 이름표 왼쪽
      return sy > 0 ? 'lp-top' : 'lp-bottom';                                       // 선이 아래 → 이름표 위
    }
    wrap.innerHTML = nodes.map(function (n) {
      var dangle = !n.name && (deg[n.id] || 0) <= 1;   // 이름 없는 허공 끝점 = 경고 표시
      var cls = 'wf-mk t-' + esc(n.type) + (n.type === '경유' ? ' wp' : '') + (n.exit ? ' exit' : '') + (dangle ? ' dangle' : '') + (n.name ? ' ' + labelPos(n) : '') + (W.sel === n.id ? ' sel' : '') + (W.alignSel.indexOf(n.id) >= 0 ? ' asel' : '') + ((W.linkFrom === n.id || W.wireFrom === n.id) ? ' linking' : '') + (n.qr ? ' qr' : '');
      var lab = !n.name ? '' : '<span>' + esc(n.exit ? '🚪' + n.name : n.name) + '</span>';
      return '<div class="' + cls + '" data-id="' + n.id + '" style="left:' + n.x + '%;top:' + n.y + '%" title="' + esc(n.name || '경유점') + ' — 우클릭으로 삭제">' + lab + '</div>'; }).join('');
    wrap.querySelectorAll('.wf-mk').forEach(function (m) {
      if (W.mode === 'move' || W.mode === 'node') wfDrag(m);
      m.addEventListener('click', function (ev) { ev.stopPropagation(); if (m._sup) { m._sup = false; return; } wfNodeClick(this.dataset.id); });
      m.addEventListener('dblclick', function (ev) { ev.stopPropagation(); ev.preventDefault(); wfRenameNode(this.dataset.id); });
      m.addEventListener('contextmenu', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        if (W._cancelDrag) { W._cancelDrag(); return; }            // 드래그 중 → 취소
        if (W.mode === 'link' && W.linkFrom) { W.linkFrom = null; wfRenderGraph(); toast('연결을 취소했습니다.', 'info'); return; }
        wfDeleteNode(this.dataset.id);                              // 그 외 → 지점 삭제
      });
    });
  }
  function wfNodeClick(id) {
    if (W.mode === 'link') {
      if (!W.linkFrom) { W.linkFrom = id; }
      else if (W.linkFrom !== id) { connectWire(W.linkFrom, id); W.linkFrom = id; /* 연속 연결 */ }
      wfRenderGraph(); return;
    }
    if (W.mode === 'wire') {                 // 이동선 그리는 중 지점 클릭 → 그 지점에 연결
      if (W.wireFrom && W.wireFrom !== id) connectWire(W.wireFrom, id);
      W.wireFrom = id; wfRenderGraph(); return;
    }
    if (W.mode === 'align') {                 // 정렬 대상 다중 선택 토글
      var ai = W.alignSel.indexOf(id); if (ai >= 0) W.alignSel.splice(ai, 1); else W.alignSel.push(id);
      render(); return;
    }
    W.sel = id; wfRenderGraph(); wfRenderProp();
  }
  function wfDrag(m) {
    var stage = document.getElementById('wf-stage'); var id = m.dataset.id; var on = false, moved = false, ox = 0, oy = 0, pid = null;
    function endDrag() { on = false; W._cancelDrag = null; if (pid != null) { try { m.releasePointerCapture(pid); } catch (_) {} pid = null; } }
    function cancel() { if (!on) return; var n = nodeById(id); if (n) { n.x = ox; n.y = oy; } endDrag(); wfRenderGraph(); toast('이동을 취소했습니다.', 'info'); }
    m.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;            // 좌클릭만 드래그 시작 (우클릭은 contextmenu에서 처리)
      e.preventDefault(); var n = nodeById(id); if (!n) return;
      ox = n.x; oy = n.y; on = true; moved = false; pid = e.pointerId; W._cancelDrag = cancel;
      try { m.setPointerCapture(e.pointerId); } catch (_) {}
    });
    m.addEventListener('pointermove', function (e) { if (!on) return; var r = stage.getBoundingClientRect();
      var x = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)), y = Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100));
      var n = nodeById(id); if (n) { if (Math.abs(x - ox) > 0.4 || Math.abs(y - oy) > 0.4) moved = true; n.x = snap(x); n.y = snap(y); m.style.left = n.x + '%'; m.style.top = n.y + '%'; } wfRenderGraph(); });
    m.addEventListener('pointerup', function () { if (moved) m._sup = true; endDrag(); });
  }
  function wfRenderProp() {
    var n = nodeById(W.sel); var p = document.getElementById('wf-prop'); if (!n) { p.innerHTML = ''; return; }
    var link = portalBase() + 'wayfind.html?from=' + n.id;
    p.innerHTML = '<div class="dorm-card"><h3 class="dorm-h3">지점 속성</h3>' +
      '<div class="dorm-row4"><div><label class="dorm-label">이름 (목적지 검색에 사용)</label><input id="wf-n-name" class="form-input" placeholder="예: 항공보안 무도장" value="' + esc(n.name) + '"></div>' +
      '<div><label class="dorm-label">유형</label><select id="wf-n-type" class="form-select">' +
        '<optgroup label="장소 지정">' + ['일반', '입구', '화장실', '강의실', '사무실', '편의시설'].map(function (t) { return '<option' + (t === n.type ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</optgroup>' +
        '<optgroup label="층간 입출입">' + ['계단', '엘리베이터'].map(function (t) { return '<option' + (t === n.type ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</optgroup>' +
        '<optgroup label="이동선">' + ['경유'].map(function (t) { return '<option' + (t === n.type ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</optgroup>' +
        '</select></div>' +
      '<div style="align-self:end"><label class="dorm-cb"><input type="checkbox" id="wf-n-exit"' + (n.exit ? ' checked' : '') + '> 🚪 출입구(대피)</label></div>' +
      '<div style="align-self:end"><label class="dorm-cb"><input type="checkbox" id="wf-n-qr"' + (n.qr ? ' checked' : '') + '> QR 지점</label></div>' +
      '<div style="align-self:end"><button id="wf-n-del" class="btn btn-ghost btn-sm" style="color:#dc2626">지점 삭제</button></div></div>' +
      (n.qr ? '<div class="dorm-actions" style="align-items:center"><img src="' + qrImg(link, 160) + '" style="width:160px;height:160px;border:1px solid #e5e7eb;border-radius:8px"><div><p class="dorm-muted" style="word-break:break-all">' + esc(link) + '</p><button id="wf-n-copy" class="btn btn-secondary btn-sm">링크 복사</button> <a class="btn btn-ghost btn-sm" href="' + qrImg(link, 600) + '" target="_blank">QR 크게보기</a></div></div>' : '<p class="dorm-muted">「QR 지점」을 체크하면 이 지점의 QR(현재위치 설정용)이 생성됩니다.</p>') +
      '</div>';
    document.getElementById('wf-n-name').addEventListener('input', function () { n.name = this.value; wfRenderGraph(); });
    document.getElementById('wf-n-type').addEventListener('change', function () { n.type = this.value; wfRenderGraph(); });
    document.getElementById('wf-n-exit').addEventListener('change', function () { n.exit = this.checked; wfRenderGraph(); });
    document.getElementById('wf-n-qr').addEventListener('change', function () { n.qr = this.checked; wfRenderGraph(); wfRenderProp(); });
    document.getElementById('wf-n-del').addEventListener('click', function () {
      W.nodes = W.nodes.filter(function (x) { return x.id !== n.id; });
      W.edges = W.edges.filter(function (e) { return e[0] !== n.id && e[1] !== n.id; });
      W.sel = null; wfRenderGraph(); document.getElementById('wf-prop').innerHTML = '';
    });
    var cp = document.getElementById('wf-n-copy'); if (cp) cp.addEventListener('click', function () { try { navigator.clipboard.writeText(link).then(function () { toast('복사됨', 'success'); }); } catch (e) { prompt('링크', link); } });
  }

  window.WayfindModule = { onTabOpen: onTabOpen };
})();
