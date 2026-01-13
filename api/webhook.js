export default function handler(req, res) {
  try {
    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        message: "Webhook ONLINE",
        method: "GET",
      });
    }

    if (req.method === "POST") {
      return res.status(200).json({
        ok: true,
        message: "POST recebido com sucesso",
        body: req.body ?? null,
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({
      error: "Function crashed",
      details: String(err),
    });
  }
}
