'use strict';
/**
 * aseasurvey-admin-courseai.js — 과목·교수 등록: 파일(엑셀·PDF·이미지·docx·hwpx·txt)을 올리면 AI가 표로 정리 → 관리자가 배포 전 수정 → 등록
 *  · 표준 양식 엑셀은 AI 없이 바로 읽고, 시간표·수강편성표 등 형식이 다른 파일은 AI가 계열·학년·반·과목·구분·교수로 변환합니다.
 *  · 등록 전 단계에서 모든 칸을 직접 고치거나 행을 추가·삭제·일괄 변경할 수 있습니다. 등록 후에도 목록에서 건별 수정이 가능합니다.
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico, H = A.courseHelpers;
  var st = { files: [], text: '', model: '', busy: false, err: '', rows: [], notes: [], issues: [], src: '', mode: 'merge', kw: '' };

  function system(known) {
    return '당신은 직업전문학교 교육운영팀의 데이터 정리 담당자입니다. 입력(시간표·수강편성표·교육과정표·교수 배정표 등의 엑셀/PDF/이미지/문서)에서 「반별 개설 과목과 담당교수」를 추출해 등록용 표로 만듭니다.\n' +
      '출력은 JSON 객체 하나만 작성합니다(마크다운·설명·코드펜스 금지). 형식: {"rows":[["계열","학년","반","과목명","구분","담당교수"],…],"notes":["판단 내용"],"issues":["입력의 오류·모호한 부분"]}\n' +
      '규칙:\n1. 한 행은 「한 반의 한 과목」입니다. 같은 과목이 여러 반에 개설되면 반마다 행을 만듭니다(담당교수가 같아도 펼침).\n' +
      '2. 학년은 「1학년」 형식, 반은 「A반」·「1반」처럼 입력 표기를 따르되 숫자만 있으면 「N반」으로 씁니다. 계열은 학과·전공 이름입니다.\n' +
      '3. 구분은 「이론」 또는 「실습」만 씁니다(과목명 뒤 (이론)/(실습) 표기나 시수 열로 판단). 알 수 없으면 빈 문자열입니다.\n' +
      '4. 담당교수는 이름만 씁니다(직함 제외). 정해지지 않았거나 「미정」·「-」이면 빈 문자열입니다. 한 과목에 교수가 여러 명이면 쉼표로 이어 쓰고 notes 에 적습니다.\n' +
      '5. 입력에 없는 값을 추정해 채우지 않습니다. 표의 병합 칸(계열·학년이 위 행과 같은 경우)은 위 값을 이어받습니다. 교양·공통·휴강·행사 같은 비교과 행은 notes 에 적고 제외합니다.\n' +
      '6. 같은 (계열, 학년, 반, 과목명)이 중복되면 한 행만 두고 issues 에 적습니다.\n' +
      (known ? '7. 이 설문에 이미 등록된 값: ' + known + ' — 같은 의미의 표기는 이 값에 맞춥니다.\n' : '');
  }
  function parseJson(t) { var s = String(t || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim(), a = s.indexOf('{'); if (a > 0) s = s.slice(a); try { return JSON.parse(s); } catch (e) { var b = s.lastIndexOf('}'); if (b > 0) return JSON.parse(s.slice(0, b + 1)); throw new Error('AI 응답을 해석하지 못했습니다. 파일을 나누어 올리거나 다시 시도해 주십시오.'); } }

  // 반 표기: 한 글자(A, B, 가 등)면 「반」을 붙임 — 등록 양식·기존 데이터와 맞춤
  function normAll(r) { var n = H.normRow(r); if (/^[A-Za-z가-힣]$/.test(n.klass)) n.klass += '반'; return n; }
  function existing() { var m = {}; (A.cur.courses || []).filter(function (c) { return c.active; }).forEach(function (c) { m[H.keyOf(c)] = c; }); return m; }
  function stat() {
    var ex = existing(), seen = {}, c = { new: 0, upd: 0, same: 0, bad: 0, dup: 0 };
    st.rows.forEach(function (r) {
      r._bad = !(r.track && r.grade && r.klass && r.name); var k = H.keyOf(r); r._dup = !!seen[k]; seen[k] = 1;
      var o = ex[k]; r._st = !o ? 'new' : ((o.prof !== r.prof || o.kind !== r.kind) ? 'upd' : 'same');
      c[r._st]++; if (r._bad) c.bad++; if (r._dup) c.dup++;
    });
    return c;
  }
  function knownText() {
    var cs = (A.cur.courses || []).filter(function (c) { return c.active; }); if (!cs.length) return '';
    var u = function (f) { return Array.from(new Set(cs.map(f))).slice(0, 12).join(', '); };
    return '계열[' + u(function (c) { return c.track; }) + '] 학년[' + u(function (c) { return c.grade; }) + '] 반[' + u(function (c) { return c.klass; }) + ']';
  }

  /* ───────────── 입력 단계 ───────────── */
  function inputHtml() {
    var chips = st.files.length ? '<div class="chips">' + st.files.map(function (f, i) { return '<span class="chip">' + I(f.kind === 'text' ? 'file' : 'eye', 13) + E(f.name) + ' <small>' + ({ text: (f.text || '').length.toLocaleString() + '자', image: '이미지', pdf: 'PDF', rows: '표준 양식 ' + (f.rows || []).length + '행' }[f.kind]) + '</small><button data-act="cfdel" data-i="' + i + '" aria-label="제거">' + I('x', 12) + '</button></span>'; }).join('') + '</div>' : '';
    return '<h3>' + I('sparkle', 16) + ' AI로 과목·교수 불러오기</h3><p class="muted" style="margin:4px 0 10px">시간표·수강편성표·교육과정표 등 <b>이미 있는 파일</b>을 올리면 AI가 반별 과목·담당교수 표로 정리합니다. <b>등록은 아직 하지 않으며</b>, 다음 단계에서 모든 칸을 확인·수정한 뒤 등록합니다.</p>' +
      '<div class="drop" id="cdrop">' + I('upload', 22) + '<div style="margin-top:4px">엑셀 · PDF · 이미지(jpg·png) · docx · hwpx · txt — 여러 개 가능</div></div><input type="file" id="cfile" class="hide" multiple accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp,.docx,.hwpx,.txt">' + chips +
      '<label class="f">추가 안내 (선택)</label><textarea class="fld" id="ctext" rows="3" placeholder="예) 2학년만 등록, 표의 가로축은 반이고 세로축은 요일·교시입니다, 교양 과목은 제외">' + E(st.text) + '</textarea>' +
      (st.err ? '<div class="msg err">' + I('alert', 18) + '<div>' + E(st.err) + '</div></div>' : '') + (st.busy ? '<div class="loading">AI가 파일을 읽고 표로 정리하는 중입니다… (보통 20~90초)</div>' : '') +
      '<div class="btn-row"><button class="btn btn-ghost" data-r="0">취소</button><button class="btn btn-primary" data-act="crun" ' + (st.busy ? 'disabled' : '') + '>' + I('sparkle', 16) + ' 표로 정리하기</button></div>';
  }

  /* ───────────── 검토·수정 단계 ───────────── */
  function sumHtml(c) { return '<span class="badge badge-green">신규 ' + c.new + '</span><span class="badge badge-blue">갱신 ' + c.upd + '</span><span class="badge badge-gray">변경 없음 ' + c.same + '</span>' + (c.bad ? '<span class="badge badge-red">빈 칸 ' + c.bad + '행</span>' : '') + (c.dup ? '<span class="badge badge-red">중복 ' + c.dup + '행</span>' : ''); }
  var STB = { new: '<span class="badge badge-green">신규</span>', upd: '<span class="badge badge-blue">갱신</span>', same: '<span class="badge badge-gray">동일</span>' };
  function reviewHtml() {
    var c = stat(), kw = st.kw.trim(), kinds = ['', '이론', '실습'];
    var rows = st.rows.map(function (r, i) { return { r: r, i: i }; }).filter(function (x) { return !kw || (x.r.track + x.r.grade + x.r.klass + x.r.name + x.r.prof).indexOf(kw) >= 0; });
    var h = '<h3>등록 전 확인·수정</h3><p class="muted" style="margin:2px 0 8px">' + E(st.src) + ' — 모든 칸을 직접 고칠 수 있습니다. 「등록」을 눌러야 설문에 반영됩니다.</p>' +
      '<div class="row" style="margin-bottom:8px"><span id="cstat" class="row">' + sumHtml(c) + '</span><span class="sp"></span><input class="fld" id="ckw" placeholder="검색(과목·교수·반)" value="' + E(st.kw) + '" style="max-width:200px;min-height:34px"></div>';
    if (st.issues.length) h += '<div class="msg warn" style="margin:0 0 8px">' + I('alert', 16) + '<div><b>입력 파일에서 발견한 문제</b><br>' + st.issues.slice(0, 8).map(E).join('<br>') + '</div></div>';
    if (st.notes.length) h += '<div class="msg" style="margin:0 0 8px">' + I('info', 16) + '<div><b>AI 메모</b><br>' + st.notes.slice(0, 8).map(E).join('<br>') + '</div></div>';
    h += '<div class="subpanel" style="margin-bottom:8px"><div class="row"><b>일괄 변경</b><select class="fld fld-auto" id="bcol"><option value="prof">담당교수</option><option value="track">계열</option><option value="grade">학년</option><option value="klass">반</option><option value="kind">구분</option><option value="name">과목명</option></select><input class="fld" id="bfrom" placeholder="찾을 값(정확히 일치)" style="max-width:180px"><span>→</span><input class="fld" id="bto" placeholder="바꿀 값" style="max-width:180px"><button class="btn btn-secondary btn-sm" data-act="cbulk">적용</button></div></div>';
    h += '<div class="tbl-wrap" style="max-height:340px"><table class="t"><thead><tr><th>상태</th><th>계열</th><th>학년</th><th>반</th><th>과목명</th><th>구분</th><th>담당교수</th><th></th></tr></thead><tbody>' + rows.map(function (x) {
      var r = x.r, stb = STB[r._st];
      function inp(f, w) { return '<td><input class="fld' + (r._bad && !r[f] && f !== 'kind' && f !== 'prof' ? ' bad' : '') + '" data-cf="' + f + '" value="' + E(r[f]) + '" style="min-width:' + (w || 80) + 'px"></td>'; }
      return '<tr data-i="' + x.i + '"' + (r._dup ? ' style="background:#FCE8E6"' : '') + '><td class="st">' + stb + '</td>' + inp('track', 90) + inp('grade', 64) + inp('klass', 56) + inp('name', 170) + '<td><select class="fld" data-cf="kind" style="min-width:88px">' + kinds.map(function (k) { return '<option value="' + k + '"' + (r.kind === k ? ' selected' : '') + '>' + (k || '(없음)') + '</option>'; }).join('') + '</select></td>' + inp('prof', 90) + '<td><button class="btn btn-ghost btn-sm" data-act="crdel" style="color:var(--red)" aria-label="행 삭제">' + I('trash', 13) + '</button></td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn btn-secondary btn-sm" data-act="cradd">' + I('plus', 13) + ' 행 추가</button><button class="btn btn-ghost btn-sm" data-act="cdedup">중복 행 정리</button><span class="sp"></span><button class="btn btn-ghost btn-sm" data-act="cback">' + I('left', 13) + ' 파일 다시 올리기</button></div>' +
      '<label class="f" style="margin-top:12px">등록 방식</label><div class="opts list" id="cmode"><button type="button" class="opt" data-v="merge" aria-pressed="' + (st.mode === 'merge') + '"><span class="box">' + I('check', 14) + '</span><span><b>추가·갱신</b> (같은 반·과목이 있으면 교수·구분만 갱신, 다른 과목은 그대로 둡니다)</span></button><button type="button" class="opt" data-v="replace" aria-pressed="' + (st.mode === 'replace') + '"><span class="box">' + I('check', 14) + '</span><span><b>전체 교체</b> (목록에 없는 기존 과목은 제거합니다. 응답 기록은 보존)</span></button></div>' +
      '<div class="btn-row"><button class="btn btn-ghost" data-r="0">취소</button><button class="btn btn-primary" data-act="creg" ' + (c.bad || c.dup || !st.rows.length ? 'disabled' : '') + '>' + I('check', 16) + ' ' + st.rows.length + '건 등록</button></div>';
    return h;
  }

  /* ───────────── 동작 ───────────── */
  function open() {
    st.step = st.rows.length ? 'review' : 'input';
    var m = A.modal('<div id="cbox"></div>', function (bg, close) {
      var box = bg.querySelector('#cbox');
      function draw() { box.innerHTML = st.step === 'review' ? reviewHtml() : inputHtml(); bind(); }
      function bind() {
        var fi = box.querySelector('#cfile'), dr = box.querySelector('#cdrop');
        if (dr) {
          dr.onclick = function () { fi.click(); }; fi.onchange = function () { add(Array.from(fi.files)); fi.value = ''; };
          dr.ondragover = function (e) { e.preventDefault(); dr.classList.add('over'); }; dr.ondragleave = function () { dr.classList.remove('over'); }; dr.ondrop = function (e) { e.preventDefault(); dr.classList.remove('over'); add(Array.from(e.dataTransfer.files)); };
          box.querySelector('#ctext').oninput = function () { st.text = this.value; };
        }
        var kw = box.querySelector('#ckw'); if (kw) kw.oninput = function () { st.kw = this.value; clearTimeout(st._k); st._k = setTimeout(function () { draw(); var n = box.querySelector('#ckw'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
      }
      async function add(files) {
        for (var i = 0; i < files.length; i++) {
          if (st.files.length >= 6) { A.toast('파일은 최대 6개까지 올릴 수 있습니다.', 'err'); break; }
          var f = files[i], low = f.name.toLowerCase();
          try {
            if (/\.(xlsx|xls|csv)$/.test(low) && window.XLSX) {
              var wb = /\.csv$/.test(low) ? XLSX.read(await f.text(), { type: 'string' }) : XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array' }), sn = wb.SheetNames.filter(function (n) { return /과목/.test(n); })[0] || wb.SheetNames[0];
              var p = H.parseSheetRows(XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' }));
              if (!p.error && p.rows.length) { st.files.push({ name: f.name, kind: 'rows', rows: p.rows }); continue; }
            }
            st.files.push(await A.ext.aiParse.readInput(f));
          } catch (e) { A.toast(e.message, 'err'); }
        }
        draw();
      }
      box.addEventListener('input', function (e) { var cf = e.target.getAttribute('data-cf'); if (!cf) return; var i = Number(e.target.closest('tr').getAttribute('data-i')); st.rows[i][cf] = e.target.value; refresh(); });
      function refresh() {
        var c = stat(); var sm = box.querySelector('#cstat'); if (sm) sm.innerHTML = sumHtml(c);
        box.querySelectorAll('tbody tr[data-i]').forEach(function (tr) { var r = st.rows[Number(tr.getAttribute('data-i'))]; if (!r) return; tr.querySelector('.st').innerHTML = STB[r._st]; tr.style.background = r._dup ? '#FCE8E6' : ''; ['track', 'grade', 'klass', 'name'].forEach(function (f) { var inp = tr.querySelector('[data-cf="' + f + '"]'); if (inp) inp.classList.toggle('bad', r._bad && !r[f]); }); });
        var rg = box.querySelector('[data-act="creg"]'); if (rg) { rg.disabled = !!(c.bad || c.dup || !st.rows.length); }
      }
      box.addEventListener('change', function (e) {
        var cf = e.target.getAttribute('data-cf'); if (!cf) return; var tr = e.target.closest('tr'), i = Number(tr.getAttribute('data-i')), r = st.rows[i];
        r[cf] = e.target.value; var n = normAll(r); Object.keys(n).forEach(function (k) { r[k] = n[k]; var inp = tr.querySelector('[data-cf="' + k + '"]'); if (inp && inp.tagName === 'INPUT') inp.value = r[k]; });
        refresh();
      });
      box.addEventListener('click', async function (e) {
        var o = e.target.closest('#cmode .opt'); if (o) { st.mode = o.getAttribute('data-v'); return draw(); }
        var b = e.target.closest('[data-r]'); if (b) return close();
        var t = e.target.closest('[data-act]'); if (!t) return; var act = t.getAttribute('data-act'), i = Number(t.getAttribute('data-i'));
        if (act === 'cfdel') { st.files.splice(i, 1); return draw(); }
        if (act === 'cback') { st.step = 'input'; return draw(); }
        if (act === 'crdel') { st.rows.splice(Number(t.closest('tr').getAttribute('data-i')), 1); return draw(); }
        if (act === 'cradd') { var last = st.rows[st.rows.length - 1] || {}; st.rows.push({ track: last.track || '', grade: last.grade || '', klass: last.klass || '', name: '', kind: '', prof: '' }); return draw(); }
        if (act === 'cdedup') { var seen = {}; st.rows = st.rows.filter(function (r) { var k = H.keyOf(r); if (seen[k]) return false; seen[k] = 1; return true; }); return draw(); }
        if (act === 'cbulk') { var col = box.querySelector('#bcol').value, from = box.querySelector('#bfrom').value.trim(), to = box.querySelector('#bto').value.trim(), n = 0; if (!from) return A.toast('찾을 값을 입력해 주십시오.', 'err'); st.rows.forEach(function (r) { if (String(r[col]).trim() === from) { r[col] = to; n++; } }); A.toast(n + '행을 바꿨습니다.'); return draw(); }
        if (act === 'crun') {
          if (!st.files.length && !st.text.trim()) { st.err = '파일을 올리거나 안내를 입력해 주십시오.'; return draw(); }
          var local = []; st.files.filter(function (f) { return f.kind === 'rows'; }).forEach(function (f) { local = local.concat(f.rows); });
          var aiFiles = st.files.filter(function (f) { return f.kind !== 'rows'; });
          st.err = ''; st.notes = []; st.issues = []; var rows = local.slice(), srcs = st.files.map(function (f) { return f.name; });
          if (aiFiles.length || st.text.trim()) {
            st.busy = true; draw();
            try {
              var content = [], parts = [];
              aiFiles.forEach(function (f) { if (f.kind === 'image') { content.push({ type: 'text', text: '[이미지: ' + f.name + ']' }); content.push({ type: 'image', source: { type: 'base64', media_type: f.mime, data: f.b64 } }); } else if (f.kind === 'pdf') { content.push({ type: 'text', text: '[PDF: ' + f.name + ']' }); content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.b64 } }); } else parts.push('[파일: ' + f.name + ']\n' + String(f.text).slice(0, 80000)); });
              if (st.text.trim()) parts.push('[추가 안내]\n' + st.text.trim());
              parts.push('위 자료에서 반별 과목·담당교수 표를 JSON 으로 작성하십시오.'); content.push({ type: 'text', text: parts.join('\n\n') });
              var models = [(A.ext.aiModels[0] || [])[0]].concat(A.ext.aiModels.map(function (m) { return m[0]; })).filter(function (m, i, a) { return m && a.indexOf(m) === i; }), text = null, lastErr;
              for (var k = 0; k < models.length && text == null; k++) { try { text = await A.ext.aiCall(system(knownText()), content, models[k]); } catch (er) { lastErr = er; if (!(er.status === 404 || /model/i.test(er.message))) break; } }
              if (text == null) throw lastErr;
              var j = parseJson(text); (j.rows || []).forEach(function (a) { rows.push(Array.isArray(a) ? a : [a.track, a.grade, a.klass, a.name, a.kind, a.prof]); });
              st.notes = (j.notes || []).map(String); st.issues = (j.issues || []).map(String);
            } catch (er) { st.busy = false; st.err = er.message + (/image|document|media/i.test(er.message) ? ' (현재 AI 제공자가 이미지·PDF 입력을 지원하지 않을 수 있습니다. 엑셀·docx로 올려 보십시오.)' : ''); return draw(); }
            st.busy = false;
          }
          st.rows = rows.map(function (a) { return Array.isArray(a) ? Object.assign({}, normAll({ track: a[0], grade: a[1], klass: a[2], name: a[3], kind: a[4], prof: a[5] })) : Object.assign({}, normAll(a)); });
          if (!st.rows.length) { st.err = '표로 만들 수 있는 과목을 찾지 못했습니다. 파일 내용이나 안내를 확인해 주십시오.'; return draw(); }
          st.src = srcs.join(', ') + (local.length ? ' (표준 양식 ' + local.length + '행 포함)' : ''); st.step = 'review'; return draw();
        }
        if (act === 'creg') {
          t.disabled = true; t.textContent = '등록 중…';
          try {
            var res = await A.rpc('svy_a_courses_save', { p_id: A.cur.survey.id, p_rows: st.rows.map(function (r) { return { track: r.track, grade: r.grade, klass: r.klass, name: r.name, prof: r.prof, kind: r.kind }; }), p_mode: st.mode });
            st.rows = []; st.files = []; st.text = ''; close(); A.toast('과목 ' + res.saved + '건을 등록했습니다.' + (res.removed ? ' (제거 ' + res.removed + '건)' : '')); await A.refresh(); A.ext.tg = null; A.renderSurvey();
          } catch (er) { A.toast(er.message, 'err'); t.disabled = false; t.textContent = st.rows.length + '건 등록'; }
        }
      });
      draw();
    }, 'xl');
    return m;
  }

  /* 과목·교수 탭에 버튼 추가 */
  var orig = A.tabs.courses;
  var wrapped = function (box) {
    var r = orig.apply(this, arguments), tpl = box.querySelector('[data-act="tpl"]');
    if (tpl && !box.querySelector('[data-act="cai"]')) { var b = document.createElement('button'); b.className = 'btn btn-primary btn-sm'; b.setAttribute('data-act', 'cai'); b.innerHTML = I('sparkle', 14) + ' AI로 불러오기 (엑셀·PDF·이미지)'; tpl.parentNode.insertBefore(b, tpl); }
    if (!box._caiBound) { box._caiBound = true; box.addEventListener('click', function (e) { if (e.target.closest('[data-act="cai"]')) open(); }); }
    return r;
  };
  Object.keys(orig).forEach(function (k) { wrapped[k] = orig[k]; });
  A.tabs.courses = wrapped;
  A.ext.courseAI = { open: open, state: st, system: system };
})();
