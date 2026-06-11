window.FacilityFeeModule = (function() {
  'use strict';
  var STORE_KEY = 'asea_facility_fees';

  // 데이터 구조: [{
  //   id, buildingName, roomName, capacity,
  //   normalStart, normalEnd, normalRate (원/시간),
  //   surchargeStart, surchargeEnd, surchargeRate (원/시간),
  //   minHours, unitMinutes(60),
  //   deposit, cleaningFee,
  //   extraItems: [{name, amount}],
  //   notes, createdAt
  // }]

  function loadFees() { try { return JSON.parse(localStorage.getItem(STORE_KEY)||'[]'); } catch(e){ return []; } }
  function saveFees(a) { localStorage.setItem(STORE_KEY, JSON.stringify(a)); }

  function genId() { return 'fee_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }

  function addFee(fee) {
    var fees = loadFees();
    fee.id = genId(); fee.createdAt = Date.now();
    fees.push(fee); saveFees(fees); return fee;
  }

  function updateFee(id, data) {
    var fees = loadFees();
    var i = fees.findIndex(function(f){ return f.id === id; });
    if (i > -1) { fees[i] = Object.assign({}, fees[i], data); saveFees(fees); }
  }

  function deleteFee(id) {
    saveFees(loadFees().filter(function(f){ return f.id !== id; }));
  }

  // 건물명+호실명으로 요금 설정 찾기
  function getFeeForRoom(buildingName, roomName) {
    return loadFees().find(function(f){
      return f.buildingName === buildingName && f.roomName === roomName;
    }) || null;
  }

  // 분 계산 헬퍼: "HH:MM" → 분
  function timeToMins(hhmm) {
    if (!hhmm) return 0;
    var p = hhmm.split(':'); return parseInt(p[0],10)*60 + parseInt(p[1]||0,10);
  }

  // 두 구간의 겹치는 분 수
  function overlapMins(s1, e1, s2, e2) {
    return Math.max(0, Math.min(e1,e2) - Math.max(s1,s2));
  }

  // 요금 계산
  // ranges: [{startAt: '2026-07-23T09:00', endAt: '2026-07-23T15:00'}]
  // 반환: {normalHours, normalFee, surchargeHours, surchargeFee, subtotal, deposit, cleaningFee, extraTotal, total, breakdown, totalHours}
  function calcFee(fee, ranges) {
    if (!fee || !ranges || !ranges.length) return null;

    var normS = timeToMins(fee.normalStart || '09:00');
    var normE = timeToMins(fee.normalEnd || '18:00');
    var surS  = timeToMins(fee.surchargeStart || '18:00');
    var surE  = timeToMins(fee.surchargeEnd || '22:00');

    var totalNormMins = 0, totalSurMins = 0;
    var breakdown = [];

    ranges.forEach(function(r) {
      if (!r.startAt || !r.endAt) return;
      var sd = new Date(r.startAt), ed = new Date(r.endAt);
      if (isNaN(sd) || isNaN(ed) || ed <= sd) return;

      // 날짜가 다른 경우: 일단 단순화 (같은 날로 처리 - 시간만 사용)
      var sMin = sd.getHours()*60 + sd.getMinutes();
      var eMin = ed.getHours()*60 + ed.getMinutes();
      // 종료가 다음날 자정 이후인 경우 처리
      if (ed.getDate() !== sd.getDate()) { eMin += 24*60 * (ed.getDate() - sd.getDate()); }

      var nm = overlapMins(sMin, eMin, normS, normE);
      var sm = overlapMins(sMin, eMin, surS, surE);

      var totalMins = eMin - sMin;

      totalNormMins += nm;
      totalSurMins  += sm;

      breakdown.push({
        label: fmtDT(r.startAt) + ' ~ ' + fmtTime(r.endAt),
        normMins: nm, surMins: sm,
        totalMins: totalMins
      });
    });

    var normalHours    = totalNormMins / 60;
    var surchargeHours = totalSurMins  / 60;
    var normalFee    = Math.ceil(normalHours)    * (fee.normalRate    || 0);
    var surchargeFee = Math.ceil(surchargeHours) * (fee.surchargeRate || 0);

    // 최소 이용 시간 적용
    var totalHours = normalHours + surchargeHours;
    var minH = fee.minHours || 0;
    var underMin = minH > 0 && totalHours > 0 && totalHours < minH;

    var subtotal  = normalFee + surchargeFee;
    var deposit   = fee.deposit   || 0;
    var cleanFee  = fee.cleaningFee || 0;
    var extraTotal = (fee.extraItems || []).reduce(function(s,e){ return s + (e.amount||0); }, 0);
    var total = subtotal + deposit + cleanFee + extraTotal;

    return {
      normalHours: normalHours, normalFee: normalFee,
      surchargeHours: surchargeHours, surchargeFee: surchargeFee,
      subtotal: subtotal, deposit: deposit, cleaningFee: cleanFee, extraTotal: extraTotal, total: total,
      totalHours: totalHours, underMin: underMin, minHours: minH,
      breakdown: breakdown,
      extraItems: fee.extraItems || []
    };
  }

  function fmtDT(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var pad = function(n){return String(n).padStart(2,'0');};
    return (d.getMonth()+1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var pad = function(n){return String(n).padStart(2,'0');};
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function comma(n) { return Math.round(n).toLocaleString(); }

  // 견적서 HTML (인쇄용)
  function buildQuoteHTML(info) {
    var calc = info.calc;
    var fee  = info.feeConfig || {};

    var rangeRows = (info.ranges||[]).map(function(r) {
      return '<tr><td>' + (r.startAt||'') + '</td><td>' + (r.endAt||'') + '</td></tr>';
    }).join('');

    var breakdownRows = '';
    if (calc) {
      if (calc.normalHours > 0) {
        breakdownRows += '<tr><td>평상시간대 이용 (' + fee.normalStart + '~' + fee.normalEnd + ')</td>' +
          '<td>' + calc.normalHours.toFixed(1) + '시간</td>' +
          '<td>' + comma(fee.normalRate) + '원/시간</td>' +
          '<td>' + comma(calc.normalFee) + '원</td></tr>';
      }
      if (calc.surchargeHours > 0) {
        breakdownRows += '<tr><td>할증시간대 이용 (' + fee.surchargeStart + '~' + fee.surchargeEnd + ')</td>' +
          '<td>' + calc.surchargeHours.toFixed(1) + '시간</td>' +
          '<td>' + comma(fee.surchargeRate) + '원/시간</td>' +
          '<td>' + comma(calc.surchargeFee) + '원</td></tr>';
      }
      if (calc.deposit > 0) {
        breakdownRows += '<tr><td>보증금</td><td>-</td><td>-</td><td>' + comma(calc.deposit) + '원</td></tr>';
      }
      if (calc.cleaningFee > 0) {
        breakdownRows += '<tr><td>청소비</td><td>-</td><td>-</td><td>' + comma(calc.cleaningFee) + '원</td></tr>';
      }
      (calc.extraItems||[]).forEach(function(ex){
        breakdownRows += '<tr><td>' + ex.name + '</td><td>-</td><td>-</td><td>' + comma(ex.amount) + '원</td></tr>';
      });
    }

    var today = new Date();
    var pad = function(n){ return String(n).padStart(2,'0'); };
    var todayStr = today.getFullYear() + '년 ' + pad(today.getMonth()+1) + '월 ' + pad(today.getDate()) + '일';

    return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">\n' +
'<title>시설 대관 견적서</title>\n' +
'<style>\n' +
'@page { size: A4; margin: 15mm 18mm; }\n' +
'*{box-sizing:border-box;margin:0;padding:0;}\n' +
'body{font-family:\'맑은 고딕\',\'Malgun Gothic\',sans-serif;font-size:9pt;color:#111;background:#fff;}\n' +
'.quote-wrap{padding:0;}\n' +
'.quote-header{text-align:center;margin-bottom:16px;padding-bottom:12px;border-bottom:2.5px solid #1a3a5c;}\n' +
'.quote-title{font-size:20pt;font-weight:800;color:#1a3a5c;letter-spacing:4px;margin-bottom:4px;}\n' +
'.quote-subtitle{font-size:10pt;color:#555;}\n' +
'.section{margin-bottom:12px;}\n' +
'.section-title{font-size:9pt;font-weight:700;color:#1a3a5c;background:#EFF6FF;border-left:3px solid #1a3a5c;padding:4px 8px;margin-bottom:6px;}\n' +
'table{width:100%;border-collapse:collapse;}\n' +
'th,td{border:1px solid #ccc;padding:5px 8px;font-size:8.5pt;vertical-align:middle;}\n' +
'th{background:#f0f4f8;font-weight:700;color:#1a3a5c;text-align:center;}\n' +
'td:last-child{text-align:right;}\n' +
'.total-row td{font-weight:800;font-size:10pt;color:#1a3a5c;background:#EFF6FF;}\n' +
'.note-box{background:#FEF9EC;border:1px solid #FCD34D;border-radius:6px;padding:8px 10px;font-size:8pt;color:#92400E;margin-top:8px;}\n' +
'.footer-line{margin-top:20px;padding-top:10px;border-top:1px solid #ddd;font-size:8pt;color:#888;text-align:right;}\n' +
'.sig-area{display:flex;justify-content:flex-end;gap:32px;margin-top:20px;}\n' +
'.sig-box{text-align:center;font-size:9pt;}\n' +
'.sig-line{width:120px;height:40px;border-bottom:1px solid #aaa;margin:0 auto 4px;}\n' +
'</style></head><body>\n' +
'<div class="quote-wrap">\n' +
'  <div class="quote-header">\n' +
'    <div class="quote-title">시 설 대 관 견 적 서</div>\n' +
'    <div class="quote-subtitle">견적일: ' + todayStr + ' &nbsp;|&nbsp; 담당: 시설 관리 담당자</div>\n' +
'  </div>\n' +
'  <div class="section">\n' +
'    <div class="section-title">■ 신청 정보</div>\n' +
'    <table>\n' +
'      <tr><th style="width:20%">신청자</th><td>' + (info.applicant&&info.applicant.name||'-') + '</td><th style="width:20%">소속/기관</th><td>' + (info.applicant&&info.applicant.org||'-') + '</td></tr>\n' +
'      <tr><th>연락처</th><td>' + (info.applicant&&info.applicant.phone||'-') + '</td><th>이메일</th><td>' + (info.applicant&&info.applicant.email||'-') + '</td></tr>\n' +
'      <tr><th>행사명</th><td colspan="3">' + (info.title||'-') + '</td></tr>\n' +
'      <tr><th>사용 목적</th><td>' + (info.purpose||'-') + '</td><th>참석 인원</th><td>' + (info.attendees||'-') + '</td></tr>\n' +
'    </table>\n' +
'  </div>\n' +
'  <div class="section">\n' +
'    <div class="section-title">■ 시설 및 이용 일시</div>\n' +
'    <table>\n' +
'      <tr><th style="width:20%">건물</th><td>' + (info.buildingName||'-') + '</td><th style="width:20%">호실</th><td>' + (info.roomName||'-') + '</td></tr>\n' +
'    </table>\n' +
'    <table style="margin-top:6px">\n' +
'      <tr><th>이용 시작</th><th>이용 종료</th></tr>\n' +
      rangeRows + '\n' +
'    </table>\n' +
'  </div>\n' +
'  <div class="section">\n' +
'    <div class="section-title">■ 요금 산출 내역</div>\n' +
'    <table>\n' +
'      <tr><th style="width:40%">항목</th><th>시간/수량</th><th>단가</th><th>금액</th></tr>\n' +
      (breakdownRows || '<tr><td colspan="4" style="text-align:center;color:#888">요금 정보 없음</td></tr>') + '\n' +
      (calc ? '      <tr class="total-row"><td colspan="3">합 계</td><td>' + comma(calc.total) + '원</td></tr>\n' : '') +
'    </table>\n' +
    (fee.notes ? '    <div class="note-box">📌 ' + fee.notes + '</div>\n' : '') +
    (calc&&calc.underMin ? '    <div class="note-box" style="margin-top:4px">⚠️ 최소 이용 시간: ' + calc.minHours + '시간 (실제 이용 시간이 최소 기준 미달인 경우 최소 시간 기준으로 산정됩니다)</div>\n' : '') +
'  </div>\n' +
'  <div class="sig-area">\n' +
'    <div class="sig-box"><div class="sig-line"></div><div>신청자 (서명)</div></div>\n' +
'    <div class="sig-box"><div class="sig-line"></div><div>담당자 확인</div></div>\n' +
'  </div>\n' +
'  <div class="footer-line">본 견적서는 담당자 최종 확인 후 확정되며, 최종 요금은 변경될 수 있습니다. | ASEA 항공학원</div>\n' +
'</div>\n' +
'</body></html>';
  }

  function printQuote(info) {
    var html = buildQuoteHTML(info);
    var win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
    if (!win) { alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.'); return; }
    win.document.write(html);
    win.document.close();
    win.onload = function() { setTimeout(function(){ win.print(); }, 300); };
  }

  return {
    loadFees: loadFees,
    saveFees: saveFees,
    addFee: addFee,
    updateFee: updateFee,
    deleteFee: deleteFee,
    getFeeForRoom: getFeeForRoom,
    calcFee: calcFee,
    buildQuoteHTML: buildQuoteHTML,
    printQuote: printQuote,
    comma: comma,
    fmtDT: fmtDT
  };
})();
