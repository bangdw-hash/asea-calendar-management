'use strict';
/**
 * aseasurvey-admin-actions.js — 결과 「분석」 → 「개선 과제」
 *  · 설문 결과에서 나온 개선 과제의 담당·기한·상태를 추적합니다. (설문 → 점검 → 다음 학기 재점검)
 *  · 서버(svy.actions)에는 과제 기록(대상명·제목·방안·담당·기한·상태·메모)만 저장합니다.
 *    학생 응답·AI 분석 원문은 저장하지 않습니다. 대상 이름(예: 교원명)은 관리자 로그인 뒤에서만 읽을 수 있습니다.
 *  · 삭제는 실제 삭제가 아니라 삭제 표시(복구 가능)입니다. DB: db/survey_schema_11.sql
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico, R = function () { return A.ext.rptApi; };
  var V = A.ext.rptViews = A.ext.rptViews || {};
  var ST = { todo: '예정', doing: '진행 중', done: '완료', hold: '보류' }, UN = { school: '학교 전체', track: '계열', klass: '반', prof: '교원', subject: '과목' };
  var AC = { scope: 'cur', status: '', q: '', list: [], err: '' };

  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function overdue(a) { return a.due && a.status !== 'done' && a.due < today(); }
  function badge(s) { return '<span class="badge ' + (s === 'done' ? 'badge-green' : s === 'doing' ? 'badge-blue' : s === 'hold' ? 'badge-gray' : 'badge-orange') + '">' + ST[s] + '</span>'; }

  async function load() {
    try { AC.list = await A.rpc('svy_a_actions', { p_id: AC.scope === 'cur' ? A.cur.survey.id : null }); AC.err = ''; } catch (e) { AC.list = []; AC.err = /function|does not exist|404/.test(e.message || '') ? '개선 과제용 DB(db/survey_schema_11.sql)가 아직 적용되지 않았습니다.' : (e.message || String(e)); }
  }
  function shown() {
    var q = AC.q.trim().toLowerCase();
    return AC.list.filter(function (a) { return (!AC.status || a.status === AC.status) && (!q || (a.title + ' ' + a.target + ' ' + a.owner + ' ' + a.detail).toLowerCase().indexOf(q) >= 0); });
  }
  // 대상 이름이 현재 설문의 같은 이름 대상과 일치하면 현재 평균을 보여 재점검에 쓴다
  function curMeans() {
    var m = {}; try { ['track', 'klass', 'prof', 'subject'].forEach(function (u) { R().facts(u).forEach(function (e) { m[u + '|' + e.label] = e.mean; }); }); } catch (e) {}
    return m;
  }

  function modal(a, onSave) {
    var m = A.modal('', null, ''), root = m.el.querySelector('.modal'), x = Object.assign({ unit: 'school', target: '', title: '', detail: '', owner: '', due: '', status: 'todo', memo: '' }, a || {});
    root.innerHTML = '<h3>' + (x.id ? '개선 과제 수정' : '개선 과제 추가') + '</h3><div class="grid g2" style="margin-top:8px"><div><label class="f">대상 구분</label><select class="fld" data-f="unit">' + Object.keys(UN).map(function (k) { return '<option value="' + k + '"' + (x.unit === k ? ' selected' : '') + '>' + UN[k] + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="f">대상 이름 <span class="muted" style="font-weight:400">(예: 항공정비, 홍길동)</span></label><input class="fld" data-f="target" maxlength="120" value="' + E(x.target) + '"></div>' +
      '<div style="grid-column:1/-1"><label class="f">과제 제목 *</label><input class="fld" data-f="title" maxlength="200" value="' + E(x.title) + '"></div>' +
      '<div style="grid-column:1/-1"><label class="f">방안(누가·무엇을·어떻게)</label><textarea class="fld" rows="3" maxlength="2000" data-f="detail">' + E(x.detail) + '</textarea></div>' +
      '<div><label class="f">담당</label><input class="fld" data-f="owner" maxlength="100" value="' + E(x.owner) + '"></div><div><label class="f">기한</label><input class="fld" type="date" data-f="due" value="' + E(x.due || '') + '"></div>' +
      '<div><label class="f">상태</label><select class="fld" data-f="status">' + Object.keys(ST).map(function (k) { return '<option value="' + k + '"' + (x.status === k ? ' selected' : '') + '>' + ST[k] + '</option>'; }).join('') + '</select></div>' +
      '<div style="grid-column:1/-1"><label class="f">메모(진행 상황·재점검 결과)</label><textarea class="fld" rows="2" maxlength="2000" data-f="memo">' + E(x.memo) + '</textarea></div></div>' +
      '<div class="btn-row"><button class="btn btn-ghost" data-m="x">취소</button><button class="btn btn-primary" data-m="ok">저장</button></div>';
    root.addEventListener('click', async function (e) {
      var t = e.target.closest('[data-m]'); if (!t) return; if (t.getAttribute('data-m') === 'x') return m.close();
      var o = { id: x.id || '' }; root.querySelectorAll('[data-f]').forEach(function (i) { o[i.getAttribute('data-f')] = i.value; });
      if (!o.title.trim()) return A.toast('과제 제목을 입력해 주십시오.', 'err');
      t.disabled = true; try { await onSave(o); m.close(); } catch (er) { A.toast(er.message || String(er), 'err'); t.disabled = false; }
    });
  }
  async function save(o, surveyId) { await A.rpc('svy_a_action_save', { p_id: surveyId || A.cur.survey.id, p_action: o }); }

  // 리포트(교수·반·계열·과목)의 개선 과제 제안을 과제로 가져오기
  async function importFromReports() {
    var r = R(); await r.loadSaved(); var items = [], units = ['track', 'klass', 'prof', 'subject'];
    units.forEach(function (u) { var fs = r.facts(u); fs.forEach(function (e) { var rec = r.getRec(e), an = rec && (rec.edit || rec.analysis); (an && an.actions || []).forEach(function (ac) { if (ac && ac.title) items.push({ unit: u, target: e.label, title: ac.title, detail: ac.detail || '', owner: ac.owner || '', memo: ac.when ? '시기: ' + ac.when : '' }); }); }); });
    var have = {}; AC.list.forEach(function (a) { have[a.unit + '|' + a.target + '|' + a.title] = 1; });
    var fresh = items.filter(function (i) { return !have[i.unit + '|' + i.target + '|' + i.title]; });
    if (!fresh.length) return A.toast('가져올 새 개선 과제가 없습니다. 대상별 분석에서 AI·기본 분석을 먼저 실행해 주십시오.', 'err');
    if (!(await A.confirm('개선 과제 가져오기', '리포트 분석에 포함된 개선 과제 ' + fresh.length + '건을 「예정」 상태로 추가합니다. 계속하시겠습니까?', '추가', '취소'))) return;
    var n = 0; for (var i = 0; i < fresh.length && i < 200; i++) { try { await save(Object.assign({}, fresh[i], { src: 'report', status: 'todo' })); n++; } catch (e) { A.toast(e.message || String(e), 'err'); break; } }
    A.toast(n + '건을 추가했습니다.');
  }

  V.act = async function (box) {
    box.innerHTML = '<div id="rpt-view" class="loading">불러오는 중…</div>';
    try { await R().loadSaved(); R().UI.merge = (await R().dbGet(R().sid() + '|merge')) || {}; } catch (e) {}
    await load();
    function draw() {
      var L = shown(), cm = curMeans(), cnt = { todo: 0, doing: 0, done: 0, hold: 0 }, od = 0; AC.list.forEach(function (a) { cnt[a.status]++; if (overdue(a)) od++; });
      box.innerHTML = '<div id="rpt-view"><div class="panel"><div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><h3 class="sp" style="margin:0">개선 과제 <span class="muted" style="font-weight:400">· 담당·기한·상태 추적</span></h3>' +
        '<select class="fld" data-ac="scope" style="width:auto"><option value="cur"' + (AC.scope === 'cur' ? ' selected' : '') + '>이 설문</option><option value="all"' + (AC.scope === 'all' ? ' selected' : '') + '>모든 설문(다음 학기 재점검)</option></select>' +
        '<select class="fld" data-ac="status" style="width:auto"><option value="">전체 상태</option>' + Object.keys(ST).map(function (k) { return '<option value="' + k + '"' + (AC.status === k ? ' selected' : '') + '>' + ST[k] + '</option>'; }).join('') + '</select>' +
        '<input class="fld" data-ac="q" placeholder="검색" value="' + E(AC.q) + '" style="width:140px"><button class="btn btn-secondary btn-sm" data-ac="add">' + I('plus', 14) + ' 과제 추가</button><button class="btn btn-secondary btn-sm" data-ac="imp">리포트에서 가져오기</button></div>' +
        '<div class="msg" style="margin:8px 0">' + I('info', 18) + '<div>과제 기록(대상·제목·방안·담당·기한·상태·메모)만 서버에 저장되며 학생 응답과 AI 분석 원문은 저장되지 않습니다. 대상 이름에 교원명을 넣으면 관리자 로그인 뒤에서만 보입니다. 다음 학기에 「모든 설문」으로 보면서 같은 대상의 현재 평균으로 이행 효과를 재점검하십시오(점수 변화는 응답자 집단이 달라 참고용입니다).</div></div>' +
        (AC.err ? '<div class="msg err">' + E(AC.err) + '</div>' : '') +
        '<div class="kpis"><div class="kpi"><div class="l">예정</div><div class="v">' + cnt.todo + '</div></div><div class="kpi"><div class="l">진행 중</div><div class="v">' + cnt.doing + '</div></div><div class="kpi"><div class="l">완료</div><div class="v">' + cnt.done + '</div></div><div class="kpi"><div class="l">보류</div><div class="v">' + cnt.hold + '</div></div><div class="kpi"><div class="l">기한 경과</div><div class="v" style="' + (od ? 'color:#b91c1c' : '') + '">' + od + '</div></div></div>' +
        '<div class="tbl-wrap" style="max-height:560px;overflow:auto"><table class="t cmpt"><thead><tr><th>상태</th><th>과제</th><th>대상</th><th>담당</th><th>기한</th><th class="num">현재 평균</th>' + (AC.scope === 'all' ? '<th>설문</th>' : '') + '<th></th></tr></thead><tbody>' +
        (L.map(function (a) { var cur = cm[a.unit + '|' + a.target]; return '<tr><td>' + badge(a.status) + '</td><td class="wrapcell"><b>' + E(a.title) + '</b>' + (a.detail ? '<div class="muted" style="font-size:12.5px">' + E(a.detail) + '</div>' : '') + (a.memo ? '<div style="font-size:12.5px;color:#475569">메모: ' + E(a.memo) + '</div>' : '') + '</td><td>' + E(UN[a.unit] || '') + (a.target ? ' · ' + E(a.target) : '') + '</td><td>' + E(a.owner) + '</td><td' + (overdue(a) ? ' style="color:#b91c1c;font-weight:700"' : '') + '>' + E(a.due || '') + (overdue(a) ? ' (경과)' : '') + '</td><td class="num">' + (cur != null ? cur.toFixed(2) : '-') + '</td>' + (AC.scope === 'all' ? '<td class="wrapcell" style="font-size:12.5px">' + E(a.survey_title || '') + (a.semester ? ' (' + E(a.semester) + ')' : '') + '</td>' : '') + '<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-ac="edit" data-id="' + a.id + '">수정</button><button class="btn btn-ghost btn-sm" data-ac="del" data-id="' + a.id + '">삭제</button></td></tr>'; }).join('') || '<tr><td colspan="8" class="t-empty">등록된 개선 과제가 없습니다. 「과제 추가」 또는 「리포트에서 가져오기」를 사용하십시오.</td></tr>') + '</tbody></table></div></div></div>';
    }
    draw();
    async function reload() { await load(); draw(); }
    box.onchange = async function (e) { var k = e.target.getAttribute('data-ac'); if (k === 'scope') { AC.scope = e.target.value; await reload(); } else if (k === 'status') { AC.status = e.target.value; draw(); } };
    box.oninput = function (e) { if (e.target.getAttribute('data-ac') === 'q') { AC.q = e.target.value; clearTimeout(AC._t); AC._t = setTimeout(function () { draw(); var n = box.querySelector('[data-ac=q]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 200); } };
    box.onclick = async function (e) {
      var t = e.target.closest('[data-ac]'); if (!t) return; var k = t.getAttribute('data-ac'), id = t.getAttribute('data-id'), a = AC.list.filter(function (x) { return x.id === id; })[0];
      if (k === 'add') modal(null, async function (o) { await save(o); await reload(); });
      else if (k === 'edit' && a) modal(a, async function (o) { await save(o, a.survey_id); await reload(); });
      else if (k === 'del' && a) { if (await A.confirm('개선 과제 삭제', '「' + E(a.title) + '」 과제를 목록에서 삭제합니다. (삭제 표시만 하며 복구할 수 있습니다)', '삭제', '취소', true)) { try { await A.rpc('svy_a_action_remove', { p_action_id: a.id }); await reload(); } catch (er) { A.toast(er.message || String(er), 'err'); } } }
      else if (k === 'imp') { await importFromReports(); await reload(); }
    };
  };
})();
