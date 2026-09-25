'use strict';
(function () {

/* ─── 상수 ─── */
const CHILD_NAME = '시윤';
const COLORS = ['#FF0000','#FF6B00','#FFD600','#00C853','#00B0FF','#7C4DFF','#FF4081','#FFFFFF','#A5D6A7','#80DEEA','#FFCC80','#B0BEC5'];
const COLOR_NAMES = ['빨강','주황','노랑','초록','파랑','보라','분홍','흰색','연두','하늘','살구','회색'];
const COMPLETION_THRESHOLD = 0.65;
const TRACING_TOLERANCE = 40;

/* ─── 상태 ─── */
let state = {
  category: 'vehicles',
  drawingId: null,
  svgEl: null,
  selectedColor: '#FF0000',
  mode: 'color', // 'color' | 'trace'
  colored: {},   // regionName → color
  history: [],   // undo stack [{regionName, prevColor}]
  tracePath: [],
  tracePoints: [],
  traceProgress: 0,
  particles: [],
  completed: false,
  gallery: [],
  bgmOn: true,
  voiceOn: true,
  childName: CHILD_NAME,
  parentMode: false,
};

/* ─── BGM (Web Audio API - 반짝반짝 작은별) ─── */
const BGM = (() => {
  let ctx = null, gainNode = null, playing = false;
  const BPM = 100;
  const BEAT = 60 / BPM;
  // C4 D4 E4 F4 G4 A4 B4 C5
  const NOTE = {C4:261.63,D4:293.66,E4:329.63,F4:349.23,G4:392,A4:440,B4:493.88,C5:523.25,_:0};
  // 반짝반짝 작은별 (멜로디)
  const MELODY = [
    ['C4',1],['C4',1],['G4',1],['G4',1],['A4',1],['A4',1],['G4',2],
    ['F4',1],['F4',1],['E4',1],['E4',1],['D4',1],['D4',1],['C4',2],
    ['G4',1],['G4',1],['F4',1],['F4',1],['E4',1],['E4',1],['D4',2],
    ['G4',1],['G4',1],['F4',1],['F4',1],['E4',1],['E4',1],['D4',2],
    ['C4',1],['C4',1],['G4',1],['G4',1],['A4',1],['A4',1],['G4',2],
    ['F4',1],['F4',1],['E4',1],['E4',1],['D4',1],['D4',1],['C4',2],
  ];
  let schedIdx = 0, nextTime = 0, loopTimer = null;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = ctx.createGain();
    gainNode.gain.value = 0.12;
    gainNode.connect(ctx.destination);
  }

  function scheduleNote(freq, dur) {
    if (!freq) { nextTime += dur * BEAT; return; }
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.9, nextTime);
    g.gain.exponentialRampToValueAtTime(0.01, nextTime + dur * BEAT - 0.05);
    osc.connect(g); g.connect(gainNode);
    osc.start(nextTime); osc.stop(nextTime + dur * BEAT);
    nextTime += dur * BEAT;
  }

  function scheduleBatch() {
    if (!ctx || !playing) return;
    while (nextTime < ctx.currentTime + 2) {
      const [n, d] = MELODY[schedIdx % MELODY.length];
      scheduleNote(NOTE[n], d);
      schedIdx++;
    }
    loopTimer = setTimeout(scheduleBatch, 500);
  }

  return {
    start() {
      if (!state.bgmOn) return;
      init();
      if (ctx.state === 'suspended') ctx.resume();
      if (playing) return;
      playing = true; schedIdx = 0; nextTime = ctx.currentTime + 0.1;
      scheduleBatch();
    },
    stop() { playing = false; clearTimeout(loopTimer); },
    toggle() {
      state.bgmOn = !state.bgmOn;
      state.bgmOn ? BGM.start() : BGM.stop();
      document.getElementById('btn-bgm').textContent = state.bgmOn ? '🎵' : '🔇';
    },
    setVolume(v) { if (gainNode) gainNode.gain.value = v; }
  };
})();

