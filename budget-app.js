'use strict';
/**
 * budget-app.js — 부서 예산안(budget.html) 공통 모듈 (BW)
 *  - Supabase RPC 호출, 공용 유틸(모달/토스트/아이콘)
 *  - Workspace: 부서 입력 화면(세출/세입/요약·제출). 관리자 검토 화면에서도 재사용
 *  저장소는 서버(Supabase)뿐이며 브라우저에는 로그인 토큰(sessionStorage)만 보관합니다.
 */
(function () {
  var SUPA_URL = 'https://zbpeyklwpotjyveipzxd.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV5a2x3cG90anl2ZWlwenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTYxMDcsImV4cCI6MjA5NzA5MjEwN30.6JgoQ6rPRnmrbBTG68A-Y9HDQk40mnwubhXVnkZvHrQ';

  var ERR = {
    AUTH_REQUIRED: '로그인이 만료되었습니다. 다시 접속해 주십시오.',
    PERIOD_CLOSED: '현재 작성 기간이 아닙니다.',
    LOCKED: '제출·검토·확정 상태에서는 수정할 수 없습니다.',
    FORBIDDEN: '권한이 없습니다.',
    NOT_FOUND: '대상을 찾을 수 없습니다.',
    BAD_CODE: '등록된 예산 코드(목)를 선택해 주십시오.',
    BAD_TYPE: '구분(세입/세출)이 올바르지 않습니다.',
    BAD_DEPT: '사용할 수 없는 부서입니다.',
    NAME_REQUIRED: '세부명칭을 입력해 주십시오.',
    BASE_LINE_PROTECTED: '2026 기준 항목은 삭제할 수 없습니다. 2027 금액을 0원으로 입력하고 사유를 적어 주십시오.',
    BAD_TRANSITION: '현재 상태에서는 할 수 없는 처리입니다.',
    REASON_REQUIRED: '사유를 입력해 주십시오.',
    FINALIZED: '최종 반영이 완료된 연도입니다. 일정·한도 메뉴에서 상태를 변경한 뒤 처리해 주십시오.',
    ALREADY_INIT: '이미 항목이 만들어진 연도입니다.',
    BAD_STATUS: '변경할 수 없는 상태값입니다.',
    PW_TOO_SHORT: '비밀번호가 너무 짧습니다.',
    PW_NOT_SET: '아직 비밀번호가 설정되지 않은 부서입니다.',
    ALREADY_SET: '이미 비밀번호가 설정된 부서입니다. 비밀번호로 접속해 주십시오.',
    BAD_PASSWORD: '비밀번호가 올바르지 않습니다.',
    NO_DEPT: '부서를 찾을 수 없습니다.',
    ADMIN_NOT_SET: '관리자 비밀번호가 아직 등록되지 않았습니다.'
  };

  /* ───────────── 공용 유틸 ───────────── */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function won(n) { return (Number(n) || 0).toLocaleString('ko-KR'); }
  function num(v) {
    var s = String(v == null ? '' : v).replace(/[^\d.-]/g, '');
    if (s === '' || s === '-') return null;
    var n = Number(s); return isFinite(n) ? Math.round(n) : null;
  }
  function pct(a, b) { return b ? Math.round((a - b) * 1000 / b) / 10 : null; }
  function fmtDT(iso) { if (!iso) return ''; try { return new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16).replace(/-/g, '.').replace(' ', ' '); } catch (e) { return ''; } }
  function toLocalInput(iso) { if (!iso) return ''; try { return new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16).replace(' ', 'T'); } catch (e) { return ''; } }
  function fromLocalInput(v) { return v ? v + ':00+09:00' : ''; }

  var ICONS = {
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    alert: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.5"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2M16 16h0"/>',
    print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><rect x="7" y="14" width="10" height="7"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
    logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    refresh: '<path d="M20 6v5h-5M4 18v-5h5M5.5 9A7 7 0 0 1 18 7.5L20 11M18.5 15A7 7 0 0 1 6 16.5L4 13"/>',
    undo: '<path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    building: '<path d="M4 21V5l8-2v18M12 9h8v12M7 9h2M7 13h2M7 17h2M15 13h2M15 17h2"/>',
    coins: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>'
  };
  function ico(n, size) {
    var s = size || 18;
    return '<svg class="ico" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>';
  }

  function toast(msg, kind) {
    var t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show' + (kind === 'err' ? ' err' : '');
    clearTimeout(t._h); t._h = setTimeout(function () { t.className = ''; }, kind === 'err' ? 4500 : 2200);
  }

  function modal(o) {
    var wrap = document.createElement('div');
    wrap.className = 'mdl';
    wrap.innerHTML = '<div class="mdl-bg"></div><div class="mdl-box ' + (o.cls || '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.title) + '">' +
      '<div class="mdl-hd"><h3>' + esc(o.title) + '</h3><button class="icon-btn" data-x aria-label="닫기">' + ico('x') + '</button></div>' +
      '<div class="mdl-bd">' + (o.body || '') + '</div>' +
      '<div class="mdl-ft">' + (o.actions || []).map(function (a, i) { return '<button class="btn ' + (a.cls || 'btn-secondary') + '" data-a="' + i + '">' + esc(a.label) + '</button>'; }).join('') + '</div></div>';
    document.body.appendChild(wrap);
    var api = { el: wrap, close: function () { document.removeEventListener('keydown', onKey); if (wrap.parentNode) wrap.parentNode.removeChild(wrap); if (o.onClose) o.onClose(); } };
    function onKey(e) { if (e.key === 'Escape') api.close(); }
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', function (e) {
      if (e.target.classList.contains('mdl-bg') || e.target.closest('[data-x]')) return api.close();
      var b = e.target.closest('[data-a]');
      if (b) { var a = o.actions[Number(b.dataset.a)]; if (a && a.onClick) a.onClick(api, b); else api.close(); }
    });
    if (o.onMount) o.onMount(api);
    var first = $('input,select,textarea', wrap); if (first) setTimeout(function () { first.focus(); }, 30);
    return api;
  }
  function confirmBox(msg, okLabel, danger) {
    return new Promise(function (resolve) {
      var done = false;
      modal({
        title: '확인', body: '<p class="mdl-msg">' + esc(msg).replace(/\n/g, '<br>') + '</p>',
        actions: [
          { label: '취소', cls: 'btn-ghost', onClick: function (m) { done = true; m.close(); resolve(false); } },
          { label: okLabel || '확인', cls: danger ? 'btn-danger' : 'btn-primary', onClick: function (m) { done = true; m.close(); resolve(true); } }
        ],
        onClose: function () { if (!done) resolve(false); }
      });
    });
  }

  /* ───────────── API ───────────── */
  var sess = { role: '', token: '', dept: '' };
  var onAuthLost = null;
  function rpc(fn, args) {
    return fetch(SUPA_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        if (!r.ok) {
          var code = (j && j.message) || 'UNKNOWN';
          var err = new Error(ERR[code] || ('서버 오류: ' + code)); err.code = code;
          if (code === 'AUTH_REQUIRED' && onAuthLost) onAuthLost();
          throw err;
        }
        return j;
      });
    }, function () { var e = new Error('네트워크 연결을 확인해 주십시오.'); e.code = 'NETWORK'; throw e; });
  }
  function errMsg(code) { return ERR[code] || code; }

  /* ───────────── 계산 도우미 ───────────── */
  var TYPES = { sechul: '세출', sein: '세입' };
  var STAGES = [
    { k: 'draft', t: '작성중' }, { k: 'submitted', t: '부서 제출' }, { k: 'reviewing', t: '기획처 검토' }, { k: 'confirmed', t: '확정' }
  ];
  function stageIdx(st) { for (var i = 0; i < STAGES.length; i++) if (STAGES[i].k === st) return i; return 0; }
  function stageLabel(st) { return STAGES[stageIdx(st)].t; }

  function mokParts(m) { return String(m).split('.').map(function (x) { return Number(x) || 0; }); }
  function cmpMok(a, b) {
    var x = mokParts(a), y = mokParts(b);
    for (var i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); }
    return 0;
  }

  /* 데이터 묶음에 대한 파생값 */
  function Calc(data) {
    var spendBy = {};
    (data.spend || []).forEach(function (s) { spendBy[s.line_id] = (spendBy[s.line_id] || 0) + (Number(s.amount) || 0); });
    var varPct = (data.settings && data.settings.variance_pct) || 20;
    return {
      varPct: varPct,
      used: function (id) { return spendBy[id] || 0; },
      needReason: function (l) {
        var b = Number(l.base_amount) || 0, a = Number(l.amount) || 0;
        return b > 0 ? (Math.abs(a - b) * 100 / b > varPct) : a > 0;
      },
      calcValue: function (l) { return BudgetCalc.evalCalc(l.calc); },
      calcMismatch: function (l) {
        var v = BudgetCalc.evalCalc(l.calc);
        return (v != null && !BudgetCalc.matches(v, l.amount)) ? v : null;
      },
      sums: function (lines) {
        var r = { base: 0, used: 0, fc: 0, amt: 0 };
        lines.forEach(function (l) {
          r.base += Number(l.base_amount) || 0; r.used += spendBy[l.id] || 0;
          r.fc += (l.forecast == null ? 0 : Number(l.forecast)); r.amt += Number(l.amount) || 0;
        });
        return r;
      },
      invalidate: function (lineId, spends) { spendBy = {}; spends.forEach(function (s) { spendBy[s.line_id] = (spendBy[s.line_id] || 0) + (Number(s.amount) || 0); }); }
    };
  }

  /* ───────────── 산출 입력기(단가 × 수량) ───────────── */
  function openCalcModal(line, onApply) {
    var terms = BudgetCalc.parseTerms(line.calc);
    if (!terms.length) terms = [{ price: '', qty: '', unit: '회' }];
    function rowsHtml() {
      return terms.map(function (t, i) {
        return '<div class="ct" data-i="' + i + '">' +
          '<label>단가(원)<input class="in num" inputmode="numeric" data-k="price" value="' + (t.price === '' ? '' : won(t.price)) + '"></label>' +
          '<span class="ct-x">×</span>' +
          '<label>수량<input class="in num" inputmode="decimal" data-k="qty" value="' + esc(t.qty) + '"></label>' +
          '<label>단위<input class="in" data-k="unit" value="' + esc(t.unit) + '" list="unit-list" maxlength="6"></label>' +
          (terms.length > 1 ? '<button class="icon-btn" data-del="' + i + '" aria-label="항 삭제">' + ico('trash') + '</button>' : '') + '</div>';
      }).join('');
    }
    var m = modal({
      title: '산출식 입력 (단가 × 수량)',
      body: '<div id="ct-list">' + rowsHtml() + '</div><datalist id="unit-list"><option>회</option><option>명</option><option>대</option><option>개</option><option>건</option><option>월</option><option>식</option><option>권</option><option>시간</option><option>일</option></datalist>' +
        '<button class="btn btn-ghost btn-sm" id="ct-add">' + ico('plus', 16) + ' 항 추가 (합산)</button>' +
        '<div class="ct-res"><div class="muted">산출식 미리보기</div><div id="ct-text" class="ct-text"></div><div class="ct-sum">금액 <b id="ct-sum">0</b>원</div></div>',
      actions: [
        { label: '취소', cls: 'btn-ghost' },
        { label: '적용', cls: 'btn-primary', onClick: function (mm) {
          var calc = BudgetCalc.composeCalc(terms), sum = BudgetCalc.sumTerms(terms);
          if (!calc) { toast('단가와 수량을 입력해 주십시오.', 'err'); return; }
          mm.close(); onApply(calc, sum);
        } }
      ]
    });
    function refresh() {
      $('#ct-text', m.el).textContent = BudgetCalc.composeCalc(terms) || '단가와 수량을 입력하십시오.';
      $('#ct-sum', m.el).textContent = won(BudgetCalc.sumTerms(terms));
    }
    m.el.addEventListener('input', function (e) {
      var t = e.target, row = t.closest('.ct'); if (!row) return;
      var i = Number(row.dataset.i), k = t.dataset.k;
      if (k === 'price') terms[i].price = num(t.value) || '';
      else if (k === 'qty') terms[i].qty = Number(String(t.value).replace(/[^\d.]/g, '')) || '';
      else terms[i].unit = t.value;
      refresh();
    });
    m.el.addEventListener('focusout', function (e) { var t = e.target; if (t.dataset && t.dataset.k === 'price' && t.value) t.value = won(num(t.value)); });
    m.el.addEventListener('click', function (e) {
      if (e.target.closest('#ct-add')) { terms.push({ price: '', qty: '', unit: terms[terms.length - 1].unit || '회' }); $('#ct-list', m.el).innerHTML = rowsHtml(); refresh(); return; }
      var d = e.target.closest('[data-del]');
      if (d) { terms.splice(Number(d.dataset.del), 1); $('#ct-list', m.el).innerHTML = rowsHtml(); refresh(); }
    });
    refresh();
  }

  /* ───────────── Workspace ───────────── */
  /**
   * ctx = { admin, dept, year, data, api:{saveLine,deleteLine,saveSpend,deleteSpend,submit,recall}, onChange, actionsFor(type, el) }
   * data = { settings, open, lines, spend, subs, caps, codes }
   */
  function mount(root, ctx) {
    var data = ctx.data;
    var calc = Calc(data);
    var ui = { tab: ctx.startTab || 'sechul', open: {} };
    var typeOf = function (k) { return TYPES[k]; };

    function codeName(type, code) {
      for (var i = 0; i < data.codes.length; i++) { var c = data.codes[i]; if (c.type === type && c.code === code) return c.name; }
      return '';
    }
    function mokList(type) { return data.codes.filter(function (c) { return c.type === type && c.level === 'mok' && c.active; }).sort(function (a, b) { return cmpMok(a.code, b.code); }); }
    function linesOf(type) {
      return data.lines.filter(function (l) { return l.type === type && (!ctx.admin || l.dept === ctx.dept); })
        .sort(function (a, b) { return cmpMok(a.mok, b.mok) || (a.sort - b.sort) || String(a.name).localeCompare(b.name); });
    }
    function lineById(id) { for (var i = 0; i < data.lines.length; i++) if (data.lines[i].id === id) return data.lines[i]; return null; }
    function subOf(type) { for (var i = 0; i < data.subs.length; i++) { var s = data.subs[i]; if (s.type === type && (!ctx.admin || s.dept === ctx.dept)) return s; } return { type: type, status: 'draft', reject_reason: '' }; }
    function capOf(type) { for (var i = 0; i < data.caps.length; i++) { var c = data.caps[i]; if (c.type === type && (!ctx.admin || c.dept === ctx.dept)) return Number(c.amount) || 0; } return 0; }
    function finalized() { return data.settings && data.settings.status === 'finalized'; }
    function editable(type) {
      if (ctx.admin) return !finalized();
      return !!data.open && subOf(type).status === 'draft';
    }
    function isAdded(l) { return !(Number(l.base_amount) > 0) && !l.base_calc; }
    function usedLabel(type) { return type === '세입' ? '수납 실적' : '사용(집행)'; }

    /* ── 검증 ── */
    function validate(type) {
      var lines = linesOf(type), errors = [], warnings = [];
      lines.forEach(function (l) {
        if (calc.needReason(l) && !String(l.reason || '').trim()) errors.push({ id: l.id, msg: l.name + ' — ' + (Number(l.base_amount) > 0 ? '전년 대비 ' + calc.varPct + '% 초과 증감 사유 필요' : '신규 항목 사유 필요') });
        var mm = calc.calcMismatch(l);
        if (mm != null) warnings.push({ id: l.id, msg: l.name + ' — 산출식 계산값(' + won(mm) + '원)과 금액(' + won(l.amount) + '원)이 다릅니다' });
      });
      var nf = lines.filter(function (l) { return l.forecast == null && (Number(l.base_amount) > 0 || calc.used(l.id) > 0); }).length;
      if (nf) warnings.push({ id: null, msg: '연말 추정액이 비어 있는 항목이 ' + nf + '건 있습니다. 세부 표의 「연말 추정」 칸을 입력하거나 「연말 추정 일괄 입력」을 사용하십시오.' });
      var cap = capOf(type), tot = calc.sums(lines).amt;
      if (cap > 0 && tot > cap) warnings.push({ id: null, msg: type + ' 요구액이 부서 한도를 ' + won(tot - cap) + '원 초과했습니다 (한도 ' + won(cap) + '원)' });
      return { errors: errors, warnings: warnings };
    }

    /* ── 렌더: 상단 탭 ── */
    function render() {
      var sechul = linesOf('세출').length, sein = linesOf('세입').length;
      root.innerHTML =
        '<div class="ws-tabs" role="tablist">' +
        tabBtn('sechul', '세출예산', sechul) + tabBtn('sein', '세입예산', sein) + tabBtn('sum', '요약·제출', '') +
        '</div><div id="ws-body"></div>';
      renderBody();
    }
    function tabBtn(k, t, n) {
      return '<button role="tab" class="ws-tab' + (ui.tab === k ? ' on' : '') + '" data-tab="' + k + '" aria-selected="' + (ui.tab === k) + '">' + t + (n !== '' ? ' <span class="cnt">' + n + '</span>' : '') + '</button>';
    }
    function renderBody() {
      var b = $('#ws-body', root);
      if (ui.tab === 'sum') b.innerHTML = summaryHtml();
      else b.innerHTML = typePanelHtml(typeOf(ui.tab));
      if (ui.tab === 'sum') afterSummary(b);
    }

    /* ── 렌더: 세출/세입 패널 ── */
    function statusBanner(type) {
      var s = subOf(type), h = '';
      if (ctx.admin) {
        if (finalized()) h += '<div class="note ok">' + ico('check', 16) + ' 최종 반영이 완료된 연도입니다. 수정하려면 일정·한도 메뉴에서 상태를 변경하십시오.</div>';
      } else if (!data.open) {
        var st = data.settings ? data.settings.status : 'draft';
        h += '<div class="note warn">' + ico('lock', 16) + ' ' + (st === 'draft' ? '작성 준비중입니다. 관리자가 작성 기간을 열면 입력할 수 있습니다.' : st === 'finalized' ? '최종 반영이 완료되어 수정할 수 없습니다.' : '작성 기간이 아니거나 마감되었습니다. 내용은 조회만 가능합니다.') + '</div>';
      } else if (s.status !== 'draft') {
        h += '<div class="note info">' + ico('lock', 16) + ' ' + esc(type) + '예산은 「' + stageLabel(s.status) + '」 상태여서 수정할 수 없습니다.' + (s.status === 'submitted' && !ctx.admin ? ' 요약·제출 탭에서 회수할 수 있습니다.' : '') + '</div>';
      }
      if (s.status === 'draft' && s.reject_reason) h += '<div class="note err">' + ico('alert', 16) + ' <b>반려 사유</b> ' + esc(s.reject_reason) + '</div>';
      return h;
    }
    function typePanelHtml(type) {
      var lines = linesOf(type), ed = editable(type), sm = calc.sums(lines);
      var h = statusBanner(type);
      h += '<div class="kpis">' + kpi('2026 예산', sm.base, 'k-base') + kpi('2026 ' + usedLabel(type), sm.used, 'k-used') + kpi('연말 추정', sm.fc, 'k-fc') + kpi('2027 요구', sm.amt, 'k-amt', true) + kpiDiff(sm) + '</div>';
      h += '<div class="tools"><div class="muted">' + (ed ? '입력한 내용은 즉시 서버에 저장됩니다.' : '조회 전용') + '</div>' +
        (ed ? '<div class="acts"><button class="btn btn-ghost btn-sm" data-act="fill-fc">연말 추정 일괄 입력</button><button class="btn btn-secondary btn-sm" data-act="add-line">' + ico('plus', 16) + ' 항목 추가</button></div>' : '') + '</div>';
      if (!lines.length) {
        h += '<div class="empty">' + ico('list', 28) + '<p>등록된 ' + type + ' 항목이 없습니다.' + (ed ? '<br>「항목 추가」로 새 항목을 등록하십시오.' : '') + '</p></div>';
        return h;
      }
      h += '<div class="tbl-wrap"><table class="bt" data-type="' + type + '"><thead><tr>' +
        '<th class="c-code">코드</th><th class="c-name">세부명칭 / 2026 산출식</th><th class="num">2026 예산</th><th class="num">' + usedLabel(type) + '</th><th class="num">연말 추정</th>' +
        '<th class="c-calc">2027 산출식</th><th class="num">2027 요구액</th><th class="num">증감</th><th class="c-reason">증감 사유</th><th class="c-act"></th></tr></thead><tbody>';
      var lastG = null, lastH = null;
      lines.forEach(function (l) {
        var p = String(l.mok).split('.'), g = p[0], hh = p[0] + '.' + (p[1] || '0');
        if (g !== lastG) { h += groupRow('g', type, g, lines); lastG = g; lastH = null; }
        if (hh !== lastH) { h += groupRow('h', type, hh, lines); lastH = hh; }
        h += lineRow(l, ed);
        if (ui.open[l.id]) h += spendRow(l, ed, type);
      });
      h += '</tbody></table></div>';
      return h;
    }
    function kpi(label, val, cls, strong) { return '<div class="kpi' + (strong ? ' strong' : '') + '"><div class="kpi-l">' + label + '</div><div class="kpi-v ' + cls + '">' + won(val) + '<small>원</small></div></div>'; }
    function kpiDiff(sm) {
      var p = pct(sm.amt, sm.base), d = sm.amt - sm.base;
      return '<div class="kpi"><div class="kpi-l">전년 대비</div><div class="kpi-v k-diff ' + (d > 0 ? 'up' : d < 0 ? 'down' : '') + '">' + (d > 0 ? '+' : '') + won(d) + '<small>원' + (p != null ? ' (' + (p > 0 ? '+' : '') + p + '%)' : '') + '</small></div></div>';
    }
    function groupRow(level, type, code, lines) {
      var sub = lines.filter(function (l) { return level === 'g' ? String(l.mok).split('.')[0] === code : (String(l.mok).split('.').slice(0, 2).join('.') === code); });
      var s = calc.sums(sub);
      return '<tr class="grp grp-' + level + '" data-g="' + code + '" data-lv="' + level + '"><td colspan="2"><span class="code">' + esc(code) + '</span> ' + esc(codeName(type, code)) + '</td>' +
        '<td class="num t-base">' + won(s.base) + '</td><td class="num t-used">' + won(s.used) + '</td><td class="num t-fc">' + won(s.fc) + '</td><td></td><td class="num t-amt">' + won(s.amt) + '</td>' +
        '<td class="num t-diff">' + diffHtml(s.base, s.amt) + '</td><td colspan="2"></td></tr>';
    }
    function diffHtml(base, amt) {
      var d = amt - base; if (!base && !amt) return '<span class="muted">-</span>';
      if (!base) return '<span class="chip c-blue">신규</span>';
      if (d === 0) return '<span class="muted">0%</span>';
      var p = pct(amt, base);
      return '<span class="df ' + (d > 0 ? 'up' : d < 0 ? 'down' : '') + '">' + (d > 0 ? '+' : '') + p + '%</span><small>' + (d > 0 ? '+' : '') + won(d) + '</small>';
    }
    function flagsHtml(l, ed) {
      var f = '';
      if (calc.needReason(l) && !String(l.reason || '').trim()) f += '<span class="flag err">' + ico('alert', 13) + (Number(l.base_amount) > 0 ? calc.varPct + '% 초과 증감 — 사유 필요' : '신규 — 사유 필요') + '</span>';
      var mm = calc.calcMismatch(l);
      if (mm != null) f += '<span class="flag warn">' + ico('alert', 13) + '산출식 계산값 ' + won(mm) + '원' + (ed ? ' <button class="lnk" data-act="applycalc" data-v="' + mm + '">금액에 적용</button>' : '') + '</span>';
      return f;
    }
    function lineRow(l, ed) {
      var added = isAdded(l), canName = ed && (added || ctx.admin), canDel = ed && (added || ctx.admin);
      var nameCell = canName && added
        ? '<input class="in nm" data-f="name" value="' + esc(l.name) + '" aria-label="세부명칭">'
        : '<div class="nm-t">' + esc(l.name) + (added ? ' <span class="chip c-blue">추가</span>' : '') + '</div>';
      var used = calc.used(l.id), cnt = (data.spend || []).filter(function (s) { return s.line_id === l.id; }).length;
      return '<tr class="ln" data-id="' + l.id + '">' +
        '<td class="c-code" data-l="코드"><span class="code">' + esc(l.mok) + '</span><div class="moknm">' + esc(codeName(l.type, l.mok)) + '</div></td>' +
        '<td class="c-name" data-l="세부명칭">' + nameCell + (l.base_calc ? '<div class="bcalc">2026 산출: ' + esc(l.base_calc) + '</div>' : '') + '<div class="flags">' + flagsHtml(l, ed) + '</div></td>' +
        '<td class="num c-base" data-l="2026 예산">' + won(l.base_amount) + '</td>' +
        '<td class="num c-used" data-l="' + usedLabel(l.type) + '"><button class="usebtn' + (ui.open[l.id] ? ' on' : '') + '" data-act="toggle-spend" aria-expanded="' + !!ui.open[l.id] + '"><span class="usev">' + won(used) + '</span><span class="usec">' + cnt + '건</span>' + ico('chev', 14) + '</button></td>' +
        '<td class="num c-fc" data-l="연말 추정">' + numIn('forecast', l.forecast, ed, '미입력') + '</td>' +
        '<td class="c-calc" data-l="2027 산출식"><div class="calc-in"><input class="in" data-f="calc" value="' + esc(l.calc) + '"' + (ed ? '' : ' readonly') + ' placeholder="예: 400,000원 × 4회" aria-label="2027 산출식">' +
        (ed ? '<button class="icon-btn" data-act="calc" title="단가 × 수량 입력기" aria-label="산출 입력기">' + ico('calc') + '</button>' : '') + '</div></td>' +
        '<td class="num c-amt" data-l="2027 요구액">' + numIn('amount', l.amount, ed, '0') + '</td>' +
        '<td class="num c-diff" data-l="증감">' + diffHtml(l.base_amount, l.amount) + '</td>' +
        '<td class="c-reason" data-l="증감 사유"><input class="in' + (calc.needReason(l) && !String(l.reason || '').trim() ? ' need' : '') + '" data-f="reason" value="' + esc(l.reason) + '"' + (ed ? '' : ' readonly') + ' placeholder="' + (calc.needReason(l) ? '사유를 입력하십시오' : '') + '" aria-label="증감 사유"></td>' +
        '<td class="c-act">' + (ctx.admin ? '<button class="icon-btn" data-act="edit-line" title="코드·명칭·2026 기준 수정" aria-label="항목 수정">' + ico('edit') + '</button>' : '') +
        (canDel ? '<button class="icon-btn danger" data-act="del-line" title="삭제" aria-label="삭제">' + ico('trash') + '</button>' : '') + '</td></tr>';
    }
    function numIn(f, v, ed, ph) {
      return '<input class="in num" data-f="' + f + '" inputmode="numeric" value="' + (v == null ? '' : won(v)) + '"' + (ed ? '' : ' readonly') + ' placeholder="' + ph + '" aria-label="' + (f === 'amount' ? '2027 요구액' : '연말 추정') + '">';
    }
    function spendRow(l, ed, type) {
      var list = (data.spend || []).filter(function (s) { return s.line_id === l.id; });
      var lab = type === '세입' ? '수납' : '지출';
      var rows = list.map(function (s) {
        return '<tr data-sid="' + s.id + '"><td><input type="date" class="in" data-sf="spent_on" value="' + esc(s.spent_on || '') + '"' + (ed ? '' : ' readonly') + '></td>' +
          '<td><input class="in" data-sf="memo" value="' + esc(s.memo) + '" placeholder="적요" ' + (ed ? '' : 'readonly') + '></td>' +
          '<td><input class="in" data-sf="vendor" value="' + esc(s.vendor) + '" placeholder="거래처" ' + (ed ? '' : 'readonly') + '></td>' +
          '<td><input class="in num" inputmode="numeric" data-sf="amount" value="' + won(s.amount) + '"' + (ed ? '' : ' readonly') + '></td>' +
          '<td>' + (ed ? '<button class="icon-btn danger" data-act="sp-del" aria-label="내역 삭제">' + ico('trash') + '</button>' : '') + '</td></tr>';
      }).join('');
      return '<tr class="sp" data-for="' + l.id + '"><td colspan="10"><div class="sp-box"><div class="sp-hd"><b>' + esc(l.name) + '</b> 2026 ' + lab + ' 내역 <span class="muted">· 건별로 입력하면 합계가 자동 계산됩니다</span>' +
        (ed ? '<button class="btn btn-secondary btn-sm" data-act="sp-add">' + ico('plus', 16) + ' ' + lab + ' 추가</button>' : '') + '</div>' +
        (list.length ? '<table class="spt"><thead><tr><th>일자</th><th>적요</th><th>거래처</th><th class="num">금액(원)</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' : '<div class="muted sp-empty">입력된 내역이 없습니다.</div>') +
        '<div class="sp-sum">합계 <b>' + won(calc.used(l.id)) + '</b>원</div></div></td></tr>';
    }

    /* ── 파생값 갱신 (포커스 유지를 위해 부분 갱신) ── */
    function refreshRow(id) {
      var l = lineById(id), tr = root.querySelector('tr.ln[data-id="' + id + '"]'); if (!l || !tr) return;
      var ed = editable(l.type);
      $('.flags', tr).innerHTML = flagsHtml(l, ed);
      $('.c-diff', tr).innerHTML = diffHtml(l.base_amount, l.amount);
      var r = $('[data-f="reason"]', tr), need = calc.needReason(l) && !String(l.reason || '').trim();
      r.classList.toggle('need', need); r.placeholder = calc.needReason(l) ? '사유를 입력하십시오' : '';
      $('.usev', tr).textContent = won(calc.used(id));
      $('.usec', tr).textContent = (data.spend || []).filter(function (s) { return s.line_id === id; }).length + '건';
    }
    function refreshTotals(type) {
      var tbl = root.querySelector('table.bt'); var lines = linesOf(type);
      $$('tr.grp', root).forEach(function (tr) {
        var code = tr.dataset.g, lv = tr.dataset.lv;
        var sub = lines.filter(function (l) { return lv === 'g' ? String(l.mok).split('.')[0] === code : (String(l.mok).split('.').slice(0, 2).join('.') === code); });
        var s = calc.sums(sub);
        $('.t-base', tr).textContent = won(s.base); $('.t-used', tr).textContent = won(s.used); $('.t-fc', tr).textContent = won(s.fc);
        $('.t-amt', tr).textContent = won(s.amt); $('.t-diff', tr).innerHTML = diffHtml(s.base, s.amt);
      });
      var sm = calc.sums(lines), k = $('.kpis', root);
      if (k) k.outerHTML = '<div class="kpis">' + kpi('2026 예산', sm.base, 'k-base') + kpi('2026 ' + usedLabel(type), sm.used, 'k-used') + kpi('연말 추정', sm.fc, 'k-fc') + kpi('2027 요구', sm.amt, 'k-amt', true) + kpiDiff(sm) + '</div>';
      if (tbl) { /* no-op */ }
    }
    function afterChange() { calc.invalidate(null, data.spend || []); if (ctx.onChange) ctx.onChange(); }
    function fail(e) { toast(e.message, 'err'); }

    /* ── 항목 저장 ── */
    function saveField(id, patch, input) {
      var l = lineById(id), tr = input && input.closest('tr');
      if (tr) tr.classList.add('saving');
      patch.id = id;
      return ctx.api.saveLine(patch).then(function (row) {
        Object.keys(row).forEach(function (k) { l[k] = row[k]; });
        if (tr) { tr.classList.remove('saving'); tr.classList.add('saved'); setTimeout(function () { tr.classList.remove('saved'); }, 700); }
        refreshRow(id); refreshTotals(l.type); afterChange();
        if (input && patch.amount != null) input.value = won(l.amount);
      }).catch(function (e) {
        if (tr) tr.classList.remove('saving');
        if (input) { var f = input.dataset.f; input.value = (f === 'amount' || f === 'forecast') ? (l[f] == null ? '' : won(l[f])) : (l[f] || ''); }
        fail(e);
      });
    }

    /* ── 이벤트 ── */
    root.addEventListener('focusin', function (e) { var t = e.target; if (t.classList && t.classList.contains('num') && !t.readOnly) setTimeout(function () { t.select && t.select(); }, 0); });
    root.addEventListener('keydown', function (e) {
      var t = e.target; if (e.key !== 'Enter' || !t.dataset || !(t.dataset.f || t.dataset.sf)) return;
      e.preventDefault(); t.blur();
      var tr = t.closest('tr'); var nx = tr && tr.nextElementSibling;
      while (nx && !nx.classList.contains('ln')) nx = nx.nextElementSibling;
      if (nx && t.dataset.f) { var n = $('[data-f="' + t.dataset.f + '"]', nx); if (n && !n.readOnly) n.focus(); }
    });
    root.addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset.f && t.closest('tr.ln')) {
        var id = t.closest('tr.ln').dataset.id, f = t.dataset.f, patch = {};
        if (f === 'amount' || f === 'forecast') { var n = num(t.value); if (f === 'amount' && n == null) n = 0; patch[f] = n; t.value = n == null ? '' : won(n); }
        else patch[f] = t.value;
        saveField(id, patch, t);
      } else if (t.dataset.sf) {
        var tr = t.closest('tr[data-sid]'), sp = t.closest('tr.sp'), lid = sp.dataset.for, sid = tr.dataset.sid, ff = t.dataset.sf, pp = { id: sid };
        pp[ff] = ff === 'amount' ? (num(t.value) || 0) : t.value;
        if (ff === 'amount') t.value = won(pp.amount);
        ctx.api.saveSpend(lid, pp).then(function (row) {
          data.spend = data.spend.map(function (s) { return s.id === sid ? row : s; });
          calc.invalidate(null, data.spend); refreshRow(lid); refreshTotals(lineById(lid).type); $('.sp-sum b', sp).textContent = won(calc.used(lid)); afterChange();
        }).catch(fail);
      }
    });
    root.addEventListener('click', function (e) {
      var tb = e.target.closest('[data-tab]');
      if (tb) { ui.tab = tb.dataset.tab; render(); return; }
      var a = e.target.closest('[data-act]'); if (!a) return;
      var act = a.dataset.act, tr = a.closest('tr.ln'), id = tr && tr.dataset.id;
      if (act === 'toggle-spend') { ui.open[id] = !ui.open[id]; renderBody(); return; }
      if (act === 'add-line') return addLineModal(typeOf(ui.tab));
      if (act === 'fill-fc') return fillForecastModal(typeOf(ui.tab));
      if (act === 'applycalc') { var inp = $('[data-f="amount"]', tr); inp.value = won(Number(a.dataset.v)); saveField(id, { amount: Number(a.dataset.v) }, inp); return; }
      if (act === 'calc') {
        var l = lineById(id);
        openCalcModal({ calc: $('[data-f="calc"]', tr).value }, function (text, sum) {
          $('[data-f="calc"]', tr).value = text; $('[data-f="amount"]', tr).value = won(sum);
          saveField(id, { calc: text, amount: sum }, $('[data-f="amount"]', tr));
        });
        return;
      }
      if (act === 'del-line') {
        var ln = lineById(id);
        confirmBox('「' + ln.name + '」 항목을 삭제하시겠습니까?\n입력된 사용 내역도 함께 삭제됩니다.', '삭제', true).then(function (ok) {
          if (!ok) return;
          ctx.api.deleteLine(id).then(function () {
            data.lines = data.lines.filter(function (x) { return x.id !== id; }); data.spend = data.spend.filter(function (s) { return s.line_id !== id; });
            calc.invalidate(null, data.spend); render(); afterChange(); toast('삭제했습니다.');
          }).catch(fail);
        });
        return;
      }
      if (act === 'edit-line') return editLineModal(lineById(id));
      if (act === 'sp-add') {
        var sp = a.closest('tr.sp'), lid = sp.dataset.for;
        ctx.api.saveSpend(lid, { spent_on: '', memo: '', vendor: '', amount: 0 }).then(function (row) { data.spend.push(row); renderBody(); }).catch(fail);
        return;
      }
      if (act === 'sp-del') {
        var sr = a.closest('tr[data-sid]'), sid = sr.dataset.sid, sl = a.closest('tr.sp').dataset.for;
        ctx.api.deleteSpend(sid).then(function () {
          data.spend = data.spend.filter(function (s) { return s.id !== sid; }); calc.invalidate(null, data.spend); renderBody(); afterChange();
        }).catch(fail);
      }
    });

    /* ── 항목 추가 / 관리자 수정 모달 ── */
    function mokOptions(type, sel) {
      var gw = {}, out = '';
      mokList(type).forEach(function (c) {
        var g = c.code.split('.')[0], hg = c.code.split('.').slice(0, 2).join('.');
        var key = hg; if (!gw[key]) { gw[key] = 1; if (out) out += '</optgroup>'; out += '<optgroup label="' + esc(hg + ' ' + codeName(type, hg)) + '">'; }
        out += '<option value="' + esc(c.code) + '"' + (c.code === sel ? ' selected' : '') + '>' + esc(c.code + ' ' + c.name) + '</option>';
      });
      return out + (out ? '</optgroup>' : '');
    }
    function addLineModal(type) {
      modal({
        title: type + ' 항목 추가',
        body: '<div class="form"><label>예산 코드(목)<select id="al-mok" class="in">' + mokOptions(type) + '</select></label>' +
          '<label>세부명칭<input id="al-name" class="in" maxlength="100" placeholder="예: 신규 교재 구입비"></label>' +
          '<label><span>2027 산출식 <span class="muted">(선택)</span></span><input id="al-calc" class="in" placeholder="예: 10,000원 × 30권"></label>' +
          '<label>2027 요구액(원)<input id="al-amt" class="in num" inputmode="numeric" placeholder="0"></label>' +
          '<label>사유<input id="al-reason" class="in" placeholder="신규 항목은 사유가 필요합니다"></label>' +
          '<p class="muted">2026 기준 항목에 없는 지출·수입을 추가할 때 사용합니다. 코드는 등록된 목 중에서만 선택할 수 있습니다.</p></div>',
        actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '추가', cls: 'btn-primary', onClick: function (m) {
          var el = m.el, line = { type: type, mok: $('#al-mok', el).value, name: $('#al-name', el).value.trim(), calc: $('#al-calc', el).value, amount: num($('#al-amt', el).value) || 0, reason: $('#al-reason', el).value };
          if (ctx.admin) line.dept = ctx.dept;
          if (!line.name) { toast('세부명칭을 입력해 주십시오.', 'err'); return; }
          ctx.api.saveLine(line).then(function (row) { data.lines.push(row); m.close(); ui.tab = type === '세출' ? 'sechul' : 'sein'; render(); afterChange(); toast('항목을 추가했습니다.'); }).catch(fail);
        } }]
      });
    }
    function fillForecastModal(type) {
      var targets = linesOf(type).filter(function (l) { return l.forecast == null; });
      if (!targets.length) return toast('연말 추정액이 비어 있는 항목이 없습니다.');
      modal({
        title: '연말 추정 일괄 입력',
        body: '<p class="mdl-msg">연말 추정액이 비어 있는 ' + targets.length + '건에 값을 채웁니다. 입력 후 항목별로 고칠 수 있습니다.</p><div class="form">' +
          '<label class="chk-l"><input type="radio" name="fc-mode" value="base" checked> 2026 예산액과 동일 (연말까지 예산대로 집행·수납 예상)</label>' +
          '<label class="chk-l"><input type="radio" name="fc-mode" value="used"> 현재까지 입력한 사용액 그대로 (추가 집행 없음)</label></div>',
        actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '채우기', cls: 'btn-primary', onClick: function (m) {
          var mode = $('input[name="fc-mode"]:checked', m.el).value; m.close();
          targets.reduce(function (p, l) {
            return p.then(function () {
              var v = mode === 'base' ? Number(l.base_amount) || 0 : calc.used(l.id);
              return ctx.api.saveLine({ id: l.id, forecast: v }).then(function (row) { Object.keys(row).forEach(function (k) { l[k] = row[k]; }); });
            });
          }, Promise.resolve()).then(function () { renderBody(); afterChange(); toast(targets.length + '건을 입력했습니다.'); }).catch(function (e) { renderBody(); fail(e); });
        } }]
      });
    }
    function editLineModal(l) {
      modal({
        title: '항목 수정 (관리자)',
        body: '<div class="form"><label>예산 코드(목)<select id="el-mok" class="in">' + mokOptions(l.type, l.mok) + '</select></label>' +
          '<label>세부명칭<input id="el-name" class="in" value="' + esc(l.name) + '"></label>' +
          '<label>2026 산출식(기준)<input id="el-bcalc" class="in" value="' + esc(l.base_calc) + '"></label>' +
          '<label>2026 예산액(기준, 원)<input id="el-bamt" class="in num" inputmode="numeric" value="' + won(l.base_amount) + '"></label></div>',
        actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '저장', cls: 'btn-primary', onClick: function (m) {
          var el = m.el;
          ctx.api.saveLine({ id: l.id, mok: $('#el-mok', el).value, name: $('#el-name', el).value.trim(), base_calc: $('#el-bcalc', el).value, base_amount: num($('#el-bamt', el).value) || 0 })
            .then(function (row) { Object.keys(row).forEach(function (k) { l[k] = row[k]; }); m.close(); render(); afterChange(); toast('저장했습니다.'); }).catch(fail);
        } }]
      });
    }

    /* ── 요약·제출 ── */
    function stepper(st) {
      var cur = stageIdx(st);
      return '<ol class="steps">' + STAGES.map(function (s, i) { return '<li class="' + (i < cur ? 'done' : i === cur ? 'cur' : '') + '"><span class="dot">' + (i < cur ? ico('check', 12) : (i + 1)) + '</span>' + s.t + '</li>'; }).join('') + '</ol>';
    }
    function summaryHtml() {
      return ['세출', '세입'].map(function (type) {
        var lines = linesOf(type), sm = calc.sums(lines), s = subOf(type), cap = capOf(type), v = validate(type), p = pct(sm.amt, sm.base);
        var meter = '';
        if (cap > 0) {
          var r = Math.min(sm.amt * 100 / cap, 100), over = sm.amt > cap;
          meter = '<div class="meter ' + (over ? 'over' : '') + '"><div class="meter-bar"><i style="width:' + r + '%"></i></div><div class="meter-t">부서 한도 ' + won(cap) + '원 대비 ' + Math.round(sm.amt * 100 / cap) + '%' + (over ? ' · ' + won(sm.amt - cap) + '원 초과 (경고)' : '') + '</div></div>';
        } else meter = '<div class="muted">부서 한도가 설정되지 않았습니다.</div>';
        return '<section class="card sum" data-type="' + type + '"><div class="sum-hd"><h3>' + type + '예산</h3><span class="chip ' + (s.status === 'confirmed' ? 'c-green' : s.status === 'draft' ? 'c-gray' : 'c-blue') + '">' + stageLabel(s.status) + '</span></div>' +
          stepper(s.status) + statusBanner(type) +
          '<div class="kpis">' + kpi('2026 예산', sm.base, '') + kpi('2026 ' + usedLabel(type), sm.used, '') + kpi('연말 추정', sm.fc, '') + kpi('2027 요구', sm.amt, '', true) + kpiDiff(sm) + '</div>' + meter +
          '<div class="chk"><h4>제출 전 점검</h4>' + chkHtml(v, lines.length) + '</div>' +
          '<div class="sum-act" data-actions="' + type + '"></div></section>';
      }).join('');
    }
    function chkHtml(v, n) {
      if (!n) return '<p class="muted">입력된 항목이 없습니다. 해당 사항이 없으면 그대로 제출할 수 있습니다.</p>';
      var h = '';
      if (!v.errors.length && !v.warnings.length) return '<p class="ok-t">' + ico('check', 16) + ' 점검 항목에 문제가 없습니다.</p>';
      if (v.errors.length) h += '<div class="chk-g err"><b>제출 차단 ' + v.errors.length + '건</b><ul>' + v.errors.map(function (x) { return '<li>' + esc(x.msg) + '</li>'; }).join('') + '</ul></div>';
      if (v.warnings.length) h += '<div class="chk-g warn"><b>확인 권장 ' + v.warnings.length + '건 (제출은 가능)</b><ul>' + v.warnings.slice(0, 30).map(function (x) { return '<li>' + esc(x.msg) + '</li>'; }).join('') + (v.warnings.length > 30 ? '<li class="muted">외 ' + (v.warnings.length - 30) + '건</li>' : '') + '</ul></div>';
      return h;
    }
    function afterSummary(b) {
      ['세출', '세입'].forEach(function (type) {
        var box = $('[data-actions="' + type + '"]', b); if (!box) return;
        if (ctx.actionsFor) { ctx.actionsFor(type, box, subOf(type), function () { render(); }); return; }
        var s = subOf(type), v = validate(type), h = '';
        if (data.open && s.status === 'draft') h = '<button class="btn btn-primary" data-sub="' + type + '"' + (v.errors.length ? ' disabled' : '') + '>' + ico('check', 16) + ' ' + type + '예산 제출</button>' + (v.errors.length ? '<span class="muted">차단 항목을 해결하면 제출할 수 있습니다.</span>' : '');
        else if (data.open && s.status === 'submitted') h = '<button class="btn btn-secondary" data-recall="' + type + '">' + ico('undo', 16) + ' 제출 회수</button><span class="muted">기획처가 검토를 시작하기 전까지 회수할 수 있습니다.</span>';
        box.innerHTML = h;
      });
      b.onclick = function (e) {
        var sb = e.target.closest('[data-sub]'), rc = e.target.closest('[data-recall]');
        if (sb) {
          var type = sb.dataset.sub, v = validate(type);
          confirmBox(type + '예산을 제출하시겠습니까?\n제출 후에는 기획처 검토 결과 반려되기 전까지 수정할 수 없습니다.' + (v.warnings.length ? '\n(확인 권장 ' + v.warnings.length + '건이 남아 있습니다.)' : ''), '제출').then(function (ok) {
            if (!ok) return;
            ctx.api.submit(type).then(function (r) {
              if (r && r.ok === false) { toast('제출 차단 항목이 있습니다. 서버 점검을 통과하지 못했습니다.', 'err'); return; }
              setSub(type, 'submitted'); render(); afterChange(); toast(type + '예산을 제출했습니다.');
            }).catch(fail);
          });
        }
        if (rc) {
          var t2 = rc.dataset.recall;
          ctx.api.recall(t2).then(function () { setSub(t2, 'draft'); render(); afterChange(); toast('제출을 회수했습니다.'); }).catch(fail);
        }
      };
    }
    function setSub(type, status) {
      for (var i = 0; i < data.subs.length; i++) if (data.subs[i].type === type && (!ctx.admin || data.subs[i].dept === ctx.dept)) { data.subs[i].status = status; if (status === 'draft') data.subs[i].reject_reason = data.subs[i].reject_reason; }
    }

    render();
    return { render: render, setTab: function (t) { ui.tab = t; render(); }, validate: validate, setSub: setSub };
  }

  window.BW = {
    SUPA_URL: SUPA_URL, rpc: rpc, errMsg: errMsg, sess: sess, setAuthLost: function (f) { onAuthLost = f; },
    $: $, $$: $$, esc: esc, won: won, num: num, pct: pct, ico: ico, toast: toast, modal: modal, confirmBox: confirmBox,
    fmtDT: fmtDT, toLocalInput: toLocalInput, fromLocalInput: fromLocalInput,
    TYPES: TYPES, STAGES: STAGES, stageLabel: stageLabel, stageIdx: stageIdx, cmpMok: cmpMok, Calc: Calc, mount: mount
  };
})();
