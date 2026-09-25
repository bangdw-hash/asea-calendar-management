'use strict';
(function () {

/* ─── 상수 ─── */
const CHILD_NAME = '시윤';
const COLORS = ['#FF0000','#FF6B00','#FFD600','#00C853','#00B0FF','#7C4DFF','#FF4081','#FFFFFF','#A5D6A7','#80DEEA','#FFCC80','#B0BEC5'];
const COLOR_NAMES = ['빨강','주황','노랑','초록','파랑','보라','분홍','흰색','연두','하늘','살구','회색'];
const THRESHOLD = 0.65;

const PEN_TYPES = [
  { id: 'pencil', label: '연필', icon: '✏️', cap: 'round',  alpha: 0.72, widthMul: 1.0 },
  { id: 'brush',  label: '붓',   icon: '🖌️', cap: 'round',  alpha: 0.88, widthMul: 1.7 },
  { id: 'marker', label: '마커', icon: '🖊️', cap: 'square', alpha: 0.92, widthMul: 2.1 },
  { id: 'crayon', label: '크레용', icon: '🖍️', cap: 'round', alpha: 0.62, widthMul: 1.45 },
];
const PEN_SIZES = [
  { id: 'S', label: '얇게', px: 3 },
  { id: 'M', label: '보통', px: 7 },
  { id: 'L', label: '굵게', px: 14 },
];

/* ─── 데이터 정규화 ─── */
// drawing-data.js: DRAWING_DATA = { categories:[{id,name,icon,images:[{id,name,svg}]}] }
const DATA = {};   // DATA['vehicles'] = [{id,name,svg},...]
const CAT_LIST = []; // [{id,name,icon,count}]
function buildDataMap() {
  if (!window.DRAWING_DATA && typeof DRAWING_DATA === 'undefined') return;
  const src = (typeof DRAWING_DATA !== 'undefined') ? DRAWING_DATA : window.DRAWING_DATA;
  const cats = (src && src.categories) ? src.categories : [];
  cats.forEach(cat => {
    const imgs = cat.images || [];
    DATA[cat.id] = imgs;
    CAT_LIST.push({ id: cat.id, name: cat.name, icon: cat.icon || '🎨', count: imgs.length });
  });
}

/* ─── 상태 ─── */
let state = {
  category: null,
  drawingId: null,
  drawingName: '',
  svgEl: null,
  selectedColor: '#FF0000',
  mode: 'color',
  colored: {},
  history: [],
  completed: false,
  gallery: [],
  bgmOn: true,
  voiceOn: true,
  childName: CHILD_NAME,
  penType: 'pencil',
  penSize: 'M',
};

/* ─── BGM ─── */
const BGM = (() => {
  let ctx = null, gainNode = null, playing = false;
  const BEAT = 60 / 100;
  const NOTE = {C4:261.63,D4:293.66,E4:329.63,F4:349.23,G4:392,A4:440,C5:523.25};
  const MELODY = [
    ['C4',1],['C4',1],['G4',1],['G4',1],['A4',1],['A4',1],['G4',2],
    ['F4',1],['F4',1],['E4',1],['E4',1],['D4',1],['D4',1],['C4',2],
    ['G4',1],['G4',1],['F4',1],['F4',1],['E4',1],['E4',1],['D4',2],
    ['G4',1],['G4',1],['F4',1],['F4',1],['E4',1],['E4',1],['D4',2],
    ['C4',1],['C4',1],['G4',1],['G4',1],['A4',1],['A4',1],['G4',2],
    ['F4',1],['F4',1],['E4',1],['E4',1],['D4',1],['D4',1],['C4',2],
  ];
  let idx = 0, nextT = 0, timer = null;
  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = ctx.createGain(); gainNode.gain.value = 0.12; gainNode.connect(ctx.destination);
  }
  function sched() {
    if (!ctx || !playing) return;
    while (nextT < ctx.currentTime + 2) {
      const [n, d] = MELODY[idx % MELODY.length];
      const freq = NOTE[n];
      if (freq) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.9, nextT);
        g.gain.exponentialRampToValueAtTime(0.01, nextT + d * BEAT - 0.05);
        o.connect(g); g.connect(gainNode);
        o.start(nextT); o.stop(nextT + d * BEAT);
      }
      nextT += d * BEAT; idx++;
    }
    timer = setTimeout(sched, 500);
  }
  return {
    start() {
      if (!state.bgmOn) return;
      init();
      if (ctx.state === 'suspended') ctx.resume();
      if (playing) return;
      playing = true; idx = 0; nextT = ctx.currentTime + 0.1; sched();
    },
    stop() { playing = false; clearTimeout(timer); },
    toggle() {
      state.bgmOn = !state.bgmOn;
      state.bgmOn ? BGM.start() : BGM.stop();
      document.getElementById('btn-bgm').textContent = state.bgmOn ? '🎵' : '🔇';
    },
    setVol(v) { if (gainNode) gainNode.gain.value = v; }
  };
})();

