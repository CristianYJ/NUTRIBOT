// A small text-only PDF export avoids adding a renderer or exposing HTML to the file.
const printable = value => String(value ?? '—').replace(/[\r\n\t]+/g, ' ')
  .replace(/[^\x20-\xff]/g, character => character === '→' ? '>' : '-');
const escaped = value => printable(value).replace(/[\\()]/g, '\\$&');

export function systemLogsPdf(items, { days, category }) {
  const now = new Date();
  const lines = items.map(item => {
    const at = new Date(item.createdAt).toLocaleString('es-GT', { timeZone: 'America/Guatemala',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `${at}  |  ${item.category}  |  ${item.action}  |  #${item.accountId ?? '-'}  |  ${item.detail ?? '-'}`.slice(0, 105);
  });
  const pages = [];
  for (let i = 0; i < lines.length; i += 46) pages.push(lines.slice(i, i + 46));
  if (!pages.length) pages.push([]);
  const objects = [null];
  const add = value => { objects.push(value); return objects.length - 1; };
  const catalogId = add('');
  const pagesId = add('');
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const pageIds = [];
  pages.forEach((page, pageNumber) => {
    const draw = (value, x, y, size) => `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escaped(value)}) Tj ET`;
    const commands = [draw('NutriBot · Registro de sistema', 42, 794, 16),
      draw(`Período: ${days} día(s)  |  Categoría: ${category}  |  Exportado: ${now.toISOString().slice(0, 16)} UTC`, 42, 772, 9),
      draw('Fecha y hora  |  Categoría  |  Evento  |  Cuenta  |  Detalle', 42, 748, 9),
      ...page.map((line, index) => draw(line, 42, 727 - index * 14, 8)),
      draw(`Página ${pageNumber + 1} de ${pages.length} · ${items.length} registros (máximo 500)`, 42, 37, 8)].join('\n');
    const contentId = add(`<< /Length ${Buffer.byteLength(commands, 'latin1')} >>\nstream\n${commands}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`));
  });
  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
