const bodyParser = require('body-parser');
const { Module } = require('adapt-authoring-core');
/**
* Adds useful Express middleware to the server stack
* @extends {Module}
*/
class Middleware extends Module {
  /**
  * Add middleware to the server stack
  * @param {Module} app App instance
  * @param {Function} resolve Function to call on fulfilment
  * @param {Function} reject Function to call on rejection
  */
  preload(app, resolve, reject) {
    app.getModule('server').addMiddleware(
      bodyParser.json(/*{limit: '5mb' }*/),
      bodyParser.urlencoded({ extended: true/*, limit: '50mb'*/ })
    );
    resolve();
  }
}

module.exports = Middleware;
