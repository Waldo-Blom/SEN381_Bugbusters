const nodemailer = require('nodemailer');

async function sendTestEmail() {
  const testAccount = await nodemailer.createTestAccount();

  console.log('Ethereal test account created:');
  console.log('  User: %s', testAccount.user);
  console.log('  Pass: %s', testAccount.pass);

  const transporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"CivicConnect Test" <${testAccount.user}>`,
      to: 'recipient@example.com',
      subject: 'CivicConnect Ethereal SMTP test',
      text: 'This test confirms the Ethereal SMTP connection is working.',
      html: '<p>This test confirms the <strong>Ethereal SMTP</strong> connection is working.</p>',
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log('Message sent: %s', info.messageId);
    console.log('Preview: %s', previewUrl);
  } finally {
    transporter.close();
  }
}

sendTestEmail().catch((error) => {
  console.error('Ethereal test email failed:', error);
  process.exitCode = 1;
});
