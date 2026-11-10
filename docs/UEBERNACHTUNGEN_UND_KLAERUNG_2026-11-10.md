# Übernachtungen und gemeinsame Klärung

## Verbindliche Regeln

- `start_date` ist die Anreise, `end_date` die Abreise. Gezählt werden Übernachtungen: Samstag bis Samstag sind sieben P-Tage.
- Eine Nacht wird dem Kalenderjahr ihres Beginns zugeordnet. Die Nacht vom 31.12. auf den 01.01. zählt nur zum alten Jahr.
- Abreise und nächste Anreise am selben Tag sind erlaubt, auch ohne Freigabe für gemeinsamen Aufenthalt. Eine tatsächlich gemeinsam belegte Nacht bleibt eine Überschneidung.
- Neue Buchungen benötigen mindestens eine Übernachtung.
- Die Grenzen von 42 P-Tagen pro Jahr und 21 P-Tagen pro Buchung gelten auch für Schlichter. Die Verwaltung hat keinen Kontingent-Override mehr.
- Neue oder wesentlich geänderte P-Zeit über einer bestätigten normalen Buchung setzt beide Buchungen auf „Klärung erforderlich“. Es wird nichts automatisch storniert oder verkürzt. Das gilt auch bei der automatischen Bestätigungsprüfung älterer Anfragen.
- Schlichter können nach Abstimmung die P-Buchung bestätigen oder ablehnen. Die betroffene normale Buchung muss anschließend ebenfalls abgelehnt, storniert oder passend geändert werden. Bestätigte P-Zeit darf weiterhin nicht überbucht werden.
- Klärungsfälle werden nicht automatisch bestätigt. Beide Buchungen erhalten Verlaufseinträge. WhatsApp-Texte versprechen für solche Fälle keine automatische Bestätigung.

## Datenumstellung

Migration: `supabase/migrations/20261110182329_overnight_counting_and_priority_clarification.sql`.

Die Reisedaten bestehender Buchungen bleiben unverändert. Aktive Kontingente werden künftig nach Übernachtungen berechnet. Bestätigte Schutzzeiträume enthalten Nächte statt des bisherigen eingeschlossenen Abreisetags. Bei erneut angefragten geschützten Buchungen wird der bisherige letzte geschützte Kalendertag als früherer Abreisetag entfernt.

Zum geprüften Umstellungszeitpunkt existierten keine Verfallseinträge. Falls die Migration auf einem anderen Datenbestand bestehende Verfallseinträge findet, bricht sie ab: Historische Verfälle dürfen ohne Prüfung ihrer damaligen Reisedaten nicht pauschal umgerechnet werden.

Die Umstellung nutzt dieselbe Transaktionssperre wie sämtliche Buchungsänderungen. Quoten, Überschneidungen, Klärung und Verlauf werden in einer Transaktion gespeichert. Die bestehenden serverseitigen Rollenprüfungen und RLS-Zugriffsregeln bleiben erhalten.

## Prüfungen

- `npm test`, `npm run lint`, `npm run build`.
- Alle bisherigen SQL-Regressionstests nach sämtlichen Migrationen.
- Zusätzlich `supabase/tests/overnights_and_displacement.sql`: Klärung beider Buchungen, keine automatische Bestätigung, explizite Schlichterentscheidung, sieben geschützte Nächte, Wechsel ohne gemeinsame Nutzung und P-Grenzen mit `p_management=true`.
- SQL-Tests ausschließlich in einer isolierten Testdatenbank ausführen. Alle Testdaten werden zurückgerollt.

## Benachrichtigung noch offen

Der bisherige manuelle WhatsApp-Teilen-Button bleibt bestehen. Buchungs-E-Mails bleiben deaktiviert. Es wurde keine WhatsApp-Automatik eingerichtet und keine Domainkonfiguration geändert. Die Drei-Tage-Frist beginnt weiterhin mit dem Speichern. Ein Wechsel des Fristbeginns oder eine verpflichtende Zustellbestätigung wurde nicht beschlossen.
