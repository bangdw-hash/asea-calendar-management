'use strict';
/**
 * award-side.js — 편집 사이드바 (AW.Side): 오른쪽 아이콘 막대 + 펼쳐지는 패널
 *  · 레이어(순서·표시·잠금·이름·배경 행, 우클릭 메뉴) · 속성(mm 위치·크기·비율 잠금·정렬) · 색상(HTML 코드·팔레트·최근 색) · 기록(작업 단계 이동)
 */
(function () {
  var AW = window.AW, S = AW.S, X = AW.Side = {};
  var cur = AW.lsGet('award_side', ''), root = null, panel = null, box = null, ctarget = null, dragId = null;
  var PANELS = [['layers', '레이어', 'layers'], ['props', '속성 · 크기', 'sliders'], ['color', '색상', 'palette'], ['hist', '작업 기록', 'history']];
  var SW = ['#111111', '#444444', '#888888', '#FFFFFF', '#B8860B', '#8C6D1F', '#C9A227', '#1F3A68', '#0EA5E9', '#8B1E2D', '#1F5F46', '#6B4226'];
  function E() { return AW.Editor; }
  function T() { return S.tpl; }
  function api() { return E().api; }

  X.mount = function (r) {
    root = r; panel = AW.$('#side-panel', r); box = AW.$('.ed-side', r);
    AW.$('#side-rail', r).innerHTML = PANELS.map(function (p) { return '<button class="rail-btn" data-side="' + p[0] + '" title="' + p[1] + '" aria-label="' + p[1] + '">' + AW.ic(p[2], 18) + '</button>'; }).join('');
    AW.$('#side-rail', r).addEventListener('click', function (e) { var b = e.target.closest('[data-side]'); if (b) X.open(b.dataset.side); });
    panel.addEventListener('click', onClick); panel.addEventListener('contextmenu', onCtx); panel.addEventListener('input', onInput); panel.addEventListener('change', onChange);
    panel.addEventListener('dblclick', onDbl);
    panel.addEventListener('dragstart', onDragStart); panel.addEventListener('dragover', onDragOver); panel.addEventListener('drop', onDrop); panel.addEventListener('dragend', function () { dragId = null; X.update(); });
    draw(true);
  };
  X.open = function (id) {
    cur = (cur === id) ? '' : id; AW.lsSet('award_side', cur); draw(true); setTimeout(function () { E().relayout(); }, 260);
  };
  X.update = function (which) { if (!panel || !T()) return; if (which && which !== cur) return; if (!cur) return; draw(false); };

  function draw(full) {
    if (!box) return;
    box.classList.toggle('open', !!cur);
    AW.$$('.rail-btn', root).forEach(function (b) { b.classList.toggle('on', b.dataset.side === cur); b.setAttribute('aria-pressed', String(b.dataset.side === cur)); });
    if (!cur || !T()) { if (full) panel.innerHTML = ''; return; }
    var focusIn = panel.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if (cur === 'props') { if (full || !AW.$('#sp-props', panel)) panel.innerHTML = propsHtml(); refreshProps(); return; }
    if (focusIn && !full) return;          // 입력 중에는 다시 그리지 않음
    panel.innerHTML = cur === 'layers' ? layersHtml() : cur === 'color' ? colorHtml() : histHtml();
  }
  function head(t, extra) { return '<div class="sp-h"><b>' + t + '</b>' + (extra || '') + '<button class="icon-btn" data-side="' + cur + '" aria-label="패널 닫기">' + AW.ic('close', 16) + '</button></div>'; }

  /* ───────────── 레이어 ───────────── */
  function lyName(e) { return e.name || (e.t === 'text' ? (String(e.text).replace(/\s+/g, ' ').trim().slice(0, 18) || '(빈 글상자)') : e.t === 'rect' ? '사각형' : e.t === 'line' ? '선' : e.t === 'qr' ? '인증 QR' : e.t === 'table' ? '표 ' + e.rows + '×' + e.cols : '이미지'); }
  function layersHtml() {
    var els = T().elems, ic = { text: 'text', rect: 'rect', line: 'line', img: 'image', qr: 'qr', table: 'table' };
    var rows = els.slice().reverse().map(function (e) {
      return '<div class="ly' + (S.sel.indexOf(e.id) >= 0 ? ' on' : '') + (e.hide ? ' hid' : '') + '" draggable="true" data-id="' + e.id + '"><span class="li">' + AW.ic(ic[e.t] || 'text', 15) + '</span>' +
        (e.grp ? '<span class="gdot" title="그룹" style="background:hsl(' + (parseInt(e.grp.slice(-4), 36) % 360) + ',65%,50%)"></span>' : '') + '<span class="ln" title="더블클릭하여 이름 변경">' + AW.esc(lyName(e)) + '</span>' + (e.noprint ? '<span class="npb" title="인쇄 제외">인쇄 제외</span>' : '') +
        '<button class="icon-btn" data-ly="hide" title="' + (e.hide ? '보이기' : '숨기기') + '" aria-label="표시 전환">' + AW.ic(e.hide ? 'close' : 'eye', 15) + '</button><button class="icon-btn' + (e.lock ? ' on' : '') + '" data-ly="lock" title="잠금 전환" aria-label="잠금 전환">' + AW.ic(e.lock ? 'lock' : 'unlock', 15) + '</button></div>';
    }).join('');
    var bg = T().bg ? '<div class="ly bgrow' + (T().page.bgHide ? ' hid' : '') + '" title="우클릭: 보이기·삭제·교체"><span class="li">' + AW.ic('image', 15) + '</span><span class="ln">배경: ' + AW.esc(T().bgName || '양식') + '</span><button class="icon-btn" data-ly="bg" title="배경 표시 전환" aria-label="배경 표시 전환">' + AW.ic(T().page.bgHide ? 'close' : 'eye', 15) + '</button></div>' : '<div class="ly bgrow muted" title="우클릭: 배경 올리기"><span class="li">' + AW.ic('image', 15) + '</span><span class="ln">배경 없음 (우클릭 → 배경 교체)</span></div>';
    return '<div class="sbx">' + head('레이어', '<span class="muted">' + els.length + '개</span><span class="sp-sp"></span>') +
      '<div class="sp-tools"><button class="tb" data-a="dup" title="복제">' + AW.ic('copy', 16) + '</button><button class="tb" data-a="group" title="그룹 만들기 (Ctrl+G)">' + AW.ic('layers', 16) + '</button><button class="tb" data-a="ungroup" title="그룹 해제">' + AW.ic('close', 16) + '</button><button class="tb" data-a="lock" title="선택 잠금/해제 (그룹은 그룹 전체)">' + AW.ic('lock', 16) + '</button><button class="btn btn-ghost btn-sm" data-a="lockall" title="모든 요소를 한 번에 잠금/해제">전체 잠금</button><button class="tb" data-a="del" title="삭제">' + AW.ic('trash', 16) + '</button></div>' +
      '<div class="ly-list">' + (rows || '<div class="empty" style="padding:10px">요소가 없습니다.</div>') + bg + '</div><p class="muted" style="margin:8px 0 0">행을 끌어 순서를 바꾸고, 우클릭하면 메뉴가 나옵니다. 위쪽이 앞면입니다.</p></div>';
  }
  function bgMenu(x, y) {
    var A = function (label, ic, a, dis) { return { k: 'i', label: label, ic: ic, disabled: dis, fn: function () { E().act(a); } }; }, has = !!T().bg;
    api().menuAt(x, y, [A(T().page.bgHide ? '배경 보이기' : '배경 숨기기', 'eye', 'bg-toggle', !has), A('배경 삭제', 'trash', 'bg-del', !has), A('배경 교체…', 'upload', 'bg-replace'), A('배경 양식 등록하기…', 'save', 'bg-reg', !has), A('배경 양식 불러오기…', 'folder', 'bg-lib'), { k: 'sep' }, A('배경 왼쪽 90° 회전', 'undo', 'bg-rot-l', !has), A('배경 오른쪽 90° 회전', 'redo', 'bg-rot-r', !has)]);
  }

  /* ───────────── 속성 · 크기 ───────────── */
  function propsHtml() {
    var inp = function (g, l) { return '<label class="mini">' + l + '<input class="in sm num" data-g2="' + g + '" type="number" step="0.5" style="width:78px"></label>'; }, B = function (a, ic, tip) { return '<button class="tb" data-a="' + a + '" title="' + tip + '">' + AW.ic(ic, 16) + '</button>'; };
    return '<div class="sbx" id="sp-props">' + head('속성 · 크기') +
      '<h4>위치 · 크기 (mm)</h4><div class="grid2" style="gap:6px 8px">' + inp('x', 'X') + inp('y', 'Y') + inp('w', '가로') + inp('h', '세로') + inp('rot', '각도') + '</div>' +
      '<div class="sp-row"><button class="tb on" data-a="ratio" id="sp-ratio" title="이미지·QR 의 가로·세로를 입력할 때 비율을 유지합니다">' + AW.ic('lock', 16) + '</button><span>비율 잠금</span><span class="sp-sp"></span><button class="btn btn-ghost btn-sm" data-a="origsize">원본 크기로</button></div>' +
      '<div class="muted" id="sp-dpi" style="min-height:18px"></div>' +
      '<h4>정렬 (선택 1개는 용지 기준)</h4><div class="sp-tools">' + B('ag-l', 'gL', '왼쪽') + B('ag-ch', 'gCH', '가로 가운데') + B('ag-r', 'gR', '오른쪽') + B('ag-t', 'gT', '위') + B('ag-cv', 'gCV', '세로 가운데') + B('ag-b', 'gB', '아래') + B('dist-h', 'dH', '가로 간격 같게') + B('dist-v', 'dV', '세로 간격 같게') + '</div>' +
      '<h4>순서 · 표시</h4><div class="sp-tools">' + B('front', 'front', '맨 앞으로') + B('fwd', 'chevU', '앞으로 한 칸') + B('bwd', 'chevD', '뒤로 한 칸') + B('back', 'back', '맨 뒤로') + B('lock', 'lock', '잠금 전환') + B('hide', 'eye', '숨기기 전환') + '<button class="btn btn-ghost btn-sm" data-a="noprint" title="화면에만 보이고 인쇄에서 제외">인쇄 제외</button></div>' +
      '<h4>이미지 불투명도</h4><input type="range" id="sp-op" min="0.1" max="1" step="0.05" value="1" style="width:100%"></div>';
  }
  function refreshProps() {
    var l = api().sel(), one = l.length === 1 ? l[0] : null, r = AW.$('#sp-ratio', panel); if (!r) return;
    r.classList.toggle('on', api().ratio()); r.innerHTML = AW.ic(api().ratio() ? 'lock' : 'unlock', 16);
    var d = AW.$('#sp-dpi', panel), op = AW.$('#sp-op', panel);
    if (one && (one.t === 'img') && one.px && one.w > 0) { var dpi = Math.round(one.px.w / (one.w / 25.4)); d.innerHTML = '해상도 약 <b>' + dpi + ' dpi</b>' + (dpi < 150 ? ' <span class="bad">— 인쇄하면 흐릿할 수 있습니다(150dpi 이상 권장)</span>' : ''); op.disabled = false; if (document.activeElement !== op) op.value = one.opacity == null ? 1 : one.opacity; }
    else { d.textContent = one && one.t === 'text' ? '글상자는 크기를 바꾸면 글자 크기도 함께 바뀝니다 (Alt: 글자 고정)' : ''; op.disabled = !(one && one.t === 'img'); }
    // 입력칸 값은 에디터(updPos)가 채움
  }

  /* ───────────── 색상 ───────────── */
  function targets() {
    var l = api().sel(), t = [];
    if (l.some(function (e) { return e.t === 'text'; })) t.push(['color', '글자색', ['text']]);
    if (l.some(function (e) { return e.t === 'rect'; })) { t.push(['fill', '채우기', ['rect']]); t.push(['stroke', '테두리', ['rect']]); }
    if (l.some(function (e) { return e.t === 'line'; }) && !l.some(function (e) { return e.t === 'rect'; })) t.push(['stroke', '선 색', ['line']]);
    if (!t.length) t.push(['__page', '용지 색', []]);
    return t;
  }
  function curColor(key) { if (key === '__page') return T().page.bgc || '#ffffff'; var e = api().sel()[0]; return (e && e[key]) || ''; }
  function norm(v) {
    v = String(v || '').trim(); if (!v) return '';
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v); if (m) return '#' + m[1].toLowerCase();
    return (window.CSS && CSS.supports && CSS.supports('color', v)) ? v : null;
  }
  function colorHtml() {
    var ts = targets(); if (!ts.some(function (t) { return t[0] === ctarget; })) ctarget = ts[0][0];
    var v = curColor(ctarget), hex = /^#[0-9a-f]{6}$/i.test(v) ? v : '#111111', recent = AW.lsGet('award_recent_colors', []);
    var sw = function (c) { return '<button class="swc" data-c="' + c + '" style="background:' + c + '" title="' + c + '" aria-label="' + c + '"></button>'; };
    return '<div class="sbx" id="sp-color">' + head('색상') +
      '<div class="chips" style="margin-top:0">' + ts.map(function (t) { return '<button class="chip' + (t[0] === ctarget ? ' used' : '') + '" data-ct="' + t[0] + '" style="' + (t[0] === ctarget ? 'background:var(--primary-lt);border-color:var(--primary)' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="sp-row"><input type="color" class="clr" id="cp-pick" value="' + hex + '" aria-label="색 선택"><input class="in sm" id="cp-hex" value="' + AW.esc(v) + '" placeholder="#RRGGBB 또는 rgb(…)" maxlength="40" style="flex:1" aria-label="HTML 색상 코드"></div>' +
      '<div class="sp-row">' + (ctarget === 'fill' || ctarget === '__page' ? '<button class="btn btn-ghost btn-sm" data-cnone="1">' + (ctarget === 'fill' ? '채우기 없음' : '흰색으로') + '</button>' : '') + (window.EyeDropper ? '<button class="btn btn-ghost btn-sm" data-eye="1">스포이드</button>' : '') + '</div>' +
      '<h4>상장 기본색</h4><div class="swg">' + SW.map(sw).join('') + '</div>' +
      '<h4>학교 색 (모든 양식 공유)</h4>' + brandHtml() +
      '<h4>최근 사용</h4><div class="swg">' + (recent.length ? recent.map(sw).join('') : '<span class="muted">아직 없습니다.</span>') + '</div>' +
      '<p class="muted" style="margin:10px 0 0">HTML 색상 코드(예: <code>#B8860B</code>, <code>#B8860B80</code>, <code>rgb(31,58,104)</code>, <code>navy</code>)를 입력하고 Enter 를 누르십시오.</p></div>';
  }
  // 학교 고유 색: 이름과 함께 서버에 저장하여 모든 양식·PC 에서 공유
  function brandList() { return AW.pref.cache.brand_colors; }
  function brandHtml() {
    var b = brandList();
    if (b === undefined) { AW.pref.get('brand_colors').then(function (v) { if (!v) AW.pref.cache.brand_colors = []; if (cur === 'color') draw(true); }).catch(function () { AW.pref.cache.brand_colors = null; if (cur === 'color') draw(true); }); return '<span class="muted">불러오는 중…</span>'; }
    if (b === null) return '<span class="muted">서버 설정을 불러오지 못했습니다. db/award_schema_5.sql 설치 여부를 확인하십시오.</span>';
    return '<div class="swg">' + (b.length ? b.map(function (c, i) { return '<span class="bc"><button class="swc" data-c="' + AW.esc(c.hex) + '" style="background:' + AW.esc(c.hex) + '" title="' + AW.esc(c.name + ' ' + c.hex) + '" aria-label="' + AW.esc(c.name) + '"></button><button class="bcx" data-bd="' + i + '" title="삭제" aria-label="삭제">×</button><span class="bcn">' + AW.esc(c.name) + '</span></span>'; }).join('') : '<span class="muted">등록된 색이 없습니다.</span>') + '</div>' +
      '<div class="sp-row"><input class="in sm" id="bc-n" maxlength="20" placeholder="색 이름 (예: 교색 남색)" style="flex:1"><button class="btn btn-secondary btn-sm" data-badd="1">현재 색 등록</button></div>';
  }
  function brandSave(list) { AW.pref.set('brand_colors', list).then(function () { draw(true); }).catch(function (e) { AW.toast(e.message, 'error'); }); }
  function applyColor(v, live) {
    var ts = targets(), t = ts.filter(function (x) { return x[0] === ctarget; })[0] || ts[0];
    api().lbl('색상 변경');
    if (t[0] === '__page') { T().page.bgc = v || ''; E().render(); api().changed('page', !!live, '용지 색'); }
    else api().setAny(t[0], v, !!live, t[2]);
    if (!live && v) { var r = AW.lsGet('award_recent_colors', []).filter(function (c) { return c !== v; }); r.unshift(v); AW.lsSet('award_recent_colors', r.slice(0, 12)); }
  }

  /* ───────────── 작업 기록 ───────────── */
  function histHtml() {
    var h = E().hist(), rows = '';
    for (var i = h.labels.length - 1; i >= 0; i--) rows += '<button class="hrow' + (i === h.idx ? ' on' : '') + '" data-j="' + i + '"><span class="muted">' + (i + 1) + '</span> ' + AW.esc(h.labels[i]) + (i === h.idx ? '<span class="sp-sp"></span>' + AW.ic('check', 14) : '') + '</button>';
    return '<div class="sbx">' + head('작업 기록') + '<div class="sp-tools"><button class="btn btn-secondary btn-sm" data-a="undo"' + (h.idx <= 0 ? ' disabled' : '') + '>' + AW.ic('undo', 15) + ' 되돌리기</button><button class="btn btn-secondary btn-sm" data-a="redo"' + (h.idx >= h.labels.length - 1 ? ' disabled' : '') + '>' + AW.ic('redo', 15) + ' 다시 실행</button></div>' +
      '<div class="hlist">' + rows + '</div><div style="margin-top:8px"><button class="btn btn-ghost btn-sm" data-revert="1">마지막 저장 상태로 되돌리기…</button></div><p class="muted" style="margin:8px 0 0">배경·용지·요소 변경이 모두 기록됩니다. 단계를 누르면 그 시점으로 돌아가며, 다시 되돌릴 수 있습니다. (Ctrl+Z / Ctrl+Y)</p></div>';
  }

  /* ───────────── 이벤트 ───────────── */
  function onClick(e) {
    var s = e.target.closest('[data-side]'); if (s && panel.contains(s)) return X.open(s.dataset.side);
    if (e.target.closest('[data-a]')) return;   // [data-a] 는 에디터의 공통 클릭 처리기가 실행
    if (cur === 'layers') {
      var row = e.target.closest('.ly'); if (!row) return; var id = row.dataset.id, b = e.target.closest('[data-ly]');
      if (b) { var k = b.dataset.ly; if (k === 'bg') return E().act('bg-toggle'); var el = AW.get(id); if (!el) return; if (k === 'hide') el.hide = !el.hide; else el.lock = !el.lock; E().refreshElems(); return api().changed('elems', false, k === 'hide' ? '표시 전환' : '잠금 전환'); }
      if (!id) return; if (e.shiftKey || e.ctrlKey || e.metaKey) { var sl = S.sel.slice(), i = sl.indexOf(id); if (i >= 0) sl.splice(i, 1); else sl.push(id); E().setSel(sl); } else E().setSel([id]);
    }
    if (cur === 'color') {
      var bd = e.target.closest('[data-bd]'); if (bd) { var bl = (brandList() || []).slice(); bl.splice(+bd.dataset.bd, 1); return brandSave(bl); }
      if (e.target.closest('[data-badd]')) { var nm = AW.$('#bc-n', panel).value.trim(), hx = norm(AW.$('#cp-hex', panel).value); if (!nm) return AW.toast('색 이름을 입력해 주십시오.', 'error'); if (!hx) return AW.toast('등록할 색상 코드가 올바르지 않습니다.', 'error'); var bl2 = (brandList() || []).concat([{ name: nm, hex: hx }]); return brandSave(bl2); }
      var ct = e.target.closest('[data-ct]'); if (ct) { ctarget = ct.dataset.ct; return draw(true); }
      var sw = e.target.closest('[data-c]'); if (sw) { applyColor(sw.dataset.c, false); return draw(true); }
      if (e.target.closest('[data-cnone]')) { applyColor(ctarget === 'fill' ? '' : '#ffffff', false); return draw(true); }
      if (e.target.closest('[data-eye]')) { new window.EyeDropper().open().then(function (r) { applyColor(r.sRGBHex, false); draw(true); }).catch(function () {}); return; }
    }
    if (cur === 'hist') {
      var j = e.target.closest('[data-j]'); if (j) return E().jump(+j.dataset.j);
      if (e.target.closest('[data-revert]')) return AW.App.revertSaved();
    }
  }
  function onCtx(e) {
    if (cur !== 'layers') return; var row = e.target.closest('.ly'); if (!row) return; e.preventDefault();
    if (row.classList.contains('bgrow')) return bgMenu(e.clientX, e.clientY);
    if (S.sel.indexOf(row.dataset.id) < 0) E().setSel([row.dataset.id]); api().ctxFor(e.clientX, e.clientY);
  }
  function onInput(e) {
    var t = e.target;
    if (t.id === 'sp-op') { api().setAny('opacity', parseFloat(t.value), true, ['img']); return; }
    if (t.id === 'cp-pick') { var h = AW.$('#cp-hex', panel); if (h) h.value = t.value; applyColor(t.value, true); }
  }
  function onChange(e) {
    var t = e.target;
    if (t.id === 'sp-op') { api().lbl('불투명도'); api().changed('elems', false, '불투명도'); return; }
    if (t.id === 'cp-pick') { applyColor(t.value, false); return; }
    if (t.id === 'cp-hex') { var v = norm(t.value); if (v === null) { AW.toast('올바른 색상 코드가 아닙니다. 예: #B8860B', 'error'); return; } applyColor(v, false); draw(true); }
  }
  function onDbl(e) {
    var n = e.target.closest('.ln'), row = n && n.closest('.ly'); if (!row || !row.dataset.id) return; var el = AW.get(row.dataset.id); if (!el) return;
    n.innerHTML = '<input class="in sm" style="width:100%" value="' + AW.esc(lyName(el)) + '">'; var inp = n.firstChild; inp.focus(); inp.select();
    var done = function (ok) { if (ok) { el.name = inp.value.trim().slice(0, 30); api().changed('elems', false, '이름 변경'); } draw(true); };
    inp.onkeydown = function (k) { k.stopPropagation(); if (k.key === 'Enter') done(true); if (k.key === 'Escape') done(false); }; inp.onblur = function () { done(true); };
  }
  function onDragStart(e) { var row = e.target.closest('.ly[data-id]'); if (!row) return; dragId = row.dataset.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (x) {} }
  function onDragOver(e) { var row = e.target.closest('.ly[data-id]'); if (!row || !dragId) return; e.preventDefault(); AW.$$('.ly', panel).forEach(function (r) { r.classList.remove('dt', 'db'); }); var r = row.getBoundingClientRect(); row.classList.add(e.clientY < r.top + r.height / 2 ? 'dt' : 'db'); }
  function onDrop(e) {
    var row = e.target.closest('.ly[data-id]'); if (!row || !dragId || row.dataset.id === dragId) { dragId = null; return X.update(); } e.preventDefault();
    var r = row.getBoundingClientRect(), above = e.clientY < r.top + r.height / 2, a = T().elems, from = AW.get(dragId);
    a.splice(a.indexOf(from), 1); var ti = a.indexOf(AW.get(row.dataset.id)); a.splice(above ? ti + 1 : ti, 0, from);   // 화면 위쪽 = 배열 뒤쪽(앞면)
    dragId = null; E().refreshElems(); api().changed('elems', false, '순서 변경');
  }
})();
