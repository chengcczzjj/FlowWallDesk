/* ============================================================
   FlowWallDesk UI Prototype — Application Logic
   ============================================================ */

// ---- Sample Wallpaper Data ----
const wallpapers = [
    { id: 1, title: '3D视差', type: 'web', image: '../assets/wallpapers/defaults/3D视差/assets/images/thumbnail.webp', isDesktop: true },
    { id: 2, title: '交错战线', type: 'picture', image: '../assets/wallpapers/defaults/交错战线/交错战线.png' },
    { id: 3, title: '棕色尘埃2', type: 'picture', image: '../assets/wallpapers/defaults/棕色尘埃2/棕色尘埃2.png' },
    { id: 4, title: '碧蓝航线', type: 'picture', image: '../assets/wallpapers/defaults/碧蓝航线/碧蓝航线.png' },
    { id: 5, title: '龙魂旅人', type: 'picture', image: '../assets/wallpapers/defaults/龙魂旅人/龙魂旅人.png' },
    { id: 6, title: '少女前线2', type: 'video', image: null },
    { id: 7, title: '尘白禁区', type: 'picture', image: null },
    { id: 8, title: '崩坏星穹铁道', type: 'web', image: null },
    { id: 9, title: '明日方舟', type: 'video', image: null },
    { id: 10, title: '鸣潮', type: 'picture', image: null },
];

