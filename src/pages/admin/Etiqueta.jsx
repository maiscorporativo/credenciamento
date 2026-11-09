import { useEffect, useRef, useState } from 'react';
import { Barcode, Copy, Eye, EyeOff, Plus, Printer, QrCode, RotateCcw, Ruler, Save, Square, Trash2, Type } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { FIELDS, SAMPLE, SIZE_PRESETS, printCalibration, printLabels } from '../../lib/label';
import { LabelPreview, useLabelTemplate } from '../../components/ui';
import { DEFAULT_LABEL } from '../../../server/defaults.js';

const MM = 96 / 25.4;
const FONTS = ['Arial, Helvetica, sans-serif', '"Arial Narrow", Arial, sans-serif', 'Verdana, sans-serif', 'Tahoma, sans-serif', '"Trebuchet MS", sans-serif', 'Georgia, serif', '"Courier New", monospace'];
const SAMPLES = {
  visitante: SAMPLE,
  expositor: { ...SAMPLE, nome: 'João Carlos', sobrenome: 'Ferreira', nome_cracha: 'João Ferreira', empresa: 'Agropecuária Boa Vista Ltda', categoria: 'EXPOSITOR' },
  longo: { ...SAMPLE, nome: 'Maria Aparecida', sobrenome: 'de Albuquerque Cavalcanti', nome_cracha: 'Maria Aparecida Cavalcanti', empresa: 'Cooperativa dos Produtores Rurais da Alta Paulista', categoria: 'PALESTRANTE' },
};
const round = (n) => Math.round(n * 2) / 2;
const uid = () => Math.random().toString(36).slice(2, 8);

