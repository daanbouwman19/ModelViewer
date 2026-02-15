import path from 'path';

export function debugCheck(dirPath: string) {
  const p = path.win32;
  const normalized = p.resolve(dirPath);
  console.log('Input:', dirPath);
  console.log('Normalized (win32):', normalized);
  const segments = normalized.split(p.sep);
  console.log('Segments:', segments);
  return normalized;
}

debugCheck('C:\');
