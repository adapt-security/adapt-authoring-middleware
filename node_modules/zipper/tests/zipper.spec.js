import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, cpSync, rmSync, readFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { zip, unzip } from '../lib/zipper.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtureDir = join(__dirname, 'data', 'sample-dir')
const fixtureZip = join(__dirname, 'data', 'sample-dir.zip')

describe('zipper', () => {
  let tmpDir

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'zipper-test-'))
  })

  after(() => {
    rmSync(tmpDir, { recursive: true })
  })

  describe('#zip()', () => {
    it('should return the output zip path', async () => {
      const outZip = join(tmpDir, 'output.zip')
      const result = await zip(fixtureDir, outZip)
      assert.equal(result, outZip)
    })

    it('should create a zip file at the specified output path', async () => {
      const outZip = join(tmpDir, 'explicit.zip')
      await zip(fixtureDir, outZip)
      assert.equal(existsSync(outZip), true)
    })

    it('should default output path to <inputDir>.zip when no outputDir is given', async () => {
      const srcCopy = join(tmpDir, 'default-out')
      cpSync(fixtureDir, srcCopy, { recursive: true })
      const result = await zip(srcCopy)
      assert.equal(result, `${srcCopy}.zip`)
      assert.equal(existsSync(`${srcCopy}.zip`), true)
    })

    it('should include all files from the source directory', async () => {
      const outZip = join(tmpDir, 'all-files.zip')
      await zip(fixtureDir, outZip)
      const unzipDir = join(tmpDir, 'all-files-out')
      await unzip(outZip, unzipDir)
      assert.equal(existsSync(join(unzipDir, 'file1.txt')), true)
      assert.equal(existsSync(join(unzipDir, 'file2.txt')), true)
      assert.equal(existsSync(join(unzipDir, 'subdir', 'nested.txt')), true)
    })

    it('should preserve file contents when zipping', async () => {
      const outZip = join(tmpDir, 'contents.zip')
      await zip(fixtureDir, outZip)
      const unzipDir = join(tmpDir, 'contents-out')
      await unzip(outZip, unzipDir)
      const original = readFileSync(join(fixtureDir, 'file1.txt'), 'utf8')
      const restored = readFileSync(join(unzipDir, 'file1.txt'), 'utf8')
      assert.equal(restored, original)
    })

    it('should remove the source directory when removeSource is true', async () => {
      const srcCopy = join(tmpDir, 'remove-src')
      cpSync(fixtureDir, srcCopy, { recursive: true })
      const outZip = join(tmpDir, 'remove-src.zip')
      await zip(srcCopy, outZip, { removeSource: true })
      assert.equal(existsSync(srcCopy), false)
    })

    it('should keep the source directory when removeSource is not set', async () => {
      const srcCopy = join(tmpDir, 'keep-src')
      cpSync(fixtureDir, srcCopy, { recursive: true })
      const outZip = join(tmpDir, 'keep-src.zip')
      await zip(srcCopy, outZip)
      assert.equal(existsSync(srcCopy), true)
    })
  })

  describe('#unzip()', () => {
    it('should return the output directory path', async () => {
      const outDir = join(tmpDir, 'unzip-return')
      const result = await unzip(fixtureZip, outDir)
      assert.equal(result, outDir)
    })

    it('should extract files to the specified output directory', async () => {
      const outDir = join(tmpDir, 'unzip-explicit')
      await unzip(fixtureZip, outDir)
      assert.equal(existsSync(join(outDir, 'file1.txt')), true)
      assert.equal(existsSync(join(outDir, 'file2.txt')), true)
    })

    it('should default output path to zip name without extension when no outputDir is given', async () => {
      const zipCopy = join(tmpDir, 'default-unzip.zip')
      cpSync(fixtureZip, zipCopy)
      const result = await unzip(zipCopy)
      assert.equal(result, join(tmpDir, 'default-unzip'))
      assert.equal(existsSync(join(tmpDir, 'default-unzip')), true)
    })

    it('should extract nested files preserving directory structure', async () => {
      const outDir = join(tmpDir, 'unzip-nested')
      await unzip(fixtureZip, outDir)
      assert.equal(existsSync(join(outDir, 'subdir', 'nested.txt')), true)
    })

    it('should preserve file contents when unzipping', async () => {
      const outDir = join(tmpDir, 'unzip-contents')
      await unzip(fixtureZip, outDir)
      const original = readFileSync(join(fixtureDir, 'file1.txt'), 'utf8')
      const restored = readFileSync(join(outDir, 'file1.txt'), 'utf8')
      assert.equal(restored, original)
    })

    it('should remove the zip file when removeSource is true', async () => {
      const zipCopy = join(tmpDir, 'remove-zip.zip')
      cpSync(fixtureZip, zipCopy)
      const outDir = join(tmpDir, 'remove-zip-out')
      await unzip(zipCopy, outDir, { removeSource: true })
      assert.equal(existsSync(zipCopy), false)
    })

    it('should keep the zip file when removeSource is not set', async () => {
      const zipCopy = join(tmpDir, 'keep-zip.zip')
      cpSync(fixtureZip, zipCopy)
      const outDir = join(tmpDir, 'keep-zip-out')
      await unzip(zipCopy, outDir)
      assert.equal(existsSync(zipCopy), true)
    })
  })
})
