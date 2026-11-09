# Credenciamento SIRAN Summit

Sistema de credenciamento, impressão de etiquetas, controle de acesso por QR Code e networking entre participantes.

## Rodar

```bash
npm install
npm run build     # compila o front-end (só quando o código mudar)
npm start         # http://localhost:3000
```

Ou dê dois cliques em `iniciar.bat`.

Desenvolvimento com recarga automática: `npm run dev` (front em http://localhost:5173, API em 3000).

Login do administrador mestre: definido no arquivo `.env` (`ADMIN_USER` / `ADMIN_PASS`).
Os dados ficam em `data/credenciamento.db` (SQLite). **Faça cópia desse arquivo** antes e durante o evento.

## Perfis e login

Todos entram com **nome.sobrenome** (primeiro nome + último sobrenome, sem acento) e a senha é o **CPF** (só números).
Também aceita o e-mail ou o próprio CPF no campo login.

| Perfil | O que vê |
|---|---|
| Participante (visitante/expositor) | Crachá digital com QR, escanear crachás, lista de contatos (exporta Excel e agenda .vcf) |
| Leitor de acesso | Câmera para bipar entrada/saída do espaço vinculado (ex.: José → Plenária) |
| Balcão | Busca, edição, check de expositor e impressão de etiquetas |
| Administrador | Tudo, incluindo importação, editor de etiqueta, equipe, espaços e relatórios |

## Fluxo do evento

1. **Importar planilha** — mapeia as colunas automaticamente. Pode reimportar exportações novas: quem já existe (mesmo CPF, ID ou e-mail) não duplica.
2. **Etiqueta** — defina o tamanho e o layout. Sem a medida exata ainda? Use **Imprimir calibração**.
3. **Espaços** — cadastre Plenária, Seminário do Leite etc.
4. **Equipe** — crie os leitores (perfil "Leitor de acesso" + espaço) e os operadores de balcão.
5. No dia: balcão em `/balcao`; leitores abrem o sistema no celular e caem direto na câmera.

## Integração com o Mautic (inscrições automáticas)

Painel → **Integração Mautic**. Cada envio do formulário do site entra sozinho, sem duplicar ninguém.

- **Sincronização pela API** (funciona mesmo rodando localmente): informe a URL do Mautic, usuário e senha,
  escolha o formulário e ligue "Buscar novas inscrições a cada N segundos".
  No Mautic é preciso ativar **Configurações → Configurações da API → API ativada = Sim e Basic Auth = Sim**.
- **Webhook** (instantâneo, exige o sistema publicado em https): copie a URL mostrada na tela e crie em
  **Configurações → Webhooks** um webhook com o evento **"Evento de envio de formulário"**.

As credenciais também podem ficar no `.env` (`MAUTIC_URL`, `MAUTIC_USER`, `MAUTIC_PASS`).

## Impressora térmica (Zebra / Elgin / Argox)

1. Instale o driver da impressora no Windows e, nas **Preferências de impressão**, configure o tamanho do papel igual ao da etiqueta (ex.: 80 × 40 mm), margens 0.
2. Defina a impressora térmica como **padrão** no computador do balcão.
3. Para imprimir **sem a janela de impressão** (como no vídeo), abra o Chrome em modo quiosque de impressão:
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing http://localhost:3000/balcao
   ```
   Crie um atalho na área de trabalho com esse comando.
4. Sem o `--kiosk-printing`, na primeira impressão escolha a impressora, "Margens: nenhuma" e escala 100%; o Chrome memoriza.
5. Se a etiqueta sair deslocada, ajuste "Ajuste horizontal/vertical" no editor. Se sair girada, use "Rotação".

Leitores de código USB funcionam no balcão: bipe o QR do crachá digital (celular do participante) no campo de busca.

## Câmera no celular = precisa de HTTPS

Navegadores só liberam a câmera em `https://`. Opções:

- **Servidor na nuvem (recomendado)**: VPS com Node 22+ e um domínio (ex.: `credenciamento.siransummit.com`) atrás de Caddy/Nginx com certificado Let's Encrypt.
- **Rede local do evento**: `npx cloudflared tunnel --url http://localhost:3000` gera um endereço https temporário.
- **Teste na rede local**: `HTTPS=1 npm run dev` (certificado autoassinado; aceite o aviso no celular).

Com o endereço público definido em *Etiqueta → Endereço público do sistema*, o QR impresso vira um link: qualquer
celular lendo com a câmera normal abre o sistema direto na tela de salvar contato.

Leituras de acesso feitas sem internet ficam guardadas no celular e são enviadas automaticamente quando a conexão volta.

## LGPD

E-mail e WhatsApp de um participante só aparecem para quem escaneou o crachá se ele autorizou o compartilhamento
(coluna "Autorizo o compartilhamento..." da inscrição). O próprio participante pode mudar isso no app.
