'use strict';
/**
 * award-ai.js — AI 영문 번역 · 연결 점검 (AW.AI)
 *  · AI 설정은 index.html 「AI 제공자 설정」(config.js: getClaudeConfig/claudeFetch)을 그대로 사용
 *  · 연결 점검: 로그인 직후 자동 + 15분마다 + 번역 직전(최근 성공이 10분 이내면 생략) + 헤더 칩 클릭(수동)
 *  · 번역: 문서 전체 맥락(모든 글상자·용어집)을 함께 보내 공식 문서 수준으로 번역, 추천안 제시, 토큰({{항목}}) 보존 검증
 */
(function () {
  var AW = window.AW, S = AW.S, X = AW.AI = { st: 'idle', msg: '', at: 0, ms: 0 };
  var MODELS = ['claude-sonnet-5-5', 'claude-haiku-4-5-20251001'];
  var GLOSS0 = '학교장=Principal\n학장=President\n이사장=Chairman of the Board\n교수=Professor\n학과장=Department Head\n담임=Homeroom Instructor\n항공정비과=Department of Aircraft Maintenance\n우수상=Excellence Award\n개근상=Perfect Attendance Award\n성적우수상=Academic Excellence Award';
  var subs = [];
  X.onStatus = function (fn) { subs.push(fn); fn(X); };
  function set(st, msg) { X.st = st; X.msg = msg || ''; subs.forEach(function (f) { try { f(X); } catch (e) {} }); }

  /* ───────────── 호출 ───────────── */
  function raw(system, content, model, max) {
    return Promise.resolve(window.loadAIProvidersFromCloud ? window.loadAIProvidersFromCloud().catch(function () {}) : null).then(function () {
      if (!window.claudeFetch || !window.getClaudeConfig) throw new Error('AI 설정 모듈(config.js)을 불러오지 못했습니다.');
      var cc = window.getClaudeConfig();
      if (!cc.apiKey) throw new Error('AI 연결 설정이 없습니다. index.html 의 「AI 제공자 설정」을 먼저 저장해 주십시오.');
      var h = { 'Content-Type': 'application/json', 'x-api-key': cc.apiKey, 'anthropic-version': '2023-06-01' }; if (cc.isOfficial) h['anthropic-dangerous-direct-browser-access'] = 'true';
      return window.claudeFetch(cc.endpoint, { method: 'POST', headers: h, body: JSON.stringify({ model: model, max_tokens: max, system: system, messages: [{ role: 'user', content: content }] }) });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) {
        if (d.error || !res.ok) { var e = new Error((d.error && d.error.message) || ('AI 응답 오류 (HTTP ' + res.status + ')')); e.status = res.status; throw e; }
        var t = window.claudeExtractText ? window.claudeExtractText(d) : (d.content && d.content[0] && d.content[0].text);
        if (!t) throw new Error('AI 응답이 비어 있습니다.'); return t;
      });
    });
  }
  X.call = function (system, content, max) {
    var i = 0;
    function go() { return raw(system, content, MODELS[i], max || 6000).catch(function (e) { if (i < MODELS.length - 1 && (e.status === 404 || /model/i.test(e.message))) { i++; return go(); } throw e; }); }
    return go();
  };
  X.json = function (system, content, max) {
    return X.call(system, content, max).then(function (t) {
      var s = String(t).trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim(), a = s.indexOf('{'); if (a > 0) s = s.slice(a);
      try { return JSON.parse(s); } catch (e) { var b = s.lastIndexOf('}'); if (b > 0) { try { return JSON.parse(s.slice(0, b + 1)); } catch (e2) {} } throw new Error('AI 응답을 해석하지 못했습니다. 다시 시도해 주십시오.'); }
    });
  };

  /* ───────────── 연결 점검 ───────────── */
  X.test = function (quiet) {
    set('busy', '점검 중…'); var t0 = Date.now();
    return raw('Reply with the single word OK.', 'ping', MODELS[0], 16).catch(function (e) {
      if (e.status === 404 || /model/i.test(e.message)) return raw('Reply with the single word OK.', 'ping', MODELS[1], 16); throw e;
    }).then(function () { X.at = Date.now(); X.ms = X.at - t0; set('ok', '연결 정상 · 응답 ' + (X.ms / 1000).toFixed(1) + '초'); if (!quiet) AW.toast('AI 연결 정상 (' + (X.ms / 1000).toFixed(1) + '초)', 'ok'); return true; })
      .catch(function (e) { set('bad', e.message || '연결 실패'); if (!quiet) AW.toast('AI 연결 실패: ' + (e.message || ''), 'error'); return false; });
  };
  X.ensure = function () { return (X.st === 'ok' && Date.now() - X.at < 600000) ? Promise.resolve(true) : X.test(true); };
  X.auto = function () { setTimeout(function () { X.test(true); }, 900); if (!X._iv) X._iv = setInterval(function () { if (document.visibilityState === 'visible' && S.token) X.test(true); }, 900000); };

  /* ───────────── 용어집 ───────────── */
  X.gloss = function () { return AW.lsGet('award_gloss', GLOSS0); };
  X.glossDialog = function () {
    AW.modal({ title: '번역 용어집 (직급·학과·상 이름)', body: '<p class="muted" style="margin-top:0">한 줄에 하나씩 <b>한글=영문</b> 으로 적습니다. 번역할 때 이 표기를 우선 사용합니다. 학교·기관의 공식 영문명도 여기에 등록하십시오.</p><textarea class="in" id="gl-t" rows="12" style="font-family:inherit">' + AW.esc(X.gloss()) + '</textarea>',
      actions: [{ label: '기본값', cls: 'btn-ghost', onClick: function () { AW.$('#gl-t').value = GLOSS0; } }, { label: '저장', cls: 'btn-primary', onClick: function (c) { AW.lsSet('award_gloss', AW.$('#gl-t').value.trim()); c(); AW.toast('용어집을 저장했습니다.', 'ok'); } }] });
  };

  /* ───────────── 번역 공통 ───────────── */
  var HAN = /[가-힣]/;
  function area(e) { var p = S.tpl.page, cy = (e.y + e.h / 2) / p.h; return cy < 0.33 ? '상단' : cy < 0.66 ? '중단' : '하단'; }
  function docCtx(exceptId) {
    return S.tpl.elems.filter(function (e) { return e.t === 'text' && e.text && e.text.trim(); }).slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; })
      .map(function (e) { return '[' + area(e) + (e.id === exceptId ? '·번역 대상' : '') + '] ' + String(e.text).replace(/\n/g, ' ⏎ '); }).join('\n');
  }
  function sysTr() {
    return '당신은 한국 직업전문학교(항공정비 계열)의 공식 문서를 영어로 옮기는 전문 번역가입니다. 상장·수료증·증명서 등 격식 있는 공문서의 영어 관행(예: "This is to certify that…", "is hereby awarded…", 직함은 Title Case)을 따르는 기술·행정 번역 수준으로 번역하며, 직역하지 않고 영어권 독자에게 자연스러운 표현을 씁니다.\n' +
      '규칙: 1) {{항목명}} 형태의 자리표시자는 번역·변형하지 말고 글자 그대로 같은 위치에 둡니다. 2) 줄바꿈 수를 유지하고, 정해진 상자 크기에 들어가도록 원문보다 길어지지 않게 간결하게 씁니다. 3) 용어집의 표기를 반드시 우선합니다. 4) 직급·직책·학과·상 이름은 영어권에서 통용되는 명칭을 고르고, 불확실하면 note 에 한국어로 이유를 씁니다. 5) 문서 전체 맥락(제공된 모든 문구)을 보고 문체·용어를 일관되게 합니다. 6) 추정이 필요한 고유명사(기관명 등)는 임의로 만들지 말고 한글을 로마자로 쓰고 note 에 확인 필요라고 적습니다.\n' +
      '출력은 JSON 객체 하나만(마크다운·설명 금지).';
  }
  function tokOk(ko, en) { var a = AW.tokensOf(ko), b = AW.tokensOf(en); return a.every(function (t) { return b.indexOf(t) >= 0; }); }

  /* ───────────── 선택 문구 / 상자 번역 ───────────── */
  // o: {text, elemId, apply(newText)}
  X.translateText = function (o) {
    var run = function () {
      var m = AW.modal({ title: '영문으로 바꾸기', wide: true, sticky: true, body: '<div id="tt-b"><div class="loading">AI가 문서 전체 맥락을 읽고 번역하는 중입니다…</div></div>', actions: [{ label: '닫기', cls: 'btn-ghost' }] });
      var prompt = '용어집:\n' + X.gloss() + '\n\n문서 전체 문구(읽는 순서):\n' + docCtx(o.elemId) + '\n\n번역할 원문:\n' + o.text +
        '\n\n다음 JSON 으로 답하십시오: {"best":"가장 권장하는 번역","alts":[{"en":"대안 번역","why":"권장안과 뉘앙스 차이(한국어 한 줄)"},{"en":"...","why":"..."}],"note":"용어·직급 선택 이유 또는 확인 필요 사항(한국어, 없으면 빈 문자열)"}';
      X.ensure().then(function (ok) { if (!ok) throw new Error(X.msg || 'AI 연결 실패'); return X.json(sysTr(), prompt, 2500); }).then(function (r) {
        var b = AW.$('#tt-b', m.el); if (!b) return; var best = String(r.best || ''), alts = (r.alts || []).slice(0, 3);
        b.innerHTML = '<label class="f">원문</label><div class="box-ro">' + AW.esc(o.text) + '</div><label class="f">추천 번역 (수정 가능)</label><textarea class="in" id="tt-en" rows="3">' + AW.esc(best) + '</textarea>' +
          (tokOk(o.text, best) ? '' : '<div class="alert warn" style="margin-top:6px">원문의 {{항목}} 표기가 번역문에서 바뀌었습니다. 확인해 주십시오.</div>') +
          (alts.length ? '<label class="f">다른 제안</label><div class="radios">' + alts.map(function (a, i) { return '<label><input type="radio" name="tt-alt" data-i="' + i + '"> <span><b>' + AW.esc(a.en) + '</b><br><span class="muted">' + AW.esc(a.why || '') + '</span></span></label>'; }).join('') + '</div>' : '') +
          (r.note ? '<p class="muted" style="margin:10px 0 0">참고: ' + AW.esc(r.note) + '</p>' : '');
        AW.$$('input[name="tt-alt"]', b).forEach(function (x) { x.onchange = function () { AW.$('#tt-en').value = alts[+x.dataset.i].en; }; });
        var f = AW.$('.md-f', m.el); f.innerHTML = '';
        [['용어집', 'btn-ghost', function () { X.glossDialog(); }], ['다시 번역', 'btn-ghost', function () { m.close(); X.translateText(o); }], ['취소', 'btn-ghost', function () { m.close(); }], ['적용', 'btn-primary', function () { var v = AW.$('#tt-en').value; if (tokOk(o.text, v)) { m.close(); o.apply(v); } else AW.confirm('항목 표기 확인', '원문의 {{항목}} 표기가 번역문에서 바뀌어 데이터가 들어가지 않습니다. 그래도 적용하시겠습니까?', '적용').then(function (ok) { if (ok) { m.close(); o.apply(v); } }); }]].forEach(function (x) { var bt = document.createElement('button'); bt.className = 'btn ' + x[1]; bt.textContent = x[0]; bt.onclick = x[2]; f.appendChild(bt); });
      }).catch(function (e) { var b = AW.$('#tt-b', m.el); if (b) b.innerHTML = '<div class="alert warn">' + AW.esc(e.message) + '</div>'; });
    };
    if (!o.text || !HAN.test(o.text)) return AW.toast('번역할 한글 문구가 없습니다.', 'error');
    run();
  };

  /* ───────────── 시안 전체 번역본 ───────────── */
  X.translateDoc = function () {
    var items = S.tpl.elems.filter(function (e) { return e.t === 'text' && HAN.test(e.text || ''); });
    if (!items.length) return AW.toast('번역할 한글 글상자가 없습니다.', 'error');
    var m = AW.modal({ title: '영문 번역 (시안 전체)', wide: true, sticky: true, body: '<div id="td-b"><div class="loading">AI가 시안 전체 맥락을 읽고 번역하는 중입니다…</div></div>', actions: [{ label: '닫기', cls: 'btn-ghost' }] });
    var list = items.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var prompt = '용어집:\n' + X.gloss() + '\n\n문서 전체 문구(읽는 순서):\n' + docCtx(null) + '\n\n번역 대상(id: 원문):\n' + list.map(function (e) { return e.id + ': ' + e.text.replace(/\n/g, ' ⏎ '); }).join('\n') +
      '\n\n모든 대상을 번역해 다음 JSON 으로 답하십시오(⏎ 는 줄바꿈으로 되돌려 쓰십시오): {"items":[{"id":"...","en":"권장 번역","alts":[{"en":"대안","why":"차이(한국어 한 줄)"}],"note":"확인 필요 사항(없으면 빈 문자열)"}],"doc_note":"전체 유의사항(한국어, 없으면 빈 문자열)"}';
    X.ensure().then(function (ok) { if (!ok) throw new Error(X.msg || 'AI 연결 실패'); return X.json(sysTr(), prompt, 8000); }).then(function (r) {
      var by = {}; (r.items || []).forEach(function (x) { by[x.id] = x; });
      var b = AW.$('#td-b', m.el); if (!b) return;
      b.innerHTML = '<p class="muted" style="margin-top:0">원문 ' + list.length + '개를 번역했습니다. 영문은 직접 고칠 수 있고, 「제안」을 누르면 대안으로 바뀝니다.' + (r.doc_note ? '<br>참고: ' + AW.esc(r.doc_note) : '') + '</p>' +
        '<div class="tbl-wrap" style="max-height:44vh"><table class="gt"><thead><tr><th style="width:34%">원문</th><th>영문 (수정 가능)</th></tr></thead><tbody>' + list.map(function (e) {
          var x = by[e.id] || {}, en = x.en || ''; var warn = en && !tokOk(e.text, en);
          return '<tr data-id="' + e.id + '"><td>' + AW.esc(e.text).replace(/\n/g, '<br>') + '</td><td><textarea class="in sm" rows="2" style="width:100%">' + AW.esc(String(en).replace(/ ⏎ /g, '\n')) + '</textarea>' +
            (warn ? '<div class="bad" style="font-size:12px">{{항목}} 표기가 바뀌었습니다. 확인 필요</div>' : '') +
            ((x.alts || []).slice(0, 2).map(function (a, i) { return '<div style="font-size:12px;margin-top:3px"><button class="lnk" data-alt="' + AW.esc(a.en) + '">제안 ' + (i + 1) + '</button> ' + AW.esc(a.en) + ' <span class="muted">— ' + AW.esc(a.why || '') + '</span></div>'; }).join('')) +
            (x.note ? '<div class="muted" style="font-size:12px;margin-top:3px">참고: ' + AW.esc(x.note) + '</div>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="radios" style="margin-top:10px"><label><input type="checkbox" id="td-data"' + (S.tpl.rows.length ? ' checked' : ' disabled') + '> 입력 데이터의 영문 값도 만들기 (성명은 여권 표기, 소속·상명은 번역) — ' + S.tpl.rows.length + '행</label></div>' +
        '<p class="muted" style="margin:8px 0 0">영문은 같은 양식의 각 글상자에 「영문」 칸으로 저장됩니다. 위쪽 「한글 / 영문 / 한영」 버튼과 출력 설정으로 한글만·영문만·병기를 고를 수 있습니다.' + (S.tpl.bg ? ' 배경 이미지에 인쇄된 한글은 번역되지 않습니다.' : '') + '</p>';
      AW.$$('[data-alt]', b).forEach(function (x) { x.onclick = function () { x.closest('td').querySelector('textarea').value = x.dataset.alt; }; });
      var f = AW.$('.md-f', m.el); f.innerHTML = '';
      [['용어집', 'btn-ghost', function () { X.glossDialog(); }], ['취소', 'btn-ghost', function () { m.close(); }], ['영문 저장', 'btn-primary', function (bt) { apply(m, list, bt); }]].forEach(function (x) { var bt = document.createElement('button'); bt.className = 'btn ' + x[1]; bt.textContent = x[0]; bt.onclick = function () { x[2](bt); }; f.appendChild(bt); });
    }).catch(function (e) { var b = AW.$('#td-b', m.el); if (b) b.innerHTML = '<div class="alert warn">' + AW.esc(e.message) + '</div>'; });
  };

  function apply(m, list, btn) {
    var en = {}; AW.$$('#td-b tbody tr', m.el).forEach(function (tr) { en[tr.dataset.id] = tr.querySelector('textarea').value; });
    var bad = 0; list.forEach(function (e) { if (en[e.id] && en[e.id].trim() && !tokOk(e.text, en[e.id])) { delete en[e.id]; bad++; } });   // {{항목}}이 깨진 번역은 저장하지 않음
    var withData = AW.$('#td-data', m.el).checked; btn.disabled = true; btn.textContent = '데이터 변환 중…';
    var pr = withData ? translateRows(S.tpl.rows, function (n, t) { btn.textContent = '데이터 변환 중 ' + n + '/' + t; }) : Promise.resolve({ rows: S.tpl.rows, fail: 0 });
    pr.then(function (r) {
      S.tpl.elems.forEach(function (e) { if (en[e.id] != null && en[e.id].trim()) e.en = en[e.id]; });
      S.tpl.rows = r.rows; S.tpl.page.lang = 'both'; m.close();
      AW.Editor.render(); AW.Data.refresh(true); S.dirty = true; AW.emit('tplchange', 'elems'); AW.emit('datachange'); AW.emit('rowchange');
      AW.toast('영문을 저장했습니다. 한영 병기 보기로 전환했습니다.' + (bad ? ' ({{항목}} 표기가 바뀐 ' + bad + '개는 제외)' : '') + (r.fail ? ' (데이터 ' + r.fail + '건은 영문 값 없음)' : ''), 'ok'); AW.log('ai_translate', S.tpl.id, { items: list.length, data: withData });
    }).catch(function (e) { btn.disabled = false; btn.textContent = '영문 저장'; AW.toast('데이터 변환 실패: ' + e.message, 'error'); });
  }

  function isName(n) { return /성명|이름|수상자|수료자|name/i.test(n); }
  // 여권 표기: 전부 대문자(HONG GILDONG)로 오면 첫 글자만 대문자(Hong Gildong)로 바꿈
  function fixName(t) { t = String(t).trim(); return (/[A-Z]/.test(t) && t === t.toUpperCase()) ? t.toLowerCase().replace(/(^|[\s-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }) : t; }
  // 항목별 고유값을 모아 한 번에 번역 (최대 400개, 60개씩)
  function translateRows(rows, prog) {
    var fields = S.tpl.fields, jobs = [], done = 0, fail = 0, map = {};
    fields.forEach(function (f) {
      var u = []; rows.forEach(function (r) { var v = r[f.name]; if (v && HAN.test(v) && u.indexOf(v) < 0) u.push(v); });
      for (var i = 0; i < Math.min(u.length, 400); i += 60) jobs.push({ f: f, vals: u.slice(i, i + 60) });
    });
    var sys = '한국 직업전문학교 상장 발급용 데이터 값을 영어로 변환합니다. 항목 성격에 따라: 사람 이름(성명)은 여권 표기 방식으로 "성 이름" 순서, 이름의 음절은 붙여 쓰고 첫 글자만 대문자인 "Hong Gildong" 형태로(전부 대문자로 쓰지 않음), 소속·학과·과정·상 이름·직위는 영어권 통용 명칭으로 번역, 본문 문장은 공문서체로 번역합니다. 용어집 우선. 출력은 JSON 객체 하나({"values":{"원문":"영문"}})만, 모든 원문을 키로 사용.';
    var seq = Promise.resolve();
    jobs.forEach(function (j) {
      seq = seq.then(function () {
        return X.json(sys, '용어집:\n' + X.gloss() + '\n\n항목: ' + j.f.name + ' (' + (j.f.hint || '') + ')\n값 목록:\n' + JSON.stringify(j.vals), 6000).then(function (r) {
          map[j.f.name] = Object.assign(map[j.f.name] || {}, r.values || {});
        }).catch(function () { fail += j.vals.length; }).then(function () { prog(++done, jobs.length); });
      });
    });
    return seq.then(function () {
      return { fail: fail, rows: rows.map(function (r) { var o = Object.assign({}, r); fields.forEach(function (f) { var v = r[f.name], t = map[f.name] && map[f.name][v]; if (t) o[f.name + '@en'] = isName(f.name) ? fixName(t) : t; }); return o; }) };
    });
  }
})();
