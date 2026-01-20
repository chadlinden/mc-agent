import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/logger.js';

const log = createLogger('long-term-memory');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MEMORY_PATH = path.join(__dirname, '../../data/memory.json');

/**
 * Persistent long-term memory stored as JSON
 */
export class LongTermMemory {
  constructor(filePath = DEFAULT_MEMORY_PATH) {
    this.filePath = filePath;
    this.data = {
      players: {},        // Player relationships and info
      locations: {},      // Named locations (base, farms, etc.)
      facts: [],          // General learned facts
      preferences: {},    // Bot preferences learned over time
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };
    this.load();
  }

  /**
   * Load memory from disk
   */
  load() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(content);
        log.info('Long-term memory loaded', { entries: this.data.facts.length });
      } else {
        this.save();
        log.info('Created new long-term memory file');
      }
    } catch (err) {
      log.error('Failed to load long-term memory', { error: err.message });
    }
  }

  /**
   * Save memory to disk
   */
  save() {
    try {
      this.data.lastUpdated = Date.now();
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
      log.debug('Long-term memory saved');
    } catch (err) {
      log.error('Failed to save long-term memory', { error: err.message });
    }
  }

  /**
   * Remember a player
   */
  rememberPlayer(username, info) {
    if (!this.data.players[username]) {
      this.data.players[username] = {
        firstSeen: Date.now(),
        interactions: 0,
      };
    }
    this.data.players[username] = {
      ...this.data.players[username],
      ...info,
      lastSeen: Date.now(),
      interactions: (this.data.players[username].interactions || 0) + 1,
    };
    this.save();
  }

  /**
   * Get player info
   */
  getPlayer(username) {
    return this.data.players[username] || null;
  }

  /**
   * Get all known players
   */
  getAllPlayers() {
    return this.data.players;
  }

  /**
   * Save a named location
   */
  saveLocation(name, position, description = '') {
    this.data.locations[name] = {
      position: { x: position.x, y: position.y, z: position.z },
      description,
      savedAt: Date.now(),
    };
    this.save();
    log.info('Location saved', { name, position });
  }

  /**
   * Get a named location
   */
  getLocation(name) {
    return this.data.locations[name] || null;
  }

  /**
   * Get all locations
   */
  getAllLocations() {
    return this.data.locations;
  }

  /**
   * Add a fact
   */
  addFact(fact) {
    if (!this.data.facts.includes(fact)) {
      this.data.facts.push(fact);
      this.save();
      log.info('Fact added', { fact });
    }
  }

  /**
   * Get all facts
   */
  getFacts() {
    return this.data.facts;
  }

  /**
   * Set a preference
   */
  setPreference(key, value) {
    this.data.preferences[key] = value;
    this.save();
  }

  /**
   * Get a preference
   */
  getPreference(key, defaultValue = null) {
    return this.data.preferences[key] ?? defaultValue;
  }

  /**
   * Format memory for LLM context
   */
  formatForContext() {
    const lines = [];

    const players = Object.keys(this.data.players);
    if (players.length > 0) {
      lines.push('Known players: ' + players.join(', '));
    }

    const locations = Object.entries(this.data.locations);
    if (locations.length > 0) {
      lines.push('Known locations:');
      for (const [name, loc] of locations) {
        lines.push(`  - ${name}: (${loc.position.x}, ${loc.position.y}, ${loc.position.z}) ${loc.description}`);
      }
    }

    if (this.data.facts.length > 0) {
      lines.push('Known facts:');
      for (const fact of this.data.facts.slice(-10)) {
        lines.push(`  - ${fact}`);
      }
    }

    return lines.join('\n');
  }
}
