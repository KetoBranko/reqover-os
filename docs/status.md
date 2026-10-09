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

## Phase 4 – Vertriebspipeline · abgeschlossen 08.10.2026

- Board mit den 9 Phasen; Desktop: Drag & Drop (auch per Tastatur) plus Menü „Phase ändern“ an jeder Karte; Mobil: gruppierte Liste mit Phasen-Auswahl
- Karten zeigen Unternehmen, Wert, Ansprechpartner, nächsten Schritt (überfällig rot), Hinweis bei fehlendem nächsten Schritt und bei ≥ 14 Tagen in derselben Phase; Spaltensummen und offener Gesamtwert
- Datenqualität (Spec 34: unterstützen, nicht bevormunden): „Gewonnen“ fragt nach dem Datum der Auftragsbestätigung und bietet „Trotzdem als gewonnen markieren“ (wird als `won_without_order` gespeichert, im Verlauf vermerkt und auf der Karte angezeigt); „Verloren“ nur mit Grund (Schnellauswahl). Durchgesetzt in Service **und** Datenbank-Trigger (Migrationen 0003/0004), der auch prüft, dass die Phase zur Pipeline der Organisation gehört, und `stage_changed_at`/`closed_at` selbst pflegt
- Jeder Phasenwechsel schreibt einen Verlaufseintrag und Events (`OPPORTUNITY_STAGE_CHANGED`, `PILOT_PROPOSED`, `PILOT_WON`, `PILOT_LOST`)
- Chancen-Tab in der Unternehmens-360°-Sicht; Schnellaktion „Neue Chance anlegen“ in der Befehlsleiste; Demo-Seed um 4 Chancen erweitert
- Tests: 50 DB (neu: 7 Pipeline-Tests inkl. direkter Datenbank-Umgehungsversuche), E2E Desktop + Mobil: anlegen → ziehen → Menü → Gewonnen-Dialog → Verloren mit Grund → Reload → Verlauf

## Phase 5 – Discovery · abgeschlossen 08.10.2026

- Discovery-Liste und Arbeitsbereich je Gespräch mit Tabs „Gespräch“, „Fragen“ (Katalog A–H, 39 Fragen, typgerechte Eingaben, „Unsichere Angabe“), „Evidence Score“ und „Evidenz vs. Interpretation“
- Zwei Wege: „Discovery starten“ (Gesprächsmodus im Fokus-Layout ohne Navigation: Timer, Kernfrage, Notizen, Kernfragen-Leiste, „Gespräch beenden“) und „Gespräch nachträglich dokumentieren“. Es gibt keine Aufnahme; Diktieren ist als „Demnächst“ markiert (Phase 8)
- Alle Eingaben speichern automatisch mit sichtbarem Zustand („Speichert …“, „Gespeichert“, Fehler)
- Evidence Score: 10 Kategorien × 0–2 Punkte mit Bewertungshilfe je Stufe, Kundenaussage und Begründung. Eine menschliche Bewertung zählt als Bestätigung (`confirmed_by/at`); die Anzeige von AI-Vorschlägen ist vorbereitet (Phase 7)
- Validierungssignale (Problem, Budget, Entscheider usw.) als Ja/Teilweise/Nein/Unklar
- Evidenz vs. Interpretation: Kundenaussagen, Interpretationen, bestätigte/widerlegte Hypothesen, Überraschungen, strikt getrennt
- „Abschließen“ friert das Pilotangebot ein, schreibt einen Verlaufseintrag mit Score und Events (`DISCOVERY_COMPLETED`, `PAIN_CONFIRMED`, `EVIDENCE_SCORE_CONFIRMED`); „Bearbeiten“ öffnet wieder
- Pipeline-Karten zeigen jetzt den Evidence Score (neuestes Gespräch des Unternehmens) und die letzte Aktivität; Discovery-Tab in der Unternehmens-360°-Sicht
- Tests: 9 Unit, 57 DB (neu: Antwortvalidierung je Fragetyp, Bestätigung, Abschluss/Events, Mandantentrennung), E2E Desktop + Mobil: starten → Kernfrage → beenden → Fragen → Score → Abschluss → Reload → Verlauf

Offene Punkte: Das Datumsfeld ist das native Browser-Steuerelement und folgt der Spracheinstellung des Browsers (im deutschen Browser 08.10.2026). „Gespräch analysieren“ folgt mit der AI-Schicht (Phase 7).

## Phase 6 – Übersicht, Morning Briefing, Validierung · abgeschlossen 08.10.2026

