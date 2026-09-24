// Shared by all public pages: mobile nav menu toggle
document.querySelectorAll('[data-nav-toggle]').forEach(btn =>
  btn.addEventListener('click', () => document.querySelector('.nav-links').classList.toggle('open')));
