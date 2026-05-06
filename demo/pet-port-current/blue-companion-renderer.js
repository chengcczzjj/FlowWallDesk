/* LingyueDesk Blue Companion pixel pet renderer.
   Standalone file: no UI, no DOM dependency except optional canvas setup.

   Browser usage:
     <script src="./blue-companion-renderer.js"></script>
     const canvas = document.querySelector("canvas");
     LingyueBlueCompanion.setupCanvas(canvas);
     function loop(now) {
       LingyueBlueCompanion.draw(canvas.getContext("2d"), "idle", now / 1000);
       requestAnimationFrame(loop);
     }
     requestAnimationFrame(loop);

   CommonJS usage:
     const Blue = require("./blue-companion-renderer.js");
*/
(function factory(root) {
  "use strict";

  const WIDTH = 80;
  const HEIGHT = 64;
  const SPRITE_OFFSET_X = 16;
  const SPRITE_OFFSET_Y = 8;

  const DEFAULT_OPTIONS = {
    speed: 1,
    intensity: 1,
    motion: true,
    effects: true,
    clear: true
  };

  const PROFILE = {
    id: "default-blue-companion",
    name: "Qinglan",
    description: "Blue twin-tail companion pixel pet.",
    palette: {
      accent: "#78CBE8",
      accent2: "#F0C56A",
      danger: "#E96B7A",
      stage: "#F0F9FC",
      ink: "#2A3B49",
      inkSoft: "#5E7C8E",
      fur: "#B7D8E8",
      furDark: "#6F94A7",
      belly: "#FFF1E7",
      muzzle: "#EFCFC3",
      mane: "#9ECBDD",
      maneLight: "#D7F2FB",
      earInner: "#F0A88F",
      spot: "#DCEEF5",
      lens: "#476679",
      lensLight: "#D8F6FF",
      blush: "#EE9AA7",
      fang: "#FFFDF2",
      shirt: "#F5EFE7",
      pants: "#8AAEC0",
      shoe: "#6A8798"
    },
    features: {
      avatarType: "human",
      characterStyle: "blueCompanion",
      earShape: "none",
      maneStyle: "long",
      tailStyle: "none",
      spotStyle: "none",
      accessory: "flower",
      vibe: "gentle"
    }
  };

  const STATES = {
    joy: { eyes: "happy", mouth: "bigSmile", arms: "wave", fx: "sparkle", pose: "sway", tempo: 1.2 },
    anger: { eyes: "angry", mouth: "snarl", arms: "panic", fx: "rage", pose: "stomp", tempo: 1.45 },
    sorrow: { eyes: "cry", mouth: "crying", arms: "sleep", fx: "tears", pose: "slump", tempo: 0.62 },
    delight: { eyes: "happy", mouth: "smile", arms: "wave", fx: "music", pose: "sway", tempo: 1.05 },
    surprise: { eyes: "shock", mouth: "smallOpen", arms: "panic", fx: "exclaim", pose: "alert", tempo: 1.45 },

    speaking: { eyes: "normal", mouth: "talk", arms: "wave", fx: "dots", pose: "talk", prop: "bubble", tempo: 1.1 },
    thinking: { eyes: "focused", mouth: "flat", arms: "think", fx: "dots", pose: "think", tempo: 0.85 },
    inspiration: { eyes: "happy", mouth: "bigSmile", arms: "wave", fx: "idea", pose: "sway", tempo: 1.25 },
    confused: { eyes: "confused", mouth: "smallOpen", arms: "shrug", fx: "question", pose: "tilt", tempo: 0.75 },
    error: { eyes: "shock", mouth: "wave", arms: "panic", fx: "exclaim", pose: "error", tempo: 1.65 },

    idle: { eyes: "normal", mouth: "smile", arms: "idle", fx: "none", pose: "idle", tempo: 0.7 },
    sit: { eyes: "normal", mouth: "tiny", arms: "sleep", fx: "none", pose: "sit", tempo: 0.45 },
    sleepy: { eyes: "sleepy", mouth: "sleep", arms: "sleep", fx: "zzz", pose: "sleep", tempo: 0.45 },
    walk: { eyes: "normal", mouth: "tiny", arms: "idle", fx: "flow", pose: "walk", tempo: 1.45 },
    jump: { eyes: "happy", mouth: "bigSmile", arms: "wave", fx: "sparkle", pose: "jump", tempo: 1.35 },

    reading: { eyes: "focused", mouth: "flat", arms: "book", fx: "book", pose: "work", prop: "book", tempo: 0.7 },
    music: { eyes: "happy", mouth: "smile", arms: "wave", fx: "music", pose: "sway", prop: "headphones", tempo: 1.1 },
    surfing: { eyes: "focused", mouth: "tiny", arms: "swipe", fx: "web", pose: "browse", prop: "browser", tempo: 1.05 },
    coding: { eyes: "focused", mouth: "tiny", arms: "type", fx: "code", pose: "work", prop: "codeRig", tempo: 1.45 },
    searching: { eyes: "confused", mouth: "flat", arms: "think", fx: "question", pose: "tilt", prop: "magnifier", tempo: 0.9 },
    organizing: { eyes: "focused", mouth: "flat", arms: "type", fx: "dots", pose: "work", prop: "cards", tempo: 1.0 },
    charging: { eyes: "sleepy", mouth: "sleep", arms: "sleep", fx: "sparkle", pose: "sit", prop: "battery", tempo: 0.55 }
  };

  const STATE_ORDER = Object.keys(STATES);

  const pixelGlyphs = {
    "?": ["1110", "0001", "0010", "0100", "0000", "0100"],
    "!": ["1", "1", "1", "1", "0", "1"],
    "Z": ["111", "001", "010", "100", "111"],
    "0": ["111", "101", "101", "101", "111"],
    "1": ["010", "110", "010", "010", "111"]
  };

  function setupCanvas(canvas, displayScale) {
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    if (displayScale) {
      canvas.style.width = `${WIDTH * displayScale}px`;
      canvas.style.height = `${HEIGHT * displayScale}px`;
    }
    canvas.style.imageRendering = "pixelated";
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  function draw(ctx, stateKey = "idle", time = 0, options = {}) {
    const settings = { ...DEFAULT_OPTIONS, ...options };
    const state = STATES[stateKey] || STATES.idle;
    const palette = { ...PROFILE.palette, ...(options.palette || {}) };
    const phase = time * state.tempo * settings.speed;
    const tick = Math.floor(phase * 6);
    const jumpLift = state.pose === "jump" && settings.motion
      ? -Math.max(0, Math.round(Math.max(0, Math.sin(phase * Math.PI * 2)) * 6 * settings.intensity))
      : 0;
    const shake = (state.pose === "error" || state.pose === "stomp") && settings.motion
      ? (Math.floor(phase * 12) % 2 === 0 ? -1 : 1) * Math.max(1, Math.round(settings.intensity))
      : 0;
    const sway = (state.pose === "sway" || state.pose === "talk") && settings.motion
      ? Math.round(Math.sin(phase * 2) * settings.intensity)
      : 0;

    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (settings.clear !== false) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    drawActionBackdrop(ctx, palette, state, phase, settings);
    ctx.save();
    ctx.translate(SPRITE_OFFSET_X, SPRITE_OFFSET_Y);
    drawShadow(ctx, phase, palette, settings, jumpLift);
    ctx.restore();

    ctx.save();
    ctx.translate(SPRITE_OFFSET_X + shake + sway, SPRITE_OFFSET_Y + jumpLift);
    drawBlueCompanion(ctx, palette, phase, settings, state, tick);
    drawBlueCompanionProp(ctx, palette, state.prop, phase, settings);
    drawActionCues(ctx, palette, state, phase, settings);
    ctx.restore();

    ctx.save();
    ctx.translate(SPRITE_OFFSET_X, SPRITE_OFFSET_Y);
    drawEffects(ctx, palette, state.fx, phase, settings);
    ctx.restore();
  }

  function px(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }

  function drawPixelText(ctx, x, y, glyph, color, scale = 1) {
    const map = pixelGlyphs[glyph];
    if (!map) return;
    map.forEach((row, rowIndex) => {
      [...row].forEach((cell, colIndex) => {
        if (cell === "1") px(ctx, x + colIndex * scale, y + rowIndex * scale, scale, scale, color);
      });
    });
  }

  function drawPixelString(ctx, x, y, text, color, scale = 1, gap = 1) {
    let cursor = x;
    [...String(text)].forEach((glyph) => {
      if (glyph === " ") {
        cursor += 3 * scale + gap;
        return;
      }
      const map = pixelGlyphs[glyph];
      if (!map) {
        cursor += 3 * scale + gap;
        return;
      }
      drawPixelText(ctx, cursor, y, glyph, color, scale);
      cursor += Math.max(...map.map((row) => row.length)) * scale + gap;
    });
  }

  function drawShadow(ctx, phase, palette, options, lift = 0) {
    const jumpSpread = Math.max(0, Math.abs(lift));
    const walkPulse = options.motion ? Math.abs(Math.sin(phase * 2)) : 0;
    const width = 22 + Math.round(walkPulse * 2) - Math.round(jumpSpread * 0.8);
    px(ctx, 24 - width / 2, 42, width, 1, "rgba(82, 55, 39, 0.20)");
    px(ctx, 19, 43, 10, 1, "rgba(82, 55, 39, 0.12)");
  }

  function drawBlueCompanion(ctx, palette, phase, options, state, tick) {
    const ink = palette.ink || "#17171b";
    const hair = palette.mane;
    const hairDark = colorMix(hair, "#223949", 0.24);
    const hairMid = colorMix(hair, palette.maneLight, 0.24);
    const hairLight = palette.maneLight;
    const skin = palette.muzzle;
    const skinDark = colorMix(skin, "#b98579", 0.34);
    const shirt = palette.shirt;
    const shirtShade = colorMix(shirt, palette.accent, 0.10);
    const eye = palette.accent;
    const shoe = palette.shoe;
    const flower = palette.fang || "#fff8ef";
    const flowerCore = palette.accent2 || "#f0ae54";
    const centerWidth = 48;
    const alt = options.motion ? tick % 2 : 0;
    const pulse = options.motion ? Math.floor(phase * 6) % 2 : 0;

    function dot(x, y, color) { px(ctx, x, y, 1, 1, color); }
    function block(x, y, w, h, color) {
      for (let row = 0; row < h; row += 1) {
        for (let col = 0; col < w; col += 1) dot(x + col, y + row, color);
      }
    }
    function mirrorBlock(x, y, w, h, color) {
      block(x, y, w, h, color);
      block(centerWidth - x - w, y, w, h, color);
    }
    function mirrorDot(x, y, color) {
      dot(x, y, color);
      dot(centerWidth - x - 1, y, color);
    }

    function drawTwinTails(y = 0, tucked = false) {
      if (tucked) {
        mirrorBlock(8, 19 + y, 7, 4, ink);
        mirrorBlock(6, 23 + y, 9, 11, ink);
        mirrorBlock(8, 20 + y, 5, 3, hairLight);
        mirrorBlock(7, 24 + y, 7, 9, hair);
        mirrorBlock(9, 32 + y, 4, 3, hairDark);
        return;
      }
      mirrorBlock(7, 13 + y, 7, 4, ink);
      mirrorBlock(5, 17 + y, 10, 16, ink);
      mirrorBlock(7, 33 + y, 7, 5, ink);
      mirrorBlock(8, 14 + y, 5, 3, hairLight);
      mirrorBlock(6, 18 + y, 8, 14, hair);
      mirrorBlock(8, 32 + y, 5, 5, hairDark);
      mirrorBlock(8, 20 + y, 2, 11, hairMid);
      mirrorBlock(12, 19 + y, 2, 13, colorMix(hairDark, "#000000", 0.05));
    }

    function drawHead(y = 0, eyes = state.eyes, mouth = state.mouth) {
      block(18, 6 + y, 12, 1, ink);
      block(15, 7 + y, 18, 1, ink);
      block(13, 8 + y, 22, 2, ink);
      block(12, 10 + y, 24, 5, ink);
      block(13, 15 + y, 22, 3, ink);
      block(18, 7 + y, 12, 1, hairLight);
      block(15, 8 + y, 18, 2, hairLight);
      block(14, 10 + y, 20, 3, hair);
      block(13, 13 + y, 22, 4, hair);
      block(16, 15 + y, 16, 2, hairLight);
      mirrorBlock(12, 18 + y, 3, 7, ink);
      mirrorBlock(13, 18 + y, 2, 6, hairDark);

      block(14, 17 + y, 20, 12, ink);
      block(15, 18 + y, 18, 10, skin);
      mirrorBlock(11, 20 + y, 3, 5, ink);
      mirrorBlock(12, 21 + y, 2, 3, skinDark);
      block(16, 27 + y, 16, 2, colorMix(skin, skinDark, 0.18));

      if (eyes === "happy") {
        mirrorBlock(17, 21 + y, 5, 1, ink);
        mirrorDot(18, 20 + y, ink);
        mirrorDot(20, 20 + y, ink);
      } else if (eyes === "sleepy") {
        mirrorBlock(17, 21 + y, 5, 1, ink);
      } else if (eyes === "angry") {
        mirrorBlock(17, 18 + y, 5, 1, palette.danger);
        mirrorBlock(17, 20 + y, 4, 3, ink);
        mirrorBlock(18, 21 + y, 2, 1, eye);
      } else if (eyes === "shock") {
        mirrorBlock(17, 19 + y, 5, 5, ink);
        mirrorBlock(18, 20 + y, 3, 3, eye);
        mirrorDot(19, 20 + y, "#ffffff");
      } else if (eyes === "cry") {
        mirrorBlock(17, 20 + y, 4, 3, ink);
        mirrorBlock(18, 21 + y, 2, 1, eye);
        mirrorBlock(19, 23 + y, 2, 3, "#59c8ff");
      } else {
        mirrorBlock(17, 20 + y, 4, 4, ink);
        mirrorBlock(18, 21 + y, 2, 2, eye);
        mirrorDot(18, 20 + y, "#ffffff");
      }

      mirrorBlock(17, 25 + y, 3, 1, palette.blush);
      if (mouth === "talk") {
        block(22, 24 + y, 5, pulse ? 2 : 1, pulse ? palette.muzzle : ink);
        if (pulse) block(23, 24 + y, 3, 1, "#fff6f0");
      } else if (mouth === "bigSmile") {
        block(21, 24 + y, 7, 1, ink);
        block(22, 25 + y, 5, 1, "#fff6f0");
      } else if (mouth === "smallOpen" || mouth === "crying") {
        block(23, 24 + y, 3, 2, ink);
        block(24, 24 + y, 1, 1, "#fff6f0");
      } else if (mouth === "snarl") {
        block(21, 24 + y, 7, 1, ink);
        dot(22, 25 + y, "#fff6f0");
        dot(27, 25 + y, "#fff6f0");
      } else if (mouth === "flat") {
        block(22, 25 + y, 5, 1, ink);
      } else if (mouth === "sleep") {
        block(23, 25 + y, 3, 1, ink);
      } else {
        block(22, 25 + y, 4, 1, ink);
      }
      dot(23, 24 + y, colorMix(skin, "#ffffff", 0.18));

      mirrorDot(11, 12 + y, flower);
      mirrorDot(10, 13 + y, flower);
      mirrorDot(12, 13 + y, flower);
      mirrorDot(11, 14 + y, flower);
      mirrorDot(11, 13 + y, flowerCore);
    }

    function drawBody(y = 0) {
      block(21, 29 + y, 6, 2, ink);
      block(22, 29 + y, 4, 2, skin);
      block(15, 31 + y, 18, 12, ink);
      block(16, 32 + y, 16, 10, shirt);
      block(18, 32 + y, 12, 3, colorMix(shirt, "#ffffff", 0.42));
      block(18, 36 + y, 12, 5, shirtShade);
    }

    function drawStandingLegs(y = 0, walking = false) {
      const step = walking ? alt : 0;
      mirrorBlock(18 + step, 42 + y, 4, 4, ink);
      mirrorBlock(19 + step, 42 + y, 2, 3, skin);
      block(16 + step, 45 + y, 7, 2, shoe);
      block(25 - step, 45 + y, 7, 2, shoe);
    }

    function drawArms(y = 0, armType = state.arms) {
      if (armType === "wave") {
        block(12, 33 + y, 4, 8, ink);
        block(13, 34 + y, 2, 6, skin);
        block(33, 25 - alt + y, 4, 12, ink);
        block(34, 24 - alt + y, 2, 10, skin);
        block(32, 23 - alt + y, 5, 2, skin);
        return;
      }
      if (armType === "panic") {
        mirrorBlock(10, 24 - alt + y, 4, 12, ink);
        mirrorBlock(11, 23 - alt + y, 2, 10, skin);
        mirrorBlock(9, 22 - alt + y, 5, 2, skin);
        return;
      }
      if (armType === "think") {
        block(12, 33 + y, 4, 8, ink);
        block(13, 34 + y, 2, 6, skin);
        block(31, 28 + y, 5, 7, ink);
        block(31, 27 + y, 4, 5, skin);
        dot(31, 26 + y, skinDark);
        return;
      }
      if (armType === "shrug" || armType === "swipe") {
        block(11, 32 + y, 7, 4, ink);
        block(11, 31 + y, 6, 3, skin);
        block(31, 30 - alt + y, 8, 4, ink);
        block(31, 29 - alt + y, 7, 3, skin);
        return;
      }
      if (armType === "type" || armType === "book") {
        block(12, 34 + alt + y, 8, 3, ink);
        block(13, 34 + alt + y, 7, 2, skin);
        block(28, 35 - alt + y, 8, 3, ink);
        block(28, 35 - alt + y, 7, 2, skin);
        return;
      }
      if (armType === "sleep") {
        block(12, 35 + y, 8, 3, ink);
        block(13, 35 + y, 7, 2, skin);
        block(28, 35 + y, 8, 3, ink);
        block(28, 35 + y, 7, 2, skin);
        return;
      }
      mirrorBlock(12, 33 + y, 4, 8, ink);
      mirrorBlock(13, 34 + y, 2, 6, skin);
    }

    function drawStandingPose() {
      const drop = state.pose === "slump" ? 2 : 0;
      const headDrop = state.pose === "slump" ? 2 : 0;
      drawTwinTails(drop);
      drawHead(headDrop);
      drawBody(drop);
      drawArms(drop);
      drawStandingLegs(drop, state.pose === "walk");
    }

    function drawSittingPose() {
      drawTwinTails(4, true);
      drawHead(5);
      drawBody(6);
      block(13, 42, 11, 4, ink);
      block(25, 42, 11, 4, ink);
      block(14, 42, 9, 3, skin);
      block(26, 42, 9, 3, skin);
      block(13, 45, 11, 2, shoe);
      block(25, 45, 11, 2, shoe);
      drawArms(6, state.arms === "sleep" ? "sleep" : state.arms);
    }

    function drawSleepingPose() {
      block(10, 40, 32, 2, "rgba(82, 55, 39, 0.12)");
      block(13, 32, 27, 10, ink);
      block(14, 33, 25, 8, shirt);
      block(17, 34, 19, 4, colorMix(shirt, "#ffffff", 0.42));
      block(28, 38, 9, 2, shirtShade);
      block(34, 36, 5, 3, skin);
      ctx.save();
      ctx.translate(-2, 10);
      drawTwinTails(2, true);
      drawHead(5, "sleepy", "sleep");
      ctx.restore();
    }

    ctx.save();
    if (state.pose === "sleep") {
      drawSleepingPose();
      ctx.restore();
      return;
    }
    ctx.translate(0, -5);
    if (state.pose === "sit") drawSittingPose();
    else drawStandingPose();
    ctx.restore();
  }

  function drawBlueCompanionProp(ctx, palette, prop, phase, options) {
    if (!prop) return;
    if (prop === "bubble") {
      const alt = options.motion ? Math.floor(phase * 6) % 2 : 0;
      const ink = palette.ink || "#17171b";
      px(ctx, 39, 10 - alt, 13, 8, ink);
      px(ctx, 40, 11 - alt, 11, 6, "#ffffff");
      px(ctx, 38, 16 - alt, 3, 3, ink);
      px(ctx, 42, 13 - alt, 2, 2, palette.accent);
      px(ctx, 47, 13 - alt, 2, 2, palette.accent2);
      return;
    }
    drawGenericProp(ctx, palette, prop, phase, options);
  }

  function drawGenericProp(ctx, palette, prop, phase, options) {
    const alt = options.motion ? Math.floor(phase * 6) % 2 : 0;
    const ink = palette.ink;
    const panel = colorMix(palette.belly, "#ffffff", 0.18);

    if (prop === "book") {
      px(ctx, 16, 31, 8, 7, ink);
      px(ctx, 24, 31, 8, 7, ink);
      px(ctx, 17, 32, 7, 5, palette.belly);
      px(ctx, 25, 32, 6, 5, panel);
      px(ctx, 24, 31, 1, 7, palette.inkSoft);
      px(ctx, 19, 34, 3, 1, palette.accent2);
      px(ctx, 27, 34, 3, 1, palette.accent);
      return;
    }

    if (prop === "headphones") {
      px(ctx, 13, 16, 2, 7, ink);
      px(ctx, 34, 16, 2, 7, ink);
      px(ctx, 14, 14, 2, 2, palette.accent);
      px(ctx, 32, 14, 2, 2, palette.accent);
      px(ctx, 16, 12, 16, 1, ink);
      px(ctx, 18, 11, 12, 1, palette.accent2);
      return;
    }

    if (prop === "browser") {
      const scroll = options.motion ? Math.floor(phase * 5) % 4 : 1;
      px(ctx, 31, 21, 15, 18, ink);
      px(ctx, 32, 22, 13, 16, "#eef8ff");
      px(ctx, 33, 23, 11, 3, colorMix(palette.accent, "#ffffff", 0.35));
      px(ctx, 34, 28 - scroll, 8, 1, palette.accent);
      px(ctx, 34, 31 - scroll, 6, 1, palette.accent2);
      px(ctx, 34, 34 - scroll, 9, 1, colorMix(palette.accent, "#000000", 0.06));
      px(ctx, 34, 37 - scroll, 5, 1, palette.accent);
      px(ctx, 36 + alt, 40, 4, 1, palette.accent2);
      return;
    }

    if (prop === "codeRig") {
      const cursor = options.motion ? Math.floor(phase * 6) % 2 : 1;
      px(ctx, 8, 30, 32, 12, ink);
      px(ctx, 10, 31, 28, 9, "#1d293d");
      drawPixelString(ctx, 12, 33, "101", palette.accent, 1, 1);
      drawPixelString(ctx, 23, 33, "0", palette.accent2, 1, 1);
      drawPixelString(ctx, 12, 37, "0 10", colorMix(palette.accent, "#ffffff", 0.24), 1, 1);
      if (cursor) px(ctx, 34, 37, 2, 4, palette.accent2);
      px(ctx, 6, 42, 36, 3, ink);
      px(ctx, 13, 41, 22, 1, palette.inkSoft);
      px(ctx, 18 + alt * 6, 43, 4, 1, colorMix(palette.accent2, "#ffffff", 0.2));
      return;
    }

    if (prop === "magnifier") {
      px(ctx, 34, 28, 7, 7, ink);
      px(ctx, 35, 29, 5, 5, "#ffffff");
      px(ctx, 36, 30, 3, 3, colorMix(palette.accent, "#ffffff", 0.46));
      px(ctx, 40, 34, 2, 2, ink);
      px(ctx, 42, 36, 2, 2, palette.shoe);
      return;
    }

    if (prop === "cards") {
      px(ctx, 12, 31, 9, 8, ink);
      px(ctx, 22, 30, 9, 8, ink);
      px(ctx, 17, 35, 9, 8, ink);
      px(ctx, 13, 32, 7, 6, "#ffffff");
      px(ctx, 23, 31, 7, 6, panel);
      px(ctx, 18, 36, 7, 6, colorMix(palette.accent, "#ffffff", 0.62));
      px(ctx, 15, 34, 3, 1, palette.accent2);
      px(ctx, 25, 33, 3, 1, palette.accent);
      return;
    }

    if (prop === "battery") {
      const fill = 1 + (options.motion ? Math.floor(phase * 2) % 4 : 3);
      px(ctx, 36, 31, 8, 12, ink);
      px(ctx, 38, 29, 4, 2, ink);
      px(ctx, 37, 32, 6, 10, "#ffffff");
      px(ctx, 38, 41 - fill * 2, 4, fill * 2, palette.accent);
      px(ctx, 31, 39, 5, 1, palette.accent2);
      px(ctx, 29, 38, 2, 2, palette.accent2);
    }
  }

  function drawEffects(ctx, palette, fx, phase, options) {
    if (!options.effects) return;
    const active = Math.floor(phase * 3) % 3;

    if (fx === "dots") {
      [0, 1, 2].forEach((dot) => {
        const color = dot === active ? palette.accent2 : colorMix(palette.accent2, "#000000", 0.42);
        px(ctx, 7 + dot * 5, 7 - (dot === active ? 1 : 0), 2, 2, color);
      });
    }

    if (fx === "sparkle") {
      const lift = Math.floor(Math.sin(phase * 2) + 1);
      drawSpark(ctx, 11, 10 - lift, palette.accent2);
      drawSpark(ctx, 36, 13 + lift, palette.accent);
      drawSpark(ctx, 9, 29, palette.accent);
    }

    if (fx === "question") {
      const y = 5 + Math.round(Math.sin(phase * 2) * 1);
      drawPixelText(ctx, 40, y, "?", palette.accent2, 2);
    }

    if (fx === "exclaim") {
      drawPixelText(ctx, 45, 4, "!", palette.danger, 2);
      px(ctx, 4, 24, 3, 5, "#75d6ff");
      px(ctx, 5, 30, 2, 2, "#75d6ff");
    }

    if (fx === "rage") {
      const pulse = options.motion ? Math.floor(phase * 8) % 2 : 0;
      drawPixelText(ctx, 43, 3 - pulse, "!", palette.danger, 2);
      px(ctx, 7, 8, 3, 2, palette.danger);
      px(ctx, 10, 6, 2, 2, palette.danger);
      px(ctx, 38, 10, 5, 2, palette.danger);
      px(ctx, 41, 8, 3, 2, colorMix(palette.danger, "#ffffff", 0.14));
    }

    if (fx === "tears") {
      const drop = options.motion ? Math.floor(phase * 6) % 7 : 3;
      px(ctx, 14, 23 + drop, 2, 3, "#59c8ff");
      px(ctx, 33, 22 + ((drop + 3) % 7), 2, 3, "#59c8ff");
      px(ctx, 10, 36, 4, 1, "rgba(89, 200, 255, 0.42)");
      px(ctx, 35, 37, 5, 1, "rgba(89, 200, 255, 0.34)");
    }

    if (fx === "zzz") {
      const drift = Math.floor(phase * 2) % 3;
      drawPixelText(ctx, 35, 8 - drift, "Z", palette.accent, 1);
      drawPixelText(ctx, 40, 3 - drift, "Z", colorMix(palette.accent, "#ffffff", 0.28), 1);
    }

    if (fx === "flow") {
      const offset = Math.floor(phase * 10) % 14;
      px(ctx, 17 + offset, 39, 2, 1, palette.accent2);
      px(ctx, 31 - offset, 32, 1, 1, palette.accent);
      px(ctx, 12 + (offset % 8), 12, 1, 1, colorMix(palette.accent, "#ffffff", 0.25));
    }

    if (fx === "idea") {
      const lift = Math.floor(Math.sin(phase * 2) + 1);
      px(ctx, 42, 4 - lift, 6, 6, palette.accent2);
      px(ctx, 44, 3 - lift, 2, 1, colorMix(palette.accent2, "#ffffff", 0.35));
      px(ctx, 44, 10 - lift, 2, 2, palette.ink);
      px(ctx, 42, 13 - lift, 6, 1, palette.accent2);
    }

    if (fx === "music") {
      const bounce = Math.floor(phase * 4) % 2;
      px(ctx, 39, 5 - bounce, 2, 8, palette.accent);
      px(ctx, 41, 5 - bounce, 5, 2, palette.accent);
      px(ctx, 45, 7 - bounce, 2, 7, palette.accent);
      px(ctx, 37, 13 - bounce, 4, 3, palette.accent2);
      px(ctx, 43, 14 - bounce, 4, 3, palette.accent2);
    }

    if (fx === "book") {
      px(ctx, 8, 11, 2, 1, palette.accent2);
      px(ctx, 11, 9, 2, 1, colorMix(palette.accent2, "#ffffff", 0.18));
      px(ctx, 14, 12, 2, 1, palette.accent);
    }
  }

  function drawSpark(ctx, x, y, color) {
    px(ctx, x + 1, y, 1, 3, color);
    px(ctx, x, y + 1, 3, 1, color);
    px(ctx, x + 1, y + 1, 1, 1, "#ffffff");
  }

  function drawActionBackdrop(ctx, palette, state, phase, options) {
    if (!options.effects) return;
    if (state.fx === "code") drawCodeBackdrop(ctx, palette, phase, options);
    if (state.fx === "web") drawWebBackdrop(ctx, palette, phase, options);
  }

  function drawCodeBackdrop(ctx, palette, phase, options) {
    const streams = ["0 10", "101", "0101", "1 0", "10 1", "001"];
    const scroll = options.motion ? Math.floor(phase * 7) % 12 : 0;
    const inkGlow = colorMix(palette.accent, "#ffffff", 0.28);
    const hotGlow = colorMix(palette.accent2, "#ffffff", 0.18);
    px(ctx, 4, 8, 19, 40, "rgba(43, 62, 86, 0.10)");
    px(ctx, 56, 5, 18, 45, "rgba(43, 62, 86, 0.08)");
    px(ctx, 2, 48, 76, 1, "rgba(43, 62, 86, 0.08)");
    streams.forEach((text, index) => {
      let y = 6 + index * 9 - scroll;
      while (y < -6) y += 58;
      const x = index % 2 ? 56 + (index % 3) * 2 : 5 + (index % 3);
      const color = index === Math.floor(phase * 2) % streams.length ? hotGlow : inkGlow;
      drawPixelString(ctx, x, y, text, color, 1, 1);
    });
  }

  function drawWebBackdrop(ctx, palette, phase, options) {
    const drift = options.motion ? Math.floor(phase * 5) % 18 : 0;
    const cards = [
      { x: 5, y: 10, w: 18, h: 12, speed: 1 },
      { x: 55, y: 8, w: 19, h: 14, speed: -1 },
      { x: 3, y: 40, w: 21, h: 11, speed: -1 },
      { x: 58, y: 43, w: 16, h: 10, speed: 1 }
    ];
    cards.forEach((card, index) => {
      const y = card.y + Math.round(Math.sin((phase + index) * 1.7) * 2) + (card.speed * drift) % 6;
      const fill = index % 2 === 0 ? "rgba(255, 255, 255, 0.72)" : "rgba(229, 246, 255, 0.72)";
      px(ctx, card.x, y, card.w, card.h, "rgba(70, 90, 113, 0.20)");
      px(ctx, card.x + 1, y + 1, card.w - 2, card.h - 2, fill);
      px(ctx, card.x + 2, y + 2, card.w - 4, 2, colorMix(palette.accent, "#ffffff", 0.28));
      px(ctx, card.x + 3, y + 6, card.w - 8, 1, palette.accent);
      px(ctx, card.x + 3, y + 8, Math.max(4, card.w - 11), 1, palette.accent2);
    });
  }

  function drawActionCues(ctx, palette, state, phase, options) {
    if (!options.effects) return;
    const pulse = options.motion ? Math.floor(phase * 6) % 2 : 0;

    if (state.pose === "walk") {
      const step = Math.floor(phase * 6) % 2;
      px(ctx, 9 + step * 3, 43, 5, 1, "rgba(82, 55, 39, 0.20)");
      px(ctx, 31 - step * 2, 43, 5, 1, "rgba(82, 55, 39, 0.16)");
    }

    if (state.pose === "jump") {
      px(ctx, 10, 33 + pulse, 1, 6, colorMix(palette.accent, "#ffffff", 0.30));
      px(ctx, 37, 34 - pulse, 1, 5, palette.accent2);
      px(ctx, 18, 43, 12, 1, "rgba(82, 55, 39, 0.13)");
    }

    if (state.pose === "stomp" || state.pose === "error") {
      px(ctx, 12, 42, 7, 1, palette.danger);
      px(ctx, 28, 42, 7, 1, palette.danger);
      px(ctx, 9 + pulse, 40, 2, 1, colorMix(palette.danger, "#ffffff", 0.18));
    }

    if (state.pose === "talk") {
      px(ctx, 14, 15 + pulse, 6, 1, palette.accent);
      px(ctx, 14, 17 + pulse, 4, 1, palette.accent2);
    }

    if (state.pose === "think") {
      px(ctx, 37, 13 - pulse, 2, 2, colorMix(palette.accent, "#ffffff", 0.30));
      px(ctx, 41, 10 + pulse, 2, 2, palette.accent2);
      px(ctx, 35, 18, 1, 1, colorMix(palette.accent, "#000000", 0.18));
    }

    if (state.prop === "headphones") {
      [0, 1, 2].forEach((bar) => {
        const h = 2 + ((Math.floor(phase * 5) + bar) % 3);
        px(ctx, 40 + bar * 2, 18 - h, 1, h, bar % 2 ? palette.accent2 : palette.accent);
      });
    }

    if (state.prop === "battery") {
      px(ctx, 34, 29 - pulse, 2, 2, palette.accent2);
      px(ctx, 31, 33 + pulse, 2, 2, palette.accent);
    }
  }

  function colorMix(colorA, colorB, amount) {
    const a = hexToRgb(colorA);
    const b = hexToRgb(colorB);
    const mix = {
      r: Math.round(a.r + (b.r - a.r) * amount),
      g: Math.round(a.g + (b.g - a.g) * amount),
      b: Math.round(a.b + (b.b - a.b) * amount)
    };
    return `rgb(${mix.r}, ${mix.g}, ${mix.b})`;
  }

  function hexToRgb(hex) {
    const normalized = String(hex || "#000000").replace("#", "");
    return {
      r: parseInt(normalized.slice(0, 2), 16) || 0,
      g: parseInt(normalized.slice(2, 4), 16) || 0,
      b: parseInt(normalized.slice(4, 6), 16) || 0
    };
  }

  const api = {
    WIDTH,
    HEIGHT,
    SPRITE_OFFSET_X,
    SPRITE_OFFSET_Y,
    PROFILE,
    STATES,
    STATE_ORDER,
    DEFAULT_OPTIONS,
    setupCanvas,
    draw
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.LingyueBlueCompanion = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
