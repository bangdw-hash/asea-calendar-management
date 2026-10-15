# 기안문 삽입용 QR · 예산 현황표 클립보드 복사 (요구 사양, 미구현)

작성일 2026-10-15 · 대상: budget.html 결재 QR 집행 연동(`budget-ticket.js`)

## 요구
- 내부기안문서 본문(제목 아래) 좌측에 QR 3cm×3cm, 우측에 예산 현황표를 붙여넣는다.
- 버튼 2개: 「QR 복사(HTML)」 · 「예산 현황표 복사」. 누르면 클립보드에 담기고 기안문 편집기에서 Ctrl+V.
- 표 열: 예산코드 / 연간예산 / 기존 집행 / 이번 집행 / 잔여 예산 (항목명 추가 여부는 확인 필요).
- 예시 화면: `docs/budget-draft-clip-mock.png`

## 기술 방식 (웹 구현)
- `navigator.clipboard.write([new ClipboardItem({'text/html':…,'text/plain':…})])` — 사용자 클릭 안에서 호출, HTTPS(GitHub Pages) 충족.
- QR: `<img src="data:image/png;base64,…" style="width:3cm;height:3cm" width="113" height="113">` (원본 354px PNG). 현재 `copyQr`는 `image/png`만 복사 → HTML 모드 추가.
- 표: 인라인 스타일만 사용(`<table style="border-collapse:collapse">`, 각 td에 border·padding 지정). class·외부 CSS는 편집기에서 제거될 수 있음.
- 조건부 서식: 잔여 마이너스는 빨간색 글씨.
- 참고 문서: 첨부 `QR_HTML_3cm…md`(NNEditor, Windows CF_HTML 방식은 AHK/Python용. 웹 버튼은 CF_HTML 헤더를 쓰지 않음).

## 확인 필요 (실제 기안 편집기 검증 전에는 가능 여부 단정 불가)
1. 편집기가 `data:image` 붙여넣기를 허용하는가, 임시저장·재열람 후에도 유지되는가.
2. 표의 인라인 스타일(테두리·배경색)이 유지되는가.
3. 안 되면: QR 이미지를 서버(HTTPS URL)로 제공하는 방식 필요(Supabase Storage 등, 별도 승인).
