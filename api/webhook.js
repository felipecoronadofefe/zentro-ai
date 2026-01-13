export default async function handler(req, res) {
  try {
    // Aceita apenas POST
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = req.body || {};
    console.log("WEBHOOK RECEBIDO:", JSON.stringify(body));

    // 🔹 Extrair texto de forma SEGURA (Z-API manda vários formatos)
    let text = "";

    if (
      body.message &&
      body.message.text &&
      typeof body.message.text === "string"
    ) {
      text = body.message.text.trim();
    }

    // Se não for mensagem de texto, ignora
    if (!text) {
      return res.status(200).json({ status: "ignored (no text)" });
    }

    // 🔹 Dados do chat
    const chatId =
      body.chatId ||
      body.chat?.id ||
      body.message?.chatId;

    if (!chatId) {
      return res.status(200).json({ status: "ignored (no chatId)" });
    }

    console.log("TEXTO RECEBIDO:", text);
    console.log("CHAT ID:", chatId);

    // 🔹 Enviar resposta via Z-API
    const response = await fetch(
      `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_INSTANCE_TOKEN}/send-text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": process.env.ZAPI_CLIENT_TOKEN,
        },
        body: JSON.stringify({
          phone: chatId,
          message: `Você disse: ${text}`,
        }),
      }
    );

    const result = await response.json();
    console.log("RESPOSTA Z-API:", result);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("ERRO GERAL:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
