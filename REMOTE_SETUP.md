# 홍보슬라이드 원격 PC 롤링 설정 가이드

## 1. Google Slides 준비 및 GAS 프록시 배포

### 1-1. Google Slides 파일 생성
1. Google Slides(https://slides.google.com) → 새 프레젠테이션 생성
2. 프레젠테이션 이름: `ASEA 홍보슬라이드`
3. 첫 슬라이드 내용: 아무 내용이나 입력 (운영 중 자동 추가됨)

### 1-2. Presentation ID 확인
- URL: `https://docs.google.com/presentation/d/[여기가_ID]/edit`
- ID를 복사해 둠

### 1-3. GAS 프록시 배포
1. https://script.google.com → 새 프로젝트 생성
2. 프로젝트 이름: `ASEA 홍보슬라이드 Proxy`
3. 편집기에 `gas_slides_proxy.gs` 내용 전체 붙여넣기
4. 코드 상단 `PRESENTATION_ID = '여기에_...'` 를 실제 ID로 수정
5. **배포 → 새 배포 → 웹 앱**
   - 설명: `ASEA 홍보슬라이드 v1`
   - 다음 사용자로 실행: **나 (본인 계정)**
   - 액세스 권한: **모든 사용자**
6. 배포 → URL 복사

### 1-4. ASEA 앱에 GAS URL 등록
1. ASEA 앱 → 설정 탭 → **홍보슬라이드 설정** 카드
2. `GAS 프록시 URL` 입력란에 위에서 복사한 URL 붙여넣기
3. 저장

---

## 2. Google Slides 웹 게시 (키오스크 자동 롤링)

### 2-1. 웹에 게시
1. Google Slides → **파일 → 공유 → 웹에 게시**
2. 설정:
   - 슬라이드 전환 간격: **5초**
   - 마지막 슬라이드 후 재시작: **체크**
   - 자동으로 슬라이드 쇼 시작: **체크**
3. **게시** 클릭 → URL 복사

예시 URL:  
`https://docs.google.com/presentation/d/[ID]/pub?start=true&loop=true&delayms=5000`

---

## 3. 원격 PC Chrome Kiosk 실행

### 3-1. start_promo.bat 파일 생성
메모장 열기 → 아래 내용 붙여넣기 → `start_promo.bat`으로 저장

```bat
@echo off
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --kiosk ^
  --noerrdialogs ^
  --disable-infobars ^
  --disable-session-crashed-bubble ^
  "https://docs.google.com/presentation/d/[ID]/pub?start=true&loop=true&delayms=5000"
```

> `[ID]` 부분을 실제 Presentation ID로 교체

### 3-2. Windows 자동 시작 등록
1. `Win + R` → `shell:startup` 입력 → 엔터
2. 위에서 만든 `start_promo.bat` 파일을 해당 폴더에 복사

---

## 4. 슬라이드 즉시 반영 원리

- Google Slides 웹 게시 URL은 **서버 측 실시간 반영**
- Chrome이 루프 중 다음 슬라이드로 넘어갈 때마다 최신 슬라이드 로드
- ASEA 앱에서 슬라이드 추가 → **별도 새로고침 없이 자동 반영**

---

## 5. 운영 요약

```
[ASEA 앱] → [홍보 탭] → 문구 생성 → 슬라이드에 추가
    ↓
[GAS 프록시] → [Google Slides API] → 마지막 슬라이드 추가
    ↓
[원격 PC 키오스크 Chrome] → 루프 재생 중 자동 표시
```
