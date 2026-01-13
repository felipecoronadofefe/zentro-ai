export default async function handler(req, res) {
  // Deixa só POST (Z-API manda POST no webhook)
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};

    // Evita loop: se for mensagem enviada por você/instância, não responde
    const sentByMe =
      body.fromMe === true ||
      body.isSentByMe === true ||
      body.sentByMe === true ||
      body.isMe === true;

    if (sentByMe) {
      return res.status(200).json({ ok: true, ignored: "sent_by_me" });
    }

    const chatId = body.chatId || body.phone || body.from || body.sender?.id;

    // Tenta achar o texto em vários formatos possíveis
    const text =
      body.text?.message ||
      body.text?.body ||
      body.message?.text ||
      body.message ||
      body.body ||
      "";

    console.log("WEBHOOK RECEBIDO:", JSON.stringify(body, null, 2));

    if (!chatId) {
      return res.status(200).json({ ok: true, warning: "no_chatId" });
    }

    const replyText = "Olá! 👋 Sou a Zentro AI. Em instantes eu te respondo.";

    // ENV VARS na Vercel:
    // ZAPI_INSTANCE_ID = seu ID
    // ZAPI_TOKEN = seu token
    const instanceId = process.env.ZAPI_INSTANCE_ID;
    const token = process.env.ZAPI_TOKEN;

    if (!instanceId || !token) {
      console.log("FALTANDO ENV VARS: ZAPI_INSTANCE_ID ou ZAPI_TOKEN");
      return res.status(200).json({ ok: true, warning: "missing_env" });
    }

    // Endpoint padrão de envio de texto da Z-API
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

    // Alguns setups aceitam "phone" ou "chatId".
    // Vamos mandar os dois pra ser mais compatível.
    const payload = {
      phone: chatId,
      chatId: chatId,
      message: replyText,
    };

    const zapiResp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const zapiJson = await zapiResp.json().catch(() => ({}));
    console.log("RESPOSTA Z-API:", zapiResp.status, JSON.stringify(zapiJson));

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.log("ERRO WEBHOOK:", err);
    return res.status(200).json({ ok: true, error: "exception" });
  }
}
