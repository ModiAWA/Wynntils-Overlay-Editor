(function (root, factory) {
  const api = factory(
    root.WYNNTILS_FONT_RESOURCES || { assets: {}, fonts: {}, source: {} },
    root.WynntilsSimulationProfile || { SHADER_COLORS: {} },
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WynntilsCanvasRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function (resources, profile) {
  'use strict';

  const MC_COLORS = Object.freeze({
    0: '#000000FF',
    1: '#0000AAFF',
    2: '#00AA00FF',
    3: '#00AAAAFF',
    4: '#AA0000FF',
    5: '#AA00AAFF',
    6: '#FFAA00FF',
    7: '#AAAAAAFF',
    8: '#555555FF',
    9: '#5555FFFF',
    a: '#55FF55FF',
    b: '#55FFFFFF',
    c: '#FF5555FF',
    d: '#FF55FFFF',
    e: '#FFFF55FF',
    f: '#FFFFFFFF',
  });

  const DEFAULT_COLOR = '#FFFFFFFF';
  const MAX_RENDER_INPUT_LENGTH = profile.MAX_PREVIEW_TEXT_LENGTH || 4096;
  const SHADER_BY_COLOR = new Map(
    Object.entries(profile.SHADER_COLORS || {}).map(([name, color]) => [
      normalizeHexColor(color).slice(0, 7),
      name,
    ]),
  );

  const TEXT_ADVANCES = Object.freeze({
    ' ': 4,
    '!': 2,
    '"': 5,
    "'": 3,
    '(': 4,
    ')': 4,
    '*': 4,
    ',': 2,
    '.': 2,
    ':': 2,
    ';': 2,
    '<': 5,
    '>': 5,
    '@': 7,
    I: 4,
    '[': 4,
    ']': 4,
    '`': 3,
    f: 5,
    i: 2,
    k: 5,
    l: 3,
    t: 4,
    '{': 5,
    '|': 2,
    '}': 5,
    '~': 7,
  });

  function normalizeHexColor(value) {
    const match = String(value || '')
      .trim()
      .match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
    return match ? `#${match[1].toUpperCase()}${(match[2] || 'FF').toUpperCase()}` : '';
  }

  function rgbColor(red, green, blue) {
    const channels = [red, green, blue].map(Number);
    if (channels.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
      return '';
    }
    return `#${channels
      .map((channel) => channel.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()}FF`;
  }

  function resolveColorTemplate(value) {
    const source = String(value || '').trim();
    if (!source) return { color: DEFAULT_COLOR, resolved: true };
    const direct = normalizeHexColor(source);
    if (direct) return { color: direct, resolved: true };
    const legacy = source.match(/^[&§]([0-9a-f])$/i);
    if (legacy) return { color: MC_COLORS[legacy[1].toLowerCase()], resolved: true };

    const fromHex = source.match(
      /^\{\s*from_hex\s*\(\s*"?#?([0-9a-f]{6}(?:[0-9a-f]{2})?)"?\s*\)\s*\}$/i,
    );
    if (fromHex) return { color: normalizeHexColor(fromHex[1]), resolved: true };

    const fromRgb = source.match(
      /^\{\s*from_rgb\s*\(\s*(-?\d+)\s*;\s*(-?\d+)\s*;\s*(-?\d+)\s*\)\s*\}$/i,
    );
    if (fromRgb) {
      const color = rgbColor(fromRgb[1], fromRgb[2], fromRgb[3]);
      if (color) return { color, resolved: true };
    }

    const fromPercent = source.match(
      /^\{\s*from_rgb_percent\s*\(\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*;\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*;\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*\)\s*\}$/i,
    );
    if (fromPercent) {
      const fractions = fromPercent.slice(1).map(Number);
      if (fractions.every((channel) => channel >= 0 && channel <= 1)) {
        return {
          color: rgbColor(...fractions.map((channel) => Math.trunc(channel * 255))),
          resolved: true,
        };
      }
    }
    return { color: DEFAULT_COLOR, resolved: false };
  }

  const EDGE_GLYPHS = Object.freeze({
    0xe008: Object.freeze({ asset: 'ribbon_start', advance: 7 }),
    0xe009: Object.freeze({ asset: 'ribbon_end', advance: 7 }),
    0xe00a: Object.freeze({ asset: 'flag_start', advance: 5 }),
    0xe00b: Object.freeze({ asset: 'flag_end', advance: 5 }),
    0xe00c: Object.freeze({ asset: 'box_start', advance: 2 }),
    0xe00d: Object.freeze({ asset: 'box_end', advance: 2 }),
  });

  const FONT_CODES = Object.freeze({
    d: 'minecraft:default',
    wynntils_five: 'wynntils:five',
    wynntils_banners: 'wynntils:banners',
  });

  function defaultStyle(fontId, initialColor) {
    return {
      color: normalizeHexColor(initialColor) || DEFAULT_COLOR,
      shader: '',
      fontId: fontId || 'minecraft:default',
      shadowColor: '',
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      obfuscated: false,
    };
  }

  function copyStyle(style) {
    return { ...style };
  }

  function resetDecorations(style) {
    style.bold = false;
    style.italic = false;
    style.underline = false;
    style.strike = false;
    style.obfuscated = false;
  }

  function parseFormattedText(value, initialFontId, initialColor) {
    const input = String(value == null ? '' : value).slice(0, MAX_RENDER_INPUT_LENGTH);
    const lines = [[]];
    const style = defaultStyle(initialFontId, initialColor);

    function pushCharacter(character) {
      lines[lines.length - 1].push({ char: character, style: copyStyle(style) });
    }

    for (let index = 0; index < input.length;) {
      if (input[index] === '\n' || (input[index] === '\\' && input[index + 1] === 'n')) {
        lines.push([]);
        index += input[index] === '\n' ? 1 : 2;
        continue;
      }

      if (input[index] === '\\' && ['&', '{', '}'].includes(input[index + 1])) {
        pushCharacter(input[index + 1]);
        index += 2;
        continue;
      }

      const prefix = input[index];
      if (prefix === '&' || prefix === '§') {
        const tail = input.slice(index);
        const hexMatch = tail.match(/^[&§]#([0-9a-f]{8})/i);
        if (hexMatch) {
          style.color = `#${hexMatch[1].toUpperCase()}`;
          style.shader = SHADER_BY_COLOR.get(style.color.slice(0, 7)) || '';
          resetDecorations(style);
          index += hexMatch[0].length;
          continue;
        }

        const fontMatch = tail.match(/^[&§]\{fr:([^}]+)\}/i);
        if (fontMatch) {
          style.fontId = FONT_CODES[fontMatch[1]] || fontMatch[1];
          index += fontMatch[0].length;
          continue;
        }

        const atlasFontMatch = tail.match(/^[&§]\{fas:([^;{}]*);([^{}]*)\}/i);
        if (atlasFontMatch) {
          style.fontId = `atlas:${atlasFontMatch[1]};${atlasFontMatch[2]}`;
          index += atlasFontMatch[0].length;
          continue;
        }

        const playerFontMatch = tail.match(/^[&§]\{fps:([^;{}]*);([^{}]*)\}/i);
        if (playerFontMatch) {
          style.fontId = `player:${playerFontMatch[1]};${playerFontMatch[2]}`;
          index += playerFontMatch[0].length;
          continue;
        }

        const shadowColorMatch = tail.match(/^[&§]\{sc:([^}]+)\}/i);
        if (shadowColorMatch) {
          style.shadowColor = normalizeHexColor(shadowColorMatch[1]);
          index += shadowColorMatch[0].length;
          continue;
        }

        const legacyMatch = tail.match(/^[&§]([0-9a-fklmnor])/i);
        if (legacyMatch) {
          const code = legacyMatch[1].toLowerCase();
          if (Object.prototype.hasOwnProperty.call(MC_COLORS, code)) {
            style.color = MC_COLORS[code];
            style.shader = '';
            resetDecorations(style);
          } else if (code === 'l') style.bold = true;
          else if (code === 'o') style.italic = true;
          else if (code === 'n') style.underline = true;
          else if (code === 'm') style.strike = true;
          else if (code === 'k') style.obfuscated = true;
          else if (code === 'r') Object.assign(style, defaultStyle(initialFontId, initialColor));
          index += legacyMatch[0].length;
          continue;
        }
      }

      const codepoint = input.codePointAt(index);
      const character = String.fromCodePoint(codepoint);
      pushCharacter(character);
      index += character.length;
    }

    return {
      lines,
      hasDynamicShader: lines.some((line) => line.some((token) => Boolean(token.style.shader))),
    };
  }

  function textAdvance(character) {
    if (Object.prototype.hasOwnProperty.call(TEXT_ADVANCES, character)) {
      return TEXT_ADVANCES[character];
    }
    const codepoint = character.codePointAt(0);
    if (
      codepoint >= 0x2e80 &&
      (codepoint <= 0x9fff || (codepoint >= 0xf900 && codepoint <= 0xfaff))
    ) {
      return 8;
    }
    if (codepoint > 0xffff) return 10;
    return 6;
  }

  function resolveGlyph(character, fontId) {
    const codepoint = character.codePointAt(0);
    const selectedFont = fontId || 'minecraft:default';

    if (selectedFont === 'minecraft:default' || selectedFont === 'wynntils:banners') {
      const edge = EDGE_GLYPHS[codepoint];
      if (edge)
        return { kind: 'bitmap', asset: edge.asset, advance: edge.advance, width: edge.advance };
    }

    if (selectedFont === 'minecraft:default') {
      // WynnFont.asBackgroundFont emits these controls in the default font.
      // Their textures live in the Wynncraft server pack, so the offline
      // renderer uses equivalent geometry instead of assigning unrelated
      // banner/box letters to the same PUA values.
      if (codepoint === 0xe00f) return { kind: 'background', advance: 6, width: 6 };
      if (codepoint === 0xe010) return { kind: 'pill-start', advance: 2, width: 2 };
      if (codepoint === 0xe011) return { kind: 'pill-end', advance: 2, width: 2 };
      if (codepoint === 0xe012) return { kind: 'space', advance: -6, width: 0 };
      if (codepoint === 0x2064) return { kind: 'space', advance: -1, width: 0 };
    }

    if (
      (selectedFont === 'minecraft:default' || selectedFont === 'wynntils:five') &&
      codepoint >= 0xe040 &&
      codepoint <= 0xe06f
    ) {
      const index = codepoint - 0xe040;
      return {
        kind: 'bitmap',
        asset: 'five',
        advance: 6,
        width: 7,
        visualWidth: 6,
        height: 7,
        sourceX: (index % 16) * 7,
        sourceY: Math.floor(index / 16) * 7,
        sourceWidth: 7,
        sourceHeight: 7,
      };
    }

    if (character === ' ') return { kind: 'space', advance: textAdvance(character), width: 0 };
    if (codepoint >= 0xe000 && codepoint <= 0xf8ff) {
      return {
        kind: selectedFont === 'minecraft:default' ? 'unknown' : 'unsupported',
        advance: 6,
        width: 5,
      };
    }
    const advance = textAdvance(character);
    return { kind: 'text', advance, width: Math.max(1, advance - 1) };
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function hslToHex(hue, saturation, lightness) {
    const h = ((((Number(hue) || 0) % 360) + 360) % 360) / 360;
    const s = clamp(Number(saturation) || 0, 0, 100) / 100;
    const l = clamp(Number(lightness) || 0, 0, 100) / 100;
    const channel = (offset) => {
      const wave = (offset + h * 12) % 12;
      const amplitude = s * Math.min(l, 1 - l);
      return l - amplitude * Math.max(-1, Math.min(wave - 3, 9 - wave, 1));
    };
    return `#${[channel(0), channel(8), channel(4)]
      .map((value) =>
        Math.round(value * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()}FF`;
  }

  function mixColor(first, second, amount) {
    const progress = clamp(Number(amount) || 0, 0, 1);
    const channels = [1, 3, 5].map((offset) =>
      Math.round(
        Number.parseInt(first.slice(offset, offset + 2), 16) * (1 - progress) +
          Number.parseInt(second.slice(offset, offset + 2), 16) * progress,
      ),
    );
    return `#${channels
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()}FF`;
  }

  function resolveShaderAppearance(shader, x, y, timeMs) {
    const name = String(shader || '').toUpperCase();
    const time = (Number(timeMs) || 0) / 1000;
    const phase = time * 2.4 + Number(x || 0) * 0.14 + Number(y || 0) * 0.08;
    const wave = (Math.sin(phase) + 1) / 2;
    const appearance = {
      color: DEFAULT_COLOR,
      opacity: 1,
      offsetX: 0,
      offsetY: 0,
      skewX: 0,
    };

    if (name === 'RAINBOW') appearance.color = hslToHex(time * 120 + x * 13 + y * 7, 88, 65);
    else if (name === 'SHINE') {
      const shine = Math.max(0, 1 - Math.abs(((time * 9 + x) % 32) - 16) / 5);
      appearance.color = mixColor('#77BFFFFF', '#FFFFFFFF', shine);
    } else if (name === 'GRADIENT' || name === 'GRADIENT_2') {
      appearance.color = mixColor(
        name.endsWith('_2') ? '#FFD36AFF' : '#55E6FFFF',
        name.endsWith('_2') ? '#FF68B7FF' : '#B76CFFFF',
        wave,
      );
    } else if (name === 'FADE' || name === 'FADE_2') {
      appearance.color = name.endsWith('_2') ? '#FF79C6FF' : '#7DE8FFFF';
      appearance.opacity = 0.3 + wave * 0.7;
    } else if (name === 'BLINK') {
      appearance.color = '#FFF27AFF';
      appearance.opacity = Math.sin(time * Math.PI * 3) >= 0 ? 1 : 0.22;
    } else if (name === 'ITALIC' || name === 'ITALIC_2') {
      appearance.color = name.endsWith('_2') ? '#FFA8E8FF' : '#B8EEFFFF';
      appearance.skewX = 0.24 + wave * 0.12;
      appearance.offsetX = Math.sin(phase) * 0.5;
    } else if (name === 'WARP') {
      appearance.color = hslToHex(205 + wave * 55, 82, 68);
      appearance.offsetY = Math.sin(phase * 1.35) * 1.8;
      appearance.offsetX = Math.cos(phase) * 0.35;
    }
    return appearance;
  }

  function layoutParsedText(parsed, options) {
    const settings = options || {};
    const fontScale = Number.isFinite(Number(settings.fontScale))
      ? Math.max(0.1, Number(settings.fontScale))
      : 1;
    const lineHeight = 9;
    let naturalWidth = 0;
    const lineLayouts = parsed.lines.map((line, lineIndex) => {
      const placements = [];
      let cursor = 0;
      let minX = 0;
      let maxX = 0;
      line.forEach((token) => {
        const glyph = resolveGlyph(token.char, token.style.fontId);
        placements.push({ ...token, glyph, x: cursor, y: lineIndex * lineHeight });
        const visualWidth =
          Math.max(0, Number(glyph.visualWidth == null ? glyph.width : glyph.visualWidth) || 0) +
          (token.style.bold && glyph.kind !== 'space' ? 1 : 0);
        minX = Math.min(minX, cursor);
        maxX = Math.max(maxX, cursor + visualWidth);
        cursor += glyph.advance + (token.style.bold && glyph.kind !== 'space' ? 1 : 0);
        minX = Math.min(minX, cursor);
        maxX = Math.max(maxX, cursor);
      });
      const width = maxX - minX;
      naturalWidth = Math.max(naturalWidth, width);
      return { placements, width, minX, maxX };
    });
    const naturalHeight = Math.max(lineHeight, parsed.lines.length * lineHeight);
    const width = naturalWidth * fontScale;
    const height = naturalHeight * fontScale;
    let scale = 1;
    if (settings.fitText) {
      const maxWidth = Number(settings.maxWidth);
      const maxHeight = Number(settings.maxHeight);
      if (Number.isFinite(maxWidth) && maxWidth > 0 && width > maxWidth)
        scale = Math.min(scale, maxWidth / width);
      if (Number.isFinite(maxHeight) && maxHeight > 0 && height > maxHeight)
        scale = Math.min(scale, maxHeight / height);
    }
    return {
      lineLayouts,
      naturalWidth,
      naturalHeight,
      width,
      height,
      fontScale,
      scale,
      lineHeight,
      hasDynamicShader: Boolean(parsed.hasDynamicShader),
    };
  }

  function colorToCss(hex, opacityMultiplier) {
    const match = String(hex || '#FFFFFFFF').match(/^#([0-9a-f]{6})([0-9a-f]{2})$/i);
    if (!match) return 'rgba(255,255,255,1)';
    const rgb = match[1];
    const alpha =
      (Number.parseInt(match[2], 16) / 255) * (opacityMultiplier == null ? 1 : opacityMultiplier);
    return `rgba(${Number.parseInt(rgb.slice(0, 2), 16)},${Number.parseInt(rgb.slice(2, 4), 16)},${Number.parseInt(rgb.slice(4, 6), 16)},${alpha})`;
  }

  function backgroundColorToCss(value) {
    const match = String(value || '').match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (!match) return 'rgba(0,0,0,0)';
    return colorToCss(`#${match[1]}${match[2] || 'FF'}`);
  }

  class MinecraftCanvasRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.frame = canvas ? canvas.closest('.preview-frame') : null;
      this.images = new Map();
      this.bitmapCache = new Map();
      this.lastRender = null;
      this.loadAssets();
    }

    loadAssets() {
      if (typeof Image === 'undefined') return Promise.resolve();
      const pending = Object.entries(resources.assets || {}).map(
        ([name, asset]) =>
          new Promise((resolve) => {
            const image = new Image();
            image.decoding = 'async';
            image.addEventListener(
              'load',
              () => {
                this.images.set(name, image);
                this.bitmapCache.clear();
                resolve();
                if (this.lastRender) {
                  try {
                    this.render(
                      this.lastRender.text,
                      this.lastRender.config,
                      this.lastRender.timeMs,
                    );
                  } catch (_error) {
                    this.lastRender = null;
                  }
                }
              },
              { once: true },
            );
            image.addEventListener('error', resolve, { once: true });
            image.src = asset.path;
          }),
      );
      return Promise.all(pending);
    }

    prepareCanvas() {
      const cssWidth = Math.max(
        1,
        Math.round(this.canvas.clientWidth || (this.frame && this.frame.clientWidth) || 640),
      );
      const cssHeight = Math.max(1, Math.round(this.canvas.clientHeight || 210));
      const ratio = Math.max(1, Math.min(3, Number(globalThis.devicePixelRatio) || 1));
      const pixelWidth = Math.round(cssWidth * ratio);
      const pixelHeight = Math.round(cssHeight * ratio);
      if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
      if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
      const context = this.canvas.getContext('2d');
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, cssWidth, cssHeight);
      return { context, width: cssWidth, height: cssHeight };
    }

    clear() {
      this.lastRender = null;
      if (!this.canvas) return null;
      const surface = this.prepareCanvas();
      if (this.frame) {
        this.frame.classList.remove('is-fit-text', 'is-fit-scaled', 'is-color-template-fallback');
      }
      return surface;
    }

    render(text, config, timeMs) {
      if (!this.canvas) return null;
      this.lastRender = {
        text: String(text == null ? '' : text),
        config: { ...(config || {}) },
        timeMs: Number(timeMs) || 0,
      };
      const surface = this.prepareCanvas();
      const colorTemplate = resolveColorTemplate(config && config.colorTemplate);
      const parsed = parseFormattedText(this.lastRender.text, undefined, colorTemplate.color);
      const layout = layoutParsedText(parsed, {
        fontScale: config && config.fontScale,
        fitText: Boolean(config && config.fitText),
        maxWidth: Math.max(20, surface.width - 20),
        maxHeight: Math.max(20, surface.height - 20),
      });
      const drawScale = layout.fontScale * layout.scale;
      const contentWidth = layout.naturalWidth * drawScale;
      const contentHeight = layout.naturalHeight * drawScale;
      const originX = Math.round((surface.width - contentWidth) / 2);
      const originY = Math.round((surface.height - contentHeight) / 2);
      const border = Math.max(0, Number(config && config.backgroundBorderWidth) || 0);

      surface.context.save();
      surface.context.translate(originX, originY);
      surface.context.scale(drawScale, drawScale);
      surface.context.fillStyle = backgroundColorToCss(config && config.backgroundColor);
      surface.context.fillRect(
        -border,
        -border,
        layout.naturalWidth + border * 2,
        layout.naturalHeight + border * 2,
      );

      const shadow = config && config.textShadow;
      if (shadow === 'NORMAL')
        this.drawLayout(surface.context, layout, 1, 1, '#000000B0', this.lastRender.timeMs);
      if (shadow === 'OUTLINE') {
        for (const [x, y] of [
          [0, -1],
          [-1, 0],
          [1, 0],
          [0, 1],
        ]) {
          this.drawLayout(surface.context, layout, x, y, '#000000D0', this.lastRender.timeMs);
        }
      }
      this.drawLayout(surface.context, layout, 0, 0, null, this.lastRender.timeMs);
      surface.context.restore();

      if (this.frame) {
        this.frame.classList.toggle('is-fit-text', Boolean(config && config.fitText));
        this.frame.classList.toggle('is-fit-scaled', layout.scale < 1);
        this.frame.classList.toggle('is-color-template-fallback', !colorTemplate.resolved);
      }
      layout.colorTemplateResolved = colorTemplate.resolved;
      return layout;
    }

    drawLayout(context, layout, offsetX, offsetY, colorOverride, timeMs) {
      layout.lineLayouts.forEach((line) => {
        const lineOffset = -line.minX + (layout.naturalWidth - line.width) / 2;
        line.placements.forEach((placement) => {
          this.drawGlyph(
            context,
            placement,
            lineOffset + placement.x + offsetX,
            placement.y + offsetY,
            colorOverride,
            timeMs,
          );
        });
      });
    }

    drawGlyph(context, placement, x, y, colorOverride, timeMs) {
      const { glyph, style } = placement;
      if (style.shadowColor && !colorOverride) {
        this.drawGlyph(
          context,
          { ...placement, style: { ...style, shadowColor: '' } },
          x + 1,
          y + 1,
          style.shadowColor,
          timeMs,
        );
      }
      if (glyph.kind === 'space') return;
      const shader = style.shader
        ? resolveShaderAppearance(style.shader, placement.x, placement.y, timeMs)
        : null;
      const color = colorOverride || shader?.color || style.color;
      const drawX = x + (shader?.offsetX || 0);
      const drawY = y + (shader?.offsetY || 0);

      context.save();
      context.globalAlpha *= shader?.opacity == null ? 1 : shader.opacity;
      if (shader?.skewX) {
        context.translate(drawX, drawY);
        context.transform(1, 0, shader.skewX, 1, 0, 0);
        x = 0;
        y = 0;
      } else {
        x = drawX;
        y = drawY;
      }

      if (glyph.kind === 'background') {
        context.fillStyle = colorToCss(color);
        context.fillRect(Math.round(x), Math.round(y + 1), 6, 7);
        context.restore();
        return;
      }
      if (glyph.kind === 'pill-start' || glyph.kind === 'pill-end') {
        context.fillStyle = colorToCss(color);
        const start = glyph.kind === 'pill-start';
        context.fillRect(Math.round(x + (start ? 1 : 0)), Math.round(y + 1), 1, 7);
        context.beginPath();
        context.arc(
          Math.round(x + (start ? 2 : 0)),
          Math.round(y + 4.5),
          3.5,
          start ? Math.PI / 2 : -Math.PI / 2,
          start ? Math.PI * 1.5 : Math.PI / 2,
        );
        context.fill();
        context.restore();
        return;
      }
      if (glyph.kind === 'bitmap') {
        const image = this.images.get(glyph.asset);
        if (image) {
          this.drawTintedBitmap(context, image, glyph, x, y, color, !style.shader);
          if (style.bold && !colorOverride)
            this.drawTintedBitmap(context, image, glyph, x + 1, y, color, !style.shader);
          context.restore();
          return;
        }
      }

      context.fillStyle = colorToCss(color);
      context.textBaseline = 'top';
      context.font = `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}8px monospace`;
      const character = style.obfuscated
        ? '█'
        : glyph.kind === 'unknown' || glyph.kind === 'unsupported'
          ? '□'
          : placement.char;
      context.fillText(character, Math.round(x), Math.round(y));
      if (style.underline && !colorOverride)
        context.fillRect(Math.round(x), Math.round(y + 8), Math.max(1, glyph.advance), 1);
      if (style.strike && !colorOverride)
        context.fillRect(Math.round(x), Math.round(y + 4), Math.max(1, glyph.advance), 1);
      context.restore();
    }

    drawTintedBitmap(context, image, glyph, x, y, color, cacheable) {
      const sourceX = glyph.sourceX || 0;
      const sourceY = glyph.sourceY || 0;
      const sourceWidth = glyph.sourceWidth || image.naturalWidth || image.width;
      const sourceHeight = glyph.sourceHeight || image.naturalHeight || image.height;
      const width = glyph.width || sourceWidth;
      const height = glyph.height || sourceHeight;
      const cacheKey = `${glyph.asset}:${sourceX}:${sourceY}:${sourceWidth}:${sourceHeight}:${width}:${height}:${color}`;
      let scratch = cacheable ? this.bitmapCache.get(cacheKey) : null;
      if (!scratch) {
        scratch = document.createElement('canvas');
        scratch.width = width;
        scratch.height = height;
        const scratchContext = scratch.getContext('2d');
        scratchContext.imageSmoothingEnabled = false;
        scratchContext.drawImage(
          image,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          width,
          height,
        );
        scratchContext.globalCompositeOperation = 'source-in';
        scratchContext.fillStyle = colorToCss(color);
        scratchContext.fillRect(0, 0, width, height);
        if (cacheable) this.bitmapCache.set(cacheKey, scratch);
      }
      context.drawImage(scratch, Math.round(x), Math.round(y + Math.max(0, 8 - height)));
    }
  }

  return Object.freeze({
    resources,
    MC_COLORS,
    MAX_RENDER_INPUT_LENGTH,
    resolveColorTemplate,
    parseFormattedText,
    resolveGlyph,
    resolveShaderAppearance,
    layoutParsedText,
    MinecraftCanvasRenderer,
  });
});
