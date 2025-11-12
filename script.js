// Configurazione
const PASSWORD = '12345';
const MONTHS = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

// Stato dell'applicazione
let currentDate = new Date();
let posts = [];
let editingPostId = null;
let API_BASE = (() => {
    const origin = window.location.origin || '';
    if (origin && origin.startsWith('http')) return `${origin}/api`;
    const stored = localStorage.getItem('apiBase');
    if (stored) return `${stored.replace(/\/$/, '')}/api`;
    return '/api';
})();
let postsRefreshIntervalId = null;

// Elementi DOM
const loginScreen = document.getElementById('loginScreen');
const mainApp = document.getElementById('mainApp');
const loginForm = document.getElementById('loginForm');
const passwordInput = document.getElementById('passwordInput');
const errorMessage = document.getElementById('errorMessage');
const logoutBtn = document.getElementById('logoutBtn');
const currentMonthElement = document.getElementById('currentMonth');
const calendarGrid = document.getElementById('calendarGrid');
const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');
const addPostBtn = document.getElementById('addPostBtn');
const postModal = document.getElementById('postModal');
const modalOverlay = document.getElementById('modalOverlay');
const closeModal = document.getElementById('closeModal');
const postForm = document.getElementById('postForm');
const cancelPost = document.getElementById('cancelPost');
const postDateInput = document.getElementById('postDate');
const postTimeInput = document.getElementById('postTime');
const postDateHelper = document.getElementById('postDateHelper');
const postTimeHelper = document.getElementById('postTimeHelper');
const deletePostBtn = document.getElementById('deletePostBtn');
const networkBanner = document.getElementById('networkBanner');
const networkMessage = document.getElementById('networkMessage');
const retryBtn = document.getElementById('retryBtn');
const dismissBtn = document.getElementById('dismissBtn');
const dropboxConnectBtn = document.getElementById('dropboxConnectBtn');
const dropboxSyncBtn = document.getElementById('dropboxSyncBtn');
const googleSyncBtn = document.getElementById('googleSyncBtn');
const noPasswordLoginBtn = document.getElementById('noPasswordLoginBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFileInput = document.getElementById('importFileInput');

// Inizializzazione
document.addEventListener('DOMContentLoaded', function() {
    // Controlla se l'utente è già autenticato
    if (localStorage.getItem('authenticated') === 'true') {
        showMainApp();
    }
    
    setupEventListeners();
    setupBiometricUI();
    // Non avviare l'auto-refresh finché non si mostra l'app principale
});

// Event Listeners
function setupEventListeners() {
    // Login
    loginForm.addEventListener('submit', handleLogin);
    if (noPasswordLoginBtn) noPasswordLoginBtn.addEventListener('click', loginWithoutPassword);
    
    // Logout
    logoutBtn.addEventListener('click', handleLogout);
    
    // Navigazione calendario
    prevMonthBtn.addEventListener('click', () => navigateMonth(-1));
    nextMonthBtn.addEventListener('click', () => navigateMonth(1));
    
    // Modal
    addPostBtn.addEventListener('click', () => openModal());
    closeModal.addEventListener('click', closeModalHandler);
    cancelPost.addEventListener('click', closeModalHandler);
    modalOverlay.addEventListener('click', closeModalHandler);
    
    // Form post
    postForm.addEventListener('submit', handlePostSubmit);
    // Helper per mostrare formati italiani
    postDateInput.addEventListener('input', updateHelpers);
    postTimeInput.addEventListener('input', updateHelpers);
    // Elimina post in modalità modifica
    deletePostBtn.addEventListener('click', onDeletePostClicked);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);
    
    // Pulsanti biometria// Biometric buttons
    if (enableBiometricBtn) enableBiometricBtn.addEventListener('click', registerBiometric);
    if (biometricLoginBtn) biometricLoginBtn.addEventListener('click', loginWithBiometric);
    
    // Network banner
    if (retryBtn) retryBtn.addEventListener('click', handleRetry);

    // Esporta calendario sul dispositivo
    if (exportBtn) exportBtn.addEventListener('click', exportPosts);

    // Importa calendario da file JSON
    if (importBtn && importFileInput) {
        importBtn.addEventListener('click', () => {
            importFileInput.click();
        });
        importFileInput.addEventListener('change', (e) => {
            importPosts(e);
            // Resetta il valore per permettere nuovo import dello stesso file
            importFileInput.value = '';
        });
    }
    if (dismissBtn) dismissBtn.addEventListener('click', dismissNetworkBanner);

    // Dropbox sync
    if (dropboxConnectBtn) dropboxConnectBtn.addEventListener('click', connectDropbox);
    if (dropboxSyncBtn) dropboxSyncBtn.addEventListener('click', syncDropbox);
    // Google Drive sync
    if (googleSyncBtn) googleSyncBtn.addEventListener('click', syncGoogleDrive);

    // Ascolta messaggi dal popup OAuth
    window.addEventListener('message', (event) => {
        try {
            const data = event && event.data;
            if (data && data.type === 'oauth_success' && data.provider === 'dropbox') {
                showNotification('Dropbox collegato!');
            }
            if (data && data.type === 'oauth_success' && data.provider === 'google') {
                showNotification('Google Drive collegato!');
                // tenta di sincronizzare subito dopo il collegamento
                syncGoogleDrive();
            }
        } catch (e) {
            // ignora
        }
    });
}

