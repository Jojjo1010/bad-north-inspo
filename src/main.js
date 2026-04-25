import {
  CANVAS_WIDTH, CANVAS_HEIGHT, CAMERA_TRAIN_X,
  CAR_WIDTH, CAR_HEIGHT, CAR_GAP, TRAIN_SPEED,
  TARGET_DISTANCE, MOUNT_RADIUS,
  ZONES_PER_WORLD, ZONE_DIFFICULTY_SCALE,
  CREW_UPGRADES, SHOP_TUNING,
  CAMERA_PAN_SPEED, CAMERA_EDGE_ZONE,
  CREW_HEAL_BETWEEN_FIGHTS
} from './constants.js';
import { Train } from './train.js';
import { Renderer3D } from './renderer3d.js';
import { InputManager } from './input.js';
import { Spawner } from './enemies.js';
import { CombatSystem } from './combat.js';
import { CoinSystem } from './coins.js';
import { BanditSystem, BANDIT_STATES } from './bandits.js';
import { Zone, STATION_TYPES } from './zone.js';
import { playPowerup, startMusic, getMusicVolume, getSfxVolume, setMusicVolume, setSfxVolume, playZoneCompleteMp3, playWinWorldMp3, playDefeatMp3, preloadSfx, playWaveClear, updateLowHPWarning, stopLowHPWarning, playBrawlerKick, playKickLand } from './audio.js';

const STATES = {
  ZONE_MAP: 0, SETUP: 1, RUNNING: 2, GAMEOVER: 3,
  PAUSED: 4, SETTINGS: 5, START_SCREEN: 6, WORLD_MAP: 7,
  RUN_PAUSE: 8, UPGRADE_PICK: 9,
};

const WORLDS = [
  { id: 1, name: 'The Dustlands',  subtitle: 'Arid plains crossing',       difficulty: 1.0, color: '#c8a96e', accent: '#f5a623', stars: 1 },
  { id: 2, name: 'Iron Wastes',    subtitle: 'Ruined industrial badlands',  difficulty: 1.5, color: '#8ab5c8', accent: '#5ab4db', stars: 2 },
  { id: 3, name: 'The Inferno',    subtitle: 'Volcanic hellscape',          difficulty: 2.0, color: '#e87050', accent: '#e74c3c', stars: 3 },
];

const threeCanvas = document.getElementById('game3d');
const uiCanvas = document.getElementById('gameUI');
const ctx = uiCanvas.getContext('2d');

