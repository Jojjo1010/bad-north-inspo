// Procedural audio using Web Audio API — no external files needed

let ctx = null;
let masterGain = null;
let musicPlaying = false;
let musicNodes = [];

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.4;
    masterGain.connect(ctx.destination);
  }
  // Resume if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function sfxGain(volume = 0.3) {
  const c = getCtx();
  const g = c.createGain();
  g.gain.value = volume;
  g.connect(masterGain);
  return g;
}

// --- SHOOT (short blip) ---
export function playShoot() {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = sfxGain(0.08);
  osc.type = 'square';
  osc.frequency.setValueAtTime(800, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.06);
  osc.connect(g);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.06);
}

// --- ENEMY HIT (thud) ---
export function playEnemyHit() {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = sfxGain(0.12);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.1);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
  osc.connect(g);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.1);
}

// --- ENEMY KILL (crunch + higher pitch) ---
export function playEnemyKill() {
  const c = getCtx();
  // Noise burst
  const bufferSize = c.sampleRate * 0.08;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const g = sfxGain(0.1);
  noise.connect(g);
  noise.start(c.currentTime);

  // Tone
  const osc = c.createOscillator();
  const g2 = sfxGain(0.08);
  osc.type = 'square';
  osc.frequency.setValueAtTime(600, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(100, c.currentTime + 0.12);
  g2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
  osc.connect(g2);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.12);
}

// --- TRAIN DAMAGE (heavy impact) ---
export function playTrainDamage() {
  const c = getCtx();
  // Low boom
  const osc = c.createOscillator();
  const g = sfxGain(0.25);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.25);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
  osc.connect(g);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.3);

  // Noise crunch
  const bufferSize = c.sampleRate * 0.15;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize) * 0.6;
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const gn = sfxGain(0.15);
  noise.connect(gn);
  noise.start(c.currentTime);
}

// --- COIN PICKUP (bright ding) ---
export function playCoinPickup() {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = sfxGain(0.15);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, c.currentTime);
  osc.frequency.setValueAtTime(1600, c.currentTime + 0.05);
  osc.frequency.exponentialRampToValueAtTime(800, c.currentTime + 0.15);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
  osc.connect(g);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.2);
}

// --- LEVEL UP (ascending arpeggio) ---
export function playLevelUp() {
  const c = getCtx();
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const g = sfxGain(0.12);
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.001, c.currentTime + i * 0.1);
    g.gain.linearRampToValueAtTime(0.12, c.currentTime + i * 0.1 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.1 + 0.25);
    osc.connect(g);
    osc.start(c.currentTime + i * 0.1);
    osc.stop(c.currentTime + i * 0.1 + 0.3);
  });
}

// --- POWERUP SELECT (confirm chime) ---
export function playPowerup() {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = sfxGain(0.15);
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(800, c.currentTime);
  osc.frequency.setValueAtTime(1200, c.currentTime + 0.08);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
  osc.connect(g);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.3);
}

// --- VICTORY (triumphant fanfare) ---
export function playVictory() {
  const c = getCtx();
  const melody = [523, 659, 784, 1047, 784, 1047]; // C E G C G C
  const durations = [0.15, 0.15, 0.15, 0.3, 0.15, 0.4];
  let time = c.currentTime;
  melody.forEach((freq, i) => {
    const osc = c.createOscillator();
    const g = sfxGain(0.15);
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.15, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + durations[i]);
    osc.connect(g);
    osc.start(time);
    osc.stop(time + durations[i] + 0.05);
    time += durations[i];
  });
}

// --- DEFEAT (descending sad tone) ---
export function playDefeat() {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = sfxGain(0.15);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(400, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.8);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.0);
  osc.connect(g);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 1.0);
}

// --- BACKGROUND MUSIC (jungle/adventure — lookahead scheduler) ---
let musicTimers = [];
let drumNextTime = 0;
let bassNextTime = 0;
let bassNoteIdx = 0;
let chirpNextTime = 0;
const BASS_NOTES = [55, 55, 65.4, 73.4, 55, 82.4, 73.4, 65.4];
const BASS_NOTE_LEN = 0.4;
const DRUM_LOOP_LEN = 1.6;
const DRUM_KICKS = [0, 0.4, 0.6, 1.0, 1.2];
const DRUM_HI = [0.2, 0.6, 1.0, 1.4];
let shakerBuf = null;

