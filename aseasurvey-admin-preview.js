'use strict';
/**
 * aseasurvey-admin-preview.js — 모든 관리자 화면에서 쓰는 실시간 학생 화면 미리보기
 *  · 오른쪽 도크(버튼으로 열기/닫기): 설문 편집(개요·안내문·문항·과목·디자인·결과·추첨·버전·AI)과 AI 설계(제안 확인), 새 설문 만들기(기본 양식·이전 설문 불러오기) 모두에서 동작
 *  · 입력할 때마다 즉시 반영되고, 편집 중인 문항·영역·설정 위치로 미리보기 쪽이 자동 이동합니다.
 *  · 실제 학생 화면과 같은 렌더러(SVY.Form)를 사용하며, 눌러서 입력해 볼 수 있습니다(저장되지 않음).
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico;
  var P = A.pv = { open: false, page: 'intro', focus: '', scratch: {}, timer: 0, modal: null, tick: 0 };
  try { var saved = localStorage.getItem('svya_pv'); P.open = saved == null ? window.innerWidth >= 1280 : saved === '1'; } catch (e) { P.open = window.innerWidth >= 1280; }
  var env = { busy: {}, toast: function (m) { A.toast(m); }, counts: {}, seed: 1, onChange: function () {}, getAns: function () { return P.scratch; }, getCommon: function () { return P.scratch; } };

  /* ───────────── 미리보기 대상(source) ───────────── */
  function source() {
    if (P.modal) return P.modal;
    var ai = A.ext && A.ext.ai;
    if ((A.view === 'ai-create' || (A.view === 'survey' && A.tab === 'ai')) && ai && ai.step === 'review' && ai.p) return { def: ai.p.def, why: ai.p.why, label: 'AI 제안', courses: [] };
    if (A.view === 'survey' && A.work && A.work.def) return { def: A.work.def, theme: A.work.theme, courses: (A.cur && A.cur.courses) || [], title: A.work.title, test: A.work.test_mode, label: '현재 설문' };
    return null;
  }
  function fullDef(d) { d = d || {}; return Object.assign({ intro: {}, scales: window.SVY_TEMPLATE.def.scales, basic: [], sections: [] }, d, { basic: d.basic || [], sections: d.sections || [], intro: d.intro || {} }); }

  /* ───────────── 쪽(page) 구성 ───────────── */
  function pagesOf(d) {
    var gen = d.mode === 'general', l = [{ k: 'intro', n: '안내' }];
    if (!gen) l.push({ k: 'basic', n: '반 선택·기본 정보' }); else if ((d.basic || []).length) l.push({ k: 'basic', n: '기본 정보' });
    (d.sections || []).forEach(function (s, i) { l.push({ k: 's' + i, n: s.title || '영역 ' + (i + 1), s: s, i: i }); });
    l.push({ k: 'done', n: '제출 완료' });
    return l;
  }
  function locate(d, qid) {
    if ((d.basic || []).some(function (q) { return q.id === qid; })) return 'basic';
    var r = null; (d.sections || []).forEach(function (s, i) { if ((s.questions || []).some(function (q) { return q.id === qid; })) r = 's' + i; }); return r;
  }
  function condBadge(c) { return c ? '<span class="tag">조건부</span> ' : ''; }

  /* ───────────── 화면 조각 ───────────── */
  function frame(inner, theme, note) {
    var v = SVY.themeVars(theme || {}), style = Object.keys(v).map(function (k) { return k + ':' + v[k]; }).join(';');
    return '<div class="phone"><div class="preview pvscroll" style="' + style + '"><div class="hdr"><div class="hdr-in"><img class="logo" src="aseasurvey-logo.png" alt=""></div></div>' + (note || '') + '<div style="padding:12px">' + inner + '</div></div></div>';
  }
  function qhtml(q, d, why) {
    var cap = '<div class="aicap"><span class="tag blue">' + E(SVY.typeLabel(q)) + '</span>' + (q.showIf ? ' <span class="tag">조건부</span>' : '') + (q.answer != null ? ' <span class="tag">정답 ' + (q.points || 1) + '점</span>' : '') + (why && why[q.id] ? ' <span class="muted">' + E(why[q.id]) + '</span>' : '') + '</div>';
    return SVY.Form.html(Object.assign({}, q, { showIf: undefined }), { def: d, a: P.scratch, c: P.scratch, scopeId: 'pv', counts: {}, seed: 1, busy: env.busy, badge: null, nudge: (d.intro && d.intro.textNudge) || '' }) + cap;
  }
  function doneHtml(d, src) {
    var f = d.features || {}, i = d.intro || {}, gen = d.mode === 'general', tk = f.ticket != null ? !!f.ticket : !gen, af = f.after || {}, h = '';
    h += '<div class="card center"><div class="okmark">' + I('check', 32) + '</div><h1 class="title">제출이 완료되었습니다</h1><p class="muted" style="margin:8px 0 0">' + E(i.doneNote || '설문에 응해 주셔서 감사합니다.') + '</p>';
    if (d.quiz && d.quiz.show === 'score') h += '<div class="scorecard"><small>퀴즈 점수</small><div class="score-num"><b>8</b> / 10점</div><div class="meter"><i style="width:80%"></i></div>' + (d.quiz.passScore != null ? '<div class="hint" style="margin-top:6px">통과 (기준 ' + E(d.quiz.passScore) + '점)</div>' : '') + '</div>';
    if ((af.type === 'link' || af.type === 'both') && af.url) h += '<div class="btn-row" style="justify-content:center"><span class="btn btn-secondary">' + I('link', 16) + ' ' + E(af.label || '안내 보기') + '</span></div>';
    if (af.type === 'receipt' || af.type === 'both') h += '<div class="btn-row" style="justify-content:center"><span class="btn btn-secondary">' + I('download', 16) + ' 참여 확인서 저장</span></div>';
    if (tk) h += '<div class="ticket"><small>내 추첨번호</small><div class="ticket-code">ABCD-2345</div></div>' + (i.drawNotice ? '<div class="msg">' + I('info', 18) + '<div style="text-align:left">' + E(i.drawNotice) + '</div></div>' : '');
    if (f.edit) h += '<div class="msg">' + I('info', 18) + '<div style="text-align:left">' + (Number(f.edit.hours) > 0 ? '제출 후 ' + f.edit.hours + '시간 이내에' : '설문이 마감되기 전까지') + ' 같은 기기에서 응답을 수정할 수 있습니다.</div></div><div class="btn-row" style="justify-content:center"><span class="btn btn-secondary">' + I('edit', 16) + ' 응답 수정하기</span></div>';
    return h + '</div>';
  }
  function introHtml(d, theme) {
    var i = d.intro || {}, lim = d.limit && SVY.num(d.limit.max);
    var inner = '<div class="card"><div class="kicker">' + E(i.subtitle || '') + '</div><h2 class="title" style="font-size:20px">' + E(i.title || '(제목)') + '</h2><div class="org">' + E(i.org || '') + '</div>' +
      (i.rewardText ? '<div class="reward">' + I('gift', 22) + '<div><b>참여 안내</b><br>' + E(i.rewardText) + (i.drawGuide ? '<div class="hint" style="margin-top:8px;color:var(--text)">' + E(i.drawGuide) + '</div>' : '') + '</div></div>' : '') +
      ((i.notice || []).length ? '<dl class="notice">' + i.notice.map(function (n) { return '<div><dt>' + E(n.k) + '</dt><dd>' + E(n.v) + '</dd></div>'; }).join('') + '</dl>' : '') + (i.timeNote ? '<div class="timenote">' + I('info', 16) + E(i.timeNote) + '</div>' : '') +
      (lim ? '<div class="timenote">' + I('users', 16) + '선착순 ' + lim + '명 · 현재 0명 참여</div>' : '') + (d.identity === 'named' ? '<div class="timenote">' + I('info', 16) + '기명 설문입니다. 이름·소속과 개인정보 동의가 필요합니다.</div>' : '') +
      '<div class="btn-row"><span class="btn btn-primary">' + E(i.startLabel || '설문 시작하기') + ' ' + I('right', 16) + '</span></div></div>';
    return inner;
  }
  function pageHtml(src, page) {
    var d = fullDef(src.def), gen = d.mode === 'general', why = src.why || {};
    if (page.k === 'intro') return introHtml(d);
    if (page.k === 'done') return doneHtml(d, src);
    if (page.k === 'basic') {
      var cs = (src.courses || []).filter(function (c) { return c.active !== false; }), c0 = cs[0], h = '';
      if (!gen) {
        var tr = Array.from(new Set(cs.map(function (c) { return c.track; }))).slice(0, 4);
        h += '<div class="card"><div class="kicker">1단계</div><h2 class="title" style="font-size:19px">수강 반 선택</h2><div class="opts wide">' + (tr.length ? tr : ['계열 예시']).map(function (t, i) { return '<span class="opt" aria-pressed="' + (i === 0) + '">' + E(t) + '</span>'; }).join('') + '</div>' +
          (cs.length ? '<div class="msg ok">' + I('check', 18) + '<div><b>등록 과목 ' + cs.length + '개</b><br>' + cs.slice(0, 5).map(function (c) { return E(c.name); }).join(' · ') + (cs.length > 5 ? ' …' : '') + '</div></div>' : '<div class="msg warn">' + I('alert', 18) + '<div>등록된 과목이 없습니다. 「과목·교수」 탭에서 등록해 주십시오.</div></div>') + '</div>';
      }
      if ((d.basic || []).length) h += '<div class="card"><h2 class="title" style="font-size:19px">기본 정보</h2>' + d.basic.map(function (q) { return qhtml(q, d, why); }).join('') + '</div>';
      return h;
    }
    var s = page.s, cname = !gen ? ((src.courses || [])[0] || {}).name || '(과목명 예시)' : '';
    return (gen ? '' : '<div class="course open" style="margin-top:0"><div class="course-head"><span class="c-num">1</span><span class="c-name">' + E(cname) + '</span><span class="c-prog">과목마다 반복</span></div></div><div style="height:8px"></div>') +
      (s.showIf ? '<div class="msg warn" style="margin:0 0 8px">' + I('info', 16) + '<div>조건부 영역입니다. 지정한 응답을 선택한 경우에만 보입니다.</div></div>' : '') +
      '<div class="card"><h2 class="title" style="font-size:19px">' + E(s.title || '(영역 제목)') + '</h2>' + (s.note ? '<p class="muted" style="margin:4px 0;white-space:pre-line">' + E(s.note) + '</p>' : '') + (s.questions || []).map(function (q) { return qhtml(q, d, why); }).join('') + ((s.questions || []).length ? '' : '<p class="muted">문항이 없습니다.</p>') + '</div>';
  }

  /* ───────────── 렌더 ───────────── */
  function dock() {
    var el = document.getElementById('livepv'); if (el) return el;
    el = document.createElement('aside'); el.id = 'livepv'; el.className = 'livepv'; el.setAttribute('aria-label', '학생 화면 미리보기');
    el.innerHTML = '<div class="pvhead"><b>' + I('eye', 16) + ' 학생 화면 미리보기</b><span class="pvlabel muted"></span><span class="sp"></span><button class="btn btn-ghost btn-sm" data-pv="close" aria-label="닫기">' + I('x', 14) + '</button></div><div class="pvtabs" id="pvt"></div><div class="pvbody" id="pvb"></div><div class="pvfoot muted">입력하면 바로 반영됩니다 · 눌러서 입력해 볼 수 있습니다(저장되지 않음)</div>';
    document.body.appendChild(el);
    var b = document.createElement('button'); b.id = 'pvbtn'; b.className = 'pvbtn btn btn-primary'; b.setAttribute('data-pv', 'toggle'); b.innerHTML = I('eye', 16) + ' 미리보기'; document.body.appendChild(b);
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-pv]'); if (t) { var a = t.getAttribute('data-pv'); if (a === 'toggle') P.set(!P.open); else if (a === 'close') P.set(false); else if (a === 'page') { P.page = t.getAttribute('data-k'); P.focus = ''; P.render(); } return; }
    });
    return el;
  }
  P.set = function (on) { P.open = !!on; try { localStorage.setItem('svya_pv', on ? '1' : '0'); } catch (e) {} document.body.classList.toggle('pvopen', P.open); if (P.open) P.render(); };
  P.render = function () {
    var el = dock(), src = source(), btn = document.getElementById('pvbtn');
    var show = !!A.token && A.view !== 'login';
    btn.style.display = show ? '' : 'none'; document.body.classList.toggle('pvopen', P.open && show);
    if (!P.open || !show) return;
    var tabs = el.querySelector('#pvt'), body = el.querySelector('#pvb');
    if (!src) { tabs.innerHTML = ''; body.innerHTML = '<div class="t-empty" style="padding:30px 12px">설문을 만들거나 열면 학생 화면이<br>여기에 실시간으로 표시됩니다.</div>'; el.querySelector('.pvlabel').textContent = ''; return; }
    var d = fullDef(src.def), pages = pagesOf(d), cur = pages.filter(function (p) { return p.k === P.page; })[0] || pages[0]; P.page = cur.k;
    el.querySelector('.pvlabel').textContent = src.label ? '· ' + src.label : '';
    tabs.innerHTML = pages.map(function (p) { return '<button class="pvtab' + (p.k === cur.k ? ' on' : '') + '" data-pv="page" data-k="' + p.k + '">' + E(String(p.n).slice(0, 12)) + '</button>'; }).join('');
    var y = body.scrollTop; body.innerHTML = '';
    var holder = document.createElement('div'); body.appendChild(holder);
    var note = src.test ? '<div class="testbar" style="font-size:11px">테스트 모드</div>' : '';
    holder.innerHTML = frame(pageHtml(src, cur), src.theme, note);
    env.def = d; env.qmap = SVY.questionMap(d);
    SVY.Form.attach(holder, env); if (holder._initSigs) holder._initSigs();
    body.scrollTop = y;
    if (P.focus) { var q = holder.querySelector('.q[data-q="' + P.focus + '"]'); if (q) { q.classList.add('pvfocus'); var sc = holder.querySelector('.pvscroll'); try { q.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (e) {} } }
  };
  P.update = function () { clearTimeout(P.timer); P.timer = setTimeout(P.render, 120); };
  P.focusQ = function (qid) { var src = source(); if (!src) return; var k = locate(fullDef(src.def), qid); if (k) { P.page = k; P.focus = qid; P.update(); } };
  P.focusPage = function (k) { P.page = k; P.focus = ''; P.update(); };

  /* ───────────── 편집 위치 → 미리보기 이동 ───────────── */
  function onEdit(e) {
    var t = e.target; if (!t || !t.closest || t.closest('#livepv')) return;
    var src = source(); if (!src) return; var d = fullDef(src.def);
    var q = t.closest('[data-qid]'); if (q) return P.focusQ(q.getAttribute('data-qid'));
    var aq = t.closest('.aiq'); if (aq) { var si = Number(aq.getAttribute('data-si')), qi = Number(aq.getAttribute('data-qi')), list = si < 0 ? d.basic : ((d.sections[si] || {}).questions || []), qq = list[qi]; if (qq) return P.focusQ(qq.id); }
    var df = t.closest('[data-df]'); if (df) { var k = df.getAttribute('data-df') || ''; return P.focusPage(/^features\.(after|ticket|edit)|^edit$|^quiz/.test(k) ? 'done' : 'intro'); }
    var sc = t.closest('.sec-card[data-s]'); if (sc) { var i = Number(sc.getAttribute('data-s')); if (d.sections[i]) return P.focusPage('s' + i); }
    var asc = t.closest('.aisec'); if (asc) { var sib = Array.from(asc.parentNode.querySelectorAll('.aisec')); var j = sib.indexOf(asc); if (d.sections[j]) return P.focusPage('s' + j); }
    if (A.view === 'survey' && ['intro', 'design', 'overview'].indexOf(A.tab) >= 0) P.focusPage('intro');
  }
  ['focusin', 'click', 'input', 'change'].forEach(function (ev) { document.addEventListener(ev, function (e) { if (P.open) onEdit(e); }, true); });

  /* ───────────── 갱신 연결: 입력·탭 이동·화면 전환 ───────────── */
  var mark = A.markDirty; A.markDirty = function () { mark.apply(this, arguments); P.update(); };
  var rs = A.renderSurvey; A.renderSurvey = function () { rs.apply(this, arguments); P.update(); };
  var sh = A.shell; A.shell = function () { sh.apply(this, arguments); P.update(); };
  Object.keys(A.tabs).forEach(function (k) { var f = A.tabs[k]; if (typeof f !== 'function') return; var w = function () { var r = f.apply(this, arguments); P.update(); return r; }; Object.keys(f).forEach(function (p) { w[p] = f[p]; }); A.tabs[k] = w; });
  var ra = A.renderAI; if (ra) A.renderAI = function () { var r = ra.apply(this, arguments); P.update(); return r; };
  window.addEventListener('hashchange', function () { P.page = 'intro'; P.focus = ''; P.scratch = {}; P.update(); });

  /* 새 설문 만들기(기본 양식·이전 설문 불러오기 등) 모달에서도 미리보기 */
  A.pvModalSet = async function (kind, id, title) {
    var tpl = window.SVY_TEMPLATE.def, t = title || '새 설문';
    if (kind === 'tpl') P.modal = { def: tpl, label: '기본 양식', courses: [] };
    else if (kind === 'general') P.modal = { def: { mode: 'general', intro: { title: t, org: '아세아항공직업전문학교', notice: [] }, scales: tpl.scales, basic: [], sections: [{ id: 'S1', title: '설문 문항', questions: [] }] }, label: '일반 설문(빈 양식)', courses: [] };
    else if (kind === 'blank') P.modal = { def: { intro: { title: t, org: '아세아항공직업전문학교', notice: [] }, scales: tpl.scales, basic: [], sections: [] }, label: '과목별 평가(빈 양식)', courses: [] };
    else if (kind === 'clone' && id) {
      P.modal = { def: { intro: { title: '불러오는 중…' }, basic: [], sections: [] }, label: '이전 설문', courses: [] }; P.update();
      try { var g = await A.rpc('svy_a_get', { p_id: id }); if (P.modal) P.modal = { def: g.survey.def, theme: g.survey.theme, courses: g.courses || [], label: '이전 설문: ' + g.survey.title }; } catch (e) { P.modal = null; }
    } else P.modal = null;
    P.page = 'intro'; P.focus = ''; P.update();
  };
  A.pvModalClear = function () { if (P.modal) { P.modal = null; P.update(); } };
  new MutationObserver(function () { if (P.modal && !document.querySelector('.modal-bg')) A.pvModalClear(); }).observe(document.body, { childList: true });

  document.addEventListener('DOMContentLoaded', function () { P.update(); });
  setTimeout(P.update, 300);
})();
