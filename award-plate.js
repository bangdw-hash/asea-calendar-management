'use strict';
/**
 * award-plate.js — 명패(A4 세로 · 가로선 3개로 4등분 접이식) 양식  (AW.Plate)
 *  · 3칸(정면)에 입력하면 2칸에 180° 회전되어 자동 반영(편집·미리보기·인쇄 공용 — AW.renderPage 가 decorate 를 호출)
 *  · 접는 선·좌우 인쇄 불가 여백 표시, 자석(가운데·접는 선·여백선), 여백 밖 개체 경고·이동 제한
 *  · 양식 만들기: 아세아 직원 / 외부 기관(타이틀 포함 로고) / 외부 기관(로고 + 기관명 입력)
 *  · 직원 명부(서버 저장 award_pref 'plate_roster') — 엑셀 서식·일괄 올리기·체크 선택 → 데이터 영역으로 넣기
 *  양식 설정은 tpl.page.plate = {kind, f:[접는 선 3개 y(mm)], sl, sr, mirror, guide, tick, clamp}
 */
(function () {
  var AW = window.AW, S = AW.S, P = AW.Plate = {}, $ = AW.$, esc = AW.esc;
  var DEF = { kind: 'asea', f: [74.25, 148.5, 222.75], sl: 5, sr: 5, mirror: true, guide: true, tick: false, clamp: true };
  var KIND = { asea: '아세아 직원 명패', ext1: '외부 기관 · 타이틀 포함 로고', ext2: '외부 기관 · 로고 + 기관명 입력' };
  var ROSTER_KEY = 'plate_roster', LS_KEY = 'award_plate_roster';
  var warnAt = 0;

  P.is = function (t) { t = t || S.tpl; return !!(t && t.page && t.page.plate); };
  function cfg(t) { return (t || S.tpl).page.plate; }
  P.cfg = cfg;
  // 정면(3칸) 개체: 세로 중심이 3칸 안에 있는 개체 → 2칸에 반전 복제
  function front(e, p) { var cy = e.y + (e.t === 'line' ? 0 : e.h / 2); return cy >= p.f[1] && cy < p.f[2]; }
  function outSafe(e, W, p) {
    if (e.hide || e.noprint || e.ph || (e.rot && e.rot % 180)) return false;
    return e.x < p.sl - 0.05 || e.x + e.w > W - p.sr + 0.05;
  }

  /* ───────────────────────── 이름 자간: 글자 수별 규칙표 + 명부 개인별 값 ───────────────────────── */
  // 개인별 값(row._sp, pt) > 규칙표(page.plate.sp: c2·c3·c4 = 이름 2자·이름 3자·4자 이상) > 글상자 기본 자간. 없으면 null
  P.spacing = function (row, p) {
    if (row && row._sp !== undefined && row._sp !== null && String(row._sp).trim() !== '' && !isNaN(+row._sp)) return Math.max(0, +row._sp);
    if (!p || !p.sp || !row) return null;
    var n = String(row['이름'] != null ? row['이름'] : row['성명'] || '').replace(/\s/g, '').length; if (!n) return null;
    var v = n <= 2 ? p.sp.c2 : n === 3 ? p.sp.c3 : p.sp.c4; return v == null || v === '' || isNaN(+v) ? null : Math.max(0, +v);
  };
  function spDialog(api) {
    var p = cfg(S.tpl), sp = p.sp || {}, N = function (id, v) { return '<input class="in num" id="' + id + '" type="number" min="0" max="80" step="0.5" value="' + (v == null ? '' : v) + '">'; };
    AW.modal({
      title: '이름 자간 규칙 (글자 수별)', body:
        '<p class="muted" style="margin-top:0">이름 글자 수에 따라 <b>한 줄 전체</b>의 글자 사이(자간, pt)를 자동으로 넓힙니다. 짧은 이름(예: 두 글자)일수록 크게 두면 폭이 비어 보이지 않습니다. 비워 두면 그 경우는 글상자 기본 자간을 씁니다.</p>' +
        '<div class="grid2"><div><label class="f">이름 2자 (예: 이현)</label>' + N('ps-2', sp.c2) + '</div><div><label class="f">이름 3자 (예: 권오건)</label>' + N('ps-3', sp.c3) + '</div>' +
        '<div><label class="f">이름 4자 이상</label>' + N('ps-4', sp.c4) + '</div></div>' +
        '<p class="muted" style="margin-bottom:0">· 사람마다 다르게 하려면 직원 명부의 「자간」 열에 값을 넣으십시오(규칙표보다 우선).<br>· 폭이 모자라면 <b>자간을 먼저 줄이고</b>, 그래도 넘칠 때 글자 크기를 줄여 한 줄에 맞추면 됨니다.</p>',
      actions: [{ label: '취소', cls: 'btn-ghost' }, { label: '규칙 지우기', cls: 'btn-ghost', onClick: function (c) { delete p.sp; c(); AW.Editor.render(); api.changed('page'); AW.Preview && AW.Preview.render(); } }, {
        label: '적용', cls: 'btn-primary', onClick: function (c) {
          var g = function (id) { var v = $(id).value.trim(); return v === '' ? null : Math.max(0, Math.min(80, parseFloat(v))); }, r = { c2: g('#ps-2'), c3: g('#ps-3'), c4: g('#ps-4') };
          if ([r.c2, r.c3, r.c4].some(function (v) { return v != null && isNaN(v); })) return AW.toast('숫자(0~80)로 입력해 주십시오.', 'error');
          p.sp = r; c(); AW.Editor.render(); api.changed('page', false, '이름 자간 규칙'); AW.Preview && AW.Preview.render();
        }
      }]
    });
  }

  /* ───────────────────────── 렌더러 연동 ───────────────────────── */
  // 페이지 DOM 에 반전 복제 레이어·접는 선 안내를 넣음 (여러 번 호출해도 기존 것을 교체)
  P.decorate = function (pg, tpl, k, o, mode) {
    var p = tpl.page.plate; if (!p) return;
    AW.$$('.pl-mir,.pl-g', pg).forEach(function (n) { n.remove(); });
    var W = tpl.page.w, H = tpl.page.h, f = p.f, bg = AW.$('.pg-bg', pg), ref = bg ? bg.nextSibling : pg.firstChild, nodes = [], dx = (o && o.dx) || 0, dy = (o && o.dy) || 0;
    if (p.mirror !== false) {
      var m = document.createElement('div'); m.className = 'pl-mir';
      m.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;transform-origin:' + (W / 2 * k) + 'px ' + (f[1] * k) + 'px;transform:rotate(180deg)';
      tpl.elems.forEach(function (e) {
        if (!front(e, p) || e.noprint || e.hide) return;
        var d = AW.renderElem(e, k, o || { mode: mode }, -dx, -dy); delete d.dataset.id; d.classList.add('mir'); m.appendChild(d);
      });
      nodes.push(m);
    }
    if (mode === 'edit' && p.guide !== false) {
      var g = document.createElement('div'); g.className = 'pl-g'; var h = '';
      h += '<i class="pl-side" style="left:0;width:' + p.sl * k + 'px"><b>인쇄 불가</b></i><i class="pl-side" style="right:0;width:' + p.sr * k + 'px"><b>인쇄 불가</b></i>';
      h += '<i class="pl-front" style="top:' + f[1] * k + 'px;height:' + (f[2] - f[1]) * k + 'px"></i>';
      var ys = [0, f[0], f[1], f[2]], ye = [f[0], f[1], f[2], H], lb = ['① 빈 칸', '② 반전 · 자동 반영(수정 불가)', '③ 정면 · 여기에 입력', '④ 빈 칸'];
      for (var i = 0; i < 4; i++) h += '<span class="pl-lb' + (i === 2 ? ' on' : '') + '" style="top:' + (ys[i] * k + 3) + 'px;left:' + (p.sl * k + 4) + 'px">' + lb[i] + ' · ' + AW.round(ye[i] - ys[i], 2) + 'mm</span>';
      f.forEach(function (y, i) { h += '<i class="pl-fold" style="top:' + y * k + 'px"><b>접는 선 ' + (i + 1) + '</b></i>'; });
      h += '<i class="pl-mid" style="top:' + ((f[1] + f[2]) / 2 * k) + 'px"><b>③ 세로 가운데</b></i>';
      g.innerHTML = h; nodes.push(g);
    }
    // 미리보기에서도 접는 선 표시 (화면 전용 — 인쇄 시 숨김)
    if (mode !== 'edit') {
      var pv = document.createElement('div'); pv.className = 'pl-g pl-g-pv'; var pvh = '';
      f.forEach(function (y, i) { pvh += '<i class="pl-fold pl-fold-pv" style="top:' + (y + dy) * k + 'px"><b>접는 선 ' + (i + 1) + '</b></i>'; });
      pv.innerHTML = pvh; nodes.push(pv);
      if (p.tick) {   // 접는 위치 확인용 작은 눈금(인쇄 가능 영역 안쪽 좌·우)
        var t = document.createElement('div'); t.className = 'pl-g';
        t.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
        var th = ''; f.forEach(function (y) { [p.sl + 0.5, W - p.sr - 4.5].forEach(function (x) { th += '<i style="position:absolute;left:' + ((x + dx) * k) + 'px;top:' + ((y + dy) * k) + 'px;width:' + 4 * k + 'px;border-top:' + Math.max(0.5, 0.2 * k) + 'px solid #888"></i>'; }); });
        t.innerHTML = th; nodes.push(t);
      }
    }
    nodes.forEach(function (n) { pg.insertBefore(n, ref); });
  };
  // 편집기에서 개체 레이어만 다시 그린 뒤 호출 — 반전 레이어 갱신 + 여백 밖 개체 표시
  P.refresh = function (pg, tpl, k, lang) {
    if (!pg || !tpl || !tpl.page.plate) return;
    P.decorate(pg, tpl, k, { mode: 'edit', lang: lang, scale: k }, 'edit'); AW.fitAll(pg);
    var p = tpl.page.plate, W = tpl.page.w, bad = [];
    tpl.elems.forEach(function (e) { var d = AW.$('.el[data-id="' + e.id + '"]', pg); if (!d) return; var b = outSafe(e, W, p); d.classList.toggle('pl-warn', b); if (b) bad.push(e); });
    P.updateWarnPanel(bad, p);
    if (bad.length && Date.now() - warnAt > 8000) { warnAt = Date.now(); AW.toast('좌우 ' + p.sl + 'mm 인쇄 불가 영역에 걸친 개체가 있습니다(붉은 점선). 목록을 확인하십시오.', 'error'); }
  };
  // 여백 초과 개체 목록 패널 (도구줄 아래, 없으면 숨김)
  P.updateWarnPanel = function (bad, p) {
    var panel = AW.$('.pl-warn-panel');
    if (!bad || !bad.length) { if (panel) panel.remove(); return; }
    var bar = AW.$('.pl-bar'); if (!bar) { if (panel) panel.remove(); return; }
    if (!panel) { panel = document.createElement('div'); panel.className = 'pl-warn-panel'; bar.parentNode.insertBefore(panel, bar.nextSibling); }
    var TYPE = { text: '글상자', img: '이미지', rect: '도형', line: '선', table: '표', qr: 'QR' };
    var rows = bad.map(function (e) {
      var label = AW.elemText ? (AW.elemText(e) || '').replace(/\{\{[^}]+\}\}/g, '…').replace(/\s+/g, ' ').trim().slice(0, 30) : '';
      var side = (e.x < (p.sl || 0) - 0.05) ? '왼쪽' : '오른쪽';
      return '<li><button class="pl-warn-go" data-id="' + e.id + '" title="개체 선택">' +
        AW.ic('alert', 14) + ' <b>' + (TYPE[e.t] || e.t) + '</b>' + (label ? ' · ' + AW.esc(label) : '') +
        ' <span class="muted">(' + side + ' 여백 침범)</span></button></li>';
    }).join('');
    panel.innerHTML = AW.ic('alert', 14) + ' <b>인쇄 불가 영역 침범 ' + bad.length + '개</b> — 잊릴 수 있습니다. 클릭하면 해당 개체로 이동합니다. <ul class="pl-warn-list">' + rows + '</ul>';
    AW.$$('.pl-warn-go', panel).forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.dataset.id;
        if (AW.Editor && AW.Editor.setSel) {
          AW.Editor.setSel([id]);
          var el = AW.$('.el[data-id="' + id + '"]');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      };
    });
  };
  // 편집기 자석: 접는 선 · 3칸 세로 가운데 · 좌우 여백선
  P.targets = function (pg, tx, ty) {
    var p = pg.plate; if (!p) return;
    tx.push({ v: p.sl, k: 'plate' }, { v: pg.w - p.sr, k: 'plate' });
    p.f.forEach(function (y) { ty.push({ v: y, k: 'plate' }); }); ty.push({ v: (p.f[1] + p.f[2]) / 2, k: 'pc' });
  };
  // 이동 중 좌우 여백 밖으로 나가면 경고 — 실제 이동은 막지 않음(clamp=true 여도 경고만)
  var _clampWarnAt = 0;
  P.clampMove = function (list, pg) {
    var p = pg.plate; if (!p || !list.length) return;
    var x1 = Infinity, x2 = -Infinity; list.forEach(function (e) { x1 = Math.min(x1, e.x); x2 = Math.max(x2, e.x + e.w); });
    if (x1 < p.sl - 0.5 || x2 > pg.w - p.sr + 0.5) {
      if (Date.now() - _clampWarnAt > 5000) { _clampWarnAt = Date.now(); AW.toast('좌우 인쇄 불가 영역(' + p.sl + 'mm)에 가까워졌습니다. 잊릴 수 있으니 안쪽으로 옵기는 것을 권장합니다.', 'warn'); }
    }
  };

  /* ───────────────────────── 편집기 상단 명패 도구줄 ───────────────────────── */
  P.onRender = function (root, tpl) {
    if (!root) return;
    var bar = $('.pl-bar', root), on = P.is(tpl);
    var dbtn = $('[data-a="roster"]', document); if (dbtn) dbtn.classList.toggle('hide', !on);
    if (!on) { if (bar) bar.remove(); P.updateWarnPanel([], null); return; }

    if (!bar) {
      bar = document.createElement('div'); bar.className = 'pl-bar';
      var B = function (a, ic, t, tip) { return '<button class="btn btn-secondary btn-sm" data-pl="' + a + '" title="' + esc(tip) + '">' + AW.ic(ic, 15) + ' ' + t + '</button>'; };
      bar.innerHTML = '<b class="pl-t">명패</b>' + B('pl-logo', 'image', '로고 불러오기', '파일에서 로고를 불러옵니다. Ctrl+V 로 복사한 이미지를 붙여 넣어도 됩니다.') + B('pl-line', 'line', '빨간 중간선', '빨간 구분선을 3칸에 넣습니다.') +
        B('pl-center', 'gCV', '3칸 가운데 맞춤', '3칸의 개체 묶음을 세로·가로 가운데로 맞춤니다.') + B('pl-justify', 'alC', '균등 정렬', '선택한 글상자를 균등 분배(한 줄도 좌우 폭을 꽉 채움)로 바꾸거나 되돌립니다.') +
        B('pl-sp', 'cols', '이름 자간 규칙', '이름 글자 수별로 글자 사이를 자동으로 넓힙니다(짧은 이름 보정). 개인별 값은 직원 명부의 자간 열.') + B('pl-cfg', 'cols', '접는 선·여백 설정', '접는 선 위치, 좌우 인쇄 불가 여백, 반전 복제 등을 실물 출력과 대조하며 조정합니다.') + B('pl-font', 'text', '내 글꼴 올리기', '컴퓨터에 있는 서체를 서버에 등록합니다. 등록된 글꼴은 다른 단말기에서도 「내 글꼴」 목록에 표시됩니다.') + B('pl-new', 'plus', '새 명패 양식', '아세아 / 외부 기관 명패 양식을 새 탭으로 만듭니다.') +
        '<input type="file" class="hide" id="pl-file" accept="image/*"><span class="pl-hint muted">③칸에 입력하면 ②칸에 180° 반전되어 자동 반영됩니다 · 글자 크기는 워드잘: 글상자를 더블클릭 → 줄일 글자를 드래그 → 위 글자 크기 칸에 입력(±도 가능). 길면 한 줄에 맞게 자동 줄임.</span>';
      root.insertBefore(bar, root.firstChild);
      bar.addEventListener('click', function (e) { var b = e.target.closest('[data-pl]'); if (b) AW.Editor.act(b.dataset.pl); });
      $('#pl-file', bar).onchange = function (e) { var f = e.target.files[0]; e.target.value = ''; if (f) AW.Editor.addImageFile(f, null, false); };
    }
  };
  // 로고 이미지를 자리 표시(ph)나 기본 로고 영역에 맞춰 배치
  P.placeLogo = function (tpl, el) {
    var p = cfg(tpl), W = tpl.page.w, ph = tpl.elems.filter(function (e) { return e.ph && e.t === 'rect'; })[0];
    if (!ph && tpl.elems.some(function (e) { return e.t === 'img' && front(e, p); })) return;
    var b = ph ? { x: ph.x, y: ph.y, w: ph.w, h: ph.h } : { x: 30, y: p.f[1] + 5.5, w: W - 60, h: 35 }, r = el.w / el.h, w = b.w, h = w / r;
    if (h > b.h) { h = b.h; w = h * r; }
    el.w = AW.round(w, 1); el.h = AW.round(h, 1); el.x = AW.round(b.x + (b.w - el.w) / 2, 1); el.y = AW.round(b.y + (b.h - el.h) / 2, 1);
    tpl.elems = tpl.elems.filter(function (e) { return !e.ph; });
  };

  /* ───────────────────────── 동작 (편집기 act 에서 호출) ───────────────────────── */
  P.act = function (a, api) {
    var t = S.tpl, E = AW.Editor;
    if (a === 'pl-new') return P.newDialog();
    if (a === 'pl-roster') return P.rosterDialog();
    if (a === 'pl-font') return AW.Output.fontDialog();
    if (!P.is(t)) return AW.toast('명패 양식에서만 사용할 수 있습니다. 「새 명패 양식」으로 만들어 주십시오.');
    var p = cfg(t);
    if (a === 'pl-logo') return $('#pl-file').click();
    if (a === 'pl-cfg') return cfgDialog(api);
    if (a === 'pl-sp') return spDialog(api);
    if (a === 'pl-line') {
      var W = t.page.w, l = AW.elem('line', { x: 24, y: AW.round(p.f[1] + 44, 2), w: W - 48, h: 0, stroke: '#FF0000', sw: 0.7, rl: true });
      t.elems.push(l); E.refreshElems(); E.setSel([l.id]); return api.changed('elems', false, '빨간 중간선 삽입');
    }
    if (a === 'pl-center') {
      var L = t.elems.filter(function (e) { return front(e, p) && !e.hide && !e.noprint; }); if (!L.length) return AW.toast('3칸에 개체가 없습니다.');
      var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; L.forEach(function (e) { x1 = Math.min(x1, e.x); x2 = Math.max(x2, e.x + e.w); y1 = Math.min(y1, e.y); y2 = Math.max(y2, e.y + e.h); });
      var dx = (t.page.w - (x1 + x2)) / 2, dy = (p.f[1] + p.f[2]) / 2 - (y1 + y2) / 2;
      L.forEach(function (e) { e.x = AW.round(e.x + dx, 2); e.y = AW.round(e.y + dy, 2); });
      E.refreshElems(); return api.changed('elems', false, '3칸 가운데 맞춤');
    }
    if (a === 'pl-justify') {
      var tx = api.sel().filter(function (e) { return e.t === 'text' && !e.lock; }); if (!tx.length) return AW.toast('균등 정렬할 글상자를 먼저 선택해 주십시오.');
      var on = !tx.every(function (e) { return e.align === 'dist'; }); tx.forEach(function (e) { e.align = on ? 'dist' : 'center'; e.fit = on ? false : e.fit; });
      E.refreshElems(); return api.changed('elems', false, on ? '균등 정렬' : '가운데 정렬');
    }
  };
  function cfgDialog(api) {
    var p = cfg(S.tpl), H = S.tpl.page.h, N = function (id, v, st) { return '<input class="in num" id="' + id + '" type="number" step="' + (st || 0.05) + '" value="' + v + '">'; };
    AW.modal({
      title: '접는 선 · 인쇄 여백 설정', body:
        '<p class="muted" style="margin-top:0">기본은 A4 세로를 가로선 3개로 4등분(칸 74.25mm)한 값입니다. 실물을 출력해 접어 보고 어긋나면 값을 조금씩 바쿐 대조해 주십시오.</p>' +
        '<div class="grid2"><div><label class="f">접는 선 1 (①|② 경계) mm</label>' + N('pc-f0', p.f[0]) + '</div><div><label class="f">접는 선 2 (②|③ 경계 · 반전 기준) mm</label>' + N('pc-f1', p.f[1]) + '</div>' +
        '<div><label class="f">접는 선 3 (③|④ 경계) mm</label>' + N('pc-f2', p.f[2]) + '</div><div><label class="f">&nbsp;</label><button class="btn btn-ghost btn-sm" id="pc-eq">4등분 기본값으로</button></div>' +
        '<div><label class="f">왼쪽 인쇄 불가 여백 mm</label>' + N('pc-sl', p.sl, 0.1) + '</div><div><label class="f">오른쪽 인쇄 불가 여백 mm</label>' + N('pc-sr', p.sr, 0.1) + '</div></div>' +
        '<div class="radios" style="margin-top:10px;flex-direction:column;align-items:flex-start;gap:6px">' +
        '<label><input type="checkbox" id="pc-m"' + (p.mirror !== false ? ' checked' : '') + '> ③칸 입력을 ②칸에 180° 반전하여 자동 반영</label>' +
        '<label><input type="checkbox" id="pc-g"' + (p.guide !== false ? ' checked' : '') + '> 편집 화면에 접는 선·인쇄 불가 여백 표시</label>' +
        '<label><input type="checkbox" id="pc-c"' + (p.clamp !== false ? ' checked' : '') + '> 개체를 끌 때 좌우 인쇄 불가 여백 밖으로 나가지 않게 제한</label>' +
        '<label><input type="checkbox" id="pc-t"' + (p.tick ? ' checked' : '') + '> 미리보기·인쇄에 접는 위치 작은 눈금 표시(실물과 대조용)</label></div>' +
        '<p class="muted" style="margin-bottom:0">출력 위치 자체의 미세 보정(프린터 오차)는 인쇄 창의 가로·세로 보정값을 사용합니다.</p>',
      actions: [{ label: '취소', cls: 'btn-ghost' }, {
        label: '적용', cls: 'btn-primary', onClick: function (c) {
          var f = [0, 1, 2].map(function (i) { return parseFloat($('#pc-f' + i).value); }), sl = parseFloat($('#pc-sl').value), sr = parseFloat($('#pc-sr').value);
          if (f.some(isNaN) || !(f[0] > 0 && f[0] < f[1] && f[1] < f[2] && f[2] < H)) return AW.toast('접는 선은 위에서 아래 순서로, 용지 안에 있어야 합니다.', 'error');
          if (isNaN(sl) || isNaN(sr) || sl < 0 || sr < 0 || sl + sr > 60) return AW.toast('여백 값을 확인해 주십시오.', 'error');
          p.f = f.map(function (v) { return AW.round(v, 2); }); p.sl = sl; p.sr = sr; p.mirror = $('#pc-m').checked; p.guide = $('#pc-g').checked; p.clamp = $('#pc-c').checked; p.tick = $('#pc-t').checked;
          c(); AW.Editor.render(); api.changed('page'); AW.Preview && AW.Preview.render();
        }
      }],
      onOpen: function (el) { $('#pc-eq', el).onclick = function () { [0, 1, 2].forEach(function (i) { $('#pc-f' + i, el).value = AW.round(H / 4 * (i + 1), 2); }); }; }
    });
  }

  /* ───────────────────────── 양식 만들기 ───────────────────────── */
  function logoData() {
    if (P._logo) return Promise.resolve(P._logo);
    return fetch('award-plate-logo.png').then(function (r) { if (!r.ok) throw new Error('로고 파일을 찾지 못했습니다.'); return r.blob(); }).then(function (b) { return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(P._logo = fr.result); }; fr.onerror = rej; fr.readAsDataURL(b); }); });
  }
  function build(kind, logo) {
    var t = AW.newTpl('명패 — ' + KIND[kind]), p = Object.assign({}, DEF, { kind: kind, f: DEF.f.slice(), sp: { c2: 14, c3: 6, c4: 0 } }), y0 = p.f[1], W = 210, ex;
    t.page = { w: W, h: 297, paper: 'A4', orient: 'P', plate: p };
    var ph = function (x, y, w, h, msg) {
      t.elems.push(AW.elem('rect', { x: x, y: y, w: w, h: h, fill: '#EEF6FC', stroke: '#7AA7C7', sw: 0.3, noprint: true, ph: true }));
      t.elems.push(AW.elem('text', { text: msg, x: x, y: y, w: w, h: h, size: 10, color: '#5F6368', font: 'Noto Sans KR', noprint: true, ph: true }));
    };
    if (kind === 'asea') {
      t.elems.push(AW.elem('img', { src: logo, x: 30, y: AW.round(y0 + 7.5, 2), w: 150, h: 29, nat: { w: 150, h: 29 }, px: { w: 1400, h: 271 } }));
      ex = { '소속': '스마트안전진단계열', '직책': '장학생', '이름': '정장환' };
    } else if (kind === 'ext1') {
      ph(30, AW.round(y0 + 5.5, 2), 150, 34, '여기에 기관 로고(타이틀 포함)\nCtrl+V 로 붙여 넣거나 「로고 불러오기」');
      ex = { '소속': '○○부', '직책': '과장', '이름': '홍길동' };
    } else {
      ph(30, AW.round(y0 + 7, 2), 30, 30, '로고\nCtrl+V');
      t.elems.push(AW.elem('text', { text: '{{기관명}}', x: 64, y: AW.round(y0 + 7, 2), w: 116, h: 30, font: 'Noto Sans KR', size: 26, bold: true, align: 'left', valign: 'middle', lh: 1.2, fit: true }));
      ex = { '기관명': '○○기관', '소속': '○○부', '직책': '과장', '이름': '홍길동' };
    }
    t.elems.push(AW.elem('line', { x: 24, y: AW.round(y0 + 44, 2), w: W - 48, h: 0, stroke: '#FF0000', sw: 0.7, rl: true }));
    t.elems.push(AW.elem('text', { text: '{{소속}} {{직악}} {{이름}}', x: 12, y: AW.round(y0 + 51.5, 2), w: W - 24, h: 20, font: 'Black Han Sans', size: 36, color: '#111111', align: 'center', valign: 'middle', lh: 1.2, ls: 0, fit: true }));
    t.fields = AW.fieldNames(t).map(function (n) { var g = AW.guessHint(n); return { name: n, hint: g.hint, example: ex[n] || g.example, max: 0, req: n !== '소속' && n !== '직악' }; });
    t.rows = [ex];
    return t;
  }
  P.build = build;
  P.newDialog = function () {
    var kinds = ['asea', 'ext1', 'ext2'], desc = {
      asea: '업로드하신 아세아 로고를 3칸 기본 위치에 배치합니다. 이름·직책(소속)만 바쿐 출력하며, 직원 명부에서 골라 일괄 출력할 수 있습니다.',
      ext1: '타이틀이 함께 들어 있는 기관 로고 한 장을 불러오는 방식입니다. Ctrl+V(클립보드) 또는 파일로 불러옵니다.',
      ext2: '로고(심볼)만 불러오고 기관명은 입력 항목({{기관명}})으로 적는 방식입니다.'
    };
    AW.modal({
      title: '새 명패 양식 만들기',
      body: '<p class="muted" style="margin-top:0">A4 세로를 가로선 3개로 4등분합니다. ③칸에 입력하면 ②칸에 180° 반전 반영되고, ①·④칸은 비워 됩니다. 만들어 내는 먼저 입력하여도 자동 저장되도 다음부터는 양식 목록에서 불러와 이름·직첩만 바꾸면 됩니다.</p>' +
        kinds.map(function (k, i) { return '<label class="pl-opt"><input type="radio" name="pl-k" value="' + k + '"' + (i ? '' : ' checked') + '><span><b>' + KIND[k] + '</b><br><span class="muted">' + desc[k] + '</span></span></label>'; }).join(''),
      actions: [{ label: '취소', cls: 'btn-ghost' }, {
        label: '새 탭에서 만들기', cls: 'btn-primary', onClick: function (c) {
          var k = $('input[name="pl-k"]:checked').value; c();
          (k === 'asea' ? logoData() : Promise.resolve(null)).then(function (lg) { return AW.App.adopt(build(k, lg)); }).then(function () { AW.toast('명패 양식을 만들었습니다. 로고와 글자를 확인해 주십시오.', 'ok'); })
            .catch(function (e) { if (e && e.message !== 'tabs') AW.toast('양식을 만들지 못했습니다: ' + (e && e.message || e), 'error'); });
        }
      }]
    });
  };

  /* ───────────────────────── 직원 명부 ───────────────────────── */
  var R = { list: null, sel: {}, q: '', dept: '', saveT: null, state: '' };
  function loadRoster() {
    if (R.list) return Promise.resolve(R.list);
    return AW.pref.get(ROSTER_KEY).then(function (v) { R.list = Array.isArray(v) ? v : AW.lsGet(LS_KEY, []); }).catch(function () { R.list = AW.lsGet(LS_KEY, []); }).then(function () { return R.list; });
  }
  function saveRoster(now) {
    AW.lsSet(LS_KEY, R.list); R.state = '저장 중…'; stat();
    clearTimeout(R.saveT);
    R.saveT = setTimeout(function () { AW.pref.set(ROSTER_KEY, R.list).then(function () { R.state = '서버에 저장됨'; stat(); }).catch(function () { R.state = '서버 저장 실패 — 이 기기에는 저장됨'; stat(); }); }, now ? 0 : 700);
  }
  function stat() { var n = $('#pr-st'); if (n) n.textContent = R.state; }
  var HEAD = ['소속', '직책', '이름', '영문이름', '비고', '자간(pt)'], EXAMPLE = ['항공정비계열', '교수', '홍길동', 'Hong Gildong', '예시 — 지우고 입력', ''];
  function depts() { var s = {}; R.list.forEach(function (r) { if (r.d) s[r.d] = 1; }); return Object.keys(s).sort(); }
  function shown() { var q = R.q.trim().toLowerCase(); return R.list.filter(function (r) { return (!R.dept || r.d === R.dept) && (!q || (r.d + ' ' + r.t + ' ' + r.n + ' ' + r.e + ' ' + r.o).toLowerCase().indexOf(q) >= 0); }); }
  P.rosterDialog = function () {
    loadRoster().then(function () {
      AW.modal({
        title: '직원 명부 — 클릭해서 선택한 직원만 일괄 출력', wide: true, sticky: true,
        body: '<div class="pl-rt"><input class="in sm" id="pr-q" placeholder="이름·소속 검색" value="' + esc(R.q) + '"><select class="in sm" id="pr-d"></select>' +
          '<button class="btn btn-ghost btn-sm" id="pr-add">' + AW.ic('plus', 15) + ' 직원 추가</button><span class="sp"></span>' +
          '<button class="btn btn-secondary btn-sm" id="pr-tpl">' + AW.ic('download', 15) + ' 엑셀 서식 받기</button>' +
          '<button class="btn btn-secondary btn-sm" id="pr-exp">' + AW.ic('download', 15) + ' 현재 명부 받기</button>' +
          '<button class="btn btn-primary btn-sm" id="pr-up">' + AW.ic('xls', 15) + ' 엑셀로 일괄 올리기</button><input type="file" class="hide" id="pr-file" accept=".xlsx,.xls,.csv"></div>' +
          '<div class="tbl-wrap" style="max-height:50vh"><table class="gt pl-rtb"><thead><tr><th><input type="checkbox" id="pr-all" title="보이는 직원 전체 선택"></th><th>소속</th><th>직책</th><th>이름</th><th>영문이름</th><th>비고</th><th title="비워 두면 규칙표 사용. 입력하면 이 사람만 그 값(pt)을 씁니다">자간(pt)</th><th></th></tr></thead><tbody id="pr-b"></tbody></table></div>' +
          '<div class="pl-rf"><span id="pr-n"></span><span class="muted" id="pr-st"></span></div>',
        actions: [{ label: '닫기', cls: 'btn-ghost' }, { label: '선택 해제', cls: 'btn-ghost', onClick: function () { R.sel = {}; draw(); } },
          { label: '선택한 직원을 데이터에 추가', cls: 'btn-secondary', onClick: function (c) { apply(false, c); } },
          { label: '선택한 직원으로 데이터 바꾸기', cls: 'btn-primary', onClick: function (c) { apply(true, c); } }],
        onOpen: function (el) { wire(el); draw(); }
      });
    });
  };
  function wire(el) {
    $('#pr-q', el).oninput = function (e) { R.q = e.target.value; drawBody(); };
    $('#pr-d', el).onchange = function (e) { R.dept = e.target.value; drawBody(); };
    $('#pr-add', el).onclick = function () { var r = { id: AW.uid('r'), d: R.dept || '', t: '', n: '', e: '', o: '' }; R.list.unshift(r); R.sel[r.id] = 1; R.q = ''; $('#pr-q', el).value = ''; saveRoster(); draw(); var i = $('#pr-b tr:first-child input[data-k="n"]', el); if (i) i.focus(); };
    $('#pr-tpl', el).onclick = function () { xlsxOut([EXAMPLE], '명패_직원명부_서식.xlsx'); };
    $('#pr-exp', el).onclick = function () { if (!R.list.length) return AW.toast('등록된 직원이 없습니다.'); xlsxOut(R.list.map(function (r) { return [r.d, r.t, r.n, r.e, r.o, r.sp == null ? '' : r.sp]; }), '명패_직원명부.xlsx', true); };
    $('#pr-up', el).onclick = function () { $('#pr-file', el).click(); };
    $('#pr-file', el).onchange = function (e) { var f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); };
    $('#pr-all', el).onchange = function (e) { shown().forEach(function (r) { if (e.target.checked) R.sel[r.id] = 1; else delete R.sel[r.id]; }); drawBody(); };
    var tb = $('#pr-b', el);
    tb.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]'); if (del) { var id = del.dataset.del; R.list = R.list.filter(function (r) { return r.id !== id; }); delete R.sel[id]; saveRoster(); return draw(); }
      if (e.target.closest('input')) return;
      var tr = e.target.closest('tr[data-id]'); if (!tr) return; var i = tr.dataset.id; if (R.sel[i]) delete R.sel[i]; else R.sel[i] = 1; drawBody(true);
    });
    tb.addEventListener('input', function (e) { var inp = e.target.closest('input[data-k]'); if (!inp) return; var r = R.list.filter(function (x) { return x.id === inp.closest('tr').dataset.id; })[0]; if (r) { r[inp.dataset.k] = inp.value; saveRoster(); } });
    tb.addEventListener('keydown', function (e) { e.stopPropagation(); });
  }
  function draw() { var d = $('#pr-d'); if (d) { d.innerHTML = '<option value="">전체 소속</option>' + depts().map(function (x) { return '<option' + (x === R.dept ? ' selected' : '') + ' value="' + esc(x) + '">' + esc(x) + '</option>'; }).join(''); } drawBody(); stat(); }
  function drawBody(keepFocus) {
    var tb = $('#pr-b'); if (!tb) return; var list = shown(), cap = 400;
    tb.innerHTML = list.slice(0, cap).map(function (r) {
      var I = function (k) { return '<td><input class="in sm" type="text" data-k="' + k + '" value="' + esc(r[k]) + '"></td>'; };
      return '<tr data-id="' + r.id + '" class="' + (R.sel[r.id] ? 'pl-on' : '') + '"><td><input type="checkbox" tabindex="-1"' + (R.sel[r.id] ? ' checked' : '') + '></td>' + I('d') + I('t') + I('n') + I('e') + I('o') + '<td><input class="in sm num" type="number" min="0" max="80" step="0.5" data-k="sp" value="' + esc(r.sp == null ? '' : r.sp) + '" style="min-width:64px;width:64px"></td><td><button class="icon-btn" data-del="' + r.id + '" title="삭제" aria-label="삭제">' + AW.ic('trash', 15) + '</button></td></tr>';
    }).join('') || '<tr><td colspan="8" class="muted" style="padding:18px;text-align:center">등록된 직원이 없습니다. 「엑셀 서식 받기」로 서식을 받아 작성한 뒤 올리거나, 「직원 추가」로 직접 입력해 주십시오.</td></tr>';
    var all = $('#pr-all'); if (all) all.checked = list.length > 0 && list.every(function (r) { return R.sel[r.id]; });
    var n = Object.keys(R.sel).filter(function (i) { return R.list.some(function (r) { return r.id === i; }); }).length, ln = $('#pr-n');
    if (ln) ln.innerHTML = '전체 ' + R.list.length + '명 · 보이는 ' + list.length + '명' + (list.length > cap ? '(앞 ' + cap + '명만 표시 — 검색으로 좌혀 주십시오)' : '') + ' · <b>선택 ' + n + '명</b>';
  }
  function selected() { return R.list.filter(function (r) { return R.sel[r.id] && (r.n || '').trim(); }); }
  function toRows(list, t) {
    var map = { '소속': 'd', '학과': 'd', '부서': 'd', '직책': 't', '직위': 't', '직급': 't', '이름': 'n', '성명': 'n', '영문이름': 'e', '영문': 'e', '비고': 'o' };
    return list.map(function (r) { var o = {}; t.fields.forEach(function (f) { var k = map[String(f.name).replace(/\s/g, '')]; o[f.name] = k ? (r[k] || '') : ''; }); if (r.sp !== undefined && String(r.sp).trim() !== '' && !isNaN(+r.sp)) o._sp = +r.sp; return o; });
  }
  function apply(replace, close) {
    var t = S.tpl, list = selected();
    if (!list.length) return AW.toast('데이터에 넣을 직원을 목록에서 클릭해 선택해 주십시오.', 'error');
    if (!t.fields.length) return AW.toast('양식에 입력 항목({{항목명}})이 없습니다.', 'error');
    var rows = toRows(list, t), go = function () {
      t.rows = replace ? rows : t.rows.concat(rows); S.row = 0; S.sampleOnly = false; S.dirty = true; AW.emit('datachange'); AW.Data.refresh(true);
      close(); AW.toast('직원 ' + rows.length + '명을 데이터 영역에 ' + (replace ? '넣었습니다' : '추가했습니다') + '. 미리보기에서 확인한 뒤 인쇄해 주십시오.', 'ok');
    };
    if (t.rows.length > 1 && replace) AW.confirm('데이터 바꾸기', '현재 입력된 ' + t.rows.length + '행이 선택한 ' + rows.length + '명으로 바됀니다. 계속하시겠습니까?', '바꾸기').then(function (ok) { if (ok) go(); });
    else go();
  }
  function xlsxOut(rows, name, noEx) {
    if (!window.XLSX) return AW.toast('엑셀 모듈을 불러오지 못했습니다.', 'error');
    var wb = XLSX.utils.book_new(), aoa = [HEAD].concat(rows), ws = XLSX.utils.aoa_to_sheet(aoa);
    for (var r = aoa.length; r < 500; r++) for (var c = 0; c < 6; c++) ws[XLSX.utils.encode_cell({ r: r, c: c })] = { t: 's', v: '', z: '@' };
    for (var r2 = 1; r2 < aoa.length; r2++) for (var c2 = 0; c2 < 6; c2++) { var a = XLSX.utils.encode_cell({ r: r2, c: c2 }); if (ws[a]) { ws[a].t = 's'; ws[a].z = '@'; } }
    ws['!ref'] = 'A1:F' + Math.max(500, aoa.length); ws['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 24 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, '직원명부');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['「작성 안내」'], ['1. 「직원명부」 시트 1행(소속·직책·이름·영문이름·비고)은 수정하지 마십시오.'], ['2. 이름은 필수입니다. 나머지 열은 비워 두어도 됩니다.'], ['3. 예시 행(홍길동)은 올릴 때 자동 제외됩니다.'], ['4. 올리면 같은 소속·이름은 내용이 갱신되고, 새 직원은 추가됩니다. 기존 직원은 삭제되지 않습니다.'], ['   「자간(pt)」은 선택입니다. 비워 두면 양식의 이름 자간 규칙(글자 수별)을 쓰고, 숫자를 넣으면 그 사람만 그 값으로 글자 사이를 넓힙니다.'], ['5. 명패 양식의 {{소속}} {{직악}} {{이름}} 항목에 위 열이 연결됩니다. 영문이름은 영문·한영 병기 양식에서 {{영문이름}}으로 사용합니다.']]), '작성안내');
    XLSX.writeFile(wb, name); AW.toast('엑셀 파일을 내려받았습니다.', 'ok');
  }
  function importFile(file) {
    if (!window.XLSX) return AW.toast('엑셀 모듈을 불러오지 못했습니다.', 'error');
    if (file.size > 10 * 1024 * 1024) return AW.toast('파일이 너무 큽니다(10MB 이하).', 'error');
    file.arrayBuffer().then(function (buf) {
      var wb = XLSX.read(buf, { type: 'array' }), nm = wb.SheetNames.filter(function (n) { return n === '직원명부'; })[0] || wb.SheetNames.filter(function (n) { return n !== '작성안내'; })[0];
      if (!nm) throw new Error('읽을 시트가 없습니다.');
      var aoa = XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, defval: '', raw: false, blankrows: false }).filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
      if (aoa.length < 2) throw new Error('데이터가 없는 파일입니다.');
      var h = aoa[0].map(function (x) { return String(x).replace(/\s/g, ''); }), col = function (names) { for (var i = 0; i < h.length; i++) if (names.indexOf(h[i]) >= 0) return i; return -1; };
      var c = { d: col(['소속', '학과', '부서']), t: col(['직책', '직위', '직급']), n: col(['이름', '성명']), e: col(['영문이름', '영문', '영문성명']), o: col(['비고', '메모']), s: col(['자간', '자간(pt)', '자간pt']) };
      if (c.n < 0) throw new Error('「이름」 열을 찾지 못했습니다. 서식의 1행을 수정하지 않았는지 확인해 주십시오.');
      var add = 0, upd = 0, skip = 0, g = function (r, k) { return c[k] < 0 ? '' : String(r[c[k]] == null ? '' : r[c[k]]).trim(); };
      aoa.slice(1).forEach(function (r) {
        var n = g(r, 'n'); if (!n) { skip++; return; }
        if (n === EXAMPLE[2] && g(r, 'd') === EXAMPLE[0]) { skip++; return; }   // 예시 행
        var d = g(r, 'd'), hit = R.list.filter(function (x) { return x.n === n && x.d === d; })[0];
        if (hit) { if (c.t >= 0) hit.t = g(r, 't'); if (c.e >= 0) hit.e = g(r, 'e'); if (c.o >= 0) hit.o = g(r, 'o'); if (c.s >= 0) hit.sp = g(r, 's'); upd++; R.sel[hit.id] = 1; }
        else { var x = { id: AW.uid('r'), d: d, t: g(r, 't'), n: n, e: g(r, 'e'), o: g(r, 'o'), sp: g(r, 's') }; R.list.push(x); R.sel[x.id] = 1; add++; }
      });
      saveRoster(true); draw(); AW.toast('직원 ' + add + '명 추가 · ' + upd + '명 갱신' + (skip ? ' · 제외 ' + skip + '행(빈 이름·예시)' : '') + ' — 올린 직원이 선택되어 있습니다.', 'ok');
      AW.log('plate_roster_import', null, { add: add, upd: upd });
    }).catch(function (e) { AW.toast('엑셀을 읽지 못했습니다: ' + (e.message || e), 'error'); });
  }
})();
