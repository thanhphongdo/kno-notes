import type { NextConfig } from 'next';
import { buildIdFrom } from './src/lib/pwa/build-id';

/**
 * Đọc MỘT LẦN lúc build. Trên Vercel là SHA của commit đang deploy; ở nơi khác
 * là thời điểm build, để mỗi lần `next build` vẫn ra một id khác. Service
 * worker đăng ký kèm id này nên bản đã cài trên máy người dùng nhận được bản
 * deploy mới — xem `src/lib/pwa/build-id.ts`.
 */
const BUILD_ID = buildIdFrom(process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now()));

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
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
