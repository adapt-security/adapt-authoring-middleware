const { AbstractModule, App, Responder, Utils } = require('adapt-authoring-core');
const bodyParser = require('body-parser');
const helmet = require('helmet');
/**
* Adds useful Express middleware to the server stack
* @extends {AbstractModule}
*/
class MiddlewareModule extends AbstractModule {
  constructor(...args) {
    super(...args);
    this.init();
  }
  /**
  * Add the following middleware to the server stack: {@link bodyParserJson}, {@link bodyParserUrlEncoded}, {@link nullifyBody}
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
    // modify the req object with custom properties
    server.requestHook.tap(req => {
      this.addExistenceProps(req);
      return Promise.resolve(req);
    });
    resolve();
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
  /**
  * Adds extra properties to the request object to allow for easy existence
  * checking of common request objects
  * @param {ClientRequest} req
  */
  addExistenceProps(req) {
    const storeVal = (key, exists) => req[`has${Utils.capitalise(key)}`] = exists;
    ['body', 'params', 'query'].forEach(attr => {
      if(!req[attr]) {
        return storeVal(attr, true);
      }
      const entries = Object.entries(req[attr]);
      let deleted = 0;
      if(entries.length === 0) {
        return storeVal(attr, false);
      }
      entries.forEach(([key, val]) => {
        if(val === undefined || val === null) {
          delete req[attr][key];
          deleted++;
        };
      });
      storeVal(attr, deleted < entries.length);
    });
  }
}
/** @ignore */
function handleBodyError(error, res) {
  const e = new Error(App.instance.lang.t('error.bodyparse', { error }));
  e.statusCode = Responder.StatusCodes.Error.User;
  new Responder(res).error(e);
}

module.exports = MiddlewareModule;
