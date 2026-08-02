import Link from 'next/link'

export function BrandPicker({
  brands,
  selectedId,
  canAdd,
}: {
  brands: { id: string; name: string }[]
  selectedId: string
  canAdd: boolean
}) {
  if (brands.length <= 1 && !canAdd) return null
  return (
    <nav aria-label="브랜드 선택" className="flex flex-wrap gap-1.5">
      {brands.map((b) => (
        <Link
          key={b.id}
          href={`/dashboard?brand=${b.id}`}
          aria-current={b.id === selectedId ? 'page' : undefined}
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors duration-[120ms] ${
            b.id === selectedId
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-muted-foreground hover:text-foreground'
          }`}
        >
          {b.name}
        </Link>
      ))}
      {canAdd && (
        <Link
          href="/onboarding"
          className="rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          + 브랜드 추가
        </Link>
      )}
    </nav>
  )
}
