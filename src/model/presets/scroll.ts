import type { PresetFn } from '../types';

const LINE_HEIGHT = 36;
const LANE_GAP = 4;

export const scroll: PresetFn = (slot, dt, _state, _stageWidth) => {
  const seconds = dt / 1000;
  slot.x -= slot.params.speed * seconds;
  slot.y = slot.lane * (LINE_HEIGHT + LANE_GAP) + LINE_HEIGHT;
  slot.rotation = 0;
  slot.age += dt;
  slot.opacity = slot.params.opacity;
};
