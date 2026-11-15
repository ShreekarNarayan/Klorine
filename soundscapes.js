// =============================================================================
//  soundscapes.js — background sounds made from mathematics, live
// =============================================================================
//  Rain, wind and café sounds, created on your own computer while you listen.
//  Nothing is downloaded or streamed: there are no sound files at all, so no
//  outside server ever learns that you are listening (or when).
//
//  How it works, in short:
//    1. NOISE. When sound is first switched on, a few seconds of "noise" are
//       calculated with simple formulas (random numbers, shaped):
//         white noise -> pure hiss, every pitch equally loud
//         pink noise  -> softer, like steady rain or a waterfall
//         brown noise -> deep and rumbling, like distant wind or surf
//    2. FILTERS. The noise is then shaped live by "biquad" filters (the
//       browser's built-in tone controls): low-pass keeps the low sounds,
//       high-pass keeps the high ones, band-pass keeps a band in between.
//    3. MOVEMENT. Slow, random changes over time make it feel alive: rain
//       swells, wind gusts, café chatter rises and falls, and short events
//       (raindrops, the clink of a cup) are scheduled at random moments.
//
//  It uses the Web Audio API, which is built into every modern browser.
//  This file only makes sound; the buttons and sliders are in renderer.js.
// =============================================================================

'use strict';

