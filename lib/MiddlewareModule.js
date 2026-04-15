import { AbstractModule, App } from 'adapt-authoring-core'
import axios from 'axios'
import bodyParser from 'body-parser'
import bytes from 'bytes'
import compression from 'compression'
import { createWriteStream } from 'fs'
import formidable from 'formidable'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import helmet from 'helmet'
import { RateLimiterMongo } from 'rate-limiter-flexible'
import { unzip } from 'zipper'
import { validateUploadedFiles } from './utils/validateUploadedFiles.js'
/**
 * Adds useful Express middleware to the server stack
 * @memberof middleware
 * @extends {AbstractModule}
 */
class MiddlewareModule extends AbstractModule {
  get zipTypes () {
    return [
      'application/zip',
      'application/x-zip-compressed'
    ]
  }

  isZip (mimeType) {
    return this.zipTypes.includes(mimeType)
  }

  /** @override */
  async init () {
    const server = await this.app.waitForModule('server')
    const helmetFunc = helmet({
      xFrameOptions: false
    })
    // add custom middleware
    // server.root.addMiddleware(helmetFunc)
    server.api.addMiddleware(
      helmetFunc,
      this.rateLimiter(),
      this.bodyParserJson(),
      this.bodyParserUrlEncoded(),
      compression()
    )
    this.onReady().then(() => this.initRoutes())
  }

  /**
   * Initialises the config and lang API routers from routes.json
   * @return {Promise}
   */
  async initRoutes () {
    const [auth, server] = await this.app.waitForModule('auth', 'server')
    const { registerRoutes } = await import('adapt-authoring-server')

    server.api.addMiddleware(this.addTranslationUtils.bind(this))

    const routesFilePath = path.resolve(fileURLToPath(import.meta.url), '../../routes.json')
    const routesData = JSON.parse(await fs.readFile(routesFilePath, 'utf8'))

    for (const routerConfig of routesData.routers) {
      const routes = (routerConfig.routes || []).map(r => ({
        ...r,
        handlers: Object.fromEntries(
          Object.entries(r.handlers).map(([method, handlerStr]) => {
            if (typeof this[handlerStr] !== 'function') {
              throw new Error(`Cannot resolve route handler '${handlerStr}'`)
            }
            return [method, this[handlerStr].bind(this)]
          })
        )
      }))
      const router = server.api.createChildRouter(routerConfig.root)
      registerRoutes(router, routes, auth)
    }
  }

  /**
   * Returns public config data
   * @param {external:ExpressRequest} _req
   * @param {external:ExpressResponse} res
   */
  configRequestHandler (_req, res) {
    res.json(this.app.config.getPublicConfig())
  }

  /**
   * Returns lang strings for a specified locale
   * @param {external:ExpressRequest} req
   * @param {external:ExpressResponse} res
   * @param {Function} next
   */
  langRequestHandler (req, res, next) {
    const lang = req.params.lang || req.acceptsLanguages(this.app.lang.supportedLanguages)
    if (!lang || !this.app.lang.phrases[lang]) {
      return next(this.app.errors.UNKNOWN_LANG.setData({ lang }))
    }
    res.json(this.app.lang.phrases[lang])
  }

  /**
   * Adds translation utilities to incoming API requests
   * @param {external:ExpressRequest} req
   * @param {external:ExpressResponse} res
   * @param {Function} next
   */
  addTranslationUtils (req, res, next) {
    const lang = req.acceptsLanguages(this.app.lang.supportedLanguages)
    req.translate = (key, data) => this.app.lang.translate(lang, key, data)
    next()
  }

  /**
   * Limits how many requests indivual IPs can make
   * @return {Function} Express middleware function
   */
  async rateLimiter () {
    const mongodb = await this.app.waitForModule('mongodb')
    const { db } = await mongodb.getStats()
    const rateLimiter = new RateLimiterMongo({
      storeClient: mongodb.client,
      dbName: db,
      keyPrefix: 'ratelimiter',
      points: this.getConfig('apiRequestLimit'),
      duration: this.getConfig('apiRequestLimitDuration') / 1000
    })
    return async (req, res, next) => {
      let resetAt
      try {
        const data = await rateLimiter.consume(req.ip)
        resetAt = new Date(Date.now() + data.msBeforeNext)
        res.set({
          'Retry-After': data.msBeforeNext / 1000,
          'X-RateLimit-Limit': this.getConfig('apiRequestLimit'),
          'X-RateLimit-Remaining': data.remainingPoints,
          'X-RateLimit-Reset': resetAt
        })
        next()
      } catch (e) {
        res.sendError(this.app.errors.RATE_LIMIT_EXCEEDED.setData({ url: req.url, resetAt }))
      }
    }
  }

  /**
   * Parses incoming JSON data to req.body
   * @see https://github.com/expressjs/body-parser#bodyparserjsonoptions
   * @return {Function} Express middleware function
   */
  bodyParserJson () {
    return (req, res, next) => {
      bodyParser.json()(req, res, (error, ...args) => {
        if (error) return next(this.app.errors.BODY_PARSE_FAILED.setData({ error: error.message }))
        if (req.body === undefined) req.body = {}
        next(null, ...args)
      })
    }
  }