/* ─── 음성 (Web Speech API) ─── */
const VOICE = (() => {
  let voiceObj = null;
  function findVoice() {
    if (voiceObj) return voiceObj;
    const voices = speechSynthesis.getVoices();
    voiceObj = voices.find(v => v.lang === 'ko-KR' && v.name.includes('Male'))
      || voices.find(v => v.lang === 'ko-KR')
      || voices.find(v => v.lang.startsWith('ko'))
      || null;
    return voiceObj;
  }
  speechSynthesis.onvoiceschanged = () => { voiceObj = null; };

  return {
    say(text) {
      if (!state.voiceOn) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR';
      u.pitch = 0.85;
      u.rate = 0.82;
      u.volume = 1;
      const v = findVoice();
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    },
    greet(drawingName) {
      const msgs = [
        `${state.childName}아, 이번에는 ${drawingName}을 그려봐요!`,
        `${state.childName}아, ${drawingName} 색칠을 시작해볼까요?`,
        `와, ${drawingName}이에요! 예쁘게 색칠해봐요, ${state.childName}아!`,
      ];
      VOICE.say(msgs[Math.floor(Math.random() * msgs.length)]);
    },
    traceStart(drawingName) {
      VOICE.say(`${state.childName}아, ${drawingName} 선을 따라서 그려봐요. 잘 할 수 있어요!`);
    },
    regionDone(regionName) {
      const msgs = [
        `잘했어요! ${regionName} 색칠 완성!`,
        `와, 예쁘다! 계속해봐요!`,
        `대단해요, ${state.childName}아!`,
      ];
      VOICE.say(msgs[Math.floor(Math.random() * msgs.length)]);
    },
    complete() {
      const msgs = [
        `${state.childName}아, 참 잘했어요! 정말 멋진 그림이에요!`,
        `우와, 완성했어요! ${state.childName}이 최고야!`,
        `너무 잘했어요! ${state.childName}이 화가가 될 것 같아요!`,
      ];
      VOICE.say(msgs[Math.floor(Math.random() * msgs.length)]);
    },
    encourage() {
      const msgs = [
        `잘하고 있어요, ${state.childName}아!`,
        `조금만 더 하면 완성이에요!`,
        `멋진 그림이 되고 있어요!`,
      ];
      VOICE.say(msgs[Math.floor(Math.random() * msgs.length)]);
    }
  };
})();

/* ─── 파티클 ─── */
const PARTICLE = (() => {
  let canvas, ctx2, raf;
  return {
    init() {
      canvas = document.getElementById('particle-canvas');
      ctx2 = canvas.getContext('2d');
    },
    burst() {
      const W = canvas.width = window.innerWidth;
      const H = canvas.height = window.innerHeight;
      canvas.style.display = 'block';
      const particles = [];
      for (let i = 0; i < 120; i++) {
        particles.push({
          x: W * 0.5, y: H * 0.5,
          vx: (Math.random() - 0.5) * 18,
          vy: (Math.random() - 0.5) * 18 - 6,
          r: Math.random() * 8 + 4,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          life: 1,
          decay: Math.random() * 0.015 + 0.008
        });
      }
      function animate() {
        ctx2.clearRect(0, 0, W, H);
        let alive = false;
        particles.forEach(p => {
          if (p.life <= 0) return;
          alive = true;
          p.x += p.vx; p.y += p.vy; p.vy += 0.4;
          p.life -= p.decay;
          ctx2.globalAlpha = Math.max(0, p.life);
          ctx2.fillStyle = p.color;
          ctx2.beginPath();
          ctx2.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx2.fill();
        });
        ctx2.globalAlpha = 1;
        if (alive) raf = requestAnimationFrame(animate);
        else canvas.style.display = 'none';
      }
      cancelAnimationFrame(raf);
      animate();
    }
  };
})();

/* ─── SVG 색칠 엔진 ─── */
function injectSVG(data) {
  state.svgEl = null;
  state.colored = {};
  state.history = [];
  state.completed = false;
  const wrap = document.getElementById('svg-wrap');
  wrap.innerHTML = '';
  const parser = new DOMParser();
  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">${data.svg}</svg>`;
  const doc = parser.parseFromString(svgStr, 'image/svg+xml');
  const svg = doc.documentElement;
  svg.setAttribute('id', 'main-svg');

  // 색칠 가능 영역에 이벤트
  svg.querySelectorAll('.cr').forEach(el => {
    el.style.cursor = 'pointer';
    el.style.transition = 'filter 0.1s';
    el.addEventListener('click', onRegionClick);
    el.addEventListener('touchend', e => { e.preventDefault(); onRegionClick.call(el, e); });
  });

  wrap.appendChild(svg);
  state.svgEl = svg;
  updateProgress();
}

function onRegionClick(e) {
  if (state.mode !== 'color') return;
  e.stopPropagation();
  const el = e.currentTarget || this;
  const regionName = el.getAttribute('data-name') || '영역';
  const prev = el.getAttribute('fill') || '#fafafa';
  // undo 스택
  state.history.push({ el, prevColor: prev });
  if (state.history.length > 50) state.history.shift();

  el.setAttribute('fill', state.selectedColor);
  state.colored[regionName] = state.selectedColor;

  // 하이라이트 효과
  el.style.filter = 'brightness(1.3)';
  setTimeout(() => { el.style.filter = ''; }, 200);

  VOICE.regionDone(regionName);
  updateProgress();
  checkCompletion();
}

