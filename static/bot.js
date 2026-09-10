document.addEventListener("DOMContentLoaded", () => {

    console.log("CollegeBot JS starting...");

    // =========================================================
    // ELEMENT FINDER
    // =========================================================

    const $ = (id) => document.getElementById(id);

    let chatArea = $("chatArea");
    let input = $("messageInput");
    let sendBtn = $("sendBtn");
    let micBtn = $("micBtn");
    let speakBtn = $("speakBtn");

    let recentQuestions = $("recentQuestions");
    let historyList = $("historyList");

    let historyModal = $("historyModal");
    let settingsModal = $("settingsModal");

    let currentChatId = null;
    let lastBotMessage = "";
    let isSending = false;

    let recognition = null;
    let isListening = false;

    let currentUser = null;

    let settings = {
        language: "auto",
        theme: "light",
        voice: true
    };


    // =========================================================
    // FIND BUTTONS
    // =========================================================

    function findButton(text) {

        const buttons = Array.from(
            document.querySelectorAll("button")
        );

        return buttons.find(btn =>
            btn.textContent
                .trim()
                .toLowerCase()
                .includes(text.toLowerCase())
        );
    }


    let newChatBtn =
        $("newChatBtn") ||
        findButton("new chat");

    let historyBtn =
        $("historyBtn") ||
        findButton("chat history");

    let settingsBtn =
        $("settingsBtn") ||
        findButton("settings");

    let logoutBtn =
        $("logoutBtn") ||
        findButton("logout");


    // =========================================================
    // CREATE MISSING CHAT AREA IF REQUIRED
    // =========================================================

    if (!chatArea) {

        console.warn(
            "chatArea not found. Creating fallback."
        );

        chatArea = document.createElement("div");

        chatArea.id = "chatArea";

        document.body.appendChild(chatArea);
    }


    // =========================================================
    // UTILITY
    // =========================================================

    function escapeHTML(text) {

        const div =
            document.createElement("div");

        div.textContent =
            String(text ?? "");

        return div.innerHTML;
    }


    function formatMessage(text) {

        let safe =
            escapeHTML(text);

        safe = safe.replace(
            /\*\*(.*?)\*\*/g,
            "<strong>$1</strong>"
        );

        safe = safe.replace(
            /`([^`]+)`/g,
            "<code>$1</code>"
        );

        safe = safe.replace(
            /\n/g,
            "<br>"
        );

        return safe;
    }


    function scrollBottom() {

        if (!chatArea) return;

        chatArea.scrollTop =
            chatArea.scrollHeight;
    }


    function clearChat() {

        if (chatArea) {
            chatArea.innerHTML = "";
        }
    }


    // =========================================================
    // MESSAGE
    // =========================================================

    function addMessage(role, text) {

        if (!chatArea) return;

        const row =
            document.createElement("div");

        row.className =
            role === "user"
                ? "message-row user-row"
                : "message-row bot-row";


        const message =
            document.createElement("div");

        message.className =
            role === "user"
                ? "message user-message"
                : "message bot-message";


        message.innerHTML =
            formatMessage(text);


        row.appendChild(message);

        chatArea.appendChild(row);

        scrollBottom();


        if (role === "assistant") {

            lastBotMessage =
                text;
        }
    }


    function showThinking() {

        if (!chatArea) return null;

        const row =
            document.createElement("div");

        row.className =
            "message-row bot-row";

        row.innerHTML = `
            <div class="message bot-message thinking">
                Thinking<span class="dots">...</span>
            </div>
        `;

        chatArea.appendChild(row);

        scrollBottom();

        return row;
    }


    function showWelcome() {

        clearChat();

        addMessage(
            "assistant",
            `Namaste! 👋

Main **CollegeBot** hoon.

Aap mujhse college, admission, fees, exams, courses, attendance, programming, projects, internships aur placements ke baare mein pooch sakte ho.

🎤 Microphone button se voice question bhi pooch sakte ho.

Batao, main aapki kya help karun? 😊`
        );
    }


    // =========================================================
    // API HELPER
    // =========================================================

    async function api(url, options = {}) {

        const response =
            await fetch(
                url,
                {
                    credentials: "same-origin",
                    ...options
                }
            );


        let data = {};

        try {
            data =
                await response.json();
        } catch (e) {
            data = {};
        }


        return {
            response,
            data
        };
    }


    // =========================================================
    // AUTH MODAL
    // =========================================================

    function createAuthModal() {

        let existing =
            document.getElementById(
                "collegebotAuthModal"
            );

        if (existing) {
            return existing;
        }


        const modal =
            document.createElement("div");

        modal.id =
            "collegebotAuthModal";

        modal.innerHTML = `
            <div class="cb-auth-box">

                <button
                    id="cbAuthClose"
                    class="cb-auth-close"
                    type="button">
                    ×
                </button>

                <div class="cb-auth-icon">
                    🎓
                </div>

                <h2 id="cbAuthTitle">
                    Login to CollegeBot
                </h2>

                <p id="cbAuthSubtitle">
                    Login to save chats and use all features.
                </p>


                <form id="cbAuthForm">

                    <input
                        id="cbUsername"
                        type="text"
                        placeholder="Username"
                        autocomplete="username"
                        required
                    >

                    <input
                        id="cbPassword"
                        type="password"
                        placeholder="Password"
                        autocomplete="current-password"
                        required
                    >

                    <button
                        id="cbAuthSubmit"
                        type="submit">
                        Login
                    </button>

                </form>


                <div
                    id="cbAuthMessage"
                    class="cb-auth-message">
                </div>


                <button
                    id="cbAuthSwitch"
                    class="cb-auth-switch"
                    type="button">
                    Don't have an account? Sign up
                </button>

            </div>
        `;


        document.body.appendChild(modal);


        // CSS directly from JS so modal always works
        const style =
            document.createElement("style");

        style.id =
            "collegebotAuthStyle";

        style.textContent = `

            #collegebotAuthModal {
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,.55);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 99999;
                padding: 20px;
            }

            .cb-auth-box {
                width: min(420px, 100%);
                background: white;
                border-radius: 22px;
                padding: 35px;
                box-shadow: 0 25px 80px rgba(0,0,0,.25);
                position: relative;
                text-align: center;
            }

            .cb-auth-close {
                position: absolute;
                right: 15px;
                top: 12px;
                border: 0;
                background: transparent;
                font-size: 28px;
                cursor: pointer;
            }

            .cb-auth-icon {
                width: 65px;
                height: 65px;
                margin: auto;
                border-radius: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #292929;
                font-size: 30px;
            }

            .cb-auth-box h2 {
                margin: 20px 0 8px;
            }

            .cb-auth-box p {
                color: #777;
                margin-bottom: 22px;
            }

            .cb-auth-box input {
                width: 100%;
                box-sizing: border-box;
                padding: 14px;
                margin: 7px 0;
                border: 1px solid #ddd;
                border-radius: 10px;
                font-size: 15px;
            }

            .cb-auth-box input:focus {
                outline: none;
                border-color: #555;
            }

            #cbAuthSubmit {
                width: 100%;
                margin-top: 12px;
                padding: 14px;
                border: 0;
                border-radius: 10px;
                background: #292929;
                color: white;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
            }

            #cbAuthSubmit:hover {
                opacity: .9;
            }

            .cb-auth-switch {
                border: 0;
                background: transparent;
                margin-top: 18px;
                cursor: pointer;
                color: #555;
            }

            .cb-auth-message {
                min-height: 22px;
                margin-top: 12px;
                font-size: 14px;
            }

            @media(max-width:500px) {
                .cb-auth-box {
                    padding: 25px 20px;
                }
            }
        `;

        document.head.appendChild(style);


        const close =
            document.getElementById(
                "cbAuthClose"
            );

        const form =
            document.getElementById(
                "cbAuthForm"
            );

        const switchBtn =
            document.getElementById(
                "cbAuthSwitch"
            );


        close.addEventListener(
            "click",
            closeAuth
        );


        modal.addEventListener(
            "click",
            event => {

                if (
                    event.target === modal
                ) {
                    closeAuth();
                }
            }
        );


        switchBtn.addEventListener(
            "click",
            toggleAuthMode
        );


        form.addEventListener(
            "submit",
            submitAuth
        );


        return modal;
    }


    let authMode = "login";


    function openAuth(mode = "login") {

        authMode =
            mode;

        const modal =
            createAuthModal();

        updateAuthUI();

        modal.style.display =
            "flex";
    }


    function closeAuth() {

        const modal =
            document.getElementById(
                "collegebotAuthModal"
            );

        if (modal) {

            modal.style.display =
                "none";
        }
    }


    function updateAuthUI() {

        const title =
            document.getElementById(
                "cbAuthTitle"
            );

        const subtitle =
            document.getElementById(
                "cbAuthSubtitle"
            );

        const submit =
            document.getElementById(
                "cbAuthSubmit"
            );

        const switchBtn =
            document.getElementById(
                "cbAuthSwitch"
            );


        if (!title) return;


        if (authMode === "login") {

            title.textContent =
                "Login to CollegeBot";

            subtitle.textContent =
                "Login to save chats and use all features.";

            submit.textContent =
                "Login";

            switchBtn.textContent =
                "Don't have an account? Sign up";

        } else {

            title.textContent =
                "Create CollegeBot Account";

            subtitle.textContent =
                "Create your account to start using CollegeBot.";

            submit.textContent =
                "Create Account";

            switchBtn.textContent =
                "Already have an account? Login";
        }


        const message =
            document.getElementById(
                "cbAuthMessage"
            );

        if (message) {
            message.textContent = "";
        }
    }


    function toggleAuthMode() {

        authMode =
            authMode === "login"
                ? "signup"
                : "login";

        updateAuthUI();
    }


    async function submitAuth(event) {

        event.preventDefault();


        const username =
            document
                .getElementById(
                    "cbUsername"
                )
                .value
                .trim();


        const password =
            document
                .getElementById(
                    "cbPassword"
                )
                .value;


        const messageBox =
            document.getElementById(
                "cbAuthMessage"
            );


        const submitBtn =
            document.getElementById(
                "cbAuthSubmit"
            );


        if (!username || !password) {

            messageBox.textContent =
                "Username aur password enter karo.";

            return;
        }


        submitBtn.disabled =
            true;

        submitBtn.textContent =
            authMode === "login"
                ? "Logging in..."
                : "Creating account...";


        try {

            const result =
                await api(
                    authMode === "login"
                        ? "/api/login"
                        : "/api/signup",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                username,
                                password
                            })
                    }
                );


            if (!result.response.ok) {

                throw new Error(
                    result.data.message ||
                    "Authentication failed."
                );
            }


            messageBox.textContent =
                authMode === "login"
                    ? "Login successful ✅"
                    : "Account created successfully ✅";


            await loadCurrentUser();


            setTimeout(
                () => {

                    closeAuth();

                    loadHistory();

                },
                500
            );


        } catch (error) {

            console.error(
                "Auth error:",
                error
            );


            messageBox.textContent =
                error.message ||
                "Something went wrong.";


        } finally {

            submitBtn.disabled =
                false;

            submitBtn.textContent =
                authMode === "login"
                    ? "Login"
                    : "Create Account";
        }
    }


    // =========================================================
    // CURRENT USER
    // =========================================================

    async function loadCurrentUser() {

        try {

            const result =
                await api(
                    "/api/me"
                );


            if (
                result.response.ok &&
                result.data.logged_in
            ) {

                currentUser =
                    result.data.user;

                console.log(
                    "Logged in as:",
                    currentUser.username
                );


                updateUserUI();

                if (
                    result.data.settings
                ) {

                    settings =
                        {
                            ...settings,
                            ...result.data.settings
                        };

                    applyTheme(
                        settings.theme
                    );
                }


                return true;
            }


            currentUser =
                null;

            updateUserUI();

            return false;


        } catch (error) {

            console.error(
                "User check error:",
                error
            );

            currentUser =
                null;

            updateUserUI();

            return false;
        }
    }


    function updateUserUI() {

        if (!logoutBtn) return;


        if (currentUser) {

            logoutBtn.textContent =
                "🚪 Logout";

            logoutBtn.title =
                "Logout";

        } else {

            logoutBtn.textContent =
                "🔐 Login / Signup";

            logoutBtn.title =
                "Login or create account";
        }


        // Username/profile text
        const possibleNames =
            document.querySelectorAll(
                ".profile-name, #profileName, .username"
            );


        possibleNames.forEach(
            element => {

                element.textContent =
                    currentUser
                        ? currentUser.username
                        : "Guest Student";
            }
        );
    }


    // =========================================================
    // CHAT
    // =========================================================

    async function sendMessage(customMessage = null) {

        if (isSending) return;


        if (!currentUser) {

            openAuth("login");

            return;
        }


        const message =
            customMessage !== null
                ? String(customMessage).trim()
                : (
                    input
                        ? input.value.trim()
                        : ""
                );


        if (!message) return;


        isSending =
            true;


        if (sendBtn) {
            sendBtn.disabled =
                true;
        }


        if (
            input &&
            customMessage === null
        ) {

            input.value =
                "";
        }


        addMessage(
            "user",
            message
        );


        const thinking =
            showThinking();


        try {

            const result =
                await api(
                    "/api/chat",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                message,
                                chat_id:
                                    currentChatId
                            })
                    }
                );


            if (thinking) {
                thinking.remove();
            }


            if (
                result.response.status ===
                401
            ) {

                currentUser =
                    null;

                updateUserUI();

                openAuth("login");

                return;
            }


            if (!result.response.ok) {

                throw new Error(
                    result.data.message ||
                    result.data.error ||
                    "Chat request failed."
                );
            }


            if (
                result.data.chat_id
            ) {

                currentChatId =
                    result.data.chat_id;
            }


            const answer =
                result.data.answer;


            if (!answer) {

                throw new Error(
                    "AI response empty hai."
                );
            }


            addMessage(
                "assistant",
                answer
            );


            await loadHistory();


        } catch (error) {

            console.error(
                "Chat error:",
                error
            );


            if (thinking) {
                thinking.remove();
            }


            addMessage(
                "assistant",
                "Sorry 😕 Response nahi aa paaya.\n\n" +
                "Error: " +
                error.message
            );


        } finally {

            isSending =
                false;

            if (sendBtn) {
                sendBtn.disabled =
                    false;
            }

            if (input) {
                input.focus();
            }
        }
    }


    // =========================================================
    // NEW CHAT
    // =========================================================

    function newChat() {

        currentChatId =
            null;

        showWelcome();

        if (input) {
            input.value =
                "";

            input.focus();
        }
    }


    window.newChat =
        newChat;


    if (newChatBtn) {

        newChatBtn.addEventListener(
            "click",
            newChat
        );
    }


    // =========================================================
    // QUICK QUESTIONS
    // =========================================================

    document
        .querySelectorAll(
            "[data-question]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    sendMessage(
                        button.dataset.question
                    );
                }
            );
        });


    // Also support old quick-question buttons
    document
        .querySelectorAll(
            ".quick-question"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const text =
                        button.dataset.question ||
                        button.textContent.trim();

                    if (text) {
                        sendMessage(text);
                    }
                }
            );
        });


    window.askQuickQuestion =
        function(question) {

            sendMessage(question);
        };


    // =========================================================
    // SEND
    // =========================================================

    if (sendBtn) {

        sendBtn.addEventListener(
            "click",
            () => sendMessage()
        );
    }


    if (input) {

        input.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter" &&
                    !event.shiftKey
                ) {

                    event.preventDefault();

                    sendMessage();
                }
            }
        );
    }


    // =========================================================
    // HISTORY
    // =========================================================

    async function loadHistory() {

        if (!recentQuestions) {
            return;
        }


        if (!currentUser) {

            recentQuestions.innerHTML =
                `<p class="empty-history">
                    Login to see your chats
                </p>`;

            return;
        }


        try {

            const result =
                await api(
                    "/api/history"
                );


            if (
                result.response.status ===
                401
            ) {
                return;
            }


            if (!result.response.ok) {

                throw new Error(
                    result.data.message ||
                    "History failed."
                );
            }


            const chats =
                result.data.chats ||
                [];


            renderRecent(
                chats
            );

            renderHistory(
                chats
            );


        } catch (error) {

            console.error(
                "History error:",
                error
            );
        }
    }


    function renderRecent(chats) {

        if (!recentQuestions) return;


        recentQuestions.innerHTML =
            "";


        if (
            !chats ||
            chats.length === 0
        ) {

            recentQuestions.innerHTML =
                `<p class="empty-history">
                    No chats yet
                </p>`;

            return;
        }


        chats
            .slice(0, 8)
            .forEach(chat => {

                const item =
                    document.createElement(
                        "div"
                    );

                item.className =
                    "recent-item";

                item.textContent =
                    chat.title ||
                    "New Chat";


                item.addEventListener(
                    "click",
                    () => loadChat(chat.id)
                );


                recentQuestions.appendChild(
                    item
                );
            });
    }


    function renderHistory(chats) {

        if (!historyList) return;


        historyList.innerHTML =
            "";


        if (
            !chats ||
            chats.length === 0
        ) {

            historyList.innerHTML =
                `<p class="empty-history">
                    No chats yet
                </p>`;

            return;
        }


        chats.forEach(chat => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "history-item";


            item.innerHTML = `
                <div class="history-question">
                    ${escapeHTML(
                        chat.title ||
                        "New Chat"
                    )}
                </div>

                <div class="history-time">
                    ${escapeHTML(
                        chat.created_at ||
                        ""
                    )}
                </div>

                <button
                    type="button"
                    class="history-delete"
                    data-chat-id="${chat.id}">
                    Delete
                </button>
            `;


            item.addEventListener(
                "click",
                event => {

                    if (
                        event.target.classList.contains(
                            "history-delete"
                        )
                    ) {
                        return;
                    }

                    loadChat(
                        chat.id
                    );
                }
            );


            const deleteBtn =
                item.querySelector(
                    ".history-delete"
                );


            deleteBtn.addEventListener(
                "click",
                async event => {

                    event.stopPropagation();

                    await deleteChat(
                        chat.id
                    );
                }
            );


            historyList.appendChild(
                item
            );
        });
    }


    async function loadChat(chatId) {

        if (!currentUser) {

            openAuth("login");

            return;
        }


        try {

            const result =
                await api(
                    `/api/history/${chatId}`
                );


            if (!result.response.ok) {

                throw new Error(
                    result.data.message ||
                    "Unable to load chat."
                );
            }


            currentChatId =
                chatId;


            clearChat();


            const messages =
                result.data.messages ||
                [];


            if (
                messages.length === 0
            ) {

                showWelcome();

            } else {

                messages.forEach(
                    message => {

                        addMessage(
                            message.role,
                            message.content
                        );
                    }
                );
            }


            if (historyModal) {

                historyModal.classList.add(
                    "hidden"
                );

                historyModal.style.display =
                    "none";
            }


        } catch (error) {

            console.error(
                "Load chat error:",
                error
            );

            alert(
                "Chat load nahi hui."
            );
        }
    }


    async function deleteChat(chatId) {

        if (
            !confirm(
                "Ye chat delete karni hai?"
            )
        ) {
            return;
        }


        try {

            const result =
                await api(
                    `/api/history/${chatId}`,
                    {
                        method: "DELETE"
                    }
                );


            if (!result.response.ok) {

                throw new Error(
                    result.data.message ||
                    "Delete failed."
                );
            }


            if (
                currentChatId ===
                chatId
            ) {

                currentChatId =
                    null;

                showWelcome();
            }


            await loadHistory();


        } catch (error) {

            console.error(
                "Delete error:",
                error
            );

            alert(
                "Chat delete nahi hui."
            );
        }
    }


    // =========================================================
    // HISTORY BUTTON
    // =========================================================

    function showHistory() {

        if (!currentUser) {

            openAuth("login");

            return;
        }


        loadHistory();


        if (historyModal) {

            historyModal.classList.remove(
                "hidden"
            );

            historyModal.style.display =
                "flex";
        }
    }


    window.showHistory =
        showHistory;


    window.closeHistory =
        function() {

            if (historyModal) {

                historyModal.classList.add(
                    "hidden"
                );

                historyModal.style.display =
                    "none";
            }
        };


    if (historyBtn) {

        historyBtn.addEventListener(
            "click",
            showHistory
        );
    }


    // =========================================================
    // SETTINGS
    // =========================================================

    function createThemeSelector() {

        if (!settingsModal) return;


        if (
            document.getElementById(
                "themeSelect"
            )
        ) {
            return;
        }


        const container =
            settingsModal.querySelector(
                ".settings-content"
            ) ||
            settingsModal;


        const wrapper =
            document.createElement(
                "div"
            );

        wrapper.className =
            "setting-row";


        wrapper.innerHTML = `
            <label for="themeSelect">
                🎨 Theme
            </label>

            <select id="themeSelect">
                <option value="light">
                    ☀️ Light
                </option>

                <option value="dark">
                    🌙 Dark
                </option>

                <option value="pink">
                    🌸 Pink
                </option>

                <option value="blue">
                    💙 Blue
                </option>

                <option value="purple">
                    💜 Purple
                </option>
            </select>
        `;


        container.prepend(
            wrapper
        );
    }


    function applyTheme(theme) {

        const allowed = [
            "light",
            "dark",
            "pink",
            "blue",
            "purple"
        ];


        if (
            !allowed.includes(theme)
        ) {
            theme = "light";
        }


        document.documentElement
            .setAttribute(
                "data-theme",
                theme
            );


        document.body
            .setAttribute(
                "data-theme",
                theme
            );


        const selector =
            document.getElementById(
                "themeSelect"
            );


        if (selector) {

            selector.value =
                theme;
        }
    }


    async function loadSettings() {

        if (!currentUser) {
            return;
        }


        try {

            const result =
                await api(
                    "/api/settings"
                );


            if (
                result.response.ok &&
                result.data.settings
            ) {

                settings = {
                    ...settings,
                    ...result.data.settings
                };


                applyTheme(
                    settings.theme
                );


                const language =
                    document.getElementById(
                        "languageSelect"
                    );


                if (language) {

                    language.value =
                        settings.language ||
                        "auto";
                }


                const voice =
                    document.getElementById(
                        "voiceToggle"
                    );


                if (voice) {

                    voice.checked =
                        settings.voice !== false;
                }
            }


        } catch (error) {

            console.error(
                "Settings error:",
                error
            );
        }
    }


    function showSettings() {

        if (!currentUser) {

            openAuth("login");

            return;
        }


        createThemeSelector();

        loadSettings();


        if (settingsModal) {

            settingsModal.classList.remove(
                "hidden"
            );

            settingsModal.style.display =
                "flex";
        }
    }


    window.showSettings =
        showSettings;


    window.closeSettings =
        function() {

            if (settingsModal) {

                settingsModal.classList.add(
                    "hidden"
                );

                settingsModal.style.display =
                    "none";
            }
        };


    if (settingsBtn) {

        settingsBtn.addEventListener(
            "click",
            showSettings
        );
    }


    // =========================================================
    // SAVE SETTINGS
    // =========================================================

    const saveSettingsBtn =
        $("saveSettingsBtn");


    if (saveSettingsBtn) {

        saveSettingsBtn.addEventListener(
            "click",
            async () => {

                const theme =
                    $("themeSelect")
                        ? $("themeSelect").value
                        : "light";


                const language =
                    $("languageSelect")
                        ? $("languageSelect").value
                        : "auto";


                const voice =
                    $("voiceToggle")
                        ? $("voiceToggle").checked
                        : true;


                settings.theme =
                    theme;

                settings.language =
                    language;

                settings.voice =
                    voice;


                applyTheme(
                    theme
                );


                try {

                    const result =
                        await api(
                            "/api/settings",
                            {
                                method: "POST",

                                headers: {
                                    "Content-Type":
                                        "application/json"
                                },

                                body:
                                    JSON.stringify({
                                        theme,
                                        language,
                                        persona:
                                            "friendly",
                                        save_history:
                                            true
                                    })
                            }
                        );


                    if (!result.response.ok) {

                        throw new Error(
                            result.data.message ||
                            "Settings save failed."
                        );
                    }


                    alert(
                        "Settings saved successfully ✅"
                    );


                    window.closeSettings();


                } catch (error) {

                    alert(
                        "Settings save nahi hui: " +
                        error.message
                    );
                }
            }
        );
    }


    // =========================================================
    // CLEAR HISTORY
    // =========================================================

    const clearHistoryBtn =
        $("clearHistoryBtn");


    if (clearHistoryBtn) {

        clearHistoryBtn.addEventListener(
            "click",
            async () => {

                if (!currentUser) {

                    openAuth("login");

                    return;
                }


                if (
                    !confirm(
                        "Puri chat history delete karni hai?"
                    )
                ) {
                    return;
                }


                try {

                    const result =
                        await api(
                            "/api/history",
                            {
                                method: "DELETE"
                            }
                        );


                    if (!result.response.ok) {

                        throw new Error(
                            result.data.message ||
                            "Clear history failed."
                        );
                    }


                    currentChatId =
                        null;

                    showWelcome();

                    await loadHistory();


                    alert(
                        "Chat history clear ho gayi ✅"
                    );


                } catch (error) {

                    console.error(
                        error
                    );

                    alert(
                        "History clear nahi hui."
                    );
                }
            }
        );
    }


    window.clearHistory =
        async function() {

            if (clearHistoryBtn) {

                clearHistoryBtn.click();

            } else {

                alert(
                    "Clear history button nahi mila."
                );
            }
        };


    // =========================================================
    // VOICE INPUT
    // =========================================================

    function setupVoice() {

        const SpeechRecognition =
            window.SpeechRecognition ||
            window.webkitSpeechRecognition;


        if (!SpeechRecognition) {

            console.warn(
                "Speech Recognition not supported."
            );

            return;
        }


        recognition =
            new SpeechRecognition();


        recognition.continuous =
            false;

        recognition.interimResults =
            true;

        recognition.lang =
            "en-IN";


        recognition.onstart =
            () => {

                isListening =
                    true;


                if (micBtn) {

                    micBtn.textContent =
                        "🔴";

                    micBtn.classList.add(
                        "recording"
                    );
                }
            };


        recognition.onresult =
            event => {

                let transcript =
                    "";


                for (
                    let i =
                        event.resultIndex;

                    i <
                    event.results.length;

                    i++
                ) {

                    transcript +=
                        event.results[i][0]
                            .transcript;
                }


                transcript =
                    transcript.trim();


                if (
                    input &&
                    transcript
                ) {

                    input.value =
                        transcript;
                }


                const last =
                    event.results[
                        event.results.length - 1
                    ];


                if (
                    last &&
                    last.isFinal &&
                    transcript
                ) {

                    sendMessage(
                        transcript
                    );
                }
            };


        recognition.onerror =
            event => {

                console.error(
                    "Voice error:",
                    event.error
                );

                isListening =
                    false;


                if (micBtn) {

                    micBtn.textContent =
                        "🎤";

                    micBtn.classList.remove(
                        "recording"
                    );
                }
            };


        recognition.onend =
            () => {

                isListening =
                    false;


                if (micBtn) {

                    micBtn.textContent =
                        "🎤";

                    micBtn.classList.remove(
                        "recording"
                    );
                }
            };
    }


    if (micBtn) {

        micBtn.addEventListener(
            "click",
            () => {

                if (!currentUser) {

                    openAuth("login");

                    return;
                }


                if (!recognition) {

                    alert(
                        "Chrome me voice recognition available nahi hai."
                    );

                    return;
                }


                if (isListening) {

                    try {
                        recognition.stop();
                    } catch (e) {}

                    return;
                }


                const language =
                    $("languageSelect")
                        ? $("languageSelect").value
                        : settings.language;


                if (
                    language === "hindi"
                ) {

                    recognition.lang =
                        "hi-IN";

                } else {

                    recognition.lang =
                        "en-IN";
                }


                try {

                    recognition.start();

                } catch (error) {

                    console.error(
                        error
                    );
                }
            }
        );
    }


    // =========================================================
    // TEXT TO SPEECH
    // =========================================================

    if (speakBtn) {

        speakBtn.addEventListener(
            "click",
            () => {

                if (!lastBotMessage) {

                    alert(
                        "Pehle AI ka response aane do."
                    );

                    return;
                }


                if (
                    !("speechSynthesis" in window)
                ) {

                    alert(
                        "Browser voice output support nahi karta."
                    );

                    return;
                }


                window.speechSynthesis.cancel();


                const text =
                    lastBotMessage
                        .replace(
                            /[*#`]/g,
                            ""
                        )
                        .replace(
                            /\n+/g,
                            " "
                        );


                const utterance =
                    new SpeechSynthesisUtterance(
                        text
                    );


                utterance.lang =
                    settings.language ===
                    "hindi"
                        ? "hi-IN"
                        : "en-IN";


                utterance.rate =
                    0.95;


                window.speechSynthesis.speak(
                    utterance
                );
            }
        );
    }


    // =========================================================
    // LOGOUT / LOGIN BUTTON
    // =========================================================

    if (logoutBtn) {

        logoutBtn.addEventListener(
            "click",
            async () => {

                if (!currentUser) {

                    openAuth("login");

                    return;
                }


                try {

                    await api(
                        "/api/logout",
                        {
                            method: "POST"
                        }
                    );


                    currentUser =
                        null;

                    currentChatId =
                        null;

                    updateUserUI();

                    showWelcome();

                    if (recentQuestions) {

                        recentQuestions.innerHTML =
                            `<p class="empty-history">
                                Login to see your chats
                            </p>`;
                    }


                } catch (error) {

                    console.error(
                        "Logout error:",
                        error
                    );
                }
            }
        );
    }


    // =========================================================
    // CLOSE MODALS
    // =========================================================

    document.addEventListener(
        "click",
        event => {

            if (
                event.target.id ===
                "closeHistory"
            ) {

                window.closeHistory();
            }


            if (
                event.target.id ===
                "closeSettings"
            ) {

                window.closeSettings();
            }
        }
    );


    // =========================================================
    // GEMINI STATUS
    // =========================================================

    async function checkStatus() {

        const status =
            $("status");

        if (!status) return;


        try {

            const result =
                await api(
                    "/api/status"
                );


            if (
                result.data.success &&
                result.data.gemini
            ) {

                status.textContent =
                    "● Gemini Online";

            } else {

                status.textContent =
                    "● Gemini Not Configured";
            }


        } catch (error) {

            status.textContent =
                "● Server Error";
        }
    }


    // =========================================================
    // INITIALIZE
    // =========================================================

    async function initialize() {

        console.log(
            "CollegeBot initializing..."
        );


        setupVoice();


        const loggedIn =
            await loadCurrentUser();


        createThemeSelector();


        if (loggedIn) {

            await loadSettings();

            await loadHistory();

        } else {

            if (recentQuestions) {

                recentQuestions.innerHTML =
                    `<p class="empty-history">
                        Login to see your chats
                    </p>`;
            }
        }


        checkStatus();


        showWelcome();


        if (input) {
            input.focus();
        }


        console.log(
            "CollegeBot loaded successfully ✅"
        );
    }


    initialize();

});