// gas_docgate_log.gs — 서류 다운로드 게이트 v2 GAS 백엔드 (전사 서식 관리)
// Google Apps Script 프로젝트에 붙여넣고 웹앱으로 배포하세요.
// 배포 설정: 나로 실행 / 모든 사용자 액세스 (기존 배포는 「배포 관리 → 새 버전」으로 URL 유지)
// 필요 권한: 스프레드시트, 드라이브, 외부 요청(UrlFetchApp), CacheService, LockService
//
// 보안 원칙
//  - 모든 요청은 Google 액세스 토큰을 본문(body)으로 받아 userinfo 로 이메일을 서버에서 확인한다.
//  - 섹션별 열람(access/allowed)·관리(managers)·전체 관리(SUPERS) 권한을 서버에서 검사한다.
//  - 파일은 이 스크립트 소유자 권한으로 읽어 1회용 티켓(60초)으로만 내려준다.
//  - 삭제는 휴지통 우선, 영구 삭제는 휴지통 항목만 가능, 모든 변경은 DocAudit 에 남긴다.

var SHEET_ID = '1suLdv2AvEeEcg2dUVpTXaAEBI18DoDdcqzED87RYGMg';
var SUPERS = ['bangdw@gmail.com'];          // 전체 관리자(추가 관리자는 DocConfig 'supers')
var TICKET_TTL = 60;                         // 초
var MAX_DL = 25 * 1024 * 1024;               // 다운로드 상한
var MAX_UP = 15 * 1024 * 1024;               // 업로드 상한
var BLOCK_EXT = /\.(exe|bat|cmd|com|scr|msi|ps1|vbs|js|jar|dll|apk|sh)$/i;

var T = { SEC: 'DocSections', ITEM: 'DocItems', VER: 'DocVersions', AUD: 'DocAudit', CFG: 'DocConfig', LOG: 'DocLog' };
var H = {
  DocSections: ['id', 'name', 'folderId', 'order', 'access', 'allowed', 'managers', 'hidden'],
  DocItems: ['id', 'sectionId', 'parentId', 'type', 'name', 'aliases', 'keyword', 'fileId', 'fileName',
             'order', 'status', 'updatedBy', 'updatedAt', 'note', 'dl'],
  DocVersions: ['id', 'itemId', 'fileId', 'fileName', 'size', 'uploadedBy', 'at', 'note'],
  DocAudit: ['at', 'email', 'action', 'target', 'detail', 'sectionId'],
  DocConfig: ['key', 'value'],
  DocLog: ['신청일시', '이름', '이메일', '직함', '서류명', '파일ID', '사유', 'User-Agent', '다운로드', '서류ID', '섹션ID']
};
var WRITE = { secSave: 1, secOrder: 1, secDelete: 1, cfgSave: 1, migrate: 1, itemCreate: 1, itemUpdate: 1,
              itemMove: 1, itemTrash: 1, itemRestore: 1, itemPurge: 1, upload: 1, versionRestore: 1 };

