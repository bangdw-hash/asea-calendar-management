'use strict';
/**
 * aseasurvey-admin-ai.js — AI 설문 설계 (docx · 텍스트 · 엑셀 → 설문 정의 JSON)
 *  · docx 는 브라우저에서 직접 파싱(표 포함)하여 텍스트로 변환 → AI 는 구조화·점검만 담당(정확도·비용 안정)
 *  · AI 호출은 index.html 과 같은 설정(window.claudeFetch / getAIProviders)을 사용
 *  · 결과는 항상 정규화 → 점검(lint) → 사람이 미리보기 후 적용/생성
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico;
  var MODELS = [['claude-sonnet-5-5', 'Sonnet 5.5 (정확도 우선 · 권장)'], ['claude-haiku-4-5-20251001', 'Haiku 4.5 (빠르고 저렴)']];

  /* ───────────── 파일 → 텍스트 ───────────── */
  async function inflateRaw(u8) {
    if (!window.DecompressionStream) throw new Error('이 브라우저는 docx 해제를 지원하지 않습니다. 최신 Chrome·Edge·Safari 를 사용하거나 내용을 붙여넣어 주십시오.');
    var s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function unzipEntry(buf, wanted) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf), i = u8.length - 22;
    while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
    if (i < 0) throw new Error('docx(zip) 형식이 아닙니다.');
    var cnt = dv.getUint16(i + 10, true), off = dv.getUint32(i + 16, true), dec = new TextDecoder('utf-8');
    for (var k = 0; k < cnt; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      var method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), nlen = dv.getUint16(off + 28, true), elen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
      var name = dec.decode(u8.subarray(off + 46, off + 46 + nlen));
      if (name === wanted) {
        var n2 = dv.getUint16(lho + 26, true), e2 = dv.getUint16(lho + 28, true), st = lho + 30 + n2 + e2, data = u8.subarray(st, st + csize);
        return dec.decode(method === 0 ? data : await inflateRaw(data));
      }
      off += 46 + nlen + elen + clen;
    }
    throw new Error('docx 안에서 ' + wanted + ' 를 찾지 못했습니다.');
  }
  var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  function pText(p) {
    var out = '', walk = function (n) { for (var c = n.firstChild; c; c = c.nextSibling) { if (c.nodeType !== 1) continue; var ln = c.localName; if (ln === 't') out += c.textContent; else if (ln === 'tab') out += ' '; else if (ln === 'br') out += '\n'; else walk(c); } };
    walk(p); return out.replace(/[  ]+/g, ' ').trim();
  }
  function docxXmlToText(xml) {
    var doc = new DOMParser().parseFromString(xml, 'application/xml'), body = doc.getElementsByTagNameNS(W, 'body')[0], lines = [], seen = {};
    if (!body) throw new Error('docx 본문을 읽지 못했습니다.');
    for (var el = body.firstChild; el; el = el.nextSibling) {
      if (el.nodeType !== 1) continue;
      if (el.localName === 'p') { var t = pText(el); if (t) lines.push(t); }
      else if (el.localName === 'tbl') {
        var rows = []; var trs = el.getElementsByTagNameNS(W, 'tr');
        for (var r = 0; r < trs.length; r++) { if (trs[r].parentNode !== el) continue; var cells = []; for (var c = trs[r].firstChild; c; c = c.nextSibling) { if (c.localName !== 'tc') continue; var ps = []; for (var p = c.firstChild; p; p = p.nextSibling) if (p.localName === 'p') { var tx = pText(p); if (tx) ps.push(tx); } cells.push(ps.join(' ')); } rows.push(cells.join(' | ')); }
        var sig = rows.slice(1).join('\n');
        if (rows.length > 3 && seen[sig]) lines.push('[표 — 위와 같은 구성 반복: 머리글 「' + rows[0] + '」, 행 ' + (rows.length - 1) + '개 (과목 목록 × 선택 칸)]');
        else { seen[sig] = 1; lines.push('[표]'); rows.forEach(function (x) { lines.push(x); }); lines.push('[/표]'); }
      }
    }
    return lines.join('\n');
  }
  async function fileToText(file) {
    var name = file.name.toLowerCase(), buf;
    if (/\.docx$/.test(name)) { buf = await file.arrayBuffer(); return docxXmlToText(await unzipEntry(buf, 'word/document.xml')); }
    if (/\.(xlsx|xls|csv)$/.test(name)) { buf = await file.arrayBuffer(); var wb = XLSX.read(new Uint8Array(buf), { type: 'array' }); return wb.SheetNames.map(function (n) { return '[시트 ' + n + ']\n' + XLSX.utils.sheet_to_csv(wb.Sheets[n]); }).join('\n\n'); }
    if (/\.(txt|md|json)$/.test(name)) return await file.text();
    if (/\.(doc|hwp|hwpx|pdf)$/.test(name)) throw new Error('이 형식은 직접 읽을 수 없습니다. docx 로 저장해 올리거나 내용을 복사해 붙여넣어 주십시오.');
    throw new Error('지원하지 않는 파일 형식입니다. (docx, xlsx, csv, txt)');
  }

  /* ───────────── 프롬프트 ───────────── */
  var SCHEMA = [
    '설문 정의 JSON 스키마(한국어 문구 그대로 사용):',
    '{ "def": {',
    '  "intro": { "title":"", "subtitle":"", "org":"", "rewardText":"", "timeNote":"", "notice":[{"k":"항목명","v":"내용"}] },',
    '  "scales": { "likert5":[{"v":5,"label":"매우 그렇다"},{"v":4,"label":"그렇다"},{"v":3,"label":"보통이다"},{"v":2,"label":"아니다"},{"v":1,"label":"전혀 아니다"}], "yesno":[{"v":1,"label":"예"},{"v":0,"label":"아니오"}] },',
    '  "basic": [ 응답자 기본정보 문항(일반 정보만) ],',
    '  "sections": [ { "id":"S1", "title":"영역 제목", "note":"", "questions":[ 문항... ] } ] },',
    ' "issues": ["문서의 오류·모순·누락 지적"], "notes": ["변환 시 판단한 내용"] }',
    '문항(Q) 필드: id(영문·숫자·밑줄, 문서 번호 유지), type("scale"|"single"|"multi"|"text"), label, scope("course"=과목별로 응답 | "common"=설문 전체에서 1회), required(true/false),',
    ' scale 문항: scale("likert5" 또는 "yesno"), 성실응답 점검 문항이면 check:{"valid":정답 점수}',
    ' single/multi 문항: options:[{"id":"o1","label":"","exclusive":true(복수선택에서 "없음"처럼 단독 선택인 항목만)}]',
    ' text 문항: placeholder, maxLen(기본 500)',
    ' 조건부 문항: showIf:{"q":"다른 복수선택 문항 id"} (그 문항에서 단독 선택 외 항목을 고른 경우에만 표시)',
    '예시: {"id":"A1","type":"scale","scope":"course","scale":"likert5","required":true,"label":"수업은 시간표에 맞게 시작된다."}',
    '예시(점검): {"id":"B8","type":"scale","scope":"course","scale":"likert5","required":true,"check":{"valid":1},"label":"성실한 응답 여부를 확인하기 위한 문항입니다. 내용과 관계없이 \'전혀 아니다\'에 표시해 주세요."}'
  ].join('\n');
  function buildSystem() {
    return '당신은 직업전문학교 교육운영팀의 설문 설계 전문가입니다. 입력(설문지 문서의 텍스트·표, 또는 설계 요청)을 읽고 아래 스키마의 설문 정의 JSON으로 변환합니다.\n\n' + SCHEMA + '\n\n' +
      '변환 규칙:\n1. 출력은 JSON 객체 하나만 작성합니다. 마크다운·설명·코드펜스 금지. 모든 괄호와 따옴표를 끝까지 닫습니다.\n' +
      '2. 문서에 있는 문항 문구는 의미를 바꾸지 말고 그대로 옮깁니다(띄어쓰기·오탈자 정리만 허용). 문서에 없는 문항을 임의로 만들지 않습니다. (설계 요청이면 요청에 맞게 새로 설계)\n' +
      '3. 「과목 목록 × 척도 선택 칸」 형태의 표는 과목명을 문항에 넣지 않고, 해당 문항을 scope:"course" 척도 문항으로 변환합니다(과목은 운영자가 별도 등록). 같은 문항이 과목별 응답지에서 반복되는 구조이면 모두 scope:"course" 로 둡니다.\n' +
      '4. 척도 점수는 긍정일수록 큰 값(가장 긍정=5)으로 정의하고, 라벨은 문서 표 머리글의 문구를 사용합니다. 화면에는 scales 배열 순서대로 표시되므로 문서의 표시 순서를 유지합니다.\n' +
      '5. 「내용과 관계없이 ~에 표시」류 성실응답 점검 문항은 type:"scale" + check:{valid:지시된 선택지의 점수}로 변환합니다. 문서의 지시 문구와 표의 번호가 서로 모순이면 문장에 쓰인 선택지 이름(라벨)을 기준으로 하고 issues 에 반드시 기록합니다.\n' +
      '6. 복수 응답 문항은 multi, 「없음/경험한 적 없다」는 exclusive:true 로 둡니다. 「해당 시 구체적으로 적어 주십시오」 같은 후속 서술은 text + showIf 로 연결합니다.\n' +
      '7. 서술형은 required:false 가 기본입니다. 척도·단일·복수 선택은 문서에 선택이라는 표시가 없으면 required:true 입니다.\n' +
      '8. 이 시스템은 완전 익명입니다. 이름·학번·연락처 등 개인 식별 정보를 묻는 문항은 만들지 말고 issues 에 제외 사유를 적습니다. 「반」은 시스템이 별도로 받으므로 basic 에 넣지 않습니다. 출석 정도처럼 일반 정보만 basic 에 둡니다.\n' +
      '9. 영역(섹션)은 문서의 영역 제목(Ⅰ, Ⅱ …)을 그대로 title 로 사용하되, 응답자 기본정보 영역은 basic 으로 보냅니다. 영역 아래 안내 문구(※ …)는 note 로 둡니다.\n' +
      '10. intro 에는 문서 머리말에서 제목·부제·기관명·안내 항목(목적·익명성·대상·유의사항 등)·소요 시간을 옮깁니다. 문서가 밝힌 문항 수나 소요 시간이 실제 문항 수와 다르면 issues 에 기록하고 timeNote 에는 확인된 사실만 적습니다. 상품·추첨 문구는 문서에 있을 때만 rewardText 에 넣습니다.\n' +
      '11. 문서에서 읽을 수 없거나 판단이 불확실한 부분은 notes 에 적고 추정으로 채우지 않습니다.';
  }
  function trimInput(t) { t = String(t || '').trim(); return t.length > 80000 ? t.slice(0, 80000) + '\n…(이하 생략)' : t; }

  /* ───────────── 호출 · 파싱 · 정규화 ───────────── */
  function parseJson(text) {
    var s = String(text || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim(), a = s.indexOf('{'); if (a > 0) s = s.slice(a);
    try { return JSON.parse(s); } catch (e) {}
    var b = s.lastIndexOf('}'); if (b > 0) { try { return JSON.parse(s.slice(0, b + 1)); } catch (e2) {} }
    throw new Error('AI 응답을 JSON으로 해석하지 못했습니다. 입력 분량을 줄이거나 다시 시도해 주십시오.');
  }
  async function callAI(system, user, model) {
    if (!window.claudeFetch) throw new Error('AI 설정 모듈(config.js)을 불러오지 못했습니다. 페이지를 새로고침해 주십시오.');
    try { if (window.loadAIProvidersFromCloud) await window.loadAIProvidersFromCloud(); } catch (e) {}
    var cc = window.getClaudeConfig ? window.getClaudeConfig() : { apiKey: '', endpoint: 'https://api.anthropic.com/v1/messages', isOfficial: true };
    if (!cc.apiKey) throw new Error('AI 연결 설정이 없습니다. index.html 의 「AI 제공자 설정」을 먼저 저장해 주십시오. (상단 「AI 연결 테스트」로 확인)');
    var headers = { 'Content-Type': 'application/json', 'x-api-key': cc.apiKey, 'anthropic-version': '2023-06-01' }; if (cc.isOfficial) headers['anthropic-dangerous-direct-browser-access'] = 'true';
    var res = await window.claudeFetch(cc.endpoint, { method: 'POST', headers: headers, body: JSON.stringify({ model: model, max_tokens: 16000, system: system, messages: [{ role: 'user', content: user }] }) });
    var data = await res.json().catch(function () { return {}; });
    if (data.error || !res.ok) { var e = new Error((data.error && data.error.message) || ('AI 응답 오류 (HTTP ' + res.status + ')')); e.status = res.status; throw e; }
    var text = window.claudeExtractText ? window.claudeExtractText(data) : (data.content && data.content[0] && data.content[0].text);
    if (!text) throw new Error('AI 응답이 비어 있습니다.');
    return text;
  }
  var TYPE_MAP = { radio: 'single', single_choice: 'single', select: 'single', dropdown: 'single', checkbox: 'multi', multiple: 'multi', multi_choice: 'multi', likert: 'scale', rating: 'scale', matrix: 'scale', textarea: 'text', paragraph: 'text', short: 'text', open: 'text', essay: 'text' };
  A.normalizeDef = function (raw) {
    var d = raw && raw.def ? raw.def : (raw || {}), tpl = window.SVY_TEMPLATE.def, ids = {};
    var def = { intro: Object.assign({}, d.intro || {}), scales: Object.assign({}, tpl.scales, d.scales || {}), basic: [], sections: [] };
    if (!Array.isArray(def.intro.notice)) def.intro.notice = [];
    def.intro.notice = def.intro.notice.filter(function (n) { return n && (n.k || n.v); }).map(function (n) { return { k: String(n.k || ''), v: String(n.v || '') }; });
    function uid(base) { var id = String(base || 'Q').replace(/[^A-Za-z0-9_]/g, '').slice(0, 20) || 'Q', k = id, n = 2; while (ids[k]) k = id + '_' + n++; ids[k] = 1; return k; }
    function fix(q, basic, prefix) {
      q = Object.assign({}, q); var t = String(q.type || 'text').toLowerCase(); q.type = TYPE_MAP[t] || t; if (['scale', 'single', 'multi', 'text'].indexOf(q.type) < 0) q.type = 'text';
      q.id = uid(q.id || prefix); q.label = String(q.label || q.title || '').trim(); q.scope = basic ? 'common' : (q.scope === 'common' ? 'common' : 'course');
      q.required = q.required == null ? q.type !== 'text' : !!q.required;
      if (q.type === 'scale') { q.scale = def.scales[q.scale] ? q.scale : 'likert5'; var sc = def.scales[q.scale]; if (q.check && q.check.valid != null) { var v = q.check.valid; if (typeof v === 'string' && isNaN(Number(v))) { var f = sc.filter(function (o) { return o.label === v; })[0]; v = f ? f.v : v; } q.check = { valid: Number(v) }; q.required = true; } else delete q.check; delete q.options; }
      else if (q.type === 'single' || q.type === 'multi') { q.options = (q.options || []).map(function (o, i) { if (typeof o === 'string') o = { label: o }; var r = { id: String(o.id || 'o' + (i + 1)).replace(/[^A-Za-z0-9_]/g, '') || 'o' + (i + 1), label: String(o.label || '').trim() }; if (o.exclusive && q.type === 'multi') r.exclusive = true; return r; }); delete q.scale; delete q.check; }
      else { delete q.options; delete q.scale; delete q.check; q.maxLen = Math.min(Number(q.maxLen) || 500, 2000); }
      if (q.type !== 'multi' && q.type !== 'single') { /* keep */ } if (q.showIf && !(q.showIf.q)) delete q.showIf;
      return q;
    }
    (d.basic || []).forEach(function (q) { def.basic.push(fix(q, true, 'B')); });
    (d.sections || []).forEach(function (s, si) { def.sections.push({ id: s.id || ('S' + (si + 1)), title: String(s.title || ''), note: String(s.note || ''), questions: (s.questions || []).map(function (q, qi) { return fix(q, false, 'Q' + (si + 1) + '_' + (qi + 1)); }) }); });
    var all = []; def.basic.concat([].concat.apply([], def.sections.map(function (s) { return s.questions; }))).forEach(function (q) { all.push(q); });
    all.forEach(function (q) { if (q.showIf && !all.some(function (o) { return o.id === q.showIf.q && o.type === 'multi'; })) delete q.showIf; });
    return { def: def, issues: (raw && raw.issues) || [], notes: (raw && raw.notes) || [] };
  };

  /* ───────────── 화면 ───────────── */
  var st = A.ext.ai = { text: '', fname: '', model: MODELS[0][0], mode: 'new', res: null, busy: false, err: '' };
  function summary(def) {
    var q = [].concat(def.basic || []); (def.sections || []).forEach(function (s) { q = q.concat(s.questions || []); });
    var cnt = function (t) { return q.filter(function (x) { return x.type === t; }).length; };
    return '영역 ' + (def.sections || []).length + '개 · 문항 ' + q.length + '개 (척도 ' + cnt('scale') + ' · 단일 ' + cnt('single') + ' · 복수 ' + cnt('multi') + ' · 서술 ' + cnt('text') + ') · 성실응답 점검 ' + q.filter(function (x) { return x.check; }).length + '개';
  }
  function resultHtml() {
    if (st.busy) return '<div class="loading">AI가 설문 구조를 만드는 중입니다… (보통 20~60초)</div>';
    if (st.err) return '<div class="msg err">' + I('alert', 18) + '<div>' + E(st.err) + '</div></div>';
    if (!st.res) return '<div class="t-empty">입력을 넣고 「AI로 설계」를 누르면 결과가 여기에 표시됩니다.</div>';
    var r = st.res, d = r.def, lint = A.lintDef(d), h = '<div class="msg ' + (lint.errs.length ? 'warn' : 'ok') + '" style="margin-top:0">' + I(lint.errs.length ? 'alert' : 'check', 18) + '<div><b>' + E(summary(d)) + '</b>' + (lint.errs.length ? '<br>자동 점검 오류 ' + lint.errs.length + '건: ' + lint.errs.slice(0, 4).map(E).join(' / ') : '<br>자동 점검을 통과했습니다.') + '</div></div>';
    if (r.issues.length) h += '<div class="panel" style="margin-top:10px;background:#FEF7E0"><h3>문서에서 발견한 문제점 (' + r.issues.length + ')</h3><ul style="margin:0;padding-left:18px">' + r.issues.map(function (x) { return '<li>' + E(x) + '</li>'; }).join('') + '</ul></div>';
    if (r.notes.length) h += '<div class="panel" style="margin-top:10px"><h3>변환 메모</h3><ul style="margin:0;padding-left:18px">' + r.notes.map(function (x) { return '<li>' + E(x) + '</li>'; }).join('') + '</ul></div>';
    h += '<div class="panel" style="margin-top:10px"><h3>안내문</h3><div><b>' + E(d.intro.title || '') + '</b> ' + E(d.intro.subtitle || '') + '</div><div class="muted">' + E(d.intro.org || '') + '</div>' + (d.intro.notice || []).map(function (n) { return '<div style="font-size:13px"><b>' + E(n.k) + '</b> ' + E(n.v) + '</div>'; }).join('') + '</div>';
    h += '<div class="panel" style="margin-top:10px"><h3>문항 구성</h3>' + (d.basic.length ? '<div class="muted" style="font-size:12px">기본정보</div>' + d.basic.map(qLine).join('') : '') + d.sections.map(function (s) { return '<div style="font-weight:700;color:var(--primary-dk);margin-top:10px">' + E(s.title) + '</div>' + (s.note ? '<div class="muted" style="font-size:12px">' + E(s.note) + '</div>' : '') + s.questions.map(qLine).join(''); }).join('') + '</div>';
    return h;
  }
  function qLine(q) { return '<div style="padding:4px 0;border-bottom:1px solid var(--gray-lt);font-size:13px"><span class="qid">' + E(q.id) + '</span> <span class="tag blue">' + ({ scale: '척도', single: '단일', multi: '복수', text: '서술' }[q.type]) + '</span>' + (q.scope === 'common' ? ' <span class="tag">공통</span>' : '') + (q.check ? ' <span class="tag check">점검 정답 ' + E((st.res.def.scales[q.scale] || []).filter(function (o) { return o.v === q.check.valid; }).map(function (o) { return o.label; })[0] || q.check.valid) + '</span>' : '') + (q.showIf ? ' <span class="tag">조건부</span>' : '') + ' ' + E(q.label) + (q.options ? '<div class="muted" style="font-size:12px;margin-left:34px">' + q.options.map(function (o) { return E(o.label) + (o.exclusive ? '(단독)' : ''); }).join(' · ') + '</div>' : '') + '</div>'; }
  A.renderAI = function (box, mode, meta) {
    var canImprove = mode === 'tab';
    box.innerHTML = '<div class="grid g2"><div><div class="panel"><h3>' + I('sparkle', 16) + ' 입력</h3><p class="panel-sub">설문지 문서(docx)나 텍스트를 넣으면 AI가 문항·안내문·척도·성실응답 점검을 설문 정의로 변환하고, 문서의 오류도 함께 지적합니다. docx는 표까지 이 화면에서 직접 읽어 텍스트로 변환합니다.</p>' +
      (canImprove ? '<label class="f">작업 방식</label><select class="fld" id="aimode"><option value="new"' + (st.mode === 'new' ? ' selected' : '') + '>새로 설계 (입력 내용으로 문항 전체 생성)</option><option value="improve"' + (st.mode === 'improve' ? ' selected' : '') + '>현재 문항 수정 (수정 요청 반영)</option></select>' : '') +
      '<label class="f">파일 올리기 (docx · xlsx · csv · txt)</label><div class="drop" id="aidrop">' + I('upload', 22) + '<div style="margin-top:4px">' + (st.fname ? E(st.fname) + ' 읽음' : '파일을 끌어다 놓거나 눌러서 선택') + '</div></div><input type="file" id="aifile" class="hide" accept=".docx,.xlsx,.xls,.csv,.txt,.md">' +
      '<label class="f">내용 붙여넣기 / 설계 요청 (파일 내용 아래에 이어 쓸 수 있습니다)</label><textarea class="fld" id="aitext" rows="12" placeholder="예) 5점 척도 12문항(수업 준비, 진행, 평가)과 서술형 2문항으로 학기말 수업 만족도 설문을 설계해 주세요. 성실응답 점검 문항 1개 포함.">' + E(st.text) + '</textarea>' +
      '<div class="grid g2"><div><label class="f">AI 모델</label><select class="fld" id="aimodel">' + MODELS.map(function (m) { return '<option value="' + m[0] + '"' + (st.model === m[0] ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') + '</select></div><div><label class="f">&nbsp;</label><button class="btn btn-ghost btn-sm block" data-act="aitest">AI 연결 테스트</button></div></div>' +
      '<div class="row" style="margin-top:12px"><span class="muted" style="font-size:12px" id="aicnt">' + st.text.length.toLocaleString() + '자</span><span class="sp"></span><button class="btn btn-primary" data-act="airun" ' + (st.busy ? 'disabled' : '') + '>' + I('sparkle', 16) + ' AI로 설계</button></div></div></div>' +
      '<div><div class="panel"><h3>생성 결과</h3><div id="aires">' + resultHtml() + '</div>' +
      '<div class="row" style="margin-top:12px" id="aiact">' + (st.res ? (mode === 'create' ? '<button class="btn btn-ghost" data-act="aicancel">취소</button><span class="sp"></span><button class="btn btn-secondary" data-act="aijson">JSON 보기</button><button class="btn btn-primary" data-act="aimake">새 설문으로 만들기</button>' : '<span class="sp"></span><button class="btn btn-secondary" data-act="aijson">JSON 보기</button><button class="btn btn-primary" data-act="aiapply">현재 설문에 적용 (저장 전 확인)</button>') : '') + '</div></div></div></div>';
    var fi = box.querySelector('#aifile'), dr = box.querySelector('#aidrop');
    async function load(f) {
      if (!f) return; try { var t = await fileToText(f); st.text = (st.text ? st.text + '\n\n' : '') + '[파일: ' + f.name + ']\n' + t; st.fname = f.name; A.toast(f.name + ' 내용을 읽었습니다. (' + t.length.toLocaleString() + '자)'); A.renderAI(box, mode, meta); } catch (e) { A.toast(e.message, 'err'); }
    }
    dr.onclick = function () { fi.click(); }; fi.onchange = function () { load(fi.files[0]); fi.value = '';  };
    dr.ondragover = function (e) { e.preventDefault(); dr.classList.add('over'); }; dr.ondragleave = function () { dr.classList.remove('over'); }; dr.ondrop = function (e) { e.preventDefault(); dr.classList.remove('over'); load(e.dataTransfer.files[0]); };
    box.querySelector('#aitext').oninput = function () { st.text = this.value; box.querySelector('#aicnt').textContent = st.text.length.toLocaleString() + '자'; };
    box.querySelector('#aimodel').onchange = function () { st.model = this.value; };
    var mm = box.querySelector('#aimode'); if (mm) mm.onchange = function () { st.mode = this.value; };
    box.onclick = async function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return; var act = t.getAttribute('data-act');
      if (act === 'airun') {
        if (!st.text.trim()) return A.toast('내용을 입력하거나 파일을 올려 주십시오.', 'err');
        st.busy = true; st.err = ''; A.renderAI(box, mode, meta);
        try {
          var user = (canImprove && st.mode === 'improve') ? '[현재 설문 정의 JSON]\n' + JSON.stringify(A.work.def) + '\n\n[수정 요청]\n' + trimInput(st.text) + '\n\n위 수정 요청을 반영한 전체 설문 정의 JSON을 출력하십시오. 요청과 무관한 문항·ID·문구는 그대로 유지합니다.' : '[입력 문서·요청]\n' + trimInput(st.text);
          var models = [st.model].concat(MODELS.map(function (m) { return m[0]; }).filter(function (m) { return m !== st.model; })), text = null, lastErr;
          for (var i = 0; i < models.length && text == null; i++) { try { text = await callAI(buildSystem(), user, models[i]); } catch (er) { lastErr = er; if (!(er.status === 404 || /model/i.test(er.message))) break; } }
          if (text == null) throw lastErr;
          st.res = A.normalizeDef(parseJson(text)); A.ext.aiRaw = text;
        } catch (er) { st.err = er.message; st.res = null; }
        st.busy = false; A.renderAI(box, mode, meta);
      }
      else if (act === 'aijson') A.modal('<h3>설문 정의 JSON</h3><pre class="code" style="max-height:60vh">' + E(JSON.stringify(st.res.def, null, 2)) + '</pre><div class="btn-row"><button class="btn btn-ghost" data-c="1">복사</button><button class="btn btn-primary" data-r="1">닫기</button></div>', function (bg, close) { bg.addEventListener('click', function (ev) { if (ev.target.closest('[data-c]')) A.copy(JSON.stringify(st.res.def, null, 2)); if (ev.target.closest('[data-r]')) close(); }); }, 'xl');
      else if (act === 'aiapply') { if (!await A.confirm('현재 설문에 적용', '현재 문항·안내문이 AI 결과로 교체됩니다. 적용 후 문항 탭에서 확인하고 우측 상단 「저장」을 눌러야 반영됩니다. (이전 내용은 버전 이력에 남습니다)', '적용', '취소')) return; var keepIntro = A.work.def.intro; A.work.def = st.res.def; A.markDirty(); A.go('questions'); }
      else if (act === 'aimake') {
        var lint = A.lintDef(st.res.def); if (lint.errs.length && !await A.confirm('점검 오류가 있습니다', E(lint.errs.slice(0, 4).join(' / ')) + '<br>만든 뒤 문항 탭에서 수정할 수 있습니다. 계속하시겠습니까?', '만들기', '취소')) return;
        try { var r = await A.rpc('svy_a_create', { p_title: (meta && meta.title) || st.res.def.intro.title || 'AI 설계 설문', p_semester: (meta && meta.semester) || '', p_def: st.res.def, p_theme: {} }); A.toast('설문을 만들었습니다.'); st.res = null; location.hash = '#/s/' + r.id + '/questions'; } catch (er) { A.toast(er.message, 'err'); }
      }
      else if (act === 'aicancel') { location.hash = '#/'; }
    };
  };
  A.tabs.ai = function (box) { A.renderAI(box, 'tab'); };
  A.ext.aiCreate = function (meta) {
    A.view = 'ai-create'; A.cur = null; A.work = null;
    A.shell('<div class="crumb"><a data-act="tolist">설문 목록</a> / AI로 설계</div><div class="pg-head"><h1>AI로 새 설문 설계</h1></div><div id="aibox"></div>');
    A.renderAI(document.getElementById('aibox'), 'create', meta);
  };
  A.ext.aiParse = { docxXmlToText: docxXmlToText, fileToText: fileToText, normalize: A.normalizeDef, buildSystem: buildSystem, parseJson: parseJson };
})();
