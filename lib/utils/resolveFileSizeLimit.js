import bytes from 'bytes'

/**
 * Resolves the upload size limit (bytes) for a file from its MIME category,
 * falling back to `options.maxFileSize`.
 * @param {string} mimetype The file's validated MIME type
 * @param {FileUploadOptions} options Upload options (`maxFileSize`, optional `maxFileSizeByType`)
 * @returns {number} The size limit in bytes
 * @memberof middleware
 */
export default function resolveFileSizeLimit (mimetype, options = {}) {
  const toBytes = v => (typeof v === 'number' ? v : bytes(v))
  const category = typeof mimetype === 'string' ? mimetype.split('/')[0] : undefined
  const override = (options.maxFileSizeByType && category) ? options.maxFileSizeByType[category] : undefined
  return toBytes(override ?? options.maxFileSize)
}
