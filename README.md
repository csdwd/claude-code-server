# Claude Code Server

> Enterprise-grade HTTP API wrapper for Claude CLI with complete features including session management, async tasks, statistics monitoring, and more

[![Node.js](https://img.shields.io/node/v/claude-code-server.svg)](https://nodejs.org/)
[![License](https://img.shields.io/npm/l/claude-code-server.svg)](LICENSE)

Claude Code Server is a full-featured HTTP API service that wraps the Anthropic Claude CLI as an easy-to-use RESTful API. It supports enterprise-level features such as multi-turn conversations, async task queues, statistics and analytics, Webhook callbacks, and comes with an intuitive TUI management tool.

## ✨ Features

### Core Features
- 🚀 **HTTP API** - Clean RESTful API interface
- 💬 **Session Management** - Automatically create and manage multi-turn conversation contexts
- ⚡ **Async Tasks** - Priority-based task queue system
- 📊 **Statistics & Analytics** - Real-time tracking of requests, costs, and resource usage
- 🔔 **Webhook Callbacks** - Automatic notifications when async tasks complete

### Advanced Features
- 🎯 **Task Priority** - Support for priority levels 1-10 scheduling
- 🔄 **Batch Processing** - Process up to 10 requests at once
- 🚦 **Rate Limiting** - Configurable API access frequency control
- 📝 **MCP Support** - Model Context Protocol configuration support
- 💾 **Multiple Storage Backends** - Switch between in-memory or Redis storage
- ⚙ **Hot Config Reload** - Update configuration without server restart
- 🖥️ **TUI Management Tool** - Visual server management and monitoring

## 📦 Installation

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** or **yarn**
- **Claude CLI** - Installed and configured

### Installation Steps

```bash
# Clone or download the project
cd claude-api-server

# Install dependencies
npm install

# Or using yarn
yarn install
```

## 🚀 Quick Start

### 1. Configuration

The configuration file is located at `~/.claude-code-server/config.json` (auto-generated on first startup):

```json
{
  "port": 3000,
  "host": "0.0.0.0",
  "claudePath": "~/.nvm/versions/node/v22.21.0/bin/claude",
  "nvmBin": "~/.nvm/versions/node/v22.21.0/bin",
  "defaultProjectPath": "~/workspace",
  "logFile": "./logs/server.log",
  "pidFile": "./logs/server.pid",
  "dataDir": "./data",
  "storageType": "memory",
  "taskQueue": {
    "concurrency": 3,
    "defaultTimeout": 300000
  },
  "webhook": {
    "enabled": false,
    "defaultUrl": null,
    "timeout": 5000,
    "retries": 3
  },
  "statistics": {
    "enabled": true,
    "collectionInterval": 60000
  },
  "rateLimit": {
    "enabled": true,
    "windowMs": 60000,
    "maxRequests": 100
  }
}
```

### 2. Start the Service

**Method 1: Using TUI (Recommended)**

```bash
npm run cli
# or
node cli.js
```

**Method 2: Command Line**

```bash
node cli.js start   # Start the service
node cli.js stop    # Stop the service
node cli.js status  # Check status
```

### 3. Verify Installation

```bash
# Health check
curl http://localhost:3000/health

# Test API
curl -X POST http://localhost:3000/api/claude \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Explain what HTTP is"}'
```

## 📚 API Documentation

### Synchronous Execution

```http
POST /api/claude
Content-Type: application/json

{
  "prompt": "Explain what HTTP is",
  "project_path": "/path/to/project",
  "model": "claude-sonnet-4-5",
  "session_id": "optional-session-id",
  "system_prompt": "You are a helpful assistant",
  "max_budget_usd": 10.0
}
```

**Response:**
```json
{
  "success": true,
  "result": "HTTP is the Hypertext Transfer Protocol...",
  "duration_ms": 1953,
  "cost_usd": 0.0975,
  "session_id": "auto-created-or-provided"
}
```

### Asynchronous Execution

```http
POST /api/claude
Content-Type: application/json

{
  "prompt": "Explain what HTTP is",
  "async": true,
  "priority": 5,
  "webhook_url": "https://your-server.com/webhook"
}
```

**Response:**
```json
{
  "success": true,
  "task_id": "uuid",
  "status": "pending",
  "priority": 5,
  "session_id": "auto-created"
}
```

### Session Management

**Create Session:**
```http
POST /api/sessions
Content-Type: application/json

{
  "project_path": "/path/to/project",
  "model": "claude-sonnet-4-5"
}
```

**Continue Conversation:**
```http
POST /api/sessions/:id/continue
Content-Type: application/json

{
  "prompt": "What's the difference between it and HTTPS?"
}
```

**List Sessions:**
```http
GET /api/sessions
```

**View Session Details:**
```http
GET /api/sessions/:id
```

**Delete Session:**
```http
DELETE /api/sessions/:id
```

### Task Management

**Create Async Task:**
```http
POST /api/tasks/async
Content-Type: application/json

{
  "prompt": "Explain what HTTP is",
  "priority": 8,
  "webhook_url": "https://your-server.com/webhook"
}
```

**View Task Status:**
```http
GET /api/tasks/:id
```

**Adjust Task Priority:**
```http
PATCH /api/tasks/:id/priority
Content-Type: application/json

{
  "priority": 10
}
```

**Cancel Task:**
```http
DELETE /api/tasks/:id
```

**View Queue Status:**
```http
GET /api/tasks/queue/status
```

### Batch Processing

```http
POST /api/claude/batch
Content-Type: application/json

{
  "prompts": [
    "Explain what is HTTP",
    "Explain what is HTTPS",
    "Explain what is TCP"
  ]
}
```

### Statistics Query

**View Statistics Summary:**
```http
GET /api/statistics/summary
```

**View Daily Statistics:**
```http
GET /api/statistics
```

## 🖥️ TUI Management Tool

Claude Code Server comes with a full-featured TUI management tool:

### Main Menu Functions

- **▶ Start Service** - Start the background server process
- **■ Stop Service** - Gracefully shutdown the server
- **● View Status** - Display running status and port
- **💬 Session Management** - List/view/delete sessions
- **📊 View Statistics** - View usage statistics summary
- **📋 Task List** - View tasks, adjust priorities
- **📋 View Logs** - Formatted log display with search
- **📖 View API Documentation** - Display API documentation
- **⚙ Configuration Settings** - Modify configuration (supports hot reload)
- **🧪 Test API** - Quick test of API endpoints

### Launch TUI

```bash
node cli.js
```

## ⚙️ Configuration Guide

### Complete Configuration Options

| Config | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | 3000 | Server port |
| `host` | string | "0.0.0.0" | Listen address |
| `claudePath` | string | - | Claude CLI executable path |
| `nvmBin` | string | - | NVM bin directory path |
| `defaultProjectPath` | string | - | Default project path |
| `logFile` | string | "./logs/server.log" | Log file path |
| `pidFile` | string | "./logs/server.pid" | PID file path |
| `dataDir` | string | "./data" | Data storage directory |
| `storageType` | string | "memory" | Storage type (memory/redis) |
| `redisUrl` | string | null | Redis connection URL |
| `sessionRetentionDays` | number | 30 | Session retention days |
| `taskQueue.concurrency` | number | 3 | Task queue concurrency |
| `taskQueue.defaultTimeout` | number | 300000 | Task timeout (milliseconds) |
| `webhook.enabled` | boolean | false | Enable Webhook |
| `webhook.defaultUrl` | string | null | Default Webhook URL |
| `webhook.timeout` | number | 5000 | Webhook timeout (milliseconds) |
| `webhook.retries` | number | 3 | Webhook retry count |
| `rateLimit.enabled` | boolean | true | Enable rate limiting |
| `rateLimit.windowMs` | number | 60000 | Time window (milliseconds) |
| `rateLimit.maxRequests` | number | 100 | Max requests per window |
| `defaultModel` | string | "claude-sonnet-4-5" | Default model |
| `maxBudgetUsd` | number | 10.0 | Maximum budget (USD) |
| `statistics.enabled` | boolean | true | Enable statistics |
| `statistics.collectionInterval` | number | 60000 | Stats collection interval (ms) |
| `mcp.enabled` | boolean | false | Enable MCP |
| `mcp.configPath` | string | null | MCP config file path |
| `logLevel` | string | "info" | Log level |

### Configuration File Location

Configuration file is automatically saved at: `~/.claude-code-server/config.json`

## 🚀 Production Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start service
pm2 start server.js --name claude-code-server

# Enable auto-start on boot
pm2 startup
pm2 save

# View logs
pm2 logs claude-code-server

# Restart service
pm2 restart claude-code-server
```

### Systemd Service

Create `/etc/systemd/system/claude-code-server.service`:

```ini
[Unit]
Description=Claude Code Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/claude-api-server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Start service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable claude-code-server
sudo systemctl start claude-code-server
```

### Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

Build and run:

```bash
# Build image
docker build -t claude-code-server .

# Run container
docker run -d \
  -p 3000:3000 \
  -v ~/.claude-code-server:/app/.claude-code-server \
  -v ~/workspace:/workspace \
  --name claude-code-server \
  claude-code-server
```

## 🔧 Troubleshooting

### Service Won't Start

```bash
# Check port occupation
lsof -i :3000

# Check logs
tail -f logs/server.log

# Check configuration
cat ~/.claude-code-server/config.json
```

### Task Stuck in Pending State

```bash
# Check queue status
curl http://localhost:3000/api/tasks/queue/status

# Check configured concurrency
cat ~/.claude-code-server/config.json | grep concurrency
```

### Duplicate Log Output

Ensure the server has restarted and loaded new code:

```bash
# Force kill all node processes
pkill -9 node

# Restart
node cli.js
```

## 📂 Project Structure

```
claude-api-server/
├── server.js                 # Main server entry
├── cli.js                    # TUI management tool
├── config.json              # Configuration file (auto-generated)
├── package.json
├── src/
│   ├── routes/              # API routes
│   │   ├── health.js
│   │   ├── config.js
│   │   ├── claude.js
│   │   ├── sessions.js      # Session management
│   │   ├── statistics.js    # Statistics query
│   │   └── tasks.js         # Task management
│   ├── services/
│   │   ├── claudeExecutor.js    # Claude executor
│   │   ├── sessionManager.js    # Session management
│   │   ├── taskQueue.js         # Task queue
│   │   ├── rateLimiter.js       # Rate limiting
│   │   ├── statisticsCollector.js  # Statistics collection
│   │   └── webhookNotifier.js   # Webhook notification
│   ├── storage/
│   │   ├── sessionStore.js       # Session storage
│   │   ├── taskStore.js          # Task storage
│   │   └── statsStore.js         # Statistics storage
│   └── utils/
│       ├── logger.js
│       └── validators.js
├── data/                     # Data directory
├── logs/                     # Logs directory
└── README.md
```

## 🔒 Security Recommendations

1. **API Authentication** - Add API keys or OAuth authentication at the reverse proxy layer
2. **CORS Configuration** - Configure Cross-Origin Resource Sharing as needed
3. **Rate Limiting** - Built-in rate limiting is enabled, adjust as needed
4. **Input Validation** - All requests are validated with Joi
5. **Budget Control** - Use `maxBudgetUsd` to prevent unexpected overspending

## 📊 Performance Metrics

- **Concurrent Tasks**: Configurable 1-10 concurrent tasks
- **Request Rate**: Default 100 requests/minute
- **Task Timeout**: Default 5 minutes, configurable
- **Session Retention**: Default 30 days auto-cleanup

## 📄 License

MIT

## 🤝 Contributing

Issues and Pull Requests are welcome!

## 📮 Contact

For questions or suggestions, please submit a GitHub Issue.
