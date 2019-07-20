const bodyParser = require('body-parser');
const { DataStoreQuery, Module } = require('adapt-authoring-core');
/**
* Adds useful Express middleware to the server stack
* @extends {Module}
*/
class Middleware extends Module {
  /**
  * Add the following middleware to the server stack: {@link bodyParserJson}, {@link bodyParserUrlEncoded}, {@link nullifyBody}
  * @param {Module} app App instance
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
        this.sanitiseInput(req);
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
    return bodyParser.json();
  }
  /**
  * Parses incoming URL-encoded data to req.body
  * @see https://github.com/expressjs/body-parser#bodyparserurlencodedoptions
  * @return {Function} Express middleware function
  */
  bodyParserUrlEncoded() {
    return bodyParser.urlencoded({ extended: true });
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
  * Makes sure the input is in an expected format before calling the handler functions
  * @param {ClientRequest} req
  */
  sanitiseInput(req) {
    ['body', 'params', 'query'].forEach(attr => {
      const entries = Object.entries(req[attr]);
      let deleted = 0;
      if(entries.length === 0) {
        req[attr] = null;
        return;
      }
      entries.forEach(([key, val]) => {
        if(val === undefined || val === null) {
          delete req[attr][key];
          deleted++;
        };
      });
      if(deleted === entries.length) req[attr] = null;
    });
    if(req.method === 'GET' || req.query || req.params) {
      req.dsquery = new DataStoreQuery({
        type: req.type,
        fieldsMatching: Object.assign({}, req.params, req.query)
      });
    }
    if(req.body && !req.dsquery) {
      req.body.type = req.type;
    }
  }
}

module.exports = Middleware;