  /**
   * Parses incoming URL-encoded data to req.body
   * @see https://github.com/expressjs/body-parser#bodyparserurlencodedoptions
   * @return {Function} Express middleware function
   */
  bodyParserUrlEncoded () {
    return (req, res, next) => {
      bodyParser.urlencoded({ extended: true })(req, res, (error, ...args) => {
        if (error) return next(this.app.errors.BODY_PARSE_FAILED.setData({ error: error.message }))
        next(null, ...args)
      })
    }
  }

  /**
   * Sets default file upload options
   * @param {object} options The initial options object
   * @returns {FileUploadOptions}
   */
  setDefaultFileOptions (options = {}) {
    Object.entries({
      maxFileSize: this.getConfig('fileUploadMaxFileSize'),
      multiples: true,
      uploadDir: this.getConfig('uploadTempDir'),
      promisify: false,
      unzip: false,
      removeZipSource: true
    }).forEach(([k, v]) => {
      if (k === 'expectedFileTypes' && !Array.isArray(v)) v = [v]
      if (!Object.prototype.hasOwnProperty.call(options, k)) options[k] = v
    })
  }

  /**
   * Handles incoming file uploads
   * @param {Array<String>} expectedFileTypes List of file types to accept
   * @param {FileUploadOptions} options
   * @return {Function} The Express handler
   */
  fileUploadParser (expectedFileTypes, options = {}) {
    options.expectedFileTypes = expectedFileTypes
    return (req, res, next) => {
      // Below is wrapped in a promise so other code can use the Promise interface rather than a standard callback
      return new Promise(async (resolve, reject) => { // eslint-disable-line no-async-promise-executor
        const middleware = await App.instance.waitForModule('middleware')
        middleware.setDefaultFileOptions(options)

        if (options.promisify) {
          next = e => e ? reject(e) : resolve()
        }
        if (!req.headers['content-type']?.startsWith('multipart/form-data')) {
          return next()
        }
        try {
          await fs.mkdir(options.uploadDir, { recursive: true })
        } catch (e) {
          if (e.code !== 'EEXIST') return next(e)
        }
        formidable(options).parse(req, async (error, fields, files) => {
          if (error) {
            if (error.code === 1009) {
              const [maxSize, size] = error.message.match(/(\d+) bytes/g).map(s => bytes(Number(s.replace(' bytes', ''))))
              error = App.instance.errors.FILE_EXCEEDS_MAX_SIZE.setData({ maxSize, size })
            }
            return next(error)
          }
          // covert fields back from arrays and add to body
          Object.keys(fields).forEach(k => {
            let val = fields[k][0]
            try { val = JSON.parse(val) } catch (e) {}
            req.body[k] = val
          })
          if (Object.keys(files).length === 0) { // no files uploaded
            return next()
          }
          try {
            await validateUploadedFiles(req, files, options)
          } catch (e) {
            return next(e)
          }
          if (options.unzip) {
            await Promise.all(Object.entries(files).map(async ([k, [f]]) => {
              if (!middleware.isZip(f.mimetype)) {
                return Promise.resolve()
              }
              f.mimetype = 'application/zip' // always set to the same value for easier checking elsewhere
              f.filepath = await unzip(f.filepath, `${f.filepath}_unzip`, { removeSource: options.removeZipSource || true })
            }))
          }
          Object.assign(req, { fileUpload: { files } })
          next()
        })
      })
    }
  }

  /**
   * Handles incoming file uploads via URL
   * @param {Array<String>} expectedFileTypes List of file types to accept
   * @param {FileUploadOptions} options
   * @return {Function} The Express handler
   */
  urlUploadParser (expectedFileTypes, options) {
    options.expectedFileTypes = expectedFileTypes
    return (req, res, next) => {
      // Below is wrapped in a promise so other code can use the Promise interface rather than a standard callback
      return new Promise(async (resolve, reject) => { // eslint-disable-line no-async-promise-executor
        const middleware = await App.instance.waitForModule('middleware')
        middleware.setDefaultFileOptions(options)

        if (options.promisify) {
          next = e => e ? reject(e) : resolve()
        }
        if (!req.body.url) {
          return next()
        }
        let responseData
        try {
          responseData = (await axios.get(req.body.url, { responseType: 'stream' })).data
        } catch (e) {
          if (e.code === 'ERR_INVALID_URL' || e.response.status === 404) {
            return next(this.app.errors.INVALID_ASSET_URL.setData({ url: req.body.url }))
          }
          return next(e)
        }
        const contentType = responseData.headers['content-type']
        const subtype = contentType.split('/')[1]
        const fileName = `${new Date().getTime()}.${subtype}`
        const uploadPath = path.resolve(options.uploadDir, fileName)
        // set up file data to mimic formidable
        const fileData = {
          fields: req.apiData.data,
          files: {
            file: [{
              filepath: uploadPath,
              originalFilename: fileName,
              newFilename: fileName,
              mimetype: contentType,
              size: Number(responseData.headers['content-length'])
            }]
          }
        }
        let fileStream
        try {
          validateUploadedFiles(req, fileData.files, options)
          await fs.mkdir(options.uploadDir, { recursive: true })
          fileStream = createWriteStream(uploadPath)
        } catch (e) {
          if (e.code !== 'EEXIST') return next(e)
        }
        responseData.pipe(fileStream).on('close', async () => {
          req.fileUpload = fileData
          if (subtype === 'zip' && options.unzip) {
            req.fileUpload.files.course.filepath = await unzip(uploadPath, `${uploadPath}_unzip`, { removeSource: options.removeSource })
          }
          next()
        }).on('error', next)
      })
    }
  }
}

export default MiddlewareModule
