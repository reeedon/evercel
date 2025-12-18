
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export default async function handler(req, res) {
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'Missing DATABASE_URL' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(ensureDDL);
    const s = await client.query('SELECT reset_time FROM settings WHERE id=TRUE');
    const t = (s.rows[0]?.reset_time || '06:00');
    const [hh, mm] = t.split(':').map(x=>parseInt(x,10));
    const now = new Date();
    // Use UTC: Vercel cron triggers use UTC schedule
    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0, 0));
    const meta = await client.query('SELECT last_reset FROM state_meta WHERE id=TRUE FOR UPDATE');
    const last = meta.rows[0]?.last_reset ? new Date(meta.rows[0].last_reset) : null;
    const already = last && last >= target;
    if (now >= target && !already) {
      await client.query('DELETE FROM queue');
      await client.query('UPDATE spots SET user_id=NULL');
      await client.query('UPDATE state_meta SET last_reset=NOW(), version=version+1');
      await client.query('COMMIT');
      return res.status(200).json({ message: 'Reset done' });
    }
    await client.query('ROLLBACK');
    return res.status(200).json({ message: 'No reset' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    return res.status(500).json({ error: String(err) });
  } finally {
    client.release();
  }
}

const ensureDDL = `
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
