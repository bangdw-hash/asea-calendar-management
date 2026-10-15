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
  // QR 왼쪽 + 현황표 오른쪽: 표 하나(QR 칸을 세로로 합친 구조). 중첩 표·float 은 편집기에서 깨지기 쉬워
  // 모든 서식을 속성(border·bgcolor·width·align)과 style 양쪽에 중복 지정합니다.
  function bothHtml(png, rows, o) {
    o = o || {};
    var B = '1px solid #444', base = 'font-family:' + FONT + ';font-size:12px;';
    var cell = function (w, al, bg, st, inner, extra) {
      return '<td' + (w ? ' width="' + w + '"' : '') + ' align="' + al + '"' + (bg ? ' bgcolor="' + bg + '"' : '') + (extra || '') +
        ' style="' + base + 'border:' + B + ';padding:4px 8px;' + (w ? 'width:' + w + 'px;' : '') + (bg ? 'background-color:' + bg + ';' : '') + st + '">' + inner + '</td>';
    };
    var head = ['예산코드', '연간예산', '기존 집행', '이번 집행', '잔여 예산'], W = [170, 96, 96, 96, 96];
    var tot = { annual: 0, prior: 0, cur: 0, remain: 0 };
    var d = new Date(), ds = d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate();
    var n = rows.length + (rows.length > 1 ? 1 : 0) + 2; // 머리글 + 자료 + (합계) + 안내
    var h = '<table border="1" cellspacing="0" cellpadding="4" width="654" bordercolor="#444444" style="width:654px;border-collapse:collapse;border:' + B + '"><tbody><tr>' +
      cell(126, 'center', '', 'text-align:center;vertical-align:middle;padding:6px;', (png ? qrImg(png) : '<div style="width:113px;height:113px;border:1px dashed #999;font-size:11px;color:#666;text-align:center;line-height:1.5;padding-top:40px;box-sizing:border-box">QR<br>복사 시 생성</div>') + '<div style="font-size:10px;color:#444;margin-top:4px">결재 QR<br>스캔하여 반영</div>', ' rowspan="' + n + '" valign="middle"') +
      head.map(function (t, i) { return cell(W[i], 'center', '#E8F0FE', 'text-align:center;font-weight:bold;white-space:nowrap;', t); }).join('') + '</tr>';
    rows.forEach(function (r, ri) {
      if (r.annual != null) { tot.annual += r.annual; tot.prior += r.prior; tot.remain += r.remain; }
      tot.cur += r.cur;
      var neg = r.remain != null && r.remain < 0, rt = 'text-align:right;white-space:nowrap;';
      h += '<tr>' + cell(W[0], 'left', '', '', esc(r.code)) + cell(W[1], 'right', '', rt, won(r.annual)) + cell(W[2], 'right', '', rt, won(r.prior)) +
        cell(W[3], 'right', '#FFF7E0', rt + 'font-weight:bold;', o.cur ? o.cur(ri, r) : won(r.cur)) + cell(W[4], 'right', '', rt + 'font-weight:bold;' + (neg ? 'color:#CC0000;' : ''), neg ? '<font color="#CC0000">' + won(r.remain) + '</font>' : won(r.remain)) + '</tr>';
    });
    if (rows.length > 1) {
      var g = 'font-weight:bold;white-space:nowrap;', ng = tot.remain < 0;
      h += '<tr>' + cell(W[0], 'center', '#F3F4F6', g + 'text-align:center;', '합 계') + cell(W[1], 'right', '#F3F4F6', g + 'text-align:right;', won(tot.annual)) + cell(W[2], 'right', '#F3F4F6', g + 'text-align:right;', won(tot.prior)) +
        cell(W[3], 'right', '#F3F4F6', g + 'text-align:right;', won(tot.cur)) + cell(W[4], 'right', '#F3F4F6', g + 'text-align:right;' + (ng ? 'color:#CC0000;' : ''), ng ? '<font color="#CC0000">' + won(tot.remain) + '</font>' : won(tot.remain)) + '</tr>';
    }
    h += '<tr>' + cell(0, 'left', '', 'font-size:11px;color:#444;', ds + ' 기준 · 결재 후 QR을 스캔해 「반영」하면 집행으로 확정됩니다. (단위: 원)', ' colspan="5"') + '</tr></tbody></table><p style="margin:0">&nbsp;</p>';
    return h;
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