// Autenticazione
function handleLogin(e) {
    e.preventDefault();
    const password = passwordInput.value;
    
    if (password === PASSWORD) {
        localStorage.setItem('authenticated', 'true');
        showMainApp();
        errorMessage.textContent = '';
    } else {
        errorMessage.textContent = 'Password non corretta';
        passwordInput.value = '';
        passwordInput.focus();
    }
}

function loginWithoutPassword() {
    localStorage.setItem('authenticated', 'true');
    showMainApp();
    if (errorMessage) errorMessage.textContent = '';
}

// Biometria (WebAuthn) lato client
async function setupBiometricUI() {
    try {
        const supported = !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        const hasCredential = !!localStorage.getItem('webauthnCredentialId');
        if (biometricLoginBtn) biometricLoginBtn.classList.toggle('hidden', !supported);
        if (enableBiometricBtn) enableBiometricBtn.classList.toggle('hidden', !supported || hasCredential);
    } catch (e) {
        if (biometricLoginBtn) biometricLoginBtn.classList.add('hidden');
        if (enableBiometricBtn) enableBiometricBtn.classList.add('hidden');
    }
}

function uint8ArrayToBase64url(uint8) {
    const b64 = btoa(String.fromCharCode(...uint8));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlToUint8Array(base64url) {
    const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const str = atob(b64);
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
    return bytes;
}

async function registerBiometric() {
    try {
        if (!window.PublicKeyCredential) throw new Error('not_supported');
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        const userId = new Uint8Array(16);
        crypto.getRandomValues(userId);
        const publicKey = {
            challenge,
            rp: { name: 'Calendario Editoriale MEC', id: window.location.hostname },
            user: { id: userId, name: 'utente@mec', displayName: 'Utente MEC' },
            pubKeyCredParams: [ { type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 } ],
            authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
            timeout: 60000,
            attestation: 'none'
        };
        const cred = await navigator.credentials.create({ publicKey });
        const credId = uint8ArrayToBase64url(new Uint8Array(cred.rawId));
        localStorage.setItem('webauthnCredentialId', credId);
        showNotification('Impronta abilitata!');
        setupBiometricUI();
    } catch (e) {
        alert('Impossibile abilitare l\'impronta su questo dispositivo.');
    }
}

async function loginWithBiometric() {
    try {
        const credId = localStorage.getItem('webauthnCredentialId');
        if (!credId) {
            alert('Abilita prima l\'impronta.');
            return;
        }
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        const publicKey = {
            challenge,
            rpId: window.location.hostname,
            allowCredentials: [ { type: 'public-key', id: base64urlToUint8Array(credId), transports: ['internal'] } ],
            userVerification: 'required',
            timeout: 60000
        };
        await navigator.credentials.get({ publicKey });
        localStorage.setItem('authenticated', 'true');
        showMainApp();
    } catch (e) {
        alert('Autenticazione biometrica fallita o annullata.');
    }
}

function handleLogout() {
    localStorage.removeItem('authenticated');
    loginScreen.classList.remove('hidden');
    mainApp.classList.add('hidden');
    passwordInput.value = '';
    passwordInput.focus();
    setupBiometricUI();
}

function showMainApp() {
    loginScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');
    fetchPosts();
    // Prova a sincronizzare post offline se presenti
    setTimeout(syncOfflinePosts, 1000);
    startAutoRefresh();
}

// Gestione Calendario
function navigateMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    renderCalendar();
}

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Aggiorna il titolo del mese
    currentMonthElement.textContent = `${MONTHS[month]} ${year}`;
    
    // Pulisci il calendario (mantieni gli header)
    const dayHeaders = calendarGrid.querySelectorAll('.day-header');
    calendarGrid.innerHTML = '';
    dayHeaders.forEach(header => calendarGrid.appendChild(header));
    
    // Calcola il primo giorno del mese e il numero di giorni
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = (firstDay.getDay() + 6) % 7; // Lunedì = 0
    
    // Aggiungi giorni del mese precedente
    const prevMonth = new Date(year, month - 1, 0);
    const daysInPrevMonth = prevMonth.getDate();
    
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
        const dayElement = createDayElement(daysInPrevMonth - i, true);
        calendarGrid.appendChild(dayElement);
    }
    
    // Aggiungi giorni del mese corrente
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = year === today.getFullYear() && 
                       month === today.getMonth() && 
                       day === today.getDate();
        const dayElement = createDayElement(day, false, isToday);
        calendarGrid.appendChild(dayElement);
    }
    
    // Aggiungi giorni del mese successivo per completare la griglia
    const totalCells = calendarGrid.children.length - 7; // Sottrai gli header
    const remainingCells = 42 - totalCells; // 6 settimane * 7 giorni
    
    for (let day = 1; day <= remainingCells; day++) {
        const dayElement = createDayElement(day, true);
        calendarGrid.appendChild(dayElement);
    }
}

