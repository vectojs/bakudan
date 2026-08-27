// @ts-nocheck
import { BAKUDAN_THEME } from '../../cinemaConfig';
import type { VideoLoadState, VideoSelection } from '@vectojs/danmaku-kit/model';
import type { VideoCatalogEntry } from '../../../model/VideoCatalog';

export interface VideoCatalogRow extends VideoCatalogEntry {
  metadata: readonly { label: string; value: string }[];
  attribution: string;
}

export interface VideoProfileRow {
  id: string;
  label: string;
  description: string;
}

export interface VideosPanelState {
  source: VideoSelection;
  profileId: string;
  loadState: VideoLoadState;
}

export interface VideosPanelOptions {
  catalog: VideoCatalogRow[];
  profiles: VideoProfileRow[];
  state: VideosPanelState;
  labels?: {
    videos?: string;
    profiles?: string;
    profileDetails?: string;
    metadata?: string;
    attribution?: string;
    customUrl?: string;
    customSource?: string;
    choose?: string;
    retry?: string;
    uploadFile?: string;
    loadState?: string;
    formatLoadState?: (s: VideoLoadState) => string;
    formatLoadError?: (e: unknown, id?: string) => string;
    formatMetadata?: (rows: readonly { label: string; value: string }[]) => string;
    formatAttribution?: (s: string) => string;
  };
  onChoose: (selection: { source: VideoSelection; profileId: string }) => void;
  onUploadFile: (file: File) => void;
  onRetry: () => void;
  onCustomUrlChange?: (url: string) => void;
}

/**
 * Vanilla HTML Videos panel — lists VideoCatalog rows as CSS Grid cards,
 * profile <select>, custom URL input + error, and local file upload.
 */
export class VideosPanelHTML {
  readonly element: HTMLElement;
  private readonly opts: VideosPanelOptions;
  private state: VideosPanelState;
  private pendingSource: VideoSelection;
  private pendingProfileId: string;

  private readonly gridEl: HTMLElement;
  private readonly profileSelect: HTMLSelectElement;
  private readonly profileDetailsEl: HTMLElement;
  private readonly metadataEl: HTMLElement;
  private readonly attributionEl: HTMLElement;
  private readonly loadStateEl: HTMLElement;
  private readonly errorEl: HTMLElement;
  private readonly customInput: HTMLInputElement;
  private readonly chooseButton: HTMLButtonElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly fileInput: HTMLInputElement;
  private readonly uploadButton: HTMLButtonElement;

  constructor(opts: VideosPanelOptions) {
    this.opts = opts;
    this.state = opts.state;
    this.pendingSource = opts.state.source;
    this.pendingProfileId = opts.state.profileId;

    const root = document.createElement('div');
    root.className = 'bakudan-videos';
    root.style.setProperty('--bakudan-surface', BAKUDAN_THEME.surface);
    root.style.setProperty('--bakudan-surface-raised', BAKUDAN_THEME.surfaceRaised);
    root.style.setProperty('--bakudan-border', BAKUDAN_THEME.border);
    root.style.setProperty('--bakudan-text', BAKUDAN_THEME.text);
    root.style.setProperty('--bakudan-text-muted', BAKUDAN_THEME.textMuted);
    root.style.setProperty('--bakudan-accent', BAKUDAN_THEME.accent);
    root.style.setProperty('--bakudan-accent-hover', BAKUDAN_THEME.accentHover);
    root.style.setProperty('--bakudan-danger', BAKUDAN_THEME.danger);
    root.style.setProperty('--bakudan-focus-ring', BAKUDAN_THEME.focusRing);
    root.style.setProperty('--bakudan-font-ui', BAKUDAN_THEME.fontUi);
    root.style.setProperty('--bakudan-font-mono', BAKUDAN_THEME.fontMono);
    root.style.setProperty('--bakudan-font-label', BAKUDAN_THEME.fontLabel);

    // Video source grid
    const videosSection = document.createElement('div');
    videosSection.className = 'bakudan-lab__section';
    const videosHeading = document.createElement('h3');
    videosHeading.textContent = opts.labels?.videos ?? 'Video source';
    videosSection.append(videosHeading);

    this.gridEl = document.createElement('div');
    this.gridEl.className = 'bakudan-videos__grid';
    this.gridEl.setAttribute('role', 'list');
    videosSection.append(this.gridEl);
    root.append(videosSection);

    // Build cards
    for (let i = 0; i < opts.catalog.length; i++) {
      const row = opts.catalog[i]!;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'bakudan-videos__card';
      card.setAttribute('role', 'listitem');
      card.dataset.videoId = row.id;
      card.setAttribute('aria-label', `Choose video ${row.title}`);
      card.setAttribute('aria-pressed', 'false');
      const title = document.createElement('p');
      title.className = 'bakudan-videos__card-title';
      title.textContent = row.title;
      const meta = document.createElement('p');
      meta.className = 'bakudan-videos__card-meta';
      const fmtMeta = opts.labels?.formatMetadata
        ? opts.labels.formatMetadata(row.metadata)
        : row.metadata.map((m) => `${m.label}: ${m.value}`).join(' · ');
      meta.textContent = fmtMeta;
      const attr = document.createElement('p');
      attr.className = 'bakudan-videos__card-attribution';
      const fmtAttr = opts.labels?.formatAttribution
        ? opts.labels.formatAttribution(row.attribution)
        : row.attribution || 'No attribution required';
      attr.textContent = fmtAttr;
      card.append(title, meta, attr);
      card.addEventListener('click', () => {
        this.pendingSource = { kind: 'catalog', id: row.id };
        this.updateSelectionUI();
      });
      this.gridEl.append(card);
    }

    // Profiles
    const profilesSection = document.createElement('div');
    profilesSection.className = 'bakudan-lab__section';
    const profilesHeading = document.createElement('h3');
    profilesHeading.textContent = opts.labels?.profiles ?? 'Track profile';
    profilesSection.append(profilesHeading);

    this.profileSelect = document.createElement('select');
    this.profileSelect.className = 'bakudan-lab__select';
    this.profileSelect.setAttribute('aria-label', 'Track profile');
    for (const p of opts.profiles) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label;
      this.profileSelect.append(opt);
    }
    this.profileSelect.value = this.pendingProfileId;
    this.profileSelect.addEventListener('change', () => {
      this.pendingProfileId = this.profileSelect.value;
      const prof = opts.profiles.find((pr) => pr.id === this.pendingProfileId);
      this.profileDetailsEl.textContent = prof?.description ?? '';
    });
    profilesSection.append(this.profileSelect);

