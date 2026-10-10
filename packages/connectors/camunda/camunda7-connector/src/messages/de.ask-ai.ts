import type { Camunda7AskAiKey } from "./en.ask-ai.js"

/** German Ask-AI hand-off intents — same keys as `en.ask-ai.ts` (the type enforces parity). */
export const deAskAi: Record<Camunda7AskAiKey, string> = {
  "askAi.jobs.triage":
    "Triagiere die fehlgeschlagenen Jobs: nach Ursache gruppieren, je Gruppe die wahrscheinliche Ursache nennen und eine Maßnahme empfehlen. Nur empfehlen — nichts ändern.",
  "askAi.jobs.explainFailure":
    "Erkläre, warum dieser Job fehlgeschlagen ist: was kaputt ist, ob es vorübergehend oder deterministisch ist, und ein Urteil — RETRY SICHER oder SCHLÄGT ERNEUT FEHL. Nichts ändern.",
  "askAi.jobs.draftTicket":
    "Entwirf ein Incident-Ticket für diesen fehlgeschlagenen Job: den zugehörigen Incident finden, den Entwurf erstellen und mir zur Prüfung zeigen. Nirgends einreichen.",
  "askAi.health.triage":
    "Bewerte den Zustand dieser Engine: die Incident-Cluster nach Auswirkung ordnen, das dringendste Problem fachlich benennen, die wahrscheinliche Ursache und den ersten Schritt zur Behebung. Nichts ohne meine Bestätigung ändern.",
  "askAi.health.diagnoseUnreachable":
    "Der Health-Check der Engine ist fehlgeschlagen. Ermittle, warum die Engine nicht erreichbar ist — ausgefallen, falsche Basis-URL, Authentifizierung oder Netzwerk — und nenne den nächsten Schritt. Nichts ändern.",
  "askAi.cluster.fix":
    "Hilf mir, diesen Incident-Cluster verständlich zu beheben: die Ursache bestätigen, dann eine Behebung genau für diesen Cluster vorschlagen. Zeig mir den Plan und die Zahl der Betroffenen; nichts ausführen, bevor ich bestätige.",
  "askAi.cluster.diagnose":
    "Diagnostiziere diesen Incident-Cluster verständlich: die Ursache bestätigen und ob ein Retry hilft. Diese Installation kann die Engine nicht ändern — entwirf ein Ticket, falls eine Behebung nötig ist.",
  "askAi.cluster.diagnoseLabel": "Diagnose",
  "askAi.history.explainInstance":
    "Erkläre, wo diese Prozessinstanz ihre Zeit verbracht hat: der längste Schritt, Wartezeit gegenüber Arbeit, und ob dieser Durchlauf ein Ausreißer ist.",
  "askAi.history.explainActivity":
    "Erkläre, warum dieser Schritt so lange gedauert hat: Wartezeit oder Arbeit, und ob die Dauer für ihn typisch ist. Nichts ändern.",
  "askAi.fleet.overview":
    "Gib mir einen Überblick über diese Engines: wo die meiste Arbeit und die meisten Probleme liegen, ob es einen Job-Rückstau oder eine stumme Engine gibt, und wo ich anfangen sollte. Nur empfehlen.",
  "askAi.fleet.failures":
    "Analysiere die Fehler über diese Engines: der dominante Fehler-Cluster, ob er isoliert oder systemisch ist, und die wirksamste Behebung.",
  "askAi.fleet.performance":
    "Gib mir einen Überblick über die Prozess-Performance dieser Engines: die schwächsten Prozesse und den Hauptengpass. Prozesse vergleichen, nicht Engines.",
  "askAi.instances.rootCause":
    "Finde die Ursache des Incidents dieser Instanz, prüfe, ob andere Instanzen des Prozesses genauso fehlschlagen, und empfiehl eine Behebung — für diese Instanz oder den ganzen Cluster.",
  "askAi.instances.triageProcess":
    "Triagiere die laufenden Instanzen dieses Prozesses: Incidents nach fehlschlagender Aktivität und Typ gruppieren, den dominanten Fehler nennen und wie viele Instanzen ein Retry behebt gegenüber einer Daten- oder Modellkorrektur. Nur empfehlen.",
  "askAi.instances.triageEngine":
    "Triagiere die laufenden Instanzen dieser Engine über alle Prozesse: Fehler nach Prozess, Aktivität und Typ gruppieren und eine priorisierte Triage je Prozess geben. Nur empfehlen.",
  "askAi.instance.explainTimeline":
    "Erkläre den Ausführungsverlauf dieser Instanz: wo der Token die meiste Zeit verbracht hat, wo er hängt, und ob der Pfad dem Normalablauf entspricht. Nichts ändern.",
  "askAi.instance.checkVariables":
    "Erkläre und prüfe die Variablen dieser Instanz: Werte markieren, die fehlen, fehlerhaft oder widersprüchlich wirken und ihre Incidents erklären könnten. Korrekturen vorschlagen; nichts ohne meine Bestätigung setzen.",
  "askAi.instance.diagnose":
    "Diagnostiziere diese Prozessinstanz: warum der Token hängt, die Ursache jedes offenen Incidents, ob andere Instanzen genauso fehlschlagen, und die beste Behebung. Plan vorlegen; nichts ausführen.",
  "askAi.incident.diagnose":
    "Diagnostiziere diesen Incident: die wahrscheinliche Ursache, ob ein einfacher Retry gelingt, und die empfohlene Behebung — Retry, Datenkorrektur, Instanz-Modifikation oder Eskalation.",
  "askAi.incident.explainError":
    "Erkläre den Fehler dieses Incidents verständlich: was er bedeutet, die wahrscheinliche Ursache, und ob er vorübergehend (Retry sicher) oder deterministisch (schlägt erneut fehl) ist. Nichts ändern.",
  "askAi.incident.draftTicket":
    "Entwirf ein Incident-Ticket für diesen Incident und zeig mir den Entwurf — Titel, Text, Labels — zur Prüfung. Nirgends einreichen.",
  "askAi.process.triage":
    "Triagiere den Zustand dieser Prozessdefinition: Incidents nach Ursache clustern, Symptome von Quellen trennen und je Cluster eine Behebung empfehlen. Nur Diagnose.",
  "askAi.process.healthCheck":
    "Prüfe den Zustand dieser Prozessdefinition: gesund oder beeinträchtigt, die schlechtesten Aktivitäten, die häufigste Incident-Meldung, die wahrscheinlichste Ursache und einen nächsten Schritt. Nichts ändern.",
  "askAi.bpmn.explainState":
    "Erkläre den Zustand dieser Instanz im Diagramm: welche Elemente den Fortschritt blockieren, was jeder Incident bedeutet, ob die Häufungen fehlgeschlagener Jobs auf einen systemischen Fehler deuten, und die nächsten Schritte nach Priorität.",
  "askAi.landscape.triage":
    "Triagiere die Prozesslandschaft dieser Engine: die betroffenen Prozesse nach Schwere ordnen, den dringendsten nennen, seine wahrscheinliche Ursache und den ersten Behebungsschritt.",
  "askAi.incidents.processRootCause":
    "Finde die Ursache der offenen Incidents dieses Prozesses: haben die fehlschlagenden Aktivitäten eine gemeinsame Ursache, ist sie vorübergehend, ein Daten- oder Konfigurationsproblem oder ein fehlerhaftes Modell, und welche Behebung empfiehlst du. Nichts ohne meine Bestätigung ändern.",
  "askAi.incidents.triage":
    "Triagiere alle offenen Incidents dieser Engine: nach Fehler und fehlschlagender Aktivität clustern, die Cluster nach Auswirkung ordnen, die wahrscheinlichste systemische Ursache und den nächsten Schritt je Top-Cluster nennen. Noch nichts ändern.",
  "askAi.incidents.triageFiltered":
    "Triagiere die offenen Incidents, auf die diese Ansicht gefiltert ist: nach Fehler und fehlschlagender Aktivität clustern, die Cluster nach Auswirkung ordnen, die wahrscheinlichste Ursache und den nächsten Schritt je Top-Cluster nennen. Noch nichts ändern.",
}
