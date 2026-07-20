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
    'help.btn': '?',
    'help.title': 'How to use Bakudan',
    'help.item1.title': '1. Interact with Danmaku',
    'help.item1.desc': 'Hover over a flying danmaku to pause it! You can click the ❤️ to like it or 📝 to copy its content.',
    'help.item2.title': '2. Drag and Drop',
    'help.item2.desc': 'Click and drag any danmaku to move it around the screen freely.',
    'help.item3.title': '3. Video Playback Mode',
    'help.item3.desc': 'Open the right panel to switch to Video Mode. Send danmaku at specific timestamps and watch them replay perfectly in sync!',
    'help.item4.title': '4. Performance Showcase',
    'help.item4.desc': 'Turn on "Physics Gravity Bounce" in the right panel to see 5,000+ entities calculate physics simultaneously at 60FPS with zero DOM overhead.'
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
    'help.btn': '?',
    'help.title': '使用说明',
    'help.item1.title': '1. 与弹幕互动',
    'help.item1.desc': '将鼠标悬停在飞行的弹幕上，它会瞬间静止！你可以点击 ❤️ 点赞，或者点击 📝 复制弹幕内容。',
    'help.item2.title': '2. 拖拽把玩',
    'help.item2.desc': '按住任意弹幕不放，你可以在全屏幕自由拖拽把玩它。',
    'help.item3.title': '3. 视频轨迹回放',
    'help.item3.desc': '在右侧控制台切换到“视频轨迹回放”模式，你可以给视频发送弹幕。它们会被记录在时间轴上，随视频精准回放！',
    'help.item4.title': '4. 性能极限挑战',
    'help.item4.desc': '在右侧控制台开启“重力弹性反弹”特效，体验 5,000+ 弹幕在零 DOM 开销下满 60 帧率计算物理碰撞的震撼引擎性能。'
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
    'help.btn': '?',
    'help.title': '使用說明',
    'help.item1.title': '1. 與彈幕互動',
    'help.item1.desc': '將鼠標懸停在飛行的彈幕上，它會瞬間靜止！你可以點擊 ❤️ 點贊，或者點擊 📝 複製彈幕內容。',
    'help.item2.title': '2. 拖拽把玩',
    'help.item2.desc': '按住任意彈幕不放，你可以在全屏幕自由拖拽把玩它。',
    'help.item3.title': '3. 視頻軌跡回放',
    'help.item3.desc': '在右側控制台切換到“視頻軌跡回放”模式，你可以給視頻發送彈幕。它們會被記錄在時間軸上，隨視頻精準回放！',
    'help.item4.title': '4. 性能極限挑戰',
    'help.item4.desc': '在右側控制台開啟“重力彈性反彈”特效，體驗 5,000+ 彈幕在零 DOM 開銷下滿 60 幀率計算物理碰撞的震撼引擎性能。'
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
    'help.btn': '?',
    'help.title': '使い方',
    'help.item1.title': '1. 弾幕とのインタラクション',
    'help.item1.desc': '流れる弾幕にマウスを乗せると一時停止します！❤️ でいいねしたり、📝 でテキストをコピーできます。',
    'help.item2.title': '2. ドラッグ＆ドロップ',
    'help.item2.desc': '任意の弾幕をドラッグして、画面中を自由に動かせます。',
    'help.item3.title': '3. ビデオ再生モード',
    'help.item3.desc': '右パネルで「ビデオ再生」に切り替え、動画にコメントを投稿できます。シークバーと完璧に同期します。',
    'help.item4.title': '4. パフォーマンスの限界',
    'help.item4.desc': '右パネルで「重力バウンス物理」をオンにして、DOMゼロで毎秒60fpsで計算される5000以上の物理エンティティを体験してください。'
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
    'help.btn': '?',
    'help.title': '사용 방법',
    'help.item1.title': '1. 단막과 상호작용',
    'help.item1.desc': '흐르는 단막에 마우스를 올리면 정지합니다! ❤️ 로 좋아요를 누르거나 📝 로 텍스트를 복사할 수 있습니다.',
    'help.item2.title': '2. 드래그 앤 드롭',
    'help.item2.desc': '어떤 단막이든 클릭하여 화면 어디로든 자유롭게 드래그할 수 있습니다.',
    'help.item3.title': '3. 비디오 재생 모드',
    'help.item3.desc': '오른쪽 패널에서 비디오 모드로 전환하고 특정 시간에 단막을 보내보세요. 영상과 완벽하게 동기화되어 재생됩니다!',
    'help.item4.title': '4. 성능 쇼케이스',
    'help.item4.desc': '오른쪽 패널에서 "중력 탄성 바운스"를 켜고, DOM 부하 없이 60FPS로 물리 연산되는 5,000개 이상의 개체를 경험하세요.'
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
