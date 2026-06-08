'use strict';

/**
 * quicktask.js — 빠른 업무 등록 모듈
 *
 * 기능:
 *  1. Ctrl+Shift+R → 빠른 업무 등록 모달 오픈
 *  2. 텍스트/이미지 붙여넣기 → Claude AI가 업무 목록 추출
 *  3. 추출된 업무를 개별 또는 일괄로 Google Calendar + Sheets에 등록
 *
 * 의존: config.js, auth.js, sheets.js, resutil.js (캘린더 피커)
 */
var QuickTaskModule = (function () {

  /* ────────────────────────────────────────────────────────────
     상태
  ──────────────────────────────────────────────────────────── */
  var Q = {
    extractedTasks: [],   // [{title, content, dueDate, category, checked}]
    pasteImageB64:  null, // 붙여넣기된 이미지 base64 (data:image/...;base64,xxx)
    pasteText:      '',   // 붙여넣기된 텍스트
    targetCalendar: null, // {id, name, color} 선택된 Google 캘린더
    isAnalyzing:    false,
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
    var apiKey = CONFIG.anthropicApiKey || localStorage.getItem('asea_anthropic_api_key') || '';
    if (!apiKey) {
      toast('설정 → Anthropic API Key를 먼저 등록해주세요.', 'error');
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
      var systemPrompt =
        '당신은 업무 일정 추출 AI입니다. 사용자가 붙여넣은 내용에서 업무/일정 항목들을 추출해 ' +
        'JSON 배열로만 반환하세요. 다른 설명 없이 JSON만 반환합니다.\n' +
        '각 항목 형식: {"title":"업무 제목","content":"상세 내용","dueDate":"YYYY-MM-DD 또는 빈문자열","category":"일반업무|교육일정|행사|대관|차량|기타"}\n' +
        '오늘 날짜: ' + today + '\n' +
        '날짜가 명시되지 않은 경우 dueDate는 빈문자열("")로 두세요.';

      var messages = [];

      if (Q.pasteImageB64) {
        // 이미지 비전 분석
        var base64data = Q.pasteImageB64.replace(/^data:[^;]+;base64,/, '');
        var mediaType  = (Q.pasteImageB64.match(/^data:([^;]+);/) || [])[1] || 'image/png';
        messages = [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64data } },
            { type: 'text', text: '위 이미지에서 업무/일정 항목들을 추출해 JSON 배열로 반환하세요.' }
          ]
        }];
      } else {
        messages = [{
          role: 'user',
          content: '다음 내용에서 업무/일정 항목들을 추출해 JSON 배열로 반환하세요:\n\n' + text
        }];
      }

      var resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify({
          model:      'claude-3-5-haiku-20241022',
          max_tokens: 1024,
          system:     systemPrompt,
          messages:   messages,
        }),
      });

      var data = await resp.json();
      if (!resp.ok) throw new Error((data.error && data.error.message) || '분석 실패');

      var rawText = (data.content && data.content[0] && data.content[0].text) || '';
      var parsed  = extractJsonArray(rawText);

      if (!parsed || parsed.length === 0) {
        toast('업무 항목을 찾지 못했습니다. 텍스트를 확인해주세요.', 'warning');
        return;
      }

      Q.extractedTasks = parsed.map(function (t) {
        return {
          id:       genId(),
          title:    (t.title || '').trim(),
          content:  (t.content || '').trim(),
          dueDate:  (t.dueDate || '').trim(),
          category: t.category || '일반업무',
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
            '<div style="display:flex;gap:6px;margin-top:4px;align-items:center;flex-wrap:wrap">' +
              '<input type="date" class="qt-task-date-input form-input" style="width:140px;padding:3px 8px;font-size:12px" data-idx="' + idx + '" value="' + escapeHtml(task.dueDate) + '">' +
              '<select class="qt-task-cat-sel form-select" style="width:100px;padding:3px 6px;font-size:12px" data-idx="' + idx + '">' +
                ['일반업무','교육일정','행사','대관','차량','기타'].map(function(c){
                  return '<option value="'+c+'"'+(c===task.category?' selected':'')+'>'+c+'</option>';
                }).join('') +
              '</select>' +
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

    wrap.querySelectorAll('.qt-task-cat-sel').forEach(function (sel) {
      sel.addEventListener('change', function () {
        Q.extractedTasks[parseInt(this.dataset.idx)].category = this.value;
        renderTaskList(); // 배지 색 업데이트
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
    var badge = $q('qt-cal-badge');
    if (!badge) return;
    if (Q.targetCalendar) {
      badge.innerHTML =
        '<span style="display:inline-flex;align-items:center;gap:5px">' +
          '<span style="width:10px;height:10px;border-radius:50%;background:' + Q.targetCalendar.color + '"></span>' +
          escapeHtml(Q.targetCalendar.name) +
        '</span>';
    } else {
      badge.textContent = '미선택 (Google 캘린더에 등록하지 않음)';
    }
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
        };

        // 2. Google 캘린더에도 등록 (캘린더가 선택된 경우)
        if (Q.targetCalendar && t.dueDate) {
          try {
            var token = Auth.getToken();
            var start = t.dueDate;
            var end   = t.dueDate;
            var eventBody = {
              summary:     '[업무] ' + t.title,
              description: t.content || '',
              start: { date: start },
              end:   { date: end   },
              colorId: '1',
            };
            var calResp = await fetch(
              'https://www.googleapis.com/calendar/v3/calendars/' +
              encodeURIComponent(Q.targetCalendar.id) + '/events',
              {
                method:  'POST',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                body:    JSON.stringify(eventBody),
              }
            );
            if (calResp.ok) {
              var calData = await calResp.json();
              taskData.calEventId = calData.id || '';
            }
          } catch (calErr) { /* 캘린더 실패해도 시트 등록은 진행 */ }
        }

        // Sheets 등록 (SheetsModule이 있으면)
        if (typeof SheetsModule !== 'undefined' && SheetsModule.createTask) {
          await SheetsModule.createTask(taskData);
        }

        // 수신함에 자기 자신에게도 등록 (개인 업무)
        if (typeof SheetsModule !== 'undefined' && SheetsModule.createReceived && me.id) {
          await SheetsModule.createReceived(taskData.id, [{
            userId: me.id, userName: me.name||'',
          }]);
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

    // textarea에 포커스 있으면 기본 동작 유지
    var active = document.activeElement;
    if (active && (active.id === 'qt-paste-text')) return;

    var items = (e.clipboardData || e.originalEvent && e.originalEvent.clipboardData);
    if (!items) return;

    // 이미지 확인
    var imageFile = null;
    for (var i = 0; i < items.items.length; i++) {
      var item = items.items[i];
      if (item.type && item.type.indexOf('image') !== -1) {
        imageFile = item.getAsFile();
        break;
      }
    }

    if (imageFile) {
      e.preventDefault();
      var reader = new FileReader();
      reader.onload = function (ev) {
        Q.pasteImageB64 = ev.target.result;
        Q.pasteText = '';
        var ta = $q('qt-paste-text');
        if (ta) ta.value = '';
        renderPasteZone();
        toast('이미지가 붙여넣기 되었습니다. AI 분석 버튼을 눌러주세요.', 'info');
      };
      reader.readAsDataURL(imageFile);
    } else {
      // 텍스트
      var txt = items.getData ? items.getData('text/plain') : '';
      if (txt && active && active.id !== 'qt-paste-text') {
        e.preventDefault();
        Q.pasteText = txt;
        Q.pasteImageB64 = null;
        var ta2 = $q('qt-paste-text');
        if (ta2) ta2.value = txt;
        renderPasteZone();
        toast('텍스트가 붙여넣기 되었습니다. AI 분석 버튼을 눌러주세요.', 'info');
      }
    }
  }

  /* ────────────────────────────────────────────────────────────
     초기화
  ──────────────────────────────────────────────────────────── */
  function init() {
    // ── Ctrl+Shift+R 단축키 ────────────────────────────────────
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
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

    // 캘린더 선택 버튼
    var calBtn = $q('qt-select-cal-btn');
    if (calBtn) calBtn.addEventListener('click', function () {
      if (typeof ReservationUtil !== 'undefined') {
        ReservationUtil.showCalendarPicker(function (cal) {
          Q.targetCalendar = cal;
          renderCalendarBadge();
          toast(cal.name + '이(가) 선택되었습니다.', 'success');
        });
      } else {
        toast('ReservationUtil이 로드되지 않았습니다.', 'error');
      }
    });

    // 캘린더 선택 해제 버튼
    var calClearBtn = $q('qt-clear-cal-btn');
    if (calClearBtn) calClearBtn.addEventListener('click', function () {
      Q.targetCalendar = null;
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
    hint.className = 'btn btn-ghost btn-sm';
    hint.title = '빠른 업무 등록 (Ctrl+Shift+R)';
    hint.innerHTML = '⚡ 빠른 등록 <kbd>Ctrl+Shift+R</kbd>';
    hint.style.cssText = 'font-size:11px;';
    hint.addEventListener('click', function () {
      if (typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn()) open();
      else toast('먼저 로그인이 필요합니다.', 'warning');
    });
    headerActions.prepend(hint);
  }

  /* ────────────────────────────────────────────────────────────
     공개 인터페이스
  ──────────────────────────────────────────────────────────── */
  return {
    init: init,
    open: open,
    close: close,
  };

})();
