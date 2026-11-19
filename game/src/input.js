// Keyboard + mouse-drag input. Held keys are read every frame; one-shot presses
// (E, F, Enter, P, M) are queued as edge events and taken once by the loop.
export const KEY = { W: 'KeyW', A: 'KeyA', S: 'KeyS', D: 'KeyD', SHIFT: 'ShiftLeft' };

export function createInput() {
  const held = new Set();
  const pressed = new Set();
  let dragDX = 0;
  let dragging = false;
  let lastX = 0;

  window.addEventListener('keydown', (e) => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    held.add(e.code);
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => { held.clear(); dragging = false; });
  window.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dragDX += e.clientX - lastX;
    lastX = e.clientX;
  });

  return {
    held(code) { return held.has(code); },
    axis() { // WASD / arrows as -1..1
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
      return { x, y };
    },
    sprint() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    takePressed() { const p = new Set(pressed); pressed.clear(); return p; },
    takeDrag() { const d = dragDX; dragDX = 0; return d; },
  };
}
