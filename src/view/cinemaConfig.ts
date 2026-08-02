import type { VideoSourceError } from '@vectojs/danmaku-kit/model';
import type {
  DanmakuKitLabels,
  DanmakuKitTheme,
  DevToolsInfoPanelLabels,
  InteractionsPanelLabels,
  ThroughputPanelLabels,
  VideosPanelLabels,
} from '@vectojs/danmaku-kit/ui';
import type { Language } from '../model/i18n';

export const BAKUDAN_THEME: Readonly<DanmakuKitTheme> = Object.freeze({
  surface: 'rgba(7, 9, 13, 0.82)',
  surfaceRaised: 'rgba(18, 23, 34, 0.94)',
  border: 'rgba(248, 250, 252, 0.18)',
  text: '#f8fafc',
  textMuted: '#8d99aa',
  accent: '#f43f5e',
  accentHover: '#e11d48',
  signal: '#60a5fa',
  warning: '#f59e0b',
  danger: '#fb7185',
  success: '#4ade80',
  radius: 12,
  fontUi: "500 13px 'Inter', system-ui, sans-serif",
  fontLabel: "600 11px 'Inter', system-ui, sans-serif",
  fontDisplay: "600 14px 'Outfit', 'Inter', sans-serif",
  fontMono: "500 11px 'JetBrains Mono', monospace",
  // Focus uses the blue signal rather than the rose accent so a focused
  // control never reads as an emphasized-but-unfocused one. 7.91:1 against
  // the composited stage surface, well past the 3:1 WCAG 1.4.11 floor.
  focusRing: '#60a5fa',
  // The open menu floats over the danmaku wall, so it is near-opaque: at the
  // panel's own 0.82 the 20k-danmaku stream bleeds through and the rows stop
  // being readable. 0.98 keeps label text at 17.21:1.
  menuSurface: 'rgba(18, 23, 34, 0.98)',
  // Selected vs keyboard-highlighted are both rose, separated by alpha only.
  // The highlight stops at 0.55 rather than going louder because an option row
  // is itself focusable (role="option", interactive) - past that the blue focus
  // ring drops under 3:1 against the row it is drawn on. At 0.55: ring 3.17:1,
  // label 7.70:1.
  menuSelected: 'rgba(244, 63, 94, 0.30)',
  menuHighlight: 'rgba(244, 63, 94, 0.55)',
});

export interface BakudanPanelLabels {
  videos: VideosPanelLabels;
  throughput: ThroughputPanelLabels;
  interactions: InteractionsPanelLabels;
  devtools: DevToolsInfoPanelLabels;
}

export interface BakudanCinemaLabels {
  kit: DanmakuKitLabels;
  panels: BakudanPanelLabels;
}

function formatEnglishVideoError(error: Readonly<VideoSourceError>, candidateId?: string): string {
  const message =
    error.code === 'network-error'
      ? 'The video could not be downloaded.'
      : error.code === 'metadata-error'
        ? 'The video metadata is missing or invalid.'
        : error.code === 'playback-rejected'
          ? 'The browser rejected video playback.'
          : 'The video format or codec is not supported.';
  return `${candidateId ? `${candidateId}: ` : ''}${message}`;
}

function formatChineseVideoError(error: Readonly<VideoSourceError>, candidateId?: string): string {
  const message =
    error.code === 'network-error'
      ? '无法下载视频。'
      : error.code === 'metadata-error'
        ? '视频元数据缺失或无效。'
        : error.code === 'playback-rejected'
          ? '浏览器拒绝播放视频。'
          : '不支持此视频格式或编解码器。';
  return `${candidateId ? `${candidateId}：` : ''}${message}`;
}

