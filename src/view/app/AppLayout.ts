import type { App } from '../App';
import {
  COMMAND_DECK_MAX_WIDTH,
  DESKTOP_DRAWER_RATIO,
  MOBILE_BREAKPOINT,
  MOBILE_DRAWER_RATIO,
  OVERLAY_MARGIN_DESKTOP,
  OVERLAY_MARGIN_MOBILE,
} from './types';

// Host surface that layout needs. Using `any` for overlay entities avoids
// importing concrete kit types and keeps this module free of circular
// runtime deps; App satisfies it structurally.
type LayoutHost = {
  stageW: number;
  stageH: number;
  isMobile: boolean;
  _viewportTop: number;
  _viewportBottom: number | null;
  statusBar: {
    x: number;
    y: number;
    width: number;
    height: number;
    setCompact(c: boolean): { setWidth(w: number): unknown };
    setWidth(w: number): unknown;
  };
  commandDeck: {
    x: number;
    y: number;
    width: number;
    height: number;
    setCompact(c: boolean): { setWidth(w: number): unknown };
    setWidth(w: number): unknown;
    layoutSnapshot(): {
      lab: { x: number; width: number };
      send: { x: number; width: number };
      input: { x: number; width: number };
      play: { x: number; y: number; width: number };
      timeline: { x: number; width: number };
      rate: { x: number; width: number };
    };
  };
  labDrawer: {
    x: number;
    y: number;
    width: number;
    height: number;
    isOpen: boolean;
    children: unknown[];
    setAvailableBounds(b: { width: number; height: number }): unknown;
  };
  labOpen: boolean;
  scene: { markDirty(): void; width: number; height: number };
  scheduler: { resize(w: number, h: number): void };
  bg: { width: number; height: number };
  _layoutCinema(): void;
};

function getHost(app: App): LayoutHost {
  return app as unknown as LayoutHost;
}

export function onResize(host: App, width: number, height: number): void {
  const h = getHost(host);
  h.stageW = width;
  h.stageH = height;
  h.isMobile = width < MOBILE_BREAKPOINT;
  h.scheduler.resize(width, height);
  h.bg.width = width;
  h.bg.height = height;
  layoutCinema(host);
  h.scene.markDirty();
}

export function onViewportChange(host: App, viewport: VisualViewport): void {
  const h = getHost(host);
  h._viewportTop = viewport.offsetTop;
  h._viewportBottom = viewport.offsetTop + viewport.height;
  layoutCinema(host);
  h.scene.markDirty();
}

export function layoutCinema(host: App): void {
  const h = getHost(host);
  const statusBar = h.statusBar as unknown as {
    x: number;
    y: number;
    width: number;
    height: number;
    setCompact(c: boolean): { setWidth(w: number): unknown };
    setWidth(w: number): unknown;
  };
  const commandDeck = h.commandDeck as unknown as {
    x: number;
    y: number;
    width: number;
    height: number;
    setCompact(c: boolean): { setWidth(w: number): unknown };
    setWidth(w: number): unknown;
  };
  const labDrawer = h.labDrawer as unknown as {
    x: number;
    y: number;
    width: number;
    height: number;
    setAvailableBounds(b: { width: number; height: number }): unknown;
  };
  if (!statusBar || !commandDeck || !labDrawer) return;
  const margin = h.isMobile ? OVERLAY_MARGIN_MOBILE : OVERLAY_MARGIN_DESKTOP;
  const compact = h.isMobile;
  const viewportTop = Math.max(0, h._viewportTop);
  const viewportBottom = Math.min(h.stageH, Math.max(viewportTop, h._viewportBottom ?? h.stageH));
  const viewportHeight = Math.max(0, viewportBottom - viewportTop);
  const deckWidth = Math.max(1, Math.min(COMMAND_DECK_MAX_WIDTH, h.stageW - margin * 2));
  (
    statusBar as unknown as {
      setCompact(c: boolean): { setWidth(w: number): unknown };
    }
  )
    .setCompact(compact)
    .setWidth(Math.max(1, h.stageW - margin * 2));
  statusBar.x = margin;
  statusBar.y = viewportTop;
  (
    commandDeck as unknown as {
      setCompact(c: boolean): { setWidth(w: number): unknown };
    }
  )
    .setCompact(compact)
    .setWidth(deckWidth);
  commandDeck.x = Math.max(margin, (h.stageW - deckWidth) / 2);

  const drawerHeight = Math.round(
    viewportHeight * (compact ? MOBILE_DRAWER_RATIO : DESKTOP_DRAWER_RATIO),
  );
  const drawerY = viewportBottom - drawerHeight;
  labDrawer.setAvailableBounds({ width: h.stageW, height: drawerHeight });
  labDrawer.x = 0;
  labDrawer.y = drawerY;
  const commandBottom = h.labOpen ? drawerY - margin : viewportBottom - margin;
  const stH = (statusBar as unknown as { height: number }).height;
  const stY = (statusBar as unknown as { y: number }).y;
  const cdH = (commandDeck as unknown as { height: number }).height;
  commandDeck.y = Math.max(stY + stH + margin, commandBottom - cdH);
}

