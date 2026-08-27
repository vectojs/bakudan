import {
  PAUSE_CHIP_SAFE_GAP_PX,
  PILL_BASELINE_FACTOR,
  PILL_COPY_OFFSET_PX,
  PILL_GAP_PX,
  PILL_HEIGHT_PX,
  PILL_PLATE_MARGIN_PX,
  PILL_WIDTH_PX,
} from '../DanmakuLayer';
import { FREEZE_HOLD_MS, FREEZE_PAD_PX, FREEZE_QUIET_MS } from './types';
import type { App } from '../App';
import type { PoolSlot } from '@vectojs/danmaku-core';

type PtrHost = {
  pool: { slots: PoolSlot[] };
  pointerX: number;
  pointerY: number;
  _lastPointerX: number;
  _lastPointerY: number;
  _pointerStillSince: number;
  _hoverNow: number;
  _freezeState: Map<number, { since: number; released: boolean }>;
  pointerActive: boolean;
  _interactiveMode: boolean;
  _dragSlot: PoolSlot | null;
  _dragOffX: number;
  _dragOffY: number;
  stageW: number;
  stageH: number;
  isMobile: boolean;
  _selectedSlotId: number | null;
  _hoveredAction: import('../SelectionHotspots').HoveredAction;
  _selectedLikeCount: number;
  _selectionHotspots: import('../SelectionHotspots').SelectionHotspots;
  _benchRunning: boolean;
  _hoverPauseEnabled: boolean;
  _dragEnabled: boolean;
  _reactionsEnabled: boolean;
  danmakuLayer: { getStage(): { safeTop?: number } };
  headerBar: { x: number; y: number; width: number; height: number } | null;
  statusBar: { x: number; y: number; width: number; height: number } | null;
  scene: {
    markDirty(): void;
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
  };
  commandDeck: { x: number; y: number; width: number; height: number } | null;
  labDrawer: {
    x: number;
    y: number;
    width: number;
    height: number;
    isOpen: boolean;
  } | null;
  labDrawerHTML: unknown;
  mode: import('./types').AppMode;
  labOpen: boolean;
  setLabOpen(open: boolean): void;
  _handleTapStage(): void;
  _clearSelection(): void;
  _hitsOverlay(o: { x: number; y: number; width: number; height: number }): boolean;
  debugHitsLab(y: number): boolean;
};

function ph(host: App): PtrHost {
  return host as unknown as PtrHost;
}

