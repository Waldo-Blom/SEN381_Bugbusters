// To get a live test link run the following command in powershell terminal:
// $env:RUN_ETHEREAL_TEST='true'
// npm test -- --selectProjects unit --runInBand --runTestsByPath src/modules/notifications/__tests__/notifications.test.js

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
  getTestMessageUrl: jest.fn(),
}));

jest.mock('../notifications.model', () => ({
  findRequestStatusDetails: jest.fn(),
}));

jest.mock('../../requests/requests.model', () => ({
  findById: jest.fn(),
  updateStatus: jest.fn(),
}));

const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');
const eventBus = require('../../../shared/events/eventBus');
const notificationsModel = require('../notifications.model');
const emailService = require('../email.service');
const notificationsListener = require('../notifications.listener');
const requestsModel = require('../../requests/requests.model');
const requestsService = require('../../requests/requests.service');
const { getEmailProvider, getEmailTransportOptions } = require('../../../config/env');
const realNodemailer = jest.requireActual('nodemailer');

const sendMail = jest.fn();
const requestDetails = {
  requestId: 'request-1',
  requestName: 'Pothole on Main Street',
  userId: 'user-1',
  requesterName: 'Ava Citizen',
  recipientEmail: 'ava@example.com',
  emailNotificationsEnabled: true,
  requestReference: 'CC-2026-0001',
  department: 'Housing',
  staffName: 'Sam Staff',
};
let previewLog;

const publishAndWait = async (event) => {
  eventBus.emit('RequestStatusChanged', event);
  await new Promise((resolve) => setImmediate(resolve));
};

