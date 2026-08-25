/* ================================================================
   NEXUS CONNECT 2030
   NEXUS BUILDSOLUTIONS LIMITED

   ADVANCED FRONTEND APPLICATION ENGINE
   ---------------------------------------------------------------
   File: js/app.js

   Responsibilities:
   - Application boot
   - Dynamic interface
   - Navigation
   - Mobile navigation
   - Global search
   - Professional discovery
   - Service discovery
   - Dashboard rendering
   - Notifications
   - Profile interaction
   - Request workflow
   - API communication
   - Loading states
   - Toast system
   - Modal system
   - Keyboard shortcuts
   - UI state management
   - Frontend/backend integration

   Designed for:
   Nexus Connect 2030
================================================================ */

"use strict";


/* ================================================================
   01. APPLICATION CONFIGURATION
================================================================ */

const NexusApp = {

    name: "Nexus Connect",

    version: "2030.1",

    generation: "2030",

    environment: "production-ready",

    api: {

        /*
         * Keep empty when frontend and backend are served
         * from the same Render service.
         *
         * If frontend is hosted separately:
         *
         * baseUrl:
         * "https://your-api.onrender.com/api"
         */

        baseUrl: "",

        timeout: 15000

    },

    state: {

        initialized: false,

        mobileMenuOpen: false,

        searchOpen: false,

        notificationsOpen: false,

        profileOpen: false,

        modalOpen: false,

        searchLoading: false,

        searchQuery: "",

        searchResults: [],

        notifications: [],

        unreadNotifications: 0,

        currentUser: null,

        dashboard: null,

        currentSection: "discover",

        lastSearch: null,

        theme: "dark"

    }

};


/* ================================================================
   02. DOM ENGINE
================================================================ */

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

        const element =
            document.createElement(tag);

        if (options.className) {

            element.className =
                options.className;

        }

        if (options.text !== undefined) {

            element.textContent =
                options.text;

        }

        if (options.html !== undefined) {

            element.innerHTML =
                options.html;

        }

        if (options.attributes) {

            Object.entries(
                options.attributes
            ).forEach(
                ([key, value]) => {

                    element.setAttribute(
                        key,
                        value
                    );

                }
            );

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

        const visible =
            force !== null
                ? force
                : element.hidden;

        if (visible) {

            this.show(element);

        } else {

            this.hide(element);

        }

    }

};


/* ================================================================
   03. APPLICATION BOOT
================================================================ */

