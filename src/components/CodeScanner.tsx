import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

interface CodeScannerProps {
  onResult: (text: string) => void
  onCancel: () => void
}

const ELEMENT_ID = 'code-scanner-viewport'

// html5-qrcode rejette parfois avec une DOMException standard, parfois avec
// une simple chaîne de texte — on regarde le "name" (fiable, normalisé par
// les navigateurs) en priorité, et on garde le message brut en repli pour
// ne pas retomber sur un message générique qui masque la vraie cause.
function describeCameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : null
  const rawMessage = err instanceof Error ? err.message : String(err)

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return "Accès à la caméra refusé — autorisez-le dans les paramètres du navigateur (ou du site), ou utilisez la saisie manuelle."
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return "Aucune caméra détectée sur cet appareil."
    case 'NotReadableError':
    case 'TrackStartError':
      return "La caméra est déjà utilisée par une autre application ou un autre onglet — fermez-la et réessayez."
    case 'OverconstrainedError':
      return "La caméra de cet appareil ne supporte pas la configuration demandée."
    case 'SecurityError':
      return "Accès à la caméra bloqué (connexion non sécurisée)."
    default:
      return `Impossible de démarrer la caméra sur cet appareil${rawMessage ? ` (${rawMessage})` : ''}.`
  }
}

// Caméra en direct pour lire un QR code ou un code-barres (Code128, EAN,
// DataMatrix...) — la majorité du matériel a déjà un code exploitable posé
// par le fabricant, ou une étiquette RISC générée depuis la fiche item.
export default function CodeScanner({ onResult, onCancel }: CodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const stoppedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)
  const [slow, setSlow] = useState(false)
  const [photoScanning, setPhotoScanning] = useState(false)

  useEffect(() => {
    const scanner = new Html5Qrcode(ELEMENT_ID, {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
      ],
      verbose: false,
    })
    scannerRef.current = scanner
    stoppedRef.current = false

    // Après quelques secondes sans détection, on suggère la photo ou l'OCR —
    // un DataMatrix petit et dense (gravé sur métal) est parfois hors de
    // portée d'un flux vidéo continu (résolution/mise au point limitées).
    const slowTimeout = setTimeout(() => setSlow(true), 6000)

    scanner
      .start(
        // Un seul champ ici : html5-qrcode l'exige. La résolution se
        // demande via videoConstraints dans la config ci-dessous.
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 280, height: 280 },
          videoConstraints: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        (decodedText) => {
          if (stoppedRef.current) return
          stoppedRef.current = true
          clearTimeout(slowTimeout)
          // On attend que la caméra soit vraiment arrêtée avant de prévenir le
          // parent : celui-ci navigue généralement aussitôt (démonte ce
          // composant), et html5-qrcode manipule directement le DOM de la
          // vidéo — le faire pendant que React retire l'élément fait planter
          // toute l'appli (page blanche, aucune erreur visible).
          scanner
            .stop()
            .catch(() => {})
            .finally(() => onResult(decodedText))
        },
        () => {
          // Appelé en continu tant qu'aucun code n'est détecté dans l'image :
          // ce n'est pas une erreur, on ignore silencieusement.
        },
      )
      .then(() => setStarting(false))
      .catch((err) => {
        setStarting(false)
        setError(describeCameraError(err))
      })

    return () => {
      clearTimeout(slowTimeout)
      if (stoppedRef.current) return // déjà arrêté ailleurs (succès ou photo)
      stoppedRef.current = true
      if (scanner.isScanning) {
        scanner.stop().catch(() => {})
      }
    }
  }, [onResult])

  async function handlePhotoScan(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !scannerRef.current) return

    const scanner = scannerRef.current
    setPhotoScanning(true)
    setError(null)

    try {
      // Une vraie photo capture bien plus de détail que le flux vidéo continu
      // (souvent limité en résolution/mise au point) : meilleure chance de
      // décoder un DataMatrix dense.
      if (scanner.isScanning) {
        stoppedRef.current = true
        await scanner.stop().catch(() => {})
      }
      const result = await scanner.scanFileV2(file, false)
      onResult(result.decodedText)
    } catch {
      setError(
        "Aucun code détecté sur cette photo. Reprenez-la bien cadrée et nette sur le code, ou utilisez \"Numéro gravé (photo)\" ci-dessus.",
      )
      setPhotoScanning(false)
    }
  }

  return (
    <div className="space-y-3">
      <div id={ELEMENT_ID} className="mx-auto max-w-sm overflow-hidden rounded-lg bg-black" />
      {starting && <p className="text-center text-sm text-slate-500">Démarrage de la caméra…</p>}
      {!starting && !error && slow && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Toujours rien détecté ? Le flux caméra en direct a une résolution limitée — essayez
          "📷 Prendre une photo" ci-dessous, souvent bien plus efficace sur un code dense.
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {!starting && (
        <label className="flex items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 cursor-pointer">
          {photoScanning ? 'Analyse de la photo…' : '📷 Prendre une photo (meilleure résolution)'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoScan}
            disabled={photoScanning}
            className="hidden"
          />
        </label>
      )}
      <button
        onClick={onCancel}
        className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
      >
        Annuler
      </button>
    </div>
  )
}
