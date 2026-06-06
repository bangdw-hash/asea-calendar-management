'use strict';

const CONFIG = {
  // ── Google API ────────────────────────────────────────────────
  googleClientId: '89094526186-ngj72p8cbqrvai06e2uhdiq0n5brrc2b.apps.googleusercontent.com',

  // Google Drive 보고서 폴더 ID
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

  // ── Anthropic API (localStorage에만 저장, 코드에 포함 안 함) ─
  anthropicApiKey: '',

  // ── Make.com 웹훅 URL (이메일 예약 서버 발송) ─────────────
  makeWebhookUrl: '',

  // ── 수신자 목록 ──────────────────────────────────────────────
  recipients: [
    { name: '수신자1', email: 'recipient1@example.com' },
    { name: '수신자2', email: 'recipient2@example.com' },
  ],

  // ── 부서 목록 (이름 + 색상) ──────────────────────────────────
  departments: [
    { name: '임원',            color: '#1A237E' },
    { name: '기획처',          color: '#4285F4' },
    { name: '행정관리처',      color: '#0288D1' },
    { name: '교육지원처',      color: '#00897B' },
    { name: '입학처',          color: '#558B2F' },
    { name: '항공정비계열',    color: '#F57F17' },
    { name: '스마트안전진단계열', color: '#E65100' },
    { name: '항공관광계열',    color: '#AD1457' },
    { name: '항공보안계열',    color: '#6A1B9A' },
    { name: '국방경찰계열',    color: '#283593' },
    { name: '기종교육원',      color: '#00695C' },
    { name: '무인항공교육원',  color: '#2E7D32' },
    { name: '비행교육원',      color: '#37474F' },
    { name: '온라인평생교육원', color: '#5D4037' },
    { name: '기타',            color: '#EA4335' },
  ],

  // departmentColors / departmentColorIds는 departments 배열에서 동적으로 생성
  get departmentColors() {
    var map = {};
    this.departments.forEach(function (d) { map[d.name] = d.color; });
    return map;
  },

  get departmentColorIds() {
    // Google Calendar API colorId 매핑 (11가지 고정)
    var palette = ['1','2','3','4','5','6','7','8','9','10','11'];
    var map = {};
    this.departments.forEach(function (d, i) {
      map[d.name] = palette[i % palette.length];
    });
    return map;
  },

  // ── 선택된 캘린더 목록 [{id, name, color, enabled}] ──────────
  selectedCalendars: [],

  // ── 공유 캘린더 소스 목록 ────────────────────────────────────
  sharedCalendars: [],

  // ── 이메일 발송 이력 [{id, to, subject, sentAt, scheduled, status}]
  emailHistory: [],

  // ── 예약 이메일 목록 [{id, to, subject, body, driveLink, scheduledAt, status}]
  scheduledEmails: [],

  // ── localStorage 키 ──────────────────────────────────────────
  storageKeys: {
    recipients:        'asea_recipients',
    driveFolderId:     'asea_drive_folder_id',
    departments:       'asea_departments',
    selectedCalendars: 'asea_selected_calendars',
    sharedCalendars:   'asea_shared_calendars',
    anthropicApiKey:   'asea_anthropic_api_key',
    emailHistory:      'asea_email_history',
    scheduledEmails:   'asea_scheduled_emails',
    makeWebhookUrl:    'asea_make_webhook_url',
  },
};

// localStorage에 저장된 값이 있으면 기본값 덮어쓰기
(function applyStoredSettings() {
  try {
    var s = CONFIG.storageKeys;

    var storedRecipients = localStorage.getItem(s.recipients);
    if (storedRecipients) CONFIG.recipients = JSON.parse(storedRecipients);

    var storedFolderId = localStorage.getItem(s.driveFolderId);
    if (storedFolderId) CONFIG.driveReportFolderId = storedFolderId;

    var storedDepts = localStorage.getItem(s.departments);
    if (storedDepts) CONFIG.departments = JSON.parse(storedDepts);

    var storedSelCal = localStorage.getItem(s.selectedCalendars);
    if (storedSelCal) CONFIG.selectedCalendars = JSON.parse(storedSelCal);

    var storedShared = localStorage.getItem(s.sharedCalendars);
    if (storedShared) CONFIG.sharedCalendars = JSON.parse(storedShared);

    var storedApiKey = localStorage.getItem(s.anthropicApiKey);
    if (storedApiKey) CONFIG.anthropicApiKey = storedApiKey;

    var storedWebhook = localStorage.getItem(s.makeWebhookUrl);
    if (storedWebhook) CONFIG.makeWebhookUrl = storedWebhook;

    var storedHistory = localStorage.getItem(s.emailHistory);
    if (storedHistory) CONFIG.emailHistory = JSON.parse(storedHistory);

    var storedScheduled = localStorage.getItem(s.scheduledEmails);
    if (storedScheduled) CONFIG.scheduledEmails = JSON.parse(storedScheduled);
  } catch (e) {}
})();