function createDayElement(day, isOtherMonth = false, isToday = false) {
    const dayElement = document.createElement('div');
    dayElement.className = 'calendar-day';
    
    if (isOtherMonth) {
        dayElement.classList.add('other-month');
    }
    
    if (isToday) {
        dayElement.classList.add('today');
    }
    
    // Numero del giorno
    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = day;
    dayElement.appendChild(dayNumber);
    
    // Container per i post
    const postsContainer = document.createElement('div');
    postsContainer.className = 'day-posts';
    dayElement.appendChild(postsContainer);
    
    // Se non è un giorno di altro mese, aggiungi i post e l'event listener
    if (!isOtherMonth) {
        const dateStr = formatDate(currentDate.getFullYear(), currentDate.getMonth(), day);
        const dayPosts = posts.filter(post => post.date === dateStr);
        
        dayPosts.forEach(post => {
            const postElement = createPostElement(post);
            postsContainer.appendChild(postElement);
        });
        
        // Event listener per aggiungere post
        dayElement.addEventListener('click', (e) => {
            if (!e.target.closest('.post-item')) {
                openModal(dateStr);
            }
        });
    }
    
    return dayElement;
}

function createPostElement(post) {
    const postElement = document.createElement('div');
    postElement.className = 'post-item';
    
    const icon = getPlatformIcon(post.platform);
    const time = formatTimeItalian(post.time || '');
    
    postElement.innerHTML = `
        <i class="${icon} ${post.platform}"></i>
        <span class="post-time">${time}</span>
        <span class="post-title">${post.title}</span>
    `;
    // Tooltip con data/ora in formato italiano
    postElement.title = `${getPlatformLabel(post.platform)} — ${formatDateItalianFromISO(post.date)} alle ${formatTimeItalian(post.time)}`;
    
    // Bottone di eliminazione rapida
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'post-delete';
    deleteBtn.title = 'Elimina';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deletePost(post.id);
    });
    postElement.appendChild(deleteBtn);

    // Event listener per modificare il post
    postElement.addEventListener('click', (e) => {
        e.stopPropagation();
        editPost(post.id);
    });
    
    return postElement;
}

function getPlatformIcon(platform) {
    const icons = {
        facebook: 'fab fa-facebook',
        instagram: 'fab fa-instagram',
        whatsapp: 'fab fa-whatsapp',
        pinterest: 'fab fa-pinterest',
        website: 'fas fa-globe'
    };
    return icons[platform] || 'fas fa-question';
}

function getPlatformLabel(platform) {
    const labels = {
        facebook: 'Facebook',
        instagram: 'Instagram',
        whatsapp: 'WhatsApp',
        pinterest: 'Pinterest',
        website: 'Sito Web'
    };
    return labels[platform] || platform;
}

