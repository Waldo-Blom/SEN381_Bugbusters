const EventEmitter = require('events');
const { randomUUID } = require('crypto');

class AuditEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20); // Allow more listeners for audit events
  }

  /**
   * Emit an audit event with standard payload structure
   * @param {string} eventName - Name of the event (e.g., 'RequestStatusChanged', 'RequestAssigned')
   * @param {Object} payload - Event payload
   */
  emitAuditEvent(eventName, payload = {}) {
    const enrichedPayload = {
      ...payload,
      eventName,
      timestamp: payload.timestamp || new Date(),
      traceId: payload.traceId || randomUUID(),
    };
    this.emit(eventName, enrichedPayload);
    return enrichedPayload;
  }
}

module.exports = new AuditEventBus();
