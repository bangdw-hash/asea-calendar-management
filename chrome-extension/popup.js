'use strict';

const ASEA_URL = 'https://bangdw-hash.github.io/asea-calendar-management/';
const ASEA_PATTERN = 'https://bangdw-hash.github.io/asea-calendar-management/*';

/* ── 로그인 상태 확인 ──────────────────────────────────── */
async function checkLoginStatus() {
  const statusRow  = document.getElementById('status-row');
  const statusDot  = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  try {
    const tabs = await chrome.tabs.query({ url: ASEA_PATTERN });
    if (tabs.length === 0) {
      setStatus('disconnected');
      return;
    }

    // 탭에서 로그인 상태 조회
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabs[tabs.length - 1].id },
      func: () => {
        const isLoggedIn = typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn();
        const email = document.getElementById('user-email') && document.getElementById('user-email').textContent;
        return { isLoggedIn, email: email || '' };
      },
    });

    const { isLoggedIn, email } = results[0].result;
    if (isLoggedIn) {
      setStatus('logged-in', email || '로그인됨');
    } else {
      setStatus('logged-out');
    }
  } catch (e) {
    setStatus('disconnected');
  }
}

function setStatus(state, email) {
  const row  = document.getElementById('status-row');
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');

  row.className = 'status-row';
  dot.className = 'status-dot';

  if (state === 'logged-in') {
    row.classList.add('logged-in');
    dot.classList.add('dot-on');
    text.textContent = '✅ 로그인됨' + (email ? ': ' + email : '');
  } else if (state === 'logged-out') {
    row.classList.add('logged-out');
    dot.classList.add('dot-off');
    text.textContent = '⚠️ 로그인이 필요합니다';
  } else {
    row.classList.add('logged-out');
    dot.style.background = '#9e9e9e';
    text.textContent = 'ASEA 페이지가 열려 있지 않음';
  }
}

/* ── 버튼 이벤트 ──────────────────────────────────────── */
document.getElementById('open-btn').addEventListener('click', async () => {
  // background의 handleShortcut과 동일 로직
  const tabs = await chrome.tabs.query({ url: ASEA_PATTERN });
  if (tabs.length > 0) {
    const tab = tabs[tabs.length - 1];
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (typeof Auth !== 'undefined' && Auth.isLoggedIn() && typeof QuickTaskModule !== 'undefined') {
          QuickTaskModule.open();
        } else {
          window.__aseaAutoOpenQuickTask = true;
          const overlay = document.getElementById('login-overlay');
          const app     = document.getElementById('app');
          if (overlay) overlay.hidden = false;
          if (app)     app.hidden     = true;
          if (typeof window.aseaToast === 'function') {
            window.aseaToast('로그인 후 빠른 업무 등록이 자동으로 열립니다.', 'info');
          }
        }
      },
    });
  } else {
    await chrome.tabs.create({ url: ASEA_URL + '#quick-task' });
  }
  window.close();
});

document.getElementById('settings-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  window.close();
});

document.getElementById('shortcut-link').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  window.close();
});

/* ── 초기화 ──────────────────────────────────────────── */
checkLoginStatus();
