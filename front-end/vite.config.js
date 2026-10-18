import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.js'],
    include: ['src/**/*.vitest.{js,jsx}'],
    css: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    // Perspective's inline ESM bundles embed their WASM payloads and are
    // loaded lazily by the analytics workspace. Serving them directly avoids
    // stale hashed optimizer URLs when Vite's dev dependency cache changes.
    exclude: [
      '@perspective-dev/client',
      '@perspective-dev/viewer',
      '@perspective-dev/viewer-charts',
      '@perspective-dev/viewer-datagrid',
    ],
    include: [
      // React-Flow (existing)
      '@xyflow/react',
      // CodeMirror 6 — all packages must share one pre-bundled instance.
      // Without explicit inclusion, @uiw/react-codemirror (CJS) inlines its
      // ESM deps while direct imports resolve them separately, breaking the
      // module identity checks inside CodeMirror's facet system.
      '@uiw/react-codemirror',
      '@codemirror/view',
      '@codemirror/state',
      '@codemirror/language',
      '@codemirror/lang-sql',
      '@codemirror/commands',
      '@lezer/highlight',
    ],
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // ── CodeMirror / Lezer (SQL editor + inline code blocks) ──────────
          if (
            id.includes('@uiw/react-codemirror') ||
            id.includes('@codemirror') ||
            id.includes('@lezer')
          ) {
            return 'vendor-codemirror';
          }
          // ── React-Flow + Dagre (diagram-flow artifact) ────────────────────
          if (id.includes('@xyflow') || id.includes('dagre') || id.includes('@dagrejs')) {
            return 'vendor-react-flow';
          }
          // Markdown and Shiki intentionally use Rollup's natural dynamic
          // chunks. Forcing them into manual chunks made Vite preload them from
          // the entry page even though chat and code rendering are lazy.
          // ── Perspective (data-visualization artifact) ─────────────────────
          // Perspective is by far the heaviest dependency (~10MB unminified).
          // It is lazy-loaded via dynamic import inside PerspectiveDashboard;
          // isolating it here ensures no other chunk accidentally pulls it in.
          if (id.includes('@perspective-dev')) {
            return 'vendor-perspective';
          }
          // ── Framer Motion + MUI + Emotion ────────────────────────────────
          // These three are bundled together to avoid a circular-chunk
          // warning: framer-motion v12 internally imports from @emotion
          // (which would otherwise land in vendor-mui), while some MUI
          // components import framer-motion. Putting them in the same chunk
          // breaks the cycle and keeps the download sequential.
          if (
            id.includes('framer-motion') ||
            id.includes('motion-dom') ||
            id.includes('motion-utils') ||
            id.includes('@mui') ||
            id.includes('@emotion')
          ) {
            return 'vendor-mui';
          }
          // ── Firebase ──────────────────────────────────────────────────────
          if (id.includes('firebase') || id.includes('@firebase')) {
            return 'vendor-firebase';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: true, // Expose on all network interfaces (0.0.0.0)
    proxy: {
      // SSE streaming endpoints require the full object form so that:
      //   1. changeOrigin rewrites the Host header correctly.
      //   2. The proxy does NOT negotiate gzip compression with the backend
      //      (string shorthand leaves Accept-Encoding untouched, which lets
      //      http-proxy buffer a compressed SSE stream before forwarding it).
      // Auth endpoints (no prefix - auth_controller has no url_prefix)
      '/firebase-config-and-csrf-token': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/set_authenticated_user_session': { target: 'http://localhost:5000', changeOrigin: true },
      '/check_authenticated_user_session': { target: 'http://localhost:5000', changeOrigin: true },
      '/logout_authenticated_user_session': { target: 'http://localhost:5000', changeOrigin: true },
      // All api routes use /api prefix
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
});
