// Enregistrement du Service Worker si disponible
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker enregistré:', reg))
            .catch(err => console.error('Erreur Service Worker:', err));
    });
}

// Configuration de marked pour le rendu Markdown
marked.setOptions({ breaks: true, sanitize: false, sanitizer: null });

// Initialisation de l'éditeur Quill
const quill = new Quill('#editor', {
    theme: 'snow',
    modules: {
        toolbar: [
            ['bold', 'italic', 'underline'],
            [{ 'header': 1 }, { 'header': 2 }, { 'header': 3 }],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            [{ 'align': '' }, { 'align': 'center' }, { 'align': 'right' }, { 'align': 'justify' }],
            [{ 'size': ['small', false, 'large', 'huge'] }],
            [{ 'color': ['#ff0000', '#0000ff', '#008000', '#ffff00', '#800080', '#000000', '#ffffff'] }],
            ['link', 'image'],
            ['emoji', 'date'],
            ['clean']
        ]
    }
});

// Personnalisation de la barre d'outils
const toolbar = quill.getModule('toolbar');

// Bouton Emoji
const emojiButton = document.querySelector('.ql-emoji');
emojiButton.innerHTML = '<i class="fas fa-smile"></i>';
emojiButton.title = "Insérer un emoji";
const emojiMenu = document.createElement('div');
emojiMenu.classList.add('emoji-menu');
const emojis = ['😊', '👍', '😂', '❤️', '🚀', '🌟', '🎉', '👋', '🐱', '🌈'];
emojis.forEach(emoji => {
    const span = document.createElement('span');
    span.textContent = emoji;
    span.addEventListener('click', () => {
        const range = quill.getSelection();
        if (range) {
            quill.insertText(range.index, emoji);
            emojiMenu.classList.remove('show');
        }
    });
    emojiMenu.appendChild(span);
});
emojiButton.appendChild(emojiMenu);

emojiButton.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiMenu.classList.toggle('show');
});

document.addEventListener('click', (e) => {
    if (!emojiButton.contains(e.target)) emojiMenu.classList.remove('show');
});

// Bouton Date
const dateButton = document.querySelector('.ql-date');
dateButton.innerHTML = '<i class="fas fa-calendar"></i>';
dateButton.title = "Insérer la date";
dateButton.addEventListener('click', () => {
    const range = quill.getSelection();
    if (range) {
        const date = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
        quill.insertText(range.index, date);
    }
});

// Bouton Image
const imageButton = document.querySelector('.ql-image');
imageButton.addEventListener('click', () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();
    input.onchange = () => {
        const file = input.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const range = quill.getSelection();
                if (range) quill.insertEmbed(range.index, 'image', e.target.result);
            };
            reader.readAsDataURL(file);
        }
    };
});

// Variables globales pour suivre le dossier et le fichier actuels
let currentFolder = null;
let currentFile = null;

// Variables pour le modal
let modalMode = null; // "folder" ou "file" pour savoir quel type de création est en cours

// Fonction pour ouvrir le modal
function openModal(mode) {
    modalMode = mode;
    const modal = document.getElementById('createModal');
    const modalTitle = document.getElementById('modalTitle');
    const folderSelectGroup = document.getElementById('folderSelectGroup');
    const nameInput = document.getElementById('nameInput');

    // Réinitialiser le formulaire
    nameInput.value = '';

    if (mode === 'folder') {
        modalTitle.textContent = 'Créer un dossier';
        folderSelectGroup.style.display = 'none'; // Cacher le sélecteur de dossier
    } else if (mode === 'file') {
        modalTitle.textContent = 'Créer un fichier';
        folderSelectGroup.style.display = 'block'; // Afficher le sélecteur de dossier

        // Remplir le sélecteur de dossiers
        const folderSelect = document.getElementById('folderSelect');
        folderSelect.innerHTML = '';
        const data = JSON.parse(localStorage.getItem('data')) || { folders: [] };
        if (data.folders.length === 0) {
            alert("Créez d'abord un dossier.");
            return;
        }
        data.folders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.name;
            option.textContent = folder.name;
            folderSelect.appendChild(option);
        });
    }

    modal.classList.add('show'); // Afficher le modal
    nameInput.focus(); // Mettre le focus sur le champ de saisie
}

