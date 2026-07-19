import type { PresetFn } from '../types';

export const bottom: PresetFn = (slot, _dt, _state, stageWidth, stageHeight) => {
  slot.x = (stageWidth - slot.width) / 2;
  slot.y = stageHeight - 24;
  slot.rotation = 0;

  // Stay for 3s, fade out over 1s, then move offscreen to trigger deactivation
  if (slot.age > 4000) {
    slot.x = -1000;
  } else if (slot.age > 3000) {
    const progress = (slot.age - 3000) / 1000;
    slot.opacity = slot.params.opacity * (1 - progress);
  } else {
    slot.opacity = slot.params.opacity;
  }
};
