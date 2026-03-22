# 🚀 Anyboot Panel - Minecraft Server Manager

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0-green.svg)](https://nodejs.org/)
[![Socket.IO](https://img.shields.io/badge/socket.io-live-orange.svg)](https://socket.io/)

A modern, glassmorphism-styled Minecraft server management panel with real-time console, file manager, and complete server configuration.

![Anyboot Panel Screenshot](https://i.ibb.co/Wpg0SGhm/image.png)

## ✨ Features

### 📊 Dashboard
- Real-time statistics: RAM, Port, IP, Uptime, Players
- Recent activity feed
- Performance metrics and crash tracking

### 🖥️ Interactive Console
- Live server output with full Minecraft color support (`§a`, `§c`, Paper hex codes)
- Command suggestions and quick actions
- Clear and copy functionality
- "ANYBOOT CORE" prefix for system messages

### 📁 File Manager
- Hierarchical folder navigation
- Fullscreen code editor with syntax highlighting (YAML, JSON, Properties)
- Multi-file upload with drag & drop to current folder
- URL routing (`?locate=path`) for persistent navigation
- Edit, delete, download, and copy path operations

### ⚙️ Server Settings
- RAM allocation (min/max)
- Max players, view distance, difficulty
- Online mode (premium/cracked)
- PvP, Nether, End toggles
- Auto-restart on crash
- Custom MOTD with color codes

### 🌐 Network Configuration
- Server port (Minecraft)
- Query and RCON ports
- Enable/disable RCON and Query
- Network compression settings

### 🔗 URL Routing
- Shareable links for any page or file
- Browser back/forward button support
- Refresh preserves current location

## 📋 Requirements

- **Node.js** 16.x or higher
- **Java** 17+ (for Minecraft server)
- **RAM** Minimum 2GB (4GB+ recommended)
- **Ports** 3000 (panel), 25565 (Minecraft, configurable)

## 🚀 Quick Start

```bash
# Clone the repository
Download from https://anyboot.ct.ws/res/preview.php?id=69c02a08b8029

# Install dependencies
npm install

# Start the server
npm start