- Übersicht als Command Center: Begrüßung nach Tageszeit, „ProRendo Briefing“, „Heute wichtig“, acht Kennzahlen (alle verlinkt)
- Briefing und Priorisierung sind feste Regeln in `src/domain/briefing.ts` (keine AI). Auslöser: überfällige/heutige Aufgaben und Wiedervorlagen, Chance ohne nächsten Schritt, ≥ 14 Tage ohne Aktivität, abgeschlossenes Discovery ohne Folgeschritt. Verstärker: Bedarf bestätigt, Evidence Score ≥ 14, Preis akzeptiert, Phase Pilot-Chance/Angebot. Verstärker allein machen nichts dringend. Ab 50 Punkten „Hohe Priorität“
- „Warum?“ an jeder Empfehlung zeigt Begründung, Einzelgewichte und Summe (funktioniert ohne JavaScript)
- „Seit deinem letzten Besuch“: der Bezugszeitpunkt wird einmal pro Tag (Europe/Berlin) weitergeschoben und bleibt beim Neuladen stabil
- Fehlende Daten werden benannt („Dazu liegen mir noch keine ausreichenden Daten vor.“), es gibt keine erfundenen Aussagen
- Validierungs-Dashboard (Discovery → Validierung): sechs Signale als x/N, dazu Nein/Unklar, Pilotangebot und Gewonnen je Unternehmen (auch nach späterem Verlust gezählt). Außerdem die häufigsten Pains, Use Cases, Einwände, Gründe gegen externe Bearbeitung und gewünschte Kennzahlen. Unter 5 Gesprächen erscheint der Hinweis „Kleine Stichprobe“
- Gesprächsvorbereitung je Unternehmen (`/unternehmen/[id]/vorbereitung`, Knopf „Vorbereiten“): Warum jetzt, letztes Discovery, offene Kernfragen, Fakten/Hypothesen/Kundenaussagen, Ansprechpartner, Chancen, Aufgaben, Pilotangebot, letzte Aktivitäten
- Tests: 17 Unit, 63 DB (neu: Kennzahlen, Priorisierung aus echten Daten, Basis „seit letztem Besuch“, Pilotangebot nach Verlust, Mandantentrennung), 8 E2E (neu: Übersicht → Warum? → Vorbereiten → Validierung, Desktop + Mobil)

Offene Punkte: Die Gewichte sind ein erster Vorschlag und liegen zentral in `REASON_WEIGHT`.

## Phase 7 – AI-Schicht: Gespräch analysieren, Vorschläge prüfen · abgeschlossen 08.10.2026

- Anbieter-Abstraktion `src/server/ai/` (`AIProvider.generateStructured`), Anthropic-Adapter (strukturierte Ausgabe per erzwungenem Tool-Aufruf, Zod-Validierung), Modell je Aufgabe über `AI_MODEL_*`
- Ohne `ANTHROPIC_API_KEY` (oder bei `aiLevel` < 2) zeigt die App „AI ist noch nicht eingerichtet …“ statt eines Knopfes; alles bleibt manuell nutzbar
- „Gespräch analysieren“ im Discovery-Arbeitsbereich: offene Eingaben werden zuerst gespeichert, dann gehen nur die eigenen Notizen, die Kernfrage-Antwort und ein Diktat an das Modell (klar als Daten abgegrenzt)
- Der Server prüft das Ergebnis:
  - Zitate müssen im Text vorkommen, sonst „unsicher“ und „Zitat nicht gefunden“
  - Antworten müssen zum Fragetyp passen
  - Termine in der Vergangenheit werden entfernt
  - Unbekannte Fragen werden verworfen (mit Hinweis)
  - Mehr als 0 Evidence-Punkte ohne belegtes Zitat sind „unsicher“
- Ergebnis wird nur als `ai_action_proposal` gespeichert. Prüfbildschirm „Ich habe folgende Informationen erkannt.“ mit [Alles übernehmen] [Bearbeiten] [Verwerfen]; unter „Bearbeiten“ lassen sich Punkte abwählen und ändern
- Übernehmen läuft in einer Transaktion:
  - Audit mit `actor = ai` und `proposal_id`
  - der Vorschlag speichert, wer ihn bestätigt hat, und welche Punkte angenommen, geändert oder abgelehnt wurden
  - Verlaufseintrag „AI-Vorschlag übernommen: x von y Änderungen … bestätigt durch dich“
  - Events `AI_PROPOSAL_CREATED/APPLIED/REJECTED`
  - Der Server lässt keine Änderung an Typ, Frage, Zitat oder Ziel-Chance zu
