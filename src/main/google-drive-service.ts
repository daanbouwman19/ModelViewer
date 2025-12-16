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
// ... existing code ...
export async function listDriveFiles(folderId: string): Promise<Album> {
  const drive = await getDriveClient();
  const q = `'${folderId}' in parents and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false`;

  let allFiles: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const res: { data: drive_v3.Schema$FileList } = await drive.files.list({
      q,
      fields: 'nextPageToken, files(id, name, mimeType, size, createdTime)',
      pageSize: 1000,
      pageToken,
    });
    if (res.data.files) {
      allFiles = allFiles.concat(res.data.files);
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  const files = allFiles;
  const textures: MediaFile[] = files.map((f) => ({
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
    children,
  };
}

/**
 * Lists files and folders for browsing (File Explorer style).
 * Returns FileSystemEntry[] compatible structure.
 */
export async function listDriveDirectory(
  folderId: string,
): Promise<{ name: string; path: string; isDirectory: boolean }[]> {
  const drive = await getDriveClient();

  // Handle 'root' explicitly if passed
  const queryId = folderId === 'root' ? 'root' : folderId;

  const q = `'${queryId}' in parents and trashed = false`;
  try {
    const res = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType)',
      pageSize: 100, // Pagination? For browsing we probably want more but let's start with 100
      orderBy: 'folder,name',
    });

    const files = res.data.files || [];
    return files.map((f) => ({
      name: f.name || 'Untitled',
      path: f.id || '', // We use ID as "path" for internal navigation in this mode
      isDirectory: f.mimeType === 'application/vnd.google-apps.folder',
    }));
  } catch (err) {
    console.error(
      `[GoogleDriveService] Error listing files for query '${q}':`,
      err,
    );
    throw err;
  }
}

export async function getDriveParent(folderId: string): Promise<string | null> {
  if (!folderId || folderId === 'root') return null;

  const drive = await getDriveClient();
  try {
    const res = await drive.files.get({
      fileId: folderId,
      fields: 'parents',
    });

    if (res.data.parents && res.data.parents.length > 0) {
      return res.data.parents[0];
    }
  } catch (e) {
    console.warn('Failed to get parent for drive folder', folderId, e);
  }
  return null;
}

export async function getDriveFileStream(fileId: string): Promise<Readable> {
  const drive = await getDriveClient();
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' },
  );
  return res.data;
}

// ... existing code ...
export async function getDriveFileMetadata(
  fileId: string,
): Promise<drive_v3.Schema$File> {
  const drive = await getDriveClient();
  const res = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size, createdTime, videoMediaMetadata',
  });
  return res.data;
}

export async function getDriveFileThumbnail(fileId: string): Promise<Readable> {
  const drive = await getDriveClient();
  // We can try to get the thumbnail link, but that's a public URL (sometimes).
  // A better way for private app access is 'files.get' with 'alt=media' if it's an image.
  // But for videos, 'alt=media' downloads the VIDEO.
  // The Drive API 'thumbnailLink' field is often short-lived or requires cookies.
  // However, for MVP, if the file is an image, we can just download it (alt=media).
  // If it's a video, Drive doesn't provide a direct "thumbnail download" stream easily via API
  // without using the thumbnailLink which might need auth headers.
  // Let's first check if we can get the thumbnailLink and pipe it.

  // Actually, for a robust backend implementation:
  // 1. Get metadata to see 'thumbnailLink'.
  // 2. Fetch 'thumbnailLink' using the auth token.
  // Note: thumbnailLink often allows unauthenticated access if the file is public,
  // but for private files, we need to pass the token.

  const meta = await drive.files.get({
    fileId,
    fields: 'thumbnailLink, mimeType',
  });

  if (meta.data.thumbnailLink) {
    // We need to fetch this URL. The googleapis library doesn't have a helper for arbitrary URLs.
    // We can use the global fetch (Node 18+) or axios if available.
    // We need to attach the Auth header.
    const auth = await getOAuth2Client();
    const token = await auth.getAccessToken(); // ensuring we have a token

    const res = await fetch(meta.data.thumbnailLink, {
      headers: {
        Authorization: `Bearer ${token.token}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch thumbnail: ${res.statusText}`);
    }
    // Convert Web ReadableStream to Node Readable
    // Readable.fromWeb is available in recent Node versions, or we can use a utility
    if (res.body) {
      // Node 18+ has Readable.fromWeb
      return Readable.fromWeb(res.body as import('stream/web').ReadableStream);
    }
  }

  // Fallback: If no thumbnail link (e.g. not generated yet), and it is an image,
  // we can download the file itself (if small?).
  // For now, throw if no thumbnail link.
  throw new Error('No thumbnail available');
}
