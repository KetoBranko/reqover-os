# Sicherheit und Datenschutz – Stand Phase 12

Diese Seite beschreibt, wie ProRendo OS gebaut ist, nicht welche Zertifizierungen es hat. Es gibt keine. Ob der Betrieb die DSGVO erfüllt, hängt zusätzlich von Hosting, Verträgen (AV-Verträge mit Anbietern) und Prozessen ab. Das kann der Code allein nicht leisten.

## Zugriff

- **Anmeldung** über Supabase Auth. Die Sitzung wird auf dem Server bei jeder Seite und jeder Aktion neu geprüft (`getClaims`). Der Proxy leitet nur bequem auf die Anmeldung um und ist keine Sicherheitsgrenze.
- **Autorisierung in der Datenbank**: Alle Tabellen in `public` haben Row Level Security. Jede Anfrage läuft als Rolle `authenticated` mit den JWT-Claims des Nutzers (`withUserTx`). Die Server-Rolle `app_server` hat selbst keine Tabellenrechte und kein `BYPASSRLS`.
- **Mandantentrennung doppelt**: RLS (`private.is_member`) und zusammengesetzte Fremdschlüssel `(id, organization_id)`. Dafür gibt es eigene Tests (`tests/db/tenant-isolation.test.ts` und Gegenproben in den übrigen DB-Tests).
- **Rollen**: Inhaber, Admin und Mitglied. Löschen von Stammdaten, Einstellungen, Export und Demo-Bereinigung sind Inhabern und Admins vorbehalten; die Organisation löschen kann nur der Inhaber. Der Server prüft die Rolle, die Datenbank prüft sie unabhängig davon noch einmal.
- **Sicherheitsrelevante Funktionen** (`security definer`) haben einen festen `search_path` und prüfen Rolle bzw. Mitgliedschaft selbst. `anon` hat keinerlei Rechte.

## Eingaben und Ausgaben

- Jede Server-Aktion läuft über `runAction`: Sitzung prüfen, Eingabe mit Zod validieren, bekannte Fehler in deutsche Meldungen übersetzen, keine internen Details nach außen.
- Ausgaben rendert React escaped; `dangerouslySetInnerHTML` wird nicht verwendet.
- Weiterleitungen nach dem Login akzeptieren nur Pfade derselben Seite (`safeNext`).
- **Sicherheits-Header** (`next.config.ts`): Content-Security-Policy (keine fremden Skripte, `frame-ancestors 'none'`, `object-src 'none'`), `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy (Mikrofon nur für diese Seite) und HSTS in Produktion.
  - Einschränkung: Wegen des Next.js-Streamings erlaubt die CSP Inline-Skripte. Strenger ginge es nur mit Nonces, die das statische Vorrendern abschalten würden.

## Endpunkte

- `POST /api/sprache` nimmt nur Anfragen von derselben Herkunft und mit Sitzung an. Erlaubt sind nur Audio bis 15 MB und höchstens 20 Anfragen pro Minute und Nutzer. Das Audio wird nicht gespeichert.
- `GET /api/export` ist nur für Inhaber und Admins und wird nicht zwischengespeichert (`no-store`).
- AI-Anfragen (Assistent, Gesprächsanalyse) sind auf 20 pro Minute und Nutzer begrenzt. Die Begrenzung gilt je Server-Instanz, ist also ein Schutz gegen Fehlbedienung und Schleifen, kein Kontingent.
- Gegen Brute-Force bei der Anmeldung schützt Supabase Auth mit eigenen Limits.

## Secrets

- Secrets kommen nur aus Umgebungsvariablen und werden ausschließlich serverseitig gelesen (`src/server/env.ts`, `server-only`). Im Browser landet nur die öffentliche Supabase-URL mit dem Anon-Key.
- `.env*` ist von Git ausgeschlossen (außer `.env.example` ohne Werte). Die Passwörter in `db/local/` und in den Testskripten gelten nur für die lokale Entwicklungsdatenbank.
- Testmodus-Anbieter (`AI_PROVIDER=fake`, `STT_PROVIDER=fake`) und die Testuhr (Cookie `prorendo-testzeit`) wirken nur mit `APP_ENV=test`; Demo-Daten lassen sich in Produktion nicht einspielen.

## AI und Spracheingabe: welche Daten wohin gehen

- **AI (Anthropic)**: Bei „Gespräch analysieren“ gehen die eigenen Notizen, die Antwort auf die Kernfrage und das Diktat an das Modell. Der Assistent schickt die Frage und die Ergebnisse der Lese-Werkzeuge, also Daten der eigenen Organisation, die der Nutzer ohnehin sehen darf. Ohne Schlüssel oder bei AI-Stufe 0 geht nichts raus.
- **AI handelt nie selbst**: Es gibt Lese-Werkzeuge (unter RLS) und Vorschlags-Werkzeuge. Vorschläge werden erst nach Bestätigung in einer Transaktion gespeichert, im Audit mit `actor = ai`, Vorschlags-ID und der bestätigenden Person. Datenbankinhalte gelten im Prompt als Daten, nicht als Anweisungen.
- **Spracheingabe**: Im Modus `browser` erkennt der Browser die Sprache; Chrome und Edge schicken das Audio dafür an den Dienst des Herstellers. Im Modus `openai` geht das Audio über unseren Server an OpenAI. Aufgenommen wird nur nach Klick und sichtbar, nie das Gespräch selbst.

## Nachvollziehbarkeit, Export, Löschung

- **Audit**: Datenbank-Trigger schreiben bei jeder Änderung Nutzer, Zeitpunkt, Aktion, Tabelle, Datensatz, alte und neue Werte sowie Mensch/AI/System und gegebenenfalls die Vorschlags-ID. Nutzer können das Protokoll nur lesen, ändern kann es niemand. Lesbar ist es unter Einstellungen → Änderungsprotokoll.
- **Export** aller Daten der Organisation als JSON (Einstellungen → Daten).
- **Löschen**: Einzelne Datensätze löschen sich per Kaskade mit allen abhängigen Daten. Die ganze Organisation löscht nur der Inhaber nach Eingabe ihres Namens, inklusive Protokoll und Ereignissen (`private.delete_organization`). Ein Nutzerkonto selbst löschen geht noch nicht in der App; das erledigt derzeit ein Administrator in Supabase.

## Noch konzeptionell (nicht gebaut)

- **Aufbewahrungsfristen** (Data Retention): z. B. Assistent-Gespräche und Audit nach einer festen Frist löschen. Die Tabellen haben dafür Zeitstempel und Indizes, ein Job fehlt.
- **Backups und Wiederherstellung**: Sie laufen über den Datenbank-Anbieter (Supabase Point-in-Time-Recovery, je nach Tarif). Ein Wiederherstellungstest ist vor dem Echtbetrieb einzuplanen.
- **Datei-Uploads**: Es gibt noch keine. Kommen sie, gehören Typprüfung, Größenlimit, privater Speicher mit RLS und signierte URLs dazu.
