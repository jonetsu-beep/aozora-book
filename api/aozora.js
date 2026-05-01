// 青空製本 — Aozora API proxy (最終版)
// 旧URL形式・新URL形式・両方に対応

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
    { signal: AbortSignal.timeout(9000) }
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
    const id = c[iId], title = c[iT];
    const author = (c[iLast] || '') + (c[iFst] || '');
    const html = c[iHtml] || '';
    if (id && title && author && html) {
      books.push({ book_id: id, title, author, html_url: html });
    }
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
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, '\u3000')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  return t.trim();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // ── URLパターンの解析 ────────────────────────────
  // 対応する形式:
  //   新) /api/aozora?action=search&title=羅生門
  //   新) /api/aozora?action=content&book_id=127
  //   旧) /api/aozora?path=books&title=羅生門          (vercel.json rewriteで変換された形)
  //   旧) /api/aozora?path=books/127/content
  // ──────────────────────────────────────────────────

  const q = req.query;
  let action = q.action;
  let title  = q.title;
  let bookId = q.book_id;

  // 旧URLフォーマット（path=books/... 形式）を変換
  if (!action && q.path) {
    const p = Array.isArray(q.path) ? q.path.join('/') : q.path;
    if (p === 'books' || p === '') {
      action = 'search';
      title  = q.title;
    } else {
      const m = p.match(/books\/(\d+)\/content/);
      if (m) { action = 'content'; bookId = m[1]; }
    }
  }

  try {
    // ── 検索 ──────────────────────────────────────
    if (action === 'search') {
      const keyword = (title || '').trim();
      if (!keyword) return res.status(400).json({ error: 'title required' });
      const books = await getCatalog();
      const found = books
        .filter(b => b.title.includes(keyword) || b.author.includes(keyword))
        .slice(0, 10)
        .map(({ book_id, title, author }) => ({ book_id, title, author }));
      return res.json({ books: found });
    }

    // ── 本文取得 ──────────────────────────────────
    if (action === 'content') {
      const books = await getCatalog();
      const book  = books.find(b => b.book_id === bookId);
      if (!book) return res.status(404).json({ error: 'book not found: ' + bookId });
      const url = book.html_url.startsWith('http')
        ? book.html_url
        : 'https://www.aozora.gr.jp' + book.html_url;
      const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
      if (!r.ok) return res.status(r.status).json({ error: 'content fetch failed' });
      const html = await r.text();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(extractText(html));
    }

    // ── パラメータ不足 ─────────────────────────────
    res.status(400).json({
      error: 'Required: ?action=search&title=作品名  OR  ?action=content&book_id=ID',
      received: q
    });

  } catch (e) {
    res.status(502).json({ error: e.message, stack: e.stack?.split('\n')[0] });
  }
}
