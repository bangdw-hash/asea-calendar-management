'use strict';
window.HelpModule = (function () {

  var _inited = false;

  /* ── 메뉴별 도움말 데이터 ── */
  var MENUS = [
    {
      id: 'calendar', icon: '📅', title: '캘린더',
      desc: 'Google Calendar 일정을 월별·주별로 조회합니다.',
      steps: [
        '로그인 후 기본 화면에 자동으로 표시됩니다.',
        '◀ ▶ 버튼 — 이전/다음 달 이동',
        '오늘 버튼 — 이번 달로 이동',
        '월 / 주 버튼 — 월간 보기 ↔ 주간 보기 전환',
        '일정 클릭 — 상세 내용 팝업 표시',
        '날짜 빈 칸 클릭 — 새 일정 빠른 등록',
      ],
      tips: ['설정 탭 → 내 캘린더 표시 설정에서 표시할 캘린더를 선택할 수 있습니다.'],
    },
    {
      id: 'weekly-hub', icon: '📋', title: '주간허브',
      desc: '주간 업무보고 이메일 발송용 일정 후보 추출 및 카카오톡 공지 문구 자동 생성',
      steps: [
        '이번 주 / 다음 주 버튼으로 대상 주차 선택',
        '일정 불러오기 클릭 → Google Calendar에서 해당 주 일정 자동 로드',
        '보고에 포함할 일정 체크박스 선택',
        '카카오톡 문구 생성 클릭 → 공지 문구 자동 완성',
        '문구 수정 후 복사 또는 이메일 탭으로 이동하여 발송',
      ],
      tips: [],
    },
    {
      id: 'report', icon: '📝', title: '보고',
      desc: '주간업무보고서를 작성하고 A4 PDF로 출력합니다. PDF 양식과 동일한 형태로 출력됩니다.',
      steps: [
        '【관리자 먼저】 ⚙️ 주차관리 버튼 → 연도·주차번호·금주기간·차주기간·부서순서 입력 후 저장',
        '+ 보고서 작성 클릭',
        '기본 정보 입력: 주차 선택 / 작성부서 / 작성자(직접 입력, 대리 작성 가능) / 검토자 / 총원 / 상태',
        '근태현황 표: 연차·출장 각 요일별 인원 수 입력',
        '업무보고 4개 섹션 입력 (처리완료·진행중 / 추진·계획 / 주요이슈 / 안내·협조)',
        '각 섹션 하단 붙여넣기 존 클릭 후 Ctrl+V로 이미지 직접 붙여넣기 가능',
        '첨부파일 드래그 또는 클릭하여 이미지·PDF·Excel·HWP 첨부',
        '💾 저장 클릭',
        '👁 미리보기 → A4 형태 확인 → 🖨️ 인쇄/PDF 저장',
      ],
      tips: [
        '기획처는 근로자현황·훈련생현황 섹션이 추가로 표시됩니다.',
        '관리자: 📦 취합 PDF — 주차 선택 시 전체 부서 보고서를 순서대로 한 PDF로 출력',
        '문서 상태를 "작성완료"로 바꾸면 다른 사람도 열람만 가능합니다.',
      ],
    },
    {
      id: 'promo', icon: '📣', title: '홍보슬라이드',
      desc: '홍보 내용을 입력하면 AI가 슬라이드용 문구를 자동 생성하고 Google Slides에 등록합니다.',
      steps: [
        '【사전 설정】 설정 탭 → Claude API 키 등록 (필수)',
        '【사전 설정】 설정 탭 → 홍보슬라이드 설정 → GAS 프록시 URL 등록 (슬라이드 자동 추가 시 필수)',
        '테마 선택 — 📢 홍보 / 📋 안내 / 🎉 행사 (배경색 자동 변경)',
        '홍보할 내용 자유 입력 (예: 2026년 항공정비과 신입생 모집, 지원기간 6/1~7/31)',
        '🤖 문구 생성 클릭 → AI가 제목·본문·태그 자동 생성',
        '미리보기 카드 확인 → 텍스트 클릭하여 직접 수정 가능',
        '📺 슬라이드에 추가 클릭 → Google Slides에 자동 등록',
        '최근 등록 이력 테이블에서 성공/실패 상태 확인',
      ],
      tips: [
        'GAS 프록시 URL 등록 방법은 도움말 → 홍보슬라이드 GAS 설정 가이드를 참고하세요.',
        '원격 PC 모니터 자동 롤링 설정은 아래 \'홍보슬라이드 GAS 설정 가이드\' 섹션을 확인하세요.',
      ],
      extra: 'promo-gas',
    },
    {
      id: 'email', icon: '✉️', title: '이메일',
      desc: '업무보고 이메일 작성, 즉시 발송 및 예약 발송',
      steps: [
        '보고서 선택 — Drive 저장 파일 선택 또는 직접 파일 첨부',
        '수신자 — 설정 탭에서 등록한 수신자 목록에서 체크 선택',
        '제목 / 본문 입력 또는 자동 생성된 내용 수정',
        '📤 발송 버튼 클릭 (즉시 발송)',
        '예약 발송: 날짜·시간 설정 후 ⏰ 예약 등록 클릭',
        '발송 이력 탭에서 예약 목록 및 발송 상태 확인',
      ],
      tips: [
        'Make.com 웹훅 URL을 설정 탭에 등록하면 브라우저가 닫혀도 예약 이메일이 자동 발송됩니다.',
        '수신자는 설정 탭 → 수신자 목록에서 미리 등록해 두세요.',
      ],
    },
    {
      id: 'extract', icon: '📄', title: '일정발췃',
      desc: '공문·안내문 PDF를 업로드하면 AI가 일정을 자동 추출하여 Google Calendar에 등록',
      steps: [
        '탭 내 API 키 입력란에 Claude API 키 붙여넣기 후 저장',
        'PDF 파일 선택 — 공문, 안내문, 행사 일정표 등',
        '🤖 일정 추출 시작 클릭 → AI가 날짜·시간·내용 자동 분석',
        '추출된 일정 목록에서 등록할 항목 체크',
        '캘린더에 등록 클릭 → Google Calendar에 자동 생성',
        '추출 이력 서브탭 — 이전 작업 내역 확인',
        '공유 URL 서브탭 — 추출 결과 공유 링크 생성',
      ],
      tips: [
        '시간 정보가 없는 일정은 종일 이벤트로 자동 등록됩니다.',
        'API 키 형식 자동 판별: sk-ant-api03-... → 공식 API / sk-9bbf...(hex 64자) → 프록시 자동 사용',
      ],
    },
    {
      id: 'work', icon: '👷', title: '업무관리',
      desc: '부서별 업무 등록, 현황 조회, 직원 업무 캘린더 연동',
      steps: [
        '새 업무 발송: 수신 부서 선택 → 업무 제목·내용·마감일 입력 → 발송',
        '부서 업무현황: 상단 부서 탭 클릭 → 진행중/완료 업무 목록 조회',
        '각 업무 클릭 → 상세 내용 및 담당자 확인',
      ],
      tips: ['설정 탭 → 공유 캘린더 소스에 부서 캘린더 ID를 등록하면 일정이 자동 연동됩니다.'],
    },
    {
      id: 'facility', icon: '🏢', title: '대관업무',
      desc: '강의실·회의실·행사장 등 시설 예약 관리',
      steps: [
        '【관리자 먼저】 설정 탭 → 시설 관리에서 건물·호실 등록',
        '날짜 선택 → 건물/호실 선택 → 사용 시간 입력',
        '사용 목적·담당자 입력 → 예약 신청 클릭',
        '캘린더 뷰에서 건물별 색상으로 예약 현황 확인',
        '신청 관리 서브탭 — 예약 승인·반려 처리 (관리자)',
      ],
      tips: [],
    },
    {
      id: 'vehicle', icon: '🚗', title: '차량관리',
      desc: '업무용 차량 예약 신청 및 현황 관리',
      steps: [
        '【관리자 먼저】 설정 탭 → 차량 관리에서 차량 등록',
        '날짜 선택 → 차량 선택 → 출발·반납 예정 시간 입력',
        '목적지·사용 목적 입력 → 예약 신청 클릭',
        '차량별 예약 캘린더 뷰에서 현황 확인',
        '관리자: 예약 승인·반려·반납 처리',
      ],
      tips: [],
    },
    {
      id: 'classroom', icon: '🏫', title: '강의실현황',
      desc: '강의실 수업 시간표 및 사용 현황 실시간 조회',
      steps: [
        '날짜 선택 → 강의실별 시간대별 사용 현황 표 확인',
        '빈 슬롯 = 사용 가능 / 색상 블록 = 예약됨',
        '관리자 — ⚙️ 강의실 관리에서 시간표 등록·수정',
      ],
      tips: [],
    },
    {
      id: 'workorder', icon: '🔧', title: '작업지시',
      desc: '시설 수리·IT 지원 등 작업 지시서 발행 및 진행 현황 추적',
      steps: [
        '작업 유형 선택 (시설수리 / IT지원 / 기타)',
        '장소·내용 입력 → 우선순위 선택 (긴급/일반) → 담당자 지정 → 등록 클릭',
        '담당자: 상태 업데이트 클릭 → 진행중 → 완료 처리',
        '대기중 / 진행중 / 완료 상태별 필터링 조회',
      ],
      tips: [],
    },
    {
      id: 'checkinmgmt', icon: '🚪', title: '입출입관리',
      desc: 'QR 코드 기반 강의실 출석 체크 / 입출입 현황 조회',
      steps: [
        '학생/수강생: checkin.html 접속 또는 QR 코드 스캔 → 이름·학번·과정 입력 → 체크인 클릭',
        '관리자: 날짜 선택 → 해당일 전체 입출입 기록 조회',
        '과정별·시간대별 필터 적용',
        '엑셀 내보내기 클릭 → 출석 데이터 다운로드',
      ],
      tips: ['문의: 관리자 방시원 02-714-9710'],
    },
    {
      id: 'sms', icon: '📱', title: '문자발송',
      desc: '알리고(Aligo) SMS 서비스 연동 문자 발송',
      steps: [
        '【사전 설정】 문자발송 탭 → ⚙️ 설정 서브탭 → 알리고 API 키·API ID·발신번호 입력',
        '문자 발송 서브탭 → 수신자 입력 (전화번호 직접 입력 또는 직원 목록 선택)',
        '메시지 입력 (90자 이하 SMS / 90자 초과 LMS 자동 전환)',
        '즉시 발송 또는 예약 발송 시간 설정 → 발송 클릭',
        '발송 이력 서브탭에서 전송 결과 확인',
      ],
      tips: ['알리고 API 키: 알리고 → 개발자센터 → API 키/ID에서 발급'],
    },
    {
      id: 'settings', icon: '⚙️', title: '설정',
      desc: '앱 전체 환경 설정. 처음 사용 시 이 탭을 먼저 설정해야 합니다.',
      steps: [
        'Google 계정 — 로그인 상태 및 로그아웃 버튼',
        '직원관리(관리자) — CSV 파일로 직원 일괄 등록 (형식: 이름,부서,직급,구글이메일,입사일,전화번호,권한)',
        'Claude API 키 — 일정발췃·홍보슬라이드에 사용. 키 형식에 따라 엔드포인트 자동 결정',
        'GitHub Token — 일정 공유 페이지 자동 생성 시 필요. GitHub → Fine-grained tokens에서 발급',
        '홍보슬라이드 설정 — GAS 프록시 URL 입력 (도움말 → GAS 설정 가이드 참고)',
        'Make.com 웹훅 URL — 이메일 예약 자동 발송에 필요',
        '내 캘린더 표시 설정 — 표시할 Google Calendar 선택',
        'Drive 설정 — 보고서 저장 폴더 ID 입력',
        '수신자 목록 — 이메일 발송 대상자 이름+이메일 등록',
        '☁️ 설정 클라우드 동기화 — 다른 기기에서도 동일한 설정 사용',
      ],
      tips: ['처음 사용 순서: 직원관리 → Claude API 키 → 캘린더 설정 → 수신자 목록 → 주차 등록(보고탭)'],
    },
  ];

  /* ── GAS 설정 가이드 데이터 ── */
  var GAS_GUIDE = {
    title: '📣 홍보슬라이드 GAS 설정 가이드 (최초 1회)',
    subtitle: '앱에서 Google Slides에 슬라이드를 자동 추가하려면 중간 연결 프로그램(GAS)을 한 번 설정해야 합니다.',
    steps: [
      {
        num: 1, title: 'Google Slides 파일 만들기',
        items: [
          '<a href="https://slides.google.com" target="_blank" class="hlp-link">slides.google.com</a> 접속 → + 새 프레젠테이션 클릭',
          '제목: <strong>ASEA 홍보슬라이드</strong> 입력',
          '주소창 URL에서 ID 복사<br><code class="hlp-code">https://docs.google.com/presentation/d/<strong>[여기가 ID]</strong>/edit</code>',
          '복사한 ID를 메모장에 붙여넣어 보관',
        ],
      },
      {
        num: 2, title: 'Google Apps Script 프로젝트 만들기',
        items: [
          '<a href="https://script.google.com" target="_blank" class="hlp-link">script.google.com</a> 접속',
          '왼쪽 상단 <strong>+ 새 프로젝트</strong> 클릭',
          '상단 프로젝트 이름 클릭 → <strong>ASEA 홍보슬라이드 Proxy</strong> 입력',
        ],
      },
      {
        num: 3, title: '코드 붙여넣기 및 ID 수정',
        items: [
          '편집창 기존 내용 전체 삭제 (<kbd>Ctrl+A</kbd> → <kbd>Delete</kbd>)',
          '프로젝트 폴더의 <strong>gas_slides_proxy.gs</strong> 파일을 메모장으로 열기',
          '내용 전체 복사 (<kbd>Ctrl+A</kbd> → <kbd>Ctrl+C</kbd>) 후 스크립트 편집창에 붙여넣기',
          '코드 맨 위에서 아래 줄 찾기:<br><code class="hlp-code">var PRESENTATION_ID = \'여기에_...\'; </code>',
          '따옴표 안 내용을 STEP 1에서 복사한 ID로 교체',
          '<kbd>Ctrl+S</kbd>로 저장',
        ],
      },
      {
        num: 4, title: '웹 앱으로 배포',
        items: [
          '오른쪽 상단 <strong>배포</strong> 버튼 클릭 → <strong>새 배포</strong> 클릭',
          '왼쪽 ⚙️ 클릭 → <strong>웹 앱</strong> 선택',
          '<strong>다음 사용자로 실행</strong>: 나 (본인 이메일) 선택',
          '<strong>액세스 권한</strong>: 모든 사용자 선택',
          '<strong>배포</strong> 클릭',
          '권한 승인 팝업 → 본인 계정 선택 → <em>고급</em> 클릭 → <em>ASEA 홍보슬라이드 Proxy(으)로 이동</em> 클릭 → <strong>허용</strong>',
          '표시되는 <strong>웹 앱 URL</strong> 전체 복사 (메모장에 보관)',
        ],
      },
      {
        num: 5, title: 'ASEA 앱에 URL 등록',
        items: [
          'ASEA 앱 → <strong>설정 탭</strong> 이동',
          '<strong>📣 홍보슬라이드 설정</strong> 카드에서 GAS 프록시 URL 입력란에 STEP 4 URL 붙여넣기',
          '<strong>저장</strong> 클릭',
        ],
      },
      {
        num: 6, title: '원격 PC 키오스크 설정 (자동 롤링 모니터)',
        items: [
          '【웹 게시 URL 만들기】 Google Slides 파일 열기 → 파일 → 공유 → 웹에 게시',
          '슬라이드 전환 간격: <strong>5초</strong> / 재시작: 체크 / 자동 시작: 체크 → 게시 → URL 복사',
          '【배치파일 만들기】 원격 PC 바탕화면에 <strong>start_promo.bat</strong> 파일 생성',
          '메모장으로 열어 아래 내용 입력 (URL 부분을 실제 URL로 교체):<br><code class="hlp-code">@echo off<br>start "" "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk --noerrdialogs --disable-infobars "[웹게시URL]"</code>',
          '저장 후 닫기',
          '【자동 시작 등록】 <kbd>Win+R</kbd> → <strong>shell:startup</strong> 입력 → 엔터 → 배치파일 복사',
          '이제 PC를 켜면 Chrome 전체화면으로 슬라이드 자동 재생, 새 슬라이드 추가 시 즉시 반영',
        ],
      },
    ],
  };

  /* ══════════════════════════════════════════════
     렌더링
  ══════════════════════════════════════════════ */
  function init() {
    if (!_inited) _inited = true;
    render();
  }

  function render() {
    var root = document.getElementById('help-root');
    if (!root) return;
    root.innerHTML = htmlPage();
    bindEvents();
  }

  function htmlPage() {
    var menuCards = MENUS.map(function(m){
      return '<div class="hlp-card" id="hlp-menu-'+m.id+'">'+
        '<div class="hlp-card-hd" data-id="'+m.id+'">'+
        '<span class="hlp-card-icon">'+m.icon+'</span>'+
        '<span class="hlp-card-ttl">'+m.title+'</span>'+
        '<span class="hlp-tag">'+m.desc.slice(0,28)+(m.desc.length>28?'…':'')+'</span>'+
        '<span class="hlp-arrow">▼</span>'+
        '</div>'+
        '<div class="hlp-card-body" id="hlp-body-'+m.id+'" hidden>'+
        htmlCardBody(m)+
        '</div></div>';
    }).join('');

    var gasSteps = GAS_GUIDE.steps.map(function(s){
      var items = s.items.map(function(it){
        return '<li class="hlp-li">'+it+'</li>';
      }).join('');
      return '<div class="hlp-gas-step">'+
        '<div class="hlp-gas-num">STEP '+s.num+'</div>'+
        '<div class="hlp-gas-ttl">'+s.title+'</div>'+
        '<ul class="hlp-ul">'+items+'</ul>'+
        '</div>';
    }).join('');

    return '<div class="hlp-wrap">'+

      /* 헤더 */
      '<div class="hlp-header">'+
      '<div class="hlp-header-title">❓ 사용 설명서</div>'+
      '<div class="hlp-header-sub">ASEA 캘린더 관리 시스템 — 메뉴별 사용 방법</div>'+
      '</div>'+

      /* 처음 시작 안내 */
      '<div class="hlp-start-box">'+
      '<div class="hlp-start-title">🚀 처음 사용 시 권장 순서</div>'+
      '<ol class="hlp-start-ol">'+
      '<li><strong>설정 탭</strong> → Google 계정 로그인 확인</li>'+
      '<li><strong>설정 탭</strong> → 직원관리(관리자) → CSV로 직원 등록</li>'+
      '<li><strong>설정 탭</strong> → Claude API 키 등록</li>'+
      '<li><strong>설정 탭</strong> → 내 캘린더 표시 설정 → 새로고침 후 체크</li>'+
      '<li><strong>설정 탭</strong> → 수신자 목록 등록</li>'+
      '<li><strong>보고 탭</strong> → 주차관리(관리자) → 주차 등록</li>'+
      '<li>이후 각 탭 정상 사용 가능</li>'+
      '</ol>'+
      '</div>'+

      /* 메뉴별 카드 */
      '<div class="hlp-section-title">📌 메뉴별 사용 방법</div>'+
      '<div class="hlp-cards">'+menuCards+'</div>'+

      /* GAS 설정 가이드 */
      '<div class="hlp-gas-guide" id="hlp-gas-guide">'+
      '<div class="hlp-gas-hd">'+
      '<div class="hlp-gas-main-ttl">'+GAS_GUIDE.title+'</div>'+
      '<div class="hlp-gas-main-sub">'+GAS_GUIDE.subtitle+'</div>'+
      '</div>'+
      '<div class="hlp-gas-flow">'+
      '<span class="hlp-flow-box">ASEA 앱</span>'+
      '<span class="hlp-flow-arrow">→</span>'+
      '<span class="hlp-flow-box hlp-flow-mid">Google Apps Script<br><small>(중간 연결)</small></span>'+
      '<span class="hlp-flow-arrow">→</span>'+
      '<span class="hlp-flow-box">Google Slides<br><small>(슬라이드 추가)</small></span>'+
      '<span class="hlp-flow-arrow">→</span>'+
      '<span class="hlp-flow-box">원격 PC 모니터<br><small>(자동 표시)</small></span>'+
      '</div>'+
      gasSteps+
      '</div>'+

      /* 문의 */
      '<div class="hlp-contact">'+
      '문의: 관리자 방시원 &nbsp;<a href="tel:02-714-9710" class="hlp-tel">📞 02-714-9710</a>'+
      '</div>'+
      '</div>';
  }

  function htmlCardBody(m) {
    var stepsHtml = m.steps.map(function(s, i){
      return '<li class="hlp-step"><span class="hlp-step-num">'+(i+1)+'</span>'+s+'</li>';
    }).join('');
    var tipsHtml = m.tips.length
      ? '<div class="hlp-tips"><div class="hlp-tips-title">💡 참고</div><ul>'+
        m.tips.map(function(t){ return '<li>'+t+'</li>'; }).join('')+
        '</ul></div>'
      : '';
    var extraBtn = m.extra === 'promo-gas'
      ? '<button class="hlp-extra-btn" id="hlp-goto-gas">📖 GAS 설정 가이드 보기 ↓</button>'
      : '';
    var shortcutBtn = '<button class="hlp-shortcut-btn" data-tab="'+m.id+'">→ '+m.title+' 탭으로 이동</button>';
    return '<p class="hlp-desc">'+m.desc+'</p>'+
      '<ol class="hlp-steps">'+stepsHtml+'</ol>'+
      tipsHtml+extraBtn+shortcutBtn;
  }

  /* ── 이벤트 ── */
  function bindEvents() {
    /* 아코디언 카드 열기/닫기 */
    document.querySelectorAll('.hlp-card-hd').forEach(function(hd){
      hd.addEventListener('click', function(){
        var body  = document.getElementById('hlp-body-'+hd.dataset.id);
        var arrow = hd.querySelector('.hlp-arrow');
        if (!body) return;
        var open = !body.hidden;
        body.hidden = open;
        arrow.textContent = open ? '▼' : '▲';
        hd.classList.toggle('hlp-open', !open);
      });
    });

    /* GAS 가이드로 스크롤 */
    var gotoGas = document.getElementById('hlp-goto-gas');
    if (gotoGas) gotoGas.addEventListener('click', function(){
      var guide = document.getElementById('hlp-gas-guide');
      if (guide) guide.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    /* 탭 바로가기 버튼 */
    document.querySelectorAll('.hlp-shortcut-btn[data-tab]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var tabBtn = document.querySelector('[data-tab="'+btn.dataset.tab+'"]');
        if (tabBtn) tabBtn.click();
      });
    });
  }

  return { init: init };
})();
