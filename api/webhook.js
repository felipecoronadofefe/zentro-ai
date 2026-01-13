{
  "name": "zentro-ai",
  "version": "1.0.0",
  "private": true
}
export default function handler(req, res) {
  const hasInstance = !!process.env.ZAPI_INSTANCE_ID;
  const hasToken = !!process.env.ZAPI_INSTANCE_TOKEN;
  const hasClientToken = !!process.env.ZAPI_CLIENT_TOKEN;

  return res.status(200).json({
    ok: true,
    env: {
      hasInstance,
      hasToken,
      hasClientToken
    },
    hint:
      "Se algum estiver false em Production, suas variáveis não estão aplicadas nesse projeto/deploy."
  });
}
async function safeJson(req) {
  try {
    return typeof req.body === "object" && req.body ? req.body : {};
  } catch {
    return {};
  }
}

function extractPhone(body) {
  // Tentativas comuns no Z-API
  // 1) connectedPhone (telefone da instância) - NÃO é o destino
  // 2) phone / from / chatId / participant / etc (o destino varia)
  // Vamos priorizar algo que pareça "5511...."
  const candidates = [
    body.phone,
    body.from,
    body.chatId,
    body?.text?.phone,
    body?.message?.phone,
    body?.message?.from,
    body?.data?.phone,
    body?.data?.from,
    body?.data?.chatId
  ].filter(Boolean);

  // Normaliza: deixa só dígitos
  const cleaned = candidates
    .map((v) => String(v).replace(/\D/g, ""))
    .find((v) => v.length >= 10);

  return cleaned || null;
}

async function sendZapiMessage({ toPhone, text }) {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const instanceToken = process.env.ZAPI_INSTANCE_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  const missing = {
    hasInstance: !!instanceId,
    hasToken: !!instanceToken,
    hasClientToken: !!clientToken
  };

  if (!missing.hasInstance || !missing.hasToken || !missing.hasClientToken) {
    console.log("VARIAVEIS_AUSENTES", missing);
    return { ok: false, error: "missing_env", missing };
  }

  // ⚠️ Endpoint padrão (pode variar por conta/versão do Z-API)
  // Se o seu Z-API usa outro endpoint, me manda um print da documentação “send message”
  const url = `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/send-text`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": clientToken
    },
    body: JSON.stringify({
      phone: toPhone,
      message: text
    })
  });

  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

export default async function handler(req, res) {
  // Z-API normalmente manda POST no webhook
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const body = await safeJson(req);

  // Log pra você ver o payload chegando (sem segredos)
  console.log("WEBHOOK_RECEBIDO", {
    keys: Object.keys(body || {}),
    chatId: body?.chatId,
    from: body?.from,
    phone: body?.phone,
    hasTextObj: !!body?.text,
    connectedPhone: body?.connectedPhone
  });

  const toPhone = extractPhone(body);

  if (!toPhone) {
    console.log("ERRO: phone_destino_nao_encontrado");
    return res.status(200).json({ ok: true, note: "phone_not_found_in_payload" });
  }

  const result = await sendZapiMessage({
    toPhone,
    text: "Olá! Recebi sua mensagem ✅"
  });

  console.log("RESPOSTA_ZAPI", result);

  return res.status(200).json({ ok: true, result });
}
