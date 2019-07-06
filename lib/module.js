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
      this.nullifyBody()
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
  bodyParserUrlEncoded () {
    return bodyParser.urlencoded({ extended: true/*, limit: '50mb'*/ });
  }
  /**
  * Ensures req.body is set to null if empty, allows for easier presence checking later
  * @return {Function} Express middleware function
  * @example
  * if(req.body) {}
  * // better than something like:
  * if(!Array.isArray(req.body) && Object.keys(req.body).length > 0) {}
  */
  nullifyBody() {
    return (req, res, next) => {
      if(Object.keys(req.body).length === 0) {
        req.body = null;
      }
      next();
    }
  }
}

module.exports = Middleware;
