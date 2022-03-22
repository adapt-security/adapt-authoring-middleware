import { AbstractModule, App } from 'adapt-authoring-core';
import axios from 'axios';
import bodyParser from 'body-parser';
import formidable from 'formidable';
import fs from 'fs/promises';
import helmet from 'helmet';
import path from 'path';
import { unzip } from 'zipper';
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
        if(error) return next(this.app.errors.BODY_PARSE_FAILED.setData({ error: error.message }));
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
        if(error) return next(this.app.errors.BODY_PARSE_FAILED.setData({ error: error.message }));
        next(null, ...args);
      });
    };
  }
  /**
   * Handles incoming file uploads
   * @param {Array<String>} expectedFileTypes List of file types to accept
   * @param {Object} options
   * @param {Boolean} options.unzip Whether any zip files should be unzipped by the handler
   * @param {Boolean} options.removeZipSource Whether the original zip file should be removed after unzipping (true by default)
   * @return {Function} The Express handler
   */
  fileUploadParser(expectedFileTypes, options = {}) {
    const fOpts = {
      maxFileSize: getConfig('fileUploadMaxFileSize'),
      multiples: true,
      uploadDir: path.resolve(App.instance.rootDir, App.instance.getConfig('uploadTempDir'))
    };
    if(!Array.isArray(expectedFileTypes)) {
      expectedFileTypes = [expectedFileTypes];
    }
    return async (req, res, next) => {
      try {
        await fs.mkdir(fOpts.uploadDir, { recursive: true });
      } catch(e) {
        if(e.code !== 'EEXIST') return next(e);
      }
      formidable(fOpts).parse(req, async (error, fields, files) => {
        if(error) {
          return next(error);
        }
        try {
          checkUploadedFiles(expectedFileTypes, Object.values(files));
        } catch(e) {
          return next(e);
        }
        if(options.unzip) {
          await Promise.all(Object.entries(files).map(async ([k, [f]]) => {
            if(f.mimetype !== 'application/zip' && f.mimetype !== 'application/x-zip-compressed') {
              return Promise.resolve();
            }
            f.filepath = await unzip(f.filepath, `${f.filepath}_unzip`, { removeSource: options.removeZipSource || true });
          }));
        }
        Object.assign(req, { fileUpload: { fields, files } });
        // also add the fields to the body
        Object.assign(req.body, fields);
        next();
      });
    };
  }
  /**
   * Handles incoming file uploads via URL
   * @param {Array<String>} expectedFileTypes List of file types to accept
   * @param {Object} options
   * @param {Boolean} options.unzip Whether any zip files should be unzipped by the handler
   * @param {Boolean} options.removeZipSource Whether the original zip file should be removed after unzipping (true by default)
   * @return {Function} The Express handler
   */
  urlUploadParser(expectedFileTypes, options = {}) {
    if(!Array.isArray(expectedFileTypes)) {
      expectedFileTypes = [expectedFileTypes];
    }
    return async (req, res, next) => {
      let responseData;
      try {
        responseData = (await axios.get(req.body.url, { responseType: 'stream' })).data;
      } catch(e) {
        const is404 = e.response.status === 404;
        res.status(e.response.status).json({ message: is404 ? 'Remote file not found' : e.response.data });
        return;
      }
      const outputDir = path.resolve(App.instance.rootDir, App.instance.getConfig('uploadTempDir'));
      const time = new Date().getTime();
      const courseData = {
        name: `${time}.zip`,
        path: `${outputDir}/${time}`,
        type: 'application/zip'
      };
      try {
        await fs.promises.mkdir(outputDir, { recursive: true });
      } catch(e) {
        if(e.code !== 'EEXIST') return next(e);
      }
      responseData.pipe(fs.createWriteStream(courseData.path)).on('close', async () => {
        req.fileUpload = { files: { course: courseData } };
        req.fileUpload.files.course.filepath = await unzip(courseData.path, `${courseData.path}_unzip`, { removeSource: true });
        next();
      }).on('error', next);
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
  const invalidFiles = filesToCheck
    .reduce((memo, f) => memo.concat(f), []) // flatten nested arrays
    .filter(f => !expectedFileTypes.includes(f.mimetype)) // ignore any included in expectedFileTypes
    .map(f => f.originalFilename);

  if(invalidFiles.length) {
    throw App.instance.errors.UNEXPECTED_FILE_TYPES
      .setData({ expectedFileTypes, invalidFiles });
  }
}

export default MiddlewareModule;