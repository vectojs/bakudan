import type { PresetFn } from '../types';

const LINE_HEIGHT = 36;
const LANE_GAP = 4;

export const sine: PresetFn = (slot, dt, _state, _stageWidth) => {
  const seconds = dt / 1000;
  const amp = slot.params.presetParams.amplitude ?? 60;
  const freq = slot.params.presetParams.frequency ?? 2;
  slot.x -= slot.params.speed * seconds;
  slot.age += dt;
  const baseY = slot.lane * (LINE_HEIGHT + LANE_GAP) + LINE_HEIGHT;
  slot.y = baseY + Math.sin((slot.age / 1000) * freq * Math.PI * 2) * amp;
  slot.rotation = 0;
  slot.opacity = slot.params.opacity;
};
