import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { enqueue, replay, count, removeById, isNetworkError, getQueue } from '../services/offlineQueue.js';

export function useStore(user) {
  const [checklists, setChecklists] = useState([]);
  const [forklifts, setForklifts] = useState([]);
  const [maintenances, setMaintenances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offlinePending, setOfflinePending] = useState(0);
  const [offlineInfo, setOfflineInfo] = useState(null); // msg cuando se encola algo

  useEffect(() => {
    if (!user) {
      setChecklists([]);
      setForklifts([]);
      setMaintenances([]);
      setLoading(false);
      return;
    }
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const isManager = user.role === 'admin' || user.role === 'supervisor';

      let checklistsQuery = supabase.from('checklists').select('*');
      if (!isManager) {
        checklistsQuery = checklistsQuery.eq('employee_number', user.employeeNumber);
      }

      // Los montacargas son compartidos: todos los usuarios ven todos los
      // equipos registrados para poder hacer revisiones.
      let forkliftsQuery = supabase.from('forklifts').select('*');

      const [checklistsRes, forkliftsRes, maintRes] = await Promise.all([
        checklistsQuery.order('created_at', { ascending: false }),
        forkliftsQuery.order('created_at', { ascending: true }),
        supabase.from('maintenance_records').select('*').order('performed_at', { ascending: false }),
      ]);

      if (checklistsRes.error) throw checklistsRes.error;
      if (forkliftsRes.error) throw forkliftsRes.error;
      // Si la migración de mantenimiento aún no corre, no rompe la app:
      if (maintRes.error) console.warn('Mantenimientos no disponibles:', maintRes.error.message);

      let mapped = (checklistsRes.data || []).map(mapChecklistFromDB);

      // Registros creados offline pendientes de sincronizar: se muestran
      // también (id temporal local-xxx, marcados con isLocal).
      const queue = getQueue();
      const pendingAdds = queue
        .filter(op => op.type === 'addChecklist')
        .map(op => {
          const p = op.payload || {};
          return {
            id: `local-${op.id}`,
            localId: op.id,
            forkliftId: p.forklift_id,
            operatorName: p.operator_name,
            inspectorName: p.inspector_name,
            month: p.month,
            year: p.year,
            day: p.day,
            items: p.items || {},
            observations: p.observations || '',
            operatorSignature: p.operator_signature || null,
            inspectorSignature: p.inspector_signature || null,
            createdAt: new Date(op.createdAt || Date.now()).toISOString(),
            isLocal: true,
          };
        });
      mapped = [...pendingAdds, ...mapped];

      setChecklists(mapped);
      setForklifts((forkliftsRes.data || []).map(mapForkliftFromDB));
      setMaintenances((maintRes.data || []).map(mapMaintenanceFromDB));
      setOfflinePending(pendingAdds.length);
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Sincroniza la cola offline contra Supabase y recarga.
  const syncOffline = useCallback(async () => {
    if (!user || count() === 0) return { synced: 0 };
    setLoading(true);
    try {
      const result = await replay(supabase, user);
      if (result.failed?.length) {
        setError(`Sync: ${result.failed.length} operación(es) con error (revisar permisos)`);
      }
      await loadData();
      return result;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Al recuperar conexión: sincroniza lo pendiente.
  useEffect(() => {
    const onOnline = () => { if (count() > 0) syncOffline(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const addChecklist = useCallback(async (checklist) => {
    if (!user) throw new Error('no_session');
    const insertPayload = {
      forklift_id: checklist.forkliftId,
      operator_name: checklist.operatorName,
      inspector_name: checklist.inspectorName,
      month: checklist.month,
      year: checklist.year,
      day: checklist.day,
      items: checklist.items,
      observations: checklist.observations || '',
      employee_number: user.employeeNumber,
      ...(checklist.operatorSignature ? { operator_signature: checklist.operatorSignature } : {}),
      ...(checklist.inspectorSignature ? { inspector_signature: checklist.inspectorSignature } : {}),
    };
    try {
      const { data, error: dbError } = await supabase
        .from('checklists')
        .insert(insertPayload)
        .select()
        .single();

      if (dbError) throw dbError;
      const mapped = mapChecklistFromDB(data);
      setChecklists(prev => [mapped, ...prev]);
      return mapped;
    } catch (err) {
      console.error('Error adding checklist:', err);
      if (isNetworkError(err)) return enqueueLocal('addChecklist', { payload: insertPayload }, checklist);
      setError(err.message);
      throw err;
    }
  }, [user]);

  // Guarda la operación en la cola offline y refleja el cambio en el
  // estado local para que la UI lo muestre como si estuviera guardado.
  const enqueueLocal = (type, op, checklist) => {
    const opId = enqueue(op);
    setOfflinePending(count());
    setOfflineInfo('offlineQueued');
    if (type === 'addChecklist' && checklist) {
      const localRecord = {
        id: `local-${opId}`,
        localId: opId,
        forkliftId: checklist.forkliftId,
        operatorName: checklist.operatorName,
        inspectorName: checklist.inspectorName,
        month: checklist.month,
        year: checklist.year,
        day: checklist.day,
        items: checklist.items || {},
        observations: checklist.observations || '',
        operatorSignature: checklist.operatorSignature || null,
        inspectorSignature: checklist.inspectorSignature || null,
        createdAt: new Date().toISOString(),
        isLocal: true,
      };
      setChecklists(prev => [localRecord, ...prev]);
      return localRecord;
    }
    return null;
  };

  const updateChecklist = useCallback(async (id, updates) => {
    try {
      const dbUpdates = {};
      if (updates.forkliftId !== undefined) dbUpdates.forklift_id = updates.forkliftId;
      if (updates.operatorName !== undefined) dbUpdates.operator_name = updates.operatorName;
      if (updates.inspectorName !== undefined) dbUpdates.inspector_name = updates.inspectorName;
      if (updates.month !== undefined) dbUpdates.month = updates.month;
      if (updates.year !== undefined) dbUpdates.year = updates.year;
      if (updates.day !== undefined) dbUpdates.day = updates.day;
      if (updates.items !== undefined) dbUpdates.items = updates.items;
      if (updates.observations !== undefined) dbUpdates.observations = updates.observations;
      if (updates.operatorSignature !== undefined) dbUpdates.operator_signature = updates.operatorSignature;
      if (updates.inspectorSignature !== undefined) dbUpdates.inspector_signature = updates.inspectorSignature;

      const isManager = user?.role === 'admin' || user?.role === 'supervisor';

      let query = supabase.from('checklists').update(dbUpdates).eq('id', id);
      if (!isManager) {
        query = query.eq('employee_number', user?.employeeNumber);
      }

      const { data, error: dbError } = await query.select().single();

      if (dbError) throw dbError;
      const mapped = mapChecklistFromDB(data);
      setChecklists(prev => prev.map(c => (c.id === id ? mapped : c)));
      return mapped;
    } catch (err) {
      console.error('Error updating checklist:', err);
      if (isNetworkError(err)) {
        enqueue('updateChecklist', { id, updates });
        setOfflinePending(count());
        setOfflineInfo('offlineQueued');
        setChecklists(prev => prev.map(c => (c.id === id ? { ...c, ...updates, isLocal: true } : c)));
        return { ...updates };
      }
      setError(err.message);
      throw err;
    }
  }, [user]);

  const deleteChecklist = useCallback(async (id) => {
    try {
      const isManager = user?.role === 'admin' || user?.role === 'supervisor';

      let query = supabase.from('checklists').delete().eq('id', id);
      if (!isManager) {
        query = query.eq('employee_number', user?.employeeNumber);
      }

      const { error: dbError } = await query;
      if (dbError) throw dbError;
      setChecklists(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error('Error deleting checklist:', err);
      if (isNetworkError(err)) {
        // Si era un registro local aún sin sincronizar, solo se quita de la cola.
        if (String(id).startsWith('local-')) {
          removeById(String(id).replace('local-', ''));
        } else {
          enqueue('deleteChecklist', { id });
          setOfflinePending(count());
          setOfflineInfo('offlineQueued');
        }
        setChecklists(prev => prev.filter(c => c.id !== id));
        return;
      }
      setError(err.message);
      throw err;
    }
  }, [user]);

  // Registra un mantenimiento: inserta el historial y actualiza
  // hours_last_service del equipo (el contador queda en cero).
  const addMaintenance = useCallback(async (forkliftId, record) => {
    if (!user) throw new Error('no_session');
    const hours = Number(record.hoursAtService);
    const { data, error: dbError } = await supabase
      .from('maintenance_records')
      .insert({
        forklift_id: forkliftId,
        performed_at: record.performedAt || new Date().toISOString().slice(0, 10),
        maintenance_type: record.maintenanceType || 'preventivo',
        hours_at_service: isNaN(hours) ? null : hours,
        performed_by: record.performedBy || user.name || user.employeeNumber,
        notes: record.notes || '',
      })
      .select()
      .single();
    if (dbError) throw dbError;
    const mapped = mapMaintenanceFromDB(data);
    setMaintenances(prev => [mapped, ...prev]);

    // El equipo queda "recién servido": reinicia el contador de horas.
    if (!isNaN(hours)) {
      try {
        await updateForklift(forkliftId, { currentHours: Math.max(hours, 0), hoursLastService: hours });
      } catch (e) {
        console.warn('No se pudo actualizar el horómetro del equipo:', e);
      }
    }
    return mapped;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const addForklift = useCallback(async (forklift) => {
    if (!user) throw new Error('no_session');
    try {
      const { data, error: dbError } = await supabase
        .from('forklifts')
        .insert({
          id_code: forklift.id,
          name: forklift.name || '',
          employee_number: user.employeeNumber,
          brand: forklift.brand || '',
          model: forklift.model || '',
          serial_number: forklift.serialNumber || '',
          capacity: forklift.capacity || '',
          capacity_unit: forklift.capacityUnit || '',
          power_type: forklift.powerType || '',
          mast_type: forklift.mastType || '',
          max_lift_height: forklift.maxLiftHeight || '',
          tire_type: forklift.tireType || '',
          manufacture_year: forklift.manufactureYear || '',
          voltage: forklift.voltage || '',
          weight: forklift.weight || '',
          photo_path: forklift.photoPath || null,
          plate_photo_path: forklift.platePhotoPath || null,
          notes: forklift.notes || '',
          current_hours: Number(forklift.currentHours) || 0,
          hours_last_service: Number(forklift.hoursLastService) || 0,
          service_interval_hours: Number(forklift.serviceIntervalHours) || 200,
        })
        .select()
        .single();

      if (dbError) throw dbError;
      const mapped = mapForkliftFromDB(data);
      setForklifts(prev => [...prev, mapped]);
      return mapped;
    } catch (err) {
      console.error('Error adding forklift:', err);
      setError(err.message);
      throw err;
    }
  }, [user]);

  const updateForklift = useCallback(async (id, updates) => {
    try {
      const dbUpdates = {};
      if (updates.idCode !== undefined) dbUpdates.id_code = updates.idCode;
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.brand !== undefined) dbUpdates.brand = updates.brand;
      if (updates.model !== undefined) dbUpdates.model = updates.model;
      if (updates.serialNumber !== undefined) dbUpdates.serial_number = updates.serialNumber;
      if (updates.capacity !== undefined) dbUpdates.capacity = updates.capacity;
      if (updates.capacityUnit !== undefined) dbUpdates.capacity_unit = updates.capacityUnit;
      if (updates.powerType !== undefined) dbUpdates.power_type = updates.powerType;
      if (updates.mastType !== undefined) dbUpdates.mast_type = updates.mastType;
      if (updates.maxLiftHeight !== undefined) dbUpdates.max_lift_height = updates.maxLiftHeight;
      if (updates.tireType !== undefined) dbUpdates.tire_type = updates.tireType;
      if (updates.manufactureYear !== undefined) dbUpdates.manufacture_year = updates.manufactureYear;
      if (updates.voltage !== undefined) dbUpdates.voltage = updates.voltage;
      if (updates.weight !== undefined) dbUpdates.weight = updates.weight;
      if (updates.photoPath !== undefined) dbUpdates.photo_path = updates.photoPath;
      if (updates.platePhotoPath !== undefined) dbUpdates.plate_photo_path = updates.platePhotoPath;
      if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
      if (updates.currentHours !== undefined) dbUpdates.current_hours = Number(updates.currentHours) || 0;
      if (updates.hoursLastService !== undefined) dbUpdates.hours_last_service = Number(updates.hoursLastService) || 0;
      if (updates.serviceIntervalHours !== undefined) dbUpdates.service_interval_hours = Number(updates.serviceIntervalHours) || 200;

      // Los montacargas son compartidos — cualquier usuario puede
      // actualizarlos (ej. agregar foto de placa durante revisión).
      let query = supabase.from('forklifts').update(dbUpdates).eq('id', id);

      const { data, error: dbError } = await query.select().single();

      if (dbError) throw dbError;
      const mapped = mapForkliftFromDB(data);
      setForklifts(prev => prev.map(f => (f.id === id ? mapped : f)));
      return mapped;
    } catch (err) {
      console.error('Error updating forklift:', err);
      setError(err.message);
      throw err;
    }
  }, [user]);

  const deleteForklift = useCallback(async (id) => {
    try {
      // Solo admin y supervisor pueden eliminar montacargas.
      const isManager = user?.role === 'admin' || user?.role === 'supervisor';
      if (!isManager) throw new Error('No autorizado para eliminar equipos');

      let query = supabase.from('forklifts').delete().eq('id', id);

      const { error: dbError } = await query;
      if (dbError) throw dbError;
      setForklifts(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      console.error('Error deleting forklift:', err);
      setError(err.message);
      throw err;
    }
  }, [user]);

  return {
    data: { checklists, forklifts },
    loading,
    error,
    reload: loadData,
    addChecklist,
    updateChecklist,
    deleteChecklist,
    addForklift,
    updateForklift,
    addMaintenance,
    maintenances,
    deleteForklift,
    offline: { pending: offlinePending, info: offlineInfo, syncNow: syncOffline },
  };
}

function mapChecklistFromDB(row) {
  return {
    id: row.id,
    forkliftId: row.forklift_id,
    operatorName: row.operator_name,
    inspectorName: row.inspector_name,
    month: row.month,
    year: row.year,
    day: row.day,
    items: row.items || {},
    observations: row.observations || '',
    operatorSignature: row.operator_signature || null,
    inspectorSignature: row.inspector_signature || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMaintenanceFromDB(row) {
  return {
    id: row.id,
    forkliftId: row.forklift_id,
    performedAt: row.performed_at,
    maintenanceType: row.maintenance_type || 'preventivo',
    hoursAtService: row.hours_at_service,
    performedBy: row.performed_by || '',
    notes: row.notes || '',
    createdAt: row.created_at,
  };
}

function mapForkliftFromDB(row) {
  return {
    id: row.id,
    idCode: row.id_code,
    name: row.name || '',
    brand: row.brand || '',
    model: row.model || '',
    serialNumber: row.serial_number || '',
    capacity: row.capacity || '',
    capacityUnit: row.capacity_unit || '',
    powerType: row.power_type || '',
    mastType: row.mast_type || '',
    maxLiftHeight: row.max_lift_height || '',
    tireType: row.tire_type || '',
    manufactureYear: row.manufacture_year || '',
    voltage: row.voltage || '',
    weight: row.weight || '',
    photoPath: row.photo_path || null,
    platePhotoPath: row.plate_photo_path || null,
    notes: row.notes || '',
    currentHours: row.current_hours ?? 0,
    hoursLastService: row.hours_last_service ?? 0,
    serviceIntervalHours: row.service_interval_hours ?? 200,
    createdAt: row.created_at,
  };
}
