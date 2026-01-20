# MC-Agent: AI-Powered Minecraft Bot

An AI Minecraft bot using Mineflayer and local LLM inference via llama.cpp on GPU (RTX 4060).

## Prerequisites

1. **Node.js 20+** (required for node-llama-cpp)
   ```bash
   # Install Node.js 22 using nvm
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   source ~/.bashrc
   nvm install 22
   nvm use 22
   ```

2. **Build tools** (for compiling llama.cpp with CUDA)
   ```bash
   sudo apt update
   sudo apt install -y cmake build-essential
   ```

3. **CUDA Toolkit** (for RTX 4060 GPU acceleration)
   ```bash
   # Check if CUDA is installed
   nvcc --version

   # If not, install CUDA toolkit
   sudo apt install -y nvidia-cuda-toolkit
   ```

4. **Download a GGUF model** (7B parameter recommended for 8GB VRAM)
   ```bash
   # Download Mistral-7B-Instruct (recommended)
   cd models
   wget https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf

   # Or download using huggingface-cli
   pip install huggingface-hub
   huggingface-cli download TheBloke/Mistral-7B-Instruct-v0.2-GGUF mistral-7b-instruct-v0.2.Q4_K_M.gguf --local-dir ./models
   ```

## Installation

```bash
# Clone and enter directory
cd /home/chad/mc-agent

# Use Node.js 22
nvm use 22

# Install dependencies (will build llama.cpp with CUDA)
npm install

# If node-llama-cpp build fails, rebuild with CUDA explicitly
npx node-llama-cpp download --cuda
```

## Configuration

Edit `.env` file (copied from `.env.example`):

```bash
# Minecraft Server
MC_HOST=192.168.12.77
MC_PORT=25565
MC_USER=IslandBot
MC_VERSION=1.21.10

# LLM Configuration
MODEL_PATH=./models/mistral-7b-instruct-v0.2.Q4_K_M.gguf
GPU_LAYERS=33      # Number of layers to offload to GPU (33 = all for 7B)
CONTEXT_SIZE=4096  # Context window size

# Bot Behavior
AUTONOMOUS_TICK_MS=8000  # How often bot makes autonomous decisions
LOG_LEVEL=info
```

## Usage

```bash
# Start the AI bot
npm start

# Start with file watching (auto-restart on changes)
npm run start:dev

# Test LLM inference
npm run test:llm

# Run legacy bot (non-AI version)
npm run legacy
```

## Chat Commands

**Direct commands** (bypass AI):
- `stop` - Stop all actions and autonomous behavior
- `resume` - Resume autonomous behavior
- `status` - Show bot health, position, and status
- `inventory` - List inventory items
- `help` - Show available commands

**AI understands natural language**, for example:
- "Come here" - Bot will navigate to you
- "Build a hut" - Bot will build a wooden hut nearby
- "Follow me" - Bot will follow you
- "Attack that zombie" - Bot will fight nearby hostile
- "Get some wood" - Bot will gather logs

## Project Structure

```
mc-agent/
├── config/
│   └── bot-config.js       # Centralized configuration
├── models/                  # GGUF model files (gitignored)
├── src/
│   ├── index.js            # Main entry point
│   ├── ai/
│   │   ├── llm.js          # llama.cpp wrapper
│   │   ├── prompts.js      # System prompts
│   │   ├── context.js      # World state context builder
│   │   └── decision-engine.js  # AI decision making
│   ├── bot/
│   │   ├── bot.js          # Mineflayer initialization
│   │   ├── events.js       # Event handlers
│   │   └── commands.js     # Direct command registry
│   ├── skills/
│   │   ├── navigation.js   # Movement and pathfinding
│   │   ├── building.js     # Construction
│   │   ├── inventory.js    # Chest/inventory management
│   │   ├── mining.js       # Resource gathering
│   │   └── combat.js       # Fighting
│   ├── memory/
│   │   ├── short-term.js   # Recent events buffer
│   │   └── long-term.js    # Persistent memory (JSON)
│   └── utils/
│       ├── logger.js       # Logging
│       └── world-state.js  # World observation helpers
└── app/                    # Legacy bot code (reference)
```

## Server Connection Info

- **Server:** 192.168.12.77:25565
- **RCON:** Port 25575, Password: `SuperStrongRconPass123`
  ```bash
  mcrcon -H 127.0.0.1 -P 25575 -p SuperStrongRconPass123
  ```

## Troubleshooting

### LLM fails to load
- Ensure model file exists at path in `.env`
- Check VRAM usage with `nvidia-smi`
- Try reducing `GPU_LAYERS` if VRAM is insufficient

### Bot can't connect to server
- Verify server is running and accessible
- Check `MC_VERSION` matches server version
- Ensure username isn't already in use

### Build errors with node-llama-cpp
```bash
# Clean and rebuild
rm -rf node_modules/node-llama-cpp
npm install node-llama-cpp
npx node-llama-cpp download --cuda
```
