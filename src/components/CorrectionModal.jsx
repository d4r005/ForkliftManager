import { useState, useEffect } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

// Modal para registrar/ver la corrección de un punto INS de un checklist.
// canManage (admin/supervisor) permite registrar la corrección y verificarla;
// los operadores solo la consultan.
export default function CorrectionModal({ checklistId, item, onClose, onSaved, canManage }) {
  const { t } = useLang();
  const { user } = useAuth();

  const [correction, setCorrection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    corrected_by: user?.name || '',
    corrected_at: new Date().toISOString().slice(0, 10),
    correction_notes: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const { data, error: dbError } = await supabase
          .from('checklist_corrections')
          .select('*')
          .eq('checklist_id', checklistId)
          .eq('item_id', item.id)
          .maybeSingle();

        if (dbError) throw dbError;
        if (data) {
          setCorrection(data);
          setForm({
            corrected_by: data.corrected_by || user?.name || '',
            corrected_at: data.corrected_at || new Date().toISOString().slice(0, 10),
            correction_notes: data.correction_notes || '',
          });
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [checklistId, item.id]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        checklist_id: checklistId,
        item_id: item.id,
        corrected_by: form.corrected_by,
        corrected_at: form.corrected_at,
        correction_notes: form.correction_notes || null,
      };
      const { data, error: dbError } = await supabase
        .from('checklist_corrections')
        .upsert(payload, { onConflict: 'checklist_id,item_id' })
        .select()
        .single();
      if (dbError) throw dbError;
      setCorrection(data);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    setSaving(true);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error: dbError } = await supabase
        .from('checklist_corrections')
        .update({ verified_by: user?.name || 'verificado', verified_at: today })
        .eq('checklist_id', checklistId)
        .eq('item_id', item.id)
        .select()
        .single();
      if (dbError) throw dbError;
      setCorrection(data);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('es-MX') : '—');

  return (
    <div className="correction-overlay" onClick={onClose}>
      <div className="correction-modal" onClick={(e) => e.stopPropagation()}>
        <div className="correction-header">
          <h3>🔧 {t('correctionTitle')}</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="correction-item-info">
          <span className="ei-num">{item.id}</span>
          <span>{item.es}</span>
        </div>

        {loading ? (
          <p style={{ padding: '16px' }}>…</p>
        ) : correction ? (
          <div className="correction-body">
            <p><strong>{t('correctionCorrectedBy')}:</strong> {correction.corrected_by || '—'}</p>
            <p><strong>{t('correctionDate')}:</strong> {fmtDate(correction.corrected_at)}</p>
            <p><strong>{t('correctionNotes')}:</strong> {correction.correction_notes || '—'}</p>
            {correction.verified_by ? (
              <p className="correction-verified">✅ {t('correctionVerifiedBy')} <strong>{correction.verified_by}</strong> ({fmtDate(correction.verified_at)})</p>
            ) : (
              <p className="correction-pending-verify">⏳ {t('correctionNotVerified')}</p>
            )}
            {canManage && !correction.verified_by && (
              <button className="btn btn-primary" onClick={handleVerify} disabled={saving}>
                ✅ {t('correctionMarkVerified')}
              </button>
            )}
          </div>
        ) : canManage ? (
          <div className="correction-body">
            <p className="correction-pending-verify">⚠️ {t('correctionNone')}</p>
            <div className="form-field">
              <label>{t('correctionCorrectedBy')}</label>
              <input
                type="text"
                value={form.corrected_by}
                onChange={(e) => setForm(p => ({ ...p, corrected_by: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label>{t('correctionDate')}</label>
              <input
                type="date"
                value={form.corrected_at}
                onChange={(e) => setForm(p => ({ ...p, corrected_at: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label>{t('correctionNotes')}</label>
              <textarea
                rows={3}
                value={form.correction_notes}
                onChange={(e) => setForm(p => ({ ...p, correction_notes: e.target.value }))}
              />
            </div>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              💾 {t('correctionSave')}
            </button>
          </div>
        ) : (
          <div className="correction-body">
            <p className="correction-pending-verify">⚠️ {t('correctionNone')}</p>
          </div>
        )}

        {error && <div className="alert alert-error">⚠️ {error}</div>}
      </div>
    </div>
  );
}
