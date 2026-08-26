/**
 * Lab "Benchmark" tab — runs the in-page stress benchmark and exports JSON.
 *
 * The panel is deliberately dumb UI: it renders phase/detail lines from state
 * and raises onRun/onCopy/onDownload. The measurement lives in
 * `src/model/InPageBench.ts`, the orchestration in `App`. The saturation line
 * is fed by App's plateau detector so a target the scheduler cannot hold
 * (band-refused placement, danmaku-core#8) says so instead of under-filling
 * silently.
 *
 * Result lines are a fixed Text set blanked when absent — Text has no
 * visibility toggle, and an empty string renders nothing.
 */
import { Button, RadioGroup, Text } from '@vectojs/ui';
import { LabPanel } from '@vectojs/danmaku-kit/ui';

export interface BenchmarkPanelLabels {
  panel: string;
  scroll: string;
  fpsHeading: string;
  run: string;
  running: string;
  copy: string;
  download: string;
  copied: string;
  idle: string;
  resultHeading: string;
}

export interface BenchmarkPanelState {
  /** Rendered-frame cap the selector applies to `Scene.maxFPS`. */
  frameRate: number;
  /** Honest renderer readout, e.g. "WebGL/MSDF" (WebGPU has no danmaku path). */
  backendLabel: string;
  running: boolean;
  /** Live phase/detail line while running; the idle hint when not. */
  statusLine: string;
  /** Present when a run finished: short headline figures for the panel. */
  resultLines: readonly string[];
  /** Present while a plateau is detected at max spawn rate. */
  saturationLine: string | null;
  copied: boolean;
}

/** Fixed number of result rows the panel renders (blanked when absent). */
export const BENCH_RESULT_ROWS = 4;

export interface BenchmarkPanelOptions {
  theme: { fontUi: string; text: string; accent: string; border: string; focusRing: string };
  labels: BenchmarkPanelLabels;
  state: BenchmarkPanelState;
  onFrameRateChange(hz: number): void;
  onRun(): void;
  onCopy(): void;
  onDownload(): void;
}

export class BenchmarkPanel extends LabPanel<BenchmarkPanelState> {
  private readonly options: BenchmarkPanelOptions;
  private readonly statusText: Text;
  private readonly saturationText: Text;
  private readonly fpsGroup: RadioGroup;
  private readonly backendText: Text;
  private readonly resultHeading: Text;
  private readonly resultTexts: Text[] = [];
  private readonly runButton: Button;
  private readonly copyButton: Button;
  private readonly downloadButton: Button;

  constructor(options: BenchmarkPanelOptions) {
    super(options.labels.panel, options.labels.scroll);
    this.options = options;

    this.statusText = new Text(options.labels.idle, {
      font: options.theme.fontUi,
      color: options.theme.text,
    });
    this.content.add(this.statusText);

    this.saturationText = new Text('', {
      font: options.theme.fontUi,
      color: options.theme.accent,
    });
    this.content.add(this.saturationText);

    this.fpsGroup = new RadioGroup({
      label: options.labels.fpsHeading,
      options: [60, 120, 144, 240].map((hz) => ({
        value: String(hz),
        label: `${hz} Hz`,
      })),
      value: String(options.state.frameRate),
      direction: 'horizontal',
      gap: 16,
      font: options.theme.fontUi,
      color: options.theme.text,
      accent: options.theme.accent,
      border: options.theme.border,
      onChange: (value) => options.onFrameRateChange(Number(value)),
    });
    this.content.add(this.fpsGroup);

    this.backendText = new Text('', {
      font: options.theme.fontUi,
      color: options.theme.text,
    });
    this.content.add(this.backendText);

    this.runButton = new Button(options.labels.run, {
      onClick: () => options.onRun(),
      bg: options.theme.accent,
      hoverBg: options.theme.accent,
      color: '#ffffff',
      font: options.theme.fontUi,
    });
    this.content.add(this.runButton);

    this.copyButton = new Button(options.labels.copy, {
      onClick: () => options.onCopy(),
      bg: options.theme.border,
      hoverBg: options.theme.text,
      color: options.theme.text,
      font: options.theme.fontUi,
    });
    this.copyButton.disabled = true;
    this.content.add(this.copyButton);

    this.downloadButton = new Button(options.labels.download, {
      onClick: () => options.onDownload(),
      bg: options.theme.border,
      hoverBg: options.theme.text,
      color: options.theme.text,
      font: options.theme.fontUi,
    });
    this.downloadButton.disabled = true;
    this.content.add(this.downloadButton);

    this.resultHeading = new Text('', {
      font: options.theme.fontUi,
      color: options.theme.text,
    });
    this.content.add(this.resultHeading);
    for (let i = 0; i < BENCH_RESULT_ROWS; i++) {
      const text = new Text('', {
        font: options.theme.fontUi,
        color: options.theme.text,
      });
      this.resultTexts.push(text);
      this.content.add(text);
    }

    this.setState(options.state);
    this.relayoutContent();
  }

  override setState(state: Readonly<BenchmarkPanelState>): void {
    const { labels } = this.options;
    this.runButton.disabled = state.running;
    this.runButton.label = state.running ? labels.running : labels.run;
    const hasResult = !state.running && state.resultLines.length > 0;
    this.copyButton.disabled = !hasResult;
    this.downloadButton.disabled = !hasResult;
    this.copyButton.label = state.copied ? labels.copied : labels.copy;

    this.statusText.setText(state.statusLine);
    this.saturationText.setText(state.saturationLine ?? '');
    this.backendText.setText(state.backendLabel);

    this.resultHeading.setText(hasResult ? labels.resultHeading : '');
    for (let i = 0; i < this.resultTexts.length; i++) {
      this.resultTexts[i]!.setText(hasResult ? (state.resultLines[i] ?? '') : '');
    }
  }
}