// Fonction pour fermer le modal
function closeModal() {
    const modal = document.getElementById('createModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modalMode = null;
    }, 300); // Délai pour correspondre à la durée de l'animation
}

// Gestion des notifications hors ligne
const offlineNotification = document.getElementById('offlineNotification');
const offlineMessage = document.getElementById('offlineMessage');

function showOfflineNotification(isOnline) {
    if (isOnline) {
        offlineMessage.textContent = 'Connexion rétablie !';
        offlineNotification.classList.add('online');
        offlineNotification.classList.add('show');
        setTimeout(() => offlineNotification.classList.remove('show'), 3000);
    } else {
        offlineMessage.textContent = 'Vous êtes hors ligne.';
        offlineNotification.classList.remove('online');
        offlineNotification.classList.add('show');
    }
}

window.addEventListener('online', () => showOfflineNotification(true));
window.addEventListener('offline', () => showOfflineNotification(false));
if (!navigator.onLine) showOfflineNotification(false);

// Charger la liste des dossiers et fichiers
function loadFileList() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';
    const data = JSON.parse(localStorage.getItem('data')) || { folders: [] };
    data.folders.forEach(folder => {
        const folderLi = document.createElement('li');
        folderLi.textContent = folder.name;
        folderLi.className = 'folder';
        folderLi.onclick = () => toggleFolder(folder.name);

        const folderUl = document.createElement('ul');
        folderUl.className = 'folder-files';
        folderUl.style.display = (folder.name === currentFolder) ? 'block' : 'none';

        folder.files.forEach(file => {
            const fileLi = document.createElement('li');
            fileLi.textContent = file.name;
            fileLi.className = (file.name === currentFile && folder.name === currentFolder) ? 'active' : '';
            fileLi.onclick = (e) => {
                e.stopPropagation();
                loadFile(folder.name, file.name);
            };

            const renameButton = document.createElement('button');
            renameButton.innerHTML = '<i class="fas fa-pen"></i>';
            renameButton.className = 'rename-btn';
            renameButton.title = "Renommer le fichier";
            renameButton.onclick = (e) => {
                e.stopPropagation();
                renameFile(folder.name, file.name);
            };
            fileLi.appendChild(renameButton);

            folderUl.appendChild(fileLi);
        });

        folderLi.appendChild(folderUl);
        fileList.appendChild(folderLi);
    });
}

// Afficher/masquer les fichiers d'un dossier
function toggleFolder(folderName) {
    const folderUls = document.querySelectorAll('.folder-files');
    folderUls.forEach(ul => {
        const currentFolderName = ul.previousSibling.textContent;
        if (currentFolderName === folderName) {
            ul.style.display = ul.style.display === 'none' ? 'block' : 'none';
        } else {
            if (currentFolderName !== currentFolder) {
                ul.style.display = 'none';
            }
        }
    });
}

// Créer un nouveau fichier
function newFile() {
    const data = JSON.parse(localStorage.getItem('data')) || { folders: [] };
    if (data.folders.length === 0) {
        alert("Créez d'abord un dossier.");
        return;
    }
    openModal('file');
}

// Charger un fichier
function loadFile(folderName, fileName) {
    const data = JSON.parse(localStorage.getItem('data')) || { folders: [] };
    const folder = data.folders.find(f => f.name === folderName);
    if (folder) {
        const file = folder.files.find(f => f.name === fileName);
        if (file) {
            currentFolder = folderName;
            currentFile = fileName;
            localStorage.setItem('lastFile', JSON.stringify({ folder: folderName, file: fileName }));
            quill.setContents(JSON.parse(file.content || '[]'));
            loadFileList();
            updateSaveIndicator('Prêt', 'fas fa-check', ['saved']);
        }
    }
}

