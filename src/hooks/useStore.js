import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

export function useStore(user) {
  const [checklists, setChecklists] = useState([]);
  const [forklifts, setForklifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cargar datos cuando hay usuario
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
    setLoading(true);
    setError(null);
    try {
      const [checklistsRes, forkliftsRes] = await Promise.all([
        supabase.from('checklists').select('*').order('created_at', { ascending: false }),
        supabase.from('forklifts').select('*').order('created_at', { ascending: true }),
      ]);

      if (checklistsRes.error) throw checklistsRes.error;
      if (forkliftsRes.error) throw forkliftsRes.error;

      // Mapear de snake_case (DB) a camelCase (app)
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
    try {
      const { data, error } = await supabase
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
        })
        .select()
        .single();

      if (error) throw error;
      const mapped = mapChecklistFromDB(data);
      setChecklists(prev => [mapped, ...prev]);
      return mapped;
    } catch (err) {
      console.error('Error adding checklist:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  const updateChecklist = useCallback(async (id, updates) => {
    try {
      // id viene como string (Date.now() del localStorage) o UUID de Supabase
      // Buscar por el UUID real
      const dbUpdates = {};
      if (updates.forkliftId !== undefined) dbUpdates.forklift_id = updates.forkliftId;
      if (updates.operatorName !== undefined) dbUpdates.operator_name = updates.operatorName;
      if (updates.inspectorName !== undefined) dbUpdates.inspector_name = updates.inspectorName;
      if (updates.month !== undefined) dbUpdates.month = updates.month;
      if (updates.year !== undefined) dbUpdates.year = updates.year;
      if (updates.day !== undefined) dbUpdates.day = updates.day;
      if (updates.items !== undefined) dbUpdates.items = updates.items;
      if (updates.observations !== undefined) dbUpdates.observations = updates.observations;

      const { data, error } = await supabase
        .from('checklists')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      const mapped = mapChecklistFromDB(data);
      setChecklists(prev => prev.map(c => (c.id === id ? mapped : c)));
      return mapped;
    } catch (err) {
      console.error('Error updating checklist:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  const deleteChecklist = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('checklists').delete().eq('id', id);
      if (error) throw error;
      setChecklists(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error('Error deleting checklist:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  const addForklift = useCallback(async (forklift) => {
    try {
      const { data, error } = await supabase
        .from('forklifts')
        .insert({
          id_code: forklift.id,
          name: forklift.name || '',
        })
        .select()
        .single();

      if (error) throw error;
      const mapped = mapForkliftFromDB(data);
      setForklifts(prev => [...prev, mapped]);
      return mapped;
    } catch (err) {
      console.error('Error adding forklift:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  const deleteForklift = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('forklifts').delete().eq('id', id);
      if (error) throw error;
      setForklifts(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      console.error('Error deleting forklift:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  return {
    data: { checklists, forklifts },
    loading,
    error,
    reload: loadData,
    addChecklist,
    updateChecklist,
    deleteChecklist,
    addForklift,
    deleteForklift,
  };
}

// Mapeadores DB ↔ App
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
    createdAt: row.created_at,
  };
}
