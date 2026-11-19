// Keyboard + mouse-drag input. The game loop reads a fresh snapshot each
// frame; action keys (E, F, Enter, P, Esc, M) are edge-triggered through
// a `pressed` set that is cleared after the frame consumes it, so holding
// a key never double-fires an action. Held state (WASD, Shift, E) is
// exposed separately for continuous movement and robbery holds.

const MOVE_KEYS = {
  KeyW: { x: 0, y: 1 }, KeyS: { x: 0, y: -1 },
  KeyA: { x: -1, y: 0 }, KeyD: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: 1 }, ArrowDown: { x: 0, y: -1 },
  ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
};

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let dragging = false;
  let lastX = 0, lastY = 0;
  let dragDX = 0, dragDY = 0;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    // Stop the page scrolling on game keys.
    if (e.code in MOVE_KEYS || e.code === 'Space') e.preventDefault();
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onBlur() { keys.clear(); dragging = false; }

  function onMouseDown(e) {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
  }
  function onMouseMove(e) {
    if (!dragging) return;
    dragDX += e.clientX - lastX;
    dragDY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
  }
  function onMouseUp() { dragging = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  // Snapshot for this frame. Callers must call endFrame() afterwards so
  // edge presses do not leak into the next frame.
  function snapshot() {
    let ax = 0, ay = 0;
    for (const code of keys) {
      const m = MOVE_KEYS[code];
      if (m) { ax += m.x; ay += m.y; }
    }
    const len = Math.hypot(ax, ay) || 1;
    return {
      axis: { x: ax / len, y: ay / len },
      sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
      holdingE: keys.has('KeyE'),
      pressed: new Set(pressed),
      dragDX, dragDY,
    };
  }
  function endFrame() {
    pressed.clear();
    dragDX = 0; dragDY = 0;
  }
  return { snapshot, endFrame };
}