    this.profileDetailsEl = document.createElement('p');
    this.profileDetailsEl.className = 'bakudan-videos__profile-details';
    this.profileDetailsEl.style.fontSize = '11px';
    this.profileDetailsEl.style.color = 'var(--bakudan-text-muted)';
    const initProf = opts.profiles.find((pr) => pr.id === this.pendingProfileId);
    this.profileDetailsEl.textContent = initProf?.description ?? '';
    profilesSection.append(this.profileDetailsEl);
    root.append(profilesSection);

    // Metadata / attribution display (mirrors kit's metadata rows)
    const metaSection = document.createElement('div');
    metaSection.className = 'bakudan-lab__section';
    const metaHeading = document.createElement('h4');
    metaHeading.textContent = opts.labels?.metadata ?? 'Metadata';
    metaSection.append(metaHeading);
    this.metadataEl = document.createElement('p');
    this.metadataEl.className = 'bakudan-lab__meta-text';
    metaSection.append(this.metadataEl);
    const attrHeading = document.createElement('h4');
    attrHeading.textContent = opts.labels?.attribution ?? 'Attribution';
    metaSection.append(attrHeading);
    this.attributionEl = document.createElement('p');
    this.attributionEl.className = 'bakudan-lab__attr-text';
    metaSection.append(this.attributionEl);
    root.append(metaSection);

    // Custom URL
    const customSection = document.createElement('div');
    customSection.className = 'bakudan-lab__section';
    const customHeading = document.createElement('h3');
    customHeading.textContent = opts.labels?.customUrl ?? 'Custom video URL';
    customSection.append(customHeading);
    this.customInput = document.createElement('input');
    this.customInput.type = 'url';
    this.customInput.className = 'bakudan-lab__input';
    this.customInput.placeholder = 'https://example.com/video.mp4';
    this.customInput.setAttribute('aria-label', 'Custom video URL');
    this.customInput.value = opts.state.source.kind === 'custom' ? opts.state.source.url : '';
    this.customInput.addEventListener('input', () => {
      const url = this.customInput.value.trim();
      this.pendingSource = url
        ? { kind: 'custom', url }
        : { kind: 'custom', url: this.customInput.value };
      this.opts.onCustomUrlChange?.(this.customInput.value);
      this.updateSelectionUI();
      this.updateChooseDisabled();
    });
    customSection.append(this.customInput);

    this.errorEl = document.createElement('div');
    this.errorEl.className = 'bakudan-lab__error';
    this.errorEl.setAttribute('role', 'alert');
    this.errorEl.setAttribute('aria-live', 'polite');
    customSection.append(this.errorEl);
    root.append(customSection);

