import { preview } from 'vite';

await preview({
  preview: {
    host: '127.0.0.1',
    port: Number(process.env.PORT || 50111),
    strictPort: true,
  },
});
