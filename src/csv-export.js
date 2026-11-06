// Keep downloaded values as data when a CSV is opened in a spreadsheet.
const cell = value => {
  const raw = String(value ?? '');
  const safe = /^[\s\uFEFF]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
};

export function makeCsv(headers, rows) {
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function downloadCsv(filename, headers, rows) {
  const url = URL.createObjectURL(new Blob([makeCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
