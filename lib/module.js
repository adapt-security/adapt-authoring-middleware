const bodyParser = require('body-parser');
const { Module } = require('adapt-authoring-core');
/**
* Express middleware to be added to the server
*/
class Middleware extends Module {
  preload(app, resolve, reject) {
    app.getModule('server').addMiddleware(
      (req,res,next) => {
        this.log('info', 'Middleware called on every request');
        next();
      },
      bodyParser.json(/*{limit: '5mb' }*/),
      bodyParser.urlencoded({ extended: true/*, limit: '50mb'*/ })
    );
    resolve();
  }
}

module.exports = Middleware;