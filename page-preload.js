// =============================================================================
//  page-preload.js  —  the tiny helper that runs alongside every web page
// =============================================================================
//  main.js attaches this file to every tab (see "will-attach-webview").
//
//  What it does:
//    1. FINGERPRINT PROTECTION, in every page and frame (see below).
//    2. Notices sign-in forms, so Klorine can
//       - show the key button when a page has a password box, and
//       - offer "Save password?" after you sign in.
//
//  What it does NOT do:
//    - It gives the web page nothing. The page cannot see or call anything
//      in this file (it runs in a separate, isolated "world").
//    - It does nothing at all unless you have set up the vault and left
//      "Offer to save passwords" switched on. main.js tells it which.
//    - It never fills passwords in. Filling is done by main.js, and only
//      when you click a saved sign-in yourself.
//    - It ignores "fake" clicks and submits made by the page's own code:
//      only things you really did with the mouse or keyboard count.
//
//  It can send main.js exactly three kinds of message, all checked there:
//    'page:shield-seed'     -> "which made-up fingerprint does this site get?"
//    'page:password-field'  true/false  -> this page has a password box
//    'page:login'           { username, password } -> you just signed in
// =============================================================================

const { ipcRenderer, contextBridge } = require('electron');

// =============================================================================
//  FINGERPRINT PROTECTION
// =============================================================================
//  Websites can recognise a browser without cookies by measuring tiny
//  details of the computer: exactly how text is drawn into a picture
//  ("canvas"), how the graphics chip renders 3-D ("WebGL"), how sound is
//  processed ("audio"), how many processor cores there are, and so on.
//  Together these form a "fingerprint" that is often unique to one computer.
//
//  Klorine does what Brave does: it gives every SITE a slightly different,
//  made-up fingerprint, which changes again each time Klorine starts.
//    - Pictures read back from a canvas or WebGL have a few pixels nudged
//      by the smallest possible amount (1 out of 255 in one colour), which
//      no one can see.
//    - Sound read back for measuring is nudged by an inaudible amount.
//    - The number of processor cores and the list of browser plugins are
//      varied per site too (like Brave), so they cannot link sites either.
//    - The amount of memory is reported as the most common answer (8 GB).
//  The same site always gets the same nudges during a session (so nothing
//  flickers or breaks); a different site gets different ones, so the two
//  sites cannot match you up.
//
//  This must run inside the PAGE's own world, before the page's scripts,
//  so it is sent there as text (that is why it cannot use anything outside
//  this function). It is switched off on sites where Shields are off.
//
//    - Fonts installed by other programs (Office, Adobe...) are hidden:
//      pages only see the fonts that come with the operating system.
//
//  What it cannot cover: canvas drawing done inside background "workers".
// =============================================================================
function klorineFingerprintShield(seedHex, languages, hiddenFonts) {
  const seed = parseInt(seedHex.slice(0, 8), 16) >>> 0;

  // A fast "scrambler": turns a number into a random-looking one. With the
  // seed mixed in, the same position always gives the same answer.
  const mix = (value) => {
    let a = value >>> 0;
    a = Math.imul(a ^ (a >>> 16), 0x7feb352d);
    a = Math.imul(a ^ (a >>> 15), 0x846ca68b);
    return (a ^ (a >>> 16)) >>> 0;
  };
  const pick = (index, salt) => mix(Math.imul(index, 0x9e3779b1) ^ seed ^ salt);

  // Our replacement functions -> the originals they stand in for. Used so
  // that asking a replacement for its source code gives the original's
  // answer ("[native code]"), as in an untouched browser.
  const disguised = new WeakMap();
  const protectedWindows = new WeakSet();

  // Nudges pixels (red, green, blue, alpha in a row). Only about one pixel
  // in 32 is touched, and only its lowest bit is SET to a fixed value, so
  // doing it twice gives the same result as doing it once.
  function nudgePixels(data, left, top, width) {
    if (!data || !width) return;
    for (let i = 0, n = data.length; i < n; i += 4) {
      if (data[i + 3] === 0) continue;                 // fully see-through: skip
      const p = i >> 2;
      const x = left + (p % width), y = top + ((p / width) | 0);
      const h = pick(Math.imul(y, 65537) + x, 0x51ed);
      if ((h & 31) !== 0) continue;
      const c = i + ((h >>> 5) % 3);
      data[c] = (data[c] & 0xfe) | ((h >>> 9) & 1);
    }
  }

  // Nudges sound samples by the smallest possible step (the last bit of the
  // number). Silence stays silent. Also safe to repeat.
  const nudgedSound = new WeakSet();
  function nudgeSound(samples, startIndex = 0) {
    if (!samples || nudgedSound.has(samples) || samples.length > 3000000) return;
    const bits = new Uint32Array(samples.buffer, samples.byteOffset, samples.length);
    for (let i = 0; i < samples.length; i++) {
      if (samples[i] === 0) continue;
      const h = pick(startIndex + i, 0xa0d1);
      if ((h & 15) !== 0) continue;
      bits[i] = (bits[i] & 0xfffffffe) | ((h >>> 4) & 1);
    }
    nudgedSound.add(samples);
  }
  function nudgeBytes(bytes) {
    if (!bytes) return;
    for (let i = 0; i < bytes.length; i++) {
      const h = pick(i, 0xb17e);
      if ((h & 15) === 0 && bytes[i] > 0) bytes[i] = (bytes[i] & 0xfe) | ((h >>> 4) & 1);
    }
  }
  function nudgeFloats(values) {
    if (!values) return;
    const bits = new Uint32Array(values.buffer, values.byteOffset, values.length);
    for (let i = 0; i < values.length; i++) {
      const h = pick(i, 0xf10a);
      if ((h & 15) === 0 && Number.isFinite(values[i]) && values[i] !== 0) bits[i] = (bits[i] & 0xfffffffe) | ((h >>> 4) & 1);
    }
  }

  // Replaces a method on a prototype (keeping its name and length).
  function replaceMethod(proto, name, make) {
    if (!proto) return;
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (!desc || typeof desc.value !== 'function' || disguised.has(desc.value)) return;
    const original = desc.value;
    const replacement = make(original);
    Object.defineProperty(replacement, 'length', { value: original.length, configurable: true });
    disguised.set(replacement, original);
    Object.defineProperty(proto, name, { ...desc, value: replacement });
  }
  // Replaces a property's "getter".
  function replaceGetter(proto, name, make) {
    if (!proto) return;
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (!desc || typeof desc.get !== 'function' || disguised.has(desc.get)) return;
    const original = desc.get;
    const replacement = make(original);
    disguised.set(replacement, original);
    Object.defineProperty(proto, name, { ...desc, get: replacement });
  }
  const method = (name, body) => ({ [name](...args) { return body.call(this, args); } })[name];
  const getter = (name, body) => Object.getOwnPropertyDescriptor({ get [name]() { return body.call(this); } }, name).get;

  function protect(win) {
    let canvasProto;
    try { canvasProto = win.HTMLCanvasElement.prototype; } catch (error) { return; }   // another site's frame
    if (!canvasProto || protectedWindows.has(win)) return;
    protectedWindows.add(win);

    // --- Source code of replacements looks like the originals' ---
    replaceMethod(win.Function.prototype, 'toString', (original) => method('toString', function () {
      return original.call(disguised.get(this) || this);
    }));

    // --- Canvas (2-D pictures) ---
    const ctx2d = win.CanvasRenderingContext2D && win.CanvasRenderingContext2D.prototype;
    const real = {
      createElement: win.Document.prototype.createElement,
      getContext: canvasProto.getContext,
      toDataURL: canvasProto.toDataURL,
      toBlob: canvasProto.toBlob,
      drawImage: ctx2d.drawImage,
      getImageData: ctx2d.getImageData,
      putImageData: ctx2d.putImageData,
    };
    // A nudged copy of a canvas, or null if it cannot be made (then the
    // original is used, which gives the same error a normal browser would).
    function nudgedCopy(canvas) {
      const w = canvas.width, h = canvas.height;
      if (!w || !h || w * h > 16777216) return null;
      try {
        const copy = real.createElement.call(canvas.ownerDocument || win.document, 'canvas');
        copy.width = w; copy.height = h;
        const ctx = real.getContext.call(copy, '2d');
        real.drawImage.call(ctx, canvas, 0, 0);
        const image = real.getImageData.call(ctx, 0, 0, w, h);
        nudgePixels(image.data, 0, 0, w);
        real.putImageData.call(ctx, image, 0, 0);
        return copy;
      } catch (error) {
        return null;
      }
    }
    replaceMethod(canvasProto, 'toDataURL', (original) => method('toDataURL', function (args) {
      return original.apply(nudgedCopy(this) || this, args);
    }));
    replaceMethod(canvasProto, 'toBlob', (original) => method('toBlob', function (args) {
      return original.apply(nudgedCopy(this) || this, args);
    }));
    replaceMethod(ctx2d, 'getImageData', (original) => method('getImageData', function (args) {
      const image = original.apply(this, args);
      let [sx, sy, sw, sh] = args;
      if (sw < 0) sx += sw;
      if (sh < 0) sy += sh;
      try { nudgePixels(image.data, Math.floor(sx) || 0, Math.floor(sy) || 0, image.width); } catch (error) { /* leave it */ }
      return image;
    }));

    // Off-screen canvases (same idea).
    if (win.OffscreenCanvas) {
      const offProto = win.OffscreenCanvas.prototype;
      const offCtx = win.OffscreenCanvasRenderingContext2D && win.OffscreenCanvasRenderingContext2D.prototype;
      const offReal = offCtx && { getContext: offProto.getContext, drawImage: offCtx.drawImage, getImageData: offCtx.getImageData, putImageData: offCtx.putImageData };
      replaceMethod(offProto, 'convertToBlob', (original) => method('convertToBlob', function (args) {
        let source = this;
        try {
          const w = this.width, h = this.height;
          if (offReal && w && h && w * h <= 16777216) {
            const copy = new win.OffscreenCanvas(w, h);
            const ctx = offReal.getContext.call(copy, '2d');
            offReal.drawImage.call(ctx, this, 0, 0);
            const image = offReal.getImageData.call(ctx, 0, 0, w, h);
            nudgePixels(image.data, 0, 0, w);
            offReal.putImageData.call(ctx, image, 0, 0);
            source = copy;
          }
        } catch (error) { source = this; }
        return original.apply(source, args);
      }));
      if (offCtx) {
        replaceMethod(offCtx, 'getImageData', (original) => method('getImageData', function (args) {
          const image = original.apply(this, args);
          try { nudgePixels(image.data, Math.floor(args[0]) || 0, Math.floor(args[1]) || 0, image.width); } catch (error) { /* leave it */ }
          return image;
        }));
      }
    }

    // --- WebGL (3-D graphics) ---
    for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
      const proto = win[name] && win[name].prototype;
      if (!proto) continue;
      replaceMethod(proto, 'readPixels', (original) => method('readPixels', function (args) {
        const result = original.apply(this, args);
        const [x, y, width, , format, , pixels] = args;
        if (format === 0x1908 && pixels && pixels.BYTES_PER_ELEMENT === 1) {   // RGBA bytes
          try { nudgePixels(pixels, x | 0, y | 0, width | 0); } catch (error) { /* leave it */ }
        }
        return result;
      }));
      // The graphics chip's NAME is left exactly as Chrome reports it. (An
      // earlier version shortened it, e.g. to "Intel Graphics", but no real
      // browser says that, so it made Klorine users stand out instead of
      // blending in with everyone who has the same computer model.)
    }

    // --- Audio ---
    if (win.AudioBuffer) {
      const proto = win.AudioBuffer.prototype;
      replaceMethod(proto, 'getChannelData', (original) => method('getChannelData', function (args) {
        const samples = original.apply(this, args);
        try { nudgeSound(samples); } catch (error) { /* leave it */ }
        return samples;
      }));
      replaceMethod(proto, 'copyFromChannel', (original) => method('copyFromChannel', function (args) {
        const result = original.apply(this, args);
        try {
          const target = args[0];
          const start = args[2] | 0;
          if (target && target.length <= 3000000) {
            const bits = new Uint32Array(target.buffer, target.byteOffset, target.length);
            for (let i = 0; i < target.length; i++) {
              if (target[i] === 0) continue;
              const h = pick(start + i, 0xa0d1);
              if ((h & 15) === 0) bits[i] = (bits[i] & 0xfffffffe) | ((h >>> 4) & 1);
            }
          }
        } catch (error) { /* leave it */ }
        return result;
      }));
    }
    if (win.AnalyserNode) {
      const proto = win.AnalyserNode.prototype;
      for (const name of ['getFloatFrequencyData', 'getFloatTimeDomainData']) {
        replaceMethod(proto, name, (original) => method(name, function (args) {
          const result = original.apply(this, args);
          try { nudgeFloats(args[0]); } catch (error) { /* leave it */ }
          return result;
        }));
      }
      for (const name of ['getByteFrequencyData', 'getByteTimeDomainData']) {
        replaceMethod(proto, name, (original) => method(name, function (args) {
          const result = original.apply(this, args);
          try { nudgeBytes(args[0]); } catch (error) { /* leave it */ }
          return result;
        }));
      }
    }

    // --- Computer details: common values instead of exact ones ---
    const navProto = win.Navigator && win.Navigator.prototype;
    // Processor cores: one of the most common answers, chosen per site
    // (8 is the most common of all, so it comes up twice as often).
    const coreChoices = [4, 8, 8, 12, 16];
    const fakeCores = coreChoices[pick(0x434f, 0x5245) % coreChoices.length];
    replaceGetter(navProto, 'hardwareConcurrency', (original) => getter('hardwareConcurrency', function () {
      original.call(this);
      return fakeCores;
    }));

    // Browser plugins: Chrome's usual list of five PDF viewers, plus one
    // made-up plugin whose name and place in the list change per site
    // (Brave does the same). Pages see the real five working as normal.
    const pluginWords = ['Chrome', 'PDF', 'Native', 'Client', 'Media', 'Viewer', 'Plugin', 'Content', 'Document', 'Module', 'Reader', 'Web', 'Shell', 'Player', 'Portable', 'Format'];
    const word = (n) => pluginWords[pick(n, 0x9119) % pluginWords.length];
    const fakeMime = {
      type: 'application/x-' + pick(4, 0x9119).toString(36),
      suffixes: pick(5, 0x9119).toString(36).slice(0, 3),
      description: word(6) + ' ' + word(7),
    };
    const fakePlugin = {
      name: word(1) + ' ' + word(2) + ' ' + word(3),
      filename: pick(8, 0x9119).toString(16) + '.plugin',
      description: word(9) + ' ' + word(10) + ' ' + word(11),
      length: 1,
      0: fakeMime,
      item(index) { return index === 0 ? fakeMime : null; },
      namedItem(type) { return type === fakeMime.type ? fakeMime : null; },
    };
    fakeMime.enabledPlugin = fakePlugin;
    const pluginLists = new WeakMap();   // the real list -> the list pages see
    replaceGetter(navProto, 'plugins', (original) => getter('plugins', function () {
      const realList = original.call(this);
      if (!realList || !realList.length) return realList;   // PDF viewer switched off: leave it
      if (pluginLists.has(realList)) return pluginLists.get(realList);
      const entries = [];
      for (let i = 0; i < realList.length; i++) entries.push(realList[i]);
      entries.splice(pick(12, 0x9119) % (entries.length + 1), 0, fakePlugin);
      const shown = new Proxy(realList, {
        get(target, key) {
          if (key === 'length') return entries.length;
          if (typeof key === 'string' && /^\d+$/.test(key)) return entries[Number(key)];
          if (key === 'item') return function item(index) { return entries[index >>> 0] || null; };
          if (key === 'namedItem') return function namedItem(name) { return entries.find((e) => e.name === String(name)) || null; };
          if (key === 'refresh') return function refresh() {};
          if (key === Symbol.iterator) return function* values() { yield* entries; };
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
        has(target, key) {
          if (typeof key === 'string' && /^\d+$/.test(key)) return Number(key) < entries.length;
          return Reflect.has(target, key);
        },
      });
      pluginLists.set(realList, shown);
      return shown;
    }));
    replaceGetter(navProto, 'deviceMemory', (original) => getter('deviceMemory', function () {
      original.call(this);
      return 8;                             // the most common (and Chrome's highest) answer
    }));

    // --- Languages: the same list every request sends (see main.js) ---
    if (Array.isArray(languages) && languages.length) {
      const frozen = Object.freeze(languages.slice());
      replaceGetter(navProto, 'languages', (original) => getter('languages', function () {
        original.call(this);
        return frozen;
      }));
      replaceGetter(navProto, 'language', (original) => getter('language', function () {
        original.call(this);
        return frozen[0];
      }));
    }

    // --- Brand list: report "Google Chrome" like real Chrome ---
    if (win.NavigatorUAData) {
      const proto = win.NavigatorUAData.prototype;
      const addChrome = (list) => {
        if (!Array.isArray(list) || list.some((b) => b.brand === 'Google Chrome')) return list;
        const chromium = list.find((b) => b.brand === 'Chromium');
        const grease = list.find((b) => b.brand !== 'Chromium');
        if (!chromium || !grease) return list;
        const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
        const order = orders[(parseInt(chromium.version, 10) || 0) % 6];
        const result = [];
        result[order[0]] = grease;
        result[order[1]] = chromium;
        result[order[2]] = { brand: 'Google Chrome', version: chromium.version };
        return result.map((b) => ({ brand: b.brand, version: b.version }));
      };
      replaceGetter(proto, 'brands', (original) => getter('brands', function () {
        return Object.freeze(addChrome(original.call(this)));
      }));
      replaceMethod(proto, 'getHighEntropyValues', (original) => method('getHighEntropyValues', function (args) {
        return original.apply(this, args).then((values) => {
          if (values && values.brands) values.brands = addChrome(values.brands);
          if (values && values.fullVersionList) values.fullVersionList = addChrome(values.fullVersionList);
          return values;
        });
      }));
      replaceMethod(proto, 'toJSON', (original) => method('toJSON', function (args) {
        const values = original.apply(this, args);
        if (values && values.brands) values.brands = addChrome(values.brands);
        return values;
      }));
    }

    // --- Installed fonts: only the operating system's own are visible ---
    // Trackers find out which fonts are installed by writing text in
    // "the font being tested, else a standard font" and measuring how wide
    // it comes out: if the width differs from the standard font alone, the
    // font must be installed. For fonts on the hidden list, Klorine answers
    // those measurements as if the font were NOT installed (it measures with
    // that font left out). Only measurements are affected; what you see on
    // screen is unchanged.
    const hiddenSet = new Set((Array.isArray(hiddenFonts) ? hiddenFonts : []).map((f) => String(f).toLowerCase()));
    const bareName = (name) => name.trim().replace(/^["']|["']$/g, '').toLowerCase();
    // "'Lucida Fax', monospace" -> "monospace" (null if nothing was hidden)
    const withoutHidden = (familyList) => {
      const families = String(familyList).split(',');
      const kept = families.filter((name) => !hiddenSet.has(bareName(name)));
      return kept.length === families.length ? null : (kept.join(',') || 'serif');
    };
    // Runs read() with any hidden fonts left out of the element's own
    // font setting, then puts the setting back.
    const measureWithoutHidden = (element, read) => {
      const style = element && element.style;
      const value = style && style.fontFamily;
      const replaced = value ? withoutHidden(value) : null;
      if (replaced === null) return read();
      const priority = style.getPropertyPriority('font-family');
      style.setProperty('font-family', replaced, priority);
      try { return read(); } finally { style.setProperty('font-family', value, priority); }
    };
    if (hiddenSet.size > 0) {
      const htmlProto = win.HTMLElement && win.HTMLElement.prototype;
      for (const name of ['offsetWidth', 'offsetHeight']) {
        replaceGetter(htmlProto, name, (original) => getter(name, function () {
          return measureWithoutHidden(this, () => original.call(this));
        }));
      }
      const elementProto = win.Element && win.Element.prototype;
      for (const name of ['getBoundingClientRect', 'getClientRects']) {
        replaceMethod(elementProto, name, (original) => method(name, function (args) {
          return measureWithoutHidden(this, () => original.apply(this, args));
        }));
      }
      for (const name of ['scrollWidth', 'scrollHeight', 'clientWidth', 'clientHeight']) {
        replaceGetter(elementProto, name, (original) => getter(name, function () {
          return measureWithoutHidden(this, () => original.call(this));
        }));
      }
      // Measuring text on a canvas: ctx.font = "72px 'Lucida Fax', serif".
      const sizeThenFamilies = /^(.*?\d[\d.]*(?:px|pt|pc|em|rem|ex|ch|%|vw|vh|cm|mm|in|q)(?:\s*\/\s*\S+)?\s+)(.+)$/i;
      for (const ctxName of ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D']) {
        const proto = win[ctxName] && win[ctxName].prototype;
        replaceMethod(proto, 'measureText', (original) => method('measureText', function (args) {
          const font = this.font;
          const parts = sizeThenFamilies.exec(String(font));
          const replaced = parts ? withoutHidden(parts[2]) : null;
          if (replaced === null) return original.apply(this, args);
          this.font = parts[1] + replaced;
          try { return original.apply(this, args); } finally { this.font = font; }
        }));
      }
    }

    // --- Frames made by the page itself (e.g. a blank one) ---
    // A page could create an empty frame and use ITS untouched canvas, so
    // frames of the same site get the same protection when reached.
    const frameProto = win.HTMLIFrameElement && win.HTMLIFrameElement.prototype;
    replaceGetter(frameProto, 'contentWindow', (original) => getter('contentWindow', function () {
      const child = original.call(this);
      if (child) { try { protect(child); } catch (error) { /* another site's frame */ } }
      return child;
    }));
    replaceGetter(frameProto, 'contentDocument', (original) => getter('contentDocument', function () {
      const doc = original.call(this);
      if (doc && doc.defaultView) { try { protect(doc.defaultView); } catch (error) { /* ignore */ } }
      return doc;
    }));
  }

  protect(window);
}

// Ask main.js for this site's code and switch the protection on, before
// any of the page's own scripts run. (An empty answer means Shields are
// off for this site, so the page is left exactly as it is.)
try {
  const answer = ipcRenderer.sendSync('page:shield-seed') || {};
  const languages = Array.isArray(answer.languages) ? answer.languages.filter((l) => /^[A-Za-z-]{2,12}$/.test(l)).slice(0, 5) : [];
  if (typeof answer.seed === 'string' && /^[0-9a-f]{32}$/.test(answer.seed)) {
    const fonts = Array.isArray(answer.hiddenFonts) ? answer.hiddenFonts.filter((f) => typeof f === 'string' && /^[\w .-]{1,40}$/.test(f)).slice(0, 300) : [];
    contextBridge.executeInMainWorld({ func: klorineFingerprintShield, args: [answer.seed, languages, fonts] });
  }
} catch (error) {
  // the page still works, just without the protection
}


// Only the page itself, never frames embedded inside it (ads, widgets...).
if (window.top === window) {
  let watching = false;       // has main.js said to watch for sign-ins?
  let started = false;
  let hadPasswordBox = null;  // what we last told main.js
  let lastSent = '';          // avoids sending the same sign-in twice in a row
  let lastSentAt = 0;

  // Can you actually see this box? (Hidden boxes are ignored.)
  const visible = (el) => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return box.width > 8 && box.height > 8 && style.visibility !== 'hidden' && style.display !== 'none';
  };

  // Tell main.js whether this page has a password box (for the key button).
  const reportPasswordBox = () => {
    if (!watching) return;
    const has = Boolean(document.querySelector('input[type="password"]'));
    if (has !== hadPasswordBox) {
      hadPasswordBox = has;
      ipcRenderer.send('page:password-field', has);
    }
  };

  // Looks at the form you just used and, if it holds a typed password,
  // passes the sign-in to main.js (which will ASK before saving anything).
  const reportLogin = (near) => {
    if (!watching) return;
    const form = near && near.closest ? near.closest('form') : null;
    const scope = Array.from((form || document).querySelectorAll('input')).filter(visible);
    const passwords = scope.filter((el) => el.type === 'password' && el.value);
    if (passwords.length === 0) return;

    // One password box: a sign-in. Two: "new password" + "repeat it" (take
    // the last). Three: "current", "new", "repeat" (take the new one).
    const chosen = passwords.length >= 3 ? passwords[1] : passwords[passwords.length - 1];

    // The username: the nearest filled-in text or email box before it.
    const before = scope.slice(0, scope.indexOf(passwords[0]))
      .filter((el) => ['text', 'email', 'tel'].includes(el.type) && el.value);
    const username = before.length ? before[before.length - 1].value : '';

    const signature = username + '\n' + chosen.value;
    if (signature === lastSent && Date.now() - lastSentAt < 5000) return;
    lastSent = signature;
    lastSentAt = Date.now();
    ipcRenderer.send('page:login', { username, password: chosen.value });
  };

  const start = () => {
    if (started) return;
    started = true;

    // 1. A form was submitted (you pressed Enter or clicked its button).
    document.addEventListener('submit', (event) => {
      if (event.isTrusted) reportLogin(event.target);
    }, true);

    // 2. Enter pressed inside a password box (pages without a real form).
    document.addEventListener('keydown', (event) => {
      if (event.isTrusted && event.key === 'Enter' && event.target && event.target.type === 'password') reportLogin(event.target);
    }, true);

    // 3. A button clicked on a page whose password box is not inside a
    //    form. "Show password" and "Forgot password" buttons are skipped.
    document.addEventListener('click', (event) => {
      if (!event.isTrusted || !event.target || !event.target.closest) return;
      const button = event.target.closest('button, input[type="submit"], input[type="button"], [role="button"]');
      if (!button || button.closest('form')) return;   // real forms are handled by (1)
      const label = [button.textContent, button.value, button.getAttribute('aria-label'), button.title].join(' ');
      if (/show|hide|view|reveal|forgot|reset|cancel|eye/i.test(label)) return;
      reportLogin(document.body);
    }, true);

    // Keep the "has a password box" answer up to date as the page changes.
    let timer = null;
    const soon = () => { clearTimeout(timer); timer = setTimeout(reportPasswordBox, 400); };
    const observe = () => {
      reportPasswordBox();
      new MutationObserver(soon).observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe, { once: true });
    else observe();
  };

  const setWatching = (on) => {
    watching = on === true;
    if (watching) { start(); hadPasswordBox = null; if (document.readyState !== 'loading') reportPasswordBox(); }
  };

  // Ask main.js once whether to watch; it also tells us if that changes.
  ipcRenderer.invoke('page:capture-enabled').then(setWatching).catch(() => {});
  ipcRenderer.on('page:capture', (event, on) => setWatching(on));
}