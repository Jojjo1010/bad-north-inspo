# Train Defense

A top-down train defense game. Deliver cargo across a hostile world filled with swarms of monsters. Man your weapons, aim your firing cones, and protect your train.

## How to play

1. **Setup phase**: Drag your 3 crew members onto weapon mounts or the driver seat
2. Click weapon mounts to rotate their firing direction
3. Hit **DEPART** to start the run
4. During the run, weapons auto-fire at enemies in their cone
5. Drag crew between positions mid-run to respond to threats
6. Driver in the locomotive = +50% weapon damage buff

## Train layout

Locomotive → Front Weapons → Cargo → Rear Weapons

- 8 weapon mounts (4 per weapon car), each with a directional firing cone
- Driver seat in locomotive buffs all weapons when manned

## Run locally

Open `index.html` in a browser (requires a local server for ES modules):

```
cd train-game && python3 -m http.server 8080
```

Then open http://localhost:8080
