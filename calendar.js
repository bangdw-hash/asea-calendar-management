'use strict';

/**
 * calendar.js — Google Calendar API v3 래퍼
 * 노출: window.CalendarModule
 * 의존성: auth.js (Auth.getToken), config.js (CONFIG.calendarId)
 */
(function () {
  var BASE = 'https://www.googleapis.com/calendar/v3';

  /* ── 내부 헬퍼 ──────────────────────────────────────────────── */

  function requireToken() {
    var token = Auth.getToken();
    if (!token) throw new Error('인증이 필요합니다');
    return token;
  }

  async function apiFetch(method, path, body) {
    var token = requireToken();

    async function _send(tok) {
      var options = {
        method: method,
        headers: {
          'Authorization': 'Bearer ' + tok,
          'Content-Type': 'application/json',
        },
      };
      if (body !== undefined) options.body = JSON.stringify(body);
      return fetch(BASE + path, options);
    }

    var res = await _send(token);

    // 401(토큰 만료/무효) → 무음 재인증 후 1회 재시도
    if (res.status === 401 && window.Auth && Auth.reauth) {
      var fresh = await Auth.reauth();
      if (fresh) res = await _send(fresh);
    }

    // DELETE 성공은 204 No Content
    if (res.status === 204) return null;

    var data = await res.json();
    if (!res.ok) {
      var msg = (data.error && data.error.message) || ('Calendar API 오류: ' + res.status);
      throw new Error(msg);
    }
    return data;
  }

  function calId(id) {
    return encodeURIComponent(id || CONFIG.calendarId);
  }

  function evtTime(ev) {
    return {
      start: new Date(ev.start.dateTime || ev.start.date).getTime(),
      end:   new Date(ev.end.dateTime   || ev.end.date).getTime(),
    };
  }

  /* ── 제목 유사도(중복 판정용) ──────────────────────────────────
     공백 정규화 후 2-그램 Dice 계수로 유사도(0~1) 계산.
     "같은 시간대 + 비슷한 문구"일 때만 중복으로 보기 위함. */
  var DUP_SIM_TH = 0.6;   // 유사도 임계값(이상이면 비슷한 제목으로 간주)
  function _normTitle(s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); }
  function titleSimilarity(a, b) {
    a = _normTitle(a); b = _normTitle(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.length < 4 || b.length < 4) return a === b ? 1 : 0;   // 너무 짧은 제목은 완전일치만
    var ba = {}, i;
    for (i = 0; i < a.length - 1; i++) { var g = a.substr(i, 2); ba[g] = (ba[g] || 0) + 1; }
    var match = 0, total = 0, g2;
    for (i = 0; i < b.length - 1; i++) {
      g2 = b.substr(i, 2); total++;
      if (ba[g2] > 0) { ba[g2]--; match++; }
    }
    total += (a.length - 1);
    return total ? (2 * match) / total : 0;
  }

  /* ── 공개 인터페이스 ─────────────────────────────────────────── */

  window.CalendarModule = {

    /**
     * 이벤트 목록 조회
     * @param {string} calendarId
     * @param {string} timeMin  — ISO 8601
     * @param {string} timeMax  — ISO 8601
     * @returns {Promise<Event[]>}
     */
    listEvents: async function (calendarId, timeMin, timeMax) {
      var params = new URLSearchParams({
        timeMin:       timeMin,
        timeMax:       timeMax,
        singleEvents:  'true',
        orderBy:       'startTime',
        maxResults:    '250',
      });
      var data = await apiFetch('GET', '/calendars/' + calId(calendarId) + '/events?' + params);
      return (data && data.items) ? data.items : [];
    },

    /**
     * 이벤트 생성
     * @param {string} calendarId
     * @param {{summary, start, end, description?, colorId?}} eventData
     * @returns {Promise<Event>}
     */
    createEvent: async function (calendarId, eventData) {
      return apiFetch('POST', '/calendars/' + calId(calendarId) + '/events', eventData);
    },

    /**
     * 이벤트 수정 (전체 교체)
     * @param {string} calendarId
     * @param {string} eventId
     * @param {object} eventData
     * @returns {Promise<Event>}
     */
    updateEvent: async function (calendarId, eventId, eventData) {
      var path = '/calendars/' + calId(calendarId) + '/events/' + encodeURIComponent(eventId);
      return apiFetch('PUT', path, eventData);
    },

    /**
     * 이벤트 부분 수정 (PATCH — 반복 인스턴스 단일 이동에 사용)
     * 지정한 필드만 업데이트하며, 나머지 필드는 그대로 유지됩니다.
     * @param {string} calendarId
     * @param {string} eventId
     * @param {object} partialData  — 변경할 필드만
     * @returns {Promise<Event>}
     */
    patchEvent: async function (calendarId, eventId, partialData) {
      var path = '/calendars/' + calId(calendarId) + '/events/' + encodeURIComponent(eventId);
      return apiFetch('PATCH', path, partialData);
    },

    /**
     * 이벤트 삭제
     * @param {string} calendarId
     * @param {string} eventId
     * @returns {Promise<boolean>}
     */
    deleteEvent: async function (calendarId, eventId) {
      var path = '/calendars/' + calId(calendarId) + '/events/' + encodeURIComponent(eventId);
      try {
        await apiFetch('DELETE', path);
        return true;
      } catch (e) {
        return false;
      }
    },

    /**
     * 중복 감지 — 동일 제목 OR 시간 겹침
     * @param {string} calendarId
     * @param {string} summary
     * @param {string} startTime — ISO 8601
     * @param {string} endTime   — ISO 8601
     * @returns {Promise<{isDuplicate: boolean, conflictingEvents: object[]}>}
     */
    checkDuplicate: async function (calendarId, summary, startTime, endTime) {
      var start = new Date(startTime).getTime();
      var end   = new Date(endTime).getTime();

      // ±1일 범위로 조회하여 같은 날 전후 이벤트도 포함
      var qMin = new Date(start - 86400000).toISOString();
      var qMax = new Date(end   + 86400000).toISOString();

      var events = await CalendarModule.listEvents(calendarId, qMin, qMax);

      /* 중복 판정: '시간대가 겹치고' + '제목이 충분히 비슷할' 때만.
         (예전엔 시간만 겹쳐도 중복으로 떠서, 무관한 동시간대 일정까지 잡혔음) */
      var conflicts = events.filter(function (ev) {
        var t       = evtTime(ev);
        var overlap = start < t.end && end > t.start;
        if (!overlap) return false;
        return titleSimilarity(ev.summary, summary) >= DUP_SIM_TH;
      });

      return {
        isDuplicate: conflicts.length > 0,
        conflictingEvents: conflicts.map(function (ev) {
          return { id: ev.id, summary: ev.summary, start: ev.start, end: ev.end };
        }),
      };
    },

    /** 제목 유사도(0~1) — 중복 판정 임계값(0.6)도 함께 노출 */
    titleSimilarity: titleSimilarity,
    DUP_SIM_TH: DUP_SIM_TH,

    /**
     * 캘린더 목록 조회
     * @returns {Promise<{id: string, summary: string, primary: boolean, colorId: string, backgroundColor: string}[]>}
     */
    listCalendars: async function () {
      var data = await apiFetch('GET', '/users/me/calendarList');
      if (!data || !data.items) return [];
      return data.items.map(function (c) {
        return {
          id:              c.id,
          summary:         c.summary,
          primary:         !!c.primary,
          colorId:         c.colorId || '',
          backgroundColor: c.backgroundColor || '',
        };
      });
    },

    /**
     * 캘린더 색상 변경 (Google 서버에 반영)
     * @param {string} calendarId
     * @param {string} colorId  — Google colorId (1~11)
     * @returns {Promise<void>}
     */
    /**
     * 캘린더 색상 변경 (hex 직접 전송 — Google 서버에 정확히 반영)
     * @param {string} calendarId
     * @param {string} hex  — '#RRGGBB'
     */
    patchCalendarColor: async function (calendarId, hex) {
      // 밝기 기준으로 전경색 결정
      var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      var fg = (r*299 + g*587 + b*114) / 1000 > 128 ? '#000000' : '#ffffff';
      var path = '/users/me/calendarList/' + encodeURIComponent(calendarId) + '?colorRgbFormat=true';
      await apiFetch('PATCH', path, { backgroundColor: hex, foregroundColor: fg });
    },
  };
})();