const ENGLISH: BakudanCinemaLabels = {
  kit: {
    product: 'Bakudan',
    status: {
      video: 'Video',
      stress: 'Throughput',
      loading: 'Loading',
      paused: 'Paused',
      error: 'Source error',
      activeSummary: (active, capacity) =>
        `${active.toLocaleString()} / ${capacity.toLocaleString()} live`,
      fpsSummary: (fps) => `${fps} FPS`,
    },
    command: {
      inputPlaceholder: 'Send a danmaku…',
      send: 'Send',
      play: 'Play',
      pause: 'Pause',
      videoPosition: 'Video position',
      playbackRate: 'Playback rate',
      openLab: 'Lab',
      closeLab: 'Lab',
    },
    lab: {
      title: 'Bakudan Lab',
      close: 'Close',
      videos: 'Videos',
      throughput: 'Throughput',
      interactions: 'Interactions',
      devtools: 'DevTools',
    },
  },
  panels: {
    videos: {
      panel: 'Video laboratory',
      scroll: 'Video laboratory controls',
      videos: 'Video source',
      profiles: 'Track profile',
      profileDetails: 'Profile details',
      metadata: 'Metadata',
      attribution: 'Attribution',
      customUrl: 'Custom video URL',
      customSource: 'Custom URL',
      choose: 'Choose video',
      retry: 'Retry source',
      loadState: 'Source status',
      formatLoadState: (state) => {
        if (state.status === 'loading') return `Loading ${state.candidateId}`;
        if (state.status === 'ready') return `Ready · ${state.sourceId}`;
        return 'Choose a source';
      },
      formatLoadError: formatEnglishVideoError,
      formatMetadata: (rows) => rows.map(({ label, value }) => `${label}: ${value}`).join(' · '),
      formatAttribution: (attribution) => attribution || 'No attribution required',
    },
    throughput: {
      panel: 'Throughput laboratory',
      scroll: 'Throughput laboratory controls',
      capacity: 'Pool capacity',
      target: 'Target live count',
      rate: 'Spawn rate',
      quickTargets: 'Quick targets',
      distribution: 'Distribution',
      framePercentiles: 'Frame health',
      drawSplit: 'Draw split',
      formatCapacity: (value) => value.toLocaleString(),
      formatTarget: (value) => value.toLocaleString(),
      formatRate: (value) => `${value}/s`,
      formatMetric: (value) => `${Math.round(value * 10) / 10}`,
    },
    interactions: {
      panel: 'Interaction laboratory',
      scroll: 'Interaction laboratory controls',
      presets: 'Motion preset',
      effects: 'New-comment effects',
      renderClasses: 'Render classes',
    },
    devtools: {
      panel: 'DevTools information',
      scroll: 'DevTools information',
      title: 'Debug diagnostics are loaded only in development.',
      reload: 'Load diagnostics',
      availability: {
        available: 'Available',
        unavailable: 'Unavailable in this build',
        'reload-required': 'Load on demand',
      },
    },
  },
};

const CHINESE: BakudanCinemaLabels = {
  kit: {
    product: 'Bakudan 弹幕',
    status: {
      video: '视频',
      stress: '吞吐测试',
      loading: '加载中',
      paused: '已暂停',
      error: '视频源错误',
      activeSummary: (active, capacity) =>
        `${active.toLocaleString()} / ${capacity.toLocaleString()} 条`,
      fpsSummary: (fps) => `${fps} FPS`,
    },
    command: {
      inputPlaceholder: '发一条弹幕…',
      send: '发送',
      play: '播放',
      pause: '暂停',
      videoPosition: '视频进度',
      playbackRate: '播放速度',
      openLab: '实验室',
      closeLab: '实验室',
    },
    lab: {
      title: 'Bakudan 实验室',
      close: '关闭',
      videos: '视频',
      throughput: '吞吐',
      interactions: '互动',
      devtools: '开发工具',
    },
  },
  panels: {
    videos: {
      panel: '视频实验室',
      scroll: '视频实验室控件',
      videos: '视频源',
      profiles: '轨道方案',
      profileDetails: '方案详情',
      metadata: '元数据',
      attribution: '署名',
      customUrl: '自定义视频 URL',
      customSource: '自定义 URL',
      choose: '选择视频',
      retry: '重试视频源',
      loadState: '视频源状态',
      formatLoadState: (state) => {
        if (state.status === 'loading') return `正在加载 ${state.candidateId}`;
        if (state.status === 'ready') return `已就绪 · ${state.sourceId}`;
        return '请选择视频源';
      },
      formatLoadError: formatChineseVideoError,
      formatMetadata: (rows) => rows.map(({ label, value }) => `${label}：${value}`).join(' · '),
      formatAttribution: (attribution) => attribution || '无需署名',
    },
    throughput: {
      panel: '吞吐实验室',
      scroll: '吞吐实验室控件',
      capacity: '弹幕池容量',
      target: '目标弹幕数',
      rate: '生成速率',
      quickTargets: '快捷目标',
      distribution: '分布',
      framePercentiles: '帧健康',
      drawSplit: '绘制分布',
      formatCapacity: (value) => value.toLocaleString(),
      formatTarget: (value) => value.toLocaleString(),
      formatRate: (value) => `${value}/秒`,
      formatMetric: (value) => `${Math.round(value * 10) / 10}`,
    },
    interactions: {
      panel: '互动实验室',
      scroll: '互动实验室控件',
      presets: '运动轨迹',
      effects: '新弹幕特效',
      renderClasses: '渲染分类',
    },
    devtools: {
      panel: '开发工具信息',
      scroll: '开发工具信息',
      title: '调试诊断仅在开发环境按需加载。',
      reload: '加载诊断',
      availability: {
        available: '可用',
        unavailable: '此构建不可用',
        'reload-required': '按需加载',
      },
    },
  },
};

export function cinemaLabelsFor(language: Language): BakudanCinemaLabels {
  return language === 'zh-CN' || language === 'zh-TW' ? CHINESE : ENGLISH;
}
