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
      }
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
})
