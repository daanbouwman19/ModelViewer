import { FileSystemProvider } from './fs-provider';
import { LocalFileSystemProvider } from './providers/local-provider';
import { GoogleDriveProvider } from './providers/drive-provider';

const providers: FileSystemProvider[] = [
  new GoogleDriveProvider(),
  new LocalFileSystemProvider(),
];

export function getProvider(filePath: string): FileSystemProvider {
  for (const provider of providers) {
    if (provider.canHandle(filePath)) {
      return provider;
    }
  }
  throw new Error(`No provider found for path: ${filePath}`);
}
