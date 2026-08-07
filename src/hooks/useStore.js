import { useState, useCallback } from 'react';

const STORAGE_KEY = 'montacontrol_data';

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Error loading data:', e);
  }
  return { checklists: [], forklifts: [] };
}

export function useStore() {
  const [data, setData] = useState(loadData);

  const save = useCallback((newData) => {
    setData(newData);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
    } catch (e) {
      console.error('Error saving data:', e);
    }
  }, []);

  const addChecklist = useCallback((checklist) => {
    setData(prev => {
      const next = {
        ...prev,
        checklists: [...prev.checklists, { ...checklist, id: Date.now(), createdAt: new Date().toISOString() }]
      };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const updateChecklist = useCallback((id, updates) => {
    setData(prev => {
      const next = {
        ...prev,
        checklists: prev.checklists.map(c =>
          c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
        )
      };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const deleteChecklist = useCallback((id) => {
    setData(prev => {
      const next = {
        ...prev,
        checklists: prev.checklists.filter(c => c.id !== id)
      };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const addForklift = useCallback((forklift) => {
    setData(prev => {
      const next = {
        ...prev,
        forklifts: [...prev.forklifts, { ...forklift, id: Date.now() }]
      };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const deleteForklift = useCallback((id) => {
    setData(prev => {
      const next = {
        ...prev,
        forklifts: prev.forklifts.filter(f => f.id !== id)
      };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return {
    data,
    addChecklist,
    updateChecklist,
    deleteChecklist,
    addForklift,
    deleteForklift,
  };
}
