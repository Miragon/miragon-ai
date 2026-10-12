import { afterEach, describe, expect, it, vi } from "vitest"
import { NO_NAMES, createNameLookup, parseBpmnNames } from "./bpmn-name-lookup.js"
import { elementNameOf, processNameOf } from "./bpmn-names.js"

/**
 * The names behind the ids (U13): read on the server from the diagram the
 * injected BPMN lookup returns, never a guess, never a failure.
 */

const LEASING = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_1">
  <!-- <bpmn:userTask id="Task_Commented" name="Never shown" /> -->
  <bpmn:process id="miraveloLeasing" name="Bike Leasing" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Application&#10;received" />
    <bpmn:userTask id="Activity_Decide" name='Decide on "Leasing &amp; Co"'>
      <bpmn:documentation><![CDATA[<bpmn:task id="Task_InCdata" name="Nope"/>]]></bpmn:documentation>
    </bpmn:userTask>
    <bpmn:exclusiveGateway id="Gateway_Amount" name="Amount &gt; 1000?" />
    <bpmn:serviceTask id="Activity_Unnamed" />
    <bpmn:serviceTask id="Activity_Blank" name="   " />
    <bpmn:endEvent id="EndEvent_Done" name="Done &#x2713;"/>
  </bpmn:process>
</bpmn:definitions>`

describe("parseBpmnNames", () => {
  it("reads the process name and every named element, entities decoded, space folded", () => {
    expect(parseBpmnNames(LEASING, "miraveloLeasing")).toEqual({
      name: "Bike Leasing",
      elements: {
        StartEvent_1: "Application received",
        Activity_Decide: 'Decide on "Leasing & Co"',
        Gateway_Amount: "Amount > 1000?",
        EndEvent_Done: "Done ✓",
      },
    })
  })

  it("takes the pool's name when the process has none, and the default namespace", () => {
    const xml = `<definitions>
      <collaboration id="Collab"><participant id="Pool" name="Invoice handling" processRef="invoice"/></collaboration>
      <process id="invoice"><task id="Task_A" name="Approve"/></process>
      <process id="other" name="Other process"/>
    </definitions>`
    // The pool is no element of the process: only the named task is.
    expect(parseBpmnNames(xml, "invoice")).toEqual({
      name: "Invoice handling",
      elements: { Task_A: "Approve" },
    })
    // Another process of the same file keeps its own name.
    expect(parseBpmnNames(xml, "other").name).toBe("Other process")
  })

  it("prefers the process's own name over its pool's", () => {
    const xml = `<definitions><participant processRef="p" name="Pool"/><process id="p" name="Own"/></definitions>`
    expect(parseBpmnNames(xml, "p").name).toBe("Own")
  })

  it("yields no names for a document that is not BPMN, never an error", () => {
    expect(parseBpmnNames("not xml at all <<<", "x")).toEqual({ name: null, elements: {} })
    expect(parseBpmnNames("", "x")).toEqual({ name: null, elements: {} })
    // A character reference past Unicode stays as written instead of throwing.
    const odd = `<process id="p"><task id="T" name="a &#99999999; b &#x110000; &bogus;"/></process>`
    expect(parseBpmnNames(odd, "p").elements.T).toBe("a &#99999999; b &#x110000; &bogus;")
  })
})

describe("createNameLookup", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("knows no names without a BPMN lookup (no camunda7 module)", async () => {
    expect(createNameLookup(undefined)).toBe(NO_NAMES)
    expect(await NO_NAMES(["a"])).toEqual({})
  })

  it("reads each key once and keeps only the elements a view asks for", async () => {
    const fetchBpmnXml = vi.fn((key: string) =>
      Promise.resolve(key === "miraveloLeasing" ? LEASING : null),
    )
    const namesFor = createNameLookup(fetchBpmnXml)
    const index = await namesFor(["miraveloLeasing", "miraveloLeasing", "", "unknown"], {
      miraveloLeasing: ["Activity_Decide", "Activity_Missing"],
      unknown: [],
    })
    expect(index).toEqual({
      miraveloLeasing: {
        name: "Bike Leasing",
        elements: { Activity_Decide: 'Decide on "Leasing & Co"' },
      },
    })
    expect(fetchBpmnXml.mock.calls.map((c) => c[0])).toEqual(["miraveloLeasing", "unknown"])
    expect(processNameOf(index, "miraveloLeasing")).toBe("Bike Leasing")
    expect(processNameOf(index, "unknown")).toBeNull()
    expect(elementNameOf(index, "miraveloLeasing", "Activity_Decide")).toBe(
      'Decide on "Leasing & Co"',
    )
    expect(elementNameOf(index, "miraveloLeasing", "constructor")).toBeNull()
    expect(elementNameOf(index, "unknown", "x")).toBeNull()
    expect(elementNameOf(undefined, "a", "b")).toBeNull()
    // Without an element list a key comes with every named element.
    const all = await namesFor(["miraveloLeasing"])
    expect(Object.keys(all.miraveloLeasing.elements)).toHaveLength(4)
  })

  it("reuses a read, an empty one too, until it is older than the ttl", async () => {
    let now = 0
    const fetchBpmnXml = vi.fn((key: string) => Promise.resolve(key === "a" ? LEASING : null))
    const namesFor = createNameLookup(fetchBpmnXml, { ttlMs: 1000, now: () => now })
    await namesFor(["a", "b"])
    now = 999
    await namesFor(["a", "b"])
    expect(fetchBpmnXml).toHaveBeenCalledTimes(2)
    now = 1000
    await namesFor(["a", "b"])
    expect(fetchBpmnXml).toHaveBeenCalledTimes(4)
  })

  it("goes on with the ids when a read fails or is slow, and asks again next time", async () => {
    vi.useFakeTimers()
    const fetchBpmnXml = vi.fn((key: string) =>
      key === "slow"
        ? new Promise<string | null>(() => {})
        : Promise.reject(new Error("ECONNREFUSED")),
    )
    const namesFor = createNameLookup(fetchBpmnXml, { timeoutMs: 50 })
    const pending = namesFor(["slow", "broken"])
    await vi.advanceTimersByTimeAsync(50)
    expect(await pending).toEqual({})
    const again = namesFor(["slow", "broken"])
    await vi.advanceTimersByTimeAsync(50)
    await again
    expect(fetchBpmnXml).toHaveBeenCalledTimes(4)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("looks up at most maxKeys keys for one view", async () => {
    const fetchBpmnXml = vi.fn<(key: string) => Promise<string | null>>(() => Promise.resolve(null))
    await createNameLookup(fetchBpmnXml, { maxKeys: 2 })(["a", "b", "c"])
    expect(fetchBpmnXml.mock.calls.map((c) => c[0])).toEqual(["a", "b"])
  })
})
