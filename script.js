// Enregistrement du Service Worker si disponible
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker enregistré:', reg))
            .catch(err => console.error('Erreur Service Worker:', err));
    });
}
const firebaseConfig = {
    apiKey: "AIzaSyCJl5s3bNsq41U_9_ezkeVop1dtVHGmHmo", // VOTRE CLÉ API - ATTENTION SÉCURITÉ
    authDomain: "easynote-cb18f.firebaseapp.com",
    projectId: "easynote-cb18f",
    storageBucket: "easynote-cb18f.firebasestorage.app",
    messagingSenderId: "953585370046",
    appId: "1:953585370046:web:276aba3f9decaeb986afef"
};

// Initialiser Firebase
let firebaseApp;
let db;
let firestoreReady = false; // Pour savoir si Firestore est prêt

try {
    firebaseApp = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    firestoreReady = true;
    console.log("Firebase Firestore initialisé.");
    // Activez la persistance hors ligne (optionnel mais recommandé)
    db.enablePersistence()
      .catch((err) => {
          if (err.code == 'failed-precondition') {
              // Probablement plusieurs onglets ouverts, persistence déjà activée.
              console.warn("Persistance Firestore: échec précondition (probablement déjà actif dans un autre onglet).");
          } else if (err.code == 'unimplemented') {
              // Le navigateur ne supporte pas la persistance.
              console.warn("Persistance Firestore: non supportée par ce navigateur.");
          }
      });
} catch (error) {
    console.error("Erreur lors de l'initialisation de Firebase:", error);
    // L'application continuera avec localStorage uniquement si Firebase échoue
}

// Nom de la collection Firestore (puisqu'il n'y a pas d'utilisateurs)
const FOLDERS_COLLECTION = 'notes_sans_auth'; // Changez si vous voulez

// Fonction pour synchroniser les données de Firestore vers localStorage au démarrage
async function syncFirestoreToLocal() {
    if (!firestoreReady) return;
    console.log("Tentative de synchronisation Firestore -> LocalStorage...");
    try {
        const snapshot = await db.collection(FOLDERS_COLLECTION).get();
        if (snapshot.empty) {
            console.log("Firestore est vide ou non accessible. Utilisation de LocalStorage seul (ou push initial si LS a du contenu).");
            // Si Firestore est vide mais localStorage a des données, on pourrait faire un push initial
            const localData = localStorage.getItem('data');
            if (localData) {
                 console.log("Firestore vide, push des données locales vers Firestore...");
                 const dataObj = JSON.parse(localData);
                 await saveAllDataToFirestore(dataObj); // Voir la fonction ci-dessous
            }
            return;
        }

        const firestoreFolders = [];
        snapshot.forEach(doc => {
            // Important: Récupérer l'ID du document (nom du dossier) et les données
            const folderData = doc.data();
            firestoreFolders.push({
                name: doc.id, // Le nom du dossier est l'ID du document
                files: folderData.files || [] // Assurez-vous que files existe
            });
        });

        const firestoreData = { folders: firestoreFolders };
        console.log("Données récupérées de Firestore:", firestoreData);

        // Remplacer les données locales par celles de Firestore
        // ATTENTION: Ceci écrase les données locales non synchronisées !
        // Une stratégie de fusion plus complexe serait nécessaire pour éviter cela.
        localStorage.setItem('data', JSON.stringify(firestoreData));
        console.log("LocalStorage mis à jour avec les données de Firestore.");

        // Recharger la liste des fichiers et potentiellement le fichier ouvert
        loadFileList();
        const lastFile = JSON.parse(localStorage.getItem('lastFile'));
        if (lastFile && lastFile.folder && lastFile.file) {
            // Vérifier si le fichier existe toujours après la synchro
            const folderExists = firestoreData.folders.some(f => f.name === lastFile.folder);
            if (folderExists) {
                 const fileExists = firestoreData.folders.find(f => f.name === lastFile.folder)
                                     .files.some(fl => fl.name === lastFile.file);
                 if (fileExists) {
                     loadFile(lastFile.folder, lastFile.file);
                 } else {
                    console.log("Le dernier fichier ouvert n'existe plus après synchro Firestore. Affichage initial.");
                    currentFolder = null;
                    currentFile = null;
                    localStorage.removeItem('lastFile');
                    quill.setText('Aucun fichier. Créez-en un nouveau.');
                 }
            } else {
                 console.log("Le dossier du dernier fichier ouvert n'existe plus après synchro Firestore. Affichage initial.");
                 currentFolder = null;
                 currentFile = null;
                 localStorage.removeItem('lastFile');
                 quill.setText('Aucun fichier. Créez-en un nouveau.');
            }

        } else {
             quill.setText('Aucun fichier. Créez-en un nouveau.');
        }


    } catch (error) {
        console.error("Erreur lors de la synchronisation Firestore -> Local:", error);
        // En cas d'erreur, on continue avec les données locales actuelles.
        // Vous pourriez afficher un message à l'utilisateur ici.
        alert("Erreur de synchronisation avec la base de données en ligne. Travail en mode local uniquement.");
    }
}