function resizeCanvas() {
  uiCanvas.width = CANVAS_WIDTH;
  uiCanvas.height = CANVAS_HEIGHT;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const renderer = new Renderer3D(threeCanvas, ctx);
const input = new InputManager(uiCanvas);
const spawner = new Spawner();
const combat = new CombatSystem();
const coinSystem = new CoinSystem();
const banditSystem = new BanditSystem();

let state = STATES.START_SCREEN;
let selectedWorld = WORLDS[0];
let hoveredWorldIndex = -1;
let train = null;
let zone = null;
let lastTime = performance.now();
let won = false;
let debugMode = false;

// Selection state
let selectedCrew = null;

const save = {
  upgrades: {
    damage: { level: 0, maxLevel: SHOP_TUNING.damage.maxLevel, cost: SHOP_TUNING.damage.cost, icon: '\u2694', color: '#ffb74d', name: 'Gun Power', desc: `+${SHOP_TUNING.damage.perLevel}% damage` },
    maxHp:  { level: 0, maxLevel: SHOP_TUNING.maxHp.maxLevel,  cost: SHOP_TUNING.maxHp.cost,  icon: '\u2764', color: '#e74c3c', name: 'Train HP',  desc: `+${SHOP_TUNING.maxHp.perLevel} max HP` },
  },
};

const NUM_CARS = 8;
const trainTotalWidth = NUM_CARS * CAR_WIDTH + (NUM_CARS - 1) * CAR_GAP;
const TRAIN_3D_OFFSET = -15;
const trainWorldX = CANVAS_WIDTH / 2 - trainTotalWidth / 2 + TRAIN_3D_OFFSET;
const trainWorldY = CANVAS_HEIGHT / 2 - CAR_HEIGHT / 2;
const crewPanelY = trainWorldY + CAR_HEIGHT + 80;

// Camera panning — 8 cars is ~480 3D units, visible ~300, so need ~200 pan range
let cameraOffsetX = 0;
const maxCameraOffset = 200;
const departBtn = { x: CANVAS_WIDTH / 2 - 70, y: CANVAS_HEIGHT - 80, w: 140, h: 48 };

let stateBeforePause = null;
const pauseButtons = {
  resume:  { x: CANVAS_WIDTH / 2 - 100, y: 260, w: 200, h: 50 },
  restart: { x: CANVAS_WIDTH / 2 - 100, y: 330, w: 200, h: 50 },
  quit:    { x: CANVAS_WIDTH / 2 - 100, y: 400, w: 200, h: 50 },
};

let zoneNumber = 1;
let combatDifficulty = 1;
let prevWavePhase = -1;
let hitStopTimer = 0;

// --- Control hint system (Bad North style top banner, fades after a few seconds) ---
let hintText = '';
let hintTimer = 0;
let hintShownForState = new Set(); // track which states have shown their hint

function showHint(text, duration = 4) {
  hintText = text;
  hintTimer = duration;
}

function updateHint(dt) {
  if (hintTimer > 0) hintTimer -= dt;
}

function drawHintBanner(ctx) {
  if (hintTimer <= 0 || !hintText) return;
  const alpha = hintTimer < 1 ? hintTimer : 1;
  ctx.font = '13px monospace';
  const bannerW = ctx.measureText(hintText).width + 40;
  const bannerH = 30;
  const bx = CANVAS_WIDTH / 2 - bannerW / 2;
  const by = 12;
  ctx.save();
  ctx.globalAlpha = alpha * 0.85;
  ctx.fillStyle = 'rgba(50,55,60,0.9)';
  ctx.beginPath();
  renderer.roundRect(bx, by, bannerW, bannerH, 6);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ddd';
  ctx.font = '13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(hintText, CANVAS_WIDTH / 2, by + 20);
  ctx.restore();
}

// --- Upgrade pick state ---
let upgradePickCrew = null; // which crew is picking
let upgradePickChoices = []; // array of upgrade defs
let upgradePickHovered = -1;
let upgradePickQueue = []; // crew indices waiting to pick
let upgradePickPhase = 'choose_crew'; // 'choose_crew' or 'choose_upgrade'
let upgradePickCrewHovered = -1; // hovered crew index during choose_crew phase

function newZone() {
  zoneNumber++;
  if (zoneNumber > ZONES_PER_WORLD) {
    enterWorldComplete();
    return;
  }
  zone = new Zone(zoneNumber, save);
  state = STATES.ZONE_MAP;
}

function applyShopUpgrades() {
  const u = save.upgrades;
  train.passives.damage = u.damage.level;
  train.passives.maxHp = u.maxHp.level;
}

function startNewWorld() {
  zoneNumber = 1;
  zone = new Zone(zoneNumber, save);
  combatDifficulty = 1;
  train = new Train();
  selectedCrew = null;
  hintShownForState.clear();
  applyShopUpgrades();
}

function prepareForCombat(isBossStation = false, modifier = null) {
  state = STATES.SETUP;
  cameraOffsetX = 0;
  train.combatDifficulty = combatDifficulty;
  train.distance = 0;
  train.damageFlash = 0;
  train.shakeTimer = 0;
  train.hpFlashTimer = 0;
  train.hpGreenFlashTimer = 0;
  selectedCrew = null;
  spawner.reset();
  spawner.isBossStation = isBossStation;
  spawner.modifier = modifier || null;
  if (modifier && modifier.id === 'ambush') spawner.applyAmbush();
  coinSystem.reset();
  combat.reset();
  banditSystem.reset();
  prevWavePhase = -1;
  won = false;
  applyShopUpgrades();
}

// Screen position of a slot
// screenX (set by renderer) is already in screen space (camera offset applied)
// worldX (set by train.js) is in world space — needs camera offset subtracted
function slotScreenX(s) {
  if (s.screenX !== undefined) return s.screenX;
  return s.worldX - cameraOffsetX;
}
function slotScreenY(s) { return s.screenY !== undefined ? s.screenY : s.worldY; }

function findCrewAtMouse() {
  // Check weapon mount slots
  for (const slot of train.allSlots) {
    if (slot.crew && slot.crew.alive && !slot.crew.isMoving && input.hitCircle(slotScreenX(slot), slotScreenY(slot), 22)) {
      return slot.crew;
    }
  }
  // Check cargo car bandit slots (crew sent to fight bandits)
  for (const car of train.cars) {
    if (car.type !== 'cargo' || !car.banditSlot) continue;
    const slot = car.banditSlot;
    if (slot.crew && slot.crew.alive && !slot.crew.isMoving && input.hitCircle(slotScreenX(slot), slotScreenY(slot), 22)) {
      return slot.crew;
    }
  }
  return input.findCrewInPanel(train.crew);
}

function findSlotAtMouse() {
  // Check weapon mounts first
  const weaponSlot = input.findSlotAtMouse(train, cameraOffsetX);
  if (weaponSlot) return weaponSlot;
  // Then check cargo car bandit slots (for sending crew to fight bandits)
  for (const car of train.cars) {
    if (car.type !== 'cargo' || !car.banditSlot) continue;
    const slot = car.banditSlot;
    const sx = slot.screenX !== undefined ? slot.screenX : (slot.worldX - cameraOffsetX);
    const sy = slot.screenY !== undefined ? slot.screenY : slot.worldY;
    if (input.hitCircle(sx, sy, 20)) return slot;
  }
  return null;
}

function moveCrewToSlot(crew, slot) {
  const fromSlot = crew.assignment;
  if (fromSlot) {
    const fromX = fromSlot.worldX;
    const fromY = fromSlot.worldY;
    const fromCar = train.findCarForSlot(fromSlot);
    train.unassignCrew(crew);
    crew.moveScreenX = undefined;
    train.startCrewMove(crew, fromX, fromY, fromCar, slot);
  } else {
    train.assignCrew(crew, slot);
  }
}

// === CAMERA PANNING ===

function updateCamera(dt) {
  // Arrow keys + WASD only (mouse edge panning was too twitchy)
  if (input.keyDown('ArrowLeft') || input.keyDown('KeyA')) cameraOffsetX -= CAMERA_PAN_SPEED * dt;
  if (input.keyDown('ArrowRight') || input.keyDown('KeyD')) cameraOffsetX += CAMERA_PAN_SPEED * dt;
  cameraOffsetX = Math.max(-maxCameraOffset, Math.min(maxCameraOffset, cameraOffsetX));
}

// Convert screen mouse coordinates to world coordinates (accounting for camera offset)
function worldMouseX() { return input.mouseX + cameraOffsetX; }
function worldMouseY() { return input.mouseY; }

// === SETUP PHASE (simplified — just place crew and depart) ===

function updateSetup(dt) {
  updateHint(dt);
  if (!hintShownForState.has('setup')) {
    hintShownForState.add('setup');
    showHint('Left-click crew, then right-click a mount to place them', 6);
  }
  updateCamera(dt);
  train.updateWorldPositions(trainWorldX, trainWorldY);
  train.updateCrewMovement(dt);

  if (input.leftClicked) {
    const crewPlaced = train.crew.some(c => c.assignment);
    if (crewPlaced && input.hitRect(departBtn.x, departBtn.y, departBtn.w, departBtn.h)) {
      state = STATES.RUNNING;
      lastTime = performance.now();
      selectedCrew = null;
      return;
    }

    const clickedCrew = findCrewAtMouse();
    if (clickedCrew) {
      selectedCrew = clickedCrew === selectedCrew ? null : clickedCrew;
      return;
    }
    selectedCrew = null;
  }

  // Right click: place selected crew on slot
  if (input.rightClicked && selectedCrew && !selectedCrew.isMoving) {
    const slot = findSlotAtMouse();
    if (slot) moveCrewToSlot(selectedCrew, slot);
  }
}

function renderSetup() {
  train.updateWorldPositions(trainWorldX, trainWorldY);
  renderer.setCameraOffset(cameraOffsetX);
  renderer.drawTerrain(0);
  renderer.drawTrain(train);
  renderer.drawSteamBlastAura(train);
  renderer.drawWeaponMounts(train, null, true);
  renderer.drawMovingCrew(train.crew);
  renderer.drawCrewPanel(train.crew, crewPanelY);

  const crewReady = train.crew.some(c => c.assignment);
  if (!crewReady) {
    renderer.drawSetupOverlay();
  } else {
    renderer.drawMissionBrief();
  }
  renderer.drawDepartButton(departBtn.x, departBtn.y, departBtn.w, departBtn.h,
    crewReady && input.hitRect(departBtn.x, departBtn.y, departBtn.w, departBtn.h), !crewReady);
  if (selectedCrew) renderer.drawSelectedIndicator(selectedCrew);
  drawHintBanner(renderer.ctx);
  renderer.flush();
}

// === RUN PHASE ===

function updateRun(dt) {
  // Hitstop
  if (hitStopTimer > 0) { hitStopTimer -= dt; return; }

  updateHint(dt);
  if (!hintShownForState.has('running')) {
    hintShownForState.add('running');
    showHint('Click a crew member to pause and reposition', 5);
  }
  updateCamera(dt);
  train.updateWorldPositions(trainWorldX, trainWorldY);
  train.distance += TRAIN_SPEED * dt;

  // Low HP warning based on crew health
  const crewHpRatio = train.crew.filter(c => c.alive).length > 0
    ? train.crew.filter(c => c.alive).reduce((sum, c) => sum + c.hp / c.maxHp, 0) / train.crew.filter(c => c.alive).length
    : 0;
  updateLowHPWarning(crewHpRatio);

  if (train.distance >= TARGET_DISTANCE) { won = true; enterGameOver(); return; }
  if (train.allCrewDead) { won = false; enterGameOver(); return; }

  for (const c of train.crew) if (c.reassignCooldown > 0) c.reassignCooldown -= dt;
  train.updateCrewMovement(dt);

  // LEFT CLICK: select crew → enter tactical pause (Bad North style)
  if (input.leftClicked) {
    const clickedCrew = findCrewAtMouse();
    if (clickedCrew) {
      selectedCrew = clickedCrew;
      state = STATES.RUN_PAUSE;
      return;
    }
  }

  // Enemies — use first, middle, and last car for spawn targeting
  const firstCar = train.cars[0];
  const midCar = train.cars[Math.floor(train.cars.length / 2)];
  const lastCar = train.cars[train.cars.length - 1];
  const carBounds = {
    cargo:       { x: midCar.worldX, y: midCar.worldY, w: CAR_WIDTH, h: CAR_HEIGHT },
    rearWeapon:  { x: firstCar.worldX, y: firstCar.worldY, w: CAR_WIDTH, h: CAR_HEIGHT },
    frontWeapon: { x: lastCar.worldX, y: lastCar.worldY, w: CAR_WIDTH, h: CAR_HEIGHT },
  };
  // Per-car bounds for wave targeting
  const allCarBounds = train.cars.map(c => ({
    x: c.worldX, y: c.worldY, w: c.width, h: c.height
  }));
  spawner.update(dt, train.distance, carBounds, train.combatDifficulty || 1, allCarBounds);

  // Wave phase transitions
  const currentPhase = spawner.waveInfo.phase;
  if (prevWavePhase !== -1 && currentPhase !== prevWavePhase) {
    if (currentPhase === 2) {
      train.shakeTimer = 0.3;
      train.shakeIntensity = 1.5;
    } else if (currentPhase === 1) {
      train.shakeTimer = 0.15;
      train.shakeIntensity = 1.0;
    } else if (currentPhase === 0 && prevWavePhase === 2) {
      playWaveClear();
      banditSystem.spawnTimer = Math.max(banditSystem.spawnTimer, 1.5);
      train.hpGreenFlashTimer = 0.5;
    }
  }
  prevWavePhase = currentPhase;

  for (const e of spawner.pool) e.update(dt);
  combat.update(dt, train, spawner.pool);

  // Bandits
  banditSystem.update(dt, train, train.combatDifficulty || 1, currentPhase);

  // Brawler kick handling
  for (const b of banditSystem.pool) {
    if (!b._brawlerKick) continue;
    b._brawlerKick = false;
    if (b._kickWorldX !== undefined) {
      const originScreen = renderer.pixelToScreen(b._kickWorldX, b._kickWorldY);
      renderer.spawnBrawlerKick(originScreen.x, originScreen.y, 80);
      playBrawlerKick();
    }
  }

  for (const b of banditSystem.pool) {
    if (!b._kickLanded) continue;
    b._kickLanded = false;
    const kx = b._landX, ky = b._landY;
    const crew = b._kickCrew;
    if (!crew) continue;
    const kickDmg = crew.upgrade ? crew.upgrade.damage * 4 : 60;
    const kickR = 160;
    const r2 = kickR * kickR;
    for (const e of spawner.pool) {
      if (!e.active) continue;
      const dx = e.x - kx, dy = e.y - ky;
      if (dx * dx + dy * dy <= r2) {
        const ex = e.x, ey = e.y, ec = e.color;
        e.takeDamage(kickDmg);
        combat.handleEnemyDamageResult(e, train, ex, ey, ec);
      }
    }
    train.shakeTimer = Math.max(train.shakeTimer, 0.05);
    train.shakeIntensity = 0.5;
    playKickLand();
    const landScreen = renderer.pixelToScreen(kx, ky);
    renderer.spawnBrawlerKick(landScreen.x, landScreen.y, kickR);
    train.hpGreenFlashTimer = 0.4;
  }

}

function drawCrewAndCargoHPBars(hctx, train) {
  // Crew HP bars — small colored bar above their mount, with crew color accent
  for (const c of train.crew) {
    if (!c.alive || !c.assignment) continue;
    const slot = c.assignment;
    const sx = slot.screenX !== undefined ? slot.screenX : slot.worldX - cameraOffsetX;
    const sy = slot.screenY !== undefined ? slot.screenY : slot.worldY;
    const barW = 22, barH = 3;
    const bx = sx - barW / 2;
    const by = sy - 18;
    const ratio = Math.max(0, c.hp / c.maxHp);
    let color;
    if (ratio > 0.5) color = '#4caf50';
    else if (ratio > 0.25) color = '#ff9800';
    else color = '#f44336';
    // Background
    hctx.fillStyle = 'rgba(0,0,0,0.5)';
    hctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    hctx.fillStyle = 'rgba(255,255,255,0.15)';
    hctx.fillRect(bx, by, barW, barH);
    // Fill
    hctx.fillStyle = color;
    hctx.fillRect(bx, by, barW * ratio, barH);
    // Crew color dot to identify who this is
    hctx.fillStyle = c.color;
    hctx.beginPath();
    hctx.arc(bx - 5, by + barH / 2, 2.5, 0, Math.PI * 2);
    hctx.fill();
  }

  // Cargo car HP bars — wider, amber-tinted, below the car with a cargo icon
  for (const car of train.cars) {
    if (car.type !== 'cargo' || !car.alive) continue;
    const cx = car.worldX + car.width / 2;
    const cy = car.worldY + car.height + 6;
    const s = renderer.pixelToScreen(cx, cy);
    const barW = 30, barH = 4;
    const bx = s.x - barW / 2;
    const by = s.y;
    const ratio = Math.max(0, car.hp / car.maxHp);
    // Cargo bars are amber/brown themed
    hctx.fillStyle = 'rgba(0,0,0,0.5)';
    hctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    hctx.fillStyle = 'rgba(180,140,60,0.2)';
    hctx.fillRect(bx, by, barW, barH);
    hctx.fillStyle = ratio > 0.5 ? '#c8a96e' : ratio > 0.25 ? '#e67e22' : '#e74c3c';
    hctx.fillRect(bx, by, barW * ratio, barH);
  }
}

// --- Edge arrow for off-screen threats ---
function drawEdgeArrow(ctx, y, direction, color, alpha) {
  const x = direction < 0 ? 14 : CANVAS_WIDTH - 14;
  const size = 10;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + direction * size, y - size);
  ctx.lineTo(x - direction * size, y);
  ctx.lineTo(x + direction * size, y + size);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawWaveTargetHighlights(ctx, train, waveInfo, time) {
  if (!waveInfo.targetCarIndices || waveInfo.targetCarIndices.length === 0) return;
  const isWarningOrSurge = waveInfo.phase === 1 || waveInfo.phase === 2;
  if (!isWarningOrSurge) return;

  const pulse = 0.4 + Math.sin(time * 0.006) * 0.3;

  for (const carIdx of waveInfo.targetCarIndices) {
    const car = train.cars[carIdx];
    if (!car) continue;
    const cx = car.worldX + car.width / 2;
    const cy = car.worldY + car.height / 2;
    const s = renderer.pixelToScreen(cx, cy);

    if (s.x >= 20 && s.x <= CANVAS_WIDTH - 20) {
      // On-screen: draw pulsing ring around the car
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = waveInfo.phase === 1 ? '#f5a623' : '#e74c3c';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 22, 0, Math.PI * 2);
      ctx.stroke();
      // Inner glow
      ctx.strokeStyle = waveInfo.phase === 1 ? '#ffdd88' : '#ff8888';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      // Off-screen: draw edge arrow
      const dir = s.x < 20 ? -1 : 1;
      const clampedY = Math.max(20, Math.min(CANVAS_HEIGHT - 20, s.y));
      const color = waveInfo.phase === 1 ? '#f5a623' : '#e74c3c';
      drawEdgeArrow(ctx, clampedY, dir, color, pulse);
    }
  }
}

