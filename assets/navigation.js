// Change the release scene without removing the persistent Spotify dock.
(() => {
  if (!document.getElementById('site-page')) return;
  const revision = document.querySelector('meta[name="hikari-navigation-revision"]')?.content;
  const root = new URL('../', document.currentScript.src);
  const routes = new Set([root.pathname, new URL('index.html', root).pathname,
    ...[...document.querySelectorAll('.catalog a')].map(link => new URL(link.href).pathname)]);
  const cache = new Map();
  const requests = new Map();
  const images = new Map();
  let warming = false;
  let warmScheduled = false;
  let warmQueue = [];
  let pending;
  let sequence = 0;
  let renderedPath = location.pathname;
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap';
  document.body.append(status);
  // Retain the first page too, so Back/home can reuse it without another request.
  cache.set(location.href, document.documentElement.outerHTML);
  if ([root.pathname, new URL('index.html', root).pathname].includes(location.pathname)) {
    cache.set(root.href, document.documentElement.outerHTML);
    cache.set(new URL('index.html', root).href, document.documentElement.outerHTML);
  }
  function readPage(url, priority = 'auto') {
    if (cache.has(url.href)) return Promise.resolve(cache.get(url.href));
    if (requests.has(url.href)) return requests.get(url.href);
    const request = fetch(url.href, {headers:{Accept:'text/html'}, priority})
      .then(async response => {
        if (!response.ok || new URL(response.url).pathname !== url.pathname) throw Error('Release unavailable');
        const html = await response.text();
        if (!html.includes('name="hikari-navigation-revision" content="' + revision + '"')) throw Error('Release version changed');
        cache.set(url.href, html);
        return html;
      }).finally(() => requests.delete(url.href));
    requests.set(url.href, request);
    return request;
  }
  function parsePage(html) {
    // Keep parsed pages inert until needed; otherwise hidden/unselected images can download.
    return new DOMParser().parseFromString(html.replace(/\b(src|srcset)="/g, 'data-hikari-$1="'), 'text/html');
  }
  const imageSource = image => image?.getAttribute('data-hikari-src') || image?.getAttribute('src');
  function sceneAssets(page, url) {
    const source = [...page.querySelectorAll('.scene source')].find(source => matchMedia(source.media).matches);
    const srcset = source?.getAttribute('data-hikari-srcset') || source?.getAttribute('srcset');
    const background = srcset?.split(',')[0].trim().split(/\s+/)[0] || imageSource(page.querySelector('.scene img'));
    const textures = [...page.querySelectorAll('.cloud-layer img')].map(imageSource);
    if (matchMedia('(min-width:1100px)').matches) textures.push(imageSource(page.querySelector('.track-texture')));
    return [...new Set([background, ...textures].filter(Boolean).map(asset => new URL(asset, url).href))];
  }
  function warmImage(url, priority) {
    if (images.has(url)) {
      const stored = images.get(url);
      if (priority === 'high') stored.image.fetchPriority = 'high';
      return stored.ready;
    }
    const image = new Image();
    image.fetchPriority = priority;
    image.decoding = 'async';
    image.src = url;
    const ready = image.decode().catch(() => { images.delete(url); });
    images.set(url, {image, ready});
    return ready;
  }
  function warmScene(page, url, priority) {
    return Promise.all(sceneAssets(page, url).map(asset => warmImage(asset, priority)));
  }
  async function warmPage(url, priority = 'low') {
    try {
      const html = await readPage(url, priority);
      const page = parsePage(html);
      await warmScene(page, url, priority);
    } catch { /* A failed speculative load never interrupts the current page. */ }
  }
  function scheduleWarmup() {
    if (warming || warmScheduled || !warmQueue.length) return;
    warmScheduled = true;
    const run = async () => {
      warmScheduled = false;
      if (warming || document.hidden) return;
      if (pending) { setTimeout(scheduleWarmup, 250); return; }
      const url = warmQueue.shift();
      if (!url) return;
      warming = true;
      await warmPage(url);
      warming = false;
      scheduleWarmup();
    };
    if ('requestIdleCallback' in window) requestIdleCallback(run, {timeout:1000});
    else setTimeout(run, 100);
  }
  function queueNearby() {
    if (navigator.connection?.saveData) return;
    const links = [...document.querySelectorAll('.catalog a')];
    const current = links.findIndex(link => link.getAttribute('aria-current') === 'page');
    const order = [];
    for (let distance = 1; distance <= links.length; distance++) {
      for (const direction of [1,-1]) {
        const link = links[(Math.max(0,current) + direction * distance + links.length) % links.length];
        if (link && !order.includes(link.href)) order.push(link.href);
      }
    }
    warmQueue = order.map(href => new URL(href));
    scheduleWarmup();
  }
  if (document.readyState === 'complete') queueNearby();
  else window.addEventListener('load', queueNearby, {once:true});
  matchMedia('(min-width:1100px)').addEventListener('change', queueNearby);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleWarmup(); });
  for (const type of ['pointerover','focusin','touchstart']) document.addEventListener(type, event => {
    const link = event.target instanceof Element ? event.target.closest('.catalog a[href]') : null;
    if (link) warmPage(new URL(link.href), 'auto');
  }, {passive:true});
  function revealCurrent() {
    if (!document.body.classList.contains('catalog-expanded') || !matchMedia('(min-width:1100px)').matches) return;
    const list = document.querySelector('.catalog ol');
    const current = list?.querySelector('[aria-current="page"]');
    if (current) {
      const row = current.getBoundingClientRect(), bounds = list.getBoundingClientRect();
      if (row.bottom > bounds.bottom) list.scrollTop += row.bottom - bounds.bottom;
      else if (row.top < bounds.top) list.scrollTop -= bounds.top - row.top;
    }
  }
  revealCurrent();
  function internal(url) {
    return url.origin === location.origin && routes.has(url.pathname) && !url.search && !url.hash;
  }
  function resolveAssets(page, url) {
    for (const element of page.querySelectorAll('[href],[data-hikari-src],[data-hikari-srcset]')) {
      for (const name of ['href', 'data-hikari-src']) {
        const value = element.getAttribute(name);
        if (value && !value.startsWith('#')) element.setAttribute(name, new URL(value, url).href);
      }
      const srcset = element.getAttribute('data-hikari-srcset');
      if (srcset) element.setAttribute('data-hikari-srcset', srcset.split(',').map(source => {
        const [file, ...descriptor] = source.trim().split(/\s+/);
        return [new URL(file, url).href, ...descriptor].join(' ');
      }).join(', '));
    }
  }
  function activateAssets(page) {
    for (const element of page.querySelectorAll('[data-hikari-src],[data-hikari-srcset]')) {
      for (const name of ['srcset','src']) {
        const value = element.getAttribute('data-hikari-' + name);
        if (value) { element.setAttribute(name,value); element.removeAttribute('data-hikari-' + name); }
      }
    }
  }
  async function navigate(url, {historyMode = 'push', focusCatalog = false} = {}) {
    if (!internal(url)) { location.assign(url.href); return; }
    pending?.abort();
    const request = pending = new AbortController();
    const current = ++sequence;
    const oldShell = document.getElementById('site-page');
    oldShell.setAttribute('aria-busy', 'true');
    try {
      const html = await readPage(url);
      const page = parsePage(html);
      const next = page.getElementById('site-page');
      if (!next?.querySelector('#release') || !next.querySelector('.catalog') ||
        page.querySelector('meta[name="hikari-navigation-revision"]')?.content !== revision) throw Error('Release version changed');
      resolveAssets(next, url);
      // Prepare both the artwork and its textures before displaying the new scene.
      await warmScene(next, url, 'high');
      if (current !== sequence || request.signal.aborted) return;
      cache.set(url.href, html);
      if (historyMode === 'push') history.pushState(null, '', url.href);
      const keepFocus = document.activeElement?.closest('.spotify-dock');
      // Never move or reparent the dock: that would reload its cross-origin iframe.
      oldShell.replaceWith(next);
      activateAssets(next);
      renderedPath = url.pathname;
      document.body.className = page.body.className;
      document.body.setAttribute('style', page.body.getAttribute('style') || '');
      document.title = page.title;
      for (const selector of ['meta[name="description"]', 'meta[name="hikari-preview-revision"]', 'link[rel="canonical"]']) {
        const existing = document.head.querySelector(selector);
        const replacement = page.head.querySelector(selector)?.cloneNode(true);
        if (replacement?.matches('link')) replacement.href = new URL(replacement.getAttribute('href'), url).href;
        if (existing && replacement) existing.replaceWith(replacement);
        else if (replacement) document.head.append(replacement);
        else existing?.remove();
      }
      const fragment = historyMode === 'none' && location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
      if (fragment) fragment.scrollIntoView({block:'start',behavior:'instant'});
      else window.scrollTo({top:0, left:0, behavior:'instant'});
      revealCurrent();
      if (!keepFocus) {
        const focus = focusCatalog ? next.querySelector('.catalog a[aria-current="page"]') : next.querySelector('h1');
        if (focus) { if (!focus.matches('a')) focus.tabIndex = -1; focus.focus({preventScroll:true}); }
      }
      status.textContent = next.querySelector('.song')?.textContent + ' by ' + next.querySelector('h1')?.textContent;
      document.dispatchEvent(new CustomEvent('hikari:page-change'));
      queueNearby();
    } catch (error) {
      if (error.name !== 'AbortError' && current === sequence) location.assign(url.href);
    } finally {
      if (current === sequence) { pending = undefined; document.getElementById('site-page')?.removeAttribute('aria-busy'); }
    }
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self') || !link.closest('#site-page')) return;
    const url = new URL(link.href);
    if (!internal(url)) return;
    event.preventDefault();
    if (url.href === location.href) { pending?.abort(); sequence++; document.getElementById('site-page').removeAttribute('aria-busy'); return; }
    navigate(url, {focusCatalog:!!link.closest('.catalog')});
  });
  window.addEventListener('popstate', () => {
    const url = new URL(location.href);
    if (url.pathname === renderedPath) { pending?.abort(); sequence++; document.getElementById('site-page').removeAttribute('aria-busy'); return; }
    url.hash = '';
    navigate(url, {historyMode:'none'});
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="slider"],[role="spinbutton"],[role="combobox"],.spotify-dock')) return;
    let links = [...document.querySelectorAll('.catalog a')];
    const selected = links.find(link => link.getAttribute('aria-current') === 'page');
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      const persona = selected?.querySelector('.catalog-persona')?.textContent.trim();
      if (!persona) return;
      links = links.filter(link => link.querySelector('.catalog-persona')?.textContent.trim() === persona)
        .sort((a,b) => Number(a.querySelector('.number').textContent) - Number(b.querySelector('.number').textContent));
    }
    const current = links.indexOf(selected);
    if (current < 0 || links.length < 2) return;
    const step = ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1;
    event.preventDefault();
    navigate(new URL(links[(current + step + links.length) % links.length].href), {focusCatalog:true});
  });
})();
