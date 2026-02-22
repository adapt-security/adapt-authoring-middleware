import { describe, it, mock, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import App from 'adapt-authoring-core/lib/App.js'

mock.getter(App, 'instance', () => ({
  errors: {
    UNEXPECTED_FILE_TYPES: {
      setData (data) {
        const e = new Error('UNEXPECTED_FILE_TYPES')
        e.code = 'UNEXPECTED_FILE_TYPES'
        e.data = data
        return e
      }
    },
    FILE_EXCEEDS_MAX_SIZE: {
      setData (data) {
        const e = new Error('FILE_EXCEEDS_MAX_SIZE')
        e.code = 'FILE_EXCEEDS_MAX_SIZE'
        e.data = data
        return e
      }
    },
    VALIDATION_FAILED: {
      setData (data) {
        const e = new Error('VALIDATION_FAILED')
        e.code = 'VALIDATION_FAILED'
        e.data = data
        return e
      }
    }
  }
}))

const { validateUploadedFiles } = await import('../lib/utils/validateUploadedFiles.js')

describe('validateUploadedFiles()', () => {
  const makeReq = () => ({ translate: (e) => e.message || String(e) })
  let tmpDir

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'middleware-test-'))
    // Create test files
    await fs.writeFile(path.join(tmpDir, 'test.txt'), 'hello world')
    await fs.writeFile(path.join(tmpDir, 'subtitle.srt'), '1\n00:00:00,000 --> 00:00:01,000\nHello')
  })

  after(async () => {
    await fs.rm(tmpDir, { recursive: true })
  })

  it('should pass when file matches expected type', async () => {
    const req = makeReq()
    const files = { file: [{ mimetype: 'image/png', originalFilename: 'test.png', size: 100, filepath: path.join(tmpDir, 'test.txt') }] }
    const options = { expectedFileTypes: ['image/png'], maxFileSize: 1000 }
    await assert.doesNotReject(() => validateUploadedFiles(req, files, options))
  })

  it('should pass with multiple files all matching expected types', async () => {
    const req = makeReq()
    const files = {
      file1: [{ mimetype: 'image/png', originalFilename: 'a.png', size: 100, filepath: path.join(tmpDir, 'test.txt') }],
      file2: [{ mimetype: 'image/jpeg', originalFilename: 'b.jpg', size: 200, filepath: path.join(tmpDir, 'test.txt') }]
    }
    const options = { expectedFileTypes: ['image/png', 'image/jpeg'], maxFileSize: 1000 }
    await assert.doesNotReject(() => validateUploadedFiles(req, files, options))
  })

  it('should throw VALIDATION_FAILED when file exceeds max size', async () => {
    const req = makeReq()
    const files = { file: [{ mimetype: 'image/png', originalFilename: 'big.png', size: 5000, filepath: path.join(tmpDir, 'test.txt') }] }
    const options = { expectedFileTypes: ['image/png'], maxFileSize: 1000 }
    await assert.rejects(
      () => validateUploadedFiles(req, files, options),
      (err) => err.code === 'VALIDATION_FAILED'
    )
  })

  it('should throw VALIDATION_FAILED for unexpected file type', async () => {
    // fileTypeFromFile returns null for plain text files, so mimetype stays unmatched
    const req = makeReq()
    const files = { file: [{ mimetype: 'text/plain', originalFilename: 'test.txt', size: 100, filepath: path.join(tmpDir, 'test.txt') }] }
    const options = { expectedFileTypes: ['image/png'], maxFileSize: 1000 }
    await assert.rejects(
      () => validateUploadedFiles(req, files, options),
      (err) => err.code === 'VALIDATION_FAILED'
    )
  })

  it('should treat .srt files as application/x-subrip when file inspection returns null', async () => {
    const req = makeReq()
    const files = { file: [{ mimetype: 'text/plain', originalFilename: 'subtitle.srt', size: 100, filepath: path.join(tmpDir, 'subtitle.srt') }] }
    const options = { expectedFileTypes: ['application/x-subrip'], maxFileSize: 1000 }
    await assert.doesNotReject(() => validateUploadedFiles(req, files, options))
  })

  it('should handle empty files object', async () => {
    const req = makeReq()
    const files = {}
    const options = { expectedFileTypes: ['image/png'], maxFileSize: 1000 }
    await assert.doesNotReject(() => validateUploadedFiles(req, files, options))
  })

  it('should flatten nested file arrays', async () => {
    const req = makeReq()
    const files = {
      images: [
        { mimetype: 'image/png', originalFilename: 'a.png', size: 100, filepath: path.join(tmpDir, 'test.txt') },
        { mimetype: 'image/png', originalFilename: 'b.png', size: 200, filepath: path.join(tmpDir, 'test.txt') }
      ]
    }
    const options = { expectedFileTypes: ['image/png'], maxFileSize: 1000 }
    await assert.doesNotReject(() => validateUploadedFiles(req, files, options))
  })

  it('should include both type and size errors in VALIDATION_FAILED', async () => {
    const req = makeReq()
    const files = { file: [{ mimetype: 'text/plain', originalFilename: 'test.txt', size: 5000, filepath: path.join(tmpDir, 'test.txt') }] }
    const options = { expectedFileTypes: ['image/png'], maxFileSize: 1000 }
    await assert.rejects(
      () => validateUploadedFiles(req, files, options),
      (err) => {
        return err.code === 'VALIDATION_FAILED' && err.data.schemaName === 'fileupload'
      }
    )
  })

  it('should pass when file size equals max size', async () => {
    const req = makeReq()
    const files = { file: [{ mimetype: 'image/png', originalFilename: 'exact.png', size: 1000, filepath: path.join(tmpDir, 'test.txt') }] }
    const options = { expectedFileTypes: ['image/png'], maxFileSize: 1000 }
    await assert.doesNotReject(() => validateUploadedFiles(req, files, options))
  })

  it('should fail when file size is one byte over max', async () => {
    const req = makeReq()
    const files = { file: [{ mimetype: 'image/png', originalFilename: 'over.png', size: 1001, filepath: path.join(tmpDir, 'test.txt') }] }
    const options = { expectedFileTypes: ['image/png'], maxFileSize: 1000 }
    await assert.rejects(
      () => validateUploadedFiles(req, files, options),
      (err) => err.code === 'VALIDATION_FAILED'
    )
  })
})
