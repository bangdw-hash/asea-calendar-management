'use strict';
/**
 * contractgen.js — 전자서식·계약 생성 엔진 (관리자)
 *  PDF 업로드 → 입력 필드 배치 → 발행 → 외부 링크(공개/토큰) → 제출 이력
 *  공개 작성 페이지: form.html (?id=서식ID [&t=토큰])
 *  데이터: Supabase form_templates / form_submissions (기숙사와 동일 프로젝트)
 *  PDF 렌더: 전역 pdfjsLib (index.html 에서 로드) · 완성본 출력: jsPDF(지연 로드)
 */
(function () {
  var ROOT = 'contractgen-root';
  var DEFAULT_URL = 'https://zbpeyklwpotjyveipzxd.supabase.co';
  var DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV5a2x3cG90anl2ZWlwenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTYxMDcsImV4cCI6MjA5NzA5MjEwN30.6JgoQ6rPRnmrbBTG68A-Y9HDQk40mnwubhXVnkZvHrQ';
  var FTYPES = [['text', '글자'], ['date', '날짜'], ['number', '숫자/금액'], ['checkbox', '체크(✓)'], ['signature', '서명']];
  var _db = null, _session = null;
  // C.cur = 편집 중 서식 {id,title,description,pages:[{image,w,h}],fields:[{key,label,type,page,x,y,font_size,required}],link_mode,status}
  var C = { view: 'list', list: [], cur: null, page: 0, sel: null, subs: [], snap: false, grid: 1, _ci: {} };

  function root() { return document.getElementById(ROOT); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m, t) { try { if (typeof window.aseaToast === 'function') window.aseaToast(m, t); } catch (e) {} }
  function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function uid(p) { return (p || 'f') + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function cfg() { return { url: localStorage.getItem('asea_dorm_supabase_url') || DEFAULT_URL, key: localStorage.getItem('asea_dorm_supabase_key') || DEFAULT_KEY }; }
  function libReady() { return !!(window.supabase && window.supabase.createClient); }
  function ensure() { if (_db) return _db; if (!libReady()) return null; var c = cfg(); _db = window.supabase.createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true } }); return _db; }
  function portalBase() { try { return (location.origin + location.pathname).replace(/[^/]*$/, ''); } catch (e) { return ''; } }
  function r1(v) { return Math.round(v * 10) / 10; }
  function snap(v) { if (C.snap) { var g = C.grid || 1; return Math.round(v / g) * g; } return r1(v); }
  function clamp(v, max) { return Math.max(0, Math.min(max == null ? 100 : max, v)); }
  function isDraw(f) { return f.type === 'signature' || !!f.draw; }
  function loadImg(src) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src; }); }
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }

  async function onTabOpen() {
    var r = root(); if (!r) return;
    if (!libReady()) { r.innerHTML = '<p style="padding:40px;text-align:center;color:#9ca3af">라이브러리 로딩 중…</p>'; setTimeout(function () { if (libReady()) onTabOpen(); }, 600); return; }
    ensure();
    try { var s = await _db.auth.getSession(); _session = s && s.data ? s.data.session : null; } catch (e) { _session = null; }
    if (!_session) { renderLogin(); return; }
    if (C.view === 'edit' && C.cur) { renderEdit(); return; }
    if (C.view === 'subs' && C.cur) { renderSubs(); return; }
    try { await loadList(); } catch (e) { r.innerHTML = errBox(e); return; }
    renderList();
  }
  function errBox(e) { return '<div class="dorm-card"><p style="color:#dc2626">오류: ' + esc(e && e.message || e) + '</p><p class="dorm-muted">테이블이 없으면 form_templates/form_submissions SQL을 먼저 실행하세요.</p></div>'; }

  function renderLogin() {
    root().innerHTML = '<div class="dorm-card" style="max-width:420px;margin:24px auto"><h2 class="dorm-h2">🔐 전자서식 관리자 로그인</h2>' +
      '<p class="dorm-muted">기숙사관리와 동일한 Supabase 계정으로 로그인하세요.</p>' +
      '<label class="dorm-label">이메일</label><input id="cg-e" class="form-input" type="email">' +
      '<label class="dorm-label">비밀번호</label><input id="cg-p" class="form-input" type="password">' +
      '<div id="cg-lerr" style="color:#dc2626;font-size:12px;margin-top:6px;display:none"></div>' +
      '<div class="dorm-actions"><button id="cg-login" class="btn btn-primary">로그인</button></div></div>';
    document.getElementById('cg-login').addEventListener('click', async function () {
      var e = document.getElementById('cg-lerr'); e.style.display = 'none';
      var res = await _db.auth.signInWithPassword({ email: (val('cg-e') || '').trim(), password: val('cg-p') || '' });
      if (res.error) { e.textContent = '로그인 실패: ' + res.error.message; e.style.display = 'block'; return; }
      _session = res.data.session; onTabOpen();
    });
  }

  /* ── 목록 ─────────────────────────────────────────── */
  async function loadList() {
    var d = await _db.from('form_templates').select('id,title,description,fields,link_mode,status,created_at').order('created_at', { ascending: false });
    if (d.error) throw d.error; C.list = d.data || [];
  }
  function topBar(title) {
    return '<div class="dorm-top"><h2 class="dorm-title">📄 ' + esc(title) + '</h2>' +
      '<div class="dorm-user">' + esc((_session && _session.user && _session.user.email) || '') + ' <button id="cg-logout" class="btn btn-ghost btn-sm">로그아웃</button></div></div>';
  }
  function bindTop() { var b = document.getElementById('cg-logout'); if (b) b.addEventListener('click', async function () { try { await _db.auth.signOut(); } catch (e) {} _session = null; renderLogin(); }); }

  function renderList() {
    var rows = C.list.map(function (t) {
      var fc = (t.fields || []).length;
      var st = t.status === 'published' ? '<span class="dorm-badge occ">발행</span>' : (t.status === 'closed' ? '<span class="dorm-badge">마감</span>' : '<span class="dorm-badge vac">임시</span>');
      return '<tr><td><b>' + esc(t.title || '(제목없음)') + '</b><div class="dorm-muted">' + esc(t.description || '') + '</div></td>' +
        '<td>' + st + '</td><td>' + fc + '개</td>' +
        '<td><button class="btn btn-secondary btn-sm" data-cg-edit="' + t.id + '">편집</button> ' +
        '<button class="btn btn-ghost btn-sm" data-cg-subs="' + t.id + '">제출이력</button>' +
        (t.status === 'published' ? ' <button class="btn btn-ghost btn-sm" data-cg-link="' + t.id + '">링크</button>' : '') +
        ' <button class="btn btn-ghost btn-sm" style="color:#dc2626" data-cg-del="' + t.id + '">삭제</button></td></tr>';
    }).join('');
    root().innerHTML = topBar('전자서식 · 계약 생성') +
      '<div class="dorm-card"><div class="dorm-actions" style="justify-content:space-between"><h3 class="dorm-h3" style="margin:0">서식 관리</h3>' +
        '<button id="cg-new" class="btn btn-primary btn-sm">+ 새 서식 만들기</button></div>' +
      (C.list.length ? '<table class="dorm-table" style="margin-top:10px"><thead><tr><th>제목</th><th>상태</th><th>필드</th><th>관리</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<p class="dorm-muted" style="margin-top:10px">아직 만든 서식이 없습니다. 「새 서식 만들기」로 PDF를 올리고 입력 필드를 배치하세요.</p>') + '</div>';
    bindTop();
    document.getElementById('cg-new').addEventListener('click', newTemplate);
    root().querySelectorAll('[data-cg-edit]').forEach(function (b) { b.addEventListener('click', function () { editTemplate(b.dataset.cgEdit); }); });
    root().querySelectorAll('[data-cg-subs]').forEach(function (b) { b.addEventListener('click', function () { openSubs(b.dataset.cgSubs); }); });
    root().querySelectorAll('[data-cg-link]').forEach(function (b) { b.addEventListener('click', function () { showLinks(b.dataset.cgLink); }); });
    root().querySelectorAll('[data-cg-del]').forEach(function (b) { b.addEventListener('click', function () { delTemplate(b.dataset.cgDel); }); });
  }
  function tplById(id) { return C.list.filter(function (t) { return t.id === id; })[0]; }
  function newTemplate() { C.cur = { id: null, title: '', description: '', pages: [], fields: [], link_mode: 'both', status: 'draft' }; C.page = 0; C.sel = null; C.view = 'edit'; renderEdit(); }
  async function editTemplate(id) {
    var d = await _db.from('form_templates').select('*').eq('id', id).limit(1);
    if (d.error || !d.data || !d.data[0]) { toast('불러오기 실패', 'error'); return; }
    C.cur = d.data[0]; C.cur.pages = C.cur.pages || []; C.cur.fields = C.cur.fields || [];
    C.page = 0; C.sel = null; C.view = 'edit'; renderEdit();
  }
  async function delTemplate(id) {
    var t = tplById(id); if (!t) return; if (!confirm('"' + (t.title || '') + '" 서식을 삭제할까요? (제출 이력도 함께 삭제)')) return;
    var r = await _db.from('form_templates').delete().eq('id', id);
    if (r.error) { toast('삭제 실패: ' + r.error.message, 'error'); return; }
    toast('삭제했습니다.', 'success'); await loadList(); renderList();
  }
  function showLinks(id) { editTemplate(id).then(function(){ }); /* 편집화면 내 링크 영역으로 */ }

  /* ── 편집(필드 배치) ───────────────────────────────── */
  function renderEdit() {
    var t = C.cur; var pg = t.pages[C.page];
    var pubLink = t.id ? portalBase() + 'form.html?id=' + t.id : '';
    root().innerHTML = topBar(t.id ? '서식 편집' : '새 서식') +
      '<div class="dorm-card"><div class="dorm-grid2">' +
        '<div><label class="dorm-label">서식 제목</label><input id="cg-title" class="form-input" placeholder="예: 퇴직연금 가입 신청서" value="' + esc(t.title) + '"></div>' +
        '<div><label class="dorm-label">설명(선택)</label><input id="cg-desc" class="form-input" value="' + esc(t.description || '') + '"></div>' +
      '</div>' +
      '<div class="dorm-actions">' +
        '<label class="btn btn-secondary btn-sm" style="cursor:pointer">📄 PDF 업로드(여러 장 가능)<input id="cg-pdf" type="file" accept="application/pdf" multiple hidden></label>' +
        (t.pages.length ? '<button id="cg-save" class="btn btn-secondary btn-sm">임시저장</button><button id="cg-pub" class="btn btn-primary btn-sm">' + (t.status === 'published' ? '재발행' : '발행하기') + '</button>' : '') +
        '<button id="cg-back" class="btn btn-ghost btn-sm" style="margin-left:auto">← 목록</button>' +
      '</div>' +
      (t.pages.length ? pageNav(t) +
        '<div class="dorm-actions" style="margin-top:4px"><label class="dorm-cb"><input type="checkbox" id="cg-snap"' + (C.snap ? ' checked' : '') + '> 격자 맞춤(촘촘히 정렬)</label></div>' +
        '<p class="dorm-muted"><b>값이 들어갈 자리를 클릭</b>해 칸을 추가(이름 입력). 칸을 <b>드래그=이동</b>, 모서리 핸들 <b>드래그=크기 조절</b>(많이 쓰는 칸은 크게), <b>클릭=속성 편집</b>. 글씨는 칸을 넘치면 자동으로 작아집니다.</p>' +
        '<div id="cg-stage" class="cg-stage"><img src="' + pg.image + '" class="cg-img"><div id="cg-fields"></div></div>'
        : '<p class="dorm-muted">먼저 PDF를 업로드하세요. 각 페이지가 배경으로 깔리고 그 위에 입력 자리를 찍습니다.</p>') +
      '</div>' +
      '<div id="cg-prop"></div>' +
      (t.id ? '<div class="dorm-card"><h3 class="dorm-h3">🔗 외부 작성 링크</h3>' +
        (t.status === 'published'
          ? '<p class="dorm-muted">공개 링크(누구나 작성): <b>' + esc(pubLink) + '</b></p>' +
            '<div class="dorm-actions"><button id="cg-copy" class="btn btn-secondary btn-sm">공개 링크 복사</button>' +
            '<button id="cg-token" class="btn btn-secondary btn-sm">1회용 토큰 링크 생성·복사</button>' +
            '<a class="btn btn-ghost btn-sm" href="' + pubLink + '" target="_blank" rel="noopener">미리보기</a></div>'
          : '<p class="dorm-muted">발행하면 외부 작성 링크(공개/1회용 토큰)가 생성됩니다.</p>') + '</div>' : '') ;
    bindTop();
    document.getElementById('cg-pdf').addEventListener('change', onUploadPdf);
    document.getElementById('cg-back').addEventListener('click', function () { C.view = 'list'; C.cur = null; onTabOpen(); });
    var sv = document.getElementById('cg-save'); if (sv) sv.addEventListener('click', function () { saveTemplate('draft'); });
    var pb = document.getElementById('cg-pub'); if (pb) pb.addEventListener('click', function () { saveTemplate('published'); });
    var cp = document.getElementById('cg-copy'); if (cp) cp.addEventListener('click', function () { copy(pubLink); });
    var tk = document.getElementById('cg-token'); if (tk) tk.addEventListener('click', function () { copy(pubLink + '&t=' + uid('t')); toast('1회용 토큰 링크를 복사했습니다.', 'success'); });
    root().querySelectorAll('[data-cg-pg]').forEach(function (b) { b.addEventListener('click', function () { C.page = +b.dataset.cgPg; C.sel = null; renderEdit(); }); });
    var dp = document.getElementById('cg-delpage'); if (dp) dp.addEventListener('click', delPage);
    var sn = document.getElementById('cg-snap'); if (sn) sn.addEventListener('change', function () { C.snap = this.checked; });
    if (t.pages.length) { cgBindStage(); cgRenderFields(); if (C.sel) cgRenderProp(); }
  }
  function pageNav(t) {
    if (t.pages.length <= 1) return '<div class="dorm-actions"><span class="dorm-muted">1 페이지</span><button id="cg-delpage" class="btn btn-ghost btn-sm" style="color:#dc2626;margin-left:auto">이 페이지 삭제</button></div>';
    var btns = t.pages.map(function (p, i) { return '<button class="dorm-mode' + (i === C.page ? ' active' : '') + '" data-cg-pg="' + i + '">' + (i + 1) + '쪽</button>'; }).join('');
    return '<div class="dorm-actions" style="margin-top:6px">' + btns + '<button id="cg-delpage" class="btn btn-ghost btn-sm" style="color:#dc2626;margin-left:auto">이 페이지 삭제</button></div>';
  }
  function delPage() {
    var t = C.cur; if (!t.pages.length) return; if (!confirm((C.page + 1) + '쪽을 삭제할까요? (이 쪽의 필드도 삭제)')) return;
    t.pages.splice(C.page, 1);
    t.fields = t.fields.filter(function (f) { return f.page !== C.page; }).map(function (f) { if (f.page > C.page) f.page--; return f; });
    C.page = Math.max(0, C.page - 1); C.sel = null; renderEdit();
  }

  async function onUploadPdf(e) {
    var files = Array.prototype.slice.call(e.target.files || []); if (!files.length) return;
    if (!window.pdfjsLib) { toast('PDF 라이브러리 로드 실패', 'error'); return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    toast('PDF 변환 중…', 'info');
    try {
      for (var fi = 0; fi < files.length; fi++) {
        var buf = await files[fi].arrayBuffer();
        var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        for (var i = 1; i <= pdf.numPages; i++) {
          var page = await pdf.getPage(i);
          var vp = page.getViewport({ scale: 1.6 });
          var cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
          await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
          C.cur.pages.push({ image: cv.toDataURL('image/jpeg', 0.82), w: Math.round(vp.width), h: Math.round(vp.height) });
        }
      }
      C.page = 0; toast('업로드 완료 (' + C.cur.pages.length + '쪽)', 'success'); renderEdit();
    } catch (err) { toast('변환 실패: ' + (err.message || err), 'error'); }
  }

  function cgBindStage() {
    var stage = document.getElementById('cg-stage');
    stage.addEventListener('click', function (e) {
      if (e.target.closest('.cg-mk')) return;
      var r = stage.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width * 100, y = (e.clientY - r.top) / r.height * 100;
      var lab = prompt('이 자리에 들어갈 항목 이름 (예: 성명, 주민번호, 입사일, 계좌번호)', '');
      if (lab == null || !lab.trim()) return;
      var f = { key: uid(), label: lab.trim(), type: 'text', page: C.page, x: snap(clamp(x, 90)), y: snap(clamp(y, 96)), w: 24, h: 5, font_size: 2.4, required: true, draw: false };
      C.cur.fields.push(f); C.sel = f.key; cgRenderFields(); cgRenderProp();
    });
  }
  function cgRenderFields() {
    var wrap = document.getElementById('cg-fields'); if (!wrap) return;
    var fs = C.cur.fields.filter(function (f) { return f.page === C.page; });
    wrap.innerHTML = fs.map(function (f) {
      var icon = isDraw(f) ? '✍ ' : f.type === 'checkbox' ? '☑ ' : '';
      var w = f.w || 24, h = f.h || 5;
      return '<div class="cg-mk' + (C.sel === f.key ? ' sel' : '') + (isDraw(f) ? ' draw' : '') + '" data-id="' + f.key + '" style="left:' + f.x + '%;top:' + f.y + '%;width:' + w + '%;height:' + h + '%" title="' + esc(f.label) + '"><span class="cg-lab">' + icon + esc(f.label) + '</span><span class="cg-rs" data-rs="' + f.key + '"></span></div>';
    }).join('');
    wrap.querySelectorAll('.cg-mk').forEach(function (m) {
      cgDrag(m);
      m.addEventListener('click', function (ev) { ev.stopPropagation(); if (m._sup) { m._sup = false; return; } C.sel = m.dataset.id; cgRenderFields(); cgRenderProp(); });
    });
    wrap.querySelectorAll('.cg-rs').forEach(function (h) { cgResize(h); });
  }
  function fldBy(id) { return C.cur.fields.filter(function (f) { return f.key === id; })[0]; }
  function cgDrag(m) {
    var stage = document.getElementById('cg-stage'); var id = m.dataset.id; var on = false, moved = false, pid = null;
    m.addEventListener('pointerdown', function (e) { if (e.button !== 0 || e.target.classList.contains('cg-rs')) return; e.preventDefault(); on = true; moved = false; pid = e.pointerId; try { m.setPointerCapture(e.pointerId); } catch (_) {} });
    m.addEventListener('pointermove', function (e) { if (!on) return; var r = stage.getBoundingClientRect();
      var x = clamp((e.clientX - r.left) / r.width * 100, 100), y = clamp((e.clientY - r.top) / r.height * 100, 100);
      var f = fldBy(id); if (f) { moved = true; f.x = snap(x); f.y = snap(y); m.style.left = f.x + '%'; m.style.top = f.y + '%'; } });
    m.addEventListener('pointerup', function () { if (moved) m._sup = true; on = false; try { m.releasePointerCapture(pid); } catch (_) {} });
  }
  function cgResize(h) {
    var stage = document.getElementById('cg-stage'); var id = h.dataset.rs; var on = false, pid = null;
    h.addEventListener('pointerdown', function (e) { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); on = true; pid = e.pointerId; try { h.setPointerCapture(e.pointerId); } catch (_) {} });
    h.addEventListener('pointermove', function (e) { if (!on) return; var r = stage.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width * 100, py = (e.clientY - r.top) / r.height * 100;
      var f = fldBy(id); if (f) { f.w = Math.max(3, snap(clamp(px - f.x, 100))); f.h = Math.max(2, snap(clamp(py - f.y, 100))); var m = h.parentNode; m.style.width = f.w + '%'; m.style.height = f.h + '%'; } });
    h.addEventListener('pointerup', function () { on = false; try { h.releasePointerCapture(pid); } catch (_) {} });
  }
  function cgRenderProp() {
    var f = C.cur.fields.filter(function (x) { return x.key === C.sel; })[0];
    var p = document.getElementById('cg-prop'); if (!f) { p.innerHTML = ''; return; }
    p.innerHTML = '<div class="dorm-card"><h3 class="dorm-h3">필드 속성</h3><div class="dorm-row4">' +
      '<div><label class="dorm-label">항목 이름</label><input id="cg-f-label" class="form-input" value="' + esc(f.label) + '"></div>' +
      '<div><label class="dorm-label">유형</label><select id="cg-f-type" class="form-select">' + FTYPES.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === f.type ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="dorm-label">최대 글자크기(%)</label><input id="cg-f-size" class="form-input" type="number" step="0.2" min="1" value="' + (f.font_size || 2.4) + '"></div>' +
      '<div style="align-self:end"><label class="dorm-cb"><input type="checkbox" id="cg-f-req"' + (f.required ? ' checked' : '') + '> 필수</label></div>' +
      '<div><label class="dorm-label">칸 너비(%)</label><input id="cg-f-w" class="form-input" type="number" step="1" min="3" value="' + (f.w || 24) + '"></div>' +
      '<div><label class="dorm-label">칸 높이(%)</label><input id="cg-f-h" class="form-input" type="number" step="1" min="2" value="' + (f.h || 5) + '"></div>' +
      '<div style="align-self:end"><label class="dorm-cb"><input type="checkbox" id="cg-f-draw"' + (isDraw(f) ? ' checked' : '') + (f.type === 'signature' ? ' disabled' : '') + '> ✍ 손글씨로 입력받기</label></div>' +
      '<div style="align-self:end"><button id="cg-f-del" class="btn btn-ghost btn-sm" style="color:#dc2626">필드 삭제</button></div>' +
      '</div><p class="dorm-muted">칸 너비·높이만큼 영역이 잡히고, 입력값이 길면 <b>글씨가 자동으로 작아져</b> 칸 안에 들어갑니다(필요시 줄바꿈). <b>손글씨로 입력받기</b>를 켜면 작성자가 그 칸에 자필로 써서 그림으로 들어갑니다(서명·이름 등). 위치/크기는 완성본 PDF 좌표가 됩니다.</p></div>';
    document.getElementById('cg-f-label').addEventListener('input', function () { f.label = this.value; cgRenderFields(); });
    document.getElementById('cg-f-type').addEventListener('change', function () { f.type = this.value; cgRenderFields(); cgRenderProp(); });
    document.getElementById('cg-f-size').addEventListener('input', function () { f.font_size = parseFloat(this.value) || 2.4; });
    document.getElementById('cg-f-w').addEventListener('input', function () { f.w = Math.max(3, parseFloat(this.value) || 24); cgRenderFields(); });
    document.getElementById('cg-f-h').addEventListener('input', function () { f.h = Math.max(2, parseFloat(this.value) || 5); cgRenderFields(); });
    document.getElementById('cg-f-req').addEventListener('change', function () { f.required = this.checked; });
    document.getElementById('cg-f-draw').addEventListener('change', function () { f.draw = this.checked; cgRenderFields(); });
    document.getElementById('cg-f-del').addEventListener('click', function () { C.cur.fields = C.cur.fields.filter(function (x) { return x.key !== f.key; }); C.sel = null; cgRenderFields(); document.getElementById('cg-prop').innerHTML = ''; });
  }

  async function saveTemplate(status) {
    var t = C.cur;
    t.title = val('cg-title').trim() || t.title; t.description = val('cg-desc');
    if (!t.title) { toast('서식 제목을 입력하세요.', 'warning'); return; }
    if (!t.pages.length) { toast('PDF를 먼저 업로드하세요.', 'warning'); return; }
    if (status === 'published' && !t.fields.length) { toast('입력 필드를 1개 이상 배치한 뒤 발행하세요.', 'warning'); return; }
    var row = { title: t.title, description: t.description, pages: t.pages, fields: t.fields, link_mode: t.link_mode || 'both', status: status, updated_at: new Date().toISOString() };
    if (t.id) row.id = t.id; else row.created_by = (_session && _session.user && _session.user.email) || '';
    var res = await _db.from('form_templates').upsert(row).select('id').limit(1);
    if (res.error) { toast('저장 실패: ' + res.error.message, 'error'); return; }
    if (res.data && res.data[0]) t.id = res.data[0].id; t.status = status;
    toast(status === 'published' ? '발행했습니다.' : '임시저장했습니다.', 'success');
    renderEdit();
  }

  /* ── 제출 이력 ─────────────────────────────────────── */
  async function openSubs(id) {
    var t = tplById(id); if (!t) { await editTemplate(id); t = C.cur; } else { var d = await _db.from('form_templates').select('*').eq('id', id).limit(1); C.cur = (d.data && d.data[0]) || t; }
    C.view = 'subs'; renderSubs();
  }
  function subById(id) { return C.subs.filter(function (x) { return x.id === id; })[0]; }
  async function renderSubs() {
    var t = C.cur;
    var d = await _db.from('form_submissions').select('*').eq('template_id', t.id).order('created_at', { ascending: false });
    C.subs = (d.data) || [];
    var ci = await _db.from('contract_integrity').select('id,submission_id').eq('template_id', t.id);
    C._ci = {}; (ci.data || []).forEach(function (r) { if (r.submission_id) C._ci[r.submission_id] = r.id; });
    var rows = C.subs.map(function (s, i) {
      var vals = s.values || {}; var summary = Object.keys(vals).slice(0, 3).map(function (k) { return esc(String(vals[k])); }).join(' · ');
      var cid = C._ci[s.id];
      var integ = cid ? '<span class="dorm-badge occ">🔒 검증가능</span>' : '<span class="dorm-badge vac">미등록</span>';
      var act = '<button class="btn btn-secondary btn-sm" data-cg-pdf="' + s.id + '">완성본 PDF' + (cid ? '' : ' + 등록') + '</button>';
      if (cid) act += ' <button class="btn btn-ghost btn-sm" data-cg-vlink="' + cid + '">검증링크</button> <button class="btn btn-ghost btn-sm" data-cg-rereg="' + s.id + '">재등록</button>';
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(s.submitter_name || '(이름없음)') + '<div class="dorm-muted">' + esc(s.submitter_contact || '') + '</div></td>' +
        '<td class="dorm-muted">' + summary + '</td><td>' + esc((s.submitted_at || s.created_at || '').slice(0, 16).replace('T', ' ')) + '</td>' +
        '<td>' + integ + '</td><td>' + act + '</td></tr>';
    }).join('');
    root().innerHTML = topBar('제출 이력 — ' + esc(t.title || '')) +
      '<div class="dorm-card"><div class="dorm-actions" style="justify-content:space-between"><h3 class="dorm-h3" style="margin:0">' + esc(t.title || '') + ' 제출 (' + C.subs.length + ')</h3>' +
        '<div><a class="btn btn-ghost btn-sm" href="' + portalBase() + 'contract-verify.html" target="_blank" rel="noopener">🔎 검증 포털</a> <button id="cg-back2" class="btn btn-ghost btn-sm">← 목록</button></div></div>' +
      '<p class="dorm-muted">「완성본 PDF」를 누르면 그 파일이 발급되고 <b>무결성 원본으로 자동 등록</b>됩니다(검증 가능). 같은 파일을 검증 포털에 올리면 위·변조 여부가 확인됩니다.</p>' +
      (C.subs.length ? '<table class="dorm-table" style="margin-top:10px"><thead><tr><th>#</th><th>제출자</th><th>요약</th><th>제출시각</th><th>무결성</th><th>출력/검증</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<p class="dorm-muted" style="margin-top:10px">아직 제출이 없습니다.</p>') + '</div>';
    bindTop();
    document.getElementById('cg-back2').addEventListener('click', function () { C.view = 'list'; C.cur = null; onTabOpen(); });
    root().querySelectorAll('[data-cg-pdf]').forEach(function (b) { b.addEventListener('click', function () { var s = subById(b.dataset.cgPdf); if (s) genPdf(t, s, !C._ci[s.id]).then(renderSubs); }); });
    root().querySelectorAll('[data-cg-rereg]').forEach(function (b) { b.addEventListener('click', function () { var s = subById(b.dataset.cgRereg); if (s && confirm('완성본을 새로 발급하고 무결성을 재등록할까요? (이전 발급본은 더 이상 검증되지 않습니다)')) genPdf(t, s, true).then(renderSubs); }); });
    root().querySelectorAll('[data-cg-vlink]').forEach(function (b) { b.addEventListener('click', function () { copy(portalBase() + 'contract-verify.html?id=' + b.dataset.cgVlink); }); });
  }

  // ── 무결성(ECIS): 해시·매니페스트·감사체인 ──────────────
  async function sha256Hex(data) {
    var bytes = typeof data === 'string' ? new TextEncoder().encode(data) : (data instanceof ArrayBuffer ? new Uint8Array(data) : data);
    var h = await crypto.subtle.digest('SHA-256', bytes);
    return Array.prototype.map.call(new Uint8Array(h), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  async function ensurePdfLib() { if (!window.PDFLib) await loadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'); }
  async function pageHashesOf(bytes) {
    await ensurePdfLib();
    var src = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    var n = src.getPageCount(), out = [];
    for (var i = 0; i < n; i++) {
      var d = await PDFLib.PDFDocument.create(); var pgs = await d.copyPages(src, [i]); d.addPage(pgs[0]);
      var b = await d.save(); var hh = await sha256Hex(b);
      out.push({ pageIndex: i, pageNumber: i + 1, hash: hh, byteSize: b.length });
    }
    return out;
  }
  function entryHashOf(prev, cid, ev, actor, payload) { return sha256Hex(prev + '|' + cid + '|' + ev + '|' + (actor || '') + '|' + JSON.stringify(payload || {})); }
  async function appendAudit(cid, ev, payload) {
    var actor = (_session && _session.user && _session.user.email) || 'admin';
    var last = await _db.rpc('ci_audit_get', { p_id: cid }); var arr = last.data || [];
    var prev = arr.length ? arr[arr.length - 1].entry_hash : '';
    var eh = await entryHashOf(prev, cid, ev, actor, payload);
    await _db.rpc('ci_audit_add', { p_contract: cid, p_event: ev, p_actor: actor, p_payload: payload, p_prev: prev, p_entry: eh });
  }
  async function registerIntegrity(tpl, sub, bytes) {
    var fileHash = await sha256Hex(bytes);
    var ph = await pageHashesOf(bytes);
    var manifest = { contractId: null, createdAt: new Date().toISOString(), totalPages: ph.length, fileHash: fileHash, pageHashes: ph,
      signers: [{ name: sub.submitter_name || '', email: sub.submitter_contact || '', signedAt: sub.submitted_at || sub.created_at || '', ip: '', userAgent: '', signatureHex: '' }] };
    var ins = await _db.from('contract_integrity').insert({ submission_id: sub.id, template_id: tpl.id, title: tpl.title, file_hash: fileHash, total_pages: ph.length, manifest: manifest, created_by: (_session && _session.user && _session.user.email) || '' }).select('id').limit(1);
    if (ins.error) { toast('무결성 등록 실패: ' + ins.error.message, 'error'); return null; }
    var cid = ins.data[0].id; manifest.contractId = cid;
    await _db.from('contract_integrity').update({ manifest: manifest }).eq('id', cid);
    await appendAudit(cid, 'CONTRACT_CREATED', { fileHash: fileHash, totalPages: ph.length, submitter: sub.submitter_name || '' });
    return cid;
  }

  // 칸(boxW×boxH)에 맞게 글씨 자동 축소 + 필요시 줄바꿈
  function drawFitText(ctx, text, x, y, boxW, boxH, maxPx) {
    var size = maxPx, min = Math.max(6, maxPx * 0.4);
    function setF(s) { ctx.font = '600 ' + s + 'px "Malgun Gothic","Apple SD Gothic Neo",sans-serif'; }
    setF(size);
    while (size > min && ctx.measureText(text).width > boxW) { size -= 0.5; setF(size); }
    if (ctx.measureText(text).width <= boxW || boxH < size * 2) { ctx.fillText(text, x, y, boxW); return; }
    var lines = [], cur = '';                         // 한글: 글자 단위 줄바꿈
    for (var i = 0; i < text.length; i++) { var test = cur + text[i]; if (ctx.measureText(test).width > boxW && cur) { lines.push(cur); cur = text[i]; } else cur = test; }
    if (cur) lines.push(cur);
    var maxLines = Math.max(1, Math.floor(boxH / (size * 1.18)));
    for (var li = 0; li < Math.min(lines.length, maxLines); li++) ctx.fillText(lines[li], x, y + li * size * 1.18, boxW);
  }
  async function genPdf(tpl, sub, autoRegister) {
    try {
      toast('완성본 생성 중…', 'info');
      if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      var JsPDF = window.jspdf.jsPDF, doc = null;
      var vals = sub.values || {}, sigs = sub.signatures || {};
      for (var pi = 0; pi < tpl.pages.length; pi++) {
        var pg = tpl.pages[pi];
        var cv = document.createElement('canvas'); cv.width = pg.w; cv.height = pg.h;
        var ctx = cv.getContext('2d');
        var bg = await loadImg(pg.image); ctx.drawImage(bg, 0, 0, pg.w, pg.h);
        ctx.fillStyle = '#111'; ctx.textBaseline = 'top';
        var fs = tpl.fields.filter(function (f) { return f.page === pi; });
        for (var k = 0; k < fs.length; k++) {
          var f = fs[k], x = f.x / 100 * pg.w, y = f.y / 100 * pg.h;
          var boxW = (f.w || 24) / 100 * pg.w, boxH = (f.h || 5) / 100 * pg.h, maxPx = (f.font_size || 2.4) / 100 * pg.h;
          if (f.type === 'signature' || f.draw) { var sg = sigs[f.key]; if (sg) { var si = await loadImg(sg); var iw = si.width, ih = si.height, sc = Math.min(boxW / iw, boxH / ih); ctx.drawImage(si, x, y, iw * sc, ih * sc); } }
          else if (f.type === 'checkbox') { if (vals[f.key]) { var cp = Math.min(boxH, maxPx) * 1.1; ctx.font = '700 ' + cp + 'px "Malgun Gothic",sans-serif'; ctx.fillText('✓', x, y); } }
          else if (vals[f.key] != null && vals[f.key] !== '') drawFitText(ctx, String(vals[f.key]), x, y, boxW, boxH, maxPx);
        }
        var orient = pg.w > pg.h ? 'l' : 'p';
        if (!doc) doc = new JsPDF({ orientation: orient, unit: 'px', format: [pg.w, pg.h] });
        else doc.addPage([pg.w, pg.h], orient);
        doc.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pg.w, pg.h);
      }
      var bytes = new Uint8Array(doc.output('arraybuffer'));   // 다운로드/해시 동일 바이트
      var name = (tpl.title || '문서') + '_' + (sub.submitter_name || '') + '.pdf';
      var blob = new Blob([bytes], { type: 'application/pdf' }), urlb = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = urlb; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(urlb);
      if (autoRegister) { var cid = await registerIntegrity(tpl, sub, bytes); if (cid) { C._ci[sub.id] = cid; toast('완성본 발급 + 무결성 등록 완료 (검증 가능)', 'success'); } }
      else toast('완성본 PDF를 내려받았습니다.', 'success');
    } catch (e) { toast('PDF 생성 실패: ' + (e.message || e), 'error'); }
  }

  function copy(txt) { try { navigator.clipboard.writeText(txt).then(function () { toast('복사했습니다.', 'success'); }); } catch (e) { prompt('링크', txt); } }

  window.FormModule = { onTabOpen: onTabOpen };
})();
