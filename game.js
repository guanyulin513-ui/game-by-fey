// ===== Canvas & UI =====
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const menuEl = document.getElementById("menu");
const gameUIEl = document.getElementById("gameUI");
const modeButtons = document.querySelectorAll(".mode-btn");
const startModeBtn = document.getElementById("startModeBtn");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const timeEl = document.getElementById("time");
const msgEl = document.getElementById("msg");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const speedSelect = document.getElementById("speed");

// ✅ 卡片最高分
const bestModernCardEl = document.getElementById("bestModernCard");
const bestClassicCardEl = document.getElementById("bestClassicCard");

// ✅ 浮水印
const watermarkEl = document.getElementById("watermark");
const menuCardEl = document.getElementById("menuCard");

// ✅ 觸控按鈕
const btnUp = document.getElementById("btnUp");
const btnDown = document.getElementById("btnDown");
const btnLeft = document.getElementById("btnLeft");
const btnRight = document.getElementById("btnRight");

// ===== Grid =====
const CELL = 24; // 480/24=20格
const COLS = canvas.width / CELL;
const ROWS = canvas.height / CELL;

// ===== Mode =====
let gameMode = null; // "modern" | "classic"
const MODES = {
  modern: { allowWrap: true, allowGold: true },
  classic: { allowWrap: false, allowGold: false }
};

// ===== Game state =====
let snake, dir, nextDir, food, score, running, loopId;

// Pause
let paused = false;

// Eat flash
let eatFlashFrames = 0;

// Audio
let audioCtx = null;

// Gold chance (modern only)
const goldChance = 0.12;

// Explosion particles
let particles = [];
let explosionAnimId = null;

// Death lock + GameOver overlay
let dead = false;
let showGameOver = false;

// ✅ Best scores separated by mode
let bestScores = { modern: 0, classic: 0 };

