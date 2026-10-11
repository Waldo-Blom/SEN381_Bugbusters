const eventBus = require('../../shared/events/eventBus');
const emailService = require('./email.service');
const notificationsModel = require('./notifications.model');

const handleRequestStatusChanged = async (event) => {
  try {
    const details = await notificationsModel.findRequestStatusDetails(
      event.requestId,
      event.userId
    );
    if (!details) {
      throw new Error(`Cannot notify for missing request ${event.requestId}.`);
    }

    if (!details.emailNotificationsEnabled) {
      return;
    }

    if (!details.recipientEmail) {
      console.warn(
        `[NotificationService] Cannot send status update for request ${event.requestId}: requester has no email address.`
      );
      return;
    }

    await emailService.sendStatusChange({
      ...details,
      previousStatus: event.oldStatus,
      newStatus: event.newStatus,
      staffComment: event.comment,
    });
  } catch (error) {
    console.error(
      `[NotificationService] Failed to send status update for request ${event.requestId}; it will not be retried after this event:`,
      error.message
    );
  }
};

const register = () => {
  eventBus.on('RequestStatusChanged', handleRequestStatusChanged);
  return () => eventBus.off('RequestStatusChanged', handleRequestStatusChanged);
};

module.exports = {
  register,
  handleRequestStatusChanged,
};
