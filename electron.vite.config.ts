import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const aliases = {
  '@main': resolve(__dirname, 'src/main'),
  '@preload': resolve(__dirname, 'src/preload'),
  '@renderer': resolve(__dirname, 'src/renderer'),
  '@shared': resolve(__dirname, 'src/shared'),
  '@resources': resolve(__dirname, 'resources'),
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
    resolve: { alias: aliases },
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          'main-ui': resolve(__dirname, 'src/preload/main-ui.ts'),
          wallpaper: resolve(__dirname, 'src/preload/wallpaper.ts'),
          canvas: resolve(__dirname, 'src/preload/canvas.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
    resolve: { alias: aliases },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: 'src/renderer',
    server: {
      host: '0.0.0.0',
      port: 5174,
    },
    build: {
      rollupOptions: {
        input: {
          'main-ui': resolve(__dirname, 'src/renderer/main-ui/index.html'),
          wallpaper: resolve(__dirname, 'src/renderer/wallpaper/index.html'),
          canvas: resolve(__dirname, 'src/renderer/canvas/index.html'),
        },
      },
    },
    resolve: { alias: aliases },
    plugins: [tailwindcss(), react()],
  },
})
