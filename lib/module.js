const bodyParser = require('body-parser');
const { AbstractModule, App, DataStoreQuery, Responder, Utils } = require('adapt-authoring-core');
/**
* Adds useful Express middleware to the server stack
* @extends {AbstractModule}
*/
class MiddlewareModule extends AbstractModule {
  /**
  * Add the following middleware to the server stack: {@link bodyParserJson}, {@link bodyParserUrlEncoded}, {@link nullifyBody}
  * @param {AbstractModule} app App instance
  * @param {Function} resolve Function to call on fulfilment
  * @param {Function} reject Function to call on rejection
  */
  preload(app, resolve, reject) {
    const server = app.getModule('server');

    server.api.addMiddleware(
      this.bodyParserJson(),
      this.bodyParserUrlEncoded(),
      this.checkAcceptedTypes()
    );

    server.requestHook.tap(req => {
      return new Promise((resolve, reject) => {
        this.addExistenceProps(req);
        resolve();
      });
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

function handleBodyError(error, res) {
  const e = new Error(App.instance.lang.t('error.bodyparse', { error }));
  e.statusCode = 400;
  new Responder(res).error(e);
}

module.exports = MiddlewareModule;
