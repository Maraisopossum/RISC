import type { Inspection, Item } from './types'

// Cache local (localStorage) des fiches déjà consultées en ligne, pour
// pouvoir les rouvrir sans réseau (ex: dans un dépôt sans couverture).
// On ne met en cache que ce que l'utilisateur a réellement vu — pas
// l'inventaire complet, qui serait trop volumineux et vite obsolète.

interface CachedItem {
  item: Item
  inspections: Inspection[]
  cachedAt: string
}

const PREFIX = 'risc-cache-item-'

export function cacheItem(item: Item, inspections: Inspection[]) {
  try {
    const entry: CachedItem = { item, inspections, cachedAt: new Date().toISOString() }
    localStorage.setItem(PREFIX + item.id, JSON.stringify(entry))
  } catch {
    // Stockage plein ou indisponible (navigation privée...) : tant pis,
    // le mode hors-ligne est un confort, pas une garantie.
  }
}

export function getCachedItem(id: string | number): CachedItem | null {
  try {
    const raw = localStorage.getItem(PREFIX + id)
    return raw ? (JSON.parse(raw) as CachedItem) : null
  } catch {
    return null
  }
}
