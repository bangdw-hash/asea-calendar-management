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
  function bindEsc() {
    if (W._escBound) return; W._escBound = true;
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!root() || document.getElementById(ROOT) !== root()) {}
      if (W._cancelDrag) { W._cancelDrag(); }
      else if (W.linkFrom) { W.linkFrom = null; wfRenderGraph(); toast('연결을 취소했습니다.', 'info'); }
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
      (f ? '<div class="dorm-actions" style="margin-top:6px">' +
        ['node', 'link', 'move'].map(function (m) { var lab = { node: '지점 추가', link: '지점 연결', move: '이동' }[m]; return '<button class="dorm-mode' + (W.mode === m ? ' active' : '') + '" data-wfm="' + m + '">' + lab + '</button>'; }).join('') +
        '<button id="wf-delfloor" class="btn btn-ghost btn-sm" style="color:#dc2626;margin-left:auto">이 층 삭제</button></div>' +
        '<p class="dorm-muted">' + (W.mode === 'node' ? '도면 빈 곳을 클릭하면 <b>이름을 입력</b>해 지점을 추가합니다. 지점 <b>더블클릭=이름 변경</b>, 클릭=속성 편집.' : W.mode === 'link' ? '연결할 지점을 차례로 클릭하면 경로가 이어집니다. (ESC=연결 취소)' : '지점을 드래그해 위치를 옮깁니다. 드래그 중 <b>ESC·우클릭</b>이면 취소. <b>더블클릭=이름 변경</b>.') +
        ' <b style="color:#dc2626">우클릭</b>: 경로(선)=그 경로 삭제 · 지점=그 지점 삭제. (계단/엘리베이터는 <b>여러 층에 같은 이름</b>으로 두면 층간 자동 연결됩니다.)</p>' : '') +
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

  function wfBindStage() {
    var stage = document.getElementById('wf-stage');
    stage.addEventListener('click', function (e) {
      if (W.mode !== 'node') return;
      if (e.target.closest('.wf-mk')) return;
      var r = stage.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width * 100, y = (e.clientY - r.top) / r.height * 100;
      var def = '지점' + (W.nodes.length + 1);
      var nm = prompt('이 지점의 이름을 입력하세요. (예: 항공보안 무도장)\n※ 입력한 이름이 방문자 목적지 검색에 그대로 사용됩니다. 비워두면 임시 이름으로 생성됩니다.', '');
      var name = (nm == null || !nm.trim()) ? def : nm.trim();
      var n = { id: uid(), floor: W.cur, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, name: name, type: '일반', qr: false };
      W.nodes.push(n); W.sel = n.id; wfRenderGraph(); wfRenderProp();
    });
    // 빈 곳 우클릭: 브라우저 메뉴 차단 + 연결/드래그 중이면 취소
    stage.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (W._cancelDrag) { W._cancelDrag(); return; }
      if (W.linkFrom) { W.linkFrom = null; wfRenderGraph(); toast('연결을 취소했습니다.', 'info'); }
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
      var lines = '';
      W.edges.forEach(function (ed, idx) { var a = nodeById(ed[0]), b = nodeById(ed[1]); if (a && b && a.floor === W.cur && b.floor === W.cur) {
        lines += '<line class="wf-edge" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>';
        lines += '<line class="wf-hit" data-ei="' + idx + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"><title>우클릭으로 이 경로 삭제</title></line>';
      } });
      svg.innerHTML = lines;
      svg.querySelectorAll('.wf-hit').forEach(function (h) {
        h.addEventListener('contextmenu', function (ev) { ev.preventDefault(); ev.stopPropagation(); var i = +this.dataset.ei; if (i >= 0) { W.edges.splice(i, 1); wfRenderGraph(); toast('경로를 삭제했습니다.', 'success'); } });
      });
    }
    var wrap = document.querySelector('#wf-stage .wf-nodes'); if (!wrap) return;
    wrap.innerHTML = nodes.map(function (n) { var cls = 'wf-mk t-' + esc(n.type) + (W.sel === n.id ? ' sel' : '') + (W.linkFrom === n.id ? ' linking' : '') + (n.qr ? ' qr' : '');
      return '<div class="' + cls + '" data-id="' + n.id + '" style="left:' + n.x + '%;top:' + n.y + '%" title="' + esc(n.name) + ' — 우클릭으로 삭제"><span>' + esc(n.name) + '</span></div>'; }).join('');
    wrap.querySelectorAll('.wf-mk').forEach(function (m) {
      if (W.mode === 'move') wfDrag(m);
      m.addEventListener('click', function (ev) { ev.stopPropagation(); wfNodeClick(this.dataset.id); });
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
    var stage = document.getElementById('wf-stage'); var id = m.dataset.id; var on = false, ox = 0, oy = 0, pid = null;
    function endDrag() { on = false; W._cancelDrag = null; if (pid != null) { try { m.releasePointerCapture(pid); } catch (_) {} pid = null; } }
    function cancel() { if (!on) return; var n = nodeById(id); if (n) { n.x = ox; n.y = oy; } endDrag(); wfRenderGraph(); toast('이동을 취소했습니다.', 'info'); }
    m.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;            // 좌클릭만 드래그 시작 (우클릭은 contextmenu에서 처리)
      e.preventDefault(); var n = nodeById(id); if (!n) return;
      ox = n.x; oy = n.y; on = true; pid = e.pointerId; W._cancelDrag = cancel;
      try { m.setPointerCapture(e.pointerId); } catch (_) {}
    });
    m.addEventListener('pointermove', function (e) { if (!on) return; var r = stage.getBoundingClientRect();
      var x = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)), y = Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100));
      var n = nodeById(id); if (n) { n.x = Math.round(x * 10) / 10; n.y = Math.round(y * 10) / 10; m.style.left = n.x + '%'; m.style.top = n.y + '%'; } wfRenderGraph(); });
    m.addEventListener('pointerup', function () { endDrag(); });
  }
  function wfRenderProp() {
    var n = nodeById(W.sel); var p = document.getElementById('wf-prop'); if (!n) { p.innerHTML = ''; return; }
    var link = portalBase() + 'wayfind.html?from=' + n.id;
    p.innerHTML = '<div class="dorm-card"><h3 class="dorm-h3">지점 속성</h3>' +
      '<div class="dorm-row4"><div><label class="dorm-label">이름 (목적지 검색에 사용)</label><input id="wf-n-name" class="form-input" placeholder="예: 항공보안 무도장" value="' + esc(n.name) + '"></div>' +
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
