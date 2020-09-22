const _ = require('lodash');
const { AbstractModule, App } = require('adapt-authoring-core');
const bodyParser = require('body-parser');
const formidable = require('formidable');
const fs = require('fs-extra');
const helmet = require('helmet');
const path = require('path');
const { promisify } = require('util');
/**
* Adds useful Express middleware to the server stack
* @extends {AbstractModule}
*/
class MiddlewareModule extends AbstractModule {
  /** @override */
  constructor(...args) {
    super(...args);
    this.init();
  }
  /**
  * Add preselected middleware to the server stack
  * @return {Promise}
  */
  async init() {
    const server = await this.app.waitForModule('server');
    // add custom middleware
    server.api.addMiddleware(
      helmet(),
      this.bodyParserJson(),
      this.bodyParserUrlEncoded()
    );
    this.setReady();
  }
  /**
  * Parses incoming JSON data to req.body
  * @see https://github.com/expressjs/body-parser#bodyparserjsonoptions
  * @return {Function} Express middleware function
  */
  bodyParserJson() {
    return (req, res, next) => {
      bodyParser.json()(req, res, (error, ...args) => {
        if(error) return handleBodyError(error, res);
        next(null, ...args);
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
        if(error) return handleBodyError(error, res);
        next(null, ...args);
      });
    };
  }
  fileUploadParser(expectedFileTypes, opts) {
    const fOpts = {
      maxFileSize: getConfig('fileUploadMaxFileSize'),
      multiples: true,
      uploadDir: getConfig('fileUploadTempDir') || path.join(App.instance.getConfig('tempDir'), 'formidable')
    };
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
          e.statusCode = res.StatusCodes.Error.User;
          return next(e);
        }
        Object.assign(req, { fileUpload: { fields, files } });
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
  if (!expectedFileTypes) {
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
async function handleBodyError(error, res) {
  res.sendError(res.StatusCodes.Error.User, App.instance.lang.t('error.bodyparse', { error }));
}

module.exports = MiddlewareModule;
