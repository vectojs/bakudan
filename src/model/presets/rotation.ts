import type { PresetFn } from '../types';

export const rotation: PresetFn = (slot, dt, _state, stageWidth) => {
  const seconds = dt / 1000;
  slot.x -= slot.params.speed * seconds;
  slot.y = stageWidth * 0.5;
  slot.age += dt;
  const len = slot.params.text.length;
  for (let i = 0; i < len && i < slot.charAngles.length; i++) {
    slot.charAngles[i] = Math.sin((slot.age / 1000) * 3 + i * 0.5) * 0.4;
  }
  slot.opacity = slot.params.opacity;
};
