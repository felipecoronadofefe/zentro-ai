export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, message: "Webhook online. Use POST." });
    }
    if (req.method !== "POST") return res.status(405).json({ ok: false });

    const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID || "";
    const ZAPI_INSTANCE_TOKEN = process.env.ZAPI_INSTANCE_TOKEN || "";
    const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || "";

    const missing = {
      hasInstance: !!ZAPI_INSTANCE_ID,
      hasToken: !!ZAPI_INSTANCE_TOKEN,
      hasClientToken: !!ZAPI_CLIENT_TOKEN,
    };
    if (!missing.hasInstance || !missing.hasToken || !missing.hasClientToken) {
      console.log("VARIAVEIS_AUSENTES", missing);
      return res.status(500).json({ ok: false, error: "Variáveis ausentes", missing });
    }

    const body = req.body || {};

    // ✅ 1) Ignora mensagens de status/callbacks
    if (body.isStatusReply === true || body.type === "ReceivedCallback") {
      return res.status(200).json({ skipped: true, reason: "status/callback" });
    }

    // ✅ 2) Ignora mensagens ENVIADAS POR VOCÊ (evita loop)
    // Em muitos payloads da Z-API isso vem como fromMe / fromAPI / sentByMe / isSentByMe
    const fromMe =
      body.fromMe === true ||
      body.fromAPI === true ||
      body.sentByMe === true ||
      body.isSentByMe === true ||
      body?.message?.fromMe === true;

    if (fromMe) {
      return res.status(200).json({ skipped: true, reason: "fromMe" });
    }

    // ✅ 3) Pega texto/telefone em vários formatos
    const phone =
      body.phone ||
      body.connectedPhone ||
      body?.message?.phone ||
      body?.chatId ||
      "";

    const rawText =
      (typeof body?.text?.message === "string" && body.text.message) ||
      (typeof body?.message?.text === "string" && body.message.text) ||
      (typeof body?.message === "string" && body.message) ||
      "";

    const text = String(rawText || "").trim();

    // Se não tem texto ou não tem phone, não faz nada
    if (!phone || !text) {
      return res.status(200).json({ skipped: true, reason: "missing phone/text" });
    }

    // ✅ 4) Trava extra: se já começa com "Recebi:" não responde de novo
    if (text.toLowerCase().startsWith("recebi:")) {
      return res.status(200).json({ skipped: true, reason: "already echoed" });
    }

    // ✅ 5) Responde
    const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/send-text`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": ZAPI_CLIENT_TOKEN,
      },
      body: JSON.stringify({
        phone,
        message: `Recebi: ${text}`,
      }),
    });

    const data = await response.json();
    console.log("ZAPI_RESPONSE", data);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("ERRO_FATAL", err);
    return res.status(500).json({ error: "Crash interno" });
  }
}
