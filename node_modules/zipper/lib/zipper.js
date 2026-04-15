import fs from 'fs'
import fsP from 'fs/promises'
import JSZip from 'jszip'
import klaw from 'klaw'
import path from 'path'
/**
* Module for zipping
*/
export async function zip (inputDir, outputDir = inputToZipPath(inputDir), options = {}) {
  await pWrite(await createZipObject(inputDir), outputDir)
  if (options.removeSource) await fsP.rm(inputDir, { recursive: true })
  return outputDir
}
export async function unzip (zipPath, outputDir = inputToUnzipPath(zipPath), options = {}) {
  const { files } = await processZip(zipPath)
  await Promise.all(files.map(async f => pWrite(f, path.join(outputDir, f.name))))
  if (options.removeSource) await fsP.rm(zipPath)
  return outputDir
}

function inputToZipPath (i) {
  return path.join(path.dirname(i), `${path.basename(i)}.zip`)
}
function inputToUnzipPath (i) {
  return path.join(path.dirname(i), path.basename(i).replace(path.extname(i), ''))
}

async function createZipObject (inputDir) {
  const zip = new JSZip()
  await pKlaw(inputDir, d => {
    if (!d.stats.isDirectory()) {
      zip.file(path.relative(inputDir, d.path), fs.createReadStream(d.path))
    }
  })
  return zip
}

async function processZip (zipPath) {
  const zip = await JSZip.loadAsync(await fsP.readFile(zipPath))
  return Object.values(zip.files).reduce((m, f) => {
    f.dir ? m.dirs.push(f.name) : m.files.push(f)
    return m
  }, { dirs: [], files: [] })
}

function pKlaw (dir, dataCallback) {
  return new Promise((resolve, reject) => {
    klaw(dir)
      .on('data', d => dataCallback(d))
      .on('error', (e, item) => reject(Object.assign(e, { item })))
      .on('end', () => resolve())
  })
}

async function pWrite (zip, outputPath) {
  let stream
  if (zip.generateNodeStream) {
    stream = zip.generateNodeStream()
  } else if (zip.nodeStream) {
    stream = zip.nodeStream()
  }
  if (!stream) {
    throw new Error('Unknown zip input')
  }
  try {
    await fsP.mkdir(path.dirname(outputPath), { recursive: true })
  } catch (e) {
    if (e.code !== 'EEXIST') throw e
  }
  return new Promise((resolve, reject) => {
    stream
      .pipe(fs.createWriteStream(outputPath))
      .on('error', (e) => reject(e))
      .on('finish', () => resolve())
  })
}

export default { zip, unzip }
