'use strict';
/**
 * budget-entry-xlsx.js — 입력판 엑셀 양식 받기 · 올리기 (BudgetEntryXlsx)
 *  양식에는 코드 칸이 없습니다. 올린 뒤 「AI로 코드 매칭하기」로 코드를 정합니다.
 */
(function () {
  var W = window.BW, esc = W.esc, won = W.won, num = W.num, toast = W.toast, ico = W.ico;
  var ROWS = 40;

  function download(wb, name) {
    var bytes = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  function template(o) {
    if (!o.dept) return toast('부서를 먼저 선택해 주십시오.', 'err');
    if (!window.XLSX) return toast('엑셀 모듈을 불러오지 못했습니다.', 'err');
    var wb = XLSX.utils.book_new(), acad = o.dept === '입학처';
    var rows = [[o.year + '년도 ' + o.dept + ' 입력 양식'],
      ['※ 코드는 적지 않습니다. 시기는 「올해 집행」 또는 「내년 계획」, 구분은 「세출」 또는 「세입」으로 적습니다. 올린 뒤 입력판에서 「AI로 코드 매칭하기」를 누르십시오.'],
      ['시기', '구분', '일자', '적요(내용)', '거래처', '금액(원)', '산출 근거(내년 계획)']];
    for (var i = 0; i < ROWS; i++) rows.push(['올해 집행', '세출', '', '', '', '', '']);
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 11 }, { wch: 7 }, { wch: 12 }, { wch: 44 }, { wch: 20 }, { wch: 14 }, { wch: 34 }];
    XLSX.utils.book_append_sheet(wb, ws, '입력');
    var guide = [[o.dept + ' 입력 안내'], [''],
      ['1. 「입력」 시트의 4번째 줄부터 한 줄에 한 건씩 적습니다. 시기·구분 칸은 미리 「올해 집행 / 세출」로 채워져 있으니 다른 경우만 고치십시오.'],
      ['2. 올해 집행(수납): 일자(예: 2026-10-14)·적요·거래처·금액을 적습니다. ' + (acad ? '입학처는 학년도(3월~익년 2월) 기준으로 적습니다.' : '일자는 올해 1월~12월 안에서 적습니다.')],
      ['3. 내년 계획: 적요 칸에 계획 내용(세부명칭), 산출 근거 칸에 단가×수량, 금액 칸에 합계를 적습니다.'],
      ['4. 코드(목)는 적지 않습니다. 입력판 화면에서 「엑셀 올리기」 후 「AI로 코드 매칭하기」를 누르면 기존 코드표에서 자동으로 정해지며, 틀린 것은 직접 고칠 수 있습니다.'],
      ['5. 이 양식은 부서(' + o.dept + ') 전용입니다. 다른 부서 파일을 올리지 마십시오.']];
    var g = XLSX.utils.aoa_to_sheet(guide); g['!cols'] = [{ wch: 130 }];
    XLSX.utils.book_append_sheet(wb, g, '안내');
    download(wb, o.year + '_' + o.dept + '_입력양식.xlsx');
    toast('양식을 내려받았습니다.');
  }

  function dstr(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) { var t = new Date(v.getTime() + 12 * 3600 * 1000); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); }
    if (typeof v === 'number') { var d = new Date(Math.round((v - 25569) * 86400 * 1000)); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
    var m = String(v).trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : null;
  }
  function parse(buf) {
    var wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
    var ws = wb.Sheets['입력'] || wb.Sheets[wb.SheetNames[0]];
    var a = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    var hi = -1; for (var i = 0; i < a.length && i < 15; i++) if (String(a[i][0]).trim() === '시기') { hi = i; break; }
    if (hi < 0) throw new Error('「입력」 시트에서 머리글(시기·구분·일자·…)을 찾지 못했습니다. 내려받은 양식을 사용해 주십시오.');
    var col = {}; a[hi].forEach(function (h, k) { h = String(h); if (/^시기/.test(h)) col.ph = k; else if (/^구분/.test(h)) col.ty = k; else if (/^일자/.test(h)) col.dt = k; else if (/^적요|^내용/.test(h)) col.memo = k; else if (/^거래처/.test(h)) col.vendor = k; else if (/^금액/.test(h)) col.amount = k; else if (/^산출/.test(h)) col.calc = k; });
    var items = [], errs = [];
    for (var r = hi + 1; r < a.length; r++) {
      var x = a[r], memo = String(x[col.memo] == null ? '' : x[col.memo]).trim(), amt = x[col.amount];
      if (!memo && (amt === '' || amt == null)) continue;
      var amount = typeof amt === 'number' ? Math.round(amt) : num(amt); if (amount == null || isNaN(amount) || amount < 0) { errs.push((r + 1) + '행: 금액을 확인해 주십시오.'); continue; }
      var ph = /내년|계획|plan/i.test(String(x[col.ph])) ? 'plan' : 'actual', ty = /세입|수납/.test(String(x[col.ty])) ? '세입' : '세출';
      var it = { phase: ph, type: ty, memo: memo, vendor: String(x[col.vendor] || '').trim(), amount: amount, calc: String(x[col.calc] || '').trim(), entry_date: ph === 'actual' ? dstr(x[col.dt]) : null };
      if (ph === 'actual' && x[col.dt] !== '' && !it.entry_date) errs.push((r + 1) + '행: 일자 형식을 확인해 주십시오 (예: 2026-10-14). 일자 없이 올립니다.');
      items.push(it);
    }
    return { items: items, errs: errs };
  }
  function upload(file, o) {
    if (!o.board.canEdit()) return toast('지금은 입력할 수 없습니다.', 'err');
    if (o.board.admin && !o.board.dept()) return toast('부서를 먼저 선택해 주십시오.', 'err');
    var fr = new FileReader();
    fr.onload = function () {
      var res; try { res = parse(fr.result); } catch (e) { return toast(e.message, 'err'); }
      if (!res.items.length) return toast('올릴 내용이 없습니다. 4번째 줄부터 적었는지 확인해 주십시오.', 'err');
      var cnt = {}; res.items.forEach(function (i) { var k = (i.phase === 'plan' ? '내년 계획' : '올해 집행') + ' · ' + i.type; cnt[k] = (cnt[k] || 0) + 1; });
      var tot = res.items.reduce(function (s, i) { return s + i.amount; }, 0);
      W.modal({ title: '엑셀 올리기 확인', cls: 'wide', body: '<p><b>' + esc(file.name) + '</b>에서 <b>' + res.items.length + '건</b>(합계 ' + won(tot) + '원)을 읽었습니다.</p><p>' + Object.keys(cnt).map(function (k) { return '<span class="chip c-blue">' + esc(k) + ' ' + cnt[k] + '건</span>'; }).join(' ') + '</p>' +
        (res.errs.length ? '<div class="note warn">' + ico('alert', 16) + ' <span>' + res.errs.slice(0, 6).map(esc).join('<br>') + '</span></div>' : '') +
        '<div class="tbl-wrap"><table class="bt"><thead><tr><th>시기</th><th>구분</th><th>일자</th><th>내용</th><th>거래처</th><th class="num">금액</th></tr></thead><tbody>' + res.items.slice(0, 8).map(function (i) {
          return '<tr><td>' + (i.phase === 'plan' ? '내년 계획' : '올해 집행') + '</td><td>' + i.type + '</td><td>' + esc(i.entry_date || '') + '</td><td>' + esc(i.memo) + '</td><td>' + esc(i.vendor) + '</td><td class="num">' + won(i.amount) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        (res.items.length > 8 ? '<p class="muted">… 외 ' + (res.items.length - 8) + '건</p>' : '') + '<p class="muted">올린 뒤 「AI로 코드 매칭하기」를 눌러 코드를 정하십시오. 기존에 적은 내용은 그대로 두고 추가됩니다.</p>',
        actions: [{ label: '취소', cls: 'btn-ghost' }, { label: res.items.length + '건 올리기', cls: 'btn-primary', onClick: function (m, b) {
          b.disabled = true; var chain = Promise.resolve(), n = 0;
          for (var i = 0; i < res.items.length; i += 100) (function (chunk) { chain = chain.then(function () { return o.board.addMany(chunk).then(function (k) { n += k; }); }); })(res.items.slice(i, i + 100));
          chain.then(function () { m.close(); toast(n + '건을 올렸습니다. 이제 「AI로 코드 매칭하기」를 누르십시오.'); }).catch(function (e) { b.disabled = false; toast(e.message, 'err'); });
        } }] });
    };
    fr.readAsArrayBuffer(file);
  }
  window.BudgetEntryXlsx = { template: template, upload: upload };
})();
