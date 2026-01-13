export default async function handler(req, res) {
  try {
    // 1. Validar método
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // 2. Variáveis de ambiente
    const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE;
    const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
    const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;

    if (!ZAPI_INSTANCE || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) {
      console.error("Variáveis de ambiente ausentes");
      return res.status(500).json({ error: "Env vars missing" });
    }

    const data = req.body;

    console.log("WEBHOOK RECEBIDO:", JSON.stringify(data));

    // 3. Ignorar mensagens de status
    if (data?.isStatusReply) {
      return res.status(200).json({ ok: true });
    }

    // 4. Extrair texto da mensagem
    const text =
      data?.text?.message ||
      data?.message?.text ||
      "";

    if (!text) {
      console.log("Mensagem sem texto");
      return res.status(200).json({ ok: true });
    }

    // 5. Extrair telefone corretamente
    let phone = "";

    if (data?.chatId) {
      phone = data.chatId.replace("@id", "").replace("@g.us", "");
    }

    if (!phone) {
      console.error("Telefone não encontrado");
      return res.status(200).json({ error: "Phone not found" });
    }

    // 6. Resposta automática
    const replyText = "Oi! 👋 Recebi sua mensagem com sucesso.";

    // 7. Enviar mensagem pela Z-API
    const response = await fetch(
      `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": ZAPI_CLIENT_TOKEN
        },
        body: JSON.stringify({
          phone,
          message: replyText
        })
      }
    );

    const result = await response.json();
    console.log("RESPOSTA Z-API:", result);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("ERRO GERAL:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
