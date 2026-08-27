/**
 * Export a bakudan stress clip to H.264 MP4 via @vectojs/video-exporter.
 *
 * The exporter drives the page's `window.vectoScene` deterministically
 * (stop() the rAF loop, then step(dt) per frame), captures the first
 * <canvas>, and pipes frames to FFmpeg. This script builds dist, serves it
 * through `vite preview`, exports, and always tears the server down.
 *
 * Usage:
 *   bun run tools/export-video.ts [--stress 5000] [--seconds 8] [--fps 60]
 *                                 [--width 1920] [--height 1080]
 *                                 [--out bakudan-clip.mp4]
 *
 * Determinism note: step() advancement is deterministic, but danmaku-core's
 * scheduler seeds text/speed/lanes from bare Math.random(), so two exports
 * differ in content while animating identically. Video mode is not
 * exportable: a DOM <video> advances by wall clock, not by step().
 */
// Patch upstream's waitUntil: the exporter's Chromium at 1280×720 never
// reaches networkidle0 (0 pending yet never idle — viewport-dependent CDP
// quirk, load succeeds in 205ms). Patch the installed file once so the
// exported clip is correct even on a fresh install.
{
  const sessionPath = new URL(
    '../node_modules/@vectojs/video-exporter/dist/export-session.js',
    import.meta.url,
  ).pathname;
  const text = await Bun.file(sessionPath).text();
  if (text.includes('networkidle0')) {
    await Bun.write(sessionPath, text.replaceAll('networkidle0', 'load'));
  }
}
const { exportVideo } = await import('@vectojs/video-exporter');

interface Args {
  stress: number;
  seconds: number;
  fps: number;
  width: number;
  height: number;
  out: string;
  port: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(`--${flag}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const num = (value: string | undefined, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const out = get('out') ?? 'bakudan-clip.mp4';
  return {
    stress: num(get('stress'), 5000),
    seconds: num(get('seconds'), 8),
    fps: num(get('fps'), 60),
    width: num(get('width'), 1920),
    height: num(get('height'), 1080),
    out: out.endsWith('.mp4') ? out : `${out}.mp4`,
    port: num(get('port'), 4173),
  };
}

async function waitFor(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`preview server did not come up at ${url}`);
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    console.log(
      [
        'Usage: bun run tools/export-video.ts [options]',
        '  --stress <n>     Stress danmaku count (default: 5000)',
        '  --seconds <n>    Duration in seconds (default: 8)',
        '  --fps <n>        Frames per second (default: 60)',
        '  --width <n>      Width in pixels (default: 1920)',
        '  --height <n>     Height in pixels (default: 1080)',
        '  --out <file>     Output MP4 path (default: bakudan-clip.mp4)',
        '  --port <n>       Preview server port (default: 4173)',
        '  --dry            Parse args and exit without building/exporting',
        '  --help, -h       Show this help',
        '',
        'Example: bun run tools/export-video.ts --stress 5000 --seconds 5 --out /tmp/out.mp4',
        '         bun run tools/export-video.ts --dry',
      ].join('\n'),
    );
    return;
  }
  if (rawArgs.includes('--dry')) {
    const dryArgs = parseArgs(rawArgs);
    console.log('[export] dry run — parsed args:', dryArgs);
    console.log(
      '[export] would build dist, serve via vite preview, and call exportVideo({url, outputPath, width, height, fps, duration})',
    );
    return;
  }
  const args = parseArgs(rawArgs);
  const controller = new AbortController();
  const onSignal = (): void => controller.abort();
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  let preview: Bun.Subprocess | null = null;
  try {
    console.log('[export] building dist…');
    const build = Bun.spawnSync(['bun', 'run', 'build'], {
      stdout: 'inherit',
      stderr: 'inherit',
    });
    if (build.exitCode !== 0) throw new Error('build failed');

    // Strip remote font links from the served copy: the exporter's Chromium
    // does not inherit shell proxy settings, so fonts.googleapis.com hangs the
    // `load` event and navigation times out. Canvas text uses local fallbacks
    // (the bench harness ships the same way), so nothing visual is lost.
    const indexPath = new URL('../dist/index.html', import.meta.url).pathname;
    const html = await Bun.file(indexPath).text();
    const stripped = html
      .replace(/<link[^>]*fonts\.googleapis[^>]*>\s*/g, '')
      .replace(/<link[^>]*preconnect[^>]*>\s*/g, '');
    if (stripped !== html) await Bun.write(indexPath, stripped);

    console.log(`[export] serving dist on :${args.port}…`);
    // Bind IPv4 explicitly: vite preview defaults to [::1] only, and the
    // exporter's Chromium resolves localhost to 127.0.0.1 first and hangs.
    preview = Bun.spawn(
      ['bun', 'run', 'preview', '--port', String(args.port), '--strictPort', '--host', '127.0.0.1'],
      { stdout: 'ignore', stderr: 'ignore' },
    );
    const url = `http://127.0.0.1:${args.port}/?export=1&stress=${args.stress}`;
    await waitFor(url, 15000);

    console.log(
      `[export] capturing ${args.seconds}s @ ${args.fps}fps ${args.width}x${args.height} (stress=${args.stress})…`,
    );
    await exportVideo({
      url,
      outputPath: args.out,
      width: args.width,
      height: args.height,
      fps: args.fps,
      duration: args.seconds,
      signal: controller.signal,
    });
    const { existsSync } = await import('node:fs');
    if (!existsSync(args.out))
      throw new Error(`export finished but output file missing: ${args.out}`);
    console.log(`[export] wrote ${args.out}`);
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    preview?.kill();
  }
}

await main();
