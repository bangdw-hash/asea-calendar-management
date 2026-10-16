'use strict';
/**
 * budget-entry-ai.js — 입력판 AI (BudgetEntryAI)
 *  서버 함수 budget-ai(Supabase Edge Function)를 부르며, 로그인 토큰을 함께 보냅니다. AI 키는 서버에만 있습니다.
 *  코드는 기존 코드표에서만 고릅니다(새 코드를 만들지 않음).
 */
(function () {
  var W = window.BW;
  function call(body) {
    return fetch(W.SUPA_URL + '/functions/v1/budget-ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: W.SUPA_KEY, Authorization: 'Bearer ' + W.SUPA_KEY }, body: JSON.stringify(body)
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok || !j.ok) { var e = new Error(j.error === 'AUTH_REQUIRED' ? '로그인이 만료되었습니다. 다시 접속해 주십시오.' : (j.error || 'AI 호출에 실패했습니다.')); e.code = j.error; throw e; }
      return j;
    }); }, function () { throw new Error('네트워크 연결을 확인해 주십시오.'); });
  }
  window.BudgetEntryAI = {
    match: function (ctx, rows) {
      return call({ token: ctx.token, year: ctx.year, dept: ctx.dept || null, mode: 'match', items: rows.map(function (r) {
        return { id: r.id, type: r.type, phase: r.phase, memo: r.memo, vendor: r.vendor, amount: r.amount, calc: r.calc };
      }) }).then(function (j) { return j.results; });
    },
    ping: function (ctx) {   // AI 접속 점검(서버 키·모델·네트워크). 20초 안에 응답이 없으면 실패로 봅니다.
      return Promise.race([call({ token: ctx.token, year: ctx.year, dept: ctx.dept || null, mode: 'ping' }), new Promise(function (_, rej) { setTimeout(function () { rej(new Error('응답 시간이 초과되었습니다.')); }, 20000); })]);
    },
    ask: function (ctx, q) { return call({ token: ctx.token, year: ctx.year, dept: ctx.dept || null, mode: 'qa', question: q }); }
  };
})();