- Nächster Schritt: Gibt es eine offene Chance, wird ihr nächster Schritt aktualisiert. Sonst wird eine Chance vorgeschlagen (nur bei belegtem Interesse) oder eine Aufgabe angelegt. Die Wiedervorlage erscheint am Fälligkeitstag im Briefing
- Testmodus: deterministischer Test-Provider, nur mit `APP_ENV=test` startbar (`npm run dev:e2e`, setzt auch `STT_PROVIDER=fake`) und in der Oberfläche als „Testmodus, kein echtes Modell“ gekennzeichnet
- Tests: 22 Unit, 70 DB (neu: Analyse ändert nichts, Auswahl/Bearbeitung, Audit, Manipulationsversuche, Mandantentrennung), 10 E2E (neu: analysieren → bearbeiten → übernehmen → Reload → Aufgabe und Verlauf)

Offene Punkte: Für echten Betrieb fehlt `ANTHROPIC_API_KEY` (von Branko anzulegen). Assistent und freie Befehle folgen in der nächsten Phase.

## Phase 8 – ProRendo Assistent und freie Befehle · abgeschlossen 08.10.2026

- `/assistent`: Chat, der nur auf Basis der eigenen Daten antwortet; jede Antwort nennt ihre Datenbasis („Datenbasis: Priorisierung“). Fehlen Daten, kommt „Dazu liegen mir noch keine ausreichenden Daten vor.“ Gespräche werden gespeichert („Neues Gespräch“ beginnt ein frisches)
- Lesen und Schreiben sind getrennt:
  - Lese-Werkzeuge (`src/server/ai/assistant-tools.ts`): heute priorisiert, Suche, Unternehmenskontext, Kontaktverlauf, Pipeline, Unternehmen filtern (Bedarf bestätigt, ohne nächsten Schritt, Evidence ab), Aufgaben, Validierung. Alle laufen mit dem RLS-Kontext des Nutzers
  - Vorschlags-Werkzeuge: Aufgabe, Notiz, Phasenwechsel. Sie schreiben nichts, sondern sammeln einen `ai_action_proposal` pro Antwort
- Im Chat erscheint „Ich würde folgende Änderungen durchführen: …“ mit [Übernehmen] [Bearbeiten] [Verwerfen]. „Bearbeiten“ öffnet `/vorschlaege/[id]` (Auswahl und Felder änderbar). Übernehmen nutzt denselben transaktionalen Weg wie Phase 7 (Audit `actor = ai`, Verlaufseintrag, Events)
- „Gewonnen“ ohne dokumentierten Auftrag: Der Assistent weist darauf hin; übernommen wird nur mit Auftragsdatum oder dem ausdrücklichen Haken „Trotzdem als gewonnen markieren“. „Verloren“ verlangt einen Grund
- Befehlsleiste: Ab drei Zeichen gibt es „ProRendo fragen: „…““; Suchtreffer und Schnellaktionen haben Vorrang, freier Text ohne Treffer geht mit Enter an den Assistenten
- Ohne eingerichtete AI zeigt `/assistent` ehrlich „Assistent nicht verfügbar“ mit Grund
- Tests: 22 Unit, 75 DB (neu: Mandantentrennung der Werkzeuge und Gespräche, Vorschlag statt Schreiben, Bestätigung legt Aufgabe an, „Gewonnen“-Regel), 12 E2E (neu: Frage beantworten → Aufgabe über die Befehlsleiste vorschlagen → vorher nicht vorhanden → Übernehmen → Aufgabe vorhanden)

Offene Punkte: Antworten im echten Betrieb hängen am `ANTHROPIC_API_KEY`; im Testmodus antwortet ein regelbasierter Platzhalter. Spracheingabe im Assistenten folgt mit Phase 9.

## Phase 9 – Spracheingabe und Gesprächsnachbereitung · abgeschlossen 08.10.2026

- Austauschbarer Sprachdienst über `STT_PROVIDER`:
  - `browser` (Standard): Spracherkennung des Browsers (Chrome, Edge, Safari), Sprache de-DE. Hinweis: Chrome und Edge schicken das Audio dafür an den Dienst des Browser-Herstellers
  - `openai`: Aufnahme im Browser, Umwandlung über `/api/sprache` mit `OPENAI_API_KEY` und `STT_MODEL`. Ohne Schlüssel ist die Spracheingabe aus und es erscheint kein Mikrofon-Knopf
  - `none`: aus
  - `fake`: nur mit `APP_ENV=test`, für automatische Tests
