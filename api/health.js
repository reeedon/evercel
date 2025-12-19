export default async function handler(req, res) {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  res.status(200).json({ ok: true, hasDbUrl });
}
