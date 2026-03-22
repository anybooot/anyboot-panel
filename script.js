// Socket.IO
const socket = io();

// DOM Elements
const pages = document.querySelectorAll('.page');
const navLinks = document.querySelectorAll('.nav-link');
const pageTitle = document.getElementById('pageTitle');
const quickStart = document.getElementById('quickStart');
const quickStop = document.getElementById('quickStop');
const quickRestart = document.getElementById('quickRestart');
const quickKill = document.getElementById('quickKill');
const serverBadge = document.getElementById('serverBadge');

// Dashboard elements
const statRam = document.getElementById('statRam');
const statPort = document.getElementById('statPort');
const statIp = document.getElementById('statIp');
const statUptime = document.getElementById('statUptime');
const statPlayers = document.getElementById('statPlayers');
const maxPlayersSpan = document.getElementById('maxPlayers');
const statStability = document.getElementById('statStability');
const activityList = document.getElementById('activityList');
const perfUptime = document.getElementById('perfUptime');
const perfLastCrash = document.getElementById('perfLastCrash');
const perfCrashCount = document.getElementById('perfCrashCount');

// Console elements
const consoleOutput = document.getElementById('consoleOutput');
const consoleInput = document.getElementById('consoleInput');
const sendCommandBtn = document.getElementById('sendCommand');
const clearConsoleBtn = document.getElementById('clearConsole');
const copyConsoleBtn = document.getElementById('copyConsole');
const suggestions = document.querySelectorAll('.suggestion');

// File manager elements
const breadcrumb = document.getElementById('breadcrumb');
const filesList = document.getElementById('filesList');
const refreshFilesBtn = document.getElementById('refreshFiles');
const uploadBtn = document.getElementById('uploadBtn');
const newFolderBtn = document.getElementById('newFolderBtn');

// Settings elements
const settingMaxRam = document.getElementById('settingMaxRam');
const settingMinRam = document.getElementById('settingMinRam');
const settingMaxPlayers = document.getElementById('settingMaxPlayers');
const settingViewDistance = document.getElementById('settingViewDistance');
const settingDifficulty = document.getElementById('settingDifficulty');
const settingOnlineMode = document.getElementById('settingOnlineMode');
const settingPvp = document.getElementById('settingPvp');
const settingAllowNether = document.getElementById('settingAllowNether');
const settingAllowEnd = document.getElementById('settingAllowEnd');
const settingAutoRestart = document.getElementById('settingAutoRestart');
const settingSpawnProtection = document.getElementById('settingSpawnProtection');
const settingMotd = document.getElementById('settingMotd');
const saveSettingsBtn = document.getElementById('saveSettings');

// Network elements
const networkServerPort = document.getElementById('networkServerPort');
const networkQueryPort = document.getElementById('networkQueryPort');
const networkRconPort = document.getElementById('networkRconPort');
const networkEnableRcon = document.getElementById('networkEnableRcon');
const networkEnableQuery = document.getElementById('networkEnableQuery');
const networkMaxConnections = document.getElementById('networkMaxConnections');
const networkCompression = document.getElementById('networkCompression');
const saveNetworkBtn = document.getElementById('saveNetworkSettings');

// Modal elements
const editorModal = document.getElementById('editorModal');
const folderModal = document.getElementById('folderModal');
const editorTextarea = document.getElementById('editorTextarea');
const saveEditBtn = document.getElementById('saveEdit');
const cancelEditBtn = document.getElementById('cancelEdit');
const createFolderBtn = document.getElementById('createFolder');
const cancelFolderBtn = document.getElementById('cancelFolder');
const folderNameInput = document.getElementById('folderName');
const editingFileName = document.getElementById('editingFileName');

// Global variables
let currentPath = '';
let currentEditPath = '';
let editor = null;
let serverRunning = false;
let serverStarting = false;
let serverConfig = {};
let serverLogs = [];
let playersCount = 0;

