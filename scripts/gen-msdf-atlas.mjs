#!/usr/bin/env bun
/**
 * Generate the MSDF glyph atlas for the danmaku WebGL text path.
 *
 * Why: at 5,000 concurrent danmaku the Canvas2D bottleneck is per-glyph draw +
 * overdraw fill-rate (see vectojs-docs/forge/findings.md, 2026-07-20). The fix
 * is the GPU text path (`pointBackend:'webgl'` + `MSDFFont` + `addGlyph`), which
 * batches every glyph in a frame into ~1 draw call. That needs an MSDF atlas
 * covering the content library's glyphs.
 *
 * This script is the reproducible source of `public/msdf/atlas.{png,json}`:
 *   1. Collect the unique codepoints actually used by ContentLibrary.
 *   2. Drop emoji (color glyphs — MSDF is monochrome; they use the Canvas2D
 *      glyph-bitmap fallback instead) and add the printable ASCII range so
 *      user-typed Latin/digits/punctuation also hit the GPU path.
 *   3. Shell out to `msdf-atlas-gen` (Chlumsky) to rasterize the atlas + emit
 *      the layout JSON that `@vectojs/core`'s `MSDFFont.parse` consumes.
 *
 * Requires `msdf-atlas-gen` on PATH (build/install once; not a runtime dep).
 * Font: Noto Sans CJK SC (ubiquitous, covers all CJK in the library).
 *
 * Usage:  bun run scripts/gen-msdf-atlas.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { ContentLibrary } from '../src/model/ContentLibrary.ts';

const FONT = process.env.MSDF_FONT ?? '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc';
const OUT_DIR = new URL('../public/msdf/', import.meta.url).pathname;
const GLYPH_SIZE = 40; // em → px raster size; crisp for the 18–30px render tiers
const PX_RANGE = 6; // distance-field range in atlas px (edge sharpness / glow)

const emojiRe = /\p{Extended_Pictographic}/u;

// 1) unique codepoints from the fixed content library
const set = new Set();
for (const s of ContentLibrary.entries) {
  for (const ch of s) {
    if (emojiRe.test(ch)) continue; // emoji → Canvas2D fallback
    set.add(ch.codePointAt(0));
  }
}
// 2) printable ASCII (space..~) so user-typed Latin/digits/punct hit the GPU too
for (let c = 0x20; c <= 0x7e; c++) set.add(c);

const codes = [...set].sort((a, b) => a - b);

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// msdf-atlas-gen charset syntax: whitespace/comma-separated decimal codepoints.
const charsetPath = `${OUT_DIR}charset.txt`;
writeFileSync(charsetPath, codes.join(', ') + '\n');
console.log(`charset: ${codes.length} glyphs → ${charsetPath}`);

// 3) generate atlas.png + atlas.json
const args = [
  '-font',
  FONT,
  '-charset',
  charsetPath,
  '-type',
  'msdf',
  '-format',
  'png',
  '-size',
  String(GLYPH_SIZE),
  '-pxrange',
  String(PX_RANGE),
  '-potr', // power-of-two, rectangle-allowed atlas
  '-imageout',
  `${OUT_DIR}atlas.png`,
  '-json',
  `${OUT_DIR}atlas.json`,
];
console.log('msdf-atlas-gen', args.join(' '));
execFileSync('msdf-atlas-gen', args, { stdio: 'inherit' });
console.log('done → public/msdf/atlas.png, public/msdf/atlas.json');
