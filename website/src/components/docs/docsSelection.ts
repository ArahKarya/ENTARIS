/**
 * Which collection/article the docs portal shows, derived from the URL (`?c=<collection>&a=<article>`).
 * The URL is the single source of truth, so the portal needs no state that mirrors it.
 */
export type DocsSelection = { collectionId: string; articleId: string | null };

type SelectableCollection = { readonly id: string; readonly articles: readonly { readonly id: string }[] };

export function resolveDocsSelection(
  collections: readonly SelectableCollection[],
  params: { readonly c: string | null; readonly a: string | null },
  fallback: DocsSelection,
): DocsSelection {
  const { c, a } = params;

  if (c && collections.some((collection) => collection.id === c)) {
    return { collectionId: c, articleId: a ?? null };
  }

  if (a) {
    const owner = collections.find((collection) => collection.articles.some((article) => article.id === a));
    if (owner) return { collectionId: owner.id, articleId: a };
  }

  return fallback;
}
