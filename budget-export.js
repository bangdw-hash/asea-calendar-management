'use strict';
/**
 * budget-export.js — 예산안 내보내기/인쇄 (BudgetExport)
 *  - xlsx: 기초자료(2026 xlsm 열 구조 그대로) / 종합 / 증감분석 / 2026 사용내역
 *  - print: 세입·세출(안) 종합 + 부서별 상세 (브라우저 인쇄 → PDF 저장 가능)
 * 입력: ctx = { year, baseYear, depts:[{dept,active}], codes, lines, spend, subs, caps }
 */
(function () {
  var W = window.BW;

  function deptOrder(ctx) { return ctx.depts.filter(function (d) { return d.active; }).map(function (d) { return d.dept; }); }
  function codeName(ctx, type, code) { for (var i = 0; i < ctx.codes.length; i++) { var c = ctx.codes[i]; if (c.type === type && c.code === code) return c.name; } return ''; }
  function statusOf(ctx, dept, type) { for (var i = 0; i < ctx.subs.length; i++) { var s = ctx.subs[i]; if (s.dept === dept && s.type === type) return s.status; } return 'draft'; }

  function sorted(lines) { return lines.slice().sort(function (a, b) { return W.cmpMok(a.mok, b.mok) || (a.sort - b.sort); }); }

  // 부서·구분별 합계
  function totals(ctx) {
    var spendBy = {}; ctx.spend.forEach(function (s) { spendBy[s.line_id] = (spendBy[s.line_id] || 0) + (Number(s.amount) || 0); });
    var t = {};
    ctx.lines.forEach(function (l) {
      var k = l.dept + '|' + l.type; if (!t[k]) t[k] = { base: 0, used: 0, fc: 0, amt: 0, n: 0 };
      t[k].base += Number(l.base_amount) || 0; t[k].used += spendBy[l.id] || 0; t[k].fc += Number(l.forecast) || 0; t[k].amt += Number(l.amount) || 0; t[k].n++;
    });
    return { by: t, spendBy: spendBy, get: function (d, ty) { return t[d + '|' + ty] || { base: 0, used: 0, fc: 0, amt: 0, n: 0 }; } };
  }

  // 파일명을 확실히 지정하기 위해 Blob 다운로드를 직접 수행
  function saveWorkbook(wb, name) {
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 1000);
  }
  function setCols(ws, widths) { ws['!cols'] = widths.map(function (w) { return { wch: w }; }); }

  function xlsx(ctx, opt) {
    if (!window.XLSX || !XLSX.utils) { W.toast('엑셀 라이브러리를 불러오지 못했습니다.', 'err'); return; }
    opt = opt || {};
    var depts = deptOrder(ctx), tt = totals(ctx), wb = XLSX.utils.book_new();
    var keep = function (l) { return !opt.confirmedOnly || statusOf(ctx, l.dept, l.type) === 'confirmed'; };
    var Y = ctx.year;

    // 1) 기초자료 — 기존 xlsm 입력 양식과 동일한 열 구조
    var head = ['적용시트', '적용부서', '코드\n(#.#.#)', '세부명칭\n(줄 띄우지 말고, 한 줄로 이어서 계속 쓰기)', '산출식\n(줄 띄우지 말고, 한 줄로 이어서 계속 쓰기)', '금액\n(줄 띄우지 말고, 한 줄로 이어서 계속 쓰기)'];
    var rows = [head];
    ['세출', '세입'].forEach(function (type) {
      depts.forEach(function (d) {
        sorted(ctx.lines.filter(function (l) { return l.dept === d && l.type === type && keep(l); })).forEach(function (l) {
          rows.push([type + '예산', d, l.mok, l.name, l.calc, Number(l.amount) || 0]);
        });
      });
    });
    var ws1 = XLSX.utils.aoa_to_sheet(rows); setCols(ws1, [10, 18, 10, 48, 36, 16]); XLSX.utils.book_append_sheet(wb, ws1, '기초자료');

    // 2) 종합
    var tin = 0, tout = 0; depts.forEach(function (d) { tin += tt.get(d, '세입').amt; tout += tt.get(d, '세출').amt; });
    var sum = [[Y + '년도 아세아항공직업전문학교 세입·세출(안) 종합'], [], ['순번', '부서명', '세입(요구)', '비율(%)', '세출(요구)', '비율(%)', '차액(세입-세출)', '세입 상태', '세출 상태']];
    depts.forEach(function (d, i) {
      var a = tt.get(d, '세입').amt, b = tt.get(d, '세출').amt;
      sum.push([i, d, a, tin ? Math.round(a * 1000 / tin) / 10 : 0, b, tout ? Math.round(b * 1000 / tout) / 10 : 0, a - b,
        tt.get(d, '세입').n ? W.stageLabel(statusOf(ctx, d, '세입')) : '-', tt.get(d, '세출').n ? W.stageLabel(statusOf(ctx, d, '세출')) : '-']);
    });
    sum.push(['', '합계', tin, 100, tout, 100, tin - tout, '', '']);
    var ws2 = XLSX.utils.aoa_to_sheet(sum); setCols(ws2, [6, 22, 16, 9, 16, 9, 18, 12, 12]); XLSX.utils.book_append_sheet(wb, ws2, '종합');

    // 3) 증감분석
    var an = [['부서', '구분', '코드', '코드명', '세부명칭', ctx.baseYear + ' 산출식', ctx.baseYear + ' 예산', ctx.baseYear + ' 사용(실적)', '연말 추정', Y + ' 산출식', Y + ' 요구액', '증감액', '증감률(%)', '증감 사유']];
    ['세출', '세입'].forEach(function (type) {
      depts.forEach(function (d) {
        sorted(ctx.lines.filter(function (l) { return l.dept === d && l.type === type && keep(l); })).forEach(function (l) {
          var base = Number(l.base_amount) || 0, amt = Number(l.amount) || 0;
          an.push([d, type, l.mok, codeName(ctx, type, l.mok), l.name, l.base_calc, base, tt.spendBy[l.id] || 0, l.forecast == null ? '' : Number(l.forecast), l.calc, amt, amt - base, base ? Math.round((amt - base) * 1000 / base) / 10 : '', l.reason]);
        });
      });
    });
    var ws3 = XLSX.utils.aoa_to_sheet(an); setCols(ws3, [16, 6, 8, 20, 40, 30, 14, 14, 14, 30, 14, 14, 10, 36]); XLSX.utils.book_append_sheet(wb, ws3, '증감분석');

    // 4) 기준연도 사용내역
    var sp = [['부서', '구분', '코드', '세부명칭', '일자', '적요', '거래처', '금액']];
    var byId = {}; ctx.lines.forEach(function (l) { byId[l.id] = l; });
    ctx.spend.forEach(function (s) { var l = byId[s.line_id]; if (l && keep(l)) sp.push([l.dept, l.type, l.mok, l.name, s.spent_on || '', s.memo, s.vendor, Number(s.amount) || 0]); });
    var ws4 = XLSX.utils.aoa_to_sheet(sp); setCols(ws4, [16, 6, 8, 40, 12, 30, 20, 14]); XLSX.utils.book_append_sheet(wb, ws4, ctx.baseYear + '사용내역');

    saveWorkbook(wb, '예산안_' + Y + (opt.confirmedOnly ? '_확정분' : '') + '.xlsx');
  }

  /* ── 인쇄 ── */
  function printReport(ctx, opt) {
    opt = opt || {};
    var depts = deptOrder(ctx), tt = totals(ctx), Y = ctx.year, e = W.esc, won = W.won;
    var tin = 0, tout = 0; depts.forEach(function (d) { tin += tt.get(d, '세입').amt; tout += tt.get(d, '세출').amt; });
    var today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
    var h = '<section class="pg"><h1>' + Y + '년도 아세아항공직업전문학교 세입·세출(안) 종합</h1><p class="pg-sub">출력일 ' + e(today) + ' · 기준연도 ' + ctx.baseYear + '</p>' +
      '<table class="pt"><thead><tr><th>순번</th><th>부서명</th><th>세입(요구)</th><th>비율(%)</th><th>세출(요구)</th><th>비율(%)</th><th>차액</th></tr></thead><tbody>';
    depts.forEach(function (d, i) {
      var a = tt.get(d, '세입').amt, b = tt.get(d, '세출').amt;
      h += '<tr><td class="c">' + i + '</td><td>' + e(d) + '</td><td class="r">' + won(a) + '</td><td class="r">' + (tin ? (a * 100 / tin).toFixed(1) : '0.0') + '</td><td class="r">' + won(b) + '</td><td class="r">' + (tout ? (b * 100 / tout).toFixed(1) : '0.0') + '</td><td class="r">' + won(a - b) + '</td></tr>';
    });
    h += '</tbody><tfoot><tr><td colspan="2" class="c">합계</td><td class="r">' + won(tin) + '</td><td class="r">100.0</td><td class="r">' + won(tout) + '</td><td class="r">100.0</td><td class="r">' + won(tin - tout) + '</td></tr></tfoot></table>' +
      '<p class="pg-note">※ 금액 단위: 원. 세입·세출 모두 부서 요구액 기준이며 최종 확정 전 초안입니다.</p></section>';
    if (opt.detail) {
      depts.forEach(function (d) {
        ['세입', '세출'].forEach(function (type) {
          var ls = sorted(ctx.lines.filter(function (l) { return l.dept === d && l.type === type; })); if (!ls.length) return;
          var s = tt.get(d, type);
          h += '<section class="pg brk"><h2>' + e(d) + ' · ' + type + '예산 (' + W.stageLabel(statusOf(ctx, d, type)) + ')</h2>' +
            '<table class="pt"><thead><tr><th>코드</th><th>세부명칭</th><th>산출 내역</th><th>' + ctx.baseYear + ' 예산</th><th>' + Y + ' 요구</th><th>증감</th><th>사유</th></tr></thead><tbody>';
          ls.forEach(function (l) {
            var b = Number(l.base_amount) || 0, a = Number(l.amount) || 0;
            h += '<tr><td class="c">' + e(l.mok) + '</td><td>' + e(l.name) + '</td><td>' + e(l.calc) + '</td><td class="r">' + won(b) + '</td><td class="r">' + won(a) + '</td><td class="r">' + (b ? (a >= b ? '+' : '') + ((a - b) * 100 / b).toFixed(1) + '%' : (a ? '신규' : '-')) + '</td><td>' + e(l.reason) + '</td></tr>';
          });
          h += '</tbody><tfoot><tr><td colspan="3" class="c">합계</td><td class="r">' + won(s.base) + '</td><td class="r">' + won(s.amt) + '</td><td colspan="2"></td></tr></tfoot></table></section>';
        });
      });
    }
    var root = document.getElementById('print-root');
    if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
    root.innerHTML = h; document.body.classList.add('is-printing');
    var done = function () { document.body.classList.remove('is-printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(function () { window.print(); }, 50);
  }

  window.BudgetExport = { xlsx: xlsx, print: printReport, totals: totals, statusOf: statusOf, deptOrder: deptOrder };
})();