// Fonction pour sauvegarder toutes les données (objet JS) dans Firestore
// Utile pour le push initial ou une sauvegarde complète
async function saveAllDataToFirestore(dataObject) {
    if (!firestoreReady) return;
    console.log("Sauvegarde complète vers Firestore...");
    try {
        const batch = db.batch();
        // Supprimer d'abord les anciens dossiers (ou fusionner plus intelligemment) - Suppression simple ici
        const existingSnapshot = await db.collection(FOLDERS_COLLECTION).get();
        existingSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        // Ajouter les nouveaux dossiers
        dataObject.folders.forEach(folder => {
            const folderRef = db.collection(FOLDERS_COLLECTION).doc(folder.name);
            // On ne stocke que le tableau 'files' dans le document, le nom est l'ID
            batch.set(folderRef, { files: folder.files || [] });
        });

        await batch.commit();
        console.log("Sauvegarde complète vers Firestore réussie.");
    } catch (error) {
        console.error("Erreur lors de la sauvegarde complète vers Firestore:", error);
    }
}

// Fonction pour sauvegarder UN fichier spécifique dans Firestore
async function saveFileToFirestore(folderName, fileName, fileContentDelta) {
    if (!firestoreReady || !folderName || !fileName) return;
    console.log(`Sauvegarde Firestore: ${folderName}/${fileName}`);
    try {
        const folderRef = db.collection(FOLDERS_COLLECTION).doc(folderName);
        const folderDoc = await folderRef.get();

        if (!folderDoc.exists) {
            console.warn("Firestore: Tentative de sauvegarde dans un dossier inexistant:", folderName);
            // On pourrait le créer ici si nécessaire
            await folderRef.set({ files: [{ name: fileName, content: fileContentDelta }] });
            console.log("Firestore: Dossier créé:", folderName);
        } else {
            const data = folderDoc.data();
            let files = data.files || [];
            const fileIndex = files.findIndex(f => f.name === fileName);

            if (fileIndex !== -1) {
                // Mettre à jour le fichier existant
                files[fileIndex].content = fileContentDelta;
            } else {
                // Ajouter le nouveau fichier
                files.push({ name: fileName, content: fileContentDelta });
            }
            // Mettre à jour le tableau 'files' dans le document du dossier
            await folderRef.update({ files: files });
        }
        console.log(`Firestore: Fichier ${folderName}/${fileName} sauvegardé.`);
    } catch (error) {
        console.error(`Erreur sauvegarde Firestore ${folderName}/${fileName}:`, error);
        // Peut-être notifier l'utilisateur que la synchro cloud a échoué
        updateSaveIndicator('Erreur Cloud', 'fas fa-cloud-times', ['error']); // Vous devrez ajouter le style CSS pour 'error'
    }
}

// Fonction pour supprimer UN fichier spécifique dans Firestore
async function deleteFileFromFirestore(folderName, fileName) {
    if (!firestoreReady || !folderName || !fileName) return;
    console.log(`Suppression Firestore: ${folderName}/${fileName}`);
    try {
        const folderRef = db.collection(FOLDERS_COLLECTION).doc(folderName);
        const folderDoc = await folderRef.get();

        if (folderDoc.exists) {
            let files = folderDoc.data().files || [];
            const updatedFiles = files.filter(f => f.name !== fileName);
            // Mettre à jour le tableau 'files'
            await folderRef.update({ files: updatedFiles });
            console.log(`Firestore: Fichier ${folderName}/${fileName} supprimé.`);
        } else {
             console.warn("Firestore: Tentative de suppression dans un dossier inexistant:", folderName);
        }
    } catch (error) {
        console.error(`Erreur suppression Firestore ${folderName}/${fileName}:`, error);
    }
}

