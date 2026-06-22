import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import bytes from 'bytes'
import resolveFileSizeLimit from '../lib/utils/resolveFileSizeLimit.js'

describe('resolveFileSizeLimit()', () => {
  const options = {
    maxFileSize: bytes('50mb'),
    maxFileSizeByType: { image: '10mb', video: '250mb', font: bytes('2mb') }
  }
  const cases = [
    ['image/png matches the image override', 'image/png', options, bytes('10mb')],
    ['video/mp4 matches the video override', 'video/mp4', options, bytes('250mb')],
    ['font value already in bytes is passed through', 'font/woff2', options, bytes('2mb')],
    ['uncategorised type falls back to maxFileSize', 'application/pdf', options, bytes('50mb')],
    ['unknown mimetype falls back to maxFileSize', undefined, options, bytes('50mb')],
    ['no byType map uses maxFileSize', 'image/png', { maxFileSize: bytes('50mb') }, bytes('50mb')]
  ]
  for (const [name, mimetype, opts, expected] of cases) {
    it(name, () => {
      assert.equal(resolveFileSizeLimit(mimetype, opts), expected)
    })
  }
})
