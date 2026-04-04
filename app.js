/// app.js

let socket = null;
let usernameGlobal = null;
let reconnectInterval = 1000;
const MAX_RECONNECT = 10000;
let mediaRecorder = null;
let audioChunks = [];

const BASE_URL = "https://chat-familiar-backend-spp8.onrender.com";
const VAPID_PUBLIC_KEY = 'BEulalZLNf2nIjCYiJTZMlbsn_59u6Hs0BrFBwm_uN_KlU5V-dzV9vUniqxr-r1Q0wlJq-CZEF3dFJ0uN3L-H4M';

// Elementos del DOM
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const sendBtn = document.getElementById("send-btn");
const recordBtn = document.getElementById("record-btn");
const messageInput = document.getElementById("message-input");
const messagesDiv = document.getElementById("messages");
const loginView = document.getElementById("login-view");
const chatView = document.getElementById("chat-view");

// --- 1. PERSISTENCIA Y AUTOLOGIN ---

async function intentarLogin(user, pass) {
    const fd = new URLSearchParams();
    fd.append("username", user);
    fd.append("password", pass);

    try {
        const res = await fetch(`${BASE_URL}/login`, { method: "POST", body: fd });
        if (res.ok) {
            const data = await res.json();
            localStorage.setItem("token", data.access_token);
            // Guardamos credenciales para futuros autologins
            localStorage.setItem("chat_user", user);
            localStorage.setItem("chat_pass", pass);
            
            await inicializarApp();
        } else {
            cerrarSesion();
        }
    } catch (err) {
        console.error("Error en autologin:", err);
    }
}

async function inicializarApp() {
    const res = await fetchConAuth(`${BASE_URL}/me`);
    if (res?.ok) {
        const user = await res.json();
        usernameGlobal = user.username;
        loginView.classList.add("hidden");
        chatView.classList.remove("hidden");
        cargarMensajesIniciales();
        conectarSocket();
        inicializarNotificaciones();
    } else {
        cerrarSesion();
    }
}

// --- EVENTO DE CARGA INICIAL (VERSIÓN DEFINITIVA) ---
window.addEventListener("load", () => {
    const token = localStorage.getItem("token");
    const savedUser = localStorage.getItem("chat_user");
    const savedPass = localStorage.getItem("chat_pass");

    if (token) {
        // Si ya hay token (sesión activa), entramos de una
        inicializarApp();
    } else if (savedUser && savedPass) {
        // Si no hay token pero hay credenciales guardadas:
        // Esperamos 500ms para que el Moto E22 termine de renderizar los inputs
        setTimeout(async () => {
            const uInput = document.getElementById("username");
            const pInput = document.getElementById("password");

            if (uInput && pInput) {
                // Llenamos los campos visualmente (esto calma a Chrome)
                uInput.value = savedUser;
                pInput.value = savedPass;
                
                console.log("Autologin: Intentando entrar con datos guardados...");
                // Ejecutamos el login automáticamente sin tocar nada
                await intentarLogin(savedUser, savedPass);
            }
        }, 500); 
    }
});

// --- 2. FUNCIONES DE COMUNICACIÓN ---

async function fetchConAuth(url, options = {}) {
    const token = localStorage.getItem("token");
    if (!token) { cerrarSesion(); return; }
    return await fetch(url, {
        ...options,
        headers: { ...options.headers, "Authorization": `Bearer ${token}` }
    });
}

function cerrarSesion() {
    localStorage.removeItem("token");
    localStorage.removeItem("chat_user");
    localStorage.removeItem("chat_pass");
    if (socket) socket.close();
    location.reload();
}

