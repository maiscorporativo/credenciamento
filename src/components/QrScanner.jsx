import { useEffect, useRef, useState } from 'react';
import { CameraOff, SwitchCamera } from 'lucide-react';

/**
 * Leitor de QR Code / código de barras pela câmera do celular.
 * Obs.: navegadores só liberam a câmera em HTTPS (ou localhost).
 */
export default function QrScanner({ onScan, paused = false, cooldownMs = 2500 }) {
  const id = useRef('qr-' + Math.random().toString(36).slice(2));
  const scanner = useRef(null);
  const last = useRef({ text: '', at: 0 });
  const cb = useRef(onScan);
  const pausedRef = useRef(paused);
  const [error, setError] = useState('');
  const [facing, setFacing] = useState('environment');
  cb.current = onScan;
  pausedRef.current = paused;

  useEffect(() => {
    let stopped = false;
    let instance;
    (async () => {
      if (!window.isSecureContext) { setError('A câmera só funciona em conexão segura (https). Acesse o sistema pelo endereço https.'); return; }
      const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import('html5-qrcode');
      if (stopped) return;
      instance = new Html5Qrcode(id.current, { formatsToSupport: [F.QR_CODE, F.CODE_128, F.CODE_39, F.EAN_13], verbose: false });
      scanner.current = instance;
      try {
        await instance.start(
          { facingMode: facing },
          { fps: 12, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.75); return { width: s, height: s }; }, aspectRatio: 1 },
          (text) => {
            if (pausedRef.current) return;
            const now = Date.now();
            if (text === last.current.text && now - last.current.at < cooldownMs) return;
            last.current = { text, at: now };
            cb.current(text);
          },
          () => {},
        );
        setError('');
      } catch (e) {
        setError(String(e?.message || e).includes('Permission') ? 'Permissão da câmera negada. Libere o acesso à câmera nas configurações do navegador.' : 'Não foi possível abrir a câmera: ' + (e?.message || e));
      }
    })();
    return () => {
      stopped = true;
      if (instance?.isScanning) instance.stop().then(() => instance.clear()).catch(() => {});
    };
  }, [facing, cooldownMs]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <div id={id.current} className="aspect-square w-full [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover" />
      {paused && <div className="absolute inset-0 bg-black/50" />}
      {error && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white">
          <div><CameraOff className="mx-auto mb-2" />{error}</div>
        </div>
      )}
      <button type="button" onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
        className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white" aria-label="Trocar câmera"><SwitchCamera size={20} /></button>
    </div>
  );
}
