export type EmitterCallback<T> = (data: T) => void;

export interface Emitter<T = unknown> {
  (callback: (data: T) => void): () => void;
}

export interface Particle<T = unknown> {
  watch: Emitter<T>;
}
