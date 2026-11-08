# Lu Fraili Belegungskalender

Ein privater, einfacher Familienkalender für das Ferienhaus in Lu Fraili, Sardinien.

Eine Buchung wird zuerst angefragt. Die anfragende Person teilt die Anfrage über den WhatsApp-Teilen-Button in der Familiengruppe. Die Drei-Tage-Frist beginnt bereits beim Speichern in der App, nicht erst beim Teilen. Ohne Widerspruch bestätigt die App die Buchung automatisch einmal täglich. Die App ist die verbindliche Übersicht; sie verschickt keine E-Mail-Benachrichtigungen und keine automatischen WhatsApp-Nachrichten.

## 1. Lokale Installation

Voraussetzungen:

- Node.js 24 (LTS)
- Ein Supabase-Projekt
- Kein Resend-Konto erforderlich

Installation:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Danach läuft die App lokal unter:

```text
http://localhost:3000
```

## 2. Supabase Setup

1. Neues Supabase-Projekt erstellen.
2. In Supabase zu `SQL Editor` gehen.
3. Alle Migrationen aus Abschnitt 5 in der angegebenen Reihenfolge ausführen.
4. Danach optional den Inhalt von `supabase/seed/seed.sql` ausführen.

Die Migration erstellt:

- Familienparteien
- Profile
- Buchungen
- Widersprüche
- Buchungsverlauf
- Einstellungen
- Row Level Security
- Schutzregeln für Buchungsänderungen

## 3. Anmeldung mit E-Mail und Passwort

Google-Anmeldung ist aus der App entfernt. Bestehende Auth-Nutzer und ihre Buchungen bleiben erhalten. Ein Schlichter kann für bestehende oder neue Familienmitglieder direkt ein Startpasswort setzen; dafür ist keine Einladungs-E-Mail erforderlich.

Nur Profile mit Familienzuordnung oder Rolle `schlichter` erhalten Zugriff auf Familiendaten. Eine bloße Supabase-Anmeldung reicht nicht. Neue, unzugeordnete Zugänge sehen eine Freigabeseite; sie können keine fremden Profile, Buchungen oder Verläufe lesen. Als zusätzliche Schutzmaßnahme kann in Supabase die öffentliche Registrierung deaktiviert werden; Einladungen und serverseitiges Anlegen bleiben davon getrennt.

Für Einladungen und Passwort-Zurücksetzen müssen in Supabase unter `Authentication` → `URL Configuration` zusätzlich diese Redirect URLs erlaubt sein:

```text
https://YOUR-VERCEL-DOMAIN/auth/callback
https://YOUR-VERCEL-DOMAIN/auth/passwort-setzen
http://localhost:3000/auth/callback
http://localhost:3000/auth/passwort-setzen
```

### Invite/Password Flow Test

Für einen lokalen Test des Einladungs- und Passwort-Flusses:

1. In `.env.local` eine Testadresse setzen:

```bash
TEST_INVITE_EMAIL=testperson@example.com
```

2. App lokal starten und als Schlichter anmelden.
3. In der Verwaltung unter `Nutzer verwalten` auf `Invite-Flow testen` klicken.
4. Die E-Mail an die Testadresse öffnen und den Link anklicken.
5. Die App sollte auf `/auth/passwort-setzen` landen.
6. Neues Passwort setzen.
7. Danach sollte die Weiterleitung zu `/dashboard` erfolgen und die Anmeldung mit E-Mail und Passwort funktionieren.

Der Testknopf erscheint nur in der lokalen Entwicklung und nicht in Produktion.

Hinweis: Einladungen und Passwort-Zurücksetzen leiten bewusst direkt auf `/auth/passwort-setzen`. So können auch Supabase-Links mit Browser-Hash-Tokens sicher verarbeitet werden.

## 4. Umgebungsvariablen

