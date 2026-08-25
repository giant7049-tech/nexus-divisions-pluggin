/* ========================================================================
   NEXUS CONNECT 2030
   Nexus Buildsolutions Limited

   MODEL LAYER
   ------------------------------------------------------------------------
   Responsibilities:
   - Application data models
   - Professional identity
   - Business identity
   - Service models
   - Project models
   - Search result models
   - Request models
   - Notification models
   - Verification models
   - Data normalization
   - Model factories
   - Model serialization
   ======================================================================== */

"use strict";


/* ========================================================================
   01. MODEL NAMESPACE
   ======================================================================== */

const NexusModel = {};


/* ========================================================================
   02. MODEL ENUMERATIONS
   ======================================================================== */

NexusModel.Enums = {

    UserRole: Object.freeze({

        VISITOR:
            "visitor",

        PROFESSIONAL:
            "professional",

        BUSINESS:
            "business",

        ADMINISTRATOR:
            "administrator"

    }),


    VerificationStatus: Object.freeze({

        UNVERIFIED:
            "unverified",

        PENDING:
            "pending",

        VERIFIED:
            "verified",

        CERTIFIED:
            "certified",

        SUSPENDED:
            "suspended"

    }),


    RequestStatus: Object.freeze({

        DRAFT:
            "draft",

        PENDING:
            "pending",

        MATCHING:
            "matching",

        MATCHED:
            "matched",

        ACCEPTED:
            "accepted",

        IN_PROGRESS:
            "in-progress",

        COMPLETED:
            "completed",

        CANCELLED:
            "cancelled"

    }),


    RequestPriority: Object.freeze({

        STANDARD:
            "standard",

        URGENT:
            "urgent",

        EMERGENCY:
            "emergency"

    }),


    SearchType: Object.freeze({

        ALL:
            "all",

        PROFESSIONAL:
            "professional",

        BUSINESS:
            "business",

        SERVICE:
            "service",

        PROJECT:
            "project",

        LOCATION:
            "location"

    }),


    NotificationType: Object.freeze({

        SYSTEM:
            "system",

        REQUEST:
            "request",

        VERIFICATION:
            "verification",

        MESSAGE:
            "message",

        PROJECT:
            "project",

        SECURITY:
            "security"

    })

};


/* ========================================================================
   03. UTILITY FUNCTIONS
   ======================================================================== */

NexusModel.Utils = {

    id(prefix = "nexus") {

        const timestamp =
            Date.now().toString(36);

        const random =
            Math.random()
                .toString(36)
                .substring(2, 9);

        return `${prefix}-${timestamp}-${random}`;
    },


    now() {

        return new Date().toISOString();

    },


    string(value, fallback = "") {

        if (
            value === null ||
            value === undefined
        ) {

            return fallback;
        }

        return String(value).trim();

    },


    number(value, fallback = 0) {

        const number =
            Number(value);

        return Number.isFinite(number)
            ? number
            : fallback;

    },


    array(value) {

        return Array.isArray(value)
            ? value
            : [];

    },


    object(value) {

        return (
            value &&
            typeof value === "object" &&
            !Array.isArray(value)
        )
            ? value
            : {};

    },


    boolean(value, fallback = false) {

        if (
            value === true ||
            value === false
        ) {

            return value;
        }

        return fallback;

    },


    normalizeText(value) {

        return this.string(value)
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();

    },


    initials(name) {

        return this.string(name)
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(
                part =>
                    part
                        .charAt(0)
                        .toUpperCase()
            )
            .join("");

    },


    clone(value) {

        if (
            value === null ||
            value === undefined
        ) {

            return value;
        }

        return JSON.parse(
            JSON.stringify(value)
        );

    }

};


/* ========================================================================
   04. BASE MODEL
   ======================================================================== */

class NexusBaseModel {

    constructor(data = {}) {

        this.id =
            NexusModel.Utils.string(
                data.id,
                NexusModel.Utils.id("record")
            );

        this.createdAt =
            NexusModel.Utils.string(
                data.createdAt,
                NexusModel.Utils.now()
            );

        this.updatedAt =
            NexusModel.Utils.string(
                data.updatedAt,
                NexusModel.Utils.now()
            );

    }