function scheduleAhead() {
  if (!musicPlaying) return;
  const c = ctx;
  const now = c.currentTime;
  const lookahead = 2.0;

  // Drums
  while (drumNextTime < now + lookahead) {
    for (const t of DRUM_KICKS) {
      const time = drumNextTime + t;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(80, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.15);
      g.gain.setValueAtTime(0.08, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
      osc.connect(g); g.connect(masterGain);
      osc.start(time); osc.stop(time + 0.25);
    }
    for (const t of DRUM_HI) {
      if (!shakerBuf) {
        const len = c.sampleRate * 0.05;
        shakerBuf = c.createBuffer(1, len, c.sampleRate);
        const d = shakerBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const time = drumNextTime + t;
      const src = c.createBufferSource();
      src.buffer = shakerBuf;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 6000; bp.Q.value = 2;
      const g = c.createGain(); g.gain.value = 0.04;
      src.connect(bp); bp.connect(g); g.connect(masterGain);
      src.start(time);
    }
    drumNextTime += DRUM_LOOP_LEN;
  }

  // Bass
  while (bassNextTime < now + lookahead) {
    const freq = BASS_NOTES[bassNoteIdx % BASS_NOTES.length];
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'triangle'; osc.frequency.value = freq;
    g.gain.setValueAtTime(0.06, bassNextTime);
    g.gain.exponentialRampToValueAtTime(0.001, bassNextTime + BASS_NOTE_LEN * 0.9);
    osc.connect(g); g.connect(masterGain);
    osc.start(bassNextTime); osc.stop(bassNextTime + BASS_NOTE_LEN);
    bassNextTime += BASS_NOTE_LEN;
    bassNoteIdx++;
  }

  // Chirps (sporadic)
  while (chirpNextTime < now + lookahead) {
    const freq = 1200 + Math.random() * 1800;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, chirpNextTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.9, chirpNextTime + 0.08);
    g.gain.setValueAtTime(0.015, chirpNextTime);
    g.gain.exponentialRampToValueAtTime(0.001, chirpNextTime + 0.1);
    osc.connect(g); g.connect(masterGain);
    osc.start(chirpNextTime); osc.stop(chirpNextTime + 0.12);
    chirpNextTime += 1.5 + Math.random() * 3;
  }

  musicTimers.push(setTimeout(scheduleAhead, 500));
}

export function startMusic() {
  if (musicPlaying) return;
  const c = getCtx();
  musicPlaying = true;

  drumNextTime = c.currentTime;
  bassNextTime = c.currentTime;
  bassNoteIdx = 0;
  chirpNextTime = c.currentTime + 1;

  // Ambient pad (looping noise — continuous, stored for cleanup)
  const noiseLen = 4;
  const noiseBuf = c.createBuffer(1, c.sampleRate * noiseLen, c.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noiseSrc = c.createBufferSource();
  noiseSrc.buffer = noiseBuf; noiseSrc.loop = true;
  const noiseBp = c.createBiquadFilter();
  noiseBp.type = 'bandpass'; noiseBp.frequency.value = 2000; noiseBp.Q.value = 0.5;
  const noiseLfo = c.createOscillator();
  const noiseLfoG = c.createGain();
  noiseLfo.frequency.value = 0.15; noiseLfoG.gain.value = 800;
  noiseLfo.connect(noiseLfoG); noiseLfoG.connect(noiseBp.frequency);
  const noiseG = c.createGain(); noiseG.gain.value = 0.02;
  noiseSrc.connect(noiseBp); noiseBp.connect(noiseG); noiseG.connect(masterGain);
  noiseLfo.start(); noiseSrc.start();
  musicNodes.push(noiseSrc, noiseBp, noiseLfo, noiseLfoG, noiseG);

  scheduleAhead();
}

export function stopMusic() {
  musicPlaying = false;
  for (const id of musicTimers) clearTimeout(id);
  musicTimers = [];
  for (const node of musicNodes) {
    try { node.stop(); } catch(e) {}
    try { node.disconnect(); } catch(e) {}
  }
  musicNodes = [];
}
