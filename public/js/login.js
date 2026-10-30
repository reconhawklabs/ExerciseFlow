// Sign-in page: show the right message, and the exercise name once known.
const MESSAGES = { wait: 'Too many tries. Wait a moment, then try again.' };
const reason = new URLSearchParams(location.search).get('error');
if (reason) {
  const error = document.getElementById('error');
  error.textContent = MESSAGES[reason] ?? 'Incorrect password';
  error.hidden = false;
}
fetch('/api/brand')
  .then((res) => (res.ok ? res.json() : null))
  .then((brand) => {
    if (!brand?.name) return;
    document.getElementById('brand').textContent = brand.name;
    document.title = `Sign in · ${brand.name}`;
  })
  .catch(() => {});
