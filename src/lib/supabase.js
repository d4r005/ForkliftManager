import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://bgystqqohrigsgjgdzqn.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_ANON_KEY) {
  console.warn('⚠️ VITE_SUPABASE_ANON_KEY no está configurada. Crea un archivo .env con las credenciales de Supabase.');
}

// Auth custom: login por número de empleado via RPC functions
// No usamos Supabase Auth — solo PostgreSQL + RPC
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
