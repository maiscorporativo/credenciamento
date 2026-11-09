import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

/**
 * Renderizador de etiquetas. Tudo em milímetros, para sair com o tamanho exato na impressora térmica.
 * O mesmo HTML é usado na pré-visualização do editor e na impressão.
 */

export const FIELDS = [
  { value: 'nome_cracha', label: 'Nome no crachá' },
  { value: 'nome_completo', label: 'Nome completo' },
  { value: 'nome', label: 'Primeiro(s) nome(s)' },
  { value: 'sobrenome', label: 'Sobrenome' },
  { value: 'empresa', label: 'Empresa' },
  { value: 'cargo', label: 'Cargo' },
  { value: 'cidade', label: 'Cidade' },
  { value: 'categoria', label: 'Categoria (VISITANTE / EXPOSITOR…)' },
  { value: 'code', label: 'Código do crachá' },
];

export const SIZE_PRESETS = [
  [100, 50], [90, 50], [80, 40], [70, 40], [60, 40], [60, 30], [50, 30], [100, 70], [100, 150],
];

export const SAMPLE = {
  nome: 'Viviane', sobrenome: 'Pinatti', nome_cracha: 'Viviane Pinatti', empresa: 'Mitte Tecnologia',
  cargo: 'Diretora Comercial', cidade: 'Presidente Prudente', categoria: 'VISITANTE', code: 'K7QX4M2P',
};

const PT_TO_PX = 96 / 72;
const MM_TO_PX = 96 / 25.4;
let ctx;
function measure(text, sizePt, bold, family) {
  ctx ||= document.createElement('canvas').getContext('2d');
  ctx.font = `${bold ? 700 : 400} ${sizePt * PT_TO_PX}px ${family}`;
  return ctx.measureText(text).width / MM_TO_PX; // em mm
}

function wrap(text, maxW, sizePt, bold, family, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (measure(t, sizePt, bold, family) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1);
    head.push(lines.slice(maxLines - 1).join(' '));
    return head;
  }
  return lines;
}

/** Reduz a fonte até o texto caber na caixa (largura × altura × nº de linhas) */
export function fitText(text, el, family) {
  const maxLines = Math.max(1, el.lines || 1);
  const lineH = 1.15;
  let size = el.fontSize;
  for (;;) {
    const lines = maxLines === 1 ? [text] : wrap(text, el.w, size, el.bold, family, maxLines);
    const widest = Math.max(...lines.map((l) => measure(l, size, el.bold, family)));
    const height = lines.length * size * lineH * 0.3528; // pt → mm
    const fits = widest <= el.w - (el.invert ? 2 : 0) + 0.01 && height <= el.h + 0.01;
    if (fits || !el.autoFit || size <= 5) return { size, lines };
    size = Math.round((size - 0.5) * 10) / 10;
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function fieldValue(p, field) {
  if (field === 'nome_completo') return [p.nome, p.sobrenome].filter(Boolean).join(' ');
  if (field === 'nome_cracha') return p.nome_cracha || [p.nome, p.sobrenome].filter(Boolean).join(' ');
  return p[field] ?? '';
}

export function qrContent(p, event) {
  const base = (event?.qrBaseUrl || '').replace(/\/+$/, '');
  return base ? `${base}/c/${p.code}` : p.code;
}

function barcodeSvg(value, el) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, value, { format: 'CODE128', displayValue: !!el.showText, margin: 0, height: 60, width: 2, fontSize: 14, textMargin: 0 });
  } catch { return ''; }
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('style', 'width:100%;height:100%;display:block');
  return svg.outerHTML;
}

