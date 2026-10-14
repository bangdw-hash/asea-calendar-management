'use strict';
/**
 * award-data.js — 데이터 입력창 (AW.Data)
 *  · 입력 설계 안내(항목별 양식 위치·설명·예시·최대글자) — 양식의 {{항목}}에서 자동 생성, AI 보강
 *  · 엑셀 양식 내려받기(입력 시트 + 작성안내 시트) / 엑셀 올리기(열 자동 매칭·수동 매핑)
 *  · 표 입력(엑셀에서 복사한 범위 붙여넣기 지원), 누락·글자수 초과 검증
 */
(function () {
  var AW = window.AW, S = AW.S, D = {};
  AW.Data = D;
  var PAGE = 30, MAXROWS = 3000;
  var st = { root: null, page: 0, sig: '' };

  function T() { return S.tpl; }
  function names() { return T().fields.map(function (f) { return f.name; }); }
  function colLetter(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/[\s*:：_\-·.]/g, ''); }
  function dataChanged(i) { S.dirty = true; AW.emit('datachange', i); }

  /* ───────────── 마운트 ───────────── */
  D.mount = function (root) {
    st.root = root;
    root.innerHTML =
      '<div class="dt-top">' +
        '<div class="dt-stat" id="dt-stat"></div>' +
        '<div class="dt-btns">' +
          '<button class="btn btn-secondary btn-sm" data-a="tplx" title="현재 양식의 입력 항목으로 엑셀 업로드용 파일을 만듭니다">' + AW.ic('download', 16) + ' 엑셀 양식 받기</button>' +
          '<button class="btn btn-primary btn-sm" data-a="upx">' + AW.ic('xls', 16) + ' 엑셀 올리기</button>' +
          '<button class="btn btn-ghost btn-sm" data-a="ai" title="AI가 양식 배경과 상자 배치를 읽고 항목별 입력 안내를 작성합니다">' + AW.ic('sparkle', 16) + ' AI 안내 작성</button>' +
          '<input type="file" class="hide" id="dt-file" accept=".xlsx,.xls,.csv">' +
        '</div>' +
      '</div>' +
      '<div class="dt-body">' +
        '<details class="guide" id="dt-guide" open><summary>' + AW.ic('info', 16) + ' 입력 설계 안내 <span class="muted">— 어느 자리에 무엇을 넣는지 · 엑셀 양식의 「작성안내」 시트와 동일</span></summary><div class="guide-in" id="dt-guide-in"></div></details>' +
        '<div class="dt-grid-wrap" id="dt-grid"></div>' +
      '</div>' +
      '<div class="dt-foot" id="dt-foot"></div>';
    root.addEventListener('click', onClick);
    AW.$('#dt-file', root).addEventListener('change', function (e) { var f = e.target.files[0]; e.target.value = ''; if (f) D.importFile(f); });
    root.addEventListener('dragover', function (e) { e.preventDefault(); });
    root.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files[0]; if (f && /\.(xlsx|xls|csv)$/i.test(f.name)) { e.preventDefault(); D.importFile(f); } });
    if (!st.wired) { st.wired = true; AW.on('tplchange', function (k) { if (k !== 'fields' && st.root && st.root.isConnected) D.refresh(false); }); AW.on('rowchange', function () { if (st.root && st.root.isConnected) markRow(); }); }
  };

  function onClick(e) {
    var b = e.target.closest('[data-a]'); if (!b) return;
    var a = b.dataset.a;
    if (a === 'tplx') return D.downloadTemplate();
    if (a === 'upx') return AW.$('#dt-file', st.root).click();
    if (a === 'ai') return D.aiGuide(b);
    if (a === 'addrow') { addRows(1); return; }
    if (a === 'clear') return AW.confirm('전체 삭제', '입력된 ' + T().rows.length + '행을 모두 삭제합니다. 계속하시겠습니까?', '삭제', true).then(function (ok) { if (ok) { T().rows = []; S.row = 0; st.page = 0; dataChanged(); D.refresh(true); AW.emit('rowchange'); } });
    if (a === 'delrow') { var i = +b.dataset.i; T().rows.splice(i, 1); if (S.row >= T().rows.length) S.row = Math.max(0, T().rows.length - 1); dataChanged(); D.refresh(true); AW.emit('rowchange'); return; }
    if (a === 'pg') { st.page = Math.max(0, Math.min(pages() - 1, st.page + (+b.dataset.d))); renderGrid(); renderFoot(); return; }
    if (a === 'goto') { S.row = +b.dataset.i; markRow(); AW.emit('rowchange'); }
  }

  /* ───────────── 렌더 ───────────── */
  // full=true 면 표까지 다시 그림. 항목 구성이 같으면 안내/표 모양은 유지하고 통계만 갱신
  D.refresh = function (full) {
    if (!st.root || !T()) return;
    AW.syncFields();
    var sig = JSON.stringify(T().fields) + '|' + AW.fieldNames().join(',');
    if (full || sig !== st.sig) { st.sig = sig; renderGuide(); renderGrid(); } else renderStat();
    renderFoot(); renderStat();
  };
  function pages() { return Math.max(1, Math.ceil(T().rows.length / PAGE)); }

  function renderGuide() {
    var box = AW.$('#dt-guide-in', st.root), f = T().fields;
    if (!f.length) { box.innerHTML = '<div class="empty">아직 입력 항목이 없습니다.<br>양식 창에서 <b>일괄 입력 항목</b> 버튼으로 항목을 추가하면, 항목별 안내와 엑셀 양식이 자동으로 만들어집니다.<br><span class="muted">예: 글상자에 <code>{{성명}}</code> 이라고 쓰면 엑셀의 「성명」 열이 그 자리에 들어갑니다.</span></div>'; return; }
    box.innerHTML = '<div class="tbl-wrap"><table class="gt"><thead><tr><th>열</th><th>항목명</th><th>양식에서의 위치</th><th>입력 안내</th><th>예시</th><th>최대글자</th><th>필수</th></tr></thead><tbody>' +
      f.map(function (x, i) {
        return '<tr data-i="' + i + '"><td class="c">' + colLetter(i) + '</td><td><input class="in sm" data-k="name" value="' + AW.esc(x.name) + '" aria-label="항목명"></td>' +
          '<td class="where">' + AW.esc(AW.whereIs(x.name)) + '</td>' +
          '<td><textarea class="in sm" data-k="hint" rows="2" aria-label="입력 안내">' + AW.esc(x.hint) + '</textarea></td>' +
          '<td><textarea class="in sm" data-k="example" rows="2" aria-label="예시">' + AW.esc(x.example) + '</textarea></td>' +
          '<td><input class="in sm num" data-k="max" type="number" min="0" max="500" value="' + (x.max || '') + '" placeholder="무제한" aria-label="최대 글자 수"></td>' +
          '<td class="c"><input type="checkbox" data-k="req"' + (x.req !== false ? ' checked' : '') + ' aria-label="필수"></td></tr>';
      }).join('') + '</tbody></table></div><p class="muted" style="margin:6px 0 0">내장 항목 <code>{{@번호}}</code>(일련번호)·<code>{{@오늘}}</code>(출력일)은 엑셀 열이 필요 없습니다. 항목명을 고치면 양식의 <code>{{…}}</code>와 입력 데이터가 함께 바뀝니다.</p>';
    var tb = AW.$('tbody', box);
    tb.addEventListener('change', function (e) {
      var tr = e.target.closest('tr'), k = e.target.dataset.k; if (!tr || !k) return;
      var fld = T().fields[+tr.dataset.i];
      if (k === 'name') return rename(fld, e.target.value, e.target);
      fld[k] = k === 'max' ? (parseInt(e.target.value, 10) || 0) : k === 'req' ? e.target.checked : e.target.value;
      S.dirty = true; AW.emit('tplchange', 'fields'); renderStat(); renderGrid();
    });
  }
  function rename(fld, nv, inp) {
    nv = String(nv).replace(/[{}]/g, '').trim();
    if (!nv) { inp.value = fld.name; return; }
    if (nv === fld.name) return;
    if (names().indexOf(nv) >= 0) { AW.toast('이미 있는 항목명입니다.', 'error'); inp.value = fld.name; return; }
    var old = fld.name, re = new RegExp('\\{\\{\\s*' + old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\}\\}', 'g');
    T().elems.forEach(function (e) { if (e.t === 'text') e.text = e.text.replace(re, '{{' + nv + '}}'); });
    T().rows.forEach(function (r) { if (old in r) { r[nv] = r[old]; delete r[old]; } });
    fld.name = nv; S.dirty = true;
    AW.Editor.refreshElems(); AW.emit('tplchange', 'elems'); D.refresh(true);
  }

  function cellState(f, v) {
    v = v == null ? '' : String(v);
    if (f.req !== false && !v.trim()) return 'miss';
    if (f.max && v.length > f.max) return 'long';
    return '';
  }
  function renderGrid() {
    var g = AW.$('#dt-grid', st.root), f = T().fields, rows = T().rows;
    if (!f.length) { g.innerHTML = ''; return; }
    var from = st.page * PAGE, part = rows.slice(from, from + PAGE);
    var h = '<table class="dg"><thead><tr><th class="n">#</th>' + f.map(function (x, i) { return '<th title="' + AW.esc(x.hint) + '">' + colLetter(i) + ' · ' + AW.esc(x.name) + '</th>'; }).join('') + '<th class="n"></th></tr></thead><tbody>';
    if (!part.length) h += '<tr><td colspan="' + (f.length + 2) + '" class="empty">입력된 행이 없습니다. 「엑셀 올리기」 또는 아래 「행 추가」를 사용하거나, 엑셀에서 복사한 범위를 첫 칸에 붙여넣으십시오.</td></tr>';
    part.forEach(function (r, j) {
      var i = from + j;
      h += '<tr data-i="' + i + '"' + (i === S.row ? ' class="cur"' : '') + '><td class="n"><button class="lnk" data-a="goto" data-i="' + i + '" title="미리보기로 이동">' + (i + 1) + '</button></td>' +
        f.map(function (x, c) { var v = r[x.name] == null ? '' : r[x.name]; return '<td class="' + cellState(x, v) + '"><textarea class="cell" rows="1" data-c="' + c + '" aria-label="' + (i + 1) + '행 ' + AW.esc(x.name) + '">' + AW.esc(v) + '</textarea></td>'; }).join('') +
        '<td class="n"><button class="icon-btn danger" data-a="delrow" data-i="' + i + '" title="이 행 삭제" aria-label="행 삭제">' + AW.ic('close', 14) + '</button></td></tr>';
    });
    g.innerHTML = h + '</tbody></table>';
    var tb = AW.$('tbody', g);
    tb.addEventListener('input', function (e) {
      var ta = e.target; if (!ta.classList.contains('cell')) return;
      var tr = ta.closest('tr'), i = +tr.dataset.i, fld = T().fields[+ta.dataset.c];
      T().rows[i][fld.name] = ta.value; ta.parentNode.className = cellState(fld, ta.value); dataChanged(i); renderStat();
    });
    tb.addEventListener('focusin', function (e) {
      var tr = e.target.closest('tr'); if (!tr || !tr.dataset.i) return; var i = +tr.dataset.i;
      if (i !== S.row) { S.row = i; markRow(); AW.emit('rowchange'); }
    });
    tb.addEventListener('paste', onPaste);
  }
  function markRow() {
    AW.$$('#dt-grid tbody tr', st.root).forEach(function (tr) { tr.classList.toggle('cur', +tr.dataset.i === S.row); });
    var p = Math.floor(S.row / PAGE); if (p !== st.page && T().rows.length) { st.page = p; renderGrid(); renderFoot(); }
  }
  function renderFoot() {
    var n = T().rows.length, ft = AW.$('#dt-foot', st.root);
    ft.innerHTML = '<button class="btn btn-secondary btn-sm" data-a="addrow">' + AW.ic('plus', 16) + ' 행 추가</button>' +
      (n ? '<button class="btn btn-ghost btn-sm" data-a="clear">전체 삭제</button>' : '') + '<span class="sp"></span>' +
      (n > PAGE ? '<button class="icon-btn" data-a="pg" data-d="-1" aria-label="이전 쪽">' + AW.ic('chevL', 16) + '</button><span class="muted">' + (st.page + 1) + ' / ' + pages() + ' 쪽 (' + PAGE + '행씩)</span><button class="icon-btn" data-a="pg" data-d="1" aria-label="다음 쪽">' + AW.ic('chevR', 16) + '</button>' : '');
  }
  function renderStat() {
    var f = T().fields, rows = T().rows, miss = 0, long = 0;
    rows.forEach(function (r) { f.forEach(function (x) { var s = cellState(x, r[x.name]); if (s === 'miss') miss++; else if (s === 'long') long++; }); });
    AW.$('#dt-stat', st.root).innerHTML = '<b>' + f.length + '</b>개 항목 · <b>' + rows.length + '</b>행' +
      (miss ? ' <span class="badge warn" title="필수 항목이 비어 있는 칸 수">누락 ' + miss + '</span>' : '') + (long ? ' <span class="badge err" title="최대 글자 수를 넘은 칸 수">길이초과 ' + long + '</span>' : '') +
      (rows.length && !miss && !long ? ' <span class="badge ok">검증 통과</span>' : '');
  }
  D.validate = function () {
    var f = T().fields, miss = 0, long = 0;
    T().rows.forEach(function (r) { f.forEach(function (x) { var s = cellState(x, r[x.name]); if (s === 'miss') miss++; else if (s === 'long') long++; }); });
    return { miss: miss, long: long };
  };
  function addRows(n) {
    if (!T().fields.length) return AW.toast('먼저 양식에 입력 항목({{항목명}})을 추가해 주십시오.', 'error');
    if (T().rows.length + n > MAXROWS) return AW.toast('한 양식에는 ' + MAXROWS + '행까지 입력할 수 있습니다.', 'error');
    for (var i = 0; i < n; i++) T().rows.push({});
    S.row = T().rows.length - 1; st.page = pages() - 1; dataChanged(); renderGrid(); renderFoot(); renderStat(); AW.emit('rowchange');
    var ta = AW.$('#dt-grid tbody tr:last-child textarea', st.root); if (ta) ta.focus();
  }

  /* ───────────── 붙여넣기 (엑셀 범위) ───────────── */
  function parseTSV(t) {
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < t.length; i++) {
      var c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"' && cur === '') q = true;
      else if (c === '\t') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    row.push(cur); if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
  }
  function onPaste(e) {
    var ta = e.target; if (!ta.classList.contains('cell')) return;
    var txt = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(txt.replace(/\n$/, ''))) return;           // 단일 칸 붙여넣기는 기본 동작
    e.preventDefault();
    var data = parseTSV(txt), i0 = +ta.closest('tr').dataset.i, c0 = +ta.dataset.c, f = T().fields;
    if (i0 + data.length > MAXROWS) return AW.toast('최대 ' + MAXROWS + '행까지 가능합니다.', 'error');
    while (T().rows.length < i0 + data.length) T().rows.push({});
    data.forEach(function (r, j) { r.forEach(function (v, c) { var fld = f[c0 + c]; if (fld) T().rows[i0 + j][fld.name] = v; }); });
    dataChanged(); renderGrid(); renderFoot(); renderStat(); AW.emit('rowchange'); AW.toast(data.length + '행을 붙여넣었습니다.', 'ok');
  }

  /* ───────────── 엑셀 양식 내려받기 ───────────── */
  D.downloadTemplate = function () {
    var f = T().fields;
    if (!f.length) return AW.toast('양식에 입력 항목({{항목명}})이 없습니다. 먼저 일괄 입력 항목을 추가해 주십시오.', 'error');
    if (!window.XLSX) return AW.toast('엑셀 모듈을 불러오지 못했습니다.', 'error');
    var wb = XLSX.utils.book_new();
    var head = f.map(function (x) { return x.name; }), ex = f.map(function (x) { return x.example || ''; });
    var ws = XLSX.utils.aoa_to_sheet([head, ex]);
    ws['!cols'] = f.map(function (x) { return { wch: Math.max(12, Math.min(40, (x.name.length * 2) + 4, (x.example || '').length * 1.6 + 2)) }; });
    XLSX.utils.book_append_sheet(wb, ws, '입력');
    var g = [['【작성 안내】 「입력」 시트의 1행(항목명)은 수정하지 마십시오. 2행은 예시이며, 예시와 똑같은 행은 업로드 시 자동 제외됩니다. 실제 데이터는 2행부터 덮어쓰거나 3행부터 입력하십시오.'],
      ['양식: ' + T().name + ' / 용지 ' + T().page.w + '×' + T().page.h + 'mm / 항목 ' + f.length + '개'], [],
      ['열', '항목명', '양식에서의 위치', '입력 방법', '예시', '최대 글자 수', '필수']];
    f.forEach(function (x, i) { g.push([colLetter(i), x.name, AW.whereIs(x.name), x.hint, x.example, x.max || '제한 없음', x.req !== false ? '필수' : '선택']); });
    g.push([], ['내장 항목', '{{@번호}}', '', '일련번호(1, 2, 3…)가 자동으로 들어갑니다. 엑셀 열이 필요 없습니다.'], ['', '{{@오늘}}', '', '출력한 날짜가 자동으로 들어갑니다.']);
    var ws2 = XLSX.utils.aoa_to_sheet(g);
    ws2['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 34 }, { wch: 50 }, { wch: 28 }, { wch: 12 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws2, '작성안내');
    XLSX.writeFile(wb, '상장데이터양식_' + T().name.replace(/[\\/:*?"<>|]/g, '_') + '.xlsx');
    AW.log('xlsx_template', T().id, { fields: head });
    AW.toast('엑셀 양식을 내려받았습니다.', 'ok');
  };

  /* ───────────── 엑셀 올리기 ───────────── */
  D.importFile = function (file) {
    if (!window.XLSX) return AW.toast('엑셀 모듈을 불러오지 못했습니다.', 'error');
    if (!T().fields.length) return AW.toast('양식에 입력 항목({{항목명}})이 없어 올릴 수 없습니다. 먼저 항목을 추가해 주십시오.', 'error');
    if (file.size > 15 * 1024 * 1024) return AW.toast('파일이 너무 큽니다(15MB 이하).', 'error');
    file.arrayBuffer().then(function (buf) {
      var wb = XLSX.read(buf, { type: 'array' }), nm = wb.SheetNames.filter(function (n) { return n === '입력'; })[0] || wb.SheetNames.filter(function (n) { return n !== '작성안내'; })[0];
      if (!nm) throw new Error('읽을 시트가 없습니다.');
      var aoa = XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, defval: '', raw: false, blankrows: false });
      aoa = aoa.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
      if (aoa.length < 1) throw new Error('데이터가 없는 파일입니다.');
      importDialog(aoa, file.name, nm);
    }).catch(function (e) { AW.toast('엑셀을 읽지 못했습니다: ' + (e.message || e), 'error'); });
  };
  function importDialog(aoa, fname, sheet) {
    var f = T().fields, head = aoa[0].map(function (h) { return String(h).trim(); }), body = aoa.slice(1);
    var map = {};                                            // 항목명 → 열 index
    f.forEach(function (x) {
      var i = head.indexOf(x.name); if (i < 0) i = head.map(norm).indexOf(norm(x.name));
      if (i >= 0) map[x.name] = i;
    });
    var matched = Object.keys(map).length, all = matched === f.length;
    var hasRows = T().rows.length > 0;
    var m = { el: null };
    AW.modal({
      title: '엑셀 올리기', wide: true,
      body: '<p style="margin-top:0"><b>' + AW.esc(fname) + '</b> · 시트 「' + AW.esc(sheet) + '」 · 데이터 <b>' + body.length + '</b>행 · 항목 매칭 <b>' + matched + '/' + f.length + '</b>' +
        (all ? ' <span class="badge ok">모두 일치</span>' : ' <span class="badge warn">확인 필요</span>') + '</p>' +
        '<details' + (all ? '' : ' open') + '><summary class="lnk">열 매칭 확인·수정</summary><div class="grid2" style="margin-top:8px">' +
        f.map(function (x) {
          return '<div><label class="f">' + AW.esc(x.name) + (x.req !== false ? ' *' : '') + '</label><select class="in" data-n="' + AW.esc(x.name) + '"><option value="-1">(사용 안 함)</option>' +
            head.map(function (h, i) { return '<option value="' + i + '"' + (map[x.name] === i ? ' selected' : '') + '>' + colLetter(i) + ' · ' + AW.esc(h || '(제목 없음)') + '</option>'; }).join('') + '</select></div>';
        }).join('') + '</div></details>' +
        '<div class="radios" style="margin-top:12px"><label><input type="radio" name="imp-mode" value="replace" checked> 기존 데이터를 지우고 새로 올리기</label>' +
        (hasRows ? '<label><input type="radio" name="imp-mode" value="append"> 기존 ' + T().rows.length + '행 뒤에 이어 붙이기</label>' : '') + '</div>' +
        '<div id="imp-prev" style="margin-top:12px"></div>',
      actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '올리기', cls: 'btn-primary', onClick: function (c) { run(c); } }],
      onOpen: function (el, close) { m.el = el; m.close = close; AW.$$('select', el).forEach(function (s) { s.onchange = prev; }); prev(); }
    });
    function curMap() { var mm = {}; AW.$$('select[data-n]', m.el).forEach(function (s) { if (+s.value >= 0) mm[s.dataset.n] = +s.value; }); return mm; }
    function build() {
      var mm = curMap(), exRow = f.map(function (x) { return String(x.example || '').trim(); }), skipped = 0, out = [];
      body.forEach(function (r) {
        var o = {}, any = false;
        f.forEach(function (x) { var v = mm[x.name] != null ? String(r[mm[x.name]] == null ? '' : r[mm[x.name]]).trim() : ''; o[x.name] = v; if (v) any = true; });
        if (!any) return;
        if (f.every(function (x, i) { return exRow[i] && o[x.name] === exRow[i]; })) { skipped++; return; }   // 예시 행 제외
        out.push(o);
      });
      return { rows: out, skipped: skipped, mm: mm };
    }
    function prev() {
      var b = build(), box = AW.$('#imp-prev', m.el), f2 = f.slice(0, 6);
      box.innerHTML = '<div class="muted" style="margin-bottom:4px">미리보기(앞 3행) — 올릴 행 <b>' + b.rows.length + '</b>' + (b.skipped ? ' · 예시 행 ' + b.skipped + '건 제외' : '') + '</div>' +
        '<div class="tbl-wrap"><table class="gt"><thead><tr>' + f2.map(function (x) { return '<th>' + AW.esc(x.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        b.rows.slice(0, 3).map(function (r) { return '<tr>' + f2.map(function (x) { return '<td>' + AW.esc(r[x.name]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
    }
    function run(close) {
      var b = build(), mode = (AW.$('input[name="imp-mode"]:checked', m.el) || {}).value || 'replace';
      if (!Object.keys(b.mm).length) return AW.toast('매칭된 열이 없습니다. 열 매칭을 확인해 주십시오.', 'error');
      if (!b.rows.length) return AW.toast('올릴 데이터가 없습니다.', 'error');
      var base = mode === 'append' ? T().rows.length : 0;
      if (base + b.rows.length > MAXROWS) return AW.toast('최대 ' + MAXROWS + '행까지 가능합니다. (현재 ' + base + ' + 신규 ' + b.rows.length + ')', 'error');
      T().rows = (mode === 'append' ? T().rows : []).concat(b.rows);
      S.row = base; st.page = Math.floor(base / PAGE); dataChanged(); close(); var gd = AW.$('#dt-guide', st.root); if (gd) gd.open = false; D.refresh(true); AW.emit('rowchange');
      AW.log('xlsx_import', T().id, { file: fname, rows: b.rows.length, mode: mode });
      var v = D.validate();
      AW.toast(b.rows.length + '행을 올렸습니다.' + (v.miss || v.long ? ' (누락 ' + v.miss + ' · 길이초과 ' + v.long + ' — 표에서 확인)' : ''), v.miss || v.long ? '' : 'ok');
    }
  }

  /* ───────────── AI 안내 ───────────── */
  function toJpegSmall(dataUrl, max) {
    return new Promise(function (res) {
      var im = new Image(); im.onload = function () {
        var r = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * r); c.height = Math.round(im.naturalHeight * r);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.8).split(',')[1]);
      }; im.onerror = function () { res(null); }; im.src = dataUrl;
    });
  }
  function describe() {
    var t = T(), pg = t.page;
    return '용지: ' + pg.w + '×' + pg.h + 'mm\n입력 항목 순서: ' + names().join(', ') + '\n\n글상자 배치(mm 좌표, 좌상단 기준):\n' +
      t.elems.filter(function (e) { return e.t === 'text'; }).map(function (e) {
        return '- 위치(' + Math.round(e.x) + ',' + Math.round(e.y) + ') 크기 ' + Math.round(e.w) + '×' + Math.round(e.h) + 'mm, 글자 ' + e.size + 'pt, ' + e.align + ' 정렬: "' + String(e.text).replace(/\n/g, '⏎') + '"';
      }).join('\n');
  }
  var SYS = '당신은 학교 상장·수료증 발급 업무의 입력 설계 전문가입니다. 상장 양식(배경 이미지가 있으면 함께 제공)과 글상자 배치를 읽고, 각 입력 항목({{항목명}})에 실무자가 어떤 값을 넣어야 하는지 안내를 작성합니다.\n' +
    '규칙: 1) 출력은 JSON 객체 하나만, 마크다운·설명 금지. 형식: {"fields":[{"name":"항목명","hint":"입력 안내(한국어 1~2문장, 양식의 어느 자리인지와 주변 문구를 근거로)","example":"실제 있을 법한 예시값","max":숫자,"req":true}],"notes":"전체 유의사항 1~2문장"}\n' +
    '2) name 은 제공된 항목명을 그대로 사용하고 새 항목을 만들지 않습니다. 3) max 는 해당 상자 크기와 글자 크기로 한 줄 또는 지정 줄에 들어갈 글자 수를 추정한 값이며, 판단이 어려우면 0 입니다. 4) 배경 이미지의 인쇄 문구(예: "위 사람은")와 이어지는 문장이 자연스럽도록 안내하고, 근거 없는 추정은 hint 에 쓰지 않습니다. 5) 개인정보 예시는 실존 인물이 아닌 가상의 값을 사용합니다.';
  D.aiGuide = function (btn) {
    if (!T().fields.length) return AW.toast('입력 항목이 없습니다. 먼저 {{항목명}}을 양식에 추가해 주십시오.', 'error');
    if (!window.claudeFetch || !window.getClaudeConfig) return AW.toast('AI 설정 모듈(config.js)을 불러오지 못했습니다.', 'error');
    btn.disabled = true; var old = btn.innerHTML; btn.innerHTML = AW.ic('sparkle', 16) + ' 분석 중…';
    var done = function () { btn.disabled = false; btn.innerHTML = old; };
    (T().bg ? toJpegSmall(T().bg, 1100) : Promise.resolve(null)).then(function (b64) {
      var content = [];
      if (b64) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
      content.push({ type: 'text', text: describe() });
      return callAI(SYS, content);
    }).then(function (txt) {
      var j = parseJson(txt), by = {}; (j.fields || []).forEach(function (x) { by[x.name] = x; });
      var n = 0;
      T().fields.forEach(function (f) { var x = by[f.name]; if (!x) return; if (x.hint) f.hint = String(x.hint); if (x.example != null) f.example = String(x.example); if (x.max != null) f.max = Math.max(0, Math.min(500, parseInt(x.max, 10) || 0)); if (x.req != null) f.req = !!x.req; n++; });
      S.dirty = true; AW.emit('tplchange', 'fields'); D.refresh(true);
      AW.toast('AI가 ' + n + '개 항목의 입력 안내를 작성했습니다. 내용을 확인·수정해 주십시오.' + (j.notes ? ' ' + j.notes : ''), 'ok');
      AW.log('ai_guide', T().id, { fields: n });
    }).catch(function (e) { AW.toast('AI 안내 작성 실패: ' + (e.message || e) + ' (기본 안내는 유지됩니다)', 'error'); }).then(done, done);
  };
  function parseJson(text) {
    var s = String(text || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim(), a = s.indexOf('{'); if (a > 0) s = s.slice(a);
    try { return JSON.parse(s); } catch (e) { var b = s.lastIndexOf('}'); if (b > 0) return JSON.parse(s.slice(0, b + 1)); throw new Error('AI 응답을 해석하지 못했습니다.'); }
  }
  function callAI(system, content) {
    return Promise.resolve(window.loadAIProvidersFromCloud ? window.loadAIProvidersFromCloud().catch(function () {}) : null).then(function () {
      var cc = window.getClaudeConfig();
      if (!cc.apiKey) throw new Error('AI 연결 설정이 없습니다. index.html 의 「AI 제공자 설정」을 먼저 저장해 주십시오.');
      var headers = { 'Content-Type': 'application/json', 'x-api-key': cc.apiKey, 'anthropic-version': '2023-06-01' }; if (cc.isOfficial) headers['anthropic-dangerous-direct-browser-access'] = 'true';
      return window.claudeFetch(cc.endpoint, { method: 'POST', headers: headers, body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 4000, system: system, messages: [{ role: 'user', content: content }] }) });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (data.error || !res.ok) throw new Error((data.error && data.error.message) || ('AI 응답 오류 (HTTP ' + res.status + ')'));
        var text = window.claudeExtractText ? window.claudeExtractText(data) : (data.content && data.content[0] && data.content[0].text);
        if (!text) throw new Error('AI 응답이 비어 있습니다.'); return text;
      });
    });
  }
})();
