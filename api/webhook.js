export default async function handler(req, res) {
  try {
    // ===== GET pra teste no navegador =====
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, message: "Zentro webhook online. Use POST." });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    // ===== PAUSE/PLAY DO BOT =====
    // Na Vercel, defina BOT_ATIVO="true" para responder. Qualquer outra coisa pausa.
    const BOT_ATIVO = (process.env.BOT_ATIVO || "true").toLowerCase() === "true";
    if (!BOT_ATIVO) {
      return res.status(200).json({ ok: true, paused: true });
    }

    // ===== ENV VARS (Vercel) =====
    const ZAPI_INSTANCE_ID = (process.env.ZAPI_INSTANCE_ID || "").trim();
    const ZAPI_INSTANCE_TOKEN = (process.env.ZAPI_INSTANCE_TOKEN || "").trim();
    const ZAPI_CLIENT_TOKEN = (process.env.ZAPI_CLIENT_TOKEN || "").trim();
    const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();

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

    // ===== FILTROS ANTI-LOOP / RUÍDO =====
    // 1) Mensagem enviada por você (bot/instância) -> IGNORA
    if (body?.fromMe === true) return res.status(200).json({ ok: true, ignored: "fromMe" });

    // 2) Status/callback -> IGNORA
    if (body?.isStatusReply === true) return res.status(200).json({ ok: true, ignored: "isStatusReply" });

    // 3) Grupo -> IGNORA (pode remover se quiser atender grupos)
    if (body?.isGroup === true) return res.status(200).json({ ok: true, ignored: "isGroup" });

    // ===== EXTRAI TEXTO (no seu payload vinha body.text.message) =====
    const rawText =
      (typeof body?.text?.message === "string" && body.text.message) ||
      (typeof body?.message?.text === "string" && body.message.text) ||
      (typeof body?.message === "string" && body.message) ||
      "";

    const userText = String(rawText || "").trim();
    if (!userText) return res.status(200).json({ ok: true, ignored: "empty_text" });

    // Proteção extra contra eco
    if (userText.toLowerCase().startsWith("recebi:")) {
      return res.status(200).json({ ok: true, ignored: "echo_protection" });
    }

    // ===== EXTRAI DESTINO (no seu payload vinha chatId) =====
    // Preferimos chatId porque é o identificador do chat do cliente.
    const to =
      (typeof body?.chatId === "string" && body.chatId) ||
      (typeof body?.phone === "string" && body.phone) ||
      "";

    const toPhone = String(to || "").trim();
    if (!toPhone) return res.status(200).json({ ok: true, ignored: "phone_empty" });

    // ===== PROMPT GLOBAL (atendimento + venda) =====
    const systemPrompt = `
Você é a assistente virtual oficial da empresa do cliente.
Você fala como uma funcionária humana da empresa, nunca como uma IA.

Seu papel é atender, ajudar, esclarecer dúvidas e conduzir o cliente naturalmente para a melhor solução ou compra, sem pressão.

Sempre responda no mesmo idioma do cliente.
Seja educada, clara, profissional e próxima.
Use frases curtas e objetivas (máximo 3 frases).
Quando fizer sentido, incentive o próximo passo (ver opções, preços, finalizar pedido, falar com humano).
Nunca invente informações. Se não souber, peça detalhes ou direcione para um atendente humano.
    `.trim();

    // ===== CHAMADA OPENAI =====
    // Modelo: deixe por padrão. Se quiser mudar depois, crie OPENAI_MODEL na Vercel.
    const model = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

    const aiReply = await callOpenAI({
      apiKey: OPENAI_API_KEY,
      model,
      systemPrompt,
      userText,
    });

    // ===== ENVIA RESPOSTA PELA Z-API =====
    const zapiUrl = `https://api.z-api.io/instances/${encodeURIComponent(
      ZAPI_INSTANCE_ID
    )}/token/${encodeURIComponent(ZAPI_INSTANCE_TOKEN)}/send-text`;

    const zapiResp = await fetch(zapiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": ZAPI_CLIENT_TOKEN,
      },
      body: JSON.stringify({
        phone: toPhone,
        message: aiReply,
      }),
    });

    const zapiData = await zapiResp.json().catch(() => ({}));
    console.log("ZAPI_STATUS", zapiResp.status);
    console.log("ZAPI_BODY", zapiData);

    // Mesmo se a Z-API der erro, retornamos 200 pro webhook não reenviar infinitamente
    return res.status(200).json({ ok: true, sent: zapiResp.ok, reply: aiReply });
  } catch (err) {
    console.log("ERRO_GERAL", err?.message || err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}

async function callOpenAI({ apiKey, model, systemPrompt, userText }) {
  // Pequeno “atendimento inicial” pra ficar mais humano e econômico
  const low = userText.toLowerCase();
  if (low === "oi" || low === "olá" || low === "ola" || low === "hello" || low === "hi") {
    return "Olá! 👋 Posso te ajudar com produtos, preços ou pedidos?";
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
    }),
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    console.log("OPENAI_ERROR_STATUS", resp.status);
    console.log("OPENAI_ERROR_BODY", data);
    // Resposta fallback (pra não deixar o cliente no vácuo)
    return "Entendi 🙂 Pode me dizer mais detalhes do que você precisa? (produto/serviço e sua cidade, por exemplo)";
  }

  const content = data?.choices?.[0]?.message?.content;
  const text = (typeof content === "string" ? content.trim() : "");

  // Resposta fallback
  return text || "Perfeito 🙂 Me diga mais detalhes pra eu te orientar certinho.";
}
