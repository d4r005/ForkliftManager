import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';

export default function UserManager() {
  const { user, getUsers, createUser, updateUser, deleteUser, bulkDeleteUsers } = useAuth();
  const { t } = useLang();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [alert, setAlert] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  // New user form
  const [newEmp, setNewEmp] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('user');

  // Edit form
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('user');
  const [editActive, setEditActive] = useState(true);
  const [editPass, setEditPass] = useState('');

  const load = async () => {
    setLoading(true);
    const result = await getUsers();
    if (result.success) setUsers(result.users || []);
    else setAlert({ type: 'error', msg: result.error });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const showAlert = (type, msg) => {
    setAlert({ type, msg });
    setTimeout(() => setAlert(null), 3000);
  };

  const handleAdd = async () => {
    if (!newEmp.trim() || !newPass.trim()) {
      showAlert('error', t('authFillFields'));
      return;
    }
    const result = await createUser(newEmp.trim(), newPass, newName.trim(), newRole);
    if (result.success) {
      showAlert('success', t('userCreated'));
      setNewEmp(''); setNewPass(''); setNewName(''); setNewRole('user');
      setShowAddForm(false);
      load();
    } else {
      const err = result.error === 'employee_exists' ? t('userExists') : (result.error || t('userCreateError'));
      showAlert('error', err);
    }
  };

  const handleEdit = (u) => {
    setEditingUser(u);
    setEditName(u.name);
    setEditRole(u.role);
    setEditActive(u.isActive);
    setEditPass('');
  };

  const handleSaveEdit = async () => {
    const updates = {
      name: editName,
      role: editRole,
      isActive: editActive,
    };
    if (editPass.trim()) updates.password = editPass;

    const result = await updateUser(editingUser.id, updates);
    if (result.success) {
      showAlert('success', t('userUpdated'));
      setEditingUser(null);
      load();
    } else {
      showAlert('error', result.error || t('userUpdateError'));
    }
  };

  const handleDelete = async (u) => {
    if (u.employeeNumber === user.employeeNumber) {
      showAlert('error', t('userCantDeleteSelf'));
      return;
    }
    if (!confirm(t('userConfirmDelete'))) return;
    const result = await deleteUser(u.id);
    if (result.success) {
      showAlert('success', t('userDeleted'));
      load();
    } else {
      showAlert('error', result.error || t('userDeleteError'));
    }
  };

  const toggleSelect = (id) => {
    if (users.find(u => u.id === id)?.employeeNumber === user.employeeNumber) return;
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length > 0) {
      setSelectedIds([]);
    } else {
      const selectable = users
        .filter(u => u.employeeNumber !== user.employeeNumber)
        .map(u => u.id);
      setSelectedIds(selectable);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`${t('confirmBulkDelete')} (${selectedIds.length} ${t('itemsSelected')})`)) return;

    const result = await bulkDeleteUsers(selectedIds);
    if (result.success) {
      showAlert('success', t('userDeleted'));
      setSelectedIds([]);
      load();
    } else {
      showAlert('error', result.error || t('userDeleteError'));
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">M</div>
        <p>{t('authLoading')}</p>
      </div>
    );
  }

  return (
    <div className="user-manager">
      {alert && (
        <div className={`alert alert-${alert.type}`}>
          {alert.type === 'success' ? '✅ ' : '⚠️ '}{alert.msg}
        </div>
      )}

      <div className="section-header">
        <h2>👥 {t('userManagement')}</h2>
        <div className="section-header-actions">
          {selectedIds.length > 0 && (
            <button className="btn btn-danger" onClick={handleBulkDelete}>
              🗑️ {t('deleteSelected')} ({selectedIds.length})
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? `✕ ${t('cancel')}` : `➕ ${t('addUser')}`}
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="form-section">
          <h3>➕ {t('addUser')}</h3>
          <div className="form-grid">
            <div className="form-field">
              <label>{t('authEmployeeNumber')} *</label>
              <input
                type="text"
                value={newEmp}
                onChange={e => setNewEmp(e.target.value)}
                placeholder={t('authEmployeePlaceholder')}
              />
            </div>
            <div className="form-field">
              <label>{t('userFullName')} *</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder={t('userFullNamePlaceholder')}
              />
            </div>
            <div className="form-field">
              <label>{t('authPassword')} *</label>
              <input
                type="text"
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                placeholder={t('userTempPassword')}
              />
            </div>
            <div className="form-field">
              <label>{t('userRole')}</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value)}>
                <option value="user">{t('userRoleUser')}</option>
                <option value="admin">{t('userRoleAdmin')}</option>
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
              {t('cancel')}
            </button>
            <button className="btn btn-primary" onClick={handleAdd}>
              💾 {t('saveUser')}
            </button>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="form-section">
          <h3>✏️ {t('editUser')} — {editingUser.employeeNumber}</h3>
          <div className="form-grid">
            <div className="form-field">
              <label>{t('userFullName')}</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>{t('userRole')}</label>
              <select value={editRole} onChange={e => setEditRole(e.target.value)}>
                <option value="user">{t('userRoleUser')}</option>
                <option value="admin">{t('userRoleAdmin')}</option>
              </select>
            </div>
            <div className="form-field">
              <label>{t('userStatus')}</label>
              <select
                value={editActive ? 'active' : 'inactive'}
                onChange={e => setEditActive(e.target.value === 'active')}
              >
                <option value="active">{t('userActive')}</option>
                <option value="inactive">{t('userInactive')}</option>
              </select>
            </div>
            <div className="form-field">
              <label>{t('userNewPassword')}</label>
              <input
                type="text"
                value={editPass}
                onChange={e => setEditPass(e.target.value)}
                placeholder={t('userNewPasswordPlaceholder')}
              />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setEditingUser(null)}>
              {t('cancel')}
            </button>
            <button className="btn btn-primary" onClick={handleSaveEdit}>
              💾 {t('saveUser')}
            </button>
          </div>
        </div>
      )}

      <div className="user-list">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3>📋 {t('userList')}</h3>
          {users.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={toggleSelectAll}>
              <input
                type="checkbox"
                checked={selectedIds.length > 0 && selectedIds.length === users.filter(u => u.employeeNumber !== user.employeeNumber).length}
                readOnly
              />
              <span style={{ fontSize: '14px', fontWeight: '500' }}>{t('selectAll')}</span>
            </div>
          )}
        </div>
        {users.length === 0 ? (
          <div className="empty-mini"><p>{t('userNoUsers')}</p></div>
        ) : (
          <div className="user-cards">
            {users.map(u => (
              <div key={u.id} className={`user-card ${selectedIds.includes(u.id) ? 'selected' : ''}`} onClick={() => toggleSelect(u.id)}>
                <div className="user-card-info">
                  {u.employeeNumber !== user.employeeNumber && (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(u.id)}
                      onChange={() => {}} // Handled by card click
                      style={{ marginRight: '8px' }}
                    />
                  )}
                  <div className="user-card-avatar">
                    {u.employeeNumber === user.employeeNumber ? '⭐' : (u.role === 'admin' ? '🛡️' : '👤')}
                  </div>
                  <div className="user-card-body">
                    <div className="user-card-name">
                      <strong>{u.name || u.employeeNumber}</strong>
                      {u.employeeNumber === user.employeeNumber && (
                        <span className="badge badge-me">{t('userYou')}</span>
                      )}
                    </div>
                    <div className="user-card-meta">
                      <span>#{u.employeeNumber}</span>
                      <span className={`badge badge-${u.role}`}>{u.role === 'admin' ? t('userRoleAdmin') : t('userRoleUser')}</span>
                      <span className={`badge badge-${u.isActive ? 'active' : 'inactive'}`}>
                        {u.isActive ? t('userActive') : t('userInactive')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="user-card-actions">
                  <button className="icon-btn" onClick={() => handleEdit(u)} title={t('editUser')}>
                    ✏️
                  </button>
                  {u.employeeNumber !== user.employeeNumber && (
                    <button
                      className="icon-btn danger"
                      onClick={() => handleDelete(u)}
                      title={t('deleteUser')}
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
