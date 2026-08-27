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
  } | null;
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
  } | null;
  labDrawer: {
    x: number;
    y: number;
    width: number;
    height: number;
    isOpen: boolean;
    children: unknown[];
    setAvailableBounds(b: { width: number; height: number }): unknown;
  };
  // Hybrid HTML chrome (CTX-0029-0030) — when present, CSS Grid owns layout
  headerBar: unknown | null;
  commandDeckHTML: unknown | null;
  labDrawerHTML: {
    getLayoutInfo(
      stageH: number,
      isMobile: boolean,
    ): { y: number; height: number; width: number; open: boolean };
    setOpen?(open: boolean): void;
  } | null;
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
  // Guard the hybrid path where both Scene's canvas ResizeObserver and
  // main.ts's stageContainer observer can fire for the same logical size —
  // and where getBoundingClientRect inside readStageSize is layout-triggering.
  // Without this, a stable Grid stage would realloc the backing store on every
  // observer tick. Bench mountHost never resizes during measure; hybrid must
  // mirror that quietness once settled.
  if (h.stageW === width && h.stageH === height && h.isMobile === width < MOBILE_BREAKPOINT) return;
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
  // Hybrid shell (CTX-0030): HTML chrome is CSS-positioned. Keep fallback
  // path for happy-dom tests where mounts are absent.
  if (!h.labDrawer && !h.labDrawerHTML) return;
  if (!h.statusBar && !h.headerBar) return;
  if (!h.commandDeck && !h.commandDeckHTML) return;
  const margin = h.isMobile ? OVERLAY_MARGIN_MOBILE : OVERLAY_MARGIN_DESKTOP;
  const compact = h.isMobile;
  const viewportTop = Math.max(0, h._viewportTop);
  const viewportBottom = Math.min(h.stageH, Math.max(viewportTop, h._viewportBottom ?? h.stageH));
  const viewportHeight = Math.max(0, viewportBottom - viewportTop);

  // Header / statusBar: HTML header owns CSS Grid, otherwise layout canvas statusBar
  if (h.headerBar) {
    // no canvas statusBar
  } else if (h.statusBar) {
    (
      h.statusBar as unknown as {
        setCompact(c: boolean): { setWidth(w: number): unknown };
      }
    )
      .setCompact(compact)
      .setWidth(Math.max(1, h.stageW - margin * 2));
    (h.statusBar as unknown as { x: number }).x = margin;
    (h.statusBar as unknown as { y: number }).y = viewportTop;
  }

  const drawerHeight = Math.round(
    viewportHeight * (compact ? MOBILE_DRAWER_RATIO : DESKTOP_DRAWER_RATIO),
  );
  const drawerY = viewportBottom - drawerHeight;
  // Drawer: HTML drawer is CSS-positioned, skip canvas layout when active
  if (h.labDrawerHTML) {
    // no canvas labDrawer bounds
  } else if ((h as unknown as { labDrawer: LayoutHost['labDrawer'] }).labDrawer) {
    (h as unknown as { labDrawer: LayoutHost['labDrawer'] }).labDrawer.setAvailableBounds({
      width: h.stageW,
      height: drawerHeight,
    });
    (h as unknown as { labDrawer: LayoutHost['labDrawer'] }).labDrawer.x = 0;
    (h as unknown as { labDrawer: LayoutHost['labDrawer'] }).labDrawer.y = drawerY;
  }

  // Command deck: HTML deck is CSS-positioned, skip canvas layout
  if (h.commandDeckHTML) {
    return;
  }
  if (!h.commandDeck) return;
  {
    const deckWidth = Math.max(1, Math.min(COMMAND_DECK_MAX_WIDTH, h.stageW - margin * 2));
    (
      h.commandDeck as unknown as {
        setCompact(c: boolean): { setWidth(w: number): unknown };
      }
    )
      .setCompact(compact)
      .setWidth(deckWidth);
    (h.commandDeck as unknown as { x: number }).x = Math.max(margin, (h.stageW - deckWidth) / 2);
    const commandBottom = h.labOpen ? drawerY - margin : viewportBottom - margin;
    const stH = h.headerBar ? 0 : ((h.statusBar as unknown as { height: number })?.height ?? 0);
    const stY = h.headerBar
      ? viewportTop
      : ((h.statusBar as unknown as { y: number })?.y ?? viewportTop);
    const statusBottom = h.headerBar ? viewportTop + margin : stY + stH + margin;
    (h.commandDeck as unknown as { y: number }).y = Math.max(
      statusBottom,
      commandBottom - (h.commandDeck as unknown as { height: number }).height,
    );
  }
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
  const h = getHost(host) as LayoutHost & {
    stageW: number;
    stageH: number;
    isMobile: boolean;
    labOpen: boolean;
    scene: { width: number; height: number };
  };
  // Status: HTML header vs canvas statusBar
  const status = (h as unknown as { headerBar: unknown }).headerBar
    ? (() => {
        const headerEl =
          typeof document !== 'undefined' ? document.getElementById('bakudan-header') : null;
        const rect = (
          headerEl as unknown as {
            getBoundingClientRect?: () => { width: number; height: number };
          }
        )?.getBoundingClientRect?.();
        return {
          x: 0,
          y: 0,
          width: (rect as unknown as { width: number })?.width ?? h.stageW,
          height: (rect as unknown as { height: number })?.height ?? (h.isMobile ? 36 : 44),
        };
      })()
    : (() => {
        const sb = h.statusBar as unknown as {
          x: number;
          y: number;
          width: number;
          height: number;
        };
        return { x: sb.x, y: sb.y, width: sb.width, height: sb.height };
      })();

  const command = (h as unknown as { commandDeckHTML: unknown }).commandDeckHTML
    ? (() => {
        const deckEl =
          typeof document !== 'undefined' ? document.getElementById('command-deck') : null;
        const rect = (
          deckEl as unknown as {
            getBoundingClientRect?: () => {
              width: number;
              height: number;
              left: number;
              top: number;
            };
          }
        )?.getBoundingClientRect?.();
        const width =
          (rect as unknown as { width: number })?.width ??
          Math.min(COMMAND_DECK_MAX_WIDTH, Math.max(1, h.stageW - 32));
        const height = (rect as unknown as { height: number })?.height ?? 50;
        const x =
          (rect as unknown as { left: number })?.left ?? Math.max(0, (h.stageW - width) / 2);
        const y = (rect as unknown as { top: number })?.top ?? 0;
        const dummy = { x, y, width: 0, height: 0 };
        return {
          x,
          y,
          width,
          height,
          controls: {
            input: dummy,
            send: dummy,
            play: dummy,
            timeline: dummy,
            rate: dummy,
            lab: dummy,
          },
        };
      })()
    : h.commandDeck
      ? {
          x: (h.commandDeck as unknown as { x: number }).x,
          y: (h.commandDeck as unknown as { y: number }).y,
          width: (h.commandDeck as unknown as { width: number }).width,
          height: (h.commandDeck as unknown as { height: number }).height,
          controls: (
            h.commandDeck as unknown as {
              layoutSnapshot(): ReturnType<
                import('@vectojs/danmaku-kit/ui').DanmakuCommandDeck['layoutSnapshot']
              >;
            }
          ).layoutSnapshot(),
        }
      : (() => {
          const deckEl =
            typeof document !== 'undefined' ? document.getElementById('command-deck') : null;
          const rect = (
            deckEl as unknown as {
              getBoundingClientRect?: () => {
                width: number;
                height: number;
                left: number;
                top: number;
              };
            }
          )?.getBoundingClientRect?.();
          const width =
            (rect as unknown as { width: number })?.width ??
            Math.min(COMMAND_DECK_MAX_WIDTH, Math.max(1, h.stageW - 32));
          const height = (rect as unknown as { height: number })?.height ?? 50;
          const x =
            (rect as unknown as { left: number })?.left ?? Math.max(0, (h.stageW - width) / 2);
          const y = (rect as unknown as { top: number })?.top ?? 0;
          const dummy = { x, y, width: 0, height: 0 };
          return {
            x,
            y,
            width,
            height,
            controls: {
              input: dummy,
              send: dummy,
              play: dummy,
              timeline: dummy,
              rate: dummy,
              lab: dummy,
            },
          };
        })();

  const drawer = (h as unknown as { labDrawerHTML: LayoutHost['labDrawerHTML'] }).labDrawerHTML
    ? (() => {
        const info = (
          h as unknown as { labDrawerHTML: LayoutHost['labDrawerHTML'] }
        ).labDrawerHTML!.getLayoutInfo(
          h.stageH || (h.scene as unknown as { height: number }).height,
          h.isMobile,
        );
        return {
          x: 0,
          y: info.y,
          width: info.width,
          height: info.height,
          open: info.open,
          childCount: info.open ? 5 : 0,
        };
      })()
    : {
        x: (h.labDrawer as unknown as { x: number }).x,
        y: (h.labDrawer as unknown as { y: number }).y,
        width: (h.labDrawer as unknown as { width: number }).width,
        height: (h.labDrawer as unknown as { height: number }).height,
        open: (h.labDrawer as unknown as { isOpen: boolean }).isOpen,
        childCount: (h.labDrawer as unknown as { children: unknown[] }).children.length,
      };

  return {
    status,
    command: command as unknown as ReturnType<
      import('@vectojs/danmaku-kit/ui').DanmakuCommandDeck['layoutSnapshot']
    > & { x: number; y: number; width: number; height: number; controls: any },
    drawer,
  } as unknown as {
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
  };
}

export function debugHitsLab(host: App, y: number): boolean {
  const h = getHost(host) as LayoutHost & {
    pointerX: number;
    pointerY: number;
    stageW: number;
    _hitsOverlay(o: { x: number; y: number; width: number; height: number }): boolean;
  };
  // HTML drawer path
  if ((h as unknown as { labDrawerHTML: LayoutHost['labDrawerHTML'] }).labDrawerHTML) {
    if (!h.labOpen) return false;
    const info = (
      h as unknown as { labDrawerHTML: LayoutHost['labDrawerHTML'] }
    ).labDrawerHTML!.getLayoutInfo(h.stageH, h.isMobile);
    return y >= info.y && y <= h.stageH;
  }
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
