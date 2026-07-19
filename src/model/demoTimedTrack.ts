import type { TimedDanmakuEntry, PresetId } from './types';
import { ContentLibrary } from './ContentLibrary';

/**
 * Pre-authored, timestamp-pinned danmaku for the bundled 15-second demo
 * clip.
 */
export const DEMO_TIMED_TRACK: TimedDanmakuEntry[] = [
  { time: 0.3, text: '来了来了', preset: 'scroll' },
  { time: 0.8, text: '前排占座', preset: 'scroll' },
  { time: 1.2, text: '沙发', preset: 'scroll' },
  { time: 1.6, text: '这画质不错', preset: 'scroll' },
  { time: 2.0, text: '高能预警', preset: 'top' },
  { time: 2.4, text: '前方高能', preset: 'scroll' },
  { time: 2.8, text: '这是哪里', preset: 'scroll' },
  { time: 3.1, text: '公园好安静', preset: 'reverse' },
  { time: 3.5, text: '666', preset: 'scroll' },
  { time: 3.9, text: '车流不错', preset: 'scroll' },
  { time: 4.2, text: 'Nice shot', preset: 'scroll' },
  { time: 4.6, text: '镜头稳', preset: 'scroll' },
  { time: 5.0, text: '标题党警告', preset: 'top' },
  { time: 5.3, text: '妙啊', preset: 'scroll' },
  { time: 5.7, text: '这就是艺术吗', preset: 'scroll' },
  { time: 6.1, text: '哈哈哈哈', preset: 'scroll' },
  { time: 6.4, text: '牛逼', preset: 'reverse' },
  { time: 6.8, text: '弹幕护体', preset: 'scroll' },
  { time: 7.1, text: '过年好', preset: 'scroll' },
  { time: 7.5, text: '这音乐真好听', preset: 'scroll' },
  { time: 7.9, text: '经典永流传', preset: 'top' },
  { time: 8.2, text: '泪目', preset: 'scroll' },
  { time: 8.6, text: '进度条撑住', preset: 'scroll' },
  { time: 9.0, text: '我好了', preset: 'scroll' },
  { time: 9.3, text: '再来亿遍', preset: 'reverse' },
  { time: 9.7, text: '有生之年', preset: 'scroll' },
  { time: 10.1, text: '燃起来了', preset: 'scroll' },
  { time: 10.4, text: '前方核能', preset: 'top' },
  { time: 10.8, text: '这不是演习', preset: 'scroll' },
  { time: 11.2, text: '开幕雷击', preset: 'scroll' },
  { time: 11.5, text: '好活', preset: 'scroll' },
  { time: 11.9, text: 'GG', preset: 'reverse' },
  { time: 12.2, text: '太强了', preset: 'scroll' },
  { time: 12.6, text: '这就是大佬吗', preset: 'scroll' },
  { time: 13.0, text: '优雅，太优雅了', preset: 'top' },
  { time: 13.4, text: 'VectoJS 永远的神', preset: 'scroll' },
  { time: 13.8, text: '弹幕比视频精彩', preset: 'scroll' },
  { time: 14.2, text: '完结撒花', preset: 'scroll' },
  { time: 14.6, text: '下次一定', preset: 'reverse' },
  { time: 14.9, text: '这就完了？', preset: 'scroll' },
];

const LOCAL_STORAGE_KEY = 'bakudan_user_danmakus';

/** Load user custom saved danmakus from LocalStorage */
export function loadUserDanmakus(): TimedDanmakuEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // catch block
  }
  return [];
}

/** Save a user custom danmaku to LocalStorage */
export function saveUserDanmaku(entry: TimedDanmakuEntry): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const list = loadUserDanmakus();
    list.push(entry);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // catch block
  }
}

/** Clear all user custom danmakus */
export function clearUserDanmakus(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch {
    // catch block
  }
}

/**
 * Dynamically generate a large localized TimedDanmakuEntry dataset.
 * Uses Box-Muller Gaussian algorithm to cluster 70% of comments around 5 peak
 * points.
 */
export function generateLargeTimedTrack(duration: number): TimedDanmakuEntry[] {
  const list: TimedDanmakuEntry[] = [];
  const peakInterval = Math.max(15, Math.floor(duration * 0.15));
  const numPeaks = Math.floor(duration / peakInterval);
  const peaks: number[] = [];

  for (let i = 1; i <= numPeaks; i++) {
    peaks.push(i * peakInterval);
  }

  const presets: PresetId[] = [
    'scroll',
    'reverse',
    'top',
    'bottom',
    'sine',
    'rotation',
    'glitch',
    'repulsion',
  ];
  // ~4.5 danmakus per second average, capped at 2500 to keep it lightweight but dense
  const textCount = Math.min(2500, Math.floor(duration * 4.5));

  for (let i = 0; i < textCount; i++) {
    let time = 0;
    if (Math.random() < 0.7 && peaks.length > 0) {
      // Cluster around one of the peaks
      const peak = peaks[Math.floor(Math.random() * peaks.length)];
      const u = Math.random() || 0.0001;
      const v = Math.random() || 0.0001;
      const spread = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * 3.5;
      time = Math.max(0.1, Math.min(duration - 0.5, peak + spread));
    } else {
      time = 0.1 + Math.random() * (duration - 0.6);
    }

    const text = ContentLibrary.sample();
    const preset = presets[Math.floor(Math.random() * presets.length)];
    list.push({
      time: Math.round(time * 10) / 10,
      text,
      preset,
      fontSize: 16 + Math.random() * 16,
      speed: 120 + Math.random() * 120,
    });
  }

  // Load custom user danmakus and filter to ones within this duration
  const userList = loadUserDanmakus();
  for (const entry of userList) {
    if (entry.time <= duration) {
      list.push(entry);
    }
  }

  list.sort((a, b) => a.time - b.time);
  return list;
}
