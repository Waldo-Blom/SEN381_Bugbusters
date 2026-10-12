const path = require('path');
const sharp = require('sharp');
const { RequestAccessError } = require('./requests.access');

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 5;
class AttachmentError extends RequestAccessError {
  constructor(message, statusCode = 400) {
    super(message, statusCode);
    this.errors = { attachments: message };
  }
}

const detectFormat = (body) => {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return 'jpeg';
  if (
    body.length >= 8 &&
    body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'png';
  if (
    body.length >= 12 &&
    body.toString('ascii', 0, 4) === 'RIFF' &&
    body.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'webp';
  return null;
};

exports.prepareImages = async (files = []) => {
  if (!Array.isArray(files) || files.length > MAX_IMAGES)
    throw new AttachmentError('You can attach a maximum of five images per request.');
  const images = [];
  for (const file of files) {
    if (!Buffer.isBuffer(file.buffer) || !file.buffer.length)
      throw new AttachmentError('Select a valid JPEG, PNG or WebP image.');
    if (file.buffer.length > MAX_BYTES)
      throw new AttachmentError('Each image must be 5 MB or smaller.', 413);
    const format = detectFormat(file.buffer);
    const extension = path.extname(file.originalname || '').toLowerCase();
    const allowed = { jpeg: ['.jpg', '.jpeg'], png: ['.png'], webp: ['.webp'] };
    if (!format || !allowed[format].includes(extension) || file.mimetype !== `image/${format}`)
      throw new AttachmentError(
        'Only JPEG, PNG and WebP images with matching file contents are supported.'
      );
    let buffer;
    try {
      // Decode the pixels, not just the header. Re-encoding strips metadata and appended payloads.
      const image = sharp(file.buffer, {
        failOn: 'warning',
        limitInputPixels: 40000000,
        animated: true,
      });
      const metadata = await image.metadata();
      if (metadata.format !== format) throw new Error('Image content mismatch');
      buffer = await image.rotate().toFormat(format).toBuffer();
    } catch {
      throw new AttachmentError(
        'An image is damaged or too large to process. Select a valid image.'
      );
    }
    if (buffer.length > MAX_BYTES)
      throw new AttachmentError('Each processed image must be 5 MB or smaller.', 413);
    const name = path
      .basename((file.originalname || '').replace(/\\/g, '/'))
      .split('')
      .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
      .join('')
      .slice(0, 255);
    images.push({
      buffer,
      fileName: name,
      extension: format === 'jpeg' ? 'jpg' : format,
      contentType: `image/${format}`,
      size: buffer.length,
    });
  }
  return images;
};

module.exports.MAX_BYTES = MAX_BYTES;
module.exports.MAX_IMAGES = MAX_IMAGES;
module.exports.AttachmentError = AttachmentError;
