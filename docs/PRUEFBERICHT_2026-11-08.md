# Lu Fraili: Funktions- und Sicherheitsprüfung

Historischer Prüfstand vor der anschließenden Fehlerbehebung. Die unten genannten Befunde beschreiben den Code `ee2bb04`, nicht automatisch den späteren Live-Stand. Siehe `AKTUALISIERUNG_2026-11-08.md` für die umgesetzten Korrekturen und noch notwendige echte Nutzertests.

Stand: 08.11.2026. Geprüfter Code: `ee2bb04`.
Live-App: https://lu-fraili-kalender.vercel.app

## Ergebnis

**Keine vollständige Freigabe.** Der Build und die vorhandenen Tests sind erfolgreich. Darüber hinaus wurden jedoch relevante Sicherheits- und Funktionsfehler gefunden. Ein grüner Build ist kein Nachweis für eine sichere, vollständig funktionierende Anwendung.

Es wurden keine Produktionspasswörter geändert, keine echten Auth-Nutzer angelegt, keine E-Mails ausgelöst und keine bestehenden Buchungen verändert. Datenbank-Berechtigungstests liefen in ausdrücklich zurückgerollten Transaktionen. Danach bestanden weiterhin 9 Buchungen und 5 Profile; kein Testprofil blieb zurück. Es wurde nichts veröffentlicht oder an den Produktiveinstellungen geändert.

## Dringende Befunde

### 1. P1: Eigenes Schlichter-Profil per Datenbank möglich

Quelle: `supabase/migrations/001_initial_schema.sql:166` und tatsächlich vorhandene Produktionsrichtlinie.

Die Richtlinie für das Anlegen eines eigenen Profils prüft nur `user_id = auth.uid()`. Sie beschränkt die Spalte `role` nicht. In einer simulierten angemeldeten Datenbanksitzung ohne vorhandenes Profil ließ sich deshalb ein Profil mit Rolle `schlichter` einfügen. Die Testtransaktion wurde zurückgerollt.

Voraussetzung ist ein gültiger angemeldeter Zugang ohne zugehöriges Profil, beispielsweise nach einer nur teilweise erfolgreichen Nutzerentfernung. Die normale Anmeldung legt normalerweise bereits ein Profil an; nicht jeder bestehende Nutzer kann deshalb einfach ein zweites Profil einfügen. Der nachgewiesene Datenbankpfad bleibt dennoch offen und unterläuft die serverseitige Schlichter-Prüfung, sobald die Rolle angelegt wurde.

Empfehlung: Profil-Schreibzugriffe ausschließlich über geprüfte Serverrouten und den internen Auth-Trigger erlauben. Keine frei wählbare Rolle über die öffentliche Datenbank-API.

### 2. P1: Anmeldung ist noch keine Familienfreigabe

Quelle: öffentliche Supabase-Auth-Einstellungen und SELECT-Richtlinien, z.B. `001_initial_schema.sql:170`.

Die Live-Einstellung meldet `disable_signup = false`. Die Leseregeln für Buchungen und Profile erlauben jeder angemeldeten Sitzung Zugriff, unabhängig von Familienzuordnung oder Freigabe. Ein Berechtigungstest mit einer angemeldeten Identität ohne Profil konnte alle 9 Buchungen und alle 5 Profile lesen. Anonyme, nicht angemeldete Zugriffe sahen dagegen 0 Buchungen.

Die öffentliche Registrierung wurde nicht praktisch ausgelöst; es wurden keine externen Auth-Konten angelegt. Die Kombination aus aktivierter Registrierung und zu breiten Leseregeln ist trotzdem nicht ausreichend für eine ausschließlich private Familien-App.

Empfehlung: Registrierung beziehungsweise Freigabe auf bekannte Familienmitglieder beschränken und die Datenbank-Leserechte an ein berechtigtes Profil koppeln. Nur eine ausgeblendete Registrierungsoberfläche reicht nicht.

### 3. P1: Verlauf kann direkt manipuliert werden

Quelle: `001_initial_schema.sql:187` und Produktionsrechte auf `booking_events`.