    touch() {

        this.updatedAt =
            NexusModel.Utils.now();

        return this;

    }


    toJSON() {

        return {
            ...this
        };

    }


    clone() {

        return NexusModel.Utils.clone(
            this.toJSON()
        );

    }

}


/* ========================================================================
   05. LOCATION MODEL
   ======================================================================== */

class NexusLocation extends NexusBaseModel {

    constructor(data = {}) {

        super(data);

        this.country =
            NexusModel.Utils.string(
                data.country,
                "Nigeria"
            );

        this.state =
            NexusModel.Utils.string(
                data.state
            );

        this.city =
            NexusModel.Utils.string(
                data.city
            );

        this.area =
            NexusModel.Utils.string(
                data.area
            );

        this.address =
            NexusModel.Utils.string(
                data.address
            );

        this.latitude =
            data.latitude !== undefined
                ? NexusModel.Utils.number(
                    data.latitude,
                    null
                )
                : null;

        this.longitude =
            data.longitude !== undefined
                ? NexusModel.Utils.number(
                    data.longitude,
                    null
                )
                : null;

    }


    get displayName() {

        return [
            this.city,
            this.state,
            this.country
        ]
            .filter(Boolean)
            .join(", ");

    }

}


/* ========================================================================
   06. VERIFICATION MODEL
   ======================================================================== */

class NexusVerification {

    constructor(data = {}) {

        this.status =
            NexusModel.Utils.string(
                data.status,
                NexusModel.Enums.VerificationStatus.UNVERIFIED
            );

        this.verified =
            this.status ===
            NexusModel.Enums.VerificationStatus.VERIFIED ||
            this.status ===
            NexusModel.Enums.VerificationStatus.CERTIFIED;

        this.level =
            NexusModel.Utils.string(
                data.level,
                this.verified
                    ? "standard"
                    : "none"
            );

        this.verifiedAt =
            NexusModel.Utils.string(
                data.verifiedAt
            );

        this.verifiedBy =
            NexusModel.Utils.string(
                data.verifiedBy
            );

        this.documents =
            NexusModel.Utils.array(
                data.documents
            );

        this.notes =
            NexusModel.Utils.string(
                data.notes
            );

    }

}


/* ========================================================================
   07. PROFESSIONAL MODEL
   ======================================================================== */

class NexusProfessional extends NexusBaseModel {

    constructor(data = {}) {

        super(data);

        this.type =
            "professional";

        this.name =
            NexusModel.Utils.string(
                data.name,
                "Nexus Professional"
            );

        this.firstName =
            NexusModel.Utils.string(
                data.firstName
            );

        this.lastName =
            NexusModel.Utils.string(
                data.lastName
            );

        this.title =
            NexusModel.Utils.string(
                data.title,
                "Professional"
            );

        this.role =
            NexusModel.Utils.string(
                data.role,
                "Professional Services"
            );

        this.category =
            NexusModel.Utils.string(
                data.category,
                "General Professional Services"
            );

        this.company =
            NexusModel.Utils.string(
                data.company
            );

        this.bio =
            NexusModel.Utils.string(
                data.bio
            );

        this.email =
            NexusModel.Utils.string(
                data.email
            );

        this.phone =
            NexusModel.Utils.string(
                data.phone
            );

        this.avatar =
            NexusModel.Utils.string(
                data.avatar
            );

        this.location =
            new NexusLocation(
                data.location || {}
            );

        this.verification =
            new NexusVerification(
                data.verification || {}
            );

        this.services =
            NexusModel.Utils.array(
                data.services
            );

        this.skills =
            NexusModel.Utils.array(
                data.skills
            );

        this.certifications =
            NexusModel.Utils.array(
                data.certifications
            );

        this.projects =
            NexusModel.Utils.array(
                data.projects
            );

        this.yearsExperience =
            NexusModel.Utils.number(
                data.yearsExperience
            );

        this.rating =
            NexusModel.Utils.number(
                data.rating
            );

        this.reviewCount =
            NexusModel.Utils.number(
                data.reviewCount
            );

        this.available =
            NexusModel.Utils.boolean(
                data.available,
                true
            );

        this.featured =
            NexusModel.Utils.boolean(
                data.featured
            );

    }


