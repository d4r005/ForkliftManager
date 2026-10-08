// Cola offline: operaciones de checklists que no pudieron enviarse a
// Supabase por falta de red. Se guardan en localStorage y se reintentan
// automáticamente al recuperar la conexión.

const KEY = 'fm_offline_queue';

export function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  localStorage.setItem(KEY, JSON.stringify(queue));
}

export function enqueue(op) {
  const queue = getQueue();
  queue.push({ id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now(), ...op });
  saveQueue(queue);
  return queue[queue.length - 1].id;
}

export function removeById(id) {
  saveQueue(getQueue().filter(o => o.id !== id));
}

export function count() {
  return getQueue().length;
}

// Heurística: ¿el error es de red y no de permisos/datos?
export function isNetworkError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String(err?.message || err || '');
  return /failed to fetch|networkerror|network error|fetch failed|timeout|load failed|connection/i.test(msg);
}

// Procesa la cola en orden. Devuelve { synced, failed, remaining }.
// - Éxito → se quita de la cola y sigue.
// - Error de red → se detiene (se reintenta después).
// - Otro error (permisos, datos) → se quita y se reporta en failed.
export async function replay(supabase, user) {
  const isManager = user?.role === 'admin' || user?.role === 'supervisor';
  const queue = getQueue();
  let synced = 0;
  const failed = [];

  for (const op of queue) {
    try {
      let res;
      if (op.type === 'addChecklist') {
        res = await supabase.from('checklists').insert(op.payload).select().single();
      } else if (op.type === 'updateChecklist') {
        let q = supabase.from('checklists').update(op.updates).eq('id', op.id);
        if (!isManager) q = q.eq('employee_number', user?.employeeNumber);
        res = await q.select().maybeSingle();
      } else if (op.type === 'deleteChecklist') {
        let q = supabase.from('checklists').delete().eq('id', op.id);
        if (!isManager) q = q.eq('employee_number', user?.employeeNumber);
        res = await q;
      } else {
        removeById(op.id);
        continue;
      }

      if (res.error) throw res.error;
      removeById(op.id);
      synced++;
    } catch (err) {
      if (isNetworkError(err)) break; // seguimos offline: se reintenta después
      removeById(op.id);
      failed.push({ op, error: err.message });
    }
  }

  return { synced, failed, remaining: count() };
}