// Supprimer un fichier
function deleteFile() {
    if (!currentFolder || !currentFile) return alert("Sélectionnez un fichier à supprimer.");
    if (!confirm(`Supprimer "${currentFile}" du dossier "${currentFolder}" ?`)) return;
    const data = JSON.parse(localStorage.getItem('data')) || { folders: [] };
    const folder = data.folders.find(f => f.name === currentFolder);
    if (folder) {
        folder.files = folder.files.filter(file => file.name !== currentFile);
        localStorage.setItem('data', JSON.stringify(data));
        currentFolder = null;
        currentFile = null;
        localStorage.removeItem('lastFile');
        quill.setText('');
        loadFileList();
        updateSaveIndicator('', '', []);
    }
}

// Sauvegarder un fichier
async function saveFile() {
    if (!currentFolder || !currentFile) return alert("Créez un fichier d'abord.");
    const data = JSON.parse(localStorage.getItem('data')) || { folders: [] };
    const folder = data.folders.find(f => f.name === currentFolder);
    if (folder) {
        const fileIndex = folder.files.findIndex(f => f.name === currentFile);
        if (fileIndex !== -1) {
            const delta = quill.getContents();
            folder.files[fileIndex].content = JSON.stringify(delta);
            localStorage.setItem('data', JSON.stringify(data));
        }
    }
}

function printDocument() {
    if (!currentFolder || !currentFile) {
        alert("Sélectionnez ou créez un fichier d'abord.");
        return;
    }

    // Créer une fenêtre d'impression temporaire
    const printWindow = window.open('', '_blank');
    const editorContent = quill.root.innerHTML; // Récupérer le contenu HTML de l'éditeur
    const date = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

    // Construire le HTML pour l'impression
    const printHtml = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <title>${currentFile}</title>
            <style>
                body {
                    font-family: 'Roboto', sans-serif;
                    margin: 20mm;
                    color: #333;
                }
                h1 {
                    font-size: 24px;
                    color: #1a73e8;
                    margin-bottom: 10px;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid #e0e0e0;
                    padding-bottom: 10px;
                    margin-bottom: 20px;
                }
                .date {
                    font-size: 12px;
                    color: #666;
                }
                .ql-editor {
                    font-size: 14px;
                    line-height: 1.6;
                }
                .ql-editor img {
                    max-width: 100%;
                    height: auto;
                    margin: 10px 0;
                }
                @media print {
                    body {
                        margin: 0;
                    }
                    .header {
                        position: running(header);
                    }
                    @page {
                        margin: 20mm;
                        @top-center {
                            content: element(header);
                        }
                        @bottom-center {
                            content: "Page " counter(page) " sur " counter(pages);
                            font-size: 10px;
                            color: #666;
                        }
                    }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>${currentFile}</h1>
                <span class="date">${date}</span>
            </div>
            <div class="ql-editor">${editorContent}</div>
        </body>
        </html>
    `;

    // Écrire le contenu dans la fenêtre d'impression
    printWindow.document.write(printHtml);
    printWindow.document.close();

    // Attendre que le contenu soit chargé, puis lancer l'impression
    printWindow.onload = function () {
        printWindow.focus();
        printWindow.print();
    };
}

// Créer un nouveau dossier
function newFolder() {
    openModal('folder');
}

// Renommer un fichier
function renameFile(folderName, oldFileName) {
    const newFileName = prompt("Entrez le nouveau nom du fichier :", oldFileName);
    if (!newFileName || newFileName.trim() === '') return;
    const data = JSON.parse(localStorage.getItem('data')) || { folders: [] };
    const folder = data.folders.find(f => f.name === folderName);
    if (!folder) return;
    if (folder.files.some(file => file.name === newFileName.trim())) {
        alert("Ce nom est déjà utilisé dans ce dossier.");
        return;
    }
    const fileIndex = folder.files.findIndex(file => file.name === oldFileName);
    if (fileIndex !== -1) {
        folder.files[fileIndex].name = newFileName.trim();
        localStorage.setItem('data', JSON.stringify(data));
        if (currentFile === oldFileName && currentFolder === folderName) {
            currentFile = newFileName.trim();
            localStorage.setItem('lastFile', JSON.stringify({ folder: currentFolder, file: currentFile }));
        }
        loadFileList();
    }
}

// Sauvegarder au format JSON
async function saveJsonFile() {
    const data = JSON.parse(localStorage.getItem('data')) || { folders: [] };
    if (data.folders.length === 0) return alert("Aucun fichier à sauvegarder.");
    const jsonFileName = `easynote-backup-${new Date().toISOString().slice(0,10)}.json`;
    try {
        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({
                suggestedName: jsonFileName,
                types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            await writable.close();
        } else {
            const link = document.createElement('a');
            link.download = jsonFileName;
            link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            link.click();
        }
    } catch (error) {
        if (error.name !== 'AbortError') alert("Erreur lors de la sauvegarde JSON : " + error.message);
    }
}

// Importer un fichier JSON
function openFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!importedData.folders || !Array.isArray(importedData.folders)) throw new Error("Le JSON doit contenir une propriété 'folders'.");
            localStorage.setItem('data', JSON.stringify(importedData));
            currentFolder = null;
            currentFile = null;
            localStorage.removeItem('lastFile');
            loadFileList();
            quill.setText('Aucun fichier. Créez-en un nouveau.');
        } catch (error) {
            alert("Erreur importation JSON : " + error.message);
        }
    };
    reader.readAsText(file);
}

// Limite typique de localStorage (5 Mo)
const STORAGE_LIMIT_MB = 5;
const WARNING_THRESHOLD = 0.9; // 90% de la limite (4.5 Mo)

function updateSaveIndicator(text, iconClass, classes) {
    const saveIndicator = document.getElementById('saveIndicator');
    const saveText = document.getElementById('saveText');
    const saveIcon = document.getElementById('saveIcon');

    // Calculer la taille de localStorage
    const { charCount, sizeInMB } = getLocalStorageCharCount();

    // Mettre à jour le texte avec le nombre de caractères
    saveText.textContent = `${text} (${charCount} car.)`;
    saveIcon.className = iconClass;
    saveIndicator.classList.remove('saving', 'saved');
    classes.forEach(cls => saveIndicator.classList.add(cls));

    // Vérifier si on approche de la limite
    if (sizeInMB >= STORAGE_LIMIT_MB * WARNING_THRESHOLD) {
        const percentage = ((sizeInMB / STORAGE_LIMIT_MB) * 100).toFixed(1);
        alert(`Attention : localStorage est utilisé à ${percentage}% (${sizeInMB.toFixed(2)} Mo sur ${STORAGE_LIMIT_MB} Mo). Pensez à vider le cache ou à sauvegarder vos données en JSON pour libérer de l'espace.`);
    }
}