export function updateHover(host: App): void {
  const h = ph(host);
  const slots = h.pool.slots;
  if (h._benchRunning) {
    for (let i = slots.length - 1; i >= 0; i--) {
      const s = slots[i]!;
      s.hovered = false;
      if (!s.interactionLocked) s.paused = false;
    }
    return;
  }
  const selected = h._selectedSlotId !== null ? slots[h._selectedSlotId] : null;
  const reactionsEnabled =
    (h as unknown as { _reactionsEnabled?: boolean })._reactionsEnabled ?? true;
  if (selected?.active && selected.interactionLocked && reactionsEnabled) {
    selected.paused = true;
    const safeTop =
      h.danmakuLayer?.getStage?.()?.safeTop ??
      (h.headerBar ? (h.isMobile ? 36 : 44) : h.statusBar ? h.statusBar.y + h.statusBar.height : 0);
    const pillTopRaw =
      Math.round(selected.y) + selected.params.fontSize * PILL_BASELINE_FACTOR + PILL_GAP_PX;
    const pillTop = Math.max(pillTopRaw, safeTop + PAUSE_CHIP_SAFE_GAP_PX);
    const pillLeft = Math.round(
      Math.min(
        Math.max(selected.x + selected.width / 2 - PILL_WIDTH_PX / 2, PILL_PLATE_MARGIN_PX),
        Math.max(PILL_PLATE_MARGIN_PX, h.stageW - PILL_WIDTH_PX - PILL_PLATE_MARGIN_PX),
      ),
    );
    h._selectionHotspots.liked = selected.liked ?? false;
    h._selectionHotspots.place(
      pillLeft,
      pillTop,
      PILL_HEIGHT_PX,
      PILL_COPY_OFFSET_PX,
      PILL_WIDTH_PX,
    );
    const hoveredAction = h._selectionHotspots.hitAction(h.pointerX, h.pointerY);
    if (hoveredAction !== h._hoveredAction) {
      h._hoveredAction = hoveredAction;
      h.scene.markDirty();
    }
  } else {
    if (h._selectedSlotId !== null)
      (host as unknown as { _clearSelection(): void })._clearSelection();
  }

  const now = h._hoverNow;
  if (Math.abs(h.pointerX - h._lastPointerX) > 2 || Math.abs(h.pointerY - h._lastPointerY) > 2) {
    h._lastPointerX = h.pointerX;
    h._lastPointerY = h.pointerY;
    h._pointerStillSince = now;
    h._freezeState.clear();
  }
  const hoverPauseEnabled =
    (h as unknown as { _hoverPauseEnabled?: boolean })._hoverPauseEnabled ?? true;
  const dragEnabled = (h as unknown as { _dragEnabled?: boolean })._dragEnabled ?? true;
  const zoneArmed =
    hoverPauseEnabled && h.pointerActive && now - h._pointerStillSince >= FREEZE_QUIET_MS;

  for (let i = slots.length - 1; i >= 0; i--) {
    const s = slots[i];
    if (!s.active || s.interactionLocked) {
      s.hovered = false;
      h._freezeState.delete(s.id);
      continue;
    }
    const inside =
      h.pointerX >= s.x - FREEZE_PAD_PX &&
      h.pointerX <= s.x + s.width + FREEZE_PAD_PX &&
      h.pointerY >= s.y - FREEZE_PAD_PX &&
      h.pointerY <= s.y + s.params.fontSize * 1.5 + FREEZE_PAD_PX;
    if (!inside) {
      h._freezeState.delete(s.id);
      s.hovered = false;
      s.paused = Boolean(dragEnabled && s.dragging);
      continue;
    }
    if (!zoneArmed) {
      s.hovered = false;
      s.paused = Boolean(dragEnabled && s.dragging);
      continue;
    }
    let hold = h._freezeState.get(s.id);
    if (!hold) {
      hold = { since: now, released: false };
      h._freezeState.set(s.id, hold);
    } else if (!hold.released && now - hold.since >= FREEZE_HOLD_MS) {
      hold.released = true;
    }
    const frozen = !hold.released;
    s.hovered = frozen;
    s.paused = (dragEnabled && s.dragging) || frozen;
  }
}

export function handlePointerMove(host: App, event: PointerEvent): void {
  const h = ph(host);
  const rect = h.scene.canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? h.scene.width / rect.width : 1;
  const scaleY = rect.height > 0 ? h.scene.height / rect.height : 1;
  h.pointerX = (event.clientX - rect.left) * scaleX;
  h.pointerY = (event.clientY - rect.top) * scaleY;
  h.pointerActive = true;
  h._interactiveMode = true;
  if ((h as unknown as { _dragEnabled?: boolean })._dragEnabled ?? true) {
    if (h._dragSlot) {
      h._dragSlot.x = h.pointerX - h._dragOffX;
      h._dragSlot.y = h.pointerY - h._dragOffY;
      h.scene.markDirty();
    }
  }
}

