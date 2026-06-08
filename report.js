'use strict';

/**
 * report.js — 주간업무보고서 모듈 v2
 * 노출: window.ReportModule = { init: initReportModule }
 * 의존: config.js, auth.js (선택)
 */
(function () {

  /* ══════════════════════════════════════════════════════
     상수
  ══════════════════════════════════════════════════════ */
  var LS_KEY = 'asea_weekly_reports';

  var PROXY_URL = (typeof CONFIG !== 'undefined' && CONFIG.checkinProxyUrl)
    ? CONFIG.checkinProxyUrl : '';

  var DEPT_LIST = [
    '01. 기획처','02. 교육지원처','03. 입학처','04. 항공정비계열',
    '05. 안전관리처','06. 관광통역계열','07. 보안경호계열','08. 국방계열',
    '09. 시설관리팀','10. 기종교육팀','11. 무인기계열','12. 온라인평생교육원',
    '13. 비행교육원','14. 용산캠퍼스','15. 평생직능교육원','16. 기타'
  ];

  var DAYS = ['mon','tue','wed','thu','fri'];
  var DAY_KR = {mon:'월',tue:'화',wed:'수',thu:'목',fri:'금'};

  var STATUS_LIST = ['작성 중','검토 중','작성 완료'];
  var STATUS_CHIP = {'작성 중':'rpt-chip-draft','검토 중':'rpt-chip-review','작성 완료':'rpt-chip-done'};

  /* ══════════════════════════════════════════════════════
     상태
  ══════════════════════════════════════════════════════ */
  var _reports   = [];
  var _editingId = null;
  var _isNew     = false;
  var _pastedImages = [];   // {id, dataUrl, name}
  var _parseResult  = null; // parseReportText 결과

  /* ══════════════════════════════════════════════════════
     유틸
  ══════════════════════════════════════════════════════ */
  function $r(id) { return document.getElementById(id); }

  function toast(msg, type) {
    if (typeof window.aseaToast === 'function') window.aseaToast(msg, type);
    else alert(msg);
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function today() {
    var d = new Date();
    return d.getFullYear() + '.' + pad(d.getMonth()+1) + '.' + pad(d.getDate()) + '.';
  }

  function computeWeekNumber(date) {
    var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    var dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  function defaultAttendance() {
    var att = {};
    DAYS.forEach(function(d) { att[d] = {annualLeave:'0/0', trip:'0', note:''}; });
    return att;
  }

  function newReport() {
    var now = new Date();
    return {
      id: 'rpt_' + Date.now(),
      year: now.getFullYear(),
      week: computeWeekNumber(now),
      department: DEPT_LIST[0],
      writerName: '', writerTitle: '',
      reviewerName: '', reviewerTitle: '',
      writeDate: today(),
      thisWeekRange: '', nextWeekRange: '',
      status: '작성 중',
      staffTotal: '',
      attendance: defaultAttendance(),
      trainees: [],
      completed: '', planned: '', issues: '', notices: '',
      images: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function isAdmin() {
    try {
      return typeof Auth !== 'undefined' && Auth.isAdmin && Auth.isAdmin();
    } catch(e) { return false; }
  }

  /* ══════════════════════════════════════════════════════
     데이터 로드 / 저장
  ══════════════════════════════════════════════════════ */
  function loadReports(cb) {
    if (PROXY_URL) {
      fetch(PROXY_URL + '?action=getWeeklyReports')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (Array.isArray(data)) {
            _reports = data;
            try { localStorage.setItem(LS_KEY, JSON.stringify(_reports)); } catch(e) {}
          }
          if (cb) cb();
        })
        .catch(function() {
          _loadFromLS();
          if (cb) cb();
        });
    } else {
      _loadFromLS();
      if (cb) cb();
    }
  }

  function _loadFromLS() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      _reports = raw ? JSON.parse(raw) : [];
    } catch(e) { _reports = []; }
  }

  function saveReport(report) {
    report.updatedAt = new Date().toISOString();
    var idx = _reports.findIndex(function(r) { return r.id === report.id; });
    if (idx >= 0) _reports[idx] = report; else _reports.push(report);
    try { localStorage.setItem(LS_KEY, JSON.stringify(_reports)); } catch(e) {}

    if (PROXY_URL) {
      fetch(PROXY_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'saveWeeklyReport', data: report})
      }).catch(function() {});
    }
  }

  function deleteReport(id) {
    _reports = _reports.filter(function(r) { return r.id !== id; });
    try { localStorage.setItem(LS_KEY, JSON.stringify(_reports)); } catch(e) {}
    if (PROXY_URL) {
      fetch(PROXY_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'deleteWeeklyReport', id: id})
      }).catch(function() {});
    }
  }

  /* ══════════════════════════════════════════════════════
     렌더: 목록
  ══════════════════════════════════════════════════════ */
  function renderList() {
    var wrap = $r('rpt-root');
    if (!wrap) return;
    _editingId = null;

    // 필터 값
    var fYear  = ($r('rpt-f-year')  || {}).value || '';
    var fWeek  = ($r('rpt-f-week')  || {}).value || '';
    var fDept  = ($r('rpt-f-dept')  || {}).value || '';
    var fStat  = ($r('rpt-f-stat')  || {}).value || '';

    var filtered = _reports.filter(function(r) {
      if (fYear && String(r.year) !== fYear) return false;
      if (fWeek && String(r.week) !== fWeek) return false;
      if (fDept && r.department !== fDept) return false;
      if (fStat && r.status !== fStat) return false;
      return true;
    });

    // 연도 옵션
    var years = Array.from(new Set(_reports.map(function(r) { return r.year; }))).sort();
    // 주차 옵션
    var weeks = Array.from(new Set(_reports.map(function(r) { return r.week; }))).sort(function(a,b){return a-b;});
    // 부서 옵션
    var depts = Array.from(new Set(_reports.map(function(r) { return r.department; }))).sort();

    var newBtn = isAdmin()
      ? '<button class="rpt-btn rpt-btn-primary" id="rpt-new-btn">＋ 새 보고서 작성</button>'
      : '';

    var yearOpts = '<option value="">전체 연도</option>' +
      years.map(function(y) { return '<option value="'+y+'"'+(fYear===String(y)?' selected':'')+'>'+y+'년</option>'; }).join('');
    var weekOpts = '<option value="">전체 주차</option>' +
      weeks.map(function(w) { return '<option value="'+w+'"'+(fWeek===String(w)?' selected':'')+'>'+w+'주차</option>'; }).join('');
    var deptOpts = '<option value="">전체 부서</option>' +
      depts.map(function(d) { return '<option value="'+esc(d)+'"'+(fDept===d?' selected':'')+'>'+esc(d)+'</option>'; }).join('');
    var statOpts = '<option value="">전체 상태</option>' +
      STATUS_LIST.map(function(s) { return '<option value="'+esc(s)+'"'+(fStat===s?' selected':'')+'>'+esc(s)+'</option>'; }).join('');

    var cards = filtered.length === 0
      ? '<div class="rpt-empty"><div class="rpt-empty-icon">📋</div><div class="rpt-empty-text">보고서가 없습니다.</div></div>'
      : '<div class="rpt-cards">' + filtered.map(renderCard).join('') + '</div>';

    wrap.innerHTML =
      '<div class="rpt-container">' +
        '<div class="rpt-list-actions">' +
          newBtn +
          '<button class="rpt-btn rpt-btn-ghost" id="rpt-refresh-btn">↻ 새로고침</button>' +
        '</div>' +
        '<div class="rpt-filters">' +
          '<select class="rpt-select" id="rpt-f-year">' + yearOpts + '</select>' +
          '<select class="rpt-select" id="rpt-f-week">' + weekOpts + '</select>' +
          '<select class="rpt-select" id="rpt-f-dept">' + deptOpts + '</select>' +
          '<select class="rpt-select" id="rpt-f-stat">' + statOpts + '</select>' +
        '</div>' +
        cards +
      '</div>';

    if ($r('rpt-new-btn')) {
      $r('rpt-new-btn').addEventListener('click', function() {
        _isNew = true;
        renderEditor(newReport());
      });
    }
    if ($r('rpt-refresh-btn')) {
      $r('rpt-refresh-btn').addEventListener('click', function() {
        loadReports(renderList);
      });
    }
    ['rpt-f-year','rpt-f-week','rpt-f-dept','rpt-f-stat'].forEach(function(id) {
      var el = $r(id);
      if (el) el.addEventListener('change', renderList);
    });

    // 카드 버튼 이벤트
    wrap.querySelectorAll('[data-edit]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.dataset.edit;
        var rpt = _reports.find(function(r) { return r.id === id; });
        if (rpt) { _isNew = false; renderEditor(rpt); }
      });
    });
    wrap.querySelectorAll('[data-view]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.dataset.view;
        var rpt = _reports.find(function(r) { return r.id === id; });
        if (rpt) { _isNew = false; renderEditor(rpt, true); }
      });
    });
  }

  function renderCard(r) {
    var chipClass = STATUS_CHIP[r.status] || 'rpt-chip-draft';
    var editBtn = isAdmin()
      ? '<button class="rpt-btn rpt-btn-sm rpt-btn-secondary" data-edit="'+r.id+'">편집</button>'
      : '';
    return '<div class="rpt-card">' +
      '<div class="rpt-card-head">' +
        '<span class="rpt-week-badge">'+r.year+'년 '+r.week+'주차</span>' +
        '<span class="rpt-card-dept">'+esc(r.department)+'</span>' +
        '<span class="rpt-chip '+chipClass+'">'+esc(r.status)+'</span>' +
      '</div>' +
      '<div class="rpt-card-meta">' +
        '<span>작성자: '+esc(r.writerTitle)+' '+esc(r.writerName)+'</span>' +
        '<span>'+esc(r.writeDate)+'</span>' +
      '</div>' +
      '<div class="rpt-card-actions">' +
        editBtn +
        '<button class="rpt-btn rpt-btn-sm rpt-btn-ghost" data-view="'+r.id+'">보기</button>' +
      '</div>' +
    '</div>';
  }

  /* ══════════════════════════════════════════════════════
     렌더: 편집기
  ══════════════════════════════════════════════════════ */
  function renderEditor(report, readOnly) {
    _editingId = report.id;
    _pastedImages = (report.images || []).slice();
    _parseResult  = null;
    readOnly = !!readOnly;

    var wrap = $r('rpt-root');
    if (!wrap) return;

    var deptOptions = DEPT_LIST.map(function(d) {
      return '<option value="'+esc(d)+'"'+(report.department===d?' selected':'')+'>'+esc(d)+'</option>';
    }).join('');

    var statusOptions = STATUS_LIST.map(function(s) {
      return '<option value="'+esc(s)+'"'+(report.status===s?' selected':'')+'>'+esc(s)+'</option>';
    }).join('');

    var toolbar = '<div class="rpt-toolbar">' +
      '<button class="rpt-btn rpt-btn-ghost" id="rpt-back-btn">← 목록</button>' +
      (readOnly ? '' :
        '<button class="rpt-btn rpt-btn-primary" id="rpt-save-btn">💾 저장</button>' +
        '<button class="rpt-btn rpt-btn-secondary" id="rpt-status-btn">상태 변경</button>'
      ) +
      '<button class="rpt-btn rpt-btn-ghost" id="rpt-print-btn">🖨 인쇄</button>' +
      ((!readOnly && !_isNew)
        ? '<button class="rpt-btn rpt-btn-danger" id="rpt-del-btn">🗑 삭제</button>'
        : '') +
    '</div>';

    var headerBanner = '<div class="rpt-header-banner">' +
      '<div class="rpt-header-title">📋 주간업무보고서</div>' +
      '<div class="rpt-header-sub">' +
        report.year+'년 '+report.week+'주차 · '+esc(report.department)+' · ' +
        '<span class="rpt-chip '+(STATUS_CHIP[report.status]||'rpt-chip-draft')+'">'+esc(report.status)+'</span>' +
      '</div>' +
    '</div>';

    // ─── Section 1 기본정보 ───────────────────────────────
    var sec1 = makeSection('📝', '기본정보',
      '<div class="rpt-grid">' +
        field('작성부서',
          '<select class="rpt-select-input" id="rpt-f-department"'+ro(readOnly)+'>'+deptOptions+'</select>'
        ) +
        fieldInput('주차', 'rpt-f-week-num', report.week, 'number', readOnly) +
        fieldInput('작성일', 'rpt-f-writedate', report.writeDate, 'text', readOnly) +
        fieldInput('작성자 직위', 'rpt-f-wt', report.writerTitle, 'text', readOnly) +
        fieldInput('작성자 이름', 'rpt-f-wn', report.writerName, 'text', readOnly) +
        fieldInput('검토자 직위', 'rpt-f-rt', report.reviewerTitle, 'text', readOnly) +
        fieldInput('검토자 이름', 'rpt-f-rn', report.reviewerName, 'text', readOnly) +
        '<div class="rpt-full">' +
          '<div class="rpt-grid">' +
            fieldInput('금주 보고기간', 'rpt-f-this', report.thisWeekRange, 'text', readOnly) +
            fieldInput('차주 계획기간', 'rpt-f-next', report.nextWeekRange, 'text', readOnly) +
          '</div>' +
        '</div>' +
      '</div>'
    );

    // ─── Section 2 근태현황 ───────────────────────────────
    var sec2 = makeSection('📅', '근태현황', renderAttendanceTable(report, readOnly));

    // ─── Section 3 훈련생현황 ─────────────────────────────
    var sec3 = makeSection('🎓', '훈련생/재학생 현황', renderTraineeTable(report, readOnly));

    // ─── Section 4 업무보고 ───────────────────────────────
    var workSections = [
      {key:'completed', icon:'✅', label:'처리완료 및 진행 중 업무', val: report.completed||''},
      {key:'planned',   icon:'📌', label:'추진 및 계획 업무',       val: report.planned||''},
      {key:'issues',    icon:'⚠️', label:'주요 이슈',               val: report.issues||''},
      {key:'notices',   icon:'📢', label:'안내/협조 사항',           val: report.notices||''}
    ];
    var workHtml = workSections.map(function(ws) {
      return '<div class="rpt-work-section">' +
        '<div class="rpt-work-label">' +
          '<span class="rpt-work-icon">'+ws.icon+'</span>' +
          '<span>'+ws.label+'</span>' +
        '</div>' +
        '<textarea class="rpt-textarea" id="rpt-f-'+ws.key+'"'+
          (readOnly ? ' readonly' : '')+
          '>'+esc(ws.val)+'</textarea>' +
        '<div class="rpt-image-zone" id="rpt-imgzone-'+ws.key+'" data-section="'+ws.key+'">' +
          '<div class="rpt-image-zone-hint">📎 이미지 붙여넣기 영역 (Ctrl+V)</div>' +
          '<div class="rpt-image-thumbs" id="rpt-thumbs-'+ws.key+'"></div>' +
        '</div>' +
      '</div>';
    }).join('');
    var sec4 = makeSection('📊', '업무보고', workHtml);

    // ─── Section 5 스마트 붙여넣기 ───────────────────────
    var smartPaste = readOnly ? '' :
      '<div class="rpt-smart-paste" id="rpt-smart-paste">' +
        '<div class="rpt-paste-title">🤖 스마트 붙여넣기 — 텍스트를 분석해 자동으로 섹션에 채웁니다</div>' +
        '<div class="rpt-paste-zone" id="rpt-paste-zone" contenteditable="true" spellcheck="false"></div>' +
        '<div class="rpt-paste-actions">' +
          '<button class="rpt-btn rpt-btn-primary rpt-btn-sm" id="rpt-parse-btn">🔍 전체 분석</button>' +
          '<button class="rpt-btn rpt-btn-ghost rpt-btn-sm" id="rpt-paste-clear">지우기</button>' +
        '</div>' +
        '<div id="rpt-parse-preview" style="display:none"></div>' +
      '</div>';

    wrap.innerHTML =
      '<div class="rpt-container">' +
        toolbar +
        '<div class="rpt-editor" id="rpt-print-area">' +
          headerBanner +
          sec1 + sec2 + sec3 + sec4 +
        '</div>' +
        smartPaste +
      '</div>';

    // 이미지 썸네일 복원
    _pastedImages.forEach(function(img) {
      var sec = img.insertedIn || 'completed';
      appendThumb(img, sec);
    });

    // 이벤트 바인딩
    $r('rpt-back-btn').addEventListener('click', function() {
      loadReports(renderList);
    });

    if ($r('rpt-print-btn')) {
      $r('rpt-print-btn').addEventListener('click', function() { window.print(); });
    }

    if ($r('rpt-save-btn')) {
      $r('rpt-save-btn').addEventListener('click', function() {
        doSave(report);
      });
    }

    if ($r('rpt-status-btn')) {
      $r('rpt-status-btn').addEventListener('click', function() {
        var cur = STATUS_LIST.indexOf(report.status);
        report.status = STATUS_LIST[(cur + 1) % STATUS_LIST.length];
        toast('상태 변경: ' + report.status, 'info');
        doSave(report);
      });
    }

    if ($r('rpt-del-btn')) {
      $r('rpt-del-btn').addEventListener('click', function() {
        if (!confirm('이 보고서를 삭제하시겠습니까?')) return;
        deleteReport(report.id);
        toast('삭제되었습니다.', 'success');
        loadReports(renderList);
      });
    }

    // 근태 총원
    var staffInput = $r('rpt-f-staff-total');
    if (staffInput) staffInput.addEventListener('change', function() {
      report.staffTotal = staffInput.value;
    });

    // 훈련생 행 추가 버튼
    if ($r('rpt-add-trainee-btn')) {
      $r('rpt-add-trainee-btn').addEventListener('click', function() {
        report.trainees.push({
          no: report.trainees.length + 1,
          courseName:'', startDate:'', endDate:'', enrolled:'', current:'', note:''
        });
        var tbody = $r('rpt-trainee-tbody');
        if (tbody) {
          var tr = buildTraineeRow(report.trainees[report.trainees.length - 1],
            report.trainees.length - 1, readOnly);
          tbody.insertAdjacentHTML('beforeend', tr);
          bindTraineeRow(tbody.lastElementChild, report);
        }
      });
    }

    // 이미지 존 paste 바인딩
    ['completed','planned','issues','notices'].forEach(function(sec) {
      var zone = $r('rpt-imgzone-' + sec);
      if (zone) {
        zone.addEventListener('paste', function(e) {
          handleImagePaste(e, sec);
        });
        zone.addEventListener('click', function() {
          var ta = $r('rpt-f-' + sec);
          if (ta) ta.focus();
        });
      }
    });

    // 스마트 붙여넣기
    if (!readOnly) initSmartPaste(report);
  }

  /* ── 헬퍼: 섹션 HTML ──────────────────────────────── */
  function makeSection(icon, title, bodyHtml) {
    return '<div class="rpt-section">' +
      '<div class="rpt-section-title"><span class="rpt-section-icon">'+icon+'</span>'+title+'</div>' +
      '<div class="rpt-section-body">'+bodyHtml+'</div>' +
    '</div>';
  }
  function field(label, inputHtml) {
    return '<div class="rpt-field"><label class="rpt-label">'+label+'</label>'+inputHtml+'</div>';
  }
  function fieldInput(label, id, val, type, readOnly) {
    return field(label,
      '<input class="rpt-input" id="'+id+'" type="'+(type||'text')+'" value="'+esc(val||'')+'"'+(readOnly?' readonly':'')+'>');
  }
  function ro(readOnly) { return readOnly ? ' disabled' : ''; }
  function esc(s) {
    return String(s||'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  /* ── 근태현황 테이블 ─────────────────────────────────── */
  function renderAttendanceTable(report, readOnly) {
    var att = report.attendance || defaultAttendance();
    var headers = '<tr><th>구분</th><th>월</th><th>화</th><th>수</th><th>목</th><th>금</th><th>비고</th></tr>';

    function attInput(day, field, val, cls) {
      return '<input class="rpt-att-input '+(cls||'')+'" id="rpt-att-'+day+'-'+field+'" '+
        'value="'+esc(val||'')+'"'+(readOnly?' readonly':'')+' placeholder="'+
        (field==='annualLeave'?'0/0':field==='trip'?'0':'')+'"/>';
    }

    var rowAnnual = '<tr><td>연차/반차</td>' +
      DAYS.map(function(d) {
        return '<td>'+attInput(d,'annualLeave',att[d].annualLeave)+'</td>';
      }).join('') + '<td></td></tr>';

    var rowTrip = '<tr><td>출장</td>' +
      DAYS.map(function(d) {
        return '<td>'+attInput(d,'trip',att[d].trip)+'</td>';
      }).join('') + '<td></td></tr>';

    var rowNote = '<tr><td>비고</td>' +
      DAYS.map(function(d) {
        return '<td><input class="rpt-att-note" id="rpt-att-'+d+'-note" value="'+esc(att[d].note||'')+'"'+(readOnly?' readonly':'')+'></td>';
      }).join('') + '<td></td></tr>';

    return '<div class="rpt-staff-row">' +
        '<label class="rpt-label" style="white-space:nowrap">총원</label>' +
        '<input class="rpt-input" id="rpt-f-staff-total" style="width:80px" value="'+esc(report.staffTotal||'')+'"'+(readOnly?' readonly':'')+'>' +
      '</div>' +
      '<div class="rpt-att-table-wrap">' +
        '<table class="rpt-att-table">' +
          headers + rowAnnual + rowTrip + rowNote +
        '</table>' +
      '</div>';
  }

  /* ── 훈련생 현황 테이블 ──────────────────────────────── */
  function renderTraineeTable(report, readOnly) {
    var rows = (report.trainees || []).map(function(t, i) {
      return buildTraineeRow(t, i, readOnly);
    }).join('');

    return '<div style="overflow-x:auto">' +
      '<table class="rpt-trainee-table">' +
        '<thead><tr>' +
          '<th style="width:40px">No.</th>' +
          '<th>훈련과정명</th>' +
          '<th style="width:100px">시작일</th>' +
          '<th style="width:100px">종료일</th>' +
          '<th style="width:80px">입과/현재인원</th>' +
          '<th>비고</th>' +
          (readOnly ? '' : '<th style="width:36px"></th>') +
        '</tr></thead>' +
        '<tbody id="rpt-trainee-tbody">' + rows + '</tbody>' +
      '</table>' +
    '</div>' +
    (readOnly ? '' :
      '<button class="rpt-btn rpt-btn-ghost rpt-btn-sm" id="rpt-add-trainee-btn" style="margin-top:8px">+ 행 추가</button>');
  }

  function buildTraineeRow(t, i, readOnly) {
    function ti(f, v, w) {
      return '<input type="text" id="rpt-tr-'+i+'-'+f+'" value="'+esc(v||'')+'"'+
        (readOnly?' readonly':'')+
        (w?' style="width:'+w+'"':'')+'/>';
    }
    return '<tr data-trainee-idx="'+i+'">' +
      '<td style="text-align:center">'+ti('no', t.no, '36px')+'</td>' +
      '<td>'+ti('courseName', t.courseName)+'</td>' +
      '<td>'+ti('startDate', t.startDate)+'</td>' +
      '<td>'+ti('endDate', t.endDate)+'</td>' +
      '<td>'+ti('enrolled', (t.enrolled||'')+'/'+(t.current||''))+'</td>' +
      '<td>'+ti('note', t.note)+'</td>' +
      (readOnly ? '' : '<td><button class="rpt-trainee-del" data-del-idx="'+i+'">×</button></td>') +
    '</tr>';
  }

  function bindTraineeRow(tr, report) {
    var delBtn = tr.querySelector('.rpt-trainee-del');
    if (delBtn) {
      delBtn.addEventListener('click', function() {
        var idx = parseInt(delBtn.dataset.delIdx, 10);
        report.trainees.splice(idx, 1);
        var tbody = $r('rpt-trainee-tbody');
        if (tbody) tbody.innerHTML = report.trainees.map(function(t,i) {
          return buildTraineeRow(t, i, false);
        }).join('');
        tbody.querySelectorAll('tr').forEach(function(row) {
          bindTraineeRow(row, report);
        });
      });
    }
  }

  /* ══════════════════════════════════════════════════════
     저장 (form 값 수집)
  ══════════════════════════════════════════════════════ */
  function doSave(report) {
    var r = report;

    // 기본정보
    var deptEl = $r('rpt-f-department');
    if (deptEl) r.department = deptEl.value;
    var wn = $r('rpt-f-week-num');
    if (wn) r.week = parseInt(wn.value, 10) || r.week;
    r.writeDate     = val('rpt-f-writedate') || r.writeDate;
    r.writerTitle   = val('rpt-f-wt');
    r.writerName    = val('rpt-f-wn');
    r.reviewerTitle = val('rpt-f-rt');
    r.reviewerName  = val('rpt-f-rn');
    r.thisWeekRange = val('rpt-f-this');
    r.nextWeekRange = val('rpt-f-next');

    // 근태
    r.staffTotal = val('rpt-f-staff-total');
    if (!r.attendance) r.attendance = defaultAttendance();
    DAYS.forEach(function(d) {
      r.attendance[d].annualLeave = val('rpt-att-'+d+'-annualLeave') || '0/0';
      r.attendance[d].trip        = val('rpt-att-'+d+'-trip') || '0';
      r.attendance[d].note        = val('rpt-att-'+d+'-note');
    });

    // 훈련생 (tbody에서 읽기)
    var tbody = $r('rpt-trainee-tbody');
    if (tbody) {
      var rows = tbody.querySelectorAll('tr[data-trainee-idx]');
      r.trainees = [];
      rows.forEach(function(tr, i) {
        var enrolled = val('rpt-tr-'+i+'-enrolled') || '/';
        var parts = enrolled.split('/');
        r.trainees.push({
          no: val('rpt-tr-'+i+'-no') || (i+1),
          courseName: val('rpt-tr-'+i+'-courseName'),
          startDate:  val('rpt-tr-'+i+'-startDate'),
          endDate:    val('rpt-tr-'+i+'-endDate'),
          enrolled:   parts[0]||'',
          current:    parts[1]||'',
          note:       val('rpt-tr-'+i+'-note')
        });
      });
    }

    // 업무보고
    r.completed = val('rpt-f-completed');
    r.planned   = val('rpt-f-planned');
    r.issues    = val('rpt-f-issues');
    r.notices   = val('rpt-f-notices');

    // 이미지
    r.images = _pastedImages.slice();

    saveReport(r);
    toast('저장되었습니다.', 'success');

    // 헤더 뱅너 업데이트
    var bannerEl = document.querySelector('.rpt-header-sub');
    if (bannerEl) {
      bannerEl.innerHTML = r.year+'년 '+r.week+'주차 · '+esc(r.department)+' · ' +
        '<span class="rpt-chip '+(STATUS_CHIP[r.status]||'rpt-chip-draft')+'">'+esc(r.status)+'</span>';
    }
  }

  function val(id) {
    var el = $r(id);
    return el ? el.value : '';
  }

  /* ══════════════════════════════════════════════════════
     이미지 붙여넣기
  ══════════════════════════════════════════════════════ */
  function handleImagePaste(e, section) {
    var items = (e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData) || {}).items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        var file = items[i].getAsFile();
        if (!file) continue;
        (function(f, sec) {
          var reader = new FileReader();
          reader.onload = function(ev) {
            var img = {
              id: 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
              dataUrl: ev.target.result,
              name: f.name || ('image_' + Date.now() + '.png'),
              insertedIn: sec
            };
            _pastedImages.push(img);
            appendThumb(img, sec);
          };
          reader.readAsDataURL(f);
        })(file, section);
      }
    }
  }

  function appendThumb(img, section) {
    var container = $r('rpt-thumbs-' + section);
    if (!container) return;
    var item = document.createElement('div');
    item.className = 'rpt-thumb-item';
    item.dataset.imgId = img.id;
    item.innerHTML =
      '<img class="rpt-thumb-img" src="'+img.dataUrl+'" alt="'+esc(img.name)+'" title="'+esc(img.name)+'">' +
      '<button class="rpt-thumb-del" title="삭제">×</button>';
    item.querySelector('.rpt-thumb-del').addEventListener('click', function() {
      _pastedImages = _pastedImages.filter(function(p) { return p.id !== img.id; });
      item.parentNode.removeChild(item);
    });
    container.appendChild(item);
    // 힌트 숨기기
    var hint = container.parentNode.querySelector('.rpt-image-zone-hint');
    if (hint) hint.style.display = 'none';
  }

  /* ══════════════════════════════════════════════════════
     스마트 붙여넣기
  ══════════════════════════════════════════════════════ */
  function initSmartPaste(report) {
    var zone  = $r('rpt-paste-zone');
    var btn   = $r('rpt-parse-btn');
    var clear = $r('rpt-paste-clear');
    if (!zone) return;

    zone.addEventListener('paste', function(e) {
      var items = (e.clipboardData || {}).items || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          var file = items[i].getAsFile();
          if (file) handleImagePasteToZone(file);
        }
      }
    });

    if (btn) btn.addEventListener('click', function() {
      var text = zone.innerText || zone.textContent || '';
      if (!text.trim()) { toast('붙여넣기 영역이 비어 있습니다.', 'info'); return; }
      _parseResult = parseReportText(text);
      showParsePreview(_parseResult, report);
    });

    if (clear) clear.addEventListener('click', function() {
      zone.innerHTML = '';
      var preview = $r('rpt-parse-preview');
      if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
      _parseResult = null;
    });
  }

  function handleImagePasteToZone(file) {
    var reader = new FileReader();
    reader.onload = function(ev) {
      var img = {
        id: 'img_' + Date.now(),
        dataUrl: ev.target.result,
        name: file.name || ('paste_' + Date.now() + '.png'),
        insertedIn: 'completed'
      };
      _pastedImages.push(img);
      appendThumb(img, 'completed');
      toast('이미지가 추가되었습니다 (처리완료 섹션)', 'success');
    };
    reader.readAsDataURL(file);
  }

  function parseReportText(text) {
    var sections = { completed: '', planned: '', issues: '', notices: '' };
    var patterns = [
      { key: 'completed', re: /처리\s*완료|완료\s*및\s*진행|진행\s*중\s*업무/i },
      { key: 'planned',   re: /추진\s*및\s*계획|계획\s*업무|추진\s*업무/i },
      { key: 'issues',    re: /주요\s*이슈|이슈|현안/i },
      { key: 'notices',   re: /안내.*협조|협조.*안내|안내\s*사항|협조\s*사항/i }
    ];

    var lines = text.split(/\r?\n/);
    var currentKey = null;
    var buf = {};
    patterns.forEach(function(p) { buf[p.key] = []; });
    var unmatched = [];

    lines.forEach(function(line) {
      var matched = false;
      patterns.forEach(function(p) {
        if (!matched && p.re.test(line)) {
          currentKey = p.key;
          matched = true;
        }
      });
      if (!matched) {
        if (currentKey) {
          buf[currentKey].push(line);
        } else {
          unmatched.push(line);
        }
      }
    });

    // unmatched → completed에 넣기
    if (unmatched.length) {
      buf.completed = unmatched.concat(buf.completed);
    }

    patterns.forEach(function(p) {
      sections[p.key] = buf[p.key].join('\n').trim();
    });
    return sections;
  }

  function showParsePreview(sections, report) {
    var preview = $r('rpt-parse-preview');
    if (!preview) return;

    var LABELS = {
      completed: '처리완료/진행',
      planned:   '추진/계획',
      issues:    '주요 이슈',
      notices:   '안내/협조'
    };

    var html = '';
    var hasAny = false;
    Object.keys(sections).forEach(function(k) {
      var text = sections[k];
      if (!text) return;
      hasAny = true;
      html += '<div class="rpt-parse-item">' +
        '<span class="rpt-parse-key">'+LABELS[k]+'</span>' +
        '<span class="rpt-parse-text">'+esc(text.slice(0, 200)) + (text.length > 200 ? '…' : '') + '</span>' +
        '<button class="rpt-parse-btn" data-fill-key="'+k+'">이 섹션에 넣기</button>' +
      '</div>';
    });

    if (!hasAny) {
      preview.innerHTML = '<p style="padding:10px 14px;color:#666;font-size:13px">분석된 내용이 없습니다.</p>';
    } else {
      html += '<div style="padding:8px 14px;display:flex;gap:8px;justify-content:flex-end">' +
        '<button class="rpt-btn rpt-btn-primary rpt-btn-sm" id="rpt-fill-all">전체 적용</button>' +
      '</div>';
      preview.innerHTML = html;
    }
    preview.style.display = 'block';

    // 개별 섹션 채우기
    preview.querySelectorAll('[data-fill-key]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var k = btn.dataset.fillKey;
        var ta = $r('rpt-f-' + k);
        if (ta && sections[k]) {
          ta.value = (ta.value ? ta.value + '\n\n' : '') + sections[k];
          toast(LABELS[k] + ' 섹션에 추가했습니다.', 'success');
        }
      });
    });

    // 전체 적용
    var fillAll = $r('rpt-fill-all');
    if (fillAll) fillAll.addEventListener('click', function() {
      Object.keys(sections).forEach(function(k) {
        if (!sections[k]) return;
        var ta = $r('rpt-f-' + k);
        if (ta) ta.value = (ta.value ? ta.value + '\n\n' : '') + sections[k];
      });
      toast('전체 섹션에 적용되었습니다.', 'success');
    });
  }

  /* ══════════════════════════════════════════════════════
     공개 인터페이스
  ══════════════════════════════════════════════════════ */
  function initReportModule() {
    // rpt-root 컨테이너가 없으면 생성
    if (!$r('rpt-root')) {
      var container = document.querySelector('[data-tab-content="report"], #tab-report, .tab-content[data-tab="report"]');
      if (container) {
        var div = document.createElement('div');
        div.id = 'rpt-root';
        container.appendChild(div);
      }
    }
    loadReports(renderList);
  }

  /* ══════════════════════════════════════════════════════
     하위 호환 유지 (기존 ReportModule 메서드 보존)
  ══════════════════════════════════════════════════════ */
  var WEEK_RE = /(\d{4})-(\d+)주차/;
  function parseWeekInfo(fileName) {
    var m = WEEK_RE.exec(fileName || '');
    return { year: m ? parseInt(m[1],10):0, weekNumber: m ? parseInt(m[2],10):0 };
  }

  window.ReportModule = {
    /* 신규 기능 */
    init: initReportModule,

    /* 기존 API 유지 */
    generateKakaoText: function(fileName, driveLink) {
      var info = parseWeekInfo(fileName);
      var header = (info.year && info.weekNumber)
        ? '[주간업무보고] '+info.year+'년 '+info.weekNumber+'주차'
        : '[주간업무보고]';
      return header+'\n\n안녕하세요. 이번 주 업무보고서를 공유드립니다.\n\n📎 보고서: '+(driveLink||'')+'\n\n확인 부탁드립니다. 감사합니다.';
    },

    copyToClipboard: async function(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
        var el = document.createElement('textarea');
        el.value = text;
        el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        document.body.appendChild(el);
        el.focus(); el.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(el);
        return ok;
      } catch(e) { return false; }
    },

    buildReportSummary: function(fileInfo) {
      if (!fileInfo) return { weekLabel:'업무보고서', driveLink:'', calendarCandidates:[] };
      var year = fileInfo.year || 0;
      var week = fileInfo.weekNumber || 0;
      return {
        weekLabel: (year && week) ? year+'년 '+week+'주차' : '업무보고서',
        driveLink: fileInfo.webViewLink || '',
        calendarCandidates: []
      };
    },
  };

})();