function initializeNexusConnect() {

    if (
        NexusApp.state.initialized
    ) {

        return;

    }

    console.info(
        `[NEXUS ${NexusApp.version}] Booting application...`
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

    initializeApplicationShell();

    initializeVisualStates();

    NexusApp.state.initialized =
        true;


    console.info(
        "[NEXUS] Application ready."
    );

}


/* ================================================================
   04. APPLICATION SHELL
================================================================ */

function initializeApplicationShell() {

    ensureToastContainer();

    ensureModalContainer();

    ensureLoadingLayer();

    ensureSearchOverlay();

    ensureDynamicDashboard();

}


/* ================================================================
   05. NAVIGATION
================================================================ */

function initializeNavigation() {

    const links =
        NexusDOM.getAll(
            ".nexus-navigation__link"
        );

    links.forEach(link => {

        link.addEventListener(
            "click",
            event => {

                const target =
                    link.getAttribute(
                        "href"
                    );

                if (
                    !target ||
                    !target.startsWith("#")
                ) {

                    return;

                }

                event.preventDefault();

                navigateToSection(
                    target
                );

                setActiveNavigation(
                    link
                );

                closeTemporaryUI();

            }
        );

    });

}


function setActiveNavigation(
    activeLink
) {

    const links =
        NexusDOM.getAll(
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


function navigateToSection(
    selector
) {

    const target =
        NexusDOM.get(
            selector
        );

    if (!target) {

        showToast(
            "This Nexus section is not available yet."
        );

        return;

    }

    NexusApp.state.currentSection =
        selector.replace(
            "#",
            ""
        );


    target.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

}


/* ================================================================
   06. MOBILE NAVIGATION
================================================================ */

function initializeMobileNavigation() {

    const button =
        NexusDOM.get(
            ".nexus-mobile-menu-button"
        );

    if (!button) {

        return;

    }

    button.addEventListener(
        "click",
        toggleMobileNavigation
    );

}


function toggleMobileNavigation() {

    let navigation =
        NexusDOM.get(
            ".nexus-mobile-navigation"
        );


    if (!navigation) {

        navigation =
            createMobileNavigation();

        const header =
            NexusDOM.get(
                ".nexus-header"
            );

        if (header) {

            header.appendChild(
                navigation
            );

        }

    }


    NexusApp.state.mobileMenuOpen =
        !NexusApp.state.mobileMenuOpen;


    NexusDOM.toggle(
        navigation,
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
        "Nexus mobile navigation"
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
            label: "Network",
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
                    text:
                        item.label,

                    attributes: {
                        href:
                            item.target
                    }
                }
            );


        link.addEventListener(
            "click",
            event => {

                event.preventDefault();

                navigateToSection(
                    item.target
                );

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


    navigation.hidden =
        true;


    return navigation;

}


/* ================================================================
   07. SEARCH SYSTEM
================================================================ */

function initializeSearch() {

    const form =
        NexusDOM.get(
            ".nexus-search"
        );

    const input =
        NexusDOM.get(
            ".nexus-search__input"
        );


    if (!form || !input) {

        return;

    }


    form.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            const query =
                input.value.trim();


            if (!query) {

                showSearchStatus(
                    "Search for a professional, service, business, or location."
                );

                input.focus();

                return;

            }


            await performSearch(
                query
            );

        }
    );


    input.addEventListener(
        "input",
        () => {

            NexusApp.state.searchQuery =
                input.value.trim();

        }
    );


    input.addEventListener(
        "focus",
        () => {

            NexusApp.state.searchOpen =
                true;

        }
    );

}


async function performSearch(
    query
) {

    const cleanQuery =
        String(query || "")
            .trim();


    if (!cleanQuery) {

        return;

    }


    NexusApp.state.searchQuery =
        cleanQuery;

    NexusApp.state.searchLoading =
        true;

    NexusApp.state.lastSearch =
        new Date().toISOString();


    showSearchStatus(
        `Searching the Nexus network for "${cleanQuery}"...`
    );


    showLoading(
        "Searching Nexus Connect..."
    );


    try {

        const response =
            await NexusAPI.search(
                cleanQuery
            );


        NexusApp.state.searchResults =
            response.results || [];


        renderSearchResults(
            NexusApp.state.searchResults,
            cleanQuery
        );


    } catch (error) {

        console.error(
            "[NEXUS SEARCH]",
            error
        );


        showSearchStatus(
            "Search could not be completed. Please try again."
        );


        renderSearchError();

    } finally {

        NexusApp.state.searchLoading =
            false;

        hideLoading();

    }

}


/* ================================================================
   08. QUICK SEARCH
================================================================ */

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
            async () => {

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

                }


                await performSearch(
                    query
                );

            }
        );

    });

}


/* ================================================================
   09. SEARCH RESULTS
================================================================ */

function renderSearchResults(
    results,
    query
) {

    const old =
        NexusDOM.get(
            "#nexus-search-results"
        );


    if (old) {

        old.remove();

    }


    const container =
        NexusDOM.create(
            "section",
            {
                className:
                    "nexus-search-results"
            }
        );


    container.id =
        "nexus-search-results";


    const header =
        NexusDOM.create(
            "div",
            {
                className:
                    "nexus-search-results__header"
            }
        );


    header.innerHTML = `
        <div>
            <span class="nexus-eyebrow">
                NEXUS DISCOVERY ENGINE
            </span>

            <h2>
                Search results
            </h2>

            <p>
                Network intelligence for
                "${escapeHTML(query)}"
            </p>
        </div>

        <div class="nexus-search-results__count">
            ${results.length}
            <span>matches</span>
        </div>
    `;


    container.appendChild(
        header
    );


    if (!results.length) {

        container.appendChild(
            createEmptySearchState(
                query
            )
        );

    } else {

        const grid =
            NexusDOM.create(
                "div",
                {
                    className:
                        "nexus-search-results__grid"
                }
            );


        results.forEach(
            result => {

                grid.appendChild(
                    createSearchResultCard(
                        result
                    )
                );

            }
        );


        container.appendChild(
            grid
        );

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
            ? `${results.length} Nexus professional result(s) found.`
            : `No direct Nexus result found for "${query}".`
    );

}


