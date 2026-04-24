import { MOUNT_RADIUS, CREW_RADIUS, CAMERA_ZOOM } from './constants.js';

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.mouseX = 0;
    this.mouseY = 0;

    // Left click
    this._leftClickThisFrame = false;
    this._isLeftDown = false;

    // Right click
    this._rightClickThisFrame = false;
    this._isRightDown = false;

    // Legacy aliases
    this._clickThisFrame = false;
    this._isMouseDown = false;

    // Keyboard
    this.keysDown = new Set();
    this._keysPressed = new Set();

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('mousemove', (e) => {
      const pos = this.getCanvasPos(e);
      this.mouseX = pos.x;
      this.mouseY = pos.y;
    });

    canvas.addEventListener('mousedown', (e) => {
      const pos = this.getCanvasPos(e);
      this.mouseX = pos.x;
      this.mouseY = pos.y;
      if (e.button === 0) {
        this._leftClickThisFrame = true;
        this._isLeftDown = true;
      } else if (e.button === 2) {
        this._rightClickThisFrame = true;
        this._isRightDown = true;
      }
      // Legacy
      this._clickThisFrame = true;
      this._isMouseDown = true;
    });

    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._isLeftDown = false;
      else if (e.button === 2) this._isRightDown = false;
      if (!this._isLeftDown && !this._isRightDown) this._isMouseDown = false;
    });

    // Touch = left click
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const pos = this.getCanvasPos(e.touches[0]);
      this.mouseX = pos.x;
      this.mouseY = pos.y;
      this._leftClickThisFrame = true;
      this._isLeftDown = true;
      this._clickThisFrame = true;
      this._isMouseDown = true;
    });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const pos = this.getCanvasPos(e.touches[0]);
      this.mouseX = pos.x;
      this.mouseY = pos.y;
    });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this._isLeftDown = false;
      this._isMouseDown = false;
    });

    // Keyboard
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!this.keysDown.has(e.code)) {
        this._keysPressed.add(e.code);
      }
      this.keysDown.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });
  }

  getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  endFrame() {
    this._clickThisFrame = false;
    this._leftClickThisFrame = false;
    this._rightClickThisFrame = false;
    this._keysPressed.clear();
  }

  // Legacy (used by UI buttons, zone map, shop, etc.)
  get clicked() { return this._clickThisFrame; }
  get mouseDown() { return this._isMouseDown; }

  // Separate buttons
  get leftClicked() { return this._leftClickThisFrame; }
  get rightClicked() { return this._rightClickThisFrame; }
  get leftDown() { return this._isLeftDown; }
  get rightDown() { return this._isRightDown; }

  keyPressed(code) { return this._keysPressed.has(code); }
  keyDown(code) { return this.keysDown.has(code); }

  hitCircle(tx, ty, radius) {
    const dx = this.mouseX - tx;
    const dy = this.mouseY - ty;
    return dx * dx + dy * dy <= radius * radius;
  }

  hitRect(x, y, w, h) {
    return this.mouseX >= x && this.mouseX <= x + w &&
           this.mouseY >= y && this.mouseY <= y + h;
  }

  findSlotAtMouse(train, cameraOffsetX = 0) {
    for (const slot of train.allSlots) {
      const r = (slot.isDriverSeat ? CREW_RADIUS + 4 : MOUNT_RADIUS + 6) * CAMERA_ZOOM;
      // screenX is already in screen space; worldX needs camera offset
      const sx = slot.screenX !== undefined ? slot.screenX : (slot.worldX - cameraOffsetX);
      const sy = slot.screenY !== undefined ? slot.screenY : slot.worldY;
      if (this.hitCircle(sx, sy, r)) return slot;
    }
    return null;
  }

  findCrewInPanel(crew) {
    for (const c of crew) {
      if (!c.alive || c.assignment || c.isMoving) continue;
      if (c.panelX !== undefined && this.hitCircle(c.panelX, c.panelY, CREW_RADIUS + 6)) return c;
    }
    return null;
  }
}
