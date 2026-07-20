import type { PresetId } from './types';

export type Language = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ko';

export const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    'settings.title': 'CONTROL CONSOLE',
    'settings.mode': 'RUNNING MODE',
    'settings.preset': 'MOTION PRESET',
    'settings.stress': 'STRESS SIMULATOR',
    'stress.count': 'Count',
    'stress.rate': 'Rate /s',
    'settings.fx': 'CHARACTER EFFECTS',
    'settings.showcase': 'VECTOJS SHOWCASE',
    'settings.bg': 'BACKGROUND STYLE',
    'settings.fps': 'FRAME RATE CAP',
    'settings.lang': 'LANGUAGE SELECT',

    'mode.stress': 'Stress Simulator',
    'mode.video': 'Video Playback',

    'bg.ambient': 'Ambient Blend',
    'bg.none': 'Solid Backdrop',
    'bg.video': 'Video (opt-in)',

    'fps.max': 'Max (uncapped)',

    'fx.glow': 'Neon Glow',
    'fx.gradient': 'Color Gradient',
    'fx.rainbow': 'Rainbow Cycle',
    'fx.outline': 'Text Outline',

    'showcase.physics': 'Physics Gravity Bounce',
    'showcase.jelly': 'Jelly Spring Wobble',

    'hud.fps': 'FPS',
    'hud.state': 'Engine State',
    'hud.state.throttle': 'Idle Throttle (2fps)',
    'hud.state.active': 'Active Run (60fps)',
    'hud.barrage': 'Barrage Count',
    'hud.cache': 'Width Cache',
    'hud.gc': 'GC Saved',
    'hud.objs': 'objs/s',
    'hud.hit': 'hit',

    'dock.placeholder': 'Send a danmaku...',
    'dock.send': 'Send',
  },
  'zh-CN': {
    'settings.title': '控制台面版',
    'settings.mode': '运行模式',
    'settings.preset': '弹幕运动轨迹',
    'settings.stress': '压力测试参数',
    'stress.count': '弹幕数量',
    'stress.rate': '频率 /秒',
    'settings.fx': '弹幕特效滤镜',
    'settings.showcase': 'VECTOJS 演示',
    'settings.bg': '背景画布样式',
    'settings.fps': '最大渲染帧率',
    'settings.lang': '语言切换 (Language)',

    'mode.stress': '随机压测模式',
    'mode.video': '视频轨迹回放',

    'bg.ambient': '炫彩动态渐变',
    'bg.none': '纯黑色背景',
    'bg.video': '高清测试视频',

    'fps.max': '最大 (无限制)',

    'fx.glow': '霓虹发光',
    'fx.gradient': '色彩渐变',
    'fx.rainbow': '七彩虹动效',
    'fx.outline': '描边字影',

    'showcase.physics': '重力弹性反弹',
    'showcase.jelly': '进场果冻抖动',

    'hud.fps': '渲染帧率',
    'hud.state': '引擎状态',
    'hud.state.throttle': '空闲休眠 (2fps)',
    'hud.state.active': '活跃运行 (60fps)',
    'hud.barrage': '活跃弹幕',
    'hud.cache': '宽度缓存',
    'hud.gc': '避免内存分配',
    'hud.objs': '个对象/秒',
    'hud.hit': '命中',

    'dock.placeholder': '发一条弹幕...',
    'dock.send': '发射',
  },
  'zh-TW': {
    'settings.title': '控制台面版',
    'settings.mode': '運行模式',
    'settings.preset': '彈幕運動軌跡',
    'settings.stress': '壓力測試參數',
    'stress.count': '彈幕數量',
    'stress.rate': '頻率 /秒',
    'settings.fx': '彈幕特效濾鏡',
    'settings.showcase': 'VECTOJS 演示',
    'settings.bg': '背景畫布樣式',
    'settings.fps': '最大渲染幀率',
    'settings.lang': '語言切換 (Language)',

    'mode.stress': '隨機壓測模式',
    'mode.video': '視頻軌跡回放',

    'bg.ambient': '炫彩動態漸變',
    'bg.none': '純黑色背景',
    'bg.video': '高清測試視頻',

    'fps.max': '最大 (無限制)',

    'fx.glow': '霓虹發光',
    'fx.gradient': '色彩漸變',
    'fx.rainbow': '七彩虹動效',
    'fx.outline': '描邊字影',

    'showcase.physics': '重力彈性反彈',
    'showcase.jelly': '進場果凍抖動',

    'hud.fps': '渲染幀率',
    'hud.state': '引擎狀態',
    'hud.state.throttle': '空閑休眠 (2fps)',
    'hud.state.active': '活躍運行 (60fps)',
    'hud.barrage': '活躍彈幕',
    'hud.cache': '寬度緩存',
    'hud.gc': '避免內存分配',
    'hud.objs': '個對象/秒',
    'hud.hit': '命中',

    'dock.placeholder': '發一條彈幕...',
    'dock.send': '發射',
  },
  ja: {
    'settings.title': 'コントロールパネル',
    'settings.mode': '実行モード',
    'settings.preset': '流れるモーション',
    'settings.stress': '負荷テスト設定',
    'stress.count': '発射数',
    'stress.rate': '頻度 /秒',
    'settings.fx': 'エフェクト設定',
    'settings.showcase': 'VECTOJS ショーケース',
    'settings.bg': '背景スタイル',
    'settings.fps': 'フレームレート上限',
    'settings.lang': '言語の切り替え (Language)',

    'mode.stress': 'ランダムストレステスト',
    'mode.video': 'ビデオ再生トラック',

    'bg.ambient': 'グラデーション背景',
    'bg.none': 'ダーク背景',
    'bg.video': 'ビデオ (オプトイン)',

    'fps.max': '最大 (制限なし)',

    'fx.glow': 'ネオングロー',
    'fx.gradient': 'カラーグラデ',
    'fx.rainbow': 'レインボー移動',
    'fx.outline': 'テキストアウトライン',

    'showcase.physics': '重力バウンス物理',
    'showcase.jelly': '入場時のゼリー揺れ',

    'hud.fps': 'フレームレート',
    'hud.state': 'エンジン状態',
    'hud.state.throttle': 'スロットル (2fps)',
    'hud.state.active': 'アクティブ (60fps)',
    'hud.barrage': '弾幕オブジェクト',
    'hud.cache': '幅キャッシュ率',
    'hud.gc': 'GC回避個数',
    'hud.objs': '個/秒',
    'hud.hit': 'ヒット',

    'dock.placeholder': 'コメントを入力...',
    'dock.send': '送信',
  },
  ko: {
    'settings.title': '제어 콘솔',
    'settings.mode': '실행 모드',
    'settings.preset': '움직임 프리셋',
    'settings.stress': '스트레스 시뮬레이터',
    'stress.count': '개수',
    'stress.rate': '빈도 /초',
    'settings.fx': '문자 특수효과',
    'settings.showcase': 'VECTOJS 쇼케이스',
    'settings.bg': '배경 스타일',
    'settings.fps': '프레임 레이트 제한',
    'settings.lang': '언어 설정 (Language)',

    'mode.stress': '스트레스 시뮬레이터',
    'mode.video': '비디오 트랙 재생',

    'bg.ambient': '앰비언트 그라데이션',
    'bg.none': '다크 단색 배경',
    'bg.video': '테스트 비디오',

    'fps.max': '최대 (제한 없음)',

    'fx.glow': '네온 글로우',
    'fx.gradient': '컬러 그라데이션',
    'fx.rainbow': '레인보우 사이클',
    'fx.outline': '텍스트 아웃라인',

    'showcase.physics': '중력 탄성 바운스',
    'showcase.jelly': '진입 젤리 효과',

    'hud.fps': '프레임 레이트',
    'hud.state': '엔진 상태',
    'hud.state.throttle': '유휴 스로틀 (2fps)',
    'hud.state.active': '활성 실행 (60fps)',
    'hud.barrage': '활성 단막 수',
    'hud.cache': '너비 캐시율',
    'hud.gc': '메모리 할당 회피',
    'hud.objs': '개/초',
    'hud.hit': '적중',

    'dock.placeholder': '단막 코멘트 입력...',
    'dock.send': '전송',
  },
};