function drawEdgeIndicators(ctx, train, waveInfo, time) {
  const pulse = 0.5 + Math.sin(time * 0.008) * 0.35;
  const indicators = []; // {y, direction, color, priority}

  // 1. Cargo damage: red arrow if cargo car taking damage and off-screen
  for (const car of train.cars) {
    if (car.type !== 'cargo' || !car.alive) continue;
    if (car.hp >= car.maxHp) continue;
    const cx = car.worldX + car.width / 2;
    const cy = car.worldY + car.height / 2;
    const s = renderer.pixelToScreen(cx, cy);
    if (s.x >= 20 && s.x <= CANVAS_WIDTH - 20) continue;
    const dir = s.x < 20 ? -1 : 1;
    const clampedY = Math.max(20, Math.min(CANVAS_HEIGHT - 20, s.y));
    indicators.push({ y: clampedY, direction: dir, color: '#e74c3c', priority: 2 });
  }

  // 2. Bandit boarding: orange arrow if bandit ON_TRAIN on off-screen cargo car
  for (const b of banditSystem.pool) {
    if (!b.active || b.state !== BANDIT_STATES.ON_TRAIN) continue;
    const slot = b.targetSlot;
    if (!slot) continue;
    const s = renderer.pixelToScreen(slot.worldX, slot.worldY);
    if (s.x >= 20 && s.x <= CANVAS_WIDTH - 20) continue;
    const dir = s.x < 20 ? -1 : 1;
    const clampedY = Math.max(20, Math.min(CANVAS_HEIGHT - 20, s.y));
    indicators.push({ y: clampedY, direction: dir, color: '#e67e22', priority: 1 });
  }

  // Deduplicate: keep highest priority per edge side + rough Y band
  const drawn = new Set();
  indicators.sort((a, b) => b.priority - a.priority);
  for (const ind of indicators) {
    const key = `${ind.direction}_${Math.round(ind.y / 30)}`;
    if (drawn.has(key)) continue;
    drawn.add(key);
    drawEdgeArrow(ctx, ind.y, ind.direction, ind.color, pulse);
  }
}

