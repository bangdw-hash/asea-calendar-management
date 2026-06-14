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
    expanded: {},   // itemId -> true (집행내역 펼침)
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
    try { if (window.UserOrg && UserOrg.canSeeAll && UserOrg.canSeeAll()) return true; } catch(e){}
    try { if (window.AdminModule && AdminModule.isManager && AdminModule.isManager()) return true; } catch(e){}
    // 예산 전용 임원 권한
    try { var ex = JSON.parse(localStorage.getItem('asea_budget_execs') || '[]'); if (ex.indexOf(curEmail()) >= 0) return true; } catch(e){}
    return false;
  }
  function isBudgetAdmin() {
    try { if (window.AdminModule && AdminModule.isManager && AdminModule.isManager()) return true; } catch(e){}
    return canSeeAll();
  }
  function myDept() {
    try { if (window.UserOrg && UserOrg.myDept) { var d = UserOrg.myDept(); if (d) return d; } } catch(e){}
    try { return localStorage.getItem('asea_budget_my_dept') || ''; } catch(e){ return ''; }
  }
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

  /* ── 부서별 예산 한도(캡) + 편성 ── */
  function kCaps(y) { return 'asea_budget_caps_' + (y || B.year); }
  function getCaps(y) { try { return JSON.parse(localStorage.getItem(kCaps(y)) || '{}'); } catch (e) { return {}; } }
  function saveCaps(obj, y) { _save(kCaps(y), obj); }
  function capOf(dept, type, y) { var c = getCaps(y); return (c[dept] && Number(c[dept][type])) || 0; }
  function deptDrafted(dept, type, y, excludeId) {
    return items(y).reduce(function (s, it) {
      return (it.dept === dept && it.type === type && it.id !== excludeId) ? s + (Number(it.amount) || 0) : s;
    }, 0);
  }
  function gv(id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }

  // 전년도 예산을 초안으로 불러오기
  function importPrevYear() {
    var prev = B.year - 1;
    var prevItems = items(prev);
    if (!canSeeAll()) prevItems = prevItems.filter(function (it) { return it.dept === myDept(); });
    if (!prevItems.length) { toast(prev + '년 예산 데이터가 없습니다.', 'error'); return; }
    if (!confirm(prev + '년 예산 ' + prevItems.length + '건을 ' + B.year + '년 초안으로 불러올까요?\n(금액은 그대로, 확정상태는 해제되어 복사됩니다)')) return;
    var cur = items(B.year);
    var copied = prevItems.map(function (s) {
      return { id: uid(), year: B.year, type: s.type, dept: s.dept, gwan: s.gwan, hang: s.hang, mok: s.mok,
               name: s.name, desc: s.desc, example: s.example, calc: s.calc, amount: Number(s.amount) || 0,
               confirmed: false, confirmedAt: '', confirmedBy: '', createdAt: new Date().toISOString(), createdBy: curEmail() };
    });
    saveItems(cur.concat(copied), B.year);
    toast(prev + '년 예산 ' + copied.length + '건을 ' + B.year + '년 초안으로 불러왔습니다.');
    renderTab();
  }

  // 관리자: 부서별 편성 한도 설정
  function openCapsModal(type) {
    if (!isBudgetAdmin()) { toast('한도 설정 권한이 없습니다.', 'error'); return; }
    var caps = getCaps(); var depts = allDepts();
    var rows = depts.map(function (d) {
      var v = (caps[d] || {})[type] || 0;
      var drafted = deptDrafted(d, type, B.year);
      return '<tr><td>' + esc(d) + '</td>' +
        '<td><input class="bdg-cap-in" data-dept="' + esc(d) + '" type="number" inputmode="numeric" value="' + (v || '') + '" placeholder="무제한"></td>' +
        '<td class="bdg-c-amt">' + won(drafted) + '</td></tr>';
    }).join('');
    var body = '<div class="bdg-form">' +
      '<p class="bdg-muted">' + TYPES[type] + ' 예산의 부서별 <b>편성 한도(원)</b>. 비워두면 무제한. 각 부서는 한도 내에서만 초안을 편성할 수 있습니다.</p>' +
      '<div class="scroll-x"><table class="bdg-table sm"><thead><tr><th>부서</th><th>편성 한도</th><th>현재 편성액</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="bdg-form-actions"><button id="bdg-caps-save" class="btn btn-primary">저장</button><button id="bdg-caps-cancel" class="btn btn-secondary">취소</button></div>' +
      '</div>';
    showModal(TYPES[type] + ' 부서별 편성 한도', body);
    document.getElementById('bdg-caps-cancel').addEventListener('click', closeModal);
    document.getElementById('bdg-caps-save').addEventListener('click', function () {
      var c = getCaps();
      document.querySelectorAll('.bdg-cap-in').forEach(function (inp) {
        var d = inp.dataset.dept; if (!c[d]) c[d] = {}; c[d][type] = Number(inp.value) || 0;
      });
      saveCaps(c); closeModal(); toast('부서별 편성 한도를 저장했습니다.'); renderTab();
    });
  }

  // 초안 항목 추가/수정
  function openItemEdit(editId, type) {
    var seeAll = canSeeAll();
    var ed = editId ? items().find(function (x) { return x.id === editId; }) : null;
    if (ed && ed.confirmed && !isBudgetAdmin()) { toast('확정된 항목은 수정할 수 없습니다. (관리자 확정 해제 후 가능)', 'error'); return; }
    var dept = ed ? ed.dept : (seeAll ? (B.deptFilter !== 'ALL' ? B.deptFilter : (allDepts()[0] || '')) : myDept());
    var deptField = (seeAll && !ed)
      ? '<label>부서</label><select id="bi-dept">' + allDepts().map(function (d) { return '<option' + (d === dept ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join('') + '</select>'
      : '<label>부서</label><input id="bi-dept" value="' + esc(dept) + '" readonly>';
    var v = ed || {};
    var body = '<div class="bdg-form">' +
      deptField +
      '<label>관 / 항 / 목 (코드)</label><div style="display:flex;gap:6px">' +
        '<input id="bi-gwan" value="' + esc(v.gwan || '') + '" placeholder="관">' +
        '<input id="bi-hang" value="' + esc(v.hang || '') + '" placeholder="항">' +
        '<input id="bi-mok" value="' + esc(v.mok || '') + '" placeholder="목"></div>' +
      '<label>명칭 <span class="bdg-req">*</span></label><input id="bi-name" value="' + esc(v.name || '') + '" placeholder="예: 직원 역량강화 교육비">' +
      '<label>설명</label><input id="bi-desc" value="' + esc(v.desc || '') + '">' +
      '<label>산출 세부내역</label><input id="bi-calc" value="' + esc(v.calc || '') + '" placeholder="예: 50만원 × 4회">' +
      '<label>예산액(원) <span class="bdg-req">*</span></label><input id="bi-amt" type="number" inputmode="numeric" value="' + (v.amount != null ? v.amount : '') + '">' +
      '<div id="bi-cap-info" class="bdg-cap-info"></div>' +
      '<div class="bdg-form-actions"><button id="bi-save" class="btn btn-primary">' + (ed ? '수정 저장' : '추가') + '</button><button id="bi-cancel" class="btn btn-secondary">취소</button></div>' +
      '</div>';
    showModal(ed ? (TYPES[type] + ' 항목 수정') : (TYPES[type] + ' 초안 항목 추가'), body);
    function curDept() { var el = document.getElementById('bi-dept'); return el ? el.value : dept; }
    function updCap() {
      var d = curDept(); var cap = capOf(d, type, B.year); var drafted = deptDrafted(d, type, B.year, editId);
      var amt = Number(document.getElementById('bi-amt').value) || 0;
      var info = document.getElementById('bi-cap-info');
      if (cap > 0) {
        var after = drafted + amt;
        info.innerHTML = '편성 한도 ' + won(cap) + '원 · 편성예정 ' + won(after) + '원 · 잔여 ' + won(cap - after) + '원' +
          (after > cap ? ' <b style="color:var(--color-error)">⚠ 한도 초과</b>' : '');
        info.style.color = after > cap ? 'var(--color-error)' : '';
      } else { info.textContent = '편성 한도 미설정(무제한)'; info.style.color = ''; }
    }
    ['bi-amt'].forEach(function (id) { var el = document.getElementById(id); if (el) el.addEventListener('input', updCap); });
    var ds = document.getElementById('bi-dept'); if (ds && ds.tagName === 'SELECT') ds.addEventListener('change', updCap);
    updCap();
    document.getElementById('bi-cancel').addEventListener('click', closeModal);
    document.getElementById('bi-save').addEventListener('click', function () {
      var d = curDept();
      var name = document.getElementById('bi-name').value.trim();
      var amt = Number(document.getElementById('bi-amt').value) || 0;
      if (!name) { toast('명칭을 입력하세요.', 'error'); return; }
      if (amt < 0) { toast('금액을 확인하세요.', 'error'); return; }
      var cap = capOf(d, type, B.year), drafted = deptDrafted(d, type, B.year, editId);
      if (cap > 0 && drafted + amt > cap) {
        toast('부서 편성 한도 초과: 한도 ' + won(cap) + ' / 편성 ' + won(drafted + amt) + ' (초과 ' + won(drafted + amt - cap) + ')', 'error'); return;
      }
      var arr = items();
      if (ed) {
        var r = arr.find(function (x) { return x.id === editId; });
        if (r) { r.dept = d; r.gwan = gv('bi-gwan'); r.hang = gv('bi-hang'); r.mok = gv('bi-mok'); r.name = name; r.desc = gv('bi-desc'); r.calc = gv('bi-calc'); r.amount = amt; r.updatedAt = new Date().toISOString(); }
      } else {
        arr.push({ id: uid(), year: B.year, type: type, dept: d, gwan: gv('bi-gwan'), hang: gv('bi-hang'), mok: gv('bi-mok'),
                   name: name, desc: gv('bi-desc'), example: '', calc: gv('bi-calc'), amount: amt,
                   confirmed: false, confirmedAt: '', confirmedBy: '', createdAt: new Date().toISOString(), createdBy: curEmail() });
      }
      saveItems(arr); closeModal(); toast(ed ? '항목을 수정했습니다.' : '초안 항목을 추가했습니다.'); renderTab();
    });
  }

  function deleteItem(id) {
    var it = items().find(function (x) { return x.id === id; }); if (!it) return;
    if (it.confirmed && !isBudgetAdmin()) { toast('확정된 항목은 삭제할 수 없습니다.', 'error'); return; }
    if (!confirm('이 예산 항목을 삭제하시겠습니까?\n(관련 집행내역도 함께 삭제됩니다)')) return;
    saveItems(items().filter(function (x) { return x.id !== id; }));
    saveExecs(execs().filter(function (e) { return e.itemId !== id; }));
    toast('항목을 삭제했습니다.'); renderTab();
  }

  /* ── 집행승인번호(예약/encumbrance) ── */
  function kResv(y) { return 'asea_budget_resv_' + (y || B.year); }
  function reservs(y) { return _load(kResv(y)); }
  function saveReservs(arr, y) { _save(kResv(y), arr); }
  function reservedForItem(itemId, y) {
    return reservs(y).reduce(function (s, r) { return (r.itemId === itemId && r.status === 'reserved') ? s + (Number(r.amount) || 0) : s; }, 0);
  }
  function availableForItem(it) {
    return (it.confirmed ? it.amount : 0) - execTotalForItem(it.id) - reservedForItem(it.id);
  }
  function verifyBase() {
    var p = location.pathname.replace(/[^/]*$/, '');   // 현재 폴더
    return location.origin + p + 'verify.html';
  }
  function genNo(year, type) {
    var code = (type === 'sechul' ? 'E' : 'I');
    var seq = reservs(year).length + 1;
    var rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    return year + '-' + code + '-' + ('000' + seq).slice(-4) + '-' + rand;
  }

  // 집행 사전신청 → 승인번호 발급(예약). 가용잔액 초과 시 차단.
  function openIssueModal(itemId) {
    var it = items().find(function (x) { return x.id === itemId; }); if (!it) return;
    if (!it.confirmed) { toast('확정된 예산만 승인번호 발급이 가능합니다.', 'error'); return; }
    var avail = availableForItem(it);
    var body = '<div class="bdg-form">' +
      '<p class="bdg-muted">' + esc(it.dept) + ' · ' + esc(it.name) + '</p>' +
      '<div class="bdg-detail-stats"><span>확정예산 <b>' + won(it.amount) + '</b></span><span>집행 <b>' + won(execTotalForItem(it.id)) + '</b></span><span>예약 <b>' + won(reservedForItem(it.id)) + '</b></span><span>가용잔액 <b>' + won(avail) + '</b></span></div>' +
      '<label>집행(신청) 금액 <span class="bdg-req">*</span></label><input id="iv-amt" type="number" inputmode="numeric" placeholder="원">' +
      '<label>집행 사유/적요 <span class="bdg-req">*</span></label><input id="iv-sum" placeholder="예: 1분기 교재 구입(기안 예정)">' +
      '<div id="iv-info" class="bdg-cap-info"></div>' +
      '<div class="bdg-form-actions"><button id="iv-save" class="btn btn-primary">승인번호 발급</button><button id="iv-cancel" class="btn btn-secondary">취소</button></div>' +
      '</div>';
    showModal('집행 사전신청 · 승인번호 발급', body);
    function upd() {
      var amt = Number(document.getElementById('iv-amt').value) || 0;
      var info = document.getElementById('iv-info');
      if (amt > avail) { info.innerHTML = '<b style="color:var(--color-error)">⚠ 가용잔액 초과 (부족 ' + won(amt - avail) + '원) — 발급 불가</b>'; }
      else if (amt > 0) { info.innerHTML = '발급 후 가용잔액 ' + won(avail - amt) + '원'; }
      else info.textContent = '';
    }
    document.getElementById('iv-amt').addEventListener('input', upd);
    document.getElementById('iv-cancel').addEventListener('click', closeModal);
    document.getElementById('iv-save').addEventListener('click', function () {
      var amt = Number(document.getElementById('iv-amt').value) || 0;
      var sum = document.getElementById('iv-sum').value.trim();
      if (!amt || amt <= 0) { toast('금액을 입력하세요.', 'error'); return; }
      if (!sum) { toast('사유/적요를 입력하세요.', 'error'); return; }
      if (amt > avail) { toast('가용잔액 초과로 발급할 수 없습니다. (부족 ' + won(amt - avail) + '원)', 'error'); return; }
      var no = genNo(B.year, it.type);
      var r = { id: uid(), no: no, year: B.year, type: it.type, itemId: it.id, dept: it.dept,
                itemName: it.name, amount: amt, summary: sum, status: 'reserved',
                createdAt: new Date().toISOString(), createdBy: curEmail() };
      var arr = reservs(); arr.push(r); saveReservs(arr);
      closeModal(); showIssuedResult(r); renderTab();
    });
  }
  function showIssuedResult(r) {
    var url = verifyBase() + '?no=' + encodeURIComponent(r.no);
    var it = items().find(function(x){ return x.id === r.itemId; }) || { name: r.itemName, amount: 0, confirmed: true };
    var budget = it.confirmed ? it.amount : 0;
    var usedBefore = execTotalForItem(it.id);               // 기존 누적 집행액
    var reservedAll = reservedForItem(it.id);               // 이 건 포함 예약 합계
    var remainAfter = budget - usedBefore - reservedAll;    // 잔여(가용)
    var qr = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=' + encodeURIComponent(url);
    var basis =
      '[예산 집행 근거]\n' +
      '· 예산항목: ' + (it.name || r.itemName || '') + ' (' + r.dept + '/' + TYPES[r.type] + ')\n' +
      '· 집행 승인코드: ' + r.no + '\n' +
      '· 금번 집행(신청)액: ' + won(r.amount) + '원\n' +
      '· 기존 누적 집행액: ' + won(usedBefore) + '원\n' +
      '· 잔여 집행 가능액: ' + won(remainAfter) + '원\n' +
      '· 확정예산: ' + won(budget) + '원\n' +
      '· 사유: ' + (r.summary || '') + '\n' +
      '· 실시간 조회: ' + url;
    var body = '<div class="bdg-form">' +
      '<p>✅ 집행승인번호가 발급되었습니다. 아래 내용을 기안문에 붙여넣으세요.</p>' +
      '<label>집행승인번호</label><input id="ir-no" readonly value="' + esc(r.no) + '">' +
      '<label>결재자 조회 URL</label><input id="ir-url" readonly value="' + esc(url) + '">' +
      '<div style="text-align:center;margin:12px 0">' +
        '<img id="ir-qr" src="' + qr + '" alt="조회 QR" width="180" height="180" style="border:1px solid var(--color-border);border-radius:10px;background:#fff" crossorigin="anonymous">' +
        '<div class="bdg-muted" style="margin-top:4px">QR을 길게 눌러(모바일)/우클릭(PC) 복사하거나 아래 버튼으로 저장</div>' +
      '</div>' +
      '<label>집행 근거 (기안문 붙여넣기용)</label>' +
      '<textarea id="ir-basis" readonly rows="9" style="width:100%;font-size:12.5px;line-height:1.6;border:1px solid var(--color-border);border-radius:8px;padding:10px;box-sizing:border-box">' + esc(basis) + '</textarea>' +
      '<div class="bdg-form-actions" style="flex-wrap:wrap">' +
        '<button id="ir-copy-basis" class="btn btn-primary">📋 집행근거 복사</button>' +
        '<button id="ir-copy" class="btn btn-secondary">URL 복사</button>' +
        '<button id="ir-qr-copy" class="btn btn-secondary">QR 복사</button>' +
        '<button id="ir-qr-dl" class="btn btn-ghost">QR 저장</button>' +
        '<button id="ir-close" class="btn btn-ghost">닫기</button>' +
      '</div>' +
      '</div>';
    showModal('승인번호 발급 완료', body);
    function copy(text){
      function fb(){ try{ var ta=document.getElementById('ir-basis'); ta.removeAttribute('readonly'); ta.value=text; ta.focus(); ta.select(); document.execCommand('copy'); ta.setAttribute('readonly','readonly'); ta.value=basis; toast('복사되었습니다.'); }catch(_){ toast('복사 실패 — 길게 눌러 복사하세요.','error'); } }
      try { if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function(){toast('복사되었습니다.');}, fb); else fb(); } catch(e){ fb(); }
    }
    document.getElementById('ir-copy-basis').addEventListener('click', function(){ copy(basis); });
    document.getElementById('ir-copy').addEventListener('click', function(){ copy(url); });
    document.getElementById('ir-close').addEventListener('click', closeModal);
    document.getElementById('ir-qr-dl').addEventListener('click', function(){ var a=document.createElement('a'); a.href=qr; a.download='집행승인_'+r.no+'.png'; a.target='_blank'; document.body.appendChild(a); a.click(); a.remove(); });
    document.getElementById('ir-qr-copy').addEventListener('click', function(){
      try {
        fetch(qr).then(function(res){ return res.blob(); }).then(function(blob){
          if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
            return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function(){ toast('QR 이미지가 복사되었습니다.'); });
          }
          throw 0;
        }).catch(function(){ toast('QR은 길게 눌러(모바일)/우클릭(PC)으로 복사하거나 저장하세요.', 'error'); });
      } catch(e){ toast('QR은 길게 눌러/우클릭으로 복사하세요.', 'error'); }
    });
  }
  function openReservList() {
    var arr = reservs().slice().sort(function(a,b){ return (b.createdAt||'').localeCompare(a.createdAt||''); });
    if (!canSeeAll()) arr = arr.filter(function(r){ return r.dept === myDept(); });
    var statusLabel = { reserved:'예약중', executed:'집행완료', canceled:'취소' };
    var rows = arr.length ? arr.map(function(r){
      var url = verifyBase() + '?no=' + encodeURIComponent(r.no);
      return '<tr>' +
        '<td>' + esc(r.no) + '</td>' +
        '<td>' + esc(r.dept) + '<div class="bdg-muted">' + esc(r.itemName||'') + '</div></td>' +
        '<td class="bdg-c-amt">' + won(r.amount) + '</td>' +
        '<td>' + esc(r.summary||'') + '</td>' +
        '<td><span class="bdg-badge ' + (r.status==='executed'?'ok':(r.status==='canceled'?'rej':'sub')) + '">' + (statusLabel[r.status]||r.status) + '</span></td>' +
        '<td class="bdg-c-act">' +
          '<button class="rv-url" data-url="' + esc(url) + '">URL</button>' +
          (r.status==='reserved' ? '<button class="rv-exec" data-id="'+r.id+'">집행전환</button><button class="rv-cancel" data-id="'+r.id+'">취소</button>' : '') +
        '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="bdg-empty">발급된 승인번호가 없습니다.</td></tr>';
    var body = '<div class="scroll-x"><table class="bdg-table sm"><thead><tr><th>승인번호</th><th>부서/항목</th><th>금액</th><th>사유</th><th>상태</th><th>관리</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    showModal('집행승인번호 관리', body);
    document.querySelectorAll('.rv-url').forEach(function(b){ b.addEventListener('click', function(){ try{ navigator.clipboard.writeText(this.dataset.url); toast('URL 복사됨'); }catch(e){} }); });
    document.querySelectorAll('.rv-exec').forEach(function(b){ b.addEventListener('click', function(){ reservToExec(this.dataset.id); }); });
    document.querySelectorAll('.rv-cancel').forEach(function(b){ b.addEventListener('click', function(){ if(confirm('이 승인번호를 취소할까요? (예약 잔액이 복원됩니다)')){ setReservStatus(this.dataset.id,'canceled'); } }); });
  }
  function setReservStatus(id, st) {
    var arr = reservs(); var r = arr.find(function(x){ return x.id===id; }); if(!r) return;
    r.status = st; saveReservs(arr); toast('처리되었습니다.'); closeModal(); openReservList();
  }
  // 예약 → 실제 집행내역으로 전환
  function reservToExec(id) {
    var arr = reservs(); var r = arr.find(function(x){ return x.id===id; }); if(!r) return;
    var docNo = prompt('집행 문서번호(지출결의/공문)를 입력하세요:', r.no) || r.no;
    var ex = execs(); ex.push({ id: uid(), year: r.year, type: r.type, itemId: r.itemId, dept: r.dept,
      date: todayYMD(), docNo: docNo, amount: r.amount, summary: r.summary, payee: '', note: '승인번호 '+r.no,
      createdAt: new Date().toISOString(), createdBy: curEmail() });
    saveExecs(ex);
    r.status = 'executed'; saveReservs(arr);
    toast('집행내역으로 전환되었습니다.'); closeModal(); renderTab();
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
      '<div class="bdg-role">'+ roleLabel +'</div>' +
    '</div>' +

    '<div class="bdg-subtab-bar facility-subtab-bar" role="tablist">' +
      '<button class="subtab-btn'+(B.subtab==='sein'?' active':'')+'" data-bsub="sein">📥 세입예산</button>' +
      '<button class="subtab-btn'+(B.subtab==='sechul'?' active':'')+'" data-bsub="sechul">📤 세출예산</button>' +
      '<button class="subtab-btn'+(B.subtab==='jonghap'?' active':'')+'" data-bsub="jonghap">📊 세입세출종합</button>' +
    '</div>' +

    '<div id="bdg-body"></div>';

    el.innerHTML = html;

    document.getElementById('bdg-year').addEventListener('change', function(){ B.year = Number(this.value); B.selected = {}; renderTab(); });
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
      if (window.UserOrg && UserOrg.setMine) UserOrg.setMine(v, null); else setMyDept(v);
      B.deptFilter = v; renderTab();
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
          '<button id="bdg-item-add" class="btn btn-primary btn-sm">＋ 초안 항목</button>' +
          '<button id="bdg-submit" class="btn btn-secondary btn-sm">📨 부서 제출</button>' +
          (canConfirm ? '<button id="bdg-caps" class="btn btn-secondary btn-sm">🎯 부서 한도</button>' : '') +
          '<button id="bdg-resv-list" class="btn btn-ghost btn-sm">🔖 승인번호 관리</button>' +
          '<button id="bdg-import-prev" class="btn btn-ghost btn-sm">📂 ' + (B.year - 1) + '년 불러오기</button>' +
          '<button id="bdg-expand-all" class="btn btn-ghost btn-sm">⊕ 집행 모두 펼치기</button>' +
          (canConfirm ? '<button id="bdg-confirm-bulk" class="btn btn-primary btn-sm">✅ 일괄 확정(승인)</button>' +
                        '<button id="bdg-confirm-sel" class="btn btn-secondary btn-sm">☑ 세부 확정</button>' +
                        '<button id="bdg-reject-sel" class="btn btn-ghost btn-sm">↩ 반려</button>' +
                        '<button id="bdg-unconfirm-sel" class="btn btn-ghost btn-sm">확정 해제</button>' : '') +
          '<button id="bdg-exec-tpl" class="btn btn-ghost btn-sm">📥 집행 양식</button>' +
          '<button id="bdg-exec-up" class="btn btn-ghost btn-sm">📤 집행 일괄업로드</button>' +
          '<input id="bdg-exec-file" type="file" accept=".xlsx,.xls" hidden>' +
        '</div>' +
      '</div>' +
      '<div class="scroll-x">' + buildTable(its, ex, canConfirm, type) + '</div>';

    body.innerHTML = html;

    var df = document.getElementById('bdg-dept-filter');
    if (df) df.addEventListener('change', function(){ B.deptFilter = this.value; B.selected = {}; renderTab(); });

    if (canConfirm) {
      document.getElementById('bdg-confirm-bulk').addEventListener('click', function(){ confirmItems(its.map(function(i){return i.id;}), true); });
      document.getElementById('bdg-confirm-sel').addEventListener('click', function(){ confirmItems(selectedIds(), true); });
      document.getElementById('bdg-reject-sel').addEventListener('click', function(){ rejectItems(selectedIds()); });
      document.getElementById('bdg-unconfirm-sel').addEventListener('click', function(){ confirmItems(selectedIds(), false); });
    }
    document.getElementById('bdg-submit').addEventListener('click', function(){ submitItems(its); });
    document.getElementById('bdg-resv-list').addEventListener('click', openReservList);
    body.querySelectorAll('.bdg-issue-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ openIssueModal(this.dataset.id); });
    });
    document.getElementById('bdg-exec-tpl').addEventListener('click', function(){ downloadExecTemplate(its); });
    var upBtn = document.getElementById('bdg-exec-up'), upFile = document.getElementById('bdg-exec-file');
    upBtn.addEventListener('click', function(){ upFile.click(); });
    upFile.addEventListener('change', function(){ if (this.files[0]) bulkUploadExec(this.files[0]); this.value=''; });

    // 초안 편성/한도/전년도 불러오기
    document.getElementById('bdg-item-add').addEventListener('click', function(){ openItemEdit(null, type); });
    var capsBtn = document.getElementById('bdg-caps');
    if (capsBtn) capsBtn.addEventListener('click', function(){ openCapsModal(type); });
    document.getElementById('bdg-import-prev').addEventListener('click', importPrevYear);

    // 모두 펼치기/접기
    var expandAll = document.getElementById('bdg-expand-all');
    if (expandAll) expandAll.addEventListener('click', function(){
      var anyClosed = its.some(function(i){ return !B.expanded[i.id]; });
      its.forEach(function(i){ B.expanded[i.id] = anyClosed; });
      renderBudgetList(type);
    });

    // 행 이벤트
    body.querySelectorAll('.bdg-row-check').forEach(function(cb){
      cb.addEventListener('change', function(){ B.selected[this.dataset.id] = this.checked; });
    });
    body.querySelectorAll('.bdg-exec-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ openExecModal(this.dataset.id); });
    });
    // 세부보기 = 인라인 펼침/접힘(아코디언)
    body.querySelectorAll('.bdg-toggle-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = this.dataset.id;
        B.expanded[id] = !B.expanded[id];
        renderBudgetList(type);
      });
    });
    // 인라인 집행내역: 추가/수정/삭제
    body.querySelectorAll('.bdg-subadd-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ openExecModal(this.dataset.id); });
    });
    body.querySelectorAll('.bdg-exec-edit').forEach(function(btn){
      btn.addEventListener('click', function(){ openExecModal(this.dataset.id, this.dataset.eid); });
    });
    body.querySelectorAll('.bdg-exec-del').forEach(function(btn){
      btn.addEventListener('click', function(){
        if (!confirm('이 집행내역을 삭제하시겠습니까?')) return;
        deleteExec(this.dataset.eid); renderBudgetList(type);
      });
    });
    // 초안 항목 수정/삭제
    body.querySelectorAll('.bdg-item-edit').forEach(function(btn){
      btn.addEventListener('click', function(){ openItemEdit(this.dataset.id, type); });
    });
    body.querySelectorAll('.bdg-item-del').forEach(function(btn){
      btn.addEventListener('click', function(){ deleteItem(this.dataset.id); });
    });
  }

  /* 항목별 집행내역 인라인 HTML (펼침 영역 + 모달 공용) */
  function execListHtml(item, ex) {
    var list = (ex || execs()).filter(function(e){ return e.itemId === item.id; })
      .sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); });
    var used = list.reduce(function(s,e){ return s + (Number(e.amount)||0); }, 0);
    var rowsH = list.length ? list.map(function(e){
      return '<tr>' +
        '<td>'+esc(e.date)+'</td>' +
        '<td>'+esc(e.docNo)+'</td>' +
        '<td class="bdg-c-amt">'+won(e.amount)+'</td>' +
        '<td>'+esc(e.summary)+'</td>' +
        '<td>'+esc(e.payee||'')+'</td>' +
        '<td class="bdg-c-act">' +
          '<button class="bdg-exec-edit" data-id="'+item.id+'" data-eid="'+e.id+'">수정</button>' +
          '<button class="bdg-exec-del" data-id="'+item.id+'" data-eid="'+e.id+'">삭제</button>' +
        '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="bdg-empty">집행내역이 없습니다.</td></tr>';
    var addBtn = item.confirmed
      ? '<button class="bdg-subadd-btn btn btn-primary btn-sm" data-id="'+item.id+'">＋ 집행내역 추가</button>'
      : '<span class="bdg-muted">※ 확정된 예산만 집행 입력이 가능합니다.</span>';
    return '<div class="bdg-sub-wrap">' +
      '<div class="bdg-sub-stats">집행 <b>'+won(used)+'</b>원 · 예산 '+won(item.amount)+'원 · 잔액 <b class="'+(((item.confirmed?item.amount:0)-used)<0?'neg':'')+'">'+won((item.confirmed?item.amount:0)-used)+'</b>원</div>' +
      '<table class="bdg-table sm"><thead><tr><th>일자</th><th>문서번호</th><th>금액</th><th>적요</th><th>거래처</th><th>관리</th></tr></thead><tbody>'+rowsH+'</tbody></table>' +
      '<div style="margin-top:8px">'+addBtn+'</div>' +
      '</div>';
  }

  function buildTable(its, ex, canConfirm, type) {
    if (!its.length) return '<div class="bdg-empty">해당 조건의 예산 항목이 없습니다. 상단 「＋ 초안 항목」 또는 「' + (B.year - 1) + '년 불러오기」로 편성을 시작하세요.</div>';
    // 부서 → 관 → 항 그룹 정렬
    its = its.slice().sort(function(a,b){
      return (a.dept+'').localeCompare(b.dept+'','ko') || numcmp(a.gwan,b.gwan) || numcmp(a.hang,b.hang) || numcmp(a.mok,b.mok);
    });
    var COLS = 9;
    var rows = '', curDept = null;
    its.forEach(function(it){
      if (it.dept !== curDept) {
        curDept = it.dept;
        var cap = capOf(it.dept, type, B.year), drafted = deptDrafted(it.dept, type, B.year);
        var capHtml = cap > 0
          ? ' <span class="bdg-cap-tag">편성한도 '+won(cap)+' · 편성 '+won(drafted)+' · 잔여 <b class="'+((cap-drafted)<0?'neg':'')+'">'+won(cap-drafted)+'</b></span>'
          : ' <span class="bdg-cap-tag muted">한도 미설정 · 편성 '+won(drafted)+'</span>';
        rows += '<tr class="bdg-dept-row"><td colspan="'+COLS+'">🏢 '+esc(curDept)+capHtml+'</td></tr>';
      }
      var used = execTotalForItem(it.id, ex);
      var remain = (it.confirmed ? it.amount : 0) - used;
      var rate = (it.confirmed && it.amount) ? Math.round(used / it.amount * 100) : 0;
      var rateHtml = it.confirmed
        ? '<div class="bdg-bar"><span style="width:'+Math.min(rate,100)+'%" class="'+(rate>100?'over':'')+'"></span></div>'+rate+'%'
        : '<span class="bdg-muted">-</span>';
      rows += '<tr class="'+(it.confirmed?'bdg-confirmed':'')+'">' +
        '<td class="bdg-c-chk">'+(canConfirm?'<input type="checkbox" class="bdg-row-check" data-id="'+it.id+'">':'')+'</td>' +
        '<td class="bdg-c-code">'+esc(it.gwan)+(it.hang?'.'+esc((''+it.hang).split('.').slice(-1)[0]):'')+'</td>' +
        '<td class="bdg-c-name"><b>'+esc(it.name)+'</b>'+(it.calc?'<span class="bdg-calc">'+esc(it.calc)+'</span>':'')+'</td>' +
        '<td class="bdg-c-amt">'+won(it.amount)+'</td>' +
        '<td class="bdg-c-st">'+statusBadge(it)+'</td>' +
        '<td class="bdg-c-amt warn">'+won(used)+'</td>' +
        '<td class="bdg-c-amt '+(remain<0?'neg':'')+'">'+won(remain)+'</td>' +
        '<td class="bdg-c-rate">'+rateHtml+'</td>' +
        '<td class="bdg-c-act">' +
          (it.confirmed?'<button class="bdg-exec-btn" data-id="'+it.id+'">＋집행</button><button class="bdg-issue-btn" data-id="'+it.id+'">🔖번호</button>'
                       :'<button class="bdg-item-edit" data-id="'+it.id+'">수정</button><button class="bdg-item-del" data-id="'+it.id+'">삭제</button>') +
          '<button class="bdg-toggle-btn" data-id="'+it.id+'">'+(B.expanded[it.id]?'▾ 닫기':'▸ 세부')+'</button>' +
        '</td>' +
      '</tr>';
      if (B.expanded[it.id]) {
        rows += '<tr class="bdg-sub-row"><td colspan="'+COLS+'">'+execListHtml(it, ex)+'</td></tr>';
      }
    });
    return '<table class="bdg-table"><thead><tr>' +
      '<th></th><th>코드</th><th>항목(산출내역)</th><th>예산액</th><th>확정</th><th>집행누계</th><th>잔액</th><th>집행률</th><th>관리</th>' +
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
      if (ids.indexOf(it.id) >= 0) {
        it.confirmed = !!val; it.confirmedAt = val?when:''; it.confirmedBy = val?who:'';
        if (val) { it.submitted = false; it.rejectReason = ''; }   // 확정=승인 시 제출/반려 상태 정리
        n++;
      }
    });
    saveItems(arr);
    B.selected = {};
    toast(n + '개 항목을 ' + (val?'확정(승인)':'확정 해제') + '했습니다.');
    renderTab();
  }

  function submitItems(list) {
    var ids = list.filter(function(it){ return !it.confirmed; }).map(function(i){ return i.id; });
    if (!ids.length) { toast('제출할 초안(미확정) 항목이 없습니다.', 'error'); return; }
    if (!confirm(ids.length + '개 초안 항목을 제출(확정 요청)하시겠습니까?')) return;
    var arr = items(); var now = new Date().toISOString(), who = curEmail();
    arr.forEach(function(it){ if (ids.indexOf(it.id) >= 0 && !it.confirmed) { it.submitted = true; it.rejectReason = ''; it.submittedAt = now; it.submittedBy = who; } });
    saveItems(arr); toast(ids.length + '개 항목을 제출했습니다. 관리자 확정을 기다립니다.'); renderTab();
  }
  function rejectItems(ids) {
    if (!isBudgetAdmin()) { toast('반려 권한이 없습니다.', 'error'); return; }
    if (!ids.length) { toast('반려할 항목을 선택하세요.', 'error'); return; }
    var reason = prompt('반려 사유를 입력하세요(선택):', '') || '반려';
    var arr = items();
    arr.forEach(function(it){ if (ids.indexOf(it.id) >= 0) { it.confirmed = false; it.submitted = false; it.rejectReason = reason; } });
    saveItems(arr); B.selected = {};
    toast(ids.length + '개 항목을 반려했습니다.'); renderTab();
  }
  function statusBadge(it) {
    if (it.confirmed) return '<span class="bdg-badge ok">확정</span>';
    if (it.rejectReason) return '<span class="bdg-badge rej" title="'+esc(it.rejectReason)+'">반려</span>';
    if (it.submitted) return '<span class="bdg-badge sub">제출</span>';
    return '<span class="bdg-badge">작성중</span>';
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

  function openExecModal(itemId, editId) {
    var it = items().find(function(x){ return x.id === itemId; }); if (!it) return;
    if (!it.confirmed) { toast('확정된 예산만 집행 입력이 가능합니다.', 'error'); return; }
    var editRec = editId ? execs().find(function(e){ return e.id === editId; }) : null;
    var used = execTotalForItem(itemId) - (editRec ? (Number(editRec.amount)||0) : 0);
    var remain = it.amount - used;
    var v = editRec || {};
    var val = function(x){ return esc(x == null ? '' : x); };
    var body = '<div class="bdg-form">' +
      '<p class="bdg-muted">'+esc(it.dept)+' · '+esc(it.name)+' · 잔액 <b>'+won(remain)+'</b>원</p>' +
      '<label>집행일자</label><input id="bx-date" type="date" value="'+val(v.date || todayYMD())+'">' +
      '<label>문서번호 <span class="bdg-req">*</span></label><input id="bx-doc" value="'+val(v.docNo)+'" placeholder="예: 2026-기획-0001 (지출결의/공문 번호)">' +
      '<label>집행금액 <span class="bdg-req">*</span></label><input id="bx-amt" type="number" inputmode="numeric" value="'+val(v.amount)+'" placeholder="원">' +
      '<label>적요(집행내용) <span class="bdg-req">*</span></label><input id="bx-sum" value="'+val(v.summary)+'" placeholder="예: 1분기 교재 구입">' +
      '<label>거래처</label><input id="bx-payee" value="'+val(v.payee)+'" placeholder="예: ○○문구">' +
      '<label>비고</label><input id="bx-note" value="'+val(v.note)+'" placeholder="근거/메모">' +
      '<div class="bdg-form-actions"><button id="bx-save" class="btn btn-primary">'+(editRec?'수정 저장':'저장')+'</button><button id="bx-cancel" class="btn btn-secondary">취소</button></div>' +
      '</div>';
    showModal(editRec ? '집행내역 수정' : '집행내역 입력', body);
    document.getElementById('bx-cancel').addEventListener('click', closeModal);
    document.getElementById('bx-save').addEventListener('click', function(){
      var doc = document.getElementById('bx-doc').value.trim();
      var amt = Number(document.getElementById('bx-amt').value);
      var sum = document.getElementById('bx-sum').value.trim();
      if (!doc) { toast('문서번호를 입력하세요.', 'error'); return; }
      if (!amt || amt <= 0) { toast('집행금액을 입력하세요.', 'error'); return; }
      if (!sum) { toast('적요를 입력하세요.', 'error'); return; }
      var date = document.getElementById('bx-date').value || todayYMD();
      var payee = document.getElementById('bx-payee').value.trim();
      var note = document.getElementById('bx-note').value.trim();
      var arr = execs();
      if (editRec) {
        var r = arr.find(function(e){ return e.id === editId; });
        if (r) { r.date=date; r.docNo=doc; r.amount=amt; r.summary=sum; r.payee=payee; r.note=note; r.updatedAt=new Date().toISOString(); r.updatedBy=curEmail(); }
        saveExecs(arr); closeModal(); toast('집행내역을 수정했습니다.');
      } else {
        arr.push({
          id: uid(), year: B.year, type: it.type, itemId: itemId, dept: it.dept,
          date: date, docNo: doc, amount: amt, summary: sum, payee: payee, note: note,
          createdAt: new Date().toISOString(), createdBy: curEmail()
        });
        saveExecs(arr); closeModal(); toast('집행내역이 저장되었습니다.');
      }
      B.expanded[itemId] = true;   // 입력/수정 후 해당 항목 펼친 상태 유지
      renderTab();
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

  /* ── 공유 동기화 갱신 시 현재 보고 있으면 다시 그림 ── */
  try {
    window.addEventListener('cloudsync-updated', function () {
      var t = document.getElementById('tab-budget');
      if (t && !t.hidden && !document.getElementById('bdg-modal')) renderTab();
    });
  } catch (e) {}

  /* ── 공개 ── */
  return {
    init: function () { /* 데이터는 탭 진입 시 로드 */ },
    renderTab: renderTab,
  };
})();
window.BudgetModule = BudgetModule;
