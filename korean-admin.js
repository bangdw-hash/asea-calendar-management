'use strict';
/* 시윤이 한글놀이 — 보호자(관리자) 메뉴: 비밀번호, 프로필, 학습 설정, 학습 기록 */
(function () {
  var KA = window.KA, K = KA.K, S = KA.S, ICON = KA.ICON, $ = KA.$, esc = KA.esc;
  // 서버(Supabase kor 스키마)를 사용할 수 없을 때만 쓰는 기기 내 비밀번호 확인값(SHA-256)
  var LOCAL_HASH = 'e84d5e7bd479c1b4491123e8a9e0cfef4eabf88f8a4deb580096cb543b58774c';

  function sha256(s) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }
  function ov() { return $('#ov'); }
  function close() { ov().hidden = true; ov().innerHTML = ''; ov().onclick = null; document.removeEventListener('keydown', keyH); }

  /* ───────── 비밀번호 입력 ───────── */
  var pinCb = null, pin = '';
  function keyH(e) {
    if (!pinCb) return;
    if (/^\d$/.test(e.key)) addDigit(e.key); else if (e.key === 'Backspace') { pin = pin.slice(0, -1); paintPin(); } else if (e.key === 'Enter') submitPin();
  }
  function addDigit(d) { if (pin.length < 8) { pin += d; paintPin(); } }
  function paintPin() { var el = $('#pindots'); if (el) el.innerHTML = Array.apply(null, Array(Math.max(4, pin.length))).map(function (_, i) { return '<i class="' + (i < pin.length ? 'on' : '') + '"></i>'; }).join(''); }
  function submitPin() {
    var p = pin; if (p.length < 4) return;
    var err = $('#pinerr'); if (err) err.textContent = '확인 중';
    KA.rpc('kor_admin_login', { p_pw: p }).then(function (r) {
      if (r && r.ok) { S.token = r.token; S.server = true; try { sessionStorage.setItem('kor_tok', r.token); } catch (e) { /* 무시 */ } done(true); }
      else { pin = ''; paintPin(); if (err) err.textContent = r && r.locked ? '잠시 후 다시 시도해 주세요 (10분)' : '비밀번호가 맞지 않아요'; }
    }).catch(function () {
      // 서버 연결 불가: 이 기기 확인값으로 대체
      sha256('asea-kor-v1:' + p).then(function (h) {
        if (h === LOCAL_HASH) { S.token = null; S.server = false; done(true); }
        else { pin = ''; paintPin(); if (err) err.textContent = '비밀번호가 맞지 않아요'; }
      });
    });
  }
  function done(ok) { var cb = pinCb; pinCb = null; close(); if (cb) cb(ok); }

  KA.pinPad = function (cb) {
    pinCb = cb; pin = '';
    var o = ov(); o.hidden = false;
    var keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button data-d="' + n + '">' + n + '</button>'; }).join('');
    o.innerHTML = '<div class="sheet" style="width:min(100%,380px);text-align:center"><h3>보호자 확인</h3><div class="pin" id="pindots"></div><div class="err" id="pinerr"></div>' +
      '<div class="pad">' + keys + '<button data-x="back" aria-label="지우기">' + ICON.back + '</button><button data-d="0">0</button><button data-x="ok" aria-label="확인">' + ICON.check + '</button></div>' +
      '<button class="btn ghost sm" data-x="cancel">닫기</button></div>';
    paintPin();
    o.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.d) addDigit(b.dataset.d);
      else if (b.dataset.x === 'back') { pin = pin.slice(0, -1); paintPin(); }
      else if (b.dataset.x === 'ok') submitPin();
      else if (b.dataset.x === 'cancel') { var cb2 = pinCb; pinCb = null; close(); if (cb2) cb2(false); }
    };
    document.addEventListener('keydown', keyH);
  };

  KA.openAdmin = function () {
    KA.stopAudio();
    var tok = null; try { tok = sessionStorage.getItem('kor_tok'); } catch (e) { /* 무시 */ }
    if (tok || S.token) { S.token = S.token || tok; S.server = !!S.token; panel(); }
    else KA.pinPad(function (ok) { if (ok) panel(); });
  };

  /* ───────── 관리자 패널 ───────── */
  var draft, profiles = [], tab = 'set';
  function panel() {
    draft = KA.copy(S.settings);
    var p = S.server && S.token ? KA.rpc('kor_profiles_list', { p_token: S.token }).then(function (l) { profiles = l || []; }).catch(function () { S.server = false; S.token = null; try { sessionStorage.removeItem('kor_tok'); } catch (e) { /* 무시 */ } profiles = []; }) : Promise.resolve();
    p.then(function () {
      // 프로필이 하나뿐이고 아직 연결 전이면 자동으로 이 기기에 연결
      if (S.server && !S.pid && profiles.length === 1) {
        S.pid = profiles[0].id; KA.LS.set('kor_pid', S.pid);
        return KA.loadProfile().then(function () { $('#whoName').textContent = S.name; draft = KA.copy(S.settings); });
      }
    }).then(function () { ov().hidden = false; draw(); });
  }
  function chk(name, val, on, label, type) { return '<label><input type="' + (type || 'checkbox') + '" name="' + name + '" value="' + val + '"' + (on ? ' checked' : '') + '>' + label + '</label>'; }
  function letterChips(list, key, on) { return list.map(function (c) { return chk(key, c.ch, on.indexOf(c.ch) >= 0, c.ch); }).join(''); }

  function draw() {
    var o = ov();
    var h = '<div class="sheet full"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0">보호자 메뉴</h3><button class="btn ghost sm" data-a="close">닫기</button></div>';
    h += '<div class="seg"><button data-tab="set" class="' + (tab === 'set' ? 'on' : '') + '">설정</button><button data-tab="rec" class="' + (tab === 'rec' ? 'on' : '') + '">학습 기록</button></div>';
    if (tab === 'rec') { o.innerHTML = h + '<div id="rec" class="sub">불러오는 중</div></div>'; bind(); loadRec(); return; }

    h += '<div class="asec"><h4>프로필 · 저장 위치</h4>';
    if (S.server) {
      h += '<div class="sub" style="margin-bottom:8px">서버(Supabase)에 학습 기록이 저장됩니다. 이 기기에 연결할 프로필을 선택하세요.</div><div class="opt2">' +
        profiles.map(function (p) { return chk('prof', p.id, p.id === S.pid, esc(p.name), 'radio'); }).join('') + '</div>' +
        '<div class="row" style="margin-top:10px"><input type="text" id="newName" placeholder="새 프로필 이름(별명)" maxlength="20" style="flex:1"><button class="btn sm" data-a="addprof">추가</button></div>' +
        (S.pid ? '<div class="row" style="margin-top:10px"><input type="text" id="renName" value="' + esc(S.name) + '" maxlength="20" style="flex:1"><button class="btn sec sm" data-a="rename">이름 변경</button><button class="btn danger sm" data-a="delprof">삭제</button></div>' : '');
    } else {
      h += '<div class="sub">서버에 연결되지 않아 이 기기에만 저장됩니다(로컬 모드). 서버 설정이 끝나면 프로필을 연결할 수 있습니다.</div>' +
        '<div class="row" style="margin-top:8px"><input type="text" id="localName" value="' + esc(S.name) + '" maxlength="20" style="flex:1"></div>';
    }
    h += '</div>';

    h += '<div class="asec"><h4>학습 단위 (복수 선택)</h4><div class="opt2">' +
      chk('unit', 'name', draft.units.indexOf('name') >= 0, '자모 이름 (기역)') + chk('unit', 'sound', draft.units.indexOf('sound') >= 0, '자모 소리 (그)') +
      chk('unit', 'syll', draft.units.indexOf('syll') >= 0, '음절 (가)') + chk('unit', 'word', draft.units.indexOf('word') >= 0, '낱말 (가방)') + '</div></div>';

    h += '<div class="asec"><h4>열린 글자</h4><div class="opt2">' + letterChips(K.C, 'open', draft.unlocked) + '</div><div class="opt2" style="margin-top:8px">' + letterChips(K.V, 'open', draft.unlocked) + '</div>' +
      '<div class="opt2" style="margin-top:8px">' + chk('auto', '1', draft.autoUnlock, '익히면 자동으로 새 글자 열기') + '</div></div>';

    h += '<div class="asec"><h4>복습 방식</h4><div class="opt2">' +
      chk('rev', '1', draft.review === 1, '① 같은 글자 반복', 'radio') + chk('rev', '2', draft.review === 2, '② 어제 글자 + 새 글자', 'radio') + chk('rev', '3', draft.review === 3, '③ 자동 섞기(약한 글자 우선)', 'radio') + '</div>' +
      '<div class="sub" style="margin:8px 0 4px">① 선택 시 반복할 글자</div><div class="opt2">' + draft.unlocked.map(function (c) { return chk('focus', c, draft.focus.indexOf(c) >= 0, c); }).join('') + '</div></div>';

    h += '<div class="asec"><h4>놀이 설정</h4>' +
      row('선택지 수', ['2', '3', '4'].map(function (v) { return chk('choices', v, draft.choices === +v, v + '개', 'radio'); })) +
      row('한 판 문항', ['3', '5', '7'].map(function (v) { return chk('rounds', v, draft.rounds === +v, v + '문항', 'radio'); })) +
      row('하루 사용 시간', ['3', '5', '7', '10', '15', '20'].map(function (v) { return chk('smin', v, draft.sessionMin === +v, v + '분', 'radio'); })) +
      row('낱말 조립', [chk('bl', '1', draft.buildLevel === 1, '음절 조각', 'radio'), chk('bl', '2', draft.buildLevel === 2, '자음·모음 조각', 'radio')]) +
      row('쓰기 판정', [chk('tol', 'easy', draft.tol === 'easy', '쉬움', 'radio'), chk('tol', 'normal', draft.tol === 'normal', '보통', 'radio'), chk('tol', 'hard', draft.tol === 'hard', '어려움', 'radio')]) +
      '<div class="sub" style="margin-top:8px">음성 속도 <b id="spv">' + draft.speed.toFixed(2) + '</b></div><input type="range" id="speed" min="0.7" max="1.1" step="0.05" value="' + draft.speed + '">' +
      '<div class="sub" style="margin-top:8px">음량 <b id="vov">' + Math.round(draft.volume * 100) + '%</b></div><input type="range" id="vol" min="0.2" max="1" step="0.05" value="' + draft.volume + '"></div>';

    if (S.server) h += '<div class="asec"><h4>비밀번호 변경</h4><div class="row"><input type="password" id="newPw" inputmode="numeric" maxlength="8" placeholder="숫자 4~8자리" style="flex:1"><button class="btn sec sm" data-a="pw">변경</button></div></div>';

    h += '<div class="row" style="position:sticky;bottom:0;background:#fff;padding:10px 0"><button class="btn" data-a="save">' + ICON.check + '저장</button><button class="btn ghost" data-a="lockout">잠금</button></div></div>';
    o.innerHTML = h; bind();
  }
  function row(label, inner) { return '<div class="sub" style="margin:10px 0 4px">' + label + '</div><div class="opt2">' + inner.join('') + '</div>'; }

  function collect() {
    var o = ov(), v = function (n) { return Array.prototype.map.call(o.querySelectorAll('input[name=' + n + ']:checked'), function (x) { return x.value; }); };
    var d = draft;
    d.units = v('unit'); if (!d.units.length) d.units = ['sound'];
    var op = v('open'); d.unlocked = K.CORDER.concat(K.VORDER).filter(function (c) { return op.indexOf(c) >= 0; }); if (!d.unlocked.length) d.unlocked = ['ㄱ'];
    d.autoUnlock = !!v('auto').length;
    d.review = +(v('rev')[0] || 2); d.focus = v('focus').filter(function (c) { return d.unlocked.indexOf(c) >= 0; }); if (!d.focus.length) d.focus = [d.unlocked[d.unlocked.length - 1]];
    d.choices = +(v('choices')[0] || 2); d.rounds = +(v('rounds')[0] || 5); d.sessionMin = +(v('smin')[0] || 7); d.buildLevel = +(v('bl')[0] || 1); d.tol = v('tol')[0] || 'normal';
    d.speed = +$('#speed').value; d.volume = +$('#vol').value;
  }
  function bind() {
    var o = ov();
    var sp = $('#speed'), vo = $('#vol');
    if (sp) sp.oninput = function () { $('#spv').textContent = (+sp.value).toFixed(2); };
    if (vo) vo.oninput = function () { $('#vov').textContent = Math.round(vo.value * 100) + '%'; };
    o.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tab) { if (tab === 'set' && $('#speed')) collect(); tab = b.dataset.tab; draw(); return; }
      var a = b.dataset.a;
      if (a === 'close') { close(); }
      else if (a === 'lockout') { S.token = null; try { sessionStorage.removeItem('kor_tok'); } catch (x) { /* 무시 */ } close(); KA.toast('잠겼어요'); }
      else if (a === 'save') save();
      else if (a === 'addprof') addProf();
      else if (a === 'rename') rename();
      else if (a === 'delprof') delProf();
      else if (a === 'pw') changePw();
    };
    o.onchange = function (e) {
      var t = e.target;
      if (t.name === 'prof') { selectProf(t.value); }
    };
  }

  function save() {
    collect();
    S.settings = Object.assign({}, KA.DEF, draft);
    KA.LS.set('kor_settings', S.settings);
    var ln = $('#localName'); if (ln && ln.value.trim()) { S.name = ln.value.trim().slice(0, 20); KA.LS.set('kor_name', S.name); $('#whoName').textContent = S.name; }
    if (S.server && S.token && S.pid) {
      KA.rpc('kor_profile_save', { p_token: S.token, p_id: S.pid, p_name: S.name, p_settings: S.settings }).then(function () { KA.toast('저장했어요'); close(); KA.show(); KA.setSync('ok'); })
        .catch(function (e) { KA.toast('서버 저장 실패: ' + e.message + ' (기기에는 저장됨)'); close(); KA.show(); });
    } else { KA.toast('이 기기에 저장했어요'); close(); KA.show(); }
  }
  function selectProf(id) {
    collect();
    var p = profiles.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    S.pid = id; KA.LS.set('kor_pid', id); S.progress = {}; S.pending = {}; S.stickers = [];
    KA.loadProfile().then(function () { $('#whoName').textContent = S.name; draft = KA.copy(S.settings); draw(); KA.toast(S.name + ' 프로필을 연결했어요'); });
  }
  function addProf() {
    var n = ($('#newName').value || '').trim(); if (!n) { KA.toast('이름을 입력하세요'); return; }
    collect();
    KA.rpc('kor_profile_save', { p_token: S.token, p_id: null, p_name: n, p_settings: draft }).then(function (p) {
      profiles.push(p); S.pid = p.id; KA.LS.set('kor_pid', p.id); S.name = p.name; S.progress = {}; S.stickers = []; $('#whoName').textContent = S.name; draw(); KA.toast('프로필을 만들었어요');
    }).catch(function (e) { KA.toast('실패: ' + e.message); });
  }
  function rename() {
    var n = ($('#renName').value || '').trim(); if (!n) return; collect();
    KA.rpc('kor_profile_save', { p_token: S.token, p_id: S.pid, p_name: n, p_settings: null }).then(function (p) { S.name = p.name; $('#whoName').textContent = S.name; profiles.forEach(function (x) { if (x.id === p.id) x.name = p.name; }); draw(); KA.toast('이름을 바꿨어요'); })
      .catch(function (e) { KA.toast('실패: ' + e.message); });
  }
  function delProf() {
    if (!confirm('이 프로필과 학습 기록을 모두 삭제할까요?')) return;
    KA.rpc('kor_profile_delete', { p_token: S.token, p_id: S.pid }).then(function () {
      profiles = profiles.filter(function (x) { return x.id !== S.pid; }); S.pid = null; KA.LS.set('kor_pid', null); S.progress = {}; S.stickers = []; draw(); KA.toast('삭제했어요');
    }).catch(function (e) { KA.toast('실패: ' + e.message); });
  }
  function changePw() {
    var p = $('#newPw').value;
    if (!/^\d{4,8}$/.test(p)) { KA.toast('숫자 4~8자리로 입력하세요'); return; }
    KA.rpc('kor_pw_change', { p_token: S.token, p_new: p }).then(function () { $('#newPw').value = ''; KA.toast('비밀번호를 바꿨어요'); }).catch(function (e) { KA.toast('실패: ' + e.message); });
  }

  /* ───────── 학습 기록 ───────── */
  function loadRec() {
    var pr = S.server && S.token && S.pid ? KA.rpc('kor_report', { p_token: S.token, p_pid: S.pid }) : Promise.resolve({
      progress: Object.keys(S.progress).map(function (k) { var p = S.progress[k]; return { key: k, tries: p.tries, correct: p.correct, stars: p.stars }; }), sessions: [], stickers: S.stickers
    });
    pr.then(function (r) {
      var m = {}; r.progress.forEach(function (p) { m[p.key] = p; });
      function g(k) { return m[k] || { tries: 0, correct: 0, stars: 0 }; }
      var h = '<div class="sub" style="margin-bottom:8px">' + esc(S.name) + ' · 스티커 ' + (r.stickers || []).length + '개 · 데이터: ' + (S.server && S.pid ? '서버' : '이 기기') + '</div>' +
        '<table class="tbl"><tr><th>글자</th><th>쓰기</th><th>이름</th><th>소리</th><th>음절</th><th>첫소리</th><th>모양</th></tr>';
      K.C.concat(K.V).forEach(function (l) {
        var c = l.ch, w = g('wc:' + c);
        if (!KA.isOpen(c) && !w.tries) return;
        function acc(k) { var p = g(k); return p.tries ? p.correct + '/' + p.tries : '-'; }
        h += '<tr><td style="color:' + l.color + ';font-weight:900;font-size:18px">' + c + '</td><td>' + (w.stars ? '★'.repeat(w.stars) : '-') + '</td><td>' + acc('n:' + c) + '</td><td>' + acc('s:' + c) + '</td><td>' + acc('y:' + c) + '</td><td>' + acc('f:' + c) + '</td><td>' + acc('m:' + c) + '</td></tr>';
      });
      h += '</table>';
      var words = r.progress.filter(function (p) { return /^(d|b|ww):/.test(p.key); });
      if (words.length) h += '<div class="h2">낱말</div><table class="tbl"><tr><th>낱말</th><th>활동</th><th>정답/시도</th><th>쓰기★</th></tr>' + words.map(function (p) { var t = p.key.split(':'); return '<tr><td>' + esc(t[1]) + '</td><td>' + ({ d: '소리 찾기', b: '조립', ww: '낱말 쓰기' }[t[0]]) + '</td><td>' + p.correct + '/' + p.tries + '</td><td>' + (p.stars || '-') + '</td></tr>'; }).join('') + '</table>';
      if (r.sessions && r.sessions.length) h += '<div class="h2">최근 학습</div><table class="tbl"><tr><th>일시</th><th>시간</th><th>문항</th></tr>' + r.sessions.slice(0, 10).map(function (s) { var d = new Date(s.at); return '<tr><td>' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + '</td><td>' + Math.round(s.seconds / 60) + '분</td><td>' + ((s.summary || {}).ok || 0) + '/' + ((s.summary || {}).q || 0) + '</td></tr>'; }).join('') + '</table>';
      $('#rec').innerHTML = h;
    }).catch(function (e) { $('#rec').textContent = '불러오지 못했어요: ' + e.message; });
  }

  // 로컬 모드 이름 복원
  var ln = KA.LS.get('kor_name', null); if (ln && !S.pid) S.name = ln;
})();
