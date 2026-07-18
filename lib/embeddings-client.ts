'use client';

// Phase 4 — Client-side embedding generation.
// Loads the quantized all-MiniLM-L6-v2 ONNX model via transformers.js and
// turns raw query text into a 384-dim vector. The model is cached by
// transformers.js in the browser (IndexedDB via its own cache layer) so it's
// only downloaded once across visits.

import { pipeline, env, type FeatureExtractionPipeline } from '@xenova/transformers';

// Force browser cache usage and prevent node-only backends from loading
env.allowLocalModels = false;
env.useBrowserCache = true;
env.allowRemoteModels = true;

// Disable ONNX backend (requires native bindings) - use WASM instead
if (typeof window !== 'undefined') {
  env.backends.onnx = false;
}

let embedderPromise: Promise<FeatureExtractionPipeline> | null = null;

function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (!embedderPromise) {
    embedderPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,
    }) as Promise<FeatureExtractionPipeline>;
  }
  return embedderPromise;
}

/** Preload the model — call this on page mount so the first real search isn't slow. */
export function preloadEmbedder(): void {
  void getEmbedder();
}

/** Raw query text -> 384-dim normalized vector, as a plain number[]. */
export async function embedQuery(text: string): Promise<number[]> {
  const embedder = await getEmbedder();
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}
