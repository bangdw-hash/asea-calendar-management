'use strict';
/**
 * aseasurvey-form.js — 문항 렌더러(학생 화면 · 관리자 미리보기 공용)
 *  SVY.Form.html(q, ctx)       문항 1개의 HTML
 *  SVY.Form.attach(root, env)   이벤트 위임(입력 → env.getAns(scope)[qid] 갱신 → env.onChange)
 *  SVY.Form.state(q, a, c, def) 'hidden' | 'skip' | 'empty' | 'invalid' | 'ok'
 *  env: { def, qmap, getAns(scopeId), getCommon(), onChange(scopeId, qid), upload(q, file)->Promise<meta>, removeFile(meta),
 *         toast(msg), counts, seed, preview(bool) }
 *  주소: 카카오(다음) 우편번호 서비스(도로명 검색·자동완성), 현재 위치: 브라우저 위치(동의 후) + OpenStreetMap 역지오코딩(참고용)
 */
(function () {
  var S = window.SVY, E = S.esc, I = S.ico;

  var ICON = {
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5z"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0112 7.4a4.4 4.4 0 017.5 2.5C19.5 15.4 12 20 12 20z"/>',
    thumb: '<path d="M7 11v9H4v-9h3zM7 11l4-7c1.5 0 2.5 1 2.2 2.6L12.7 9H19a1.6 1.6 0 011.6 1.9l-1.3 6.6A2 2 0 0117.4 19H7"/>',
    drag: '<path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01"/>',
    pin: '<path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0113 0c0 5.3-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    cam: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="13" r="3.5"/>',
    pen: '<path d="M4 20l1-4L16.5 4.5a2 2 0 013 3L8 19l-4 1z"/>',
    scan: '<path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M7 12h10"/>',
    clip: '<path d="M20 11.5l-8 8a5 5 0 01-7-7l8.5-8.5a3.3 3.3 0 014.7 4.7L10 17.2a1.7 1.7 0 01-2.4-2.4l7.5-7.5"/>'
  };
  function ic(name, size, filled) { return '<svg class="ico" width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="' + (filled ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[name] || '') + '</svg>'; }

  function ansOf(q, ctx) { return (ctx.a || {})[q.id]; }
  function reqMark(q) { return S.isRequired(q) && q.type !== 'block' ? '<span class="req" aria-label="필수">*</span>' : ''; }
  function opts(q, ctx) {
    var list = q.options || [];
    if (q.randomOptions) list = S.shuffle(list, (ctx.seed || 1) + (q.id || '').length * 7919);
    return list;
  }
  function optFull(q, o, ctx) { var m = S.num(o.max); if (m == null) return false; var n = ((((ctx.counts || {})[q.id]) || {})[o.id]) || 0; return n >= m; }

  /* ───────────── 본문 위젯 ───────────── */
  function bodyHtml(q, ctx) {
    var v = ansOf(q, ctx), t = q.type, a = ctx.a || {}, h = '';
    if (t === 'text') {
      var f = q.format || 'text', max = Math.min(S.num(q.maxLen) || 500, 5000), mode = f === 'number' ? 'decimal' : f === 'phone' ? 'tel' : f === 'email' ? 'email' : f === 'url' ? 'url' : 'text';
      if (q.multiline != null ? q.multiline : !q.format) h = '<textarea class="fld" data-f="text" rows="3" maxlength="' + max + '" placeholder="' + E(q.placeholder || '') + '">' + E(v || '') + '</textarea><div class="cnt">' + (ctx.nudge ? '<span class="nudge">' + E(ctx.nudge) + '</span>' : '') + '<span><span data-cnt>' + String(v || '').length + '</span>/' + max + '</span></div>';
      else h = '<input class="fld" data-f="text" type="' + (f === 'email' ? 'email' : f === 'url' ? 'url' : f === 'phone' ? 'tel' : 'text') + '" inputmode="' + mode + '" autocomplete="off" maxlength="' + max + '" placeholder="' + E(q.placeholder || '') + '" value="' + E(v || '') + '">' + (f === 'number' && (q.min != null || q.max != null) ? '<div class="hint">' + (q.min != null ? E(q.min) : '') + ' ~ ' + (q.max != null ? E(q.max) : '') + (q.integer ? ' (정수)' : '') + '</div>' : '');
    } else if (t === 'single' || t === 'multi') {
      var isM = t === 'multi', arr = isM ? (Array.isArray(v) ? v : []) : null, list = opts(q, ctx), disp = q.display;
      if (disp === 'dropdown' && !isM) {
        h = '<select class="fld" data-f="sel"><option value="">선택해 주십시오</option>' + list.map(function (o) { return '<option value="' + E(o.id) + '"' + (v === o.id ? ' selected' : '') + (optFull(q, o, ctx) ? ' disabled' : '') + '>' + E(o.label) + (optFull(q, o, ctx) ? ' (마감)' : '') + '</option>'; }).join('') + (q.other ? '<option value="__other"' + (v === '__other' ? ' selected' : '') + '>기타</option>' : '') + '</select>';
      } else if (disp === 'image') {
        h = '<div class="imgopts">' + list.map(function (o) { var on = isM ? arr.indexOf(o.id) >= 0 : v === o.id, full = optFull(q, o, ctx); return '<button type="button" class="imgopt" data-f="opt" data-v="' + E(o.id) + '" aria-pressed="' + on + '"' + (full ? ' disabled' : '') + '>' + (o.image ? '<img alt="" src="' + E(o.image) + '">' : '<span class="noimg">' + I('file', 24) + '</span>') + '<span>' + E(o.label) + (full ? ' (마감)' : '') + '</span></button>'; }).join('') + '</div>';
      } else {
        h = '<div class="opts list" role="' + (isM ? 'group' : 'radiogroup') + '">' + list.map(function (o) { var on = isM ? arr.indexOf(o.id) >= 0 : v === o.id, full = optFull(q, o, ctx); return '<button type="button" class="opt" role="' + (isM ? 'checkbox' : 'radio') + '" data-f="opt" data-v="' + E(o.id) + '" aria-pressed="' + on + '"' + (full ? ' disabled' : '') + '>' + (isM ? '<span class="box">' + I('check', 14) + '</span>' : '<span class="dot"></span>') + '<span>' + E(o.label) + (full ? ' <em class="full">마감</em>' : '') + '</span></button>'; }).join('') +
          (q.other ? '<button type="button" class="opt" role="' + (isM ? 'checkbox' : 'radio') + '" data-f="opt" data-v="__other" aria-pressed="' + (isM ? arr.indexOf('__other') >= 0 : v === '__other') + '">' + (isM ? '<span class="box">' + I('check', 14) + '</span>' : '<span class="dot"></span>') + '<span>기타</span></button>' : '') + '</div>';
      }
      if (q.other && (isM ? arr.indexOf('__other') >= 0 : v === '__other')) h += '<input class="fld other" data-f="other" maxlength="200" placeholder="직접 입력" value="' + E(a[q.id + '_other'] || '') + '">';
      if (isM && (q.minSel != null || q.maxSel != null)) h += '<div class="hint">' + (q.minSel != null ? q.minSel + '개 이상' : '') + (q.minSel != null && q.maxSel != null ? ', ' : '') + (q.maxSel != null ? q.maxSel + '개 이하' : '') + ' 선택</div>';
    } else if (t === 'scale') {
      var sc = S.scaleOf(ctx.def || {}, q), n = sc.length;
      h = '<div class="opts ' + (n <= 5 ? 'n' + n : 'list') + '" role="radiogroup">' + sc.map(function (o) { return '<button type="button" class="opt" role="radio" data-f="pick" data-v="' + o.v + '" aria-pressed="' + (v === o.v) + '">' + E(o.label) + '</button>'; }).join('') + '</div>';
    } else if (t === 'linear') {
      var lo = S.num(q.min) != null ? S.num(q.min) : 1, hi = S.num(q.max) != null ? S.num(q.max) : 5, nums = []; for (var i = lo; i <= hi; i++) nums.push(i);
      h = '<div class="linear" style="grid-template-columns:repeat(' + nums.length + ',1fr)">' + nums.map(function (x) { return '<button type="button" class="opt num" data-f="pick" data-v="' + x + '" aria-pressed="' + (v === x) + '">' + x + '</button>'; }).join('') + '</div>' + (q.lowLabel || q.highLabel ? '<div class="ends"><span>' + E(q.lowLabel || '') + '</span><span>' + E(q.highLabel || '') + '</span></div>' : '');
    } else if (t === 'rating') {
      var mx = S.num(q.max) || 5, icon = q.icon || 'star', cur = typeof v === 'number' ? v : 0;
      h = '<div class="rating" role="radiogroup">' + Array.from({ length: mx }, function (_, k) { var x = k + 1; return '<button type="button" class="rate' + (x <= cur ? ' on' : '') + '" data-f="pick" data-v="' + x + '" role="radio" aria-checked="' + (v === x) + '" aria-label="' + x + '점">' + ic(icon, 34, x <= cur) + '</button>'; }).join('') + '</div>' + (cur ? '<div class="hint">' + cur + ' / ' + mx + '</div>' : '');
    } else if (t === 'nps') {
      h = '<div class="nps">' + Array.from({ length: 11 }, function (_, x) { return '<button type="button" class="opt num" data-f="pick" data-v="' + x + '" aria-pressed="' + (v === x) + '">' + x + '</button>'; }).join('') + '</div><div class="ends"><span>' + E(q.lowLabel || '') + '</span><span>' + E(q.highLabel || '') + '</span></div>';
    } else if (t === 'slider') {
      var smin = S.num(q.min) != null ? S.num(q.min) : 0, smax = S.num(q.max) != null ? S.num(q.max) : 100, step = S.num(q.step) || 1;
      h = '<div class="slider"><input type="range" data-f="slider" min="' + smin + '" max="' + smax + '" step="' + step + '" value="' + (typeof v === 'number' ? v : smin) + '"><div class="sval"><span>' + smin + (q.unit || '') + '</span><b data-sv>' + (typeof v === 'number' ? v + (q.unit || '') : '막대를 움직여 선택') + '</b><span>' + smax + (q.unit || '') + '</span></div></div>';
    } else if (t === 'grid') {
      var gv = (v && typeof v === 'object') ? v : {};
      h = '<div class="grid-q">' + (q.rows || []).map(function (r) {
        var cur = gv[r.id], answered = !S.isEmpty({ type: 'x' }, cur);
        return '<div class="grow' + (answered ? ' done' : '') + '" data-row="' + E(r.id) + '"><div class="grow-l">' + E(r.label) + '</div><div class="gcols">' + (q.cols || []).map(function (c) { var on = q.multi ? (Array.isArray(cur) && cur.indexOf(c.id) >= 0) : cur === c.id; return '<button type="button" class="opt" data-f="cell" data-r="' + E(r.id) + '" data-c="' + E(c.id) + '" aria-pressed="' + on + '">' + E(c.label) + '</button>'; }).join('') + '</div></div>';
      }).join('') + '</div>';
    } else if (t === 'ranking') {
      var rv = Array.isArray(v) ? v : [], rest = opts(q, ctx).filter(function (o) { return rv.indexOf(o.id) < 0; }), need = Math.min(S.num(q.top) || (q.options || []).length, (q.options || []).length);
      h = '<div class="hint">항목을 눌러 ' + (need === (q.options || []).length ? '' : '상위 ' + need + '개를 ') + '순위대로 선택하십시오. 순서는 ↑ ↓ 로 바꿀 수 있습니다.</div>' +
        (rv.length ? '<ol class="ranked">' + rv.map(function (id, k) { var o = (q.options || []).filter(function (x) { return x.id === id; })[0] || { label: id }; return '<li data-id="' + E(id) + '"><b class="rk">' + (k + 1) + '</b><span class="rl">' + E(o.label) + '</span><button type="button" class="mini" data-f="rankup" ' + (k === 0 ? 'disabled' : '') + ' aria-label="위로">' + I('up', 16) + '</button><button type="button" class="mini" data-f="rankdn" ' + (k === rv.length - 1 ? 'disabled' : '') + ' aria-label="아래로">' + I('down', 16) + '</button><button type="button" class="mini" data-f="rankdel" aria-label="제거">' + I('x', 16) + '</button></li>'; }).join('') + '</ol>' : '') +
        (rv.length < need ? '<div class="opts wide">' + rest.map(function (o) { return '<button type="button" class="opt" data-f="rankadd" data-v="' + E(o.id) + '">' + E(o.label) + '</button>'; }).join('') + '</div>' : '') +
        (rv.length ? '<button type="button" class="btn btn-ghost btn-sm" data-f="rankreset" style="margin-top:8px">순위 다시 지정</button>' : '');
    } else if (t === 'constsum') {
      var cv = (v && typeof v === 'object') ? v : {}, tot = S.num(q.total) != null ? S.num(q.total) : 100, sum = Object.keys(cv).reduce(function (s, k) { return s + (Number(cv[k]) || 0); }, 0);
      h = '<div class="sums">' + opts(q, ctx).map(function (o) { return '<label class="sumrow"><span>' + E(o.label) + '</span><input class="fld" type="number" inputmode="decimal" min="0" step="any" data-f="sum" data-o="' + E(o.id) + '" value="' + (cv[o.id] != null ? E(cv[o.id]) : '') + '"><em>' + E(q.unit || '') + '</em></label>'; }).join('') + '</div><div class="sumtot' + (Math.abs(sum - tot) < 1e-9 ? ' ok' : '') + '" data-sumtot>합계 <b>' + sum + '</b> / ' + tot + E(q.unit || '') + ' (남음 ' + (tot - sum) + ')</div>';
    } else if (t === 'date') {
      h = q.includeTime ? '<input class="fld" type="datetime-local" data-f="dt" value="' + E(v || '') + '"' + (q.min ? ' min="' + E(q.min) + 'T00:00"' : '') + (q.max ? ' max="' + E(q.max) + 'T23:59"' : '') + '>' : '<input class="fld" type="date" data-f="dt" value="' + E(v || '') + '"' + (q.min ? ' min="' + E(q.min) + '"' : '') + (q.max ? ' max="' + E(q.max) + '"' : '') + '>';
    } else if (t === 'time') {
      h = '<input class="fld" type="time" data-f="dt" value="' + E(v || '') + '"' + (q.min ? ' min="' + E(q.min) + '"' : '') + (q.max ? ' max="' + E(q.max) + '"' : '') + '>';
    } else if (t === 'file') {
      var fl = Array.isArray(v) ? v : [], cap = Math.min(S.num(q.maxFiles) || 1, 10), acc = ({ image: 'image/*', pdf: 'application/pdf', doc: '.pdf,.doc,.docx,.txt', any: 'image/*,.pdf,.doc,.docx,.txt,.csv' })[q.accept || 'any'];
      h = '<div class="files">' + fl.map(function (f, k) { return '<div class="fitem" data-k="' + k + '">' + (f.preview ? '<img alt="" src="' + E(f.preview) + '">' : '<span class="fico">' + ic('clip', 22) + '</span>') + '<span class="fn">' + E(f.name || '첨부') + '<small>' + (f.size ? S.fmtBytes(f.size) : '') + '</small></span><button type="button" class="mini" data-f="filedel" aria-label="삭제">' + I('x', 16) + '</button></div>'; }).join('') + (ctx.busy && ctx.busy[q.id] ? '<div class="fitem busy">업로드 중…</div>' : '') + '</div>' +
        (fl.length < cap ? '<label class="btn btn-secondary filebtn">' + (q.capture ? ic('cam', 18) + ' 사진 촬영·선택' : ic('clip', 18) + ' 파일 선택') + '<input type="file" class="hide" data-f="file" accept="' + acc + '"' + (q.capture ? ' capture="environment"' : '') + (cap > 1 ? ' multiple' : '') + '></label>' : '') + '<div class="hint">최대 ' + cap + '개 · 파일당 ' + Math.min(S.num(q.maxMB) || 3, 3) + 'MB 이하' + (q.accept === 'image' || q.capture ? ' · 사진은 자동으로 줄여서 올립니다' : '') + '</div>';
    } else if (t === 'signature') {
      var sv = Array.isArray(v) && v[0] ? v[0] : null;
      h = '<div class="sigwrap"><canvas class="sig" data-f="sig" width="600" height="220"></canvas>' + (sv && sv.preview ? '<img class="sigprev" alt="서명" src="' + E(sv.preview) + '">' : '') + '</div><div class="row" style="margin-top:8px"><span class="hint">' + (sv ? '서명이 저장되었습니다.' : '위 칸에 손가락이나 마우스로 서명해 주십시오.') + '</span><span class="sp"></span><button type="button" class="btn btn-ghost btn-sm" data-f="sigclear">서명 지우기</button></div>';
    } else if (t === 'address') {
      var ad = (v && typeof v === 'object') ? v : {};
      h = '<div class="addr">' + (ad.road || ad.jibun ? '<div class="addrbox"><b>' + (ad.zip ? '(' + E(ad.zip) + ') ' : '') + E(ad.road || ad.jibun) + '</b>' + (ad.building ? '<div class="muted">' + E(ad.building) + '</div>' : '') + (ad.src === 'gps' ? '<div class="hint">현재 위치 기반 주소입니다. 도로명 주소 검색으로 확인하면 더 정확합니다.</div>' : '') + '</div>' : '<div class="hint">주소를 검색해 주십시오.</div>') +
        '<div class="row" style="margin-top:8px"><button type="button" class="btn btn-secondary btn-sm" data-f="addrsearch">' + ic('pin', 16) + ' 도로명 주소 검색</button>' + (q.allowGps ? '<button type="button" class="btn btn-ghost btn-sm" data-f="addrgps">현재 위치로 찾기</button>' : '') + '</div>' +
        ((ad.road || ad.jibun) && q.detail !== false ? '<input class="fld" style="margin-top:8px" data-f="addrdetail" maxlength="100" placeholder="상세 주소 (동·호수 등)" value="' + E(ad.detail || '') + '">' : '') + '</div>';
    } else if (t === 'location') {
      var lc = (v && typeof v === 'object') ? v : null;
      h = '<div class="addr">' + (lc ? '<div class="addrbox"><b>' + lc.lat.toFixed(5) + ', ' + lc.lng.toFixed(5) + '</b>' + (lc.acc ? '<div class="hint">정확도 약 ±' + Math.round(lc.acc) + 'm</div>' : '') + (lc.label ? '<div class="muted">' + E(lc.label) + '</div>' : '') + '</div>' : '<div class="hint">' + E(q.consentText || '현재 위치 정보를 수집하는 데 동의합니다.') + ' 버튼을 누르면 브라우저가 위치 사용 권한을 묻습니다.</div>') +
        '<div class="row" style="margin-top:8px"><button type="button" class="btn btn-secondary btn-sm" data-f="locget">' + ic('pin', 16) + (lc ? ' 위치 다시 확인' : ' 동의하고 현재 위치 확인') + '</button></div></div>';
    } else if (t === 'qr') {
      h = '<div class="qrbox">' + (v ? '<div class="addrbox"><b>' + E(v) + '</b></div>' : '') + '<div class="row" style="margin-top:8px"><button type="button" class="btn btn-secondary btn-sm" data-f="qrscan">' + ic('scan', 16) + ' 카메라로 스캔</button></div>' + (q.allowManual !== false ? '<input class="fld" style="margin-top:8px" data-f="qrtext" maxlength="500" placeholder="스캔이 안 되면 코드를 직접 입력" value="' + E(v || '') + '">' : '') + '</div>';
    } else if (t === 'consent') {
      h = (q.text ? '<div class="consent">' + E(q.text) + '</div>' : '') + '<label class="chk consentchk"><input type="checkbox" data-f="consent" ' + (v === true ? 'checked' : '') + '> ' + E(q.checkLabel || '동의합니다.') + '</label>';
    }
    return h;
  }

  function blockHtml(q) {
    if (q.kind === 'image') return (q.src ? '<figure class="blk"><img alt="' + E(q.caption || '') + '" src="' + E(q.src) + '">' + (q.caption ? '<figcaption>' + E(q.caption) + '</figcaption>' : '') + '</figure>' : '');
    if (q.kind === 'video') { var id = S.youtubeId(q.url); return id ? '<div class="blk video"><iframe src="https://www.youtube-nocookie.com/embed/' + id + '" title="영상" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>' : (q.url ? '<a class="btn btn-secondary btn-sm" href="' + E(q.url) + '" target="_blank" rel="noopener">영상 열기</a>' : ''); }
    return q.text ? '<div class="blk text">' + E(q.text) + '</div>' : '';
  }

  /* ───────────── 문항 래퍼 ───────────── */
  function html(q, ctx) {
    ctx = ctx || {};
    if (!S.evalCond(q.showIf, ctx.def || {}, ctx.a || {}, ctx.c || {})) return '';
    if (q.type === 'block') return '<div class="q block" data-q="' + E(q.id) + '" data-scope="' + E(ctx.scopeId || '') + '" data-type="block">' + (q.label ? '<div class="q-label">' + E(q.label) + '</div>' : '') + blockHtml(q) + '</div>';
    var badge = ctx.badge != null ? '<span class="q-id">' + E(ctx.badge) + '</span>' : '';
    return '<div class="q" data-q="' + E(q.id) + '" data-scope="' + E(ctx.scopeId || '') + '" data-type="' + E(q.type) + '"><div class="q-label">' + badge + E(q.label) + reqMark(q) + '</div>' + (q.desc ? '<div class="q-desc">' + E(q.desc) + '</div>' : '') + '<div class="q-body">' + bodyHtml(q, ctx) + '</div><div class="q-err" role="alert"></div></div>';
  }

  /* ───────────── 상태 ───────────── */
  function state(q, a, c, def) {
    if (q.type === 'block') return 'skip';
    if (!S.evalCond(q.showIf, def, a, c)) return 'hidden';
    var v = (a || {})[q.id];
    if (S.isEmpty(q, v)) return S.isRequired(q) ? 'empty' : 'ok';
    if (S.checkQ(q, v, a, c, def)) return 'invalid';
    return 'ok';
  }

  /* ───────────── 이벤트 ───────────── */
  var scriptCache = {};
  function loadScript(src) { if (scriptCache[src]) return scriptCache[src]; return scriptCache[src] = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = function () { delete scriptCache[src]; rej(new Error('script')); }; document.head.appendChild(s); }); }
  function overlay(inner, onClose) {
    var bg = document.createElement('div'); bg.className = 'modal-bg'; bg.innerHTML = '<div class="modal wide-modal" role="dialog" aria-modal="true">' + inner + '</div>'; document.body.appendChild(bg);
    function close() { if (onClose) onClose(); bg.remove(); } bg.addEventListener('mousedown', function (e) { if (e.target === bg) close(); }); return { el: bg, close: close };
  }
  function confirmGeo(text) {
    return new Promise(function (res) {
      var m = overlay('<h3>위치 정보 사용 동의</h3><p class="muted" style="margin:8px 0 0">' + E(text) + '<br>위치는 이 설문의 해당 문항 용도로만 사용됩니다. 동의하시면 브라우저가 위치 권한을 한 번 더 묻습니다.</p><div class="btn-row"><button class="btn btn-ghost" data-r="0">동의하지 않음</button><button class="btn btn-primary" data-r="1">동의하고 계속</button></div>');
      m.el.addEventListener('click', function (e) { var b = e.target.closest('[data-r]'); if (b) { m.el.remove(); res(b.getAttribute('data-r') === '1'); } });
    });
  }
  function getPos() {
    return new Promise(function (res, rej) { if (!navigator.geolocation) return rej(new Error('이 브라우저는 위치 기능을 지원하지 않습니다.')); navigator.geolocation.getCurrentPosition(function (p) { res(p.coords); }, function (e) { rej(new Error(e.code === 1 ? '위치 권한이 거부되었습니다. 브라우저 설정에서 허용하거나 주소 검색을 이용해 주십시오.' : '위치를 확인하지 못했습니다. 잠시 후 다시 시도해 주십시오.')); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }); });
  }
  function reverseGeo(lat, lng) {
    return fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=ko&zoom=18&lat=' + lat + '&lon=' + lng).then(function (r) { return r.json(); }).then(function (j) {
      var d = j.address || {}, road = [d.state || d.province || '', d.city || d.county || '', d.borough || d.city_district || '', d.road || '', d.house_number || ''].filter(Boolean).join(' ');
      return { road: road || j.display_name || '', zip: d.postcode || '', building: d.building || d.amenity || '', q: d.road || '' };
    }).catch(function () { return { road: '', zip: '', building: '', q: '' }; });
  }

  function attach(root, env) {
    var busy = env.busy = env.busy || {};
    function qinfo(el) { var qel = el.closest('.q'); if (!qel) return null; var qid = qel.getAttribute('data-q'), q = env.qmap[qid]; return q ? { qel: qel, q: q, scope: qel.getAttribute('data-scope'), qid: qid } : null; }
    function ctxFor(i) { return { def: env.def, a: env.getAns(i.scope), c: env.getCommon(), scopeId: i.scope, counts: env.counts, seed: env.seed, busy: busy, badge: null, nudge: i.qel.querySelector('.cnt .nudge') ? i.qel.querySelector('.cnt .nudge').textContent : '' }; }
    function refresh(i, full) {
      var ctx = ctxFor(i), body = i.qel.querySelector('.q-body'); if (body) body.innerHTML = bodyHtml(i.q, ctx);
      if (i.q.type === 'signature') initSig(i.qel, i.q, ctx);
    }
    function setErr(i) {
      var a = env.getAns(i.scope), v = a[i.qid], msg = S.isEmpty(i.q, v) ? '' : S.checkQ(i.q, v, a, env.getCommon(), env.def), e = i.qel.querySelector('.q-err'); if (e) e.textContent = msg; i.qel.classList.toggle('bad', !!msg);
    }
    function changed(i, redraw) {
      var a = env.getAns(i.scope), v = a[i.qid];
      if (redraw) refresh(i);
      setErr(i); i.qel.classList.remove('missing');
      // showIf 로 연결된 다른 문항이 있으면 구간을 다시 그리도록 호스트에 알림
      env.onChange(i.scope, i.qid, v);
    }
    function set(i, v) { var a = env.getAns(i.scope); if (S.isEmpty(i.q, v) && i.q.type !== 'consent') delete a[i.qid]; else a[i.qid] = v; }

    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-f]'); if (!t || t.tagName === 'INPUT' && t.type !== 'checkbox' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || !root.contains(t)) return;
      var i = qinfo(t); if (!i) return; var f = t.getAttribute('data-f'), q = i.q, a = env.getAns(i.scope), v = a[i.qid];
      if (f === 'pick') { set(i, Number(t.getAttribute('data-v'))); return changed(i, true); }
      if (f === 'opt') {
        var id = t.getAttribute('data-v');
        if (q.type === 'single') { set(i, v === id && !q.required ? undefined : id); if (id !== '__other') delete a[i.qid + '_other']; }
        else { var arr = Array.isArray(v) ? v.slice() : [], ex = (q.options || []).filter(function (o) { return o.exclusive; }).map(function (o) { return o.id; }), k = arr.indexOf(id);
          if (k >= 0) arr.splice(k, 1); else { if (ex.indexOf(id) >= 0) arr = [id]; else { arr = arr.filter(function (x) { return ex.indexOf(x) < 0; }); if (S.num(q.maxSel) != null && arr.length >= S.num(q.maxSel)) { env.toast && env.toast('최대 ' + q.maxSel + '개까지 선택할 수 있습니다.'); return; } arr.push(id); } }
          set(i, arr); if (arr.indexOf('__other') < 0) delete a[i.qid + '_other']; }
        return changed(i, true);
      }
      if (f === 'cell') {
        var r = t.getAttribute('data-r'), c = t.getAttribute('data-c'), gv = (v && typeof v === 'object') ? Object.assign({}, v) : {};
        if (q.multi) { var cur = Array.isArray(gv[r]) ? gv[r].slice() : [], k2 = cur.indexOf(c); if (k2 >= 0) cur.splice(k2, 1); else cur.push(c); if (cur.length) gv[r] = cur; else delete gv[r]; } else gv[r] = c;
        set(i, gv); return changed(i, true);
      }
      if (f === 'rankadd') { var rv = Array.isArray(v) ? v.slice() : []; rv.push(t.getAttribute('data-v')); set(i, rv); return changed(i, true); }
      if (f === 'rankdel' || f === 'rankup' || f === 'rankdn') {
        var li = t.closest('li'), id2 = li.getAttribute('data-id'), rv2 = (Array.isArray(v) ? v : []).slice(), p = rv2.indexOf(id2);
        if (f === 'rankdel') rv2.splice(p, 1); else { var d = f === 'rankup' ? -1 : 1; if (p + d < 0 || p + d >= rv2.length) return; var tmp = rv2[p]; rv2[p] = rv2[p + d]; rv2[p + d] = tmp; }
        set(i, rv2); return changed(i, true);
      }
      if (f === 'rankreset') { set(i, []); return changed(i, true); }
      if (f === 'filedel') { var k3 = Number(t.closest('.fitem').getAttribute('data-k')), fl = (Array.isArray(v) ? v : []).slice(), meta = fl.splice(k3, 1)[0]; set(i, fl); if (meta && env.removeFile) env.removeFile(meta); return changed(i, true); }
      if (f === 'sigclear') { var m = (Array.isArray(v) && v[0]) || null; set(i, []); if (m && env.removeFile) env.removeFile(m); refresh(i); return changed(i, false); }
      if (f === 'addrsearch') return addrSearch(i);
      if (f === 'addrgps') return addrGps(i);
      if (f === 'locget') return locGet(i);
      if (f === 'qrscan') return qrScan(i);
    });
    root.addEventListener('input', function (e) {
      var t = e.target.closest('[data-f]'); if (!t) return; var i = qinfo(t); if (!i) return; var f = t.getAttribute('data-f'), q = i.q;
      if (f === 'text') { set(i, t.value); var c = i.qel.querySelector('[data-cnt]'); if (c) c.textContent = t.value.length; return changed(i, false); }
      if (f === 'other') { env.getAns(i.scope)[i.qid + '_other'] = t.value; return changed(i, false); }
      if (f === 'slider') { var val = Number(t.value); set(i, val); var sv = i.qel.querySelector('[data-sv]'); if (sv) sv.textContent = val + (q.unit || ''); return changed(i, false); }
      if (f === 'sum') { var a = env.getAns(i.scope), sm = Object.assign({}, (a[i.qid] && typeof a[i.qid] === 'object') ? a[i.qid] : {}), o = t.getAttribute('data-o'); if (t.value === '') delete sm[o]; else sm[o] = Number(t.value); set(i, sm); var tot = S.num(q.total) != null ? S.num(q.total) : 100, sum = Object.keys(sm).reduce(function (s, k) { return s + (Number(sm[k]) || 0); }, 0), el = i.qel.querySelector('[data-sumtot]'); if (el) { el.innerHTML = '합계 <b>' + sum + '</b> / ' + tot + E(q.unit || '') + ' (남음 ' + (tot - sum) + ')'; el.classList.toggle('ok', Math.abs(sum - tot) < 1e-9); } return changed(i, false); }
      if (f === 'dt') { set(i, t.value); return changed(i, false); }
      if (f === 'addrdetail') { var ad = Object.assign({}, env.getAns(i.scope)[i.qid] || {}); ad.detail = t.value; env.getAns(i.scope)[i.qid] = ad; return env.onChange(i.scope, i.qid, ad); }
      if (f === 'qrtext') { set(i, t.value.trim()); return changed(i, false); }
    });
    root.addEventListener('change', function (e) {
      var t = e.target.closest('[data-f]'); if (!t) return; var i = qinfo(t); if (!i) return; var f = t.getAttribute('data-f'), q = i.q;
      if (f === 'sel') { set(i, t.value || undefined); if (t.value !== '__other') delete env.getAns(i.scope)[i.qid + '_other']; return changed(i, true); }
      if (f === 'consent') { set(i, t.checked ? true : undefined); return changed(i, false); }
      if (f === 'file') return fileAdd(i, t);
    });

    /* 파일·사진 */
    function fileAdd(i, input) {
      var q = i.q, files = Array.from(input.files || []); input.value = ''; if (!files.length) return;
      var a = env.getAns(i.scope), cur = Array.isArray(a[i.qid]) ? a[i.qid].slice() : [], cap = Math.min(S.num(q.maxFiles) || 1, 10), maxB = Math.min(S.num(q.maxMB) || 3, 3) * 1048576;
      files = files.slice(0, Math.max(cap - cur.length, 0)); if (!files.length) return;
      busy[q.id] = true; refresh(i);
      (function next(k) {
        if (k >= files.length) { busy[q.id] = false; set(i, cur); refresh(i); return changed(i, false); }
        S.compressImage(files[k], 1600, Math.min(maxB, 900 * 1024)).then(function (blob) {
          if (blob.size > maxB) { env.toast && env.toast((files[k].name || '파일') + ' 은(는) ' + (maxB / 1048576) + 'MB를 넘어 올릴 수 없습니다.'); return next(k + 1); }
          var name = blob.name || files[k].name || '첨부';
          return (env.upload ? env.upload(q, blob, name) : Promise.resolve({ id: 'preview-' + Math.random().toString(36).slice(2), name: name, mime: blob.type, size: blob.size })).then(function (meta) {
            meta.name = meta.name || name; meta.size = meta.size || blob.size; if (/^image\//.test(blob.type)) meta.preview = URL.createObjectURL(blob); cur.push(meta); a[i.qid] = cur.slice(); next(k + 1);
          });
        }).catch(function (er) { env.toast && env.toast(er.message || '업로드하지 못했습니다.'); next(k + 1); });
      })(0);
    }
    /* 서명 */
    function initSig(qel, q, ctx) {
      var cv = qel.querySelector('canvas.sig'); if (!cv || cv._init) return; cv._init = true; var g = cv.getContext('2d'), drawing = false, moved = false; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111';
      var i = { qel: qel, q: q, scope: qel.getAttribute('data-scope'), qid: q.id };
      function pos(ev) { var r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) * cv.width / r.width, (ev.clientY - r.top) * cv.height / r.height]; }
      cv.style.touchAction = 'none';
      cv.addEventListener('pointerdown', function (ev) { drawing = true; moved = false; cv.setPointerCapture(ev.pointerId); var p = pos(ev); g.beginPath(); g.moveTo(p[0], p[1]); });
      cv.addEventListener('pointermove', function (ev) { if (!drawing) return; var p = pos(ev); g.lineTo(p[0], p[1]); g.stroke(); moved = true; });
      function end() { if (!drawing) return; drawing = false; if (!moved) return; cv.toBlob(function (blob) {
        busy[q.id] = true; var a = env.getAns(i.scope);
        (env.upload ? env.upload(q, blob, 'signature.png') : Promise.resolve({ id: 'preview-sig', name: 'signature.png', mime: 'image/png', size: blob.size })).then(function (meta) { var old = Array.isArray(a[i.qid]) && a[i.qid][0]; if (old && env.removeFile) env.removeFile(old); meta.preview = URL.createObjectURL(blob); a[i.qid] = [meta]; busy[q.id] = false; var prev = qel.querySelector('.hint'); if (prev) prev.textContent = '서명이 저장되었습니다.'; setErr(i); env.onChange(i.scope, i.qid, a[i.qid]); }).catch(function (er) { busy[q.id] = false; env.toast && env.toast(er.message || '서명을 저장하지 못했습니다.'); });
      }, 'image/png'); }
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    }
    root.querySelectorAll('.q[data-type="signature"]').forEach(function (qel) { var q = env.qmap[qel.getAttribute('data-q')]; if (q) initSig(qel, q, {}); });
    root._initSigs = function () { root.querySelectorAll('.q[data-type="signature"]').forEach(function (qel) { var q = env.qmap[qel.getAttribute('data-q')]; if (q) initSig(qel, q, {}); }); };

    /* 주소 */
    function addrSet(i, patch) { var a = env.getAns(i.scope), ad = Object.assign({}, a[i.qid] || {}, patch); a[i.qid] = ad; refresh(i); changed(i, false); }
    function addrSearch(i, query) {
      var m = overlay('<div class="row"><b class="sp">도로명 주소 검색</b><button class="btn btn-ghost btn-sm" data-x>닫기</button></div><div id="pcbox" style="height:min(70vh,520px);margin-top:8px"></div><div id="pcfb" class="hide"></div>');
      m.el.querySelector('[data-x]').onclick = m.close;
      loadScript('https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js').then(function () {
        new window.daum.Postcode({ width: '100%', height: '100%', oncomplete: function (d) { m.close(); addrSet(i, { zip: d.zonecode || '', road: d.roadAddress || d.address || '', jibun: d.jibunAddress || d.autoJibunAddress || '', building: d.buildingName || '', src: 'search' }); } }).embed(m.el.querySelector('#pcbox'), { q: query || '', autoClose: false });
      }).catch(function () {
        m.el.querySelector('#pcbox').innerHTML = '<div class="msg warn">' + I('alert', 18) + '<div>주소 검색 서비스를 불러오지 못했습니다. 아래에 주소를 직접 입력해 주십시오.</div></div><input class="fld" id="manroad" placeholder="도로명 주소 (예: 서울특별시 중구 세종대로 110)" style="margin-top:8px"><input class="fld" id="manzip" placeholder="우편번호(선택)" style="margin-top:8px"><div class="btn-row"><button class="btn btn-primary" data-ok>입력 완료</button></div>';
        m.el.querySelector('[data-ok]').onclick = function () { var r = m.el.querySelector('#manroad').value.trim(); if (!r) return; m.close(); addrSet(i, { zip: m.el.querySelector('#manzip').value.trim(), road: r, jibun: '', building: '', src: 'manual' }); };
      });
    }
    function addrGps(i) {
      confirmGeo('현재 위치를 확인해 주소를 찾습니다.').then(function (ok) {
        if (!ok) return; env.toast && env.toast('위치를 확인하는 중입니다…');
        return getPos().then(function (p) { return reverseGeo(p.latitude, p.longitude).then(function (r) { addrSet(i, { zip: r.zip, road: r.road, jibun: '', building: r.building, lat: p.latitude, lng: p.longitude, acc: p.accuracy, src: 'gps' }); if (r.q) { env.toast && env.toast('찾은 도로명으로 주소 검색 창을 열었습니다. 정확한 주소를 선택해 주십시오.'); addrSearch(i, r.q); } }); });
      }).catch(function (er) { env.toast && env.toast(er.message); });
    }
    function locGet(i) {
      var q = i.q; confirmGeo(q.consentText || '현재 위치 정보를 수집하는 데 동의합니다.').then(function (ok) {
        if (!ok) return; env.toast && env.toast('위치를 확인하는 중입니다…');
        return getPos().then(function (p) { return reverseGeo(p.latitude, p.longitude).then(function (r) { var a = env.getAns(i.scope); a[i.qid] = { lat: p.latitude, lng: p.longitude, acc: p.accuracy, ts: Date.now(), label: r.road }; refresh(i); changed(i, false); }); });
      }).catch(function (er) { env.toast && env.toast(er.message); });
    }
    /* QR · 바코드 */
    function qrScan(i) {
      var m = overlay('<div class="row"><b class="sp">QR·바코드 스캔</b><button class="btn btn-ghost btn-sm" data-x>닫기</button></div><div class="qrview"><video playsinline muted></video></div><p class="hint" id="qrmsg">카메라 권한을 허용하고 코드를 화면 안에 맞춰 주십시오.</p>', function () { stop(); });
      var vid = m.el.querySelector('video'), stream = null, alive = true, det = null, cv = document.createElement('canvas');
      function stop() { alive = false; if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); }
      m.el.querySelector('[data-x]').onclick = m.close;
      function found(val) { stop(); m.el.remove(); var a = env.getAns(i.scope); a[i.qid] = String(val).slice(0, 500); refresh(i); changed(i, false); }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { m.el.querySelector('#qrmsg').textContent = '이 브라우저에서는 카메라를 사용할 수 없습니다. 코드를 직접 입력해 주십시오.'; return; }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (st) {
        stream = st; vid.srcObject = st; vid.play();
        var native = 'BarcodeDetector' in window; if (native) det = new window.BarcodeDetector();
        var ready = native ? Promise.resolve() : loadScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');
        ready.then(function () {
          (function loop() {
            if (!alive) return;
            if (vid.readyState >= 2) {
              if (native) det.detect(vid).then(function (r) { if (r && r[0]) found(r[0].rawValue); }).catch(function () {});
              else { cv.width = vid.videoWidth; cv.height = vid.videoHeight; var g = cv.getContext('2d'); g.drawImage(vid, 0, 0); var d = g.getImageData(0, 0, cv.width, cv.height), res = window.jsQR && window.jsQR(d.data, d.width, d.height); if (res && res.data) return found(res.data); }
            }
            setTimeout(loop, 220);
          })();
        }).catch(function () { m.el.querySelector('#qrmsg').textContent = '스캔 모듈을 불러오지 못했습니다. 코드를 직접 입력해 주십시오.'; });
      }).catch(function () { m.el.querySelector('#qrmsg').textContent = '카메라를 사용할 수 없습니다. 권한을 확인하거나 코드를 직접 입력해 주십시오.'; });
    }
  }

  S.Form = { html: html, bodyHtml: bodyHtml, attach: attach, state: state };
  S.questionMap = function (def) { var m = {}; S.allQuestions(def).forEach(function (x) { m[x.q.id] = x.q; }); return m; };
})();
