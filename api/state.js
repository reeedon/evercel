
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, If-Match');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'Missing DATABASE_URL' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(ensureDDL);

    if (req.method === 'GET') {
      const meta = await client.query('SELECT version, last_reset FROM state_meta WHERE id=TRUE');
      const etag = String(meta.rows[0]?.version || 1);
      const spots = await client.query('SELECT id, type, label, user_id FROM spots ORDER BY id');
      const queue = await client.query('SELECT position, user_id FROM queue ORDER BY position');
      await client.query('COMMIT');
      res.setHeader('ETag', etag);
      return res.status(200).json({ queue: queue.rows, spots: spots.rows, lastReset: meta.rows[0]?.last_reset || null });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const ifMatch = req.headers['if-match'];
      const meta = await client.query('SELECT version FROM state_meta WHERE id=TRUE FOR UPDATE');
      const currentVersion = meta.rows[0]?.version || 1;
      if (ifMatch && String(currentVersion) !== String(ifMatch)) {
        await client.query('ROLLBACK');
        return res.status(412).json({ error: 'ETag mismatch' });
      }
      // Replace queue
      if (Array.isArray(body.queue)) {
        await client.query('DELETE FROM queue');
        for (const item of body.queue) {
          if (item && typeof item.position === 'number' && item.user_id) {
            await client.query('INSERT INTO queue(position, user_id) VALUES ($1,$2)', [item.position, item.user_id]);
          }
        }
      }
      // Replace spot assignments
      if (Array.isArray(body.spots)) {
        await client.query('UPDATE spots SET user_id=NULL');
        for (const s of body.spots) {
          if (s && s.id && (s.user_id === null || typeof s.user_id === 'number')) {
            await client.query('UPDATE spots SET user_id=$2 WHERE id=$1', [s.id, s.user_id]);
          }
        }
      }
      const next = await client.query('UPDATE state_meta SET version=version+1 RETURNING version, last_reset');
      await client.query('COMMIT');
      const etag = String(next.rows[0].version);
      res.setHeader('ETag', etag);
      // Return refreshed rows
      const spots = await pool.query('SELECT id, type, label, user_id FROM spots ORDER BY id');
      const queue = await pool.query('SELECT position, user_id FROM queue ORDER BY position');
      return res.status(200).json({ queue: queue.rows, spots: spots.rows, lastReset: next.rows[0]?.last_reset || null });
    }

    await client.query('ROLLBACK');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    return res.status(500).json({ error: 'Server error', details: String(err) });
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
