/* =========================================================
   NEXUS CONNECT 2030
   Nexus Buildsolutions Limited

   Frontend Application Controller
   ---------------------------------------------------------
   Responsibilities:
   - Navigation
   - Search
   - Quick search
   - Request workflow
   - Nexus identity discovery
   - Notifications
   - Profile interaction
   - API foundation
   - UI state management
   ========================================================= */

"use strict";


/* =========================================================
   01. APPLICATION CONFIGURATION
   ========================================================= */

const NexusApp = {
    name: "Nexus Connect",

    version: "2030.1",

    environment: "production-ready",

    api: {
        /*
         * Keep this empty while the frontend is being developed.
         *
         * Later, when the Render backend is live, this can become:
         *
         * baseUrl: "https://your-nexus-connect.onrender.com/api"
         */
        baseUrl: "",

        timeout: 15000
    },

    state: {
        mobileMenuOpen: false,

        searchQuery: "",

        searchLoading: false,

        searchResults: [],

        notificationsOpen: false,

        profileOpen: false,

        currentUser: null,

        lastSearch: null,

        initialized: false
    }
};


/* =========================================================
   02. DOM HELPERS
   ========================================================= */

const NexusDOM = {

    get(selector, parent = document) {
        return parent.querySelector(selector);
    },

    getAll(selector, parent = document) {
        return Array.from(
            parent.querySelectorAll(selector)
        );
    },

    create(tag, options = {}) {

        const element = document.createElement(tag);

        if (options.className) {
            element.className = options.className;
        }

        if (options.text) {
            element.textContent = options.text;
        }

        if (options.attributes) {

            Object.entries(options.attributes)
                .forEach(([key, value]) => {

                    element.setAttribute(
                        key,
                        value
                    );

                });

        }

        return element;
    },

    show(element) {

        if (!element) return;

        element.hidden = false;

        element.removeAttribute(
            "aria-hidden"
        );
    },

    hide(element) {

        if (!element) return;

        element.hidden = true;

        element.setAttribute(
            "aria-hidden",
            "true"
        );
    },

    toggle(element, force = null) {

        if (!element) return;

        const shouldShow =
            force !== null
                ? force
                : element.hidden;

        if (shouldShow) {
            this.show(element);
        } else {
            this.hide(element);
        }
    }
};


/* =========================================================
   03. APPLICATION INITIALIZATION
   ========================================================= */

function initializeNexusConnect() {

    if (NexusApp.state.initialized) {
        return;
    }

    console.info(
        `[Nexus Connect ${NexusApp.version}] Initializing...`
    );

    initializeNavigation();

    initializeMobileNavigation();

    initializeSearch();

    initializeQuickSearch();

    initializeServiceButtons();

    initializeRequestActions();

    initializeNotifications();

    initializeProfile();

    initializeSmoothNavigation();

    initializeKeyboardShortcuts();

    initializeGlobalErrors();

    NexusApp.state.initialized = true;

    console.info(
        "[Nexus Connect] Frontend initialized successfully."
    );
}


/* =========================================================
   04. NAVIGATION
   ========================================================= */

function initializeNavigation() {

    const links = NexusDOM.getAll(
        ".nexus-navigation__link"
    );

    links.forEach(link => {

        link.addEventListener(
            "click",
            event => {

                const target =
                    link.getAttribute("href");

                if (!target) {
                    return;
                }

                if (
                    target.startsWith("#")
                ) {

                    event.preventDefault();

                    navigateToSection(
                        target
                    );

                    setActiveNavigation(
                        link
                    );
                }

            }
        );

    });
}


function setActiveNavigation(activeLink) {

    const links = NexusDOM.getAll(
        ".nexus-navigation__link"
    );

    links.forEach(link => {

        link.classList.remove(
            "is-active"
        );

        link.setAttribute(
            "aria-current",
            "false"
        );

    });

    if (activeLink) {

        activeLink.classList.add(
            "is-active"
        );

        activeLink.setAttribute(
            "aria-current",
            "page"
        );
    }
}


