import { createClient } from '@supabase/supabase-js';

let _supabase = null;

export function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('Variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórias');
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Manter export default para compatibilidade, mas usando lazy init
export const supabase = new Proxy({}, {
  get(_, prop) {
    return getSupabase()[prop];
  }
});
