import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/frontend'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/.test(id)) {
            return 'react'
          }
          if (/[\\/]node_modules[\\/](@radix-ui)[\\/]/.test(id)) {
            return 'radix'
          }
          if (/[\\/]node_modules[\\/](react-markdown|remark-gfm|prism-react-renderer)[\\/]/.test(id)) {
            return 'markdown'
          }
          if (/[\\/]node_modules[\\/](lucide-react)[\\/]/.test(id)) {
            return 'icons'
          }
          return 'vendor'
        },
      },
    },
  },
})