function createSearchResultCard(
    result
) {

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
            result.displayName ||
            "Nexus Professional"
        );


    const role =
        escapeHTML(
            result.role ||
            result.category ||
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
            (
                result.verified
                    ? "Nexus Verified"
                    : "Nexus Network"
            )
        );


    const initials =
        getInitials(
            name
        );


    card.innerHTML = `

        <div class="nexus-search-result-card__top">

            <div class="nexus-search-result-card__avatar">
                ${initials}
            </div>

            <div class="nexus-search-result-card__identity">

                <strong>
                    ${name}
                </strong>

                <span>
                    ${role}
                </span>

            </div>

            <span class="nexus-verification-badge">
                ${badge}
            </span>

        </div>


        <div class="nexus-search-result-card__meta">

            <span>
                ${location}
            </span>

            <span>
                Professional Network
            </span>

        </div>


        <div class="nexus-search-result-card__actions">

            <button
                type="button"
                class="nexus-button nexus-button--secondary nexus-view-profile"
            >
                View profile
            </button>

            <button
                type="button"
                class="nexus-button nexus-button--primary nexus-connect-result"
            >
                Connect
            </button>

        </div>

    `;


    const profileButton =
        NexusDOM.get(
            ".nexus-view-profile",
            card
        );


    const connectButton =
        NexusDOM.get(
            ".nexus-connect-result",
            card
        );


    if (profileButton) {

        profileButton.addEventListener(
            "click",
            () => {

                openProfessionalProfile(
                    result
                );

            }
        );

    }


    if (connectButton) {

        connectButton.addEventListener(
            "click",
            () => {

                requestConnection(
                    result
                );

            }
        );

    }


    return card;

}


function createEmptySearchState(
    query
) {

    const empty =
        NexusDOM.create(
            "div",
            {
                className:
                    "nexus-empty-state"
            }
        );


    empty.innerHTML = `

        <div class="nexus-empty-state__icon">
            ◇
        </div>

        <h3>
            No direct match found
        </h3>

        <p>
            Try searching for a professional,
            company, service, skill, or Nigerian city.
        </p>

        <button
            type="button"
            class="nexus-button nexus-button--primary"
            data-empty-search="true"
        >
            Explore Nexus
        </button>

    `;


    const button =
        NexusDOM.get(
            "[data-empty-search]",
            empty
        );


    if (button) {

        button.addEventListener(
            "click",
            () => {

                const input =
                    NexusDOM.get(
                        ".nexus-search__input"
                    );

                if (input) {

                    input.value =
                        "Nexus";

                    performSearch(
                        "Nexus"
                    );

                }

            }
        );

    }


    return empty;

}


function renderSearchError() {

    const existing =
        NexusDOM.get(
            "#nexus-search-results"
        );


    if (existing) {

        existing.innerHTML = `

            <div class="nexus-empty-state nexus-empty-state--error">

                <div class="nexus-empty-state__icon">
                    !
                </div>

                <h3>
                    Discovery temporarily unavailable
                </h3>

                <p>
                    Nexus Connect could not reach the discovery service.
                </p>

                <button
                    type="button"
                    class="nexus-button nexus-button--primary"
                    onclick="window.NexusConnect.search(window.NexusConnect.getState().searchQuery)"
                >
                    Try again
                </button>

            </div>

        `;

    }

}


/* ================================================================
   10. SERVICE SYSTEM
================================================================ */

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


                const service =
                    heading
                        ? heading.textContent.trim()
                        : "Professional service";


                openServiceRequest(
                    service
                );

            }
        );

    });

}


function initializeRequestActions() {

    const buttons =
        NexusDOM.getAll(
            "[data-request-service]"
        );


    buttons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                openServiceRequest(
                    button.dataset.requestService
                );

            }
        );

    });

}


async function openServiceRequest(
    service
) {

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
     * Backend request can be connected here later.
     */

}


/* ================================================================
   11. CONNECTION SYSTEM
================================================================ */

function requestConnection(
    professional
) {

    const name =
        professional?.name ||
        professional?.displayName ||
        "this professional";


    showToast(
        `Connection request prepared for ${name}.`
    );

}


/* ================================================================
   12. PROFESSIONAL PROFILE
================================================================ */

