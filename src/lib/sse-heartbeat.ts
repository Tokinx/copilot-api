import consola from "consola"

/**
 * SSE 心跳配置
 */
export interface SSEHeartbeatConfig {
  /** 心跳间隔 (毫秒) */
  interval: number
  /** 是否启用心跳 */
  enabled: boolean
  /** 最大连接时长 (毫秒), 0 表示无限制 */
  maxConnectionDuration: number
}

/**
 * 默认 SSE 心跳配置
 */
export const DEFAULT_HEARTBEAT_CONFIG: SSEHeartbeatConfig = {
  interval: Number(process.env.SSE_HEARTBEAT_INTERVAL) || 2000, // 默认 2 秒
  enabled: process.env.SSE_HEARTBEAT_ENABLED !== "false", // 默认启用
  maxConnectionDuration:
    Number(process.env.SSE_MAX_CONNECTION_DURATION) || 600000, // 默认 10 分钟
}

/**
 * SSE 心跳管理器
 * 用于在 SSE 流式响应中保持连接活跃
 */
export class SSEHeartbeatManager {
  private timer?: Timer
  private heartbeatCount = 0
  private startTime = 0
  private readonly config: SSEHeartbeatConfig
  private readonly requestId: string

  constructor(requestId: string, config: Partial<SSEHeartbeatConfig> = {}) {
    this.requestId = requestId
    this.config = { ...DEFAULT_HEARTBEAT_CONFIG, ...config }
  }

  /**
   * 启动心跳定时器
   * @param stream SSE 流对象
   * @param onMaxDuration 达到最大连接时长时的回调
   */
  start(
    stream: { write: (data: string) => Promise<unknown> },
    onMaxDuration?: () => void,
  ): void {
    if (!this.config.enabled) {
      consola.debug(`[${this.requestId}] SSE heartbeat is disabled, skipping`)
      return
    }

    this.startTime = Date.now()
    this.heartbeatCount = 0

    consola.debug(
      `[${this.requestId}] Starting SSE heartbeat with interval: ${this.config.interval}ms`,
    )

    this.timer = setInterval(async () => {
      try {
        this.heartbeatCount++
        await stream.write(": heartbeat\n\n")

        consola.debug(
          `[${this.requestId}] Sent heartbeat #${this.heartbeatCount}`,
        )

        // 检查是否超过最大连接时长
        if (
          this.config.maxConnectionDuration > 0
          && Date.now() - this.startTime > this.config.maxConnectionDuration
        ) {
          consola.warn(
            `[${this.requestId}] Connection exceeded max duration (${this.config.maxConnectionDuration}ms), closing`,
          )
          this.stop()
          onMaxDuration?.()
        }
      } catch (error) {
        consola.warn(
          `[${this.requestId}] Failed to send heartbeat #${this.heartbeatCount}:`,
          error,
        )
      }
    }, this.config.interval)
  }

  /**
   * 停止心跳定时器
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined

      const duration = Date.now() - this.startTime
      consola.debug(
        `[${this.requestId}] Stopped SSE heartbeat after ${this.heartbeatCount} beats (${duration}ms)`,
      )
    }
  }

  /**
   * 获取心跳统计信息
   */
  getStats() {
    return {
      heartbeatCount: this.heartbeatCount,
      duration: Date.now() - this.startTime,
      config: this.config,
    }
  }
}

/**
 * 创建 SSE 心跳管理器
 * @param requestId 请求 ID
 * @param config 自定义配置
 */
export function createHeartbeatManager(
  requestId: string,
  config?: Partial<SSEHeartbeatConfig>,
): SSEHeartbeatManager {
  return new SSEHeartbeatManager(requestId, config)
}
