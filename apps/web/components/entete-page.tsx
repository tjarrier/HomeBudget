/**
 * Le titre d'ecran. Chaque page en pose un — c'est le <h1> unique du document,
 * sous lequel les `Carte` s'articulent en <h2>.
 */
export function EntetePage({ titre, sousTitre }: { titre: string; sousTitre: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{titre}</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">{sousTitre}</p>
    </header>
  )
}
