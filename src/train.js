import {
  CAR_WIDTH, CAR_HEIGHT, CAR_GAP,
  MOUNT_RADIUS, WEAPON_CONE_HALF_ANGLE, WEAPON_RANGE,
  WEAPON_FIRE_RATE, WEAPON_DAMAGE, CREW_COLORS,
  CREW_UPGRADES, SHOP_TUNING, CREW_MAX_HP, CARGO_CAR_HP
} from './constants.js';

const CREW_MOVE_SPEED = 140; // px/sec — fast enough to feel responsive across a long train
const DOOR_PAUSE = 0.3;     // seconds to pass through a door

export class WeaponMount {
  constructor(localX, localY, baseDirection) {
    this.localX = localX;
    this.localY = localY;
    this.baseDirection = baseDirection;
    this.coneDirection = baseDirection;
    this.coneHalfAngle = WEAPON_CONE_HALF_ANGLE;
    this.cooldownTimer = 0;
    this.crew = null;
    this.worldX = 0;
    this.worldY = 0;
  }

  clampAngle(angle) {
    let diff = angle - this.baseDirection;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) <= this.coneHalfAngle) return angle;
    return this.baseDirection + Math.sign(diff) * this.coneHalfAngle;
  }

  get isManned() { return this.crew !== null; }
  get isOccupied() { return this.crew !== null; }

  // Stats based on crew upgrade (or defaults)
  get damage() {
    if (this.crew && this.crew.upgrade) return this.crew.upgrade.damage;
    return WEAPON_DAMAGE;
  }

  get fireRate() {
    if (this.crew && this.crew.upgrade) return this.crew.upgrade.fireRate;
    return WEAPON_FIRE_RATE;
  }

  get range() {
    if (this.crew && this.crew.upgrade) return this.crew.upgrade.range;
    return WEAPON_RANGE;
  }
}


export class Door {
  constructor() {
    this.openAmount = 0;
    this.isOpening = false;
  }

  update(dt) {
    if (this.isOpening) {
      this.openAmount = Math.min(1, this.openAmount + dt / (DOOR_PAUSE * 0.5));
    } else {
      this.openAmount = Math.max(0, this.openAmount - dt / (DOOR_PAUSE * 0.5));
    }
  }
}

export class TrainCar {
  constructor(type, index) {
    this.type = type;
    this.index = index;
    this.width = CAR_WIDTH;
    this.height = CAR_HEIGHT;
    this.localX = index * (CAR_WIDTH + CAR_GAP);
    this.mounts = [];
    this.worldX = 0;
    this.worldY = 0;
    this.doorRight = new Door();

    if (type === 'weapon') {
      const m = MOUNT_RADIUS + 2;
      const UPPER_OUT = -Math.PI * 3 / 4;
      const LOWER_OUT = Math.PI / 4;
      this.mounts.push(new WeaponMount(m, m, UPPER_OUT));
      this.mounts.push(new WeaponMount(CAR_WIDTH - m, m, UPPER_OUT));
      this.mounts.push(new WeaponMount(m, CAR_HEIGHT - m, LOWER_OUT));
      this.mounts.push(new WeaponMount(CAR_WIDTH - m, CAR_HEIGHT - m, LOWER_OUT));
    }

    // Cargo cars have HP and a virtual bandit slot (center of car)
    if (type === 'cargo') {
      this.hp = CARGO_CAR_HP;
      this.maxHp = CARGO_CAR_HP;
      this.alive = true;
      // Virtual slot for bandit targeting — positioned at car center
      this.banditSlot = {
        worldX: 0, worldY: 0,
        screenX: undefined, screenY: undefined,
        crew: null,       // crew sent to fight bandit here
        _bandit: null,    // bandit sitting on this car
        _isCargoBanditSlot: true,
      };
    } else {
      this.hp = 0;
      this.maxHp = 0;
      this.alive = true; // weapon cars are always "alive" (no HP to lose)
    }
  }

  get doorRightX() { return this.worldX + this.width + CAR_GAP / 2; }
  get doorRightY() { return this.worldY + this.height / 2; }
}

