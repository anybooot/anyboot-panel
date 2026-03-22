const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const archiver = require('archiver');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Configuration
const PORT = 3000;
const SERVER_FILES_DIR = path.join(__dirname, 'server-files');
const CONFIG_FILE = path.join(SERVER_FILES_DIR, 'config.json');

// Ensure server-files directory exists
if (!fs.existsSync(SERVER_FILES_DIR)) {
    fs.mkdirSync(SERVER_FILES_DIR);
}

// Default configuration
let serverConfig = {
    serverPort: 25565,
    maxRam: 2,
    minRam: 1,
    onlineMode: false,
    difficulty: 'normal',
    motd: '§bAnyboot §fMinecraft Server',
    autoRestart: true,
    viewDistance: 10,
    maxPlayers: 20,
    allowNether: true,
    allowEnd: true,
    spawnProtection: 16,
    pvp: true,
    queryPort: 25565,
    rconPort: 25575,
    enableRcon: false,
    enableQuery: false,
    maxConnections: 20,
    networkCompression: 256
};

if (fs.existsSync(CONFIG_FILE)) {
    try {
        const savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        serverConfig = { ...serverConfig, ...savedConfig };
    } catch (e) {
        console.error('Error reading config.json', e);
    }
} else {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(serverConfig, null, 2));
}

