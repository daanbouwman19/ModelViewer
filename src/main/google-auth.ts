import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import {
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleRedirectUri,
} from './google-secrets.ts';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

let oauth2Client: OAuth2Client | null = null;

function getTokenPath(): string {
  // 1. Check for explicit Environment Variable (Robust for Docker/Server)
  if (process.env.GOOGLE_TOKEN_PATH) {
    return process.env.GOOGLE_TOKEN_PATH;
  }

  let userDataPath: string;

  // In Electron, the userData path is often set via environment or we can detect it
  // For non-Electron environments, use platform-specific paths
  const appName = 'mediaplayer-app';

  // Check if we're in Electron by looking for ELECTRON_RUN_AS_NODE or other indicators
  // If app.getPath was already called, it might be in process.env or we use platform defaults
  if (process.versions['electron'] && process.env.ELECTRON_USER_DATA) {
    // If Electron set this env var (custom setup), use it
    userDataPath = process.env.ELECTRON_USER_DATA;
  } else if (process.versions['electron']) {
    // Electron environment but no env var - use platform-specific default that matches Electron's behavior
    // Electron uses platform-specific paths, so we replicate that logic
    switch (process.platform) {
      case 'win32':
        userDataPath = path.join(
          process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
          appName,
        );
        break;
      case 'darwin':
        userDataPath = path.join(
          os.homedir(),
          'Library',
          'Application Support',
          appName,
        );
        break;
      default:
        // Linux
        userDataPath = path.join(os.homedir(), '.config', appName);
        break;
    }
  } else {
    // Non-Electron environment (e.g., web server)
    switch (process.platform) {
      case 'win32':
        userDataPath = path.join(
          process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
          appName,
        );
        break;
      case 'darwin':
        userDataPath = path.join(
          os.homedir(),
          'Library',
          'Application Support',
          appName,
        );
        break;
      default:
        // Linux and others
        userDataPath = path.join(os.homedir(), '.config', appName);
        break;
    }
  }

  return path.join(userDataPath, 'google-token.json');
}

export function getOAuth2Client(): OAuth2Client {
  if (!oauth2Client) {
    const clientId = getGoogleClientId();
    const clientSecret = getGoogleClientSecret();
    const redirectUri = getGoogleRedirectUri();

    if (!clientId || !clientSecret) {
      throw new Error(
        'Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file.',
      );
    }
    oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }
  return oauth2Client;
}

export async function loadSavedCredentialsIfExist(): Promise<boolean> {
  try {
    const content = await fs.readFile(getTokenPath(), 'utf-8');
    const credentials = JSON.parse(content);
    const client = getOAuth2Client();
    client.setCredentials(credentials);
    return true;
  } catch {
    return false;
  }
}

export async function saveCredentials(client: OAuth2Client): Promise<void> {
  const tokenPath = getTokenPath();
  const tokenDir = path.dirname(tokenPath);

  try {
    await fs.mkdir(tokenDir, { recursive: true });
  } catch (error) {
    // Ignore error if directory already exists or can't be created (writeFile will fail then)
    // But usually recursive: true handles existing dirs fine.
    console.warn(`Failed to ensure directory exists: ${tokenDir}`, error);
  }

  // We actually just need to save client.credentials
  try {
    await fs.writeFile(tokenPath, JSON.stringify(client.credentials));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      console.error(
        '\n\x1b[31m%s\x1b[0m',
        '###########################################################',
      );
      console.error(
        '\x1b[31m%s\x1b[0m',
        '# PERMISSION DENIED WRITING GOOGLE TOKEN',
      );
      console.error('\x1b[31m%s\x1b[0m', '#');
      console.error(
        '\x1b[31m%s\x1b[0m',
        `# The container user (UID ${process.getuid?.() || 'unknown'}) cannot write to:`,
      );
      console.error('\x1b[31m%s\x1b[0m', `# ${tokenPath}`);
      console.error('\x1b[31m%s\x1b[0m', '#');
      console.error('\x1b[31m%s\x1b[0m', '# SOLUTION:');
      console.error('\x1b[31m%s\x1b[0m', '# Run this on your host machine:');
      console.error('\x1b[31m%s\x1b[0m', '# sudo chown 1001:1001 ./config');
      console.error(
        '\x1b[31m%s\x1b[0m',
        '###########################################################\n',
      );
    }
    throw error;
  }
}

export function generateAuthUrl(): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function authenticateWithCode(code: string): Promise<void> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  await saveCredentials(client);
}
