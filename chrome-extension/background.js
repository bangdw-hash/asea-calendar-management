/**
 * background.js — ASEA 빠른 업무 등록 확장 서비스 워커
 *
 * Ctrl+Alt+R (전역) 단축키 → ASEA 탭을 찾아 빠른 업무 등록 모달 오픈
 * ASEA 탭이 없으면 새 탭으로 열고 로그인 유도
 */

const ASEA_URL = 'https://bangdw-hash.github.io/asea-calendar-management/';
const ASEA_PATTERN = 'https://bangdw-hash.github.io/asea-calendar-management/*';

/* ── 단축키 이벤트 ──────────────────────────────────────── */
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-quick-task') return;
  await handleShortcut();
});

/* ── 확장 아이콘 클릭 (popup 없을 때 fallback) ─────────── */
chrome.action.onClicked && chrome.action.onClicked.addListener(async () => {
  await handleShortcut();
});

/* ── 핵심 로직 ──────────────────────────────────────────── */
async function handleShortcut() {
  try {
    // 1. ASEA 탭이 이미 열려 있는지 확인
    const tabs = await chrome.tabs.query({ url: ASEA_PATTERN });

    if (tabs.length > 0) {
      // 가장 최근 ASEA 탭 포커스
      const tab = tabs[tabs.length - 1];
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(tab.id, { active: true });

      // 탭 로드 완료 후 빠른 등록 모달 오픈
      await injectOpenModal(tab.id);

    } else {
      // 2. ASEA 탭 새로 열기 (hash로 자동 모달 오픈 신호 전달)
      const newTab = await chrome.tabs.create({ url: ASEA_URL + '#quick-task' });

      // 탭이 완전히 로드될 때까지 대기
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === newTab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          // 로드 완료 후 약간 대기 (JS 초기화 시간)
          setTimeout(() => injectOpenModal(newTab.id), 800);
        }
      });
    }
  } catch (err) {
    console.error('[ASEA Extension] handleShortcut error:', err);
    // 오류 시 단순히 탭 열기
    chrome.tabs.create({ url: ASEA_URL });
  }
}

/* ── 탭에 스크립트 주입 → 모달 오픈 ────────────────────── */
async function injectOpenModal(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: openQuickTaskInPage,
    });
  } catch (err) {
    // scripting 실패 (로딩 중 등) → 알림으로 유도
    showNotification();
  }
}

/* ── 페이지 내에서 실행될 함수 (serialized) ─────────────── */
function openQuickTaskInPage() {
  // 로그인 여부 확인
  const isLoggedIn = typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn();

  if (isLoggedIn && typeof QuickTaskModule !== 'undefined') {
    // 이미 로그인 → 모달 바로 오픈
    QuickTaskModule.open();

  } else if (!isLoggedIn) {
    // 미로그인 → 로그인 안내 팝업
    const overlay = document.getElementById('login-overlay');
    const app     = document.getElementById('app');

    if (overlay) overlay.hidden = false;
    if (app)     app.hidden     = true;

    // 로그인 후 자동 모달 오픈을 위한 플래그
    window.__aseaAutoOpenQuickTask = true;

    // 안내 토스트
    if (typeof window.aseaToast === 'function') {
      window.aseaToast('로그인 후 빠른 업무 등록이 자동으로 열립니다.', 'info');
    } else {
      alert('[ASEA] 로그인 후 빠른 업무 등록을 사용할 수 있습니다.');
    }
  } else {
    // QuickTaskModule 미로드 → URL hash 신호로 처리
    window.__aseaAutoOpenQuickTask = true;
  }
}

/* ── 알림 (scripting 실패 fallback) ─────────────────────── */
function showNotification() {
  chrome.notifications && chrome.notifications.create({
    type:    'basic',
    iconUrl: 'icons/icon48.png',
    title:   'ASEA 빠른 업무 등록',
    message: 'ASEA 페이지를 열고 있습니다. 잠시 후 빠른 등록 창이 표시됩니다.',
  });
}