// ---- Premium Fluent SVG Placeholders by type ----
const createFluentPlaceholder = (type) => {
    // Generate distinct Windows 11 style color and component themes
    const themes = {
        picture: { bg1: '#E8F0FE', bg2: '#F0F4F9', stroke: '#005FB8', fill: 'rgba(0, 95, 184, 0.1)', shadow: 'rgba(0, 95, 184, 0.2)', label: '图片', icon: 'M 0 92 Q 32 52, 64 84 T 128 68 L 128 108 L 0 108 Z' },
        video: { bg1: '#FDE7E9', bg2: '#FFF2F3', stroke: '#C42B1C', fill: 'rgba(196, 43, 28, 0.1)', shadow: 'rgba(196, 43, 28, 0.2)', label: '视频', icon: 'M 52 44 L 88 64 L 52 84 Z' },
        web: { bg1: '#DFF6DD', bg2: '#F0F9EE', stroke: '#107C10', fill: 'rgba(16, 124, 16, 0.1)', shadow: 'rgba(16, 124, 16, 0.2)', label: '网页', icon: 'M 20 46 L 108 46 M 20 66 L 108 66 M 20 26 L 108 26' },
        app: { bg1: '#FEF0F9', bg2: '#F4F0F9', stroke: '#9A0089', fill: 'rgba(154, 0, 137, 0.1)', shadow: 'rgba(154, 0, 137, 0.2)', label: '应用', icon: 'M 32 32 h 28 v 28 h -28 Z M 68 32 h 28 v 28 h -28 Z M 32 68 h 28 v 28 h -28 Z M 68 68 h 28 v 28 h -28 Z' }
    };
    const t = themes[type] || themes.picture;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
        <defs>
            <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${t.bg1}" />
                <stop offset="100%" stop-color="${t.bg2}" />
            </linearGradient>
            <filter id="blurFilter">
                <feGaussianBlur stdDeviation="40"/>
            </filter>
            <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="${t.shadow}" flood-opacity="0.4"/>
            </filter>
            <filter id="iconShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="${t.stroke}" flood-opacity="0.3"/>
            </filter>
            <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="rgba(255,255,255,0.9)" />
                <stop offset="100%" stop-color="rgba(255,255,255,0.5)" />
            </linearGradient>
            <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="rgba(255,255,255,1)" />
                <stop offset="100%" stop-color="rgba(255,255,255,0.2)" />
            </linearGradient>
        </defs>

        <!-- Base Background -->
        <rect width="400" height="400" fill="url(#bgGrad)" />

        <!-- Fluid/Mica ambient blobs -->
        <circle cx="80" cy="80" r="160" fill="#ffffff" opacity="0.8" filter="url(#blurFilter)"/>
        <circle cx="320" cy="320" r="180" fill="${t.bg1}" opacity="0.9" filter="url(#blurFilter)"/>
        <circle cx="100" cy="300" r="140" fill="${t.fill}" opacity="0.6" filter="url(#blurFilter)"/>

        <!-- Central Component Card (Representing the UI component) -->
        <g transform="translate(100, 100)" filter="url(#cardShadow)">
            <!-- Card Body with Acrylic effect -->
            <rect x="0" y="0" width="200" height="200" rx="24" fill="url(#cardGrad)"/>
            <!-- Inner highlight border -->
            <rect x="1" y="1" width="198" height="198" rx="23" fill="none" stroke="url(#borderGrad)" stroke-width="1.5"/>

            <!-- Type specific badge/header inside the card -->
            <rect x="24" y="24" width="48" height="16" rx="8" fill="${t.fill}" />
            <text x="48" y="35" font-family="Segoe UI, sans-serif" font-size="10" font-weight="600" fill="${t.stroke}" text-anchor="middle">${t.label}</text>

            <!-- Decorative UI elements mimicking a functional square component -->
            <rect x="24" y="152" width="152" height="12" rx="6" fill="rgba(0,0,0,0.04)" />
            <rect x="24" y="172" width="100" height="8" rx="4" fill="rgba(0,0,0,0.03)" />

            <!-- Type Icon Container -->
            <g transform="translate(36, 40)" filter="url(#iconShadow)">
                
                ${type === 'picture' ? `
                    <circle cx="44" cy="40" r="14" fill="${t.stroke}" opacity="0.8"/>
                    <path d="${t.icon}" fill="${t.stroke}" opacity="0.6"/>
                    <path d="M 0 100 L 128 100" stroke="${t.stroke}" stroke-width="4"/>
                ` : type === 'video' ? `
                    <circle cx="64" cy="50" r="32" fill="${t.fill}" stroke="${t.stroke}" stroke-width="2"/>
                    <path d="${t.icon}" fill="${t.stroke}"/>
                ` : type === 'web' ? `
                    <rect x="0" y="0" width="128" height="24" rx="8" fill="${t.fill}" />
                    <circle cx="16" cy="12" r="4" fill="${t.stroke}" opacity="0.8"/>
                    <circle cx="32" cy="12" r="4" fill="${t.stroke}" opacity="0.8"/>
                    <circle cx="48" cy="12" r="4" fill="${t.stroke}" opacity="0.8"/>
                    <path d="${t.icon}" stroke="${t.stroke}" stroke-width="4" stroke-linecap="round" opacity="0.5"/>
                ` : `
                    <path d="${t.icon}" fill="${t.stroke}" opacity="0.8"/>
                `}
            </g>
        </g>
    </svg>`;

    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
};

const placeholders = {
    picture: createFluentPlaceholder('picture'),
    video: createFluentPlaceholder('video'),
    web: createFluentPlaceholder('web'),
    app: createFluentPlaceholder('app'),
};

// ---- Initialize Library Grid ----
function initLibrary() {
    const grid = document.getElementById('libraryGrid');
    grid.innerHTML = '';

    wallpapers.forEach((wp, index) => {
        const card = document.createElement('div');
        card.className = 'wallpaper-card';
        card.style.animationDelay = `${Math.min(index * 0.05, 0.5)}s`;
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
            openSidebar(wp);
        });

        grid.appendChild(card);
    });

    // Default select active or first wallpaper
    setTimeout(() => {
        let activeWp = wallpapers.find(w => w.isDesktop) || wallpapers[0];
        const cardToSelect = grid.querySelector(`[data-id="${activeWp.id}"]`);
        if (cardToSelect) {
            document.querySelectorAll('.wallpaper-card.selected').forEach(c => c.classList.remove('selected'));
            cardToSelect.classList.add('selected');
            openSidebar(activeWp);
        }
    }, 100);
}

// ---- Sidebar Management ----
function openSidebar(wp) {
    const sidebar = document.getElementById('wallpaperSidebar');
    const content = document.getElementById('libraryContent');
    const bgLayer = document.getElementById('libraryBackground');
    const bgImage = document.getElementById('libraryBgImage');

    // Fill data
    const imgSrc = wp.image || placeholders[wp.type] || placeholders.video;
    document.getElementById('sidebarCover').src = imgSrc;
    document.getElementById('sidebarCover').style.display = wp.image === 'placeholder' ? 'none' : 'block';

    // Apply Background Thumbnail Logic
    bgImage.src = imgSrc;

    if (wp.type === 'app') {
        bgLayer.className = 'library-bg-layer mode-icon';
    } else {
        bgLayer.className = 'library-bg-layer';
    }
    bgLayer.style.opacity = '1';

    document.getElementById('sidebarTitle').textContent = wp.title;

    // Convert type to friendly name
    const typeNames = {
        'video': '视频',
        'web': '网页',
        'app': '应用程序',
        'picture': '图片'
    };
    document.getElementById('sidebarType').textContent = typeNames[wp.type] || wp.type;

    // Show/Hide specific settings based on type
    const speedCard = document.getElementById('sidebarSpeedCard');
    const volumeCard = document.getElementById('sidebarVolumeCard');

    if (wp.type === 'video' || wp.type === 'app' || wp.type === 'web') {
        volumeCard.style.display = 'flex';
    } else {
        volumeCard.style.display = 'none';
    }

    if (wp.type === 'video') {
        speedCard.style.display = 'flex';
    } else {
        speedCard.style.display = 'none';
    }

    // Shrink content to make room for sidebar
    content.style.marginRight = '320px';
    content.style.transition = 'margin-right 0.4s cubic-bezier(0.1, 0.9, 0.2, 1)';

    sidebar.classList.add('open');
}

function closeSidebar() {
    const sidebar = document.getElementById('wallpaperSidebar');
    const content = document.getElementById('libraryContent');
    const bgLayer = document.getElementById('libraryBackground');

    sidebar.classList.remove('open');
    content.style.marginRight = '0px';
    bgLayer.style.opacity = '0';

    // Deselect all
    document.querySelectorAll('.wallpaper-card.selected').forEach(c => c.classList.remove('selected'));
}

function resetSidebarSettings() {
    if (confirm("是否将当前壁纸的设置恢复为默认值？")) {
        // 重置颜色
        const colorInput = document.querySelector('.color-picker-input');
        if (colorInput) colorInput.value = '#005FB8';

        // 重置滑块
        const sliders = document.querySelectorAll('#wallpaperSidebar .slider');
        sliders.forEach(slider => {
            let defaultVal = slider.id === 'sidebarVolume' || slider.max == '100' ? 50 : 1.0;
            slider.value = defaultVal;
            const valDisplay = slider.parentElement.querySelector('.slider__value');
            if (valDisplay) {
                valDisplay.textContent = defaultVal + (defaultVal > 5 ? '%' : 'x');
            }
        });

        // 重置下拉框
        const selects = document.querySelectorAll('#wallpaperSidebar select.combo-box');
        selects.forEach(select => {
            select.selectedIndex = 0;
        });

        alert("已恢复默认设置！");
    }
}

// ---- Navigation ----
let currentMode = 'main'; // 'main' | 'settings'
let currentPage = 'library';

function switchNav(navId) {
    const topNav = document.querySelector('.top-nav');
    if (navId === 'library') {
        topNav.style.display = '';
        document.getElementById('navMain').classList.remove('hidden');
    } else if (navId === 'none') {
        topNav.style.display = 'none';
        document.getElementById('navMain').classList.add('hidden');
    }
}

function switchPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // Show target page
    const target = document.getElementById('page-' + pageId);
    if (target) {
        target.classList.add('active');

        if (pageId === 'components' && typeof initComponentsUI === 'function') {
            initComponentsUI();
        }

        // 为设置页的子元素附加错开淡入加载的 WinUI 原生风过渡
        if (pageId.startsWith('settings-')) {
            let delay = 0.05;
            target.querySelectorAll('.settings-group__header, .settings-card, .settings-expander').forEach((el) => {
                el.style.animation = 'none';
                void el.offsetHeight; // trigger reflow
                el.style.animation = `staggeredEntrance 0.4s cubic-bezier(0.1, 0.9, 0.2, 1) ${delay}s both`;
                delay += 0.05; // 每一项依次错后 50ms
            });
        }
    }

    // Update nav item active state
    let navContainer = '#navMain';
    if (currentMode === 'settings') {
        navContainer = '#navSettings';
    } else if (pageId === 'components') {
        navContainer = '#navComponents';
    }

    document.querySelectorAll(navContainer + ' .nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-page') === pageId);
    });

    // Update activity bar active state
    if (pageId === 'library' || pageId === 'components') {
        document.querySelectorAll('.activity-bar__item').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(`'${pageId}'`));
        });
    }

    currentPage = pageId;
}

function enterSettings() {
    currentMode = 'settings';
    const shell = document.getElementById('appShell');
    shell.classList.add('settings-mode');

    document.querySelector('.top-nav').style.display = '';
    document.getElementById('navMain').classList.add('hidden');
    document.getElementById('navComponents')?.classList.add('hidden');
    document.getElementById('navSettings').classList.remove('hidden');
    document.getElementById('navFooter').style.display = 'none';

    // Store previous page to go back to
    window.previousPage = currentPage;

    switchPage('settings-general');
}

function exitSettings() {
    currentMode = 'main';
    const shell = document.getElementById('appShell');
    shell.classList.remove('settings-mode');

    document.getElementById('navSettings').classList.add('hidden');

    // Resume nav based on previous page
    let backPage = window.previousPage || 'library';
    if (backPage === 'components') {
        document.querySelector('.top-nav').style.display = 'none';
        document.getElementById('navComponents')?.classList.remove('hidden');
    } else {
        document.querySelector('.top-nav').style.display = '';
        document.getElementById('navMain').classList.remove('hidden');
        backPage = 'library';
    }

    document.getElementById('navFooter').style.display = '';

    switchPage(backPage);
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
    // Position menu to the right of the activity bar button
    menu.style.left = (rect.right + 8) + 'px';
    menu.style.bottom = (window.innerHeight - rect.bottom) + 'px';
    menu.style.top = 'auto';
    menu.style.right = 'auto';
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
