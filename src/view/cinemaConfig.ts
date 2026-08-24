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
  // Fully opaque on purpose. This token backs the status bar, the command
  // deck, and the laboratory drawer, all of which float directly over the
  // danmaku wall. Translucency itself became the defect: at 0.97 the remaining
  // 3% of a chaotic stream still bled through the thin 34px bar and read as a
  // rendering bug rather than glass (round-2 review). The kit paints flat
  // canvas fills and the renderer exposes no backdrop blur, so "true glass" is
  // not reachable app-side; alpha 1 kills the artifact deterministically.
  surface: 'rgba(7, 9, 13, 1)',
  // One step above surface so secondary controls (Play / Lab / rate / input
  // wells) read as raised instead of near-flat: at the old value the fill sat
  // within ~10% contrast of the plate behind it (round-2 review). Slate-800
  // keeps the ramp; textMuted still clears AA over it (ThemeContrast recomputes).
  surfaceRaised: 'rgba(30, 41, 59, 0.98)',
  border: 'rgba(248, 250, 252, 0.18)',
  text: '#f8fafc',
  // Slate-400, joining the slate ramp the rest of the app paints with
  // (#f8fafc text, #e2e8f0 secondary). The old #8d99aa was a warmer,
  // muddier gray that sat outside that family.
  textMuted: '#94a3b8',
  accent: '#f43f5e',
  accentHover: '#e11d48',
  signal: '#60a5fa',
  warning: '#94a3b8',

  danger: '#fb7185',
  // State pills are neutral slate under the one-accent policy (DEC-0011):
  // the kit's stateColor() is the only consumer of these tokens, so
  // neutralizing them here de-colors the Video/Throughput pill outlines
  // without touching anything else. Meaning moves to the label text; loading
  // stays blue (signal = focus/information) and error stays rose because an
  // error must shout.
  success: '#94a3b8',
  // One radius scale across the whole app: kit surfaces AND the app's
  // floating control plates derive from this token (PILL_RADIUS_PX and
  // SELECTED_RADIUS_PX in DanmakuLayer); tight text chips stay 6
  // (USER_BOX_RADIUS_PX in DanmakuLayer).
  radius: 14,
  // Command-deck row height (kit 0.7.0): every deck control sits on this row,
  // and the desktop deck plate derives its full height from it (row + 2x8px
  // padding). The historical 40px row left the deck visibly taller than the
  // status bar it hangs under; 34 aligns the two surfaces with the bar's own
  // fixed 34/44px desktop height (round-2 review deferred ROW_HEIGHT=40
  // upstream with exactly this ask). The status bar deliberately keeps its own
  // geometry -- one token resizing another surface would be surprising
  // coupling, so only the deck follows this value.
  controlHeight: 34,
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
  // Downloaded span of the scrubber, a neutral so it never reads as a second
  // playhead. It has to separate from the track behind it AND from the progress
  // fill in front of it, and those pull opposite ways: measured against this
  // deck, 0.40 gives 1.32:1 vs track and 3.72:1 vs progress, 0.70 gives 2.65:1
  // and 1.85:1. 0.55 is where the two meet (1.88:1 and 2.60:1) at 3.02:1
  // against the deck surface. Non-text, so SC 1.4.11's 3:1 is not the gate --
  // buffering itself is announced by the status bar's live region.
  bufferedTrack: 'rgba(148, 163, 184, 0.55)',
});

/**
 * Paint tokens for the app-side danmaku interaction chrome in DanmakuLayer
 * (user-sent box, hover-pause veil, selection box, action-pill plate).
 *
 * They exist so the canvas chrome and the kit panels speak ONE color language:
 * rose = emphasis/ownership (BAKUDAN_THEME.accent), blue signal = keyboard
 * focus only, neutral slate = transient inspection. The old chrome used a
 * third, off-palette peach (#ff7e5f family) and painted selection blue like
 * focus - both drifted from the theme the panels already follow.
 *
 * CanvasChrome.test.ts pins this derivation; changing a value here must fail
 * that test or update its rationale.
 */
export const DANMAKU_CHROME: Readonly<
  Record<
    | 'hoverFill'
    | 'hoverStroke'
    | 'userSentFill'
    | 'userSentStroke'
    | 'selectedFill'
    | 'selectedStroke'
    | 'selectedTextOutline'
    | 'pillFill'
    | 'pillStroke'
    | 'pillCount'
    | 'pillIcon'
    | 'pillIconActive',
    string
  >
