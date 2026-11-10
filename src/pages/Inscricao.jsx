import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { CheckCircle2, LogIn, UserPlus } from 'lucide-react';
import { api, validCpf } from '../lib/api';
import { useAuth } from '../lib/auth';
import { qrContent } from '../lib/label';

// máscaras simples para digitar no celular
const maskCpf = (v) => v.replace(/\D/g, '').slice(0, 11)
  .replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
const maskPhone = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const EMPTY = { nome: '', sobrenome: '', cpf: '', email: '', whatsapp: '', empresa: '', cargo: '', cidade: '', consentimento: true };

function Field({ label, hint, error, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-slate-700">{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default function Inscricao() {
  const { meta, adopt } = useAuth();
  const [f, setF] = useState(EMPTY);
  const [touched, setTouched] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // usuário criado
  const [qr, setQr] = useState('');

  const set = (k, mask) => (e) => setF({ ...f, [k]: mask ? mask(e.target.value) : e.target.value });
  const blur = (k) => () => setTouched({ ...touched, [k]: true });
  const cls = 'w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3.5 text-base outline-none focus:border-brand-600';

  const problems = {
    nome: !f.nome.trim() && 'Informe seu nome.',
    sobrenome: !f.sobrenome.trim() && 'Informe seu sobrenome.',
    cpf: !validCpf(f.cpf) && (f.cpf.replace(/\D/g, '').length < 11 ? 'Digite os 11 números do CPF.' : 'CPF inválido. Confira os números.'),
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) && 'E-mail inválido.',
    whatsapp: f.whatsapp.replace(/\D/g, '').length < 10 && 'Informe o WhatsApp com DDD.',
  };
  const show = (k) => touched[k] && problems[k];

  useEffect(() => {
    if (done) QRCode.toDataURL(qrContent(done, meta.event), { width: 600, margin: 1, errorCorrectionLevel: 'M' }).then(setQr);
  }, [done, meta.event]);

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ nome: true, sobrenome: true, cpf: true, email: true, whatsapp: true });
    if (Object.values(problems).some(Boolean)) { setError('Confira os campos destacados.'); return; }
    setBusy(true); setError('');
    try {
      const r = await api('/inscricao', { method: 'POST', body: f });
      adopt(r.token, r.user);
      setDone(r.user);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const ev = meta.event || {};

  if (done) {
    return (
      <div className="min-h-full bg-gradient-to-b from-brand-900 to-brand-700 px-4 py-8">
        <div className="mx-auto max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl">
          <CheckCircle2 className="mx-auto text-brand-600" size={56} />
          <h1 className="mt-2 text-2xl font-black text-brand-900">Inscrição confirmada!</h1>
          <p className="mt-1 text-slate-600">Olá, <b>{done.nome}</b>. Você está inscrito no {ev.nome}.</p>
          <div className="mx-auto mt-5 w-full max-w-60 rounded-2xl border-2 border-slate-100 p-2">{qr && <img src={qr} alt="Seu QR Code de inscrição" className="w-full" />}</div>
          <p className="mt-3 text-sm text-slate-600"><b>Mostre este QR Code no balcão</b> para retirar seu crachá mais rápido. Tire um print desta tela.</p>
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-left text-sm">
            <div className="font-bold text-slate-800">Seu acesso ao app do evento</div>
            <div className="mt-1 text-slate-600">Login: <b className="text-slate-900">{done.login}</b></div>
            <div className="text-slate-600">Senha: <b className="text-slate-900">seu CPF</b> (somente números)</div>
          </div>
          <Link to="/app" className="btn-primary mt-5 w-full py-3.5 text-base">Abrir meu crachá digital</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50">
      <header className="bg-gradient-to-br from-brand-900 via-[#0f5a2c] to-brand-700 px-5 pb-10 pt-8 text-center text-white">
        <div className="text-xs uppercase tracking-[0.2em] text-lime">{ev.edicao}</div>
        <h1 className="mt-1 text-3xl font-black tracking-tight">{ev.nome || 'SIRAN Summit'}</h1>
        <p className="mt-2 text-white/80">Faça sua inscrição como visitante</p>
      </header>

      <main className="mx-auto -mt-6 max-w-md px-4 pb-10">
        {ev.inscricaoAberta === false ? (
          <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
            <p className="font-semibold text-slate-800">As inscrições por este formulário estão encerradas.</p>
            <p className="mt-1 text-sm text-slate-500">Procure o balcão de credenciamento.</p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4 rounded-2xl bg-white p-5 shadow-lg">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome *" error={show('nome')}>
                <input className={cls} autoComplete="given-name" autoCapitalize="words" value={f.nome} onChange={set('nome')} onBlur={blur('nome')} />
              </Field>
              <Field label="Sobrenome *" error={show('sobrenome')}>
                <input className={cls} autoComplete="family-name" autoCapitalize="words" value={f.sobrenome} onChange={set('sobrenome')} onBlur={blur('sobrenome')} />
              </Field>
            </div>
            <Field label="CPF *" hint="Será a sua senha no app do evento." error={show('cpf')}>
              <input className={cls} inputMode="numeric" placeholder="000.000.000-00" value={f.cpf} onChange={set('cpf', maskCpf)} onBlur={blur('cpf')} />
            </Field>
            <Field label="WhatsApp *" error={show('whatsapp')}>
              <input className={cls} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(00) 00000-0000" value={f.whatsapp} onChange={set('whatsapp', maskPhone)} onBlur={blur('whatsapp')} />
            </Field>
            <Field label="E-mail *" error={show('email')}>
              <input className={cls} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder="voce@email.com" value={f.email} onChange={set('email')} onBlur={blur('email')} />
            </Field>
            <Field label="Empresa / Propriedade">
              <input className={cls} autoComplete="organization" value={f.empresa} onChange={set('empresa')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cargo"><input className={cls} autoComplete="organization-title" value={f.cargo} onChange={set('cargo')} /></Field>
              <Field label="Cidade"><input className={cls} autoComplete="address-level2" value={f.cidade} onChange={set('cidade')} /></Field>
            </div>
            <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-brand-700" checked={f.consentimento} onChange={(e) => setF({ ...f, consentimento: e.target.checked })} />
              <span>Autorizo compartilhar meu e-mail e WhatsApp com expositores e participantes que escanearem meu crachá no evento.</span>
            </label>
            {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}
            <button className="btn-primary w-full py-4 text-lg" disabled={busy}><UserPlus size={20} /> {busy ? 'Enviando…' : 'Confirmar inscrição'}</button>
            <p className="text-center text-sm text-slate-500">Já se inscreveu? <Link to="/login" className="inline-flex items-center gap-1 font-semibold text-brand-700"><LogIn size={14} /> Entrar</Link></p>
          </form>
        )}
      </main>
    </div>
  );
}
