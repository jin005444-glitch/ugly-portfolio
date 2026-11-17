/* ============================================================
   UGLY — PORTFOLIO 2026
   Vanilla JS: curtain, navigation, reveals, work viewer,
   contact brief, page transitions, custom cursor.
   ============================================================ */
(() => {
  'use strict';

  const doc = document.documentElement;
  const body = document.body;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----------------------------------------------------------
     LIVE CLOCK — THE VISITOR'S LOCAL TIME
     ---------------------------------------------------------- */
  const clockFormat = (() => {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch {
      return null;
    }
  })();

  function updateClocks() {
    const now = new Date();
    const value = clockFormat
      ? clockFormat.format(now)
      : String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    document.querySelectorAll('[data-clock]').forEach(el => { el.textContent = value; });
  }
  updateClocks();
  window.setInterval(updateClocks, 30000);

  /* ----------------------------------------------------------
     PAGE CURTAIN + READY STATE
     ---------------------------------------------------------- */
  const curtain = document.querySelector('.page-curtain');

  function hideCurtain() {
    if (curtain) curtain.classList.add('is-gone');
  }

  function markReady() {
    body.classList.add('is-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.setTimeout(hideCurtain, 280);
      window.setTimeout(markReady, 240);
    });
  } else {
    window.setTimeout(hideCurtain, 280);
    window.setTimeout(markReady, 240);
  }

  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      hideCurtain();
      markReady();
      body.classList.remove('is-locked');
    }
  });

  /* ----------------------------------------------------------
     HEADER — SOLID ON SCROLL
     ---------------------------------------------------------- */
  const head = document.querySelector('.site-head');
  let scrollQueued = false;

  function setHeaderState() {
    scrollQueued = false;
    if (!head) return;
    head.classList.toggle('is-scrolled', window.scrollY > 24);
  }

  if (head) {
    setHeaderState();
    window.addEventListener('scroll', () => {
      if (!scrollQueued) {
        scrollQueued = true;
        window.requestAnimationFrame(setHeaderState);
      }
    }, { passive: true });
  }

  /* ----------------------------------------------------------
     FULLSCREEN MENU
     ---------------------------------------------------------- */
  const menuBtn = document.querySelector('.menu-btn');
  const menuPanel = document.querySelector('.menu-panel');
  const menuClose = document.querySelector('.menu-close');
  let menuOpen = false;
  let lastFocused = null;

  function getMenuFocusables() {
    if (!menuPanel) return [];
    return [...menuPanel.querySelectorAll('a[href], button:not([disabled])')].filter(el => el.offsetParent !== null);
  }

  function openMenu() {
    if (!menuPanel || menuOpen) return;
    menuOpen = true;
    lastFocused = document.activeElement;
    body.classList.add('menu-open', 'is-locked');
    menuPanel.setAttribute('aria-hidden', 'false');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
    window.setTimeout(() => {
      const focusables = getMenuFocusables();
      if (focusables.length) focusables[0].focus({ preventScroll: true });
    }, 260);
  }

  function closeMenu(restoreFocus = true) {
    if (!menuPanel || !menuOpen) return;
    menuOpen = false;
    body.classList.remove('menu-open', 'is-locked');
    menuPanel.setAttribute('aria-hidden', 'true');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) {
      const target = lastFocused && lastFocused !== document.body && typeof lastFocused.focus === 'function'
        ? lastFocused
        : menuBtn;
      window.setTimeout(() => { if (target) target.focus({ preventScroll: true }); }, 120);
    }
  }

  menuBtn?.addEventListener('click', openMenu);
  menuClose?.addEventListener('click', () => closeMenu());

  document.addEventListener('keydown', event => {
    if (!menuOpen) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key === 'Tab') {
      const focusables = getMenuFocusables();
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  /* ----------------------------------------------------------
     SCROLL REVEALS
     ---------------------------------------------------------- */
  const revealEls = [...document.querySelectorAll('.reveal')];

  if (revealEls.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      revealEls.forEach(el => el.classList.add('is-in'));
    } else {
      const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });

      const viewportH = window.innerHeight;
      const aboveFold = [];

      revealEls.forEach(el => {
        if (el.getBoundingClientRect().top < viewportH * 0.94) {
          aboveFold.push(el);
        } else {
          io.observe(el);
        }
      });

      window.setTimeout(() => {
        aboveFold.forEach((el, i) => {
          window.setTimeout(() => el.classList.add('is-in'), i * 70);
        });
      }, 420);
    }
  }

  /* ----------------------------------------------------------
     WORK — GRID / INDEX TOGGLE
     ---------------------------------------------------------- */
  const workGrid = document.getElementById('work-grid');
  const viewButtons = [...document.querySelectorAll('[data-view]')];

  viewButtons.forEach(button => {
    button.addEventListener('click', () => {
      if (!workGrid) return;
      const mode = button.dataset.view;
      const isIndex = mode === 'index';
      workGrid.classList.toggle('is-index', isIndex);
      viewButtons.forEach(btn => {
        btn.setAttribute('aria-pressed', String(btn === button));
      });
    });
  });

  /* ----------------------------------------------------------
     WORK — LIGHTBOX
     ---------------------------------------------------------- */
  const lightbox = document.querySelector('.lightbox');
  const lightboxImg = document.querySelector('.lightbox-img');
  const lightboxIndexEl = document.querySelector('[data-lightbox-index]');
  const lightboxTitleEl = document.querySelector('[data-lightbox-title]');
  const lightboxTagEl = document.querySelector('[data-lightbox-tag]');
  const lightboxClose = document.querySelector('.lightbox-close');
  const lightboxPrev = document.querySelector('[data-lightbox-prev]');
  const lightboxNext = document.querySelector('[data-lightbox-next]');
  const workTriggers = [...document.querySelectorAll('.work-trigger')];

  /* ----------------------------------------------------------
     WORK — COUNTS + GALLERY MOTION
     Work.html is the single source of truth. The gallery page
     counts its own items; other pages read Work.html once, so
     adding a piece updates every "27" without extra edits.
     ---------------------------------------------------------- */
  const workTotalEls = [...document.querySelectorAll('[data-work-total]')];

  function paintWorkTotal(total) {
    if (!total) return;
    workTotalEls.forEach(el => { el.textContent = String(total); });
  }

  if (workTotalEls.length) {
    const localTotal = document.querySelectorAll('.work-item').length;
    if (localTotal) {
      paintWorkTotal(localTotal);
    } else {
      fetch('Work.html', { cache: 'no-store' })
        .then(response => {
          if (!response.ok) throw new Error('count fetch failed');
          return response.text();
        })
        .then(html => {
          const total = new DOMParser()
            .parseFromString(html, 'text/html')
            .querySelectorAll('.work-item').length;
          paintWorkTotal(total);
        })
        .catch(() => { /* keep the hard-coded fallback */ });
    }
  }

  /* Pointer-tracked tilt + sheen. Skipped for touch and reduced motion. */
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  if (!reduceMotion && finePointer.matches) {
    workTriggers.forEach(btn => {
      const media = btn.querySelector('.work-media');
      if (!media) return;

      let frame = 0;
      let px = 0;
      let py = 0;

      const apply = () => {
        frame = 0;
        const rect = media.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const nx = clamp((px - rect.left) / rect.width, 0, 1);
        const ny = clamp((py - rect.top) / rect.height, 0, 1);
        media.style.setProperty('--mx', (nx * 100).toFixed(1) + '%');
        media.style.setProperty('--my', (ny * 100).toFixed(1) + '%');
        media.style.setProperty('--ry', ((nx - .5) * 8).toFixed(2) + 'deg');
        media.style.setProperty('--rx', ((.5 - ny) * 7).toFixed(2) + 'deg');
      };

      const track = event => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        px = event.clientX;
        py = event.clientY;
        if (!frame) frame = requestAnimationFrame(apply);
      };

      const reset = immediate => {
        if (frame) { cancelAnimationFrame(frame); frame = 0; }
        media.style.setProperty('--mx', '50%');
        media.style.setProperty('--my', '50%');
        media.style.setProperty('--rx', '0deg');
        media.style.setProperty('--ry', '0deg');
        if (immediate) {
          media.style.transition = 'none';
          void media.offsetWidth;
          media.style.transition = '';
        }
      };

      btn.addEventListener('pointerenter', track, { passive: true });
      btn.addEventListener('pointermove', track, { passive: true });
      btn.addEventListener('pointerleave', () => reset(false), { passive: true });
      btn.addEventListener('blur', () => reset(false));
      btn.__tiltReset = reset;
    });
  }

  if (lightbox && lightboxImg && workTriggers.length) {
    const items = workTriggers.map(btn => {
      const img = btn.querySelector('img');
      return {
        btn,
        img,
        src: img.currentSrc || img.src,
        alt: img.alt || btn.dataset.title || 'Artwork',
        title: btn.dataset.title || 'Untitled',
        tag: btn.dataset.tag || 'Selected work',
        w: img.naturalWidth || Number(img.getAttribute('width')) || 1,
        h: img.naturalHeight || Number(img.getAttribute('height')) || 1
      };
    });

    const lightboxTotalEls = [...document.querySelectorAll('[data-lightbox-total]')];
    lightboxTotalEls.forEach(el => {
      el.textContent = String(items.length).padStart(2, '0');
    });

    let current = 0;
    let isOpen = false;
    let busy = false;
    let lastTrigger = null;
    let swapTimer = 0;
    let inertTargets = [];

    function metrics(item) {
      const maxW = window.innerWidth * 0.86;
      const maxH = window.innerHeight * 0.72;
      const scale = Math.min(maxW / item.w, maxH / item.h, 2);
      return { w: Math.max(80, item.w * scale), h: Math.max(80, item.h * scale) };
    }

    function place(item) {
      const m = metrics(item);
      lightboxImg.style.width = m.w + 'px';
      lightboxImg.style.height = m.h + 'px';
      lightboxImg.style.left = (window.innerWidth - m.w) / 2 + 'px';
      lightboxImg.style.top = (window.innerHeight - m.h) / 2 - (window.innerHeight * 0.015) + 'px';
      return m;
    }

    function updateLabels() {
      const item = items[current];
      if (lightboxIndexEl) lightboxIndexEl.textContent = String(current + 1).padStart(2, '0');
      if (lightboxTitleEl) lightboxTitleEl.textContent = item.title;
      if (lightboxTagEl) lightboxTagEl.textContent = item.tag;
    }

    function openLightbox(i) {
      if (busy) return;
      current = i;
      const item = items[current];
      lastTrigger = item.btn;

      lightboxImg.src = item.src;
      lightboxImg.alt = item.alt;

      lightboxImg.style.transition = 'none';
      const m = place(item);

      const start = item.img.getBoundingClientRect();
      const dx = start.left + start.width / 2 - window.innerWidth / 2;
      const dy = start.top + start.height / 2 - (parseFloat(lightboxImg.style.top) + m.h / 2);
      const sx = start.width / m.w;
      const sy = start.height / m.h;

      lightboxImg.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      lightboxImg.style.opacity = '1';

      lightbox.classList.add('is-open');
      lightbox.setAttribute('aria-hidden', 'false');
      body.classList.add('is-locked');
      isOpen = true;
      updateLabels();

      // Keep screen readers and Tab focus inside the viewer.
      inertTargets = [document.querySelector('main'), document.querySelector('.site-foot'), document.querySelector('.site-head')].filter(Boolean);
      inertTargets.forEach(el => { el.inert = true; });

      // Commit the start frame, then hand the transform to CSS so the
      // browser animates from the thumbnail to the centre. Doing this
      // synchronously (instead of in rAF) keeps it reliable when the
      // tab is backgrounded or throttled.
      void lightboxImg.offsetWidth;
      lightboxImg.style.transition = '';
      lightboxImg.style.transform = 'translate(0, 0) scale(1)';

      window.setTimeout(() => {
        lightboxClose?.focus({ preventScroll: true });
      }, 80);
    }

    function swapTo(i) {
      if (busy) return;
      current = (i + items.length) % items.length;
      const item = items[current];
      updateLabels();

      window.clearTimeout(swapTimer);
      lightboxImg.style.opacity = '0';
      lightboxImg.style.transform = 'scale(.985)';

      swapTimer = window.setTimeout(() => {
        const probe = new Image();
        probe.onload = () => {
          lightboxImg.src = item.src;
          lightboxImg.alt = item.alt;
          place(item);
          lightboxImg.style.transform = 'scale(1)';
          lightboxImg.style.opacity = '1';
        };
        probe.onerror = () => {
          lightboxImg.src = item.src;
          place(item);
          lightboxImg.style.transform = 'scale(1)';
          lightboxImg.style.opacity = '1';
        };
        probe.src = item.src;
      }, 150);
    }

    function closeLightbox() {
      if (!isOpen) return;
      busy = true;
      isOpen = false;

      const item = items[current];
      const end = item.img.getBoundingClientRect();
      const m = metrics(item);
      const left = (window.innerWidth - m.w) / 2;
      const top = (window.innerHeight - m.h) / 2 - (window.innerHeight * 0.015);
      const dx = end.left + end.width / 2 - (left + m.w / 2);
      const dy = end.top + end.height / 2 - (top + m.h / 2);
      const sx = Math.max(0.04, end.width / m.w);
      const sy = Math.max(0.04, end.height / m.h);

      lightboxImg.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

      window.setTimeout(() => {
        lightbox.classList.remove('is-open');
        lightbox.setAttribute('aria-hidden', 'true');
        body.classList.remove('is-locked');
        lightboxImg.style.transition = 'none';
        lightboxImg.style.transform = '';
        lightboxImg.style.opacity = '';
        lightboxImg.style.width = '';
        lightboxImg.style.height = '';
        lightboxImg.style.left = '';
        lightboxImg.style.top = '';
        lightboxImg.removeAttribute('src');
        void lightboxImg.offsetWidth;
        lightboxImg.style.transition = '';
        busy = false;
        inertTargets.forEach(el => { el.inert = false; });
        inertTargets = [];
        if (lastTrigger) lastTrigger.focus({ preventScroll: true });
      }, 560);
    }

    workTriggers.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        if (btn.__tiltReset) btn.__tiltReset(true);
        openLightbox(i);
      });
    });

    lightboxClose?.addEventListener('click', closeLightbox);
    lightboxPrev?.addEventListener('click', () => swapTo(current - 1));
    lightboxNext?.addEventListener('click', () => swapTo(current + 1));
    lightbox.querySelector('.lightbox-backdrop')?.addEventListener('click', closeLightbox);

    document.addEventListener('keydown', event => {
      if (!isOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLightbox();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        swapTo(current - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        swapTo(current + 1);
      } else if (event.key === 'Tab') {
        const focusables = [lightboxClose, lightboxPrev, lightboxNext].filter(Boolean);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        } else if (!focusables.includes(document.activeElement)) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    window.addEventListener('resize', () => {
      if (!isOpen || busy) return;
      const item = items[current];
      lightboxImg.style.transition = 'none';
      place(item);
      lightboxImg.style.transform = 'translate(0, 0) scale(1)';
      void lightboxImg.offsetWidth;
      lightboxImg.style.transition = '';
    });
  }

  /* ----------------------------------------------------------
     CONTACT — MAILTO BRIEF
     ---------------------------------------------------------- */
  const form = document.getElementById('contact-form');

  if (form) {
    const status = document.getElementById('form-status');
    const name = form.querySelector('#name');
    const email = form.querySelector('#email');
    const message = form.querySelector('#message');
    const project = form.querySelector('#project');
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function markField(input, invalid) {
      input?.closest('.field')?.classList.toggle('is-invalid', invalid);
    }

    form.addEventListener('submit', event => {
      event.preventDefault();

      const nameValue = name ? name.value.trim() : '';
      const emailValue = email ? email.value.trim() : '';
      const messageValue = message ? message.value.trim() : '';

      const nameInvalid = nameValue.length < 2;
      const emailInvalid = !emailPattern.test(emailValue);
      const messageInvalid = messageValue.length < 10;

      markField(name, nameInvalid);
      markField(email, emailInvalid);
      markField(message, messageInvalid);

      if (nameInvalid || emailInvalid || messageInvalid) {
        if (status) {
          status.classList.add('is-error');
          status.textContent = 'Please add your name, a valid email and a few details about the idea.';
        }
        const firstInvalid = form.querySelector('.field.is-invalid input, .field.is-invalid textarea');
        firstInvalid?.focus();
        return;
      }

      const projectValue = project ? project.value : 'General enquiry';
      const subject = `Project enquiry — ${nameValue}`;
      const bodyText =
        `Name: ${nameValue}\n` +
        `Email: ${emailValue}\n` +
        `Project: ${projectValue}\n\n` +
        `${messageValue}\n`;

      const mailto = 'mailto:jin005444@gmail.com'
        + '?subject=' + encodeURIComponent(subject)
        + '&body=' + encodeURIComponent(bodyText);

      window.location.href = mailto;

      if (status) {
        status.classList.remove('is-error');
        status.innerHTML = 'Opening your email app… If nothing happens, write to '
          + '<a href="mailto:jin005444@gmail.com">jin005444@gmail.com</a>.';
      }
    });

    [name, email, message].forEach(input => {
      input?.addEventListener('input', () => markField(input, false));
    });
  }

  /* ----------------------------------------------------------
     PAGE TRANSITIONS
     ---------------------------------------------------------- */
  const transitionMs = reduceMotion ? 0 : 420;

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;
    if (
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:') ||
      link.hasAttribute('download') ||
      link.target === '_blank'
    ) return;

    let destination;
    try {
      destination = new URL(href, window.location.href);
    } catch {
      return;
    }

    if (destination.origin !== window.location.origin) return;
    if (destination.pathname === window.location.pathname) return;

    event.preventDefault();

    if (menuOpen) closeMenu(false);
    body.classList.add('is-locked');

    if (curtain && !reduceMotion) {
      curtain.classList.remove('is-gone');
      window.setTimeout(() => { window.location.href = destination.href; }, transitionMs);
    } else {
      window.location.href = destination.href;
    }
  });

  /* ----------------------------------------------------------
     CUSTOM CURSOR
     ---------------------------------------------------------- */
  const cursor = document.querySelector('.cursor');
  const dot = document.querySelector('.cursor-dot');

  if (cursor && dot && window.matchMedia('(pointer: fine)').matches && !reduceMotion) {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;
    let started = false;

    function placeDot() {
      dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
    }

    function render() {
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.18;
      cursor.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
      window.requestAnimationFrame(render);
    }

    window.addEventListener('mousemove', event => {
      mouseX = event.clientX;
      mouseY = event.clientY;
      placeDot();
      if (!started) {
        started = true;
        ringX = mouseX;
        ringY = mouseY;
        // Only take over from the native pointer once it actually moves.
        doc.classList.add('has-cursor');
        window.requestAnimationFrame(render);
      }
    }, { passive: true });

    document.addEventListener('mouseover', event => {
      const interactive = event.target.closest('a, button, input, select, textarea, label, .work-trigger, [data-cursor], [data-kb-canvas]');
      cursor.classList.toggle('is-active', Boolean(interactive));
    });
  }
})();
