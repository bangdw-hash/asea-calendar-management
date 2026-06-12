/**
 * QR명함 모듈 — vCard QR 생성 · 저장 · 갤러리 다운로드
 * iOS / Android 카메라로 스캔 시 연락처 자동 저장 (앱 불필요)
 */
window.QRCardModule = (function () {
  'use strict';

  var STORE_PREFIX = 'asea_qrcards_';
  var _editingId   = null;

  /* ── 사용자별 스토리지 키 ── */
  function _key() {
    try {
      var email = gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile().getEmail();
      return STORE_PREFIX + email;
    } catch (e) { return STORE_PREFIX + 'local'; }
  }
  function _load()    { try { return JSON.parse(localStorage.getItem(_key()) || '[]'); } catch (e) { return []; } }
  function _save(arr) { localStorage.setItem(_key(), JSON.stringify(arr)); }
  function _uuid()    { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function _h(s)      { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ── vCard 생성 (iOS/Android 카메라 직접 인식) ── */
  function _toVCard(c) {
    function esc(s) { return (s || '').replace(/[,;\\]/g, '\\$&'); }
    var lines = [
      'BEGIN:VCARD', 'VERSION:3.0',
      'N:' + esc(c.name) + ';;;;',
      'FN:' + esc(c.name)
    ];
    if (c.org || c.dept) lines.push('ORG:' + esc(c.org) + ';' + esc(c.dept));
    if (c.title)      lines.push('TITLE:'  + esc(c.title));
    if (c.mobile)     lines.push('TEL;TYPE=CELL,VOICE:'  + c.mobile);
    if (c.workPhone)  lines.push('TEL;TYPE=WORK,VOICE:'  + c.workPhone);
    if (c.email)      lines.push('EMAIL;TYPE=INTERNET:'  + c.email);
    lines.push('END:VCARD');
    return lines.join('\r\n');
  }

  /* ── QR 렌더링 (api.qrserver.com — 라이브러리 불필요) ── */
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
    img.width  = sz;
    img.height = sz;
    img.style.display = 'block';
    img.alt    = 'QR';
    img.src    = _qrUrl(text, sz);
    img.onerror = function () {
      el.innerHTML = '<div style="font-size:11px;color:#ef4444;padding:10px">QR 생성 실패<br>(네트워크 확인)</div>';
    };
    el.appendChild(img);
  }

  /* ── 갤러리 저장 (PNG 다운로드) ── */
  function downloadCard(id) {
    var cards = _load();
    var card  = cards.find(function (c) { return c.id === id; });
    if (!card) return;

    var QR = 200, PAD = 32, W = QR + PAD * 2, HEADER = 72, FOOTER = 36;
    var infoLines = [];
    if (card.mobile)    infoLines.push('Mobile: ' + card.mobile);
    if (card.workPhone) infoLines.push('Tel:    ' + card.workPhone);
    if (card.email)     infoLines.push('Email:  ' + card.email);
    var H = HEADER + PAD + QR + PAD + infoLines.length * 22 + 16 + FOOTER;

    var cvs = document.createElement('canvas');
    cvs.width = W; cvs.height = H;
    var ctx = cvs.getContext('2d');

    function _drawAndSave(qrImg) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1D4ED8'; ctx.fillRect(0, 0, W, HEADER);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 19px Arial,sans-serif'; ctx.textAlign = 'center';
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
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = (card.name || 'card') + '_QR명함.png';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        }, 'image/png');
      } catch (e) { alert('다운로드 실패 (CORS): QR 이미지 없이 저장할 수 없습니다.'); }
    }

    var qrImg = new Image();
    qrImg.crossOrigin = 'anonymous';
    qrImg.onload  = function () { _drawAndSave(qrImg); };
    qrImg.onerror = function () { _drawAndSave(null); };
    qrImg.src = _qrUrl(_toVCard(card), QR);
  }

  /* ── 탭 메인 렌더 ── */
  function renderTab() {
    var panel = document.getElementById('tab-qrcard');
    if (!panel) return;

    var cards = _load();

    panel.innerHTML =
      '<div class="tab-body">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
          '<div>' +
            '<h2 style="font-size:18px;font-weight:700;color:#111827;margin-bottom:4px">🪪 QR 명함</h2>' +
            '<p style="font-size:13px;color:#6b7280">카메라로 QR 스캔 → 연락처 자동 저장 (iOS \xB7 Android 공통)</p>' +
          '</div>' +
          '<button class="btn btn-primary" onclick="QRCardModule.openForm(null)">+ 새 명함</button>' +
        '</div>' +
        '<div id="qrcard-list"></div>' +
      '</div>';

    _renderList(cards);
  }

  function _renderList(cards) {
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
        return '<div class="settings-card" data-qr-id="' + card.id + '" style="text-align:center">' +
          '<div style="font-weight:700;font-size:15px;margin-bottom:2px">' + _h(card.name) + '</div>' +
          '<div style="font-size:12px;color:#6b7280;margin-bottom:12px">' + _h(meta) + '</div>' +
          '<div id="qr-' + card.id + '" style="display:inline-block;margin-bottom:8px"></div>' +
          '<div style="font-size:11px;color:#9ca3af;margin-bottom:12px">카메라로 스캔 → 연락처 저장</div>' +
          '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
            '<button class="btn btn-primary btn-sm" onclick="QRCardModule.downloadCard(\'' + card.id + '\')">📥 이미지 저장</button>' +
            '<button class="btn btn-ghost btn-sm" onclick="QRCardModule.openForm(\'' + card.id + '\')">수정</button>' +
            '<button class="btn btn-danger btn-sm" onclick="QRCardModule.deleteCard(\'' + card.id + '\')">삭제</button>' +
          '</div>' +
        '</div>';
      }).join('') +
      '</div>';

    setTimeout(function () {
      cards.forEach(function (card) {
        _renderQR('qr-' + card.id, _toVCard(card), 180);
      });
    }, 50);
  }

  /* ── 명함 폼 모달 ── */
  function openForm(id) {
    var cards = _load();
    var card  = id ? cards.find(function (c) { return c.id === id; }) : null;
    _editingId = id || null;

    var old = document.getElementById('qrcard-modal');
    if (old) old.remove();

    function row(label, fid, val, type, ph, req) {
      return '<div style="margin-bottom:13px">' +
        '<label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:4px">' +
          label + (req ? ' <span style="color:#dc2626">*</span>' : '') +
        '</label>' +
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
        row('이름',            'qcf-name',  card && card.name,      'text', '홍길동', true) +
        row('기관',            'qcf-org',   card && card.org,       'text', '아세아항공직업전문학교') +
        row('소속',            'qcf-dept',  card && card.dept,      'text', '행정관리처') +
        row('직위',            'qcf-title', card && card.title,     'text', '팀장') +
        row('연락처',          'qcf-mobile',''+(card && card.mobile||''), 'tel',  '010-1234-5678') +
        row('이메일',          'qcf-email', card && card.email,     'email','name@asea.ac.kr') +
        row('사무실 직통번호', 'qcf-work',  card && card.workPhone, 'tel',  '02-2669-6010') +
        '<div style="display:flex;gap:10px;margin-top:20px">' +
          '<button class="btn btn-ghost" onclick="document.getElementById(\'qrcard-modal\').remove()" style="flex:1">취소</button>' +
          '<button class="btn btn-primary" onclick="QRCardModule.saveForm()" style="flex:2">QR 생성</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
    setTimeout(function () {
      var f = document.getElementById('qcf-name');
      if (f) f.focus();
    }, 50);
  }

  function saveForm() {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var name = g('qcf-name');
    if (!name) { alert('이름을 입력해 주세요.'); document.getElementById('qcf-name').focus(); return; }

    var card = {
      id:         _editingId || _uuid(),
      createdAt:  new Date().toISOString(),
      name:       name,
      org:        g('qcf-org'),
      dept:       g('qcf-dept'),
      title:      g('qcf-title'),
      mobile:     g('qcf-mobile'),
      email:      g('qcf-email'),
      workPhone:  g('qcf-work')
    };

    var cards = _load();
    var idx = cards.findIndex(function (c) { return c.id === card.id; });
    if (idx >= 0) cards[idx] = card; else cards.unshift(card);
    _save(cards);

    document.getElementById('qrcard-modal').remove();
    renderTab();
  }

  function deleteCard(id) {
    if (!confirm('이 QR 명함을 삭제하시겠습니까?')) return;
    _save(_load().filter(function (c) { return c.id !== id; }));
    renderTab();
  }

  return {
    renderTab:    renderTab,
    openForm:     openForm,
    saveForm:     saveForm,
    deleteCard:   deleteCard,
    downloadCard: downloadCard
  };
})();
