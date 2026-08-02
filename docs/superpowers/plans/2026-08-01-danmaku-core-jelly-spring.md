# Danmaku Core Jelly Spring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable, deterministic Jelly spring state and scheduler API to `@vectojs/danmaku-core` so Bakudan can render real squash/stretch reactions instead of an inert control.

**Architecture:** Spring state lives on preallocated `PoolSlot` objects and is reset by the pool. `Scheduler` owns integration and excitation; motion presets may add an impulse but never allocate. Bakudan consumes the numeric scale state in its existing one-entity renderer. This is a separate public-package change with a minor changeset and release before the app enables Jelly.

**Tech Stack:** TypeScript 7, Bun test, tsup, oxfmt, oxlint, Changesets

---

## Repository boundary

Execute this plan in `vectojs-native/danmaku/danmaku-core`, under a dedicated CarryCtx task/worktree and branch. Do not edit the copy under Bakudan's `node_modules`. The app plan consumes the published package version only after this plan is merged and released.

### Task 1: Add preallocated Jelly state to pool slots

**Files:**

- Modify: `src/model/types.ts:31-56`
- Modify: `src/model/DanmakuPool.ts:84-116`
- Modify: `test/DanmakuPool.test.ts`

- [ ] **Step 1: Write failing slot-initialization and recycle tests**

Add these tests inside the existing `describe('DanmakuPool', ...)` block:

```ts
it('initializes Jelly spring state at rest', () => {
  const pool = new DanmakuPool(1);
  const slot = pool.slots[0]!;
  expect(slot.jellyScaleX).toBe(1);
  expect(slot.jellyScaleY).toBe(1);
  expect(slot.jellyVelocity).toBe(0);
});

it('resets Jelly spring state when a slot is recycled', () => {
  const pool = new DanmakuPool(1);
  const [slot] = pool.activateBatch([makeParams('jelly')]);
  slot!.jellyScaleX = 0.8;
  slot!.jellyScaleY = 1.2;
  slot!.jellyVelocity = 4;
  pool.deactivate(slot!.id);

  const [recycled] = pool.activateBatch([makeParams('again')]);
  expect(recycled!.jellyScaleX).toBe(1);
  expect(recycled!.jellyScaleY).toBe(1);
  expect(recycled!.jellyVelocity).toBe(0);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
bun test test/DanmakuPool.test.ts
```

Expected: FAIL because `PoolSlot` has no Jelly fields and the values are `undefined`.

- [ ] **Step 3: Extend the public slot contract**

Add these required fields to `PoolSlot` in `src/model/types.ts`:

```ts
/** Horizontal squash/stretch multiplier resolved by the Jelly spring. */
jellyScaleX: number;
/** Vertical squash/stretch multiplier resolved by the Jelly spring. */
jellyScaleY: number;
/** Vertical spring velocity; horizontal scale is derived inversely. */
jellyVelocity: number;
```

The fields are required because every slot is preallocated and must have a stable shape in the hot loop.

- [ ] **Step 4: Initialize and reset the fields**

Add to `_resetSlot`:

```ts
s.jellyScaleX = 1;
s.jellyScaleY = 1;
s.jellyVelocity = 0;
```

Add to `_createEmptySlot`:

```ts
jellyScaleX: 1,
jellyScaleY: 1,
jellyVelocity: 0,
```

- [ ] **Step 5: Format and rerun the focused tests**

Run:

```bash
bun run format
bun test test/DanmakuPool.test.ts
```

Expected: all `DanmakuPool` tests pass.

- [ ] **Step 6: Commit the slot contract**

```bash
git add src/model/types.ts src/model/DanmakuPool.ts test/DanmakuPool.test.ts
git commit -m "feat: add Jelly spring slot state"
```

### Task 2: Integrate a deterministic damped spring in Scheduler

**Files:**

- Modify: `src/model/Scheduler.ts:16-20,68-90,141-240,243-305`
- Modify: `test/Scheduler.test.ts`

- [ ] **Step 1: Add failing scheduler behavior tests**

Append to `test/Scheduler.test.ts`:

