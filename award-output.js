'use strict';
/**
 * award-output.js — 미리보기창(AW.Preview) · 출력(AW.Output) · 이력관리(AW.History)
 *  · 출력: 장마다 1페이지로 인쇄 → 브라우저 인쇄창에서 「PDF로 저장」 또는 프린터 선택
 *    옵션: 범위, 배경 포함/제외(실물 상장용지에 글자만 인쇄), 프린터 오프셋(mm 보정)
 *  · 이력: 발급(출력) 이력 — 당시 데이터·양식 보관, 양식 버전 복원, 활동 로그
 */
(function () {
  var AW = window.AW, S = AW.S;
  var Pv = AW.Preview = {}, Out = AW.Output = {}, Hist = AW.History = {};
  function T() { return S.tpl; }

  /* ───────────── 미리보기 ───────────── */
  var pv = { root: null, stage: null, hl: true, hm: AW.lsGet('award_pv_hm', true) };
  Pv.mount = function (root) {
    pv.root = root;
    root.innerHTML =
      '<div class="pv-bar"><button class="icon-btn" data-a="prev" aria-label="이전 행" title="이전 행">' + AW.ic('chevL') + '</button>' +
      '<div class="pv-no"><input class="in sm num" id="pv-n" type="number" min="1" value="1" aria-label="행 번호"><span id="pv-of" class="muted"></span></div>' +
      '<button class="icon-btn" data-a="next" aria-label="다음 행" title="다음 행">' + AW.ic('chevR') + '</button><span class="sp"></span>' +
      '<select class="in sm" id="pv-lg" aria-label="보기·출력 언어" title="보기·출력 언어"><option value="ko">한글</option><option value="en">영문</option><option value="both">한영 병기</option></select>' +
      '<label class="mini chk" title="엑셀 데이터로 바뀌는 값에 노란 표시를 합니다(출력물에는 표시되지 않음)"><input type="checkbox" id="pv-hm" checked> 병합 영역 표시</label>' +
      '<label class="mini chk" title="값이 비어 있는 자리를 붉게 표시합니다(출력물에는 표시되지 않음)"><input type="checkbox" id="pv-hl" checked> 빈 항목 표시</label>' +
      '<button class="btn btn-primary btn-sm" data-a="print">' + AW.ic('print', 16) + ' 인쇄 · PDF</button></div>' +
      '<div class="pv-stage" id="pv-stage"></div><div class="pv-info" id="pv-info"></div>';
    pv.stage = AW.$('#pv-stage', root);
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'prev') go(S.row - 1); if (b.dataset.a === 'next') go(S.row + 1); if (b.dataset.a === 'print') Out.dialog();
    });
    AW.$('#pv-n', root).addEventListener('change', function (e) { go((parseInt(e.target.value, 10) || 1) - 1); });
    AW.$('#pv-lg', root).addEventListener('change', function (e) { T().page.lang = e.target.value; S.dirty = true; AW.Editor.render(); AW.emit('tplchange', 'page'); });
    AW.$('#pv-hm', root).checked = pv.hm; AW.$('#pv-hm', root).addEventListener('change', function (e) { pv.hm = e.target.checked; AW.lsSet('award_pv_hm', pv.hm); Pv.render(); });
    AW.$('#pv-hl', root).addEventListener('change', function (e) { pv.hl = e.target.checked; Pv.render(); });
    var deb = AW.debounce(function () { Pv.render(); }, 120);
    if (!pv.wired) { pv.wired = true; AW.on('tplchange', deb); AW.on('datachange', deb); AW.on('rowchange', function () { Pv.render(); }); }
    if (window.ResizeObserver) new ResizeObserver(AW.debounce(function () { Pv.render(); }, 100)).observe(pv.stage);
  };
  function go(i) { var n = T().rows.length; if (!n) return; S.seenPrev = true; AW.emit('stepchange'); i = Math.max(0, Math.min(n - 1, i)); if (i === S.row) return Pv.render(); S.row = i; AW.emit('rowchange'); }
  Pv.sampleRow = function () { var r = {}; T().fields.forEach(function (f) { r[f.name] = f.example || ''; }); return r; };
  Pv.render = function () {
    if (!pv.stage || !pv.stage.isConnected || !T()) return;
    var t = T(), rows = t.rows, has = rows.length > 0, row = has ? rows[Math.min(S.row, rows.length - 1)] : Pv.sampleRow();
    var w = pv.stage.clientWidth - 24, h = pv.stage.clientHeight - 24;
    if (w < 40 || h < 40) return;
    var k = Math.max(0.5, Math.min(w / t.page.w, h / t.page.h));
    var pg = AW.renderPage(t, { scale: k, mode: 'view', row: row, idx: has ? S.row : 0 });
    pv.stage.innerHTML = ''; pv.stage.classList.toggle('nohl', !pv.hl); pv.stage.classList.toggle('hlm', !!pv.hm);
    var box = document.createElement('div'); box.className = 'pv-sheet'; box.appendChild(pg); pv.stage.appendChild(box);
    AW.fitAll(pg);
    AW.$('#pv-lg', pv.root).value = t.page.lang || 'ko';
    var n = AW.$('#pv-n', pv.root); if (document.activeElement !== n) n.value = has ? S.row + 1 : '';
    n.max = rows.length || 1; n.disabled = !has;
    AW.$('#pv-of', pv.root).textContent = has ? '/ ' + rows.length : '데이터 없음';
    AW.$$('[data-a="prev"],[data-a="next"]', pv.root).forEach(function (b) { b.disabled = !has; });
    AW.$('#pv-info', pv.root).textContent = has ? '' : '데이터가 없어 항목별 예시값으로 표시 중입니다. 데이터 입력창에서 엑셀을 올리면 실제 내용이 표시됩니다.';
  };

  /* ───────────── 출력 ───────────── */
  var fontsDone = {};
  function ensureFonts(tpl) {
    var fam = {}; tpl.elems.forEach(function (e) { if (e.t === 'text') { fam[e.font] = 1; } });
    return Promise.all(Object.keys(fam).map(function (f) { return document.fonts.load((fam[f] ? '700 ' : '') + '16px "' + f + '"', '가나다ABC').catch(function () {}); })).then(function () { return document.fonts.ready; });
  }
  // 모아찍기 계획: 출력 용지(paper)·분할(nup 1/2/4)·방향(orient)·확대 여부(noEnl) → 용지 크기, 칸 수, 배율
  function sheetPlan(tpl, o) {
    o = o || {}; var pw = tpl.page.w, ph = tpl.page.h, n = +o.nup || 1, same = !o.paper || o.paper === 'same';
    if (same && n === 1) return null;
    var sheets, base = same ? null : AW.PAPERS[o.paper].slice().sort(function (a, b) { return a - b; });
    sheets = same ? [[pw, ph]] : o.orient === 'L' ? [[base[1], base[0]]] : o.orient === 'P' ? [[base[0], base[1]]] : [[base[1], base[0]], [base[0], base[1]]];
    var lay = n === 1 ? [[1, 1]] : n === 2 ? [[2, 1], [1, 2]] : [[2, 2]], best = null;
    sheets.forEach(function (sh) { lay.forEach(function (l) { var cw = sh[0] / l[0], ch = sh[1] / l[1], sc = Math.min(cw / pw, ch / ph); if (o.noEnl) sc = Math.min(sc, 1); if (!best || sc > best.s + 1e-6) best = { W: sh[0], H: sh[1], cols: l[0], rows: l[1], cw: cw, ch: ch, s: sc, n: n }; }); });
    return best;
  }
  Out.sheetPlan = sheetPlan;
  function sheetOpt() { return Object.assign({ paper: 'same', nup: 1, orient: 'auto', cut: true, noEnl: true }, AW.lsGet('award_sheet', {})); }
  Out.sheetOpt = sheetOpt;
  function build(tpl, rows, opt) {
    var root = AW.$('#print-root'); root.innerHTML = ''; var k = 96 / 25.4, plan = sheetPlan(tpl, opt.sheet);
    var mk = function (r) { return AW.renderPage(tpl, { scale: k, mode: 'print', row: r.row, idx: r.idx, bg: opt.bg, dx: opt.dx, dy: opt.dy, lang: opt.lang }); };
    if (!plan) rows.forEach(function (r) { var pg = mk(r); pg.classList.add('pp'); root.appendChild(pg); });
    else {
      var pw = tpl.page.w, ph = tpl.page.h;
      for (var si = 0; si < rows.length; si += plan.n) {
        var sh = document.createElement('div'); sh.className = 'pp sheet'; sh.style.cssText = 'position:relative;overflow:hidden;background:#fff;flex:none;width:' + plan.W * k + 'px;height:' + plan.H * k + 'px';
        for (var j = 0; j < plan.n && si + j < rows.length; j++) {
          var col = j % plan.cols, rw = Math.floor(j / plan.cols), w = document.createElement('div');
          w.style.cssText = 'position:absolute;transform-origin:0 0;left:' + (col * plan.cw + (plan.cw - pw * plan.s) / 2) * k + 'px;top:' + (rw * plan.ch + (plan.ch - ph * plan.s) / 2) * k + 'px;width:' + pw * k + 'px;height:' + ph * k + 'px;transform:scale(' + plan.s + ')';
          w.appendChild(mk(rows[si + j])); sh.appendChild(w);
        }
        if (plan.n > 1 && opt.sheet.cut) {       // 자르는 선(칸 사이 점선)
          for (var c = 1; c < plan.cols; c++) { var v = document.createElement('div'); v.style.cssText = 'position:absolute;top:0;bottom:0;width:0;border-left:0.25mm dashed #888;left:' + c * plan.cw * k + 'px'; sh.appendChild(v); }
          for (var r2 = 1; r2 < plan.rows; r2++) { var hz = document.createElement('div'); hz.style.cssText = 'position:absolute;left:0;right:0;height:0;border-top:0.25mm dashed #888;top:' + r2 * plan.ch * k + 'px'; sh.appendChild(hz); }
        }
        root.appendChild(sh);
      }
    }
    var st = document.getElementById('print-style') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'print-style' }));
    st.textContent = '@page{size:' + (plan ? plan.W : tpl.page.w) + 'mm ' + (plan ? plan.H : tpl.page.h) + 'mm;margin:0}';
    return ensureFonts(tpl).then(function () { AW.fitAll(root); });
  }
  // rows: [{row, idx}]
  Out.run = function (tpl, rows, opt) {
    opt = opt || {};
    return AW.ensureFontsFor(tpl).then(function () { return build(tpl, rows, opt); }).then(function () {
      var done = function () { window.removeEventListener('afterprint', done); AW.$('#print-root').innerHTML = ''; };
      window.addEventListener('afterprint', done);
      setTimeout(function () { window.print(); }, 60);
    });
  };
  // 내 글꼴 관리: 서버에 저장해 두면 다른 PC·브라우저에서도 자동으로 불러옴
  Out.fontDialog = function () {
    var m = { el: null };
    AW.modal({ title: '내 글꼴 관리', wide: true, body: '<div id="ft-b"><div class="loading">불러오는 중…</div></div>', actions: [{ label: '닫기', cls: 'btn-primary' }], onOpen: function (el) { m.el = el; draw(); } });
    function mb(n) { return (n / 1048576).toFixed(1) + 'MB'; }
    function draw() {
      AW.loadFontList().then(function (l) {
        var b = AW.$('#ft-b', m.el); if (!b) return; var tot = l.reduce(function (a, x) { return a + x.size; }, 0);
        b.innerHTML = '<div class="alert warn" style="margin-bottom:10px">' + AW.ic('info', 16) + ' <b>라이선스 확인</b> — 웹 게시·재배포가 허용된 글꼴만 올려 주십시오(예: 나눔, Noto, 서울서체 등). 윈도우·한컴·유료 글꼴은 올리지 마십시오. 이 화면에 올린 파일은 서버에 저장되어 접속하는 모든 단말기에서 내려받아집니다.</div>' +
          '<div class="grid2"><div><label class="f">글꼴 이름(목록에 표시)</label><input class="in" id="ft-n" maxlength="40" placeholder="예: 학교 상장체"></div><div><label class="f">글꼴 파일 (ttf · otf · woff · woff2, 8MB 이하)</label><input class="in" id="ft-f" type="file" accept=".ttf,.otf,.woff,.woff2"></div></div>' +
          '<div style="margin:10px 0"><button class="btn btn-primary btn-sm" id="ft-up">' + AW.ic('upload', 16) + ' 올리기</button> <span class="muted" id="ft-m"></span></div>' +
          '<p class="muted">저장 용량 <b>' + mb(tot) + '</b> / 150MB · ' + l.length + '개. 글꼴은 양식에서 쓰는 것만 내려받고 기기에 보관하므로 두 번째부터는 다시 받지 않습니다. 한글 글꼴은 용량이 크니 woff2 형식을 권장합니다.</p>' +
          (l.length ? '<div class="tbl-wrap"><table class="gt"><thead><tr><th>이름</th><th>형식</th><th>용량</th><th>등록일</th><th></th></tr></thead><tbody>' + l.map(function (x) { return '<tr><td><b style="font-family:\'' + x.family + '\'">' + AW.esc(x.label) + '</b></td><td>' + AW.esc(x.fmt) + '</td><td>' + mb(x.size) + '</td><td class="nowrap">' + AW.fmtTime(x.created_at) + '</td><td><button class="btn btn-ghost btn-sm" data-d="' + x.id + '">삭제</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty">올린 글꼴이 없습니다.</div>');
        AW.$('#ft-up', m.el).onclick = up;
        AW.$$('[data-d]', m.el).forEach(function (x) { x.onclick = function () { AW.confirm('글꼴 삭제', '삭제하면 이 글꼴을 쓰는 양식은 대체 글꼴로 표시됩니다. 계속하시겠습니까?', '삭제', true).then(function (ok) { if (ok) AW.call('award_font_delete', { p_id: x.dataset.d }).then(function () { draw(); AW.Editor.fontSelects(); }).catch(function (e) { AW.toast(e.message, 'error'); }); }); }; });
      });
    }
    function up() {
      var f = AW.$('#ft-f', m.el).files[0], nm = AW.$('#ft-n', m.el).value.trim(), msg = AW.$('#ft-m', m.el), bt = AW.$('#ft-up', m.el);
      if (!f) return AW.toast('글꼴 파일을 선택해 주십시오.', 'error'); if (f.size > 8 * 1048576) return AW.toast('파일이 너무 큽니다(8MB 이하). woff2 로 변환하거나 글꼴을 부분 추출해 주십시오.', 'error');
      var ext = (f.name.split('.').pop() || '').toLowerCase(), fmt = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' }[ext]; if (!fmt) return AW.toast('ttf · otf · woff · woff2 파일만 올릴 수 있습니다.', 'error');
      nm = nm || f.name.replace(/\.[^.]+$/, ''); bt.disabled = true; msg.textContent = '검사하는 중…';
      f.arrayBuffer().then(function (buf) {
        return new FontFace('chk', buf).load().then(function () {                 // 올리기 전에 브라우저로 읽히는 글꼴인지 확인
          var u = new Uint8Array(buf), s = '', k = 0x8000; for (var i = 0; i < u.length; i += k) s += String.fromCharCode.apply(null, u.subarray(i, i + k)); msg.textContent = '서버에 저장하는 중…';
          return AW.call('award_font_add', { p_family: 'uf' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), p_label: nm, p_fmt: fmt, p_data: btoa(s), p_size: f.size });
        });
      }).then(function () { AW.toast('글꼴을 올렸습니다. 글꼴 목록의 「내 글꼴」에서 선택하십시오.', 'ok'); AW.log('font_add', '', { label: nm }); return AW.loadFontList(); })
        .then(function () { AW.Editor.fontSelects(); draw(); }).catch(function (e) { bt.disabled = false; msg.textContent = ''; AW.toast(/FontFace|load/i.test(String(e && e.message)) || !e.code ? '읽을 수 없는 글꼴 파일입니다: ' + (e.message || '') : e.message, 'error'); });
    }
  };
  var CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function newCode() { var a = new Uint8Array(10); (window.crypto || window.msCrypto).getRandomValues(a); return Array.prototype.map.call(a, function (x) { return CODE_CH[x % CODE_CH.length]; }).join(''); }
  function holderOf(row) { var f = T().fields, k = f.filter(function (x) { return /성명|이름|수상자|수료자|name/i.test(x.name); })[0] || f[0]; return k ? String(row[k.name] || '') : ''; }
  function awardOf(row) { var f = T().fields.filter(function (x) { return /상명|상\s*종류|표창|종류|award/i.test(x.name); })[0]; return f ? String(row[f.name] || '') : ''; }
  // 장마다 고유 인증번호를 만들어 서버 발급 대장에 등록 (fresh=true 면 기존 번호를 버리고 새로 발급)
  function regCodes(t, list, label, fresh) {
    list = list.map(function (x) { return { row: Object.assign({}, x.row, { _code: (!fresh && x.row._code) || newCode() }), idx: x.idx }; });
    return AW.call('award_issue_register', { p_items: list.map(function (x) { return { code: x.row._code, serial: AW.serial(x.idx, t), tpl: t.name, holder: holderOf(x.row), award: awardOf(x.row) }; }), p_label: label }).then(function () { return { ok: true, list: list }; })
      .catch(function (e) { return AW.confirm('인증번호 등록 실패', e.message + '\n\n등록되지 않은 인증번호는 진위 확인이 되지 않습니다. 그래도 인쇄하시겠습니까? (db/award_schema_2.sql 설치 여부를 확인하십시오)', '그래도 인쇄').then(function (ok) { return { ok: ok, list: list }; }); });
  }
  function usesCode() { return T().elems.some(function (e) { return e.t === 'qr' || (e.t === 'text' && /\{\{\s*@인증번호\s*\}\}/.test((e.text || '') + (e.en || ''))); }); }

  // 발급번호 규칙 — page.num = {pattern, start, step, pad}
  Out.numDialog = function (after) {
    var n = Object.assign({ pattern: '{N}', start: 1, step: 1, pad: 0 }, T().page.num || {});
    var m = { el: null };
    AW.modal({ title: '발급번호 규칙', body:
      '<p class="muted" style="margin-top:0">상장 안의 <code>{{@번호}}</code> 자리에 들어가는 번호입니다. 행 순서대로 시작 번호부터 증가 간격만큼 커집니다.</p>' +
      '<label class="f">번호 형식</label><input class="in" id="nm-p" value="' + AW.esc(n.pattern) + '" maxlength="60">' +
      '<div class="chips">' + ['{N}', '제{N}호', '제{YYYY}-{N}호', '{YYYY}-{N}', '{YY}{MM}-{N}'].map(function (x) { return '<button type="button" class="chip" data-v="' + AW.esc(x) + '">' + AW.esc(x) + '</button>'; }).join('') + '</div>' +
      '<p class="muted" style="margin:0 0 6px"><code>{N}</code> 번호 · <code>{YYYY}</code> 연도 · <code>{YY}</code> 연도 2자리 · <code>{MM}</code> 월 · <code>{DD}</code> 일 (출력하는 날짜 기준)</p>' +
      '<div class="grid2"><div><label class="f">시작 번호</label><input class="in num" id="nm-s" type="number" step="1" value="' + n.start + '"></div><div><label class="f">증가 간격</label><input class="in num" id="nm-t" type="number" step="1" value="' + n.step + '"></div>' +
      '<div><label class="f">자릿수 (0 채움, 0=없음)</label><input class="in num" id="nm-d" type="number" min="0" max="10" value="' + n.pad + '"></div><div></div></div>' +
      '<div class="box-ro" id="nm-v" style="margin-top:12px"></div>',
      actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '저장', cls: 'btn-primary', onClick: function (c) { T().page.num = read(); S.dirty = true; c(); AW.emit('tplchange', 'page'); AW.toast('발급번호 규칙을 저장했습니다.', 'ok'); if (after) after(); } }],
      onOpen: function (el) { m.el = el; AW.$$('.chip', el).forEach(function (b) { b.onclick = function () { AW.$('#nm-p', el).value = b.dataset.v; prev(); }; }); AW.$$('input', el).forEach(function (i) { i.oninput = prev; }); prev(); } });
    function read() { return { pattern: AW.$('#nm-p', m.el).value || '{N}', start: parseInt(AW.$('#nm-s', m.el).value, 10) || 0, step: parseInt(AW.$('#nm-t', m.el).value, 10) || 1, pad: Math.max(0, Math.min(10, parseInt(AW.$('#nm-d', m.el).value, 10) || 0)) }; }
    function prev() { var t = { page: { num: read() } }, rows = Math.max(T().rows.length, 3); AW.$('#nm-v', m.el).innerHTML = '미리보기: <b>' + [0, 1, 2].map(function (i) { return AW.esc(AW.serial(i, t)); }).join(' , ') + '</b> …' + (T().rows.length > 3 ? ' <b>' + AW.esc(AW.serial(rows - 1, t)) + '</b> (' + rows + '번째)' : ''); }
  };

  Out.dialog = function () {
    var t = T(), n = t.rows.length, v = AW.Data.validate(), forced = usesCode();
    if (!t.elems.length) return AW.toast('양식에 배치된 요소가 없습니다.', 'error');
    var lg = t.page.lang || 'ko', m = { el: null }, so = sheetOpt();
    AW.modal({
      title: '인쇄 · PDF 저장',
      body: '<div class="radios"><label><input type="radio" name="o-r" value="all"' + (n ? ' checked' : ' disabled') + '> 전체 <b>' + n + '</b>장</label>' +
        '<label><input type="radio" name="o-r" value="cur"' + (n ? '' : ' disabled') + '> 현재 행(' + (n ? S.row + 1 : '-') + '번)만</label>' +
        '<label><input type="radio" name="o-r" value="rng"' + (n ? '' : ' disabled') + '> 범위 <input class="in sm num" id="o-a" type="number" min="1" max="' + n + '" value="1" style="width:70px"> ~ <input class="in sm num" id="o-b" type="number" min="1" max="' + n + '" value="' + n + '" style="width:70px"></label>' +
        (n ? '' : '<label><input type="radio" name="o-r" value="sample" checked> 예시 1장(시험 인쇄)</label>') + '</div>' +
        '<label class="f">출력 언어</label><div class="radios" style="flex-direction:row;gap:16px"><label><input type="radio" name="o-l" value="ko"' + (lg === 'ko' ? ' checked' : '') + '> 한글만</label><label><input type="radio" name="o-l" value="en"' + (lg === 'en' ? ' checked' : '') + '> 영문만</label><label><input type="radio" name="o-l" value="both"' + (lg === 'both' ? ' checked' : '') + '> 한영 병기</label></div>' +
        '<label class="f">발급번호 <button class="lnk" id="o-num" type="button">규칙 설정…</button></label><div class="box-ro" id="o-nv"></div>' +
        '<div class="radios" style="margin-top:12px"><label><input type="checkbox" id="o-bg"' + (t.bg ? ' checked' : ' disabled') + '> 배경 양식 함께 인쇄</label>' +
        '<span class="muted" style="display:block;margin-left:22px">해제하면 글자만 인쇄됩니다 — 이미 인쇄된 실물 상장용지에 출력할 때 사용합니다.</span>' +
        '<label><input type="checkbox" id="o-reg"' + (forced ? ' checked disabled' : ' checked') + '> 발급 대장에 등록하고 위조 방지 인증번호 부여</label>' +
        '<span class="muted" style="display:block;margin-left:22px">' + (forced ? '양식에 인증 QR/{{@인증번호}}가 있어 자동 적용됩니다. ' : '') + '장마다 고유 인증번호가 서버에 등록되어 award-verify.html 에서 진위를 확인할 수 있습니다.</span></div>' +
        '<label class="f">출력 용지 · 모아찍기 <span class="muted">(양식 크기는 그대로, 출력할 때만 나눠 찍습니다)</span></label><div class="grid2"><div><select class="in" id="o-sp">' + [['same', '양식 크기 그대로']].concat(Object.keys(AW.PAPERS).map(function (k) { return [k, k + ' 용지']; })).map(function (x) { return '<option value="' + x[0] + '"' + (so.paper === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></div><div><select class="in" id="o-nu"><option value="1"' + (so.nup === 1 ? ' selected' : '') + '>1장씩</option><option value="2"' + (so.nup === 2 ? ' selected' : '') + '>2장 모아찍기 (용지의 1/2)</option><option value="4"' + (so.nup === 4 ? ' selected' : '') + '>4장 모아찍기 (용지의 1/4)</option></select></div></div>' +
        '<div class="grid2" style="margin-top:6px"><div><select class="in" id="o-so"><option value="auto"' + (so.orient === 'auto' ? ' selected' : '') + '>용지 방향 자동(가장 크게)</option><option value="L"' + (so.orient === 'L' ? ' selected' : '') + '>가로</option><option value="P"' + (so.orient === 'P' ? ' selected' : '') + '>세로</option></select></div><div class="radios"><label><input type="checkbox" id="o-cut"' + (so.cut ? ' checked' : '') + '> 자르는 선 표시</label><label><input type="checkbox" id="o-ne"' + (so.noEnl ? ' checked' : '') + '> 작은 양식은 확대하지 않음</label></div></div>' +
        '<div class="box-ro" id="o-sv" style="margin-top:6px"></div>' +
        '<div class="grid2" style="margin-top:12px"><div><label class="f">가로 보정(mm)</label><input class="in num" id="o-dx" type="number" step="0.1" value="' + (AW.lsGet('award_dx', 0)) + '"></div><div><label class="f">세로 보정(mm)</label><input class="in num" id="o-dy" type="number" step="0.1" value="' + (AW.lsGet('award_dy', 0)) + '"></div></div>' +
        '<span class="muted">프린터 인쇄 위치가 어긋날 때 사용합니다(+ 는 오른쪽·아래). 시험 인쇄 후 조정하십시오.</span>' +
        '<label class="f" style="margin-top:12px">발급 이력 이름 <span class="muted">(선택)</span></label><input class="in" id="o-lb" maxlength="60" placeholder="예: 2026학년도 졸업식 우수상">' +
        (AW.missingFonts().length ? '<div class="alert warn" style="margin-top:12px">' + AW.ic('warn', 16) + ' 이 PC에 설치되어 있지 않은 글꼴(' + AW.esc(AW.missingFonts().join(', ')) + ')이 사용되었습니다. 인쇄하면 다른 글꼴로 대체됩니다. 글꼴을 설치하거나 나눔명조·노토 세리프 등 웹 글꼴로 바꿔 주십시오.</div>' : '') +
        ((v.miss || v.long) ? '<div class="alert warn" style="margin-top:12px">' + AW.ic('warn', 16) + ' 필수 항목 누락 ' + v.miss + '칸 · 길이 초과 ' + v.long + '칸이 있습니다. 데이터 입력창에서 붉게 표시된 칸을 확인하십시오.</div>' : '') +
        '<p class="muted" style="margin:12px 0 0">「인쇄」를 누르면 브라우저 인쇄창이 열립니다. 대상(프린터)을 <b>PDF로 저장</b>으로 바꾸면 파일로 저장됩니다. 인쇄창에서 여백 <b>없음</b>, 배율 <b>100%</b>, 「배경 그래픽」 <b>켜기</b>를 선택하십시오.</p>',
      actions: [{ label: '취소', cls: 'btn-ghost' }, { label: AW.ic('print', 16) + ' 인쇄', cls: 'btn-primary', onClick: function (c) { go(c); } }],
      onOpen: function (el) { m.el = el; AW.$('#o-num', el).onclick = function () { Out.numDialog(numPrev); }; AW.$$('input[name="o-r"]', el).forEach(function (r) { r.onchange = function () { numPrev(); sumPrev(); }; }); AW.$$('#o-sp,#o-nu,#o-so,#o-cut,#o-ne', el).forEach(function (c) { c.onchange = sumPrev; }); sumPrev(); AW.$('#o-a', el).oninput = AW.$('#o-b', el).oninput = numPrev; numPrev(); }
    });
    function readSheet() { return { paper: AW.$('#o-sp', m.el).value, nup: +AW.$('#o-nu', m.el).value, orient: AW.$('#o-so', m.el).value, cut: AW.$('#o-cut', m.el).checked, noEnl: AW.$('#o-ne', m.el).checked }; }
    function sumPrev() {
      var sh = readSheet(), pl = sheetPlan(t, sh), mode = (AW.$('input[name="o-r"]:checked', m.el) || {}).value, cnt = mode === 'all' ? n : mode === 'cur' || mode === 'sample' ? 1 : Math.max(0, Math.min(n, parseInt(AW.$('#o-b', m.el).value, 10) || n) - Math.max(1, parseInt(AW.$('#o-a', m.el).value, 10) || 1) + 1);
      AW.$('#o-sv', m.el).innerHTML = pl ? '용지 <b>' + Math.round(pl.W) + '×' + Math.round(pl.H) + 'mm(' + (pl.W >= pl.H ? '가로' : '세로') + ')</b> · ' + pl.cols + '×' + pl.rows + '칸 · 각 장 <b>' + Math.round(pl.s * 100) + '%</b> · ' + cnt + '장 → <b>' + Math.ceil(cnt / pl.n) + '장</b> 출력' : '양식 1장을 용지 1장에 그대로 출력합니다. (' + cnt + '장)';
    }
    function numPrev() {
      var mode = (AW.$('input[name="o-r"]:checked', m.el) || {}).value, a = 1, b = Math.max(1, n);
      if (mode === 'cur') a = b = S.row + 1; else if (mode === 'rng') { a = Math.max(1, parseInt(AW.$('#o-a', m.el).value, 10) || 1); b = Math.min(n, parseInt(AW.$('#o-b', m.el).value, 10) || n); } else if (mode === 'sample') a = b = 1;
      AW.$('#o-nv', m.el).innerHTML = AW.esc(AW.serial(a - 1, t)) + (b > a ? ' ~ ' + AW.esc(AW.serial(b - 1, t)) : '') + ' <span class="muted">(' + Math.max(0, b - a + 1) + '장 · 행 순서 기준)</span>';
    }
    function go(close) {
      var mode = AW.$('input[name="o-r"]:checked', m.el).value, list = [];
      if (mode === 'all') t.rows.forEach(function (r, i) { list.push({ row: r, idx: i }); });
      else if (mode === 'cur') list.push({ row: t.rows[S.row], idx: S.row });
      else if (mode === 'rng') { var a = Math.max(1, parseInt(AW.$('#o-a', m.el).value, 10) || 1), b = Math.min(n, parseInt(AW.$('#o-b', m.el).value, 10) || n); if (a > b) return AW.toast('범위가 올바르지 않습니다.', 'error'); for (var i = a - 1; i < b; i++) list.push({ row: t.rows[i], idx: i }); }
      else list.push({ row: Pv.sampleRow(), idx: 0 });
      var dx = parseFloat(AW.$('#o-dx', m.el).value) || 0, dy = parseFloat(AW.$('#o-dy', m.el).value) || 0, bg = AW.$('#o-bg', m.el).checked, label = AW.$('#o-lb', m.el).value.trim();
      var lang = AW.$('input[name="o-l"]:checked', m.el).value, reg = forced || AW.$('#o-reg', m.el).checked;
      var sheet = readSheet(); AW.lsSet('award_sheet', sheet); AW.lsSet('award_dx', dx); AW.lsSet('award_dy', dy); close(); S.printed = true; AW.emit('stepchange');
      if (list.length > 400 && !window.confirm(list.length + '장을 한 번에 인쇄합니다. 브라우저가 느려질 수 있습니다. 계속하시겠습니까?')) return;
      var real = mode !== 'sample', nm = label || (mode === 'all' ? '전체 출력' : mode === 'cur' ? '개별 출력' : '범위 출력');
      var start = Promise.resolve(true);
      if (reg && real) start = regCodes(t, list, nm, false).then(function (r) { list = r.list; return r.ok; });                 // 인증번호 부여·등록
      else if (forced) list = list.map(function (x) { return { row: Object.assign({}, x.row, { _code: 'SAMPLE0000' }), idx: x.idx }; });
      start.then(function (ok) {
        if (!ok) return; AW.toast(list.length + '장을 준비하는 중입니다…');
        Out.run(t, list, { bg: bg, dx: dx, dy: dy, lang: lang, sheet: sheet });
        if (real) AW.call('award_batch_add', { p_tpl: t.id, p_name: t.name, p_kind: 'print', p_label: nm, p_rows: list.map(function (x) { return x.row; }), p_snap: { page: t.page, elems: t.elems, fields: t.fields, name: t.name, job: S.jobId ? { id: S.jobId, name: AW.Job.name() } : null } }).catch(function (e) { AW.toast('발급 이력 저장 실패: ' + e.message, 'error'); });
      });
    }
  };

  /* ───────────── 이력관리 ───────────── */
  var LABEL = { login: '로그인', login_fail: '로그인 실패', tpl_create: '양식 생성', tpl_delete: '양식 삭제', tpl_duplicate: '양식 복사', xlsx_template: '엑셀 양식 내려받기', xlsx_import: '엑셀 올리기', ai_guide: 'AI 안내 작성', restore: '버전 복원', issue_revoke: '인증번호 폐기', issue_restore: '인증번호 복구', font_add: '글꼴 업로드', font_delete: '글꼴 삭제', ai_translate: 'AI 영문 번역' };
  Hist.open = function (tab) {
    var m = { el: null, close: function () {} }, hs = { job: '' };
    AW.modal({
      title: '이력 관리', wide: true,
      body: '<div class="tabs"><button class="tab on" data-t="batch">발급(출력) 이력</button><button class="tab" data-t="ver">양식 버전</button><button class="tab" data-t="reg">발급 대장(인증번호)</button><button class="tab" data-t="log">활동 기록</button></div><div id="hs-body" class="hs-body"><div class="loading">불러오는 중…</div></div>',
      onOpen: function (el, close) {
        m.el = el; m.close = close;
        AW.$$('.tab', el).forEach(function (b) { b.onclick = function () { AW.$$('.tab', el).forEach(function (x) { x.classList.toggle('on', x === b); }); show(b.dataset.t); }; });
        show(tab || 'batch');
      }
    });
    function body() { return AW.$('#hs-body', m.el); }
    function dt(s) { return AW.fmtTime(s); }
    function show(t) {
      AW.$$('.tab', m.el).forEach(function (x) { x.classList.toggle('on', x.dataset.t === t); });
      body().innerHTML = '<div class="loading">불러오는 중…</div>';
      if (t === 'batch') AW.call('award_batch_list').then(function (l) {
        var jobs = {}; l.forEach(function (b) { if (b.job_name) jobs[b.job_name] = 1; }); var jn = Object.keys(jobs), flt = hs.job || '';
        var rows = l.filter(function (b) { return !flt || (flt === '\u0001' ? !b.job_name : b.job_name === flt); });
        body().innerHTML = (jn.length ? '<div class="hs-flt"><label class="mini" for="hs-j"><b>작업별 보기</b></label> <select class="in sm" id="hs-j"><option value="">전체</option><option value="\u0001"' + (flt === '\u0001' ? ' selected' : '') + '>작업 구분 없음</option>' + jn.map(function (n) { return '<option' + (n === flt ? ' selected' : '') + '>' + AW.esc(n) + '</option>'; }).join('') + '</select></div>' : '') +
          (rows.length ? '<div class="tbl-wrap"><table class="gt"><thead><tr><th>일시</th><th>양식</th><th>작업</th><th>이름</th><th>장수</th><th>첫 행</th><th></th></tr></thead><tbody>' + rows.map(function (b) {
          var first = b.first ? Object.keys(b.first).filter(function (k) { return k.charAt(0) !== '_'; }).slice(0, 3).map(function (k) { return b.first[k]; }).join(' · ') : '';
          return '<tr><td class="nowrap">' + dt(b.created_at) + '</td><td>' + AW.esc(b.tpl_name) + '</td><td>' + (b.job_name ? '<span class="badge">' + AW.esc(b.job_name) + '</span>' : '<span class="muted">-</span>') + '</td><td>' + AW.esc(b.label) + '</td><td class="c">' + b.cnt + '</td><td class="where">' + AW.esc(first) + '</td>' +
            '<td class="nowrap"><button class="btn btn-secondary btn-sm" data-b="' + b.id + '" data-m="view">출력 화면 보기</button> <button class="btn btn-ghost btn-sm" data-b="' + b.id + '" data-m="load">데이터 불러오기</button> <button class="btn btn-ghost btn-sm" data-b="' + b.id + '" data-m="again">다시 출력</button></td></tr>';
        }).join('') + '</tbody></table></div><p class="muted">최근 300건까지 보관합니다. 출력할 때의 양식·데이터가 그대로 저장되므로 나중에 같은 내용으로 다시 보거나 출력할 수 있습니다.</p>' : '<div class="empty">발급(출력) 이력이 없습니다.</div>');
        var sj = AW.$('#hs-j', body()); if (sj) sj.onchange = function () { hs.job = sj.value; show('batch'); };
        AW.$$('[data-b]', body()).forEach(function (b) { b.onclick = function () { batchAct(b.dataset.b, b.dataset.m, m.close); }; });
      }).catch(err);
      if (t === 'ver') {
        if (!T().id) { body().innerHTML = '<div class="empty">양식을 먼저 저장해 주십시오.</div>'; return; }
        AW.call('award_ver_list', { p_id: T().id }).then(function (l) {
          body().innerHTML = l.length ? '<div class="tbl-wrap"><table class="gt"><thead><tr><th>버전</th><th>저장 일시</th><th>요소 수</th><th>메모</th><th></th></tr></thead><tbody>' + l.map(function (v, i) {
            return '<tr><td class="c">v' + v.ver + (v.ver === T().ver ? ' (현재)' : '') + '</td><td class="nowrap">' + dt(v.created_at) + '</td><td class="c">' + v.elems + '</td><td>' + AW.esc(v.note) + '</td><td>' + (v.ver === T().ver ? '' : '<button class="btn btn-secondary btn-sm" data-v="' + v.ver + '">이 버전으로 복원</button>') + '</td></tr>';
          }).join('') + '</tbody></table></div><p class="muted">양식 구조(상자·배치·항목 안내)가 바뀐 저장만 버전으로 보관하며 최근 30개까지 남습니다. 복원해도 입력 데이터와 배경은 바뀌지 않습니다.</p>' : '<div class="empty">보관된 버전이 없습니다.</div>';
          AW.$$('[data-v]', body()).forEach(function (b) { b.onclick = function () { restore(+b.dataset.v, m.close); }; });
        }).catch(err);
      }
      if (t === 'reg') {
        body().innerHTML = '<div style="display:flex;gap:8px;margin-bottom:8px"><input class="in sm" id="rg-q" style="flex:1" placeholder="인증번호·발급번호·이름 검색"><button class="btn btn-secondary btn-sm" id="rg-s">검색</button></div><div id="rg-l"><div class="loading">불러오는 중…</div></div>';
        var load = function () {
          AW.call('award_issued_list', { p_q: AW.$('#rg-q', m.el).value.trim() }).then(function (l) {
            AW.$('#rg-l', m.el).innerHTML = l.length ? '<div class="tbl-wrap"><table class="gt"><thead><tr><th>인증번호</th><th>발급번호</th><th>수여자</th><th>상명</th><th>양식</th><th>발급일</th><th>상태</th><th></th></tr></thead><tbody>' + l.map(function (x) {
              return '<tr><td class="nowrap"><b>' + AW.esc(x.code) + '</b></td><td>' + AW.esc(x.serial) + '</td><td>' + AW.esc(x.holder) + '</td><td>' + AW.esc(x.award || '') + '</td><td>' + AW.esc(x.tpl_name) + '</td><td class="nowrap">' + dt(x.issued_at) + '</td><td>' + (x.revoked ? '<span class="badge err">폐기</span>' : '<span class="badge ok">유효</span>') + '</td><td><button class="btn btn-ghost btn-sm" data-c="' + AW.esc(x.code) + '" data-r="' + (x.revoked ? 0 : 1) + '">' + (x.revoked ? '복구' : '폐기') + '</button></td></tr>';
            }).join('') + '</tbody></table></div><p class="muted">최근 300건까지 표시합니다. 폐기하면 진위 확인 페이지에서 「폐기된 상장」으로 안내됩니다.</p>' : '<div class="empty">발급 대장이 비어 있습니다.</div>';
            AW.$$('[data-c]', m.el).forEach(function (b) { b.onclick = function () { AW.call('award_issued_revoke', { p_code: b.dataset.c, p_revoked: b.dataset.r === '1' }).then(load).catch(function (e) { AW.toast(e.message, 'error'); }); }; });
          }).catch(function (e) { AW.$('#rg-l', m.el).innerHTML = '<div class="alert warn">' + AW.esc(e.message) + '</div>'; });
        };
        AW.$('#rg-s', m.el).onclick = load; AW.$('#rg-q', m.el).onkeydown = function (e) { if (e.key === 'Enter') load(); }; load();
      }
      if (t === 'log') AW.call('award_log_list').then(function (l) {
        body().innerHTML = l.length ? '<div class="tbl-wrap"><table class="gt"><thead><tr><th>일시</th><th>작업</th><th>내용</th></tr></thead><tbody>' + l.map(function (x) {
          var d = x.detail ? Object.keys(x.detail).map(function (k) { return k + ': ' + (typeof x.detail[k] === 'object' ? JSON.stringify(x.detail[k]) : x.detail[k]); }).join(', ') : '';
          return '<tr><td class="nowrap">' + dt(x.created_at) + '</td><td>' + AW.esc(LABEL[x.action] || x.action) + '</td><td class="where">' + AW.esc(d.length > 120 ? d.slice(0, 120) + '…' : d) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">기록이 없습니다.</div>';
      }).catch(err);
    }
    function err(e) { body().innerHTML = '<div class="alert warn">' + AW.esc(e.message) + '</div>'; }
  };
  // 발급 이력의 출력 화면 다시 보기 (저장된 양식·데이터를 그대로 렌더링, 한 장씩 보기 · 배경은 현재 양식의 배경 사용)
  Out.viewBatch = function (b) {
    var sameTpl = b.tpl_id && b.tpl_id === T().id, sn = b.snap || {};
    var tpl = Object.assign({}, sameTpl ? T() : { bg: null }, { page: sn.page || T().page, elems: sn.elems || T().elems, fields: sn.fields || T().fields, rows: b.rows });
    var i = 0, n = b.rows.length, m = { el: null };
    AW.modal({ title: '출력 화면 — ' + AW.esc(b.label || '') + (sn.job && sn.job.name ? ' · ' + AW.esc(sn.job.name) : ''), wide: true,
      body: '<div class="vb-bar"><button class="btn btn-secondary btn-sm" data-v="-1">이전</button> <input class="in sm" id="vb-n" type="number" min="1" max="' + n + '" value="1" style="width:64px"> / ' + n + ' <button class="btn btn-secondary btn-sm" data-v="1">다음</button><span class="muted" style="margin-left:10px">' + dt2(b.created_at) + ' 출력</span></div><div class="vb-st pv-stage" id="vb-st"></div>' + (sameTpl ? '' : '<p class="muted">다른 양식의 이력이므로 배경 이미지는 표시되지 않습니다.</p>'),
      actions: [{ label: '닫기', cls: 'btn-ghost' }],
      onOpen: function (el) { m.el = el; draw(); AW.$$('[data-v]', el).forEach(function (x) { x.onclick = function () { go(i + (+x.dataset.v)); }; }); AW.$('#vb-n', el).onchange = function (e) { go((parseInt(e.target.value, 10) || 1) - 1); }; } });
    function dt2(s) { return AW.fmtTime(s); }
    function go(k) { i = Math.max(0, Math.min(n - 1, k)); AW.$('#vb-n', m.el).value = i + 1; draw(); }
    function draw() {
      var st = AW.$('#vb-st', m.el); if (!st) return; var w = Math.max(240, st.clientWidth - 24), h = Math.max(200, Math.min(window.innerHeight * 0.6, 640)), k = Math.min(w / tpl.page.w, h / tpl.page.h);
      st.innerHTML = ''; var box = document.createElement('div'); box.className = 'pv-sheet'; var pg = AW.renderPage(tpl, { scale: k, mode: 'view', row: b.rows[i], idx: i }); box.appendChild(pg); st.appendChild(box); AW.fitAll(pg);
    }
  };
  function batchAct(id, mode, closeModal) {
    AW.call('award_batch_get', { p_id: id }).then(function (b) {
      if (!b) throw new Error('이력을 찾을 수 없습니다.');
      if (mode === 'view') return Out.viewBatch(b);
      if (mode === 'load') {
        var names = T().fields.map(function (f) { return f.name; }), keys = b.rows[0] ? Object.keys(b.rows[0]) : [], hit = names.filter(function (n) { return keys.indexOf(n) >= 0; }).length;
        return AW.confirm('데이터 불러오기', b.cnt + '행을 현재 양식의 데이터로 불러옵니다.\n항목 일치 ' + hit + '/' + names.length + '개. 현재 입력된 ' + T().rows.length + '행은 대체됩니다.', '불러오기').then(function (ok) {
          if (!ok) return; T().rows = b.rows; S.row = 0; S.dirty = true; AW.Data.refresh(true); AW.emit('datachange'); AW.emit('rowchange'); closeModal(); AW.toast(b.cnt + '행을 불러왔습니다.', 'ok');
        });
      }
      var sameTpl = b.tpl_id && b.tpl_id === T().id, tpl = sameTpl && b.snap && b.snap.elems ? Object.assign({}, T(), { page: b.snap.page, elems: b.snap.elems, fields: b.snap.fields || T().fields }) : T();
      closeModal();
      var list = b.rows.map(function (r, i) { return { row: r, idx: i }; }), hasCode = list.some(function (x) { return x.row._code; });
      var go = function (fresh) {
        var p = fresh ? regCodes(tpl, list, (b.label || '재출력') + ' (재발급)', true) : Promise.resolve({ ok: true, list: list });
        p.then(function (r) { if (!r.ok) return; Out.run(tpl, r.list, { bg: !!T().bg, dx: AW.lsGet('award_dx', 0), dy: AW.lsGet('award_dy', 0), lang: tpl.page.lang || 'ko', sheet: sheetOpt() });
          if (fresh) AW.call('award_batch_add', { p_tpl: tpl.id || null, p_name: tpl.name || b.tpl_name, p_kind: 'print', p_label: (b.label || '재출력') + ' (재발급)', p_rows: r.list.map(function (x) { return x.row; }), p_snap: b.snap || {} }).catch(function () {}); });
      };
      if (!hasCode) return go(false);
      AW.modal({ title: '다시 출력', body: '<p style="margin-top:0">' + b.cnt + '장을 다시 출력합니다. 인증번호를 어떻게 할까요?</p><div class="radios"><label><input type="radio" name="rp" value="same" checked> 같은 인증번호로 출력 <span class="muted">(분실·훼손으로 같은 상장을 다시 찍을 때, 추천)</span></label><label><input type="radio" name="rp" value="new"> 새 인증번호로 재발급 <span class="muted">(발급 대장에 새로 등록, 기존 번호는 유효 상태로 남음)</span></label></div>', actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '출력', cls: 'btn-primary', onClick: function (c) { var f = AW.$('input[name="rp"]:checked').value === 'new'; c(); go(f); } }] });
    }).catch(function (e) { AW.toast(e.message, 'error'); });
  }
  function restore(ver, closeModal) {
    AW.confirm('버전 복원', 'v' + ver + ' 양식으로 복원합니다. 현재 배치는 새 버전으로 저장되므로 언제든 다시 되돌릴 수 있습니다.', '복원').then(function (ok) {
      if (!ok) return;
      AW.call('award_ver_get', { p_id: T().id, p_ver: ver }).then(function (sn) {
        if (!sn) throw new Error('버전을 찾을 수 없습니다.');
        T().elems = sn.elems || []; T().page = sn.page || T().page; T().fields = sn.fields || T().fields; if (sn.name) T().name = sn.name;
        S.sel = []; S.dirty = true; AW.Editor.render(); AW.Editor.resetHist(); AW.emit('tplchange', 'page'); AW.emit('tplchange', 'name'); AW.emit('savenow', 'v' + ver + ' 복원');
        AW.log('restore', T().id, { ver: ver }); closeModal(); AW.toast('v' + ver + ' 양식으로 복원했습니다.', 'ok');
      }).catch(function (e) { AW.toast(e.message, 'error'); });
    });
  }
})();
