/**
 * This file exists to define the below types for documentation purposes.
 */
/**
 * Options which can be passed to file upload middleware
 * @memberof middleware
 * @typedef {Object} FileUploadOptions
 * @property {number} maxFileSize Maximum file size allowed by upload
 * @property {string} uploadDir Directory file upload should be stored
 * @property {Boolean} promisify If true, middleware will return a promise rather than use the standard callback. Useful when calling middleware outside of an Express middleware stack
 * @property {Boolean} removeZipSource To be used in conjunction with the unzip option. Whether the original zip file should be removed after unzipping (true by default)
 * @property {Boolean} unzip Whether any zip files should be unzipped by the handler
 */