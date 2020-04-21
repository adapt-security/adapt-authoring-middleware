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
      this.checkAcceptedTypes(),
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
  /**
  * Checks the incoming request accepts a type supported by the server
  * @return {Function} Middleware handler
  * @see https://expressjs.com/en/api.html#req.accepts
  */
  checkAcceptedTypes() {
    const acceptedTypes = this.getConfig('acceptedTypes');
    if(!acceptedTypes) {
      return this.log('warn', this.app.lang.t('error.noacceptedtypes'));
    }
    return (req, res, next) => {
      if(!req.accepts(acceptedTypes)) {
        const e = new Error(this.app.lang.t('error.unsupportedtype', { reqtype: req.headers.accept, acceptedTypes: acceptedTypes }));
        e.statusCode = 406;
        return next(e);
      }
      next();
    };
  }
  fileUploadParser(...expectedFileTypes) {
    const ensureDir = promisify(fs.ensureDir);
    const remove = promisify(fs.remove);
    // TODO need to be set via config
    const fOpts = {
      maxFieldsSize: undefined,
      maxFields: undefined,
      maxFileSize: undefined,
      multiples: true,
    };
    return async (req, res, next) => {
      const uploadDir = path.join(App.instance.getConfig('temp_dir'), 'formidable');
      try {
        await fs.ensureDir(uploadDir);
      } catch(e) {
        return next(e);
      }
      formidable({ ...fOpts, uploadDir }).parse(req, async (error2, fields, files) => {
        if(error2) {
          return next(error2);
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
function checkUploadedFiles(expectedFileTypes, filesToCheck) {
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
