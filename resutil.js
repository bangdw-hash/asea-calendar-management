'use strict';

/**
 * resutil.js — 예약 공통 유틸리티
 * · CSV 다운로드 / 파싱
 * · Google Calendar 공유 (예약 → 이벤트)
 * · 사용자 캘린더 목록 조회
 */
var ReservationUtil = (function () {

  /* ──────────────────────────────────────────────────
     CSV 유틸
  ────────────────────────────────────────────────── */
  function downloadCSV(filename, headerRow, dataRows) {
    var bom = '﻿'; // UTF-8 BOM (Excel 한글 지원)
    var lines = [headerRow].concat(dataRows).join('\r\n');
    var blob = new Blob([bom + lines], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function parseCSVLine(line) {
    var result = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    result.push(cur.trim());
    return result;
  }

  function parseCSV(text) {
    var lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n')
      .map(function(l){ return l.replace(/^﻿/,''); })
      .filter(function(l){ return l.trim(); });
    if (lines.length < 2) return [];
    var headers = parseCSVLine(lines[0]);
    return lines.slice(1).map(function(line) {
      var cols = parseCSVLine(line);
      var obj = {};
      headers.forEach(function(h, i){ obj[h] = (cols[i]||'').trim(); });
      return obj;
    });
  }

  /* ──────────────────────────────────────────────────
     시설(건물/강의실) CSV 양식
  ────────────────────────────────────────────────── */
  function downloadFacilityTemplate() {
    var header = '건물명,건물코드,호실명,호실코드,수용인원,색상(HEX)';
    var sample = [
      '본관,MAIN,101호,R101,30,#4285F4',
      '본관,MAIN,102호,R102,25,#4285F4',
      '본관,MAIN,103호,R103,20,#4285F4',
      '강의동,EDU,강의실201,E201,60,#0F9D58',
      '강의동,EDU,강의실202,E202,40,#0F9D58',
      '체육관,GYM,대강당,G001,300,#F4B400',
    ].join('\r\n');
    downloadCSV('ASEA_시설_등록양식.csv', header, [sample]);
  }

  function parseFacilityCSV(text) {
    var rows = parseCSV(text);
    // 건물명 기준으로 그룹핑
    var buildings = {};
    rows.forEach(function(r) {
      var bName = r['건물명'] || r['buildingName'] || '';
      var bCode = r['건물코드'] || r['buildingCode'] || '';
      var rName = r['호실명'] || r['roomName'] || '';
      var rCode = r['호실코드'] || r['roomId'] || '';
      var cap   = r['수용인원'] || r['capacity'] || '';
      var color = r['색상(HEX)'] || r['color'] || '#4285F4';
      if (!bName) return;
      if (!buildings[bName]) buildings[bName] = { buildingName: bName, buildingCode: bCode, color: color, rooms: [] };
      if (rName) {
        buildings[bName].rooms.push({ id: rCode || 'R'+String(buildings[bName].rooms.length+1).padStart(3,'0'), name: rName, capacity: cap });
      }
    });
    return Object.values(buildings);
  }

  /* ──────────────────────────────────────────────────
     차량 CSV 양식
  ────────────────────────────────────────────────── */
  function downloadVehicleTemplate() {
    var header = '차량명,차량번호,유형(승용/승합/버스/화물/기타),탑승정원,비고';
    var sample = [
      '쏘렌토,12가3456,승용,7,',
      '스타렉스,34나5678,승합,11,행사용',
      '45인승버스,56다7890,버스,45,전세버스',
      '포터,78라9012,화물,2,짐차',
    ].join('\r\n');
    downloadCSV('ASEA_차량_등록양식.csv', header, [sample]);
  }

  function parseVehicleCSV(text) {
    var rows = parseCSV(text);
    return rows.map(function(r) {
      return {
        vehicleName: r['차량명'] || r['vehicleName'] || '',
        vehicleNum:  r['차량번호'] || r['vehicleNum'] || '',
        vehicleType: r['유형(승용/승합/버스/화물/기타)'] || r['vehicleType'] || '승용',
        capacity:    r['탑승정원'] || r['capacity'] || '4',
        note:        r['비고'] || r['note'] || '',
      };
    }).filter(function(r){ return r.vehicleName; });
  }

  /* ──────────────────────────────────────────────────
     강의실 예약 CSV 양식
  ────────────────────────────────────────────────── */
  function downloadClassroomTemplate() {
    var header = '건물명,호실명,제목,시작일(YYYY-MM-DD),종료일(YYYY-MM-DD),시작교시(1-11),종료교시(1-11),요일(월화수목금토,쉼표없이),예약유형(학점은행제/특강/대관/기타),학기,담당부서,담당자';
    var sample = [
      '강의동,강의실201,항공정비학과 1학년,2026-03-02,2026-06-27,1,3,월수금,학점은행제,2026-1학기,항공정비계열,홍길동',
      '강의동,강의실201,항공보안 특강,2026-04-10,2026-04-10,4,5,목,특강,2026-1학기,항공보안계열,김철수',
      '본관,101호,기업설명회 대관,2026-05-15,2026-05-15,2,7,금,대관,2026-1학기,기획처,이영희',
    ].join('\r\n');
    downloadCSV('ASEA_강의실예약_일괄등록양식.csv', header, [sample]);
  }

  function parseClassroomCSV(text, facilities) {
    var rows = parseCSV(text);
    return rows.map(function(r) {
      var bName = r['건물명'] || '';
      var rName = r['호실명'] || '';
      var fac = (facilities||[]).find(function(f){ return f.buildingName === bName; });
      var room = (fac && fac.rooms) ? fac.rooms.find(function(rm){ return rm.name === rName; }) : null;
      var wdStr = r['요일(월화수목금토,쉼표없이)'] || '';
      var weekdays = [];
      var wdMap = {'월':1,'화':2,'수':3,'목':4,'금':5,'토':6,'일':0};
      for (var i = 0; i < wdStr.length; i++) {
        var w = wdMap[wdStr[i]];
        if (w !== undefined) weekdays.push(String(w));
      }
      return {
        buildingId:      fac ? fac.id : '',
        buildingName:    bName,
        roomId:          room ? room.id : rName,
        roomName:        rName,
        title:           r['제목'] || '',
        fromName:        r['담당자'] || '',
        department:      r['담당부서'] || '',
        startDate:       r['시작일(YYYY-MM-DD)'] || '',
        endDate:         r['종료일(YYYY-MM-DD)'] || '',
        startPeriod:     r['시작교시(1-11)'] || '1',
        endPeriod:       r['종료교시(1-11)'] || '1',
        weekdays:        weekdays,
        reservationType: r['예약유형(학점은행제/특강/대관/기타)'] || '기타',
        semester:        r['학기'] || '',
        status:          '확정',
      };
    }).filter(function(r){ return r.buildingName && r.title && r.startDate; });
  }

  /* ──────────────────────────────────────────────────
     사용자 캘린더 목록 조회
  ────────────────────────────────────────────────── */
  async function getUserCalendars() {
    var token = Auth.getToken();
    if (!token) return [];
    try {
      var res = await fetch(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50',
        { headers: { 'Authorization': 'Bearer ' + token } }
      );
      var data = await res.json();
      return (data.items || []).filter(function(c){
        return c.accessRole === 'owner' || c.accessRole === 'writer';
      }).map(function(c){
        return { id: c.id, name: c.summary, color: c.backgroundColor || '#4285F4' };
      });
    } catch(e) { return []; }
  }

  /* ──────────────────────────────────────────────────
     예약 → Google Calendar 이벤트 생성
  ────────────────────────────────────────────────── */
  var PERIOD_TIMES = {
    '1':'09:00','2':'10:00','3':'11:00','4':'12:00','5':'13:00',
    '6':'14:00','7':'15:00','8':'16:00','9':'17:00','10':'18:00','11':'19:00'
  };
  var PERIOD_END = {
    '1':'09:50','2':'10:50','3':'11:50','4':'12:50','5':'13:50',
    '6':'14:50','7':'15:50','8':'16:50','9':'17:50','10':'18:50','11':'19:50'
  };

  async function createGCalEvent(calendarId, event) {
    var token = Auth.getToken();
    var res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events',
      {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }
    );
    if (!res.ok) { var e = await res.json(); throw new Error((e.error&&e.error.message)||'캘린더 이벤트 생성 실패'); }
    return res.json();
  }

  async function shareFacilityResvToCalendar(resvs, calendarId) {
    var results = { success: 0, fail: 0 };
    for (var i = 0; i < resvs.length; i++) {
      var r = resvs[i];
      if (!r.startAt || !r.endAt) { results.fail++; continue; }
      try {
        var ev = {
          summary: '[대관] ' + r.buildingName + ' ' + r.roomName + ' - ' + r.title,
          location: r.buildingName + ' ' + r.roomName,
          description: [
            '예약자: ' + r.fromName + ' (' + r.department + ')',
            '목적: ' + r.purpose,
            '참석인원: ' + r.attendees,
            '상태: ' + r.status,
          ].join('\n'),
          start: { dateTime: new Date(r.startAt).toISOString() },
          end:   { dateTime: new Date(r.endAt).toISOString() },
          colorId: '2',
        };
        await createGCalEvent(calendarId, ev);
        results.success++;
      } catch(e) { results.fail++; }
    }
    return results;
  }

  async function shareVehicleResvToCalendar(resvs, calendarId) {
    var results = { success: 0, fail: 0 };
    for (var i = 0; i < resvs.length; i++) {
      var r = resvs[i];
      if (!r.startAt || !r.endAt) { results.fail++; continue; }
      try {
        var ev = {
          summary: '[차량] ' + r.vehicleName + ' - ' + r.destination,
          description: [
            '예약자: ' + r.fromName + ' (' + r.department + ')',
            '행선지: ' + r.destination,
            '목적: ' + r.purpose,
            '탑승인원: ' + r.passengers,
            '상태: ' + r.status,
          ].join('\n'),
          start: { dateTime: new Date(r.startAt).toISOString() },
          end:   { dateTime: new Date(r.endAt).toISOString() },
          colorId: '9',
        };
        await createGCalEvent(calendarId, ev);
        results.success++;
      } catch(e) { results.fail++; }
    }
    return results;
  }

  async function shareClassroomResvToCalendar(resvs, calendarId) {
    // 강의실 예약은 날짜 범위 + 요일 패턴 → 개별 날짜로 펼쳐서 이벤트 생성
    var results = { success: 0, fail: 0 };
    for (var i = 0; i < resvs.length; i++) {
      var r = resvs[i];
      var startT = PERIOD_TIMES[r.startPeriod] || '09:00';
      var endT   = PERIOD_END[r.endPeriod] || '09:50';
      var startD  = new Date(r.startDate);
      var endD    = new Date(r.endDate || r.startDate);
      var wds = (r.weekdays||'').split(',').map(Number);
      var typeColors = { '학점은행제':'9','특강':'6','대관':'2','기타':'8' };

      // 날짜 범위 내 해당 요일 날짜 추출 (최대 180일)
      var dates = [];
      var cur = new Date(startD);
      var limit = 180;
      while (cur <= endD && limit-- > 0) {
        if (wds.length === 0 || wds.indexOf(cur.getDay()) !== -1) {
          dates.push(new Date(cur));
        }
        cur.setDate(cur.getDate() + 1);
      }

      for (var j = 0; j < dates.length; j++) {
        var d = dates[j];
        var pad = function(n){ return String(n).padStart(2,'0'); };
        var ds = d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
        try {
          var ev = {
            summary: '[' + r.reservationType + '] ' + r.buildingName + ' ' + r.roomName + ' - ' + r.title,
            location: r.buildingName + ' ' + r.roomName,
            description: [
              '유형: ' + r.reservationType,
              '담당: ' + r.fromName + ' (' + r.department + ')',
              '교시: ' + r.startPeriod + '~' + r.endPeriod + '교시',
              '학기: ' + (r.semester||''),
            ].join('\n'),
            start: { dateTime: ds + 'T' + startT + ':00', timeZone: 'Asia/Seoul' },
            end:   { dateTime: ds + 'T' + endT   + ':00', timeZone: 'Asia/Seoul' },
            colorId: typeColors[r.reservationType] || '8',
          };
          await createGCalEvent(calendarId, ev);
          results.success++;
        } catch(e) { results.fail++; }
      }
    }
    return results;
  }

  /* ──────────────────────────────────────────────────
     캘린더 선택 다이얼로그 (공통 UI)
  ────────────────────────────────────────────────── */
  async function showCalendarPicker(onSelect) {
    var existing = document.getElementById('resutil-cal-picker');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'resutil-cal-picker';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)';
    modal.innerHTML =
      '<div style="background:#fff;border-radius:12px;padding:24px;min-width:300px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.25)">' +
        '<div style="font-size:16px;font-weight:700;margin-bottom:4px">📅 공유할 캘린더 선택</div>' +
        '<p style="font-size:13px;color:#666;margin-bottom:16px">예약을 등록할 Google 캘린더를 선택하세요.</p>' +
        '<div id="resutil-cal-list" style="max-height:220px;overflow-y:auto;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:16px">' +
          '<p style="padding:12px;color:#888;font-size:13px">불러오는 중...</p>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          '<button id="resutil-cal-cancel" style="padding:8px 20px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:14px">취소</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

    modal.querySelector('#resutil-cal-cancel').onclick = function(){ modal.remove(); };
    modal.onclick = function(e){ if (e.target === modal) modal.remove(); };

    // 캘린더 목록 로드
    try {
      var cals = await getUserCalendars();
      var listEl = modal.querySelector('#resutil-cal-list');
      if (cals.length === 0) {
        listEl.innerHTML = '<p style="padding:12px;color:#888;font-size:13px">캘린더를 불러올 수 없습니다.</p>';
        return;
      }
      listEl.innerHTML = '';
      cals.forEach(function(cal) {
        var item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid #f0f0f0;transition:background .1s';
        item.onmouseover = function(){ this.style.background='#f5f5f5'; };
        item.onmouseout  = function(){ this.style.background=''; };
        item.innerHTML =
          '<span style="width:12px;height:12px;border-radius:50%;background:'+cal.color+';flex-shrink:0"></span>' +
          '<span style="font-size:14px;flex:1">'+cal.name+'</span>';
        item.onclick = function() { modal.remove(); onSelect(cal); };
        listEl.appendChild(item);
      });
    } catch(e) {
      modal.querySelector('#resutil-cal-list').innerHTML = '<p style="padding:12px;color:#e53935;font-size:13px">오류: '+e.message+'</p>';
    }
  }

  /* 공개 API */
  return {
    downloadFacilityTemplate:     downloadFacilityTemplate,
    parseFacilityCSV:             parseFacilityCSV,
    downloadVehicleTemplate:      downloadVehicleTemplate,
    parseVehicleCSV:              parseVehicleCSV,
    downloadClassroomTemplate:    downloadClassroomTemplate,
    parseClassroomCSV:            parseClassroomCSV,
    getUserCalendars:             getUserCalendars,
    shareFacilityResvToCalendar:  shareFacilityResvToCalendar,
    shareVehicleResvToCalendar:   shareVehicleResvToCalendar,
    shareClassroomResvToCalendar: shareClassroomResvToCalendar,
    showCalendarPicker:           showCalendarPicker,
    PERIOD_TIMES:                 PERIOD_TIMES,
    PERIOD_END:                   PERIOD_END,
  };

})();
