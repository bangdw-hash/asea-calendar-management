'use strict';
/* room.js — 링크형 업무방
 * - 링크(?r=토큰)를 가진 사람은 누구나 보고, 이름을 입력해 입장하면 쓸 수 있습니다. 이름 보호용 PIN(4자리)은 선택입니다.
 * - 권한 검사는 모두 서버(public.rm_* RPC)에서 합니다. 화면 문자열은 반드시 esc()를 거칩니다.
 * - 파일은 비공개 저장소에 올리고, 열람 주소는 Edge Function room-file 이 1시간짜리로 발급합니다. */
(function () {
  var SUPA = 'https://zbpeyklwpotjyveipzxd.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV5a2x3cG90anl2ZWlwenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTYxMDcsImV4cCI6MjA5NzA5MjEwN30.6JgoQ6rPRnmrbBTG68A-Y9HDQk40mnwubhXVnkZvHrQ';
  var ROOM = new URLSearchParams(location.search).get('r') || '';
  var LS = 'rm_' + ROOM.slice(0, 10);
  var ERR = {
    NO_ROOM: '링크가 올바르지 않거나 더 이상 사용할 수 없습니다.', LOCKED: '관리자가 이 방을 잠갔습니다.', READONLY: '지금은 읽기만 가능한 방입니다.',
    JOIN: '입장 정보가 만료되었습니다. 이름을 다시 입력해 주십시오.', CONFLICT: '다른 사람이 먼저 수정했습니다. 최신 내용을 불러왔습니다.', NOT_FOUND: '대상을 찾을 수 없습니다.',
    BAD_NAME: '이름은 1~20자로 입력해 주십시오.', BAD_PIN: 'PIN은 숫자 4자리여야 합니다.', PIN_EXISTS: '이미 PIN이 있습니다.', ROOM_FULL: '입장 가능 인원을 넘었습니다.',
    BAD_TITLE: '업무명은 1~120자로 입력해 주십시오.', BAD_ITEMS: '체크리스트는 40개까지 만들 수 있습니다.', TOO_MANY: '등록 가능한 개수를 넘었습니다.',
    BAD_TYPE: '올릴 수 없는 파일 형식입니다.', TOO_BIG: '파일이 너무 큽니다.', UPLOAD_OFF: '이 방은 파일 올리기가 꺼져 있습니다.', BAD_TEXT: '내용은 1~300자로 입력해 주십시오.',
    BAD_ASSIGNEE: '담당자를 찾을 수 없습니다.', NO_OBJECT: '파일 업로드가 완료되지 않았습니다.'
  };
  var EXT = { img: ['png', 'jpg', 'jpeg', 'gif', 'webp'], pdf: ['pdf'], doc: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'hwp', 'hwpx', 'txt', 'csv'] };
  var S = { rev: null, d: null, ptok: null, me: null, urls: {}, f: { org: '', track: '', q: '', who: '', mine: false }, timer: null, unread: -1, uploading: false, signing: false };
  var TODAY = ymd(new Date());
  var sb = null;

  /* ---------- 유틸 ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function pd(s) { var a = String(s).slice(0, 10).split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function diff(a, b) { return Math.round((pd(a) - pd(b)) / 864e5); }
  function md(s) { return s ? +s.slice(5, 7) + '/' + +s.slice(8, 10) : '-'; }
  function dt(s) { var d = new Date(s); return isNaN(d) ? '' : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function dow(s) { return '일월화수목금토'[pd(s).getDay()]; }
  function size(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB'; }
  function ico(n) {
    var P = { link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>', up: '<path d="M12 21V9m0 0l-4 4m4-4l4 4M4 3h16"/>',
      x: '<path d="M18 6L6 18M6 6l12 12"/>', plus: '<path d="M12 5v14M5 12h14"/>', bell: '<path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0"/>',
      trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', dl: '<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V8a4 4 0 018 0v3"/>' };
    return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (P[n] || '') + '</svg>';
  }
  function toast(msg, bad) {
    var box = $('#toast'), d = document.createElement('div'); d.textContent = msg; if (bad) d.className = 'err'; box.appendChild(d);
    setTimeout(function () { d.remove(); }, bad ? 5000 : 2400);
  }
  function lsGet() { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } }
  function lsSet(v) { try { if (v) localStorage.setItem(LS, JSON.stringify(v)); else localStorage.removeItem(LS); } catch (e) { /* 저장 불가 환경 */ } }
  function org(k) { var o = S.d.room.orgs; for (var i = 0; i < o.length; i++) if (o[i].k === k) return o[i]; return null; }
  function orgBadge(k) { var o = org(k); return o ? '<span class="badge" style="background:' + esc(o.c) + '">' + esc(o.n) + '</span>' : (k ? '<span class="badge n">' + esc(k) + '</span>' : ''); }
  function person(id) { var p = S.d.persons; for (var i = 0; i < p.length; i++) if (p[i].id === id) return p[i]; return null; }
  function pname(id) { var p = person(id); return p ? p.name : ''; }
  function stages() { return S.d.room.stages; }
  function canWrite() { return S.d.room.mode === 'rw'; }

  /* ---------- 서버 호출 ---------- */
  function rpc(name, args, withTok) {
    var body = Object.assign({ p_room: ROOM }, args || {}); if (withTok) body.p_ptok = S.ptok || null;
    return fetch(SUPA + '/rest/v1/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* 본문 없음 */ }
          if (!r.ok) { var c = (j && j.message) || ''; var e = new Error(ERR[c] || '처리하지 못했습니다.'); e.code = c; throw e; }
          return j;
        });
      }, function () { var e = new Error('네트워크에 연결할 수 없습니다.'); e.code = 'NET'; throw e; });
  }
  function fn(body) {
    return fetch(SUPA + '/functions/v1/room-file', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY }, body: JSON.stringify(Object.assign({ room: ROOM }, body)) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) { var e = new Error(ERR[j.error] || '파일 처리에 실패했습니다.'); e.code = j.error; throw e; } return j; }); });
  }
  function fail(e) {
    if (e.code === 'JOIN') { S.ptok = null; S.me = null; lsSet(null); }
    if (e.code === 'CONFLICT') sync(true);
    if (e.code === 'NO_ROOM' || e.code === 'LOCKED') { stop(); screen(ERR[e.code]); return; }
    toast(e.message || '오류가 발생했습니다.', true);
  }
  function need(cb) { if (!canWrite()) { toast(ERR.READONLY, true); return false; } if (!S.ptok) { joinDlg(cb); return false; } return true; }

  /* ---------- 동기화 ---------- */
  function sync(force) {
    return rpc('rm_sync', { p_ptok: S.ptok || null, p_since: force ? null : S.rev }).then(function (d) {
      if (!d.changed) { if (S.ptok && !d.joined) { S.ptok = null; S.me = null; lsSet(null); render(); } return; }
      S.d = d; S.rev = d.rev; S.me = d.me;
      if (S.ptok && !d.joined) { S.ptok = null; lsSet(null); }
      var un = d.notices.filter(function (n) { return !n.read; }).length;
      if (S.unread >= 0 && un > S.unread) bnotify('새 알림 ' + (un - S.unread) + '건이 있습니다.');
      S.unread = un;
      document.title = d.room.name + ' | 업무방';
      render(); signImages();
    }).catch(function (e) { if (e.code === 'NO_ROOM' || e.code === 'LOCKED') { stop(); screen(ERR[e.code]); } else if (!S.d) screen(e.message); });
  }
  function start() { stop(); S.timer = setInterval(function () { if (!document.hidden && !document.querySelector('[data-modal]')) sync(false); }, 6000); }
  function stop() { clearInterval(S.timer); }
  function bnotify(msg) { try { if (window.Notification && Notification.permission === 'granted') new Notification(S.d.room.name, { body: msg }); } catch (e) { /* 미지원 */ } }

  /* ---------- 화면 ---------- */
  function screen(msg) { $('#app').innerHTML = '<div class="screen"><div class="card"><h2>업무방</h2><p>' + esc(msg) + '</p></div></div>'; }
  function dday(info) {
    if (!info || !info.event) return '';
    var n = diff(info.event, TODAY), t = n === 0 ? 'D-day' : n > 0 ? 'D-' + n : 'D+' + (-n);
    return '<span class="dday">' + t + '<small>' + esc(info.event.replace(/-/g, '.') + '(' + dow(info.event) + ') ' + (info.time || '')) + (info.audience ? ' · ' + esc(info.audience) : '') + '</small></span>';
  }
  function render() {
    var d = S.d, r = d.room, me = S.me, mode = r.mode;
    var f = S.f;
    var u = location.origin + location.pathname + '?r=' + ROOM;
    $('#app').innerHTML = '<div class="wrap">' +
      '<div class="hd"><h1>' + esc(r.name) + '</h1>' + dday(r.info) + (mode === 'ro' ? '<span class="badge n">읽기 전용</span>' : '') + '<span class="sp"></span>' +
      (me ? '<span class="chip">' + orgBadge(me.org) + ' <b>' + esc(me.name) + '</b>' + (me.pin ? ' <span class="badge pin">PIN</span>' : ' <button type="button" class="btn xs sub" data-act="pin">PIN 만들기</button>') + '</span><button type="button" class="btn xs gray" data-act="leave">나가기</button>'
        : (mode === 'rw' ? '<button type="button" class="btn" data-act="join">이름 입력하고 참여하기</button>' : '')) + '</div>' +
      (r.info && r.info.host ? '<div class="muted sm">' + esc(r.info.host) + (r.info.contact ? ' · 총학 창구: ' + esc(r.info.contact) : '') + '</div>' : '') +
      '<div class="card linkbar">' + ico('link') + '<span class="u">' + esc(u) + '</span><button type="button" class="btn xs sub" data-act="copy">링크 복사</button></div>' +
      '<div class="note">링크를 아는 사람은 누구나 보고 고칠 수 있습니다. 학번·연락처 등 개인정보와 외부에 알려서는 안 되는 자료는 올리지 마십시오. 삭제한 내용은 휴지통에서 복구할 수 있습니다.</div>' +
      '<div class="filters"><div class="chips"><button type="button" class="chip' + (f.org ? '' : ' on') + '" data-org="">전체</button>' + r.orgs.map(function (o) { return '<button type="button" class="chip' + (f.org === o.k ? ' on' : '') + '" data-org="' + esc(o.k) + '"><i class="dot" style="background:' + esc(o.c) + '"></i>' + esc(o.n) + '</button>'; }).join('') + '</div>' +
      '<select id="ft" aria-label="분과"><option value="">분과 전체</option>' + r.tracks.map(function (t) { return '<option' + (f.track === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' +
      '<input type="search" id="fq" placeholder="업무 검색" value="' + esc(f.q) + '" aria-label="업무 검색">' +
      (me ? '<label class="chip"><input type="checkbox" id="fm"' + (f.mine ? ' checked' : '') + '>내 업무</label>' : '') +
      (canWrite() ? '<button type="button" class="btn" data-act="newtask">' + ico('plus') + '업무 추가</button>' : '') + '</div>' +
      '<div class="dash"><div id="boardbox"></div><div class="side" id="side"></div></div>' +
      '<div class="card sec" id="filesec"></div><div class="card sec" id="trashsec"></div></div>';
    $('#ft').onchange = function (e) { S.f.track = e.target.value; board(); };
    $('#fq').oninput = function (e) { S.f.q = e.target.value; board(); };
    if ($('#fm')) $('#fm').onchange = function (e) { S.f.mine = e.target.checked; board(); };
    board(); sidebar(); files(); trash();
  }
  function visible() {
    var f = S.f, q = f.q.trim().toLowerCase();
    return S.d.tasks.filter(function (t) {
      if (f.org && t.org !== f.org) return false;
      if (f.track && t.track !== f.track) return false;
      if (f.mine && t.assignee !== (S.me && S.me.id)) return false;
      if (q && (t.title + ' ' + t.track + ' ' + pname(t.assignee)).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function prog(t) { var n = t.items.length; if (!n) return null; return Math.round(100 * t.items.filter(function (i) { return i.done; }).length / n); }
  function card(t) {
    var last = t.stage === stages().length - 1, p = prog(t), late = t.due && !last && diff(t.due, TODAY) < 0, soon = t.due && !last && !late && diff(t.due, TODAY) <= 2;
    var ass = t.assignee ? pname(t.assignee) : '';
    return '<div class="tk" data-open="' + esc(t.id) + '" tabindex="0" role="button" ' + (canWrite() ? 'draggable="true" data-drag="' + esc(t.id) + '"' : '') + '>' +
      '<div class="row">' + orgBadge(t.org) + (late ? '<span class="badge st-late">지연</span>' : soon ? '<span class="badge st-soon">임박</span>' : '') + (t.track ? '<span class="muted sm">' + esc(t.track) + '</span>' : '') + '</div>' +
      '<div class="t">' + esc(t.title) + '</div>' + (p != null ? '<div class="bar"><i style="width:' + p + '%"></i></div>' : '') +
      '<div class="meta">' + (ass ? esc(ass) : '담당 미정') + ' · ' + (t.due ? '마감 ' + md(t.due) : '마감 미정') + (t.files ? ' · 파일 ' + t.files : '') + (p != null ? ' · ' + p + '%' : '') + '</div></div>';
  }
  function board() {
    var L = visible(), st = stages();
    $('#boardbox').innerHTML = '<div class="board" style="grid-template-columns:repeat(' + st.length + ',minmax(220px,1fr))">' + st.map(function (n, i) {
      var c = L.filter(function (t) { return t.stage === i; });
      return '<div class="col" data-col="' + i + '"><h4>' + esc(n) + '<span>' + c.length + '</span></h4>' + (c.length ? c.map(card).join('') : '<div class="muted sm" style="padding:6px">없음</div>') + '</div>';
    }).join('') + '</div>';
  }
  function sidebar() {
    var d = S.d, me = S.me, h = '';
    var un = d.notices.filter(function (n) { return !n.read; });
    h += '<div class="card sec"><div class="h"><h3>' + ico('bell') + ' 알림 · 변경 피드</h3>' + (window.Notification && Notification.permission === 'default' && me ? '<button type="button" class="btn xs gray" data-act="bn">브라우저 알림</button>' : '') + '</div><div class="b">';
    if (me) {
      h += d.notices.length ? d.notices.slice(0, 6).map(function (n) { return '<div class="nt' + (n.read ? ' r' : '') + '" data-open="' + esc(n.ref || '') + '" style="cursor:pointer">' + esc(n.msg) + '</div>'; }).join('') + (un.length ? '<button type="button" class="btn xs gray" data-act="readall">모두 읽음</button>' : '') : '<div class="muted sm">내게 온 알림이 없습니다.</div>';
    } else h += '<div class="muted sm">이름을 입력해 참여하면 담당 지정·단계 이동 알림을 받습니다.</div>';
    h += '<div class="fd">' + d.activity.slice(0, 12).map(function (a) { return '<div><time>' + dt(a.at) + '</time><span><b>' + esc(a.who) + '</b> ' + esc(a.msg) + '</span></div>'; }).join('') + '</div></div></div>';
    h += '<div class="card sec"><div class="h"><h3>결정 로그</h3>' + (canWrite() ? '<button type="button" class="btn xs sub" data-act="newdec">' + ico('plus') + '기록</button>' : '') + '</div><div class="b">' +
      (d.decisions.length ? d.decisions.map(function (x) { return '<div class="dc"><div>' + esc(x.text) + '</div><div class="m">' + orgBadge(x.org) + esc(x.by || '') + ' · ' + dt(x.at) + (x.edits ? ' · 수정 ' + x.edits + '회' : '') +
        (canWrite() ? ' <button type="button" class="btn xs gray" data-decedit="' + esc(x.id) + '">수정</button> <button type="button" class="btn xs gray" data-trash="decision:' + esc(x.id) + '">삭제</button>' : '') + '</div></div>'; }).join('') : '<div class="empty">기록된 결정이 없습니다.</div>') + '</div></div>';
    $('#side').innerHTML = h;
  }
  function files() {
    var d = S.d, F = d.files;
    $('#filesec').innerHTML = '<div class="h"><h3>자료실 (' + F.length + ')</h3><span class="muted sm">이미지·PDF는 미리보기, 문서는 내려받기</span></div>' +
      (canWrite() && d.room.upload_on ? '<div class="drop" id="drop"><button type="button" class="btn sub" data-act="pick">' + ico('up') + '파일 올리기</button><span>또는 여기로 끌어다 놓기 · 한 파일 ' + d.room.max_mb + 'MB 이하 · 이미지는 자동으로 줄여 올립니다</span></div>' : '') +
      (F.length ? '<div class="files">' + F.map(function (f) {
        var u = S.urls[f.id];
        return '<button type="button" class="fc" data-file="' + esc(f.id) + '"><div class="th ' + (f.kind === 'img' ? '' : f.kind) + '">' + (f.kind === 'img' ? (u ? '<img loading="lazy" alt="" src="' + esc(u.u) + '">' : '이미지') : f.kind === 'pdf' ? 'PDF' : '문서') + '</div><div class="n">' + esc(f.name) + '<small>' + size(f.size) + ' · ' + esc(f.by || '') + ' · ' + dt(f.at) + '</small></div></button>';
      }).join('') + '</div>' : '<div class="empty">올라온 자료가 없습니다.</div>');
    var dz = $('#drop');
    if (dz) {
      ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
      dz.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) upload(Array.prototype.slice.call(e.dataTransfer.files), null); });
    }
  }
  function trash() {
    var t = S.d.trash, n = t.tasks.length + t.files.length + t.decisions.length;
    $('#trashsec').innerHTML = '<div class="h"><h3>휴지통 (' + n + ')</h3><span class="muted sm">삭제한 항목은 관리자가 정리하기 전까지 복구할 수 있습니다</span></div>' +
      (n ? '<div class="b">' + [['task', '업무', t.tasks], ['file', '파일', t.files], ['decision', '결정', t.decisions]].map(function (g) {
        return g[2].map(function (x) { return '<div class="fd"><div><time>' + g[1] + '</time><span style="flex:1">' + esc(x.title) + ' <span class="muted">(' + dt(x.at) + ')</span></span>' + (canWrite() ? '<button type="button" class="btn xs gray" data-restore="' + g[0] + ':' + esc(x.id) + '">복구</button>' : '') + '</div></div>'; }).join('');
      }).join('') + '</div>' : '<div class="empty">비어 있습니다.</div>');
  }

  /* ---------- 파일 주소·업로드 ---------- */
  function signImages() {
    if (S.signing) return; var now = Date.now();
    var ids = S.d.files.filter(function (f) { var u = S.urls[f.id]; return f.kind === 'img' && (!u || u.exp < now + 300000); }).map(function (f) { return f.id; }).slice(0, 60);
    if (!ids.length) return; S.signing = true;
    fn({ action: 'sign', ids: ids }).then(function (r) { Object.keys(r.urls).forEach(function (id) { S.urls[id] = { u: r.urls[id], exp: now + 3300000 }; }); files(); }).catch(function () { /* 다음 동기화에 재시도 */ }).then(function () { S.signing = false; });
  }
  function urlOf(id) {
    var u = S.urls[id]; if (u && u.exp > Date.now() + 60000) return Promise.resolve(u.u);
    return fn({ action: 'sign', ids: [id] }).then(function (r) { if (!r.urls[id]) throw new Error('파일을 찾을 수 없습니다.'); S.urls[id] = { u: r.urls[id], exp: Date.now() + 3300000 }; return r.urls[id]; });
  }
  function extOf(n) { var m = /\.([A-Za-z0-9]{1,5})$/.exec(n); return m ? m[1].toLowerCase() : ''; }
  function kindOf(n) { var e = extOf(n); return EXT.img.indexOf(e) >= 0 ? 'img' : EXT.pdf.indexOf(e) >= 0 ? 'pdf' : EXT.doc.indexOf(e) >= 0 ? 'doc' : null; }
  function shrink(file) {
    return new Promise(function (res) {
      if (kindOf(file.name) !== 'img' || /gif$/i.test(file.name) || file.size < 1200000) return res(file);
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, 2560 / Math.max(w, h)), c = document.createElement('canvas');
        c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { if (!b || b.size >= file.size) return res(file); res(new File([b], file.name.replace(/\.[A-Za-z0-9]+$/, '.jpg'), { type: 'image/jpeg' })); }, 'image/jpeg', 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); res(file); }; img.src = url;
    });
  }
  function upload(list, taskId) {
    if (!need(function () { upload(list, taskId); })) return;
    if (S.uploading) return toast('이미 올리는 중입니다.', true);
    S.uploading = true; var ok = 0, max = S.d.room.max_mb * 1048576;
    list.reduce(function (pr, f0) {
      return pr.then(function () {
        if (!kindOf(f0.name)) { toast('「' + f0.name + '」은(는) 올릴 수 없는 형식입니다.', true); return; }
        toast('올리는 중: ' + f0.name);
        return shrink(f0).then(function (f) {
          if (f.size > max) { toast('「' + f0.name + '」이(가) ' + S.d.room.max_mb + 'MB를 넘습니다.', true); return; }
          var mime = f.type || (kindOf(f.name) === 'pdf' ? 'application/pdf' : 'application/octet-stream');
          return fn({ action: 'prepare', ptok: S.ptok, name: f.name, size: f.size, mime: mime }).then(function (p) {
            if (!sb) sb = window.supabase.createClient(SUPA, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
            return sb.storage.from('room-files').uploadToSignedUrl(p.path, p.token, f, { contentType: mime }).then(function (r) {
              if (r.error) throw new Error('업로드에 실패했습니다.');
              return rpc('rm_file_commit', { p_path: p.path, p_task: taskId || null, p_name: f.name, p_mime: mime }, true);
            });
          }).then(function () { ok++; });
        });
      }).catch(function (e) { fail(e); });
    }, Promise.resolve()).then(function () { S.uploading = false; if (ok) toast(ok + '개 파일을 올렸습니다.'); return sync(true); });
  }
  function pickFiles(taskId) {
    var i = document.createElement('input'); i.type = 'file'; i.multiple = true;
    i.accept = EXT.img.concat(EXT.pdf, EXT.doc).map(function (e) { return '.' + e; }).join(',');
    i.onchange = function () { if (i.files.length) upload(Array.prototype.slice.call(i.files), taskId); }; i.click();
  }

  /* ---------- 대화창 ---------- */
  function modal(html, wide) { var m = document.createElement('div'); m.className = 'shade'; m.setAttribute('data-modal', '1'); m.innerHTML = '<div class="modal' + (wide ? ' wide' : '') + '" role="dialog">' + html + '</div>'; document.body.appendChild(m); return m; }
  function closeModal() { var m = document.querySelector('[data-modal]'); if (m) m.remove(); }
  function joinDlg(then) {
    var d = S.d, saved = lsGet() || {};
    var m = modal('<div class="m-h"><h3>이름 입력하고 참여하기</h3><button type="button" class="ib" data-act="mclose" aria-label="닫기">' + ico('x') + '</button></div><form id="jf" novalidate><div class="m-b">' +
      '<p class="muted sm" style="margin:0">이름은 변경 이력과 담당 표시에 쓰입니다. PIN(숫자 4자리)을 만들면 다른 사람이 그 이름을 쓸 수 없고, 다른 기기에서도 같은 이름으로 들어올 수 있습니다. PIN은 선택입니다.</p>' +
      '<label class="f">이름 (1~20자)<input type="text" id="jn" maxlength="20" required value="' + esc(saved.name || '') + '" autocomplete="off"></label>' +
      '<label class="f">소속<select id="jo">' + d.room.orgs.map(function (o) { return '<option value="' + esc(o.k) + '"' + (saved.org === o.k ? ' selected' : '') + '>' + esc(o.n) + '</option>'; }).join('') + '<option value="">기타</option></select></label>' +
      '<label class="f">PIN (선택, 숫자 4자리) — 이미 PIN이 있는 이름이면 그 PIN을 입력하십시오<input type="password" id="jp" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="비워도 됩니다"></label>' +
      '<div class="err-box hide" id="je"></div></div><div class="m-f"><button type="button" class="btn gray" data-act="mclose">취소</button><button type="submit" class="btn">참여</button></div></form>');
    $('#jn', m).focus();
    $('#jf', m).onsubmit = function (e) {
      e.preventDefault(); var er = $('#je', m), nm = $('#jn', m).value.trim(), pin = $('#jp', m).value.trim();
      function bad(t) { er.textContent = t; er.classList.remove('hide'); }
      if (!nm) return bad('이름을 입력해 주십시오.'); if (pin && !/^[0-9]{4}$/.test(pin)) return bad('PIN은 숫자 4자리여야 합니다.');
      rpc('rm_join', { p_name: nm, p_org: $('#jo', m).value, p_pin: pin }).then(function (r) {
        if (r.error === 'PIN_WRONG') return bad('PIN이 맞지 않습니다. 이 이름은 PIN으로 보호되어 있습니다. 다른 이름을 쓰거나 PIN을 입력해 주십시오.');
        if (r.error === 'PIN_LOCKED') return bad('PIN을 여러 번 틀려 15분간 잠겼습니다. 잠시 후 다시 시도해 주십시오.');
        S.ptok = r.ptok; S.me = r.me; lsSet({ ptok: r.ptok, name: r.me.name, org: r.me.org });
        closeModal(); toast(r.me.name + '님, 참여했습니다.'); return sync(true).then(function () { if (then) then(); });
      }).catch(function (x) { bad(x.message); });
    };
  }
  function pinDlg() {
    var m = modal('<div class="m-h"><h3>PIN 만들기</h3><button type="button" class="ib" data-act="mclose" aria-label="닫기">' + ico('x') + '</button></div><form id="pf"><div class="m-b"><p class="muted sm" style="margin:0">숫자 4자리를 정하면 이 이름은 PIN이 있는 사람만 쓸 수 있습니다. 잊으면 복구할 수 없으니 기억해 두십시오.</p><label class="f">PIN<input type="password" id="pp" inputmode="numeric" maxlength="4" autocomplete="off"></label><div class="err-box hide" id="pe"></div></div><div class="m-f"><button type="button" class="btn gray" data-act="mclose">취소</button><button type="submit" class="btn">저장</button></div></form>');
    $('#pf', m).onsubmit = function (e) {
      e.preventDefault(); var v = $('#pp', m).value.trim(), er = $('#pe', m);
      if (!/^[0-9]{4}$/.test(v)) { er.textContent = 'PIN은 숫자 4자리여야 합니다.'; er.classList.remove('hide'); return; }
      rpc('rm_pin_set', { p_pin: v }, true).then(function () { closeModal(); toast('PIN을 만들었습니다.'); sync(true); }).catch(function (x) { er.textContent = x.message; er.classList.remove('hide'); });
    };
  }
  function taskDlg(t) {
    var d = S.d, r = d.room, isNew = !t, ro = !canWrite() || !S.ptok;
    var T = t || { title: '', org: S.me ? S.me.org : '', track: '', stage: 0, assignee: '', due: '', note: '', items: [] };
    var fl = t ? d.files.filter(function (f) { return f.task_id === t.id; }) : [];
    function row(i) { return '<div class="it"><input type="checkbox" data-ci' + (i.done ? ' checked' : '') + (ro ? ' disabled' : '') + ' aria-label="완료"><input type="text" data-ct maxlength="120" value="' + esc(i.t) + '"' + (ro ? ' disabled' : '') + ' data-id="' + esc(i.id || '') + '">' + (ro ? '' : '<button type="button" class="ib" data-rm aria-label="항목 삭제">' + ico('x') + '</button>') + '</div>'; }
    var m = modal('<div class="m-h"><h3>' + (isNew ? '업무 추가' : '업무') + '</h3><button type="button" class="ib" data-act="mclose" aria-label="닫기">' + ico('x') + '</button></div><form id="tf" novalidate><div class="m-b">' +
      (ro && S.d.room.mode === 'rw' ? '<div class="note">고치려면 먼저 이름을 입력해 참여해 주십시오. <button type="button" class="btn xs" data-act="join2">참여하기</button></div>' : '') +
      '<label class="f">업무명<input type="text" id="tt" maxlength="120" required value="' + esc(T.title) + '"' + (ro ? ' disabled' : '') + '></label>' +
      '<div class="grid2"><label class="f">소속<select id="to"' + (ro ? ' disabled' : '') + '>' + r.orgs.map(function (o) { return '<option value="' + esc(o.k) + '"' + (T.org === o.k ? ' selected' : '') + '>' + esc(o.n) + '</option>'; }).join('') + '<option value=""' + (!T.org ? ' selected' : '') + '>미정</option></select></label>' +
      '<label class="f">분과<select id="tr"' + (ro ? ' disabled' : '') + '><option value="">미정</option>' + r.tracks.map(function (x) { return '<option' + (T.track === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f">단계<select id="ts"' + (ro ? ' disabled' : '') + '>' + r.stages.map(function (x, i) { return '<option value="' + i + '"' + (T.stage === i ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f">마감일<input type="date" id="td" value="' + esc(T.due || '') + '"' + (ro ? ' disabled' : '') + '></label></div>' +
      '<label class="f">담당 (PIN 표시는 이름이 보호된 사람)<select id="ta"' + (ro ? ' disabled' : '') + '><option value="">미정</option>' + d.persons.map(function (p) { return '<option value="' + esc(p.id) + '"' + (T.assignee === p.id ? ' selected' : '') + '>' + esc(p.name) + (p.pin ? ' (PIN)' : '') + '</option>'; }).join('') + '</select></label>' +
      '<label class="f">메모<textarea id="tn" maxlength="2000"' + (ro ? ' disabled' : '') + '>' + esc(T.note) + '</textarea></label>' +
      '<div class="f">체크리스트<div class="ck" id="tc">' + T.items.map(row).join('') + '</div>' + (ro ? '' : '<div style="display:flex;gap:6px;margin-top:4px"><input type="text" id="tni" maxlength="120" placeholder="항목 입력 후 Enter"><button type="button" class="btn xs sub" data-act="additem">추가</button></div>') + '</div>' +
      (t ? '<div class="f">첨부 파일<div class="ck">' + (fl.length ? fl.map(function (f) { return '<div class="it"><button type="button" class="btn xs gray" data-file="' + esc(f.id) + '">' + esc(f.name) + '</button><span class="muted sm">' + size(f.size) + '</span></div>'; }).join('') : '<span class="muted sm">없음</span>') + '</div>' + (!ro && r.upload_on ? '<button type="button" class="btn xs sub" data-act="taskup" style="align-self:flex-start;margin-top:4px">' + ico('up') + '이 업무에 파일 올리기</button>' : '') + '</div>' : '') +
      '<div class="err-box hide" id="te"></div></div><div class="m-f">' + (t && !ro ? '<button type="button" class="btn red" data-act="taskdel" style="margin-right:auto">삭제</button>' : '') + '<button type="button" class="btn gray" data-act="mclose">닫기</button>' + (ro ? '' : '<button type="submit" class="btn">저장</button>') + '</div></form>');
    m._task = t; var tc = $('#tc', m);
    function addItem() { var i = $('#tni', m); if (!i || !i.value.trim()) return; tc.insertAdjacentHTML('beforeend', row({ t: i.value.trim(), done: false, id: '' })); i.value = ''; }
    m.addEventListener('click', function (e) {
      var rm = e.target.closest('[data-rm]'); if (rm) rm.parentNode.remove();
      var a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'additem') addItem();
      if (a.dataset.act === 'join2') { closeModal(); joinDlg(function () { taskDlg(t); }); }
      if (a.dataset.act === 'taskup') { pickFiles(t.id); }
      if (a.dataset.act === 'taskdel') { closeModal(); confirmDlg('「' + t.title + '」 업무를 삭제하시겠습니까? 휴지통에서 복구할 수 있습니다.', function () { rpc('rm_trash', { p_kind: 'task', p_id: t.id, p_flag: true }, true).then(function () { toast('휴지통으로 옮겼습니다.'); sync(true); }).catch(fail); }); }
    });
    if ($('#tni', m)) $('#tni', m).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });
    $('#tf', m).onsubmit = function (e) {
      e.preventDefault(); if (ro) return; var er = $('#te', m), title = $('#tt', m).value.trim();
      if (!title) { er.textContent = '업무명을 입력해 주십시오.'; er.classList.remove('hide'); return; }
      var items = Array.prototype.map.call(tc.querySelectorAll('.it'), function (it) { return { id: $('[data-ct]', it).dataset.id || '', t: $('[data-ct]', it).value, done: $('[data-ci]', it).checked }; });
      var p = { title: title, org: $('#to', m).value, track: $('#tr', m).value, stage: +$('#ts', m).value, assignee: $('#ta', m).value || null, due: $('#td', m).value || null, note: $('#tn', m).value, items: items };
      if (t) { p.id = t.id; p.ver = t.ver; }
      rpc('rm_task_save', { p: p }, true).then(function () { closeModal(); toast(isNew ? '업무를 추가했습니다.' : '저장했습니다.'); return sync(true); }).catch(function (x) { if (x.code === 'CONFLICT') closeModal(); fail(x); er.textContent = x.message; er.classList.remove('hide'); });
    };
  }
  function decDlg(x) {
    var org0 = S.me ? S.me.org : 'all', cur = x ? S.d.decisions.filter(function (z) { return z.id === x; })[0] : null;
    var m = modal('<div class="m-h"><h3>' + (cur ? '결정 수정' : '결정 기록') + '</h3><button type="button" class="ib" data-act="mclose" aria-label="닫기">' + ico('x') + '</button></div><form id="df"><div class="m-b"><label class="f">한 줄 결정 (300자 이내)<textarea id="dx" maxlength="300">' + esc(cur ? cur.text : '') + '</textarea></label><label class="f">관련 소속<select id="do">' + S.d.room.orgs.map(function (o) { return '<option value="' + esc(o.k) + '"' + ((cur ? cur.org : org0) === o.k ? ' selected' : '') + '>' + esc(o.n) + '</option>'; }).join('') + '</select></label><p class="muted sm" style="margin:0">수정하면 이전 문구가 이력으로 남습니다.</p><div class="err-box hide" id="de"></div></div><div class="m-f"><button type="button" class="btn gray" data-act="mclose">취소</button><button type="submit" class="btn">저장</button></div></form>');
    $('#df', m).onsubmit = function (e) {
      e.preventDefault(); var v = $('#dx', m).value.trim(), er = $('#de', m); if (!v) { er.textContent = '내용을 입력해 주십시오.'; er.classList.remove('hide'); return; }
      rpc('rm_decision_save', { p_id: cur ? cur.id : null, p_text: v, p_org: $('#do', m).value }, true).then(function () { closeModal(); toast('기록했습니다.'); sync(true); }).catch(function (z) { er.textContent = z.message; er.classList.remove('hide'); });
    };
  }
  function confirmDlg(msg, ok) {
    var m = modal('<div class="m-h"><h3>확인</h3></div><div class="m-b"><p style="margin:0">' + esc(msg) + '</p></div><div class="m-f"><button type="button" class="btn gray" data-act="mclose">취소</button><button type="button" class="btn red" id="cok">진행</button></div>');
    $('#cok', m).onclick = function () { closeModal(); ok(); };
  }
  function fileDlg(id) {
    var f = S.d.files.filter(function (x) { return x.id === id; })[0]; if (!f) return;
    var m = modal('<div class="m-h"><h3>' + esc(f.name) + '</h3><button type="button" class="ib" data-act="mclose" aria-label="닫기">' + ico('x') + '</button></div><div class="m-b"><div class="pv" id="pv"><span class="muted">불러오는 중…</span></div><div class="muted sm">' + size(f.size) + ' · 올린 사람 ' + esc(f.by || '') + ' · ' + dt(f.at) + '</div></div><div class="m-f">' + (canWrite() ? '<button type="button" class="btn red" id="fdel" style="margin-right:auto">삭제</button>' : '') + '<button type="button" class="btn gray" data-act="mclose">닫기</button><a class="btn" id="fdl" href="#" rel="noopener noreferrer" target="_blank">' + ico('dl') + '내려받기</a></div>', true);
    urlOf(id).then(function (u) {
      var pv = $('#pv', m); if (!pv) return;
      pv.innerHTML = f.kind === 'img' ? '<img alt="' + esc(f.name) + '" src="' + esc(u) + '">' : f.kind === 'pdf' ? '<iframe title="' + esc(f.name) + '" src="' + esc(u) + '"></iframe><a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">PDF가 보이지 않으면 새 탭에서 열기</a>' : '<div class="empty">이 형식은 미리보기를 지원하지 않습니다. 내려받아 열어 주십시오.</div>';
      $('#fdl', m).href = u + (u.indexOf('?') >= 0 ? '&' : '?') + 'download=' + encodeURIComponent(f.name);
    }).catch(function (e) { var pv = $('#pv', m); if (pv) pv.innerHTML = '<div class="err-box">' + esc(e.message) + '</div>'; });
    if ($('#fdel', m)) $('#fdel', m).onclick = function () { closeModal(); rpc('rm_trash', { p_kind: 'file', p_id: id, p_flag: true }, true).then(function () { toast('휴지통으로 옮겼습니다.'); sync(true); }).catch(fail); };
  }

  /* ---------- 이벤트 ---------- */
  function trashOp(kind, id, flag) { if (!need()) return; rpc('rm_trash', { p_kind: kind, p_id: id, p_flag: flag }, true).then(function () { toast(flag ? '휴지통으로 옮겼습니다.' : '복구했습니다.'); sync(true); }).catch(fail); }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-act]');
    if (a) {
      var n = a.dataset.act;
      if (n === 'mclose') return closeModal();
      if (n === 'join') return joinDlg();
      if (n === 'pin') return pinDlg();
      if (n === 'leave') { S.ptok = null; S.me = null; lsSet(null); toast('나갔습니다.'); return sync(true); }
      if (n === 'copy') { var u = location.origin + location.pathname + '?r=' + ROOM; if (navigator.clipboard) navigator.clipboard.writeText(u).then(function () { toast('링크를 복사했습니다.'); }, function () { toast('복사하지 못했습니다. 주소창의 링크를 직접 복사해 주십시오.', true); }); return; }
      if (n === 'newtask') { if (need(function () { taskDlg(null); })) taskDlg(null); return; }
      if (n === 'newdec') { if (need(function () { decDlg(null); })) decDlg(null); return; }
      if (n === 'pick') { if (need(function () { pickFiles(null); })) pickFiles(null); return; }
      if (n === 'bn') { Notification.requestPermission().then(function () { sidebar(); }); return; }
      if (n === 'readall') { rpc('rm_notice_read', { p_ids: null }, true).then(function () { sync(true); }).catch(fail); return; }
      return;
    }
    var o = e.target.closest('[data-org]'); if (o && !o.closest('[data-modal]')) { S.f.org = o.dataset.org; render(); return; }
    var dc = e.target.closest('[data-decedit]'); if (dc) { decDlg(dc.dataset.decedit); return; }
    var tr = e.target.closest('[data-trash]'); if (tr) { var p = tr.dataset.trash.split(':'); trashOp(p[0], p[1], true); return; }
    var rs = e.target.closest('[data-restore]'); if (rs) { var q = rs.dataset.restore.split(':'); trashOp(q[0], q[1], false); return; }
    var fl = e.target.closest('[data-file]'); if (fl) { if (fl.closest('[data-modal]')) closeModal(); fileDlg(fl.dataset.file); return; }
    var op = e.target.closest('[data-open]'); if (op && op.dataset.open) {
      var t = S.d.tasks.filter(function (x) { return x.id === op.dataset.open; })[0]; if (t) taskDlg(t); return;
    }
    var sh = e.target.closest('.shade'); if (sh && e.target === sh) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.tk[data-open]')) { e.preventDefault(); var t = S.d.tasks.filter(function (x) { return x.id === e.target.dataset.open; })[0]; if (t) taskDlg(t); }
  });
  /* 칸반 끌어놓기 */
  var dragId = null;
  document.addEventListener('dragstart', function (e) { var c = e.target.closest && e.target.closest('[data-drag]'); if (c) { dragId = c.dataset.drag; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (x) { /* 무시 */ } } });
  document.addEventListener('dragover', function (e) { var c = e.target.closest && e.target.closest('[data-col]'); if (c && dragId) { e.preventDefault(); c.classList.add('over'); } });
  document.addEventListener('dragleave', function (e) { var c = e.target.closest && e.target.closest('[data-col]'); if (c) c.classList.remove('over'); });
  document.addEventListener('dragend', function () { dragId = null; document.querySelectorAll('.col.over').forEach(function (x) { x.classList.remove('over'); }); });
  document.addEventListener('drop', function (e) {
    var c = e.target.closest && e.target.closest('[data-col]'); if (!c || !dragId) return; e.preventDefault();
    var t = S.d.tasks.filter(function (x) { return x.id === dragId; })[0], to = +c.dataset.col; dragId = null;
    document.querySelectorAll('.col.over').forEach(function (x) { x.classList.remove('over'); });
    if (!t || t.stage === to) return; if (!need()) return;
    rpc('rm_task_stage', { p_id: t.id, p_stage: to, p_ver: t.ver }, true).then(function () { return sync(true); }).catch(fail);
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.d) sync(false); });

  /* ---------- 시작 ---------- */
  if (!/^[a-z0-9]{20,64}$/.test(ROOM)) { screen('업무방 링크가 올바르지 않습니다. 관리자에게 받은 전체 주소로 접속해 주십시오.'); return; }
  var saved = lsGet(); if (saved && saved.ptok) { S.ptok = saved.ptok; }
  sync(true).then(function () { if (S.d) start(); });
})();
