
import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'Missing DATABASE_URL' });
  try {
    const sql = neon(process.env.DATABASE_URL);
    await sql`${ensure}`;
    if (req.method === 'GET') {
      const rows = await sql`SELECT reset_time FROM settings WHERE id=TRUE`;
      return res.status(200).json({ resetTime: rows[0]?.reset_time || '06:00' });
    }
    if (req.method === 'PUT') {
      const { resetTime } = req.body || {};
      const t = String(resetTime || '').trim();
      if (!/^\d{2}:\d{2}$/.test(t)) return res.status(400).json({ error: 'Invalid resetTime. Use HH:MM' });
      await sql`UPDATE settings SET reset_time=${t} WHERE id=TRUE`;
      return res.status(200).json({ resetTime: t });
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
