import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  MAX_PROJECTILES, PROJECTILE_SPEED, PROJECTILE_LIFETIME, PROJECTILE_RADIUS,
} from './constants.js';
import { playShoot, playEnemyHit, playEnemyKill, playTrainDamage, playGarlicTick } from './audio.js';
import { BANDIT_STATES } from './bandits.js';

export class Projectile {
  constructor() {
    this.active = false;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.damage = 0;
    this.lifetime = 0;
    this.radius = PROJECTILE_RADIUS;
    this.source = 'crew';
    this.color = '#ffeeaa';
  }

  spawn(x, y, angle, damage, source = 'crew', color = '#ffeeaa') {
    this.active = true;
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * PROJECTILE_SPEED;
    this.vy = Math.sin(angle) * PROJECTILE_SPEED;
    this.damage = damage;
    this.lifetime = PROJECTILE_LIFETIME;
    this.source = source;
    this.color = color;
  }

  update(dt) {
    if (!this.active) return;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.lifetime -= dt;
    if (this.lifetime <= 0) this.active = false;
  }
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class CombatSystem {
  constructor() {
    this.projectiles = [];
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      this.projectiles.push(new Projectile());
    }
    // Legacy compat — empty arrays
    this.ricochetBolts = [];
    this.damageNumbers = []; // kept empty for renderer compat
    this.pendingLevelUp = false;
    this.killEffects = [];
    this.muzzleFlashes = [];
    this.hitSparks = [];
  }

  handleEnemyDamageResult(e, train, ex = 0, ey = 0, ecolor = '#2d6a2e') {
    if (!e.active) {
      playEnemyKill();
      this.killEffects.push({ x: ex, y: ey, color: ecolor });
    } else {
      playEnemyHit();
    }
  }

  leadAngle(mount, target) {
    const dx = target.x - mount.worldX;
    const dy = target.y - mount.worldY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const t = dist / PROJECTILE_SPEED;
    const lx = target.x + (target.vx || 0) * t;
    const ly = target.y + (target.vy || 0) * t;
    return Math.atan2(ly - mount.worldY, lx - mount.worldX);
  }

  update(dt, train, enemies) {
    // Update projectiles
    for (const p of this.projectiles) p.update(dt);

    const areaMult = train.totalAreaMultiplier;

    // All manned mounts autofire
    for (const mount of train.allMounts) {
      if (!mount.isManned) continue;
      const crew = mount.crew;

      // Bandit suppression — use bandit's own degradation factor
      let banditMult = 1.0;
      if (mount._bandit) {
        if (mount._bandit.state !== BANDIT_STATES.ON_TRAIN) { banditMult = 0; }
        else { banditMult = mount._bandit.getWeaponFactor ? mount._bandit.getWeaponFactor() : 1.0; }
      }
      if (banditMult <= 0) continue;

      // Brawler crew: melee AOE instead of projectiles
      if (crew.isBrawler) {
        crew._garlicTickTimer -= dt;
        if (crew._garlicTickTimer <= 0) {
          const upg = crew.upgrade;
          crew._garlicTickTimer = upg.garlicTickRate;
          playGarlicTick();
          const r = upg.garlicRadius * areaMult;
          const r2 = r * r;
          const mx = mount.worldX, my = mount.worldY;
          const dmg = upg.damage * train.totalDamageMultiplier * banditMult;
          for (const e of enemies) {
            if (!e.active) continue;
            const dx = e.x - mx, dy = e.y - my;
            const distSq = dx * dx + dy * dy;
            if (distSq <= r2) {
              const ex = e.x, ey = e.y, ecolor = e.color;
              const dist = Math.sqrt(distSq) || 1;
              e.knockbackVX += (dx / dist) * 250;
              e.knockbackVY += (dy / dist) * 250;
              e.takeDamage(dmg);
              this.handleEnemyDamageResult(e, train, ex, ey, ecolor);
              if (e.active) this.hitSparks.push({ x: e.x, y: e.y });
            }
          }
        }
        continue;
      }

      // Rotate toward nearest enemy (auto-aim, no cone check for rotation)
      const nearest = this.findTarget(mount, enemies, areaMult, false);
      if (nearest) {
        const desiredAngle = mount.clampAngle(
          Math.atan2(nearest.y - mount.worldY, nearest.x - mount.worldX)
        );
        const diff = normalizeAngle(desiredAngle - mount.coneDirection);
        const maxRot = 2.0 * dt;
        if (Math.abs(diff) < maxRot) {
          mount.coneDirection = desiredAngle;
        } else {
          mount.coneDirection = mount.clampAngle(mount.coneDirection + Math.sign(diff) * maxRot);
        }
      }

      // Fire
      mount.cooldownTimer -= dt;
      if (mount.cooldownTimer > 0) continue;

      const target = this.findTarget(mount, enemies, areaMult);
      if (!target) continue;

      const angle = this.leadAngle(mount, target);
      const damage = mount.damage * train.totalDamageMultiplier * banditMult;

      // Shotgun spread
      const upg = crew.upgrade;
      if (upg && upg.spread) {
        for (let s = 0; s < upg.spread; s++) {
          const spreadAngle = angle + (s - (upg.spread - 1) / 2) * 0.12;
          this.fireProjectile(mount.worldX, mount.worldY, spreadAngle, damage, 'crew', crew.color);
        }
      } else {
        this.fireProjectile(mount.worldX, mount.worldY, angle, damage, 'crew', crew.color);
      }

      mount.cooldownTimer = (1 / (mount.fireRate * banditMult)) * train.totalCooldownMultiplier;
      if (mount.screenX !== undefined && mount.screenY !== undefined) {
        this.muzzleFlashes.push({ x: mount.screenX, y: mount.screenY });
      }
      playShoot();
    }

    // Walking brawlers: garlic AOE from their walk position
    for (const crew of train.crew) {
      if (!crew.alive || !crew.isMoving || !crew.isBrawler) continue;
      const upg = crew.upgrade;
      crew._garlicTickTimer -= dt;
      if (crew._garlicTickTimer <= 0) {
        crew._garlicTickTimer = upg.garlicTickRate;
        playGarlicTick();
        const r = upg.garlicRadius * areaMult;
        const r2 = r * r;
        const mx = crew.moveX, my = crew.moveY;
        const dmg = upg.damage * train.totalDamageMultiplier;
        for (const e of enemies) {
          if (!e.active) continue;
          const dx = e.x - mx, dy = e.y - my;
          const distSq = dx * dx + dy * dy;
          if (distSq <= r2) {
            const ex = e.x, ey = e.y, ecolor = e.color;
            const dist = Math.sqrt(distSq) || 1;
            e.knockbackVX += (dx / dist) * 250;
            e.knockbackVY += (dy / dist) * 250;
            e.takeDamage(dmg);
            this.handleEnemyDamageResult(e, train, ex, ey, ecolor);
            if (e.active) this.hitSparks.push({ x: e.x, y: e.y });
          }
        }
      }
    }

    // Projectile-enemy collision
    this.checkProjectileHits(enemies, train);

    // Enemy-train collision
    this.checkEnemyTrainCollision(enemies, train);
  }

