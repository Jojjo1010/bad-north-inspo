const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

const TRACK_Y = [160, 280]; // two tracks
const TRACK_HEIGHT = 60;
const TRAIN_X = 100;
const TRAIN_W = 80;
const TRAIN_H = 40;

let train, obstacles, coins, score, best, speed, gameOver, frameCount, switchCooldown;

best = parseInt(localStorage.getItem('trainRunnerBest') || '0');
document.getElementById('best').textContent = best;

function startGame() {
  train = { track: 0, y: TRACK_Y[0], targetY: TRACK_Y[0], switching: false };
  obstacles = [];
  coins = [];
  score = 0;
  speed = 1;
  gameOver = false;
  frameCount = 0;
  switchCooldown = 0;
  document.getElementById('game-over').style.display = 'none';
  requestAnimationFrame(loop);
}

// Input
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    e.preventDefault();
    switchTrack();
  }
});
canvas.addEventListener('click', switchTrack);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); switchTrack(); });

function switchTrack() {
  if (gameOver) { startGame(); return; }
  if (switchCooldown > 0) return;
  train.track = train.track === 0 ? 1 : 0;
  train.targetY = TRACK_Y[train.track];
  train.switching = true;
  switchCooldown = 12;
}

// Spawning
function spawnObstacle() {
  const track = Math.random() < 0.5 ? 0 : 1;
  obstacles.push({
    x: W + 40,
    track,
    y: TRACK_Y[track],
    w: 30 + Math.random() * 30,
    h: 36,
    type: Math.random() < 0.3 ? 'barrier' : 'rock'
  });
}

function spawnCoin() {
  const track = Math.random() < 0.5 ? 0 : 1;
  coins.push({
    x: W + 20,
    track,
    y: TRACK_Y[track] - 5,
    collected: false
  });
}

// Drawing
function drawBackground() {
  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0f3460');
  grad.addColorStop(0.6, '#16213e');
  grad.addColorStop(1, '#1a1a2e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Stars
  ctx.fillStyle = '#ffffff44';
  for (let i = 0; i < 30; i++) {
    const sx = (i * 137 + frameCount * 0.1) % W;
    const sy = (i * 97) % (H * 0.4);
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }

  // Ground
  ctx.fillStyle = '#2d5016';
  ctx.fillRect(0, H * 0.7, W, H * 0.3);

  // Distant mountains
  ctx.fillStyle = '#1a3a5c';
  for (let i = 0; i < 5; i++) {
    const mx = (i * 200 - (frameCount * 0.2) % 200 + W) % (W + 200) - 100;
    drawTriangle(mx, H * 0.5, 160, 120);
  }
}

function drawTriangle(x, baseY, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(x + w / 2, baseY - h);
  ctx.lineTo(x + w, baseY);
  ctx.closePath();
  ctx.fill();
}

function drawTracks() {
  for (let i = 0; i < 2; i++) {
    const ty = TRACK_Y[i] + TRAIN_H / 2 + 4;

    // Rail bed
    ctx.fillStyle = '#3a2f1f';
    ctx.fillRect(0, ty - 6, W, 12);

    // Rails
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, ty - 4);
    ctx.lineTo(W, ty - 4);
    ctx.moveTo(0, ty + 4);
    ctx.lineTo(W, ty + 4);
    ctx.stroke();

    // Sleepers
    ctx.fillStyle = '#5a4a30';
    for (let x = -frameCount * (2 + speed) % 24; x < W; x += 24) {
      ctx.fillRect(x, ty - 7, 4, 14);
    }
  }
}