// ========== URL Routing ==========
function updateURL(page, params = {}) {
    let url = `/?page=${page}`;
    if (params.locate) {
        url += `&locate=${encodeURIComponent(params.locate)}`;
    }
    if (params.editing) {
        url += `&editing=${encodeURIComponent(params.editing)}`;
    }
    window.history.pushState({ page, params }, '', url);
}

function parseURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const page = urlParams.get('page') || 'dashboard';
    const locate = urlParams.get('locate');
    const editing = urlParams.get('editing');
    
    return { page, locate, editing };
}

function navigateToPage(page, locate = null, editing = null) {
    // Update active nav link
    navLinks.forEach(link => {
        const linkPage = link.dataset.page;
        if (linkPage === page) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
    
    // Show correct page
    pages.forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(page);
    if (targetPage) targetPage.classList.add('active');
    
    // Update page title
    const activeLink = Array.from(navLinks).find(l => l.dataset.page === page);
    if (activeLink && pageTitle) {
        pageTitle.textContent = activeLink.querySelector('span').textContent;
    }
    
    // Handle file manager location
    if (page === 'files') {
        if (locate) {
            currentPath = locate;
            loadFileList(currentPath);
        } else {
            loadFileList('');
        }
    }
    
    // Handle editor
    if (page === 'files' && editing) {
        setTimeout(() => {
            openEditor(editing);
        }, 100);
    }
}

// ========== Initialization ==========
async function init() {
    // Parse URL on load
    const { page, locate, editing } = parseURL();
    
    await loadConfig();
    await loadPublicIp();
    await loadServerStatus();
    await loadLogs();
    
    // Navigate to the page from URL
    navigateToPage(page, locate, editing);
    
    setupEventListeners();
    setupSocketEvents();
    
    setInterval(updateDashboard, 5000);
    setInterval(() => {
        if (serverRunning) {
            socket.emit('command', { command: 'list' });
        }
    }, 10000);
}

async function loadConfig() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        serverConfig = data.config;
        updateSettingsForm();
        updateNetworkForm();
        updateRamInfo();
    } catch (e) {
        console.error('Error loading config', e);
    }
}

async function loadPublicIp() {
    try {
        const res = await fetch('/api/ip');
        const data = await res.json();
        statIp.textContent = data.ip;
    } catch (e) {
        statIp.textContent = 'Unknown';
    }
}

async function loadServerStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        serverRunning = data.running;
        serverStarting = data.starting;
        updateServerStatus(data);
        
        if (data.running) {
            socket.emit('command', { command: 'list' });
        }
    } catch (e) {
        console.error('Error loading status', e);
    }
}

async function loadLogs() {
    try {
        const res = await fetch('/api/logs?limit=50');
        const logs = await res.json();
        serverLogs = logs;
        renderActivityList();
    } catch (e) {
        console.error('Error loading logs', e);
    }
}

async function loadFileList(path) {
    try {
        const res = await fetch(`/api/files/${path}`);
        const data = await res.json();
        
        if (data.items) {
            currentPath = data.currentPath;
            renderBreadcrumb(currentPath);
            renderFileList(data.items);
            
            // Update URL with current location
            if (currentPath) {
                updateURL('files', { locate: currentPath });
            } else {
                updateURL('files', {});
            }
        } else if (data.type === 'file' && data.content) {
            // File content for editing
            openEditorFromContent(data.path, data.content);
        }
    } catch (e) {
        console.error('Error loading files', e);
        if (filesList) {
            filesList.innerHTML = '<div class="loading-spinner"><i class="fas fa-exclamation-triangle"></i><p>Error loading files</p></div>';
        }
    }
}