    get initials() {

        return NexusModel.Utils.initials(
            this.name
        );

    }


    get verified() {

        return this.verification.verified;

    }


    get badge() {

        if (
            this.verification.status ===
            NexusModel.Enums.VerificationStatus.CERTIFIED
        ) {

            return "Nexus Certified";

        }

        if (this.verification.verified) {

            return "Nexus Verified";

        }

        return "Unverified";

    }

}


/* ========================================================================
   08. BUSINESS MODEL
   ======================================================================== */

class NexusBusiness extends NexusBaseModel {

    constructor(data = {}) {

        super(data);

        this.type =
            "business";

        this.name =
            NexusModel.Utils.string(
                data.name,
                "Nexus Business"
            );

        this.legalName =
            NexusModel.Utils.string(
                data.legalName
            );

        this.industry =
            NexusModel.Utils.string(
                data.industry,
                "Professional Services"
            );

        this.description =
            NexusModel.Utils.string(
                data.description
            );

        this.logo =
            NexusModel.Utils.string(
                data.logo
            );

        this.website =
            NexusModel.Utils.string(
                data.website
            );

        this.email =
            NexusModel.Utils.string(
                data.email
            );

        this.phone =
            NexusModel.Utils.string(
                data.phone
            );

        this.location =
            new NexusLocation(
                data.location || {}
            );

        this.verification =
            new NexusVerification(
                data.verification || {}
            );

        this.services =
            NexusModel.Utils.array(
                data.services
            );

        this.projects =
            NexusModel.Utils.array(
                data.projects
            );

        this.employeeCount =
            NexusModel.Utils.number(
                data.employeeCount
            );

        this.rating =
            NexusModel.Utils.number(
                data.rating
            );

        this.reviewCount =
            NexusModel.Utils.number(
                data.reviewCount
            );

        this.featured =
            NexusModel.Utils.boolean(
                data.featured
            );

    }


    get verified() {

        return this.verification.verified;

    }


    get badge() {

        if (
            this.verification.status ===
            NexusModel.Enums.VerificationStatus.CERTIFIED
        ) {

            return "Nexus Certified Business";

        }

        if (this.verification.verified) {

            return "Nexus Business";

        }

        return "Business";

    }

}


/* ========================================================================
   09. SERVICE MODEL
   ======================================================================== */

class NexusService extends NexusBaseModel {

    constructor(data = {}) {

        super(data);

        this.type =
            "service";

        this.name =
            NexusModel.Utils.string(
                data.name,
                "Professional Service"
            );

        this.category =
            NexusModel.Utils.string(
                data.category,
                "General Services"
            );

        this.description =
            NexusModel.Utils.string(
                data.description
            );

        this.icon =
            NexusModel.Utils.string(
                data.icon,
                "◆"
            );

        this.location =
            new NexusLocation(
                data.location || {}
            );

        this.providers =
            NexusModel.Utils.array(
                data.providers
            );

        this.available =
            NexusModel.Utils.boolean(
                data.available,
                true
            );

        this.featured =
            NexusModel.Utils.boolean(
                data.featured
            );

    }

}


/* ========================================================================
   10. PROJECT MODEL
   ======================================================================== */

class NexusProject extends NexusBaseModel {

    constructor(data = {}) {

        super(data);

        this.type =
            "project";

        this.name =
            NexusModel.Utils.string(
                data.name,
                "Nexus Project"
            );

        this.description =
            NexusModel.Utils.string(
                data.description
            );

        this.category =
            NexusModel.Utils.string(
                data.category,
                "Construction"
            );

        this.client =
            NexusModel.Utils.string(
                data.client
            );

        this.contractor =
            NexusModel.Utils.string(
                data.contractor
            );

        this.location =
            new NexusLocation(
                data.location || {}
            );

        this.status =
            NexusModel.Utils.string(
                data.status,
                "active"
            );

        this.startDate =
            NexusModel.Utils.string(
                data.startDate
            );

        this.endDate =
            NexusModel.Utils.string(
                data.endDate
            );

        this.progress =
            Math.min(
                100,
                Math.max(
                    0,
                    NexusModel.Utils.number(
                        data.progress
                    )
                )
            );

        this.coverImage =
            NexusModel.Utils.string(
                data.coverImage
            );

        this.gallery =
            NexusModel.Utils.array(
                data.gallery
            );

        this.team =
            NexusModel.Utils.array(
                data.team
            );

    }

}


