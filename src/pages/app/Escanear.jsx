import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MessageCircle, ScanLine } from 'lucide-react';
import { api, fullName } from '../../lib/api';
import QrScanner from '../../components/QrScanner';
import { CategoryBadge, beep } from '../../components/ui';

export const waLink = (n) => { const d = String(n || '').replace(/\D/g, ''); return d ? `https://wa.me/${d.length <= 11 ? '55' + d : d}` : null; };

/** Mostra o resultado de salvar um contato (usado também pelo link /c/:code) */
export function ContactCard({ result, onNext }) {
  const [nota, setNota] = useState('');
  const [saved, setSaved] = useState(false);
  const c = result.contato;
  const saveNote = async () => {
    const list = await api('/contacts');
    const row = list.find((x) => x.id === c.id);
    if (row) { await api(`/contacts/${row.contact_row}`, { method: 'PUT', body: { nota } }); setSaved(true); }
  };
  return (
    <div className="card space-y-3 p-5">
      <div className={`text-sm font-bold ${result.novo ? 'text-brand-700' : 'text-slate-500'}`}>{result.novo ? '✔ Contato salvo!' : 'Este contato já estava na sua lista'}</div>
      <div>
        <div className="text-xl font-extrabold">{fullName(c)}</div>
        <div className="text-slate-600">{[c.cargo, c.empresa].filter(Boolean).join(' · ')}</div>
        <div className="mt-1"><CategoryBadge c={c.categoria} /></div>
      </div>
      {c.consentimento ? (
        <div className="flex flex-wrap gap-2">
          {c.whatsapp && <a className="btn-secondary" href={waLink(c.whatsapp)} target="_blank" rel="noreferrer"><MessageCircle size={16} /> {c.whatsapp}</a>}
          {c.email && <a className="btn-secondary" href={`mailto:${c.email}`}><Mail size={16} /> {c.email}</a>}
        </div>
      ) : <p className="text-sm text-slate-500">Esta pessoa optou por não compartilhar e-mail e telefone.</p>}
      <div>
        <label className="label">Anotação (só você vê)</label>
        <textarea className="input" rows={2} placeholder="Ex.: interessado em ordenhadeira, retornar em dezembro" value={nota} onChange={(e) => { setNota(e.target.value); setSaved(false); }} />
        {nota && <button className="btn-ghost mt-1 text-xs" onClick={saveNote}>{saved ? 'Anotação salva ✔' : 'Salvar anotação'}</button>}
      </div>
      {onNext && <button className="btn-primary w-full py-3" onClick={onNext}><ScanLine size={18} /> Escanear próximo</button>}
    </div>
  );
}

export default function Escanear() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onScan = async (text) => {
    if (busy || result) return;
    setBusy(true); setError('');
    try { const r = await api('/contacts', { method: 'POST', body: { code: text } }); beep(true); setResult(r); }
    catch (e) { beep(false); setError(e.message); setTimeout(() => setError(''), 3000); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Escanear crachá</h1>
        <p className="text-sm text-slate-500">Aponte para o QR Code do crachá de um visitante ou expositor para salvar o contato. <Link to="/app/contatos" className="text-brand-700 underline">Ver meus contatos</Link></p>
      </div>
      {!result && <QrScanner onScan={onScan} paused={busy} />}
      {error && <div className="rounded-lg bg-red-50 p-3 text-center text-sm font-semibold text-red-700">{error}</div>}
      {result && <ContactCard result={result} onNext={() => setResult(null)} />}
    </div>
  );
}
