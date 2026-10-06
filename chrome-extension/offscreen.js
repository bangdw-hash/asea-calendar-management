/* 클립보드 읽기 전용 오프스크린 문서 — 서비스 워커는 클립보드에 직접 접근할 수 없음 */
chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (!msg || msg.type !== 'asea-read-clipboard') return;
  const t = document.getElementById('t');
  t.value = ''; t.focus();
  let text = '';
  try { document.execCommand('paste'); text = t.value; } catch (e) { /* 권한/포커스 문제 → 빈 문자열 */ }
  send({ text });
});
