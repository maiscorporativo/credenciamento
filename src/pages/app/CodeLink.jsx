import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ContactCard } from './Escanear';

/** Abre quando alguém lê o QR do crachá com a câmera comum do celular (QR em formato de link) */
export default function CodeLink() {
  const { code } = useParams();
  const { user } = useAuth();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user.id) { setError('Entre com um login de participante para salvar contatos.'); return; }
    api('/contacts', { method: 'POST', body: { code } }).then(setResult).catch((e) => setError(e.message));
  }, [code, user.id]);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      {error && <div className="card p-5 text-center text-red-700">{error}</div>}
      {result && <ContactCard result={result} />}
      <Link to="/app/contatos" className="btn-secondary w-full">Ver meus contatos</Link>
    </div>
  );
}
