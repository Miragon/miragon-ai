# Glossar der Analytics-Texte

Ein Begriff, ein Wort: Die Kataloge in diesem Ordner (`*.sweep.ts` für die Widgets,
`*.ask-ai.ts` für die Übergaben an den Chat, `*.server.ts` für die Zusammenfassungen an
das Modell) benutzen genau die Wörter dieser Tabelle. Die Schreibregeln (du, AI, „CIB
seven“, kein Gedankenstrich als Verbinder) prüft `brand-gates.test.ts`, die Begriffe
`glossary.test.ts` über `glossary.ts`. Wer hier einen Begriff ändert, ändert ihn auch dort.

| Deutsch                 | Englisch                 | Nicht                                                                    | Hinweis                                                                                                                                                                                                       |
| ----------------------- | ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Incident                | incident                 | Vorfall, Vorfälle, Störung, occurrence                                   | Fachbegriff im Betrieb, wird nicht eingedeutscht. Plural „Incidents“, „Incident-Typ“, „Incident-Gruppen“.                                                                                                     |
| Incidents je 100 Starts | incidents per 100 starts | Vorfallsrate, „/ 100 gestartet“                                          | Eine Rate kann über 100 liegen, deshalb ohne %. Live: „Incidents je 100 laufende“.                                                                                                                            |
| AI                      | AI                       | KI                                                                       | Auch in Zusammensetzungen.                                                                                                                                                                                    |
| CIB seven               | CIB seven                | CIB Seven                                                                | Der Herstellername kommt aus `provider.branding.displayName`.                                                                                                                                                 |
| Geschäftsschlüssel      | business key             | GK, Business Key (im Deutschen)                                          | Nie abgekürzt.                                                                                                                                                                                                |
| aussetzen, ausgesetzt   | suspend, suspended       | anhalten, angehalten, pausiert, paused                                   | „Ausgesetzte Jobs“.                                                                                                                                                                                           |
| läuft, laufend          | running                  | aktiv, active                                                            | „Laufen gerade“, „Laufende Instanzen“.                                                                                                                                                                        |
| Versuche                | retries                  | Wiederholungen, Retries (im Deutschen)                                   | Die Restversuche eines Jobs.                                                                                                                                                                                  |
| Jobs ohne Versuche      | jobs without retries     | tote Jobs, dead jobs                                                     | Die Metrik `camunda_jobs_failed`: Jobs, deren Versuche aufgebraucht sind.                                                                                                                                     |
| nicht belastbar         | not reliable             | unzureichendes Signal, Unzureichende Datengrundlage, insufficient signal | Ein Vergleich unter der Mindestgröße zeigt Zahlen, aber kein Urteil. „Zu wenig Daten“ im Hinweis.                                                                                                             |
| Zeitraum                | period                   | Fenster, Zeitfenster, window, Bucket                                     | Nur in Widget-Texten und Übergaben; die Zusammenfassungen an das Modell dürfen „window“ sagen.                                                                                                                |
| Kennzahl                | metric                   | KPI                                                                      | „Kennzahlen vergleichen“, „Für eine Seite fehlen die Kennzahlen“.                                                                                                                                             |
| gerade, Stand           | right now, as of         | Snapshot                                                                 | „Gerade ist kein Incident offen.“, „Stand 14:32“.                                                                                                                                                             |
| Im Chat …               | … in chat                | Analysieren (ohne Ziel), Sparkle-Symbol                                  | Jede Übergabe nennt die konkrete Funktion und den Chat: „Im Chat bewerten“, „Ursache im Chat suchen“, „Engpass im Chat erklären“, „Im Chat priorisieren“. Dazu das Lucide-Icon der Funktion, nie ein Sparkle. |

## Zahlen und Urteile

- Zahlen formatiert das Kit (`formatNumber`, `formatPercent`, `formatDuration`,
  `formatLookback`) in der Sprache der Ansicht: „1.234“, „+12,5 %“, „3 Min. 7 s“,
  „Letzte 7 Tage“. Eine Änderung von Incidents je 100 Starts hat dieselbe Einheit wie
  die Werte („+0,2“).
- Volumen (Starts) bekommt nie ein Urteil: Weniger Last auf einer Testumgebung ist kein
  Fehler. Nur Qualitätskennzahlen (Dauern, Incidents je 100 Starts) heißen „besser“ oder
  „schlechter“, und erst ab ihrer Schwelle (Dauern ab 5 %, Incidents ab 1 je 100 Starts).
- Ein Vergleich unter der Mindestgröße zeigt seine Änderungen neutral mit „nicht
  belastbar“.
- Unter jedem Titel steht der Bezugsrahmen: Zeitraum, Engines (und wie viele davon ohne
  Metriken), Stand.
