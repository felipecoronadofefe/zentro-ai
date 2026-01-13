// api/webhook.js
export default async function handler(req, res) {
  try {
    // Aceita GET só pra testar no navegador sem dar 405
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, message: "Webhook online. Use POST." });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    // ====== ENV VARS (Vercel) ======
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
      return res.status(500).json({ ok: false, error: "Variáveis de ambiente ausentes", missing });
    }

    // ====== BODY ======
    const body = req.body || {};
    console.log("WEBHOOK_RECEBIDO", body);

    // ====== EXTRAI PHONE E TEXTO (Z-API costuma mandar assim) ======
    const phone =
      body.phone ||
      body.connectedPhone ||
      body?.message?.phone ||
      body?.data?.phone ||
      "";

    const incomingText =
      body?.text?.message ??
      body?.message?.text ??
      body?.data?.text ??
      body?.body ??
      "";

    const text = typeof incomingText === "string" ? incomingText.trim() : "";

    if (!phone) {
      console.log("ERRO: phone is empty");
      return res.status(200).json({ ok: true, skipped: true, reason: "phone is empty" });
    }

    if (!text) {
      console.log("ERRO: text is empty");
      return res.status(200).json({ ok: true, skipped: true, reason: "text is empty" });
    }

    // ====== RESPOSTA SIMPLES (pra testar) ======
    const replyMessage = `Recebi: "${text}"`;

    // ====== CHAMA Z-API PRA ENVIAR TEXTO ======
    const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/send-text`;

    const zapiResp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": ZAPI_CLIENT_TOKEN,
      },
      body: JSON.stringify({
        phone,
        message: replyMessage,
      }),
    });

    const zapiData = await zapiResp.json().catch(() => ({}));
    console.log("RESPOSTA_ZAPI_STATUS", zapiResp.status);
    console.log("RESPOSTA_ZAPI_BODY", zapiData);

    // Se Z-API der erro, ainda respondemos 200 pro webhook não ficar repetindo
    return res.status(200).json({
      ok: true,
      sent: zapiResp.ok,
      phone,
      receivedText: text,
      zapiStatus: zapiResp.status,
      zapiData,
    });
  } catch (err) {
    console.log("ERRO_GERAL", err?.message || err);
    return res.status(500).json({ ok: false, error: "Serverless crashed", details: String(err?.message || err) });
  }
}