export function getCinemaLayoutSnapshot(host: App): {
  status: { x: number; y: number; width: number; height: number };
  command: {
    x: number;
    y: number;
    width: number;
    height: number;
    controls: ReturnType<import('@vectojs/danmaku-kit/ui').DanmakuCommandDeck['layoutSnapshot']>;
  };
  drawer: {
    x: number;
    y: number;
    width: number;
    height: number;
    open: boolean;
    childCount: number;
  };
} {
  const h = getHost(host);
  const sb = h.statusBar as unknown as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  const cd = h.commandDeck as unknown as {
    x: number;
    y: number;
    width: number;
    height: number;
    layoutSnapshot(): ReturnType<
      import('@vectojs/danmaku-kit/ui').DanmakuCommandDeck['layoutSnapshot']
    >;
  };
  const ld = h.labDrawer as unknown as {
    x: number;
    y: number;
    width: number;
    height: number;
    isOpen: boolean;
    children: unknown[];
  };
  return {
    status: { x: sb.x, y: sb.y, width: sb.width, height: sb.height },
    command: {
      x: cd.x,
      y: cd.y,
      width: cd.width,
      height: cd.height,
      controls: cd.layoutSnapshot(),
    },
    drawer: {
      x: ld.x,
      y: ld.y,
      width: ld.width,
      height: ld.height,
      open: ld.isOpen,
      childCount: ld.children.length,
    },
  };
}

export function debugHitsLab(host: App, y: number): boolean {
  const h = getHost(host) as LayoutHost & {
    pointerX: number;
    pointerY: number;
    stageW: number;
    _hitsOverlay(o: { x: number; y: number; width: number; height: number }): boolean;
  };
  const previousX = (h as unknown as { pointerX: number }).pointerX;
  const previousY = (h as unknown as { pointerY: number }).pointerY;
  (h as unknown as { pointerX: number }).pointerX = h.stageW / 2;
  (h as unknown as { pointerY: number }).pointerY = y;
  const result =
    h.labOpen &&
    (
      h as unknown as {
        _hitsOverlay(o: { x: number; y: number; width: number; height: number }): boolean;
      }
    )._hitsOverlay(
      h.labDrawer as unknown as {
        x: number;
        y: number;
        width: number;
        height: number;
      },
    );
  (h as unknown as { pointerX: number }).pointerX = previousX;
  (h as unknown as { pointerY: number }).pointerY = previousY;
  return result;
}

export function hitsOverlay(
  host: App,
  overlay: { x: number; y: number; width: number; height: number },
): boolean {
  const h = getHost(host) as unknown as { pointerX: number; pointerY: number };
  return (
    h.pointerX >= overlay.x &&
    h.pointerX <= overlay.x + overlay.width &&
    h.pointerY >= overlay.y &&
    h.pointerY <= overlay.y + overlay.height
  );
}
