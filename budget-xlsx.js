'use strict';
/**
 * budget-xlsx.js — 부서별 작성 양식(xlsx) 내려받기 · 관리자 일괄 반영 (BudgetXlsx)
 *  모든 부서(공통 포함)가 같은 틀을 씁니다. 세출·세입 각각에 두 구간이 있습니다.
 *    ① 올해 집행(수납) 구간 : 올해 예산 · 건별 집행 내역(별도 시트) · 연말 추정
 *    ② 내년도 소요 구간      : 요구액 · 산출 근거 · 증감 사유 (새 항목은 맨 아래 빈 줄)
 *  입학처는 학년도(3월~익년 2월) 기준으로 표기합니다. (금액 환산은 별도)
 *  부서는 엑셀로 작성 → 관리자가 파일들을 한꺼번에 올림 → 미리 보기 → 확인 후 반영.
 *  서버 반영: db/budget_schema_7.sql(bgt_a_lines_import) · budget_schema_8.sql(bgt_a_spend_import), 오류 시 전체 취소.
 */
(function () {
  var W = window.BW, $ = W.$, esc = W.esc, won = W.won, ico = W.ico, toast = W.toast;
  var ACADEMIC = { '입학처': true };
  var BLANK_ITEMS = 8, BLANK_SPEND = 60, HEAD_ROW = 4;   // 데이터는 5행부터

  function fail(e) { toast(e.message, 'err'); }
  function cleanName(s) { return String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40); }
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
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parseDate(v) {
    if (v == null || v === '') return null;
    var y, mo, da;
    if (v instanceof Date) {                                         // 날짜 셀: 브라우저 시간대 기준 (정오로 보정해 하루 어긋남 방지)
      if (isNaN(v.getTime())) return NaN;
      var t = new Date(v.getTime() + 12 * 3600 * 1000); y = t.getFullYear(); mo = t.getMonth() + 1; da = t.getDate();
    } else if (typeof v === 'number') {                              // 엑셀 일련번호
      var u = new Date(Math.round((v - 25569) * 86400 * 1000)); if (isNaN(u.getTime())) return NaN;
      y = u.getUTCFullYear(); mo = u.getUTCMonth() + 1; da = u.getUTCDate();
    } else {
      var m = /^(\d{4})[-.\/\s]+(\d{1,2})[-.\/\s]+(\d{1,2})/.exec(String(v).trim());
      if (!m) return NaN;
      y = Number(m[1]); mo = Number(m[2]); da = Number(m[3]);
    }
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || da < 1 || da > 31) return NaN;
    return y + '-' + pad(mo) + '-' + pad(da);
  }

  /* ───────── 기간 표기 ───────── */
  function labels(ctx, dept, type) {
    var next = ctx.year, cur = (ctx.settings && ctx.settings.base_year) || (ctx.year - 1), act = type === '세입' ? '수납' : '집행';
    if (ACADEMIC[dept]) return { cur: cur + '학년도', curRange: cur + '.3~' + (cur + 1) + '.2', next: next + '학년도', nextRange: next + '.3~' + (next + 1) + '.2', act: act, basis: '학년도' };
    return { cur: cur + '년', curRange: cur + '.1~' + cur + '.12', next: next + '년', nextRange: next + '.1~' + next + '.12', act: act, basis: '회계연도' };
  }
  function sheetNames(type) { return type === '세입' ? { item: '세입', spend: '세입_수납내역' } : { item: '세출', spend: '세출_집행내역' }; }

  /* ───────── 양식 만들기 ───────── */
  function usedMap(spend) { var m = {}; (spend || []).forEach(function (s) { m[s.line_id] = (m[s.line_id] || 0) + (Number(s.amount) || 0); }); return m; }

  function itemSheet(ctx, dept, type, thr) {
    var L = labels(ctx, dept, type), sn = sheetNames(type), used = usedMap(ctx.spend);
    var lines = ctx.lines.filter(function (l) { return l.dept === dept && l.type === type; }).sort(function (a, b) { return W.cmpMok(a.mok, b.mok) || (a.sort - b.sort); });
    var head = ['ID', '부서', '구분', '코드(목)', '세부명칭', L.cur + ' 예산', L.cur + ' ' + L.act + ' 합계', '연말 추정', L.next + ' 요구액', '산출 근거', '증감 사유', '증감(%)', '점검', '키'];
    var aoa = [[L.next + ' ' + dept + ' ' + type + '예산 작성 양식 (' + L.basis + ' 기준)'],
      ['※ 두 구간만 작성합니다. ① 올해 ' + L.act + ' 구간: 건별 내역은 「' + sn.spend + '」 시트에 적고, 이 시트에는 연말 추정만 적습니다. ② 내년도 소요 구간: 요구액 · 산출 근거 · 증감 사유. 새 항목은 맨 아래 빈 줄에 코드(목) · 세부명칭 · 올해 예산 · 요구액을 적습니다. 숨겨진 ID·키 열은 지우지 마십시오.'],
      ['', '', '', '', '① 올해 ' + L.act + ' 구간 — ' + L.cur + ' (' + L.curRange + ')', '', '', '', '② 내년도 소요 구간 — ' + L.next + ' (' + L.nextRange + ')', '', '', '', '', ''],
      head];
    lines.forEach(function (l) {
      aoa.push([l.id, l.dept, l.type, l.mok, l.name, Number(l.base_amount) || 0, 0, l.forecast == null ? '' : Number(l.forecast), Number(l.amount) || 0, l.calc || '', l.reason || '', '', '', '']);
    });
    for (var i = 0; i < BLANK_ITEMS; i++) aoa.push(['', dept, type, '', '', '', 0, '', '', '', '', '', '', '']);
    var ws = XLSX.utils.aoa_to_sheet(aoa), last = aoa.length;
    for (var r = HEAD_ROW + 1; r <= last; r++) {
      ws['G' + r] = { t: 'n', f: "SUMIF('" + sn.spend + "'!$J$5:$J$3000,N" + r + ",'" + sn.spend + "'!$H$5:$H$3000)" };
      ws['L' + r] = { t: 's', f: 'IF(AND(ISNUMBER(F' + r + '),F' + r + '>0,ISNUMBER(I' + r + ')),TEXT(I' + r + '/F' + r + '-1,"+0.0%;-0.0%;0.0%"),"")' };
      ws['M' + r] = { t: 's', f: 'IF(AND(K' + r + '="",ISNUMBER(I' + r + '),OR(AND(N(F' + r + ')>0,ABS(I' + r + '/MAX(F' + r + ',1)-1)>' + (thr / 100) + '),AND(N(F' + r + ')=0,I' + r + '>0))),"사유 필요","")' };
      ws['N' + r] = { t: 's', f: 'D' + r + '&"|"&E' + r };
    }
    ws['!ref'] = 'A1:N' + last; W.xlsxMoney(ws, ['F', 'G', 'H', 'I'], HEAD_ROW + 1, last);
    ws['!cols'] = [{ hidden: true, wch: 2 }, { wch: 14 }, { wch: 6 }, { wch: 9 }, { wch: 42 }, { wch: 15 }, { wch: 17 }, { wch: 14 }, { wch: 17 }, { wch: 36 }, { wch: 36 }, { wch: 9 }, { wch: 10 }, { hidden: true, wch: 2 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } }, { s: { r: 2, c: 4 }, e: { r: 2, c: 7 } }, { s: { r: 2, c: 8 }, e: { r: 2, c: 12 } }];
    return { ws: ws, count: lines.length };
  }

  function spendSheet(ctx, dept, type) {
    var L = labels(ctx, dept, type), sn = sheetNames(type), byId = {};
    ctx.lines.forEach(function (l) { byId[l.id] = l; });
    var rows = (ctx.spend || []).filter(function (s) { var l = byId[s.line_id]; return l && l.dept === dept && l.type === type; })
      .sort(function (a, b) { var la = byId[a.line_id], lb = byId[b.line_id]; return W.cmpMok(la.mok, lb.mok) || String(a.spent_on || '').localeCompare(String(b.spent_on || '')); });
    var head = ['집행ID', '부서', '코드(목)', '세부명칭', '일자', '적요', '거래처', '금액(원)', '점검', '키'];
    var aoa = [[L.cur + ' ' + dept + ' ' + type + ' ' + L.act + ' 내역 (건별)'],
      ['※ ' + L.cur + '(' + L.curRange + ')에 실제로 ' + L.act + '한 내역을 한 줄에 한 건씩 적습니다. 코드(목)와 세부명칭은 「' + sn.item + '」 시트의 항목과 똑같이 적어야 하며, 맞지 않으면 점검 열에 「항목 없음」이 표시됩니다. 일자는 2026-04-10 형식으로 적습니다.'],
      [], head];
    rows.forEach(function (s) { var l = byId[s.line_id]; aoa.push([s.id, dept, l.mok, l.name, s.spent_on || '', s.memo || '', s.vendor || '', Number(s.amount) || 0, '', '']); });
    for (var i = 0; i < BLANK_SPEND; i++) aoa.push(['', dept, '', '', '', '', '', '', '', '']);
    var ws = XLSX.utils.aoa_to_sheet(aoa), last = aoa.length;
    for (var r = HEAD_ROW + 1; r <= last; r++) {
      ws['J' + r] = { t: 's', f: 'C' + r + '&"|"&D' + r };
      ws['I' + r] = { t: 's', f: 'IF(AND(C' + r + '="",D' + r + '="",H' + r + '=""),"",IF(ISNUMBER(MATCH(J' + r + ",'" + sn.item + "'!$N$5:$N$600,0)),IF(H" + r + '="","금액 필요",""),"항목 없음"))' };
    }
    ws['!ref'] = 'A1:J' + last; W.xlsxMoney(ws, ['H'], HEAD_ROW + 1, last);
    ws['!cols'] = [{ hidden: true, wch: 2 }, { wch: 14 }, { wch: 9 }, { wch: 40 }, { wch: 12 }, { wch: 34 }, { wch: 20 }, { wch: 15 }, { wch: 12 }, { hidden: true, wch: 2 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }];
    return { ws: ws, count: rows.length };
  }

  function workbookFor(ctx, dept) {
    var thr = Number(ctx.settings && ctx.settings.variance_pct) || 20, so = labels(ctx, dept, '세출');
    var wb = XLSX.utils.book_new();
    var guide = [[so.next + ' ' + dept + ' 예산안 작성 안내 (' + so.basis + ' 기준)'], [],
      ['이 파일은 세출·세입 각각에 두 구간으로 되어 있습니다.'],
      ['  ① 올해 집행(수납) 구간 — ' + so.cur + ' (' + so.curRange + '): 건별 내역은 「세출_집행내역」 「세입_수납내역」 시트에, 항목별 연말 추정은 「세출」 「세입」 시트에 적습니다.'],
      ['  ② 내년도 소요 구간 — ' + so.next + ' (' + so.nextRange + '): 「세출」 「세입」 시트에 요구액 · 산출 근거 · 증감 사유를 적습니다.'],
      [],
      ['1. 전년 대비 증감이 ' + thr + '%를 넘거나 신규 항목이면 증감 사유가 필요합니다 (점검 열에 「사유 필요」가 표시됩니다).'],
      ['2. 새 항목은 「세출」 「세입」 시트 맨 아래 빈 줄에 코드(목) · 세부명칭 · 올해 예산 · 요구액을 적습니다. 코드는 「코드표」 시트에서 고릅니다.'],
      ['3. 건별 내역의 코드(목) · 세부명칭은 항목 시트와 똑같이 적습니다. 새 항목에 대한 건별 내역도 같은 방식으로 적을 수 있습니다.'],
      ['4. 숨겨진 열(ID · 집행ID · 키)과 부서 · 구분 · 기존 항목의 코드 · 세부명칭은 바꾸지 마십시오 (바꿔도 반영되지 않습니다).'],
      ['5. 작성이 끝나면 파일을 기획처에 보냅니다. 기획처가 모아서 한 번에 반영합니다.'],
      [], ['양식 만든 날', new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })]];
    var wsG = XLSX.utils.aoa_to_sheet(guide); wsG['!cols'] = [{ wch: 120 }]; XLSX.utils.book_append_sheet(wb, wsG, '안내');
    ['세출', '세입'].forEach(function (type) {
      var sn = sheetNames(type);
      XLSX.utils.book_append_sheet(wb, itemSheet(ctx, dept, type, thr).ws, sn.item);
      XLSX.utils.book_append_sheet(wb, spendSheet(ctx, dept, type).ws, sn.spend);
    });
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
    download(new Blob([wbBytes(workbookFor(ctx, dept))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName(ctx, dept));
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
      fr.onload = function () { try { resolve(XLSX.read(new Uint8Array(fr.result), { type: 'array', cellDates: true })); } catch (e) { reject(new Error(file.name + ': 엑셀 파일을 읽을 수 없습니다.')); } };
      fr.onerror = function () { reject(new Error(file.name + ': 파일을 읽지 못했습니다.')); };
      fr.readAsArrayBuffer(file);
    });
  }
  function headerRow(aoa, firstLabel) {
    for (var i = 0; i < Math.min(aoa.length, 12); i++) if (String(aoa[i][0]).trim() === firstLabel) return i;
    return -1;
  }
  // 항목 시트 (ID 열로 시작): 올해 예산 · 연말 추정 · 요구액 · 산출 근거 · 증감 사유
  function itemRows(ws, fname, sname) {
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }), hi = headerRow(aoa, 'ID');
    if (hi < 0) return null;
    var col = {}; aoa[hi].forEach(function (t, i) {
      t = String(t).trim();
      if (t === 'ID') col.id = i; else if (t === '부서') col.dept = i; else if (t === '구분') col.type = i; else if (t.indexOf('코드') === 0) col.mok = i; else if (t === '세부명칭') col.name = i;
      else if (t === '연말 추정') col.fc = i; else if (/요구액$/.test(t)) col.amount = i; else if (t === '산출 근거') col.calc = i; else if (t === '증감 사유') col.reason = i; else if (/ 예산$/.test(t)) col.base = i;
    });
    if (col.amount == null || col.id == null) return null;
    var out = [];
    for (var r = hi + 1; r < aoa.length; r++) {
      var a = aoa[r], g = function (k) { return col[k] == null ? '' : a[col[k]]; };
      var id = String(g('id')).trim();
      if (!id && !String(g('name')).trim() && !String(g('mok')).trim() && parseNum(g('amount')) == null) continue;
      out.push({ kind: 'item', file: fname, sheet: sname, rowNo: r + 1, id: id, dept: String(g('dept')).trim(), type: String(g('type')).trim(), mok: String(g('mok')).trim(), name: String(g('name')).trim(),
        amount: g('amount'), calc: g('calc'), reason: g('reason'), fc: g('fc'), base: g('base'), hasCalc: col.calc != null, hasReason: col.reason != null, hasFc: col.fc != null });
    }
    return out;
  }
  // 건별 내역 시트 (집행ID 열로 시작)
  function spendRows(ws, fname, sname) {
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }), hi = headerRow(aoa, '집행ID');
    if (hi < 0) return null;
    var type = sname.indexOf('세입') === 0 ? '세입' : '세출', out = [];
    for (var r = hi + 1; r < aoa.length; r++) {
      var a = aoa[r], sid = String(a[0] == null ? '' : a[0]).trim(), mok = String(a[2] == null ? '' : a[2]).trim(), name = String(a[3] == null ? '' : a[3]).trim();
      if (!sid && !mok && !name && parseNum(a[7]) == null && String(a[5] == null ? '' : a[5]).trim() === '') continue;
      out.push({ kind: 'spend', file: fname, sheet: sname, rowNo: r + 1, sid: sid, dept: String(a[1] == null ? '' : a[1]).trim(), type: type, mok: mok, name: name, date: a[4], memo: String(a[5] == null ? '' : a[5]).trim(), vendor: String(a[6] == null ? '' : a[6]).trim(), amount: a[7] });
    }
    return out;
  }

  /* 검증 → 미리 보기 항목 */
  function analyze(ctx, rowsAll) {
    var byId = {}, byKey = {}, spById = {}, thr = Number(ctx.settings && ctx.settings.variance_pct) || 20, seen = {}, deptSet = {}, mokOk = {};
    ctx.lines.forEach(function (l) { byId[l.id] = l; var k = l.dept + '|' + l.type + '|' + l.mok + '|' + l.name; (byKey[k] = byKey[k] || []).push(l); });
    (ctx.spend || []).forEach(function (s) { spById[s.id] = s; });
    (ctx.depts || []).forEach(function (d) { deptSet[d] = true; });
    ctx.codes.forEach(function (c) { if (c.level === 'mok' && c.active !== false) mokOk[c.type + '|' + c.code] = c.name; });
    var res = { items: [], errors: 0, warns: 0, upd: 0, nw: 0, same: 0, sp: [], spErr: 0, spNew: 0, spUpd: 0, spDup: 0, spSame: 0 };
    var newKeys = {}, seenSp = {};

    rowsAll.filter(function (r) { return r.kind === 'item'; }).forEach(function (r) {
      var it = { r: r, errs: [], warns: [], kind: '', payload: null, line: null };
      var amt = parseNum(r.amount), fc = parseNum(r.fc), base = parseNum(r.base);
      if (amt != null && (isNaN(amt) || amt < 0)) it.errs.push('요구액이 숫자가 아니거나 음수입니다');
      if (fc != null && (isNaN(fc) || fc < 0)) it.errs.push('연말 추정이 숫자가 아니거나 음수입니다');
      if (r.id) {
        var l = byId[r.id]; it.line = l;
        if (!l) it.errs.push('ID에 해당하는 항목이 없습니다 (다른 연도 양식이거나 삭제된 항목)');
        else {
          if (seen[r.id]) it.errs.push('같은 항목이 여러 파일·줄에 중복되어 있습니다 (' + seen[r.id] + ')'); else seen[r.id] = r.file + ' ' + r.sheet + ' ' + r.rowNo + '행';
          if ((r.dept && r.dept !== l.dept) || (r.mok && r.mok !== l.mok) || (r.name && r.name !== l.name)) it.warns.push('부서·코드·명칭 변경은 무시됩니다');
          var newAmt = amt == null ? Number(l.amount) : amt, b0 = Number(l.base_amount) || 0, reason = r.hasReason ? String(r.reason).trim() : String(l.reason || '').trim();
          if (!it.errs.length && ((b0 > 0 && Math.abs(newAmt - b0) * 100 / b0 > thr) || (b0 === 0 && newAmt > 0)) && !reason) it.warns.push('증감 사유 필요 (제출 점검 기준)');
          it.kind = 'upd'; it.payload = { id: l.id }; if (amt != null) it.payload.amount = amt;
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
        if (base != null && (isNaN(base) || base < 0)) it.errs.push('올해 예산이 숫자가 아니거나 음수입니다');
        if (!String(r.reason || '').trim()) it.warns.push('신규 항목은 증감 사유가 필요합니다');
        var nk = r.dept + '|' + r.type + '|' + r.mok + '|' + r.name;
        if (newKeys[nk] || byKey[nk]) it.errs.push('같은 부서·코드·명칭의 항목이 이미 있습니다');
        else newKeys[nk] = true;
        it.oldAmt = 0; it.newAmt = amt || 0;
        it.payload = { type: r.type, dept: r.dept, mok: r.mok, name: r.name, amount: amt, calc: String(r.calc || ''), reason: String(r.reason || ''), forecast: fc, base_amount: base == null || isNaN(base) ? 0 : base };
      }
      if (it.errs.length) res.errors++; else { if (it.kind === 'upd') res.upd++; else if (it.kind === 'new') res.nw++; else res.same++; }
      if (it.warns.length && !it.errs.length) res.warns++;
      res.items.push(it);
    });

    // 올해 집행(수납) 건별 내역
    var exist = {}; (ctx.spend || []).forEach(function (s) { exist[s.line_id + '|' + (s.spent_on || '') + '|' + (s.memo || '') + '|' + (s.vendor || '') + '|' + Number(s.amount)] = true; });
    rowsAll.filter(function (r) { return r.kind === 'spend'; }).forEach(function (r) {
      var sp = { r: r, errs: [], kind: '', payload: null, line: null, viaNew: false };
      var amt = parseNum(r.amount), dt = parseDate(r.date);
      if (!deptSet[r.dept]) sp.errs.push('부서가 올바르지 않습니다');
      if (amt == null || isNaN(amt) || amt < 0) sp.errs.push('금액이 없거나 숫자가 아닙니다');
      if (dt == null) sp.errs.push('일자가 없습니다'); else if (typeof dt !== 'string') sp.errs.push('일자 형식이 올바르지 않습니다 (예: 2026-04-10)');
      var key = r.dept + '|' + r.type + '|' + r.mok + '|' + r.name, cand = byKey[key] || [];
      if (!sp.errs.length) {
        if (cand.length > 1) sp.errs.push('같은 코드·명칭의 항목이 둘 이상이라 연결할 수 없습니다');
        else if (cand.length === 1) sp.line = cand[0];
        else if (newKeys[key]) sp.viaNew = true;
        else sp.errs.push('항목 시트에 없는 코드(목)·세부명칭입니다');
      }
      if (!sp.errs.length) {
        var memo = r.memo, vendor = r.vendor;
        if (r.sid) {
          var cur = spById[r.sid];
          if (!cur) sp.errs.push('집행ID에 해당하는 내역이 없습니다 (삭제되었거나 다른 연도 양식)');
          else if (seenSp[r.sid]) sp.errs.push('같은 내역이 중복되어 있습니다');
          else if (sp.line && cur.line_id !== sp.line.id) sp.errs.push('기존 내역의 항목은 바꿀 수 없습니다');
          else {
            seenSp[r.sid] = true;
            var sameAll = (cur.spent_on || '') === dt && (cur.memo || '') === memo && (cur.vendor || '') === vendor && Number(cur.amount) === amt;
            sp.kind = sameAll ? 'same' : 'upd'; sp.oldAmt = Number(cur.amount); sp.newAmt = amt;
            sp.payload = { id: r.sid, line_id: cur.line_id, spent_on: dt, memo: memo, vendor: vendor, amount: amt };
          }
        } else {
          var ek = sp.line ? sp.line.id + '|' + dt + '|' + memo + '|' + vendor + '|' + amt : '';
          if (ek && exist[ek]) { sp.kind = 'dup'; }
          else { sp.kind = 'new'; sp.oldAmt = 0; sp.newAmt = amt; sp.payload = { line_id: sp.line ? sp.line.id : null, key: key, spent_on: dt, memo: memo, vendor: vendor, amount: amt }; }
        }
      }
      if (sp.errs.length) res.spErr++; else if (sp.kind === 'new') res.spNew++; else if (sp.kind === 'upd') res.spUpd++; else if (sp.kind === 'dup') res.spDup++; else res.spSame++;
      res.sp.push(sp);
    });
    return res;
  }

  function previewModal(ctx, res, files, onDone) {
    var changed = res.items.filter(function (i) { return !i.errs.length && i.kind !== 'same'; });
    var bad = res.items.filter(function (i) { return i.errs.length; });
    var spChanged = res.sp.filter(function (i) { return !i.errs.length && (i.kind === 'new' || i.kind === 'upd'); });
    var spBad = res.sp.filter(function (i) { return i.errs.length; });
    var tr = function (i) {
      var r = i.r, l = i.line, diff = i.newAmt - i.oldAmt;
      return '<tr><td class="nowrap">' + esc(l ? l.dept : r.dept) + '<div class="muted">' + esc(l ? l.type : r.type) + '</div></td>' +
        '<td><span class="c-code">' + esc(l ? l.mok : r.mok) + '</span> ' + esc(l ? l.name : r.name) + '<div class="muted">' + esc(r.file) + ' · ' + esc(r.sheet) + ' ' + r.rowNo + '행</div></td>' +
        '<td class="num nowrap">' + (i.kind === 'new' ? '신규' : won(i.oldAmt) + ' → ') + '<b>' + won(i.newAmt) + '</b><div class="' + (diff < 0 ? 'neg' : 'muted') + '">' + (i.kind === 'new' ? '' : (diff > 0 ? '+' : '') + won(diff)) + '</div></td>' +
        '<td>' + (i.errs.length ? '<span class="flag err">' + esc(i.errs.join(' / ')) + '</span>' : (i.kind === 'new' ? '<span class="flag info">신규</span> ' : '') + (i.warns.length ? '<span class="flag warn">' + esc(i.warns.join(' / ')) + '</span>' : '')) + '</td></tr>';
    };
    var trSp = function (i) {
      var r = i.r;
      return '<tr><td class="nowrap">' + esc(r.dept) + '<div class="muted">' + esc(r.type) + '</div></td>' +
        '<td><span class="c-code">' + esc(r.mok) + '</span> ' + esc(r.name) + '<div class="muted">' + esc(typeof parseDate(r.date) === 'string' ? parseDate(r.date) : String(r.date || '')) + ' · ' + esc(r.memo) + ' · ' + esc(r.file) + ' ' + esc(r.sheet) + ' ' + r.rowNo + '행</div></td>' +
        '<td class="num nowrap">' + (i.kind === 'new' ? '추가 ' : (i.kind === 'upd' ? won(i.oldAmt) + ' → ' : '')) + '<b>' + (i.newAmt == null ? '' : won(i.newAmt)) + '</b></td>' +
        '<td>' + (i.errs.length ? '<span class="flag err">' + esc(i.errs.join(' / ')) + '</span>' : (i.viaNew ? '<span class="flag info">신규 항목에 연결</span>' : (i.kind === 'upd' ? '<span class="flag info">수정</span>' : '<span class="flag info">추가</span>'))) + '</td></tr>';
    };
    var head = '<thead><tr><th>부서 / 구분</th><th>코드 · 항목 · 위치</th><th class="num">금액 (현재 → 새)</th><th>점검</th></tr></thead>';
    var sumDiff = changed.reduce(function (s, i) { return s + (i.newAmt - i.oldAmt); }, 0), spSum = spChanged.reduce(function (s, i) { return s + (i.newAmt - (i.oldAmt || 0)); }, 0);
    var kp = function (l, v, c) { return '<div class="kpi' + (c ? ' ' + c : '') + '"><div class="kpi-l">' + l + '</div><div class="kpi-v sm">' + v + '</div></div>'; };
    var body = '<div class="kpis">' + kp('파일', files + '개') + kp('② 소요 수정', res.upd + '건') + kp('② 신규 항목', res.nw + '건') + kp('② 변경 없음', res.same + '건') + kp('② 요구액 합계 변화', (sumDiff > 0 ? '+' : '') + won(sumDiff) + '<small>원</small>') + '</div>' +
      '<div class="kpis">' + kp('① 집행 내역 추가', res.spNew + '건') + kp('① 집행 내역 수정', res.spUpd + '건') + kp('① 이미 있는 내역(건너뜀)', (res.spDup + res.spSame) + '건') + kp('① 집행액 합계 변화', (spSum > 0 ? '+' : '') + won(spSum) + '<small>원</small>') + kp('오류', (res.errors + res.spErr) + '건', (res.errors + res.spErr) ? 'warnk' : '') + '</div>' +
      (res.warns ? '<div class="note warn">' + ico('alert', 16) + ' <span>확인 권장 ' + res.warns + '건 (증감 사유 누락 등)은 반영은 되지만 부서 제출 점검에서 걸릴 수 있습니다.</span></div>' : '') +
      ((bad.length || spBad.length) ? '<h4>오류 ' + (bad.length + spBad.length) + '건</h4><div class="tbl-wrap"><table class="bt">' + head + '<tbody>' + bad.map(tr).join('') + spBad.map(trSp).join('') + '</tbody></table></div><label class="chk-l"><input type="checkbox" id="xi-skip"> 오류 행은 빼고 나머지만 반영</label>' : '') +
      '<h4>② 내년도 소요 — 반영될 변경 ' + changed.length + '건</h4>' + (changed.length ? '<div class="tbl-wrap xi-scroll"><table class="bt">' + head + '<tbody>' + changed.map(tr).join('') + '</tbody></table></div>' : '<p class="muted">반영할 변경이 없습니다.</p>') +
      '<h4>① 올해 집행(수납) 내역 — 반영될 변경 ' + spChanged.length + '건</h4>' + (spChanged.length ? '<div class="tbl-wrap xi-scroll"><table class="bt">' + head + '<tbody>' + spChanged.map(trSp).join('') + '</tbody></table></div>' : '<p class="muted">반영할 집행 내역이 없습니다.</p>') +
      '<p class="muted">항목(②)을 먼저 반영한 뒤 집행 내역(①)을 반영하며, 각 단계는 서버에서 한 번에 처리됩니다(오류 시 그 단계 전체 취소). 코드·명칭은 바뀌지 않고, 변경 전후 값은 이력에 남습니다.</p>';
    W.modal({ title: '엑셀 일괄 반영 미리 보기', cls: 'wide', body: body, actions: [{ label: '닫기', cls: 'btn-ghost' }, { label: '반영', cls: 'btn-primary', onClick: function (m, btn) {
      var skip = $('#xi-skip', m.el);
      if ((bad.length || spBad.length) && !(skip && skip.checked)) return toast('오류가 있습니다. 파일을 고치거나 「오류 행은 빼고 반영」을 선택해 주십시오.', 'err');
      if (!changed.length && !spChanged.length) return toast('반영할 변경이 없습니다.');
      btn.disabled = true;
      var step1 = changed.length ? W.rpc('bgt_a_lines_import', { p_token: W.sess.token, p_year: ctx.year, p_items: changed.map(function (i) { return i.payload; }) }) : Promise.resolve({ updated: 0, created: 0 });
      step1.then(function (r1) {
        if (!spChanged.length) return { r1: r1, r2: { created: 0, updated: 0 } };
        var needLoad = spChanged.some(function (i) { return !i.payload.line_id; });
        var lines = needLoad ? W.rpc('bgt_a_load', { p_token: W.sess.token, p_year: ctx.year }).then(function (d) { return d.lines; }) : Promise.resolve(ctx.lines);
        return lines.then(function (ls) {
          var byKey = {}; ls.forEach(function (l) { byKey[l.dept + '|' + l.type + '|' + l.mok + '|' + l.name] = l.id; });
          var items = spChanged.map(function (i) { var p = i.payload; return { id: p.id, line_id: p.line_id || byKey[p.key], spent_on: p.spent_on, memo: p.memo, vendor: p.vendor, amount: p.amount }; });
          if (items.some(function (x) { return !x.line_id; })) throw new Error('새로 만든 항목에 연결하지 못한 집행 내역이 있습니다. 새로고침 후 같은 파일을 다시 올려 주십시오(이미 반영된 항목은 건너뜁니다).');
          return W.rpc('bgt_a_spend_import', { p_token: W.sess.token, p_year: ctx.year, p_items: items }).then(function (r2) { return { r1: r1, r2: r2 }; });
        });
      }).then(function (x) {
        m.close(); toast('항목 수정 ' + x.r1.updated + '건 · 신규 ' + x.r1.created + '건, 집행 내역 추가 ' + x.r2.created + '건 · 수정 ' + x.r2.updated + '건을 반영했습니다.'); if (onDone) onDone();
      }).catch(function (e) { btn.disabled = false; fail(e); });
    } }] });
  }

  /* ───────── 관리자 카드 ───────── */
  function mountAdmin(box, ctx) {
    var depts = ctx.depts;
    box.innerHTML = '<h3>부서별 작성 양식 (엑셀)</h3><p class="muted">모든 부서(공통 포함)가 같은 틀을 씁니다. 세출·세입 각각에 <b>① 올해 집행(수납) 구간</b>과 <b>② 내년도 소요 구간</b>이 있으며, 건별 집행 내역도 엑셀에서 작성합니다. 입학처는 학년도(3월~익년 2월) 기준으로 표기됩니다. 작성된 파일을 한꺼번에 올려 미리 보기 후 반영합니다.</p>' +
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
        list.forEach(function (x) { x.wb.SheetNames.forEach(function (sn) { var ws = x.wb.Sheets[sn], r = itemRows(ws, x.f.name, sn) || spendRows(ws, x.f.name, sn); if (r) { used++; rows = rows.concat(r); } }); });
        if (!used) return toast('양식(ID·요구액 열 또는 집행ID 열이 있는 시트)을 찾지 못했습니다. 내려받은 양식 파일이 맞는지 확인해 주세요.', 'err');
        previewModal(ctx, analyze(ctx, rows), fs.length, ctx.onDone);
      }).catch(fail);
    };
  }

  function deptButton(ctx) { downloadDept(ctx, ctx.dept); }

  window.BudgetXlsx = { mountAdmin: mountAdmin, deptDownload: deptButton, analyze: analyze, zipStore: zipStore, workbookFor: workbookFor, itemRows: itemRows, spendRows: spendRows };
})();
