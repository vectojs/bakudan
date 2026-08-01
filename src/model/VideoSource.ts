export type VideoSourceKind = 'cdn' | 'external';

export interface VideoSource {
  kind: VideoSourceKind;
  url: string;
}

export type VideoSelection = { kind: 'catalog'; id: string } | { kind: 'custom'; url: string };
