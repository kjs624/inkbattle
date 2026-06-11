// Where to reach the game server.
// - In production (Vercel) set VITE_SERVER_URL to your Render/Fly.io server URL.
// - In local dev it falls back to the local server on :3001.
const fromEnv = import.meta.env.VITE_SERVER_URL;

export const SERVER_URL =
  fromEnv && fromEnv.length > 0
    ? fromEnv
    : `${location.protocol}//${location.hostname}:3001`;
