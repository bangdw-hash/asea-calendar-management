'use strict';
window.MeetModule = (function () {

  /* ── localStorage 키 ── */
  var SK_APP_ID  = 'jaas_app_id';
  var SK_GAS_URL = 'jaas_gas_url';
  var SK_MEETINGS = 'asea_meetings';

  /* ── 상태 ── */
  var _appId    = '';
  var _gasUrl   = '';
  var _meetings = [];
  var _subTab   = 'list';

  /* ── DOM 헬퍼 ── */
  function $r()  { return document.getElementById('zoom-root'); }
  function $q(s) { return document.querySelector(s); }
  function $qa(s){ return Array.from(document.querySelectorAll(s)); }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function pad(n){ return String(n).padStart(2,'0'); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

  /* ══════════════════════════════════════════════
     초기화
  ══════════════════════════════════════════════ */
  function init() {
    _appId   = localStorage.getItem(SK_APP_ID)  || '';
    _gasUrl  = localStorage.getItem(SK_GAS_URL) || '';
    try { _meetings = JSON.parse(localStorage.getItem(SK_MEETINGS)) || []; } catch(e){ _meetings=[]; }
    render();
  }

  /* ══════════════════════════════════════════════
     저장
  ══════════════════════════════════════════════ */
  function _saveMeetings() {
    try { localStorage.setItem(SK_MEETINGS, JSON.stringify(_meetings)); } catch(e){}
  }

  /* ══════════════════════════════════════════════
     렌더링
  ══════════════════════════════════════════════ */
  function render() {
    var el = $r(); if (!el) return;
    if (!_appId || !_gasUrl) {
      el.innerHTML = '<div class="tab-body">' + _htmlSetup() + '</div>';
      _bindSetup();
    } else {
      el.innerHTML = '<div class="tab-body">' + _htmlMain() + '</div>';
      _bindMain();
    }
  }

  /* ══════════════════════════════════════════════
     설정 화면
  ══════════════════════════════════════════════ */
  function _htmlSetup() {
    return '<h2 class="section-title">' +
        '<svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.87v6.26a1 1 0 0 1-1.447.94L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/></svg>' +
        'Zoom 회의' +
      '</h2>' +
      '<div class="mt-wrap">' +
        '<div class="mt-setup-card">' +
          '<div class="mt-setup-icon">🎥</div>' +
          '<div class="mt-setup-title">화상회의 설정</div>' +
          '<div class="mt-setup-desc">' +
            'JaaS(8x8.vc) App ID와 GAS 프록시 URL을 입력하세요.<br>' +
            '최초 1회 설정 후 모든 기능이 활성화됩니다.' +
          '</div>' +
          '<div class="mt-setup-fields">' +
            '<div class="mt-setup-field">' +
              '<label class="mt-setup-label">JaaS App ID *</label>' +
              '<input id="mt-s-appid" class="mt-setup-input" placeholder="vpaas-magic-cookie-xxxxxxxx" value="'+esc(_appId)+'">' +
              '<div class="mt-setup-hint">jaas.8x8.vc → 내 앱 → App ID</div>' +
            '</div>' +
            '<div class="mt-setup-field">' +
              '<label class="mt-setup-label">GAS 프록시 URL *</label>' +
              '<input id="mt-s-gas" class="mt-setup-input" placeholder="https://script.google.com/macros/s/.../exec" value="'+esc(_gasUrl)+'">' +
              '<div class="mt-setup-hint">Google Apps Script 웹앱 배포 URL</div>' +
            '</div>' +
          '</div>' +
          '<button id="mt-setup-save" class="mt-btn mt-btn-primary" style="width:100%;padding:12px;font-size:14px">💾 저장하고 시작하기</button>' +
        '</div>' +
      '</div>';
  }

  function _bindSetup() {
    var btn = $q('#mt-setup-save');
    if (!btn) return;
    btn.addEventListener('click', function() {
      var appId  = ($q('#mt-s-appid')||{}).value||'';
      var gasUrl = ($q('#mt-s-gas')||{}).value||'';
      if (!appId || !gasUrl) { _toast('두 항목 모두 입력하세요', 'error'); return; }
      localStorage.setItem(SK_APP_ID,  appId.trim());
      localStorage.setItem(SK_GAS_URL, gasUrl.trim());
      _appId  = appId.trim();
      _gasUrl = gasUrl.trim();
      _toast('설정이 저장됐습니다 ✅');
      render();
    });
  }

  /* ══════════════════════════════════════════════
     메인 화면
  ══════════════════════════════════════════════ */
  function _htmlMain() {
    var nav = '<div class="mt-subtab-nav">' +
      '<button class="mt-subtab-btn'+(_subTab==='list'?' active':'')+'" data-mtab="list">📋 예약 목록</button>' +
      '<button class="mt-subtab-btn'+(_subTab==='create'?' active':'')+'" data-mtab="create">＋ 회의 예약</button>' +
      '<button class="mt-subtab-btn" id="mt-settings-btn" style="margin-left:auto;color:#9CA3AF">⚙️ 설정</button>' +
      '</div>';

    var body = _subTab === 'create' ? _htmlCreateForm() : _htmlMeetingList();

    return '<h2 class="section-title">' +
        '<svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.87v6.26a1 1 0 0 1-1.447.94L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/></svg>' +
        'Zoom 회의' +
      '</h2>' +
      '<div class="mt-wrap">' + nav + body + '</div>';
  }

  /* ── 예약 폼 ── */
  function _htmlCreateForm(d) {
    d = d || {};
    var now  = new Date();
    var tmrw = new Date(now.getTime() + 86400000);
    var defDate = tmrw.getFullYear()+'-'+pad(tmrw.getMonth()+1)+'-'+pad(tmrw.getDate());
    var durationOpts = [15,30,45,60,90,120,180,240].map(function(m){
      var label = m < 60 ? m+'분' : (m%60===0 ? (m/60)+'시간' : Math.floor(m/60)+'시간 '+(m%60)+'분');
      return '<option value="'+m+'"'+(m===(d.duration||60)?' selected':'')+'>'+label+'</option>';
    }).join('');

    return '<div class="mt-card">' +
      '<div class="mt-card-title">📅 새 화상회의 예약</div>' +
      '<div class="mt-form-grid">' +
        '<div class="mt-field" style="grid-column:1/-1">' +
          '<label>회의 제목 *</label>' +
          '<input id="mt-f-topic" type="text" placeholder="예) 2026학년도 1학기 교무회의" value="'+esc(d.topic||'')+'" maxlength="200">' +
        '</div>' +
        '<div class="mt-field">' +
          '<label>날짜 *</label>' +
          '<input id="mt-f-date" type="date" value="'+(d.date||defDate)+'">' +
        '</div>' +
        '<div class="mt-field">' +
          '<label>시작 시간 *</label>' +
          '<input id="mt-f-time" type="time" step="600" value="'+(d.time||'10:00')+'">' +
        '</div>' +
        '<div class="mt-field">' +
          '<label>소요 시간</label>' +
          '<select id="mt-f-duration">'+durationOpts+'</select>' +
        '</div>' +
        '<div class="mt-field">' +
          '<label>최대 참가 인원</label>' +
          '<select id="mt-f-maxp">' +
            [10,20,30,50,100,200].map(function(n){
              return '<option value="'+n+'"'+(n===(d.maxParticipants||50)?' selected':'')+'>'+n+'명 이하</option>';
            }).join('')+
          '</select>' +
        '</div>' +
        '<div class="mt-field" style="grid-column:1/-1">' +
          '<label>회의 안건 (선택)</label>' +
          '<textarea id="mt-f-agenda" rows="3" placeholder="회의 목적, 논의 사항 등">'+esc(d.agenda||'')+'</textarea>' +
        '</div>' +
      '</div>' +
      '<div class="mt-form-actions">' +
        '<button class="mt-btn mt-btn-ghost" id="mt-create-cancel">취소</button>' +
        '<button class="mt-btn mt-btn-primary" id="mt-create-submit">🎥 회의 예약 생성</button>' +
      '</div>' +
    '</div>';
  }

  /* ── 회의 목록 ── */
  function _htmlMeetingList() {
    var now = Date.now();
    var sorted = _meetings.slice().sort(function(a,b){ return new Date(a.startTime)-new Date(b.startTime); });

    if (!sorted.length) {
      return '<div class="mt-empty">' +
        '<span class="mt-empty-icon">📭</span>' +
        '예약된 화상회의가 없습니다.<br>＋ 회의 예약 탭에서 새 회의를 만들어보세요.' +
      '</div>';
    }

    var html = '<div class="mt-list-header">' +
      '<span class="mt-list-count">총 '+sorted.length+'개 회의</span>' +
      '<button class="mt-btn mt-btn-ghost mt-btn-sm" id="mt-refresh-btn">🔄 새로고침</button>' +
    '</div>';

    html += sorted.map(function(m) {
      var startMs = new Date(m.startTime).getTime();
      var endMs   = startMs + (m.duration||60)*60000;
      var badge, badgeClass;
      if (now >= startMs && now <= endMs) {
        badge = '진행 중'; badgeClass = 'mt-badge-now';
      } else if (now < startMs) {
        badge = '예정'; badgeClass = 'mt-badge-upcoming';
      } else {
        badge = '종료'; badgeClass = 'mt-badge-past';
      }
      var hostUrl  = 'https://8x8.vc/'+_appId+'/'+m.roomId+'?jwt='+encodeURIComponent(m.hostToken||'');
      var guestUrl = 'https://8x8.vc/'+_appId+'/'+m.roomId;

      return '<div class="mt-meeting-card">' +
        '<div class="mt-meeting-top">' +
          '<div class="mt-meeting-icon">🎥</div>' +
          '<div class="mt-meeting-body">' +
            '<div class="mt-meeting-topic">'+esc(m.topic)+'<span class="mt-badge '+badgeClass+'">'+badge+'</span></div>' +
            '<div class="mt-meeting-meta">' +
              '<span>📅 '+esc(_fmtDT(m.startTime))+'</span>' +
              '<span>⏱ '+(m.duration||60)+'분</span>' +
              (m.agenda ? '<span>📝 '+esc(m.agenda.slice(0,30))+(m.agenda.length>30?'…':'')+'</span>' : '') +
            '</div>' +
            '<div class="mt-links-row">' +
              '<div class="mt-link-item host">' +
                '<span class="mt-link-label">🔑 호스트</span>' +
                '<span class="mt-link-url" title="'+esc(hostUrl)+'">'+esc(guestUrl)+'</span>' +
                '<button class="mt-link-copy" data-copy="'+esc(hostUrl)+'">복사</button>' +
                '<a class="mt-link-open" href="'+esc(hostUrl)+'" target="_blank" rel="noopener">열기</a>' +
              '</div>' +
              '<div class="mt-link-item participant">' +
                '<span class="mt-link-label">👥 참가자</span>' +
                '<span class="mt-link-url">'+esc(guestUrl)+'</span>' +
                '<button class="mt-link-copy" data-copy="'+esc(guestUrl)+'">복사</button>' +
                '<a class="mt-link-open" href="'+esc(guestUrl)+'" target="_blank" rel="noopener">열기</a>' +
              '</div>' +
            '</div>' +
            '<div class="mt-meeting-actions">' +
              '<button class="mt-btn mt-btn-ghost mt-btn-sm mt-edit-btn" data-mid="'+esc(m.id)+'">✏️ 수정</button>' +
              '<button class="mt-btn mt-btn-danger mt-btn-sm mt-del-btn" data-mid="'+esc(m.id)+'">🗑 삭제</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    return html;
  }

  /* ══════════════════════════════════════════════
     이벤트 바인딩
  ══════════════════════════════════════════════ */
  function _bindMain() {
    /* 서브탭 */
    $qa('.mt-subtab-btn[data-mtab]').forEach(function(btn){
      btn.addEventListener('click', function(){ _subTab = btn.dataset.mtab; render(); });
    });
    /* 설정 초기화 */
    var settingsBtn = $q('#mt-settings-btn');
    if (settingsBtn) settingsBtn.addEventListener('click', function(){
      if (!confirm('설정을 초기화하고 다시 입력하시겠어요?')) return;
      localStorage.removeItem(SK_APP_ID); localStorage.removeItem(SK_GAS_URL);
      _appId=''; _gasUrl=''; render();
    });
    /* 예약 폼 버튼 */
    var submitBtn = $q('#mt-create-submit');
    if (submitBtn) submitBtn.addEventListener('click', _submitCreate);
    var cancelBtn = $q('#mt-create-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function(){ _subTab='list'; render(); });
    /* 목록 버튼들 */
    var refreshBtn = $q('#mt-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', function(){ _refreshTokens(); });
    $qa('.mt-link-copy').forEach(function(b){
      b.addEventListener('click', function(){
        navigator.clipboard.writeText(b.dataset.copy).then(function(){ _toast('링크가 복사됐습니다 📋'); });
      });
    });
    $qa('.mt-edit-btn').forEach(function(b){
      b.addEventListener('click', function(){ _openEditModal(b.dataset.mid); });
    });
    $qa('.mt-del-btn').forEach(function(b){
      b.addEventListener('click', function(){ _deleteMeeting(b.dataset.mid); });
    });
  }

  /* ══════════════════════════════════════════════
     회의 생성
  ══════════════════════════════════════════════ */
  function _submitCreate() {
    var topic    = ($q('#mt-f-topic')||{}).value||'';
    var date     = ($q('#mt-f-date')||{}).value||'';
    var time     = ($q('#mt-f-time')||{}).value||'';
    var duration = parseInt(($q('#mt-f-duration')||{}).value||'60');
    var agenda   = ($q('#mt-f-agenda')||{}).value||'';
    if (!topic.trim()) { _toast('회의 제목을 입력하세요', 'error'); return; }
    if (!date || !time) { _toast('날짜와 시간을 입력하세요', 'error'); return; }

    var submitBtn = $q('#mt-create-submit');
    if (submitBtn) { submitBtn.disabled=true; submitBtn.textContent='생성 중...'; }

    var roomId    = 'asea-' + uid();
    var startTime = date + 'T' + time + ':00+09:00';

    /* GAS에서 호스트 JWT 발급 */
    _callGas({ action:'host_token', room: roomId, topic: topic })
      .then(function(res) {
        var hostToken = res.token || '';
        var meeting = {
          id: uid(), roomId: roomId, topic: topic.trim(),
          startTime: startTime, duration: duration,
          agenda: agenda, hostToken: hostToken,
          createdAt: new Date().toISOString()
        };
        _meetings.unshift(meeting);
        _saveMeetings();
        _toast('회의가 예약됐습니다 🎉');
        _subTab = 'list';
        render();
      })
      .catch(function(e) {
        _toast('오류: '+(e.message||'JWT 발급 실패'), 'error');
        if (submitBtn) { submitBtn.disabled=false; submitBtn.textContent='🎥 회의 예약 생성'; }
      });
  }

  /* ══════════════════════════════════════════════
     회의 삭제
  ══════════════════════════════════════════════ */
  function _deleteMeeting(id) {
    if (!confirm('이 회의를 삭제할까요?')) return;
    _meetings = _meetings.filter(function(m){ return m.id !== id; });
    _saveMeetings();
    _toast('회의가 삭제됐습니다');
    render();
  }

  /* ══════════════════════════════════════════════
     회의 수정 모달
  ══════════════════════════════════════════════ */
  function _openEditModal(id) {
    var m = _meetings.find(function(x){ return x.id===id; });
    if (!m) return;
    var dt   = new Date(m.startTime);
    var date = dt.getFullYear()+'-'+pad(dt.getMonth()+1)+'-'+pad(dt.getDate());
    var time = pad(dt.getHours())+':'+pad(dt.getMinutes());
    var durationOpts = [15,30,45,60,90,120,180,240].map(function(min){
      var label = min<60?min+'분':(min%60===0?(min/60)+'시간':Math.floor(min/60)+'시간 '+(min%60)+'분');
      return '<option value="'+min+'"'+(min===m.duration?' selected':'')+'>'+label+'</option>';
    }).join('');

    var modal = document.createElement('div');
    modal.className = 'mt-modal-backdrop';
    modal.innerHTML =
      '<div class="mt-modal">' +
        '<div class="mt-modal-title">✏️ 회의 수정</div>' +
        '<div class="mt-form-grid">' +
          '<div class="mt-field" style="grid-column:1/-1">' +
            '<label>회의 제목</label>' +
            '<input id="mt-e-topic" type="text" value="'+esc(m.topic||'')+'">' +
          '</div>' +
          '<div class="mt-field"><label>날짜</label><input id="mt-e-date" type="date" value="'+date+'"></div>' +
          '<div class="mt-field"><label>시작 시간</label><input id="mt-e-time" type="time" step="600" value="'+time+'"></div>' +
          '<div class="mt-field"><label>소요 시간</label><select id="mt-e-duration">'+durationOpts+'</select></div>' +
          '<div class="mt-field" style="grid-column:1/-1">' +
            '<label>회의 안건</label>' +
            '<textarea id="mt-e-agenda" rows="3">'+esc(m.agenda||'')+'</textarea>' +
          '</div>' +
        '</div>' +
        '<div class="mt-modal-actions">' +
          '<button class="mt-btn mt-btn-ghost" id="mt-e-cancel">취소</button>' +
          '<button class="mt-btn mt-btn-primary" id="mt-e-save">💾 수정 저장</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.querySelector('#mt-e-cancel').addEventListener('click', function(){ modal.remove(); });
    modal.addEventListener('click', function(e){ if(e.target===modal) modal.remove(); });
    modal.querySelector('#mt-e-save').addEventListener('click', function(){
      var topic    = (modal.querySelector('#mt-e-topic')||{}).value||'';
      var date2    = (modal.querySelector('#mt-e-date')||{}).value||'';
      var time2    = (modal.querySelector('#mt-e-time')||{}).value||'';
      var duration = parseInt((modal.querySelector('#mt-e-duration')||{}).value||'60');
      var agenda   = (modal.querySelector('#mt-e-agenda')||{}).value||'';
      if (!topic.trim()) { _toast('제목을 입력하세요','error'); return; }
      m.topic     = topic.trim();
      m.startTime = date2+'T'+time2+':00+09:00';
      m.duration  = duration;
      m.agenda    = agenda;
      _saveMeetings();
      _toast('수정됐습니다 ✅');
      modal.remove();
      render();
    });
  }

  /* ══════════════════════════════════════════════
     토큰 갱신 (목록 새로고침 시)
  ══════════════════════════════════════════════ */
  function _refreshTokens() {
    if (!_meetings.length) { render(); return; }
    var pending = _meetings.filter(function(m){ return new Date(m.startTime).getTime() > Date.now() - 3600000; });
    if (!pending.length) { _toast('갱신할 예정 회의가 없습니다'); return; }
    var refreshBtn = $q('#mt-refresh-btn');
    if (refreshBtn) { refreshBtn.disabled=true; refreshBtn.textContent='갱신 중...'; }
    Promise.all(pending.map(function(m){
      return _callGas({ action:'host_token', room: m.roomId, topic: m.topic })
        .then(function(res){ if(res.token) m.hostToken = res.token; });
    })).then(function(){
      _saveMeetings();
      _toast('호스트 토큰이 갱신됐습니다 🔄');
      render();
    }).catch(function(){ render(); });
  }

  /* ══════════════════════════════════════════════
     GAS API 호출
  ══════════════════════════════════════════════ */
  function _callGas(params) {
    if (!_gasUrl) return Promise.reject(new Error('GAS URL 미설정'));
    var url = _gasUrl + '?' + Object.keys(params).map(function(k){
      return encodeURIComponent(k)+'='+encodeURIComponent(params[k]||'');
    }).join('&');
    return fetch(url, { redirect:'follow' }).then(function(r){ return r.json(); });
  }

  /* ══════════════════════════════════════════════
     유틸
  ══════════════════════════════════════════════ */
  function _fmtDT(iso) {
    if (!iso) return '-';
    var d = new Date(iso);
    var days = ['일','월','화','수','목','금','토'];
    return d.getFullYear()+'.'+pad(d.getMonth()+1)+'.'+pad(d.getDate())+
      '.('+days[d.getDay()]+') '+pad(d.getHours())+':'+pad(d.getMinutes());
  }

  function _toast(msg, type) {
    var t = document.createElement('div');
    t.className = 'mt-toast';
    t.style.background = type==='error' ? '#DC2626' : '#1F2937';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){ if(t.parentNode) t.remove(); }, 3000);
  }

  return { init: init };
})();