export function handlePointerDown(host: App, event: PointerEvent): void {
  const h = ph(host);
  const canvas = h.scene.canvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? h.scene.width / rect.width : 1;
  const scaleY = rect.height > 0 ? h.scene.height / rect.height : 1;
  h.pointerX = (event.clientX - rect.left) * scaleX;
  h.pointerY = (event.clientY - rect.top) * scaleY;

  // Check if pointer is over the like/copy pill — stage tap must not race it (P1-3)
  if (h._selectedSlotId !== null) {
    const action = h._selectionHotspots.hitAction(h.pointerX, h.pointerY);
    if (action !== null) {
      // Let the hotspot's own click handler fire; do not treat as stage tap or drag start
      try {
        h.scene.canvas.setPointerCapture(event.pointerId);
      } catch {}
      return;
    }
  }

  const inCommandDeck =
    h.mode === 'video' &&
    h.commandDeck &&
    hitsOverlay(
      host,
      h.commandDeck as unknown as {
        x: number;
        y: number;
        width: number;
        height: number;
      },
    );
  // P2-3: LabDrawer trap must read the real HTML drawer position when present
  const inLab = h.labDrawerHTML
    ? h.labOpen &&
      (host as unknown as { debugHitsLab(y: number): boolean }).debugHitsLab(h.pointerY)
    : h.labOpen &&
      h.labDrawer &&
      hitsOverlay(
        host,
        h.labDrawer as unknown as {
          x: number;
          y: number;
          width: number;
          height: number;
        },
      );

  if (h.labOpen && !inLab && !inCommandDeck) {
    h.setLabOpen(false);
    return;
  }
  if (inLab || inCommandDeck) return;

  // P2-2 / P1-3: drag initiation — only when dragEnabled and not over a locked slot
  const dragEnabled = (h as unknown as { _dragEnabled?: boolean })._dragEnabled ?? true;
  if (dragEnabled) {
    const findSlot = (host as unknown as { _findSlotAtPointer?: () => PoolSlot | null })
      ._findSlotAtPointer;
    const dragSlot = findSlot ? findSlot.call(host) : null;
    if (dragSlot && !dragSlot.interactionLocked) {
      h._dragSlot = dragSlot;
      (h._dragSlot as unknown as { dragging?: boolean }).dragging = true;
      h._dragOffX = h.pointerX - dragSlot.x;
      h._dragOffY = h.pointerY - dragSlot.y;
    }
  }

  h._handleTapStage();
  try {
    h.scene.canvas.setPointerCapture(event.pointerId);
  } catch {
    /* no active pointer with that id — capture is best-effort */
  }
}

export function handlePointerEnd(host: App): void {
  const h = ph(host);
  h.pointerActive = false;
  if (!h._dragSlot) return;
  (h._dragSlot as unknown as { dragging?: boolean }).dragging = false;
  h._dragSlot.paused = h._dragSlot.hovered;
  h._dragSlot = null;
}

export function handlePointerLeave(host: App): void {
  const h = ph(host);
  h.pointerActive = false;
  h._interactiveMode = false;
  for (const s of h.pool.slots) s.hovered = false;
  h.scene.markDirty();
}

export function hitsOverlay(
  host: App,
  overlay: { x: number; y: number; width: number; height: number },
): boolean {
  const h = ph(host);
  return (
    h.pointerX >= overlay.x &&
    h.pointerX <= overlay.x + overlay.width &&
    h.pointerY >= overlay.y &&
    h.pointerY <= overlay.y + overlay.height
  );
}

export function setupPointerTracking(host: App): void {
  const h = ph(host);
  const canvas = h.scene.canvas;
  canvas.addEventListener(
    'pointermove',
    (h as unknown as { _handlePointerMove: (e: PointerEvent) => void })._handlePointerMove,
  );
  canvas.addEventListener(
    'pointerdown',
    (h as unknown as { _handlePointerDown: (e: PointerEvent) => void })._handlePointerDown,
  );
  canvas.addEventListener(
    'pointerup',
    (h as unknown as { _handlePointerEnd: () => void })._handlePointerEnd,
  );
  canvas.addEventListener(
    'pointercancel',
    (h as unknown as { _handlePointerEnd: () => void })._handlePointerEnd,
  );
  canvas.addEventListener(
    'pointerleave',
    (h as unknown as { _handlePointerLeave: () => void })._handlePointerLeave,
  );
}