Diese Werte müssen lokal in `.env.local` und bei Vercel als Environment Variables gesetzt werden:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=change-me
TEST_INVITE_EMAIL=
FAMILY_LOGIN_MODE=false
FAMILY_SHARED_PASSWORD=
```

Wichtig:

- `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_ANON_KEY` dürfen im Browser sichtbar sein.
- `SUPABASE_SERVICE_ROLE_KEY` und `CRON_SECRET` dürfen nicht im Browser stehen.
- In Vercel sollte `NEXT_PUBLIC_APP_URL` die echte Vercel-Adresse sein.
- `TEST_INVITE_EMAIL` wird nur lokal für den Invite/Password Flow Test verwendet.
- `FAMILY_LOGIN_MODE=true` aktiviert den einfachen Familien-Login.
- `FAMILY_SHARED_PASSWORD` ist das gemeinsame Familienpasswort für diesen Modus.
- Startpasswörter werden von Schlichtern direkt in der Verwaltung eingegeben. `DEFAULT_USER_PASSWORD` wird nicht mehr verwendet.

### Startpasswort direkt setzen

Unter `Verwaltung` → `Nutzer verwalten` bei der gewünschten Person `Startpasswort setzen` wählen. Ein eigenes Passwort mit mindestens 8 Zeichen eingeben, wiederholen und das Ersetzen bestätigen. Über `Passwort anzeigen` kann die Eingabe geprüft werden. Nach erfolgreichem Speichern werden die Eingabefelder geleert und geschlossen.

Nur Schlichter dürfen diese Funktion verwenden; der Server prüft die Rolle bei jedem Aufruf. Es wird keine E-Mail verschickt. Der Person ihre hinterlegte E-Mail-Adresse und das gewählte Passwort privat mitteilen. Sie kann sich anschließend über `Mit E-Mail anmelden` anmelden. Fehlende Auth-Zugänge werden wie bisher angelegt, eingeladene Zugänge bestätigt. Das Passwort wird nicht im Profil, im Verlauf oder im Browser-Speicher abgelegt und nicht in Antworten oder Protokollen ausgegeben.

Das Startpasswort läuft nicht automatisch ab; eine Passwortänderung bei der ersten Anmeldung wird derzeit nicht erzwungen. Für jede Person ein eigenes Passwort verwenden.

### Familien-Login

Für die einfache Nutzung innerhalb der Familie kann der Familien-Login aktiviert werden:

```bash
FAMILY_LOGIN_MODE=true
FAMILY_SHARED_PASSWORD=LuFraili14
```

Dann zeigt die Loginseite statt E-Mail/Passwort eine einfache Auswahl:

- Christoph
- Peter
- Philipp
- Teresa
- Franziska

Nach Auswahl der Person und Eingabe des gemeinsamen Passworts wird eine sichere Session per Cookie angelegt. Philipp erhält dabei die Rolle `Schlichter`. Supabase Auth bleibt im Projekt erhalten und wird wieder genutzt, sobald `FAMILY_LOGIN_MODE=false` gesetzt ist.

## 5. Datenbank-Migrationen

Die Migrationen werden in dieser Reihenfolge im Supabase SQL Editor ausgeführt:

```text
supabase/migrations/001_initial_schema.sql
supabase/migrations/003_priority_day_forfeitures.sql
supabase/migrations/004_booking_reliability.sql
supabase/migrations/20261108143829_security_and_yearly_priority.sql
```

Bei einem bestehenden Projekt nur die noch nicht ausgeführten Migrationen starten. Insbesondere `001` nicht erneut ausführen.

### Aktualisierung der Buchungsverwaltung

Vor dem Deployment dieser Version erst `004_booking_reliability.sql`, dann `20261108143829_security_and_yearly_priority.sql` ausführen, soweit noch nicht geschehen. Beide erhalten vorhandene Buchungen, Nutzer und Verfallsbuchungen. Die neue Migration schließt direkte Profil- und Verlaufsschreibzugriffe, beschränkt Leserechte auf freigegebene Familienmitglieder und schützt den letzten Schlichter in der Datenbank.

Die neue Version speichert Buchung, erneute Anfrage, Verfall und Verlauf gemeinsam in einer Datenbanktransaktion. Gleichzeitige Anfragen werden für die Regelprüfung nacheinander verarbeitet. Bestätigte P-Zeiten bleiben gesperrt. Angefragte P-Zeiten belegen das Jahreskontingent bereits während der Widerspruchsfrist.

Verfallene Tage werden künftig mit ihrem konkreten Datum gespeichert. Weitere Änderungen derselben Buchung können zusätzliche Tage verfallen lassen; dasselbe Datum wird dabei nicht mehrfach als Verfall eingetragen. Vorhandene ältere Sammelbeträge bleiben erhalten; ihre einzelnen Tage lassen sich nachträglich nicht zuverlässig rekonstruieren.

Schlichter dürfen über die Verwaltung weiterhin die Mengenbegrenzung der P-Tage übersteuern. Überschneidungen mit bereits bestätigten P-Zeiten bleiben auch dort gesperrt.

Die neuen Datenbankfunktionen sind ausschließlich für den serverseitigen Service-Role-Zugang freigegeben. Deshalb muss `SUPABASE_SERVICE_ROLE_KEY` in Vercel gesetzt sein. Für automatische Bestätigungen muss zusätzlich `CRON_SECRET` gesetzt sein. E-Mail-Benachrichtigungen der App sind abgeschaltet. Die Resend-Abhängigkeit wurde entfernt. Es entstehen keine neuen E-Mail-Vermerke im Buchungsverlauf; alte Einträge bleiben erhalten.

P-Buchungen werden pro betroffenem Kalenderjahr anteilig berechnet, auch während der Widerspruchsfrist. Beispiel: 26.12. bis 04.01. belegt 6 Tage im ersten und 4 Tage im zweiten Jahr. Die Grenze von 21 Tagen gilt weiterhin für die gesamte einzelne P-Buchung. Anzeige und Datenbank prüfen die jeweilige Jahresquote.

## 6. Seed-Daten

Die Beispiel-Daten liegen hier:

```text
supabase/seed/seed.sql
```

Enthalten sind:

- 5 Familienparteien
- Peter als Schlichter
- Carmen als Schlichter
- Beispielnutzer
- eine bestätigte P-Buchung
- eine angefragte Buchung
- eine Buchung mit Klärung
- eine normale Buchung ohne P-Zeit

Hinweis: Die Seed-E-Mails sind Platzhalter wie `peter@example.com`. Echte Profile können in der Verwaltung angelegt, zugeordnet und bei Bedarf als Schlichter markiert werden.

## 7. Benachrichtigungen und WhatsApp

Die App verschickt keine E-Mail-Benachrichtigungen, auch nicht bei Widersprüchen, Bestätigungen, Änderungen oder Stornierungen. `RESEND_API_KEY` und `EMAIL_FROM` werden nicht mehr benötigt. Vorhandene Werte können entfernt werden; sie aktivieren den Versand nicht wieder.

Nach dem Speichern einer Anfrage zeigt die App einen deutlichen Hinweis und einen WhatsApp-Teilen-Button. WhatsApp öffnet sich mit einem vorbereiteten Text. Die Person muss die Familiengruppe auswählen und die Nachricht selbst senden. Es werden weder Telefonnummern noch WhatsApp-Daten gespeichert.

Die Drei-Tage-Frist und die tägliche automatische Bestätigung bleiben unverändert. Auch nach größeren Buchungsänderungen die neue Anfrage wieder in der Gruppe teilen. Die Familie sollte offene Anfragen und Widersprüche regelmäßig in der App prüfen.

Supabase Auth bleibt davon unberührt: Einladungen und Passwort-Zurücksetzen nutzen weiterhin Supabase-E-Mails.

## 8. Vercel Deployment

1. Projekt zu GitHub hochladen.
2. Neues Vercel-Projekt erstellen.
3. Repository verbinden.
4. Environment Variables eintragen.
5. Deploy starten.

Build Command:

```bash
npm run build
```

Start Command ist bei Next.js auf Vercel automatisch.

## 9. Vercel Cron

Die Datei `vercel.json` enthält:

```json
{
  "crons": [
    {
      "path": "/api/cron/confirm-bookings",
      "schedule": "15 2 * * *"
    }
  ]
}
```

Vercel ruft die Route einmal pro Nacht auf. Die Route bestätigt Buchungen automatisch, wenn:

- Status `Angefragt` ist
- die Drei-Tage-Frist vorbei ist
- kein Widerspruch vorliegt

Die Route ist mit `CRON_SECRET` geschützt.

## 10. Schlichter erstellen

Einfachster Weg:

1. Die vorgesehenen Personen erhalten über die Verwaltung einen E-Mail-Zugang mit Startpasswort.
2. In Supabase in der Tabelle `profiles` ihre echten E-Mail-Adressen suchen.
3. `role` auf `schlichter` setzen.
4. `family_party_id` zuweisen.

Danach können Schlichter weitere Nutzer direkt in der App-Verwaltung zuordnen.

Optional kann auch Supabase Email/Password für Schlichter aktiviert werden. Das ist nur als fallback gedacht.

## 11. Buchungsregeln

Die Regeln liegen in:

```text
lib/rules.ts
```

Tests liegen in:

```text
tests/rules.test.ts
```

Ausführen:

```bash
npm test
```

Abgedeckt sind:

- P-Tage zählen
- 42-Tage-Grenze
- 21-Tage-Grenze je P-Buchung
- Überschneidungen
- September-Hinweis
- Stornierungs-Hinweis
- automatische Bestätigung

## 12. Bekannte MVP-Grenzen

Dieses MVP ist absichtlich einfach gehalten.

Noch nicht enthalten:

- Google Calendar Sync
- automatischer WhatsApp-Versand (manuelles Teilen ist vorhanden)
- Push-Benachrichtigungen
- komplexe Rollen
- Zahlungen
- native mobile App
- mehrsprachige Oberfläche

Bewusst einfach gehalten:

- automatische Bestätigung läuft einmal täglich
- Schlichter-Verwaltung ist schlicht
- neue Nutzer werden nach der ersten Anmeldung zugeordnet
- keine automatischen Benachrichtigungen; Anfragen werden manuell in WhatsApp geteilt

## 13. Später Google Calendar Sync hinzufügen

Eine spätere Erweiterung könnte bestätigte Buchungen in einen Google Calendar schreiben.

Empfohlener einfacher Weg:

1. Google Cloud Service Account erstellen.
2. Einen privaten Familienkalender für den Service Account freigeben.
3. Bei Status `Bestätigt` ein Kalenderevent erstellen.
4. Bei `Storniert` das Event löschen oder als storniert markieren.
5. Die Google Event ID in der Tabelle `bookings` speichern.

Für das MVP ist das bewusst nicht eingebaut, damit die App leichter zu betreiben bleibt.