function renderRun() {
  train.updateWorldPositions(trainWorldX, trainWorldY);
  renderer.setCameraOffset(cameraOffsetX);
  renderer.applyShake(train, 0.016);
  renderer.drawTerrain(train.distance);
  renderer.drawEnemies(spawner.pool);
  renderer.drawProjectiles(combat.projectiles);

  // Kill effects
  if (combat.killEffects.length > 0) {
    hitStopTimer = 0.033;
    train.shakeTimer = Math.max(train.shakeTimer, 0.06);
    train.shakeIntensity = Math.max(train.shakeIntensity || 0, 0.5);
  }
  for (const ke of combat.killEffects) {
    const s = renderer.pixelToScreen(ke.x, ke.y);
    renderer.spawnKillEffect(s.x, s.y, ke.color);
  }
  combat.killEffects.length = 0;
  renderer.updateAndDrawKillEffects(0.016);
  renderer.updateAndDrawKickShockwaves(0.016);

  for (const mf of combat.muzzleFlashes) {
    const s = renderer.pixelToScreen(mf.x, mf.y);
    renderer.spawnMuzzleFlash(s.x, s.y);
  }
  combat.muzzleFlashes.length = 0;
  renderer.updateAndDrawMuzzleFlashes(0.016);

  // hitSparks already use pixelToScreen internally in spawnHitSpark
  for (const hs of combat.hitSparks) renderer.spawnHitSpark(hs.x, hs.y);
  combat.hitSparks.length = 0;
  renderer.updateAndDrawHitSparks(0.016);

  renderer.drawTrain(train);
  renderer.drawSteamBlastAura(train);
  // Show 3D gun models + crew on mounts, but no empty slot indicators
  renderer.drawWeaponMounts(train, null, false);
  renderer.drawMovingCrew(train.crew);
  renderer.drawBandits(banditSystem.pool, train.allMounts);
  renderer.drawBanditTelegraphing(banditSystem.pool, train.crew);
  renderer.drawDamageFlash(train);

  // Crew panel for unassigned crew
  if (train.crew.some(c => c.alive && !c.assignment && !c.isMoving)) {
    renderer.drawCrewPanel(train.crew, CANVAS_HEIGHT - 70);
  }

  // --- Minimal HUD: thin distance progress bar at top ---
  {
    const hctx = renderer.ctx;
    const progress = Math.min(1, train.distance / TARGET_DISTANCE);
    hctx.fillStyle = 'rgba(255,255,255,0.08)';
    hctx.fillRect(0, 0, CANVAS_WIDTH, 3);
    hctx.fillStyle = 'rgba(180,220,255,0.55)';
    hctx.fillRect(0, 0, CANVAS_WIDTH * progress, 3);
  }

  // --- Crew HP bars (above each crew member's mount position) ---
  {
    const hctx = renderer.ctx;
    drawCrewAndCargoHPBars(hctx, train);
  }

  // Wave target highlights and off-screen threat indicators
  {
    const hctx = renderer.ctx;
    const now = performance.now();
    drawWaveTargetHighlights(hctx, train, spawner.waveInfo, now);
    drawEdgeIndicators(hctx, train, spawner.waveInfo, now);
  }

  drawHintBanner(renderer.ctx);
  renderer.flush();
}

// === TACTICAL PAUSE (Bad North style — triggered by clicking crew) ===

function updateRunPause() {
  // Resume: Space, Escape, or right-click on empty space
  if (input.keyPressed('Space') || input.keyPressed('Escape')) {
    selectedCrew = null;
    state = STATES.RUNNING;
    lastTime = performance.now();
    return;
  }

  // Left click: select a different crew member, or click a mount to assign
  if (input.leftClicked) {
    // Check if clicking another crew member
    const clickedCrew = findCrewAtMouse();
    if (clickedCrew) {
      selectedCrew = clickedCrew === selectedCrew ? null : clickedCrew;
      return;
    }

    // Check if clicking a mount — assign selected crew there
    if (selectedCrew && !selectedCrew.isMoving) {
      const slot = findSlotAtMouse();
      if (slot) {
        moveCrewToSlot(selectedCrew, slot);
        selectedCrew = null;
        state = STATES.RUNNING;
        lastTime = performance.now();
        return;
      }
    }

    // Click empty — deselect and resume
    selectedCrew = null;
    state = STATES.RUNNING;
    lastTime = performance.now();
  }

  // Right click: assign selected crew to slot and resume
  if (input.rightClicked && selectedCrew && !selectedCrew.isMoving) {
    const slot = findSlotAtMouse();
    if (slot) {
      moveCrewToSlot(selectedCrew, slot);
      selectedCrew = null;
      state = STATES.RUNNING;
      lastTime = performance.now();
    }
  }
}

function renderRunPause() {
  updateCamera(0.016); // allow panning while paused
  train.updateWorldPositions(trainWorldX, trainWorldY);
  renderer.setCameraOffset(cameraOffsetX);
  renderer.drawTerrain(train.distance);
  renderer.drawEnemies(spawner.pool);
  renderer.drawTrain(train);
  renderer.drawSteamBlastAura(train);
  renderer.drawWeaponMounts(train, null, false);
  renderer.drawMovingCrew(train.crew);
  renderer.drawBandits(banditSystem.pool, train.allMounts);

  if (train.crew.some(c => c.alive && !c.assignment && !c.isMoving)) {
    renderer.drawCrewPanel(train.crew, CANVAS_HEIGHT - 70);
  }

  drawCrewAndCargoHPBars(renderer.ctx, train);

  // Dim overlay
  const dctx = renderer.ctx;
  dctx.fillStyle = 'rgba(0,0,0,0.3)';
  dctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Highlight selected crew's current position
  if (selectedCrew && selectedCrew.assignment) {
    const slot = selectedCrew.assignment;
    const sx = slotScreenX(slot), sy = slotScreenY(slot);
    dctx.save();
    const pulse = 0.6 + Math.sin(performance.now() * 0.008) * 0.4;
    dctx.strokeStyle = selectedCrew.color;
    dctx.lineWidth = 3;
    dctx.globalAlpha = pulse;
    dctx.beginPath();
    dctx.arc(sx, sy, MOUNT_RADIUS + 10, 0, Math.PI * 2);
    dctx.stroke();
    dctx.restore();
  }

  // Highlight all available mounts
  for (const mount of train.allMounts) {
    if (mount.crew && mount.crew !== selectedCrew) continue;
    const sx = slotScreenX(mount), sy = slotScreenY(mount);
    dctx.beginPath();
    dctx.arc(sx, sy, MOUNT_RADIUS + 6, 0, Math.PI * 2);
    const hovered = input.hitCircle(sx, sy, MOUNT_RADIUS + 10);
    dctx.strokeStyle = hovered ? '#fff' : 'rgba(255,255,255,0.4)';
    dctx.lineWidth = hovered ? 3 : 1;
    dctx.stroke();
  }

  // Highlight cargo cars with bandits as clickable targets
  for (const car of train.cars) {
    if (car.type !== 'cargo' || !car.banditSlot || !car.banditSlot._bandit) continue;
    const slot = car.banditSlot;
    const sx = slot.screenX !== undefined ? slot.screenX : (slot.worldX - cameraOffsetX);
    const sy = slot.screenY !== undefined ? slot.screenY : slot.worldY;
    const hovered = input.hitCircle(sx, sy, 20);
    const pulse = 0.5 + Math.sin(performance.now() * 0.008) * 0.5;
    dctx.save();
    dctx.globalAlpha = pulse;
    dctx.strokeStyle = hovered ? '#ff6633' : 'rgba(255, 100, 50, 0.6)';
    dctx.lineWidth = hovered ? 3 : 2;
    dctx.beginPath();
    dctx.arc(sx, sy, 18, 0, Math.PI * 2);
    dctx.stroke();
    dctx.restore();
  }

  // Banner
  dctx.save();
  dctx.fillStyle = 'rgba(10,20,50,0.85)';
  dctx.fillRect(0, 0, CANVAS_WIDTH, 36);
  dctx.strokeStyle = '#4488ff';
  dctx.lineWidth = 1;
  dctx.strokeRect(0, 0, CANVAS_WIDTH, 36);
  dctx.fillStyle = '#88aaff';
  dctx.font = 'bold 15px monospace';
  dctx.textAlign = 'center';
  dctx.fillText(selectedCrew ? `REPOSITION ${selectedCrew.name.toUpperCase()}` : 'TACTICAL PAUSE', CANVAS_WIDTH / 2, 23);
  dctx.restore();

  // Instructions
  dctx.save();
  dctx.fillStyle = 'rgba(10,20,50,0.75)';
  dctx.fillRect(0, CANVAS_HEIGHT - 30, CANVAS_WIDTH, 30);
  dctx.fillStyle = '#aabbcc';
  dctx.font = '11px monospace';
  dctx.textAlign = 'center';
  dctx.fillText('Click mount or cargo car to assign  \u2022  Click another crew to switch  \u2022  SPACE / ESC to resume', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 11);
  dctx.restore();

  renderer.flush();
}

