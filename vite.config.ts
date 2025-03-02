import { defineConfig } from 'vite'
import deno from '@deno/vite-plugin'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import uno from 'unocss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [deno(), vue(), vueDevTools(), uno()],
  server: {
    proxy: {
      '/ws': { target: 'http://0.0.0.0:8000', ws: true },
    },
  },
})
