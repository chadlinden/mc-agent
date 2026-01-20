// test-bot.js
// IslandBot: follow + build hut + load inventory from a spawn chest.
//
// Server: 192.168.12.77
// Island spawn: 387 79 80

const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')

const SERVER = {
  host: '192.168.12.77',
  port: 25565,
  username: 'IslandBot',
  version: '1.21.8'
}

const ISLAND_SPAWN = new Vec3(390, 79, 84)
const MAX_DISTANCE_TO_CHEST = 20;

// Edit this to match what you want the bot to carry.
// Counts are “target amounts”. Bot will withdraw up to that amount if available.
const LOADOUT = [
  { name: 'diamond_pickaxe', count: 1 },
  { name: 'diamond_axe', count: 1 },
  { name: 'diamond_sword', count: 1 },
  { name: 'diamond_shovel', count: 1 },

  { name: 'diamond_helmet', count: 1 },
  { name: 'diamond_chestplate', count: 1 },
  { name: 'diamond_leggings', count: 1 },
  { name: 'diamond_boots', count: 1 },

  { name: 'cooked_chicken', count: 64 },
  { name: 'torch', count: 32 },
  { name: 'oak_planks', count: 128 },
  { name: 'oak_log', count: 32 },
  { name: 'crafting_table', count: 1 },
]

const bot = mineflayer.createBot(SERVER)
bot.loadPlugin(pathfinder)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function invCount(itemName) {
  return bot.inventory.items().filter(i => i.name === itemName).reduce((s, i) => s + i.count, 0)
}

async function equipItem(name) {
  const item = bot.inventory.items().find(i => i.name === name)
  if (!item) return false
  await bot.equip(item, 'hand')
  return true
}

async function equipArmorIfPresent() {
  const slots = [
    { item: 'diamond_helmet', dest: 'head' },
    { item: 'diamond_chestplate', dest: 'torso' },
    { item: 'diamond_leggings', dest: 'legs' },
    { item: 'diamond_boots', dest: 'feet' },
  ]

  for (const s of slots) {
    const it = bot.inventory.items().find(i => i.name === s.item)
    if (!it) continue
    try { await bot.equip(it, s.dest) } catch {}
  }
}

async function waitForWorld(ms = 1500) {
  // Give the client time to receive chunks/entities after spawn/teleport
  await sleep(ms)
}

function isChestBlock(b, mcData) {
  if (!b) return false
  const chestId = mcData.blocksByName.chest?.id
  const trappedId = mcData.blocksByName.trapped_chest?.id
  return b.type === chestId || b.type === trappedId
}

async function findChestNearBot(maxDistance = 20) {
  const mcData = require('minecraft-data')(bot.version)

  // Fast path: built-in search (only in loaded chunks)
  const found = bot.findBlock({
    matching: b => isChestBlock(b, mcData),
    maxDistance,
    count: 1
  })

  if (found) return found

  // Fallback: brute scan cube around bot position (still only works in loaded chunks,
  // but tends to be more reliable immediately after spawn)
  const base = bot.entity.position.floored()
  let best = null
  let bestDist = Infinity

  for (let dx = -maxDistance; dx <= maxDistance; dx++) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dz = -maxDistance; dz <= maxDistance; dz++) {
        const p = base.offset(dx, dy, dz)
        const b = bot.blockAt(p)
        if (!isChestBlock(b, mcData)) continue
        const d = base.distanceTo(p)
        if (d < bestDist) {
          bestDist = d
          best = b
        }
      }
    }
  }

  return best
}

async function openNearestChestAtSpawn() {
  await waitForWorld(2000)

  const pos = bot.entity.position.floored()
  bot.chat(`Scanning for chest near me at ${pos.x} ${pos.y} ${pos.z}...`)

  const chestBlock = await findChestNearBot(20)
  if (!chestBlock) throw new Error('No chest found near bot (chunks may not be loaded).')

  bot.chat(`Found chest at ${chestBlock.position.x} ${chestBlock.position.y} ${chestBlock.position.z}`)

  // Ensure we're close enough to open it
  await bot.pathfinder.goto(new goals.GoalNear(
    chestBlock.position.x,
    chestBlock.position.y,
    chestBlock.position.z,
    2
  ))

  return await bot.openChest(chestBlock)
}