function navigateToSection(selector) {

    const target =
        NexusDOM.get(selector);

    if (!target) {
        return;
    }

    target.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


/* =========================================================
   05. MOBILE NAVIGATION
   ========================================================= */

function initializeMobileNavigation() {

    const menuButton =
        NexusDOM.get(
            ".nexus-mobile-menu-button"
        );

    if (!menuButton) {
        return;
    }

    menuButton.addEventListener(
        "click",
        toggleMobileNavigation
    );
}


function toggleMobileNavigation() {

    let mobileNavigation =
        NexusDOM.get(
            ".nexus-mobile-navigation"
        );

    if (!mobileNavigation) {

        mobileNavigation =
            createMobileNavigation();

        document
            .querySelector(".nexus-header")
            ?.appendChild(
                mobileNavigation
            );
    }

    NexusApp.state.mobileMenuOpen =
        !NexusApp.state.mobileMenuOpen;

    NexusDOM.toggle(
        mobileNavigation,
        NexusApp.state.mobileMenuOpen
    );

    const button =
        NexusDOM.get(
            ".nexus-mobile-menu-button"
        );

    if (button) {

        button.setAttribute(
            "aria-expanded",
            String(
                NexusApp.state.mobileMenuOpen
            )
        );
    }
}


function createMobileNavigation() {

    const navigation =
        NexusDOM.create(
            "nav",
            {
                className:
                    "nexus-mobile-navigation"
            }
        );

    navigation.setAttribute(
        "aria-label",
        "Mobile navigation"
    );

    const links = [
        {
            label: "Discover",
            target: "#discover"
        },
        {
            label: "Services",
            target: "#services"
        },
        {
            label: "Certified Network",
            target: "#network"
        },
        {
            label: "Trust",
            target: "#trust"
        }
    ];

    links.forEach(item => {

        const link =
            NexusDOM.create(
                "a",
                {
                    text: item.label,
                    attributes: {
                        href: item.target
                    }
                }
            );

        link.addEventListener(
            "click",
            () => {

                NexusApp.state.mobileMenuOpen =
                    false;

                NexusDOM.hide(
                    navigation
                );

            }
        );

        navigation.appendChild(
            link
        );

    });

    navigation.hidden = true;

    return navigation;
}


/* =========================================================
   06. GLOBAL SEARCH
   ========================================================= */

function initializeSearch() {

    const searchForm =
        NexusDOM.get(
            ".nexus-search"
        );

    const searchInput =
        NexusDOM.get(
            ".nexus-search__input"
        );

    if (!searchForm || !searchInput) {
        return;
    }

    searchForm.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            const query =
                searchInput.value.trim();

            if (!query) {

                showSearchStatus(
                    "Please enter a person, service, business, or location."
                );

                searchInput.focus();

                return;
            }

            await performSearch(
                query
            );
        }
    );

    searchInput.addEventListener(
        "input",
        () => {

            NexusApp.state.searchQuery =
                searchInput.value.trim();

        }
    );
}


/* =========================================================
   07. SEARCH ENGINE
   ========================================================= */

async function performSearch(query) {

    NexusApp.state.searchQuery =
        query;

    NexusApp.state.searchLoading =
        true;

    NexusApp.state.lastSearch =
        new Date().toISOString();

    showSearchStatus(
        `Searching Nexus Connect for "${query}"...`
    );

    try {

        /*
         * Backend search will eventually use:
         *
         * GET /api/search?q=technician+abuja
         *
         * For now we use the API layer, which safely
         * falls back to demonstration results.
         */

        const response =
            await NexusAPI.search(
                query
            );

        NexusApp.state.searchResults =
            response.results || [];

        renderSearchResults(
            NexusApp.state.searchResults,
            query
        );

    } catch (error) {

        console.error(
            "[Nexus Search]",
            error
        );

        showSearchStatus(
            "Nexus Connect could not complete the search. Please try again."
        );

    } finally {

        NexusApp.state.searchLoading =
            false;
    }
}


/* =========================================================
   08. SEARCH RESULTS
   ========================================================= */

function renderSearchResults(
    results,
    query
) {

    const existing =
        NexusDOM.get(
            "#nexus-search-results"
        );

    if (existing) {
        existing.remove();
    }

    const container =
        NexusDOM.create(
            "div",
            {
                className:
                    "nexus-search-results"
            }
        );

    container.id =
        "nexus-search-results";

    if (!results.length) {

        container.innerHTML = `
            <div class="nexus-search-result-empty">
                <strong>No direct match found yet.</strong>
                <p>
                    Try a service, location, person's name,
                    company, or professional category.
                </p>
            </div>
        `;

    } else {

        results.forEach(result => {

            container.appendChild(
                createSearchResultCard(
                    result
                )
            );

        });
    }

    const search =
        NexusDOM.get(
            ".nexus-search"
        );

    if (search) {

        search.insertAdjacentElement(
            "afterend",
            container
        );
    }

    showSearchStatus(
        results.length
            ? `${results.length} Nexus result(s) found for "${query}".`
            : `No direct result found for "${query}".`
    );
}


