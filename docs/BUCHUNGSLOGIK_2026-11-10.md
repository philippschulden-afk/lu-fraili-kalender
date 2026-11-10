# Korrekturen an der Buchungslogik

## Änderungen

- Bestätigte P-Tage werden bei einer Stornierung ab Beginn der kurzfristigen Frist nicht zurückgegeben, auch nicht nach Beginn oder Ende des Aufenthalts.
- Mehrere kleine Datumsänderungen werden gegenüber dem zuletzt angekündigten beziehungsweise neu bestätigten Zeitraum zusammengerechnet. Bei mehr als drei veränderten Tagen beginnt eine neue Anfrage.
- Gegensätzliche Anfragen werden bei der täglichen Prüfung nicht endlos erneut bestätigt: Bei einer inzwischen blockierenden Buchung geht die Anfrage einmalig in „Klärung erforderlich“.
- Zuvor bestätigte, weiterhin enthaltene P-Tage bleiben auch während einer erneuten Anfrage gegen andere Buchungen geschützt.
- Buchungen mit bestätigtem P-Verbrauch, geschützten Tagen oder Verfallseinträgen können nicht dauerhaft gelöscht werden. Stornierung bleibt möglich; Verbrauch und Verlauf bleiben erhalten.
- Normale Buchungen verschiedener Parteien dürfen sich nur überschneiden, wenn beide Buchungen gemeinsamen Aufenthalt erlauben. Gültige P-Anfragen über normalen Buchungen bleiben möglich.
- Widersprüche setzen die Anfrage auf „Klärung erforderlich“. Weitere Widersprüche bleiben während der ursprünglichen Frist möglich. Schlichter können Klärungsfälle bestätigen oder ablehnen; ein belegter P-Zeitraum bleibt gesperrt.

## Migration

`supabase/migrations/20261110133015_booking_rule_consistency.sql`

Die Migration ergänzt den Vergleichszeitraum für Änderungen. Bei bestehenden Buchungen wird der aktuelle Zeitraum als Ausgangspunkt verwendet; frühere kleine Änderungen können ohne eindeutige historische Vergleichsdaten nicht rückwirkend rekonstruiert werden. Bestehende offene Widersprüche werden sichtbar auf „Klärung erforderlich“ gesetzt. Historische Stornierungen und P-Tage werden nicht nachträglich umgerechnet.

Die Migration prüft die erwartete Version der bisherigen Speicherfunktion und bricht bei Abweichungen vollständig ab. Die bestehende jährliche Quotenprüfung, Schreibberechtigungen und Transaktionssperre bleiben erhalten.

## Prüfung

- Anwendungstests: `npm test`
- Codeprüfung: `npm run lint`
- Produktionsbuild: `npm run build`
- Datenbanktests in einer isolierten Testdatenbank nach sämtlichen Migrationen:
  - `supabase/tests/booking_reliability.sql`
  - `supabase/tests/security_and_yearly_priority.sql`
  - `supabase/tests/booking_rule_consistency.sql`

Die SQL-Tests verwenden Transaktionen mit abschließendem Rollback. Sie gehören in eine isolierte Testdatenbank, nicht in die produktive Familienbelegung.

Dieser Bericht beschreibt den ersten Korrekturschritt. Die anschließend beschlossenen Regeln zu Übernachtungen, Verdrängung und gleichen P-Grenzen für Schlichter sind in `UEBERNACHTUNGEN_UND_KLAERUNG_2026-11-10.md` dokumentiert. Der Benachrichtigungsbeginn bleibt bis zur Einrichtung einer verlässlichen Benachrichtigung unverändert.
