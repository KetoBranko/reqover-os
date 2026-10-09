export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgb(108_195_224/0.08),transparent)]"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-accent-soft text-sm font-bold text-accent">P</div>
          <span className="text-[15px] font-semibold tracking-tight">ProRendo OS</span>
        </div>
        {children}
      </div>
    </main>
  )
}
