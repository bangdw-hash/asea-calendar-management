'use strict';
/**
 * aseasurvey-types.js — 문항 형식 카탈로그 · 클라이언트 검증 · 응답 표시 변환 (학생·관리자·AI 공용)
 *  · SVY.MENU      : 관리자 「문항 추가」 메뉴(구글 설문지 형식 + 확장 형식)
 *  · SVY.newQuestion(key, id)  : 형식별 기본값을 가진 새 문항
 *  · SVY.checkQ(q, v, a, c, def): 서버(svy.check_one2)와 같은 규칙의 입력 검사 → '' 이면 통과
 *  · SVY.fmtAnswer(q, v, def)  : 결과 화면·엑셀용 문자열 변환
 *  · SVY.compressImage(file)   : 사진 업로드 전 압축
 */
(function () {
  var S = window.SVY;

  /* ── 문항 형식 메뉴 ── key 는 메뉴 식별자이며 저장되는 q.type 은 type 필드입니다. */
  var MENU = [
    { group: '입력', items: [
      { key: 'short', label: '단답형', type: 'text', hint: '한 줄 입력', props: { format: 'text', multiline: false, maxLen: 200 } },
      { key: 'paragraph', label: '장문형', type: 'text', hint: '여러 줄 입력', props: { format: 'text', multiline: true, maxLen: 1000 } },
      { key: 'number', label: '숫자', type: 'text', hint: '범위·정수 검증', props: { format: 'number', multiline: false, maxLen: 20 } },
      { key: 'email', label: '이메일', type: 'text', hint: '형식 검증', props: { format: 'email', multiline: false, maxLen: 120 } },
      { key: 'phone', label: '전화번호', type: 'text', hint: '형식 검증', props: { format: 'phone', multiline: false, maxLen: 20 } },
      { key: 'url', label: 'URL', type: 'text', hint: 'http(s):// 검증', props: { format: 'url', multiline: false, maxLen: 300 } },
      { key: 'pattern', label: '학번·사번(패턴)', type: 'text', hint: '정규식으로 형식 지정', props: { format: 'pattern', pattern: '^[0-9]{8}$', patternMsg: '숫자 8자리로 입력해 주십시오.', multiline: false, maxLen: 20 } },
      { key: 'date', label: '날짜', type: 'date', hint: '기간 제한 가능', props: { includeTime: false } },
      { key: 'datetime', label: '날짜·시간', type: 'date', hint: '일시 선택', props: { includeTime: true } },
      { key: 'time', label: '시간', type: 'time', hint: '시:분', props: {} }
    ] },
    { group: '선택', items: [
      { key: 'single', label: '객관식(단일)', type: 'single', hint: '하나 선택', props: { display: 'radio', options: [{ id: 'o1', label: '선택지 1' }, { id: 'o2', label: '선택지 2' }] } },
      { key: 'dropdown', label: '드롭다운', type: 'single', hint: '목록에서 선택', props: { display: 'dropdown', options: [{ id: 'o1', label: '선택지 1' }, { id: 'o2', label: '선택지 2' }] } },
      { key: 'multi', label: '체크박스(복수)', type: 'multi', hint: '여러 개 선택', props: { options: [{ id: 'o1', label: '선택지 1' }, { id: 'o2', label: '선택지 2' }] } },
      { key: 'imagechoice', label: '이미지 선택', type: 'single', hint: '사진 보고 고르기', props: { display: 'image', options: [{ id: 'o1', label: '선택지 1' }, { id: 'o2', label: '선택지 2' }] } },
      { key: 'scale5', label: '5점 척도', type: 'scale', hint: '매우 그렇다~전혀 아니다', props: { scale: 'likert5' } },
      { key: 'yesno', label: '예 / 아니오', type: 'scale', hint: '두 가지 선택', props: { scale: 'yesno' } },
      { key: 'linear', label: '선형 배율', type: 'linear', hint: '1~N점, 양끝 문구', props: { min: 1, max: 5, lowLabel: '', highLabel: '' } },
      { key: 'rating', label: '별점', type: 'rating', hint: '별·하트·엄지', props: { max: 5, icon: 'star' } },
      { key: 'nps', label: 'NPS(0~10)', type: 'nps', hint: '추천 의향', props: { lowLabel: '전혀 그렇지 않다', highLabel: '매우 그렇다' } },
      { key: 'slider', label: '슬라이더', type: 'slider', hint: '막대로 값 선택', props: { min: 0, max: 100, step: 1, unit: '' } }
    ] },
    { group: '표·순위', items: [
      { key: 'grid', label: '객관식 그리드', type: 'grid', hint: '행마다 하나 선택', props: { multi: false, eachRow: true, rows: [{ id: 'r1', label: '항목 1' }, { id: 'r2', label: '항목 2' }], cols: [{ id: 'c1', label: '열 1' }, { id: 'c2', label: '열 2' }, { id: 'c3', label: '열 3' }] } },
      { key: 'gridmulti', label: '체크박스 그리드', type: 'grid', hint: '행마다 여러 개 선택', props: { multi: true, eachRow: false, rows: [{ id: 'r1', label: '항목 1' }, { id: 'r2', label: '항목 2' }], cols: [{ id: 'c1', label: '열 1' }, { id: 'c2', label: '열 2' }, { id: 'c3', label: '열 3' }] } },
      { key: 'ranking', label: '순위 매기기', type: 'ranking', hint: '순서대로 선택', props: { options: [{ id: 'o1', label: '항목 1' }, { id: 'o2', label: '항목 2' }, { id: 'o3', label: '항목 3' }] } },
      { key: 'constsum', label: '합계 배분', type: 'constsum', hint: '합계가 정해진 배분', props: { total: 100, unit: '점', options: [{ id: 'o1', label: '항목 1' }, { id: 'o2', label: '항목 2' }] } }
    ] },
    { group: '특수', items: [
      { key: 'file', label: '파일 첨부', type: 'file', hint: '사진·PDF·문서', props: { accept: 'any', maxFiles: 1, maxMB: 3 } },
      { key: 'photo', label: '사진 촬영·첨부', type: 'file', hint: '카메라로 바로 촬영', props: { accept: 'image', capture: true, maxFiles: 1, maxMB: 3 } },
      { key: 'signature', label: '전자서명', type: 'signature', hint: '화면에 손글씨', props: {} },
      { key: 'address', label: '주소(도로명 검색)', type: 'address', hint: '우편번호 서비스·현재 위치', props: { allowGps: true, detail: true } },
      { key: 'location', label: '현재 위치', type: 'location', hint: '동의 후 좌표 수집', props: { consentText: '현재 위치 정보를 수집하는 데 동의합니다.' } },
      { key: 'qr', label: 'QR·바코드 스캔', type: 'qr', hint: '카메라로 읽기', props: { allowManual: true } },
      { key: 'consent', label: '동의 체크', type: 'consent', hint: '약관·개인정보 동의', props: { text: '', checkLabel: '위 내용에 동의합니다.' }, required: true }
    ] },
    { group: '안내(응답 없음)', items: [
      { key: 'block_text', label: '설명 글', type: 'block', hint: '안내 문구', props: { kind: 'text', text: '' } },
      { key: 'block_image', label: '이미지', type: 'block', hint: '사진·포스터', props: { kind: 'image', src: '', caption: '' } },
      { key: 'block_video', label: '동영상', type: 'block', hint: '유튜브 링크', props: { kind: 'video', url: '' } }
    ] }
  ];
  var BYKEY = {}; MENU.forEach(function (g) { g.items.forEach(function (it) { BYKEY[it.key] = it; }); });

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function newQuestion(key, id) {
    var it = BYKEY[key] || BYKEY.short, q = Object.assign({ id: id, type: it.type, label: '', scope: 'course', required: it.type !== 'block' && !!it.required }, clone(it.props));
    if (it.type === 'scale' || it.type === 'single' || it.type === 'multi') q.required = true;
    if (it.type === 'text') q.required = false;
    return q;
  }
  // 저장된 문항 → 메뉴 이름
  function typeLabel(q) {
    var t = q.type, f = q.format;
    if (t === 'text') return ({ number: '숫자', email: '이메일', phone: '전화번호', url: 'URL', pattern: '패턴' })[f] || (q.multiline ? '장문형' : '단답형');
    if (t === 'single') return q.display === 'dropdown' ? '드롭다운' : q.display === 'image' ? '이미지 선택' : '객관식';
    if (t === 'multi') return q.display === 'image' ? '이미지 선택(복수)' : '체크박스';
    if (t === 'scale') return q.scale === 'yesno' ? '예/아니오' : '척도';
    if (t === 'file') return q.capture ? '사진 촬영' : '파일 첨부';
    if (t === 'grid') return q.multi ? '체크박스 그리드' : '객관식 그리드';
    if (t === 'date') return q.includeTime ? '날짜·시간' : '날짜';
    if (t === 'block') return ({ text: '설명 글', image: '이미지', video: '동영상' })[q.kind] || '안내';
    return ({ time: '시간', linear: '선형 배율', rating: '별점', nps: 'NPS', slider: '슬라이더', ranking: '순위', constsum: '합계 배분', signature: '전자서명', address: '주소', location: '위치', qr: 'QR 스캔', consent: '동의' })[t] || t;
  }

  /* ── 검증 (서버 svy.check_one2 와 동일 규칙) ── 오류 문구 반환, 통과 시 '' */
  function ids(list) { return (list || []).map(function (o) { return o.id; }); }
  function checkQ(q, v, a, c, def) {
    var t = q.type, N = S.num, lab = '', n;
    if (t === 'block') return '';
    if (S.isEmpty(q, v)) return '';  // 필수 여부는 별도(상태 계산)에서 판단
    if (t === 'text') {
      var s = String(v), f = q.format || 'text', maxLen = Math.min(N(q.maxLen) || 2000, 5000);
      if (s.length > maxLen) return maxLen + '자 이하로 입력해 주십시오.';
      if (N(q.minLen) != null && s.trim().length < N(q.minLen)) return N(q.minLen) + '자 이상 입력해 주십시오.';
      if (f === 'number') { n = N(s.trim()); if (n === null) return '숫자만 입력해 주십시오.'; if (N(q.min) != null && n < N(q.min)) return N(q.min) + ' 이상이어야 합니다.'; if (N(q.max) != null && n > N(q.max)) return N(q.max) + ' 이하여야 합니다.'; if (q.integer && !/^-?\d+$/.test(s.trim())) return '정수만 입력할 수 있습니다.'; }
      else if (f === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return '이메일 형식이 아닙니다. 예: name@school.ac.kr';
      else if (f === 'phone' && !/^[0-9+() -]{7,20}$/.test(s)) return '전화번호 형식이 아닙니다. 예: 010-1234-5678';
      else if (f === 'url' && !/^https?:\/\/\S+$/i.test(s)) return 'http:// 또는 https:// 로 시작하는 주소를 입력해 주십시오.';
      else if (f === 'pattern' && q.pattern) { try { if (!new RegExp(q.pattern).test(s)) return q.patternMsg || '입력 형식이 올바르지 않습니다.'; } catch (e) { /* 잘못된 정규식은 서버와 동일하게 통과 */ } }
      return '';
    }
    if (t === 'single') { if (typeof v !== 'string') return '선택해 주십시오.'; if (v === '__other' && q.other) return String((a || {})[q.id + '_other'] || '').trim() ? '' : '기타 내용을 입력해 주십시오.'; return ids(q.options).indexOf(v) >= 0 ? '' : '선택해 주십시오.'; }
    if (t === 'multi') {
      if (!Array.isArray(v)) return '선택해 주십시오.';
      var oi = ids(q.options), ex = (q.options || []).filter(function (o) { return o.exclusive; }).map(function (o) { return o.id; });
      for (var i = 0; i < v.length; i++) { if (v[i] === '__other' && q.other) { if (!String((a || {})[q.id + '_other'] || '').trim()) return '기타 내용을 입력해 주십시오.'; } else if (oi.indexOf(v[i]) < 0) return '선택해 주십시오.'; }
      if (v.length > 1 && v.some(function (x) { return ex.indexOf(x) >= 0; })) return '해당 항목은 다른 항목과 함께 선택할 수 없습니다.';
      if (N(q.minSel) != null && v.length < N(q.minSel)) return N(q.minSel) + '개 이상 선택해 주십시오.';
      if (N(q.maxSel) != null && v.length > N(q.maxSel)) return N(q.maxSel) + '개 이하로 선택해 주십시오.';
      return '';
    }
    if (t === 'scale') return (S.scaleOf(def || {}, q).some(function (o) { return o.v === v; })) ? '' : '선택해 주십시오.';
    if (t === 'linear' || t === 'rating' || t === 'nps' || t === 'slider') {
      if (typeof v !== 'number') return '값을 선택해 주십시오.';
      var lo = t === 'linear' ? (N(q.min) != null ? N(q.min) : 1) : t === 'rating' ? 1 : t === 'nps' ? 0 : (N(q.min) != null ? N(q.min) : 0), hi = t === 'linear' ? (N(q.max) != null ? N(q.max) : 5) : t === 'rating' ? (N(q.max) || 5) : t === 'nps' ? 10 : (N(q.max) != null ? N(q.max) : 100);
      return (v < lo || v > hi) ? '범위를 벗어났습니다.' : '';
    }
    if (t === 'grid') {
      if (typeof v !== 'object' || Array.isArray(v)) return '응답해 주십시오.';
      var rows = ids(q.rows), cols = ids(q.cols);
      for (var k in v) { if (rows.indexOf(k) < 0) return '잘못된 응답입니다.'; var x = v[k]; if (q.multi ? (!Array.isArray(x) || x.some(function (y) { return cols.indexOf(y) < 0; })) : cols.indexOf(x) < 0) return '잘못된 응답입니다.'; }
      if ((q.required || S.isRequired(q)) && q.eachRow !== false && rows.some(function (r) { return S.isEmpty({ type: 'x' }, v[r]); })) return '모든 행에 응답해 주십시오.';
      return '';
    }
    if (t === 'ranking') {
      if (!Array.isArray(v)) return '순위를 지정해 주십시오.'; var need = Math.min(N(q.top) || (q.options || []).length, (q.options || []).length);
      if (v.length !== need) return '순위 ' + need + '개를 모두 지정해 주십시오.'; if (new Set(v).size !== v.length) return '순위가 중복되었습니다.'; return '';
    }
    if (t === 'constsum') {
      if (typeof v !== 'object') return '배분해 주십시오.'; var sum = 0; for (var k2 in v) { if (ids(q.options).indexOf(k2) < 0 || typeof v[k2] !== 'number' || v[k2] < 0) return '잘못된 배분 값입니다.'; sum += v[k2]; }
      var tot = N(q.total) != null ? N(q.total) : 100; return Math.abs(sum - tot) < 1e-9 ? '' : '합계가 ' + tot + (q.unit || '') + '이어야 합니다. (현재 ' + sum + ')';
    }
    if (t === 'date') {
      var d = String(v); var ok = q.includeTime ? /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(d) : /^\d{4}-\d{2}-\d{2}$/.test(d); if (!ok || isNaN(Date.parse(d.slice(0, 10)))) return '올바른 날짜를 입력해 주십시오.';
      if (q.min && d.slice(0, 10) < q.min) return q.min + ' 이후 날짜여야 합니다.'; if (q.max && d.slice(0, 10) > q.max) return q.max + ' 이전 날짜여야 합니다.'; return '';
    }
    if (t === 'time') { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) return '올바른 시간을 입력해 주십시오.'; if (q.min && v < q.min) return q.min + ' 이후여야 합니다.'; if (q.max && v > q.max) return q.max + ' 이전이어야 합니다.'; return ''; }
    if (t === 'file' || t === 'signature') { if (!Array.isArray(v)) return '첨부해 주십시오.'; var cap = t === 'signature' ? 1 : Math.min(N(q.maxFiles) || 1, 10); return v.length > cap ? '최대 ' + cap + '개까지 첨부할 수 있습니다.' : ''; }
    if (t === 'address') return (String((v && v.road) || '').trim() || String((v && v.jibun) || '').trim()) ? '' : '주소를 선택해 주십시오.';
    if (t === 'location') return (v && typeof v.lat === 'number' && typeof v.lng === 'number') ? '' : '위치를 확인해 주십시오.';
    if (t === 'qr') return String(v).length > 500 ? 'QR 값이 너무 깁니다.' : '';
    if (t === 'consent') return v === true ? '' : '동의가 필요합니다.';
    return '';
  }

  /* ── 응답 → 표시 문자열 (결과·엑셀) ── */
  function optLabel(q, id, a) { if (id === '__other') return '기타' + (a && a[q.id + '_other'] ? ': ' + a[q.id + '_other'] : ''); var o = (q.options || []).filter(function (x) { return x.id === id; })[0]; return o ? o.label : id; }
  function fmtAnswer(q, v, def, a) {
    if (v === undefined || v === null || S.isEmpty(q, v) && q.type !== 'consent') return '';
    var t = q.type;
    if (t === 'single') return optLabel(q, v, a);
    if (t === 'multi') return (v || []).map(function (x) { return optLabel(q, x, a); }).join('; ');
    if (t === 'scale') { var o = S.scaleOf(def || {}, q).filter(function (x) { return x.v === v; })[0]; return o ? o.label : String(v); }
    if (t === 'grid') return Object.keys(v).map(function (r) { var row = (q.rows || []).filter(function (x) { return x.id === r; })[0], cols = [].concat(v[r]).map(function (cid) { var cc = (q.cols || []).filter(function (x) { return x.id === cid; })[0]; return cc ? cc.label : cid; }); return (row ? row.label : r) + ': ' + cols.join(', '); }).join(' / ');
    if (t === 'ranking') return (v || []).map(function (x, i) { return (i + 1) + '. ' + optLabel(q, x, a); }).join(' ');
    if (t === 'constsum') return Object.keys(v).map(function (k) { return optLabel(q, k, a) + ' ' + v[k] + (q.unit || ''); }).join(' / ');
    if (t === 'file' || t === 'signature') return (v || []).map(function (f) { return f.name || '첨부'; }).join(', ');
    if (t === 'address') return [v.zip ? '(' + v.zip + ')' : '', v.road || v.jibun || '', v.building || '', v.detail || ''].filter(Boolean).join(' ');
    if (t === 'location') return v.lat.toFixed(5) + ', ' + v.lng.toFixed(5) + (v.acc ? ' (±' + Math.round(v.acc) + 'm)' : '');
    if (t === 'consent') return v === true ? '동의' : '';
    if (t === 'date' && q.includeTime) return String(v).replace('T', ' ');
    return String(v);
  }

  /* ── 이미지 압축 · 파일 변환 ── */
  function fmtBytes(n) { return n < 1024 ? n + 'B' : n < 1048576 ? Math.round(n / 1024) + 'KB' : (n / 1048576).toFixed(1) + 'MB'; }
  function readB64(blob) { return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1] || ''); }; fr.onerror = rej; fr.readAsDataURL(blob); }); }
  // 이미지는 최대 변 maxDim 으로 줄이고 JPEG 로 재인코딩(목표 용량 이하가 될 때까지 품질을 낮춤)
  function compressImage(file, maxDim, targetBytes) {
    maxDim = maxDim || 1600; targetBytes = targetBytes || 900 * 1024;
    return new Promise(function (resolve) {
      if (!/^image\//.test(file.type) || /gif/.test(file.type)) return resolve(file);
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, maxDim / Math.max(w, h)), cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        var q = 0.82; (function step() { cv.toBlob(function (b) { if (!b) return resolve(file); if (b.size > targetBytes && q > 0.4) { q -= 0.12; return step(); } b.name = (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg'; resolve(b); }, 'image/jpeg', q); })();
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  function shuffle(arr, seed) { var a = arr.slice(), s = seed || 1; function rnd() { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; } for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function youtubeId(u) { var m = String(u || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/); return m ? m[1] : ''; }

  S.MENU = MENU; S.MENU_BY_KEY = BYKEY; S.newQuestion = newQuestion; S.typeLabel = typeLabel; S.checkQ = checkQ; S.fmtAnswer = fmtAnswer;
  S.fmtBytes = fmtBytes; S.readB64 = readB64; S.compressImage = compressImage; S.shuffle = shuffle; S.youtubeId = youtubeId; S.cloneJSON = clone;
})();
