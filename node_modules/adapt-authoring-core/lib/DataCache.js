import App from './App.js'
/**
 * Time-limited data cache
 * @memberof core
 */
class DataCache {
  /**
   * @param {Object} options
   * @param {Boolean} options.enable Whether the cache is enabled
   * @param {Number} options.lifespan Cache entry lifespan in milliseconds
   */
  constructor ({ enable, lifespan }) {
    this.isEnabled = enable === true
    this.lifespan = lifespan
    this.cache = {}
  }

  /**
   * Retrieve cached data, or run fresh query if no cache exists or cache is invalid
   * @param {Object} query
   * @param {Object} options
   * @param {Object} mongoOptions
   * @returns {*} The cached data
   */
  async get (query, options, mongoOptions) {
    const key = JSON.stringify(query) + JSON.stringify(options) + JSON.stringify(mongoOptions)
    this.prune()
    if (this.isEnabled && this.cache[key]) {
      return this.cache[key].data
    }
    const mongodb = await App.instance.waitForModule('mongodb')
    const data = await mongodb.find(options.collectionName, query, mongoOptions)
    this.cache[key] = { data, timestamp: Date.now() }
    return data
  }

  /**
   * Removes invalid cache data
   */
  prune () {
    Object.keys(this.cache).forEach(k => {
      if (Date.now() > (this.cache[k].timestamp + this.lifespan)) {
        delete this.cache[k]
      }
    })
  }
}

export default DataCache
