'use strict';

/**
 * drive.js — Google Drive API v3 래퍼
 * 노출: window.DriveModule
 * 의존성: auth.js (Auth.getToken), config.js (CONFIG.driveReportFolderId)
 */
(function () {
  var BASE     = 'https://www.googleapis.com/drive/v3';
  var WEEK_RE  = /(\d{4})-(\d+)주차/;

  /* ── 내부 헬퍼 ──────────────────────────────────────────────── */

  function requireToken() {
    var token = Auth.getToken();
    if (!token) throw new Error('인증이 필요합니다');
    return token;
  }

  async function apiFetch(path) {
    var res = await fetch(BASE + path, {
      headers: { 'Authorization': 'Bearer ' + requireToken() },
    });
    var data = await res.json();
    if (!res.ok) {
      var msg = (data.error && data.error.message) || ('Drive API 오류: ' + res.status);
      throw new Error(msg);
    }
    return data;
  }

  function parseWeekInfo(name) {
    var m = WEEK_RE.exec(name || '');
    return {
      year:       m ? parseInt(m[1], 10) : 0,
      weekNumber: m ? parseInt(m[2], 10) : 0,
    };
  }

  /* ── 공개 인터페이스 ─────────────────────────────────────────── */

  window.DriveModule = {

    /**
     * 보고서 PDF 파일 목록 (최신순)
     * @param {string} [folderId] — 미지정 시 CONFIG.driveReportFolderId 사용
     * @returns {Promise<ReportFile[]>}
     */
    listReportFiles: async function (folderId) {
      var fid   = folderId || CONFIG.driveReportFolderId;
      var query = "'" + fid + "' in parents and mimeType='application/pdf' and trashed=false";
      var fields = 'files(id,name,createdTime,webViewLink)';

      var params = new URLSearchParams({
        q:        query,
        fields:   fields,
        pageSize: '100',
      });

      var data = await apiFetch('/files?' + params);
      if (!data || !data.files) return [];

      var files = data.files.map(function (f) {
        var info = parseWeekInfo(f.name);
        return {
          id:          f.id,
          name:        f.name,
          createdTime: f.createdTime || '',
          webViewLink: f.webViewLink || '',
          weekNumber:  info.weekNumber,
          year:        info.year,
        };
      });

      // 클라이언트 사이드 최신순 정렬
      files.sort(function (a, b) {
        return new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime();
      });

      return files;
    },

    /**
     * 파일 공유 링크 반환
     * @param {string} fileId
     * @returns {Promise<string>}
     */
    getShareLink: async function (fileId) {
      var data = await apiFetch('/files/' + encodeURIComponent(fileId) + '?fields=id,webViewLink');
      // webViewLink가 없으면 표준 Drive URL 구성
      return data.webViewLink || ('https://drive.google.com/file/d/' + fileId + '/view');
    },
  };
})();