const CREW_NAMES = ['Rex', 'Kit'];

export class CrewMember {
  constructor(id) {
    this.id = id;
    this.color = CREW_COLORS[id];
    this.name = CREW_NAMES[id] || null;
    this.assignment = null;
    this.reassignCooldown = 0;
    this.panelX = 0;
    this.panelY = 0;

    // HP
    this.hp = CREW_MAX_HP;
    this.maxHp = CREW_MAX_HP;
    this.alive = true;

    // Start as brawler — melee AOE, upgrade to ranged later
    this.upgrade = { ...CREW_UPGRADES.brawler };
    this.upgradeId = 'brawler';

    // Brawler garlic state
    this._garlicTickTimer = 0;

    // Movement state
    this.isMoving = false;
    this.moveX = 0;
    this.moveY = 0;
    this.movePath = [];
    this.moveTargetSlot = null;
    this.pauseTimer = 0;
    this.stationaryTime = 0;

  }

  get isDead() { return !this.alive; }

  applyUpgrade(upgradeId) {
    const def = CREW_UPGRADES[upgradeId];
    if (!def) return;
    this.upgrade = { ...def };
    this.upgradeId = upgradeId;
  }

  get isBrawler() {
    return this.upgrade && this.upgrade.melee;
  }

  startMove(fromX, fromY, targetSlot, path) {
    this.isMoving = true;
    this.moveX = fromX;
    this.moveY = fromY;
    this.movePath = path;
    this.moveTargetSlot = targetSlot;
    this.pauseTimer = 0;
    this.stationaryTime = 0;
  }

  updateMove(dt) {
    if (!this.isMoving) return false;

    if (this.pauseTimer > 0) {
      this.pauseTimer -= dt;
      return false;
    }

    if (this.movePath.length === 0) {
      this.isMoving = false;
      return true;
    }

    const wp = this.movePath[0];
    const dx = wp.x - this.moveX;
    const dy = wp.y - this.moveY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 2) {
      this.moveX = wp.x;
      this.moveY = wp.y;
      if (wp.pause) this.pauseTimer = wp.pause;
      this.movePath.shift();
      return false;
    }

    const step = CREW_MOVE_SPEED * dt;
    this.moveX += (dx / dist) * Math.min(step, dist);
    this.moveY += (dy / dist) * Math.min(step, dist);
    return false;
  }
}

export class Train {
  constructor() {
    this.cars = [
      new TrainCar('weapon', 0),
      new TrainCar('cargo', 1),
      new TrainCar('weapon', 2),
      new TrainCar('weapon', 3),
      new TrainCar('cargo', 4),
      new TrainCar('weapon', 5),
      new TrainCar('weapon', 6),
      new TrainCar('cargo', 7),
    ];
    // Train-level HP removed — damage now targets crew and cargo cars.
    // Stub values kept for renderer compat (drawHUD in pause menu).
    this.hp = 100;
    this.maxHp = 100;
    this.distance = 0;
    this.damageFlash = 0;
    this.shakeTimer = 0;
    this.hpFlashTimer = 0;
    this.hpGreenFlashTimer = 0;

    this.passives = { damage: 0, maxHp: 0 };
    // Renderer compat stubs
    this.autoWeapons = {}; this.defenseSlots = [];
    this.xp = 0; this.level = 1; this.runGold = 0; this.cargoBoxes = 0;

    // Crew — 2 generic members
    this.crew = [
      new CrewMember(0),
      new CrewMember(1),
    ];
    this.maxCrew = 2;
  }

  get cargoCars() { return this.cars.filter(c => c.type === 'cargo'); }
  get aliveCargoCars() { return this.cars.filter(c => c.type === 'cargo' && c.alive); }
  get allCrewDead() { return this.crew.every(c => !c.alive); }

  get allMounts() {
    if (!this._mounts) this._mounts = this.cars.flatMap(c => c.mounts);
    return this._mounts;
  }

