import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, ExternalLink } from 'lucide-react';

/** Link público do formulário de autoinscrição + QR Code para divulgar */
export default function SignupLink({ event, setEvent }) {
  const base = (event.qrBaseUrl || window.location.origin).replace(/\/+$/, '');
  const url = `${base}/inscricao`;
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => { QRCode.toDataURL(url, { width: 1200, margin: 2, errorCorrectionLevel: 'M' }).then(setQr); }, [url]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { prompt('Copie o link:', url); }
  };

  return (
    <div className="card space-y-3 p-4">
      <h2 className="font-bold">Formulário de inscrição para visitantes</h2>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-brand-700" checked={event.inscricaoAberta !== false} onChange={(e) => setEvent({ ...event, inscricaoAberta: e.target.checked })} />
        Inscrições abertas pelo formulário (salve para aplicar)
      </label>
      <div className="flex gap-2">
        <input className="input font-mono text-sm" readOnly value={url} onFocus={(e) => e.target.select()} />
        <button className="btn-secondary shrink-0" onClick={copy}><Copy size={16} /> {copied ? 'Copiado' : 'Copiar'}</button>
      </div>
      <div className="flex items-center gap-4">
        {qr && <img src={qr} alt="QR Code do formulário de inscrição" className="h-32 w-32 rounded-lg border border-slate-200" />}
        <div className="space-y-2">
          <a className="btn-secondary" href={qr} download="qrcode-inscricao.png"><Download size={16} /> Baixar QR Code</a>
          <a className="btn-secondary" href={url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Abrir formulário</a>
        </div>
      </div>
      {!event.qrBaseUrl && <p className="text-xs text-amber-700">Dica: preencha o "Endereço público do sistema" acima para o link usar o endereço oficial (https).</p>}
      <p className="text-xs text-slate-500">Quem se inscreve entra como VISITANTE (origem "autoinscricao"), já recebe o QR do crachá na tela e é encontrado normalmente no balcão.</p>
    </div>
  );
}