async function withdrawLoadout(chest) {
  const mcData = require('minecraft-data')(bot.version)

  for (const want of LOADOUT) {
    const already = invCount(want.name)
    const needed = Math.max(0, want.count - already)
    if (needed === 0) continue

    const itemDef = mcData.itemsByName[want.name]
    if (!itemDef) {
      bot.chat(`Unknown item in LOADOUT: ${want.name}`)
      continue
    }

    // Withdraw in chunks; chest.withdraw handles stack sizes but we loop for reliability.
    let remaining = needed
    while (remaining > 0) {
      const take = Math.min(remaining, 64)
      try {
        await chest.withdraw(itemDef.id, null, take)
        remaining -= take
        await sleep(80)
      } catch (e) {
        // Usually means chest doesn't have it, or inventory full.
        break
      }
    }
  }
}

async function depositAll(chest) {
  // Deposits all items from bot inventory into chest (useful for reset).
  const items = bot.inventory.items()
  for (const it of items) {
    try {
      await chest.deposit(it.type, null, it.count)
      await sleep(80)
    } catch {}
  }
}

async function loadoutFromSpawnChest() {
  bot.chat('Loading loadout from spawn chest...')
  const chest = await openNearestChestAtSpawn()

  try {
    await withdrawLoadout(chest)
    await equipArmorIfPresent()
    await equipItem('diamond_pickaxe') || await equipItem('iron_pickaxe') || await equipItem('stone_pickaxe')
    bot.chat('Loadout complete.')
  } finally {
    try { chest.close() } catch {}
  }
}

// ---- Your existing build helpers (unchanged except host) ----

async function placeAt(targetPos) {
  const cur = bot.blockAt(targetPos)
  if (cur && cur.name !== 'air') return true

  const offsets = [
    new Vec3(0, -1, 0),
    new Vec3(1, 0, 0),
    new Vec3(-1, 0, 0),
    new Vec3(0, 0, 1),
    new Vec3(0, 0, -1),
    new Vec3(0, 1, 0),
  ]

  for (const off of offsets) {
    const refPos = targetPos.plus(off)
    const refBlock = bot.blockAt(refPos)
    if (refBlock && refBlock.name !== 'air') {
      await bot.pathfinder.goto(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 2))
      await bot.placeBlock(refBlock, off.scaled(-1))
      return true
    }
  }
  return false
}

async function digIfNeeded(pos) {
  const b = bot.blockAt(pos)
  if (b && b.name !== 'air') {
    await bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 2))
    await bot.dig(b)
  }
}

async function findGround(pos, maxDrop = 12) {
  let p = pos.floored()
  for (let i = 0; i < maxDrop; i++) {
    const below = bot.blockAt(p.offset(0, -1, 0))
    if (below && below.name !== 'air') return p
    p = p.offset(0, -1, 0)
  }
  return pos.floored()
}

function hutPlan(origin) {
  const blocks = []
  const w = 7
  const wallH = 3
  const x0 = origin.x, y0 = origin.y, z0 = origin.z

  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < w; dz++) {
      blocks.push({ pos: new Vec3(x0 + dx, y0, z0 + dz), type: 'oak_planks' })
    }
  }

  for (let dy = 1; dy <= wallH; dy++) {
    for (let i = 0; i < w; i++) {
      blocks.push({ pos: new Vec3(x0 + i, y0 + dy, z0), type: 'oak_planks' })
      blocks.push({ pos: new Vec3(x0 + i, y0 + dy, z0 + (w - 1)), type: 'oak_planks' })
      blocks.push({ pos: new Vec3(x0, y0 + dy, z0 + i), type: 'oak_planks' })
      blocks.push({ pos: new Vec3(x0 + (w - 1), y0 + dy, z0 + i), type: 'oak_planks' })
    }
  }

  const doorX = x0 + Math.floor(w / 2)
  blocks.push({ pos: new Vec3(doorX, y0 + 1, z0), type: 'air' })
  blocks.push({ pos: new Vec3(doorX, y0 + 2, z0), type: 'air' })

  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < w; dz++) {
      blocks.push({ pos: new Vec3(x0 + dx, y0 + wallH + 1, z0 + dz), type: 'oak_planks' })
    }
  }

  blocks.push({ pos: new Vec3(x0 + 2, y0 + 2, z0 + 2), type: 'torch' })
  return blocks
}

