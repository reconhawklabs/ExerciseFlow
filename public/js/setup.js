// First-time setup page: explain why the last attempt was refused.
const MESSAGES = {
  code: 'That setup code is not right. Check the window where the app was started.',
  short: 'The password must be at least 8 characters.',
  mismatch: 'The two passwords do not match.',
};
const reason = new URLSearchParams(location.search).get('error');
if (reason) {
  const error = document.getElementById('error');
  error.textContent = MESSAGES[reason] ?? 'Something went wrong. Try again.';
  error.hidden = false;
}
