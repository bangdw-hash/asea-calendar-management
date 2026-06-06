'use strict';

/**
 * report.js — 주간보고 허브 유틸리티
 * 노출: window.ReportModule
 * 의존성: 없음 (drive.js ReportFile 구조를 인자로 받음)
 *
 * 주의: 서버 없이 PDF 파싱 불가 → calendarCandidates는 항상 빈 배열 반환.
 */
(function () {
  var WEEK_RE = /(\d{4})-(\d+)주차/;

  /* ── 내부 헬퍼 ──────────────────────────────────────────────── */

  function parseWeekInfo(fileName) {
    var m = WEEK_RE.exec(fileName || '');
    return {
      year:       m ? parseInt(m[1], 10) : 0,
      weekNumber: m ? parseInt(m[2], 10) : 0,
    };
  }

  /* ── 공개 인터페이스 ─────────────────────────────────────────── */

  window.ReportModule = {

    /**
     * 카카오톡 발송용 문구 생성 (동기)
     * @param {string} fileName  — 예: "주간업무보고서 2026-25주차.pdf"
     * @param {string} driveLink — Drive 파일 공유 링크
     * @returns {string}
     */
    generateKakaoText: function (fileName, driveLink) {
      var info = parseWeekInfo(fileName);
      var year = info.year;
      var week = info.weekNumber;

      var header = (year && week)
        ? '[주간업무보고] ' + year + '년 ' + week + '주차'
        : '[주간업무보고]';

      return (
        header + '\n\n' +
        '안녕하세요. 이번 주 업무보고서를 공유드립니다.\n\n' +
        '📎 보고서: ' + (driveLink || '') + '\n\n' +
        '확인 부탁드립니다. 감사합니다.'
      );
    },

    /**
     * 클립보드 복사 (비동기)
     * @param {string} text
     * @returns {Promise<boolean>} — 성공: true, 실패: false (throw 금지)
     */
    copyToClipboard: async function (text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }

        // Fallback: execCommand (구형 브라우저)
        var el = document.createElement('textarea');
        el.value = text;
        el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        document.body.appendChild(el);
        el.focus();
        el.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(el);
        return ok;
      } catch (e) {
        return false;
      }
    },

    /**
     * 주간보고 허브 요약 데이터 구조 생성 (동기)
     * @param {{id, name, createdTime, webViewLink, weekNumber, year}} fileInfo
     * @returns {{weekLabel: string, driveLink: string, calendarCandidates: []}}
     */
    buildReportSummary: function (fileInfo) {
      if (!fileInfo) {
        return { weekLabel: '업무보고서', driveLink: '', calendarCandidates: [] };
      }

      var year = fileInfo.year || 0;
      var week = fileInfo.weekNumber || 0;

      var weekLabel = (year && week)
        ? year + '년 ' + week + '주차'
        : '업무보고서';

      return {
        weekLabel:          weekLabel,
        driveLink:          fileInfo.webViewLink || '',
        calendarCandidates: [],  // PDF 파싱 불가 — 서버 없이 항상 빈 배열
      };
    },
  };
})();