/* ─── 음성 ─── */
const VOICE = (() => {
  let vo = null;
  function getVoice() {
    if (vo) return vo;
    const list = speechSynthesis.getVoices();
    vo = list.find(v => v.lang === 'ko-KR' && /male/i.test(v.name))
      || list.find(v => v.lang === 'ko-KR')
      || list.find(v => v.lang.startsWith('ko')) || null;
    return vo;
  }
  speechSynthesis.onvoiceschanged = () => { vo = null; };
  function say(t) {
    if (!state.voiceOn) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'ko-KR'; u.pitch = 0.85; u.rate = 0.82; u.volume = 1;
    const v = getVoice(); if (v) u.voice = v;
    speechSynthesis.speak(u);
  }
  return {
    say,
    greet(name) {
      const m = [`${state.childName}아, 이번에는 ${name}을 그려봐요!`,
        `와, ${name}이에요! 예쁘게 색칠해봐요, ${state.childName}아!`,
        `${state.childName}아, ${name} 색칠 시작해요!`];
      say(m[Math.floor(Math.random() * m.length)]);
    },
    region(r) {
      const m = [`잘했어요! ${r} 완성!`, `와, 예쁘다! 계속해봐요!`, `대단해요, ${state.childName}아!`];
      say(m[Math.floor(Math.random() * m.length)]);
    },
    complete() {
      const m = [`${state.childName}아, 참 잘했어요! 정말 멋진 그림이에요!`,
        `우와, 완성했어요! ${state.childName}이 최고야!`,
        `너무 잘했어요! ${state.childName}이 진짜 화가예요!`];
      say(m[Math.floor(Math.random() * m.length)]);
    },
    encourage() {
      const m = [`잘하고 있어요, ${state.childName}아!`, `조금만 더!`, `멋진 그림이 되고 있어요!`];
      say(m[Math.floor(Math.random() * m.length)]);
    }
  };
})();

/* ─── 파티클 ─── */
const PARTICLE = (() => {
  let cvs, c2, raf;
  return {
    init() { cvs = document.getElementById('particle-canvas'); c2 = cvs.getContext('2d'); },
    burst() {
      const W = cvs.width = innerWidth, H = cvs.height = innerHeight;
      cvs.style.display = 'block';
      const pts = Array.from({length:120}, () => ({
        x:W/2, y:H/2,
        vx:(Math.random()-.5)*18, vy:(Math.random()-.5)*18-6,
        r:Math.random()*8+4,
        color:COLORS[Math.floor(Math.random()*COLORS.length)],
        life:1, decay:Math.random()*.015+.008
      }));
      function draw() {
        c2.clearRect(0,0,W,H);
        let alive=false;
        pts.forEach(p => {
          if(p.life<=0)return; alive=true;
          p.x+=p.vx; p.y+=p.vy; p.vy+=.4; p.life-=p.decay;
          c2.globalAlpha=Math.max(0,p.life);
          c2.fillStyle=p.color;
          c2.beginPath(); c2.arc(p.x,p.y,p.r,0,Math.PI*2); c2.fill();
        });
        c2.globalAlpha=1;
        if(alive) raf=requestAnimationFrame(draw); else cvs.style.display='none';
      }
      cancelAnimationFrame(raf); draw();
    }
  };
})();

