import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS=1 npm run dev  -> habilita https local (necessário para a câmera nos celulares da rede)
export default defineConfig({
  plugins: [react(), tailwindcss(), ...(process.env.HTTPS ? [basicSsl()] : [])],
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
