import { useRef, useState, type ChangeEvent } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

interface CodeScannerProps {
  onResult: (text: string) => void
  onCancel: () => void
}

const ELEMENT_ID = 'code-scanner-viewport'

// Décode un QR/code-barres/DataMatrix depuis une vraie photo plutôt qu'un
// flux vidéo continu : le flux en direct s'est révélé bien moins net (résolution
// et mise au point limitées) qu'une photo pour les codes denses comme les
// DataMatrix gravés sur métal — testé en conditions réelles.
export default function CodeScanner({ onResult, onCancel }: CodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function getScanner() {
    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode(ELEMENT_ID, {
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
    }
    return scannerRef.current
  }

  async function handlePhotoScan(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setScanning(true)
    setError(null)
    try {
      const result = await getScanner().scanFileV2(file, false)
      onResult(result.decodedText)
    } catch {
      setError(
        "Aucun code détecté sur cette photo. Reprenez-la bien cadrée et nette sur le code, ou utilisez \"Numéro gravé (photo)\" ci-dessus.",
      )
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* html5-qrcode a besoin d'un élément du DOM même en mode "photo seule",
          mais rien n'y est jamais affiché : pas de flux vidéo à montrer. */}
      <div id={ELEMENT_ID} className="hidden" />

      <label className="flex items-center justify-center gap-2 rounded-md bg-slate-900 text-white px-4 py-2.5 font-medium hover:bg-slate-800 cursor-pointer">
        {scanning ? 'Analyse de la photo…' : '📷 Prendre une photo du code'}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoScan}
          disabled={scanning}
          className="hidden"
        />
      </label>

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