  // Single pass: find closest enemy in range. If checkCone, also requires cone match.
  findTarget(mount, enemies, areaMult = 1, checkCone = true) {
    let closest = null;
    const range = mount.range * areaMult;
    let closestDist = range * range;
    for (const e of enemies) {
      if (!e.active) continue;
      const dx = e.x - mount.worldX;
      const dy = e.y - mount.worldY;
      const distSq = dx * dx + dy * dy;
      if (distSq >= closestDist) continue;
      if (checkCone) {
        const angleToEnemy = Math.atan2(dy, dx);
        const diff = Math.abs(normalizeAngle(angleToEnemy - mount.coneDirection));
        if (diff > mount.coneHalfAngle) continue;
      }
      closest = e;
      closestDist = distSq;
    }
    return closest;
  }

  fireProjectile(x, y, angle, damage, source = 'crew', color = '#ffeeaa') {
    for (let i = 0; i < this.projectiles.length; i++) {
      const proj = this.projectiles[i];
      if (!proj.active) { proj.spawn(x, y, angle, damage, source, color); return; }
    }
  }

  checkProjectileHits(enemies, train) {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      for (const e of enemies) {
        if (!e.active) continue;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = dx * dx + dy * dy;
        const minDist = p.radius + e.radius;
        if (dist <= minDist * minDist) {
          const ex = e.x, ey = e.y, ecolor = e.color;
          const hitX = p.x, hitY = p.y;
          e.takeDamage(p.damage, p.vx, p.vy);
          p.active = false;
          this.handleEnemyDamageResult(e, train, ex, ey, ecolor);
          if (e.active) this.hitSparks.push({ x: hitX, y: hitY });
          break;
        }
      }
    }
  }

  checkEnemyTrainCollision(enemies, train) {
    for (const e of enemies) {
      if (!e.active) continue;
      for (const car of train.cars) {
        const cx = Math.max(car.worldX, Math.min(e.x, car.worldX + car.width));
        const cy = Math.max(car.worldY, Math.min(e.y, car.worldY + car.height));
        const dx = e.x - cx;
        const dy = e.y - cy;
        if (dx * dx + dy * dy <= e.radius * e.radius) {
          this._applyTrainHit(e, car, train);
          e.active = false;
          break;
        }
      }
    }
  }

  /** Route enemy damage to the correct target: crew, cargo car, or nearest cargo. */
  _applyTrainHit(enemy, car, train) {
    const dmg = enemy.damage;
    train.shakeTimer = 0.2;
    train.damageFlash = 0.25;
    playTrainDamage();

    if (car.type === 'cargo') {
      // Damage the cargo car
      if (car.alive) {
        car.hp -= dmg;
        if (car.hp <= 0) {
          car.hp = 0;
          car.alive = false;
        }
      }
      return;
    }

    // Weapon car — find if there's a manned mount on this car
    const mannedMount = car.mounts.find(m => m.crew && m.crew.alive);
    if (mannedMount) {
      // Damage the crew member on the nearest manned mount
      const crew = mannedMount.crew;
      crew.hp -= dmg;
      if (crew.hp <= 0) {
        crew.hp = 0;
        crew.alive = false;
        // Unassign dead crew from mount
        if (crew.assignment) {
          crew.assignment.crew = null;
          crew.assignment = null;
        }
      }
      return;
    }

    // Weapon car with no crew — damage nearest alive cargo car
    const cargoCars = train.aliveCargoCars;
    if (cargoCars.length > 0) {
      // Find nearest cargo car by index distance
      let nearest = cargoCars[0];
      let bestDist = Math.abs(nearest.index - car.index);
      for (let i = 1; i < cargoCars.length; i++) {
        const d = Math.abs(cargoCars[i].index - car.index);
        if (d < bestDist) { bestDist = d; nearest = cargoCars[i]; }
      }
      nearest.hp -= dmg;
      if (nearest.hp <= 0) {
        nearest.hp = 0;
        nearest.alive = false;
      }
    }
  }

  reset() {
    for (const p of this.projectiles) p.active = false;
    this.pendingLevelUp = false;
    this.killEffects.length = 0;
    this.muzzleFlashes.length = 0;
    this.hitSparks.length = 0;
  }
}
