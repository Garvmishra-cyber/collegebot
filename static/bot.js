document.addEventListener("DOMContentLoaded", () => {

    console.log("CollegeBot starting...");

    // =========================================================
    // ELEMENTS
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
    // GLOBAL STATE
    // =========================================================

    let currentUser = null;
    let currentChatId = null;

    let isSending = false;

    let lastBotMessage = "";

    let recognition = null;
    let isListening = false;

    let authMode = "login";

    let settings = {
        language: "English",
        theme: "dark",
        voice: true
    };


    // =========================================================
    // BUTTON FINDER
    // =========================================================

    function findButton(text) {

        const buttons =
            Array.from(
                document.querySelectorAll("button")
            );

        return buttons.find(
            button =>
                button.textContent
                    .trim()
                    .toLowerCase()
                    .includes(
                        text.toLowerCase()
                    )
        );
    }


    // =========================================================
    // API HELPER
    // =========================================================

    async function api(
        url,
        options = {}
    ) {

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

        } catch (error) {

            data = {};
        }

        return {
            response,
            data
        };
    }


    // =========================================================
    // HTML ESCAPE
    // =========================================================

    function escapeHTML(text) {

        const div =
            document.createElement("div");

        div.textContent =
            String(text ?? "");

        return div.innerHTML;
    }


    // =========================================================
    // MESSAGE FORMAT
    // =========================================================

    function formatMessage(text) {

        let safe =
            escapeHTML(text);

        safe =
            safe.replace(
                /\*\*(.*?)\*\*/g,
                "<strong>$1</strong>"
            );

        safe =
            safe.replace(
                /`([^`]+)`/g,
                "<code>$1</code>"
            );

        safe =
            safe.replace(
                /\n/g,
                "<br>"
            );

        return safe;
    }


    // =========================================================
    // SCROLL
    // =========================================================

    function scrollBottom() {

        if (!chatArea) return;

        chatArea.scrollTop =
            chatArea.scrollHeight;
    }


    // =========================================================
    // CLEAR CHAT
    // =========================================================

    function clearChat() {

        if (chatArea) {

            chatArea.innerHTML = "";
        }

        lastBotMessage = "";
    }


    // =========================================================
    // ADD MESSAGE
    // =========================================================

    function addMessage(
        role,
        text
    ) {

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


        if (role === "assistant") {

            lastBotMessage =
                String(text ?? "");
        }


        scrollBottom();
    }


    // =========================================================
    // THINKING
    // =========================================================

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


    // =========================================================
    // WELCOME
    // =========================================================

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
    // AUTH MODAL
    // =========================================================

    function createAuthModal() {

        let existing =
            $("collegebotAuthModal");

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
                    Login karke CollegeBot use karo.
                </p>


                <form id="cbAuthForm">


                    <input
                        id="cbName"
                        type="text"
                        placeholder="Full Name"
                        autocomplete="name"
                        style="display:none;"
                    >


                    <input
                        id="cbIdentifier"
                        type="text"
                        placeholder="Email or Username"
                        autocomplete="username"
                        required
                    >


                    <input
                        id="cbEmail"
                        type="email"
                        placeholder="Email"
                        autocomplete="email"
                        style="display:none;"
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
                    Don't have an account? Signup
                </button>

            </div>
        `;


        document.body.appendChild(modal);


        // =====================================================
        // AUTH CSS
        // =====================================================

        const style =
            document.createElement("style");

        style.id =
            "collegebot-auth-style";


        style.textContent = `

            #collegebotAuthModal {

                position: fixed;

                inset: 0;

                background:
                    rgba(0,0,0,.65);

                display: none;

                align-items: center;

                justify-content: center;

                z-index: 99999;

                padding: 20px;
            }


            .cb-auth-box {

                width: min(460px, 95vw);

                background: white;

                border-radius: 24px;

                padding: 35px;

                box-shadow:
                    0 25px 80px
                    rgba(0,0,0,.3);

                position: relative;

                text-align: center;
            }


            .cb-auth-close {

                position: absolute;

                right: 18px;

                top: 12px;

                border: 0;

                background: transparent;

                font-size: 30px;

                cursor: pointer;
            }


            .cb-auth-icon {

                width: 70px;

                height: 70px;

                margin: auto;

                border-radius: 18px;

                display: flex;

                align-items: center;

                justify-content: center;

                background: #292929;

                font-size: 32px;
            }


            .cb-auth-box h2 {

                margin:
                    20px 0 8px;
            }


            .cb-auth-box p {

                color: #777;

                margin-bottom: 20px;
            }


            .cb-auth-box input {

                width: 100%;

                box-sizing: border-box;

                padding: 14px;

                margin: 7px 0;

                border:
                    1px solid #ddd;

                border-radius: 10px;

                font-size: 15px;
            }


            .cb-auth-box input:focus {

                outline: none;

                border-color: #777;
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


            #cbAuthSubmit:disabled {

                opacity: .6;

                cursor: not-allowed;
            }


            .cb-auth-message {

                min-height: 22px;

                margin-top: 12px;

                font-size: 14px;
            }


            .cb-auth-switch {

                border: 0;

                background: transparent;

                margin-top: 15px;

                cursor: pointer;

                color: #555;
            }

        `;


        document.head.appendChild(style);


        $("cbAuthClose")
            .addEventListener(
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


        $("cbAuthSwitch")
            .addEventListener(
                "click",
                toggleAuthMode
            );


        $("cbAuthForm")
            .addEventListener(
                "submit",
                submitAuth
            );


        return modal;
    }


    // =========================================================
    // OPEN AUTH
    // =========================================================

    function openAuth(
        mode = "login"
    ) {

        authMode = mode;

        const modal =
            createAuthModal();

        updateAuthUI();

        modal.style.display =
            "flex";
    }


    // =========================================================
    // CLOSE AUTH
    // =========================================================

    function closeAuth() {

        const modal =
            $("collegebotAuthModal");

        if (modal) {

            modal.style.display =
                "none";
        }
    }


    // =========================================================
    // AUTH UI
    // =========================================================

    function updateAuthUI() {

        const title =
            $("cbAuthTitle");

        const subtitle =
            $("cbAuthSubtitle");

        const name =
            $("cbName");

        const email =
            $("cbEmail");

        const identifier =
            $("cbIdentifier");

        const submit =
            $("cbAuthSubmit");

        const switchBtn =
            $("cbAuthSwitch");

        const message =
            $("cbAuthMessage");


        if (!title) return;


        message.textContent = "";


        if (authMode === "signup") {

            title.textContent =
                "Create CollegeBot Account";

            subtitle.textContent =
                "Account create karke CollegeBot use karo.";

            name.style.display =
                "block";

            email.style.display =
                "block";

            name.required = true;

            email.required = true;

            identifier.placeholder =
                "Username";

            submit.textContent =
                "Create Account";

            switchBtn.textContent =
                "Already have an account? Login";

        } else {

            title.textContent =
                "Login to CollegeBot";

            subtitle.textContent =
                "Apne account se login karo.";

            name.style.display =
                "none";

            email.style.display =
                "none";

            name.required = false;

            email.required = false;

            identifier.placeholder =
                "Email or Username";

            submit.textContent =
                "Login";

            switchBtn.textContent =
                "Don't have an account? Signup";
        }
    }


    // =========================================================
    // TOGGLE LOGIN/SIGNUP
    // =========================================================

    function toggleAuthMode() {

        authMode =
            authMode === "login"
                ? "signup"
                : "login";

        updateAuthUI();
    }


    // =========================================================
    // LOGIN / SIGNUP
    // =========================================================

    async function submitAuth(event) {

        event.preventDefault();


        const messageBox =
            $("cbAuthMessage");

        const submit =
            $("cbAuthSubmit");


        const name =
            $("cbName")
                ?.value
                .trim() || "";


        const identifier =
            $("cbIdentifier")
                ?.value
                .trim() || "";


        const email =
            $("cbEmail")
                ?.value
                .trim() || "";


        const password =
            $("cbPassword")
                ?.value || "";


        if (!identifier) {

            messageBox.textContent =
                "Username/email enter karo.";

            return;
        }


        if (!password) {

            messageBox.textContent =
                "Password enter karo.";

            return;
        }


        if (
            authMode === "signup" &&
            !name
        ) {

            messageBox.textContent =
                "Name enter karo.";

            return;
        }


        if (
            authMode === "signup" &&
            !email
        ) {

            messageBox.textContent =
                "Email enter karo.";

            return;
        }


        if (
            authMode === "signup" &&
            password.length < 6
        ) {

            messageBox.textContent =
                "Password minimum 6 characters ka hona chahiye.";

            return;
        }


        submit.disabled = true;


        submit.textContent =
            authMode === "login"
                ? "Logging in..."
                : "Creating account...";


        try {

            let result;


            if (authMode === "signup") {

                result =
                    await api(
                        "/api/signup",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({

                                    name,

                                    username:
                                        identifier,

                                    email,

                                    password
                                })
                        }
                    );

            } else {

                result =
                    await api(
                        "/api/login",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({

                                    identifier,

                                    username:
                                        identifier,

                                    email:
                                        identifier,

                                    password
                                })
                        }
                    );
            }


            if (!result.response.ok) {

                throw new Error(
                    result.data.message ||
                    result.data.error ||
                    "Authentication failed."
                );
            }


            if (
                result.data.success === false
            ) {

                throw new Error(
                    result.data.message ||
                    "Authentication failed."
                );
            }


            const loggedIn =
                await loadCurrentUser();


            if (!loggedIn) {

                throw new Error(
                    "Session create nahi hui."
                );
            }


            messageBox.textContent =
                authMode === "login"
                    ? "Login successful ✅"
                    : "Account created successfully ✅";


            await loadSettings();

            await loadHistory();


            setTimeout(
                () => {

                    closeAuth();

                    showWelcome();

                },
                400
            );


        } catch (error) {

            console.error(
                "Authentication error:",
                error
            );


            messageBox.textContent =
                error.message ||
                "Something went wrong.";

        } finally {

            submit.disabled = false;

            submit.textContent =
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


                updateUserUI();


                if (
                    result.data.settings
                ) {

                    settings = {
                        ...settings,
                        ...result.data.settings
                    };

                    applyTheme(
                        settings.theme
                    );
                }


                return true;
            }


            currentUser = null;

            updateUserUI();

            return false;


        } catch (error) {

            console.error(
                "Current user error:",
                error
            );

            currentUser = null;

            updateUserUI();

            return false;
        }
    }


    // =========================================================
    // USER UI
    // =========================================================

    function updateUserUI() {

        if (!logoutBtn) return;


        if (currentUser) {

            logoutBtn.textContent =
                "🚪 Logout";

        } else {

            logoutBtn.textContent =
                "🔐 Login / Signup";
        }
    }


    // =========================================================
    // CHAT SEND
    // =========================================================

    async function sendMessage(
        customMessage = null
    ) {

        if (isSending) return;


        // -----------------------------------------------------
        // LOGIN CHECK
        // -----------------------------------------------------

        if (!currentUser) {

            openAuth("login");

            return;
        }


        // -----------------------------------------------------
        // MESSAGE
        // -----------------------------------------------------

        const message =
            customMessage !== null
                ? String(
                    customMessage
                ).trim()
                : (
                    input
                        ? input.value.trim()
                        : ""
                );


        if (!message) return;


        // -----------------------------------------------------
        // LOCK
        // -----------------------------------------------------

        isSending = true;


        if (sendBtn) {

            sendBtn.disabled = true;
        }


        if (
            input &&
            customMessage === null
        ) {

            input.value = "";
        }


        // -----------------------------------------------------
        // USER MESSAGE
        // -----------------------------------------------------

        addMessage(
            "user",
            message
        );


        const thinking =
            showThinking();


        try {

            // -------------------------------------------------
            // API CALL
            // -------------------------------------------------

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


            // -------------------------------------------------
            // SESSION EXPIRED
            // -------------------------------------------------

            if (
                result.response.status ===
                401
            ) {

                currentUser = null;

                updateUserUI();

                openAuth("login");

                return;
            }


            // -------------------------------------------------
            // ERROR
            // -------------------------------------------------

            if (!result.response.ok) {

                throw new Error(
                    result.data.message ||
                    result.data.error ||
                    "Chat request failed."
                );
            }


            // -------------------------------------------------
            // RESPONSE
            // -------------------------------------------------

            const answer =
                result.data.answer ||
                result.data.reply ||
                result.data.response ||
                result.data.message;


            if (!answer) {

                throw new Error(
                    "Bot ne empty response diya."
                );
            }


            // -------------------------------------------------
            // SAVE CHAT ID IF AVAILABLE
            // -------------------------------------------------

            if (
                result.data.chat_id
            ) {

                currentChatId =
                    result.data.chat_id;
            }


            // -------------------------------------------------
            // BOT MESSAGE
            // -------------------------------------------------

            addMessage(
                "assistant",
                answer
            );


            // -------------------------------------------------
            // IMPORTANT:
            // REFRESH HISTORY AFTER EVERY MESSAGE
            // -------------------------------------------------

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
                "Sorry 😕 Response nahi aa paaya.\n\nError: " +
                error.message
            );


        } finally {

            isSending = false;


            if (sendBtn) {

                sendBtn.disabled = false;
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

        currentChatId = null;

        showWelcome();

        if (input) {

            input.value = "";

            input.focus();
        }
    }


    // =========================================================
    // 🔥 QUICK QUESTIONS
    // =========================================================
    //
    // THIS IS THE IMPORTANT PART
    //
    // Your HTML has:
    //
    // data-question="What is the attendance requirement?"
    //
    // So clicking the button directly calls sendMessage()
    //
    // =========================================================

    function setupQuickQuestions() {

        const buttons =
            document.querySelectorAll(
                "[data-question]"
            );


        console.log(
            "Quick question buttons found:",
            buttons.length
        );


        buttons.forEach(
            button => {

                // Avoid duplicate event listener

                if (
                    button.dataset.cbBound ===
                    "true"
                ) {

                    return;
                }


                button.dataset.cbBound =
                    "true";


                button.addEventListener(
                    "click",
                    event => {

                        event.preventDefault();

                        event.stopPropagation();


                        const question =
                            button
                                .getAttribute(
                                    "data-question"
                                );


                        console.log(
                            "Quick question clicked:",
                            question
                        );


                        if (!question) {

                            console.warn(
                                "No data-question found."
                            );

                            return;
                        }


                        sendMessage(
                            question
                        );
                    }
                );
            }
        );


        // -----------------------------------------------------
        // OLD .quick-question SUPPORT
        // -----------------------------------------------------

        document
            .querySelectorAll(
                ".quick-question"
            )
            .forEach(
                button => {

                    if (
                        button.dataset.cbBound2 ===
                        "true"
                    ) {

                        return;
                    }


                    button.dataset.cbBound2 =
                        "true";


                    button.addEventListener(
                        "click",
                        event => {

                            event.preventDefault();


                            const question =
                                button.dataset.question ||
                                button.textContent.trim();


                            if (question) {

                                sendMessage(
                                    question
                                );
                            }
                        }
                    );
                }
            );
    }


    // =========================================================
    // GLOBAL QUICK QUESTION
    // =========================================================

    window.askQuickQuestion =
        function(question) {

            if (!question) return;

            sendMessage(question);
        };


    // =========================================================
    // HISTORY
    // =========================================================

    async function loadHistory() {

        if (!currentUser) {

            if (recentQuestions) {

                recentQuestions.innerHTML = `
                    <p class="empty-history">
                        Login to see your chats
                    </p>
                `;
            }


            if (historyList) {

                historyList.innerHTML = `
                    <p class="empty-history">
                        Login to see your chats
                    </p>
                `;
            }


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

                currentUser = null;

                updateUserUI();

                return;
            }


            if (!result.response.ok) {

                throw new Error(
                    result.data.message ||
                    "History failed."
                );
            }


            const chats =
                result.data.history ||
                result.data.chats ||
                [];


            console.log(
                "History loaded:",
                chats
            );


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


    // =========================================================
    // RECENT CHATS
    // =========================================================

    function renderRecent(chats) {

        if (!recentQuestions) return;


        recentQuestions.innerHTML =
            "";


        if (
            !chats ||
            chats.length === 0
        ) {

            recentQuestions.innerHTML = `
                <p class="empty-history">
                    No chats yet
                </p>
            `;

            return;
        }


        chats
            .slice()
            .reverse()
            .slice(0, 10)
            .forEach(
                chat => {

                    const item =
                        document.createElement(
                            "div"
                        );


                    item.className =
                        "recent-chat-item";


                    const text =
                        chat.user_message ||
                        "New Chat";


                    item.textContent =
                        text.length > 45
                            ? text.substring(
                                0,
                                45
                            ) + "..."
                            : text;


                    item.title =
                        text;


                    item.style.cursor =
                        "pointer";


                    item.addEventListener(
                        "click",
                        () => {

                            loadChat(
                                chat.id
                            );
                        }
                    );


                    recentQuestions
                        .appendChild(
                            item
                        );
                }
            );
    }


    // =========================================================
    // FULL HISTORY
    // =========================================================

    function renderHistory(chats) {

        if (!historyList) return;


        historyList.innerHTML =
            "";


        if (
            !chats ||
            chats.length === 0
        ) {

            historyList.innerHTML = `
                <p class="empty-history">
                    No chats yet
                </p>
            `;

            return;
        }


        chats
            .slice()
            .reverse()
            .forEach(
                chat => {

                    const item =
                        document.createElement(
                            "div"
                        );


                    item.className =
                        "history-item";


                    const question =
                        chat.user_message ||
                        "New Chat";


                    const answer =
                        chat.bot_response ||
                        "";


                    const date =
                        chat.created_at ||
                        "";


                    item.innerHTML = `

                        <div class="history-question">
                            ${escapeHTML(
                                question
                            )}
                        </div>

                        <div class="history-preview">
                            ${escapeHTML(
                                answer.length > 100
                                    ? answer.substring(
                                        0,
                                        100
                                    ) + "..."
                                    : answer
                            )}
                        </div>

                        <div class="history-time">
                            ${escapeHTML(
                                date
                            )}
                        </div>

                        <button
                            type="button"
                            class="history-delete"
                            data-id="${chat.id}">
                            Delete
                        </button>
                    `;


                    // -----------------------------------------
                    // OPEN CHAT
                    // -----------------------------------------

                    item.addEventListener(
                        "click",
                        event => {

                            if (
                                event.target.closest(
                                    ".history-delete"
                                )
                            ) {

                                return;
                            }


                            loadChat(
                                chat.id
                            );
                        }
                    );


                    // -----------------------------------------
                    // DELETE
                    // -----------------------------------------

                    const deleteBtn =
                        item.querySelector(
                            ".history-delete"
                        );


                    if (deleteBtn) {

                        deleteBtn.addEventListener(
                            "click",
                            async event => {

                                event.stopPropagation();


                                await deleteChat(
                                    chat.id
                                );
                            }
                        );
                    }


                    historyList
                        .appendChild(
                            item
                        );
                }
            );
    }


    // =========================================================
    // LOAD ONE HISTORY CHAT
    // =========================================================

    async function loadChat(
        chatId
    ) {

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
                    "Chat load failed."
                );
            }


            const chat =
                result.data.chat;


            if (!chat) {

                throw new Error(
                    "Chat nahi mili."
                );
            }


            currentChatId =
                chat.id;


            clearChat();


            if (
                chat.user_message
            ) {

                addMessage(
                    "user",
                    chat.user_message
                );
            }


            if (
                chat.bot_response
            ) {

                addMessage(
                    "assistant",
                    chat.bot_response
                );
            }


            closeHistory();


            if (input) {

                input.focus();
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


    // =========================================================
    // DELETE CHAT
    // =========================================================

    async function deleteChat(
        chatId
    ) {

        const ok =
            confirm(
                "Ye chat delete karni hai?"
            );


        if (!ok) return;


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
                "Delete history error:",
                error
            );


            alert(
                "Chat delete nahi hui."
            );
        }
    }


    // =========================================================
    // CLEAR ALL HISTORY
    // =========================================================

    async function clearHistory() {

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
                    "/api/history/clear",
                    {
                        method: "POST"
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
                "History clear ho gayi ✅"
            );


        } catch (error) {

            console.error(
                "Clear history error:",
                error
            );


            alert(
                "History clear nahi hui."
            );
        }
    }


    // =========================================================
    // HISTORY MODAL
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


    function closeHistory() {

        if (!historyModal) return;


        historyModal.classList.add(
            "hidden"
        );


        historyModal.style.display =
            "none";
    }


    // =========================================================
    // THEME
    // =========================================================

    function applyTheme(
        theme
    ) {

        if (!theme) {

            theme = "dark";
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
    }


    // =========================================================
    // LOAD SETTINGS
    // =========================================================

    async function loadSettings() {

        if (!currentUser) return;


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
                    $("languageSelect");


                if (language) {

                    language.value =
                        settings.language ||
                        "English";
                }


                const voice =
                    $("voiceToggle");


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


    // =========================================================
    // SAVE SETTINGS
    // =========================================================

    async function saveSettings() {

        if (!currentUser) {

            openAuth("login");

            return;
        }


        const theme =
            $("themeSelect")
                ? $("themeSelect").value
                : settings.theme;


        const language =
            $("languageSelect")
                ? $("languageSelect").value
                : settings.language;


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


            closeSettings();


        } catch (error) {

            console.error(
                "Settings error:",
                error
            );


            alert(
                "Settings save nahi hui: " +
                error.message
            );
        }
    }


    // =========================================================
    // SETTINGS MODAL
    // =========================================================

    function showSettings() {

        if (!currentUser) {

            openAuth("login");

            return;
        }


        loadSettings();


        if (settingsModal) {

            settingsModal.classList.remove(
                "hidden"
            );

            settingsModal.style.display =
                "flex";
        }
    }


    function closeSettings() {

        if (!settingsModal) return;


        settingsModal.classList.add(
            "hidden"
        );


        settingsModal.style.display =
            "none";
    }


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
            false;


        recognition.lang =
            "hi-IN";


        recognition.onstart =
            () => {

                isListening = true;

                if (micBtn) {

                    micBtn.textContent =
                        "🛑";

                    micBtn.classList.add(
                        "listening"
                    );
                }
            };


        recognition.onresult =
            event => {

                const transcript =
                    event
                        .results[0][0]
                        .transcript;


                if (input) {

                    input.value =
                        transcript;
                }
            };


        recognition.onerror =
            error => {

                console.error(
                    "Voice error:",
                    error
                );
            };


        recognition.onend =
            () => {

                isListening =
                    false;


                if (micBtn) {

                    micBtn.textContent =
                        "🎤";

                    micBtn.classList.remove(
                        "listening"
                    );
                }
            };
    }


    // =========================================================
    // TOGGLE VOICE
    // =========================================================

    function toggleVoice() {

        if (!recognition) {

            alert(
                "Voice input browser me supported nahi hai."
            );

            return;
        }


        if (isListening) {

            recognition.stop();

            return;
        }


        try {

            recognition.lang =
                settings.language ===
                "English"
                    ? "en-IN"
                    : "hi-IN";


            recognition.start();

        } catch (error) {

            console.error(
                error
            );
        }
    }


    // =========================================================
    // TEXT TO SPEECH
    // =========================================================

    function speakText(
        text
    ) {

        if (!text) return;


        if (
            !window.speechSynthesis
        ) {

            alert(
                "Text to speech supported nahi hai."
            );

            return;
        }


        window.speechSynthesis.cancel();


        const utterance =
            new SpeechSynthesisUtterance(
                text
            );


        utterance.lang =
            settings.language ===
            "English"
                ? "en-IN"
                : "hi-IN";


        utterance.rate =
            0.95;


        window.speechSynthesis
            .speak(
                utterance
            );
    }


    // =========================================================
    // STATUS
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
    // BUTTON EVENTS
    // =========================================================

    if (sendBtn) {

        sendBtn.addEventListener(
            "click",
            () => {

                sendMessage();
            }
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


    if (micBtn) {

        micBtn.addEventListener(
            "click",
            toggleVoice
        );
    }


    if (speakBtn) {

        speakBtn.addEventListener(
            "click",
            () => {

                if (lastBotMessage) {

                    speakText(
                        lastBotMessage
                    );
                }
            }
        );
    }


    if (newChatBtn) {

        newChatBtn.addEventListener(
            "click",
            newChat
        );
    }


    if (historyBtn) {

        historyBtn.addEventListener(
            "click",
            showHistory
        );
    }


    if (settingsBtn) {

        settingsBtn.addEventListener(
            "click",
            showSettings
        );
    }


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


                    if (
                        recentQuestions
                    ) {

                        recentQuestions.innerHTML = `
                            <p class="empty-history">
                                Login to see your chats
                            </p>
                        `;
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
    // CLEAR HISTORY BUTTON
    // =========================================================

    const clearHistoryBtn =
        $("clearHistoryBtn");


    if (clearHistoryBtn) {

        clearHistoryBtn.addEventListener(
            "click",
            clearHistory
        );
    }


    // =========================================================
    // SAVE SETTINGS BUTTON
    // =========================================================

    const saveSettingsBtn =
        $("saveSettingsBtn");


    if (saveSettingsBtn) {

        saveSettingsBtn.addEventListener(
            "click",
            saveSettings
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

                closeHistory();
            }


            if (
                event.target.id ===
                "closeSettings"
            ) {

                closeSettings();
            }
        }
    );


    // =========================================================
    // GLOBAL FUNCTIONS
    // =========================================================

    window.sendMessage =
        sendMessage;

    window.newChat =
        newChat;

    window.showHistory =
        showHistory;

    window.closeHistory =
        closeHistory;

    window.showSettings =
        showSettings;

    window.closeSettings =
        closeSettings;

    window.openAuth =
        openAuth;

    window.closeAuth =
        closeAuth;

    window.toggleAuthMode =
        toggleAuthMode;

    window.loadHistory =
        loadHistory;

    window.loadChat =
        loadChat;

    window.deleteChat =
        deleteChat;

    window.clearHistory =
        clearHistory;

    window.logout =
        async function() {

            if (logoutBtn) {

                logoutBtn.click();
            }
        };

    window.speakText =
        speakText;


    // =========================================================
    // INITIALIZE
    // =========================================================

    async function initialize() {

        console.log(
            "CollegeBot initializing..."
        );


        // IMPORTANT:
        // Bind quick questions FIRST

        setupQuickQuestions();


        setupVoice();


        const loggedIn =
            await loadCurrentUser();


        if (loggedIn) {

            await loadSettings();

            await loadHistory();

        } else {

            if (recentQuestions) {

                recentQuestions.innerHTML = `
                    <p class="empty-history">
                        Login to see your chats
                    </p>
                `;
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


        console.log(
            "Quick questions ready ✅"
        );
    }


    // =========================================================
    // START
    // =========================================================

    initialize();

});