// === BETWEEN-STATION UPGRADE PICK ===

function generateUpgradeChoices(crew) {
  // If crew already has an upgrade, offer enhancements or new paths
  // For now: offer 3 random upgrades from the pool
  const allIds = Object.keys(CREW_UPGRADES);
  const choices = [];
  const shuffled = allIds.sort(() => Math.random() - 0.5);
  for (let i = 0; i < Math.min(3, shuffled.length); i++) {
    choices.push(CREW_UPGRADES[shuffled[i]]);
  }
  return choices;
}

function startUpgradePick() {
  // Queue alive crew — player picks which one to upgrade
  upgradePickQueue = train.crew
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.alive)
    .map(({ i }) => i);
  if (upgradePickQueue.length === 0) {
    state = STATES.ZONE_MAP;
    return;
  }
  upgradePickPhase = 'choose_crew';
  upgradePickCrew = null;
  upgradePickChoices = [];
  upgradePickHovered = -1;
  upgradePickCrewHovered = -1;
  state = STATES.UPGRADE_PICK;
}

function nextUpgradePick() {
  // Shop visit: return to zone map after one pick (no queue continuation)
  state = STATES.ZONE_MAP;
}

function updateUpgradePick() {
  if (upgradePickPhase === 'choose_crew') {
    // Player chooses which crew member to upgrade
    upgradePickCrewHovered = -1;
    const aliveCrew = train.crew.filter(c => c.alive);
    for (let i = 0; i < aliveCrew.length; i++) {
      const crew = aliveCrew[i];
      if (crew._pickX !== undefined && input.hitRect(crew._pickX, crew._pickY, crew._pickW, crew._pickH)) {
        upgradePickCrewHovered = i;
      }
    }
    if (input.clicked && upgradePickCrewHovered >= 0) {
      upgradePickCrew = aliveCrew[upgradePickCrewHovered];
      upgradePickChoices = generateUpgradeChoices(upgradePickCrew);
      upgradePickHovered = -1;
      upgradePickPhase = 'choose_upgrade';
    }
    // Allow skipping the shop with Escape
    if (input.keyPressed('Escape')) {
      state = STATES.ZONE_MAP;
    }
    return;
  }

  // choose_upgrade phase: Mouse hover on upgrade cards
  for (let i = 0; i < upgradePickChoices.length; i++) {
    const c = upgradePickChoices[i];
    if (c._x !== undefined && input.hitRect(c._x, c._y, c._w, c._h)) {
      upgradePickHovered = i;
    }
  }

  if (input.clicked && upgradePickHovered >= 0) {
    const chosen = upgradePickChoices[upgradePickHovered];
    upgradePickCrew.applyUpgrade(chosen.id);
    playPowerup();
    nextUpgradePick();
  }
  // Allow skipping with Escape
  if (input.keyPressed('Escape')) {
    state = STATES.ZONE_MAP;
  }
}

