// ============================================================
// SHIPMENT SERVICE
// ============================================================
//
// Temporary in-memory storage for vendor shipments.
//
// Later this will be replaced with Oracle DB.
// ============================================================

const shipments = new Map();

const ALLOWED_TYPES = [
    "GENERAL CARGO",
    "PERISHABLE",
    "FRAGILE",
    "HIGH VALUE"
];

const ALLOWED_URGENCY = [
    "LOW",
    "MEDIUM",
    "HIGH",
    "CRITICAL"
];

const ALLOWED_STATUS = [
    "CREATED",
    "ROUTE_PLANNED",
    "IN_TRANSIT",
    "DELAYED",
    "DELIVERED",
    "CANCELLED"
];

function validateShipmentData(data) {

    const origin =
        String(data.origin || "").trim();

    const destination =
        String(data.destination || "").trim();

    const shipmentType =
        String(
            data.shipmentType || ""
        )
        .trim()
        .toUpperCase();

    const urgency =
        String(
            data.urgency || "MEDIUM"
        )
        .trim()
        .toUpperCase();

    const load = Number(data.load);

    if (!origin) {
        throw new Error("Shipment origin is required");
    }

    if (!destination) {
        throw new Error("Shipment destination is required");
    }

    if (!ALLOWED_TYPES.includes(shipmentType)) {
        throw new Error("Invalid shipment type");
    }

    if (!ALLOWED_URGENCY.includes(urgency)) {
        throw new Error("Invalid urgency");
    }

    if (
        !Number.isFinite(load) ||
        load <= 0
    ) {
        throw new Error(
            "Shipment load must be greater than 0"
        );
    }

    return {
        origin,
        destination,
        shipmentType,
        urgency,
        load
    };
}


// ============================================================
// CREATE SHIPMENT
// ============================================================

function createShipment(
    vendorId,
    vehicleId,
    data
) {

    const shipmentData =
        validateShipmentData(data);

    const shipmentId =
        `SH${String(
            shipments.size + 1
        ).padStart(3, "0")}`;

    const shipment = {

        shipmentId,

        vendorId,

        vehicleId,

        origin:
            shipmentData.origin,

        destination:
            shipmentData.destination,

        shipmentType:
            shipmentData.shipmentType,

        urgency:
            shipmentData.urgency,

        load:
            shipmentData.load,

        status:
            "CREATED",

        createdAt:
            new Date().toISOString()
    };

    shipments.set(
        shipmentId,
        shipment
    );

    return shipment;
}


// ============================================================
// GET SHIPMENT
// ============================================================

function getShipment(shipmentId) {

    return (
        shipments.get(shipmentId) ||
        null
    );
}


// ============================================================
// GET VENDOR SHIPMENTS
// ============================================================

function getVendorShipments(vendorId) {

    return Array.from(
        shipments.values()
    )
    .filter(
        shipment =>
            shipment.vendorId === vendorId
    );
}


// ============================================================
// UPDATE SHIPMENT
// ============================================================

function updateShipment(
    shipmentId,
    data
) {

    const shipment =
        shipments.get(shipmentId);

    if (!shipment) {
        return null;
    }

    if (data.origin !== undefined) {

        const origin =
            String(data.origin).trim();

        if (!origin) {
            throw new Error(
                "Shipment origin cannot be empty"
            );
        }

        shipment.origin = origin;
    }

    if (data.destination !== undefined) {

        const destination =
            String(
                data.destination
            ).trim();

        if (!destination) {
            throw new Error(
                "Shipment destination cannot be empty"
            );
        }

        shipment.destination =
            destination;
    }

    if (
        data.shipmentType !== undefined
    ) {

        const shipmentType =
            String(
                data.shipmentType
            )
            .trim()
            .toUpperCase();

        if (
            !ALLOWED_TYPES.includes(
                shipmentType
            )
        ) {
            throw new Error(
                "Invalid shipment type"
            );
        }

        shipment.shipmentType =
            shipmentType;
    }

    if (data.urgency !== undefined) {

        const urgency =
            String(
                data.urgency
            )
            .trim()
            .toUpperCase();

        if (
            !ALLOWED_URGENCY.includes(
                urgency
            )
        ) {
            throw new Error(
                "Invalid urgency"
            );
        }

        shipment.urgency =
            urgency;
    }

    if (data.load !== undefined) {

        const load =
            Number(data.load);

        if (
            !Number.isFinite(load) ||
            load <= 0
        ) {
            throw new Error(
                "Shipment load must be greater than 0"
            );
        }

        shipment.load = load;
    }

    if (data.vehicleId !== undefined) {

        const vehicleId =
            String(
                data.vehicleId
            ).trim();

        if (!vehicleId) {
            throw new Error(
                "Vehicle ID cannot be empty"
            );
        }

        shipment.vehicleId =
            vehicleId;
    }

    if (data.status !== undefined) {

        const status =
            String(
                data.status
            )
            .trim()
            .toUpperCase();

        if (
            !ALLOWED_STATUS.includes(
                status
            )
        ) {
            throw new Error(
                "Invalid shipment status"
            );
        }

        shipment.status =
            status;
    }

    shipment.updatedAt =
        new Date().toISOString();

    shipments.set(
        shipmentId,
        shipment
    );

    return shipment;
}


// ============================================================
// DELETE SHIPMENT
// ============================================================

function deleteShipment(
    shipmentId
) {

    return shipments.delete(
        shipmentId
    );
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    createShipment,

    getShipment,

    getVendorShipments,

    updateShipment,

    deleteShipment
};