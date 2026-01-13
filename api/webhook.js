export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;
  const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;

  if (!ZAPI_CLIENT_TOKEN || !ZAPI_INSTANCE_ID) {
    console.error("TOKEN OU INSTANCE ID NÃO CONFIGURADOS");
    return res.status(500).json({ error: "Z-API not configured" });
  }

  const data = req.body;
  console.log("WEBHOOK RECEBIDO:", JSON.stringify(data, null, 2));

  // exemplo simples: responder "Olá! 👋"
  const phone = data?.chatId;
  if (!phone) {
    return res.status(200).json({ ok: true });
  }

  await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_CLIENT_TOKEN}/send-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone,
      message: "Olá! 👋 Como posso te ajudar?"
    })
  });

  return res.status(200).json({ ok: true });
}
