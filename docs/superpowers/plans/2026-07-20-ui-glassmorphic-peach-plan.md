# Implementation Plan: Translucent Glassmorphic Peach UI Redesign

**Status**: Planning (Pending User Review)
**Topic**: UI Visual Redesign (Option B)

---

## 1. Objectives

Re-architect and style all UI components in `bakudan` to use a modern **Translucent Glassmorphic Peach** theme, resolving all contrast issues, clashing dropdown/focus colors, and aligning all elements to a premium visual style.

---

## 2. Proposed Changes

### 2.1 Component: Dropdown & Focus Patch (View)

#### [NEW] `src/view/DropdownPatch.ts`

- Implement a global monkeypatch function `patchDropdown()` to override `@vectojs/ui` behavior at runtime:
  - Override `Dropdown.prototype.openMenu` to draw option list cards with a frosted white background `rgba(255, 255, 255, 0.98)` and peach stroke `rgba(255, 126, 95, 0.25)`. Options use dark charcoal text `#453c38` and a light transparent peach background when selected `rgba(255, 126, 95, 0.25)`.
  - Override `Dropdown.prototype.updateMenuHighlight` to highlight items with peach hues: `rgba(255, 126, 95, 0.4)` (hover) and `rgba(255, 126, 95, 0.25)` (selected).
  - Override `Button.prototype.render` to draw a peach-colored focus border `#ff7e5f` instead of the hardcoded cyan `#00f0ff`.

### 2.2 Component: Core View Components (View)

#### [MODIFY] `src/view/HUD.ts`

- Change panel backdrop to `rgba(255, 255, 255, 0.85)` with a thin peach border `rgba(255, 126, 95, 0.2)`.
- Update text label colors to deep charcoal `#453c38`.
- Change dynamic status/metric colors from standard blue/green to peach-themed values (e.g. `#ff7e5f`).

#### [MODIFY] `src/view/Dock.ts`

- Set container background to `rgba(255, 255, 255, 0.85)` with a thin peach border `rgba(255, 126, 95, 0.2)`.
- Update text input field: background `rgba(250, 248, 246, 0.8)`, border `rgba(255, 126, 95, 0.15)`, and dark charcoal text.
- Send button: Solid `#ff7e5f` background with white text.
- Menu button "☰": Light peach background `rgba(255, 126, 95, 0.1)` with `#ff7e5f` text.

#### [MODIFY] `src/view/PlayerControls.ts`

- Use translucent backdrop `rgba(255, 255, 255, 0.85)` and border `rgba(255, 126, 95, 0.2)`.
- Timeline Density Curve: Render a real vertical linear gradient from `rgba(255, 126, 95, 0.45)` down to transparent `rgba(255, 126, 95, 0.0)`.
- Play/pause & rate buttons: Set background to light transparent peach `rgba(255, 126, 95, 0.1)` with `#ff7e5f` text.
- Progress Slider: Pass `trackColor: 'rgba(69, 60, 56, 0.15)'`, `progressColor: '#ff7e5f'`, and `handleColor: '#ffffff'`.

#### [MODIFY] `src/view/ControlCenter.ts`

- Set panel background to `rgba(255, 255, 255, 0.85)` with a thin peach border `rgba(255, 126, 95, 0.15)`.
- Cards: Background fill set to `rgba(250, 248, 246, 0.65)` with stroke `rgba(255, 126, 95, 0.2)`. Card header title color set to `#ff7e5f`.
- Dropdown buttons: Pass `bg: 'rgba(255, 255, 255, 0.95)'`, `color: '#453c38'`, and dynamically set `button.hoverBg = 'rgba(255, 126, 95, 0.1)'`.
- Checkboxes: Pass `color: '#453c38'`, `accent: '#ff7e5f'`, and `border: 'rgba(255, 126, 95, 0.3)'`.
- Sliders: Pass `trackColor: 'rgba(69, 60, 56, 0.15)'` and `progressColor: '#ff7e5f'`.

#### [MODIFY] `src/view/StageBackground.ts`

- Adjust background gradient stops to introduce soft peach/apricot tones (stop 0: `#faf8f6`, stop 0.5: soft peach HSL, stop 1: `#fdf6f0`).

#### [MODIFY] `src/view/ParticleSystem.ts`

- Update particle colors to a vibrant peach palette: `#ff7e5f` (primary), `#feb47b` (secondary), `#ff9a9e` (pink-peach), `#fecfef` (rose-pink), and `#ffffff`.

#### [MODIFY] `src/main.ts`

- Import and execute `patchDropdown()` at the very beginning of `main()` startup.

---

## 3. Verification Plan

- Run `bun run lint` & `bun run build`.
- Run `bun test` to verify all tests pass.
- Start local dev server, run agent-browser to capture screenshots, and visually inspect card backgrounds, checkbox labels, and dropdown dropdown lists.
