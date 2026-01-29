/**
 * @file Server entry point.
 */
import https from 'https';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import selfsigned from 'selfsigned';
import { createApp } from './app.ts';
import { DEFAULT_SERVER_HOST, DEFAULT_SERVER_PORT } from '../core/constants.ts';

const CERT_DIR = path.join(process.cwd(), 'certs');
const KEY_PATH = path.join(CERT_DIR, 'server.key');
const CERT_PATH = path.join(CERT_DIR, 'server.cert');

async function ensureCertificates() {
  try {
    await Promise.all([fs.access(KEY_PATH), fs.access(CERT_PATH)]);
    console.log('SSL Certificates found.');
  } catch (e: unknown) {
    const error = e as { code?: string };
    if (error.code !== 'ENOENT') {
      console.error(
        'An unexpected error occurred while checking for SSL certificates:',
        error,
      );
      throw error;
    }

    console.log('Generating SSL Certificates...');
    await fs.mkdir(CERT_DIR, { recursive: true });

    const attrs = [{ name: 'commonName', value: 'localhost' }];
    // @ts-expect-error - The types might be slightly off or options vary by version, but days is standard.
    const pems = await selfsigned.generate(attrs, { days: 365 });

    await fs.writeFile(CERT_PATH, pems.cert);
    await fs.writeFile(KEY_PATH, pems.private);

    console.log('SSL Certificates generated successfully.');
  }
}

export async function bootstrap() {
  await ensureCertificates();

  const app = await createApp();
  const host = process.env.HOST || DEFAULT_SERVER_HOST;

  const credentials = {
    key: await fs.readFile(KEY_PATH),
    cert: await fs.readFile(CERT_PATH),
  };

  const server = https.createServer(credentials, app);
  server.setTimeout(30000);

  server.listen(DEFAULT_SERVER_PORT, host, () => {
    console.log(`Server running at https://${host}:${DEFAULT_SERVER_PORT}`);
    console.log(
      `Environment: ${process.env.NODE_ENV !== 'production' ? 'Development' : 'Production'}`,
    );
  });
}

const entryArg = process.argv[1];
const isEntryFile = entryArg
  ? path.resolve(entryArg) === fileURLToPath(import.meta.url)
  : false;

if (isEntryFile) {
  bootstrap();
}
