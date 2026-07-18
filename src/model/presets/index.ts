import type { PresetFn, PresetId } from '../types';
import { scroll } from './scroll';
import { reverse } from './reverse';
import { top } from './top';
import { bottom } from './bottom';
import { sine } from './sine';
import { rotation } from './rotation';
import { glitch } from './glitch';
import { repulsion } from './repulsion';

export const PRESETS: Record<PresetId, PresetFn> = {
  scroll,
  reverse,
  top,
  bottom,
  sine,
  rotation,
  glitch,
  repulsion,
};

export { scroll, reverse, top, bottom, sine, rotation, glitch, repulsion };