// ============= COLOR FORMATTING FUNCTION =============
function formatMinecraftColors(text) {
    if (!text) return '';
    
    // Minecraft color codes mapping to CSS colors
    const colorMap = {
        '0': '#000000', // black
        '1': '#0000AA', // dark_blue
        '2': '#00AA00', // dark_green
        '3': '#00AAAA', // dark_aqua
        '4': '#AA0000', // dark_red
        '5': '#AA00AA', // dark_purple
        '6': '#FFAA00', // gold
        '7': '#AAAAAA', // gray
        '8': '#555555', // dark_gray
        '9': '#5555FF', // blue
        'a': '#55FF55', // green
        'b': '#55FFFF', // aqua
        'c': '#FF5555', // red
        'd': '#FF55FF', // light_purple
        'e': '#FFFF55', // yellow
        'f': '#FFFFFF', // white
        'r': '#FFFFFF'  // reset
    };
    
    let formatted = text;
    
    // Handle Paper hex colors ([38;2;R;G;Bm)
    formatted = formatted.replace(/\[38;2;(\d+);(\d+);(\d+)m/g, (match, r, g, b) => {
        return `<span style="color: rgb(${r}, ${g}, ${b});">`;
    });
    
    // Handle Minecraft section sign colors (§)
    formatted = formatted.replace(/§([0-9a-fk-or])/g, (match, code) => {
        if (code === 'r') return '</span><span>';
        if (colorMap[code]) {
            return `<span style="color: ${colorMap[code]};">`;
        }
        return match;
    });
    
    // Handle ANSI reset codes
    formatted = formatted.replace(/\[0m/g, '</span>');
    formatted = formatted.replace(/\[m/g, '</span>');
    
    // Handle specific Paper color codes (for plugins list)
    formatted = formatted.replace(/\[38;2;85;85;85m/g, '<span style="color: #555555;">');
    formatted = formatted.replace(/\[38;2;85;255;85m/g, '<span style="color: #55FF55;">');
    formatted = formatted.replace(/\[38;2;237;129;6m/g, '<span style="color: #ED8106;">');
    formatted = formatted.replace(/\[38;2;52;159;218m/g, '<span style="color: #349FDA;">');
    formatted = formatted.replace(/\[38;2;255;255;255m/g, '<span style="color: #FFFFFF;">');
    
    // Handle bold (might be used)
    formatted = formatted.replace(/\[1m/g, '<strong>');
    formatted = formatted.replace(/\[22m/g, '</strong>');
    
    // Wrap in span if there are any color tags
    if (formatted.includes('<span') || formatted.includes('<strong>')) {
        formatted = '<span>' + formatted + '</span>';
    }
    
    // Clean up any remaining ANSI codes
    formatted = formatted.replace(/\[[0-9;]*m/g, '');
    
    return formatted;
}

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/files', express.static(SERVER_FILES_DIR));

// Multer configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath = SERVER_FILES_DIR;
        const targetPath = req.query.locate || req.body.currentPath || '';
        if (targetPath) {
            uploadPath = path.join(SERVER_FILES_DIR, targetPath);
        }
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

// Minecraft process variables
let minecraftProcess = null;
let serverStartTime = null;
let serverLogs = [];
let connectedPlayers = [];
let isStarting = false;
let crashCount = 0;
let lastCrashTime = null;

// Function to write server.properties
function updateServerProperties() {
    const propsPath = path.join(SERVER_FILES_DIR, 'server.properties');
    let content = `#Minecraft server properties
#${new Date().toISOString()}
server-port=${serverConfig.serverPort}
online-mode=${serverConfig.onlineMode}
difficulty=${serverConfig.difficulty}
motd=${serverConfig.motd}
view-distance=${serverConfig.viewDistance}
max-players=${serverConfig.maxPlayers}
allow-nether=${serverConfig.allowNether}
allow-end=${serverConfig.allowEnd}
spawn-protection=${serverConfig.spawnProtection}
pvp=${serverConfig.pvp}
enable-rcon=${serverConfig.enableRcon}
rcon.port=${serverConfig.rconPort}
enable-query=${serverConfig.enableQuery}
query.port=${serverConfig.queryPort}
network-compression-threshold=${serverConfig.networkCompression}
max-tick-time=60000
`;
    fs.writeFileSync(propsPath, content);
}

function addLog(type, message) {
    const logEntry = {
        id: Date.now() + Math.random(),
        type: type,
        message: message,
        formattedMessage: formatMinecraftColors(message),
        timestamp: new Date().toISOString()
    };
    serverLogs.unshift(logEntry);
    if (serverLogs.length > 1000) {
        serverLogs.pop();
    }
}

function getUptime() {
    if (!serverStartTime) return '0s';
    const diff = Math.floor((new Date() - serverStartTime) / 1000);
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function sendCommand(command) {
    if (minecraftProcess && minecraftProcess.stdin) {
        minecraftProcess.stdin.write(command + '\n');
        const formattedCommand = formatMinecraftColors(`> ${command}`);
        addLog('COMMAND', `> ${command}`);
        io.emit('console:output', { type: 'COMMAND', message: `> ${command}`, formatted: formattedCommand });
        return true;
    }
    addLog('ERROR', 'Server is not running. Command cannot be sent.');
    return false;
}

function startMinecraftServer() {
    if (minecraftProcess || isStarting) {
        addLog('SYSTEM', '[ANYBOOT CORE] Server is already running or starting...');
        return;
    }

    isStarting = true;
    addLog('SYSTEM', '[ANYBOOT CORE] Starting Minecraft server...');
    addLog('SYSTEM', `[ANYBOOT CORE] Allocated RAM: ${serverConfig.minRam}GB - ${serverConfig.maxRam}GB`);
    addLog('SYSTEM', `[ANYBOOT CORE] Server port: ${serverConfig.serverPort}`);
    
    const eulaPath = path.join(SERVER_FILES_DIR, 'eula.txt');
    if (!fs.existsSync(eulaPath)) {
        fs.writeFileSync(eulaPath, 'eula=true');
        addLog('SYSTEM', '[ANYBOOT CORE] EULA automatically accepted');
    } else {
        let eulaContent = fs.readFileSync(eulaPath, 'utf8');
        if (!eulaContent.includes('eula=true')) {
            fs.writeFileSync(eulaPath, 'eula=true');
            addLog('SYSTEM', '[ANYBOOT CORE] EULA updated to true');
        }
    }

    updateServerProperties();
    addLog('SYSTEM', '[ANYBOOT CORE] server.properties updated');

    const javaPath = 'java';
    const args = [
        `-Xms${serverConfig.minRam}G`,
        `-Xmx${serverConfig.maxRam}G`,
        '-XX:+UseG1GC',
        '-XX:+ParallelRefProcEnabled',
        '-XX:MaxGCPauseMillis=200',
        '-XX:+UnlockExperimentalVMOptions',
        '-XX:+DisableExplicitGC',
        '-XX:+AlwaysPreTouch',
        '-XX:G1NewSizePercent=30',
        '-XX:G1MaxNewSizePercent=40',
        '-XX:G1HeapRegionSize=8M',
        '-XX:G1ReservePercent=20',
        '-XX:G1HeapWastePercent=5',
        '-XX:G1MixedGCCountTarget=4',
        '-XX:InitiatingHeapOccupancyPercent=15',
        '-XX:G1MixedGCLiveThresholdPercent=90',
        '-XX:G1RSetUpdatingPauseTimePercent=5',
        '-XX:SurvivorRatio=32',
        '-XX:+PerfDisableSharedMem',
        '-XX:MaxTenuringThreshold=1',
        '-Dusing.aikars.flags=https://mcflags.emc.gs',
        '-Daikars.new.flags=true',
        '-jar', 'paper.jar',
        'nogui'
    ];

    console.log(`Starting server with ${serverConfig.maxRam}GB RAM on port ${serverConfig.serverPort}`);
    
    minecraftProcess = spawn(javaPath, args, { cwd: SERVER_FILES_DIR });
    serverStartTime = new Date();

    minecraftProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`[MINECRAFT] ${output}`);
        
        const formattedOutput = formatMinecraftColors(output);
        
        if (output.includes('Done') && output.includes('For help')) {
            isStarting = false;
            crashCount = 0;
            addLog('SUCCESS', '[ANYBOOT CORE] Server started successfully!');
            addLog('SUCCESS', `[ANYBOOT CORE] Server is now ONLINE on port ${serverConfig.serverPort}`);
            io.emit('server:status', { status: 'online', uptime: getUptime() });
        }
        
        if (output.includes('Starting minecraft server')) {
            addLog('SYSTEM', '[ANYBOOT CORE] Loading Minecraft server...');
        }
        
        if (output.includes('Loading libraries')) {
            addLog('SYSTEM', '[ANYBOOT CORE] Loading libraries...');
        }
        
        if (output.includes('Preparing level')) {
            addLog('SYSTEM', '[ANYBOOT CORE] Preparing world...');
        }
        
        if (output.includes('joined the game')) {
            const match = output.match(/([a-zA-Z0-9_]+) joined the game/);
            if (match && !connectedPlayers.includes(match[1])) {
                connectedPlayers.push(match[1]);
                io.emit('server:players', connectedPlayers);
                addLog('MINECRAFT', `[ANYBOOT CORE] Player ${match[1]} joined the server`);
            }
        }
        
        if (output.includes('left the game')) {
            const match = output.match(/([a-zA-Z0-9_]+) left the game/);
            if (match) {
                connectedPlayers = connectedPlayers.filter(p => p !== match[1]);
                io.emit('server:players', connectedPlayers);
                addLog('MINECRAFT', `[ANYBOOT CORE] Player ${match[1]} left the server`);
            }
        }
        
        if (output.includes('There are')) {
            const match = output.match(/There are (\d+) of a max of/);
            if (match) {
                const count = parseInt(match[1]);
                io.emit('server:playercount', count);
            }
        }
        
        addLog('MINECRAFT', output);
        io.emit('console:output', { type: 'MINECRAFT', message: output, formatted: formattedOutput });
    });

    minecraftProcess.stderr.on('data', (data) => {
        const error = data.toString();
        console.error(`[ERROR] ${error}`);
        const formattedError = formatMinecraftColors(error);
        addLog('ERROR', error);
        io.emit('console:output', { type: 'ERROR', message: error, formatted: formattedError });
    });

    minecraftProcess.on('close', (code) => {
        console.log(`Process closed with code: ${code}`);
        minecraftProcess = null;
        serverStartTime = null;
        isStarting = false;
        connectedPlayers = [];
        
        io.emit('server:status', { status: 'offline' });
        io.emit('server:players', []);
        
        if (code !== 0 && code !== null) {
            crashCount++;
            lastCrashTime = new Date();
            addLog('ERROR', `[ANYBOOT CORE] Server stopped unexpectedly (code ${code})`);
            
            if (serverConfig.autoRestart && crashCount < 3) {
                addLog('SYSTEM', `[ANYBOOT CORE] Auto-restarting in 10 seconds... (attempt ${crashCount}/3)`);
                setTimeout(() => startMinecraftServer(), 10000);
            } else if (crashCount >= 3) {
                addLog('ERROR', '[ANYBOOT CORE] Too many automatic restarts. Server remains stopped.');
            }
        } else {
            addLog('SYSTEM', '[ANYBOOT CORE] Server stopped successfully');
        }
    });
}

function stopMinecraftServer() {
    if (!minecraftProcess) {
        addLog('SYSTEM', '[ANYBOOT CORE] Server is already stopped');
        return;
    }
    addLog('SYSTEM', '[ANYBOOT CORE] Stopping server...');
    sendCommand('save-all');
    setTimeout(() => {
        if (minecraftProcess) {
            sendCommand('stop');
            setTimeout(() => {
                if (minecraftProcess) {
                    minecraftProcess.kill();
                }
            }, 5000);
        }
    }, 2000);
}

function killMinecraftServer() {
    if (minecraftProcess) {
        addLog('SYSTEM', '[ANYBOOT CORE] Force stopping server!');
        minecraftProcess.kill('SIGKILL');
        minecraftProcess = null;
        serverStartTime = null;
        isStarting = false;
        addLog('SYSTEM', '[ANYBOOT CORE] Server was forcefully terminated');
    } else {
        addLog('SYSTEM', '[ANYBOOT CORE] Server is not running');
    }
}

function restartMinecraftServer() {
    addLog('SYSTEM', '[ANYBOOT CORE] Restarting server...');
    if (minecraftProcess) {
        sendCommand('save-all');
        setTimeout(() => {
            if (minecraftProcess) {
                sendCommand('stop');
                setTimeout(() => startMinecraftServer(), 5000);
            }
        }, 2000);
    } else {
        startMinecraftServer();
    }
}

// ============= API ENDPOINTS =============

app.get('/api/status', (req, res) => {
    let status = 'offline';
    if (minecraftProcess) status = 'online';
    if (isStarting) status = 'starting';
    
    res.json({
        running: minecraftProcess !== null,
        starting: isStarting,
        status: status,
        uptime: getUptime(),
        players: connectedPlayers.length,
        maxPlayers: serverConfig.maxPlayers,
        config: serverConfig,
        crashCount: crashCount,
        lastCrash: lastCrashTime
    });
});

app.post('/api/start', (req, res) => {
    startMinecraftServer();
    res.json({ success: true });
});

app.post('/api/stop', (req, res) => {
    stopMinecraftServer();
    res.json({ success: true });
});

app.post('/api/restart', (req, res) => {
    restartMinecraftServer();
    res.json({ success: true });
});

app.post('/api/kill', (req, res) => {
    killMinecraftServer();
    res.json({ success: true });
});

app.post('/api/command', (req, res) => {
    const { command } = req.body;
    if (command) {
        const sent = sendCommand(command);
        res.json({ success: sent });
    } else {
        res.json({ success: false });
    }
});

app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(serverLogs.slice(0, limit));
});

app.get('/api/files/*', (req, res) => {
    let filePath = req.params[0] || '';
    let fullPath = path.join(SERVER_FILES_DIR, filePath);
    
    if (!fullPath.startsWith(SERVER_FILES_DIR)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'Path does not exist' });
    }
    
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
        const items = fs.readdirSync(fullPath).map(item => {
            const itemPath = path.join(fullPath, item);
            const itemStats = fs.statSync(itemPath);
            return {
                name: item,
                path: path.join(filePath, item).replace(/\\/g, '/'),
                isDirectory: itemStats.isDirectory(),
                size: itemStats.isDirectory() ? 0 : itemStats.size,
                modified: itemStats.mtime
            };
        });
        items.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });
        res.json({ currentPath: filePath, items });
    } else {
        const content = fs.readFileSync(fullPath, 'utf8');
        res.json({ type: 'file', path: filePath, content: content, size: stats.size });
    }
});

app.get('/api/file-content/*', (req, res) => {
    let filePath = req.params[0];
    let fullPath = path.join(SERVER_FILES_DIR, filePath);
    
    if (!fullPath.startsWith(SERVER_FILES_DIR)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const content = fs.readFileSync(fullPath, 'utf8');
        res.json({ content, path: filePath });
    } else {
        res.status(404).json({ error: 'File does not exist' });
    }
});

app.post('/api/save-file', (req, res) => {
    const { filePath, content } = req.body;
    const fullPath = path.join(SERVER_FILES_DIR, filePath);
    
    if (!fullPath.startsWith(SERVER_FILES_DIR)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    try {
        fs.writeFileSync(fullPath, content, 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Error saving file' });
    }
});

app.post('/api/delete', (req, res) => {
    const { path: itemPath } = req.body;
    const fullPath = path.join(SERVER_FILES_DIR, itemPath);
    
    if (!fullPath.startsWith(SERVER_FILES_DIR)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    try {
        if (fs.statSync(fullPath).isDirectory()) {
            fs.rmSync(fullPath, { recursive: true });
        } else {
            fs.unlinkSync(fullPath);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Error deleting item' });
    }
});

app.post('/api/create-folder', (req, res) => {
    const { currentPath, folderName } = req.body;
    const fullPath = path.join(SERVER_FILES_DIR, currentPath, folderName);
    
    if (!fullPath.startsWith(SERVER_FILES_DIR)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    try {
        fs.mkdirSync(fullPath, { recursive: true });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Error creating folder' });
    }
});

app.post('/api/upload', upload.array('files'), (req, res) => {
    const targetPath = req.query.locate || '';
    res.json({ success: true, files: req.files.length, path: targetPath });
});

app.get('/api/download/*', (req, res) => {
    let filePath = req.params[0];
    let fullPath = path.join(SERVER_FILES_DIR, filePath);
    
    if (!fullPath.startsWith(SERVER_FILES_DIR)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    if (fs.existsSync(fullPath)) {
        res.download(fullPath);
    } else {
        res.status(404).json({ error: 'File does not exist' });
    }
});

app.post('/api/settings', (req, res) => {
    serverConfig = { ...serverConfig, ...req.body };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(serverConfig, null, 2));
    updateServerProperties();
    res.json({ success: true });
});

app.get('/api/ip', async (req, res) => {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        res.json({ ip: data.ip });
    } catch (e) {
        res.json({ ip: 'Unknown' });
    }
});

// Socket.IO
io.on('connection', (socket) => {
    console.log('Client connected');
    
    let status = 'offline';
    if (minecraftProcess) status = 'online';
    if (isStarting) status = 'starting';
    
    socket.emit('server:status', { 
        status: status,
        running: minecraftProcess !== null,
        starting: isStarting,
        uptime: getUptime() 
    });
    socket.emit('server:players', connectedPlayers);
    socket.emit('server:playercount', connectedPlayers.length);
    
    socket.on('command', (data) => {
        sendCommand(data.command);
    });
    
    socket.on('get:logs', () => {
        socket.emit('console:history', serverLogs.slice(0, 100));
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Serve index.html for all routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start web server
server.listen(PORT, () => {
    console.log(`\n╔════════════════════════════════════╗`);
    console.log(`║      ANYBOOT PANEL - SERVER       ║`);
    console.log(`║    http://localhost:${PORT}        ║`);
    console.log(`╚════════════════════════════════════╝\n`);
});