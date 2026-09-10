// ============================================================
// FLEET / VEHICLE SERVICE
// ============================================================
//
// Temporary in-memory storage for vendor vehicles.
//
// Later this will be replaced with Oracle DB.
// The API in server.js can remain the same.
// ============================================================

const vehicles = new Map();

function validateVehicleData(data) {
    const registrationNumber =
        String(data.registrationNumber || "").trim();

    const vehicleType =
        String(data.vehicleType || "").trim();

    const capacity = Number(data.capacity);

    const fuelType =
        String(data.fuelType || "").trim();

    if (!registrationNumber) {
        throw new Error("Vehicle registration number is required");
    }

    if (!vehicleType) {
        throw new Error("Vehicle type is required");
    }

    if (!Number.isFinite(capacity) || capacity <= 0) {
        throw new Error("Vehicle capacity must be greater than 0");
    }

    if (!fuelType) {
        throw new Error("Fuel type is required");
    }

    return {
        registrationNumber,
        vehicleType,
        capacity,
        fuelType,
        isEV: Boolean(data.isEV)
    };
}


// ============================================================
// CREATE VEHICLE
// ============================================================

function createVehicle(vendorId, data) {
    const vehicleData = validateVehicleData(data);

    // Registration numbers must be unique
    for (const vehicle of vehicles.values()) {
        if (
            vehicle.registrationNumber.toLowerCase() ===
            vehicleData.registrationNumber.toLowerCase()
        ) {
            throw new Error(
                "A vehicle with this registration number already exists"
            );
        }
    }

    const vehicleId =
        `VH${String(vehicles.size + 1).padStart(3, "0")}`;

    const vehicle = {
        vehicleId,
        vendorId,

        registrationNumber: vehicleData.registrationNumber,
        vehicleType: vehicleData.vehicleType,
        capacity: vehicleData.capacity,
        fuelType: vehicleData.fuelType,
        isEV: vehicleData.isEV,

        status: "ACTIVE",

        createdAt: new Date().toISOString()
    };

    vehicles.set(vehicleId, vehicle);

    return vehicle;
}


// ============================================================
// GET VEHICLE
// ============================================================

function getVehicle(vehicleId) {
    return vehicles.get(vehicleId) || null;
}


// ============================================================
// GET ALL VEHICLES FOR A VENDOR
// ============================================================

function getVendorVehicles(vendorId) {
    return Array.from(vehicles.values())
        .filter(vehicle => vehicle.vendorId === vendorId);
}


// ============================================================
// UPDATE VEHICLE
// ============================================================

function updateVehicle(vehicleId, data) {
    const vehicle = vehicles.get(vehicleId);

    if (!vehicle) {
        return null;
    }

    if (data.registrationNumber !== undefined) {
        const registrationNumber =
            String(data.registrationNumber).trim();

        if (!registrationNumber) {
            throw new Error(
                "Vehicle registration number cannot be empty"
            );
        }

        for (const existingVehicle of vehicles.values()) {
            if (
                existingVehicle.vehicleId !== vehicleId &&
                existingVehicle.registrationNumber.toLowerCase() ===
                registrationNumber.toLowerCase()
            ) {
                throw new Error(
                    "A vehicle with this registration number already exists"
                );
            }
        }

        vehicle.registrationNumber = registrationNumber;
    }

    if (data.vehicleType !== undefined) {
        const vehicleType =
            String(data.vehicleType).trim();

        if (!vehicleType) {
            throw new Error("Vehicle type cannot be empty");
        }

        vehicle.vehicleType = vehicleType;
    }

    if (data.capacity !== undefined) {
        const capacity = Number(data.capacity);

        if (!Number.isFinite(capacity) || capacity <= 0) {
            throw new Error(
                "Vehicle capacity must be greater than 0"
            );
        }

        vehicle.capacity = capacity;
    }

    if (data.fuelType !== undefined) {
        const fuelType =
            String(data.fuelType).trim();

        if (!fuelType) {
            throw new Error("Fuel type cannot be empty");
        }

        vehicle.fuelType = fuelType;
    }

    if (data.isEV !== undefined) {
        vehicle.isEV = Boolean(data.isEV);
    }

    if (data.status !== undefined) {
        const allowedStatuses = [
            "ACTIVE",
            "INACTIVE",
            "MAINTENANCE"
        ];

        const status =
            String(data.status).toUpperCase();

        if (!allowedStatuses.includes(status)) {
            throw new Error(
                "Invalid vehicle status"
            );
        }

        vehicle.status = status;
    }

    vehicle.updatedAt = new Date().toISOString();

    vehicles.set(vehicleId, vehicle);

    return vehicle;
}


// ============================================================
// DELETE VEHICLE
// ============================================================

function deleteVehicle(vehicleId) {
    return vehicles.delete(vehicleId);
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    createVehicle,
    getVehicle,
    getVendorVehicles,
    updateVehicle,
    deleteVehicle
};