function createSearchResultCard(result) {

    const card =
        NexusDOM.create(
            "article",
            {
                className:
                    "nexus-search-result-card"
            }
        );

    const name =
        escapeHTML(
            result.name ||
            "Nexus Network Member"
        );

    const role =
        escapeHTML(
            result.role ||
            "Verified Professional"
        );

    const location =
        escapeHTML(
            result.location ||
            "Nigeria"
        );

    const badge =
        escapeHTML(
            result.badge ||
            "Verified"
        );

    card.innerHTML = `
        <div class="nexus-search-result-card__identity">
            <div class="nexus-search-result-card__avatar">
                ${getInitials(name)}
            </div>

            <div>
                <strong>${name}</strong>

                <span>
                    ${role}
                </span>
            </div>
        </div>

        <div class="nexus-search-result-card__meta">
            <span>${location}</span>
            <span>${badge}</span>
        </div>

        <button
            type="button"
            class="nexus-button nexus-button--secondary nexus-connect-result"
        >
            View profile
        </button>
    `;

    const button =
        NexusDOM.get(
            ".nexus-connect-result",
            card
        );

    if (button) {

        button.addEventListener(
            "click",
            () => {

                openProfessionalProfile(
                    result
                );

            }
        );
    }

    return card;
}


/* =========================================================
   09. QUICK SEARCH
   ========================================================= */

function initializeQuickSearch() {

    const buttons =
        NexusDOM.getAll(
            ".nexus-quick-search button"
        );

    const input =
        NexusDOM.get(
            ".nexus-search__input"
        );

    buttons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const query =
                    button.textContent.trim();

                if (input) {

                    input.value =
                        query;

                    input.dispatchEvent(
                        new Event(
                            "input"
                        )
                    );

                    input.focus();
                }

                performSearch(
                    query
                );
            }
        );

    });
}


/* =========================================================
   10. SERVICE BUTTONS
   ========================================================= */

function initializeServiceButtons() {

    const buttons =
        NexusDOM.getAll(
            ".nexus-text-button"
        );

    buttons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const card =
                    button.closest(
                        ".nexus-capability-card"
                    );

                if (!card) {
                    return;
                }

                const heading =
                    NexusDOM.get(
                        "h3",
                        card
                    );

                if (!heading) {
                    return;
                }

                const service =
                    heading.textContent.trim();

                openServiceRequest(
                    service
                );
            }
        );

    });
}


/* =========================================================
   11. REQUEST WORKFLOW
   ========================================================= */

function initializeRequestActions() {

    const requestButtons =
        NexusDOM.getAll(
            "[data-request-service]"
        );

    requestButtons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const service =
                    button.dataset.requestService;

                openServiceRequest(
                    service
                );

            }
        );

    });
}


function openServiceRequest(service) {

    const safeService =
        escapeHTML(
            service ||
            "professional service"
        );

    const confirmed =
        window.confirm(
            `Start a Nexus Connect request for ${safeService}?`
        );

    if (!confirmed) {
        return;
    }

    showToast(
        `Request started for ${safeService}.`
    );

    /*
     * Future implementation:
     *
     * NexusAPI.createRequest({
     *     service: service,
     *     location: userLocation,
     *     priority: "standard"
     * });
     */
}


/* =========================================================
   12. PROFESSIONAL PROFILE
   ========================================================= */

function openProfessionalProfile(
    professional
) {

    const name =
        professional?.name ||
        "Nexus Professional";

    const role =
        professional?.role ||
        "Certified Professional";

    const location =
        professional?.location ||
        "Nigeria";

    showToast(
        `${name} — ${role} — ${location}`
    );

    /*
     * Future implementation:
     *
     * /connect/profile/:id
     *
     * The profile will eventually display:
     *
     * - Nexus verification status
     * - Professional category
     * - Service areas
     * - Company affiliation
     * - Certifications
     * - Ratings
     * - Availability
     * - Contact permissions
     * - Work history
     * - Nexus Connect trust score
     */
}


