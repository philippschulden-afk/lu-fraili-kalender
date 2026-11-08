# Korrekturen nach der Prüfung vom 08.11.2026

## Umsetzung

- Google-Anmeldung aus der Oberfläche und dem Anmeldecode entfernt; E-Mail-/Passwort-Login direkt sichtbar.
- Datenbank-Lesezugriff an freigegebene Familienprofile gekoppelt. Unzugeordnete Sitzungen sehen nur ihr eigenes Profil und eine Freigabeseite.
- Direkte Profil-, Rollen-, Einstellungs- und Verlaufsschreibrechte der Browserrollen entzogen. Geprüfte Serverrouten und der Auth-Profiltrigger bleiben funktionsfähig.
- Letzter Schlichter durch eine Datenbankprüfung mit Transaktionssperre gegen Löschen und Herabstufen geschützt.
- Next.js auf 16.4.5 und React auf 19.3.1 aktualisiert, Prüfwerkzeuge aktualisiert. Asynchrone Cookies, Routenparameter und Proxy-Konvention angepasst. Resend-SDK und inaktive Versandimplementierung entfernt.
- Passwort-Reset meldet SDK- und Verbindungsfehler statt falschem Erfolg. Callback-Ziele werden auf dieselbe Origin beschränkt.
- Passwort-Sitzungsinitialisierung unterstützt aktive Sitzungen, Codes und Hash-Tokens, entfernt sensible URL-Daten und hat einen abschließenden Fehlerpfad. Bereits vom SDK eingelöste Codes werden nicht nochmals eingelöst.
- P-Tage werden in Datenbank und Oberfläche auf die jeweils betroffenen Kalenderjahre aufgeteilt. Die Eingabe zeigt das Kontingent der gewählten Jahre.
- Warnungen berücksichtigen weiterhin geschützte bestätigte Tage bei erneut angefragten Änderungen.
- Kalender lädt alle Tage des sichtbaren Rasters einschließlich Nachbarmonaten. Stornierte und abgelehnte Buchungen erscheinen nicht als nächste Aufenthalte.
- Buchungsdetails werden nach Statusänderungen aktualisiert. Verwaltung übernimmt den tatsächlich gespeicherten Serverstatus statt des abgesendeten Wunsches.
- Ladefehler werden auf wichtigen Seiten nicht mehr als leerer Kalender oder unbenutztes Kontingent dargestellt.

## Prüfung

Automatische Prüfungen: Unit-Tests, TypeScript-/Produktionsbuild, ESLint, Paket-Sicherheitsprüfung und isolierte PostgreSQL-Regressionssuite. Die SQL-Suite umfasst zusätzlich Familienfreigabe, gesperrte Schreibrechte, Schutz des letzten Schlichters und Jahreswechsel-Quoten.

Die Produktivmigration muss vor dem Deployment angewendet werden. Anschließend dieselben Berechtigungslücken mit zurückgerollten Testtransaktionen erneut prüfen und die vorhandenen Datensatzanzahlen vergleichen. Keine bestehenden Nutzerpasswörter für Tests verändern.

## Grenzen

Ein automatischer Test beweist keinen E-Mail-Empfang im echten Postfach. Der Passwort-Reset muss zusätzlich mit einem freigegebenen Testpostfach bis zur erneuten Anmeldung geprüft werden. Die tägliche Vercel-Ausführung muss im echten Betrieb beobachtet werden; die Logik ist unabhängig davon in Datenbank- und Routentests abgedeckt.

Öffentliche Supabase-Registrierung kann weiterhin neue unzugeordnete Auth-Konten erzeugen. Sie verleiht mit den neuen Datenbankregeln keinen Familienzugriff. Für rein eingeladene Nutzer kann die Registrierung zusätzlich in Supabase abgeschaltet werden.

Der optionale Familienmodus bleibt erhalten, ist aber kein Ersatz für getrennte persönliche Berechtigungen: Wer das gemeinsame Familienpasswort kennt, kann eine Familienidentität auswählen. Für die normalen Schlichter-Berechtigungen persönliche E-Mail-Zugänge verwenden und `FAMILY_LOGIN_MODE=false` lassen.
