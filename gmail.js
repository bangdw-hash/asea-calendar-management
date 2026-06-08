'use strict';

/**
 * gmail.js — Gmail API v1 래퍼
 * 노출: window.GmailModule
 * 의존성: auth.js (Auth.getToken), config.js (CONFIG.senderEmail)
 */
(function () {
  var GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1';
  var WEEK_RE    = /(\d{4})-(\d+)주차/;

  /* ── 인코딩 헬퍼 ────────────────────────────────────────────── */

  /**
   * 문자열을 UTF-8 바이트로 변환 후 Base64 인코딩.
   * TextEncoder 사용으로 한글 등 비ASCII 문자를 안전하게 처리.
   */
  function utf8ToBase64(str) {
    var bytes  = new TextEncoder().encode(str);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /** Base64url 인코딩 (Gmail API raw 필드에 사용) */
  function utf8ToBase64Url(str) {
    return utf8ToBase64(str)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /** Base64 문자열을 76자 단위로 줄바꿈 (MIME Content-Transfer-Encoding 규격) */
  function wrapBase64(b64) {
    var lines = [];
    for (var i = 0; i < b64.length; i += 76) {
      lines.push(b64.slice(i, i + 76));
    }
    return lines.join('\r\n');
  }

  /**
   * 비ASCII 문자를 포함하는 헤더 값에 MIME Encoded-Word 적용.
   * RFC 2047: =?UTF-8?B?<base64>?=
   */
  function mimeEncode(str) {
    if (/[^\x00-\x7F]/.test(str)) {
      return '=?UTF-8?B?' + utf8ToBase64(str) + '?=';
    }
    return str;
  }

  /* ── RFC 2822 메시지 생성 ────────────────────────────────────── */

  function buildRaw(params) {
    // 본문 + Drive 링크
    var fullBody = (params.body || '') +
      (params.driveLink ? '\n\n---\n📎 보고서 링크: ' + params.driveLink : '');

    // To 헤더: 비ASCII 이름은 Encoded-Word 처리
    var toHeader = params.to.map(function (r) {
      var safeName = r.name.replace(/"/g, "'");
      if (/[^\x00-\x7F]/.test(safeName)) {
        return mimeEncode(safeName) + ' <' + r.email + '>';
      }
      return '"' + safeName + '" <' + r.email + '>';
    }).join(', ');

    // 본문을 Base64 인코딩 후 76자 줄바꿈
    var bodyBase64 = wrapBase64(utf8ToBase64(fullBody));

    var fromHeader = params.fromDisplay
      ? mimeEncode(params.fromDisplay) + ' <' + CONFIG.senderEmail + '>'
      : CONFIG.senderEmail;

    var lines = [
      'From: '    + fromHeader,
      'To: '      + toHeader,
      'Subject: ' + mimeEncode(params.subject),
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      bodyBase64,
    ];

    // 전체 메시지를 Base64url 인코딩 (Gmail API raw 필드 규격)
    return utf8ToBase64Url(lines.join('\r\n'));
  }

  /* ── HTML 이메일 RFC 2822 메시지 생성 ───────────────────────── */
  function buildHtmlRaw(params) {
    // params: { to:[{name,email}], subject, htmlBody, fromDisplay, replyTo }
    var toHeader = params.to.map(function (r) {
      var safeName = r.name.replace(/"/g, "'");
      return (/[^\x00-\x7F]/.test(safeName) ? mimeEncode(safeName) : '"' + safeName + '"') + ' <' + r.email + '>';
    }).join(', ');

    var fromHeader = params.fromDisplay
      ? mimeEncode(params.fromDisplay) + ' <' + CONFIG.senderEmail + '>'
      : CONFIG.senderEmail;

    var htmlBase64 = wrapBase64(utf8ToBase64(params.htmlBody || ''));

    var lines = [
      'From: '    + fromHeader,
      'To: '      + toHeader,
      'Subject: ' + mimeEncode(params.subject),
    ];
    if (params.replyTo) lines.push('Reply-To: ' + params.replyTo);
    lines = lines.concat([
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      htmlBase64,
    ]);

    return utf8ToBase64Url(lines.join('\r\n'));
  }

  /* ── 파일명 파싱 ─────────────────────────────────────────────── */

  function parseWeekInfo(fileName) {
    var m = WEEK_RE.exec(fileName || '');
    return {
      year:       m ? parseInt(m[1], 10) : 0,
      weekNumber: m ? parseInt(m[2], 10) : 0,
    };
  }

  /* ── 공개 인터페이스 ─────────────────────────────────────────── */

  window.GmailModule = {

    /**
     * 이메일 발송
     * @param {{to: {name,email}[], subject: string, body: string, driveLink: string}} params
     * @returns {Promise<{success: boolean, messageId: string}>}
     */
    sendEmail: async function (params) {
      if (!params.to || params.to.length === 0) {
        throw new Error('수신자가 없습니다');
      }

      var token = Auth.getToken();
      if (!token) throw new Error('인증이 필요합니다');

      var raw = buildRaw(params);

      var res = await fetch(GMAIL_BASE + '/users/me/messages/send', {
        method:  'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ raw: raw }),
      });

      var data = await res.json();
      if (!res.ok) {
        var msg = (data.error && data.error.message) || ('Gmail API 오류: ' + res.status);
        throw new Error(msg);
      }

      return { success: true, messageId: data.id || '' };
    },

    /**
     * HTML 이메일 발송 (업무 알림 전용)
     * @param {{to: {name,email}[], subject: string, htmlBody: string, fromDisplay: string, replyTo: string}} params
     */
    sendHtmlEmail: async function (params) {
      if (!params.to || params.to.length === 0) throw new Error('수신자가 없습니다');
      var token = Auth.getToken();
      if (!token) throw new Error('인증이 필요합니다');

      var raw = buildHtmlRaw(params);
      var res = await fetch(GMAIL_BASE + '/users/me/messages/send', {
        method:  'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: raw }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error((data.error && data.error.message) || ('Gmail API 오류: ' + res.status));
      return { success: true, messageId: data.id || '' };
    },

    /**
     * 파일명 기반 이메일 초안 생성 (동기)
     * @param {string} fileName — 예: "주간업무보고서 2026-25주차.pdf"
     * @returns {{subject: string, body: string, weekNumber: number, year: number}}
     */
    generateDraft: function (fileName) {
      var info = parseWeekInfo(fileName);
      var year = info.year;
      var week = info.weekNumber;

      var subject = (year && week)
        ? '[주간업무보고] ' + year + '년 ' + week + '주차 업무보고서'
        : '[주간업무보고] 업무보고서';

      var body = (year && week)
        ? '안녕하세요.\n\n' +
          year + '년 ' + week + '주차 주간업무보고서를 공유드립니다.\n' +
          '보고서 내용 확인 부탁드립니다.\n\n' +
          '감사합니다.'
        : '안녕하세요.\n\n주간업무보고서를 공유드립니다.\n보고서 내용 확인 부탁드립니다.\n\n감사합니다.';

      return { subject: subject, body: body, weekNumber: week, year: year };
    },
  };
})();
