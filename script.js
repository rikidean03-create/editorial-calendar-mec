// Configurazione
const PASSWORD = 'mecshopping';
const MONTHS = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

// Stato dell'applicazione
let currentDate = new Date();
let posts = [];
let editingPostId = null;
const API_BASE = '/api';

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

// Inizializzazione
document.addEventListener('DOMContentLoaded', function() {
    // Controlla se l'utente è già autenticato
    if (localStorage.getItem('authenticated') === 'true') {
        showMainApp();
    }
    
    setupEventListeners();
});

// Event Listeners
function setupEventListeners() {
    // Login
    loginForm.addEventListener('submit', handleLogin);
    
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
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);
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

function handleLogout() {
    localStorage.removeItem('authenticated');
    loginScreen.classList.remove('hidden');
    mainApp.classList.add('hidden');
    passwordInput.value = '';
    passwordInput.focus();
}

function showMainApp() {
    loginScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');
    fetchPosts();
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
}

function editPost(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    
    editingPostId = postId;
    document.getElementById('modalTitle').textContent = 'Modifica Post';
    
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
}

function handlePostSubmit(e) {
    e.preventDefault();
    
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
        .catch(() => {
            alert('Errore nel salvataggio sul server');
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
setInterval(() => {
    // Auto-refresh ogni 30 secondi per sincronizzare con il server
    fetchPosts();
}, 30000);

// --- API Client ---
async function fetchPosts() {
    try {
        const res = await fetch(`${API_BASE}/posts`);
        if (!res.ok) throw new Error('failed');
        posts = await res.json();
        renderCalendar();
    } catch (e) {
        console.error('Errore nel caricamento dei post dal server', e);
    }
}

async function savePostToServer(postData) {
    const isUpdate = Boolean(postData.id);
    const url = isUpdate ? `${API_BASE}/posts/${postData.id}` : `${API_BASE}/posts`;
    const method = isUpdate ? 'PUT' : 'POST';
    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData)
    });
    if (!res.ok) throw new Error('save_failed');
    return res.json();
}

async function deletePostFromServer(postId) {
    const res = await fetch(`${API_BASE}/posts/${postId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete_failed');
    return res.json();
}