function drawTrain() {
  const x = TRAIN_X;
  const y = train.y;

  // Body
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.roundRect(x, y, TRAIN_W, TRAIN_H, 6);
  ctx.fill();

  // Cabin
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(x + 8, y - 12, 30, 14);

  // Chimney
  ctx.fillStyle = '#555';
  ctx.fillRect(x + 55, y - 16, 10, 18);

  // Smoke puffs
  ctx.fillStyle = `rgba(200, 200, 200, ${0.3 + Math.sin(frameCount * 0.1) * 0.15})`;
  for (let i = 0; i < 3; i++) {
    const px = x + 60 - i * 12 - (frameCount * 0.5 % 20);
    const py = y - 20 - i * 8;
    const r = 5 + i * 3;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Windows
  ctx.fillStyle = '#f9e74a';
  ctx.fillRect(x + 12, y - 8, 10, 8);
  ctx.fillRect(x + 26, y - 8, 10, 8);

  // Wheels
  ctx.fillStyle = '#333';
  const wheelY = y + TRAIN_H;
  const wheelPhase = frameCount * 0.15 * (1 + speed * 0.3);
  for (let wx of [x + 15, x + 40, x + 65]) {
    ctx.beginPath();
    ctx.arc(wx, wheelY, 7, 0, Math.PI * 2);
    ctx.fill();
    // Spoke
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(wx + Math.cos(wheelPhase) * 5, wheelY + Math.sin(wheelPhase) * 5);
    ctx.lineTo(wx - Math.cos(wheelPhase) * 5, wheelY - Math.sin(wheelPhase) * 5);
    ctx.stroke();
  }

  // Cow catcher
  ctx.fillStyle = '#888';
  ctx.beginPath();
  ctx.moveTo(x + TRAIN_W, y + TRAIN_H);
  ctx.lineTo(x + TRAIN_W + 12, y + TRAIN_H + 2);
  ctx.lineTo(x + TRAIN_W, y + 10);
  ctx.closePath();
  ctx.fill();
}

function drawObstacles() {
  for (const o of obstacles) {
    if (o.type === 'barrier') {
      // Warning barrier
      ctx.fillStyle = '#f39c12';
      ctx.fillRect(o.x, o.y - 4, o.w, o.h);
      ctx.fillStyle = '#1a1a2e';
      for (let s = 0; s < o.w; s += 16) {
        ctx.fillRect(o.x + s, o.y + 4, 8, 12);
      }
    } else {
      // Boulder
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#555';
      ctx.beginPath();
      ctx.ellipse(o.x + o.w / 2 - 3, o.y + o.h / 2 - 3, o.w / 3, o.h / 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCoins() {
  for (const c of coins) {
    if (c.collected) continue;
    ctx.fillStyle = '#f5a623';
    ctx.beginPath();
    ctx.arc(c.x, c.y + 10, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e09520';
    ctx.font = 'bold 14px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('$', c.x, c.y + 15);
  }
}

// Collision
function checkCollisions() {
  const tx = TRAIN_X;
  const ty = train.y;

  for (const o of obstacles) {
    if (o.track !== train.track) continue;
    if (tx + TRAIN_W > o.x && tx < o.x + o.w &&
        ty + TRAIN_H > o.y && ty < o.y + o.h) {
      return true;
    }
  }
  return false;
}

function checkCoins() {
  const tx = TRAIN_X;

  for (const c of coins) {
    if (c.collected || c.track !== train.track) continue;
    if (tx + TRAIN_W > c.x - 10 && tx < c.x + 10) {
      c.collected = true;
      score += 10;
    }
  }
}

// Update
function update() {
  frameCount++;
  if (switchCooldown > 0) switchCooldown--;

  // Smooth track switching
  if (train.switching) {
    const diff = train.targetY - train.y;
    train.y += diff * 0.25;
    if (Math.abs(diff) < 1) {
      train.y = train.targetY;
      train.switching = false;
    }
  }

  // Move objects
  const spd = 2 + speed * 1.2;
  for (const o of obstacles) o.x -= spd;
  for (const c of coins) c.x -= spd;

  // Clean up
  obstacles = obstacles.filter(o => o.x > -60);
  coins = coins.filter(c => c.x > -30);

  // Spawning
  const spawnRate = Math.max(40, 90 - speed * 5);
  if (frameCount % spawnRate === 0) spawnObstacle();
  if (frameCount % Math.max(30, 70 - speed * 3) === 0) spawnCoin();

  // Occasionally spawn on both tracks to force timing
  if (speed > 3 && frameCount % (spawnRate * 2) === 0) {
    obstacles.push({
      x: W + 40, track: 0, y: TRACK_Y[0],
      w: 30, h: 36, type: 'rock'
    });
    obstacles.push({
      x: W + 180, track: 1, y: TRACK_Y[1],
      w: 30, h: 36, type: 'rock'
    });
  }

  // Score and speed
  if (frameCount % 10 === 0) score++;
  speed = 1 + Math.floor(score / 50);

  checkCoins();

  if (checkCollisions()) {
    gameOver = true;
    if (score > best) {
      best = score;
      localStorage.setItem('trainRunnerBest', best.toString());
    }
    document.getElementById('final-score').textContent = score;
    document.getElementById('game-over').style.display = 'block';
  }

  // UI
  document.getElementById('score').textContent = score;
  document.getElementById('speed').textContent = speed;
  document.getElementById('best').textContent = best;
}

// Main loop
function loop() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawTracks();
  drawObstacles();
  drawCoins();
  drawTrain();
  update();
  if (!gameOver) requestAnimationFrame(loop);
}

// Start
startGame();
