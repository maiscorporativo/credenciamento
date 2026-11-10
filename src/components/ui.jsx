import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api, CATEGORY_COLORS } from '../lib/api';
import { renderLabel } from '../lib/label';
import { useAuth } from '../lib/auth';

export function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`flex max-h-[95vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-4xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn-ghost p-1" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export const CategoryBadge = ({ c }) => <span className={`badge ${CATEGORY_COLORS[c] || 'bg-slate-100 text-slate-700'}`}>{c}</span>;

export function Stat({ label, value, sub, tone = 'text-slate-900' }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-extrabold tabular-nums ${tone}`}>{value ?? '—'}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** Modelo de etiqueta carregado uma vez e compartilhado */
let labelCache = null;
export function useLabelTemplate() {
  const [tpl, setTpl] = useState(labelCache);
  useEffect(() => {
    if (labelCache) return;
    api('/settings/label').then((t) => { labelCache = t; setTpl(t); });
  }, []);
  return [tpl, (t) => { labelCache = t; setTpl(t); }];
}

/** Pré-visualização em escala da etiqueta, com o mesmo HTML usado na impressão */
export function LabelPreview({ tpl, participant, scale = 1, className = '' }) {
  const { meta } = useAuth();
  const [html, setHtml] = useState('');
  useEffect(() => {
    let alive = true;
    if (tpl && participant) renderLabel(tpl, participant, meta.event).then((h) => alive && setHtml(h));
    return () => { alive = false; };
  }, [tpl, participant, meta.event]);
  if (!tpl) return null;
  return (
    <div className={className} style={{ width: `${tpl.width * scale}mm`, height: `${tpl.height * scale}mm` }}>
      <div style={{ width: `${tpl.width}mm`, height: `${tpl.height}mm`, transform: `scale(${scale})`, transformOrigin: '0 0' }} className="shadow-md ring-1 ring-slate-300" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

/** Interruptor grande "EXPOSITOR" — o check pedido para o balcão */
const QUICK_CATS = [
  { c: 'EXPOSITOR', label: 'É expositor', on: 'border-amber-500 bg-amber-50', box: 'border-amber-500 bg-amber-500' },
  { c: 'ORGANIZADOR', label: 'É organizador', on: 'border-violet-500 bg-violet-50', box: 'border-violet-500 bg-violet-500' },
  { c: 'PALESTRANTE', label: 'É palestrante', on: 'border-rose-500 bg-rose-50', box: 'border-rose-500 bg-rose-500' },
  { c: 'IMPRENSA', label: 'É imprensa', on: 'border-slate-600 bg-slate-100', box: 'border-slate-600 bg-slate-600' },
];

/** Marcações rápidas de categoria: marcar uma desmarca as outras; desmarcar volta para VISITANTE */
export function ExhibitorToggle({ categoria, onChange, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {QUICK_CATS.map((q) => {
        const on = categoria === q.c;
        return (
          <button key={q.c} type="button" disabled={disabled} onClick={() => onChange(on ? 'VISITANTE' : q.c)}
            className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-3 text-left transition ${on ? q.on : 'border-slate-200 bg-white hover:border-slate-300'}`}>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 text-sm font-black ${on ? `${q.box} text-white` : 'border-slate-300'}`}>{on ? '✓' : ''}</span>
            <span className="min-w-0">
              <span className="block font-bold">{q.label}</span>
              <span className="block text-xs text-slate-500">{on ? `Etiqueta: ${q.c}` : `Imprime ${q.c}`}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Formulário de cadastro/edição de participante */
export function ParticipantForm({ value, onChange, admin, areas = [] }) {
  const { meta } = useAuth();
  const set = (k) => (e) => onChange({ ...value, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e });
  const F = ({ k, label, className = '', ...rest }) => (
    <div className={className}>
      <label className="label">{label}</label>
      <input className="input" value={value[k] ?? ''} onChange={set(k)} {...rest} />
    </div>
  );
  const req = value.id ? '' : ' *'; // obrigatórios no novo cadastro
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {F({ k: 'nome', label: 'Nome *', required: true })}
      {F({ k: 'sobrenome', label: 'Sobrenome' })}
      {F({ k: 'nome_cracha', label: 'Nome impresso no crachá', className: 'sm:col-span-2', placeholder: 'Ex.: Viviane Pinatti' })}
      {F({ k: 'empresa', label: 'Empresa / propriedade', className: 'sm:col-span-2' })}
      {F({ k: 'cargo', label: 'Cargo' })}
      {F({ k: 'cidade', label: 'Cidade' })}
      {F({ k: 'email', label: `E-mail${req}`, type: 'email', required: !value.id })}
      {F({ k: 'whatsapp', label: `WhatsApp / telefone${req}`, inputMode: 'tel', required: !value.id })}
      {F({ k: 'cpf', label: `CPF (senha de acesso)${req}`, inputMode: 'numeric', required: !value.id })}
      <div>
        <label className="label">Categoria</label>
        <select className="input" value={value.categoria || 'VISITANTE'} onChange={set('categoria')}>
          {meta.categorias.map((c) => <option key={c}>{c}</option>)}
          {value.categoria && !meta.categorias.includes(value.categoria) && <option>{value.categoria}</option>}
        </select>
      </div>
      <div className="sm:col-span-2"><ExhibitorToggle categoria={value.categoria} onChange={set('categoria')} /></div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={!!value.consentimento} onChange={set('consentimento')} />
        Autoriza compartilhar e-mail e WhatsApp com quem escanear o crachá
      </label>
      {admin && (
        <>
          <div>
            <label className="label">Perfil de acesso</label>
            <select className="input" value={value.role || 'participante'} onChange={set('role')}>
              <option value="participante">Participante (crachá + networking)</option>
              <option value="scanner">Leitor de acesso (bipa entradas)</option>
              <option value="balcao">Balcão (impressão + bipa qualquer espaço)</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <div>
            <label className="label">Espaço do leitor</label>
            <select className="input" value={value.area_id || ''} onChange={set('area_id')} disabled={value.role !== 'scanner'}>
              <option value="">—</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>
        </>
      )}
      <div className="sm:col-span-2">
        <label className="label">Observações</label>
        <textarea className="input" rows={2} value={value.observacoes ?? ''} onChange={set('observacoes')} />
      </div>
    </div>
  );
}

/** Feedback sonoro/vibração para leituras */
let audio;
export function beep(ok = true) {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(); const g = audio.createGain();
    o.frequency.value = ok ? 1046 : 220; o.type = ok ? 'sine' : 'square';
    g.gain.value = 0.15; o.connect(g); g.connect(audio.destination);
    o.start(); o.stop(audio.currentTime + (ok ? 0.12 : 0.35));
    navigator.vibrate?.(ok ? 60 : [100, 60, 100]);
  } catch { /* sem áudio */ }
}
