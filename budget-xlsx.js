'use strict';
/**
 * budget-xlsx.js — 부서별 작성 양식(xlsx) 내려받기 · 관리자 일괄 반영 (BudgetXlsx)
 *  1) 부서(또는 관리자)가 부서별 양식을 받아 엑셀에서 요구액·산출 근거·증감 사유·연말 추정을 작성
 *  2) 관리자가 작성된 파일들을 한꺼번에 올림 → 미리 보기(변경·신규·오류) → 확인 후 반영
 *  코드·명칭·전년 예산은 엑셀로 바꿀 수 없고(무시), id 없는 줄만 신규 항목이 됩니다.
 *  서버 반영은 db/budget_schema_7.sql (bgt_a_lines_import, 오류 시 전체 취소).
 */
(function () {
  var W = window.BW, $ = W.$, $$ = W.$$, esc = W.esc, won = W.won, ico = W.ico, toast = W.toast;
  var BLANK_ROWS = 5;

  function fail(e) { toast(e.message, 'err'); }
  function cleanName(s) { return String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40); }
  function usedMap(spend) { var m = {}; (spend || []).forEach(function (s) { m[s.line_id] = (m[s.line_id] || 0) + (Number(s.amount) || 0); }); return m; }
  function parseNum(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? Math.round(v) : NaN;
    var s = String(v).replace(/[,\s원]/g, ''); if (s === '') return null;
    var n = Number(s); return isFinite(n) ? Math.round(n) : NaN;
  }
  function ready() { if (!window.XLSX || !XLSX.utils) { toast('엑셀 라이브러리를 불러오지 못했습니다.', 'err'); return false; } return true; }
  function download(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ───────── 양식 만들기 ─────────
   * ctx = { year, baseYear, lines, spend, codes, settings } */
  var HEAD = ['ID', '부서', '구분', '코드(목)', '세부명칭', '전년 예산', '올해 집행', '연말 추정', '__REQ__', '산출 근거', '증감 사유', '증감(%)', '점검'];
  var HEAD_ROW = 4;   // 1-based, 데이터는 5행부터

  function sheetFor(ctx, dept, type, thr) {
    var used = usedMap(ctx.spend), req = ctx.year + ' 요구액';
    var head = HEAD.map(function (h) { return h === '__REQ__' ? req : h; });
    var lines = ctx.lines.filter(function (l) { return l.dept === dept && l.type === type; })
      .sort(function (a, b) { return W.cmpMok(a.mok, b.mok) || (a.sort - b.sort); });
    var aoa = [[ctx.year + '년도 ' + dept + ' ' + type + '예산 작성 양식', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['※ 노란 열(연말 추정 · ' + req + ' · 산출 근거 · 증감 사유)만 입력하십시오. 코드·명칭·전년 예산을 바꿔도 반영되지 않습니다. 새 항목은 맨 아래 빈 줄에 코드(목)·세부명칭·요구액을 적으십시오. ID 열은 숨겨져 있으니 지우지 마십시오.'],
      [], head];
    lines.forEach(function (l) {
      aoa.push([l.id, l.dept, l.type, l.mok, l.name, Number(l.base_amount) || 0, used[l.id] || 0, l.forecast == null ? '' : Number(l.forecast), Number(l.amount) || 0, l.calc || '', l.reason || '', '', '']);
    });
    for (var i = 0; i < BLANK_ROWS; i++) aoa.push(['', dept, type, '', '', '', '', '', '', '', '', '', '']);
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var last = aoa.length;
    for (var r = HEAD_ROW + 1; r <= last; r++) {
      ws['L' + r] = { t: 's', f: 'IF(AND(ISNUMBER(F' + r + '),F' + r + '>0,ISNUMBER(I' + r + ')),TEXT(I' + r + '/F' + r + '-1,"+0.0%;-0.0%;0.0%"),"")' };
      ws['M' + r] = { t: 's', f: 'IF(AND(K' + r + '="",ISNUMBER(I' + r + '),OR(AND(F' + r + '>0,ABS(I' + r + '/MAX(F' + r + ',1)-1)>' + (thr / 100) + '),AND(N(F' + r + ')=0,I' + r + '>0))),"사유 필요","")' };
    }
    ws['!ref'] = 'A1:M' + last;
    ws['!cols'] = [{ hidden: true, wch: 2 }, { wch: 14 }, { wch: 6 }, { wch: 9 }, { wch: 42 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 36 }, { wch: 36 }, { wch: 9 }, { wch: 10 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } }];
    return ws;
  }

  function workbookFor(ctx, dept) {
    var thr = Number(ctx.settings && ctx.settings.variance_pct) || 20;
    var wb = XLSX.utils.book_new();
    var guide = [[ctx.year + '년도 ' + dept + ' 예산안 작성 안내'], [],
      ['1. 「세출」 「세입」 시트의 노란 열만 입력합니다: 연말 추정 · ' + ctx.year + ' 요구액 · 산출 근거 · 증감 사유.'],
      ['2. 전년 대비 증감이 ' + thr + '%를 넘거나 신규 항목이면 증감 사유가 필요합니다 (점검 열에 「사유 필요」가 표시됩니다).'],
      ['3. 새 항목은 시트 맨 아래 빈 줄에 코드(목) · 세부명칭 · 요구액을 적습니다. 코드는 「코드표」 시트에서 고릅니다.'],
      ['4. 숨겨진 ID 열과 코드 · 세부명칭 · 전년 예산은 바꾸지 마십시오 (바꿔도 반영되지 않습니다).'],
      ['5. 작성이 끝나면 파일을 기획처에 보냅니다. 기획처가 모아서 한 번에 반영합니다.'],
      [], ['양식 만든 날', new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })]];
    var wsG = XLSX.utils.aoa_to_sheet(guide); wsG['!cols'] = [{ wch: 110 }]; XLSX.utils.book_append_sheet(wb, wsG, '안내');
    XLSX.utils.book_append_sheet(wb, sheetFor(ctx, dept, '세출', thr), '세출');
    XLSX.utils.book_append_sheet(wb, sheetFor(ctx, dept, '세입', thr), '세입');
    var codes = [['구분', '코드(목)', '명칭', '설명']];
    ctx.codes.filter(function (c) { return c.level === 'mok' && c.active !== false; }).sort(function (a, b) { return (a.type === b.type ? 0 : a.type === '세입' ? -1 : 1) || W.cmpMok(a.code, b.code); })
      .forEach(function (c) { codes.push([c.type, c.code, c.name, c.descr || '']); });
    var wsC = XLSX.utils.aoa_to_sheet(codes); wsC['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 30 }, { wch: 60 }]; XLSX.utils.book_append_sheet(wb, wsC, '코드표');
    return wb;
  }
  function fileName(ctx, dept) { return ctx.year + '_예산안_작성양식_' + cleanName(dept) + '.xlsx'; }
  function wbBytes(wb) { return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })); }

  function downloadDept(ctx, dept) {
    if (!ready()) return;
    var b = wbBytes(workbookFor(ctx, dept));
    download(new Blob([b], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName(ctx, dept));
  }

  /* ───────── 최소 ZIP (저장만, 압축 없음) ───────── */
  var crcT = null;
  function crc32(u8) {
    if (!crcT) { crcT = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) crc = crcT[(crc ^ u8[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zipStore(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0, d = new Date();
    var dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    files.forEach(function (f) {
      var nb = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, tm, true); lh.setUint16(12, dt, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true); lh.setUint16(26, nb.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nb, f.data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, tm, true); ch.setUint16(14, dt, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nb);
      offset += 30 + nb.length + sz;
    });
    var cdSize = 0; central.forEach(function (p) { cdSize += p.length; });
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }
  function downloadAllZip(ctx, depts) {
    if (!ready()) return;
    var files = depts.map(function (d) { return { name: fileName(ctx, d), data: wbBytes(workbookFor(ctx, d)) }; });
    download(zipStore(files), ctx.year + '_부서별_작성양식.zip');
    toast(files.length + '개 부서 양식을 ZIP으로 내려받았습니다.');
  }

  /* ───────── 업로드 해석 ───────── */
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { try { resolve(XLSX.read(new Uint8Array(fr.result), { type: 'array' })); } catch (e) { reject(new Error(file.name + ': 엑셀 파일을 읽을 수 없습니다.')); } };
      fr.onerror = function () { reject(new Error(file.name + ': 파일을 읽지 못했습니다.')); };
      fr.readAsArrayBuffer(file);
    });
  }
  function rowsOfSheet(ws, fname, sname) {
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }), hi = -1;
    for (var i = 0; i < Math.min(aoa.length, 12); i++) if (String(aoa[i][0]).trim() === 'ID') { hi = i; break; }
    if (hi < 0) return null;
    var h = aoa[hi].map(function (x) { return String(x).trim(); }), col = {};
    h.forEach(function (t, i) {
      if (t === 'ID') col.id = i; else if (t === '부서') col.dept = i; else if (t === '구분') col.type = i; else if (t.indexOf('코드') === 0) col.mok = i; else if (t === '세부명칭') col.name = i;
      else if (t === '연말 추정') col.fc = i; else if (/요구액$/.test(t)) col.amount = i; else if (t === '산출 근거') col.calc = i; else if (t === '증감 사유') col.reason = i;
    });
    if (col.amount == null || col.id == null) return null;
    var out = [];
    for (var r = hi + 1; r < aoa.length; r++) {
      var a = aoa[r], g = function (k) { return col[k] == null ? '' : a[col[k]]; };
      var id = String(g('id')).trim();
      if (!id && !String(g('name')).trim() && !String(g('mok')).trim() && parseNum(g('amount')) == null) continue;   // 빈 줄
      out.push({ file: fname, sheet: sname, rowNo: r + 1, id: id, dept: String(g('dept')).trim(), type: String(g('type')).trim(), mok: String(g('mok')).trim(), name: String(g('name')).trim(),
        amount: g('amount'), calc: g('calc'), reason: g('reason'), fc: g('fc'), hasCalc: col.calc != null, hasReason: col.reason != null, hasFc: col.fc != null });
    }
    return out;
  }

  /* 검증 → 미리 보기 항목 */
  function analyze(ctx, rowsAll) {
    var byId = {}; ctx.lines.forEach(function (l) { byId[l.id] = l; });
    var thr = Number(ctx.settings && ctx.settings.variance_pct) || 20, seen = {}, deptSet = {}, mokOk = {};
    (ctx.depts || []).forEach(function (d) { deptSet[d] = true; });
    ctx.codes.forEach(function (c) { if (c.level === 'mok' && c.active !== false) mokOk[c.type + '|' + c.code] = c.name; });
    var res = { items: [], errors: 0, warns: 0, upd: 0, nw: 0, same: 0 };
    rowsAll.forEach(function (r) {
      var it = { r: r, errs: [], warns: [], kind: '', payload: null, line: null };
      var amt = parseNum(r.amount), fc = parseNum(r.fc);
      if (amt != null && (isNaN(amt) || amt < 0)) it.errs.push('요구액이 숫자가 아니거나 음수입니다');
      if (fc != null && (isNaN(fc) || fc < 0)) it.errs.push('연말 추정이 숫자가 아니거나 음수입니다');
      if (r.id) {
        var l = byId[r.id]; it.line = l;
        if (!l) it.errs.push('ID에 해당하는 항목이 없습니다 (다른 연도 양식이거나 삭제된 항목)');
        else {
          if (seen[r.id]) it.errs.push('같은 항목이 여러 파일·줄에 중복되어 있습니다 (' + seen[r.id] + ')'); else seen[r.id] = r.file + ' ' + r.sheet + ' ' + r.rowNo + '행';
          if ((r.dept && r.dept !== l.dept) || (r.mok && r.mok !== l.mok) || (r.name && r.name !== l.name)) it.warns.push('부서·코드·명칭 변경은 무시됩니다');
          var newAmt = amt == null ? Number(l.amount) : amt;
          var base = Number(l.base_amount) || 0, reason = r.hasReason ? String(r.reason).trim() : String(l.reason || '').trim();
          if (!it.errs.length && ((base > 0 && Math.abs(newAmt - base) * 100 / base > thr) || (base === 0 && newAmt > 0)) && !reason) it.warns.push('증감 사유 필요 (제출 점검 기준)');
          it.kind = 'upd';
          it.payload = { id: l.id }; if (amt != null) it.payload.amount = amt;
          if (r.hasCalc) it.payload.calc = String(r.calc == null ? '' : r.calc);
          if (r.hasReason) it.payload.reason = String(r.reason == null ? '' : r.reason);
          if (r.hasFc) it.payload.forecast = fc;
          var same = (amt == null || amt === Number(l.amount)) && (!r.hasCalc || String(r.calc || '') === (l.calc || '')) && (!r.hasReason || String(r.reason || '') === (l.reason || '')) && (!r.hasFc || fc === (l.forecast == null ? null : Number(l.forecast)));
          if (same) it.kind = 'same';
          it.oldAmt = Number(l.amount) || 0; it.newAmt = newAmt;
        }
      } else {
        it.kind = 'new';
        if (!deptSet[r.dept]) it.errs.push('부서가 올바르지 않습니다');
        if (r.type !== '세출' && r.type !== '세입') it.errs.push('구분은 세입 또는 세출이어야 합니다');
        if (!mokOk[r.type + '|' + r.mok]) it.errs.push('코드표에 없는 코드(목)입니다');
        if (!r.name) it.errs.push('세부명칭이 없습니다');
        if (!(amt > 0)) it.errs.push('신규 항목은 요구액이 필요합니다');
        if (!String(r.reason || '').trim()) it.warns.push('신규 항목은 증감 사유가 필요합니다');
        it.oldAmt = 0; it.newAmt = amt || 0;
        it.payload = { type: r.type, dept: r.dept, mok: r.mok, name: r.name, amount: amt, calc: String(r.calc || ''), reason: String(r.reason || ''), forecast: fc };
      }
      if (it.errs.length) res.errors++; else { if (it.kind === 'upd') res.upd++; else if (it.kind === 'new') res.nw++; else res.same++; }
      if (it.warns.length && !it.errs.length) res.warns++;
      res.items.push(it);
    });
    return res;
  }

  function previewModal(ctx, res, files, onDone) {
    var changed = res.items.filter(function (i) { return !i.errs.length && i.kind !== 'same'; });
    var bad = res.items.filter(function (i) { return i.errs.length; });
    var tr = function (i) {
      var r = i.r, l = i.line, diff = i.newAmt - i.oldAmt;
      return '<tr><td class="nowrap">' + esc(l ? l.dept : r.dept) + '<div class="muted">' + esc(l ? l.type : r.type) + '</div></td>' +
        '<td><span class="c-code">' + esc(l ? l.mok : r.mok) + '</span> ' + esc(l ? l.name : r.name) + '<div class="muted">' + esc(r.file) + ' · ' + esc(r.sheet) + ' ' + r.rowNo + '행</div></td>' +
        '<td class="num nowrap">' + (i.kind === 'new' ? '신규' : won(i.oldAmt) + ' → ') + '<b>' + won(i.newAmt) + '</b><div class="' + (diff < 0 ? 'neg' : 'muted') + '">' + (i.kind === 'new' ? '' : (diff > 0 ? '+' : '') + won(diff)) + '</div></td>' +
        '<td>' + (i.errs.length ? '<span class="flag err">' + esc(i.errs.join(' / ')) + '</span>' : (i.kind === 'new' ? '<span class="flag info">신규</span> ' : '') + (i.warns.length ? '<span class="flag warn">' + esc(i.warns.join(' / ')) + '</span>' : '')) + '</td></tr>';
    };
    var head = '<thead><tr><th>부서 / 구분</th><th>코드 · 항목 · 위치</th><th class="num">요구액 (현재 → 새)</th><th>점검</th></tr></thead>';
    var sumDiff = changed.reduce(function (s, i) { return s + (i.newAmt - i.oldAmt); }, 0);
    var body = '<div class="kpis"><div class="kpi"><div class="kpi-l">파일</div><div class="kpi-v sm">' + files + '개</div></div><div class="kpi"><div class="kpi-l">수정</div><div class="kpi-v sm">' + res.upd + '건</div></div><div class="kpi"><div class="kpi-l">신규</div><div class="kpi-v sm">' + res.nw + '건</div></div>' +
      '<div class="kpi"><div class="kpi-l">변경 없음</div><div class="kpi-v sm">' + res.same + '건</div></div><div class="kpi' + (res.errors ? ' warnk' : '') + '"><div class="kpi-l">오류</div><div class="kpi-v sm">' + res.errors + '건</div></div><div class="kpi"><div class="kpi-l">요구액 합계 변화</div><div class="kpi-v sm">' + (sumDiff > 0 ? '+' : '') + won(sumDiff) + '<small>원</small></div></div></div>' +
      (res.warns ? '<div class="note warn">' + ico('alert', 16) + ' <span>확인 권장 ' + res.warns + '건 (증감 사유 누락 등)은 반영은 되지만 부서 제출 점검에서 걸릴 수 있습니다.</span></div>' : '') +
      (bad.length ? '<h4>오류 ' + bad.length + '건</h4><div class="tbl-wrap"><table class="bt">' + head + '<tbody>' + bad.map(tr).join('') + '</tbody></table></div><label class="chk-l"><input type="checkbox" id="xi-skip"> 오류 행은 빼고 나머지만 반영</label>' : '') +
      '<h4>반영될 변경 ' + changed.length + '건</h4>' + (changed.length ? '<div class="tbl-wrap xi-scroll"><table class="bt">' + head + '<tbody>' + changed.map(tr).join('') + '</tbody></table></div>' : '<p class="muted">반영할 변경이 없습니다.</p>') +
      '<p class="muted">반영은 한 번에 처리되며(서버에서 오류가 나면 전부 취소), 변경 전후 금액이 이력에 남습니다. 코드·명칭·전년 예산은 바뀌지 않습니다.</p>';
    W.modal({ title: '엑셀 일괄 반영 미리 보기', cls: 'wide', body: body, actions: [{ label: '닫기', cls: 'btn-ghost' }, { label: '반영', cls: 'btn-primary', onClick: function (m, btn) {
      var skip = $('#xi-skip', m.el);
      if (bad.length && !(skip && skip.checked)) return toast('오류가 있습니다. 파일을 고치거나 「오류 행은 빼고 반영」을 선택해 주십시오.', 'err');
      if (!changed.length) return toast('반영할 변경이 없습니다.');
      btn.disabled = true;
      W.rpc('bgt_a_lines_import', { p_token: W.sess.token, p_year: ctx.year, p_items: changed.map(function (i) { return i.payload; }) }).then(function (r) {
        m.close(); toast('수정 ' + r.updated + '건 · 신규 ' + r.created + '건을 반영했습니다. 이력은 「이력」 탭에서 확인할 수 있습니다.'); if (onDone) onDone();
      }).catch(function (e) { btn.disabled = false; fail(e); });
    } }] });
  }

  /* ───────── 관리자 카드 ───────── */
  function mountAdmin(box, ctx) {
    var depts = ctx.depts;
    box.innerHTML = '<h3>부서별 작성 양식 (엑셀)</h3><p class="muted">부서가 웹 화면 대신 엑셀로 요구액을 작성하도록 부서별 양식을 내려받아 배포하고, 작성된 파일을 모아 한 번에 반영합니다. 코드·명칭·전년 예산은 바뀌지 않습니다.</p>' +
      '<div class="form row"><label>부서<select id="xl-dept" class="in">' + depts.map(function (d) { return '<option>' + esc(d) + '</option>'; }).join('') + '</select></label><button class="btn btn-primary" id="xl-one">' + ico('download', 16) + ' 이 부서 양식</button>' +
      '<button class="btn btn-secondary" id="xl-zip">' + ico('download', 16) + ' 전체 부서 ZIP (' + depts.length + '개)</button></div>' +
      '<div class="form row xl-up"><label>작성된 파일 올리기 (여러 개 선택 가능)<input id="xl-file" class="in" type="file" accept=".xlsx,.xls" multiple></label><button class="btn btn-primary" id="xl-go">' + ico('upload', 16) + ' 미리 보기</button></div>';
    $('#xl-one', box).onclick = function () { downloadDept(ctx, $('#xl-dept', box).value); };
    $('#xl-zip', box).onclick = function () { downloadAllZip(ctx, depts); };
    $('#xl-go', box).onclick = function () {
      if (!ready()) return;
      var fs = Array.prototype.slice.call($('#xl-file', box).files || []); if (!fs.length) return toast('올릴 엑셀 파일을 선택해 주십시오.', 'err');
      Promise.all(fs.map(function (f) { return readFile(f).then(function (wb) { return { f: f, wb: wb }; }); })).then(function (list) {
        var rows = [], used = 0;
        list.forEach(function (x) { x.wb.SheetNames.forEach(function (sn) { var r = rowsOfSheet(x.wb.Sheets[sn], x.f.name, sn); if (r) { used++; rows = rows.concat(r); } }); });
        if (!used) return toast('양식(ID·요구액 열이 있는 시트)을 찾지 못했습니다. 내려받은 양식 파일이 맞는지 확인해 주십시오.', 'err');
        previewModal(ctx, analyze(ctx, rows), fs.length, ctx.onDone);
      }).catch(fail);
    };
  }

  /* ───────── 부서 화면: 내 부서 양식 받기 ───────── */
  function deptButton(ctx) { downloadDept(ctx, ctx.dept); }

  window.BudgetXlsx = { mountAdmin: mountAdmin, deptDownload: deptButton, analyze: analyze, zipStore: zipStore, workbookFor: workbookFor, rowsOfSheet: rowsOfSheet };
})();
