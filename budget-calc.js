'use strict';
/**
 * budget-calc.js — 예산 산출식 해석/생성 (BudgetCalc)
 *  - evalCalc : "400,000원 × 4회 + 50만원 × 2식" 형태를 계산. 해석 불가하면 null (경고하지 않음)
 *  - parseTerms / composeCalc : 단가 × 수량 입력기와 산출식 문구 상호 변환
 */
(function (root) {
  var UNIT_MUL = { '억': 100000000, '만': 10000, '천': 1000 };

  // 숫자 한 덩어리(단위 억/만/천 포함) → 값. 한 factor에 숫자가 정확히 1개일 때만 값 반환
  function factorValue(f) {
    var re = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(억|만|천)?/g, m, hits = [];
    while ((m = re.exec(f)) !== null) hits.push(m);
    if (hits.length !== 1) return null;
    var v = Number(hits[0][1].replace(/,/g, '') + (hits[0][2] || ''));
    if (!isFinite(v)) return null;
    if (hits[0][3]) v *= UNIT_MUL[hits[0][3]];
    return v;
  }

  function evalCalc(s) {
    s = String(s == null ? '' : s).trim();
    if (!s || /%/.test(s)) return null;
    var terms = s.split(/\s*\+\s*/), total = 0;
    for (var i = 0; i < terms.length; i++) {
      var factors = terms[i].split(/\s*[×*]\s*|(?<=[\d원])\s+x\s+(?=\d)/);
      if (factors.length < 2) return null;            // 곱셈이 없는 문구(일시지급 등)는 해석하지 않음
      var prod = 1;
      for (var j = 0; j < factors.length; j++) {
        var v = factorValue(factors[j]);
        if (v == null) return null;
        prod *= v;
      }
      total += prod;
    }
    return Math.round(total);
  }

  // 계산값과 금액이 사실상 같은지 (평균연봉 등 반올림 오차 0.5% 또는 1,000원 허용)
  function matches(calcVal, amount) {
    var a = Number(amount) || 0;
    if (calcVal == null || a === 0) return true;      // 해석 불가·0원(타 부서 통합 반영 등)은 경고하지 않음
    return Math.abs(calcVal - a) <= Math.max(1000, a * 0.005);
  }

  // 입력기용: "400,000원 × 4회" → {price:400000, qty:4, unit:'회'}
  function parseTerms(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return [];
    var out = [], parts = s.split(/\s*\+\s*/);
    for (var i = 0; i < parts.length; i++) {
      var m = parts[i].match(/^\s*(\d[\d,]*)\s*원\s*[×*x]\s*(\d[\d,]*(?:\.\d+)?)\s*([^\d\s+×*]*)\s*$/);
      if (m) { out.push({ price: Number(m[1].replace(/,/g, '')), qty: Number(m[2].replace(/,/g, '')), unit: m[3] || '' }); continue; }
      m = parts[i].match(/^\s*(\d[\d,]*(?:\.\d+)?)\s*([^\d\s+×*]*)\s*[×*x]\s*(\d[\d,]*)\s*원\s*$/);
      if (m) { out.push({ price: Number(m[3].replace(/,/g, '')), qty: Number(m[1].replace(/,/g, '')), unit: m[2] || '' }); continue; }
      return [];
    }
    return out;
  }

  function fmt(n) { return (Number(n) || 0).toLocaleString('ko-KR'); }

  function composeCalc(terms) {
    return terms.filter(function (t) { return t && Number(t.price) > 0 && Number(t.qty) > 0; })
      .map(function (t) { return fmt(t.price) + '원 × ' + fmt(t.qty) + (t.unit || ''); }).join(' + ');
  }
  function sumTerms(terms) {
    return Math.round(terms.reduce(function (s, t) { return s + (Number(t.price) || 0) * (Number(t.qty) || 0); }, 0));
  }

  root.BudgetCalc = { evalCalc: evalCalc, matches: matches, parseTerms: parseTerms, composeCalc: composeCalc, sumTerms: sumTerms };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BudgetCalc;
})(typeof window !== 'undefined' ? window : globalThis);
