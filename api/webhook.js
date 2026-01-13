export default async function handler(req, res) {
  try {
    // Permite testar no navegador
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, message: "Webhook online. Use POST." });
    }
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    // ===== ENV VARS (Vercel) =====
    const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID || "";
    const ZAPI_INSTANCE_TOKEN = process.env.ZAPI_INSTANCE_TOKEN || "";
    const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || "";
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
    const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.2";

    const missing = {
      hasInstance: !!ZAPI_INSTANCE_ID,
      hasToken: !!ZAPI_INSTANCE_TOKEN,
      hasClientToken: !!ZAPI_CLIENT_TOKEN,
      hasOpenAIKey: !!OPENAI_API_KEY,
    };

    if (!missing.hasInstance || !missing.hasToken || !missing.hasClientToken || !missing.hasOpenAIKey) {
      console.log("VARIAVEIS_AUSENTES", missing);
      return res.status(500).json({ ok: false, error: "Variáveis de ambiente ausentes", missing });
    }

    // ===== BODY =====
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    console.log("WEBHOOK_RECEBIDO", body);

    // ===== FILTROS ANTI-LOOP =====
    // (1) Ignora mensagens enviadas por você mesmo / status / grupo
    if (body?.fromMe === true) return res.status(200).json({ ok: true, ignored: "fromMe" });
    if (body?.isStatusReply === true) return res.status(200).json({ ok: true, ignored: "isStatusReply" });
    if (body?.isGroup === true) return res.status(200).json({ ok: true, ignored: "isGroup" });

    // ===== EXTRAI TEXTO =====
    const text =
      body?.text?.message ??
      body?.message?.text ??
      body?.message ??
      body?.body ??
      "";

    const incomingText = (typeof text === "string" ? text : "").trim();
    if (!incomingText) return res.status(200).json({ ok: true, ignored: "empty_text" });

    // Se chegar algo que comece com "Recebi:", ignora (extra segurança)
    if (incomingText.toLowerCase().startsWith("recebi:")) {
      return res.status(200).json({ ok: true, ignored: "echo_protection" });
    }

    // ===== EXTRAI PHONE =====
    const phone =
      body?.phone ??
      body?.connectedPhone ??
      body?.chatId ??
      "";

    const toPhone = (typeof phone === "string" ? phone : "").trim();
    if (!toPhone) {
      console.log("PHONE_VAZIO", { phone, bodyKeys: Object.keys(body || {}) });
      return res.status(200).json({ ok: true, ignored: "phone_empty" });
    }

    // ===== CHAMA OPENAI (ChatGPT) =====
    // Exemplo oficial de autenticação Bearer e /v1/chat/completions.  [oai_citation:0‡OpenAI Platform](https://platform.openai.com/docs/guides/latest-model?utm_source=chatgpt.com)
    const systemPrompt =
      "Você é a Zentro AI. Responda em português do Brasil, de forma curta, direta e útil. No máximo 2 frases.";

    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: incomingText },
        ],
        // pode remover se quiser
        verbosity: "low",
      }),
    });

    const openaiJson = await openaiResp.json();
    if (!openaiResp.ok) {
      console.log("OPENAI_ERRO", openaiJson);
      return res.status(500).json({ ok: false, error: "Erro OpenAI", details: openaiJson });
    }

    const aiText =
      openaiJson?.choices?.[0]?.message?.content?.trim() ||
      "Não consegui gerar resposta agora.";

    // ===== ENVIA RESPOSTA PELA Z-API =====
    const zapiUrl = `https://api.z-api.io/instances/${encodeURIComponent(
      ZAPI_INSTANCE_ID
    )}/token/${encodeURIComponent(ZAPI_INSTANCE_TOKEN)}/send-text?phone=${encodeURIComponent(toPhone)}`;

    const zapiResp = await fetch(zapiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": ZAPI_CLIENT_TOKEN,
      },
      body: JSON.stringify({
        phone: toPhone,
        message: aiText,
      }),
    });

    const zapiJson = await zapiResp.json().catch(() => ({}));
    if (!zapiResp.ok) {
      console.log("ZAPI_ERRO", zapiJson);
      return res.status(500).json({ ok: false, error: "Erro Z-API", details: zapiJson });
    }

    return res.status(200).json({ ok: true, received: incomingText, reply: aiText });
  } catch (err) {
    console.log("ERRO_GERAL", err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
