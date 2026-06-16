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
  var TYPES = ['일반', '입구', '계단', '엘리베이터', '화장실', '강의실', '사무실', '편의시설'];
  var _db = null, _session = null;
  var W = { floors: [], nodes: [], edges: [], cur: null, mode: 'node', sel: null, linkFrom: null };

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
  function render() {
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
      (f ? '<div class="dorm-actions" style="margin-top:6px">' +
        ['node', 'link', 'move'].map(function (m) { var lab = { node: '지점 추가', link: '지점 연결', move: '이동' }[m]; return '<button class="dorm-mode' + (W.mode === m ? ' active' : '') + '" data-wfm="' + m + '">' + lab + '</button>'; }).join('') +
        '<button id="wf-delfloor" class="btn btn-ghost btn-sm" style="color:#dc2626;margin-left:auto">이 층 삭제</button></div>' +
        '<p class="dorm-muted">' + (W.mode === 'node' ? '도면 빈 곳을 클릭해 지점을 추가합니다. 지점을 클릭하면 속성 편집.' : W.mode === 'link' ? '연결할 지점을 차례로 클릭하면 경로가 이어집니다.' : '지점을 드래그해 위치를 옮깁니다.') +
        ' (계단/엘리베이터는 <b>여러 층에 같은 이름</b>으로 두면 층간 자동 연결됩니다.)</p>' : '') +
      '<div id="wf-stage" class="wf-stage' + (f && f.image ? '' : ' empty') + '">' + (f && f.image ? '<img src="' + f.image + '" class="wf-img"><svg class="wf-svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg><div class="wf-nodes"></div>' : '<div class="dorm-muted">' + (f ? '도면 이미지를 업로드하세요.' : '먼저 「+ 층/도면 추가」로 층을 만드세요.') + '</div>') + '</div>' +
      '</div><div id="wf-prop"></div>' +
      '<div class="dorm-card"><h3 class="dorm-h3">🔗 안내 포털 / QR</h3>' +
        '<p class="dorm-muted">방문자는 각 지점의 QR을 찍으면 그 지점이 출발지로 설정됩니다. 포털 주소: <b>' + esc(portalUrl) + '</b></p>' +
        '<div class="dorm-actions"><a class="btn btn-secondary btn-sm" href="' + portalUrl + '" target="_blank" rel="noopener">안내 포털 열기</a></div></div>';
    document.getElementById('wf-logout').addEventListener('click', async function () { try { await _db.auth.signOut(); } catch (e) {} _session = null; renderLogin(); });
    document.getElementById('wf-floor').addEventListener('change', function () { W.cur = this.value; W.sel = null; W.linkFrom = null; render(); });
    document.getElementById('wf-addfloor').addEventListener('click', wfAddFloor);
    document.getElementById('wf-img').addEventListener('change', wfUploadImg);
    document.getElementById('wf-save').addEventListener('click', saveData);
    if (f) {
      root().querySelectorAll('[data-wfm]').forEach(function (b) { b.addEventListener('click', function () { W.mode = b.dataset.wfm; W.linkFrom = null; render(); }); });
      document.getElementById('wf-delfloor').addEventListener('click', wfDelFloor);
      wfBindStage();
      wfRenderGraph();
      if (W.sel) wfRenderProp();
    }
  }

  function wfAddFloor() {
    var name = prompt('층/도면 이름 (예: 본관 1층)', '');
    if (!name) return;
    var lvl = parseInt(prompt('층 번호(숫자, 층간 이동 정렬용)', '1'), 10) || 0;
    var id = uid();
    W.floors.push({ id: id, name: name.trim(), level: lvl, image: '' });
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

  function wfBindStage() {
    var stage = document.getElementById('wf-stage');
    stage.addEventListener('click', function (e) {
      if (W.mode !== 'node') return;
      if (e.target.closest('.wf-mk')) return;
      var r = stage.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width * 100, y = (e.clientY - r.top) / r.height * 100;
      var n = { id: uid(), floor: W.cur, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, name: '지점' + (W.nodes.length + 1), type: '일반', qr: false };
      W.nodes.push(n); W.sel = n.id; wfRenderGraph(); wfRenderProp();
    });
  }
  function wfRenderGraph() {
    var f = curFloor(); if (!f) return;
    var nodes = W.nodes.filter(function (n) { return n.floor === W.cur; });
    var svg = document.querySelector('#wf-stage .wf-svg');
    if (svg) {
      var lines = '';
      W.edges.forEach(function (ed) { var a = nodeById(ed[0]), b = nodeById(ed[1]); if (a && b && a.floor === W.cur && b.floor === W.cur) lines += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="#1a73e8" stroke-width="0.6" stroke-linecap="round"/>'; });
      svg.innerHTML = lines;
    }
    var wrap = document.querySelector('#wf-stage .wf-nodes'); if (!wrap) return;
    wrap.innerHTML = nodes.map(function (n) { var cls = 'wf-mk t-' + esc(n.type) + (W.sel === n.id ? ' sel' : '') + (W.linkFrom === n.id ? ' linking' : '') + (n.qr ? ' qr' : '');
      return '<div class="' + cls + '" data-id="' + n.id + '" style="left:' + n.x + '%;top:' + n.y + '%" title="' + esc(n.name) + '"><span>' + esc(n.name) + '</span></div>'; }).join('');
    wrap.querySelectorAll('.wf-mk').forEach(function (m) {
      if (W.mode === 'move') wfDrag(m);
      m.addEventListener('click', function (ev) { ev.stopPropagation(); wfNodeClick(this.dataset.id); });
    });
  }
  function wfNodeClick(id) {
    if (W.mode === 'link') {
      if (!W.linkFrom) { W.linkFrom = id; }
      else if (W.linkFrom !== id) {
        var exists = W.edges.some(function (e) { return (e[0] === W.linkFrom && e[1] === id) || (e[0] === id && e[1] === W.linkFrom); });
        if (!exists) W.edges.push([W.linkFrom, id]);
        W.linkFrom = id; // 연속 연결
      }
      wfRenderGraph(); return;
    }
    W.sel = id; wfRenderGraph(); wfRenderProp();
  }
  function wfDrag(m) {
    var stage = document.getElementById('wf-stage'); var id = m.dataset.id; var on = false;
    m.addEventListener('pointerdown', function (e) { e.preventDefault(); on = true; try { m.setPointerCapture(e.pointerId); } catch (_) {} });
    m.addEventListener('pointermove', function (e) { if (!on) return; var r = stage.getBoundingClientRect();
      var x = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)), y = Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100));
      var n = nodeById(id); if (n) { n.x = Math.round(x * 10) / 10; n.y = Math.round(y * 10) / 10; } m.style.left = n.x + '%'; m.style.top = n.y + '%'; wfRenderGraph(); });
    m.addEventListener('pointerup', function (e) { on = false; try { m.releasePointerCapture(e.pointerId); } catch (_) {} });
  }
  function wfRenderProp() {
    var n = nodeById(W.sel); var p = document.getElementById('wf-prop'); if (!n) { p.innerHTML = ''; return; }
    var link = portalBase() + 'wayfind.html?from=' + n.id;
    p.innerHTML = '<div class="dorm-card"><h3 class="dorm-h3">지점 속성</h3>' +
      '<div class="dorm-row4"><div><label class="dorm-label">이름</label><input id="wf-n-name" class="form-input" value="' + esc(n.name) + '"></div>' +
      '<div><label class="dorm-label">유형</label><select id="wf-n-type" class="form-select">' + TYPES.map(function (t) { return '<option' + (t === n.type ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div>' +
      '<div style="align-self:end"><label class="dorm-cb"><input type="checkbox" id="wf-n-qr"' + (n.qr ? ' checked' : '') + '> QR 지점</label></div>' +
      '<div style="align-self:end"><button id="wf-n-del" class="btn btn-ghost btn-sm" style="color:#dc2626">지점 삭제</button></div></div>' +
      (n.qr ? '<div class="dorm-actions" style="align-items:center"><img src="' + qrImg(link, 160) + '" style="width:160px;height:160px;border:1px solid #e5e7eb;border-radius:8px"><div><p class="dorm-muted" style="word-break:break-all">' + esc(link) + '</p><button id="wf-n-copy" class="btn btn-secondary btn-sm">링크 복사</button> <a class="btn btn-ghost btn-sm" href="' + qrImg(link, 600) + '" target="_blank">QR 크게보기</a></div></div>' : '<p class="dorm-muted">「QR 지점」을 체크하면 이 지점의 QR(현재위치 설정용)이 생성됩니다.</p>') +
      '</div>';
    document.getElementById('wf-n-name').addEventListener('input', function () { n.name = this.value; wfRenderGraph(); });
    document.getElementById('wf-n-type').addEventListener('change', function () { n.type = this.value; wfRenderGraph(); });
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