// ========== UI Update Functions ==========
function updateServerStatus(data) {
    if (data.status === 'starting' || data.starting) {
        serverBadge.classList.remove('online');
        serverBadge.querySelector('.badge-dot').style.background = '#FFAA00';
        serverBadge.querySelector('.badge-dot').style.boxShadow = '0 0 8px #FFAA00';
        serverBadge.querySelector('span:last-child').textContent = 'STARTING...';
        statUptime.textContent = '0s';
        perfUptime.textContent = '0s';
    } else if (data.running) {
        serverBadge.classList.add('online');
        serverBadge.querySelector('.badge-dot').style.background = '#4caf50';
        serverBadge.querySelector('.badge-dot').style.boxShadow = '0 0 8px #4caf50';
        serverBadge.querySelector('span:last-child').textContent = 'ONLINE';
        statUptime.textContent = data.uptime;
        perfUptime.textContent = data.uptime;
    } else {
        serverBadge.classList.remove('online');
        serverBadge.querySelector('.badge-dot').style.background = '#4a4a6a';
        serverBadge.querySelector('.badge-dot').style.boxShadow = 'none';
        serverBadge.querySelector('span:last-child').textContent = 'OFFLINE';
        statUptime.textContent = '0s';
        perfUptime.textContent = '0s';
        statPlayers.textContent = `0/${serverConfig.maxPlayers || 20}`;
    }
    
    statStability.textContent = data.crashCount >= 3 ? 'Unstable' : 'Stable';
    if (perfCrashCount) perfCrashCount.textContent = data.crashCount || 0;
    if (perfLastCrash) perfLastCrash.textContent = data.lastCrash ? new Date(data.lastCrash).toLocaleString() : 'None';
}

function updateDashboard() {
    if (serverConfig) {
        statRam.textContent = `${serverConfig.minRam}GB / ${serverConfig.maxRam}GB`;
        statPort.textContent = serverConfig.serverPort || 25565;
        if (maxPlayersSpan) maxPlayersSpan.textContent = serverConfig.maxPlayers || 20;
    }
}

function updateRamInfo() {
    const ramInfo = document.getElementById('ramInfo');
    if (ramInfo && serverConfig) {
        ramInfo.textContent = `${serverConfig.minRam}GB / ${serverConfig.maxRam}GB`;
    }
}

function updateSettingsForm() {
    if (!serverConfig) return;
    if (settingMaxRam) settingMaxRam.value = serverConfig.maxRam;
    if (settingMinRam) settingMinRam.value = serverConfig.minRam;
    if (settingMaxPlayers) settingMaxPlayers.value = serverConfig.maxPlayers || 20;
    if (settingViewDistance) settingViewDistance.value = serverConfig.viewDistance || 10;
    if (settingDifficulty) settingDifficulty.value = serverConfig.difficulty;
    if (settingOnlineMode) settingOnlineMode.value = serverConfig.onlineMode.toString();
    if (settingPvp) settingPvp.value = serverConfig.pvp !== undefined ? serverConfig.pvp.toString() : 'true';
    if (settingAllowNether) settingAllowNether.value = serverConfig.allowNether !== undefined ? serverConfig.allowNether.toString() : 'true';
    if (settingAllowEnd) settingAllowEnd.value = serverConfig.allowEnd !== undefined ? serverConfig.allowEnd.toString() : 'true';
    if (settingAutoRestart) settingAutoRestart.value = serverConfig.autoRestart.toString();
    if (settingSpawnProtection) settingSpawnProtection.value = serverConfig.spawnProtection || 16;
    if (settingMotd) settingMotd.value = serverConfig.motd || 'A Minecraft Server';
}

function updateNetworkForm() {
    if (!serverConfig) return;
    if (networkServerPort) networkServerPort.value = serverConfig.serverPort || 25565;
    if (networkQueryPort) networkQueryPort.value = serverConfig.queryPort || 25565;
    if (networkRconPort) networkRconPort.value = serverConfig.rconPort || 25575;
    if (networkEnableRcon) networkEnableRcon.value = serverConfig.enableRcon ? 'true' : 'false';
    if (networkEnableQuery) networkEnableQuery.value = serverConfig.enableQuery ? 'true' : 'false';
    if (networkMaxConnections) networkMaxConnections.value = serverConfig.maxConnections || 20;
    if (networkCompression) networkCompression.value = serverConfig.networkCompression || 256;
}

