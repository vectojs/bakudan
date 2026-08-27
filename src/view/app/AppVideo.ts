import { ReactionStore } from '../../model/ReactionStore';
import { generateLargeTimedTrack } from '../../model/demoTimedTrack';
import { ProfiledDanmakuTrack, TRACK_PROFILES } from '../../model/TrackProfiles';
import { VideoSourceError } from '@vectojs/danmaku-kit/model';
import type { VideoSelection } from '@vectojs/danmaku-kit/model';
import { resolveVideoSelection } from '../../model/VideoCatalog';
import { t } from '../../model/i18n';
import type { App } from '../App';

type VideoHost = {
  currentVideoSelection: VideoSelection;
  currentVideoId: string;
  currentTrackProfileId: string;
  videoLoadState: import('@vectojs/danmaku-kit/model').VideoLoadState;
  pendingVideoSelection: VideoSelection | null;
  pendingTrackProfileId: string | null;
  _localObjectUrls: string[];
  _videoRequestId: number;
  videoLoading: boolean;
  _videoBuffering: boolean;
  mode: import('./types').AppMode;
  danmakuTrack: ProfiledDanmakuTrack;
  bg: import('../StageBackground').StageBackground;
  scheduler: import('@vectojs/danmaku-core').Scheduler;
  announcer: import('../DanmakuAnnouncer').DanmakuAnnouncer;
  scene: import('@vectojs/core').Scene;
  destroyed: boolean;
  currentLang: import('../../model/i18n').Language;
  _reactionStore: ReactionStore | null;
  _stressTargetBeforeVideo: number;
  _profTargetCount: number | null;
  _clearSelection(): void;
  _setAppMode(mode: import('./types').AppMode): void;
  _syncVideosState(): void;
  _syncStatus(): void;
  _syncPlaybackState(): void;
  _syncThroughputState(): void;
  selectVideo(selection: VideoSelection, requestedProfileId?: string): void;
};

function hostOf(app: App): VideoHost {
  return app as unknown as VideoHost;
}

export function isLocalUploadUrl(host: App, url: string): boolean {
  const h = hostOf(host);
  return url.startsWith('blob:') && h._localObjectUrls.includes(url);
}

export function onLocalFilePicked(host: App, file: File): void {
  const url = URL.createObjectURL(file);
  const h = hostOf(host);
  h._localObjectUrls.push(url);
  h.selectVideo({ kind: 'custom', url });
}

export function pruneLocalObjectUrl(host: App, activeUrl: string | null): void {
  const h = hostOf(host);
  for (const url of h._localObjectUrls) {
    if (url !== activeUrl) URL.revokeObjectURL(url);
  }
  h._localObjectUrls = activeUrl ? [activeUrl] : [];
}

export function retryVideo(host: App): void {
  const h = hostOf(host);
  if (!h.pendingVideoSelection || !h.pendingTrackProfileId) return;
  loadVideoSelection(host, h.pendingVideoSelection, h.pendingTrackProfileId);
}

export function selectVideo(
  host: App,
  selection: VideoSelection,
  requestedProfileId?: string,
): void {
  const h = hostOf(host);
  const sameSource = sameVideoSelection(selection, h.currentVideoSelection);
  const profileId = requestedProfileId ?? resolveVideoSelection(selection).defaultTrackProfileId;
  if (sameSource && profileId === h.currentTrackProfileId) {
    if (h.mode !== 'video') {
      h._setAppMode('video');
      (h as unknown as { _togglePlayback(): void })._togglePlayback();
    }
    return;
  }
  if (sameSource) {
    onTrackProfileChange(host, profileId);
    return;
  }
  loadVideoSelection(host, selection, profileId);
}

