'use strict';
/**
 * aseasurvey-admin-courseview.js — 과목·교수 탭 보기 전환: 목록 / 교수별 / 반별
 *  · 교수별: 교수 한 명이 맡은 과목·반을 한눈에 확인(역조회), 교수 미지정 과목, 표기가 비슷한 이름 경고, 교수명 일괄 변경
 *  · 반별: 반마다 개설된 과목과 담당교수 확인
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico;
  var V = A.ext.cview = A.ext.cview || { mode: 'list', q: '', open: {} };

  function active() { return (A.cur.courses || []).filter(function (c) { return c.active; }); }
  function profsOf(c) { var s = String(c.prof || '').trim(); if (!s) return ['']; return s.split(/\s*[,，、\/·]\s*/).filter(Boolean); }
  function norm(n) { return String(n).replace(/\s+/g, '').replace(/(교수님|교수|강사|박사|선생님|선생)$/, ''); }
  function byProf() {
    var m = {};
    active().forEach(function (c) { profsOf(c).forEach(function (p) { (m[p] || (m[p] = { name: p, rows: [] })).rows.push(c); }); });
    var list = Object.keys(m).map(function (k) { return m[k]; });
    // 표기가 비슷한 이름(직함·공백만 다른 경우)
    var g = {}; list.forEach(function (p) { if (p.name) (g[norm(p.name)] = g[norm(p.name)] || []).push(p.name); });
    list.forEach(function (p) { p.similar = p.name && g[norm(p.name)].length > 1 ? g[norm(p.name)].filter(function (x) { return x !== p.name; }) : []; });
    return list;
  }
  function groupRows(rows) {
    var m = {}; rows.forEach(function (c) { var k = [c.track, c.grade].join(' '); (m[k] = m[k] || []).push(c); });
    return Object.keys(m).sort(function (a, b) { return a.localeCompare(b, 'ko'); }).map(function (k) { return { k: k, rows: m[k].sort(function (a, b) { return (a.klass + a.name).localeCompare(b.klass + b.name, 'ko'); }) }; });
  }
  function chip(c) { return '<span class="cchip' + (c.kind === '실습' ? ' prac' : '') + '"><b>' + E(c.klass) + '</b> ' + E(c.name) + (c.kind ? ' <small>' + E(c.kind) + '</small>' : '') + '</span>'; }

  function profView() {
    var list = byProf(), q = V.q.trim(), known = list.filter(function (p) { return p.name; }), nop = list.filter(function (p) { return !p.name; })[0];
    var shown = known.filter(function (p) { return !q || p.name.indexOf(q) >= 0 || p.rows.some(function (c) { return c.name.indexOf(q) >= 0; }); }).sort(function (a, b) { return b.rows.length - a.rows.length || a.name.localeCompare(b.name, 'ko'); });
    var classes = function (rows) { return new Set(rows.map(function (c) { return [c.track, c.grade, c.klass].join('|'); })).size; };
    var h = '<div class="kpis" style="margin-top:12px"><div class="kpi"><div class="l">담당교수</div><div class="v">' + known.length + '<small>명</small></div></div><div class="kpi"><div class="l">등록 과목(반 단위)</div><div class="v">' + active().length + '<small>건</small></div></div><div class="kpi"><div class="l">교수 미지정</div><div class="v" style="color:' + (nop ? 'var(--red)' : 'var(--green)') + '">' + (nop ? nop.rows.length : 0) + '<small>건</small></div></div></div>';
    if (nop) h += '<div class="msg warn" style="margin-top:0">' + I('alert', 18) + '<div><b>담당교수가 비어 있는 과목 ' + nop.rows.length + '건</b> — 교수별 결과에서 빠집니다.<br>' + nop.rows.slice(0, 8).map(function (c) { return E([c.grade, c.klass, c.name].join(' ')); }).join(' · ') + (nop.rows.length > 8 ? ' …' : '') + '</div><button class="btn btn-secondary btn-sm" data-act="cvlist" data-q="">목록에서 채우기</button></div>';
    var sim = known.filter(function (p) { return p.similar.length; }); if (sim.length) h += '<div class="msg warn">' + I('alert', 18) + '<div><b>표기가 비슷한 이름</b> — 같은 교수라면 하나로 통일해 주십시오.<br>' + Array.from(new Set(sim.map(function (p) { return [p.name].concat(p.similar).sort().join(' / '); }))).map(E).join('<br>') + '</div></div>';
    h += '<div class="row" style="margin:12px 0 6px"><input class="fld" id="cvq" placeholder="교수명·과목명 검색" value="' + E(V.q) + '" style="max-width:260px"><span class="sp"></span><button class="btn btn-ghost btn-sm" data-act="cvall">모두 펼치기</button><button class="btn btn-ghost btn-sm" data-act="cvnone">모두 접기</button></div>';
    h += '<div class="pcards">' + shown.map(function (p) {
      var open = V.open[p.name] != null ? V.open[p.name] : shown.length <= 6;
      return '<section class="pcard' + (open ? ' open' : '') + '" data-p="' + E(p.name) + '"><header data-act="cvtoggle"><span class="pav">' + E(p.name.slice(0, 1)) + '</span><div class="sp"><b>' + E(p.name) + '</b>' + (p.similar.length ? ' <span class="badge badge-amber">표기 확인</span>' : '') + '<div class="muted" style="font-size:12.5px">' + p.rows.length + '과목 · ' + classes(p.rows) + '개 반 · ' + new Set(p.rows.map(function (c) { return c.name; })).size + '종</div></div>' + I('chevron', 16) + '</header>' +
        (open ? '<div class="pbody">' + groupRows(p.rows).map(function (g) { return '<div class="pgrp"><div class="pgt">' + E(g.k) + '</div><div class="pchips">' + g.rows.map(chip).join('') + '</div></div>'; }).join('') + '<div class="row" style="margin-top:8px"><button class="btn btn-ghost btn-sm" data-act="cvrename" data-p="' + E(p.name) + '">' + I('edit', 13) + ' 이름 일괄 변경</button><button class="btn btn-ghost btn-sm" data-act="cvlist" data-q="' + E(p.name) + '">목록에서 보기</button></div></div>' : '') + '</section>'; }).join('') + '</div>' + (shown.length ? '' : '<div class="panel t-empty">조건에 맞는 교수가 없습니다.</div>');
    return h;
  }
  function classView() {
    var m = {}; active().forEach(function (c) { var k = [c.track, c.grade, c.klass].join('|'); (m[k] = m[k] || { c: c, rows: [] }).rows.push(c); });
    var keys = Object.keys(m).sort(function (a, b) { return a.localeCompare(b, 'ko'); }), h = '<div class="pcards" style="margin-top:12px">';
    keys.forEach(function (k) {
      var g = m[k], c0 = g.c, miss = g.rows.filter(function (c) { return !c.prof; }).length;
      h += '<section class="pcard open"><header><span class="pav" style="background:var(--green-lt);color:var(--green)">' + E(c0.klass.slice(0, 2)) + '</span><div class="sp"><b>' + E(c0.track + ' ' + c0.grade + ' ' + c0.klass) + '</b><div class="muted" style="font-size:12.5px">' + g.rows.length + '과목' + (miss ? ' · <span style="color:var(--red)">교수 미지정 ' + miss + '</span>' : '') + '</div></div></header><div class="pbody"><table class="t"><tbody>' + g.rows.sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); }).map(function (c) { return '<tr><td>' + E(c.name) + '</td><td>' + (c.kind ? '<span class="tag">' + E(c.kind) + '</span>' : '') + '</td><td>' + (c.prof ? E(c.prof) : '<span class="badge badge-red">미지정</span>') + '</td></tr>'; }).join('') + '</tbody></table></div></section>';
    });
    return h + '</div>' + (keys.length ? '' : '<div class="panel t-empty">등록된 과목이 없습니다.</div>');
  }

  async function rename(from) {
    A.modal('<h3>교수 이름 일괄 변경</h3><p class="muted">「' + E(from) + '」이(가) 담당인 모든 과목의 교수 이름을 바꿉니다. 표기를 통일할 때 사용하십시오.</p><label class="f">새 이름</label><input class="fld" id="rn" value="' + E(from) + '"><div class="btn-row"><button class="btn btn-ghost" data-r="0">취소</button><button class="btn btn-primary" data-r="1">변경</button></div>', function (bg, close) {
      bg.addEventListener('click', async function (e) {
        var b = e.target.closest('[data-r]'); if (!b) return; if (b.getAttribute('data-r') === '0') return close();
        var to = bg.querySelector('#rn').value.trim(); if (!to || to === from) return close();
        var rows = active().filter(function (c) { return profsOf(c).indexOf(from) >= 0; }).map(function (c) { return { track: c.track, grade: c.grade, klass: c.klass, name: c.name, kind: c.kind, prof: profsOf(c).map(function (p) { return p === from ? to : p; }).join(', ') }; });
        try { var r = await A.rpc('svy_a_courses_save', { p_id: A.cur.survey.id, p_rows: rows, p_mode: 'merge' }); close(); A.toast(r.saved + '건의 교수 이름을 바꿨습니다.'); await A.refresh(); A.renderSurvey(); } catch (er) { A.toast(er.message, 'err'); }
      });
    });
  }

  var orig = A.tabs.courses;
  var wrapped = function (box) {
    var r = orig.apply(this, arguments);
    var kids = Array.from(box.children).filter(function (el) { return !el.hasAttribute('data-cv'); });
    var bar = document.createElement('div'); bar.setAttribute('data-cv', 'bar'); bar.className = 'cvbar';
    bar.innerHTML = [['list', '목록', 'list'], ['prof', '교수별 보기', 'users'], ['class', '반별 보기', 'chart']].map(function (m) { return '<button class="cvb' + (V.mode === m[0] ? ' on' : '') + '" data-act="cvmode" data-m="' + m[0] + '">' + I(m[2], 14) + ' ' + m[1] + '</button>'; }).join('') + '<span class="sp"></span><span class="muted" style="font-size:12.5px">등록한 내용을 교수·반 기준으로 거꾸로 확인할 수 있습니다.</span>';
    box.insertBefore(bar, box.firstChild);
    var pane = document.createElement('div'); pane.setAttribute('data-cv', 'pane'); box.appendChild(pane);
    function apply() {
      kids.forEach(function (el) { if (el !== bar) el.style.display = V.mode === 'list' ? '' : 'none'; });
      // 목록 위쪽 요약줄(첫 .row)은 항상 보이게 유지
      if (V.mode !== 'list' && kids[0]) kids[0].style.display = '';
      pane.innerHTML = V.mode === 'prof' ? profView() : V.mode === 'class' ? classView() : '';
      bar.querySelectorAll('.cvb').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-m') === V.mode); });
      if (V.mode === 'list' && V.q != null && A.ext.cf && V.listq != null) { /* 목록 필터는 기존 입력칸이 관리 */ }
    }
    if (!box._cvBound) {
      box._cvBound = true;
      box.addEventListener('click', function (e) {
        var t = e.target.closest('[data-act^="cv"]'); if (!t) return; var act = t.getAttribute('data-act'); e.stopPropagation();
        if (act === 'cvmode') { V.mode = t.getAttribute('data-m'); A.tabs.courses(box); }
        else if (act === 'cvtoggle') { var p = t.closest('.pcard').getAttribute('data-p'); V.open[p] = !t.closest('.pcard').classList.contains('open'); box.querySelector('[data-cv=pane]').innerHTML = profView(); }
        else if (act === 'cvall' || act === 'cvnone') { byProf().forEach(function (p) { V.open[p.name] = act === 'cvall'; }); box.querySelector('[data-cv=pane]').innerHTML = profView(); }
        else if (act === 'cvrename') rename(t.getAttribute('data-p'));
        else if (act === 'cvlist') { V.mode = 'list'; A.ext.cf = A.ext.cf || { track: '', q: '' }; A.ext.cf.q = t.getAttribute('data-q') || ''; A.tabs.courses(box); }
      }, true);
      box.addEventListener('input', function (e) { if (e.target.id !== 'cvq') return; V.q = e.target.value; clearTimeout(V._t); V._t = setTimeout(function () { var pane = box.querySelector('[data-cv=pane]'); if (pane) { pane.innerHTML = profView(); var n = pane.querySelector('#cvq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 200); });
    }
    apply();
    return r;
  };
  Object.keys(orig).forEach(function (k) { wrapped[k] = orig[k]; });
  A.tabs.courses = wrapped;
})();
