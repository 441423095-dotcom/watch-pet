// 音效：全部用 Web Audio 现场合成，不加载任何音频文件，离线也能响。
// 由 index.html 以普通脚本加载，暴露 window.PetSound。

(function () {
  'use strict';

  var KEY = 'watchpet.muted';
  var ctx = null;
  var master = null;
  var muted = false;

  try {
    muted = localStorage.getItem(KEY) === '1';
  } catch (e) {
    muted = false;
  }

  function ensure() {
    if (muted) return null;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.6;
        master.connect(ctx.destination);
      } catch (e) {
        ctx = null;
        master = null;
        return null;
      }
    }
    if (ctx.state === 'suspended' && ctx.resume) {
      try {
        ctx.resume();
      } catch (e) {
        /* 有些浏览器不给恢复，等下一次点击就好 */
      }
    }
    return ctx;
  }

  // 带包络的振荡音
  function tone(at, freq, dur, gain, type, freqTo) {
    var osc = ctx.createOscillator();
    var amp = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, at);
    if (freqTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 20), at + dur);
    }
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), at + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(amp);
    amp.connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  // 一小撮噪声：咀嚼、泡泡、叹气
  function noise(at, dur, gain, freq, type) {
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    var src = ctx.createBufferSource();
    src.buffer = buffer;

    var filter = ctx.createBiquadFilter();
    filter.type = type || 'bandpass';
    filter.frequency.value = freq || 1200;
    filter.Q.value = 1.2;

    var amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), at + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    src.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  var SOUNDS = {
    // 摸一下：一声小小的「啵」
    poke: function (t) {
      tone(t, 880, 0.07, 0.12, 'sine', 1180);
    },

    // 吃东西：三下咀嚼的低音 + 细碎的脆响
    feed: function (t) {
      tone(t, 520, 0.07, 0.14, 'triangle', 470);
      tone(t + 0.11, 470, 0.07, 0.13, 'triangle', 420);
      tone(t + 0.22, 420, 0.08, 0.12, 'triangle', 380);
      noise(t + 0.02, 0.05, 0.05, 1500, 'bandpass');
      noise(t + 0.13, 0.05, 0.05, 1500, 'bandpass');
      noise(t + 0.24, 0.05, 0.05, 1500, 'bandpass');
    },

    // 玩耍：弹起来的琶音，落地时一声轻轻的闷响
    play: function (t) {
      tone(t, 784, 0.1, 0.12, 'triangle');
      tone(t + 0.08, 988, 0.1, 0.12, 'triangle');
      tone(t + 0.16, 1319, 0.14, 0.11, 'triangle');
      tone(t + 0.3, 196, 0.1, 0.1, 'sine', 165);
    },

    // 洗澡：泡泡一个个往上破，加一层水声
    bath: function (t) {
      tone(t, 700, 0.06, 0.09, 'sine', 1050);
      tone(t + 0.09, 900, 0.06, 0.08, 'sine', 1350);
      tone(t + 0.17, 780, 0.06, 0.08, 'sine', 1200);
      tone(t + 0.24, 1100, 0.06, 0.07, 'sine', 1600);
      noise(t + 0.02, 0.32, 0.06, 2600, 'highpass');
    },

    // 睡觉：一句很轻的下滑音
    sleep: function (t) {
      tone(t, 520, 0.55, 0.09, 'sine', 250);
      noise(t + 0.1, 0.5, 0.04, 600, 'lowpass');
    },

    // 醒来：两声向上的短音
    wake: function (t) {
      tone(t, 440, 0.09, 0.1, 'sine', 520);
      tone(t + 0.1, 660, 0.12, 0.1, 'sine', 700);
    },

    // 升级：四声向上的琶音 + 一点闪光
    levelup: function (t) {
      tone(t, 523, 0.11, 0.12, 'triangle');
      tone(t + 0.1, 659, 0.11, 0.12, 'triangle');
      tone(t + 0.2, 784, 0.11, 0.12, 'triangle');
      tone(t + 0.3, 1046, 0.24, 0.11, 'triangle');
      tone(t + 0.32, 1568, 0.3, 0.05, 'sine');
    },

    // 打开声音时的试听
    chirp: function (t) {
      tone(t, 960, 0.05, 0.06, 'sine', 1240);
    }
  };

  function play(name) {
    if (!ensure()) return;
    var fn = SOUNDS[name];
    if (!fn) return;
    try {
      fn(ctx.currentTime + 0.01);
    } catch (e) {
      /* 音效失败不打断玩法 */
    }
  }

  function setMuted(next) {
    muted = !!next;
    try {
      localStorage.setItem(KEY, muted ? '1' : '0');
    } catch (e) {
      /* 隐私模式下存不了，忽略 */
    }
  }

  window.PetSound = {
    play: play,
    isMuted: function () {
      return muted;
    },
    setMuted: setMuted
  };
})();