function openProfessionalProfile(
    professional
) {

    const name =
        professional?.name ||
        professional?.displayName ||
        "Nexus Professional";


    const role =
        professional?.role ||
        professional?.category ||
        "Certified Professional";


    const location =
        professional?.location ||
        "Nigeria";


    const avatar =
        professional?.avatar ||
        null;


    const initials =
        getInitials(
            name
        );


    openModal({

        title:
            name,

        content: `

            <div class="nexus-profile-modal">

                <div class="nexus-profile-modal__hero">

                    <div class="nexus-profile-modal__avatar">

                        ${
                            avatar
                                ? `<img
                                    src="${escapeAttribute(avatar)}"
                                    alt="${escapeAttribute(name)}"
                                  >`
                                : initials
                        }

                    </div>

                    <div>

                        <span class="nexus-eyebrow">
                            NEXUS NETWORK MEMBER
                        </span>

                        <h2>
                            ${escapeHTML(name)}
                        </h2>

                        <p>
                            ${escapeHTML(role)}
                        </p>

                    </div>

                </div>


                <div class="nexus-profile-modal__grid">

                    <div>
                        <span>Location</span>
                        <strong>
                            ${escapeHTML(location)}
                        </strong>
                    </div>

                    <div>
                        <span>Network status</span>
                        <strong>
                            Nexus Verified
                        </strong>
                    </div>

                    <div>
                        <span>Professional identity</span>
                        <strong>
                            Certified Network
                        </strong>
                    </div>

                    <div>
                        <span>Availability</span>
                        <strong>
                            Network active
                        </strong>
                    </div>

                </div>


                <div class="nexus-profile-modal__actions">

                    <button
                        type="button"
                        class="nexus-button nexus-button--primary"
                        data-profile-connect
                    >
                        Connect
                    </button>

                    <button
                        type="button"
                        class="nexus-button nexus-button--secondary"
                        data-profile-message
                    >
                        Message
                    </button>

                </div>

            </div>

        `

    });


    const connect =
        NexusDOM.get(
            "[data-profile-connect]"
        );


    const message =
        NexusDOM.get(
            "[data-profile-message]"
        );


    if (connect) {

        connect.addEventListener(
            "click",
            () => {

                requestConnection(
                    professional
                );

                closeModal();

            }
        );

    }


    if (message) {

        message.addEventListener(
            "click",
            () => {

                showToast(
                    `Messaging with ${name} will open when authentication is connected.`
                );

            }
        );

    }

}


/* ================================================================
   13. NOTIFICATIONS
================================================================ */

function initializeNotifications() {

    const buttons =
        NexusDOM.getAll(
            ".nexus-icon-button"
        );


    buttons.forEach(button => {

        button.addEventListener(
            "click",
            event => {

                event.preventDefault();

                toggleNotifications();

            }
        );

    });

}


function toggleNotifications() {

    NexusApp.state.notificationsOpen =
        !NexusApp.state.notificationsOpen;


    if (
        NexusApp.state.notificationsOpen
    ) {

        openNotificationPanel();

    } else {

        closeNotificationPanel();

    }

}


function openNotificationPanel() {

    let panel =
        NexusDOM.get(
            "#nexus-notification-panel"
        );


    if (!panel) {

        panel =
            createNotificationPanel();

        document.body.appendChild(
            panel
        );

    }


    NexusDOM.show(
        panel
    );


    renderNotifications();

}


function closeNotificationPanel() {

    const panel =
        NexusDOM.get(
            "#nexus-notification-panel"
        );


    if (panel) {

        NexusDOM.hide(
            panel
        );

    }


    NexusApp.state.notificationsOpen =
        false;

}


function createNotificationPanel() {

    const panel =
        NexusDOM.create(
            "aside",
            {
                className:
                    "nexus-notification-panel"
            }
        );


    panel.id =
        "nexus-notification-panel";


    panel.innerHTML = `

        <div class="nexus-notification-panel__header">

            <div>

                <span class="nexus-eyebrow">
                    NEXUS INTELLIGENCE
                </span>

                <h3>
                    Notifications
                </h3>

            </div>

            <button
                type="button"
                class="nexus-panel-close"
                aria-label="Close notifications"
            >
                ×
            </button>

        </div>


        <div
            class="nexus-notification-panel__body"
            id="nexus-notification-list"
        >
        </div>

    `;


    const close =
        NexusDOM.get(
            ".nexus-panel-close",
            panel
        );


    if (close) {

        close.addEventListener(
            "click",
            closeNotificationPanel
        );

    }


    return panel;

}


function renderNotifications() {

    const container =
        NexusDOM.get(
            "#nexus-notification-list"
        );


    if (!container) {

        return;

    }


    const notifications =
        NexusApp.state.notifications;


    if (!notifications.length) {

        container.innerHTML = `

            <div class="nexus-notification-empty">

                <div>
                    ◇
                </div>

                <strong>
                    All clear
                </strong>

                <p>
                    No priority notifications right now.
                </p>

            </div>

        `;

        return;

    }


    container.innerHTML =
        notifications.map(
            notification => {

                return `

                    <article class="nexus-notification">

                        <div class="nexus-notification__icon">
                            ◆
                        </div>

                        <div>

                            <strong>
                                ${
                                    escapeHTML(
                                        notification.type ||
                                        "Nexus activity"
                                    )
                                }
                            </strong>

                            <p>
                                Nexus network activity requires your attention.
                            </p>

                        </div>

                    </article>

                `;

            }
        ).join("");

}


