import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    base: './', // Ensures assets are relative for GitHub Pages
    define: {
      // Robustly replace process.env.API_KEY with the string value
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY || ""),
      // Define process to prevent 'process is not defined' errors in some environments
      'process.env': {} 
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});