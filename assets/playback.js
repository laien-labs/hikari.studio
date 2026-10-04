// One on-demand Spotify controller survives release navigation.
(() => {
  let dock = document.querySelector('.spotify-dock');
  if (!dock) {
    dock = document.createElement('section');
    dock.className = 'spotify-dock';
    dock.id = 'spotify-player';
    dock.hidden = true;
    dock.setAttribute('aria-label', 'Spotify player');
    dock.innerHTML = '<div class="spotify-dock-heading"><span></span><button class="spotify-close" type="button" aria-label="Close Spotify player">×</button></div><div class="spotify-mount"></div><a class="spotify-fallback" target="_blank" rel="noopener">Open in Spotify ↗</a>';
    document.body.append(dock);
  }
  const mount = dock.querySelector('.spotify-mount');
  const close = dock.querySelector('.spotify-close');
  let apiPromise;
  let controller;
  let generation = 0;
  let active;
  let opening = false;
  function syncTriggers() {
    document.querySelectorAll('.play-button[data-spotify]').forEach(trigger => {
      trigger.setAttribute('aria-expanded', String(!dock.hidden && trigger.dataset.spotify === active?.embed));
    });
  }
  function trackFrom(trigger) {
    try {
      const url = new URL(trigger.dataset.spotify);
      if (url.origin !== 'https://open.spotify.com' || !/^\/embed\/track\/[A-Za-z0-9]{22}$/.test(url.pathname)) return;
      const recording = new URL(url.href);
      recording.pathname = recording.pathname.replace('/embed', '');
      return {embed:url.href, recording:recording.href, title:trigger.dataset.playerTitle,
        label:trigger.closest('.release')?.querySelector('.song')?.textContent || 'Hikari Project'};
    } catch { return; }
  }
  function loadApi() {
    if (apiPromise) return apiPromise;
    const script = document.createElement('script');
    script.src = 'https://open.spotify.com/embed/iframe-api/v1';
    script.async = true;
    apiPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Spotify controls unavailable')), 10000);
      window.onSpotifyIframeApiReady = api => { clearTimeout(timeout); resolve(api); };
      script.onerror = () => { clearTimeout(timeout); reject(new Error('Spotify controls unavailable')); };
      document.body.append(script);
    }).catch(error => { script.remove(); apiPromise = undefined; throw error; });
    return apiPromise;
  }
  function configureFrame() {
    const frame = mount.querySelector('iframe');
    if (!frame || !active) return;
    frame.dataset.testid = 'embed-iframe';
    frame.title = active.title;
    frame.width = '100%';
    frame.height = '152';
    frame.loading = 'lazy';
    frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
    frame.allowFullscreen = true;
  }
  function updateDock() {
    dock.querySelector('.spotify-dock-heading span').textContent = 'Spotify · ' + active.label;
    dock.querySelector('.spotify-fallback').href = active.recording;
    const style = getComputedStyle(document.body);
    for (const name of ['--paper', '--ink', '--muted', '--line']) dock.style.setProperty(name, style.getPropertyValue(name));
    syncTriggers();
    configureFrame();
  }
  function fallback() {
    const frame = document.createElement('iframe');
    frame.src = active.embed;
    mount.replaceChildren(frame);
    configureFrame();
  }
  function dismiss() {
    generation++;
    opening = false;
    controller?.destroy();
    controller = undefined;
    active = undefined;
    mount.replaceChildren();
    dock.hidden = true;
    syncTriggers();
    document.documentElement.classList.remove('spotify-open');
    document.querySelector('.play-button[data-spotify]')?.focus({preventScroll:true});
  }
  async function play(trigger) {
    const track = trackFrom(trigger);
    if (!track) return;
    const sameTrack = active?.embed === track.embed;
    dock.hidden = false;
    document.documentElement.classList.add('spotify-open');
    active = track;
    updateDock();
    // Opening the dock keeps release-navigation keys available on the Play button.
    trigger.focus({preventScroll:true});
    if (controller) {
      try {
        if (!sameTrack) {
          if (controller.loadEntity) controller.loadEntity(track.recording);
          else controller.loadUri('spotify:track:' + new URL(track.recording).pathname.split('/').pop());
        }
        controller.play();
      } catch { controller.destroy(); controller = undefined; fallback(); }
      return;
    }
    if (sameTrack && (opening || mount.querySelector('iframe'))) return;
    const current = ++generation;
    if (mount.querySelector('iframe')) { opening = false; fallback(); return; }
    opening = true;
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = 'Loading Spotify…';
    mount.replaceChildren(status);
    try {
      const api = await loadApi();
      if (current !== generation || dock.hidden) return;
      const host = document.createElement('div');
      mount.replaceChildren(host);
      api.createController(host, {url:track.recording, width:'100%', height:152}, player => {
        if (current !== generation || dock.hidden) { player.destroy(); return; }
        controller = player;
        configureFrame();
        player.addListener('ready', () => { if (!dock.hidden && controller === player) player.play(); });
      });
      configureFrame();
    } catch {
      if (current !== generation || dock.hidden) return;
      fallback();
    } finally { if (current === generation) opening = false; }
  }
  document.addEventListener('click', event => {
    const trigger = event.target instanceof Element ? event.target.closest('.play-button[data-spotify]') : null;
    if (trigger) play(trigger);
  });
  close.addEventListener('click', dismiss);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !dock.hidden) dismiss(); });
  document.addEventListener('hikari:page-change', syncTriggers);
})();
