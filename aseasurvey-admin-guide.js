'use strict';
/**
 * aseasurvey-admin-guide.js — 관리자 화면 길잡이
 *  · 설문 상단 「진행 단계」 표시와 「다음 할 일」 안내(현재 상태를 보고 자동 계산)
 *  · 도움말(?) 아이콘: A.help('설명') — 어려운 항목 옆에 풀어 쓴 설명
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico;
  A.help = function (t) { return '<span class="help" tabindex="0" role="note" data-help="' + E(t) + '" aria-label="도움말">?</span>'; };

  var hidden = false; try { hidden = localStorage.getItem('svya_guide') === '0'; } catch (e) {}
  function steps() {
    var d = A.work.def, gen = d.mode === 'general', lint = A.lintDef(d), nq = A.countQuestions(), item = A.cur.item || {}, s = A.work;
    var cs = (A.cur.courses || []).filter(function (c) { return c.active; }).length, head = (A.cur.targets || []).reduce(function (a, t) { return a + (t.headcount || 0); }, 0);
    var live = s.status === 'open' && !s.test_mode;
    if (A.howto) {
      var INFO = { quiz: 1, limit: 1, named: 1, media: 1, design: 1, draw: 1, res: 1 }, hd = head;
      return A.howto.plan(d).filter(function (p) { return !/^(design|draw|res)$/.test(p.id); }).map(function (p) {
        var done = { intro: !!(d.intro && d.intro.title && (d.intro.notice || []).length), q: nq > 0 && !lint.errs.length, c: cs > 0, h: hd > 0, t: (item.test_responses || 0) > 0 || live, audit: !!(A.audit && A.audit.ran && A.audit.ran()) || live, l: live }[p.id] || false;
        return { id: p.id, tab: p.tab, t: p.t, done: done, bad: p.id === 'q' ? lint.errs.length : 0, optional: !!(p.optional || INFO[p.id]), why: p.id === 'q' && lint.errs.length ? '문항에 고쳐야 할 곳이 ' + lint.errs.length + '건 있습니다. 문항 탭 위쪽의 빨간 안내를 확인해 주십시오.' : p.why };
      });
    }
    var l = [
      { id: 'intro', tab: 'intro', t: '안내문', done: !!(d.intro && d.intro.title && (d.intro.notice || []).length), why: '학생이 설문을 시작하기 전에 처음 보는 설명 화면입니다. 제목과 안내 항목을 적어 주십시오.' },
      { id: 'q', tab: 'questions', t: '문항', done: nq > 0 && !lint.errs.length, bad: lint.errs.length, why: lint.errs.length ? '문항에 고쳐야 할 곳이 ' + lint.errs.length + '건 있습니다. 문항 탭 위쪽의 빨간 안내를 확인해 주십시오.' : '묻고 싶은 문항을 추가해 주십시오. 설문지 파일이 있으면 「AI 설계」 탭에서 초안을 만들 수 있습니다.' }
    ];
    if (!gen) {
      l.push({ id: 'c', tab: 'courses', t: '과목·교수', done: cs > 0, why: '학생이 반을 고르면 그 반의 과목이 나옵니다. 엑셀·시간표 파일(AI)이나 「반 × 과목 표」로 한 번에 등록할 수 있습니다.' });
      l.push({ id: 'h', tab: 'targets', t: '대상 인원', done: head > 0, optional: true, why: '계열·학년별 인원을 넣으면 응답률이 계산됩니다. (선택)' });
    }
    l.push({ id: 't', tab: 'overview', t: '테스트', done: (item.test_responses || 0) > 0 || live, why: '「시작·배포」 탭에서 테스트 모드를 켠 뒤 학생 링크로 직접 응답해 보십시오. 결과는 정식 시작 전에 지워집니다.' });
    l.push({ id: 'l', tab: 'overview', t: '정식 시작', done: live, why: '「시작·배포」 탭의 「정식 시작」 버튼을 누르면 응답을 받기 시작합니다.' });
    return l;
  }
  function html() {
    var l = steps(), next = l.filter(function (x) { return !x.done && !x.optional; })[0], n = 0;
    var chips = l.map(function (x) { var num = x.optional ? '·' : ++n; return '<button class="gstep' + (x.done ? ' done' : '') + (x.bad ? ' bad' : '') + (next && next.id === x.id ? ' cur' : '') + '" data-act="gonext" data-tab="' + x.tab + '" title="' + E(x.why) + '"><i>' + (x.done ? I('check', 12) : num) + '</i>' + E(x.t) + (x.optional ? ' <small>(선택)</small>' : '') + '</button>'; }).join('<span class="gline"></span>');
    var msg = next ? '<div class="gnext"><div class="sp"><b>다음 할 일 · ' + E(next.t) + '</b><div class="muted">' + E(next.why) + '</div></div><button class="btn btn-primary btn-sm" data-act="gonext" data-tab="' + next.tab + '">' + E(next.t) + ' 하러 가기 ' + I('right', 14) + '</button></div>'
      : '<div class="gnext ok"><div class="sp"><b>' + I('check', 16) + ' 모든 준비가 끝났습니다</b><div class="muted">응답을 받고 있습니다. 학생 링크를 공유하고 「결과 보기」에서 실시간으로 확인하십시오.</div></div><button class="btn btn-secondary btn-sm" data-act="copylink" data-code="' + E(A.cur.survey.code) + '">' + I('link', 14) + ' 학생 링크 복사</button></div>';
    return '<div class="gsteps">' + chips + '<span class="sp"></span><button class="btn btn-ghost btn-sm" data-act="gtoggle" aria-label="길잡이 접기">' + (hidden ? '길잡이 펼치기' : '접기') + '</button></div>' + (hidden ? '' : msg);
  }
  var timer = 0;
  function update() {
    clearTimeout(timer); timer = setTimeout(function () {
      var el = document.getElementById('guide'); if (A.view !== 'survey' || !A.work || !A.cur) { if (el) el.remove(); return; }
      if (!el) { var tabs = document.querySelector('.tabs'); if (!tabs) return; el = document.createElement('div'); el.id = 'guide'; el.className = 'guide'; tabs.parentNode.insertBefore(el, tabs); }
      el.innerHTML = html();
    }, 150);
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act="gonext"],[data-act="gtoggle"]'); if (!t) return;
    if (t.getAttribute('data-act') === 'gtoggle') { hidden = !hidden; try { localStorage.setItem('svya_guide', hidden ? '0' : '1'); } catch (er) {} update(); return; }
    A.go(t.getAttribute('data-tab'));
  });
  // 도움말: 눌러서 고정 표시(모바일·키보드)
  document.addEventListener('click', function (e) { var h = e.target.closest('.help'); document.querySelectorAll('.help.show').forEach(function (x) { if (x !== h) x.classList.remove('show'); }); if (h) h.classList.toggle('show'); });

  var mark = A.markDirty; A.markDirty = function () { mark.apply(this, arguments); update(); };
  var rs = A.renderSurvey; A.renderSurvey = function () { rs.apply(this, arguments); update(); };
  Object.keys(A.tabs).forEach(function (k) { var f = A.tabs[k]; if (typeof f !== 'function') return; var w = function () { var r = f.apply(this, arguments); update(); return r; }; Object.keys(f).forEach(function (p) { w[p] = f[p]; }); A.tabs[k] = w; });
  A.guideUpdate = update;
})();
