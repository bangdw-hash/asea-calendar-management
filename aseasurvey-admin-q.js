'use strict';
/**
 * aseasurvey-admin-q.js — 범용 문항 편집기 (aseasurvey-admin-edit.js 의 문항 탭·점검을 대체)
 *  · 구글 설문지 형식 + 확장 형식 전체(SVY.MENU) 추가·변환·형식별 속성 편집
 *  · 표시 조건(분기): 문항·영역 단위, 여러 조건(모두/하나라도) 결합
 *  · 퀴즈 정답·배점, 선택지 정원, 선택지 순서 섞기, 설문 설정(유형·단계 구성·정원·점수 표시·추첨번호)
 *  · 문항마다 학생 화면과 같은 미리보기(SVY.Form 재사용)
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico, N = SVY.num;
  var OPEN = {};   // 펼쳐 둔 문항 ID
  var KNOWN = ['text', 'single', 'multi', 'scale', 'linear', 'rating', 'nps', 'slider', 'grid', 'ranking', 'constsum', 'date', 'time', 'file', 'signature', 'address', 'location', 'qr', 'consent', 'block'];
  var OPT_TYPES = ['single', 'multi', 'ranking', 'constsum'];
  var NUMERIC = ['linear', 'rating', 'nps', 'slider'];
  var PERSONAL = ['address', 'location', 'signature', 'file'];

  function H(t) { return A.help ? A.help(t) : ''; }
  function ensureDef() { return A.ensureDef(); }
  function isGen(d) { return (d || ensureDef()).mode === 'general'; }
  function allQ(d) { return SVY.allQuestions(d || ensureDef()); }
  function newId(prefix) { var ids = {}; allQ().forEach(function (x) { ids[x.q.id] = 1; }); var n = 1; while (ids[prefix + n]) n++; return prefix + n; }
  function quizable(q) { return NUMERIC.indexOf(q.type) >= 0 || q.type === 'single' || q.type === 'multi' || q.type === 'scale' || (q.type === 'text' && ['text', 'number', 'pattern'].indexOf(q.format || 'text') >= 0); }
  function hasAnswer(q) { return q.answer !== undefined && q.answer !== null; }

  function menuKey(q) {
    var t = q.type;
    if (t === 'text') { var f = q.format || 'text'; if (f === 'text') return (q.multiline != null ? q.multiline : !q.format) ? 'paragraph' : 'short'; return f === 'number' ? 'number' : f === 'email' ? 'email' : f === 'phone' ? 'phone' : f === 'url' ? 'url' : 'pattern'; }
    if (t === 'single') return q.display === 'dropdown' ? 'dropdown' : q.display === 'image' ? 'imagechoice' : 'single';
    if (t === 'scale') return q.scale === 'yesno' ? 'yesno' : 'scale5';
    if (t === 'date') return q.includeTime ? 'datetime' : 'date';
    if (t === 'grid') return q.multi ? 'gridmulti' : 'grid';
    if (t === 'file') return q.capture ? 'photo' : 'file';
    if (t === 'block') return 'block_' + (q.kind || 'text');
    return t;
  }
  function convert(q, key) {
    var it = SVY.MENU_BY_KEY[key]; if (!it) return;
    var nq = SVY.newQuestion(key, q.id), old = A.clone(q);
    nq.label = old.label || ''; if (old.desc) nq.desc = old.desc; nq.scope = old.scope; if (old.showIf) nq.showIf = old.showIf;
    if (it.type !== 'block' && old.type !== 'block') nq.required = !!old.required;
    if (OPT_TYPES.indexOf(it.type) >= 0 && OPT_TYPES.indexOf(old.type) >= 0 && old.options) nq.options = old.options.map(function (o) { return { id: o.id, label: o.label }; });
    if (it.type === 'grid' && old.type === 'grid') { nq.rows = old.rows; nq.cols = old.cols; }
    if (it.type === 'scale' && old.type === 'scale' && key === 'scale5' && old.check) nq.check = old.check;
    Object.keys(q).forEach(function (k) { delete q[k]; }); Object.assign(q, nq);
  }

  A.qConvert = convert; A.qMenuKey = menuKey; A.qQuizable = quizable;

  /* ───────────── 조건(분기) 편집 ───────────── */
  var OPLAB = { eq: '같다', ne: '다르다', has: '선택했다', nhas: '선택하지 않았다', gt: '보다 크다', gte: '이상이다', lt: '보다 작다', lte: '이하이다', answered: '응답했다', empty: '응답하지 않았다' };
  function opsFor(src) {
    var t = src.type;
    if (t === 'single') return ['eq', 'ne', 'answered', 'empty'];
    if (t === 'multi') return ['has', 'nhas', 'answered', 'empty'];
    if (t === 'scale' || NUMERIC.indexOf(t) >= 0 || (t === 'text' && src.format === 'number')) return ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'answered', 'empty'];
    if (t === 'text' || t === 'date' || t === 'time') return ['eq', 'ne', 'answered', 'empty'];
    return ['answered', 'empty'];
  }
  function defaultVal(src, op) {
    if (op === 'answered' || op === 'empty') return undefined;
    if (src.type === 'single' || src.type === 'multi') return ((src.options || [])[0] || {}).id;
    if (src.type === 'scale') return ((SVY.scaleOf(ensureDef(), src)[0]) || {}).v;
    if (NUMERIC.indexOf(src.type) >= 0 || src.format === 'number') return 0;
    return '';
  }
  function condSources(owner) {
    var d = ensureDef(), gen = isGen(d), out = [], list = allQ(d);
    var ownerCommon = !!(owner.q && (gen || owner.basic || owner.q.scope === 'common'));
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      if (owner.q && x.q === owner.q) break;
      if (owner.sec && x.section === owner.sec) break;
      if (['block', 'file', 'signature', 'address', 'location', 'qr', 'grid', 'ranking', 'constsum'].indexOf(x.q.type) >= 0) continue;
      if (ownerCommon && !gen && x.scope === 'course') continue;   // 설문 1회 응답 문항은 과목별 문항을 조건으로 쓸 수 없음
      out.push(x.q);
    }
    return out;
  }
  function parseCond(cond) {
    if (!cond) return { mode: 'all', list: [], complex: false };
    var list = cond.all || cond.any || [cond], mode = cond.any ? 'any' : 'all';
    return { mode: mode, list: list, complex: list.some(function (c) { return !c || c.all || c.any || (c.q && !c.op); }) };
  }
  function condHtml(target, owner, tkey) {
    var pc = parseCond(target.showIf), srcs = condSources(owner);
    var h = '<div class="subpanel" data-ct="' + tkey + '"><div class="row"><b>조건에 따라 보이기</b>' + H('앞 문항의 답에 따라 이 ' + (owner.sec ? '영역' : '문항') + '을 보이게 합니다. 예: 참석 구분에서 「외부인」을 고른 사람에게만 「소속 기관」을 묻습니다. (이전 이름: 분기·표시 조건)') + '<span class="hint">조건을 만족할 때만 이 ' + (owner.sec ? '영역' : '문항') + '이 보입니다.</span></div>';
    if (pc.complex) {
      h += '<div class="msg warn" style="margin:6px 0">' + I('alert', 16) + '<div>이전 방식 또는 복합 조건입니다. 아래 「JSON 편집」에서 수정하거나, 「조건 지우기」 후 새로 설정할 수 있습니다.<br><code>' + E(JSON.stringify(target.showIf)) + '</code></div></div><button class="btn btn-ghost btn-sm" data-act="cclear">조건 지우기</button></div>';
      return h;
    }
    if (pc.list.length > 1) h += '<div class="row" style="margin:6px 0"><select class="fld fld-auto" data-cmode><option value="all"' + (pc.mode === 'all' ? ' selected' : '') + '>모든 조건을 만족할 때</option><option value="any"' + (pc.mode === 'any' ? ' selected' : '') + '>하나라도 만족할 때</option></select></div>';
    pc.list.forEach(function (c, k) {
      var src = srcs.filter(function (x) { return x.id === c.q; })[0], ops = src ? opsFor(src) : [];
      h += '<div class="cond-row" data-ci="' + k + '"><select class="fld" data-cf="q">' + (src ? '' : '<option value="' + E(c.q) + '" selected>(삭제됨) ' + E(c.q) + '</option>') + srcs.map(function (x) { return '<option value="' + E(x.id) + '"' + (x.id === c.q ? ' selected' : '') + '>' + E(x.id) + ' · ' + E(String(x.label || SVY.typeLabel(x)).slice(0, 28)) + '</option>'; }).join('') + '</select>' +
        '<select class="fld" data-cf="op">' + ops.map(function (o) { return '<option value="' + o + '"' + (o === c.op ? ' selected' : '') + '>' + OPLAB[o] + '</option>'; }).join('') + '</select>' +
        (src ? valInput(src, c) : '') + '<button class="btn btn-ghost btn-sm" data-act="cdel" style="color:var(--red)" aria-label="조건 삭제">' + I('x', 14) + '</button></div>';
    });
    h += '<button class="btn btn-secondary btn-sm" data-act="cadd"' + (srcs.length ? '' : ' disabled') + '>' + I('plus', 14) + ' ' + (pc.list.length ? '조건 추가' : '조건 설정') + '</button>' + (srcs.length ? '' : ' <span class="hint">앞쪽에 조건으로 쓸 수 있는 문항이 없습니다.</span>') + '</div>';
    return h;
  }
  function valInput(src, c) {
    if (c.op === 'answered' || c.op === 'empty') return '';
    if (src.type === 'single' || src.type === 'multi') return '<select class="fld" data-cf="v">' + (src.options || []).map(function (o) { return '<option value="' + E(o.id) + '"' + (String(c.v) === o.id ? ' selected' : '') + '>' + E(o.label) + '</option>'; }).join('') + '</select>';
    if (src.type === 'scale') return '<select class="fld" data-cf="v">' + SVY.scaleOf(ensureDef(), src).map(function (o) { return '<option value="' + o.v + '"' + (Number(c.v) === o.v ? ' selected' : '') + '>' + o.v + ' · ' + E(o.label) + '</option>'; }).join('') + '</select>';
    if (NUMERIC.indexOf(src.type) >= 0 || src.format === 'number') return '<input class="fld" type="number" data-cf="v" value="' + E(c.v == null ? '' : c.v) + '">';
    return '<input class="fld" data-cf="v" value="' + E(c.v == null ? '' : c.v) + '">';
  }
  function setClauses(target, mode, list) { if (!list.length) delete target.showIf; else if (list.length === 1) target.showIf = list[0]; else { var o = {}; o[mode] = list; target.showIf = o; } }

  /* ───────────── 형식별 속성 ───────────── */
  function fs(q, name, label, ph, cls) { return '<div class="' + (cls || 'sp') + '"><label class="f">' + label + '</label><input class="fld" data-qf="' + name + '" data-k="s" value="' + E(q[name] == null ? '' : q[name]) + '" placeholder="' + E(ph || '') + '"></div>'; }
  function fnum(q, name, label, ph) { return '<div><label class="f">' + label + '</label><input class="fld fld-sm" type="number" data-qf="' + name + '" data-k="n" value="' + E(q[name] == null ? '' : q[name]) + '" placeholder="' + E(ph || '') + '"></div>'; }
  function fb(q, name, label, dflt) { var v = q[name] == null ? !!dflt : !!q[name]; return '<label class="chk"><input type="checkbox" data-qf="' + name + '" data-k="b"' + (v ? ' checked' : '') + '> ' + label + '</label>'; }
  function fsel(q, name, label, list, dflt) { var cur = q[name] == null ? dflt : q[name]; return '<div><label class="f">' + label + '</label><select class="fld" data-qf="' + name + '" data-k="s">' + list.map(function (o) { return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + E(o[1]) + '</option>'; }).join('') + '</select></div>'; }

  function optEd(q, field, o) {
    o = o || {}; var list = q[field] || [];
    var h = '<div class="optbox" data-list="' + field + '"><label class="f">' + (o.title || '선택지') + '</label>';
    list.forEach(function (it, i) {
      h += '<div class="optrow" data-oi="' + i + '"><input class="fld" data-of="label" value="' + E(it.label) + '" placeholder="' + (o.title || '선택지') + ' ' + (i + 1) + '">' +
        (o.excl ? '<label class="chk" title="이 항목을 선택하면 다른 선택이 해제됩니다(예: 없음)"><input type="checkbox" data-of="exclusive"' + (it.exclusive ? ' checked' : '') + '> 단독</label>' : '') +
        (o.quota ? '<input class="fld fld-xs" type="number" min="1" data-of="max" value="' + E(it.max == null ? '' : it.max) + '" placeholder="인원 제한" title="이 선택지를 고를 수 있는 선착순 인원(비우면 제한 없음)">' : '') +
        (o.img ? '<input class="fld" data-of="image" value="' + E(it.image || '') + '" placeholder="이미지 주소(https://…)">' : '') +
        '<button class="btn btn-ghost btn-sm" data-act="oup" aria-label="위로">' + I('up', 14) + '</button><button class="btn btn-ghost btn-sm" data-act="odn" aria-label="아래로">' + I('down', 14) + '</button><button class="btn btn-ghost btn-sm" data-act="odel" style="color:var(--red)" aria-label="삭제">' + I('x', 14) + '</button></div>';
    });
    return h + '<div class="row" style="margin-top:6px"><button class="btn btn-secondary btn-sm" data-act="oadd">' + I('plus', 14) + ' 추가</button><button class="btn btn-ghost btn-sm" data-act="obulk">여러 줄로 한 번에 편집</button></div></div>';
  }
  function propsHtml(q) {
    var t = q.type, h = '', d = ensureDef();
    if (t === 'text') {
      var f = q.format || 'text';
      h += '<div class="row">' + fsel(q, 'format', '입력 형식', [['text', '일반 글자'], ['number', '숫자'], ['email', '이메일'], ['phone', '전화번호'], ['url', 'URL'], ['pattern', '형식 직접 지정(고급)']], 'text') + (f === 'text' ? fb(q, 'multiline', '여러 줄 입력', !q.format) : '') + fs(q, 'placeholder', '입력칸 안내 문구') + fnum(q, 'maxLen', '최대 글자 수', '500') + fnum(q, 'minLen', '최소 글자 수') + '</div>';
      if (f === 'number') h += '<div class="row">' + fnum(q, 'min', '최솟값') + fnum(q, 'max', '최댓값') + fb(q, 'integer', '정수만') + '</div>';
      if (f === 'pattern') h += '<div class="row">' + fs(q, 'pattern', '형식 규칙(고급) 예: ^[0-9]{8}$ = 숫자 8자리') + fs(q, 'patternMsg', '형식이 틀렸을 때 보여줄 안내') + '</div>';
    } else if (t === 'single') {
      h += '<div class="row">' + fsel(q, 'display', '표시 방식', [['radio', '라디오 버튼'], ['dropdown', '드롭다운'], ['image', '이미지 선택']], 'radio') + fb(q, 'other', '「기타」 직접 입력 허용') + fb(q, 'randomOptions', '선택지 순서 섞기') + '</div>' + optEd(q, 'options', { quota: true, img: q.display === 'image' });
    } else if (t === 'multi') {
      h += '<div class="row">' + fb(q, 'other', '「기타」 직접 입력 허용') + fb(q, 'randomOptions', '선택지 순서 섞기') + fnum(q, 'minSel', '최소 선택') + fnum(q, 'maxSel', '최대 선택') + '</div>' + optEd(q, 'options', { excl: true, quota: true });
    } else if (t === 'scale') {
      var sc = Object.keys(d.scales);
      h += '<div class="row"><div><label class="f">척도</label><select class="fld" data-qf="scale" data-k="s">' + sc.map(function (k) { return '<option value="' + k + '"' + ((q.scale || 'likert5') === k ? ' selected' : '') + '>' + (k === 'likert5' ? '5점 척도' : k === 'yesno' ? '예 / 아니오' : k) + '</option>'; }).join('') + '</select></div>' +
        '<div><label class="f">성실 응답 확인</label><label class="chk"><input type="checkbox" data-qz="chkon"' + (q.check && q.check.valid != null ? ' checked' : '') + '> 확인 문항으로 사용</label></div>' +
        (q.check && q.check.valid != null ? '<div><label class="f">정답(유효값)</label><select class="fld" data-qz="chkval">' + (d.scales[q.scale || 'likert5'] || []).map(function (o) { return '<option value="' + o.v + '"' + (o.v === q.check.valid ? ' selected' : '') + '>' + E(o.label) + '</option>'; }).join('') + '</select></div>' : '') + '</div>' +
        (q.check && q.check.valid != null ? '<p class="hint">정답과 다르게 응답하면 성실 응답 확인 실패로 기록됩니다. 문항 내용에 응답 방법(예: "전혀 아니다에 표시")을 안내해 주십시오.</p>' : '');
    } else if (t === 'linear') {
      h += '<div class="row">' + fnum(q, 'min', '시작 값') + fnum(q, 'max', '끝 값') + fs(q, 'lowLabel', '왼쪽 끝 문구') + fs(q, 'highLabel', '오른쪽 끝 문구') + '</div>';
    } else if (t === 'rating') {
      h += '<div class="row">' + fnum(q, 'max', '최대 점수(개수)', '5') + fsel(q, 'icon', '모양', [['star', '별'], ['heart', '하트'], ['thumb', '엄지']], 'star') + '</div>';
    } else if (t === 'nps') {
      h += '<div class="row">' + fs(q, 'lowLabel', '0점 문구') + fs(q, 'highLabel', '10점 문구') + '</div>';
    } else if (t === 'slider') {
      h += '<div class="row">' + fnum(q, 'min', '최솟값') + fnum(q, 'max', '최댓값') + fnum(q, 'step', '간격', '1') + fs(q, 'unit', '단위', '예: 점, %', 'fld-xs') + '</div>';
    } else if (t === 'grid') {
      h += '<div class="row">' + fb(q, 'multi', '행마다 여러 개 선택(체크박스)') + (q.multi ? '' : fb(q, 'eachRow', '모든 행 응답 필수', true)) + '</div><div class="grid g2">' + optEd(q, 'rows', { title: '행(질문 항목)' }) + optEd(q, 'cols', { title: '열(선택 항목)' }) + '</div>';
    } else if (t === 'ranking') {
      h += '<div class="row">' + fnum(q, 'top', '상위 몇 개까지 순위 지정 (비우면 전체)') + fb(q, 'randomOptions', '항목 순서 섞기') + '</div>' + optEd(q, 'options', { title: '순위 항목' });
    } else if (t === 'constsum') {
      h += '<div class="row">' + fnum(q, 'total', '합계', '100') + fs(q, 'unit', '단위', '예: 점, %', 'fld-xs') + fb(q, 'randomOptions', '항목 순서 섞기') + '</div>' + optEd(q, 'options', { title: '배분 항목' });
    } else if (t === 'date') {
      h += '<div class="row">' + fb(q, 'includeTime', '시간까지 입력') + '<div><label class="f">이 날짜 이후만</label><input class="fld" type="date" data-qf="min" data-k="s" value="' + E(q.min || '') + '"></div><div><label class="f">이 날짜 이전만</label><input class="fld" type="date" data-qf="max" data-k="s" value="' + E(q.max || '') + '"></div></div>';
    } else if (t === 'time') {
      h += '<div class="row"><div><label class="f">이 시간 이후만</label><input class="fld" type="time" data-qf="min" data-k="s" value="' + E(q.min || '') + '"></div><div><label class="f">이 시간 이전만</label><input class="fld" type="time" data-qf="max" data-k="s" value="' + E(q.max || '') + '"></div></div>';
    } else if (t === 'file') {
      h += '<div class="row">' + fsel(q, 'accept', '허용 파일', [['any', '사진·PDF·문서'], ['image', '사진만'], ['pdf', 'PDF만'], ['doc', '문서(PDF·Word·텍스트)']], 'any') + fb(q, 'capture', '카메라 촬영 우선') + fnum(q, 'maxFiles', '최대 개수(1~10)', '1') + fnum(q, 'maxMB', '파일당 최대 MB(최대 3)', '3') + '</div><p class="hint">사진은 올리기 전에 자동으로 줄여서 저장합니다. 무료 DB 용량을 위해 응답 1건당 첨부는 총 15MB 이내로 제한됩니다.</p>';
    } else if (t === 'address') {
      h += '<div class="row">' + fb(q, 'allowGps', '현재 위치로 주소 찾기 허용(동의 후)') + fb(q, 'detail', '상세 주소 입력칸', true) + '</div><p class="hint">도로명·지번 검색은 카카오(다음) 우편번호 서비스를 사용하며, 검색 결과는 도로명 주소·우편번호가 확인된 값만 저장됩니다.</p>';
    } else if (t === 'location') {
      h += fs(q, 'consentText', '위치 수집 동의 문구', '현재 위치 정보를 수집하는 데 동의합니다.');
    } else if (t === 'qr') {
      h += '<div class="row">' + fb(q, 'allowManual', '스캔이 안 될 때 직접 입력 허용', true) + '</div><p class="hint">행사장 현장 QR 확인(출석 체크 등)에 사용합니다. 정해진 값만 인정하려면 정답(퀴즈) 설정에 코드를 입력하십시오.</p>';
    } else if (t === 'consent') {
      h += '<label class="f">동의 안내문(수집 항목·이용 목적·보유 기간·거부 시 불이익 등)</label><textarea class="fld" rows="4" data-qf="text" data-k="s">' + E(q.text || '') + '</textarea>' + fs(q, 'checkLabel', '동의 체크 문구', '위 내용에 동의합니다.');
    } else if (t === 'block') {
      h += fsel(q, 'kind', '안내 종류', [['text', '설명 글'], ['image', '이미지'], ['video', '동영상(유튜브)']], 'text');
      if ((q.kind || 'text') === 'text') h += '<label class="f">내용</label><textarea class="fld" rows="3" data-qf="text" data-k="s">' + E(q.text || '') + '</textarea>';
      else if (q.kind === 'image') h += '<div class="row">' + fs(q, 'src', '이미지 주소(https://…)') + fs(q, 'caption', '설명(선택)') + '</div>';
      else h += fs(q, 'url', '유튜브 주소');
    }
    return h;
  }

  /* 퀴즈 정답 */
  function quizHtml(q) {
    if (!quizable(q)) return '';
    var on = hasAnswer(q), d = ensureDef(), h = '<div class="subpanel"><label class="chk"><input type="checkbox" data-qz="on"' + (on ? ' checked' : '') + '> <b>정답을 지정해 점수 채점(퀴즈)</b></label>';
    if (on) {
      h += '<div class="row" style="margin-top:6px">' + fnum(q, 'points', '배점', '1');
      if (q.type === 'single') h += '<div class="sp"><label class="f">정답</label><select class="fld" data-qz="ans"><option value="">선택</option>' + (q.options || []).map(function (o) { return '<option value="' + E(o.id) + '"' + (q.answer === o.id ? ' selected' : '') + '>' + E(o.label) + '</option>'; }).join('') + '</select></div>';
      else if (q.type === 'multi') h += '<div class="sp"><label class="f">정답(모두 선택해야 정답)</label>' + (q.options || []).map(function (o) { return '<label class="chk"><input type="checkbox" data-qz="mans" value="' + E(o.id) + '"' + ((q.answer || []).indexOf(o.id) >= 0 ? ' checked' : '') + '> ' + E(o.label) + '</label>'; }).join('') + '</div>';
      else if (q.type === 'scale') h += '<div class="sp"><label class="f">정답</label><select class="fld" data-qz="ansnum">' + SVY.scaleOf(d, q).map(function (o) { return '<option value="' + o.v + '"' + (Number(q.answer) === o.v ? ' selected' : '') + '>' + E(o.label) + '</option>'; }).join('') + '</select></div>';
      else if (q.type === 'text' && (q.format || 'text') !== 'number') h += '<div class="sp"><label class="f">정답(여러 개면 쉼표로 구분, 대소문자 무시)</label><input class="fld" data-qz="anstext" value="' + E([].concat(q.answer).join(', ')) + '"></div>';
      else h += '<div class="sp"><label class="f">정답(숫자)</label><input class="fld" type="number" data-qz="ansnum" value="' + E(q.answer == null ? '' : q.answer) + '"></div>';
      h += '</div><p class="hint">정답은 학생에게 내려가는 설문 정의에서 제외되어 노출되지 않습니다. 결과에서 점수와 문항별 정답률을 볼 수 있습니다.</p>';
    }
    return h + '</div>';
  }

  /* ───────────── 문항 카드 ───────────── */
  function summaryTags(q, d) {
    var h = '';
    if (q.required && q.type !== 'block') h += '<span class="tag">필수</span>';
    if (q.check && q.check.valid != null) h += '<span class="tag check">성실 응답 확인</span>';
    if (q.showIf) h += '<span class="tag blue">조건 있음</span>';
    if (hasAnswer(q)) h += '<span class="tag blue">정답 ' + (N(q.points) != null ? q.points : 1) + '점</span>';
    if ((q.options || []).some(function (o) { return o.max != null; })) h += '<span class="tag blue">인원 제한</span>';
    if (q.randomOptions) h += '<span class="tag">섞기</span>';
    return h;
  }
  function qCard(q, si, qi, isBasic) {
    var d = ensureDef(), gen = isGen(d), open = !!OPEN[q.id], key = menuKey(q);
    var h = '<div class="qcard' + (open ? ' open' : '') + '" data-si="' + si + '" data-qi="' + qi + '" data-qid="' + E(q.id) + '"><div class="qhead" data-act="qtoggle"><span class="qid">' + E(q.id) + '</span><span class="tag blue">' + E(SVY.typeLabel(q)) + '</span>' +
      '<span class="qsum">' + E(String(q.label || (q.type === 'block' ? (q.text || '') : '') || '(내용 없음)').slice(0, 60)) + '</span>' + summaryTags(q, d) +
      (!gen && !isBasic && q.scope === 'common' ? '<span class="tag">설문당 1회</span>' : '') +
      '<span class="sp"></span><button class="btn btn-ghost btn-sm" data-act="qup" aria-label="위로">' + I('up', 14) + '</button><button class="btn btn-ghost btn-sm" data-act="qdn" aria-label="아래로">' + I('down', 14) + '</button><button class="btn btn-ghost btn-sm" data-act="qdup" title="복제" aria-label="복제">' + I('copy', 14) + '</button><button class="btn btn-ghost btn-sm" data-act="qdel" style="color:var(--red)" aria-label="삭제">' + I('trash', 14) + '</button></div>';
    if (!open) return h + '</div>';
    h += '<div class="qbody"><textarea class="fld" rows="2" data-qf="label" data-k="s" placeholder="' + (q.type === 'block' ? '제목(선택)' : '문항 내용') + '">' + E(q.label || '') + '</textarea>' +
      (q.type === 'block' ? '' : '<input class="fld" data-qf="desc" data-k="s" placeholder="보조 설명(선택)" value="' + E(q.desc || '') + '">') +
      '<div class="row"><div><label class="f">형식</label><select class="fld" data-qf="menu" data-k="menu">' + SVY.MENU.map(function (g) { return '<optgroup label="' + E(g.group) + '">' + g.items.map(function (it) { return '<option value="' + it.key + '"' + (it.key === key ? ' selected' : '') + '>' + E(it.label) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select></div>' +
      (!gen && !isBasic && q.type !== 'block' ? '<div><label class="f">응답 방식' + H('과목별 평가에서 이 문항을 과목마다 묻을지(과목별), 설문 전체에서 한 번만 묻을지(1회) 정합니다. 예: 수업 만족도는 과목별, 출석 정도는 1회.') + '</label><select class="fld" data-qf="scope" data-k="s"><option value="course"' + (q.scope !== 'common' ? ' selected' : '') + '>과목별로 응답</option><option value="common"' + (q.scope === 'common' ? ' selected' : '') + '>설문 전체에서 1회 응답</option></select></div>' : '') +
      (q.type === 'block' ? '' : '<div><label class="f">&nbsp;</label><label class="chk"><input type="checkbox" data-qf="required" data-k="b"' + (q.required || (q.check && q.check.valid != null) ? ' checked' : '') + ((q.check && q.check.valid != null) ? ' disabled' : '') + '> 필수</label></div>') + '</div>' +
      propsHtml(q) +
      '<details class="adv"' + ((q.showIf || hasAnswer(q) || (q.options || []).some(function (o) { return o.max != null; })) ? ' open' : '') + '><summary>고급 설정 <small>조건에 따라 보이기 · 정답(퀴즈) · 문항 ID</small></summary><div class="advbody">' +
      '<div class="row"><div><label class="f">문항 ID' + H('결과 엑셀과 조건 설정에서 이 문항을 가리키는 이름입니다. 보통은 바꾸지 않아도 됩니다.') + '</label><input class="fld fld-sm" data-qf="id" data-k="id" value="' + E(q.id) + '"></div></div>' +
      quizHtml(q) + condHtml(q, { q: q, basic: isBasic }, 'q') + '</div></details>' +
      '<div class="subpanel qpvbox"><div class="row"><b>학생 화면 미리보기</b><span class="hint">직접 눌러 볼 수 있습니다(저장되지 않음).</span></div><div class="qprev" id="pv_' + E(q.id) + '"></div></div></div></div>';
    return h;
  }

  /* ───────────── 점검 ───────────── */
  function collectRefs(c, out) { if (!c || typeof c !== 'object') return; if (c.all) c.all.forEach(function (e) { collectRefs(e, out); }); else if (c.any) c.any.forEach(function (e) { collectRefs(e, out); }); else if (c.q) out.push(c); }
  A.lintDef = function (d) {
    var errs = [], warns = [], ids = {}, qs = [], gen = d.mode === 'general';
    if (d.mode && ['course', 'general'].indexOf(d.mode) < 0) errs.push('설문 유형이 올바르지 않습니다.');
    (d.basic || []).forEach(function (q) { qs.push({ q: q, sec: '기본정보', basic: true }); });
    (d.sections || []).forEach(function (s) { (s.questions || []).forEach(function (q) { qs.push({ q: q, sec: s.title || '(제목 없음)', s: s }); }); });
    var seen = {};
    if (!qs.length) warns.push('문항이 없습니다.');
    qs.forEach(function (x, idx) {
      var q = x.q, w = '[' + (q.id || '?') + '] ', t = q.type;
      if (!q.id || !/^[A-Za-z0-9_]{1,24}$/.test(q.id)) errs.push(w + '문항 ID는 영문·숫자·밑줄 1~24자여야 합니다.');
      else if (ids[q.id]) errs.push(w + '문항 ID가 중복됩니다.'); else ids[q.id] = 1;
      if (KNOWN.indexOf(t) < 0) { errs.push(w + '지원하지 않는 문항 형식입니다: ' + t); return; }
      if (t !== 'block' && !String(q.label || '').trim()) errs.push(w + '문항 내용이 비어 있습니다.');
      if (t === 'block' && !(q.label || q.text || q.src || q.url)) warns.push(w + '내용이 없는 안내 블록입니다.');
      if (OPT_TYPES.indexOf(t) >= 0) {
        var oi = {}, ol = q.options || [];
        if (ol.length < (t === 'single' || t === 'multi' ? 1 : 2)) errs.push(w + '선택지가 부족합니다.');
        ol.forEach(function (o) { if (!o.id || oi[o.id]) errs.push(w + '선택지 ID가 비었거나 중복됩니다.'); oi[o.id] = 1; if (!String(o.label || '').trim()) errs.push(w + '비어 있는 선택지가 있습니다.'); if (o.max != null && !(N(o.max) >= 1)) errs.push(w + '선택지 정원은 1 이상이어야 합니다.'); });
        if (t === 'ranking' && N(q.top) != null && (N(q.top) < 1 || N(q.top) > ol.length)) errs.push(w + '순위 개수는 1~선택지 수 사이여야 합니다.');
        if (t === 'constsum' && !(N(q.total) > 0) && q.total != null) errs.push(w + '합계는 0보다 커야 합니다.');
        if (t === 'multi' && N(q.minSel) != null && N(q.maxSel) != null && N(q.minSel) > N(q.maxSel)) errs.push(w + '최소 선택이 최대 선택보다 큽니다.');
      }
      if (t === 'grid') { if (!(q.rows || []).length || !(q.cols || []).length) errs.push(w + '그리드의 행과 열을 모두 입력해 주십시오.'); [(q.rows || []), (q.cols || [])].forEach(function (l) { var s2 = {}; l.forEach(function (o) { if (!o.id || s2[o.id]) errs.push(w + '그리드 행/열 ID가 비었거나 중복됩니다.'); s2[o.id] = 1; if (!String(o.label || '').trim()) errs.push(w + '비어 있는 그리드 행/열이 있습니다.'); }); }); }
      if (t === 'scale') {
        var sc = (d.scales || {})[q.scale || 'likert5'];
        if (!sc || !sc.length) errs.push(w + '척도 「' + (q.scale || 'likert5') + '」가 정의되어 있지 않습니다.');
        else if (q.check && q.check.valid != null && !sc.some(function (o) { return o.v === q.check.valid; })) errs.push(w + '성실 응답 확인 정답이 척도 값에 없습니다.');
      }
      if (q.check && t !== 'scale') errs.push(w + '성실 응답 확인은 척도 문항에서만 사용할 수 있습니다.');
      if (t === 'linear' || t === 'slider') { var lo = N(q.min), hi = N(q.max); if (lo != null && hi != null && lo >= hi) errs.push(w + '시작 값이 끝 값보다 작아야 합니다.'); if (t === 'linear' && hi != null && lo != null && hi - lo > 20) errs.push(w + '선형 배율은 21칸 이하여야 합니다.'); }
      if (t === 'rating' && q.max != null && !(N(q.max) >= 2 && N(q.max) <= 10)) errs.push(w + '별점 개수는 2~10이어야 합니다.');
      if (t === 'text') {
        if (q.maxLen && q.maxLen > 5000) errs.push(w + '최대 글자 수는 5000자 이하여야 합니다.');
        if (q.format === 'pattern') { if (!q.pattern) errs.push(w + '패턴(정규식)을 입력해 주십시오.'); else { try { new RegExp(q.pattern); } catch (e) { errs.push(w + '정규식이 올바르지 않습니다.'); } } }
        if (q.format === 'number' && N(q.min) != null && N(q.max) != null && N(q.min) > N(q.max)) errs.push(w + '최솟값이 최댓값보다 큽니다.');
      }
      if (t === 'file') { if (q.maxFiles != null && !(N(q.maxFiles) >= 1 && N(q.maxFiles) <= 10)) errs.push(w + '첨부 개수는 1~10이어야 합니다.'); if (q.maxMB != null && !(N(q.maxMB) > 0 && N(q.maxMB) <= 3)) errs.push(w + '파일 용량은 3MB 이하여야 합니다.'); }
      if (hasAnswer(q)) {
        if (!quizable(q)) errs.push(w + '이 형식은 정답(퀴즈)을 지정할 수 없습니다.');
        else if (q.answer === '' || (Array.isArray(q.answer) && !q.answer.length)) errs.push(w + '정답을 입력해 주십시오.');
        else if (t === 'single' && !(q.options || []).some(function (o) { return o.id === q.answer; })) errs.push(w + '정답이 선택지에 없습니다.');
        else if (t === 'multi' && (!Array.isArray(q.answer) || !q.answer.length || q.answer.some(function (a) { return !(q.options || []).some(function (o) { return o.id === a; }); }))) errs.push(w + '정답으로 지정한 선택지를 확인해 주십시오.');
        else if (N(q.points) != null && N(q.points) < 0) errs.push(w + '배점은 0 이상이어야 합니다.');
      }
      var refs = []; collectRefs(q.showIf, refs);
      refs.forEach(function (c) { if (!seen[c.q]) errs.push(w + '표시 조건이 아직 나오지 않은 문항(' + c.q + ')을 가리킵니다. 앞쪽 문항만 조건으로 쓸 수 있습니다.'); else if (!gen && x.q.scope === 'common' && !x.basic && (qs.filter(function (y) { return y.q.id === c.q; })[0] || { q: {} }).q.scope === 'course') errs.push(w + '설문 1회 응답 문항은 과목별 문항을 조건으로 쓸 수 없습니다.'); });
      seen[q.id] = 1;
    });
    // 영역 조건
    var before = {}; (d.basic || []).forEach(function (q) { before[q.id] = 1; });
    (d.sections || []).forEach(function (s) {
      var refs = []; collectRefs(s.showIf, refs);
      refs.forEach(function (c) { if (!before[c.q]) errs.push('[영역 ' + (s.title || s.id) + '] 표시 조건이 앞쪽 영역에 없는 문항(' + c.q + ')을 가리킵니다.'); });
      (s.questions || []).forEach(function (q) { before[q.id] = 1; });
      if (!(s.questions || []).length) warns.push('영역 「' + (s.title || s.id) + '」에 문항이 없습니다.');
    });
    if (d.limit && d.limit.max != null && !(N(d.limit.max) >= 1)) errs.push('선착순 정원은 1 이상이어야 합니다.');
    var hasCheck = qs.some(function (x) { return x.q.check && x.q.check.valid != null; });
    if (!gen && qs.length && !hasCheck) warns.push('성실 응답 확인 문항이 없습니다. 추첨 시 불성실 응답을 걸러낼 수 없습니다.');
    var personal = qs.some(function (x) { return PERSONAL.indexOf(x.q.type) >= 0 || (x.q.type === 'text' && ['email', 'phone'].indexOf(x.q.format) >= 0); });
    if (personal && !qs.some(function (x) { return x.q.type === 'consent'; })) warns.push('주소·연락처·서명·첨부·위치 등 개인정보를 받는 문항이 있으나 「동의 체크」 문항이 없습니다. (개인정보 보호법 제15조: 수집·이용 목적 등을 알리고 동의를 받아야 합니다.)');
    return { errs: errs, warns: warns };
  };
  A.beforeSave = function () { return A.lintDef(ensureDef()).errs; };

  /* ───────────── 탭 ───────────── */
  var ID_Q = ['respName', 'respOrg', 'respConsent'];
  // 기명 설문: 기본 정보 맨 앞에 이름·소속 + 개인정보 동의 문항을 넣고, 익명으로 되돌리면 제거
  function applyIdentity(d, v) {
    d.basic = d.basic || [];
    if (v === 'named') {
      if (!d.basic.some(function (q) { return q.id === 'respName'; })) {
        var a = SVY.newQuestion('short', 'respName'); a.label = '이름'; a.required = true; a.maxLen = 30; a.scope = 'common';
        var b = SVY.newQuestion('short', 'respOrg'); b.label = '소속(학과·부서 등)'; b.required = false; b.maxLen = 60; b.scope = 'common';
        var c = SVY.newQuestion('consent', 'respConsent'); c.label = '개인정보 수집·이용 동의'; c.required = true; c.scope = 'common'; c.text = '수집 항목: 이름, 소속\n이용 목적: 설문 응답 확인 및 결과 분석\n보유 기간: 설문 종료 후 1개월(또는 안내된 기간)\n동의를 거부할 수 있으며, 거부 시 설문에 참여할 수 없습니다.'; c.checkLabel = '위 내용에 동의합니다.';
        d.basic.unshift(a, b, c);
      }
      d.identity = 'named';
    } else {
      d.basic = d.basic.filter(function (q) { return ID_Q.indexOf(q.id) < 0; }); delete d.identity;
    }
  }
  var QUICK = [['single', '객관식'], ['scale5', '5점 척도'], ['paragraph', '서술형'], ['rating', '별점'], ['multi', '체크박스']];
  var addingTo = null;
  A.tabs.questions = function (box) {
    var d = ensureDef(), lint = A.lintDef(d), gen = isGen(d), nq = A.countQuestions();
    d.limit = d.limit || {}; d.quiz = d.quiz || {}; d.features = d.features || {};
    var tri = d.features.ticket == null ? '' : String(d.features.ticket), after = d.features.after || {};
    var settings = '<details class="panel setp"' + (A._setOpen ? ' open' : '') + '><summary><b>설문 설정</b> · ' + (gen ? '일반 설문(행사·교직원 등)' : '과목별 평가') + (d.limit.max ? ' · 선착순 ' + E(d.limit.max) + '명' : '') + '</summary><div class="grid g2" style="margin-top:10px">' +
      '<div class="setgrp">1. 기본 방식</div>' +
      '<div><label class="f">응답 방식' + H('과목별 반복: 학생이 반을 고르면 그 반의 과목마다 같은 문항에 답합니다. 1인 1회: 행사·교직원 설문처럼 한 번만 답합니다. 설문의 목적(행사·수업·상담 등)과는 별개로, 응답을 받는 단위만 정합니다.') + '</label><select class="fld" data-df="mode"><option value="course"' + (!gen ? ' selected' : '') + '>과목별 반복 (반 선택 → 과목마다 응답)</option><option value="general"' + (gen ? ' selected' : '') + '>1인 1회 (행사 만족도·교직원 설문 등)</option></select></div>' +
      (gen ? '<div><label class="f">화면 구성</label><select class="fld" data-df="layout"><option value=""' + (d.layout !== 'single' ? ' selected' : '') + '>영역별로 나누어 단계 이동</option><option value="single"' + (d.layout === 'single' ? ' selected' : '') + '>한 화면에 모두 표시</option></select></div>' : '') +
      '<div class="setgrp">2. 응답 받는 방법</div>' +
      '<div><label class="f">선착순 인원 (비우면 제한 없음)' + H('설문 전체 응답을 이 인원까지만 받습니다. 가득 차면 학생에게 마감 안내가 나옵니다. (선택지별 인원 제한은 문항의 고급 설정에서)') + '</label><input class="fld" type="number" min="1" data-df="limit.max" data-k="n" value="' + E(d.limit.max == null ? '' : d.limit.max) + '"></div>' +
      '<div><label class="f">응답자 식별 방식' + H('익명: 이름을 받지 않습니다. 기명: 이름·소속 문항과 개인정보 동의 문항이 기본 정보에 자동으로 들어갑니다.') + '</label><select class="fld" data-df="identity"><option value=""' + (d.identity !== 'named' ? ' selected' : '') + '>익명 (이름 받지 않음)</option><option value="named"' + (d.identity === 'named' ? ' selected' : '') + '>기명 (이름·소속 문항과 개인정보 동의 자동 추가)</option></select></div>' +
      '<div class="setgrp">3. 제출한 뒤</div>' +
      '<div><label class="f">추첨번호 발급·표시' + H('제출을 마친 학생에게 추첨번호를 보여 줍니다. 경품 추첨을 할 때만 켜십시오.') + '</label><select class="fld" data-df="features.ticket" data-k="tri"><option value=""' + (tri === '' ? ' selected' : '') + '>기본값(' + (gen ? '표시 안 함' : '표시') + ')</option><option value="true"' + (tri === 'true' ? ' selected' : '') + '>표시함 (추첨 사용)</option><option value="false"' + (tri === 'false' ? ' selected' : '') + '>표시 안 함</option></select></div>' +
      '<div><label class="f">제출 후 점수 표시 (퀴즈)' + H('문항에 정답을 지정해 둔 경우, 제출 직후 학생에게 점수를 보여 줍니다.') + '</label><select class="fld" data-df="quiz.show"><option value=""' + (!d.quiz.show ? ' selected' : '') + '>점수 표시 안 함</option><option value="score"' + (d.quiz.show === 'score' ? ' selected' : '') + '>점수 표시</option></select></div>' +
      '<div><label class="f">제출 후 응답 수정' + H('제출한 같은 기기에서 정해진 시간 안에 응답을 고칠 수 있게 합니다. 추첨번호는 그대로 유지됩니다.') + '</label><select class="fld" data-df="edit"><option value=""' + (!d.features.edit ? ' selected' : '') + '>허용 안 함 (제출 후 수정 불가)</option><option value="24"' + (d.features.edit && Number(d.features.edit.hours) === 24 ? ' selected' : '') + '>제출 후 24시간 이내 허용</option><option value="72"' + (d.features.edit && Number(d.features.edit.hours) === 72 ? ' selected' : '') + '>제출 후 3일 이내 허용</option><option value="0"' + (d.features.edit && Number(d.features.edit.hours) === 0 ? ' selected' : '') + '>설문 마감까지 허용</option></select><div class="hint">같은 기기에서만 수정할 수 있으며 DB 7단계 설치가 필요합니다.</div></div>' +
      '<div><label class="f">제출 완료 후 안내' + H('제출 후 화면에 안내 링크 버튼이나 참여 확인서(이미지 저장) 버튼을 추가합니다.') + '</label><select class="fld" data-df="features.after.type"><option value=""' + (!after.type ? ' selected' : '') + '>기본 (완료 문구만 표시)</option><option value="link"' + (after.type === 'link' ? ' selected' : '') + '>안내 링크 버튼 표시</option><option value="receipt"' + (after.type === 'receipt' ? ' selected' : '') + '>참여 확인서(이미지 저장) 제공</option><option value="both"' + (after.type === 'both' ? ' selected' : '') + '>링크 + 참여 확인서</option></select></div>' +
      (after.type === 'link' || after.type === 'both' ? '<div><label class="f">링크 주소 (https://…)</label><input class="fld" data-df="features.after.url" value="' + E(after.url || '') + '"></div><div><label class="f">링크 버튼 문구</label><input class="fld" data-df="features.after.label" value="' + E(after.label || '') + '" placeholder="예: 행사 안내 보기"></div>' : '') +
      '<div><label class="f">통과 기준 점수 (선택)</label><input class="fld" type="number" min="0" data-df="quiz.passScore" data-k="n" value="' + E(d.quiz.passScore == null ? '' : d.quiz.passScore) + '"></div></div></details>';
    var secsHtml = d.sections.map(function (s, si) {
      var pv = condHtml(s, { sec: s }, 's');
      return '<div class="sec-card" data-s="' + si + '"><div class="sec-head"><input class="fld" data-sf="title" value="' + E(s.title || '') + '" placeholder="영역 제목"><button class="btn btn-ghost btn-sm" data-act="sup" aria-label="위로">' + I('up', 14) + '</button><button class="btn btn-ghost btn-sm" data-act="sdn" aria-label="아래로">' + I('down', 14) + '</button><button class="btn btn-ghost btn-sm" data-act="sdel" style="color:var(--red)" aria-label="삭제">' + I('trash', 14) + '</button></div>' +
        '<div style="padding:8px 12px 0;display:grid;gap:8px"><input class="fld" data-sf="note" value="' + E(s.note || '') + '" placeholder="영역 안내 문구 (선택)">' + (s.showIf ? '' : '') + pv + '</div>' +
        (s.questions || []).map(function (q, qi) { return qCard(q, si, qi, false); }).join('') +
        '<div class="qcard qadd"><button class="btn btn-primary btn-sm" data-act="qadd" data-si="' + si + '">' + I('plus', 14) + ' 문항 추가</button><span class="muted" style="font-size:12.5px">빠른 추가</span>' + QUICK.map(function (k) { return '<button class="btn btn-secondary btn-sm" data-act="qquick" data-si="' + si + '" data-key="' + k[0] + '">' + k[1] + '</button>'; }).join('') + '</div></div>';
    }).join('');
    var empty = !nq && !(d.basic || []).length ? '<div class="emptyq"><div class="ei">' + I('list', 28) + '</div><h3>아직 문항이 없습니다</h3><p class="muted">직접 하나씩 추가하거나, 가지고 있는 설문지 파일을 올려 AI가 초안을 만들게 할 수 있습니다.</p><div class="row" style="justify-content:center"><button class="btn btn-primary" data-act="qquick" data-si="' + (d.sections.length ? 0 : -1) + '" data-key="single">' + I('plus', 15) + ' 첫 문항 추가</button><button class="btn btn-secondary" data-act="qai">' + I('sparkle', 15) + ' AI로 초안 만들기</button></div></div>' : '';
    box.innerHTML = empty + '<div class="row" style="margin-bottom:10px;align-items:flex-start"><div class="sp">' +
      (lint.errs.length ? '<div class="msg err" style="margin:0">' + I('alert', 18) + '<div><b>오류 ' + lint.errs.length + '건</b><br>' + lint.errs.slice(0, 6).map(E).join('<br>') + '</div></div>' : '<div class="msg ok" style="margin:0">' + I('check', 18) + '<div>문항 점검 통과 · 문항 ' + nq + '개 · 영역 ' + d.sections.length + '개</div></div>') +
      (lint.warns.length ? '<div class="msg warn">' + I('alert', 18) + '<div>' + lint.warns.slice(0, 5).map(E).join('<br>') + '</div></div>' : '') + '</div>' +
      '<div class="row"><button class="btn btn-secondary btn-sm" data-act="expandall">모두 펼치기</button><button class="btn btn-secondary btn-sm" data-act="collapseall">모두 접기</button><button class="btn btn-secondary btn-sm" data-act="json">고급: JSON</button><button class="btn btn-secondary btn-sm" data-act="scales">척도 문구</button><button class="btn btn-primary btn-sm" data-act="sadd">' + I('plus', 14) + ' 영역 추가</button></div></div>' + settings +
      '<div id="qroot"><div class="sec-card"><div class="sec-head"><b>' + (gen ? '기본 정보 문항 (맨 앞 단계)' : '기본 정보 문항 (반 선택 다음 단계)') + '</b></div>' + (d.basic || []).map(function (q, qi) { return qCard(q, -1, qi, true); }).join('') +
      '<div class="qcard"><button class="btn btn-secondary btn-sm" data-act="qadd" data-si="-1">' + I('plus', 14) + ' 기본 정보 문항 추가</button></div></div>' + secsHtml + '</div>';
    box.querySelector('.setp').addEventListener('toggle', function (e) { A._setOpen = e.target.open; });

    // 미리보기(학생 화면과 같은 렌더러)
    var root = box.querySelector('#qroot'), scratch = {}, qmap = SVY.questionMap(d);
    var penv = { def: d, qmap: qmap, getAns: function () { return scratch; }, getCommon: function () { return scratch; }, onChange: function () {}, toast: A.toast, counts: {}, seed: 1, busy: {} };
    allQ(d).forEach(function (x) {
      var el = root.querySelector('#pv_' + x.q.id); if (!el) return;
      el.innerHTML = SVY.Form.html(Object.assign({}, x.q, { showIf: undefined }), { def: d, a: scratch, c: scratch, scopeId: 'pv', counts: {}, seed: 1, busy: penv.busy, badge: null });
    });
    SVY.Form.attach(root, penv);
    if (root._initSigs) root._initSigs();

    function redraw() { A.markDirty(); var y = window.scrollY; A.tabs.questions(box); window.scrollTo(0, y); if (A.afterTabsChange) A.afterTabsChange(); }
    function qref(el) { var c = el.closest('[data-qi]'), si = Number(c.getAttribute('data-si')), qi = Number(c.getAttribute('data-qi')); var list = si < 0 ? d.basic : d.sections[si].questions; return { list: list, q: list[qi], qi: qi, si: si }; }
    function target(el) { var ct = el.closest('[data-ct]'); if (!ct) return null; if (ct.getAttribute('data-ct') === 's') return d.sections[Number(el.closest('[data-s]').getAttribute('data-s'))]; return qref(el).q; }
    function renameRefs(from, to) {
      function walk(c) { if (!c || typeof c !== 'object') return; if (c.all) c.all.forEach(walk); else if (c.any) c.any.forEach(walk); else if (c.q === from) c.q = to; }
      allQ(d).forEach(function (x) { walk(x.q.showIf); }); d.sections.forEach(function (s) { walk(s.showIf); });
    }
    function dropRefs(id) {
      var n = 0;
      function prune(owner) {
        var pc = parseCond(owner.showIf); if (!pc.list.length) return;
        var keep = pc.list.filter(function (c) { return !(c && c.q === id); }); if (keep.length !== pc.list.length) { n += pc.list.length - keep.length; setClauses(owner, pc.mode, keep); }
      }
      allQ(d).forEach(function (x) { prune(x.q); }); d.sections.forEach(prune);
      return n;
    }

    function refreshPrev(el) {
      var card = el.closest('.qcard'); if (!card) return; var q = qref(el).q, pv = card.querySelector('.qprev'); if (!pv) return;
      pv.innerHTML = SVY.Form.html(Object.assign({}, q, { showIf: undefined }), { def: d, a: scratch, c: scratch, scopeId: 'pv', counts: {}, seed: 1, busy: penv.busy, badge: null }); if (root._initSigs) root._initSigs();
    }
    box.onclick = async function (e) {
      var t = e.target.closest('[data-act]'); if (!t || !box.contains(t) || e.target.closest('#qroot .qprev')) return; var act = t.getAttribute('data-act');
      if (act === 'qtoggle') { if (e.target.closest('button')) return; var id0 = t.closest('[data-qid]').getAttribute('data-qid'); OPEN[id0] = !OPEN[id0]; return redraw(); }
      if (act === 'sadd') { d.sections.push({ id: newId('S'), title: '새 영역', note: '', questions: [] }); return redraw(); }
      if (act === 'json') return A.jsonEditor();
      if (act === 'scales') return A.scaleEditor();
      if (act === 'expandall') { allQ(d).forEach(function (x) { OPEN[x.q.id] = true; }); return redraw(); }
      if (act === 'collapseall') { OPEN = {}; return redraw(); }
      var sc2 = t.closest('[data-s]'), si = sc2 ? Number(sc2.getAttribute('data-s')) : -1;
      if (act === 'sup' && si > 0) { var a = d.sections[si]; d.sections[si] = d.sections[si - 1]; d.sections[si - 1] = a; return redraw(); }
      if (act === 'sdn' && si >= 0 && si < d.sections.length - 1) { var b = d.sections[si]; d.sections[si] = d.sections[si + 1]; d.sections[si + 1] = b; return redraw(); }
      if (act === 'sdel') { if (await A.confirm('영역 삭제', '「' + E(d.sections[si].title) + '」과(와) 영역 안의 문항 ' + (d.sections[si].questions || []).length + '개가 삭제됩니다.', '삭제', '취소', true)) { (d.sections[si].questions || []).forEach(function (q) { dropRefs(q.id); }); d.sections.splice(si, 1); redraw(); } return; }
      if (act === 'qadd') return addMenu(Number(t.getAttribute('data-si')));
      if (act === 'qquick') return addQ(Number(t.getAttribute('data-si')), t.getAttribute('data-key'));
      if (act === 'qai') return A.go('ai');
      // 조건 편집
      if (act === 'cadd' || act === 'cdel' || act === 'cclear') {
        var tg = target(t), pc = parseCond(tg.showIf), owner = tg.questions ? { sec: tg } : { q: tg, basic: !!(t.closest('[data-si="-1"]')) }, srcs = condSources(owner);
        if (act === 'cclear') { delete tg.showIf; return redraw(); }
        if (act === 'cadd') { var s0 = srcs[0]; if (!s0) return; var op0 = opsFor(s0)[0], c0 = { q: s0.id, op: op0 }; var v0 = defaultVal(s0, op0); if (v0 !== undefined) c0.v = v0; pc.list.push(c0); setClauses(tg, pc.mode, pc.list); return redraw(); }
        var k = Number(t.closest('[data-ci]').getAttribute('data-ci')); pc.list.splice(k, 1); setClauses(tg, pc.mode, pc.list); return redraw();
      }
      var r = qref(t);
      if (act === 'qup' && r.qi > 0) { var x = r.list[r.qi]; r.list[r.qi] = r.list[r.qi - 1]; r.list[r.qi - 1] = x; return redraw(); }
      if (act === 'qdn' && r.qi < r.list.length - 1) { var y = r.list[r.qi]; r.list[r.qi] = r.list[r.qi + 1]; r.list[r.qi + 1] = y; return redraw(); }
      if (act === 'qdup') { var cp = A.clone(r.q); cp.id = newId(r.q.id.replace(/\d+$/, '') || 'Q'); r.list.splice(r.qi + 1, 0, cp); OPEN[cp.id] = true; return redraw(); }
      if (act === 'qdel') { if (await A.confirm('문항 삭제', '[' + E(r.q.id) + '] ' + E(String(r.q.label).slice(0, 60)) + '<br>이미 받은 응답에서 이 문항의 값은 집계되지 않습니다.', '삭제', '취소', true)) { var id1 = r.q.id; r.list.splice(r.qi, 1); var nr = dropRefs(id1); if (nr) A.toast('이 문항을 조건으로 쓰던 ' + nr + '개 조건을 함께 제거했습니다.'); redraw(); } return; }
      var lst = t.closest('[data-list]');
      if (lst) {
        var fld = lst.getAttribute('data-list'), arr = r.q[fld] = r.q[fld] || [], pre = fld === 'rows' ? 'r' : fld === 'cols' ? 'c' : 'o', row = t.closest('[data-oi]'), oi = row ? Number(row.getAttribute('data-oi')) : -1;
        if (act === 'oadd') { var kk = 1; while (arr.some(function (o) { return o.id === pre + kk; })) kk++; arr.push({ id: pre + kk, label: '' }); return redraw(); }
        if (act === 'odel') { arr.splice(oi, 1); return redraw(); }
        if (act === 'oup' && oi > 0) { var tmp = arr[oi]; arr[oi] = arr[oi - 1]; arr[oi - 1] = tmp; return redraw(); }
        if (act === 'odn' && oi < arr.length - 1) { var tmp2 = arr[oi]; arr[oi] = arr[oi + 1]; arr[oi + 1] = tmp2; return redraw(); }
        if (act === 'obulk') return bulkEdit(r.q, fld, pre);
      }
    };
    function addQ(si, key) {
      var q = SVY.newQuestion(key, newId('Q')); q.scope = (si < 0 || gen) ? 'common' : 'course';
      if (si < 0) d.basic.push(q); else (d.sections[si].questions = d.sections[si].questions || []).push(q);
      OPEN[q.id] = true; redraw(); if (A.pv) A.pv.focusQ(q.id);
    }
    function bulkEdit(q, fld, pre) {
      var arr = q[fld] || [];
      A.modal('<h3>여러 줄로 한 번에 편집</h3><p class="muted">한 줄에 하나씩 입력합니다. 기존 항목은 순서대로 ID가 유지됩니다.</p><textarea id="bk" class="fld" rows="12">' + E(arr.map(function (o) { return o.label; }).join('\n')) + '</textarea><div class="btn-row"><button class="btn btn-ghost" data-r="0">취소</button><button class="btn btn-primary" data-r="1">적용</button></div>', function (bg, close) {
        bg.addEventListener('click', function (e) {
          var b = e.target.closest('[data-r]'); if (!b) return; if (b.getAttribute('data-r') === '0') return close();
          var lines = bg.querySelector('#bk').value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean), used = {}, out = [];
          lines.forEach(function (lb, i) { var old = arr[i], id = old && !used[old.id] ? old.id : null; if (!id) { var n = 1; while (arr.some(function (o) { return o.id === pre + n; }) || used[pre + n]) n++; id = pre + n; } used[id] = 1; var it = Object.assign({}, old || {}, { id: id, label: lb }); out.push(it); });
          q[fld] = out; close(); redraw();
        });
      });
    }
    function addMenu(si) {
      A.modal('<h3>문항 형식 선택</h3>' + SVY.MENU.map(function (g) { return '<div class="mgroup"><div class="mg-t">' + E(g.group) + '</div><div class="mgrid">' + g.items.map(function (it) { return '<button class="mitem" data-key="' + it.key + '"><b>' + E(it.label) + '</b><span>' + E(it.hint) + '</span></button>'; }).join('') + '</div></div>'; }).join(''), function (bg, close) {
        bg.addEventListener('click', function (e) {
          var b = e.target.closest('[data-key]'); if (!b) return;
          addQ(si, b.getAttribute('data-key')); close();
        });
      }, 'wide');
    }
    box.oninput = function (e) {
      var el = e.target; if (el.closest('#qroot .qprev')) return;
      var sf = el.getAttribute('data-sf');
      if (sf) { var s = d.sections[Number(el.closest('[data-s]').getAttribute('data-s'))]; s[sf] = el.value; return A.markDirty(); }
      var of = el.getAttribute('data-of');
      if (of) { var rr = qref(el), lst = el.closest('[data-list]').getAttribute('data-list'), o = rr.q[lst][Number(el.closest('[data-oi]').getAttribute('data-oi'))];
        if (el.type === 'checkbox') { if (el.checked) o[of] = true; else delete o[of]; }
        else if (of === 'max') { if (el.value === '') delete o.max; else o.max = Number(el.value); }
        else if (of === 'image') { if (el.value.trim()) o.image = el.value.trim(); else delete o.image; }
        else o[of] = el.value;
        refreshPrev(el); return A.markDirty(); }
      var qf = el.getAttribute('data-qf');
      if (qf && ((el.tagName === 'INPUT' && el.type !== 'checkbox') || el.tagName === 'TEXTAREA') && ['id', 'menu'].indexOf(qf) < 0) {
        var q0 = qref(el).q, k0 = el.getAttribute('data-k');
        if (k0 === 'n') { if (el.value === '') delete q0[qf]; else q0[qf] = Number(el.value); } else { if (el.value === '' && qf !== 'label' && qf !== 'text') delete q0[qf]; else q0[qf] = el.value; }
        if (qf === 'label') { var sm = el.closest('.qcard').querySelector('.qsum'); if (sm) sm.textContent = el.value.slice(0, 60) || '(내용 없음)'; }
        refreshPrev(el); return A.markDirty();
      }
      var qz = el.getAttribute('data-qz');
      if (qz === 'anstext') { var q1 = qref(el).q, parts = el.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean); q1.answer = parts.length > 1 ? parts : (parts[0] || ''); return A.markDirty(); }
      if (qz === 'ansnum') { var q2 = qref(el).q; q2.answer = el.value === '' ? '' : Number(el.value); return A.markDirty(); }
      var cf = el.getAttribute('data-cf');
      if (cf === 'v' && el.tagName === 'INPUT') { var tg = target(el), ci = Number(el.closest('[data-ci]').getAttribute('data-ci')), pc = parseCond(tg.showIf); pc.list[ci].v = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value; setClauses(tg, pc.mode, pc.list); return A.markDirty(); }
    };
    box.onchange = function (e) {
      var el = e.target; if (el.closest('#qroot .qprev')) return;
      var df = el.getAttribute('data-df');
      if (df) {
        var k = el.getAttribute('data-k'), v = el.value;
        if (k === 'n') v = v === '' ? undefined : Number(v); else if (k === 'tri') v = v === '' ? undefined : v === 'true'; else if (v === '') v = undefined;
        var parts = df.split('.'), o = d; parts.slice(0, -1).forEach(function (p) { o[p] = o[p] || {}; o = o[p]; });
        if (v === undefined) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = v;
        if (df === 'edit') { if (v === undefined) delete d.features.edit; else d.features.edit = { hours: Number(v) }; A._setOpen = true; return redraw(); }
        if (df === 'identity') { applyIdentity(d, v); A._setOpen = true; return redraw(); }
        if (df === 'mode') { if (v === 'general') allQ(d).forEach(function (x) { x.q.scope = 'common'; }); A._setOpen = true; A.renderSurvey(); A.markDirty(); return; }
        A._setOpen = true; if (el.tagName === 'INPUT' && el.type === 'text' || el.getAttribute('data-k') === 'n') return A.markDirty(); return redraw();
      }
      var cm = el.getAttribute('data-cmode'); if (cm !== null) { var tg0 = target(el), pc0 = parseCond(tg0.showIf); setClauses(tg0, el.value, pc0.list); return redraw(); }
      var cf = el.getAttribute('data-cf');
      if (cf) {
        var tg = target(el), ci = Number(el.closest('[data-ci]').getAttribute('data-ci')), pc = parseCond(tg.showIf), c = pc.list[ci];
        var owner = tg.questions ? { sec: tg } : { q: tg, basic: !!el.closest('[data-si="-1"]') }, src;
        if (cf === 'q') { c.q = el.value; src = condSources(owner).filter(function (x) { return x.id === c.q; })[0]; if (src) { c.op = opsFor(src)[0]; var dv = defaultVal(src, c.op); if (dv === undefined) delete c.v; else c.v = dv; } }
        else if (cf === 'op') { c.op = el.value; src = condSources(owner).filter(function (x) { return x.id === c.q; })[0]; if (c.op === 'answered' || c.op === 'empty') delete c.v; else if (c.v === undefined && src) c.v = defaultVal(src, c.op); }
        else if (cf === 'v') { var sr = condSources(owner).filter(function (x) { return x.id === c.q; })[0]; c.v = (sr && (sr.type === 'scale' || NUMERIC.indexOf(sr.type) >= 0)) ? Number(el.value) : el.value; }
        setClauses(tg, pc.mode, pc.list); return redraw();
      }
      var qz = el.getAttribute('data-qz');
      if (qz) {
        var q = qref(el).q;
        if (qz === 'on') { if (el.checked) { q.answer = q.type === 'multi' ? [] : q.type === 'scale' ? ((SVY.scaleOf(d, q)[0] || {}).v) : ''; if (q.points == null) q.points = 1; } else { delete q.answer; delete q.points; } return redraw(); }
        if (qz === 'ans') { q.answer = el.value; return redraw(); }
        if (qz === 'ansnum') { q.answer = el.value === '' ? '' : Number(el.value); return A.markDirty(); }
        if (qz === 'mans') { var set = {}; el.closest('.sp').querySelectorAll('[data-qz=mans]:checked').forEach(function (c2) { set[c2.value] = 1; }); q.answer = (q.options || []).map(function (o) { return o.id; }).filter(function (id) { return set[id]; }); return A.markDirty(); }
        if (qz === 'chkon') { if (el.checked) { q.check = { valid: ((d.scales[q.scale || 'likert5'] || []).slice(-1)[0] || {}).v }; q.required = true; } else delete q.check; return redraw(); }
        if (qz === 'chkval') { q.check = { valid: Number(el.value) }; return redraw(); }
      }
      var qf = el.getAttribute('data-qf'); if (!qf) return;
      var rf = qref(el), q3 = rf.q, k3 = el.getAttribute('data-k');
      if (((el.tagName === 'INPUT' && el.type !== 'checkbox') || el.tagName === 'TEXTAREA') && ['id', 'menu'].indexOf(qf) < 0) return;   // 입력 중 포커스를 잃지 않도록 다시 그리지 않음
      if (qf === 'id') { var old = q3.id, nid = el.value.trim(); if (nid !== old) { q3.id = nid; if (OPEN[old]) { OPEN[nid] = true; delete OPEN[old]; } renameRefs(old, nid); } return redraw(); }
      if (qf === 'menu') { convert(q3, el.value); return redraw(); }
      if (k3 === 'b') { if (qf === 'required') q3.required = el.checked; else q3[qf] = el.checked; return redraw(); }
      if (qf === 'scale') { q3.scale = el.value; if (q3.check) q3.check = { valid: ((d.scales[el.value] || []).slice(-1)[0] || {}).v }; if (hasAnswer(q3)) q3.answer = (SVY.scaleOf(d, q3)[0] || {}).v; return redraw(); }
      if (k3 === 'n') { if (el.value === '') delete q3[qf]; else q3[qf] = Number(el.value); return redraw(); }
      if (k3 === 's') { if (el.value === '' && ['label', 'text'].indexOf(qf) < 0) delete q3[qf]; else q3[qf] = el.value; if (qf === 'format' && el.value !== 'text') delete q3.multiline; if (qf === 'display' && el.value !== 'image') (q3.options || []).forEach(function (o) { delete o.image; }); return redraw(); }
    };
  };
})();
