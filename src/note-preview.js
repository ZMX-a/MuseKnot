export function notePreview(note) {
  const body = (note.body || '').trim();
  if (!body) return { title: (note.title || '').trim(), excerpt: '' };
  const lines = body.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const explicitTitle = (note.title || '').trim();
  let excerptLines = lines;

  if (explicitTitle && lines[0] === explicitTitle) {
    excerptLines = lines.slice(1);
  }

  return { title: explicitTitle, excerpt: excerptLines.join(' ') || (explicitTitle ? '' : body) };
}
