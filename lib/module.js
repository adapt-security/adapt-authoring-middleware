const bodyParser = require('body-parser');
const { Module } = require('adapt-authoring-core');
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
    app.getModule('server').api.addMiddleware(
      this.bodyParserJson(),
      this.bodyParserUrlEncoded(),
      this.checkAcceptedTypes()
    );
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
  * @param {Array<String>} acceptedTypes The types accepted by the server
  * @return {Function} Middleware handler
  * @see https://expressjs.com/en/api.html#req.accepts
  */
  checkAcceptedTypes() {
    let acceptedTypes;
    try {
      acceptedTypes = this.config.api.acceptedTypes;
    } catch(e) {
      this.log('debug', 'checkAcceptedTypes: no accepted types specified in config');
      return;
    }
    return (req, res, next) => {
      if(!req.accepts(acceptedTypes)) {
        const e = new Error(`Bad input: requested content type not supported (${req.headers.accept}). Accepted types: ${acceptedTypes}`);
        e.statusCode = 406;
        return next(e);
      }
      next();
    };
  }
}

module.exports = Middleware;
