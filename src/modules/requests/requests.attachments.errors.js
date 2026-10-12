const { AttachmentError } = require('./requests.attachments.validation');

// Keep SDK errors, SQL, credentials and connection strings out of browser responses and logs.
exports.failure = (stage, error) => {
  const status = error?.$metadata?.httpStatusCode;
  const code = typeof error?.code === 'string' ? error.code : error?.name;
  const knownCode = typeof code === 'string' && /^[A-Za-z0-9_]+$/.test(code) ? code : 'UNKNOWN';
  console.error('[attachments]', { stage, code: knownCode, status });
  let message;
  let reference;
  if (stage === 'storage') {
    if (code === 'STORAGE_NOT_CONFIGURED' || code === 'ERR_INVALID_URL') {
      message =
        'Image uploads are unavailable because storage is not configured correctly on the server. Please contact support.';
      reference = 'ATT-STORAGE-CONFIG';
    } else if (
      status === 403 ||
      ['AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch'].includes(code)
    ) {
      message =
        'The image storage service refused the upload. This is a server access problem, not an image size problem. Please contact support.';
      reference = 'ATT-STORAGE-ACCESS';
    } else if (code === 'NoSuchBucket' || status === 404) {
      message =
        'The image upload location is unavailable. Please contact support to check the storage setup.';
      reference = 'ATT-STORAGE-BUCKET';
    } else if (
      ['TimeoutError', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)
    ) {
      message = 'The server could not reach image storage. Please try uploading again in a moment.';
      reference = 'ATT-STORAGE-CONNECTION';
    } else {
      message =
        'The image storage service could not accept the upload. Please try again or contact support.';
      reference = 'ATT-STORAGE';
    }
  } else if (stage === 'access') {
    message =
      'Your image passed validation, but the server could not check upload permissions. Please try again or contact support.';
    reference = 'ATT-PERMISSIONS';
  } else if (stage === 'metadata') {
    message =
      'Your image reached storage, but its attachment details could not be saved. The upload has been cancelled. Please try again or contact support.';
    reference = 'ATT-SAVE';
  } else {
    message =
      'The database could not finish saving your request with its images. Please try again or contact support.';
    reference = 'ATT-REQUEST-SAVE';
  }
  const failure = new AttachmentError(`${message} Error code: ${reference}.`, 503);
  failure.reference = reference;
  return failure;
};
