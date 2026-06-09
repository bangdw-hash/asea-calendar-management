/**
 * gas_slides_proxy.gs
 * Google Apps Script — 홍보슬라이드 프록시
 *
 * [배포 방법]
 * 1. https://script.google.com 에서 새 프로젝트 생성
 * 2. 이 코드 전체 붙여넣기
 * 3. PRESENTATION_ID 상수를 실제 Google Slides 프레젠테이션 ID로 수정
 * 4. 배포 → 새 배포 → 웹 앱
 *    - 실행: 나(서비스 계정)
 *    - 액세스: 모든 사용자
 * 5. 배포 URL을 ASEA 앱 설정탭 → 홍보슬라이드 설정에 입력
 */

// ── 설정 ──────────────────────────────────────────────────────────
var PRESENTATION_ID = '여기에_Google_Slides_프레젠테이션_ID_입력';

// 테마별 배경색 (RGB 0-1 범위)
var THEME_COLORS = {
  '홍보': { red: 0,    green: 0.2,  blue: 0.4  },   // #003366
  '안내': { red: 0.1,  green: 0.36, blue: 0.1  },   // #1A5C1A
  '행사': { red: 0.48, green: 0.12, blue: 0.12 },   // #7B1F1F
};

// ── CORS 헤더 ─────────────────────────────────────────────────────
function setCorsHeaders(output) {
  return output
    .setHeader('Access-Control-Allow-Origin',  '*')
    .setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── OPTIONS (preflight) ───────────────────────────────────────────
function doOptions() {
  return setCorsHeaders(ContentService.createTextOutput(''));
}

// ── POST 진입점 ───────────────────────────────────────────────────
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var title = body.title || '';
    var bodyText = body.body  || '';
    var tag   = body.tag   || '';
    var theme = body.theme || '홍보';

    var result = appendPromoSlide(title, bodyText, tag, theme);
    var output = ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
    return setCorsHeaders(output);

  } catch (err) {
    var errOutput = ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
    return setCorsHeaders(errOutput);
  }
}

// ── GET (테스트용) ────────────────────────────────────────────────
function doGet() {
  var output = ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'ASEA 홍보슬라이드 GAS 프록시 동작 중' }))
    .setMimeType(ContentService.MimeType.JSON);
  return setCorsHeaders(output);
}

// ── 슬라이드 추가 핵심 로직 ────────────────────────────────────────
function appendPromoSlide(title, bodyText, tag, theme) {
  var presentation = SlidesApp.openById(PRESENTATION_ID);
  var slides       = presentation.getSlides();
  var insertIdx    = slides.length;

  // ① 빈 슬라이드 추가 (마지막 위치)
  var slide = presentation.insertSlide(insertIdx, SlidesApp.PredefinedLayout.BLANK);

  // ② 배경색 설정
  var bgColor = THEME_COLORS[theme] || THEME_COLORS['홍보'];
  var bgRgb   = 'rgb('
    + Math.round(bgColor.red   * 255) + ','
    + Math.round(bgColor.green * 255) + ','
    + Math.round(bgColor.blue  * 255) + ')';
  slide.getBackground().setSolidFill(bgRgb);

  var W = presentation.getPageWidth();   // EMU 단위
  var H = presentation.getPageHeight();

  // ③ 태그 텍스트박스 (상단 좌측)
  var tagBox = slide.insertTextBox(
    tag,
    W * 0.06,   // left
    H * 0.07,   // top
    W * 0.88,   // width
    H * 0.12    // height
  );
  styleTextBox(tagBox, 18, '#fff', true);

  // ④ 제목 텍스트박스 (중앙)
  var titleBox = slide.insertTextBox(
    title,
    W * 0.06,
    H * 0.28,
    W * 0.88,
    H * 0.28
  );
  styleTextBox(titleBox, 36, '#fff', true);

  // ⑤ 본문 텍스트박스 (하단)
  var bodyBox = slide.insertTextBox(
    bodyText,
    W * 0.06,
    H * 0.62,
    W * 0.88,
    H * 0.25
  );
  styleTextBox(bodyBox, 20, '#fff', false);

  return {
    success:          true,
    slideIndex:       insertIdx,
    presentationUrl:  'https://docs.google.com/presentation/d/' + PRESENTATION_ID + '/edit',
  };
}

// ── 텍스트박스 스타일 적용 ─────────────────────────────────────────
function styleTextBox(textBox, fontSize, colorHex, bold) {
  textBox.getBorder().setTransparent();

  var range = textBox.getText();
  var style = range.getTextStyle();
  style.setFontSize(fontSize);
  style.setBold(bold);
  style.setForegroundColor(colorHex);
  style.setFontFamily('Noto Sans KR');
}