```ts
it('excites and settles Jelly state deterministically', () => {
  const pool = new DanmakuPool(1);
  const scheduler = new Scheduler(pool, 640, 360, 0);
  scheduler.showcaseJelly = true;
  scheduler.userSpawn({ ...createDefaultParams(), text: 'jelly', preset: 'scroll' });
  const slot = pool.slots.find((candidate) => candidate.active)!;

  expect(slot.jellyVelocity).not.toBe(0);
  for (let i = 0; i < 240; i++) {
    scheduler.tick(1000 / 120, 'scroll', {
      cursorX: 0,
      cursorY: 0,
      pointerActive: false,
    });
  }

  expect(slot.jellyScaleX).toBeCloseTo(1, 2);
  expect(slot.jellyScaleY).toBeCloseTo(1, 2);
  expect(slot.jellyVelocity).toBeCloseTo(0, 1);
});

it('clamps Jelly impulses to a bounded scale range', () => {
  const pool = new DanmakuPool(1);
  const scheduler = new Scheduler(pool, 640, 360, 0);
  scheduler.showcaseJelly = true;
  scheduler.userSpawn({ ...createDefaultParams(), text: 'jelly', preset: 'scroll' });
  const slot = pool.slots.find((candidate) => candidate.active)!;

  for (let i = 0; i < 20; i++) scheduler.exciteJelly(slot.id, 1);
  scheduler.tick(16, 'scroll', { cursorX: 0, cursorY: 0, pointerActive: false });

  expect(slot.jellyScaleX).toBeGreaterThanOrEqual(0.68);
  expect(slot.jellyScaleX).toBeLessThanOrEqual(1.32);
  expect(slot.jellyScaleY).toBeGreaterThanOrEqual(0.68);
  expect(slot.jellyScaleY).toBeLessThanOrEqual(1.32);
});

it('returns Jelly state to rest immediately when the showcase is disabled', () => {
  const pool = new DanmakuPool(1);
  const scheduler = new Scheduler(pool, 640, 360, 0);
  scheduler.showcaseJelly = true;
  scheduler.userSpawn({ ...createDefaultParams(), text: 'jelly', preset: 'scroll' });
  const slot = pool.slots.find((candidate) => candidate.active)!;
  scheduler.showcaseJelly = false;

  scheduler.tick(16, 'scroll', { cursorX: 0, cursorY: 0, pointerActive: false });
  expect(slot.jellyScaleX).toBe(1);
  expect(slot.jellyScaleY).toBe(1);
  expect(slot.jellyVelocity).toBe(0);
});
```

- [ ] **Step 2: Run the focused Scheduler tests and verify failure**

```bash
bun test test/Scheduler.test.ts
```

Expected: FAIL because `showcaseJelly` and `exciteJelly` do not exist.

- [ ] **Step 3: Add spring constants and the public excitation API**

Add module constants near the existing scheduler constants:

```ts
const JELLY_STIFFNESS = 180;
const JELLY_DAMPING = 18;
const JELLY_MAX_OFFSET = 0.32;
const JELLY_IMPULSE_SCALE = 12;
```

Add the state and public method to `Scheduler`:

```ts
showcaseJelly = false;

exciteJelly(slotId: number, impulse = 0.24): boolean {
  if (slotId < 0 || slotId >= this.pool.capacity) return false;
  const slot = this.pool.slots[slotId]!;
  if (!slot.active) return false;
  const bounded = Math.max(-1, Math.min(1, impulse));
  slot.jellyVelocity += bounded * JELLY_IMPULSE_SCALE;
  return true;
}
```

- [ ] **Step 4: Add the allocation-free integration helper**

Add a private method:

```ts
private _stepJelly(slot: PoolSlot, dt: number): void {
  if (!this.showcaseJelly) {
    slot.jellyScaleX = 1;
    slot.jellyScaleY = 1;
    slot.jellyVelocity = 0;
    return;
  }

  const seconds = dt / 1000;
  const offset = slot.jellyScaleY - 1;
  const acceleration = -JELLY_STIFFNESS * offset - JELLY_DAMPING * slot.jellyVelocity;
  slot.jellyVelocity += acceleration * seconds;
  const nextY = slot.jellyScaleY + slot.jellyVelocity * seconds;
  slot.jellyScaleY = Math.max(1 - JELLY_MAX_OFFSET, Math.min(1 + JELLY_MAX_OFFSET, nextY));
  slot.jellyScaleX = Math.max(
    1 - JELLY_MAX_OFFSET,
    Math.min(1 + JELLY_MAX_OFFSET, 2 - slot.jellyScaleY),
  );

  if (Math.abs(slot.jellyScaleY - 1) < 0.0005 && Math.abs(slot.jellyVelocity) < 0.0005) {
    slot.jellyScaleX = 1;
    slot.jellyScaleY = 1;
    slot.jellyVelocity = 0;
  }
}
```

