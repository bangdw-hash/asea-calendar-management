/**
 * gas_slides_proxy.gs  v2
 * Google Apps Script — 홍보슬라이드 프록시 (폰트·레이아웃·이미지 지원)
 *
 * [배포 방법]
 * 1. https://script.google.com → 새 프로젝트
 * 2. 이 코드 전체 붙여넣기
 * 3. PRESENTATION_ID 상수를 실제 Google Slides ID로 수정
 * 4. 배포 → 새 배포 → 웹 앱
 *    - 다음 사용자로 실행: 나 (본인 계정)
 *    - 액세스 권한: 모든 사용자
 * 5. 배포 URL을 ASEA 앱 설정탭 → 홍보슬라이드 설정에 입력
 */

// ── 필수 설정 ──────────────────────────────────────────────────────
var PRESENTATION_ID = '여기에_Google_Slides_프레젠테이션_ID_입력';

// ── CORS 헤더 ─────────────────────────────────────────────────────
function setCors(output) {
  return output
    .setHeader('Access-Control-Allow-Origin',  '*')
    .setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function doOptions() {
  return setCors(ContentService.createTextOutput(''));
}

function doGet() {
  return setCors(ContentService
    .createTextOutput(JSON.stringify({ status:'ok', version:'2.0', message:'ASEA 홍보슬라이드 GAS v2 동작 중' }))
    .setMimeType(ContentService.MimeType.JSON));
}

// ── POST 진입점 ───────────────────────────────────────────────────
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    var title        = body.title        || '';
    var bodyText     = body.body         || '';
    var tag          = body.tag          || '';
    var bg           = body.bg           || '#C8185A';
    var fontFamily   = body.font         || 'Noto Sans KR';
    var layout       = body.layout       || 'full-top';
    var bgImageB64   = body.bgImage      || null;   // base64 data URL
    var insertImages = body.insertImages || [];      // [{b64, name}]

    var result = appendSlide(title, bodyText, tag, bg, fontFamily, layout, bgImageB64, insertImages);

    return setCors(ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON));

  } catch(err) {
    return setCors(ContentService
      .createTextOutput(JSON.stringify({ error: err.message + '\n' + err.stack }))
      .setMimeType(ContentService.MimeType.JSON));
  }
}

// ── 슬라이드 추가 메인 함수 ────────────────────────────────────────
function appendSlide(title, bodyText, tag, bg, fontFamily, layout, bgImageB64, insertImages) {
  var pres   = SlidesApp.openById(PRESENTATION_ID);
  var idx    = pres.getSlides().length;
  var slide  = pres.insertSlide(idx, SlidesApp.PredefinedLayout.BLANK);

  var W = pres.getPageWidth();
  var H = pres.getPageHeight();

  // ── 배경 처리 ────────────────────────────────────────────────────
  if (layout === 'img-bg' && bgImageB64) {
    // base64 data URL → Blob → 배경 이미지 삽입
    try {
      var blob = dataUrlToBlob(bgImageB64, 'background.jpg');
      var bgImg = slide.insertImage(blob, 0, 0, W, H);
      bgImg.sendToBack();
      // 반투명 오버레이
      var overlay = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, W, H);
      overlay.getFill().setSolidFill(bg);
      overlay.getFill().getSolidFill().getColor();
      // 투명도 설정 (Google Apps Script에서 직접 alpha 설정은 지원 안 함 — 별도 처리)
      overlay.getBorder().setTransparent();
      // 오버레이를 조금 투명하게 (GAS 한계: 완전한 투명도 API 없음)
      overlay.sendToBack();
      bgImg.sendToBack();
    } catch(imgErr) {
      Logger.log('배경 이미지 오류: ' + imgErr.message);
      slide.getBackground().setSolidFill(bg);
    }
  } else if (layout === 'dark-left') {
    // 흰 배경 + 왼쪽 색상 띠
    slide.getBackground().setSolidFill('#FFFFFF');
    var leftBand = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, W * 0.12, H);
    leftBand.getFill().setSolidFill(bg);
    leftBand.getBorder().setTransparent();
  } else if (layout === 'full-top') {
    // 흰 배경 + 상단 색상 밴드
    slide.getBackground().setSolidFill('#FFFFFF');
    var topBand = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, W, H * 0.65);
    topBand.getFill().setSolidFill(bg);
    topBand.getBorder().setTransparent();
  } else {
    // full-color
    slide.getBackground().setSolidFill(bg);
  }

  // ── 텍스트 배치 (레이아웃별 위치 계산) ───────────────────────────
  var positions = calcPositions(layout, W, H);

  // 태그 (상단 작은 텍스트)
  if (tag) {
    var tagBox = slide.insertTextBox(tag,
      positions.tag.x, positions.tag.y, positions.tag.w, positions.tag.h);
    styleBox(tagBox, fontFamily, positions.tag.size,
      positions.tag.color, true, positions.tag.align);
  }

  // 제목
  if (title) {
    var titleBox = slide.insertTextBox(title,
      positions.title.x, positions.title.y, positions.title.w, positions.title.h);
    styleBox(titleBox, fontFamily, positions.title.size,
      positions.title.color, true, positions.title.align);
  }

  // 본문
  if (bodyText) {
    var bodyBox = slide.insertTextBox(bodyText,
      positions.body.x, positions.body.y, positions.body.w, positions.body.h);
    styleBox(bodyBox, fontFamily, positions.body.size,
      positions.body.color, false, positions.body.align);
  }

  // ── 삽입 이미지 처리 ─────────────────────────────────────────────
  for (var i = 0; i < insertImages.length; i++) {
    try {
      var imgData = insertImages[i];
      if (!imgData.b64) continue;
      var imgBlob = dataUrlToBlob(imgData.b64, imgData.name || 'image_' + i + '.jpg');
      // 이미지 배치: 슬라이드 오른쪽 하단 영역에 자동 배치
      var imgW = W * 0.35;
      var imgH = H * 0.35;
      var imgX = W - imgW - W * 0.04 - (i * (imgW + 10));
      var imgY = H * 0.6;
      if (imgX < 0) imgX = W * 0.04;
      slide.insertImage(imgBlob, imgX, imgY, imgW, imgH);
    } catch(e) {
      Logger.log('삽입 이미지 오류 ' + i + ': ' + e.message);
    }
  }

  return {
    success: true,
    slideIndex: idx,
    presentationUrl: 'https://docs.google.com/presentation/d/' + PRESENTATION_ID + '/edit',
  };
}

