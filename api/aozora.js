let cache = null, cacheAt = 0;

function parseCSVLine(line) {
  const fields = []; let field = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { fields.push(field); field = ''; }
    else field += ch;
  }
  fields.push(field);
  return fields;
}

async function getCatalog() {
  if (cache && Date.now() - cacheAt < 7200000) return cache;
  const r = await fetch(
    'https://raw.githubusercontent.com/aozorabunko/aozorabunko/master/index_pages/list_person_all_extended_utf8.csv',
    { signal: AbortSignal.timeout(8000) }
  );
  if (!r.ok) throw new Error('catalog fetch failed: ' + r.status);
  const text = await r.text();
  const lines = text.split('\n');
  const h = parseCSVLine(lines[0]);
  const iId   = h.indexOf('作品ID');
  const iT    = h.indexOf('作品名');
  const iLast = h.indexOf('姓');
  const iFst  = h.indexOf('名');
  const iHtml = h.findIndex(x => x.includes('HTML') && x.includes('URL'));
  const books = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCSVLine(lines[i]);
    if (c.length < 20) continue;
    const id = c[iId], title = c[iT], author = (c[iLast]||'') + (c[iFst]||''), html = c[iHtml]||'';
    if (id && title && author && html) books.push({ book_id: id, title, author, html_url: html });
  }
  cache = books; cacheAt = Date.now();
  return books;
}

function extractText(html) {
  let t = html.match(/<div class="main_text"[^>]*>([\s\S]*?)<\/div>/)?.[1] || html;
  t = t
    .replace(/<ruby>([^<]*)<rt>([^<]*)<\/rt><\/ruby>/gi, '$1《$2》')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&nbsp;/g,'\u3000').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n));
  return t.trim();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { action, title, book_id } = req.query;
  try {
    if (action === 'search') {
      const q = (title||'').trim();
      if (!q) return res.status(400).json({ error: 'title required' });
      const books = await getCatalog();
      const found = books.filter(b => b.title.includes(q) || b.author.includes(q)).slice(0, 10);
      return res.json({ books: found.map(({book_id,title,author}) => ({book_id,title,author})) });
    }
    if (action === 'content') {
      const books = await getCatalog();
      const book = books.find(b => b.book_id === book_id);
      if (!book) return res.status(404).json({ error: 'not found' });
      const url = book.html_url.startsWith('http') ? book.html_url : 'https://www.aozora.gr.jp' + book.html_url;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return res.status(r.status).json({ error: 'fetch failed' });
      const html = await r.text();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(extractText(html));
    }
    res.status(400).json({ error: 'action=search or action=content required' });
  } catch(e) {
    res.status(502).json({ error: e.message });
  }
}
