export default async function handler(req, res) {
  // Aceita só POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Lê variáveis de ambiente
  const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE || "";
  const ZAPI_TOKEN = process.env.ZAPI_TOKEN || "";
  const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || "";

  const hasInstance = Boolean(ZAPI_INSTANCE.trim());
  const hasToken = Boolean(ZAPI_TOKEN.trim());
  const hasClientToken = Boolean(ZAPI_CLIENT_TOKEN.trim());

  // Se faltar env, já avisa no log e retorna 200 (pra Z-API não ficar reenviando)
  if (!hasInstance || !hasToken || !hasClientToken) {
    console.log("VARIAVEIS_AUSENTES", { hasInstance, hasToken, hasClientToken });
    return res.status(200).json({ ok: false, error: "missing_env" });
  }

  // Body do webhook
  const body = req.body || {};
  console.log("WEBHOOK_RECEBIDO", body);

  // Tenta achar o texto
  const text =
    (body?.text?.message ?? body?.message ?? body?.body ?? body?.text ?? "")
      .toString()
      .trim();

  // Tenta achar o telefone
  // Prioridade: body.phone -> body.chatId (extrai dígitos)
  let phone = (body?.phone ?? "").toString().trim();

  if (!phone) {
    const chatId = (body?.chatId ?? "").toString();
    // extrai somente números do chatId
    phone = chatId.replace(/\D/g, "");
  }

  // Se ainda não tem phone, só encerra (não tenta enviar)
  if (!phone) {
    console.log("PHONE_AUSENTE");
    return res.status(200).json({ ok: true, skipped: "no_phone" });
  }

  // Se não tem texto (ex: evento de status), não responde
  if (!text) {
    console.log("SEM_TEXTO (ignorado)");
    return res.status(200).json({ ok: true, skipped: "no_text" });
  }

  // Monta resposta simples
  const reply = `Recebi: ${text}`;

  // Endpoint oficial send-text (padrão Z-API)
  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": ZAPI_CLIENT_TOKEN,
      },
      body: JSON.stringify({
        phone,
        message: reply,
      }),
    });

    const data = await resp.json().catch(() => ({}));
    console.log("RESPOSTA_ZAPI_STATUS", resp.status);
    console.log("RESPOSTA_ZAPI_BODY", data);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.log("ERRO_FETCH_ZAPI", err?.message || err);
    return res.status(200).json({ ok: false, error: "fetch_failed" });
  }
}
