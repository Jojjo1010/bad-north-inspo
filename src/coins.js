import {
  CANVAS_WIDTH, CANVAS_HEIGHT, MAX_COINS, MAX_FLYING_COINS,
  COIN_RADIUS, COIN_SPAWN_INTERVAL, COIN_VALUE, COIN_FLY_SPEED
} from './constants.js';
import { playCoinPickup } from './audio.js';

export class Coin {
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.radius = COIN_RADIUS;
    this.bobPhase = Math.random() * Math.PI * 2;
  }

  spawn(x, y) {
    this.active = true;
    this.x = x;
    this.y = y;
    this.bobPhase = Math.random() * Math.PI * 2;
  }
}

export class FlyingCoin {
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.value = 0;
  }

  spawn(x, y, targetX, targetY, value) {
    this.active = true;
    this.x = x;
    this.y = y;
    this.targetX = targetX;
    this.targetY = targetY;
    this.value = value;
  }

  update(dt) {
    if (!this.active) return false;
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 8) {
      this.active = false;
      return true; // arrived
    }
    const speed = COIN_FLY_SPEED + (1 / (dist + 1)) * 200; // accelerate as it gets close
    this.x += (dx / dist) * speed * dt;
    this.y += (dy / dist) * speed * dt;
    return false;
  }
}

export class CoinSystem {
  constructor() {
    this.coins = [];
    for (let i = 0; i < MAX_COINS; i++) this.coins.push(new Coin());
    this.flyingCoins = [];
    for (let i = 0; i < MAX_FLYING_COINS; i++) this.flyingCoins.push(new FlyingCoin());
    this.spawnTimer = 2;
    this.goldCollected = 0; // gold collected this run
  }

  update(dt, distance, goldHudPos) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnCoin();
      this.spawnTimer = COIN_SPAWN_INTERVAL * (0.7 + Math.random() * 0.6);
    }

    // Update flying coins — fly to gold HUD in top-right
    for (const fc of this.flyingCoins) {
      fc.targetX = goldHudPos.x;
      fc.targetY = goldHudPos.y;
      const arrived = fc.update(dt);
      if (arrived) {
        this.goldCollected += fc.value;
        playCoinPickup();
      }
    }
  }

  spawnCoin() {
    const coin = this.coins.find(c => !c.active);
    if (!coin) return;
    // Spawn ahead and around the screen
    const margin = 50;
    const x = margin + Math.random() * (CANVAS_WIDTH - margin * 2);
    const y = margin + Math.random() * (CANVAS_HEIGHT - margin * 2);
    coin.spawn(x, y);
  }

  // Check projectile hits on coins
  checkProjectileHits(projectiles, goldHudPos) {
    for (const p of projectiles) {
      if (!p.active) continue;
      for (const c of this.coins) {
        if (!c.active) continue;
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        if (dx * dx + dy * dy <= (p.radius + c.radius) * (p.radius + c.radius)) {
          const fc = this.flyingCoins.find(f => !f.active);
          if (fc) fc.spawn(c.x, c.y, goldHudPos.x, goldHudPos.y, COIN_VALUE);
          c.active = false;
          p.active = false;
          break;
        }
      }
    }
  }

  reset() {
    for (const c of this.coins) c.active = false;
    for (const fc of this.flyingCoins) fc.active = false;
    this.spawnTimer = 2;
    this.goldCollected = 0;
  }
}