/* ─── 화면 전환 ─── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const el = document.getElementById(id);
  el.classList.remove('hidden');
}

/* ─── 선택 화면 ─── */
function renderCategories() {
  document.getElementById('cat-grid').style.display = 'grid';
  document.getElementById('img-grid').style.display = 'none';
  document.getElementById('sel-title').textContent = '🎨 시윤이의 그림 그리기';
  document.getElementById('sel-sub').textContent = '어떤 그림을 그릴까요?';
  document.getElementById('btn-back-cat').classList.add('hidden');

  const wrap = document.getElementById('cat-grid');
  wrap.innerHTML = CAT_LIST.map(c => `
    <div class="cat-card" onclick="DrawingApp.showImages('${c.id}')">
      <span class="icon">${c.icon}</span>
      <span class="name">${c.name}</span>
      <span class="cnt">${c.count}가지</span>
    </div>
  `).join('');
}

function showImages(categoryId) {
  state.category = categoryId;
  const cat = CAT_LIST.find(c => c.id === categoryId);
  const images = DATA[categoryId] || [];

  document.getElementById('cat-grid').style.display = 'none';
  document.getElementById('img-grid').style.display = 'grid';
  document.getElementById('sel-title').textContent = `${cat ? cat.icon + ' ' + cat.name : categoryId}`;
  document.getElementById('sel-sub').textContent = '색칠할 그림을 골라봐요!';
  document.getElementById('btn-back-cat').classList.remove('hidden');

  const wrap = document.getElementById('img-grid');
  wrap.innerHTML = images.map(d => `
    <div class="img-card" onclick="DrawingApp.startDrawing('${categoryId}','${d.id}')">
      <svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">${d.svg}</svg>
      <span class="name">${d.name}</span>
    </div>
  `).join('');
}

function showCategories() {
  renderCategories();
}

/* ─── 그림판 시작 ─── */
function startDrawing(categoryId, drawingId) {
  const images = DATA[categoryId] || [];
  const data = images.find(d => d.id === drawingId);
  if (!data) return;

  state.category = categoryId;
  state.drawingId = drawingId;
  state.drawingName = data.name;
  state.colored = {};
  state.history = [];
  state.completed = false;
  state.mode = 'color';

  injectSVG(data);
  renderPalette();
  renderPenPanel();
  updateProgress();
  updateModeButtons();
  hideCompletionModal();

  // trace canvas 숨기기
  const tc = document.getElementById('trace-canvas');
  if (tc) tc.style.display = 'none';

  showScreen('screen-draw');
  BGM.start();
  setTimeout(() => VOICE.greet(data.name), 400);
}

function goToSelect() {
  showScreen('screen-select');
  BGM.stop();
}

/* ─── SVG 색칠 ─── */
function injectSVG(data) {
  state.svgEl = null;
  const wrap = document.getElementById('svg-wrap');
  wrap.innerHTML = '';
  const parser = new DOMParser();
  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">${data.svg}</svg>`;
  const doc = parser.parseFromString(svgStr, 'image/svg+xml');
  const svg = doc.documentElement;
  svg.setAttribute('id', 'main-svg');
  svg.querySelectorAll('.cr').forEach(el => {
    el.addEventListener('click', onRegionClick);
    el.addEventListener('touchend', e => { e.preventDefault(); onRegionClick.call(el, e); });
  });
  wrap.appendChild(svg);
  state.svgEl = svg;
}

