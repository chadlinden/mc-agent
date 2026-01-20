# AI Minecraft Bot - Command Reference

This bot uses a local LLM to understand natural language. You can chat with it normally, and it will interpret your intent and take appropriate actions.

![Build Hut Example](media/build-hut-example.gif)

## Direct Commands

These keywords bypass the AI and execute immediately:

| Command | Description |
|---------|-------------|
| `stop` | Emergency stop - halts all movement and disables autonomous behavior |
| `resume` | Re-enables autonomous decision making |
| `status` | Shows health, hunger, position, and current status |
| `inventory` | Lists items in the bot's inventory |
| `help` | Shows available direct commands |

## Natural Language Examples

The bot understands context and can interpret various phrasings:

### Navigation

```
"Come here"
"Follow me"
"Go to coordinates 100, 64, -200"
"Stop following me"
"Meet me at the village"
```

### Building

```
"Build a hut"
"Build a house near me"
"Place some torches"
"Break that block"
```

### Combat

```
"Kill that zombie"
"Defend yourself"
"Attack the skeleton"
"Run away"
"Flee from danger"
```

### Resource Gathering

```
"Get some wood"
"Mine 20 stone blocks"
"Gather logs for me"
"Find iron ore"
"Collect some coal"
```

### Inventory Management

```
"Open the chest"
"Store all my items"
"Grab a diamond pickaxe from the chest"
"Equip the iron sword"
"Drop the cobblestone"
```

### Information

```
"What's in your inventory?"
"Where are you?"
"How much health do you have?"
"What time is it?"
"Are there any mobs nearby?"
```

## How the AI Works

1. **Chat Detection**: When you send a message in Minecraft chat, the bot captures it
2. **Context Building**: The bot gathers information about:
   - Its current position, health, and hunger
   - Items in its inventory
   - Nearby players and mobs
   - Time of day and weather
   - Recent conversation history
3. **LLM Processing**: All this context is sent to the local LLM along with your message
4. **Action Execution**: The LLM responds with:
   - What to say back to you
   - What action to perform (if any)
5. **Skill Execution**: The bot executes the requested skill

## Available Skills

### Navigation
- `goto` - Move to a player, entity, or coordinates
- `follow` - Continuously follow a player
- `stop` - Stop current movement

### Building
- `build_hut` - Build a 7x7 wooden hut
- `place_block` - Place a specific block
- `break_block` - Break a block at a position

### Inventory
- `open_chest` - Open a nearby chest
- `deposit` - Put items into a chest
- `withdraw` - Take items from a chest
- `equip` - Equip armor or hold an item
- `drop` - Drop items from inventory
- `close_chest` - Close the open chest

### Mining
- `mine` - Mine blocks of a specific type
- `gather_wood` - Collect wood logs from trees
- `find_ore` - Locate and go to an ore deposit

### Combat
- `attack` - Attack a specific target
- `defend` - Attack the nearest hostile mob
- `flee` - Run away from danger

## Autonomous Behavior

When idle, the bot periodically evaluates its situation and may:

- Defend itself if attacked or if hostiles are nearby
- Flee if health is critically low
- Wait patiently if everything is fine

You can control this with:
- `stop` - Disable autonomous behavior
- `resume` - Re-enable autonomous behavior

## Memory System

The bot has two types of memory:

### Short-Term Memory
- Recent chat messages
- Recent actions taken
- Recent events (damage, players joining/leaving)

### Long-Term Memory (Persistent)
- Players it has met before
- Named locations you've told it about
- Facts you've asked it to remember

Example:
```
"Remember that the farm is at 200, 70, -100"
"Save this location as 'home'"
```

## Tips for Best Results

1. **Be specific**: "Get 16 oak logs" works better than "get some wood"
2. **Use player names**: "Follow Steve" is clearer than "follow him"
3. **Give coordinates when needed**: "Go to 100, 64, -50"
4. **One task at a time**: Wait for one action to complete before giving another
5. **Use direct commands for emergencies**: `stop` works instantly

## Troubleshooting

**Bot doesn't respond:**
- Make sure you're not the bot itself (it ignores its own messages)
- Check if the LLM is still initializing (check console logs)
- The bot may be busy processing a previous command

**Bot does wrong action:**
- Try rephrasing your request more clearly
- Use more specific terminology
- Check if the bot has the required items/tools

**Bot stops moving:**
- It may have reached its destination
- Pathfinding might have failed (obstacles, water, etc.)
- Use `status` to check its current state
