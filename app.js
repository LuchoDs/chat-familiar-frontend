// ========================= 
// VARIABLES GLOBALES
// =========================
let socket = null;
let usernameGlobal = null;
let reconnectInterval = 1000; // tiempo inicial reconexión en ms
const MAX_RECONNECT = 10000; // máximo tiempo de reconexión

let mediaRecorder = null;
let audioChunks = [];

const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const sendBtn = document.getElementById("send-btn");
const recordBtn = document.getElementById("record-btn");
const messageInput = document.getElementById("message-input");
const messagesDiv = document.getElementById("messages");

const loginView = document.getElementById("login-view");
const chatView = document.getElementById("chat-view");

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
        console.log("Token expirado. Cerrando sesión.");
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

    chatView.classList.add("hidden");
    loginView.classList.remove("hidden");
}

// =========================
// MENÚ LONG PRESS PARA ELIMINAR
// =========================
function habilitarOpcionesMensajes() {
    const mensajes = messagesDiv.querySelectorAll("div");

    mensajes.forEach(msg => {
        if (msg.dataset.longpress) return;

        let pressTimer;

        msg.addEventListener("touchstart", e => {
            pressTimer = setTimeout(() => {
                mostrarMenuEliminar(msg);
            }, 600); // 600ms touch largo
        });

        msg.addEventListener("touchend", e => clearTimeout(pressTimer));

        msg.dataset.longpress = true;
    });
}

function mostrarMenuEliminar(msgElement) {
    const menu = document.createElement("div");
    menu.style.position = "absolute";
    menu.style.background = "#fff";
    menu.style.border = "1px solid #ccc";
    menu.style.padding = "5px";
    menu.style.borderRadius = "5px";
    menu.style.zIndex = 1000;
    menu.textContent = "Eliminar";
    document.body.appendChild(menu);

    const rect = msgElement.getBoundingClientRect();

    // Ajuste para que el menú no se salga de la pantalla
    const menuWidth = 80;  // ancho estimado
    const menuHeight = 30; // alto estimado
    const pageWidth = window.innerWidth;
    const pageHeight = window.innerHeight;

    let left = rect.left;
    let top = rect.top - menuHeight - 5;

    if (left + menuWidth > pageWidth) left = pageWidth - menuWidth - 5;
    if (left < 0) left = 5;
    if (top < 0) top = rect.bottom + 5;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    menu.addEventListener("click", async () => {
        const messageId = msgElement.dataset.id;
        if (!messageId) return;

        try {
            const response = await fetchConAuth(`http://127.0.0.1:8000/messages/${messageId}`, {
                method: "DELETE"
            });

            if (!response.ok) throw new Error("No se pudo eliminar el mensaje");

            msgElement.remove();
        } catch (err) {
            console.error(err);
            alert("Error al eliminar mensaje");
        } finally {
            menu.remove();
        }
    });

    const cerrarMenu = e => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener("click", cerrarMenu);
        }
    };
    document.addEventListener("click", cerrarMenu);
}

// =========================
// CONECTAR WEBSOCKET CON RECONEXIÓN
// =========================
function conectarSocket() {
    const token = localStorage.getItem("token");
    if (!token) {
        cerrarSesion();
        return;
    }

    socket = new WebSocket(`ws://127.0.0.1:8000/ws?token=${token}`);

    socket.onopen = () => {
        console.log("WebSocket conectado");
        reconnectInterval = 1000;
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        const msg = document.createElement("div");
        msg.dataset.id = data.id;
        const sender = data.username || `Usuario ${data.user_id}`;

        if (data.content) {
            msg.textContent = `${sender}: ${data.content}`;
        } else if (data.audio_url) {
            const audio = document.createElement("audio");
            audio.controls = true;
            audio.src = data.audio_url;
            msg.appendChild(document.createTextNode(`${sender}: `));
            msg.appendChild(audio);
        }

        messagesDiv.appendChild(msg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        habilitarOpcionesMensajes();
    };

    socket.onclose = () => {
        console.log("WebSocket cerrado. Intentando reconectar...");
        socket = null;
        setTimeout(conectarSocket, reconnectInterval);
        reconnectInterval = Math.min(reconnectInterval * 2, MAX_RECONNECT);
    };

    socket.onerror = (err) => {
        console.log("Error en WebSocket", err);
        socket.close();
    };
}

// =========================
// CARGAR MENSAJES INICIALES
// =========================
async function cargarMensajesIniciales() {
    const response = await fetchConAuth("http://127.0.0.1:8000/messages");
    if (!response) return;

    const messages = await response.json();
    messagesDiv.innerHTML = "";

    messages.forEach(data => {
        const msg = document.createElement("div");
        msg.dataset.id = data.id;
        const sender = data.username || `Usuario ${data.user_id}`;

        if (data.content) {
            msg.textContent = `${sender}: ${data.content}`;
        } else if (data.audio_url) {
            const audio = document.createElement("audio");
            audio.controls = true;
            audio.src = data.audio_url;
            msg.appendChild(document.createTextNode(`${sender}: `));
            msg.appendChild(audio);
        }

        messagesDiv.appendChild(msg);
    });

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    habilitarOpcionesMensajes();
}

// =========================
// RESTAURAR SESIÓN AL CARGAR
// =========================
window.addEventListener("load", async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
        const response = await fetchConAuth("http://127.0.0.1:8000/me");
        if (!response) return;

        const userData = await response.json();
        usernameGlobal = userData.username;

        loginView.classList.add("hidden");
        chatView.classList.remove("hidden");

        await cargarMensajesIniciales();
        conectarSocket();

    } catch (error) {
        console.log("Token inválido");
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

    if (!username || !password) {
        alert("Completar usuario y contraseña");
        return;
    }

    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);

    try {
        const response = await fetch("http://127.0.0.1:8000/login", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.detail || "Error en login");

        localStorage.setItem("token", data.access_token);
        usernameGlobal = username;

        loginView.classList.add("hidden");
        chatView.classList.remove("hidden");

        await cargarMensajesIniciales();
        conectarSocket();

    } catch (error) {
        console.error("Error login:", error);
        alert(error.message);
    }
});

// =========================
// LOGOUT
// =========================
logoutBtn.addEventListener("click", () => cerrarSesion());

// =========================
// ENVIAR MENSAJE DE TEXTO
// =========================
sendBtn.addEventListener("click", () => {
    const text = messageInput.value.trim();
    if (text === "") return;

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
                const response = await fetchConAuth("http://127.0.0.1:8000/upload-audio", {
                    method: "POST",
                    body: formData
                });

                if (!response) throw new Error("Error subiendo audio");

                const data = await response.json();

                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ content: null, audio_url: data.audio_filename }));
                }

            } catch (err) {
                console.error("Error audio:", err);
                alert("No se pudo enviar el audio");
            }
        };

        mediaRecorder.start();
        recordBtn.textContent = "⏹️";
    } else if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        recordBtn.textContent = "🎤";
    }
});