export const PRESET_TRANSLATIONS: Record<Language, Record<PresetId, string>> = {
  en: {
    scroll: 'Scroll →',
    reverse: '← Reverse',
    top: 'Top Fixed',
    bottom: 'Bottom Fixed',
    sine: 'Sine Wave',
    rotation: 'Rotating Chars',
    glitch: 'Glitch Effect',
    repulsion: 'Cursor Repulsion',
  },
  'zh-CN': {
    scroll: '从右往左流动 →',
    reverse: '← 从左往右流动',
    top: '顶部固定弹幕',
    bottom: '底部固定弹幕',
    sine: '正弦曲线抖动',
    rotation: '字符绕轴旋转',
    glitch: '故障故障特效',
    repulsion: '躲避鼠标指针',
  },
  'zh-TW': {
    scroll: '從右往左流動 →',
    reverse: '← 從左往右流動',
    top: '頂部固定彈幕',
    bottom: '底部固定彈幕',
    sine: '正弦曲線抖動',
    rotation: '字符繞軸旋轉',
    glitch: '故障故障特效',
    repulsion: '躲避鼠標指針',
  },
  ja: {
    scroll: '右から左へ流す →',
    reverse: '← 左から右へ流す',
    top: '上部に固定',
    bottom: '下部に固定',
    sine: '正弦波ゆらゆら',
    rotation: '文字のその場回転',
    glitch: 'グリッチノイズ',
    repulsion: 'マウスカーソル反発',
  },
  ko: {
    scroll: '우측에서 좌측으로 →',
    reverse: '← 좌측에서 우측으로',
    top: '상단 고정 단막',
    bottom: '하단 고정 단막',
    sine: '사인파 흔들기',
    rotation: '개별 문자 회전',
    glitch: '글리치 노이즈',
    repulsion: '마우스 커서 회피',
  },
};

export function t(key: string, lang: Language): string {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  return dict[key] || key;
}

export function detectBrowserLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en';
  const l = navigator.language.toLowerCase();
  if (l.startsWith('zh-cn')) return 'zh-CN';
  if (l.startsWith('zh-tw') || l.startsWith('zh-hk')) return 'zh-TW';
  if (l.startsWith('ja')) return 'ja';
  if (l.startsWith('ko')) return 'ko';
  return 'en';
}
