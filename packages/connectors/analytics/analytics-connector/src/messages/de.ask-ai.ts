import type { AnalyticsAskAiKey } from "./en.ask-ai.js"

/** German analytics Ask-AI intents — same keys as `en.ask-ai.ts` (the type enforces parity). */
export const deAskAi: Record<AnalyticsAskAiKey, string> = {
  "askAi.clusterCompare":
    "Deute diesen Vorher/Nachher-Vergleich um ein Deployment in 3–4 Sätzen: echte Verschlechterung oder Rauschen, welche Kennzahl (und welches Element) sie treibt, und eine Maßnahme — zurückrollen, weitere Rollouts anhalten oder akzeptieren.",
  "askAi.engineCompare":
    "Deute diesen Vergleich eines Prozesses auf zwei Engines in 3–4 Sätzen: läuft er auf der zweiten Engine wirklich schlechter oder ist es Rauschen, welche Kennzahl treibt den Abstand, und eine empfohlene Maßnahme.",
  "askAi.versionCompare":
    "Deute diesen Versionsvergleich in 3–4 Sätzen: echte Verschlechterung der neuen Version oder Rauschen, welches Element sie treibt, und eine Maßnahme — laufende Instanzen zurückmigrieren, Rollout anhalten oder akzeptieren.",
  "askAi.landscapeCompare":
    "Vergleiche diesen Prozess zwischen den beiden Engines: zeig den Vergleich nebeneinander, sag, auf welcher Engine er besser läuft und ob der Abstand signifikant ist, und eine empfohlene Maßnahme. Nur empfehlen.",
  "askAi.executionSummary":
    "Bewerte die angezeigte Prozessanalyse: gesund oder sich verschlechternd, die wahrscheinlichste Ursache von Incidents, und der wertvollste nächste Schritt. Fasse dich kurz.",
  "askAi.activityBottleneck":
    "Erkläre, warum diese Aktivität ein Engpass ist: lange Ausführungen oder schiere Menge, Warten oder Arbeiten je nach Typ, und was als Nächstes am meisten bringt. Nichts ändern.",
  "askAi.failureSummary":
    "Triagiere die offenen Incidents: Fehlermuster nach wahrscheinlicher gemeinsamer Ursache gruppieren, einen systemischen Ausfall von einzelnen Prozessfehlern unterscheiden und ordnen, was zuerst zu beheben ist. Gegen den Live-Zustand prüfen; nur Analyse.",
  "askAi.failureRate":
    "Erkläre, was die offenen Incidents dieses Prozesses treibt: ist es eine Verschlechterung (jüngste Zeiträume oder die Fenster um ein Deployment), und welche Aktivität am häufigsten fehlschlägt. Nichts ändern.",
  "askAi.errorPattern":
    "Finde die Ursache dieser Gruppe offener Incidents: lies ihre Meldungen und die fehlschlagende Aktivität, dann nenne die wahrscheinliche Ursache, ob sie vorübergehend oder systemisch ist, und die empfohlene Behebung. Nichts ändern.",
}