/* ── 시트 유틸 ─────────────────────────────────────────────────── */
function _sheet(name) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var head = H[name], have = sh.getLastColumn();
  if (sh.getLastRow() === 0) {
    sh.appendRow(head); sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
  } else if (have < head.length) {                       // 신규 열 보강(기존 DocLog 호환)
    sh.getRange(1, have + 1, 1, head.length - have).setValues([head.slice(have)]).setFontWeight('bold');
  }
  return sh;
}
function _rows(name) {
  var sh = _sheet(name), n = sh.getLastRow();
  if (n <= 1) return [];
  var head = H[name], vals = sh.getRange(2, 1, n - 1, head.length).getValues();
  return vals.map(function (v, i) {
    var o = { _row: i + 2 };
    head.forEach(function (h, k) { o[h] = v[k] === undefined ? '' : v[k]; });
    return o;
  });
}
function _put(name, o) {                                  // o._row 있으면 갱신, 없으면 추가
  var sh = _sheet(name), head = H[name];
  var arr = head.map(function (h) { return o[h] === undefined || o[h] === null ? '' : o[h]; });
  if (o._row) sh.getRange(o._row, 1, 1, head.length).setValues([arr]);
  else { sh.appendRow(arr); o._row = sh.getLastRow(); }
  return o;
}
function _now() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'); }
function _id() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function _err(msg, code) { var e = new Error(msg); e.code = code || 'ERR'; return e; }
function _json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function _list(s) { return String(s || '').split(/[,\n;]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean); }
function _cfg(key) {
  var r = _rows(T.CFG).filter(function (x) { return x.key === key; })[0];
  return r ? String(r.value) : '';
}
function _cfgSet(key, value) {
  var r = _rows(T.CFG).filter(function (x) { return x.key === key; })[0] || { key: key };
  r.value = value; _put(T.CFG, r);
}
function _audit(email, action, target, detail, sectionId) {
  _put(T.AUD, { at: _now(), email: email, action: action, target: target || '', detail: detail || '', sectionId: sectionId || '' });
}

/* ── 인증·권한 ─────────────────────────────────────────────────── */
function _auth(token) {
  if (!token) throw _err('로그인이 필요합니다', 'AUTH');
  var cache = CacheService.getScriptCache();
  var key = 'u:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var res = UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw _err('로그인이 만료되었습니다. 다시 로그인하세요', 'AUTH');
  var u = JSON.parse(res.getContentText());
  if (!u.email || u.email_verified === false) throw _err('확인된 Google 계정이 아닙니다', 'AUTH');
  var me = { email: String(u.email).toLowerCase(), name: u.name || '' };
  me.isSuper = _isSuper(me.email);
  cache.put(key, JSON.stringify(me), 300);
  return me;
}
function _isSuper(email) { return SUPERS.indexOf(email) >= 0 || _list(_cfg('supers')).indexOf(email) >= 0; }
function _canManage(me, sec) { return !!sec && (me.isSuper || _list(sec.managers).indexOf(me.email) >= 0); }
function _canView(me, sec) {
  if (!sec) return false;
  if (_canManage(me, sec)) return true;
  if (String(sec.hidden) === '1' || sec.hidden === true) return false;
  if (sec.access === 'all') return true;
  return _list(sec.allowed).some(function (a) {
    return a === '*' || a === me.email || (a.charAt(0) === '@' && me.email.slice(-a.length) === a);
  });
}
function _sec(id) { return _rows(T.SEC).filter(function (s) { return s.id === id; })[0]; }
function _item(id) {
  var it = _rows(T.ITEM).filter(function (x) { return x.id === id; })[0];
  if (!it) throw _err('항목을 찾을 수 없습니다');
  return it;
}
function _needManage(me, sectionId) {
  var s = _sec(sectionId);
  if (!s) throw _err('섹션을 찾을 수 없습니다');
  if (!_canManage(me, s)) throw _err('이 섹션을 관리할 권한이 없습니다', 'PERM');
  return s;
}
function _needSuper(me) { if (!me.isSuper) throw _err('전체 관리자만 할 수 있습니다', 'PERM'); }
function _name(s) {
  s = String(s || '').replace(/[\\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) throw _err('이름을 입력하세요');
  if (s.length > 100) throw _err('이름은 100자 이내로 입력하세요');
  return s;
}
function _isTrash(it) { return it.status === 'trash'; }
function _kids(all, id) { return all.filter(function (x) { return x.parentId === id; }); }
function _tree(all, id) {                                  // id 와 모든 하위
  var out = [], q = [id];
  while (q.length) { var cur = q.shift(); out.push(cur); _kids(all, cur).forEach(function (k) { q.push(k.id); }); }
  return out;
}
function _sibNameTaken(all, sectionId, parentId, name, exceptIds) {
  var low = name.toLowerCase();
  return all.some(function (x) {
    return x.sectionId === sectionId && x.parentId === parentId && !_isTrash(x) &&
      exceptIds.indexOf(x.id) < 0 && String(x.name).toLowerCase() === low;
  });
}
function _renumber(sectionId, parentId, orderedIds) {
  var all = _rows(T.ITEM), byId = {};
  all.forEach(function (x) { byId[x.id] = x; });
  orderedIds.forEach(function (id, i) { if (byId[id]) { byId[id].order = (i + 1) * 10; _put(T.ITEM, byId[id]); } });
}
function _sorted(arr) {
  return arr.slice().sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name).localeCompare(String(b.name), 'ko'); });
}
function _pub(it) {
  return { id: it.id, sectionId: it.sectionId, parentId: it.parentId, type: it.type, name: it.name, aliases: it.aliases,
           order: Number(it.order) || 0, updatedAt: it.updatedAt, dl: Number(it.dl) || 0 };
}

