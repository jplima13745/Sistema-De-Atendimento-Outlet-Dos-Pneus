import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, deleteDoc, updateDoc, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- Configuração do Firebase (copiada do sistema principal para modularidade) ---
const firebaseConfig = {
    apiKey: "AIzaSyDleQ5Y1-o7Uoo3zOXKIm35KljdxJuxvWo",
    authDomain: "banco-de-dados-outlet2-0.firebaseapp.com",
    projectId: "banco-de-dados-outlet2-0",
    storageBucket: "banco-de-dados-outlet2-0.firebasestorage.app",
    messagingSenderId: "917605669915",
    appId: "1:917605669915:web:6a9ee233227cfd250bacbe",
    measurementId: "G-5SZ5F2WKXD"
};

const app = initializeApp(firebaseConfig, "marketingApp"); // Nome exclusivo para evitar conflitos
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app); // NOVO: Inicializa o serviço de autenticação

// --- CORREÇÃO: Usar o mesmo padrão de caminho do sistema principal para garantir permissões ---
const isCanvasEnvironment = typeof __app_id !== 'undefined';
const LOCAL_APP_ID = 'local-autocenter-app';
const appId = isCanvasEnvironment ? (typeof __app_id !== 'undefined' ? __app_id : LOCAL_APP_ID) : LOCAL_APP_ID;

// Os dados devem ser armazenados dentro do caminho público do artefato.
const MEDIA_COLLECTION = `/artifacts/${appId}/public/data/marketing_media`;
const MEDIA_STORAGE_PATH = `artifacts/${appId}/public/media/marketing_media`;

// --- Elementos da UI ---
const form = document.getElementById('marketing-form');
const fileInput = document.getElementById('file-upload');
const titleInput = document.getElementById('media-title');
const uploadMessage = document.getElementById('upload-message');
const mediaList = document.getElementById('media-list');
const emptyMessage = document.getElementById('media-list-empty-message');
const dropArea = document.getElementById('drop-area');
const fileNameDisplay = document.getElementById('file-name-display');

/**
 * NOVO: Realiza o login anônimo para obter permissões de leitura/escrita.
 */
async function initializeAuthAndListeners() {
    try {
        await signInAnonymously(auth);
        console.log("Login anônimo realizado com sucesso para a interface de Marketing.");
        // Agora que estamos autenticados, podemos configurar os listeners.
        setupFirestoreListener();
    } catch (error) {
        console.error("Erro no login anônimo:", error);
        showUserMessage("Falha de autenticação. A aplicação pode não funcionar corretamente.", true);
    }
}


/**
 * Exibe uma mensagem para o usuário e a limpa após um tempo.
 * @param {string} text - O texto da mensagem.
 * @param {boolean} isError - Se a mensagem é de erro.
 */
function showUserMessage(text, isError = false) {
    uploadMessage.textContent = text;
    uploadMessage.className = `mt-3 text-center text-sm font-medium ${isError ? 'text-red-600' : 'text-green-600'}`;
    setTimeout(() => {
        uploadMessage.textContent = '';
    }, 5000);
}

/**
 * Atualiza a UI para mostrar o nome do arquivo selecionado.
 * @param {File} file - O arquivo selecionado.
 */
function updateFileDisplay(file) {
    fileNameDisplay.textContent = file ? `Arquivo selecionado: ${file.name}` : '';
    uploadMessage.textContent = ''; // Limpa mensagens anteriores
}

/**
 * Lida com o envio do formulário para adicionar nova mídia.
 * @param {Event} e - O evento de submit.
 */
