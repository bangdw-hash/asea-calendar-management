'use strict';
/**
 * budget-clip.js — 기안문(NNEditor) 붙여넣기용 QR · 예산 현황표 클립보드 복사 (BudgetClip)
 *  - text/html 로 복사: QR 이미지(3cm) + 인라인 스타일 표(편집기가 class·외부 CSS를 지우므로 모두 인라인)
 *  - 복사 내용은 Promise 로 받아, 클릭 직후(사용자 동작 안)에 쓰기를 시작하고 QR 발급이 끝나면 채웁니다.
 */
(function () {
  var FONT = "'Malgun Gothic','Noto Sans KR',sans-serif";
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function won(n) { return n == null ? '-' : Math.round(Number(n)).toLocaleString('ko-KR'); }

  // QR 그림(PNG data URL). 354px ≈ 300dpi 3cm, 가장자리 여백 1칸
  function qrPng(text) {
    var q = window.qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), mg = 1, cell = Math.floor(354 / (n + mg * 2)) || 1, size = (n + mg * 2) * cell;
    var c = document.createElement('canvas'); c.width = c.height = size;
    var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000';
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((k + mg) * cell, (r + mg) * cell, cell, cell);
    return c.toDataURL('image/png');
  }
  function qrImg(png) {
    return '<img src="' + png + '" width="113" height="113" alt="결재 QR" style="width:3cm;height:3cm;max-width:none;border:0;margin:0;padding:0">';
  }

  // rows: [{code, annual, prior, cur, remain}]  (annual·prior·remain 이 null 이면 미배정)
  function tableHtml(rows) {
    var cs = 'border:1px solid #444;padding:4px 8px;font-family:' + FONT + ';font-size:12px;';
    var th = function (t) { return '<th style="' + cs + 'background:#E8F0FE;text-align:center;font-weight:bold;white-space:nowrap">' + t + '</th>'; };
    var tot = { annual: 0, prior: 0, cur: 0, remain: 0, n: 0 };
    var body = rows.map(function (r) {
      var neg = r.remain != null && r.remain < 0, num = cs + 'text-align:right;white-space:nowrap;';
      if (r.annual != null) { tot.annual += r.annual; tot.prior += r.prior; tot.remain += r.remain; tot.n++; }
      tot.cur += r.cur;
      return '<tr><td style="' + cs + '">' + esc(r.code) + '</td><td style="' + num + '">' + won(r.annual) + '</td><td style="' + num + '">' + won(r.prior) + '</td>' +
        '<td style="' + num + 'font-weight:bold;background:#FFF7E0">' + won(r.cur) + '</td><td style="' + num + 'font-weight:bold;' + (neg ? 'color:#CC0000' : '') + '">' + won(r.remain) + '</td></tr>';
    }).join('');
    if (rows.length > 1) {
      var num2 = cs + 'text-align:right;font-weight:bold;background:#F3F4F6;white-space:nowrap;', neg2 = tot.remain < 0;
      body += '<tr><td style="' + cs + 'font-weight:bold;background:#F3F4F6;text-align:center">합 계</td><td style="' + num2 + '">' + won(tot.annual) + '</td><td style="' + num2 + '">' + won(tot.prior) + '</td><td style="' + num2 + '">' + won(tot.cur) + '</td><td style="' + num2 + (neg2 ? 'color:#CC0000' : '') + '">' + won(tot.remain) + '</td></tr>';
    }
    return '<table border="1" cellspacing="0" cellpadding="4" style="width:auto;border-collapse:collapse;border:1px solid #444;font-family:' + FONT + ';font-size:12px"><thead><tr>' +
      th('예산코드') + th('연간예산') + th('기존 집행') + th('이번 집행') + th('잔여 예산') + '</tr></thead><tbody>' + body + '</tbody></table>';
  }
  function caption() {
    var d = new Date(), s = d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate();
    return '<div style="font-family:' + FONT + ';font-size:11px;color:#444;margin-top:3px">' + s + ' 기준 · 결재 후 QR을 스캔해 「반영」하면 집행으로 확정됩니다.</div>';
  }
  // QR 왼쪽 + 표 오른쪽 (표 레이아웃: 편집기에서 가장 안전)
  function bothHtml(png, rows) {
    return '<table border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><td valign="top" style="padding:0 12px 0 0;width:3cm">' + qrImg(png) +
      '</td><td valign="top" style="padding:0">' + tableHtml(rows) + caption() + '</td></tr></table><p style="margin:0">&nbsp;</p>';
  }
  function plain(rows) {
    return ['예산코드\t연간예산\t기존 집행\t이번 집행\t잔여 예산'].concat(rows.map(function (r) { return [r.code, won(r.annual), won(r.prior), won(r.cur), won(r.remain)].join('\t'); })).join('\n');
  }

  /**
   * kind: 'both' | 'qr' | 'table'; info: Promise<{url, rows}>
   * 사용자 클릭 처리 중 동기적으로 호출해야 합니다.
   */
  function copy(kind, info) {
    var htmlP = info.then(function (x) {
      if (kind === 'table') return tableHtml(x.rows) + caption();
      var png = qrPng(x.url);
      return kind === 'qr' ? qrImg(png) : bothHtml(png, x.rows);
    });
    var textP = info.then(function (x) { return kind === 'qr' ? x.url : plain(x.rows); });
    if (navigator.clipboard && window.ClipboardItem) {
      return navigator.clipboard.write([new ClipboardItem({
        'text/html': htmlP.then(function (h) { return new Blob([h], { type: 'text/html' }); }),
        'text/plain': textP.then(function (t) { return new Blob([t], { type: 'text/plain' }); })
      })]);
    }
    return htmlP.then(function (h) { // 구형 브라우저 대체 경로
      var d = document.createElement('div'); d.contentEditable = 'true'; d.style.cssText = 'position:fixed;left:-9999px;top:0'; d.innerHTML = h; document.body.appendChild(d);
      var rg = document.createRange(); rg.selectNodeContents(d); var s = getSelection(); s.removeAllRanges(); s.addRange(rg);
      var ok = document.execCommand('copy'); s.removeAllRanges(); d.remove();
      if (!ok) throw new Error('복사하지 못했습니다.');
    });
  }

  window.BudgetClip = { copy: copy, tableHtml: tableHtml, bothHtml: bothHtml, qrPng: qrPng };
})();