// Effacer le localStorage
function clearLocalStorage() {
    if (!confirm("Êtes-vous sûr de vouloir effacer toutes les données ? Cette action est irréversible.")) return;
    localStorage.clear(); // Efface tout le localStorage
    currentFolder = null;
    currentFile = null;
    localStorage.removeItem('lastFile');
    quill.setText('Aucun fichier. Créez-en un nouveau.');
    loadFileList(); // Rafraîchit la liste des fichiers (elle sera vide)
    updateSaveIndicator('', '', []);
}

// Sauvegarde automatique avec debounce
let saveTimeout = null;
quill.on('text-change', () => {
    if (!currentFolder || !currentFile) return updateSaveIndicator('', '', []);
    updateSaveIndicator('En cours...', 'fas fa-spinner', ['saving']);
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        const data = JSON.parse(localStorage.getItem('data')) || { folders: [] };
        const folder = data.folders.find(f => f.name === currentFolder);
        if (folder) {
            const fileIndex = folder.files.findIndex(f => f.name === currentFile);
            if (fileIndex !== -1) {
                const delta = quill.getContents();
                folder.files[fileIndex].content = JSON.stringify(delta);
                try {
                    localStorage.setItem('data', JSON.stringify(data));
                    updateSaveIndicator('Sauvegardé', 'fas fa-check', ['saved']);
                } catch (error) {
                    if (error.name === 'QuotaExceededError') {
                        alert("Erreur : La limite de stockage de localStorage est atteinte. Essayez de vider le cache ou de supprimer des fichiers.");
                    }
                }
            }
        }
    }, 500);
});

