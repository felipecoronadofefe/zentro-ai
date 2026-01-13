export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE;
    const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
    const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;

    if (!ZAPI_INSTANCE || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) {
      console.error("VARIAVEIS_AUSENTES", {
        hasInstance: !!ZAPI_INSTANCE,
        hasToken: !!ZAPI_TOKEN,
        hasClientToken: !!ZAPI_CLIENT_TOKEN,
      });
      return res.status(500).json({ error: "Env vars missing" });
    }

    // ✅ garantir parse do body (às vezes vem string)
    const data = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    console.log("WEBHOOK_RECEBIDO_KEYS:", Object.keys(data || {}));
    console.log("WEBHOOK_RECEBIDO_RAW:", JSON.stringify(data));

    // ignorar status
    if (data?.isStatusReply) {
      return res.status(200).json({ ok: true });
    }

    // texto (bem tolerante)
    const text =
      data?.text?.message ??
      data?.message?.text ??
      data?.message?.body ??
      data?.messages?.[0]?.text ??
      data?.messages?.[0]?.body ??
      "";

    // 🔎 achar chatId em vários lugares possíveis
    const chatId =
      data?.chatId ??
      data?.message?.chatId ??
      data?.messages?.[0]?.chatId ??
      data?.data?.chatId ??
      "";

    // ✅ transformar chatId em phone (remove sufixos)
    let phone = "";
    if (typeof chatId === "string" && chatId.length > 0) {
      phone = chatId
        .replace("@id", "")
        .replace("@c.us", "")
        .replace("@g.us", "")
        .replace(/\D/g, ""); // deixa só números
    }

    console.log("DEBUG_TEXT:", text);
    console.log("DEBUG_CHATID:", chatId);
    console.log("DEBUG_PHONE:", phone);

    if (!phone) {
      console.error("PHONE_EMPTY_DETECTED");
      // responde 200 pra não ficar re-tentando sem parar
      return res.status(200).json({ error: "Phone empty (not found in payload)" });
    }

    const replyText = "Oi! 👋 Recebi sua mensagem com sucesso.";

    const response = await fetch(
      `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": ZAPI_CLIENT_TOKEN,
        },
        body: JSON.stringify({
          phone,
          message: replyText,
        }),
      }
    );

    const result = await response.json();
    console.log("RESPOSTA_ZAPI_STATUS:", response.status);
    console.log("RESPOSTA_ZAPI_BODY:", result);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("ERRO_GERAL:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
