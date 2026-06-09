// board.js — 게시판 모듈 v1.0 (2026-06-10)
(function () {
  'use strict';

  var SK_POSTS    = 'asea_board_posts';
  var SK_COMMENTS = 'asea_board_comments';
  var SK_READS    = 'asea_board_notice_reads';

  /* ── 스토리지 헬퍼 ─────────────────────────────────────── */
  function loadPosts()    { try { return JSON.parse(localStorage.getItem(SK_POSTS)    || '[]'); } catch(e) { return []; } }
  function savePosts(d)   { try { localStorage.setItem(SK_POSTS,    JSON.stringify(d)); } catch(e) {} }
  function loadComments() { try { return JSON.parse(localStorage.getItem(SK_COMMENTS) || '[]'); } catch(e) { return []; } }
  function saveComments(d){ try { localStorage.setItem(SK_COMMENTS, JSON.stringify(d)); } catch(e) {} }
  function loadReads()    { try { return JSON.parse(localStorage.getItem(SK_READS)    || '{}'); } catch(e) { return {}; } }
  function saveReads(d)   { try { localStorage.setItem(SK_READS,    JSON.stringify(d)); } catch(e) {} }

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
  }

  /* ── 현재 사용자 ──────────────────────────────────────── */
  function currentUser() {
    var email = '';
    var name  = '';
    try {
      if (window.CONFIG && CONFIG.currentUser) {
        email = CONFIG.currentUser.email || '';
        name  = CONFIG.currentUser.name  || '';
      }
    } catch(e) {}
    if (!email) email = localStorage.getItem('asea_user_email') || '';
    if (!name)  name  = email.split('@')[0] || '사용자';
    return { email: email, name: name };
  }

  /* ── 브라우저 알림 ──────────────────────────────────── */
  var _notifGranted = false;

  function requestNotifPerm(cb) {
    if (!('Notification' in window)) { if (cb) cb(false); return; }
    if (Notification.permission === 'granted') { _notifGranted = true; if (cb) cb(true); return; }
    if (Notification.permission === 'denied')  { if (cb) cb(false); return; }
    Notification.requestPermission().then(function (p) {
      _notifGranted = (p === 'granted');
      if (cb) cb(_notifGranted);
    });
  }

  function sendBrowserNotif(title, body, tag) {
    if (!_notifGranted || Notification.permission !== 'granted') return;
    try { new Notification(title, { body: body, tag: tag || 'asea-board', icon: 'favicon.ico' }); } catch(e) {}
  }

  /* ── 전사알림 읽음 관리 ──────────────────────────────── */
  function getUnreadNotices(userEmail) {
    if (!userEmail) return [];
    var posts   = loadPosts();
    var reads   = loadReads();
    var myReads = reads[userEmail] || [];
    return posts.filter(function (p) {
      return p.type === 'notice' && p.isActive !== false && myReads.indexOf(p.id) === -1;
    }).sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  }

  function markNoticeRead(userEmail, postId) {
    if (!userEmail || !postId) return;
    var reads = loadReads();
    if (!reads[userEmail]) reads[userEmail] = [];
    if (reads[userEmail].indexOf(postId) === -1) reads[userEmail].push(postId);
    saveReads(reads);
  }

  /* ── 뱃지 업데이트 ──────────────────────────────────── */
  function updateBadge() {
    var user   = currentUser();
    var unread = getUnreadNotices(user.email);
    var el     = document.getElementById('board-tab-badge');
    if (!el) return;
    if (unread.length > 0) {
      el.textContent = unread.length > 9 ? '9+' : String(unread.length);
      el.removeAttribute('hidden');
    } else {
      el.setAttribute('hidden', '');
    }
  }

  /* ── 전사알림 팝업 ──────────────────────────────────── */
  function showNoticePopup(notices) {
    if (!notices || notices.length === 0) return;
    var notice = notices[0];
    var popup  = document.getElementById('board-notice-popup');
    if (!popup) return;
    var titleEl   = document.getElementById('bnp-title');
    var contentEl = document.getElementById('bnp-content');
    var metaEl    = document.getElementById('bnp-meta');
    var remainEl  = document.getElementById('bnp-remain');
    if (titleEl)   titleEl.textContent  = notice.title || '';
    if (contentEl) contentEl.innerHTML  = notice.content || '';
    if (metaEl)    metaEl.textContent   = (notice.authorName || '') + ' · ' + fmtDate(notice.createdAt);
    if (remainEl)  remainEl.textContent = notices.length > 1 ? '(미확인 ' + notices.length + '건)' : '';
    popup._currentNotice  = notice;
    popup._remainNotices  = notices.slice(1);
    popup.removeAttribute('hidden');
    document.body.classList.add('notice-popup-open');
  }

  /* ── 날짜 포매터 ─────────────────────────────────────── */
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.getFullYear() + '.' +
      String(d.getMonth() + 1).padStart(2, '0') + '.' +
      String(d.getDate()).padStart(2, '0');
  }
  function fmtDateTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return fmtDate(iso) + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }

  /* ── XSS 방어 ──────────────────────────────────────── */
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── 관리자 여부 ─────────────────────────────────────── */
  function isAdmin() {
    return (window.AdminModule && AdminModule.isAdmin) ? AdminModule.isAdmin() : false;
  }
  function isManager() {
    return (window.AdminModule && AdminModule.isManager) ? AdminModule.isManager() : false;
  }

  /* ══════════════════════════════════════════════════════
     렌더 상태
  ══════════════════════════════════════════════════════ */
  var S = {
    view: 'list',
    filter: 'all',
    search: '',
    sort: 'newest',
    quill: null
  };

  /* ══════════════════════════════════════════════════════
     목록 렌더
  ══════════════════════════════════════════════════════ */
  function renderList() {
    S.view = 'list';
    var posts    = loadPosts();
    var user     = currentUser();
    var search   = S.search.toLowerCase();
    var filtered = posts.filter(function (p) {
      if (p.isActive === false) return false;
      if (S.filter === 'notice'  && p.type !== 'notice')  return false;
      if (S.filter === 'general' && p.type !== 'general') return false;
      if (search) {
        var inTitle  = (p.title      || '').toLowerCase().indexOf(search) !== -1;
        var inAuthor = (p.authorName || '').toLowerCase().indexOf(search) !== -1;
        if (!inTitle && !inAuthor) return false;
      }
      return true;
    });
    filtered.sort(function (a, b) {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    var comments = loadComments();
    var unread   = getUnreadNotices(user.email);
    var unreadIds = unread.map(function (n) { return n.id; });

    var canWrite = true; // 모든 사용자 글쓰기 가능

    var html = '<div class="board-toolbar">' +
      '<div class="board-filter-row">' +
        '<button class="board-filter-btn' + (S.filter==='all'?' active':'') + '" data-filter="all">전체</button>' +
        '<button class="board-filter-btn' + (S.filter==='notice'?' active':'') + '" data-filter="notice">📢 전사알림</button>' +
        '<button class="board-filter-btn' + (S.filter==='general'?' active':'') + '" data-filter="general">일반</button>' +
      '</div>' +
      '<div class="board-search-row">' +
        '<input type="text" id="board-search-inp" class="form-input board-search-inp" placeholder="제목·작성자 검색..." value="' + esc(S.search) + '">' +
        (canWrite ? '<button id="board-write-btn" class="btn btn-primary btn-sm">✏️ 글쓰기</button>' : '') +
      '</div>' +
    '</div>';

    if (filtered.length === 0) {
      html += '<div class="board-empty"><div class="board-empty-icon">📭</div><p>게시글이 없습니다.</p></div>';
    } else {
      html += '<div class="board-list">';
      filtered.forEach(function (p) {
        var allCmt  = comments.filter(function (c) { return c.postId === p.id; });
        var topCmt  = allCmt.filter(function (c) { return !c.parentId; }).length;
        var replyCmt= allCmt.filter(function (c) { return !!c.parentId; }).length;
        var total   = topCmt + replyCmt;
        var isNew   = unreadIds.indexOf(p.id) !== -1;

        html += '<div class="board-row' +
          (p.isPinned ? ' pinned' : '') +
          (isNew ? ' unread-row' : '') +
          '" data-post-id="' + p.id + '">' +
          '<div class="board-row-left">' +
            (p.type === 'notice' ? '<span class="board-badge notice-badge">📢 전사</span>' : '') +
            (p.isPinned         ? '<span class="board-badge pin-badge">📌</span>' : '') +
            (isNew              ? '<span class="board-badge new-badge">NEW</span>'  : '') +
            '<span class="board-row-title">' + esc(p.title || '제목없음') + '</span>' +
            (total > 0 ? '<span class="board-row-cmt-cnt">[' + total + ']</span>' : '') +
          '</div>' +
          '<div class="board-row-right">' +
            '<span class="board-row-author">' + esc(p.authorName || '') + '</span>' +
            '<span class="board-row-date">' + fmtDate(p.createdAt) + '</span>' +
            '<span class="board-row-views">👁 ' + (p.views || 0) + '</span>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    var container = document.getElementById('board-content');
    if (!container) return;
    container.innerHTML = html;

    /* 이벤트 바인딩 */
    container.querySelectorAll('.board-filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        S.filter = this.dataset.filter;
        renderList();
      });
    });
    var si = document.getElementById('board-search-inp');
    if (si) {
      var _t;
      si.addEventListener('input', function () {
        clearTimeout(_t);
        _t = setTimeout(function () { S.search = si.value; renderList(); }, 300);
      });
    }
    var wb = document.getElementById('board-write-btn');
    if (wb) wb.addEventListener('click', function () { renderWrite(null); });

    container.querySelectorAll('.board-row').forEach(function (row) {
      row.addEventListener('click', function () { renderDetail(this.dataset.postId); });
    });

    updateBadge();
  }

  /* ══════════════════════════════════════════════════════
     상세 렌더
  ══════════════════════════════════════════════════════ */
  function renderDetail(postId) {
    var posts = loadPosts();
    var idx   = posts.findIndex(function (p) { return p.id === postId; });
    if (idx === -1) { renderList(); return; }

    var post = posts[idx];
    post.views = (post.views || 0) + 1;
    savePosts(posts);

    var user = currentUser();
    if (post.type === 'notice') { markNoticeRead(user.email, post.id); updateBadge(); }

    S.view = 'detail';

    var isOwner = user.email && user.email === post.authorEmail;
    var admin   = isAdmin();

    var html = '<div class="board-detail">' +
      '<button class="board-back-btn" id="board-back-btn">← 목록으로</button>' +
      '<div class="board-detail-header">' +
        '<div class="board-detail-badges">' +
          (post.type === 'notice' ? '<span class="board-badge notice-badge">📢 전사알림</span>' : '') +
          (post.isPinned          ? '<span class="board-badge pin-badge">📌 고정</span>'      : '') +
        '</div>' +
        '<h2 class="board-detail-title">' + esc(post.title || '') + '</h2>' +
        '<div class="board-detail-meta">' +
          '<span class="board-detail-author">' + esc(post.authorName || '알 수 없음') + '</span>' +
          '<span class="board-detail-sep">·</span>' +
          '<span>' + fmtDateTime(post.createdAt) + '</span>' +
          (post.updatedAt && post.updatedAt !== post.createdAt
            ? '<span class="board-detail-edited">(수정됨)</span>' : '') +
          '<span class="board-detail-sep">·</span>' +
          '<span>👁 ' + (post.views || 0) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="board-detail-body ql-content">' + (post.content || '') + '</div>';

    if (isOwner || admin) {
      html += '<div class="board-detail-actions">' +
        '<button class="btn btn-ghost btn-sm" id="bd-edit-btn">✏️ 수정</button>' +
        '<button class="btn btn-danger btn-sm" id="bd-del-btn">🗑 삭제</button>' +
        (admin && !post.isPinned ? '<button class="btn btn-ghost btn-sm" id="bd-pin-btn">📌 고정</button>'      : '') +
        (admin &&  post.isPinned ? '<button class="btn btn-ghost btn-sm" id="bd-unpin-btn">📌 고정 해제</button>' : '') +
      '</div>';
    }

    html += _buildCommentsHtml(postId) + '</div>';

    var container = document.getElementById('board-content');
    if (!container) return;
    container.innerHTML = html;

    /* 버튼 이벤트 */
    var backBtn = document.getElementById('board-back-btn');
    if (backBtn) backBtn.addEventListener('click', function () { renderList(); });

    var editBtn = document.getElementById('bd-edit-btn');
    if (editBtn) editBtn.addEventListener('click', function () { renderWrite(post); });

    var delBtn = document.getElementById('bd-del-btn');
    if (delBtn) delBtn.addEventListener('click', function () {
      if (!confirm('게시글을 삭제하시겠습니까?')) return;
      var ps = loadPosts().filter(function (p) { return p.id !== postId; });
      savePosts(ps);
      renderList();
    });

    var pinBtn = document.getElementById('bd-pin-btn');
    if (pinBtn) pinBtn.addEventListener('click', function () {
      var ps = loadPosts(); var pi = ps.findIndex(function(p){return p.id===postId;});
      if (pi !== -1) { ps[pi].isPinned = true; savePosts(ps); renderDetail(postId); }
    });

    var unpinBtn = document.getElementById('bd-unpin-btn');
    if (unpinBtn) unpinBtn.addEventListener('click', function () {
      var ps = loadPosts(); var pi = ps.findIndex(function(p){return p.id===postId;});
      if (pi !== -1) { ps[pi].isPinned = false; savePosts(ps); renderDetail(postId); }
    });

    _bindCommentEvents(postId);
  }

  /* ── 댓글 HTML 빌드 ─────────────────────────────────── */
  function _buildCommentsHtml(postId) {
    var comments = loadComments().filter(function (c) { return c.postId === postId; });
    var topLevel = comments.filter(function (c) { return !c.parentId; });
    var user     = currentUser();
    var admin    = isAdmin();

    var html = '<div class="board-comments">' +
      '<h3 class="board-comments-title">댓글 <span class="board-cmt-total">' + comments.length + '</span>개</h3>' +
      '<div class="board-cmt-write">' +
        '<textarea id="board-cmt-text" class="form-textarea board-cmt-ta" rows="2" placeholder="댓글을 입력하세요..."></textarea>' +
        '<button class="btn btn-primary btn-sm" id="board-cmt-submit">등록</button>' +
      '</div>' +
      '<div id="board-cmt-list" class="board-cmt-list">';

    topLevel.forEach(function (c) {
      var replies = comments.filter(function (r) { return r.parentId === c.id; });
      html += _singleCommentHtml(c, replies, user, admin);
    });

    html += '</div></div>';
    return html;
  }

  function _singleCommentHtml(c, replies, user, admin) {
    var isOwner = user.email && user.email === c.authorEmail;
    var html = '<div class="board-comment" data-cmt-id="' + c.id + '">' +
      '<div class="board-cmt-header">' +
        '<span class="board-cmt-avatar">' + esc((c.authorName || '?')[0]) + '</span>' +
        '<span class="board-cmt-author">' + esc(c.authorName || '') + '</span>' +
        '<span class="board-cmt-date">' + fmtDateTime(c.createdAt) + '</span>' +
      '</div>' +
      '<div class="board-cmt-body">' + esc(c.text || '') + '</div>' +
      '<div class="board-cmt-actions">' +
        '<button class="board-reply-toggle btn-link" data-cmt-id="' + c.id + '">↩ 답글</button>' +
        ((isOwner || admin) ? '<button class="board-cmt-del btn-link danger-link" data-cmt-id="' + c.id + '">삭제</button>' : '') +
      '</div>';

    /* 대댓글 목록 */
    if (replies.length > 0) {
      html += '<div class="board-replies">';
      replies.forEach(function (r) {
        var rOwner = user.email && user.email === r.authorEmail;
        html += '<div class="board-reply" data-cmt-id="' + r.id + '">' +
          '<div class="board-cmt-header">' +
            '<span class="board-reply-indent">↳</span>' +
            '<span class="board-cmt-avatar reply-avatar">' + esc((r.authorName || '?')[0]) + '</span>' +
            '<span class="board-cmt-author">' + esc(r.authorName || '') + '</span>' +
            '<span class="board-cmt-date">' + fmtDateTime(r.createdAt) + '</span>' +
          '</div>' +
          '<div class="board-cmt-body reply-body">' + esc(r.text || '') + '</div>' +
          ((rOwner || admin) ? '<div class="board-cmt-actions"><button class="board-cmt-del btn-link danger-link" data-cmt-id="' + r.id + '">삭제</button></div>' : '') +
        '</div>';
      });
      html += '</div>';
    }

    /* 대댓글 입력폼 */
    html += '<div class="board-reply-form" id="rf-' + c.id + '" hidden>' +
      '<textarea class="form-textarea board-cmt-ta" rows="2" placeholder="답글을 입력하세요..."></textarea>' +
      '<div class="board-reply-form-actions">' +
        '<button class="btn btn-primary btn-sm board-reply-submit" data-parent="' + c.id + '">등록</button>' +
        '<button class="btn btn-ghost btn-sm board-reply-cancel"   data-parent="' + c.id + '">취소</button>' +
      '</div>' +
    '</div>';

    html += '</div>'; // .board-comment
    return html;
  }

  function _bindCommentEvents(postId) {
    var user = currentUser();

    /* 댓글 등록 */
    var submitBtn = document.getElementById('board-cmt-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        var txt = (document.getElementById('board-cmt-text').value || '').trim();
        if (!txt) return;
        if (!user.email) { alert('로그인이 필요합니다.'); return; }
        var comments = loadComments();
        comments.push({ id: genId(), postId: postId, parentId: null,
          text: txt, authorEmail: user.email, authorName: user.name, createdAt: new Date().toISOString() });
        saveComments(comments);
        renderDetail(postId);
        /* 댓글창 스크롤 */
        var cmtList = document.getElementById('board-cmt-list');
        if (cmtList) cmtList.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    }

    /* 답글 토글 */
    document.querySelectorAll('.board-reply-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var form = document.getElementById('rf-' + this.dataset.cmtId);
        if (form) { form.hidden ? form.removeAttribute('hidden') : form.setAttribute('hidden', ''); }
      });
    });

    /* 답글 등록 */
    document.querySelectorAll('.board-reply-submit').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var parentId = this.dataset.parent;
        var form     = document.getElementById('rf-' + parentId);
        var ta       = form && form.querySelector('textarea');
        var txt      = ta ? ta.value.trim() : '';
        if (!txt) return;
        if (!user.email) { alert('로그인이 필요합니다.'); return; }
        var comments = loadComments();
        comments.push({ id: genId(), postId: postId, parentId: parentId,
          text: txt, authorEmail: user.email, authorName: user.name, createdAt: new Date().toISOString() });
        saveComments(comments);
        renderDetail(postId);
      });
    });

    /* 답글 취소 */
    document.querySelectorAll('.board-reply-cancel').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var form = document.getElementById('rf-' + this.dataset.parent);
        if (form) form.setAttribute('hidden', '');
      });
    });

    /* 댓글/답글 삭제 */
    document.querySelectorAll('.board-cmt-del').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var cmtId = this.dataset.cmtId;
        if (!confirm('댓글을 삭제하시겠습니까?')) return;
        /* 대댓글도 함께 삭제 */
        var all = loadComments().filter(function (c) {
          return c.id !== cmtId && c.parentId !== cmtId;
        });
        saveComments(all);
        renderDetail(postId);
      });
    });
  }

  /* ══════════════════════════════════════════════════════
     글쓰기/수정 렌더
  ══════════════════════════════════════════════════════ */
  function renderWrite(editPost) {
    S.view = editPost ? 'edit' : 'write';

    var html = '<div class="board-write">' +
      '<button id="board-write-back" class="board-back-btn">' + (editPost ? '← 취소' : '← 취소') + '</button>' +
      '<h2 class="board-write-title">' + (editPost ? '글 수정' : '새 글 작성') + '</h2>' +

      '<div class="board-write-form">' +

        /* 글 종류 */
        '<div class="board-write-row">' +
          '<label class="form-label">글 종류</label>' +
          '<div class="board-type-wrap">' +
            '<label class="board-type-opt">' +
              '<input type="radio" name="btype" value="general"' +
              (!editPost || editPost.type === 'general' ? ' checked' : '') + '>' +
              '<span>📄 일반 게시글</span>' +
            '</label>' +
            '<label class="board-type-opt">' +
              '<input type="radio" name="btype" value="notice"' +
              (editPost && editPost.type === 'notice' ? ' checked' : '') + '>' +
              '<span>📢 전사알림 <small>(로그인 시 팝업 발송)</small></span>' +
            '</label>' +
          '</div>' +
        '</div>' +

        /* 제목 */
        '<div class="board-write-row">' +
          '<label class="form-label">제목 <span class="req">*</span></label>' +
          '<input type="text" id="bw-title" class="form-input" placeholder="제목을 입력하세요" value="' + esc(editPost ? editPost.title || '' : '') + '">' +
        '</div>' +

        /* 내용 */
        '<div class="board-write-row">' +
          '<label class="form-label">내용 <span class="req">*</span></label>' +
          '<div id="bw-quill-wrap">' +
            /* Quill 없을 때 fallback */
            '<textarea id="bw-textarea" class="form-textarea board-write-ta" rows="14" placeholder="내용을 입력하세요...">' +
            esc(editPost ? _stripHtml(editPost.content || '') : '') +
            '</textarea>' +
          '</div>' +
        '</div>' +

        /* 액션 */
        '<div class="board-write-actions">' +
          '<button class="btn btn-primary" id="bw-submit">' + (editPost ? '수정 완료' : '게시하기') + '</button>' +
          '<button class="btn btn-ghost"   id="bw-cancel">취소</button>' +
        '</div>' +

      '</div>' + /* .board-write-form */
    '</div>'; /* .board-write */

    var container = document.getElementById('board-content');
    if (!container) return;
    container.innerHTML = html;

    /* Quill 초기화 (있으면) */
    _tryInitQuill(editPost ? editPost.content || '' : '');

    /* 버튼 */
    var backBtn = document.getElementById('board-write-back');
    if (backBtn) backBtn.addEventListener('click', function () {
      if (editPost) renderDetail(editPost.id); else renderList();
    });

    var cancelBtn = document.getElementById('bw-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      if (editPost) renderDetail(editPost.id); else renderList();
    });

    var submitBtn = document.getElementById('bw-submit');
    if (submitBtn) submitBtn.addEventListener('click', function () { _submitPost(editPost); });
  }

  function _stripHtml(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  function _tryInitQuill(content) {
    if (typeof Quill === 'undefined') return; // textarea fallback 유지
    var wrap = document.getElementById('bw-quill-wrap');
    if (!wrap) return;
    var ta = document.getElementById('bw-textarea');
    if (ta) ta.remove(); // textarea 제거 후 Quill 삽입

    var editorEl = document.createElement('div');
    editorEl.id = 'bw-quill-editor';
    wrap.appendChild(editorEl);

    try {
      S.quill = new Quill('#bw-quill-editor', {
        theme: 'snow',
        modules: {
          toolbar: [
            [{ font: [] }, { size: [] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ color: [] }, { background: [] }],
            [{ align: [] }],
            [{ list: 'ordered' }, { list: 'bullet' }],
            [{ indent: '-1' }, { indent: '+1' }],
            ['blockquote', 'link'],
            ['clean']
          ]
        }
      });
      if (content) S.quill.clipboard.dangerouslyPasteHTML(content);
    } catch(e) { S.quill = null; }
  }

  function _getWriteContent() {
    if (S.quill) return S.quill.root.innerHTML;
    var ta = document.getElementById('bw-textarea');
    return ta ? ta.value : '';
  }

  function _submitPost(editPost) {
    var user    = currentUser();
    if (!user.email) { alert('로그인이 필요합니다.'); return; }

    var typeEl  = document.querySelector('input[name="btype"]:checked');
    var type    = typeEl ? typeEl.value : 'general';
    var title   = (document.getElementById('bw-title').value || '').trim();
    var content = _getWriteContent();

    if (!title)   { alert('제목을 입력하세요.');  return; }
    if (!content || content === '<p><br></p>') { alert('내용을 입력하세요.'); return; }

    var posts = loadPosts();

    if (editPost) {
      var idx = posts.findIndex(function (p) { return p.id === editPost.id; });
      if (idx !== -1) {
        posts[idx].title     = title;
        posts[idx].content   = content;
        posts[idx].type      = type;
        posts[idx].updatedAt = new Date().toISOString();
        savePosts(posts);
        renderDetail(editPost.id);
      }
    } else {
      var newPost = {
        id: genId(), type: type, title: title, content: content,
        authorEmail: user.email, authorName: user.name,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        views: 0, isPinned: false, isActive: true
      };
      posts.unshift(newPost);
      savePosts(posts);

      if (type === 'notice') {
        sendBrowserNotif('📢 전사알림: ' + title, '새로운 전사알림이 등록되었습니다.', 'notice-' + newPost.id);
      }

      S.quill = null;
      renderDetail(newPost.id);
    }
    S.quill = null;
  }

  /* ══════════════════════════════════════════════════════
     전사알림 팝업 초기화
  ══════════════════════════════════════════════════════ */
  function _initNoticePopup() {
    var closeBtn = document.getElementById('bnp-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        var popup = document.getElementById('board-notice-popup');
        var user  = currentUser();
        if (popup && popup._currentNotice) markNoticeRead(user.email, popup._currentNotice.id);
        if (popup) popup.setAttribute('hidden', '');
        document.body.classList.remove('notice-popup-open');
        updateBadge();
        /* 남은 알림 표시 */
        if (popup && popup._remainNotices && popup._remainNotices.length > 0) {
          setTimeout(function () { showNoticePopup(popup._remainNotices); }, 400);
        }
      });
    }

    var viewBtn = document.getElementById('bnp-view-btn');
    if (viewBtn) {
      viewBtn.addEventListener('click', function () {
        var popup = document.getElementById('board-notice-popup');
        if (!popup || !popup._currentNotice) return;
        var user = currentUser();
        markNoticeRead(user.email, popup._currentNotice.id);
        var postId = popup._currentNotice.id;
        popup.setAttribute('hidden', '');
        document.body.classList.remove('notice-popup-open');
        updateBadge();
        /* 게시판 탭으로 이동 */
        var tabBtn = document.querySelector('.tab-btn[data-tab="board"]');
        if (tabBtn) tabBtn.click();
        setTimeout(function () { renderDetail(postId); }, 150);
      });
    }

    var allReadBtn = document.getElementById('bnp-allread-btn');
    if (allReadBtn) {
      allReadBtn.addEventListener('click', function () {
        var popup = document.getElementById('board-notice-popup');
        var user  = currentUser();
        var unread = getUnreadNotices(user.email);
        unread.forEach(function (n) { markNoticeRead(user.email, n.id); });
        if (popup) popup.setAttribute('hidden', '');
        document.body.classList.remove('notice-popup-open');
        updateBadge();
      });
    }
  }

  /* ══════════════════════════════════════════════════════
     공개 API
  ══════════════════════════════════════════════════════ */
  function init() {
    _initNoticePopup();
    if (Notification && Notification.permission === 'granted') _notifGranted = true;
    updateBadge();
  }

  function onTabOpen() {
    S.quill = null;
    renderList();
  }

  function checkAndShowNotices(userEmail) {
    var unread = getUnreadNotices(userEmail);
    if (unread.length > 0) {
      setTimeout(function () { showNoticePopup(unread); }, 1200);
    }
    updateBadge();
  }

  window.BoardModule = {
    init: init,
    onTabOpen: onTabOpen,
    checkAndShowNotices: checkAndShowNotices,
    requestNotifPerm: requestNotifPerm,
    updateBadge: updateBadge,
    getUnreadNotices: getUnreadNotices
  };
})();