// ── 레이아웃별 텍스트 위치 계산 ──────────────────────────────────
function calcPositions(layout, W, H) {
  var WHITE  = '#FFFFFF';
  var DARK   = '#1A1A2E';

  if (layout === 'full-top') {
    return {
      tag:   { x:W*0.06, y:H*0.06, w:W*0.88, h:H*0.10, size:16, color:WHITE, align:'LEFT' },
      title: { x:W*0.06, y:H*0.17, w:W*0.88, h:H*0.38, size:38, color:WHITE, align:'CENTER' },
      body:  { x:W*0.08, y:H*0.68, w:W*0.84, h:H*0.26, size:20, color:DARK,  align:'CENTER' },
    };
  } else if (layout === 'full-color') {
    return {
      tag:   { x:W*0.06, y:H*0.07, w:W*0.88, h:H*0.10, size:16, color:WHITE, align:'LEFT' },
      title: { x:W*0.06, y:H*0.22, w:W*0.88, h:H*0.35, size:38, color:WHITE, align:'CENTER' },
      body:  { x:W*0.06, y:H*0.62, w:W*0.88, h:H*0.26, size:20, color:WHITE, align:'CENTER' },
    };
  } else if (layout === 'dark-left') {
    return {
      tag:   { x:W*0.16, y:H*0.08, w:W*0.80, h:H*0.10, size:14, color:DARK,  align:'LEFT' },
      title: { x:W*0.16, y:H*0.22, w:W*0.80, h:H*0.40, size:34, color:DARK,  align:'LEFT' },
      body:  { x:W*0.16, y:H*0.64, w:W*0.80, h:H*0.28, size:18, color:DARK,  align:'LEFT' },
    };
  } else {
    // img-bg
    return {
      tag:   { x:W*0.06, y:H*0.07, w:W*0.88, h:H*0.10, size:16, color:WHITE, align:'LEFT' },
      title: { x:W*0.06, y:H*0.22, w:W*0.88, h:H*0.35, size:38, color:WHITE, align:'CENTER' },
      body:  { x:W*0.06, y:H*0.62, w:W*0.88, h:H*0.26, size:20, color:WHITE, align:'CENTER' },
    };
  }
}

// ── 텍스트박스 스타일 적용 ────────────────────────────────────────
function styleBox(textBox, fontFamily, fontSize, colorHex, bold, align) {
  textBox.getBorder().setTransparent();
  textBox.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);

  var range = textBox.getText();
  var style = range.getTextStyle();

  style.setFontSize(fontSize);
  style.setBold(bold);
  style.setForegroundColor(colorHex);

  // 폰트 패밀리 설정 (Google Fonts 이름 그대로 사용)
  try { style.setFontFamily(fontFamily); } catch(e) { style.setFontFamily('Noto Sans KR'); }

  // 단락 정렬
  var paraStyle = range.getParagraphStyle();
  if (align === 'CENTER') {
    paraStyle.setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
  } else if (align === 'RIGHT') {
    paraStyle.setParagraphAlignment(SlidesApp.ParagraphAlignment.END);
  } else {
    paraStyle.setParagraphAlignment(SlidesApp.ParagraphAlignment.START);
  }

  // 줄간격
  paraStyle.setLineSpacing(130);
}

// ── base64 data URL → Blob 변환 ──────────────────────────────────
function dataUrlToBlob(dataUrl, filename) {
  // data:image/jpeg;base64,xxxx 형식 처리
  var parts   = dataUrl.split(',');
  var meta    = parts[0];                        // "data:image/jpeg;base64"
  var b64data = parts[1];

  var mimeMatch = meta.match(/data:([^;]+)/);
  var mimeType  = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  var decoded = Utilities.base64Decode(b64data, Utilities.Charset.UTF_8);
  return Utilities.newBlob(decoded, mimeType, filename);
}