function renderUpgradePick() {
  renderer.setCameraOffset(0);
  renderer.drawTerrain(0);
  const c = renderer.ctx;
  const W = CANVAS_WIDTH, H = CANVAS_HEIGHT;

  // Warm dark background
  c.fillStyle = 'rgba(10, 7, 6, 0.91)';
  c.fillRect(0, 0, W, H);

  const aliveCrew = train.crew.filter(cr => cr.alive);

  // Layout
  const PORT_H = 108;
  const SPLIT_X = 420;
  const ROSE = '#7B2D48';
  const ROSE_LT = '#A84068';

  // \u2500\u2500 Portrait bar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  c.fillStyle = 'rgba(16, 11, 9, 0.97)';
  c.fillRect(0, 0, W, PORT_H);
  c.fillStyle = 'rgba(255,220,180,0.07)';
  c.fillRect(0, PORT_H - 1, W, 1);

  const portW = 110, portH = 86, portPad = 16, portY = 11;

  for (let i = 0; i < aliveCrew.length; i++) {
    const crew = aliveCrew[i];
    const selected = upgradePickPhase === 'choose_upgrade' && upgradePickCrew === crew;
    const hov = upgradePickCrewHovered === i && upgradePickPhase === 'choose_crew';
    const lit = selected || hov;
    const px = portPad + i * (portW + portPad);
    crew._pickX = px; crew._pickY = portY; crew._pickW = portW; crew._pickH = portH;

    // Warm column tint extending down behind this portrait
    if (selected) {
      c.fillStyle = 'rgba(110, 28, 58, 0.32)';
      c.fillRect(px - 4, portY, portW + 8, H - portY);
    }

    // Card
    c.fillStyle = lit ? 'rgba(95, 28, 52, 0.92)' : 'rgba(32, 24, 20, 0.92)';
    c.beginPath(); renderer.roundRect(px, portY, portW, portH, 7); c.fill();
    c.strokeStyle = selected ? ROSE_LT : hov ? 'rgba(180,90,120,0.6)' : 'rgba(70,52,44,0.5)';
    c.lineWidth = selected ? 2 : 1;
    c.beginPath(); renderer.roundRect(px, portY, portW, portH, 7); c.stroke();

    // Silhouette avatar
    const ax = px + portW / 2, ay = portY + 34;
    c.fillStyle = lit ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)';
    c.beginPath(); c.arc(ax, ay, 22, 0, Math.PI * 2); c.fill();
    c.strokeStyle = crew.color; c.lineWidth = selected ? 3 : 2;
    c.beginPath(); c.arc(ax, ay, 22, 0, Math.PI * 2); c.stroke();
    // head
    c.fillStyle = crew.color;
    c.beginPath(); c.arc(ax, ay - 7, 7, 0, Math.PI * 2); c.fill();
    // body arc
    c.beginPath(); c.arc(ax, ay + 13, 11, Math.PI, 0); c.fill();

    // Name
    c.fillStyle = lit ? '#fff' : '#999';
    c.font = `${selected ? 'bold ' : ''}11px monospace`;
    c.textAlign = 'center';
    c.fillText(crew.name, ax, portY + 68);
    // Current weapon
    c.fillStyle = lit ? 'rgba(255,200,170,0.6)' : 'rgba(130,100,80,0.45)';
    c.font = '9px monospace';
    c.fillText(crew.upgrade ? crew.upgrade.name : '\u2014', ax, portY + 82);
  }

  // Header labels
  const labelX = aliveCrew.length * (portW + portPad) + portPad + 20;
  c.fillStyle = '#c8a070'; c.font = 'bold 12px monospace'; c.textAlign = 'left';
  c.fillText('UPGRADE CREW', labelX, 30);
  c.fillStyle = '#7a6050'; c.font = '10px monospace';
  c.fillText(
    upgradePickPhase === 'choose_crew' ? 'Select a crew member' : `Upgrading: ${upgradePickCrew.name}`,
    labelX, 50
  );
  c.fillStyle = '#3a2820'; c.textAlign = 'right'; c.font = '9px monospace';
  c.fillText('ESC  skip', W - 20, 30);

  // \u2500\u2500 Choose-crew placeholder \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if (upgradePickPhase === 'choose_crew') {
    c.fillStyle = 'rgba(38, 16, 26, 0.52)';
    c.fillRect(0, PORT_H, SPLIT_X, H - PORT_H);
    c.fillStyle = 'rgba(255,255,255,0.04)';
    c.fillRect(SPLIT_X, PORT_H, 1, H - PORT_H);
    c.fillStyle = 'rgba(140,80,80,0.38)';
    c.font = '12px monospace'; c.textAlign = 'center';
    c.fillText('\u2190 select a crew member above', SPLIT_X / 2, PORT_H + 190);
    renderer.flush();
    return;
  }

  // \u2500\u2500 Left panel: upgrade list \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  c.fillStyle = 'rgba(70, 20, 40, 0.55)';
  c.fillRect(0, PORT_H, SPLIT_X, H - PORT_H);
  c.fillStyle = 'rgba(255,255,255,0.06)';
  c.fillRect(SPLIT_X, PORT_H, 1, H - PORT_H);

  c.fillStyle = ROSE_LT; c.font = 'bold 10px monospace'; c.textAlign = 'left';
  c.fillText('WEAPON CLASS', 28, PORT_H + 26);

  const lX = 28, lW = SPLIT_X - 52;
  const itemH = 94, itemGap = 10, listY0 = PORT_H + 46;
  const nodeX = lX + 14;

  // Tree line
  const treeTop = listY0 + itemH / 2;
  const treeBot = listY0 + (upgradePickChoices.length - 1) * (itemH + itemGap) + itemH / 2;
  c.strokeStyle = 'rgba(150,50,80,0.4)'; c.lineWidth = 2; c.setLineDash([3, 5]);
  c.beginPath(); c.moveTo(nodeX, treeTop); c.lineTo(nodeX, treeBot); c.stroke();
  c.setLineDash([]);

  for (let i = 0; i < upgradePickChoices.length; i++) {
    const upg = upgradePickChoices[i];
    const iy = listY0 + i * (itemH + itemGap);
    const hov = upgradePickHovered === i;

    upg._x = lX; upg._y = iy; upg._w = lW; upg._h = itemH;

    // Card
    c.fillStyle = hov ? 'rgba(125, 38, 68, 0.93)' : 'rgba(42, 16, 28, 0.88)';
    c.beginPath(); renderer.roundRect(lX, iy, lW, itemH, 7); c.fill();
    if (hov) {
      c.strokeStyle = ROSE_LT; c.lineWidth = 1.5;
      c.beginPath(); renderer.roundRect(lX, iy, lW, itemH, 7); c.stroke();
    }

    // Color stripe
    c.fillStyle = upg.color;
    c.beginPath(); renderer.roundRect(lX, iy + 8, 3, itemH - 16, 2); c.fill();

    // Node dot + connector
    c.fillStyle = hov ? upg.color : 'rgba(150,50,80,0.7)';
    c.beginPath(); c.arc(nodeX, iy + itemH / 2, 6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = hov ? upg.color : 'rgba(150,50,80,0.35)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(nodeX + 7, iy + itemH / 2); c.lineTo(lX + 14, iy + itemH / 2); c.stroke();

    // Diamond icon (top-right of card)
    const dX = lX + lW - 34, dY = iy + itemH / 2;
    c.save(); c.translate(dX, dY); c.rotate(Math.PI / 4);
    c.fillStyle = hov ? upg.color : 'rgba(160,80,110,0.28)';
    c.fillRect(-11, -11, 22, 22);
    c.restore();

    // Name
    c.fillStyle = hov ? '#fff' : '#c8a090';
    c.font = 'bold 13px monospace'; c.textAlign = 'left';
    c.fillText(upg.name, lX + 18, iy + 23);

    // Type badge
    const typeLabel = upg.melee ? 'MELEE' : 'RANGED';
    const typeFill = upg.melee ? 'rgba(80,28,16,0.9)' : 'rgba(16,38,72,0.9)';
    const typeColor = upg.melee ? '#ff8a65' : '#64b5f6';
    c.fillStyle = typeFill;
    c.beginPath(); renderer.roundRect(lX + 18, iy + 31, 56, 15, 3); c.fill();
    c.fillStyle = typeColor; c.font = 'bold 8px monospace'; c.textAlign = 'center';
    c.fillText(typeLabel, lX + 18 + 28, iy + 42);

    // Short desc
    const desc = upg.desc.length > 36 ? upg.desc.slice(0, 34) + '\u2026' : upg.desc;
    c.fillStyle = hov ? 'rgba(255,225,205,0.75)' : '#684848';
    c.font = '10px monospace'; c.textAlign = 'left';
    c.fillText(desc, lX + 18, iy + 63);

    // Stats
    c.fillStyle = hov ? 'rgba(255,195,165,0.55)' : '#4c3030';
    c.font = '9px monospace';
    if (upg.melee) {
      c.fillText(`AOE ${upg.garlicRadius}px  DMG ${upg.damage}`, lX + 18, iy + 80);
    } else {
      c.fillText(`DMG ${upg.damage}  RNG ${upg.range}  ${upg.fireRate}/s`, lX + 18, iy + 80);
    }
  }

  // \u2500\u2500 Right panel: detail \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const rX = SPLIT_X + 1, rW = W - SPLIT_X - 1;

  if (upgradePickHovered < 0 || upgradePickHovered >= upgradePickChoices.length) {
    c.fillStyle = 'rgba(100,60,50,0.22)';
    c.font = '12px monospace'; c.textAlign = 'center';
    c.fillText('hover an upgrade to preview', rX + rW / 2, PORT_H + 210);
    renderer.flush();
    return;
  }

  const upg = upgradePickChoices[upgradePickHovered];
  const iCX = rX + rW / 2, iCY = PORT_H + 128;

  // Large diamond icon
  const DS = 54;
  c.save(); c.translate(iCX, iCY); c.rotate(Math.PI / 4);
  c.fillStyle = upg.color; c.globalAlpha = 0.11;
  c.fillRect(-DS, -DS, DS * 2, DS * 2);
  c.globalAlpha = 1;
  c.strokeStyle = upg.color; c.lineWidth = 2.5;
  c.strokeRect(-DS * 0.72, -DS * 0.72, DS * 1.44, DS * 1.44);
  c.restore();

  // Color fill circle inside
  c.fillStyle = upg.color; c.globalAlpha = 0.85;
  c.beginPath(); c.arc(iCX, iCY, 18, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1;

  // Upgrade name
  c.fillStyle = '#ecdcc8'; c.font = 'bold 21px monospace'; c.textAlign = 'center';
  c.fillText(upg.name, iCX, PORT_H + 212);

  // Type label
  c.fillStyle = '#7a5848'; c.font = '10px monospace';
  c.fillText(upg.melee ? 'MELEE  CLASS' : 'RANGED  CLASS', iCX, PORT_H + 230);

  // Divider
  c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(rX + 36, PORT_H + 244); c.lineTo(rX + rW - 36, PORT_H + 244); c.stroke();

  // Description (word-wrapped)
  c.fillStyle = '#9a7868'; c.font = '12px monospace'; c.textAlign = 'left';
  const maxLW = rW - 72;
  const words = upg.desc.split(' ');
  let line = '', lY = PORT_H + 268;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (c.measureText(test).width > maxLW && line) {
      c.fillText(line, rX + 36, lY); line = word; lY += 18;
    } else { line = test; }
  }
  if (line) c.fillText(line, rX + 36, lY);

  // Stats block
  const sY = PORT_H + 372;
  c.fillStyle = 'rgba(255,255,255,0.05)';
  c.fillRect(rX + 24, sY - 18, rW - 48, 58);

  const stats = upg.melee
    ? [['AOE', `${upg.garlicRadius}px`], ['DMG', String(upg.damage)], ['STYLE', 'Instant']]
    : [['DMG', String(upg.damage)], ['RATE', `${upg.fireRate}/s`], ['RNG', `${upg.range}px`]];

  const sColW = (rW - 48) / stats.length;
  for (let si = 0; si < stats.length; si++) {
    const sx = rX + 24 + si * sColW + sColW / 2;
    c.fillStyle = '#644838'; c.font = '9px monospace'; c.textAlign = 'center';
    c.fillText(stats[si][0], sx, sY);
    c.fillStyle = '#d0b090'; c.font = 'bold 15px monospace';
    c.fillText(stats[si][1], sx, sY + 20);
  }

  // Pick hint
  c.fillStyle = '#4a2c20'; c.font = '10px monospace'; c.textAlign = 'center';
  c.fillText('click upgrade to select', iCX, H - 28);

  renderer.flush();
}

