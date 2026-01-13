export default async function handler(req, res) {
  try {
    // ===== GET para teste no navegador =====
    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        message: "Webhook online. Use POST.",
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false });
    }

    // ===== ENV VARS =====
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
      return res.status(500).json({
        ok: false,
        error: "Variáveis de ambiente ausentes",
        missing,
      });
    }

    // ===== BODY =====
    const body = req.body || {};
    console.log("WEBHOOK_RECEBIDO", body);

    const phone =
      body.phone ||
      body.connectedPhone ||
      body?.message?.phone ||
      "";

    const text =
      typeof body?.text?.message === "string"
        ? body.text.message.trim()
        : "";

    if (!phone || !text) {
      return res.status(200).json({ skipped: true });
    }

    // ===== ENVIO Z-API =====
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
