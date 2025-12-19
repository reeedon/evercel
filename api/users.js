
// api/users.js
import { neon } from '@neondatabase/serverless';

function logError(res, err, context = 'users') {
  console.error(`[users-api] ${context} error:`, err);
  return res.status(500).json({ error: 'Server error', details: String(err) });
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Missing DATABASE_URL' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    // ✅ Ensure base table for users (DDL via tagged template)
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id   SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        pref TEXT NOT NULL CHECK (pref IN ('both','tesla','chargepoint'))
      );
    `;

    if (req.method === 'GET') {
      // Return all users
      const rows = await sql`SELECT id, name, pref FROM users ORDER BY name`;
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      // Safe body parsing
      let body = req.body;
      if (!body) {
        try { body = JSON.parse(req.rawBody?.toString() || '{}'); }
        catch { body = {}; }
      }

      const { name: rawName, pref = 'both' } = body;
      const name = String(rawName || '').trim().replace(/\s+/g, ' ');
      if (!name) return res.status(400).json({ error: 'Name required' });
      if (!['both', 'tesla', 'chargepoint'].includes(pref)) {
        return res.status(400).json({ error: 'Invalid pref' });
      }

      try {
        const inserted =
          await sql`INSERT INTO users (name, pref) VALUES (${name}, ${pref}) RETURNING id, name, pref`;
        return res.status(201).json(inserted[0]);
      } catch (err) {
        const msg = String(err).toLowerCase();
        if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('already exists')) {
          return res.status(409).json({ error: 'User exists' });
        }
        return logError(res, err, 'insert');
      }
    }

    if (req.method === 'DELETE') {
      // Support both ?id=123 and /api/users/123
      const idStr = (req.query?.id || req.url.split('/').pop());
      const id = parseInt(idStr, 10);
      if (!id) return res.status(400).json({ error: 'Invalid id' });

      // Clean references if those tables exist. If they don't, ignore errors safely.
      try { await sql`DELETE FROM queue WHERE user_id=${id}`; } catch {}
      try { await sql`UPDATE spots SET user_id=NULL WHERE user_id=${id}`; } catch {}

      const del = await sql`DELETE FROM users WHERE id=${id}`;
      if (del.count === 0) return res.status(404).json({ error: 'Not found' });

      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return logError(res, err, 'root');
  }
}
``
