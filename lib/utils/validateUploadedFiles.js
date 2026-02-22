import { App } from 'adapt-authoring-core'
import bytes from 'bytes'
import { fileTypeFromFile } from 'file-type'
import path from 'path'

/**
 * Validates uploaded files against expected types and size limits
 * @param {external:ExpressRequest} req
 * @param {Object} filesObj Files object from formidable
 * @param {Object} options Upload options including expectedFileTypes and maxFileSize
 * @memberof middleware
 */
export async function validateUploadedFiles (req, filesObj, options) {
  const errors = App.instance.errors
  const assetErrors = []
  const filesArr = Object.values(filesObj).reduce((memo, f) => memo.concat(f), []) // flatten nested arrays
  await Promise.all(filesArr.map(async f => {
    if (!options.expectedFileTypes.includes(f.mimetype)) {
      // formidable mimetype isn't allowed, try inspecting the file
      f.mimetype = (await fileTypeFromFile(f.filepath))?.mime
      if (!f.mimetype && path.extname(f.originalFilename) === '.srt') {
        f.mimetype = 'application/x-subrip'
      }
      if (!options.expectedFileTypes.includes(f.mimetype)) {
        assetErrors.push(errors.UNEXPECTED_FILE_TYPES.setData({ expectedFileTypes: options.expectedFileTypes, invalidFiles: [f.originalFilename], mimetypes: [f.mimetype] }))
      }
    }
    if (f.size > options.maxFileSize) {
      assetErrors.push(errors.FILE_EXCEEDS_MAX_SIZE.setData({ size: bytes(f.size), maxSize: bytes(options.maxFileSize) }))
    }
  }))
  if (assetErrors.length) {
    throw errors.VALIDATION_FAILED
      .setData({ schemaName: 'fileupload', errors: assetErrors.map(req.translate).join(', ') })
  }
}
