import { createClient } from '@supabase/supabase-js';

// Public client — safe for browser and server, uses the anon key.
// The hybrid_search RPC and verses table only need read access, so this is
// all the API route needs too (no service-role key at request time).
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