function renderActivityList() {
    if (!activityList) return;
    
    if (serverLogs.length === 0) {
        activityList.innerHTML = `
            <div class="activity-empty">
                <i class="fas fa-inbox"></i>
                <p>No recent activity</p>
            </div>
        `;
        return;
    }
    
    activityList.innerHTML = serverLogs.slice(0, 20).map(log => {
        let message = log.message;
        if (message.length > 100) message = message.substring(0, 100) + '...';
        return `
            <div class="activity-item ${log.type.toLowerCase()}">
                <span class="activity-time">${new Date(log.timestamp).toLocaleTimeString()}</span>
                <span>${escapeHtml(message)}</span>
            </div>
        `;
    }).join('');
}

function addConsoleLine(type, message, formattedMessage = null) {
    if (!consoleOutput) return;
    
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    const timestamp = new Date().toLocaleTimeString();
    
    // Use formatted message if available and different from plain text
    if (formattedMessage && formattedMessage !== message) {
        line.innerHTML = `<span style="color:rgba(255,255,255,0.3)">[${timestamp}]</span> [${type}] ${formattedMessage}`;
    } else {
        line.innerHTML = `<span style="color:rgba(255,255,255,0.3)">[${timestamp}]</span> [${type}] ${escapeHtml(message)}`;
    }
    
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
    
    // Add to activity (plain text for activity list)
    addActivity(type, message);
}

function addActivity(type, message) {
    const activity = {
        id: Date.now(),
        type: type,
        message: message.substring(0, 150),
        timestamp: new Date().toISOString()
    };
    serverLogs.unshift(activity);
    if (serverLogs.length > 100) serverLogs.pop();
    renderActivityList();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== File Manager ==========
function renderBreadcrumb(path) {
    if (!breadcrumb) return;
    
    const parts = path.split('/').filter(p => p);
    breadcrumb.innerHTML = '';
    
    const rootItem = document.createElement('span');
    rootItem.className = 'breadcrumb-item';
    rootItem.textContent = 'root';
    rootItem.onclick = () => {
        currentPath = '';
        loadFileList('');
        updateURL('files', {});
    };
    breadcrumb.appendChild(rootItem);
    
    let current = '';
    for (const part of parts) {
        current += part;
        const separator = document.createTextNode(' / ');
        const item = document.createElement('span');
        item.className = 'breadcrumb-item';
        item.textContent = part;
        item.onclick = () => {
            loadFileList(current);
            updateURL('files', { locate: current });
        };
        breadcrumb.appendChild(separator);
        breadcrumb.appendChild(item);
        current += '/';
    }
}

function renderFileList(items) {
    if (!filesList) return;
    
    if (items.length === 0) {
        filesList.innerHTML = `
            <div class="activity-empty">
                <i class="fas fa-folder-open"></i>
                <p>Folder is empty</p>
            </div>
        `;
        return;
    }
    
    filesList.innerHTML = items.map(item => `
        <div class="file-item">
            <div class="file-info" data-path="${item.path}" data-is-dir="${item.isDirectory}">
                <i class="fas ${item.isDirectory ? 'fa-folder' : 'fa-file-code'}"></i>
                <span class="file-name">${escapeHtml(item.name)}</span>
                ${!item.isDirectory ? `<span class="file-size">${formatFileSize(item.size)}</span>` : ''}
            </div>
            <div class="file-actions">
                <button class="file-action delete-file" data-path="${item.path}" data-is-dir="${item.isDirectory}">
                    <i class="fas fa-trash-alt"></i>
                </button>
                ${!item.isDirectory ? `
                    <button class="file-action download-file" data-path="${item.path}">
                        <i class="fas fa-download"></i>
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
    
    // File click = edit (for files) or navigate (for folders)
    document.querySelectorAll('.file-info').forEach(el => {
        el.addEventListener('click', (e) => {
            const path = el.dataset.path;
            const isDir = el.dataset.isDir === 'true';
            if (isDir) {
                loadFileList(path);
                updateURL('files', { locate: path });
            } else {
                openEditor(path);
            }
        });
    });
    
    document.querySelectorAll('.delete-file').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const path = btn.dataset.path;
            const isDir = btn.dataset.isDir === 'true';
            deleteFile(path, isDir);
        });
    });
    
    document.querySelectorAll('.download-file').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const path = btn.dataset.path;
            downloadFile(path);
        });
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function deleteFile(path, isDir) {
    if (!confirm(`Are you sure you want to delete ${isDir ? 'folder' : 'file'}?`)) return;
    
    try {
        const res = await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        
        if (res.ok) {
            showToast(`${isDir ? 'Folder' : 'File'} deleted successfully`, 'success');
            loadFileList(currentPath);
        } else {
            throw new Error('Delete failed');
        }
    } catch (e) {
        showToast('Error deleting item', 'error');
    }
}

