type Handler<T> = (event: T) => void | Promise<void>

interface Subscription {
  unsubscribe(): void
}

export function createBus<
  TEvents extends Record<string, any>
>(): {
  publish<K extends keyof TEvents>(type: K, data: TEvents[K]): void
  subscribe<K extends keyof TEvents>(
    type: K,
    handler: Handler<TEvents[K]>
  ): Subscription
} {
  const handlers = new Map<keyof TEvents, Set<Handler<any>>>()

  return {
    publish(type, data) {
      const set = handlers.get(type)
      if (!set) return
      for (const handler of set) {
        try {
          handler(data)
        } catch {
          // Don't let subscriber errors crash the publisher
        }
      }
    },

    subscribe(type, handler) {
      if (!handlers.has(type)) {
        handlers.set(type, new Set())
      }
      const set = handlers.get(type)!
      set.add(handler)

      return {
        unsubscribe() {
          set.delete(handler)
        },
      }
    },
  }
}

// OpenReview event types
export type ReviewEvents = {
  "review.started": { agents: string[] }
  "agent.started": { name: string }
  "agent.completed": {
    name: string
    issueCount: number
    time: number
  }
  "agent.failed": { name: string; error: string }
  "review.completed": { issueCount: number; time: number }
}

export const bus = createBus<ReviewEvents>()