// === GAME OVER ===

let gameOverType = 'death';

function spawnConfettiBurst(count = 6) {
  for (let i = 0; i < count; i++) setTimeout(() => renderer.spawnConfetti(), i * 150);
}

function enterGameOver() {
  stopLowHPWarning();
  state = STATES.GAMEOVER;
  gameOverType = won ? 'combat' : 'death';
  if (won) {
    playPowerup();
    spawnConfettiBurst();
  } else {
    playDefeatMp3();
  }
}

function enterZoneComplete() {
  won = true;
  gameOverType = 'zone';
  state = STATES.GAMEOVER;
  playZoneCompleteMp3();
  spawnConfettiBurst();
}

function enterWorldComplete() {
  won = true;
  gameOverType = 'world';
  state = STATES.GAMEOVER;
  playWinWorldMp3();
  spawnConfettiBurst(15);
}

const gameOverBtns = {
  continue: { x: CANVAS_WIDTH / 2 - 70, y: CANVAS_HEIGHT / 2 + 70, w: 140, h: 44 },
  shop:     { x: CANVAS_WIDTH / 2 - 150, y: CANVAS_HEIGHT / 2 + 70, w: 130, h: 44 },
  nextZone: { x: CANVAS_WIDTH / 2 + 20, y: CANVAS_HEIGHT / 2 + 70, w: 130, h: 44 },
};

function updateGameOver() {
  const confirmKey = input.keyPressed('Space') || input.keyPressed('Enter');

  if (gameOverType === 'zone') {
    if (confirmKey || (input.clicked && input.hitRect(gameOverBtns.nextZone.x, gameOverBtns.nextZone.y, gameOverBtns.nextZone.w, gameOverBtns.nextZone.h))) {
      newZone();
      // newZone sets state to ZONE_MAP already
      return;
    }
  } else if (gameOverType === 'combat') {
    // After combat win: heal crew and return to zone map
    if (confirmKey || (input.clicked && input.hitRect(gameOverBtns.continue.x, gameOverBtns.continue.y, gameOverBtns.continue.w, gameOverBtns.continue.h))) {
      // Between-fight healing: each alive crew heals 50% of missing HP
      for (const c of train.crew) {
        if (c.alive) {
          const missing = c.maxHp - c.hp;
          c.hp += missing * CREW_HEAL_BETWEEN_FIGHTS;
        }
      }
      state = STATES.ZONE_MAP;
      return;
    }
  } else {
    if (confirmKey || (input.clicked && input.hitRect(gameOverBtns.continue.x, gameOverBtns.continue.y, gameOverBtns.continue.w, gameOverBtns.continue.h))) {
      state = STATES.START_SCREEN;
      return;
    }
  }
}

function renderGameOver() {
  train.updateWorldPositions(trainWorldX, trainWorldY);
  renderer.setCameraOffset(cameraOffsetX);
  renderer.drawTerrain(train.distance);
  renderer.drawEnemies(spawner.pool);
  renderer.drawTrain(train);
  renderer.drawWeaponMounts(train, null);
  renderer.drawMovingCrew(train.crew);
  renderer.drawGameOver(won, train, 0, gameOverBtns, input, gameOverType, 0);
  renderer.updateAndDrawConfetti(0.016);
  renderer.flush();
}

// === PAUSED ===

let kbPauseIndex = 0;
const pauseKeys = ['resume', 'restart', 'quit'];

let activeSliderDrag = null;
const SLIDER_X = CANVAS_WIDTH / 2 - 100;
const SLIDER_W = 200;

function updateVolumeSliders(musicY, sfxY) {
  if (input.clicked) {
    if (input.hitRect(SLIDER_X - 10, musicY - 10, SLIDER_W + 20, 20)) activeSliderDrag = 'music';
    else if (input.hitRect(SLIDER_X - 10, sfxY - 10, SLIDER_W + 20, 20)) activeSliderDrag = 'sfx';
  }
  if (!input.mouseDown) activeSliderDrag = null;
  if (activeSliderDrag) {
    const val = Math.max(0, Math.min(1, (input.mouseX - SLIDER_X) / SLIDER_W));
    if (activeSliderDrag === 'music') setMusicVolume(val);
    else setSfxVolume(val);
    return true;
  }
  return false;
}

function updatePaused() {
  if (input.keyPressed('Escape')) {
    state = stateBeforePause;
    lastTime = performance.now();
    activeSliderDrag = null;
    return;
  }

  if (updateVolumeSliders(460, 500)) return;

  if (input.keyPressed('ArrowDown') || input.keyPressed('KeyS')) {
    kbPauseIndex = Math.min(pauseKeys.length - 1, kbPauseIndex + 1);
  }
  if (input.keyPressed('ArrowUp') || input.keyPressed('KeyW')) {
    kbPauseIndex = Math.max(0, kbPauseIndex - 1);
  }

  const confirmKey = input.keyPressed('Space') || input.keyPressed('Enter');
  const clickedBtn = (key) => {
    const b = pauseButtons[key];
    return input.clicked && input.hitRect(b.x, b.y, b.w, b.h);
  };

  if (clickedBtn('resume') || (confirmKey && kbPauseIndex === 0)) {
    state = stateBeforePause;
    lastTime = performance.now();
  } else if (clickedBtn('restart') || (confirmKey && kbPauseIndex === 1)) {
    startNewWorld();
    state = STATES.ZONE_MAP;
  } else if (clickedBtn('quit') || (confirmKey && kbPauseIndex === 2)) {
    state = STATES.START_SCREEN;
  }
}

function renderPaused() {
  train.updateWorldPositions(trainWorldX, trainWorldY);
  renderer.setCameraOffset(cameraOffsetX);
  renderer.drawTerrain(train.distance);
  renderer.drawEnemies(spawner.pool);
  renderer.drawTrain(train);
  renderer.drawWeaponMounts(train, null);
  renderer.drawMovingCrew(train.crew);
  renderer.drawPauseMenu(pauseButtons, input, kbPauseIndex);

  const rctx = renderer.ctx;
  drawSlider(rctx, 'Music', SLIDER_X, 460, SLIDER_W, getMusicVolume());
  drawSlider(rctx, 'SFX', SLIDER_X, 500, SLIDER_W, getSfxVolume());

  renderer.flush();
}

