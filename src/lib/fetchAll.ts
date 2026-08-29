// L'API Supabase plafonne toute réponse à 1000 lignes par défaut. Dès qu'une
// requête peut ramener plus que ça (l'inventaire a 4700+ items), il faut
// paginer explicitement avec .range() sous peine de résultats tronqués sans
// erreur ni avertissement — piège rencontré plusieurs fois dans cette appli.
//
// `makeQuery` doit reconstruire une requête fraîche à chaque appel (pas
// réutiliser le même query builder), pour être sûr que chaque page relance
// bien un vrai appel réseau avec le bon .range(). Le type exact du query
// builder Supabase est trop générique pour être exprimé simplement ici selon
// le contexte d'appel, d'où le `any`.
// biome-ignore lint/suspicious/noExplicitAny: query builder Supabase générique
export async function fetchAllRows<T>(
  makeQuery: () => any,
): Promise<T[]> {
  const all: T[] = []
  const batchSize = 1000
  for (let from = 0; ; from += batchSize) {
    const { data, error } = await makeQuery().range(from, from + batchSize - 1)
    if (error) throw new Error(error.message)
    all.push(...((data as T[]) ?? []))
    if (!data || data.length < batchSize) break
  }
  return all
}
