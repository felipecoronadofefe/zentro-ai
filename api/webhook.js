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
    console.log("WEBHOOK_RECEBIDO_KEYS", Object.keys(body));
    console.log("WEBHOOK_RECEBIDO", body);

    // ✅ Ignora só mensagens ENVIADAS POR VOCÊ (pra não entrar em loop)
    const fromMe =
      body.fromMe === true ||
      body.sentByMe === true ||
      body.isSentByMe === true ||
      body?.message?.fromMe === true;

    if (fromMe) {
      console.log("IGNORADO_FROM_ME");
      return res.status(200).json({ skipped: true, reason: "fromMe" });
    }

    // ✅ Pega texto (vários formatos)
    const rawText =
      (typeof body?.text?.message === "string" && body.text.message) ||
      (typeof body?.message?.text === "string" && body.message.text) ||
      (typeof body?.message === "string" && body.message) ||
      "";

    const text = String(rawText || "").trim();

    // ✅ Pega phone/chatId (vários formatos)
    const phone =
      body.phone ||
      body.connectedPhone ||
      body?.message?.phone ||
      body.chatId || // no seu print vinha chatId
      "";

    if (!phone || !text) {
      console.log("IGNORADO_SEM_PHONE_OU_TEXTO", { phone: !!phone, text: !!text });
      return res.status(200).json({ skipped: true, reason: "missing phone/text" });
    }

    // ✅ Trava extra: evita eco infinito caso volte "Recebi:"
    if (text.toLowerCase().startsWith("recebi:")) {
      console.log("IGNORADO_JA_ECOU");
      return res.status(200).json({ skipped: true, reason: "already echoed" });
    }

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
    console.log("ZAPI_RESPONSE_STATUS", response.status);
    console.log("ZAPI_RESPONSE", data);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("ERRO_FATAL", err);
    return res.status(500).json({ error: "Crash interno" });
  }
}