// Gestione Modal e Post
function openModal(date = null) {
    editingPostId = null;
    document.getElementById('modalTitle').textContent = 'Nuovo Post';
    // Nascondi pulsante elimina in modalità nuovo
    if (deletePostBtn) deletePostBtn.classList.add('hidden');
    
    // Reset form
    postForm.reset();
    
    // Se è stata passata una data, impostala
    if (date) {
        document.getElementById('postDate').value = date;
    } else {
        // Imposta la data di oggi
        const today = new Date();
        document.getElementById('postDate').value = formatDate(today.getFullYear(), today.getMonth(), today.getDate());
    }
    
    // Imposta un orario di default
    document.getElementById('postTime').value = '09:00';
    
    updateHelpers();
    showModal();
    // Sospendi auto-refresh mentre il modal è aperto per evitare conflitti
    stopAutoRefresh();
}

function editPost(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    
    editingPostId = postId;
    document.getElementById('modalTitle').textContent = 'Modifica Post';
    // Mostra pulsante elimina in modalità modifica
    if (deletePostBtn) deletePostBtn.classList.remove('hidden');
    
    // Popola il form con i dati del post
    document.getElementById('postDate').value = post.date;
    document.getElementById('postTime').value = post.time;
    document.getElementById('postPlatform').value = post.platform;
    document.getElementById('postTitle').value = post.title;
    document.getElementById('postContent').value = post.content || '';
    
    showModal();
}

