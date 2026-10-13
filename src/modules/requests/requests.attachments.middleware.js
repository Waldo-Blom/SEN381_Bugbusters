const multer = require('multer');
const { MAX_BYTES, MAX_IMAGES, AttachmentError } = require('./requests.attachments.validation');

const parse = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_BYTES,
    files: MAX_IMAGES,
    fields: 20,
    fieldSize: 64 * 1024,
    parts: 25,
  },
}).array('images', MAX_IMAGES);

exports.parseImages = (req, res, next) =>
  parse(req, res, (error) => {
    if (error) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      req.attachmentError = new AttachmentError(
        tooLarge
          ? 'Each image must be 5 MB or smaller.'
          : 'Select up to five JPEG, PNG or WebP images using the images field.',
        tooLarge ? 413 : 400
      );
    }
    next();
  });
