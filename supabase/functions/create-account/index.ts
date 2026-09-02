// Crée un compte (auth + profil avec rôle) — réservé aux admins.
// La création de compte Supabase (mot de passe) exige la clé service_role,
// jamais exposée au navigateur : d'où cette fonction, comme pour l'OCR.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ROLES = ['admin', 'controleur', 'lecture'] as const

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
}

// Mots de passe simples à communiquer oralement/par SMS, mais pas triviaux.
const WORDS = ['RISC', 'CASQUE', 'CORDE', 'ANCRE', 'NOEUD', 'SAUVE', 'FLAMME', 'ECHELLE']
function generatePassword(): string {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)]
  const digits = Math.floor(1000 + Math.random() * 9000)
  return `${word}${digits}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Vérifie l'appelant avec SA propre session (clé anon + son jeton) : la
  // policy RLS "profiles_select_authenticated" permet de lire son propre rôle.
  const authHeader = req.headers.get('Authorization') ?? ''
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
  } = await callerClient.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Non authentifié.' }, { status: 401, headers: corsHeaders })
  }

  const { data: callerProfile } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (callerProfile?.role !== 'admin') {
    return Response.json(
      { error: 'Réservé aux comptes admin.' },
      { status: 403, headers: corsHeaders },
    )
  }

  let body: { identifier?: string; role?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON invalide.' }, { status: 400, headers: corsHeaders })
  }

  const identifier = (body.identifier ?? '').trim()
  const role = body.role as (typeof ROLES)[number]
  if (!identifier) {
    return Response.json({ error: 'Identifiant requis.' }, { status: 400, headers: corsHeaders })
  }
  if (!ROLES.includes(role)) {
    return Response.json({ error: 'Rôle invalide.' }, { status: 400, headers: corsHeaders })
  }

  // Supabase Auth exige un format d'email : un identifiant simple (pas de "@")
  // devient un compte "local" utilisable pour se connecter, sans vraie boîte mail.
  const email = identifier.includes('@') ? identifier : `${identifier}@risc.local`
  const password = generatePassword()

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr || !created.user) {
    return Response.json(
      { error: createErr?.message ?? 'Création du compte impossible.' },
      { status: 500, headers: corsHeaders },
    )
  }

  // Le trigger handle_new_user() crée déjà le profil avec role='lecture' par
  // défaut ; on l'ajuste si un autre rôle a été demandé.
  if (role !== 'lecture') {
    const { error: roleErr } = await admin
      .from('profiles')
      .update({ role })
      .eq('id', created.user.id)
    if (roleErr) {
      return Response.json(
        { error: `Compte créé mais rôle non appliqué : ${roleErr.message}` },
        { status: 500, headers: corsHeaders },
      )
    }
  }

  return Response.json({ email, password, role }, { headers: corsHeaders })
})