async function buildFromPlan(plan, originY) {
  const floor = plan.filter(p => p.pos.y === originY && p.type !== 'air')
  const walls = plan.filter(p => p.pos.y > originY && p.pos.y <= originY + 3)
  const roof = plan.filter(p => p.pos.y === originY + 4)
  const rest = plan.filter(p => !floor.includes(p) && !walls.includes(p) && !roof.includes(p))
  const stages = [floor, walls, roof, rest]

  for (const stage of stages) {
    for (const step of stage) {
      if (step.type === 'air') {
        await digIfNeeded(step.pos)
        continue
      }

      const itemName = step.type === 'torch' ? 'torch' : step.type
      const ok = await equipItem(itemName)
      if (!ok) {
        if (step.type === 'torch') continue
        throw new Error(`Missing ${itemName}`)
      }

      const cur = bot.blockAt(step.pos)
      if (cur && cur.name === step.type) continue

      if (cur && cur.name !== 'air' && cur.name !== step.type) {
        await digIfNeeded(step.pos)
      }

      try {
        await placeAt(step.pos)
      } catch {
        await sleep(150)
        await placeAt(step.pos)
      }
      await sleep(60)
    }
  }
}

async function buildHutAt(origin) {
  const originGround = await findGround(origin)
  const o = new Vec3(Math.floor(originGround.x), originGround.y, Math.floor(originGround.z))
  bot.chat(`Building hut at ${o.x} ${o.y} ${o.z}`)
  const plan = hutPlan(o)
  await buildFromPlan(plan, o.y)
  bot.chat('Hut done.')
}

// ---- Lifecycle / Commands ----

bot.once('spawn', async () => {
  const mcData = require('minecraft-data')(bot.version)
  bot.pathfinder.setMovements(new Movements(bot, mcData))

  bot.chat('Online. Commands: loadout | stash | come | hut | hutspawn')

  // Auto-loadout on spawn:
  try {
    await loadoutFromSpawnChest()
  } catch (e) {
    bot.chat(`Loadout failed: ${e.message}`)
    console.error(e)
  }
})

bot.on('chat', async (username, message) => {
  if (username === bot.username) return
  const m = message.toLowerCase().trim()

  if (m === 'loadout') {
    try { await loadoutFromSpawnChest() }
    catch (e) { bot.chat(`Loadout failed: ${e.message}`); console.error(e) }
    return
  }

  if (m === 'stash') {
    try {
      bot.chat('Stashing inventory into spawn chest...')
      const chest = await openNearestChestAtSpawn()
      try { await depositAll(chest) } finally { try { chest.close() } catch {} }
      bot.chat('Stash complete.')
    } catch (e) {
      bot.chat(`Stash failed: ${e.message}`)
      console.error(e)
    }
    return
  }

  if (m === 'come') {
    const p = bot.players[username]?.entity
    if (!p) return bot.chat("I can't see you.")
    bot.chat('On my way.')
    bot.pathfinder.setGoal(new goals.GoalFollow(p, 2), true)
    return
  }

  if (m === 'hut') {
    bot.pathfinder.setGoal(null)
    const p = bot.players[username]?.entity
    if (!p) return bot.chat("I can't see you.")
    const ground = await findGround(p.position.offset(5, 0, 0))
    const origin = new Vec3(Math.floor(ground.x), ground.y, Math.floor(ground.z))
    try { await buildHutAt(origin) }
    catch (e) { bot.chat(`Build failed: ${e.message}`); console.error(e) }
    return
  }

  if (m === 'hutspawn') {
    bot.pathfinder.setGoal(null)
    try { await buildHutAt(ISLAND_SPAWN) }
    catch (e) { bot.chat(`Build failed: ${e.message}`); console.error(e) }
  }
})

bot.on('error', console.log)
bot.on('kicked', console.log)
