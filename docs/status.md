# Status

## Phase 1 + 2 – Grundlage, Datenbank, Auth, RLS · abgeschlossen 08.10.2026

- Next.js 16 (App Router, Cache Components), TypeScript strict (+ noUncheckedIndexedAccess), Tailwind 4, Designtokens (dunkel primär, hell vorbereitet)
- Schema mit 20 Tabellen, RLS auf allen Tabellen, zusammengesetzte FKs, Audit-Trigger, Event-Outbox
- Supabase Auth (lokal: GoTrue aus Quellcode), Login, Einrichtung der Organisation inkl. Pipeline-Stufen und Discovery-Katalog (39 Fragen)
- App-Shell: Seitenleiste (Desktop), untere Navigation + „Mehr“-Sheet (Mobile)
- Tests: 35 DB-Tests grün (Mandantentrennung, Rollen, Audit, Events, RLS-Pflicht, anon ohne Rechte, Schema-Drift)
- Manuell geprüft: Login → Einrichtung → Übersicht (Desktop 1440 px, Mobile Pixel 7)

Offene Punkte: keine Blocker. Seiten außer Übersicht folgen in Phase 3.