/* =========================================================
   13. NOTIFICATIONS
   ========================================================= */

function initializeNotifications() {

    const button =
        NexusDOM.get(
            ".nexus-icon-button"
        );

    if (!button) {
        return;
    }

    button.addEventListener(
        "click",
        () => {

            NexusApp.state.notificationsOpen =
                !NexusApp.state.notificationsOpen;

            if (
                NexusApp.state.notificationsOpen
            ) {

                showToast(
                    "No new priority notifications."
                );

            }

        }
    );
}


/* =========================================================
   14. PROFILE
   ========================================================= */

function initializeProfile() {

    const profileButton =
        NexusDOM.get(
            ".nexus-profile-button"
        );

    if (!profileButton) {
        return;
    }

    profileButton.addEventListener(
        "click",
        () => {

            NexusApp.state.profileOpen =
                !NexusApp.state.profileOpen;

            if (
                NexusApp.state.profileOpen
            ) {

                showToast(
                    "Profile controls will be connected to authentication."
                );

            }

        }
    );
}


/* =========================================================
   15. SMOOTH NAVIGATION
   ========================================================= */

function initializeSmoothNavigation() {

    const anchors =
        NexusDOM.getAll(
            'a[href^="#"]'
        );

    anchors.forEach(anchor => {

        anchor.addEventListener(
            "click",
            event => {

                const target =
                    anchor.getAttribute(
                        "href"
                    );

                if (
                    !target ||
                    target === "#"
                ) {
                    return;
                }

                const element =
                    NexusDOM.get(
                        target
                    );

                if (!element) {
                    return;
                }

                event.preventDefault();

                navigateToSection(
                    target
                );

            }
        );
    });
}


/* =========================================================
   16. KEYBOARD SHORTCUTS
   ========================================================= */

function initializeKeyboardShortcuts() {

    document.addEventListener(
        "keydown",
        event => {

            /*
             * CTRL + K
             * Open Nexus Connect search.
             */

            if (
                (event.ctrlKey ||
                 event.metaKey) &&
                event.key.toLowerCase() === "k"
            ) {

                event.preventDefault();

                const input =
                    NexusDOM.get(
                        ".nexus-search__input"
                    );

                if (input) {

                    input.focus();

                    input.select();
                }
            }


            /*
             * ESC
             * Close temporary UI.
             */

            if (
                event.key === "Escape"
            ) {

                closeTemporaryUI();
            }

        }
    );
}


function closeTemporaryUI() {

    const mobileNavigation =
        NexusDOM.get(
            ".nexus-mobile-navigation"
        );

    if (mobileNavigation) {

        NexusDOM.hide(
            mobileNavigation
        );

        NexusApp.state.mobileMenuOpen =
            false;
    }
}


/* =========================================================
   17. API CLIENT
   ========================================================= */

const NexusAPI = {

    async request(
        endpoint,
        options = {}
    ) {

        const controller =
            new AbortController();

        const timeout =
            setTimeout(
                () => {
                    controller.abort();
                },
                NexusApp.api.timeout
            );

        const url =
            buildAPIUrl(
                endpoint
            );

        try {

            const response =
                await fetch(
                    url,
                    {
                        ...options,

                        headers: {
                            "Content-Type":
                                "application/json",

                            "Accept":
                                "application/json",

                            ...(options.headers || {})
                        },

                        signal:
                            controller.signal
                    }
                );

            clearTimeout(
                timeout
            );

            if (!response.ok) {

                throw new Error(
                    `API request failed: ${response.status}`
                );
            }

            return await response.json();

        } catch (error) {

            clearTimeout(
                timeout
            );

            throw error;
        }
    },


    async search(query) {

        /*
         * If the Render API has not been configured yet,
         * return controlled demonstration data.
         */

        if (!NexusApp.api.baseUrl) {

            return {
                success: true,

                results:
                    getDemoSearchResults(
                        query
                    )
            };
        }

        return this.request(
            `/search?q=${encodeURIComponent(query)}`
        );
    },


    async createRequest(payload) {

        return this.request(
            "/requests",
            {
                method: "POST",

                body:
                    JSON.stringify(
                        payload
                    )
            }
        );
    },


    async getCurrentUser() {

        return this.request(
            "/auth/me"
        );
    }

};


/* =========================================================
   18. API URL BUILDER
   ========================================================= */

