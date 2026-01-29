/**
 * @file Legacy server entry (re-exported).
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from './app.ts';
import { bootstrap } from './main.ts';

export { createApp, bootstrap };

const entryArg = process.argv[1];
const isEntryFile = entryArg
  ? path.resolve(entryArg) === fileURLToPath(import.meta.url)
  : false;

if (isEntryFile) {
  bootstrap();
}