function showModal() {
    postModal.classList.remove('hidden');
    modalOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModalHandler() {
    postModal.classList.add('hidden');
    modalOverlay.classList.add('hidden');
    document.body.style.overflow = 'auto';
    editingPostId = null;
    // Ripristina stato pulsante elimina
    if (deletePostBtn) deletePostBtn.classList.add('hidden');
    // Riavvia auto-refresh dopo la chiusura del modal
    startAutoRefresh();
}

function onDeletePostClicked() {
    if (!editingPostId) return;
    // Riutilizza conferma e logica già esistente
    deletePost(editingPostId);
    closeModalHandler();
}

function handlePostSubmit(e) {
    e.preventDefault();
    // Attiva la validazione nativa del form (compatibile con mobile)
    if (typeof postForm.reportValidity === 'function') {
        const valid = postForm.reportValidity();
        if (!valid) return;
    }
    
    const formData = new FormData(postForm);
    const postData = {
        id: editingPostId || null,
        date: document.getElementById('postDate').value,
        time: document.getElementById('postTime').value,
        platform: document.getElementById('postPlatform').value,
        title: document.getElementById('postTitle').value,
        content: document.getElementById('postContent').value
    };
    savePostToServer(postData)
        .then(() => {
            closeModalHandler();
            fetchPosts();
            showNotification(editingPostId ? 'Post modificato con successo!' : 'Post aggiunto con successo!');
        })
        .catch((err) => {
            console.error('Errore salvataggio server:', err);
            if (err && err.message && err.message.includes('Post salvato offline')) {
                showNotification('Post salvato offline!');
            } else if (err && err.message && err.message.includes('save_failed:400')) {
                showNetworkBanner('Compila tutti i campi richiesti (data, ora, piattaforma, titolo).');
            } else {
                showNetworkBanner('Errore nel salvataggio. Controlla la connessione e riprova.');
            }
        });
}

// Utility Functions
function formatDate(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDateItalianFromISO(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

function formatTimeItalian(time) {
    if (!time) return '';
    const [h, min] = time.split(':');
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function updateHelpers() {
    if (postDateHelper && postDateInput) {
        postDateHelper.textContent = formatDateItalianFromISO(postDateInput.value);
    }
    if (postTimeHelper && postTimeInput) {
        postTimeHelper.textContent = formatTimeItalian(postTimeInput.value);
    }
}

// ID generato dal server

function showNotification(message) {
    // Crea elemento notifica
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10000;
        font-weight: 600;
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animazione di entrata
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Rimozione automatica
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Keyboard Shortcuts
function handleKeyboard(e) {
    // ESC per chiudere modal
    if (e.key === 'Escape' && !postModal.classList.contains('hidden')) {
        closeModalHandler();
    }
    
    // Ctrl+N per nuovo post
    if (e.ctrlKey && e.key === 'n' && !loginScreen.classList.contains('hidden') === false) {
        e.preventDefault();
        openModal();
    }
    
    // Frecce per navigare mesi
    if (e.altKey) {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateMonth(-1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigateMonth(1);
        }
    }
}

// Funzioni aggiuntive per gestione avanzata
function deletePost(postId) {
    if (confirm('Sei sicuro di voler eliminare questo post?')) {
        deletePostFromServer(postId)
            .then(() => {
                fetchPosts();
                showNotification('Post eliminato con successo!');
            })
            .catch(() => alert('Errore nell’eliminazione sul server'));
    }
}

function exportPosts() {
    const dataStr = JSON.stringify(posts, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'calendario-editoriale.json';
    link.click();
    URL.revokeObjectURL(url);
}

function importPosts(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedPosts = JSON.parse(e.target.result);
                // invia al server tutti i post importati
                Promise.all(importedPosts.map(p => savePostToServer(p)))
                    .then(() => {
                        fetchPosts();
                        showNotification('Post importati con successo!');
                    })
                    .catch(() => alert('Errore nell\'importazione su server'));
            } catch (error) {
                alert('Errore nell\'importazione del file');
            }
        };
        reader.readAsText(file);
    }
}

// Aggiungi context menu per eliminazione post
document.addEventListener('contextmenu', function(e) {
    const postItem = e.target.closest('.post-item');
    if (postItem) {
        e.preventDefault();
        
        // Trova l'ID del post
        const postTitle = postItem.querySelector('.post-title').textContent;
        const postTime = postItem.querySelector('.post-time').textContent;
        const post = posts.find(p => p.title === postTitle && p.time === postTime);
        
        if (post && confirm('Vuoi eliminare questo post?')) {
            deletePost(post.id);
        }
    }
});

// Auto-save ogni 30 secondi
function startAutoRefresh() {
    if (postsRefreshIntervalId) return;
    postsRefreshIntervalId = setInterval(() => {
        fetchPosts();
    }, 30000);
}

function stopAutoRefresh() {
    if (!postsRefreshIntervalId) return;
    clearInterval(postsRefreshIntervalId);
    postsRefreshIntervalId = null;
}

// --- API Client ---
async function fetchPosts() {
    try {
        const res = await fetch(`${API_BASE}/posts`);
        if (!res.ok) throw new Error('failed');
        posts = await res.json();
        renderCalendar();
        dismissNetworkBanner(); // Nascondi banner se tutto ok
    } catch (e) {
        console.error('Errore nel caricamento dei post dal server', e);
        // Fallback: consenti di configurare l'indirizzo del server se non raggiungibile
        const hasStored = !!localStorage.getItem('apiBase');
        if (!hasStored) {
            const input = prompt('Server non raggiungibile. Inserisci indirizzo del server (es. http://192.168.1.23:8000)');
            if (input && /^https?:\/\//.test(input)) {
                localStorage.setItem('apiBase', input);
                API_BASE = `${input.replace(/\/$/, '')}/api`;
                try { return await fetchPosts(); } catch {}
            }
        }
        showNetworkBanner('Errore nel caricamento dei post. Apri l’app da http://<IP_DEL_PC>:8000 o configura l’indirizzo server.');
        // Carica da localStorage come fallback
        loadPostsFromLocalStorage();
    }
}

async function savePostToServer(postData) {
    const isUpdate = Boolean(postData.id);
    const url = isUpdate ? `${API_BASE}/posts/${postData.id}` : `${API_BASE}/posts`;
    const method = isUpdate ? 'PUT' : 'POST';
    
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(postData)
        });
        if (!res.ok) {
            let details = '';
            try { details = await res.text(); } catch {}
            throw new Error(`save_failed:${res.status}:${details}`);
        }
        const result = await res.json();
        // Salva anche in localStorage come backup
        savePostToLocalStorage(result);
        return result;
    } catch (e) {
        // Salva in localStorage se il server non è raggiungibile
        if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
            const savedPost = savePostToLocalStorage(postData);
            showNetworkBanner('Post salvato offline. Sarà sincronizzato quando tornerà la connessione.');
            return savedPost;
        }
        throw e;
    }
}

async function deletePostFromServer(postId) {
    const res = await fetch(`${API_BASE}/posts/${postId}`, { method: 'DELETE' });
    if (!res.ok) {
        let details = '';
        try { details = await res.text(); } catch {}
        throw new Error(`delete_failed:${res.status}:${details}`);
    }
    return res.json();
}

