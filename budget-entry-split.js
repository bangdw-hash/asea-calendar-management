'use strict';
/**
 * budget-entry-split.js — AI 코드 매칭 뒤 「학기당·분기당·월·회·인당」 문구 정리 (BudgetEntrySplit)
 *  - AI는 문구에서 단위·횟수·금액 문구·기준(단위당/총액)만 읽습니다. 금액 계산(만원 환산·곱셈·나눗셈)은 이 파일에서 정수로 직접 합니다.
 *  - 학기·분기·반기(2~4개)는 줄을 나누고, 월·회·인 등은 한 줄로 두고 금액·산출 근거(단가 × 수량)만 정리합니다.
 *  - 금액이 바뀌는 작업이므로 반드시 미리보기에서 확인한 뒤 반영합니다. 애매하면 직접 고르게 하며, 고르기 전에는 반영하지 않습니다.
 */
(function () {
  var W = window.BW, esc = W.esc, won = W.won, toast = W.toast;
  var SPLIT = { '학기': 1, '분기': 1, '반기': 1 };
  var UNIT_TXT = { '월': '개월', '인': '명', '회': '회', '개': '개', '주': '주', '일': '일', '학기': '학기', '분기': '분기', '반기': '반기' };

  // 「3000만원」「3천만원」「1억2천만원」「30,000,000원」→ 정수(원). 읽을 수 없으면 null
  function krw(text) {
    var s = String(text == null ? '' : text).replace(/[,\s]/g, '').replace(/원$/, '');
    if (!/\d/.test(s)) return null;
    if (/^\d+(\.\d+)?$/.test(s)) { var p = Number(s); return p > 0 && p < 1e12 ? Math.round(p) : null; }
    var M = { '억': 1e8, '천만': 1e7, '백만': 1e6, '십만': 1e5, '만': 1e4, '천': 1e3, '백': 1e2 }, re = /(\d+(?:\.\d+)?)(천만|백만|십만|억|만|천|백)/g, m, sum = 0, used = '';
    while ((m = re.exec(s))) { sum += Number(m[1]) * M[m[2]]; used += m[0]; }
    var rest = s.replace(re, '');
    if (rest !== '' && !/^\d+$/.test(rest)) return null;   // 알 수 없는 글자가 섞이면 읽지 않음
    if (/^\d+$/.test(rest)) sum += Number(rest);
    sum = Math.round(sum);
    return sum > 0 && sum < 1e12 ? sum : null;
  }

  function cleanPer(p) {   // 서버가 준 per 를 한 번 더 걸러냅니다.
    if (!p || typeof p !== 'object') return null;
    var unit = String(p.unit || ''), n = Math.round(Number(p.n) || 0), basis = ['unit', 'total', 'unknown'].indexOf(p.basis) >= 0 ? p.basis : 'unknown';
    if (unit && !UNIT_TXT[unit]) unit = '';
    if (n < 1 || n > 60) n = 0;
    var labels = (Array.isArray(p.labels) ? p.labels : []).map(function (x) { return String(x).slice(0, 10); }).filter(Boolean).slice(0, 4);
    return { unit: unit, n: n, basis: basis, amt: krw(p.amt_text), base: String(p.base || '').trim().slice(0, 120), labels: labels };
  }

  function label(unit, i, n, labels) {
    if (labels.length === n) return labels[i];
    if (unit === '반기') return i === 0 ? '상반기' : '하반기';
    return (i + 1) + unit;
  }
  function joinCalc(c, orig) { orig = String(orig || '').trim(); return (orig && orig !== c ? c + ' / 기존: ' + orig : c).slice(0, 300); }

  // 한 가지 해석(kind: 'unit'=금액이 단위당, 'total'=금액이 총액)으로 만들어지는 줄들
  function rowsFor(r, per, kind, A) {
    var n = per.n, unit = per.unit, base = per.base && per.base.length >= 2 ? per.base : String(r.memo || ''), out = [], ut = UNIT_TXT[unit];
    if (SPLIT[unit] && n >= 2 && n <= 4) {
      var u = kind === 'unit' ? A : Math.floor(A / n), rem = kind === 'unit' ? 0 : A - u * n;
      for (var i = 0; i < n; i++) {
        out.push({ memo: (base + ' (' + label(unit, i, n, per.labels) + ')').slice(0, 300), amount: u + (i === n - 1 ? rem : 0),
                   calc: joinCalc(kind === 'unit' ? won(u) + '원 × 1' + ut : won(A) + '원 ÷ ' + n + ut, r.calc) });
      }
      return out;
    }
    var tot = kind === 'unit' ? A * n : A;
    out.push({ memo: base.slice(0, 300), amount: tot, calc: joinCalc(kind === 'unit' ? won(A) + '원 × ' + n + ut : won(A) + '원 (총액, ' + n + ut + ')', r.calc) });
    return out;
  }
  function sum(rows) { return rows.reduce(function (s, x) { return s + x.amount; }, 0); }

  // 줄 하나에 대한 제안. 제안할 것이 없으면 null.
  function build(r, rawPer) {
    var per = cleanPer(rawPer); if (!per) return null;
    var field = Number(r.amount) || 0, A = per.amt;
    if (!per.unit || !per.n) {   // 기간·수량 문구가 없고 내용에만 금액이 있는 경우: 금액 칸이 비어 있을 때만 채웁니다.
      if (A && !field) return { r: r, per: per, kind: 'fill', choices: [{ key: 'fill', label: '금액 칸 채우기', rows: [{ memo: r.memo, amount: A, calc: r.calc || '' }], keep: true }], auto: 'fill' };
      return null;
    }
    var ch = [], note = '';
    function add(key, lab, kind, amt) { ch.push({ key: key, label: lab, rows: rowsFor(r, per, kind, amt) }); }
    var splitable = SPLIT[per.unit] && per.n >= 2 && per.n <= 4, nm = per.n + per.unit;
    var uLab = function (a) { return '「' + won(a) + '원」을 ' + per.unit + '당 금액으로 보고 ' + (splitable ? per.n + '줄로 나누기' : '× ' + per.n + ' 계산') + ' (합계 ' + won(a * per.n) + '원)'; };
    var tLab = function (a) { return '「' + won(a) + '원」을 ' + (per.n) + per.unit + ' 총액으로 보고 ' + (splitable ? '균등하게 나누기' : '한 줄로 정리') + ' (합계 ' + won(a) + '원)'; };
    var auto = '';
    if (A && !field) {
      if (per.basis === 'unit') { add('unit', uLab(A), 'unit', A); auto = 'unit'; }
      else if (per.basis === 'total') { add('total', tLab(A), 'total', A); auto = 'total'; }
      else { add('unit', uLab(A), 'unit', A); add('total', tLab(A), 'total', A); }
    } else if (A && field) {
      if (field === A * per.n) { add('unit', uLab(A), 'unit', A); auto = 'unit'; }
      else if (field === A && per.basis === 'unit') { add('unit', uLab(A), 'unit', A); auto = 'unit'; }
      else if (field === A && per.basis === 'total') { add('total', tLab(A), 'total', A); auto = 'total'; }
      else { note = '내용의 금액(' + won(A) + '원)과 금액 칸(' + won(field) + '원)이 맞지 않습니다.'; add('unit', uLab(A), 'unit', A); add('total', tLab(A), 'total', A); add('fu', uLab(field).replace('「' + won(field) + '원」을 ', '금액 칸 「' + won(field) + '원」을 '), 'unit', field); }
    } else if (field) {
      note = '금액 칸(' + won(field) + '원)이 ' + per.unit + '당 금액인지 총액인지 문구만으로는 알 수 없습니다.';
      add('unit', uLab(field).replace('「', '금액 칸 「'), 'unit', field); add('total', tLab(field).replace('「', '금액 칸 「'), 'total', field);
    } else return null;
    return { r: r, per: per, kind: 'per', choices: ch, auto: auto, note: note, nm: nm };
  }

  function review(o) {
    var props = o.proposals.filter(Boolean); if (!props.length) return;
    var sel = {};
    var body = '<p class="muted">AI가 내용의 「학기당·분기당·월·회·인당」 문구를 읽어 줄을 나누거나 금액·산출 근거를 채웠습니다. 금액이 바뀌므로 확인한 뒤 반영하십시오. 「확인 필요」는 직접 고르기 전까지 반영되지 않습니다.</p><div class="spl">' +
      props.map(function (p, i) {
        var r = p.r, only = p.choices.length === 1 && p.auto, head = '<div class="spl-h"><b>' + esc(r.memo) + '</b> <span class="muted">현재 금액 ' + (Number(r.amount) ? won(r.amount) + '원' : '없음') + (r.calc ? ' · 산출 ' + esc(r.calc) : '') + '</span></div>';
        if (only) sel[i] = p.auto === 'fill' ? 'fill' : p.choices[0].key;
        var cs = p.choices.map(function (c) {
          var tb = '<table class="bt spl-t"><thead><tr><th>내용</th><th class="num">금액(원)</th><th>산출 근거</th></tr></thead><tbody>' + c.rows.map(function (x) { return '<tr><td>' + esc(x.memo) + '</td><td class="num">' + won(x.amount) + '</td><td>' + esc(x.calc) + '</td></tr>'; }).join('') + '</tbody></table>';
          return (only ? '' : '<label class="spl-c"><input type="radio" name="spl' + i + '" value="' + c.key + '"> ' + esc(c.label) + '</label>') + tb;
        }).join('');
        return '<div class="spl-i" data-i="' + i + '">' + (only ? '<label class="chk-l"><input type="checkbox" data-ok checked> 반영</label>' : '<span class="chip c-orange">확인 필요</span> ' + esc(p.note || '해석이 여러 가지입니다. 하나를 고르십시오.')) + head + cs +
          (only ? '<div class="muted spl-s">합계 ' + (Number(r.amount) ? won(r.amount) : 0) + '원 → <b>' + won(sum(p.choices[0].rows)) + '원</b></div>' : '') + '</div>';
      }).join('') + '</div>';
    var m = W.modal({ title: '학기·분기·월·회·인당 문구 정리 (' + props.length + '건)', cls: 'wide', body: body, actions: [
      { label: '적용 안 함', cls: 'btn-ghost' },
      { label: '선택한 것 반영', cls: 'btn-primary', onClick: function (mm, btn) {
        var picks = [];
        props.forEach(function (p, i) {
          var box = m.el.querySelector('.spl-i[data-i="' + i + '"]'), ok = box.querySelector('[data-ok]'), radio = box.querySelector('input[type=radio]:checked');
          var key = ok ? (ok.checked ? sel[i] : '') : (radio ? radio.value : '');
          var c = p.choices.filter(function (x) { return x.key === key; })[0]; if (c) picks.push({ p: p, c: c });
        });
        if (!picks.length) { toast('반영할 항목을 선택하지 않았습니다. 확인 필요 항목은 해석을 먼저 고르십시오.'); return; }
        btn.disabled = true;
        o.apply(picks).then(function (n) { mm.close(); toast('정리한 내용을 반영했습니다 (' + n + '건).'); }, function (e) { btn.disabled = false; toast(e.message || '반영하지 못했습니다.', 'err'); });
      } }
    ] });
  }

  window.BudgetEntrySplit = { krw: krw, build: build, review: review, cleanPer: cleanPer };
})();
