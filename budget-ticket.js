'use strict';
/**
 * budget-ticket.js — 결재 QR 집행 연동 (BudgetTicket)
 *  - QR 그림 생성/저장/복사/인쇄
 *  - 부서 화면: QR 발급 · 목록 · 상세/수정반영 · 이력
 *  - 관리자 화면: 전체 · 미배정 배정 · 조정 필요 · 결재액 불일치 · 예비비 사용 · 무효
 *  - budget-qr.html(스캔 화면)에서도 공용 함수(lineTitle, qrUrl 등)를 씁니다.
 *  서버 규칙은 db/budget_schema_5.sql 에 있으며, 이 파일은 화면과 호출만 담당합니다.
 */
(function () {
  var W = window.BW, $ = W.$, $$ = W.$$, esc = W.esc, won = W.won, num = W.num, ico = W.ico, toast = W.toast;

  var KIND = { issue: 'QR 발급', apply: '반영', reapply: '수정반영', assign: '배정', void: '무효 처리', manual_edit: '직접 수정', manual_delete: '직접 삭제' };
  var STATUS = { issued: ['반영 전', 'c-gray'], applied: ['반영 완료', 'c-green'], void: ['무효', 'c-red'] };
  var RESERVE_MOK = '7.2.1';

  function statusChip(st) { var s = STATUS[st] || STATUS.issued; return '<span class="chip ' + s[1] + '">' + s[0] + '</span>'; }
  function qrUrl(token) { return location.origin + location.pathname.replace(/[^\/]*$/, '') + 'budget-qr.html?t=' + encodeURIComponent(token); }
  function fail(e) { toast(e.message, 'err'); }
  function dstr(v) { return v ? String(v).slice(0, 10) : ''; }

  /* ───────── 표시 문구 ───────── */
  function lineTitle(l) {
    var t = l.target;
    if (l.alloc === 'pending' || !t) return '<span class="flag warn">미배정</span> 제안 부서 ' + esc(l.prop_dept || '-') + (l.prop_mok ? ' · ' + esc(l.prop_mok) : '') + (l.prop_note ? ' · ' + esc(l.prop_note) : '');
    return (l.alloc === 'reserve' ? '<span class="flag info">예비비</span> ' : '') + esc(t.dept) + ' · ' + esc(t.mok) + ' ' + esc(t.name) +
      (t.origin === 'unplanned' ? ' <span class="flag warn">미편성 신규</span>' : '') + (l.alloc === 'reserve' && l.prop_note ? ' <span class="muted">(' + esc(l.prop_note) + ')</span>' : '');
  }
  function snapWhere(s) {
    if (!s) return '';
    if (s.alloc === 'pending' || !s.line_id) return '미배정(제안 ' + (s.dept || '-') + ')';
    return (s.alloc === 'reserve' ? '[예비비] ' : '') + (s.dept || '') + ' ' + (s.mok || '') + ' ' + (s.name || '');
  }
  function snapAmt(s) { return s ? (s.applied == null ? s.planned : s.applied) : null; }

  function diffHtml(ev) {
    var o = ev.old, n = ev.new, rows = [];
    if (ev.kind === 'manual_edit' || ev.kind === 'manual_delete') {
      var oa = o && o.amount, na = n && n.amount;
      return '<li>지출 금액 ' + (oa == null ? '-' : won(oa)) + ' → ' + (na == null ? '삭제' : won(na)) + '원</li>';
    }
    if (!Array.isArray(n)) return ev.kind === 'void' ? '<li>QR 무효 처리, 연결된 지출 기록 삭제</li>' : '';
    n.forEach(function (ln) {
      var ol = Array.isArray(o) ? o.filter(function (x) { return x.id === ln.id; })[0] : null;
      var parts = [];
      if (ev.kind === 'issue') { rows.push('<li>' + esc(snapWhere(ln)) + ' · ' + esc(ln.memo || '') + ' · 예정 ' + won(ln.planned) + '원</li>'); return; }
      if (!ol) parts.push('줄 추가 ' + won(snapAmt(ln)) + '원');
      else {
        if (snapAmt(ol) !== snapAmt(ln)) parts.push('금액 ' + won(snapAmt(ol)) + ' → ' + won(snapAmt(ln)) + '원');
        if (snapWhere(ol) !== snapWhere(ln)) parts.push(esc(snapWhere(ol)) + ' → ' + esc(snapWhere(ln)));
      }
      if (parts.length) rows.push('<li>' + esc(ln.memo || snapWhere(ln)) + ': ' + parts.join(' / ') + '</li>');
    });
    return rows.join('');
  }

  /* ───────── QR 그림 ───────── */
  function qrCanvas(text, caption) {
    if (!window.qrcode) throw new Error('QR 라이브러리를 불러오지 못했습니다. 새로고침해 주십시오.');
    var q = window.qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), cell = 8, mg = 4, size = (n + mg * 2) * cell, capH = caption && caption.length ? 34 * caption.length + 8 : 0;
    var c = document.createElement('canvas'); c.width = size; c.height = size + capH;
    var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((k + mg) * cell, (r + mg) * cell, cell, cell);
    if (capH) {
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      caption.forEach(function (t, i) {
        g.font = (i === 0 ? '700 ' : '400 ') + '22px "Noto Sans KR", "Malgun Gothic", sans-serif';
        var s = String(t);
        while (g.measureText(s).width > size - 24 && s.length > 4) s = s.slice(0, -2);
        if (s !== String(t)) s += '…';
        g.fillStyle = '#000'; g.fillText(s, size / 2, size + 26 + i * 34);
      });
    }
    return c;
  }
  function safeName(s) { return String(s || 'QR').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40); }

  function showQr(tk) {
    var t = tk.ticket, url = qrUrl(t.token), canvas;
    try { canvas = qrCanvas(url, ['결재 집행 QR', t.title]); } catch (e) { return fail(e); }
    var png = canvas.toDataURL('image/png');
    W.modal({
      title: '결재 QR',
      body: '<div class="qr-box"><img class="qr-img" src="' + png + '" alt="결재 집행 QR 코드"></div>' +
        '<p class="muted">이 이미지를 기안문(결재문)에 삽입하십시오. 결재 후 누구나 스캔해 결재번호와 금액을 확인하고 한 번만 반영할 수 있습니다. 반영 후 수정은 부서·관리자 로그인이 필요합니다.</p>' +
        '<div class="acts qr-acts"><button class="btn btn-primary btn-sm" data-q="png">' + ico('download', 16) + ' 이미지 저장</button>' +
        '<button class="btn btn-secondary btn-sm" data-q="copy">이미지 복사</button><button class="btn btn-secondary btn-sm" data-q="link">링크 복사</button>' +
        '<button class="btn btn-secondary btn-sm" data-q="print">' + ico('print', 16) + ' 인쇄</button></div>',
      actions: [{ label: '닫기', cls: 'btn-ghost' }],
      onMount: function (m) {
        m.el.addEventListener('click', function (e) {
          var b = e.target.closest('[data-q]'); if (!b) return; var a = b.dataset.q;
          if (a === 'png') canvas.toBlob(function (bl) {
            var l = document.createElement('a'); l.href = URL.createObjectURL(bl); l.download = 'QR_' + safeName(t.title) + '.png';
            document.body.appendChild(l); l.click(); setTimeout(function () { URL.revokeObjectURL(l.href); l.remove(); }, 800);
          });
          if (a === 'copy') canvas.toBlob(function (bl) {
            if (navigator.clipboard && window.ClipboardItem) navigator.clipboard.write([new ClipboardItem({ 'image/png': bl })]).then(function () { toast('이미지를 복사했습니다. 기안문에 붙여넣으십시오.'); }, function () { toast('복사하지 못했습니다. 이미지 저장을 이용해 주십시오.', 'err'); });
            else toast('이 브라우저에서는 복사를 지원하지 않습니다. 이미지 저장을 이용해 주십시오.', 'err');
          });
          if (a === 'link') { if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast('링크를 복사했습니다.'); }, function () { toast(url); }); else toast(url); }
          if (a === 'print') {
            var w = window.open('', '_blank'); if (!w) return toast('팝업이 차단되었습니다.', 'err');
            w.document.write('<!doctype html><title>QR</title><body style="margin:0;text-align:center"><img src="' + png + '" style="width:80mm"><script>onload=function(){print()}<\/script></body>');
            w.document.close();
          }
        });
      }
    });
  }

  /* ───────── 공용 입력 ───────── */
  function moneyFmt(root) {
    root.addEventListener('focusout', function (e) {
      if (e.target.classList && e.target.classList.contains('money')) { var v = num(e.target.value); e.target.value = v == null ? '' : won(v); }
    });
  }
  function deptOptions(depts, sel) { return depts.map(function (d) { return '<option' + (d === sel ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join(''); }
  function usedMap(spend) { var m = {}; (spend || []).forEach(function (s) { m[s.line_id] = (m[s.line_id] || 0) + (Number(s.amount) || 0); }); return m; }
  function sechulLines(lines, dept) { return lines.filter(function (l) { return l.type === '세출' && (!dept || l.dept === dept); }).sort(function (a, b) { return W.cmpMok(a.mok, b.mok) || (a.sort - b.sort); }); }
  function lineOptions(lines, used, sel, blank) {
    return (blank ? '<option value="">' + esc(blank) + '</option>' : '') + lines.map(function (l) {
      var u = used[l.id] || 0, bal = (Number(l.base_amount) || 0) - u;
      return '<option value="' + l.id + '"' + (l.id === sel ? ' selected' : '') + '>' + esc(l.mok + ' ' + l.name) + ' · 예산 ' + won(l.base_amount) + ' / 집행 ' + won(u) + ' / 잔액 ' + won(bal) + '</option>';
    }).join('');
  }
  function codeOptions(codes, sel) {
    return '<option value="">예산 코드 미정</option>' + codes.filter(function (c) { return c.type === '세출' && c.level === 'mok' && c.active !== false; })
      .sort(function (a, b) { return W.cmpMok(a.code, b.code); }).map(function (c) { return '<option value="' + esc(c.code) + '"' + (c.code === sel ? ' selected' : '') + '>' + esc(c.code + ' ' + c.name) + '</option>'; }).join('');
  }
  function tbl(heads, rows, cls) {
    return '<div class="tbl-wrap"><table class="bt ' + (cls || '') + '"><thead><tr>' + heads.map(function (h) { return '<th' + (h.charAt(0) === '>' ? ' class="num"' : '') + '>' + esc(h.replace(/^>/, '')) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (rows.length ? rows.join('') : '<tr><td colspan="' + heads.length + '" class="muted" style="text-align:center;padding:24px">해당 내역이 없습니다.</td></tr>') + '</tbody></table></div>';
  }
  function saveXlsx(name, sheet, aoa, widths) {
    if (!window.XLSX || !XLSX.utils) return toast('엑셀 라이브러리를 불러오지 못했습니다.', 'err');
    var ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = widths.map(function (w) { return { wch: w }; });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheet);
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  /* ───────── 이력 ───────── */
  function eventsModal(tk, ctx) {
    W.rpc('bgt_ticket_events', { p_token: ctx.token, p_ticket_id: tk.ticket.id }).then(function (list) {
      var h = list.length ? '<ol class="ev-list">' + list.map(function (ev) {
        var meta = ev.meta && (ev.meta.ip || ev.meta.ua) ? '<div class="muted ev-meta">접속 ' + esc(ev.meta.ip || '-') + ' · ' + esc(ev.meta.ua || '') + '</div>' : '';
        return '<li><div class="ev-hd"><b>' + esc(KIND[ev.kind] || ev.kind) + '</b><span class="muted">' + esc(ev.actor) + ' · ' + W.fmtDT(ev.at) + (ev.doc_no ? ' · 결재 ' + esc(ev.doc_no) : '') + '</span></div>' +
          (ev.reason ? '<div class="ev-r">사유: ' + esc(ev.reason) + '</div>' : '') + '<ul class="ev-d">' + diffHtml(ev) + '</ul>' + meta + '</li>';
      }).join('') + '</ol>' : '<p class="muted">이력이 없습니다.</p>';
      W.modal({ title: '변경 이력 — ' + tk.ticket.title, cls: 'wide', body: '<p class="muted">모든 반영·수정·배정·무효 처리가 변경 전후 값과 함께 기록되며 삭제할 수 없습니다.</p>' + h, actions: [{ label: '닫기', cls: 'btn-ghost' }] });
    }).catch(fail);
  }

  /* ───────── 상세 ───────── */
  function detailModal(tk, ctx) {
    var t = tk.ticket, admin = ctx.role === 'admin';
    var diff = t.status === 'applied' && Number(t.applied_total) !== Number(t.planned_total);
    var rows = tk.lines.map(function (l) {
      var tg = l.target;
      var bud = tg ? '<div class="muted">현재 예산 ' + won(tg.budget) + ' · 집행 ' + won(tg.used) + ' · <b class="' + (tg.budget - tg.used < 0 ? 'neg' : '') + '">잔액 ' + won(tg.budget - tg.used) + '</b></div>' : '';
      return '<tr><td>' + lineTitle(l) + '<div class="muted">' + esc(l.memo || '') + (l.vendor ? ' · ' + esc(l.vendor) : '') + '</div>' + bud + '</td><td class="num">' + won(l.planned) + '</td><td class="num"><b>' + (l.applied == null ? '-' : won(l.applied)) + '</b></td>' +
        '<td class="acts">' + (admin && t.status !== 'void' ? '<button class="btn btn-secondary btn-sm" data-assign="' + l.id + '">' + (l.alloc === 'pending' ? '배정' : '재배정') + '</button>' : '') + '</td></tr>';
    });
    var body = '<div class="kpis"><div class="kpi"><div class="kpi-l">결재번호</div><div class="kpi-v sm">' + esc(t.doc_no || '반영 전') + '</div></div>' +
      '<div class="kpi"><div class="kpi-l">결재 기준액</div><div class="kpi-v sm">' + won(t.planned_total) + '<small>원</small></div></div>' +
      '<div class="kpi' + (diff ? ' warnk' : '') + '"><div class="kpi-l">반영액</div><div class="kpi-v sm">' + (t.applied_total == null ? '-' : won(t.applied_total) + '<small>원</small>') + '</div></div>' +
      '<div class="kpi"><div class="kpi-l">상태</div><div class="kpi-v sm">' + statusChip(t.status) + '</div></div></div>' +
      '<p class="muted">발급 부서 ' + esc(t.dept) + ' · 발급 ' + W.fmtDT(t.issued_at) + (t.applied_at ? ' · 반영 ' + W.fmtDT(t.applied_at) : '') + ' · 스캔 ' + t.scans + '회' + (t.void_reason ? ' · 무효 사유: ' + esc(t.void_reason) : '') + '</p>' +
      (diff ? '<div class="note warn">' + ico('alert', 16) + ' 반영액이 결재 기준액과 ' + won(Math.abs(t.applied_total - t.planned_total)) + '원 다릅니다.</div>' : '') +
      '<div class="tbl-wrap"><table class="bt"><thead><tr><th>귀속 / 적요 / 예산 현황</th><th class="num">기준액</th><th class="num">반영액</th><th></th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
    var acts = [{ label: '닫기', cls: 'btn-ghost' }, { label: '이력', cls: 'btn-secondary', onClick: function () { eventsModal(tk, ctx); } }, { label: 'QR 보기', cls: 'btn-secondary', onClick: function () { showQr(tk); } }];
    if (tk.can_edit) acts.push({ label: admin ? '수정반영 (관리자)' : '수정반영', cls: 'btn-primary', onClick: function (m) { m.close(); editModal(tk, ctx); } });
    if (admin && t.status !== 'void') acts.push({ label: '무효 처리', cls: 'btn-danger', onClick: function (m) { voidAdmin(tk, ctx, m); } });
    if (!admin && t.status === 'issued' && t.dept === ctx.dept) acts.push({ label: '무효(오발급)', cls: 'btn-danger', onClick: function (m) {
      W.confirmBox('반영 전인 이 QR을 무효로 합니다. 이미 기안문에 넣었다면 새 QR로 교체해야 합니다.', '무효 처리', true).then(function (ok) {
        if (!ok) return; W.rpc('bgt_d_ticket_void', { p_token: ctx.token, p_ticket_id: t.id, p_reason: '발급 부서 무효 처리' }).then(function () { m.close(); toast('무효 처리했습니다.'); ctx.reload(); }).catch(fail);
      });
    } });
    var m = W.modal({ title: t.title, cls: 'wide', body: body, actions: acts });
    m.el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-assign]'); if (!b) return;
      var line = tk.lines.filter(function (x) { return x.id === b.dataset.assign; })[0];
      m.close(); assignModal(tk, line, ctx);
    });
  }

  function askReason(title, msg, label) {
    return new Promise(function (resolve) {
      var done = false;
      W.modal({ title: title, body: '<p class="mdl-msg">' + esc(msg) + '</p><div class="form"><label>' + esc(label || '사유') + '<textarea id="rs-r" class="in" rows="3"></textarea></label></div>',
        actions: [{ label: '취소', cls: 'btn-ghost', onClick: function (m) { done = true; m.close(); resolve(null); } },
          { label: '확인', cls: 'btn-primary', onClick: function (m) { var v = $('#rs-r', m.el).value.trim(); if (!v) return toast('사유를 입력해 주십시오.', 'err'); done = true; m.close(); resolve(v); } }],
        onClose: function () { if (!done) resolve(null); } });
    });
  }
  function voidAdmin(tk, ctx, m) {
    askReason('QR 무효 처리', '결재 취소·반려 등으로 이 QR을 무효로 합니다. 연결된 지출 기록이 삭제되고, 이력은 남습니다.', '무효 사유').then(function (r) {
      if (!r) return;
      W.rpc('bgt_a_ticket_void', { p_token: ctx.token, p_ticket_id: tk.ticket.id, p_reason: r }).then(function () { m.close(); toast('무효 처리했습니다.'); ctx.reload(); }).catch(fail);
    });
  }

  /* ───────── 수정반영 (부서 · 관리자 공용) ───────── */
  function negText(list) {
    return list.map(function (n) { return n.dept + ' ' + n.mok + ' ' + n.name + ': 예산 ' + won(n.budget) + '원, 반영 후 집행 ' + won(n.after_used) + '원 (잔액 ' + won(n.balance) + '원)'; }).join('\n');
  }
  function editModal(tk, ctx) {
    var t = tk.ticket, admin = ctx.role === 'admin', extra = [];
    function rowsHtml() {
      return tk.lines.map(function (l) {
        return '<div class="ed-row" data-id="' + l.id + '"><div class="ed-t">' + lineTitle(l) + ' <span class="muted">기준 ' + won(l.planned) + '원</span></div>' +
          '<div class="form row"><label>적요<input class="in" data-k="memo" value="' + esc(l.memo) + '"></label><label>일자<input class="in" type="date" data-k="spent_on" value="' + dstr(l.spent_on) + '"></label>' +
          '<label>금액(원)<input class="in num money" data-k="amount" inputmode="numeric" value="' + won(l.applied == null ? l.planned : l.applied) + '"></label></div></div>';
      }).join('');
    }
    function extraHtml() {
      return extra.map(function (x, i) {
        return '<div class="ed-row" data-new="' + i + '"><div class="ed-t">분할 줄 (미배정으로 추가, 저장 후 배정) <button class="lnk" data-rm="' + i + '" type="button">삭제</button></div><div class="form row">' +
          '<label>제안 부서<select class="in" data-k="prop_dept">' + deptOptions(ctx.depts, x.prop_dept) + '</select></label><label>적요<input class="in" data-k="memo" value="' + esc(x.memo) + '"></label>' +
          '<label>금액(원)<input class="in num money" data-k="amount" inputmode="numeric" value="' + (x.amount ? won(x.amount) : '') + '"></label></div></div>';
      }).join('');
    }
    var body = '<div class="form"><label>결재(문서)번호<input id="ed-doc" class="in" maxlength="60" value="' + esc(t.doc_no || '') + '"></label></div><div id="ed-rows">' + rowsHtml() + '</div><div id="ed-extra">' + extraHtml() + '</div>' +
      (admin ? '<button class="btn btn-secondary btn-sm" id="ed-add" type="button">' + ico('plus', 16) + ' 분할 줄 추가</button>' : '') +
      '<div class="form" style="margin-top:12px"><label><span>수정 사유 <b class="req">필수</b></span><textarea id="ed-reason" class="in" rows="3" placeholder="무엇을 왜 고치는지 적어 주십시오. 변경 전후 값과 함께 서버 이력에 남습니다."></textarea></label></div>';
    var m = W.modal({ title: (admin ? '수정반영 (관리자) — ' : '수정반영 — ') + t.title, cls: 'wide', body: body, actions: [
      { label: '취소', cls: 'btn-ghost' },
      { label: '수정반영', cls: 'btn-primary', onClick: function (mm, btn) { submit(mm, btn, false); } }] });
    moneyFmt(m.el);
    function readExtra() { $$('[data-new]', m.el).forEach(function (r) { var x = extra[Number(r.dataset.new)]; x.prop_dept = $('[data-k=prop_dept]', r).value; x.memo = $('[data-k=memo]', r).value; x.amount = num($('[data-k=amount]', r).value) || 0; }); }
    if (admin) {
      $('#ed-add', m.el).onclick = function () { readExtra(); extra.push({ prop_dept: t.dept, memo: '', amount: 0 }); $('#ed-extra', m.el).innerHTML = extraHtml(); };
      m.el.addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (!b) return; readExtra(); extra.splice(Number(b.dataset.rm), 1); $('#ed-extra', m.el).innerHTML = extraHtml(); });
    }
    function submit(mm, btn, neg) {
      readExtra();
      var lines = $$('#ed-rows .ed-row', m.el).map(function (r) {
        var o = { id: r.dataset.id }; $$('[data-k]', r).forEach(function (i) { o[i.dataset.k] = i.dataset.k === 'amount' ? num(i.value) : i.value; }); return o;
      });
      extra.forEach(function (x) { if (x.amount > 0) lines.push({ prop_dept: x.prop_dept, memo: x.memo, amount: x.amount }); });
      btn.disabled = true;
      W.rpc('bgt_q_reapply', { p_qr: t.token, p_token: ctx.token, p_doc_no: $('#ed-doc', m.el).value, p_lines: lines, p_reason: $('#ed-reason', m.el).value, p_neg: !!neg }).then(function (r) {
        btn.disabled = false;
        if (r.ok === false) {
          if (r.error === 'NEGATIVE_CONFIRM') return W.confirmBox('수정 후 예산을 초과하는 항목이 있습니다.\n\n' + negText(r.negatives) + '\n\n초과(마이너스) 상태로 반영하시겠습니까? 이 건은 관리자 「조정 필요」 목록에 표시됩니다.', '초과 반영', true).then(function (ok) { if (ok) submit(mm, btn, true); });
          return toast(W.errMsg(r.error), 'err');
        }
        mm.close(); toast('수정반영했습니다. 변경 이력이 서버에 기록되었습니다.'); ctx.reload();
      }).catch(function (e) { btn.disabled = false; fail(e); });
    }
  }

  /* ───────── 배정 (관리자) ───────── */
  function assignModal(tk, line, ctx) {
    var d = ctx.data, used = usedMap(d.spend), t = tk.ticket;
    var reserveLines = d.lines.filter(function (l) { return l.type === '세출' && l.mok === RESERVE_MOK; });
    var cur = line.alloc === 'line' ? 'line' : line.alloc === 'reserve' ? 'reserve' : 'pending';
    var body = '<p class="muted">' + esc(t.title) + ' · ' + esc(line.memo || '') + ' · ' + won(line.applied == null ? line.planned : line.applied) + '원<br>현재: ' + lineTitle(line) + '</p>' +
      '<div class="form"><label>배정 방식<select id="as-mode" class="in"><option value="line">기존 예산 항목에 배정 (이관 포함)</option><option value="new_line">편성하지 않은 항목으로 신규 생성</option><option value="reserve">예비비 사용</option><option value="pending">미배정으로 두기</option></select></label>' +
      '<div id="as-line"><label>부서<select id="as-dept" class="in">' + deptOptions(ctx.depts, line.prop_dept) + '</select></label><label>예산 항목<select id="as-lid" class="in"></select></label></div>' +
      '<div id="as-new" class="hide"><label>부서<select id="as-ndept" class="in">' + deptOptions(ctx.depts, line.prop_dept) + '</select></label><label>예산 코드(목)<select id="as-nmok" class="in">' + codeOptions(d.codes, line.prop_mok) + '</select></label><label>세부명칭<input id="as-nname" class="in" value="' + esc(line.memo || '') + '"></label><p class="muted">편성액 0원의 「미편성 신규」 항목이 만들어지고 관리자 「조정 필요」 목록에 올라갑니다.</p></div>' +
      '<div id="as-res" class="hide"><label>예비비 항목<select id="as-rid" class="in">' + (reserveLines.length ? lineOptions(reserveLines, used, line.line_id) : '<option value="">예비비(7.2.1) 항목이 없습니다</option>') + '</select></label><label>사용 부서<select id="as-use" class="in">' + deptOptions(ctx.depts, line.prop_dept) + '</select></label><label>명목(예산서에 적는 사용 내용)<input id="as-title" class="in" value="' + esc(line.prop_note || line.memo || '') + '"></label></div>' +
      '<label><span>배정·변경 사유 <b class="req">필수</b></span><textarea id="as-reason" class="in" rows="3"></textarea></label></div>';
    var m = W.modal({ title: '재원 배정', cls: 'wide', body: body, actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '배정', cls: 'btn-primary', onClick: function (mm, btn) {
      var mode = $('#as-mode', m.el).value, target = { mode: mode };
      if (mode === 'line') target.line_id = $('#as-lid', m.el).value;
      if (mode === 'new_line') { target.dept = $('#as-ndept', m.el).value; target.mok = $('#as-nmok', m.el).value; target.name = $('#as-nname', m.el).value; }
      if (mode === 'reserve') { target.line_id = $('#as-rid', m.el).value; target.use_dept = $('#as-use', m.el).value; target.title = $('#as-title', m.el).value; }
      if ((mode === 'line' || mode === 'reserve') && !target.line_id) return toast('예산 항목을 선택해 주십시오.', 'err');
      if (mode === 'new_line' && (!target.mok || !target.name.trim())) return toast('예산 코드와 세부명칭을 입력해 주십시오.', 'err');
      var reason = $('#as-reason', m.el).value.trim(); if (!reason) return toast('사유를 입력해 주십시오.', 'err');
      btn.disabled = true;
      W.rpc('bgt_a_ticket_assign', { p_token: ctx.token, p_ticket_line_id: line.id, p_target: target, p_reason: reason }).then(function () { mm.close(); toast('배정했습니다. 이력이 기록되었습니다.'); ctx.reload(); }).catch(function (e) { btn.disabled = false; fail(e); });
    } }] });
    $('#as-mode', m.el).value = cur === 'reserve' ? 'reserve' : 'line';
    function fillLines() {
      var dept = $('#as-dept', m.el).value, ls = sechulLines(d.lines, dept);
      $('#as-lid', m.el).innerHTML = lineOptions(ls, used, line.line_id, '항목을 선택하십시오');
    }
    function sync() {
      var mode = $('#as-mode', m.el).value;
      $('#as-line', m.el).classList.toggle('hide', mode !== 'line'); $('#as-new', m.el).classList.toggle('hide', mode !== 'new_line'); $('#as-res', m.el).classList.toggle('hide', mode !== 'reserve');
    }
    $('#as-mode', m.el).onchange = sync; $('#as-dept', m.el).onchange = fillLines; fillLines(); sync();
  }

  /* ───────── 부서 화면 ───────── */
  var DS = { filter: 'all' };

  function deptTab(box, ctx) {
    box.innerHTML = '<div class="loading">불러오는 중…</div>';
    W.rpc('bgt_d_tickets', { p_token: ctx.token, p_year: ctx.year }).then(function (list) { drawDept(box, ctx, list); }).catch(function (e) { box.innerHTML = ''; fail(e); });
  }
  function drawDept(box, ctx, list) {
    function reload() { deptTab(box, ctx); if (ctx.onChanged) ctx.onChanged(); }
    var pend = 0, pendSum = 0, wait = 0, done = 0;
    list.forEach(function (tk) {
      if (tk.ticket.status === 'issued') wait++; if (tk.ticket.status === 'applied') done++;
      if (tk.ticket.status !== 'void') tk.lines.forEach(function (l) { if (l.alloc === 'pending') { pend++; pendSum += Number(l.applied == null ? l.planned : l.applied) || 0; } });
    });
    var f = DS.filter, shown = list.filter(function (tk) {
      var s = tk.ticket.status;
      return f === 'all' ? true : f === 'issued' ? s === 'issued' : f === 'applied' ? s === 'applied' : f === 'pending' ? (s !== 'void' && tk.lines.some(function (l) { return l.alloc === 'pending'; })) : s === 'void';
    });
    var rows = shown.map(function (tk, i) {
      var t = tk.ticket, first = tk.lines[0], more = tk.lines.length > 1 ? ' 외 ' + (tk.lines.length - 1) + '줄' : '';
      return '<tr class="ln clk" data-i="' + list.indexOf(tk) + '"><td class="nowrap">' + W.fmtDT(t.issued_at).slice(0, 10) + '</td><td><b>' + esc(t.title) + '</b><div class="muted">' + (first ? lineTitle(first) : '') + more + '</div></td><td>' + esc(t.doc_no || '-') + '</td>' +
        '<td class="num">' + won(t.planned_total) + '</td><td class="num">' + (t.applied_total == null ? '-' : won(t.applied_total)) + '</td><td>' + statusChip(t.status) + (tk.lines.some(function (l) { return l.alloc === 'pending'; }) && t.status !== 'void' ? ' <span class="flag warn">미배정</span>' : '') + '</td>' +
        '<td class="acts"><button class="btn btn-ghost btn-sm" data-qr="' + list.indexOf(tk) + '">' + ico('qr', 16) + ' QR</button></td></tr>';
    });
    box.innerHTML = '<div class="tools"><div><h3>결재 QR · 집행 내역</h3><p class="muted">기안 전에 집행 예정 내역으로 QR을 발급받아 기안문에 넣으십시오. 결재 후 스캔하면 부서 지출 기록에 한 번만 반영됩니다.</p></div>' +
      '<button class="btn btn-primary" id="tk-new">' + ico('plus', 16) + ' 새 QR 발급</button></div>' +
      '<div class="kpis"><div class="kpi"><div class="kpi-l">반영 대기 QR</div><div class="kpi-v">' + wait + '<small>건</small></div></div><div class="kpi"><div class="kpi-l">반영 완료</div><div class="kpi-v">' + done + '<small>건</small></div></div>' +
      '<div class="kpi' + (pend ? ' warnk' : '') + '"><div class="kpi-l">미배정 줄 (기획처 확정 전)</div><div class="kpi-v">' + pend + '<small>줄 · ' + won(pendSum) + '원</small></div></div></div>' +
      (pend ? '<div class="note warn">' + ico('alert', 16) + ' 미배정 금액은 기획처가 부서·과목을 확정하기 전까지 부서 집행 합계에 들어가지 않습니다. 참고용으로 예상 집행에 더해 보십시오.</div>' : '') +
      '<div class="ws-tabs" id="tk-f">' + [['all', '전체'], ['issued', '반영 대기'], ['applied', '반영 완료'], ['pending', '미배정 포함'], ['void', '무효']].map(function (x) { return '<button class="ws-tab' + (f === x[0] ? ' on' : '') + '" data-f="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      tbl(['발급일', '건명 / 귀속', '결재번호', '>결재 기준액', '>반영액', '상태', ''], rows, 'tk');
    $('#tk-new', box).onclick = function () { issueModal(ctx, reload); };
    $('#tk-f', box).onclick = function (e) { var b = e.target.closest('[data-f]'); if (b) { DS.filter = b.dataset.f; drawDept(box, ctx, list); } };
    box.querySelector('table.tk').onclick = function (e) {
      var q = e.target.closest('[data-qr]'); if (q) { e.stopPropagation(); return showQr(list[Number(q.dataset.qr)]); }
      var tr = e.target.closest('tr[data-i]'); if (tr) detailModal(list[Number(tr.dataset.i)], { role: 'dept', token: ctx.token, dept: ctx.dept, depts: ctx.depts, reload: reload });
    };
  }

  function issueModal(ctx, done) {
    var data = ctx.getData(), used = usedMap(data.spend), own = sechulLines(data.lines, ctx.dept), rows = [{ kind: 'own' }];
    function rowHtml(r, i) {
      return '<div class="ed-row" data-i="' + i + '"><div class="ed-t">' + (i + 1) + '번째 줄' + (rows.length > 1 ? ' <button class="lnk" data-rm="' + i + '" type="button">삭제</button>' : '') + '</div>' +
        '<div class="form"><label>귀속<select class="in" data-k="kind"><option value="own"' + (r.kind === 'own' ? ' selected' : '') + '>우리 부서 편성 항목</option><option value="other"' + (r.kind === 'other' ? ' selected' : '') + '>귀속 미정 · 다른 부서(공통 등) · 편성하지 않은 지출</option></select></label>' +
        (r.kind === 'own' ? '<label>예산 항목<select class="in" data-k="line_id">' + lineOptions(own, used, r.line_id, '항목을 선택하십시오') + '</select></label>'
          : '<div class="form row"><label>제안 부서<select class="in" data-k="prop_dept">' + deptOptions(ctx.depts, r.prop_dept || ctx.dept) + '</select></label><label>예산 코드(목)<select class="in" data-k="prop_mok">' + codeOptions(data.codes, r.prop_mok) + '</select></label></div>' +
            '<label>비고 (왜 미정인지, 어떤 사업인지)<input class="in" data-k="prop_note" value="' + esc(r.prop_note || '') + '" maxlength="120"></label><p class="muted">기획처가 재원(부서·과목·예비비)을 확정합니다. 확정 전에는 미배정으로 반영됩니다.</p>') +
        '<div class="form row"><label>적요 (구매·지출 내용)<input class="in" data-k="memo" value="' + esc(r.memo || '') + '"></label><label>거래처<input class="in" data-k="vendor" value="' + esc(r.vendor || '') + '"></label>' +
        '<label>집행 예정일<input class="in" type="date" data-k="spent_on" value="' + esc(r.spent_on || '') + '"></label><label>예정 금액(원)<input class="in num money" data-k="amount" inputmode="numeric" value="' + (r.amount ? won(r.amount) : '') + '"></label></div></div></div>';
    }
    function drawRows() { $('#is-rows', m.el).innerHTML = rows.map(rowHtml).join(''); updTotal(); }
    function readRows() {
      $$('#is-rows .ed-row', m.el).forEach(function (el) { var r = rows[Number(el.dataset.i)]; $$('[data-k]', el).forEach(function (i) { r[i.dataset.k] = i.dataset.k === 'amount' ? (num(i.value) || 0) : i.value; }); });
    }
    function updTotal() { var s = 0; $$('#is-rows [data-k=amount]', m.el).forEach(function (i) { s += num(i.value) || 0; }); $('#is-total', m.el).textContent = won(s); }
    var m = W.modal({ title: '새 결재 QR 발급', cls: 'wide', body: '<div class="form"><label>건명 (기안 제목)<input id="is-title" class="in" maxlength="200" placeholder="예: 3월 정기 소모품 구매"></label></div><div id="is-rows"></div>' +
      '<button class="btn btn-secondary btn-sm" id="is-add" type="button">' + ico('plus', 16) + ' 줄 추가</button><p class="sum-line">결재 기준액 합계 <b id="is-total">0</b>원</p>' +
      '<div class="note info">' + ico('check', 16) + ' 발급 후 QR 이미지를 기안문에 삽입하십시오. 결재번호는 결재가 끝난 뒤 스캔하는 화면에서 입력합니다.</div>',
      actions: [{ label: '취소', cls: 'btn-ghost' }, { label: 'QR 발급', cls: 'btn-primary', onClick: function (mm, btn) {
        readRows();
        var title = $('#is-title', m.el).value.trim(); if (!title) return toast('건명을 입력해 주십시오.', 'err');
        var lines = [];
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i]; if (!(r.amount > 0)) return toast((i + 1) + '번째 줄의 금액을 입력해 주십시오.', 'err');
          if (r.kind === 'own' && !r.line_id) return toast((i + 1) + '번째 줄의 예산 항목을 선택해 주십시오.', 'err');
          lines.push(r.kind === 'own' ? { line_id: r.line_id, memo: r.memo, vendor: r.vendor, spent_on: r.spent_on, amount: r.amount }
            : { prop_dept: r.prop_dept || ctx.dept, prop_mok: r.prop_mok, prop_note: r.prop_note, memo: r.memo, vendor: r.vendor, spent_on: r.spent_on, amount: r.amount });
        }
        btn.disabled = true;
        W.rpc('bgt_d_ticket_issue', { p_token: ctx.token, p_year: ctx.year, p_title: title, p_lines: lines }).then(function (r) {
          mm.close(); toast('QR을 발급했습니다.'); done(); showQr({ ticket: { title: title, token: r.token } });
        }).catch(function (e) { btn.disabled = false; fail(e); });
      } }] });
    moneyFmt(m.el);
    m.el.addEventListener('input', function (e) { if (e.target.dataset && e.target.dataset.k === 'amount') updTotal(); });
    m.el.addEventListener('change', function (e) { if (e.target.dataset && e.target.dataset.k === 'kind') { readRows(); drawRows(); } });
    m.el.addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (b) { readRows(); rows.splice(Number(b.dataset.rm), 1); drawRows(); } });
    $('#is-add', m.el).onclick = function () { readRows(); rows.push({ kind: 'own' }); drawRows(); };
    drawRows();
  }

  /* ───────── 관리자 화면 ───────── */
  var AS = { sub: 'all', dept: '', status: '' };
  var SUBS = [['all', '전체 QR'], ['pending', '미배정'], ['adjust', '조정 필요'], ['diff', '결재액 불일치'], ['reserve', '예비비 사용'], ['void', '무효']];

  function adminTab(box, ctx) {
    box.innerHTML = '<div class="loading">불러오는 중…</div>';
    W.rpc('bgt_a_tickets', { p_token: ctx.token, p_year: ctx.year }).then(function (list) { drawAdmin(box, ctx, list); }).catch(function (e) { box.innerHTML = ''; fail(e); });
  }
  function drawAdmin(box, ctx, list) {
    function reload() { ctx.refresh(); }
    var actx = { role: 'admin', token: ctx.token, depts: ctx.depts, data: ctx.data, reload: reload };
    var live = list.filter(function (tk) { return tk.ticket.status !== 'void'; });
    var pendLines = [], resLines = [];
    live.forEach(function (tk) { tk.lines.forEach(function (l) { if (l.alloc === 'pending') pendLines.push({ tk: tk, l: l }); if (l.alloc === 'reserve') resLines.push({ tk: tk, l: l }); }); });
    var used = usedMap(ctx.data.spend);
    var adjust = ctx.data.lines.filter(function (l) { return l.type === '세출' && (l.origin === 'unplanned' || (used[l.id] || 0) > (Number(l.base_amount) || 0)); });
    var diffs = live.filter(function (tk) { return tk.ticket.status === 'applied' && (Number(tk.ticket.applied_total) !== Number(tk.ticket.planned_total) || tk.lines.some(function (l) { return l.applied != null && Number(l.applied) !== Number(l.planned); })); });
    var voids = list.filter(function (tk) { return tk.ticket.status === 'void'; });
    var count = { all: live.length, pending: pendLines.length, adjust: adjust.length, diff: diffs.length, reserve: resLines.length, void: voids.length };
    var h = '<div class="ws-tabs" id="at-sub">' + SUBS.map(function (s) { return '<button class="ws-tab' + (AS.sub === s[0] ? ' on' : '') + '" data-s="' + s[0] + '">' + s[1] + ' <span class="cnt' + ((s[0] === 'pending' || s[0] === 'adjust') && count[s[0]] ? ' hot' : '') + '">' + count[s[0]] + '</span></button>'; }).join('') + '</div>';
    function ticketRow(tk) {
      var t = tk.ticket, pend = tk.lines.some(function (l) { return l.alloc === 'pending'; });
      return '<tr class="ln clk" data-id="' + t.id + '"><td class="nowrap">' + W.fmtDT(t.issued_at).slice(0, 10) + '</td><td>' + esc(t.dept) + '</td><td><b>' + esc(t.title) + '</b></td><td>' + esc(t.doc_no || '-') + '</td><td class="num">' + won(t.planned_total) + '</td><td class="num">' + (t.applied_total == null ? '-' : won(t.applied_total)) + '</td><td>' + statusChip(t.status) + (pend && t.status !== 'void' ? ' <span class="flag warn">미배정</span>' : '') + '</td></tr>';
    }
    var sub = AS.sub, rows;
    if (sub === 'all' || sub === 'void' || sub === 'diff') {
      var src = sub === 'all' ? live : sub === 'void' ? voids : diffs;
      if (sub === 'all') src = src.filter(function (tk) { return (!AS.dept || tk.ticket.dept === AS.dept) && (!AS.status || tk.ticket.status === AS.status); });
      h += (sub === 'all' ? '<div class="tools"><div class="acts"><label class="inl">부서<select id="at-dept" class="in sm"><option value="">전체</option>' + deptOptions(ctx.depts, AS.dept) + '</select></label><label class="inl">상태<select id="at-st" class="in sm"><option value="">전체</option><option value="issued"' + (AS.status === 'issued' ? ' selected' : '') + '>반영 전</option><option value="applied"' + (AS.status === 'applied' ? ' selected' : '') + '>반영 완료</option></select></label></div><button class="btn btn-secondary btn-sm" id="at-x">' + ico('download', 16) + ' 엑셀</button></div>' : '') +
        (sub === 'diff' ? '<p class="muted">반영액이 결재 기준액과 다른 건입니다. 부서가 금액을 고친 사유는 이력에서 확인하십시오.</p>' : '') +
        tbl(['발급일', '발급 부서', '건명', '결재번호', '>기준액', '>반영액', '상태'], src.map(ticketRow), 'tk');
      box.innerHTML = h;
      var tkTbl = box.querySelector('table.tk');
      tkTbl.onclick = function (e) { var tr = e.target.closest('tr[data-id]'); if (!tr) return; var tk = list.filter(function (x) { return x.ticket.id === tr.dataset.id; })[0]; detailModal(tk, actx); };
      if (sub === 'all') {
        $('#at-dept', box).onchange = function () { AS.dept = this.value; drawAdmin(box, ctx, list); };
        $('#at-st', box).onchange = function () { AS.status = this.value; drawAdmin(box, ctx, list); };
        $('#at-x', box).onclick = function () {
          saveXlsx('결재QR_집행_' + ctx.year + '.xlsx', '결재QR', [['발급일', '발급 부서', '건명', '결재번호', '결재 기준액', '반영액', '상태', '귀속']].concat(src.map(function (tk) {
            var t = tk.ticket; return [W.fmtDT(t.issued_at).slice(0, 10), t.dept, t.title, t.doc_no || '', Number(t.planned_total), t.applied_total == null ? '' : Number(t.applied_total), STATUS[t.status][0],
              tk.lines.map(function (l) { return l.target ? l.target.dept + ' ' + l.target.mok + ' ' + l.target.name : '미배정(' + l.prop_dept + ')'; }).join(' / ')];
          })), [11, 16, 30, 18, 14, 14, 10, 50]);
        };
      }
    } else if (sub === 'pending') {
      h += '<p class="muted">귀속 부서·과목이 정해지지 않은 줄입니다. 배정하면 해당 부서의 지출 기록으로 옮겨지고, 이력이 남습니다. 확정 전에는 부서 집행 합계에 포함되지 않습니다.</p>' +
        tbl(['건명 (결재번호)', '제안 부서', '적요 / 비고', '>금액', '상태', ''], pendLines.map(function (x, i) {
          return '<tr><td><b>' + esc(x.tk.ticket.title) + '</b><div class="muted">' + esc(x.tk.ticket.doc_no || '반영 전') + ' · ' + esc(x.tk.ticket.dept) + '</div></td><td>' + esc(x.l.prop_dept) + (x.l.prop_mok ? '<div class="muted">' + esc(x.l.prop_mok) + '</div>' : '') + '</td><td>' + esc(x.l.memo || '') + '<div class="muted">' + esc(x.l.prop_note || '') + '</div></td>' +
            '<td class="num">' + won(x.l.applied == null ? x.l.planned : x.l.applied) + '</td><td>' + statusChip(x.tk.ticket.status) + '</td><td class="acts"><button class="btn btn-primary btn-sm" data-as="' + i + '">배정</button></td></tr>';
        }), 'pd');
      box.innerHTML = h;
      box.querySelector('table.pd').onclick = function (e) { var b = e.target.closest('[data-as]'); if (b) { var x = pendLines[Number(b.dataset.as)]; assignModal(x.tk, x.l, actx); } };
    } else if (sub === 'adjust') {
      h += '<p class="muted">미편성 신규 항목이거나, 집행이 현재 예산(2026 기준 예산)을 넘은 항목입니다. 추경·전용·예비비로 조정한 뒤 해당 부서 예산안에 반영하십시오.</p>' +
        tbl(['부서', '코드', '항목', '>현재 예산', '>집행', '>초과', '구분'], adjust.map(function (l) {
          var u = used[l.id] || 0, over = u - (Number(l.base_amount) || 0);
          return '<tr><td>' + esc(l.dept) + '</td><td class="c-code">' + esc(l.mok) + '</td><td>' + esc(l.name) + '</td><td class="num">' + won(l.base_amount) + '</td><td class="num">' + won(u) + '</td><td class="num"><b class="neg">' + (over > 0 ? won(over) : '-') + '</b></td><td>' + (l.origin === 'unplanned' ? '<span class="flag warn">미편성 신규</span> ' : '') + (over > 0 ? '<span class="flag err">예산 초과</span>' : '') + '</td></tr>';
        }));
      box.innerHTML = h;
    } else {
      h += '<div class="tools"><p class="muted">예비비(7.2.1)에서 집행된 내역입니다. 예산서에 적는 명목·금액·결재번호가 기록됩니다.</p><button class="btn btn-secondary btn-sm" id="rs-x">' + ico('download', 16) + ' 엑셀</button></div>' +
        tbl(['집행일', '사용 부서', '명목', '적요', '>금액', '결재번호', '건명'], resLines.map(function (x) {
          return '<tr class="ln clk" data-id="' + x.tk.ticket.id + '"><td class="nowrap">' + esc(dstr(x.l.spent_on) || '-') + '</td><td>' + esc(x.l.prop_dept) + '</td><td>' + esc(x.l.prop_note || '-') + '</td><td>' + esc(x.l.memo) + '</td><td class="num">' + won(x.l.applied == null ? x.l.planned : x.l.applied) + '</td><td>' + esc(x.tk.ticket.doc_no || '-') + '</td><td>' + esc(x.tk.ticket.title) + '</td></tr>';
        }), 'rs') + '<p class="sum-line">예비비 사용 합계 <b>' + won(resLines.reduce(function (s, x) { return s + (Number(x.l.applied == null ? x.l.planned : x.l.applied) || 0); }, 0)) + '</b>원</p>';
      box.innerHTML = h;
      box.querySelector('table.rs').onclick = function (e) { var tr = e.target.closest('tr[data-id]'); if (!tr) return; detailModal(list.filter(function (x) { return x.ticket.id === tr.dataset.id; })[0], actx); };
      $('#rs-x', box).onclick = function () {
        saveXlsx('예비비_사용내역_' + ctx.year + '.xlsx', '예비비 사용', [['집행일', '사용 부서', '명목', '적요', '금액', '결재번호', '건명']].concat(resLines.map(function (x) {
          return [dstr(x.l.spent_on), x.l.prop_dept, x.l.prop_note || '', x.l.memo, Number(x.l.applied == null ? x.l.planned : x.l.applied), x.tk.ticket.doc_no || '', x.tk.ticket.title];
        })), [12, 16, 28, 28, 14, 18, 30]);
      };
    }
    $('#at-sub', box).onclick = function (e) { var b = e.target.closest('[data-s]'); if (b) { AS.sub = b.dataset.s; drawAdmin(box, ctx, list); } };
  }

  window.BudgetTicket = {
    deptTab: deptTab, adminTab: adminTab, showQr: showQr, qrUrl: qrUrl, lineTitle: lineTitle, statusChip: statusChip, STATUS: STATUS,
    diffHtml: diffHtml, negText: negText, moneyFmt: moneyFmt, askReason: askReason, eventsModal: eventsModal
  };
})();
