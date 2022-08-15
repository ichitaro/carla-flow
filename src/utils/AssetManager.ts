import pLimit from 'p-limit'
import { TypedEvent } from './TypedEvent'

export type Progress = {
  key: string
  count: number
  total: number
}

export type Fetcher = (key: string) => Promise<any>

export default class AssetManager {
  private _cache = new Map<string, any>()
  private _queue = new Map<string, Fetcher>()

  events = {
    progress: new TypedEvent<Progress>(),
  }

  queue(key: string, fetch: Fetcher) {
    if (!this._queue.has(key)) {
      this._queue.set(key, fetch)
    }
    return key
  }

  loadQueued(concurrency: number = 8) {
    const limit = pLimit(concurrency)
    const commands = Array.from(this._queue.entries())
    const total = this._queue.size
    this._queue.clear()

    let count = 0
    const promises = commands.map(([key, fetch]) => {
      return limit(() => {
        return fetch(key)
          .then((result) => {
            this._cache.set(key, result)
            return [key, result] as const
          })
          .catch((error) => {
            console.error(`Asset ${key} was not loaded:`)
            console.error(error)
            return [key, error] as const
          })
          .finally(() => {
            count += 1
            this.events.progress.emit({ key, count, total })
          })
      })
    })
    return Promise.allSettled(promises)
  }

  get<T>(key: string): T {
    return this._cache.get(key)
  }
}
