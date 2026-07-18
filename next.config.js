/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // transformers.js / onnxruntime-web ship node-only bits that webpack
    // tries to resolve even in the browser bundle. Stub them out.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };

    // @xenova/transformers conditionally requires onnxruntime-node (a native
    // .node binary) for its Node backend. Webpack statically bundles that
    // require even though our usage is browser-only (embeddings-client.ts is
    // 'use client'), and fails trying to parse the binary as JS. Aliasing it
    // to false drops that branch from the bundle entirely, forcing
    // onnxruntime-web (pure WASM) to be used instead — which is what we want
    // in the browser anyway. Same fix transformers.js documents for its own
    // Next.js example.
    config.resolve.alias = {
      ...config.resolve.alias,
      'onnxruntime-node$': false,
      sharp$: false,
    };

    return config;
  },
};

module.exports = nextConfig;
