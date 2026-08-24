/**
 * Bundles entry.ts into page/index.html for the shared bench server.
 *
 * Deliberate deviation from the monorepo two-file contract: the shared
 * `benchmarks/_shared/build.ts` bundler resolves every bare `@vectojs/*`
 * specifier to the MONOREPO'S WORKSPACE SOURCE. bakudan is a forge app that
 * exact-pins published npm versions (@vectojs/core 1.38.1, @vectojs/ui 2.19.2,
 * @vectojs/danmaku-core 0.3.0, @vectojs/danmaku-kit 0.8.0) and must measure
 * what an external user experiences — swapping in workspace source would
 * silently benchmark a different engine than the app ships with. So this build
 * uses plain node_modules resolution and only aliases the one shared module it
 * genuinely needs: the envelope/cadence client from the monorepo's
 * benchmarks/_shared/client.ts (never copied — a copy would drift).
 *
 *   bun run benchmarks/stress-baseline/build.ts
 *
 * Shared root discovery, first match wins:
 *   1. $VECTOJS_BENCH_SHARED — explicit override
 *   2. $VECTOJS_WORKSPACE/vectojs/benchmarks/_shared — this workspace's layout
 */
import { cpSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const benchRoot = resolve(new URL('.', import.meta.url).pathname);

function findSharedRoot(): string {
  const override = process.env.VECTOJS_BENCH_SHARED;
  if (override) {
    if (!existsSync(join(override, 'client.ts'))) {
      throw new Error(`VECTOJS_BENCH_SHARED=${override} has no client.ts`);
    }
    return resolve(override);
  }
  const workspace = process.env.VECTOJS_WORKSPACE;
  if (workspace) {
    const candidate = join(workspace, 'vectojs', 'benchmarks', '_shared');
    if (existsSync(join(candidate, 'client.ts'))) return candidate;
  }
  throw new Error(
    'cannot locate vectojs/benchmarks/_shared — set VECTOJS_BENCH_SHARED or VECTOJS_WORKSPACE',
  );
}

const sharedRoot = findSharedRoot();

const out = await Bun.build({
  entrypoints: [join(benchRoot, 'entry.ts')],
  target: 'browser',
  minify: true,
  // App code reads import.meta.env.DEV (devtools availability); Bun does not
  // define it for browser bundles, and undefined would throw on access.
  define: { 'import.meta.env.DEV': 'false' },
  plugins: [
    {
      name: 'bakudan-bench-shared-client',
      setup(builder) {
        builder.onResolve({ filter: /^vectojs-bench-client$/ }, () => ({
          path: join(sharedRoot, 'client.ts'),
        }));
      },
    },
  ],
});
if (!out.success) throw new Error('bundle failed:\n' + out.logs.map(String).join('\n'));
const js = await out.outputs[0]!.text();

// The MSDF atlas is fetched at runtime from relative `msdf/…` URLs; without it
// DanmakuLayer silently falls back to Canvas2D glyphs and the run would measure
// the wrong draw path. Ship it inside page/.
cpSync(resolve(benchRoot, '../../public/msdf'), join(benchRoot, 'page', 'msdf'), {
  recursive: true,
});

await Bun.write(
  join(benchRoot, 'page', 'index.html'),
  `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>bakudan stress baseline bench</title>
    <style>
      :root {
        color-scheme: dark;
      }
      html,
      body {
        background: #07090d;
        color: #e2e8f0;
      }
    </style>
  </head>
  <body>
    <script type="module">${js}</script>
  </body>
</html>
`,
);
console.log(`built page/index.html (client from ${sharedRoot}, exact-pinned engines)`);
