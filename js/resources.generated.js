(function (root) {
  'use strict';

  // Generated from https://github.com/Wynntils/Wynntils.
  const freeze = (value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.values(value).forEach(freeze);
    }
    return value;
  };
  root.WYNNTILS_FONT_RESOURCES = freeze({
    source: {
      repository: 'https://github.com/Wynntils/Wynntils',
      commit: '0a03ed7ae17757304077134c5e60299877941e62',
      license: 'LGPL-3.0',
    },
    assets: {
      five: {
        path: 'assets/fonts/five.png',
        width: 112,
        height: 21,
      },
      ribbon_start: {
        path: 'assets/fonts/ribbon_start.png',
        width: 7,
        height: 8,
      },
      ribbon_end: {
        path: 'assets/fonts/ribbon_end.png',
        width: 7,
        height: 8,
      },
      flag_start: {
        path: 'assets/fonts/flag_start.png',
        width: 5,
        height: 7,
      },
      flag_end: {
        path: 'assets/fonts/flag_end.png',
        width: 5,
        height: 7,
      },
      box_start: {
        path: 'assets/fonts/box_start.png',
        width: 2,
        height: 7,
      },
      box_end: {
        path: 'assets/fonts/box_end.png',
        width: 2,
        height: 7,
      },
    },
    fonts: {
      'wynntils:five': {
        providers: [
          {
            type: 'bitmap',
            asset: 'five',
            ascent: 6,
            height: 7,
            chars: ['', '', ''],
            labels: ['ABCDEFGHIJKLMNOP', 'QRSTUVWXYZ?[]\\%&', '0123456789!()<=>'],
          },
        ],
      },
      'wynntils:banners': {
        providers: [
          {
            type: 'bitmap',
            asset: 'ribbon_start',
            codepoint: 57352,
            ascent: 7,
            height: 8,
          },
          {
            type: 'bitmap',
            asset: 'ribbon_end',
            codepoint: 57353,
            ascent: 7,
            height: 8,
          },
          {
            type: 'bitmap',
            asset: 'flag_start',
            codepoint: 57354,
            ascent: 7,
            height: 7,
          },
          {
            type: 'bitmap',
            asset: 'flag_end',
            codepoint: 57355,
            ascent: 7,
            height: 7,
          },
          {
            type: 'bitmap',
            asset: 'box_start',
            codepoint: 57356,
            ascent: 7,
            height: 7,
          },
          {
            type: 'bitmap',
            asset: 'box_end',
            codepoint: 57357,
            ascent: 7,
            height: 7,
          },
        ],
      },
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
