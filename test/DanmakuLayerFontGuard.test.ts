import { describe, expect, test } from 'bun:test';
import { Entity, Scene, type IRenderer, MSDFFont } from '@vectojs/core';
import { auditScene } from '@vectojs/devtools';
import type { DanmakuPool, PoolSlot } from '@vectojs/danmaku-core';
import { DanmakuLayer } from '../src/view/DanmakuLayer';

/**
 * A failed / malformed MSDF atlas must degrade to the Canvas2D fallback -
 * never throw out of App's load callback and never push NaN glyph quads.
 *
 * `MSDFFont.parse` does no shape validation: an atlas.json that is valid JSON
 * but incomplete (truncated deploy, format drift) parses into a font whose
 * `data.atlas` or `data.metrics` is missing. Before the guard:
 *  - `setMSDF` itself threw (`distanceRange` dereferences `data.atlas`),
 *  - a non-finite ascender reached `_glyphRun` and produced NaN quad geometry.
 *
 * Sabotage: delete the validation block in `DanmakuLayer.setMSDF` (keep the
 * three assignments) - the truncated/NaN cases go red with a TypeError from
 * the `distanceRange` getter; drop the `_isGLSafe` metrics check instead and
 * the white-box NaN-ascender case goes red.
 */

/** `undefined` fields mean "the real thing"; the bad* fields inject junk values. */
interface AtlasSpec {
  omitAtlas?: boolean;
  omitMetrics?: boolean;
  glyphs?: number[];
  badAscender?: unknown;
  badDistanceRange?: unknown;
}

/** Build an msdf-atlas-gen-shaped JSON doc covering ASCII a/b/c unless told otherwise. */
function atlasJson(spec: AtlasSpec): string {
  const doc: Record<string, unknown> = {};
  if (!spec.omitAtlas) {
    doc.atlas = {
      type: 'msdf',
      distanceRange: spec.badDistanceRange !== undefined ? spec.badDistanceRange : 8,
      size: 48,
      width: 128,
      height: 128,
      yOrigin: 'bottom',
    };
  }
  if (!spec.omitMetrics) {
    doc.metrics = {
      emSize: 1,
      lineHeight: 1.2,
      ascender: spec.badAscender !== undefined ? spec.badAscender : 0.8,
      descender: -0.2,
    };
  }
  const cps = spec.glyphs ?? ['a', 'b', 'c'].map((c) => c.codePointAt(0)!);
  doc.glyphs = cps.map((unicode) => ({
    unicode,
    advance: 0.55,
    planeBounds: { left: 0.05, bottom: -0.02, right: 0.5, top: 0.72 },
    atlasBounds: { left: 1, bottom: 1, right: 20, top: 40 },
  }));
  return JSON.stringify(doc);
}

const FONT_VALID = () => MSDFFont.parse(atlasJson({}));

function makeSlot(text: string): PoolSlot {
  return {
    id: 7,
    active: true,
    x: 10,
    y: 10,
    width: 60,
    age: 0,
    hovered: false,
    userSent: false,
    interactionLocked: false,
    charAngles: null,
    liked: false,
    params: {
      text,
      fontSize: 24,
      color: '#fff',
      opacity: 1,
      preset: 'scroll',
      effects: { rainbow: false, outline: false, glow: false, gradient: false },
    },
  } as unknown as PoolSlot;
}

interface GLRecorder {
  textures: unknown[][];
  glyphs: unknown[][];
}

function makeLayer(text = 'abc'): { layer: DanmakuLayer; gl: GLRecorder } {
  const pool = { slots: [makeSlot(text)] } as unknown as DanmakuPool;
  const layer = new DanmakuLayer(pool, () => ({ w: 200, h: 100, interactive: false }));
  const gl: GLRecorder = { textures: [], glyphs: [] };
  // The GL path only arms when `this.scene.pointRenderer` exists; inject a
  // recorder scene without spinning a real WebGL context (none in happy-dom).
  Object.defineProperty(layer, 'scene', {
    configurable: true,
    value: {
      pointRenderer: {
        setMSDFTexture: (...args: unknown[]) => gl.textures.push(args),
        addGlyph: (...args: unknown[]) => gl.glyphs.push(args),
      },
    },
  });
  return { layer, gl };
}

const mockRenderer = (() =>
  ({
    setGlobalAlpha: () => {},
    fillText: () => {},
    drawImage: () => {},
    pixelRatio: 1,
  }) as unknown as IRenderer)();

const TEXTURE = { fake: true } as unknown as HTMLImageElement;

