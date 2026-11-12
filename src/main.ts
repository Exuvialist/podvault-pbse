import { boot } from './app.js';

void boot().catch((err: unknown) => {
  const app = document.getElementById('app');
  if (app) {
    app.textContent = `PodVault gagal dimuat: ${err instanceof Error ? err.message : String(err)}`;
  }
});
