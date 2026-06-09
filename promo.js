'use strict';
window.PromoModule = (function () {

  /* ── 레이아웃 템플릿 ── */
  var LAYOUTS = [
    { id: 'full-top',   label: '상단 배경',   desc: '상단 2/3 색상 + 하단 흰색' },
    { id: 'full-color', label: '전체 색상',   desc: '전체 배경색' },
    { id: 'dark-left',  label: '좌측 강조',   desc: '좌측 색상띠 + 흰 배경' },
    { id: 'img-bg',     label: '이미지 배경', desc: '업로드 이미지를 배경으로' },
  ];

  /* ── 폰트 목록 (Google Slides SlidesApp 호환 한국어 폰트) ── */
  var FONTS = [
    { id: 'Noto Sans KR',    label: 'Noto Sans KR (기본)' },
    { id: 'Nanum Gothic',    label: '나눔 고딕' },
    { id: 'Nanum Myeongjo',  label: '나눔 명조' },
    { id: 'Black Han Sans',  label: '블랙 한산스 (굵음)' },
    { id: 'Jua',             label: '주아 (둥근 굵음)' },
    { id: 'Gugi',            label: '구기 (포인트)' },
    { id: 'Do Hyeon',        label: '도현 (슬림 굵음)' },
    { id: 'Gowun Dodum',     label: '고운 돋음 (깔끔)' },
  ];

  /* ── 테마 색상 ── */
  var THEMES = [
    { id: '홍보', label: '📢 홍보', bg: '#C8185A' },
    { id: '안내', label: '📋 안내', bg: '#1565C0' },
    { id: '행사', label: '🎉 행사', bg: '#2E7D32' },
    { id: '경고', label: '⚠️ 경고', bg: '#E65100' },
    { id: '사용자', label: '🎨 직접', bg: '#444444' },
  ];

  var SK_HISTORY = 'asea_promo_history';
  var SK_SETTINGS = 'asea_promo_settings';

  /* ── 상태 ── */
  var _history    = [];
  var _generated  = null;
  var _publishing = false;
  var _inited     = false;
  var _bgImageB64 = null;   // base64 배경 이미지
  var _insImages  = [];     // 삽입 이미지 [{b64, name}]

  /* ── 설정 기본값 ── */
  var _cfg = {
    font:     'Noto Sans KR',
    layout:   'full-top',
    theme:    '홍보',
    customBg: '#C8185A',
  };

  /* ── 유틸 ── */
  function loadAll() {
    try { _history = JSON.parse(localStorage.getItem(SK_HISTORY)) || []; } catch(e) { _history = []; }
    try {
      var s = JSON.parse(localStorage.getItem(SK_SETTINGS));
      if (s) { _cfg.font = s.font||_cfg.font; _cfg.layout = s.layout||_cfg.layout;
               _cfg.theme = s.theme||_cfg.theme; _cfg.customBg = s.customBg||_cfg.customBg; }
    } catch(e) {}
  }
  function saveCfg() {
    try { localStorage.setItem(SK_SETTINGS, JSON.stringify(_cfg)); } catch(e) {}
  }
  function saveHistory(rec) {
    _history.unshift(rec);
    if (_history.length > 50) _history = _history.slice(0, 50);
    try { localStorage.setItem(SK_HISTORY, JSON.stringify(_history)); } catch(e) {}
  }
  function getApiKey() {
    return (typeof CONFIG !== 'undefined' && CONFIG.anthropicApiKey) ||
           localStorage.getItem('asea_anthropic_api_key') || '';
  }
  function getGasUrl() {
    return (typeof CONFIG !== 'undefined' && CONFIG.promoGasUrl) ||
           localStorage.getItem('asea_promo_gas_url') || '';
  }
  function resolveClaudeEndpoint(key) {
    var isOfficial = /^sk-ant-/.test(key);
    return {
      url: isOfficial ? 'https://api.anthropic.com/v1/messages' : 'https://api.amplifuse.io/v1/messages',
      isOfficial: isOfficial,
    };
  }
  function uid() { return Date.now() + '_' + Math.random().toString(36).slice(2,6); }
  function pad(n) { return String(n).padStart(2,'0'); }
  function fmtDT(iso) {
    var d = new Date(iso);
    return d.getFullYear()+'.'+pad(d.getMonth()+1)+'.'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());
  }
  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function getCurrentBg() {
    if (_cfg.theme === '사용자') return _cfg.customBg;
    var t = THEMES.find(function(x){ return x.id===_cfg.theme; });
    return t ? t.bg : '#C8185A';
  }
  function $p(id) { return document.getElementById(id); }
  function toast(msg, type) { if (typeof window.toast === 'function') window.toast(msg, type); }

  /* ══════════════════════════════════════════════
     초기화 / 렌더
  ══════════════════════════════════════════════ */
  function init() {
    if (!_inited) { _inited = true; loadAll(); }
    render();
    injectGoogleFonts();
  }

  function injectGoogleFonts() {
    if (document.getElementById('prm-gfonts')) return;
    var link = document.createElement('link');
    link.id = 'prm-gfonts'; link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&family=Nanum+Gothic:wght@400;700;800&family=Nanum+Myeongjo:wght@400;700&family=Black+Han+Sans&family=Jua&family=Gugi&family=Do+Hyeon&family=Gowun+Dodum&display=swap';
    document.head.appendChild(link);
  }

  function render() {
    var el = document.getElementById('tab-promo');
    if (!el) return;
    el.innerHTML = htmlPage();
    bindEvents();
    renderPreview();
    renderHistory();
    renderInsertImages();
  }

  /* ══════════════════════════════════════════════
     HTML — 메인 페이지
  ══════════════════════════════════════════════ */
  function htmlPage() {
    /* 폰트 옵션 */
    var fontOpts = FONTS.map(function(f){
      return '<option value="'+f.id+'"'+(_cfg.font===f.id?' selected':'')+'>'+f.label+'</option>';
    }).join('');

    /* 레이아웃 카드 */
    var layoutCards = LAYOUTS.map(function(l){
      return '<label class="prm-layout-card'+(_cfg.layout===l.id?' prm-layout-sel':'')+'" title="'+l.desc+'">'+
        '<input type="radio" name="prm-layout" value="'+l.id+'"'+(_cfg.layout===l.id?' checked':'')+' hidden>'+
        '<span class="prm-layout-thumb prm-lt-'+l.id+'"></span>'+
        '<span class="prm-layout-lbl">'+l.label+'</span>'+
        '</label>';
    }).join('');

    /* 테마 색상 */
    var themeChips = THEMES.map(function(t){
      return '<label class="prm-theme-label" style="--tc:'+t.bg+'">'+
        '<input type="radio" name="prm-theme" value="'+t.id+'"'+(_cfg.theme===t.id?' checked':'')+' hidden>'+
        '<span class="prm-theme-chip">'+t.label+'</span></label>';
    }).join('');

    return '<div class="prm-wrap">'+
      '<div class="prm-page-title">📣 홍보 슬라이드 생성</div>'+

      /* ① 서식 설정 */
      '<div class="prm-card">'+
      '<div class="prm-card-title">🎨 서식 설정</div>'+
      '<div class="prm-format-grid">'+

      '<div class="prm-format-sec">'+
      '<div class="prm-format-lbl">레이아웃 템플릿</div>'+
      '<div class="prm-layout-row">'+layoutCards+'</div>'+
      '</div>'+

      '<div class="prm-format-sec">'+
      '<div class="prm-format-lbl">서체(폰트)</div>'+
      '<select id="prm-font-sel" class="prm-sel prm-font-preview">'+fontOpts+'</select>'+
      '<div id="prm-font-sample" class="prm-font-sample">가나다라 ASEA 홍보</div>'+
      '</div>'+

      '<div class="prm-format-sec">'+
      '<div class="prm-format-lbl">배경 테마 색상</div>'+
      '<div class="prm-theme-row">'+themeChips+'</div>'+
      '<div id="prm-custom-color-row" class="prm-custom-color-row"'+(_cfg.theme!=='사용자'?' hidden':'')+'>'+
      '<input type="color" id="prm-custom-color" value="'+_cfg.customBg+'" class="prm-color-input">'+
      '<span style="font-size:12px;color:#666">직접 색상 선택</span>'+
      '</div>'+
      '</div>'+

      '</div></div>'+ /* format-grid / card 끝 */

      /* ② 텍스트 입력 영역 */
      '<div class="prm-card">'+
      '<div class="prm-card-title">✍️ 텍스트 입력 <span class="prm-card-hint">각 영역에 직접 입력하거나 AI 자동 생성을 이용하세요</span></div>'+
      '<div class="prm-fields">'+

      '<div class="prm-field-row">'+
      '<div class="prm-field-badge prm-badge-tag">상단 태그</div>'+
      '<input type="text" id="prm-tag" class="prm-field-inp" placeholder="#태그1 #태그2  예) #신입생모집 #항공정비" value="'+((_generated&&_generated.tag)||'')+'" maxlength="60">'+
      '</div>'+

      '<div class="prm-field-row">'+
      '<div class="prm-field-badge prm-badge-title">메인 제목</div>'+
      '<input type="text" id="prm-title" class="prm-field-inp" placeholder="20자 이내 핵심 제목  예) 2026년 신입생 모집" value="'+((_generated&&_generated.title)||'')+'" maxlength="40">'+
      '</div>'+

      '<div class="prm-field-row">'+
      '<div class="prm-field-badge prm-badge-body">본문 내용</div>'+
      '<textarea id="prm-body" class="prm-field-ta" placeholder="80자 이내 본문  예) 항공정비·관광·보안 계열&#10;원서접수 6/1~7/31 / 문의 02-714-9710" rows="3">'+((_generated&&_generated.body)||'')+'</textarea>'+
      '</div>'+

      '</div>'+ /* fields 끝 */

      '<div class="prm-ai-row">'+
      '<div class="prm-ai-input-wrap">'+
      '<input type="text" id="prm-ai-input" class="prm-field-inp" placeholder="AI 자동 생성: 홍보할 내용 요약 입력 후 버튼 클릭">'+
      '</div>'+
      '<button id="prm-gen-btn" class="prm-btn prm-btn-ai">🤖 AI 생성</button>'+
      '</div>'+
      '<div id="prm-err" class="prm-err" hidden></div>'+
      '</div>'+ /* card 끝 */

      /* ③ 이미지 */
      '<div class="prm-card">'+
      '<div class="prm-card-title">🖼️ 이미지 삽입</div>'+
      '<div class="prm-img-grid">'+

      '<div class="prm-img-zone">'+
      '<div class="prm-img-zone-lbl">배경 이미지 <span class="prm-img-zone-sub">(이미지 배경 레이아웃에서 사용)</span></div>'+
      '<div class="prm-drop-area" id="prm-bg-drop">'+
      '<input type="file" id="prm-bg-file" accept="image/*" hidden>'+
      '<div class="prm-drop-inner" id="prm-bg-preview">'+
      '<span>📷 클릭하거나 이미지를 드래그</span>'+
      '</div>'+
      '</div>'+
      '<button id="prm-bg-clear" class="prm-btn prm-btn-ghost prm-btn-sm" '+ (!_bgImageB64?'hidden':'')+'>× 제거</button>'+
      '</div>'+

      '<div class="prm-img-zone">'+
      '<div class="prm-img-zone-lbl">슬라이드에 삽입할 이미지 <span class="prm-img-zone-sub">(여러 장 가능)</span></div>'+
      '<div class="prm-drop-area" id="prm-ins-drop">'+
      '<input type="file" id="prm-ins-file" accept="image/*" multiple hidden>'+
      '<div class="prm-drop-inner"><span>📎 클릭하거나 이미지를 드래그</span></div>'+
      '</div>'+
      '<div id="prm-ins-list" class="prm-ins-list"></div>'+
      '</div>'+

      '</div></div>'+ /* img-grid / card 끝 */

      /* ④ 미리보기 */
      '<div class="prm-card" id="prm-preview-area">'+
      '<div class="prm-card-title">👁️ 미리보기 <span class="prm-card-hint">텍스트 입력·서식 변경 시 실시간 반영</span></div>'+
      '<div id="prm-preview-box"></div>'+
      '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">'+
      '<button id="prm-reset-btn" class="prm-btn prm-btn-ghost">↺ 초기화</button>'+
      '<button id="prm-publish-btn" class="prm-btn prm-btn-accent" '+(_publishing?'disabled':'')+'>'+
      (_publishing?'<span class="prm-spin"></span> 등록 중...':'📺 슬라이드에 추가')+
      '</button>'+
      '</div></div>'+

      /* ⑤ 이력 */
      '<div class="prm-card">'+
      '<div class="prm-card-title" style="display:flex;justify-content:space-between;align-items:center">'+
      '🕘 등록 이력 <button id="prm-refresh-btn" class="prm-btn prm-btn-ghost prm-btn-sm">🔄 새로고침</button>'+
      '</div>'+
      '<div id="prm-history-tbl"></div>'+
      '</div>'+
      '</div>';
  }

  /* ══════════════════════════════════════════════
     미리보기 렌더링
  ══════════════════════════════════════════════ */
  function renderPreview() {
    var box = $p('prm-preview-box'); if (!box) return;
    var tag   = ($p('prm-tag')  ||{}).value || '';
    var title = ($p('prm-title')||{}).value || '';
    var body  = ($p('prm-body') ||{}).value || '';
    var bg    = getCurrentBg();
    var font  = _cfg.font;
    var layout = _cfg.layout;

    var tagHtml   = tag   ? '<div class="prm-pv-tag">'  +escHtml(tag)  +'</div>' : '';
    var titleHtml = title ? '<div class="prm-pv-title">'+escHtml(title)+'</div>' : '<div class="prm-pv-title prm-pv-ph">메인 제목을 입력하세요</div>';
    var bodyHtml  = body  ? '<div class="prm-pv-body">' +escHtml(body).replace(/\n/g,'<br>')+'</div>' : '';

    var bgImgStyle = (_bgImageB64 && layout==='img-bg')
      ? 'background-image:url('+_bgImageB64+');background-size:cover;background-position:center;'
      : '';

    var html = '';
    if (layout === 'full-top') {
      html = '<div class="prm-pv-slide prm-pv-full-top" style="font-family:\''+font+'\',sans-serif">'+
        '<div class="prm-pv-top-band" style="background:'+bg+'">'+tagHtml+titleHtml+'</div>'+
        '<div class="prm-pv-bottom-band">'+bodyHtml+'</div>'+
        '</div>';
    } else if (layout === 'full-color') {
      html = '<div class="prm-pv-slide prm-pv-full-color" style="background:'+bg+';font-family:\''+font+'\',sans-serif">'+
        tagHtml+titleHtml+bodyHtml+'</div>';
    } else if (layout === 'dark-left') {
      html = '<div class="prm-pv-slide prm-pv-dark-left" style="font-family:\''+font+'\',sans-serif">'+
        '<div class="prm-pv-left-band" style="background:'+bg+'">'+
        '<div class="prm-pv-left-text">'+escHtml(tag||'ASEA')+'</div>'+
        '</div>'+
        '<div class="prm-pv-right-content">'+
        titleHtml+bodyHtml+
        '</div></div>';
    } else if (layout === 'img-bg') {
      html = '<div class="prm-pv-slide prm-pv-img-bg" style="'+bgImgStyle+'font-family:\''+font+'\',sans-serif">'+
        '<div class="prm-pv-img-overlay" style="background:'+bg+'55">'+
        tagHtml+titleHtml+bodyHtml+
        '</div></div>';
    }

    /* 삽입 이미지 썸네일 */
    if (_insImages.length) {
      html += '<div class="prm-ins-thumbs">'+
        _insImages.map(function(img){ return '<img src="'+img.b64+'" class="prm-ins-thumb" title="'+escHtml(img.name)+'">'; }).join('')+
        '</div>';
    }

    box.innerHTML = html;

    /* 폰트 샘플 업데이트 */
    var sample = $p('prm-font-sample');
    if (sample) sample.style.fontFamily = '\''+font+'\',sans-serif';
  }

  /* ══════════════════════════════════════════════
     삽입 이미지 목록 렌더
  ══════════════════════════════════════════════ */
  function renderInsertImages() {
    var el = $p('prm-ins-list'); if (!el) return;
    if (!_insImages.length) { el.innerHTML=''; return; }
    el.innerHTML = _insImages.map(function(img,i){
      return '<div class="prm-ins-item">'+
        '<img src="'+img.b64+'" class="prm-ins-item-img">'+
        '<span class="prm-ins-item-name">'+escHtml(img.name)+'</span>'+
        '<button class="prm-ins-del" data-i="'+i+'">×</button>'+
        '</div>';
    }).join('');
    $p('prm-ins-list').querySelectorAll('.prm-ins-del').forEach(function(btn){
      btn.addEventListener('click', function(){
        _insImages.splice(parseInt(btn.dataset.i),1);
        renderInsertImages(); renderPreview();
      });
    });
  }

  /* ══════════════════════════════════════════════
     이력 테이블
  ══════════════════════════════════════════════ */
  function renderHistory() {
    var el = $p('prm-history-tbl'); if (!el) return;
    if (!_history.length) { el.innerHTML='<p class="prm-empty-state">등록 이력이 없습니다.</p>'; return; }
    var rows = _history.map(function(r){
      var sc = r.status==='success'?'prm-s-ok':r.status==='failed'?'prm-s-fail':'prm-s-pend';
      var sl = r.status==='success'?'✅ 성공':r.status==='failed'?'❌ 실패':'⏳ 대기';
      var link = r.slideLink ? '<a href="'+r.slideLink+'" target="_blank" class="prm-link">열기</a>' : '-';
      return '<tr><td>'+fmtDT(r.createdAt)+'</td><td>'+escHtml(r.theme)+'</td>'+
        '<td class="prm-td-title">'+escHtml(r.title||'-')+'</td>'+
        '<td><span class="prm-chip '+sc+'">'+sl+'</span></td><td>'+link+'</td></tr>';
    }).join('');
    el.innerHTML='<div class="prm-tbl-wrap"><table class="prm-tbl">'+
      '<thead><tr><th>일시</th><th>테마</th><th>제목</th><th>상태</th><th>링크</th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table></div>';
  }

  /* ══════════════════════════════════════════════
     이벤트 바인딩
  ══════════════════════════════════════════════ */
  function bindEvents() {
    /* 실시간 미리보기 — 텍스트 입력 */
    ['prm-tag','prm-title','prm-body'].forEach(function(id){
      var el=$p(id); if(el) el.addEventListener('input', renderPreview);
    });

    /* 폰트 변경 */
    var fontSel=$p('prm-font-sel');
    if(fontSel) fontSel.addEventListener('change',function(){
      _cfg.font=fontSel.value; saveCfg(); renderPreview();
    });

    /* 레이아웃 변경 */
    document.querySelectorAll('input[name="prm-layout"]').forEach(function(r){
      r.addEventListener('change',function(){
        _cfg.layout=r.value; saveCfg();
        document.querySelectorAll('.prm-layout-card').forEach(function(c){ c.classList.remove('prm-layout-sel'); });
        r.closest('.prm-layout-card').classList.add('prm-layout-sel');
        renderPreview();
      });
    });

    /* 테마 색상 변경 */
    document.querySelectorAll('input[name="prm-theme"]').forEach(function(r){
      r.addEventListener('change',function(){
        _cfg.theme=r.value; saveCfg();
        var ccRow=$p('prm-custom-color-row');
        if(ccRow) ccRow.hidden=(_cfg.theme!=='사용자');
        renderPreview();
      });
    });

    /* 직접 색상 */
    var cc=$p('prm-custom-color');
    if(cc) cc.addEventListener('input',function(){ _cfg.customBg=cc.value; saveCfg(); renderPreview(); });

    /* 배경 이미지 */
    var bgDrop=$p('prm-bg-drop'), bgFile=$p('prm-bg-file');
    if(bgDrop){ bgDrop.addEventListener('click',function(){ bgFile&&bgFile.click(); }); }
    if(bgDrop){
      bgDrop.addEventListener('dragover',function(e){ e.preventDefault(); bgDrop.classList.add('prm-drop-over'); });
      bgDrop.addEventListener('dragleave',function(){ bgDrop.classList.remove('prm-drop-over'); });
      bgDrop.addEventListener('drop',function(e){ e.preventDefault(); bgDrop.classList.remove('prm-drop-over'); loadBgImage(e.dataTransfer.files[0]); });
    }
    if(bgFile) bgFile.addEventListener('change',function(){ if(bgFile.files[0]) loadBgImage(bgFile.files[0]); bgFile.value=''; });

    var bgClear=$p('prm-bg-clear');
    if(bgClear) bgClear.addEventListener('click',function(){
      _bgImageB64=null; bgClear.hidden=true;
      var prev=$p('prm-bg-preview'); if(prev) prev.innerHTML='<span>📷 클릭하거나 이미지를 드래그</span>';
      renderPreview();
    });

    /* 삽입 이미지 */
    var insDrop=$p('prm-ins-drop'), insFile=$p('prm-ins-file');
    if(insDrop){ insDrop.addEventListener('click',function(){ insFile&&insFile.click(); }); }
    if(insDrop){
      insDrop.addEventListener('dragover',function(e){ e.preventDefault(); insDrop.classList.add('prm-drop-over'); });
      insDrop.addEventListener('dragleave',function(){ insDrop.classList.remove('prm-drop-over'); });
      insDrop.addEventListener('drop',function(e){
        e.preventDefault(); insDrop.classList.remove('prm-drop-over');
        Array.from(e.dataTransfer.files).forEach(function(f){ if(f.type.startsWith('image/')) loadInsImage(f); });
      });
    }
    if(insFile) insFile.addEventListener('change',function(){
      Array.from(insFile.files).forEach(function(f){ loadInsImage(f); }); insFile.value='';
    });

    /* AI 생성 */
    var genBtn=$p('prm-gen-btn');
    if(genBtn) genBtn.addEventListener('click', onGenerate);

    /* 슬라이드 등록 */
    var pubBtn=$p('prm-publish-btn');
    if(pubBtn) pubBtn.addEventListener('click', onPublish);

    /* 초기화 */
    var rstBtn=$p('prm-reset-btn');
    if(rstBtn) rstBtn.addEventListener('click',function(){
      _generated=null; _bgImageB64=null; _insImages=[];
      ['prm-tag','prm-title','prm-body','prm-ai-input'].forEach(function(id){ var e=$p(id); if(e) e.value=''; });
      render();
    });

    /* 새로고침 */
    var refBtn=$p('prm-refresh-btn');
    if(refBtn) refBtn.addEventListener('click',function(){ loadAll(); renderHistory(); });
  }

  /* ── 배경 이미지 로드 ── */
  function loadBgImage(file) {
    if(!file||!file.type.startsWith('image/')) return;
    var reader=new FileReader();
    reader.onload=function(e){
      _bgImageB64=e.target.result;
      var prev=$p('prm-bg-preview');
      if(prev) prev.innerHTML='<img src="'+_bgImageB64+'" style="max-height:80px;max-width:100%;border-radius:6px">';
      var cl=$p('prm-bg-clear'); if(cl) cl.hidden=false;
      /* 이미지 배경 레이아웃 자동 전환 */
      _cfg.layout='img-bg'; saveCfg();
      var r=document.querySelector('input[name="prm-layout"][value="img-bg"]');
      if(r){ r.checked=true; document.querySelectorAll('.prm-layout-card').forEach(function(c){ c.classList.remove('prm-layout-sel'); }); r.closest('.prm-layout-card').classList.add('prm-layout-sel'); }
      renderPreview();
    };
    reader.readAsDataURL(file);
  }

  /* ── 삽입 이미지 로드 ── */
  function loadInsImage(file) {
    var reader=new FileReader();
    reader.onload=function(e){
      _insImages.push({ b64: e.target.result, name: file.name });
      renderInsertImages(); renderPreview();
    };
    reader.readAsDataURL(file);
  }

  /* ══════════════════════════════════════════════
     AI 문구 생성
  ══════════════════════════════════════════════ */
  async function onGenerate() {
    var aiInp=$p('prm-ai-input');
    var inputText=(aiInp&&aiInp.value.trim())||'';
    if(!inputText){ showErr('AI 자동 생성: 홍보할 내용을 오른쪽 입력란에 먼저 입력하세요.'); return; }
    var apiKey=getApiKey();
    if(!apiKey){ showErr('설정 탭 → Claude API 키를 먼저 등록하세요.'); return; }
    var btn=$p('prm-gen-btn');
    btn.disabled=true; btn.innerHTML='<span class="prm-spin"></span>';
    hideErr();
    try {
      var ep=resolveClaudeEndpoint(apiKey);
      var hdrs={'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'};
      if(ep.isOfficial) hdrs['anthropic-dangerous-direct-browser-access']='true';
      var resp=await fetch(ep.url,{method:'POST',headers:hdrs,body:JSON.stringify({
        model:'claude-haiku-4-5-20251001',max_tokens:300,
        system:'아세아항공직업전문학교 공식 홍보 담당자입니다.\n반드시 JSON만 반환하고 다른 텍스트는 포함하지 마세요.\n형식:\n{"title":"20자 이내 제목","body":"80자 이내 본문(줄바꿈 \\n 허용)","tag":"#태그1 #태그2"}',
        messages:[{role:'user',content:'테마: '+_cfg.theme+'\n내용: '+inputText}],
      })});
      if(!resp.ok) throw new Error('API '+resp.status);
      var data=await resp.json();
      var text=(data.content&&data.content[0]&&data.content[0].text)||'';
      var m=text.match(/\{[\s\S]*\}/); if(!m) throw new Error('JSON 없음');
      var p=JSON.parse(m[0]);
      _generated={title:p.title||'',body:p.body||'',tag:p.tag||'',theme:_cfg.theme};
      var ti=$p('prm-title'),bo=$p('prm-body'),ta=$p('prm-tag');
      if(ti) ti.value=_generated.title;
      if(bo) bo.value=_generated.body;
      if(ta) ta.value=_generated.tag;
      renderPreview();
      toast('문구가 생성되었습니다!','success');
    } catch(err){ showErr('생성 실패: '+err.message); }
    finally{ btn.disabled=false; btn.innerHTML='🤖 AI 생성'; }
  }

  /* ══════════════════════════════════════════════
     슬라이드 등록
  ══════════════════════════════════════════════ */
  async function onPublish() {
    if(_publishing) return;
    var gasUrl=getGasUrl();
    if(!gasUrl){ toast('설정 탭 → 홍보슬라이드 설정 → GAS URL을 먼저 등록하세요.','error'); return; }

    var title=($p('prm-title')||{}).value||'';
    var body =($p('prm-body') ||{}).value||'';
    var tag  =($p('prm-tag')  ||{}).value||'';
    if(!title&&!body){ toast('제목 또는 본문을 입력하세요.','error'); return; }

    _publishing=true;
    var pubBtn=$p('prm-publish-btn');
    if(pubBtn){ pubBtn.disabled=true; pubBtn.innerHTML='<span class="prm-spin"></span> 등록 중...'; }

    try {
      var payload={
        title:title, body:body, tag:tag,
        theme:_cfg.theme, bg:getCurrentBg(),
        font:_cfg.font, layout:_cfg.layout,
        bgImage: (_cfg.layout==='img-bg'&&_bgImageB64) ? _bgImageB64 : null,
        insertImages: _insImages.map(function(i){ return {b64:i.b64,name:i.name}; }),
      };
      var resp=await fetch(gasUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      var result=await resp.json();
      if(!resp.ok||result.error) throw new Error(result.error||'GAS 오류 '+resp.status);

      var rec={id:uid(),theme:_cfg.theme,title:title,body:body,tag:tag,
               status:'success',slideLink:result.presentationUrl||null,createdAt:new Date().toISOString()};
      saveHistory(rec);
      toast('슬라이드가 성공적으로 추가되었습니다! 🎉','success');
      _generated=null; _insImages=[];
      ['prm-tag','prm-title','prm-body','prm-ai-input'].forEach(function(id){ var e=$p(id); if(e) e.value=''; });
      renderPreview(); renderHistory(); renderInsertImages();
    } catch(err){
      var rec2={id:uid(),theme:_cfg.theme,title:title,body:body,tag:tag,
                status:'failed',slideLink:null,createdAt:new Date().toISOString()};
      saveHistory(rec2);
      toast('등록 실패: '+err.message,'error'); renderHistory();
    } finally{
      _publishing=false;
      if(pubBtn){ pubBtn.disabled=false; pubBtn.innerHTML='📺 슬라이드에 추가'; }
    }
  }

  function showErr(m){ var e=$p('prm-err'); if(e){ e.textContent=m; e.hidden=false; } }
  function hideErr(){ var e=$p('prm-err'); if(e) e.hidden=true; }

  return { init: init };
})();
