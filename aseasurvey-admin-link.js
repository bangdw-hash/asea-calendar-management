'use strict';
/**
 * aseasurvey-admin-link.js — 연동 목록 설문 설계 (일괄 데이터 업로드)
 *  · 「교강사–과목」처럼 응답 대상이 되는 목록(과목·시설·행사·부서 …)을 엑셀로 한 번에 올려 설문과 연동합니다.
 *  · 설계 화면: 시작 유형(프리셋) 또는 AI 설계 → 열 구성 편집 → 엑셀 예시도(실시간) → 양식 xlsx 다운로드 → 설문 만들기
 *  · 「AI 추천 기능」: 현재 구성에 어울리는 열·문항·기능을 제안하고 한 번에 적용합니다.
 *  · 연동 목록 정보는 def.link 에 저장되며, 학생 화면·과목(목록) 탭·엑셀 양식·업로드 해석이 이 값을 따릅니다.
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico, K = SVY.LINK_KEYS;
  var Lk = A.linkdesign = {};
  var D = null, ST = { busy: '', err: '', sug: [], notes: [] };

  /* ───────────── 시작 유형(프리셋) ───────────── */
  function col(label, use, sample) { return { label: label, use: use !== false, sample: sample || '' }; }
  var PRESETS = [
    { k: 'prof', t: '교강사·과목 평가', d: '반별 과목마다 교강사를 평가', unit: '과목', step: '수강 반 선택',
      cols: { track: col('계열', true), grade: col('학년', true), klass: col('반', true), name: col('과목명', true), kind: col('구분(이론/실습)', true), prof: col('담당교수', true) },
      samples: [['항공정비', '2학년', 'A반', '항공역학', '이론', '홍길동'], ['항공정비', '2학년', 'A반', '항공기체실습2', '실습', '김철수'], ['항공정비', '2학년', 'B반', '항공역학', '이론', '이영희']],
      q: [['scale', '강의 내용이 이해하기 쉬웠다.'], ['scale', '교강사가 수업을 성실하게 준비했다.'], ['scale', '이 과목에 전반적으로 만족한다.'], ['text', '개선할 점을 자유롭게 적어 주십시오.']] },
    { k: 'facility', t: '시설·강의실 점검', d: '건물·층별 시설 이용 만족도', unit: '시설', step: '이용한 시설 선택',
      cols: { track: col('건물', true), grade: col('층', true), klass: col('사용 안 함', false), name: col('시설명', true), kind: col('시설 유형', true), prof: col('관리 담당자', true) },
      samples: [['본관', '2층', '', '제1강의실', '강의실', '시설팀 박OO'], ['본관', '3층', '', '컴퓨터실', '실습실', '전산팀 최OO'], ['실습동', '1층', '', '항공기체 실습장', '실습장', '시설팀 박OO']],
      q: [['scale', '시설이 청결하게 관리되고 있다.'], ['scale', '장비·기자재 상태가 양호하다.'], ['scale', '이 시설에 전반적으로 만족한다.'], ['text', '불편했던 점이나 개선 요청을 적어 주십시오.']] },
    { k: 'program', t: '행사·프로그램별 만족도', d: '여러 프로그램 중 참여한 것만 평가', unit: '프로그램', step: '참여한 프로그램 선택',
      cols: { track: col('행사 구분', true), grade: col('사용 안 함', false), klass: col('사용 안 함', false), name: col('프로그램명', true), kind: col('운영 방식', true), prof: col('담당자·진행자', true) },
      samples: [['취업특강', '', '', '항공사 채용설명회', '특강', '진로지원팀 정OO'], ['취업특강', '', '', '면접 클리닉', '실습', '진로지원팀 정OO'], ['비교과', '', '', '안전교육', '교육', '학생지원팀 한OO']],
      q: [['scale', '프로그램의 내용이 유익했다.'], ['scale', '운영 진행이 원활했다.'], ['scale', '다른 학생에게도 추천하고 싶다.'], ['text', '건의사항을 적어 주십시오.']] },
    { k: 'dept', t: '부서·업무 서비스 평가', d: '부서별 업무 서비스 만족도', unit: '부서', step: '평가할 부서 선택',
      cols: { track: col('부서군', true), grade: col('사용 안 함', false), klass: col('사용 안 함', false), name: col('부서·업무명', true), kind: col('업무 유형', true), prof: col('담당자', true) },
      samples: [['행정지원', '', '', '학사지원팀 수강신청', '학사', '김OO'], ['행정지원', '', '', '시설팀 수리 접수', '시설', '이OO'], ['학생지원', '', '', '상담센터', '상담', '박OO']],
      q: [['scale', '요청한 업무가 신속하게 처리되었다.'], ['scale', '담당자가 친절하게 응대했다.'], ['scale', '이용한 서비스에 전반적으로 만족한다.'], ['text', '개선 의견을 적어 주십시오.']] },
    { k: 'custom', t: '직접 구성', d: '목록 이름과 열을 처음부터 지정', unit: '항목', step: '평가할 항목 선택',
      cols: { track: col('분류', true), grade: col('사용 안 함', false), klass: col('사용 안 함', false), name: col('항목명', true), kind: col('유형', false), prof: col('담당자', false) },
      samples: [['분류A', '', '', '항목 1', '', ''], ['분류A', '', '', '항목 2', '', ''], ['분류B', '', '', '항목 3', '', '']],
      q: [['scale', '전반적으로 만족한다.'], ['text', '의견을 자유롭게 적어 주십시오.']] }
  ];
  function pre(k) { return PRESETS.filter(function (p) { return p.k === k; })[0]; }
  function fromPreset(p) {
    var cols = {}; K.forEach(function (k) { cols[k] = Object.assign({}, p.cols[k]); });
    return { preset: p.k, title: '', unit: p.unit, step: p.step, cols: cols, samples: p.samples.map(function (r) { return r.slice(); }), q: p.q.map(function (x) { return { type: x[0], label: x[1] }; }), ticket: false, desc: '' };
  }
  // 샘플 행 = [track, grade, klass, name, kind, prof] 배열 (K 순서와 동일)
  var ORDER = K;  // track, grade, klass, name, kind, prof

  /* ───────────── 정의(def) 생성 · 정리 ───────────── */
  Lk.clean = A.cleanLink = function (l) {
    var out = { unit: String(l.unit || '항목').slice(0, 20), stepTitle: String(l.stepTitle || '').slice(0, 40), cols: {}, samples: [] };
    K.forEach(function (k) { var c = (l.cols || {})[k] || {}; out.cols[k] = { label: String(c.label || '').slice(0, 24) || k, use: k === 'name' ? true : c.use !== false, sample: String(c.sample || '').slice(0, 40) }; });
    (l.samples || []).slice(0, 5).forEach(function (r) { var o = {}; K.forEach(function (k) { o[k] = String((r && r[k]) || '').slice(0, 40); }); out.samples.push(o); });
    return out;
  };
  function rowsAsObjects() { return D.samples.map(function (r) { var o = {}; ORDER.forEach(function (k, i) { o[k] = r[i] || ''; }); return o; }); }
  Lk.buildDef = function () {
    var title = D.title.trim() || (D.unit + '별 평가 설문');
    var raw;
    if (D.preset === 'prof' && !D.edited) { var base = JSON.parse(JSON.stringify(window.SVY_TEMPLATE.def)); base.intro.title = title; raw = base; }
    else {
      raw = { mode: 'course', intro: { title: title, subtitle: D.desc || '', org: '아세아항공직업전문학교', notice: [{ k: '목적', v: D.desc || (D.unit + '별 만족도 조사입니다.') }, { k: '참여 방법', v: '평가할 ' + D.unit + '을(를) 선택한 뒤 항목마다 응답해 주십시오.' }] },
        sections: [{ id: 'S1', title: D.unit + ' 평가', note: '', questions: D.q.map(function (x, i) { var q = { type: x.type, label: x.label, required: x.type !== 'text' }; if (x.type === 'scale') q.scale = 'likert5'; if (x.options) q.options = x.options.map(function (o) { return { label: o }; }); return q; }) }] };
    }
    var def = A.normalizeDef(raw).def; def.mode = 'course';
    if (D.ticket) def.features = Object.assign({}, def.features, { ticket: true });
    def.link = Lk.clean({ unit: D.unit, stepTitle: D.step, cols: D.cols, samples: rowsAsObjects() });
    return def;
  };

  /* ───────────── 엑셀 양식(xlsx) ───────────── */
  function usedKeys(l) { return K.filter(function (k) { return l.cols[k].use; }); }
  function guide(l, used) {
    var req = used.filter(function (k) { return k !== 'prof' && k !== 'kind'; }).map(function (k) { return l.cols[k].label; });
    var g = ['작성 안내', '1. 「' + l.unit + '등록」 시트의 첫 행(머리글)은 수정하지 말고, 둘째 행부터 한 행에 ' + l.unit + ' 하나씩 입력합니다.',
      '2. 필수 열: ' + req.join(', ') + '. 비워 두면 등록되지 않고 오류로 표시됩니다.'];
    if (l.cols.kind.use) g.push('3. 「' + l.cols.kind.label + '」은 선택 입력입니다. 비워도 됩니다.');
    if (l.cols.prof.use) g.push('4. 「' + l.cols.prof.label + '」은 학생 화면에 과목과 함께 표시되고 결과 집계(담당자별 보기)에도 사용합니다. 선택 입력입니다.');
    g.push('5. 같은 [' + req.join(' + ') + '] 조합이 두 번 나오면 중복 오류로 표시됩니다. 같은 이름이라도 구분이 필요하면 다른 열 값을 다르게 입력합니다.');
    g.push('6. 「(예시)」로 시작하는 행은 등록되지 않습니다. 예시 행은 지우거나 그대로 두셔도 됩니다.');
    g.push('7. 설계 화면에서 사용하지 않기로 한 열은 양식에 포함되지 않습니다.');
    if (l.cols.grade.use && l.cols.klass.use === false) g.push('8. 이 설문은 [' + usedKeys(l).slice(0, 2).map(function (k) { return l.cols[k].label; }).join(' → ') + '] 순으로 학생이 단계별 선택을 합니다.');
    return g.filter(function (x) { return !/\(\)/.test(x); });
  }
  A.linkTemplate = Lk.template = function (def) {
    if (!window.XLSX) return A.toast('엑셀 라이브러리를 불러오지 못했습니다.', 'err');
    var l = SVY.linkInfo(def), used = usedKeys(l), samples = ((def.link && def.link.samples) || []).filter(function (r) { return r.name; });
    var head = used.map(function (k) { return l.cols[k].label; });
    var aoa = [head];
    samples.forEach(function (r, i) { aoa.push(used.map(function (k, j) { var v = r[k] || ''; return i === 0 && j === 0 ? '(예시)' + v : v; })); });
    if (!samples.length) aoa.push(used.map(function (k, j) { return (j === 0 ? '(예시)' : '') + (l.cols[k].sample || '예시 값'); }));
    var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = used.map(function (k) { return { wch: k === 'name' ? 28 : 16 }; }); XLSX.utils.book_append_sheet(wb, ws, (l.unit + '등록').slice(0, 25));
    var ws2 = XLSX.utils.aoa_to_sheet(guide(l, used).map(function (x) { return [x]; })); ws2['!cols'] = [{ wch: 110 }]; XLSX.utils.book_append_sheet(wb, ws2, '작성안내');
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    A.download(new Blob([out], { type: 'application/octet-stream' }), '설문_' + l.unit + '등록_양식.xlsx');
  };

  /* ───────────── 화면 ───────────── */
  function colLetter(i) { return String.fromCharCode(65 + i); }
  function xlHtml() {
    var l = Lk.clean({ unit: D.unit, stepTitle: D.step, cols: D.cols, samples: rowsAsObjects() }), used = usedKeys(l), L = SVY.linkInfo({ link: l });
    var h = '<div class="xlbox"><div class="xltabs"><span class="on">' + E(l.unit) + '등록</span><span>작성안내</span></div><div class="xlscroll"><table class="xl"><thead><tr><th></th>' + used.map(function (k, i) { return '<th>' + colLetter(i) + '</th>'; }).join('') + '</tr></thead><tbody>';
    h += '<tr><th>1</th>' + used.map(function (k) { return '<td class="xh">' + E(l.cols[k].label) + '</td>'; }).join('') + '</tr>';
    var rows = rowsAsObjects().filter(function (r) { return r.name; }).slice(0, 4);
    rows.forEach(function (r, i) { h += '<tr><th>' + (i + 2) + '</th>' + used.map(function (k, j) { return '<td>' + E((i === 0 && j === 0 ? '(예시)' : '') + (r[k] || '')) + '</td>'; }).join('') + '</tr>'; });
    h += '<tr><th>' + (rows.length + 2) + '</th>' + used.map(function () { return '<td class="xe">…</td>'; }).join('') + '</tr></tbody></table></div>' +
      '<div class="xlreq">' + used.map(function (k) { var req = k !== 'prof' && k !== 'kind'; return '<span class="tag' + (req ? ' blue' : '') + '">' + E(l.cols[k].label) + ': ' + (req ? '필수' : '선택') + (k === 'prof' ? ' · 학생 화면에도 표시' : '') + '</span>'; }).join(' ') + '</div>' +
      '<ul class="xlguide">' + guide(l, used).slice(1, 7).map(function (g) { return '<li>' + E(g.replace(/^\d+\.\s*/, '')) + '</li>'; }).join('') + '</ul></div>';
    // 학생 선택 흐름
    var steps = ['track', 'grade', 'klass'].filter(function (k) { return l.cols[k].use; }).map(function (k) { return l.cols[k].label; });
    h += '<div class="flowbox"><b>학생 화면 흐름</b><div class="flow">' + steps.concat([l.unit + ' 목록 확인', '항목마다 응답']).map(function (s, i) { return (i ? '<span class="arr">→</span>' : '') + '<span class="chipx">' + E(s) + '</span>'; }).join('') + '</div></div>';
    return h;
  }
  function colEditor() {
    var h = '<div class="tbl-wrap"><table class="t lk-cols"><thead><tr><th>사용</th><th>역할</th><th>열 이름(학생·엑셀에 표시)</th><th>예시 1</th><th>예시 2</th><th>예시 3</th></tr></thead><tbody>';
    var role = { track: '1단계 선택(분류)', grade: '2단계 선택', klass: '3단계 선택', name: '평가 대상 이름 (필수)', kind: '보조 구분 (선택)', prof: '담당자 — 학생 화면에도 표시 (선택)' };
    K.forEach(function (k) {
      var c = D.cols[k], i = ORDER.indexOf(k);
      h += '<tr data-k="' + k + '"><td><input type="checkbox" data-lk="use" ' + (c.use ? 'checked' : '') + (k === 'name' ? ' disabled' : '') + '></td><td class="muted" style="font-size:12.5px">' + role[k] + '</td><td><input class="fld" data-lk="label" value="' + E(c.label) + '" ' + (c.use ? '' : 'disabled') + ' style="min-width:140px"></td>' +
        [0, 1, 2].map(function (r) { return '<td><input class="fld" data-lk="s' + r + '" value="' + E((D.samples[r] || [])[i] || '') + '" ' + (c.use ? '' : 'disabled') + ' style="min-width:100px"></td>'; }).join('') + '</tr>';
    });
    return h + '</tbody></table></div>';
  }
  function qList() {
    return D.q.map(function (q, i) { return '<li><span class="tag">' + (q.type === 'text' ? '서술' : q.type === 'single' ? '선택' : '5점 척도') + '</span> <input class="fld" data-lq="' + i + '" value="' + E(q.label) + '" style="flex:1;min-width:200px"><button class="btn btn-ghost btn-sm" data-act="lkqdel" data-i="' + i + '" style="color:var(--red)" aria-label="삭제">' + I('trash', 13) + '</button></li>'; }).join('');
  }
  function sugHtml() {
    if (ST.busy === 'sug') return '<div class="loading">AI가 이 구성에 어울리는 기능을 찾는 중입니다…</div>';
    if (!ST.sug.length) return '';
    return '<div class="sugs">' + ST.sug.map(function (s, i) { return '<div class="sug' + (s.done ? ' done' : '') + '"><div class="sp"><b>' + E(s.title) + '</b><div class="muted" style="font-size:12.5px">' + E(s.why || '') + '</div><div class="muted" style="font-size:12px">' + E(s.summary || '') + '</div></div><button class="btn btn-secondary btn-sm" data-act="lksug" data-i="' + i + '" ' + (s.done ? 'disabled' : '') + '>' + (s.done ? '적용됨' : '적용') + '</button></div>'; }).join('') + '</div>';
  }
  function page() {
    var h = '<div class="crumb"><a data-act="tolist">설문 목록</a> / 연동 목록 설문</div><div class="pg-head"><h1>연동 목록 설문 설계 <small class="muted" style="font-size:13px">일괄 데이터 업로드</small></h1></div>' +
      '<p class="muted" style="margin:0 0 12px">교강사·과목처럼 <b>실제 데이터가 많은 목록</b>을 엑셀로 한 번에 올려 설문과 연결합니다. 학생은 올려 둔 목록에서 대상을 고르고, 대상마다 같은 문항에 응답합니다. 목록의 열 구성은 아래에서 직접 정하거나 AI에게 맡길 수 있습니다.</p>' +
      '<div class="panel"><h3 class="rsec" style="margin-top:0">1. 시작 유형</h3><div class="tgrid">' + PRESETS.map(function (p) { return '<div class="tcard' + (D.preset === p.k ? ' sel' : '') + '" data-act="lkpre" data-k="' + p.k + '"><h4>' + E(p.t) + '</h4><p>' + E(p.d) + '</p></div>'; }).join('') + '</div>' +
      '<div class="aiblk"><label class="f">' + I('sparkle', 14) + ' AI 설계 — 어떤 목록을 올리고 싶은지 적어 주십시오</label><textarea class="fld" id="lkai" rows="3" placeholder="예) 실습실 20곳의 장비 상태를 학생이 층별로 골라 평가하고, 시설 담당자별로 결과를 보고 싶습니다. 파일이 있으면 아래에서 함께 올려 주십시오.">' + E(D.aiText || '') + '</textarea>' +
      '<div class="row" style="margin-top:6px"><input type="file" id="lkfile" class="hide" accept=".xlsx,.xls,.csv,.txt,.docx"><button class="btn btn-secondary btn-sm" data-act="lkpick">' + I('upload', 14) + ' 가지고 있는 엑셀 불러와서 열 구성 맞추기</button><span class="muted" style="font-size:12.5px">' + E(D.aiFile || '') + '</span><span class="sp"></span><button class="btn btn-primary btn-sm" data-act="lkai" ' + (ST.busy === 'ai' ? 'disabled' : '') + '>' + I('sparkle', 14) + ' AI로 설계</button></div>' +
      (ST.err ? '<div class="msg err">' + I('alert', 18) + '<div>' + E(ST.err) + '</div></div>' : '') + (ST.busy === 'ai' ? '<div class="loading">AI가 목록 구성을 설계하는 중입니다… (보통 20~60초)</div>' : '') + (ST.notes.length ? '<div class="msg">' + I('info', 16) + '<div><b>AI 메모</b><br>' + ST.notes.map(E).join('<br>') + '</div></div>' : '') + '</div></div>' +
      '<div class="panel"><h3 class="rsec" style="margin-top:0">2. 설문 정보와 열 구성</h3><div class="grid g3"><div><label class="f">설문 제목</label><input class="fld" id="lkt" value="' + E(D.title) + '" placeholder="예: 2026학년도 2학기 시설 이용 만족도"></div><div><label class="f">목록 이름 (예: 과목, 시설, 프로그램)</label><input class="fld" data-lk2="unit" value="' + E(D.unit) + '"></div><div><label class="f">학생 화면 첫 제목</label><input class="fld" data-lk2="step" value="' + E(D.step) + '"></div></div><div id="lkcols" style="margin-top:10px">' + colEditor() + '</div>' +
      '<p class="hint">사용하지 않는 열은 체크를 끄면 양식과 학생 화면에서 빠집니다. 예시 값은 엑셀 예시도와 양식 파일에 그대로 들어갑니다.</p></div>' +
      '<div class="panel"><div class="row"><h3 class="rsec" style="margin:0">3. 엑셀 양식 예시도</h3><span class="sp"></span><button class="btn btn-secondary btn-sm" data-act="lksugs" ' + (ST.busy ? 'disabled' : '') + '>' + I('sparkle', 14) + ' AI 추천 기능</button></div><div id="lksug">' + sugHtml() + '</div><div id="lkxl" style="margin-top:8px">' + xlHtml() + '</div></div>' +
      '<div class="panel"><h3 class="rsec" style="margin-top:0">4. 설문 문항 (요약 — 만든 뒤 문항 탭에서 자세히 고칠 수 있습니다)</h3>' + (D.preset === 'prof' && !D.edited ? '<p class="muted" style="margin:0">교강사·과목 평가는 기본 양식(교육과정 개선 설문)의 문항을 그대로 사용합니다.</p>' : '<ul class="lkq" id="lkq">' + qList() + '</ul><button class="btn btn-ghost btn-sm" data-act="lkqadd">' + I('plus', 13) + ' 문항 추가</button>') + '</div>' +
      '<div class="startbar on"><div class="sp"><b>양식을 내려받아 목록을 채운 뒤 올립니다</b><div class="muted" style="font-size:12.5px">설문을 만들면 「' + E(D.unit) + ' 목록」 탭에서 엑셀 업로드·AI 자동 매핑·붙여넣기로 등록할 수 있습니다.</div></div><button class="btn btn-secondary" data-act="lkdl">' + I('download', 16) + ' 엑셀 양식 다운로드</button><button class="btn btn-primary" data-act="lkmake">' + I('check', 16) + ' 이 구성으로 설문 만들기</button></div>';
    return h;
  }
  function paintXl() { var x = document.getElementById('lkxl'); if (x) x.innerHTML = xlHtml(); pushPreview(); }
  function pushPreview() {
    if (!A.pv || !A.pv.setSource) return;
    var def = Lk.buildDef(), cs = D.samples.filter(function (r) { return r[3]; }).map(function (r, i) { return { id: 's' + i, active: true, track: r[0] || '-', grade: r[1] || '-', klass: r[2] || '-', name: r[3], kind: r[4], prof: r[5] }; });
    clearTimeout(Lk._pt); Lk._pt = setTimeout(function () { var keep = A.pv.page; A.pv.setSource({ def: def, label: '연동 목록 설문', courses: cs }); if (keep && keep !== 'intro') A.pv.focusPage(keep); }, 150);
  }
  Lk.show = function (preset) {
    A.view = 'link'; A.cur = null; A.work = null; if (location.hash !== '#/link') history.replaceState(null, '', '#/link');
    if (!D) D = fromPreset(pre('facility'));
    if (preset) D = fromPreset(pre(preset));
    A.shell(page()); pushPreview();
  };
  function repaint() { var m = A.main(); if (m && A.view === 'link') { var y = window.scrollY; m.innerHTML = page(); window.scrollTo(0, y); pushPreview(); } }

  /* ───────────── AI ───────────── */
  function models() { return [(A.ext.aiModels[0] || [])[0]].concat(A.ext.aiModels.map(function (m) { return m[0]; })).filter(function (m, i, a) { return m && a.indexOf(m) === i; }); }
  async function ask(system, content) {
    var text = null, err; var ms = models();
    for (var i = 0; i < ms.length && text == null; i++) { try { text = await A.ext.aiCall(system, content, ms[i]); } catch (e) { err = e; if (!(e.status === 404 || /model/i.test(e.message))) break; } }
    if (text == null) throw err;
    var s = String(text).trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim(), a = s.indexOf('{'); if (a > 0) s = s.slice(a);
    try { return JSON.parse(s); } catch (e) { var b = s.lastIndexOf('}'); if (b > 0) return JSON.parse(s.slice(0, b + 1)); throw new Error('AI 응답을 해석하지 못했습니다. 다시 시도해 주십시오.'); }
  }
  var SYS_DESIGN = '당신은 학교 설문 설계 도우미입니다. 사용자가 올리려는 「연동 목록」(응답 대상이 되는 목록. 예: 과목·시설·프로그램·부서)에 맞춰 엑셀 열 구성과 문항을 설계합니다.\n' +
    '목록 한 행은 평가 대상 1개이며 최대 6개 열을 쓸 수 있습니다. 열 키: track(1단계 선택 분류), grade(2단계 선택), klass(3단계 선택), name(평가 대상 이름, 필수·항상 사용), kind(보조 구분, 선택), prof(담당자, 학생 화면에도 표시, 선택). 쓰지 않는 열은 use:false 로 합니다. 학생은 track→grade→klass 순으로 고른 뒤 해당 목록의 name 마다 응답하므로, 목록 크기에 맞게 필요한 단계만 쓰고 단계 수는 최소로 합니다.\n' +
    '출력은 JSON 객체 하나만 작성합니다(설명·코드펜스 금지). 형식: {"title":"설문 제목","unit":"목록 이름(예: 시설)","stepTitle":"학생 화면 첫 제목(예: 이용한 시설 선택)","cols":{"track":{"use":true,"label":"열 이름","sample":""},"grade":{…},"klass":{…},"name":{"use":true,"label":"…"},"kind":{…},"prof":{…}},"samples":[{"track":"","grade":"","klass":"","name":"","kind":"","prof":""}(실제처럼 보이는 예시 3행, 개인 실명은 「박OO」처럼 가림)],"questions":[{"type":"scale|text|single","label":"문항","options":["선택지"](single일 때)}](3~8개, 마지막은 서술 의견 1개),"notes":["설계 판단 이유와 사용자가 확인할 점"]}\n입력에 없는 사실을 지어내지 않습니다. 첨부된 엑셀·문서가 있으면 그 머리글과 값을 참고해 열 이름과 예시를 맞춥니다.';
  var SYS_SUG = '당신은 학교 설문 설계 도우미입니다. 아래 「현재 연동 목록 설문 구성」에 도움이 될 추가 기능을 3~6개 제안합니다. 제안은 반드시 다음 세 종류 중 하나로, 바로 적용 가능한 형태여야 합니다.\n' +
    '1) {"kind":"cols","title":"…","why":"이유","cols":{"prof":{"use":true,"label":"…"}}} — 열 사용 여부·이름 변경\n2) {"kind":"question","title":"…","why":"이유","question":{"type":"scale|text|single","label":"…","options":["…"]}} — 문항 추가\n3) {"kind":"ticket","title":"추첨번호 발급","why":"이유"} — 참여 독려용 추첨번호 제공\n출력은 JSON 객체 하나만: {"suggestions":[…]}. 이미 있는 문항·열과 겹치는 제안은 하지 않습니다. 데이터 업로드·결과 집계에서 실무에 도움이 되는 것(담당자별 비교, 서술 의견, 이용 빈도, 개선 우선순위 등)을 우선합니다.';
  function configText() {
    return JSON.stringify({ title: D.title, unit: D.unit, stepTitle: D.step, cols: D.cols, samples: rowsAsObjects(), questions: D.q.map(function (q) { return { type: q.type, label: q.label }; }), ticket: !!D.ticket });
  }
  function applyDesign(j) {
    var d = fromPreset(pre('custom')); d.preset = 'custom'; d.edited = true;
    d.title = String(j.title || '').slice(0, 80); d.unit = String(j.unit || '항목').slice(0, 20); d.step = String(j.stepTitle || (d.unit + ' 선택')).slice(0, 40);
    K.forEach(function (k) { var c = (j.cols || {})[k] || {}; d.cols[k] = { label: String(c.label || d.cols[k].label), use: k === 'name' ? true : c.use !== false && (c.use === true || !!c.label), sample: '' }; });
    d.samples = (j.samples || []).slice(0, 3).map(function (r) { return ORDER.map(function (k) { return String((r && r[k]) || ''); }); }); while (d.samples.length < 3) d.samples.push(['', '', '', '', '', '']);
    d.q = (j.questions || []).slice(0, 12).map(function (q) { var t = ['scale', 'text', 'single'].indexOf(q.type) >= 0 ? q.type : 'text'; return Object.assign({ type: t, label: String(q.label || '') }, t === 'single' && Array.isArray(q.options) ? { options: q.options.map(String).slice(0, 10) } : {}); }).filter(function (q) { return q.label; });
    if (!d.q.length) d.q = pre('custom').q.map(function (x) { return { type: x[0], label: x[1] }; });
    d.aiText = D.aiText; d.aiFile = D.aiFile; D = d; ST.notes = (j.notes || []).map(String).slice(0, 6);
  }
  async function readFileText(f) {
    var low = f.name.toLowerCase();
    if (/\.(xlsx|xls|csv)$/.test(low) && window.XLSX) {
      var wb = /\.csv$/.test(low) ? XLSX.read(await f.text(), { type: 'string' }) : XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array' }), out = [];
      wb.SheetNames.slice(0, 3).forEach(function (n) { out.push('[시트: ' + n + ']\n' + XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' }).slice(0, 25).map(function (r) { return r.join('\t'); }).join('\n')); });
      return out.join('\n\n');
    }
    return (await f.text()).slice(0, 12000);
  }

  /* ───────────── 만들기 ───────────── */
  async function make() {
    var def = Lk.buildDef(), lint = A.lintDef ? A.lintDef(def) : { errs: [] };
    if (lint.errs.length && !await A.confirm('점검 오류가 있습니다', E(lint.errs.slice(0, 4).join('\n')).replace(/\n/g, '<br>') + '<br>그래도 만들고 문항 탭에서 고치시겠습니까?', '만들기', '취소')) return;
    try {
      var r = await A.rpc('svy_a_create', { p_title: def.intro.title, p_semester: '', p_def: def, p_theme: {} });
      A.toast('설문을 만들었습니다. 이제 목록을 등록해 주십시오.'); location.hash = '#/s/' + r.id + '/courses';
    } catch (e) { A.toast(e.message, 'err'); }
  }

  /* ───────────── 이벤트 ───────────── */
  document.addEventListener('click', async function (e) {
    var t = e.target.closest('[data-act]'); if (!t || A.view !== 'link') return; var act = t.getAttribute('data-act');
    if (act === 'lkpre') { var k = t.getAttribute('data-k'), keep = { title: D.title, aiText: D.aiText, aiFile: D.aiFile }; D = fromPreset(pre(k)); Object.assign(D, keep); ST.notes = []; ST.sug = []; return repaint(); }
    if (act === 'lkdl') return Lk.template(Lk.buildDef());
    if (act === 'lkmake') return make();
    if (act === 'lkqadd') { D.q.push({ type: 'scale', label: '' }); D.edited = true; return repaint(); }
    if (act === 'lkqdel') { D.q.splice(Number(t.getAttribute('data-i')), 1); D.edited = true; return repaint(); }
    if (act === 'lkpick') return document.getElementById('lkfile').click();
    if (act === 'lkai') {
      D.aiText = document.getElementById('lkai').value; if (!D.aiText.trim() && !D.aiFile) { ST.err = '만들려는 목록을 간단히 적거나 엑셀을 불러와 주십시오.'; return repaint(); }
      ST.err = ''; ST.busy = 'ai'; repaint();
      try { var j = await ask(SYS_DESIGN, [{ type: 'text', text: (D.aiFileText ? '[첨부 파일: ' + D.aiFile + ']\n' + D.aiFileText + '\n\n' : '') + '[요청]\n' + (D.aiText || '(첨부 파일을 보고 설계하십시오)') }]); applyDesign(j); ST.sug = []; } catch (er) { ST.err = er.message; }
      ST.busy = ''; return repaint();
    }
    if (act === 'lksugs') {
      ST.busy = 'sug'; ST.err = ''; var box = document.getElementById('lksug'); if (box) box.innerHTML = sugHtml();
      try { var js = await ask(SYS_SUG, [{ type: 'text', text: '[현재 연동 목록 설문 구성]\n' + configText() }]); ST.sug = (js.suggestions || []).slice(0, 8).map(function (s) { s.summary = s.kind === 'cols' ? '열 변경: ' + Object.keys(s.cols || {}).join(', ') : s.kind === 'question' ? '문항 추가: ' + ((s.question || {}).label || '') : s.kind === 'ticket' ? '설정: 추첨번호 발급' : ''; return s; }).filter(function (s) { return ['cols', 'question', 'ticket'].indexOf(s.kind) >= 0; }); if (!ST.sug.length) ST.err = '제안할 만한 추가 기능을 찾지 못했습니다.'; } catch (er) { ST.err = er.message; }
      ST.busy = ''; return repaint();
    }
    if (act === 'lksug') {
      var s = ST.sug[Number(t.getAttribute('data-i'))]; if (!s || s.done) return;
      if (s.kind === 'cols') K.forEach(function (k) { var c = (s.cols || {})[k]; if (c) D.cols[k] = { label: String(c.label || D.cols[k].label), use: k === 'name' ? true : c.use !== false, sample: '' }; });
      else if (s.kind === 'question' && s.question && s.question.label) { var q = s.question, tp = ['scale', 'text', 'single'].indexOf(q.type) >= 0 ? q.type : 'text'; var last = D.q[D.q.length - 1]; var nq = Object.assign({ type: tp, label: String(q.label) }, tp === 'single' && Array.isArray(q.options) ? { options: q.options.map(String) } : {}); if (last && last.type === 'text') D.q.splice(D.q.length - 1, 0, nq); else D.q.push(nq); D.edited = true; }
      else if (s.kind === 'ticket') D.ticket = true;
      s.done = true; return repaint();
    }
  });
  document.addEventListener('change', async function (e) {
    if (A.view !== 'link') return;
    if (e.target.id === 'lkfile') {
      var f = e.target.files[0]; if (!f) return; e.target.value = '';
      try { D.aiFile = f.name; D.aiFileText = await readFileText(f); ST.err = ''; } catch (er) { ST.err = '파일을 읽을 수 없습니다: ' + er.message; }
      return repaint();
    }
    if (e.target.matches('[data-lk=use]')) { var tr = e.target.closest('tr'), k = tr.getAttribute('data-k'); D.cols[k].use = e.target.checked; tr.querySelectorAll('input.fld').forEach(function (x) { x.disabled = !e.target.checked; }); paintXl(); }
  });
  document.addEventListener('input', function (e) {
    if (A.view !== 'link') return; var el = e.target;
    if (el.id === 'lkt') { D.title = el.value; return pushPreview(); }
    if (el.id === 'lkai') { D.aiText = el.value; return; }
    var m2 = el.getAttribute('data-lk2'); if (m2) { if (m2 === 'unit') D.unit = el.value; else D.step = el.value; return paintXl(); }
    var lq = el.getAttribute('data-lq'); if (lq != null) { D.q[Number(lq)].label = el.value; D.edited = true; return pushPreview(); }
    var lk = el.getAttribute('data-lk'); if (!lk) return; var tr = el.closest('tr'), k = tr.getAttribute('data-k');
    if (lk === 'label') D.cols[k].label = el.value;
    else if (/^s\d$/.test(lk)) { var r = Number(lk.slice(1)); D.samples[r] = D.samples[r] || ['', '', '', '', '', '']; D.samples[r][ORDER.indexOf(k)] = el.value; }
    paintXl();
  });
  window.addEventListener('hashchange', function () { /* 라우팅은 admin.js 가 처리 */ });
})();
