// 青空製本 — 青空文庫データ取得 API（v3）
// 検索：ZORAPI（api.bungomail.com）— 作品名 LIKE → 作家名 LIKE → 人物IDで作品取得
// 本文：青空文庫公式の HTML（Shift_JIS）を fetch → TextDecoder で UTF-8 化 → main_text 抽出

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { action, title, book_id } = req.query;

  try {
    if (action === 'search') {
      const q = (title || '').trim();
      if (!q) return res.status(400).json({ error: 'title required' });

      // 1. まず作品名で LIKE 検索
      let books = await searchByTitle(q);

      // 2. ヒットしなければ作家名で人物検索 → その人物の作品を取得
      if (books.length === 0) {
        books = await searchByAuthor(q);
      }

      return res.json({ books });
    }

    if (action === 'content') {
      if (!book_id) return res.status(400).json({ error: 'book_id required' });
      const text = await getContent(book_id);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(text);
    }

    return res.status(400).json({ error: 'action=search or action=content required' });
  } catch (e) {
    console.error('aozora.js error:', e);
    return res.status(502).json({ error: e.message || 'unknown error' });
  }
}

// ----- ZORAPI 検索 -----

async function searchByTitle(q) {
  const url = `https://api.bungomail.com/v0/books?` +
    `作品名=${encodeURIComponent('/' + q + '/')}&limit=10`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) return [];
  const data = await r.json();
  return (data.books || []).map(formatBook);
}

async function searchByAuthor(q) {
  // 姓名 LIKE で人物検索
  const purl = `https://api.bungomail.com/v0/persons?` +
    `姓名=${encodeURIComponent('/' + q + '/')}&limit=3`;
  const pr = await fetch(purl, { signal: AbortSignal.timeout(10000) });
  if (!pr.ok) return [];
  const pdata = await pr.json();
  const persons = (pdata.persons || []).slice(0, 2);
  if (persons.length === 0) return [];

  // 各人物の作品を取得（人物IDは完全一致）
  const all = [];
  for (const p of persons) {
    const burl = `https://api.bungomail.com/v0/books?人物ID=${p['人物ID']}&limit=8`;
    const br = await fetch(burl, { signal: AbortSignal.timeout(8000) });
    if (br.ok) {
      const bdata = await br.json();
      all.push(...(bdata.books || []).map(formatBook));
    }
    if (all.length >= 10) break;
  }
  return all.slice(0, 10);
}

function formatBook(b) {
  return {
    book_id: b['作品ID'],
    title: b['作品名'],
    author: b['姓名'] || `${b['姓'] || ''}${b['名'] || ''}`,
  };
}

// ----- 本文取得 -----

async function getContent(bookId) {
  // ZORAPI から作品メタデータを取得
  const mr = await fetch(`https://api.bungomail.com/v0/books/${encodeURIComponent(bookId)}`, {
    signal: AbortSignal.timeout(10000)
  });
  if (!mr.ok) throw new Error('metadata fetch failed: ' + mr.status);
  const meta = await mr.json();
  const book = meta.book;
  if (!book) throw new Error('book not found in ZORAPI response');

  const htmlUrl = book['XHTML/HTMLファイルURL'];
  const enc = (book['XHTML/HTMLファイル符号化方式'] || 'ShiftJIS').toLowerCase();
  if (!htmlUrl) throw new Error('html url not found');

  // HTMLバイナリを取得
  const hr = await fetch(htmlUrl, { signal: AbortSignal.timeout(10000) });
  if (!hr.ok) throw new Error('content fetch failed: ' + hr.status);
  const buf = await hr.arrayBuffer();

  // デコード（Shift_JIS or UTF-8）
  let html;
  if (enc.includes('shift') || enc.includes('sjis')) {
    html = new TextDecoder('shift_jis').decode(buf);
  } else {
    html = new TextDecoder('utf-8').decode(buf);
  }

  return extractText(html);
}

// ----- HTML → 青空文庫形式テキスト -----

function extractText(html) {
  // main_text の中身を抽出
  let t = html.match(/<div class="main_text"[^>]*>([\s\S]*?)<\/div>/)?.[1] || html;

  t = t
    // ルビを《》形式に
    .replace(/<ruby><rb>([^<]*)<\/rb><rp>[^<]*<\/rp><rt>([^<]*)<\/rt><rp>[^<]*<\/rp><\/ruby>/gi, '$1《$2》')
    .replace(/<ruby>([^<]*?)<rt>([^<]*?)<\/rt><\/ruby>/gi, '$1《$2》')
    // 改行
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    // 残りタグ除去
    .replace(/<[^>]+>/g, '')
    // HTML エンティティ
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, '\u3000')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    // 連続改行を整形
    .replace(/\n{3,}/g, '\n\n');

  return t.trim();
}
