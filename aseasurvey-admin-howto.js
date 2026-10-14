'use strict';
/**
 * aseasurvey-admin-howto.js — 양식별 진행 순서(매뉴얼) · 탭별 팁박스
 *  · A.howto.plan(def)   : 설문 정의(연동 목록·퀴즈·정원·기명·추첨 …)를 읽어 「이 설문은 이렇게 진행합니다」 단계 목록을 만듭니다.
 *  · 새 설문 만들기: 양식을 고르면 시작 막대에 진행 순서가 한 줄로 표시되고, 「자세한 순서」에서 단계별 설명을 봅니다.
 *  · 설문 화면: 상단 길잡이(guide)의 단계가 이 계획을 따르며, 각 탭 위에 「이 탭에서 할 일」 팁박스가 표시됩니다(접기·다시 보기 가능).
 */
(function () {
  var A = window.SVYA, E = SVY.esc, I = SVY.ico;
  var H = A.howto = {};

  function has(d, f) { return SVY.allQuestions(d).some(function (x) { return f(x.q); }); }
  function colsText(lk) { var a = []; SVY.LINK_KEYS.forEach(function (k) { if (!lk.cols[k].use) return; a.push(lk.cols[k].label); if (k === 'klass') a.push('재적인원(명)'); }); return a.join(', '); }

  /* ───────────── 진행 계획 ───────────── */
  H.plan = function (d) {
    d = d || {}; var gen = d.mode === 'general', lk = SVY.linkInfo(d), P = [], f = d.features || {};
    P.push({ id: 'intro', tab: 'intro', t: '안내문', s: '안내문 확인', why: '학생이 시작 전에 처음 보는 설명 화면입니다. 제목·목적·대상·소요 시간 안내를 확인해 주십시오.' });
    var q = '고르신 양식의 문항이 그대로 들어 있습니다. 문항 카드를 눌러 펼쳐 문구·선택지를 고치고, 추가·삭제·순서 변경을 할 수 있습니다.';
    q += ' 일부 구간만 AI에게 맡기려면 문항 탭의 「AI 구간 설계」를 쓰십시오.';
    P.push({ id: 'q', tab: 'questions', t: '문항', s: '문항 확인·수정', why: q });
    if (!gen) {
      var cols = colsText(lk), un = lk.custom ? lk.unit : '과목';
      P.push({ id: 'c', tab: 'courses', t: lk.custom ? un + ' 목록' : '과목·교수', s: un + ' 일괄 등록', why: '학생이 고를 「' + un + '」 목록을 엑셀로 한 번에 등록합니다. ① 「엑셀 양식 다운로드」 ② 한 행에 ' + (lk.custom && lk.unit !== '과목' ? '하나씩' : '한 반의 한 과목씩') + ' 작성(열: ' + cols + ') ③ 「엑셀 업로드」 → 미리보기 확인 → 「등록」. 가진 시간표·PDF가 있으면 「AI 불러오기」로 표를 자동 정리할 수 있습니다.' });
      if (lk.cols.track.use && lk.cols.grade.use) P.push({ id: 'h', tab: 'targets', t: '대상 인원', s: '대상 인원(선택)', optional: true, why: lk.cols.track.label + '·' + lk.cols.grade.label + '별 배포 인원을 넣으면 결과에서 응답률이 계산됩니다. (선택)' });
    }
    if (has(d, function (x) { return x.answer != null; }) || (d.quiz && d.quiz.show)) P.push({ id: 'quiz', tab: 'questions', t: '정답·배점', s: '정답·배점 확인', why: '퀴즈형입니다. 문항마다 정답과 배점이 맞는지 확인하고, 설문 설정에서 제출 후 점수 표시·통과 기준 점수를 정하십시오.' });
    if (d.limit && d.limit.max || has(d, function (x) { return (x.options || []).some(function (o) { return o.max != null; }); })) P.push({ id: 'limit', tab: 'questions', t: '정원', s: '정원 확인', why: '선착순 인원 또는 선택지별 정원이 설정되어 있습니다. 숫자가 맞는지 확인하십시오. 정원이 차면 학생에게 마감 안내가 나옵니다.' });
    if (d.identity === 'named' || has(d, function (x) { return x.type === 'consent'; })) P.push({ id: 'named', tab: 'questions', t: '개인정보 동의', s: '개인정보 동의 확인', why: '이름·소속 등 개인정보를 받는 설문입니다. 수집 목적·항목·보유 기간 문구를 확인하고, 결과 파일은 필요한 사람만 열람하도록 관리하십시오.' });
    if (has(d, function (x) { return x.type === 'file' || x.type === 'signature' || x.type === 'location' || x.type === 'qr'; })) P.push({ id: 'media', tab: 'questions', t: '현장·첨부 확인', s: '현장·첨부 항목 점검', optional: true, why: '사진 첨부·서명·위치·QR 문항이 있습니다. 휴대폰에서 직접 눌러 동작(카메라·위치 권한)을 확인해 보십시오.' });
    P.push({ id: 'design', tab: 'design', t: '디자인', s: '디자인(선택)', optional: true, why: '학교 색상·글자 크기를 바꿉니다. 기본값으로 두어도 됩니다. (선택)' });
    P.push({ id: 't', tab: 'overview', t: '테스트', s: '테스트 응답', why: '「시작·배포」 탭에서 테스트 모드를 켜고 학생 링크로 직접 응답해 보십시오. 휴대폰 화면과 소요 시간을 확인합니다. 테스트 응답은 정식 시작 때 지워집니다.' });
    P.push({ id: 'audit', tab: 'audit', t: '배포 전 점검', s: '배포 전 점검', why: '연동 데이터, 문항 중복·누락, 분기 논리, 설정을 점검합니다. 오류가 없을 때까지 고친 뒤 정식 시작하십시오. 필요하면 「AI 정밀 점검」도 실행합니다.' });
    P.push({ id: 'l', tab: 'overview', t: '정식 시작', s: '정식 시작·링크 공유', why: '「시작·배포」 탭의 「정식 시작」을 누르면 응답을 받기 시작합니다. 학생 링크와 카카오톡 전달문을 복사해 안내하십시오.' });
    if (f.ticket || (f.ticket == null && !gen)) P.push({ id: 'draw', tab: 'draw', t: '추첨', s: '마감 후 추첨', optional: true, why: '추첨번호를 발급하는 설문입니다. 응답을 마감한 뒤 「추첨」 탭에서 성실도 가중 추첨을 실행하고 결과를 공개합니다. (경품이 있을 때)' });
    P.push({ id: 'res', tab: 'results', t: '결과', s: '결과 확인', optional: true, why: '응답이 쌓이면 「결과 보기」에서 실시간으로 확인하고 엑셀로 내려받을 수 있습니다.' });
    return P;
  };
  H.line = function (d) { var n = 0; return H.plan(d).filter(function (p) { return !p.optional; }).map(function (p) { return (++n) + '. ' + p.s; }).join(' → '); };
  H.modal = function (d, title) {
    var n = 0;
    A.modal('<h3>' + I('info', 16) + ' 진행 순서 — ' + E(title || '이 양식') + '</h3><p class="muted" style="margin:2px 0 8px">이 양식으로 설문을 만든 뒤 아래 순서로 진행합니다. 설문 화면 위쪽 「다음 할 일」 안내가 같은 순서를 따라 알려 줍니다.</p><ol class="howlist">' +
      H.plan(d).map(function (p) { return '<li class="' + (p.optional ? 'opt' : '') + '"><b>' + (p.optional ? '선택 · ' : (++n) + '. ') + E(p.s) + '</b><div class="muted">' + E(p.why) + '</div></li>'; }).join('') + '</ol><div class="btn-row"><button class="btn btn-primary" data-r="0">확인</button></div>',
      function (bg, close) { bg.addEventListener('click', function (e) { if (e.target.closest('[data-r]')) close(); }); }, 'wide');
  };

  /* ───────────── 탭별 팁박스 ───────────── */
  function tips(tab, d) {
    var gen = d.mode === 'general', lk = SVY.linkInfo(d), un = lk.custom ? lk.unit : '과목';
    var T = {
      overview: ['이 탭에서 할 일', ['테스트 모드를 켜고 학생 링크로 직접 응답해 봅니다. (휴대폰 권장)', '「배포 전 점검」 탭에서 오류가 없는지 확인합니다.', '「정식 시작」을 누르면 테스트 응답이 지워지고 응답을 받기 시작합니다.', '학생 링크와 안내문을 복사해 전달합니다.']],
      intro: ['이 탭에서 할 일', ['제목·소제목·학교명을 확인합니다.', '「안내 항목」에 목적·대상·소요 시간을 적습니다. 학생이 시작 전에 읽는 내용입니다.', '오른쪽 미리보기에서 학생 첫 화면을 바로 확인할 수 있습니다.']],
      questions: ['이 탭에서 할 일', ['문항 카드를 눌러 펼쳐 문구·선택지·필수 여부를 고칩니다.', '일부 구간만 AI에게 맡기려면 위쪽 「AI 구간 설계」, 막히면 「AI 자문」을 누릅니다.', '맨 위 「설문 설정」에서 응답 방식·정원·추첨·제출 후 안내를 정합니다.', '저장하지 않은 변경은 우측 상단 「저장」을 눌러야 반영됩니다.']],
      design: ['이 탭에서 할 일', ['기본값으로 두어도 됩니다. 학교 색상·글자 크기를 바꾸고 싶을 때만 조정합니다.', '변경 내용은 오른쪽 미리보기에 즉시 반영됩니다.']],
      audit: ['이 탭에서 할 일', ['「규칙 점검」 결과의 오류(빨간색)를 모두 해결합니다. 주의는 의도한 것인지 확인합니다.', '「AI 정밀 점검」은 중복·누락·모순을 추가로 지적합니다. 참고용이며 최종 판단은 관리자가 합니다.', '지적 옆 버튼으로 해당 문항·탭으로 바로 이동합니다.']],
      draw: ['이 탭에서 할 일', ['추첨은 응답을 마감한 뒤 실행하는 것이 안전합니다.', '성실도 가중 추첨 후 결과는 먼저 비공개로 만들어집니다. 확인 후 공개하십시오.', '당첨 번호 수령 확인도 이 탭에서 합니다.']],
      results: ['이 탭에서 할 일', ['응답이 쌓이면 문항별 결과를 확인하고 엑셀로 내려받습니다.', '필터로 특정 응답 그룹만 좁혀 볼 수 있습니다.']],
      targets: ['이 탭에서 할 일', ['배포 대상 인원을 넣으면 결과에서 응답률이 계산됩니다. (선택)', '「' + un + ' 기준으로 행 자동 생성」으로 목록의 분류를 가져올 수 있습니다.']]
    };
    if (!gen) T.courses = ['이 탭에서 할 일 — ' + un + ' 일괄 등록', ['「엑셀 양식 다운로드」로 양식을 받습니다. (열: ' + colsText(lk) + ')', '한 행에 ' + (lk.custom && lk.unit !== '과목' ? un + ' 하나씩' : '한 반의 한 과목씩') + ' 입력합니다. 「(예시)」 행은 등록되지 않습니다.', '「엑셀 업로드」 → 미리보기에서 신규·갱신·오류를 확인 → 「등록」.', '「재적인원(명)」은 반의 현재 재적 인원입니다. 반의 한 행에만 적어도 되며, 목록의 「재적 인원」 열에 표시되고 반별 응답률·평균 참여율 계산에 쓰입니다.', '시간표·편성표 파일이 있으면 「AI 불러오기」로 표를 자동 정리할 수 있습니다. (등록 전 모두 수정 가능)', '몇 개만 추가하려면 「' + un + ' 추가」 또는 「붙여넣기로 등록」을 씁니다.', '다음 학기에는 설문 목록의 「복제」에서 「비우고 새 학기 목록을 올립니다」를 고른 뒤, 이 탭에서 새 목록만 올리면 문항·설정은 그대로 쓸 수 있습니다.']];
    return T[tab];
  }
  var key = function (tab) { return 'svya_tip_' + tab; };
  function collapsed(tab) { try { return localStorage.getItem(key(tab)) === '0'; } catch (e) { return false; } }
  function tipHtml(tab) {
    var d = (A.work && A.work.def) || {}, t = tips(tab, d); if (!t) return '';
    if (collapsed(tab)) return '<div class="tipbox min"><button class="btn btn-ghost btn-sm" data-act="tipopen" data-tip="' + tab + '">' + I('info', 14) + ' 이 탭 안내 보기</button></div>';
    return '<div class="tipbox"><div class="row"><b>' + I('info', 15) + ' ' + E(t[0]) + '</b><span class="sp"></span><button class="btn btn-ghost btn-sm" data-act="tipclose" data-tip="' + tab + '">접기</button></div><ol>' + t[1].map(function (x) { return '<li>' + E(x) + '</li>'; }).join('') + '</ol></div>';
  }
  Object.keys(A.tabs).forEach(function (k) {
    var f = A.tabs[k]; if (typeof f !== 'function' || !/^(overview|intro|questions|design|audit|draw|results|targets|courses)$/.test(k)) return;
    var w = function (box) { var r = f.apply(this, arguments); var h = tipHtml(k); if (h && box && box.insertAdjacentHTML) { box.querySelectorAll('.tipbox').forEach(function (x) { x.remove(); }); box.insertAdjacentHTML('afterbegin', h); } return r; };
    Object.keys(f).forEach(function (p) { w[p] = f[p]; }); A.tabs[k] = w;
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act=tipclose],[data-act=tipopen]'); if (!t) return; e.stopPropagation();
    var tab = t.getAttribute('data-tip'), box = document.getElementById('tabbody');
    try { localStorage.setItem(key(tab), t.getAttribute('data-act') === 'tipclose' ? '0' : '1'); } catch (er) {}
    var cur = box && box.querySelector('.tipbox'); if (cur) { var h = tipHtml(tab); cur.outerHTML = h || ''; }
  }, true);
})();
