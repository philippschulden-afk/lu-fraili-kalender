# Lu Fraili Belegungskalender

Ein privater, einfacher Familienkalender für das Ferienhaus in Lu Fraili, Sardinien.

Die App ersetzt die manuelle WhatsApp-Ankündigung: Eine Buchung wird zuerst angefragt, alle anderen Familienparteien werden per E-Mail informiert und haben drei Tage Zeit für einen Widerspruch. Ohne Widerspruch bestätigt die App die Buchung automatisch einmal täglich.

## 1. Lokale Installation

Voraussetzungen:

- Node.js 20 oder neuer
- Ein Supabase-Projekt
- Ein Resend-Konto für E-Mails

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
3. Den Inhalt von `supabase/migrations/001_initial_schema.sql` ausführen.
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

## 3. Google Login über Supabase OAuth

In Supabase:

1. `Authentication` öffnen.
2. `Providers` öffnen.
3. Google aktivieren.
4. Google Client ID und Client Secret eintragen.
5. Redirect URL eintragen:

Lokal:

```text
http://localhost:3000/auth/callback
```

Auf Vercel:

```text
https://DEINE-VERCEL-DOMAIN.vercel.app/auth/callback
```

Familienmitglieder melden sich bevorzugt mit Google an. Nach der ersten Anmeldung erscheint ihr Profil in der Verwaltung und kann einer Familienpartei zugeordnet werden.

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
RESEND_API_KEY=
EMAIL_FROM=Lu Fraili <buchungen@example.com>
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=change-me
TEST_INVITE_EMAIL=
FAMILY_LOGIN_MODE=false
FAMILY_SHARED_PASSWORD=
DEFAULT_USER_PASSWORD=
```

Wichtig:

- `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_ANON_KEY` dürfen im Browser sichtbar sein.
- `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` und `CRON_SECRET` dürfen nicht im Browser stehen.
- In Vercel sollte `NEXT_PUBLIC_APP_URL` die echte Vercel-Adresse sein.
- `TEST_INVITE_EMAIL` wird nur lokal für den Invite/Password Flow Test verwendet.
- `FAMILY_LOGIN_MODE=true` aktiviert den einfachen Familien-Login.
- `FAMILY_SHARED_PASSWORD` ist das gemeinsame Familienpasswort für diesen Modus.
- `DEFAULT_USER_PASSWORD` ist das Startpasswort, das Schlichter in der Verwaltung für Supabase-Auth-Nutzer setzen können.

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
```

Bei einem bestehenden Projekt nur die noch nicht ausgeführten Migrationen starten. Insbesondere `001` nicht erneut ausführen.

### Aktualisierung der Buchungsverwaltung

Vor dem Deployment dieser Version `004_booking_reliability.sql` ausführen. Sie erhält vorhandene Buchungen und Verfallsbuchungen.

Die neue Version speichert Buchung, erneute Anfrage, Verfall und Verlauf gemeinsam in einer Datenbanktransaktion. Gleichzeitige Anfragen werden für die Regelprüfung nacheinander verarbeitet. Bestätigte P-Zeiten bleiben gesperrt. Angefragte P-Zeiten belegen das Jahreskontingent bereits während der Widerspruchsfrist.

Verfallene Tage werden künftig mit ihrem konkreten Datum gespeichert. Weitere Änderungen derselben Buchung können zusätzliche Tage verfallen lassen; dasselbe Datum wird dabei nicht mehrfach als Verfall eingetragen. Vorhandene ältere Sammelbeträge bleiben erhalten; ihre einzelnen Tage lassen sich nachträglich nicht zuverlässig rekonstruieren.

Schlichter dürfen über die Verwaltung weiterhin die Mengenbegrenzung der P-Tage übersteuern. Überschneidungen mit bereits bestätigten P-Zeiten bleiben auch dort gesperrt.

Die neuen Datenbankfunktionen sind ausschließlich für den serverseitigen Service-Role-Zugang freigegeben. Deshalb muss `SUPABASE_SERVICE_ROLE_KEY` in Vercel gesetzt sein, auch bei Anmeldung über Google. Für automatische Bestätigungen muss zusätzlich `CRON_SECRET` gesetzt sein. Für E-Mail-Versand werden `RESEND_API_KEY`, `EMAIL_FROM` und `NEXT_PUBLIC_APP_URL` benötigt. Fehlender oder fehlgeschlagener E-Mail-Versand wird im Verlauf als solcher angezeigt.

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

Hinweis: Die Seed-E-Mails sind Platzhalter wie `peter@example.com`. Nach echten Google-Anmeldungen können die echten Profile in der Verwaltung zugeordnet und als Schlichter markiert werden.

## 7. Resend E-Mail Setup

1. Resend-Konto erstellen.
2. Absender-Domain einrichten oder zum Testen eine erlaubte Testadresse verwenden.
3. API Key erzeugen.
4. `RESEND_API_KEY` setzen.
5. `EMAIL_FROM` setzen, zum Beispiel:

```text
Lu Fraili <buchungen@deine-domain.de>
```

E-Mails werden verschickt bei:

- neuer Buchungsanfrage
- Widerspruch
- automatischer Bestätigung
- Stornierung

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

1. Peter und Carmen melden sich einmal mit Google an.
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
- WhatsApp-Integration
- Push-Benachrichtigungen
- komplexe Rollen
- Zahlungen
- native mobile App
- mehrsprachige Oberfläche

Bewusst einfach gehalten:

- automatische Bestätigung läuft einmal täglich
- Schlichter-Verwaltung ist schlicht
- neue Nutzer werden nach der ersten Anmeldung zugeordnet
- E-Mail ist der einzige automatische Benachrichtigungskanal

## 13. Später Google Calendar Sync hinzufügen

Eine spätere Erweiterung könnte bestätigte Buchungen in einen Google Calendar schreiben.

Empfohlener einfacher Weg:

1. Google Cloud Service Account erstellen.
2. Einen privaten Familienkalender für den Service Account freigeben.
3. Bei Status `Bestätigt` ein Kalenderevent erstellen.
4. Bei `Storniert` das Event löschen oder als storniert markieren.
5. Die Google Event ID in der Tabelle `bookings` speichern.

Für das MVP ist das bewusst nicht eingebaut, damit die App leichter zu betreiben bleibt.
