import type { PresetFn } from '../types';

export const bottom: PresetFn = (slot, _dt, _state, stageWidth, stageHeight) => {
  slot.x = (stageWidth - slot.width) / 2;
  slot.y = stageHeight - 24;
  slot.rotation = 0;
  slot.opacity = slot.params.opacity;
};
