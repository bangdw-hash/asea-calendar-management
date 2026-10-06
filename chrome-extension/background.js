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
async function getSelectedText(tabId) {
  // 단축키 호출 시 activeTab 권한이 부여되어 현재 탭의 선택 텍스트를 읽을 수 있음
  try {
    const r = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => String(window.getSelection ? window.getSelection() : '').trim(),
    });
    for (const x of r) { if (x && x.result) return x.result; }
  } catch (e) { /* chrome:// 등 접근 불가 페이지 */ }
  return '';
}

// 한글(HWP)·워드 등 외부 프로그램의 선택 영역은 읽을 수 없으므로, 브라우저 선택이 없으면 클립보드(Ctrl+C)를 사용
async function readClipboard() {
  try {
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['CLIPBOARD'], justification: '선택 후 복사한 텍스트를 일정으로 변환' });
    }
    const r = await chrome.runtime.sendMessage({ type: 'asea-read-clipboard' });
    await chrome.offscreen.closeDocument();
    return ((r && r.text) || '').trim().slice(0, 5000);
  } catch (e) { return ''; }
}

async function handleShortcut() {
  try {
    const [cur] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    let text = (cur && cur.id != null) ? await getSelectedText(cur.id) : '';
    let fromClip = false;
    if (!text) { text = await readClipboard(); fromClip = !!text; }
    await openAsea(text, fromClip);
  } catch (err) {
    console.error('[ASEA Extension] handleShortcut error:', err);
    chrome.tabs.create({ url: ASEA_URL });
  }
}

async function openAsea(text, fromClip) {
  try {
    // 0. 지금 보고 있는 탭이 이미 ASEA면 → 새 탭/창 없이 그 자리에서 바로 모달 오픈
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (active && active.id != null && active.url && active.url.indexOf(ASEA_URL) === 0) {
      await injectOpenModal(active.id, text, fromClip);
      return;
    }

    // 1. ASEA 탭이 이미 열려 있는지 확인
    const tabs = await chrome.tabs.query({ url: ASEA_PATTERN });

    if (tabs.length > 0) {
      // 가장 최근 ASEA 탭 포커스
      const tab = tabs[tabs.length - 1];
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(tab.id, { active: true });

      // 탭 로드 완료 후 빠른 등록 모달 오픈
      await injectOpenModal(tab.id, text, fromClip);

    } else {
      // 2. ASEA가 열려 있지 않으면 작은 팝업 창으로 열기 (hash로 자동 모달 오픈 신호 전달)
      const win = await chrome.windows.create({
        url: ASEA_URL + '#quick-task', type: 'popup', width: 620, height: 820, focused: true,
      });
      const newTab = win.tabs[0];

      // 탭이 완전히 로드될 때까지 대기
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === newTab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          // 로드 완료 후 약간 대기 (JS 초기화 시간)
          setTimeout(() => injectOpenModal(newTab.id, text, fromClip), 800);
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
async function injectOpenModal(tabId, text, fromClip) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: openQuickTaskInPage,
      args: [text || '', !!fromClip],
    });
  } catch (err) {
    // scripting 실패 (로딩 중 등) → 알림으로 유도
    showNotification();
  }
}

/* ── 페이지 내에서 실행될 함수 (serialized) ─────────────── */
function openQuickTaskInPage(selText, fromClip) {
  if (selText) window.__aseaQuickText = selText;
  // 로그인 여부 확인
  const isLoggedIn = typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn();

  if (isLoggedIn && typeof QuickTaskModule !== 'undefined') {
    // 이미 로그인 → 선택 텍스트에 날짜가 있으면 일정 모달, 없으면 빠른 등록 모달
    if (selText && window.EventExt && window.EventExt.openFromText(selText)) {
      window.__aseaQuickText = '';
      return;
    }
    // 날짜가 없으면 통합 일정창의 AI 분석 패널로 열기(선택 텍스트 자동 분석)
    if (window.EventExt && window.EventExt.openAi) window.EventExt.openAi(selText, !fromClip);   // 클립보드 텍스트는 자동 분석하지 않음(엉뚱한 내용 방지)
    else QuickTaskModule.open();

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