// Initialisation au chargement de la page
window.onload = () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        document.getElementById('themeIcon').classList.replace('fa-moon', 'fa-sun');
    }
    loadFileList();
    const lastFile = JSON.parse(localStorage.getItem('lastFile'));
    if (lastFile && lastFile.folder && lastFile.file) {
        const data = JSON.parse(localStorage.getItem('data')) || { folders: [] };
        const folder = data.folders.find(f => f.name === lastFile.folder);
        if (folder && folder.files.some(f => f.name === lastFile.file)) {
            loadFile(lastFile.folder, lastFile.file);
        } else {
            quill.setText('Aucun fichier. Créez-en un nouveau.');
        }
    } else {
        quill.setText('Aucun fichier. Créez-en un nouveau.');
    }

    // Ajouter le bouton "Nouveau dossier" avec une icône
    const newFolderButton = document.createElement('button');
    newFolderButton.innerHTML = '<i class="fas fa-folder-plus"></i>';
    newFolderButton.title = "Nouveau dossier";
    newFolderButton.onclick = newFolder;
    document.querySelector('.sidebar-actions').appendChild(newFolderButton);

    // Gérer la soumission du formulaire du modal
    const createForm = document.getElementById('createForm');
    createForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('nameInput').value.trim();
        if (!nameInput) return;

        const data = JSON.parse(localStorage.getItem('data')) || { folders: [] };

        if (modalMode === 'folder') {
            if (data.folders.some(folder => folder.name === nameInput)) {
                alert("Ce nom de dossier est déjà utilisé.");
                return;
            }
            data.folders.push({ name: nameInput, files: [] });
            localStorage.setItem('data', JSON.stringify(data));
            loadFileList();
        } else if (modalMode === 'file') {
            const folderName = document.getElementById('folderSelect').value;
            const folder = data.folders.find(f => f.name === folderName);
            if (folder.files.some(file => file.name === nameInput)) {
                alert("Ce nom de fichier est déjà utilisé dans ce dossier.");
                return;
            }
            folder.files.push({ name: nameInput, content: '' });
            localStorage.setItem('data', JSON.stringify(data));
            currentFolder = folderName;
            currentFile = nameInput;
            localStorage.setItem('lastFile', JSON.stringify({ folder: currentFolder, file: currentFile }));
            quill.setText('');
            loadFileList();
        }

        closeModal();
    });
};

// Basculer la barre latérale
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// Basculer le thème
function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    const themeIcon = document.getElementById('themeIcon');
    if (isDark) {
        themeIcon.classList.replace('fa-moon', 'fa-sun');
        localStorage.setItem('theme', 'dark');
    } else {
        themeIcon.classList.replace('fa-sun', 'fa-moon');
        localStorage.setItem('theme', 'light');
    }
}

function getLocalStorageCharCount() {
    let totalBytes = 0;
    for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
            totalBytes += ((localStorage[key].length + key.length) * 2); // Taille en octets (UTF-16)
        }
    }
    const charCount = totalBytes / 2; // 1 caractère = 2 octets en UTF-16
    const sizeInMB = totalBytes / (1024 * 1024); // Taille en Mo
    return { charCount: Math.round(charCount), sizeInMB: sizeInMB };
}


// Vider le cache
async function clearCache() {
    if (!confirm("Vider le cache et recharger ?")) return;
    if (currentFolder && currentFile) {
        const data = JSON.parse(localStorage.getItem('data')) || { folders: [] };
        const folder = data.folders.find(f => f.name === currentFolder);
        if (folder) {
            const fileIndex = folder.files.findIndex(f => f.name === currentFile);
            if (fileIndex !== -1) {
                folder.files[fileIndex].content = JSON.stringify(quill.getContents());
                localStorage.setItem('data', JSON.stringify(data));
            }
        }
    }
    if ('caches' in window) await Promise.all((await caches.keys()).map(name => caches.delete(name)));
    if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let reg of registrations) await reg.unregister();
    }
    window.location.reload();
}
