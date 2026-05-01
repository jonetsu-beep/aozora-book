// 青空製本 — Claude API 経由の文学翻訳
// モデル: claude-sonnet-4-5 (2025年9月リリース、文学翻訳に充分な品質、コスパ良)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { text, lang } = req.body;
  if (!text || !lang) return res.status(400).json({ error: 'Missing text or lang' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: 'You are a literary translator specializing in Meiji and Taisho era Japanese literature. Translate with elegance, accuracy, and literary quality. Return ONLY the translation text, nothing else.',
        messages: [
          { role: 'user', content: `Translate the following Japanese text to literary ${lang}:\n\n${text}` }
        ]
      })
    });

    const data = await r.json();
    if (!r.ok) {
      console.error('Anthropic API error:', data);
      return res.status(r.status).json({ error: data.error?.message || 'API error' });
    }
    res.json({ translation: data.content[0].text.trim() });
  } catch (e) {
    console.error('translate.js exception:', e);
    res.status(500).json({ error: e.message });
  }
}
