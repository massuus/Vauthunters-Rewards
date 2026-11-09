import { ApiError } from './http.js';

// Preserve the existing binding preference for deployments with a dedicated database.
export function getAppDb(env) {
  return env?.MINING_DB || env?.LEADERBOARD_DB || null;
}

export function requireAppDb(env, message = 'The application database is not configured yet.') {
  const db = getAppDb(env);
  if (!db) throw new ApiError(503, message);
  return db;
}
