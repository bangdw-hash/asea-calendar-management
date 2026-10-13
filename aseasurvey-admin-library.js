'use strict';
/**
 * aseasurvey-admin-library.js — 새 설문 만들기(카드 갤러리) · 양식 라이브러리(버전 관리)
 *  · 새 설문 만들기: 분야별 기본 양식(SVY_CATALOG) + 내 양식(라이브러리) 카드, 선택하면 오른쪽 미리보기에 즉시 표시
 *  · 양식 라이브러리: 양식 1개 = 이름 + 버전 여러 개. 새 버전 저장 · ★ 기본 버전 지정 · 버전 비교 · 편집 · 삭제
 *  · 설문 화면의 「양식으로 저장」: 새 양식 또는 기존 양식의 새 버전으로 저장 (응답·과목·인원은 저장하지 않음)
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico, C = window.SVY_CATALOG;
  var Lib = A.lib = { list: [] };
  var N = { cat: 'all', q: '', sel: null, title: '', semester: '' };
  var CATS = C.cats.concat([{ k: 'custom', t: '내 분류', d: '직접 만든 양식', icon: 'edit' }]);
  function catLabel(k) { var c = CATS.filter(function (x) { return x.k === k; })[0]; return c ? c.t : '내 분류'; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function modeTag(def) { return def.mode === 'general' ? '1인 1회' : '목록 항목별 반복'; }
  function qcount(def) { return SVY.allQuestions(def).filter(function (x) { return x.q.type !== 'block'; }).length; }

  Lib.load = async function () { Lib.list = await A.rpc('svy_tpl_list'); return Lib.list; };
  function setPreview(def, label, theme) { if (A.pv && A.pv.setSource) A.pv.setSource(def ? { def: def, label: label, theme: theme || {}, courses: [] } : null); }

  /* ───────────── 저장 대화상자 ───────────── */
  Lib.saveDialog = async function (def, theme, opt) {
    opt = opt || {};
    if (!Lib.list.length) { try { await Lib.load(); } catch (e) { A.toast(e.message, 'err'); return null; } }
    return new Promise(function (resolve) {
      var title = opt.name || (def.intro && def.intro.title) || '새 양식', done = false;
      var existing = Lib.list.map(function (t) { return '<option value="' + t.id + '">' + E(t.name) + ' (v' + t.default_ver + ' · 버전 ' + t.versions.length + '개)</option>'; }).join('');
      var m = A.modal('<h3>' + I('copy', 16) + ' 양식으로 저장</h3><p class="muted" style="margin:4px 0 10px">문항·설정·안내문·디자인만 저장합니다. 응답·과목·인원·추첨 데이터는 저장하지 않습니다.</p>' +
        '<div class="opts list" id="sm"><button type="button" class="opt" data-v="new" aria-pressed="' + !opt.tplId + '"><span class="box">' + I('check', 14) + '</span><span><b>새 양식</b>으로 저장</span></button><button type="button" class="opt" data-v="ver" aria-pressed="' + !!opt.tplId + '"' + (Lib.list.length ? '' : ' disabled') + '><span class="box">' + I('check', 14) + '</span><span><b>기존 양식의 새 버전</b>으로 저장 (이전 버전은 그대로 남습니다)</span></button></div>' +
        '<div id="snew"><label class="f">양식 이름</label><input class="fld" id="sn" value="' + E(title) + '"><label class="f">분야</label><select class="fld" id="sc">' + CATS.map(function (c) { return '<option value="' + c.k + '"' + (c.k === (opt.cat || 'custom') ? ' selected' : '') + '>' + E(c.t) + '</option>'; }).join('') + '</select><label class="f">한 줄 설명 (선택)</label><input class="fld" id="sd" placeholder="예: 행사 만족도 + 경품 추첨"></div>' +
        '<div id="sver" class="hide"><label class="f">저장할 양식</label><select class="fld" id="st">' + existing + '</select></div>' +
        '<label class="f">이 버전의 메모 (선택)</label><input class="fld" id="sno" placeholder="예: 경품 추첨 문항 추가" maxlength="100"><label class="chk" style="margin-top:8px"><input type="checkbox" id="sdef" checked> 이 버전을 기본(★)으로 사용</label>' +
        '<div class="btn-row"><button class="btn btn-ghost" data-r="0">취소</button><button class="btn btn-primary" data-r="1">저장</button></div>', function (bg, close) {
        var mode = opt.tplId ? 'ver' : 'new';
        function sync() { bg.querySelector('#snew').classList.toggle('hide', mode !== 'new'); bg.querySelector('#sver').classList.toggle('hide', mode !== 'ver'); bg.querySelectorAll('#sm .opt').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === mode); }); }
        if (opt.tplId) bg.querySelector('#st').value = opt.tplId; sync();
        bg.addEventListener('click', async function (e) {
          var o = e.target.closest('#sm .opt'); if (o && !o.disabled) { mode = o.getAttribute('data-v'); return sync(); }
          var b = e.target.closest('[data-r]'); if (!b) return; if (b.getAttribute('data-r') === '0') { done = true; close(); return resolve(null); }
          try {
            var args = { p_id: mode === 'ver' ? bg.querySelector('#st').value : null, p_name: mode === 'new' ? bg.querySelector('#sn').value.trim() : null, p_category: mode === 'new' ? bg.querySelector('#sc').value : null, p_descr: mode === 'new' ? bg.querySelector('#sd').value.trim() : null, p_def: def, p_theme: theme || {}, p_note: bg.querySelector('#sno').value.trim(), p_set_default: bg.querySelector('#sdef').checked };
            if (mode === 'new' && !args.p_name) return A.toast('양식 이름을 입력해 주십시오.', 'err');
            var r = await A.rpc('svy_tpl_save', args); done = true; close(); await Lib.load(); A.toast('양식 라이브러리에 저장했습니다. (v' + r.ver + ')'); resolve(r);
          } catch (er) { A.toast(er.message, 'err'); }
        });
        new MutationObserver(function (_, ob) { if (!document.body.contains(m.el)) { ob.disconnect(); if (!done) resolve(null); } }).observe(document.body, { childList: true });
      });
    });
  };

  /* ───────────── 새 설문 만들기: 카드 갤러리 ───────────── */
  function cardsHtml() {
    var q = N.q.trim().toLowerCase(), h = '';
    if (N.cat === 'lib') {
      var ls = Lib.list.filter(function (t) { return !q || (t.name + t.descr).toLowerCase().indexOf(q) >= 0; });
      if (!ls.length) return '<div class="panel t-empty">저장된 내 양식이 없습니다.<br>설문을 만든 뒤 「양식으로 저장」을 누르면 이곳에 쌓입니다.</div>';
      return '<div class="tgrid">' + ls.map(function (t) {
        var sel = N.sel && N.sel.lib === t.id;
        return '<div class="tcard' + (sel ? ' sel' : '') + '" data-act="tpick" data-lib="' + t.id + '"><div class="th"><span class="tag blue">' + E(catLabel(t.category)) + '</span><span class="muted" style="font-size:12px">사용 ' + t.uses + '회</span></div><h4>' + E(t.name) + '</h4><p>' + E(t.descr || '내 양식') + '</p><div class="tf"><label class="f" style="margin:0">버전</label><select class="fld" data-act="tver" data-lib="' + t.id + '" style="min-height:32px;padding:3px 8px;max-width:150px">' + t.versions.map(function (v) { return '<option value="' + v.ver + '"' + ((sel ? N.sel.ver : t.default_ver) === v.ver ? ' selected' : '') + '>v' + v.ver + (v.ver === t.default_ver ? ' ★' : '') + (v.note ? ' · ' + E(v.note.slice(0, 14)) : '') + '</option>'; }).join('') + '</select></div></div>';
      }).join('') + '</div>';
    }
    var items = C.list.filter(function (m) { return (N.cat === 'all' || m.c === N.cat) && (!q || (m.t + m.p + m.aud + m.u).toLowerCase().indexOf(q) >= 0); });
    if (!items.length) return '<div class="panel t-empty">조건에 맞는 양식이 없습니다.</div>';
    var byCat = {}; items.forEach(function (m) { (byCat[m.c] = byCat[m.c] || []).push(m); });
    C.cats.forEach(function (c) {
      if (!byCat[c.k]) return;
      h += '<h3 class="rsec">' + E(c.t) + ' <small class="muted">' + E(c.d) + '</small></h3><div class="tgrid">' + byCat[c.k].map(function (m) {
        return '<div class="tcard' + (N.sel && N.sel.key === m.k ? ' sel' : '') + '" data-act="tpick" data-key="' + m.k + '"><div class="th"><span class="tag">' + E(m.mode === 'general' ? '1인 1회' : '목록 항목별 반복') + '</span>' + (m.named ? '<span class="tag blue">기명</span>' : '') + '</div><h4>' + E(m.t) + '</h4><p>' + E(m.p) + '</p><div class="tf muted"><span>대상 ' + E(m.aud) + '</span><span>활용 ' + E(m.u) + '</span></div></div>';
      }).join('') + '</div>';
    });
    return h;
  }
  function galleryHtml() {
    var chips = [['all', '전체']].concat(C.cats.map(function (c) { return [c.k, c.t]; })).concat([['lib', '내 양식 (' + Lib.list.length + ')']]);
    var sel = N.sel;
    return '<div class="crumb"><a data-act="tolist">설문 목록</a> / 새 설문 만들기</div><div class="pg-head"><h1>새 설문 만들기</h1><span class="sp"></span><button class="btn btn-ghost btn-sm" data-act="tpllib">' + I('copy', 14) + ' 양식 라이브러리</button></div>' +
      '<div class="quick"><button class="qk" data-act="qk-ai"><i>' + I('sparkle', 20) + '</i><b>AI로 설계</b><span>설문지 파일·요청 글로 초안 만들기</span></button><button class="qk" data-act="qk-blank-g"><i>' + I('plus', 20) + '</i><b>빈 설문 (1인 1회)</b><span>직접 문항을 추가</span></button><button class="qk" data-act="qk-blank-c"><i>' + I('plus', 20) + '</i><b>빈 설문 (과목별 반복)</b><span>반·과목마다 응답</span></button><button class="qk" data-act="qk-link"><i>' + I('upload', 20) + '</i><b>연동 목록 설문 (일괄 업로드)</b><span>교강사·과목, 시설 등 목록을 엑셀로 연동</span></button><button class="qk" data-act="qk-clone"><i>' + I('refresh', 20) + '</i><b>이전 설문 불러오기</b><span>지난 설문을 복제</span></button></div>' +
      '<div class="row" style="margin:14px 0 6px"><div class="chipbar" id="cbar">' + chips.map(function (c) { return '<button class="cchipb' + (N.cat === c[0] ? ' on' : '') + '" data-act="tcat" data-k="' + c[0] + '">' + E(c[1]) + '</button>'; }).join('') + '</div><input class="fld" id="tq" placeholder="양식 검색" value="' + E(N.q) + '" style="max-width:220px"></div>' +
      '<div id="tcards">' + cardsHtml() + '</div>' +
      '<div class="startbar' + (sel ? ' on' : '') + '"><div class="sp"><b>' + (sel ? E(sel.label) : '양식을 선택해 주십시오') + '</b>' + (sel && A.howto ? '<div class="howline">' + I('info', 13) + ' 만든 뒤 진행: ' + E(A.howto.line(sel.def)) + ' <a data-act="howto">자세한 순서</a></div>' : '') + '<div class="muted" style="font-size:12.5px">' + (sel ? '오른쪽 미리보기에서 학생 화면을 확인할 수 있습니다. · 문항 ' + qcount(sel.def) + '개 · ' + modeTag(sel.def) : '카드를 누르면 미리보기에 바로 표시됩니다.') + '</div></div>' +
      '<input class="fld" id="nt" placeholder="설문 제목" value="' + E(N.title) + '" style="max-width:280px"><input class="fld" id="ns" placeholder="학기(선택) 예: 2026-2" value="' + E(N.semester) + '" style="max-width:150px"><button class="btn btn-primary" data-act="tcreate" ' + (sel ? '' : 'disabled') + '>' + I('check', 16) + ' 이 양식으로 만들기</button></div>';
  }
  async function pick(el) {
    var key = el.getAttribute('data-key'), lib = el.getAttribute('data-lib');
    try {
      if (key) { var t = C.get(key); N.sel = { key: key, def: t.def, label: t.meta.t, theme: {} }; N.title = t.def.intro.title; }
      else { var sv = el.querySelector('[data-act=tver]'), ver = sv ? Number(sv.value) : null, g = await A.rpc('svy_tpl_get', { p_id: lib, p_ver: ver }); N.sel = { lib: lib, ver: g.ver, def: g.def, theme: g.theme, label: g.name + ' · v' + g.ver }; N.title = g.def.intro && g.def.intro.title || g.name; }
    } catch (e) { return A.toast(e.message, 'err'); }
    N.title = N.title || ''; paint(); setPreview(N.sel.def, N.sel.label, N.sel.theme); if (A.pv) { A.pv.page = 'intro'; A.pv.focus = ''; }
  }
  function paint() { var m = A.main(); if (!m) return; var y = window.scrollY; m.innerHTML = galleryHtml(); window.scrollTo(0, y); }
  Lib.showNew = async function () {
    A.view = 'new'; A.cur = null; A.work = null; if (location.hash !== '#/new') history.replaceState(null, '', '#/new');
    A.shell('<div class="loading">불러오는 중…</div>');
    try { await Lib.load(); } catch (e) { Lib.list = []; }
    N.sel = null; paint(); setPreview(null);
  };
  async function create() {
    var s = N.sel; if (!s) return; var def = clone(s.def), title = (document.getElementById('nt').value || '').trim() || (def.intro && def.intro.title) || '새 설문';
    def.intro = def.intro || {}; def.intro.title = title;
    try {
      var r = await A.rpc('svy_a_create', { p_title: title, p_semester: (document.getElementById('ns').value || '').trim(), p_def: def, p_theme: s.theme || {} });
      if (s.lib) A.rpc('svy_tpl_use', { p_id: s.lib }).catch(function () {});
      A.toast('설문을 만들었습니다.'); location.hash = '#/s/' + r.id + '/overview';
    } catch (e) { A.toast(e.message, 'err'); }
  }
  async function blank(general) {
    var tpl = window.SVY_TEMPLATE.def, title = (document.getElementById('nt') && document.getElementById('nt').value.trim()) || (general ? '새 설문' : '새 과목별 평가'), def = general ? { mode: 'general', intro: { title: title, org: '아세아항공직업전문학교', notice: [] }, scales: tpl.scales, basic: [], sections: [{ id: 'S1', title: '설문 문항', note: '', questions: [] }] } : { intro: { title: title, org: '아세아항공직업전문학교', notice: [] }, scales: tpl.scales, basic: [], sections: [] };
    try { var r = await A.rpc('svy_a_create', { p_title: title, p_semester: (document.getElementById('ns') && document.getElementById('ns').value.trim()) || '', p_def: def, p_theme: {} }); location.hash = '#/s/' + r.id + '/overview'; } catch (e) { A.toast(e.message, 'err'); }
  }

  /* ───────────── 양식 라이브러리 화면 ───────────── */
  var LS = { open: '', tab: 'mine', q: '', sel: {} };
  function selBar() {
    var n = Object.keys(LS.sel).length;
    return '<div class="startbar on" id="bbar"><div class="sp"><b>' + (n ? n + '개 선택됨' : '복사할 양식을 선택해 주십시오') + '</b><div class="muted" style="font-size:12.5px">카드의 체크박스로 필요한 양식만 골라 내 양식(v1)으로 복사합니다. 이미 같은 이름이 있으면 건너뜁니다.</div></div><button class="btn btn-ghost" data-act="bclear" ' + (n ? '' : 'disabled') + '>선택 해제</button><button class="btn btn-primary" data-act="bcopysel" ' + (n ? '' : 'disabled') + '>' + I('copy', 16) + ' 선택한 ' + n + '개 내 양식으로 복사</button></div>';
  }
  function baseHtml() {
    var q = LS.q.trim().toLowerCase(), h = '', items = C.list.filter(function (m) { return !q || (m.t + m.p + m.aud + m.u).toLowerCase().indexOf(q) >= 0; });
    h += '<div class="row" style="margin:0 0 8px"><span class="muted">기본 양식 ' + C.list.length + '종 — 수정할 수 없는 원본입니다. 필요한 양식만 체크해 아래 막대에서 「선택 복사」하면 내 라이브러리에 v1로 저장되어 버전을 쌓을 수 있습니다.</span><span class="sp"></span><input class="fld" id="bq" placeholder="양식 검색" value="' + E(LS.q) + '" style="max-width:220px"></div>';
    C.cats.forEach(function (c) {
      var l = items.filter(function (m) { return m.c === c.k; }); if (!l.length) return;
      h += '<h3 class="rsec">' + E(c.t) + ' <small class="muted">' + E(c.d) + '</small></h3><div class="tgrid">' + l.map(function (m) { return '<div class="tcard" data-key="' + m.k + '" style="cursor:default"><div class="th"><label class="chk" style="margin:0"><input type="checkbox" data-bsel ' + (LS.sel[m.k] ? 'checked' : '') + '> 선택</label><span><span class="tag">' + E(m.mode === 'general' ? '1인 1회' : '목록 항목별 반복') + '</span>' + (m.named ? '<span class="tag blue">기명</span>' : '') + '</span></div><h4>' + E(m.t) + '</h4><p>' + E(m.p) + '</p><div class="tf muted"><span>대상 ' + E(m.aud) + '</span><span>활용 ' + E(m.u) + '</span></div><div class="row" style="margin-top:6px"><button class="btn btn-ghost btn-sm" data-act="bprev">미리보기</button><button class="btn btn-primary btn-sm" data-act="buse">새 설문</button></div></div>'; }).join('') + '</div>';
    });
    return (h || '<div class="panel t-empty">조건에 맞는 양식이 없습니다.</div>') + selBar();
  }
  function libHtml() {
    var h = '<div class="crumb"><a data-act="tolist">설문 목록</a> / 양식 라이브러리</div><div class="pg-head"><h1>양식 라이브러리</h1><span class="sp"></span><button class="btn btn-primary" data-act="newsvy">' + I('plus', 16) + ' 새 설문 만들기</button></div>' +
      '<p class="muted" style="margin:0 0 12px">양식은 이름 하나에 버전이 여러 개 쌓입니다. 설문을 만들 때 선택한 버전이 설문으로 <b>복사</b>되므로, 양식을 고쳐도 이미 만든 설문에는 영향이 없습니다.</p>';
    h += '<div class="chipbar" style="margin:0 0 10px"><button class="cchipb' + (LS.tab === 'mine' ? ' on' : '') + '" data-act="ltab" data-k="mine">내 양식 (' + Lib.list.length + ')</button><button class="cchipb' + (LS.tab === 'base' ? ' on' : '') + '" data-act="ltab" data-k="base">기본 양식 ' + C.list.length + '종</button></div>';
    if (LS.tab === 'base') return h + baseHtml();
    if (!Lib.list.length) return h + '<div class="panel t-empty">저장된 양식이 없습니다.<br>설문 화면 위쪽의 「양식으로 저장」으로 첫 양식을 만들어 보십시오.</div>';
    return h + '<div class="lgrid">' + Lib.list.map(function (t) {
      var open = LS.open === t.id;
      return '<section class="lcard' + (open ? ' open' : '') + '" data-id="' + t.id + '"><header data-act="lopen"><div class="sp"><span class="tag blue">' + E(catLabel(t.category)) + '</span> <b style="font-size:15px">' + E(t.name) + '</b><div class="muted" style="font-size:12.5px">' + E(t.descr || '') + '</div></div><div class="lmeta"><b>v' + t.default_ver + ' ★</b><span>버전 ' + t.versions.length + '개 · 사용 ' + t.uses + '회</span></div>' + I('chevron', 16) + '</header>' + (open ? libDetail(t) : '') + '</section>';
    }).join('') + '</div>';
  }
  function libDetail(t) {
    return '<div class="lbody"><div class="row" style="margin-bottom:8px"><button class="btn btn-secondary btn-sm" data-act="lmeta">' + I('edit', 13) + ' 이름·분야·설명 수정</button><button class="btn btn-secondary btn-sm" data-act="lcopy">' + I('copy', 13) + ' 다른 이름으로 복사</button><button class="btn btn-secondary btn-sm" data-act="lcmp">' + I('chart', 13) + ' 버전 비교</button><span class="sp"></span><button class="btn btn-ghost btn-sm" style="color:var(--red)" data-act="ldel">' + I('trash', 13) + ' 양식 삭제</button></div>' +
      '<div class="tbl-wrap"><table class="t"><thead><tr><th>버전</th><th>메모</th><th>저장일</th><th></th></tr></thead><tbody>' + t.versions.map(function (v) {
        return '<tr data-ver="' + v.ver + '"><td><b>v' + v.ver + '</b>' + (v.ver === t.default_ver ? ' <span class="badge badge-green">★ 기본</span>' : '') + '</td><td class="wrapcell">' + E(v.note || '-') + '</td><td>' + A.fmt(v.saved_at) + '</td><td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-act="lprev">미리보기</button> <button class="btn btn-primary btn-sm" data-act="luse">이 버전으로 새 설문</button> <button class="btn btn-secondary btn-sm" data-act="ledit">편집 → 새 버전</button>' + (v.ver !== t.default_ver ? ' <button class="btn btn-ghost btn-sm" data-act="ldefault">★ 기본으로</button>' : '') + (t.versions.length > 1 ? ' <button class="btn btn-ghost btn-sm" style="color:var(--red)" data-act="lvdel" aria-label="버전 삭제">' + I('trash', 13) + '</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
  }
  Lib.showLib = async function () {
    A.view = 'library'; A.cur = null; A.work = null; if (location.hash !== '#/library') history.replaceState(null, '', '#/library'); A.shell('<div class="loading">불러오는 중…</div>');
    try { await Lib.load(); } catch (e) { A.toast(e.message, 'err'); }
    A.main().innerHTML = libHtml(); setPreview(null);
  };
  function repaintLib() { var m = A.main(); if (m && A.view === 'library') m.innerHTML = libHtml(); }

  /* ───────────── 버전 비교 ───────────── */
  function qline(q) { return '[' + q.id + '] ' + (q.label || SVY.typeLabel(q)); }
  function diff(a, b) {
    var out = [], qa = {}, qb = {}; SVY.allQuestions(a).forEach(function (x) { qa[x.q.id] = x.q; }); SVY.allQuestions(b).forEach(function (x) { qb[x.q.id] = x.q; });
    Object.keys(qb).forEach(function (id) { if (!qa[id]) out.push(['add', '문항 추가', qline(qb[id]) + ' (' + SVY.typeLabel(qb[id]) + ')']); });
    Object.keys(qa).forEach(function (id) { if (!qb[id]) out.push(['del', '문항 삭제', qline(qa[id])]); });
    Object.keys(qa).forEach(function (id) {
      var x = qa[id], y = qb[id]; if (!y) return; var ch = [];
      if (x.label !== y.label) ch.push('문구: 「' + (x.label || '') + '」 → 「' + (y.label || '') + '」');
      if (x.type !== y.type || SVY.typeLabel(x) !== SVY.typeLabel(y)) ch.push('형식: ' + SVY.typeLabel(x) + ' → ' + SVY.typeLabel(y));
      if (!!x.required !== !!y.required) ch.push('필수: ' + (x.required ? '예' : '아니오') + ' → ' + (y.required ? '예' : '아니오'));
      if (JSON.stringify((x.options || []).map(function (o) { return o.label + '|' + (o.max || ''); })) !== JSON.stringify((y.options || []).map(function (o) { return o.label + '|' + (o.max || ''); }))) ch.push('선택지 변경');
      if (JSON.stringify(x.showIf || null) !== JSON.stringify(y.showIf || null)) ch.push('조건에 따라 보이기 변경');
      if (JSON.stringify([x.answer, x.points]) !== JSON.stringify([y.answer, y.points])) ch.push('정답·배점 변경');
      if (ch.length) out.push(['chg', '문항 수정', qline(y) + ' — ' + ch.join(' / ')]);
    });
    var sa = (a.sections || []).map(function (s) { return s.title; }), sb = (b.sections || []).map(function (s) { return s.title; });
    sb.forEach(function (t) { if (sa.indexOf(t) < 0) out.push(['add', '영역 추가', t]); }); sa.forEach(function (t) { if (sb.indexOf(t) < 0) out.push(['del', '영역 삭제', t]); });
    [['mode', '응답 방식'], ['limit', '선착순 인원'], ['quiz', '퀴즈 설정'], ['features', '추첨·수정·완료 후 안내'], ['identity', '응답자 식별'], ['layout', '화면 구성']].forEach(function (k) { if (JSON.stringify(a[k[0]] || null) !== JSON.stringify(b[k[0]] || null)) out.push(['chg', '설정 변경', k[1] + ': ' + JSON.stringify(a[k[0]] || '없음') + ' → ' + JSON.stringify(b[k[0]] || '없음')]); });
    if (JSON.stringify(a.intro || {}) !== JSON.stringify(b.intro || {})) out.push(['chg', '안내문 변경', '제목·안내 항목·문구']);
    return out;
  }
  Lib.diff = diff;
  async function compare(t) {
    var vs = t.versions.map(function (v) { return v.ver; }).sort(function (x, y) { return y - x; });
    if (vs.length < 2) return A.toast('비교할 버전이 2개 이상 필요합니다.', 'err');
    A.modal('<h3>버전 비교 · ' + E(t.name) + '</h3><div class="row"><select class="fld fld-auto" id="va">' + vs.map(function (v) { return '<option value="' + v + '"' + (v === vs[1] ? ' selected' : '') + '>v' + v + '</option>'; }).join('') + '</select><span>→</span><select class="fld fld-auto" id="vb">' + vs.map(function (v) { return '<option value="' + v + '">v' + v + '</option>'; }).join('') + '</select><button class="btn btn-primary btn-sm" id="vgo">비교</button></div><div id="vres" style="margin-top:10px"></div><div class="btn-row"><button class="btn btn-ghost" data-r="0">닫기</button></div>', function (bg, close) {
      async function run() {
        var res = bg.querySelector('#vres'); res.innerHTML = '<div class="loading">불러오는 중…</div>';
        try {
          var a = await A.rpc('svy_tpl_get', { p_id: t.id, p_ver: Number(bg.querySelector('#va').value) }), b = await A.rpc('svy_tpl_get', { p_id: t.id, p_ver: Number(bg.querySelector('#vb').value) }), d = diff(a.def, b.def);
          res.innerHTML = d.length ? '<div class="diff">' + d.map(function (x) { return '<div class="dl ' + x[0] + '"><span class="badge ' + (x[0] === 'add' ? 'badge-green' : x[0] === 'del' ? 'badge-red' : 'badge-blue') + '">' + x[1] + '</span> ' + E(x[2]) + '</div>'; }).join('') + '</div>' : '<p class="muted">두 버전의 문항·설정에 차이가 없습니다.</p>';
        } catch (er) { res.innerHTML = '<div class="msg err">' + E(er.message) + '</div>'; }
      }
      bg.addEventListener('click', function (e) { if (e.target.closest('#vgo')) run(); if (e.target.closest('[data-r]')) close(); }); run();
    }, 'wide');
  }

  /* ───────────── 양식 편집(문항 편집기 재사용) ───────────── */
  var TE = Lib.edit = null; try { TE = Lib.edit = JSON.parse(sessionStorage.getItem('svya_tpledit') || 'null'); } catch (e) {}
  function setEdit(v) { Lib.edit = v; try { if (v) sessionStorage.setItem('svya_tpledit', JSON.stringify(v)); else sessionStorage.removeItem('svya_tpledit'); } catch (e) {} }
  async function editVersion(t, ver) {
    try {
      var g = await A.rpc('svy_tpl_get', { p_id: t.id, p_ver: ver }), r = await A.rpc('svy_a_create', { p_title: '[양식 편집] ' + t.name + ' v' + ver, p_semester: '', p_def: g.def, p_theme: g.theme || {} });
      setEdit({ survey: r.id, tpl: t.id, name: t.name, ver: ver }); location.hash = '#/s/' + r.id + '/questions';
    } catch (e) { A.toast(e.message, 'err'); }
  }
  async function finishEdit(save) {
    var te = Lib.edit; if (!te) return;
    if (save) {
      if (A.isDirty && A.isDirty()) { if (!await A.save('양식 편집')) return; }
      var lint = A.lintDef(A.work.def); if (lint.errs.length) return A.toast('문항 오류 ' + lint.errs.length + '건을 먼저 해결해 주십시오.', 'err');
      var note = await new Promise(function (res) { A.modal('<h3>새 버전으로 저장</h3><p class="muted">「' + E(te.name) + '」의 새 버전으로 저장합니다. 이전 버전은 그대로 남습니다.</p><label class="f">이 버전의 메모</label><input class="fld" id="vn" maxlength="100" placeholder="예: 선착순 100명 + 기명"><label class="chk" style="margin-top:8px"><input type="checkbox" id="vd" checked> 이 버전을 기본(★)으로 사용</label><div class="btn-row"><button class="btn btn-ghost" data-r="0">취소</button><button class="btn btn-primary" data-r="1">저장</button></div>', function (bg, close) { bg.addEventListener('click', function (e) { var b = e.target.closest('[data-r]'); if (!b) return; var v = b.getAttribute('data-r') === '1' ? { n: bg.querySelector('#vn').value.trim(), d: bg.querySelector('#vd').checked } : null; close(); res(v); }); }); });
      if (!note) return;
      try { var r = await A.rpc('svy_tpl_save', { p_id: te.tpl, p_name: null, p_category: null, p_descr: null, p_def: A.work.def, p_theme: A.work.theme || {}, p_note: note.n, p_set_default: note.d }); A.toast('양식 「' + te.name + '」 v' + r.ver + '을(를) 저장했습니다.'); } catch (er) { return A.toast(er.message, 'err'); }
    } else if (!await A.confirm('양식 편집 취소', '편집한 내용을 버리고 임시 설문을 삭제합니다.', '취소하고 삭제', '계속 편집', true)) return;
    try { await A.rpc('svy_a_delete', { p_id: te.survey, p_force: true }); } catch (e) { /* 이미 삭제됨 */ }
    setEdit(null); A.work = null; A.cur = null; LS.open = te.tpl; location.hash = '#/library';
  }

  /* ───────────── 이벤트 ───────────── */
  document.addEventListener('click', async function (e) {
    var t = e.target.closest('[data-act]'); if (!t || !A.main || !A.main() || !A.main().contains(t) && !t.closest('.modal-bg')) return;
    var act = t.getAttribute('data-act');
    if (A.view === 'new') {
      if (act === 'tcat') { N.cat = t.getAttribute('data-k'); return paint(); }
      if (act === 'tpick') { if (e.target.closest('select')) return; return pick(t); }
      if (act === 'tcreate') return create();
      if (act === 'qk-ai') return A.ext.aiCreate({ title: (document.getElementById('nt') || {}).value || '', semester: (document.getElementById('ns') || {}).value || '' });
      if (act === 'qk-link') { location.hash = '#/link'; return; }
      if (act === 'qk-blank-g') return blank(true);
      if (act === 'qk-blank-c') return blank(false);
      if (act === 'qk-clone') return A.newSurveyLegacy && A.newSurveyLegacy();
      if (act === 'tolist') return;
    }
    if (act === 'howto' && N.sel && A.howto) return A.howto.modal(N.sel.def, N.sel.label);
    if (act === 'tpllib') { location.hash = '#/library'; return; }
    if (A.view === 'library') {
      if (act === 'ltab') { LS.tab = t.getAttribute('data-k'); return repaintLib(); }
      if (act === 'bclear') { LS.sel = {}; return repaintLib(); }
      if (act === 'bcopysel') {
        var keys = Object.keys(LS.sel); if (!keys.length) return;
        if (!await A.confirm('선택한 양식 복사', '선택한 ' + keys.length + '개를 내 양식(v1)으로 복사합니다. 이미 같은 이름이 있으면 건너뜁니다.', '복사', '취소')) return;
        try {
          await Lib.load(); var have = {}; Lib.list.forEach(function (x) { have[x.name] = 1; }); var ok = 0, skip = 0;
          for (var i = 0; i < keys.length; i++) { var bt2 = C.get(keys[i]); if (have[bt2.meta.t]) { skip++; continue; } await A.rpc('svy_tpl_save', { p_id: null, p_name: bt2.meta.t, p_category: bt2.meta.c, p_descr: bt2.meta.p, p_def: clone(bt2.def), p_theme: {}, p_note: '기본 양식에서 복사', p_set_default: true }); ok++; }
          LS.sel = {}; await Lib.load(); LS.tab = 'mine'; repaintLib(); A.toast(ok + '개를 내 양식으로 복사했습니다.' + (skip ? ' (같은 이름 ' + skip + '개 건너뜀)' : ''));
        } catch (er) { A.toast(er.message, 'err'); }
        return;
      }
      var bc = t.closest('.tcard[data-key]');
      if (bc && /^b(prev|use|copy)$/.test(act)) {
        var key = bc.getAttribute('data-key'), bt = C.get(key);
        if (act === 'bprev') { setPreview(bt.def, bt.meta.t, {}); if (A.pv) { A.pv.page = 'intro'; A.pv.set(true); } return; }
        if (act === 'buse') { N.cat = 'all'; Lib.showNew().then(function () { var el = document.querySelector('.tcard[data-key="' + key + '"]'); if (el) pick(el); }); return; }
        if (act === 'bcopy') { var r0 = await Lib.saveDialog(clone(bt.def), {}, { name: bt.meta.t, cat: bt.meta.c }); if (r0) { LS.tab = 'mine'; LS.open = r0.id; repaintLib(); } return; }
      }
      var card = t.closest('.lcard'), id = card && card.getAttribute('data-id'), tpl = Lib.list.filter(function (x) { return x.id === id; })[0], row = t.closest('tr'), ver = row ? Number(row.getAttribute('data-ver')) : null;
      if (act === 'lopen') { LS.open = LS.open === id ? '' : id; return repaintLib(); }
      if (!tpl) return;
      if (act === 'lprev') { try { var g = await A.rpc('svy_tpl_get', { p_id: id, p_ver: ver }); setPreview(g.def, tpl.name + ' · v' + ver, g.theme); if (A.pv) { A.pv.page = 'intro'; A.pv.set(true); } } catch (er) { A.toast(er.message, 'err'); } return; }
      if (act === 'luse') { N.cat = 'lib'; Lib.showNew().then(function () { var el = document.querySelector('.tcard[data-lib="' + id + '"]'); if (el) { var sel = el.querySelector('[data-act=tver]'); if (sel) sel.value = ver; pick(el); } }); return; }
      if (act === 'ledit') return editVersion(tpl, ver);
      if (act === 'ldefault') { try { await A.rpc('svy_tpl_update', { p_id: id, p_name: null, p_category: null, p_descr: null, p_default_ver: ver }); A.toast('v' + ver + '을(를) 기본(★)으로 지정했습니다.'); await Lib.load(); repaintLib(); } catch (er) { A.toast(er.message, 'err'); } return; }
      if (act === 'lvdel') { if (await A.confirm('버전 삭제', 'v' + ver + ' 버전을 삭제합니다. 이 버전으로 이미 만든 설문에는 영향이 없습니다.', '삭제', '취소', true)) { try { await A.rpc('svy_tpl_delete_ver', { p_id: id, p_ver: ver }); await Lib.load(); repaintLib(); } catch (er) { A.toast(er.message, 'err'); } } return; }
      if (act === 'ldel') { if (await A.confirm('양식 삭제', '「' + E(tpl.name) + '」과(와) 모든 버전을 삭제합니다. 이 양식으로 이미 만든 설문에는 영향이 없습니다.', '삭제', '취소', true)) { try { await A.rpc('svy_tpl_delete', { p_id: id }); LS.open = ''; await Lib.load(); repaintLib(); } catch (er) { A.toast(er.message, 'err'); } } return; }
      if (act === 'lcmp') return compare(tpl);
      if (act === 'lmeta') {
        A.modal('<h3>양식 정보 수정</h3><label class="f">이름</label><input class="fld" id="mn" value="' + E(tpl.name) + '"><label class="f">분야</label><select class="fld" id="mc">' + CATS.map(function (c) { return '<option value="' + c.k + '"' + (c.k === tpl.category ? ' selected' : '') + '>' + E(c.t) + '</option>'; }).join('') + '</select><label class="f">한 줄 설명</label><input class="fld" id="md" value="' + E(tpl.descr || '') + '"><div class="btn-row"><button class="btn btn-ghost" data-r="0">취소</button><button class="btn btn-primary" data-r="1">저장</button></div>', function (bg, close) {
          bg.addEventListener('click', async function (ev) { var b = ev.target.closest('[data-r]'); if (!b) return; if (b.getAttribute('data-r') === '0') return close(); try { await A.rpc('svy_tpl_update', { p_id: id, p_name: bg.querySelector('#mn').value.trim(), p_category: bg.querySelector('#mc').value, p_descr: bg.querySelector('#md').value.trim(), p_default_ver: null }); close(); await Lib.load(); repaintLib(); } catch (er) { A.toast(er.message, 'err'); } });
        }); return;
      }
      if (act === 'lcopy') { try { var cg = await A.rpc('svy_tpl_get', { p_id: id, p_ver: null }); await Lib.saveDialog(cg.def, cg.theme, { name: tpl.name + ' (복사)', cat: tpl.category }); repaintLib(); } catch (er) { A.toast(er.message, 'err'); } return; }
    }
    if (act === 'tplsave' && A.work) { await Lib.saveDialog(clone(A.work.def), clone(A.work.theme || {}), { name: A.work.title }); }
    if (act === 'tpledit-save') finishEdit(true);
    if (act === 'tpledit-cancel') finishEdit(false);
  });
  document.addEventListener('change', function (e) { var s = e.target.closest('[data-act=tver]'); if (s && A.view === 'new') { var card = s.closest('.tcard'); if (card && N.sel && N.sel.lib === card.getAttribute('data-lib')) pick(card); } });
  document.addEventListener('change', function (e) {
    if (A.view !== 'library' || !e.target.matches('[data-bsel]')) return; var k = e.target.closest('.tcard[data-key]').getAttribute('data-key'); if (e.target.checked) LS.sel[k] = 1; else delete LS.sel[k];
    var bar = document.getElementById('bbar'); if (bar) bar.outerHTML = selBar();
  });
document.addEventListener('input', function (e) {
    if (A.view === 'library' && e.target.id === 'bq') { LS.q = e.target.value; clearTimeout(Lib._bt); Lib._bt = setTimeout(function () { repaintLib(); var el = document.getElementById('bq'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 200); return; }
    if (A.view !== 'new') return;
    if (e.target.id === 'tq') { N.q = e.target.value; clearTimeout(Lib._t); Lib._t = setTimeout(function () { var c = document.getElementById('tcards'); if (c) c.innerHTML = cardsHtml(); }, 150); }
    else if (e.target.id === 'nt') { N.title = e.target.value; if (N.sel && A.pv) { N.sel.def.intro = N.sel.def.intro || {}; N.sel.def.intro.title = e.target.value; setPreview(N.sel.def, N.sel.label, N.sel.theme); } }
    else if (e.target.id === 'ns') N.semester = e.target.value;
  });

  /* 설문 화면: 「양식으로 저장」 버튼 + 양식 편집 안내 배너 */
  var rs = A.renderSurvey; A.renderSurvey = function () {
    rs.apply(this, arguments);
    if (A.view !== 'survey' || !A.cur) return;
    var sb = document.getElementById('savebtn');
    if (sb && !document.querySelector('[data-act=tplsave]')) { var b = document.createElement('button'); b.className = 'btn btn-secondary'; b.setAttribute('data-act', 'tplsave'); b.innerHTML = I('copy', 15) + ' 양식으로 저장'; sb.parentNode.insertBefore(b, sb); }
    var te = Lib.edit; document.querySelectorAll('.tebar').forEach(function (x) { x.remove(); });
    if (te && te.survey === A.cur.survey.id) { var bar = document.createElement('div'); bar.className = 'tebar'; bar.innerHTML = '<div class="sp"><b>' + I('edit', 15) + ' 양식 편집 중 — 「' + E(te.name) + '」 v' + te.ver + '</b><div class="muted" style="font-size:12.5px">문항·안내문·설정을 고친 뒤 새 버전으로 저장하면 양식에 v+1이 쌓입니다. (이 임시 설문은 저장 후 자동 삭제됩니다)</div></div><button class="btn btn-primary" data-act="tpledit-save">' + I('check', 15) + ' 양식의 새 버전으로 저장</button><button class="btn btn-ghost" data-act="tpledit-cancel">편집 취소</button>'; var tabs = document.querySelector('.tabs'); if (tabs) tabs.parentNode.insertBefore(bar, tabs); }
  };
  A.libReady = true;
    A.newSurveyUI = Lib.showNew;
})();
