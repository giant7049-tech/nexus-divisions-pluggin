/* =========================================================
   NEXUS CONNECT 2030
   Nexus Buildsolutions Limited

   configuration.js
   ---------------------------------------------------------
   Central application configuration.

   Responsibilities:
   - Environment configuration
   - API configuration
   - Application settings
   - Feature flags
   - Search configuration
   - Verification configuration
   - Storage configuration
   - UI configuration
   - Future backend/Render configuration
   ========================================================= */

"use strict";


/* =========================================================
   01. ENVIRONMENT
   ========================================================= */

const NexusConfiguration = {

    application: {

        name: "Nexus Connect",

        version: "2030.1",

        company:
            "Nexus Buildsolutions Limited",

        environment:
            "production-ready",

        country:
            "Nigeria",

        language:
            "en-NG",

        timezone:
            "Africa/Lagos"

    },


    /* =====================================================
       02. BRAND CONFIGURATION
       ===================================================== */

    brand: {

        primary:
            "#071A33",

        secondary:
            "#D8AD45",

        white:
            "#FFFFFF",

        logo:
            "/assets/logo/Screenshot%202025-09-29%20122409.png"

    },


    /* =====================================================
       03. API / BACKEND
       ===================================================== */

    api: {

        /*
         * Keep this empty while the frontend is running
         * without a deployed backend.
         *
         * When your Render backend is ready, change this to:
         *
         * https://your-service-name.onrender.com/api
         */

        baseUrl: "",

        timeout:
            15000,

        retryAttempts:
            2,

        headers: {

            "Accept":
                "application/json",

            "Content-Type":
                "application/json"

        }

    },


    /* =====================================================
       04. APPLICATION ROUTES
       ===================================================== */

    routes: {

        home:
            "#home",

        finder:
            "#finder",

        requests:
            "#requests",

        network:
            "#network",

        platform:
            "#platform"

    },


    /* =====================================================
       05. BACKEND ENDPOINTS
       ===================================================== */

    endpoints: {

        search:
            "/search",

        users:
            "/users",

        professionals:
            "/professionals",

        businesses:
            "/businesses",

        requests:
            "/requests",

        verification:
            "/verification",

        notifications:
            "/notifications",

        messages:
            "/messages",

        profile:
            "/auth/me",

        login:
            "/auth/login",

        register:
            "/auth/register",

        logout:
            "/auth/logout"

    },


    /* =====================================================
       06. SEARCH CONFIGURATION
       ===================================================== */

    search: {

        enabled:
            true,

        minimumCharacters:
            2,

        maximumCharacters:
            120,

        resultsPerPage:
            20,

        debounce:
            300,

        locations: [

            "Abuja",

            "Lagos",

            "Kano",

            "Kaduna",

            "Gombe",

            "Kogi",

            "Jos",

            "Port Harcourt",

            "Ibadan",

            "Enugu",

            "Benin City",

            "Nigeria"

        ],

        categories: [

            "Architect",

            "Building Engineer",

            "Civil Engineer",

            "Electrical Engineer",

            "Mechanical Engineer",

            "Quantity Surveyor",

            "Surveyor",

            "Project Manager",

            "Site Engineer",

            "Technician",

            "Construction Company",

            "Architecture Company",

            "Real Estate",

            "Property Services",

            "Electrical Services",

            "Plumbing Services",

            "Building Materials",

            "Professional Services"

        ]

    },


    /* =====================================================
       07. USER TYPES
       ===================================================== */

    userTypes: {

        guest:
            "guest",

        user:
            "verified-user",

        professional:
            "certified-professional",

        business:
            "certified-business",

        staff:
            "nexus-staff",

        administrator:
            "administrator"

    },


    /* =====================================================
       08. VERIFICATION SYSTEM
       ===================================================== */

    verification: {

        enabled:
            true,

        levels: {

            user:
                "VERIFIED USER",

            professional:
                "NEXUS CERTIFIED",

            business:
                "CERTIFIED BUSINESS",

            staff:
                "NEXUS STAFF"

        },

        requirements: {

            userIdentity:
                true,

            professionalCredentials:
                true,

            businessDocuments:
                true,

            staffAuthorization:
                true

        }

    },


    /* =====================================================
       09. REQUEST SYSTEM
       ===================================================== */

    requests: {

        enabled:
            true,

        priorities: [

            "standard",

            "urgent",

            "high"

        ],

        statuses: [

            "draft",

            "submitted",

            "matching",

            "matched",

            "connected",

            "completed",

            "cancelled"

        ],

        maximumDescriptionLength:
            2000

    },


    /* =====================================================
       10. NETWORK
       ===================================================== */

    network: {

        enabled:
            true,

        professionalProfiles:
            true,

        businessProfiles:
            true,

        staffProfiles:
            true,

        messaging:
            true,

        ratings:
            true,

        availability:
            true

    },


    /* =====================================================
       11. FUTURE PLATFORM FEATURES
       ===================================================== */

    features: {

        smartSearch:
            true,

        smartMatching:
            true,

        professionalDirectory:
            true,

        businessDirectory:
            true,

        realTimeMessaging:
            true,

        notifications:
            true,

        verification:
            true,

        analytics:
            true,

        trustScore:
            true,

        aiSearch:
            true,

        recommendationEngine:
            true

    },


    /* =====================================================
       12. DEMO MODE
       ===================================================== */

    demo: {

        /*
         * TRUE:
         * The frontend can display controlled demonstration
         * data when a backend has not yet been connected.
         *
         * FALSE:
         * The application relies entirely on the backend.
         */

        enabled:
            true,

        showDemoResults:
            true,

        demoUser:
            true,

        demoProfessionals:
            true,

        demoBusinesses:
            true,

        demoRequests:
            true

    },


    /* =====================================================
       13. LOCAL STORAGE
       ===================================================== */

    storage: {

        prefix:
            "nexus_connect_",

        keys: {

            user:
                "current_user",

            token:
                "auth_token",

            search:
                "last_search",

            preferences:
                "preferences",

            notifications:
                "notifications",

            requests:
                "requests"

        }

    },


    /* =====================================================
       14. UI CONFIGURATION
       ===================================================== */

    ui: {

        toastDuration:
            3500,

        animationDuration:
            320,

        searchLoadingText:
            "Searching Nexus Connect...",

        emptySearchText:
            "No direct match found yet.",

        networkErrorText:
            "Nexus Connect could not connect to the service.",

        authenticationRequiredText:
            "Please sign in to continue."

    },


    /* =====================================================
       15. SECURITY
       ===================================================== */

    security: {

        useHTTPS:
            true,

        sanitizeInput:
            true,

        preventUnsafeHTML:
            true,

        sessionTimeout:
            30 * 60 * 1000

    },


    /* =====================================================
       16. PAGINATION
       ===================================================== */

    pagination: {

        defaultPage:
            1,

        defaultLimit:
            20,

        maximumLimit:
            100

    },


    /* =====================================================
       17. LOCATION
       ===================================================== */

    location: {

        defaultCountry:
            "Nigeria",

        defaultState:
            "",

        defaultCity:
            "",

        allowUserLocation:
            true

    },


    /* =====================================================
       18. NOTIFICATION CONFIGURATION
       ===================================================== */

    notifications: {

        enabled:
            true,

        pollingInterval:
            30000,

        maximumVisible:
            10

    },


    /* =====================================================
       19. MESSAGING
       ===================================================== */

    messaging: {

        enabled:
            true,

        maximumMessageLength:
            2000,

        typingIndicator:
            true,

        readReceipts:
            true

    },


    /* =====================================================
       20. DEVELOPMENT FLAGS
       ===================================================== */

    development: {

        debug:
            false,

        consoleLogging:
            true,

        showAPIErrors:
            false,

        showPerformanceMetrics:
            false

    }

};


/* =========================================================
   21. CONFIGURATION HELPERS
   ========================================================= */

const NexusConfig = {


    get(key, fallback = null) {

        const parts =
            String(key).split(".");


        let value =
            NexusConfiguration;


        for (const part of parts) {

            if (
                value &&
                Object.prototype.hasOwnProperty.call(
                    value,
                    part
                )
            ) {

                value =
                    value[part];

            } else {

                return fallback;

            }

        }


        return value;

    },


    apiUrl(endpoint) {

        const base =
            NexusConfiguration.api.baseUrl;


        if (!base) {

            return endpoint;

        }


        return `${base.replace(/\/$/, "")}/${String(endpoint).replace(/^\//, "")}`;

    },


    isBackendConnected() {

        return Boolean(
            NexusConfiguration.api.baseUrl
        );

    },


    isFeatureEnabled(feature) {

        return Boolean(
            NexusConfig.get(
                `features.${feature}`,
                false
            )
        );

    }

};


/* =========================================================
   22. GLOBAL CONFIGURATION
   ========================================================= */

window.NexusConfiguration =
    NexusConfiguration;

window.NexusConfig =
    NexusConfig;


/* =========================================================
   END — NEXUS CONNECT 2030 CONFIGURATION
   ========================================================= */