> = Object.freeze({
  // Hover-pause is transient inspection, not identity: a quiet slate veil that
  // says "paused under your pointer" without shouting brand color.
  hoverFill: 'rgba(148, 163, 184, 0.12)',
  // Alpha raised 0.40 -> 0.55 (round 3): at 0.40 the 1px ownership outline on
  // a frozen-hovered danmaku all but vanished in QA stills. Still neutral
  // slate - only the alpha moved.
  hoverStroke: 'rgba(148, 163, 184, 0.55)',
  // User-sent marks ownership, which IS brand emphasis - rose at low alpha,
  // echoing menuSelected/menuHighlight's alpha-only separation language.
  userSentFill: 'rgba(244, 63, 94, 0.10)',
  userSentStroke: 'rgba(244, 63, 94, 0.45)',
  // Selection is content emphasis: stronger rose, clearly distinct from the
  // blue scrubber progress and from keyboard focus. The text outline stays in
  // the dark-stroke family the outline effect already uses - legible on any
  // video frame, unlike a colored stroke that competes with the glyph fill.
  selectedFill: 'rgba(244, 63, 94, 0.16)',
  selectedStroke: 'rgba(244, 63, 94, 0.85)',
  selectedTextOutline: 'rgba(7, 9, 13, 0.80)',
  // Action pill backing plate: the theme's own surface base + hairline border,
  // near-opaque so actions survive bright video frames.
  pillFill: 'rgba(7, 9, 13, 0.92)',
  pillStroke: 'rgba(248, 250, 252, 0.18)',
  // Promoted one step to the theme's own text color: the like count is the
  // pill's primary readout, not a muted afterthought (round-2 review).
  pillCount: '#f8fafc',
  // Round-3 monochrome action icons take the fill colour the emoji never
  // could: theme text normally, the accent itself once liked (rose =
  // emphasis/ownership). CanvasChrome pins both derivations.
  pillIcon: '#f8fafc',
  pillIconActive: '#f43f5e',
});

