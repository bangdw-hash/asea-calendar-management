/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  gas_slides_proxy.gs  v3                                     ║
 * ║  ASEA 홍보슬라이드 — Google Apps Script 프록시               ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * ────────────────────────────────────────────────────────────────
 * [최초 1회 설정 — GAS 스크립트 속성 등록]
 *
 * GAS 편집기 → 왼쪽 ⚙️ 프로젝트 설정 → 스크립트 속성 → 속성 추가
 *
 * 속성 이름                  설명
 * ─────────────────────────────────────────────────────────────────
 * PRES_EXTERNAL             대외형 Slides 프레젠테이션 ID
 * PRES_EVENT_SINGLE         행사단일용 Slides 프레젠테이션 ID
 * PRES_INTERNAL             내부행사용 Slides 프레젠테이션 ID
 * PRES_GENERAL              일반용 Slides 프레젠테이션 ID
 * ACCESS_TOKEN              (선택) 공개 URL 접근 토큰 — 설정 시 요청에 포함 필요
 *
 * ※ 프레젠테이션 ID = Google Slides URL 중간의 긴 문자열
 *   https://docs.google.com/presentation/d/ [여기] /edit
 *
 * [4가지 프레젠테이션 타입 및 키오스크 특성]
 * ─────────────────────────────────────────────────────────────────
 * 대외형 (external)         로비·외부 모니터용. 슬라이드 누적, 5초 자동전환
 * 행사단일용 (event-single) 특정 행사 단독화면. 항상 1장만 유지(기존 교체)
 * 내부행사용 (internal)     내부 공지용. 슬라이드 누적, 3초 빠른전환
 * 일반용 (general)          일반 안내용. 슬라이드 누적, 8초 전환
 *
 * [웹 앱 배포 방법]
 * ─────────────────────────────────────────────────────────────────
 * 배포 → 새 배포 → 웹 앱
 *   - 다음 사용자로 실행: 나 (본인 계정)
 *   - 액세스 권한: 모든 사용자
 * → 발급된 URL을 ASEA 앱 설정 탭 → 홍보슬라이드 설정에 입력
 */

// ── 스크립트 속성에서 프레젠테이션 ID 로드 ──────────────────────
function getPresIds() {
  var p = PropertiesService.getScriptProperties();
  return {
    'external':     p.getProperty('PRES_EXTERNAL')     || '',
    'event-single': p.getProperty('PRES_EVENT_SINGLE') || '',
    'internal':     p.getProperty('PRES_INTERNAL')     || '',
    'general':      p.getProperty('PRES_GENERAL')      || '',
  };
}

function getAccessToken() {
  return PropertiesService.getScriptProperties().getProperty('ACCESS_TOKEN') || '';
}

// ── CORS ─────────────────────────────────────────────────────────
function setCors(output) {
  return output
    .setHeader('Access-Control-Allow-Origin',  '*')
    .setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Access-Token');
}
function jsonOut(obj) {
  return setCors(ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON));
}
function doOptions() { return setCors(ContentService.createTextOutput('')); }

// ── GET — 상태 확인 + 설정 정보 반환 ────────────────────────────
function doGet(e) {
  var ids   = getPresIds();
  var props = PropertiesService.getScriptProperties();
  var status = {};
  var TYPES = ['external','event-single','internal','general'];
  TYPES.forEach(function(t) {
    var key = 'LAST_UPDATED_' + t.toUpperCase().replace('-','_');
    status[t] = {
      configured:  !!ids[t],
      id:          ids[t] || '',
      lastUpdated: props.getProperty(key) || '0',
    };
  });
  // 현재 송출 중인 타입 정보 (kiosk 자동 전환용)
  var active = {
    type:   props.getProperty('ACTIVE_TYPE')    || 'general',
    presId: props.getProperty('ACTIVE_PRES_ID') || ids['general'] || '',
    ts:     props.getProperty('ACTIVE_TS')      || '0',
  };
  return jsonOut({ version: '3.0', status: status, active: active, accessTokenRequired: !!getAccessToken() });
}