- `/api/sprache` nimmt nur angemeldete Anfragen von derselben Herkunft an, nur Audio bis 15 MB, höchstens 20 Diktate pro Minute und Nutzer. Das Audio wird nicht gespeichert, nur der Text, den du übernimmst
- Aufnahme nur nach Klick, sichtbar mit rotem Punkt „Mikrofon an“ und Stopp-Knopf; endet beim zweiten Klick, beim Verlassen der Seite oder nach drei Minuten. Keine Aufnahme im Hintergrund, das Gespräch selbst wird nicht aufgezeichnet
- Diktieren an diesen Stellen:
  - Gesprächsmodus und Discovery-Arbeitsbereich: „Notiz diktieren“ hängt den Text an die Notizen an und speichert sofort
  - Notiz oder Aktivität erfassen, auch die Schnellnotiz nach „Erledigt“
  - Assistent: Frage diktieren, vor dem Senden prüfbar
  - Global: Mikrofon neben „Was möchtest du tun?“ öffnet die Befehlsleiste und hört sofort zu. Der Text erscheint als Suche oder „ProRendo fragen: …“
- Fehlerfälle mit klarer Meldung: Browser ohne Spracherkennung, Mikrofon verweigert oder nicht vorhanden, Dienst nicht erreichbar
- Tests: 22 Unit, 75 DB, 16 E2E (neu: Diktat mit simuliertem Mikrofon im Gesprächsmodus inkl. Reload, Sprachbefehl über die Befehlsleiste, Absicherung des Endpunkts)

Offene Punkte: Die Browser-Spracherkennung ist nur manuell in echten Browsern prüfbar (headless gibt es sie nicht). Für eine Transkription ohne Browser-Hersteller braucht es `STT_PROVIDER=openai` mit Schlüssel.

## Phase 10 – Mobile und installierbare App · abgeschlossen 08.10.2026

- Alle Kernseiten auf Smartphone-Breite (Pixel 7) und Desktop geprüft. Mobil gibt es die untere Leiste mit Heute, Aufgaben, „+“ (Befehlsleiste), Unternehmen und Mehr. Das Mikrofon oben öffnet die Spracheingabe
- Korrigiert: Discovery-Liste bricht Namen und Kennzeichen auf schmalen Bildschirmen sauber um
- Installierbar als App („Zum Home-Bildschirm“): Manifest mit deutschem Namen, Icons (auch maskable und Apple), Kurzbefehle Heute, Aufgaben, Assistent und Discovery starten. Bewusst ohne Service Worker und ohne Offline-Modus, weil jede Ansicht aktuelle Daten vom Server braucht
- Icons kommen aus `public/icons/*.svg`; PNGs erzeugt `node scripts/dev/make-icons.mjs`
- Tests: 22 Unit, 75 DB, 18 E2E (neu: zehn Kernseiten ohne seitliches Überlaufen auf Desktop und Mobil, Manifest und Icons erreichbar)

Offene Punkte: Datumsfelder zeigen das Format des Geräts (auf deutschen Geräten TT.MM.JJJJ). Einstellungen sind noch „Demnächst“ und folgen in Phase 11.

## Phase 11 – Einstellungen, Änderungsprotokoll, Export und Löschen · abgeschlossen 08.10.2026

- `/einstellungen`:
  - Profil (Anzeigename, Vorname für die Begrüßung)
  - Organisation (Name)
  - AI-Stufe 0 bis 2. Stufe 1 bedeutet, dass der Assistent nur liest und die Vorschlags-Werkzeuge gar nicht bekommt (auch serverseitig gesperrt). Stufen 3 und 4 sind vorbereitet, in V1 aber nicht freigeschaltet
  - Status von AI-Anbieter und Spracheingabe
  - Pilotangebot
  - Team (Einladungen „Demnächst“)
  - Ändern dürfen Inhaber und Admins. Der Server prüft die Rolle, und RLS verhindert die Änderung zusätzlich (0 geänderte Zeilen werden als „nicht erlaubt“ gemeldet)
