import { describe, expect, it } from "vitest"
import { buildIncidentIssuePayload, condenseStacktrace } from "./incident-issue.js"
import { cibsevenProvider } from "../providers/index.js"

/** Engine link with an explicit cockpit base (CIB Seven flavor). */
const engineWithCockpit = (cockpitUrl: string) => ({
  baseUrl: "http://engine.internal/api",
  cockpitUrl,
  provider: cibsevenProvider,
})

/** No cockpitUrl and a baseUrl without /engine-rest suffix — no link derivable. */
const engineWithoutCockpit = { baseUrl: "http://engine.internal/api", provider: cibsevenProvider }

describe("condenseStacktrace", () => {
  it("keeps user frames and drops framework frames, noting how many were trimmed", () => {
    const raw = [
      "java.lang.RuntimeException: nope",
      "\tat com.acme.MyService.doIt(MyService.java:10)",
      "\tat org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(ReflectiveMethodInvocation.java:186)",
      "\tat org.springframework.aop.framework.JdkDynamicAopProxy.invoke(JdkDynamicAopProxy.java:215)",
      "\tat org.camunda.bpm.engine.impl.interceptor.CommandContextInterceptor.execute(CommandContextInterceptor.java:117)",
      "\tat java.base/java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1136)",
      "\tat java.base/java.lang.Thread.run(Thread.java:840)",
    ].join("\n")
    const out = condenseStacktrace(raw)
    expect(out).toContain("RuntimeException: nope")
    expect(out).toContain("MyService.doIt")
    expect(out).not.toContain("ReflectiveMethodInvocation")
    expect(out).not.toContain("ThreadPoolExecutor")
    expect(out).toMatch(/\d+ framework\/internal frames trimmed/)
  })

  it("preserves all sections in a Caused-by chain, each capped independently", () => {
    const userFrames = (prefix: string) =>
      Array.from({ length: 15 }, (_, i) => `\tat com.acme.${prefix}.M${i}(F.java:${i})`).join("\n")
    const raw = [
      "RuntimeException: outer",
      userFrames("outer"),
      "Caused by: java.io.IOException: middle",
      userFrames("middle"),
      "Caused by: java.net.ConnectException: inner",
      userFrames("inner"),
    ].join("\n")
    const out = condenseStacktrace(raw)
    expect(out).toContain("RuntimeException: outer")
    expect(out).toContain("Caused by: java.io.IOException: middle")
    expect(out).toContain("Caused by: java.net.ConnectException: inner")
    // Each section gets at most FRAMES_PER_EXCEPTION (8) frames → 24 total + 3 heads.
    const frameCount = out.split("\n").filter((l) => /^\s*at /.test(l)).length
    expect(frameCount).toBeLessThanOrEqual(24)
  })

  it("falls back to framework frames if all frames are framework (so context isn't lost)", () => {
    const raw = [
      "javax.persistence.PersistenceException: boom",
      "\tat org.hibernate.internal.SessionImpl.flush(SessionImpl.java:1)",
      "\tat org.springframework.orm.jpa.EntityManagerFactoryUtils.flush(EntityManagerFactoryUtils.java:2)",
    ].join("\n")
    const out = condenseStacktrace(raw)
    expect(out).toContain("PersistenceException")
    expect(out).toContain("SessionImpl.flush")
  })
})

