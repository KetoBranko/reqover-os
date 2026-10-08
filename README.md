# ReQover OS

Internes Operating System von ReQover: CRM, Discovery und Vertriebssteuerung, später Sales-Recovery-Plattform.
Architektur und Plan: siehe `docs/architecture.md` und das Phase-0-Dokument (Link dort).

## Lokale Entwicklung

Voraussetzungen: Node 22, Postgres 16 (Binaries), Go ≥ 1.24 (nur zum Bauen des lokalen Auth-Servers).

```bash
npm install
node scripts/local-setup.mjs          # erzeugt .env.local mit lokalen Schlüsseln
scripts/local-build-auth.sh           # baut den Supabase-Auth-Server (GoTrue) lokal
npm run local:start                   # Postgres :54322, Auth :9999, Gateway :54321
npm run db:migrate
npm run user:create -- --email du@example.com --name "Vorname"
npm run dev
```

Lokal laufen dieselben Komponenten wie bei Supabase (Postgres mit RLS, Supabase Auth); der App-Code unterscheidet nicht zwischen lokal und gehostet.

## Tests

```bash
npm run typecheck
npm test                              # Unit-Tests (Business-Logik)
scripts/local-services.sh test-db && npm run test:db   # RLS, Mandantentrennung, Audit, Schema-Drift
npm run test:e2e                      # Playwright, Desktop + Mobile (Dev-Server muss laufen)
```

## Gehostete Umgebung (Supabase)

Siehe `.env.example` für alle Variablen und wo man sie bekommt. Migrationen mit `MIGRATION_DATABASE_URL` ausführen
(`npm run db:migrate`). Der lokale Bootstrap (`db/local/bootstrap.sql`) wird auf Supabase **nicht** ausgeführt.
