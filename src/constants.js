// Game tuning — loaded by index.html before modules init
const _t = window.__tuning || {};
const T = (key, fallback) => _t[key] ?? fallback;

// Canvas
export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 640;

// Camera zoom — scales the orthographic frustum (and all 2D overlays proportionally).
export const CAMERA_ZOOM = 1.5;

// Train
export const CAR_WIDTH = T('CAR_WIDTH', 32);
export const CAR_HEIGHT = T('CAR_HEIGHT', 14);
export const CAR_GAP = T('CAR_GAP', 6);
export const TRAIN_MAX_HP = T('TRAIN_MAX_HP', 100);
export const TRAIN_SPEED = T('TRAIN_SPEED', 167);

// Camera: train sits at 30% from left
export const CAMERA_TRAIN_X = CANVAS_WIDTH * 0.3;

// Camera panning
export const CAMERA_PAN_SPEED = 400;   // pixels/sec — fast enough for 8-car train
export const CAMERA_EDGE_ZONE = 60;    // pixels from screen edge that triggers panning

// Weapon mounts
export const MOUNT_RADIUS = 8;
export const WEAPON_CONE_HALF_ANGLE = Math.PI / 3;      // 120° total arc — positioning matters
export const WEAPON_RANGE = T('WEAPON_RANGE', 250);
export const WEAPON_FIRE_RATE = T('WEAPON_FIRE_RATE', 2.0);
export const WEAPON_DAMAGE = T('WEAPON_DAMAGE', 15);
export const PROJECTILE_SPEED = T('PROJECTILE_SPEED', 350);
export const PROJECTILE_LIFETIME = T('PROJECTILE_LIFETIME', 2);
export const PROJECTILE_RADIUS = T('PROJECTILE_RADIUS', 3);

// Crew
export const CREW_REASSIGN_COOLDOWN = 1;
export const CREW_RADIUS = 8;
export const CREW_COLORS = ['#e74c3c', '#3498db'];
export const CREW_MAX_HP = 30;
export const CREW_HEAL_BETWEEN_FIGHTS = 0.5; // heal 50% of missing HP

// Cargo cars
export const CARGO_CAR_HP = 50;

// Enemies
export const ENEMY_BASE_HP = T('ENEMY_BASE_HP', 30);
export const ENEMY_BASE_SPEED = T('ENEMY_BASE_SPEED', 40);
export const ENEMY_RADIUS = T('ENEMY_RADIUS', 6);
export const ENEMY_CONTACT_DAMAGE = T('ENEMY_CONTACT_DAMAGE', 12);
export const ENEMY_SPAWN_INTERVAL_START = T('ENEMY_SPAWN_INTERVAL_START', 2.5);
export const ENEMY_SPAWN_INTERVAL_MIN = T('ENEMY_SPAWN_INTERVAL_MIN', 0.5);

// Enemy tier multipliers
export const ENEMY_RADIUS_MULT = [
  T('ENEMY_PURPLE_RADIUS_MULT', 1.5),
  T('ENEMY_RED1_RADIUS_MULT', 5),
  T('ENEMY_RED2_RADIUS_MULT', 5),
];
export const ENEMY_HP_MULT = [
  T('ENEMY_PURPLE_HP_MULT', 1),
  T('ENEMY_RED1_HP_MULT', 4),
  T('ENEMY_RED2_HP_MULT', 6),
];

// World structure
export const ZONES_PER_WORLD = T('ZONES_PER_WORLD', 3);
export const ZONE_DIFFICULTY_SCALE = T('ZONE_DIFFICULTY_SCALE', 0.2);
export const GOLD_PER_STATION = T('GOLD_PER_STATION', 25);
export const COAL_PER_WIN = T('COAL_PER_WIN', 2);

// Run
export const TARGET_DISTANCE = T('TARGET_DISTANCE', 7000);

// Bandits
export const BANDIT_SPEED = T('BANDIT_SPEED', 110);
export const BANDIT_SPAWN_INTERVAL = T('BANDIT_SPAWN_INTERVAL', 15);
export const BANDIT_JUMP_DURATION = T('BANDIT_JUMP_DURATION', 0.4);
export const BANDIT_STEAL_RATE = T('BANDIT_STEAL_RATE', 0);
export const BANDIT_FIGHT_DURATION = T('BANDIT_FIGHT_DURATION', 0.8);
export const BANDIT_CARGO_DAMAGE_RATE = T('BANDIT_CARGO_DAMAGE_RATE', 5); // HP/sec while sitting on cargo car
export const MAX_BANDITS = 10;