Import `PoolSlot` as a type. Call `_stepJelly(slot, dt)` once in the active-slot loop after preset/physics updates and before culling.

- [ ] **Step 5: Excite newly spawned comments**

After `_occupyLane(...)` in both `userSpawn` and `_spawnOne`, add:

```ts
if (this.showcaseJelly) this.exciteJelly(slot.id, 0.24);
```

This makes the observable behavior independent of Bakudan.

- [ ] **Step 6: Format and run focused tests**

```bash
bun run format
bun test test/Scheduler.test.ts test/DanmakuPool.test.ts
```

Expected: both suites pass, with deterministic settle and clamp assertions.

- [ ] **Step 7: Commit scheduler behavior**

```bash
git add src/model/Scheduler.ts test/Scheduler.test.ts
git commit -m "feat: add Jelly spring scheduler"
```

### Task 3: Connect repulsion impulses without changing preset semantics

**Files:**

- Modify: `src/model/presets/repulsion.ts`
- Modify: `test/presets.test.ts`

- [ ] **Step 1: Add a failing repulsion impulse test**

Add a test that creates a slot with the pointer inside the repulsion radius, calls the preset, and observes a bounded positive Jelly impulse:

```ts
it('repulsion excites Jelly velocity near the pointer', () => {
  const slot = makeSlot('repulsion');
  slot.x = 100;
  slot.y = 100;
  slot.width = 80;
  slot.jellyVelocity = 0;

  PRESETS.repulsion(
    slot,
    16,
    { time: 0, cursorX: 140, cursorY: 118, pointerActive: true },
    640,
    360,
  );

  expect(slot.jellyVelocity).toBeGreaterThan(0);
  expect(slot.jellyVelocity).toBeLessThanOrEqual(4);
});
```

Use the existing `makeSlot` helper in `test/presets.test.ts`; extend it with the three Jelly defaults if the helper constructs slots literally.

- [ ] **Step 2: Run the preset test and verify failure**

```bash
bun test test/presets.test.ts
```

Expected: FAIL because repulsion does not update Jelly velocity.

- [ ] **Step 3: Apply an allocation-free bounded impulse**

Inside the existing `dist < REPULSE_RADIUS` branch in `repulsion.ts`, after calculating `force`, add:

```ts
const normalizedForce = force / REPULSE_STRENGTH;
slot.jellyVelocity = Math.min(4, slot.jellyVelocity + normalizedForce * seconds * 8);
```

This updates only numeric slot state. When Jelly is disabled, `Scheduler._stepJelly` resets the value in the same tick; repulsion motion itself is unchanged.

- [ ] **Step 4: Format and run preset plus scheduler tests**

```bash
bun run format
bun test test/presets.test.ts test/Scheduler.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit repulsion excitation**

```bash
git add src/model/presets/repulsion.ts test/presets.test.ts
git commit -m "feat: excite Jelly from repulsion"
```

### Task 4: Document and release the public API

**Files:**

- Modify: `README.md`
- Create: `.changeset/<generated-name>.md`

- [ ] **Step 1: Add the public usage example to README**

Document the stable API with this exact usage shape:

```ts
const pool = new DanmakuPool(20_000);
const scheduler = new Scheduler(pool, width, height, 5_000);
scheduler.showcaseJelly = true;

// Optional application impulse, for example after drag release.
scheduler.exciteJelly(slot.id, 0.45);
```

State that renderers read `jellyScaleX`/`jellyScaleY`, that the spring integration allocates nothing per frame, and that disabling the showcase resets all active slots to neutral.

- [ ] **Step 2: Add a minor changeset**

Create a changeset with:

```markdown
---
'@vectojs/danmaku-core': minor
---

Add reusable Jelly spring state, deterministic scheduler integration, and explicit impulse control for renderer-agnostic squash/stretch effects.
```

Use the filename emitted by `bun run changeset` or a unique lowercase hyphenated name.

- [ ] **Step 3: Run package gates**

```bash
bun run format
bun run format:check
bun run lint
bun test
bun run build
bun run lint:md
```

Expected: every command exits 0; no warning is accepted by oxlint.

- [ ] **Step 4: Commit documentation and changeset**

```bash
git add README.md .changeset
git commit -m "docs: describe Jelly spring API"
```

- [ ] **Step 5: Publish before enabling Bakudan Jelly**

Follow the repository's tag-triggered release process. Record the released version in CarryCtx. The Bakudan worktree must update `@vectojs/danmaku-core` to that exact released version and regenerate `bun.lock`; it must not use a file link or an unpublished node_modules edit.