/* ========================================================================
   11. SEARCH RESULT MODEL
   ======================================================================== */

class NexusSearchResult extends NexusBaseModel {

    constructor(data = {}) {

        super(data);

        this.type =
            NexusModel.Utils.string(
                data.type,
                NexusModel.Enums.SearchType.ALL
            );

        this.name =
            NexusModel.Utils.string(
                data.name,
                "Nexus Network Member"
            );

        this.role =
            NexusModel.Utils.string(
                data.role,
                "Verified Professional"
            );

        this.category =
            NexusModel.Utils.string(
                data.category
            );

        this.description =
            NexusModel.Utils.string(
                data.description
            );

        this.location =
            NexusModel.Utils.string(
                data.location,
                "Nigeria"
            );

        this.badge =
            NexusModel.Utils.string(
                data.badge,
                "Nexus Verified"
            );

        this.avatar =
            NexusModel.Utils.string(
                data.avatar
            );

        this.score =
            NexusModel.Utils.number(
                data.score
            );

        this.metadata =
            NexusModel.Utils.object(
                data.metadata
            );

    }


    get initials() {

        return NexusModel.Utils.initials(
            this.name
        );

    }

}


/* ========================================================================
   12. REQUEST MODEL
   ======================================================================== */

class NexusRequest extends NexusBaseModel {

    constructor(data = {}) {

        super(data);

        this.type =
            "request";

        this.service =
            NexusModel.Utils.string(
                data.service,
                "Professional Service"
            );

        this.description =
            NexusModel.Utils.string(
                data.description
            );

        this.status =
            NexusModel.Utils.string(
                data.status,
                NexusModel.Enums.RequestStatus.PENDING
            );

        this.priority =
            NexusModel.Utils.string(
                data.priority,
                NexusModel.Enums.RequestPriority.STANDARD
            );

        this.requesterId =
            NexusModel.Utils.string(
                data.requesterId
            );

        this.providerId =
            NexusModel.Utils.string(
                data.providerId
            );

        this.location =
            new NexusLocation(
                data.location || {}
            );

        this.preferredDate =
            NexusModel.Utils.string(
                data.preferredDate
            );

        this.budget =
            NexusModel.Utils.number(
                data.budget
            );

        this.notes =
            NexusModel.Utils.string(
                data.notes
            );

    }


    get active() {

        return ![
            NexusModel.Enums.RequestStatus.COMPLETED,
            NexusModel.Enums.RequestStatus.CANCELLED
        ].includes(
            this.status
        );

    }

}


/* ========================================================================
   13. NOTIFICATION MODEL
   ======================================================================== */

class NexusNotification extends NexusBaseModel {

    constructor(data = {}) {

        super(data);

        this.type =
            NexusModel.Utils.string(
                data.type,
                NexusModel.Enums.NotificationType.SYSTEM
            );

        this.title =
            NexusModel.Utils.string(
                data.title,
                "Nexus Connect"
            );

        this.message =
            NexusModel.Utils.string(
                data.message
            );

        this.read =
            NexusModel.Utils.boolean(
                data.read
            );

        this.priority =
            NexusModel.Utils.string(
                data.priority,
                NexusModel.Enums.RequestPriority.STANDARD
            );

        this.action =
            NexusModel.Utils.string(
                data.action
            );

        this.timestamp =
            NexusModel.Utils.string(
                data.timestamp,
                NexusModel.Utils.now()
            );

    }

}


/* ========================================================================
   14. USER MODEL
   ======================================================================== */

class NexusUser extends NexusBaseModel {

