import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Parallel e2e slots build into their own directory so two concurrent
  // `next build` runs cannot clobber each other's output.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
  // transformers.js ships optional node-only backends that must not be bundled
  // into the browser/worker build. The worker loads the WASM backend only.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = { ...config.resolve.alias, 'onnxruntime-node': false };
    }
    // linkedom lazily requires `canvas`, which is a native module we do not
    // need and cannot resolve. Stub it on both builds to keep output clean.
    config.resolve = config.resolve ?? {};
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
