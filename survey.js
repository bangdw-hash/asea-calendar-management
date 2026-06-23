// survey.js — 구글 설문지 자동 생성 모듈 v1.0 (2026-06-12)
(function () {
  'use strict';

  var FORMS_API   = 'https://forms.googleapis.com/v1/forms';
  var DRIVE_API   = 'https://www.googleapis.com/drive/v3/files';
  var SK_HISTORY  = 'asea_survey_history';  // 로컬 이력 (폼 ID + 제목)

  /* ── 유틸 ─────────────────────────────────────────── */
  function _loadStaffMenus() {
    try { return JSON.parse(localStorage.getItem('asea_staff_menus') || 'null'); } catch(e) { return null; }
  }

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

  /* ── 편집 이력(드래프트) — 계정별 클라우드 저장(Supabase app_submissions, kind=survey_draft) ──
     구글 드라이브에 올리기 전의 편집 내역을 보관 → 다른 단말에서 조회·이어편집·복제 가능 */
  function _uid() { return 'sd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function _email() { try { return localStorage.getItem('asea_user_email') || ''; } catch (e) { return ''; } }
  function _draftSave(draft) {
    draft.updatedAt = new Date().toISOString();
    if (!(window.CloudForms && CloudForms.save) || !_email()) return Promise.resolve({ ok: false });
    return CloudForms.save('survey_draft', draft.id, draft.title || '설문 초안', draft.formId ? 'created' : 'draft',
      { email: _email(), id: draft.id, title: draft.title, structure: draft.structure, formId: draft.formId || '', createdAt: draft.createdAt || '', updatedAt: draft.updatedAt });
  }
  function _draftList(cb) {
    if (!(window.CloudForms && CloudForms.list) || !_email()) { cb([]); return; }
    CloudForms.list('survey_draft').then(function (res) {
      var em = _email();
      var rows = (res.rows || []).map(function (r) { return r.data; })
        .filter(function (d) { return d && d.email === em && !d.deleted; });
      rows.sort(function (a, b) { return (b.updatedAt || '') < (a.updatedAt || '') ? -1 : 1; });
      cb(rows);
    }).catch(function () { cb([]); });
  }
  function _draftDelete(id, title, cb) {
    if (!(window.CloudForms && CloudForms.save)) { cb && cb(); return; }
    CloudForms.save('survey_draft', id, title || '', 'deleted', { email: _email(), id: id, deleted: true, updatedAt: new Date().toISOString() })
      .then(function () { cb && cb(); }).catch(function () { cb && cb(); });
  }

  /* ── Claude API로 설문지 구조 생성 ─────────────────── */
  function buildFormStructureWithClaude(prompt) {
    /* 1) 내 localStorage  2) 관리자가 게시한 staff-menus.json 순으로 키 탐색 */
    var _cc = window.getClaudeConfig ? getClaudeConfig() : { apiKey: (window.CONFIG && CONFIG.anthropicApiKey) || localStorage.getItem('asea_anthropic_api_key') || '', endpoint: 'https://api.anthropic.com/v1/messages', isOfficial: true };
    var apiKey     = _cc.apiKey;
    if (!apiKey) return Promise.reject(new Error('Claude API 키가 설정되지 않았습니다. 관리자에게 문의하세요.'));

    var endpoint   = _cc.endpoint;
    var isOfficial = _cc.isOfficial;
    var headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    };
    if (isOfficial) headers['anthropic-dangerous-direct-browser-access'] = 'true';

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
      '지원 type: TEXT(단답), PARAGRAPH(장문), RADIO(객관식 단일), CHECKBOX(체크박스), SCALE(선형배율), DROP_DOWN(드롭다운), SECTION(섹션·페이지 나눔), TEXT_BLOCK(설명 텍스트)\n' +
      'RADIO/CHECKBOX/DROP_DOWN은 반드시 options 배열 포함. SCALE은 low/high/lowLabel/highLabel 포함.\n' +
      'SECTION/TEXT_BLOCK은 { "title":"...", "type":"SECTION", "description":"..." } 형식(설명 페이지·구획 나눔용). 설문이 길면 적절히 SECTION으로 단계를 나누고, 맨 앞에 TEXT_BLOCK으로 간단한 안내문을 넣어도 좋습니다.\n' +
      '질문은 핵심 위주로 적정 개수(보통 8~16개)로 작성하고, 반드시 "완결된 JSON"만 출력하세요(모든 괄호·따옴표를 끝까지 닫을 것).';

    return fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
        system: system,
        messages: [{ role: 'user', content: prompt }]
      })
    }).then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) throw new Error(data.error.message || 'API 오류');
        var text = data.content && data.content[0] && data.content[0].text;
        if (!text) throw new Error('Claude 응답이 없습니다.');
        return _parseFormJson(text);
      });
  }

  /* AI 응답 JSON 파싱 — 마크다운 제거 + 잘린(truncated) 응답 복구 */
  function _parseFormJson(text) {
    var s = String(text || '').trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    var a = s.indexOf('{'); if (a > 0) s = s.slice(a);
    try { return JSON.parse(s); } catch (e) {}
    // 복구: 끝쪽 '}' 위치를 줄여가며 questions 배열을 닫아 본다
    var suffixes = ['', ']}', '}', '"}]}', '"}]} '];
    var i = s.length;
    for (var k = 0; k < 40; k++) {
      i = s.lastIndexOf('}', i - 1);
      if (i <= 0) break;
      var cand = s.slice(0, i + 1);
      for (var j = 0; j < suffixes.length; j++) {
        try {
          var obj = JSON.parse(cand + suffixes[j]);
          if (obj && obj.questions) return obj;
        } catch (_) {}
      }
    }
    throw new Error('AI 응답이 너무 길어 일부가 잘렸습니다. 설명을 조금 더 간단히 하거나 다시 시도해 주세요.');
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
        var loc = 0;
        (structure.questions || []).forEach(function(q) {
          var qt = (q.type || 'TEXT').toUpperCase();
          if (!q.title && qt !== 'TEXT_BLOCK') q.title = '(제목 없음)';
          var item;
          if (qt === 'SECTION') {
            // 섹션(페이지 나눔) — 구글폼의 '섹션 추가'
            item = { title: q.title || '섹션', description: q.description || '', pageBreakItem: {} };
          } else if (qt === 'TEXT_BLOCK') {
            // 설명 텍스트(소개/안내 블록)
            item = { title: q.title || '', description: q.description || '', textItem: {} };
          } else {
            item = { title: q.title, questionItem: { question: { required: !!q.required } } };
            if (qt === 'TEXT' || qt === 'SHORT_ANSWER') {
              item.questionItem.question.textQuestion = { paragraph: false };
            } else if (qt === 'PARAGRAPH') {
              item.questionItem.question.textQuestion = { paragraph: true };
            } else if (qt === 'RADIO' || qt === 'CHECKBOX' || qt === 'DROP_DOWN') {
              item.questionItem.question.choiceQuestion = { type: qt, options: (q.options || []).filter(function (o) { return (o || '').trim(); }).map(function(o) { return { value: o }; }) };
            } else if (qt === 'SCALE') {
              item.questionItem.question.scaleQuestion = { low: q.low || 1, high: q.high || 5, lowLabel: q.lowLabel || '', highLabel: q.highLabel || '' };
            } else {
              item.questionItem.question.textQuestion = { paragraph: false };
            }
          }
          requests.push({ createItem: { item: item, location: { index: loc++ } } });
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
        '<div id="survey-preview" style="display:none;margin-top:16px"></div>' +
        '</div>' +

        '<div class="settings-card" style="margin-top:16px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<h3 class="settings-section-title" style="margin:0">📝 편집 이력 (클라우드)</h3>' +
          '<button id="survey-draft-refresh" class="btn btn-ghost btn-sm">🔄 새로고침</button>' +
        '</div>' +
        '<p class="form-hint" style="margin:0 0 10px">구글 드라이브에 올리기 전의 편집 내역이 <b>로그인 계정별로 클라우드에 저장</b>되어 어느 단말에서나 조회됩니다. 불러와 이어 편집하거나, <b>복제</b>해 새 설문으로 만들 수 있어요(예: 1학기 → 2학기).</p>' +
        '<div id="survey-draft-list"><p class="empty-state">불러오는 중...</p></div>' +
        '</div>' +

        '<div class="settings-card" style="margin-top:16px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
          '<h3 class="settings-section-title" style="margin:0">📂 내 설문지 목록 (구글 드라이브)</h3>' +
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
    _loadDraftList();
    var dref = document.getElementById('survey-draft-refresh');
    if (dref) dref.addEventListener('click', _loadDraftList);
  }

  /* 편집 이력(드래프트) 목록 렌더 */
  function _loadDraftList() {
    var el = document.getElementById('survey-draft-list');
    if (!el) return;
    el.innerHTML = '<p class="empty-state">불러오는 중...</p>';
    _draftList(function (rows) {
      if (!rows.length) { el.innerHTML = '<p class="empty-state">저장된 편집 이력이 없습니다. 편집기에서 「💾 편집 이력 저장」을 눌러 보관하세요.</p>'; return; }
      el.innerHTML = rows.map(function (d) {
        var when = d.updatedAt ? new Date(d.updatedAt).toLocaleString('ko-KR') : '';
        var qn = (d.structure && d.structure.questions) ? d.structure.questions.filter(function (q) { return q.type !== 'SECTION' && q.type !== 'TEXT_BLOCK'; }).length : 0;
        var made = d.formId ? '<span style="font-size:11px;color:#188038;margin-left:6px">· 생성됨</span>' : '';
        return '<div class="sv-draft" data-id="' + _esc(d.id) + '">' +
          '<div class="sv-draft-info"><div class="sv-draft-title">' + _esc(d.title || '(제목 없음)') + made + '</div>' +
            '<div class="sv-draft-meta">질문 ' + qn + '개 · 수정 ' + _esc(when) + '</div></div>' +
          '<div class="sv-draft-btns">' +
            '<button class="btn btn-secondary btn-sm" data-dact="edit">이어서 편집</button>' +
            '<button class="btn btn-ghost btn-sm" data-dact="dup">📑 복제하여 새 설문</button>' +
            (d.formId ? '<a class="btn btn-ghost btn-sm" href="https://docs.google.com/forms/d/' + _esc(d.formId) + '/edit" target="_blank">구글폼 열기</a>' : '') +
            '<button class="btn btn-ghost btn-sm" data-dact="del" style="color:#dc2626">삭제</button>' +
          '</div></div>';
      }).join('');
      el.querySelectorAll('.sv-draft').forEach(function (row) {
        var id = row.getAttribute('data-id');
        var d = rows.filter(function (x) { return x.id === id; })[0]; if (!d) return;
        row.querySelectorAll('[data-dact]').forEach(function (b) {
          b.addEventListener('click', function () {
            var act = b.getAttribute('data-dact');
            if (act === 'edit') { _openDraft(d, false); }
            else if (act === 'dup') { _openDraft(d, true); }
            else if (act === 'del') { if (confirm('이 편집 이력을 삭제할까요?')) _draftDelete(d.id, d.title, _loadDraftList); }
          });
        });
      });
    });
  }
  /* 드래프트를 편집기로 로드. dup=true 면 새 id로 복제(원본 보존) */
  function _openDraft(d, dup) {
    var st = _normalize(JSON.parse(JSON.stringify(d.structure || { questions: [] })));
    if (dup) { st._draftId = _uid(); st.title = (st.title || '설문') + ' (사본)'; st._formId = ''; }
    else { st._draftId = d.id; st._formId = d.formId || ''; }
    _pendingStructure = st;
    _renderEditor();
    _setStatus(dup ? '복제본을 불러왔습니다. 제목/내용을 바꾼 뒤 「💾 편집 이력 저장」 하면 새 이력으로 남습니다.' : '편집 이력을 불러왔습니다.');
    var card = document.getElementById('survey-create-card');
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  var _pendingStructure = null;

  function _bindCreateEvents() {
    var genBtn    = document.getElementById('survey-generate-btn');
    var refreshBtn= document.getElementById('survey-refresh-btn');

    if (genBtn) genBtn.addEventListener('click', function() {
      var prompt = (document.getElementById('survey-prompt').value || '').trim();
      if (!prompt) { _setStatus('❌ 설문지 내용을 입력하세요.'); return; }
      _setStatus('🤖 AI가 설문지를 설계 중...');
      genBtn.disabled = true;
      buildFormStructureWithClaude(prompt)
        .then(function(structure) {
          _pendingStructure = _normalize(structure);
          _renderEditor();
          _setStatus('초안이 생성됐습니다. 아래에서 자유롭게 편집한 뒤 「구글 드라이브에 생성」을 누르세요.');
          genBtn.disabled = false;
        })
        .catch(function(err) {
          _setStatus('❌ ' + (err.message || '오류'));
          genBtn.disabled = false;
        });
    });

    if (refreshBtn) refreshBtn.addEventListener('click', _loadFormList);
  }

  /* 구조 정규화 — 누락 필드 보정 */
  function _normalize(st) {
    st = st || {};
    st.title = st.title || '새 설문지';
    st.description = st.description || '';
    st.questions = (st.questions || []).map(function (q) {
      q = q || {};
      q.type = (q.type || 'TEXT').toUpperCase();
      q.title = q.title || '';
      q.required = !!q.required;
      if (q.type === 'RADIO' || q.type === 'CHECKBOX' || q.type === 'DROP_DOWN') {
        q.options = (q.options && q.options.length) ? q.options : ['옵션 1', '옵션 2'];
      }
      if (q.type === 'SCALE') { q.low = q.low || 1; q.high = q.high || 5; q.lowLabel = q.lowLabel || ''; q.highLabel = q.highLabel || ''; }
      if (q.type === 'SECTION' || q.type === 'TEXT_BLOCK') { q.description = q.description || ''; }
      return q;
    });
    return st;
  }

  /* ── 편집 가능한 설문 에디터 (구글폼 편집창 형태) ───────────── */
  var TYPES = [
    ['TEXT', '단답형'], ['PARAGRAPH', '장문형'], ['RADIO', '객관식 (단일선택)'],
    ['CHECKBOX', '체크박스 (복수선택)'], ['DROP_DOWN', '드롭다운'], ['SCALE', '선형배율(점수)'],
    ['SECTION', '── 섹션 (페이지 나눔)'], ['TEXT_BLOCK', '설명 텍스트']
  ];
  function _typeSelect(q, i) {
    return '<select class="sv-type" data-i="' + i + '">' +
      TYPES.map(function (t) { return '<option value="' + t[0] + '"' + (q.type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') +
      '</select>';
  }
  function _cardHTML(q, i, qnum) {
    var isSection = q.type === 'SECTION', isText = q.type === 'TEXT_BLOCK';
    var head;
    if (isSection) {
      head = '<div class="sv-tag sv-tag-section">섹션</div>' +
        '<input class="sv-title" data-i="' + i + '" data-f="title" value="' + _attr(q.title) + '" placeholder="섹션 제목 (예: 1부. 기본 정보)">' + _typeSelect(q, i);
    } else if (isText) {
      head = '<div class="sv-tag sv-tag-text">설명</div>' +
        '<input class="sv-title" data-i="' + i + '" data-f="title" value="' + _attr(q.title) + '" placeholder="안내 문구 제목">' + _typeSelect(q, i);
    } else {
      head = '<span class="sv-num">' + qnum + '.</span>' +
        '<input class="sv-title" data-i="' + i + '" data-f="title" value="' + _attr(q.title) + '" placeholder="질문을 입력하세요">' + _typeSelect(q, i);
    }
    var body = '';
    if (isSection || isText) {
      body = '<textarea class="sv-desc" data-i="' + i + '" data-f="description" rows="2" placeholder="' + (isSection ? '섹션 설명(선택)' : '표시할 설명 문구') + '">' + _esc(q.description || '') + '</textarea>';
    } else if (q.type === 'RADIO' || q.type === 'CHECKBOX' || q.type === 'DROP_DOWN') {
      body = '<div class="sv-opts">' + (q.options || []).map(function (o, oi) {
        return '<div class="sv-opt"><span class="sv-opt-mk"></span>' +
          '<input class="sv-opt-in" data-i="' + i + '" data-oi="' + oi + '" value="' + _attr(o) + '" placeholder="옵션 ' + (oi + 1) + '">' +
          '<button class="sv-opt-del" data-act="del-opt" data-i="' + i + '" data-oi="' + oi + '" title="옵션 삭제">✕</button></div>';
      }).join('') +
      '<button class="sv-opt-add" data-act="add-opt" data-i="' + i + '">+ 옵션 추가</button></div>';
    } else if (q.type === 'SCALE') {
      body = '<div class="sv-scale">' +
        '<label>최소 <input type="number" class="sv-num-in" data-i="' + i + '" data-f="low" value="' + (q.low || 1) + '" min="0" max="10"></label>' +
        '<label>최대 <input type="number" class="sv-num-in" data-i="' + i + '" data-f="high" value="' + (q.high || 5) + '" min="2" max="10"></label>' +
        '<input class="sv-lab" data-i="' + i + '" data-f="lowLabel" value="' + _attr(q.lowLabel || '') + '" placeholder="최소 라벨(예: 매우 불만족)">' +
        '<input class="sv-lab" data-i="' + i + '" data-f="highLabel" value="' + _attr(q.highLabel || '') + '" placeholder="최대 라벨(예: 매우 만족)">' +
        '</div>';
    }
    var foot = (isSection || isText) ? '' :
      '<label class="sv-req"><input type="checkbox" data-i="' + i + '" data-f="required"' + (q.required ? ' checked' : '') + '> 필수 응답</label>';
    return '<div class="sv-card' + (isSection ? ' is-section' : '') + (isText ? ' is-text' : '') + '" draggable="true" data-i="' + i + '">' +
      '<span class="sv-grip" title="드래그하여 순서 이동">⠿</span>' +
      '<div class="sv-card-main"><div class="sv-card-head">' + head + '</div>' + body + foot + '</div>' +
      '<button class="sv-card-del" data-act="del" data-i="' + i + '" title="삭제">🗑</button>' +
      '</div>';
  }
  function _editorHTML(st) {
    var qnum = 0;
    var cards = st.questions.map(function (q, i) {
      if (q.type !== 'SECTION' && q.type !== 'TEXT_BLOCK') qnum++;
      return _cardHTML(q, i, qnum);
    }).join('');
    return '<div class="sv-ed">' +
      '<div class="sv-ed-head">' +
        '<input class="sv-ed-title" data-f="title" value="' + _attr(st.title) + '" placeholder="설문 제목">' +
        '<textarea class="sv-ed-desc" data-f="description" rows="2" placeholder="설문 소개/설명 (응답자에게 보이는 안내문)">' + _esc(st.description || '') + '</textarea>' +
      '</div>' +
      '<div class="sv-ed-list" id="sv-ed-list">' + cards + '</div>' +
      '<div class="sv-ed-add">' +
        '<button class="btn btn-secondary btn-sm" data-act="add-q">＋ 질문</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="add-section">＋ 섹션</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="add-text">＋ 설명</button>' +
      '</div>' +
      '<div class="sv-ed-foot">' +
        '<button id="survey-confirm-btn" class="btn btn-primary">📤 구글 드라이브에 생성</button>' +
        '<button id="survey-save-draft" class="btn btn-secondary">💾 편집 이력 저장</button>' +
        '<button id="survey-regen-btn" class="btn btn-ghost">✏️ 다시 생성</button>' +
      '</div>' +
      '</div>';
  }

  function _renderEditor() {
    var box = document.getElementById('survey-preview');
    if (!box || !_pendingStructure) return;
    box.style.display = 'block';
    box.innerHTML = _editorHTML(_pendingStructure);
    _bindEditor(box);
  }

  function _bindEditor(box) {
    var st = _pendingStructure;
    // 입력 → 모델 갱신(리렌더 없이 포커스 유지)
    box.addEventListener('input', function (e) {
      var t = e.target, f = t.getAttribute('data-f'), i = t.getAttribute('data-i'), oi = t.getAttribute('data-oi');
      if (oi != null) { var q = st.questions[+i]; if (q && q.options) q.options[+oi] = t.value; return; }
      if (f == null) return;
      if (i == null) { st[f] = t.value; return; }      // 최상위 title/description
      var q2 = st.questions[+i]; if (!q2) return;
      if (f === 'low' || f === 'high') q2[f] = parseInt(t.value, 10) || (f === 'low' ? 1 : 5);
      else q2[f] = t.value;
    });
    box.addEventListener('change', function (e) {
      var t = e.target;
      if (t.classList.contains('sv-type')) {
        var i = +t.getAttribute('data-i'), q = st.questions[i]; if (!q) return;
        q.type = t.value;
        if ((q.type === 'RADIO' || q.type === 'CHECKBOX' || q.type === 'DROP_DOWN') && (!q.options || !q.options.length)) q.options = ['옵션 1', '옵션 2'];
        if (q.type === 'SCALE') { q.low = q.low || 1; q.high = q.high || 5; }
        _renderEditor(); return;
      }
      if (t.getAttribute('data-f') === 'required') { var q3 = st.questions[+t.getAttribute('data-i')]; if (q3) q3.required = t.checked; }
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var act = b.getAttribute('data-act'), i = b.getAttribute('data-i'), oi = b.getAttribute('data-oi');
      if (act === 'add-q') { st.questions.push({ type: 'RADIO', title: '', required: false, options: ['옵션 1', '옵션 2'] }); _renderEditor(); }
      else if (act === 'add-section') { st.questions.push({ type: 'SECTION', title: '', description: '' }); _renderEditor(); }
      else if (act === 'add-text') { st.questions.push({ type: 'TEXT_BLOCK', title: '', description: '' }); _renderEditor(); }
      else if (act === 'del') { st.questions.splice(+i, 1); _renderEditor(); }
      else if (act === 'add-opt') { var q = st.questions[+i]; (q.options = q.options || []).push('옵션 ' + (q.options.length + 1)); _renderEditor(); }
      else if (act === 'del-opt') { var q2 = st.questions[+i]; if (q2 && q2.options && q2.options.length > 1) { q2.options.splice(+oi, 1); _renderEditor(); } }
    });
    // 드래그 순서 이동 + 드롭 위치 표시
    _bindDnd(box.querySelector('#sv-ed-list'));
    // 생성/재생성/이력저장
    var cf = document.getElementById('survey-confirm-btn');
    if (cf) cf.addEventListener('click', _doCreate);
    var sd = document.getElementById('survey-save-draft');
    if (sd) sd.addEventListener('click', _saveDraftFromEditor);
    var rg = document.getElementById('survey-regen-btn');
    if (rg) rg.addEventListener('click', function () { box.style.display = 'none'; box.innerHTML = ''; _pendingStructure = null; _setStatus(''); });
  }

  function _saveDraftFromEditor() {
    var st = _pendingStructure; if (!st) return;
    if (!_email()) { _setStatus('❌ 로그인 후 이용하세요(클라우드 저장).'); return; }
    if (!st._draftId) st._draftId = _uid();
    var draft = { id: st._draftId, title: st.title, structure: { title: st.title, description: st.description, questions: st.questions }, formId: st._formId || '' };
    _setStatus('💾 편집 이력 저장 중...');
    _draftSave(draft).then(function (res) {
      _setStatus((res && res.ok === false) ? ('⚠ 저장 실패: ' + (res.err || '로그인/네트워크 확인')) : '✅ 편집 이력이 클라우드에 저장됐습니다.');
      _loadDraftList();
      setTimeout(function () { _setStatus(''); }, 3000);
    });
  }

  var _dragI = null;
  function _bindDnd(list) {
    if (!list) return;
    [].slice.call(list.querySelectorAll('.sv-card')).forEach(function (card) {
      card.addEventListener('dragstart', function (e) {
        // 입력칸에서 시작된 드래그는 무시(텍스트 선택 보존)
        if (e.target && /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)) { e.preventDefault(); return; }
        _dragI = +card.getAttribute('data-i'); card.classList.add('sv-dragging');
        try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(_dragI)); } catch (x) {}
      });
      card.addEventListener('dragend', function () { card.classList.remove('sv-dragging'); list.querySelectorAll('.drop-before,.drop-after').forEach(function (x) { x.classList.remove('drop-before', 'drop-after'); }); });
      card.addEventListener('dragover', function (e) {
        e.preventDefault();
        list.querySelectorAll('.drop-before,.drop-after').forEach(function (x) { x.classList.remove('drop-before', 'drop-after'); });
        var r = card.getBoundingClientRect();
        card.classList.add((e.clientY - r.top) > r.height / 2 ? 'drop-after' : 'drop-before');
      });
      card.addEventListener('drop', function (e) {
        e.preventDefault();
        var after = card.classList.contains('drop-after');
        list.querySelectorAll('.drop-before,.drop-after').forEach(function (x) { x.classList.remove('drop-before', 'drop-after'); });
        var target = +card.getAttribute('data-i');
        if (_dragI == null || _dragI === target) return;
        var arr = _pendingStructure.questions;
        var item = arr.splice(_dragI, 1)[0];                 // 드래그 항목 제거
        var tgt = target > _dragI ? target - 1 : target;     // 제거 후 target 위치 보정
        var insertAt = after ? tgt + 1 : tgt;
        arr.splice(insertAt, 0, item);                       // 새 위치에 삽입
        _dragI = null;
        _renderEditor();
      });
    });
  }

  function _doCreate() {
    if (!_pendingStructure || !_pendingStructure.questions.length) { _setStatus('❌ 질문이 없습니다.'); return; }
    var cf = document.getElementById('survey-confirm-btn');
    _setStatus('📤 구글 드라이브에 생성 중...');
    if (cf) cf.disabled = true;
    var st = _pendingStructure;
    createForm(st)
      .then(function (form) {
        addHistory({ formId: form.formId, title: st.title, createdAt: new Date().toISOString(),
          editUrl: 'https://docs.google.com/forms/d/' + form.formId + '/edit',
          respondUrl: form.responderUri || ('https://docs.google.com/forms/d/' + form.formId + '/viewform') });
        // 편집 이력(클라우드)에도 생성 사실 기록(편집본 보존 + 구글폼 링크 연결)
        if (!st._draftId) st._draftId = _uid();
        _draftSave({ id: st._draftId, title: st.title, structure: { title: st.title, description: st.description, questions: st.questions }, formId: form.formId, createdAt: new Date().toISOString() })
          .then(function () { _loadDraftList(); });
        _setStatus('✅ 생성 완료! 구글폼이 만들어졌습니다.');
        var box = document.getElementById('survey-preview'); if (box) { box.style.display = 'none'; box.innerHTML = ''; }
        var pr = document.getElementById('survey-prompt'); if (pr) pr.value = '';
        _pendingStructure = null;
        if (cf) cf.disabled = false;
        setTimeout(function () { _setStatus(''); }, 4000);
        _loadFormList();
      })
      .catch(function (err) { _setStatus('❌ ' + (err.message || '생성 실패')); if (cf) cf.disabled = false; });
  }

  function _attr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

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
