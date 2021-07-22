const { AbstractModule, App } = require('adapt-authoring-core');
const bodyParser = require('body-parser');
const formidable = require('formidable');
const fs = require('fs-extra');
const helmet = require('helmet');
const path = require('path');
const { unzip } = require('zipper');
/**
 * Adds useful Express middleware to the server stack
 * @extends {AbstractModule}
 */
class MiddlewareModule extends AbstractModule {
  /** @override */
  async init() {
    const server = await this.app.waitForModule('server');
    // add custom middleware
    server.api.addMiddleware(
      helmet(),
      this.bodyParserJson(),
      this.bodyParserUrlEncoded()
    );
  }
  /**
   * Parses incoming JSON data to req.body
   * @see https://github.com/expressjs/body-parser#bodyparserjsonoptions
   * @return {Function} Express middleware function
   */
  bodyParserJson() {
    return (req, res, next) => {
      bodyParser.json()(req, res, (error, ...args) => {
        next(formatBodyError(error), ...args);
      });
    };
  }
  /**
   * Parses incoming URL-encoded data to req.body
   * @see https://github.com/expressjs/body-parser#bodyparserurlencodedoptions
   * @return {Function} Express middleware function
   */
  bodyParserUrlEncoded() {
    return (req, res, next) => {
      bodyParser.urlencoded({ extended: true })(req, res, (error, ...args) => {
        next(formatBodyError(error), ...args);
      });
    };
  }
  /**
   * Handles incoming file uploads
   * @type {Array<String>} expectedFileTypes List of file types to accept
   * @type {Object} options
   * @type {Boolean} options.unzip Whether any zip files should be unzipped by the handler
   * @type {Boolean} options.removeZipSource Whether the original zip file should be removed after unzipping (true by default)
   * @return {Function} The Express handler
   */
  fileUploadParser(expectedFileTypes, options = {}) {
    const fOpts = {
      maxFileSize: getConfig('fileUploadMaxFileSize'),
      multiples: true,
      uploadDir: App.instance.getConfig('uploadTempDir')
    };
    if(!Array.isArray(expectedFileTypes)) {
      expectedFileTypes = [expectedFileTypes];
    }
    return async (req, res, next) => {
      try {
        await fs.ensureDir(fOpts.uploadDir);
      } catch(e) {
        return next(e);
      }
      formidable(fOpts).parse(req, async (error, fields, files) => {
        if(error) {
          return next(error);
        }
        try {
          checkUploadedFiles(expectedFileTypes, Object.values(files));
        } catch(e) {
          e.statusCode = 400;
          return next(e);
        }
        if(options.unzip) {
          await Promise.all(Object.entries(files).map(async ([k, f]) => {
            if(f.type !== 'application/zip') {
              return Promise.resolve();
            }
            f.unzipPath = await unzip(f.path, `${f.path}_unzip`, { removeSource: options.removeZipSource || true });
          }));
        }
        Object.assign(req, { fileUpload: { fields, files } });
        // also add the fields to the body
        Object.assign(req.body, fields);
        next();
      });
    };
  }
}
/** @ignore */
function getConfig(key) {
  return App.instance.getConfig(`adapt-authoring-middleware.${key}`);
}
/** @ignore */
function checkUploadedFiles(expectedFileTypes, filesToCheck) {
  if(!expectedFileTypes) {
    return;
  }
  const invalidFileCount = filesToCheck
    .reduce((memo, f) => memo.concat(f), []) // flatten nested arrays
    .filter(f => !expectedFileTypes.includes(f.type)) // ignore any included in expectedFileTypes
    .length;

  if(invalidFileCount) {
    throw new Error(App.instance.lang.t('error.unexpectedtype', { types: expectedFileTypes }));
  }
}
/** @ignore */
function formatBodyError(error) {
  if(error) {
    const e = new Error(App.instance.lang.t('error.bodyparse', { error }));
    e.statusCode = 400;
    return e;
  }
}

module.exports = MiddlewareModule;
