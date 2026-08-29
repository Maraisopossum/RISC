// URL encodée dans les étiquettes QR générées par l'appli : scanner l'étiquette
// (même avec un lecteur QR générique, hors de l'appli) ouvre directement la fiche.
export function itemUrl(id: number): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/materiel/${id}`
}

// Reconnaît un code déjà scanné comme étant une de nos propres étiquettes,
// pour distinguer "ouvrir cette fiche" d'un simple numéro de série fabricant.
export function parseItemIdFromScan(text: string): number | null {
  const match = text.match(/#\/materiel\/(\d+)/)
  return match ? Number(match[1]) : null
}