function drawSlider(ctx, label, x, y, w, value) {
  ctx.fillStyle = '#aaa';
  ctx.font = '16px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(label, x - 16, y + 5);
  ctx.fillStyle = '#444';
  ctx.fillRect(x, y - 3, w, 6);
  ctx.fillStyle = '#f5a623';
  ctx.fillRect(x, y - 3, w * value, 6);
  const hx = x + w * value;
  ctx.beginPath();
  ctx.arc(hx, y, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = '#f5a623';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ccc';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.round(value * 100)}%`, x + w + 16, y + 5);
}

// === SETTINGS ===

const settingsBackBtn = { x: CANVAS_WIDTH / 2 - 60, y: 440, w: 120, h: 40 };

function updateSettings() {
  if (input.keyPressed('Escape')
      || (input.clicked && input.hitRect(settingsBackBtn.x, settingsBackBtn.y, settingsBackBtn.w, settingsBackBtn.h))) {
    state = STATES.START_SCREEN;
    activeSliderDrag = null;
    return;
  }
  updateVolumeSliders(260, 330);
}

function renderSettings() {
  renderer.setCameraOffset(0);
  renderer.drawTerrain(0);
  const rctx = renderer.ctx;
  rctx.fillStyle = 'rgba(0,0,0,0.7)';
  rctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  rctx.fillStyle = '#fff';
  rctx.font = 'bold 28px monospace';
  rctx.textAlign = 'center';
  rctx.fillText('SETTINGS', CANVAS_WIDTH / 2, 200);
  drawSlider(rctx, 'Music', SLIDER_X, 260, SLIDER_W, getMusicVolume());
  drawSlider(rctx, 'SFX', SLIDER_X, 330, SLIDER_W, getSfxVolume());
  const bb = settingsBackBtn;
  const hovered = input.hitRect(bb.x, bb.y, bb.w, bb.h);
  rctx.fillStyle = hovered ? '#555' : '#333';
  rctx.beginPath();
  renderer.roundRect(bb.x, bb.y, bb.w, bb.h, 6);
  rctx.fill();
  rctx.fillStyle = '#fff';
  rctx.font = 'bold 16px monospace';
  rctx.textAlign = 'center';
  rctx.fillText('Back', CANVAS_WIDTH / 2, bb.y + 26);
  renderer.flush();
}

// === ZONE MAP ===

let stationArrival = null;
let musicStarted = false;

function updateZoneMap() {
  if (!musicStarted && input.clicked) {
    startMusic();
    preloadSfx();
    musicStarted = true;
  }

  if (stationArrival) {
    updateStationArrival(0.016);
    return;
  }

  // Settings button
  const settingsBtn = { x: CANVAS_WIDTH - 110, y: 44, w: 90, h: 30 };
  if (input.clicked && input.hitRect(settingsBtn.x, settingsBtn.y, settingsBtn.w, settingsBtn.h)) {
    state = STATES.SETTINGS;
    return;
  }

  if (input.clicked) {
    for (const s of zone.stations) {
      if (!zone.canTravelTo(s.id)) continue;
      const pad = 60;
      const mapW = CANVAS_WIDTH - pad * 2;
      const mapH = CANVAS_HEIGHT - 100;
      const mapY = 55;
      const stX = pad + s.x * mapW;
      const stY = mapY + s.y * mapH;
      const dx = input.mouseX - stX;
      const dy = input.mouseY - stY;
      if (dx * dx + dy * dy <= 20 * 20) {
        zone.travelTo(s.id);
        enterStation(s);
        return;
      }
    }
  }
}

function enterStation(station) {
  if (station.type === STATION_TYPES.START) return;

  const isPreBoss = station.type === STATION_TYPES.COMBAT &&
    station.connections.some(id => zone.stations[id].type === STATION_TYPES.EXIT);

  const typeLabels = {
    combat: isPreBoss ? '\ud83d\udc80 FINAL BATTLE! \ud83d\udc80' : '\u2694 ZOMBIES AHEAD! \u2694',
    empty: '\u2014 Quiet Stop \u2014',
    start: '',
    exit: '\u2605 ZONE COMPLETE! \u2605',
    shop: '\ud83d\uded2 UPGRADE AVAILABLE',
  };

  stationArrival = {
    type: station.type,
    label: typeLabels[station.type] || '',
    timer: station.type === STATION_TYPES.EMPTY ? 1.0 : station.type === STATION_TYPES.SHOP ? 0.8 : 1.5,
    station,
    acted: false,
    isPreBoss,
  };
}

function updateStationArrival(dt) {
  if (!stationArrival) return false;
  stationArrival.timer -= dt;

  if (stationArrival.timer <= 0 && !stationArrival.acted) {
    stationArrival.acted = true;
    const s = stationArrival.station;
    switch (s.type) {
      case STATION_TYPES.COMBAT: {
        combatDifficulty = 1 + (zoneNumber - 1) * ZONE_DIFFICULTY_SCALE;
        const isBoss = stationArrival.isPreBoss || false;
        if (isBoss) combatDifficulty *= 1.6;
        prepareForCombat(isBoss, s.modifier || null);
        break;
      }
      case STATION_TYPES.SHOP:
        // Enter upgrade pick — player picks one crew to upgrade
        startUpgradePick();
        break;
      case STATION_TYPES.EXIT:
        if (zoneNumber >= ZONES_PER_WORLD) {
          enterWorldComplete();
        } else {
          enterZoneComplete();
        }
        break;
      case STATION_TYPES.EMPTY:
        break;
    }
    stationArrival = null;
  }
  return true;
}

function renderZoneMap() {
  renderer.drawZoneMap(zone, input, save);
  if (stationArrival) renderer.drawStationArrival(stationArrival);
  renderer.flush();
}

// === START SCREEN ===

const startScreenBtns = {
  start:    { x: CANVAS_WIDTH / 2 - 120, y: CANVAS_HEIGHT / 2 + 20,  w: 240, h: 50 },
  settings: { x: CANVAS_WIDTH / 2 - 120, y: CANVAS_HEIGHT / 2 + 82,  w: 240, h: 50 },
};

function updateStartScreen() {
  if (!input.clicked) return;
  if (input.hitRect(startScreenBtns.start.x, startScreenBtns.start.y, startScreenBtns.start.w, startScreenBtns.start.h)) {
    selectedWorld = WORLDS[0];
    startNewWorld();
    combatDifficulty = selectedWorld.difficulty;
    state = STATES.ZONE_MAP; // skip world map, go straight to zone
  } else if (input.hitRect(startScreenBtns.settings.x, startScreenBtns.settings.y, startScreenBtns.settings.w, startScreenBtns.settings.h)) {
    state = STATES.SETTINGS;
  }
}

function renderStartScreen() {
  renderer.setCameraOffset(0);
  renderer.drawStartScreen(startScreenBtns, input, 0);
  renderer.flush();
}

// === WORLD MAP (simplified — no role pick, just enter zone) ===

function getWorldMapZones() {
  const nodeR = 48;
  const gap = 120;
  const total = ZONES_PER_WORLD * nodeR * 2 + (ZONES_PER_WORLD - 1) * gap;
  const startX = CANVAS_WIDTH / 2 - total / 2 + nodeR;
  const cy = CANVAS_HEIGHT / 2 - 10;
  return Array.from({ length: ZONES_PER_WORLD }, (_, i) => ({
    index: i,
    number: i + 1,
    cx: startX + i * (nodeR * 2 + gap),
    cy,
    r: nodeR,
    completed: zoneNumber > i + 1,
    isCurrent: zoneNumber === i + 1,
    isLocked: zoneNumber < i + 1,
  }));
}

function updateWorldMap() {
  const zones = getWorldMapZones();
  for (const z of zones) {
    if (!z.isCurrent) continue;
    if (input.clicked) {
      const dx = input.mouseX - z.cx, dy = input.mouseY - z.cy;
      if (dx * dx + dy * dy <= z.r * z.r) {
        state = STATES.ZONE_MAP;
      }
    }
  }
  if (input.keyPressed('Escape')) state = STATES.START_SCREEN;
}

function renderWorldMap() {
  renderer.drawWorldMap(getWorldMapZones(), selectedWorld, zoneNumber, input);
  renderer.flush();
}

// === MAIN LOOP ===

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;
  renderer.clear();

  if (window.DEVTOOLS && input.keyPressed('F3')) debugMode = !debugMode;

  // Esc toggles pause from running/setup
  if (state === STATES.RUNNING && input.keyPressed('Escape')) {
    stateBeforePause = state;
    state = STATES.PAUSED;
    input.endFrame();
    renderPaused();
    requestAnimationFrame(loop);
    return;
  }

  switch (state) {
    case STATES.START_SCREEN:  updateStartScreen();  renderStartScreen();  break;
    case STATES.WORLD_MAP:     updateWorldMap();     renderWorldMap();     break;
    case STATES.ZONE_MAP:      updateZoneMap();      renderZoneMap();      break;
    case STATES.SETUP:         updateSetup(dt);      renderSetup();        break;
    case STATES.RUNNING:       updateRun(dt);        renderRun();          break;
    case STATES.GAMEOVER:      updateGameOver();     renderGameOver();     break;
    case STATES.PAUSED:        updatePaused();       renderPaused();       break;
    case STATES.SETTINGS:      updateSettings();     renderSettings();     break;
    case STATES.RUN_PAUSE:     updateRunPause();     renderRunPause();     break;
    case STATES.UPGRADE_PICK:  updateUpgradePick();  renderUpgradePick();  break;
  }
  input.endFrame();
  requestAnimationFrame(loop);
}

startNewWorld();
state = STATES.START_SCREEN;
requestAnimationFrame(loop);