describe("buildIncidentIssuePayload", () => {
  const baseIncident = {
    id: "inc-1",
    incidentType: "failedJob",
    incidentMessage: "Boom: NullPointerException at line 42",
    failedActivityId: "ServiceTask_send_invoice",
    activityId: "ServiceTask_send_invoice",
    processDefinitionId: "invoice:1:abc",
    processInstanceId: "pi-42",
    incidentTimestamp: "2026-04-27T10:11:12.000+0200",
    rootCauseIncidentId: "inc-1",
    tenantId: null,
  }

  const baseDefinition = { key: "invoice", version: 7 }

  it("produces a deterministic title and body that mirrors the bug-report template sections", () => {
    const result = buildIncidentIssuePayload({
      incident: baseIncident,
      processDefinition: baseDefinition,
      processInstance: { id: "pi-42" },
      engine: engineWithCockpit("http://localhost:8080/webapp"),
      repository: "Miragon/miragon-ai",
    })

    expect(result.title).toBe("[Bug]: Engine incident (failedJob) in invoice")
    expect(result.labels).toEqual(["bug", "incident"])
    expect(result.suggestedRepository).toBe("Miragon/miragon-ai")
    // The draft is the deliverable: nextStep must keep the agent from filing
    // on its own and may only mention GitHub as the preconfigured convenience.
    expect(result.nextStep).toMatch(/Do NOT file it anywhere on your own/)
    expect(result.nextStep).toContain('repository "Miragon/miragon-ai"')

    for (const section of [
      "### Description",
      "### Steps to Reproduce",
      "### Expected Behaviour",
      "### Actual Behaviour",
      "### Engine context",
      "### Affected Module",
      "camunda7",
      "### Process Engine",
      "CIB Seven",
      "### Cockpit",
    ]) {
      expect(result.body).toContain(section)
    }
    expect(result.body).toContain("Boom: NullPointerException at line 42")
    expect(result.body).toContain("`failedJob`")
    expect(result.body).toContain(
      "http://localhost:8080/webapp/#/seven/auth/process/invoice/7/pi-42?tab=incidents",
    )
  })

  it("returns null suggestedRepository and a draft-only nextStep when no repo is configured", () => {
    const result = buildIncidentIssuePayload({
      incident: baseIncident,
      processDefinition: baseDefinition,
      engine: engineWithoutCockpit,
      repository: null,
    })
    expect(result.suggestedRepository).toBeNull()
    expect(result.prefilledUrl).toBeNull()
    // Tracker-agnostic: the user decides where the draft goes — the agent
    // must not steer towards any specific tracker.
    expect(result.nextStep).toMatch(/Do NOT file it anywhere on your own/)
    expect(result.nextStep).not.toContain("GitHub")
  })

  it("emits a clickable prefilled GitHub new-issue URL when a repo is configured", () => {
    const result = buildIncidentIssuePayload({
      incident: baseIncident,
      processDefinition: baseDefinition,
      engine: engineWithoutCockpit,
      repository: "Miragon/miragon-ai",
    })
    expect(result.prefilledUrl).not.toBeNull()
    const url = new URL(result.prefilledUrl!)
    expect(url.origin + url.pathname).toBe("https://github.com/Miragon/miragon-ai/issues/new")
    expect(url.searchParams.get("title")).toBe(result.title)
    expect(url.searchParams.get("labels")).toBe("bug,incident")
    expect(url.searchParams.get("body")).toContain("Boom: NullPointerException")
  })

  it("truncates the body in the prefilled URL when it would exceed GitHub's URL length cap", () => {
    const huge = "x".repeat(20000)
    const result = buildIncidentIssuePayload({
      incident: { ...baseIncident, incidentMessage: huge },
      processDefinition: baseDefinition,
      engine: engineWithoutCockpit,
      repository: "owner/repo",
    })
    expect(result.prefilledUrl!.length).toBeLessThan(8000)
    const url = new URL(result.prefilledUrl!)
    expect(url.searchParams.get("body")).toContain("body truncated for URL length")
    // The full untruncated body remains in the tool result for manual paste.
    expect(result.body).toContain(huge)
  })

  it("omits the cockpit section when no cockpitUrl is configured", () => {
    const result = buildIncidentIssuePayload({
      incident: baseIncident,
      processDefinition: baseDefinition,
      engine: engineWithoutCockpit,
      repository: "owner/repo",
    })
    expect(result.body).not.toContain("### Cockpit")
  })

  it("falls back gracefully when the engine omits message / activity / definition", () => {
    const result = buildIncidentIssuePayload({
      incident: { id: "inc-x", incidentType: "failedExternalTask" },
      engine: engineWithoutCockpit,
      repository: "owner/repo",
    })
    expect(result.title).toBe("[Bug]: Engine incident (failedExternalTask) in unknown-process")
    expect(result.body).toContain("_No incident message reported by the engine._")
    expect(result.body).toContain("`unknown`")
  })

  it("includes a condensed stacktrace section when a stacktrace is provided", () => {
    const stacktrace = [
      "java.lang.RuntimeException: invoice service unreachable",
      "\tat com.acme.invoice.InvoiceService.send(InvoiceService.java:42)",
      "\tat com.acme.invoice.SendInvoiceDelegate.execute(SendInvoiceDelegate.java:17)",
      "\tat org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(ReflectiveMethodInvocation.java:186)",
      "\tat org.camunda.bpm.engine.impl.delegate.DelegateInvocation.proceed(DelegateInvocation.java:60)",
      "\tat java.base/java.lang.Thread.run(Thread.java:840)",
      "Caused by: java.net.ConnectException: Connection refused",
      "\tat java.base/sun.nio.ch.SocketChannelImpl.checkConnect(Native Method)",
      "\tat com.acme.http.HttpClient.connect(HttpClient.java:88)",
    ].join("\n")
    const result = buildIncidentIssuePayload({
      incident: baseIncident,
      processDefinition: baseDefinition,
      stacktrace,
      engine: engineWithoutCockpit,
      repository: "owner/repo",
    })
    expect(result.body).toContain("Stacktrace (condensed")
    expect(result.body).toContain("RuntimeException: invoice service unreachable")
    expect(result.body).toContain("SendInvoiceDelegate")
    expect(result.body).toContain("Caused by: java.net.ConnectException")
    expect(result.body).toContain("HttpClient.connect")
    // Stacktrace must be in the body BEFORE the engine context table so it
    // survives URL truncation (which slices from the end).
    expect(result.body.indexOf("Stacktrace (condensed")).toBeLessThan(
      result.body.indexOf("### Engine context"),
    )
  })

  it("shows a placeholder under Actual Behaviour when no stacktrace is available", () => {
    const result = buildIncidentIssuePayload({
      incident: baseIncident,
      processDefinition: baseDefinition,
      stacktrace: null,
      engine: engineWithoutCockpit,
      repository: "owner/repo",
    })
    expect(result.body).toContain("_No stacktrace available._")
  })

  it("trims trailing slashes from cockpitUrl when building the deeplink", () => {
    const result = buildIncidentIssuePayload({
      incident: baseIncident,
      processDefinition: baseDefinition,
      engine: engineWithCockpit("http://localhost:8080/webapp///"),
      repository: "owner/repo",
    })
    expect(result.body).toContain(
      "http://localhost:8080/webapp/#/seven/auth/process/invoice/7/pi-42?tab=incidents",
    )
  })
})
