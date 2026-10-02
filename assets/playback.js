// Load and control Spotify only after the listener presses Play.
const trigger = document.querySelector('.play-button[data-spotify]');
const dock = document.querySelector('.spotify-dock');
if (trigger && dock) {
  const mount = dock.querySelector('.spotify-mount');
  const close = dock.querySelector('.spotify-close');
  let apiPromise;
  let controller;
  let generation = 0;
  let opening = false;

  function loadApi() {
    if (apiPromise) return apiPromise;
    const script = document.createElement('script');
    script.src = 'https://open.spotify.com/embed/iframe-api/v1';
    script.async = true;
    apiPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Spotify controls unavailable')), 10000);
      window.onSpotifyIframeApiReady = api => {
        clearTimeout(timeout);
        resolve(api);
      };
      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Spotify controls unavailable'));
      };
      document.body.append(script);
    }).catch(error => {
      script.remove();
      apiPromise = undefined;
      throw error;
    });
    return apiPromise;
  }

  function configureFrame(frame) {
    if (!frame) return;
    frame.dataset.testid = 'embed-iframe';
    frame.title = trigger.dataset.playerTitle;
    frame.width = '100%';
    frame.height = '152';
    frame.loading = 'lazy';
    frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
    frame.allowFullscreen = true;
  }

  function dismiss() {
    generation++;
    opening = false;
    if (controller) controller.destroy();
    controller = undefined;
    mount.replaceChildren();
    dock.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener('click', async () => {
    const url = new URL(trigger.dataset.spotify);
    if (url.origin !== 'https://open.spotify.com' || !/^\/embed\/track\/[A-Za-z0-9]{22}$/.test(url.pathname)) return;
    dock.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    close.focus({ preventScroll: true });
    if (controller) {
      controller.play();
      return;
    }
    if (opening || mount.querySelector('iframe')) return;
    opening = true;
    const current = ++generation;
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = 'Loading Spotify…';
    mount.replaceChildren(status);
    try {
      const api = await loadApi();
      if (current !== generation || dock.hidden) return;
      const host = document.createElement('div');
      mount.replaceChildren(host);
      const trackUrl = new URL(url.href);
      trackUrl.pathname = trackUrl.pathname.replace('/embed', '');
      api.createController(host, { url: trackUrl.href, width: '100%', height: 152 }, player => {
        if (current !== generation || dock.hidden) {
          player.destroy();
          return;
        }
        controller = player;
        configureFrame(mount.querySelector('iframe'));
        player.addListener('ready', () => {
          if (current === generation && !dock.hidden) player.play();
        });
      });
      configureFrame(mount.querySelector('iframe'));
    } catch {
      if (current !== generation || dock.hidden) return;
      // Keep Spotify's normal play control available if its control API cannot load.
      const frame = document.createElement('iframe');
      frame.src = url.href;
      configureFrame(frame);
      mount.replaceChildren(frame);
    } finally {
      if (current === generation) opening = false;
    }
  });
  close.addEventListener('click', dismiss);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !dock.hidden) dismiss();
  });
}