- `/einstellungen/protokoll`: Änderungsprotokoll mit Zeitpunkt, Bereich, Aktion, Name des Datensatzes und Feldänderungen alt → neu. Phasen, Personen und Statuswerte erscheinen als Namen. Dazu „vorgeschlagen durch ProRendo AI, bestätigt durch …“, Filter nach Mensch/AI und Bereich sowie Blättern
- Export: `/api/export` liefert alle Daten der Organisation als JSON (Inhaber/Admins), inklusive Änderungsprotokoll und Ereignissen. Von Assistent-Gesprächen enthält er nur die eigenen, weil diese privat sind
- „Demo-Daten entfernen“ löscht nur als Demo markierte Einträge
- „Organisation löschen“ (nur Inhaber) verlangt den eingetippten Namen. Die Datenbankfunktion `private.delete_organization` prüft Rolle und Namen selbst und löscht alles per Kaskade, auch Protokoll und Ereignisse. Migration 0005 sorgt dafür, dass das Audit beim Löschen der ganzen Organisation nicht scheitert
- Tests: 22 Unit, 81 DB (neu: Rollen und RLS bei Einstellungen, AI-Stufe 1, Protokoll, Export-Trennung, Demo-Entfernung, Organisationslöschung inkl. Gegenprobe), 20 E2E (neu: Pilotangebot ändern, Export herunterladen, Protokoll filtern)

Offene Punkte: Einladen weiterer Personen und Aufbewahrungsfristen (Data Retention) sind konzeptionell vorgesehen, aber noch nicht gebaut.

## Phase 12 – Sicherheitsprüfung · abgeschlossen 08.10.2026

- Geprüft:
  - RLS auf allen 20 Tabellen
  - `security definer`-Funktionen mit festem `search_path`; `anon` ohne Rechte
  - jede Server-Aktion über `runAction` mit Zod (Onboarding prüft selbst)
  - kein `dangerouslySetInnerHTML`; Login-Weiterleitung nur auf eigene Pfade
  - keine Secrets im Repo; `npm audit` meldet 0 Schwachstellen
  - Produktions-Build läuft durch
- Neu:
  - Sicherheits-Header (CSP, Frame-Schutz, nosniff, Referrer- und Permissions-Policy, HSTS in Produktion); `X-Powered-By` aus
  - gemeinsame Anfragebegrenzung (`src/server/rate-limit.ts`) für Assistent, Gesprächsanalyse und Transkription
- `docs/sicherheit.md`: was gebaut ist, welche Daten an welche Anbieter gehen und was noch konzeptionell ist (Aufbewahrungsfristen, Backups, Uploads). Ohne Compliance-Versprechen
- Tests: 22 Unit, 81 DB, 22 E2E (neu: Header und geschützte Endpunkte ohne Sitzung)

Offene Punkte: Die CSP erlaubt Inline-Skripte, weil Next.js beim Streaming darauf angewiesen ist; Nonces würden das Vorrendern abschalten. Die Anfragebegrenzung gilt je Server-Instanz.

## Phase 13 – Haupt-Flow als End-to-End-Test · abgeschlossen 08.10.2026

- `tests/e2e/main-flow.spec.ts` prüft alle 18 Schritte aus Abschnitt 41 am Stück, auf Desktop und Mobil:
  1. Briefing öffnen; die heute fällige Aufgabe macht das Unternehmen zur Priorität
  2. Unternehmen mit Fakt, Hypothese und Verlauf öffnen, Gespräch vorbereiten, Discovery starten
  3. Gespräch führen und Kernantwort speichern, danach Notiz schreiben und diktieren
  4. „Gespräch analysieren“ zeigt den Prüfbildschirm mit Evidence-Vorschlag samt Begründung, Fakt, Aufgabe und Chance; „Alles übernehmen“
  5. Danach gespeichert: Discovery (Hauptschmerz, Evidence 2/20), Fakt am Unternehmen, Verlaufseintrag „AI-Vorschlag übernommen“, Aufgabe für morgen, Chance „Pilot: Angebots-Recovery“, Pipeline-Kennzahl +1
  6. Am nächsten Tag steht die Anruf-Aufgabe im Briefing, vorher nicht
- Für Schritt 18 gibt es eine Testuhr (`src/server/clock.ts`): Ein Cookie verschiebt „heute“ für die Übersicht. Sie wirkt nur mit `APP_ENV=test`; in Produktion wird der Cookie ignoriert
- Tests: 22 Unit, 81 DB, 24 E2E

Offene Punkte (bekannt, klein): Datumsfelder zeigen im Headless-Browser das US-Format, im echten deutschen Browser das deutsche; die Statuszeile des Diktats in der mobilen Befehlsleiste ist eng.