describe('MSDF atlas guard degrades to Canvas2D on malformed font data', () => {
  test('happy path: valid atlas arms the GL batch with finite geometry', () => {
    const { layer, gl } = makeLayer();
    layer.setMSDF({ font: FONT_VALID(), texture: TEXTURE });
    expect(() => layer.render(mockRenderer)).not.toThrow();
    expect(layer.drawStats.glRuns).toBe(1);
    expect(gl.textures).toHaveLength(1);
    expect(gl.textures[0][1]).toBe(8); // distanceRange reaches the shader
    expect(gl.glyphs.length).toBeGreaterThan(0);
    for (const g of gl.glyphs) {
      for (const arg of g.slice(0, 4)) expect(Number.isFinite(arg)).toBe(true);
    }
  });

  test('truncated {"glyphs":[]}: setMSDF refuses, no throw, Canvas2D used', () => {
    const { layer, gl } = makeLayer();
    const font = MSDFFont.parse(atlasJson({ omitAtlas: true, omitMetrics: true }));
    expect(() => layer.setMSDF({ font, texture: TEXTURE })).not.toThrow();
    expect(() => layer.render(mockRenderer)).not.toThrow();
    expect(layer.drawStats.glRuns).toBe(0);
    expect(gl.textures).toHaveLength(0);
    // The plain slot painted through the Canvas2D path instead.
    expect(layer.drawStats.c2dBlits + layer.drawStats.c2dFillText).toBe(1);
  });

  test('non-finite ascender: rejected at adoption AND defused in _isGLSafe', () => {
    const { layer, gl } = makeLayer();
    const font = MSDFFont.parse(atlasJson({ badAscender: [1, 2] }));
    expect(() => layer.setMSDF({ font, texture: TEXTURE })).not.toThrow();
    layer.render(mockRenderer);
    expect(layer.drawStats.glRuns).toBe(0);
    expect(gl.glyphs).toHaveLength(0);

    // Defense in depth: even a bad font adopted by other means must never
    // report GL-safe (white-box - _isGLSafe is the last line before layout).
    const box = layer as unknown as {
      _font: MSDFFont | null;
      _isGLSafe: (t: string) => boolean;
    };
    box._font = MSDFFont.parse(atlasJson({ badAscender: null }));
    expect(box._isGLSafe.call(layer, 'abc')).toBe(false);
  });

  test('non-finite distanceRange: rejected, setMSDFTexture never sees junk', () => {
    const { layer, gl } = makeLayer();
    const font = MSDFFont.parse(atlasJson({ badDistanceRange: 'x' }));
    expect(() => layer.setMSDF({ font, texture: TEXTURE })).not.toThrow();
    layer.render(mockRenderer);
    expect(gl.textures).toHaveLength(0);
    expect(layer.drawStats.glRuns).toBe(0);
  });

  test('zero distanceRange: rejected (would flatten the SDF edge function)', () => {
    const { layer, gl } = makeLayer();
    const font = MSDFFont.parse(atlasJson({ badDistanceRange: 0 }));
    expect(() => layer.setMSDF({ font, texture: TEXTURE })).not.toThrow();
    expect(gl.textures).toHaveLength(0);
  });

  test('missing texture: refused', () => {
    const { layer, gl } = makeLayer();
    expect(() =>
      layer.setMSDF({ font: FONT_VALID(), texture: null as unknown as HTMLImageElement }),
    ).not.toThrow();
    layer.render(mockRenderer);
    expect(gl.textures).toHaveLength(0);
  });

  test('missing glyph falls back per-run while covered text stays on the GPU path', () => {
    const abFont = MSDFFont.parse(atlasJson({ glyphs: ['a', 'b'].map((c) => c.codePointAt(0)!) }));
    // Run containing an uncovered glyph: whole run goes Canvas2D.
    const { layer, gl } = makeLayer('abc');
    layer.setMSDF({ font: abFont, texture: TEXTURE });
    layer.render(mockRenderer);
    expect(layer.drawStats.glRuns).toBe(0);
    expect(layer.drawStats.c2dBlits + layer.drawStats.c2dFillText).toBe(1);
    expect(gl.glyphs).toHaveLength(0);

    // Same adopted font, covered run: still GPU.
    const abLayer = makeLayer('ab').layer;
    abLayer.setMSDF({ font: abFont, texture: TEXTURE });
    abLayer.render(mockRenderer);
    expect(abLayer.drawStats.glRuns).toBe(1);
  });

  test('rejection keeps a previously adopted good font working', () => {
    const { layer, gl } = makeLayer();
    layer.setMSDF({ font: FONT_VALID(), texture: TEXTURE });
    layer.setMSDF({
      font: MSDFFont.parse(atlasJson({ omitAtlas: true, omitMetrics: true })),
      texture: TEXTURE,
    });
    layer.render(mockRenderer);
    // Still rendering glyphs through the FIRST font.
    expect(layer.drawStats.glRuns).toBe(1);
    expect(gl.textures).toHaveLength(1);
  });

  test('scene audit stays clean after rendering with a rejected atlas', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 200;
    const scene = new Scene(canvas, { maxFPS: 0, maxDPR: 1 });
    const pool = { slots: [makeSlot('abc')] } as unknown as DanmakuPool;
    const layer = new DanmakuLayer(pool, () => ({ w: 200, h: 100, interactive: false }));
    scene.add(layer as unknown as Entity);
    layer.setMSDF({
      font: MSDFFont.parse(atlasJson({ omitAtlas: true, omitMetrics: true })),
      texture: TEXTURE,
    });
    expect(() => layer.render(mockRenderer)).not.toThrow();
    expect(auditScene(scene, { includeOverlay: true })).toEqual([]);
    scene.destroy();
  });
});