async function handleFormSubmit(e) {
    e.preventDefault();
    const file = fileInput.files[0];
    const title = titleInput.value.trim();

    if (!file) {
        showUserMessage("Por favor, selecione um arquivo de mídia.", true);
        return;
    }

    const fileName = `${Date.now()}-${file.name}`;
    const storageRef = ref(storage, `${MEDIA_STORAGE_PATH}/${fileName}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    // Listener para o progresso do upload
    uploadTask.on('state_changed',
        (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            showUserMessage(`Enviando... ${Math.round(progress)}%`);
        },
        (error) => {
            console.error("Erro no upload:", error);
            showUserMessage(`Erro no upload: ${error.message}`, true);
        },
        async () => {
            // Upload concluído com sucesso
            try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                
                // Salva os metadados no Firestore
                await addDoc(collection(db, MEDIA_COLLECTION), {
                    title: title || file.name,
                    fileName: file.name,
                    url: downloadURL,
                    type: file.type.startsWith('image/') ? 'Imagem' : 'Vídeo',
                    status: 'ativo', // Padrão
                    order: Date.now(), // Ordem inicial baseada no tempo
                    createdAt: serverTimestamp()
                });

                showUserMessage("Mídia adicionada com sucesso!");
                form.reset();
                updateFileDisplay(null); // Limpa o nome do arquivo da UI

            } catch (error) {
                console.error("Erro ao salvar no Firestore:", error);
                showUserMessage("Erro ao salvar os dados da mídia.", true);
            }
        }
    );
}

/**
 * Renderiza a lista de mídias na tela.
 * @param {Array} mediaItems - Array de documentos de mídia do Firestore.
 */
function renderMediaList(mediaItems) {
    if (mediaItems.length === 0) {
        mediaList.innerHTML = '';
        emptyMessage.classList.remove('hidden');
        return;
    }

    emptyMessage.classList.add('hidden');
    mediaList.innerHTML = mediaItems.map((item, index) => {
        const { id, title, type, url, status } = item;

        const isImage = type === 'Imagem';
        const thumbnailHTML = isImage
            ? `<img src="${url}" alt="Thumbnail" class="w-full h-full object-cover rounded-md">`
            : `<div class="w-full h-full bg-gray-800 text-white rounded-md flex items-center justify-center">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                 </svg>
               </div>`;

        return `
            <li class="p-4 flex justify-between items-center hover:bg-gray-50 cursor-grab" data-id="${id}">
                <div class="flex items-center">
                    <div class="w-24 h-16 bg-gray-200 rounded-md flex items-center justify-center mr-4">${thumbnailHTML}</div>
                    <div>
                        <p class="text-sm font-medium text-gray-900 media-title-text">${title}</p>
                        <p class="text-sm text-gray-500">${type}</p>
                    </div>
                </div>
                <div class="flex items-center space-x-3">
                    <span class="text-sm font-bold text-gray-400">#${index + 1}</span>
                    <div class="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                        <input type="checkbox" name="toggle" class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" ${status === 'ativo' ? 'checked' : ''}/>
                        <label class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
                    </div>
                    <button title="Editar" class="p-2 text-blue-500 hover:bg-blue-100 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z" /></svg>
                    </button>
                    <button title="Excluir" class="p-2 text-red-500 hover:bg-red-100 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </div>
            </li>
        `;
    }).join('');
}

/**
 * Lida com cliques na lista de mídia para exclusão ou atualização de status.
 * @param {Event} e - O evento de clique.
 */
async function handleMediaListClick(e) {
    const target = e.target;
    const listItem = target.closest('li');
    if (!listItem) return;

    const mediaId = listItem.dataset.id;
    const docRef = doc(db, MEDIA_COLLECTION, mediaId);

    // --- Lógica para o botão de excluir ---
    if (target.closest('button[title="Excluir"]')) {
        if (confirm("Tem certeza que deseja excluir esta mídia? Esta ação não pode ser desfeita.")) {
            try {
                // Busca o documento para pegar a URL do arquivo antes de deletar
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const fileUrl = docSnap.data().url;
                    // Cria uma referência para o arquivo no Storage a partir da URL
                    const fileRef = ref(storage, fileUrl);
                    // Deleta o arquivo do Storage
                    await deleteObject(fileRef);
                } else {
                    console.warn("Documento não encontrado no Firestore, não foi possível deletar o arquivo do Storage.");
                }

                // Deleta o documento do Firestore
                await deleteDoc(docRef);
                showUserMessage("Mídia excluída com sucesso.");
            } catch (error) {
                console.error("Erro ao excluir mídia:", error);
                // Informa o usuário que a exclusão do arquivo pode ter falhado
                if (error.code === 'storage/object-not-found') {
                    showUserMessage("Mídia excluída do banco de dados, mas o arquivo não foi encontrado no armazenamento.", true);
                }
                showUserMessage("Erro ao excluir a mídia.", true);
            }
        }
    }

    // --- Lógica para o switch de status ---
    if (target.classList.contains('toggle-checkbox')) {
        const newStatus = target.checked ? 'ativo' : 'inativo';
        try {
            await updateDoc(docRef, { status: newStatus });
            showUserMessage(`Status atualizado para ${newStatus}.`);
        } catch (error) {
            console.error("Erro ao atualizar status:", error);
            showUserMessage("Erro ao atualizar o status.", true);
            target.checked = !target.checked; // Reverte a mudança visual em caso de erro
        }
    }

    // --- Lógica para o botão de editar ---
    if (target.closest('button[title="Editar"]')) {
        const titleElement = listItem.querySelector('.media-title-text');
        const currentTitle = titleElement.textContent;

        const newTitle = prompt("Digite o novo título para a mídia:", currentTitle);

        // Se o usuário não cancelar e o título for diferente
        if (newTitle !== null && newTitle.trim() !== currentTitle) {
            try {
                await updateDoc(docRef, { title: newTitle.trim() || "Sem título" });
                showUserMessage("Título atualizado com sucesso.");
            } catch (error) {
                console.error("Erro ao atualizar título:", error);
                showUserMessage("Erro ao atualizar o título.", true);
            }
        }
    }
}

/**
 * Inicializa a funcionalidade de arrastar e soltar para reordenar a lista.
 */
function initSortable() {
    new Sortable(mediaList, {
        animation: 150,
        ghostClass: 'bg-blue-100',
        handle: '.cursor-grab',
        onEnd: async (evt) => {
            const items = Array.from(mediaList.querySelectorAll('li'));
            const batch = writeBatch(db);

            items.forEach((item, index) => {
                const docId = item.dataset.id;
                if (docId) {
                    const docRef = doc(db, MEDIA_COLLECTION, docId);
                    // O novo 'order' é o timestamp atual + o índice para garantir unicidade e ordem
                    batch.update(docRef, { order: Date.now() + index });
                }
            });

            try {
                await batch.commit();
            } catch (error) {
                console.error("Erro ao reordenar mídias:", error);
                showUserMessage("Ocorreu um erro ao salvar a nova ordem.", true);
            }
        },
    });
}
// --- Listeners ---
form.addEventListener('submit', handleFormSubmit);

// Listener para seleção de arquivo (funciona para clique e drag-and-drop)
fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        updateFileDisplay(fileInput.files[0]);
    }
});

// Listeners para feedback visual do Drag and Drop
['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.add('border-blue-500', 'bg-blue-50'), false);
});

['dragleave', 'drop', 'change'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.remove('border-blue-500', 'bg-blue-50'), false);
});

mediaList.addEventListener('click', handleMediaListClick);

/**
 * NOVO: Configura o listener do Firestore após a autenticação.
 */
function setupFirestoreListener() {
    const q = query(collection(db, MEDIA_COLLECTION), orderBy("order", "asc"));
    onSnapshot(q, (querySnapshot) => {
        const mediaItems = [];
        querySnapshot.forEach((doc) => {
            mediaItems.push({ id: doc.id, ...doc.data() });
        });
        renderMediaList(mediaItems);
        // Inicializa ou reinicializa o sortable sempre que a lista é renderizada
        if (mediaItems.length > 0) {
            initSortable();
        }
    }, (error) => {
        console.error("Erro ao buscar mídias:", error);
        showUserMessage("Não foi possível carregar a lista de mídias. Verifique as permissões do Firestore.", true);
    });
}

// Inicia o processo de autenticação, que por sua vez ativará os listeners.
initializeAuthAndListeners();