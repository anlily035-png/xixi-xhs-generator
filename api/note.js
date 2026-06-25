// Vercel Serverless Function — Upstash Redis read/write for note preview
// ENV: KV_REST_API_URL, KV_REST_API_TOKEN

const TTL = 60 * 60 * 24 * 7; // 7 days

function shortId() {
  return Math.random().toString(36).slice(2, 9);
}

async function upstashCmd(commands) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Upstash env vars missing');

  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash error ${res.status}: ${text}`);
  }

  return res.json();
}

function parseResult(raw) {
  if (raw === null || raw === undefined) return null;
  // already an object
  if (typeof raw === 'object') return raw;
  // string — might be single or double JSON-encoded
  let parsed = raw;
  try { parsed = JSON.parse(raw); } catch (_) { return raw; }
  // double-encoded: JSON.parse returned another string
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch (_) {}
  }
  return parsed;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST /api/note — save note, return short id
  if (req.method === 'POST') {
    try {
      const { title, body, tags, images } = req.body || {};
      if (!title && !body) return res.status(400).json({ error: '内容不能为空' });

      const id = shortId();
      const payload = JSON.stringify({ title, body, tags: tags || [], images: images || [] });

      // Use SETEX: SETEX key seconds value  (avoids EX option parsing issues)
      const result = await upstashCmd([['SETEX', `note:${id}`, TTL, payload]]);
      if (result[0]?.error) throw new Error(result[0].error);

      return res.status(200).json({ id });
    } catch (err) {
      console.error('POST /api/note error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // GET /api/note?id=xxx — retrieve note
  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: '缺少 id 参数' });

    try {
      const result = await upstashCmd([['GET', `note:${id}`]]);
      if (result[0]?.error) throw new Error(result[0].error);

      const raw = result[0]?.result;
      if (raw === null || raw === undefined) {
        return res.status(404).json({ error: '笔记不存在或已过期' });
      }

      const data = parseResult(raw);
      if (!data || typeof data !== 'object') {
        return res.status(500).json({ error: '数据格式错误', raw: String(raw).slice(0, 100) });
      }

      return res.status(200).json(data);
    } catch (err) {
      console.error('GET /api/note error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
