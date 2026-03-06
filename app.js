// =========================  
// VARIABLES GLOBALES
// =========================
let socket = null;
let usernameGlobal = null;
let reconnectInterval = 1000;
const MAX_RECONNECT = 10000;

let mediaRecorder = null;
let audioChunks = [];

const BASE_URL = "https://chat-familiar-backend-spp8.onrender.com";

const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const sendBtn = document.getElementById("send-btn");
const recordBtn = document.getElementById("record-btn");
const messageInput = document.getElementById("message-input");
const messagesDiv = document.getElementById("messages");

const loginView = document.getElementById("login-view");
const chatView = document.getElementById("chat-view");

// Long press
let longPressTimer = null;
const LONG_PRESS_DURATION = 600;
let activeRow = null;

// =========================
// ENTER = SOLO SALTO DE LÍNEA
// =========================
messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") return;
});

// =========================
// FETCH CON AUTENTICACIÓN
// =========================
async function fetchConAuth(url, options = {}) {
    const token = localStorage.getItem("token");
    if (!token) {
        cerrarSesion();
        return;
    }

    const response = await fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
            "Authorization": `Bearer ${token}`
        }
    });

    if (response.status === 401) {
        cerrarSesion();
        return;
    }

    return response;
}

// =========================
// CERRAR SESIÓN
// =========================
function cerrarSesion() {
    localStorage.removeItem("token");

    if (socket) {
        socket.close();
        socket = null;
    }

    messagesDiv.innerHTML = "";
    loginView.classList.remove("hidden");
    chatView.classList.add("hidden");
}

