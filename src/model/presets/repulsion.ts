import type { PresetFn } from '../types';

const LINE_HEIGHT = 36;
const LANE_GAP = 4;
const REPULSE_RADIUS = 150;
const REPULSE_STRENGTH = 200;

export const repulsion: PresetFn = (slot, dt, state, _stageWidth) => {
  if (!state.pointerActive) {
    const seconds = dt / 1000;
    slot.x -= slot.params.speed * seconds;
    slot.y = slot.lane * (LINE_HEIGHT + LANE_GAP) + LINE_HEIGHT;
    slot.rotation = 0;
    slot.opacity = slot.params.opacity;
    return;
  }

  const seconds = dt / 1000;
  slot.x -= slot.params.speed * seconds;
  const baseY = slot.lane * (LINE_HEIGHT + LANE_GAP) + LINE_HEIGHT;
  const dx = slot.x + slot.width / 2 - state.cursorX;
  const dy = baseY + LINE_HEIGHT / 2 - state.cursorY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < REPULSE_RADIUS && dist > 0) {
    const force = (1 - dist / REPULSE_RADIUS) * REPULSE_STRENGTH;
    slot.x += (dx / dist) * force * seconds;
    slot.y = baseY + (dy / dist) * force * seconds;
  } else {
    slot.y = baseY;
  }
  slot.rotation = 0;
  slot.opacity = slot.params.opacity;
};