/* ================================================================
   14. PROFILE BUTTON
================================================================ */

function initializeProfile() {

    const button =
        NexusDOM.get(
            ".nexus-profile-button"
        );


    if (!button) {

        return;

    }


    button.addEventListener(
        "click",
        () => {

            openProfileMenu(
                button
            );

        }
    );

}


function openProfileMenu(
    anchor
) {

    let menu =
        NexusDOM.get(
            "#nexus-profile-menu"
        );


    if (!menu) {

        menu =
            NexusDOM.create(
                "div",
                {
                    className:
                        "nexus-profile-menu"
                }
            );


        menu.id =
            "nexus-profile-menu";


        menu.innerHTML = `

            <div class="nexus-profile-menu__header">

                <span class="nexus-eyebrow">
                    NEXUS IDENTITY
                </span>

                <strong>
                    ${escapeHTML(
                        NexusApp.state.currentUser?.displayName ||
                        "Guest"
                    )}
                </strong>

            </div>


            <button type="button" data-profile-action="profile">
                My profile
            </button>

            <button type="button" data-profile-action="dashboard">
                Dashboard
            </button>

            <button type="button" data-profile-action="settings">
                Settings
            </button>

        `;


        document.body.appendChild(
            menu
        );


        menu.addEventListener(
            "click",
            event => {

                const action =
                    event.target.dataset.profileAction;


                if (!action) {

                    return;

                }


                handleProfileAction(
                    action
                );

            }
        );

    }


    const rect =
        anchor.getBoundingClientRect();


    menu.style.top =
        `${rect.bottom + 12}px`;

    menu.style.right =
        `${Math.max(
            16,
            window.innerWidth -
            rect.right
        )}px`;


    NexusDOM.toggle(
        menu
    );

}


function handleProfileAction(
    action
) {

    switch (action) {

        case "profile":

            showToast(
                "Profile workspace is ready for authentication."
            );

            break;


        case "dashboard":

            renderAdvancedDashboard();

            break;


        case "settings":

            showToast(
                "Nexus settings module is ready."
            );

            break;

    }


    const menu =
        NexusDOM.get(
            "#nexus-profile-menu"
        );


    if (menu) {

        NexusDOM.hide(
            menu
        );

    }

}


/* ================================================================
   15. DASHBOARD
================================================================ */

function ensureDynamicDashboard() {

    /*
     * Dashboard is intentionally generated dynamically.
     * This allows the frontend to work even when the original
     * HTML only contains the main landing structure.
     */

}


