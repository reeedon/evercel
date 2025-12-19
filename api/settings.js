
import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // ...CORS + guards...

  try {
    const sql = neon(process.env.DATABASE_URL);

    // ✅ Create table with inline template
    await sql`
      CREATE TABLE IF NOT EXISTS settings (
        id BOOLEAN PRIMARY KEY DEFAULT TRUE,
        reset_time TEXT NOT NULL DEFAULT '06:00'
      );
    `;
    // ✅ Seed singleton row safely
    await sql`INSERT INTO settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING`;

    if (req.method === 'GET') {
      const rows = await sql`SELECT reset_time FROM settings WHERE id=TRUE`;
      return res.status(200).json({ resetTime: rows[0]?.reset_time || '06:00' });
    }

    if (req.method === 'PUT') {
      let body = req.body;
      if (!body) {
        try { body = JSON.parse(req.rawBody?.toString() || '{}'); }
        catch { body = {}; }
      }
      const t = String(body.resetTime || '').trim();
      if (!/^\d{2}:\d{2}$/.test(t)) return res.status(400).json({ error: 'Invalid resetTime. Use HH:MM' });

      await sql`UPDATE settings SET reset_time=${t} WHERE id=TRUE`;
      return res.status(200).json({ resetTime: t });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[settings-api] error:', err);
    return res.status(500).json({ error: 'Server error', details: String(err) });
  }
}
