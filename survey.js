// survey.js — 구글 설문지 자동 생성 모듈 v1.0 (2026-06-12)
(function () {
  'use strict';

  var FORMS_API   = 'https://forms.googleapis.com/v1/forms';
  var DRIVE_API   = 'https://www.googleapis.com/drive/v3/files';
  var SK_HISTORY  = 'asea_survey_history';  // 로컬 이력 (폼 ID + 제목)

  /* ── 유틸 ─────────────────────────────────────────── */
  function getToken() {
    return (window.Auth && Auth.getToken && Auth.getToken()) ||
           (window.S && S.accessToken) || '';
  }

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(SK_HISTORY) || '[]'); } catch(e) { return []; }
  }
  function saveHistory(list) {
    try { localStorage.setItem(SK_HISTORY, JSON.stringify(list.slice(0, 50))); } catch(e) {}
  }
  function addHistory(item) {
    var list = loadHistory();
    list.unshift(item);
    saveHistory(list);
  }

  /* ── Claude API로 설문지 구조 생성 ─────────────────── */
  function buildFormStructureWithClaude(prompt) {
    var apiKey = window.CONFIG && CONFIG.anthropicApiKey;
    if (!apiKey) return Promise.reject(new Error('Claude API 키가 설정되지 않았습니다. 설정 탭에서 입력해주세요.'));

    var system = '당신은 Google Forms JSON 구조를 생성하는 전문가입니다.\n' +
      '사용자가 설문지 내용을 설명하면, 다음 JSON 형식으로만 응답하세요 (마크다운, 설명 없이 순수 JSON만):\n' +
      '{\n' +
      '  "title": "설문지 제목",\n' +
      '  "description": "설명 (선택)",\n' +
      '  "questions": [\n' +
      '    { "title": "질문", "type": "RADIO", "required": true, "options": ["선택1","선택2"] },\n' +
      '    { "title": "주관식 질문", "type": "TEXT", "required": false },\n' +
      '    { "title": "체크박스 질문", "type": "CHECKBOX", "required": false, "options": ["항목1","항목2","항목3"] },\n' +
      '    { "title": "점수 질문", "type": "SCALE", "required": false, "low": 1, "high": 5, "lowLabel": "매우 나쁨", "highLabel": "매우 좋음" }\n' +
      '  ]\n' +
      '}\n' +
      '지원 type: TEXT(단답), PARAGRAPH(장문), RADIO(객관식 단일), CHECKBOX(체크박스), SCALE(선형배율), DROP_DOWN(드롭다운)\n' +
      'RADIO/CHECKBOX/DROP_DOWN은 반드시 options 배열 포함. SCALE은 low/high/lowLabel/highLabel 포함.';

    var endpoint = 'https://api.anthropic.com/v1/messages';
    if (apiKey.length === 64 && /^[0-9a-f]+$/i.test(apiKey)) {
      endpoint = 'https://aiapiflow.com/v1/messages';
    }

    return fetch(endpoint, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: system,
        messages: [{ role: 'user', content: prompt }]
      })
    }).then(function(r) { return r.json(); })
      .then(function(data) {
        var text = data.content && data.content[0] && data.content[0].text;
        if (!text) throw new Error('Claude 응답이 없습니다.');
        var jsonStr = text.trim();
        /* 마크다운 코드블록 제거 */
        jsonStr = jsonStr.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
        return JSON.parse(jsonStr);
      });
  }

  /* ── Google Forms API 호출 ──────────────────────────── */
  function apiRequest(method, url, body) {
    var token = getToken();
    if (!token) return Promise.reject(new Error('Google 로그인이 필요합니다.'));
    var opts = {
      method: method,
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw new Error((e.error && e.error.message) || r.statusText); });
      return r.json();
    });
  }

  /* ── 설문지 생성 ────────────────────────────────────── */
  function createForm(structure) {
    /* Step 1: 폼 생성 */
    return apiRequest('POST', FORMS_API, { info: { title: structure.title, documentTitle: structure.title } })
      .then(function(form) {
        var formId = form.formId;
        /* Step 2: 질문 일괄 추가 (batchUpdate) */
        var requests = [];
        if (structure.description) {
          requests.push({ updateFormInfo: { info: { description: structure.description }, updateMask: 'description' } });
        }
        (structure.questions || []).forEach(function(q, idx) {
          var item = { title: q.title, questionItem: { question: { required: !!q.required } } };
          var qt = (q.type || 'TEXT').toUpperCase();
          if (qt === 'TEXT' || qt === 'SHORT_ANSWER') {
            item.questionItem.question.textQuestion = { paragraph: false };
          } else if (qt === 'PARAGRAPH') {
            item.questionItem.question.textQuestion = { paragraph: true };
          } else if (qt === 'RADIO') {
            item.questionItem.question.choiceQuestion = { type: 'RADIO', options: (q.options || []).map(function(o) { return { value: o }; }) };
          } else if (qt === 'CHECKBOX') {
            item.questionItem.question.choiceQuestion = { type: 'CHECKBOX', options: (q.options || []).map(function(o) { return { value: o }; }) };
          } else if (qt === 'DROP_DOWN') {
            item.questionItem.question.choiceQuestion = { type: 'DROP_DOWN', options: (q.options || []).map(function(o) { return { value: o }; }) };
          } else if (qt === 'SCALE') {
            item.questionItem.question.scaleQuestion = { low: q.low || 1, high: q.high || 5, lowLabel: q.lowLabel || '', highLabel: q.highLabel || '' };
          } else {
            item.questionItem.question.textQuestion = { paragraph: false };
          }
          requests.push({ createItem: { item: item, location: { index: idx } } });
        });

        if (!requests.length) return form;
        return apiRequest('POST', FORMS_API + '/' + formId + ':batchUpdate', { requests: requests })
          .then(function() { return form; });
      });
  }

  /* ── Drive에서 내 설문지 목록 조회 ─────────────────── */
  function listMyForms() {
    var token = getToken();
    if (!token) return Promise.reject(new Error('Google 로그인이 필요합니다.'));
    var url = DRIVE_API + '?q=' + encodeURIComponent("mimeType='application/vnd.google-apps.form' and trashed=false") +
      '&fields=files(id,name,createdTime,webViewLink)&orderBy=createdTime desc&pageSize=30';
    return fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      .then(function(r) { return r.json(); })
      .then(function(d) { return d.files || []; });
  }

  /* ── 설문지 응답 요약 ────────────────────────────────── */
  function getResponseCount(formId) {
    var token = getToken();
    if (!token) return Promise.resolve(null);
    return fetch(FORMS_API + '/' + formId + '/responses?pageSize=1',
      { headers: { Authorization: 'Bearer ' + token } })
      .then(function(r) { return r.json(); })
      .then(function(d) { return (d.totalSize !== undefined) ? d.totalSize : (d.responses ? d.responses.length : null); })
      .catch(function() { return null; });
  }

  /* ── UI 렌더 ─────────────────────────────────────────── */
  function renderTab() {
    var root = document.getElementById('survey-root');
    if (!root) return;

    var token = getToken();
    var loggedIn = !!token;

    root.innerHTML =
      '<div class="tab-body">' +
      '<h2 class="section-title">' +
        '<svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>' +
          '<rect x="9" y="3" width="6" height="4" rx="2"/>' +
          '<line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>' +
        '</svg>설문지 자동 생성</h2>' +

      (!loggedIn ?
        '<div class="settings-card" style="text-align:center;padding:32px">' +
        '<p style="margin-bottom:16px;color:#666">Google 계정으로 로그인하면 설문지를 만들고 관리할 수 있습니다.</p>' +
        '<button id="survey-login-btn" class="btn btn-primary">Google 로그인</button>' +
        '</div>' :

        '<div class="settings-card" id="survey-create-card">' +
        '<h3 class="settings-section-title">✨ 새 설문지 만들기</h3>' +
        '<p class="form-hint" style="margin-bottom:10px">어떤 설문지를 만들고 싶은지 자연어로 설명하세요. Claude AI가 자동으로 설계합니다.</p>' +
        '<textarea id="survey-prompt" class="form-input" rows="4" style="resize:vertical" ' +
          'placeholder="예) 신입사원 온보딩 만족도 조사, 항목은 업무환경/교육/팀문화/전반만족도 각각 5점 척도로, 마지막에 자유의견 주관식 포함"></textarea>' +
        '<div style="display:flex;gap:8px;margin-top:10px;align-items:center">' +
          '<button id="survey-generate-btn" class="btn btn-primary">🤖 AI로 설문지 생성</button>' +
          '<span id="survey-status" class="form-hint" style="margin:0"></span>' +
        '</div>' +
        '<div id="survey-preview" style="display:none;margin-top:16px;border:1px solid var(--color-border);border-radius:8px;padding:14px">' +
          '<h4 id="survey-preview-title" style="font-size:15px;font-weight:700;margin-bottom:4px"></h4>' +
          '<p id="survey-preview-desc" class="form-hint" style="margin-bottom:10px"></p>' +
          '<div id="survey-preview-questions"></div>' +
          '<div style="margin-top:14px;display:flex;gap:8px">' +
            '<button id="survey-confirm-btn" class="btn btn-primary">📤 구글 드라이브에 생성</button>' +
            '<button id="survey-edit-btn" class="btn btn-ghost">✏️ 다시 생성</button>' +
          '</div>' +
        '</div>' +
        '</div>' +

        '<div class="settings-card" style="margin-top:16px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
          '<h3 class="settings-section-title" style="margin:0">📂 내 설문지 목록</h3>' +
          '<button id="survey-refresh-btn" class="btn btn-ghost btn-sm">🔄 새로고침</button>' +
        '</div>' +
        '<div id="survey-list"><p class="empty-state">불러오는 중...</p></div>' +
        '</div>'
      ) +
      '</div>';

    if (!loggedIn) {
      var loginBtn = document.getElementById('survey-login-btn');
      if (loginBtn) loginBtn.addEventListener('click', function() {
        if (window.Auth && Auth.login) Auth.login().then(function() { renderTab(); });
      });
      return;
    }

    _bindCreateEvents();
    _loadFormList();
  }

  var _pendingStructure = null;

  function _bindCreateEvents() {
    var genBtn    = document.getElementById('survey-generate-btn');
    var confirmBtn= document.getElementById('survey-confirm-btn');
    var editBtn   = document.getElementById('survey-edit-btn');
    var refreshBtn= document.getElementById('survey-refresh-btn');

    if (genBtn) genBtn.addEventListener('click', function() {
      var prompt = (document.getElementById('survey-prompt').value || '').trim();
      if (!prompt) { _setStatus('❌ 설문지 내용을 입력하세요.'); return; }
      _setStatus('🤖 AI가 설문지를 설계 중...');
      genBtn.disabled = true;
      buildFormStructureWithClaude(prompt)
        .then(function(structure) {
          _pendingStructure = structure;
          _showPreview(structure);
          _setStatus('');
          genBtn.disabled = false;
        })
        .catch(function(err) {
          _setStatus('❌ ' + (err.message || '오류'));
          genBtn.disabled = false;
        });
    });

    if (confirmBtn) confirmBtn.addEventListener('click', function() {
      if (!_pendingStructure) return;
      _setStatus('📤 구글 드라이브에 생성 중...');
      confirmBtn.disabled = true;
      createForm(_pendingStructure)
        .then(function(form) {
          addHistory({ formId: form.formId, title: _pendingStructure.title, createdAt: new Date().toISOString(),
            editUrl: 'https://docs.google.com/forms/d/' + form.formId + '/edit',
            respondUrl: form.responderUri || ('https://docs.google.com/forms/d/' + form.formId + '/viewform') });
          _setStatus('✅ 생성 완료!');
          document.getElementById('survey-preview').style.display = 'none';
          document.getElementById('survey-prompt').value = '';
          _pendingStructure = null;
          confirmBtn.disabled = false;
          setTimeout(function() { _setStatus(''); }, 3000);
          _loadFormList();
        })
        .catch(function(err) {
          _setStatus('❌ ' + (err.message || '생성 실패'));
          confirmBtn.disabled = false;
        });
    });

    if (editBtn) editBtn.addEventListener('click', function() {
      document.getElementById('survey-preview').style.display = 'none';
      _pendingStructure = null;
      _setStatus('');
    });

    if (refreshBtn) refreshBtn.addEventListener('click', _loadFormList);
  }

  function _showPreview(structure) {
    var preview = document.getElementById('survey-preview');
    document.getElementById('survey-preview-title').textContent = structure.title || '';
    document.getElementById('survey-preview-desc').textContent  = structure.description || '';
    var qList = document.getElementById('survey-preview-questions');
    qList.innerHTML = (structure.questions || []).map(function(q, i) {
      var typeLabel = { TEXT:'단답형', PARAGRAPH:'장문형', RADIO:'객관식', CHECKBOX:'체크박스', SCALE:'선형배율', DROP_DOWN:'드롭다운' }[q.type] || q.type;
      var opts = q.options ? '<div style="margin-top:4px;font-size:12px;color:#666">' + q.options.map(function(o) { return '▪ ' + o; }).join('  ') + '</div>' : '';
      var scale = (q.type === 'SCALE') ? '<div style="font-size:12px;color:#666;margin-top:4px">' + (q.low||1) + '~' + (q.high||5) + ' (' + (q.lowLabel||'') + ' → ' + (q.highLabel||'') + ')</div>' : '';
      return '<div style="padding:8px 0;border-bottom:1px solid var(--color-border)">' +
        '<span style="font-size:12px;color:#1a73e8;margin-right:6px">' + (i+1) + '.</span>' +
        '<span style="font-size:13px">' + q.title + '</span>' +
        '<span style="font-size:11px;color:#888;margin-left:6px">[' + typeLabel + (q.required?' *':'') + ']</span>' +
        opts + scale + '</div>';
    }).join('');
    preview.style.display = 'block';
  }

  function _loadFormList() {
    var listEl = document.getElementById('survey-list');
    if (!listEl) return;
    listEl.innerHTML = '<p class="empty-state">불러오는 중...</p>';
    listMyForms()
      .then(function(files) {
        if (!files.length) { listEl.innerHTML = '<p class="empty-state">아직 만든 설문지가 없습니다.</p>'; return; }
        listEl.innerHTML = files.map(function(f) {
          var d = f.createdTime ? new Date(f.createdTime).toLocaleDateString('ko-KR') : '';
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--color-border)">' +
            '<div>' +
              '<div style="font-size:14px;font-weight:600">' + _esc(f.name) + '</div>' +
              '<div style="font-size:12px;color:#888;margin-top:2px">' + d + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:6px">' +
              '<a href="' + f.webViewLink + '" target="_blank" class="btn btn-ghost btn-sm">✏️ 편집</a>' +
              '<a href="https://docs.google.com/forms/d/' + f.id + '/viewform" target="_blank" class="btn btn-secondary btn-sm">📋 응답</a>' +
              '<a href="https://docs.google.com/forms/d/' + f.id + '/viewanalytics" target="_blank" class="btn btn-ghost btn-sm">📊 결과</a>' +
            '</div>' +
          '</div>';
        }).join('');
      })
      .catch(function(err) {
        listEl.innerHTML = '<p class="empty-state" style="color:#dc2626">❌ ' + (err.message || '목록 로드 실패') + '</p>';
      });
  }

  function _setStatus(msg) {
    var el = document.getElementById('survey-status');
    if (el) el.textContent = msg;
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  window.SurveyModule = { renderTab: renderTab };

})();
