export default async function handler(req, res) {
  try {
    // ===== GET pra teste no navegador =====
    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        message: "Zentro webhook online. Use POST.",
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    // ===== CONTROLE LIGA/DESLIGA =====
    // Na Vercel: BOT_ATIVO="true" (liga) / "false" (pausa)
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
      return res.status(500).json({
        ok: false,
        error: "Variáveis de ambiente ausentes",
        missing,
      });
    }

    // ===== BODY =====
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    console.log("WEBHOOK_RECEBIDO", body);

    // ===== FILTROS (anti-loop / ruído) =====
    // 1) Mensagem enviada por você mesmo -> IGNORA (evita looping)
    if (body?.fromMe === true) return res.status(200).json({ ok: true, ignored: "fromMe" });

    // 2) Status/callback -> IGNORA
    if (body?.isStatusReply === true) return res.status(200).json({ ok: true, ignored: "isStatusReply" });

    // 3) Grupo -> IGNORA (remove se quiser atender grupos)
    if (body?.isGroup === true) return res.status(200).json({ ok: true, ignored: "isGroup" });

    // ===== EXTRAI TEXTO =====
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

    // ===== EXTRAI DESTINO (chatId normalmente identifica o chat do cliente) =====
    const to =
      (typeof body?.chatId === "string" && body.chatId) ||
      (typeof body?.phone === "string" && body.phone) ||
      "";

    const toPhone = String(to || "").trim();
    if (!toPhone) return res.status(200).json({ ok: true, ignored: "phone_empty" });

    // ===== PROMPT FINAL GLOBAL (atendimento + venda + idioma automático) =====
    const systemPrompt = `
Você é a assistente virtual oficial da empresa do cliente.
Você fala como uma funcionária humana da empresa, nunca como uma IA ou robô.

Seu papel é atender, ajudar, esclarecer dúvidas e conduzir o cliente naturalmente para a melhor solução ou compra, sem pressão.

Sempre responda no mesmo idioma da última mensagem do cliente.
Se o cliente escrever em inglês, responda em inglês.
Se escrever em espanhol, responda em espanhol.

Seja educada, clara, profissional e próxima.
Use frases curtas e objetivas (máximo de 3 frases).

Quando fizer sentido, incentive o próximo passo (ver opções, preços, disponibilidade, finalizar pedido ou falar com um atendente humano).

Nunca invente informações.
Se não souber algo, peça mais detalhes ou direcione para um atendente humano.

Evite respostas longas, técnicas ou genéricas.
Seu objetivo é resolver rápido e ajudar a vender.
    `.trim();

    // ===== CHAMADA OPENAI =====
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

    // Retorna 200 pro webhook não reenviar infinito
    return res.status(200).json({ ok: true, sent: zapiResp.ok, reply: aiReply });
  } catch (err) {
    console.log("ERRO_GERAL", err?.message || err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}

async function callOpenAI({ apiKey, model, systemPrompt, userText }) {
  // Pequeno “oi” padrão pra ficar mais humano e economizar
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
    // fallback: não deixa o cliente no vácuo
    return "Entendi 🙂 Pode me dizer mais detalhes do que você precisa? (produto/serviço e sua cidade, por exemplo)";
  }

  const content = data?.choices?.[0]?.message?.content;
  const text = (typeof content === "string" ? content.trim() : "");
  return text || "Perfeito 🙂 Me diga mais detalhes pra eu te orientar certinho.";
}
