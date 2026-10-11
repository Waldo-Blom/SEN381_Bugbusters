const ejs = require('ejs');
const nodemailer = require('nodemailer');
const path = require('path');
const { getEmailFromAddress, getEmailTransportOptions } = require('../../config/env');

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = [250, 500];
let transport;

const isTransientSmtpError = (error) => {
  if (Number.isInteger(error.responseCode) && error.responseCode >= 400) {
    return error.responseCode < 500;
  }

  return ['ECONNECTION', 'ECONNRESET', 'EPIPE', 'ESOCKET', 'ETIMEDOUT'].includes(error.code);
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const getTransport = () => {
  if (!transport) {
    transport = nodemailer.createTransport(getEmailTransportOptions());
  }
  return transport;
};

const sendStatusChange = async (details) => {
  const staffComment =
    typeof details.staffComment === 'string' && details.staffComment.trim()
      ? details.staffComment
      : null;
  const html = await ejs.renderFile(path.join(__dirname, 'templates', 'status-change.ejs'), {
    requesterName: details.requesterName,
    requestName: details.requestName,
    requestId: details.requestId,
    previousStatus: details.previousStatus,
    newStatus: details.newStatus,
    staffComment,
    department: details.department || 'Not specified',
    staffName: details.staffName || 'CivicConnect staff',
  });
  const text = [
    `Good day ${details.requesterName},`,
    '',
    `This email is with regards to ${details.requestName} with request id of ${details.requestId}. The status of the request has changed from status ${details.previousStatus} to ${details.newStatus}.`,
    ...(staffComment
      ? [
          `Staff member '${details.staffName || 'CivicConnect staff'}' had this to say:`,
          '',
          staffComment,
        ]
      : []),
    '',
    'Kind regards,',
    '',
    `CivicConnect, ${details.department || 'Not specified'} department`,
  ].join('\n');
  const mail = {
    from: getEmailFromAddress(),
    to: details.recipientEmail,
    subject: `Update for request ${details.requestReference}: ${details.newStatus}`,
    text,
    html,
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const info = await getTransport().sendMail(mail);
      if (process.env.NODE_ENV !== 'production') {
        try {
          const previewUrl = nodemailer.getTestMessageUrl(info);
          if (previewUrl) {
            console.info('[EmailService] Ethereal preview: %s', previewUrl);
          }
        } catch (error) {
          console.error(
            '[EmailService] Could not generate the Ethereal preview URL:',
            error.message
          );
        }
      }
      return { info, attempts: attempt };
    } catch (error) {
      error.attempts = attempt;
      if (attempt === MAX_ATTEMPTS || !isTransientSmtpError(error)) {
        throw error;
      }
      await delay(RETRY_DELAY_MS[attempt - 1]);
    }
  }

  throw new Error('Email delivery failed without an SMTP response.');
};

module.exports = {
  sendStatusChange,
  isTransientSmtpError,
};
