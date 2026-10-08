import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const badge = cva('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', {
  variants: {
    tone: {
      neutral: 'bg-surface-3 text-muted',
      accent: 'bg-accent-soft text-accent',
      success: 'bg-success-soft text-success',
      warning: 'bg-warning-soft text-warning',
      danger: 'bg-danger-soft text-danger',
      outline: 'border border-line-strong text-muted',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />
}
