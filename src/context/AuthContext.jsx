import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext({});

const SESSION_KEY = 'montacontrol_session';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Restaurar sesión de localStorage
    let restored = null;
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        restored = JSON.parse(saved);
        setUser(restored);
      }
    } catch (e) {
      console.error('Error restoring session:', e);
    }
    setLoading(false);

    // La sesión guardada puede ser vieja (p.ej. de antes de que se le
    // cargara la foto al usuario) y localStorage nunca se refresca solo.
    // Repoblamos photoPath/name en segundo plano con datos frescos del
    // servidor (get_expediente es público por employeeNumber, sin
    // necesitar contraseña) para que la foto aparezca sin tener que
    // volver a iniciar sesión.
    if (restored?.employeeNumber) {
      (async () => {
        try {
          const { data } = await supabase.rpc('get_expediente', { p_employee_number: restored.employeeNumber });
          const fresh = data?.employee;
          if (fresh) {
            setUser(prev => {
              if (!prev) return prev;
              const updated = { ...prev, name: fresh.name || prev.name, photoPath: fresh.photoPath || null };
              localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
              return updated;
            });
          }
        } catch (e) {
          // Silencioso: si falla, se queda con los datos cacheados
        }
      })();
    }
  }, []);

  const signIn = async (employeeNumber, password) => {
    setError(null);
    try {
      const { data, error: rpcError } = await supabase
        .rpc('login_user', {
          p_employee_number: employeeNumber,
          p_password: password,
        });

      if (rpcError) throw rpcError;
      if (!data?.success) {
        setError(data?.error || 'login_error');
        return false;
      }

      const userData = data.user;
      const session = {
        id: userData.id,
        employeeNumber: userData.employeeNumber,
        name: userData.name,
        role: userData.role,
        photoPath: userData.photoPath || null,
      };
      setUser(session);
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return true;
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message);
      return false;
    }
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  };

  const changePassword = async (oldPassword, newPassword) => {
    if (!user) return { success: false, error: 'no_session' };
    try {
      const { data, error: rpcError } = await supabase
        .rpc('change_password', {
          p_employee_number: user.employeeNumber,
          p_old_password: oldPassword,
          p_new_password: newPassword,
        });

      if (rpcError) throw rpcError;
      return { success: data?.success || false, error: data?.error };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Admin y supervisor: listar usuarios
  const getUsers = async () => {
    if (!user || (user.role !== 'admin' && user.role !== 'supervisor')) return { success: false, error: 'not_authorized' };
    try {
      const { data, error: rpcError } = await supabase
        .rpc('get_users', { p_admin_employee_number: user.employeeNumber });

      if (rpcError) throw rpcError;
      return { success: data?.success || false, users: data?.users || [], error: data?.error };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Admin: crear usuario
  const createUser = async (employeeNumber, password, name, role = 'user') => {
    if (!user || user.role !== 'admin') return { success: false, error: 'not_authorized' };
    try {
      const { data, error: rpcError } = await supabase
        .rpc('create_user', {
          p_admin_employee_number: user.employeeNumber,
          p_employee_number: employeeNumber,
          p_password: password,
          p_name: name,
          p_role: role,
        });

      if (rpcError) throw rpcError;
      return { success: data?.success || false, error: data?.error, user: data?.user };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Admin y supervisor: actualizar usuario (el backend restringe lo que
  // puede tocar un supervisor: no puede editar la cuenta del admin ni
  // otorgar el rol admin)
  const updateUser = async (userId, updates) => {
    if (!user || (user.role !== 'admin' && user.role !== 'supervisor')) return { success: false, error: 'not_authorized' };
    try {
      const { data, error: rpcError } = await supabase
        .rpc('update_user', {
          p_admin_employee_number: user.employeeNumber,
          p_user_id: userId,
          p_name: updates.name || null,
          p_role: updates.role || null,
          p_is_active: updates.isActive !== undefined ? updates.isActive : null,
          p_password: updates.password || null,
        });

      if (rpcError) throw rpcError;
      return { success: data?.success || false, error: data?.error };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Admin: eliminar usuario
  const deleteUser = async (userId) => {
    if (!user || user.role !== 'admin') return { success: false, error: 'not_authorized' };
    try {
      const { data, error: rpcError } = await supabase
        .rpc('delete_user', {
          p_admin_employee_number: user.employeeNumber,
          p_user_id: userId,
        });

      if (rpcError) throw rpcError;
      return { success: data?.success || false, error: data?.error };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Admin: eliminar múltiples usuarios
  const bulkDeleteUsers = async (userIds) => {
    if (!user || user.role !== 'admin') return { success: false, error: 'not_authorized' };
    try {
      const { data, error: rpcError } = await supabase
        .rpc('bulk_delete_users', {
          p_admin_employee_number: user.employeeNumber,
          p_user_ids: userIds,
        });

      if (rpcError) throw rpcError;
      return { success: data?.success || false, error: data?.error };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  return (
    <AuthContext.Provider value={{
      user, loading, error, setError,
      signIn, signOut, changePassword,
      getUsers, createUser, updateUser, deleteUser, bulkDeleteUsers,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