describe('request status email notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    delete process.env.EMAIL_PROVIDER;
    process.env.EMAIL_HOST = 'smtp.ethereal.email';
    process.env.EMAIL_PORT = '587';
    process.env.EMAIL_USER = 'ethereal-user';
    process.env.EMAIL_PASS = 'ethereal-pass';
    process.env.EMAIL_FROM = 'notifications@example.com';
    previewLog = jest.spyOn(console, 'info').mockImplementation(() => {});
    sendMail.mockResolvedValue({ messageId: 'message-1' });
    nodemailer.createTransport.mockReturnValue({ sendMail });
    nodemailer.getTestMessageUrl.mockReturnValue('https://ethereal.email/message/message-1');
    notificationsModel.findRequestStatusDetails.mockResolvedValue(requestDetails);
  });

  afterEach(() => {
    delete process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_FROM;
    jest.restoreAllMocks();
  });

  it('uses SMTP in development and Gmail in production with environment credentials', () => {
    expect(getEmailTransportOptions()).toEqual({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: 'ethereal-user', pass: 'ethereal-pass' },
    });

    process.env.NODE_ENV = 'production';
    expect(getEmailTransportOptions()).toEqual({
      service: 'gmail',
      auth: { user: 'ethereal-user', pass: 'ethereal-pass' },
    });
  });

  it('allows Gmail to be selected without changing NODE_ENV', () => {
    process.env.NODE_ENV = 'development';
    process.env.EMAIL_PROVIDER = 'gmail';

    expect(getEmailProvider()).toBe('gmail');
    expect(getEmailTransportOptions()).toEqual({
      service: 'gmail',
      auth: { user: 'ethereal-user', pass: 'ethereal-pass' },
    });
  });

  it.each(['SMTP', ' smtp '])('accepts SMTP provider value %j', (provider) => {
    process.env.EMAIL_PROVIDER = provider;

    expect(getEmailProvider()).toBe('smtp');
    expect(getEmailTransportOptions()).toEqual({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: 'ethereal-user', pass: 'ethereal-pass' },
    });
  });

  // Opt in with RUN_ETHEREAL_TEST=true to send a real test email and print its preview link.
  const etherealTest = process.env.RUN_ETHEREAL_TEST === 'true' ? test : test.skip;

  etherealTest(
    'sends the status-change email through Ethereal and prints its preview URL',
    async () => {
      const testAccount = await realNodemailer.createTestAccount();
      const transporter = realNodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });

      try {
        const emailDetails = {
          requesterName: 'Ava Citizen',
          requestName: 'Pothole on Main Street',
          requestId: 'CC-2026-0001',
          previousStatus: 'Submitted',
          newStatus: 'In Progress',
          staffName: 'Sam Staff',
          staffComment: 'The repair team is inspecting the location.',
          department: 'Housing',
        };
        const html = await ejs.renderFile(
          path.join(__dirname, '..', 'templates', 'status-change.ejs'),
          emailDetails
        );
        const text = [
          `Good day ${emailDetails.requesterName},`,
          '',
          `This email is with regards to "${emailDetails.requestName}" with request id of "${emailDetails.requestId}".`,
          '',
          `The status of the request has changed from status ${emailDetails.previousStatus} to ${emailDetails.newStatus}.`,
          '',
          `Staff member '${emailDetails.staffName}' had this to say:`,
          '',
          emailDetails.staffComment,
          '',
          'Kind regards,',
          '',
          `CivicConnect, ${emailDetails.department} department`,
        ].join('\n');
        const info = await transporter.sendMail({
          from: `"CivicConnect Test" <${testAccount.user}>`,
          to: 'recipient@example.com',
          subject: `Update for request ${emailDetails.requestId}: ${emailDetails.newStatus}`,
          text,
          html,
        });
        const previewUrl = realNodemailer.getTestMessageUrl(info);

        console.log('Ethereal preview URL: %s', previewUrl);
        expect(previewUrl).toEqual(expect.stringContaining('ethereal.email/message/'));
      } finally {
        transporter.close();
      }
    },
    60000
  );

  it('renders requester and status details into the email', async () => {
    await emailService.sendStatusChange({
      ...requestDetails,
      previousStatus: 'Submitted',
      newStatus: 'Assigned',
      staffComment: '<script>Reviewing your request</script>',
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: 'ethereal-user', pass: 'ethereal-pass' },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'notifications@example.com',
        to: 'ava@example.com',
        subject: 'Update for request CC-2026-0001: Assigned',
        text: expect.stringContaining(
          'This email is with regards to "Pothole on Main Street" with request id of "CC-2026-0001".'
        ),
        html: expect.stringContaining('Ava Citizen'),
      })
    );
    expect(sendMail.mock.calls[0][0].text).toContain(
      'The status of the request has changed from status Submitted to Assigned.'
    );
    expect(sendMail.mock.calls[0][0].text).toContain("Staff member 'Sam Staff' had this to say:");
    expect(sendMail.mock.calls[0][0].text).toContain('<script>Reviewing your request</script>');
    expect(sendMail.mock.calls[0][0].text).toContain(
      'Kind regards,\n\nCivicConnect, Housing department'
    );
    expect(sendMail.mock.calls[0][0].html).toContain('Submitted');
    expect(sendMail.mock.calls[0][0].html).toContain('Assigned');
    expect(sendMail.mock.calls[0][0].html).toContain('Pothole on Main Street');
    expect(sendMail.mock.calls[0][0].html).toContain('CC-2026-0001');
    expect(sendMail.mock.calls[0][0].html).not.toContain('request-1');
    expect(sendMail.mock.calls[0][0].html).toContain('Sam Staff');
    expect(sendMail.mock.calls[0][0].html).toContain('&lt;script&gt;');
    expect(nodemailer.getTestMessageUrl).toHaveBeenCalledWith({ messageId: 'message-1' });
    expect(previewLog).toHaveBeenCalledWith(
      '[EmailService] Ethereal preview: %s',
      'https://ethereal.email/message/message-1'
    );
  });

  it.each([null, '', '   '])(
    'omits the staff comment introduction when no comment is present (%s)',
    async (staffComment) => {
      await emailService.sendStatusChange({
        ...requestDetails,
        previousStatus: 'Submitted',
        newStatus: 'Assigned',
        staffComment,
      });

      const mail = sendMail.mock.calls[0][0];
      expect(mail.text).toContain(
        'The status of the request has changed from status Submitted to Assigned.'
      );
      expect(mail.text).not.toContain("Staff member 'Sam Staff' had this to say:");
      expect(mail.text).not.toContain('No comment was provided.');
      expect(mail.html).not.toContain("Staff member 'Sam Staff' had this to say:");
      expect(mail.html).not.toContain('No comment was provided.');
      expect(mail.text).toContain('Kind regards,');
      expect(mail.html).toContain('Kind regards,');
    }
  );

  it('retries a transient SMTP failure before succeeding', async () => {
    sendMail
      .mockRejectedValueOnce(
        Object.assign(new Error('SMTP temporarily unavailable'), {
          responseCode: 421,
        })
      )
      .mockResolvedValueOnce({ messageId: 'message-2' });

    await expect(
      emailService.sendStatusChange({
        ...requestDetails,
        previousStatus: 'Submitted',
        newStatus: 'Assigned',
      })
    ).resolves.toEqual({ info: { messageId: 'message-2' }, attempts: 2 });
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('sends an email when a status-change event is published', async () => {
    const unregister = notificationsListener.register();
    try {
      await publishAndWait({
        requestId: 'request-1',
        oldStatus: 'Submitted',
        newStatus: 'Assigned',
        userId: 'staff-1',
        comment: 'Your request has been assigned.',
      });
    } finally {
      unregister();
    }

    expect(notificationsModel.findRequestStatusDetails).toHaveBeenCalledWith(
      'request-1',
      'staff-1'
    );
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ava@example.com' }));
  });

  it('does not send to requesters who disabled email notifications', async () => {
    notificationsModel.findRequestStatusDetails.mockResolvedValue({
      ...requestDetails,
      emailNotificationsEnabled: false,
    });
    const unregister = notificationsListener.register();
    try {
      await publishAndWait({
        requestId: 'request-1',
        oldStatus: 'Submitted',
        newStatus: 'Rejected',
        userId: 'staff-1',
        comment: 'This request cannot be processed.',
      });
    } finally {
      unregister();
    }

    expect(sendMail).not.toHaveBeenCalled();
  });

  it('keeps the request update successful but loses the email after SMTP delivery fails', async () => {
    const updatedRequest = { id: 'request-1', status: 'Assigned' };
    requestsModel.findById.mockResolvedValue({ id: 'request-1', status: 'Submitted' });
    requestsModel.updateStatus.mockResolvedValue(updatedRequest);
    sendMail.mockRejectedValue(
      Object.assign(new Error('Mailbox rejected the message'), {
        responseCode: 550,
        code: 'EENVELOPE',
      })
    );
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    const unregister = notificationsListener.register();

    try {
      await expect(
        requestsService.workflow.transitionRequest('request-1', 'Assigned', 'staff-1')
      ).resolves.toBe(updatedRequest);
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      unregister();
    }

    expect(requestsModel.updateStatus).toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('it will not be retried after this event:'),
      'Mailbox rejected the message'
    );
  });
});
