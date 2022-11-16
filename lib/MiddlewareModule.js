import { AbstractModule, App } from 'adapt-authoring-core';
import axios from 'axios';
import bodyParser from 'body-parser';
import compression from 'compression';
import { createWriteStream } from 'fs';
import { fileTypeFromFile } from 'file-type';
import formidable from 'formidable';
import fs from 'fs/promises';
import path from 'path';
import helmet from 'helmet';
import { unzip } from 'zipper';
/**
 * Adds useful Express middleware to the server stack
 * @extends {AbstractModule}
 */
class MiddlewareModule extends AbstractModule {
  get zipTypes() {
    return [
      'application/zip',
      'application/x-zip-compressed'
    ];
  }
  isZip(mimeType) {
    return this.zipTypes.includes(mimeType);
  }
  /** @override */
  async init() {
    const server = await this.app.waitForModule('server');
    // add custom middleware
    server.api.addMiddleware(
      helmet(),
      this.bodyParserJson(),
      this.bodyParserUrlEncoded(),
      compression()
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
   * Sets default file upload options
   * @param {object} options The initial options object
   * @returns {FileUploadOptions}
   */
  setDefaultFileOptions(options = {}) {
    Object.entries({
      maxFileSize: this.getConfig('fileUploadMaxFileSize'),
      multiples: true,
      uploadDir: this.getConfig('uploadTempDir'),
      promisify: false,
      unzip: false,
      removeZipSource: true,
    }).forEach(([k,v]) => {
      if(k === 'expectedFileTypes' && !Array.isArray(v)) v = [v];
      if(!options.hasOwnProperty(k)) options[k] = v;
    });
  }
  /**
   * Handles incoming file uploads
   * @param {Array<String>} expectedFileTypes List of file types to accept
   * @param {FileUploadOptions} options
   * @return {Function} The Express handler
   */
  fileUploadParser(expectedFileTypes, options = {}) {
    options.expectedFileTypes = expectedFileTypes;
    this.setDefaultFileOptions(options);
    return async (req, res, next) => {
      return new Promise(async (resolve, reject) => {
        if(options.promisify) {
          next = e => e ? reject(e) : resolve();
        }
        if(!req.headers['content-type'].startsWith('multipart/form-data')) {
          return next();
        }
        try {
          await fs.mkdir(options.uploadDir, { recursive: true });
        } catch(e) {
          if(e.code !== 'EEXIST') return next(e);
        }
        formidable(options).parse(req, async (error, fields, files) => {
          if(error) {
            if(error.code === 1009) return next(this.app.errors.FILE_EXCEEDS_MAX_SIZE.setData({ maxSize: options.maxFileSize }));
            return next(error);
          }
          try {
            await validateUploadedFiles(files, options);
          } catch(e) {
            return next(e);
          }
          if(options.unzip) {
            await Promise.all(Object.entries(files).map(async ([k, [f]]) => {
              const middleware = await this.app.waitForModule('middleware');
              if(!middleware.isZip(f.mimetype)) {
                return Promise.resolve();
              }
              f.mimetype = 'application/zip'; // always set to the same value for easier checking elsewhere
              f.filepath = await unzip(f.filepath, `${f.filepath}_unzip`, { removeSource: options.removeZipSource || true });
            }));
          }
          // @NOTE covert fields back from arrays
          Object.keys(fields).forEach(k => fields[k] = fields[k][0]);
          Object.assign(req, { fileUpload: { fields, files } });
          // also add the fields to the body
          Object.assign(req.body, fields);
          next();
        });
      });
    };
  }
  /**
   * Handles incoming file uploads via URL
   * @param {Array<String>} expectedFileTypes List of file types to accept
   * @param {FileUploadOptions} options
   * @return {Function} The Express handler
   */
  urlUploadParser(expectedFileTypes, options) {
    options.expectedFileTypes = expectedFileTypes;
    this.setDefaultFileOptions(options);
    return async (req, res, next) => {
      return new Promise(async (resolve, reject) => {
        if(options.promisify) {
          next = e => e ? reject(e) : resolve();
        }
        if(!req.body.url) {
          return next();
        }
        let responseData;
        try {
          responseData = (await axios.get(req.body.url, { responseType: 'stream' })).data;
        } catch(e) {
          const is404 = e.response.status === 404;
          res.status(e.response.status).json({ message: is404 ? 'Remote file not found' : e.response.data });
          return;
        }
        const contentType = responseData.headers['content-type'];
        const subtype = contentType.split('/')[1];
        const fileName = `${new Date().getTime()}.${subtype}`;
        const uploadPath = path.resolve(options.uploadDir, fileName);
        // set up file data to mimic formidable
        const fileData = { 
          fields: req.apiData.data, 
          files: {
            file: [{
              filepath: uploadPath,
              originalFilename: fileName,
              newFilename: fileName,
              mimetype: contentType,
              size: Number(responseData.headers['content-length'])
            }] 
          }
        };
        let fileStream;
        try {
          validateUploadedFiles(fileData.files, options);
          await fs.mkdir(options.uploadDir, { recursive: true });
          fileStream = createWriteStream(uploadPath);
        } catch(e) {
          if(e.code !== 'EEXIST') return next(e);
        }
        responseData.pipe(fileStream).on('close', async () => {
          req.fileUpload = fileData;
          if(subtype === 'zip' && options.unzip) {
            req.fileUpload.files.course.filepath = await unzip(courseData.path, `${uploadPath}_unzip`, { removeSource: options.removeSource });
          }
          next();
        }).on('error', next);
      });
    };
  }
}
/** @ignore */
async function validateUploadedFiles(filesObj, options) {
  const errors = App.instance.errors;
  const assetErrors = [];
  const filesArr = Object.values(filesObj).reduce((memo, f) => memo.concat(f), []);  // flatten nested arrays
  await Promise.all(filesArr.map(async f => {
    f.mimetype = (await fileTypeFromFile(f.filepath)).mime;
    if(!options.expectedFileTypes.includes(f.mimetype)) {
      assetErrors.push(errors.UNEXPECTED_FILE_TYPES.setData({ expectedFileTypes: options.expectedFileTypes, invalidFiles: [f.originalFileName] }));
    }
    if(!f.size > options.maxFileSize) {
      assetErrors.push(errors.FILE_EXCEEDS_MAX_SIZE.setData({ size: f.size, maxSize: options.maxFileSize }));
    }
  }));
  if(assetErrors.length) throw errors.VALIDATION_FAILED.setData({ schemaName: 'fileupload', errors: assetErrors.join(', ') });
}

export default MiddlewareModule;