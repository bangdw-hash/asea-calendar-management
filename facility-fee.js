window.FacilityFeeModule = (function() {
  'use strict';
  var STORE_KEY = 'asea_facility_fees';

  /*
    데이터 구조 v2:
    {
      id, buildingName, roomName,
      normalStart, normalEnd, normalRate,          // 평상 시간대
      surchargeSlots: [{label,start,end,rate}],    // 할증 시간대 (복수)
      minHours,
      deposit, cleaningFee,
      timeExtras: [{name, unitRate}],              // 시간비례 추가항목 (원/시간)
      flatExtras: [{name, amount}],                // 일괄 추가항목 (회당 고정)
      notes, createdAt
    }
    backward compat: surchargeStart/End/Rate → surchargeSlots[0] 으로 변환
  */

  function loadFees() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)||'[]'); } catch(e){ return []; }
  }
  function saveFees(a) { localStorage.setItem(STORE_KEY, JSON.stringify(a)); }

  function genId() { return 'fee_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }

  // 구버전 → v2 변환
  function normalize(fee) {
    if (!fee) return fee;
    if (!fee.surchargeSlots) {
      fee.surchargeSlots = (fee.surchargeStart || fee.surchargeEnd || fee.surchargeRate)
        ? [{ label: '할증', start: fee.surchargeStart||'18:00', end: fee.surchargeEnd||'22:00', rate: fee.surchargeRate||0 }]
        : [];
    }
    if (!fee.timeExtras) {
      fee.timeExtras = (fee.extraItems||[])
        .filter(function(e){ return e.unitRate != null; })
        .map(function(e){ return { name: e.name, unitRate: e.unitRate||0 }; });
    }
    if (!fee.flatExtras) {
      fee.flatExtras = (fee.extraItems||[])
        .filter(function(e){ return e.unitRate == null; })
        .map(function(e){ return { name: e.name, amount: e.amount||0 }; });
    }
    return fee;
  }

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
  function getFeeForRoom(buildingName, roomName) {
    var f = loadFees().find(function(f){
      return f.buildingName === buildingName && f.roomName === roomName;
    });
    return f ? normalize(f) : null;
  }

  function timeToMins(hhmm) {
    if (!hhmm) return 0;
    var p = hhmm.split(':'); return parseInt(p[0],10)*60 + parseInt(p[1]||0,10);
  }
  function overlapMins(s1, e1, s2, e2) {
    return Math.max(0, Math.min(e1,e2) - Math.max(s1,s2));
  }

  /*
    calcFee(fee, ranges)
    ranges: [{startAt:'2026-07-23T09:00', endAt:'2026-07-23T15:00'}]
    반환: {
      normalHours, normalFee,
      surchargeSlots: [{label,hours,fee}],  ← 각 할증 슬롯별 결과
      totalSurchargeFee,
      totalHours,
      deposit, cleaningFee,
      timeExtras: [{name, hours, unitRate, amount}],
      flatExtras: [{name, amount}],
      timeExtraTotal, flatExtraTotal,
      subtotal, total,
      underMin, minHours,
      breakdown
    }
  */
  function calcFee(fee, ranges) {
    if (!fee || !ranges || !ranges.length) return null;
    fee = normalize(Object.assign({}, fee));

    var normS = timeToMins(fee.normalStart || '09:00');
    var normE = timeToMins(fee.normalEnd   || '18:00');
    var surSlots = (fee.surchargeSlots || []).map(function(s) {
      return { label: s.label||'할증', start: timeToMins(s.start||'18:00'), end: timeToMins(s.end||'22:00'), rate: s.rate||0 };
    });

    var totalNormMins = 0;
    var surMinsBySlot = surSlots.map(function(){ return 0; });
    var totalMinsAll  = 0;
    var breakdown     = [];

    ranges.forEach(function(r) {
      if (!r.startAt || !r.endAt) return;
      var sd = new Date(r.startAt), ed = new Date(r.endAt);
      if (isNaN(sd) || isNaN(ed) || ed <= sd) return;
      var sMin = sd.getHours()*60 + sd.getMinutes();
      var eMin = ed.getHours()*60 + ed.getMinutes();
      if (ed.getDate() !== sd.getDate()) { eMin += 24*60*(ed.getDate()-sd.getDate()); }
      var nm = overlapMins(sMin, eMin, normS, normE);
      var sms = surSlots.map(function(s){ return overlapMins(sMin, eMin, s.start, s.end); });
      var tm = eMin - sMin;
      totalNormMins += nm;
      sms.forEach(function(v,i){ surMinsBySlot[i] += v; });
      totalMinsAll  += tm;
      breakdown.push({ label: fmtDT(r.startAt) + ' ~ ' + fmtTime(r.endAt), normMins:nm, surMins:sms, totalMins:tm });
    });

    var normalHours = totalNormMins / 60;
    var normalFee   = Math.ceil(normalHours) * (fee.normalRate || 0);
    var totalHours  = totalMinsAll / 60;

    var surchargeResults = surSlots.map(function(s, i) {
      var h = surMinsBySlot[i] / 60;
      return { label: s.label, start: fee.surchargeSlots[i].start, end: fee.surchargeSlots[i].end, rate: s.rate, hours: h, fee: Math.ceil(h)*s.rate };
    });
    var totalSurchargeFee = surchargeResults.reduce(function(acc,s){ return acc+s.fee; }, 0);

    var minH     = fee.minHours || 0;
    var underMin = minH > 0 && totalHours > 0 && totalHours < minH;

    var deposit  = fee.deposit || 0;
    var cleanFee = fee.cleaningFee || 0;

    var timeExtraResults = (fee.timeExtras || []).map(function(ex) {
      var amt = Math.ceil(totalHours) * (ex.unitRate || 0);
      return { name: ex.name, hours: totalHours, unitRate: ex.unitRate||0, amount: amt };
    });
    var timeExtraTotal = timeExtraResults.reduce(function(acc,e){ return acc+e.amount; }, 0);

    var flatExtraResults = (fee.flatExtras || []).map(function(ex) {
      return { name: ex.name, amount: ex.amount || 0 };
    });
    var flatExtraTotal = flatExtraResults.reduce(function(acc,e){ return acc+e.amount; }, 0);

    // ── 냉난방비: 대관 날짜 월 기준, 적용월에만 시간당 단가 적용 ──
    var hvac = fee.seasonalFee || {};
    var hvacResult = null;
    if (hvac.enabled) {
      var hvacRate   = hvac.rate || 10000;
      var hvacMonths = hvac.months || [1,2,3,5,6,7,8,9,11,12];
      var hvacMins   = 0;
      var hvacMonthsApplied = [];
      ranges.forEach(function(r) {
        if (!r.startAt || !r.endAt) return;
        var sd = new Date(r.startAt), ed = new Date(r.endAt);
        if (isNaN(sd) || isNaN(ed) || ed <= sd) return;
        var mon = sd.getMonth() + 1;  // 1~12
        if (hvacMonths.indexOf(mon) > -1) {
          hvacMins += (ed - sd) / 60000;
          if (hvacMonthsApplied.indexOf(mon) < 0) hvacMonthsApplied.push(mon);
        }
      });
      if (hvacMins > 0) {
        var hvacHours = hvacMins / 60;
        hvacResult = {
          hours: hvacHours,
          rate: hvacRate,
          amount: Math.ceil(hvacHours) * hvacRate,
          months: hvacMonthsApplied
        };
      }
    }
    var hvacTotal = hvacResult ? hvacResult.amount : 0;

    var subtotal = normalFee + totalSurchargeFee + deposit + cleanFee + timeExtraTotal + flatExtraTotal + hvacTotal;

    return {
      normalHours: normalHours, normalFee: normalFee,
      surchargeSlots: surchargeResults,
      totalSurchargeFee: totalSurchargeFee,
      totalHours: totalHours,
      deposit: deposit, cleaningFee: cleanFee,
      timeExtras: timeExtraResults, flatExtras: flatExtraResults,
      timeExtraTotal: timeExtraTotal, flatExtraTotal: flatExtraTotal,
      hvac: hvacResult,
      subtotal: subtotal, total: subtotal,
      underMin: underMin, minHours: minH,
      breakdown: breakdown
    };
  }

  function fmtDT(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var pad = function(n){return String(n).padStart(2,'0');};
    return (d.getMonth()+1)+'/'+d.getDate()+' '+pad(d.getHours())+':'+pad(d.getMinutes());
  }
  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var pad = function(n){return String(n).padStart(2,'0');};
    return pad(d.getHours())+':'+pad(d.getMinutes());
  }
  function comma(n) { return Math.round(n).toLocaleString(); }

  // ── 견적서 HTML ──────────────────────────────────────────
  function buildQuoteHTML(info) {
    var calc = info.calc;
    var fee  = normalize(Object.assign({}, info.feeConfig || {}));

    var rangeRows = (info.ranges||[]).map(function(r) {
      return '<tr><td>' + (r.startAt||'') + '</td><td>' + (r.endAt||'') + '</td></tr>';
    }).join('');

    var breakdownRows = '';
    if (calc) {
      if (calc.normalHours > 0) {
        breakdownRows += '<tr><td>평상 시간대 (' + (fee.normalStart||'') + '~' + (fee.normalEnd||'') + ')</td>' +
          '<td>' + calc.normalHours.toFixed(1) + '시간</td>' +
          '<td>' + comma(fee.normalRate||0) + '원/시간</td>' +
          '<td>' + comma(calc.normalFee) + '원</td></tr>';
      }
      (calc.surchargeSlots||[]).forEach(function(s) {
        if (s.hours > 0) {
          breakdownRows += '<tr><td>' + s.label + ' 할증 시간대 (' + s.start + '~' + s.end + ')</td>' +
            '<td>' + s.hours.toFixed(1) + '시간</td>' +
            '<td>' + comma(s.rate) + '원/시간</td>' +
            '<td>' + comma(s.fee) + '원</td></tr>';
        }
      });
      (calc.timeExtras||[]).forEach(function(ex) {
        if (ex.amount > 0) {
          breakdownRows += '<tr><td>' + ex.name + ' (시간비례)</td>' +
            '<td>' + ex.hours.toFixed(1) + '시간</td>' +
            '<td>' + comma(ex.unitRate) + '원/시간</td>' +
            '<td>' + comma(ex.amount) + '원</td></tr>';
        }
      });
      (calc.flatExtras||[]).forEach(function(ex) {
        breakdownRows += '<tr><td>' + ex.name + ' (일괄)</td><td>1회</td><td>-</td><td>' + comma(ex.amount) + '원</td></tr>';
      });
      if (calc.hvac && calc.hvac.amount > 0) {
        breakdownRows += '<tr><td>냉난방비 (' + (calc.hvac.months||[]).join('·') + '월 적용)</td>' +
          '<td>' + calc.hvac.hours.toFixed(1) + '시간</td>' +
          '<td>' + comma(calc.hvac.rate) + '원/시간</td>' +
          '<td>' + comma(calc.hvac.amount) + '원</td></tr>';
      }
      if (calc.deposit > 0) breakdownRows += '<tr><td>보증금</td><td>-</td><td>-</td><td>' + comma(calc.deposit) + '원</td></tr>';
      if (calc.cleaningFee > 0) breakdownRows += '<tr><td>청소비</td><td>-</td><td>-</td><td>' + comma(calc.cleaningFee) + '원</td></tr>';
    }

    var today = new Date();
    var pad = function(n){ return String(n).padStart(2,'0'); };
    var todayStr = today.getFullYear()+'년 '+pad(today.getMonth()+1)+'월 '+pad(today.getDate())+'일';

    return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">\n' +
'<title>시설 대관 견적서</title>\n' +
'<style>\n' +
'@page{size:A4;margin:15mm 18mm;}\n' +
'*{box-sizing:border-box;margin:0;padding:0;}\n' +
'body{font-family:\'맑은 고딕\',\'Malgun Gothic\',sans-serif;font-size:9pt;color:#111;background:#fff;}\n' +
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
'  <div class="quote-header"><div class="quote-title">시 설 대 관 견 적 서</div>' +
'<div class="quote-subtitle">견적일: '+todayStr+' &nbsp;|&nbsp; 담당: 시설 관리 담당자</div></div>\n' +
'  <div class="section"><div class="section-title">■ 신청 정보</div><table>\n' +
'    <tr><th style="width:20%">신청자</th><td>'+(info.applicant&&info.applicant.name||'-')+'</td><th style="width:20%">소속/기관</th><td>'+(info.applicant&&info.applicant.org||'-')+'</td></tr>\n' +
'    <tr><th>연락처</th><td>'+(info.applicant&&info.applicant.phone||'-')+'</td><th>이메일</th><td>'+(info.applicant&&info.applicant.email||'-')+'</td></tr>\n' +
'    <tr><th>행사명</th><td colspan="3">'+(info.title||'-')+'</td></tr>\n' +
'    <tr><th>사용 목적</th><td>'+(info.purpose||'-')+'</td><th>참석 인원</th><td>'+(info.attendees||'-')+'</td></tr>\n' +
'  </table></div>\n' +
'  <div class="section"><div class="section-title">■ 시설 및 이용 일시</div>\n' +
'    <table><tr><th style="width:20%">건물</th><td>'+(info.buildingName||'-')+'</td><th style="width:20%">호실</th><td>'+(info.roomName||'-')+'</td></tr></table>\n' +
'    <table style="margin-top:6px"><tr><th>이용 시작</th><th>이용 종료</th></tr>'+rangeRows+'</table>\n' +
'  </div>\n' +
'  <div class="section"><div class="section-title">■ 요금 산출 내역</div>\n' +
'    <table><tr><th style="width:40%">항목</th><th>시간/수량</th><th>단가</th><th>금액</th></tr>\n' +
    (breakdownRows||'<tr><td colspan="4" style="text-align:center;color:#888">요금 정보 없음</td></tr>') + '\n' +
    (calc ? '    <tr class="total-row"><td colspan="3">합 계</td><td>'+comma(calc.total)+'원</td></tr>\n' : '') +
'    </table>\n' +
    (fee.notes ? '    <div class="note-box">📌 '+fee.notes+'</div>\n' : '') +
    (calc&&calc.underMin ? '    <div class="note-box" style="margin-top:4px">⚠️ 최소 이용 시간: '+calc.minHours+'시간</div>\n' : '') +
'  </div>\n' +
'  <div class="sig-area"><div class="sig-box"><div class="sig-line"></div><div>신청자 (서명)</div></div>' +
'<div class="sig-box"><div class="sig-line"></div><div>담당자 확인</div></div></div>\n' +
'  <div class="footer-line">본 견적서는 담당자 최종 확인 후 확정되며, 최종 요금은 변경될 수 있습니다. | ASEA 항공학원</div>\n' +
'</div></body></html>';
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
    loadFees: loadFees, saveFees: saveFees,
    addFee: addFee, updateFee: updateFee, deleteFee: deleteFee,
    getFeeForRoom: getFeeForRoom,
    calcFee: calcFee, normalize: normalize,
    buildQuoteHTML: buildQuoteHTML, printQuote: printQuote,
    comma: comma, fmtDT: fmtDT
  };
})();