function onRegionClick(e) {
  if (state.mode !== 'color') return;
  e.stopPropagation();
  const el = e.currentTarget || this;
  const rName = el.getAttribute('data-name') || '영역';
  const prev = el.getAttribute('fill') || '#fafafa';
  state.history.push({ el, prevColor: prev });
  if (state.history.length > 50) state.history.shift();
  el.setAttribute('fill', state.selectedColor);
  state.colored[rName] = state.selectedColor;
  el.style.filter = 'brightness(1.35)';
  setTimeout(() => { el.style.filter = ''; }, 180);
  VOICE.region(rName);
  updateProgress();
  checkCompletion();
}

function undo() {
  if (!state.history.length) return;
  const { el, prevColor } = state.history.pop();
  const rName = el.getAttribute('data-name') || '영역';
  el.setAttribute('fill', prevColor);
  delete state.colored[rName];
  updateProgress();
}

function updateProgress() {
  if (!state.svgEl) return;
  const total = state.svgEl.querySelectorAll('.cr').length;
  const done = Object.keys(state.colored).length;
  const pct = total ? Math.min(100, Math.round(done / total * 100)) : 0;
  const bar = document.getElementById('prog-bar');
  const lbl = document.getElementById('prog-pct');
  if (bar) bar.style.width = pct + '%';
  if (lbl) lbl.textContent = pct + '%';
  if (pct >= 50 && pct < 90 && Math.random() < 0.06) VOICE.encourage();
}

function checkCompletion() {
  if (!state.svgEl || state.completed) return;
  const total = state.svgEl.querySelectorAll('.cr').length;
  const done = Object.keys(state.colored).length;
  if (total > 0 && done / total >= THRESHOLD) {
    state.completed = true;
    setTimeout(() => {
      VOICE.complete();
      PARTICLE.burst();
      document.getElementById('cm-sub').textContent =
        `${state.childName}아, 정말 잘했어요! 멋진 ${state.drawingName}이에요! 👏`;
      document.getElementById('completion-modal').classList.add('show');
    }, 300);
  }
}

function hideCompletionModal() {
  document.getElementById('completion-modal').classList.remove('show');
}

function onComplete() {
  hideCompletionModal();
  saveAsPNG();
}

/* ─── 팔레트 ─── */
function renderPalette() {
  const wrap = document.getElementById('palette');
  if (!wrap) return;
  wrap.innerHTML = COLORS.map((c, i) => `
    <button class="cbtn${c===state.selectedColor?' active':''}"
      style="background:${c};${c==='#FFFFFF'?'border:2px solid #ccc':''}"
      title="${COLOR_NAMES[i]}"
      onclick="DrawingApp.selectColor('${c}')"></button>
  `).join('');
}

function selectColor(hex) {
  state.selectedColor = hex;
  renderPalette();
}

/* ─── 모드 전환 ─── */
function setMode(m) {
  state.mode = m;
  const tc = document.getElementById('trace-canvas');
  if (m === 'trace') {
    tc.style.display = 'block';
    resizeTrace();
    drawTraceGuide();
    VOICE.say(`${state.childName}아, 선을 따라서 그려봐요!`);
  } else {
    tc.style.display = 'none';
  }
  updateModeButtons();
}

function updateModeButtons() {
  ['color','trace'].forEach(m => {
    const b = document.getElementById('btn-mode-' + m);
    if (b) b.classList.toggle('active', state.mode === m);
  });
}

/* ─── 트레이싱 ─── */
let traceCtx = null, traceDrawing = false, traceLastX, traceLastY;

function initTrace() {
  const cvs = document.getElementById('trace-canvas');
  if (!cvs) return;
  traceCtx = cvs.getContext('2d');
  cvs.addEventListener('mousedown', tStart);
  cvs.addEventListener('mousemove', tMove);
  cvs.addEventListener('mouseup', tEnd);
  cvs.addEventListener('touchstart', e => { e.preventDefault(); tStart(e.touches[0]); }, {passive:false});
  cvs.addEventListener('touchmove', e => { e.preventDefault(); tMove(e.touches[0]); }, {passive:false});
  cvs.addEventListener('touchend', e => { e.preventDefault(); tEnd(); }, {passive:false});
}