function renderAdvancedDashboard() {

    let dashboard =
        NexusDOM.get(
            "#nexus-dynamic-dashboard"
        );


    if (!dashboard) {

        dashboard =
            NexusDOM.create(
                "section",
                {
                    className:
                        "nexus-dynamic-dashboard"
                }
            );


        dashboard.id =
            "nexus-dynamic-dashboard";


        const main =
            document.querySelector(
                "main"
            );


        if (main) {

            main.prepend(
                dashboard
            );

        } else {

            document.body.prepend(
                dashboard
            );

        }

    }


    const user =
        NexusApp.state.currentUser;


    const stats =
        NexusApp.state.dashboard?.overview ||
        {};


    dashboard.innerHTML = `

        <div class="nexus-dashboard__header">

            <div>

                <span class="nexus-eyebrow">
                    NEXUS CONNECT 2030
                </span>

                <h1>
                    Command Center
                </h1>

                <p>
                    Your professional network,
                    services and business intelligence
                    in one connected workspace.
                </p>

            </div>


            <div class="nexus-dashboard__status">

                <span class="nexus-status-dot"></span>

                NETWORK OPERATIONAL

            </div>

        </div>


        <div class="nexus-dashboard__grid">

            ${dashboardMetric(
                "Network",
                stats.connections || 0,
                "Professional connections"
            )}

            ${dashboardMetric(
                "Messages",
                stats.conversations || 0,
                "Active conversations"
            )}

            ${dashboardMetric(
                "Alerts",
                stats.unreadNotifications || 0,
                "Unread notifications"
            )}

            ${dashboardMetric(
                "Identity",
                user
                    ? "ACTIVE"
                    : "GUEST",
                "Nexus account status"
            )}

        </div>


        <div class="nexus-dashboard__modules">

            <article class="nexus-dashboard-card">

                <span class="nexus-eyebrow">
                    DISCOVERY
                </span>

                <h2>
                    Find the right professional
                </h2>

                <p>
                    Search the Nexus network by
                    person, service, business,
                    category or location.
                </p>

                <button
                    type="button"
                    class="nexus-button nexus-button--primary"
                    data-dashboard-search
                >
                    Open discovery
                </button>

            </article>


            <article class="nexus-dashboard-card">

                <span class="nexus-eyebrow">
                    SERVICES
                </span>

                <h2>
                    Request professional support
                </h2>

                <p>
                    Connect with trusted service
                    providers across the Nexus ecosystem.
                </p>

                <button
                    type="button"
                    class="nexus-button nexus-button--secondary"
                    data-dashboard-services
                >
                    Explore services
                </button>

            </article>


            <article class="nexus-dashboard-card">

                <span class="nexus-eyebrow">
                    TRUST
                </span>

                <h2>
                    Verified network
                </h2>

                <p>
                    Identity, professional profiles,
                    connections and network activity
                    are designed around trust.
                </p>

                <button
                    type="button"
                    class="nexus-button nexus-button--secondary"
                    data-dashboard-trust
                >
                    View trust system
                </button>

            </article>

        </div>

    `;


    const searchButton =
        NexusDOM.get(
            "[data-dashboard-search]",
            dashboard
        );


    if (searchButton) {

        searchButton.addEventListener(
            "click",
            () => {

                const input =
                    NexusDOM.get(
                        ".nexus-search__input"
                    );

                if (input) {

                    input.focus();

                }

            }
        );

    }


    const serviceButton =
        NexusDOM.get(
            "[data-dashboard-services]",
            dashboard
        );


    if (serviceButton) {

        serviceButton.addEventListener(
            "click",
            () => {

                navigateToSection(
                    "#services"
                );

            }
        );

    }


    const trustButton =
        NexusDOM.get(
            "[data-dashboard-trust]",
            dashboard
        );


    if (trustButton) {

        trustButton.addEventListener(
            "click",
            () => {

                navigateToSection(
                    "#trust"
                );

            }
        );

    }


    dashboard.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

}


function dashboardMetric(
    label,
    value,
    description
) {

    return `

        <div class="nexus-dashboard-metric">

            <span>
                ${escapeHTML(label)}
            </span>

            <strong>
                ${escapeHTML(value)}
            </strong>

            <small>
                ${escapeHTML(description)}
            </small>

        </div>

    `;

}


/* ================================================================
   16. SMOOTH NAVIGATION
================================================================ */

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


/* ================================================================
   17. KEYBOARD SHORTCUTS
================================================================ */

