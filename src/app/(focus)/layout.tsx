// Focus layout: no navigation chrome, for the live conversation mode.
export default function FocusLayout({ children }: { children: React.ReactNode }) {
  return <main id="inhalt">{children}</main>
}