function resizeTrace() {
  const cvs = document.getElementById('trace-canvas');
  const board = document.getElementById('drawing-board');
  const r = board.getBoundingClientRect();
  cvs.width = r.width; cvs.height = r.height;
}

function drawTraceGuide() {
  if (!state.svgEl || !traceCtx) return;
  const cvs = document.getElementById('trace-canvas');
  traceCtx.clearRect(0,0,cvs.width,cvs.height);
  const svgData = new XMLSerializer().serializeToString(state.svgEl);
  const blob = new Blob([svgData], {type:'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => { traceCtx.drawImage(img,0,0,cvs.width,cvs.height); URL.revokeObjectURL(url); };
  img.src = url;
}

function tPos(e) {
  const r = document.getElementById('trace-canvas').getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function tStart(e) { if(state.mode!=='trace')return; traceDrawing=true; const p=tPos(e); traceLastX=p.x; traceLastY=p.y; }
function tMove(e) {
  if(!traceDrawing||state.mode!=='trace')return;
  const p=tPos(e);
  const pt = PEN_TYPES.find(t=>t.id===state.penType) || PEN_TYPES[0];
  const ps = PEN_SIZES.find(s=>s.id===state.penSize) || PEN_SIZES[1];
  const lw = ps.px * pt.widthMul;

  traceCtx.strokeStyle = state.selectedColor;
  traceCtx.lineWidth = lw;
  traceCtx.lineCap = pt.cap;
  traceCtx.lineJoin = 'round';
  traceCtx.globalAlpha = pt.alpha;
  traceCtx.beginPath();
  traceCtx.moveTo(traceLastX, traceLastY);
  traceCtx.lineTo(p.x, p.y);
  traceCtx.stroke();

  // 크레용: 텍스처 레이어
  if (pt.id === 'crayon') {
    traceCtx.globalAlpha = 0.18;
    traceCtx.lineWidth = lw * 1.4;
    traceCtx.beginPath();
    traceCtx.moveTo(traceLastX + 1.5, traceLastY + 1.5);
    traceCtx.lineTo(p.x + 1.5, p.y + 1.5);
    traceCtx.stroke();
  }
  traceCtx.globalAlpha = 1;
  traceLastX=p.x; traceLastY=p.y;
}
function tEnd() { traceDrawing=false; }

/* ─── 펜 설정 ─── */
function setPenType(typeId) {
  state.penType = typeId;
  renderPenPanel();
  const pt = PEN_TYPES.find(t=>t.id===typeId);
  if (pt) VOICE.say(`${pt.label}으로 그려봐요!`);
}
function setPenSize(sizeId) {
  state.penSize = sizeId;
  renderPenPanel();
}
function renderPenPanel() {
  PEN_TYPES.forEach(pt => {
    const b = document.getElementById('ptype-' + pt.id);
    if (b) b.classList.toggle('active', state.penType === pt.id);
  });
  PEN_SIZES.forEach(ps => {
    const b = document.getElementById('psize-' + ps.id);
    if (b) b.classList.toggle('active', state.penSize === ps.id);
  });
}

/* ─── 힌트 ─── */
let hintT = null;
function showHint() {
  if (!state.svgEl) return;
  const els = Array.from(state.svgEl.querySelectorAll('.cr')).filter(el => {
    const f = el.getAttribute('fill'); return !f || f==='#fafafa' || f==='none';
  });
  if (!els.length) return;
  const t = els[Math.floor(Math.random() * Math.min(3, els.length))];
  t.style.filter = 'brightness(.7) saturate(2)';
  clearTimeout(hintT);
  hintT = setTimeout(() => { t.style.filter=''; }, 1200);
  VOICE.say(`${t.getAttribute('data-name')||'이 부분'}을 색칠해봐요!`);
}

/* ─── 저장 / 인쇄 ─── */
async function saveAsPNG() {
  if (!state.svgEl) return;
  const cvs = document.createElement('canvas');
  cvs.width = 800; cvs.height = 600;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,800,600);
  const svgData = new XMLSerializer().serializeToString(state.svgEl);
  const blob = new Blob([svgData], {type:'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  await new Promise(res => {
    const img = new Image();
    img.onload = () => { ctx.drawImage(img,0,0,800,600); res(); URL.revokeObjectURL(url); };
    img.src = url;
  });
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.font = '17px sans-serif';
  const d = new Date();
  ctx.fillText(`${state.childName}의 작품 · ${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()}`, 12, 28);
  const dataUrl = cvs.toDataURL('image/png');
  const a = document.createElement('a');
  a.download = `${state.childName}_${state.drawingName}_${Date.now()}.png`;
  a.href = dataUrl; a.click();
  addToGallery(dataUrl, state.drawingName);
  VOICE.say(`${state.childName}의 그림을 저장했어요!`);
}

function printDrawing() {
  if (!state.svgEl) return;
  const s = new XMLSerializer().serializeToString(state.svgEl);
  const w = window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${state.childName}의 그림</title>
  <style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh}svg{max-width:90vw;max-height:90vh}</style></head>
  <body>${s}<script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`);
  w.document.close();
}

/* ─── 갤러리 ─── */
function addToGallery(url, name) {
  state.gallery.unshift({ url, name, date: new Date().toLocaleDateString('ko-KR') });
  if (state.gallery.length > 12) state.gallery.pop();
  renderGallery();
}
function renderGallery() {
  const wrap = document.getElementById('draw-gallery');
  if (!wrap) return;
  wrap.innerHTML = state.gallery.map((g, i) => `
    <div class="gitem" onclick="window.open('${g.url}','_blank')" title="${g.name}">
      <img src="${g.url}" alt="${g.name}">
    </div>
  `).join('') || '<span style="font-size:11px;color:#94a3b8;padding:4px">아직 없어요</span>';
}

/* ─── 부모 설정 ─── */
function openParentModal() {
  document.getElementById('setting-name').value = state.childName;
  document.getElementById('setting-voice').checked = state.voiceOn;
  document.getElementById('parent-modal').classList.add('show');
}
function closeParentModal() {
  document.getElementById('parent-modal').classList.remove('show');
}
function saveParentSettings() {
  const n = document.getElementById('setting-name').value.trim();
  if (n) state.childName = n;
  BGM.setVol(parseInt(document.getElementById('setting-vol').value) / 100);
  state.voiceOn = document.getElementById('setting-voice').checked;
  closeParentModal();
  VOICE.say(`안녕, ${state.childName}아! 같이 그려봐요!`);
}

/* ─── 초기화 ─── */
function init() {
  buildDataMap();

  if (!CAT_LIST.length) {
    // drawing-data.js 로드 전 실행됐을 경우 재시도
    setTimeout(() => { buildDataMap(); renderCategories(); }, 100);
  }

  renderCategories();
  renderPalette();
  renderGallery();
  PARTICLE.init();
  initTrace();

  // BGM은 최초 터치/클릭 시 시작 (autoplay 정책)
  document.addEventListener('click', () => BGM.start(), { once: true });
  document.addEventListener('touchstart', () => BGM.start(), { once: true });

  window.addEventListener('resize', () => {
    if (state.mode === 'trace') { resizeTrace(); drawTraceGuide(); }
  });

  showScreen('screen-select');
  setTimeout(() => VOICE.say(`안녕하세요, ${state.childName}아! 좋아하는 그림을 골라봐요!`), 600);
}

/* ─── Public API ─── */
window.DrawingApp = {
  showImages, showCategories, startDrawing, goToSelect,
  selectColor, setMode, undo, showHint,
  setPenType, setPenSize,
  saveAsPNG, printDrawing,
  onComplete, hideCompletionModal,
  openParentModal, closeParentModal, saveParentSettings,
  toggleBGM: BGM.toggle,
};

document.addEventListener('DOMContentLoaded', init);

})();
