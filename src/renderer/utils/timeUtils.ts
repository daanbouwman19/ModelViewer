/**
 * Formats a duration in seconds to a string (MM:SS or HH:MM:SS).
 * @param seconds - The duration in seconds.
 * @returns The formatted time string.
 */
export const formatTime = (seconds: number): string => {
  if (typeof seconds !== 'number' || !isFinite(seconds) || seconds <= 0) {
    return '00:00';
  }

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

/**
 * Formats a duration in seconds to a human-readable string for accessibility (e.g., "1 hour 2 minutes 30 seconds").
 * @param seconds - The duration in seconds.
 * @returns The formatted time string.
 */
export const formatDurationForA11y = (seconds: number): string => {
  if (typeof seconds !== 'number' || !isFinite(seconds) || seconds <= 0) {
    return '0 seconds';
  }

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m > 0) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (s > 0) parts.push(`${s} second${s === 1 ? '' : 's'}`);

  return parts.join(' ');
};