/** Retorna o HTML de UMA etiqueta (sem rotação/offset — isso é aplicado na página de impressão) */
export async function renderLabel(tpl, p, event) {
  const family = tpl.fontFamily || 'Arial, Helvetica, sans-serif';
  const parts = [];
  for (const el of tpl.elements) {
    if (el.hidden) continue;
    if (el.onlyCategories?.length && !el.onlyCategories.includes(p.categoria)) continue;
    const box = `position:absolute;left:${el.x}mm;top:${el.y}mm;`;
    if (el.type === 'qrcode') {
      const svg = await QRCode.toString(qrContent(p, event) || '-', { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
      parts.push(`<div style="${box}width:${el.size}mm;height:${el.size}mm">${svg.replace('<svg', '<svg style="width:100%;height:100%;display:block" shape-rendering="crispEdges"')}</div>`);
      continue;
    }
    if (el.type === 'barcode') {
      parts.push(`<div style="${box}width:${el.w}mm;height:${el.h}mm">${barcodeSvg(p.code || '0', el)}</div>`);
      continue;
    }
    if (el.type === 'box') {
      parts.push(`<div style="${box}width:${el.w}mm;height:${el.h}mm;border:${el.border || 0.4}mm solid #000;border-radius:${el.radius || 0}mm;${el.fill ? 'background:#000' : ''}"></div>`);
      continue;
    }
    let text = el.type === 'text' ? el.text || '' : fieldValue(p, el.field);
    if (el.uppercase) text = String(text).toLocaleUpperCase('pt-BR');
    if (!text) continue;
    const { size, lines } = fitText(String(text), el, family);
    const justify = el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start';
    const colors = el.invert ? 'background:#000;color:#fff;border-radius:1mm;padding:0 1mm;' : 'color:#000;';
    parts.push(`<div style="${box}width:${el.w}mm;height:${el.h}mm;display:flex;flex-direction:column;justify-content:${el.valign === 'top' ? 'flex-start' : el.valign === 'bottom' ? 'flex-end' : 'center'};align-items:${justify};text-align:${el.align || 'left'};${colors}box-sizing:border-box;overflow:hidden;font-family:${esc(family)};font-size:${size}pt;font-weight:${el.bold ? 700 : 400};line-height:1.15;">${lines.map((l) => `<div style="white-space:nowrap">${esc(l)}</div>`).join('')}</div>`);
  }
  return `<div style="position:relative;width:${tpl.width}mm;height:${tpl.height}mm;overflow:hidden;background:#fff">${parts.join('')}</div>`;
}

/** Página impressa: aplica rotação (para impressoras que alimentam a etiqueta "deitada") e ajuste fino */
function pageWrap(tpl, inner) {
  const rot = Number(tpl.rotate) || 0;
  const swap = rot === 90 || rot === 270;
  const pw = swap ? tpl.height : tpl.width;
  const ph = swap ? tpl.width : tpl.height;
  const t = {
    0: '',
    90: `translate(${pw}mm,0) rotate(90deg)`,
    180: `translate(${pw}mm,${ph}mm) rotate(180deg)`,
    270: `translate(0,${ph}mm) rotate(270deg)`,
  }[rot];
  return { pw, ph, html: `<div class="page"><div style="transform:translate(${tpl.offsetX || 0}mm,${tpl.offsetY || 0}mm) ${t};transform-origin:0 0;width:${tpl.width}mm;height:${tpl.height}mm">${inner}</div></div>` };
}

function printHtml(tpl, pages) {
  const { pw, ph } = pageWrap(tpl, '');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>
    @page { size: ${pw}mm ${ph}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { width: ${pw}mm; height: ${ph}mm; overflow: hidden; position: relative; page-break-after: always; break-after: page; }
    .page:last-child { page-break-after: auto; break-after: auto; }
  </style></head><body>${pages.join('')}</body></html>`;
}

/** Imprime via iframe oculto. Com o Chrome aberto em --kiosk-printing, sai direto na impressora padrão sem diálogo. */
export function printDocument(html) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    const go = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => { iframe.remove(); resolve(); }, 1500);
    };
    setTimeout(go, 250);
  });
}

export async function printLabels(tpl, participants, event) {
  const pages = [];
  for (const p of participants) pages.push(pageWrap(tpl, await renderLabel(tpl, p, event)).html);
  await printDocument(printHtml(tpl, pages));
}

/** Página de calibração: borda, cruz central e régua a cada 5 mm — para acertar tamanho e deslocamento */
export async function printCalibration(tpl) {
  const ticks = [];
  for (let x = 5; x < tpl.width; x += 5) ticks.push(`<div style="position:absolute;left:${x}mm;top:0;width:0.2mm;height:${x % 10 ? 2 : 4}mm;background:#000"></div>`);
  for (let y = 5; y < tpl.height; y += 5) ticks.push(`<div style="position:absolute;top:${y}mm;left:0;height:0.2mm;width:${y % 10 ? 2 : 4}mm;background:#000"></div>`);
  const inner = `<div style="position:relative;width:${tpl.width}mm;height:${tpl.height}mm;box-sizing:border-box;border:0.3mm solid #000;font-family:Arial;background:#fff">
    ${ticks.join('')}
    <div style="position:absolute;left:50%;top:0;bottom:0;border-left:0.2mm dashed #000"></div>
    <div style="position:absolute;top:50%;left:0;right:0;border-top:0.2mm dashed #000"></div>
    <div style="position:absolute;left:6mm;top:6mm;font-size:9pt;font-weight:700">${tpl.width} × ${tpl.height} mm</div>
    <div style="position:absolute;left:6mm;top:11mm;font-size:7pt">ajuste X ${tpl.offsetX || 0} · Y ${tpl.offsetY || 0} · rot ${tpl.rotate || 0}°</div>
  </div>`;
  await printDocument(printHtml(tpl, [pageWrap(tpl, inner).html]));
}
