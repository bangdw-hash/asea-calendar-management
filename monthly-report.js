'use strict';
/* ══════════════════════════════════════════════════════════════
   월간업무보고 모듈  (window.MonthlyReportModule)
   PDF 샘플: 월간업무보고_2026년 05월.pdf
   부서별 4섹션 구조: 이번달성과 / 현재중점사항 / 다음달계획 / 결정필요사항
══════════════════════════════════════════════════════════════ */
window.MonthlyReportModule = (function () {

  /* ── 상수 ── */
  var DEPT_OPTIONS = [
    '기획처','행정관리처','교육지원처','입학처',
    '항공정비계열','스마트안전진단계열','항공관광계열','항공보안계열','국방경찰계열',
    '기종교육원','무인항공교육원','비행교육원','용산캠퍼스','부설기관'
  ];

  var SECTIONS = [
    { key: 'achievements', label: '이번 달 성과', placeholder: '주요 성과를 번호 목록으로 입력\n예) 1. ○○ 완료 (날짜/수치)\n2. ○○ 진행' },
    { key: 'current',      label: '현재 중점사항', placeholder: '현재 진행 중인 주요 사항\n예) 1. ○○ 추진 중 (~일정)\n2. ○○ 검토 중' },
    { key: 'nextplan',     label: '다음 달 계획',  placeholder: '다음 달 계획을 번호 목록으로 입력\n예) 1. ○○ 예정 (날짜)\n2. ○○ 착수' },
    { key: 'decisions',    label: '결정 필요사항', placeholder: '상위 결정이 필요한 사항\n(없으면 "해당 없음" 입력)' },
  ];

  var SK_PREFIX = 'asea_monthly_rpt_';
  var DAYS_KO   = ['일','월','화','수','목','금','토'];

  /* ── 상태 ── */
  var _year    = new Date().getFullYear();
  var _month   = new Date().getMonth() + 1;
  var _date    = '';
  var _venue   = '대회의실';
  var _depts   = [];   // [{id, name, achievements, current, nextplan, decisions}]
  var _aiLoading = {}; // { deptId_sectionKey: true }
  var _container = null;

  /* ── 스토리지 ── */
  function _sk() { return SK_PREFIX + _year + '_' + String(_month).padStart(2,'0'); }

  function _load() {
    try {
      var d = JSON.parse(localStorage.getItem(_sk()) || 'null');
      if (d) { _date = d.date||''; _venue = d.venue||'대회의실'; _depts = d.depts||[]; }
      else   { _date=''; _venue='대회의실'; _depts=[]; }
    } catch(e) { _depts=[]; }
  }

  function _save() {
    try {
      localStorage.setItem(_sk(), JSON.stringify({ year:_year, month:_month, date:_date, venue:_venue, depts:_depts }));
    } catch(e) {}
    _showSaveToast();
  }

  /* ── 유틸 ── */
  function _uid() { return 'd'+Date.now()+'_'+Math.random().toString(36).slice(2,6); }
  function _pad(n) { return String(n).padStart(2,'0'); }
  function _fmtMonthLabel(y,m) { return y+'년 '+_pad(m)+'월'; }
  function _nextMonthLabel(y,m) { var nm=m+1,ny=y; if(nm>12){nm=1;ny++;} return ny+'년 '+_pad(nm)+'월'; }

  function _getDept(id) { return _depts.find(function(d){ return d.id===id; }); }

  function _showSaveToast() {
    if (typeof window.toast === 'function') window.toast('저장됐습니다.','success');
  }

  /* ── Claude API 호출 ── */
  function _resolveEndpoint(key) {
    var isOfficial = /^sk-ant-/.test(key);
    return {
      url: isOfficial ? 'https://api.anthropic.com/v1/messages' : 'https://api.amplifuse.io/v1/messages',
      isOfficial: isOfficial
    };
  }

  async function _callClaude(userPrompt, systemPrompt) {
    var apiKey = (typeof CONFIG !== 'undefined' && CONFIG.anthropicApiKey) ||
                 localStorage.getItem('asea_anthropic_api_key') || '';
    if (!apiKey) throw new Error('Claude API 키가 없습니다. 설정 탭에서 API 키를 먼저 입력해주세요.');
    var ep = _resolveEndpoint(apiKey);
    var headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    if (ep.isOfficial) headers['anthropic-dangerous-direct-browser-access'] = 'true';
    var resp = await fetch(ep.url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt || '당신은 교육기관 업무보고서 작성 전문 AI 비서입니다.',
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!resp.ok) {
      var err = await resp.json().catch(function(){ return {}; });
      throw new Error((err.error && err.error.message) || 'API 오류 '+resp.status);
    }
    var data = await resp.json();
    return data.content[0].text;
  }

  /* AI로 섹션 내용 다듬기 */
  async function _aiPolish(deptId, sectionKey, rawText) {
    var dept = _getDept(deptId);
    if (!dept) return;
    var sec = SECTIONS.find(function(s){ return s.key===sectionKey; });
    var sysPrompt =
      '당신은 교육기관 월간업무보고서 작성 전문가입니다.\n' +
      '다음 규칙에 따라 내용을 표준화하세요:\n' +
      '1. 번호 목록 형식 (1. 2. 3.)\n' +
      '2. 구체적 날짜·수치 포함 (예: 05.15., 10명, 85%)\n' +
      '3. 간결하고 명확한 문장 (복문 지양)\n' +
      '4. 불필요한 서두/마무리 문장 제거\n' +
      '5. 한국어로만 작성, 결과만 출력';
    var prompt =
      '부서: '+dept.name+'\n'+
      '섹션: '+sec.label+'\n\n'+
      '원본 내용:\n'+rawText+'\n\n'+
      '위 내용을 월간업무보고 형식으로 표준화해주세요. 번호 목록만 반환하세요.';
    return await _callClaude(prompt, sysPrompt);
  }

  /* 이미지를 Claude Vision으로 텍스트 추출 */
  async function _imageToText(base64, mimeType) {
    var apiKey = (typeof CONFIG !== 'undefined' && CONFIG.anthropicApiKey) ||
                 localStorage.getItem('asea_anthropic_api_key') || '';
    if (!apiKey) throw new Error('Claude API 키가 없습니다.');
    var ep = _resolveEndpoint(apiKey);
    var headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    if (ep.isOfficial) headers['anthropic-dangerous-direct-browser-access'] = 'true';
    var resp = await fetch(ep.url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text', text: '이 이미지에서 텍스트를 추출하고, 번호 목록 형식으로 정리해주세요. 텍스트만 출력하세요.' }
          ]
        }]
      }),
    });
    if (!resp.ok) throw new Error('이미지 분석 오류 '+resp.status);
    var data = await resp.json();
    return data.content[0].text;
  }

  /* ════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════ */
  function _render() {
    if (!_container) return;
    _container.innerHTML = _htmlEditor();
    _bindAll();
    // 저장된 값 복원
    _depts.forEach(function(dept) {
      SECTIONS.forEach(function(sec) {
        var ta = _container.querySelector('[data-ta="'+dept.id+'_'+sec.key+'"]');
        if (ta) ta.value = dept[sec.key] || '';
      });
    });
  }

  function _htmlEditor() {
    var prevMonths = _buildMonthHistory();
    var deptOpts = DEPT_OPTIONS.map(function(d){
      return '<option value="'+d+'">'+d+'</option>';
    }).join('');

    var deptCards = _depts.length
      ? _depts.map(function(d){ return _htmlDeptCard(d); }).join('')
      : '<div class="mrpt-empty-hint">↑ 부서를 선택하고 <strong>+ 부서 추가</strong>를 눌러 시작하세요.</div>';

    return '<div class="mrpt-wrap">'+
      /* 헤더 */
      '<div class="mrpt-header">'+
      '<div class="mrpt-header-title">'+
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="mrpt-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'+
      '<h2 class="mrpt-title">월 간 업 무 보 고</h2>'+
      '</div>'+
      '<div class="mrpt-header-actions">'+
      '<button class="rpt-btn rpt-primary mrpt-preview-btn" id="mrpt-preview-btn">'+
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'+
      '&nbsp;미리보기</button>'+
      '<button class="rpt-btn rpt-outline mrpt-save-btn" id="mrpt-save-btn">💾 저장</button>'+
      '</div>'+
      '</div>'+
      /* 메타 정보 */
      '<div class="mrpt-meta-bar">'+
      '<div class="mrpt-meta-group">'+
      '<label class="mrpt-meta-label">보고 연도</label>'+
      '<select class="rpt-sel mrpt-sel-sm" id="mrpt-year">'+_yearOpts()+'</select>'+
      '</div>'+
      '<div class="mrpt-meta-group">'+
      '<label class="mrpt-meta-label">보고 월</label>'+
      '<select class="rpt-sel mrpt-sel-sm" id="mrpt-month">'+_monthOpts()+'</select>'+
      '</div>'+
      '<div class="mrpt-meta-group">'+
      '<label class="mrpt-meta-label">보고 일시</label>'+
      '<input type="text" class="mrpt-meta-input" id="mrpt-date" placeholder="예) 2026.05.26.(화)" value="'+(_date||'')+'">'+
      '</div>'+
      '<div class="mrpt-meta-group">'+
      '<label class="mrpt-meta-label">장소</label>'+
      '<input type="text" class="mrpt-meta-input" id="mrpt-venue" placeholder="대회의실" value="'+(_venue||'')+'">'+
      '</div>'+
      (prevMonths.length ? '<div class="mrpt-meta-group mrpt-history-group"><label class="mrpt-meta-label">이전 보고</label>'+
      '<select class="rpt-sel mrpt-sel-sm" id="mrpt-history"><option value="">— 불러오기 —</option>'+prevMonths+'</select></div>' : '')+
      '</div>'+
      /* 부서 추가 바 */
      '<div class="mrpt-add-bar">'+
      '<select class="rpt-sel mrpt-dept-sel" id="mrpt-new-dept">'+
      '<option value="">— 부서 선택 —</option>'+deptOpts+
      '</select>'+
      '<button class="rpt-btn rpt-primary mrpt-add-dept-btn" id="mrpt-add-dept">+ 부서 추가</button>'+
      '<span class="mrpt-add-hint">부서를 선택하고 추가하세요</span>'+
      '</div>'+
      /* 부서 카드들 */
      '<div class="mrpt-dept-list" id="mrpt-dept-list">'+deptCards+'</div>'+
      /* 하단 버튼 */
      '<div class="mrpt-footer">'+
      '<button class="rpt-btn rpt-primary" id="mrpt-footer-preview">'+
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'+
      '&nbsp;미리보기</button>'+
      '<button class="rpt-btn rpt-outline" id="mrpt-footer-save">💾 저장</button>'+
      '</div>'+
      '</div>'+
      /* 미리보기 모달 */
      _htmlPreviewModal();
  }

  function _yearOpts() {
    var y = new Date().getFullYear();
    return [y-1,y,y+1].map(function(yr){
      return '<option value="'+yr+'"'+(yr===_year?' selected':'')+'>'+yr+'년</option>';
    }).join('');
  }

  function _monthOpts() {
    return Array.from({length:12}, function(_,i){
      var m = i+1;
      return '<option value="'+m+'"'+(m===_month?' selected':'')+'>'+_pad(m)+'월</option>';
    }).join('');
  }

  function _buildMonthHistory() {
    var list = [];
    for (var y = new Date().getFullYear(); y >= new Date().getFullYear()-1; y--) {
      for (var m = 12; m >= 1; m--) {
        var sk = SK_PREFIX + y + '_' + String(m).padStart(2,'0');
        if (localStorage.getItem(sk)) {
          list.push('<option value="'+y+'_'+m+'">'+y+'년 '+_pad(m)+'월</option>');
        }
        if (list.length >= 12) break;
      }
      if (list.length >= 12) break;
    }
    return list;
  }

  function _htmlDeptCard(dept) {
    var achieveLabel = '이번 달 성과 ('+_fmtMonthLabel(_year,_month)+')';
    var planLabel    = '다음 달 계획 ('+_nextMonthLabel(_year,_month)+')';
    return '<div class="mrpt-dept-card" data-dept-id="'+dept.id+'">'+
      '<div class="mrpt-dept-card-header">'+
      '<div class="mrpt-dept-card-name">'+
      '<span class="mrpt-dept-num">'+(_depts.indexOf(dept)+1)+'.</span>'+
      '<span class="mrpt-dept-title">'+dept.name+'</span>'+
      '</div>'+
      '<button class="mrpt-dept-remove" data-remove="'+dept.id+'" title="부서 삭제">✕</button>'+
      '</div>'+
      _htmlSection(dept, 'achievements', achieveLabel)+
      _htmlSection(dept, 'current',      '현재 중점사항')+
      _htmlSection(dept, 'nextplan',     planLabel)+
      _htmlSection(dept, 'decisions',    '결정 필요사항')+
      '</div>';
  }

  function _htmlSection(dept, secKey, label) {
    var sec = SECTIONS.find(function(s){ return s.key===secKey; });
    var loadKey = 'mrpt-load-'+dept.id+'_'+secKey;
    var imgKey  = 'mrpt-img-'+dept.id+'_'+secKey;
    var aiKey   = 'mrpt-ai-'+dept.id+'_'+secKey;
    return '<div class="mrpt-section" data-dept="'+dept.id+'" data-sec="'+secKey+'">'+
      '<div class="mrpt-section-header">'+
      '<span class="mrpt-section-label">'+label+'</span>'+
      '<div class="mrpt-section-tools">'+
      '<label class="mrpt-tool-btn" title="파일에서 텍스트 불러오기">'+
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'+
      '&nbsp;파일 불러오기'+
      '<input type="file" id="'+loadKey+'" accept=".txt,.md,.csv,.docx,.pdf" style="display:none" data-dept="'+dept.id+'" data-sec="'+secKey+'">'+
      '</label>'+
      '<label class="mrpt-tool-btn" title="이미지에서 텍스트 추출 (AI Vision)">'+
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'+
      '&nbsp;이미지→텍스트'+
      '<input type="file" id="'+imgKey+'" accept="image/*" style="display:none" data-dept="'+dept.id+'" data-sec="'+secKey+'">'+
      '</label>'+
      '<button class="mrpt-ai-btn" id="'+aiKey+'" data-dept="'+dept.id+'" data-sec="'+secKey+'">'+
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'+
      '&nbsp;AI 다듬기'+
      '</button>'+
      '</div>'+
      '</div>'+
      '<textarea class="mrpt-ta" '+
        'data-ta="'+dept.id+'_'+secKey+'" '+
        'data-dept="'+dept.id+'" data-sec="'+secKey+'" '+
        'rows="5" placeholder="'+sec.placeholder+'"></textarea>'+
      '</div>';
  }

  function _htmlPreviewModal() {
    return '<div id="mrpt-preview-modal" class="mrpt-modal-overlay" hidden>'+
      '<div class="mrpt-modal-dialog">'+
      '<div class="mrpt-modal-topbar">'+
      '<span class="mrpt-modal-title">미리보기</span>'+
      '<div class="mrpt-modal-actions">'+
      '<button class="rpt-btn rpt-outline rpt-sm" onclick="window.print()">🖨️ 인쇄 / PDF</button>'+
      '<button class="mrpt-modal-close" id="mrpt-modal-close">✕ 닫기</button>'+
      '</div>'+
      '</div>'+
      '<div class="mrpt-modal-body" id="mrpt-modal-body"></div>'+
      '</div>'+
      '</div>';
  }

  /* ── 미리보기 렌더링 ── */
  function _renderPreview() {
    var body = _container.querySelector('#mrpt-modal-body');
    if (!body) return;
    _collectCurrentValues();
    body.innerHTML = _htmlPrintLayout();
    var modal = _container.querySelector('#mrpt-preview-modal');
    if (modal) modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function _htmlPrintLayout() {
    var dateStr = _date || (_year+'.'+_pad(_month)+'.'+'  .(  )');
    var html =
      '<div class="mrpt-print-root">'+
      '<div class="mrpt-print-page">'+
      '<div class="mrpt-print-cover">'+
      '<div class="mrpt-print-cover-title">월 간 업 무 보 고</div>'+
      '<div class="mrpt-print-cover-sub">- '+_year+'년 '+_pad(_month)+'월 -</div>'+
      '<div class="mrpt-print-cover-date">'+dateStr+'&nbsp;&nbsp;'+_venue+'</div>'+
      '</div>'+
      '</div>';

    _depts.forEach(function(dept, idx) {
      if (idx > 0) html += '<div class="mrpt-print-dept-break"></div>';
      html += '<div class="mrpt-print-page"><table class="mrpt-print-table">'+
        '<colgroup><col style="width:90px"><col></colgroup>'+
        '<thead><tr><th class="mrpt-print-th-dept" colspan="2">'+
        (idx+1)+'. '+dept.name+
        '</th></tr></thead>'+
        '<tbody>'+
        _htmlPrintRow('이번 달\n성과('+_pad(_month)+'월)', dept.achievements)+
        _htmlPrintRow('현재\n중점사항', dept.current)+
        _htmlPrintRow('다음 달\n계획('+(function(y,m){var nm=m+1,ny=y;if(nm>12){nm=1;ny++;}return _pad(nm);}(_year,_month))+'월)', dept.nextplan)+
        _htmlPrintRow('결정\n필요사항', dept.decisions)+
        '</tbody></table></div>';
    });

    html += '</div>';
    return html;
  }

  function _htmlPrintRow(label, content) {
    var text = (content||'').trim()||'—';
    var formatted = text.replace(/\n/g, '<br>');
    return '<tr>'+
      '<td class="mrpt-print-td-label">'+label.replace(/\n/g,'<br>')+'</td>'+
      '<td class="mrpt-print-td-content">'+formatted+'</td>'+
      '</tr>';
  }

  /* ── 데이터 수집 ── */
  function _collectCurrentValues() {
    _date  = (_container.querySelector('#mrpt-date')  || {}).value || _date;
    _venue = (_container.querySelector('#mrpt-venue') || {}).value || _venue;
    _depts.forEach(function(dept) {
      SECTIONS.forEach(function(sec) {
        var ta = _container.querySelector('[data-ta="'+dept.id+'_'+sec.key+'"]');
        if (ta) dept[sec.key] = ta.value;
      });
    });
  }

  /* ════════════════════════════════════════════════════════════
     BIND
  ════════════════════════════════════════════════════════════ */
  function _bindAll() {
    /* 연도·월 변경 */
    var yearSel = _container.querySelector('#mrpt-year');
    var monSel  = _container.querySelector('#mrpt-month');
    if (yearSel) yearSel.addEventListener('change', function(){
      _collectCurrentValues(); _year=parseInt(this.value); _load(); _render();
    });
    if (monSel) monSel.addEventListener('change', function(){
      _collectCurrentValues(); _month=parseInt(this.value); _load(); _render();
    });

    /* 이전 보고 불러오기 */
    var hist = _container.querySelector('#mrpt-history');
    if (hist) hist.addEventListener('change', function(){
      if (!this.value) return;
      var parts = this.value.split('_');
      _collectCurrentValues();
      _year=parseInt(parts[0]); _month=parseInt(parts[1]);
      _load(); _render();
    });

    /* 날짜·장소 입력 → 실시간 반영 */
    var dateEl  = _container.querySelector('#mrpt-date');
    var venueEl = _container.querySelector('#mrpt-venue');
    if (dateEl)  dateEl.addEventListener('input', function(){ _date=this.value; });
    if (venueEl) venueEl.addEventListener('input', function(){ _venue=this.value; });

    /* 부서 추가 */
    var addBtn = _container.querySelector('#mrpt-add-dept');
    if (addBtn) addBtn.addEventListener('click', function(){
      var sel = _container.querySelector('#mrpt-new-dept');
      if (!sel || !sel.value) { if(typeof window.toast==='function') window.toast('부서를 선택하세요.','error'); return; }
      var name = sel.value;
      if (_depts.find(function(d){ return d.name===name; })) {
        if(typeof window.toast==='function') window.toast('이미 추가된 부서입니다.','info'); return;
      }
      _collectCurrentValues();
      _depts.push({ id:_uid(), name:name, achievements:'', current:'', nextplan:'', decisions:'' });
      _render();
      // 스크롤 to new card
      var list = _container.querySelector('#mrpt-dept-list');
      if (list) list.lastElementChild && list.lastElementChild.scrollIntoView({behavior:'smooth'});
    });

    /* 부서 삭제 */
    _container.querySelectorAll('[data-remove]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = btn.dataset.remove;
        if (!confirm('이 부서를 삭제하시겠습니까?')) return;
        _collectCurrentValues();
        _depts = _depts.filter(function(d){ return d.id!==id; });
        _render();
      });
    });

    /* 텍스트 변경 자동 저장 (debounce) */
    var _saveTimer;
    _container.querySelectorAll('.mrpt-ta').forEach(function(ta){
      ta.addEventListener('input', function(){
        clearTimeout(_saveTimer);
        _saveTimer = setTimeout(function(){ _collectCurrentValues(); _save(); }, 1500);
      });
      /* 붙여넣기 이벤트 — 이미지 붙여넣기 처리 */
      ta.addEventListener('paste', function(e){
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (var i=0; i<items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault();
            var file = items[i].getAsFile();
            _handleImageFile(file, ta.dataset.dept, ta.dataset.sec, ta);
            break;
          }
        }
      });
    });

    /* 파일 불러오기 */
    _container.querySelectorAll('input[type="file"][id^="mrpt-load-"]').forEach(function(inp){
      inp.addEventListener('change', function(){
        if (!inp.files[0]) return;
        _handleTextFile(inp.files[0], inp.dataset.dept, inp.dataset.sec);
        inp.value = '';
      });
    });

    /* 이미지 → 텍스트 */
    _container.querySelectorAll('input[type="file"][id^="mrpt-img-"]').forEach(function(inp){
      inp.addEventListener('change', function(){
        if (!inp.files[0]) return;
        var ta = _container.querySelector('[data-ta="'+inp.dataset.dept+'_'+inp.dataset.sec+'"]');
        _handleImageFile(inp.files[0], inp.dataset.dept, inp.dataset.sec, ta);
        inp.value = '';
      });
    });

    /* AI 다듬기 버튼들 */
    _container.querySelectorAll('.mrpt-ai-btn').forEach(function(btn){
      btn.addEventListener('click', async function(){
        var deptId  = btn.dataset.dept;
        var secKey  = btn.dataset.sec;
        var ta = _container.querySelector('[data-ta="'+deptId+'_'+secKey+'"]');
        if (!ta) return;
        var rawText = ta.value.trim();
        if (!rawText) { if(typeof window.toast==='function') window.toast('내용을 먼저 입력하세요.','info'); return; }
        btn.disabled = true;
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 2H3v16h5l3 3 3-3h7z"/><line x1="12" y1="8" x2="12" y2="14"/></svg>&nbsp;분석 중…';
        try {
          var dept = _getDept(deptId);
          var refined = await _aiPolish(deptId, secKey, rawText);
          ta.value = refined;
          dept[secKey] = refined;
          _save();
          if(typeof window.toast==='function') window.toast('AI가 내용을 다듬었습니다.','success');
        } catch(e) {
          if(typeof window.toast==='function') window.toast('AI 오류: '+e.message,'error');
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>&nbsp;AI 다듬기';
        }
      });
    });

    /* 저장 버튼 */
    ['#mrpt-save-btn','#mrpt-footer-save'].forEach(function(sel){
      var btn = _container.querySelector(sel);
      if (btn) btn.addEventListener('click', function(){ _collectCurrentValues(); _save(); });
    });

    /* 미리보기 버튼 */
    ['#mrpt-preview-btn','#mrpt-footer-preview'].forEach(function(sel){
      var btn = _container.querySelector(sel);
      if (btn) btn.addEventListener('click', function(){ _collectCurrentValues(); _renderPreview(); });
    });

    /* 미리보기 모달 닫기 */
    var closeBtn = _container.querySelector('#mrpt-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', _closePreview);
    var overlay = _container.querySelector('#mrpt-preview-modal');
    if (overlay) overlay.addEventListener('click', function(e){
      if (e.target === overlay) _closePreview();
    });
  }

  function _closePreview() {
    var modal = _container && _container.querySelector('#mrpt-preview-modal');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
  }

  /* ── 파일 처리 ── */
  async function _handleTextFile(file, deptId, secKey) {
    var ta = _container.querySelector('[data-ta="'+deptId+'_'+secKey+'"]');
    if (!ta) return;
    var dept = _getDept(deptId);
    try {
      var text = await _readFileAsText(file);
      ta.value = text;
      if (dept) dept[secKey] = text;
      if(typeof window.toast==='function') window.toast('파일 내용을 불러왔습니다.','success');
    } catch(e) {
      if(typeof window.toast==='function') window.toast('파일 읽기 오류: '+e.message,'error');
    }
  }

  async function _handleImageFile(file, deptId, secKey, ta) {
    if (!ta) return;
    var dept = _getDept(deptId);
    var origPlaceholder = ta.placeholder;
    ta.placeholder = '🔍 이미지 분석 중...';
    ta.disabled = true;
    try {
      var base64 = await _fileToBase64(file);
      var text = await _imageToText(base64, file.type);
      ta.value = text;
      if (dept) dept[secKey] = text;
      if(typeof window.toast==='function') window.toast('이미지에서 텍스트를 추출했습니다.','success');
    } catch(e) {
      if(typeof window.toast==='function') window.toast('이미지 분석 오류: '+e.message,'error');
    } finally {
      ta.disabled = false;
      ta.placeholder = origPlaceholder;
    }
  }

  function _readFileAsText(file) {
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(e){ resolve(e.target.result); };
      reader.onerror = function(){ reject(new Error('파일 읽기 실패')); };
      reader.readAsText(file, 'utf-8');
    });
  }

  function _fileToBase64(file) {
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(e){
        var dataUrl = e.target.result;
        resolve(dataUrl.split(',')[1]);
      };
      reader.onerror = function(){ reject(new Error('파일 변환 실패')); };
      reader.readAsDataURL(file);
    });
  }

  /* ════════════════════════════════════════════════════════════
     공개 API
  ════════════════════════════════════════════════════════════ */
  function init(container) {
    _container = container;
    _load();
    _render();
  }

  return { init: init };
})();
