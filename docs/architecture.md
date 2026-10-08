# Architektur – Kurzreferenz

Ausführlicher Plan (Phase 0): https://claude.ai/code/artifact/b36a424c-1936-4b9a-a6d7-7c6e26a86687

## Entscheidungen (ADR-Kurzform)

1. **SQL-Migrationen sind die Quelle der Wahrheit** (`db/migrations`), inkl. RLS, Trigger, Funktionen.
   `src/server/db/schema.ts` spiegelt sie für typisierte Queries; `tests/db/schema-drift.test.ts` erkennt Abweichungen.
   Angewendete Migrationen werden nie verändert (Checksumme).
2. **Jeder Request-Datenzugriff läuft über `withUserTx`**: Transaktion mit `role authenticated` + JWT-Claims
   (`SET LOCAL`-Semantik). Die Login-Rolle des Servers hat selbst keine Tabellenrechte; vergessener Kontext
   führt zu „permission denied“, nicht zu einem Datenleck.
3. **Mandantentrennung doppelt**: RLS-Policies (`private.is_member`) und zusammengesetzte Fremdschlüssel
   `(id, organization_id)`, damit keine Zeile auf Daten eines anderen Mandanten zeigen kann.
4. **Audit per Trigger** (`private.audit_row_change`): speichert nur geänderte Felder, Akteur (`human|ai|system`)
   und `proposal_id`, die der Server pro Transaktion setzt (`app.actor`, `app.proposal_id`).
5. **Domain Events als Outbox** in derselben Transaktion (`emitEvent`). Automationen lesen später daraus.
6. **AI schreibt nie direkt**: Vorschläge landen in `ai_action_proposals`, Ausführung erst nach Bestätigung.
7. **Briefing und Priorisierung sind deterministisch** (`src/domain`), jede Aussage trägt ihre Begründung.
8. **Cache Components (Next.js 16)**: Shell wird vorgerendert, alles Benutzerspezifische streamt hinter `Suspense`.
   `getSession()` ruft `connection()` auf, Sitzungsdaten sind nie Teil des statischen Shells.
9. **Deutsche Labels** nur aus `src/i18n/de.ts`; Formatierung (Datum, Geld, Zeitzone) nur über `src/lib/format.ts`.
10. **Lokale Entwicklung ohne Docker**: Postgres 16 + aus Quellcode gebauter Supabase-Auth-Server + Mini-Gateway
    (`scripts/local-*.{sh,mjs}`). Nur für lokal; auf Supabase existieren Rollen und Auth bereits.

## Pipeline-Modell

Unternehmensstatus (`company_status`): Recherchiert · Qualifiziert · Nicht passend · Kunde.
Chancen-Stufen (`pipeline_stages.key`): to_contact · contacted · discovery_scheduled · discovery_done ·
need_confirmed · pilot_opportunity · proposal · won · lost.
