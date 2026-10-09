import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://bgystqqohrigsgjgdzqn.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_ANON_KEY) {
  console.warn('⚠️ VITE_SUPABASE_ANON_KEY no está configurada. Crea un archivo .env con las credenciales de Supabase.');
}

// Auth custom: login por número de empleado via RPC functions
// No usamos Supabase Auth — solo PostgreSQL + RPC

// ===== Bitácora de auditoría: registrar quién hace cada cambio =====
// Los triggers de audit_log leen el header 'x-app-user' (visible en
// PostgREST como request.headers) para anotar el actor real. Sin esto
// todos los registros salen como 'sistema'.
let auditUser = null;
export function setAuditUser(employeeNumber) {
  auditUser = employeeNumber ? String(employeeNumber) : null;
}

const supabaseFetch = (input, init) => {
  if (!auditUser) return fetch(input, init);
  try {
    if (typeof Request !== 'undefined' && input instanceof Request) {
      const h = new Headers(input.headers);
      h.set('x-app-user', auditUser);
      return fetch(new Request(input, { headers: h }));
    }
    const headers = new Headers(init?.headers);
    headers.set('x-app-user', auditUser);
    return fetch(input, { ...init, headers });
  } catch (e) {
    // Si algo raro pasa con el header, no rompamos la petición
    return fetch(input, init);
  }
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: supabaseFetch },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
