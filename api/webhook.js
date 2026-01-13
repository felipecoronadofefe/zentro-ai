export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  console.log("WEBHOOK RECEBIDO:", JSON.stringify(req.body, null, 2));

  return res.status(200).json({ ok: true });
}
