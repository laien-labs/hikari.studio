// Up/down follows the visible release catalog, including wraparound at each end.
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="slider"],[role="spinbutton"],[role="combobox"]')) return;
  const links = [...document.querySelectorAll('.catalog a')];
  const current = links.findIndex(link => link.getAttribute('aria-current') === 'page');
  if (current < 0 || links.length < 2) return;
  const step = event.key === 'ArrowUp' ? -1 : 1;
  const next = links[(current + step + links.length) % links.length];
  event.preventDefault();
  window.location.assign(next.href);
});
