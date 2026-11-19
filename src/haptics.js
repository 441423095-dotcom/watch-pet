// Every haptic the game plays, by name.
//
// THIS FILE IS A FIXED CONTRACT. FreeMilk reads it to list the game's haptics, and
// it is written by the set_haptic and remove_haptic tools — not by hand.
//
// An effect is a pattern: events on a timeline, in seconds.
//   type       'transient' (an instantaneous tap) or 'continuous' (a buzz)
//   time       when it fires, relative to the start
//   intensity  0-1, how hard it hits
//   sharpness  0-1, a dull thud at 0, a crisp tick at 1
//   duration   continuous events only, seconds
//
// Events also take an envelope — attackTime, decayTime, releaseTime,
// sustained. A pattern may carry curves that ramp intensity or sharpness
// smoothly, and may loop, set a playbackRate, or be sustained so the game can
// change it while it runs.
//
// There is no web haptics API on iOS: this goes through the app to the Taptic
// Engine, so it does nothing when the game is opened in a plain browser.

export const HAPTICS = {
  poke: { events: [{ intensity: 0.3, sharpness: 0.45, time: 0, type: 'transient' }] },

  feed: { events: [{ intensity: 0.45, sharpness: 0.25, time: 0, type: 'transient' }, { intensity: 0.38, sharpness: 0.22, time: 0.14, type: 'transient' }, { intensity: 0.3, sharpness: 0.2, time: 0.28, type: 'transient' }, { attackTime: 0.02, duration: 0.16, intensity: 0.22, releaseTime: 0.1, sharpness: 0.1, time: 0.34, type: 'continuous' }] },

  play: { curves: [{ parameter: 'intensity', points: [{ time: 0.06, value: 0.15 }, { time: 0.13, value: 0.45 }, { time: 0.2, value: 0.05 }], time: 0.06 }], events: [{ intensity: 0.5, sharpness: 0.8, time: 0, type: 'transient' }, { attackTime: 0.03, duration: 0.14, intensity: 0.4, releaseTime: 0.08, sharpness: 0.15, time: 0.06, type: 'continuous' }, { intensity: 0.6, sharpness: 0.25, time: 0.3, type: 'transient' }] },

  bath: { events: [{ intensity: 0.22, sharpness: 0.85, time: 0, type: 'transient' }, { intensity: 0.3, sharpness: 0.9, time: 0.07, type: 'transient' }, { intensity: 0.18, sharpness: 0.8, time: 0.13, type: 'transient' }, { intensity: 0.26, sharpness: 0.88, time: 0.2, type: 'transient' }, { intensity: 0.16, sharpness: 0.82, time: 0.27, type: 'transient' }, { intensity: 0.24, sharpness: 0.9, time: 0.35, type: 'transient' }] },

  sleep: { events: [{ attackTime: 0.45, duration: 1, intensity: 0.3, releaseTime: 0.5, sharpness: 0.05, time: 0, type: 'continuous' }] },

  levelup: { events: [{ intensity: 0.4, sharpness: 0.5, time: 0, type: 'transient' }, { intensity: 0.5, sharpness: 0.65, time: 0.1, type: 'transient' }, { intensity: 0.7, sharpness: 0.8, time: 0.22, type: 'transient' }] }
};

const channel =
  typeof window !== 'undefined' &&
  window.webkit &&
  window.webkit.messageHandlers &&
  window.webkit.messageHandlers.milqHaptics;

function send(payload) {
  if (channel) channel.postMessage(payload);
}

/// Plays a named haptic. Unknown names are ignored rather than throwing, so a
/// renamed effect never crashes a scene mid-frame.
///
/// Pass an id for an effect you intend to change or stop while it runs —
/// looping and sustained effects only. One-shots need no id.
export function haptic(name, id) {
  const effect = HAPTICS[name];
  if (!effect) return;
  send(id ? { ...effect, action: 'play', id } : effect);
}

/// Changes an effect that is already playing: intensity, sharpness or
/// playbackRate. Only reaches effects started with an id.
export function hapticUpdate(id, params) {
  send({ action: 'update', id, ...params });
}

/// Stops one running effect, or every one when called with no id.
export function hapticStop(id) {
  send({ action: 'stop', id });
}