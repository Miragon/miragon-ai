// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { translator } from "../messages/index.js"
import { NamedId, activityTypeKey, activityTypeLabel } from "./names.js"

afterEach(cleanup)

describe("activity types in words", () => {
  it.each([
    ["serviceTask", "aActivityType.serviceTask"],
    ["callActivity", "aActivityType.callActivity"],
    ["exclusiveGateway", "aActivityType.exclusiveGateway"],
    ["startEvent", "aActivityType.startEvent"],
    ["startTimerEvent", "aActivityType.startEvent"],
    ["messageStartEvent", "aActivityType.startEvent"],
    ["noneEndEvent", "aActivityType.endEvent"],
    ["errorEndEvent", "aActivityType.endEvent"],
    ["endEvent", "aActivityType.endEvent"],
    ["boundaryError", "aActivityType.boundaryEvent"],
    ["boundaryTimer", "aActivityType.boundaryEvent"],
    ["intermediateTimer", "aActivityType.intermediateEvent"],
    ["intermediateMessageThrowEvent", "aActivityType.intermediateEvent"],
  ])("%s reads as %s", (type, key) => {
    expect(activityTypeKey(type)).toBe(key)
  })

  it("leaves a type it does not know as the engine wrote it", () => {
    expect(activityTypeKey("multiInstanceBody")).toBeNull()
    expect(activityTypeKey("")).toBeNull()
    const t = (key: string) => translator("de", key)
    expect(activityTypeLabel(t, "multiInstanceBody")).toBe("multiInstanceBody")
    expect(activityTypeLabel(t, "userTask")).toBe("User-Task")
    expect(activityTypeLabel((key) => translator("en", key), "noneEndEvent")).toBe("End event")
  })
})

describe("NamedId", () => {
  it("puts the name first and the id, in mono, quietly below with the details", () => {
    const { container } = render(
      <NamedId name="Pack" id="Task_A" detail={["User task", null, "", "Order"]} />,
    )
    expect(container.textContent).toBe("PackTask_A · User task · Order")
    expect(container.querySelector(".font-mono")?.textContent).toBe("Task_A")
  })

  it("lets the id lead in mono when no name is known, and shows no empty line", () => {
    const { container } = render(<NamedId name={null} id="order" />)
    expect(container.textContent).toBe("order")
    expect(container.querySelector(".font-mono")?.textContent).toBe("order")
    expect(container.querySelectorAll(".text-small")).toHaveLength(0)
  })
})
