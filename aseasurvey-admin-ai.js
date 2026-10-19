'use strict';
/**
 * aseasurvey-admin-ai.js — AI 설문 설계: 「제안 → 확인·수정 → 만들기」 3단계
 *  1) 입력: 이미지(jpg·png) · PDF · docx · hwpx · xlsx/csv · txt · 붙여넣기 (여러 개 가능)
 *  2) 제안: AI는 설문을 바로 만들지 않고 「설계 제안」(유형·형식 추천·이유·개선 제안)만 작성합니다.
 *     화면에서 학생 화면과 같은 미리보기를 눌러 보고, 형식·문구를 직접 고치거나 AI에게 수정 요청을 할 수 있습니다.
 *  3) 관리자가 「만들기(개발 시작)」를 눌러야 비로소 설문이 생성됩니다.
 *  · docx·hwpx 는 브라우저에서 직접 읽어 텍스트로 변환, 이미지·PDF 는 AI에 그대로 전달
 *  · AI 호출은 index.html 과 같은 설정(window.claudeFetch / getAIProviders)을 사용
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

  var MAXB = { image: 5 * 1048576, pdf: 12 * 1048576 };
  async function hwpxToText(buf) {
    var out = [];
    for (var k = 0; k < 40; k++) {
      var xml; try { xml = await unzipEntry(buf, 'Contents/section' + k + '.xml'); } catch (e) { break; }
      var doc = new DOMParser().parseFromString(xml, 'application/xml'), ps = doc.getElementsByTagName('*');
      for (var i = 0; i < ps.length; i++) {
        if (ps[i].localName !== 'p') continue;
        var t = '', ts = ps[i].getElementsByTagName('*');
        for (var j = 0; j < ts.length; j++) { if (ts[j].localName === 't') { t += ts[j].textContent; } }
        t = t.replace(/\s+/g, ' ').trim(); if (t && ps[i].parentNode && ps[i].parentNode.localName !== 'p') out.push(t);
      }
    }
    if (!out.length) throw new Error('hwpx 본문을 읽지 못했습니다. 한글에서 docx 로 저장해 올려 주십시오.');
    return out.join('\n');
  }
  // 파일 → { name, kind:'text'|'image'|'pdf', text | b64+mime }
  async function readInput(file) {
    var name = file.name, low = name.toLowerCase(), buf;
    if (/\.(png|jpe?g|webp|gif)$/.test(low) || /^image\//.test(file.type)) {
      var blob = await SVY.compressImage(file, 1800, 3.5 * 1048576);
      if (blob.size > MAXB.image) throw new Error(name + ': 이미지 용량이 너무 큽니다. (5MB 이하)');
      var mime = /^image\/(png|jpeg|webp|gif)$/.test(blob.type) ? blob.type : 'image/jpeg';
      return { name: name, kind: 'image', mime: mime, b64: await SVY.readB64(blob), size: blob.size };
    }
    if (/\.pdf$/.test(low) || file.type === 'application/pdf') {
      if (file.size > MAXB.pdf) throw new Error(name + ': PDF 용량이 너무 큽니다. (12MB 이하, 쪽수가 많으면 나누어 올려 주십시오)');
      return { name: name, kind: 'pdf', mime: 'application/pdf', b64: await SVY.readB64(file), size: file.size };
    }
    if (/\.docx$/.test(low)) { buf = await file.arrayBuffer(); return { name: name, kind: 'text', text: docxXmlToText(await unzipEntry(buf, 'word/document.xml')) }; }
    if (/\.hwpx$/.test(low)) { buf = await file.arrayBuffer(); return { name: name, kind: 'text', text: await hwpxToText(buf) }; }
    if (/\.(xlsx|xls|csv)$/.test(low)) { buf = await file.arrayBuffer(); var wb = XLSX.read(new Uint8Array(buf), { type: 'array' }); return { name: name, kind: 'text', text: wb.SheetNames.map(function (n) { return '[시트 ' + n + ']\n' + XLSX.utils.sheet_to_csv(wb.Sheets[n]); }).join('\n\n') }; }
    if (/\.(txt|md|json|csv)$/.test(low) || /^text\//.test(file.type)) return { name: name, kind: 'text', text: await file.text() };
    if (/\.(doc|hwp|ppt|pptx)$/.test(low)) throw new Error(name + ': 이 형식은 직접 읽을 수 없습니다. docx·hwpx·PDF 로 저장해 올리거나 내용을 붙여넣어 주십시오.');
    throw new Error(name + ': 지원하지 않는 파일 형식입니다. (jpg·png·pdf·docx·hwpx·xlsx·csv·txt)');
  }

  /* ───────────── 프롬프트 ───────────── */
  var SCHEMA = [
    '출력은 JSON 객체 하나입니다. 구조:',
    '{ "title":"설문 제목", "summary":"이 설문을 어떻게 설계했는지 2~3문장",',
    '  "mode":"course"(수강 과목마다 반복 응답하는 평가) | "general"(행사 만족도·교직원 설문 등 1인 1회),',
    '  "mode_reason":"유형 판단 이유",',
    '  "def": { "intro":{"title":"","subtitle":"","org":"","rewardText":"","timeNote":"","notice":[{"k":"","v":""}]},',
    '           "scales":{"likert5":[{"v":5,"label":"매우 그렇다"},…,{"v":1,"label":"전혀 아니다"}],"yesno":[{"v":1,"label":"예"},{"v":0,"label":"아니오"}]},',
    '           "layout":"pages"(영역별 단계) | "single"(한 화면), "limit":{"max":선착순 정원(필요할 때만)}, "quiz":{"show":"score","passScore":숫자}(퀴즈일 때만), "features":{"ticket":true|false}(추첨번호 발급 여부),',
    '           "basic":[기본정보 문항], "sections":[{"id":"S1","title":"","note":"","showIf":조건(선택),"questions":[문항…]}] },',
    '  "why": {"문항id":"이 형식을 추천한 이유 한 줄"},',
    '  "suggestions":[{"id":"g1","title":"개선 제안 제목","reason":"왜 필요한지","default":true|false,"ops":[작업…]}],',
    '  "issues":["입력 문서의 오류·모순·누락"], "notes":["판단이 불확실하거나 추정하지 않은 부분"] }',
    '',
    '문항 공통: id(영문·숫자·밑줄), type, label, desc(보조 설명), required, showIf. 표시 조건 showIf: {"q":"앞쪽 문항id","op":"eq|ne|has|nhas|gt|gte|lt|lte|answered|empty","v":값}, 여러 조건은 {"all":[…]} 또는 {"any":[…]}. 영역에도 showIf 를 둘 수 있습니다(분기). 조건 문항은 반드시 앞에 나옵니다.',
    '선택지 값 규칙: single 의 eq 값은 선택지 id, multi 의 has 값은 선택지 id, scale 은 점수 v.',
    '문항 형식(type) 과 필드:',
    ' text: format("text"|"number"|"email"|"phone"|"url"|"pattern"), multiline, maxLen, minLen, placeholder, number→min,max,integer, pattern→pattern(정규식),patternMsg',
    ' single: options:[{"id","label","max"(선착순 정원)}], display("radio"|"dropdown"|"image"), other(기타 입력), randomOptions   multi: single 과 같고 minSel,maxSel, 단독 선택 항목은 exclusive:true',
    ' scale: scale("likert5"|"yesno"), 성실응답 점검이면 check:{"valid":정답 점수}   linear: min,max,lowLabel,highLabel   rating: max,icon("star"|"heart"|"thumb")   nps(0~10): lowLabel,highLabel   slider: min,max,step,unit',
    ' grid(표형 객관식): rows:[{"id","label"}], cols:[{"id","label"}], multi(행마다 복수), eachRow   ranking: options, top   constsum(합계 배분): options,total,unit',
    ' date: includeTime,min,max   time   file: accept("any"|"image"|"pdf"|"doc"),capture,maxFiles,maxMB   signature   address(도로명 주소 검색, allowGps)   location(현재 위치, 동의 문구 consentText)   qr   consent: text,checkLabel',
    ' block(응답 없는 안내): kind("text"|"image"|"video"), text/src/caption/url',
    '퀴즈 채점: 단일·복수·척도·숫자·단답에 answer(단일=선택지 id, 복수=id 배열, 척도·숫자=숫자, 단답=문자열 또는 배열)와 points(배점).',
    '제안 작업(ops): {"op":"add_question","section":"영역id","after":"문항id(선택)","q":문항} | {"op":"replace_question","qid":"문항id","q":문항} | {"op":"remove_question","qid":"문항id"} | {"op":"add_section","after":"영역id(선택)","section":{id,title,note,questions}} | {"op":"set","path":"limit.max","value":100}(def 하위 경로)'
  ].join('\n');
  function buildSystem() {
    return '당신은 직업전문학교 교육운영팀의 설문 설계 전문가입니다. 입력(설문지 문서·이미지·PDF·텍스트·요청)을 읽고 「설계 제안」을 작성합니다. 이 제안은 관리자가 화면에서 미리보기로 확인·수정한 뒤 승인해야 실제 설문이 만들어지므로, 제안의 형식 선택과 이유가 명확해야 합니다.\n\n' + SCHEMA + '\n\n' +
      '설계 원칙:\n1. 출력은 JSON 객체 하나만 작성합니다. 마크다운·설명·코드펜스 금지. 모든 괄호와 따옴표를 끝까지 닫습니다.\n' +
      '2. 입력에 문항이 있으면 문구를 바꾸지 말고 그대로 옮깁니다(띄어쓰기·오탈자 정리만). 입력에 없는 문항은 def 에 넣지 말고 suggestions 로 제안합니다. 입력이 설계 요청이면 요청에 맞게 def 를 설계합니다.\n' +
      '3. 각 문항마다 가장 알맞은 형식을 고르고 why 에 이유를 한 줄로 씁니다(예: 「만족도는 비교·집계가 쉬운 5점 척도」, 「추천 의향은 NPS 0~10」, 「중복 선택 가능한 항목은 체크박스」, 「참가 신청 인원 제한은 선택지 정원」). 서술형은 꼭 필요한 곳에만 둡니다.\n' +
      '4. mode: 수강 과목마다 같은 문항을 반복 응답하는 문서(과목 × 척도 표)는 course, 그 밖의 행사·교직원·신청·퀴즈 설문은 general 입니다. course 의 문항 scope 는 "course"(과목별) 또는 "common"(1회)이며 general 은 scope 를 쓰지 않습니다.\n' +
      '5. 「과목 목록 × 척도 선택 칸」 표는 과목명을 문항에 넣지 않고 scope:"course" 척도 문항으로 변환합니다. 척도 점수는 긍정일수록 큰 값(가장 긍정=5)이며 라벨은 입력의 표 머리글을 따릅니다.\n' +
      '6. 「내용과 관계없이 ~에 표시」류 점검 문항은 scale + check 로 변환하고, 지시 문구와 번호가 모순이면 문장에 쓰인 선택지 이름을 기준으로 하고 issues 에 기록합니다. (course 유형에서만 사용)\n' +
      '7. 개인정보: course 유형은 완전 익명이므로 이름·학번·연락처를 묻지 않습니다. general 유형에서도 입력(문서·요청)이 명시적으로 요구한 경우에만 이름·연락처·주소 등을 묻고, 이때는 반드시 수집 목적·항목·보유 기간을 적은 consent 문항을 마지막 영역 또는 해당 영역 앞에 둡니다. 불필요한 개인정보 문항은 만들지 않습니다.\n' +
      '8. 행사 설문 등에서는 상황에 맞는 형식을 적극 추천합니다: 참가 신청(선택지 정원·날짜·연락처), 만족도(척도·별점·NPS), 점수형 평가(퀴즈), 현장 확인(QR), 사진 제출(파일), 순위 선호(ranking), 예산 배분(constsum). 입력에 없던 항목은 def 에 넣지 말고 suggestions 에 default:false 로 제안합니다. 입력 문서에 이미 있는 항목을 더 나은 형식으로 바꾸는 제안은 replace_question 으로 제안합니다.\n' +
      '9. 영역(섹션)은 입력의 영역 제목을 사용하고, 응답에 따라 보이는 영역은 showIf 로 분기합니다. 문서가 문항 수·소요 시간을 밝혔는데 실제와 다르면 issues 에 기록합니다.\n' +
      '10. 이미지·PDF 는 문서 전체를 읽고, 읽을 수 없거나 불확실한 부분은 notes 에 적으며 추정으로 채우지 않습니다.\n' +
      '11. 수정 요청이 함께 오면 [현재 설계]를 기준으로 요청한 부분만 바꾸고 나머지 문항·ID·문구는 그대로 유지한 전체 제안을 출력합니다.';
  }
  function trimInput(t) { t = String(t || '').trim(); return t.length > 80000 ? t.slice(0, 80000) + '\n…(이하 생략)' : t; }

  /* ───────────── 호출 · 파싱 ───────────── */
  function parseJson(text) {
    var s = String(text || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim(), a = s.indexOf('{'); if (a > 0) s = s.slice(a);
    try { return JSON.parse(s); } catch (e) {}
    var b = s.lastIndexOf('}'); if (b > 0) { try { return JSON.parse(s.slice(0, b + 1)); } catch (e2) {} }
    throw new Error('AI 응답을 JSON으로 해석하지 못했습니다. 입력 분량을 줄이거나 다시 시도해 주십시오.');
  }
  async function callAI(system, content, model, opts) {
    if (!window.claudeFetch) throw new Error('AI 설정 모듈(config.js)을 불러오지 못했습니다. 페이지를 새로고침해 주십시오.');
    try { if (window.loadAIProvidersFromCloud) await window.loadAIProvidersFromCloud(); } catch (e) {}
    var cc = window.getClaudeConfig ? window.getClaudeConfig() : { apiKey: '', endpoint: 'https://api.anthropic.com/v1/messages', isOfficial: true };
    if (!cc.apiKey) throw new Error('AI 연결 설정이 없습니다. index.html 의 「AI 제공자 설정」을 먼저 저장해 주십시오. (상단 「AI 연결 테스트」로 확인)');
    var headers = { 'Content-Type': 'application/json', 'x-api-key': cc.apiKey, 'anthropic-version': '2023-06-01' }; if (cc.isOfficial) headers['anthropic-dangerous-direct-browser-access'] = 'true';
    var res = await window.claudeFetch(cc.endpoint, { method: 'POST', headers: headers, body: JSON.stringify({ model: model, max_tokens: 16000, system: (cc.isOfficial && opts && opts.cache && String(system).length > 1500) ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] : system, messages: [{ role: 'user', content: content }] }) });
    var data = await res.json().catch(function () { return {}; });
    if (data.error || !res.ok) { var e = new Error((data.error && data.error.message) || ('AI 응답 오류 (HTTP ' + res.status + ')')); e.status = res.status; throw e; }
    var us = data.usage || (data.data && data.data.usage) || null, U = A.ext.aiUsage || (A.ext.aiUsage = { calls: 0, inp: 0, out: 0 });   // 실제 사용 토큰 누적(제공자가 알려 줄 때)
    U.calls++; if (us) { U.inp += (us.input_tokens || 0) + (us.cache_creation_input_tokens || 0) + (us.cache_read_input_tokens || 0); U.out += us.output_tokens || 0; }
    var text = window.claudeExtractText ? window.claudeExtractText(data) : (data.content && data.content[0] && data.content[0].text);
    if (!text) throw new Error('AI 응답이 비어 있습니다.');
    return text;
  }

  /* ───────────── 정규화 (모든 형식) ───────────── */
  var NATIVE_KEY = { text: 'short', single: 'single', multi: 'multi', scale: 'scale5', linear: 'linear', rating: 'rating', nps: 'nps', slider: 'slider', grid: 'grid', ranking: 'ranking', constsum: 'constsum', date: 'date', time: 'time', file: 'file', signature: 'signature', address: 'address', location: 'location', qr: 'qr', consent: 'consent', block: 'block_text' };
  var ALIAS = { radio: 'single', single_choice: 'single', multiple_choice: 'single', select: 'dropdown', checkbox: 'multi', checkboxes: 'multi', multiple: 'multi', multi_choice: 'multi', likert: 'scale5', likert5: 'scale5', matrix: 'grid', textarea: 'paragraph', long: 'paragraph', long_text: 'paragraph', essay: 'paragraph', open: 'paragraph', short_answer: 'short', string: 'short', star: 'rating', stars: 'rating', datetime_local: 'datetime', image_choice: 'imagechoice', grid_multi: 'gridmulti', checkbox_grid: 'gridmulti', sign: 'signature', agree: 'consent', agreement: 'consent', info: 'block_text', description: 'block_text', text_block: 'block_text', picture: 'block_image', video: 'block_video', upload: 'file', attachment: 'file', camera: 'photo', gps: 'location', barcode: 'qr', yes_no: 'yesno', boolean: 'yesno', rank: 'ranking', allocation: 'constsum' };
  var NUMKEYS = ['min', 'max', 'step', 'top', 'total', 'maxLen', 'minLen', 'minSel', 'maxSel', 'maxFiles', 'maxMB', 'points'];
  function normOptions(list, pre, allowMax) {
    return (list || []).map(function (o, i) {
      if (typeof o === 'string' || typeof o === 'number') o = { label: String(o) };
      var r = { id: String(o.id || pre + (i + 1)).replace(/[^A-Za-z0-9_]/g, '') || pre + (i + 1), label: String(o.label == null ? '' : o.label).trim() };
      if (o.exclusive) r.exclusive = true; if (o.image) r.image = String(o.image); if (allowMax && SVY.num(o.max) >= 1) r.max = SVY.num(o.max);
      return r;
    }).filter(function (o, i, a) { return o.label && a.findIndex(function (z) { return z.id === o.id; }) === i; });
  }
  function condOk(c, known) {
    if (!c || typeof c !== 'object') return null;
    if (c.all || c.any) { var k = c.all ? 'all' : 'any', l = (c[k] || []).map(function (x) { return condOk(x, known); }).filter(Boolean); if (!l.length) return null; if (l.length === 1) return l[0]; var o = {}; o[k] = l; return o; }
    if (!c.q || !known[c.q] || !c.op) return null;
    var out = { q: c.q, op: c.op }; if (c.v !== undefined && c.op !== 'answered' && c.op !== 'empty') out.v = c.v; return out;
  }
  A.normalizeQuestion = function (q, def, ctx) {
    q = Object.assign({}, q); var t = String(q.type || 'text').toLowerCase().trim().replace(/[\s-]+/g, '_'), key = ALIAS[t] || (SVY.MENU_BY_KEY[t] && !NATIVE_KEY[t] ? t : null) || NATIVE_KEY[t] || 'short';
    var base = SVY.newQuestion(key, 'x'), keep = {};
    ['label', 'desc', 'required', 'showIf', 'scope', 'id'].forEach(function (k) { if (q[k] !== undefined) keep[k] = q[k]; });
    var props = Object.assign({}, q); delete props.type;
    var nq = Object.assign({}, base, props, { type: base.type });
    // 별칭으로 정해진 하위 형식(드롭다운·이미지·장문 등)은 AI가 필드를 따로 주지 않았을 때 기본값 유지
    if (base.type === 'single' && q.display) nq.display = q.display; if (base.type === 'text' && q.format) nq.format = q.format;
    nq.id = String(keep.id || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 20) || ctx.prefix; var k0 = nq.id, n = 2; while (ctx.ids[nq.id]) nq.id = k0 + '_' + n++; ctx.ids[nq.id] = 1;
    nq.label = String(nq.label || q.title || '').trim(); if (keep.desc !== undefined) nq.desc = String(keep.desc);
    nq.scope = (ctx.basic || def.mode === 'general' || q.scope === 'common') ? 'common' : 'course';
    if (nq.type === 'block') delete nq.required; else if (keep.required != null) nq.required = !!keep.required;
    NUMKEYS.forEach(function (k) { if (nq[k] != null && nq[k] !== '') { var v = SVY.num(nq[k]); if (v == null) delete nq[k]; else nq[k] = v; } else delete nq[k]; });
    var T = nq.type;
    if (['single', 'multi', 'ranking', 'constsum'].indexOf(T) >= 0) {
      nq.options = normOptions(q.options || [], 'o', T === 'single' || T === 'multi');
      if (T !== 'multi') nq.options.forEach(function (o) { delete o.exclusive; });
      if (T !== 'single' && T !== 'multi') nq.options.forEach(function (o) { delete o.max; });
      if (T === 'ranking' && nq.top != null && nq.top > nq.options.length) nq.top = nq.options.length;
    } else delete nq.options;
    if (T === 'grid') { nq.rows = normOptions(q.rows, 'r'); nq.cols = normOptions(q.cols, 'c'); } else { delete nq.rows; delete nq.cols; }
    if (T === 'scale') { nq.scale = def.scales[q.scale] ? q.scale : (def.scales[nq.scale] ? nq.scale : 'likert5'); var sc = def.scales[nq.scale]; if (q.check && q.check.valid != null && def.mode !== 'general') { var v = q.check.valid; if (typeof v === 'string' && isNaN(Number(v))) { var f = sc.filter(function (o) { return o.label === v; })[0]; v = f ? f.v : v; } nq.check = { valid: Number(v) }; nq.required = true; } else delete nq.check; } else { delete nq.check; if (T !== 'scale') delete nq.scale; }
    if (T === 'text') { nq.maxLen = Math.min(nq.maxLen || 500, 5000); if (nq.format === 'text' || !nq.format) { nq.format = nq.format || 'text'; if (nq.multiline == null) nq.multiline = false; } }
    // 퀴즈 정답 검증: 맞지 않으면 제거
    if (nq.answer != null) {
      var okA = false, ans = nq.answer;
      if (T === 'single') { var oo = (nq.options || []).filter(function (o) { return o.id === ans || o.label === ans; })[0]; if (oo) { nq.answer = oo.id; okA = true; } }
      else if (T === 'multi' && Array.isArray(ans)) { var ids2 = ans.map(function (a) { var o = (nq.options || []).filter(function (z) { return z.id === a || z.label === a; })[0]; return o && o.id; }).filter(Boolean); if (ids2.length) { nq.answer = ids2; okA = true; } }
      else if (A.qQuizable && A.qQuizable(nq)) { okA = ans !== '' && !(Array.isArray(ans) && !ans.length) && T !== 'single' && T !== 'multi'; if (okA && (T === 'scale' || ['linear', 'rating', 'nps', 'slider'].indexOf(T) >= 0 || nq.format === 'number')) { var nv = SVY.num(ans); if (nv == null) okA = false; else nq.answer = nv; } }
      if (!okA) { delete nq.answer; delete nq.points; } else if (nq.points == null) nq.points = 1;
    } else delete nq.points;
    if (nq.showIf) nq.showIf = nq.showIf; else delete nq.showIf;
    Object.keys(nq).forEach(function (k) { if (nq[k] === null || nq[k] === undefined) delete nq[k]; });
    return nq;
  };
  A.normalizeDef = function (raw) {
    var d = raw && raw.def ? raw.def : (raw || {}), tpl = window.SVY_TEMPLATE.def, ctx = { ids: {} };
    var mode = (raw && raw.mode) || d.mode; mode = mode === 'general' ? 'general' : 'course';
    var def = { mode: mode, intro: Object.assign({}, d.intro || {}), scales: Object.assign({}, tpl.scales, d.scales || {}), basic: [], sections: [] };
    if (!Array.isArray(def.intro.notice)) def.intro.notice = [];
    def.intro.notice = def.intro.notice.filter(function (n) { return n && (n.k || n.v); }).map(function (n) { return { k: String(n.k || ''), v: String(n.v || '') }; });
    if (!def.intro.title && raw && raw.title) def.intro.title = raw.title;
    if (d.layout === 'single') def.layout = 'single';
    if (d.integrity && d.integrity.on) def.integrity = JSON.parse(JSON.stringify(d.integrity));   // 영역별 무작위 성실 응답 확인 설정 유지
    if (mode === 'course' && d.view === 'matrix') def.view = 'matrix';
    if (mode === 'course' && d.link && d.link.cols) def.link = A.cleanLink ? A.cleanLink(d.link) : d.link;
    if (d.limit && SVY.num(d.limit.max) >= 1) def.limit = { max: SVY.num(d.limit.max) };
    if (d.quiz && d.quiz.show) { def.quiz = { show: d.quiz.show === 'none' ? 'none' : 'score' }; if (SVY.num(d.quiz.passScore) != null) def.quiz.passScore = SVY.num(d.quiz.passScore); }
    if (d.features && d.features.ticket != null) def.features = { ticket: !!d.features.ticket };
    (d.basic || []).forEach(function (q, i) { ctx.basic = true; ctx.prefix = 'B' + (i + 1); def.basic.push(A.normalizeQuestion(q, def, ctx)); });
    (d.sections || []).forEach(function (s, si) {
      var sec = { id: String(s.id || 'S' + (si + 1)).replace(/[^A-Za-z0-9_]/g, '') || 'S' + (si + 1), title: String(s.title || ''), note: String(s.note || ''), questions: [] };
      if (s.showIf) sec.showIf = s.showIf; ctx.basic = false;
      (s.questions || []).forEach(function (q, qi) { ctx.prefix = 'Q' + (si + 1) + '_' + (qi + 1); sec.questions.push(A.normalizeQuestion(q, def, ctx)); });
      def.sections.push(sec);
    });
    // 조건: 앞쪽 문항만 참조 가능
    var known = {}; def.basic.forEach(function (q) { known[q.id] = 1; });
    def.sections.forEach(function (s) {
      var sc = condOk(s.showIf, known); if (sc) s.showIf = sc; else delete s.showIf;
      s.questions.forEach(function (q) { var c = condOk(q.showIf, known); if (c) q.showIf = c; else delete q.showIf; known[q.id] = 1; });
    });
    def.basic.forEach(function (q) { var c = condOk(q.showIf, {}); if (c) q.showIf = c; else delete q.showIf; });
    var sg = (raw && raw.suggestions) || [];
    return { def: def, why: (raw && raw.why) || {}, summary: (raw && raw.summary) || '', mode_reason: (raw && raw.mode_reason) || '', title: (raw && raw.title) || def.intro.title || '',
      suggestions: sg.filter(function (g) { return g && g.title && Array.isArray(g.ops) && g.ops.length; }).map(function (g, i) { return { id: String(g.id || 'g' + (i + 1)), title: String(g.title), reason: String(g.reason || ''), ops: g.ops, applied: false, def: !!g.default }; }),
      issues: ((raw && raw.issues) || []).map(String), notes: ((raw && raw.notes) || []).map(String) };
  };
  // 제안 작업 적용 → 새 정규화 def 반환(실패 시 오류)
  function findQ(def, id) { var all = SVY.allQuestions(def); for (var i = 0; i < all.length; i++) if (all[i].q.id === id) return all[i]; return null; }
  function applyOps(def, ops) {
    var d = JSON.parse(JSON.stringify(def)), ctx = { ids: {}, basic: false, prefix: 'Q' };
    SVY.allQuestions(d).forEach(function (x) { ctx.ids[x.q.id] = 1; });
    var done = 0;
    ops.forEach(function (o) {
      if (o.op === 'add_question') { var s = d.sections.filter(function (z) { return z.id === o.section; })[0] || d.sections[d.sections.length - 1]; if (!s) return; var q = A.normalizeQuestion(o.q || {}, d, ctx), at = (s.questions || []).findIndex(function (z) { return z.id === o.after; }); s.questions.splice(at >= 0 ? at + 1 : s.questions.length, 0, q); done++; }
      else if (o.op === 'replace_question') { var f = findQ(d, o.qid); if (!f) return; var list = f.section ? f.section.questions : d.basic, ix = list.indexOf(f.q); delete ctx.ids[f.q.id]; var nq = A.normalizeQuestion(Object.assign({ id: f.q.id }, o.q || {}), d, Object.assign(ctx, { basic: !f.section })); if (f.q.showIf && !nq.showIf) nq.showIf = f.q.showIf; list[ix] = nq; done++; }
      else if (o.op === 'remove_question') { var g = findQ(d, o.qid); if (!g) return; var l2 = g.section ? g.section.questions : d.basic; l2.splice(l2.indexOf(g.q), 1); done++; }
      else if (o.op === 'add_section') { var sec = o.section || {}, ns = { id: String(sec.id || 'S' + (d.sections.length + 1)).replace(/[^A-Za-z0-9_]/g, ''), title: String(sec.title || ''), note: String(sec.note || ''), questions: [] }; while (d.sections.some(function (z) { return z.id === ns.id; })) ns.id += '_'; ctx.basic = false; (sec.questions || []).forEach(function (q) { ns.questions.push(A.normalizeQuestion(q, d, ctx)); }); if (sec.showIf) ns.showIf = sec.showIf; var at2 = d.sections.findIndex(function (z) { return z.id === o.after; }); d.sections.splice(at2 >= 0 ? at2 + 1 : d.sections.length, 0, ns); done++; }
      else if (o.op === 'set' && typeof o.path === 'string' && /^(limit|quiz|features|layout|intro)(\.[A-Za-z0-9_]+)*$/.test(o.path)) { var ps = o.path.split('.'), t = d; ps.slice(0, -1).forEach(function (p) { t[p] = t[p] && typeof t[p] === 'object' ? t[p] : {}; t = t[p]; }); t[ps[ps.length - 1]] = o.value; done++; }
    });
    if (!done) throw new Error('적용할 수 있는 변경이 없습니다.');
    // 조건 정리
    var known = {}; d.basic.forEach(function (q) { known[q.id] = 1; });
    d.sections.forEach(function (s) { var sc = condOk(s.showIf, known); if (sc) s.showIf = sc; else delete s.showIf; s.questions.forEach(function (q) { var c = condOk(q.showIf, known); if (c) q.showIf = c; else delete q.showIf; known[q.id] = 1; }); });
    return d;
  }

  /* ───────────── 미리보기 ───────────── */
  function condText(c, def) {
    if (!c) return '';
    if (c.all || c.any) return (c.all || c.any).map(function (x) { return condText(x, def); }).join(c.all ? ' 그리고 ' : ' 또는 ');
    var f = findQ(def, c.q), q = f && f.q, lab = q ? (q.id + (q.label ? '「' + String(q.label).slice(0, 14) + '」' : '')) : c.q, v = c.v;
    if (q && (q.type === 'single' || q.type === 'multi')) { var o = (q.options || []).filter(function (z) { return z.id === v; })[0]; if (o) v = o.label; }
    if (q && q.type === 'scale') { var s = ((def.scales || {})[q.scale || 'likert5'] || []).filter(function (z) { return z.v === v; })[0]; if (s) v = s.label; }
    var op = { eq: '= ', ne: '≠ ', has: '선택: ', nhas: '미선택: ', gt: '> ', gte: '≥ ', lt: '< ', lte: '≤ ', answered: '응답함', empty: '응답 안 함' }[c.op] || c.op;
    return lab + ' ' + op + (c.op === 'answered' || c.op === 'empty' ? '' : v);
  }
  function frame(inner, theme) {
    var v = SVY.themeVars(theme || {}), style = Object.keys(v).map(function (k) { return k + ':' + v[k]; }).join(';');
    return '<div class="phone"><div class="preview" style="' + style + '"><div class="hdr"><div class="hdr-in"><img class="logo" src="aseasurvey-logo.png" alt=""></div></div><div style="padding:12px">' + inner + '</div></div></div>';
  }
  function pageNames(def) { var l = [{ n: '안내' }]; if (def.basic.length) l.push({ n: '기본 정보', basic: true }); def.sections.forEach(function (s) { l.push({ n: s.title || '영역', s: s }); }); return l; }

  /* ───────────── 화면 ───────────── */
  var st = A.ext.ai = { step: 'input', files: [], text: '', model: MODELS[0][0], hint: 'auto', instr: '', busy: false, err: '', p: null, prev: null, pv: 0, scratch: {} };
  function fileChips() {
    return st.files.length ? '<div class="chips">' + st.files.map(function (f, i) { return '<span class="chip">' + I(f.kind === 'text' ? 'file' : 'eye', 13) + E(f.name) + ' <small>' + ({ text: (f.text || '').length.toLocaleString() + '자', image: '이미지', pdf: 'PDF ' + SVY.fmtBytes(f.size) }[f.kind]) + '</small><button data-act="aifdel" data-i="' + i + '" aria-label="제거">' + I('x', 12) + '</button></span>'; }).join('') + '</div>' : '';
  }
  function typeChips(def) {
    var cnt = {}; SVY.allQuestions(def).forEach(function (x) { var l = SVY.typeLabel(x.q); cnt[l] = (cnt[l] || 0) + 1; });
    return Object.keys(cnt).map(function (k) { return '<span class="tag blue">' + E(k) + ' ' + cnt[k] + '</span>'; }).join(' ');
  }
  function inputHtml(mode) {
    return '<div class="grid g2"><div><div class="panel"><h3>' + I('sparkle', 16) + ' 1단계 · 자료 입력</h3><p class="panel-sub">자료를 읽은 AI가 <b>바로 설문을 만들지 않고</b>, 알맞은 문항 형식을 추천한 「설계 제안」과 학생 화면 예시를 먼저 보여 드립니다. 확인·수정 후 「만들기」를 누를 때 설문이 생성됩니다.</p>' +
      '<label class="f">파일 올리기 (여러 개 가능) — 이미지(jpg·png) · PDF · docx · hwpx · xlsx · csv · txt</label><div class="drop" id="aidrop">' + I('upload', 22) + '<div style="margin-top:4px">파일을 끌어다 놓거나 눌러서 선택</div></div><input type="file" id="aifile" class="hide" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.docx,.hwpx,.xlsx,.xls,.csv,.txt,.md">' + fileChips() +
      '<label class="f">내용 붙여넣기 / 설계 요청</label><textarea class="fld" id="aitext" rows="9" placeholder="예) 2026 항공 진로 박람회 만족도 조사. 참석 구분, 프로그램별 만족도, 추천 의향, 개선 의견, 경품 추첨 참여 연락처(동의 포함)를 받고 싶습니다.">' + E(st.text) + '</textarea>' +
      '<div class="grid g2"><div><label class="f">응답 방식</label><select class="fld" id="aihint"><option value="auto"' + (st.hint === 'auto' ? ' selected' : '') + '>AI가 판단</option><option value="general"' + (st.hint === 'general' ? ' selected' : '') + '>1인 1회 (행사·교직원 등)</option><option value="course"' + (st.hint === 'course' ? ' selected' : '') + '>목록 항목별 반복 (연동 목록)</option></select></div>' +
      '<div><label class="f">AI 모델</label><select class="fld" id="aimodel">' + MODELS.map(function (m) { return '<option value="' + m[0] + '"' + (st.model === m[0] ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-act="aitest">AI 연결 테스트</button><span class="sp"></span>' + (mode === 'create' ? '<button class="btn btn-ghost" data-act="aicancel">취소</button>' : '') + '<button class="btn btn-primary" data-act="airun" ' + (st.busy ? 'disabled' : '') + '>' + I('sparkle', 16) + ' 설계 제안 받기</button></div></div></div>' +
      '<div><div class="panel"><h3>진행</h3><div id="aires">' + (st.busy ? '<div class="loading">AI가 자료를 읽고 설계 제안을 작성하는 중입니다… (보통 20~90초)</div>' : st.err ? '<div class="msg err">' + I('alert', 18) + '<div>' + E(st.err) + '</div></div>' : '<div class="t-empty">자료를 넣고 「설계 제안 받기」를 누르면<br>추천 형식 · 이유 · 학생 화면 예시가 표시됩니다.<br><span style="font-size:12px">이 단계에서는 설문이 만들어지지 않습니다.</span></div>') + '</div></div></div></div>';
  }
  function reviewHtml(mode) {
    var p = st.p, d = p.def, lint = A.lintDef(d), gen = d.mode === 'general';
    var h = '<div class="aibar"><span class="wz done">1 자료 입력</span><span class="wz on">2 제안 확인·수정</span><span class="wz">3 만들기</span><span class="sp"></span><button class="btn btn-ghost btn-sm" data-act="aiback">' + I('left', 14) + ' 자료 다시 입력</button></div>' +
      '<div class="grid" style="grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:14px;align-items:start"><div>';
    h += '<div class="panel"><h3>설계 제안</h3><div class="row" style="margin-bottom:6px"><label class="f" style="margin:0">설문 제목</label><input class="fld sp" id="aititle" value="' + E(d.intro.title || p.title) + '"></div>' +
      '<p style="margin:6px 0">' + E(p.summary) + '</p><div class="msg" style="margin:8px 0"><div><b>추천 응답 방식: ' + (gen ? '1인 1회' : '목록 항목별 반복') + '</b>' + (p.mode_reason ? '<br><span class="muted">' + E(p.mode_reason) + '</span>' : '') + '</div></div>' +
      '<div class="row"><select class="fld fld-auto" id="aimodeSel"><option value="general"' + (gen ? ' selected' : '') + '>일반 설문</option><option value="course"' + (!gen ? ' selected' : '') + '>과목별 평가</option></select><span class="muted" style="font-size:12px">유형을 바꾸면 미리보기도 바뀝니다.</span></div>' +
      '<div style="margin-top:8px"><span class="muted" style="font-size:12px">형식 구성</span><br>' + typeChips(d) + '</div>' +
      '<div style="margin-top:8px;font-size:13px">' + E(d.sections.length + '개 영역 · 문항 ' + SVY.allQuestions(d).filter(function (x) { return x.q.type !== 'block'; }).length + '개') + (d.limit ? ' · 선착순 ' + d.limit.max + '명' : '') + (d.quiz ? ' · 퀴즈 점수 표시' : '') + (d.features && d.features.ticket ? ' · 추첨번호 발급' : '') + '</div></div>';
    if (lint.errs.length || lint.warns.length) h += '<div class="msg ' + (lint.errs.length ? 'err' : 'warn') + '">' + I('alert', 18) + '<div>' + (lint.errs.length ? '<b>점검 오류 ' + lint.errs.length + '건</b> — ' + lint.errs.slice(0, 4).map(E).join(' / ') + '<br>' : '') + lint.warns.slice(0, 3).map(E).join('<br>') + '</div></div>';
    if (p.issues.length) h += '<div class="panel" style="background:#FEF7E0"><h3>입력 자료에서 발견한 문제점 (' + p.issues.length + ')</h3><ul style="margin:0;padding-left:18px">' + p.issues.map(function (x) { return '<li>' + E(x) + '</li>'; }).join('') + '</ul></div>';
    if (p.notes.length) h += '<div class="panel"><h3>AI 메모</h3><ul style="margin:0;padding-left:18px">' + p.notes.map(function (x) { return '<li>' + E(x) + '</li>'; }).join('') + '</ul></div>';
    if (p.suggestions.length) h += '<div class="panel"><h3>' + I('sparkle', 15) + ' AI 개선 제안 (' + p.suggestions.length + ')</h3><p class="panel-sub">선택해서 반영할 수 있습니다. 반영하면 오른쪽 예시에 바로 나타납니다.</p>' + p.suggestions.map(function (g, i) { return '<div class="sugg' + (g.applied ? ' on' : '') + '"><div class="sp"><b>' + E(g.title) + '</b>' + (g.def && !g.applied ? ' <span class="tag blue">권장</span>' : '') + '<div class="muted" style="font-size:12.5px">' + E(g.reason) + '</div><div class="muted" style="font-size:12px">변경 ' + g.ops.length + '건: ' + g.ops.map(function (o) { return ({ add_question: '문항 추가', replace_question: '형식 변경', remove_question: '문항 삭제', add_section: '영역 추가', set: '설정' })[o.op] || o.op; }).join(', ') + '</div></div>' + (g.applied ? '<span class="badge badge-green">반영됨</span>' : '<button class="btn btn-secondary btn-sm" data-act="aisugg" data-i="' + i + '">반영</button>') + '</div>'; }).join('') + '</div>';
    // 직접 편집
    h += '<div class="panel"><h3>' + I('edit', 15) + ' 직접 수정</h3><p class="panel-sub">형식·문구·필수 여부·순서를 바로 고칠 수 있습니다. 선택지·정원·조건 등 세부 설정은 만든 뒤 「문항」 탭에서 편집합니다.</p>';
    if (d.basic.length) h += '<div class="muted" style="font-size:12px;margin-top:6px">기본 정보</div>' + d.basic.map(function (q, i) { return editRow(q, -1, i); }).join('');
    d.sections.forEach(function (s, si) { h += '<div class="aisec"><input class="fld" data-asf="title" data-si="' + si + '" value="' + E(s.title) + '" placeholder="영역 제목"><button class="btn btn-ghost btn-sm" data-act="asup" data-si="' + si + '">' + I('up', 13) + '</button><button class="btn btn-ghost btn-sm" data-act="asdn" data-si="' + si + '">' + I('down', 13) + '</button><button class="btn btn-ghost btn-sm" style="color:var(--red)" data-act="asdel" data-si="' + si + '">' + I('trash', 13) + '</button></div>' + (s.showIf ? '<div class="muted" style="font-size:12px;margin:2px 0">조건부 영역: ' + E(condText(s.showIf, d)) + '</div>' : '') + s.questions.map(function (q, qi) { return editRow(q, si, qi); }).join('') + '<button class="btn btn-ghost btn-sm" data-act="aqadd" data-si="' + si + '">' + I('plus', 13) + ' 문항 추가</button>'; });
    h += '</div>';
    // AI 재요청
    h += '<div class="panel"><h3>AI에게 수정 요청</h3><textarea class="fld" id="aiinstr" rows="3" placeholder="예) 만족도 문항은 별점으로 바꿔 주세요 / 외부인에게만 소속 기관을 묻는 영역을 추가해 주세요 / 선착순 100명으로 제한해 주세요">' + E(st.instr) + '</textarea><div class="row" style="margin-top:8px"><button class="btn btn-ghost btn-sm" data-act="aiundo" ' + (st.prev ? '' : 'disabled') + '>이전 안으로 되돌리기</button><span class="sp"></span><button class="btn btn-secondary" data-act="aire" ' + (st.busy ? 'disabled' : '') + '>' + I('refresh', 15) + ' 수정 요청하기</button></div>' + (st.err ? '<div class="msg err">' + I('alert', 18) + '<div>' + E(st.err) + '</div></div>' : '') + '</div>';
    h += '<div class="panel final"><div class="row"><div class="sp"><b>' + (mode === 'create' ? '이 구성으로 설문을 만듭니다' : '현재 설문에 적용합니다') + '</b><div class="muted" style="font-size:12.5px">' + (mode === 'create' ? '아직 아무것도 만들어지지 않았습니다. 「만들기」를 누르면 설문이 생성되고 문항 탭으로 이동합니다.' : '적용 후 문항 탭에서 확인하고 우측 상단 「저장」을 눌러야 반영됩니다.') + '</div></div>' + (mode === 'create' ? '<label class="chk" style="margin:0"><input type="checkbox" id="aitpl"> 이 구성을 양식 라이브러리에도 저장</label>' : '') + '<button class="btn btn-secondary btn-sm" data-act="aijson">JSON</button><button class="btn btn-primary" data-act="' + (mode === 'create' ? 'aimake' : 'aiapply') + '" style="min-width:150px">' + I('check', 16) + ' ' + (mode === 'create' ? '만들기(개발 시작)' : '현재 설문에 적용') + '</button></div></div>';
    h += '</div><div class="aipvcol"><div class="panel" style="position:sticky;top:8px"><h3>학생 화면 예시</h3><p class="panel-sub">실제 화면과 같은 방식으로 표시됩니다. 눌러서 입력해 볼 수 있습니다(저장되지 않음).</p><div class="pvtabs" id="pvtabs"></div><div id="aipv"></div></div></div></div>';
    return h;
  }
  function editRow(q, si, qi) {
    var key = A.qMenuKey(q), why = (st.p.why || {})[q.id];
    return '<div class="aiq" data-si="' + si + '" data-qi="' + qi + '"><div class="row" style="gap:6px;flex-wrap:nowrap"><span class="qid">' + E(q.id) + '</span><select class="fld fld-fmt" data-aqf="menu">' + SVY.MENU.map(function (g) { return '<optgroup label="' + E(g.group) + '">' + g.items.map(function (it) { return '<option value="' + it.key + '"' + (it.key === key ? ' selected' : '') + '>' + E(it.label) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select><input class="fld sp" data-aqf="label" value="' + E(q.label || '') + '" placeholder="' + (q.type === 'block' ? '안내 제목' : '문항 내용') + '">' + (q.type === 'block' ? '' : '<label class="chk" title="필수"><input type="checkbox" data-aqf="required"' + (q.required ? ' checked' : '') + '>필수</label>') + '<button class="btn btn-ghost btn-sm" data-act="aqup">' + I('up', 13) + '</button><button class="btn btn-ghost btn-sm" data-act="aqdn">' + I('down', 13) + '</button><button class="btn btn-ghost btn-sm" style="color:var(--red)" data-act="aqdel">' + I('trash', 13) + '</button></div>' +
      (why ? '<div class="why">' + I('sparkle', 12) + ' ' + E(why) + '</div>' : '') + (q.showIf ? '<div class="why">조건부: ' + E(condText(q.showIf, st.p.def)) + '</div>' : '') + '</div>';
  }
  function renderPreview(box) {
    var d = st.p.def, pages = pageNames(d), cur = Math.min(st.pv, pages.length - 1), theme = (A.work && A.work.theme) || {};
    box.querySelector('#pvtabs').innerHTML = pages.map(function (pg, i) { return '<button class="pvtab' + (i === cur ? ' on' : '') + '" data-act="aipvt" data-i="' + i + '">' + E(pg.n.slice(0, 10)) + '</button>'; }).join('');
    var pv = box.querySelector('#aipv'), inner = '';
    function qhtml(q) {
      var cap = '<div class="aicap"><span class="tag blue">' + E(SVY.typeLabel(q)) + '</span>' + (q.showIf ? ' <span class="tag">조건부</span>' : '') + (q.answer != null ? ' <span class="tag">정답 ' + (q.points || 1) + '점</span>' : '') + ((st.p.why || {})[q.id] ? ' <span class="muted">' + E(st.p.why[q.id]) + '</span>' : '') + '</div>';
      return SVY.Form.html(Object.assign({}, q, { showIf: undefined }), { def: d, a: st.scratch, c: st.scratch, scopeId: 'pv', counts: {}, seed: 1, busy: env.busy, badge: null }) + cap;
    }
    if (cur === 0) { pv.innerHTML = '<div class="phone">' + A.introPreview(d, theme) + '</div>'; return; }
    var pg = pages[cur];
    if (pg.basic) inner = '<div class="card"><h2 class="title" style="font-size:19px">기본 정보</h2>' + d.basic.map(qhtml).join('') + '</div>';
    else inner = (d.mode === 'general' ? '' : '<div class="msg" style="margin:0 0 8px">' + I('info', 16) + '<div>과목별 평가에서는 반을 고른 뒤, 이 영역이 <b>과목마다 반복</b>해 펼쳐집니다.</div></div>') + (pg.s.showIf ? '<div class="msg warn" style="margin:0 0 8px">' + I('info', 16) + '<div>조건부 영역: ' + E(condText(pg.s.showIf, d)) + '</div></div>' : '') + '<div class="card"><h2 class="title" style="font-size:19px">' + E(pg.s.title) + '</h2>' + (pg.s.note ? '<p class="muted" style="margin:4px 0">' + E(pg.s.note) + '</p>' : '') + pg.s.questions.map(qhtml).join('') + '</div>';
    pv.innerHTML = frame(inner, theme);
    var root = pv.querySelector('.phone'); SVY.Form.attach(root, env); if (root._initSigs) root._initSigs();
  }
  var env = { busy: {}, toast: function (m) { A.toast(m); }, counts: {}, seed: 1, onChange: function () {}, getAns: function () { return st.scratch; }, getCommon: function () { return st.scratch; } };
  Object.defineProperty(env, 'def', { get: function () { return st.p && st.p.def; } });
  Object.defineProperty(env, 'qmap', { get: function () { return st.p ? SVY.questionMap(st.p.def) : {}; } });

  A.renderAI = function (box, mode, meta) {
    box.innerHTML = st.step === 'review' && st.p ? reviewHtml(mode) : inputHtml(mode);
    if (st.step === 'review' && st.p) renderPreview(box);
    var fi = box.querySelector('#aifile'), dr = box.querySelector('#aidrop');
    async function load(files) {
      for (var i = 0; i < files.length; i++) {
        if (st.files.length >= 8) { A.toast('파일은 최대 8개까지 올릴 수 있습니다.', 'err'); break; }
        try { var f = await readInput(files[i]); st.files.push(f); } catch (e) { A.toast(e.message, 'err'); }
      }
      A.renderAI(box, mode, meta);
    }
    if (dr) { dr.onclick = function () { fi.click(); }; fi.onchange = function () { load(Array.from(fi.files)); fi.value = ''; }; dr.ondragover = function (e) { e.preventDefault(); dr.classList.add('over'); }; dr.ondragleave = function () { dr.classList.remove('over'); }; dr.ondrop = function (e) { e.preventDefault(); dr.classList.remove('over'); load(Array.from(e.dataTransfer.files)); }; }
    var T = function (id, fn) { var el = box.querySelector(id); if (el) fn(el); };
    T('#aitext', function (el) { el.oninput = function () { st.text = el.value; }; });
    T('#aihint', function (el) { el.onchange = function () { st.hint = el.value; }; });
    T('#aimodel', function (el) { el.onchange = function () { st.model = el.value; }; });
    T('#aiinstr', function (el) { el.oninput = function () { st.instr = el.value; }; });
    T('#aititle', function (el) { el.oninput = function () { st.p.def.intro.title = el.value; st.p.title = el.value; }; });
    T('#aimodeSel', function (el) { el.onchange = function () { st.p.def.mode = el.value; SVY.allQuestions(st.p.def); if (el.value === 'general') SVY.allQuestions(st.p.def).forEach(function (x) { x.q.scope = 'common'; }); A.renderAI(box, mode, meta); }; });

    async function run(reqInstr) {
      var content = [], textParts = [];
      st.files.forEach(function (f) {
        if (f.kind === 'image') { content.push({ type: 'text', text: '[이미지: ' + f.name + ']' }); content.push({ type: 'image', source: { type: 'base64', media_type: f.mime, data: f.b64 } }); }
        else if (f.kind === 'pdf') { content.push({ type: 'text', text: '[PDF: ' + f.name + ']' }); content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.b64 } }); }
        else textParts.push('[파일: ' + f.name + ']\n' + trimInput(f.text));
      });
      if (st.text.trim()) textParts.push('[붙여넣은 내용·요청]\n' + trimInput(st.text));
      if (reqInstr) textParts.push('[현재 설계]\n' + JSON.stringify({ mode: st.p.def.mode, def: st.p.def }) + '\n\n[수정 요청]\n' + reqInstr + '\n\n위 수정 요청을 반영한 전체 설계 제안 JSON을 출력하십시오. 요청과 무관한 문항·ID·문구는 그대로 유지합니다.');
      if (st.hint !== 'auto') textParts.push('[설문 유형 지정] ' + (st.hint === 'general' ? 'general (일반 설문)' : 'course (과목별 평가)') + '으로 설계하십시오.');
      textParts.push('위 자료를 바탕으로 「설계 제안」 JSON 을 작성하십시오.');
      content.push({ type: 'text', text: textParts.join('\n\n') });
      st.busy = true; st.err = ''; A.renderAI(box, mode, meta);
      try {
        var models = [st.model].concat(MODELS.map(function (m) { return m[0]; }).filter(function (m) { return m !== st.model; })), text = null, lastErr;
        for (var i = 0; i < models.length && text == null; i++) { try { text = await callAI(buildSystem(), content, models[i]); } catch (er) { lastErr = er; if (!(er.status === 404 || /model/i.test(er.message))) break; } }
        if (text == null) throw lastErr;
        var res = A.normalizeDef(parseJson(text)); A.ext.aiRaw = text;
        if (reqInstr && st.p) { st.prev = st.p; st.instr = ''; }
        st.p = res; st.step = 'review'; st.pv = 0; st.scratch = {};
      } catch (er) { st.err = er.message + (/image|document|media/i.test(er.message) ? ' (현재 AI 제공자가 이미지·PDF 입력을 지원하지 않을 수 있습니다. docx·텍스트로 올려 보십시오.)' : ''); }
      st.busy = false; A.renderAI(box, mode, meta);
    }
    box.onclick = async function (e) {
      var t = e.target.closest('[data-act]'); if (!t || e.target.closest('#aipv .q')) return; var act = t.getAttribute('data-act'), i = Number(t.getAttribute('data-i'));
      var row = t.closest('.aiq'), si = row ? Number(row.getAttribute('data-si')) : Number(t.getAttribute('data-si')), qi = row ? Number(row.getAttribute('data-qi')) : -1, d = st.p && st.p.def;
      function list() { return si < 0 ? d.basic : d.sections[si].questions; }
      function redo() { A.renderAI(box, mode, meta); }
      if (act === 'aifdel') { st.files.splice(i, 1); return redo(); }
      if (act === 'airun') { if (!st.files.length && !st.text.trim()) return A.toast('파일을 올리거나 내용·요청을 입력해 주십시오.', 'err'); return run(''); }
      if (act === 'aire') { if (!st.instr.trim()) return A.toast('수정 요청 내용을 입력해 주십시오.', 'err'); return run(st.instr.trim()); }
      if (act === 'aiback') { st.step = 'input'; return redo(); }
      if (act === 'aiundo') { if (st.prev) { st.p = st.prev; st.prev = null; redo(); } return; }
      if (act === 'aipvt') { st.pv = i; return renderPreview(box); }
      if (act === 'aisugg') { var g = st.p.suggestions[i]; try { st.p.def = applyOps(st.p.def, g.ops); g.applied = true; st.prev = null; redo(); } catch (er) { A.toast(er.message, 'err'); } return; }
      if (act === 'aqup' && qi > 0) { var a = list(); var x = a[qi]; a[qi] = a[qi - 1]; a[qi - 1] = x; return redo(); }
      if (act === 'aqdn' && qi < list().length - 1) { var b = list(), y = b[qi]; b[qi] = b[qi + 1]; b[qi + 1] = y; return redo(); }
      if (act === 'aqdel') { list().splice(qi, 1); return redo(); }
      if (act === 'aqadd') { var q = SVY.newQuestion('single', 'x'); var ids = {}; SVY.allQuestions(d).forEach(function (z) { ids[z.q.id] = 1; }); var n = 1; while (ids['Q' + n]) n++; q.id = 'Q' + n; q.label = '새 문항'; q.scope = d.mode === 'general' ? 'common' : 'course'; d.sections[si].questions.push(q); return redo(); }
      if (act === 'asup' && si > 0) { var s0 = d.sections[si]; d.sections[si] = d.sections[si - 1]; d.sections[si - 1] = s0; return redo(); }
      if (act === 'asdn' && si < d.sections.length - 1) { var s1 = d.sections[si]; d.sections[si] = d.sections[si + 1]; d.sections[si + 1] = s1; return redo(); }
      if (act === 'asdel') { d.sections.splice(si, 1); return redo(); }
      if (act === 'aijson') return A.modal('<h3>설문 정의 JSON</h3><pre class="code" style="max-height:60vh">' + E(JSON.stringify(st.p.def, null, 2)) + '</pre><div class="btn-row"><button class="btn btn-ghost" data-c="1">복사</button><button class="btn btn-primary" data-r="1">닫기</button></div>', function (bg, close) { bg.addEventListener('click', function (ev) { if (ev.target.closest('[data-c]')) A.copy(JSON.stringify(st.p.def, null, 2)); if (ev.target.closest('[data-r]')) close(); }); }, 'xl');
      if (act === 'aicancel') { location.hash = '#/'; return; }
      if (act === 'aiapply') { if (!await A.confirm('현재 설문에 적용', '현재 문항·안내문이 이 제안으로 교체됩니다. 적용 후 문항 탭에서 확인하고 우측 상단 「저장」을 눌러야 반영됩니다. (이전 내용은 버전 이력에 남습니다)', '적용', '취소')) return; A.work.def = st.p.def; A.markDirty(); A.go('questions'); return; }
      if (act === 'aimake') {
        var lint = A.lintDef(st.p.def), nq = SVY.allQuestions(st.p.def).filter(function (z) { return z.q.type !== 'block'; }).length;
        var ok = await A.confirm('설문을 만들까요?', '「' + E(st.p.def.intro.title || st.p.title) + '」 · ' + (st.p.def.mode === 'general' ? '1인 1회' : '목록 항목별 반복') + ' · 문항 ' + nq + '개<br>만든 뒤 문항 탭에서 세부 편집을 이어갈 수 있습니다.' + (lint.errs.length ? '<br><b style="color:var(--red)">점검 오류 ' + lint.errs.length + '건이 남아 있습니다.</b> (저장 전 문항 탭에서 해결)' : ''), '만들기', '돌아가기');
        if (!ok) return;
        var saveTpl = !!(document.getElementById('aitpl') && document.getElementById('aitpl').checked);
        try { var r = await A.rpc('svy_a_create', { p_title: (st.p.def.intro.title || st.p.title || (meta && meta.title) || 'AI 설계 설문'), p_semester: (meta && meta.semester) || '', p_def: st.p.def, p_theme: {} }); A.toast('설문을 만들었습니다.'); if (saveTpl && A.lib) { try { await A.lib.saveDialog(JSON.parse(JSON.stringify(st.p.def)), {}, { name: st.p.def.intro.title || st.p.title }); } catch (e3) {} } var keep = st.p; st.p = null; st.step = 'input'; st.files = []; st.text = ''; location.hash = '#/s/' + r.id + '/questions'; } catch (er) { A.toast(er.message, 'err'); }
      }
    };
    box.oninput = function (e) {
      var el = e.target, aq = el.getAttribute('data-aqf'), asf = el.getAttribute('data-asf');
      if (asf) { st.p.def.sections[Number(el.getAttribute('data-si'))][asf] = el.value; return; }
      if (!aq || aq === 'menu') return; var row = el.closest('.aiq'), si = Number(row.getAttribute('data-si')), qi = Number(row.getAttribute('data-qi')), q = (si < 0 ? st.p.def.basic : st.p.def.sections[si].questions)[qi];
      if (aq === 'label') q.label = el.value; else if (aq === 'required') q.required = el.checked;
    };
    box.onchange = function (e) {
      var el = e.target, aq = el.getAttribute('data-aqf'); if (!aq) return;
      var row = el.closest('.aiq'), si = Number(row.getAttribute('data-si')), qi = Number(row.getAttribute('data-qi')), q = (si < 0 ? st.p.def.basic : st.p.def.sections[si].questions)[qi];
      if (aq === 'menu') { A.qConvert(q, el.value); A.renderAI(box, mode, meta); }
      else if (aq === 'label' || aq === 'required') { var y = window.scrollY; renderPreview(box); window.scrollTo(0, y); }
    };
  };
  A.tabs.ai = function (box) { A.renderAI(box, 'tab'); };
  A.ext.aiCreate = function (meta) {
    A.view = 'ai-create'; A.cur = null; A.work = null; st.step = 'input'; st.p = null; st.err = '';
    A.shell('<div class="crumb"><a data-act="tolist">설문 목록</a> / AI로 설계</div><div class="pg-head"><h1>AI로 새 설문 설계</h1></div><div id="aibox"></div>');
    A.renderAI(document.getElementById('aibox'), 'create', meta);
  };
  A.ext.aiCall = callAI; A.ext.aiModels = MODELS;
  A.ext.aiParse = { schema: SCHEMA, docxXmlToText: docxXmlToText, readInput: readInput, normalize: A.normalizeDef, buildSystem: buildSystem, parseJson: parseJson, applyOps: applyOps, hwpxToText: hwpxToText };
})();
