'use strict';

/**
 * quicktask.js — 빠른 업무 등록 모듈
 *
 * 기능:
 *  1. Ctrl+Alt+R → 빠른 업무 등록 모달 오픈
 *  2. 텍스트/이미지 붙여넣기 → Claude AI가 업무 목록 추출
 *  3. 추출된 업무를 개별 또는 일괄로 Google Calendar + Sheets에 등록
 *
 * 의존: config.js, auth.js, sheets.js, resutil.js (캘린더 피커)
 */
var QuickTaskModule = (function () {

  /* ────────────────────────────────────────────────────────────
     상태
  ──────────────────────────────────────────────────────────── */
  var _SAVED_CALS_KEY = 'asea_qt_calendars'; // localStorage 키 (배열)

  function _loadSavedCalendars() {
    try {
      var v = localStorage.getItem(_SAVED_CALS_KEY);
      if (v) return JSON.parse(v);
      // 구버전 단일 키 마이그레이션
      var old = localStorage.getItem('asea_qt_last_calendar');
      if (old) { var c = JSON.parse(old); return c ? [c] : []; }
      return [];
    } catch (e) { return []; }
  }

  function _saveCalendars(list) {
    try { localStorage.setItem(_SAVED_CALS_KEY, JSON.stringify(list || [])); } catch (e) {}
  }

  var Q = {
    extractedTasks:  [],   // [{title, content, dueDate, dueTime, endTime, category, checked}]
    pasteImageB64:   null, // 붙여넣기된 이미지 base64
    pasteText:       '',   // 붙여넣기된 텍스트
    targetCalendars: _loadSavedCalendars(), // [{id, name, color}] 다중 선택 목록
    isAnalyzing:     false,
  };

  /* ────────────────────────────────────────────────────────────
     헬퍼
  ──────────────────────────────────────────────────────────── */
  function $q(id) { return document.getElementById(id); }
  function toast(msg, type) {
    if (typeof window.aseaToast === 'function') window.aseaToast(msg, type);
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ────────────────────────────────────────────────────────────
     모달 열기 / 닫기
  ──────────────────────────────────────────────────────────── */
  /* ── 드래그 이동 초기화 (헤더 잡고 모달 이동) ── */
  var _dragState = null;
  function _initDrag(dialog) {
    var header = dialog.querySelector('.modal-header');
    if (!header || header._dragBound) return;
    header._dragBound = true;

    header.addEventListener('mousedown', function (e) {
      // 버튼 클릭은 무시
      if (e.target.closest('button')) return;
      e.preventDefault();

      // 현재 위치 계산 (transform → absolute 전환)
      var rect = dialog.getBoundingClientRect();
      dialog.style.transform = 'none';
      dialog.style.left = rect.left + 'px';
      dialog.style.top  = rect.top  + 'px';

      _dragState = {
        startX: e.clientX,
        startY: e.clientY,
        origLeft: rect.left,
        origTop:  rect.top,
      };

      function onMove(ev) {
        if (!_dragState) return;
        var dx = ev.clientX - _dragState.startX;
        var dy = ev.clientY - _dragState.startY;
        var newLeft = _dragState.origLeft + dx;
        var newTop  = _dragState.origTop  + dy;
        // 화면 밖으로 나가지 않도록 제한
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth  - dialog.offsetWidth));
        newTop  = Math.max(0, Math.min(newTop,  window.innerHeight - dialog.offsetHeight));
        dialog.style.left = newLeft + 'px';
        dialog.style.top  = newTop  + 'px';
      }
      function onUp() {
        _dragState = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  function open() {
    var modal = $q('qt-modal');
    if (!modal) return;

    // 초기화
    Q.extractedTasks = [];
    Q.pasteImageB64  = null;
    Q.pasteText      = '';
    Q.isAnalyzing    = false;

    renderPasteZone();
    renderTaskList();
    renderCalendarBadge();
    modal.hidden = false;

    // 드래그 이동 + 리사이즈 초기화
    var dialog = modal.querySelector('.qt-modal-dialog');
    if (dialog) {
      // 열릴 때마다 중앙 위치로 리셋
      dialog.style.transform = 'translateX(-50%)';
      dialog.style.left = '50%';
      dialog.style.top  = '5vh';
      _initDrag(dialog);
    }

    // 페이스트 존 포커스
    setTimeout(function () {
      var tz = $q('qt-paste-text');
      if (tz) tz.focus();
    }, 80);
  }

  function close() {
    var modal = $q('qt-modal');
    if (modal) modal.hidden = true;
  }

  /* ────────────────────────────────────────────────────────────
     붙여넣기 존 렌더링
  ──────────────────────────────────────────────────────────── */
  function renderPasteZone() {
    var preview = $q('qt-paste-preview');
    if (!preview) return;

    if (Q.pasteImageB64) {
      preview.innerHTML =
        '<div class="qt-img-preview">' +
          '<img src="' + Q.pasteImageB64 + '" alt="붙여넣은 이미지" style="max-width:100%;max-height:180px;border-radius:8px">' +
          '<button id="qt-clear-paste" class="qt-clear-btn">✕ 지우기</button>' +
        '</div>';
    } else if (Q.pasteText) {
      preview.innerHTML =
        '<div class="qt-text-preview">' +
          '<pre style="white-space:pre-wrap;font-size:12px;max-height:140px;overflow-y:auto">' +
            escapeHtml(Q.pasteText.slice(0, 1200)) +
            (Q.pasteText.length > 1200 ? '\n...(이하 생략)' : '') +
          '</pre>' +
          '<button id="qt-clear-paste" class="qt-clear-btn">✕ 지우기</button>' +
        '</div>';
    } else {
      preview.innerHTML = '';
    }

    var clearBtn = $q('qt-clear-paste');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      Q.pasteImageB64 = null;
      Q.pasteText = '';
      var ta = $q('qt-paste-text');
      if (ta) ta.value = '';
      renderPasteZone();
      renderTaskList();
    });
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ────────────────────────────────────────────────────────────
     Claude API 호출 — 업무 목록 추출
  ──────────────────────────────────────────────────────────── */
  async function analyzeContent() {
    if (Q.isAnalyzing) return;

    var _cc = window.getClaudeConfig ? getClaudeConfig() : { apiKey: CONFIG.anthropicApiKey || localStorage.getItem('asea_anthropic_api_key') || '', endpoint: 'https://api.anthropic.com/v1/messages', isOfficial: true };
    var apiKey = _cc.apiKey;
    if (!apiKey) {
      toast('설정 → Claude API Key를 먼저 등록해주세요.', 'error');
      return;
    }

    var text = Q.pasteText || ($q('qt-paste-text') ? $q('qt-paste-text').value.trim() : '');
    if (!text && !Q.pasteImageB64) {
      toast('분석할 텍스트 또는 이미지를 먼저 붙여넣기 해주세요.', 'warning');
      return;
    }

    Q.isAnalyzing = true;
    var analyzeBtn = $q('qt-analyze-btn');
    if (analyzeBtn) { analyzeBtn.disabled = true; analyzeBtn.textContent = '분석 중...'; }

    try {
      var today = todayStr();
      // 오늘 요일 계산 (자연어 날짜 파싱에 필요)
      var dayNames = ['일','월','화','수','목','금','토'];
      var todayDow = dayNames[new Date().getDay()];

      var systemPrompt =
        '당신은 한국어 업무 일정 추출 전문 AI입니다. 이미지 또는 텍스트에서 업무/일정 항목들을 추출해 ' +
        'JSON 배열로만 반환하세요. 다른 설명 없이 JSON만 반환합니다.\n\n' +
        '★ 한글 OCR 지침: 이미지에 한국어 텍스트가 포함된 경우, 흐릿하거나 작은 글씨도 최대한 정확하게 인식하세요. ' +
        '받침·자모·조사를 주의 깊게 읽고, 맥락상 올바른 한국어 단어로 보정하세요. ' +
        '이름·전화번호·날짜·시간을 특히 주의해서 추출하세요.\n\n' +
        '오늘 날짜: ' + today + ' (' + todayDow + '요일)\n\n' +
        '각 항목 형식:\n' +
        '{"title":"업무 제목","content":"상세 내용(담당자·협조사항 등 포함)","dueDate":"YYYY-MM-DD 또는 빈문자열","dueTime":"HH:MM 또는 빈문자열","endTime":"HH:MM 또는 빈문자열","category":"일반업무|교육일정|행사|대관|차량|기타"}\n\n' +
        '날짜·시간 처리 규칙:\n' +
        '- "이번 주 목요일", "다음 주 수요일" 등 상대적 표현 → 실제 날짜(YYYY-MM-DD)로 변환\n' +
        '- "내일", "모레", "다음달 15일" 등도 실제 날짜로 변환\n' +
        '- "11:00~13:00", "오전 10시~오후 1시" 처럼 범위 → dueTime=시작, endTime=종료\n' +
        '- "3시", "오후 2시" 처럼 시작 시간만 있으면 dueTime에만 기록, endTime은 빈문자열\n' +
        '- 날짜가 전혀 없으면 dueDate는 빈문자열(""), 시간이 없으면 dueTime·endTime 모두 빈문자열';

      var messages;
      if (Q.pasteImageB64) {
        var base64data = Q.pasteImageB64.replace(/^data:[^;]+;base64,/, '');
        var mediaType  = (Q.pasteImageB64.match(/^data:([^;]+);/) || [])[1] || 'image/png';
        messages = [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64data } },
          { type: 'text', text:
            '위 이미지는 한국어 텍스트가 포함된 화면입니다. ' +
            '한글 OCR에 최대한 집중하여 업무/일정 항목들을 정확히 추출해 JSON 배열로 반환하세요. ' +
            '이름, 날짜, 시간, 전화번호를 빠짐없이 추출하고 content에 모든 세부 내용을 포함하세요.'
          }
        ]}];
      } else {
        messages = [{ role: 'user', content: '다음 내용에서 업무/일정 항목들을 추출해 JSON 배열로 반환하세요:\n\n' + text }];
      }

      var _qtEndpoint = (_cc.endpoint && !_cc.endpoint.includes('amplifuse.io'))
        ? _cc.endpoint
        : 'https://api.anthropic.com/v1/messages';
      var _qtHeaders = {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true'
      };
      var resp = await fetch(_qtEndpoint, {
        method: 'POST',
        headers: _qtHeaders,
        body: JSON.stringify({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system:     systemPrompt,
          messages:   messages,
        }),
      });

      var data = await resp.json();
      if (!resp.ok) {
        var errMsg = (data.error && data.error.message) || '분석 실패';
        if (resp.status === 401) throw new Error('API Key가 올바르지 않습니다. 설정에서 확인해주세요.');
        if (resp.status === 400) throw new Error('요청 오류: ' + errMsg);
        throw new Error(errMsg);
      }

      var rawText = (data.content && data.content[0] && data.content[0].text) || '';
      var parsed  = extractJsonArray(rawText);

      if (!parsed || parsed.length === 0) {
        toast('업무 항목을 찾지 못했습니다. 텍스트를 확인해주세요.', 'warning');
        return;
      }

      Q.extractedTasks = parsed.map(function (t) {
        var dueDate = (t.dueDate || '').trim();
        var dueTime = (t.dueTime || '').trim();
        var endTime = (t.endTime || '').trim();
        return {
          id:       genId(),
          title:    (t.title || '').trim(),
          content:  (t.content || '').trim(),
          dueDate:  dueDate,
          dueTime:  dueTime,
          endTime:  endTime,
          category: t.category || '일반업무',
          status:   '예정',
          checked:  true,
        };
      }).filter(function (t) { return t.title; });

      toast('✅ ' + Q.extractedTasks.length + '건의 업무 항목이 추출되었습니다.', 'success');
      renderTaskList();

    } catch (err) {
      toast('분석 오류: ' + err.message, 'error');
    } finally {
      Q.isAnalyzing = false;
      if (analyzeBtn) { analyzeBtn.disabled = false; analyzeBtn.textContent = '🤖 AI 분석'; }
    }
  }

  function extractJsonArray(text) {
    // 응답에서 JSON 배열 부분만 추출
    var m = text.match(/\[[\s\S]*\]/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch (e) { return null; }
  }

  /* ────────────────────────────────────────────────────────────
     추출된 업무 목록 렌더링
  ──────────────────────────────────────────────────────────── */
  function renderTaskList() {
    var wrap = $q('qt-task-list');
    if (!wrap) return;

    if (Q.extractedTasks.length === 0) {
      wrap.innerHTML =
        '<p class="empty-state" style="padding:16px 0">분석 결과가 여기 표시됩니다.<br>' +
        '<small style="color:#888">텍스트·이미지를 붙여넣은 후 AI 분석 버튼을 누르세요.</small></p>';
      updateRegisterButtons();
      return;
    }

    var allChecked = Q.extractedTasks.every(function (t) { return t.checked; });

    var html =
      '<div class="qt-task-list-header">' +
        '<label class="qt-check-all">' +
          '<input type="checkbox" id="qt-check-all" ' + (allChecked ? 'checked' : '') + '> ' +
          '전체 선택 (' + Q.extractedTasks.filter(function(t){return t.checked;}).length + '/' + Q.extractedTasks.length + ')' +
        '</label>' +
      '</div>' +
      '<div class="qt-task-items">';

    Q.extractedTasks.forEach(function (task, idx) {
      var catColor = { '일반업무':'#4285F4','교육일정':'#0F9D58','행사':'#F4B400','대관':'#2E7D32','차량':'#DB4437','기타':'#9E9E9E' }[task.category] || '#9E9E9E';
      html +=
        '<div class="qt-task-item ' + (task.checked ? '' : 'qt-task-unchecked') + '" data-idx="' + idx + '">' +
          '<label class="qt-task-check">' +
            '<input type="checkbox" class="qt-item-cb" data-idx="' + idx + '" ' + (task.checked ? 'checked' : '') + '>' +
          '</label>' +
          '<div class="qt-task-body">' +
            '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
              '<span class="qt-cat-badge" style="background:' + catColor + '">' + escapeHtml(task.category) + '</span>' +
              '<input class="qt-task-title-input form-input" style="flex:1;min-width:140px;padding:4px 8px;font-size:13px" data-idx="' + idx + '" value="' + escapeHtml(task.title) + '">' +
            '</div>' +
            '<div class="qt-time-row">' +
              '<input type="date" class="qt-task-date-input form-input" style="padding:3px 8px;font-size:12px" data-idx="' + idx + '" value="' + escapeHtml(task.dueDate) + '">' +
              '<input type="time" class="qt-task-time-input form-input" style="padding:3px 6px;font-size:12px" data-idx="' + idx + '" value="' + escapeHtml(task.dueTime || '') + '" title="시작 시간">' +
              '<span class="qt-time-sep">~</span>' +
              '<input type="time" class="qt-task-endtime-input form-input" style="padding:3px 6px;font-size:12px" data-idx="' + idx + '" value="' + escapeHtml(task.endTime || '') + '" title="종료 시간">' +
              '<select class="qt-task-cat-sel form-select" style="width:96px;padding:3px 6px;font-size:12px" data-idx="' + idx + '">' +
                ['일반업무','교육일정','행사','대관','차량','기타'].map(function(c){
                  return '<option value="'+c+'"'+(c===task.category?' selected':'')+'>'+c+'</option>';
                }).join('') +
              '</select>' +
              '<button class="qt-status-toggle ' + (task.status === '완료' ? 'qt-status-done' : 'qt-status-pending') + '" data-idx="' + idx + '" title="클릭하여 상태 변경">' +
                (task.status === '완료' ? '✅ 완료' : '🕐 예정') +
              '</button>' +
            '</div>' +
            (task.content ? '<div class="qt-task-content">' + escapeHtml(task.content.slice(0,120)) + (task.content.length > 120 ? '...' : '') + '</div>' : '') +
          '</div>' +
        '</div>';
    });

    html += '</div>';
    wrap.innerHTML = html;

    // 이벤트 바인딩
    var checkAll = $q('qt-check-all');
    if (checkAll) checkAll.addEventListener('change', function () {
      Q.extractedTasks.forEach(function (t) { t.checked = checkAll.checked; });
      renderTaskList();
    });

    wrap.querySelectorAll('.qt-item-cb').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var idx = parseInt(this.dataset.idx);
        Q.extractedTasks[idx].checked = this.checked;
        this.closest('.qt-task-item').classList.toggle('qt-task-unchecked', !this.checked);
        updateCheckAllState();
        updateRegisterButtons();
      });
    });

    wrap.querySelectorAll('.qt-task-title-input').forEach(function (inp) {
      inp.addEventListener('input', function () {
        Q.extractedTasks[parseInt(this.dataset.idx)].title = this.value;
      });
    });

    wrap.querySelectorAll('.qt-task-date-input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        Q.extractedTasks[parseInt(this.dataset.idx)].dueDate = this.value;
      });
    });

    wrap.querySelectorAll('.qt-task-time-input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        Q.extractedTasks[parseInt(this.dataset.idx)].dueTime = this.value;
      });
    });

    wrap.querySelectorAll('.qt-task-endtime-input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        Q.extractedTasks[parseInt(this.dataset.idx)].endTime = this.value;
      });
    });

    wrap.querySelectorAll('.qt-task-cat-sel').forEach(function (sel) {
      sel.addEventListener('change', function () {
        Q.extractedTasks[parseInt(this.dataset.idx)].category = this.value;
        renderTaskList(); // 배지 색 업데이트
      });
    });

    wrap.querySelectorAll('.qt-status-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(this.dataset.idx);
        Q.extractedTasks[idx].status = Q.extractedTasks[idx].status === '완료' ? '예정' : '완료';
        renderTaskList();
      });
    });

    updateRegisterButtons();
  }

  function updateCheckAllState() {
    var cb = $q('qt-check-all');
    if (!cb) return;
    var checked = Q.extractedTasks.filter(function (t) { return t.checked; }).length;
    cb.checked = (checked === Q.extractedTasks.length && checked > 0);
    cb.indeterminate = (checked > 0 && checked < Q.extractedTasks.length);
    cb.parentElement.lastChild.textContent = ' 전체 선택 (' + checked + '/' + Q.extractedTasks.length + ')';
  }

  function updateRegisterButtons() {
    var cnt = Q.extractedTasks.filter(function (t) { return t.checked; }).length;
    var regBtn  = $q('qt-register-btn');
    var totalEl = $q('qt-selected-count');
    if (regBtn)  regBtn.disabled = (cnt === 0);
    if (totalEl) totalEl.textContent = cnt + '건 선택됨';
  }

  /* ────────────────────────────────────────────────────────────
     캘린더 배지
  ──────────────────────────────────────────────────────────── */
  function renderCalendarBadge() {
    var wrap = $q('qt-cal-list');
    if (!wrap) return;
    if (!Q.targetCalendars || Q.targetCalendars.length === 0) {
      wrap.innerHTML = '<span style="font-size:12px;color:#aaa">미선택 — 캘린더 추가 버튼으로 선택하세요</span>';
      return;
    }
    wrap.innerHTML = Q.targetCalendars.map(function (cal, i) {
      return '<span class="qt-cal-chip">' +
        '<span style="width:9px;height:9px;border-radius:50%;background:' + (cal.color || '#4285F4') + ';display:inline-block;flex-shrink:0"></span>' +
        '<span style="font-size:12px">' + escapeHtml(cal.name) + '</span>' +
        '<button class="qt-cal-chip-del" data-i="' + i + '" title="제거">×</button>' +
      '</span>';
    }).join('');
    wrap.querySelectorAll('.qt-cal-chip-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(this.dataset.i);
        Q.targetCalendars.splice(idx, 1);
        _saveCalendars(Q.targetCalendars);
        renderCalendarBadge();
      });
    });
  }

  /* ────────────────────────────────────────────────────────────
     업무 등록 (Sheets + 선택적 Google Calendar)
  ──────────────────────────────────────────────────────────── */
  async function registerTasks() {
    var tasks = Q.extractedTasks.filter(function (t) { return t.checked && t.title; });
    if (tasks.length === 0) { toast('등록할 항목을 선택하세요.', 'warning'); return; }

    var me = window._workMe || {};
    var btn = $q('qt-register-btn');
    if (btn) { btn.disabled = true; btn.textContent = '등록 중...'; }

    var success = 0, fail = 0;

    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      try {
        // 1. Sheets에 업무 등록
        var taskData = {
          id:          genId(),
          title:       t.title,
          content:     t.content || '',
          category:    t.category,
          type:        '알림',
          fromId:      me.id || '',
          fromName:    me.name || me.googleEmail || '',
          toIds:       me.id || '',
          toNames:     me.name || '',
          shareScope:  '개인',
          dueDate:     t.dueDate || '',
          createdAt:   new Date().toISOString(),
          calEventId:  '',
          status:      t.status || '예정',  // 예정 | 완료
        };

        // 2. Google 캘린더에 등록 (다중 캘린더 지원)
        var calTargets = (Q.targetCalendars && Q.targetCalendars.length > 0)
          ? Q.targetCalendars.slice()
          : [];
        // 하나도 없으면 ASEA-개인업무 자동 사용
        if (calTargets.length === 0 && window._workW && window._workW.asea개인CalId) {
          calTargets = [{ id: window._workW.asea개인CalId, name: 'ASEA-개인업무', color: '#4285F4' }];
        }

        if (calTargets.length > 0 && t.dueDate) {
          // 이벤트 바디 한 번만 만들고 여러 캘린더에 등록
          var eventBody;
          if (t.dueTime) {
            var startDt = t.dueDate + 'T' + t.dueTime + ':00';
            var endDt;
            if (t.endTime) {
              endDt = t.dueDate + 'T' + t.endTime + ':00';
              if (endDt <= startDt) {
                var nextDay = new Date(t.dueDate);
                nextDay.setDate(nextDay.getDate() + 1);
                var nd = nextDay.getFullYear() + '-' +
                  String(nextDay.getMonth()+1).padStart(2,'0') + '-' +
                  String(nextDay.getDate()).padStart(2,'0');
                endDt = nd + 'T' + t.endTime + ':00';
              }
            } else {
              var endDateObj = new Date(startDt);
              endDateObj.setHours(endDateObj.getHours() + 1);
              endDt = endDateObj.getFullYear() + '-' +
                String(endDateObj.getMonth()+1).padStart(2,'0') + '-' +
                String(endDateObj.getDate()).padStart(2,'0') + 'T' +
                String(endDateObj.getHours()).padStart(2,'0') + ':' +
                String(endDateObj.getMinutes()).padStart(2,'0') + ':00';
            }
            eventBody = {
              summary:     '[업무] ' + t.title,
              description: t.content || '',
              start: { dateTime: startDt, timeZone: 'Asia/Seoul' },
              end:   { dateTime: endDt,   timeZone: 'Asia/Seoul' },
              colorId: '1',
            };
          } else {
            eventBody = {
              summary:     '[업무] ' + t.title,
              description: t.content || '',
              start: { date: t.dueDate },
              end:   { date: t.dueDate },
              colorId: '1',
            };
          }

          var firstCalEventId = '';
          for (var ci = 0; ci < calTargets.length; ci++) {
            try {
              var token = Auth.getToken();
              var calResp = await fetch(
                'https://www.googleapis.com/calendar/v3/calendars/' +
                encodeURIComponent(calTargets[ci].id) + '/events',
                {
                  method:  'POST',
                  headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                  body:    JSON.stringify(eventBody),
                }
              );
              if (calResp.ok) {
                var calData = await calResp.json();
                if (!firstCalEventId) firstCalEventId = calData.id || '';
              }
            } catch (calErr) { console.warn('[ASEA] 캘린더 등록 실패:', calTargets[ci].name, calErr); }
          }
          taskData.calEventId = firstCalEventId;
        }

        // Sheets 등록 (SheetsModule이 있으면 — 실패해도 캘린더 등록은 유지)
        if (typeof SheetsModule !== 'undefined' && SheetsModule.createTask) {
          try {
            await SheetsModule.createTask(taskData);
            // 수신함에 자기 자신에게도 등록 (개인 업무)
            if (SheetsModule.createReceived && me.id) {
              await SheetsModule.createReceived(taskData.id, [{
                userId: me.id, userName: me.name || '',
              }]);
            }
          } catch (sheetsErr) {
            console.warn('[ASEA] Sheets 등록 실패 (캘린더 등록은 완료):', sheetsErr);
          }
        }

        success++;
      } catch (err) {
        fail++;
        console.warn('quicktask register error', err);
      }
    }

    if (btn) { btn.disabled = false; btn.textContent = '✅ 등록하기'; }

    if (success > 0) {
      toast('✅ ' + success + '건 등록 완료!' + (fail ? ' (' + fail + '건 실패)' : ''), 'success');
      // 등록된 항목 체크 해제
      Q.extractedTasks.forEach(function (t) {
        if (t.checked) t._done = true;
      });
      Q.extractedTasks = Q.extractedTasks.filter(function (t) { return !t._done; });
      renderTaskList();

      // 업무관리 탭 새로고침
      if (typeof WorkModule !== 'undefined' && WorkModule.refreshInbox) {
        WorkModule.refreshInbox();
      }
      // 캘린더 탭 새로고침 (앱 전역 함수가 있으면)
      if (typeof window.aseaRefreshCalendar === 'function') {
        window.aseaRefreshCalendar();
      }
    } else {
      toast('등록에 실패했습니다. 로그인 상태를 확인하세요.', 'error');
    }
  }

  /* ────────────────────────────────────────────────────────────
     붙여넣기 이벤트 핸들러 (전역 Ctrl+V → 모달이 열려 있을 때)
  ──────────────────────────────────────────────────────────── */
  function handlePasteEvent(e) {
    var modal = $q('qt-modal');
    if (!modal || modal.hidden) return;

    var active = document.activeElement;
    var items  = e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData);
    if (!items) return;

    /* ── 이미지 우선 확인 (포커스 위치 무관하게 항상 가로챔) ── */
    var imageFile = null;
    for (var i = 0; i < items.items.length; i++) {
      var item = items.items[i];
      if (item.type && item.type.indexOf('image') !== -1) {
        imageFile = item.getAsFile();
        break;
      }
    }

    if (imageFile) {
      // textarea에 포커스 있어도 이미지면 기본 동작 막고 캡처
      e.preventDefault();
      var reader = new FileReader();
      reader.onload = function (ev) {
        Q.pasteImageB64 = ev.target.result;
        Q.pasteText     = '';
        var ta = $q('qt-paste-text');
        if (ta) ta.value = '';
        renderPasteZone();
        toast('📷 이미지가 붙여넣기 되었습니다. AI 분석 버튼을 눌러주세요.', 'info');
      };
      reader.readAsDataURL(imageFile);
      return;
    }

    /* ── 텍스트 — 편집 가능 요소(input/textarea/contenteditable)에 포커스된 경우 기본 동작 유지 ── */
    if (active && (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.isContentEditable
    )) return;

    var txt = items.getData ? items.getData('text/plain') : '';
    if (txt) {
      e.preventDefault();
      Q.pasteText     = txt;
      Q.pasteImageB64 = null;
      var ta2 = $q('qt-paste-text');
      if (ta2) ta2.value = txt;
      renderPasteZone();
      toast('텍스트가 붙여넣기 되었습니다. AI 분석 버튼을 눌러주세요.', 'info');
    }
  }

  /* ────────────────────────────────────────────────────────────
     초기화
  ──────────────────────────────────────────────────────────── */
  function init() {
    // ── Ctrl+Alt+R 단축키 ────────────────────────────────────
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.altKey && (e.key === 'R' || e.key === 'r')) {
        // 로그인 되어 있을 때만
        if (typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn()) {
          e.preventDefault();
          e.stopPropagation();
          open();
        }
      }
    }, true); // capture phase: 브라우저 단축키보다 먼저 잡음

    // ── 전역 붙여넣기 ──────────────────────────────────────────
    document.addEventListener('paste', handlePasteEvent);

    // ── 모달 버튼 이벤트 ──────────────────────────────────────
    var closeBtn = $q('qt-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', close);

    var backdrop = $q('qt-backdrop');
    if (backdrop) backdrop.addEventListener('click', close);

    // textarea 입력 → 실시간 반영
    var ta = $q('qt-paste-text');
    if (ta) {
      ta.addEventListener('input', function () {
        Q.pasteText = this.value;
        Q.pasteImageB64 = null;
        renderPasteZone();
      });
    }

    // 이미지 파일 드롭
    var dropZone = $q('qt-drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('qt-drag-over');
      });
      dropZone.addEventListener('dragleave', function () {
        dropZone.classList.remove('qt-drag-over');
      });
      dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('qt-drag-over');
        var file = e.dataTransfer.files[0];
        if (file && file.type.indexOf('image') !== -1) {
          var reader = new FileReader();
          reader.onload = function (ev) {
            Q.pasteImageB64 = ev.target.result;
            Q.pasteText = '';
            var tarea = $q('qt-paste-text');
            if (tarea) tarea.value = '';
            renderPasteZone();
            toast('이미지가 업로드되었습니다.', 'info');
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // 파일 선택 버튼
    var fileInput = $q('qt-img-input');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var file = this.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          Q.pasteImageB64 = ev.target.result;
          Q.pasteText = '';
          var tarea = $q('qt-paste-text');
          if (tarea) tarea.value = '';
          renderPasteZone();
        };
        reader.readAsDataURL(file);
        this.value = '';
      });
    }

    // AI 분석 버튼
    var analyzeBtn = $q('qt-analyze-btn');
    if (analyzeBtn) analyzeBtn.addEventListener('click', analyzeContent);

    // 캘린더 추가 버튼
    var calBtn = $q('qt-select-cal-btn');
    if (calBtn) calBtn.addEventListener('click', function () {
      if (typeof ReservationUtil !== 'undefined') {
        ReservationUtil.showCalendarPicker(function (cal) {
          if (!Q.targetCalendars) Q.targetCalendars = [];
          // 중복 방지
          var already = Q.targetCalendars.some(function (c) { return c.id === cal.id; });
          if (already) { toast(cal.name + '은(는) 이미 추가되어 있습니다.', 'info'); return; }
          Q.targetCalendars.push(cal);
          _saveCalendars(Q.targetCalendars);
          renderCalendarBadge();
          toast('✅ ' + cal.name + ' 추가되었습니다.', 'success');
        });
      } else {
        toast('ReservationUtil이 로드되지 않았습니다.', 'error');
      }
    });

    // 전체 해제 버튼
    var calClearBtn = $q('qt-clear-cal-btn');
    if (calClearBtn) calClearBtn.addEventListener('click', function () {
      Q.targetCalendars = [];
      _saveCalendars([]);
      renderCalendarBadge();
    });

    // 등록 버튼
    var regBtn = $q('qt-register-btn');
    if (regBtn) regBtn.addEventListener('click', registerTasks);

    // 단축키 안내 배지 렌더링
    renderShortcutBadge();
  }

  function renderShortcutBadge() {
    // 헤더에 단축키 힌트 표시
    var headerActions = document.querySelector('.header-actions');
    if (!headerActions) return;
    if (document.getElementById('qt-shortcut-hint')) return;
    var hint = document.createElement('button');
    hint.id = 'qt-shortcut-hint';
    hint.className = '';
    hint.title = '빠른 업무 등록 (Ctrl+Alt+R)';
    hint.innerHTML = '⚡ 빠른 등록 <kbd>Ctrl+Alt+R</kbd>';
    hint.style.cssText = '';
    hint.addEventListener('click', function () {
      if (typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn()) open();
      else toast('먼저 로그인이 필요합니다.', 'warning');
    });
    headerActions.prepend(hint);
  }

  /* ═══════════════════════════════════════════════════════════
     캘린더 구독 — 설정 관리 + 모달
  ═══════════════════════════════════════════════════════════ */

  var CS_KEY = 'asea_cal_subscriptions'; // localStorage 키

  /* 저장된 구독 목록 [{id, label, url}] */
  function loadSubs() {
    try { return JSON.parse(localStorage.getItem(CS_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveSubs(subs) {
    localStorage.setItem(CS_KEY, JSON.stringify(subs));
  }

  /* ── 설정 탭 렌더링 ──────────────────────────────────────── */
  function renderCalSubSettings() {
    var list = $q('calsub-list');
    if (!list) return;
    var subs = loadSubs();
    if (subs.length === 0) {
      list.innerHTML = '<p class="empty-state" style="padding:6px 0;font-size:12px">등록된 구독 캘린더가 없습니다.</p>';
      return;
    }
    list.innerHTML = subs.map(function (s, i) {
      return '<div class="calsub-row">' +
        '<span class="calsub-label">' + escapeHtml(s.label || s.url) + '</span>' +
        '<span class="calsub-url-text" title="' + escapeHtml(s.url) + '">' + escapeHtml(s.url.length > 50 ? s.url.slice(0, 50) + '...' : s.url) + '</span>' +
        '<button class="btn btn-ghost btn-sm calsub-del-btn" data-idx="' + i + '" title="삭제">✕</button>' +
      '</div>';
    }).join('');

    list.querySelectorAll('.calsub-del-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var subs2 = loadSubs();
        subs2.splice(parseInt(this.dataset.idx), 1);
        saveSubs(subs2);
        renderCalSubSettings();
        populateCalSubSourceSel();
      });
    });
  }

  /* ── 구독 추가 ────────────────────────────────────────────── */
  function addCalSub() {
    var labelEl = $q('calsub-label-input');
    var urlEl   = $q('calsub-url-input');
    var label   = (labelEl && labelEl.value.trim()) || '';
    var url     = (urlEl   && urlEl.value.trim())   || '';
    if (!url) { toast('URL 또는 Calendar ID를 입력해주세요.', 'warning'); return; }
    var subs = loadSubs();
    if (subs.find(function (s) { return s.url === url; })) {
      toast('이미 등록된 주소입니다.', 'warning'); return;
    }
    subs.push({ id: genId(), label: label || url, url: url });
    saveSubs(subs);
    if (labelEl) labelEl.value = '';
    if (urlEl)   urlEl.value   = '';
    renderCalSubSettings();
    populateCalSubSourceSel();
    toast('구독 캘린더가 추가되었습니다.', 'success');
  }

  /* ── 모달 열기 ────────────────────────────────────────────── */
  var CS = {
    events:         [],
    targetCalendar: null,
  };

  function openCalSubModal() {
    var modal = $q('calsub-modal');
    if (!modal) return;
    CS.events = [];
    CS.targetCalendar = null;

    // 기간 기본값: 오늘 ~ +30일
    var now  = new Date();
    var from = $q('calsub-from-date');
    var to   = $q('calsub-to-date');
    if (from) from.value = dateStrFromDate(now);
    if (to) {
      var end = new Date(now);
      end.setDate(end.getDate() + 30);
      to.value = dateStrFromDate(end);
    }

    populateCalSubSourceSel();
    renderCalSubEventList();
    renderCalSubTargetBadge();
    modal.hidden = false;
  }

  function dateStrFromDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function populateCalSubSourceSel() {
    var sel = $q('calsub-source-sel');
    if (!sel) return;
    var subs = loadSubs();
    var curVal = sel.value;
    sel.innerHTML = '<option value="">캘린더 선택...</option>';
    subs.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.url; opt.textContent = s.label || s.url;
      if (s.url === curVal) opt.selected = true;
      sel.appendChild(opt);
    });
    // Google Calendar 내 캘린더도 추가
    var myCals = (typeof CalendarModule !== 'undefined' && CalendarModule.getCachedCalendars)
      ? CalendarModule.getCachedCalendars()
      : (CONFIG.selectedCalendars || []);
    myCals.forEach(function (c) {
      if (!c.id) return;
      var opt = document.createElement('option');
      opt.value = '__gcal__' + c.id;
      opt.textContent = '🗓 ' + (c.name || c.id);
      sel.appendChild(opt);
    });
  }

  /* ── 이벤트 불러오기 ─────────────────────────────────────── */
  async function loadCalSubEvents() {
    var sel  = $q('calsub-source-sel');
    var from = $q('calsub-from-date');
    var to   = $q('calsub-to-date');
    var url  = sel  && sel.value.trim();
    var f    = from && from.value;
    var t    = to   && to.value;

    if (!url) { toast('캘린더를 선택해주세요.', 'warning'); return; }
    if (!f || !t) { toast('기간을 입력해주세요.', 'warning'); return; }

    var btn = $q('calsub-load-btn');
    if (btn) { btn.disabled = true; btn.textContent = '불러오는 중...'; }

    CS.events = [];

    try {
      if (url.startsWith('__gcal__')) {
        // Google Calendar API 호출
        var calId = url.replace('__gcal__', '');
        CS.events = await fetchGCalEvents(calId, f, t);
      } else if (url.match(/\.ics(\?.*)?$/) || url.indexOf('ical') !== -1 || url.startsWith('webcal')) {
        // ICS 파싱
        CS.events = await fetchICSEvents(url, f, t);
      } else {
        // Google Calendar ID로 간주
        CS.events = await fetchGCalEvents(url, f, t);
      }

      if (CS.events.length === 0) {
        toast('해당 기간에 일정이 없습니다.', 'info');
      } else {
        toast(CS.events.length + '개 일정을 불러왔습니다.', 'success');
      }
    } catch (err) {
      toast('불러오기 실패: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '불러오기'; }
    }

    renderCalSubEventList();
  }

  /* ── Google Calendar API 이벤트 조회 ──────────────────────── */
  async function fetchGCalEvents(calId, fromDate, toDate) {
    var token = Auth.getToken();
    if (!token) throw new Error('로그인이 필요합니다.');
    var url = 'https://www.googleapis.com/calendar/v3/calendars/' +
      encodeURIComponent(calId) + '/events?' +
      'timeMin=' + encodeURIComponent(fromDate + 'T00:00:00+09:00') +
      '&timeMax=' + encodeURIComponent(toDate + 'T23:59:59+09:00') +
      '&singleEvents=true&orderBy=startTime&maxResults=100';
    var res  = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
    var data = await res.json();
    if (!res.ok) throw new Error((data.error && data.error.message) || '캘린더 조회 실패');
    return (data.items || []).map(function (ev) {
      var start = ev.start.date || ev.start.dateTime || '';
      return {
        id:       ev.id || genId(),
        title:    ev.summary || '(제목 없음)',
        content:  ev.description || '',
        dueDate:  start ? start.slice(0, 10) : '',
        category: guessCategoryFromTitle(ev.summary || ''),
        location: ev.location || '',
        checked:  true,
      };
    });
  }

  /* ── ICS 파싱 ────────────────────────────────────────────── */
  async function fetchICSEvents(icsUrl, fromDate, toDate) {
    // webcal → https
    var fetchUrl = icsUrl.replace(/^webcal:\/\//i, 'https://');
    // CORS 우회: 직접 fetch 시도 (공개 ICS만 가능)
    var res  = await fetch(fetchUrl);
    if (!res.ok) throw new Error('ICS URL 접근 실패 (' + res.status + '). 공개 ICS URL인지 확인하세요.');
    var text = await res.text();
    return parseICS(text, fromDate, toDate);
  }

  function parseICS(text, fromDate, toDate) {
    var events = [];
    var lines  = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // 줄 접기(folding) 해제
    lines = lines.replace(/\n[ \t]/g, '');
    var blocks = lines.split('BEGIN:VEVENT');
    for (var b = 1; b < blocks.length; b++) {
      var block = blocks[b];
      var get   = function (key) {
        var m = block.match(new RegExp(key + '[^:]*:([^\n]+)'));
        return m ? m[1].trim() : '';
      };
      var summary  = decodeICSText(get('SUMMARY'));
      var dtstart  = get('DTSTART');
      var desc     = decodeICSText(get('DESCRIPTION'));
      var location = decodeICSText(get('LOCATION'));
      var dateStr  = icsDateToYMD(dtstart);
      if (!summary) continue;
      if (fromDate && dateStr && dateStr < fromDate) continue;
      if (toDate   && dateStr && dateStr > toDate)   continue;
      events.push({
        id:       genId(),
        title:    summary,
        content:  desc || '',
        dueDate:  dateStr,
        category: guessCategoryFromTitle(summary),
        location: location,
        checked:  true,
      });
    }
    return events;
  }

  function icsDateToYMD(dtstart) {
    if (!dtstart) return '';
    var digits = dtstart.replace(/[^0-9]/g, '');
    if (digits.length >= 8) {
      return digits.slice(0,4) + '-' + digits.slice(4,6) + '-' + digits.slice(6,8);
    }
    return '';
  }

  function decodeICSText(str) {
    if (!str) return '';
    return str.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
  }

  function guessCategoryFromTitle(title) {
    if (!title) return '일반업무';
    var t = title;
    if (/교육|강의|수업|학점|특강|오리엔테이션/.test(t)) return '교육일정';
    if (/행사|축제|기념|졸업|입학|시상/.test(t))          return '행사';
    if (/대관|예약|강당|회의실/.test(t))                   return '대관';
    if (/차량|출장|이동|운행/.test(t))                     return '차량';
    return '일반업무';
  }

  /* ── 이벤트 목록 렌더링 ────────────────────────────────────── */
  function renderCalSubEventList() {
    var wrap = $q('calsub-event-list');
    if (!wrap) return;
    if (CS.events.length === 0) {
      wrap.innerHTML = '<p class="empty-state" style="padding:12px 0">불러온 일정이 없습니다.</p>';
      updateCalSubRegBtn();
      return;
    }

    var allChecked = CS.events.every(function (e) { return e.checked; });
    var html =
      '<div class="qt-task-list-header">' +
        '<label class="qt-check-all">' +
          '<input type="checkbox" id="calsub-check-all" ' + (allChecked ? 'checked' : '') + '> ' +
          '전체 선택 (' + CS.events.filter(function(e){return e.checked;}).length + '/' + CS.events.length + ')' +
        '</label>' +
      '</div>' +
      '<div class="qt-task-items">';

    var CAT_COLORS = { '일반업무':'#4285F4','교육일정':'#0F9D58','행사':'#F4B400','대관':'#2E7D32','차량':'#DB4437','기타':'#9E9E9E' };
    CS.events.forEach(function (ev, idx) {
      var catColor = CAT_COLORS[ev.category] || '#9E9E9E';
      html +=
        '<div class="qt-task-item ' + (ev.checked ? '' : 'qt-task-unchecked') + '">' +
          '<label class="qt-task-check"><input type="checkbox" class="calsub-item-cb" data-idx="' + idx + '" ' + (ev.checked ? 'checked' : '') + '></label>' +
          '<div class="qt-task-body">' +
            '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
              '<span class="qt-cat-badge" style="background:' + catColor + '">' + escapeHtml(ev.category) + '</span>' +
              '<input class="calsub-title-input form-input" style="flex:1;min-width:140px;padding:4px 8px;font-size:13px;height:28px" data-idx="' + idx + '" value="' + escapeHtml(ev.title) + '">' +
            '</div>' +
            '<div style="display:flex;gap:6px;margin-top:4px;align-items:center;flex-wrap:wrap">' +
              '<input type="date" class="calsub-date-input form-input" style="width:140px;padding:3px 8px;font-size:12px" data-idx="' + idx + '" value="' + escapeHtml(ev.dueDate) + '">' +
              '<select class="calsub-cat-sel form-select" style="width:100px;padding:3px 6px;font-size:12px" data-idx="' + idx + '">' +
                ['일반업무','교육일정','행사','대관','차량','기타'].map(function(c){
                  return '<option value="'+c+'"'+(c===ev.category?' selected':'')+'>'+c+'</option>';
                }).join('') +
              '</select>' +
              (ev.location ? '<span style="font-size:11px;color:#888">📍 '+escapeHtml(ev.location)+'</span>' : '') +
            '</div>' +
            (ev.content ? '<div class="qt-task-content">' + escapeHtml(ev.content.slice(0,100)) + (ev.content.length > 100 ? '...' : '') + '</div>' : '') +
          '</div>' +
        '</div>';
    });

    html += '</div>';
    wrap.innerHTML = html;

    var checkAll = $q('calsub-check-all');
    if (checkAll) checkAll.addEventListener('change', function () {
      CS.events.forEach(function (e) { e.checked = checkAll.checked; });
      renderCalSubEventList();
    });

    wrap.querySelectorAll('.calsub-item-cb').forEach(function (cb) {
      cb.addEventListener('change', function () {
        CS.events[parseInt(this.dataset.idx)].checked = this.checked;
        this.closest('.qt-task-item').classList.toggle('qt-task-unchecked', !this.checked);
        updateCalSubCheckAll();
        updateCalSubRegBtn();
      });
    });

    wrap.querySelectorAll('.calsub-title-input').forEach(function (inp) {
      inp.addEventListener('input', function () { CS.events[parseInt(this.dataset.idx)].title = this.value; });
    });
    wrap.querySelectorAll('.calsub-date-input').forEach(function (inp) {
      inp.addEventListener('change', function () { CS.events[parseInt(this.dataset.idx)].dueDate = this.value; });
    });
    wrap.querySelectorAll('.calsub-cat-sel').forEach(function (sel) {
      sel.addEventListener('change', function () {
        CS.events[parseInt(this.dataset.idx)].category = this.value;
        renderCalSubEventList();
      });
    });

    updateCalSubRegBtn();
  }

  function updateCalSubCheckAll() {
    var cb = $q('calsub-check-all');
    if (!cb) return;
    var n = CS.events.filter(function (e) { return e.checked; }).length;
    cb.checked = (n === CS.events.length && n > 0);
    cb.indeterminate = (n > 0 && n < CS.events.length);
  }

  function updateCalSubRegBtn() {
    var cnt = CS.events.filter(function (e) { return e.checked; }).length;
    var btn = $q('calsub-register-btn');
    var lbl = $q('calsub-selected-count');
    if (btn) btn.disabled = (cnt === 0);
    if (lbl) lbl.textContent = cnt + '건 선택됨';
  }

  function renderCalSubTargetBadge() {
    var badge = $q('calsub-target-badge');
    if (!badge) return;
    if (CS.targetCalendar) {
      badge.innerHTML =
        '<span style="display:inline-flex;align-items:center;gap:4px">' +
          '<span style="width:9px;height:9px;border-radius:50%;background:' + CS.targetCalendar.color + '"></span>' +
          escapeHtml(CS.targetCalendar.name) +
        '</span>';
    } else {
      badge.textContent = '미선택';
    }
  }

  /* ── 구독 업무 등록 ─────────────────────────────────────── */
  async function registerCalSubTasks() {
    var tasks = CS.events.filter(function (e) { return e.checked && e.title; });
    if (tasks.length === 0) { toast('등록할 항목을 선택하세요.', 'warning'); return; }

    var me  = window._workMe || {};
    var btn = $q('calsub-register-btn');
    if (btn) { btn.disabled = true; btn.textContent = '등록 중...'; }

    var success = 0, fail = 0;
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      try {
        var taskData = {
          id: genId(), title: t.title, content: t.content || '',
          category: t.category, type: '알림',
          fromId: me.id||'', fromName: me.name||me.googleEmail||'',
          toIds: me.id||'', toNames: me.name||'',
          shareScope: '개인', dueDate: t.dueDate||'',
          createdAt: new Date().toISOString(), calEventId: '',
        };

        if (CS.targetCalendar && t.dueDate) {
          try {
            var token = Auth.getToken();
            var calResp = await fetch(
              'https://www.googleapis.com/calendar/v3/calendars/' +
              encodeURIComponent(CS.targetCalendar.id) + '/events',
              {
                method: 'POST',
                headers: { 'Authorization': 'Bearer '+token, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  summary: '[업무] '+t.title, description: t.content||'',
                  start: { date: t.dueDate }, end: { date: t.dueDate },
                }),
              }
            );
            if (calResp.ok) { var calData = await calResp.json(); taskData.calEventId = calData.id||''; }
          } catch (e2) {}
        }

        if (typeof SheetsModule !== 'undefined' && SheetsModule.createTask) {
          await SheetsModule.createTask(taskData);
        }
        if (typeof SheetsModule !== 'undefined' && SheetsModule.createReceived && me.id) {
          await SheetsModule.createReceived(taskData.id, [{ userId: me.id, userName: me.name||'' }]);
        }
        success++;
      } catch (err) {
        fail++;
        console.warn('calsub register err', err);
      }
    }

    if (btn) { btn.disabled = false; btn.textContent = '✅ 업무 등록'; }
    if (success > 0) {
      toast('✅ '+success+'건 등록 완료!'+(fail?' ('+fail+'건 실패)':''), 'success');
      CS.events = CS.events.filter(function (e) { return !e.checked; });
      renderCalSubEventList();
      if (typeof WorkModule !== 'undefined' && WorkModule.refreshInbox) WorkModule.refreshInbox();
    } else {
      toast('등록 실패. 로그인 상태를 확인하세요.', 'error');
    }
  }

  /* ── 설정/모달 이벤트 바인딩 (init에서 호출) ──────────────── */
  function initCalSub() {
    // 설정 탭
    renderCalSubSettings();

    var addBtn = $q('calsub-add-btn');
    if (addBtn) addBtn.addEventListener('click', addCalSub);

    var urlInput = $q('calsub-url-input');
    if (urlInput) urlInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') addCalSub();
    });

    var settingsFetchBtn = $q('calsub-fetch-btn');
    if (settingsFetchBtn) settingsFetchBtn.addEventListener('click', openCalSubModal);

    // 업무 탭 버튼
    var workImportBtn = $q('work-cal-import-btn');
    if (workImportBtn) workImportBtn.addEventListener('click', openCalSubModal);

    // 모달 닫기
    var closeBtn = $q('calsub-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { $q('calsub-modal').hidden = true; });

    // 불러오기
    var loadBtn = $q('calsub-load-btn');
    if (loadBtn) loadBtn.addEventListener('click', loadCalSubEvents);

    // 등록할 캘린더 선택
    var targetBtn = $q('calsub-select-target-btn');
    if (targetBtn) targetBtn.addEventListener('click', function () {
      if (typeof ReservationUtil !== 'undefined') {
        ReservationUtil.showCalendarPicker(function (cal) {
          CS.targetCalendar = cal;
          renderCalSubTargetBadge();
          toast(cal.name + '이(가) 선택되었습니다.', 'success');
        });
      }
    });

    // 등록
    var regBtn = $q('calsub-register-btn');
    if (regBtn) regBtn.addEventListener('click', registerCalSubTasks);
  }

  /* ────────────────────────────────────────────────────────────
     공개 인터페이스
  ──────────────────────────────────────────────────────────── */
  return {
    init: function () { init(); initCalSub(); },
    open: open,
    close: close,
    openCalSubModal: openCalSubModal,
    renderCalSubSettings: renderCalSubSettings,
  };

})();