function Num({ label, value, onChange, step = 0.5, min }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type="number" className="input" step={step} min={min} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export default function Etiqueta() {
  const { meta, reloadMeta } = useAuth();
  const [saved, setSaved] = useLabelTemplate();
  const [tpl, setTpl] = useState(null);
  const [selId, setSelId] = useState(null);
  const [sample, setSample] = useState('visitante');
  const [scale, setScale] = useState(2);
  const [badge, setBadge] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [event, setEvent] = useState(meta.event);
  const drag = useRef(null);

  useEffect(() => { if (saved && !tpl) setTpl(structuredClone(saved)); }, [saved, tpl]);
  useEffect(() => setEvent(meta.event), [meta.event]);
  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  if (!tpl) return <div className="text-slate-400">Carregando…</div>;

  const update = (patch) => { setTpl((t) => ({ ...t, ...patch })); setDirty(true); };
  const updateEl = (id, patch) => { setTpl((t) => ({ ...t, elements: t.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) })); setDirty(true); };
  const sel = tpl.elements.find((e) => e.id === selId);
  const person = SAMPLES[sample];

  const add = (type) => {
    const base = { id: uid(), type, x: 2, y: 2 };
    const el = {
      field: { ...base, field: 'empresa', w: 40, h: 8, fontSize: 12, bold: false, align: 'left', uppercase: true, autoFit: true, lines: 1 },
      text: { ...base, text: 'TEXTO', w: 30, h: 6, fontSize: 10, bold: true, align: 'left', uppercase: false, autoFit: true, lines: 1 },
      qrcode: { ...base, size: 18 },
      barcode: { ...base, w: 40, h: 10, showText: false },
      box: { ...base, w: 20, h: 10, border: 0.4, radius: 1, fill: false },
    }[type];
    update({ elements: [...tpl.elements, el] });
    setSelId(el.id);
  };
  const remove = (id) => { update({ elements: tpl.elements.filter((e) => e.id !== id) }); setSelId(null); };
  const duplicate = (el) => { const c = { ...el, id: uid(), x: el.x + 2, y: el.y + 2 }; update({ elements: [...tpl.elements, c] }); setSelId(c.id); };

  const onDown = (e, el, mode) => {
    e.stopPropagation(); e.preventDefault();
    setSelId(el.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, el: { ...el } };
  };
  const onMove = (e) => {
    const d = drag.current; if (!d) return;
    const dx = (e.clientX - d.sx) / (MM * scale);
    const dy = (e.clientY - d.sy) / (MM * scale);
    if (d.mode === 'move') updateEl(d.el.id, { x: round(d.el.x + dx), y: round(d.el.y + dy) });
    else if (d.el.type === 'qrcode') updateEl(d.el.id, { size: Math.max(5, round(d.el.size + Math.max(dx, dy))) });
    else updateEl(d.el.id, { w: Math.max(3, round(d.el.w + dx)), h: Math.max(2, round(d.el.h + dy)) });
  };
  const onUp = () => { drag.current = null; };

  const onKey = (e) => {
    if (!sel || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const step = e.shiftKey ? 2 : 0.5;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) { e.preventDefault(); updateEl(sel.id, { x: round(sel.x + mv[0]), y: round(sel.y + mv[1]) }); }
    if (e.key === 'Delete') remove(sel.id);
  };

  const saveAll = async () => {
    await api('/settings/label', { method: 'PUT', body: tpl });
    await api('/settings/event', { method: 'PUT', body: event });
    setSaved(structuredClone(tpl)); setDirty(false); reloadMeta();
  };

  const elW = (el) => (el.type === 'qrcode' ? el.size : el.w);
  const elH = (el) => (el.type === 'qrcode' ? el.size : el.h);
  const elName = (el) => ({ field: FIELDS.find((f) => f.value === el.field)?.label, text: `Texto: ${el.text}`, qrcode: 'QR Code', barcode: 'Código de barras', box: 'Moldura / retângulo' }[el.type]);

  // posição sugerida da etiqueta no crachá 10×15 cm (área livre entre o logo e os parceiros)
  const BADGE = { w: 100, h: 150, labelTop: 60 };

  return (
    <div className="space-y-4" tabIndex={-1} onKeyDown={onKey}>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-extrabold">Etiqueta do crachá</h1>
        <button className="btn-secondary" onClick={() => printCalibration(tpl)}><Ruler size={16} /> Imprimir calibração</button>
        <button className="btn-secondary" onClick={() => printLabels(tpl, [person], event)}><Printer size={16} /> Imprimir teste</button>
        <button className="btn-primary" onClick={saveAll} disabled={!dirty && event === meta.event}><Save size={16} /> {dirty ? 'Salvar alterações' : 'Salvo'}</button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ---------- área de desenho ---------- */}
        <div className="card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-slate-500">Exemplo:</span>
            {Object.keys(SAMPLES).map((k) => (
              <button key={k} className={`rounded-full px-3 py-1 ${sample === k ? 'bg-brand-700 text-white' : 'bg-slate-100'}`} onClick={() => setSample(k)}>
                {{ visitante: 'Visitante', expositor: 'Expositor', longo: 'Nome longo' }[k]}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-2 text-slate-500">
              Zoom <input type="range" min="1" max="5" step="0.25" value={scale} onChange={(e) => setScale(Number(e.target.value))} />
            </span>
            <label className="flex items-center gap-1"><input type="checkbox" className="accent-brand-700" checked={badge} onChange={(e) => setBadge(e.target.checked)} /> Ver no crachá</label>
          </div>

          <div className="overflow-auto rounded-lg bg-[repeating-conic-gradient(#e2e8f0_0%_25%,#f1f5f9_0%_50%)] bg-[length:16px_16px] p-8">
            {badge ? (
              <div className="relative mx-auto rounded-lg shadow-xl" style={{ width: `${BADGE.w * scale * 0.5}mm`, height: `${BADGE.h * scale * 0.5}mm`, background: 'linear-gradient(180deg,#06140c 0%,#0d3b1d 35%,#167a35 70%,#0b3d1f 100%)' }}>
                <div className="absolute left-1/2 -translate-x-1/2 text-center font-black leading-none text-lime" style={{ top: `${14 * scale * 0.5}mm`, fontSize: `${12 * scale * 0.5}mm` }}>SIRAN<br /><span className="text-brand-500">SUMMIT</span></div>
                <div className="absolute left-1/2 -translate-x-1/2" style={{ top: `${BADGE.labelTop * scale * 0.5}mm` }}>
                  <LabelPreview tpl={tpl} participant={person} scale={scale * 0.5} />
                </div>
                <div className="absolute inset-x-0 text-center text-white/70" style={{ bottom: `${8 * scale * 0.5}mm`, fontSize: `${3 * scale * 0.5}mm` }}>PARCEIROS · CURADORIA · ORGANIZAÇÃO</div>
              </div>
            ) : (
              <div className="relative mx-auto w-fit" onPointerMove={onMove} onPointerUp={onUp} onPointerDown={() => setSelId(null)}>
                <LabelPreview tpl={tpl} participant={person} scale={scale} />
                {tpl.elements.map((el) => !el.hidden && (
                  <div key={el.id} onPointerDown={(e) => onDown(e, el, 'move')}
                    className={`absolute cursor-move touch-none ${selId === el.id ? 'outline outline-2 outline-brand-600' : 'outline-dashed outline-1 outline-sky-400/60 hover:outline-sky-500'}`}
                    style={{ left: `${el.x * scale}mm`, top: `${el.y * scale}mm`, width: `${elW(el) * scale}mm`, height: `${elH(el) * scale}mm` }}>
                    {selId === el.id && (
                      <div onPointerDown={(e) => onDown(e, el, 'resize')} className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm bg-brand-600" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">Arraste para mover, puxe o quadradinho verde para redimensionar. Setas do teclado movem 0,5 mm (Shift: 2 mm). Linhas azuis tracejadas só aparecem aqui, não na impressão.</p>

          <div className="mt-4">
            <div className="mb-2 flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => add('field')}><Plus size={14} /> Campo</button>
              <button className="btn-secondary" onClick={() => add('text')}><Type size={14} /> Texto fixo</button>
              <button className="btn-secondary" onClick={() => add('qrcode')}><QrCode size={14} /> QR Code</button>
              <button className="btn-secondary" onClick={() => add('barcode')}><Barcode size={14} /> Código de barras</button>
              <button className="btn-secondary" onClick={() => add('box')}><Square size={14} /> Moldura</button>
            </div>
            <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
              {tpl.elements.map((el) => (
                <li key={el.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${selId === el.id ? 'bg-brand-50' : ''}`}>
                  <button className="flex-1 text-left" onClick={() => setSelId(el.id)}>{elName(el)}{el.onlyCategories?.length ? <span className="ml-2 text-xs text-slate-500">(só {el.onlyCategories.join(', ')})</span> : ''}</button>
                  <button className="btn-ghost p-1" onClick={() => updateEl(el.id, { hidden: !el.hidden })} aria-label="Mostrar/ocultar">{el.hidden ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  <button className="btn-ghost p-1" onClick={() => duplicate(el)} aria-label="Duplicar"><Copy size={16} /></button>
                  <button className="btn-ghost p-1 text-red-600" onClick={() => remove(el.id)} aria-label="Remover"><Trash2 size={16} /></button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ---------- propriedades ---------- */}
        <div className="space-y-4">
          <div className="card space-y-3 p-4">
            <h2 className="font-bold">Tamanho da etiqueta</h2>
            <div className="flex flex-wrap gap-1.5">
              {SIZE_PRESETS.map(([w, h]) => (
                <button key={`${w}x${h}`} onClick={() => update({ width: w, height: h })}
                  className={`rounded-md px-2 py-1 text-xs font-semibold ${tpl.width === w && tpl.height === h ? 'bg-brand-700 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>{w}×{h}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Num label="Largura (mm)" value={tpl.width} onChange={(v) => update({ width: v })} min={10} />
              <Num label="Altura (mm)" value={tpl.height} onChange={(v) => update({ height: v })} min={10} />
              <Num label="Ajuste horizontal (mm)" value={tpl.offsetX} onChange={(v) => update({ offsetX: v })} />
              <Num label="Ajuste vertical (mm)" value={tpl.offsetY} onChange={(v) => update({ offsetY: v })} />
              <div>
                <label className="label">Rotação</label>
                <select className="input" value={tpl.rotate || 0} onChange={(e) => update({ rotate: Number(e.target.value) })}>
                  {[0, 90, 180, 270].map((r) => <option key={r} value={r}>{r}°</option>)}
                </select>
              </div>
              <div>
                <label className="label">Fonte</label>
                <select className="input" value={tpl.fontFamily} onChange={(e) => update({ fontFamily: e.target.value })}>
                  {FONTS.map((f) => <option key={f} value={f}>{f.split(',')[0].replace(/"/g, '')}</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-500">Ainda sem a medida exata? Imprima a <b>calibração</b>: ela sai com borda e régua em mm. Ajuste largura/altura até a borda coincidir com a etiqueta, e use os ajustes horizontal/vertical se sair deslocada.</p>
            <button className="btn-ghost text-xs" onClick={() => { if (confirm('Restaurar o modelo padrão? As alterações não salvas serão perdidas.')) { setTpl(structuredClone(DEFAULT_LABEL)); setDirty(true); } }}><RotateCcw size={14} /> Restaurar modelo padrão</button>
          </div>

          {sel && (
            <div className="card space-y-3 p-4">
              <h2 className="font-bold">{elName(sel)}</h2>
              {sel.type === 'field' && (
                <div>
                  <label className="label">Campo</label>
                  <select className="input" value={sel.field} onChange={(e) => updateEl(sel.id, { field: e.target.value })}>
                    {FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              )}
              {sel.type === 'text' && (
                <div><label className="label">Texto</label><input className="input" value={sel.text} onChange={(e) => updateEl(sel.id, { text: e.target.value })} /></div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Num label="X (mm)" value={sel.x} onChange={(v) => updateEl(sel.id, { x: v })} />
                <Num label="Y (mm)" value={sel.y} onChange={(v) => updateEl(sel.id, { y: v })} />
                {sel.type === 'qrcode' ? (
                  <Num label="Tamanho (mm)" value={sel.size} onChange={(v) => updateEl(sel.id, { size: v })} min={5} />
                ) : (
                  <>
                    <Num label="Largura (mm)" value={sel.w} onChange={(v) => updateEl(sel.id, { w: v })} />
                    <Num label="Altura (mm)" value={sel.h} onChange={(v) => updateEl(sel.id, { h: v })} />
                  </>
                )}
              </div>
              {(sel.type === 'field' || sel.type === 'text') && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Num label="Fonte (pt)" value={sel.fontSize} onChange={(v) => updateEl(sel.id, { fontSize: v })} min={4} />
                    <Num label="Máx. linhas" value={sel.lines || 1} step={1} min={1} onChange={(v) => updateEl(sel.id, { lines: Math.max(1, v) })} />
                    <div>
                      <label className="label">Alinhamento</label>
                      <select className="input" value={sel.align} onChange={(e) => updateEl(sel.id, { align: e.target.value })}>
                        <option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Vertical</label>
                      <select className="input" value={sel.valign || 'middle'} onChange={(e) => updateEl(sel.id, { valign: e.target.value })}>
                        <option value="top">Topo</option><option value="middle">Meio</option><option value="bottom">Base</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[['bold', 'Negrito'], ['uppercase', 'MAIÚSCULAS'], ['autoFit', 'Encolher p/ caber'], ['invert', 'Fundo preto']].map(([k, l]) => (
                      <label key={k} className="flex items-center gap-2"><input type="checkbox" className="accent-brand-700" checked={!!sel[k]} onChange={(e) => updateEl(sel.id, { [k]: e.target.checked })} /> {l}</label>
                    ))}
                  </div>
                </>
              )}
              {sel.type === 'barcode' && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-700" checked={!!sel.showText} onChange={(e) => updateEl(sel.id, { showText: e.target.checked })} /> Mostrar código abaixo das barras</label>
              )}
              {sel.type === 'box' && (
                <div className="grid grid-cols-2 gap-3">
                  <Num label="Espessura (mm)" value={sel.border} step={0.1} onChange={(v) => updateEl(sel.id, { border: v })} />
                  <Num label="Cantos (mm)" value={sel.radius} onChange={(v) => updateEl(sel.id, { radius: v })} />
                  <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-700" checked={!!sel.fill} onChange={(e) => updateEl(sel.id, { fill: e.target.checked })} /> Preenchido (preto)</label>
                </div>
              )}
              <div>
                <label className="label">Mostrar somente para</label>
                <div className="flex flex-wrap gap-1.5">
                  {meta.categorias.map((c) => {
                    const on = sel.onlyCategories?.includes(c);
                    return <button key={c} onClick={() => updateEl(sel.id, { onlyCategories: on ? sel.onlyCategories.filter((x) => x !== c) : [...(sel.onlyCategories || []), c] })}
                      className={`rounded-md px-2 py-1 text-xs ${on ? 'bg-brand-700 text-white' : 'bg-slate-100'}`}>{c}</button>;
                  })}
                </div>
                <p className="mt-1 text-xs text-slate-500">Nenhuma marcada = aparece para todos. Útil p/ ex. uma faixa "EXPOSITOR" só nos expositores.</p>
              </div>
            </div>
          )}

          <div className="card space-y-3 p-4">
            <h2 className="font-bold">Evento e QR Code</h2>
            <div><label className="label">Nome do evento</label><input className="input" value={event.nome || ''} onChange={(e) => setEvent({ ...event, nome: e.target.value })} /></div>
            <div><label className="label">Edição</label><input className="input" value={event.edicao || ''} onChange={(e) => setEvent({ ...event, edicao: e.target.value })} /></div>
            <div>
              <label className="label">Endereço público do sistema (opcional)</label>
              <input className="input" placeholder="https://credenciamento.siransummit.com" value={event.qrBaseUrl || ''} onChange={(e) => setEvent({ ...event, qrBaseUrl: e.target.value })} />
              <p className="mt-1 text-xs text-slate-500">Preenchido, o QR vira um link: lido pela câmera comum do celular, já abre o sistema na tela de salvar contato. Vazio, o QR contém só o código.</p>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-700" checked={event.autoPrint !== false} onChange={(e) => setEvent({ ...event, autoPrint: e.target.checked })} /> Imprimir automaticamente ao cadastrar no balcão</label>
          </div>
        </div>
      </div>
    </div>
  );
}
