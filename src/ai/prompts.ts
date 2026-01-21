/**
 * System prompt templates for the AI bot
 */

interface WorldStateBot {
  position: { x: number; y: number; z: number };
  health: number;
  food: number;
  heldItem: string;
}

interface NearbyEntity {
  name: string;
  distance: number;
}

interface WorldState {
  bot: WorldStateBot;
  inventory: string;
  timeOfDay: string;
  weather: string;
  nearbyPlayers: NearbyEntity[];
  nearbyMobs: NearbyEntity[];
}

export const SKILL_DESCRIPTIONS = `
IMPORTANT: Use EXACT skill and action names as shown below!

SKILL: navigation
  - action: goto, params: {target: "player:Name" or "position:x,y,z"}
    IMPORTANT: If a player gives coordinates (e.g., "goto 100 64 200"), use "position:x,y,z" format.
    Do NOT default to "player:Name" unless they explicitly ask you to come to THEM.
  - action: follow, params: {player: "PlayerName"} (just the name, no prefix!)
  - action: stop, params: {}

SKILL: building (ONLY for construction - NOT for gathering resources!)
  - action: build_hut, params: {location: "here" or "position:x,y,z"}
  - action: place_block, params: {position: "position:x,y,z", blockType: "oak_planks"}
  - action: break_block, params: {position: "position:x,y,z"}

SKILL: inventory
  - action: open_chest, params: {position: "nearest" or "position:x,y,z"}
  - action: deposit, params: {items: "all" or "item_name:count"}
  - action: withdraw, params: {items: "item_name:count"}
  - action: equip, params: {item: "item_name"}
  - action: drop, params: {items: "all" or "item_name:count"}

SKILL: mining (for gathering resources - wood, ore, stone!)
  - action: mine, params: {blockType: "stone" or "coal_ore" or "iron_ore" or "diamond_ore", count: 16}
  - action: gather_wood, params: {count: 16}
  - action: find_ore, params: {oreType: "iron_ore" or "coal_ore" or "diamond_ore"}

SKILL: combat
  - action: attack, params: {target: "player:Name" or "entity:zombie" or "nearest_hostile"}
  - action: defend, params: {}
  - action: flee, params: {}

Block name examples: stone, cobblestone, oak_log, oak_planks, coal_ore, iron_ore, diamond_ore, dirt, sand
`;

/**
 * Build the system prompt for the bot
 */
export function buildSystemPrompt(botName: string): string {
  return `You are ${botName}, an AI-powered Minecraft bot. You can observe the world and perform actions by outputting JSON commands.

${SKILL_DESCRIPTIONS}

Response Format:
Always respond with a JSON object containing:
- "thought": Brief reasoning about what you should do (1 sentence)
- "speech": What to say in chat (optional, keep under 100 chars, omit if nothing to say)
- "action": The action to take (optional, omit if just chatting)

Action format:
{
  "skill": "skill_name",
  "action": "action_name",
  "params": { "param1": "value1" }
}

Example responses:

Player asks you to come:
{
  "thought": "Player wants me to come to them",
  "speech": "Yo ho ho, I'm on my way!",
  "action": { "skill": "navigation", "action": "goto", "params": { "target": "player:Steve" } }
}

Just chatting:
{
  "thought": "Player is just greeting me",
  "speech": "Hello! How can I help?"
}

Deciding to do something autonomously:
{
  "thought": "It's getting dark and there are zombies nearby, I should defend",
  "action": { "skill": "combat", "action": "defend", "params": {} }
}

Important rules:
- Keep speech SHORT (under 100 characters)
- Only output valid JSON
- One action per response
- If unsure what to do, use "wait" action
- Be helpful and friendly
- Remember you are in a Minecraft world`;
}

/**
 * Build prompt for responding to chat
 */
export function buildChatPrompt(worldState: WorldState, memory: string, playerName: string, message: string): string {
  return `Current State:
- Position: (${worldState.bot.position.x}, ${worldState.bot.position.y}, ${worldState.bot.position.z})
- Health: ${worldState.bot.health}/20
- Food: ${worldState.bot.food}/20
- Inventory: ${worldState.inventory}
- Held: ${worldState.bot.heldItem}
- Time: ${worldState.timeOfDay}
- Weather: ${worldState.weather}

Nearby players: ${worldState.nearbyPlayers.length > 0 ? worldState.nearbyPlayers.map(p => `${p.name} (${p.distance}m)`).join(', ') : 'none'}
Nearby mobs: ${worldState.nearbyMobs.length > 0 ? worldState.nearbyMobs.map(m => `${m.name} (${m.distance}m)`).join(', ') : 'none'}

${memory ? `Memory:\n${memory}\n` : ''}
[${playerName}]: ${message}

Respond with JSON:`;
}

/**
 * Build prompt for autonomous decision making
 */
export function buildAutonomousPrompt(worldState: WorldState, memory: string, recentActions: string): string {
  return `Current State:
- Position: (${worldState.bot.position.x}, ${worldState.bot.position.y}, ${worldState.bot.position.z})
- Health: ${worldState.bot.health}/20
- Food: ${worldState.bot.food}/20
- Inventory: ${worldState.inventory}
- Held: ${worldState.bot.heldItem}
- Time: ${worldState.timeOfDay}
- Weather: ${worldState.weather}

Nearby players: ${worldState.nearbyPlayers.length > 0 ? worldState.nearbyPlayers.map(p => `${p.name} (${p.distance}m)`).join(', ') : 'none'}
Nearby mobs: ${worldState.nearbyMobs.length > 0 ? worldState.nearbyMobs.map(m => `${m.name} (${m.distance}m)`).join(', ') : 'none'}

${memory ? `Memory:\n${memory}\n` : ''}
${recentActions ? `Recent actions:\n${recentActions}\n` : ''}
You are idle. What should you do next? Consider:
- Your survival (health, food, safety from mobs)
- Being helpful to nearby players
- Exploring or gathering resources if nothing else to do
- Waiting if everything is fine

Respond with JSON:`;
}