Die Regel erlaubt angemeldeten Nutzern, Verlaufseinträge mit `created_by = null` anzulegen. In einer zurückgerollten Testtransaktion ließ sich damit ein scheinbarer Systemeintrag zu einer Buchung erzeugen. Ein solcher Zugriff läuft nicht durch die geprüften Buchungsrouten.

Empfehlung: Schreibzugriffe auf den Verlauf auf die geprüften Serverfunktionen beschränken. Bereits vorhandene Historie erhalten.

### 4. P1: Veraltete Laufzeitabhängigkeiten

Quelle: `package-lock.json`, geprüfter Build mit Next.js 14.2.35 und `npm audit --omit=dev`.

Die Paketprüfung meldete 8 betroffene Pakete: 1 kritisch, 3 hoch, 4 niedrig. Next.js wird als kritisch betroffen gemeldet; weitere Meldungen betreffen unter anderem transitive PostCSS-, nanoid- und source-map-js-Versionen. Die Resend-Kette wird ebenfalls genannt, ihr Versand ist in dieser App inzwischen abgeschaltet.

Das ist ein Abhängigkeitsbefund, kein Nachweis eines erfolgreichen Angriffs auf die Live-App. Einzelne Meldungen hängen von verwendeten Funktionen und Hosting-Maßnahmen ab. Beispielsweise betrifft die folgende Meldung die Bildoptimierung; deren konkrete Ausnutzbarkeit wurde nicht angegriffen oder nachgewiesen:

https://github.com/advisories/GHSA-2xp9-vwfh-vxw4

Empfehlung: Unterstützte, gepatchte Version auswählen und ein gezieltes Framework-Update mit Migrationstests durchführen. Kein ungeprüftes `npm audit fix --force`.

## Anmeldung und Passwörter

### 5. P1: Google-Login ist nicht aktiviert

Die öffentliche Live-Supabase-Auth-Konfiguration meldet `external.google = false`, während die Loginseite weiterhin den Google-Button zeigt (`components/auth-buttons.tsx:14`). E-Mail-Login ist dagegen aktiviert.

Empfehlung: Google-Provider und Redirect-Konfiguration korrekt einrichten oder den nicht funktionierenden Button bis dahin ausblenden. Es wurde kein echtes Google-OAuth-Verfahren gestartet.

### 6. P2: Passwort-Reset behauptet Erfolg trotz möglichem Fehler

Quelle: `components/auth-buttons.tsx:40`.

Das Ergebnis von `resetPasswordForEmail` wird nicht auf Fehler geprüft. Auch bei Versandfehler oder Rate-Limit erscheint die Meldung, es sei ein Link verschickt worden. Das ist durch Codeprüfung belegt; es wurde bewusst keine Reset-Mail an ein Familienmitglied ausgelöst.

Auch `app/auth/callback/route.ts:18` ignoriert Fehler beim Code-Austausch. Die Passwortseite initialisiert die Sitzung und unterstützt Code- und Hash-Links; ihre Initialisierung hat aber keinen abschließenden Fehlerpfad für geworfene Netzwerkfehler. Sie kann dann beim Prüfen hängenbleiben.

Empfehlung: Fehler auswerten, neutrale deutsche Fehlermeldungen anzeigen, Ladezustand auch bei Fehlern beenden. Danach mit einem dafür freigegebenen Testkonto eine echte Reset-Mail, Linköffnung, Passwortänderung und Anmeldung prüfen.

### 7. P2: Externe Weiterleitung über den Callback

Quelle: `lib/auth-redirects.ts:17` und `app/auth/callback/route.ts:27`.

Die Prüfung erlaubt Pfade mit Backslash, die `new URL` als externe Zieladresse interpretiert. Live wurde ohne Anmeldung und ohne Weiterleitung zu folgen ein HTTP-307-Redirect nach `https://example.invalid/` nachgewiesen. Es wurden keine Sitzungstokens übermittelt.

Empfehlung: Ziel mit der echten App-Origin auflösen und exakt dieselbe Origin verlangen; Backslashes, Protokoll-relative URLs und Kontrollzeichen zurückweisen. Regressionstest ergänzen.

## Buchungen und Planung

### 8. P2: Jahreswechsel bei P-Tagen falsch

Quelle: `lib/rules.ts:19` und `004_booking_reliability.sql:204` ff.

