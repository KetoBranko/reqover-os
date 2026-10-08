import { cn } from '@/lib/cn'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-line bg-surface', className)} {...props} />
}

export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
        {description && <p className="mt-1 text-sm text-faint">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />
}