// =========================
// SUSCRIPCIÓN A PUSH
// =========================
async function suscribirsePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    try {
        const registration = await navigator.serviceWorker.ready;

        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const VAPID_PUBLIC_KEY = `MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEIttR7ZHiK95Pk6wSJJNL8TzoYNGOzFE3sRTdLB0AsSbJwguQQMb0quuCLuZ+OM2asj98AZeA+UmejoM5Dcxlfw==`;
        const convertedVapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
        });

        // Enviar suscripción al backend
        await fetchConAuth(`${BASE_URL}/subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(subscription)
        });

    } catch (err) {
        console.error("Error suscribiéndose a push:", err);
    }
}

// Convierte VAPID public key
function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// =========================
// ELIMINAR MENSAJE
// =========================
async function eliminarMensaje(id) {
    try {
        await fetchConAuth(`${BASE_URL}/messages/${id}`, { method: "DELETE" });
        const msgRow = document.querySelector(`.message-row[data-id='${id}']`);
        if (msgRow) msgRow.remove();
    } catch {
        alert("No se pudo eliminar el mensaje");
    }
}

// =========================
// MOSTRAR / OCULTAR DELETE
// =========================
function mostrarDelete(row) {
    ocultarDelete();
    const btn = row.querySelector(".delete-btn");
    if (btn) {
        btn.style.display = "block";
        activeRow = row;
    }
}

function ocultarDelete() {
    if (activeRow) {
        const btn = activeRow.querySelector(".delete-btn");
        if (btn) btn.style.display = "none";
        activeRow = null;
    }
}

document.addEventListener("touchstart", (e) => {
    if (activeRow && !activeRow.contains(e.target)) {
        ocultarDelete();
    }
});

// =========================
// CREAR BURBUJA DE MENSAJE
// =========================
function agregarMensajeAlChat(data) {
    const sender = data.username || `Usuario ${data.user_id}`;
    const isSelf = sender === usernameGlobal;

    const row = document.createElement("div");
    row.classList.add("message-row", isSelf ? "self" : "other");
    row.dataset.id = data.id;

    const deleteBtn = document.createElement("div");
    deleteBtn.classList.add("delete-btn");
    deleteBtn.textContent = "Eliminar";

    deleteBtn.addEventListener("click", () => eliminarMensaje(data.id));

    const bubble = document.createElement("div");
    bubble.classList.add("bubble", isSelf ? "bubble-self" : "bubble-other");

    const usernameSpan = document.createElement("span");
    usernameSpan.classList.add("username");
    usernameSpan.textContent = sender + ": ";
    usernameSpan.style.fontWeight = "bold";
    bubble.appendChild(usernameSpan);

    if (data.content) {
        bubble.appendChild(document.createTextNode(data.content));
    } else if (data.audio_url) {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.src = data.audio_url;
        bubble.appendChild(audio);
    }

    if (isSelf) {
        row.appendChild(deleteBtn);
        row.appendChild(bubble);
    } else {
        row.appendChild(bubble);
        row.appendChild(deleteBtn);
    }

    // LONG PRESS (MOBILE)
    row.addEventListener("touchstart", () => {
        longPressTimer = setTimeout(() => mostrarDelete(row), LONG_PRESS_DURATION);
    });

    row.addEventListener("touchend", () => clearTimeout(longPressTimer));
    row.addEventListener("touchmove", () => clearTimeout(longPressTimer));

    messagesDiv.appendChild(row);
}

// =========================
// CONECTAR WEBSOCKET
// =========================
function conectarSocket() {
    const token = localStorage.getItem("token");
    if (!token) { cerrarSesion(); return; }

    socket = new WebSocket(`${BASE_URL.replace(/^http/, "ws")}/ws?token=${token}`);

    socket.onopen = () => reconnectInterval = 1000;

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        agregarMensajeAlChat(data);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    };

    socket.onclose = () => {
        socket = null;
        setTimeout(conectarSocket, reconnectInterval);
        reconnectInterval = Math.min(reconnectInterval * 2, MAX_RECONNECT);
    };

    socket.onerror = () => socket.close();
}

// =========================
// CARGAR MENSAJES INICIALES
// =========================
async function cargarMensajesIniciales() {
    const response = await fetchConAuth(`${BASE_URL}/messages`);
    if (!response) return;

    const messages = await response.json();
    messagesDiv.innerHTML = "";
    messages.forEach(data => agregarMensajeAlChat(data));
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// =========================
// RESTAURAR SESIÓN AL CARGAR
// =========================
window.addEventListener("load", async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
        const response = await fetchConAuth(`${BASE_URL}/me`);
        if (!response) return;

        const userData = await response.json();
        usernameGlobal = userData.username;

        loginView.classList.add("hidden");
        chatView.classList.remove("hidden");

        await cargarMensajesIniciales();
        conectarSocket();
        suscribirsePush(); // 🔹 SUSCRIPCIÓN PUSH
    } catch {
        cerrarSesion();
    }
});

// =========================
// LOGIN
// =========================
loginBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!username || !password) { alert("Completar usuario y contraseña"); return; }

    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);

    try {
        const response = await fetch(`${BASE_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail);

        localStorage.setItem("token", data.access_token);
        usernameGlobal = username;

        loginView.classList.add("hidden");
        chatView.classList.remove("hidden");

        await cargarMensajesIniciales();
        conectarSocket();
        suscribirsePush(); // 🔹 SUSCRIPCIÓN PUSH
    } catch (error) {
        alert(error.message);
    }
});

// =========================
// LOGOUT
// =========================
logoutBtn.addEventListener("click", cerrarSesion);

// =========================
// ENVIAR MENSAJE
// =========================
sendBtn.addEventListener("click", () => {
    const text = messageInput.value.trim();
    if (!text) return;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        alert("Conexión no disponible");
        return;
    }

    socket.send(JSON.stringify({ content: text, audio_url: null }));
    messageInput.value = "";
});

// =========================
// GRABACIÓN DE AUDIO
// =========================
recordBtn.addEventListener("click", async () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
            const formData = new FormData();
            formData.append("file", audioBlob, `audio_${Date.now()}.webm`);

            try {
                const response = await fetchConAuth(`${BASE_URL}/upload-audio`, {
                    method: "POST",
                    body: formData
                });

                const data = await response.json();

                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ content: null, audio_url: data.audio_filename }));
                }

            } catch {
                alert("No se pudo enviar el audio");
            }
        };

        mediaRecorder.start();
        recordBtn.textContent = "⭕";

    } else if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        recordBtn.textContent = "🎤";
    }
});