// ── POST — 슬라이드 추가 ─────────────────────────────────────────
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // 접근 토큰 검증
    var requiredToken = getAccessToken();
    if (requiredToken && body.accessToken !== requiredToken) {
      return jsonOut({ error: '접근 권한이 없습니다.' });
    }

    var sp       = PropertiesService.getScriptProperties();
    var presType = body.presentationType || 'general';
    var ids      = getPresIds();
    var presId   = ids[presType];
    var ts       = new Date().getTime().toString();

    // ── 타입 전환만 (슬라이드 추가 없음) ──────────────────────
    if (body.action === 'switch') {
      if (!presId) return jsonOut({ error: '[' + presType + '] 프레젠테이션 ID 미설정' });
      sp.setProperty('ACTIVE_TYPE',    presType);
      sp.setProperty('ACTIVE_PRES_ID', presId);
      sp.setProperty('ACTIVE_TS',      ts);
      return jsonOut({ success: true, switched: presType, ts: ts });
    }

    // ── 슬라이드 추가 ─────────────────────────────────────────
    if (!presId) {
      return jsonOut({ error: '[' + presType + '] 프레젠테이션 ID가 설정되지 않았습니다.' });
    }

    var result = appendSlide(
      presId, presType,
      body.title || '', body.body || '', body.tag || '',
      body.bg || '#C8185A', body.font || 'Noto Sans KR',
      body.layout || 'full-top',
      body.bgImage || null,
      body.insertImages || []
    );

    // 타입별 마지막 업데이트 타임스탬프 저장
    sp.setProperty('LAST_UPDATED_' + presType.toUpperCase().replace('-','_'), ts);

    // switchNow: true 일 때만 활성 타입 변경 (기본값 false)
    if (body.switchNow === true) {
      sp.setProperty('ACTIVE_TYPE',    presType);
      sp.setProperty('ACTIVE_PRES_ID', presId);
      sp.setProperty('ACTIVE_TS',      ts);
    }

    var cfg = TYPE_CONFIG[presType] || TYPE_CONFIG['general'];
    result.kioskUrl        = buildKioskUrl(presId, cfg);
    result.presentationUrl = 'https://docs.google.com/presentation/d/' + presId + '/edit';
    result.lastUpdated     = ts;

    return jsonOut(result);

  } catch(err) {
    return jsonOut({ error: err.message });
  }
}

// ── 타입별 설정 ───────────────────────────────────────────────────
var TYPE_CONFIG = {
  'external':     { slideMode:'append',  delayms: 5000,      loop: true  },
  'event-single': { slideMode:'replace', delayms: 9999999,   loop: false },
  'internal':     { slideMode:'append',  delayms: 3000,      loop: true  },
  'general':      { slideMode:'append',  delayms: 8000,      loop: true  },
};

function buildKioskUrl(presId, cfg) {
  return 'https://docs.google.com/presentation/d/' + presId +
    '/pub?start=' + cfg.loop + '&loop=' + cfg.loop + '&delayms=' + cfg.delayms;
}

// ── 슬라이드 추가 메인 ────────────────────────────────────────────
function appendSlide(presId, presType, title, bodyText, tag, bg, fontFamily, layout, bgImageB64, insertImages) {
  var pres = SlidesApp.openById(presId);
  var cfg  = TYPE_CONFIG[presType] || TYPE_CONFIG['general'];

  // 행사단일용: 기존 슬라이드 모두 삭제 후 새로 추가
  if (cfg.slideMode === 'replace') {
    var existing = pres.getSlides();
    // 슬라이드가 1개 이상일 때만 삭제 (최소 1장은 남겨야 함)
    for (var d = existing.length - 1; d >= 0; d--) {
      if (existing.length - d > 1 || d === 0) {
        try { existing[d].remove(); } catch(e) { /* 마지막 슬라이드 삭제 불가 — 무시 */ }
      }
    }
    // 남은 슬라이드 초기화 (비워서 재사용)
    pres = SlidesApp.openById(presId); // 재로드
  }

  var slideIdx = pres.getSlides().length;
  var slide    = pres.insertSlide(slideIdx, SlidesApp.PredefinedLayout.BLANK);
  var W = pres.getPageWidth();
  var H = pres.getPageHeight();

  // ── 배경 ────────────────────────────────────────────────────
  if (layout === 'img-bg' && bgImageB64) {
    try {
      var bgBlob = dataUrlToBlob(bgImageB64, 'bg.jpg');
      var bgImg  = slide.insertImage(bgBlob, 0, 0, W, H);
      bgImg.sendToBack();
      var ov = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, W, H);
      ov.getFill().setSolidFill(bg);
      ov.getBorder().setTransparent();
      ov.sendToBack(); bgImg.sendToBack();
    } catch(e) {
      slide.getBackground().setSolidFill(bg);
    }
  } else if (layout === 'dark-left') {
    slide.getBackground().setSolidFill('#FFFFFF');
    var lb = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, W * 0.12, H);
    lb.getFill().setSolidFill(bg); lb.getBorder().setTransparent();
  } else if (layout === 'full-top') {
    slide.getBackground().setSolidFill('#FFFFFF');
    var tb = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, W, H * 0.65);
    tb.getFill().setSolidFill(bg); tb.getBorder().setTransparent();
  } else {
    slide.getBackground().setSolidFill(bg);
  }

  // ── 텍스트 ────────────────────────────────────────────────────
  var pos = calcPositions(layout, W, H);
  if (tag)      placeText(slide, tag,      fontFamily, pos.tag,   true);
  if (title)    placeText(slide, title,    fontFamily, pos.title, true);
  if (bodyText) placeText(slide, bodyText, fontFamily, pos.body,  false);

  // ── 삽입 이미지 ───────────────────────────────────────────────
  for (var i = 0; i < Math.min(insertImages.length, 4); i++) {
    try {
      var imgBlob = dataUrlToBlob(insertImages[i].b64, insertImages[i].name || 'img'+i+'.jpg');
      var iW = W * 0.35, iH = H * 0.35;
      var iX = W * 0.58 - i * (iW * 0.5);
      var iY = H * 0.60;
      if (iX < W*0.04) iX = W*0.04;
      slide.insertImage(imgBlob, iX, iY, iW, iH);
    } catch(e) { Logger.log('삽입이미지 오류: '+e.message); }
  }

  return { success: true, slideIndex: slideIdx, type: presType };
}

