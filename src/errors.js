/**
 * A refused request; the message is safe to show to the user. status is the HTTP status to send.
 * reason is an optional short code a page can switch on (e.g. 'short' for a too-short password).
 */
export class UserError extends Error {
  constructor(message, status = 400, reason = undefined) {
    super(message);
    this.name = 'UserError';
    this.status = status;
    this.reason = reason;
  }
}
