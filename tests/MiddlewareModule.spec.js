import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import MiddlewareModule from '../lib/MiddlewareModule.js'

/**
 * MiddlewareModule extends AbstractModule which requires App.instance.
 * We test zipTypes, isZip, setDefaultFileOptions, bodyParserJson,
 * and bodyParserUrlEncoded logic in isolation.
 */

function createInstance () {
  const mockApp = {
    waitForModule: mock.fn(async () => {}),
    errors: {
      BODY_PARSE_FAILED: {
        setData: mock.fn(function () { return this })
      },
      UNKNOWN_LANG: {
        setData: mock.fn(function () { return this })
      }
    },
    config: {
      getPublicConfig: mock.fn(() => ({ 'some.key': 'value' }))
    },
    lang: {
      phrases: { en: { hello: 'Hello' }, fr: { hello: 'Bonjour' } },
      supportedLanguages: ['en', 'fr'],
      translate: mock.fn((lang, key) => key)
    },
    dependencyloader: {
      moduleLoadedHook: { tap: () => {}, untap: () => {} }
    }
  }

  const originalInit = MiddlewareModule.prototype.init
  MiddlewareModule.prototype.init = async function () {}

  const instance = new MiddlewareModule(mockApp, { name: 'adapt-authoring-middleware' })

  MiddlewareModule.prototype.init = originalInit

  instance.getConfig = mock.fn((key) => {
    const defaults = {
      fileUploadMaxFileSize: 52428800,
      uploadTempDir: '/tmp/uploads',
      apiRequestLimit: 100,
      apiRequestLimitDuration: 60000
    }
    return defaults[key]
  })

  return { instance, mockApp }
}

describe('MiddlewareModule', () => {
  describe('#zipTypes', () => {
    it('should return array of zip MIME types', () => {
      const { instance } = createInstance()
      assert.ok(Array.isArray(instance.zipTypes))
      assert.ok(instance.zipTypes.includes('application/zip'))
      assert.ok(instance.zipTypes.includes('application/x-zip-compressed'))
    })
  })

  describe('#isZip()', () => {
    it('should return true for application/zip', () => {
      const { instance } = createInstance()
      assert.equal(instance.isZip('application/zip'), true)
    })

    it('should return true for application/x-zip-compressed', () => {
      const { instance } = createInstance()
      assert.equal(instance.isZip('application/x-zip-compressed'), true)
    })

    it('should return false for non-zip types', () => {
      const { instance } = createInstance()
      assert.equal(instance.isZip('application/json'), false)
    })

    it('should return false for undefined', () => {
      const { instance } = createInstance()
      assert.equal(instance.isZip(undefined), false)
    })
  })

  describe('#setDefaultFileOptions()', () => {
    it('should set default options when none provided', () => {
      const { instance } = createInstance()
      const options = {}
      instance.setDefaultFileOptions(options)
      assert.equal(options.maxFileSize, 52428800)
      assert.equal(options.multiples, true)
      assert.equal(options.uploadDir, '/tmp/uploads')
      assert.equal(options.promisify, false)
      assert.equal(options.unzip, false)
      assert.equal(options.removeZipSource, true)
    })

    it('should not override existing options', () => {
      const { instance } = createInstance()
      const options = { maxFileSize: 1024, promisify: true }
      instance.setDefaultFileOptions(options)
      assert.equal(options.maxFileSize, 1024)
      assert.equal(options.promisify, true)
    })

    it('should handle empty call', () => {
      const { instance } = createInstance()
      const options = instance.setDefaultFileOptions()
      assert.equal(options, undefined)
    })
  })

  describe('#bodyParserJson()', () => {
    it('should return a function', () => {
      const { instance } = createInstance()
      const middleware = instance.bodyParserJson()
      assert.equal(typeof middleware, 'function')
    })
  })

  describe('#bodyParserUrlEncoded()', () => {
    it('should return a function', () => {
      const { instance } = createInstance()
      const middleware = instance.bodyParserUrlEncoded()
      assert.equal(typeof middleware, 'function')
    })
  })

  describe('#fileUploadParser()', () => {
    it('should return a function', () => {
      const { instance } = createInstance()
      const parser = instance.fileUploadParser(['image/png'])
      assert.equal(typeof parser, 'function')
    })
  })

  describe('#urlUploadParser()', () => {
    it('should return a function', () => {
      const { instance } = createInstance()
      const parser = instance.urlUploadParser(['image/png'], {})
      assert.equal(typeof parser, 'function')
    })
  })

  describe('#configRequestHandler()', () => {
    it('should respond with public config data', () => {
      const { instance } = createInstance()
      const res = { json: mock.fn() }
      instance.configRequestHandler({}, res)
      assert.equal(res.json.mock.calls.length, 1)
      assert.deepEqual(res.json.mock.calls[0].arguments[0], { 'some.key': 'value' })
    })
  })

  describe('#langRequestHandler()', () => {
    it('should respond with phrases for the specified lang param', () => {
      const { instance } = createInstance()
      const req = { params: { lang: 'en' }, acceptsLanguages: mock.fn() }
      const res = { json: mock.fn() }
      instance.langRequestHandler(req, res, () => {})
      assert.equal(res.json.mock.calls.length, 1)
      assert.deepEqual(res.json.mock.calls[0].arguments[0], { hello: 'Hello' })
    })

    it('should fall back to Accept-Language header when no param given', () => {
      const { instance } = createInstance()
      const req = { params: {}, acceptsLanguages: mock.fn(() => 'fr') }
      const res = { json: mock.fn() }
      instance.langRequestHandler(req, res, () => {})
      assert.equal(res.json.mock.calls.length, 1)
      assert.deepEqual(res.json.mock.calls[0].arguments[0], { hello: 'Bonjour' })
    })

    it('should call next with UNKNOWN_LANG error for unknown lang', () => {
      const { instance } = createInstance()
      const req = { params: { lang: 'de' }, acceptsLanguages: mock.fn() }
      const res = { json: mock.fn() }
      const next = mock.fn()
      instance.langRequestHandler(req, res, next)
      assert.equal(next.mock.calls.length, 1)
      assert.equal(res.json.mock.calls.length, 0)
    })
  })

  describe('#addTranslationUtils()', () => {
    it('should add translate function to req and call next', () => {
      const { instance } = createInstance()
      const req = { acceptsLanguages: mock.fn(() => 'en') }
      const res = {}
      const next = mock.fn()
      instance.addTranslationUtils(req, res, next)
      assert.equal(typeof req.translate, 'function')
      assert.equal(next.mock.calls.length, 1)
    })
  })
})