// Fonction pour créer un dossier vide dans Firestore
async function createFolderInFirestore(folderName) {
    if (!firestoreReady || !folderName) return;
    console.log("Création dossier Firestore:", folderName);
    try {
        const folderRef = db.collection(FOLDERS_COLLECTION).doc(folderName);
        // Utiliser set avec merge: true est plus sûr s'il existe déjà par accident
        await folderRef.set({ files: [] }, { merge: true });
        console.log("Firestore: Dossier créé:", folderName);
    } catch (error) {
        console.error("Erreur création dossier Firestore:", error);
    }
}

// Fonction pour renommer un fichier dans Firestore
async function renameFileInFirestore(folderName, oldFileName, newFileName) {
     if (!firestoreReady || !folderName || !oldFileName || !newFileName) return;
     console.log(`Renommage Firestore: ${folderName}/${oldFileName} -> ${newFileName}`);
    try {
        const folderRef = db.collection(FOLDERS_COLLECTION).doc(folderName);
        const folderDoc = await folderRef.get();

        if (folderDoc.exists) {
            let files = folderDoc.data().files || [];
            const fileIndex = files.findIndex(f => f.name === oldFileName);
            if (fileIndex !== -1) {
                 files[fileIndex].name = newFileName;
                 await folderRef.update({ files: files });
                 console.log(`Firestore: Fichier ${folderName}/${oldFileName} renommé en ${newFileName}.`);
            } else {
                 console.warn(`Firestore: Fichier à renommer non trouvé: ${folderName}/${oldFileName}`);
            }
        } else {
             console.warn("Firestore: Tentative de renommage dans un dossier inexistant:", folderName);
        }
    } catch (error) {
         console.error(`Erreur renommage Firestore ${folderName}/${oldFileName}:`, error);
    }
}

