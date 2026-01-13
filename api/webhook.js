function onlyDigits(str = "") {
  return String(str).replace(/\D+/g, "");
}

function extractIncomingText(body) {
  // Tenta vários formatos comuns
  return (
    body?.text ||
    body?.message ||
    body?.body?.text ||
    body?.body?.message ||
    body?.messages?.[0]?.text ||
    body?.messages?.[0]?.message ||
    body?.data?.text ||
    body?.data?.message ||
    body?.data?.body ||
    ""
  );
}

function extractChatId(body) {
  return (
    body?.chatId ||
    body?.data?.chatId ||
    body?.messages?.[0]?.chatId ||
    body?.from ||
    body?.data?.from ||
    ""
  );
}

async function sendZapiText({ phone, message }) {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const instanceToken = process.env.ZAPI_TOKEN; // token da instância
  const clientToken = process.env.ZAPI_CLIENT_TOKEN; // client-token (segurança extra)

  if (!instanceId || !instanceToken) {
    throw new Error("Missing ZAPI_INSTANCE_ID or ZAPI_TOKEN in env vars");
  }
  if (!clientToken) {
    throw new Error("Missing ZAPI_CLIENT_TOKEN in env vars");
  }

  const url = `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/send-text`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": clientToken, // ✅ AQUI está o segredo do seu erro
    },
    body: JSON.stringify({
      phone,
      message,
    }),
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    const errMsg = data?.error || JSON.stringify(data) || "Unknown Z-API error";
    throw new Error(`Z-API ${resp.status}: ${errMsg}`);
  }

  return data;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = req.body || {};
    console.log("WEBHOOK RECEBIDO:", JSON.stringify(body, null, 2));

    // 1) Captura texto e chatId
    const text = extractIncomingText(body).trim();
    const chatId = extractChatId(body);

    // chatId às vezes vem tipo: "5511999999999@c.us"
    const phone = onlyDigits(chatId);

    // Se não tiver telefone, só confirma recebimento
    if (!phone) {
      return res.status(200).json({ ok: true, note: "No phone/chatId found" });
    }

    // 2) Cria resposta (por enquanto simples, só pra validar)
    const reply = text ? `Recebi: ${text}` : "Recebi seu contato ✅";

    // 3) Envia resposta
    const zapiResp = await sendZapiText({ phone, message: reply });
    console.log("RESPOSTA Z-API:", JSON.stringify(zapiResp, null, 2));

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("ERRO:", err?.message || err);
    return res.status(500).json({ ok: false, error: err?.message || "error" });
  }
};