function undo() {
  if (!state.history.length) return;
  const { el, prevColor } = state.history.pop();
  const regionName = el.getAttribute('data-name') || '영역';
  el.setAttribute('fill', prevColor);
  delete state.colored[regionName];
  updateProgress();
}

function updateProgress() {
  if (!state.svgEl) return;
  const total = state.svgEl.querySelectorAll('.cr').length;
  const done = Object.keys(state.colored).length;
  const pct = total ? Math.min(100, Math.round(done / total * 100)) : 0;
  const bar = document.getElementById('progress-bar');
  const label = document.getElementById('progress-label');
  if (bar) bar.style.width = pct + '%';
  if (label) label.textContent = `${pct}%`;

  // 50% 이상일 때 가끔 격려
  if (pct >= 50 && pct < 90 && Math.random() < 0.08) VOICE.encourage();
}

function checkCompletion() {
  if (!state.svgEl || state.completed) return;
  const total = state.svgEl.querySelectorAll('.cr').length;
  const done = Object.keys(state.colored).length;
  if (total > 0 && done / total >= COMPLETION_THRESHOLD) {
    state.completed = true;
    setTimeout(() => {
      VOICE.complete();
      PARTICLE.burst();
      showCompletionModal();
    }, 300);
  }
}

function showCompletionModal() {
  const modal = document.getElementById('completion-modal');
  if (modal) modal.classList.add('show');
}

function hideCompletionModal() {
  const modal = document.getElementById('completion-modal');
  if (modal) modal.classList.remove('show');
}

/* ─── 트레이싱 시스템 ─── */
const TRACE = (() => {
  let canvas, ctx2, isDrawing = false, lastX, lastY;
  let traceImg = null;

  function initCanvas() {
    canvas = document.getElementById('trace-canvas');
    ctx2 = canvas.getContext('2d');
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('mouseleave', end);
    canvas.addEventListener('touchstart', e => { e.preventDefault(); start(e.touches[0]); }, {passive:false});
    canvas.addEventListener('touchmove', e => { e.preventDefault(); move(e.touches[0]); }, {passive:false});
    canvas.addEventListener('touchend', e => { e.preventDefault(); end(); }, {passive:false});
  }

  function resize() {
    if (!canvas) return;
    const wrap = document.getElementById('svg-wrap');
    const rect = wrap.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    drawGuide();
  }

  function drawGuide() {
    if (!state.svgEl || !ctx2) return;
    ctx2.clearRect(0, 0, canvas.width, canvas.height);
    ctx2.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx2.lineWidth = 4;
    ctx2.setLineDash([]);
    // SVG를 이미지로 렌더링하여 가이드 표시
    const svgData = new XMLSerializer().serializeToString(state.svgEl);
    const blob = new Blob([svgData], {type:'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      ctx2.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e) {
    if (state.mode !== 'trace') return;
    isDrawing = true;
    const {x, y} = getPos(e);
    lastX = x; lastY = y;
    state.tracePoints = [{x, y}];
    ctx2.beginPath();
    ctx2.moveTo(x, y);
  }

  function move(e) {
    if (!isDrawing || state.mode !== 'trace') return;
    const {x, y} = getPos(e);
    ctx2.strokeStyle = state.selectedColor;
    ctx2.lineWidth = 6;
    ctx2.lineCap = 'round';
    ctx2.lineJoin = 'round';
    ctx2.lineTo(x, y);
    ctx2.stroke();
    ctx2.beginPath();
    ctx2.moveTo(x, y);
    state.tracePoints.push({x, y});
    lastX = x; lastY = y;
  }

  function end() {
    if (!isDrawing) return;
    isDrawing = false;
    if (state.tracePoints.length > 5) {
      VOICE.regionDone('선');
    }
  }

  function clearTrace() {
    if (ctx2) ctx2.clearRect(0, 0, canvas.width, canvas.height);
    if (state.mode === 'trace') drawGuide();
    state.tracePoints = [];
  }

  return { initCanvas, resize, drawGuide, clearTrace };
})();

/* ─── 저장 & 인쇄 ─── */
async function saveAsPNG() {
  if (!state.svgEl) return;
  const canvas = document.createElement('canvas');
  canvas.width = 800; canvas.height = 600;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 800, 600);

  const svgData = new XMLSerializer().serializeToString(state.svgEl);
  const blob = new Blob([svgData], {type:'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  await new Promise(res => {
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0, 800, 600); res(); URL.revokeObjectURL(url); };
    img.src = url;
  });

  // 날짜 워터마크
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.font = '18px sans-serif';
  const now = new Date();
  ctx.fillText(`${state.childName}의 작품 · ${now.getFullYear()}.${now.getMonth()+1}.${now.getDate()}`, 12, 30);

  const a = document.createElement('a');
  const drawingName = getCurrentDrawingName();
  a.download = `${state.childName}_${drawingName}_${Date.now()}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();

  // 갤러리 저장
  addToGallery(canvas.toDataURL('image/png'), drawingName);
  VOICE.say(`${state.childName}의 그림을 저장했어요!`);
}

function printDrawing() {
  if (!state.svgEl) return;
  const svgData = new XMLSerializer().serializeToString(state.svgEl);
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>${state.childName}의 그림</title>
  <style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh}svg{max-width:90vw;max-height:90vh}</style></head>
  <body>${svgData}<script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`);
  win.document.close();
}

