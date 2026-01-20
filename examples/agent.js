// agent.js
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')

const CONFIG = {
  host: process.env.MC_HOST || '127.0.0.1',
  port: Number(process.env.MC_PORT || 25565),
  username: process.env.MC_USER || 'IslandBot',
  // If you run online-mode with Microsoft auth, Mineflayer won't do MS auth directly.
  // Easiest path is: create a separate Java account and run in offline-mode, or use a bridge/proxy approach.
  // Start in offline-mode LAN-style first so you can iterate.
  version: process.env.MC_VERSION || '1.21.10',
}

// Simple 7x7 hut blueprint:
// floor: 7x7, walls: 3 high, door on one side, torch inside, flat roof.
function hutBlueprint(origin) {
  const blocks = []
  const w = 7, h = 3
  const floorY = origin.y
  const x0 = origin.x, z0 = origin.z

  // Floor
  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < w; dz++) {
      blocks.push({ pos: new Vec3(x0 + dx, floorY, z0 + dz), type: 'oak_planks' })
    }
  }

  // Walls
  for (let dy = 1; dy <= h; dy++) {
    for (let i = 0; i < w; i++) {
      blocks.push({ pos: new Vec3(x0 + i, floorY + dy, z0), type: 'oak_planks' })
      blocks.push({ pos: new Vec3(x0 + i, floorY + dy, z0 + (w - 1)), type: 'oak_planks' })
      blocks.push({ pos: new Vec3(x0, floorY + dy, z0 + i), type: 'oak_planks' })
      blocks.push({ pos: new Vec3(x0 + (w - 1), floorY + dy, z0 + i), type: 'oak_planks' })
    }
  }

  // Door opening (front center)
  const doorX = x0 + Math.floor(w / 2)
  blocks.push({ pos: new Vec3(doorX, floorY + 1, z0), type: 'air' })
  blocks.push({ pos: new Vec3(doorX, floorY + 2, z0), type: 'air' })

  // Roof (flat)
  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < w; dz++) {
      blocks.push({ pos: new Vec3(x0 + dx, floorY + h + 1, z0 + dz), type: 'oak_planks' })
    }
  }

  // One torch inside (won't place if no torch in inv)
  blocks.push({ pos: new Vec3(x0 + 2, floorY + 2, z0 + 2), type: 'torch' })

  return blocks
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function equipBestBlock(bot, name) {
  const item = bot.inventory.items().find(i => i.name === name)
  if (!item) return false
  await bot.equip(item, 'hand')
  return true
}

async function placeBlockAt(bot, targetPos, blockName) {
  // place requires a reference block adjacent to target
  const offsets = [
    new Vec3(1,0,0), new Vec3(-1,0,0),
    new Vec3(0,0,1), new Vec3(0,0,-1),
    new Vec3(0,1,0), new Vec3(0,-1,0),
  ]

  // If we're placing air, try to break whatever is there.
  if (blockName === 'air') {
    const b = bot.blockAt(targetPos)
    if (b && b.name !== 'air') {
      await bot.dig(b)
    }
    return
  }

  // Ensure we have the block equipped
  const ok = await equipBestBlock(bot, blockName)
  if (!ok) throw new Error(`Missing required block: ${blockName}`)

  // Find a neighbor block to click against
  for (const off of offsets) {
    const refPos = targetPos.plus(off)
    const refBlock = bot.blockAt(refPos)
    if (refBlock && refBlock.name !== 'air') {
      // Move close enough
      await bot.pathfinder.goto(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 2))
      try {
        await bot.placeBlock(refBlock, off.scaled(-1))
      } catch (e) {
        // ignore occasional placement quirks and retry later
      }
      return
    }
  }

  // If no reference block exists, we can't place yet (blueprint should ensure floor first)
  throw new Error(`No reference block near ${targetPos}`)
}

async function gatherWood(bot, countLogs = 16) {
  const logs = () => bot.inventory.items().filter(i => i.name.endsWith('_log')).reduce((s,i)=>s+i.count,0)

  while (logs() < countLogs) {
    const block = bot.findBlock({
      matching: b => b && b.name.endsWith('_log'),
      maxDistance: 48,
      count: 1
    })?.[0]
    if (!block) throw new Error('No logs found nearby')

    await bot.pathfinder.goto(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 1))
    await bot.dig(block)
    await sleep(100)
  }
}

async function craftPlanks(bot) {
  // crude: convert any logs to planks via crafting table-less recipe
  // Mineflayer crafting APIs exist; keeping MVP super simple: just ensure we have planks by hand via /give on test worlds.
  // You can swap this for proper crafting once you're connected reliably.
}

async function chooseBuildSite(bot) {
  // pick a spot a few blocks away from current position, snap to ints, use ground Y
  const base = bot.entity.position.floored()
  // try to find solid ground underfoot
  let y = base.y
  for (let i = 0; i < 6; i++) {
    const b = bot.blockAt(new Vec3(base.x, y - 1, base.z))
    if (b && b.name !== 'air') break
    y--
  }
  return new Vec3(base.x + 6, y, base.z + 6)
}

async function buildHut(bot, origin) {
  const plan = hutBlueprint(origin)

  // Build in a sensible order: floor first, then walls, then roof, then interior.
  const floor = plan.filter(p => p.pos.y === origin.y && p.type !== 'air')
  const walls = plan.filter(p => p.pos.y > origin.y && p.pos.y <= origin.y + 3)
  const roof = plan.filter(p => p.pos.y === origin.y + 4)
  const rest = plan.filter(p => !floor.includes(p) && !walls.includes(p) && !roof.includes(p))

  const stages = [floor, walls, roof, rest]

  for (const stage of stages) {
    for (const step of stage) {
      const current = bot.blockAt(step.pos)
      if (step.type === 'air') {
        if (current && current.name !== 'air') await bot.dig(current)
        continue
      }
      if (current && current.name === step.type) continue
      await placeBlockAt(bot, step.pos, step.type)
      await sleep(50)
    }
  }
}

async function main() {
  const bot = mineflayer.createBot(CONFIG)
  bot.loadPlugin(pathfinder)

  bot.once('spawn', async () => {
    const mcData = require('minecraft-data')(bot.version)
    const movements = new Movements(bot, mcData)
    bot.pathfinder.setMovements(movements)

    bot.chat('Booting up. Objective: build hut.')

    try {
      await gatherWood(bot, 16)

      // For true survival MVP, you’ll add crafting here.
      // To keep this “minimum viable,” give the bot planks once to prove the build loop works.
      // (Then replace /give with real crafting.)
      const origin = await chooseBuildSite(bot)
      bot.chat(`Build site: ${origin.x} ${origin.y} ${origin.z}`)
      await buildHut(bot, origin)
      bot.chat('Hut complete.')
    } catch (e) {
      bot.chat(`Failed: ${e.message}`)
      console.error(e)
    }
  })

  bot.on('kicked', console.log)
  bot.on('error', console.log)
}

main()
