import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { CategoryBadge, Stat } from '../../components/ui';

export default function Painel() {
  const [d, setD] = useState(null);
  useEffect(() => {
    const load = () => api('/reports/summary').then(setD).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  if (!d) return <div className="text-slate-400">Carregando…</div>;
  const pct = d.inscritos ? Math.round((d.credenciados / d.inscritos) * 100) : 0;
  const maxHora = Math.max(1, ...d.porHora.map((h) => h.n));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Painel do evento</h1>
        <span className="text-xs text-slate-400">Atualiza a cada 15 s</span>
      </div>

      {d.inscritos === 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-l-4 border-brand-600 p-4">
          <span>Nenhum inscrito ainda. Comece importando a planilha de inscrições.</span>
          <Link to="/admin/importar" className="btn-primary">Importar planilha</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Inscritos" value={d.inscritos} sub={`${d.balcao} cadastrados no balcão`} />
        <Stat label="Credenciados" value={d.credenciados} sub={`${pct}% dos inscritos`} tone="text-brand-700" />
        <Stat label="Etiquetas impressas" value={d.impressoes} sub={`${d.reimpressoes} reimpressões`} />
        <Stat label="Contatos trocados" value={d.contatos} sub={`${d.leituras} leituras de acesso`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-bold">Por categoria</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-1">Categoria</th><th className="text-right">Inscritos</th><th className="text-right">Credenciados</th></tr></thead>
            <tbody>
              {d.porCategoria.map((c) => (
                <tr key={c.categoria} className="border-t border-slate-100">
                  <td className="py-2"><CategoryBadge c={c.categoria} /></td>
                  <td className="text-right tabular-nums">{c.total}</td>
                  <td className="text-right tabular-nums">{c.credenciados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 font-bold">Ocupação dos espaços agora</h2>
          {d.areas.length === 0 ? <p className="text-sm text-slate-500">Nenhum espaço cadastrado. <Link className="text-brand-700 underline" to="/admin/espacos">Cadastrar espaços</Link></p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-1">Espaço</th><th className="text-right">Presentes</th><th className="text-right">Pessoas</th><th className="text-right">Leituras</th></tr></thead>
              <tbody>
                {d.areas.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="py-2 font-medium">{a.nome}</td>
                    <td className="text-right text-lg font-bold tabular-nums text-brand-700">{a.presentes}</td>
                    <td className="text-right tabular-nums">{a.pessoas}</td>
                    <td className="text-right tabular-nums">{a.leituras}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {d.porHora.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 font-bold">Credenciamentos por hora</h2>
          <div className="space-y-1.5">
            {d.porHora.map((h) => (
              <div key={h.hora} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-slate-500">{h.hora.slice(8, 10)}/{h.hora.slice(5, 7)} {h.hora.slice(11)}h</span>
                <div className="h-5 rounded bg-brand-600" style={{ width: `${(h.n / maxHora) * 100}%`, minWidth: 4 }} />
                <span className="tabular-nums">{h.n}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
