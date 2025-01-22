import { AbstractModule, App } from 'adapt-authoring-core'
import axios from 'axios'
import bodyParser from 'body-parser'
import bytes from 'bytes'
import compression from 'compression'
import { createWriteStream } from 'fs'
import { fileTypeFromFile } from 'file-type'
import formidable from 'formidable'
import fs from 'fs/promises'
import path from 'path'
import helmet from 'helmet'
import { RateLimiterMongo } from 'rate-limiter-flexible'
import { unzip } from 'zipper'
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
    // add custom middleware
    server.api.addMiddleware(
      helmet(),
      this.rateLimiter(),
      this.bodyParserJson(),
      this.bodyParserUrlEncoded(),
      compression()
    )
  }

  /**
   * Limits how many requests indivual IPs can make 
   * @return {Function} Express middleware function
   */
  async rateLimiter () {
    const [mongodb, server] = await this.app.waitForModule('mongodb', 'server')
    const { db } = await mongodb.getStats()
    const rateLimiter = new RateLimiterMongo({
      storeClient: mongodb.client,
      dbName: db,
      keyPrefix: 'ratelimiter',
      points: this.getConfig('apiRequestLimit'),
      duration: this.getConfig('apiRequestLimitDuration') / 1000
    })
    
    server.api.addMiddleware(this.middleware())

    return async (req, res, next) => {
      try {
        const data = await rateLimiter.consume(req.ip)
        const resetAt = new Date(Date.now() + data.msBeforeNext)
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
      return new Promise(async (resolve, reject) => {
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
      return new Promise(async (resolve, reject) => {
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
/** @ignore */
async function validateUploadedFiles (req, filesObj, options) {
  const errors = App.instance.errors
  const assetErrors = []
  const filesArr = Object.values(filesObj).reduce((memo, f) => memo.concat(f), []) // flatten nested arrays
  await Promise.all(filesArr.map(async f => {
    if (!options.expectedFileTypes.includes(f.mimetype)) {
      // formidable mimetype isn't allowed, try inspecting the file
      f.mimetype = (await fileTypeFromFile(f.filepath))?.mime
      if (!options.expectedFileTypes.includes(f.mimetype)) {
        assetErrors.push(errors.UNEXPECTED_FILE_TYPES.setData({ expectedFileTypes: options.expectedFileTypes, invalidFiles: [f.originalFilename] }))
      }
    }
    if (!f.size > options.maxFileSize) {
      assetErrors.push(errors.FILE_EXCEEDS_MAX_SIZE.setData({ size: bytes(f.size), maxSize: bytes(options.maxFileSize) }))
    }
  }))
  if (assetErrors.length) {
    throw errors.VALIDATION_FAILED
      .setData({ schemaName: 'fileupload', errors: assetErrors.map(req.translate).join(', ') })
  }
}

export default MiddlewareModule
