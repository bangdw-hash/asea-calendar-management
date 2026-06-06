'use strict';

const CONFIG = {
  // ── Google API ────────────────────────────────────────────────
  // Google Cloud Console에서 발급 후 교체 필수
  // https://console.cloud.google.com/apis/credentials
  googleClientId: '89094526186-ngj72p8cbqrvai06e2uhdiq0n5brrc2b.apps.googleusercontent.com',

  // Google Drive 보고서 폴더 ID (Drive URL에서 복사)
  driveReportFolderId: '1CF1nlAWL2GZwLJ5jgHOxS4QKz5u1cBP0',

  // ── 앱 설정 ──────────────────────────────────────────────────
  senderEmail: 'bangdw@gmail.com',
  calendarId: 'primary',
  baseUrl: 'https://bangdw-hash.github.io/asea-calendar-management/',

  // ── OAuth 스코프 ─────────────────────────────────────────────
  googleScopes: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'email',
    'profile',
  ],

  // ── 수신자 목록 ──────────────────────────────────────────────
  // 설정 탭에서 런타임에 추가/삭제 가능 (localStorage 저장)
  recipients: [
    { name: '수신자1', email: 'recipient1@example.com' },
    { name: '수신자2', email: 'recipient2@example.com' },
  ],

  // ── 부서 색상 ────────────────────────────────────────────────
  departmentColors: {
    '기획처': '#4285F4',
    '교학처': '#34A853',
    '행정처': '#FBBC05',
    '기타':   '#EA4335',
  },

  // Google Calendar 색상 ID 매핑 (API colorId 파라미터)
  departmentColorIds: {
    '기획처': '9',   // Blueberry
    '교학처': '10',  // Sage
    '행정처': '5',   // Banana
    '기타':   '11',  // Tomato
  },

  // ── localStorage 키 ──────────────────────────────────────────
  storageKeys: {
    recipients:      'asea_recipients',
    driveFolderId:   'asea_drive_folder_id',
    departmentColors: 'asea_dept_colors',
  },
};

// localStorage에 저장된 수신자/폴더 ID가 있으면 기본값 덮어쓰기
(function applyStoredSettings() {
  try {
    const storedRecipients = localStorage.getItem(CONFIG.storageKeys.recipients);
    if (storedRecipients) {
      CONFIG.recipients = JSON.parse(storedRecipients);
    }
    const storedFolderId = localStorage.getItem(CONFIG.storageKeys.driveFolderId);
    if (storedFolderId) {
      CONFIG.driveReportFolderId = storedFolderId;
    }
    const storedColors = localStorage.getItem(CONFIG.storageKeys.departmentColors);
    if (storedColors) {
      CONFIG.departmentColors = JSON.parse(storedColors);
    }
  } catch (e) {
    // localStorage 접근 실패 시 기본값 유지
  }
})();
