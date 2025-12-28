import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import {
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleRedirectUri,
} from './google-secrets.ts';
import { getSetting, saveSetting } from './database.ts';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const GOOGLE_TOKENS_KEY = 'google_tokens';

let oauth2Client: OAuth2Client | null = null;

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
    const content = await getSetting(GOOGLE_TOKENS_KEY);
    if (!content) {
      return false;
    }
    const credentials = JSON.parse(content);
    const client = getOAuth2Client();
    client.setCredentials(credentials);
    return true;
  } catch (error) {
    console.error('Failed to load credentials from DB:', error);
    return false;
  }
}

export async function saveCredentials(client: OAuth2Client): Promise<void> {
  try {
    await saveSetting(GOOGLE_TOKENS_KEY, JSON.stringify(client.credentials));
  } catch (error: unknown) {
    console.error('Failed to save credentials to DB:', error);
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