// --- Gestione Network Banner ---
function showNetworkBanner(message) {
    if (networkMessage) networkMessage.textContent = message;
    if (networkBanner) networkBanner.classList.remove('hidden');
}

function dismissNetworkBanner() {
    if (networkBanner) networkBanner.classList.add('hidden');
}

function showNotification(message) {
    // Mostra una notifica temporanea
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 10000;
        background: #4CAF50; color: white; padding: 12px 20px;
        border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        font-family: Arial, sans-serif; font-size: 14px;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

function handleRetry() {
    dismissNetworkBanner();
    fetchPosts();
}

// --- Dropbox Integration ---
function connectDropbox() {
    // Apri flusso OAuth in popup per evitare schermata nera nel preview
    const authWindow = window.open('/oauth/login?popup=1', 'dropboxAuth', 'width=600,height=700');
    // Fallback se il popup è bloccato
    if (!authWindow) {
        window.location.href = '/oauth/login';
    }
}

async function syncDropbox() {
    try {
        const res = await fetch('/dropbox/upload', { method: 'POST' });
        if (!res.ok) {
            let details = '';
            try { details = await res.text(); } catch {}
            showNetworkBanner('Errore sincronizzazione Dropbox: ' + details);
            return;
        }
        const data = await res.json();
        showNotification('Sincronizzazione Dropbox completata');
    } catch (e) {
        showNetworkBanner('Errore di rete durante la sincronizzazione Dropbox');
    }
}

// --- Google Drive Integration ---
async function syncGoogleDrive() {
    try {
        const res = await fetch('/google/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        if (!res.ok) {
            let details = '';
            try { details = await res.text(); } catch {}
            if (res.status === 401 && details.includes('not_authenticated')) {
                const authWindow = window.open('/google/login?popup=1', 'googleAuth', 'width=600,height=700');
                if (!authWindow) {
                    window.location.href = '/google/login';
                }
                return;
            }
            showNetworkBanner('Errore salvataggio su Google Drive: ' + details);
            return;
        }
        const data = await res.json();
        showNotification('Salvato su Google Drive!');
    } catch (e) {
        showNetworkBanner('Errore di rete durante il salvataggio su Google Drive');
    }
}

// --- Gestione localStorage Fallback ---
function savePostToLocalStorage(postData) {
    // Genera ID se mancante
    if (!postData.id) {
        postData.id = 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    let offlinePosts = JSON.parse(localStorage.getItem('offlinePosts') || '[]');
    const existingIndex = offlinePosts.findIndex(p => p.id === postData.id);
    
    if (existingIndex >= 0) {
        offlinePosts[existingIndex] = postData;
    } else {
        offlinePosts.push(postData);
    }
    
    localStorage.setItem('offlinePosts', JSON.stringify(offlinePosts));
    
    // Aggiorna anche i post locali per la visualizzazione
    const localIndex = posts.findIndex(p => p.id === postData.id);
    if (localIndex >= 0) {
        posts[localIndex] = postData;
    } else {
        posts.push(postData);
    }
    renderCalendar();
    
    return postData;
}

function loadPostsFromLocalStorage() {
    const offlinePosts = JSON.parse(localStorage.getItem('offlinePosts') || '[]');
    if (offlinePosts.length > 0) {
        posts = offlinePosts;
        renderCalendar();
        console.log('Caricati', offlinePosts.length, 'post da localStorage');
    }
}

function syncOfflinePosts() {
    const offlinePosts = JSON.parse(localStorage.getItem('offlinePosts') || '[]');
    if (offlinePosts.length === 0) return;
    
    console.log('Sincronizzazione di', offlinePosts.length, 'post offline...');
    
    offlinePosts.forEach(async (post) => {
        try {
            if (post.id.startsWith('offline_')) {
                // Nuovo post offline - invia come POST
                delete post.id; // Rimuovi ID offline
                await savePostToServer(post);
            } else {
                // Post esistente modificato offline - invia come PUT
                await savePostToServer(post);
            }
        } catch (e) {
            console.error('Errore sincronizzazione post:', post.id, e);
        }
    });
    
    // Pulisci localStorage dopo sincronizzazione
    localStorage.removeItem('offlinePosts');
    fetchPosts(); // Ricarica dal server
}