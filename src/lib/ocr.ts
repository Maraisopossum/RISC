import { supabase } from './supabase'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1]) // retire le préfixe "data:...;base64,"
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function readSerialFromPhoto(file: File): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Connexion admin requise pour utiliser le scan.')

  const imageBase64 = await fileToBase64(file)

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-serial`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageBase64, mimeType: file.type || 'image/jpeg' }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Erreur de lecture (${res.status})`)
  }

  const { text } = (await res.json()) as { text: string | null }
  return text
}