/* ─── 갤러리 ─── */
function addToGallery(dataUrl, name) {
  state.gallery.unshift({ dataUrl, name, date: new Date().toLocaleDateString('ko-KR') });
  if (state.gallery.length > 12) state.gallery.pop();
  renderGallery();
}

function renderGallery() {
  const wrap = document.getElementById('gallery-wrap');
  if (!wrap) return;
  if (!state.gallery.length) { wrap.innerHTML = '<p class="no-gallery">아직 저장된 그림이 없어요</p>'; return; }
  wrap.innerHTML = state.gallery.map((g, i) => `
    <div class="gallery-item" onclick="window.DrawingApp.galleryView(${i})">
      <img src="${g.dataUrl}" alt="${g.name}">
      <span>${g.name}</span>
      <small>${g.date}</small>
    </div>
  `).join('');
}

function galleryView(i) {
  const g = state.gallery[i];
  if (!g) return;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${g.name}</title>
  <style>body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:95vw;max-height:95vh;border-radius:12px}</style></head>
  <body><img src="${g.dataUrl}"></body></html>`);
  w.document.close();
}

/* ─── 이미지 선택 ─── */
function getCurrentDrawingName() {
  if (!state.drawingId || !DRAWING_DATA[state.category]) return '그림';
  const d = DRAWING_DATA[state.category].find(x => x.id === state.drawingId);
  return d ? d.name : '그림';
}

function selectDrawing(categoryKey, drawingId) {
  if (!DRAWING_DATA[categoryKey]) return;
  const data = DRAWING_DATA[categoryKey].find(x => x.id === drawingId);
  if (!data) return;
  state.category = categoryKey;
  state.drawingId = drawingId;
  state.mode = 'color';
  injectSVG(data);
  TRACE.clearTrace();
  hideImagePanel();
  VOICE.greet(data.name);
  updateModeButtons();
  hideCompletionModal();
}

/* ─── UI 이미지 패널 ─── */
function showImagePanel(categoryKey) {
  state.category = categoryKey;
  const panel = document.getElementById('image-panel');
  const title = document.getElementById('image-panel-title');
  const grid = document.getElementById('image-grid');
  const cat = CATEGORY_META[categoryKey];
  if (!cat || !DRAWING_DATA[categoryKey]) return;
  title.textContent = cat.label;
  grid.innerHTML = DRAWING_DATA[categoryKey].map(d => `
    <button class="thumb-btn" onclick="window.DrawingApp.selectDrawing('${categoryKey}','${d.id}')">
      <svg viewBox="0 0 400 300" width="80" height="60" xmlns="http://www.w3.org/2000/svg">${d.svg}</svg>
      <span>${d.name}</span>
    </button>
  `).join('');
  panel.classList.add('show');
}

function hideImagePanel() {
  document.getElementById('image-panel').classList.remove('show');
}

/* ─── 카테고리 메타 ─── */
const CATEGORY_META = {
  vehicles:  { label:'🚗 탈것',   icon:'🚗' },
  animals:   { label:'🐶 동물',   icon:'🐶' },
  buildings: { label:'🏠 건물',   icon:'🏠' },
  food:      { label:'🍕 음식',   icon:'🍕' },
  plants:    { label:'🌻 식물',   icon:'🌻' },
  household: { label:'📺 사물',   icon:'📺' },
  nature:    { label:'☀️ 자연',   icon:'☀️' },
  fashion:   { label:'👗 패션',   icon:'👗' },
  toys:      { label:'🎮 장난감', icon:'🎮' },
  space:     { label:'🚀 우주',   icon:'🚀' },
};

/* ─── 색상 팔레트 렌더 ─── */
function renderPalette() {
  const wrap = document.getElementById('palette');
  wrap.innerHTML = COLORS.map((c, i) => `
    <button class="color-btn${c === state.selectedColor ? ' active' : ''}"
      style="background:${c};${c==='#FFFFFF'?'border:2px solid #ccc':''}"
      title="${COLOR_NAMES[i]}"
      onclick="window.DrawingApp.selectColor('${c}')">
    </button>
  `).join('');
}

function selectColor(hex) {
  state.selectedColor = hex;
  renderPalette();
}

/* ─── 모드 전환 ─── */
function setMode(m) {
  state.mode = m;
  const traceCanvas = document.getElementById('trace-canvas');
  if (m === 'trace') {
    traceCanvas.style.display = 'block';
    TRACE.resize();
    TRACE.drawGuide();
    VOICE.traceStart(getCurrentDrawingName());
  } else {
    traceCanvas.style.display = 'none';
  }
  updateModeButtons();
}

function updateModeButtons() {
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('btn-mode-' + state.mode);
  if (btn) btn.classList.add('active');
}

/* ─── 카테고리 탭 렌더 ─── */
function renderCategories() {
  const wrap = document.getElementById('category-tabs');
  wrap.innerHTML = Object.entries(CATEGORY_META).map(([k, v]) => `
    <button class="cat-btn" onclick="window.DrawingApp.showImagePanel('${k}')" title="${v.label}">
      <span class="cat-icon">${v.icon}</span>
      <span class="cat-label">${v.label.split(' ')[1]}</span>
    </button>
  `).join('');
}

/* ─── 부모 설정 ─── */
function openParentModal() {
  const modal = document.getElementById('parent-modal');
  document.getElementById('setting-child-name').value = state.childName;
  document.getElementById('setting-bgm-vol').value = '12';
  document.getElementById('setting-voice').checked = state.voiceOn;
  modal.classList.add('show');
}
function closeParentModal() {
  document.getElementById('parent-modal').classList.remove('show');
}
function saveParentSettings() {
  const name = document.getElementById('setting-child-name').value.trim();
  if (name) state.childName = name;
  const vol = parseInt(document.getElementById('setting-bgm-vol').value) / 100;
  BGM.setVolume(vol);
  state.voiceOn = document.getElementById('setting-voice').checked;
  closeParentModal();
  VOICE.say(`안녕하세요, ${state.childName}아! 같이 그림 그려봐요!`);
}

/* ─── 하이라이트 힌트 ─── */
let hintTimer = null;
function showHint() {
  if (!state.svgEl) return;
  const uncolored = Array.from(state.svgEl.querySelectorAll('.cr')).filter(el => {
    const f = el.getAttribute('fill');
    return !f || f === '#fafafa' || f === 'none';
  });
  if (!uncolored.length) return;
  const target = uncolored[Math.floor(Math.random() * Math.min(3, uncolored.length))];
  target.style.filter = 'brightness(0.75) saturate(2)';
  target.style.transition = 'filter 0.3s';
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { target.style.filter = ''; }, 1200);
  VOICE.say(`${target.getAttribute('data-name') || '이 부분'}을 색칠해봐요!`);
}

/* ─── 초기화 ─── */
function init() {
  renderPalette();
  renderCategories();
  PARTICLE.init();
  TRACE.initCanvas();
  renderGallery();
  window.addEventListener('resize', () => { TRACE.resize(); });

  // BGM 최초 클릭 시작 (autoplay 정책)
  document.addEventListener('click', () => { BGM.start(); }, { once: true });
  document.addEventListener('touchstart', () => { BGM.start(); }, { once: true });

  // 완성 모달 닫기
  document.getElementById('modal-close-btn').addEventListener('click', () => {
    hideCompletionModal();
    // 세션 갤러리에 자동 저장
    saveAsPNG();
  });

  // 자동 힌트 (60초마다)
  setInterval(() => {
    if (state.svgEl && !state.completed && Object.keys(state.colored).length > 0) showHint();
  }, 60000);

  VOICE.say(`안녕하세요, ${state.childName}아! 같이 재미있는 그림 그려봐요!`);
}

/* ─── Public API ─── */
window.DrawingApp = {
  selectDrawing,
  selectColor,
  showImagePanel,
  hideImagePanel,
  setMode,
  undo,
  saveAsPNG,
  printDrawing,
  showHint,
  openParentModal,
  closeParentModal,
  saveParentSettings,
  toggleBGM: BGM.toggle,
  galleryView,
  init,
};

document.addEventListener('DOMContentLoaded', init);

})();
