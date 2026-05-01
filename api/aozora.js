// 青空製本 — 本文取得 API（v7: 書誌はクライアント側、本文だけサーバー側）
// 検索・書誌は public/data/books.json から行うため、ここでは本文取得のみ。

const VERSION = 'v7-2026-05-01-client-search';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { action, book_id, person_id } = req.query;

  try {
    if (action === 'version') {
      return res.json({ version: VERSION });
    }

    if (action === 'content') {
      if (!book_id) return res.status(400).json({ error: 'book_id required' });
      if (!person_id) return res.status(400).json({ error: 'person_id required' });
      const text = await getContent(book_id, person_id);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(text);
    }

    return res.status(400).json({ error: 'action=content or version required' });
  } catch (e) {
    console.error('aozora.js error:', e);
    return res.status(502).json({ error: e.message || 'unknown error' });
  }
}

async function getContent(bookId, personId) {
  // person_id を6桁ゼロパディング（青空文庫の URL 規則）
  const pid = String(personId).padStart(6, '0');
  const cardUrl = `https://www.aozora.gr.jp/cards/${pid}/card${bookId}.html`;

  // 1. 図書カードページ取得
  const cr = await fetch(cardUrl, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AozoraBookbinding/1.0)' }
  });
  if (!cr.ok) throw new Error(`card page fetch failed: ${cr.status} (${cardUrl})`);
  const cardBuf = await cr.arrayBuffer();
  const cardHtml = new TextDecoder('shift_jis').decode(cardBuf);

  // 2. 「いますぐXHTML版で読む」のリンクを抽出
  const xhtmlMatch = cardHtml.match(/href="(\.\/files\/[^"]+\.html?)"/i)
                  || cardHtml.match(/href="(files\/[^"]+\.html?)"/i);
  if (!xhtmlMatch) throw new Error('XHTML link not found in card page');

  const rel = xhtmlMatch[1].replace(/^\.\//, '');
  const xhtmlUrl = `https://www.aozora.gr.jp/cards/${pid}/${rel}`;

  // 3. 本文取得
  const hr = await fetch(xhtmlUrl, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AozoraBookbinding/1.0)' }
  });
  if (!hr.ok) throw new Error(`content fetch failed: ${hr.status}`);
  const buf = await hr.arrayBuffer();
  const html = new TextDecoder('shift_jis').decode(buf);

  return extractText(html);
}

function extractText(html) {
  let t = html.match(/<div class="main_text"[^>]*>([\s\S]*?)<\/div>/)?.[1] || html;

  t = t
    .replace(/<ruby><rb>([^<]*)<\/rb><rp>[^<]*<\/rp><rt>([^<]*)<\/rt><rp>[^<]*<\/rp><\/ruby>/gi, '$1《$2》')
    .replace(/<ruby>([^<]*?)<rt>([^<]*?)<\/rt><\/ruby>/gi, '$1《$2》')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, '\u3000')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\n{3,}/g, '\n\n');

  return t.trim();
}
