export default async function handler(req, res) {
  try {
    // Só aceita POST
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const data = req.body;

    console.log("WEBHOOK RECEBIDO:", JSON.stringify(data, null, 2));

    // Ignora status e mensagens enviadas por você
    if (data.isStatusReply === true || data.fromMe === true) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    // Extrai texto corretamente (Z-API envia como objeto)
    let messageText = "";

    if (data.text && typeof data.text === "object") {
      messageText = data.text.message || "";
    }

    messageText = messageText.toString().trim();

    if (!messageText) {
      return res.status(200).json({ ok: true, empty: true });
    }

    const chatId = data.chatId;

    // ENV VARS (Vercel)
    const INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
    const INSTANCE_TOKEN = process.env.ZAPI_INSTANCE_TOKEN;
    const CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;

    if (!INSTANCE_ID || !INSTANCE_TOKEN || !CLIENT_TOKEN) {
      console.error("Variáveis de ambiente ausentes");
      return res.status(500).json({ error: "Missing env vars" });
    }

    // Resposta automática simples
    const responseText = `Recebi sua mensagem: "${messageText}"`;

    const zapiResponse = await fetch(
      `https://api.z-api.io/instances/${INSTANCE_ID}/token/${INSTANCE_TOKEN}/send-text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": CLIENT_TOKEN
        },
        body: JSON.stringify({
          phone: chatId,
          message: responseText
        })
      }
    );

    const zapiResult = await zapiResponse.json();

    console.log("RESPOSTA Z-API:", zapiResult);

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("ERRO GERAL:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