// ✅ 計時機制（mm:ss）
// 只在 running && !paused && !dead 時累積
let elapsedMs = 0;
let lastTimeStamp = null;
let timerUiId = null;

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${mm}:${ss}`;
}

function updateTimeUI() {
  if (!timeEl) return;
  timeEl.textContent = formatTime(elapsedMs);
}

function startTimerUI() {
  if (timerUiId) clearInterval(timerUiId);
  timerUiId = setInterval(() => updateTimeUI(), 200);
}

function stopTimerUI() {
  if (timerUiId) clearInterval(timerUiId);
  timerUiId = null;
}

// -------------------- 浮水印動畫（反彈 + 進入內容隱形） --------------------
(function initWatermarkBounce() {
  if (!watermarkEl) return;

  let x = 12;
  let y = 12;
  let vx = 0.9;
  let vy = 0.75;

  const visibleOpacity = 0.30;
  const hiddenOpacity = 0.0;

  watermarkEl.style.opacity = String(visibleOpacity);

  function rectIntersect(a, b) {
    return !(
      a.right < b.left ||
      a.left > b.right ||
      a.bottom < b.top ||
      a.top > b.bottom
    );
  }

  function getObstacleRects() {
    const rects = [];

    if (menuEl && !menuEl.classList.contains("hidden") && menuCardEl) {
      rects.push(menuCardEl.getBoundingClientRect());
    }

    if (gameUIEl && !gameUIEl.classList.contains("hidden")) {
      const panel = document.querySelector(".panel");
      const msg = document.getElementById("msg");
      const touchControls = document.querySelector(".touch-controls");

      if (panel) rects.push(panel.getBoundingClientRect());
      if (canvas) rects.push(canvas.getBoundingClientRect());
      if (msg) rects.push(msg.getBoundingClientRect());
      if (touchControls) rects.push(touchControls.getBoundingClientRect());
    }

    return rects;
  }

  function tick() {
    const wmRect = watermarkEl.getBoundingClientRect();
    const w = wmRect.width;
    const h = wmRect.height;

    const maxX = window.innerWidth - w;
    const maxY = window.innerHeight - h;

    x += vx;
    y += vy;

    if (x <= 0) { x = 0; vx *= -1; }
    if (y <= 0) { y = 0; vy *= -1; }
    if (x >= maxX) { x = maxX; vx *= -1; }
    if (y >= maxY) { y = maxY; vy *= -1; }

    watermarkEl.style.transform = `translate(${x}px, ${y}px)`;

    const nextRect = watermarkEl.getBoundingClientRect();
    const obstacles = getObstacleRects();
    let hitContent = false;
    for (const r of obstacles) {
      if (rectIntersect(nextRect, r)) { hitContent = true; break; }
    }
    watermarkEl.style.opacity = hitContent ? String(hiddenOpacity) : String(visibleOpacity);

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();

// -------------------- Best Score (Separated) --------------------
function bestKey(mode) {
  return mode === "classic" ? "snake_best_score_classic" : "snake_best_score_modern";
}

function loadBestScores() {
  const m = localStorage.getItem(bestKey("modern"));
  const c = localStorage.getItem(bestKey("classic"));
  bestScores.modern = m ? Number(m) : 0;
  bestScores.classic = c ? Number(c) : 0;

  updateCardBestLabels();
  updateBestDisplay();
}

function updateBestDisplay() {
  if (!gameMode) { bestEl.textContent = "0"; return; }
  bestEl.textContent = String(bestScores[gameMode] ?? 0);
}

function updateCardBestLabels() {
  if (bestModernCardEl) bestModernCardEl.textContent = String(bestScores.modern ?? 0);
  if (bestClassicCardEl) bestClassicCardEl.textContent = String(bestScores.classic ?? 0);
}

function saveBestScoreIfNeeded() {
  if (!gameMode) return;
  if (score > (bestScores[gameMode] ?? 0)) {
    bestScores[gameMode] = score;
    bestEl.textContent = String(score);
    localStorage.setItem(bestKey(gameMode), String(score));
    updateCardBestLabels();
  }
}

// =============== Menu Logic ===============
function setMenuSelected(mode) {
  modeButtons.forEach(b => b.classList.remove("selected"));
  const btn = Array.from(modeButtons).find(b => b.dataset.mode === mode);
  if (btn) btn.classList.add("selected");

  gameMode = mode;
  updateBestDisplay();
  startModeBtn.classList.remove("disabled");
}

function resetMenuUI() {
  modeButtons.forEach(b => b.classList.remove("selected"));
  gameMode = null;
  startModeBtn.classList.add("disabled");
  bestEl.textContent = "0";
}

modeButtons.forEach(btn => {
  btn.addEventListener("click", () => setMenuSelected(btn.dataset.mode));
});

startModeBtn.addEventListener("click", () => {
  if (!gameMode) return;

  menuEl.classList.add("hidden");
  gameUIEl.classList.remove("hidden");

  updateBestDisplay();
  restartCurrentMode(false);

  msgEl.textContent =
    "按「開始」或方向鍵/WASD開始｜觸控：按方向鍵或滑動畫布｜Space 暫停｜死亡後按任意鍵/點一下重開";
});

// 重新開始按鈕：回到模式選單
restartBtn.addEventListener("click", () => {
  stopAllLoopsAndAnims();
  menuEl.classList.remove("hidden");
  gameUIEl.classList.add("hidden");
  resetMenuUI();
  elapsedMs = 0;
  lastTimeStamp = null;
  updateTimeUI();
});

// -------------------- Audio --------------------
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playEatSoundNormal() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(650, now);
  osc.frequency.exponentialRampToValueAtTime(900, now + 0.06);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + 0.10);
}

function playEatSoundGold() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  const osc1 = audioCtx.createOscillator();
  const gain1 = audioCtx.createGain();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(880, now);

  gain1.gain.setValueAtTime(0.0001, now);
  gain1.gain.exponentialRampToValueAtTime(0.13, now + 0.01);
  gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.10);

  osc1.connect(gain1);
  gain1.connect(audioCtx.destination);

  osc1.start(now);
  osc1.stop(now + 0.12);

  const osc2 = audioCtx.createOscillator();
  const gain2 = audioCtx.createGain();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(1320, now + 0.06);

  gain2.gain.setValueAtTime(0.0001, now + 0.06);
  gain2.gain.exponentialRampToValueAtTime(0.11, now + 0.07);
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  osc2.connect(gain2);
  gain2.connect(audioCtx.destination);

  osc2.start(now + 0.06);
  osc2.stop(now + 0.18);
}

function playDeathSound() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "square";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.22);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(700, now);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + 0.30);
}

// -------------------- Utils --------------------
function randInt(n) { return Math.floor(Math.random() * n); }
function samePos(a, b) { return a.x === b.x && a.y === b.y; }

function stopAllLoopsAndAnims() {
  if (loopId) clearInterval(loopId);
  loopId = null;

  if (explosionAnimId) cancelAnimationFrame(explosionAnimId);
  explosionAnimId = null;

  particles = [];

  stopTimerUI();
}

function currentModeName() {
  return gameMode === "classic" ? "經典版" : "現代版";
}

// -------------------- Food --------------------
function spawnFood() {
  while (true) {
    const allowGold = gameMode && MODES[gameMode].allowGold;
    const f = {
      x: randInt(COLS),
      y: randInt(ROWS),
      type: allowGold && Math.random() < goldChance ? "gold" : "normal"
    };
    if (!snake.some(seg => samePos(seg, f))) return f;
  }
}

// -------------------- Reset / Start --------------------
function resetGame() {
  snake = [
    { x: 8, y: 10 },
    { x: 7, y: 10 },
    { x: 6, y: 10 }
  ];
  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };

  score = 0;
  scoreEl.textContent = score;

  food = spawnFood();
  running = false;
  paused = false;
  dead = false;
  showGameOver = false;
  eatFlashFrames = 0;

  // ✅ 重置計時
  elapsedMs = 0;
  lastTimeStamp = null;
  updateTimeUI();

  stopAllLoopsAndAnims();
  updateBestDisplay();

  msgEl.textContent =
    `${currentModeName()}｜鍵盤：方向鍵/WASD｜觸控：按方向鍵或滑動畫布｜Space暫停｜死亡後按任意鍵/點一下重開`;
}

function restartCurrentMode(autoStart) {
  if (!gameMode) return;
  stopAllLoopsAndAnims();
  resetGame();
  drawGameScene();
  if (autoStart) startMoveLoop();
}

// -------------------- Drawing --------------------
function drawGrid() {
  ctx.save();
  ctx.globalAlpha = 0.12;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(canvas.width, y * CELL);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEatFlashEffect() {
  if (eatFlashFrames <= 0) return;
  ctx.save();
  const alpha = eatFlashFrames * 0.12;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalAlpha = alpha * 1.2;
  ctx.lineWidth = 8;
  ctx.strokeStyle = "white";
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  ctx.restore();
  eatFlashFrames -= 1;
}

function drawGameOverText() {
  if (!showGameOver) return;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 56px system-ui, sans-serif";
  ctx.fillStyle = "red";
  ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2);
  ctx.font = "20px system-ui, sans-serif";
  ctx.fillStyle = "black";
  ctx.fillText("按任意鍵 / 點一下 重新開始", canvas.width / 2, canvas.height / 2 + 56);
  ctx.restore();
}

function drawPausedText() {
  if (!paused || !running || dead || showGameOver) return;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "black";
  ctx.font = "bold 48px system-ui, sans-serif";
  ctx.fillText("PAUSED", canvas.width / 2, canvas.height / 2);
  ctx.font = "18px system-ui, sans-serif";
  ctx.fillText("按 Space 繼續", canvas.width / 2, canvas.height / 2 + 44);
  ctx.restore();
}

function drawGameScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  ctx.fillStyle = food.type === "gold" ? "gold" : "tomato";
  ctx.fillRect(food.x * CELL, food.y * CELL, CELL, CELL);

  for (let i = 0; i < snake.length; i++) {
    ctx.fillStyle = i === 0 ? "#2b6cb0" : "#63b3ed";
    ctx.fillRect(snake[i].x * CELL, snake[i].y * CELL, CELL, CELL);
  }

  drawEatFlashEffect();
  drawGameOverText();
  drawPausedText();
}

// -------------------- Explosion --------------------
function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
    ctx.restore();
  }
}

function createExplosionFromSnake() {
  particles = [];
  const baseColors = ["#2b6cb0", "#63b3ed"];
  const piecesPerSegment = 6;
  const maxSegmentsUsed = 60;
  const useSnake = snake.slice(0, maxSegmentsUsed);

  for (let i = 0; i < useSnake.length; i++) {
    const seg = useSnake[i];
    const segPx = seg.x * CELL;
    const segPy = seg.y * CELL;

    for (let k = 0; k < piecesPerSegment; k++) {
      const size = 6 + Math.floor(Math.random() * 5);
      const x = segPx + Math.random() * (CELL - size);
      const y = segPy + Math.random() * (CELL - size);

      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - (1 + Math.random() * 2);

      const maxLife = 40 + Math.floor(Math.random() * 20);
      const color = i === 0 ? baseColors[0] : baseColors[1];
      particles.push({ x, y, vx, vy, size, life: maxLife, maxLife, color });
    }
  }
}

function startExplosionAnimation() {
  if (explosionAnimId) cancelAnimationFrame(explosionAnimId);
  const gravity = 0.18;
  const friction = 0.98;

  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    for (const p of particles) {
      p.vy += gravity;
      p.vx *= friction;
      p.vy *= friction;

      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) { p.x = 0; p.vx *= -0.6; }
      if (p.x > canvas.width - p.size) { p.x = canvas.width - p.size; p.vx *= -0.6; }
      if (p.y < 0) { p.y = 0; p.vy *= -0.6; }
      if (p.y > canvas.height - p.size) { p.y = canvas.height - p.size; p.vy *= -0.4; }

      p.life -= 1;
    }

    drawParticles();
    particles = particles.filter(p => p.life > 0);

    if (particles.length > 0) {
      explosionAnimId = requestAnimationFrame(frame);
    } else {
      explosionAnimId = null;
      showGameOver = true;
      drawGameScene();
    }
  }

  explosionAnimId = requestAnimationFrame(frame);
}

// -------------------- Game Logic --------------------
function hitSelf(head) {
  for (let i = 1; i < snake.length; i++) {
    if (samePos(head, snake[i])) return true;
  }
  return false;
}

function gameOver(reasonText) {
  running = false;
  dead = true;
  paused = false;

  if (loopId) clearInterval(loopId);
  loopId = null;

  saveBestScoreIfNeeded();

  ensureAudio();
  playDeathSound();

  createExplosionFromSnake();
  startExplosionAnimation();

  msgEl.textContent = `Game Over（${currentModeName()}）｜按任意鍵/點一下重開`;
  if (reasonText) msgEl.textContent += `｜${reasonText}`;
}

function step() {
  if (!running || dead) return;
  if (paused) return;

  // ✅ 累積遊戲時間（只在真正運行時）
  const now = performance.now();
  if (lastTimeStamp == null) lastTimeStamp = now;
  elapsedMs += (now - lastTimeStamp);
  lastTimeStamp = now;

  dir = nextDir;

  const head = snake[0];
  let newHead = { x: head.x + dir.x, y: head.y + dir.y };

  const allowWrap = MODES[gameMode].allowWrap;

  if (allowWrap) {
    if (newHead.x < 0) newHead.x = COLS - 1;
    if (newHead.x >= COLS) newHead.x = 0;
    if (newHead.y < 0) newHead.y = ROWS - 1;
    if (newHead.y >= ROWS) newHead.y = 0;
  } else {
    if (newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS) {
      gameOver("撞到牆壁");
      return;
    }
  }

  if (hitSelf(newHead)) {
    gameOver("撞到自己");
    return;
  }

  snake.unshift(newHead);

  if (samePos(newHead, food)) {
    ensureAudio();
    eatFlashFrames = 3;

    if (food.type === "gold") {
      score += 3;
      scoreEl.textContent = score;
      playEatSoundGold();

      const tail = snake[snake.length - 1];
      snake.push({ x: tail.x, y: tail.y });
      snake.push({ x: tail.x, y: tail.y });
    } else {
      score += 1;
      scoreEl.textContent = score;
      playEatSoundNormal();
    }

    food = spawnFood();
  } else {
    snake.pop();
  }

  drawGameScene();
}

function startMoveLoop() {
  if (!gameMode) return;
  ensureAudio();
  if (dead) return;

  paused = false;

  if (explosionAnimId) cancelAnimationFrame(explosionAnimId);
  explosionAnimId = null;
  particles = [];
  showGameOver = false;

  if (loopId) clearInterval(loopId);
  const speedMs = Number(speedSelect.value);
  loopId = setInterval(step, speedMs);
  running = true;

  // ✅ 計時：開始時更新時間戳 + 開 UI 更新
  lastTimeStamp = performance.now();
  startTimerUI();

  msgEl.textContent =
    `${currentModeName()} 遊戲中｜鍵盤：方向鍵/WASD｜觸控：按方向鍵或滑動畫布｜Space 暫停`;
}

function startGameBtn() {
  if (running) return;
  startMoveLoop();
}

startBtn.addEventListener("click", startGameBtn);

speedSelect.addEventListener("change", () => {
  if (running) startMoveLoop();
});

// -------------------- Input (Keyboard + Touch) --------------------
function isOpposite(a, b) {
  return a.x + b.x === 0 && a.y + b.y === 0;
}

function applyDir(newDir, autoStartIfNeeded) {
  if (dead) {
    restartCurrentMode(true);
    return;
  }
  if (paused) return;

  if (autoStartIfNeeded && !running) startMoveLoop();

  if (!isOpposite(dir, newDir)) {
    nextDir = newDir;
  }
  drawGameScene();
}

function keyToDir(e) {
  const k = e.key;
  if (k === "ArrowUp" || k === "w" || k === "W") return { x: 0, y: -1 };
  if (k === "ArrowDown" || k === "s" || k === "S") return { x: 0, y: 1 };
  if (k === "ArrowLeft" || k === "a" || k === "A") return { x: -1, y: 0 };
  if (k === "ArrowRight" || k === "d" || k === "D") return { x: 1, y: 0 };
  return null;
}

// Keyboard
window.addEventListener("keydown", (e) => {
  if (gameUIEl.classList.contains("hidden")) return;

  if (dead) {
    restartCurrentMode(true);
    e.preventDefault();
    return;
  }

  // Space pause
  if (e.code === "Space") {
    if (!running) return;
    paused = !paused;

    // ✅ 從暫停回來，避免把暫停時間算進去
    if (!paused) lastTimeStamp = performance.now();

    msgEl.textContent = paused
      ? `⏸ 已暫停（按 Space 繼續）｜${currentModeName()}`
      : `▶ 已繼續｜${currentModeName()}`;
    drawGameScene();
    e.preventDefault();
    return;
  }

  if (paused) {
    if (e.key.startsWith("Arrow") || ["w","a","s","d","W","A","S","D"].includes(e.key)) {
      e.preventDefault();
    }
    return;
  }

  const newDir = keyToDir(e);
  if (!newDir) return;

  applyDir(newDir, true);
  e.preventDefault();
});

// Touch D-pad buttons
function bindTouchButton(btn, dirObj) {
  if (!btn) return;
  btn.addEventListener("pointerdown", (e) => {
    if (gameUIEl.classList.contains("hidden")) return;

    ensureAudio();
    applyDir(dirObj, true);

    e.preventDefault();
  });
}

bindTouchButton(btnUp, { x: 0, y: -1 });
bindTouchButton(btnDown, { x: 0, y: 1 });
bindTouchButton(btnLeft, { x: -1, y: 0 });
bindTouchButton(btnRight, { x: 1, y: 0 });

// Touch swipe on canvas
let swipeStart = null;

canvas.addEventListener("pointerdown", (e) => {
  if (gameUIEl.classList.contains("hidden")) return;

  if (dead) {
    ensureAudio();
    restartCurrentMode(true);
    e.preventDefault();
    return;
  }

  swipeStart = { x: e.clientX, y: e.clientY };

  // 點一下畫布可開始（不改方向）
  if (!running && !paused) {
    ensureAudio();
    startMoveLoop();
  }

  e.preventDefault();
});

canvas.addEventListener("pointerup", (e) => {
  if (!swipeStart) return;

  const dx = e.clientX - swipeStart.x;
  const dy = e.clientY - swipeStart.y;

  const TH = 22;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);

  if (ax < TH && ay < TH) {
    swipeStart = null;
    return;
  }

  let newDir = null;
  if (ax > ay) newDir = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  else newDir = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };

  ensureAudio();
  applyDir(newDir, true);

  swipeStart = null;
  e.preventDefault();
});

// ===== Boot =====
loadBestScores();
resetMenuUI();
updateTimeUI();
