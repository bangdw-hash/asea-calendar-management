'use strict';
window.PromoModule = (function () {

  /* ── 테마 설정 ── */
  var THEMES = [
    { id: '홍보', label: '📢 홍보', bg: '#003366', sub: 'promotion' },
    { id: '안내', label: '📋 안내', bg: '#1A5C1A', sub: 'notice'    },
    { id: '행사', label: '🎉 행사', bg: '#7B1F1F', sub: 'event'     },
  ];

  var SK_HISTORY = 'asea_promo_history';

  /* ── 상태 ── */
  var _history      = [];
  var _generated    = null;   // { title, body, tag, theme }
  var _publishing   = false;
  var _inited       = false;

  /* ── 유틸 ── */
  function loadHistory() {
    try { _history = JSON.parse(localStorage.getItem(SK_HISTORY)) || []; } catch(e) { _history = []; }
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
      url: isOfficial
        ? 'https://api.anthropic.com/v1/messages'
        : 'https://api.amplifuse.io/v1/messages',
      isOfficial: isOfficial,
    };
  }

  function uid() { return Date.now() + '_' + Math.random().toString(36).slice(2,6); }

  function pad(n) { return String(n).padStart(2,'0'); }
  function fmtDateTime(iso) {
    var d = new Date(iso);
    return d.getFullYear()+'.'+pad(d.getMonth()+1)+'.'+pad(d.getDate())+' '+
           pad(d.getHours())+':'+pad(d.getMinutes());
  }

  function themeColor(t) {
    var found = THEMES.find(function(x){ return x.id===t; });
    return found ? found.bg : '#003366';
  }

  function $p(id) { return document.getElementById(id); }
  function toast(msg, type) { if (typeof window.toast === 'function') window.toast(msg, type); }

  /* ══════════════════════════════════════════════
     렌더링
  ══════════════════════════════════════════════ */
  function init() {
    if (!_inited) { _inited = true; loadHistory(); }
    render();
  }

  function render() {
    var el = document.getElementById('tab-promo');
    if (!el) return;
    el.innerHTML = htmlPage();
    bindEvents();
    renderHistory();
  }

  /* ── 메인 페이지 HTML ── */
  function htmlPage() {
    var themeRadios = THEMES.map(function(t){
      var checked = !_generated || _generated.theme === t.id ? '' : '';
      return '<label class="prm-radio-label" style="--prm-theme-bg:'+t.bg+'">'+
        '<input type="radio" name="prm-theme" value="'+t.id+'" '+((!_generated && t.id==='홍보')||(_generated&&_generated.theme===t.id)?'checked':'')+'>'+
        '<span class="prm-radio-chip">'+t.label+'</span></label>';
    }).join('');

    var previewHtml = _generated ? htmlPreview(_generated) : htmlEmptyPreview();

    return '<div class="prm-wrap">'+
      '<div class="prm-page-title">📣 홍보 슬라이드 생성</div>'+

      /* 폼 */
      '<div class="prm-card prm-form-card">'+
      '<div class="prm-card-title">✍️ 홍보 내용 입력</div>'+
      '<div class="prm-theme-row">'+themeRadios+'</div>'+
      '<textarea id="prm-input" class="prm-textarea" placeholder="홍보할 내용을 입력하세요.&#10;예) 2026년 항공정비과 신입생 모집 안내, 전형일정 및 지원자격 포함"></textarea>'+
      '<div id="prm-err" class="prm-err" hidden></div>'+
      '<button id="prm-gen-btn" class="prm-btn prm-btn-primary">🤖 문구 생성</button>'+
      '</div>'+

      /* 미리보기 */
      '<div class="prm-card" id="prm-preview-area">'+
      '<div class="prm-card-title">👁️ 슬라이드 미리보기</div>'+
      previewHtml+
      '<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">'+
      '<button id="prm-reset-btn" class="prm-btn prm-btn-ghost" '+ (!_generated?'hidden':'')+'>↺ 초기화</button>'+
      '<button id="prm-publish-btn" class="prm-btn prm-btn-accent" '+(!_generated||_publishing?'disabled':'')+'>'+
      (_publishing?'<span class="prm-spin"></span> 등록 중...':'📺 슬라이드에 추가')+
      '</button>'+
      '</div></div>'+

      /* 이력 */
      '<div class="prm-card">'+
      '<div class="prm-card-title" style="display:flex;justify-content:space-between;align-items:center">'+
      '🕘 최근 등록 이력'+
      '<button id="prm-refresh-btn" class="prm-btn prm-btn-ghost prm-btn-sm">🔄 새로고침</button>'+
      '</div>'+
      '<div id="prm-history-tbl"></div>'+
      '</div>'+
      '</div>';
  }

  /* ── 빈 미리보기 ── */
  function htmlEmptyPreview() {
    return '<div class="prm-empty-preview"><span>문구 생성 후 미리보기가 여기에 표시됩니다</span></div>';
  }

  /* ── 슬라이드 미리보기 카드 ── */
  function htmlPreview(d) {
    if (!d) return htmlEmptyPreview();
    var bg = themeColor(d.theme);
    return '<div class="prm-slide-preview" style="background:'+bg+'" id="prm-slide-card">'+
      '<div class="prm-slide-tag" contenteditable="true" id="prm-ce-tag">'+escHtml(d.tag)+'</div>'+
      '<div class="prm-slide-title" contenteditable="true" id="prm-ce-title">'+escHtml(d.title)+'</div>'+
      '<div class="prm-slide-body" contenteditable="true" id="prm-ce-body">'+escHtml(d.body).replace(/\n/g,'<br>')+'</div>'+
      '</div>'+
      '<p class="prm-hint">제목·본문·태그 텍스트를 클릭하면 직접 수정할 수 있습니다.</p>';
  }

  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── 이력 테이블 ── */
  function renderHistory() {
    var el = $p('prm-history-tbl'); if (!el) return;
    if (!_history.length) {
      el.innerHTML = '<p class="prm-empty-state">등록 이력이 없습니다.</p>'; return;
    }
    var rows = _history.map(function(r){
      var sc = r.status==='success'?'prm-s-ok':r.status==='failed'?'prm-s-fail':'prm-s-pend';
      var sl = r.status==='success'?'✅ 성공':r.status==='failed'?'❌ 실패':'⏳ 대기';
      var slideLink = r.slideLink
        ? '<a href="'+r.slideLink+'" target="_blank" class="prm-link">슬라이드 열기</a>'
        : '-';
      return '<tr>'+
        '<td>'+fmtDateTime(r.createdAt)+'</td>'+
        '<td><span class="prm-theme-dot" style="background:'+themeColor(r.theme)+'"></span>'+r.theme+'</td>'+
        '<td class="prm-td-title">'+escHtml(r.title||'-')+'</td>'+
        '<td><span class="prm-chip '+sc+'">'+sl+'</span></td>'+
        '<td>'+slideLink+'</td>'+
        '</tr>';
    }).join('');
    el.innerHTML = '<div class="prm-tbl-wrap"><table class="prm-tbl">'+
      '<thead><tr><th>일시</th><th>테마</th><th>제목</th><th>상태</th><th>링크</th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table></div>';
  }

  /* ══════════════════════════════════════════════
     이벤트 바인딩
  ══════════════════════════════════════════════ */
  function bindEvents() {
    var genBtn = $p('prm-gen-btn');
    if (genBtn) genBtn.addEventListener('click', onGenerate);

    var pubBtn = $p('prm-publish-btn');
    if (pubBtn) pubBtn.addEventListener('click', onPublish);

    var rstBtn = $p('prm-reset-btn');
    if (rstBtn) rstBtn.addEventListener('click', function(){
      _generated = null; render();
    });

    var refBtn = $p('prm-refresh-btn');
    if (refBtn) refBtn.addEventListener('click', function(){
      loadHistory(); renderHistory();
    });
  }

  /* ── 현재 폼 값 수집 ── */
  function collectForm() {
    var inp    = $p('prm-input');
    var themeR = document.querySelector('input[name="prm-theme"]:checked');
    return {
      inputText: inp ? inp.value.trim() : '',
      theme:     themeR ? themeR.value : '홍보',
    };
  }

  /* ── contentEditable에서 수정된 값 수집 ── */
  function collectPreviewEdits() {
    var tag   = $p('prm-ce-tag');
    var title = $p('prm-ce-title');
    var body  = $p('prm-ce-body');
    return {
      tag:   tag   ? tag.innerText.trim()   : (_generated ? _generated.tag   : ''),
      title: title ? title.innerText.trim() : (_generated ? _generated.title : ''),
      body:  body  ? body.innerText.trim()  : (_generated ? _generated.body  : ''),
    };
  }

  /* ══════════════════════════════════════════════
     Claude API 호출 — 문구 생성
  ══════════════════════════════════════════════ */
  async function onGenerate() {
    var form = collectForm();
    if (!form.inputText) { showErr('홍보 내용을 입력하세요.'); return; }

    var apiKey = getApiKey();
    if (!apiKey) {
      showErr('설정 탭에서 Claude API 키를 먼저 저장해 주세요.');
      return;
    }

    var btn = $p('prm-gen-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="prm-spin"></span> 생성 중...';
    hideErr();

    try {
      var ep = resolveClaudeEndpoint(apiKey);
      var headers = {
        'Content-Type':     'application/json',
        'x-api-key':        apiKey,
        'anthropic-version':'2023-06-01',
      };
      if (ep.isOfficial) headers['anthropic-dangerous-direct-browser-access'] = 'true';

      var resp = await fetch(ep.url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: '아세아항공직업전문학교 공식 홍보 담당자입니다.\n입력 내용을 슬라이드용 홍보문구로 변환하세요.\n반드시 JSON만 반환하고 다른 텍스트는 포함하지 마세요.\n형식:\n{\n  "title": "20자 이내 제목",\n  "body": "80자 이내 본문 (핵심만, 줄바꿈 \\n 허용)",\n  "tag": "#태그1 #태그2"\n}',
          messages: [{
            role: 'user',
            content: '테마: '+form.theme+'\n내용: '+form.inputText,
          }],
        }),
      });

      if (!resp.ok) {
        var errBody = await resp.text();
        throw new Error('API 오류 ' + resp.status + ': ' + errBody.slice(0,200));
      }

      var data = await resp.json();
      var text = (data.content && data.content[0] && data.content[0].text) || '';
      /* JSON 블록 추출 */
      var jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('응답에서 JSON을 찾을 수 없습니다: ' + text.slice(0,100));
      var parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.title) throw new Error('title 필드가 없습니다.');

      _generated = {
        title: parsed.title,
        body:  parsed.body || '',
        tag:   parsed.tag  || '',
        theme: form.theme,
      };

      /* localStorage에 pending 기록 저장 */
      var rec = {
        id:        uid(),
        theme:     form.theme,
        inputText: form.inputText,
        title:     _generated.title,
        body:      _generated.body,
        tag:       _generated.tag,
        status:    'pending',
        slideLink: null,
        createdAt: new Date().toISOString(),
      };
      saveHistory(rec);

      render();
    } catch (err) {
      showErr('문구 생성 실패: ' + err.message);
    } finally {
      var b = $p('prm-gen-btn');
      if (b) { b.disabled = false; b.innerHTML = '🤖 문구 생성'; }
    }
  }

  /* ══════════════════════════════════════════════
     GAS 프록시 호출 — 슬라이드 등록
  ══════════════════════════════════════════════ */
  async function onPublish() {
    if (!_generated || _publishing) return;

    var gasUrl = getGasUrl();
    if (!gasUrl) {
      toast('설정 탭 → 홍보슬라이드 설정에서 GAS 프록시 URL을 먼저 입력하세요.', 'error');
      return;
    }

    /* contentEditable에서 수정된 내용 반영 */
    var edits = collectPreviewEdits();
    var finalData = {
      title: edits.title || _generated.title,
      body:  edits.body  || _generated.body,
      tag:   edits.tag   || _generated.tag,
      theme: _generated.theme,
    };

    _publishing = true;
    render();

    try {
      var resp = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData),
      });

      var result = await resp.json();

      if (!resp.ok || result.error) {
        throw new Error(result.error || 'GAS 응답 오류 ' + resp.status);
      }

      /* 이력 업데이트 — 가장 최근 pending 항목을 success로 */
      var idx = _history.findIndex(function(r){
        return r.status === 'pending' && r.title === finalData.title;
      });
      if (idx >= 0) {
        _history[idx].status    = 'success';
        _history[idx].slideLink = result.presentationUrl || null;
        try { localStorage.setItem(SK_HISTORY, JSON.stringify(_history)); } catch(e) {}
      }

      toast('슬라이드에 성공적으로 추가되었습니다! 🎉', 'success');
      _generated = null;
    } catch (err) {
      /* 이력 failed 처리 */
      var fi = _history.findIndex(function(r){ return r.status==='pending'; });
      if (fi >= 0) {
        _history[fi].status = 'failed';
        try { localStorage.setItem(SK_HISTORY, JSON.stringify(_history)); } catch(e) {}
      }
      toast('슬라이드 등록 실패: ' + err.message, 'error');
    } finally {
      _publishing = false;
      render();
    }
  }

  /* ── 에러 표시 ── */
  function showErr(msg) {
    var el = $p('prm-err'); if (!el) return;
    el.textContent = msg; el.hidden = false;
  }
  function hideErr() {
    var el = $p('prm-err'); if (el) el.hidden = true;
  }

  /* ══════════════════════════════════════════════
     Public API
  ══════════════════════════════════════════════ */
  return { init: init };
})();