// Wave system
export const WAVE_CYCLE_DURATION = T('WAVE_CYCLE_DURATION', 12);
export const WAVE_SURGE_DURATION = T('WAVE_SURGE_DURATION', 4);
export const WAVE_CALM_DURATION = T('WAVE_CALM_DURATION', 6);
export const WAVE_SURGE_SPAWN_MULT = T('WAVE_SURGE_SPAWN_MULT', 2.5);
export const WAVE_CALM_SPAWN_MULT = T('WAVE_CALM_SPAWN_MULT', 0.2);
export const WAVE_ESCALATION = T('WAVE_ESCALATION', 0.15);
export const WAVE_WARNING_DURATION = T('WAVE_WARNING_DURATION', 4);
export const WAVE_BOSS_SURGE_MULT = T('WAVE_BOSS_SURGE_MULT', 3.5);

// Station combat modifiers
export const STATION_MODIFIERS = {
  swarm:    { id: 'swarm',    name: 'Swarm',    spawnMult: 2.0, hpMult: 0.5, coinMult: 1, goldMult: 1, color: '#e74c3c' },
  armored:  { id: 'armored',  name: 'Armored',  spawnMult: 0.5, hpMult: 2.5, coinMult: 1, goldMult: 1, color: '#3498db' },
  ambush:   { id: 'ambush',   name: 'Ambush',   spawnMult: 1.5, hpMult: 1,   coinMult: 1, goldMult: 1, color: '#e67e22' },
  bounty:   { id: 'bounty',   name: 'Bounty',   spawnMult: 1,   hpMult: 1,   coinMult: 2, goldMult: 1, color: '#f5a623' },
  gauntlet: { id: 'gauntlet', name: 'Gauntlet', spawnMult: 1.5, hpMult: 1.5, coinMult: 1, goldMult: 1.5, color: '#9b59b6' },
};
export const MODIFIER_KEYS = Object.keys(STATION_MODIFIERS);

// Coal shop
export const COAL_SHOP_COST = T('COAL_SHOP_COST', 30);
export const COAL_SHOP_AMOUNT = T('COAL_SHOP_AMOUNT', 2);

// Pools
export const MAX_ENEMIES = 150;
export const MAX_PROJECTILES = 300;
export const MAX_DAMAGE_NUMBERS = 80;

// Between-station upgrade definitions
export const CREW_UPGRADES = {
  longRifle:  { id: 'longRifle',  name: 'Long Rifle',   color: '#81c784', desc: 'Long range, slow fire',        damage: 20, fireRate: 1.2, range: 350 },
  shotgun:    { id: 'shotgun',    name: 'Shotgun',       color: '#e57373', desc: 'Short range, wide burst',      damage: 8,  fireRate: 1.0, range: 120, spread: 5 },
  rapidFire:  { id: 'rapidFire',  name: 'Rapid Fire',    color: '#64b5f6', desc: 'Fast, low damage',             damage: 6,  fireRate: 5.0, range: 180 },
  brawler:    { id: 'brawler',    name: 'Brawler',       color: '#ffb74d', desc: 'Melee AOE, instant bandit kick', damage: 14, fireRate: 0,   range: 50, melee: true, garlicRadius: 50, garlicTickRate: 0.4 },
  incendiary: { id: 'incendiary', name: 'Incendiary',    color: '#ff8a65', desc: 'DOT area, medium range',       damage: 10, fireRate: 1.5, range: 200 },
};

// Legacy compat — some imports still reference these
export const XP_PER_KILL = 0;
export const XP_PER_LEVEL = 999;
export const GUNNER_DAMAGE_MULT = 1.0;
export const BRAWLER_DAMAGE_MULT = 1.0;
export const BRAWLER_GARLIC = { radius: 50, damage: 14, tickRate: 0.4 };
export const UNMANNED_EFFECTIVENESS = 0;
export const MAX_RICOCHET_BOLTS = 0;
export const DRIVER_DAMAGE_BUFF = 1.0;

// Shop (legacy — kept minimal for now)
export const SHOP_TUNING = {
  damage: { cost: 40, maxLevel: 5, perLevel: 15 },
  maxHp:  { cost: 30, maxLevel: 5, perLevel: 25 },
};

// Coins (legacy — kept for imports but unused)
export const COIN_RADIUS = 8;
export const COIN_SPAWN_INTERVAL = 999;
export const COIN_VALUE = 0;
export const MAX_COINS = 0;
export const MAX_FLYING_COINS = 0;
export const COIN_FLY_SPEED = 400;
export const CARGO_BOXES_START = 0;
export const CARGO_MULTIPLIER_PER_BOX = 0;

// Manual gun (legacy — crew now uses upgrade-based stats)
export const MANUAL_GUN = {
  id: 'manualGun', name: 'Crew Gun', icon: '', color: '#e74c3c',
  maxLevel: 1,
  levels: [{ damage: WEAPON_DAMAGE, fireRate: WEAPON_FIRE_RATE, range: WEAPON_RANGE }],
};

// Auto-weapons (legacy stubs — removed from gameplay)
export const MAX_AUTO_WEAPON_LEVEL = 0;
export const AUTO_WEAPONS = {};
