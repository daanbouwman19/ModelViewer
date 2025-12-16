import { google, drive_v3 } from 'googleapis';
import { getOAuth2Client, loadSavedCredentialsIfExist } from './google-auth';
import { Readable } from 'stream';
import { MediaFile, Album } from '../core/types';

let driveClient: drive_v3.Drive | null = null;

export async function getDriveClient(): Promise<drive_v3.Drive> {
  if (driveClient) return driveClient;

  const auth = getOAuth2Client();
  // Ensure credentials are loaded
  if (!auth.credentials || !auth.credentials.refresh_token) {
     const loaded = await loadSavedCredentialsIfExist();
     if (!loaded) {
       throw new Error('User not authenticated with Google Drive');
     }
  }

  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
}

/**
 * Lists files in a specific Google Drive folder.
 * Currently implements a flat list mapped to an Album structure for simplicity in the MVP.
 * For recursive structures, we might need a more complex traversal.
 */
export async function listDriveFiles(folderId: string): Promise<Album> {
  const drive = await getDriveClient();
  const q = `'${folderId}' in parents and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false`;

  const res = await drive.files.list({
    q,
    fields: 'files(id, name, mimeType, size, createdTime)',
    pageSize: 1000,
  });

  const files = res.data.files || [];
  const textures: MediaFile[] = files.map(f => ({
    name: f.name || 'Untitled',
    path: `gdrive://${f.id}`,
    // we can add other metadata here if MediaFile supported it directly or via side-channel
  }));

  // For MVP, we are not recursively fetching subfolders yet, or we can add that logic.
  // The user requirement said: "List files in a specific Drive folder (recursively or flat)."
  // Let's stick to flat for the immediate folder for now, or implement simple recursion.

  // Let's try to find subfolders too to build the tree.
  const folderQ = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const folderRes = await drive.files.list({
    q: folderQ,
    fields: 'files(id, name)',
    pageSize: 100,
  });

  const subfolders = folderRes.data.files || [];
  const children: Album[] = [];

  for (const subfolder of subfolders) {
    if (subfolder.id) {
      // Recursive call - be careful with depth/rate limits in production
      // For MVP we might want to lazy load, but the app architecture expects a full tree scan.
      // We will do a recursive scan.
      const subAlbum = await listDriveFiles(subfolder.id);
      subAlbum.name = subfolder.name || 'Untitled Folder';
      children.push(subAlbum);
    }
  }

  return {
    name: 'Google Drive Folder', // Caller should overwrite this with actual root name
    textures,
    children
  };
}

export async function getDriveFileStream(fileId: string): Promise<Readable> {
  const drive = await getDriveClient();
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );
  return res.data;
}

export async function getDriveFileMetadata(fileId: string): Promise<drive_v3.Schema$File> {
  const drive = await getDriveClient();
  const res = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size, createdTime, videoMediaMetadata'
  });
  return res.data;
}
