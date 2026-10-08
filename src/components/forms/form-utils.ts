/** Reads a form into a plain object; empty strings become null. */
export function formToObject(form: HTMLFormElement): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  new FormData(form).forEach((value, key) => {
    const v = String(value).trim()
    out[key] = v === '' ? null : v
  })
  return out
}

/** Tri-state select value ("" | "true" | "false") to boolean | null. */
export function triState(v: string | null | undefined): boolean | null {
  return v === 'true' ? true : v === 'false' ? false : null
}
