// Zone map: a linear chain of stations
// Player starts at station 0, goal is to reach the final station

export const STATION_TYPES = {
  COMBAT: 'combat',
  EMPTY: 'empty',
  START: 'start',
  EXIT: 'exit',
  SHOP: 'shop',
};

export class Station {
  constructor(id, x, y, type) {
    this.id = id;
    this.x = x; // map position (0-1 normalized)
    this.y = y;
    this.type = type;
    this.connections = []; // station IDs this connects to
    this.visited = false;
    this.revealed = false; // only show type if adjacent to visited
  }
}

export class Zone {
  constructor(difficulty = 1, save = null) {
    this.stations = [];
    this.currentStation = 0;
    this.difficulty = difficulty;
    this.stationsVisited = 0;
    this.completed = false;
    this.failed = false; // never fails — no coal stranding

    this.generate();
    // All stations auto-revealed from the start
    for (const s of this.stations) {
      s.visited = s.id === 0;
      s.revealed = true;
    }
  }

  generate() {
    // Linear chain: START → COMBAT → SHOP → COMBAT → COMBAT → EXIT
    const chain = [
      { type: STATION_TYPES.START,  x: 0.05, y: 0.5 },
      { type: STATION_TYPES.COMBAT, x: 0.22, y: 0.5 },
      { type: STATION_TYPES.SHOP,   x: 0.40, y: 0.38 },
      { type: STATION_TYPES.COMBAT, x: 0.58, y: 0.5 },
      { type: STATION_TYPES.COMBAT, x: 0.76, y: 0.5 },
      { type: STATION_TYPES.EXIT,   x: 0.95, y: 0.5 },
    ];

    for (let i = 0; i < chain.length; i++) {
      const def = chain[i];
      this.stations.push(new Station(i, def.x, def.y, def.type));
    }

    // Connect sequentially
    for (let i = 0; i < this.stations.length - 1; i++) {
      this.addConnection(i, i + 1);
    }
  }

  addConnection(a, b) {
    if (!this.stations[a].connections.includes(b)) {
      this.stations[a].connections.push(b);
    }
    if (!this.stations[b].connections.includes(a)) {
      this.stations[b].connections.push(a);
    }
  }

  canTravelTo(stationId) {
    // Can only travel to the next station in the chain (current + 1)
    return stationId === this.currentStation + 1;
  }

  travelTo(stationId) {
    if (!this.canTravelTo(stationId)) return false;
    this.currentStation = stationId;
    this.stations[stationId].visited = true;
    this.stationsVisited++;
    if (this.stations[stationId].type === STATION_TYPES.EXIT) {
      this.completed = true;
    }
    return true;
  }

  // Renderer compat stubs — coal removed, keep so renderer doesn't show NaN
  get coal() { return 0; }
  get maxCoal() { return 0; }
  addCoal() {}

  get currentStationData() {
    return this.stations[this.currentStation];
  }
}
