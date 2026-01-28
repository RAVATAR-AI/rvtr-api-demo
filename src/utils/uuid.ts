import { storage } from './storage';

export function generateUUID(): string {
  // Use crypto.randomUUID if available
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback to manual UUID v4 generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const USER_ID_KEY = 'ravatar-user-id';

/**
 * Get or create a stable user ID that persists across sessions
 */
export function getUserId(): string {
  let userId = storage.get<string>(USER_ID_KEY);
  
  if (!userId) {
    userId = generateUUID();
    storage.set(USER_ID_KEY, userId);
  }
  
  return userId;
}
