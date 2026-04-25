/* ============================================================
   FlowWallDesk UI Prototype — Application Logic
   ============================================================ */

// ---- Sample Wallpaper Data ----
const wallpapers = [
    { id: 1, title: '3D视差', type: 'web', image: '../assets/wallpapers/defaults/3D视差/assets/images/thumbnail.webp' },
    { id: 2, title: '交错战线', type: 'picture', image: '../assets/wallpapers/defaults/交错战线/交错战线.png' },
    { id: 3, title: '棕色尘埃2', type: 'picture', image: '../assets/wallpapers/defaults/棕色尘埃2/棕色尘埃2.png' },
    { id: 4, title: '碧蓝航线', type: 'picture', image: '../assets/wallpapers/defaults/碧蓝航线/碧蓝航线.png' },
    { id: 5, title: '龙魂旅人', type: 'picture', image: '../assets/wallpapers/defaults/龙魂旅人/龙魂旅人.png' },
    { id: 6, title: '少女前线2', type: 'video', image: null },
    { id: 7, title: '尘白禁区', type: 'video', image: null },
    { id: 8, title: '崩坏星穹铁道', type: 'video', image: null },
    { id: 9, title: '明日方舟', type: 'video', image: null },
    { id: 10, title: '鸣潮', type: 'video', image: null },
];

// ---- Placeholder images by type ----
const placeholders = {
    picture: '../src/FlowWallDesk.UI.WinUI/Assets/placeholder-picture.png',
    video: '../src/FlowWallDesk.UI.WinUI/Assets/placeholder-video.png',
    web: '../src/FlowWallDesk.UI.WinUI/Assets/placeholder-web.png',
};

// ---- Initialize Library Grid ----
function initLibrary() {
    const grid = document.getElementById('libraryGrid');
    grid.innerHTML = '';

    wallpapers.forEach(wp => {
        const card = document.createElement('div');
        card.className = 'wallpaper-card';
        card.setAttribute('data-id', wp.id);

        const imgSrc = wp.image || placeholders[wp.type] || placeholders.video;
        const isPlaceholder = !wp.image;

        card.innerHTML = `
      <img class="wallpaper-card__image ${isPlaceholder ? 'wallpaper-card__image--placeholder' : ''}"
           src="${imgSrc}" alt="${wp.title}" loading="lazy"
           onerror="this.src='${placeholders[wp.type] || placeholders.video}';this.classList.add('wallpaper-card__image--placeholder');">
      <div class="wallpaper-card__gradient"></div>
      <div class="wallpaper-card__title">${wp.title}</div>
      <button class="wallpaper-card__more" onclick="event.stopPropagation();showCardMenu(event);">
        <span class="icon">&#xE10C;</span>
      </button>
    `;

        // Right-click context menu
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, 'wallpaperContextMenu');
        });

        // Click to select
        card.addEventListener('click', () => {
            document.querySelectorAll('.wallpaper-card.selected').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
        });

        grid.appendChild(card);
    });
}

// ---- Navigation ----
let currentMode = 'main'; // 'main' | 'settings'
let currentPage = 'library';

function switchPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // Show target page
    const target = document.getElementById('page-' + pageId);
    if (target) target.classList.add('active');

    // Update nav item active state
    const navContainer = currentMode === 'settings' ? '#navSettings' : '#navMain';
    document.querySelectorAll(navContainer + ' .nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-page') === pageId);
    });

    currentPage = pageId;
}

function enterSettings() {
    currentMode = 'settings';
    const shell = document.getElementById('appShell');
    shell.classList.add('settings-mode');

    document.getElementById('navMain').classList.add('hidden');
    document.getElementById('navSettings').classList.remove('hidden');
    document.getElementById('navFooter').style.display = 'none';

    switchPage('settings-general');
}

function exitSettings() {
    currentMode = 'main';
    const shell = document.getElementById('appShell');
    shell.classList.remove('settings-mode');

    document.getElementById('navMain').classList.remove('hidden');
    document.getElementById('navSettings').classList.add('hidden');
    document.getElementById('navFooter').style.display = '';

    switchPage('library');
}

// ---- Dialog Management ----
function openDialog(id) {
    const overlay = document.getElementById(id);
    if (overlay) overlay.classList.add('active');
}

function closeDialog(id) {
    const overlay = document.getElementById(id);
    if (overlay) overlay.classList.remove('active');
}

// Close dialog on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('dialog-overlay')) {
        e.target.classList.remove('active');
    }
});

// ---- Context Menu ----
function showContextMenu(e, menuId) {
    hideAllMenus();
    const menu = document.getElementById(menuId);
    if (!menu) return;

    menu.classList.add('active');
    menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - 300) + 'px';
}

function showCardMenu(e) {
    showContextMenu(e, 'wallpaperContextMenu');
}

function hideContextMenu() {
    document.getElementById('wallpaperContextMenu').classList.remove('active');
}

function hideAllMenus() {
    document.querySelectorAll('.context-menu').forEach(m => m.classList.remove('active'));
}

// Hide menus on click outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.context-menu') && !e.target.closest('.wallpaper-card__more') && !e.target.closest('#overflowBtn')) {
        hideAllMenus();
    }
});

// ---- Overflow Menu ----
function toggleOverflowMenu(e) {
    e.stopPropagation();
    const menu = document.getElementById('overflowMenu');
    const btn = document.getElementById('overflowBtn');
    const rect = btn.getBoundingClientRect();

    if (menu.classList.contains('active')) {
        menu.classList.remove('active');
        return;
    }

    hideAllMenus();
    menu.classList.add('active');
    menu.style.right = (window.innerWidth - rect.right) + 'px';
    menu.style.top = rect.bottom + 4 + 'px';
    menu.style.left = 'auto';
}

function hideOverflowMenu() {
    document.getElementById('overflowMenu').classList.remove('active');
}

// ---- Settings Expander Toggle ----
function toggleExpander(headerEl) {
    const expander = headerEl.closest('.settings-expander');
    if (expander) {
        expander.classList.toggle('open');
    }
}

// ---- Slider value display ----
document.addEventListener('input', (e) => {
    if (e.target.classList.contains('slider')) {
        const valueEl = e.target.parentElement.querySelector('.slider__value');
        if (valueEl) valueEl.textContent = e.target.value;
    }
});

// ---- ListBox Toggle ----
document.addEventListener('click', (e) => {
    const item = e.target.closest('.listbox-toggle__item');
    if (item) {
        const toggle = item.closest('.listbox-toggle');
        toggle.querySelectorAll('.listbox-toggle__item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
    }
});

// ---- Drag & Drop visual ----
const libraryPage = document.getElementById('page-library');
const dropzone = document.getElementById('libraryDropzone');

if (libraryPage && dropzone) {
    libraryPage.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('active');
    });
    libraryPage.addEventListener('dragleave', (e) => {
        if (!libraryPage.contains(e.relatedTarget)) {
            dropzone.classList.remove('active');
        }
    });
    libraryPage.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('active');
    });
}

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', (e) => {
    // Escape closes dialogs and menus
    if (e.key === 'Escape') {
        document.querySelectorAll('.dialog-overlay.active').forEach(d => d.classList.remove('active'));
        hideAllMenus();
        if (currentMode === 'settings') exitSettings();
    }
});

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
    initLibrary();
});
