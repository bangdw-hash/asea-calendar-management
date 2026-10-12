'use strict';
/**
 * aseasurvey-template.js — 기본 양식(2026학년도 2학기 교육과정 개선 설문, docx 기준)
 *  설문 정의(JSON) 스키마
 *   intro    : { title, subtitle, org, rewardText, timeNote, notice:[{k,v}], drawNotice, doneNote }
 *   scales   : { likert5:[{v,label}], yesno:[{v,label}] }   ※ v가 클수록 긍정(5=매우 그렇다). 화면에는 배열 순서대로 표시
 *   basic    : 응답자 공통 문항(반 선택 외) — 항상 공통 범위
 *   sections : [{ id, title, note, questions:[Q] }]
 *   Q        : { id, type:'scale'|'single'|'multi'|'text', label, scope:'course'|'common', required, scale, options:[{id,label,exclusive}],
 *                check:{valid}  (성실응답 점검 문항: 정답 값),  showIf:{q}  (같은 과목의 다른 다중선택 문항에서 '배타 선택 외' 항목이 선택되면 표시),
 *                placeholder, maxLen }
 */
(function () {
  function sc(id, label, extra) { return Object.assign({ id: id, type: 'scale', scope: 'course', scale: 'likert5', required: true, label: label }, extra || {}); }

  var def = {
    intro: {
      title: '2026학년도 2학기 교육과정 개선 설문 조사',
      subtitle: '교과목별 응답지',
      org: '아세아항공직업전문학교 교육처',
      rewardText: '설문에 참여해 주신 분들께 추첨을 통해 문화상품권 1만원을 드립니다.',
      timeNote: '과목당 약 2~3분이 소요됩니다.',
      notice: [
        { k: '목적', v: '아세아 교육과정에 대해 학습자 관점에서 점검하고 수업을 개선하기 위한 조사입니다.' },
        { k: '익명성', v: '무기명으로 진행되며, 응답 내용은 성적 산출과 무관합니다. 개별 응답은 담당 교수에게 제공되지 않고, 강좌 단위로 집계된 통계와 익명 처리된 서술형 의견만 전달됩니다.' },
        { k: '대상', v: '수강 중인 모든 교과목을 과목별로 응답해 주십시오. 모든 필수 문항에 응답해야 제출할 수 있습니다.' },
        { k: '유의사항', v: '문항을 읽지 않고 응답한 자료를 걸러내고 응답의 신뢰도를 확인하기 위한 문항이 1개 이상 포함되어 있습니다. 제출 후에는 수정할 수 없습니다.' }
      ],
      drawGuide: '성실하게 응답하고 서술형 의견을 구체적으로 작성하실수록 추첨 가능성이 높아집니다. 문항을 읽지 않고 지나치게 빠르게 응답하거나 성실응답 점검 문항에 맞지 않게 응답하신 경우 추첨 대상에서 제외될 수 있습니다.',
      textNudge: '구체적으로 작성할수록 추첨 가능성이 높아집니다.',
      drawNotice: '추첨 결과는 이 설문 링크에서 안내된 일정 이후 확인하실 수 있습니다. 제출 후 표시되는 추첨번호를 꼭 저장해 주십시오.',
      doneNote: '설문에 응해 주셔서 감사합니다.'
    },
    scales: {
      likert5: [{ v: 5, label: '매우 그렇다' }, { v: 4, label: '그렇다' }, { v: 3, label: '보통이다' }, { v: 2, label: '아니다' }, { v: 1, label: '전혀 아니다' }],
      yesno: [{ v: 1, label: '예' }, { v: 0, label: '아니오' }]
    },
    basic: [
      { id: 'attendance', type: 'single', required: true, label: '본인 출석 정도',
        options: [{ id: 'a90', label: '90% 이상' }, { id: 'a70', label: '70~89%' }, { id: 'a00', label: '70% 미만' }] }
    ],
    sections: [
      { id: 'S2', title: 'Ⅱ. 수업 전', note: '', questions: [
        sc('A1', '수업은 시간표에 맞게 정해진 시간에 시작된다.'),
        sc('A2', '교안·강의자료가 텍스트 외에 그림·차트·사진·영상 등으로 구성되어 이해에 도움이 된다.')
      ] },
      { id: 'S3', title: 'Ⅲ. 수업 진행 (수업 중)', note: '', questions: [
        sc('B1', '해당 차시에 무엇을 배우고 무엇을 할 수 있게 되는지(학습목표)를 수업 초반에 분명히 알려준다.'),
        sc('B2', '"이 내용을 왜 배워야 하는지"에 대해서 자격증 취득 또는 관련 분야 취업과 관련된 설명이 있다.'),
        sc('B3', '교재나 슬라이드 내용을 전달하는 데 그치지 않고, 학생이 이해를 하고 있는지에 대해 소통과 확인을 한다.'),
        sc('B4', '"왜", "어떻게"를 묻는 질문을 통해 학생이 스스로 생각해 볼 기회를 제공한다.'),
        sc('B5', '이론 설명 직후 문제풀이·실습·시뮬레이션 등으로 배운 내용을 바로 적용해 볼 기회가 있다.'),
        sc('B6', '학생들의 질문에 대해 신중하고 성실하게 답변한다.'),
        sc('B7', '수업을 방해하는 행동이 있을 때 적절히 관리하여 학습 분위기가 유지된다.'),
        sc('B8', "이 문항은 성실한 응답 여부를 확인하기 위한 문항입니다. 내용과 관계없이 '전혀 아니다'에 표시해 주세요.", { check: { valid: 1 } })
      ] },
      { id: 'S4', title: 'Ⅳ. 참여형 수업 운영', note: '', questions: [
        { id: 'C1', type: 'multi', scope: 'course', required: true, label: '이번 학기 이 수업에서 직접 경험한 활동을 모두 선택해 주세요. (복수 응답 가능)',
          options: [
            { id: 'c1', label: '문제 상황 해결(PBL·시나리오)' }, { id: 'c2', label: '찬반 토론 / 조별 토의' }, { id: 'c3', label: '퀴즈·게임형 활동(Kahoot 등)' },
            { id: 'c4', label: '실제 사례 분석' }, { id: 'c5', label: '조별·팀 과제 수행' }, { id: 'c6', label: '역할 연기·시연(롤플레잉)' },
            { id: 'c0', label: '위 활동을 경험한 적 없다 (강의 중심으로 진행됨)', exclusive: true }
          ] },
        sc('C2', '참여형 활동(토론·퀴즈·실습과제 등)이 수업 내용의 이해와 기억에 도움이 되었다.')
      ] },
      { id: 'S5', title: 'Ⅴ. 정리·평가·피드백 (수업 후)', note: '', questions: [
        sc('D1', '수업 종료 전에 핵심 내용을 요약·정리하거나, 학생이 직접 요약해 보도록 한다.'),
        sc('D2', '과제·퀴즈·시험에 대한 피드백이 질책이 아니라 개선 방향 중심으로 구체적으로 제공된다.'),
        sc('D3', '출결·과제·시험 등 평가가 사전에 공지된 기준에 따라 공정하게 운영된다.')
      ] },
      { id: 'S6', title: 'Ⅵ. 학습 성과', note: '', questions: [
        sc('E1', '이 수업은 현장 직무수행 능력 및 취업 역량 향상에 도움이 된다.'),
        sc('E2', "이 문항은 응답이 성실하게 이루어지고 있는지 확인하기 위한 것입니다. 수업 내용과 관계없이 '전혀 아니다'에 표시해 주십시오.", { check: { valid: 1 } }),
        sc('E3', '이 수업의 진도·난이도·학습량이 나의 현재 수준에 적절하다.'),
        { id: 'E4', type: 'text', scope: 'course', required: false, label: '적절하지 않다면 그 이유는 무엇입니까? (선택)', placeholder: '예: 진도가 빠르다/느리다, 어렵다, 양이 과도하다 등', maxLen: 300 }
      ] },
      { id: 'S7', title: 'Ⅶ. 교육윤리', note: '※ 본 영역은 만족도 점수에 합산되지 않으며, 별도의 절차에 따라 처리됩니다.', questions: [
        { id: 'F1', type: 'multi', scope: 'course', required: true, label: '이번 학기 이 수업에서 다음과 같은 상황을 경험하거나 목격한 적이 있습니까? (해당 항목 모두 선택)',
          options: [
            { id: 'f1', label: '학생에 대한 인신공격·비하·모욕적인 언사 등 인격을 존중하지 않는 발언' },
            { id: 'f2', label: '우월적 지위를 이용한 부당한 요구나 강요' },
            { id: 'f3', label: '성적 굴욕감이나 혐오감을 느끼게 하는 언동·농담' },
            { id: 'f4', label: '수업과 무관한 정치적 편향 발언, 또는 특정 국가·지역·집단에 대한 비하 발언' },
            { id: 'f5', label: '그 외의 판단하기 어려운 상황' },
            { id: 'f0', label: '없음', exclusive: true }
          ] },
        { id: 'F1T', type: 'text', scope: 'course', required: false, showIf: { q: 'F1' }, label: '"없음" 외의 항목을 선택하셨다면, 확인이 가능하도록 구체적인 상황(시기·내용)을 적어 주십시오. (선택)', maxLen: 800 }
      ] },
      { id: 'S8', title: 'Ⅷ. 서술형 의견', note: '', questions: [
        { id: 'G1', type: 'text', scope: 'course', required: false, label: '이 수업에서 도움이 되었고, 앞으로도 계속 유지되었으면 하는 점은 무엇입니까? (선택)', maxLen: 800 },
        { id: 'G2', type: 'text', scope: 'course', required: false, label: '이 수업에서 개선되었으면 하는 점은 무엇입니까? 개선이 가능하도록 구체적으로 적어 주십시오. (선택)', maxLen: 800 },
        { id: 'G3', type: 'text', scope: 'common', required: false, label: '학습 환경·행정·교육과정 등 학교(교육처)에 건의할 사항이 있으면 적어 주십시오. (선택)', maxLen: 1000 }
      ] }
    ]
  };

  window.SVY_TEMPLATE = {
    def: def,
    // 영역(평균 산출 단위)은 sections 의 척도 문항으로 자동 계산합니다.
    summary: '2026학년도 2학기 교육과정 개선 설문 조사(docx 기준): 5점 척도 17문항 + 복수선택 2 + 서술형 4, 성실응답 점검 2'
  };
})();
