(function (root, factory) {
  const api = factory(
    root.WYNNTILS_FUNCTIONS || [],
    root.WYNNTILS_FONT_RESOURCES || { fonts: {} },
    root.WYNNTILS_FUNCTION_META || {},
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WynntilsSimulationProfile = api;
})(
  typeof globalThis !== 'undefined' ? globalThis : window,
  function (functionData, resources, metadata) {
    'use strict';

    const MAX_PREVIEW_TEXT_LENGTH = 4096;

    function typed(type, value, display, meta) {
      return Object.freeze({ type, value, display, ...(meta || {}) });
    }

    const PROFILE = Object.freeze({
      fps: typed('Integer', 144),
      ping: typed('Integer', 42),
      current_world: typed('String', 'WC1'),
      current_territory: typed('String', 'Ragni'),
      current_territory_owner: typed('String', 'The Kingdom of Foxes'),
      player_name: typed('String', 'ExamplePlayer'),
      class: typed('String', 'Mage'),
      level: typed('Integer', 106),
      money: typed('Integer', 12864, '12,864'),
      health: typed('Integer', 1000),
      health_max: typed('Integer', 1280),
      health_pct: typed('Double', 78.125),
      capped_health: typed('CappedValue', { current: 1000, maximum: 1280 }),
      mana: typed('Integer', 82),
      mana_max: typed('Integer', 100),
      mana_pct: typed('Double', 82),
      capped_mana: typed('CappedValue', { current: 82, maximum: 100 }),
      sprint: typed('CappedValue', { current: 91, maximum: 100 }),
      my_location: typed('Location', { x: 123, y: 64, z: -42, world: 'WC1' }),
      current_raid: typed('String', 'The Nameless Anomaly'),
      current_raid_room_name: typed('String', 'Orphion Nexus'),
      guild_name: typed('String', 'Example Guild'),
      guild_rank: typed('String', 'Captain'),
      party_leader: typed('String', 'ExamplePlayer'),
      held_item_name: typed('String', 'Warp'),
      held_item_type: typed('String', 'Wand'),
      mount_name: typed('String', 'Black Horse'),
      lootrun_state: typed('String', 'RUNNING'),
      lootrun_current_mission: typed('String', 'Cleansing Ritual'),
      lootrun_current_mission_objective: typed('String', 'Defeat the corrupted enemies'),
      lootrun_current_trial: typed('String', 'Ultimate Sacrifice'),
      lootrun_current_trial_objective: typed('String', 'Survive the encounter'),
      lootrun_last_selected_beacon_color: typed('String', 'AQUA'),
      lootrun_task_name: typed('String', 'Seaskipper Rescue'),
      lootrun_task_type: typed('String', 'COMBAT'),
      dry_b: typed('Integer', 3),
      dry_s: typed('Integer', 5),
      dry_p: typed('Integer', 7),
      dry_boxes: typed('Integer', 3),
      dry_streak: typed('Integer', 5),
      dry_pulls: typed('Integer', 7),
      dry_raid_reward_pulls: typed('Integer', 12),
      dry_raids_tomes: typed('Integer', 2),
      dry_aspects: typed('Integer', 4),
      dry_raids_aspects: typed('Integer', 1),
      area_damage_average: typed('Double', 4200),
      area_damage_per_second: typed('Long', 38750),
      total_area_damage: typed('Double', 193750),
      team_dps: typed('Long', 245000),
      personal_dps: typed('Long', 62500),
      clock: typed('String', '12:34'),
      clockm: typed('String', '12:34:56'),
      now: typed('Time', 1788266096000, '2026-09-01 12:34:56'),
      world_state: typed('String', 'WORLD'),
      wynntils_version: typed(
        'String',
        String(metadata.ref || metadata.commit || 'Unknown').replace(/^v/i, ''),
      ),
      wynncraft_version: typed('String', '2.1'),
      minecraft_version: typed('String', '1.21.8'),
      le: typed('Integer', 3),
      eb: typed('Integer', 9),
      liquid_emerald: typed('Integer', 3),
      emerald_block: typed('Integer', 9),
      emeralds: typed('Integer', 0),
    });

    // This list is intentionally explicit: a newly added upstream function must fail coverage
    // tests until it is implemented or consciously classified here.
    const UNSUPPORTED_NAMES = Object.freeze([
      'ability_cooldown',
      'accessory_durability',
      'activity_color',
      'activity_icon',
      'activity_name',
      'activity_task',
      'activity_type',
      'all_shiny_stats',
      'annihilation_dry_count',
      'annihilation_sun_progress',
      'armor_durability',
      'arrow_shield_count',
      'aspect_tier',
      'aura_timer',
      'blocks_above_ground',
      'bomb_end_time',
      'bomb_formatted_string',
      'bomb_length',
      'bomb_owner',
      'bomb_remaining_time',
      'bomb_start_time',
      'bomb_type',
      'bomb_world',
      'bps',
      'bps_xz',
      'broken_mantle_shield_count',
      'capped_awakened_progress',
      'capped_blood_pool',
      'capped_corrupted',
      'capped_focus',
      'capped_guild_level_progress',
      'capped_guild_objectives_progress',
      'capped_held_item_durability',
      'capped_holy_power',
      'capped_ingredient_pouch_slots',
      'capped_inventory_slots',
      'capped_level',
      'capped_mana_bank',
      'capped_mem',
      'capped_mount_stat',
      'capped_ophanim',
      'capped_xp',
      'chest_opened',
      'chests_opened_this_session',
      'chosen_buff',
      'chosen_buffs',
      'chosen_gambit',
      'chosen_gambits',
      'commander_activated',
      'commander_duration',
      'contributed_guild_xp',
      'contribution_rank',
      'crow_count',
      'current_distortion',
      'current_mount_energy',
      'current_raid_boss_count',
      'current_raid_challenge_count',
      'current_raid_damage',
      'current_raid_room_damage',
      'current_raid_room_start',
      'current_raid_room_time',
      'current_raid_start',
      'current_raid_time',
      'current_tower_attack_speed',
      'current_tower_damage',
      'current_tower_defense',
      'current_tower_health',
      'current_world_event',
      'current_world_event_start_time',
      'debuffs_in_radius_value',
      'dir',
      'emerald_string',
      'equipped_accessory_name',
      'equipped_armor_name',
      'equipped_aspect',
      'estimated_time_to_finish_war',
      'estimated_war_end',
      'focused_mob_health',
      'focused_mob_health_percent',
      'focused_mob_name',
      'friends',
      'gathering_totem',
      'gathering_totem_count',
      'gathering_totem_distance',
      'gathering_totem_owner',
      'gathering_totem_time_left',
      'guardian_angels_count',
      'guild_level',
      'guild_objective_event_bonus',
      'guild_objective_goal',
      'guild_objective_score',
      'hades_party_member_health',
      'hades_party_member_location',
      'hades_party_member_mana',
      'hades_party_member_name',
      'hades_party_member_uuid',
      'has_no_gui',
      'held_item_cooldown',
      'held_item_current_durability',
      'held_item_max_durability',
      'held_item_shiny_stat',
      'highest_dry_streak',
      'hounds_time_left',
      'hummingbirds_state',
      'id',
      'in_mapped_area',
      'in_stream',
      'ingredient_pouch_ingredients',
      'ingredient_pouch_open_slots',
      'ingredient_pouch_used_slots',
      'initial_tower_attack_speed',
      'initial_tower_damage',
      'initial_tower_defense',
      'initial_tower_health',
      'inventory_free',
      'inventory_ingredients',
      'inventory_used',
      'is_ability_unlocked',
      'is_allied_guild',
      'is_aspect_equipped',
      'is_friend',
      'is_guild_member',
      'is_party_member',
      'is_party_member_alive',
      'is_party_member_online',
      'is_riding_horse',
      'is_territory_queued',
      'is_tracking_activity',
      'item_count',
      'judrajim_active',
      'key_pressed',
      'kills_per_minute',
      'last_damage_dealt',
      'last_dry_streak',
      'last_harvest_material_level',
      'last_harvest_material_name',
      'last_harvest_material_tier',
      'last_harvest_material_type',
      'last_harvest_resource_type',
      'last_harvest_xp_gain',
      'last_kill',
      'last_mythic',
      'last_profession_xp_gain',
      'last_spell_health_cost',
      'last_spell_mana_cost',
      'last_spell_name',
      'last_spell_repeat_count',
      'leaderboard_position',
      'location_at_crosshair',
      'lootrun_beacon_count',
      'lootrun_beacon_vibrant',
      'lootrun_challenges',
      'lootrun_current_mission_progress',
      'lootrun_current_trial_progress',
      'lootrun_last_selected_beacon_vibrant',
      'lootrun_mission',
      'lootrun_next_orange_expire',
      'lootrun_orange_beacon_count',
      'lootrun_rainbow_beacon_count',
      'lootrun_red_beacon_challenge_count',
      'lootrun_rerolls',
      'lootrun_sacrifices',
      'lootrun_task_location',
      'lootrun_time',
      'lootrun_trial',
      'mantle_shield_count',
      'material_count',
      'material_dry_streak',
      'mem_max',
      'mem_pct',
      'mem_used',
      'minecraft_effect_duration',
      'mirror_image_clone',
      'mirror_image_duration',
      'mob_totem',
      'mob_totem_count',
      'mob_totem_distance',
      'mob_totem_owner',
      'mob_totem_time_left',
      'momentum',
      'momentum_percent',
      'mount_potential',
      'newest_world',
      'objective_streak',
      'ophanim_active',
      'ophanim_healing_percent',
      'ophanim_orb',
      'party_member_health',
      'party_member_level',
      'party_member_name',
      'party_members',
      'party_total_level',
      'patchwork_abomination_duration',
      'personal_objective_event_bonus',
      'personal_objective_goal',
      'personal_objective_score',
      'pitch',
      'player_uuid',
      'powder_special_charge',
      'profession_level',
      'profession_percentage',
      'profession_xp',
      'profession_xp_per_minute',
      'profession_xp_per_minute_raw',
      'puppet_count',
      'puppets_in_time_range',
      'raid_challenges',
      'raid_has_room',
      'raid_intermission_time',
      'raid_is_boss_room',
      'raid_personal_best_time',
      'raid_room_damage',
      'raid_room_name',
      'raid_room_start',
      'raid_room_time',
      'raid_time_remaining',
      'raids_runs_since',
      'remnant_count',
      'scoreboard_party_members',
      'shaman_mask',
      'shaman_totem_distance',
      'shaman_totem_location',
      'shaman_totem_poison_amount',
      'shaman_totem_state',
      'shaman_totem_time_left',
      'shaman_totem_transfused_amount',
      'shield_type_name',
      'snake_count',
      'specific_raid_runs_since',
      'spell_name_from_direction',
      'spell_name_from_number',
      'statistics_average',
      'statistics_count',
      'statistics_first_modified',
      'statistics_first_modified_time',
      'statistics_formatted',
      'statistics_last_modified',
      'statistics_last_modified_time',
      'statistics_max',
      'statistics_min',
      'statistics_total',
      'status_effect_active',
      'status_effect_duration',
      'status_effect_modifier',
      'status_effect_prefix',
      'status_effects',
      'stopwatch_hours',
      'stopwatch_milliseconds',
      'stopwatch_minutes',
      'stopwatch_running',
      'stopwatch_seconds',
      'stopwatch_zero',
      'targeted_mob_debuff_value',
      'teleport_scroll_charges',
      'teleport_scroll_recharge_timer',
      'ticks',
      'ticks_since_last_spell',
      'ticks_since_specific_spell',
      'time_in_war',
      'time_since_last_damage_dealt',
      'time_since_last_kill',
      'token_gatekeeper',
      'token_gatekeeper_count',
      'token_gatekeeper_deposited',
      'token_gatekeeper_type',
      'tower_dps',
      'tower_effective_hp',
      'tower_owner',
      'tower_territory',
      'volley_timer',
      'war_start',
      'wars_since',
      'world_event_start_time',
      'world_uptime',
      'wynntils_role',
      'xp',
      'xp_overflow',
      'xp_pct',
      'xp_per_minute',
      'xp_per_minute_raw',
      'xp_percentage_per_minute',
      'xp_raw',
      'xp_req',
      'xp_req_raw',
    ]);

    const UNSUPPORTED_FUNCTIONS = Object.freeze(
      Object.fromEntries(
        UNSUPPORTED_NAMES.map((name) => [name, 'requires live game state or client resources']),
      ),
    );
    const UNSUPPORTED_WITH_REASONS = Object.freeze({
      ...UNSUPPORTED_FUNCTIONS,
      random: 'non-deterministic random value',
      regex_find: 'user regular expressions cannot be evaluated safely on the browser main thread',
      regex_match: 'user regular expressions cannot be evaluated safely on the browser main thread',
      regex_replace:
        'user regular expressions cannot be evaluated safely on the browser main thread',
    });

    const TYPE_FALLBACKS = Object.freeze({
      Float: () => typed('Float', 12.5),
      Double: () => typed('Double', 12.5),
      Integer: () => typed('Integer', 42),
      Long: () => typed('Long', 12345),
      Number: () => typed('Number', 12.5),
      Boolean: () => typed('Boolean', true),
      String: (entry) => typed('String', humanize(entry.n)),
      CustomColor: () => typed('CustomColor', '#55FFFF'),
      StyledText: (entry) => typed('StyledText', `&b${humanize(entry.n)}`),
      CappedValue: () => typed('CappedValue', { current: 80, maximum: 100 }),
      RangedValue: () => typed('RangedValue', { minimum: 120, maximum: 180 }),
      NamedValue: (entry) => typed('NamedValue', { name: humanize(entry.n), value: 3 }),
      Location: () => typed('Location', { x: 123, y: 64, z: -42, world: 'WC1' }),
      Time: () => typed('Time', 1788266096000, '2026-09-01 12:34:56'),
      Object: (entry) => typed('Object', humanize(entry.n)),
    });

    const SHADER_COLORS = Object.freeze({
      BLINK: '#00F00C',
      FADE: '#00F008',
      FADE_2: '#00F018',
      GRADIENT: '#00F004',
      GRADIENT_2: '#00F010',
      ITALIC: '#00F01C',
      ITALIC_2: '#00F020',
      RAINBOW: '#00F000',
      SHINE: '#00F014',
      WARP: '#00F024',
    });

    const EDGE_GLYPHS = Object.freeze({
      PILL: ['\uE010', '\uE011'],
      BOX: ['\uE00C', '\uE00D'],
      FLAG: ['\uE00A', '\uE00B'],
      RIBBON: ['\uE008', '\uE009'],
    });

    const fiveProvider = resources.fonts?.['wynntils:five']?.providers?.find(
      (provider) => provider.type === 'bitmap',
    );
    const FANCY_GLYPHS = new Map();
    (fiveProvider?.chars || []).forEach((row, rowIndex) => {
      const labels = fiveProvider?.labels?.[rowIndex] || '';
      Array.from(labels).forEach((label, columnIndex) => {
        const glyph = Array.from(row)[columnIndex];
        if (glyph) FANCY_GLYPHS.set(label.toLowerCase(), glyph);
      });
    });

    function humanize(name) {
      return String(name || 'sample')
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    }

    function normalizeColor(value, fallback) {
      const match = String(value == null ? '' : value)
        .trim()
        .match(/^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
      return match ? `#${match[1].toUpperCase()}` : fallback || '#FFFFFF';
    }

    function fallbackForEntry(entry) {
      const factory = TYPE_FALLBACKS[entry?.r] || TYPE_FALLBACKS.Object;
      return factory(entry || { n: 'sample' });
    }

    function asNumber(result) {
      if (result?.type === 'CappedValue') return Number(result.value?.current) || 0;
      if (result?.type === 'NamedValue') return Number(result.value?.value) || 0;
      const number = Number(result?.value);
      return number;
    }

    function asBoolean(result) {
      if (result?.type === 'Boolean') return Boolean(result.value);
      if (typeof result?.value === 'number') return result.value !== 0;
      const value = String(result?.value == null ? '' : result.value).toLowerCase();
      return value !== '' && value !== '0' && value !== 'false';
    }

    function displayValue(result) {
      if (!result) return '';
      if (result.display != null) return String(result.display);
      if (result.type === 'Boolean') return result.value ? 'true' : 'false';
      if (result.type === 'CappedValue') return `${result.value.current}/${result.value.maximum}`;
      if (result.type === 'RangedValue') return `${result.value.minimum}–${result.value.maximum}`;
      if (result.type === 'NamedValue') return `${result.value.name}: ${result.value.value}`;
      if (result.type === 'Location') {
        return `${result.value.x}, ${result.value.y}, ${result.value.z}`;
      }
      return String(result.value == null ? '' : result.value);
    }

    function decodeString(raw) {
      const source = String(raw || '');
      let output = '';
      for (let index = 0; index < source.length; index += 1) {
        if (source[index] !== '\\' || index + 1 >= source.length) {
          output += source[index];
          continue;
        }
        const escaped = source[index + 1];
        index += 1;
        if (escaped === '\\') output += '\\\\';
        else if (escaped === 'n') output += '\n';
        else if (escaped === '{' || escaped === '}') output += escaped;
        else if (escaped === 'E') output += '²';
        else if (escaped === 'B') output += '½';
        else if (escaped === 'L') output += '¼';
        else if (escaped === 'M') output += '✺';
        else if (escaped === 'H') output += '❤';
        else if (escaped === '&') output += '\\&';
        else output += `\\${escaped}`;
      }
      return output;
    }

    function toFancyText(text) {
      return Array.from(String(text == null ? '' : text), (character) => {
        if (character === ' ') return character;
        return FANCY_GLYPHS.get(character.toLowerCase()) || character;
      }).join('');
    }

    function toBackgroundText(text, textColor, backgroundColor, leftEdge, rightEdge) {
      const foreground = `${normalizeColor(textColor, '#FFFFFF')}FF`;
      const background = `${normalizeColor(backgroundColor, '#000000')}FF`;
      const left = EDGE_GLYPHS[String(leftEdge || '').toUpperCase()] || null;
      const right = EDGE_GLYPHS[String(rightEdge || '').toUpperCase()] || null;
      let output = '';
      let inBackground = false;
      for (const raw of String(text == null ? '' : text)) {
        const character = raw.toLowerCase();
        if (character === ' ') {
          output += inBackground ? `§${background}\uE00F\uE012 ` : `§${foreground} `;
          continue;
        }
        const fancy = FANCY_GLYPHS.get(character);
        if (fancy) {
          if (!inBackground) {
            if (left) output += `§${background}${left[0]}\u2064`;
            inBackground = true;
          }
          output += `§${background}\uE00F\uE012§${foreground}${fancy}`;
        } else {
          if (inBackground) {
            if (right) output += `§${background}\u2064${right[1]}`;
            inBackground = false;
          }
          output += `§${foreground}${character}`;
        }
      }
      if (inBackground && right) output += `§${background}\u2064${right[1]}`;
      return output;
    }

    return Object.freeze({
      PROFILE,
      MAX_PREVIEW_TEXT_LENGTH,
      UNSUPPORTED_FUNCTIONS: UNSUPPORTED_WITH_REASONS,
      SHADER_COLORS,
      EDGE_GLYPHS,
      FANCY_GLYPHS,
      typed,
      humanize,
      normalizeColor,
      fallbackForEntry,
      asNumber,
      asBoolean,
      displayValue,
      decodeString,
      toFancyText,
      toBackgroundText,
    });
  },
);
