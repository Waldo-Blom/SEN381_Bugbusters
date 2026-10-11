const getEmailTransportOptions = () => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const provider = getEmailProvider();

  if (!user || !pass) {
    throw new Error('EMAIL_USER and EMAIL_PASS must be configured to send email.');
  }

  if (provider === 'gmail') {
    return {
      service: 'gmail',
      auth: { user, pass },
    };
  }

  const port = Number(process.env.EMAIL_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('EMAIL_PORT must be a valid TCP port.');
  }

  return {
    host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
    port,
    secure: port === 465,
    auth: { user, pass },
  };
};

const getEmailProvider = () => {
  const configuredProvider = process.env.EMAIL_PROVIDER;
  const provider = configuredProvider
    ? configuredProvider.trim().toLowerCase()
    : process.env.NODE_ENV === 'production'
      ? 'gmail'
      : 'smtp';

  if (!['gmail', 'smtp'].includes(provider)) {
    throw new Error('EMAIL_PROVIDER must be either "gmail" or "smtp".');
  }

  return provider;
};

const getEmailFromAddress = () => process.env.EMAIL_FROM || process.env.EMAIL_USER;

module.exports = {
  getEmailProvider,
  getEmailTransportOptions,
  getEmailFromAddress,
};
