/**
 * Get current timestamp in milliseconds
 */
export function now(): number {
  return Date.now();
}

/**
 * Get current timestamp in seconds
 */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Get ISO 8601 timestamp string
 */
export function isoTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Format timestamp as ISO 8601 string
 * @param timestamp Timestamp in milliseconds
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Parse ISO 8601 timestamp string to milliseconds
 * @param isoString ISO 8601 timestamp string
 */
export function parseTimestamp(isoString: string): number {
  return new Date(isoString).getTime();
}

/**
 * Add milliseconds to a timestamp
 * @param timestamp Base timestamp in milliseconds
 * @param ms Milliseconds to add
 */
export function addMilliseconds(timestamp: number, ms: number): number {
  return timestamp + ms;
}

/**
 * Add seconds to a timestamp
 * @param timestamp Base timestamp in milliseconds
 * @param seconds Seconds to add
 */
export function addSeconds(timestamp: number, seconds: number): number {
  return timestamp + seconds * 1000;
}

/**
 * Add minutes to a timestamp
 * @param timestamp Base timestamp in milliseconds
 * @param minutes Minutes to add
 */
export function addMinutes(timestamp: number, minutes: number): number {
  return timestamp + minutes * 60 * 1000;
}

/**
 * Add hours to a timestamp
 * @param timestamp Base timestamp in milliseconds
 * @param hours Hours to add
 */
export function addHours(timestamp: number, hours: number): number {
  return timestamp + hours * 60 * 60 * 1000;
}

/**
 * Add days to a timestamp
 * @param timestamp Base timestamp in milliseconds
 * @param days Days to add
 */
export function addDays(timestamp: number, days: number): number {
  return timestamp + days * 24 * 60 * 60 * 1000;
}

/**
 * Check if a timestamp is in the past
 * @param timestamp Timestamp to check
 */
export function isPast(timestamp: number): boolean {
  return timestamp < Date.now();
}

/**
 * Check if a timestamp is in the future
 * @param timestamp Timestamp to check
 */
export function isFuture(timestamp: number): boolean {
  return timestamp > Date.now();
}

/**
 * Get time until a timestamp in milliseconds
 * @param timestamp Target timestamp
 */
export function timeUntil(timestamp: number): number {
  return Math.max(0, timestamp - Date.now());
}

/**
 * Get time since a timestamp in milliseconds
 * @param timestamp Past timestamp
 */
export function timeSince(timestamp: number): number {
  return Math.max(0, Date.now() - timestamp);
}

/**
 * Format duration in milliseconds to human-readable string
 * @param ms Duration in milliseconds
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Get start of day timestamp
 * @param timestamp Timestamp (default: now)
 */
export function startOfDay(timestamp?: number): number {
  const date = timestamp ? new Date(timestamp) : new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Get end of day timestamp
 * @param timestamp Timestamp (default: now)
 */
export function endOfDay(timestamp?: number): number {
  const date = timestamp ? new Date(timestamp) : new Date();
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

/**
 * Get start of hour timestamp
 * @param timestamp Timestamp (default: now)
 */
export function startOfHour(timestamp?: number): number {
  const date = timestamp ? new Date(timestamp) : new Date();
  date.setMinutes(0, 0, 0);
  return date.getTime();
}

/**
 * Get start of week timestamp (Monday)
 * @param timestamp Timestamp (default: now)
 */
export function startOfWeek(timestamp?: number): number {
  const date = timestamp ? new Date(timestamp) : new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Get start of month timestamp
 * @param timestamp Timestamp (default: now)
 */
export function startOfMonth(timestamp?: number): number {
  const date = timestamp ? new Date(timestamp) : new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Check if two timestamps are on the same day
 * @param timestamp1 First timestamp
 * @param timestamp2 Second timestamp
 */
export function isSameDay(timestamp1: number, timestamp2: number): boolean {
  const date1 = new Date(timestamp1);
  const date2 = new Date(timestamp2);
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Sleep for specified milliseconds
 * @param ms Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a debounced function
 * @param fn Function to debounce
 * @param delayMs Delay in milliseconds
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delayMs);
  };
}

/**
 * Create a throttled function
 * @param fn Function to throttle
 * @param delayMs Delay in milliseconds
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delayMs) {
      lastCall = now;
      fn(...args);
    }
  };
}
