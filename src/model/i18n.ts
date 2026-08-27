import type { PresetId } from '@vectojs/danmaku-core';

export type Language = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ko';

export const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    'video.error.network': 'The video could not be downloaded.',
    'video.error.media': 'The video format or codec is not supported.',
    'video.error.metadata': 'The video metadata is missing or invalid.',
    'video.error.playback': 'The browser rejected video playback.',
    'a11y.playing': 'Playing.',
    'a11y.paused': 'Paused.',
    'a11y.seeked': 'Seeked to',
    'a11y.selectionCleared': 'Selection cleared.',
    'a11y.labClosed': 'Lab panel closed.',
    'a11y.fullscreenEntered': 'Entered fullscreen.',
    'a11y.fullscreenExited': 'Exited fullscreen.',
    'a11y.fullscreenError': 'Fullscreen is unavailable here.',
    'a11y.helpOpened': 'Keyboard shortcuts help opened.',
    'a11y.helpClosed': 'Keyboard shortcuts help closed.',

    'fx.glow': 'Neon Glow',
    'fx.gradient': 'Color Gradient',
    'fx.rainbow': 'Rainbow Cycle',
    'fx.outline': 'Text Outline',
  },
  'zh-CN': {
    'video.error.network': '无法下载视频。',
    'video.error.media': '不支持此视频格式或编解码器。',
    'video.error.metadata': '视频元数据缺失或无效。',
    'video.error.playback': '浏览器拒绝播放视频。',
    'a11y.playing': '正在播放。',
    'a11y.paused': '已暂停。',
    'a11y.seeked': '已跳转到',
    'a11y.selectionCleared': '已取消选择。',
    'a11y.labClosed': '已关闭实验面板。',
    'a11y.fullscreenEntered': '已进入全屏。',
    'a11y.fullscreenExited': '已退出全屏。',
    'a11y.fullscreenError': '当前环境不支持全屏。',
    'a11y.helpOpened': '已打开键盘快捷键帮助。',
    'a11y.helpClosed': '已关闭键盘快捷键帮助。',

    'fx.glow': '霓虹发光',
    'fx.gradient': '色彩渐变',
    'fx.rainbow': '七彩虹动效',
    'fx.outline': '描边字影',
  },
  'zh-TW': {
    'video.error.network': '無法下載影片。',
    'video.error.media': '不支援此影片格式或編解碼器。',
    'video.error.metadata': '影片中繼資料缺失或無效。',
    'video.error.playback': '瀏覽器拒絕播放影片。',
    'a11y.playing': '正在播放。',
    'a11y.paused': '已暫停。',
    'a11y.seeked': '已跳轉到',
    'a11y.selectionCleared': '已取消選擇。',
    'a11y.labClosed': '已關閉實驗面板。',
    'a11y.fullscreenEntered': '已進入全螢幕。',
    'a11y.fullscreenExited': '已離開全螢幕。',
    'a11y.fullscreenError': '目前環境不支援全螢幕。',
    'a11y.helpOpened': '已開啟鍵盤快捷鍵說明。',
    'a11y.helpClosed': '已關閉鍵盤快捷鍵說明。',

    'fx.glow': '霓虹發光',
    'fx.gradient': '色彩漸變',
    'fx.rainbow': '七彩虹動效',
    'fx.outline': '描邊字影',
  },
  ja: {
    'video.error.network': '動画をダウンロードできませんでした。',
    'video.error.media': '動画形式またはコーデックに対応していません。',
    'video.error.metadata': '動画のメタデータがないか無効です。',
    'video.error.playback': 'ブラウザーが動画の再生を拒否しました。',
    'a11y.playing': '再生中。',
    'a11y.paused': '一時停止しました。',
    'a11y.seeked': 'シーク先',
    'a11y.selectionCleared': '選択を解除しました。',
    'a11y.labClosed': 'ラボパネルを閉じました。',
    'a11y.fullscreenEntered': '全画面表示に切り替えました。',
    'a11y.fullscreenExited': '全画面表示を解除しました。',
    'a11y.fullscreenError': 'この環境では全画面表示を利用できません。',
    'a11y.helpOpened': 'キーボードショートカットヘルプを開きました。',
    'a11y.helpClosed': 'キーボードショートカットヘルプを閉じました。',

    'fx.glow': 'ネオングロー',
    'fx.gradient': 'カラーグラデ',
    'fx.rainbow': 'レインボー移動',
    'fx.outline': 'テキストアウトライン',
  },
  ko: {
    'video.error.network': '비디오를 다운로드할 수 없습니다.',
    'video.error.media': '지원되지 않는 비디오 형식 또는 코덱입니다.',
    'video.error.metadata': '비디오 메타데이터가 없거나 잘못되었습니다.',
    'video.error.playback': '브라우저가 비디오 재생을 거부했습니다.',
    'a11y.playing': '재생 중입니다.',
    'a11y.paused': '일시정지되었습니다.',
    'a11y.seeked': '이동한 위치',
    'a11y.selectionCleared': '선택이 해제되었습니다.',
    'a11y.labClosed': '랩 패널을 닫았습니다.',
    'a11y.fullscreenEntered': '전체 화면으로 전환했습니다.',
    'a11y.fullscreenExited': '전체 화면을 해제했습니다.',
    'a11y.fullscreenError': '이 환경에서는 전체 화면을 사용할 수 없습니다.',
    'a11y.helpOpened': '키보드 단축키 도움말을 열었습니다.',
    'a11y.helpClosed': '키보드 단축키 도움말을 닫았습니다.',

    'fx.glow': '네온 글로우',
    'fx.gradient': '컬러 그라데이션',
    'fx.rainbow': '레인보우 사이클',
    'fx.outline': '텍스트 아웃라인',
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
