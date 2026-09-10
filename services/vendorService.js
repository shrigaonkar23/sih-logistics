// ============================================================
// VENDOR SERVICE
// ============================================================
//
// Temporary in-memory storage for the Vendor OMS.
//
// This will later be replaced with Oracle DB.
// The API in server.js can remain the same.
// ============================================================


// ============================================================
// TEMPORARY VENDOR STORAGE
// ============================================================

const vendors = new Map();


// ============================================================
// CREATE VENDOR
// ============================================================

function createVendor(data) {

    const name =
        String(data.name || "").trim();

    const email =
        String(data.email || "").trim();


    if (!name) {

        throw new Error(
            "Vendor name is required"
        );

    }


    if (!email) {

        throw new Error(
            "Vendor email is required"
        );

    }


    // --------------------------------------------------------
    // CHECK DUPLICATE EMAIL
    // --------------------------------------------------------

    for (const vendor of vendors.values()) {

        if (
            vendor.email.toLowerCase() ===
            email.toLowerCase()
        ) {

            throw new Error(
                "A vendor with this email already exists"
            );

        }

    }


    // --------------------------------------------------------
    // GENERATE VENDOR ID
    // --------------------------------------------------------

    const vendorId =
        `V${String(vendors.size + 1).padStart(3, "0")}`;


    // --------------------------------------------------------
    // CREATE VENDOR
    // --------------------------------------------------------

    const vendor = {

        vendorId,

        name,

        email,

        status: "ACTIVE",

        createdAt:
            new Date().toISOString()

    };


    // --------------------------------------------------------
    // SAVE VENDOR
    // --------------------------------------------------------

    vendors.set(
        vendorId,
        vendor
    );


    return vendor;
}


// ============================================================
// GET VENDOR
// ============================================================

function getVendor(vendorId) {

    return (
        vendors.get(vendorId) ||
        null
    );

}


// ============================================================
// GET ALL VENDORS
// ============================================================

function getAllVendors() {

    return Array.from(
        vendors.values()
    );

}


// ============================================================
// UPDATE VENDOR
// ============================================================

function updateVendor(
    vendorId,
    data
) {

    const vendor =
        vendors.get(vendorId);


    if (!vendor) {

        return null;

    }


    // --------------------------------------------------------
    // UPDATE NAME
    // --------------------------------------------------------

    if (
        data.name !== undefined
    ) {

        const name =
            String(data.name).trim();


        if (!name) {

            throw new Error(
                "Vendor name cannot be empty"
            );

        }


        vendor.name = name;

    }


    // --------------------------------------------------------
    // UPDATE EMAIL
    // --------------------------------------------------------

    if (
        data.email !== undefined
    ) {

        const email =
            String(data.email).trim();


        if (!email) {

            throw new Error(
                "Vendor email cannot be empty"
            );

        }


        // Check duplicate email
        for (
            const existingVendor
            of vendors.values()
        ) {

            if (
                existingVendor.vendorId !==
                vendorId &&
                existingVendor.email.toLowerCase() ===
                email.toLowerCase()
            ) {

                throw new Error(
                    "A vendor with this email already exists"
                );

            }

        }


        vendor.email = email;

    }


    // --------------------------------------------------------
    // UPDATE TIMESTAMP
    // --------------------------------------------------------

    vendor.updatedAt =
        new Date().toISOString();


    // --------------------------------------------------------
    // SAVE
    // --------------------------------------------------------

    vendors.set(
        vendorId,
        vendor
    );


    return vendor;

}


// ============================================================
// DELETE VENDOR
// ============================================================

function deleteVendor(
    vendorId
) {

    return vendors.delete(
        vendorId
    );

}


// ============================================================
// EXPORT FUNCTIONS
// ============================================================

module.exports = {

    createVendor,

    getVendor,

    getAllVendors,

    updateVendor,

    deleteVendor

};