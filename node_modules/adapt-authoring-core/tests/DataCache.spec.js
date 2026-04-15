import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import DataCache from '../lib/DataCache.js'

describe('DataCache', () => {
  describe('#prune()', () => {
    it('should remove expired entries from the cache', () => {
      const instance = Object.create(DataCache.prototype)
      instance.lifespan = 100
      instance.cache = {
        expired: { data: [1], timestamp: Date.now() - 200 },
        valid: { data: [2], timestamp: Date.now() }
      }
      instance.prune()
      assert.equal(instance.cache.expired, undefined)
      assert.ok(instance.cache.valid)
    })

    it('should keep entries that have not expired', () => {
      const instance = Object.create(DataCache.prototype)
      instance.lifespan = 10000
      instance.cache = {
        a: { data: [1], timestamp: Date.now() },
        b: { data: [2], timestamp: Date.now() }
      }
      instance.prune()
      assert.ok(instance.cache.a)
      assert.ok(instance.cache.b)
    })

    it('should handle an empty cache', () => {
      const instance = Object.create(DataCache.prototype)
      instance.lifespan = 100
      instance.cache = {}
      instance.prune()
      assert.deepEqual(instance.cache, {})
    })
  })
})
