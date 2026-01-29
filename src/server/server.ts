/**
 * @file Legacy server entry (re-exported).
 */
import { fileURLToPath } from 'url';
import { createApp } from './app.ts';
import { bootstrap } from './main.ts';

export { createApp, bootstrap };

const isEntryFile =
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1].endsWith('server.ts');

if (isEntryFile) {
  bootstrap();
}
