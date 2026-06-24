/**
 * QR명함 모듈 — 내 QR명함 생성 + 받은 명함 관리 (OCR · CRM · 공유)
 */
window.QRCardModule = (function () {
  'use strict';

  var MY_PREFIX   = 'asea_qrcards_';
  var RECV_PREFIX = 'asea_recv_cards_';
  var _editingId  = null;
  var _recvEditId = null;
  var _activeSubTab = 'my';

  function _userEmail() {
    // 앱 전체와 동일한 이메일 출처 사용(GIS 로그인). 이래야 cloudsync 키와 일치해 기기 간 동기화됨.
    try { var e = localStorage.getItem('asea_user_email'); if (e) return e; } catch (_) {}
    try { return gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile().getEmail(); } catch (e) {}
    return 'local';
  }

  function _myKey()   { return MY_PREFIX   + _userEmail(); }
  function _rvKey()   { return RECV_PREFIX + _userEmail(); }
  function _myLoad()  { try { return JSON.parse(localStorage.getItem(_myKey())  || '[]'); } catch (e) { return []; } }
  function _rvLoad()  { try { return JSON.parse(localStorage.getItem(_rvKey())  || '[]'); } catch (e) { return []; } }
  function _mySave(a) { localStorage.setItem(_myKey(),  JSON.stringify(a)); }
  function _rvSave(a) { localStorage.setItem(_rvKey(),  JSON.stringify(a)); }

  // 과거 'local' 키(이메일 못 읽던 시절)에 저장된 명함을 현재 이메일 키로 1회 이관(합집합)
  function _migrateLegacy() {
    var em = '';
    try { em = localStorage.getItem('asea_user_email') || ''; } catch (_) {}
    if (!em || em === 'local') return;
    [MY_PREFIX, RECV_PREFIX].forEach(function (pfx) {
      var legacyKey = pfx + 'local', targetKey = pfx + em;
      if (legacyKey === targetKey) return;
      var lv = null; try { lv = localStorage.getItem(legacyKey); } catch (_) {}
      if (!lv) return;
      var la = []; try { la = JSON.parse(lv) || []; } catch (e) {}
      if (!la.length) { try { localStorage.removeItem(legacyKey); } catch (_) {} return; }
      var ta = []; try { ta = JSON.parse(localStorage.getItem(targetKey) || '[]') || []; } catch (e) {}
      var byId = {}, order = [];
      ta.concat(la).forEach(function (c) {
        var k = (c && c.id != null) ? ('id:' + c.id) : ('v:' + JSON.stringify(c));
        if (!(k in byId)) order.push(k);
        byId[k] = c;
      });
      localStorage.setItem(targetKey, JSON.stringify(order.map(function (k) { return byId[k]; })));
      try { localStorage.removeItem(legacyKey); } catch (_) {}
    });
  }

  function _uuid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function _h(s)   { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function _toVCard(c) {
    function esc(s) { return (s || '').replace(/[,;\\]/g, '\\$&'); }
    var lines = ['BEGIN:VCARD', 'VERSION:3.0', 'N:' + esc(c.name) + ';;;;', 'FN:' + esc(c.name)];
    if (c.org || c.dept) lines.push('ORG:' + esc(c.org) + ';' + esc(c.dept));
    if (c.title)      lines.push('TITLE:'  + esc(c.title));
    if (c.mobile)     lines.push('TEL;TYPE=CELL,VOICE:'  + c.mobile);
    if (c.workPhone)  lines.push('TEL;TYPE=WORK,VOICE:'  + c.workPhone);
    if (c.email)      lines.push('EMAIL;TYPE=INTERNET:'  + c.email);
    if (c.address)    lines.push('ADR:;;' + esc(c.address) + ';;;;');
    lines.push('END:VCARD');
    return lines.join('\r\n');
  }

  function _qrUrl(text, size) {
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size +
           '&color=111827&bgcolor=ffffff&data=' + encodeURIComponent(text);
  }
  function _renderQR(containerId, text, size) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var sz = size || 180;
    el.innerHTML = '';
    var img = document.createElement('img');
    img.width = sz; img.height = sz; img.style.display = 'block'; img.alt = 'QR';
    img.src = _qrUrl(text, sz);
    img.onerror = function () {
      el.innerHTML = '<div style="font-size:11px;color:#ef4444;padding:10px">QR 생성 실패</div>';
    };
    el.appendChild(img);
  }

  /* ══════════════════════════════════════════
     탭 메인
  ══════════════════════════════════════════ */
  function renderTab() {
    var panel = document.getElementById('tab-qrcard');
    if (!panel) return;
    _migrateLegacy();   // 과거 'local' 키 명함을 현재 이메일 키로 이관(동기화 가능하게)
    try { if (window.CloudSync && CloudSync.pull) CloudSync.pull(); } catch (e) {}   // 탭 열 때 최신본 즉시 가져오기
    panel.innerHTML =
      '<div class="tab-body">' +
        '<div style="display:flex;border-bottom:2px solid #e5e7eb;margin-bottom:24px;gap:4px">' +
          '<button id="qr-subtab-my" onclick="QRCardModule._switchSubTab(\'my\')"' +
            ' style="padding:10px 22px;font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:3px solid transparent;color:#6b7280;transition:all .15s">🪪 내 명함</button>' +
          '<button id="qr-subtab-recv" onclick="QRCardModule._switchSubTab(\'recv\')"' +
            ' style="padding:10px 22px;font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:3px solid transparent;color:#6b7280;transition:all .15s">📇 받은 명함</button>' +
        '</div>' +
        '<div id="qr-subtab-content"></div>' +
      '</div>';
    _switchSubTab(_activeSubTab);
  }

  function _switchSubTab(name) {
    _activeSubTab = name;
    ['my', 'recv'].forEach(function (t) {
      var btn = document.getElementById('qr-subtab-' + t);
      if (!btn) return;
      btn.style.borderBottomColor = t === name ? '#1D4ED8' : 'transparent';
      btn.style.color = t === name ? '#1D4ED8' : '#6b7280';
    });
    if (name === 'my')   _renderMyTab();
    if (name === 'recv') _renderRecvTab();
  }

  /* ══════════════════════════════════════════
     내 명함 탭
  ══════════════════════════════════════════ */
  function _renderMyTab() {
    var content = document.getElementById('qr-subtab-content');
    if (!content) return;
    var cards = _myLoad();
    var em = _userEmail();
    var acct = (em && em !== 'local')
      ? '🔗 동기화 계정: <b>' + _h(em) + '</b> — 다른 기기에서도 같은 계정으로 로그인하면 공유됩니다'
      : '⚠️ 로그인 계정을 못 읽어 <b>이 기기에만</b> 저장됩니다. 로그아웃 후 다시 로그인해 주세요.';
    content.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
        '<p style="font-size:13px;color:#6b7280">내 QR 명함을 만들어 상대방이 카메라로 스캔하면 연락처에 자동 저장됩니다</p>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn-ghost btn-sm" onclick="QRCardModule._syncNow()" title="다른 기기 변경사항 즉시 가져오기">🔄 동기화</button>' +
          '<button class="btn btn-primary" onclick="QRCardModule._openMyForm(null)">+ 새 명함</button>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:12px;color:#6b7280;margin-bottom:16px;padding:8px 10px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px">' + acct + '</div>' +
      '<div id="qrcard-list"></div>';
    _renderMyList(cards);
  }

  // 수동 동기화: 현재 명함을 서버로 올리고, 서버 최신본을 받아온다
  function _syncNow() {
    try {
      if (window.CloudSync) {
        if (CloudSync.push) { CloudSync.push(_myKey()); CloudSync.push(_rvKey()); }
        if (CloudSync.pull) CloudSync.pull();
        _toast('동기화를 요청했습니다. 잠시 후(1~3초) 자동 반영됩니다.');
      } else {
        _toast('동기화 모듈을 찾을 수 없습니다.');
      }
    } catch (e) { _toast('동기화 오류: ' + (e && e.message || e)); }
  }
  function _toast(m) { try { if (typeof window.aseaToast === 'function') window.aseaToast(m, 'info'); else alert(m); } catch (e) { alert(m); } }

  function _renderMyList(cards) {
    var list = document.getElementById('qrcard-list');
    if (!list) return;
    if (!cards.length) {
      list.innerHTML = '<div style="text-align:center;padding:60px 0;color:#9ca3af;font-size:14px">아직 QR 명함이 없습니다.<br>+ 새 명함 버튼으로 만들어보세요.</div>';
      return;
    }
    list.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px">' +
      cards.map(function (card) {
        var meta = [card.title, card.dept].filter(Boolean).join(' · ');
        return '<div class="settings-card" style="text-align:center;padding:20px">' +
          '<div style="font-weight:700;font-size:15px;margin-bottom:2px">' + _h(card.name) + '</div>' +
          '<div style="font-size:12px;color:#6b7280;margin-bottom:12px">' + _h(meta) + '</div>' +
          '<div id="qr-' + card.id + '" style="display:inline-block;margin-bottom:8px"></div>' +
          '<div style="font-size:11px;color:#9ca3af;margin-bottom:12px">카메라로 스캔 → 연락처 저장</div>' +
          '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
            '<button class="btn btn-primary btn-sm" onclick="QRCardModule._downloadMyCard(\'' + card.id + '\')">📥 이미지 저장</button>' +
            '<button class="btn btn-ghost btn-sm" onclick="QRCardModule._openMyForm(\'' + card.id + '\')">수정</button>' +
            '<button class="btn btn-danger btn-sm" onclick="QRCardModule._deleteMyCard(\'' + card.id + '\')">삭제</button>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';
    setTimeout(function () {
      cards.forEach(function (card) { _renderQR('qr-' + card.id, _toVCard(card), 180); });
    }, 50);
  }

  function _openMyForm(id) {
    var cards = _myLoad();
    var card  = id ? cards.find(function (c) { return c.id === id; }) : null;
    _editingId = id || null;
    var old = document.getElementById('qrcard-modal');
    if (old) old.remove();
    function row(label, fid, val, type, ph, req) {
      return '<div style="margin-bottom:13px">' +
        '<label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:4px">' + label +
        (req ? ' <span style="color:#dc2626">*</span>' : '') + '</label>' +
        '<input id="' + fid + '" type="' + (type || 'text') + '" value="' + _h(val) + '" placeholder="' + (ph || '') + '"' +
        ' style="width:100%;padding:9px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box"' +
        ' onfocus="this.style.borderColor=\'#1D4ED8\'" onblur="this.style.borderColor=\'#d1d5db\'">' +
      '</div>';
    }
    var modal = document.createElement('div');
    modal.id = 'qrcard-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:28px;max-width:460px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 20px 48px rgba(0,0,0,.2)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
          '<h3 style="font-size:17px;font-weight:700">' + (id ? '명함 수정' : '새 QR 명함') + '</h3>' +
          '<button onclick="document.getElementById(\'qrcard-modal\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;line-height:1">✕</button>' +
        '</div>' +
        row('이름',          'qcf-name',  card && card.name,      'text',  '홍길동',              true) +
        row('기관',          'qcf-org',   card && card.org,       'text',  '아세아항공직업전문학교') +
        row('소속',          'qcf-dept',  card && card.dept,      'text',  '행정관리처') +
        row('직위',          'qcf-title', card && card.title,     'text',  '팀장') +
        row('휴대폰',        'qcf-mobile','' + (card && card.mobile || ''), 'tel', '010-1234-5678') +
        row('이메일',        'qcf-email', card && card.email,     'email', 'name@asea.ac.kr') +
        row('사무실 직통',   'qcf-work',  card && card.workPhone, 'tel',   '02-2669-6010') +
        '<div style="display:flex;gap:10px;margin-top:20px">' +
          '<button class="btn btn-ghost" onclick="document.getElementById(\'qrcard-modal\').remove()" style="flex:1">취소</button>' +
          '<button class="btn btn-primary" onclick="QRCardModule._saveMyForm()" style="flex:2">QR 생성</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
    setTimeout(function () { var f = document.getElementById('qcf-name'); if (f) f.focus(); }, 50);
  }

  function _saveMyForm() {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var name = g('qcf-name');
    if (!name) { alert('이름을 입력해 주세요.'); document.getElementById('qcf-name').focus(); return; }
    var card = { id: _editingId || _uuid(), createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),   // 클라우드 병합 시 최신본 판단용
      name: name, org: g('qcf-org'), dept: g('qcf-dept'), title: g('qcf-title'),
      mobile: g('qcf-mobile'), email: g('qcf-email'), workPhone: g('qcf-work') };
    var cards = _myLoad();
    var idx = cards.findIndex(function (c) { return c.id === card.id; });
    if (idx >= 0) cards[idx] = card; else cards.unshift(card);
    _mySave(cards);
    try { if (window.CloudSync && CloudSync.push) CloudSync.push(_myKey()); } catch (e) {}   // 저장 즉시 서버 반영
    document.getElementById('qrcard-modal').remove();
    _renderMyTab();
  }

  function _deleteMyCard(id) {
    if (!confirm('이 QR 명함을 삭제하시겠습니까?')) return;
    _mySave(_myLoad().filter(function (c) { return c.id !== id; }));
    _renderMyTab();
  }

  function _downloadMyCard(id) {
    var card = _myLoad().find(function (c) { return c.id === id; });
    if (!card) return;
    var QR = 200, PAD = 32, W = QR + PAD * 2, HEADER = 72, FOOTER = 36;
    var infoLines = [];
    if (card.mobile)    infoLines.push('Mobile: ' + card.mobile);
    if (card.workPhone) infoLines.push('Tel:    ' + card.workPhone);
    if (card.email)     infoLines.push('Email:  ' + card.email);
    var H = HEADER + PAD + QR + PAD + infoLines.length * 22 + 16 + FOOTER;
    var cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H;
    var ctx = cvs.getContext('2d');
    function draw(qrImg) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1D4ED8'; ctx.fillRect(0, 0, W, HEADER);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 19px Arial,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(card.name || '', W / 2, 28);
      var sub = [card.org, card.dept, card.title].filter(Boolean).join(' · ');
      ctx.font = '12px Arial,sans-serif'; ctx.fillText(sub, W / 2, 50);
      if (qrImg) ctx.drawImage(qrImg, (W - QR) / 2, HEADER + PAD, QR, QR);
      ctx.fillStyle = '#374151'; ctx.textAlign = 'left'; ctx.font = '13px Arial,sans-serif';
      var iy = HEADER + PAD + QR + PAD;
      infoLines.forEach(function (line) { ctx.fillText(line, PAD, iy); iy += 22; });
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD, H - FOOTER - 4); ctx.lineTo(W - PAD, H - FOOTER - 4); ctx.stroke();
      ctx.fillStyle = '#9ca3af'; ctx.font = '10px Arial,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('QR 스캔 → 연락처 자동 저장 (iPhone \xB7 Android)', W / 2, H - 12);
      try {
        cvs.toBlob(function (blob) {
          var url = URL.createObjectURL(blob); var a = document.createElement('a');
          a.href = url; a.download = (card.name || 'card') + '_QR명함.png';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        }, 'image/png');
      } catch (e) { alert('다운로드 실패'); }
    }
    var qi = new Image(); qi.crossOrigin = 'anonymous';
    qi.onload  = function () { draw(qi); };
    qi.onerror = function () { draw(null); };
    qi.src = _qrUrl(_toVCard(card), QR);
  }

  /* ══════════════════════════════════════════
     받은 명함 탭
  ══════════════════════════════════════════ */
  var _rvFilter = { search: '', tag: '' };
  var _scanImageBase64 = null;
  var _scanImageType   = 'image/jpeg';

  function _renderRecvTab() {
    var content = document.getElementById('qr-subtab-content');
    if (!content) return;
    var cards   = _rvLoad();
    var allTags = [];
    cards.forEach(function (c) {
      (c.tags || []).forEach(function (t) { if (allTags.indexOf(t) < 0) allTags.push(t); });
    });

    content.innerHTML =
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px">' +
        '<button class="btn btn-primary" onclick="QRCardModule._openScanModal()">📷 명함 스캔</button>' +
        '<button class="btn btn-ghost"   onclick="QRCardModule._openRecvForm(null)">✍️ 직접 입력</button>' +
        '<input id="recv-search" type="text" placeholder="이름 · 회사 · 태그 검색" value="' + _h(_rvFilter.search) + '"' +
          ' oninput="QRCardModule._rvSearch(this.value)"' +
          ' style="flex:1;min-width:160px;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;outline:none"' +
          ' onfocus="this.style.borderColor=\'#1D4ED8\'" onblur="this.style.borderColor=\'#d1d5db\'">' +
        '<button class="btn btn-ghost" onclick="QRCardModule._exportXlsx()" title="XLSX 내보내기">📊 내보내기</button>' +
      '</div>' +
      (allTags.length
        ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">' +
            _tagChip('전체', '', !_rvFilter.tag) +
            allTags.map(function (t) { return _tagChip(t, t, _rvFilter.tag === t); }).join('') +
          '</div>'
        : '') +
      '<div style="font-size:12px;color:#9ca3af;margin-bottom:12px">' +
        '총 ' + cards.length + '명' +
        (cards.length !== _rvFiltered().length ? ' · 필터 ' + _rvFiltered().length + '명' : '') +
      '</div>' +
      '<div id="recv-list"></div>';

    _renderRecvList();
  }

  function _tagChip(label, val, active) {
    return '<button onclick="QRCardModule._rvTag(\'' + _h(val) + '\')"' +
      ' style="padding:4px 14px;border-radius:20px;border:1.5px solid ' + (active ? '#1D4ED8' : '#d1d5db') + ';' +
      'background:' + (active ? '#EFF6FF' : '#fff') + ';color:' + (active ? '#1D4ED8' : '#6b7280') + ';' +
      'font-size:12px;cursor:pointer;transition:all .1s">' + _h(label) + '</button>';
  }

  function _rvFiltered() {
    return _rvLoad().filter(function (c) {
      var q = (_rvFilter.search || '').toLowerCase();
      var matchSearch = !q ||
        [c.name, c.org, c.dept, c.title, c.mobile, c.email, c.memo].some(function (v) {
          return (v || '').toLowerCase().indexOf(q) >= 0;
        }) ||
        (c.tags || []).some(function (t) { return t.toLowerCase().indexOf(q) >= 0; });
      var matchTag = !_rvFilter.tag || (c.tags || []).indexOf(_rvFilter.tag) >= 0;
      return matchSearch && matchTag;
    });
  }

  function _rvSearch(v) { _rvFilter.search = v; _renderRecvList(); }
  function _rvTag(t)    { _rvFilter.tag = t; _renderRecvTab(); }

  function _renderRecvList() {
    var list = document.getElementById('recv-list');
    if (!list) return;
    var cards = _rvFiltered();
    if (!cards.length) {
      list.innerHTML =
        '<div style="text-align:center;padding:60px 0;color:#9ca3af;font-size:14px">' +
        '명함이 없습니다.<br>📷 스캔 또는 ✍️ 직접 입력으로 추가하세요.</div>';
      return;
    }
    list.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">' +
      cards.map(function (card) {
        var meta = [card.title, card.dept].filter(Boolean).join(' · ');
        var tags = (card.tags || []).map(function (t) {
          return '<span style="display:inline-block;padding:2px 8px;background:#EFF6FF;color:#1D4ED8;' +
            'border-radius:12px;font-size:11px;margin:1px">' + _h(t) + '</span>';
        }).join('');
        return '<div class="settings-card" style="padding:16px">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">' +
            '<div>' +
              '<div style="font-weight:700;font-size:15px;color:#111827">' + _h(card.name) + '</div>' +
              (meta ? '<div style="font-size:12px;color:#6b7280">' + _h(meta) + '</div>' : '') +
              (card.org ? '<div style="font-size:12px;color:#9ca3af">' + _h(card.org) + '</div>' : '') +
            '</div>' +
            '<span style="font-size:10px;color:#d1d5db;flex-shrink:0">' +
              (card.source === 'scan' ? '📷 스캔' : '✍️ 입력') + '</span>' +
          '</div>' +
          (card.mobile    ? '<div style="font-size:13px;color:#374151;margin-bottom:2px">📱 ' + _h(card.mobile)    + '</div>' : '') +
          (card.email     ? '<div style="font-size:13px;color:#374151;margin-bottom:2px">✉️ ' + _h(card.email)     + '</div>' : '') +
          (card.workPhone ? '<div style="font-size:13px;color:#374151;margin-bottom:2px">☎️ ' + _h(card.workPhone) + '</div>' : '') +
          (card.memo      ? '<div style="font-size:12px;color:#6b7280;margin-top:6px;padding:6px 8px;background:#f9fafb;border-radius:6px">' + _h(card.memo) + '</div>' : '') +
          (tags           ? '<div style="margin-top:8px">' + tags + '</div>' : '') +
          (card.metAt     ? '<div style="font-size:11px;color:#9ca3af;margin-top:4px">🗓 ' + _h(card.metAt) + '</div>' : '') +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">' +
            '<button class="btn btn-ghost btn-sm" onclick="QRCardModule._saveVcf(\'' + card.id + '\')">💾 연락처</button>' +
            '<button class="btn btn-ghost btn-sm" onclick="QRCardModule._shareCard(\'' + card.id + '\')">🔗 공유</button>' +
            '<button class="btn btn-ghost btn-sm" onclick="QRCardModule._openRecvForm(\'' + card.id + '\')">수정</button>' +
            '<button class="btn btn-danger btn-sm" onclick="QRCardModule._deleteRecv(\'' + card.id + '\')">삭제</button>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';
  }

  /* ── 명함 스캔 모달 ── */
  function _openScanModal() {
    var old = document.getElementById('scan-modal');
    if (old) old.remove();
    var modal = document.createElement('div');
    modal.id = 'scan-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:28px;max-width:480px;width:100%;box-shadow:0 20px 48px rgba(0,0,0,.2)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
          '<h3 style="font-size:17px;font-weight:700">📷 명함 스캔 (AI 인식)</h3>' +
          '<button onclick="document.getElementById(\'scan-modal\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af">✕</button>' +
        '</div>' +
        '<div id="scan-preview" style="width:100%;min-height:160px;border:2px dashed #d1d5db;border-radius:12px;' +
          'display:flex;align-items:center;justify-content:center;margin-bottom:16px;overflow:hidden;background:#f9fafb">' +
          '<span style="color:#9ca3af;font-size:14px;text-align:center;padding:20px">이미지를 선택하거나<br>카메라로 촬영하세요</span>' +
        '</div>' +
        '<div style="display:flex;gap:10px;margin-bottom:14px">' +
          '<label style="flex:1;cursor:pointer">' +
            '<input type="file" accept="image/*" onchange="QRCardModule._onScanFile(this)" style="display:none">' +
            '<span class="btn btn-ghost" style="display:block;text-align:center;width:100%">🖼 파일 선택</span>' +
          '</label>' +
          '<label style="flex:1;cursor:pointer">' +
            '<input type="file" accept="image/*" capture="environment" onchange="QRCardModule._onScanFile(this)" style="display:none">' +
            '<span class="btn btn-ghost" style="display:block;text-align:center;width:100%">📷 카메라 촬영</span>' +
          '</label>' +
        '</div>' +
        '<div id="scan-status" style="font-size:13px;color:#6b7280;margin-bottom:12px;min-height:18px"></div>' +
        '<button id="scan-ocr-btn" class="btn btn-primary" style="width:100%;display:none"' +
          ' onclick="QRCardModule._runOcr()">🔍 명함 AI 인식 시작</button>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
  }

  function _onScanFile(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    _scanImageType = file.type || 'image/jpeg';
    var reader = new FileReader();
    reader.onload = function (e) {
      _scanImageBase64 = e.target.result.split(',')[1];
      var preview = document.getElementById('scan-preview');
      if (preview) preview.innerHTML =
        '<img src="' + e.target.result + '" style="max-width:100%;max-height:220px;border-radius:8px;object-fit:contain">';
      var btn = document.getElementById('scan-ocr-btn');
      if (btn) btn.style.display = 'block';
      var status = document.getElementById('scan-status');
      if (status) status.textContent = '✅ 이미지 준비 완료. 인식 버튼을 누르세요.';
    };
    reader.readAsDataURL(file);
  }

  function _runOcr() {
    if (!_scanImageBase64) return;
    var cfg = window.getClaudeConfig ? window.getClaudeConfig() : {};
    if (!cfg.apiKey) {
      alert('Claude API 키가 설정되어 있지 않습니다.\n설정 탭 > Anthropic API 키를 입력해 주세요.');
      return;
    }
    var status = document.getElementById('scan-status');
    var btn    = document.getElementById('scan-ocr-btn');
    if (status) status.textContent = '🔍 AI가 명함을 인식 중입니다…';
    if (btn) { btn.disabled = true; btn.textContent = '인식 중…'; }

    window.claudeFetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: _scanImageType, data: _scanImageBase64 } },
            { type: 'text', text: '이 명함 이미지에서 연락처 정보를 추출해 아래 JSON 형식으로만 반환하세요. 없는 값은 빈 문자열.\n{"name":"","org":"","dept":"","title":"","mobile":"","workPhone":"","email":"","address":""}' }
          ]
        }]
      })
    })
    .then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, body: j }; });
    })
    .then(function (res) {
      if (!res.ok || !res.body || !res.body.content || !res.body.content[0] || !res.body.content[0].text) {
        var msg = (res.body && res.body.error && res.body.error.message) || 'AI 응답 오류';
        throw new Error(msg);
      }
      var data  = res.body;
      var text  = data.content[0].text;
      var match = text.match(/\{[\s\S]*\}/);
      var parsed = {};
      try { parsed = JSON.parse(match ? match[0] : '{}'); } catch (e) {}
      if (status) status.textContent = '✅ 인식 완료!';
      if (btn) { btn.disabled = false; btn.textContent = '🔍 명함 AI 인식 시작'; }
      document.getElementById('scan-modal').remove();
      _openRecvForm(null, parsed, true);
    })
    .catch(function (err) {
      if (status) status.textContent = '❌ 인식 실패: ' + (err.message || '네트워크 오류');
      if (btn) { btn.disabled = false; btn.textContent = '🔍 명함 AI 인식 시작'; }
    });
  }

  /* ── 받은 명함 추가/수정 폼 ── */
  function _openRecvForm(id, prefill, fromScan) {
    var cards = _rvLoad();
    var card  = id ? cards.find(function (c) { return c.id === id; }) : (prefill || {});
    _recvEditId = id || null;
    var old = document.getElementById('recv-modal');
    if (old) old.remove();

    function row2(label, fid, val, type, ph) {
      return '<div style="margin-bottom:11px">' +
        '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:3px">' + label + '</label>' +
        '<input id="' + fid + '" type="' + (type || 'text') + '" value="' + _h(val) + '" placeholder="' + (ph || '') + '"' +
        ' style="width:100%;padding:8px 11px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;box-sizing:border-box;outline:none"' +
        ' onfocus="this.style.borderColor=\'#1D4ED8\'" onblur="this.style.borderColor=\'#d1d5db\'">' +
      '</div>';
    }

    var modal = document.createElement('div');
    modal.id = 'recv-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:24px;max-width:520px;width:100%;max-height:94vh;overflow-y:auto;box-shadow:0 20px 48px rgba(0,0,0,.2)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">' +
          '<h3 style="font-size:16px;font-weight:700">' +
            (fromScan ? '📷 스캔 결과 확인 · 저장' : id ? '명함 수정' : '명함 직접 입력') +
          '</h3>' +
          '<button onclick="document.getElementById(\'recv-modal\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af">✕</button>' +
        '</div>' +
        (fromScan ? '<div style="padding:10px 12px;background:#EFF6FF;border-radius:8px;font-size:12px;color:#1D4ED8;margin-bottom:16px">AI가 인식한 내용입니다. 수정 후 저장하세요.</div>' : '') +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">' +
          row2('이름 *',   'rcf-name',  card.name,      'text',  '홍길동') +
          row2('기관',     'rcf-org',   card.org,       'text',  '회사명') +
          row2('부서',     'rcf-dept',  card.dept,      'text',  '부서') +
          row2('직위',     'rcf-title', card.title,     'text',  '팀장') +
          row2('휴대폰',   'rcf-mobile',card.mobile,    'tel',   '010-0000-0000') +
          row2('사무실',   'rcf-work',  card.workPhone, 'tel',   '02-0000-0000') +
        '</div>' +
        row2('이메일',           'rcf-email',   card.email,   'email', 'name@company.com') +
        row2('주소',             'rcf-address', card.address, 'text',  '서울시 강서구') +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">' +
          row2('만난 날짜/장소', 'rcf-metat',   card.metAt,   'text',  '2026-06-12 행사장') +
          row2('태그 (쉼표 구분)','rcf-tags',   (card.tags || []).join(', '), 'text', '거래처, 협력사') +
        '</div>' +
        '<div style="margin-bottom:11px">' +
          '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:3px">메모</label>' +
          '<textarea id="rcf-memo" rows="2" placeholder="메모" style="width:100%;padding:8px 11px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;box-sizing:border-box;resize:vertical;outline:none">' +
            _h(card.memo || '') +
          '</textarea>' +
        '</div>' +
        '<div style="display:flex;gap:10px;margin-top:16px">' +
          '<button class="btn btn-ghost" onclick="document.getElementById(\'recv-modal\').remove()" style="flex:1">취소</button>' +
          '<button class="btn btn-primary" onclick="QRCardModule._saveRecvForm(' + (fromScan ? 'true' : 'false') + ')" style="flex:2">저장</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
    setTimeout(function () { var f = document.getElementById('rcf-name'); if (f) f.focus(); }, 50);
  }

  function _saveRecvForm(fromScan) {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var name = g('rcf-name');
    if (!name) { alert('이름을 입력해 주세요.'); document.getElementById('rcf-name').focus(); return; }
    var tagsRaw = g('rcf-tags');
    var tags = tagsRaw ? tagsRaw.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [];
    var now = new Date().toISOString();
    var card = {
      id: _recvEditId || _uuid(), createdAt: now, updatedAt: now,
      source: _recvEditId ? undefined : (fromScan ? 'scan' : 'manual'),
      name: name, org: g('rcf-org'), dept: g('rcf-dept'), title: g('rcf-title'),
      mobile: g('rcf-mobile'), workPhone: g('rcf-work'), email: g('rcf-email'),
      address: g('rcf-address'), metAt: g('rcf-metat'), memo: g('rcf-memo'), tags: tags
    };
    var cards = _rvLoad();
    var idx = cards.findIndex(function (c) { return c.id === card.id; });
    if (idx >= 0) { card.source = cards[idx].source; cards[idx] = card; }
    else cards.unshift(card);
    _rvSave(cards);
    _scanImageBase64 = null;
    document.getElementById('recv-modal').remove();
    _renderRecvTab();
    if (!_recvEditId) { _promptSaveVcf(card); }
  }

  function _promptSaveVcf(card) {
    if (confirm('📱 "' + card.name + '" 연락처를 이 기기에도 저장하시겠습니까?')) _doSaveVcf(card);
  }

  function _saveVcf(id) {
    var card = _rvLoad().find(function (c) { return c.id === id; });
    if (card) _doSaveVcf(card);
  }

  function _doSaveVcf(card) {
    var blob = new Blob([_toVCard(card)], { type: 'text/vcard;charset=utf-8' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = (card.name || 'contact') + '.vcf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function _deleteRecv(id) {
    if (!confirm('이 명함을 삭제하시겠습니까?')) return;
    _rvSave(_rvLoad().filter(function (c) { return c.id !== id; }));
    _renderRecvTab();
  }

  /* ── 공유 링크 ── */
  function _shareCard(id) {
    var card = _rvLoad().find(function (c) { return c.id === id; });
    if (!card) return;
    var data = JSON.stringify({
      name: card.name, org: card.org, dept: card.dept, title: card.title,
      mobile: card.mobile, workPhone: card.workPhone, email: card.email, address: card.address
    });
    var encoded = btoa(unescape(encodeURIComponent(data)));
    var base = (typeof CONFIG !== 'undefined' && CONFIG.baseUrl)
      ? CONFIG.baseUrl
      : (window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/'));
    var url = base.replace(/\/$/, '') + '/card.html?v=' + encoded;

    var old = document.getElementById('share-modal');
    if (old) old.remove();
    var modal = document.createElement('div');
    modal.id = 'share-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:24px;max-width:480px;width:100%;box-shadow:0 20px 48px rgba(0,0,0,.2)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
          '<h3 style="font-size:16px;font-weight:700">🔗 공유 링크</h3>' +
          '<button onclick="document.getElementById(\'share-modal\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af">✕</button>' +
        '</div>' +
        '<p style="font-size:13px;color:#6b7280;margin-bottom:12px">' +
          '<strong>' + _h(card.name) + '</strong> 님 연락처 공유 링크입니다.<br>' +
          '링크를 받은 사람이 클릭하면 연락처를 저장할 수 있습니다.</p>' +
        '<div style="display:flex;gap:8px;margin-bottom:16px">' +
          '<input id="share-url-input" value="' + _h(url) + '" readonly' +
            ' style="flex:1;padding:9px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:12px;background:#f9fafb;color:#374151">' +
          '<button class="btn btn-primary" onclick="QRCardModule._copyShareUrl()">복사</button>' +
        '</div>' +
        '<button class="btn btn-ghost" style="width:100%" onclick="document.getElementById(\'share-modal\').remove()">닫기</button>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
  }

  function _copyShareUrl() {
    var input = document.getElementById('share-url-input');
    if (!input) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(input.value).then(function () { alert('링크가 복사되었습니다!'); });
    } else {
      input.select(); document.execCommand('copy'); alert('링크가 복사되었습니다!');
    }
  }

  /* ── XLSX 내보내기 ── */
  function _exportXlsx() {
    if (typeof XLSX === 'undefined') {
      alert('XLSX 라이브러리 로딩 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    var cards = _rvLoad();
    if (!cards.length) { alert('내보낼 데이터가 없습니다.'); return; }
    var rows = [['이름','기관','부서','직위','휴대폰','사무실','이메일','주소','태그','메모','만난날짜','등록방식','등록일']];
    cards.forEach(function (c) {
      rows.push([
        c.name || '', c.org || '', c.dept || '', c.title || '',
        c.mobile || '', c.workPhone || '', c.email || '', c.address || '',
        (c.tags || []).join(', '), c.memo || '', c.metAt || '',
        c.source === 'scan' ? '스캔' : '직접입력',
        c.createdAt ? c.createdAt.slice(0, 10) : ''
      ]);
    });
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [10,20,12,10,14,14,24,20,14,20,14,8,12].map(function (w) { return { wch: w }; });
    XLSX.utils.book_append_sheet(wb, ws, '받은명함');
    XLSX.writeFile(wb, '받은명함_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  /* ── Public API ── */
  // 클라우드 동기화로 명함 데이터가 갱신되면 현재 화면을 다시 그린다(다른 기기 변경 반영)
  try {
    window.addEventListener('cloudsync-updated', function () {
      if (document.getElementById('qr-subtab-content')) _switchSubTab(_activeSubTab);
    });
  } catch (e) {}

  return {
    renderTab:       renderTab,
    _switchSubTab:   _switchSubTab,
    _syncNow:        _syncNow,
    _openMyForm:     _openMyForm,
    _saveMyForm:     _saveMyForm,
    _deleteMyCard:   _deleteMyCard,
    _downloadMyCard: _downloadMyCard,
    _openScanModal:  _openScanModal,
    _onScanFile:     _onScanFile,
    _runOcr:         _runOcr,
    _openRecvForm:   _openRecvForm,
    _saveRecvForm:   _saveRecvForm,
    _saveVcf:        _saveVcf,
    _deleteRecv:     _deleteRecv,
    _shareCard:      _shareCard,
    _copyShareUrl:   _copyShareUrl,
    _exportXlsx:     _exportXlsx,
    _rvSearch:       _rvSearch,
    _rvTag:          _rvTag,
    /* 기존 호환성 유지 */
    openForm:        _openMyForm,
    saveForm:        _saveMyForm,
    deleteCard:      _deleteMyCard,
    downloadCard:    _downloadMyCard
  };
})();