function downloadFile(path) {
    window.open(`/api/download/${path}`, '_blank');
}

async function openEditor(filePath) {
    try {
        const res = await fetch(`/api/file-content/${filePath}`);
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);
        
        openEditorFromContent(filePath, data.content);
        
        // Update URL with editing parameter
        updateURL('files', { locate: currentPath, editing: filePath });
    } catch (e) {
        showToast('Error loading file', 'error');
    }
}

function openEditorFromContent(filePath, content) {
    currentEditPath = filePath;
    editorTextarea.value = content;
    
    if (editingFileName) {
        editingFileName.textContent = filePath;
    }
    
    if (editor) {
        editor.toTextArea();
    }
    
    editor = CodeMirror.fromTextArea(editorTextarea, {
        lineNumbers: true,
        theme: 'material-darker',
        mode: getEditorMode(filePath),
        lineWrapping: true,
        indentUnit: 4,
        tabSize: 4
    });
    
    editorModal.classList.add('active');
}

function getEditorMode(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'yml' || ext === 'yaml') return 'yaml';
    if (ext === 'json') return 'javascript';
    if (ext === 'properties') return 'properties';
    if (ext === 'txt' || ext === 'md') return null;
    return null;
}

async function saveFileContent() {
    if (!currentEditPath || !editor) return;
    
    try {
        const content = editor.getValue();
        const res = await fetch('/api/save-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: currentEditPath, content })
        });
        
        if (res.ok) {
            showToast('File saved successfully', 'success');
            closeEditor();
            loadFileList(currentPath);
        } else {
            throw new Error('Save failed');
        }
    } catch (e) {
        showToast('Error saving file', 'error');
    }
}

function closeEditor() {
    editorModal.classList.remove('active');
    if (editor) {
        editor.toTextArea();
        editor = null;
    }
    currentEditPath = '';
    
    // Remove editing from URL
    updateURL('files', { locate: currentPath });
}

async function createNewFolder() {
    const folderName = folderNameInput.value.trim();
    if (!folderName) {
        showToast('Enter a folder name', 'error');
        return;
    }
    
    try {
        const res = await fetch('/api/create-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPath, folderName })
        });
        
        if (res.ok) {
            showToast('Folder created successfully', 'success');
            folderModal.classList.remove('active');
            folderNameInput.value = '';
            loadFileList(currentPath);
        } else {
            throw new Error('Create folder failed');
        }
    } catch (e) {
        showToast('Error creating folder', 'error');
    }
}

