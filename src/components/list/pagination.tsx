import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export function Pagination({ basePath, params, page, pageSize, total }: { basePath: string; params: Record<string, string | undefined>; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])))
    if (p > 1) q.set('seite', String(p))
    else q.delete('seite')
    return `${basePath}?${q.toString()}`
  }
  return (
    <nav className="mt-4 flex items-center justify-between text-sm text-muted" aria-label="Seiten">
      <span className="tabular">
        Seite {page} von {pages} · {total} Einträge
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={href(page - 1)}>
            Zurück
          </Link>
        )}
        {page < pages && (
          <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={href(page + 1)}>
            Weiter
          </Link>
        )}
      </div>
    </nav>
  )
}
