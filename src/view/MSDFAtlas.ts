import { MSDFFont } from '@vectojs/core';

/**
 * Loads the committed MSDF glyph atlas (see scripts/gen-msdf-atlas.mjs) and
 * exposes the parsed {@link MSDFFont} plus its texture image for the WebGL text
 * path. The atlas covers the fixed ContentLibrary glyph set + printable ASCII;
 * emoji and any out-of-atlas (user-typed) glyphs fall back to the Canvas2D
 * glyph-bitmap cache in DanmakuLayer.
 *
 * Why WebGL: at 5,000 concurrent danmaku the Canvas2D wall is per-glyph draw +
 * overdraw fill-rate (vectojs-docs/forge/findings.md, 2026-07-20). Routing
 * glyphs through `scene.pointRenderer.addGlyph` batches the whole frame into
 * ~1 GPU draw call — the intended escape hatch for high-count text.
 */
export interface LoadedAtlas {
  font: MSDFFont;
  texture: HTMLImageElement;
}

const JSON_URL = 'msdf/atlas.json';
const PNG_URL = 'msdf/atlas.png';

let cached: Promise<LoadedAtlas | null> | null = null;

/**
 * Fetch + parse the atlas once (memoized). Resolves `null` in non-DOM contexts
 * or if the assets can't be loaded, so callers stay on the Canvas2D path.
 */
export function loadMSDFAtlas(): Promise<LoadedAtlas | null> {
  if (cached) return cached;
  cached = (async () => {
    if (typeof document === 'undefined') return null;
    try {
      const res = await fetch(JSON_URL);
      if (!res.ok) return null;
      const font = MSDFFont.parse(await res.text());
      const texture = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('atlas.png failed to load'));
        img.src = PNG_URL;
      });
      return { font, texture };
    } catch {
      return null;
    }
  })();
  return cached;
}