// ========== Upload with current folder from URL ==========
function setupUpload() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    
    if (uploadBtn) {
        uploadBtn.onclick = () => fileInput.click();
    }
    
    fileInput.onchange = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        
        // Use currentPath from state, which is synced with URL
        const uploadPath = currentPath || '';
        
        showToast(`Uploading ${files.length} file(s) to ${uploadPath || 'root'}...`, 'info');
        
        try {
            const res = await fetch(`/api/upload?locate=${encodeURIComponent(uploadPath)}`, {
                method: 'POST',
                body: formData
            });
            
            if (res.ok) {
                showToast(`${files.length} file(s) uploaded successfully`, 'success');
                loadFileList(currentPath);
            } else {
                throw new Error('Upload failed');
            }
        } catch (e) {
            showToast('Error uploading files', 'error');
        }
        
        fileInput.value = '';
    };
    
    // Drag & drop
    const filesContainer = document.querySelector('.files-container');
    if (filesContainer) {
        filesContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            filesContainer.style.border = '2px dashed #5c6bc0';
        });
        
        filesContainer.addEventListener('dragleave', () => {
            filesContainer.style.border = 'none';
        });
        
        filesContainer.addEventListener('drop', async (e) => {
            e.preventDefault();
            filesContainer.style.border = 'none';
            
            const files = Array.from(e.dataTransfer.files);
            if (files.length === 0) return;
            
            const formData = new FormData();
            files.forEach(file => formData.append('files', file));
            
            const uploadPath = currentPath || '';
            
            showToast(`Uploading ${files.length} file(s) to ${uploadPath || 'root'}...`, 'info');
            
            try {
                const res = await fetch(`/api/upload?locate=${encodeURIComponent(uploadPath)}`, {
                    method: 'POST',
                    body: formData
                });
                
                if (res.ok) {
                    showToast(`${files.length} file(s) uploaded successfully`, 'success');
                    loadFileList(currentPath);
                } else {
                    throw new Error('Upload failed');
                }
            } catch (e) {
                showToast('Error uploading files', 'error');
            }
        });
    }
}

// ========== Socket Events ==========
function setupSocketEvents() {
    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('get:logs');
    });
    
    socket.on('console:output', (data) => {
        addConsoleLine(data.type, data.message, data.formatted);
    });
    
    socket.on('console:history', (logs) => {
        logs.forEach(log => {
            addConsoleLine(log.type, log.message, log.formattedMessage);
        });
    });
    
    socket.on('server:status', (data) => {
        serverRunning = data.running;
        serverStarting = data.starting;
        updateServerStatus({ 
            running: data.running, 
            starting: data.starting, 
            status: data.status,
            uptime: data.uptime, 
            crashCount: 0 
        });
    });
    
    socket.on('server:players', (players) => {
        playersCount = players.length;
        if (statPlayers) statPlayers.textContent = `${playersCount}/${serverConfig.maxPlayers || 20}`;
    });
    
    socket.on('server:playercount', (count) => {
        playersCount = count;
        if (statPlayers) statPlayers.textContent = `${count}/${serverConfig.maxPlayers || 20}`;
    });
}

// ========== Event Listeners ==========
function setupEventListeners() {
    // Navigation with URL update
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            
            // Update URL without locate/editing params
            updateURL(page, {});
            
            // Navigate
            navigateToPage(page);
        });
    });
    
    // Handle browser back/forward
    window.addEventListener('popstate', (event) => {
        const { page, locate, editing } = parseURL();
        navigateToPage(page, locate, editing);
        if (page === 'files' && locate) {
            loadFileList(locate);
        }
        if (editing) {
            setTimeout(() => openEditor(editing), 100);
        }
    });
    
    // Mobile menu
    const mobileBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.querySelector('.sidebar');
    if (mobileBtn && sidebar) {
        mobileBtn.onclick = () => sidebar.classList.toggle('open');
    }
    
    // Server control
    if (quickStart) quickStart.onclick = () => fetch('/api/start', { method: 'POST' });
    if (quickStop) quickStop.onclick = () => fetch('/api/stop', { method: 'POST' });
    if (quickRestart) quickRestart.onclick = () => fetch('/api/restart', { method: 'POST' });
    if (quickKill) quickKill.onclick = () => {
        if (confirm('Force stop? This may cause data loss.')) {
            fetch('/api/kill', { method: 'POST' });
        }
    };
    
    // Console
    if (sendCommandBtn) sendCommandBtn.onclick = sendConsoleCommand;
    if (consoleInput) consoleInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendConsoleCommand();
    });
    
    if (clearConsoleBtn) clearConsoleBtn.onclick = () => {
        if (consoleOutput) consoleOutput.innerHTML = '';
        showToast('Console cleared', 'success');
    };
    
    if (copyConsoleBtn) copyConsoleBtn.onclick = () => {
        if (consoleOutput) {
            const text = Array.from(consoleOutput.children).map(line => line.textContent).join('\n');
            navigator.clipboard.writeText(text);
            showToast('Console copied to clipboard', 'success');
        }
    };
    
    // Suggestions
    suggestions.forEach(sugg => {
        sugg.addEventListener('click', () => {
            if (consoleInput) {
                consoleInput.value = sugg.dataset.cmd;
                consoleInput.focus();
            }
        });
    });
    
    // File manager
    if (refreshFilesBtn) refreshFilesBtn.onclick = () => loadFileList(currentPath);
    if (newFolderBtn) newFolderBtn.onclick = () => folderModal.classList.add('active');
    
    // Settings
    if (saveSettingsBtn) saveSettingsBtn.onclick = saveSettings;
    if (saveNetworkBtn) saveNetworkBtn.onclick = saveNetworkSettings;
    
    // Modals
    if (cancelEditBtn) cancelEditBtn.onclick = closeEditor;
    if (saveEditBtn) saveEditBtn.onclick = saveFileContent;
    if (cancelFolderBtn) cancelFolderBtn.onclick = () => folderModal.classList.remove('active');
    if (createFolderBtn) createFolderBtn.onclick = createNewFolder;
    
    const closeEditorBtn = document.getElementById('closeEditorBtn');
    if (closeEditorBtn) closeEditorBtn.onclick = closeEditor;
    
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.onclick = () => {
            editorModal.classList.remove('active');
            folderModal.classList.remove('active');
        };
    });
    
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('active');
        }
    });
    
    // Clear activity
    const clearActivityBtn = document.getElementById('clearActivity');
    if (clearActivityBtn) {
        clearActivityBtn.onclick = () => {
            serverLogs = [];
            renderActivityList();
            showToast('Activity cleared', 'success');
        };
    }
    
    // Setup upload
    setupUpload();
}

