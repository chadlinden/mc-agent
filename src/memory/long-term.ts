import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/logger.js';

const log = createLogger('long-term-memory');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MEMORY_PATH = path.join(__dirname, '../../data/memory.json');

interface Position {
  x: number;
  y: number;
  z: number;
}

interface PlayerInfo {
  firstSeen: number;
  lastSeen?: number;
  interactions: number;
  [key: string]: unknown;
}

interface LocationInfo {
  position: Position;
  description: string;
  savedAt: number;
}

interface MemoryData {
  players: Record<string, PlayerInfo>;
  locations: Record<string, LocationInfo>;
  facts: string[];
  preferences: Record<string, unknown>;
  createdAt: number;
  lastUpdated: number;
}

/**
 * Persistent long-term memory stored as JSON
 */
export class LongTermMemory {
  private filePath: string;
  private data: MemoryData;

  constructor(filePath: string = DEFAULT_MEMORY_PATH) {
    this.filePath = filePath;
    this.data = {
      players: {},
      locations: {},
      facts: [],
      preferences: {},
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };
    this.load();
  }

  /**
   * Load memory from disk
   */
  load(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(content) as MemoryData;
        log.info('Long-term memory loaded', { entries: this.data.facts.length });
      } else {
        this.save();
        log.info('Created new long-term memory file');
      }
    } catch (err) {
      const error = err as Error;
      log.error('Failed to load long-term memory', { error: error.message });
    }
  }

  /**
   * Save memory to disk
   */
  save(): void {
    try {
      this.data.lastUpdated = Date.now();
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
      log.debug('Long-term memory saved');
    } catch (err) {
      const error = err as Error;
      log.error('Failed to save long-term memory', { error: error.message });
    }
  }

  /**
   * Remember a player
   */
  rememberPlayer(username: string, info: Partial<PlayerInfo>): void {
    const existing = this.data.players[username];
    if (!existing) {
      this.data.players[username] = {
        firstSeen: Date.now(),
        interactions: 0,
      };
    }
    const current = this.data.players[username]!;
    this.data.players[username] = {
      ...current,
      ...info,
      lastSeen: Date.now(),
      interactions: (current.interactions || 0) + 1,
    };
    this.save();
  }

  /**
   * Get player info
   */
  getPlayer(username: string): PlayerInfo | null {
    return this.data.players[username] || null;
  }

  /**
   * Get all known players
   */
  getAllPlayers(): Record<string, PlayerInfo> {
    return this.data.players;
  }

  /**
   * Save a named location
   */
  saveLocation(name: string, position: Position, description: string = ''): void {
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
  getLocation(name: string): LocationInfo | null {
    return this.data.locations[name] || null;
  }

  /**
   * Get all locations
   */
  getAllLocations(): Record<string, LocationInfo> {
    return this.data.locations;
  }

  /**
   * Add a fact
   */
  addFact(fact: string): void {
    if (!this.data.facts.includes(fact)) {
      this.data.facts.push(fact);
      this.save();
      log.info('Fact added', { fact });
    }
  }

  /**
   * Get all facts
   */
  getFacts(): string[] {
    return this.data.facts;
  }

  /**
   * Set a preference
   */
  setPreference(key: string, value: unknown): void {
    this.data.preferences[key] = value;
    this.save();
  }

  /**
   * Get a preference
   */
  getPreference<T>(key: string, defaultValue: T | null = null): T | null {
    return (this.data.preferences[key] as T) ?? defaultValue;
  }

  /**
   * Format memory for LLM context
   */
  formatForContext(): string {
    const lines: string[] = [];

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
