
import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // ...CORS + guards...

  try {
    const sql = neon(process.env.DATABASE_URL);

    // ✅ Inline, tagged template (no string variables)
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id   SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        pref TEXT NOT NULL CHECK (pref IN ('both','tesla','chargepoint'))
      );
    `;

    if (req.method === 'GET') {
      const rows = await sql`SELECT id, name, pref FROM users ORDER BY name`;
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      // Safe JSON parsing fallback (in case req.body wasn't parsed)
      let body = req.body;
      if (!body) {
        try { body = JSON.parse(req.rawBody?.toString() || '{}'); }
        catch { body = {}; }
      }
      const { name: rawName, pref = 'both' } = body;
      const name = String(rawName || '').trim().replace(/\s+/g, ' ');
      if (!name) return res.status(400).json({ error: 'Name required' });
      if (!['both','tesla','chargepoint'].includes(pref)) {
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
        console.error('[users-api] insert error:', err);
        return res.status(500).json({ error: 'Server error', details: String(err) });
      }
    }

    // ...DELETE branch...

  } catch (err) {
    console.error('[users-api] root error:', err);
    return res.status(500).json({ error: 'Server error', details: String(err) });
  }
}