    constructor(data = {}) {

        super(data);

        this.type =
            "user";

        this.name =
            NexusModel.Utils.string(
                data.name,
                "Nexus User"
            );

        this.email =
            NexusModel.Utils.string(
                data.email
            );

        this.phone =
            NexusModel.Utils.string(
                data.phone
            );

        this.role =
            NexusModel.Utils.string(
                data.role,
                NexusModel.Enums.UserRole.VISITOR
            );

        this.avatar =
            NexusModel.Utils.string(
                data.avatar
            );

        this.location =
            new NexusLocation(
                data.location || {}
            );

        this.verification =
            new NexusVerification(
                data.verification || {}
            );

        this.permissions =
            NexusModel.Utils.array(
                data.permissions
            );

        this.preferences =
            NexusModel.Utils.object(
                data.preferences
            );

        this.active =
            NexusModel.Utils.boolean(
                data.active,
                true
            );

    }


    get initials() {

        return NexusModel.Utils.initials(
            this.name
        );

    }


    get verified() {

        return this.verification.verified;

    }

}


/* ========================================================================
   15. MODEL FACTORY
   ======================================================================== */

NexusModel.create = function (
    type,
    data = {}
) {

    switch (
        NexusModel.Utils.normalizeText(type)
    ) {

        case "professional":

            return new NexusProfessional(
                data
            );


        case "business":

            return new NexusBusiness(
                data
            );


        case "service":

            return new NexusService(
                data
            );


        case "project":

            return new NexusProject(
                data
            );


        case "request":

            return new NexusRequest(
                data
            );


        case "notification":

            return new NexusNotification(
                data
            );


        case "user":

            return new NexusUser(
                data
            );


        case "search":

        case "searchresult":

            return new NexusSearchResult(
                data
            );


        case "location":

            return new NexusLocation(
                data
            );


        default:

            return new NexusBaseModel(
                data
            );

    }

};


/* ========================================================================
   16. COLLECTION FACTORY
   ======================================================================== */

NexusModel.collection = function (
    type,
    items = []
) {

    return NexusModel.Utils
        .array(items)
        .map(
            item =>
                NexusModel.create(
                    type,
                    item
                )
        );

};


/* ========================================================================
   17. SEARCH RESULT NORMALIZATION
   ======================================================================== */

NexusModel.normalizeSearchResults =
    function (results = []) {

        return NexusModel.Utils
            .array(results)
            .map(
                result =>
                    result instanceof NexusSearchResult
                        ? result
                        : new NexusSearchResult(
                            result
                        )
            );

    };


/* ========================================================================
   18. PROFESSIONAL NORMALIZATION
   ======================================================================== */

NexusModel.normalizeProfessional =
    function (data = {}) {

        return data instanceof NexusProfessional
            ? data
            : new NexusProfessional(
                data
            );

    };


/* ========================================================================
   19. BUSINESS NORMALIZATION
   ======================================================================== */

NexusModel.normalizeBusiness =
    function (data = {}) {

        return data instanceof NexusBusiness
            ? data
            : new NexusBusiness(
                data
            );

    };


/* ========================================================================
   20. REQUEST NORMALIZATION
   ======================================================================== */

NexusModel.normalizeRequest =
    function (data = {}) {

        return data instanceof NexusRequest
            ? data
            : new NexusRequest(
                data
            );

    };


/* ========================================================================
   21. SERIALIZATION
   ======================================================================== */

NexusModel.serialize =
    function (model) {

        if (
            !model ||
            typeof model.toJSON !== "function"
        ) {

            return NexusModel.Utils.clone(
                model
            );

        }

        return model.toJSON();

    };


/* ========================================================================
   22. VALIDATION
   ======================================================================== */

NexusModel.validate =
    function (model) {

        if (!model) {

            return {

                valid: false,

                errors: [
                    "Model is required."
                ]

            };

        }


        const errors = [];


        if (!model.id) {

            errors.push(
                "Model ID is required."
            );

        }


        if (!model.createdAt) {

            errors.push(
                "Created timestamp is required."
            );

        }


        return {

            valid:
                errors.length === 0,

            errors

        };

    };


/* ========================================================================
   23. DEMONSTRATION PROFESSIONAL DATA
   ======================================================================== */

