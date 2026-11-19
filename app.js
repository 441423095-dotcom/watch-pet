(function () {
  'use strict';

  var KEY = 'watchpet.v1';
  var TAU = Math.PI * 2;

  // 四条表盘圆环的周长，与 index.html 中的半径（116 / 101 / 86 / 71）一一对应
  var RING = {
    hunger: TAU * 116,
    mood: TAU * 101,
    energy: TAU * 86,
    clean: TAU * 71
  };

  // 表盘画布的设计尺寸，与 Apple Watch 45mm 一致
  var DESIGN_W = 396;
  var DESIGN_H = 484;

  // 每分钟的自然消耗
  var DECAY = { hunger: 1.5, mood: 1.0, energy: 0.8, clean: 0.5 };
  var REGEN = 2.6;                 // 睡觉时每分钟恢复的精力
  var OFFLINE_CAP = 8 * 60 * 60e3; // 离线最多结算 8 小时

  var NAMES = ['小豆', '圆豆', '豆丁', '豆仔', '豆哥', '豆侠', '豆仙'];

  var LINES = {
    feed: ['好吃！', '再来一口嘛~', '咔嚓咔嚓', '谢谢主人！'],
    play: ['好开心！', '再来一次！', '接住球球！', '耶——'],
    bath: ['泡泡好多~', '香香的！', '洗完滑溜溜'],
    sleep: ['晚安…', '呼…呼…', 'Zzz…'],
    wake: ['睡饱啦！', '早安~', '精神满满！'],
    poke: ['嘿嘿~', '摸摸头', '痒痒的']
  };

  var el = {
    device: document.getElementById('device'),
    screen: document.getElementById('screen'),
    clockTime: document.getElementById('clockTime'),
    clockDate: document.getElementById('clockDate'),
    bubble: document.getElementById('bubble'),
    petWrap: document.getElementById('petWrap'),
    mouth: document.getElementById('mouth'),
    fx: document.getElementById('fx'),
    badgeText: document.getElementById('badgeText'),
    xpBar: document.getElementById('xpBar'),
    sleepEmoji: document.getElementById('sleepEmoji'),
    sleepLabel: document.getElementById('sleepLabel'),
    rings: {
      hunger: document.getElementById('ringHunger'),
      mood: document.getElementById('ringMood'),
      energy: document.getElementById('ringEnergy'),
      clean: document.getElementById('ringClean')
    },
    vals: {
      hunger: document.getElementById('valHunger'),
      mood: document.getElementById('valMood'),
      energy: document.getElementById('valEnergy'),
      clean: document.getElementById('valClean')
    }
  };

  var state = {
    hunger: 100,
    mood: 100,
    energy: 100,
    clean: 100,
    level: 1,
    xp: 0,
    asleep: false,
    last: Date.now()
  };

  var bubbleTimer = 0;
  var lastTick = Date.now();
  var tickCount = 0;

  // 触感：效果定义在 src/haptics.js，在 App 的浏览器里走 Taptic Engine，普通浏览器里静默跳过
  var playHaptic = function () {};

  import('./src/haptics.js').then(function (mod) {
    if (mod && typeof mod.haptic === 'function') playHaptic = mod.haptic;
  }).catch(function () {
    /* 不支持时保持空实现 */
  });

  // 音效：由 src/audio.js 现场合成，不需要任何音频文件
  function sound(name) {
    if (window.PetSound) window.PetSound.play(name);
  }

  function clamp(n) {
    return Math.max(0, Math.min(100, n));
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function xpNeeded(level) {
    return 24 + level * 12;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;
      state.hunger = clamp(Number(saved.hunger) || 0);
      state.mood = clamp(Number(saved.mood) || 0);
      state.energy = clamp(Number(saved.energy) || 0);
      state.clean = clamp(Number(saved.clean) || 0);
      state.level = Math.max(1, Math.floor(Number(saved.level) || 1));
      state.xp = Math.max(0, Number(saved.xp) || 0);
      state.asleep = !!saved.asleep;
      state.last = Number(saved.last) || Date.now();
    } catch (e) {
      /* 存档损坏时按新宠物开始 */
    }
  }

  function save() {
    try {
      state.last = Date.now();
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* 隐私模式下无法写入，忽略即可 */
    }
  }

  // ---------- 时间结算 ----------

  function applyElapsed(ms) {
    var minutes = Math.min(Math.max(ms, 0), OFFLINE_CAP) / 60000;
    if (minutes <= 0) return false;

    state.hunger -= DECAY.hunger * minutes;
    state.mood -= DECAY.mood * minutes;
    state.clean -= DECAY.clean * minutes;

    if (state.asleep) {
      state.energy += REGEN * minutes;
    } else {
      state.energy -= DECAY.energy * minutes;
    }

    state.hunger = clamp(state.hunger);
    state.mood = clamp(state.mood);
    state.clean = clamp(state.clean);
    state.energy = clamp(state.energy);

    if (state.asleep && state.energy >= 100) {
      state.asleep = false;
      return 'wake';
    }

    if (!state.asleep && state.energy <= 0) {
      state.asleep = true;
      return 'collapse';
    }

    return false;
  }

  // ---------- 渲染 ----------

  function render() {
    var keys = ['hunger', 'mood', 'energy', 'clean'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = state[k];
      var circ = RING[k];
      if (el.rings[k]) {
        el.rings[k].style.strokeDasharray = (v / 100) * circ + ' ' + circ;
      }
      if (el.vals[k]) {
        el.vals[k].textContent = Math.round(v);
      }
    }

    var need = xpNeeded(state.level);
    if (el.badgeText) {
      var name = NAMES[Math.min(state.level - 1, NAMES.length - 1)];
      el.badgeText.textContent = 'Lv.' + state.level + ' ' + name;
    }
    if (el.xpBar) {
      el.xpBar.style.width = Math.min(100, (state.xp / need) * 100) + '%';
    }

    if (el.petWrap) {
      var sad = Math.min(state.hunger, state.mood, state.clean) < 28;
      el.petWrap.classList.toggle('asleep', state.asleep);
      el.petWrap.classList.toggle('sad', sad && !state.asleep);
    }

    if (el.screen) {
      el.screen.classList.toggle('is-sleep', state.asleep);
      el.screen.classList.toggle('is-sad', sad && !state.asleep);
    }

    if (el.mouth) {
      if (state.asleep) {
        el.mouth.setAttribute('d', 'M54 83 q6 3 12 0');
      } else if (Math.min(state.hunger, state.mood, state.clean) < 28) {
        el.mouth.setAttribute('d', 'M52 86 q8 -7 16 0');
      } else {
        el.mouth.setAttribute('d', 'M52 81 q8 6 16 0');
      }
    }

    if (el.sleepEmoji && el.sleepLabel) {
      el.sleepEmoji.textContent = state.asleep ? '☀️' : '🌙';
      el.sleepLabel.textContent = state.asleep ? '起床' : '睡觉';
    }
  }

  function clock() {
    var now = new Date();
    var hh = String(now.getHours()).padStart(2, '0');
    var mm = String(now.getMinutes()).padStart(2, '0');
    if (el.clockTime) el.clockTime.textContent = hh + ':' + mm;
    if (el.clockDate) {
      el.clockDate.textContent = now.toLocaleDateString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        weekday: 'short'
      });
    }
  }

  // ---------- 适配屏幕 ----------
  // 表盘按 396 × 484 排版，再整体缩放：手机上是等比预览，手表上刚好铺满。

  function fit() {
    if (!el.device) return;
    var pad = 8;
    var vw = window.innerWidth || DESIGN_W;
    var vh = window.innerHeight || DESIGN_H;
    var s = Math.min((vw - pad * 2) / DESIGN_W, (vh - pad * 2) / DESIGN_H);
    if (!isFinite(s) || s <= 0) s = 1;
    s = Math.min(s, 1.25);
    el.device.style.transform = 'scale(' + s.toFixed(4) + ')';
  }

  // ---------- 眨眼 ----------

  function blinkLoop() {
    var delay = 2600 + Math.random() * 4200;
    setTimeout(function () {
      if (el.petWrap && !state.asleep) {
        el.petWrap.classList.add('blink');
        setTimeout(function () {
          if (el.petWrap) el.petWrap.classList.remove('blink');
        }, 150);
      }
      blinkLoop();
    }, delay);
  }

  // ---------- 互动反馈 ----------

  function say(text) {
    if (!el.bubble) return;
    el.bubble.textContent = text;
    el.bubble.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () {
      el.bubble.classList.remove('show');
    }, 2200);
  }

  function burst(emoji, count) {
    if (!el.fx) return;
    for (var i = 0; i < count; i++) {
      var node = document.createElement('i');
      node.textContent = emoji;
      node.style.left = 26 + Math.random() * 48 + '%';
      node.style.top = 40 + Math.random() * 26 + '%';
      node.style.setProperty('--dx', Math.round(Math.random() * 46 - 23) + 'px');
      node.style.animationDelay = Math.round(Math.random() * 160) + 'ms';
      el.fx.appendChild(node);
      (function (n) {
        setTimeout(function () {
          if (n.parentNode) n.parentNode.removeChild(n);
        }, 1300);
      })(node);
    }
  }

  function playAnim(cls) {
    if (!el.petWrap) return;
    el.petWrap.classList.remove('hop', 'shake');
    // 强制重排，让同一个动画可以连续触发
    void el.petWrap.offsetWidth;
    el.petWrap.classList.add(cls);
    setTimeout(function () {
      el.petWrap.classList.remove(cls);
    }, 700);
  }

  function addXp(amount) {
    state.xp += amount;
    var leveled = false;
    var need = xpNeeded(state.level);
    while (state.xp >= need) {
      state.xp -= need;
      state.level += 1;
      leveled = true;
      need = xpNeeded(state.level);
    }
    return leveled;
  }

  function wake() {
    if (!state.asleep) return false;
    state.asleep = false;
    return true;
  }

  // ---------- 四种照顾 ----------

  var ACTIONS = {
    feed: function () {
      state.hunger = clamp(state.hunger + 26);
      state.mood = clamp(state.mood + 4);
      state.clean = clamp(state.clean - 3);
      addXp(6);
      playHaptic('feed');
      sound('feed');
      burst('🍖', 5);
      playAnim('hop');
      say(pick(LINES.feed));
    },
    play: function () {
      if (state.energy < 12) {
        playHaptic('poke');
        playAnim('shake');
        say('太累了，先睡一觉吧…');
        return false;
      }
      state.mood = clamp(state.mood + 22);
      state.energy = clamp(state.energy - 14);
      state.hunger = clamp(state.hunger - 8);
      addXp(8);
      playHaptic('play');
      sound('play');
      burst('✨', 6);
      playAnim('hop');
      say(pick(LINES.play));
    },
    bath: function () {
      state.clean = clamp(state.clean + 34);
      state.mood = clamp(state.mood + 6);
      addXp(6);
      playHaptic('bath');
      sound('bath');
      burst('🫧', 6);
      playAnim('shake');
      say(pick(LINES.bath));
    },
    sleep: function () {
      if (state.asleep) {
        state.asleep = false;
        addXp(2);
        playHaptic('poke');
        sound('wake');
        burst('☀️', 3);
        say(pick(LINES.wake));
      } else {
        state.asleep = true;
        addXp(2);
        playHaptic('sleep');
        sound('sleep');
        say(pick(LINES.sleep));
      }
    }
  };

  function doAction(name) {
    var fn = ACTIONS[name];
    if (!fn) return;

    if (name !== 'sleep' && wake()) {
      say('被你弄醒啦…');
      render();
      save();
      return;
    }

    var before = state.level;
    fn();
    if (state.level > before) {
      playHaptic('levelup');
      sound('levelup');
      say('升级啦！Lv.' + state.level + ' · ' + NAMES[Math.min(state.level - 1, NAMES.length - 1)]);
    }
    render();
    save();
  }

  // ---------- 闲置台词 ----------

  function idleLine() {
    if (state.asleep) return pick(LINES.sleep);
    var pairs = [
      [state.hunger, '肚子咕咕叫…'],
      [state.mood, '陪我玩一会儿嘛~'],
      [state.clean, '身上黏黏的…'],
      [state.energy, '有点困了…']
    ];
    var lowest = pairs[0];
    for (var i = 1; i < pairs.length; i++) {
      if (pairs[i][0] < lowest[0]) lowest = pairs[i];
    }
    if (lowest[0] < 32) return lowest[1];
    return pick(['在看着你哦', '今天也加油！', '滴答…滴答…', '摸摸头嘛']);
  }

  // ---------- 事件绑定 ----------

  var buttons = document.querySelectorAll('.act');
  for (var b = 0; b < buttons.length; b++) {
    buttons[b].addEventListener('click', function () {
      doAction(this.getAttribute('data-action'));
    });
  }

  // 声音开关：图标记住上次的选择，第一次点按钮时才会真正创建音频
  var soundBtn = document.getElementById('soundToggle');
  if (soundBtn) {
    if (!window.PetSound) {
      soundBtn.hidden = true;
    } else {
      var muted = window.PetSound.isMuted();
      soundBtn.textContent = muted ? '🔇' : '🔊';
      soundBtn.classList.toggle('muted', muted);
      soundBtn.addEventListener('click', function () {
        var next = !window.PetSound.isMuted();
        window.PetSound.setMuted(next);
        soundBtn.textContent = next ? '🔇' : '🔊';
        soundBtn.classList.toggle('muted', next);
        if (!next) window.PetSound.play('chirp');
      });
    }
  }

  if (el.petWrap) {
    el.petWrap.addEventListener('click', function () {
      if (state.asleep) {
        say(pick(LINES.sleep));
        return;
      }
      state.mood = clamp(state.mood + 3);
      addXp(1);
      playHaptic('poke');
      sound('poke');
      playAnim('hop');
      say(pick(LINES.poke));
      render();
      save();
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      save();
    } else {
      lastTick = Date.now();
      applyElapsed(Date.now() - state.last);
      render();
    }
  });

  window.addEventListener('pagehide', save);
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);

  // ---------- 启动 ----------

  load();
  applyElapsed(Date.now() - state.last);
  clock();
  fit();
  render();
  save();
  blinkLoop();

  setInterval(clock, 1000);

  setInterval(function () {
    var now = Date.now();
    var status = applyElapsed(now - lastTick);
    lastTick = now;

    if (status === 'wake') {
      say('睡饱啦！');
    } else if (status === 'collapse') {
      say('太累了，先睡一会儿…');
    }

    render();

    // 存档不需要每秒都写，五秒一次足够
    tickCount += 1;
    if (tickCount % 5 === 0) save();
  }, 1000);

  setInterval(function () {
    if (document.hidden) return;
    say(idleLine());
  }, 42000);
})();
