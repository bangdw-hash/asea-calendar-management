'use strict';
/**
 * budget-aistatus.js — 화면 상단 AI 접속 상태등 (BudgetAiStatus)
 *  - 화면이 열릴 때 자동으로 접속을 점검하고, 「다시 접속 테스트」 버튼으로 언제든 재점검합니다.
 *  - 연결 안 됨(빨간불)이면 예산 관리자 연락처를 안내합니다. 관리자 화면에는 연락처를 항상 표시합니다.
 */
(function () {
  var W = window.BW, esc = W.esc, CACHE = {};   // 같은 로그인 안에서 탭을 오갈 때마다 다시 점검하지 않도록 5분간 결과를 기억합니다.
  function mount(el, o) {
    var C = W.ADMIN_CONTACT, st = 'wait', msg = '', ms = null, busy = false, dead = false, ck = (typeof o.ctx === 'function' ? o.ctx() : o).token, hit = CACHE[ck];
    function draw() {
      var label = st === 'ok' ? 'AI 연결 정상' + (ms != null ? ' (' + (ms / 1000).toFixed(1) + '초)' : '') : st === 'bad' ? 'AI 연결 안 됨' : 'AI 접속 확인 중…';
      el.innerHTML = '<div class="aist ' + st + '"><span class="aist-dot" aria-hidden="true"></span><b>' + label + '</b>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-aist' + (busy ? ' disabled' : '') + '>다시 접속 테스트</button>' +
        (o.admin ? '<span class="aist-c">' + esc(C.title) + ' · ' + esc(C.text) + '</span>' : '') + '</div>' +
        (st === 'bad' ? '<div class="note err aist-n"><span>AI 코드 매칭·코드 질문을 쓸 수 없습니다. 내용은 그대로 입력·저장할 수 있으며, 코드는 직접 고르실 수 있습니다. ' +
          (o.admin ? '서버 AI 키·함수 설정을 확인하십시오.' : '<b>' + esc(C.title) + '</b>에게 알려 주십시오. ' + esc(C.text)) + '<br><span class="muted">사유: ' + esc(msg) + '</span></span></div>' : '');
      var b = el.querySelector('[data-aist]'); if (b) b.onclick = run;
    }
    function run() {
      if (busy || dead) return; busy = true; st = 'wait'; draw();
      var ctx = typeof o.ctx === 'function' ? o.ctx() : o;
      window.BudgetEntryAI.ping(ctx).then(function (j) { st = 'ok'; ms = j.ms; msg = ''; }, function (e) { st = 'bad'; ms = null; msg = e.message || '알 수 없는 오류'; })
        .then(function () { CACHE[ck] = { st: st, ms: ms, msg: msg, at: Date.now() }; })
        .then(function () { busy = false; if (!dead) draw(); });
    }
    if (hit && Date.now() - hit.at < 300000) { st = hit.st; ms = hit.ms; msg = hit.msg; draw(); } else { draw(); run(); }
    return { retest: run, destroy: function () { dead = true; el.innerHTML = ''; } };
  }
  window.BudgetAiStatus = { mount: mount };
})();
