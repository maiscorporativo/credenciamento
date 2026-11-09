import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, fullName } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { qrContent } from '../../lib/label';
import { CategoryBadge } from '../../components/ui';

export default function MeuCracha() {
  const { user, meta, refresh } = useAuth();
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(qrContent(user, meta.event), { width: 600, margin: 1, errorCorrectionLevel: 'M' }).then(setSrc);
  }, [user, meta.event]);

  const toggleConsent = async () => {
    await api('/me/consent', { method: 'PUT', body: { consentimento: !user.consentimento } });
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-b from-[#06140c] via-brand-900 to-brand-700 p-6 text-center text-white shadow-xl">
        <div className="text-xs uppercase tracking-[0.2em] text-lime">{meta.event?.nome} · {meta.event?.edicao}</div>
        <div className="mx-auto mt-4 w-full max-w-64 rounded-2xl bg-white p-3">{src && <img src={src} alt="QR Code do seu crachá" className="w-full" />}</div>
        <div className="mt-4 text-2xl font-extrabold">{user.nome_cracha || fullName(user)}</div>
        <div className="text-sm text-white/80">{user.empresa}</div>
        <div className="mt-2"><CategoryBadge c={user.categoria} /></div>
        <div className="mt-3 font-mono text-xs text-white/50">{user.code}</div>
      </div>
      <p className="text-center text-sm text-slate-500">Mostre este QR Code no balcão para retirar seu crachá mais rápido, ou para outros participantes e expositores salvarem seu contato.</p>
      <label className="card flex items-start gap-3 p-4 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand-700" checked={!!user.consentimento} onChange={toggleConsent} />
        <span><b>Compartilhar meu e-mail e WhatsApp</b> com quem escanear meu crachá.<br /><span className="text-slate-500">Desmarcado, só seu nome e empresa aparecem.</span></span>
      </label>
    </div>
  );
}