function buildAPIUrl(endpoint) {

    const base =
        NexusApp.api.baseUrl;

    if (!base) {

        return endpoint;
    }

    return `${base.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;
}


/* =========================================================
   19. DEMONSTRATION SEARCH DATA
   ========================================================= */

function getDemoSearchResults(query) {

    const normalized =
        query.toLowerCase();

    const results = [

        {
            id: "demo-001",

            name: "Nexus Certified Technician",

            role: "Electrical & Technical Services",

            location: "Abuja, Nigeria",

            badge: "Nexus Certified"
        },

        {
            id: "demo-002",

            name: "Nexus Business Partner",

            role: "Construction & Property Services",

            location: "Abuja, Nigeria",

            badge: "Nexus Business"
        },

        {
            id: "demo-003",

            name: "Nexus Verified Professional",

            role: "General Professional Services",

            location: "Nigeria",

            badge: "Nexus Verified"
        }

    ];

    /*
     * Basic relevance simulation.
     *
     * This is temporary.
     *
     * The real production search engine will eventually
     * use the backend database and ranking service.
     */

    const filtered =
        results.filter(item => {

            const searchable =
                `
                ${item.name}
                ${item.role}
                ${item.location}
                ${item.badge}
                `.toLowerCase();

            return searchable.includes(
                normalized
            ) ||
            normalized.includes("technician") ||
            normalized.includes("abuja") ||
            normalized.includes("nexus");

        });

    return filtered.length
        ? filtered
        : results;
}


/* =========================================================
   20. TOAST SYSTEM
   ========================================================= */

function showToast(message) {

    let container =
        NexusDOM.get(
            "#nexus-toast-container"
        );

    if (!container) {

        container =
            NexusDOM.create(
                "div",
                {
                    className:
                        "nexus-toast-container"
                }
            );

        container.id =
            "nexus-toast-container";

        document.body.appendChild(
            container
        );
    }

    const toast =
        NexusDOM.create(
            "div",
            {
                className:
                    "nexus-toast"
            }
        );

    toast.setAttribute(
        "role",
        "status"
    );

    toast.textContent =
        message;

    container.appendChild(
        toast
    );

    requestAnimationFrame(
        () => {

            toast.classList.add(
                "is-visible"
            );

        }
    );

    setTimeout(
        () => {

            toast.classList.remove(
                "is-visible"
            );

            setTimeout(
                () => {

                    toast.remove();

                },
                300
            );

        },
        3500
    );
}


/* =========================================================
   21. SEARCH STATUS
   ========================================================= */

function showSearchStatus(
    message
) {

    let status =
        NexusDOM.get(
            ".nexus-search-status"
        );

    if (!status) {

        status =
            NexusDOM.create(
                "div",
                {
                    className:
                        "nexus-search-status"
                }
            );

        const search =
            NexusDOM.get(
                ".nexus-search"
            );

        if (search) {

            search.insertAdjacentElement(
                "afterend",
                status
            );
        }
    }

    status.textContent =
        message;
}


/* =========================================================
   22. SECURITY HELPERS
   ========================================================= */

function escapeHTML(value) {

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}


function getInitials(name) {

    return String(name)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(
            word =>
                word
                    .charAt(0)
                    .toUpperCase()
        )
        .join("");
}


/* =========================================================
   23. GLOBAL ERROR HANDLING
   ========================================================= */

function initializeGlobalErrors() {

    window.addEventListener(
        "error",
        event => {

            console.error(
                "[Nexus Connect Error]",
                event.error ||
                event.message
            );

        }
    );


    window.addEventListener(
        "unhandledrejection",
        event => {

            console.error(
                "[Nexus Connect Promise Error]",
                event.reason
            );

        }
    );
}


/* =========================================================
   24. APPLICATION PUBLIC API
   ========================================================= */

window.NexusConnect = {

    version:
        NexusApp.version,

    search:
        performSearch,

    request:
        openServiceRequest,

    navigate:
        navigateToSection,

    toast:
        showToast,

    getState() {

        return {
            ...NexusApp.state
        };

    }

};


/* =========================================================
   25. START APPLICATION
   ========================================================= */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initializeNexusConnect
    );

} else {

    initializeNexusConnect();

}


/* =========================================================
   END — NEXUS CONNECT 2030 FRONTEND
   ========================================================= */