Aktuell zählt die vollständige Buchung im Jahr ihres Startdatums. Reproduziert: P-Zeit vom 26.12.2026 bis 04.01.2027 ergibt 10 Tage für 2026 und 0 für 2027, statt 6 und 4. Auch die Serverprüfung verwendet das Startjahr; eine reine Anzeigeänderung würde nicht reichen. Verfallene Tage werden dagegen bereits nach dem Jahr des einzelnen Datums gespeichert.

Empfehlung: Jeden betroffenen Kalenderjahresanteil separat berechnen und prüfen. Dieselbe Aufteilung für Dashboard, Jahresplanung, Verwaltung und Servervalidierung verwenden.

### 9. P2: Kontingent im Buchungsformular bezieht sich auf falsches Jahr

Quelle: `app/buchung/neu/page.tsx:16` und `components/new-booking-form.tsx`.

Die Seite lädt das Restkontingent ausschließlich für das aktuelle Kalenderjahr. Bei Auswahl eines Aufenthalts im nächsten Jahr bleibt die angezeigte Zahl unverändert. Die Serverprüfung kann deshalb eine Buchung ablehnen, obwohl das Formular scheinbar genug Tage anzeigt.

### 10. P2: Letzter Schlichter nicht transaktionssicher geschützt

Quelle: `app/api/verwaltung/profiles/[id]/route.ts:30` und `:60`.

Die Anzahl wird gelesen und die Änderung später separat gespeichert. Zwei gleichzeitige Herabstufungen der letzten beiden Schlichter können beide die Vorprüfung bestehen. Direkte Datenbankänderungen können die API-Prüfung ebenfalls umgehen. Dies ist durch Codeprüfung festgestellt; echte Rollen wurden nicht verändert.

Empfehlung: Prüfung und Rollenänderung in einer serialisierten Datenbanktransaktion absichern.

### 11. P2/P3: Kleinere Planungs- und Bedienfehler

- Der Kalender lädt nur den eigentlichen Monat, zeigt aber auch angrenzende Monatstage. Buchungen, die ausschließlich auf diesen angrenzenden Tagen liegen, werden nicht geladen (`app/kalender/page.tsx:64`). Ein Klick kann deshalb fälschlich keine Buchung anzeigen.
- `Nächste Aufenthalte` in der Jahresplanung filtert nicht auf aktive Status und kann stornierte oder abgelehnte Aufenthalte zeigen (`app/jahresplanung/page.tsx:48`).
- Nach einer Stornierung aktualisiert die Detailseite nur die Erfolgsmeldung, nicht das übergebene Buchungsobjekt. Status und weitere Aktionsbuttons können bis zum Neuladen den alten Stand zeigen (`components/booking-actions.tsx:63`).
- Die September-Vorschau im Formular verwendet eine andere, vereinfachte Monatsprüfung als `checkSeptemberWarning`. Ein jahresübergreifender Aufenthalt kann dadurch einen September-Hinweis verlieren.
- Mehrere Seiten ignorieren Datenbank-Lesefehler und setzen `data ?? []`. Ein Fehler kann dann wie ein leerer Kalender oder ein unbenutztes Kontingent aussehen. Die schreibende Regelprüfung ist davon getrennt.
- Wieder angefragte, ehemals bestätigte P-Zeiten behalten intern geschützte Tage. Die Warnungshelfer prüfen aber nur Status `bestaetigt`. Eine spätere Stornierung einer solchen Anfrage kann deshalb P-Tage verfallen lassen, ohne dass die Oberfläche vorher warnt.

Diese Bedienfälle sind durch Codeprüfung ermittelt, nicht mit einem echten angemeldeten Browserkonto durchgeklickt.

## Erfolgreich geprüft

