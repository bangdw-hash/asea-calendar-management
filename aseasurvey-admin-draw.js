'use strict';
/**
 * aseasurvey-admin-draw.js — 추첨·수령 탭 (성실도 가중 추첨)
 *  · 기준: 입력 체류 시간 · 성실응답 점검 · 서술형 작성량으로 가중치 산정, 너무 빠른 응답/점검 실패는 자격 제외
 *  · 미리보기와 실제 추첨은 서버(svy.draw_pool) 한 곳의 계산을 사용 → 항상 같은 기준
 *  · 재추첨은 새 회차로 누적(이력 보존) → 공개할 회차 선택 → 같은 링크가 결과 확인 화면으로 전환
 *  · 현장 수령: 번호 조회 → 수령 처리(이중 수령 방지)
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico;
  var DEF = { n: 10, max_fail: 0, no_straight: true, min_sec_per_course: 30, good_sec_per_course: 120, min_text: 0, text_good: 100, w_base: 1, w_time: 2, w_text: 3 };
  var S = A.ext.dr = { prev: null, excl: '', fl: 'all', more: 1, loading: false, claim: null };
  function cfg() { return Object.assign({}, DEF, { max_fail: SVY.maxFail((A.cur && A.cur.survey && A.cur.survey.def) || {}) }, (A.work && A.work.draw_cfg) || {}); }
  function exclList() { return String(S.excl || '').split(/[\s,;]+/).filter(Boolean); }
  async function refreshDraws() { await A.refresh(); }

  async function loadPreview(box) {
    S.loading = true; var el = box.querySelector('#dpv'); if (el) el.innerHTML = '<div class="loading">계산 중…</div>';
    try { S.prev = await A.rpc('svy_a_draw_preview', { p_id: A.cur.survey.id, p_criteria: cfg(), p_exclude: exclList() }); }
    catch (e) { S.prev = null; if (el) el.innerHTML = '<div class="msg err">' + I('alert', 18) + '<div>' + E(e.message) + '</div></div>'; S.loading = false; return; }
    S.loading = false; drawPreview(box);
  }
  function drawPreview(box) {
    var el = box.querySelector('#dpv'), P = S.prev; if (!el || !P) return;
    var rs = Object.keys(P.reasons || {});
    var rows = P.rows.filter(function (r) { return S.fl === 'all' || (S.fl === 'ok' ? r.eligible : !r.eligible); });
    var avg = P.eligible ? P.weight_sum / P.eligible : 0;
    el.innerHTML = '<div class="kpis"><div class="kpi"><div class="l">전체 응답</div><div class="v">' + P.total + '</div></div><div class="kpi"><div class="l">추첨 자격</div><div class="v">' + P.eligible + '</div><div class="s">추첨 후보 풀</div></div>' +
      '<div class="kpi"><div class="l">제외</div><div class="v">' + (P.total - P.eligible) + '</div><div class="s">' + (rs.length ? rs.map(function (k) { return E(k) + ' ' + P.reasons[k]; }).join(' · ') : '사유 없음') + '</div></div><div class="kpi"><div class="l">평균 가중치</div><div class="v">' + avg.toFixed(2) + '</div><div class="s">1.00 = 기본</div></div></div>' +
      '<div class="row" style="margin-bottom:8px"><select class="fld" id="dfl" style="width:170px"><option value="all"' + (S.fl === 'all' ? ' selected' : '') + '>전체 보기</option><option value="ok"' + (S.fl === 'ok' ? ' selected' : '') + '>자격자만</option><option value="no"' + (S.fl === 'no' ? ' selected' : '') + '>제외된 응답만</option></select><span class="muted" style="font-size:12px">가중치 높은 순 · 당첨 확률은 1명 추첨 시 기준(응답 가중치 ÷ 자격자 가중치 합)입니다.</span></div>' +
      '<div class="tbl-wrap"><table class="t"><thead><tr><th>추첨번호</th><th>계열·학년·반</th><th class="num">입력 시간</th><th class="num">과목당(초)</th><th class="num">점검 실패</th><th>직선</th><th class="num">서술(자)</th><th class="num">시간점수</th><th class="num">서술점수</th><th class="num">가중치</th><th class="num">당첨 확률</th><th>상태</th></tr></thead><tbody>' +
      (rows.slice(0, S.more * 100).map(function (r) { return '<tr' + (r.eligible ? '' : ' style="opacity:.6"') + '><td><span class="ticket-chip">' + E(r.ticket) + '</span></td><td>' + E(r.track + ' ' + r.grade + ' ' + r.klass) + '</td><td class="num">' + Math.floor(r.duration / 60) + ':' + ('0' + r.duration % 60).slice(-2) + '</td><td class="num">' + Math.round(r.spc) + '</td><td class="num">' + r.attn_fail + '</td><td>' + (r.straight ? '동일' : '-') + '</td><td class="num">' + r.text_len + '</td><td class="num">' + Number(r.time_score).toFixed(2) + '</td><td class="num">' + Number(r.text_score).toFixed(2) + '</td><td class="num"><b>' + Number(r.weight).toFixed(2) + '</b></td><td class="num">' + (r.eligible ? r.prob + '%' : '-') + '</td><td>' + (r.eligible ? '<span class="badge badge-green">자격</span>' : '<span class="badge badge-red">' + E(r.reason) + '</span>') + '</td></tr>'; }).join('') || '<tr><td colspan="12" class="t-empty">응답이 없습니다.</td></tr>') + '</tbody></table></div>' +
      (rows.length > S.more * 100 ? '<div class="row" style="margin-top:8px"><button class="btn btn-ghost btn-sm" data-act="dmore">더 보기 (' + (rows.length - S.more * 100) + '건 남음)</button></div>' : '');
  }
  function field(k, label, hint, type) {
    var v = cfg()[k];
    if (type === 'check') return '<div><label class="f">&nbsp;</label><label class="chk"><input type="checkbox" data-cfg="' + k + '" ' + (v ? 'checked' : '') + '> ' + E(label) + '</label>' + (hint ? '<div class="hint">' + E(hint) + '</div>' : '') + '</div>';
    return '<div><label class="f">' + E(label) + '</label><input class="fld" type="number" min="0" step="' + (type === 'dec' ? '0.1' : '1') + '" data-cfg="' + k + '" value="' + v + '">' + (hint ? '<div class="hint">' + E(hint) + '</div>' : '') + '</div>';
  }
  function drawCard(d, claimed) {
    var tk = d.tickets || [];
    return '<div class="drawcard ' + (d.published ? 'pub' : '') + '" data-d="' + d.id + '"><div class="row"><b>회차 #' + d.id + '</b>' + (d.published ? '<span class="badge badge-green">' + I('eye', 13) + ' 공개 중</span>' : '<span class="badge badge-gray">비공개</span>') + '<span class="muted" style="font-size:12px">' + A.fmt(d.created_at) + ' · 목표 ' + d.n + '명 · 후보 풀 ' + d.pool_size + '명' + (d.note ? ' · ' + E(d.note) : '') + '</span><span class="sp"></span>' +
      '<button class="btn btn-ghost btn-sm" data-act="dcopy">번호 복사</button><button class="btn btn-ghost btn-sm" data-act="dedit">수동 편집</button><button class="btn btn-ghost btn-sm" data-act="dcrit">기준</button>' +
      (d.published ? '<button class="btn btn-secondary btn-sm" data-act="dpub" data-v="0">공개 해제</button>' : '<button class="btn btn-primary btn-sm" data-act="dpub" data-v="1">이 회차 공개</button><button class="btn btn-ghost btn-sm" data-act="ddel" style="color:var(--red)">삭제</button>') + '</div>' +
      '<div style="margin-top:8px">' + (tk.length ? tk.map(function (t) { return '<span class="ticket-chip' + (claimed[t] ? ' claimed' : '') + '" title="' + (claimed[t] ? '수령 ' + A.fmt(claimed[t]) : '미수령') + '">' + E(t) + '</span>'; }).join('') : '<span class="muted">당첨 번호가 없습니다. (후보 풀이 비어 있을 수 있습니다)</span>') + '</div></div>';
  }
  function claimPanel(box) {
    var pub = (A.cur.draws || []).filter(function (d) { return d.published; })[0], cl = A.cur.claims || [], won = pub ? pub.tickets.length : 0, c = S.claim;
    var st = !c ? '' : ({ won: '<div class="msg ok">' + I('check', 18) + '<div><b>당첨 번호입니다.</b> ' + (c.claimed ? '이미 수령 처리되었습니다 (' + A.fmt(c.claimed_at) + (c.memo ? ' · ' + E(c.memo) : '') + ')' : '아직 수령하지 않았습니다.') + '</div></div>', lost: '<div class="msg">' + I('info', 18) + '<div>당첨되지 않은 번호입니다.</div></div>', unknown: '<div class="msg err">' + I('alert', 18) + '<div>존재하지 않는 추첨번호입니다.</div></div>', invalid: '<div class="msg err">' + I('alert', 18) + '<div>번호 형식이 올바르지 않습니다. (예: ABCD-2345)</div></div>', no_published_draw: '<div class="msg warn">' + I('alert', 18) + '<div>공개된 추첨 회차가 없습니다. 회차를 먼저 공개해 주십시오.</div></div>' }[c.state] || '');
    return '<div class="panel"><h3>' + I('gift', 16) + ' 현장 수령 확인</h3><p class="panel-sub">학생이 제시한 추첨번호를 입력하면 당첨·수령 여부를 확인하고 수령 처리할 수 있습니다. 공개된 회차의 당첨 번호만 처리됩니다.</p>' +
      '<div class="row"><input class="fld" id="ct" style="width:200px;text-transform:uppercase;letter-spacing:.1em;font-weight:700" placeholder="ABCD-2345" maxlength="9"><button class="btn btn-primary btn-sm" data-act="cck">조회</button><span class="sp"></span><span class="badge badge-blue">수령 ' + cl.length + ' / 당첨 ' + won + '</span></div>' + st +
      (c && c.state === 'won' ? '<div class="row" style="margin-top:8px"><input class="fld" id="cm" style="flex:1" placeholder="메모 (예: 확인 방법, 수령자 반)" value="' + E(c.memo || '') + '">' + (c.claimed ? '<button class="btn btn-ghost" data-act="cset" data-v="0">수령 취소</button>' : '<button class="btn btn-primary" data-act="cset" data-v="1">수령 처리</button>') + '</div>' : '') +
      (cl.length ? '<div class="tbl-wrap" style="margin-top:12px;max-height:240px"><table class="t"><thead><tr><th>추첨번호</th><th>수령 일시</th><th>메모</th></tr></thead><tbody>' + cl.slice().sort(function (a, b) { return a.claimed_at < b.claimed_at ? 1 : -1; }).map(function (x) { return '<tr><td><span class="ticket-chip claimed">' + E(x.ticket) + '</span></td><td>' + A.fmt(x.claimed_at) + '</td><td class="wrapcell">' + E(x.memo) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') + '</div>';
  }

  A.tabs.draw = function (box) {
    var draws = A.cur.draws || [], claimed = {}; (A.cur.claims || []).forEach(function (c) { claimed[c.ticket] = c.claimed_at; });
    box.innerHTML = '<div class="grid g2"><div>' +
      '<div class="panel"><h3>추첨 기준 (성실도 가중)</h3><p class="panel-sub">입력 체류 시간, 성실응답 점검, 서술형 작성량이 높을수록 당첨 가능성이 높아지고, 너무 빠르거나 점검에 실패한 응답은 추첨에서 제외됩니다. 설정은 우측 상단 「저장」으로 설문에 보관되며, 복제 시 함께 복사됩니다.</p>' +
      '<div class="grid g2">' + field('n', '추첨 인원(명)', '대외 비공개') + field('max_fail', '점검 실패 허용 횟수', '0 = 점검 문항을 모두 맞춰야 자격') + field('min_sec_per_course', '최소 입력 시간 (과목당 초)', '이보다 빠르면 제외') + field('good_sec_per_course', '충분한 입력 시간 (과목당 초)', '이상이면 시간 점수 만점') + field('min_text', '최소 서술형 글자 수', '0 = 제한 없음(자격 조건)') + field('text_good', '충분한 서술형 글자 수', '이상이면 서술 점수 만점') + '</div>' +
      '<div class="grid g3" style="margin-top:4px">' + field('w_base', '기본 가중치', '모든 자격자 공통', 'dec') + field('w_time', '시간 가중', '시간 점수에 곱함', 'dec') + field('w_text', '서술 가중', '서술 점수에 곱함', 'dec') + '</div>' + field('no_straight', '전 문항 동일 응답 제외', '', 'check') +
      '<div class="msg" style="margin-top:10px">' + I('info', 18) + '<div style="font-size:12.5px">가중치 = 기본 + <b>시간점수</b>×시간가중 + <b>서술점수</b>×서술가중 (점수는 0~1). 현재 설정에서는 가중치가 <b>' + cfg().w_base + ' ~ ' + (cfg().w_base + cfg().w_time + cfg().w_text) + '</b> 범위이며, 모두 충분히 한 응답은 최소 응답보다 최대 <b>' + ((cfg().w_base + cfg().w_time + cfg().w_text) / cfg().w_base).toFixed(1) + '배</b> 당첨되기 쉽습니다. 추첨은 가중치 비례 무작위 추출입니다.</div></div>' +
      '<label class="f">추첨에서 제외할 번호 (공백·줄바꿈으로 구분)</label><textarea class="fld" id="dex" rows="2">' + E(S.excl) + '</textarea>' +
      '<div class="row" style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-act="dreset">기본값으로</button><span class="sp"></span><button class="btn btn-secondary btn-sm" data-act="dprev">미리보기 갱신</button><button class="btn btn-primary" data-act="drun">' + I('trophy', 16) + ' 추첨 실행</button></div></div>' +
      '<div class="panel"><h3>결과 공개 설정</h3><p class="panel-sub">공개된 회차가 있고 아래 일시가 되면, 학생 설문 링크가 입력 화면 대신 <b>추첨 결과 확인 화면</b>으로 바뀝니다. (학생이 추첨번호를 입력해 확인 · 당첨자 목록과 총 인원은 공개되지 않습니다.)</p>' +
      '<label class="f">결과 공개 시작 일시</label><div class="row"><input class="fld" style="width:240px" type="datetime-local" data-path="result_from" data-dt="1"><button class="btn btn-ghost btn-sm" data-act="dnow">지금으로 설정</button><button class="btn btn-ghost btn-sm" data-act="dclr">해제</button></div>' +
      '<label class="f">당첨 안내 문구 (수령 장소·시간·지참 사항)</label><textarea class="fld" rows="4" data-path="draw_msg" placeholder="예: 본관 1층 교무실에서 신분증과 함께 수령해 주십시오. (수령 기한: 10월 31일까지)"></textarea>' +
      '<div class="row" style="margin-top:10px"><button class="btn btn-primary btn-sm" data-act="dsavepub">공개 설정만 저장</button><span class="hint">우측 상단 「저장」과 동일하게 반영되며, 문항은 건드리지 않습니다.</span></div></div>' +
      '</div><div>' + claimPanel(box) +
      '<div class="panel"><div class="row"><h3 class="sp" style="margin:0">추첨 이력 · 결과 (' + draws.length + '회)</h3></div><p class="panel-sub">재추첨하면 새 회차가 추가되고 이전 회차는 이력으로 남습니다. 공개할 회차를 선택해 주십시오.</p>' + (draws.length ? draws.map(function (d) { return drawCard(d, claimed); }).join('') : '<div class="t-empty">아직 추첨하지 않았습니다.</div>') + '</div></div></div>' +
      '<div class="panel" style="margin-top:14px"><h3>추첨 대상 미리보기 · 성실도 분석</h3><div id="dpv"><div class="loading">계산 중…</div></div></div>';
    // 입력 바인딩
    A.bindPaths(box);
    box.oninput = function (e) {
      var k = e.target.getAttribute('data-cfg');
      if (k) { var w = A.work.draw_cfg = A.work.draw_cfg || {}; w[k] = e.target.type === 'checkbox' ? e.target.checked : (e.target.value === '' ? 0 : Number(e.target.value)); A.markDirty(); }
      else if (e.target.id === 'dex') S.excl = e.target.value;
      else if (e.target.id === 'ct') e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    };
    box.onchange = function (e) { if (e.target.id === 'dfl') { S.fl = e.target.value; S.more = 1; drawPreview(box); } if (e.target.getAttribute('data-cfg') != null) { A.tabs.draw._soft(box); } };
    box.onclick = async function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return; var act = t.getAttribute('data-act'), card = t.closest('[data-d]'), did = card ? Number(card.getAttribute('data-d')) : 0;
      var d = card ? (A.cur.draws || []).filter(function (x) { return x.id === did; })[0] : null;
      try {
        if (act === 'dprev') loadPreview(box);
        else if (act === 'dmore') { S.more++; drawPreview(box); }
        else if (act === 'dreset') { A.work.draw_cfg = {}; A.markDirty(); A.tabs.draw(box); }
        else if (act === 'dnow') { A.work.result_from = new Date().toISOString(); A.markDirty(); A.tabs.draw(box); }
        else if (act === 'dclr') { A.work.result_from = null; A.markDirty(); A.tabs.draw(box); }
        else if (act === 'dsavepub') { await A.rpc('svy_a_save', { p_id: A.cur.survey.id, p_patch: { result_from: A.work.result_from || '', draw_msg: A.work.draw_msg || '' } }); await A.refresh(); A.cur.survey.result_from = A.work.result_from; A.snap = JSON.stringify(A.work); A.toast('공개 설정을 저장했습니다.'); A.renderSurvey(); }
        else if (act === 'drun') {
          var c = cfg(), P = S.prev; if (!P) { await loadPreview(box); P = S.prev; } if (!P) return;
          if (!P.eligible) return A.toast('추첨 자격이 있는 응답이 없습니다. 기준을 확인해 주십시오.', 'err');
          var note = ''; var had = (A.cur.draws || []).length;
          var ok = await A.confirm(had ? '재추첨' : '추첨 실행', '자격 ' + P.eligible + '명 중 <b>' + Math.min(c.n, P.eligible) + '명</b>을 성실도 가중치로 추첨합니다.' + (had ? '<br>이전 회차 ' + had + '개는 이력으로 남고, 새 회차는 <b>비공개</b>로 생성됩니다.' : '<br>결과는 비공개 회차로 먼저 생성되며, 확인 후 공개할 수 있습니다.') + (A.isDirty() ? '<br><span style="color:var(--amber)">저장하지 않은 기준 변경은 이번 추첨에 반영되지만 설문에는 저장되지 않았습니다.</span>' : ''), '추첨', '취소');
          if (!ok) return;
          var r = await A.rpc('svy_a_draw', { p_id: A.cur.survey.id, p_n: c.n, p_criteria: c, p_exclude: exclList(), p_note: had ? '재추첨' : '' });
          await A.refresh(); A.toast('추첨했습니다. (회차 #' + r.id + ' · ' + r.tickets.length + '명)'); A.renderSurvey();
        }
        else if (act === 'dcopy') A.copy(d.tickets.join('\n'), '당첨 번호 ' + d.tickets.length + '개를 복사했습니다.');
        else if (act === 'dcrit') { var cr = d.criteria || {}; A.modal('<h3>회차 #' + d.id + ' 추첨 기준</h3><pre class="code">' + E(JSON.stringify(cr, null, 2)) + '</pre><div class="btn-row"><button class="btn btn-primary" data-r="1">닫기</button></div>', function (bg, close) { bg.addEventListener('click', function (ev) { if (ev.target.closest('[data-r]')) close(); }); }); }
        else if (act === 'dedit') {
          A.modal('<h3>회차 #' + d.id + ' 당첨 번호 수동 편집</h3><p class="muted">한 줄에 하나씩 입력합니다. 존재하는 응답의 추첨번호만 등록할 수 있습니다.' + (d.published ? '<br><b style="color:var(--red)">현재 공개 중인 회차입니다. 변경 즉시 학생 화면에 반영됩니다.</b>' : '') + '</p><textarea id="te" class="fld" rows="10">' + E(d.tickets.join('\n')) + '</textarea><div class="btn-row"><button class="btn btn-ghost" data-r="0">취소</button><button class="btn btn-primary" data-r="1">저장</button></div>', function (bg, close) {
            bg.addEventListener('click', async function (ev) { var b = ev.target.closest('[data-r]'); if (!b) return; if (b.getAttribute('data-r') === '0') return close(); try { await A.rpc('svy_a_draw_edit', { p_draw_id: d.id, p_tickets: bg.querySelector('#te').value.split(/[\s,;]+/).filter(Boolean) }); close(); await A.refresh(); A.renderSurvey(); A.toast('수정했습니다.'); } catch (er) { A.toast(er.message, 'err'); } });
          });
        }
        else if (act === 'dpub') {
          var pubv = t.getAttribute('data-v') === '1';
          var ok2 = await A.confirm(pubv ? '이 회차 공개' : '공개 해제', pubv ? '회차 #' + d.id + '(' + d.tickets.length + '명)를 공개합니다. 「결과 공개 시작 일시」가 지나면 학생 링크가 결과 확인 화면으로 바뀝니다.' + (A.cur.survey.result_from ? '' : '<br><span style="color:var(--amber)">결과 공개 시작 일시가 아직 설정되지 않았습니다.</span>') : '공개를 해제하면 학생 링크가 다시 이전 상태(응답/마감 화면)로 돌아갑니다.', pubv ? '공개' : '해제', '취소');
          if (!ok2) return; await A.rpc('svy_a_draw_publish', { p_draw_id: d.id, p_publish: pubv }); await A.refresh(); A.renderSurvey(); A.toast(pubv ? '공개했습니다.' : '공개를 해제했습니다.');
        }
        else if (act === 'ddel') { if (await A.confirm('회차 삭제', '회차 #' + d.id + '를 삭제합니다.', '삭제', '취소', true)) { await A.rpc('svy_a_draw_delete', { p_draw_id: d.id }); await A.refresh(); A.renderSurvey(); } }
        else if (act === 'cck') { var tk = box.querySelector('#ct').value; S.claim = await A.rpc('svy_a_claim_check', { p_id: A.cur.survey.id, p_ticket: tk }); S.claim.ticket = S.claim.ticket || tk; A.tabs.draw._claim(box); }
        else if (act === 'cset') { var on = t.getAttribute('data-v') === '1'; await A.rpc('svy_a_claim_set', { p_id: A.cur.survey.id, p_ticket: S.claim.ticket, p_claimed: on, p_memo: (box.querySelector('#cm') || {}).value || '' }); await A.refresh(); S.claim = await A.rpc('svy_a_claim_check', { p_id: A.cur.survey.id, p_ticket: S.claim.ticket }); A.toast(on ? '수령 처리했습니다.' : '수령을 취소했습니다.'); A.renderSurvey(); }
      } catch (er) { A.toast(er.message, 'err'); }
    };
    box.onkeydown = function (e) { if (e.key === 'Enter' && e.target.id === 'ct') box.querySelector('[data-act=cck]').click(); };
    if (S.prev && S.sid === A.cur.survey.id) drawPreview(box); else { S.sid = A.cur.survey.id; S.prev = null; loadPreview(box); }
  };
  // 입력창 포커스를 잃지 않고 설명 문구만 갱신
  A.tabs.draw._soft = function (box) { clearTimeout(A._dsoft); A._dsoft = setTimeout(function () { S.prev = null; loadPreview(box); }, 500); };
  A.tabs.draw._claim = function (box) { var p = box.querySelector('#ct'); var v = p ? p.value : ''; A.tabs.draw(box); var q = box.querySelector('#ct'); if (q) q.value = v; };
})();