// ── 텍스트 배치 ───────────────────────────────────────────────────
function placeText(slide, text, font, p, bold) {
  var box = slide.insertTextBox(text, p.x, p.y, p.w, p.h);
  box.getBorder().setTransparent();
  box.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);
  var s = box.getText().getTextStyle();
  s.setFontSize(p.size);
  s.setBold(bold);
  s.setForegroundColor(p.color);
  try { s.setFontFamily(font); } catch(e) { s.setFontFamily('Noto Sans KR'); }
  var ps = box.getText().getParagraphStyle();
  ps.setParagraphAlignment(p.align === 'CENTER'
    ? SlidesApp.ParagraphAlignment.CENTER
    : p.align === 'RIGHT'
      ? SlidesApp.ParagraphAlignment.END
      : SlidesApp.ParagraphAlignment.START);
  ps.setLineSpacing(130);
}

function calcPositions(layout, W, H) {
  var WHITE='#FFFFFF', DARK='#1A1A2E';
  if (layout==='full-top')
    return {
      tag:  {x:W*.06,y:H*.06,w:W*.88,h:H*.10,size:16,color:WHITE,align:'LEFT'},
      title:{x:W*.06,y:H*.17,w:W*.88,h:H*.38,size:38,color:WHITE,align:'CENTER'},
      body: {x:W*.08,y:H*.68,w:W*.84,h:H*.26,size:20,color:DARK, align:'CENTER'},
    };
  if (layout==='full-color')
    return {
      tag:  {x:W*.06,y:H*.07,w:W*.88,h:H*.10,size:16,color:WHITE,align:'LEFT'},
      title:{x:W*.06,y:H*.22,w:W*.88,h:H*.35,size:38,color:WHITE,align:'CENTER'},
      body: {x:W*.06,y:H*.62,w:W*.88,h:H*.26,size:20,color:WHITE,align:'CENTER'},
    };
  if (layout==='dark-left')
    return {
      tag:  {x:W*.16,y:H*.08,w:W*.80,h:H*.10,size:14,color:DARK, align:'LEFT'},
      title:{x:W*.16,y:H*.22,w:W*.80,h:H*.40,size:34,color:DARK, align:'LEFT'},
      body: {x:W*.16,y:H*.64,w:W*.80,h:H*.28,size:18,color:DARK, align:'LEFT'},
    };
  // img-bg / default
  return {
    tag:  {x:W*.06,y:H*.07,w:W*.88,h:H*.10,size:16,color:WHITE,align:'LEFT'},
    title:{x:W*.06,y:H*.22,w:W*.88,h:H*.35,size:38,color:WHITE,align:'CENTER'},
    body: {x:W*.06,y:H*.62,w:W*.88,h:H*.26,size:20,color:WHITE,align:'CENTER'},
  };
}

function dataUrlToBlob(dataUrl, filename) {
  var parts = dataUrl.split(',');
  var mime  = (parts[0].match(/data:([^;]+)/) || ['','image/jpeg'])[1];
  return Utilities.newBlob(Utilities.base64Decode(parts[1]), mime, filename);
}

// ── 초기 설정 확인용 함수 (GAS 편집기에서 직접 실행 가능) ────────
function checkSetup() {
  var ids = getPresIds();
  var log = '=== ASEA 홍보슬라이드 GAS 설정 확인 ===\n';
  ['external','event-single','internal','general'].forEach(function(t){
    log += t + ': ' + (ids[t] ? '✅ ' + ids[t] : '❌ 미설정');
    if (!ids[t]) log += '  ← GAS 스크립트 속성에 PRES_' + t.toUpperCase().replace('-','_') + ' 등록 필요';
    log += '\n';
  });
  log += 'ACCESS_TOKEN: ' + (getAccessToken() ? '설정됨' : '없음 (누구나 접근 가능)');
  Logger.log(log);
  return log;
}
