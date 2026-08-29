import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { itemUrl } from '../lib/qr'

export default function QrLabel({ itemId, itemType }: { itemId: number; itemType: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, itemUrl(itemId), { width: 220, margin: 1 })
    }
  }, [itemId])

  function handlePrint() {
    window.print()
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="font-medium text-slate-900 mb-3">Étiquette QR</p>

      <div id="qr-print-label" className="flex flex-col items-center gap-1">
        <canvas ref={canvasRef} />
        <p className="font-mono text-sm text-slate-900">RISC #{itemId}</p>
        <p className="text-xs text-slate-500">{itemType}</p>
      </div>

      <button
        onClick={handlePrint}
        className="mt-3 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
      >
        Imprimer l'étiquette
      </button>

      {/* Isole l'étiquette lors de l'impression : le reste de la page est masqué. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #qr-print-label, #qr-print-label * { visibility: visible; }
          #qr-print-label {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
          }
        }
      `}</style>
    </div>
  )
}
