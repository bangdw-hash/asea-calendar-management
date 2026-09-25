'use strict';
const DRAWING_DATA = {
  categories: [
    {
      id: 'vehicles', name: '탈것', icon: '🚗',
      images: [
        { id: 'car', name: '자동차', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="차체아래" stroke-width="5" d="M45,168 L355,168 L350,208 Q345,228 325,228 L75,228 Q55,228 50,208 Z"/>
<path class="cr" data-name="차체위" stroke-width="5" d="M82,168 L110,108 Q120,88 140,84 L260,84 Q280,88 290,108 L318,168 Z"/>
<path class="cr" data-name="뒷창문" stroke-width="3.5" d="M142,89 L208,89 L208,160 L114,160 L114,112 Z"/>
<path class="cr" data-name="앞창문" stroke-width="3.5" d="M214,89 L258,89 L283,112 L283,160 L214,160 Z"/>
<ellipse class="cr" data-name="헤드라이트" stroke-width="3" cx="348" cy="190" rx="13" ry="9"/>
<ellipse class="cr" data-name="테일라이트" stroke-width="3" cx="52" cy="190" rx="13" ry="9"/>
<rect class="cr" data-name="문손잡이" stroke-width="2.5" x="188" y="152" width="24" height="7" rx="3.5"/>
<circle class="cr" data-name="앞바퀴테두리" stroke-width="5" cx="288" cy="228" r="38"/>
<circle class="cr" data-name="앞바퀴허브" stroke-width="3" cx="288" cy="228" r="18"/>
<circle class="cr" data-name="뒷바퀴테두리" stroke-width="5" cx="112" cy="228" r="38"/>
<circle class="cr" data-name="뒷바퀴허브" stroke-width="3" cx="112" cy="228" r="18"/>
</g>` },
        { id: 'bus', name: '버스', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="차체" stroke-width="5" x="40" y="80" width="320" height="140" rx="14"/>
<rect class="cr" data-name="앞창문" stroke-width="3" x="295" y="98" width="48" height="50" rx="6"/>
<rect class="cr" data-name="창문1" stroke-width="3" x="55" y="98" width="48" height="50" rx="6"/>
<rect class="cr" data-name="창문2" stroke-width="3" x="113" y="98" width="48" height="50" rx="6"/>
<rect class="cr" data-name="창문3" stroke-width="3" x="171" y="98" width="48" height="50" rx="6"/>
<rect class="cr" data-name="창문4" stroke-width="3" x="229" y="98" width="48" height="50" rx="6"/>
<rect class="cr" data-name="출입문" stroke-width="3" x="58" y="158" width="52" height="62" rx="4"/>
<rect class="cr" data-name="행선지" stroke-width="3" x="120" y="82" width="160" height="26" rx="5"/>
<circle class="cr" data-name="앞바퀴테두리" stroke-width="5" cx="300" cy="234" r="36"/>
<circle class="cr" data-name="앞바퀴허브" stroke-width="3" cx="300" cy="234" r="17"/>
<circle class="cr" data-name="뒷바퀴테두리" stroke-width="5" cx="110" cy="234" r="36"/>
<circle class="cr" data-name="뒷바퀴허브" stroke-width="3" cx="110" cy="234" r="17"/>
<ellipse class="cr" data-name="헤드라이트" stroke-width="3" cx="352" cy="188" rx="12" ry="9"/>
</g>` },
        { id: 'fire_truck', name: '소방차', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="차체" stroke-width="5" x="40" y="120" width="320" height="90" rx="10"/>
<rect class="cr" data-name="운전석" stroke-width="5" x="280" y="85" width="80" height="125" rx="10"/>
<rect class="cr" data-name="창문" stroke-width="3" x="290" y="98" width="55" height="45" rx="6"/>
<rect class="cr" data-name="사이렌" stroke-width="3" x="150" y="108" width="100" height="20" rx="6"/>
<rect class="cr" data-name="사다리1" stroke-width="3" x="55" y="115" width="200" height="10" rx="3"/>
<rect class="cr" data-name="사다리2" stroke-width="3" x="55" y="125" width="200" height="10" rx="3"/>
<line class="cr" data-name="사다리가로1" stroke-width="2.5" x1="95" y1="115" x2="95" y2="135"/>
<line class="cr" data-name="사다리가로2" stroke-width="2.5" x1="135" y1="115" x2="135" y2="135"/>
<line class="cr" data-name="사다리가로3" stroke-width="2.5" x1="175" y1="115" x2="175" y2="135"/>
<line class="cr" data-name="사다리가로4" stroke-width="2.5" x1="215" y1="115" x2="215" y2="135"/>
<ellipse class="cr" data-name="헤드라이트" stroke-width="3" cx="352" cy="185" rx="13" ry="10"/>
<rect class="cr" data-name="호스릴" stroke-width="3" x="55" y="135" width="50" height="50" rx="25"/>
<circle class="cr" data-name="앞바퀴테두리" stroke-width="5" cx="300" cy="228" r="36"/>
<circle class="cr" data-name="앞바퀴허브" stroke-width="3" cx="300" cy="228" r="17"/>
<circle class="cr" data-name="뒷바퀴테두리" stroke-width="5" cx="108" cy="228" r="36"/>
<circle class="cr" data-name="뒷바퀴허브" stroke-width="3" cx="108" cy="228" r="17"/>
</g>` },
        { id: 'police_car', name: '경찰차', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="차체아래" stroke-width="5" d="M45,168 L355,168 L350,208 Q345,228 325,228 L75,228 Q55,228 50,208 Z"/>
<path class="cr" data-name="차체위" stroke-width="5" d="M82,168 L110,108 Q120,88 140,84 L260,84 Q280,88 290,108 L318,168 Z"/>
<path class="cr" data-name="뒷창문" stroke-width="3.5" d="M142,89 L208,89 L208,160 L114,160 L114,112 Z"/>
<path class="cr" data-name="앞창문" stroke-width="3.5" d="M214,89 L258,89 L283,112 L283,160 L214,160 Z"/>
<rect class="cr" data-name="경광등" stroke-width="3" x="170" y="76" width="60" height="16" rx="8"/>
<rect class="cr" data-name="도어스티커" stroke-width="2.5" x="90" y="170" width="220" height="22" rx="4"/>
<ellipse class="cr" data-name="헤드라이트" stroke-width="3" cx="348" cy="190" rx="13" ry="9"/>
<circle class="cr" data-name="앞바퀴테두리" stroke-width="5" cx="288" cy="228" r="38"/>
<circle class="cr" data-name="앞바퀴허브" stroke-width="3" cx="288" cy="228" r="18"/>
<circle class="cr" data-name="뒷바퀴테두리" stroke-width="5" cx="112" cy="228" r="38"/>
<circle class="cr" data-name="뒷바퀴허브" stroke-width="3" cx="112" cy="228" r="18"/>
</g>` },
        { id: 'airplane', name: '비행기', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="동체" stroke-width="5" cx="200" cy="150" rx="155" ry="42"/>
<path class="cr" data-name="왼쪽날개" stroke-width="4" d="M130,150 L70,230 L170,195 Z"/>
<path class="cr" data-name="오른쪽날개" stroke-width="4" d="M130,150 L70,70 L170,105 Z"/>
<path class="cr" data-name="꼬리날개위" stroke-width="4" d="M42,150 L42,100 L75,140 Z"/>
<path class="cr" data-name="꼬리날개아래" stroke-width="4" d="M42,150 L42,200 L75,160 Z"/>
<circle class="cr" data-name="창문1" stroke-width="3" cx="220" cy="145" r="16"/>
<circle class="cr" data-name="창문2" stroke-width="3" cx="260" cy="145" r="16"/>
<circle class="cr" data-name="창문3" stroke-width="3" cx="300" cy="145" r="16"/>
<ellipse class="cr" data-name="엔진" stroke-width="3" cx="155" cy="195" rx="25" ry="13"/>
<ellipse class="cr" data-name="조종석" stroke-width="3" cx="338" cy="148" rx="20" ry="14"/>
</g>` },
        { id: 'train', name: '기차', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="기관차" stroke-width="5" x="220" y="90" width="130" height="120" rx="12"/>
<rect class="cr" data-name="객차" stroke-width="5" x="45" y="100" width="160" height="110" rx="8"/>
<rect class="cr" data-name="굴뚝" stroke-width="4" x="305" y="70" width="24" height="28" rx="6"/>
<rect class="cr" data-name="기관창문" stroke-width="3" x="270" y="108" width="60" height="45" rx="6"/>
<rect class="cr" data-name="객차창문1" stroke-width="3" x="60" y="116" width="40" height="35" rx="5"/>
<rect class="cr" data-name="객차창문2" stroke-width="3" x="115" y="116" width="40" height="35" rx="5"/>
<rect class="cr" data-name="객차창문3" stroke-width="3" x="170" y="116" width="22" height="35" rx="5"/>
<line stroke-width="3" x1="205" y1="100" x2="220" y2="100"/>
<line stroke-width="3" x1="205" y1="210" x2="220" y2="210"/>
<circle class="cr" data-name="바퀴1" stroke-width="4" cx="80" cy="228" r="28"/>
<circle class="cr" data-name="바퀴2" stroke-width="4" cx="170" cy="228" r="28"/>
<circle class="cr" data-name="바퀴3" stroke-width="4" cx="260" cy="228" r="28"/>
<circle class="cr" data-name="바퀴4" stroke-width="4" cx="330" cy="228" r="28"/>
</g>` },
        { id: 'bicycle', name: '자전거', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="none">
<circle class="cr" data-name="앞바퀴" stroke-width="5" cx="295" cy="195" r="75" fill="#fafafa"/>
<circle class="cr" data-name="뒷바퀴" stroke-width="5" cx="105" cy="195" r="75" fill="#fafafa"/>
<circle stroke-width="3" cx="295" cy="195" r="12" fill="#fafafa"/>
<circle stroke-width="3" cx="105" cy="195" r="12" fill="#fafafa"/>
<path class="cr" data-name="프레임" stroke-width="5" d="M105,195 L200,120 L295,195 M200,120 L200,80" fill="none"/>
<path class="cr" data-name="안장" stroke-width="5" d="M170,80 L230,80" fill="none"/>
<path class="cr" data-name="핸들" stroke-width="5" d="M280,120 L310,120 Q320,120 320,110 L320,100" fill="none"/>
<line class="cr" data-name="페달크랭크" stroke-width="4" x1="200" y1="155" x2="220" y2="185"/>
<circle class="cr" data-name="페달" stroke-width="3" cx="200" cy="155" r="10" fill="#fafafa"/>
</g>` },
        { id: 'helicopter', name: '헬리콥터', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="동체" stroke-width="5" cx="190" cy="165" rx="110" ry="55"/>
<rect class="cr" data-name="꼬리" stroke-width="4" x="295" y="155" width="85" height="18" rx="6"/>
<path class="cr" data-name="꼬리날개" stroke-width="4" d="M360,148 L380,130 L380,173 Z"/>
<rect class="cr" data-name="로터기둥" stroke-width="4" x="178" y="95" width="24" height="35" rx="5"/>
<rect class="cr" data-name="메인로터" stroke-width="5" x="50" y="85" width="300" height="18" rx="9"/>
<ellipse class="cr" data-name="창문" stroke-width="3" cx="230" cy="158" rx="42" ry="32"/>
<line stroke-width="4" x1="130" y1="218" x2="100" y2="250"/>
<line stroke-width="4" x1="250" y1="218" x2="280" y2="250"/>
<rect class="cr" data-name="스키드좌" stroke-width="4" x="80" y="248" width="75" height="10" rx="5"/>
<rect class="cr" data-name="스키드우" stroke-width="4" x="245" y="248" width="75" height="10" rx="5"/>
</g>` },
        { id: 'bicycle', name: '자전거', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="앞바퀴" stroke-width="5" cx="295" cy="188" r="78"/>
<circle class="cr" data-name="뒷바퀴" stroke-width="5" cx="105" cy="188" r="78"/>
<circle stroke-width="3" cx="295" cy="188" r="18" fill="#fafafa"/>
<circle stroke-width="3" cx="105" cy="188" r="18" fill="#fafafa"/>
<path class="cr" data-name="프레임" stroke-width="6" d="M105,188 L168,112 L200,188 L105,188 Z"/>
<path class="cr" data-name="안장대" stroke-width="6" d="M168,112 L295,188"/>
<rect class="cr" data-name="안장" stroke-width="5" x="142" y="88" width="72" height="18" rx="9"/>
<path class="cr" data-name="핸들" stroke-width="5" d="M272,118 Q295,112 318,118 M295,112 L295,145"/>
<rect class="cr" data-name="페달" stroke-width="4" x="184" y="178" width="32" height="10" rx="5"/>
</g>` },
        { id: 'train', name: '기차', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="앞칸" stroke-width="5" x="42" y="105" width="148" height="110" rx="12"/>
<rect class="cr" data-name="뒷칸" stroke-width="4" x="198" y="118" width="118" height="97" rx="10"/>
<rect class="cr" data-name="앞창문" stroke-width="4" x="62" y="125" width="55" height="45" rx="8"/>
<rect class="cr" data-name="뒷창문" stroke-width="4" x="215" y="135" width="45" height="38" rx="6"/>
<circle class="cr" data-name="바퀴1" stroke-width="4" cx="82" cy="228" r="28"/>
<circle class="cr" data-name="바퀴2" stroke-width="4" cx="158" cy="228" r="28"/>
<circle class="cr" data-name="바퀴3" stroke-width="4" cx="248" cy="228" r="22"/>
<path class="cr" data-name="굴뚝" stroke-width="4" d="M145,105 L145,72 L175,72 L175,105 Z"/>
<ellipse class="cr" data-name="연기" stroke-width="3" cx="160" cy="55" rx="25" ry="15"/>
<line stroke-width="3" x1="42" y1="215" x2="360" y2="215"/>
</g>` },
        { id: 'bus', name: '버스', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="차체" stroke-width="5" x="35" y="72" width="330" height="168" rx="14"/>
<rect class="cr" data-name="창문1" stroke-width="4" x="55" y="95" width="65" height="55" rx="8"/>
<rect class="cr" data-name="창문2" stroke-width="4" x="135" y="95" width="65" height="55" rx="8"/>
<rect class="cr" data-name="창문3" stroke-width="4" x="215" y="95" width="65" height="55" rx="8"/>
<rect class="cr" data-name="창문4" stroke-width="4" x="295" y="95" width="58" height="55" rx="8"/>
<rect class="cr" data-name="문" stroke-width="4" x="55" y="165" width="55" height="75" rx="6"/>
<circle class="cr" data-name="앞바퀴" stroke-width="5" cx="115" cy="258" r="38"/>
<circle class="cr" data-name="뒷바퀴" stroke-width="5" cx="298" cy="258" r="38"/>
</g>` },
        { id: 'sailboat', name: '돛단배', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="배몸통" stroke-width="5" d="M65,215 Q75,268 200,275 Q325,268 335,215 Z"/>
<path class="cr" data-name="큰돛" stroke-width="4" d="M200,48 L200,215 L68,215 Z"/>
<path class="cr" data-name="작은돛" stroke-width="4" d="M200,72 L200,215 L332,215 Z"/>
<line stroke-width="4" x1="200" y1="38" x2="200" y2="225"/>
<path class="cr" data-name="삼각기" stroke-width="3" d="M200,38 L245,58 L200,72 Z"/>
<path class="cr" data-name="파도" stroke-width="3" d="M42,265 Q90,248 138,265 Q185,280 232,265 Q278,248 325,265 Q348,272 362,265" fill="none"/>
</g>` },
        { id: 'truck', name: '트럭', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="짐칸" stroke-width="5" x="38" y="85" width="218" height="148" rx="6"/>
<path class="cr" data-name="운전석" stroke-width="5" d="M255,128 L255,232 L362,232 L362,165 L320,128 Z"/>
<rect class="cr" data-name="창문" stroke-width="4" x="262" y="140" width="75" height="55" rx="6"/>
<circle class="cr" data-name="앞바퀴" stroke-width="5" cx="312" cy="255" r="35"/>
<circle class="cr" data-name="뒷바퀴1" stroke-width="5" cx="118" cy="255" r="35"/>
<circle class="cr" data-name="뒷바퀴2" stroke-width="4" cx="178" cy="255" r="30"/>
</g>` },
        { id: 'scooter', name: '킥보드', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="앞바퀴" stroke-width="5" cx="305" cy="232" r="48"/>
<circle class="cr" data-name="뒷바퀴" stroke-width="5" cx="95" cy="232" r="48"/>
<rect class="cr" data-name="발판" stroke-width="6" x="95" y="195" width="210" height="18" rx="9"/>
<rect class="cr" data-name="기둥" stroke-width="6" x="282" y="105" width="22" height="95" rx="8"/>
<rect class="cr" data-name="핸들바" stroke-width="5" x="248" y="98" width="90" height="16" rx="8"/>
<ellipse class="cr" data-name="발판무늬" stroke-width="3" cx="200" cy="195" rx="60" ry="6"/>
</g>` },
        { id: 'submarine', name: '잠수함', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="192" cy="185" rx="160" ry="75"/>
<rect class="cr" data-name="탑" stroke-width="4" x="155" y="112" width="80" height="55" rx="8"/>
<circle class="cr" data-name="창문1" stroke-width="4" cx="148" cy="185" r="28"/>
<circle class="cr" data-name="창문2" stroke-width="4" cx="228" cy="185" r="22"/>
<path class="cr" data-name="프로펠러" stroke-width="4" d="M352,162 Q372,148 370,185 Q388,200 352,210 Z"/>
<line stroke-width="4" x1="195" y1="95" x2="195" y2="112"/>
<ellipse class="cr" data-name="안테나볼" stroke-width="3" cx="195" cy="88" rx="10" ry="8"/>
</g>` },
        { id: 'balloon', name: '열기구', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="풍선상부" stroke-width="5" cx="200" cy="148" rx="130" ry="110"/>
<path class="cr" data-name="세로줄1" stroke-width="3" d="M200,38 Q170,95 160,258" fill="none"/>
<path class="cr" data-name="세로줄2" stroke-width="3" d="M200,38 Q230,95 240,258" fill="none"/>
<path class="cr" data-name="가로줄" stroke-width="3" d="M82,110 Q200,148 318,110" fill="none"/>
<rect class="cr" data-name="바구니" stroke-width="5" x="155" y="258" width="90" height="38" rx="8"/>
<line stroke-width="3" x1="160" y1="258" x2="125" y2="248"/>
<line stroke-width="3" x1="240" y1="258" x2="275" y2="248"/>
</g>` }
      ]
    },
    {
      id: 'animals', name: '동물', icon: '🐾',
      images: [
        { id: 'dog', name: '강아지', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="195" cy="185" rx="95" ry="70"/>
<circle class="cr" data-name="머리" stroke-width="5" cx="290" cy="130" r="60"/>
<ellipse class="cr" data-name="왼귀" stroke-width="4" cx="268" cy="78" rx="18" ry="30" transform="rotate(-20,268,78)"/>
<ellipse class="cr" data-name="오른귀" stroke-width="4" cx="318" cy="75" rx="18" ry="30" transform="rotate(15,318,75)"/>
<circle class="cr" data-name="눈1" stroke-width="3" cx="275" cy="120" r="10"/>
<circle class="cr" data-name="눈2" stroke-width="3" cx="308" cy="120" r="10"/>
<ellipse class="cr" data-name="코" stroke-width="3" cx="291" cy="143" rx="14" ry="10"/>
<path class="cr" data-name="입" stroke-width="3" d="M278,153 Q291,168 304,153" fill="none"/>
<rect class="cr" data-name="앞발1" stroke-width="4" x="100" y="230" width="35" height="50" rx="17"/>
<rect class="cr" data-name="앞발2" stroke-width="4" x="148" y="230" width="35" height="50" rx="17"/>
<rect class="cr" data-name="뒷발1" stroke-width="4" x="220" y="235" width="35" height="45" rx="17"/>
<rect class="cr" data-name="뒷발2" stroke-width="4" x="268" y="235" width="35" height="45" rx="17"/>
<path class="cr" data-name="꼬리" stroke-width="5" d="M108,165 Q60,130 55,85 Q50,60 75,65" fill="none"/>
</g>` },
        { id: 'cat', name: '고양이', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="190" cy="190" rx="90" ry="72"/>
<circle class="cr" data-name="머리" stroke-width="5" cx="285" cy="128" r="58"/>
<polygon class="cr" data-name="왼귀" stroke-width="4" points="258,82 270,52 292,80"/>
<polygon class="cr" data-name="오른귀" stroke-width="4" points="300,80 318,52 330,82"/>
<circle class="cr" data-name="눈1" stroke-width="3" cx="270" cy="122" r="12"/>
<circle class="cr" data-name="눈2" stroke-width="3" cx="302" cy="122" r="12"/>
<ellipse class="cr" data-name="코" stroke-width="3" cx="286" cy="142" rx="9" ry="7"/>
<path data-name="수염1" stroke-width="2" d="M270,142 L230,135" fill="none" stroke="#1a1a1a"/>
<path data-name="수염2" stroke-width="2" d="M270,148 L230,152" fill="none" stroke="#1a1a1a"/>
<path data-name="수염3" stroke-width="2" d="M302,142 L342,135" fill="none" stroke="#1a1a1a"/>
<path data-name="수염4" stroke-width="2" d="M302,148 L342,152" fill="none" stroke="#1a1a1a"/>
<rect class="cr" data-name="앞발1" stroke-width="4" x="108" y="232" width="33" height="46" rx="16"/>
<rect class="cr" data-name="앞발2" stroke-width="4" x="154" y="232" width="33" height="46" rx="16"/>
<rect class="cr" data-name="뒷발1" stroke-width="4" x="220" y="236" width="33" height="42" rx="16"/>
<rect class="cr" data-name="뒷발2" stroke-width="4" x="262" y="236" width="33" height="42" rx="16"/>
<path class="cr" data-name="꼬리" stroke-width="5" d="M110,162 Q50,140 45,90 Q42,65 70,72" fill="none"/>
</g>` },
        { id: 'rabbit', name: '토끼', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="200" cy="195" rx="80" ry="78"/>
<circle class="cr" data-name="머리" stroke-width="5" cx="200" cy="115" r="55"/>
<ellipse class="cr" data-name="왼귀" stroke-width="4" cx="172" cy="52" rx="20" ry="48"/>
<ellipse class="cr" data-name="오른귀" stroke-width="4" cx="228" cy="52" rx="20" ry="48"/>
<ellipse class="cr" data-name="귀속1" stroke-width="3" cx="172" cy="52" rx="10" ry="36"/>
<ellipse class="cr" data-name="귀속2" stroke-width="3" cx="228" cy="52" rx="10" ry="36"/>
<circle class="cr" data-name="눈1" stroke-width="3" cx="183" cy="110" r="11"/>
<circle class="cr" data-name="눈2" stroke-width="3" cx="217" cy="110" r="11"/>
<ellipse class="cr" data-name="코" stroke-width="3" cx="200" cy="130" rx="9" ry="7"/>
<ellipse class="cr" data-name="꼬리" stroke-width="3" cx="270" cy="210" r="18"/>
<rect class="cr" data-name="앞발1" stroke-width="4" x="128" y="248" width="38" height="48" rx="19"/>
<rect class="cr" data-name="앞발2" stroke-width="4" x="234" y="248" width="38" height="48" rx="19"/>
</g>` },
        { id: 'elephant', name: '코끼리', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="195" cy="182" rx="115" ry="88"/>
<circle class="cr" data-name="머리" stroke-width="5" cx="310" cy="135" r="68"/>
<ellipse class="cr" data-name="오른귀" stroke-width="4" cx="356" cy="132" rx="35" ry="50"/>
<path class="cr" data-name="코" stroke-width="5" d="M290,170 Q250,200 255,240 Q258,265 275,260" fill="none"/>
<circle class="cr" data-name="눈" stroke-width="3" cx="325" cy="120" r="12"/>
<rect class="cr" data-name="다리1" stroke-width="4" x="95" y="248" width="42" height="55" rx="12"/>
<rect class="cr" data-name="다리2" stroke-width="4" x="152" y="248" width="42" height="55" rx="12"/>
<rect class="cr" data-name="다리3" stroke-width="4" x="215" y="248" width="42" height="55" rx="12"/>
<rect class="cr" data-name="다리4" stroke-width="4" x="272" y="248" width="42" height="55" rx="12"/>
<path class="cr" data-name="꼬리" stroke-width="4" d="M92,155 Q65,150 55,170" fill="none"/>
</g>` },
        { id: 'penguin', name: '펭귄', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="200" cy="185" rx="80" ry="100"/>
<circle class="cr" data-name="머리" stroke-width="5" cx="200" cy="95" r="55"/>
<ellipse class="cr" data-name="배" stroke-width="3" cx="200" cy="200" rx="48" ry="72"/>
<ellipse class="cr" data-name="얼굴" stroke-width="3" cx="200" cy="100" rx="34" ry="38"/>
<circle class="cr" data-name="눈1" stroke-width="3" cx="185" cy="88" r="10"/>
<circle class="cr" data-name="눈2" stroke-width="3" cx="215" cy="88" r="10"/>
<polygon class="cr" data-name="부리" stroke-width="3" points="192,108 208,108 200,122"/>
<path class="cr" data-name="왼날개" stroke-width="4" d="M125,148 Q90,175 95,225 L125,220 Z"/>
<path class="cr" data-name="오른날개" stroke-width="4" d="M275,148 Q310,175 305,225 L275,220 Z"/>
<ellipse class="cr" data-name="왼발" stroke-width="4" cx="168" cy="278" rx="28" ry="12"/>
<ellipse class="cr" data-name="오른발" stroke-width="4" cx="232" cy="278" rx="28" ry="12"/>
</g>` },
        { id: 'duck', name: '오리', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="185" cy="188" rx="115" ry="80"/>
<circle class="cr" data-name="머리" stroke-width="5" cx="310" cy="130" r="52"/>
<ellipse class="cr" data-name="부리" stroke-width="4" cx="355" cy="132" rx="30" ry="14"/>
<circle class="cr" data-name="눈" stroke-width="3" cx="322" cy="118" r="11"/>
<path class="cr" data-name="날개" stroke-width="4" d="M130,175 Q100,155 95,200 Q130,235 185,240" fill="none"/>
<ellipse class="cr" data-name="꼬리" stroke-width="4" cx="78" cy="180" rx="30" ry="20"/>
<ellipse class="cr" data-name="왼발" stroke-width="4" cx="158" cy="265" rx="32" ry="13"/>
<ellipse class="cr" data-name="오른발" stroke-width="4" cx="218" cy="265" rx="32" ry="13"/>
</g>` },
        { id: 'lion', name: '사자', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="갈기" stroke-width="5" cx="200" cy="150" r="88"/>
<circle class="cr" data-name="머리" stroke-width="4" cx="200" cy="150" r="60"/>
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="200" cy="235" rx="72" ry="55"/>
<circle class="cr" data-name="눈1" stroke-width="3" cx="180" cy="138" r="11"/>
<circle class="cr" data-name="눈2" stroke-width="3" cx="220" cy="138" r="11"/>
<ellipse class="cr" data-name="코" stroke-width="3" cx="200" cy="158" rx="13" ry="9"/>
<polygon class="cr" data-name="왼귀" stroke-width="3" points="162,100 155,72 180,92"/>
<polygon class="cr" data-name="오른귀" stroke-width="3" points="238,100 245,72 220,92"/>
<rect class="cr" data-name="앞발1" stroke-width="4" x="143" y="270" width="38" height="40" rx="14"/>
<rect class="cr" data-name="앞발2" stroke-width="4" x="219" y="270" width="38" height="40" rx="14"/>
<path class="cr" data-name="꼬리" stroke-width="5" d="M272,235 Q320,210 330,180 Q340,150 320,145" fill="none"/>
</g>` },
        { id: 'butterfly', name: '나비', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="왼위날개" stroke-width="4" cx="148" cy="128" rx="88" ry="70"/>
<ellipse class="cr" data-name="오른위날개" stroke-width="4" cx="252" cy="128" rx="88" ry="70"/>
<ellipse class="cr" data-name="왼아래날개" stroke-width="4" cx="148" cy="205" rx="62" ry="52"/>
<ellipse class="cr" data-name="오른아래날개" stroke-width="4" cx="252" cy="205" rx="62" ry="52"/>
<ellipse class="cr" data-name="왼위무늬" stroke-width="3" cx="148" cy="125" rx="42" ry="32"/>
<ellipse class="cr" data-name="오른위무늬" stroke-width="3" cx="252" cy="125" rx="42" ry="32"/>
<ellipse class="cr" data-name="몸통" stroke-width="4" cx="200" cy="165" rx="12" ry="70"/>
<path stroke-width="3" d="M200,100 Q185,72 170,60" fill="none"/>
<path stroke-width="3" d="M200,100 Q215,72 230,60" fill="none"/>
</g>` },
        { id: 'horse', name: '말', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="200" cy="188" rx="120" ry="75"/>
<ellipse class="cr" data-name="머리" stroke-width="5" cx="320" cy="128" rx="55" ry="48"/>
<rect class="cr" data-name="주둥이" stroke-width="4" x="352" y="128" width="35" height="28" rx="8"/>
<rect class="cr" data-name="앞왼다리" stroke-width="5" x="128" y="252" width="32" height="85" rx="10"/>
<rect class="cr" data-name="앞오른다리" stroke-width="5" x="178" y="252" width="32" height="85" rx="10"/>
<rect class="cr" data-name="뒷왼다리" stroke-width="5" x="228" y="252" width="32" height="85" rx="10"/>
<rect class="cr" data-name="뒷오른다리" stroke-width="5" x="278" y="252" width="32" height="85" rx="10"/>
<path class="cr" data-name="갈기" stroke-width="4" d="M288,82 Q305,60 325,55 Q345,60 355,82" fill="none"/>
<path class="cr" data-name="꼬리" stroke-width="5" d="M82,180 Q45,165 38,215 Q42,245 62,235" fill="none"/>
</g>` },
        { id: 'giraffe', name: '기린', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="200" cy="222" rx="88" ry="65"/>
<rect class="cr" data-name="목" stroke-width="5" x="245" y="72" width="48" height="152" rx="20"/>
<ellipse class="cr" data-name="머리" stroke-width="5" cx="295" cy="58" rx="42" ry="32"/>
<rect class="cr" data-name="왼앞다리" stroke-width="5" x="148" y="275" width="30" height="75" rx="8"/>
<rect class="cr" data-name="오른앞다리" stroke-width="5" x="195" y="275" width="30" height="75" rx="8"/>
<rect class="cr" data-name="왼뒷다리" stroke-width="4" x="232" y="275" width="28" height="75" rx="8"/>
<rect class="cr" data-name="오른뒷다리" stroke-width="4" x="272" y="275" width="28" height="75" rx="8"/>
<ellipse class="cr" data-name="무늬1" stroke-width="2" cx="185" cy="210" rx="22" ry="18"/>
<ellipse class="cr" data-name="무늬2" stroke-width="2" cx="225" cy="235" rx="18" ry="15"/>
<ellipse class="cr" data-name="무늬3" stroke-width="2" cx="263" cy="120" rx="14" ry="18"/>
</g>` },
        { id: 'monkey', name: '원숭이', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="머리" stroke-width="5" cx="200" cy="108" r="72"/>
<ellipse class="cr" data-name="얼굴판" stroke-width="3" cx="200" cy="115" rx="45" ry="38"/>
<ellipse class="cr" data-name="왼귀" stroke-width="4" cx="128" cy="102" rx="22" ry="22"/>
<ellipse class="cr" data-name="오른귀" stroke-width="4" cx="272" cy="102" rx="22" ry="22"/>
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="200" cy="222" rx="65" ry="58"/>
<path class="cr" data-name="왼팔" stroke-width="5" d="M140,195 Q88,218 72,258 Q88,268 95,255 Q108,228 148,215"/>
<path class="cr" data-name="오른팔" stroke-width="5" d="M260,195 Q312,218 328,258 Q312,268 305,255 Q292,228 252,215"/>
<path class="cr" data-name="꼬리" stroke-width="5" d="M200,275 Q175,295 188,315 Q210,325 218,305" fill="none"/>
</g>` },
        { id: 'frog', name: '개구리', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="200" cy="205" rx="108" ry="80"/>
<ellipse class="cr" data-name="머리" stroke-width="5" cx="200" cy="132" rx="88" ry="62"/>
<circle class="cr" data-name="왼눈" stroke-width="4" cx="148" cy="98" r="28"/>
<circle class="cr" data-name="오른눈" stroke-width="4" cx="252" cy="98" r="28"/>
<path class="cr" data-name="왼뒷다리" stroke-width="5" d="M100,260 Q62,278 42,265 Q38,248 58,245 Q82,258 108,245"/>
<path class="cr" data-name="오른뒷다리" stroke-width="5" d="M300,260 Q338,278 358,265 Q362,248 342,245 Q318,258 292,245"/>
<path stroke-width="3" d="M158,148 Q200,165 242,148" fill="none"/>
</g>` },
        { id: 'owl', name: '부엉이', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="200" cy="195" rx="85" ry="95"/>
<circle class="cr" data-name="왼눈" stroke-width="4" cx="168" cy="140" r="35"/>
<circle class="cr" data-name="오른눈" stroke-width="4" cx="232" cy="140" r="35"/>
<circle stroke-width="3" cx="168" cy="140" r="18" fill="#fafafa"/>
<circle stroke-width="3" cx="232" cy="140" r="18" fill="#fafafa"/>
<path class="cr" data-name="부리" stroke-width="3" d="M190,162 L200,178 L210,162 Z"/>
<path class="cr" data-name="왼날개" stroke-width="4" d="M118,195 Q72,215 65,258 Q95,270 118,248"/>
<path class="cr" data-name="오른날개" stroke-width="4" d="M282,195 Q328,215 335,258 Q305,270 282,248"/>
<polygon class="cr" data-name="왼귀" stroke-width="4" points="162,108 150,72 185,100"/>
<polygon class="cr" data-name="오른귀" stroke-width="4" points="238,108 250,72 215,100"/>
</g>` },
        { id: 'tiger', name: '호랑이', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="200" cy="210" rx="110" ry="78"/>
<circle class="cr" data-name="머리" stroke-width="5" cx="200" cy="112" r="75"/>
<ellipse class="cr" data-name="주둥이" stroke-width="3" cx="200" cy="128" rx="35" ry="28"/>
<polygon class="cr" data-name="왼귀" stroke-width="4" points="148,65 132,35 175,62"/>
<polygon class="cr" data-name="오른귀" stroke-width="4" points="252,65 268,35 225,62"/>
<rect class="cr" data-name="줄무늬1" stroke-width="3" x="148" y="88" width="18" height="32" rx="6"/>
<rect class="cr" data-name="줄무늬2" stroke-width="3" x="234" y="88" width="18" height="32" rx="6"/>
<rect class="cr" data-name="앞왼다리" stroke-width="5" x="128" y="275" width="38" height="72" rx="12"/>
<rect class="cr" data-name="앞오른다리" stroke-width="5" x="234" y="275" width="38" height="72" rx="12"/>
</g>` },
        { id: 'panda', name: '판다', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="머리" stroke-width="5" cx="200" cy="112" r="78"/>
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="200" cy="238" rx="88" ry="78"/>
<ellipse class="cr" data-name="왼눈반점" stroke-width="4" cx="165" cy="98" rx="28" ry="22"/>
<ellipse class="cr" data-name="오른눈반점" stroke-width="4" cx="235" cy="98" rx="28" ry="22"/>
<circle stroke-width="3" cx="165" cy="98" r="10" fill="#fafafa"/>
<circle stroke-width="3" cx="235" cy="98" r="10" fill="#fafafa"/>
<ellipse class="cr" data-name="왼귀" stroke-width="4" cx="148" cy="58" rx="25" ry="22"/>
<ellipse class="cr" data-name="오른귀" stroke-width="4" cx="252" cy="58" rx="25" ry="22"/>
<ellipse class="cr" data-name="왼발" stroke-width="4" cx="148" cy="295" rx="38" ry="22"/>
<ellipse class="cr" data-name="오른발" stroke-width="4" cx="252" cy="295" rx="38" ry="22"/>
</g>` },
        { id: 'shark', name: '상어', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="185" cy="185" rx="148" ry="65"/>
<path class="cr" data-name="꼬리" stroke-width="5" d="M338,185 L372,145 L385,185 L372,225 Z"/>
<path class="cr" data-name="등지느러미" stroke-width="4" d="M175,122 L215,72 L245,122 Z"/>
<path class="cr" data-name="배지느러미" stroke-width="4" d="M165,248 L185,278 L218,248 Z"/>
<ellipse class="cr" data-name="배" stroke-width="3" cx="172" cy="195" rx="82" ry="38"/>
<circle stroke-width="3" cx="60" cy="175" r="12" fill="#fafafa"/>
<path stroke-width="3" d="M55,198 Q65,208 78,198 Q88,208 95,198" fill="none"/>
</g>` }
      ]
    },
    {
      id: 'buildings', name: '건물', icon: '🏠',
      images: [
        { id: 'house', name: '집', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="벽" stroke-width="5" x="60" y="148" width="280" height="145" rx="5"/>
<polygon class="cr" data-name="지붕" stroke-width="5" points="45,155 200,52 355,155"/>
<rect class="cr" data-name="문" stroke-width="4" x="163" y="220" width="74" height="73" rx="6"/>
<rect class="cr" data-name="왼창문" stroke-width="4" x="80" y="175" width="65" height="58" rx="6"/>
<rect class="cr" data-name="오른창문" stroke-width="4" x="255" y="175" width="65" height="58" rx="6"/>
<line stroke-width="2.5" x1="80" y1="204" x2="145" y2="204"/>
<line stroke-width="2.5" x1="112" y1="175" x2="112" y2="233"/>
<line stroke-width="2.5" x1="255" y1="204" x2="320" y2="204"/>
<line stroke-width="2.5" x1="287" y1="175" x2="287" y2="233"/>
<circle stroke-width="3" cx="228" cy="259" r="6" fill="#fafafa"/>
<rect class="cr" data-name="굴뚝" stroke-width="4" x="258" y="65" width="35" height="60" rx="4"/>
</g>` },
        { id: 'castle', name: '성', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="본관" stroke-width="5" x="90" y="140" width="220" height="150"/>
<rect class="cr" data-name="왼탑" stroke-width="5" x="42" y="108" width="72" height="182"/>
<rect class="cr" data-name="오른탑" stroke-width="5" x="286" y="108" width="72" height="182"/>
<rect class="cr" data-name="왼탑흉벽1" stroke-width="4" x="42" y="90" width="18" height="25"/>
<rect class="cr" data-name="왼탑흉벽2" stroke-width="4" x="70" y="90" width="18" height="25"/>
<rect class="cr" data-name="오른탑흉벽1" stroke-width="4" x="286" y="90" width="18" height="25"/>
<rect class="cr" data-name="오른탑흉벽2" stroke-width="4" x="314" y="90" width="18" height="25"/>
<rect class="cr" data-name="본관흉벽1" stroke-width="4" x="105" y="122" width="20" height="24"/>
<rect class="cr" data-name="본관흉벽2" stroke-width="4" x="140" y="122" width="20" height="24"/>
<rect class="cr" data-name="본관흉벽3" stroke-width="4" x="240" y="122" width="20" height="24"/>
<rect class="cr" data-name="본관흉벽4" stroke-width="4" x="275" y="122" width="20" height="24"/>
<path class="cr" data-name="정문" stroke-width="4" d="M163,290 L163,218 Q163,195 200,195 Q237,195 237,218 L237,290 Z"/>
<rect class="cr" data-name="왼창문" stroke-width="3" x="105" y="165" width="42" height="40" rx="4"/>
<rect class="cr" data-name="오른창문" stroke-width="3" x="253" y="165" width="42" height="40" rx="4"/>
</g>` },
        { id: 'school', name: '학교', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="건물" stroke-width="5" x="40" y="120" width="320" height="170"/>
<rect class="cr" data-name="지붕" stroke-width="4" x="30" y="105" width="340" height="25" rx="4"/>
<rect class="cr" data-name="문" stroke-width="4" x="165" y="220" width="70" height="70" rx="5"/>
<rect class="cr" data-name="창문1" stroke-width="3" x="58" y="140" width="55" height="50" rx="5"/>
<rect class="cr" data-name="창문2" stroke-width="3" x="128" y="140" width="55" height="50" rx="5"/>
<rect class="cr" data-name="창문3" stroke-width="3" x="257" y="140" width="55" height="50" rx="5"/>
<rect class="cr" data-name="창문4" stroke-width="3" x="287" y="140" width="55" height="50" rx="5"/>
<rect class="cr" data-name="국기대" stroke-width="4" x="196" y="55" width="8" height="55"/>
<path class="cr" data-name="국기" stroke-width="3" d="M204,58 L242,68 L204,78 Z"/>
<rect class="cr" data-name="간판" stroke-width="3" x="110" y="198" width="180" height="22" rx="5"/>
</g>` },
        { id: 'lighthouse', name: '등대', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="탑" stroke-width="5" d="M155,275 L172,125 L228,125 L245,275 Z"/>
<rect class="cr" data-name="등실" stroke-width="5" x="155" y="95" width="90" height="40" rx="5"/>
<rect class="cr" data-name="등불" stroke-width="4" x="168" y="58" width="64" height="42" rx="6"/>
<rect class="cr" data-name="지붕" stroke-width="4" x="148" y="45" width="104" height="18" rx="5"/>
<rect class="cr" data-name="줄무늬1" stroke-width="3" x="158" y="165" width="84" height="25"/>
<rect class="cr" data-name="줄무늬2" stroke-width="3" x="161" y="215" width="78" height="25"/>
<rect class="cr" data-name="문" stroke-width="4" x="181" y="230" width="38" height="45" rx="4"/>
<rect class="cr" data-name="받침" stroke-width="5" x="128" y="270" width="144" height="18" rx="5"/>
</g>` },
        { id: 'hospital', name: '병원', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="건물" stroke-width="5" x="40" y="100" width="320" height="190"/>
<rect class="cr" data-name="지붕" stroke-width="4" x="30" y="85" width="340" height="22" rx="4"/>
<rect class="cr" data-name="문" stroke-width="4" x="163" y="218" width="74" height="72" rx="5"/>
<rect class="cr" data-name="창문1" stroke-width="3" x="58" y="118" width="52" height="48" rx="5"/>
<rect class="cr" data-name="창문2" stroke-width="3" x="126" y="118" width="52" height="48" rx="5"/>
<rect class="cr" data-name="창문3" stroke-width="3" x="270" y="118" width="52" height="48" rx="5"/>
<rect class="cr" data-name="창문4" stroke-width="3" x="290" y="118" width="52" height="48" rx="5"/>
<rect class="cr" data-name="창문5" stroke-width="3" x="58" y="182" width="52" height="48" rx="5"/>
<rect class="cr" data-name="창문6" stroke-width="3" x="290" y="182" width="52" height="48" rx="5"/>
<rect class="cr" data-name="십자세로" stroke-width="6" x="191" y="38" width="18" height="52"/>
<rect class="cr" data-name="십자가로" stroke-width="6" x="174" y="55" width="52" height="18"/>
</g>` },
        { id: 'store', name: '가게', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="건물" stroke-width="5" x="60" y="130" width="280" height="165"/>
<path class="cr" data-name="차양" stroke-width="5" d="M40,130 L360,130 L340,100 L60,100 Z"/>
<rect class="cr" data-name="쇼윈도우" stroke-width="4" x="75" y="148" width="250" height="90" rx="5"/>
<rect class="cr" data-name="문" stroke-width="4" x="163" y="228" width="74" height="67" rx="5"/>
<rect class="cr" data-name="간판" stroke-width="4" x="95" y="42" width="210" height="45" rx="8"/>
<line stroke-width="3" x1="130" y1="100" x2="130" y2="130"/>
<line stroke-width="3" x1="200" y1="100" x2="200" y2="130"/>
<line stroke-width="3" x1="270" y1="100" x2="270" y2="130"/>
</g>` },
        { id: 'school', name: '학교', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="건물본관" stroke-width="5" x="55" y="120" width="290" height="175"/>
<rect class="cr" data-name="탑" stroke-width="4" x="158" y="58" width="84" height="68"/>
<polygon class="cr" data-name="지붕" stroke-width="4" points="148,65 200,30 252,65"/>
<rect class="cr" data-name="문" stroke-width="4" x="168" y="228" width="64" height="68" rx="4"/>
<rect class="cr" data-name="창문1" stroke-width="3" x="72" y="148" width="55" height="48" rx="4"/>
<rect class="cr" data-name="창문2" stroke-width="3" x="152" y="148" width="55" height="48" rx="4"/>
<rect class="cr" data-name="창문3" stroke-width="3" x="273" y="148" width="55" height="48" rx="4"/>
<rect class="cr" data-name="국기대" stroke-width="3" x="197" y="30" width="6" height="30"/>
</g>` },
        { id: 'hospital', name: '병원', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="건물" stroke-width="5" x="48" y="88" width="304" height="208"/>
<rect class="cr" data-name="지붕부" stroke-width="4" x="68" y="68" width="264" height="28" rx="4"/>
<rect class="cr" data-name="큰창문1" stroke-width="4" x="68" y="115" width="80" height="72" rx="6"/>
<rect class="cr" data-name="큰창문2" stroke-width="4" x="260" y="115" width="80" height="72" rx="6"/>
<rect class="cr" data-name="문" stroke-width="4" x="155" y="228" width="90" height="68" rx="4"/>
<rect class="cr" data-name="십자세로" stroke-width="6" x="190" y="42" width="20" height="52"/>
<rect class="cr" data-name="십자가로" stroke-width="6" x="170" y="60" width="60" height="18"/>
</g>` },
        { id: 'castle', name: '성', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="중앙탑" stroke-width="5" x="148" y="72" width="104" height="225"/>
<rect class="cr" data-name="왼탑" stroke-width="4" x="52" y="118" width="80" height="178"/>
<rect class="cr" data-name="오른탑" stroke-width="4" x="268" y="118" width="80" height="178"/>
<rect class="cr" data-name="중탑흉벽1" stroke-width="3" x="148" y="58" width="25" height="22"/>
<rect class="cr" data-name="중탑흉벽2" stroke-width="3" x="188" y="58" width="25" height="22"/>
<rect class="cr" data-name="중탑흉벽3" stroke-width="3" x="228" y="58" width="25" height="22"/>
<rect class="cr" data-name="왼창문" stroke-width="3" x="75" y="148" width="38" height="45" rx="18"/>
<rect class="cr" data-name="오른창문" stroke-width="3" x="287" y="148" width="38" height="45" rx="18"/>
<rect class="cr" data-name="문" stroke-width="4" x="170" y="225" width="60" height="72" rx="28"/>
<rect class="cr" data-name="중앙창문" stroke-width="3" x="178" y="115" width="44" height="52" rx="20"/>
</g>` },
        { id: 'lighthouse', name: '등대', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="탑" stroke-width="5" d="M155,295 L172,88 L228,88 L245,295 Z"/>
<rect class="cr" data-name="등불실" stroke-width="5" x="155" y="62" width="90" height="38" rx="8"/>
<circle class="cr" data-name="등불" stroke-width="4" cx="200" cy="78" r="18"/>
<polygon class="cr" data-name="지붕" stroke-width="4" points="148,62 200,28 252,62"/>
<path class="cr" data-name="줄무늬1" stroke-width="3" d="M158,155 L242,155 L238,175 L162,175 Z"/>
<path class="cr" data-name="줄무늬2" stroke-width="3" d="M162,218 L238,218 L234,238 L166,238 Z"/>
<rect class="cr" data-name="문" stroke-width="4" x="180" y="248" width="40" height="47" rx="18"/>
<path class="cr" data-name="파도" stroke-width="3" d="M42,282 Q90,265 138,282 Q185,298 232,282 Q278,265 355,282" fill="none"/>
</g>` },
        { id: 'library', name: '도서관', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="건물" stroke-width="5" x="42" y="112" width="316" height="183"/>
<polygon class="cr" data-name="지붕삼각" stroke-width="4" points="32,118 200,45 368,118"/>
<rect class="cr" data-name="기둥1" stroke-width="4" x="78" y="158" width="22" height="136"/>
<rect class="cr" data-name="기둥2" stroke-width="4" x="188" y="158" width="22" height="136"/>
<rect class="cr" data-name="기둥3" stroke-width="4" x="300" y="158" width="22" height="136"/>
<rect class="cr" data-name="문" stroke-width="4" x="165" y="232" width="70" height="62" rx="5"/>
<rect class="cr" data-name="현판" stroke-width="3" x="130" y="72" width="140" height="30" rx="4"/>
</g>` }
      ]
    },
    {
      id: 'food', name: '음식', icon: '🍎',
      images: [
        { id: 'pizza', name: '피자', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="피자반죽" stroke-width="5" cx="200" cy="165" r="128"/>
<circle class="cr" data-name="피자소스" stroke-width="4" cx="200" cy="165" r="105"/>
<line stroke-width="3" x1="200" y1="37" x2="200" y2="293"/>
<line stroke-width="3" x1="90" y1="70" x2="310" y2="260"/>
<line stroke-width="3" x1="310" y1="70" x2="90" y2="260"/>
<circle class="cr" data-name="토핑1" stroke-width="3" cx="200" cy="125" r="16"/>
<circle class="cr" data-name="토핑2" stroke-width="3" cx="155" cy="165" r="16"/>
<circle class="cr" data-name="토핑3" stroke-width="3" cx="245" cy="165" r="16"/>
<circle class="cr" data-name="토핑4" stroke-width="3" cx="175" cy="210" r="16"/>
<circle class="cr" data-name="토핑5" stroke-width="3" cx="225" cy="210" r="16"/>
</g>` },
        { id: 'hamburger', name: '햄버거', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="윗빵" stroke-width="5" d="M70,130 Q70,62 200,62 Q330,62 330,130 L330,145 L70,145 Z"/>
<rect class="cr" data-name="양상추" stroke-width="4" x="58" y="145" width="284" height="22" rx="5"/>
<rect class="cr" data-name="패티" stroke-width="5" x="65" y="167" width="270" height="32" rx="8"/>
<rect class="cr" data-name="치즈" stroke-width="4" x="58" y="199" width="284" height="18" rx="4"/>
<rect class="cr" data-name="토마토" stroke-width="4" x="65" y="217" width="270" height="18" rx="4"/>
<path class="cr" data-name="아랫빵" stroke-width="5" d="M70,235 L330,235 Q330,280 200,280 Q70,280 70,235 Z"/>
</g>` },
        { id: 'ice_cream', name: '아이스크림', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="콘" stroke-width="5" d="M145,195 L200,290 L255,195 Z"/>
<path class="cr" data-name="무늬" stroke-width="2.5" d="M162,195 L200,268 M178,195 L200,248 M210,195 L200,248 M228,195 L200,268" fill="none"/>
<circle class="cr" data-name="스쿱3" stroke-width="4" cx="200" cy="162" r="52"/>
<circle class="cr" data-name="스쿱2" stroke-width="4" cx="165" cy="140" r="45"/>
<circle class="cr" data-name="스쿱1" stroke-width="4" cx="235" cy="140" r="45"/>
<circle class="cr" data-name="체리" stroke-width="3" cx="200" cy="95" r="16"/>
<path stroke-width="3" d="M200,79 Q215,55 230,50" fill="none"/>
</g>` },
        { id: 'cake', name: '케이크', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="케이크아래" stroke-width="5" x="58" y="185" width="284" height="100" rx="10"/>
<rect class="cr" data-name="케이크위" stroke-width="5" x="80" y="128" width="240" height="65" rx="8"/>
<path class="cr" data-name="크림장식" stroke-width="4" d="M58,185 Q75,165 95,185 Q115,165 135,185 Q155,165 175,185 Q195,165 215,185 Q235,165 255,185 Q275,165 295,185 Q315,165 335,185 Q345,178 342,185"/>
<rect class="cr" data-name="초1" stroke-width="3" x="138" y="100" width="12" height="35" rx="4"/>
<rect class="cr" data-name="초2" stroke-width="3" x="168" y="100" width="12" height="35" rx="4"/>
<rect class="cr" data-name="초3" stroke-width="3" x="220" y="100" width="12" height="35" rx="4"/>
<ellipse class="cr" data-name="불꽃1" stroke-width="3" cx="144" cy="97" rx="8" ry="11"/>
<ellipse class="cr" data-name="불꽃2" stroke-width="3" cx="174" cy="97" rx="8" ry="11"/>
<ellipse class="cr" data-name="불꽃3" stroke-width="3" cx="226" cy="97" rx="8" ry="11"/>
<rect class="cr" data-name="줄무늬1" stroke-width="3" x="58" y="220" width="284" height="18"/>
</g>` },
        { id: 'apple', name: '사과', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="사과몸통" stroke-width="5" d="M200,96 Q285,88 320,162 Q355,238 310,272 Q275,295 240,282 Q220,274 200,278 Q180,274 160,282 Q125,295 90,272 Q45,238 80,162 Q115,88 200,96 Z"/>
<path class="cr" data-name="줄기" stroke-width="5" d="M200,96 L200,60" fill="none"/>
<path class="cr" data-name="잎" stroke-width="4" d="M200,72 Q228,48 248,58 Q240,80 200,78 Z"/>
<path class="cr" data-name="하이라이트" stroke-width="3" d="M130,130 Q118,158 125,180" fill="none"/>
</g>` },
        { id: 'watermelon', name: '수박', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="수박겉" stroke-width="5" d="M80,200 Q80,52 200,52 Q320,52 320,200 Z"/>
<path class="cr" data-name="수박속" stroke-width="4" d="M95,200 Q95,70 200,70 Q305,70 305,200 Z"/>
<path class="cr" data-name="껍질띠" stroke-width="3" d="M80,200 Q80,52 200,52 Q320,52 320,200 M100,200 Q100,68 200,68 Q300,68 300,200"/>
<ellipse class="cr" data-name="씨1" stroke-width="3" cx="168" cy="145" rx="9" ry="14" transform="rotate(-20,168,145)"/>
<ellipse class="cr" data-name="씨2" stroke-width="3" cx="200" cy="128" rx="9" ry="14"/>
<ellipse class="cr" data-name="씨3" stroke-width="3" cx="232" cy="145" rx="9" ry="14" transform="rotate(20,232,145)"/>
<ellipse class="cr" data-name="씨4" stroke-width="3" cx="155" cy="175" rx="9" ry="14" transform="rotate(-10,155,175)"/>
<ellipse class="cr" data-name="씨5" stroke-width="3" cx="245" cy="175" rx="9" ry="14" transform="rotate(10,245,175)"/>
<rect stroke-width="5" x="72" y="195" width="256" height="25" rx="5" fill="#fafafa"/>
</g>` },
        { id: 'donut', name: '도넛', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="도넛" stroke-width="5" cx="200" cy="160" r="120"/>
<circle class="cr" data-name="구멍" stroke-width="5" cx="200" cy="160" r="45" fill="white"/>
<path class="cr" data-name="아이싱" stroke-width="4" d="M105,130 Q120,62 200,58 Q280,62 295,130 Q260,115 230,120 Q210,108 190,112 Q165,108 140,122 Z"/>
<circle class="cr" data-name="스프링클1" stroke-width="3" cx="148" cy="108" r="7"/>
<circle class="cr" data-name="스프링클2" stroke-width="3" cx="180" cy="88" r="7"/>
<circle class="cr" data-name="스프링클3" stroke-width="3" cx="220" cy="88" r="7"/>
<circle class="cr" data-name="스프링클4" stroke-width="3" cx="252" cy="108" r="7"/>
</g>` },
        { id: 'strawberry', name: '딸기', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="딸기몸통" stroke-width="5" d="M200,95 Q270,92 305,155 Q325,200 310,245 Q295,278 258,285 Q228,290 200,288 Q172,290 142,285 Q105,278 90,245 Q75,200 95,155 Q130,92 200,95 Z"/>
<path class="cr" data-name="잎1" stroke-width="4" d="M200,98 Q200,58 178,42 Q188,68 200,78"/>
<path class="cr" data-name="잎2" stroke-width="4" d="M200,98 Q200,55 222,42 Q212,68 200,78"/>
<path class="cr" data-name="잎3" stroke-width="4" d="M200,98 Q165,62 148,55 Q172,75 190,90"/>
<path class="cr" data-name="잎4" stroke-width="4" d="M200,98 Q235,62 252,55 Q228,75 210,90"/>
<ellipse class="cr" data-name="씨1" stroke-width="3" cx="175" cy="148" rx="7" ry="9"/>
<ellipse class="cr" data-name="씨2" stroke-width="3" cx="200" cy="138" rx="7" ry="9"/>
<ellipse class="cr" data-name="씨3" stroke-width="3" cx="225" cy="148" rx="7" ry="9"/>
<ellipse class="cr" data-name="씨4" stroke-width="3" cx="168" cy="185" rx="7" ry="9"/>
<ellipse class="cr" data-name="씨5" stroke-width="3" cx="200" cy="178" rx="7" ry="9"/>
<ellipse class="cr" data-name="씨6" stroke-width="3" cx="232" cy="185" rx="7" ry="9"/>
<ellipse class="cr" data-name="씨7" stroke-width="3" cx="182" cy="222" rx="7" ry="9"/>
<ellipse class="cr" data-name="씨8" stroke-width="3" cx="218" cy="222" rx="7" ry="9"/>
</g>` },
        { id: 'cake', name: '케이크', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="아래층" stroke-width="5" x="58" y="200" width="284" height="88" rx="8"/>
<rect class="cr" data-name="위층" stroke-width="5" x="98" y="122" width="204" height="82" rx="8"/>
<rect class="cr" data-name="아이싱아래" stroke-width="4" x="58" y="192" width="284" height="22" rx="8"/>
<rect class="cr" data-name="아이싱위" stroke-width="4" x="98" y="115" width="204" height="22" rx="8"/>
<line stroke-width="3" x1="168" y1="115" x2="168" y2="122"/>
<line stroke-width="3" x1="200" y1="105" x2="200" y2="122"/>
<line stroke-width="3" x1="232" y1="115" x2="232" y2="122"/>
<rect class="cr" data-name="초1" stroke-width="3" x="163" y="88" width="10" height="28" rx="3"/>
<rect class="cr" data-name="초2" stroke-width="3" x="195" y="78" width="10" height="28" rx="3"/>
<rect class="cr" data-name="초3" stroke-width="3" x="227" y="88" width="10" height="28" rx="3"/>
<circle class="cr" data-name="불꽃1" stroke-width="2" cx="168" cy="85" r="6"/>
<circle class="cr" data-name="불꽃2" stroke-width="2" cx="200" cy="75" r="6"/>
<circle class="cr" data-name="불꽃3" stroke-width="2" cx="232" cy="85" r="6"/>
</g>` },
        { id: 'icecream', name: '아이스크림', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="콘" stroke-width="5" d="M148,200 L200,295 L252,200 Z"/>
<path class="cr" data-name="격자" stroke-width="2" d="M155,225 L245,225 M162,250 L238,250 M172,225 L165,250 M190,225 L183,250 M208,225 L201,250 M226,225 L219,250" fill="none"/>
<ellipse class="cr" data-name="아래스쿱" stroke-width="4" cx="200" cy="165" rx="65" ry="48"/>
<ellipse class="cr" data-name="위스쿱" stroke-width="4" cx="200" cy="120" rx="58" ry="45"/>
<ellipse class="cr" data-name="딸기스쿱" stroke-width="4" cx="200" cy="78" rx="48" ry="40"/>
<circle class="cr" data-name="체리" stroke-width="3" cx="200" cy="42" r="14"/>
<line stroke-width="2" x1="200" y1="42" x2="215" y2="32"/>
</g>` },
        { id: 'ramen', name: '라면', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="그릇" stroke-width="5" cx="200" cy="220" rx="148" ry="72"/>
<ellipse class="cr" data-name="국물" stroke-width="4" cx="200" cy="198" rx="132" ry="52"/>
<path class="cr" data-name="면1" stroke-width="4" d="M100,195 Q140,175 180,195 Q220,215 260,195 Q290,180 310,195" fill="none"/>
<path class="cr" data-name="면2" stroke-width="4" d="M90,212 Q130,195 170,212 Q210,228 250,212 Q285,198 320,212" fill="none"/>
<ellipse class="cr" data-name="달걀" stroke-width="4" cx="155" cy="178" rx="28" ry="22"/>
<circle stroke-width="3" cx="155" cy="178" r="12" fill="#fafafa"/>
<rect class="cr" data-name="어묵" stroke-width="4" x="230" y="162" width="52" height="25" rx="6"/>
<ellipse class="cr" data-name="파래기" stroke-width="3" cx="200" cy="165" rx="18" ry="8"/>
</g>` },
        { id: 'hamburger', name: '햄버거', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="위번" stroke-width="5" d="M75,148 Q80,78 200,72 Q320,78 325,148 Z"/>
<rect class="cr" data-name="야채" stroke-width="4" x="65" y="148" width="270" height="22" rx="3"/>
<rect class="cr" data-name="패티" stroke-width="5" x="68" y="168" width="264" height="32" rx="5"/>
<rect class="cr" data-name="치즈" stroke-width="4" x="62" y="198" width="276" height="18" rx="4"/>
<rect class="cr" data-name="아래번" stroke-width="5" x="62" y="215" width="276" height="58" rx="14"/>
<circle class="cr" data-name="깨1" stroke-width="2" cx="165" cy="102" r="7"/>
<circle class="cr" data-name="깨2" stroke-width="2" cx="200" cy="88" r="7"/>
<circle class="cr" data-name="깨3" stroke-width="2" cx="235" cy="102" r="7"/>
</g>` },
        { id: 'sushi', name: '초밥', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="밥1" stroke-width="5" cx="115" cy="220" rx="65" ry="40"/>
<ellipse class="cr" data-name="밥2" stroke-width="5" cx="200" cy="220" rx="65" ry="40"/>
<ellipse class="cr" data-name="밥3" stroke-width="5" cx="285" cy="220" rx="65" ry="40"/>
<ellipse class="cr" data-name="연어" stroke-width="4" cx="115" cy="192" rx="52" ry="28"/>
<ellipse class="cr" data-name="참치" stroke-width="4" cx="200" cy="192" rx="52" ry="28"/>
<ellipse class="cr" data-name="새우" stroke-width="4" cx="285" cy="192" rx="52" ry="28"/>
<rect class="cr" data-name="접시" stroke-width="4" x="42" y="252" width="316" height="18" rx="9"/>
<rect class="cr" data-name="와사비" stroke-width="3" x="90" y="245" width="30" height="12" rx="4"/>
<rect class="cr" data-name="간장" stroke-width="3" x="280" y="242" width="38" height="18" rx="6"/>
</g>` },
        { id: 'sandwich', name: '샌드위치', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="위빵" stroke-width="5" d="M62,128 Q62,72 200,68 Q338,72 338,128 Z"/>
<rect class="cr" data-name="상추" stroke-width="4" x="55" y="128" width="290" height="20" rx="3"/>
<rect class="cr" data-name="햄" stroke-width="4" x="60" y="146" width="280" height="25" rx="4"/>
<rect class="cr" data-name="치즈" stroke-width="4" x="58" y="169" width="284" height="20" rx="3"/>
<rect class="cr" data-name="토마토" stroke-width="4" x="60" y="187" width="280" height="18" rx="3"/>
<rect class="cr" data-name="아래빵" stroke-width="5" x="55" y="203" width="290" height="62" rx="12"/>
</g>` },
        { id: 'apple', name: '사과', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="몸통" stroke-width="5" d="M200,95 Q280,92 315,165 Q335,215 318,260 Q300,295 262,298 Q230,302 200,298 Q170,302 138,298 Q100,295 82,260 Q65,215 85,165 Q120,92 200,95 Z"/>
<path class="cr" data-name="잎" stroke-width="4" d="M200,95 Q215,62 245,48 Q238,78 215,90"/>
<line stroke-width="3" x1="200" y1="55" x2="200" y2="98"/>
<ellipse class="cr" data-name="하이라이트" stroke-width="2" cx="148" cy="148" rx="20" ry="30"/>
</g>` }
      ]
    },
    {
      id: 'plants', name: '식물', icon: '🌿',
      images: [
        { id: 'tree', name: '나무', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="줄기" stroke-width="5" x="172" y="195" width="56" height="95" rx="8"/>
<circle class="cr" data-name="잎아래" stroke-width="4" cx="200" cy="180" r="80"/>
<circle class="cr" data-name="잎가운데" stroke-width="4" cx="200" cy="145" r="68"/>
<circle class="cr" data-name="잎위" stroke-width="4" cx="200" cy="108" r="55"/>
<circle class="cr" data-name="사과1" stroke-width="3" cx="165" cy="155" r="16"/>
<circle class="cr" data-name="사과2" stroke-width="3" cx="235" cy="155" r="16"/>
<circle class="cr" data-name="사과3" stroke-width="3" cx="200" cy="180" r="16"/>
</g>` },
        { id: 'sunflower', name: '해바라기', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="줄기" stroke-width="5" x="188" y="185" width="24" height="110" rx="8"/>
<path class="cr" data-name="잎1" stroke-width="4" d="M200,230 Q165,205 150,220 Q165,240 200,235 Z"/>
<path class="cr" data-name="잎2" stroke-width="4" d="M200,240 Q235,215 250,230 Q235,250 200,245 Z"/>
<ellipse class="cr" data-name="꽃잎1" stroke-width="4" cx="200" cy="108" rx="18" ry="35" transform="rotate(0,200,148)"/>
<ellipse class="cr" data-name="꽃잎2" stroke-width="4" cx="200" cy="108" rx="18" ry="35" transform="rotate(45,200,148)"/>
<ellipse class="cr" data-name="꽃잎3" stroke-width="4" cx="200" cy="108" rx="18" ry="35" transform="rotate(90,200,148)"/>
<ellipse class="cr" data-name="꽃잎4" stroke-width="4" cx="200" cy="108" rx="18" ry="35" transform="rotate(135,200,148)"/>
<ellipse class="cr" data-name="꽃잎5" stroke-width="4" cx="200" cy="108" rx="18" ry="35" transform="rotate(22,200,148)"/>
<ellipse class="cr" data-name="꽃잎6" stroke-width="4" cx="200" cy="108" rx="18" ry="35" transform="rotate(67,200,148)"/>
<ellipse class="cr" data-name="꽃잎7" stroke-width="4" cx="200" cy="108" rx="18" ry="35" transform="rotate(112,200,148)"/>
<ellipse class="cr" data-name="꽃잎8" stroke-width="4" cx="200" cy="108" rx="18" ry="35" transform="rotate(157,200,148)"/>
<circle class="cr" data-name="꽃중심" stroke-width="5" cx="200" cy="148" r="40"/>
</g>` },
        { id: 'cactus', name: '선인장', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="몸통" stroke-width="5" x="165" y="95" width="70" height="190" rx="35"/>
<path class="cr" data-name="왼팔" stroke-width="5" d="M165,155 Q112,155 108,118 Q105,95 125,95 Q145,95 148,118 L148,145" fill="none"/>
<path class="cr" data-name="오른팔" stroke-width="5" d="M235,175 Q288,175 292,138 Q295,115 275,115 Q255,115 252,138 L252,162" fill="none"/>
<rect class="cr" data-name="화분" stroke-width="5" x="148" y="272" width="104" height="20" rx="5"/>
<rect class="cr" data-name="화분몸통" stroke-width="5" x="155" y="285" width="90" height="55" rx="8"/>
<ellipse class="cr" data-name="꽃" stroke-width="3" cx="200" cy="92" rx="22" ry="18"/>
</g>` },
        { id: 'mushroom', name: '버섯', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="기둥" stroke-width="5" d="M160,185 Q148,260 148,290 L252,290 Q252,260 240,185 Z"/>
<path class="cr" data-name="갓" stroke-width="5" d="M58,185 Q58,68 200,68 Q342,68 342,185 Z"/>
<path class="cr" data-name="갓안" stroke-width="4" d="M80,185 Q95,128 200,120 Q305,128 320,185 Z"/>
<circle class="cr" data-name="점1" stroke-width="3" cx="148" cy="120" r="20"/>
<circle class="cr" data-name="점2" stroke-width="3" cx="200" cy="102" r="20"/>
<circle class="cr" data-name="점3" stroke-width="3" cx="252" cy="120" r="20"/>
<circle class="cr" data-name="점4" stroke-width="3" cx="120" cy="155" r="16"/>
<circle class="cr" data-name="점5" stroke-width="3" cx="280" cy="155" r="16"/>
</g>` },
        { id: 'flower', name: '꽃', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="줄기" stroke-width="5" x="188" y="190" width="24" height="110" rx="8"/>
<path class="cr" data-name="잎1" stroke-width="4" d="M200,240 Q165,218 152,232 Q162,252 200,248 Z"/>
<path class="cr" data-name="잎2" stroke-width="4" d="M200,258 Q235,236 248,250 Q238,270 200,266 Z"/>
<ellipse class="cr" data-name="꽃잎위" stroke-width="4" cx="200" cy="125" rx="28" ry="45"/>
<ellipse class="cr" data-name="꽃잎우상" stroke-width="4" cx="238" cy="138" rx="28" ry="45" transform="rotate(60,238,138)"/>
<ellipse class="cr" data-name="꽃잎우하" stroke-width="4" cx="230" cy="175" rx="28" ry="45" transform="rotate(120,230,175)"/>
<ellipse class="cr" data-name="꽃잎아래" stroke-width="4" cx="200" cy="188" rx="28" ry="45"/>
<ellipse class="cr" data-name="꽃잎좌하" stroke-width="4" cx="162" cy="175" rx="28" ry="45" transform="rotate(60,162,175)"/>
<ellipse class="cr" data-name="꽃잎좌상" stroke-width="4" cx="162" cy="138" rx="28" ry="45" transform="rotate(120,162,138)"/>
<circle class="cr" data-name="꽃중심" stroke-width="5" cx="200" cy="155" r="38"/>
</g>` },
        { id: 'palm_tree', name: '야자수', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="줄기" stroke-width="8" d="M195,280 Q188,235 195,195 Q202,160 200,130" fill="none"/>
<path class="cr" data-name="잎1" stroke-width="4" d="M200,130 Q165,95 120,90 Q145,112 185,125"/>
<path class="cr" data-name="잎2" stroke-width="4" d="M200,130 Q172,82 158,48 Q175,75 195,115"/>
<path class="cr" data-name="잎3" stroke-width="4" d="M200,130 Q228,82 242,48 Q225,75 205,115"/>
<path class="cr" data-name="잎4" stroke-width="4" d="M200,130 Q235,95 280,90 Q255,112 215,125"/>
<path class="cr" data-name="잎5" stroke-width="4" d="M200,130 Q215,92 260,75 Q245,105 210,120"/>
<path class="cr" data-name="잎6" stroke-width="4" d="M200,130 Q185,92 140,75 Q155,105 190,120"/>
<circle class="cr" data-name="코코넛1" stroke-width="3" cx="192" cy="138" r="14"/>
<circle class="cr" data-name="코코넛2" stroke-width="3" cx="212" cy="142" r="14"/>
</g>` },
        { id: 'cactus', name: '선인장', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="몸통" stroke-width="5" x="168" y="98" width="64" height="172" rx="28"/>
<path class="cr" data-name="왼팔" stroke-width="5" d="M168,152 Q115,148 108,115 Q102,88 125,88 Q132,108 132,138 Q148,145 168,148"/>
<path class="cr" data-name="오른팔" stroke-width="5" d="M232,162 Q285,158 292,128 Q298,102 275,102 Q268,118 268,148 Q252,155 232,158"/>
<rect class="cr" data-name="화분" stroke-width="5" x="148" y="268" width="104" height="32" rx="8"/>
<rect class="cr" data-name="화분받침" stroke-width="4" x="138" y="295" width="124" height="12" rx="6"/>
<ellipse class="cr" data-name="꽃" stroke-width="3" cx="200" cy="88" rx="22" ry="16"/>
</g>` },
        { id: 'rose', name: '장미', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="줄기" stroke-width="5" x="193" y="172" width="14" height="118" rx="6"/>
<path class="cr" data-name="왼잎" stroke-width="4" d="M193,225 Q158,210 148,228 Q158,252 193,240 Z"/>
<path class="cr" data-name="오른잎" stroke-width="4" d="M207,248 Q242,232 252,250 Q242,274 207,262 Z"/>
<circle class="cr" data-name="꽃중심" stroke-width="4" cx="200" cy="112" r="35"/>
<path class="cr" data-name="꽃잎1" stroke-width="4" d="M200,78 Q235,65 252,88 Q248,112 225,118"/>
<path class="cr" data-name="꽃잎2" stroke-width="4" d="M200,78 Q165,65 148,88 Q152,112 175,118"/>
<path class="cr" data-name="꽃잎3" stroke-width="4" d="M232,128 Q260,142 255,168 Q235,175 215,158"/>
<path class="cr" data-name="꽃잎4" stroke-width="4" d="M168,128 Q140,142 145,168 Q165,175 185,158"/>
<path class="cr" data-name="꽃잎5" stroke-width="4" d="M185,148 Q200,162 215,148 Q220,162 200,172 Q180,162 185,148 Z"/>
</g>` },
        { id: 'mushroom', name: '버섯', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="대" stroke-width="5" x="162" y="192" width="76" height="98" rx="10"/>
<ellipse class="cr" data-name="갓" stroke-width="5" cx="200" cy="165" rx="128" ry="90"/>
<ellipse class="cr" data-name="주름" stroke-width="4" cx="200" cy="205" rx="112" ry="28"/>
<circle class="cr" data-name="점1" stroke-width="3" cx="158" cy="138" r="18"/>
<circle class="cr" data-name="점2" stroke-width="3" cx="200" cy="112" r="18"/>
<circle class="cr" data-name="점3" stroke-width="3" cx="242" cy="138" r="18"/>
<circle class="cr" data-name="점4" stroke-width="3" cx="132" cy="172" r="12"/>
<circle class="cr" data-name="점5" stroke-width="3" cx="268" cy="172" r="12"/>
</g>` },
        { id: 'bamboo', name: '대나무', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="줄기1" stroke-width="5" x="155" y="42" width="38" height="248" rx="14"/>
<rect class="cr" data-name="줄기2" stroke-width="5" x="215" y="72" width="32" height="220" rx="12"/>
<rect class="cr" data-name="줄기3" stroke-width="4" x="95" y="95" width="28" height="195" rx="10"/>
<line stroke-width="4" x1="155" y1="112" x2="193" y2="112"/>
<line stroke-width="4" x1="155" y1="175" x2="193" y2="175"/>
<line stroke-width="4" x1="155" y1="238" x2="193" y2="238"/>
<path class="cr" data-name="잎1" stroke-width="4" d="M193,130 Q228,105 245,118 Q232,142 193,138"/>
<path class="cr" data-name="잎2" stroke-width="4" d="M155,195 Q118,170 105,185 Q118,208 155,202"/>
<path class="cr" data-name="잎3" stroke-width="4" d="M215,145 Q252,122 268,138 Q252,162 215,155"/>
</g>` },
        { id: 'tulip', name: '튤립', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="줄기" stroke-width="5" x="192" y="185" width="16" height="108" rx="6"/>
<path class="cr" data-name="왼잎" stroke-width="4" d="M192,245 Q155,222 148,248 Q158,278 192,262 Z"/>
<path class="cr" data-name="오른잎" stroke-width="4" d="M208,258 Q245,235 252,260 Q242,290 208,275 Z"/>
<path class="cr" data-name="꽃잎왼" stroke-width="4" d="M165,185 Q148,145 168,115 Q185,108 200,115 L200,188 Z"/>
<path class="cr" data-name="꽃잎오른" stroke-width="4" d="M235,185 Q252,145 232,115 Q215,108 200,115 L200,188 Z"/>
<path class="cr" data-name="꽃잎중앙" stroke-width="4" d="M200,115 Q200,88 200,72 Q200,88 200,115 Z"/>
<ellipse class="cr" data-name="꽃봉오리" stroke-width="4" cx="200" cy="118" rx="38" ry="62"/>
</g>` },
        { id: 'clovers', name: '클로버', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="줄기" stroke-width="4" x="195" y="212" width="10" height="78" rx="4"/>
<circle class="cr" data-name="위잎" stroke-width="4" cx="200" cy="138" r="48"/>
<circle class="cr" data-name="왼잎" stroke-width="4" cx="148" cy="185" r="48"/>
<circle class="cr" data-name="오른잎" stroke-width="4" cx="252" cy="185" r="48"/>
<circle class="cr" data-name="아래잎" stroke-width="4" cx="200" cy="232" r="48"/>
<circle stroke-width="3" cx="200" cy="188" r="18" fill="#fafafa"/>
</g>` }
      ]
    },
    {
      id: 'household', name: '집안사물', icon: '📺',
      images: [
        { id: 'tv', name: 'TV', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="TV본체" stroke-width="5" x="48" y="72" width="304" height="192" rx="18"/>
<rect class="cr" data-name="화면" stroke-width="4" x="68" y="90" width="264" height="156" rx="10"/>
<rect class="cr" data-name="받침대" stroke-width="5" x="155" y="264" width="90" height="22" rx="6"/>
<rect class="cr" data-name="받침발판" stroke-width="5" x="128" y="282" width="144" height="15" rx="6"/>
<circle class="cr" data-name="전원버튼" stroke-width="3" cx="108" cy="264" r="10"/>
</g>` },
        { id: 'refrigerator', name: '냉장고', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="냉동칸" stroke-width="5" x="95" y="48" width="210" height="108" rx="12"/>
<rect class="cr" data-name="냉장칸" stroke-width="5" x="95" y="165" width="210" height="180" rx="12"/>
<rect class="cr" data-name="냉동손잡이" stroke-width="4" x="148" y="72" width="16" height="60" rx="8"/>
<rect class="cr" data-name="냉장손잡이" stroke-width="4" x="148" y="188" width="16" height="80" rx="8"/>
<line stroke-width="4" x1="95" y1="158" x2="305" y2="158"/>
<circle stroke-width="3" cx="275" cy="75" r="9" fill="#fafafa"/>
<circle stroke-width="3" cx="275" cy="185" r="9" fill="#fafafa"/>
</g>` },
        { id: 'clock', name: '시계', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="시계테두리" stroke-width="6" cx="200" cy="168" r="130"/>
<circle class="cr" data-name="시계면" stroke-width="4" cx="200" cy="168" r="112"/>
<line stroke-width="5" x1="200" y1="168" x2="200" y2="88"/>
<line stroke-width="4" x1="200" y1="168" x2="258" y2="210"/>
<circle stroke-width="4" cx="200" cy="168" r="8" fill="#1a1a1a"/>
<line stroke-width="3" x1="200" y1="58" x2="200" y2="72"/>
<line stroke-width="3" x1="200" y1="258" x2="200" y2="272"/>
<line stroke-width="3" x1="90" y1="168" x2="104" y2="168"/>
<line stroke-width="3" x1="296" y1="168" x2="310" y2="168"/>
<rect class="cr" data-name="왼다리" stroke-width="4" x="148" y="292" width="35" height="22" rx="5"/>
<rect class="cr" data-name="오른다리" stroke-width="4" x="217" y="292" width="35" height="22" rx="5"/>
</g>` },
        { id: 'lamp', name: '전등', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="전등갓" stroke-width="5" d="M108,148 L165,58 L235,58 L292,148 Z"/>
<ellipse class="cr" data-name="갓테두리" stroke-width="4" cx="200" cy="148" rx="92" ry="18"/>
<rect class="cr" data-name="기둥" stroke-width="5" x="188" y="165" width="24" height="110" rx="6"/>
<ellipse class="cr" data-name="받침" stroke-width="5" cx="200" cy="275" rx="70" ry="18"/>
<ellipse class="cr" data-name="전구" stroke-width="4" cx="200" cy="108" rx="28" ry="32"/>
<path stroke-width="3" d="M188,108 L168,80 M212,108 L232,80 M200,78 L200,62" fill="none"/>
</g>` },
        { id: 'cup', name: '컵', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="컵몸통" stroke-width="5" d="M110,80 L132,268 L268,268 L290,80 Z"/>
<ellipse class="cr" data-name="컵위" stroke-width="4" cx="200" cy="80" rx="90" ry="18"/>
<path class="cr" data-name="손잡이" stroke-width="5" d="M290,132 Q345,132 345,180 Q345,228 290,228" fill="none"/>
<path class="cr" data-name="무늬" stroke-width="4" d="M118,140 Q165,158 200,150 Q235,142 278,158" fill="none"/>
<path class="cr" data-name="무늬2" stroke-width="4" d="M122,180 Q165,198 200,190 Q235,182 274,198" fill="none"/>
</g>` },
        { id: 'umbrella', name: '우산', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="우산천" stroke-width="5" d="M50,175 Q50,55 200,48 Q350,55 350,175 Z"/>
<path class="cr" data-name="천무늬1" stroke-width="3" d="M50,175 Q125,160 200,48 Q125,90 100,175" fill="none"/>
<path class="cr" data-name="천무늬2" stroke-width="3" d="M350,175 Q275,160 200,48 Q275,90 300,175" fill="none"/>
<path class="cr" data-name="천무늬3" stroke-width="3" d="M148,55 Q148,115 148,175 M252,55 Q252,115 252,175" fill="none"/>
<rect class="cr" data-name="손잡이기둥" stroke-width="5" x="192" y="175" width="16" height="108" rx="4"/>
<path class="cr" data-name="손잡이" stroke-width="5" d="M200,280 Q200,308 178,310 Q155,312 155,292" fill="none"/>
</g>` },
        { id: 'book', name: '책', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="표지" stroke-width="5" d="M68,55 L68,275 Q68,292 85,292 L340,292 L340,55 Q340,38 323,38 L85,38 Q68,38 68,55 Z"/>
<rect class="cr" data-name="등쪽" stroke-width="5" x="48" y="38" width="28" height="254" rx="5"/>
<line stroke-width="3" x1="96" y1="90" x2="316" y2="90"/>
<line stroke-width="3" x1="96" y1="118" x2="316" y2="118"/>
<line stroke-width="3" x1="96" y1="146" x2="316" y2="146"/>
<line stroke-width="3" x1="96" y1="174" x2="316" y2="174"/>
<line stroke-width="3" x1="96" y1="202" x2="316" y2="202"/>
<rect class="cr" data-name="제목" stroke-width="3" x="96" y="48" width="220" height="32" rx="4"/>
</g>` },
        { id: 'chair', name: '의자', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="등받이" stroke-width="5" x="90" y="55" width="220" height="128" rx="10"/>
<rect class="cr" data-name="좌석" stroke-width="5" x="72" y="178" width="256" height="38" rx="10"/>
<rect class="cr" data-name="앞왼다리" stroke-width="5" x="88" y="215" width="28" height="95" rx="8"/>
<rect class="cr" data-name="앞오른다리" stroke-width="5" x="284" y="215" width="28" height="95" rx="8"/>
<rect class="cr" data-name="뒷왼다리" stroke-width="4" x="98" y="178" width="22" height="130" rx="6"/>
<rect class="cr" data-name="뒷오른다리" stroke-width="4" x="280" y="178" width="22" height="130" rx="6"/>
<line stroke-width="4" x1="88" y1="278" x2="284" y2="278"/>
</g>` },
        { id: 'clock', name: '시계', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="시계본체" stroke-width="6" cx="200" cy="168" r="122"/>
<circle class="cr" data-name="안원" stroke-width="3" cx="200" cy="168" r="102"/>
<rect class="cr" data-name="12시" stroke-width="4" x="194" y="75" width="12" height="22" rx="3"/>
<rect class="cr" data-name="3시" stroke-width="4" x="283" y="162" width="22" height="12" rx="3"/>
<rect class="cr" data-name="6시" stroke-width="4" x="194" y="247" width="12" height="22" rx="3"/>
<rect class="cr" data-name="9시" stroke-width="4" x="95" y="162" width="22" height="12" rx="3"/>
<line stroke-width="5" x1="200" y1="168" x2="200" y2="108"/>
<line stroke-width="4" x1="200" y1="168" x2="248" y2="168"/>
<circle stroke-width="3" cx="200" cy="168" r="6" fill="#1a1a1a"/>
<rect class="cr" data-name="다리1" stroke-width="3" x="155" y="288" width="28" height="35" rx="6"/>
<rect class="cr" data-name="다리2" stroke-width="3" x="217" y="288" width="28" height="35" rx="6"/>
</g>` },
        { id: 'lamp', name: '스탠드', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="받침" stroke-width="5" cx="200" cy="288" rx="95" ry="18"/>
<rect class="cr" data-name="기둥" stroke-width="5" x="193" y="168" width="14" height="125" rx="6"/>
<path class="cr" data-name="팔" stroke-width="5" d="M200,168 Q245,145 275,95"/>
<path class="cr" data-name="갓" stroke-width="5" d="M248,52 Q310,48 318,98 Q310,112 248,118 Q220,115 210,105 Q205,92 248,52 Z"/>
<ellipse class="cr" data-name="전구" stroke-width="4" cx="268" cy="90" rx="22" ry="28"/>
<line stroke-width="3" x1="250" y1="105" x2="200" y2="168"/>
</g>` },
        { id: 'fridge', name: '냉장고', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="하단칸" stroke-width="5" x="85" y="178" width="230" height="125" rx="10"/>
<rect class="cr" data-name="상단칸" stroke-width="5" x="85" y="42" width="230" height="140" rx="10"/>
<line stroke-width="4" x1="85" y1="178" x2="315" y2="178"/>
<rect class="cr" data-name="상단손잡이" stroke-width="4" x="280" y="85" width="18" height="55" rx="8"/>
<rect class="cr" data-name="하단손잡이" stroke-width="4" x="280" y="205" width="18" height="42" rx="8"/>
<rect class="cr" data-name="물통" stroke-width="3" x="105" y="195" width="45" height="62" rx="6"/>
<rect class="cr" data-name="야채칸" stroke-width="3" x="155" y="258" width="140" height="28" rx="5"/>
</g>` },
        { id: 'backpack', name: '가방', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="몸통" stroke-width="5" x="75" y="88" width="250" height="215" rx="22"/>
<rect class="cr" data-name="앞주머니" stroke-width="4" x="105" y="178" width="190" height="105" rx="14"/>
<rect class="cr" data-name="위덮개" stroke-width="4" x="88" y="68" width="224" height="52" rx="14"/>
<rect class="cr" data-name="왼어깨끈" stroke-width="5" x="95" y="88" width="28" height="155" rx="12"/>
<rect class="cr" data-name="오른어깨끈" stroke-width="5" x="277" y="88" width="28" height="155" rx="12"/>
<line stroke-width="3" x1="105" y1="228" x2="295" y2="228"/>
<circle class="cr" data-name="지퍼링" stroke-width="3" cx="200" cy="180" r="8"/>
</g>` },
        { id: 'cup', name: '컵', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="컵몸통" stroke-width="5" d="M105,72 L125,278 L275,278 L295,72 Z"/>
<path class="cr" data-name="손잡이" stroke-width="5" d="M295,112 Q352,112 352,175 Q352,238 295,238 L295,215 Q322,215 322,175 Q322,135 295,135 Z"/>
<path class="cr" data-name="음료" stroke-width="4" d="M108,115 L128,278 L272,278 L292,115 Z"/>
<line stroke-width="3" x1="105" y1="72" x2="295" y2="72"/>
</g>` },
        { id: 'scissors', name: '가위', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="왼손잡이" stroke-width="4" cx="148" cy="228" r="45"/>
<circle class="cr" data-name="오른손잡이" stroke-width="4" cx="252" cy="228" r="45"/>
<path class="cr" data-name="왼날" stroke-width="5" d="M170,195 L200,148 L220,62"/>
<path class="cr" data-name="오른날" stroke-width="5" d="M230,195 L200,148 L180,62"/>
<circle stroke-width="3" cx="200" cy="148" r="10" fill="#fafafa"/>
</g>` },
        { id: 'telephone', name: '전화기', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="본체" stroke-width="5" x="68" y="75" width="264" height="195" rx="18"/>
<rect class="cr" data-name="화면" stroke-width="4" x="92" y="100" width="216" height="120" rx="10"/>
<circle class="cr" data-name="버튼1" stroke-width="3" cx="148" cy="245" r="12"/>
<circle class="cr" data-name="버튼2" stroke-width="3" cx="200" cy="245" r="12"/>
<circle class="cr" data-name="버튼3" stroke-width="3" cx="252" cy="245" r="12"/>
<rect class="cr" data-name="카메라" stroke-width="3" x="190" y="88" width="20" height="8" rx="4"/>
<rect class="cr" data-name="홈버튼" stroke-width="4" x="182" y="258" width="36" height="10" rx="5"/>
</g>` },
        { id: 'washing', name: '세탁기', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="본체" stroke-width="5" x="55" y="58" width="290" height="248" rx="14"/>
<circle class="cr" data-name="문" stroke-width="5" cx="200" cy="205" r="88"/>
<circle class="cr" data-name="드럼" stroke-width="4" cx="200" cy="205" r="68"/>
<rect class="cr" data-name="패널" stroke-width="4" x="72" y="72" width="256" height="55" rx="8"/>
<circle class="cr" data-name="다이얼" stroke-width="4" cx="115" cy="99" r="22"/>
<rect class="cr" data-name="버튼1" stroke-width="3" x="175" y="88" width="22" height="14" rx="5"/>
<rect class="cr" data-name="버튼2" stroke-width="3" x="218" y="88" width="22" height="14" rx="5"/>
<rect class="cr" data-name="디스플레이" stroke-width="3" x="265" y="80" width="52" height="32" rx="6"/>
</g>` }
      ]
    },
    {
      id: 'nature', name: '자연날씨', icon: '🌈',
      images: [
        { id: 'sun', name: '태양', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="태양원" stroke-width="5" cx="200" cy="155" r="82"/>
<line class="cr" data-name="빛1" stroke-width="5" x1="200" y1="48" x2="200" y2="28"/>
<line class="cr" data-name="빛2" stroke-width="5" x1="258" y1="65" x2="272" y2="50"/>
<line class="cr" data-name="빛3" stroke-width="5" x1="300" y1="112" x2="318" y2="100"/>
<line class="cr" data-name="빛4" stroke-width="5" x1="310" y1="175" x2="332" y2="175"/>
<line class="cr" data-name="빛5" stroke-width="5" x1="295" y1="228" x2="315" y2="242"/>
<line class="cr" data-name="빛6" stroke-width="5" x1="248" y1="258" x2="260" y2="278"/>
<line class="cr" data-name="빛7" stroke-width="5" x1="200" y1="262" x2="200" y2="282"/>
<line class="cr" data-name="빛8" stroke-width="5" x1="152" y1="258" x2="140" y2="278"/>
<line class="cr" data-name="빛9" stroke-width="5" x1="105" y1="228" x2="85" y2="242"/>
<line class="cr" data-name="빛10" stroke-width="5" x1="90" y1="175" x2="68" y2="175"/>
<line class="cr" data-name="빛11" stroke-width="5" x1="100" y1="112" x2="82" y2="100"/>
<line class="cr" data-name="빛12" stroke-width="5" x1="142" y1="65" x2="128" y2="50"/>
<circle class="cr" data-name="얼굴" stroke-width="3" cx="200" cy="155" r="52"/>
<circle stroke-width="3" cx="183" cy="148" r="8" fill="#1a1a1a"/>
<circle stroke-width="3" cx="217" cy="148" r="8" fill="#1a1a1a"/>
<path stroke-width="3" d="M183,168 Q200,182 217,168" fill="none"/>
</g>` },
        { id: 'rainbow', name: '무지개', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="none">
<path class="cr" data-name="빨강" stroke-width="16" d="M35,220 Q35,52 200,52 Q365,52 365,220" fill="none"/>
<path class="cr" data-name="주황" stroke-width="14" d="M55,220 Q55,75 200,75 Q345,75 345,220" fill="none"/>
<path class="cr" data-name="노랑" stroke-width="14" d="M75,220 Q75,98 200,98 Q325,98 325,220" fill="none"/>
<path class="cr" data-name="초록" stroke-width="14" d="M95,220 Q95,120 200,120 Q305,120 305,220" fill="none"/>
<path class="cr" data-name="파랑" stroke-width="14" d="M115,220 Q115,142 200,142 Q285,142 285,220" fill="none"/>
<path class="cr" data-name="남색" stroke-width="14" d="M135,220 Q135,162 200,162 Q265,162 265,220" fill="none"/>
<path class="cr" data-name="보라" stroke-width="14" d="M155,220 Q155,182 200,182 Q245,182 245,220" fill="none"/>
<path class="cr" data-name="구름왼" stroke-width="4" d="M45,210 Q25,205 22,220 Q20,238 40,238 L100,238 Q118,238 118,222 Q118,205 102,205 Q98,188 82,190 Q75,175 58,180 Q42,182 45,210 Z" fill="#fafafa" stroke="#1a1a1a"/>
<path class="cr" data-name="구름오른" stroke-width="4" d="M355,210 Q375,205 378,220 Q380,238 360,238 L300,238 Q282,238 282,222 Q282,205 298,205 Q302,188 318,190 Q325,175 342,180 Q358,182 355,210 Z" fill="#fafafa" stroke="#1a1a1a"/>
</g>` },
        { id: 'snowman', name: '눈사람', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="아래몸통" stroke-width="5" cx="200" cy="228" r="82"/>
<circle class="cr" data-name="윗몸통" stroke-width="5" cx="200" cy="135" r="58"/>
<circle class="cr" data-name="머리" stroke-width="5" cx="200" cy="68" r="42"/>
<rect class="cr" data-name="모자" stroke-width="4" x="160" y="22" width="80" height="52" rx="5"/>
<rect class="cr" data-name="모자챙" stroke-width="4" x="148" y="66" width="104" height="12" rx="4"/>
<circle stroke-width="3" cx="186" cy="62" r="7" fill="#1a1a1a"/>
<circle stroke-width="3" cx="214" cy="62" r="7" fill="#1a1a1a"/>
<ellipse class="cr" data-name="코" stroke-width="3" cx="200" cy="74" rx="7" ry="12"/>
<circle stroke-width="3" cx="190" cy="122" r="7" fill="#1a1a1a"/>
<circle stroke-width="3" cx="200" cy="132" r="7" fill="#1a1a1a"/>
<circle stroke-width="3" cx="210" cy="122" r="7" fill="#1a1a1a"/>
<path class="cr" data-name="왼팔" stroke-width="5" d="M145,145 Q100,125 75,105" fill="none"/>
<path class="cr" data-name="오른팔" stroke-width="5" d="M255,145 Q300,125 325,105" fill="none"/>
<rect class="cr" data-name="목도리" stroke-width="4" x="158" y="100" width="84" height="18" rx="5"/>
</g>` },
        { id: 'cloud', name: '구름', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="구름" stroke-width="5" d="M68,200 Q42,200 38,178 Q35,158 58,152 Q55,118 80,112 Q88,88 115,90 Q125,68 155,70 Q165,48 200,48 Q235,48 248,68 Q278,62 295,88 Q322,85 332,112 Q358,115 362,148 Q378,155 370,178 Q368,200 342,200 Z"/>
<line class="cr" data-name="빗줄기1" stroke-width="4" x1="128" y1="220" x2="112" y2="268"/>
<line class="cr" data-name="빗줄기2" stroke-width="4" x1="162" y1="220" x2="146" y2="268"/>
<line class="cr" data-name="빗줄기3" stroke-width="4" x1="200" y1="220" x2="184" y2="268"/>
<line class="cr" data-name="빗줄기4" stroke-width="4" x1="238" y1="220" x2="222" y2="268"/>
<line class="cr" data-name="빗줄기5" stroke-width="4" x1="272" y1="220" x2="256" y2="268"/>
</g>` },
        { id: 'moon', name: '달', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="달" stroke-width="5" d="M245,62 Q285,92 295,148 Q305,205 270,248 Q235,290 185,295 Q238,285 262,248 Q288,210 280,158 Q272,108 245,78 Z"/>
<circle stroke-width="3" cx="188" cy="128" r="16" fill="#fafafa"/>
<circle stroke-width="3" cx="222" cy="175" r="22" fill="#fafafa"/>
<circle stroke-width="3" cx="182" cy="205" r="13" fill="#fafafa"/>
<circle class="cr" data-name="별1" stroke-width="3" cx="118" cy="90" r="10"/>
<circle class="cr" data-name="별2" stroke-width="3" cx="148" cy="48" r="8"/>
<circle class="cr" data-name="별3" stroke-width="3" cx="88" cy="148" r="6"/>
</g>` },
        { id: 'star', name: '별', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<polygon class="cr" data-name="별몸통" stroke-width="5" points="200,38 228,128 322,128 248,185 275,275 200,218 125,275 152,185 78,128 172,128"/>
<circle class="cr" data-name="별중심" stroke-width="3" cx="200" cy="172" r="32"/>
</g>` },
        { id: 'mountain', name: '산', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<polygon class="cr" data-name="큰산" stroke-width="5" points="200,38 368,285 32,285"/>
<polygon class="cr" data-name="작은산" stroke-width="4" points="295,112 385,285 205,285"/>
<path class="cr" data-name="눈1" stroke-width="4" d="M200,38 L248,100 L152,100 Z"/>
<path class="cr" data-name="눈2" stroke-width="3" d="M295,112 L320,148 L270,148 Z"/>
<ellipse class="cr" data-name="구름" stroke-width="3" cx="110" cy="90" rx="52" ry="28"/>
<circle stroke-width="3" cx="92" cy="90" r="20" fill="#fafafa"/>
<circle stroke-width="3" cx="118" cy="78" r="24" fill="#fafafa"/>
<circle stroke-width="3" cx="140" cy="88" r="20" fill="#fafafa"/>
</g>` },
        { id: 'snowflake', name: '눈꽃', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="팔위" stroke-width="4" cx="200" cy="90" rx="10" ry="55"/>
<ellipse class="cr" data-name="팔우상" stroke-width="4" cx="200" cy="90" rx="10" ry="55" transform="rotate(60,200,163)"/>
<ellipse class="cr" data-name="팔좌상" stroke-width="4" cx="200" cy="90" rx="10" ry="55" transform="rotate(120,200,163)"/>
<ellipse class="cr" data-name="팔아래" stroke-width="4" cx="200" cy="236" rx="10" ry="55"/>
<ellipse class="cr" data-name="팔우하" stroke-width="4" cx="200" cy="236" rx="10" ry="55" transform="rotate(60,200,163)"/>
<ellipse class="cr" data-name="팔좌하" stroke-width="4" cx="200" cy="236" rx="10" ry="55" transform="rotate(120,200,163)"/>
<circle class="cr" data-name="중심" stroke-width="5" cx="200" cy="163" r="22"/>
</g>` },
        { id: 'volcano', name: '화산', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<polygon class="cr" data-name="화산체" stroke-width="5" points="200,62 368,295 32,295"/>
<path class="cr" data-name="용암" stroke-width="4" d="M175,62 Q185,38 200,28 Q215,38 225,62 Q215,58 200,65 Q185,58 175,62 Z"/>
<path class="cr" data-name="용암흐름1" stroke-width="5" d="M185,75 Q178,108 182,145 Q192,165 188,195"/>
<path class="cr" data-name="용암흐름2" stroke-width="5" d="M215,75 Q222,108 218,145 Q208,165 212,195"/>
<ellipse class="cr" data-name="연기1" stroke-width="3" cx="178" cy="38" rx="22" ry="14"/>
<ellipse class="cr" data-name="연기2" stroke-width="3" cx="222" cy="32" rx="18" ry="12"/>
<path class="cr" data-name="바위" stroke-width="4" d="M58,280 Q88,262 118,278 Q148,262 178,278"/>
</g>` },
        { id: 'lightning', name: '번개', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="구름" stroke-width="5" cx="185" cy="108" rx="135" ry="72"/>
<circle stroke-width="4" cx="115" cy="108" r="48" fill="#fafafa"/>
<circle stroke-width="4" cx="165" cy="85" r="55" fill="#fafafa"/>
<circle stroke-width="4" cx="220" cy="98" r="48" fill="#fafafa"/>
<path class="cr" data-name="번개" stroke-width="6" d="M215,168 L175,228 L205,228 L158,295 L258,220 L218,220 Z"/>
</g>` },
        { id: 'rainbow', name: '무지개', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="빨간호" stroke-width="12" d="M35,248 Q35,62 200,62 Q365,62 365,248" fill="none"/>
<path class="cr" data-name="주황호" stroke-width="10" d="M58,248 Q58,88 200,88 Q342,88 342,248" fill="none"/>
<path class="cr" data-name="노란호" stroke-width="10" d="M78,248 Q78,112 200,112 Q322,112 322,248" fill="none"/>
<path class="cr" data-name="초록호" stroke-width="10" d="M98,248 Q98,135 200,135 Q302,135 302,248" fill="none"/>
<path class="cr" data-name="파란호" stroke-width="10" d="M118,248 Q118,158 200,158 Q282,158 282,248" fill="none"/>
<path class="cr" data-name="보라호" stroke-width="10" d="M138,248 Q138,180 200,180 Q262,180 262,248" fill="none"/>
<ellipse class="cr" data-name="구름왼" stroke-width="4" cx="65" cy="258" rx="48" ry="28"/>
<ellipse class="cr" data-name="구름오른" stroke-width="4" cx="335" cy="258" rx="48" ry="28"/>
</g>` },
        { id: 'waterfall', name: '폭포', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="왼절벽" stroke-width="5" x="42" y="42" width="88" height="255"/>
<rect class="cr" data-name="오른절벽" stroke-width="5" x="270" y="42" width="88" height="255"/>
<rect class="cr" data-name="물줄기" stroke-width="5" x="130" y="42" width="140" height="200"/>
<ellipse class="cr" data-name="물보라" stroke-width="4" cx="200" cy="255" rx="88" ry="35"/>
<path class="cr" data-name="물살1" stroke-width="3" d="M155,80 Q165,130 158,180 Q162,225 155,255" fill="none"/>
<path class="cr" data-name="물살2" stroke-width="3" d="M245,80 Q235,130 242,180 Q238,225 245,255" fill="none"/>
<rect class="cr" data-name="강물" stroke-width="4" x="42" y="278" width="316" height="25" rx="5"/>
</g>` },
        { id: 'leaf', name: '단풍잎', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="중앙잎" stroke-width="4" d="M200,278 L200,145 Q200,72 200,42 Q200,72 200,145 Z"/>
<path class="cr" data-name="왼쪽잎1" stroke-width="4" d="M200,145 Q165,128 138,95 Q118,72 115,48 Q138,65 162,95 Q185,122 200,145"/>
<path class="cr" data-name="오른쪽잎1" stroke-width="4" d="M200,145 Q235,128 262,95 Q282,72 285,48 Q262,65 238,95 Q215,122 200,145"/>
<path class="cr" data-name="왼쪽잎2" stroke-width="4" d="M200,175 Q155,162 118,138 Q88,118 75,95 Q105,108 138,132 Q168,155 200,175"/>
<path class="cr" data-name="오른쪽잎2" stroke-width="4" d="M200,175 Q245,162 282,138 Q312,118 325,95 Q295,108 262,132 Q232,155 200,175"/>
<path class="cr" data-name="왼쪽잎3" stroke-width="4" d="M200,215 Q145,205 105,185 Q72,168 58,148 Q88,155 122,175 Q162,198 200,215"/>
<path class="cr" data-name="오른쪽잎3" stroke-width="4" d="M200,215 Q255,205 295,185 Q328,168 342,148 Q312,155 278,175 Q238,198 200,215"/>
<line stroke-width="3" x1="200" y1="145" x2="200" y2="278"/>
</g>` }
      ]
    },
    {
      id: 'fashion', name: '옷패션', icon: '👕',
      images: [
        { id: 'tshirt', name: '티셔츠', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="왼소매" stroke-width="5" d="M115,68 L52,98 L72,155 L135,128 Z"/>
<path class="cr" data-name="오른소매" stroke-width="5" d="M285,68 L348,98 L328,155 L265,128 Z"/>
<path class="cr" data-name="몸통" stroke-width="5" d="M115,68 L115,292 L285,292 L285,68 Q250,52 240,68 Q225,90 200,90 Q175,90 160,68 Q150,52 115,68 Z"/>
<path class="cr" data-name="무늬" stroke-width="4" d="M158,168 Q200,195 242,168" fill="none"/>
<path class="cr" data-name="무늬2" stroke-width="4" d="M155,195 Q200,225 245,195" fill="none"/>
</g>` },
        { id: 'dress', name: '원피스', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="상의" stroke-width="5" d="M138,72 L138,168 L262,168 L262,72 Q248,52 240,58 Q228,75 200,75 Q172,75 160,58 Q152,52 138,72 Z"/>
<path class="cr" data-name="왼끈" stroke-width="5" d="M158,75 L148,42 Q152,35 162,38 L170,72"/>
<path class="cr" data-name="오른끈" stroke-width="5" d="M242,75 L252,42 Q248,35 238,38 L230,72"/>
<path class="cr" data-name="치마" stroke-width="5" d="M128,168 L75,292 L325,292 L272,168 Z"/>
<path class="cr" data-name="치마주름1" stroke-width="3" d="M155,168 L118,292" fill="none"/>
<path class="cr" data-name="치마주름2" stroke-width="3" d="M200,168 L200,292" fill="none"/>
<path class="cr" data-name="치마주름3" stroke-width="3" d="M245,168 L282,292" fill="none"/>
<path class="cr" data-name="허리띠" stroke-width="4" d="M128,165 L272,165 L272,180 L128,180 Z"/>
</g>` },
        { id: 'hat', name: '모자', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="모자통" stroke-width="5" d="M128,195 L145,72 L255,72 L272,195 Z"/>
<ellipse class="cr" data-name="챙" stroke-width="5" cx="200" cy="198" rx="128" ry="30"/>
<rect class="cr" data-name="밴드" stroke-width="4" x="128" y="172" width="144" height="28"/>
<ellipse class="cr" data-name="장식" stroke-width="4" cx="200" cy="75" rx="35" ry="18"/>
<path class="cr" data-name="무늬" stroke-width="3" d="M145,130 Q200,118 255,130 M148,150 Q200,138 252,150" fill="none"/>
</g>` },
        { id: 'shoes', name: '신발', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="신발왼발" stroke-width="5" d="M50,120 L50,225 Q50,255 85,262 L240,265 Q272,265 278,248 L278,215 Q278,205 265,202 L168,198 L168,120 Z"/>
<path class="cr" data-name="신발오른발" stroke-width="5" d="M225,120 L225,198 L310,198 Q338,198 348,218 L350,248 Q350,268 318,268 L168,268" fill="none" stroke-width="0"/>
<path class="cr" data-name="밑창왼" stroke-width="4" d="M50,248 L278,248 Q285,248 285,255 L285,262 Q285,268 278,268 L55,268 Q42,268 42,258 L42,250 Q42,248 50,248 Z"/>
<path class="cr" data-name="끈구멍" stroke-width="3" d="M88,148 L88,192 M108,145 L108,192 M128,142 L128,192 M148,140 L148,192"/>
<path class="cr" data-name="신발끈" stroke-width="3" d="M88,148 L108,155 L128,148 L148,155 L168,148 M88,168 L108,175 L128,168 L148,175 L168,168" fill="none"/>
</g>` },
        { id: 'bag', name: '가방', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="가방몸통" stroke-width="5" x="60" y="128" width="280" height="192" rx="18"/>
<path class="cr" data-name="손잡이" stroke-width="5" d="M128,128 L128,88 Q128,62 200,62 Q272,62 272,88 L272,128" fill="none"/>
<rect class="cr" data-name="앞주머니" stroke-width="4" x="90" y="190" width="220" height="100" rx="10"/>
<rect class="cr" data-name="지퍼" stroke-width="4" x="90" y="128" width="220" height="22" rx="8"/>
<circle class="cr" data-name="지퍼고리" stroke-width="3" cx="200" cy="139" r="10"/>
<rect class="cr" data-name="버클" stroke-width="3" x="180" y="188" width="40" height="22" rx="5"/>
</g>` },
        { id: 'jacket', name: '자켓', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="왼소매" stroke-width="5" d="M110,78 L48,108 L58,215 L118,205 Z"/>
<path class="cr" data-name="오른소매" stroke-width="5" d="M290,78 L352,108 L342,215 L282,205 Z"/>
<path class="cr" data-name="왼몸통" stroke-width="5" d="M110,78 L110,295 L195,295 L195,78 Q165,62 145,72 Z"/>
<path class="cr" data-name="오른몸통" stroke-width="5" d="M290,78 L290,295 L205,295 L205,78 Q235,62 255,72 Z"/>
<path class="cr" data-name="왼라펠" stroke-width="4" d="M145,72 L165,78 L195,145 L160,155 Z"/>
<path class="cr" data-name="오른라펠" stroke-width="4" d="M255,72 L235,78 L205,145 L240,155 Z"/>
<rect class="cr" data-name="주머니왼" stroke-width="3" x="115" y="220" width="65" height="38" rx="6"/>
<rect class="cr" data-name="주머니오른" stroke-width="3" x="220" y="220" width="65" height="38" rx="6"/>
<line stroke-width="4" x1="195" y1="145" x2="195" y2="295"/>
<line stroke-width="4" x1="205" y1="145" x2="205" y2="295"/>
</g>` },
        { id: 'sneakers', name: '운동화', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="신발밑창" stroke-width="5" d="M42,225 L42,258 Q88,275 200,272 Q312,270 358,258 L358,225 Z"/>
<path class="cr" data-name="신발몸통" stroke-width="5" d="M42,225 Q45,148 80,132 L280,132 Q325,132 358,175 L358,225 Z"/>
<path class="cr" data-name="발꿈치" stroke-width="4" d="M280,132 Q340,132 358,175 L358,225 L280,225 Z"/>
<path class="cr" data-name="혀" stroke-width="4" d="M80,132 Q88,112 128,108 L128,132 Z"/>
<path class="cr" data-name="끈1" stroke-width="4" d="M115,145 Q145,138 175,145"/>
<path class="cr" data-name="끈2" stroke-width="4" d="M108,162 Q145,155 182,162"/>
<path class="cr" data-name="끈3" stroke-width="4" d="M105,178 Q145,172 185,178"/>
<path class="cr" data-name="줄무늬" stroke-width="5" d="M198,132 Q248,122 298,135 Q280,162 242,168 Q208,165 198,145 Z"/>
</g>` },
        { id: 'hat', name: '모자', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="챙" stroke-width="5" cx="200" cy="195" rx="155" ry="32"/>
<path class="cr" data-name="모자통" stroke-width="5" d="M95,195 Q95,82 200,68 Q305,82 305,195 Z"/>
<rect class="cr" data-name="밴드" stroke-width="4" x="98" y="178" width="204" height="18"/>
<ellipse class="cr" data-name="장식" stroke-width="3" cx="200" cy="118" rx="25" ry="18"/>
</g>` },
        { id: 'glasses', name: '안경', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="왼렌즈" stroke-width="5" cx="138" cy="165" r="72"/>
<circle class="cr" data-name="오른렌즈" stroke-width="5" cx="262" cy="165" r="72"/>
<line stroke-width="5" x1="210" y1="165" x2="190" y2="165"/>
<line stroke-width="4" x1="42" y1="148" x2="66" y2="155"/>
<line stroke-width="4" x1="358" y1="148" x2="334" y2="155"/>
<ellipse class="cr" data-name="왼무늬" stroke-width="3" cx="118" cy="148" rx="25" ry="20"/>
<ellipse class="cr" data-name="오른무늬" stroke-width="3" cx="282" cy="148" rx="25" ry="20"/>
</g>` },
        { id: 'scarf', name: '목도리', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="몸통" stroke-width="5" d="M72,78 Q72,148 200,148 Q328,148 328,78 Q328,42 200,38 Q72,42 72,78 Z"/>
<path class="cr" data-name="늘어진부분" stroke-width="5" d="M148,148 Q138,195 115,248 Q105,278 108,295 L158,295 Q162,265 172,238 L200,148 Z"/>
<path class="cr" data-name="끝단술1" stroke-width="4" d="M108,295 L102,298 L108,305 L115,298 Z"/>
<path class="cr" data-name="끝단술2" stroke-width="4" d="M135,295 L129,298 L135,305 L142,298 Z"/>
<path class="cr" data-name="줄무늬1" stroke-width="5" d="M72,95 Q200,110 328,95"/>
<path class="cr" data-name="줄무늬2" stroke-width="5" d="M72,115 Q200,130 328,115"/>
<path class="cr" data-name="줄무늬3" stroke-width="4" d="M148,175 Q148,205 132,235"/>
</g>` },
        { id: 'handbag', name: '핸드백', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="몸통" stroke-width="5" x="65" y="145" width="270" height="168" rx="18"/>
<path class="cr" data-name="손잡이" stroke-width="5" d="M115,145 Q115,72 200,65 Q285,72 285,145"/>
<rect class="cr" data-name="앞장식" stroke-width="4" x="155" y="210" width="90" height="48" rx="10"/>
<rect class="cr" data-name="잠금장치" stroke-width="4" x="178" y="230" width="44" height="22" rx="8"/>
<line stroke-width="3" x1="65" y1="200" x2="335" y2="200"/>
</g>` },
        { id: 'socks', name: '양말', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="몸통" stroke-width="5" d="M135,38 L135,228 Q135,278 172,285 Q215,295 245,275 Q275,258 265,225 L238,225 Q245,248 228,258 Q208,268 188,258 Q168,248 165,225 L165,38 Z"/>
<rect class="cr" data-name="줄무늬1" stroke-width="4" x="135" y="72" width="30" height="15"/>
<rect class="cr" data-name="줄무늬2" stroke-width="4" x="135" y="102" width="30" height="15"/>
<rect class="cr" data-name="줄무늬3" stroke-width="4" x="135" y="132" width="30" height="15"/>
<path class="cr" data-name="발꿈치" stroke-width="4" d="M165,228 Q155,275 175,282 Q190,288 200,280"/>
<path class="cr" data-name="발앞" stroke-width="4" d="M238,228 Q252,250 245,270 Q228,285 200,280"/>
</g>` }
      ]
    },
    {
      id: 'toys', name: '장난감', icon: '🎮',
      images: [
        { id: 'robot', name: '로봇', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="머리" stroke-width="5" x="135" y="48" width="130" height="100" rx="14"/>
<rect class="cr" data-name="안테나기둥" stroke-width="4" x="194" y="28" width="12" height="25" rx="4"/>
<circle class="cr" data-name="안테나구슬" stroke-width="3" cx="200" cy="24" r="10"/>
<circle class="cr" data-name="눈1" stroke-width="4" cx="175" cy="90" r="20"/>
<circle class="cr" data-name="눈2" stroke-width="4" cx="225" cy="90" r="20"/>
<rect class="cr" data-name="입" stroke-width="3" x="158" y="122" width="84" height="16" rx="5"/>
<rect class="cr" data-name="몸통" stroke-width="5" x="120" y="158" width="160" height="130" rx="12"/>
<rect class="cr" data-name="배부품" stroke-width="3" x="145" y="180" width="110" height="65" rx="8"/>
<rect class="cr" data-name="왼팔" stroke-width="5" x="62" y="162" width="52" height="118" rx="16"/>
<rect class="cr" data-name="오른팔" stroke-width="5" x="286" y="162" width="52" height="118" rx="16"/>
<rect class="cr" data-name="왼다리" stroke-width="5" x="132" y="285" width="48" height="90" rx="12"/>
<rect class="cr" data-name="오른다리" stroke-width="5" x="220" y="285" width="48" height="90" rx="12"/>
</g>` },
        { id: 'rocket_toy', name: '로켓', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="동체" stroke-width="5" d="M200,35 Q240,35 255,88 L265,225 L135,225 L145,88 Q160,35 200,35 Z"/>
<path class="cr" data-name="머리" stroke-width="5" d="M145,88 Q148,50 200,32 Q252,50 255,88 Z"/>
<circle class="cr" data-name="창문" stroke-width="4" cx="200" cy="150" r="40"/>
<path class="cr" data-name="왼날개" stroke-width="4" d="M140,192 L95,258 L135,250 Z"/>
<path class="cr" data-name="오른날개" stroke-width="4" d="M260,192 L305,258 L265,250 Z"/>
<rect class="cr" data-name="노즐" stroke-width="4" x="175" y="222" width="50" height="25" rx="5"/>
<ellipse class="cr" data-name="불꽃" stroke-width="4" cx="200" cy="262" rx="32" ry="22"/>
<ellipse class="cr" data-name="불꽃2" stroke-width="3" cx="200" cy="272" rx="18" ry="14"/>
</g>` },
        { id: 'kite', name: '연', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<polygon class="cr" data-name="연왼위" stroke-width="4" points="200,42 108,148 200,148"/>
<polygon class="cr" data-name="연오른위" stroke-width="4" points="200,42 292,148 200,148"/>
<polygon class="cr" data-name="연왼아래" stroke-width="4" points="200,148 108,148 200,275"/>
<polygon class="cr" data-name="연오른아래" stroke-width="4" points="200,148 292,148 200,275"/>
<line stroke-width="4" x1="200" y1="42" x2="200" y2="275"/>
<line stroke-width="4" x1="108" y1="148" x2="292" y2="148"/>
<circle class="cr" data-name="가운데" stroke-width="3" cx="200" cy="148" r="14"/>
</g>` },
        { id: 'balloon', name: '풍선', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="풍선몸통" stroke-width="5" cx="200" cy="148" rx="110" ry="125"/>
<path class="cr" data-name="풍선끝" stroke-width="4" d="M188,272 L200,292 L212,272"/>
<path stroke-width="4" d="M200,292 Q220,315 210,342 Q205,358 200,368" fill="none"/>
<path class="cr" data-name="하이라이트1" stroke-width="3" d="M148,88 Q135,108 132,138" fill="none"/>
<path class="cr" data-name="하이라이트2" stroke-width="3" d="M162,75 Q155,82 152,92" fill="none"/>
<path class="cr" data-name="하트" stroke-width="3" d="M183,148 Q183,135 192,135 Q200,135 200,145 Q200,135 208,135 Q217,135 217,148 Q217,162 200,175 Q183,162 183,148 Z"/>
</g>` },
        { id: 'teddy', name: '곰인형', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="왼귀" stroke-width="4" cx="152" cy="70" r="32"/>
<circle class="cr" data-name="오른귀" stroke-width="4" cx="248" cy="70" r="32"/>
<circle stroke-width="3" cx="152" cy="70" r="18" fill="#fafafa"/>
<circle stroke-width="3" cx="248" cy="70" r="18" fill="#fafafa"/>
<circle class="cr" data-name="머리" stroke-width="5" cx="200" cy="115" r="75"/>
<ellipse class="cr" data-name="주둥이" stroke-width="4" cx="200" cy="135" rx="35" ry="26"/>
<circle stroke-width="3" cx="183" cy="105" r="12" fill="#1a1a1a"/>
<circle stroke-width="3" cx="217" cy="105" r="12" fill="#1a1a1a"/>
<ellipse class="cr" data-name="코" stroke-width="3" cx="200" cy="128" rx="11" ry="8"/>
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="200" cy="225" rx="82" ry="82"/>
<ellipse class="cr" data-name="배" stroke-width="3" cx="200" cy="228" rx="45" ry="45"/>
<circle class="cr" data-name="왼발" stroke-width="4" cx="145" cy="285" r="35"/>
<circle class="cr" data-name="오른발" stroke-width="4" cx="255" cy="285" r="35"/>
<ellipse class="cr" data-name="왼팔" stroke-width="4" cx="118" cy="205" rx="30" ry="48" transform="rotate(-20,118,205)"/>
<ellipse class="cr" data-name="오른팔" stroke-width="4" cx="282" cy="205" rx="30" ry="48" transform="rotate(20,282,205)"/>
</g>` },
        { id: 'ball', name: '공', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="공" stroke-width="5" cx="200" cy="165" r="128"/>
<path class="cr" data-name="무늬1" stroke-width="4" d="M82,108 Q148,148 200,165 Q258,185 318,145" fill="none"/>
<path class="cr" data-name="무늬2" stroke-width="4" d="M200,38 Q188,95 200,165 Q212,235 200,292" fill="none"/>
<path class="cr" data-name="무늬3" stroke-width="4" d="M95,248 Q148,205 200,165 Q252,125 305,82" fill="none"/>
</g>` },
        { id: 'kite2', name: '마름모연', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="왼위" stroke-width="4" d="M200,42 L88,165 L200,178 Z"/>
<path class="cr" data-name="오른위" stroke-width="4" d="M200,42 L312,165 L200,178 Z"/>
<path class="cr" data-name="왼아래" stroke-width="4" d="M88,165 L200,178 L200,288 Z"/>
<path class="cr" data-name="오른아래" stroke-width="4" d="M312,165 L200,178 L200,288 Z"/>
<line stroke-width="3" x1="200" y1="42" x2="200" y2="288"/>
<line stroke-width="3" x1="88" y1="165" x2="312" y2="165"/>
<circle class="cr" data-name="중심점" stroke-width="3" cx="200" cy="178" r="12"/>
</g>` },
        { id: 'top', name: '팽이', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="몸통" stroke-width="5" d="M82,105 Q82,48 200,42 Q318,48 318,105 L200,285 Z"/>
<ellipse class="cr" data-name="윗면" stroke-width="4" cx="200" cy="105" rx="118" ry="35"/>
<path class="cr" data-name="줄무늬1" stroke-width="5" d="M95,148 Q200,178 305,148"/>
<path class="cr" data-name="줄무늬2" stroke-width="4" d="M115,198 Q200,225 285,198"/>
<circle class="cr" data-name="꼭대기" stroke-width="4" cx="200" cy="62" r="22"/>
<ellipse stroke-width="3" cx="200" cy="285" rx="6" ry="4" fill="#1a1a1a"/>
</g>` },
        { id: 'drum', name: '북', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="윗면" stroke-width="5" cx="200" cy="148" rx="138" ry="48"/>
<path class="cr" data-name="몸통왼" stroke-width="5" d="M62,148 L62,212 Q62,265 200,265 Q338,265 338,212 L338,148"/>
<ellipse class="cr" data-name="아랫면" stroke-width="4" cx="200" cy="212" rx="138" ry="48"/>
<path class="cr" data-name="줄무늬1" stroke-width="4" d="M62,172 Q200,218 338,172"/>
<path class="cr" data-name="줄무늬2" stroke-width="4" d="M65,192 Q200,240 335,192"/>
<line stroke-width="5" x1="155" y1="95" x2="172" y2="148"/>
<line stroke-width="5" x1="245" y1="95" x2="228" y2="148"/>
<circle class="cr" data-name="채1" stroke-width="4" cx="148" cy="82" r="16"/>
<circle class="cr" data-name="채2" stroke-width="4" cx="252" cy="82" r="16"/>
</g>` },
        { id: 'puzzle', name: '퍼즐', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="조각1" stroke-width="4" x="62" y="62" width="128" height="128" rx="6"/>
<circle class="cr" data-name="연결1" stroke-width="3" cx="126" cy="190" r="16"/>
<rect class="cr" data-name="조각2" stroke-width="4" x="210" y="62" width="128" height="128" rx="6"/>
<circle class="cr" data-name="연결2" stroke-width="3" cx="210" cy="126" r="16"/>
<rect class="cr" data-name="조각3" stroke-width="4" x="62" y="210" width="128" height="128" rx="6"/>
<circle class="cr" data-name="연결3" stroke-width="3" cx="190" cy="210" r="16"/>
<rect class="cr" data-name="조각4" stroke-width="4" x="210" y="210" width="128" height="128" rx="6"/>
</g>` },
        { id: 'doll', name: '인형', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="머리" stroke-width="5" cx="200" cy="98" r="65"/>
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="200" cy="215" rx="65" ry="78"/>
<ellipse class="cr" data-name="왼팔" stroke-width="4" cx="128" cy="215" rx="25" ry="58" transform="rotate(-15,128,215)"/>
<ellipse class="cr" data-name="오른팔" stroke-width="4" cx="272" cy="215" rx="25" ry="58" transform="rotate(15,272,215)"/>
<circle class="cr" data-name="왼눈" stroke-width="4" cx="178" cy="88" r="12"/>
<circle class="cr" data-name="오른눈" stroke-width="4" cx="222" cy="88" r="12"/>
<path stroke-width="3" d="M180,118 Q200,132 220,118" fill="none"/>
<path class="cr" data-name="머리카락" stroke-width="5" d="M135,62 Q145,32 200,28 Q255,32 265,62"/>
</g>` },
        { id: 'blocks', name: '블록', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="앞면" stroke-width="5" x="88" y="148" width="165" height="152" rx="8"/>
<path class="cr" data-name="윗면" stroke-width="5" d="M88,148 L148,88 L315,88 L255,148 Z"/>
<path class="cr" data-name="오른면" stroke-width="5" d="M255,148 L315,88 L315,238 L255,298 Z"/>
<circle class="cr" data-name="스터드1" stroke-width="4" cx="138" cy="115" r="15"/>
<circle class="cr" data-name="스터드2" stroke-width="4" cx="198" cy="105" r="15"/>
<circle class="cr" data-name="스터드3" stroke-width="4" cx="258" cy="95" r="15"/>
<circle class="cr" data-name="스터드4" stroke-width="4" cx="148" cy="175" r="12"/>
<circle class="cr" data-name="스터드5" stroke-width="4" cx="220" cy="175" r="12"/>
</g>` }
      ]
    },
    {
      id: 'space', name: '우주판타지', icon: '🚀',
      images: [
        { id: 'rocket', name: '우주로켓', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<path class="cr" data-name="동체" stroke-width="5" d="M165,72 L155,242 L245,242 L235,72 Z"/>
<path class="cr" data-name="머리뿔" stroke-width="5" d="M165,72 Q165,28 200,18 Q235,28 235,72 Z"/>
<circle class="cr" data-name="창문" stroke-width="4" cx="200" cy="155" r="38"/>
<path class="cr" data-name="왼날개" stroke-width="4" d="M158,188 L100,258 L155,245 Z"/>
<path class="cr" data-name="오른날개" stroke-width="4" d="M242,188 L300,258 L245,245 Z"/>
<rect class="cr" data-name="노즐" stroke-width="4" x="178" y="240" width="44" height="22" rx="5"/>
<ellipse class="cr" data-name="불꽃큰" stroke-width="4" cx="200" cy="275" rx="30" ry="20"/>
<ellipse class="cr" data-name="불꽃작은" stroke-width="3" cx="200" cy="285" rx="16" ry="12"/>
<rect class="cr" data-name="창문테두리" stroke-width="3" x="165" y="72" width="70" height="30" rx="5"/>
</g>` },
        { id: 'earth', name: '지구', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="바다" stroke-width="5" cx="200" cy="155" r="128"/>
<path class="cr" data-name="대륙1" stroke-width="3" d="M148,65 Q122,78 108,105 Q95,132 105,158 Q115,185 148,195 Q172,205 190,198 Q210,192 218,178 Q228,162 222,145 Q215,128 200,118 Q182,105 178,88 Q175,72 148,65 Z"/>
<path class="cr" data-name="대륙2" stroke-width="3" d="M225,178 Q245,172 262,180 Q278,188 285,205 Q292,222 282,235 Q270,248 252,245 Q235,242 228,228 Q218,210 225,178 Z"/>
<path class="cr" data-name="대륙3" stroke-width="3" d="M110,218 Q128,228 138,245 Q128,258 110,252 Q92,248 88,232 Q88,218 110,218 Z"/>
<ellipse class="cr" data-name="북극" stroke-width="3" cx="200" cy="40" rx="48" ry="22"/>
<ellipse class="cr" data-name="남극" stroke-width="3" cx="200" cy="270" rx="42" ry="18"/>
</g>` },
        { id: 'ufo', name: 'UFO', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="하단접시" stroke-width="5" cx="200" cy="182" rx="155" ry="52"/>
<ellipse class="cr" data-name="상단돔" stroke-width="5" cx="200" cy="152" rx="90" ry="68"/>
<ellipse class="cr" data-name="조종석" stroke-width="4" cx="200" cy="140" rx="55" ry="42"/>
<circle class="cr" data-name="창문1" stroke-width="3" cx="162" cy="190" r="16"/>
<circle class="cr" data-name="창문2" stroke-width="3" cx="200" cy="194" r="16"/>
<circle class="cr" data-name="창문3" stroke-width="3" cx="238" cy="190" r="16"/>
<ellipse class="cr" data-name="빛줄기" stroke-width="4" cx="200" cy="255" rx="62" ry="38"/>
<line stroke-width="3" x1="155" y1="230" x2="138" y2="292"/>
<line stroke-width="3" x1="200" y1="233" x2="200" y2="292"/>
<line stroke-width="3" x1="245" y1="230" x2="262" y2="292"/>
</g>` },
        { id: 'dragon', name: '용', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="188" cy="198" rx="105" ry="80"/>
<circle class="cr" data-name="머리" stroke-width="5" cx="305" cy="122" r="62"/>
<path class="cr" data-name="목" stroke-width="6" d="M262,158 Q285,175 282,198" fill="none"/>
<polygon class="cr" data-name="뿔1" stroke-width="4" points="288,72 298,42 308,72"/>
<polygon class="cr" data-name="뿔2" stroke-width="4" points="312,78 328,52 338,82"/>
<circle class="cr" data-name="눈" stroke-width="3" cx="318" cy="112" r="12"/>
<ellipse class="cr" data-name="코" stroke-width="3" cx="348" cy="130" rx="10" ry="7"/>
<path class="cr" data-name="불꽃" stroke-width="4" d="M352,138 Q378,148 385,165 Q375,152 362,155 Q380,170 372,188 Q360,172 348,175" fill="none"/>
<path class="cr" data-name="왼날개" stroke-width="4" d="M148,148 Q95,88 68,105 Q88,145 108,165 Q78,162 62,185 Q95,188 128,172"/>
<path class="cr" data-name="오른날개" stroke-width="4" d="M205,135 Q215,75 252,65 Q245,105 235,128 Q262,112 285,120 Q265,145 240,148"/>
<path class="cr" data-name="꼬리" stroke-width="5" d="M92,245 Q52,262 40,295 Q55,285 68,292 Q58,312 78,318" fill="none"/>
<rect class="cr" data-name="앞발1" stroke-width="4" x="120" y="255" width="35" height="48" rx="12"/>
<rect class="cr" data-name="앞발2" stroke-width="4" x="165" y="258" width="35" height="48" rx="12"/>
<rect class="cr" data-name="뒷발1" stroke-width="4" x="218" y="255" width="35" height="48" rx="12"/>
<rect class="cr" data-name="뒷발2" stroke-width="4" x="262" y="252" width="35" height="48" rx="12"/>
</g>` },
        { id: 'unicorn', name: '유니콘', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="185" cy="195" rx="115" ry="82"/>
<circle class="cr" data-name="머리" stroke-width="5" cx="308" cy="135" r="58"/>
<path class="cr" data-name="목" stroke-width="6" d="M268,165 Q290,178 288,198" fill="none"/>
<path class="cr" data-name="뿔" stroke-width="4" d="M305,85 L318,38 L330,88 Z"/>
<ellipse class="cr" data-name="귀" stroke-width="3" cx="285" cy="88" rx="12" ry="22" transform="rotate(-15,285,88)"/>
<circle class="cr" data-name="눈" stroke-width="3" cx="322" cy="128" r="11"/>
<path class="cr" data-name="갈기1" stroke-width="4" d="M285,88 Q260,118 268,148" fill="none"/>
<path class="cr" data-name="갈기2" stroke-width="4" d="M295,80 Q268,112 275,145" fill="none"/>
<path class="cr" data-name="갈기3" stroke-width="4" d="M308,78 Q288,108 292,142" fill="none"/>
<path class="cr" data-name="꼬리" stroke-width="4" d="M78,185 Q48,172 40,145 Q55,165 72,168 Q48,148 55,118 Q68,142 82,148 Q65,125 75,98 Q88,125 95,142"/>
<rect class="cr" data-name="앞다리1" stroke-width="4" x="225" y="258" width="36" height="80" rx="12"/>
<rect class="cr" data-name="앞다리2" stroke-width="4" x="268" y="258" width="36" height="80" rx="12"/>
<rect class="cr" data-name="뒷다리1" stroke-width="4" x="108" y="258" width="36" height="80" rx="12"/>
<rect class="cr" data-name="뒷다리2" stroke-width="4" x="152" y="258" width="36" height="80" rx="12"/>
</g>` },
        { id: 'astronaut', name: '우주비행사', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="헬멧" stroke-width="5" cx="200" cy="108" r="82"/>
<ellipse class="cr" data-name="바이저" stroke-width="4" cx="205" cy="108" rx="52" ry="44"/>
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="200" cy="218" rx="80" ry="82"/>
<rect class="cr" data-name="배낭" stroke-width="4" x="128" y="155" width="50" height="72" rx="8"/>
<rect class="cr" data-name="가슴장치" stroke-width="4" x="162" y="185" width="76" height="55" rx="8"/>
<rect class="cr" data-name="왼팔" stroke-width="5" x="75" y="162" width="48" height="105" rx="18"/>
<rect class="cr" data-name="오른팔" stroke-width="5" x="277" y="162" width="48" height="105" rx="18"/>
<ellipse class="cr" data-name="왼장갑" stroke-width="4" cx="99" cy="275" rx="26" ry="18"/>
<ellipse class="cr" data-name="오른장갑" stroke-width="4" cx="301" cy="275" rx="26" ry="18"/>
<rect class="cr" data-name="왼다리" stroke-width="5" x="148" y="290" width="44" height="80" rx="12"/>
<rect class="cr" data-name="오른다리" stroke-width="5" x="208" y="290" width="44" height="80" rx="12"/>
</g>` },
        { id: 'planet', name: '행성', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="행성본체" stroke-width="5" cx="200" cy="165" r="105"/>
<path class="cr" data-name="고리" stroke-width="5" d="M62,142 Q148,115 338,188" fill="none"/>
<path class="cr" data-name="고리뒤" stroke-width="5" d="M75,178 Q165,205 325,150" fill="none"/>
<ellipse class="cr" data-name="대륙1" stroke-width="3" cx="165" cy="138" rx="38" ry="28"/>
<ellipse class="cr" data-name="대륙2" stroke-width="3" cx="232" cy="178" rx="32" ry="22"/>
<ellipse class="cr" data-name="대륙3" stroke-width="3" cx="188" cy="198" rx="25" ry="18"/>
</g>` },
        { id: 'ufo2', name: 'UFO2', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="본체" stroke-width="5" cx="200" cy="168" rx="148" ry="52"/>
<ellipse class="cr" data-name="돔" stroke-width="5" cx="200" cy="145" rx="78" ry="62"/>
<ellipse class="cr" data-name="빛테두리" stroke-width="3" cx="200" cy="215" rx="118" ry="22"/>
<circle class="cr" data-name="조명1" stroke-width="3" cx="130" cy="185" r="12"/>
<circle class="cr" data-name="조명2" stroke-width="3" cx="165" cy="195" r="12"/>
<circle class="cr" data-name="조명3" stroke-width="3" cx="200" cy="198" r="12"/>
<circle class="cr" data-name="조명4" stroke-width="3" cx="235" cy="195" r="12"/>
<circle class="cr" data-name="조명5" stroke-width="3" cx="270" cy="185" r="12"/>
</g>` },
        { id: 'fullmoon', name: '보름달', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="달본체" stroke-width="5" cx="200" cy="165" r="118"/>
<circle class="cr" data-name="크레이터1" stroke-width="4" cx="155" cy="128" r="32"/>
<circle class="cr" data-name="크레이터2" stroke-width="4" cx="238" cy="188" r="25"/>
<circle class="cr" data-name="크레이터3" stroke-width="3" cx="170" cy="215" r="18"/>
<circle class="cr" data-name="크레이터4" stroke-width="3" cx="248" cy="138" r="15"/>
<circle stroke-width="2" cx="155" cy="128" r="12" fill="#fafafa"/>
<circle stroke-width="2" cx="238" cy="188" r="10" fill="#fafafa"/>
</g>` },
        { id: 'satellite', name: '인공위성', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<rect class="cr" data-name="본체" stroke-width="5" x="155" y="128" width="90" height="68" rx="10"/>
<rect class="cr" data-name="왼패널" stroke-width="4" x="42" y="138" width="108" height="48" rx="6"/>
<rect class="cr" data-name="오른패널" stroke-width="4" x="250" y="138" width="108" height="48" rx="6"/>
<line stroke-width="4" x1="150" y1="162" x2="88" y2="162"/>
<line stroke-width="4" x1="250" y1="162" x2="312" y2="162"/>
<rect class="cr" data-name="안테나" stroke-width="3" x="195" y="88" width="10" height="45" rx="4"/>
<ellipse class="cr" data-name="접시" stroke-width="4" cx="200" cy="78" rx="32" ry="18"/>
<circle class="cr" data-name="창문" stroke-width="3" cx="200" cy="162" r="18"/>
</g>` },
        { id: 'alien', name: '외계인', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<ellipse class="cr" data-name="머리" stroke-width="5" cx="200" cy="108" rx="88" ry="78"/>
<ellipse class="cr" data-name="몸통" stroke-width="5" cx="200" cy="232" rx="58" ry="68"/>
<ellipse class="cr" data-name="왼눈" stroke-width="4" cx="162" cy="95" rx="32" ry="25"/>
<ellipse class="cr" data-name="오른눈" stroke-width="4" cx="238" cy="95" rx="32" ry="25"/>
<circle stroke-width="3" cx="165" cy="95" r="12" fill="#1a1a1a"/>
<circle stroke-width="3" cx="238" cy="95" r="12" fill="#1a1a1a"/>
<path class="cr" data-name="왼팔" stroke-width="4" d="M148,210 Q92,225 75,268 Q88,278 98,265 Q112,235 152,225"/>
<path class="cr" data-name="오른팔" stroke-width="4" d="M252,210 Q308,225 325,268 Q312,278 302,265 Q288,235 248,225"/>
<path stroke-width="3" d="M178,125 Q200,138 222,125" fill="none"/>
</g>` },
        { id: 'comet', name: '혜성', svg: `
<g stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round" fill="#fafafa">
<circle class="cr" data-name="핵" stroke-width="5" cx="285" cy="108" r="58"/>
<path class="cr" data-name="꼬리1" stroke-width="5" d="M238,82 Q148,95 42,72"/>
<path class="cr" data-name="꼬리2" stroke-width="5" d="M240,108 Q148,122 38,112"/>
<path class="cr" data-name="꼬리3" stroke-width="4" d="M242,135 Q158,155 52,162"/>
<ellipse class="cr" data-name="코마" stroke-width="4" cx="272" cy="108" rx="42" ry="38"/>
<ellipse class="cr" data-name="별1" stroke-width="3" cx="128" cy="58" rx="8" ry="8"/>
<ellipse class="cr" data-name="별2" stroke-width="3" cx="85" cy="185" rx="6" ry="6"/>
<ellipse class="cr" data-name="별3" stroke-width="3" cx="162" cy="215" rx="5" ry="5"/>
</g>` }
      ]
    }
  ]
};
