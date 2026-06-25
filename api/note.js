// Vercel Serverless Function — Upstash Redis read/write for note preview
// ENV: KV_REST_API_URL, KV_REST_API_TOKEN

const TTL = 60 * 60 * 24 * 7; // 7 days

function shortId() {
  return Math.random().toString(36).slice(2, 9);
}

async function upstash(method, ...args) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Upstash env vars missing');

  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([[method, ...args]]),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash error ${res.status}: ${text}`);
  }

  const json = await res.json();
  // pipeline returns array of results
  if (json[0]?.error) throw new Error(json[0].error);
  return json[0]?.result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST /api/note — save note, return short id
  if (req.method === 'POST') {
    try {
      const { title, body, tags, images } = req.body;
      if (!title && !body) {
        return res.status(400).json({ error: '内容不能为空' });
      }

      const id = shortId();
      const payload = JSON.stringify({ title, body, tags: tags || [], images: images || [] });

      await upstash('SET', `note:${id}`, payload, 'EX', TTL);

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
      const raw = await upstash('GET', `note:${id}`);
      if (!raw) return res.status(404).json({ error: '笔记不存在或已过期' });

      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return res.status(200).json(data);
    } catch (err) {
      console.error('GET /api/note error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