export function loadVideoSelection(
  host: App,
  selection: VideoSelection,
  requestedProfileId?: string,
): void {
  const h = hostOf(host);
  const candidate = resolveVideoSelection(selection);
  const profileId = requestedProfileId ?? candidate.defaultTrackProfileId;
  const profile = TRACK_PROFILES.get(profileId);
  if (!profile) throw new Error(`Unknown track profile id: ${profileId}`);

  const requestId = ++h._videoRequestId;
  h.pendingVideoSelection = selection;
  h.pendingTrackProfileId = profileId;
  h.videoLoading = true;
  h.videoLoadState = { status: 'loading', candidateId: candidate.id };
  h._setAppMode('video');
  h._clearSelection();
  h._setAppMode('video');
  h._syncVideosState();
  h._syncStatus();
  h._syncPlaybackState();
  void h.bg
    .setVideo(candidate.source.url)
    .then(() => {
      if (requestId !== h._videoRequestId || h.destroyed) return;
      h.videoLoading = false;
      pruneLocalObjectUrl(host, selection.kind === 'custom' ? selection.url : null);
      h._reactionStore = new ReactionStore(candidate.id, {
        memoryOnly: isLocalUploadUrl(host, candidate.source.url),
      });
      h.currentVideoSelection = selection;
      h.currentVideoId = candidate.id;
      h.currentTrackProfileId = profile.id;
      const duration = h.bg.duration || candidate.durationHint;
      installVideoTrack(host, duration, candidate.id, profile.id);
      h.videoLoadState = { status: 'ready', sourceId: candidate.id };
      h.pendingVideoSelection = null;
      h.pendingTrackProfileId = null;
      h.bg.onEnded(() => {
        h._syncPlaybackState();
        h._syncStatus();
      });
      h._syncVideosState();
      h._syncPlaybackState();
      h._syncStatus();
      void h.bg
        .play()
        .then(() => {
          if (requestId !== h._videoRequestId || h.destroyed) return;
          h._syncPlaybackState();
          h._syncStatus();
        })
        .catch((error: unknown) => {
          const sourceError = asVideoSourceError(error);
          if (sourceError.code !== 'playback-rejected') announceVideoError(host, sourceError);
          h._syncPlaybackState();
          h._syncStatus();
        });
      h.scene.markDirty();
    })
    .catch((error: unknown) => {
      if (requestId !== h._videoRequestId || h.destroyed) return;
      const sourceError = asVideoSourceError(error);
      h.videoLoading = false;
      h.videoLoadState = {
        status: 'error',
        candidateId: candidate.id,
        error: sourceError,
      };
      announceVideoError(host, sourceError);
      h._syncVideosState();
      h._syncPlaybackState();
      h._syncStatus();
    });
}

export function onTrackProfileChange(host: App, profileId: string): void {
  const h = hostOf(host);
  const profile = TRACK_PROFILES.get(profileId);
  if (!profile || profileId === h.currentTrackProfileId) return;
  h.currentTrackProfileId = profileId;
  if (h.bg.isVideoReady) {
    h._clearSelection();
    const currentTime = h.bg.currentTime;
    installVideoTrack(host, h.bg.duration || 15, h.currentVideoId, profileId);
    h.danmakuTrack.seek(currentTime);
  }
  h._syncVideosState();
  h.scene.markDirty();
}

export function installVideoTrack(
  host: App,
  duration: number,
  videoId: string,
  profileId: string,
): void {
  const h = hostOf(host);
  const profile = TRACK_PROFILES.get(profileId);
  if (!profile) throw new Error(`Unknown track profile id: ${profileId}`);
  const profiledTrack = generateLargeTimedTrack(duration, profile, videoId);
  h.danmakuTrack = new ProfiledDanmakuTrack(profiledTrack.entries);
}

export function sameVideoSelection(a: VideoSelection, b: VideoSelection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'catalog' && b.kind === 'catalog') return a.id === b.id;
  return a.kind === 'custom' && b.kind === 'custom' && a.url === b.url;
}

export function asVideoSourceError(error: unknown): VideoSourceError {
  if (error instanceof VideoSourceError) return error;
  let code: VideoSourceError['code'] = 'media-error';
  let message = 'Video source failed';
  if (error && typeof error === 'object') {
    if ('code' in error) {
      const value = (error as { code: unknown }).code;
      if (
        value === 'network-error' ||
        value === 'metadata-error' ||
        value === 'playback-rejected' ||
        value === 'media-error'
      ) {
        code = value;
      }
    }
    if ('message' in error && typeof (error as { message: unknown }).message === 'string')
      message = (error as { message: string }).message;
  }
  return new VideoSourceError(code, message);
}

export function announceVideoError(host: App, error: VideoSourceError): void {
  const h = hostOf(host);
  const key =
    error.code === 'network-error'
      ? 'video.error.network'
      : error.code === 'metadata-error'
        ? 'video.error.metadata'
        : error.code === 'playback-rejected'
          ? 'video.error.playback'
          : 'video.error.media';
  h.announcer.setSummary(t(key, h.currentLang));
}

export function applyStressTarget(host: App, target: number): void {
  const h = hostOf(host);
  // Keep video playing when adjusting danmaku count: if already in video mode
  // with a ready video, treat target as overlay count on top of the video track
  // (danmaku is part of video). Don't switch to paused stress mode — that was
  // the freeze bug (CTX-0043). Stay in video, adjust scheduler, ensure play.
  if (h.mode === 'video') {
    h._stressTargetBeforeVideo = target;
    h._profTargetCount = target;
    h.scheduler.setTargetCount(target);
    h._syncThroughputState();
    if (h.bg.isVideoReady && h.bg.paused) {
      void h.bg.play().catch((error: unknown) => {
        const srcError = asVideoSourceError(error);
        if (srcError.code !== 'playback-rejected') announceVideoError(host, srcError);
      });
    }
    return;
  }
  h._setAppMode('stress');
  h._stressTargetBeforeVideo = target;
  h._profTargetCount = target;
  h.scheduler.setTargetCount(target);
  h._syncThroughputState();
}
