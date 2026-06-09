'use strict';
window.ReportModule = (function () {

  /* ── 부서 목록 (PDF 양식 기준 14개 부서) ── */
  var DEPT_LIST = [
    { id: '01', name: '기획처',            extra: true  },
    { id: '02', name: '교육지원처',         extra: false },
    { id: '03', name: '입학처',             extra: false },
    { id: '04', name: '항공정비계열',       extra: false },
    { id: '05', name: '스마트안전진단계열',  extra: false },
    { id: '06', name: '항공관광계열',       extra: false },
    { id: '07', name: '항공보안계열',       extra: false },
    { id: '08', name: '국방경찰계열',       extra: false },
    { id: '09', name: '군사교육단',         extra: false },
    { id: '10', name: '기종교육원',         extra: false },
    { id: '11', name: '무인항공교육원',     extra: false },
    { id: '12', name: '비행교육원',         extra: false },
    { id: '13', name: '용산캠퍼스',         extra: false },
    { id: '14', name: '온라인평생교육원',   extra: false },
  ];

  var SK_REPORTS = 'asea_weekly_reports';
  var SK_WEEKS   = 'asea_weekly_weeks';

  /* ── 상태 ── */
  var _reports = [], _weeks = [];
  var _view    = 'list';   // list | edit | preview | admin
  var _editing = null;
  var _pvSrc   = 'list';
  var _pvReport = null;
  var _attaches = [];
  var _inited  = false;

  /* ── 관리자 판별 ── */
  function isAdmin() {
    return localStorage.getItem('asea_is_admin') === 'true' ||
           (typeof CONFIG !== 'undefined' && !!CONFIG.isAdmin);
  }

  /* ── 스토리지 ── */
  function load() {
    try { _reports = JSON.parse(localStorage.getItem(SK_REPORTS)) || []; } catch(e){ _reports=[]; }
    try { _weeks   = JSON.parse(localStorage.getItem(SK_WEEKS))   || []; } catch(e){ _weeks=[]; }
  }
  function saveReport(r) {
    var i = _reports.findIndex(function(x){ return x.id===r.id; });
    if (i>=0) _reports[i]=r; else _reports.unshift(r);
    try{ localStorage.setItem(SK_REPORTS, JSON.stringify(_reports)); }catch(e){}
  }
  function delReport(id) {
    _reports = _reports.filter(function(r){ return r.id!==id; });
    try{ localStorage.setItem(SK_REPORTS, JSON.stringify(_reports)); }catch(e){}
  }
  function saveWeek(w) {
    var i = _weeks.findIndex(function(x){ return x.id===w.id; });
    if (i>=0) _weeks[i]=w; else _weeks.unshift(w);
    try{ localStorage.setItem(SK_WEEKS, JSON.stringify(_weeks)); }catch(e){}
  }
  function delWeek(id) {
    _weeks = _weeks.filter(function(w){ return w.id!==id; });
    try{ localStorage.setItem(SK_WEEKS, JSON.stringify(_weeks)); }catch(e){}
  }

  /* ── 유틸 ── */
  function fmtDate(s) {
    if (!s) return '';
    var d = new Date(s);
    var D = ['일','월','화','수','목','금','토'];
    return d.getFullYear()+'.'+pad(d.getMonth()+1)+'.'+pad(d.getDate())+'.('+D[d.getDay()]+')';
  }
  function pad(n){ return String(n).padStart(2,'0'); }
  function uid(){ return '_'+Date.now()+'_'+Math.random().toString(36).slice(2,7); }
  function showToast(msg,type){
    if(typeof window.toast==='function') window.toast(msg,type);
  }
  function authorKey(){
    return (typeof CONFIG!=='undefined'&&CONFIG.senderEmail)||localStorage.getItem('asea_user_email')||'guest';
  }
  function getDept(id){ return DEPT_LIST.find(function(d){return d.id===id;})||{id:id,name:id,extra:false}; }
  function getWeek(id){ return _weeks.find(function(w){return w.id===id;})||{}; }
  function $r(){ return document.getElementById('rpt-root'); }
  function $q(sel){ var el=$r(); return (el||document).querySelector(sel); }
  function $qa(sel){ var el=$r(); return Array.from((el||document).querySelectorAll(sel)); }

  /* ══════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════ */
  function render() {
    var el = $r(); if (!el) return;
    if      (_view==='list')    el.innerHTML = htmlList();
    else if (_view==='edit')    el.innerHTML = htmlEditor(_editing);
    else if (_view==='preview') el.innerHTML = htmlPreview(_pvReport);
    else if (_view==='admin')   el.innerHTML = htmlAdmin();
    bindAll();
  }

  /* ══════════════════════════════════════════════
     HTML: 목록
  ══════════════════════════════════════════════ */
  function htmlList() {
    var weekOpts = '<option value="">전체 주차</option>'+
      _weeks.map(function(w){return '<option value="'+w.id+'">'+w.year+'년 '+w.weekNum+'주차</option>';}).join('');
    var deptOpts = '<option value="">전체 부서</option>'+
      DEPT_LIST.map(function(d){return '<option value="'+d.id+'">'+d.name+'</option>';}).join('');

    var cards = _reports.length ? _reports.map(function(r){
      var dept = getDept(r.deptId);
      var wk   = getWeek(r.weekId);
      var wkLabel = wk.year ? wk.year+'년 '+wk.weekNum+'주차' : '';
      var sc  = r.status==='done'?'rpt-s-done':r.status==='review'?'rpt-s-review':'rpt-s-draft';
      var sl  = r.status==='done'?'완료':r.status==='review'?'검토중':'작성중';
      var canEdit = isAdmin() || r.authorKey===authorKey();
      return '<div class="rpt-card">'+
        '<div class="rpt-card-top"><span class="rpt-card-dept">'+dept.name+'</span><span class="rpt-chip '+sc+'">'+sl+'</span></div>'+
        '<div class="rpt-card-week">'+wkLabel+'</div>'+
        '<div class="rpt-card-meta">작성자: '+(r.author||'-')+'&nbsp;/&nbsp;검토자: '+(r.reviewer||'-')+'</div>'+
        '<div class="rpt-card-btns">'+
        '<button class="rpt-btn rpt-ghost rpt-sm _pv" data-id="'+r.id+'">👁 미리보기</button>'+
        (canEdit?'<button class="rpt-btn rpt-primary rpt-sm _ed" data-id="'+r.id+'">✏️ 편집</button>':'')+
        (isAdmin()?'<button class="rpt-btn rpt-danger rpt-sm _del" data-id="'+r.id+'">🗑</button>':'')+
        '</div></div>';
    }).join('') : '<div class="rpt-empty">작성된 보고서가 없습니다.<br>＋ 보고서 작성 버튼으로 시작하세요.</div>';

    return '<div class="rpt-wrap">'+
      '<div class="rpt-bar">'+
      '<span class="rpt-bar-title">📋 주간업무보고서</span>'+
      '<div class="rpt-bar-right">'+
      (isAdmin()?'<button class="rpt-btn rpt-outline rpt-sm" id="_admin">⚙️ 주차관리</button>':'')+
      (isAdmin()?'<button class="rpt-btn rpt-outline rpt-sm" id="_compile">📦 취합 PDF</button>':'')+
      '<button class="rpt-btn rpt-primary" id="_new">+ 보고서 작성</button>'+
      '</div></div>'+
      '<div class="rpt-filters">'+
      '<select class="rpt-sel" id="_fw">'+weekOpts+'</select>'+
      '<select class="rpt-sel" id="_fd">'+deptOpts+'</select>'+
      '</div>'+
      '<div class="rpt-cards">'+cards+'</div>'+
      '</div>';
  }

  /* ══════════════════════════════════════════════
     HTML: 편집기
  ══════════════════════════════════════════════ */
  function htmlEditor(r) {
    var dept = getDept(r.deptId);

    var weekOpts = _weeks.length
      ? _weeks.map(function(w){
          return '<option value="'+w.id+'"'+(w.id===r.weekId?' selected':'')+'>'+
            w.year+'년 '+w.weekNum+'주차 ('+w.startDate+' ~ '+w.endDate+')</option>';
        }).join('')
      : '<option value="">주차 없음 — 관리자에게 주차 등록 요청</option>';

    var deptOpts = DEPT_LIST.map(function(d){
      return '<option value="'+d.id+'"'+(d.id===r.deptId?' selected':'')+'>'+d.id+'. '+d.name+'</option>';
    }).join('');

    var statusOpts = [['draft','작성중'],['review','검토중'],['done','작성완료']].map(function(s){
      return '<option value="'+s[0]+'"'+((r.status||'draft')===s[0]?' selected':'')+'>'+s[1]+'</option>';
    }).join('');

    /* 근태 테이블 */
    var att  = r.attendance||{};
    var DAYS = ['mon','tue','wed','thu','fri'];
    function attRow(key,label){
      var cells = DAYS.map(function(d){
        return '<td><input class="rpt-att-c" type="text" data-row="'+key+'" data-day="'+d+'" value="'+(att[key]&&att[key][d]||'')+'" placeholder="0"></td>';
      }).join('');
      return '<tr><td class="rpt-att-lbl">'+label+'</td>'+cells+
        '<td><input class="rpt-att-c" type="text" data-row="'+key+'" data-day="note" value="'+(att[key]&&att[key].note||'')+'" placeholder="비고"></td></tr>';
    }

    /* 기획처 전용: 근로자현황 */
    var workerHTML = '';
    if (dept.extra) {
      var ws = r.workerStat||{};
      var wDepts = ['재단','기획','교육','행정','입학','정비','안전','관광','보안','국방','시설','기종','무인','온평','비행','용산','평생','직능','기타'];
      workerHTML = '<div class="rpt-sec"><div class="rpt-sec-ttl">📊 근로자 현황</div>'+
        '<div class="rpt-wgrid">'+wDepts.map(function(dn){
          return '<div class="rpt-wc"><label>'+dn+'</label><input type="number" class="rpt-wi" data-dept="'+dn+'" value="'+(ws[dn]||'')+'"></div>';
        }).join('')+'</div>'+
        '<div class="rpt-frow" style="margin-top:8px"><label>총원</label>'+
        '<input type="number" id="_wtotal" class="rpt-inp" value="'+(ws.total||'')+'" placeholder="총원 명">'+
        '</div></div>';
    }

    /* 기획처 전용: 훈련생현황 */
    var traineeHTML = '';
    if (dept.extra) {
      var trainees = r.trainees&&r.trainees.length ? r.trainees : [{courseName:'',startDate:'',endDate:'',enrolled:'',status:''}];
      var trows = trainees.map(function(t,i){
        return '<tr><td>'+(i+1)+'</td>'+
          '<td><input class="rpt-ti" type="text"  name="courseName" data-i="'+i+'" value="'+(t.courseName||'')+'"></td>'+
          '<td><input class="rpt-ti" type="date"  name="startDate"  data-i="'+i+'" value="'+(t.startDate||'')+'"></td>'+
          '<td><input class="rpt-ti" type="date"  name="endDate"    data-i="'+i+'" value="'+(t.endDate||'')+'"></td>'+
          '<td><input class="rpt-ti" type="text"  name="enrolled"   data-i="'+i+'" value="'+(t.enrolled||'')+'" style="width:56px"></td>'+
          '<td><input class="rpt-ti" type="text"  name="status"     data-i="'+i+'" value="'+(t.status||'')+'"></td>'+
          '<td><button class="rpt-btn rpt-danger rpt-sm _tdel" data-i="'+i+'">×</button></td></tr>';
      }).join('');
      traineeHTML = '<div class="rpt-sec">'+
        '<div class="rpt-sec-ttl" style="display:flex;justify-content:space-between;align-items:center">'+
        '🎓 훈련생 현황<button class="rpt-btn rpt-outline rpt-sm" id="_tadd">+ 행 추가</button></div>'+
        '<div style="overflow-x:auto"><table class="rpt-trainee">'+
        '<thead><tr><th>순번</th><th>훈련과정명</th><th>시작일</th><th>종료예정일</th><th>입과인원</th><th>현황/비고</th><th></th></tr></thead>'+
        '<tbody id="_tbody">'+trows+'</tbody></table></div></div>';
    }

    /* 업무보고 4섹션 */
    var tasks = r.tasks||{};
    var taskSecs = [
      {k:'completed', l:'처리완료 및 진행중 업무'},
      {k:'planned',   l:'추진 및 계획 업무'},
      {k:'issues',    l:'주요 이슈'},
      {k:'notices',   l:'안내 / 협조 사항'},
    ].map(function(s){
      return '<div class="rpt-tsec">'+
        '<div class="rpt-tsec-lbl">'+s.l+'</div>'+
        '<textarea class="rpt-ta" id="rpt_'+s.k+'">'+((tasks[s.k]||''))+'</textarea>'+
        '<div class="rpt-paste-z" data-sec="'+s.k+'" contenteditable="true">📎 이미지 붙여넣기 (클릭 후 Ctrl+V)</div>'+
        '<div class="rpt-thumbs" id="rpt_th_'+s.k+'"></div>'+
        '</div>';
    }).join('');

    return '<div class="rpt-wrap">'+
      '<div class="rpt-bar">'+
      '<button class="rpt-btn rpt-ghost" id="_back">← 목록</button>'+
      '<span class="rpt-bar-title">'+(r.id?'보고서 편집':'보고서 작성')+'</span>'+
      '<div class="rpt-bar-right">'+
      '<button class="rpt-btn rpt-outline" id="_pvbtn">👁 미리보기</button>'+
      '<button class="rpt-btn rpt-primary" id="_save">💾 저장</button>'+
      '</div></div>'+
      '<div class="rpt-editor">'+

      /* 기본정보 */
      '<div class="rpt-sec"><div class="rpt-sec-ttl">📌 기본 정보</div>'+
      '<div class="rpt-fgrid">'+
      '<div class="rpt-frow"><label>주차 <span class="rpt-req">*</span></label>'+
      '<select class="rpt-sel rpt-inp" id="_wsel">'+weekOpts+'</select></div>'+
      '<div class="rpt-frow"><label>작성부서 <span class="rpt-req">*</span></label>'+
      '<select class="rpt-sel rpt-inp" id="_dsel">'+deptOpts+'</select></div>'+
      '<div class="rpt-frow"><label>작성자 <span class="rpt-req">*</span></label>'+
      '<input type="text" class="rpt-inp" id="_author" placeholder="이름 직책  예) 홍길동 차장" value="'+(r.author||'')+'"></div>'+
      '<div class="rpt-frow"><label>검토자</label>'+
      '<input type="text" class="rpt-inp" id="_reviewer" placeholder="이름 직책  예) 김민구 처장" value="'+(r.reviewer||'')+'"></div>'+
      '<div class="rpt-frow"><label>부서 총원</label>'+
      '<input type="number" class="rpt-inp" id="_total" placeholder="명" value="'+(r.totalMembers||'')+'"></div>'+
      '<div class="rpt-frow"><label>문서 상태</label>'+
      '<select class="rpt-sel rpt-inp" id="_ssel">'+statusOpts+'</select></div>'+
      '</div></div>'+

      /* 근태현황 */
      '<div class="rpt-sec"><div class="rpt-sec-ttl">📅 부서별 근태현황</div>'+
      '<div style="overflow-x:auto"><table class="rpt-att-t">'+
      '<thead><tr><th>구분</th><th>월</th><th>화</th><th>수</th><th>목</th><th>금</th><th>비고</th></tr></thead>'+
      '<tbody>'+attRow('annualLeave','연차/반차')+attRow('businessTrip','출장')+'</tbody>'+
      '</table></div></div>'+

      workerHTML+traineeHTML+

      /* 업무보고 */
      '<div class="rpt-sec"><div class="rpt-sec-ttl">📝 업무보고</div>'+taskSecs+'</div>'+

      /* 첨부파일 */
      '<div class="rpt-sec"><div class="rpt-sec-ttl">📎 첨부파일'+
      '<span style="font-size:11px;font-weight:400;color:#888;margin-left:8px">이미지·PDF·Excel·HWP — 별도 페이지로 추가됩니다</span></div>'+
      '<div class="rpt-drop" id="_drop">'+
      '<input type="file" id="_finput" multiple accept="image/*,.pdf,.xlsx,.xls,.docx,.hwp" style="display:none">'+
      '<div class="rpt-drop-inner"><div style="font-size:28px">📂</div><div>클릭하거나 파일을 드래그</div></div>'+
      '</div><div class="rpt-alist" id="_alist"></div></div>'+

      '</div></div>';
  }

  /* ══════════════════════════════════════════════
     HTML: 미리보기 (A4)
  ══════════════════════════════════════════════ */
  function htmlPreview(r) {
    if (!r) return '<div class="rpt-wrap"><p>데이터 없음</p></div>';
    var dept  = getDept(r.deptId);
    var wk    = getWeek(r.weekId);
    var att   = r.attendance||{};
    var tasks = r.tasks||{};
    var DAYS  = ['mon','tue','wed','thu','fri'];

    var attRows = [
      {k:'annualLeave', l:'연차/반차'},
      {k:'businessTrip',l:'출장'},
    ].map(function(row){
      var cells = DAYS.map(function(d){ return '<td>'+(att[row.k]&&att[row.k][d]||'0')+'</td>'; }).join('');
      return '<tr><td class="rpt-pv-rl">'+row.l+'</td>'+cells+'<td>'+(att[row.k]&&att[row.k].note||'')+'</td></tr>';
    }).join('');

    /* 훈련생현황 (기획처 전용) */
    var pvTrainee = '';
    if (dept.extra && r.trainees && r.trainees.length) {
      pvTrainee = '<div class="rpt-pv-sec"><div class="rpt-pv-st">훈련생 현황</div>'+
        '<table class="rpt-pv-tbl"><thead>'+
        '<tr><th>순번</th><th>훈련과정명</th><th>시작일</th><th>종료예정일</th><th>입과인원</th><th>현황/비고</th></tr>'+
        '</thead><tbody>'+
        r.trainees.map(function(t,i){
          return '<tr><td>'+(i+1)+'</td><td>'+( t.courseName||'' )+'</td><td>'+( t.startDate||'' )+'</td>'+
            '<td>'+( t.endDate||'' )+'</td><td>'+( t.enrolled||'' )+'</td><td>'+( t.status||'' )+'</td></tr>';
        }).join('')+'</tbody></table></div>';
    }

    /* 근로자현황 (기획처 전용) */
    var pvWorker = '';
    if (dept.extra && r.workerStat) {
      var ws = r.workerStat;
      var wDepts = ['재단','기획','교육','행정','입학','정비','안전','관광','보안','국방','시설','기종','무인','온평','비행','용산','평생','직능','기타'];
      var wcells = wDepts.map(function(dn){ return '<td>'+dn+'<br><strong>'+(ws[dn]||'-')+'</strong></td>'; }).join('');
      pvWorker = '<div class="rpt-pv-sec"><div class="rpt-pv-st">근로자 현황 (총원: '+(ws.total||'')+'명)</div>'+
        '<table class="rpt-pv-tbl rpt-pv-wt"><tbody><tr>'+wcells+'</tr></tbody></table></div>';
    }

    /* 업무보고 4섹션 */
    var taskRows = [
      {k:'completed', l:'처리완료 및<br>진행중 업무'},
      {k:'planned',   l:'추진 및<br>계획 업무'},
      {k:'issues',    l:'주요 이슈'},
      {k:'notices',   l:'안내/협조<br>사항'},
    ].map(function(s){
      var txt = (tasks[s.k]||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
      var imgs = _attaches.filter(function(a){ return a.section===s.k && a.dataUrl; });
      var imgH = imgs.map(function(a){ return '<img class="rpt-pv-img" src="'+a.dataUrl+'" alt="'+a.name+'">'; }).join('');
      return '<tr><td class="rpt-pv-tl">'+s.l+'</td><td class="rpt-pv-td">'+txt+imgH+'</td></tr>';
    }).join('');

    /* 첨부 별도 페이지 */
    var pgAtt = _attaches.filter(function(a){ return !a.section && a.dataUrl; });
    var attPages = pgAtt.map(function(a){
      return '<div class="rpt-a4 rpt-attach-page"><div class="rpt-pv-att-title">📎 첨부: '+a.name+'</div>'+
        '<img class="rpt-pv-att-img" src="'+a.dataUrl+'" alt="'+a.name+'"></div>';
    }).join('');

    var currRange = wk.startDate&&wk.endDate ? fmtDate(wk.startDate)+' ~ '+fmtDate(wk.endDate) : '';
    var nextRange = wk.nextStartDate&&wk.nextEndDate ? fmtDate(wk.nextStartDate)+' ~ '+fmtDate(wk.nextEndDate) : '';
    var writeDate = wk.endDate ? fmtDate(wk.endDate) : fmtDate(new Date().toISOString().slice(0,10));
    var stLabel   = r.status==='done'?'작성 완료':r.status==='review'?'검토중':'작성중';
    var backId    = _pvSrc==='edit' ? '_back_edit' : '_back_list';
    var backLabel = _pvSrc==='edit' ? '← 편집으로' : '← 목록';

    return '<div class="rpt-wrap rpt-pv-wrap">'+
      '<div class="rpt-bar rpt-pv-bar no-print">'+
      '<button class="rpt-btn rpt-ghost" id="'+backId+'">'+backLabel+'</button>'+
      '<span class="rpt-bar-title">미리보기</span>'+
      '<div class="rpt-bar-right">'+
      '<button class="rpt-btn rpt-outline" onclick="window.print()">🖨️ 인쇄 / PDF 저장</button>'+
      '</div></div>'+
      '<div class="rpt-pages" id="rpt-pages">'+
      '<div class="rpt-a4">'+

      /* 문서 헤더 */
      '<div class="rpt-pv-hd">'+
      '<div><div class="rpt-pv-bigtitle">주 간 업 무 보 고 서</div>'+
      '<div class="rpt-pv-subttl">'+(wk.year||'')+'년 &nbsp; '+(wk.weekNum||'')+'주차</div></div>'+
      '<div class="rpt-pv-badge">'+stLabel+'</div>'+
      '</div>'+

      /* 메타 */
      '<table class="rpt-pv-meta">'+
      '<tr><td class="rpt-pv-ml">작성부서</td><td class="rpt-pv-mv"><strong>'+(dept.id?dept.id+'. ':'')+dept.name+'</strong></td>'+
      '<td class="rpt-pv-ml">작&nbsp;성&nbsp;일</td><td class="rpt-pv-mv">'+writeDate+'</td></tr>'+
      '<tr><td class="rpt-pv-ml">작&nbsp;성&nbsp;자</td><td class="rpt-pv-mv">'+(r.author||'')+'</td>'+
      '<td class="rpt-pv-ml">검&nbsp;토&nbsp;자</td><td class="rpt-pv-mv">'+(r.reviewer||'')+'</td></tr>'+
      '<tr><td class="rpt-pv-ml">보고기간</td>'+
      '<td colspan="3" class="rpt-pv-mv">금주 '+currRange+(nextRange?' &nbsp;&nbsp; 차주 '+nextRange:'')+'</td></tr>'+
      '</table>'+

      /* 근태현황 */
      '<div class="rpt-pv-sec"><div class="rpt-pv-st">부서별 근태현황</div>'+
      '<table class="rpt-pv-tbl"><thead>'+
      '<tr><th>총원 '+(r.totalMembers||'')+'명</th><th>월</th><th>화</th><th>수</th><th>목</th><th>금</th><th>비고</th></tr>'+
      '</thead><tbody>'+attRows+'</tbody></table></div>'+

      pvWorker+pvTrainee+

      /* 업무보고 */
      '<div class="rpt-pv-sec">'+
      '<table class="rpt-pv-tbl rpt-pv-task">'+
      '<thead><tr><th style="width:110px">구분</th><th>보고 내용</th></tr></thead>'+
      '<tbody>'+taskRows+'</tbody></table></div>'+

      '</div>'+ /* rpt-a4 끝 */
      attPages+
      '</div></div>';
  }

  /* ══════════════════════════════════════════════
     HTML: 관리자 — 주차 관리
  ══════════════════════════════════════════════ */
  function htmlAdmin() {
    var rows = _weeks.length ? _weeks.map(function(w){
      return '<tr>'+
        '<td>'+w.year+'년 '+w.weekNum+'주차</td>'+
        '<td>'+(w.startDate||'')+' ~ '+(w.endDate||'')+'</td>'+
        '<td>'+(w.nextStartDate||'')+' ~ '+(w.nextEndDate||'')+'</td>'+
        '<td style="font-size:11px;max-width:140px;word-break:break-all">'+((w.deptOrder||[]).join(', '))+'</td>'+
        '<td>'+
        '<button class="rpt-btn rpt-outline rpt-sm _wedit" data-id="'+w.id+'">편집</button> '+
        '<button class="rpt-btn rpt-danger rpt-sm _wdel" data-id="'+w.id+'">삭제</button>'+
        '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="rpt-empty">등록된 주차 없음</td></tr>';

    var deptChks = DEPT_LIST.map(function(d){
      return '<label class="rpt-dchk"><input type="checkbox" class="_dochk" value="'+d.id+'"> '+d.id+'. '+d.name+'</label>';
    }).join('');

    return '<div class="rpt-wrap">'+
      '<div class="rpt-bar">'+
      '<button class="rpt-btn rpt-ghost" id="_back">← 목록</button>'+
      '<span class="rpt-bar-title">⚙️ 주차 관리</span>'+
      '</div>'+

      '<div class="rpt-sec"><div class="rpt-sec-ttl">등록된 주차 목록</div>'+
      '<div style="overflow-x:auto"><table class="rpt-week-tbl">'+
      '<thead><tr><th>주차</th><th>금주 기간</th><th>차주 기간</th><th>부서 순서</th><th>관리</th></tr></thead>'+
      '<tbody id="_wlist">'+rows+'</tbody></table></div></div>'+

      '<div class="rpt-sec"><div class="rpt-sec-ttl" id="_wftitle">+ 새 주차 추가</div>'+
      '<input type="hidden" id="_weid">'+
      '<div class="rpt-fgrid">'+
      '<div class="rpt-frow"><label>연도</label><input type="number" class="rpt-inp" id="_wyear" value="'+new Date().getFullYear()+'" min="2024" max="2035"></div>'+
      '<div class="rpt-frow"><label>주차 번호</label><input type="number" class="rpt-inp" id="_wnum" placeholder="예: 24" min="1" max="53"></div>'+
      '<div class="rpt-frow"><label>금주 시작일 (월)</label><input type="date" class="rpt-inp" id="_wst"></div>'+
      '<div class="rpt-frow"><label>금주 종료일 (금)</label><input type="date" class="rpt-inp" id="_wen"></div>'+
      '<div class="rpt-frow"><label>차주 시작일 (월)</label><input type="date" class="rpt-inp" id="_wnst"></div>'+
      '<div class="rpt-frow"><label>차주 종료일 (금)</label><input type="date" class="rpt-inp" id="_wnen"></div>'+
      '</div>'+
      '<div class="rpt-frow" style="margin-top:12px;flex-direction:column;align-items:flex-start;gap:6px">'+
      '<label>취합 부서 순서 <span style="font-weight:400;font-size:12px;color:#888">(체크된 순서대로 취합됩니다)</span></label>'+
      '<div class="rpt-dorder">'+deptChks+'</div>'+
      '</div>'+
      '<div style="margin-top:14px;display:flex;gap:8px">'+
      '<button class="rpt-btn rpt-primary" id="_wsave">저장</button>'+
      '<button class="rpt-btn rpt-ghost" id="_wcancel">초기화</button>'+
      '</div></div>'+
      '</div>';
  }

  /* ══════════════════════════════════════════════
     이벤트 바인딩
  ══════════════════════════════════════════════ */
  function bindAll() {
    var bb = $q('#_back');
    if (bb) bb.addEventListener('click', function(){ _view='list'; render(); });
    if (_view==='list')    bindList();
    else if (_view==='edit')    bindEditor();
    else if (_view==='preview') bindPreview();
    else if (_view==='admin')   bindAdmin();
  }

  function bindList() {
    var nb = $q('#_new');
    if (nb) nb.addEventListener('click', function(){
      _attaches = [];
      _editing = { id:'', deptId:DEPT_LIST[0].id, weekId:_weeks.length?_weeks[0].id:'',
        author:'', reviewer:'', status:'draft', attendance:{}, tasks:{}, trainees:[] };
      _view='edit'; render();
    });
    var ab = $q('#_admin');
    if (ab) ab.addEventListener('click', function(){ _view='admin'; render(); });
    var cb = $q('#_compile');
    if (cb) cb.addEventListener('click', compileWeek);

    $qa('._ed').forEach(function(b){ b.addEventListener('click', function(){
      var rpt = _reports.find(function(r){ return r.id===b.dataset.id; }); if (!rpt) return;
      _editing = JSON.parse(JSON.stringify(rpt));
      _attaches = _editing.attachments ? JSON.parse(JSON.stringify(_editing.attachments)) : [];
      _editing.attachments = undefined;
      _view='edit'; render();
    }); });

    $qa('._pv').forEach(function(b){ b.addEventListener('click', function(){
      var rpt = _reports.find(function(r){ return r.id===b.dataset.id; }); if (!rpt) return;
      _pvReport = rpt; _attaches = rpt.attachments||[]; _pvSrc='list'; _view='preview'; render();
    }); });

    $qa('._del').forEach(function(b){ b.addEventListener('click', function(){
      if (!confirm('삭제하시겠습니까?')) return;
      delReport(b.dataset.id); render();
    }); });
  }

  function bindEditor() {
    var sv = $q('#_save');
    if (sv) sv.addEventListener('click', function(){
      var r = collectForm(); if (!r) return;
      r.attachments = JSON.parse(JSON.stringify(_attaches));
      saveReport(r); showToast('보고서가 저장되었습니다.','success');
      _view='list'; render();
    });

    var pv = $q('#_pvbtn');
    if (pv) pv.addEventListener('click', function(){
      var r = collectForm(); if (!r) return;
      r.attachments = JSON.parse(JSON.stringify(_attaches));
      _pvReport=r; _pvSrc='edit'; _view='preview'; render();
    });

    var ds = $q('#_dsel');
    if (ds) ds.addEventListener('change', function(){
      var r = collectForm(); if (r){ _editing=r; render(); }
    });

    var ta = $q('#_tadd');
    if (ta) ta.addEventListener('click', function(){
      if (!_editing.trainees) _editing.trainees=[];
      _editing.trainees.push({courseName:'',startDate:'',endDate:'',enrolled:'',status:''});
      render();
    });
    $qa('._tdel').forEach(function(b){ b.addEventListener('click', function(){
      var i=parseInt(b.dataset.i);
      if (_editing.trainees) _editing.trainees.splice(i,1);
      render();
    }); });

    /* 파일 드롭존 */
    var drop = $q('#_drop'), fin = $q('#_finput');
    if (drop) {
      drop.addEventListener('click', function(){ fin&&fin.click(); });
      drop.addEventListener('dragover', function(e){ e.preventDefault(); drop.classList.add('rpt-drop-over'); });
      drop.addEventListener('dragleave', function(){ drop.classList.remove('rpt-drop-over'); });
      drop.addEventListener('drop', function(e){
        e.preventDefault(); drop.classList.remove('rpt-drop-over');
        Array.from(e.dataTransfer.files).forEach(function(f){ processFile(f,null); });
      });
    }
    if (fin) fin.addEventListener('change', function(){
      Array.from(fin.files).forEach(function(f){ processFile(f,null); }); fin.value='';
    });

    /* 이미지 붙여넣기 존 */
    $qa('.rpt-paste-z').forEach(function(z){
      z.addEventListener('focus', function(){ if(z.textContent.indexOf('📎')>=0) z.textContent=''; });
      z.addEventListener('blur',  function(){
        if (!z.textContent.trim()) z.textContent='📎 이미지 붙여넣기 (클릭 후 Ctrl+V)';
      });
      z.addEventListener('paste', function(e){
        e.preventDefault();
        var sec=z.dataset.sec, items=e.clipboardData&&e.clipboardData.items; if(!items) return;
        Array.from(items).forEach(function(item){
          if (item.type.indexOf('image')>=0) processFile(item.getAsFile(), sec);
        });
      });
    });

    renderAlist();
  }

  function bindPreview() {
    var be = $q('#_back_edit');
    if (be) be.addEventListener('click', function(){ _view='edit'; render(); });
    var bl = $q('#_back_list');
    if (bl) bl.addEventListener('click', function(){ _view='list'; render(); });
  }

  function bindAdmin() {
    var wsv = $q('#_wsave');
    if (wsv) wsv.addEventListener('click', function(){
      var id   = ($q('#_weid')||{}).value||'';
      var year = parseInt(($q('#_wyear')||{}).value);
      var wnum = parseInt(($q('#_wnum')||{}).value);
      var wst  = ($q('#_wst')||{}).value||'';
      var wen  = ($q('#_wen')||{}).value||'';
      var wnst = ($q('#_wnst')||{}).value||'';
      var wnen = ($q('#_wnen')||{}).value||'';
      if (!year||!wnum||!wst||!wen){ showToast('연도·주차·금주 기간은 필수입니다.','error'); return; }
      var order = $qa('._dochk:checked').map(function(c){ return c.value; });
      if (!order.length) order = DEPT_LIST.map(function(d){ return d.id; });
      saveWeek({ id:id||('w'+uid()), year:year, weekNum:wnum,
        startDate:wst, endDate:wen, nextStartDate:wnst, nextEndDate:wnen, deptOrder:order });
      showToast('주차 저장 완료','success'); render();
    });

    $qa('._wedit').forEach(function(b){ b.addEventListener('click', function(){
      var w = _weeks.find(function(x){ return x.id===b.dataset.id; }); if (!w) return;
      var set = function(id,v){ var el=$q('#'+id); if(el) el.value=v; };
      set('_weid',w.id); set('_wyear',w.year); set('_wnum',w.weekNum);
      set('_wst',w.startDate||''); set('_wen',w.endDate||'');
      set('_wnst',w.nextStartDate||''); set('_wnen',w.nextEndDate||'');
      var ord=w.deptOrder||[];
      $qa('._dochk').forEach(function(c){ c.checked=ord.indexOf(c.value)>=0; });
      var ft=$q('#_wftitle'); if(ft) ft.textContent='✏️ 주차 편집';
    }); });

    $qa('._wdel').forEach(function(b){ b.addEventListener('click', function(){
      if (!confirm('삭제?')) return; delWeek(b.dataset.id); render();
    }); });

    var wc = $q('#_wcancel');
    if (wc) wc.addEventListener('click', function(){
      ['_weid','_wyear','_wnum','_wst','_wen','_wnst','_wnen'].forEach(function(id){
        var el=$q('#'+id); if(el) el.value='';
      });
      $qa('._dochk').forEach(function(c){ c.checked=false; });
      var ft=$q('#_wftitle'); if(ft) ft.textContent='+ 새 주차 추가';
    });
  }

  /* ══════════════════════════════════════════════
     폼 데이터 수집
  ══════════════════════════════════════════════ */
  function collectForm() {
    var g = function(id){ var el=$q('#'+id); return el?el.value:''; };
    var weekId   = g('_wsel') || _editing.weekId||'';
    var deptId   = g('_dsel') || _editing.deptId||'';
    var author   = g('_author').trim();
    var reviewer = g('_reviewer').trim();
    var total    = g('_total');
    var status   = g('_ssel')||'draft';

    if (!author){ showToast('작성자를 입력하세요.','error'); return null; }

    var att = {};
    $qa('.rpt-att-c').forEach(function(inp){
      var row=inp.dataset.row, day=inp.dataset.day;
      if (!att[row]) att[row]={};
      att[row][day]=inp.value;
    });

    var tasks = {};
    ['completed','planned','issues','notices'].forEach(function(k){
      var ta=$q('#rpt_'+k); if(ta) tasks[k]=ta.value;
    });

    var trainees=[];
    $qa('#_tbody tr').forEach(function(tr){
      var row={};
      tr.querySelectorAll('.rpt-ti').forEach(function(inp){ row[inp.name]=inp.value; });
      trainees.push(row);
    });

    var ws={};
    $qa('.rpt-wi').forEach(function(inp){ ws[inp.dataset.dept]=inp.value; });
    var wt=$q('#_wtotal'); if(wt) ws.total=wt.value;

    return {
      id:           _editing.id||('r'+uid()),
      weekId:       weekId,
      deptId:       deptId,
      author:       author,
      reviewer:     reviewer,
      totalMembers: total,
      status:       status,
      attendance:   att,
      tasks:        tasks,
      trainees:     trainees,
      workerStat:   ws,
      authorKey:    authorKey(),
      updatedAt:    new Date().toISOString(),
    };
  }

  /* ══════════════════════════════════════════════
     파일 처리
  ══════════════════════════════════════════════ */
  function processFile(file, section) {
    if (!file) return;
    var id = 'a'+uid();
    var reader = new FileReader();
    reader.onload = function(e){
      var isImg = file.type.indexOf('image')>=0;
      _attaches.push({
        id:id, name:file.name, type:file.type, section:section,
        dataUrl: isImg ? e.target.result : null,
      });
      renderAlist();
      if (section) renderThumbs(section);
    };
    reader.readAsDataURL(file);
  }

  function renderAlist() {
    var el = $q('#_alist'); if (!el) return;
    el.innerHTML = _attaches.map(function(a){
      var thumb = a.dataUrl ? '<img src="'+a.dataUrl+'" class="rpt-at-img">' : '<span class="rpt-at-icon">📄</span>';
      var pl = a.section ? '['+a.section+' 섹션]' : '[별도 페이지]';
      return '<div class="rpt-at-item">'+thumb+
        '<div class="rpt-at-info"><div class="rpt-at-name">'+a.name+'</div>'+
        '<div class="rpt-at-lbl">'+pl+'</div></div>'+
        '<button class="rpt-btn rpt-danger rpt-sm _arm" data-id="'+a.id+'">×</button></div>';
    }).join('')||'<div style="font-size:12px;color:#aaa;padding:8px">첨부 없음</div>';

    $qa('._arm').forEach(function(b){ b.addEventListener('click', function(){
      var rm=_attaches.find(function(a){ return a.id===b.dataset.id; });
      _attaches=_attaches.filter(function(a){ return a.id!==b.dataset.id; });
      renderAlist();
      if (rm&&rm.section) renderThumbs(rm.section);
    }); });
  }

  function renderThumbs(sec) {
    var el=$q('#rpt_th_'+sec); if(!el) return;
    var imgs=_attaches.filter(function(a){ return a.section===sec&&a.dataUrl; });
    el.innerHTML=imgs.map(function(a){
      return '<div class="rpt-thumb"><img src="'+a.dataUrl+'" class="rpt-timg">'+
        '<button class="rpt-tdel" data-id="'+a.id+'">×</button></div>';
    }).join('');
    $qa('.rpt-tdel').forEach(function(b){ b.addEventListener('click', function(){
      _attaches=_attaches.filter(function(a){ return a.id!==b.dataset.id; });
      renderThumbs(sec); renderAlist();
    }); });
  }

  /* ══════════════════════════════════════════════
     취합 PDF (관리자)
  ══════════════════════════════════════════════ */
  function compileWeek() {
    if (!_weeks.length){ showToast('등록된 주차가 없습니다.','error'); return; }
    var opts = _weeks.map(function(w,i){ return i+' → '+w.year+'년 '+w.weekNum+'주차'; }).join('\n');
    var idx  = parseInt(prompt('취합할 주차 번호 앞 숫자를 입력:\n'+opts));
    if (isNaN(idx)||!_weeks[idx]){ return; }
    var wk    = _weeks[idx];
    var order = wk.deptOrder||DEPT_LIST.map(function(d){ return d.id; });
    var wRpts = _reports.filter(function(r){ return r.weekId===wk.id; });
    wRpts.sort(function(a,b){ return order.indexOf(a.deptId)-order.indexOf(b.deptId); });

    var pages = wRpts.map(function(r){
      var savedAtt = _attaches;
      _attaches = r.attachments||[];
      _pvReport = r;
      var pv = htmlPreview(r);
      _attaches = savedAtt;
      var m = pv.match(/<div class="rpt-pages"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*$/);
      return m ? m[1] : '';
    }).join('<div class="rpt-page-break"></div>');

    var el=$r(); if(!el) return;
    el.innerHTML = '<div class="rpt-wrap rpt-pv-wrap">'+
      '<div class="rpt-bar rpt-pv-bar no-print">'+
      '<button class="rpt-btn rpt-ghost" id="_backc">← 목록</button>'+
      '<span class="rpt-bar-title">📦 '+wk.year+'년 '+wk.weekNum+'주차 취합 ('+wRpts.length+'개 부서)</span>'+
      '<button class="rpt-btn rpt-outline" onclick="window.print()">🖨️ PDF 저장</button>'+
      '</div>'+
      '<div class="rpt-pages">'+pages+'</div></div>';
    el.querySelector('#_backc').addEventListener('click', function(){ _view='list'; render(); });
  }

  /* ══════════════════════════════════════════════
     공개 API
  ══════════════════════════════════════════════ */
  function init() {
    if (_inited){ render(); return; }
    _inited=true; load(); _view='list'; render();
  }

  return { init: init };
})();
