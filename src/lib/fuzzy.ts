// Distance de Levenshtein simple, suffisante pour comparer des numéros de
// série courts (quelques dizaines de caractères) sans dépendance externe.
export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const curr = [i]
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1])
    }
    prev = curr
  }
  return prev[n]
}

// Score de similarité entre 0 (rien à voir) et 1 (identique), insensible à
// la casse et aux confusions fréquentes de lecture OCR sur métal (0/O, 1/I).
export function similarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1')
  const na = normalize(a)
  const nb = normalize(b)
  const maxLen = Math.max(na.length, nb.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(na, nb) / maxLen
}