function sendConsoleCommand() {
    if (!consoleInput) return;
    const cmd = consoleInput.value.trim();
    if (!cmd) return;
    
    socket.emit('command', { command: cmd });
    addConsoleLine('COMMAND', `> ${cmd}`);
    consoleInput.value = '';
}

async function saveSettings() {
    const settings = {
        maxRam: parseInt(settingMaxRam.value),
        minRam: parseInt(settingMinRam.value),
        maxPlayers: parseInt(settingMaxPlayers.value),
        viewDistance: parseInt(settingViewDistance.value),
        difficulty: settingDifficulty.value,
        onlineMode: settingOnlineMode.value === 'true',
        pvp: settingPvp.value === 'true',
        allowNether: settingAllowNether.value === 'true',
        allowEnd: settingAllowEnd.value === 'true',
        autoRestart: settingAutoRestart.value === 'true',
        spawnProtection: parseInt(settingSpawnProtection.value),
        motd: settingMotd.value
    };
    
    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        
        if (res.ok) {
            serverConfig = { ...serverConfig, ...settings };
            updateDashboard();
            updateRamInfo();
            showToast('Settings saved successfully', 'success');
            
            if (serverRunning) {
                showToast('Some settings require a server restart to take effect', 'info');
            }
        } else {
            throw new Error('Save failed');
        }
    } catch (e) {
        showToast('Error saving settings', 'error');
    }
}

async function saveNetworkSettings() {
    const networkSettings = {
        serverPort: parseInt(networkServerPort.value),
        queryPort: parseInt(networkQueryPort.value),
        rconPort: parseInt(networkRconPort.value),
        enableRcon: networkEnableRcon.value === 'true',
        enableQuery: networkEnableQuery.value === 'true',
        maxConnections: parseInt(networkMaxConnections.value),
        networkCompression: parseInt(networkCompression.value)
    };
    
    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(networkSettings)
        });
        
        if (res.ok) {
            serverConfig = { ...serverConfig, ...networkSettings };
            updateDashboard();
            showToast('Network settings saved successfully', 'success');
            
            if (serverRunning && networkSettings.serverPort !== (serverConfig.serverPort || 25565)) {
                showToast('Port change requires server restart', 'warning');
            }
        } else {
            throw new Error('Save failed');
        }
    } catch (e) {
        showToast('Error saving network settings', 'error');
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Start the application
init();