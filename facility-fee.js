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

  /* ══════════════════════════════════════════════════════
     아세아 표준 대관료 기준표 (2026) — 앱 기본값
     ※ 냉난방은 여름·겨울(1·2·7·8·12월)에만 자동 부과
     ※ 부가세 면세(학교법인) — 공급가 기준
  ══════════════════════════════════════════════════════ */
  function _sur(base) {
    var r = Math.round(base * 1.5);
    return [
      { label: '조조', start: '07:00', end: '09:00', rate: r },
      { label: '야간', start: '18:00', end: '22:00', rate: r }
    ];
  }
  var _TAX = '부가세 면세(공급가 기준).';
  var _DEFAULT_FEES_RAW = [
    { buildingName:'항공기술교육관', roomName:'드림에듀아트센터(다목적홀) 60평', normalRate:60000, surchargeSlots:_sur(60000), minHours:2, deposit:100000, cleaningFee:50000, flatExtras:[{name:'행사 음향·조명 운영비', amount:100000}], notes:'수용인원·행사규모별 협의(소규모 비영리 감면 가능). '+_TAX },
    { buildingName:'항공기술교육관', roomName:'회의실 8평', normalRate:40000, surchargeSlots:_sur(40000), minHours:2, notes:'단시간 정액 관리비 폐지, 시간단가 일원화. '+_TAX },
    { buildingName:'항공기술교육관', roomName:'8인 사무실 12평', normalRate:60000, surchargeSlots:_sur(60000), minHours:2, notes:_TAX },
    { buildingName:'항공기술교육관', roomName:'강의실(3층) 20평', normalRate:40000, surchargeSlots:_sur(40000), minHours:2, notes:_TAX },
    { buildingName:'항공기술교육관', roomName:'강의실(4층) 20평', normalRate:40000, surchargeSlots:_sur(40000), minHours:2, notes:_TAX },
    { buildingName:'영등포 캠퍼스', roomName:'시뮬레이터실 A320 12평', normalRate:150000, surchargeSlots:_sur(150000), minHours:4, deposit:100000, cleaningFee:50000, flatExtras:[{name:'대관 기술·운영 인건비', amount:400000},{name:'훈련 교관비', amount:80000}], notes:'A320 풀플라이트형. 상업·촬영 목적 별도 프리미엄 협의. '+_TAX },
    { buildingName:'영등포 캠퍼스', roomName:'시뮬레이터실 B737 12평', normalRate:150000, surchargeSlots:_sur(150000), minHours:4, deposit:100000, cleaningFee:50000, flatExtras:[{name:'대관 기술·운영 인건비', amount:400000},{name:'훈련 교관비', amount:80000}], notes:'B737 풀플라이트형. 상업·촬영 목적 별도 프리미엄 협의. '+_TAX },
    { buildingName:'영등포 캠퍼스', roomName:'시뮬레이터실 C172(세스나) 8평', normalRate:80000, surchargeSlots:_sur(80000), minHours:4, deposit:100000, cleaningFee:50000, flatExtras:[{name:'대관 기술·운영 인건비', amount:200000},{name:'훈련 교관비', amount:80000}], notes:'세스나 C172. '+_TAX },
    { buildingName:'영등포 캠퍼스', roomName:'비행기내모형(목업) 15평', normalRate:150000, surchargeSlots:_sur(150000), minHours:2, deposit:100000, cleaningFee:50000, flatExtras:[{name:'관리·운영 인건비(상주)', amount:100000}], notes:'관리인원 상주. 광고·방송 촬영은 별도 프리미엄(일 단위) 협의 권장. '+_TAX },
    { buildingName:'영등포 캠퍼스', roomName:'무도연습장 25평(지하1층)', normalRate:50000, surchargeSlots:[], minHours:2, flatExtras:[{name:'안전관리 인건비(상주)', amount:100000}], notes:'안전관리자 상주 필수 · 별도협의 가능. '+_TAX },
    { buildingName:'영등포 캠퍼스', roomName:'체력단련장 20평(지하1층)', normalRate:50000, surchargeSlots:[], minHours:2, flatExtras:[{name:'안전관리 인건비(상주)', amount:100000}], notes:'안전관리자 상주 필수 · 별도협의 가능. '+_TAX },
    { buildingName:'영등포 캠퍼스', roomName:'전자사격장 15평(지하1층)', normalRate:80000, surchargeSlots:[], minHours:2, deposit:50000, flatExtras:[{name:'안전관리·사선통제 인건비(상주)', amount:100000}], notes:'안전관리관 상주 필수 · 특수시설 별도협의. '+_TAX },
    { buildingName:'영등포 캠퍼스', roomName:'식음료 실습실 20평(4층)', normalRate:80000, surchargeSlots:_sur(80000), minHours:2, deposit:50000, cleaningFee:50000, flatExtras:[{name:'관리·운영 인건비(상주)', amount:100000}], notes:'관리인원 상주 · 식자재 별도. '+_TAX },
    { buildingName:'영등포 캠퍼스', roomName:'강의실(외) 20평', normalRate:40000, surchargeSlots:_sur(40000), minHours:2, notes:_TAX },
    { buildingName:'영등포 캠퍼스', roomName:'실습실(외, 계열·전산실 등) 개별상이', normalRate:70000, surchargeSlots:_sur(70000), minHours:2, cleaningFee:30000, notes:'시설별 6~8만원 범위 내 협의. '+_TAX }
  ];
  // 공통 기본값 채우기 (평상시간/냉난방/빈 배열)
  function _defaultFees() {
    return _DEFAULT_FEES_RAW.map(function(f) {
      return Object.assign({
        normalStart:'09:00', normalEnd:'18:00',
        surchargeSlots:[], minHours:2, deposit:0, cleaningFee:0,
        timeExtras:[], flatExtras:[],
        seasonalFee:{ enabled:true, rate:10000, months:[1,2,7,8,12] },
        notes:''
      }, f);
    });
  }

  /* 표준 기준표 적용 — 동일 건물·호실은 덮어쓰고, 없으면 추가 */
  function applyDefaults() {
    var fees = loadFees();
    _defaultFees().forEach(function(d) {
      var ex = fees.find(function(f){ return f.buildingName===d.buildingName && f.roomName===d.roomName; });
      if (ex) { Object.assign(ex, d); }
      else { d.id = genId(); d.createdAt = Date.now(); fees.push(d); }
    });
    saveFees(fees);
    return _DEFAULT_FEES_RAW.length;
  }
  /* 비어있을 때만 표준 기준표 시드 (신규 사용자 기본값) */
  function seedIfEmpty() {
    try { if (loadFees().length === 0) applyDefaults(); } catch(e) {}
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

    return '' +
      '<table class="pf-table" style="width:auto;margin:0 0 5mm auto;font-size:9pt">' +
        '<tr><td class="pf-th-label">견 적 일</td><td style="min-width:34mm;text-align:center">'+todayStr+'</td></tr>' +
      '</table>' +
      '<div class="pf-sec">■ 신청 정보</div>' +
      '<table class="pf-table">' +
        '<tr><td class="pf-th-label" style="width:20%">신청자</td><td>'+(info.applicant&&info.applicant.name||'-')+'</td>' +
            '<td class="pf-th-label" style="width:20%">소속/기관</td><td>'+(info.applicant&&info.applicant.org||'-')+'</td></tr>' +
        '<tr><td class="pf-th-label">연락처</td><td>'+(info.applicant&&info.applicant.phone||'-')+'</td>' +
            '<td class="pf-th-label">이메일</td><td>'+(info.applicant&&info.applicant.email||'-')+'</td></tr>' +
        '<tr><td class="pf-th-label">행사명</td><td colspan="3">'+(info.title||'-')+'</td></tr>' +
        '<tr><td class="pf-th-label">사용 목적</td><td>'+(info.purpose||'-')+'</td>' +
            '<td class="pf-th-label">참석 인원</td><td>'+(info.attendees||'-')+'</td></tr>' +
      '</table>' +
      '<div class="pf-sec">■ 시설 및 이용 일시</div>' +
      '<table class="pf-table"><tr><td class="pf-th-label" style="width:20%">건물</td><td>'+(info.buildingName||'-')+'</td>' +
        '<td class="pf-th-label" style="width:20%">호실</td><td>'+(info.roomName||'-')+'</td></tr></table>' +
      '<table class="pf-table" style="margin-top:6px"><tr><th>이용 시작</th><th>이용 종료</th></tr>'+rangeRows+'</table>' +
      '<div class="pf-sec">■ 요금 산출 내역</div>' +
      '<table class="pf-table ff-fee"><tr><th style="width:40%">항목</th><th>시간/수량</th><th>단가</th><th>금액</th></tr>' +
        (breakdownRows||'<tr><td colspan="4" class="pf-center pf-muted">요금 정보 없음</td></tr>') +
        (calc ? '<tr class="ff-total"><td colspan="3" class="pf-center">합 계</td><td>'+comma(calc.total)+'원</td></tr>' : '') +
      '</table>' +
      (fee.notes ? '<div class="pf-note">📌 '+fee.notes+'</div>' : '') +
      (calc&&calc.underMin ? '<div class="pf-note" style="margin-top:4px">⚠️ 최소 이용 시간: '+calc.minHours+'시간</div>' : '') +
      '<div style="display:flex;justify-content:flex-end;gap:24mm;margin-top:12mm;text-align:center;font-size:9.5pt">' +
        '<div><div style="width:34mm;height:11mm;border-bottom:1px solid #aaa;margin-bottom:3px"></div>신청자 (서명)</div>' +
        '<div><div style="width:34mm;height:11mm;border-bottom:1px solid #aaa;margin-bottom:3px"></div>담당자 확인</div>' +
      '</div>';
  }

  function printQuote(info) {
    if (!window.PrintFrame) { alert('출력 모듈을 불러오지 못했습니다. 페이지를 새로고침해 주세요.'); return; }
    PrintFrame.open({
      title: '시설 대관 견적서',
      docTitle: '시 설 대 관 견 적 서',
      category: '시설 대관',
      bodyHTML: buildQuoteHTML(info),
      extraCSS: '.ff-fee td:last-child,.ff-fee th:last-child{text-align:right;}' +
                '.ff-total td{font-weight:800;color:#1a3a5c;background:#eff4fb;}',
      footerLeft: '본 견적서는 담당자 최종 확인 후 확정되며, 최종 요금은 변경될 수 있습니다.'
    });
  }

  // 신규 사용자/빈 상태 — 표준 기준표 자동 시드
  seedIfEmpty();

  return {
    loadFees: loadFees, saveFees: saveFees,
    addFee: addFee, updateFee: updateFee, deleteFee: deleteFee,
    getFeeForRoom: getFeeForRoom,
    calcFee: calcFee, normalize: normalize,
    buildQuoteHTML: buildQuoteHTML, printQuote: printQuote,
    applyDefaults: applyDefaults, seedIfEmpty: seedIfEmpty,
    DEFAULT_FEES: _DEFAULT_FEES_RAW,
    comma: comma, fmtDT: fmtDT
  };
})();
