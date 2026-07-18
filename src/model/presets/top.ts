import type { PresetFn } from '../types';

export const top: PresetFn = (slot, _dt, _state, stageWidth) => {
  slot.x = (stageWidth - slot.width) / 2;
  slot.y = 24;
  slot.rotation = 0;
  slot.opacity = slot.params.opacity;
};
