import type { Context } from "hono"

import consola from "consola"
import { streamSSE, type SSEMessage } from "hono/streaming"

import { awaitApproval } from "~/lib/approval"
import { billingCycleManager } from "~/lib/billing-cycle"
import { checkRateLimit } from "~/lib/rate-limit"
import { createHeartbeatManager } from "~/lib/sse-heartbeat"
import { state } from "~/lib/state"
import { getTokenCount } from "~/lib/tokenizer"
import { isNullish } from "~/lib/utils"
import {
  createChatCompletions,
  type ChatCompletionResponse,
  type ChatCompletionsPayload,
} from "~/services/copilot/create-chat-completions"

export async function handleCompletion(c: Context) {
  const requestId = crypto.randomUUID()
  await checkRateLimit(state)

  let payload = await c.req.json<ChatCompletionsPayload>()
  consola.debug("Request payload:", JSON.stringify(payload).slice(-400))

  // Find the selected model
  const selectedModel = state.models?.data.find(
    (model) => model.id === payload.model,
  )

  // Calculate and display token count
  try {
    if (selectedModel) {
      const tokenCount = await getTokenCount(payload, selectedModel)
      consola.info("Current token count:", tokenCount)
    } else {
      consola.warn("No model selected, skipping token count calculation")
    }
  } catch (error) {
    consola.warn("Failed to calculate token count:", error)
  }

  if (state.manualApprove) await awaitApproval()

  if (isNullish(payload.max_tokens)) {
    payload = {
      ...payload,
      max_tokens: selectedModel?.capabilities.limits.max_output_tokens,
    }
    consola.debug("Set max_tokens to:", JSON.stringify(payload.max_tokens))
  }

  const response = await createChatCompletions(payload)

  if (isNonStreaming(response)) {
    consola.debug("Non-streaming response:", JSON.stringify(response))
    return c.json(response)
  }

  consola.debug("Streaming response")
  return streamSSE(c, async (stream) => {
    const heartbeatManager = createHeartbeatManager(requestId)

    try {
      heartbeatManager.start(stream, () => {
        consola.warn(`[${requestId}] Force closing connection due to timeout`)
      })

      for await (const chunk of response) {
        consola.debug("Streaming chunk:", JSON.stringify(chunk))
        await stream.writeSSE(chunk as SSEMessage)
      }
      // Mark response complete after all chunks are sent
      billingCycleManager.markResponseComplete()

      const stats = heartbeatManager.getStats()
      consola.info(
        `[${requestId}] Stream completed - ${stats.heartbeatCount} heartbeats, ${stats.duration}ms`,
      )
    } catch (error) {
      // If streaming fails, mark request as failed
      billingCycleManager.markRequestFailed()
      consola.error(`[${requestId}] Streaming error:`, error)
      throw error
    } finally {
      heartbeatManager.stop()
    }
  })
}

const isNonStreaming = (
  response: Awaited<ReturnType<typeof createChatCompletions>>,
): response is ChatCompletionResponse => Object.hasOwn(response, "choices")
