# Status

## Phase 1 + 2 – Grundlage, Datenbank, Auth, RLS · abgeschlossen 08.10.2026

- Next.js 16 (App Router, Cache Components), TypeScript strict (+ noUncheckedIndexedAccess), Tailwind 4, Designtokens (dunkel primär, hell vorbereitet)
- Schema mit 20 Tabellen, RLS auf allen Tabellen, zusammengesetzte FKs, Audit-Trigger, Event-Outbox
- Supabase Auth (lokal: GoTrue aus Quellcode), Login, Einrichtung der Organisation inkl. Pipeline-Stufen und Discovery-Katalog (39 Fragen)
- App-Shell: Seitenleiste (Desktop), untere Navigation + „Mehr“-Sheet (Mobile)
- Tests: 35 DB-Tests grün (Mandantentrennung, Rollen, Audit, Events, RLS-Pflicht, anon ohne Rechte, Schema-Drift)
- Manuell geprüft: Login → Einrichtung → Übersicht (Desktop 1440 px, Mobile Pixel 7)

Offene Punkte: keine Blocker. Seiten außer Übersicht folgen in Phase 3.

## Phase 3 – CRM-Kern · abgeschlossen 08.10.2026

- Unternehmen (Liste mit Suche/Statusfilter, Desktop-Tabelle, Mobile-Karten; 360°-Sicht mit Fakten/Hypothesen, Kontakten, Verlauf, Aufgaben), Kontakte, Aufgaben (Überfällig/Heute/7 Tage/Später/Ohne Termin), Aktivitäten (Volltextsuche, Typfilter, „Ältere anzeigen“)
- Befehlsleiste ⌘K / Strg+K: Navigation, Schnellaktionen, globale Suche über Unternehmen, Kontakte, offene Aufgaben; mobil über den „+“-Knopf in der unteren Leiste. Freitext-Befehle sind als „Demnächst“ markiert (Phase 9).
- Noch nicht gebaute Bereiche (Pipeline, Discovery, Assistent, Einstellungen) zeigen eine ehrliche „Demnächst“-Seite statt eines toten Links
- Deutsche 404- und Fehlerseiten; Navigation liest die URL hinter Suspense (statische Shell bleibt erhalten)
- Login-Weiterleitung nur auf interne Pfade (auch `/\host` wird abgewiesen)
- Aufgabe zweimal „erledigt“ erzeugt nur einen Verlaufseintrag
- Demo-Seed `npm run db:seed:demo -- --email …` (nur Entwicklung, alle Zeilen `is_demo`, frei erfundene Firmennamen, `--remove` entfernt alles)
- Tests: 6 Unit, 43 DB (neu: CRM-Services, Mandantengrenzen bei Verknüpfungen, Suche), E2E Desktop + Mobil: Unternehmen → Kontakt → Aufgabe → Notiz → Reload → Suche → erledigen → ⌘K → löschen. E2E nutzt ein eigenes Konto mit eigener Organisation.

Offene Punkte: Spalte „Pipeline“ in der Unternehmensliste bleibt leer, bis Phase 4 Chancen anlegt.
