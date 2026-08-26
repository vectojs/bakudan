import { paintOrderKey } from '../DanmakuLayer';
import type { PoolSlot } from '@vectojs/danmaku-core';
import type { App } from '../App';

type SelHost = {
  pool: { slots: PoolSlot[] };
  pointerX: number;
  pointerY: number;
  _selectedSlotId: number | null;
  _hoveredAction: import('../SelectionHotspots').HoveredAction;
  _selectedLikeCount: number;
  _selectionHotspots: import('../SelectionHotspots').SelectionHotspots;
  _reactionStore: import('../../model/ReactionStore').ReactionStore | null;
  scene: { markDirty(): void };
  _clearSelection(): void;
  _handleTapVideo(): void;
};

function sh(host: App): SelHost {
  return host as unknown as SelHost;
}

export function findSlotAtPointer(host: App): PoolSlot | null {
  const h = sh(host);
  let best: PoolSlot | null = null;
  let bestKey = -1;
  for (const s of h.pool.slots) {
    if (!s.active || s.interactionLocked) continue;
    const localX = h.pointerX - s.x;
    if (
      localX < 0 ||
      localX > s.width ||
      h.pointerY < s.y ||
      h.pointerY > s.y + s.params.fontSize * 1.5
    )
      continue;
    const key = paintOrderKey(s);
    if (key > bestKey) {
      bestKey = key;
      best = s;
    }
  }
  return best;
}

export function reactionId(slot: PoolSlot): string {
  return slot.params.contentId || `t:${slot.params.text}`;
}

export function handleTapStage(host: App): void {
  const h = sh(host);
  const slot = findSlotAtPointer(host);
  if (!slot) {
    h._clearSelection();
    h._handleTapVideo();
    return;
  }
  if (h._selectedSlotId !== null && h._selectedSlotId !== slot.id) {
    h._clearSelection();
  }
  if (!slot.interactionLocked) {
    slot.interactionLocked = true;
    slot.paused = true;
    h._selectedSlotId = slot.id;
    const rx = h._reactionStore!.get(reactionId(slot));
    slot.liked = rx.liked;
    h._selectedLikeCount = rx.count;
    h.scene.markDirty();
    return;
  }
  h._clearSelection();
}

export function clearSelection(host: App): void {
  const h = sh(host);
  if (h._selectedSlotId !== null) {
    const s = h.pool.slots[h._selectedSlotId];
    if (s) {
      s.interactionLocked = false;
      s.hovered = false;
      s.paused = false;
    }
    h._selectedSlotId = null;
    h._hoveredAction = null;
    h._selectedLikeCount = 0;
    h._selectionHotspots.hide();
    h.scene.markDirty();
  }
}

export function handleLikeToggle(host: App): void {
  const h = sh(host);
  if (h._selectedSlotId === null || !h._reactionStore) return;
  const s = h.pool.slots[h._selectedSlotId];
  if (!s || !s.active) return;
  const rx = h._reactionStore.toggle(reactionId(s));
  s.liked = rx.liked;
  h._selectedLikeCount = rx.count;
  h.scene.markDirty();
}

export function handleCopy(host: App): void {
  const h = sh(host);
  if (h._selectedSlotId === null) return;
  const s = h.pool.slots[h._selectedSlotId];
  if (!s || !s.active) return;
  const text = s.params.text;
  if (
    typeof navigator !== 'undefined' &&
    (
      navigator as unknown as {
        clipboard?: { writeText(t: string): Promise<void> };
      }
    ).clipboard
  ) {
    void (
      navigator as unknown as {
        clipboard: { writeText(t: string): Promise<void> };
      }
    ).clipboard
      .writeText(text)
      .then(
        () => console.log('Copied'),
        () => console.warn('Clipboard unavailable'),
      );
  }
}

export function handleTapVideo(_host: App): void {
  return;
}
