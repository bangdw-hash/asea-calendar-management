'use strict';
/* room-admin.js — 업무방 관리(관리자·개설자 전용)
 * 로그인: Google ID 토큰 → Edge Function task-auth(업무진행 평가툴과 같은 로그인) → 세션 토큰.
 * 방 개설·설정·링크 재발급·휴지통 정리는 서버(rm_admin_* RPC)가 관리자/개설자 여부를 검사합니다. */
(function () {
  var SUPA = 'https://zbpeyklwpotjyveipzxd.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV5a2x3cG90anl2ZWlwenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTYxMDcsImV4cCI6MjA5NzA5MjEwN30.6JgoQ6rPRnmrbBTG68A-Y9HDQk40mnwubhXVnkZvHrQ';
  var CLIENT_ID = '89094526186-ngj72p8cbqrvai06e2uhdiq0n5brrc2b.apps.googleusercontent.com';
  var BASE = location.origin + location.pathname.replace(/[^/]*$/, '');
  var ERR = { AUTH: '로그인이 만료되었습니다. 다시 로그인해 주십시오.', FORBIDDEN: '이 작업을 할 권한이 없습니다.', BAD_NAME: '이름은 1~80자로 입력해 주십시오.', BAD_STAGES: '단계는 3~6개, 각 1~12자여야 합니다.',
    STAGES_IN_USE: '이미 그보다 뒤 단계에 있는 업무가 있어 단계 수를 줄일 수 없습니다.', BAD_TRACKS: '분과는 12개까지, 각 1~20자입니다.', BAD_ORGS: '소속은 8개까지이며 코드(영문 소문자)·이름·색(#RRGGBB)이 필요합니다.',
    BAD_EMAIL: '이메일 형식을 확인해 주십시오.', NOT_FOUND: '대상을 찾을 수 없습니다.' };
  var S = { tsk: null, d: null };
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m, bad) { var b = $('#toast'), d = document.createElement('div'); d.textContent = m; if (bad) d.className = 'err'; b.appendChild(d); setTimeout(function () { d.remove(); }, bad ? 5000 : 2400); }
  function load(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function store(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* 무시 */ } }
  function link(t) { return BASE + 'room.html?r=' + t; }
  function rpc(name, a) {
    return fetch(SUPA + '/rest/v1/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY }, body: JSON.stringify(Object.assign({ p_tsk: S.tsk }, a || {})) })
      .then(function (r) { return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* 본문 없음 */ } if (!r.ok) { var c = (j && j.message) || ''; var e = new Error(ERR[c] || '처리하지 못했습니다.'); e.code = c; throw e; } return j; }); });
  }
  function fail(e) { if (e.code === 'AUTH') { out(true); return; } toast(e.message, true); }

  function loginView(msg) {
    $('#app').innerHTML = '<div class="screen"><div class="card"><div><div class="muted sm">아세아항공직업전문학교</div><h2>업무방 관리</h2></div><p class="muted" style="margin:0">방을 만들고 설정하는 화면입니다. 관리자가 지정한 개설자만 사용할 수 있으며 Google 계정으로 로그인합니다. 방에 들어가는 일반 참여자는 로그인이 필요 없습니다.</p>' +
      (msg ? '<div class="err-box">' + esc(msg) + '</div>' : '') + '<div id="gbtn" style="min-height:44px"><span class="muted sm">Google 로그인 준비 중…</span></div></div></div>';
    var n = 0, iv = setInterval(function () {
      n++; if (window.google && google.accounts && google.accounts.id) {
        clearInterval(iv); google.accounts.id.initialize({ client_id: CLIENT_ID, callback: onCred, auto_select: false });
        var b = $('#gbtn'); if (b) { b.innerHTML = ''; google.accounts.id.renderButton(b, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'ko', width: 280 }); }
      } else if (n > 50) { clearInterval(iv); var g = $('#gbtn'); if (g) g.innerHTML = '<span class="err-box">Google 로그인 스크립트를 불러오지 못했습니다. 새로고침해 주십시오.</span>'; }
    }, 200);
  }
  function onCred(resp) {
    fetch(SUPA + '/functions/v1/task-auth', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY }, body: JSON.stringify({ credential: resp.credential }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) return loginView('Google 계정 확인에 실패했습니다.');
        if (x.j.status !== 'active') return loginView('이 계정은 아직 승인되지 않았습니다. 관리자에게 문의해 주십시오.');
        S.tsk = x.j.token; store('tsk_tok', S.tsk); boot();
      }).catch(function () { loginView('네트워크에 연결할 수 없습니다.'); });
  }
  function out(silent) { S.tsk = null; store('tsk_tok', null); loginView(silent ? ERR.AUTH : ''); }
  function boot() {
    rpc('rm_admin_list').then(function (d) { S.d = d; view(); }).catch(function (e) { if (e.code === 'FORBIDDEN') { S.tsk = null; store('tsk_tok', null); loginView('방을 만들 수 있는 계정이 아닙니다. 관리자에게 개설자 지정을 요청해 주십시오.'); } else if (e.code === 'AUTH') out(true); else loginView(e.message); });
  }
  var MODE = { rw: '링크로 보기·쓰기', ro: '링크로 보기만', locked: '잠금(아무도 못 들어옴)' };
  function view() {
    var d = S.d;
    $('#app').innerHTML = '<div class="wrap"><div class="hd"><h1>업무방 관리</h1><span class="muted sm">' + esc(d.me.name || d.me.email) + (d.me.admin ? ' · 관리자' : ' · 개설자') + '</span><span class="sp"></span><button type="button" class="btn" data-act="new">방 만들기</button><button type="button" class="btn gray" data-act="out">로그아웃</button></div>' +
      (d.rooms.length ? d.rooms.map(function (r) {
        return '<div class="card sec"><div class="h"><h3>' + esc(r.name) + '</h3><span class="badge n">' + esc(MODE[r.mode]) + '</span></div><div class="b">' +
          '<div class="linkbar" style="padding:0"><span class="u">' + esc(link(r.token)) + '</span><button type="button" class="btn xs sub" data-copy="' + esc(r.token) + '">링크 복사</button><a class="btn xs gray" href="' + esc(link(r.token)) + '" target="_blank" rel="noopener noreferrer">열기</a></div>' +
          '<div class="muted sm">업무 ' + r.tasks + ' · 파일 ' + r.files + ' · 참여자 ' + r.persons + ' · 휴지통 ' + r.trash + (r.info && r.info.event ? ' · 행사일 ' + esc(r.info.event) : '') + '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn xs" data-edit="' + esc(r.id) + '">설정</button>' +
          (r.mode !== 'locked' ? '<button type="button" class="btn xs red" data-lock="' + esc(r.id) + '">즉시 잠금</button>' : '<button type="button" class="btn xs sub" data-unlock="' + esc(r.id) + '">잠금 해제</button>') +
          '<button type="button" class="btn xs gray" data-rot="' + esc(r.id) + '">링크 재발급</button><button type="button" class="btn xs gray" data-purge="' + esc(r.id) + '">휴지통 정리(30일 지난 것)</button></div></div></div>';
      }).join('') : '<div class="card empty">아직 만든 방이 없습니다. 「방 만들기」로 시작하십시오.</div>') +
      (d.me.admin ? '<div class="card sec"><div class="h"><h3>방 개설자 지정</h3></div><div class="b"><div class="muted sm">개설자는 자기가 만든 방을 설정할 수 있습니다. 관리자는 모든 방을 관리합니다.</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + d.creators.map(function (e) { return '<span class="chip">' + esc(e) + ' <button type="button" class="ib" style="width:20px;height:20px" data-delcr="' + esc(e) + '" aria-label="삭제">&times;</button></span>'; }).join('') + (d.creators.length ? '' : '<span class="muted sm">지정된 개설자가 없습니다.</span>') + '</div>' +
        '<div style="display:flex;gap:6px"><input type="text" id="cre" placeholder="개설자 Google 이메일" style="max-width:320px"><button type="button" class="btn sub" data-act="addcr">추가</button></div></div></div>' : '') + '</div>';
  }
  function modal(h) { var m = document.createElement('div'); m.className = 'shade'; m.setAttribute('data-modal', '1'); m.innerHTML = '<div class="modal wide" role="dialog">' + h + '</div>'; document.body.appendChild(m); return m; }
  function closeModal() { var m = $('[data-modal]'); if (m) m.remove(); }
  function confirmDlg(msg, ok, label) {
    var m = modal('<div class="m-h"><h3>확인</h3></div><div class="m-b"><p style="margin:0">' + esc(msg) + '</p></div><div class="m-f"><button type="button" class="btn gray" data-close>취소</button><button type="button" class="btn red" id="cok">' + esc(label || '진행') + '</button></div>');
    $('#cok', m).onclick = function () { closeModal(); ok(); };
  }
  function newDlg() {
    var m = modal('<div class="m-h"><h3>방 만들기</h3></div><form id="nf"><div class="m-b"><label class="f">방 이름<input type="text" id="nn" maxlength="80" value="" placeholder="예: 2026 아세아 창공제 TF"></label>' +
      '<div class="grid2"><label class="f">행사일<input type="date" id="ne"></label><label class="f">시간<input type="text" id="nt" maxlength="30" placeholder="10:00~16:00"></label></div><div class="err-box hide" id="nr"></div></div><div class="m-f"><button type="button" class="btn gray" data-close>취소</button><button type="submit" class="btn">만들기</button></div></form>');
    $('#nf', m).onsubmit = function (e) {
      e.preventDefault(); var nm = $('#nn', m).value.trim(), er = $('#nr', m); if (!nm) { er.textContent = '방 이름을 입력해 주십시오.'; er.classList.remove('hide'); return; }
      rpc('rm_admin_create', { p: { name: nm, info: { event: $('#ne', m).value || '', time: $('#nt', m).value || '' } } }).then(function (r) { closeModal(); toast('방을 만들었습니다.'); boot(); }).catch(function (x) { er.textContent = x.message; er.classList.remove('hide'); });
    };
  }
  function editDlg(id) {
    var r = S.d.rooms.filter(function (x) { return x.id === id; })[0], i = r.info || {};
    var m = modal('<div class="m-h"><h3>방 설정</h3></div><form id="ef"><div class="m-b">' +
      '<label class="f">방 이름<input type="text" id="en" maxlength="80" value="' + esc(r.name) + '"></label>' +
      '<label class="f">링크 권한<select id="em"><option value="rw"' + (r.mode === 'rw' ? ' selected' : '') + '>링크로 보기·쓰기 (한컴독스형)</option><option value="ro"' + (r.mode === 'ro' ? ' selected' : '') + '>링크로 보기만</option><option value="locked"' + (r.mode === 'locked' ? ' selected' : '') + '>잠금 (아무도 못 들어옴)</option></select></label>' +
      '<div class="grid2"><label class="f">행사일<input type="date" id="ee" value="' + esc(i.event || '') + '"></label><label class="f">시간<input type="text" id="et" maxlength="30" value="' + esc(i.time || '') + '"></label>' +
      '<label class="f">대상<input type="text" id="ea" maxlength="40" value="' + esc(i.audience || '') + '"></label><label class="f">총학 창구(직책만)<input type="text" id="ec" maxlength="40" value="' + esc(i.contact || '') + '"></label></div>' +
      '<label class="f">주관·운영 설명<input type="text" id="eh" maxlength="120" value="' + esc(i.host || '') + '"></label>' +
      '<div class="grid2"><label class="f">파일 올리기<select id="eu"><option value="1"' + (r.upload_on ? ' selected' : '') + '>허용</option><option value="0"' + (!r.upload_on ? ' selected' : '') + '>끄기</option></select></label><label class="f">파일 한도(MB, 1~20)<input type="number" id="ex" min="1" max="20" value="' + r.max_mb + '"></label></div>' +
      '<label class="f">단계 (한 줄에 하나, 3~6개)<textarea id="es" style="min-height:90px">' + esc(r.stages.join('\n')) + '</textarea></label>' +
      '<label class="f">분과 (한 줄에 하나, 12개까지)<textarea id="et2" style="min-height:90px">' + esc(r.tracks.join('\n')) + '</textarea></label>' +
      '<label class="f">소속 (한 줄에 하나: 코드|이름|#색)<textarea id="eo" style="min-height:100px">' + esc(r.orgs.map(function (o) { return o.k + '|' + o.n + '|' + o.c; }).join('\n')) + '</textarea></label>' +
      '<div class="err-box hide" id="er"></div></div><div class="m-f"><button type="button" class="btn gray" data-close>취소</button><button type="submit" class="btn">저장</button></div></form>');
    $('#ef', m).onsubmit = function (e) {
      e.preventDefault(); var er = $('#er', m);
      function lines(v) { return v.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean); }
      var orgs = lines($('#eo', m).value).map(function (l) { var a = l.split('|'); return { k: (a[0] || '').trim(), n: (a[1] || '').trim(), c: (a[2] || '').trim() }; });
      var p = { id: id, name: $('#en', m).value.trim(), mode: $('#em', m).value, upload_on: $('#eu', m).value === '1', max_mb: parseInt($('#ex', m).value, 10) || 20,
        info: { event: $('#ee', m).value, time: $('#et', m).value.trim(), audience: $('#ea', m).value.trim(), contact: $('#ec', m).value.trim(), host: $('#eh', m).value.trim() },
        stages: lines($('#es', m).value), tracks: lines($('#et2', m).value), orgs: orgs };
      rpc('rm_admin_save', { p: p }).then(function () { closeModal(); toast('저장했습니다.'); boot(); }).catch(function (x) { er.textContent = x.message; er.classList.remove('hide'); });
    };
  }
  function setMode(id, mode) {
    var r = S.d.rooms.filter(function (x) { return x.id === id; })[0];
    rpc('rm_admin_save', { p: { id: id, name: r.name, mode: mode, upload_on: r.upload_on, max_mb: r.max_mb, info: r.info, stages: r.stages, tracks: r.tracks, orgs: r.orgs } }).then(function () { toast(mode === 'locked' ? '방을 잠갔습니다.' : '잠금을 풀었습니다.'); boot(); }).catch(fail);
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button,a'); if (!t) return;
    if (t.hasAttribute('data-close')) return closeModal();
    var a = t.dataset.act;
    if (a === 'new') return newDlg();
    if (a === 'out') return out(false);
    if (a === 'addcr') { var v = $('#cre').value.trim(); return rpc('rm_admin_creator', { p_email: v, p_flag: true }).then(function () { toast('개설자를 추가했습니다.'); boot(); }).catch(fail); }
    if (t.dataset.delcr) return rpc('rm_admin_creator', { p_email: t.dataset.delcr, p_flag: false }).then(function () { boot(); }).catch(fail);
    if (t.dataset.copy) { var u = link(t.dataset.copy); if (navigator.clipboard) navigator.clipboard.writeText(u).then(function () { toast('링크를 복사했습니다.'); }, function () { toast('복사하지 못했습니다.', true); }); return; }
    if (t.dataset.edit) return editDlg(t.dataset.edit);
    if (t.dataset.lock) return confirmDlg('이 방을 즉시 잠글까요? 링크를 가진 모든 사람이 들어올 수 없게 됩니다. 언제든 풀 수 있습니다.', function () { setMode(t.dataset.lock, 'locked'); }, '잠금');
    if (t.dataset.unlock) return setMode(t.dataset.unlock, 'rw');
    if (t.dataset.rot) return confirmDlg('링크를 재발급하면 기존 링크는 즉시 쓸 수 없게 됩니다. 새 링크를 참여자에게 다시 알려야 합니다.', function () {
      rpc('rm_admin_rotate', { p_id: t.dataset.rot }).then(function (tk) { toast('새 링크를 만들었습니다.'); boot(); }).catch(fail); }, '재발급');
    if (t.dataset.purge) return confirmDlg('삭제한 지 30일이 지난 업무·파일·결정을 영구 삭제합니다. 되돌릴 수 없습니다.', function () {
      fetch(SUPA + '/functions/v1/room-file', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY }, body: JSON.stringify({ action: 'purge', tsk: S.tsk, id: t.dataset.purge, days: 30 }) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(ERR[j.error] || '정리하지 못했습니다.'); toast('영구 삭제한 파일 ' + j.removed + '개 (업무·결정 포함)'); boot(); }); }).catch(function (x) { toast(x.message, true); }); }, '영구 삭제');
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  S.tsk = load('tsk_tok'); if (S.tsk) boot(); else loginView();
})();
