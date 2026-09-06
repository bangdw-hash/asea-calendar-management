# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ASEA Calendar Management is a **static web app** (zero build step, zero test runner) deployed via GitHub Pages at `https://bangdw-hash.github.io/asea-calendar-management/`. All files are served as-is — edit, commit, push, and GitHub Pages picks it up automatically.

Owner: `bangdw@gmail.com` (ADMIN_EMAIL in forum.html, senderEmail in config.js)
Supabase project: `zbpeyklwpotjyveipzxd` (used by forum.html only)

## Deployment

```bash
# No build step. Deploy = push to main.
git add <files>
git commit -m "..."
git push origin main
```

**PR workflow**: The owner prefers that Claude Code creates a PR for any feature branch, then auto-merges it once CI (GitHub Pages build) passes. Do this proactively — create PR → ready for review → merge — without waiting for confirmation.

## Architecture

The project is a collection of independent SPAs sharing one Google OAuth flow (`auth.js`, `config.js`).

### Core Google-API app (`index.html` + JS modules)

Script load order matters — each module exposes itself via `window.*`:

```
config.js → auth.js → calendar.js, drive.js → gmail.js, report.js → app.js
```

Module pattern (IIFE + window exposure):
```javascript
'use strict';
(function () {
  window.ExampleModule = {
    method: async function(param) {
      var token = Auth.getToken();
      if (!token) throw new Error('인증이 필요합니다');
      // ...
    }
  };
})();
```

Rules: never throw on empty array/null responses (return `[]`); throw `Error` objects on API errors (no `console.error`); always null-check `Auth.getToken()`.

### Standalone SPAs

Each HTML file is self-contained (CSS + JS inline or in same-name `.js`/`.css` files):

| File | Purpose |
|------|---------|
| `forum.html` | AI 활용 포럼 — Supabase JS v2, Quill rich text editor, RLS |
| `schedule.html` | 일정 관리 — design reference for color system and icons |
| `checkin.html` | 체크인 — GAS proxy backend |
| `dormitory/` | 기숙사 관리 — resident, complaint, contract-sign pages |
| `facility-request.html` | 시설 요청 |
| `wayfind.html` | 교내 길찾기 |
| `assessment.html` | 역량 평가 |

### Design System (schedule.html → applied to forum.html)

Use these CSS tokens for any new UI work:

```css
--primary:#1A73E8; --primary-dk:#1557B0; --primary-lt:#E8F0FE;
--green:#16a34a;   --green-lt:#dcfce7;
--orange:#ea580c;  --orange-lt:#ffedd5;
--red:#dc2626;     --red-lt:#fee2e2;
--r:8px;  /* border-radius — no pill shapes */
--sh / --sh-md / --sh-lg  /* shadow scale */
```

Icons: inline SVG only — no emoji in UI. Theme picker (blue/green/orange swatches) is in the forum.html header and applies via `applyTheme()`.

### forum.html key points

- Supabase anon key is public (RLS enforces access control)
- Admin session: `sessionStorage.getItem('forum_admin') === '1'`
- Admin email constant: `ADMIN_EMAIL = 'bangdw@gmail.com'`
- Category list: `['전체','일반','AI활용사례','질문','제안','트러블슈팅','공지']`
- Password hashing: `sha256(pw + 'asea-forum-v1')` stored in Supabase
- File uploads: Supabase Storage bucket `forum-files`

## AI Collaboration Protocol

This project uses `CLAUDE-CODEX-PROTOCOL.md` for multi-agent workflows. Key files:
- `.ai-status/WORK_STATUS.md` — current task progress
- `.ai-status/locks.json` — file lock registry (prevent parallel edits)
- `.ai-interfaces/*.interface.md` — module interface contracts (function signatures must not change)

Claude Code is Tech Lead; Codex is Implementer. For solo Claude Code sessions, follow the same module interface contracts but skip the lock/log ceremony.

## Google Cloud Console (manual setup required)

OAuth Authorized JavaScript Origins must include `https://bangdw-hash.github.io` — this cannot be done in code. If `origin_mismatch` or `403` errors appear during Google login, that is the fix.