function conectarSocket() {
    const token = localStorage.getItem("token");
    socket = new WebSocket(`wss://chat-familiar-backend-spp8.onrender.com/ws?token=${token}`);
    
    socket.onopen = () => {
        console.log("Conectado");
        reconnectInterval = 1000;
    };

    socket.onmessage = (e) => {
        const data = JSON.parse(e.data);
        messagesDiv.appendChild(renderizarMensaje(data));
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        if (document.visibilityState !== 'visible' && 'setAppBadge' in navigator) {
            navigator.setAppBadge().catch(console.error);
        }
    };

    socket.onclose = () => {
        setTimeout(conectarSocket, reconnectInterval);
        reconnectInterval = Math.min(reconnectInterval * 2, MAX_RECONNECT);
    };
}

// --- 3. MENSAJES Y UI ---

function renderizarMensaje(data) {
    const msg = document.createElement("div");
    msg.dataset.id = data.id;
    const esMio = (data.username === usernameGlobal);
    
    msg.classList.add("message-bubble", esMio ? "message-mine" : "message-other");

    const nombre = document.createElement("span");
    nombre.className = "username";
    nombre.textContent = esMio ? "Yo" : (data.username || `Usuario ${data.user_id}`);
    msg.appendChild(nombre);

    const contenido = document.createElement("div");
    if (data.content) {
        contenido.textContent = data.content;
    } else if (data.audio_url) {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.src = data.audio_url;
        contenido.appendChild(audio);
    }
    msg.appendChild(contenido);

    // Eliminar con toque largo
    let pressTimer;
    msg.addEventListener("touchstart", () => pressTimer = setTimeout(() => mostrarBtnEliminar(msg), 600));
    msg.addEventListener("touchend", () => clearTimeout(pressTimer));

    return msg;
}

function mostrarBtnEliminar(msgElement) {
    if (msgElement.querySelector(".btn-delete")) return;
    const btn = document.createElement("button");
    btn.className = "btn-delete";
    btn.textContent = "🗑";
    btn.onclick = async (e) => {
        e.stopPropagation();
        const res = await fetchConAuth(`${BASE_URL}/messages/${msgElement.dataset.id}`, { method: "DELETE" });
        if (res?.ok) msgElement.remove();
    };
    msgElement.appendChild(btn);
    document.addEventListener("click", () => btn.remove(), { once: true });
}

async function cargarMensajesIniciales() {
    const res = await fetchConAuth(`${BASE_URL}/messages`);
    if (!res) return;
    const messages = await res.json();
    messagesDiv.innerHTML = "";
    messages.forEach(msg => messagesDiv.appendChild(renderizarMensaje(msg)));
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// --- 4. EVENTOS DE INTERFAZ ---

loginBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    const u = document.getElementById("username").value;
    const p = document.getElementById("password").value;
    await intentarLogin(u, p);
});

logoutBtn.addEventListener("click", () => cerrarSesion());

sendBtn.addEventListener("click", () => {
    const txt = messageInput.value.trim();
    if (txt && socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ content: txt, audio_url: null }));
        messageInput.value = "";
    }
});

recordBtn.addEventListener("click", async () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = async () => {
                const blob = new Blob(audioChunks, { type: "audio/webm" });
                const fd = new FormData();
                fd.append("file", blob, "audio.webm");
                const res = await fetchConAuth(`${BASE_URL}/upload-audio`, { method: "POST", body: fd });
                if (res.ok) {
                    const data = await res.json();
                    socket.send(JSON.stringify({ content: null, audio_url: data.audio_filename }));
                }
            };
            mediaRecorder.start();
            recordBtn.textContent = "⭕";
        } catch (err) {
            alert("Micrófono bloqueado. Revisá los permisos.");
        }
    } else { 
        mediaRecorder.stop(); 
        recordBtn.textContent = "🎤"; 
    }
});

// --- 5. NOTIFICACIONES PUSH ---

async function inicializarNotificaciones() {
    if (!('serviceWorker' in navigator)) return;
    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey : urlBase64ToUint8Array(VAPID_PUBLIC_KEY), 
        });

        await fetchConAuth(`${BASE_URL}/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription.toJSON())
        });
    } catch (err) {
        console.error("Error Push:", err);
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

window.addEventListener('focus', () => {
    if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(console.error);
});