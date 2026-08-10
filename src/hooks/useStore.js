import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

export function useStore(user) {
  const [checklists, setChecklists] = useState([]);
  const [forklifts, setForklifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) {
      setChecklists([]);
      setForklifts([]);
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

      let forkliftsQuery = supabase.from('forklifts').select('*');
      if (!isManager) {
        forkliftsQuery = forkliftsQuery.eq('employee_number', user.employeeNumber);
      }

      const [checklistsRes, forkliftsRes] = await Promise.all([
        checklistsQuery.order('created_at', { ascending: false }),
        forkliftsQuery.order('created_at', { ascending: true }),
      ]);

      if (checklistsRes.error) throw checklistsRes.error;
      if (forkliftsRes.error) throw forkliftsRes.error;

      setChecklists((checklistsRes.data || []).map(mapChecklistFromDB));
      setForklifts((forkliftsRes.data || []).map(mapForkliftFromDB));
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addChecklist = useCallback(async (checklist) => {
    if (!user) throw new Error('no_session');
    try {
      const { data, error: dbError } = await supabase
        .from('checklists')
        .insert({
          forklift_id: checklist.forkliftId,
          operator_name: checklist.operatorName,
          inspector_name: checklist.inspectorName,
          month: checklist.month,
          year: checklist.year,
          day: checklist.day,
          items: checklist.items,
          observations: checklist.observations || '',
          employee_number: user.employeeNumber,
        })
        .select()
        .single();

      if (dbError) throw dbError;
      const mapped = mapChecklistFromDB(data);
      setChecklists(prev => [mapped, ...prev]);
      return mapped;
    } catch (err) {
      console.error('Error adding checklist:', err);
      setError(err.message);
      throw err;
    }
  }, [user]);

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
      setError(err.message);
      throw err;
    }
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

      const isManager = user?.role === 'admin' || user?.role === 'supervisor';

      let query = supabase.from('forklifts').update(dbUpdates).eq('id', id);
      if (!isManager) {
        query = query.eq('employee_number', user?.employeeNumber);
      }

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
      const isManager = user?.role === 'admin' || user?.role === 'supervisor';

      let query = supabase.from('forklifts').delete().eq('id', id);
      if (!isManager) {
        query = query.eq('employee_number', user?.employeeNumber);
      }

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
    deleteForklift,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    createdAt: row.created_at,
  };
}
