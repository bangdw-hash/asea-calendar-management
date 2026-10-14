'use strict';
/**
 * award-job.js — 작업(월별·건별 작업 파일) (AW.Job)
 *  같은 양식(레이아웃) 아래에 작업마다 별도 데이터(행)를 보관. 데이터 창 위쪽의 작업 선택줄과 관리 화면을 제공.
 *  활성 작업은 page.jobId 로 양식에 기록되어 다른 단말기에서도 같은 작업이 열린다. 작업이 있으면 행은 작업 테이블에 저장(양식 저장 시 rows 는 보내지 않음).
 */
(function () {
  var AW = window.AW, S = AW.S, J = AW.Job = {}, bar = null;
  S.jobs = []; S.jobId = null;
  function T() { return S.tpl; }

  J.mount = function (pane) {
    bar = document.createElement('div'); bar.className = 'dt-job'; pane.insertBefore(bar, pane.firstChild);
    bar.addEventListener('change', function (e) { if (e.target.id === 'jb-s' && e.target.value) J.switchTo(e.target.value); });
    bar.addEventListener('click', function (e) { var b = e.target.closest('[data-j]'); if (!b) return; if (b.dataset.j === 'new') J.create(); else J.manage(); });
    draw();
  };
  function draw() {
    if (!bar) return; var t = T();
    if (!t || !t.id) { bar.innerHTML = '<span class="muted">' + AW.ic('info', 14) + ' 양식을 저장하면 월별·건별 작업으로 나눠 관리할 수 있습니다.</span>'; return; }
    bar.innerHTML = '<label class="mini" for="jb-s"><b>작업</b></label><select class="in sm" id="jb-s" style="max-width:190px">' + (S.jobs.length ? S.jobs.map(function (j) { return '<option value="' + j.id + '"' + (j.id === S.jobId ? ' selected' : '') + '>' + AW.esc(j.name) + ' (' + j.rows + '행)</option>'; }).join('') : '<option value="">기본 (작업 구분 없음)</option>') + '</select>' +
      '<button class="btn btn-secondary btn-sm" data-j="new">' + AW.ic('plus', 14) + ' 새 작업</button><button class="btn btn-ghost btn-sm" data-j="mng">관리</button>';
  }
  J.draw = draw;
  J.name = function () { var j = S.jobs.filter(function (x) { return x.id === S.jobId; })[0]; return j ? j.name : ''; };
  J.load = function () {
    var t = T(); S.jobs = []; if (!t || !t.id) { draw(); return Promise.resolve(); }
    return AW.call('award_job_list', { p_id: t.id }).then(function (l) { S.jobs = l || []; }).catch(function () { S.jobs = []; }).then(draw);
  };
  // 양식을 연 직후: 마지막으로 쓰던 작업의 데이터를 불러옴
  J.afterOpen = function () {
    var t = T(); S.jobId = (t.page && t.page.jobId) || null;
    return J.load().then(function () {
      if (S.jobId && !S.jobs.some(function (j) { return j.id === S.jobId; })) { S.jobId = null; delete t.page.jobId; }
      if (!S.jobId) return;
      return AW.call('award_job_get', { p_id: S.jobId }).then(function (r) { if (r) { t.rows = r.rows || []; S.row = 0; AW.Data.refresh(true); AW.emit('rowchange'); } });
    }).then(draw);
  };
  J.reset = function () { S.jobs = []; S.jobId = null; draw(); };
  J.saveRows = function () { if (!S.jobId || !T()) return Promise.resolve(); return AW.call('award_job_save', { p_id: S.jobId, p_rows: T().rows }).catch(function () {}); };
  function setActive(id, rows) {
    S.jobId = id; if (id) T().page.jobId = id; else delete T().page.jobId; T().rows = rows || []; S.row = 0; S.sampleOnly = false; S.dirty = true;
    AW.Data.refresh(true); AW.emit('datachange'); AW.emit('rowchange'); AW.emit('stepchange'); draw();
  }
  J.switchTo = function (id) {
    if (id === S.jobId) return Promise.resolve();
    return J.saveRows().then(function () { return AW.call('award_job_get', { p_id: id }); }).then(function (r) {
      if (!r) throw new Error('작업을 찾을 수 없습니다.'); setActive(id, r.rows); AW.toast('「' + r.name + '」 작업을 열었습니다.', 'ok');
    }).catch(function (e) { AW.toast(e.message, 'error'); draw(); });
  };
  function today() { var d = new Date(); return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 작업'; }
  J.create = function () {
    var t = T(); if (!t || !t.id) return AW.toast('양식을 먼저 저장해 주십시오.', 'error');
    AW.modal({ title: '새 작업', body: '<p class="muted" style="margin-top:0">같은 양식으로 월별·건별 데이터를 따로 관리합니다. 작업마다 입력 데이터와 발급(출력) 이력이 구분됩니다.</p><label class="f">작업 이름</label><input class="in" id="jn" maxlength="60" value="' + AW.esc(today()) + '"><div class="radios" style="margin-top:10px"><label><input type="checkbox" id="jc"> 현재 작업의 데이터를 복사해서 시작</label></div>',
      actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '만들기', cls: 'btn-primary', onClick: function (c, b) {
        var nm = AW.$('#jn').value.trim(); if (!nm) return AW.toast('작업 이름을 입력해 주십시오.', 'error'); var copy = AW.$('#jc').checked; b.disabled = true;
        var chain = Promise.resolve();
        if (!S.jobId && !S.jobs.length && t.rows.length) chain = AW.call('award_job_add', { p_tpl: t.id, p_name: '기본 작업', p_rows: t.rows }).then(function (r) { S.jobId = r.id; t.page.jobId = r.id; });   // 지금까지의 데이터를 「기본 작업」으로 보존
        chain.then(function () { return J.saveRows(); }).then(function () { return AW.call('award_job_add', { p_tpl: t.id, p_name: nm, p_rows: copy ? t.rows : [] }); })
          .then(function (r) { var rows = copy ? AW.clone(t.rows) : []; return J.load().then(function () { c(); setActive(r.id, rows); AW.toast('「' + nm + '」 작업을 만들었습니다.', 'ok'); }); })
          .catch(function (e) { b.disabled = false; AW.toast(e.message + ' (db/award_schema_6.sql 설치 여부를 확인하십시오)', 'error'); }); } }],
      onOpen: function (el) { var i = AW.$('#jn', el); i.select(); i.addEventListener('keydown', function (k) { if (k.key === 'Enter') AW.$('.btn-primary', el).click(); }); } });
  };
  J.manage = function () {
    var t = T(); if (!t || !t.id) return AW.toast('양식을 먼저 저장해 주십시오.', 'error');
    var m = { el: null };
    AW.modal({ title: '작업 관리', wide: true, body: '<div id="jm-b"></div>', actions: [{ label: '닫기', cls: 'btn-ghost' }, { label: AW.ic('plus', 15) + ' 새 작업', cls: 'btn-primary', onClick: function (c) { c(); J.create(); } }], onOpen: function (el) { m.el = el; draw2(); } });
    function draw2() {
      var b = AW.$('#jm-b', m.el); if (!b) return;
      b.innerHTML = S.jobs.length ? '<div class="tbl-wrap"><table class="gt"><thead><tr><th>작업</th><th>행</th><th>수정</th><th></th></tr></thead><tbody>' + S.jobs.map(function (j) {
        return '<tr><td><b>' + AW.esc(j.name) + '</b>' + (j.id === S.jobId ? ' <span class="badge ok">사용 중</span>' : '') + '</td><td class="c">' + j.rows + '</td><td class="nowrap">' + AW.fmtTime(j.updated_at) + '</td><td class="nowrap">' + (j.id === S.jobId ? '' : '<button class="btn btn-secondary btn-sm" data-o="' + j.id + '">열기</button> ') + '<button class="btn btn-ghost btn-sm" data-r="' + j.id + '">이름 변경</button> <button class="btn btn-ghost btn-sm" data-c="' + j.id + '">복제</button> <button class="btn btn-ghost btn-sm" data-d="' + j.id + '">삭제</button></td></tr>';
      }).join('') + '</tbody></table></div><p class="muted">작업마다 입력 데이터가 따로 저장되고, 발급(출력) 이력에 작업 이름이 함께 남습니다. 이력 화면에서 작업별로 모아 보고 출력 화면을 다시 볼 수 있습니다.</p>' : '<div class="empty">아직 작업이 없습니다. 「새 작업」을 만들면 지금까지 입력한 데이터는 「기본 작업」으로 보존됩니다.</div>';
      var done = function (p) { return p.then(function () { return J.load(); }).then(draw2).catch(function (e) { AW.toast(e.message, 'error'); }); };
      AW.$$('[data-o]', b).forEach(function (x) { x.onclick = function () { J.switchTo(x.dataset.o).then(draw2); }; });
      AW.$$('[data-r]', b).forEach(function (x) { x.onclick = function () { var j = S.jobs.filter(function (y) { return y.id === x.dataset.r; })[0], nn = window.prompt('새 이름', j.name); if (nn && nn.trim()) done(AW.call('award_job_rename', { p_id: j.id, p_name: nn.trim().slice(0, 60) })); }; });
      AW.$$('[data-c]', b).forEach(function (x) { x.onclick = function () { var j = S.jobs.filter(function (y) { return y.id === x.dataset.c; })[0]; done((j.id === S.jobId ? J.saveRows() : Promise.resolve()).then(function () { return AW.call('award_job_get', { p_id: j.id }); }).then(function (r) { return AW.call('award_job_add', { p_tpl: t.id, p_name: j.name + ' (복사)', p_rows: r.rows }); })); }; });
      AW.$$('[data-d]', b).forEach(function (x) { x.onclick = function () { var j = S.jobs.filter(function (y) { return y.id === x.dataset.d; })[0]; AW.confirm('작업 삭제', '「' + j.name + '」 작업과 그 입력 데이터를 삭제합니다. (이미 출력한 이력은 남습니다)', '삭제', true).then(function (ok) { if (!ok) return; done(AW.call('award_job_delete', { p_id: j.id }).then(function () { if (j.id === S.jobId) { S.jobId = null; delete t.page.jobId; S.dirty = true; AW.emit('datachange'); } })); }); }; });
    }
  };
})();