    // Upload local file — hidden input + visible button
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'video/*';
    this.fileInput.className = 'bakudan-lab__file-input';
    this.fileInput.style.display = 'none';
    this.fileInput.setAttribute('aria-label', 'Upload local file');
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) this.opts.onUploadFile(file);
    });
    this.uploadButton = document.createElement('button');
    this.uploadButton.type = 'button';
    this.uploadButton.className = 'bakudan-lab__button';
    this.uploadButton.textContent = opts.labels?.uploadFile ?? 'Upload local file';
    this.uploadButton.setAttribute('aria-label', 'Upload local file');
    this.uploadButton.addEventListener('click', () => this.fileInput.click());
    const uploadSection = document.createElement('div');
    uploadSection.className = 'bakudan-lab__section';
    uploadSection.append(this.fileInput, this.uploadButton);
    root.append(uploadSection);

    // Load state + actions
    const actionsSection = document.createElement('div');
    actionsSection.className = 'bakudan-lab__section';
    const loadHeading = document.createElement('h4');
    loadHeading.textContent = opts.labels?.loadState ?? 'Source status';
    actionsSection.append(loadHeading);
    this.loadStateEl = document.createElement('p');
    this.loadStateEl.className = 'bakudan-lab__load-state';
    this.loadStateEl.setAttribute('aria-live', 'polite');
    actionsSection.append(this.loadStateEl);

    const controls = document.createElement('div');
    controls.className = 'bakudan-videos__controls';
    this.chooseButton = document.createElement('button');
    this.chooseButton.type = 'button';
    this.chooseButton.className = 'bakudan-lab__button bakudan-lab__button--primary';
    this.chooseButton.textContent = opts.labels?.choose ?? 'Choose video';
    this.chooseButton.addEventListener('click', () => {
      this.opts.onChoose({
        source: this.pendingSource,
        profileId: this.pendingProfileId,
      });
    });
    this.retryButton = document.createElement('button');
    this.retryButton.type = 'button';
    this.retryButton.className = 'bakudan-lab__button';
    this.retryButton.textContent = opts.labels?.retry ?? 'Retry source';
    this.retryButton.addEventListener('click', () => this.opts.onRetry());
    controls.append(this.chooseButton, this.retryButton);
    actionsSection.append(controls);
    root.append(actionsSection);

    this.element = root;
    this.syncState(opts.state);
  }

  private updateSelectionUI(): void {
    const cards = this.gridEl.querySelectorAll<HTMLButtonElement>('.bakudan-videos__card');
    for (const card of cards) {
      const isSelected =
        this.pendingSource.kind === 'catalog' && card.dataset.videoId === this.pendingSource.id;
      card.classList.toggle('bakudan-videos__card--selected', isSelected);
      card.setAttribute('aria-pressed', String(isSelected));
    }
    // Update metadata/attribution for selected catalog entry
    if (this.pendingSource.kind === 'catalog') {
      const row = this.opts.catalog.find((r) => r.id === this.pendingSource.id);
      if (row) {
        const fmtMeta = this.opts.labels?.formatMetadata
          ? this.opts.labels.formatMetadata(row.metadata)
          : row.metadata.map((m) => `${m.label}: ${m.value}`).join(' · ');
        this.metadataEl.textContent = fmtMeta;
        const fmtAttr = this.opts.labels?.formatAttribution
          ? this.opts.labels.formatAttribution(row.attribution)
          : row.attribution || 'No attribution required';
        this.attributionEl.textContent = fmtAttr;
      }
    } else {
      this.metadataEl.textContent = '';
      this.attributionEl.textContent = '';
    }
    // Keep profile details in sync if profile hasn't changed
    this.profileSelect.value = this.pendingProfileId;
    this.updateChooseDisabled();
  }

  private updateChooseDisabled(): void {
    if (this.pendingSource.kind === 'custom') {
      const url = (this.pendingSource as { url: string }).url.trim();
      this.chooseButton.disabled = url.length === 0;
    } else {
      this.chooseButton.disabled = false;
    }
  }

  private syncState(state: VideosPanelState): void {
    this.state = state;
    this.pendingSource = state.source;
    this.pendingProfileId = state.profileId;
    this.profileSelect.value = state.profileId;
    const prof = this.opts.profiles.find((p) => p.id === state.profileId);
    this.profileDetailsEl.textContent = prof?.description ?? '';
    this.customInput.value = state.source.kind === 'custom' ? state.source.url : '';
    this.updateSelectionUI();

    // Format load state
    const fmtState = this.opts.labels?.formatLoadState
      ? this.opts.labels.formatLoadState(state.loadState)
      : state.loadState.status === 'loading'
        ? `Loading ${state.loadState.candidateId}`
        : state.loadState.status === 'ready'
          ? `Ready · ${state.loadState.sourceId}`
          : 'Choose a source';
    this.loadStateEl.textContent = fmtState;

    if (state.loadState.status === 'error') {
      const msg = this.opts.labels?.formatLoadError
        ? this.opts.labels.formatLoadError(state.loadState.error, state.loadState.candidateId)
        : state.loadState.error instanceof Error
          ? state.loadState.error.message
          : String(state.loadState.error);
      this.errorEl.textContent = msg;
      this.retryButton.disabled = false;
    } else {
      this.errorEl.textContent = '';
      this.retryButton.disabled = state.loadState.status !== 'error';
    }
    this.updateChooseDisabled();
  }

  setState(state: VideosPanelState): void {
    this.syncState(state);
  }

  destroy(): void {
    this.element.remove();
  }
}
