// Supabase connection. The anon key is a public (publishable) key — safe to
// ship in client code. Set these as Vite env vars (build time) or a local
// .env file. Realtime broadcast/presence need no database tables.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Single shared room/channel for the demo.
export const ROOM = 'inkbattle';

export const HAS_SUPABASE = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
