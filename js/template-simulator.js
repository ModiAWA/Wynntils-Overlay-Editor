(function (root, factory) {
  const api = factory(
    root.WYNNTILS_FUNCTIONS || [],
    root.WynntilsTemplateParser,
    root.WynntilsSimulationProfile,
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WynntilsTemplateSimulator = api;
})(
  typeof globalThis !== 'undefined' ? globalThis : window,
  function (functionData, Parser, Profile) {
    'use strict';

    if (!Parser || !Profile) {
      throw new Error(
        'Template parser and simulation profile must load before template-simulator.js',
      );
    }

    const MAX_OUTPUT_LENGTH = Profile.MAX_PREVIEW_TEXT_LENGTH || 4096;
    const OUTPUT_LIMIT_MARKER = '…⟦preview truncated⟧';

    const functionIndex = new Map();
    functionData.forEach((entry) => {
      functionIndex.set(entry.n.toLowerCase(), entry);
      entry.a.forEach((alias) => functionIndex.set(alias.toLowerCase(), entry));
    });

    function result(type, value, display, meta) {
      return Profile.typed(type, value, display, meta);
    }

    function formatNumber(value, format) {
      if (format == null) return null;
      const match = String(format).match(/^(F)?(\d*)$/);
      if (!match || !Number.isFinite(Number(value))) return null;
      const decimals = Math.min(100, match[2] === '' ? 2 : Number(match[2]));
      return match[1]
        ? Number(value).toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        : Number(value).toFixed(decimals);
    }

    function formatResult(value, format) {
      if (format == null) return value;
      const formatted = formatNumber(Profile.asNumber(value), format);
      return formatted == null ? value : result('String', formatted);
    }

    function integer(value) {
      const number = Number(value);
      return Number.isFinite(number) ? Math.trunc(number) : 0;
    }

    function finiteNumber(value, fallback) {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback || 0;
    }

    function limitText(value, forceLimited) {
      const text = String(value == null ? '' : value);
      const limited = Boolean(forceLimited) || text.length > MAX_OUTPUT_LENGTH;
      if (!limited) return Object.freeze({ text, limited: false });
      const prefixLength = Math.max(0, MAX_OUTPUT_LENGTH - OUTPUT_LIMIT_MARKER.length);
      return Object.freeze({
        text: `${text.slice(0, prefixLength)}${OUTPUT_LIMIT_MARKER}`,
        limited: true,
      });
    }

    function joinWithinBudget(values) {
      let output = '';
      for (const value of values) {
        const text = String(value == null ? '' : value);
        const remaining = MAX_OUTPUT_LENGTH - output.length;
        if (text.length > remaining) {
          return limitText(`${output}${text.slice(0, Math.max(0, remaining))}`, true);
        }
        output += text;
      }
      return Object.freeze({ text: output, limited: false });
    }

    function repeatWithinBudget(value, count) {
      const text = String(value == null ? '' : value);
      const requested = Math.max(0, integer(count));
      if (!text || requested === 0) return Object.freeze({ text: '', limited: false });
      const safeCount = Math.min(requested, Math.ceil(MAX_OUTPUT_LENGTH / text.length));
      return limitText(text.repeat(safeCount), safeCount < requested);
    }

    function padWithinBudget(value, width) {
      const text = String(value == null ? '' : value);
      const requested = Math.max(0, integer(width));
      return limitText(
        text.padStart(Math.min(requested, MAX_OUTPUT_LENGTH), '0'),
        requested > MAX_OUTPUT_LENGTH,
      );
    }

    function limitResultText(value, forceLimited) {
      if (!value || !['String', 'StyledText'].includes(value.type)) return value;
      const limitedValue = limitText(value.value, forceLimited || value.outputLimited);
      const limitedDisplay =
        typeof value.display === 'string'
          ? limitText(value.display, forceLimited || value.outputLimited)
          : null;
      const limited = limitedValue.limited || Boolean(limitedDisplay?.limited);
      if (!limited) return value;
      const meta = { ...value, outputLimited: true };
      delete meta.type;
      delete meta.value;
      delete meta.display;
      return result(value.type, limitedValue.text, limitedDisplay?.text, meta);
    }

    function createOutputBuffer() {
      let output = '';
      let limited = false;

      function append(value, start, end) {
        const text = String(value == null ? '' : value);
        let index = Math.max(0, start || 0);
        const boundary = Math.min(text.length, end == null ? text.length : end);
        while (index < boundary) {
          const newlineEscape =
            index + 1 < boundary && text[index] === '\\' && text[index + 1] === 'n';
          const character = newlineEscape ? '\n' : text[index];
          if (output.length + character.length > MAX_OUTPUT_LENGTH) {
            limited = true;
            return false;
          }
          output += character;
          index += newlineEscape ? 2 : 1;
        }
        return true;
      }

      return Object.freeze({
        append,
        get limited() {
          return limited;
        },
        finish() {
          return limitText(output, limited);
        },
      });
    }

    function shortNumber(value) {
      const number = integer(value);
      const absolute = Math.abs(number);
      const units = [
        [1e12, 'T'],
        [1e9, 'B'],
        [1e6, 'M'],
        [1e3, 'K'],
      ];
      const unit = units.find(([threshold]) => absolute >= threshold);
      if (!unit) return String(number);
      const scaled = number / unit[0];
      return `${Number(scaled.toFixed(Math.abs(scaled) < 10 ? 1 : 0))}${unit[1]}`;
    }

    function formatDuration(seconds) {
      const value = integer(seconds);
      const hours = Math.trunc(value / 3600);
      const minutes = Math.trunc((value % 3600) / 60);
      const remainingSeconds = value % 60;
      if (hours > 0) return `${hours}h ${pad(minutes, 2)}m ${pad(remainingSeconds, 2)}s`;
      if (minutes > 0) return `${minutes}m ${pad(remainingSeconds, 2)}s`;
      return `${remainingSeconds}s`;
    }

    function pad(value, length) {
      return String(value).padStart(length, '0');
    }

    function utcParts(timestamp) {
      const date = new Date(finiteNumber(timestamp));
      return {
        yyyy: pad(date.getUTCFullYear(), 4),
        yy: pad(date.getUTCFullYear() % 100, 2),
        MM: pad(date.getUTCMonth() + 1, 2),
        dd: pad(date.getUTCDate(), 2),
        HH: pad(date.getUTCHours(), 2),
        mm: pad(date.getUTCMinutes(), 2),
        ss: pad(date.getUTCSeconds(), 2),
        SSS: pad(date.getUTCMilliseconds(), 3),
      };
    }

    function formatTimestamp(timestamp, pattern) {
      const parts = utcParts(timestamp);
      const template = pattern || 'yyyy-MM-dd HH:mm';
      if (/[^yMdHhmsaSzZ :/.,'-]/.test(template)) return 'Invalid Format';
      const hour = Number(parts.HH);
      const values = {
        yyyy: parts.yyyy,
        SSS: parts.SSS,
        yy: parts.yy,
        MM: parts.MM,
        dd: parts.dd,
        HH: parts.HH,
        hh: pad(hour % 12 || 12, 2),
        mm: parts.mm,
        ss: parts.ss,
        a: hour < 12 ? 'AM' : 'PM',
        Z: '+0000',
        z: 'UTC',
      };
      return template.replace(/yyyy|SSS|yy|MM|dd|HH|hh|mm|ss|a|Z|z/g, (token) => values[token]);
    }

    function formatRelativeTime(timestamp) {
      const difference = finiteNumber(timestamp) - Profile.PROFILE.now.value;
      if (difference > -1000 && difference < 1000) return 'now';
      const differenceInSeconds = Math.trunc(difference / 1000);
      const seconds = Math.abs(differenceInSeconds);
      const minutes = Math.trunc(seconds / 60);
      const hours = Math.trunc(minutes / 60);
      const days = Math.trunc(hours / 24);
      let amount;
      let unit;
      if (seconds < 60) {
        amount = seconds;
        unit = seconds === 1 ? 'second' : 'seconds';
      } else if (minutes < 60) {
        amount = minutes;
        unit = minutes === 1 ? 'minute' : 'minutes';
      } else if (hours < 24) {
        amount = hours;
        unit = hours === 1 ? 'hour' : 'hours';
      } else {
        amount = days;
        unit = days === 1 ? 'day' : 'days';
      }
      const relative = `${amount} ${unit}`;
      return differenceInSeconds < 0 ? `${relative} ago` : `in ${relative}`;
    }

    function normalizeColor(value, includeAlpha) {
      const match = String(value == null ? '' : value)
        .trim()
        .match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
      if (!match) return includeAlpha ? '#FFFFFFFF' : '#FFFFFF';
      return `#${match[1].toUpperCase()}${includeAlpha ? (match[2] || 'FF').toUpperCase() : ''}`;
    }

    function colorFromChannels(channels) {
      const hex = channels
        .map((channel) =>
          Math.max(0, Math.min(255, Math.trunc(channel)))
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
      return `#${hex.toUpperCase()}`;
    }

    function colorChannels(value) {
      const color = normalizeColor(value, false);
      return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
    }

    function rgbToHsv(channels) {
      const [red, green, blue] = channels.map((channel) => channel / 255);
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      const delta = maximum - minimum;
      let hue = 0;
      if (delta !== 0) {
        if (maximum === red) hue = ((green - blue) / delta) % 6;
        else if (maximum === green) hue = (blue - red) / delta + 2;
        else hue = (red - green) / delta + 4;
        hue /= 6;
        if (hue < 0) hue += 1;
      }
      return [hue, maximum === 0 ? 0 : delta / maximum, maximum];
    }

    function hsvToColor(hue, saturation, brightness) {
      const normalizedHue = ((hue % 1) + 1) % 1;
      const normalizedSaturation = Math.max(0, Math.min(1, saturation));
      const normalizedBrightness = Math.max(0, Math.min(1, brightness));
      const sector = normalizedHue * 6;
      const chroma = normalizedBrightness * normalizedSaturation;
      const intermediate = chroma * (1 - Math.abs((sector % 2) - 1));
      const offset = normalizedBrightness - chroma;
      const base =
        sector < 1
          ? [chroma, intermediate, 0]
          : sector < 2
            ? [intermediate, chroma, 0]
            : sector < 3
              ? [0, chroma, intermediate]
              : sector < 4
                ? [0, intermediate, chroma]
                : sector < 5
                  ? [intermediate, 0, chroma]
                  : [chroma, 0, intermediate];
      return colorFromChannels(base.map((channel) => (channel + offset) * 255));
    }

    function shiftColor(value, shift, amount) {
      const [hue, saturation, brightness] = rgbToHsv(colorChannels(value));
      if (shift === 'hue') return hsvToColor(hue + amount, saturation, brightness);
      if (shift === 'saturation') return hsvToColor(hue, saturation + amount, brightness);
      return hsvToColor(hue, saturation, brightness + amount);
    }

    function shaderResult(name) {
      const shader = String(name || '').toUpperCase();
      const color = Profile.SHADER_COLORS[shader] || '#FFFFFF';
      return result('CustomColor', color, color, {
        shader: Profile.SHADER_COLORS[shader] ? shader : '',
      });
    }

    function shaderColorName(name) {
      return name.slice(0, -7).toUpperCase();
    }

    function formatCode(code, enabled, text) {
      return enabled ? scopedStyle(`&${code}`, text) : text;
    }

    function scopedStyle(prefix, text) {
      const body = String(text).replace(/&r(?=[\s\S])/g, `&r${prefix}`);
      return `${prefix}${body}&r`;
    }

    function sameCaseValue(left, right) {
      if (left?.type !== right?.type) return false;
      if (left?.value === right?.value) return true;
      if (!left?.value || !right?.value || typeof left.value !== 'object') return false;
      return JSON.stringify(left.value) === JSON.stringify(right.value);
    }

    function romanNumeral(value) {
      let number = integer(value);
      if (number <= 0 || number > 3999) return String(number);
      const numerals = [
        [1000, 'M'],
        [900, 'CM'],
        [500, 'D'],
        [400, 'CD'],
        [100, 'C'],
        [90, 'XC'],
        [50, 'L'],
        [40, 'XL'],
        [10, 'X'],
        [9, 'IX'],
        [5, 'V'],
        [4, 'IV'],
        [1, 'I'],
      ];
      let output = '';
      numerals.forEach(([amount, numeral]) => {
        while (number >= amount) {
          output += numeral;
          number -= amount;
        }
      });
      return output;
    }

    const ENGLISH = 'abcdefghijklmnopqrstuvwxyz.!?';
    const GAVELLIAN = 'ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ';
    const WYNNIC = '⒜⒝⒞⒟⒠⒡⒢⒣⒤⒥⒦⒧⒨⒩⒪⒫⒬⒭⒮⒯⒰⒱⒲⒳⒴⒵０１２';
    const WYNNIC_VALUES = Object.freeze([
      [100, '⑿'],
      [50, '⑾'],
      [10, '⑽'],
      [9, '⑼'],
      [8, '⑻'],
      [7, '⑺'],
      [6, '⑹'],
      [5, '⑸'],
      [4, '⑷'],
      [3, '⑶'],
      [2, '⑵'],
      [1, '⑴'],
    ]);

    function alphabetMap(text, alphabet) {
      return Array.from(String(text).toLowerCase(), (character) => {
        const index = ENGLISH.indexOf(character);
        return index >= 0 && alphabet[index] ? alphabet[index] : character;
      }).join('');
    }

    function wynnicNumber(raw) {
      let value = integer(raw);
      if (value > 5000) return '∞';
      if (value <= 0) return String(value);
      let output = '';
      for (const [amount, glyph] of WYNNIC_VALUES) {
        while (value >= amount) {
          output += glyph;
          value -= amount;
        }
      }
      return output;
    }

    function transcribeWynnic(text) {
      const withNumbers = String(text).toLowerCase().replace(/\d+/g, wynnicNumber);
      return alphabetMap(withNumbers, WYNNIC);
    }

    function unsupportedSample(entry) {
      const label = `⟦${entry.n}⟧`;
      const values = {
        Float: 12.5,
        Double: 12.5,
        Integer: 42,
        Long: 12345,
        Number: 12.5,
        Boolean: true,
        String: label,
        CustomColor: '#55FFFF',
        StyledText: `&b${label}`,
        CappedValue: { current: 80, maximum: 100 },
        RangedValue: { minimum: 120, maximum: 180 },
        NamedValue: { name: label, value: 3 },
        Location: { x: 123, y: 64, z: -42, world: 'WC1' },
        Time: 1788266096000,
        Object: label,
      };
      return result(entry.r, values[entry.r] == null ? label : values[entry.r], label, {
        simulated: false,
      });
    }

    function primitiveResult(entry, value, display, meta) {
      return result(entry.r, value, display, meta);
    }

    const HANDLERS = Object.create(null);

    function register(names, handler) {
      names.forEach((name) => {
        HANDLERS[name] = handler;
      });
    }

    register(['add'], ({ entry, numbers }) =>
      primitiveResult(
        entry,
        numbers.reduce((a, b) => a + b, 0),
      ),
    );
    register(['subtract'], ({ entry, numbers }) => primitiveResult(entry, numbers[0] - numbers[1]));
    register(['multiply'], ({ entry, numbers }) =>
      primitiveResult(
        entry,
        numbers.reduce((a, b) => a * b, 1),
      ),
    );
    register(['divide'], ({ entry, numbers }) => primitiveResult(entry, numbers[0] / numbers[1]));
    register(['safe_divide'], ({ entry, numbers }) =>
      primitiveResult(entry, numbers[1] === 0 ? numbers[2] : numbers[0] / numbers[1]),
    );
    register(['modulo'], ({ entry, numbers }) => primitiveResult(entry, numbers[0] % numbers[1]));
    register(['power'], ({ entry, numbers }) => primitiveResult(entry, numbers[0] ** numbers[1]));
    register(['square_root'], ({ entry, numbers }) =>
      primitiveResult(entry, Math.sqrt(numbers[0])),
    );
    register(['abs'], ({ entry, numbers }) => primitiveResult(entry, Math.abs(numbers[0])));
    register(['ceil'], ({ entry, numbers }) => primitiveResult(entry, Math.ceil(numbers[0])));
    register(['floor'], ({ entry, numbers }) => primitiveResult(entry, Math.floor(numbers[0])));
    register(['integer', 'long'], ({ entry, numbers }) =>
      primitiveResult(entry, integer(numbers[0])),
    );
    register(['round'], ({ entry, numbers }) => {
      const factor = 10 ** integer(numbers[1]);
      return primitiveResult(entry, Math.round(numbers[0] * factor) / factor);
    });
    register(['max'], ({ entry, numbers }) => primitiveResult(entry, Math.max(...numbers)));
    register(['min'], ({ entry, numbers }) => primitiveResult(entry, Math.min(...numbers)));
    register(['natural_log'], ({ entry, numbers }) => primitiveResult(entry, Math.log(numbers[0])));
    register(['log'], ({ entry, numbers }) =>
      primitiveResult(entry, Math.log(numbers[0]) / Math.log(numbers[1])),
    );
    register(['clamp'], ({ entry, numbers }) => {
      const low = Math.min(numbers[1], numbers[2]);
      const high = Math.max(numbers[1], numbers[2]);
      return primitiveResult(entry, Math.max(low, Math.min(high, numbers[0])));
    });
    register(['map'], ({ entry, numbers }) => {
      const width = numbers[2] - numbers[1];
      return primitiveResult(
        entry,
        width === 0
          ? numbers[3]
          : numbers[3] + ((numbers[0] - numbers[1]) * (numbers[4] - numbers[3])) / width,
      );
    });
    register(['wrap'], ({ entry, numbers }) => {
      const width = numbers[2] - numbers[1];
      if (width === 0) return primitiveResult(entry, numbers[1]);
      let wrapped = (numbers[0] - numbers[1]) % width;
      if (wrapped < 0) wrapped += width;
      return primitiveResult(entry, wrapped + numbers[1]);
    });
    register(['pi'], ({ entry }) => primitiveResult(entry, Math.PI));
    register(['euler'], ({ entry }) => primitiveResult(entry, Math.E));
    register(['dec_to_hex'], ({ entry, numbers }) => {
      const value = integer(numbers[0]);
      const prefix = value < 0 ? '-' : '';
      return primitiveResult(entry, `${prefix}${Math.abs(value).toString(16).toUpperCase()}`);
    });
    register(['hex_to_dec'], ({ entry, strings }) => {
      const raw = strings[0].trim();
      const negative = raw.startsWith('-');
      const normalized = raw.replace(/^-/, '').replace(/^(?:0x|#)/i, '');
      const value = /^[0-9a-f]+$/i.test(normalized) ? Number.parseInt(normalized, 16) : 0;
      return primitiveResult(entry, negative ? -value : value);
    });
    register(['is_finite'], ({ entry, numbers }) =>
      primitiveResult(entry, Number.isFinite(numbers[0])),
    );
    register(['is_infinite'], ({ entry, numbers }) =>
      primitiveResult(entry, !Number.isFinite(numbers[0]) && !Number.isNaN(numbers[0])),
    );
    register(['is_nan'], ({ entry, numbers }) => primitiveResult(entry, Number.isNaN(numbers[0])));

    register(['greater_than'], ({ entry, numbers }) =>
      primitiveResult(entry, numbers[0] > numbers[1]),
    );
    register(['greater_than_or_equals'], ({ entry, numbers }) =>
      primitiveResult(entry, numbers[0] >= numbers[1]),
    );
    register(['less_than'], ({ entry, numbers }) =>
      primitiveResult(entry, numbers[0] < numbers[1]),
    );
    register(['less_than_or_equals'], ({ entry, numbers }) =>
      primitiveResult(entry, numbers[0] <= numbers[1]),
    );
    register(['equals'], ({ entry, numbers }) => primitiveResult(entry, numbers[0] === numbers[1]));
    register(['not_equals'], ({ entry, numbers }) =>
      primitiveResult(entry, numbers[0] !== numbers[1]),
    );
    register(['not'], ({ entry, args }) => primitiveResult(entry, !Profile.asBoolean(args[0])));
    register(['and'], ({ entry, args }) => primitiveResult(entry, args.every(Profile.asBoolean)));
    register(['or'], ({ entry, args }) => primitiveResult(entry, args.some(Profile.asBoolean)));

    register(['concat', 'concat_styled_text'], ({ entry, strings }) => {
      const joined = joinWithinBudget(strings);
      return primitiveResult(entry, joined.text, undefined, { outputLimited: joined.limited });
    });
    register(['string', 'styled_text'], ({ entry, strings }) =>
      primitiveResult(entry, strings[0] || ''),
    );
    register(['string_equals'], ({ entry, strings }) =>
      primitiveResult(entry, strings[0] === strings[1]),
    );
    register(['string_contains'], ({ entry, strings }) =>
      primitiveResult(entry, strings[0].includes(strings[1])),
    );
    register(['parse_integer', 'parse_long'], ({ entry, strings }) => {
      const value = /^[+-]?\d+$/.test(strings[0].trim()) ? Number.parseInt(strings[0], 10) : 0;
      return primitiveResult(entry, value);
    });
    register(['parse_double'], ({ entry, strings }) => {
      const value = Number(strings[0]);
      return primitiveResult(entry, Number.isNaN(value) ? 0 : value);
    });
    register(['repeat', 'repeat_styled_text'], ({ entry, strings, numbers }) => {
      const repeated = repeatWithinBudget(strings[0], numbers[1]);
      return primitiveResult(entry, repeated.text, undefined, {
        outputLimited: repeated.limited,
      });
    });
    register(['leading_zeros'], ({ entry, numbers }) => {
      const padded = padWithinBudget(integer(numbers[0]), numbers[1]);
      return primitiveResult(entry, padded.text, undefined, { outputLimited: padded.limited });
    });
    register(['from_codepoint'], ({ entry, numbers }) => {
      try {
        return primitiveResult(entry, String.fromCodePoint(integer(numbers[0])));
      } catch (_error) {
        return primitiveResult(entry, 'Invalid Codepoint');
      }
    });
    register(['to_roman_numerals'], ({ entry, numbers }) =>
      primitiveResult(entry, romanNumeral(numbers[0])),
    );
    register(['format'], ({ entry, numbers }) => primitiveResult(entry, shortNumber(numbers[0])));
    register(['format_duration'], ({ entry, numbers }) =>
      primitiveResult(entry, formatDuration(numbers[0])),
    );
    register(['format_date'], ({ entry, numbers }) =>
      primitiveResult(entry, formatTimestamp(numbers[0])),
    );
    register(['format_capped'], ({ entry, args }) => {
      const value = args[0].value;
      return primitiveResult(entry, `${shortNumber(value.current)}/${shortNumber(value.maximum)}`);
    });
    register(['format_ranged'], ({ entry, args }) => {
      const value = args[0].value;
      return primitiveResult(entry, `${shortNumber(value.minimum)}-${shortNumber(value.maximum)}`);
    });
    register(['capped_string'], ({ entry, args, strings }) => {
      const value = args[0].value;
      return primitiveResult(entry, `${value.current}${strings[1]}${value.maximum}`);
    });
    register(['transcribe_gavellian'], ({ entry, strings }) =>
      primitiveResult(entry, alphabetMap(strings[0], GAVELLIAN)),
    );
    register(['transcribe_wynnic'], ({ entry, strings }) =>
      primitiveResult(entry, transcribeWynnic(strings[0])),
    );

    register(['capped'], ({ entry, numbers }) =>
      primitiveResult(entry, { current: integer(numbers[0]), maximum: integer(numbers[1]) }),
    );
    register(['current'], ({ entry, args }) => primitiveResult(entry, args[0].value.current));
    register(['cap'], ({ entry, args }) => primitiveResult(entry, args[0].value.maximum));
    register(['remaining'], ({ entry, args }) =>
      primitiveResult(entry, args[0].value.maximum - args[0].value.current),
    );
    register(['percentage'], ({ entry, args }) => {
      const value = args[0].value;
      return primitiveResult(
        entry,
        value.maximum === 0 ? 0 : (value.current / value.maximum) * 100,
      );
    });
    register(['at_cap'], ({ entry, args }) =>
      primitiveResult(entry, args[0].value.current >= args[0].value.maximum),
    );
    register(['ranged'], ({ entry, numbers }) =>
      primitiveResult(entry, { minimum: integer(numbers[0]), maximum: integer(numbers[1]) }),
    );
    register(['range_low'], ({ entry, args }) => primitiveResult(entry, args[0].value.minimum));
    register(['range_high'], ({ entry, args }) => primitiveResult(entry, args[0].value.maximum));
    register(['named_value'], ({ entry, strings, numbers }) =>
      primitiveResult(entry, { name: strings[0], value: finiteNumber(numbers[1]) }),
    );
    register(['name'], ({ entry, args }) => primitiveResult(entry, args[0].value.name));
    register(['value'], ({ entry, args }) => primitiveResult(entry, args[0].value.value));
    register(['location'], ({ entry, numbers }) =>
      primitiveResult(entry, {
        x: integer(numbers[0]),
        y: integer(numbers[1]),
        z: integer(numbers[2]),
        world: 'WC1',
      }),
    );
    register(['x', 'y', 'z'], ({ entry, args, name }) =>
      primitiveResult(entry, args[0].value[name]),
    );
    register(['distance'], ({ entry, args }) => {
      const first = args[0].value;
      const second = args[1].value;
      return primitiveResult(
        entry,
        Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z),
      );
    });

    register(
      ['if_capped_value', 'if_custom_color', 'if_number', 'if_string'],
      ({ entry, args }) => {
        const selected = Profile.asBoolean(args[0]) ? args[1] : args[2];
        return primitiveResult(entry, selected.value, Profile.displayValue(selected));
      },
    );
    register(['if'], ({ entry, args }) => {
      const selected = Profile.asBoolean(args[0]) ? args[1] : args[2];
      return primitiveResult(entry, selected.value, Profile.displayValue(selected));
    });
    register(['switch_case'], ({ entry, args }) => {
      const fallback = args[1];
      const cases = args.slice(2);
      if (cases.length % 2 !== 0) {
        return primitiveResult(entry, fallback?.value, Profile.displayValue(fallback));
      }
      for (let index = 0; index < cases.length; index += 2) {
        if (args[0]?.type !== cases[index]?.type) {
          return primitiveResult(entry, fallback?.value, Profile.displayValue(fallback));
        }
        if (sameCaseValue(args[0], cases[index])) {
          const selected = cases[index + 1];
          return primitiveResult(entry, selected?.value, Profile.displayValue(selected));
        }
      }
      return primitiveResult(entry, fallback?.value, Profile.displayValue(fallback));
    });

    register(['from_hex'], ({ entry, strings }) =>
      primitiveResult(entry, normalizeColor(strings[0], false)),
    );
    register(['from_rgb'], ({ entry, numbers }) =>
      primitiveResult(entry, colorFromChannels(numbers.slice(0, 3))),
    );
    register(['from_rgb_percent'], ({ entry, numbers }) =>
      primitiveResult(entry, colorFromChannels(numbers.slice(0, 3).map((number) => number * 255))),
    );
    register(['to_hex_string'], ({ entry, args }) =>
      primitiveResult(entry, normalizeColor(args[0].value, true)),
    );
    register(
      ['brightness_shift', 'hue_shift', 'saturation_shift'],
      ({ entry, name, args, numbers }) =>
        primitiveResult(
          entry,
          shiftColor(args[0].value, name.replace('_shift', ''), finiteNumber(numbers[1])),
        ),
    );
    register(['blink_shader', 'fade_shader', 'rainbow_shader', 'shine_shader'], ({ name }) =>
      shaderResult(shaderColorName(name)),
    );
    register(['gradient_shader'], ({ numbers }) =>
      shaderResult(integer(numbers[0]) === 2 ? 'GRADIENT_2' : 'GRADIENT'),
    );
    register(['wynncraft_shader'], ({ strings }) => shaderResult(strings[0]));

    register(['with_color'], ({ entry, strings, args }) =>
      primitiveResult(
        entry,
        scopedStyle(`&#${normalizeColor(args[1].value, true).slice(1)}`, strings[0]),
      ),
    );
    register(['with_bold'], ({ entry, strings, args }) =>
      primitiveResult(entry, formatCode('l', Profile.asBoolean(args[1]), strings[0])),
    );
    register(['with_italic'], ({ entry, strings, args }) =>
      primitiveResult(entry, formatCode('o', Profile.asBoolean(args[1]), strings[0])),
    );
    register(['with_obfuscated'], ({ entry, strings, args }) =>
      primitiveResult(entry, formatCode('k', Profile.asBoolean(args[1]), strings[0])),
    );
    register(['with_strikethrough'], ({ entry, strings, args }) =>
      primitiveResult(entry, formatCode('m', Profile.asBoolean(args[1]), strings[0])),
    );
    register(['with_underlined'], ({ entry, strings, args }) =>
      primitiveResult(entry, formatCode('n', Profile.asBoolean(args[1]), strings[0])),
    );
    register(['with_resource_font'], ({ entry, strings }) =>
      primitiveResult(entry, scopedStyle(`&{fr:${strings[1]}}`, strings[0])),
    );
    register(['with_atlas_sprite_font'], ({ entry, strings }) =>
      primitiveResult(entry, scopedStyle(`&{fas:${strings[1]};${strings[2]}}`, strings[0])),
    );
    register(['with_player_sprite_font'], ({ entry, strings, args }) =>
      primitiveResult(
        entry,
        scopedStyle(`&{fps:${strings[1]};${Profile.asBoolean(args[2])}}`, strings[0]),
      ),
    );
    register(['with_shadow_color'], ({ entry, strings, args }) =>
      primitiveResult(
        entry,
        scopedStyle(`&{sc:${normalizeColor(args[1].value, true)}}`, strings[0]),
      ),
    );
    register(['class'], ({ entry, args }) => {
      const baseName = String(Profile.PROFILE.class?.value || 'Mage');
      const showReskinnedName = args[1] == null ? true : Profile.asBoolean(args[1]);
      const name = showReskinnedName ? baseName : baseName;
      return primitiveResult(
        entry,
        Profile.asBoolean(args[0]) ? name.toLocaleUpperCase('en-US') : name,
      );
    });
    register(['to_fancy_text'], ({ entry, strings }) =>
      primitiveResult(entry, Profile.toFancyText(strings[0])),
    );
    register(['to_background_text'], ({ entry, strings, args }) =>
      primitiveResult(
        entry,
        Profile.toBackgroundText(strings[0], args[1].value, args[2].value, strings[3], strings[4]),
      ),
    );

    register(['time'], ({ entry, numbers }) => primitiveResult(entry, integer(numbers[0])));
    register(['timestamp'], ({ entry, args }) => primitiveResult(entry, args[0].value));
    register(['time_offset'], ({ entry, args, numbers }) =>
      primitiveResult(entry, args[0].value + integer(numbers[1]) * 1000),
    );
    register(['seconds_between'], ({ entry, args }) =>
      primitiveResult(entry, integer((args[1].value - args[0].value) / 1000)),
    );
    register(['seconds_since'], ({ entry, args }) =>
      primitiveResult(entry, integer((Profile.PROFILE.now.value - args[0].value) / 1000)),
    );
    register(['time_string'], ({ entry, args }) =>
      primitiveResult(entry, formatRelativeTime(args[0].value)),
    );
    register(['absolute_time'], ({ entry, args }) =>
      primitiveResult(entry, formatTimestamp(args[0].value)),
    );
    register(['format_time_advanced'], ({ entry, args, strings }) =>
      primitiveResult(entry, formatTimestamp(args[0].value, strings[1])),
    );

    function validateResult(value, entry) {
      if (!value || value.type !== entry.r) {
        return Object.freeze({ valid: false, code: 'invalid-result-type' });
      }
      const raw = value.value;
      let valid = true;
      if (['Float', 'Double', 'Number'].includes(entry.r)) valid = typeof raw === 'number';
      else if (['Integer', 'Long'].includes(entry.r))
        valid = Number.isFinite(raw) && Number.isInteger(raw);
      else if (entry.r === 'Boolean') valid = typeof raw === 'boolean';
      else if (['String', 'StyledText'].includes(entry.r)) valid = typeof raw === 'string';
      else if (entry.r === 'CustomColor') valid = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(raw);
      else if (entry.r === 'CappedValue') {
        valid = Number.isFinite(raw?.current) && Number.isFinite(raw?.maximum);
      } else if (entry.r === 'RangedValue') {
        valid = Number.isFinite(raw?.minimum) && Number.isFinite(raw?.maximum);
      } else if (entry.r === 'NamedValue') {
        valid = typeof raw?.name === 'string' && Number.isFinite(raw?.value);
      } else if (entry.r === 'Location') {
        valid = Number.isFinite(raw?.x) && Number.isFinite(raw?.y) && Number.isFinite(raw?.z);
      } else if (entry.r === 'Time') valid = Number.isFinite(raw);
      else if (entry.r === 'Object') valid = raw !== undefined;
      return Object.freeze({ valid, code: valid ? '' : 'invalid-result-shape' });
    }

    function warning(code, entry, node, range) {
      return Object.freeze({
        code,
        functionName: entry?.n || node?.name || '',
        start: range?.start ?? node?.start ?? 0,
        end: range?.end ?? node?.end ?? 1,
      });
    }

    function warnOutputLimit(context, entry, node, range) {
      if (context.outputLimitWarned) return;
      context.outputLimitWarned = true;
      context.warnings.push(
        warning('output-limit', entry || { n: 'Content' }, node || { name: 'Content' }, range),
      );
    }

    function evaluateCall(node, context, range, applyFormatting) {
      const entry = functionIndex.get(String(node.name || '').toLowerCase());
      if (!entry) {
        const unknown = { n: node.name || 'unknown', r: 'String' };
        context.warnings.push(warning('unsupported-function', unknown, node, range));
        context.unsupported.add(unknown.n);
        return unsupportedSample(unknown);
      }
      const name = entry.n.toLowerCase();
      const args = node.args.map((argument) =>
        evaluateNodeInternal(argument, context, undefined, false),
      );
      const rawStrings = args.map(Profile.displayValue);
      const boundedInputs = ['String', 'StyledText'].includes(entry.r)
        ? rawStrings.map((value) => limitText(value))
        : null;
      const strings = boundedInputs ? boundedInputs.map((value) => value.text) : rawStrings;
      const inputLimited = Boolean(boundedInputs?.some((value) => value.limited));
      const numbers = args.map(Profile.asNumber);
      const profileValue = Profile.PROFILE[name];
      const handler = HANDLERS[name];
      if (!profileValue && !handler) {
        context.warnings.push(warning('unsupported-function', entry, node, range));
        context.unsupported.add(entry.n);
        return unsupportedSample(entry);
      }
      if (profileValue && !handler && node.args.length > 0) {
        context.warnings.push(warning('unsupported-function', entry, node, range));
        context.unsupported.add(entry.n);
        return unsupportedSample(entry);
      }
      try {
        const value = handler
          ? handler({ entry, name, node, args, strings, numbers })
          : profileValue;
        const validation = validateResult(value, entry);
        if (!validation.valid) {
          context.warnings.push(warning(validation.code, entry, node, range));
          return unsupportedSample(entry);
        }
        const formatted = applyFormatting
          ? formatResult(value, node.formatStart == null ? null : node.format)
          : value;
        const bounded = limitResultText(formatted, inputLimited);
        if (bounded?.outputLimited) warnOutputLimit(context, entry, node, range);
        return bounded;
      } catch (_error) {
        context.warnings.push(warning('simulation-error', entry, node, range));
        return unsupportedSample(entry);
      }
    }

    function evaluateNodeInternal(node, context, range, applyFormatting) {
      if (!node) return result('String', '⟦invalid⟧', undefined, { simulated: false });
      if (node.type === 'ErrorNode') {
        return result('String', `⟦${node.raw || 'invalid'}⟧`, undefined, { simulated: false });
      }
      if (node.type === 'Literal') {
        if (node.kind === 'String') return result('String', Profile.decodeString(node.value));
        return result(node.kind, node.value);
      }
      return evaluateCall(node, context, range, applyFormatting);
    }

    function createContext() {
      return { warnings: [], unsupported: new Set(), outputLimitWarned: false };
    }

    function evaluateNode(node) {
      return evaluateNodeInternal(node, createContext(), undefined, true);
    }

    function evaluateExpression(body) {
      const parsed = Parser.parseExpression(body, 0);
      if (parsed.diagnostics.length) {
        return result('String', `⟦${String(body || '').trim()}⟧`, undefined, { simulated: false });
      }
      return evaluateNode(parsed.node);
    }

    function serializeTopLevel(value) {
      if (value?.type === 'CustomColor' && value.simulated !== false) {
        return `§${normalizeColor(value.value, true)}`;
      }
      return Profile.displayValue(value);
    }

    function evaluateTemplate(content, parsedTemplate) {
      const text = String(content == null ? '' : content);
      const parsed = parsedTemplate?.source === text ? parsedTemplate : Parser.parseTemplate(text);
      const context = createContext();
      const output = createOutputBuffer();
      let cursor = 0;
      for (const expression of parsed.expressions) {
        if (!output.append(text, cursor, expression.start)) break;
        const rendered = serializeTopLevel(
          evaluateNodeInternal(
            expression.expression,
            context,
            {
              start: expression.start,
              end: expression.end,
            },
            true,
          ),
        );
        if (!output.append(rendered)) break;
        cursor = expression.end;
      }
      if (!output.limited) output.append(text, cursor);
      const boundedOutput = output.finish();
      if (boundedOutput.limited) {
        warnOutputLimit(
          context,
          { n: 'Content' },
          { name: 'Content' },
          {
            start: 0,
            end: Math.min(text.length, MAX_OUTPUT_LENGTH),
          },
        );
      }
      return Object.freeze({
        text: boundedOutput.text,
        warnings: Object.freeze(context.warnings.slice()),
        unsupportedFunctions: Object.freeze(Array.from(context.unsupported).sort()),
      });
    }

    function sampleText(content, parsedTemplate) {
      return evaluateTemplate(content, parsedTemplate).text;
    }

    function simulationCoverage() {
      const catalog = new Set(functionData.map((entry) => entry.n));
      const implementedSet = new Set([...Object.keys(HANDLERS), ...Object.keys(Profile.PROFILE)]);
      const unsupportedSet = new Set(Object.keys(Profile.UNSUPPORTED_FUNCTIONS || {}));
      const implemented = Array.from(catalog)
        .filter((name) => implementedSet.has(name))
        .sort();
      const unsupported = Array.from(catalog)
        .filter((name) => unsupportedSet.has(name))
        .sort();
      const missing = Array.from(catalog)
        .filter((name) => !implementedSet.has(name) && !unsupportedSet.has(name))
        .sort();
      const overlap = Array.from(catalog)
        .filter((name) => implementedSet.has(name) && unsupportedSet.has(name))
        .sort();
      const staleUnsupported = Array.from(unsupportedSet)
        .filter((name) => !catalog.has(name))
        .sort();
      return Object.freeze({
        implemented: Object.freeze(implemented),
        unsupported: Object.freeze(unsupported),
        missing: Object.freeze(missing),
        overlap: Object.freeze(overlap),
        staleUnsupported: Object.freeze(staleUnsupported),
      });
    }

    const ARGUMENT_EXAMPLES = Object.freeze({
      String: '"Example"',
      Integer: '1',
      Long: '1',
      Float: '1.5',
      Double: '1.5',
      Number: '1.5',
      Boolean: 'true',
      CustomColor: 'from_hex("#55FFFF")',
      StyledText: 'styled_text("Example")',
      CappedValue: 'capped_health',
      RangedValue: 'tower_dps',
      NamedValue: 'named_value("Speed";3)',
      Location: 'my_location',
      Time: 'now',
      Object: '"Example"',
      Any: '"Example"',
      List: '"Example"',
    });

    const LIST_ARGUMENT_EXAMPLES = Object.freeze({
      add: '1.5;2.5',
      and: 'true;false',
      concat: '"Example";" Text"',
      concat_styled_text: 'styled_text("Example");styled_text(" Text")',
      max: '1.5;2.5',
      min: '1.5;2.5',
      multiply: '1.5;2.5',
      or: 'true;false',
    });

    const INSERTION_OVERRIDES = Object.freeze({
      to_background_text:
        '{to_background_text("WYNN";from_hex("#FFFFFF");from_hex("#8A2BE2");"PILL";"PILL")}',
      to_fancy_text: '{to_fancy_text("WYNNCRAFT")}',
      wynncraft_shader: '{wynncraft_shader("RAINBOW")}',
      gradient_shader: '{gradient_shader(1)}',
      fade_shader: '{fade_shader}',
      blink_shader: '{blink_shader}',
      rainbow_shader: '{rainbow_shader}',
      shine_shader: '{shine_shader}',
      switch_case: '{switch_case("value";"default";"value";"matched")}',
      warp_shader: '{warp_shader}',
    });

    function functionInsertion(entry) {
      if (!entry) return '';
      if (INSERTION_OVERRIDES[entry.n]) return INSERTION_OVERRIDES[entry.n];
      const required = entry.p.filter((parameter) => parameter[2]);
      const parameters = required.map(([, type]) =>
        type === 'List'
          ? LIST_ARGUMENT_EXAMPLES[entry.n] || ARGUMENT_EXAMPLES.List
          : ARGUMENT_EXAMPLES[type] || '"Example"',
      );
      return `{${entry.n}${parameters.length ? `(${parameters.join(';')})` : ''}}`;
    }

    return Object.freeze({
      functionIndex,
      evaluateNode,
      evaluateExpression,
      evaluateTemplate,
      sampleText,
      functionInsertion,
      formatNumber,
      validateResult,
      simulationCoverage,
      MAX_OUTPUT_LENGTH,
    });
  },
);
