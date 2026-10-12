const { randomUUID } = require('crypto');
const { pool } = require('../../config/database');
const model = require('./requests.attachments.model');
const storage = require('../../config/object-storage');
const { isUuid } = require('./requests.schema');
const { RequestAccessError } = require('./requests.access');
const { prepareImages, MAX_IMAGES, AttachmentError } = require('./requests.attachments.validation');
const { failure } = require('./requests.attachments.errors');

const access = async (requestId, userId, client, lock, uploading = false, role) => {
  if (!isUuid(requestId) || !isUuid(userId))
    throw new RequestAccessError('Invalid request or user identifier.', 400);
  let context;
  try {
    context = await model.findAccess(requestId, userId, client, lock, role);
  } catch (error) {
    throw failure('access', error);
  }
  if (!context) throw new RequestAccessError('Request not found.', 404);
  if (!context.allowed || (uploading && !context.can_upload))
    throw new RequestAccessError('You are not authorised to access these attachments.');
  return context;
};

exports.prepareImages = prepareImages;
exports.cleanup = async (keys) => {
  const results = await Promise.allSettled(keys.map((key) => storage.remove(key)));
  results.forEach((result, index) => {
    if (result.status === 'rejected')
      console.error('Attachment cleanup failed; retry deletion for object:', keys[index]);
  });
};

exports.persist = async (client, requestId, userId, images, uploadedKeys, role) => {
  await access(requestId, userId, client, true, true, role);
  const existing = await model.count(client, requestId);
  if (existing + images.length > MAX_IMAGES)
    throw new AttachmentError('You can attach a maximum of five images per request.');
  for (const image of images) {
    const key = `requests/${requestId}/${randomUUID()}.${image.extension}`;
    // Track before PUT so a timeout after storage accepted the object is also cleaned up.
    uploadedKeys.push(key);
    try {
      await storage.upload(key, image.buffer, image.contentType);
    } catch (error) {
      throw failure('storage', error);
    }
    try {
      await model.insert(client, requestId, userId, image, key);
    } catch (error) {
      throw failure('metadata', error);
    }
  }
};

exports.add = async (requestId, userId, files, role) => {
  await access(requestId, userId, undefined, false, true, role);
  const images = await prepareImages(files);
  if (!images.length) throw new AttachmentError('Select at least one image.');
  const uploadedKeys = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await exports.persist(client, requestId, userId, images, uploadedKeys, role);
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } finally {
      await exports.cleanup(uploadedKeys);
    }
    throw error.statusCode ? error : failure('request', error);
  } finally {
    client.release();
  }
};

exports.list = async (requestId, userId, role) => {
  await access(requestId, userId, undefined, undefined, false, role);
  return model.list(requestId);
};
exports.downloadUrl = async (requestId, attachmentId, userId, role) => {
  if (!isUuid(attachmentId)) throw new RequestAccessError('Invalid attachment identifier.', 400);
  await access(requestId, userId, undefined, undefined, false, role);
  const attachment = await model.find(requestId, attachmentId);
  if (!attachment) throw new RequestAccessError('Attachment not found.', 404);
  const extension = attachment.file_extension_type.toLowerCase().replace(/^\./, '');
  const contentType = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  }[extension];
  if (!contentType || !attachment.file_path.startsWith(`requests/${requestId}/`))
    throw new RequestAccessError('Attachment is unavailable.', 404);
  return storage.downloadUrl(attachment.file_path, contentType);
};

exports.remove = async (requestId, userId, attachmentIds, role) => {
  if (!Array.isArray(attachmentIds) || !attachmentIds.length) return [];
  const validIds = attachmentIds.filter((id) => isUuid(id));
  if (!validIds.length) return [];

  await access(requestId, userId, undefined, false, true, role);
  const client = await pool.connect();
  const deleted = [];
  try {
    await client.query('BEGIN');
    const rows = await model.deleteByIds(client, requestId, validIds);
    await client.query('COMMIT');
    deleted.push(...rows);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error.statusCode ? error : failure('metadata', error);
  } finally {
    client.release();
  }

  if (deleted.length) {
    const keys = deleted.map((r) => r.file_path).filter(Boolean);
    await exports.cleanup(keys);
  }
  return deleted;
};
