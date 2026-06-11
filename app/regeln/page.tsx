import { PageShell } from "@/components/page-shell";

const familyParties = ["Christoph", "Peter", "Philipp", "Teresa", "Franziska"];

export default function RulesPage() {
  return (
    <PageShell>
      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold text-teal-950">Regeln für Lu Fraili</h1>
        <p className="mt-3 text-xl text-gray-700">
          Kurze Übersicht, wie Buchungen, P-Zeiten und Konflikte geregelt sind.
        </p>

        <div className="mt-8 space-y-5">
          <RuleSection title="1. Grundsatz">
            <p>
              Die App soll die Nutzung von Lu Fraili fair, transparent und möglichst konfliktfrei regeln. Direkte Absprachen bleiben jederzeit möglich. Die Regeln helfen vor allem dann, wenn sich Buchungen überschneiden oder Unklarheiten entstehen.
            </p>
          </RuleSection>

          <RuleSection title="2. Familienparteien">
            <p>Es gibt fünf Familienparteien:</p>
            <ol className="mt-3 list-decimal space-y-1 pl-6">
              {familyParties.map((party) => (
                <li key={party}>{party}</li>
              ))}
            </ol>
            <p className="mt-3">Jede Familienpartei kann Buchungen eintragen und P-Zeit nutzen.</p>
          </RuleSection>

          <RuleSection title="3. P-Zeit">
            <p>Jede Familienpartei hat pro Kalenderjahr <strong>42 P-Tage</strong>.</p>
            <p><strong>P-Zeit</strong> bedeutet: Diese Buchung hat Vorrang vor normalen Buchungen.</p>
            <p>Eine einzelne P-Buchung darf maximal <strong>21 Tage</strong> dauern.</p>
          </RuleSection>

          <RuleSection title="4. Normale Buchungen">
            <p>Normale Buchungen sind Buchungen ohne P-Zeit.</p>
            <p>Sie sind erlaubt und zählen nicht auf das P-Kontingent.</p>
            <p>Eine normale Buchung kann aber durch eine gültige <strong>P-Zeit</strong> einer anderen Familienpartei verdrängt werden.</p>
          </RuleSection>

          <RuleSection title="5. Überschneidungen">
            <p>Eine bestätigte <strong>P-Zeit</strong> blockiert den Zeitraum.</p>
            <p>Das bedeutet:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>P-Zeit über P-Zeit: nicht möglich</li>
              <li>Normale Buchung über P-Zeit: nicht möglich</li>
              <li>P-Zeit über normale Buchung: möglich, aber die betroffene Partei muss informiert werden</li>
              <li>Normale Buchung über normale Buchung: möglich, wenn gemeinsamer Aufenthalt abgestimmt ist</li>
            </ul>
          </RuleSection>

          <RuleSection title="6. Drei-Tage-Frist">
            <p>Neue Buchungen werden zunächst als angefragt eingetragen.</p>
            <p>Alle anderen haben <strong>3 Tage</strong> Zeit, zu widersprechen.</p>
            <p>Wenn niemand widerspricht, wird die Buchung automatisch bestätigt.</p>
          </RuleSection>

          <RuleSection title="7. Widerspruch">
            <p>Ein Widerspruch soll nur genutzt werden, wenn es wirklich Klärungsbedarf gibt.</p>
            <p>Nach einem Widerspruch steht die Buchung auf Klärung erforderlich.</p>
            <p>Dann entscheiden die Schlichter.</p>
          </RuleSection>

          <RuleSection title="8. Schlichter">
            <p>Schlichter sind aktuell:</p>
            <ul className="mt-3 list-disc space-y-1 pl-6">
              <li>Philipp</li>
              <li>Peter</li>
            </ul>
            <p className="mt-3">Schlichter können Konflikte lösen, Buchungen verwalten und Nutzer zuordnen.</p>
          </RuleSection>

          <RuleSection title="9. Stornierung von P-Zeit">
            <p>Wird eine bestätigte P-Zeit mindestens <strong>1 Monat</strong> vor Beginn storniert, werden die P-Tage wieder frei.</p>
            <p>Wird eine bestätigte P-Zeit weniger als <strong>1 Monat</strong> vor Beginn storniert oder wesentlich geändert, verfallen die aufgegebenen P-Tage.</p>
            <p>Das bedeutet: Diese P-Tage werden dem Jahreskontingent nicht wieder gutgeschrieben.</p>
          </RuleSection>

          <RuleSection title="10. Änderung von P-Zeit">
            <p>Wenn eine P-Zeit kurzfristig geändert wird, verfallen nur die ursprünglich bestätigten Tage, die dadurch aufgegeben werden.</p>
            <p>Beispiele:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>Verlängerung: keine P-Tage verfallen</li>
              <li>Verkürzung: die wegfallenden Tage verfallen</li>
              <li>Verschiebung: die aufgegebenen ursprünglichen Tage verfallen</li>
              <li>Komplette Stornierung: alle betroffenen P-Tage verfallen</li>
            </ul>
          </RuleSection>

          <RuleSection title="11. September-Regel">
            <p>Solange Peter und Christoph berufstätig sind, soll der September bevorzugt Peter und Christoph zur Verfügung stehen.</p>
            <p>Das ist keine harte Sperre, aber die App zeigt bei anderen Buchungen im September einen Hinweis.</p>
          </RuleSection>

          <RuleSection title="12. Kommunikation">
            <p>Die App ersetzt perspektivisch den bisherigen Kalender.</p>
            <p>Bei wichtigen Änderungen kann zusätzlich eine WhatsApp-Nachricht geteilt werden.</p>
            <p>Die App bleibt aber die maßgebliche Übersicht.</p>
          </RuleSection>
        </div>
      </div>
    </PageShell>
  );
}

function RuleSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-teal-100 bg-white p-5 text-lg leading-relaxed text-gray-800 shadow-sm">
      <h2 className="text-2xl font-bold text-teal-950">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
