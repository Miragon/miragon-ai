# Glossar der camunda7-Texte

Ein Begriff pro Sache, in jeder Ansicht gleich. Gilt für die Kataloge in diesem Ordner
(`en*.ts`, `de*.ts`): Widget-Texte, Ask-AI-Übergaben und Server-Zusammenfassungen.
`glossary.test.ts` prüft die verbotenen Synonyme (in jeder Flexion, jede Regel mit einer Probe,
die sie fangen muss), `catalog-text.test.ts` die Regeln aus
brand-tone (du, AI, „CIB seven“, kein Gedankenstrich als Verbinder, Plural nach
der Zahl). Neue Begriffe kommen erst hier hinein, dann in den Test, dann in den Katalog.

## Begriffe

| Sache                                           | Deutsch                                                              | Nicht                           | Englisch                                      | Nicht                 |
| ----------------------------------------------- | -------------------------------------------------------------------- | ------------------------------- | --------------------------------------------- | --------------------- |
| Fehler, den die Engine meldet                   | Incident, Incidents                                                  | Vorfall, Vorfälle               | incident                                      | –                     |
| Instanz anhalten                                | aussetzen, ausgesetzt                                                | anhalten, angehalten, pausieren | suspend, suspended                            | pause, halt           |
| Ausgesetzte Instanz fortsetzen                  | aktivieren                                                           | fortsetzen                      | activate                                      | resume                |
| Zustand einer Instanz                           | läuft (Zustand), laufend (bei Zahlen)                                | aktiv                           | running                                       | active                |
| Zustand einer Definition                        | aktiv, ausgesetzt                                                    | –                               | active, suspended                             | –                     |
| BPMN-Modell auf die Engine bringen              | bereitstellen, bereitgestellt (das Ergebnis heißt Deployment)        | deployen, deployst, deployt     | deploy, deployed                              | –                     |
| Business Key                                    | Geschäftsschlüssel                                                   | GK, Business Key                | business key                                  | BK                    |
| Retries eines Jobs                              | Versuche („Noch 2 Versuche“, „Keine Versuche mehr“)                  | Wiederholungen                  | retries                                       | –                     |
| Job neu ausführen lassen                        | neu versuchen, Ergebnis „Neu eingeplant“                             | wiederholen, „Wiederholt“       | retry, result „Retry scheduled“               | –                     |
| Incident schließen, ohne die Ursache zu beheben | als gelöst markieren, Ergebnis „Als gelöst markiert“                 | auflösen, „Behoben“             | mark as resolved, result „Marked as resolved“ | resolve (as a label)  |
| Alle Engines zusammen                           | alle Engines, Engine-übergreifend                                    | Flotte                          | all engines, cross-engine                     | fleet                 |
| Bearbeiter einer Aufgabe                        | zugewiesen an                                                        | Bearbeiter                      | assigned to                                   | assignee (as a label) |
| Ladezustand                                     | Wird geladen…                                                        | Laden…                          | Loading…                                      | –                     |
| Herstellerprodukt                               | CIB seven, Camunda 7, Operaton (aus `provider.branding.displayName`) | CIB Seven                       | CIB seven                                     | CIB Seven             |
| Künstliche Intelligenz                          | AI                                                                   | KI                              | AI                                            | –                     |

## Übergaben an den Chat

Eine Übergabe (`AskAiButton`) zeigt das Lucide-Icon der konkreten Funktion und ein Verb, das
sagt, dass die Arbeit im Chat passiert. Die Labels stehen unter `handOff.*`, das Icon in
`widgets/lib/hand-off-button.tsx`.

| Funktion         | Deutsch                  | Englisch              |
| ---------------- | ------------------------ | --------------------- |
| Lage einordnen   | Im Chat bewerten         | Assess in chat        |
| Ursache finden   | Ursache im Chat klären   | Find cause in chat    |
| Fehler erklären  | Fehler im Chat erklären  | Explain error in chat |
| Behebung planen  | Behebung im Chat planen  | Plan a fix in chat    |
| Ticket entwerfen | Ticket im Chat entwerfen | Draft ticket in chat  |

Die übrigen Funktionen (Verlauf, Dauer, Variablen, Diagramm, Zustand, Fehler und Performance
über alle Engines) folgen demselben Muster: Objekt, „im Chat“, Verb.

## Texte

- Fehlermeldungen sagen, was passiert ist, und was du tun kannst: „Der Job konnte nicht neu
  eingeplant werden (…). Prüf die Fehlermeldung und versuch es noch mal.“ Steht der erste Teil
  als Titel über einer Meldung (`QueryFallback`, `BpmnHeatmap`), kommt der zweite als
  `errorHint` darunter; der Titel hat nur eine Zeile.
- Booleans heißen „Ja“ und „Nein“ („Yes“ und „No“), nie `true`/`false`.
- Zahlen kommen formatiert in den Katalog (`formatNumber` im Widget); der Plural hängt an der
  Zahl (`countOf` in `plural.ts`), nie an zwei Schlüsseln `…One`/`…Other`.
- Englisch in Sentence case: „Open incidents“, nicht „Open Incidents“.
