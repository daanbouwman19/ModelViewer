import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import {
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleRedirectUri,
} from './google-secrets';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

let oauth2Client: OAuth2Client | null = null;

function getTokenPath(): string {
  let userDataPath: string;
  try {
    if (process.versions['electron']) {
      userDataPath = path.join(os.homedir(), '.config', 'mediaplayer-app');
    } else {
      // Match Electron's default userData path on Linux for "mediaplayer-app"
      // Ideally we should check platform (darwin -> Library/Application Support, win32 -> AppData/Roaming)
      // But user is on Linux.
      // Let's iterate or pick the one that exists or default to .config/mediaplayer-app
      userDataPath = path.join(os.homedir(), '.config', 'mediaplayer-app');
    }
  } catch {
    userDataPath = path.join(process.cwd(), '.media-player');
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
  // We actually just need to save client.credentials
  await fs.writeFile(tokenPath, JSON.stringify(client.credentials));
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