export interface BakudanPanelLabels {
  videos: VideosPanelLabels;
  /** Title of the app-added "Open local file..." row in the videos panel. */
  localFileTitle: string;
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

function formatTraditionalChineseVideoError(
  error: Readonly<VideoSourceError>,
  candidateId?: string,
): string {
  const message =
    error.code === 'network-error'
      ? '無法下載影片。'
      : error.code === 'metadata-error'
        ? '影片中繼資料缺失或無效。'
        : error.code === 'playback-rejected'
          ? '瀏覽器拒絕播放影片。'
          : '不支援此影片格式或編解碼器。';
  return `${candidateId ? `${candidateId}：` : ''}${message}`;
}

function formatJapaneseVideoError(error: Readonly<VideoSourceError>, candidateId?: string): string {
  const message =
    error.code === 'network-error'
      ? '動画をダウンロードできませんでした。'
      : error.code === 'metadata-error'
        ? '動画のメタデータがないか無効です。'
        : error.code === 'playback-rejected'
          ? 'ブラウザーが動画の再生を拒否しました。'
          : '動画形式またはコーデックに対応していません。';
  return `${candidateId ? `${candidateId}：` : ''}${message}`;
}

function formatKoreanVideoError(error: Readonly<VideoSourceError>, candidateId?: string): string {
  const message =
    error.code === 'network-error'
      ? '비디오를 다운로드할 수 없습니다.'
      : error.code === 'metadata-error'
        ? '비디오 메타데이터가 없거나 잘못되었습니다.'
        : error.code === 'playback-rejected'
          ? '브라우저가 비디오 재생을 거부했습니다.'
          : '지원되지 않는 비디오 형식 또는 코덱입니다.';
  return `${candidateId ? `${candidateId}: ` : ''}${message}`;
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
    localFileTitle: 'Open local file…',
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
    localFileTitle: '打开本地视频…',
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

/**
 * Traditional Chinese. zh-TW previously fell through to the simplified set,
 * which Taiwanese users read as machine-translated; terminology follows the
 * legacy i18n.ts dictionary (影片/中繼資料/控制項).
 */
const TRADITIONAL_CHINESE: BakudanCinemaLabels = {
  kit: {
    product: 'Bakudan 彈幕',
    status: {
      video: '影片',
      stress: '吞吐測試',
      loading: '載入中',
      paused: '已暫停',
      error: '影片來源錯誤',
      activeSummary: (active, capacity) =>
        `${active.toLocaleString()} / ${capacity.toLocaleString()} 條`,
      fpsSummary: (fps) => `${fps} FPS`,
    },
    command: {
      inputPlaceholder: '發一條彈幕…',
      send: '傳送',
      play: '播放',
      pause: '暫停',
      videoPosition: '影片進度',
      playbackRate: '播放速度',
      openLab: '實驗室',
      closeLab: '實驗室',
    },
    lab: {
      title: 'Bakudan 實驗室',
      close: '關閉',
      videos: '影片',
      throughput: '吞吐',
      interactions: '互動',
      devtools: '開發工具',
    },
  },
  panels: {
    videos: {
      panel: '影片實驗室',
      scroll: '影片實驗室控制項',
      videos: '影片來源',
      profiles: '軌道方案',
      profileDetails: '方案詳情',
      metadata: '中繼資料',
      attribution: '署名',
      customUrl: '自訂影片 URL',
      customSource: '自訂 URL',
      choose: '選擇影片',
      retry: '重試影片來源',
      loadState: '影片來源狀態',
      formatLoadState: (state) => {
        if (state.status === 'loading') return `正在載入 ${state.candidateId}`;
        if (state.status === 'ready') return `已就緒 · ${state.sourceId}`;
        return '請選擇影片來源';
      },
      formatLoadError: formatTraditionalChineseVideoError,
      formatMetadata: (rows) => rows.map(({ label, value }) => `${label}：${value}`).join(' · '),
      formatAttribution: (attribution) => attribution || '無需署名',
    },
    localFileTitle: '開啟本機影片…',
    throughput: {
      panel: '吞吐實驗室',
      scroll: '吞吐實驗室控制項',
      capacity: '彈幕池容量',
      target: '目標彈幕數',
      rate: '生成速率',
      quickTargets: '快捷目標',
      distribution: '分布',
      framePercentiles: '幀健康',
      drawSplit: '繪製分布',
      formatCapacity: (value) => value.toLocaleString(),
      formatTarget: (value) => value.toLocaleString(),
      formatRate: (value) => `${value}/秒`,
      formatMetric: (value) => `${Math.round(value * 10) / 10}`,
    },
    interactions: {
      panel: '互動實驗室',
      scroll: '互動實驗室控制項',
      presets: '運動軌跡',
      effects: '新彈幕特效',
      renderClasses: '渲染分類',
    },
    devtools: {
      panel: '開發工具資訊',
      scroll: '開發工具資訊',
      title: '除錯診斷僅在開發環境按需載入。',
      reload: '載入診斷',
      availability: {
        available: '可用',
        unavailable: '此建置不可用',
        'reload-required': '按需載入',
      },
    },
  },
};

/** Japanese. Previously an English fallback for every control surface. */
const JAPANESE: BakudanCinemaLabels = {
  kit: {
    product: 'Bakudan 弾幕',
    status: {
      video: 'ビデオ',
      stress: 'スループット',
      loading: '読み込み中',
      paused: '一時停止中',
      error: 'ビデオソースエラー',
      activeSummary: (active, capacity) =>
        `${active.toLocaleString()} / ${capacity.toLocaleString()} 件`,
      fpsSummary: (fps) => `${fps} FPS`,
    },
    command: {
      inputPlaceholder: 'コメントを入力…',
      send: '送信',
      play: '再生',
      pause: '一時停止',
      videoPosition: 'ビデオの位置',
      playbackRate: '再生速度',
      openLab: 'ラボ',
      closeLab: 'ラボ',
    },
    lab: {
      title: 'Bakudan ラボ',
      close: '閉じる',
      videos: 'ビデオ',
      throughput: 'スループット',
      interactions: 'インタラクション',
      devtools: '開発ツール',
    },
  },
  panels: {
    videos: {
      panel: 'ビデオラボ',
      scroll: 'ビデオラボのコントロール',
      videos: 'ビデオソース',
      profiles: 'トラックプロファイル',
      profileDetails: 'プロファイル詳細',
      metadata: 'メタデータ',
      attribution: '出典',
      customUrl: 'カスタム動画 URL',
      customSource: 'カスタム URL',
      choose: 'ビデオを選択',
      retry: 'ソースを再試行',
      loadState: 'ソースの状態',
      formatLoadState: (state) => {
        if (state.status === 'loading') return `読み込み中 ${state.candidateId}`;
        if (state.status === 'ready') return `準備完了 · ${state.sourceId}`;
        return 'ソースを選択してください';
      },
      formatLoadError: formatJapaneseVideoError,
      formatMetadata: (rows) => rows.map(({ label, value }) => `${label}: ${value}`).join(' · '),
      formatAttribution: (attribution) => attribution || '出典の記載不要',
    },
    localFileTitle: 'ローカル動画を開く…',
    throughput: {
      panel: 'スループットラボ',
      scroll: 'スループットラボのコントロール',
      capacity: 'プール容量',
      target: '目標ライブ数',
      rate: '生成レート',
      quickTargets: 'クイックターゲット',
      distribution: '分布',
      framePercentiles: 'フレームヘルス',
      drawSplit: '描画内訳',
      formatCapacity: (value) => value.toLocaleString(),
      formatTarget: (value) => value.toLocaleString(),
      formatRate: (value) => `${value}/秒`,
      formatMetric: (value) => `${Math.round(value * 10) / 10}`,
    },
    interactions: {
      panel: 'インタラクションラボ',
      scroll: 'インタラクションラボのコントロール',
      presets: 'モーションプリセット',
      effects: '新規コメントエフェクト',
      renderClasses: '描画クラス',
    },
    devtools: {
      panel: '開発ツール情報',
      scroll: '開発ツール情報',
      title: 'デバッグ診断は開発環境でのみ読み込まれます。',
      reload: '診断を読み込む',
      availability: {
        available: '利用可能',
        unavailable: 'このビルドでは利用不可',
        'reload-required': 'オンデマンドで読み込む',
      },
    },
  },
};

/** Korean. Previously an English fallback for every control surface. */
const KOREAN: BakudanCinemaLabels = {
  kit: {
    product: 'Bakudan 단막',
    status: {
      video: '비디오',
      stress: '처리량',
      loading: '로딩 중',
      paused: '일시정지',
      error: '비디오 소스 오류',
      activeSummary: (active, capacity) =>
        `${active.toLocaleString()} / ${capacity.toLocaleString()}개`,
      fpsSummary: (fps) => `${fps} FPS`,
    },
    command: {
      inputPlaceholder: '단막 입력…',
      send: '전송',
      play: '재생',
      pause: '일시정지',
      videoPosition: '비디오 위치',
      playbackRate: '재생 속도',
      openLab: '랩',
      closeLab: '랩',
    },
    lab: {
      title: 'Bakudan 랩',
      close: '닫기',
      videos: '비디오',
      throughput: '처리량',
      interactions: '인터랙션',
      devtools: '개발 도구',
    },
  },
  panels: {
    videos: {
      panel: '비디오 랩',
      scroll: '비디오 랩 컨트롤',
      videos: '비디오 소스',
      profiles: '트랙 프로필',
      profileDetails: '프로필 상세',
      metadata: '메타데이터',
      attribution: '출처',
      customUrl: '사용자 지정 비디오 URL',
      customSource: '사용자 지정 URL',
      choose: '비디오 선택',
      retry: '소스 다시 시도',
      loadState: '소스 상태',
      formatLoadState: (state) => {
        if (state.status === 'loading') return `${state.candidateId} 로딩 중`;
        if (state.status === 'ready') return `준비됨 · ${state.sourceId}`;
        return '소스를 선택하세요';
      },
      formatLoadError: formatKoreanVideoError,
      formatMetadata: (rows) => rows.map(({ label, value }) => `${label}: ${value}`).join(' · '),
      formatAttribution: (attribution) => attribution || '출처 표시 불필요',
    },
    localFileTitle: '로컬 동영상 열기…',
    throughput: {
      panel: '처리량 랩',
      scroll: '처리량 랩 컨트롤',
      capacity: '풀 용량',
      target: '목표 라이브 수',
      rate: '생성 속도',
      quickTargets: '빠른 대상',
      distribution: '분포',
      framePercentiles: '프레임 헬스',
      drawSplit: '그리기 분포',
      formatCapacity: (value) => value.toLocaleString(),
      formatTarget: (value) => value.toLocaleString(),
      formatRate: (value) => `${value}/초`,
      formatMetric: (value) => `${Math.round(value * 10) / 10}`,
    },
    interactions: {
      panel: '인터랙션 랩',
      scroll: '인터랙션 랩 컨트롤',
      presets: '모션 프리셋',
      effects: '신규 댓글 이펙트',
      renderClasses: '렌더 클래스',
    },
    devtools: {
      panel: '개발 도구 정보',
      scroll: '개발 도구 정보',
      title: '디버그 진단은 개발 환경에서만 로드됩니다.',
      reload: '진단 로드',
      availability: {
        available: '사용 가능',
        unavailable: '이 빌드에서는 사용 불가',
        'reload-required': '필요 시 로드',
      },
    },
  },
};

export function cinemaLabelsFor(language: Language): BakudanCinemaLabels {
  switch (language) {
    case 'zh-CN':
      return CHINESE;
    case 'zh-TW':
      // Was a fallthrough to the simplified set; Traditional readers deserve
      // their own script, not a regional typo on every label.
      return TRADITIONAL_CHINESE;
    case 'ja':
      return JAPANESE;
    case 'ko':
      return KOREAN;
    default:
      return ENGLISH;
  }
}