// Fonction pour supprimer un dossier dans Firestore
async function deleteFolderFromFirestore(folderName) {
     if (!firestoreReady || !folderName) return;
     console.log("Suppression dossier Firestore:", folderName);
     try {
        const folderRef = db.collection(FOLDERS_COLLECTION).doc(folderName);
        await folderRef.delete();
        console.log("Firestore: Dossier supprimé:", folderName);
     } catch (error) {
         console.error("Erreur suppression dossier Firestore:", error);
     }
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
async function deleteFile() { // Rendre async
    if (!currentFolder || !currentFile) return alert("Sélectionnez un fichier à supprimer.");
    if (!confirm(`Supprimer "${currentFile}" du dossier "${currentFolder}" ?`)) return;


    const data = JSON.parse(localStorage.getItem('data')) || { folders: [] };
    const folderIndex = data.folders.findIndex(f => f.name === currentFolder);


    if (folderIndex !== -1) {
        const originalLength = data.folders[folderIndex].files.length;
        data.folders[folderIndex].files = data.folders[folderIndex].files.filter(file => file.name !== currentFile);


        // Vérifier si un fichier a bien été supprimé localement
        if (data.folders[folderIndex].files.length < originalLength) {
             localStorage.setItem('data', JSON.stringify(data));


             // -- Firestore --
             if (firestoreReady) {
                 await deleteFileFromFirestore(currentFolder, currentFile);
             }
             // -- Fin Firestore --


             // Si le dossier devient vide après suppression, on pourrait le supprimer aussi ?
             // Optionnel: Supprimer le dossier s'il est vide
             // if (data.folders[folderIndex].files.length === 0) {
             //    if (confirm(`Le dossier "${currentFolder}" est maintenant vide. Le supprimer aussi ?`)) {
             //        const folderNameToDelete = currentFolder; // Sauvegarde avant de réinitialiser
             //        data.folders.splice(folderIndex, 1);
             //        localStorage.setItem('data', JSON.stringify(data));
             //        if (firestoreReady) {
             //            await deleteFolderFromFirestore(folderNameToDelete);
             //        }
             //    }
             // }


             const deletedFileName = currentFile; // Garder en mémoire avant reset
             currentFolder = null;
             currentFile = null;
             localStorage.removeItem('lastFile');
             quill.setText('');
             loadFileList();
             updateSaveIndicator('', '', []);
             console.log(`Fichier local "${deletedFileName}" supprimé.`);


        } else {
             console.warn("deleteFile: Fichier local non trouvé, suppression annulée.");
             alert("Le fichier n'a pas été trouvé dans les données locales.");
        }
    } else {
        console.warn("deleteFile: Dossier local non trouvé, suppression annulée.");
        alert("Le dossier du fichier n'a pas été trouvé dans les données locales.");
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
async function renameFile(folderName, oldFileName) { // Rendre async
    const newFileName = prompt("Entrez le nouveau nom du fichier :", oldFileName);
    if (!newFileName || newFileName.trim() === '' || newFileName.trim() === oldFileName) return;


    const trimmedNewName = newFileName.trim();
    const data = JSON.parse(localStorage.getItem('data')) || { folders: [] };
    const folder = data.folders.find(f => f.name === folderName);


    if (!folder) return;


    // Vérifier si le nouveau nom existe déjà
    if (folder.files.some(file => file.name === trimmedNewName)) {
        alert("Ce nom est déjà utilisé dans ce dossier.");
        return;
    }


    const fileIndex = folder.files.findIndex(file => file.name === oldFileName);
    if (fileIndex !== -1) {
        folder.files[fileIndex].name = trimmedNewName;
        localStorage.setItem('data', JSON.stringify(data));


        // -- Firestore --
        if (firestoreReady) {
            await renameFileInFirestore(folderName, oldFileName, trimmedNewName);
        }
        // -- Fin Firestore --


        // Mettre à jour l'état actuel si le fichier renommé était ouvert
        if (currentFile === oldFileName && currentFolder === folderName) {
            currentFile = trimmedNewName;
            localStorage.setItem('lastFile', JSON.stringify({ folder: currentFolder, file: currentFile }));
        }
        loadFileList(); // Rafraîchir la liste
    } else {
         console.warn(`renameFile: Fichier local à renommer non trouvé: ${folderName}/${oldFileName}`);
         alert("Fichier local à renommer non trouvé.");
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
quill.on('text-change', (delta, oldDelta, source) => { // Ajouter les paramètres delta, oldDelta, source
     if (source !== 'user') return; // Ne sauvegarder que les changements utilisateur
     if (!currentFolder || !currentFile) {
         updateSaveIndicator('', '', []); // Pas de fichier ouvert
         return;
     }


     updateSaveIndicator('Modifié', 'fas fa-pencil-alt', ['saving']); // Indiquer 'Modifié' plutôt que 'En cours' immédiatement
     if (saveTimeout) clearTimeout(saveTimeout);


     saveTimeout = setTimeout(async () => { // Rendre le callback async
         updateSaveIndicator('Sauvegarde...', 'fas fa-spinner', ['saving']); // Maintenant indiquer 'Sauvegarde...'
         const data = JSON.parse(localStorage.getItem('data')) || { folders: [] };
         const folder = data.folders.find(f => f.name === currentFolder);


         if (folder) {
             const fileIndex = folder.files.findIndex(f => f.name === currentFile);
             if (fileIndex !== -1) {
                 const deltaContent = JSON.stringify(quill.getContents());
                 folder.files[fileIndex].content = deltaContent;


                 try {
                     // Sauvegarde Locale
                     localStorage.setItem('data', JSON.stringify(data));


                     // Sauvegarde Firestore (asynchrone)
                     if (firestoreReady) {
                          // Utiliser await pour s'assurer que la sauvegarde Firestore est tentée
                          await saveFileToFirestore(currentFolder, currentFile, deltaContent);
                          // L'indicateur 'Sauvegardé' ne reflètera que le succès local + tentative cloud
                          // La fonction saveFileToFirestore gère son propre log d'erreur/succès cloud
                     }


                     updateSaveIndicator('Sauvegardé', 'fas fa-check', ['saved']);
                 } catch (error) {
                     if (error.name === 'QuotaExceededError') {
                         alert("Erreur : La limite de stockage de localStorage est atteinte. Essayez de vider le cache ou de supprimer des fichiers.");
                         updateSaveIndicator('Erreur Locale', 'fas fa-exclamation-triangle', ['error']);
                     } else {
                          console.error("Erreur sauvegarde locale:", error);
                          updateSaveIndicator('Erreur Locale', 'fas fa-exclamation-triangle', ['error']);
                     }
                 }
             } else {
                  console.warn("Sauvegarde auto: Fichier non trouvé dans dossier local", currentFolder, currentFile);
                  updateSaveIndicator('Erreur', 'fas fa-exclamation-triangle', ['error']);
             }
         } else {
             console.warn("Sauvegarde auto: Dossier non trouvé localement", currentFolder);
             updateSaveIndicator('Erreur', 'fas fa-exclamation-triangle', ['error']);
         }
     }, 1500); // Augmenter légèrement le délai pour ne pas surcharger Firestore
});
async function forceSyncToFirestore() {
    if (!firestoreReady) return alert("La connexion à la base de données en ligne n'est pas active.");
    if (!confirm("Forcer la sauvegarde de toutes les données locales vers le Cloud ?\nAttention: Ceci peut écraser des changements non synchronisés faits sur d'autres appareils.")) return;


    const localDataString = localStorage.getItem('data');
    if (!localDataString) return alert("Aucune donnée locale à synchroniser.");


    try {
        const localDataObject = JSON.parse(localDataString);
        updateSaveIndicator('Synchro Cloud...', 'fas fa-cloud-upload-alt', ['saving']);
        await saveAllDataToFirestore(localDataObject);
        updateSaveIndicator('Synchro OK', 'fas fa-cloud-check', ['saved']); // Nouvelle icône/style à créer
    } catch (error) {
        console.error("Erreur forçage synchro Firestore:", error);
        alert("Erreur lors de la synchronisation vers le Cloud.");
        updateSaveIndicator('Erreur Cloud', 'fas fa-cloud-times', ['error']);
    }
}

// Initialisation au chargement de la page
window.onload = async () => { // Rendre la fonction async
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        document.getElementById('themeIcon').classList.replace('fa-moon', 'fa-sun');
    }

    // Charger depuis localStorage D'ABORD pour affichage rapide
    loadFileList();
    const lastFile = JSON.parse(localStorage.getItem('lastFile'));
     if (lastFile && lastFile.folder && lastFile.file) {
        // Vérification initiale rapide si les données existent dans localStorage
        const data = JSON.parse(localStorage.getItem('data')) || { folders: [] };
        const folder = data.folders.find(f => f.name === lastFile.folder);
        if (folder && folder.files.some(f => f.name === lastFile.file)) {
            loadFile(lastFile.folder, lastFile.file); // loadFile lit depuis localStorage
        } else {
            quill.setText('Aucun fichier. Créez-en un nouveau.');
        }
    } else {
        quill.setText('Aucun fichier. Créez-en un nouveau.');
    }


    // ENSUITE, synchroniser depuis Firestore (peut mettre à jour l'UI)
    if (firestoreReady) {
        await syncFirestoreToLocal(); // Attend la fin de la synchro initiale
    } else {
        console.warn("Firestore non prêt, travail en mode local uniquement.");
    }


    // Ajouter le bouton "Nouveau dossier" (votre code existant)
    const newFolderButton = document.createElement('button');
    newFolderButton.innerHTML = '<i class="fas fa-folder-plus"></i>';
    newFolderButton.title = "Nouveau dossier";
    newFolderButton.onclick = () => openModal('folder'); // Changé pour utiliser openModal
    document.querySelector('.sidebar-actions').appendChild(newFolderButton);


    // Gérer la soumission du formulaire du modal (votre code existant)
    const createForm = document.getElementById('createForm');
    createForm.addEventListener('submit', async (e) => { // Rendre async
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
            // -- Firestore --
            if (firestoreReady) {
                await createFolderInFirestore(nameInput); // Créer aussi dans Firestore
            }
            // -- Fin Firestore --
            loadFileList();
        } else if (modalMode === 'file') {
            const folderName = document.getElementById('folderSelect').value;
            const folder = data.folders.find(f => f.name === folderName);
            if (!folder) {
                alert("Dossier sélectionné non valide."); // Sécurité
                return;
            }
            if (folder.files.some(file => file.name === nameInput)) {
                alert("Ce nom de fichier est déjà utilisé dans ce dossier.");
                return;
            }
            const newFileContent = JSON.stringify(quill.getContents()); // Contenu initial vide (delta)
            folder.files.push({ name: nameInput, content: newFileContent });
            localStorage.setItem('data', JSON.stringify(data));
            // -- Firestore --
             if (firestoreReady) {
                 // Sauvegarde le nouveau fichier (vide) dans Firestore aussi
                 await saveFileToFirestore(folderName, nameInput, newFileContent);
             }
            // -- Fin Firestore --
            currentFolder = folderName;
            currentFile = nameInput;
            localStorage.setItem('lastFile', JSON.stringify({ folder: currentFolder, file: currentFile }));
            quill.setContents(JSON.parse(newFileContent)); // Charger le contenu vide
            loadFileList();
            updateSaveIndicator('Prêt', 'fas fa-check', ['saved']); // Indiquer prêt
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
