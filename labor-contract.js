/**
 * labor-contract.js
 * 아세아항공직업전문학교 근로계약서 관리 모듈
 * window.LaborContractModule
 */
window.LaborContractModule = (function () {
  'use strict';

  /* ===================== 상수 ===================== */
  var LS_CONTRACTS = 'asea_labor_contracts';
  var LS_SEAL = 'asea_seal_b64';
  var LS_CFG = 'asea_lc_cfg';

  /* ===================== 기본 갑 정보 ===================== */
  var DEFAULT_EMPLOYER = {
    name: '(재)아세아항공직업전문학교',
    rep: '전 영 숙',
    address: '서울시 용산구 원효로97길 25',
    phone: '02-714-9710'
  };

  /* ===================== localStorage 헬퍼 ===================== */
  function loadContracts() {
    try {
      return JSON.parse(localStorage.getItem(LS_CONTRACTS) || '[]');
    } catch (e) { return []; }
  }

  function saveContracts(list) {
    localStorage.setItem(LS_CONTRACTS, JSON.stringify(list));
  }

  function loadSeal() {
    return localStorage.getItem(LS_SEAL) || '';
  }

  function loadCfg() {
    try {
      var c = JSON.parse(localStorage.getItem(LS_CFG) || '{}');
      return Object.assign({}, DEFAULT_EMPLOYER, c);
    } catch (e) { return Object.assign({}, DEFAULT_EMPLOYER); }
  }

  function saveCfg(cfg) {
    localStorage.setItem(LS_CFG, JSON.stringify(cfg));
  }

  /* ===================== 유틸 ===================== */
  function genId() {
    return 'LC-' + Math.random().toString(36).substr(2, 8).toUpperCase();
  }

  function _genToken() {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
  }

  function _getSignUrl(token) {
    var base = window.location.href.replace(/[^/]*$/, '');
    return base + 'contract-sign.html?token=' + token;
  }

  function formatDate(iso) {
    if (!iso) return '-';
    return iso.slice(0, 10);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg, type) {
    var t = document.createElement('div');
    t.className = 'lc-toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 3000);
  }

  function chk(val) {
    return val
      ? '<span style="display:inline-block;width:4mm;height:4mm;border:1px solid #000;text-align:center;font-size:8pt;vertical-align:middle;">&#10003;</span>'
      : '<span style="display:inline-block;width:4mm;height:4mm;border:1px solid #000;vertical-align:middle;"></span>';
  }

  /* ===================== 계약서 CRUD ===================== */
  function getContractById(id) {
    var list = loadContracts();
    return list.find(function (c) { return c.id === id; }) || null;
  }

  function getContractByToken(token) {
    var list = loadContracts();
    return list.find(function (c) { return c.signToken === token; }) || null;
  }

  function upsertContract(contract) {
    var list = loadContracts();
    var idx = list.findIndex(function (c) { return c.id === contract.id; });
    if (idx >= 0) {
      list[idx] = contract;
    } else {
      list.unshift(contract);
    }
    saveContracts(list);
  }

  function deleteContract(id) {
    var list = loadContracts().filter(function (c) { return c.id !== id; });
    saveContracts(list);
  }

  function saveEmployeeSign(token, signData) {
    var list = loadContracts();
    var idx = list.findIndex(function (c) { return c.signToken === token; });
    if (idx < 0) return false;
    list[idx].employeeSignData = signData;
    list[idx].signedAt = nowISO();
    list[idx].status = 'signed';
    saveContracts(list);
    return true;
  }

  /* ===================== 전자계약 ===================== */
  function _sendElectronic(contract) {
    var token = _genToken();
    contract.signToken = token;
    contract.status = 'sent';
    contract.sentAt = nowISO();
    upsertContract(contract);
    return _getSignUrl(token);
  }

  function _copySignUrl(contract) {
    var url = _getSignUrl(contract.signToken);
    var msg = _buildSignMessage(contract.employee.name, url);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg).then(function () {
        showToast('전자서명 링크가 클립보드에 복사되었습니다.', 'success');
      });
    } else {
      var ta = document.createElement('textarea');
      ta.value = msg;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('전자서명 링크가 클립보드에 복사되었습니다.', 'success');
    }
  }

  function _buildSignMessage(name, url) {
    return '[아세아항공직업전문학교 근로계약서 전자서명 안내]\n\n안녕하세요, ' + name + '님.\n근로계약서 전자서명을 요청드립니다.\n아래 링크에 접속하여 계약서 내용을 확인하신 후 서명을 완료해 주시기 바랍니다.\n\n서명 링크: ' + url + '\n\n문의: 02-714-9710\n감사합니다.';
  }

  /* ===================== A4 HTML 생성 ===================== */
  function _buildContractHTML(contract) {
    var cfg = loadCfg();
    var sealB64 = loadSeal();
    var emp = contract.employer || cfg;
    var ee = contract.employee || {};
    var ct = contract.contract || {};
    var sealImg = sealB64
      ? '<img src="' + sealB64 + '" class="seal-img" alt="인감">'
      : '<div class="seal-placeholder">[인감]</div>';

    var eSignImg = '';
    if (contract.employeeSignData) {
      eSignImg = '<img src="' + contract.employeeSignData + '" style="height:20mm;max-width:50mm;vertical-align:middle;" alt="서명">';
    }

    var insuranceHtml = '<div style="margin-top:1mm;">' +
      chk(ct.insurance && ct.insurance.employment) + ' 고용보험&nbsp;&nbsp;' +
      chk(ct.insurance && ct.insurance.industrial) + ' 산재보험&nbsp;&nbsp;' +
      chk(ct.insurance && ct.insurance.pension) + ' 국민연금&nbsp;&nbsp;' +
      chk(ct.insurance && ct.insurance.health) + ' 건강보험</div>';

    var wageLine = '';
    if (ct.wageType === 'monthly') wageLine = '월급 금 ' + esc(ct.wageAmount) + ' 원';
    else if (ct.wageType === 'daily') wageLine = '일급 금 ' + esc(ct.wageAmount) + ' 원';
    else wageLine = '시급 금 ' + esc(ct.wageAmount) + ' 원';

    var payMethodText = ct.payMethod === 'transfer' ? '계좌이체' : '직접지급';

    // 간인 이미지
    var ganjinHtml = sealB64
      ? '<div class="ganjin-area"><img src="' + sealB64 + '" class="ganjin-seal" alt="간인"></div>'
      : '';

    var commonStyle = [
      "@font-face{font-family:'KoPubWorld Dotum';font-weight:300;src:url('fonts/KoPubWorld-Dotum-Light.ttf') format('truetype');}",
      "@font-face{font-family:'KoPubWorld Dotum';font-weight:400;src:url('fonts/KoPubWorld-Dotum-Medium.ttf') format('truetype');}",
      "@font-face{font-family:'KoPubWorld Dotum';font-weight:700;src:url('fonts/KoPubWorld-Dotum-Bold.ttf') format('truetype');}",
      '@page { size: A4; margin: 12mm 16mm; }',
      "body { font-family: 'KoPubWorld Dotum', 'Malgun Gothic', '맑은 고딕', sans-serif; font-size: 9.5pt; margin: 0; color: #000; line-height: 1.5; }",
      '.contract-wrap { width: 170mm; margin: 0 auto; position: relative; }',
      '.contract-title { text-align: center; font-size: 16pt; font-weight: bold; margin-bottom: 8mm; letter-spacing: 2px; }',
      '.contract-subtitle { text-align: center; font-size: 11pt; margin-bottom: 6mm; }',
      '.intro { margin-bottom: 5mm; line-height: 1.8; }',
      '.section { margin-bottom: 3mm; padding-left: 2mm; }',
      '.section-num { font-weight: bold; display: inline-block; width: 8mm; }',
      '.underline { border-bottom: 1px solid #000; display: inline-block; min-width: 30mm; vertical-align: bottom; }',
      '.sign-section { margin-top: 8mm; border-top: 2px solid #000; padding-top: 5mm; }',
      '.sign-row { display: flex; justify-content: space-between; margin-bottom: 3mm; }',
      '.sign-party { width: 48%; }',
      '.sign-party-title { font-weight: bold; font-size: 11pt; margin-bottom: 3mm; border-bottom: 1px solid #000; padding-bottom: 1mm; }',
      '.sign-field { margin-bottom: 2mm; font-size: 9.5pt; }',
      '.seal-container { display: inline-block; width: 24mm; height: 24mm; position: relative; vertical-align: middle; }',
      '.seal-img { width: 24mm; height: 24mm; object-fit: contain; opacity: 0.85; }',
      '.seal-placeholder { width: 24mm; height: 24mm; border: 2px solid #aaa; display: inline-flex; align-items: center; justify-content: center; font-size: 8pt; color: #888; }',
      '.ganjin-area { position: relative; height: 0; overflow: visible; text-align: right; }',
      '.ganjin-seal { position: absolute; right: 0; top: -12mm; width: 24mm; height: 24mm; opacity: 0.65; transform: rotate(-20deg); }',
      '.date-line { text-align: center; margin: 6mm 0; font-size: 11pt; }',
      '.box { border: 1px solid #000; padding: 3mm 4mm; margin-top: 2mm; line-height: 1.8; }',
      '.lc-letterhead { display:flex; align-items:center; gap:10px; padding-bottom:6px; margin-bottom:7mm; border-bottom:2.2px solid #1a3a5c; }',
      '.lc-lh-logo { height:26px; width:auto; max-width:150px; object-fit:contain; }',
      '.lc-lh-emoji { font-size:22px; line-height:1; }',
      '.lc-lh-org { font-size:12pt; font-weight:800; color:#1a3a5c; letter-spacing:.3px; }',
      '@media print { body { margin: 0; } .no-print { display: none !important; } * { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }'
    ].join('\n');

    if (contract.type === 'shortterm') {
      return _buildShorttermHTML(contract, emp, ee, ct, sealImg, eSignImg, ganjinHtml, commonStyle, wageLine, payMethodText);
    }
    return _buildStandardHTML(contract, emp, ee, ct, sealImg, eSignImg, ganjinHtml, commonStyle, wageLine, insuranceHtml, payMethodText);
  }

  /* 통일 레터헤드 밴드 (관리자 로고 + 기관명) */
  function _lcLetterhead() {
    var logo = '';
    try { logo = localStorage.getItem('asea_logo') || ''; } catch (e) {}
    var mark = logo
      ? '<img class="lc-lh-logo" src="' + logo + '" alt="logo">'
      : '<span class="lc-lh-emoji">📅</span>';
    return '<div class="lc-letterhead">' + mark +
      '<span class="lc-lh-org">(재) 아세아항공직업전문학교</span></div>';
  }

  function _buildStandardHTML(contract, emp, ee, ct, sealImg, eSignImg, ganjinHtml, commonStyle, wageLine, insuranceHtml, payMethodText) {
    var today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

    return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><base href="' + location.href + '"><title>표준근로계약서</title><style>' + commonStyle + '</style></head><body>' +
      '<div class="contract-wrap">' +
      _lcLetterhead() +
      '<div class="contract-title">표준근로계약서</div>' +
      '<div class="contract-subtitle">(기간의 정함이 있는 경우)</div>' +

      '<div class="intro">' +
      '<b>' + esc(emp.name || DEFAULT_EMPLOYER.name) + '</b>(이하 "갑"이라 함)과(와) ' +
      '<b>' + esc(ee.name || '') + '</b>(이하 "을"이라 함)은 다음과 같이 근로계약을 체결한다.' +
      '</div>' +

      '<div class="section"><span class="section-num">제1조</span> <b>근로계약기간 :</b> ' +
      esc(ct.startDate || '') + ' ~ ' + esc(ct.endDate || '') +
      '</div>' +

      '<div class="section"><span class="section-num">제2조</span> <b>근무 장소 :</b> ' +
      esc(ct.workplace || emp.address || DEFAULT_EMPLOYER.address) +
      '</div>' +

      '<div class="section"><span class="section-num">제3조</span> <b>업무의 내용 :</b> ' +
      esc(ct.jobDescription || '') +
      '</div>' +

      '<div class="section"><span class="section-num">제4조</span> <b>근로시간 :</b> ' +
      esc(ct.workStart || '') + ' ~ ' + esc(ct.workEnd || '') +
      ' (휴게시간: ' + esc(ct.breakStart || '') + ' ~ ' + esc(ct.breakEnd || '') + ')' +
      '</div>' +

      '<div class="section"><span class="section-num">제5조</span> <b>근무일/휴일 :</b> ' +
      esc(ct.workDays || '매주 월~금') +
      ', 주휴일 ' + esc(ct.holiday || '토·일') +
      '</div>' +

      '<div class="section"><span class="section-num">제6조</span> <b>임금</b><br>' +
      '&nbsp;&nbsp;· ' + wageLine + '<br>' +
      '&nbsp;&nbsp;· 상여금: ' + (ct.bonusYn ? '있음 — ' + esc(ct.bonusAmount || '') + '원' : '없음') + '<br>' +
      '&nbsp;&nbsp;· 기타급여: ' + (ct.otherPayYn ? esc(ct.otherPayDetails || '') : '없음') + '<br>' +
      '&nbsp;&nbsp;· 지급일: 매월 ' + esc(ct.payDay || '') + '일<br>' +
      '&nbsp;&nbsp;· 지급방법: ' + payMethodText +
      '</div>' +

      '<div class="section"><span class="section-num">제7조</span> <b>연차유급휴가 :</b> 근로기준법에 따름</div>' +

      '<div class="section"><span class="section-num">제8조</span> <b>사회보험 적용여부(해당란에 체크)</b>' +
      insuranceHtml + '</div>' +

      ganjinHtml +

      '<div class="section"><span class="section-num">제9조</span> <b>근로계약서 교부 :</b> "갑"은 근로계약을 체결함과 동시에 본 계약서를 사본하여 "을"의 교부요구와 관계없이 "을"에게 교부함(근로기준법 제17조 이행)</div>' +

      '<div class="section"><span class="section-num">제10조</span> <b>근로계약, 취업규칙 등의 성실한 이행의무 :</b> "갑"과 "을"은 각자가 근로계약, 취업규칙, 단체협약을 지키고 성실하게 이행하여야 한다.</div>' +

      '<div class="section"><span class="section-num">제11조</span> <b>기타 :</b> 이 계약에 정함이 없는 사항은 근로기준법령에 의함</div>' +

      '<div class="date-line">' + today + '</div>' +

      '<div class="sign-section">' +
      '<div class="sign-row">' +
      '<div class="sign-party">' +
      '<div class="sign-party-title">갑 (사업주)</div>' +
      '<div class="sign-field">사업체명: ' + esc(emp.name || DEFAULT_EMPLOYER.name) + '</div>' +
      '<div class="sign-field">주&nbsp;&nbsp;&nbsp;&nbsp;소: ' + esc(emp.address || DEFAULT_EMPLOYER.address) + '</div>' +
      '<div class="sign-field">대표자: ' + esc(emp.rep || DEFAULT_EMPLOYER.rep) + ' &nbsp;' +
      '<div class="seal-container">' + sealImg + '</div>' +
      '</div>' +
      '<div class="sign-field">전&nbsp;&nbsp;&nbsp;&nbsp;화: ' + esc(emp.phone || DEFAULT_EMPLOYER.phone) + '</div>' +
      '</div>' +

      '<div class="sign-party">' +
      '<div class="sign-party-title">을 (근로자)</div>' +
      '<div class="sign-field">성&nbsp;&nbsp;&nbsp;&nbsp;명: ' + esc(ee.name || '') + '</div>' +
      '<div class="sign-field">주&nbsp;&nbsp;&nbsp;&nbsp;소: ' + esc(ee.address || '') + '</div>' +
      '<div class="sign-field">연락처: ' + esc(ee.phone || '') + '</div>' +
      '<div class="sign-field">이메일: ' + esc(ee.email || '') + '</div>' +
      '<div class="sign-field">서&nbsp;&nbsp;&nbsp;&nbsp;명: ' + (eSignImg || '<span style="display:inline-block;width:50mm;border-bottom:1px solid #000;">&nbsp;</span>') + '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +

      '</div></body></html>';
  }

  function _buildShorttermHTML(contract, emp, ee, ct, sealImg, eSignImg, ganjinHtml, commonStyle, wageLine, payMethodText) {
    var today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

    return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><base href="' + location.href + '"><title>단기근로계약서</title><style>' + commonStyle + '</style></head><body>' +
      '<div class="contract-wrap">' +
      _lcLetterhead() +
      '<div class="contract-title">단기근로계약서</div>' +

      '<div class="intro">' +
      '<b>' + esc(emp.name || DEFAULT_EMPLOYER.name) + '</b>(이하 "갑"이라 함)과(와) ' +
      '<b>' + esc(ee.name || '') + '</b>(이하 "을"이라 함)은 다음과 같은 조건으로 단기 근로계약을 체결한다.' +
      '</div>' +

      '<div class="section"><b>1. 계약기간 :</b> ' + esc(ct.startDate || '') + ' ~ ' + esc(ct.endDate || '') + '</div>' +

      '<div class="section"><b>2. 기본급여액 :</b> ' + wageLine + ' (고용보험 별도)<br>' +
      '&nbsp;&nbsp;지급일: 매월 ' + esc(ct.payDay || '') + '일, 지급방법: ' + payMethodText + '</div>' +

      '<div class="section"><b>3. 근무내용 :</b> ' + esc(ct.jobDescription || '') + '</div>' +

      '<div class="section"><b>4. 근로시간 :</b> ' +
      (ct.workStart || '09:00') + ' ~ ' + (ct.workEnd || '18:00') +
      ', 휴게 ' + (ct.breakStart || '12:00') + '~' + (ct.breakEnd || '13:00') + ' (1시간), 주 40시간' +
      '</div>' +

      '<div class="section"><b>5. 근무장소 :</b> ' + esc(ct.workplace || emp.address || DEFAULT_EMPLOYER.address) + '</div>' +

      ganjinHtml +

      '<div class="section"><b>6. 근로원칙</b>' +
      '<div class="box">' +
      '① "을"은 "갑"의 지시 및 지휘·감독에 따라 성실히 근무하여야 한다.<br>' +
      '② "을"은 재직 중 및 퇴직 후에도 업무상 취득한 비밀을 외부에 누설하여서는 아니 된다.<br>' +
      '③ "을"이 고의 또는 과실로 "갑"에게 손해를 입힌 경우 이에 대한 배상책임을 진다.' +
      '</div></div>' +

      '<div class="section"><b>7. 기타 :</b> 본 계약서에 명시되지 않은 사항은 근로기준법령, 취업규칙 및 기타 규정에 따른다.</div>' +

      '<div class="date-line">' + today + '</div>' +

      '<div class="sign-section">' +
      '<div class="sign-row">' +
      '<div class="sign-party">' +
      '<div class="sign-party-title">갑 (사업주)</div>' +
      '<div class="sign-field">기관명: ' + esc(emp.name || DEFAULT_EMPLOYER.name) + '</div>' +
      '<div class="sign-field">주소: ' + esc(emp.address || DEFAULT_EMPLOYER.address) + '</div>' +
      '<div class="sign-field">이사장: ' + esc(emp.rep || DEFAULT_EMPLOYER.rep) + ' &nbsp;' +
      '<div class="seal-container">' + sealImg + '</div>' +
      '</div>' +
      '</div>' +

      '<div class="sign-party">' +
      '<div class="sign-party-title">을 (근로자)</div>' +
      '<div class="sign-field">성&nbsp;&nbsp;명: ' + esc(ee.name || '') + '</div>' +
      '<div class="sign-field">주&nbsp;&nbsp;소: ' + esc(ee.address || '') + '</div>' +
      '<div class="sign-field">연락처: ' + esc(ee.phone || '') + '</div>' +
      '<div class="sign-field">서&nbsp;&nbsp;명: ' + (eSignImg || '<span style="display:inline-block;width:50mm;border-bottom:1px solid #000;">&nbsp;</span>') + '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +

      '</div></body></html>';
  }

  /* ===================== 미리보기/인쇄 ===================== */
  function _renderPreview(contract) {
    var modal = document.createElement('div');
    modal.className = 'lc-preview-modal';

    var html = _buildContractHTML(contract);
    var typeLabel = contract.type === 'shortterm' ? '단기근로계약서' : '표준근로계약서';

    modal.innerHTML =
      '<div class="lc-preview-inner">' +
      '<div class="lc-preview-header">' +
      '<h3>' + typeLabel + ' 미리보기</h3>' +
      '<div class="lc-preview-actions">' +
      '<button class="lc-btn lc-btn-primary lc-btn-sm" id="lc-print-btn">인쇄</button>' +
      '<button class="lc-preview-close" id="lc-preview-close-btn">&#10005;</button>' +
      '</div></div>' +
      '<div class="lc-preview-frame">' +
      '<iframe id="lc-preview-iframe" style="width:100%;height:600px;border:none;"></iframe>' +
      '</div></div>';

    document.body.appendChild(modal);

    var iframe = modal.querySelector('#lc-preview-iframe');
    iframe.onload = function () {};
    iframe.srcdoc = html;

    modal.querySelector('#lc-preview-close-btn').onclick = function () {
      document.body.removeChild(modal);
    };

    modal.querySelector('#lc-print-btn').onclick = function () {
      _printContract(contract);
    };

    modal.addEventListener('click', function (e) {
      if (e.target === modal) document.body.removeChild(modal);
    });
  }

  function _printContract(contract) {
    var html = _buildContractHTML(contract);
    var w = window.open('', '_blank');
    if (!w) { showToast('팝업이 차단되었습니다. 팝업을 허용해 주세요.', 'error'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(function () { w.print(); }, 600);
  }

  /* ===================== 폼 렌더링 ===================== */
  function _renderForm(wrap, existingContract) {
    var cfg = loadCfg();
    var isEdit = !!existingContract;
    var c = existingContract || {
      id: genId(),
      type: 'standard',
      status: 'draft',
      deliveryType: 'print',
      createdAt: nowISO(),
      sentAt: '',
      signedAt: '',
      signToken: '',
      employer: cfg,
      employee: { name: '', address: '', phone: '', email: '', idNumber: '' },
      contract: {
        startDate: '', endDate: '',
        workplace: cfg.address || DEFAULT_EMPLOYER.address,
        jobDescription: '',
        workStart: '09:00', workEnd: '18:00',
        breakStart: '12:00', breakEnd: '13:00',
        workDays: '매주 월~금',
        holiday: '토·일',
        wageType: 'monthly',
        wageAmount: '',
        bonusYn: false, bonusAmount: '',
        otherPayYn: false, otherPayDetails: '',
        payDay: '25',
        payMethod: 'transfer',
        insurance: { employment: true, industrial: true, pension: true, health: true }
      },
      employeeSignData: '',
    };

    var ct = c.contract;
    var ee = c.employee;
    var ins = ct.insurance || {};

    wrap.innerHTML =
      '<div class="lc-form">' +
      '<div class="lc-section-title">' + (isEdit ? '계약서 수정' : '새 계약서 작성') + '</div>' +

      /* 계약 종류 */
      '<div class="lc-form-section">' +
      '<div class="lc-section-title" style="font-size:13px;">계약서 종류</div>' +
      '<div class="lc-radio-group">' +
      '<label><input type="radio" name="lc-type" value="standard" ' + (c.type !== 'shortterm' ? 'checked' : '') + '> 표준근로계약서 (기간의 정함이 있는 경우)</label>' +
      '<label><input type="radio" name="lc-type" value="shortterm" ' + (c.type === 'shortterm' ? 'checked' : '') + '> 단기근로계약서</label>' +
      '</div></div>' +

      /* 근로자 정보 */
      '<div class="lc-form-section">' +
      '<div class="lc-section-title" style="font-size:13px;">을 (근로자) 정보</div>' +
      '<div class="lc-form-grid">' +
      '<div class="lc-field"><label>성명 *</label><input id="lc-ee-name" type="text" value="' + esc(ee.name) + '" placeholder="홍길동"></div>' +
      '<div class="lc-field"><label>연락처</label><input id="lc-ee-phone" type="text" value="' + esc(ee.phone) + '" placeholder="010-0000-0000"></div>' +
      '<div class="lc-field lc-form-full"><label>주소</label><input id="lc-ee-address" type="text" value="' + esc(ee.address) + '" placeholder="서울시 ..."></div>' +
      '<div class="lc-field"><label>이메일</label><input id="lc-ee-email" type="email" value="' + esc(ee.email) + '" placeholder="abc@example.com"></div>' +
      '</div></div>' +

      /* 계약기간 및 근무정보 */
      '<div class="lc-form-section">' +
      '<div class="lc-section-title" style="font-size:13px;">계약 기간 및 근무 정보</div>' +
      '<div class="lc-form-grid">' +
      '<div class="lc-field"><label>계약 시작일 *</label><input id="lc-start" type="date" value="' + esc(ct.startDate) + '"></div>' +
      '<div class="lc-field"><label>계약 종료일 *</label><input id="lc-end" type="date" value="' + esc(ct.endDate) + '"></div>' +
      '<div class="lc-field lc-form-full"><label>근무 장소</label><input id="lc-workplace" type="text" value="' + esc(ct.workplace) + '"></div>' +
      '<div class="lc-field lc-form-full"><label>업무 내용 *</label><textarea id="lc-job">' + esc(ct.jobDescription) + '</textarea></div>' +
      '</div></div>' +

      /* 근로시간 */
      '<div class="lc-form-section">' +
      '<div class="lc-section-title" style="font-size:13px;">근로시간 / 근무일</div>' +
      '<div class="lc-form-grid">' +
      '<div class="lc-field"><label>근로 시작</label><input id="lc-wstart" type="time" value="' + esc(ct.workStart) + '"></div>' +
      '<div class="lc-field"><label>근로 종료</label><input id="lc-wend" type="time" value="' + esc(ct.workEnd) + '"></div>' +
      '<div class="lc-field"><label>휴게 시작</label><input id="lc-bstart" type="time" value="' + esc(ct.breakStart) + '"></div>' +
      '<div class="lc-field"><label>휴게 종료</label><input id="lc-bend" type="time" value="' + esc(ct.breakEnd) + '"></div>' +
      '<div class="lc-field"><label>근무일</label><input id="lc-workdays" type="text" value="' + esc(ct.workDays) + '"></div>' +
      '<div class="lc-field"><label>주휴일</label><input id="lc-holiday" type="text" value="' + esc(ct.holiday) + '"></div>' +
      '</div></div>' +

      /* 임금 */
      '<div class="lc-form-section">' +
      '<div class="lc-section-title" style="font-size:13px;">임금</div>' +
      '<div class="lc-form-grid">' +
      '<div class="lc-field"><label>임금 종류</label>' +
      '<select id="lc-wagetype">' +
      '<option value="monthly" ' + (ct.wageType === 'monthly' ? 'selected' : '') + '>월급</option>' +
      '<option value="daily" ' + (ct.wageType === 'daily' ? 'selected' : '') + '>일급</option>' +
      '<option value="hourly" ' + (ct.wageType === 'hourly' ? 'selected' : '') + '>시급</option>' +
      '</select></div>' +
      '<div class="lc-field"><label>금액 (원)</label><input id="lc-wageamt" type="number" value="' + esc(ct.wageAmount) + '" placeholder="2000000"></div>' +
      '<div class="lc-field"><label>지급일 (매월 _일)</label><input id="lc-payday" type="number" min="1" max="31" value="' + esc(ct.payDay) + '" placeholder="25"></div>' +
      '<div class="lc-field"><label>지급방법</label>' +
      '<select id="lc-paymethod">' +
      '<option value="transfer" ' + (ct.payMethod === 'transfer' ? 'selected' : '') + '>계좌이체</option>' +
      '<option value="direct" ' + (ct.payMethod === 'direct' ? 'selected' : '') + '>직접지급</option>' +
      '</select></div>' +
      '</div>' +
      '<div class="lc-form-grid" style="margin-top:10px;">' +
      '<div class="lc-field"><label>상여금</label>' +
      '<div class="lc-radio-group">' +
      '<label><input type="radio" name="lc-bonus" value="y" ' + (ct.bonusYn ? 'checked' : '') + '> 있음</label>' +
      '<label><input type="radio" name="lc-bonus" value="n" ' + (!ct.bonusYn ? 'checked' : '') + '> 없음</label>' +
      '</div></div>' +
      '<div class="lc-field"><label>상여금 금액 (원)</label><input id="lc-bonusamt" type="number" value="' + esc(ct.bonusAmount) + '" placeholder="0"></div>' +
      '<div class="lc-field"><label>기타급여</label>' +
      '<div class="lc-radio-group">' +
      '<label><input type="radio" name="lc-otherpay" value="y" ' + (ct.otherPayYn ? 'checked' : '') + '> 있음</label>' +
      '<label><input type="radio" name="lc-otherpay" value="n" ' + (!ct.otherPayYn ? 'checked' : '') + '> 없음</label>' +
      '</div></div>' +
      '<div class="lc-field"><label>기타급여 내용</label><input id="lc-otherpaydetail" type="text" value="' + esc(ct.otherPayDetails) + '" placeholder="식비 100,000원 등"></div>' +
      '</div></div>' +

      /* 사회보험 (표준계약서에만 해당) */
      '<div class="lc-form-section" id="lc-insurance-section">' +
      '<div class="lc-section-title" style="font-size:13px;">사회보험 적용여부</div>' +
      '<div class="lc-check-group">' +
      '<label><input type="checkbox" id="lc-ins-employment" ' + (ins.employment ? 'checked' : '') + '> 고용보험</label>' +
      '<label><input type="checkbox" id="lc-ins-industrial" ' + (ins.industrial ? 'checked' : '') + '> 산재보험</label>' +
      '<label><input type="checkbox" id="lc-ins-pension" ' + (ins.pension ? 'checked' : '') + '> 국민연금</label>' +
      '<label><input type="checkbox" id="lc-ins-health" ' + (ins.health ? 'checked' : '') + '> 건강보험</label>' +
      '</div></div>' +

      /* 계약 방식 */
      '<div class="lc-form-section">' +
      '<div class="lc-section-title" style="font-size:13px;">계약 방식</div>' +
      '<div class="lc-radio-group">' +
      '<label><input type="radio" name="lc-delivery" value="print" ' + (c.deliveryType !== 'electronic' ? 'checked' : '') + '> 출력 (대면 서명)</label>' +
      '<label><input type="radio" name="lc-delivery" value="electronic" ' + (c.deliveryType === 'electronic' ? 'checked' : '') + '> 전자계약 (온라인 서명 링크 발송)</label>' +
      '</div></div>' +

      '<div class="lc-form-actions">' +
      '<button class="lc-btn lc-btn-secondary" id="lc-cancel-btn">취소</button>' +
      '<button class="lc-btn lc-btn-outline" id="lc-preview-btn">미리보기</button>' +
      '<button class="lc-btn lc-btn-primary" id="lc-save-btn">저장</button>' +
      '</div>' +
      '</div>';

    /* 타입 변경 시 사회보험 섹션 토글 */
    var typeRadios = wrap.querySelectorAll('input[name="lc-type"]');
    var insSection = wrap.querySelector('#lc-insurance-section');
    function toggleInsSection() {
      var sel = wrap.querySelector('input[name="lc-type"]:checked');
      if (sel && sel.value === 'shortterm') {
        insSection.style.display = 'none';
      } else {
        insSection.style.display = '';
      }
    }
    typeRadios.forEach(function (r) { r.addEventListener('change', toggleInsSection); });
    toggleInsSection();

    /* 폼 데이터 수집 */
    function collectData() {
      var typeVal = (wrap.querySelector('input[name="lc-type"]:checked') || {}).value || 'standard';
      var deliveryVal = (wrap.querySelector('input[name="lc-delivery"]:checked') || {}).value || 'print';
      var bonusVal = (wrap.querySelector('input[name="lc-bonus"]:checked') || {}).value;
      var otherVal = (wrap.querySelector('input[name="lc-otherpay"]:checked') || {}).value;

      return {
        id: c.id,
        type: typeVal,
        status: c.status,
        deliveryType: deliveryVal,
        createdAt: c.createdAt,
        sentAt: c.sentAt,
        signedAt: c.signedAt,
        signToken: c.signToken,
        employer: cfg,
        employee: {
          name: wrap.querySelector('#lc-ee-name').value.trim(),
          address: wrap.querySelector('#lc-ee-address').value.trim(),
          phone: wrap.querySelector('#lc-ee-phone').value.trim(),
          email: wrap.querySelector('#lc-ee-email').value.trim(),
          idNumber: ''
        },
        contract: {
          startDate: wrap.querySelector('#lc-start').value,
          endDate: wrap.querySelector('#lc-end').value,
          workplace: wrap.querySelector('#lc-workplace').value.trim(),
          jobDescription: wrap.querySelector('#lc-job').value.trim(),
          workStart: wrap.querySelector('#lc-wstart').value,
          workEnd: wrap.querySelector('#lc-wend').value,
          breakStart: wrap.querySelector('#lc-bstart').value,
          breakEnd: wrap.querySelector('#lc-bend').value,
          workDays: wrap.querySelector('#lc-workdays').value.trim(),
          holiday: wrap.querySelector('#lc-holiday').value.trim(),
          wageType: wrap.querySelector('#lc-wagetype').value,
          wageAmount: wrap.querySelector('#lc-wageamt').value,
          bonusYn: bonusVal === 'y',
          bonusAmount: wrap.querySelector('#lc-bonusamt').value,
          otherPayYn: otherVal === 'y',
          otherPayDetails: wrap.querySelector('#lc-otherpaydetail').value.trim(),
          payDay: wrap.querySelector('#lc-payday').value,
          payMethod: wrap.querySelector('#lc-paymethod').value,
          insurance: {
            employment: wrap.querySelector('#lc-ins-employment').checked,
            industrial: wrap.querySelector('#lc-ins-industrial').checked,
            pension: wrap.querySelector('#lc-ins-pension').checked,
            health: wrap.querySelector('#lc-ins-health').checked
          }
        },
        employeeSignData: c.employeeSignData || '',
      };
    }

    wrap.querySelector('#lc-cancel-btn').onclick = function () {
      _renderList(wrap);
    };

    wrap.querySelector('#lc-preview-btn').onclick = function () {
      var data = collectData();
      _renderPreview(data);
    };

    wrap.querySelector('#lc-save-btn').onclick = function () {
      var data = collectData();
      if (!data.employee.name) { showToast('근로자 성명을 입력해 주세요.', 'error'); return; }
      if (!data.contract.startDate || !data.contract.endDate) { showToast('계약기간을 입력해 주세요.', 'error'); return; }

      upsertContract(data);

      if (data.deliveryType === 'electronic') {
        var url = _sendElectronic(data);
        showToast('전자계약서가 발송 준비되었습니다.', 'success');
        _renderList(wrap);
        /* 발송 후 링크 표시 */
        setTimeout(function () {
          var linkBox = document.createElement('div');
          linkBox.className = 'lc-sign-link-box';
          linkBox.innerHTML = '<p>전자서명 링크 (복사하여 근로자에게 전달하세요)</p>' +
            '<span class="lc-sign-url">' + esc(url) + '</span>' +
            '<button class="lc-btn lc-btn-primary lc-btn-sm" id="lc-copy-link-btn">링크 복사 (카카오/이메일용 메시지 포함)</button>';
          wrap.insertBefore(linkBox, wrap.firstChild.nextSibling);
          wrap.querySelector('#lc-copy-link-btn').onclick = function () {
            _copySignUrl(data);
          };
        }, 100);
      } else {
        data.status = 'completed';
        upsertContract(data);
        showToast('계약서가 저장되었습니다.', 'success');
        _renderList(wrap);
        setTimeout(function () {
          if (confirm('계약서를 인쇄하시겠습니까?')) {
            _printContract(data);
          }
        }, 200);
      }
    };
  }

  /* ===================== 목록 렌더링 ===================== */
  function _renderList(wrap) {
    var list = loadContracts();

    var statusLabel = { draft: '임시저장', sent: '발송됨', signed: '서명완료', completed: '체결완료' };
    var typeLabel = { standard: '표준', shortterm: '단기' };

    var rows = list.length === 0
      ? '<tr class="lc-empty-row"><td colspan="7">등록된 계약서가 없습니다.</td></tr>'
      : list.map(function (c) {
        var badgeCls = 'lc-badge lc-badge-' + (c.status || 'draft');
        var badge = '<span class="' + badgeCls + '">' + (statusLabel[c.status] || c.status) + '</span>';
        var actions = '';
        actions += '<button class="lc-btn lc-btn-outline lc-btn-sm lc-act-preview" data-id="' + esc(c.id) + '">미리보기</button> ';
        actions += '<button class="lc-btn lc-btn-secondary lc-btn-sm lc-act-edit" data-id="' + esc(c.id) + '">수정</button> ';
        if (c.status === 'sent') {
          actions += '<button class="lc-btn lc-btn-primary lc-btn-sm lc-act-copylink" data-id="' + esc(c.id) + '">링크복사</button> ';
        }
        actions += '<button class="lc-btn lc-btn-danger lc-btn-sm lc-act-delete" data-id="' + esc(c.id) + '">삭제</button>';
        return '<tr>' +
          '<td>' + esc(c.id) + '</td>' +
          '<td>' + (typeLabel[c.type] || c.type) + '</td>' +
          '<td>' + esc((c.employee && c.employee.name) || '-') + '</td>' +
          '<td>' + badge + '</td>' +
          '<td>' + formatDate(c.contract && c.contract.startDate) + ' ~ ' + formatDate(c.contract && c.contract.endDate) + '</td>' +
          '<td>' + formatDate(c.createdAt) + '</td>' +
          '<td>' + actions + '</td>' +
          '</tr>';
      }).join('');

    wrap.innerHTML =
      '<div class="lc-section-title">근로계약서 목록</div>' +
      '<div class="lc-toolbar">' +
      '<div class="lc-toolbar-left">' +
      '<button class="lc-btn lc-btn-primary" id="lc-new-btn">+ 새 계약서</button>' +
      '</div>' +
      '<div>' +
      '<button class="lc-btn lc-btn-outline" id="lc-settings-btn">설정 (법인인감/갑 정보)</button>' +
      '</div></div>' +
      '<table class="lc-list-table">' +
      '<thead><tr>' +
      '<th>계약서 ID</th><th>종류</th><th>근로자명</th><th>상태</th><th>계약기간</th><th>생성일</th><th>액션</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table>';

    wrap.querySelector('#lc-new-btn').onclick = function () {
      _renderForm(wrap, null);
    };

    wrap.querySelector('#lc-settings-btn').onclick = function () {
      _renderSettings(wrap);
    };

    wrap.querySelectorAll('.lc-act-preview').forEach(function (btn) {
      btn.onclick = function () {
        var contract = getContractById(btn.dataset.id);
        if (contract) _renderPreview(contract);
      };
    });

    wrap.querySelectorAll('.lc-act-edit').forEach(function (btn) {
      btn.onclick = function () {
        var contract = getContractById(btn.dataset.id);
        if (contract) _renderForm(wrap, contract);
      };
    });

    wrap.querySelectorAll('.lc-act-copylink').forEach(function (btn) {
      btn.onclick = function () {
        var contract = getContractById(btn.dataset.id);
        if (contract && contract.signToken) _copySignUrl(contract);
        else showToast('전자계약 링크가 없습니다.', 'error');
      };
    });

    wrap.querySelectorAll('.lc-act-delete').forEach(function (btn) {
      btn.onclick = function () {
        if (!confirm('계약서를 삭제하시겠습니까?')) return;
        deleteContract(btn.dataset.id);
        showToast('삭제되었습니다.', 'success');
        _renderList(wrap);
      };
    });
  }

  /* ===================== 설정 패널 ===================== */
  function _renderSettings(wrap) {
    var sealB64 = loadSeal();
    var cfg = loadCfg();

    var sealPreview = sealB64
      ? '<img src="' + sealB64 + '" style="width:80px;height:80px;object-fit:contain;">'
      : '<div class="lc-seal-placeholder" style="width:80px;height:80px;border:2px dashed #ccc;display:flex;align-items:center;justify-content:center;font-size:11px;color:#aaa;">없음</div>';

    wrap.innerHTML =
      '<div class="lc-settings">' +
      '<div class="lc-section-title">설정</div>' +

      '<div class="lc-form-section">' +
      '<div class="lc-section-title" style="font-size:13px;">법인인감 이미지</div>' +
      '<p style="font-size:12px;color:#6b7280;margin:0 0 8px 0;">PNG/JPG 형식의 인감 이미지를 업로드하면 계약서 날인란에 자동 삽입됩니다.</p>' +
      '<div style="display:flex;align-items:center;gap:16px;margin-bottom:10px;">' +
      '<div id="lc-seal-preview-box">' + sealPreview + '</div>' +
      '<div>' +
      '<input type="file" id="lc-seal-file" accept="image/*" style="display:none;">' +
      '<button class="lc-btn lc-btn-primary lc-btn-sm" id="lc-seal-upload-btn">이미지 업로드</button>' +
      (sealB64 ? ' <button class="lc-btn lc-btn-danger lc-btn-sm" id="lc-seal-delete-btn">삭제</button>' : '') +
      '</div></div></div>' +

      '<div class="lc-form-section">' +
      '<div class="lc-section-title" style="font-size:13px;">갑 (사업주) 기본 정보</div>' +
      '<div class="lc-form-grid">' +
      '<div class="lc-field"><label>사업체명</label><input id="lc-cfg-name" type="text" value="' + esc(cfg.name) + '"></div>' +
      '<div class="lc-field"><label>대표자</label><input id="lc-cfg-rep" type="text" value="' + esc(cfg.rep) + '"></div>' +
      '<div class="lc-field lc-form-full"><label>주소</label><input id="lc-cfg-address" type="text" value="' + esc(cfg.address) + '"></div>' +
      '<div class="lc-field"><label>전화번호</label><input id="lc-cfg-phone" type="text" value="' + esc(cfg.phone) + '"></div>' +
      '</div></div>' +

      '<div style="display:flex;gap:10px;margin-top:16px;">' +
      '<button class="lc-btn lc-btn-secondary" id="lc-settings-back-btn">목록으로</button>' +
      '<button class="lc-btn lc-btn-primary" id="lc-settings-save-btn">저장</button>' +
      '</div></div>';

    wrap.querySelector('#lc-seal-upload-btn').onclick = function () {
      wrap.querySelector('#lc-seal-file').click();
    };

    wrap.querySelector('#lc-seal-file').onchange = function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        localStorage.setItem(LS_SEAL, ev.target.result);
        showToast('인감 이미지가 저장되었습니다.', 'success');
        _renderSettings(wrap);
      };
      reader.readAsDataURL(file);
    };

    var delBtn = wrap.querySelector('#lc-seal-delete-btn');
    if (delBtn) {
      delBtn.onclick = function () {
        if (!confirm('인감 이미지를 삭제하시겠습니까?')) return;
        localStorage.removeItem(LS_SEAL);
        showToast('인감 이미지가 삭제되었습니다.', 'success');
        _renderSettings(wrap);
      };
    }

    wrap.querySelector('#lc-settings-back-btn').onclick = function () {
      _renderList(wrap);
    };

    wrap.querySelector('#lc-settings-save-btn').onclick = function () {
      var newCfg = {
        name: wrap.querySelector('#lc-cfg-name').value.trim() || DEFAULT_EMPLOYER.name,
        rep: wrap.querySelector('#lc-cfg-rep').value.trim() || DEFAULT_EMPLOYER.rep,
        address: wrap.querySelector('#lc-cfg-address').value.trim() || DEFAULT_EMPLOYER.address,
        phone: wrap.querySelector('#lc-cfg-phone').value.trim() || DEFAULT_EMPLOYER.phone
      };
      saveCfg(newCfg);
      showToast('설정이 저장되었습니다.', 'success');
      _renderList(wrap);
    };
  }

  /* ===================== init ===================== */
  function init(rootId) {
    var root = document.getElementById(rootId);
    if (!root) {
      console.error('LaborContractModule: rootId not found:', rootId);
      return;
    }

    /* CSS 주입 */
    if (!document.getElementById('lc-style')) {
      var link = document.createElement('link');
      link.id = 'lc-style';
      link.rel = 'stylesheet';
      link.href = 'labor-contract.css';
      document.head.appendChild(link);
    }

    var wrap = document.createElement('div');
    wrap.className = 'lc-wrap';
    wrap.innerHTML = '<h2>근로계약서 관리</h2>';
    root.appendChild(wrap);

    var innerWrap = document.createElement('div');
    wrap.appendChild(innerWrap);

    _renderList(innerWrap);
  }

  /* ===================== public API ===================== */
  return {
    init: init,
    getContractByToken: getContractByToken,
    saveEmployeeSign: saveEmployeeSign
  };

})();