  get allSlots() { return this.allMounts; }
  get xpToNextLevel() { return 1; }
  get cargoMultiplier() { return 1.0; } // renderer compat

  get totalDamageMultiplier() { return 1 + this.passives.damage * (SHOP_TUNING.damage.perLevel / 100); }
  get totalCooldownMultiplier() { return 1; }
  get totalAreaMultiplier() { return 1; }

  get hasEmptyMount() { return this.allMounts.some(m => !m.isOccupied); }
  get centerX() { return this.cars[0].worldX + CAR_WIDTH / 2; }
  get centerY() { return this.cars[0].worldY + CAR_HEIGHT / 2; }

  updateWorldPositions(screenX, screenY) {
    for (const car of this.cars) {
      car.worldX = screenX + car.localX;
      car.worldY = screenY;
      for (const m of car.mounts) {
        m.worldX = car.worldX + m.localX;
        m.worldY = car.worldY + m.localY;
      }
      // Update cargo car bandit slot position (center of car)
      if (car.banditSlot) {
        car.banditSlot.worldX = car.worldX + car.width / 2;
        car.banditSlot.worldY = car.worldY + car.height / 2;
      }
    }
  }

  findCarForSlot(slot) {
    for (const car of this.cars) {
      if (car.mounts.includes(slot)) return car;
      if (car.banditSlot === slot) return car;
    }
    return null;
  }

  buildCrewPath(startX, startY, startCar, targetSlot) {
    const targetCar = this.findCarForSlot(targetSlot);
    if (!targetCar) return [];
    const path = [];
    const cy = startCar.worldY + CAR_HEIGHT / 2;

    if (startCar === targetCar) {
      path.push({ x: targetSlot.worldX, y: targetSlot.worldY, pause: 0 });
      return path;
    }

    path.push({ x: startX, y: cy, pause: 0 });
    const startIdx = startCar.index;
    const endIdx = targetCar.index;
    const dir = endIdx > startIdx ? 1 : -1;

    for (let i = startIdx; i !== endIdx; i += dir) {
      const fromCar = this.cars[i];
      const toCar = this.cars[i + dir];
      const doorCar = dir > 0 ? fromCar : toCar;
      path.push({ x: doorCar.doorRightX, y: doorCar.doorRightY, pause: DOOR_PAUSE, doorCar });
      path.push({ x: toCar.worldX + CAR_WIDTH / 2, y: cy, pause: 0 });
    }

    path.push({ x: targetSlot.worldX, y: targetSlot.worldY, pause: 0 });
    return path;
  }

  startCrewMove(crew, fromX, fromY, fromCar, targetSlot) {
    if (targetSlot.crew) targetSlot.crew.assignment = null;
    const path = this.buildCrewPath(fromX, fromY, fromCar, targetSlot);
    crew.startMove(fromX, fromY, targetSlot, path);
  }

  assignCrew(crew, slot) {
    if (crew.assignment) crew.assignment.crew = null;
    if (slot.crew) slot.crew.assignment = null;
    crew.assignment = slot;
    slot.crew = crew;
    crew.isMoving = false;
    crew.movePath = [];
    return true;
  }

  unassignCrew(crew) {
    if (crew.assignment) {
      crew.assignment.crew = null;
      crew.assignment = null;
    }
  }

  updateCrewMovement(dt) {
    for (const car of this.cars) car.doorRight.isOpening = false;

    for (const c of this.crew) {
      if (!c.isMoving || c.movePath.length === 0) continue;
      const wp = c.movePath[0];
      if (wp.doorCar) wp.doorCar.doorRight.isOpening = true;
    }

    for (const car of this.cars) car.doorRight.update(dt);

    for (const c of this.crew) {
      if (c.isMoving) {
        c.stationaryTime = 0;
        const arrived = c.updateMove(dt);
        if (arrived && c.moveTargetSlot) {
          this.assignCrew(c, c.moveTargetSlot);
          c.moveTargetSlot = null;
        }
      } else if (c.assignment) {
        c.stationaryTime += dt;
      }
    }
  }
}
