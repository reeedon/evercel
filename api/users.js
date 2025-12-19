
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

   
// DELETE: remove user by id and scrub references from queue/spots
if (req.method === 'DELETE') {
  const idStr = (req.query?.id || req.url.split('/').pop());
  const id = parseInt(idStr, 10);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  // 1) Remove from queue
  await sql`DELETE FROM queue WHERE user_id=${id}`;

  // 2) Free any charger assignments
  await sql`UPDATE spots SET user_id=NULL WHERE user_id=${id}`;

  // 3) Delete the user
  const del = await sql`DELETE FROM users WHERE id=${id}`;
  if (del.count === 0) return res.status(404).json({ error: 'Not found' });

  return res.status(204).end();
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
