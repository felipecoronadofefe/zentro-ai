export default async function handler(req, res) {
  // Aceita GET só pra teste rápido no navegador
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      route: "/api/webhook",
      message: "Webhook online. Use POST para receber eventos da Z-API.",
    });
  }

  // Só aceita POST pra webhook da Z-API
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // ===== 1) Verifica variáveis de ambiente =====
  const INSTANCE_ID = process.env.ZAPI_INSTANCE_ID || "";
  const INSTANCE_TOKEN = process.env.ZAPI_INSTANCE_TOKEN || "";
  const CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || "";

  const envStatus = {
    hasInstance: Boolean(INSTANCE_ID),
    hasToken: Boolean(INSTANCE_TOKEN),
    hasClientToken: Boolean(CLIENT_TOKEN),
  };

  if (!envStatus.hasInstance || !envStatus.hasToken || !envStatus.hasClientToken) {
    console.log("VARIAVEIS_AUSENTES", envStatus);
    return res.status(500).json({ error: "Variáveis de ambiente ausentes", envStatus });
  }

  // ===== 2) Lê o payload do webhook =====
  const payload = req.body || {};
  console.log("WEBHOOK_RECEBIDO", JSON.stringify(payload));

  // ===== 3) Extrai o telefone e a mensagem (bem tolerante) =====
  // A Z-API costuma mandar "phone" ou "connectedPhone" dependendo do evento.
  const phone =
    payload.phone ||
    payload.connectedPhone ||
    payload.from ||
    payload.senderPhone ||
    "";

  // Texto pode vir em payload.text.message, payload.text, payload.message, etc.
  const text =
    (payload.text && typeof payload.text === "object" ? payload.text.message : payload.text) ||
    payload.message ||
    payload.body ||
    "";

  const safeText = typeof text === "string" ? text : JSON.stringify(text);

  if (!phone) {
    console.log("ERRO_PHONE_VAZIO");
    return res.status(200).json({ ok: true, ignored: true, reason: "phone is empty" });
  }

  // Se não tiver texto (tipo status/callback), só ignora
  if (!safeText || safeText.trim().length === 0) {
    return res.status(200).json({ ok: true, ignored: true, reason: "no text message" });
  }

  // ===== 4) Responde via Z-API =====
  // Endpoint mais comum:
  // POST https://api.z-api.io/instances/{INSTANCE_ID}/token/{INSTANCE_TOKEN}/send-text
  // Header: Client-Token: {CLIENT_TOKEN}
  const url = `https://api.z-api.io/instances/${INSTANCE_ID}/token/${INSTANCE_TOKEN}/send-text`;

  const replyText = `Recebi sua mensagem: "${safeText.trim()}"`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": CLIENT_TOKEN,
      },
      body: JSON.stringify({
        phone: phone,
        message: replyText,
      }),
    });

    const data = await r.json().catch(() => ({}));
    console.log("RESPOSTA_ZAPI_STATUS", r.status, "DATA", JSON.stringify(data));

    return res.status(200).json({ ok: true, sent: true, zapiStatus: r.status, zapi: data });
  } catch (err) {
    console.log("ERRO_ENVIO_ZAPI", String(err));
    return res.status(500).json({ ok: false, error: "Falha ao chamar Z-API" });
