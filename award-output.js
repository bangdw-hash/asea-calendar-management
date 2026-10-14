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
  var pv = { root: null, stage: null, hl: true };
  Pv.mount = function (root) {
    pv.root = root;
    root.innerHTML =
      '<div class="pv-bar"><button class="icon-btn" data-a="prev" aria-label="이전 행" title="이전 행">' + AW.ic('chevL') + '</button>' +
      '<div class="pv-no"><input class="in sm num" id="pv-n" type="number" min="1" value="1" aria-label="행 번호"><span id="pv-of" class="muted"></span></div>' +
      '<button class="icon-btn" data-a="next" aria-label="다음 행" title="다음 행">' + AW.ic('chevR') + '</button><span class="sp"></span>' +
      '<label class="mini chk" title="값이 비어 있는 자리를 붉게 표시합니다(출력물에는 표시되지 않음)"><input type="checkbox" id="pv-hl" checked> 빈 항목 표시</label>' +
      '<button class="btn btn-primary btn-sm" data-a="print">' + AW.ic('print', 16) + ' 인쇄 · PDF</button></div>' +
      '<div class="pv-stage" id="pv-stage"></div><div class="pv-info" id="pv-info"></div>';
    pv.stage = AW.$('#pv-stage', root);
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'prev') go(S.row - 1); if (b.dataset.a === 'next') go(S.row + 1); if (b.dataset.a === 'print') Out.dialog();
    });
    AW.$('#pv-n', root).addEventListener('change', function (e) { go((parseInt(e.target.value, 10) || 1) - 1); });
    AW.$('#pv-hl', root).addEventListener('change', function (e) { pv.hl = e.target.checked; Pv.render(); });
    var deb = AW.debounce(function () { Pv.render(); }, 120);
    if (!pv.wired) { pv.wired = true; AW.on('tplchange', deb); AW.on('datachange', deb); AW.on('rowchange', function () { Pv.render(); }); }
    if (window.ResizeObserver) new ResizeObserver(AW.debounce(function () { Pv.render(); }, 100)).observe(pv.stage);
  };
  function go(i) { var n = T().rows.length; if (!n) return; i = Math.max(0, Math.min(n - 1, i)); if (i === S.row) return Pv.render(); S.row = i; AW.emit('rowchange'); }
  Pv.sampleRow = function () { var r = {}; T().fields.forEach(function (f) { r[f.name] = f.example || ''; }); return r; };
  Pv.render = function () {
    if (!pv.stage || !pv.stage.isConnected || !T()) return;
    var t = T(), rows = t.rows, has = rows.length > 0, row = has ? rows[Math.min(S.row, rows.length - 1)] : Pv.sampleRow();
    var w = pv.stage.clientWidth - 24, h = pv.stage.clientHeight - 24;
    if (w < 40 || h < 40) return;
    var k = Math.max(0.5, Math.min(w / t.page.w, h / t.page.h));
    var pg = AW.renderPage(t, { scale: k, mode: 'view', row: row, idx: has ? S.row : 0 });
    pv.stage.innerHTML = ''; pv.stage.classList.toggle('nohl', !pv.hl);
    var box = document.createElement('div'); box.className = 'pv-sheet'; box.appendChild(pg); pv.stage.appendChild(box);
    AW.fitAll(pg);
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
  function build(tpl, rows, opt) {
    var root = AW.$('#print-root'); root.innerHTML = '';
    rows.forEach(function (r, i) {
      var pg = AW.renderPage(tpl, { scale: 96 / 25.4, mode: 'print', row: r.row, idx: r.idx, bg: opt.bg, dx: opt.dx, dy: opt.dy });
      pg.classList.add('pp'); root.appendChild(pg);
    });
    var st = document.getElementById('print-style') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'print-style' }));
    st.textContent = '@page{size:' + tpl.page.w + 'mm ' + tpl.page.h + 'mm;margin:0}';
    return ensureFonts(tpl).then(function () { AW.fitAll(root); });
  }
  // rows: [{row, idx}]
  Out.run = function (tpl, rows, opt) {
    opt = opt || {};
    return build(tpl, rows, opt).then(function () {
      var done = function () { window.removeEventListener('afterprint', done); AW.$('#print-root').innerHTML = ''; };
      window.addEventListener('afterprint', done);
      setTimeout(function () { window.print(); }, 60);
    });
  };
  Out.dialog = function () {
    var t = T(), n = t.rows.length, v = AW.Data.validate();
    if (!t.elems.length) return AW.toast('양식에 배치된 요소가 없습니다.', 'error');
    var m = AW.modal({
      title: '인쇄 · PDF 저장',
      body: '<div class="radios"><label><input type="radio" name="o-r" value="all"' + (n ? ' checked' : ' disabled') + '> 전체 <b>' + n + '</b>장</label>' +
        '<label><input type="radio" name="o-r" value="cur"' + (n ? '' : ' disabled') + '> 현재 행(' + (n ? S.row + 1 : '-') + '번)만</label>' +
        '<label><input type="radio" name="o-r" value="rng"' + (n ? '' : ' disabled') + '> 범위 <input class="in sm num" id="o-a" type="number" min="1" max="' + n + '" value="1" style="width:70px"> ~ <input class="in sm num" id="o-b" type="number" min="1" max="' + n + '" value="' + n + '" style="width:70px"></label>' +
        (n ? '' : '<label><input type="radio" name="o-r" value="sample" checked> 예시 1장(시험 인쇄)</label>') + '</div>' +
        '<div class="radios" style="margin-top:12px"><label><input type="checkbox" id="o-bg"' + (t.bg ? ' checked' : ' disabled') + '> 배경 양식 함께 인쇄</label>' +
        '<span class="muted" style="display:block;margin-left:22px">해제하면 글자만 인쇄됩니다 — 이미 인쇄된 실물 상장용지에 출력할 때 사용합니다.</span></div>' +
        '<div class="grid2" style="margin-top:12px"><div><label class="f">가로 보정(mm)</label><input class="in num" id="o-dx" type="number" step="0.1" value="' + (AW.lsGet('award_dx', 0)) + '"></div><div><label class="f">세로 보정(mm)</label><input class="in num" id="o-dy" type="number" step="0.1" value="' + (AW.lsGet('award_dy', 0)) + '"></div></div>' +
        '<span class="muted">프린터 인쇄 위치가 어긋날 때 사용합니다(+ 는 오른쪽·아래). 시험 인쇄 후 조정하십시오.</span>' +
        '<label class="f" style="margin-top:12px">발급 이력 이름 <span class="muted">(선택)</span></label><input class="in" id="o-lb" maxlength="60" placeholder="예: 2026학년도 졸업식 우수상">' +
        ((v.miss || v.long) ? '<div class="alert warn" style="margin-top:12px">' + AW.ic('warn', 16) + ' 필수 항목 누락 ' + v.miss + '칸 · 길이 초과 ' + v.long + '칸이 있습니다. 데이터 입력창에서 붉게 표시된 칸을 확인하십시오.</div>' : '') +
        '<p class="muted" style="margin:12px 0 0">「인쇄」를 누르면 브라우저 인쇄창이 열립니다. 대상(프린터)을 <b>PDF로 저장</b>으로 바꾸면 파일로 저장됩니다. 인쇄창에서 여백 <b>없음</b>, 배율 <b>100%</b>, 「배경 그래픽」 <b>켜기</b>를 선택하십시오.</p>',
      actions: [{ label: '취소', cls: 'btn-ghost' }, { label: AW.ic('print', 16) + ' 인쇄', cls: 'btn-primary', onClick: function (c, btn) { go(c, btn); } }]
    });
    function go(close) {
      var mode = AW.$('input[name="o-r"]:checked', m.el).value, list = [];
      if (mode === 'all') t.rows.forEach(function (r, i) { list.push({ row: r, idx: i }); });
      else if (mode === 'cur') list.push({ row: t.rows[S.row], idx: S.row });
      else if (mode === 'rng') { var a = Math.max(1, parseInt(AW.$('#o-a', m.el).value, 10) || 1), b = Math.min(n, parseInt(AW.$('#o-b', m.el).value, 10) || n); if (a > b) return AW.toast('범위가 올바르지 않습니다.', 'error'); for (var i = a - 1; i < b; i++) list.push({ row: t.rows[i], idx: i }); }
      else list.push({ row: Pv.sampleRow(), idx: 0 });
      var dx = parseFloat(AW.$('#o-dx', m.el).value) || 0, dy = parseFloat(AW.$('#o-dy', m.el).value) || 0, bg = AW.$('#o-bg', m.el).checked, label = AW.$('#o-lb', m.el).value.trim();
      AW.lsSet('award_dx', dx); AW.lsSet('award_dy', dy); close();
      if (list.length > 400 && !window.confirm(list.length + '장을 한 번에 인쇄합니다. 브라우저가 느려질 수 있습니다. 계속하시겠습니까?')) return;
      AW.toast(list.length + '장을 준비하는 중입니다…');
      Out.run(t, list, { bg: bg, dx: dx, dy: dy });
      if (mode !== 'sample') {
        AW.call('award_batch_add', { p_tpl: t.id, p_name: t.name, p_kind: 'print', p_label: label || (mode === 'all' ? '전체 출력' : mode === 'cur' ? '개별 출력' : '범위 출력'),
          p_rows: list.map(function (x) { return x.row; }), p_snap: { page: t.page, elems: t.elems, fields: t.fields, name: t.name } }).catch(function (e) { AW.toast('발급 이력 저장 실패: ' + e.message, 'error'); });
      }
    }
  };

  /* ───────────── 이력관리 ───────────── */
  var LABEL = { login: '로그인', login_fail: '로그인 실패', tpl_create: '양식 생성', tpl_delete: '양식 삭제', tpl_duplicate: '양식 복사', xlsx_template: '엑셀 양식 내려받기', xlsx_import: '엑셀 올리기', ai_guide: 'AI 안내 작성', restore: '버전 복원' };
  Hist.open = function (tab) {
    var m = { el: null, close: function () {} };
    AW.modal({
      title: '이력 관리', wide: true,
      body: '<div class="tabs"><button class="tab on" data-t="batch">발급(출력) 이력</button><button class="tab" data-t="ver">양식 버전</button><button class="tab" data-t="log">활동 기록</button></div><div id="hs-body" class="hs-body"><div class="loading">불러오는 중…</div></div>',
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
        body().innerHTML = l.length ? '<div class="tbl-wrap"><table class="gt"><thead><tr><th>일시</th><th>양식</th><th>이름</th><th>장수</th><th>첫 행</th><th></th></tr></thead><tbody>' + l.map(function (b) {
          var first = b.first ? Object.keys(b.first).slice(0, 3).map(function (k) { return b.first[k]; }).join(' · ') : '';
          return '<tr><td class="nowrap">' + dt(b.created_at) + '</td><td>' + AW.esc(b.tpl_name) + '</td><td>' + AW.esc(b.label) + '</td><td class="c">' + b.cnt + '</td><td class="where">' + AW.esc(first) + '</td>' +
            '<td class="nowrap"><button class="btn btn-secondary btn-sm" data-b="' + b.id + '" data-m="load">데이터 불러오기</button> <button class="btn btn-ghost btn-sm" data-b="' + b.id + '" data-m="again">다시 출력</button></td></tr>';
        }).join('') + '</tbody></table></div><p class="muted">최근 300건까지 보관합니다. 출력할 때의 양식·데이터가 그대로 저장되므로 나중에 같은 내용으로 다시 출력할 수 있습니다.</p>' : '<div class="empty">아직 발급(출력) 이력이 없습니다.</div>';
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
      if (t === 'log') AW.call('award_log_list').then(function (l) {
        body().innerHTML = l.length ? '<div class="tbl-wrap"><table class="gt"><thead><tr><th>일시</th><th>작업</th><th>내용</th></tr></thead><tbody>' + l.map(function (x) {
          var d = x.detail ? Object.keys(x.detail).map(function (k) { return k + ': ' + (typeof x.detail[k] === 'object' ? JSON.stringify(x.detail[k]) : x.detail[k]); }).join(', ') : '';
          return '<tr><td class="nowrap">' + dt(x.created_at) + '</td><td>' + AW.esc(LABEL[x.action] || x.action) + '</td><td class="where">' + AW.esc(d.length > 120 ? d.slice(0, 120) + '…' : d) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">기록이 없습니다.</div>';
      }).catch(err);
    }
    function err(e) { body().innerHTML = '<div class="alert warn">' + AW.esc(e.message) + '</div>'; }
  };
  function batchAct(id, mode, closeModal) {
    AW.call('award_batch_get', { p_id: id }).then(function (b) {
      if (!b) throw new Error('이력을 찾을 수 없습니다.');
      if (mode === 'load') {
        var names = T().fields.map(function (f) { return f.name; }), keys = b.rows[0] ? Object.keys(b.rows[0]) : [], hit = names.filter(function (n) { return keys.indexOf(n) >= 0; }).length;
        return AW.confirm('데이터 불러오기', b.cnt + '행을 현재 양식의 데이터로 불러옵니다.\n항목 일치 ' + hit + '/' + names.length + '개. 현재 입력된 ' + T().rows.length + '행은 대체됩니다.', '불러오기').then(function (ok) {
          if (!ok) return; T().rows = b.rows; S.row = 0; S.dirty = true; AW.Data.refresh(true); AW.emit('datachange'); AW.emit('rowchange'); closeModal(); AW.toast(b.cnt + '행을 불러왔습니다.', 'ok');
        });
      }
      var sameTpl = b.tpl_id && b.tpl_id === T().id, tpl = sameTpl && b.snap && b.snap.elems ? Object.assign({}, T(), { page: b.snap.page, elems: b.snap.elems, fields: b.snap.fields || T().fields }) : T();
      closeModal();
      Out.run(tpl, b.rows.map(function (r, i) { return { row: r, idx: i }; }), { bg: !!T().bg, dx: AW.lsGet('award_dx', 0), dy: AW.lsGet('award_dy', 0) });
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