// Creates a sound engine on an audio context. renderer.js passes a normal
// (live) AudioContext; tests can pass an OfflineAudioContext to render the
// sound silently and measure it.
function createSoundscapeEngine(ctx) {
  // ---------------------------------------------------------------------------
  //  Output: every scene -> master volume -> gentle limiter -> speakers
  // ---------------------------------------------------------------------------
  // MASTER_BOOST lifts everything to a comfortable listening level: at the
  // default slider positions, about as loud as quiet background music.
  // (Without it the sounds were too faint to hear on laptop speakers.)
  const MASTER_BOOST = 2.2;
  const master = ctx.createGain();
  master.gain.value = MASTER_BOOST;

  // A "limiter" stops several sounds together from getting too loud or
  // distorting: above a set level it turns the sound down smoothly. A little
  // headroom is left after it, so even sudden sounds stay clean.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -9;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.25;
  const headroom = ctx.createGain();
  headroom.gain.value = 0.85;

  master.connect(limiter);
  limiter.connect(headroom);
  headroom.connect(ctx.destination);

  // ---------------------------------------------------------------------------
  //  1. Noise, calculated
  // ---------------------------------------------------------------------------
  // Six seconds of each kind of noise, in stereo (each ear gets its own
  // random noise, which sounds wide and natural). It is played on a loop
  // from a random point, so the repetition is not noticeable.
  //
  const NOISE_SECONDS = 6;
  let buffers = null;

  // Calculates the noise step by step, pausing ("yield") every so often,
  // so the work can be spread out and the toolbar never freezes.
  function* makeNoiseSteps() {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * NOISE_SECONDS);
    const fade = Math.floor(rate * 0.5);   // half a second, to join the loop
    const result = {};

    for (const kind of ['white', 'pink', 'brown']) {
      const buffer = ctx.createBuffer(2, length, rate);

      for (let channel = 0; channel < 2; channel++) {
        // Calculate a little more than needed; the extra is blended into the
        // start so the end of the loop flows into its beginning seamlessly.
        const raw = new Float32Array(length + fade);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;   // pink filter memory
        let last = 0;                                                 // brown "walk" position

        for (let i = 0; i < raw.length; i++) {
          if (i % 48000 === 0) yield;            // a short break every second's worth
          const white = Math.random() * 2 - 1;   // a random number from -1 to 1

          if (kind === 'white') {
            raw[i] = white * 0.5;
          } else if (kind === 'pink') {
            // Pink noise: white noise passed through a set of simple filters
            // that soften the high pitches ("Paul Kellet's method").
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
            b6 = white * 0.115926;
          } else {
            // Brown noise: a "random walk" (each step adds a little random
            // movement), gently pulled back toward the middle so it never
            // drifts off. Deep and rumbling.
            last = (last + 0.02 * white) / 1.02;
            raw[i] = last * 3.5;
          }
        }

        // Join the loop: over the first half second, blend from the extra
        // samples (which follow on from the end) into the start.
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < length; i++) data[i] = raw[i];
        for (let i = 0; i < fade; i++) {
          const mix = i / fade;
          data[i] = raw[i] * mix + raw[length + i] * (1 - mix);
        }
      }
      result[kind] = buffer;
    }
    result.drops = yield* makeRaindrops();
    buffers = result;
  }

  // A set of 24 different raindrops, calculated once. Each is a tiny burst
  // of hiss, tuned to a random pitch by a band-pass filter, fading away in a
  // few hundredths of a second. Playing these back is far lighter for the
  // computer than building a fresh filter for every one of the ~25 drops a
  // second.
  function* makeRaindrops() {
    const rate = ctx.sampleRate;
    const drops = [];
    for (let n = 0; n < 24; n++) {
      const pitch = rand(1600, 6500);
      const q = rand(3, 9);
      const fadeTime = rand(0.015, 0.06);
      const length = Math.floor(rate * (fadeTime + 0.01));
      const buffer = ctx.createBuffer(1, length, rate);
      const data = buffer.getChannelData(0);

      // The band-pass filter, worked out with the standard "biquad" formula
      // (the same one the browser's own filters use).
      const w0 = 2 * Math.PI * pitch / rate;
      const alpha = Math.sin(w0) / (2 * q);
      const a0 = 1 + alpha;
      const b0 = alpha / a0, b2 = -alpha / a0;
      const a1 = -2 * Math.cos(w0) / a0, a2 = (1 - alpha) / a0;
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

      const attack = Math.floor(rate * 0.002);
      for (let i = 0; i < length; i++) {
        const x = (Math.random() * 2 - 1) * 0.5;
        const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        // Volume shape: a 2 ms rise, then a smooth fade to silence.
        const shape = i < attack ? i / attack : Math.pow(0.0001, (i - attack) / (rate * fadeTime));
        data[i] = y * shape;
      }
      drops.push(buffer);
      if (n % 8 === 7) yield;
    }
    return drops;
  }

  // ---------------------------------------------------------------------------
  //  Small building blocks
  // ---------------------------------------------------------------------------
  const rand = (low, high) => low + Math.random() * (high - low);

  // A toolkit handed to each scene. Everything long-lasting it creates is
  // remembered, so it can all be stopped when the scene is switched off.
  function makeKit(owned) {
    const kit = {
      // A looping noise source, started from a random point.
      noise(kind) {
        const source = ctx.createBufferSource();
        source.buffer = buffers[kind];
        source.loop = true;
        source.start(ctx.currentTime, Math.random() * NOISE_SECONDS);
        owned.push(source);
        return source;
      },

      // A biquad filter: 'lowpass', 'highpass' or 'bandpass'.
      filter(type, frequency, q) {
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        filter.Q.value = q;
        return filter;
      },

      gain(value) {
        const node = ctx.createGain();
        node.gain.value = value;
        return node;
      },

      pan(value) {
        const node = ctx.createStereoPanner();
        node.pan.value = value;
        return node;
      },

      // Connects nodes one after another: a -> b -> c ...
      chain(...nodes) {
        for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
        return nodes[nodes.length - 1];
      },

      // A slow wave (a "low-frequency oscillator") that moves a setting up
      // and down: e.g. 0.06 times per second, by +/- 0.1.
      lfo(rate, depth, target) {
        const wave = ctx.createOscillator();
        wave.frequency.value = rate;
        const amount = ctx.createGain();
        amount.gain.value = depth;
        wave.connect(amount);
        amount.connect(target);
        wave.start(ctx.currentTime + Math.random());
        owned.push(wave);
      },

      // One raindrop: one of the 24 prepared drops (see makeRaindrops), at a
      // random loudness and position between your ears.
      drop(time, out) {
        const source = ctx.createBufferSource();
        source.buffer = buffers.drops[Math.floor(Math.random() * buffers.drops.length)];
        const level = kit.gain(rand(0.15, 1) ** 2 * 0.72);
        kit.chain(source, level, kit.pan(rand(-0.9, 0.9)), out);
        source.start(time);
      },

      // The clink of a cup or spoon: a few pure tones at "inharmonic"
      // spacings (as a struck piece of china or metal has), fading quickly.
      clink(time, out) {
        const base = rand(1900, 3400);
        const length = rand(0.25, 0.6);
        const level = ctx.createGain();
        level.gain.setValueAtTime(0, time);
        level.gain.linearRampToValueAtTime(rand(0.05, 0.12), time + 0.003);
        level.gain.exponentialRampToValueAtTime(0.0001, time + length);
        kit.chain(level, kit.pan(rand(-0.8, 0.8)), out);
        [[1, 1], [2.76, 0.5], [5.4, 0.25]].forEach(([ratio, strength]) => {
          const tone = ctx.createOscillator();
          tone.frequency.value = base * ratio;
          const partial = kit.gain(strength);
          tone.connect(partial);
          partial.connect(level);
          tone.start(time);
          tone.stop(time + length + 0.05);
        });
      },
    };
    return kit;
  }

  // ---------------------------------------------------------------------------
  //  2 & 3. The scenes
  // ---------------------------------------------------------------------------
  // Each scene connects its sounds to "out" and returns a plan(from, to)
  // function, which schedules the random events between two moments.

  const SCENES = {
    rain(out, kit) {
      // Steady hiss of rainfall: pink noise, with the lowest and highest
      // pitches removed.
      const hissLevel = kit.gain(0.9);
      kit.chain(kit.noise('pink'), kit.filter('highpass', 450, 0.6), kit.filter('lowpass', 7000, 0.5), hissLevel, out);

      // The soft roar of rain on roofs and leaves: brown noise, low-passed.
      kit.chain(kit.noise('brown'), kit.filter('lowpass', 800, 0.6), kit.gain(0.45), out);

      // Rain is never perfectly even: it slowly swells and eases.
      kit.lfo(0.06, 0.25, hissLevel.gain);

      // Individual drops, about 25 a second, at random moments.
      return (from, to) => {
        for (let time = from + rand(0, 0.04); time < to; time += rand(0.01, 0.07)) {
          kit.drop(time, out);
        }
      };
    },

    wind(out, kit) {
      // The body of the wind: brown noise through a band-pass filter. When a
      // gust comes, the band moves up in pitch and gets louder.
      const band = kit.filter('bandpass', 420, 0.9);
      const level = kit.gain(0.5);
      const sway = kit.pan(0);
      kit.chain(kit.noise('brown'), band, level, sway, out);

      // A faint whistle: pink noise through a narrow band, following gusts.
      const whistle = kit.filter('bandpass', 900, 9);
      const whistleLevel = kit.gain(0.05);
      kit.chain(kit.noise('pink'), whistle, whistleLevel, out);

      // The wind slowly drifts from side to side.
      kit.lfo(0.03, 0.45, sway.pan);

      // A new gust every 1-3.5 seconds, each of random strength. Changes
      // glide smoothly over a second or two, as real gusts do.
      let next = 0;
      return (from, to) => {
        if (next < from) next = from;
        while (next < to) {
          const strength = rand(0.2, 1);
          const glide = rand(0.6, 1.8);
          level.gain.setTargetAtTime(0.9 + 2.0 * strength, next, glide);
          band.frequency.setTargetAtTime(240 + 660 * strength, next, glide);
          whistleLevel.gain.setTargetAtTime(0.02 + 0.16 * strength * strength, next, glide);
          whistle.frequency.setTargetAtTime(700 + 800 * strength, next, glide * 1.3);
          next += rand(1, 3.5);
        }
      };
    },

    cafe(out, kit) {
      // Room tone: the low hum of a busy room (brown noise, low-passed).
      kit.chain(kit.noise('brown'), kit.filter('lowpass', 250, 0.7), kit.gain(0.3), out);

      // Chatter: five "voices", each a band of pink noise at a pitch range
      // where speech lives. Their loudness changes several times a second,
      // like syllables, with pauses between phrases. Muffled together, it
      // sounds like many conversations too far away to understand.
      const chatter = kit.gain(1.5);
      kit.chain(chatter, kit.filter('lowpass', 2200, 0.5), out);
      const voices = [380, 620, 950, 1450, 2100].map((pitch) => {
        const level = kit.gain(0);
        kit.chain(kit.noise('pink'), kit.filter('bandpass', pitch, 1.6), level, kit.pan(rand(-0.7, 0.7)), chatter);
        return { level, next: 0 };
      });

      // Every few seconds, the clink of a cup or spoon (sometimes two).
      let nextClink = 0;

      return (from, to) => {
        for (const voice of voices) {
          if (voice.next < from) voice.next = from;
          while (voice.next < to) {
            if (Math.random() < 0.06) {
              // A pause between phrases.
              voice.level.gain.setTargetAtTime(0, voice.next, 0.1);
              voice.next += rand(0.6, 2);
            } else {
              // A syllable.
              voice.level.gain.setTargetAtTime(rand(0.4, 1.6), voice.next, 0.035);
              voice.next += rand(0.08, 0.24);
            }
          }
        }
        if (nextClink < from) nextClink = from + rand(0.5, 2);
        while (nextClink < to) {
          kit.clink(nextClink, out);
          if (Math.random() < 0.3) kit.clink(nextClink + rand(0.08, 0.2), out);
          nextClink += rand(1.5, 6);
        }
      };
    },
  };

  // ---------------------------------------------------------------------------
  //  Switching scenes on and off
  // ---------------------------------------------------------------------------
  const playing = new Map();   // scene name -> { out, owned, plan, plannedUntil }

  // Gets the noise ready without freezing the screen: the calculation runs
  // in short steps, with a pause for the browser between each one. Call (and
  // wait for) this before start(). Safe to call more than once.
  let preparing = null;
  function prepare() {
    if (buffers) return Promise.resolve();
    if (!preparing) {
      preparing = (async () => {
        for (const step of makeNoiseSteps()) {   // eslint-disable-line no-unused-vars
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      })();
    }
    return preparing;
  }

  function start(name, volume) {
    if (!SCENES[name] || playing.has(name)) return;
    // Not prepared yet (e.g. in tests): calculate the noise all at once.
    if (!buffers) for (const step of makeNoiseSteps()) { /* run to the end */ }   // eslint-disable-line no-unused-vars

    // Each scene has its own volume, and fades in over a second or so
    // (starting at full volume at once would be jarring).
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(master);
    out.gain.setTargetAtTime(volume, ctx.currentTime, 0.4);

    const owned = [];
    const plan = SCENES[name](out, makeKit(owned));
    playing.set(name, { out, owned, plan, plannedUntil: ctx.currentTime });
  }

  function stop(name) {
    const scene = playing.get(name);
    if (!scene) return;
    playing.delete(name);

    // Fade out, then stop everything the scene started.
    const now = ctx.currentTime;
    scene.out.gain.cancelScheduledValues(now);
    scene.out.gain.setTargetAtTime(0, now, 0.25);
    for (const node of scene.owned) {
      try { node.stop(now + 1.5); } catch (error) { /* already stopped */ }
    }
    setTimeout(() => scene.out.disconnect(), 1700);
  }

  function setVolume(name, volume) {
    const scene = playing.get(name);
    if (scene) scene.out.gain.setTargetAtTime(volume, ctx.currentTime, 0.1);
  }

  function setMasterVolume(volume) {
    master.gain.setTargetAtTime(volume * MASTER_BOOST, ctx.currentTime, 0.1);
  }

  // Schedules each playing scene's random events up to a moment in time.
  // Called a few times a second while sound is playing (by renderer.js).
  function pump(until) {
    for (const scene of playing.values()) {
      if (scene.plannedUntil < until) {
        scene.plan(Math.max(scene.plannedUntil, ctx.currentTime), until);
        scene.plannedUntil = until;
      }
    }
  }

  return {
    context: ctx,
    sceneNames: Object.keys(SCENES),
    prepare,
    start,
    stop,
    setVolume,
    setMasterVolume,
    pump,
    isPlaying: (name) => playing.has(name),
    anyPlaying: () => playing.size > 0,
    // For tests: the calculated noise.
    noiseBuffers: () => buffers,
  };
}