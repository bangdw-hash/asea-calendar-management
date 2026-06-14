'use strict';
/**
 * budget.js — 예산관리 모듈 (BudgetModule)
 *
 * 기능
 *  - 연도 선택 / 세입예산·세출예산·세입세출종합 서브탭
 *  - 부서별 예산 기록 + 확정(일괄확정/세부확정/확정해제)
 *  - 부서 접근제어: 담당자는 본인 부서만, 관리자·임원은 전체
 *  - 확정 예산에 집행내역 입력(문서번호·적요·거래처) + 잔액 자동추적
 *  - 집행 일괄입력 양식(xlsx) 다운로드 + 업로드
 *
 * 저장: localStorage(기기/브라우저). 로그인 계정 권한(AdminModule) 연동.
 *  ※ 다중 사용자 공유가 필요하면 추후 SheetsModule/GAS 백엔드로 승격 가능(구조 동일).
 */
var BudgetModule = (function () {

  var TYPES = { sein: '세입', sechul: '세출' };

  var B = {
    year: 2026,
    subtab: 'sein',
    deptFilter: 'ALL',
    selected: {},   // itemId -> true (세부확정 체크)
  };

  /* ── 유틸 ── */
  function won(n) { return (Number(n) || 0).toLocaleString('ko-KR'); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function uid() { return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function todayYMD() { return (window.toLocalYMD ? window.toLocalYMD() : new Date().toISOString().slice(0,10)); }
  function curEmail() { try { return (localStorage.getItem('asea_user_email') || '').toLowerCase(); } catch(e){ return ''; } }
  function toast(msg, type) {
    if (window.AppToast) return window.AppToast(msg, type);
    var t = document.getElementById('budget-toast');
    if (!t) { t = document.createElement('div'); t.id = 'budget-toast'; t.className = 'budget-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'budget-toast show' + (type === 'error' ? ' err' : '');
    clearTimeout(t._t); t._t = setTimeout(function(){ t.className = 'budget-toast'; }, 3000);
  }

  /* ── 권한 ── */
  function canSeeAll() {
    try { if (window.AdminModule && AdminModule.isManager && AdminModule.isManager()) return true; } catch(e){}
    // 예산 전용 임원 권한
    try { var ex = JSON.parse(localStorage.getItem('asea_budget_execs') || '[]'); if (ex.indexOf(curEmail()) >= 0) return true; } catch(e){}
    return false;
  }
  function isBudgetAdmin() {
    try { if (window.AdminModule && AdminModule.isManager && AdminModule.isManager()) return true; } catch(e){}
    return canSeeAll();
  }
  function myDept() { try { return localStorage.getItem('asea_budget_my_dept') || ''; } catch(e){ return ''; } }
  function setMyDept(d) { try { localStorage.setItem('asea_budget_my_dept', d || ''); } catch(e){} }

  function allDepts() {
    var seed = window.BUDGET_DEPTS_2026 || [];
    var fromData = {};
    items().forEach(function(it){ if (it.dept) fromData[it.dept] = 1; });
    var list = seed.slice();
    Object.keys(fromData).forEach(function(d){ if (list.indexOf(d) < 0) list.push(d); });
    return list;
  }
  // 화면에 보여줄 부서 목록(권한 반영)
  function visibleDepts() {
    if (canSeeAll()) return allDepts();
    var d = myDept();
    return d ? [d] : [];
  }

  /* ── 저장소 ── */
  function kItems(y) { return 'asea_budget_items_' + (y || B.year); }
  function kExec(y)  { return 'asea_budget_exec_'  + (y || B.year); }
  function _load(k) { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch(e){ return []; } }
  function _save(k, arr) { try { localStorage.setItem(k, JSON.stringify(arr)); } catch(e){ toast('저장 공간이 부족합니다.', 'error'); } }

  function items(y) { return _load(kItems(y)); }
  function saveItems(arr, y) { _save(kItems(y), arr); }
  function execs(y) { return _load(kExec(y)); }
  function saveExecs(arr, y) { _save(kExec(y), arr); }

  // 2026 최초 진입 시 업로드 데이터 시드
  function seedIfEmpty(y) {
    y = y || B.year;
    if (items(y).length > 0) return;
    if (y === 2026 && Array.isArray(window.BUDGET_SEED_2026)) {
      var seeded = window.BUDGET_SEED_2026.map(function(s) {
        return {
          id: uid(), year: 2026, type: s.type === '세입' ? 'sein' : 'sechul',
          dept: s.dept || '', gwan: s.gwan || '', hang: s.hang || '', mok: s.mok || '',
          name: s.name || '', desc: s.desc || '', example: s.example || '', calc: s.calc || '',
          amount: Number(s.amount) || 0,
          confirmed: false, confirmedAt: '', confirmedBy: ''
        };
      });
      saveItems(seeded, y);
    }
  }

  function availableYears() {
    var ys = {};
    ys[2026] = 1;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      var m = /^asea_budget_items_(\d{4})$/.exec(k || '');
      if (m) ys[m[1]] = 1;
    }
    // 다음 연도 신규 생성 옵션 위해 현재연도+1까지
    var nowY = new Date().getFullYear();
    ys[nowY] = 1; ys[nowY + 1] = 1;
    return Object.keys(ys).map(Number).sort(function(a,b){ return b - a; });
  }

  /* ── 집계 ── */
  function execTotalForItem(itemId, exArr) {
    var sum = 0; (exArr || execs()).forEach(function(e){ if (e.itemId === itemId) sum += Number(e.amount) || 0; });
    return sum;
  }
  function deptSummary(y) {
    var its = items(y), ex = execs(y), map = {};
    function row(d){ if (!map[d]) map[d] = { dept:d, sein:0, sechul:0, seinC:0, sechulC:0, exec:0 }; return map[d]; }
    its.forEach(function(it){
      var r = row(it.dept);
      if (it.type === 'sein') { r.sein += it.amount; if (it.confirmed) r.seinC += it.amount; }
      else { r.sechul += it.amount; if (it.confirmed) r.sechulC += it.amount; }
    });
    ex.forEach(function(e){ row(e.dept).exec += Number(e.amount) || 0; });
    return map;
  }

  /* ════════════════ 렌더 ════════════════ */
  function root() { return document.getElementById('tab-budget'); }

  function renderTab() {
    var el = root(); if (!el) return;
    seedIfEmpty(B.year);

    var seeAll = canSeeAll();
    if (!seeAll && !myDept()) { renderDeptPicker(el); return; }
    if (!seeAll) B.deptFilter = myDept();

    var years = availableYears();
    var roleLabel = seeAll ? '전체 부서 (관리자/임원)' : ('내 부서: ' + esc(myDept()));

    var html = ''+
    '<div class="bdg-head">' +
      '<div class="bdg-title">💰 예산관리' +
        '<span class="bdg-year-wrap">' +
          '<label class="bdg-year-label">연도</label>' +
          '<select id="bdg-year" class="bdg-year-sel">' +
            years.map(function(y){ return '<option value="'+y+'"'+(y===B.year?' selected':'')+'>'+y+'년</option>'; }).join('') +
          '</select>' +
        '</span>' +
      '</div>' +
      '<div class="bdg-role">'+ roleLabel +
        (seeAll ? ' <button id="bdg-change-dept" class="bdg-link-btn" title="내 부서 변경">부서설정</button>' : ' <button id="bdg-change-dept" class="bdg-link-btn">변경</button>') +
      '</div>' +
    '</div>' +

    '<div class="bdg-subtab-bar facility-subtab-bar" role="tablist">' +
      '<button class="subtab-btn'+(B.subtab==='sein'?' active':'')+'" data-bsub="sein">📥 세입예산</button>' +
      '<button class="subtab-btn'+(B.subtab==='sechul'?' active':'')+'" data-bsub="sechul">📤 세출예산</button>' +
      '<button class="subtab-btn'+(B.subtab==='jonghap'?' active':'')+'" data-bsub="jonghap">📊 세입세출종합</button>' +
    '</div>' +

    '<div id="bdg-body"></div>';

    el.innerHTML = html;

    document.getElementById('bdg-year').addEventListener('change', function(){ B.year = Number(this.value); B.selected = {}; renderTab(); });
    document.getElementById('bdg-change-dept').addEventListener('click', function(){ renderDeptPicker(el, true); });
    el.querySelectorAll('[data-bsub]').forEach(function(b){
      b.addEventListener('click', function(){ B.subtab = b.dataset.bsub; B.selected = {}; renderTab(); });
    });
    if (window.NavGroups) { /* 서브탭 스와이프는 navgroups가 자동 적용 */ }

    if (B.subtab === 'jonghap') renderJonghap();
    else renderBudgetList(B.subtab);
  }

  function renderDeptPicker(el, isChange) {
    var depts = allDepts();
    el.innerHTML = ''+
      '<div class="bdg-picker">' +
        '<h3>예산관리 — 소속 부서 선택</h3>' +
        '<p>예산관리 탭에는 본인 부서의 예산만 표시됩니다. 소속 부서를 선택하세요.<br>(관리자·임원은 전체 부서가 표시됩니다.)</p>' +
        '<select id="bdg-pick-dept" class="bdg-year-sel">' +
          '<option value="">— 부서 선택 —</option>' +
          depts.map(function(d){ return '<option value="'+esc(d)+'"'+(d===myDept()?' selected':'')+'>'+esc(d)+'</option>'; }).join('') +
        '</select>' +
        '<div style="margin-top:14px;display:flex;gap:8px">' +
          '<button id="bdg-pick-save" class="btn btn-primary">저장</button>' +
          (isChange ? '<button id="bdg-pick-cancel" class="btn btn-secondary">취소</button>' : '') +
        '</div>' +
      '</div>';
    document.getElementById('bdg-pick-save').addEventListener('click', function(){
      var v = document.getElementById('bdg-pick-dept').value;
      if (!v) { toast('부서를 선택하세요.', 'error'); return; }
      setMyDept(v); B.deptFilter = v; renderTab();
    });
    var cancel = document.getElementById('bdg-pick-cancel');
    if (cancel) cancel.addEventListener('click', renderTab);
  }

  /* ── 세입/세출 목록 ── */
  function renderBudgetList(type) {
    var body = document.getElementById('bdg-body'); if (!body) return;
    var seeAll = canSeeAll();
    var its = items().filter(function(it){ return it.type === type; });

    // 부서 필터
    var depts = visibleDepts();
    if (!seeAll) its = its.filter(function(it){ return it.dept === myDept(); });
    else if (B.deptFilter !== 'ALL') its = its.filter(function(it){ return it.dept === B.deptFilter; });

    var ex = execs();
    var totAmt = 0, totConf = 0, totExec = 0;
    its.forEach(function(it){ totAmt += it.amount; if (it.confirmed) totConf += it.amount; });
    its.forEach(function(it){ totExec += execTotalForItem(it.id, ex); });

    var deptFilterHtml = seeAll ? (
      '<select id="bdg-dept-filter" class="bdg-dept-filter">' +
        '<option value="ALL"'+(B.deptFilter==='ALL'?' selected':'')+'>전체 부서</option>' +
        depts.map(function(d){ return '<option value="'+esc(d)+'"'+(B.deptFilter===d?' selected':'')+'>'+esc(d)+'</option>'; }).join('') +
      '</select>'
    ) : '';

    var canConfirm = isBudgetAdmin();

    var html = ''+
      '<div class="bdg-toolbar">' +
        '<div class="bdg-tb-left">' + deptFilterHtml +
          '<span class="bdg-stat">예산 <b>'+won(totAmt)+'</b>원</span>' +
          '<span class="bdg-stat ok">확정 <b>'+won(totConf)+'</b>원</span>' +
          '<span class="bdg-stat warn">집행 <b>'+won(totExec)+'</b>원</span>' +
          '<span class="bdg-stat">잔액 <b>'+won(totConf - totExec)+'</b>원</span>' +
        '</div>' +
        '<div class="bdg-tb-right">' +
          (canConfirm ? '<button id="bdg-confirm-bulk" class="btn btn-primary btn-sm">✅ 일괄 확정</button>' +
                        '<button id="bdg-confirm-sel" class="btn btn-secondary btn-sm">☑ 세부 확정</button>' +
                        '<button id="bdg-unconfirm-sel" class="btn btn-ghost btn-sm">확정 해제</button>' : '') +
          '<button id="bdg-exec-tpl" class="btn btn-ghost btn-sm">📥 집행 양식</button>' +
          '<button id="bdg-exec-up" class="btn btn-ghost btn-sm">📤 집행 일괄업로드</button>' +
          '<input id="bdg-exec-file" type="file" accept=".xlsx,.xls" hidden>' +
        '</div>' +
      '</div>' +
      '<div class="scroll-x">' + buildTable(its, ex, canConfirm) + '</div>';

    body.innerHTML = html;

    var df = document.getElementById('bdg-dept-filter');
    if (df) df.addEventListener('change', function(){ B.deptFilter = this.value; B.selected = {}; renderTab(); });

    if (canConfirm) {
      document.getElementById('bdg-confirm-bulk').addEventListener('click', function(){ confirmItems(its.map(function(i){return i.id;}), true); });
      document.getElementById('bdg-confirm-sel').addEventListener('click', function(){ confirmItems(selectedIds(), true); });
      document.getElementById('bdg-unconfirm-sel').addEventListener('click', function(){ confirmItems(selectedIds(), false); });
    }
    document.getElementById('bdg-exec-tpl').addEventListener('click', function(){ downloadExecTemplate(its); });
    var upBtn = document.getElementById('bdg-exec-up'), upFile = document.getElementById('bdg-exec-file');
    upBtn.addEventListener('click', function(){ upFile.click(); });
    upFile.addEventListener('change', function(){ if (this.files[0]) bulkUploadExec(this.files[0]); this.value=''; });

    // 행 이벤트
    body.querySelectorAll('.bdg-row-check').forEach(function(cb){
      cb.addEventListener('change', function(){ B.selected[this.dataset.id] = this.checked; });
    });
    body.querySelectorAll('.bdg-exec-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ openExecModal(this.dataset.id); });
    });
    body.querySelectorAll('.bdg-detail-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ openItemDetail(this.dataset.id); });
    });
  }

  function buildTable(its, ex, canConfirm) {
    if (!its.length) return '<div class="bdg-empty">해당 조건의 예산 항목이 없습니다.</div>';
    // 부서 → 관 → 항 그룹 정렬
    its = its.slice().sort(function(a,b){
      return (a.dept+'').localeCompare(b.dept+'','ko') || numcmp(a.gwan,b.gwan) || numcmp(a.hang,b.hang) || numcmp(a.mok,b.mok);
    });
    var rows = '', curDept = null;
    its.forEach(function(it){
      if (it.dept !== curDept) {
        curDept = it.dept;
        rows += '<tr class="bdg-dept-row"><td colspan="9">🏢 '+esc(curDept)+'</td></tr>';
      }
      var used = execTotalForItem(it.id, ex);
      var remain = (it.confirmed ? it.amount : 0) - used;
      rows += '<tr class="'+(it.confirmed?'bdg-confirmed':'')+'">' +
        '<td class="bdg-c-chk">'+(canConfirm?'<input type="checkbox" class="bdg-row-check" data-id="'+it.id+'">':'')+'</td>' +
        '<td class="bdg-c-code">'+esc(it.gwan)+(it.hang?'.'+esc(it.hang.split('.').slice(-1)[0]):'')+'</td>' +
        '<td class="bdg-c-name"><b>'+esc(it.name)+'</b>'+(it.calc?'<span class="bdg-calc">'+esc(it.calc)+'</span>':'')+'</td>' +
        '<td class="bdg-c-amt">'+won(it.amount)+'</td>' +
        '<td class="bdg-c-st">'+(it.confirmed?'<span class="bdg-badge ok">확정</span>':'<span class="bdg-badge">미확정</span>')+'</td>' +
        '<td class="bdg-c-amt warn">'+won(used)+'</td>' +
        '<td class="bdg-c-amt '+(remain<0?'neg':'')+'">'+won(remain)+'</td>' +
        '<td class="bdg-c-act">' +
          (it.confirmed?'<button class="bdg-exec-btn" data-id="'+it.id+'">＋집행</button>':'') +
          '<button class="bdg-detail-btn" data-id="'+it.id+'">상세</button>' +
        '</td>' +
      '</tr>';
    });
    return '<table class="bdg-table"><thead><tr>' +
      '<th></th><th>코드</th><th>항목(산출내역)</th><th>예산액</th><th>확정</th><th>집행누계</th><th>잔액</th><th>관리</th>' +
      '</tr></thead><tbody>'+rows+'</tbody></table>';
  }
  function numcmp(a,b){ var x=parseFloat(a)||0, y=parseFloat(b)||0; return x-y; }
  function selectedIds(){ return Object.keys(B.selected).filter(function(k){ return B.selected[k]; }); }

  /* ── 확정 ── */
  function confirmItems(ids, val) {
    if (!isBudgetAdmin()) { toast('확정 권한이 없습니다.', 'error'); return; }
    if (!ids.length) { toast(val?'확정할 항목을 선택하세요.':'해제할 항목을 선택하세요.', 'error'); return; }
    var who = curEmail() || '관리자', when = new Date().toISOString();
    var arr = items();
    var n = 0;
    arr.forEach(function(it){
      if (ids.indexOf(it.id) >= 0) { it.confirmed = !!val; it.confirmedAt = val?when:''; it.confirmedBy = val?who:''; n++; }
    });
    saveItems(arr);
    B.selected = {};
    toast(n + '개 항목을 ' + (val?'확정':'확정 해제') + '했습니다.');
    renderTab();
  }

  /* ── 항목 상세 + 집행내역 ── */
  function openItemDetail(id) {
    var it = items().find(function(x){ return x.id === id; }); if (!it) return;
    var list = execs().filter(function(e){ return e.itemId === id; }).sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); });
    var used = list.reduce(function(s,e){ return s + (Number(e.amount)||0); }, 0);
    var rows = list.length ? list.map(function(e){
      return '<tr><td>'+esc(e.date)+'</td><td>'+esc(e.docNo)+'</td><td class="bdg-c-amt">'+won(e.amount)+'</td><td>'+esc(e.summary)+'</td><td>'+esc(e.payee||'')+'</td>'+
        '<td><button class="bdg-exec-del" data-eid="'+e.id+'">삭제</button></td></tr>';
    }).join('') : '<tr><td colspan="6" class="bdg-empty">집행내역이 없습니다.</td></tr>';
    var body = '<div class="bdg-detail">' +
      '<p><b>'+esc(it.dept)+'</b> · '+TYPES[it.type]+' · 코드 '+esc(it.gwan)+(it.hang?'.'+esc(it.hang):'')+'</p>' +
      '<h4>'+esc(it.name)+'</h4>' +
      (it.desc?'<p class="bdg-muted">'+esc(it.desc)+'</p>':'') +
      (it.calc?'<p class="bdg-muted">산출: '+esc(it.calc)+'</p>':'') +
      '<div class="bdg-detail-stats"><span>예산액 <b>'+won(it.amount)+'</b></span><span>집행 <b>'+won(used)+'</b></span><span>잔액 <b>'+won((it.confirmed?it.amount:0)-used)+'</b></span></div>' +
      '<table class="bdg-table sm"><thead><tr><th>일자</th><th>문서번호</th><th>금액</th><th>적요</th><th>거래처</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>' +
      (it.confirmed?'<div style="margin-top:12px"><button id="bdg-detail-add" class="btn btn-primary btn-sm">＋ 집행내역 추가</button></div>':'<p class="bdg-muted">※ 확정된 예산만 집행내역을 입력할 수 있습니다.</p>') +
      '</div>';
    showModal('집행내역 — ' + esc(it.name), body);
    var add = document.getElementById('bdg-detail-add');
    if (add) add.addEventListener('click', function(){ closeModal(); openExecModal(id); });
    document.querySelectorAll('.bdg-exec-del').forEach(function(b){
      b.addEventListener('click', function(){ deleteExec(this.dataset.eid); closeModal(); openItemDetail(id); });
    });
  }

  function openExecModal(itemId) {
    var it = items().find(function(x){ return x.id === itemId; }); if (!it) return;
    if (!it.confirmed) { toast('확정된 예산만 집행 입력이 가능합니다.', 'error'); return; }
    var used = execTotalForItem(itemId), remain = it.amount - used;
    var body = '<div class="bdg-form">' +
      '<p class="bdg-muted">'+esc(it.dept)+' · '+esc(it.name)+' · 잔액 <b>'+won(remain)+'</b>원</p>' +
      '<label>집행일자</label><input id="bx-date" type="date" value="'+todayYMD()+'">' +
      '<label>문서번호 <span class="bdg-req">*</span></label><input id="bx-doc" placeholder="예: 2026-기획-0001 (지출결의/공문 번호)">' +
      '<label>집행금액 <span class="bdg-req">*</span></label><input id="bx-amt" type="number" inputmode="numeric" placeholder="원">' +
      '<label>적요(집행내용) <span class="bdg-req">*</span></label><input id="bx-sum" placeholder="예: 1분기 교재 구입">' +
      '<label>거래처</label><input id="bx-payee" placeholder="예: ○○문구">' +
      '<label>비고</label><input id="bx-note" placeholder="근거/메모">' +
      '<div class="bdg-form-actions"><button id="bx-save" class="btn btn-primary">저장</button><button id="bx-cancel" class="btn btn-secondary">취소</button></div>' +
      '</div>';
    showModal('집행내역 입력', body);
    document.getElementById('bx-cancel').addEventListener('click', closeModal);
    document.getElementById('bx-save').addEventListener('click', function(){
      var doc = document.getElementById('bx-doc').value.trim();
      var amt = Number(document.getElementById('bx-amt').value);
      var sum = document.getElementById('bx-sum').value.trim();
      if (!doc) { toast('문서번호를 입력하세요.', 'error'); return; }
      if (!amt || amt <= 0) { toast('집행금액을 입력하세요.', 'error'); return; }
      if (!sum) { toast('적요를 입력하세요.', 'error'); return; }
      var rec = {
        id: uid(), year: B.year, type: it.type, itemId: itemId, dept: it.dept,
        date: document.getElementById('bx-date').value || todayYMD(),
        docNo: doc, amount: amt, summary: sum,
        payee: document.getElementById('bx-payee').value.trim(),
        note: document.getElementById('bx-note').value.trim(),
        createdAt: new Date().toISOString(), createdBy: curEmail()
      };
      var arr = execs(); arr.push(rec); saveExecs(arr);
      closeModal(); toast('집행내역이 저장되었습니다.'); renderTab();
    });
  }
  function deleteExec(eid) {
    var arr = execs().filter(function(e){ return e.id !== eid; });
    saveExecs(arr); toast('집행내역을 삭제했습니다.');
  }

  /* ── 종합 ── */
  function renderJonghap() {
    var body = document.getElementById('bdg-body'); if (!body) return;
    var sum = deptSummary(); var seeAll = canSeeAll();
    var depts = (seeAll ? allDepts() : visibleDepts());
    var tot = { sein:0, sechul:0, seinC:0, sechulC:0, exec:0 };
    var rows = depts.map(function(d){
      var r = sum[d] || { dept:d, sein:0, sechul:0, seinC:0, sechulC:0, exec:0 };
      tot.sein+=r.sein; tot.sechul+=r.sechul; tot.seinC+=r.seinC; tot.sechulC+=r.sechulC; tot.exec+=r.exec;
      var remain = r.sechulC - r.exec;
      var rate = r.sechulC ? Math.round(r.exec / r.sechulC * 100) : 0;
      return '<tr><td class="bdg-c-name">'+esc(d)+'</td>' +
        '<td class="bdg-c-amt">'+won(r.sein)+'</td>' +
        '<td class="bdg-c-amt ok">'+won(r.seinC)+'</td>' +
        '<td class="bdg-c-amt">'+won(r.sechul)+'</td>' +
        '<td class="bdg-c-amt ok">'+won(r.sechulC)+'</td>' +
        '<td class="bdg-c-amt warn">'+won(r.exec)+'</td>' +
        '<td class="bdg-c-amt '+(remain<0?'neg':'')+'">'+won(remain)+'</td>' +
        '<td class="bdg-c-rate"><div class="bdg-bar"><span style="width:'+Math.min(rate,100)+'%"></span></div>'+rate+'%</td>' +
      '</tr>';
    }).join('');
    var remainT = tot.sechulC - tot.exec;
    var html =
      '<div class="bdg-jong-cards">' +
        card('세입 확정', won(tot.seinC), 'ok') +
        card('세출 확정', won(tot.sechulC), 'ok') +
        card('집행 누계', won(tot.exec), 'warn') +
        card('세출 잔액', won(remainT), remainT<0?'neg':'') +
        card('세입-세출(확정)', won(tot.seinC - tot.sechulC), (tot.seinC-tot.sechulC)<0?'neg':'') +
      '</div>' +
      '<div class="scroll-x"><table class="bdg-table"><thead><tr>' +
        '<th>부서</th><th>세입예산</th><th>세입확정</th><th>세출예산</th><th>세출확정</th><th>집행누계</th><th>세출잔액</th><th>집행률</th>' +
      '</tr></thead><tbody>'+rows+
      '<tr class="bdg-total-row"><td>합계</td><td class="bdg-c-amt">'+won(tot.sein)+'</td><td class="bdg-c-amt">'+won(tot.seinC)+'</td><td class="bdg-c-amt">'+won(tot.sechul)+'</td><td class="bdg-c-amt">'+won(tot.sechulC)+'</td><td class="bdg-c-amt">'+won(tot.exec)+'</td><td class="bdg-c-amt">'+won(remainT)+'</td><td></td></tr>' +
      '</tbody></table></div>' +
      '<div style="margin-top:12px"><button id="bdg-export-all" class="btn btn-secondary btn-sm">📊 종합 xlsx 내보내기</button></div>';
    body.innerHTML = html;
    document.getElementById('bdg-export-all').addEventListener('click', exportJonghap);
  }
  function card(label, val, cls) {
    return '<div class="bdg-card '+(cls||'')+'"><div class="bdg-card-l">'+label+'</div><div class="bdg-card-v">'+val+'<span>원</span></div></div>';
  }

  /* ── xlsx 양식/업로드/내보내기 ── */
  function hasXLSX() { return typeof window.XLSX !== 'undefined' && window.XLSX && window.XLSX.utils; }

  function downloadExecTemplate(its) {
    if (!hasXLSX()) { toast('엑셀 모듈을 불러오지 못했습니다.', 'error'); return; }
    var confirmed = its.filter(function(i){ return i.confirmed; });
    var head = ['부서','유형','코드(관.항.목)','항목명','집행일자(YYYY-MM-DD)','문서번호','집행금액','적요','거래처','비고','__itemId(수정금지)'];
    var aoa = [head];
    (confirmed.length?confirmed:its).forEach(function(it){
      aoa.push([it.dept, TYPES[it.type], [it.gwan,it.hang,it.mok].filter(Boolean).join('.'), it.name, todayYMD(), '', '', '', '', '', it.id]);
    });
    var ws = window.XLSX.utils.aoa_to_sheet(aoa);
    var wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, '집행입력');
    window.XLSX.writeFile(wb, '예산집행_양식_'+B.year+'.xlsx');
    toast('양식을 다운로드했습니다. 행을 채워 일괄업로드하세요.');
  }

  function bulkUploadExec(file) {
    if (!hasXLSX()) { toast('엑셀 모듈을 불러오지 못했습니다.', 'error'); return; }
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var wb = window.XLSX.read(e.target.result, { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var rows = window.XLSX.utils.sheet_to_json(ws, { header: 1 });
        var head = (rows[0] || []).map(function(h){ return String(h).trim(); });
        function idx(name){ for (var i=0;i<head.length;i++){ if (head[i].indexOf(name)>=0) return i; } return -1; }
        var iId=idx('__itemId'), iDate=idx('집행일자'), iDoc=idx('문서번호'), iAmt=idx('집행금액'), iSum=idx('적요'), iPay=idx('거래처'), iNote=idx('비고'), iDept=idx('부서'), iCode=idx('코드');
        var its = items(), exArr = execs(), added = 0, skipped = 0;
        for (var r = 1; r < rows.length; r++) {
          var row = rows[r]; if (!row || !row.length) continue;
          var amt = Number(row[iAmt]); if (!amt || amt <= 0) { continue; }
          var docNo = String(row[iDoc] != null ? row[iDoc] : '').trim();
          var item = null;
          if (iId >= 0 && row[iId]) item = its.find(function(x){ return x.id === String(row[iId]).trim(); });
          if (!item && iCode >= 0) {
            var code = String(row[iCode]||'').trim().split('.');
            var dept = String(row[iDept]||'').trim();
            item = its.find(function(x){ return x.dept===dept && [x.gwan,x.hang,x.mok].filter(Boolean).join('.')===code.join('.'); });
          }
          if (!item) { skipped++; continue; }
          if (!item.confirmed) { skipped++; continue; }
          if (!docNo || !row[iSum]) { skipped++; continue; }
          exArr.push({
            id: uid(), year: B.year, type: item.type, itemId: item.id, dept: item.dept,
            date: normDate(row[iDate]), docNo: docNo, amount: amt,
            summary: String(row[iSum]||'').trim(), payee: String(iPay>=0?row[iPay]||'':'').trim(),
            note: String(iNote>=0?row[iNote]||'':'').trim(),
            createdAt: new Date().toISOString(), createdBy: curEmail()
          });
          added++;
        }
        saveExecs(exArr);
        toast('일괄 등록 완료: ' + added + '건 추가' + (skipped?(', '+skipped+'건 건너뜀(미확정/필수누락)'):''));
        renderTab();
      } catch (err) { toast('업로드 실패: ' + err.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
  }
  function normDate(v) {
    if (!v) return todayYMD();
    if (typeof v === 'number' && window.XLSX && window.XLSX.SSF) {
      try { var d = window.XLSX.SSF.parse_date_code(v); if (d) return d.y+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0'); } catch(e){}
    }
    var s = String(v).trim().replace(/\./g,'-').replace(/\s/g,'');
    var m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    return m ? (m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0')) : todayYMD();
  }

  function exportJonghap() {
    if (!hasXLSX()) { toast('엑셀 모듈을 불러오지 못했습니다.', 'error'); return; }
    var sum = deptSummary(); var depts = (canSeeAll()?allDepts():visibleDepts());
    var aoa = [['부서','세입예산','세입확정','세출예산','세출확정','집행누계','세출잔액']];
    depts.forEach(function(d){ var r=sum[d]||{}; aoa.push([d, r.sein||0, r.seinC||0, r.sechul||0, r.sechulC||0, r.exec||0, (r.sechulC||0)-(r.exec||0)]); });
    var ws = window.XLSX.utils.aoa_to_sheet(aoa); var wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, B.year+'_종합'); window.XLSX.writeFile(wb, '예산종합_'+B.year+'.xlsx');
  }

  /* ── 모달 ── */
  function showModal(title, bodyHtml) {
    closeModal();
    var ov = document.createElement('div'); ov.id = 'bdg-modal'; ov.className = 'bdg-modal-ov';
    ov.innerHTML = '<div class="bdg-modal-dialog"><div class="bdg-modal-head"><span>'+esc(title)+'</span><button id="bdg-modal-x">✕</button></div><div class="bdg-modal-body">'+bodyHtml+'</div></div>';
    document.body.appendChild(ov);
    document.getElementById('bdg-modal-x').addEventListener('click', closeModal);
    ov.addEventListener('click', function(e){ if (e.target === ov) closeModal(); });
  }
  function closeModal() { var m = document.getElementById('bdg-modal'); if (m) m.remove(); }

  /* ── 공개 ── */
  return {
    init: function () { /* 데이터는 탭 진입 시 로드 */ },
    renderTab: renderTab,
  };
})();
window.BudgetModule = BudgetModule;