| Bereich | Nachweis | Einschränkung |
|---|---|---|
| Build, TypeScript, Lint | `npm run build` erfolgreich | In frischer Arbeitskopie mit identischem Code/Lockfile; lokale Original-Abhängigkeiten hatten zuvor Dateizugriffsprobleme |
| Unit-Tests | Alle 64 vorhandenen Tests erfolgreich | Keine vollständige Funktionsabdeckung |
| Datenbankregeln | PGlite-Testdatenbank: Migrationen 001/003/004 und SQL-Regressionssuite erfolgreich | Keine echten Familienbuchungen verändert; kein realer Parallel-Lasttest |
| Automatische Bestätigung | Tests zu erfolgreichem Speichern, Fehlern, Wiederholung, Widerspruch und Frist erfolgreich | Täglicher Vercel-Lauf nach der neuesten Version noch nicht beobachtet |
| Bestehende Daten | 9 Buchungen, 8 bestätigt, 1 storniert, keine überfällige Anfrage | Momentaufnahme |
| Nicht angemeldeter Zugriff | Geschützte Seiten leiten zu Login; geprüfte APIs geben 401; Cron ohne Secret 401 | Ersetzt keine Prüfung der angemeldeten Rollen; siehe RLS-Befunde |
| Anonyme Datenbankleserechte | 0 lesbare Buchungen | Angemeldete Fremdzugriffe sind ein separater Befund |
| Startpasswort | Tests zu Schlichter/Normalnutzer, Validierung, eingeladenem und fehlendem Auth-Nutzer erfolgreich | Kein echtes Familienpasswort verändert; kein realer Login nach Änderung durchgeführt |
| Abschaltung App-E-Mail | Tests: kein Resend-Aufruf und keine neuen E-Mail-Vermerke | Supabase-Auth-E-Mails sind absichtlich separat |
| WhatsApp | URL, deutscher Text, fehlende private Links und Verdrängungshinweis getestet | WhatsApp wurde nicht geöffnet oder eine Nachricht verschickt |
| Icons/Manifest | Live HTTP 200 | Kein echter iPhone-Home-Screen-Test |
| Laufzeitfehler | Vercel-Fehlerübersicht: keine Meldungen im angefragten 24h-Fenster | Keine Fehler ist kein Nachweis fehlerfreier Fachlogik |

Zusätzlich wurden zwei isolierte Defekt-Proben ausgeführt, die das aktuelle falsche Verhalten bei Jahreswechsel und Callback-Ziel reproduzieren. Sie sind keine bestandenen Akzeptanztests und liegen nur in der temporären Prüfkopie.

## Nicht vollständig nachweisbar in dieser Prüfung

- Echtes Google-Login: Provider deaktiviert.
- Passwort-Reset von realer E-Mail bis zur erneuten Anmeldung: kein freigegebenes Testpostfach und keine echte Nutzeranmeldung verwendet.
- Neue Einladung samt E-Mail-Empfang: nicht ausgelöst.
- Angemeldete mobile/desktop Browserbedienung aller Seiten: kein verfügbarer angemeldeter Testbrowser verwendet; keine visuelle Vollprüfung.
- Nächster geplanter Cron-Lauf: ohne auslesbares Cron-Secret nicht manuell über den geschützten Live-Endpunkt ausgelöst. SQL- und Routentests sind erfolgreich, aber kein Ersatz für den nächsten echten Tageslauf.
- Historische Cron-Detailprotokolle: Vercel-Hobby-Aufbewahrung reicht nicht bis zum heutigen Nachtlauf; die letzte 30-Minuten-Abfrage enthält keinen solchen Lauf.
- Kein Penetrationstest der gemeldeten Paketlücken und keine Aussage über bereits erfolgte Angriffe.

## Reihenfolge zur Behebung

1. Profil-/Rollen-Schreibrechte und Familienfreigabe in der Datenbank absichern; Verlaufsschreibrechte beschränken.
2. Gepatchte Framework-/Paketversionen planen und testen.
3. Google-Anmeldung konfigurieren, Callback absichern und Reset-Fehler behandeln.
4. P-Jahreskontingent, kurzfristige Änderungswarnungen und Kontingentanzeige vereinheitlichen.
5. Schlichter-Sicherheitsregel transaktionssicher machen und kleinere Planungsfehler beheben.
6. Einen echten Schlichter-/Nutzer-Durchlauf und den E-Mail-Passwort-Reset mit freigegebenen Testzugängen durchführen; nächsten Cron-Lauf kontrollieren.

Erst danach ist eine umfassendere Freigabe sinnvoll. Für diese reine Prüfung wurden keine Fehlerkorrekturen oder Datenbankmigrationen veröffentlicht.