NexusModel.demoProfessionals = [

    new NexusProfessional({

        id:
            "professional-001",

        name:
            "Nexus Certified Engineer",

        title:
            "Senior Building Engineer",

        role:
            "Building & Construction Engineering",

        category:
            "Building Engineering",

        company:
            "Nexus Buildsolutions Limited",

        location: {

            country:
                "Nigeria",

            state:
                "Gombe",

            city:
                "Gombe"

        },

        verification: {

            status:
                NexusModel.Enums.VerificationStatus.CERTIFIED,

            level:
                "professional",

            verifiedAt:
                "2030-01-01T00:00:00.000Z"

        },

        services: [

            "Building Construction",

            "Project Management",

            "Site Engineering",

            "Construction Supervision"

        ],

        skills: [

            "Construction",

            "Site Management",

            "Project Delivery",

            "Building Engineering"

        ],

        yearsExperience:
            10,

        rating:
            4.9,

        reviewCount:
            128,

        available:
            true,

        featured:
            true

    }),


    new NexusProfessional({

        id:
            "professional-002",

        name:
            "Nexus Electrical Specialist",

        title:
            "Electrical Systems Specialist",

        role:
            "Electrical & Technical Services",

        category:
            "Electrical Services",

        location: {

            country:
                "Nigeria",

            state:
                "FCT",

            city:
                "Abuja"

        },

        verification: {

            status:
                NexusModel.Enums.VerificationStatus.VERIFIED,

            level:
                "professional"

        },

        services: [

            "Electrical Installation",

            "Power Systems",

            "Maintenance"

        ],

        yearsExperience:
            8,

        rating:
            4.8,

        reviewCount:
            94,

        available:
            true,

        featured:
            true

    })

];


/* ========================================================================
   24. DEMONSTRATION BUSINESS DATA
   ======================================================================== */

NexusModel.demoBusinesses = [

    new NexusBusiness({

        id:
            "business-001",

        name:
            "Nexus Construction Partner",

        industry:
            "Construction & Property",

        description:
            "Verified construction and property services partner.",

        location: {

            country:
                "Nigeria",

            state:
                "FCT",

            city:
                "Abuja"

        },

        verification: {

            status:
                NexusModel.Enums.VerificationStatus.VERIFIED

        },

        services: [

            "Construction",

            "Property Development",

            "Project Management"

        ],

        rating:
            4.7,

        reviewCount:
            76,

        featured:
            true

    })

];


/* ========================================================================
   25. DEMONSTRATION SERVICE DATA
   ======================================================================== */

NexusModel.demoServices = [

    new NexusService({

        id:
            "service-001",

        name:
            "Building Engineering",

        category:
            "Construction",

        description:
            "Professional building engineering, supervision and project delivery.",

        icon:
            "BE",

        featured:
            true

    }),


    new NexusService({

        id:
            "service-002",

        name:
            "Electrical Services",

        category:
            "Technical",

        description:
            "Verified electrical professionals and technical service providers.",

        icon:
            "EL",

        featured:
            true

    }),


    new NexusService({

        id:
            "service-003",

        name:
            "Property Services",

        category:
            "Property",

        description:
            "Professional property development, management and support.",

        icon:
            "PR",

        featured:
            true

    }),


    new NexusService({

        id:
            "service-004",

        name:
            "Project Management",

        category:
            "Professional",

        description:
            "Structured project coordination and professional delivery.",

        icon:
            "PM",

        featured:
            true

    })

];


/* ========================================================================
   26. PUBLIC MODEL API
   ======================================================================== */

NexusModel.classes = {

    Base:
        NexusBaseModel,

    Location:
        NexusLocation,

    Verification:
        NexusVerification,

    User:
        NexusUser,

    Professional:
        NexusProfessional,

    Business:
        NexusBusiness,

    Service:
        NexusService,

    Project:
        NexusProject,

    SearchResult:
        NexusSearchResult,

    Request:
        NexusRequest,

    Notification:
        NexusNotification

};


/* ========================================================================
   27. GLOBAL EXPORT
   ======================================================================== */

window.NexusModel =
    NexusModel;


/* ========================================================================
   28. MODEL INITIALIZATION
   ======================================================================== */

console.info(
    "[Nexus Connect] Model layer initialized successfully."
);


/* ========================================================================
   END — NEXUS CONNECT 2030 MODEL LAYER
   ======================================================================== */
