export type EmitterCallback <T> = (data: T) => void;

export interface Emitter <T = unknown> {
  (callback: (data: T) => void): () => void;
}

export interface Particle <T = unknown> {
  watch: Emitter<T>;
}

export interface ValueParticle <V, D = unknown> extends Particle <D> {
  readonly value: V;
}
