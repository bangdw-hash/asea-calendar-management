'use strict';
/**
 * aseasurvey-admin-slot.js — 문항 탭의 「AI 구간 설계」 · 「AI 자문」
 *  · 「AI 구간 설계」: 문항 사이 「＋」 줄을 눌러 위치(어느 문항 아래·위·사이)를 지정 → 요청 입력 → AI 제안을 검토·수정 → 반영
 *    - 한 곳을 고르면 그 자리에 새 문항을 추가, 같은 영역의 두 곳을 고르면 그 사이 문항을 「교체」하거나 「이어서 보완」합니다.
 *  · 「AI 자문」: 막히는 부분을 적으면 조언과, 구간 설계로 바로 이어갈 수 있는 제안을 줍니다.
 *  · 반영 후에는 기존 문항 편집기에서 그대로 수동 수정할 수 있고, 「방금 AI 반영 되돌리기」로 되돌릴 수 있습니다.
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico;
  var S = { pick: false, a: null, b: null, mode: 'add', prompt: '', n: '3', busy: '', err: '', box: null, undo: null };
  var Sl = A.slot = {};

  /* ───────────── 구조 요약 · 위치 ───────────── */
  function lists(d) { return [{ si: -1, list: d.basic || [], name: '기본 정보' }].concat((d.sections || []).map(function (s, i) { return { si: i, list: s.questions || [], name: '영역 ' + (i + 1) + ' 「' + (s.title || '제목 없음') + '」' }; })); }
  function listOf(d, si) { return si < 0 ? d.basic : d.sections[si].questions; }
  function structure(d) {
    return lists(d).map(function (g) {
      return '■ ' + g.name + (g.si >= 0 && d.sections[g.si].showIf ? ' (조건부 영역)' : '') + '\n' + (g.list.length ? g.list.map(function (q, i) { return '  ' + (i + 1) + '. [' + q.id + '] ' + SVY.typeLabel(q) + ' · ' + (q.type === 'block' ? (q.text || '(안내)') : (q.label || '(내용 없음)')) + (q.required ? ' (필수)' : '') + (q.options ? ' · 선택지: ' + q.options.map(function (o) { return o.label; }).join(' / ') : ''); }).join('\n') : '  (문항 없음)');
    }).join('\n');
  }
  function sel() {
    if (!S.a) return null; var d = A.ensureDef(), g = listOf(d, S.a.si), n = g.length;
    var lo = S.a.idx, hi = S.b ? S.b.idx : S.a.idx; if (lo > hi) { var t = lo; lo = hi; hi = t; }
    return { si: S.a.si, lo: lo, hi: hi, n: n, range: hi > lo, list: g };
  }
  function slotText(g, idx) {
    var n = g.length; if (!n) return '이 영역은 비어 있습니다 — 여기에 설계';
    if (idx === 0) return '맨 위 · ' + g[0].id + ' 위';
    if (idx === n) return g[n - 1].id + ' 아래 · 맨 끝';
    return g[idx - 1].id + ' 아래 · ' + g[idx].id + ' 위';
  }
  function zoneDesc(z, d) {
    var gname = lists(d).filter(function (g) { return g.si === z.si; })[0].name;
    if (!z.range) return gname + '의 ' + slotText(z.list, z.lo);
    return gname + '의 ' + (z.lo === 0 ? '맨 위' : z.list[z.lo - 1].id + ' 아래') + ' ~ ' + (z.hi === z.n ? '맨 끝' : z.list[z.hi].id + ' 위') + ' 사이 (문항 ' + (z.hi - z.lo) + '개: ' + z.list.slice(z.lo, z.hi).map(function (q) { return q.id; }).join(', ') + ')';
  }

  /* ───────────── 문항 탭 장식 ───────────── */
  var orig = A.tabs.questions;
  A.tabs.questions = function (box) { var r = orig.apply(this, arguments); S.box = box; decorate(box); return r; };
  Object.keys(orig).forEach(function (k) { A.tabs.questions[k] = orig[k]; });

  function decorate(box) {
    var root = box.querySelector('#qroot'); if (!root) return;
    var tools = document.createElement('div'); tools.className = 'aitools';
    tools.innerHTML = (S.pick ? '<div class="sp"><b>' + I('sparkle', 15) + ' AI 구간 설계 — 위치 선택 중</b><div class="muted" style="font-size:12.5px">문항 사이의 「＋」 줄을 누르십시오. 한 곳을 누르면 그 자리에 새로 추가하고, 같은 영역의 두 곳을 차례로 누르면 그 사이를 대상으로 합니다.</div></div><button class="btn btn-ghost btn-sm" data-act="sl-cancel">선택 종료</button>' :
      '<div class="sp"><b>' + I('sparkle', 15) + ' AI 도우미</b><div class="muted" style="font-size:12.5px">설문의 일부 구간만 AI에게 맡기거나, 막히는 부분을 상담할 수 있습니다.</div></div><button class="btn btn-primary btn-sm" data-act="sl-start">' + I('sparkle', 14) + ' AI 구간 설계</button><button class="btn btn-secondary btn-sm" data-act="sl-advice">AI 자문</button>' + (S.undo ? '<button class="btn btn-ghost btn-sm" data-act="sl-undo">방금 AI 반영 되돌리기</button>' : ''));
    root.parentNode.insertBefore(tools, root);
    if (!S.pick) { bar(); return; }
    var d = A.ensureDef(), z = sel();
    Array.from(root.querySelectorAll('.sec-card')).forEach(function (card) {
      var si = card.hasAttribute('data-s') ? Number(card.getAttribute('data-s')) : -1, list = listOf(d, si), cards = Array.from(card.children).filter(function (c) { return c.classList.contains('qcard') && c.hasAttribute('data-qid'); });
      var trail = Array.from(card.children).filter(function (c) { return c.classList.contains('qcard') && !c.hasAttribute('data-qid'); })[0];
      function mk(idx) {
        var el = document.createElement('div'), on = (S.a && S.a.si === si && S.a.idx === idx) || (S.b && S.b.si === si && S.b.idx === idx);
        el.className = 'aislot' + (on ? ' sel' : ''); el.setAttribute('data-act', 'sl-pick'); el.setAttribute('data-si', si); el.setAttribute('data-idx', idx);
        el.innerHTML = '<span>' + I('plus', 13) + ' ' + E(slotText(list, idx)) + '</span>'; return el;
      }
      cards.forEach(function (c, i) { card.insertBefore(mk(i), c); if (z && z.si === si && z.range && i >= z.lo && i < z.hi) c.classList.add('aizone'); });
      var last = mk(cards.length); if (trail) card.insertBefore(last, trail); else card.appendChild(last);
    });
    bar();
  }

  /* ───────────── 하단 입력 막대 ───────────── */
  function bar() {
    var el = document.getElementById('aibar');
    if (!S.pick || !S.box || !document.body.contains(S.box)) { if (el) el.remove(); return; }
    var d = A.ensureDef(), z = sel();
    if (!el) { el = document.createElement('div'); el.id = 'aibar'; el.className = 'aibar'; document.body.appendChild(el); }
    var y = document.getElementById('aip') ? document.getElementById('aip').scrollTop : 0;
    if (!z) { el.innerHTML = '<div class="sp"><b>위치를 선택해 주십시오</b><div class="muted" style="font-size:12.5px">위 문항 목록에서 「＋」 줄을 누르면 이곳에 설계 요청 칸이 나타납니다.</div></div>'; return; }
    if (!z.range && S.mode !== 'add') S.mode = 'add'; if (z.range && S.mode === 'add') S.mode = 'keep';
    el.innerHTML = '<div class="aibar-in"><div class="aibar-t"><b>대상 위치</b> ' + E(zoneDesc(z, d)) + '</div>' +
      (z.range ? '<div class="opts wide" id="slmode"><button type="button" class="opt" data-act="sl-mode" data-v="keep" aria-pressed="' + (S.mode === 'keep') + '">구간 문항은 유지하고 이어서 보완</button><button type="button" class="opt" data-act="sl-mode" data-v="replace" aria-pressed="' + (S.mode === 'replace') + '">구간 문항을 새로 설계해 교체</button></div>' : '') +
      '<div class="row" style="align-items:stretch"><textarea class="fld sp" id="aip" rows="2" placeholder="예) 시설 이용 만족도를 묻는 문항 3개를 5점 척도로, 마지막에 불편한 점을 묻는 서술 문항 1개">' + E(S.prompt) + '</textarea>' +
      '<div style="display:flex;flex-direction:column;gap:6px;min-width:150px"><select class="fld" id="ain"><option value="">개수: AI가 판단</option>' + [1, 2, 3, 4, 5, 6, 8, 10].map(function (n) { return '<option value="' + n + '"' + (S.n === String(n) ? ' selected' : '') + '>약 ' + n + '개</option>'; }).join('') + '</select><button class="btn btn-primary btn-sm" data-act="sl-run" ' + (S.busy ? 'disabled' : '') + '>' + I('sparkle', 14) + ' AI로 설계</button></div></div>' +
      '<div class="row" style="margin-top:6px"><button class="btn btn-ghost btn-sm" data-act="sl-advice">이 구간에 대해 AI 자문 받기</button><span class="sp"></span><button class="btn btn-ghost btn-sm" data-act="sl-cancel">선택 종료</button></div>' +
      (S.err ? '<div class="msg err" style="margin:6px 0 0">' + I('alert', 16) + '<div>' + E(S.err) + '</div></div>' : '') + (S.busy ? '<div class="loading" style="margin-top:6px">' + E(S.busy) + '</div>' : '') + '</div>';
    var ta = document.getElementById('aip'); if (ta) ta.scrollTop = y;
  }

  /* ───────────── AI 호출 ───────────── */
  function models() { return [(A.ext.aiModels[0] || [])[0]].concat(A.ext.aiModels.map(function (m) { return m[0]; })).filter(function (m, i, a) { return m && a.indexOf(m) === i; }); }
  async function ask(system, text) {
    var out = null, err, ms = models();
    for (var i = 0; i < ms.length && out == null; i++) { try { out = await A.ext.aiCall(system, [{ type: 'text', text: text }], ms[i]); } catch (e) { err = e; if (!(e.status === 404 || /model/i.test(e.message))) break; } }
    if (out == null) throw err;
    var s = String(out).trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim(), a = s.indexOf('{'); if (a > 0) s = s.slice(a);
    try { return JSON.parse(s); } catch (e) { var b = s.lastIndexOf('}'); if (b > 0) { try { return JSON.parse(s.slice(0, b + 1)); } catch (e2) {} } throw new Error('AI 응답을 해석하지 못했습니다. 다시 시도해 주십시오.'); }
  }
  var SYS_ZONE = '당신은 직업전문학교 교육운영팀의 설문 설계 전문가입니다. 이미 만들어진 설문의 「지정한 위치」에 들어갈 문항만 설계합니다. 관리자가 결과를 화면에서 검토·수정한 뒤 반영합니다.\n' +
    '출력은 JSON 객체 하나만 작성합니다(설명·코드펜스 금지): {"questions":[문항…],"advice":"설계 의도와 관리자가 확인할 점 2~3문장","notes":["불확실한 부분"]}\n' +
    '규칙:\n1. 문항은 아래 형식 정의를 따르며 id 는 새로 만들고 기존 문항 id 와 겹치지 않습니다.\n2. [현재 설문 구조]의 앞뒤 문항과 중복·모순되지 않게 합니다. 이미 있는 내용을 다시 묻지 않습니다.\n3. showIf 는 대상 위치보다 앞에 있는 문항만 참조할 수 있습니다. 꼭 필요한 경우에만 씁니다.\n4. 작업 방식이 「교체」이면 구간의 기존 문항을 대체할 새 문항 전체를, 「보완」이면 기존 문항을 유지한 채 이어서 들어갈 문항만, 「추가」이면 그 자리에 새로 들어갈 문항만 작성합니다.\n5. 설문 유형이 course(과목별 반복)이면 과목마다 응답하는 문항은 scope:"course", 한 번만 묻는 문항은 scope:"common" 입니다. general 이면 scope 를 쓰지 않습니다.\n6. 개인정보(이름·연락처 등)는 관리자 요청이 명시한 경우에만 묻고, 이때는 목적을 밝히는 안내를 문항 desc 에 적습니다.\n7. 요청에 문항 수가 있으면 따르고, 없으면 [필요 문항 수]를 따릅니다. 서술형은 꼭 필요한 곳에만 둡니다.\n8. 입력에 없는 사실을 지어내지 않습니다.\n\n';
  var SYS_ADV = '당신은 직업전문학교 교육운영팀의 설문 설계 자문가입니다. 관리자가 설문을 작성하다 막힌 부분에 대해 현재 설문 구조를 보고 실무적으로 조언합니다.\n출력은 JSON 객체 하나만 작성합니다(설명·코드펜스 금지): {"advice":"핵심 조언. 짧은 문단 또는 1) 2) 3) 번호 목록. 사실·해석·의견을 구분하고 단정하기 어려우면 그렇다고 밝힙니다","suggestions":[{"title":"제안 제목","why":"이유 한 줄","prompt":"이 구간 설계에 그대로 넣을 수 있는 요청문(문항 수·형식 포함)"}]}\n제안은 0~4개이며, 현재 설문과 겹치거나 막연한 제안은 하지 않습니다. 설문 구조에 없는 사실을 지어내지 않습니다.';
  function context(d, z) {
    return '[설문 유형] ' + (d.mode === 'general' ? 'general (1인 1회)' : 'course (과목별 반복)') + '\n[설문 제목] ' + ((d.intro && d.intro.title) || '(제목 없음)') + '\n[현재 설문 구조]\n' + structure(d) + (z ? '\n\n[대상 위치] ' + zoneDesc(z, d) : '');
  }

  /* ───────────── 문항 정리 · 반영 ───────────── */
  function normalize(raw, d, si) {
    var ids = {}; SVY.allQuestions(d).forEach(function (x) { ids[x.q.id] = 1; });
    var ctx = { ids: ids, basic: si < 0 }, out = [];
    (raw || []).slice(0, 20).forEach(function (q, i) { ctx.prefix = 'AI' + Date.now().toString(36).slice(-3).toUpperCase() + (i + 1); try { var nq = A.normalizeQuestion(q, d, ctx); if (nq && (nq.label || nq.type === 'block')) out.push(nq); } catch (e) {} });
    return out;
  }
  function apply(items, z, mode) {
    var d = A.ensureDef(), list = listOf(d, z.si); S.undo = JSON.stringify(d);
    var removed = 0; if (mode === 'replace' && z.range) { removed = z.hi - z.lo; list.splice(z.lo, removed); }
    var at = mode === 'keep' && z.range ? z.hi : z.lo; list.splice.apply(list, [at, 0].concat(items));
    var lint = A.lintDef(d); A.markDirty();
    if (S.box && document.body.contains(S.box)) { var y = window.scrollY; A.tabs.questions(S.box); window.scrollTo(0, y); if (A.afterTabsChange) A.afterTabsChange(); }
    A.toast('AI 설계 ' + items.length + '개를 반영했습니다.' + (removed ? ' (기존 ' + removed + '개 교체)' : '') + (lint.errs.length ? ' 점검 오류 ' + lint.errs.length + '건 — 문항 목록 위쪽에서 확인해 주십시오.' : ''), lint.errs.length ? 'err' : undefined);
  }

  /* ───────────── 제안 검토 창 ───────────── */
  function review(res, z, mode) {
    var d = A.ensureDef(), items = normalize(res.questions, d, z.si), scratch = {}, penv = { def: d, qmap: SVY.questionMap(d), getAns: function () { return scratch; }, getCommon: function () { return scratch; }, onChange: function () {}, toast: A.toast, counts: {}, seed: 1, busy: {} };
    if (!items.length) { S.err = 'AI가 사용할 수 있는 문항을 만들지 못했습니다. 요청을 바꿔 다시 시도해 주십시오.'; return bar(); }
    var CHOICE = { single: 1, multi: 1, ranking: 1 };
    function card(q, i) {
      return '<div class="rvq" data-i="' + i + '"><div class="row"><span class="tag blue">' + E(SVY.typeLabel(q)) + '</span><span class="qid">' + E(q.id) + '</span><span class="sp"></span><label class="chk" style="margin:0"><input type="checkbox" data-rf="required" ' + (q.required ? 'checked' : '') + (q.type === 'block' ? ' disabled' : '') + '> 필수</label><button class="btn btn-ghost btn-sm" data-act="rv-del" style="color:var(--red)" aria-label="삭제">' + I('trash', 13) + '</button></div>' +
        '<input class="fld" data-rf="label" value="' + E(q.type === 'block' ? q.text || '' : q.label || '') + '" placeholder="문항 문구">' + (CHOICE[q.type] && q.options ? '<textarea class="fld" data-rf="options" rows="' + Math.min(Math.max(q.options.length, 2), 7) + '" placeholder="선택지 (한 줄에 하나)">' + E(q.options.map(function (o) { return o.label; }).join('\n')) + '</textarea>' : '') +
        '<div class="rvpv" id="rvpv' + i + '"></div></div>';
    }
    A.modal('<h3>' + I('sparkle', 16) + ' AI 설계 제안 — 검토·수정 후 반영</h3><p class="muted" style="margin:2px 0 8px">' + E(zoneDesc(z, d)) + ' · 방식: ' + ({ add: '이 자리에 추가', keep: '구간 유지 + 이어서 보완', replace: '구간 문항 교체' }[mode]) + '</p>' +
      (res.advice ? '<div class="msg">' + I('info', 16) + '<div><b>AI 설명</b><br>' + E(res.advice) + '</div></div>' : '') + ((res.notes || []).length ? '<div class="msg warn">' + I('alert', 16) + '<div>' + res.notes.slice(0, 5).map(function (x) { return E(String(x)); }).join('<br>') + '</div></div>' : '') +
      (mode === 'replace' ? '<div class="msg warn">' + I('alert', 16) + '<div>반영하면 구간의 기존 문항 ' + (z.hi - z.lo) + '개가 삭제됩니다. 반영 직후 「방금 AI 반영 되돌리기」로 복원할 수 있습니다.</div></div>' : '') +
      '<div id="rvlist" style="max-height:52vh;overflow:auto;display:grid;gap:10px;margin-top:8px">' + items.map(card).join('') + '</div><div class="btn-row"><button class="btn btn-ghost" data-r="back">요청 수정하기</button><span class="sp"></span><button class="btn btn-ghost" data-r="0">취소</button><button class="btn btn-primary" data-r="ok" id="rvok">' + I('check', 16) + ' 반영 (' + items.length + '개)</button></div>', function (bg, close) {
      var root = bg.querySelector('#rvlist');
      function paint(i) { var q = items[i], el = bg.querySelector('#rvpv' + i); if (!el) return; el.innerHTML = SVY.Form.html(Object.assign({}, q, { showIf: undefined }), { def: d, a: scratch, c: scratch, scopeId: 'pv', counts: {}, seed: 1, busy: penv.busy, badge: null }); SVY.Form.attach(el, penv); if (el._initSigs) el._initSigs(); }
      items.forEach(function (q, i) { paint(i); });
      function cnt() { var n = items.filter(Boolean).length; bg.querySelector('#rvok').innerHTML = I('check', 16) + ' 반영 (' + n + '개)'; bg.querySelector('#rvok').disabled = !n; }
      root.addEventListener('input', function (e) {
        var c = e.target.closest('.rvq'); if (!c) return; var i = Number(c.getAttribute('data-i')), q = items[i], f = e.target.getAttribute('data-rf');
        if (f === 'label') { if (q.type === 'block') q.text = e.target.value; else q.label = e.target.value; }
        else if (f === 'options') { var old = q.options || [], used = {}; old.forEach(function (o) { used[o.id] = 1; }); q.options = e.target.value.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l, k) { var o = old[k] && old[k].label === l ? old[k] : Object.assign({}, old[k] || {}, { label: l }); if (!o.id) { var n = k + 1; while (used['o' + n]) n++; o.id = 'o' + n; used[o.id] = 1; } return o; }); }
        else return;
        clearTimeout(c._t); c._t = setTimeout(function () { paint(i); }, 250);
      });
      root.addEventListener('change', function (e) { var c = e.target.closest('.rvq'); if (!c || e.target.getAttribute('data-rf') !== 'required') return; items[Number(c.getAttribute('data-i'))].required = e.target.checked; });
      bg.addEventListener('click', function (e) {
        var del = e.target.closest('[data-act=rv-del]'); if (del) { var c = del.closest('.rvq'), i = Number(c.getAttribute('data-i')); items[i] = null; c.remove(); cnt(); return; }
        var b = e.target.closest('[data-r]'); if (!b) return; var r = b.getAttribute('data-r');
        if (r === '0') { close(); return; }
        if (r === 'back') { close(); return bar(); }
        var final = items.filter(Boolean); if (!final.length) return A.toast('반영할 문항이 없습니다.', 'err');
        var bad = final.filter(function (q) { return q.type !== 'block' && !String(q.label || '').trim(); }); if (bad.length) return A.toast('문구가 비어 있는 문항이 있습니다.', 'err');
        close(); S.pick = false; S.a = S.b = null; S.prompt = ''; apply(final, z, mode); bar();
      });
    }, 'xl');
  }

  /* ───────────── 자문 창 ───────────── */
  function adviceModal(z) {
    var d = A.ensureDef(), q0 = S.prompt || '';
    var m = A.modal('<h3>' + I('sparkle', 16) + ' AI 자문</h3><p class="muted" style="margin:2px 0 8px">' + (z ? '대상 위치: ' + E(zoneDesc(z, d)) : '현재 설문 전체를 보고 조언합니다.') + '</p><label class="f">막히는 부분이나 궁금한 점</label><textarea class="fld" id="advq" rows="3" placeholder="예) 학생 만족도를 묻고 싶은데 어떤 형식이 좋을지, 문항이 너무 많은지, 이 영역의 순서가 자연스러운지">' + E(q0) + '</textarea><div id="advres"></div><div class="btn-row"><button class="btn btn-ghost" data-r="0">닫기</button><button class="btn btn-primary" data-r="go" id="advgo">' + I('sparkle', 14) + ' 자문 받기</button></div>', function (bg, close) {
      bg.addEventListener('click', async function (e) {
        var sg = e.target.closest('[data-sg]'); if (sg) { var s = bg._sug[Number(sg.getAttribute('data-sg'))]; S.prompt = s.prompt || s.title; close(); return Sl.start(); }
        var b = e.target.closest('[data-r]'); if (!b) return; if (b.getAttribute('data-r') === '0') return close();
        var q = bg.querySelector('#advq').value.trim(); if (!q) return A.toast('궁금한 점을 입력해 주십시오.', 'err');
        var res = bg.querySelector('#advres'), btn = bg.querySelector('#advgo'); btn.disabled = true; res.innerHTML = '<div class="loading">AI가 설문 구조를 검토하는 중입니다…</div>';
        try {
          var j = await ask(SYS_ADV, context(d, z) + '\n\n[관리자 질문]\n' + q); bg._sug = (j.suggestions || []).slice(0, 4);
          res.innerHTML = '<div class="msg" style="margin-top:8px">' + I('info', 16) + '<div style="white-space:pre-line">' + E(String(j.advice || '조언을 만들지 못했습니다.')) + '</div></div>' + (bg._sug.length ? '<b style="font-size:13px">바로 설계로 이어갈 수 있는 제안</b>' + bg._sug.map(function (s, i) { return '<div class="sug"><div class="sp"><b>' + E(s.title || '') + '</b><div class="muted" style="font-size:12.5px">' + E(s.why || '') + '</div></div><button class="btn btn-secondary btn-sm" data-sg="' + i + '">이 요청으로 구간 설계</button></div>'; }).join('') : '');
        } catch (er) { res.innerHTML = '<div class="msg err">' + I('alert', 16) + '<div>' + E(er.message) + '</div></div>'; }
        btn.disabled = false;
      });
    }, 'wide');
    return m;
  }

  /* ───────────── 동작 ───────────── */
  Sl.start = function () { S.pick = true; S.a = S.b = null; S.err = ''; if (S.box && document.body.contains(S.box)) A.tabs.questions(S.box); };
  function stop() { S.pick = false; S.a = S.b = null; S.err = ''; if (S.box && document.body.contains(S.box)) A.tabs.questions(S.box); else bar(); }
  async function run() {
    var z = sel(), d = A.ensureDef(); if (!z) return; var p = (document.getElementById('aip') || {}).value || S.prompt; S.prompt = p;
    if (!p.trim()) { S.err = '설계 요청을 입력해 주십시오.'; return bar(); }
    S.err = ''; S.busy = 'AI가 이 구간의 문항을 설계하는 중입니다… (보통 15~60초)'; bar();
    var mode = z.range ? S.mode : 'add';
    try {
      var text = context(d, z) + '\n[작업 방식] ' + ({ add: '추가 (이 자리에 새 문항)', keep: '보완 (구간 문항 유지, 이어서 추가)', replace: '교체 (구간 문항을 새로 설계)' }[mode]) + '\n[필요 문항 수] ' + (S.n ? '약 ' + S.n + '개' : 'AI가 판단') + '\n[관리자 요청]\n' + p;
      var j = await ask(SYS_ZONE + (A.ext.aiParse && A.ext.aiParse.schema ? '[문항 형식 정의]\n' + A.ext.aiParse.schema.split('\n').filter(function (l) { return /^ ?(text|single|scale|grid|date|block)|^문항 공통|^선택지 값|^퀴즈 채점/.test(l) || /^ (text|single|scale|grid|date|block):/.test(l); }).join('\n') : ''), text);
      S.busy = ''; bar(); review(j, z, mode);
    } catch (er) { S.busy = ''; S.err = er.message; bar(); }
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t) return; var act = t.getAttribute('data-act');
    if (act.indexOf('sl-') !== 0) return;
    if (act === 'sl-start') return Sl.start();
    if (act === 'sl-cancel') return stop();
    if (act === 'sl-advice') return adviceModal(sel());
    if (act === 'sl-mode') { S.mode = t.getAttribute('data-v'); return bar(); }
    if (act === 'sl-run') return run();
    if (act === 'sl-undo') { if (!S.undo) return; A.work.def = JSON.parse(S.undo); S.undo = null; A.markDirty(); if (S.box && document.body.contains(S.box)) A.tabs.questions(S.box); A.toast('AI 반영 전 상태로 되돌렸습니다.'); return; }
    if (act === 'sl-pick') {
      var p = { si: Number(t.getAttribute('data-si')), idx: Number(t.getAttribute('data-idx')) };
      if (!S.a || (S.a && S.b)) { S.a = p; S.b = null; }
      else if (S.a.si === p.si && S.a.idx === p.idx) { S.a = null; }
      else if (S.a.si !== p.si) { A.toast('구간은 같은 영역 안에서만 지정할 수 있습니다. 새 위치로 다시 선택합니다.'); S.a = p; S.b = null; }
      else S.b = p;
      var y = window.scrollY; if (S.box && document.body.contains(S.box)) A.tabs.questions(S.box); window.scrollTo(0, y);
    }
  });
  document.addEventListener('input', function (e) { if (e.target.id === 'aip') S.prompt = e.target.value; });
  document.addEventListener('change', function (e) { if (e.target.id === 'ain') S.n = e.target.value; });
  window.addEventListener('hashchange', function () { if (!/\/questions/.test(location.hash)) { S.pick = false; S.a = S.b = null; S.undo = null; var el = document.getElementById('aibar'); if (el) el.remove(); } });
})();
