/**
 * Modelo de etiqueta padrão. Todas as medidas em milímetros; fontes em pontos (pt).
 * O modelo é 100% editável na tela "Etiqueta" do painel administrativo.
 */
export const DEFAULT_LABEL = {
  width: 80,
  height: 40,
  offsetX: 0,
  offsetY: 0,
  rotate: 0,
  fontFamily: 'Arial, Helvetica, sans-serif',
  elements: [
    { id: 'nome', type: 'field', field: 'nome_cracha', x: 3, y: 3, w: 50, h: 11, fontSize: 18, bold: true, align: 'left', uppercase: true, autoFit: true, lines: 1, invert: false },
    { id: 'empresa', type: 'field', field: 'empresa', x: 3, y: 15, w: 50, h: 9, fontSize: 11, bold: false, align: 'left', uppercase: true, autoFit: true, lines: 2, invert: false },
    { id: 'categoria', type: 'field', field: 'categoria', x: 3, y: 28, w: 50, h: 8, fontSize: 13, bold: true, align: 'center', uppercase: true, autoFit: true, lines: 1, invert: true },
    { id: 'qr', type: 'qrcode', x: 55, y: 7, size: 23 },
    { id: 'codigo', type: 'field', field: 'code', x: 55, y: 31, w: 23, h: 4, fontSize: 7, bold: false, align: 'center', uppercase: true, autoFit: false, lines: 1, invert: false },
  ],
};

export const DEFAULT_EVENT = {
  nome: 'SIRAN Summit 2026',
  edicao: '4ª Edição',
  // Se preenchido (ex.: https://credenciamento.siransummit.com), o QR do crachá vira um link
  // que abre o sistema direto na tela de salvar contato / registrar acesso.
  qrBaseUrl: '',
  autoPrint: true,
};
