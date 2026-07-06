// draft.js — 기안문 초안 작성 모듈
(function () {
  'use strict';

  var SK_REGS   = 'asea_regulations';      // [{id,name,text,size,addedAt}]
  var SK_USAGE  = 'asea_draft_usage';      // {date:'YYYY-MM-DD', count:N}
  var SK_LIMIT  = 'asea_draft_limit';      // number (일일 제한, 기본 20)

  var MAX_FILES      = 3;
  var MAX_FILE_BYTES = 4 * 1024 * 1024;   // 파일 1개 최대 4MB
  var MAX_IMG_PX     = 1024;               // 이미지 리사이즈 기준
  var DEFAULT_LIMIT  = 20;                 // 일일 기본 제한

  var attachedFiles = [];  // {name, type, content}  content = text or base64

  /* ── 스토리지 ──────────────────────────────────────── */
  function loadRegs()  { try { return JSON.parse(localStorage.getItem(SK_REGS)  || '[]'); } catch(e) { return []; } }
  function saveRegs(d) { try { localStorage.setItem(SK_REGS, JSON.stringify(d)); } catch(e) {} }
  function getLimit()  { var v = parseInt(localStorage.getItem(SK_LIMIT), 10); return isNaN(v) ? DEFAULT_LIMIT : v; }
  function setLimit(n) { localStorage.setItem(SK_LIMIT, String(n)); }

  function getTodayUsage() {
    try {
      var u = JSON.parse(localStorage.getItem(SK_USAGE) || '{}');
      var today = new Date().toISOString().slice(0, 10);
      return (u.date === today) ? (u.count || 0) : 0;
    } catch(e) { return 0; }
  }
  function incTodayUsage() {
    var today = new Date().toISOString().slice(0, 10);
    var count = getTodayUsage() + 1;
    localStorage.setItem(SK_USAGE, JSON.stringify({ date: today, count: count }));
    return count;
  }

  /* ── 유틸 ─────────────────────────────────────────── */
  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + 'KB';
    return (bytes/1024/1024).toFixed(1) + 'MB';
  }
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function $(id) { return document.getElementById(id); }

  /* ── PDF 텍스트 추출 ──────────────────────────────── */
  async function extractPdfText(file) {
    if (!window.pdfjsLib) throw new Error('PDF.js 없음');
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    var buf = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    var text = '';
    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i);
      var tc = await page.getTextContent();
      text += tc.items.map(function(it){ return it.str; }).join(' ') + '\n';
    }
    return text.trim();
  }

  /* ── 이미지 리사이즈 → base64 ────────────────────── */
  function resizeImageToBase64(file) {
    return new Promise(function(resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function() {
        URL.revokeObjectURL(url);
        var w = img.width, h = img.height;
        if (w > MAX_IMG_PX || h > MAX_IMG_PX) {
          var ratio = Math.min(MAX_IMG_PX / w, MAX_IMG_PX / h);
          w = Math.round(w * ratio); h = Math.round(h * ratio);
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var _du = canvas.toDataURL('image/jpeg', 0.85).split(',');
        resolve(_du.length > 1 ? _du[1] : '');
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  /* ══════════════════════════════════════════════════
     기안문 탭 UI
  ══════════════════════════════════════════════════ */
  function renderDraftTab() {
    var root = $('draft-root');
    if (!root) return;
    var usage = getTodayUsage();
    var limit = getLimit();

    root.innerHTML = `
    <div style="max-width:860px;margin:0 auto;padding:16px">

      <!-- 헤더 -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:8px">
        <h2 style="font-size:18px;font-weight:700;color:#1e3a8a;margin:0">📝 기안문 초안 작성</h2>
        <div style="font-size:12px;color:#6b7280;background:#f3f4f6;padding:5px 12px;border-radius:20px">
          오늘 사용: <b id="draft-usage-count">${usage}</b> / ${limit}회
        </div>
      </div>

      <!-- 규정집 안내 -->
      <div id="draft-reg-notice" style="display:none;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;font-size:13px;color:#1e40af;margin-bottom:14px">
        📚 규정집 <span id="draft-reg-count">0</span>개 로드됨 — 기안문 생성 시 자동 참조됩니다.
      </div>

      <!-- 입력 영역 -->
      <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:20px;margin-bottom:14px">
        <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:8px">
          ✏️ 기안 요청 내용 <span style="color:#dc2626">*</span>
        </label>
        <div style="position:relative">
          <textarea id="draft-input" rows="6"
            placeholder="기안문 작성에 필요한 내용을 입력하세요.&#10;예) 교직원 하계 워크숍 개최 계획 공문 작성. 일시: 7월 15일, 장소: 제주도, 참가 인원: 전 교직원"
            style="width:100%;border:1.5px solid #d1d5db;border-radius:8px;padding:12px;font-size:14px;line-height:1.6;resize:vertical;outline:none;font-family:inherit;transition:border .2s"
            onfocus="this.style.borderColor='#1D4ED8'" onblur="this.style.borderColor='#d1d5db'"
          ></textarea>
          <button id="draft-paste-btn" title="클립보드 붙여넣기"
            style="position:absolute;top:8px;right:8px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;color:#374151">
            📋 붙여넣기
          </button>
        </div>

        <!-- 파일 첨부 -->
        <div style="margin-top:12px">
          <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">
            📎 파일 첨부 <span style="font-size:11px;font-weight:400;color:#9ca3af">(최대 ${MAX_FILES}개 · 파일당 ${fmtSize(MAX_FILE_BYTES)} · PDF/이미지)</span>
          </div>
          <div id="draft-dropzone"
            style="border:2px dashed #d1d5db;border-radius:8px;padding:16px;text-align:center;cursor:pointer;transition:border .2s;font-size:13px;color:#9ca3af"
            onclick="document.getElementById('draft-file-input').click()">
            클릭하거나 파일을 여기에 드래그하세요
          </div>
          <input id="draft-file-input" type="file" accept=".pdf,image/*" multiple style="display:none">
          <div id="draft-file-list" style="margin-top:8px"></div>
          <div id="draft-file-err" style="font-size:12px;color:#dc2626;margin-top:4px"></div>
        </div>
      </div>

      <!-- 생성 버튼 -->
      <button id="draft-generate-btn"
        style="width:100%;background:#1D4ED8;color:#fff;border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;transition:background .2s;margin-bottom:20px"
        onmouseover="this.style.background='#1e40af'" onmouseout="this.style.background='#1D4ED8'">
        ✨ 기안문 초안 생성
      </button>

      <!-- 생성 중 표시 -->
      <div id="draft-loading" style="display:none;text-align:center;padding:24px;background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);margin-bottom:14px">
        <div style="font-size:28px;animation:spin 1s linear infinite;display:inline-block">⚙️</div>
        <p style="margin-top:10px;font-size:14px;color:#6b7280" id="draft-loading-msg">기안문 생성 중...</p>
      </div>

      <!-- 출력 에디터 -->
      <div id="draft-output-section" style="display:none;background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden">

        <!-- 워드프로세서 툴바 -->
        <div style="background:#f8fafc;border-bottom:1px solid #e5e7eb;padding:8px 12px;display:flex;gap:4px;flex-wrap:wrap;align-items:center">
          <button onclick="document.execCommand('bold')" title="굵게" style="min-width:32px;height:32px;border:1px solid #d1d5db;border-radius:5px;background:#fff;cursor:pointer;font-weight:700;font-size:14px">B</button>
          <button onclick="document.execCommand('italic')" title="기울임" style="min-width:32px;height:32px;border:1px solid #d1d5db;border-radius:5px;background:#fff;cursor:pointer;font-style:italic;font-size:14px">I</button>
          <button onclick="document.execCommand('underline')" title="밑줄" style="min-width:32px;height:32px;border:1px solid #d1d5db;border-radius:5px;background:#fff;cursor:pointer;text-decoration:underline;font-size:14px">U</button>
          <div style="width:1px;height:24px;background:#d1d5db;margin:0 4px"></div>
          <button onclick="document.execCommand('justifyLeft')" title="왼쪽 정렬" style="min-width:32px;height:32px;border:1px solid #d1d5db;border-radius:5px;background:#fff;cursor:pointer;font-size:13px">≡</button>
          <button onclick="document.execCommand('justifyCenter')" title="가운데 정렬" style="min-width:32px;height:32px;border:1px solid #d1d5db;border-radius:5px;background:#fff;cursor:pointer;font-size:13px">☰</button>
          <button onclick="document.execCommand('justifyRight')" title="오른쪽 정렬" style="min-width:32px;height:32px;border:1px solid #d1d5db;border-radius:5px;background:#fff;cursor:pointer;font-size:13px">≡</button>
          <div style="width:1px;height:24px;background:#d1d5db;margin:0 4px"></div>
          <select onchange="document.execCommand('fontSize',false,this.value);this.value=''"
            style="height:32px;border:1px solid #d1d5db;border-radius:5px;font-size:13px;padding:0 4px;cursor:pointer">
            <option value="">크기</option>
            <option value="1">소</option>
            <option value="3">중</option>
            <option value="5">대</option>
            <option value="7">특대</option>
          </select>
          <div style="width:1px;height:24px;background:#d1d5db;margin:0 4px"></div>
          <button id="draft-copy-btn" title="전체 복사" style="min-width:60px;height:32px;border:1px solid #d1d5db;border-radius:5px;background:#fff;cursor:pointer;font-size:12px;padding:0 8px">📋 복사</button>
          <button id="draft-print-btn" title="인쇄" style="min-width:60px;height:32px;border:1px solid #d1d5db;border-radius:5px;background:#fff;cursor:pointer;font-size:12px;padding:0 8px">🖨️ 인쇄</button>
          <button id="draft-reset-btn" title="새로 작성" style="min-width:60px;height:32px;border:1px solid #e5e7eb;border-radius:5px;background:#f9fafb;cursor:pointer;font-size:12px;padding:0 8px;margin-left:auto;color:#6b7280">✕ 닫기</button>
        </div>

        <!-- 에디터 본문 -->
        <div id="draft-editor" contenteditable="true"
          style="min-height:420px;padding:32px 40px;font-size:14px;line-height:1.8;outline:none;font-family:'맑은 고딕','Noto Sans KR',sans-serif;color:#1f2937;white-space:pre-wrap">
        </div>
      </div>

    </div>
    <style>
      @keyframes spin { to { transform:rotate(360deg); } }
      #draft-editor:focus { outline: none; }
    </style>`;

    bindDraftEvents();
    updateRegNotice();
  }

  function updateRegNotice() {
    var regs = loadRegs();
    var notice = $('draft-reg-notice');
    var cnt = $('draft-reg-count');
    if (!notice) return;
    if (regs.length > 0) {
      notice.style.display = 'block';
      if (cnt) cnt.textContent = regs.length;
    } else {
      notice.style.display = 'none';
    }
  }

  function renderFileList() {
    var el = $('draft-file-list');
    if (!el) return;
    if (!attachedFiles.length) { el.innerHTML = ''; return; }
    el.innerHTML = attachedFiles.map(function(f, i) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-top:4px;font-size:13px">' +
        '<span>' + (f.type === 'pdf' ? '📄' : '🖼️') + '</span>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(f.name) + '</span>' +
        '<span style="color:#9ca3af;font-size:11px">' + (f.type === 'pdf' ? 'PDF' : '이미지') + '</span>' +
        '<button onclick="DraftModule.removeFile(' + i + ')" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:16px;padding:0 2px">✕</button>' +
      '</div>';
    }).join('');
  }

  /* ── 파일 처리 ───────────────────────────────────── */
  async function handleFiles(files) {
    var err = $('draft-file-err');
    err.textContent = '';
    var arr = Array.from(files);

    for (var i = 0; i < arr.length; i++) {
      var file = arr[i];
      if (attachedFiles.length >= MAX_FILES) {
        err.textContent = '파일은 최대 ' + MAX_FILES + '개까지 첨부할 수 있습니다.';
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        err.textContent = '"' + file.name + '" 파일이 ' + fmtSize(MAX_FILE_BYTES) + '를 초과합니다.';
        continue;
      }
      var isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      var isImg = file.type.startsWith('image/');
      if (!isPdf && !isImg) {
        err.textContent = 'PDF 또는 이미지 파일만 첨부할 수 있습니다.';
        continue;
      }
      var zone = $('draft-dropzone');
      if (zone) zone.textContent = '처리 중...';
      try {
        if (isPdf) {
          var text = await extractPdfText(file);
          attachedFiles.push({ name: file.name, type: 'pdf', content: text });
        } else {
          var b64 = await resizeImageToBase64(file);
          var mtype = file.type || 'image/jpeg';
          attachedFiles.push({ name: file.name, type: 'image', content: b64, mediaType: mtype });
        }
      } catch(e) {
        err.textContent = '"' + file.name + '" 처리 실패: ' + e.message;
      }
    }
    if ($('draft-dropzone')) $('draft-dropzone').textContent = '클릭하거나 파일을 여기에 드래그하세요';
    renderFileList();
  }

  /* ── Claude API 호출 ─────────────────────────────── */
  async function generateDraft() {
    var input = ($('draft-input') || {}).value || '';
    if (!input.trim()) { alert('기안 요청 내용을 입력해 주세요.'); return; }

    var _cc = window.getClaudeConfig ? getClaudeConfig() : { apiKey: (window.CONFIG && CONFIG.anthropicApiKey) || localStorage.getItem('asea_anthropic_api_key') || '', endpoint: 'https://api.anthropic.com/v1/messages', isOfficial: true };
    var apiKey = _cc.apiKey;
    if (!apiKey) { alert('관리자에게 API 키 설정을 요청하세요.'); return; }

    var usage = getTodayUsage();
    var limit = getLimit();
    if (usage >= limit) {
      alert('오늘 사용 한도(' + limit + '회)에 도달했습니다.\n내일 다시 이용하거나 관리자에게 문의하세요.');
      return;
    }

    // UI 상태 전환
    $('draft-generate-btn').disabled = true;
    $('draft-loading').style.display = 'block';
    $('draft-output-section').style.display = 'none';
    $('draft-loading-msg').textContent = '기안문 생성 중...';

    try {
      // 시스템 프롬프트: 규정집 컨텍스트
      var regs = loadRegs();
      var regContext = regs.length
        ? '=== 아세아항공직업전문학교 규정집 ===\n' + regs.map(function(r){ return '【' + r.name + '】\n' + r.text; }).join('\n\n') + '\n\n'
        : '';

      var systemPrompt = regContext +
        '당신은 아세아항공직업전문학교 행정 담당자입니다.\n' +
        '요청에 따라 공문/기안문 초안을 작성합니다.\n' +
        '\n' +
        '=== 출력 형식 규칙 (반드시 준수) ===\n' +
        '1. 마크다운 기호 완전 금지: **, *, #, ##, ###, --(구분선), > 등 일절 사용 금지\n' +
        '2. 불릿 기호(- · • ◦) 사용 금지 — 번호 체계만 사용\n' +
        '3. 출력 결과는 바로 문서에 붙여넣을 수 있는 순수 텍스트\n' +
        '4. 항목 간 빈 줄은 단락 구분에만 최소한으로 사용\n' +
        '\n' +
        '=== 공문서 번호 체계 (반드시 준수) ===\n' +
        '대항목  : 1.  2.  3.\n' +
        '중항목  : 가.  나.  다.\n' +
        '소항목  : (1)  (2)  (3)\n' +
        '세항목  : (가)  (나)  (다)\n' +
        '들여쓰기: 대→중 2칸, 중→소 2칸, 소→세 2칸\n' +
        '\n' +
        '=== 기안문 구성 순서 ===\n' +
        '제목\n' +
        '수신: [수신처]\n' +
        '참조: [참조처] (해당 시)\n' +
        '\n' +
        '1. 관련근거\n' +
        '  가. [관련 법령·규정·지침 등]\n' +
        '  나. [추가 근거] (해당 시)\n' +
        '\n' +
        '2. 위 관련에 따라 아래와 같이 [내용 요약]합니다.\n' +
        '  가. [첫 번째 사항]\n' +
        '  나. [두 번째 사항]\n' +
        '    (1) [세부 사항]\n' +
        '    (2) [세부 사항]\n' +
        '\n' +
        '붙임  1. [붙임 서류명] 1부. (해당 시)\n' +
        '\n' +
        '문체: 공문서체(~함, ~임), 간결하고 명확하게\n' +
        '규정집이 제공된 경우 관련 조항을 1. 관련근거 항목에 반드시 인용하세요.';

      // 사용자 메시지 구성 (텍스트 + 파일)
      var userContent = [];

      // 이미지 파일 먼저
      attachedFiles.filter(function(f){ return f.type === 'image'; }).forEach(function(f) {
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: f.mediaType || 'image/jpeg', data: f.content }
        });
      });

      // PDF 텍스트
      var pdfTexts = attachedFiles.filter(function(f){ return f.type === 'pdf'; })
        .map(function(f){ return '=== 첨부 파일: ' + f.name + ' ===\n' + f.content; }).join('\n\n');

      var userText = '다음 내용으로 기안문 초안을 작성해 주세요:\n\n' + input.trim();
      if (pdfTexts) userText += '\n\n' + pdfTexts;
      userContent.push({ type: 'text', text: userText });

      // API 호출
      var endpoint   = _cc.endpoint;
      var isOfficial = _cc.isOfficial;
      var headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      };
      if (isOfficial) headers['anthropic-dangerous-direct-browser-access'] = 'true';

      var resp = await window.claudeFetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userContent }]
        })
      });

      if (!resp.ok) {
        var errBody = await resp.text();
        throw new Error('API 오류 ' + resp.status + ': ' + errBody.slice(0, 200));
      }

      var data = await resp.json();
      var result = window.claudeExtractText ? window.claudeExtractText(data) : ((data.content && data.content[0] && data.content[0].text) || '');
      if (!result) throw new Error('응답이 비어 있습니다.' + (data.error ? ' (' + (data.error.message || JSON.stringify(data.error).slice(0,80)) + ')' : ''));

      // 사용량 증가
      var newCount = incTodayUsage();
      var usageEl = $('draft-usage-count');
      if (usageEl) usageEl.textContent = newCount;

      // 에디터에 결과 표시
      var editor = $('draft-editor');
      editor.innerHTML = result.replace(/\n/g, '<br>');

      $('draft-loading').style.display = 'none';
      $('draft-output-section').style.display = 'block';
      editor.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch(e) {
      $('draft-loading').style.display = 'none';
      alert('생성 실패: ' + e.message);
    } finally {
      $('draft-generate-btn').disabled = false;
    }
  }

  /* ── 이벤트 바인딩 ───────────────────────────────── */
  function bindDraftEvents() {
    // 클립보드 붙여넣기
    var pasteBtn = $('draft-paste-btn');
    if (pasteBtn) pasteBtn.addEventListener('click', async function() {
      try {
        var text = await navigator.clipboard.readText();
        var ta = $('draft-input');
        var pos = ta.selectionStart;
        ta.value = ta.value.slice(0, pos) + text + ta.value.slice(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = pos + text.length;
        ta.focus();
      } catch(e) { alert('클립보드 접근 권한이 필요합니다. 직접 Ctrl+V로 붙여넣기 해주세요.'); }
    });

    // 파일 선택
    var fileInput = $('draft-file-input');
    if (fileInput) fileInput.addEventListener('change', function() {
      handleFiles(this.files);
      this.value = '';
    });

    // 드래그 앤 드롭
    var zone = $('draft-dropzone');
    if (zone) {
      zone.addEventListener('dragover', function(e) { e.preventDefault(); this.style.borderColor = '#1D4ED8'; this.style.background = '#eff6ff'; });
      zone.addEventListener('dragleave', function() { this.style.borderColor = '#d1d5db'; this.style.background = ''; });
      zone.addEventListener('drop', function(e) {
        e.preventDefault(); this.style.borderColor = '#d1d5db'; this.style.background = '';
        handleFiles(e.dataTransfer.files);
      });
    }

    // 생성 버튼
    var genBtn = $('draft-generate-btn');
    if (genBtn) genBtn.addEventListener('click', generateDraft);

    // 복사
    var copyBtn = $('draft-copy-btn');
    if (copyBtn) copyBtn.addEventListener('click', function() {
      var editor = $('draft-editor');
      var range = document.createRange();
      range.selectNodeContents(editor);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('copy');
      sel.removeAllRanges();
      this.textContent = '✅ 복사됨';
      setTimeout(function() { copyBtn.textContent = '📋 복사'; }, 1500);
    });

    // 인쇄
    var printBtn = $('draft-print-btn');
    if (printBtn) printBtn.addEventListener('click', function() {
      var content = $('draft-editor').innerHTML;
      var win = window.open('', '_blank');
      win.document.write('<html><head><title>기안문</title><style>body{font-family:"맑은 고딕","Noto Sans KR",sans-serif;font-size:14px;line-height:1.8;padding:40px;color:#1f2937}@media print{body{padding:20mm}}</style></head><body>' + content + '</body></html>');
      win.document.close();
      win.print();
    });

    // 닫기
    var resetBtn = $('draft-reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', function() {
      $('draft-output-section').style.display = 'none';
    });
  }

  /* ══════════════════════════════════════════════════
     관리자 패널 — 규정집 관리 섹션
  ══════════════════════════════════════════════════ */
  function htmlRegulationsAdmin() {
    var regs = loadRegs();
    var limit = getLimit();
    var html = '<div class="admin-section">' +
      '<h3 class="admin-sec-title">📚 규정집 관리</h3>' +
      '<p class="form-hint" style="margin-bottom:12px">업로드한 규정집 PDF 텍스트는 기안문 생성 시 자동으로 참조됩니다. (텍스트 추출 가능한 PDF만 지원)</p>';

    // 일일 제한 설정
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">' +
      '<label style="font-size:13px;font-weight:600;color:#374151">일일 생성 제한:</label>' +
      '<input type="number" id="reg-daily-limit" value="' + limit + '" min="1" max="100" style="width:70px;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">' +
      '<button id="reg-limit-save-btn" class="btn btn-primary btn-sm">저장</button>' +
      '<span style="font-size:12px;color:#9ca3af">현재 ' + limit + '회/일</span>' +
    '</div>';

    // 업로드
    html += '<div style="margin-bottom:14px">' +
      '<label id="reg-upload-label" style="display:inline-flex;align-items:center;gap:6px;background:#1D4ED8;color:#fff;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">' +
      '📤 PDF 파일 추가<input type="file" id="reg-file-input" accept=".pdf" multiple style="display:none"></label>' +
      '<span id="reg-upload-status" style="font-size:12px;color:#6b7280;margin-left:10px"></span>' +
    '</div>';

    // 목록
    html += '<div id="reg-list">';
    if (!regs.length) {
      html += '<p style="font-size:13px;color:#9ca3af;padding:12px 0">등록된 규정집이 없습니다.</p>';
    } else {
      regs.forEach(function(r) {
        html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px">' +
          '<span style="font-size:20px">📄</span>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;font-weight:600;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.name) + '</div>' +
            '<div style="font-size:11px;color:#9ca3af">' + fmtSize(r.size) + ' · ' + new Date(r.addedAt).toLocaleDateString('ko-KR') + ' · 텍스트 ' + r.text.length.toLocaleString() + '자</div>' +
          '</div>' +
          '<button onclick="DraftModule.deleteReg(\'' + r.id + '\')" style="background:none;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px">삭제</button>' +
        '</div>';
      });
    }
    html += '</div></div>';
    return html;
  }

  function bindRegAdminEvents() {
    var fileInput = $('reg-file-input');
    if (!fileInput) return;
    fileInput.addEventListener('change', async function() {
      var status = $('reg-upload-status');
      var files = Array.from(this.files);
      if (!files.length) return;
      status.textContent = '처리 중...';
      var regs = loadRegs();
      var added = 0;
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        try {
          var text = await extractPdfText(file);
          if (!text || text.length < 10) throw new Error('텍스트 추출 실패');
          var id = Date.now().toString(36) + Math.random().toString(36).slice(2,6);
          regs.push({ id: id, name: file.name, text: text, size: file.size, addedAt: new Date().toISOString() });
          added++;
        } catch(e) {
          status.textContent = '"' + file.name + '" 실패: ' + e.message;
        }
      }
      saveRegs(regs);
      status.textContent = added + '개 추가 완료';
      this.value = '';
      // 섹션 재렌더
      if (window.AdminModule && AdminModule._renderSection) AdminModule._renderSection('regulations');
    });

    var limitBtn = $('reg-limit-save-btn');
    if (limitBtn) limitBtn.addEventListener('click', function() {
      var v = parseInt($('reg-daily-limit').value, 10);
      if (isNaN(v) || v < 1) { alert('1 이상의 숫자를 입력하세요.'); return; }
      setLimit(v);
      if (window.toast) toast('일일 제한이 ' + v + '회로 저장되었습니다.', 'success');
      if (window.AdminModule && AdminModule._renderSection) AdminModule._renderSection('regulations');
    });
  }

  /* ── 공개 API ─────────────────────────────────────── */
  window.DraftModule = {
    init: function() {
      var panel = $('draft-root');
      if (!panel) return;
      // 탭 전환 시 렌더
      var observer = new MutationObserver(function() {
        var section = panel.closest('.tab-panel');
        if (section && !section.hidden && !$('draft-generate-btn')) {
          renderDraftTab();
          attachedFiles = [];
        }
      });
      var section = panel.closest('.tab-panel');
      if (section) observer.observe(section, { attributes: true, attributeFilter: ['hidden'] });
    },
    removeFile: function(idx) {
      attachedFiles.splice(idx, 1);
      renderFileList();
    },
    deleteReg: function(id) {
      if (!confirm('규정집을 삭제할까요?')) return;
      saveRegs(loadRegs().filter(function(r){ return r.id !== id; }));
      if (window.AdminModule && AdminModule._renderSection) AdminModule._renderSection('regulations');
    },
    htmlAdmin: htmlRegulationsAdmin,
    bindAdmin: bindRegAdminEvents,
    renderTab: renderDraftTab
  };

})();