/* ── 엔트리 ────────────────────────────────────────────────────── */
function doGet() { return _json({ ok: true, service: 'docgate', v: 2 }); }

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    var fn = ACTIONS[body.action];
    if (!fn) throw _err('알 수 없는 요청입니다');
    var me = _auth(body.token);
    var lock = WRITE[body.action] ? LockService.getScriptLock() : null;
    if (lock) lock.waitLock(20000);
    try { return _json({ ok: true, data: fn(me, body) }); }
    finally { if (lock) lock.releaseLock(); }
  } catch (err) {
    return _json({ ok: false, error: err.message, code: err.code || 'ERR' });
  }
}

/* ── 조회 ──────────────────────────────────────────────────────── */
var ACTIONS = {
  // 사용자 첫 화면: 내가 볼 수 있는 섹션·항목 한 번에
  bootstrap: function (me) {
    var secs = _sorted(_rows(T.SEC)).filter(function (s) { return _canView(me, s); });
    var ok = {}; secs.forEach(function (s) { ok[s.id] = 1; });
    var items = _rows(T.ITEM).filter(function (x) { return ok[x.sectionId] && !_isTrash(x); });
    var managed = _rows(T.SEC).filter(function (s) { return _canManage(me, s); }).map(function (s) { return s.id; });
    return {
      me: { email: me.email, name: me.name, isSuper: me.isSuper, managed: managed },
      depts: _cfg('depts'),
      sections: secs.map(function (s) { return { id: s.id, name: s.name }; }),
      items: items.map(_pub)
    };
  },

  // 관리 화면: 내가 관리하는 섹션 + 항목(휴지통 포함)
  adminData: function (me) {
    var secs = _sorted(_rows(T.SEC)).filter(function (s) { return _canManage(me, s); });
    var ok = {}; secs.forEach(function (s) { ok[s.id] = 1; });
    if (!secs.length) throw _err('관리 권한이 없습니다', 'PERM');
    var items = _rows(T.ITEM).filter(function (x) { return ok[x.sectionId]; }).map(function (x) {
      var p = _pub(x); p.status = x.status; p.keyword = x.keyword; p.fileName = x.fileName; p.note = x.note;
      p.updatedBy = x.updatedBy; p.hasFile = !!x.fileId; return p;
    });
    var vc = {};
    _rows(T.VER).forEach(function (v) { vc[v.itemId] = (vc[v.itemId] || 0) + 1; });
    items.forEach(function (p) { p.versions = vc[p.id] || 0; });
    return {
      me: { email: me.email, name: me.name, isSuper: me.isSuper },
      sections: secs.map(function (s) {
        return { id: s.id, name: s.name, folderId: s.folderId, access: s.access, allowed: s.allowed,
                 managers: s.managers, hidden: String(s.hidden) === '1' };
      }),
      items: items, depts: _cfg('depts'), supers: me.isSuper ? _cfg('supers') : ''
    };
  },

  /* ── 다운로드 ─────────────────────────────────────────────────── */
  issue: function (me, b) {
    var it = _item(b.itemId), sec = _sec(it.sectionId);
    if (it.type !== 'doc' || _isTrash(it)) throw _err('서류를 찾을 수 없습니다');
    if (!_canView(me, sec)) throw _err('열람 권한이 없습니다', 'PERM');
    var file = _resolveFile(it, sec);
    var p = b.profile || {}, tid = _id() + _id();
    CacheService.getScriptCache().put('t:' + tid,
      JSON.stringify({ fileId: file.getId(), itemId: it.id, email: me.email, title: p.title || '', reason: b.reason || '',
                       name: p.name || '', ua: String(b.ua || '').slice(0, 200) }), TICKET_TTL + 30);
    _logRow(me, p, file.getName(), file.getId(), b.reason, '링크발급', it, b.ua);
    return { ticket: tid, fileName: file.getName(), ttl: TICKET_TTL };
  },

  fetch: function (me, b) {
    var cache = CacheService.getScriptCache(), raw = cache.get('t:' + b.ticket);
    if (!raw) throw _err('링크가 만료되었습니다. 다시 신청하세요');
    var t = JSON.parse(raw);
    if (t.email !== me.email) throw _err('신청자와 다른 계정입니다', 'PERM');
    cache.remove('t:' + b.ticket);                        // 1회용
    var file = DriveApp.getFileById(t.fileId), blob, name = file.getName();
    var mime = file.getMimeType();
    if (mime.indexOf('application/vnd.google-apps') === 0) {
      blob = file.getAs('application/pdf'); name += '.pdf';
    } else {
      if (file.getSize() > MAX_DL) throw _err('파일이 25MB를 넘어 내려받을 수 없습니다. 담당자에게 문의하세요');
      blob = file.getBlob();
    }
    var lock = LockService.getScriptLock(), it;
    lock.waitLock(20000);
    try {
      it = _rows(T.ITEM).filter(function (x) { return x.id === t.itemId; })[0];
      if (it) { it.dl = (Number(it.dl) || 0) + 1; _put(T.ITEM, it); }
      _logRow(me, { name: t.name, title: t.title }, name, t.fileId, t.reason, '완료', it, t.ua);
    } finally { lock.releaseLock(); }
    return { name: name, mime: blob.getContentType() || mime, b64: Utilities.base64Encode(blob.getBytes()) };
  },

  /* ── 섹션(전체 관리자) ────────────────────────────────────────── */
  secSave: function (me, b) {
    _needSuper(me);
    var name = _name(b.name), folderId = String(b.folderId || '').trim();
    if (!folderId) throw _err('Drive 폴더 ID를 입력하세요');
    var fname;
    try { fname = DriveApp.getFolderById(folderId).getName(); }
    catch (x) { throw _err('폴더를 열 수 없습니다. ID와 공유 권한(스크립트 소유자)을 확인하세요'); }
    var access = b.access === 'all' ? 'all' : 'restricted';
    var rows = _rows(T.SEC), s = b.id ? rows.filter(function (x) { return x.id === b.id; })[0] : null;
    if (b.id && !s) throw _err('섹션을 찾을 수 없습니다');
    if (rows.some(function (x) { return x.id !== b.id && String(x.name).toLowerCase() === name.toLowerCase(); }))
      throw _err('같은 이름의 섹션이 있습니다');
    s = s || { id: _id(), order: (rows.length + 1) * 10 };
    s.name = name; s.folderId = folderId; s.access = access;
    s.allowed = _list(b.allowed).join(','); s.managers = _list(b.managers).join(',');
    s.hidden = b.hidden ? 1 : 0;
    _put(T.SEC, s);
    _audit(me.email, b.id ? '섹션수정' : '섹션생성', name, '폴더 ' + fname + ' / 열람 ' + access, s.id);
    return { id: s.id, folderName: fname };
  },
  secOrder: function (me, b) {
    _needSuper(me);
    var byId = {}; _rows(T.SEC).forEach(function (s) { byId[s.id] = s; });
    (b.ids || []).forEach(function (id, i) { if (byId[id]) { byId[id].order = (i + 1) * 10; _put(T.SEC, byId[id]); } });
    return true;
  },
  secDelete: function (me, b) {
    _needSuper(me);
    var s = _sec(b.id); if (!s) throw _err('섹션을 찾을 수 없습니다');
    if (_rows(T.ITEM).some(function (x) { return x.sectionId === s.id; }))
      throw _err('섹션 안에 항목이 있습니다. 먼저 항목을 영구 삭제하거나 이동하세요');
    _sheet(T.SEC).deleteRow(s._row);
    _audit(me.email, '섹션삭제', s.name, '', s.id);
    return true;
  },
  cfgSave: function (me, b) {
    _needSuper(me);
    if (b.depts !== undefined) _cfgSet('depts', String(b.depts).slice(0, 2000));
    if (b.supers !== undefined) _cfgSet('supers', _list(b.supers).join(','));
    _audit(me.email, '설정변경', '', '부서목록/전체관리자', '');
    return true;
  },

  /* ── 항목(폴더·서식) ──────────────────────────────────────────── */
  itemCreate: function (me, b) {
    var sec = _needManage(me, b.sectionId), all = _rows(T.ITEM);
    var type = b.type === 'folder' ? 'folder' : 'doc', parentId = b.parentId || '';
    if (parentId) {
      var par = all.filter(function (x) { return x.id === parentId; })[0];
      if (!par || par.type !== 'folder' || par.sectionId !== sec.id || _isTrash(par)) throw _err('상위 폴더가 올바르지 않습니다');
    }
    var name = _name(b.name);
    if (_sibNameTaken(all, sec.id, parentId, name, [])) throw _err('같은 이름이 이미 있습니다: ' + name);
    var sibs = all.filter(function (x) { return x.sectionId === sec.id && x.parentId === parentId && !_isTrash(x); });
    var it = _put(T.ITEM, { id: _id(), sectionId: sec.id, parentId: parentId, type: type, name: name,
      aliases: String(b.aliases || '').slice(0, 300), keyword: type === 'doc' ? String(b.keyword || '').slice(0, 100) : '',
      fileId: '', fileName: '', order: (sibs.length + 1) * 10, status: 'active', updatedBy: me.email, updatedAt: _now(),
      note: String(b.note || '').slice(0, 300), dl: 0 });
    _audit(me.email, type === 'folder' ? '폴더생성' : '서식등록', name, '', sec.id);
    return { id: it.id };
  },

  itemUpdate: function (me, b) {
    var it = _item(b.id), sec = _needManage(me, it.sectionId), all = _rows(T.ITEM), log = [];
    if (b.name !== undefined && _name(b.name) !== it.name) {
      var nn = _name(b.name);
      if (_sibNameTaken(all, it.sectionId, it.parentId, nn, [it.id])) throw _err('같은 이름이 이미 있습니다: ' + nn);
      log.push('이름 ' + it.name + ' → ' + nn); it.name = nn;
    }
    if (b.aliases !== undefined) { it.aliases = String(b.aliases).slice(0, 300); log.push('별칭'); }
    if (b.keyword !== undefined && it.type === 'doc') { it.keyword = String(b.keyword).slice(0, 100); log.push('검색어'); }
    if (b.note !== undefined) { it.note = String(b.note).slice(0, 300); log.push('메모'); }
    it.updatedBy = me.email; it.updatedAt = _now(); _put(T.ITEM, it);
    _audit(me.email, '속성수정', it.name, log.join(', '), sec.id);
    return true;
  },

  // ids 를 (sectionId,parentId) 아래로 이동. beforeId 앞에 끼워 넣기(없으면 맨 뒤)
  itemMove: function (me, b) {
    var all = _rows(T.ITEM), ids = b.ids || [], toSec = _needManage(me, b.sectionId), parentId = b.parentId || '';
    if (parentId) {
      var par = all.filter(function (x) { return x.id === parentId; })[0];
      if (!par || par.type !== 'folder' || par.sectionId !== toSec.id || _isTrash(par)) throw _err('이동할 폴더가 올바르지 않습니다');
    }
    var byId = {}; all.forEach(function (x) { byId[x.id] = x; });
    ids.forEach(function (id) {
      var it = byId[id]; if (!it) throw _err('항목을 찾을 수 없습니다');
      _needManage(me, it.sectionId);
      if (_isTrash(it)) throw _err('휴지통 항목은 이동할 수 없습니다');
      var sub = _tree(all, id);
      if (parentId && sub.indexOf(parentId) >= 0) throw _err('폴더를 자기 자신 안으로 옮길 수 없습니다');
      if (it.sectionId !== toSec.id) {
        sub.forEach(function (sid) {
          var x = byId[sid];
          if (x.type === 'doc' && !x.fileId) throw _err('「' + x.name + '」은(는) 폴더 검색 방식이라 다른 섹션으로 옮길 수 없습니다');
        });
      }
      if (_sibNameTaken(all, toSec.id, parentId, it.name, ids))
        throw _err('대상 위치에 같은 이름이 있습니다: ' + it.name);
    });
    ids.forEach(function (id) {
      var it = byId[id], sub = _tree(all, id);
      it.parentId = parentId; it.updatedBy = me.email; it.updatedAt = _now();
      sub.forEach(function (sid) { byId[sid].sectionId = toSec.id; _put(T.ITEM, byId[sid]); });
    });
    var sibs = _sorted(all.filter(function (x) { return x.sectionId === toSec.id && x.parentId === parentId && !_isTrash(x) && ids.indexOf(x.id) < 0; }));
    var order = sibs.map(function (x) { return x.id; });
    var at = b.beforeId ? order.indexOf(b.beforeId) : -1;
    if (at < 0) at = order.length;
    order.splice.apply(order, [at, 0].concat(ids));
    _renumber(toSec.id, parentId, order);
    _audit(me.email, '이동', ids.map(function (i) { return byId[i].name; }).join(', '), '→ ' + toSec.name, toSec.id);
    return true;
  },

  itemTrash: function (me, b) {
    var all = _rows(T.ITEM), byId = {}; all.forEach(function (x) { byId[x.id] = x; });
    (b.ids || []).forEach(function (id) {
      var it = byId[id]; if (!it) return;
      _needManage(me, it.sectionId);
      _tree(all, id).forEach(function (sid) { var x = byId[sid]; x.status = 'trash'; x.updatedBy = me.email; x.updatedAt = _now(); _put(T.ITEM, x); });
      _audit(me.email, '휴지통', it.name, '', it.sectionId);
    });
    return true;
  },

  itemRestore: function (me, b) {
    var all = _rows(T.ITEM), byId = {}; all.forEach(function (x) { byId[x.id] = x; });
    (b.ids || []).forEach(function (id) {
      var it = byId[id]; if (!it) return;
      _needManage(me, it.sectionId);
      if (it.parentId && (!byId[it.parentId] || _isTrash(byId[it.parentId]))) it.parentId = '';
      var nm = it.name;
      while (_sibNameTaken(all, it.sectionId, it.parentId, nm, [it.id])) nm += ' (복원)';
      it.name = nm;
      _tree(all, id).forEach(function (sid) { var x = byId[sid]; x.status = 'active'; x.updatedBy = me.email; x.updatedAt = _now(); _put(T.ITEM, x); });
      _audit(me.email, '복원', nm, '', it.sectionId);
    });
    return true;
  },

  itemPurge: function (me, b) {
    var all = _rows(T.ITEM), byId = {}; all.forEach(function (x) { byId[x.id] = x; });
    var vers = _rows(T.VER), kill = [];
    (b.ids || []).forEach(function (id) {
      var it = byId[id]; if (!it) return;
      _needManage(me, it.sectionId);
      if (!_isTrash(it)) throw _err('휴지통에 있는 항목만 영구 삭제할 수 있습니다');
      _tree(all, id).forEach(function (sid) { kill.push(byId[sid]); });
      _audit(me.email, '영구삭제', it.name, '', it.sectionId);
    });
    var killIds = kill.map(function (x) { return x.id; });
    vers.filter(function (v) { return killIds.indexOf(v.itemId) >= 0; }).forEach(function (v) {
      try { DriveApp.getFileById(v.fileId).setTrashed(true); } catch (x) {}   // Drive 휴지통(30일 복구 가능)
    });
    var rows = kill.map(function (x) { return x._row; }).concat(
      vers.filter(function (v) { return killIds.indexOf(v.itemId) >= 0; }).map(function (v) { return -v._row; }));
    var itemRows = rows.filter(function (r) { return r > 0; }).sort(function (a, c) { return c - a; });
    var verRows = rows.filter(function (r) { return r < 0; }).map(function (r) { return -r; }).sort(function (a, c) { return c - a; });
    itemRows.forEach(function (r) { _sheet(T.ITEM).deleteRow(r); });
    verRows.forEach(function (r) { _sheet(T.VER).deleteRow(r); });
    return true;
  },

  /* ── 파일 업로드·버전 ─────────────────────────────────────────── */
  upload: function (me, b) {
    var it = _item(b.itemId), sec = _needManage(me, it.sectionId);
    if (it.type !== 'doc' || _isTrash(it)) throw _err('서류 항목에만 올릴 수 있습니다');
    var fname = _name(b.fileName);
    if (BLOCK_EXT.test(fname)) throw _err('보안상 올릴 수 없는 파일 형식입니다');
    var b64 = String(b.b64 || '');
    if (!b64) throw _err('파일이 비어 있습니다');
    if (b64.length * 0.75 > MAX_UP) throw _err('파일은 15MB 이하만 올릴 수 있습니다');
    var folder;
    try { folder = DriveApp.getFolderById(sec.folderId); } catch (x) { throw _err('섹션 폴더를 열 수 없습니다. 전체 관리자에게 문의하세요'); }
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), b.mime || 'application/octet-stream', fname);
    var file = folder.createFile(blob);
    _put(T.VER, { id: _id(), itemId: it.id, fileId: file.getId(), fileName: fname, size: file.getSize(),
                  uploadedBy: me.email, at: _now(), note: String(b.note || '').slice(0, 200) });
    it.fileId = file.getId(); it.fileName = fname; it.updatedBy = me.email; it.updatedAt = _now();
    _put(T.ITEM, it);
    _audit(me.email, '파일등록', it.name, fname + ' (' + file.getSize() + 'B)', sec.id);
    return { fileName: fname };
  },
  versions: function (me, b) {
    var it = _item(b.itemId); _needManage(me, it.sectionId);
    return _rows(T.VER).filter(function (v) { return v.itemId === it.id; }).reverse().map(function (v) {
      return { id: v.id, fileName: v.fileName, size: Number(v.size) || 0, uploadedBy: v.uploadedBy, at: v.at, note: v.note,
               current: v.fileId === it.fileId };
    });
  },
  versionRestore: function (me, b) {
    var it = _item(b.itemId), sec = _needManage(me, it.sectionId);
    var v = _rows(T.VER).filter(function (x) { return x.id === b.versionId && x.itemId === it.id; })[0];
    if (!v) throw _err('버전을 찾을 수 없습니다');
    it.fileId = v.fileId; it.fileName = v.fileName; it.updatedBy = me.email; it.updatedAt = _now(); _put(T.ITEM, it);
    _audit(me.email, '버전복원', it.name, v.fileName + ' (' + v.at + ')', sec.id);
    return true;
  },

  /* ── 로그·이력 ────────────────────────────────────────────────── */
  logs: function (me) {
    var mySecs = {}; _rows(T.SEC).forEach(function (s) { if (_canManage(me, s)) mySecs[s.id] = 1; });
    if (!me.isSuper && !Object.keys(mySecs).length) throw _err('관리 권한이 없습니다', 'PERM');
    var rows = _rows(T.LOG).filter(function (r) { return me.isSuper || mySecs[r['섹션ID']]; });
    return rows.slice(-3000).reverse().map(function (r) {
      var o = {}; H.DocLog.forEach(function (h) { if (h !== 'User-Agent') o[h] = r[h]; }); return o;
    });
  },
  audit: function (me) {
    var mySecs = {}; _rows(T.SEC).forEach(function (s) { if (_canManage(me, s)) mySecs[s.id] = 1; });
    if (!me.isSuper && !Object.keys(mySecs).length) throw _err('관리 권한이 없습니다', 'PERM');
    var rows = _rows(T.AUD).filter(function (r) { return me.isSuper || mySecs[r.sectionId]; });
    return rows.slice(-2000).reverse().map(function (r) { return { at: r.at, email: r.email, action: r.action, target: r.target, detail: r.detail }; });
  },

  /* ── 기존 법인서류(DocCategories) 가져오기 — 전체 관리자, 1회용·재실행 안전 ── */
  migrate: function (me, b) {
    _needSuper(me);
    var folderId = String(b.folderId || '').trim(), name = _name(b.sectionName || '법인 서류');
    var sec = _rows(T.SEC).filter(function (s) { return s.name === name; })[0];
    if (!sec) {
      ACTIONS.secSave(me, { name: name, folderId: folderId, access: 'restricted', allowed: '', managers: me.email });
      sec = _rows(T.SEC).filter(function (s) { return s.name === name; })[0];
    }
    var ss = SpreadsheetApp.openById(SHEET_ID), cat = ss.getSheetByName('DocCategories');
    var added = 0;
    if (cat && cat.getLastRow() > 1) {
      var vals = cat.getRange(2, 1, cat.getLastRow() - 1, 2).getValues();
      vals.forEach(function (v) {
        var nm = String(v[1] || '').trim(); if (!nm) return;
        var all = _rows(T.ITEM);
        if (_sibNameTaken(all, sec.id, '', nm.replace(/[\\\/:*?"<>|]/g, ' '), [])) return;
        ACTIONS.itemCreate(me, { sectionId: sec.id, type: 'doc', name: nm, keyword: nm });
        added++;
      });
    }
    _audit(me.email, '가져오기', name, added + '건', sec.id);
    return { sectionId: sec.id, added: added };
  }
};

function _resolveFile(it, sec) {
  if (it.fileId) {
    try { return DriveApp.getFileById(it.fileId); } catch (x) { throw _err('등록된 파일을 열 수 없습니다. 담당자에게 문의하세요'); }
  }
  var kw = String(it.keyword || it.name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var folder;
  try { folder = DriveApp.getFolderById(sec.folderId); } catch (x) { throw _err('섹션 폴더를 열 수 없습니다. 전체 관리자에게 문의하세요'); }
  var iter = folder.searchFiles("title contains '" + kw + "' and trashed = false"), best = null;
  while (iter.hasNext()) {
    var f = iter.next();
    if (!best || f.getLastUpdated() > best.getLastUpdated()) best = f;
  }
  if (!best) throw _err('「' + it.name + '」에 해당하는 파일을 찾을 수 없습니다. 담당자에게 문의하세요');
  return best;
}

function _logRow(me, p, fileName, fileId, reason, status, it, ua) {
  _put(T.LOG, { '신청일시': _now(), '이름': p.name || me.name, '이메일': me.email, '직함': p.title || '',
    '서류명': fileName, '파일ID': fileId, '사유': reason || p.reason || '', 'User-Agent': String(ua || '').slice(0, 200),
    '다운로드': status, '서류ID': it ? it.id : '', '섹션ID': it ? it.sectionId : '' });
}
