// Relais vers Groq (vision) pour lire un numéro de série gravé/imprimé sur
// une photo de matériel. La clé Groq reste côté serveur (secret Supabase) :
// le navigateur ne la voit jamais. Accès restreint aux comptes connectés via
// verify_jwt = true (supabase/config.toml) — seuls les admins ont un compte.

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')
// Gamme Groq vision au 2026-08 : qwen3.6-27b / qwen3.8-27b (voir
// https://console.groq.com/docs/vision). Vérifier ce nom si Groq fait
// évoluer sa gamme de modèles.
const GROQ_MODEL = 'qwen/qwen3.6-27b'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (!GROQ_API_KEY) {
    return Response.json(
      { error: 'GROQ_API_KEY non configurée côté serveur.' },
      { status: 500, headers: corsHeaders },
    )
  }

  let body: { imageBase64?: string; mimeType?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON invalide.' }, { status: 400, headers: corsHeaders })
  }

  const { imageBase64, mimeType } = body
  if (!imageBase64 || !mimeType) {
    return Response.json(
      { error: 'imageBase64 et mimeType requis.' },
      { status: 400, headers: corsHeaders },
    )
  }

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0,
      max_tokens: 100,
      // Ce modèle a un mode "réflexion" qui peut consommer tout le budget de
      // tokens en raisonnement caché sans jamais produire la réponse finale.
      // On le désactive : la tâche (lire un numéro) n'en a pas besoin.
      reasoning_effort: 'none',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                "Cette photo montre un numéro de série gravé ou imprimé sur du matériel " +
                'métallique (mousqueton, poulie, corde...). Réponds UNIQUEMENT avec le ' +
                "numéro de série exact que tu lis (lettres et chiffres, sans espace ni " +
                "texte autour). Attention aux confusions fréquentes 0/O, 1/I, B/8. " +
                "Si tu ne peux pas lire de numéro avec certitude, réponds exactement: AUCUN",
            },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
    }),
  })

  if (!groqRes.ok) {
    const detail = await groqRes.text()
    return Response.json(
      { error: `Erreur Groq (${groqRes.status})`, detail },
      { status: 502, headers: corsHeaders },
    )
  }

  const groqData = await groqRes.json()
  const text = groqData.choices?.[0]?.message?.content?.trim() ?? ''

  return Response.json(
    { text: text === 'AUCUN' ? null : text },
    { headers: corsHeaders },
  )
})
