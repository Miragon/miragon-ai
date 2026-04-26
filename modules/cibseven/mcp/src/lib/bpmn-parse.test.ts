import { describe, expect, it } from "vitest"
import { countBpmnActivities, extractActivityNames } from "./bpmn-parse.js"

describe("extractActivityNames", () => {
  it("collects id+name pairs from common BPMN element tags", () => {
    const xml = `
      <bpmn:userTask id="Task_A" name="Approve order" />
      <bpmn:serviceTask id="Task_B" name="Send notification">
        <bpmn:documentation>doc</bpmn:documentation>
      </bpmn:serviceTask>
    `
    expect(extractActivityNames(xml)).toEqual({
      Task_A: "Approve order",
      Task_B: "Send notification",
    })
  })

  it("decodes XML entities in names", () => {
    const xml = `<bpmn:userTask id="T" name="A &amp; B &lt;test&gt; &quot;quoted&quot;" />`
    expect(extractActivityNames(xml)).toEqual({ T: 'A & B <test> "quoted"' })
  })

  it("ignores elements without a name attribute or with an empty name", () => {
    const xml = `
      <bpmn:userTask id="A" />
      <bpmn:userTask id="B" name="" />
      <bpmn:userTask id="C" name="visible" />
    `
    expect(extractActivityNames(xml)).toEqual({ C: "visible" })
  })

  it("handles attribute order and unprefixed tags", () => {
    const xml = `
      <userTask name="reversed-order" id="X" />
      <task name="plain" id="Y" />
    `
    expect(extractActivityNames(xml)).toEqual({ X: "reversed-order", Y: "plain" })
  })

  it("returns an empty map for malformed or empty input", () => {
    expect(extractActivityNames("")).toEqual({})
    expect(extractActivityNames("<not really xml>")).toEqual({})
  })
})

describe("countBpmnActivities", () => {
  it("counts tasks, gateways, events, sub-processes, and call activities", () => {
    const xml = `
      <bpmn:startEvent id="S" />
      <bpmn:userTask id="U1" />
      <bpmn:serviceTask id="S1" />
      <bpmn:exclusiveGateway id="G1" />
      <bpmn:subProcess id="SP" />
      <bpmn:callActivity id="CA" />
      <bpmn:endEvent id="E" />
    `
    expect(countBpmnActivities(xml)).toBe(7)
  })

  it("returns zero on input without recognised elements", () => {
    expect(countBpmnActivities("<bpmn:definitions />")).toBe(0)
    expect(countBpmnActivities("")).toBe(0)
  })
})
