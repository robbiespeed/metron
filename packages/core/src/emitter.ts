export type EmitterCallback<TEmitData> = (data: TEmitData) => void;

export interface Emitter<TEmitData = unknown> {
  (callback: (data: TEmitData) => void): () => void;
}
