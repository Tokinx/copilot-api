/**
 * Billing Cycle Manager
 *
 * Manages billing cycles to ensure only the first request in a cycle is billed.
 *
 * Rules:
 * - First request in cycle: X-Initiator = user (billed)
 * - Subsequent requests: X-Initiator = agent (not billed)
 * - Cycle resets after 5 minutes of inactivity (no requests after last response)
 * - Concurrent first requests: only ONE is billed
 * - Failed requests: do not enter cycle, no billing
 */

const CYCLE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

class BillingCycleManager {
  private inCycle: boolean = false
  private lastResponseTime: number = 0
  private pendingResponses: number = 0
  private lock: Promise<void> = Promise.resolve()

  /**
   * Determines whether the current request should be billed.
   * Thread-safe: handles concurrent requests correctly.
   *
   * @returns 'user' if request should be billed, 'agent' if not
   */
  async determineInitiator(): Promise<"user" | "agent"> {
    // Acquire lock for thread-safety
    await this.acquireLock()

    try {
      const now = Date.now()

      // Check if cycle has timed out (5 minutes since last response)
      if (
        this.inCycle
        && this.pendingResponses === 0
        && now - this.lastResponseTime > CYCLE_TIMEOUT_MS
      ) {
        this.inCycle = false
      }

      // Determine billing
      if (!this.inCycle) {
        // First request in new cycle - bill it
        this.inCycle = true
        this.pendingResponses++
        return "user"
      }

      // Already in cycle - don't bill
      this.pendingResponses++
      return "agent"
    } finally {
      this.releaseLock()
    }
  }

  /**
   * Mark a response as complete (for both streaming and non-streaming).
   * Updates the last response timestamp.
   */
  markResponseComplete(): void {
    this.lastResponseTime = Date.now()
    this.pendingResponses = Math.max(0, this.pendingResponses - 1)
  }

  /**
   * Mark a request as failed.
   * Failed requests do not contribute to the billing cycle.
   */
  markRequestFailed(): void {
    this.pendingResponses = Math.max(0, this.pendingResponses - 1)

    // If this was the first request and it failed, exit the cycle
    if (this.pendingResponses === 0 && this.lastResponseTime === 0) {
      this.inCycle = false
    }
  }

  /**
   * Get current cycle status (for debugging/monitoring)
   */
  getStatus(): {
    inCycle: boolean
    lastResponseTime: number
    pendingResponses: number
  } {
    return {
      inCycle: this.inCycle,
      lastResponseTime: this.lastResponseTime,
      pendingResponses: this.pendingResponses,
    }
  }

  /**
   * Reset the billing cycle (for testing purposes)
   */
  reset(): void {
    this.inCycle = false
    this.lastResponseTime = 0
    this.pendingResponses = 0
  }

  // Simple async lock implementation
  private async acquireLock(): Promise<void> {
    const currentLock = this.lock
    let releaseLock!: () => void
    this.lock = new Promise((resolve) => {
      releaseLock = resolve
    })
    await currentLock
    this.releaseLock = releaseLock
  }

  private releaseLock: () => void = () => {}
}

// Singleton instance
export const billingCycleManager = new BillingCycleManager()
