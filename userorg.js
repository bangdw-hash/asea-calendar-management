'use strict';
/**
 * userorg.js — 조직(부서·보직) & 사용자 디렉토리 (UserOrg)
 *
 * 목적(전사 확대 기반):
 *  - 구글 계정으로 로그인한 사용자를 공유 디렉토리에 자동 등록
 *  - 사용자가 본인 "부서"와 "보직"을 선택(셀프서비스) → 관리자가 검토/배정
 *  - 관리자가 보직별로 노출 메뉴를 사전 세팅 → 부서/보직에 따라 메뉴 자동 노출
 *  - 예산 등 부서 기반 기능이 이 디렉토리의 부서를 사용
 *
 * 저장: asea_user_directory(공유), asea_position_menus(공유, 보직별 노출 메뉴)
 *  - cloudsync가 두 키를 공유(아래 prefix/exact 등록됨)
 *  - 메뉴 숨김은 .uo-menu-hidden(!important)로 AdminModule 인라인 스타일과 비충돌
 */
var UserOrg = (function () {
  var DIR_KEY = 'asea_user_directory';      // [{email,name,dept,position,lastSeen}]
  var POS_KEY = 'asea_position_menus';       // { position: [menuId,...] }
  var POSITIONS = ['임원', '처장', '팀장', '직원', '기타'];

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function curEmail(){ try { return (localStorage.getItem('asea_user_email')||'').trim().toLowerCase(); } catch(e){ return ''; } }
  function toast(m,t){ if(window.AppToast) return window.AppToast(m,t); try{ if(window.BudgetToast) return; }catch(e){} var d=document.getElementById('uo-toast'); if(!d){d=document.createElement('div');d.id='uo-toast';d.className='budget-toast';document.body.appendChild(d);} d.textContent=m; d.className='budget-toast show'+(t==='error'?' err':''); clearTimeout(d._t); d._t=setTimeout(function(){d.className='budget-toast';},3000); }

  /* ── 디렉토리 ── */
  function dir(){ try { return JSON.parse(localStorage.getItem(DIR_KEY)||'[]'); } catch(e){ return []; } }
  function saveDir(a){ try { localStorage.setItem(DIR_KEY, JSON.stringify(a)); } catch(e){} }
  function rec(email){ email=(email||curEmail()).toLowerCase(); return dir().find(function(u){ return (u.email||'').toLowerCase()===email; })||null; }
  function me(){ return rec(curEmail()); }
  function myDept(){ var r=me(); return (r&&r.dept)||localStorage.getItem('asea_budget_my_dept')||''; }
  function myPosition(){ var r=me(); return (r&&r.position)||''; }

  // 관리자/임원/매니저는 전체 부서 열람
  function canSeeAll(){
    try { if (window.AdminModule && AdminModule.isManager && AdminModule.isManager()) return true; } catch(e){}
    if (myPosition()==='임원') return true;
    return false;
  }

  // 로그인 사용자 자동 등록(이메일·이름·최근접속)
  function register(){
    var email=curEmail(); if(!email) return;
    var name=''; try { name=(document.getElementById('user-email')||{}).textContent||''; } catch(e){}
    var arr=dir(); var u=arr.find(function(x){ return (x.email||'').toLowerCase()===email; });
    var now=new Date().toISOString();
    if(!u){ arr.push({ id:email, email:email, name:name||email, dept:'', position:'', lastSeen:now }); saveDir(arr); }
    else { u.lastSeen=now; if(name && (!u.name||u.name===u.email)) u.name=name; u.id=u.id||email; saveDir(arr); }
  }
  function setMine(dept, position){
    var email=curEmail(); if(!email){ toast('로그인이 필요합니다.','error'); return; }
    var arr=dir(); var u=arr.find(function(x){ return (x.email||'').toLowerCase()===email; });
    if(!u){ u={ id:email, email:email, name:email }; arr.push(u); }
    if(dept!=null) u.dept=dept; if(position!=null) u.position=position; u.lastSeen=new Date().toISOString();
    saveDir(arr);
    try { localStorage.setItem('asea_budget_my_dept', u.dept||''); } catch(e){}  // 예산 호환
    applyMenuVis();
  }

  /* ── 부서 목록(예산 시드 + 디렉토리) ── */
  function depts(){
    var list=(window.BUDGET_DEPTS_2026||[]).slice();
    dir().forEach(function(u){ if(u.dept && list.indexOf(u.dept)<0) list.push(u.dept); });
    return list;
  }

  /* ── 보직별 메뉴 노출 ── */
  function posMenus(){ try { return JSON.parse(localStorage.getItem(POS_KEY)||'{}'); } catch(e){ return {}; } }
  function savePosMenus(o){ try { localStorage.setItem(POS_KEY, JSON.stringify(o)); } catch(e){} }
  function allowedMenus(){
    if(canSeeAll()) return null;            // 전체 노출
    var pos=myPosition(); if(!pos) return null;
    var m=posMenus(); var a=m[pos];
    return (a && a.length) ? a : null;      // 미설정이면 전체 노출
  }
  function applyMenuVis(){
    var allow=allowedMenus();
    document.querySelectorAll('.tab-btn[data-tab]').forEach(function(b){
      var hide = allow && allow.indexOf(b.dataset.tab)<0;
      b.classList.toggle('uo-menu-hidden', !!hide);
    });
    // 모든 항목이 숨겨진 카테고리(데스크탑)는 카테고리 버튼도 숨김
    document.querySelectorAll('.nav-group').forEach(function(g){
      var btns=g.querySelectorAll('.nav-group-menu .tab-btn[data-tab]');
      var anyVisible=false;
      btns.forEach(function(b){ if(!b.classList.contains('uo-menu-hidden')) anyVisible=true; });
      if(btns.length) g.classList.toggle('uo-menu-hidden', !anyVisible);
    });
    // 모바일 카테고리: navgroups가 시트 생성 시 .uo-menu-hidden 을 건너뜀(navgroups isHidden 반영)
  }

  /* ── 셀프서비스: 내 부서·보직 ── */
  function openMyInfo(){
    var r=me()||{}; var ds=depts();
    var body='<div class="bdg-form">'+
      '<p class="bdg-muted">'+esc(curEmail()||'(로그인 필요)')+'</p>'+
      '<label>소속 부서</label><select id="uo-dept"><option value="">— 선택 —</option>'+
        ds.map(function(d){ return '<option'+(d===r.dept?' selected':'')+'>'+esc(d)+'</option>'; }).join('')+'</select>'+
      '<label>보직</label><select id="uo-pos"><option value="">— 선택 —</option>'+
        POSITIONS.map(function(p){ return '<option'+(p===r.position?' selected':'')+'>'+esc(p)+'</option>'; }).join('')+'</select>'+
      '<div class="bdg-form-actions"><button id="uo-save" class="btn btn-primary">저장</button><button id="uo-cancel" class="btn btn-secondary">닫기</button></div>'+
      '<p class="bdg-muted" style="margin-top:8px">※ 부서·보직은 관리자가 「조직 관리」에서 검토·변경할 수 있습니다.</p>'+
      '</div>';
    showModal('내 부서 · 보직', body);
    document.getElementById('uo-cancel').addEventListener('click', closeModal);
    document.getElementById('uo-save').addEventListener('click', function(){
      setMine(document.getElementById('uo-dept').value, document.getElementById('uo-pos').value);
      closeModal(); toast('저장되었습니다.');
      try { if(window.BudgetModule && BudgetModule.renderTab){ var t=document.getElementById('tab-budget'); if(t&&!t.hidden) BudgetModule.renderTab(); } } catch(e){}
    });
  }

  /* ── 관리자: 조직/사용자 관리 ── */
  function isAdmin(){ try { return window.AdminModule && AdminModule.isManager && AdminModule.isManager(); } catch(e){ return false; } }
  function openAdmin(){
    if(!isAdmin()){ toast('관리자 권한이 필요합니다.','error'); return; }
    var arr=dir().slice().sort(function(a,b){ return (a.dept||'').localeCompare(b.dept||'','ko')||(a.email||'').localeCompare(b.email||''); });
    var ds=depts();
    var rows=arr.length?arr.map(function(u){
      return '<tr>'+
        '<td>'+esc(u.name||'')+'<div class="bdg-muted">'+esc(u.email)+'</div></td>'+
        '<td><select class="uo-u-dept" data-email="'+esc(u.email)+'"><option value="">—</option>'+ds.map(function(d){return '<option'+(d===u.dept?' selected':'')+'>'+esc(d)+'</option>';}).join('')+'</select></td>'+
        '<td><select class="uo-u-pos" data-email="'+esc(u.email)+'"><option value="">—</option>'+POSITIONS.map(function(p){return '<option'+(p===u.position?' selected':'')+'>'+esc(p)+'</option>';}).join('')+'</select></td>'+
        '<td class="bdg-muted">'+esc((u.lastSeen||'').slice(0,10))+'</td>'+
        '<td><button class="uo-u-del" data-email="'+esc(u.email)+'">삭제</button></td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="5" class="bdg-empty">등록된 사용자가 없습니다. (사용자가 로그인하면 자동 등록됩니다)</td></tr>';
    var body='<div class="uo-admin">'+
      '<div class="uo-tabs"><button id="uo-tab-users" class="subtab-btn active">사용자 배정</button><button id="uo-tab-menus" class="subtab-btn">보직별 메뉴</button></div>'+
      '<div id="uo-users"><p class="bdg-muted">로그인한 사용자에게 부서·보직을 배정하세요. 보직에 따라 메뉴가 노출됩니다.</p>'+
        '<div class="scroll-x"><table class="bdg-table sm"><thead><tr><th>사용자</th><th>부서</th><th>보직</th><th>최근접속</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'+
      '<div id="uo-menus" hidden></div>'+
      '</div>';
    showModal('조직 · 사용자 관리', body);
    document.querySelectorAll('.uo-u-dept').forEach(function(s){ s.addEventListener('change', function(){ updateUser(this.dataset.email,{dept:this.value}); }); });
    document.querySelectorAll('.uo-u-pos').forEach(function(s){ s.addEventListener('change', function(){ updateUser(this.dataset.email,{position:this.value}); }); });
    document.querySelectorAll('.uo-u-del').forEach(function(b){ b.addEventListener('click', function(){ if(confirm('이 사용자를 디렉토리에서 삭제할까요?')){ saveDir(dir().filter(function(u){return (u.email||'').toLowerCase()!==this.dataset.email;}.bind(this))); openAdmin(); } }); });
    document.getElementById('uo-tab-users').addEventListener('click', function(){ this.classList.add('active'); document.getElementById('uo-tab-menus').classList.remove('active'); document.getElementById('uo-users').hidden=false; document.getElementById('uo-menus').hidden=true; });
    document.getElementById('uo-tab-menus').addEventListener('click', function(){ this.classList.add('active'); document.getElementById('uo-tab-users').classList.remove('active'); document.getElementById('uo-users').hidden=true; renderMenuMatrix(); });
  }
  function updateUser(email, patch){
    var arr=dir(); var u=arr.find(function(x){ return (x.email||'').toLowerCase()===String(email).toLowerCase(); });
    if(!u) return; Object.keys(patch).forEach(function(k){ u[k]=patch[k]; }); saveDir(arr);
    if((email||'').toLowerCase()===curEmail()){ try{ localStorage.setItem('asea_budget_my_dept',u.dept||''); }catch(e){} applyMenuVis(); }
    toast('저장되었습니다.');
  }
  function menuList(){
    var out=[];
    document.querySelectorAll('.desktop-tab-nav .tab-btn[data-tab]').forEach(function(b){
      var lbl=(b.querySelector('.tab-label')||{}).textContent||b.dataset.tab;
      out.push({ id:b.dataset.tab, label:lbl });
    });
    return out;
  }
  function renderMenuMatrix(){
    var wrap=document.getElementById('uo-menus'); wrap.hidden=false;
    var menus=menuList(); var pm=posMenus();
    var html='<p class="bdg-muted">보직별로 노출할 메뉴를 선택하세요. 아무것도 선택하지 않으면 <b>전체 노출</b>됩니다. (관리자·임원은 항상 전체)</p>';
    POSITIONS.forEach(function(pos){
      var allow=pm[pos]||[];
      html+='<div class="uo-pos-block"><div class="uo-pos-title">'+esc(pos)+'</div><div class="uo-menu-grid">'+
        menus.map(function(m){
          var on=allow.indexOf(m.id)>=0;
          return '<label class="uo-chk"><input type="checkbox" class="uo-menu-chk" data-pos="'+esc(pos)+'" data-menu="'+esc(m.id)+'"'+(on?' checked':'')+'> '+esc(m.label)+'</label>';
        }).join('')+'</div></div>';
    });
    html+='<div class="bdg-form-actions"><button id="uo-menus-save" class="btn btn-primary">메뉴 노출 저장</button></div>';
    wrap.innerHTML=html;
    document.getElementById('uo-menus-save').addEventListener('click', function(){
      var o={};
      document.querySelectorAll('.uo-menu-chk').forEach(function(c){
        if(c.checked){ (o[c.dataset.pos]=o[c.dataset.pos]||[]).push(c.dataset.menu); }
      });
      savePosMenus(o); applyMenuVis(); toast('보직별 메뉴 노출을 저장했습니다.');
    });
  }

  /* ── 모달(공용) ── */
  function showModal(title, bodyHtml){
    closeModal();
    var ov=document.createElement('div'); ov.id='uo-modal'; ov.className='bdg-modal-ov';
    ov.innerHTML='<div class="bdg-modal-dialog"><div class="bdg-modal-head"><span>'+esc(title)+'</span><button id="uo-modal-x">✕</button></div><div class="bdg-modal-body">'+bodyHtml+'</div></div>';
    document.body.appendChild(ov);
    document.getElementById('uo-modal-x').addEventListener('click', closeModal);
    ov.addEventListener('click', function(e){ if(e.target===ov) closeModal(); });
  }
  function closeModal(){ var m=document.getElementById('uo-modal'); if(m) m.remove(); }

  /* ── 시작 ── */
  function start(){
    register();
    applyMenuVis();
    // 이메일이 늦게 채워지는 경우 대비(로그인 후)
    var tries=0; var iv=setInterval(function(){ tries++; if(curEmail()){ register(); applyMenuVis(); clearInterval(iv); } if(tries>30) clearInterval(iv); }, 1000);
    window.addEventListener('cloudsync-updated', applyMenuVis);
    document.addEventListener('click', function(){ /* nav 재구성 후 반영 */ });
    var mo = window.MutationObserver ? new MutationObserver(function(){ applyMenuVis(); }) : null;
    var nav=document.querySelector('.desktop-tab-nav'); if(mo&&nav) mo.observe(nav,{childList:true,subtree:true});
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', start); else start();

  return {
    me: me, myDept: myDept, myPosition: myPosition, canSeeAll: canSeeAll,
    depts: depts, register: register, applyMenuVis: applyMenuVis, setMine: setMine,
    openMyInfo: openMyInfo, openAdmin: openAdmin, POSITIONS: POSITIONS,
  };
})();
window.UserOrg = UserOrg;
