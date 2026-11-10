import { useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { api } from '../../lib/api';

const TARGETS = [
  { key: 'ext_id', label: 'ID da inscrição', guess: ['id'] },
  { key: 'nome', label: 'Nome *', guess: ['nome', 'primeiro nome', 'first name', 'name'] },
  { key: 'sobrenome', label: 'Sobrenome', guess: ['sobrenome', 'last name', 'ultimo nome'] },
  { key: 'email', label: 'E-mail', guess: ['e-mail', 'email'] },
  { key: 'whatsapp', label: 'WhatsApp / telefone', guess: ['whatsapp', 'celular', 'telefone', 'fone'] },
  { key: 'cpf', label: 'CPF', guess: ['cpf'] },
  { key: 'empresa', label: 'Empresa', guess: ['empresa', 'propriedade', 'organizacao', 'instituicao'] },
  { key: 'cargo', label: 'Cargo', guess: ['cargo', 'funcao'] },
  { key: 'cidade', label: 'Cidade', guess: ['cidade', 'municipio'] },
  { key: 'categoria', label: 'Categoria', guess: ['categoria', 'tipo', 'perfil'] },
  { key: 'observacoes', label: 'Observações', guess: ['observ', 'grupo', 'obs'] },
  { key: 'consentimento', label: 'Autoriza compartilhar dados', guess: ['autorizo', 'compartilhamento', 'consentimento', 'lgpd'] },
];
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export default function Importar() {
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [map, setMap] = useState({});
  const [mode, setMode] = useState('skip');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async (f) => {
    setFile(f); setResult(null);
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await f.arrayBuffer());
    // primeira aba com conteúdo
    const ws = wb.SheetNames.map((n) => wb.Sheets[n]).find((s) => XLSX.utils.sheet_to_json(s, { header: 1 }).length > 1) || wb.Sheets[wb.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    const hdr = (matrix[0] || []).map(String);
    setHeaders(hdr);
    setRows(matrix.slice(1).filter((r) => r.some((c) => String(c).trim())));
    const m = {};
    for (const t of TARGETS) {
      const idx = hdr.findIndex((h) => { const n = norm(h); return t.guess.some((g) => (g.length <= 3 ? n === g : n === g || n.startsWith(g + ' ') || n.includes(g))); });
      // não deixar "nome" capturar "sobrenome"
      if (idx >= 0 && !Object.values(m).includes(idx)) m[t.key] = idx;
    }
    if (m.nome != null && norm(hdr[m.nome]).includes('sobrenome')) delete m.nome;
    setMap(m);
  };

  const mapped = rows.map((r) => Object.fromEntries(Object.entries(map).filter(([, i]) => i !== '' && i != null).map(([k, i]) => [k, r[i]])));

  const send = async () => {
    setBusy(true);
    try { setResult(await api('/import', { method: 'POST', body: { rows: mapped, mode } })); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Importar planilha de inscritos</h1>
      <label className="card flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed border-slate-300 p-8 text-center hover:border-brand-600">
        <FileSpreadsheet size={36} className="text-brand-700" />
        <span className="font-semibold">{file ? file.name : 'Clique para escolher o arquivo .xlsx, .xls ou .csv'}</span>
        <span className="text-sm text-slate-500">Pode reimportar exportações mais novas: quem já existe (mesmo CPF, ID ou e-mail) não é duplicado.</span>
        <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files[0] && load(e.target.files[0])} />
      </label>

      {headers.length > 0 && (
        <>
          <div className="card p-5">
            <h2 className="mb-1 font-bold">Correspondência das colunas</h2>
            <p className="mb-4 text-sm text-slate-500">Detectamos automaticamente; confira e ajuste se necessário. {rows.length} linhas encontradas.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TARGETS.map((t) => (
                <div key={t.key}>
                  <label className="label">{t.label}</label>
                  <select className="input" value={map[t.key] ?? ''} onChange={(e) => setMap({ ...map, [t.key]: e.target.value === '' ? undefined : Number(e.target.value) })}>
                    <option value="">— não importar —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h.length > 60 ? h.slice(0, 60) + '…' : h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">Todos entram como VISITANTE, a menos que a planilha tenha uma coluna de categoria. Expositores podem ser marcados depois, no balcão ou na lista.</p>
          </div>

          <div className="card overflow-x-auto p-5">
            <h2 className="mb-3 font-bold">Prévia (5 primeiras linhas)</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500"><tr>{TARGETS.filter((t) => map[t.key] != null).map((t) => <th key={t.key} className="px-2 py-1">{t.label.replace(' *', '')}</th>)}</tr></thead>
              <tbody>{mapped.slice(0, 5).map((r, i) => <tr key={i} className="border-t border-slate-100">{TARGETS.filter((t) => map[t.key] != null).map((t) => <td key={t.key} className="max-w-48 truncate px-2 py-1.5">{r[t.key]}</td>)}</tr>)}</tbody>
            </table>
          </div>

          <div className="card flex flex-wrap items-center gap-4 p-5">
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={mode === 'skip'} onChange={() => setMode('skip')} className="accent-brand-700" /> Só adicionar novos (manter edições feitas no sistema)</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={mode === 'update'} onChange={() => setMode('update')} className="accent-brand-700" /> Adicionar novos e atualizar dados dos existentes</label>
            <button className="btn-primary ml-auto" onClick={send} disabled={busy || map.nome == null}><Upload size={18} /> {busy ? 'Importando…' : `Importar ${rows.length} linhas`}</button>
          </div>
        </>
      )}

      {result && (
        <div className="card border-l-4 border-brand-600 p-5">
          <h2 className="mb-2 font-bold">Importação concluída</h2>
          <p><b>{result.inseridos}</b> novos · <b>{result.atualizados}</b> atualizados · <b>{result.ignorados}</b> ignorados (já existiam no sistema ou eram inscrições repetidas do mesmo CPF/e-mail na planilha)</p>
          {result.erros.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-red-700">{result.erros.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
