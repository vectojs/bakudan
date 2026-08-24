import { afterEach, describe, expect, it } from 'bun:test';
import { Scene } from '@vectojs/core';
import { StageBackground } from '../src/view/StageBackground';
import { App } from '../src/view/App';

/**
 * Pins the @vectojs/danmaku-kit 0.7.0 geometry bakudan adopts (CTX-0003
 * round 4, closing the round-2 and round-3 deferrals):
 *
 * 1. `controlHeight: 34` derives every command-deck container literal, so the
 *    desktop plate shrinks 56 -> 50px (row 34 + 2x8 padding) and the compact
 *    card 106 -> 94px (8 + 34 + 9 + 34 + 9). The status bar deliberately keeps
 *    its own 34/44px geometry: its heights never derived from the deck's row
 *    constant, and upstream refused that coupling as surprising, not useful.
 * 2. Deck `groups` split the desktop row into compose | transport | utility
 *    plates: boundaries BETWEEN clusters widen to groupGap=24 while spacing
 *    inside a cluster keeps the ordinary 8px gap (`layoutDesktop` flattens the
 *    declared order and widens only cross-cluster boundaries). The compact
 *    layout ignores grouping by design and keeps its proven two-row shape.
 *    `elapsed` rides inside the transport cluster but is excluded from
 *    `layoutSnapshot()`, so its boundary is pinned as an inequality.
 *
 * Derivation constants come from the 0.7.0 dist (PADDING=8, GAP=8,
 * COMPACT_ROW_GAP_PX=9); a future repin that moves them must revisit these
 * pins deliberately, not silently.
 */

/** Kit 0.7.0 constants the derived heights below are computed from. */
const KIT_PADDING_PX = 8;
const KIT_INTRA_CLUSTER_GAP_PX = 8;
const KIT_COMPACT_ROW_GAP_PX = 9;
/** The app's chosen cluster-boundary separation (App.ts). */
const GROUP_GAP_PX = 24;
/** BAKUDAN_THEME.controlHeight: aligned with the 34px desktop status bar. */
const CONTROL_HEIGHT_PX = 34;

interface Fixture {
  app: App;
  scene: Scene;
  host: HTMLElement;
}

const fixtures: Fixture[] = [];

function fixture(width: number, height: number): Fixture {
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: width },
    innerHeight: { configurable: true, value: height },
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  document.body.appendChild(canvas);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const background = new StageBackground({
    host,
    videoFactory: () => document.createElement('video'),
  });
  const scene = new Scene(canvas, {
    maxFPS: 0,
    maxDPR: 1,
    disableWindowResize: true,
  });
  const app = new App(scene, { stageBackground: background });
  app.onResize(width, height);
  const value = { app, scene, host };
  fixtures.push(value);
  return value;
}

afterEach(() => {
  for (const { app, scene, host } of fixtures.splice(0)) {
    app.destroy();
    scene.destroy();
    host.remove();
  }
  document.body.replaceChildren();
});

describe('command deck geometry derives from controlHeight (kit 0.7.0)', () => {
  it('shrinks the desktop plate to row 34 + 2x8 padding = 50px', () => {
    const { app } = fixture(1440, 900);
    const layout = app.getCinemaLayoutSnapshot();
    expect(layout.command.height).toBe(CONTROL_HEIGHT_PX + KIT_PADDING_PX * 2);
    expect(layout.command.height).toBe(50);

    // Deliberate non-coupling: the status bar keeps its own fixed desktop
    // height even though both surfaces now share the same 34px line.
    expect(layout.status.height).toBe(34);
  });

  it('shrinks the compact card to 8 + 34 + 9 + 34 + 9 = 94px', () => {
    const { app } = fixture(390, 844);
    const layout = app.getCinemaLayoutSnapshot();
    expect(layout.command.height).toBe(
      KIT_PADDING_PX + CONTROL_HEIGHT_PX * 2 + KIT_COMPACT_ROW_GAP_PX * 2,
    );
    expect(layout.command.height).toBe(94);
  });
});

describe('command deck groups into compose/transport/utility plates', () => {
  it('widens cluster boundaries to 24px and keeps intra-cluster gaps at 8px', () => {
    const { app } = fixture(1440, 900);
    const { controls, width } = app.getCinemaLayoutSnapshot().command;

    // Compose | transport boundary (send -> play): widened.
    expect(controls.play.x - (controls.send.x + controls.send.width)).toBe(GROUP_GAP_PX);
    // Inside compose (input -> send): ordinary gap.
    expect(controls.send.x - (controls.input.x + controls.input.width)).toBe(
      KIT_INTRA_CLUSTER_GAP_PX,
    );
    // Inside transport (play -> timeline): ordinary gap.
    expect(controls.timeline.x - (controls.play.x + controls.play.width)).toBe(
      KIT_INTRA_CLUSTER_GAP_PX,
    );
    // Inside utility (rate -> lab): ordinary gap.
    expect(controls.lab.x - (controls.rate.x + controls.rate.width)).toBe(KIT_INTRA_CLUSTER_GAP_PX);
    // Transport | utility boundary (timeline -> elapsed -> rate): `elapsed`
    // rides between them but is absent from the snapshot, so pin the widened
    // boundary as everything beyond the intra-cluster minimum.
    expect(controls.rate.x - (controls.timeline.x + controls.timeline.width)).toBeGreaterThan(
      KIT_INTRA_CLUSTER_GAP_PX + KIT_INTRA_CLUSTER_GAP_PX,
    );

    // Flattened cluster order is still strictly left-to-right and the whole
    // row stays inside the plate padding.
    const edges = [
      controls.input.x,
      controls.send.x,
      controls.play.x,
      controls.timeline.x,
      controls.rate.x,
      controls.lab.x,
    ];
    for (let i = 1; i < edges.length; i++) {
      expect(edges[i]!).toBeGreaterThan(edges[i - 1]!);
    }
    expect(controls.input.x).toBe(KIT_PADDING_PX);
    expect(controls.lab.x + controls.lab.width).toBeLessThanOrEqual(width - KIT_PADDING_PX);
  });

  it('keeps grouping out of the compact two-row shape', () => {
    const { app } = fixture(390, 844);
    const { controls } = app.getCinemaLayoutSnapshot().command;

    // Playback row above, compose row below: clusters collapsed into plain
    // rows, no widened boundaries anywhere.
    expect(controls.play.y).toBeLessThan(controls.input.y);
    expect(controls.send.y).toBe(controls.input.y);
    expect(controls.rate.y).toBe(controls.play.y);
  });
});
