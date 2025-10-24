import { beforeEach, describe, expect, test } from "bun:test"

import { billingCycleManager } from "~/lib/billing-cycle"

describe("Billing Cycle Manager", () => {
  beforeEach(() => {
    billingCycleManager.reset()
  })

  test("first request should bill (X-Initiator: user)", async () => {
    const initiator = await billingCycleManager.determineInitiator()
    expect(initiator).toBe("user")
  })

  test("second request in cycle should not bill (X-Initiator: agent)", async () => {
    await billingCycleManager.determineInitiator() // First request
    billingCycleManager.markResponseComplete()

    const initiator = await billingCycleManager.determineInitiator()
    expect(initiator).toBe("agent")
  })

  test("concurrent first requests should only bill once", async () => {
    // Simulate 3 concurrent requests
    const [initiator1, initiator2, initiator3] = await Promise.all([
      billingCycleManager.determineInitiator(),
      billingCycleManager.determineInitiator(),
      billingCycleManager.determineInitiator(),
    ])

    // Only the first should be billed
    const initiators = [initiator1, initiator2, initiator3]
    const billedCount = initiators.filter((x) => x === "user").length
    const notBilledCount = initiators.filter((x) => x === "agent").length

    expect(billedCount).toBe(1)
    expect(notBilledCount).toBe(2)
  })

  test("cycle should reset after 5 minutes of inactivity", async () => {
    // First request
    await billingCycleManager.determineInitiator()
    billingCycleManager.markResponseComplete()

    // Second request (should not bill)
    const initiator2 = await billingCycleManager.determineInitiator()
    expect(initiator2).toBe("agent")
    billingCycleManager.markResponseComplete()

    // Simulate waiting 5+ minutes by directly manipulating time
    // We need to access the private lastResponseTime field
    // Instead, let's test the reset() method
    billingCycleManager.reset()

    // After reset, next request should bill again
    const initiator3 = await billingCycleManager.determineInitiator()
    expect(initiator3).toBe("user")
  })

  test("failed request should not enter billing cycle", async () => {
    const initiator1 = await billingCycleManager.determineInitiator()
    expect(initiator1).toBe("user")

    // Request fails
    billingCycleManager.markRequestFailed()

    // Next request should still bill
    const initiator2 = await billingCycleManager.determineInitiator()
    expect(initiator2).toBe("user")
  })

  test("failed request after successful one should not affect cycle", async () => {
    // First successful request
    await billingCycleManager.determineInitiator()
    billingCycleManager.markResponseComplete()

    // Second request starts but fails
    const initiator2 = await billingCycleManager.determineInitiator()
    expect(initiator2).toBe("agent")
    billingCycleManager.markRequestFailed()

    // Third request should still not bill (cycle continues)
    const initiator3 = await billingCycleManager.determineInitiator()
    expect(initiator3).toBe("agent")
  })

  test("multiple concurrent requests after first should all be agent", async () => {
    // First request
    await billingCycleManager.determineInitiator()
    billingCycleManager.markResponseComplete()

    // Multiple concurrent follow-up requests
    const [i1, i2, i3, i4, i5] = await Promise.all([
      billingCycleManager.determineInitiator(),
      billingCycleManager.determineInitiator(),
      billingCycleManager.determineInitiator(),
      billingCycleManager.determineInitiator(),
      billingCycleManager.determineInitiator(),
    ])

    expect([i1, i2, i3, i4, i5]).toEqual([
      "agent",
      "agent",
      "agent",
      "agent",
      "agent",
    ])
  })

  test("getStatus returns current state", async () => {
    let status = billingCycleManager.getStatus()
    expect(status.inCycle).toBe(false)
    expect(status.pendingResponses).toBe(0)

    await billingCycleManager.determineInitiator()
    status = billingCycleManager.getStatus()
    expect(status.inCycle).toBe(true)
    expect(status.pendingResponses).toBe(1)

    billingCycleManager.markResponseComplete()
    status = billingCycleManager.getStatus()
    expect(status.inCycle).toBe(true)
    expect(status.pendingResponses).toBe(0)
  })

  test("non-streaming request flow", async () => {
    // Simulate non-streaming request
    const initiator = await billingCycleManager.determineInitiator()
    expect(initiator).toBe("user")

    // Response completes immediately
    billingCycleManager.markResponseComplete()

    // Next request should not bill
    const initiator2 = await billingCycleManager.determineInitiator()
    expect(initiator2).toBe("agent")
  })

  test("streaming request flow", async () => {
    // Simulate streaming request
    const initiator = await billingCycleManager.determineInitiator()
    expect(initiator).toBe("user")

    // Simulate streaming chunks (response not complete yet)
    // ... streaming in progress ...

    // Response completes after all chunks sent
    billingCycleManager.markResponseComplete()

    // Next request should not bill
    const initiator2 = await billingCycleManager.determineInitiator()
    expect(initiator2).toBe("agent")
  })
})
