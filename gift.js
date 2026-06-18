'use strict';
/**
 * gift.js — 기념품 관리 모듈 (소통·홍보 ▸ 기념품 관리)
 *  백엔드: Supabase (zbpeyklwpotjyveipzxd) + Edge Functions
 *  공개용 신청폼 (3단계) + 관리자 패널 (신청처리·재고·이력·마스터설정)
 */
window.GiftModule = (function () {

  var SUPABASE_URL = 'https://zbpeyklwpotjyveipzxd.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV5a2x3cG90anl2ZWlwenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTYxMDcsImV4cCI6MjA5NzA5MjEwN30.6JgoQ6rPRnmrbBTG68A-Y9HDQk40mnwubhXVnkZvHrQ';
  var FN_BASE = SUPABASE_URL + '/functions/v1';

  var _db = null, _session = null, _adminUser = null, _realtimeCh = null;
  var _st = { view: 'public', tab: 'requests', masterTab: 'items', step: 1, selectedItem: null, reqFilter: 'pending', histFilter: { from: '', to: '', purpose: '' } };

  var PURPOSE_OPTS = ['기업설명회','MOU체결','학교방문','홍보활동','순회지도','기업체방문','취업박람회','입학식','기타'];

  /* ─── 헬퍼 ─────────────────────────────────────────────── */
  function root() { return document.getElementById('gift-root'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function toast(m, t) { try { if (typeof window.aseaToast === 'function') window.aseaToast(m, t); else alert(m); } catch(e){} }
  function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDt(s) { if (!s) return ''; var d = new Date(s); return (d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes())); }
  function todayStr() { var d = new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function loading(msg) { if(root()) root().innerHTML = '<p style="padding:40px;text-align:center;color:#9ca3af">'+(msg||'불러오는 중…')+'</p>'; }

  function libReady() { return !!(window.supabase && window.supabase.createClient); }
  function ensureClient() {
    if (_db) return _db;
    if (!libReady()) return null;
    _db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    return _db;
  }

  /* ─── 진입점 ─────────────────────────────────────────────── */
  async function onTabOpen() {
    var r = root(); if (!r) return;
    if (!libReady()) {
      loading('Supabase 라이브러리 로딩 중…');
      setTimeout(function(){ if(libReady()) onTabOpen(); }, 600); return;
    }
    ensureClient();
    try {
      var { data: sd } = await _db.auth.getSession();
      _session = (sd && sd.session) ? sd.session : null;
    } catch(e) { _session = null; }

    if (_session) {
      var { data: au } = await _db.from('gift_admin_users').select('name,role,is_active').eq('id', _session.user.id).single();
      _adminUser = (au && au.is_active) ? au : null;
    } else {
      _adminUser = null;
    }

    if (_adminUser) {
      _st.view = 'admin';
      renderAdminPanel();
    } else {
      _st.view = 'public';
      renderPublic();
    }
  }

  /* ═══════════════════════════════════════════════════════════
     공개 신청 폼 (3단계)
     ═══════════════════════════════════════════════════════════ */
  async function renderPublic() {
    var r = root(); if (!r) return;
    r.innerHTML = '<p style="padding:40px;text-align:center;color:#9ca3af">품목 불러오는 중…</p>';

    var { data: items, error } = await _db.from('gift_items').select('*').eq('is_active', true).order('category').order('name');
    if (error) { r.innerHTML = '<p style="padding:32px;color:#dc2626">품목 조회 실패: '+esc(error.message)+'</p>'; return; }

    _st.step = 1; _st.selectedItem = null;
    renderStep1(items || []);
  }

  function renderStep1(items) {
    var r = root(); if (!r) return;
    var html = '<div class="gift-wrap">'+
      '<div class="gift-header"><h2 class="gift-title">🎁 기념품 신청</h2>'+
      '<button id="gift-admin-link" class="btn btn-ghost btn-sm" style="margin-left:auto">관리자 로그인</button></div>'+
      '<p class="gift-desc">아래 품목 중 원하시는 것을 선택하세요.</p>'+
      '<div class="gift-grid">';

    items.forEach(function(item) {
      var soldOut = item.stock_qty <= 0;
      var lowStock = !soldOut && item.stock_qty <= item.min_stock_alert;
      var stockLabel = soldOut ? '<span class="gift-badge gift-badge-red">품절</span>'
        : lowStock ? '<span class="gift-badge gift-badge-orange">잔여 '+item.stock_qty+'개</span>'
        : '<span class="gift-badge gift-badge-green">'+item.stock_qty+'개 이상</span>';
      html += '<div class="gift-card'+(soldOut?' gift-card-sold':'')+'" data-id="'+esc(item.id)+'" data-sold="'+(soldOut?1:0)+'" style="cursor:'+(soldOut?'not-allowed':'pointer')+'">'+
        '<div class="gift-card-cat">'+esc(item.category||'일반')+'</div>'+
        '<div class="gift-card-name">'+esc(item.name)+'</div>'+
        '<div class="gift-card-meta">'+stockLabel+
        (item.max_per_request ? ' <span style="font-size:11px;color:#6b7280">최대 '+item.max_per_request+'개</span>' : '')+
        '</div></div>';
    });

    html += '</div></div>';
    r.innerHTML = html;

    r.querySelectorAll('.gift-card:not(.gift-card-sold)').forEach(function(card) {
      card.addEventListener('click', function() {
        var id = card.dataset.id;
        _st.selectedItem = items.find(function(i){ return i.id === id; });
        if (!_st.selectedItem) return;
        renderStep2();
      });
    });
    document.getElementById('gift-admin-link').addEventListener('click', function(){ renderLogin(); });
  }

  function renderStep2() {
    var item = _st.selectedItem;
    var r = root(); if (!r) return;
    var maxQ = item.max_per_request || 10;
    var qOpts = '';
    for (var i = 1; i <= Math.min(maxQ, item.stock_qty); i++) qOpts += '<option value="'+i+'">'+i+'개</option>';
    var purposeOpts = PURPOSE_OPTS.map(function(p){ return '<option value="'+esc(p)+'">'+esc(p)+'</option>'; }).join('');

    r.innerHTML = '<div class="gift-wrap">'+
      '<div class="gift-header">'+
      '<button id="gift-back1" class="btn btn-ghost btn-sm">← 뒤로</button>'+
      '<h2 class="gift-title" style="margin:0 auto">기념품 신청</h2></div>'+
      '<div class="gift-selected-box">'+
      '<span class="gift-badge gift-badge-blue">'+esc(item.category||'일반')+'</span>'+
      '<strong style="font-size:16px;margin-left:8px">'+esc(item.name)+'</strong></div>'+
      '<div class="gift-form">'+
      '<label class="gift-label">수량 <span class="gift-req">*</span></label>'+
      '<select id="gift-qty" class="form-input">'+qOpts+'</select>'+
      '<label class="gift-label">소속기관 <span class="gift-req">*</span></label>'+
      '<input id="gift-org" type="text" class="form-input" placeholder="예: ○○고등학교">'+
      '<label class="gift-label">성명 <span class="gift-req">*</span></label>'+
      '<input id="gift-name" type="text" class="form-input" placeholder="홍길동">'+
      '<label class="gift-label">연락처</label>'+
      '<input id="gift-phone" type="tel" class="form-input" placeholder="010-0000-0000">'+
      '<label class="gift-label">방문 목적 <span class="gift-req">*</span></label>'+
      '<select id="gift-purpose" class="form-input"><option value="">선택하세요</option>'+purposeOpts+'</select>'+
      '</div>'+
      '<button id="gift-next2" class="btn btn-primary" style="width:100%;min-height:44px;margin-top:16px">다음 단계 →</button>'+
      '</div>';

    document.getElementById('gift-back1').addEventListener('click', function(){ renderPublic(); });
    document.getElementById('gift-next2').addEventListener('click', function(){
      var org = val('gift-org').trim(), name = val('gift-name').trim(), purpose = val('gift-purpose'), qty = parseInt(val('gift-qty'));
      if (!org) { toast('소속기관을 입력하세요.','error'); return; }
      if (!name) { toast('성명을 입력하세요.','error'); return; }
      if (!purpose) { toast('방문 목적을 선택하세요.','error'); return; }
      renderStep3({ org: org, name: name, phone: val('gift-phone').trim(), purpose: purpose, qty: qty });
    });
  }

  function renderStep3(info) {
    var item = _st.selectedItem;
    var r = root(); if (!r) return;
    r.innerHTML = '<div class="gift-wrap">'+
      '<div class="gift-header">'+
      '<button id="gift-back2" class="btn btn-ghost btn-sm">← 뒤로</button>'+
      '<h2 class="gift-title" style="margin:0 auto">신청 내용 확인</h2></div>'+
      '<table class="gift-confirm-table">'+
      '<tr><th>품목</th><td>'+esc(item.name)+'</td></tr>'+
      '<tr><th>수량</th><td>'+info.qty+'개</td></tr>'+
      '<tr><th>소속기관</th><td>'+esc(info.org)+'</td></tr>'+
      '<tr><th>성명</th><td>'+esc(info.name)+'</td></tr>'+
      (info.phone ? '<tr><th>연락처</th><td>'+esc(info.phone)+'</td></tr>' : '')+
      '<tr><th>방문 목적</th><td>'+esc(info.purpose)+'</td></tr>'+
      '</table>'+
      '<button id="gift-submit-btn" class="btn btn-primary" style="width:100%;min-height:48px;margin-top:16px;font-size:15px">📩 신청하기</button>'+
      '<p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:8px">담당자가 확인 후 연락드립니다.</p>'+
      '</div>';

    document.getElementById('gift-back2').addEventListener('click', function(){
      _st.selectedItem = item;
      renderStep2();
      setTimeout(function(){
        if(document.getElementById('gift-qty')) document.getElementById('gift-qty').value = info.qty;
        if(document.getElementById('gift-org')) document.getElementById('gift-org').value = info.org;
        if(document.getElementById('gift-name')) document.getElementById('gift-name').value = info.name;
        if(document.getElementById('gift-phone')) document.getElementById('gift-phone').value = info.phone;
        if(document.getElementById('gift-purpose')) document.getElementById('gift-purpose').value = info.purpose;
      }, 50);
    });

    document.getElementById('gift-submit-btn').addEventListener('click', async function(){
      var btn = this; btn.disabled = true; btn.textContent = '처리 중…';
      try {
        var res = await fetch(FN_BASE+'/gift-submit', {
          method:'POST',
          headers:{'Content-Type':'application/json', apikey: SUPABASE_KEY},
          body: JSON.stringify({ item_id: item.id, requester_name: info.name, requester_org: info.org, requester_phone: info.phone, purpose: info.purpose, qty: info.qty })
        });
        var json = await res.json();
        if (!json.success) { toast(json.error||'신청 실패','error'); btn.disabled=false; btn.textContent='📩 신청하기'; return; }
        renderDone(info, item);
      } catch(e) { toast('네트워크 오류: '+e.message,'error'); btn.disabled=false; btn.textContent='📩 신청하기'; }
    });
  }

  function renderDone(info, item) {
    var r = root(); if (!r) return;
    r.innerHTML = '<div class="gift-wrap" style="text-align:center;padding:40px 20px">'+
      '<div style="font-size:48px;margin-bottom:16px">✅</div>'+
      '<h2 style="font-size:20px;font-weight:700;color:#1a3a5c;margin-bottom:8px">신청이 접수되었습니다</h2>'+
      '<p style="color:#4b5563;margin-bottom:4px"><strong>'+esc(item.name)+'</strong> × '+info.qty+'개</p>'+
      '<p style="color:#6b7280;font-size:13px;margin-bottom:24px">담당자가 확인 후 기념품을 지급합니다.</p>'+
      '<button id="gift-again" class="btn btn-secondary">다른 품목 신청</button>'+
      '</div>';
    document.getElementById('gift-again').addEventListener('click', function(){ renderPublic(); });
  }

  /* ═══════════════════════════════════════════════════════════
     관리자 로그인
     ═══════════════════════════════════════════════════════════ */
  function renderLogin(msg) {
    var r = root(); if (!r) return;
    r.innerHTML = '<div class="gift-wrap" style="max-width:420px;margin:0 auto">'+
      '<div class="gift-header">'+
      '<button id="gift-login-back" class="btn btn-ghost btn-sm">← 신청 화면</button>'+
      '<h2 class="gift-title" style="margin:0 auto">관리자 로그인</h2></div>'+
      (msg ? '<p style="color:#dc2626;font-size:13px;margin-bottom:8px">'+esc(msg)+'</p>' : '')+
      '<label class="gift-label">이메일</label><input id="gift-li-email" type="email" class="form-input">'+
      '<label class="gift-label" style="margin-top:8px">비밀번호</label><input id="gift-li-pw" type="password" class="form-input">'+
      '<div id="gift-li-err" style="color:#dc2626;font-size:12px;min-height:16px;margin:4px 0"></div>'+
      '<button id="gift-li-btn" class="btn btn-primary" style="width:100%;min-height:44px;margin-top:8px">로그인</button>'+
      '</div>';

    document.getElementById('gift-login-back').addEventListener('click', function(){ renderPublic(); });
    document.getElementById('gift-li-btn').addEventListener('click', async function(){
      var btn = this, email = val('gift-li-email').trim(), pw = val('gift-li-pw');
      if (!email||!pw) { document.getElementById('gift-li-err').textContent='이메일과 비밀번호를 입력하세요.'; return; }
      btn.disabled=true; btn.textContent='로그인 중…';
      var res = await _db.auth.signInWithPassword({ email:email, password:pw });
      btn.disabled=false; btn.textContent='로그인';
      if (res.error) { document.getElementById('gift-li-err').textContent='로그인 실패: '+res.error.message; return; }
      _session = res.data.session;
      var { data: au } = await _db.from('gift_admin_users').select('name,role,is_active').eq('id',_session.user.id).single();
      _adminUser = (au && au.is_active) ? au : null;
      if (!_adminUser) { document.getElementById('gift-li-err').textContent='관리자 권한이 없습니다. 마스터 관리자에게 문의하세요.'; return; }
      _st.view = 'admin'; renderAdminPanel();
    });
  }

  /* ═══════════════════════════════════════════════════════════
     관리자 패널
     ═══════════════════════════════════════════════════════════ */
  function renderAdminPanel() {
    var r = root(); if (!r) return;
    var roleBadge = _adminUser.role === 'master'
      ? '<span style="background:#7c3aed;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px">마스터</span>'
      : '<span style="background:#1a3a5c;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px">관리자</span>';
    var tabs = [
      {id:'requests', label:'📋 신청 대기'},
      {id:'stock', label:'📦 재고 현황'},
      {id:'history', label:'📜 불출 이력'},
    ];
    if (_adminUser.role === 'master') tabs.push({id:'master', label:'⚙️ 마스터 설정'});

    var tabHtml = tabs.map(function(t){
      return '<button class="gift-tab-btn'+(t.id===_st.tab?' active':'')+'" data-gtab="'+t.id+'">'+t.label+'</button>';
    }).join('');

    r.innerHTML = '<div class="gift-wrap gift-admin-wrap">'+
      '<div class="gift-admin-header">'+
      '<button id="gift-admin-back" class="btn btn-ghost btn-sm">← 신청 화면</button>'+
      '<span style="margin-left:8px;font-weight:600">'+esc(_adminUser.name)+'</span> '+roleBadge+
      '<button id="gift-logout-btn" class="btn btn-ghost btn-sm" style="margin-left:auto">로그아웃</button>'+
      '</div>'+
      '<div class="gift-tab-bar">'+tabHtml+'</div>'+
      '<div id="gift-tab-body"></div>'+
      '</div>';

    document.getElementById('gift-admin-back').addEventListener('click', function(){ stopRealtime(); _adminUser=null; _session=null; renderPublic(); });
    document.getElementById('gift-logout-btn').addEventListener('click', async function(){
      await _db.auth.signOut(); stopRealtime(); _session=null; _adminUser=null; renderPublic();
    });
    r.querySelectorAll('.gift-tab-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        _st.tab = btn.dataset.gtab;
        r.querySelectorAll('.gift-tab-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.gtab===_st.tab); });
        renderTabBody();
      });
    });
    renderTabBody();
    startRealtime();
  }

  function renderTabBody() {
    if (_st.tab === 'requests') renderRequests();
    else if (_st.tab === 'stock') renderStock();
    else if (_st.tab === 'history') renderHistory();
    else if (_st.tab === 'master') renderMaster();
  }

  /* ─── 실시간 구독 ─────────────────────────────────────────── */
  function startRealtime() {
    stopRealtime();
    _realtimeCh = _db.channel('gift-admin-rt')
      .on('postgres_changes', { event:'*', schema:'public', table:'gift_requests' }, function(){ if(_st.tab==='requests') renderRequests(); })
      .on('postgres_changes', { event:'*', schema:'public', table:'gift_items' }, function(){ if(_st.tab==='stock') renderStock(); })
      .subscribe();
  }
  function stopRealtime() {
    if (_realtimeCh) { try { _db.removeChannel(_realtimeCh); } catch(e){} _realtimeCh=null; }
  }

  /* ─── 신청 대기 목록 ─────────────────────────────────────── */
  async function renderRequests() {
    var body = document.getElementById('gift-tab-body'); if (!body) return;
    body.innerHTML = '<p style="padding:20px;color:#9ca3af">불러오는 중…</p>';

    var filterBtns = '<div style="display:flex;gap:6px;margin-bottom:12px">'+
      ['all','pending','done'].map(function(f){ var label={all:'전체',pending:'대기중',done:'처리완료'}[f]; return '<button class="btn btn-sm'+(f===_st.reqFilter?' btn-primary':' btn-secondary')+'" data-rf="'+f+'">'+label+'</button>'; }).join('')+
      '</div>';

    var q = _db.from('gift_requests').select('*, gift_items(name)').order('created_at', {ascending:false});
    if (_st.reqFilter === 'pending') q = q.eq('status','pending');
    else if (_st.reqFilter === 'done') q = q.neq('status','pending');
    var { data: rows, error } = await q;
    if (error) { body.innerHTML = filterBtns+'<p style="color:#dc2626">오류: '+esc(error.message)+'</p>'; _attachReqFilters(body); return; }

    var STATUS_BADGE = {
      pending:    '<span style="background:#fbbf24;color:#78350f;padding:2px 7px;border-radius:8px;font-size:11px">대기</span>',
      approved:   '<span style="background:#22c55e;color:#fff;padding:2px 7px;border-radius:8px;font-size:11px">승인</span>',
      rejected:   '<span style="background:#ef4444;color:#fff;padding:2px 7px;border-radius:8px;font-size:11px">반려</span>',
      dispatched: '<span style="background:#3b82f6;color:#fff;padding:2px 7px;border-radius:8px;font-size:11px">불출완료</span>'
    };

    var rows2 = rows || [];
    var tableRows = rows2.map(function(row){
      var isPending = row.status === 'pending';
      var actionBtns = isPending
        ? '<button class="btn btn-sm btn-primary gift-approve-btn" data-id="'+row.id+'" style="min-height:32px">승인</button> '+
          '<button class="btn btn-sm btn-secondary gift-reject-btn" data-id="'+row.id+'" style="min-height:32px">반려</button>'
        : (row.reject_reason ? '<span style="font-size:11px;color:#6b7280">사유: '+esc(row.reject_reason)+'</span>' : '-');
      return '<tr>'+
        '<td style="font-size:11px;white-space:nowrap">'+esc(fmtDt(row.created_at))+'</td>'+
        '<td><strong>'+esc(row.gift_items ? row.gift_items.name : '?')+'</strong></td>'+
        '<td style="text-align:center">'+row.qty+'개</td>'+
        '<td>'+esc(row.requester_name)+'</td>'+
        '<td>'+esc(row.requester_org)+'</td>'+
        '<td>'+esc(row.purpose)+'</td>'+
        '<td>'+( STATUS_BADGE[row.status] || row.status )+'</td>'+
        '<td style="white-space:nowrap">'+actionBtns+'</td>'+
        '</tr>';
    }).join('');

    var html = filterBtns+
      (rows2.length === 0 ? '<p style="padding:24px;text-align:center;color:#9ca3af">신청 내역이 없습니다.</p>'
        : '<div class="scroll-x"><table class="gift-table">'+
          '<thead><tr><th>접수시각</th><th>품목</th><th>수량</th><th>신청자</th><th>소속</th><th>목적</th><th>상태</th><th>처리</th></tr></thead>'+
          '<tbody>'+tableRows+'</tbody></table></div>');
    body.innerHTML = html;
    _attachReqFilters(body);

    body.querySelectorAll('.gift-approve-btn').forEach(function(btn){
      btn.addEventListener('click', async function(){
        var id = btn.dataset.id;
        btn.disabled=true;
        var res = await _callFn('gift-approve', { request_id: id, action: 'approve' });
        if (!res.success) {
          if (res._status === 409) toast('이미 처리된 신청입니다.','info');
          else toast(res.error||'오류','error');
        } else { toast('승인 처리되었습니다.','success'); }
        renderRequests();
      });
    });
    body.querySelectorAll('.gift-reject-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = btn.dataset.id;
        showRejectModal(id);
      });
    });
  }

  function _attachReqFilters(body) {
    body.querySelectorAll('[data-rf]').forEach(function(b){
      b.addEventListener('click', function(){ _st.reqFilter = b.dataset.rf; renderRequests(); });
    });
  }

  function showRejectModal(requestId) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = '<div style="background:#fff;border-radius:12px;padding:24px;width:340px;max-width:95vw">'+
      '<h3 style="font-size:15px;font-weight:700;margin:0 0 12px">반려 사유 입력</h3>'+
      '<textarea id="gift-reject-reason" class="form-input" rows="3" placeholder="반려 사유를 입력하세요 (선택)"></textarea>'+
      '<div style="display:flex;gap:8px;margin-top:12px">'+
      '<button id="gift-reject-confirm" class="btn btn-primary" style="flex:1;min-height:40px">반려 처리</button>'+
      '<button id="gift-reject-cancel" class="btn btn-secondary" style="flex:1;min-height:40px">취소</button>'+
      '</div></div>';
    document.body.appendChild(overlay);
    document.getElementById('gift-reject-cancel').addEventListener('click', function(){ document.body.removeChild(overlay); });
    document.getElementById('gift-reject-confirm').addEventListener('click', async function(){
      var btn = this; btn.disabled=true;
      var reason = (document.getElementById('gift-reject-reason')||{}).value || '';
      var res = await _callFn('gift-approve', { request_id: requestId, action: 'reject', reject_reason: reason });
      document.body.removeChild(overlay);
      if (!res.success) {
        if (res._status === 409) toast('이미 처리된 신청입니다.','info');
        else toast(res.error||'오류','error');
      } else { toast('반려 처리되었습니다.','success'); }
      renderRequests();
    });
  }

  /* ─── 재고 현황판 ─────────────────────────────────────────── */
  async function renderStock() {
    var body = document.getElementById('gift-tab-body'); if (!body) return;
    body.innerHTML = '<p style="padding:20px;color:#9ca3af">불러오는 중…</p>';
    var { data: items, error } = await _db.from('gift_items').select('*').order('is_active',{ascending:false}).order('stock_qty');
    if (error) { body.innerHTML = '<p style="color:#dc2626">오류: '+esc(error.message)+'</p>'; return; }
    var rows = items || [];
    var html = '<div class="gift-stock-grid">';
    rows.forEach(function(item){
      var pct = item.min_stock_alert > 0 ? Math.min(100, Math.round(item.stock_qty / (item.min_stock_alert * 3) * 100)) : (item.stock_qty > 0 ? 60 : 0);
      var low = item.stock_qty <= item.min_stock_alert;
      var soldOut = item.stock_qty <= 0;
      html += '<div class="gift-stock-card'+(low?' gift-stock-low':'')+'" data-sid="'+esc(item.id)+'">'+
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'+
        '<span style="font-size:12px;color:#6b7280">'+esc(item.category||'')+'</span>'+
        (soldOut ? '<span class="gift-badge gift-badge-red">품절</span>' : low ? '<span class="gift-badge gift-badge-orange">⚠ 임박</span>' : '')+
        '</div>'+
        '<div style="font-weight:700;font-size:15px;margin-bottom:8px">'+esc(item.name)+'</div>'+
        '<div class="gift-stock-bar-wrap"><div class="gift-stock-bar" style="width:'+pct+'%;background:'+(soldOut?'#ef4444':low?'#f97316':'#22c55e')+'"></div></div>'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">'+
        '<span style="font-size:20px;font-weight:700;color:'+(soldOut?'#ef4444':low?'#f97316':'#1a3a5c')+'">'+item.stock_qty+'개</span>'+
        '<button class="btn btn-sm btn-secondary gift-stock-add-btn" data-sid="'+esc(item.id)+'" data-sname="'+esc(item.name)+'" data-sqty="'+item.stock_qty+'">+ 입고</button>'+
        '</div></div>';
    });
    html += '</div>';
    body.innerHTML = html;
    body.querySelectorAll('.gift-stock-add-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ showStockModal(btn.dataset.sid, btn.dataset.sname, parseInt(btn.dataset.sqty)); });
    });
  }

  function showStockModal(itemId, itemName, curQty) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = '<div style="background:#fff;border-radius:12px;padding:24px;width:320px;max-width:95vw">'+
      '<h3 style="font-size:15px;font-weight:700;margin:0 0 4px">입고 처리</h3>'+
      '<p style="font-size:13px;color:#6b7280;margin:0 0 12px">'+esc(itemName)+' (현재: '+curQty+'개)</p>'+
      '<label style="font-size:13px;font-weight:600">추가 입고 수량</label>'+
      '<input id="gift-stock-add-qty" type="number" min="1" class="form-input" style="margin-top:4px" value="1">'+
      '<div style="display:flex;gap:8px;margin-top:12px">'+
      '<button id="gift-stock-confirm" class="btn btn-primary" style="flex:1;min-height:40px">입고 처리</button>'+
      '<button id="gift-stock-cancel" class="btn btn-secondary" style="flex:1;min-height:40px">취소</button>'+
      '</div></div>';
    document.body.appendChild(overlay);
    document.getElementById('gift-stock-cancel').addEventListener('click', function(){ document.body.removeChild(overlay); });
    document.getElementById('gift-stock-confirm').addEventListener('click', async function(){
      var btn=this; btn.disabled=true;
      var addQty = parseInt((document.getElementById('gift-stock-add-qty')||{}).value||0);
      if (addQty < 1) { toast('1 이상 입력하세요.','error'); btn.disabled=false; return; }
      var { error } = await _db.from('gift_items').update({ stock_qty: curQty+addQty, updated_at: new Date().toISOString() }).eq('id',itemId);
      document.body.removeChild(overlay);
      if (error) { toast('오류: '+error.message,'error'); } else { toast('입고 처리되었습니다.','success'); }
      renderStock();
    });
  }

  /* ─── 불출 이력 ─────────────────────────────────────────── */
  async function renderHistory() {
    var body = document.getElementById('gift-tab-body'); if (!body) return;
    if (!_st.histFilter.from) { _st.histFilter.from = todayStr().slice(0,7)+'-01'; _st.histFilter.to = todayStr(); }

    var filterHtml = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;align-items:flex-end">'+
      '<div><label style="font-size:12px;display:block;margin-bottom:2px">시작일</label><input id="gift-hist-from" type="date" class="form-input" style="width:140px" value="'+esc(_st.histFilter.from)+'"></div>'+
      '<div><label style="font-size:12px;display:block;margin-bottom:2px">종료일</label><input id="gift-hist-to" type="date" class="form-input" style="width:140px" value="'+esc(_st.histFilter.to)+'"></div>'+
      '<div><label style="font-size:12px;display:block;margin-bottom:2px">방문 목적</label><select id="gift-hist-purpose" class="form-input" style="width:130px"><option value="">전체</option>'+
      PURPOSE_OPTS.map(function(p){ return '<option value="'+esc(p)+'"'+(p===_st.histFilter.purpose?' selected':'')+'>'+esc(p)+'</option>'; }).join('')+
      '</select></div>'+
      '<button id="gift-hist-search" class="btn btn-primary btn-sm" style="min-height:38px">🔍 조회</button>'+
      '<button id="gift-hist-export" class="btn btn-secondary btn-sm" style="min-height:38px">📊 엑셀</button>'+
      '</div>';

    body.innerHTML = filterHtml+'<p style="color:#9ca3af;padding:16px">불러오는 중…</p>';

    var q = _db.from('gift_dispatch_log')
      .select('*, gift_requests(requester_name, requester_org, purpose, qty, gift_items(name)), gift_admin_users(name)')
      .order('dispatched_at', {ascending:false});
    if (_st.histFilter.from) q = q.gte('dispatched_at', _st.histFilter.from+'T00:00:00');
    if (_st.histFilter.to) q = q.lte('dispatched_at', _st.histFilter.to+'T23:59:59');
    var { data: rows, error } = await q;
    if (error) { body.innerHTML = filterHtml+'<p style="color:#dc2626">오류: '+esc(error.message)+'</p>'; _attachHistEvents(body); return; }

    var filtered = (rows||[]).filter(function(row){
      if (!_st.histFilter.purpose) return true;
      return row.gift_requests && row.gift_requests.purpose === _st.histFilter.purpose;
    });

    var tableHtml = filtered.length === 0
      ? '<p style="padding:24px;text-align:center;color:#9ca3af">불출 이력이 없습니다.</p>'
      : '<div class="scroll-x"><table class="gift-table"><thead><tr>'+
        '<th>불출일시</th><th>품목</th><th>수량</th><th>신청자</th><th>소속</th><th>목적</th><th>처리자</th></tr></thead><tbody>'+
        filtered.map(function(row){
          var req = row.gift_requests || {};
          return '<tr>'+
            '<td style="font-size:11px;white-space:nowrap">'+esc(fmtDt(row.dispatched_at))+'</td>'+
            '<td>'+esc(req.gift_items ? req.gift_items.name : '?')+'</td>'+
            '<td style="text-align:center">'+row.qty_dispatched+'개</td>'+
            '<td>'+esc(req.requester_name||'')+'</td>'+
            '<td>'+esc(req.requester_org||'')+'</td>'+
            '<td>'+esc(req.purpose||'')+'</td>'+
            '<td>'+esc(row.gift_admin_users ? row.gift_admin_users.name : '?')+'</td>'+
            '</tr>';
        }).join('')+'</tbody></table></div>';

    body.innerHTML = filterHtml + tableHtml;
    _attachHistEvents(body, filtered);
  }

  function _attachHistEvents(body, filtered) {
    var sFr = body.querySelector('#gift-hist-from'), sTo = body.querySelector('#gift-hist-to'), sPurp = body.querySelector('#gift-hist-purpose');
    var search = body.querySelector('#gift-hist-search'), exp = body.querySelector('#gift-hist-export');
    if (search) search.addEventListener('click', function(){
      if (sFr) _st.histFilter.from = sFr.value;
      if (sTo) _st.histFilter.to = sTo.value;
      if (sPurp) _st.histFilter.purpose = sPurp.value;
      renderHistory();
    });
    if (exp) exp.addEventListener('click', function(){ exportHistoryXlsx(filtered||[]); });
  }

  function exportHistoryXlsx(rows) {
    if (!window.XLSX) { toast('엑셀 모듈이 로드되지 않았습니다.','error'); return; }
    var aoa = [['불출일시','품목','수량','신청자','소속','방문목적','처리자']];
    rows.forEach(function(row){
      var req = row.gift_requests||{};
      aoa.push([fmtDt(row.dispatched_at), req.gift_items?req.gift_items.name:'', row.qty_dispatched, req.requester_name||'', req.requester_org||'', req.purpose||'', row.gift_admin_users?row.gift_admin_users.name:'']);
    });
    var d = new Date(); var ym = d.getFullYear()+''+pad(d.getMonth()+1);
    var wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(aoa), '불출이력');
    window.XLSX.writeFile(wb, '기념품불출이력_'+ym+'.xlsx');
  }

  /* ─── 마스터 전용 패널 ─────────────────────────────────── */
  function renderMaster() {
    var body = document.getElementById('gift-tab-body'); if (!body) return;
    var mTabs = ['items','accounts','qr','telegram'];
    var mLabels = {items:'📦 물품 관리', accounts:'👤 계정 관리', qr:'📱 QR 코드', telegram:'💬 텔레그램'};
    var tabHtml = mTabs.map(function(t){ return '<button class="gift-tab-btn gift-tab-sm'+(t===_st.masterTab?' active':'')+'" data-mt="'+t+'">'+mLabels[t]+'</button>'; }).join('');
    body.innerHTML = '<div class="gift-tab-bar gift-subtab-bar">'+tabHtml+'</div><div id="gift-master-body"></div>';
    body.querySelectorAll('[data-mt]').forEach(function(b){
      b.addEventListener('click', function(){
        _st.masterTab=b.dataset.mt;
        body.querySelectorAll('[data-mt]').forEach(function(x){ x.classList.toggle('active',x.dataset.mt===_st.masterTab); });
        renderMasterTab();
      });
    });
    renderMasterTab();
  }

  function renderMasterTab() {
    if (_st.masterTab==='items') renderMasterItems();
    else if (_st.masterTab==='accounts') renderMasterAccounts();
    else if (_st.masterTab==='qr') renderMasterQR();
    else if (_st.masterTab==='telegram') renderMasterTelegram();
  }

  /* ── 물품 관리 ── */
  async function renderMasterItems() {
    var mb = document.getElementById('gift-master-body'); if (!mb) return;
    mb.innerHTML = '<p style="padding:16px;color:#9ca3af">불러오는 중…</p>';
    var { data: items } = await _db.from('gift_items').select('*').order('category').order('name');
    var rows = items||[];
    var html = '<div style="display:flex;justify-content:flex-end;margin-bottom:10px">'+
      '<button id="gift-item-add-btn" class="btn btn-primary btn-sm">+ 물품 추가</button></div>'+
      '<div class="scroll-x"><table class="gift-table"><thead><tr><th>이름</th><th>카테고리</th><th>재고</th><th>알림기준</th><th>최대신청</th><th>상태</th><th>관리</th></tr></thead><tbody>'+
      rows.map(function(item){ return '<tr>'+
        '<td><strong>'+esc(item.name)+'</strong></td>'+
        '<td>'+esc(item.category||'')+'</td>'+
        '<td style="text-align:center">'+item.stock_qty+'</td>'+
        '<td style="text-align:center">'+item.min_stock_alert+'</td>'+
        '<td style="text-align:center">'+item.max_per_request+'</td>'+
        '<td>'+(item.is_active?'<span style="color:#22c55e">활성</span>':'<span style="color:#9ca3af">비활성</span>')+'</td>'+
        '<td style="white-space:nowrap">'+
        '<button class="btn btn-sm btn-secondary gift-item-edit" data-iid="'+esc(item.id)+'">수정</button> '+
        '<button class="btn btn-sm btn-ghost gift-item-toggle" data-iid="'+esc(item.id)+'" data-ival="'+(item.is_active?0:1)+'">'+(item.is_active?'비활성화':'활성화')+'</button>'+
        '</td></tr>'; }).join('')+
      '</tbody></table></div>';
    mb.innerHTML = html;
    mb.querySelector('#gift-item-add-btn').addEventListener('click', function(){ showItemModal(null); });
    mb.querySelectorAll('.gift-item-edit').forEach(function(b){ b.addEventListener('click', function(){ var it=rows.find(function(x){return x.id===b.dataset.iid;}); if(it) showItemModal(it); }); });
    mb.querySelectorAll('.gift-item-toggle').forEach(function(b){
      b.addEventListener('click', async function(){
        var active = b.dataset.ival === '1';
        await _db.from('gift_items').update({is_active:active, updated_at:new Date().toISOString()}).eq('id',b.dataset.iid);
        toast((active?'활성화':'비활성화')+'되었습니다.','success'); renderMasterItems();
      });
    });
  }

  function showItemModal(item) {
    var isNew = !item;
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:20px';
    overlay.innerHTML = '<div style="background:#fff;border-radius:12px;padding:24px;width:400px;max-width:95vw">'+
      '<h3 style="font-size:15px;font-weight:700;margin:0 0 12px">'+(isNew?'물품 추가':'물품 수정')+'</h3>'+
      '<label class="gift-label">이름 *</label><input id="gim-name" class="form-input" value="'+esc(item?item.name:'')+'">'+
      '<label class="gift-label" style="margin-top:8px">카테고리</label><input id="gim-cat" class="form-input" value="'+esc(item?item.category:'')+'">'+
      '<label class="gift-label" style="margin-top:8px">초기 재고 / 현재 재고</label><input id="gim-qty" type="number" min="0" class="form-input" value="'+(item?item.stock_qty:0)+'">'+
      '<label class="gift-label" style="margin-top:8px">재고 알림 기준</label><input id="gim-min" type="number" min="0" class="form-input" value="'+(item?item.min_stock_alert:10)+'">'+
      '<label class="gift-label" style="margin-top:8px">최대 신청 수량</label><input id="gim-max" type="number" min="1" class="form-input" value="'+(item?item.max_per_request:3)+'">'+
      '<label class="gift-label" style="margin-top:8px">보관 위치</label><input id="gim-loc" class="form-input" value="'+esc(item?item.storage_location:'4층 기자재실')+'">'+
      '<div style="display:flex;gap:8px;margin-top:16px">'+
      '<button id="gim-save" class="btn btn-primary" style="flex:1;min-height:40px">'+(isNew?'추가':'저장')+'</button>'+
      '<button id="gim-cancel" class="btn btn-secondary" style="flex:1;min-height:40px">취소</button>'+
      '</div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#gim-cancel').addEventListener('click', function(){ document.body.removeChild(overlay); });
    overlay.querySelector('#gim-save').addEventListener('click', async function(){
      var btn=this; btn.disabled=true;
      var name = overlay.querySelector('#gim-name').value.trim();
      if (!name) { toast('이름을 입력하세요.','error'); btn.disabled=false; return; }
      var data = { name:name, category:overlay.querySelector('#gim-cat').value.trim(), stock_qty:parseInt(overlay.querySelector('#gim-qty').value)||0, min_stock_alert:parseInt(overlay.querySelector('#gim-min').value)||10, max_per_request:parseInt(overlay.querySelector('#gim-max').value)||3, storage_location:overlay.querySelector('#gim-loc').value.trim()||'4층 기자재실', updated_at:new Date().toISOString() };
      var err;
      if (isNew) { var r = await _db.from('gift_items').insert(data); err = r.error; }
      else { var r = await _db.from('gift_items').update(data).eq('id',item.id); err = r.error; }
      document.body.removeChild(overlay);
      if (err) toast('오류: '+err.message,'error'); else toast((isNew?'추가':'수정')+'되었습니다.','success');
      renderMasterItems();
    });
  }

  /* ── 계정 관리 ── */
  async function renderMasterAccounts() {
    var mb = document.getElementById('gift-master-body'); if (!mb) return;
    mb.innerHTML = '<p style="padding:16px;color:#9ca3af">불러오는 중…</p>';
    var { data: accs } = await _db.from('gift_admin_users').select('*, auth_user:id(email)').order('created_at');
    var rows = accs||[];
    var html = '<div style="display:flex;justify-content:flex-end;margin-bottom:10px">'+
      '<button id="gift-acc-add" class="btn btn-primary btn-sm">+ 관리자 추가</button></div>'+
      '<div class="scroll-x"><table class="gift-table"><thead><tr><th>이름</th><th>부서</th><th>역할</th><th>상태</th><th>등록일</th><th>관리</th></tr></thead><tbody>'+
      rows.map(function(acc){ var isSelf = _session && acc.id === _session.user.id; return '<tr>'+
        '<td><strong>'+esc(acc.name)+'</strong>'+(isSelf?' <span style="font-size:10px;color:#6b7280">(나)</span>':'')+'</td>'+
        '<td>'+esc(acc.department||'')+'</td>'+
        '<td><span style="background:'+(acc.role==='master'?'#7c3aed':'#1a3a5c')+';color:#fff;padding:2px 7px;border-radius:8px;font-size:11px">'+acc.role+'</span></td>'+
        '<td>'+(acc.is_active?'<span style="color:#22c55e">활성</span>':'<span style="color:#9ca3af">비활성</span>')+'</td>'+
        '<td style="font-size:11px">'+esc(fmtDt(acc.created_at).slice(0,10))+'</td>'+
        '<td style="white-space:nowrap">'+
        (isSelf?'-':
          '<button class="btn btn-sm btn-secondary gift-acc-role" data-aid="'+esc(acc.id)+'" data-arole="'+(acc.role==='master'?'admin':'master')+'">'+(acc.role==='master'?'→admin':'→master')+'</button> '+
          '<button class="btn btn-sm btn-ghost gift-acc-toggle" data-aid="'+esc(acc.id)+'" data-aval="'+(acc.is_active?0:1)+'">'+(acc.is_active?'비활성화':'활성화')+'</button>')+
        '</td></tr>'; }).join('')+
      '</tbody></table></div>';
    mb.innerHTML = html;
    mb.querySelector('#gift-acc-add').addEventListener('click', function(){ showCreateAdminModal(); });
    mb.querySelectorAll('.gift-acc-role').forEach(function(b){ b.addEventListener('click', async function(){
      await _db.from('gift_admin_users').update({role:b.dataset.arole}).eq('id',b.dataset.aid);
      toast('역할이 변경되었습니다.','success'); renderMasterAccounts();
    }); });
    mb.querySelectorAll('.gift-acc-toggle').forEach(function(b){ b.addEventListener('click', async function(){
      var active = b.dataset.aval==='1';
      await _db.from('gift_admin_users').update({is_active:active}).eq('id',b.dataset.aid);
      toast((active?'활성화':'비활성화')+'되었습니다.','success'); renderMasterAccounts();
    }); });
  }

  function showCreateAdminModal() {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:20px';
    overlay.innerHTML = '<div style="background:#fff;border-radius:12px;padding:24px;width:380px;max-width:95vw">'+
      '<h3 style="font-size:15px;font-weight:700;margin:0 0 12px">관리자 계정 추가</h3>'+
      '<label class="gift-label">이름 *</label><input id="gcam-name" class="form-input">'+
      '<label class="gift-label" style="margin-top:8px">이메일 *</label><input id="gcam-email" type="email" class="form-input">'+
      '<label class="gift-label" style="margin-top:8px">임시 비밀번호 *</label><input id="gcam-pw" type="password" class="form-input">'+
      '<label class="gift-label" style="margin-top:8px">부서</label><input id="gcam-dept" class="form-input">'+
      '<label class="gift-label" style="margin-top:8px">역할</label><select id="gcam-role" class="form-input"><option value="admin">admin</option><option value="master">master</option></select>'+
      '<div id="gcam-err" style="color:#dc2626;font-size:12px;min-height:16px;margin-top:6px"></div>'+
      '<div style="display:flex;gap:8px;margin-top:12px">'+
      '<button id="gcam-save" class="btn btn-primary" style="flex:1;min-height:40px">추가</button>'+
      '<button id="gcam-cancel" class="btn btn-secondary" style="flex:1;min-height:40px">취소</button>'+
      '</div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#gcam-cancel').addEventListener('click', function(){ document.body.removeChild(overlay); });
    overlay.querySelector('#gcam-save').addEventListener('click', async function(){
      var btn=this; btn.disabled=true;
      var name=overlay.querySelector('#gcam-name').value.trim(), email=overlay.querySelector('#gcam-email').value.trim(), pw=overlay.querySelector('#gcam-pw').value, dept=overlay.querySelector('#gcam-dept').value.trim(), role=overlay.querySelector('#gcam-role').value;
      if (!name||!email||pw.length<6) { overlay.querySelector('#gcam-err').textContent='이름, 이메일, 비밀번호(6자이상)를 입력하세요.'; btn.disabled=false; return; }
      var res = await _callFn('gift-create-admin', { name:name, email:email, password:pw, department:dept, role:role });
      document.body.removeChild(overlay);
      if (!res.success) toast('오류: '+(res.error||''),'error');
      else toast('관리자 계정이 추가되었습니다.','success');
      renderMasterAccounts();
    });
  }

  /* ── QR 코드 ── */
  async function renderMasterQR() {
    var mb = document.getElementById('gift-master-body'); if (!mb) return;
    var appUrl = window.location.origin + window.location.pathname;
    var { data: items } = await _db.from('gift_items').select('id,name,category').eq('is_active',true).order('name');
    var rows = items||[];

    var html = '<div style="padding:8px 0">'+
      '<h3 style="font-size:14px;font-weight:700;margin:0 0 4px">📱 전체 신청 페이지 QR</h3>'+
      '<p style="font-size:12px;color:#6b7280;margin:0 0 8px">'+esc(appUrl)+'#gift</p>'+
      '<canvas id="gift-qr-main" style="border:1px solid #e5e7eb;border-radius:8px"></canvas>'+
      '<div style="margin-top:8px"><button id="gift-qr-print-main" class="btn btn-secondary btn-sm">🖨 인쇄</button></div>'+
      '<hr style="margin:16px 0">'+
      '<h3 style="font-size:14px;font-weight:700;margin:0 0 8px">품목별 QR</h3>'+
      '<div class="gift-qr-grid">'+
      rows.map(function(item){ return '<div style="text-align:center;padding:12px;background:#f9fafb;border-radius:8px">'+
        '<div style="font-size:12px;color:#6b7280">'+esc(item.category||'')+'</div>'+
        '<div style="font-weight:700;font-size:13px;margin-bottom:6px">'+esc(item.name)+'</div>'+
        '<canvas id="gift-qr-'+esc(item.id)+'" style="border:1px solid #e5e7eb;border-radius:4px"></canvas>'+
        '<div style="margin-top:6px"><button class="btn btn-ghost btn-sm gift-qr-print-item" data-name="'+esc(item.name)+'" data-canvas="gift-qr-'+esc(item.id)+'">🖨 인쇄</button></div>'+
        '</div>'; }).join('')+
      '</div></div>';
    mb.innerHTML = html;

    // QR 렌더링
    if (window.QRCode) {
      var mainCanvas = document.getElementById('gift-qr-main');
      if (mainCanvas) window.QRCode.toCanvas(mainCanvas, appUrl+'#gift', { width:200, margin:1 }, function(){});
      rows.forEach(function(item){
        var c = document.getElementById('gift-qr-'+item.id);
        if (c) window.QRCode.toCanvas(c, appUrl+'?gift_item='+item.id, { width:150, margin:1 }, function(){});
      });
    } else {
      mb.querySelectorAll('canvas').forEach(function(c){ c.insertAdjacentHTML('afterend','<p style="font-size:11px;color:#ef4444">QR 라이브러리 로딩 중…</p>'); });
    }

    document.getElementById('gift-qr-print-main').addEventListener('click', function(){
      _printQR(document.getElementById('gift-qr-main'), '아세아항공직업전문학교 기념품 신청', '');
    });
    mb.querySelectorAll('.gift-qr-print-item').forEach(function(b){
      b.addEventListener('click', function(){
        _printQR(document.getElementById(b.dataset.canvas), '기념품 신청', b.dataset.name);
      });
    });
  }

  function _printQR(canvas, title, subtitle) {
    if (!canvas) { toast('QR 캔버스를 찾을 수 없습니다.','error'); return; }
    var dataUrl = canvas.toDataURL('image/png');
    var win = window.open('','_blank');
    win.document.write('<html><head><title>QR 인쇄</title><style>body{font-family:sans-serif;text-align:center;padding:40px}img{display:block;margin:0 auto 12px}h2{font-size:18px;margin-bottom:4px}p{font-size:14px;color:#666}@media print{button{display:none}}</style></head><body>'+
      '<h2>'+esc(title)+'</h2>'+(subtitle?'<p>'+esc(subtitle)+'</p>':'')+
      '<img src="'+dataUrl+'" width="200">'+
      '<p style="font-size:12px;margin-top:12px">아세아항공직업전문학교</p>'+
      '<button onclick="window.print()" style="margin-top:16px;padding:8px 20px;font-size:14px;cursor:pointer">인쇄</button>'+
      '</body></html>');
    win.document.close();
  }

  /* ── 텔레그램 설정 ── */
  async function renderMasterTelegram() {
    var mb = document.getElementById('gift-master-body'); if (!mb) return;
    mb.innerHTML = '<p style="padding:16px;color:#9ca3af">불러오는 중…</p>';
    var { data: cfgs } = await _db.from('gift_system_config').select('key,value');
    var cfg = {}; (cfgs||[]).forEach(function(c){ cfg[c.key]=c.value; });
    mb.innerHTML = '<div style="max-width:500px">'+
      '<h3 style="font-size:14px;font-weight:700;margin:0 0 12px">텔레그램 봇 알림 설정</h3>'+
      '<label class="gift-label">Bot Token</label>'+
      '<input id="tg-token" type="password" class="form-input" value="'+esc(cfg.telegram_bot_token||'')+'">'+
      '<label class="gift-label" style="margin-top:8px">Chat ID</label>'+
      '<input id="tg-chat" class="form-input" value="'+esc(cfg.telegram_chat_id||'')+'">'+
      '<div style="display:flex;align-items:center;gap:8px;margin-top:12px">'+
      '<input type="checkbox" id="tg-enabled" style="width:16px;height:16px"'+(cfg.telegram_notify_enabled==='true'?' checked':'')+'>'+
      '<label for="tg-enabled" style="font-size:14px">알림 활성화</label></div>'+
      '<label class="gift-label" style="margin-top:12px">최소 재고 경보 기준 (전체)</label>'+
      '<input id="tg-minstk" type="number" min="0" class="form-input" value="'+esc(cfg.min_stock_global_alert||'5')+'">'+
      '<div style="display:flex;gap:8px;margin-top:16px">'+
      '<button id="tg-save" class="btn btn-primary" style="min-height:40px">💾 저장</button>'+
      '<button id="tg-test" class="btn btn-secondary" style="min-height:40px">📨 테스트 발송</button>'+
      '</div><div id="tg-status" style="font-size:12px;margin-top:8px;color:#6b7280"></div></div>';

    mb.querySelector('#tg-save').addEventListener('click', async function(){
      var btn=this; btn.disabled=true;
      var updates = [
        { key:'telegram_bot_token', value:mb.querySelector('#tg-token').value.trim() },
        { key:'telegram_chat_id', value:mb.querySelector('#tg-chat').value.trim() },
        { key:'telegram_notify_enabled', value:mb.querySelector('#tg-enabled').checked?'true':'false' },
        { key:'min_stock_global_alert', value:mb.querySelector('#tg-minstk').value||'5' }
      ];
      var errs = [];
      for (var i=0; i<updates.length; i++) {
        var r = await _db.from('gift_system_config').upsert({ key:updates[i].key, value:updates[i].value, updated_at:new Date().toISOString() });
        if (r.error) errs.push(r.error.message);
      }
      btn.disabled=false;
      if (errs.length) toast('저장 실패: '+errs.join(', '),'error');
      else toast('설정이 저장되었습니다.','success');
    });
    mb.querySelector('#tg-test').addEventListener('click', async function(){
      var btn=this; btn.disabled=true;
      var token=mb.querySelector('#tg-token').value.trim(), chat=mb.querySelector('#tg-chat').value.trim();
      if (!token||!chat) { mb.querySelector('#tg-status').textContent='Token과 Chat ID를 먼저 입력하세요.'; btn.disabled=false; return; }
      try {
        var r = await fetch('https://api.telegram.org/bot'+token+'/sendMessage', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({chat_id:chat,text:'✅ 텔레그램 설정 테스트 메시지 (아세아항공직업전문학교)'}) });
        var j = await r.json();
        mb.querySelector('#tg-status').textContent = j.ok ? '✅ 발송 성공!' : '❌ 발송 실패: '+j.description;
      } catch(e) { mb.querySelector('#tg-status').textContent='오류: '+e.message; }
      btn.disabled=false;
    });
  }

  /* ─── Edge Function 호출 헬퍼 ─────────────────────────────── */
  async function _callFn(name, body) {
    try {
      var headers = { 'Content-Type':'application/json', apikey: SUPABASE_KEY };
      if (_session) headers['Authorization'] = 'Bearer '+_session.access_token;
      var res = await fetch(FN_BASE+'/'+name, { method:'POST', headers:headers, body:JSON.stringify(body) });
      var json = await res.json();
      json._status = res.status;
      return json;
    } catch(e) { return { success:false, error:e.message, _status:0 }; }
  }

  return { onTabOpen: onTabOpen };

})();
