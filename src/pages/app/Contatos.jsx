import { useEffect, useState } from 'react';
import { Download, Mail, MessageCircle, Search, Trash2, UserPlus } from 'lucide-react';
import { api, exportXlsx, fmtDate, fullName } from '../../lib/api';
import { CategoryBadge } from '../../components/ui';
import { waLink } from './Escanear';

function vcard(c) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${c.sobrenome};${c.nome};;;`, `FN:${fullName(c)}`];
  if (c.empresa) lines.push(`ORG:${c.empresa}`);
  if (c.cargo) lines.push(`TITLE:${c.cargo}`);
  if (c.whatsapp) lines.push(`TEL;TYPE=CELL:${c.whatsapp}`);
  if (c.email) lines.push(`EMAIL:${c.email}`);
  if (c.nota) lines.push(`NOTE:${c.nota.replace(/\n/g, '\\n')}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Contatos() {
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const load = () => api('/contacts').then(setList);
  useEffect(() => { load(); }, []);
  if (!list) return <div className="text-slate-400">Carregando…</div>;

  const t = q.toLowerCase();
  const shown = list.filter((c) => !t || [fullName(c), c.empresa, c.email].join(' ').toLowerCase().includes(t));
  const remove = async (c) => { if (confirm(`Remover ${fullName(c)} da sua lista?`)) { await api(`/contacts/${c.contact_row}`, { method: 'DELETE' }); load(); } };
  const editNote = async (c) => {
    const nota = prompt('Anotação', c.nota || '');
    if (nota != null) { await api(`/contacts/${c.contact_row}`, { method: 'PUT', body: { nota } }); load(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="mr-auto text-xl font-extrabold">Meus contatos <span className="font-normal text-slate-400">({list.length})</span></h1>
        {list.length > 0 && <>
          <button className="btn-secondary px-3" onClick={() => exportXlsx(list.map((c) => ({ nome: fullName(c), empresa: c.empresa, cargo: c.cargo, categoria: c.categoria, email: c.email, whatsapp: c.whatsapp, anotacao: c.nota, salvo_em: c.salvo_em })), 'meus-contatos.xlsx', 'Contatos')} aria-label="Exportar Excel"><Download size={16} /></button>
          <button className="btn-secondary px-3" onClick={() => download('contatos.vcf', list.map(vcard).join('\r\n'), 'text/vcard')} aria-label="Exportar para agenda"><UserPlus size={16} /></button>
        </>}
      </div>
      {list.length > 3 && (
        <div className="relative"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      )}
      {list.length === 0 && <div className="card p-6 text-center text-slate-500">Você ainda não salvou contatos. Use a aba <b>Escanear</b> para ler o crachá de outros participantes e expositores.</div>}
      <ul className="space-y-2">
        {shown.map((c) => (
          <li key={c.contact_row} className="card p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-bold">{fullName(c)}</div>
                <div className="truncate text-sm text-slate-600">{[c.cargo, c.empresa].filter(Boolean).join(' · ')}</div>
              </div>
              <CategoryBadge c={c.categoria} />
            </div>
            {c.nota && <p className="mt-2 rounded bg-yellow-50 p-2 text-sm">{c.nota}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-1">
              {c.whatsapp && <a className="btn-secondary px-3 py-1.5" href={waLink(c.whatsapp)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>}
              {c.email && <a className="btn-secondary px-3 py-1.5" href={`mailto:${c.email}`}><Mail size={15} /> E-mail</a>}
              <button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => download(`${c.nome}.vcf`, vcard(c), 'text/vcard')}>+ Agenda</button>
              <button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => editNote(c)}>Anotar</button>
              <span className="ml-auto text-xs text-slate-400">{fmtDate(c.salvo_em)}</span>
              <button className="btn-ghost p-1 text-red-500" onClick={() => remove(c)} aria-label="Remover"><Trash2 size={15} /></button>
            </div>
            {!c.consentimento && <p className="mt-2 text-xs text-slate-400">Não compartilhou e-mail/telefone.</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
