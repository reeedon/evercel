
import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'Missing DATABASE_URL' });
  try {
    const sql = neon(process.env.DATABASE_URL);
    await sql`${ensure}`;
    if (req.method === 'GET') {
      const rows = await sql`SELECT id, name, pref FROM users ORDER BY name`;
      return res.status(200).json(rows);
    }
    if (req.method === 'POST') {
      const { name: rawName, pref = 'both' } = req.body || {};
      const name = String(rawName || '').trim().replace(/\s+/g, ' ');
      if (!name) return res.status(400).json({ error: 'Name required' });
      try {
        const inserted = await sql`INSERT INTO users (name, pref) VALUES (${name}, ${pref}) RETURNING id, name, pref`;
        return res.status(201).json(inserted[0]);
      } catch (err) {
        if (String(err).toLowerCase().includes('unique')) return res.status(409).json({ error: 'User exists' });
        throw err;
      }
    }
    if (req.method === 'DELETE') {
      const idStr = (req.query?.id || req.url.split('/').pop());
      const id = parseInt(idStr, 10);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      const del = await sql`DELETE FROM users WHERE id=${id}`;
      if (del.count === 0) return res.status(404).json({ error: 'Not found' });
      return res.status(204).end();
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: String(err) });
  }
}

const ensure = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  pref TEXT NOT NULL CHECK (pref IN ('both','tesla','chargepoint'))
);

CREATE TABLE IF NOT EXISTS spots (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('tesla','chargepoint')),
  label TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS queue (
  position INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS state_meta (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  version BIGINT NOT NULL DEFAULT 1,
  last_reset TIMESTAMPTZ
);
INSERT INTO state_meta (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

INSERT INTO spots (id, type, label)
SELECT x.id, x.type, x.label FROM (
  VALUES
    ('tesla-1','tesla','Tesla #1'),
    ('tesla-2','tesla','Tesla #2'),
    ('chargepoint-1','chargepoint','ChargePoint #1'),
    ('chargepoint-2','chargepoint','ChargePoint #2')
) AS x(id,type,label)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  reset_time TEXT NOT NULL DEFAULT '06:00'
);
INSERT INTO settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
`;