function initializeKeyboardShortcuts() {

    document.addEventListener(
        "keydown",
        event => {

            if (
                (event.ctrlKey ||
                 event.metaKey) &&
                event.key.toLowerCase() ===
                "k"
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


            if (
                event.key ===
                "Escape"
            ) {

                closeTemporaryUI();

            }

        }
    );

}


function closeTemporaryUI() {

    const mobile =
        NexusDOM.get(
            ".nexus-mobile-navigation"
        );


    if (mobile) {

        NexusDOM.hide(
            mobile
        );

    }


    NexusApp.state.mobileMenuOpen =
        false;


    closeNotificationPanel();

    closeModal();


    const profileMenu =
        NexusDOM.get(
            "#nexus-profile-menu"
        );


    if (profileMenu) {

        NexusDOM.hide(
            profileMenu
        );

    }

}


/* ================================================================
   18. API ENGINE
================================================================ */

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

                let message =
                    `API request failed: ${response.status}`;


                try {

                    const data =
                        await response.json();


                    message =
                        data.message ||
                        data.error ||
                        message;

                } catch (_) {

                    /*
                     * Response was not JSON.
                     */

                }


                throw new Error(
                    message
                );

            }


            return response.json();

        } catch (error) {

            clearTimeout(
                timeout
            );

            throw error;

        }

    },


    async search(
        query
    ) {

        /*
         * Development-safe fallback.
         *
         * This means the interface can still display
         * meaningful content before the Render API exists.
         */

        if (
            !NexusApp.api.baseUrl
        ) {

            return {

                success:
                    true,

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


    async getDashboard() {

        if (
            !NexusApp.api.baseUrl
        ) {

            return {

                success:
                    true,

                overview: {

                    connections:
                        0,

                    conversations:
                        0,

                    notifications:
                        0,

                    unreadNotifications:
                        0

                }

            };

        }


        return this.request(
            "/dashboard"
        );

    },


    async getNotifications() {

        if (
            !NexusApp.api.baseUrl
        ) {

            return {

                success:
                    true,

                notifications:
                    []

            };

        }


        return this.request(
            "/notifications"
        );

    },


    async getCurrentUser() {

        if (
            !NexusApp.api.baseUrl
        ) {

            return null;

        }


        return this.request(
            "/auth/me"
        );

    },


    async createRequest(
        payload
    ) {

        return this.request(
            "/requests",
            {
                method:
                    "POST",

                body:
                    JSON.stringify(
                        payload
                    )
            }
        );

    }

};


/* ================================================================
   19. API URL BUILDER
================================================================ */

function buildAPIUrl(
    endpoint
) {

    const base =
        NexusApp.api.baseUrl;


    if (!base) {

        return endpoint;

    }


    return `${base.replace(
        /\/$/,
        ""
    )}/${endpoint.replace(
        /^\//,
        ""
    )}`;

}


/* ================================================================
   20. DEMO DISCOVERY ENGINE
================================================================ */

function getDemoSearchResults(
    query
) {

    const normalized =
        String(
            query || ""
        )
        .toLowerCase()
        .trim();


    const professionals = [

        {
            id:
                "nexus-001",

            name:
                "Nexus Certified Technician",

            role:
                "Electrical & Technical Services",

            location:
                "Abuja, Nigeria",

            badge:
                "Nexus Certified",

            verified:
                true
        },


        {
            id:
                "nexus-002",

            name:
                "Nexus Construction Partner",

            role:
                "Construction & Property Services",

            location:
                "Gombe, Nigeria",

            badge:
                "Nexus Business",

            verified:
                true
        },


        {
            id:
                "nexus-003",

            name:
                "Nexus Infrastructure Professional",

            role:
                "Engineering & Infrastructure",

            location:
                "Lagos, Nigeria",

            badge:
                "Nexus Verified",

            verified:
                true
        },


        {
            id:
                "nexus-004",

            name:
                "Nexus Business Consultant",

            role:
                "Business & Professional Services",

            location:
                "Kano, Nigeria",

            badge:
                "Nexus Verified",

            verified:
                true
        }

    ];


    const filtered =
        professionals.filter(
            person => {

                const searchable =
                    `
                    ${person.name}
                    ${person.role}
                    ${person.location}
                    ${person.badge}
                    `
                    .toLowerCase();


                return (
                    searchable.includes(
                        normalized
                    ) ||

                    normalized.includes(
                        "nexus"
                    ) ||

                    normalized.includes(
                        "engineer"
                    ) ||

                    normalized.includes(
                        "construction"
                    ) ||

                    normalized.includes(
                        "technician"
                    ) ||

                    normalized.includes(
                        "abuja"
                    ) ||

                    normalized.includes(
                        "gombe"
                    ) ||

                    normalized.includes(
                        "lagos"
                    )

                );

            }
        );


    return filtered.length
        ? filtered
        : professionals;

}


/* ================================================================
   21. DYNAMIC UI SYSTEM
================================================================ */

function ensureToastContainer() {

    if (
        NexusDOM.get(
            "#nexus-toast-container"
        )
    ) {

        return;

    }


    const container =
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


function ensureModalContainer() {

    if (
        NexusDOM.get(
            "#nexus-modal-container"
        )
    ) {

        return;

    }


    const container =
        NexusDOM.create(
            "div",
            {
                className:
                    "nexus-modal-container"
            }
        );


    container.id =
        "nexus-modal-container";


    container.hidden =
        true;


    document.body.appendChild(
        container
    );

}


function ensureLoadingLayer() {

    if (
        NexusDOM.get(
            "#nexus-loading-layer"
        )
    ) {

        return;

    }


    const layer =
        NexusDOM.create(
            "div",
            {
                className:
                    "nexus-loading-layer"
            }
        );


    layer.id =
        "nexus-loading-layer";


    layer.hidden =
        true;


    layer.innerHTML = `

        <div class="nexus-loading-card">

            <div class="nexus-loader">
                <span></span>
                <span></span>
                <span></span>
            </div>

            <strong>
                Nexus Connect
            </strong>

            <p>
                Initializing network intelligence...
            </p>

        </div>

    `;


    document.body.appendChild(
        layer
    );

}


function ensureSearchOverlay() {

    /*
     * Reserved for the advanced global discovery
     * overlay used by the 2030 interface.
     */

}


/* ================================================================
   22. MODAL ENGINE
================================================================ */

function openModal({
    title = "Nexus Connect",
    content = ""
} = {}) {

    const container =
        NexusDOM.get(
            "#nexus-modal-container"
        );


    if (!container) {

        return;

    }


    container.innerHTML = `

        <div class="nexus-modal-backdrop">

            <div
                class="nexus-modal"
                role="dialog"
                aria-modal="true"
                aria-label="${escapeAttribute(title)}"
            >

                <div class="nexus-modal__header">

                    <h2>
                        ${escapeHTML(title)}
                    </h2>

                    <button
                        type="button"
                        class="nexus-modal__close"
                        aria-label="Close"
                    >
                        ×
                    </button>

                </div>

                <div class="nexus-modal__body">

                    ${content}

                </div>

            </div>

        </div>

    `;


    NexusDOM.show(
        container
    );


    NexusApp.state.modalOpen =
        true;


    const close =
        NexusDOM.get(
            ".nexus-modal__close",
            container
        );


    if (close) {

        close.addEventListener(
            "click",
            closeModal
        );

    }


    const backdrop =
        NexusDOM.get(
            ".nexus-modal-backdrop",
            container
        );


    if (backdrop) {

        backdrop.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    backdrop
                ) {

                    closeModal();

                }

            }
        );

    }

}


