import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } from './google-secrets';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

let oauth2Client: OAuth2Client | null = null;

function getTokenPath(): string {
  // In some test environments, app might not be fully initialized or we might be running in a context
  // where we should mock this. But for safety, we access app.getPath inside functions.
  // If app is undefined (shouldn't be in main process), it will throw.
  return path.join(app.getPath('userData'), 'google-token.json');
}

export function getOAuth2Client(): OAuth2Client {
  if (!oauth2Client) {
    oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );
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
  } catch (err) {
    return false;
  }
}

export async function saveCredentials(client: OAuth2Client): Promise<void> {
  const tokenPath = getTokenPath();
  const content = await fs.readFile(tokenPath, 'utf-8').catch(() => null);
  const keys = JSON.parse(content || '{}');
  // const key = keys.installed || keys.web;
  // We actually just need to save client.credentials
  await fs.writeFile(tokenPath, JSON.stringify(client.credentials));
}

export function generateAuthUrl(): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
}

export async function authenticateWithCode(code: string): Promise<void> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  await saveCredentials(client);
}
