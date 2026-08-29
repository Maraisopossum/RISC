import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

interface CodeScannerProps {
  onResult: (text: string) => void
  onCancel: () => void
}

const ELEMENT_ID = 'code-scanner-viewport'

// Caméra en direct pour lire un QR code ou un code-barres (Code128, EAN,
// DataMatrix...) — la majorité du matériel a déjà un code exploitable posé
// par le fabricant, ou une étiquette RISC générée depuis la fiche item.
export default function CodeScanner({ onResult, onCancel }: CodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)
  const [slow, setSlow] = useState(false)

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

    let stopped = false

    // Après quelques secondes sans détection, on suggère la bascule vers
    // l'OCR — un DataMatrix petit et dense (gravé sur métal) est parfois
    // hors de portée d'une caméra qui peine à faire la mise au point de près.
    const slowTimeout = setTimeout(() => setSlow(true), 6000)

    scanner
      .start(
        {
          facingMode: 'environment',
          // Demande la meilleure résolution possible à la caméra : un
          // DataMatrix est dense, il a besoin de beaucoup de pixels pour
          // être décodé correctement à cette taille.
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        { fps: 10, qrbox: { width: 280, height: 280 } },
        (decodedText) => {
          if (stopped) return
          stopped = true
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
        setError(
          err instanceof Error && err.message.includes('Permission')
            ? "Accès à la caméra refusé — autorisez-le dans les paramètres du navigateur, ou utilisez la saisie manuelle."
            : "Impossible de démarrer la caméra sur cet appareil.",
        )
      })

    return () => {
      clearTimeout(slowTimeout)
      if (stopped) return // déjà arrêté par le callback de succès ci-dessus
      stopped = true
      if (scanner.isScanning) {
        scanner.stop().catch(() => {})
      }
    }
  }, [onResult])

  return (
    <div className="space-y-3">
      <div id={ELEMENT_ID} className="mx-auto max-w-sm overflow-hidden rounded-lg bg-black" />
      {starting && <p className="text-center text-sm text-slate-500">Démarrage de la caméra…</p>}
      {!starting && !error && slow && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Toujours rien détecté ? Rapprochez-vous, assurez un bon éclairage et tenez le téléphone
          stable — les DataMatrix denses sur métal sont parfois difficiles à lire pour la caméra.
          Si ça ne passe pas, basculez vers "Numéro gravé (photo)" ci-dessus.
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
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