function closeModal() {

    const container =
        NexusDOM.get(
            "#nexus-modal-container"
        );


    if (!container) {

        return;

    }


    NexusDOM.hide(
        container
    );


    container.innerHTML =
        "";


    NexusApp.state.modalOpen =
        false;

}


/* ================================================================
   23. TOAST ENGINE
================================================================ */

function showToast(
    message,
    type = "info"
) {

    ensureToastContainer();


    const container =
        NexusDOM.get(
            "#nexus-toast-container"
        );


    const toast =
        NexusDOM.create(
            "div",
            {
                className:
                    `nexus-toast nexus-toast--${type}`
            }
        );


    toast.setAttribute(
        "role",
        "status"
    );


    toast.innerHTML = `

        <span class="nexus-toast__indicator">
            ◆
        </span>

        <span>
            ${escapeHTML(message)}
        </span>

    `;


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


/* ================================================================
   24. SEARCH STATUS
================================================================ */

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


/* ================================================================
   25. LOADING ENGINE
================================================================ */

function showLoading(
    message =
        "Nexus Connect is processing..."
) {

    const layer =
        NexusDOM.get(
            "#nexus-loading-layer"
        );


    if (!layer) {

        return;

    }


    const text =
        NexusDOM.get(
            "p",
            layer
        );


    if (text) {

        text.textContent =
            message;

    }


    NexusDOM.show(
        layer
    );

}


function hideLoading() {

    const layer =
        NexusDOM.get(
            "#nexus-loading-layer"
        );


    if (layer) {

        NexusDOM.hide(
            layer
        );

    }

}


/* ================================================================
   26. VISUAL APPLICATION STATES
================================================================ */

function initializeVisualStates() {

    document.documentElement
        .setAttribute(
            "data-nexus-version",
            NexusApp.version
        );


    document.body.classList.add(
        "nexus-app-ready"
    );


    /*
     * Add a lightweight reveal class to major
     * application sections if CSS supports it.
     */

    const sections =
        NexusDOM.getAll(
            "main section, .nexus-hero, .nexus-section"
        );


    sections.forEach(
        section => {

            section.classList.add(
                "nexus-reveal"
            );

        }
    );

}


/* ================================================================
   27. ERROR HANDLING
================================================================ */

function initializeGlobalErrors() {

    window.addEventListener(
        "error",
        event => {

            console.error(
                "[NEXUS APPLICATION ERROR]",
                event.error ||
                event.message
            );

        }
    );


    window.addEventListener(
        "unhandledrejection",
        event => {

            console.error(
                "[NEXUS PROMISE ERROR]",
                event.reason
            );

        }
    );

}


/* ================================================================
   28. SECURITY HELPERS
================================================================ */

function escapeHTML(
    value
) {

    return String(
        value
    )
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


function escapeAttribute(
    value
) {

    return escapeHTML(
        value
    );

}


function getInitials(
    name
) {

    return String(
        name || "NX"
    )
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


/* ================================================================
   29. PUBLIC NEXUS API
================================================================ */

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


    dashboard:
        renderAdvancedDashboard,


    profile:
        openProfessionalProfile,


    getState() {

        return {
            ...NexusApp.state
        };

    },


    getAPI() {

        return NexusAPI;

    }

};


/* ================================================================
   30. APPLICATION START
================================================================ */

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


/* ================================================================
   NEXUS CONNECT 2030
   ADVANCED FRONTEND APPLICATION ENGINE
   END
================================================================ */
