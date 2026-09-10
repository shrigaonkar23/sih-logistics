import { useEffect, useMemo, useState } from "react";

import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const API_BASE = "http://localhost:3000";

const defaultCenter = [23.5, 92.5];

const routeColors = [
  "#111827",
  "#2563eb",
  "#7c3aed",
  "#059669",
];

const markerIcon = new L.Icon({
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function FitRoutes({ routes }) {
  const map = useMap();

  useEffect(() => {
    const allPoints = routes.flatMap((route) =>
      Array.isArray(route.coordinates)
        ? route.coordinates.map(([lng, lat]) => [lat, lng])
        : []
    );

    if (allPoints.length > 1) {
      const bounds = L.latLngBounds(allPoints);

      map.fitBounds(bounds, {
        padding: [40, 40],
        maxZoom: 12,
      });
    }
  }, [routes, map]);

  return null;
}

function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) {
    return "--";
  }

  const mins = Math.round(Number(minutes));

  if (mins < 60) {
    return `${mins} min`;
  }

  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;

  return remaining === 0
    ? `${hours} hr`
    : `${hours} hr ${remaining} min`;
}

function getSafetyClass(score) {
  const value = Number(score);

  if (value >= 80) return "safe";
  if (value >= 60) return "moderate";

  return "danger";
}

function getRiskLabel(risk) {
  if (!risk) return "UNKNOWN";

  return String(risk)
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toUpperCase();
}

function getHazardMessage(route) {
  const hazards = route?.hazardDetails;

  if (!hazards) {
    return "Hazard assessment unavailable.";
  }

  const messages = [];

  if (Number(hazards.rainfall) > 0) {
    messages.push("Rainfall detected");
  }

  if (Number(hazards.floodRisk) > 0) {
    messages.push("Flood risk detected");
  }

  if (Number(hazards.landslideRisk) > 0) {
    messages.push("Landslide risk detected");
  }

  if (Number(hazards.stormRisk) > 0) {
    messages.push("Storm risk detected");
  }

  if (Number(hazards.disasterRisk) > 0) {
    messages.push("Disaster risk detected");
  }

  return messages.length
    ? messages.join(" • ")
    : "No significant environmental hazard detected.";
}

function getEntityId(entity) {
  if (!entity) return "";

  return (
    entity.id ??
    entity.vendorId ??
    entity.vehicleId ??
    entity._id ??
    ""
  );
}

function App() {
  const [activeSection, setActiveSection] = useState("routing");

  // ============================================================
  // ROUTING STATE
  // ============================================================

  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [urgency, setUrgency] = useState("MEDIUM");

  const [routes, setRoutes] = useState([]);
  const [bestRoute, setBestRoute] = useState(null);
  const [routeRequest, setRouteRequest] = useState(null);

  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [selectedRoute, setSelectedRoute] = useState(null);

  // ============================================================
  // ROUTE VENDOR / VEHICLE
  // These are independent from the OMS active vendor.
  // ============================================================

  const [routeVendorId, setRouteVendorId] = useState("");
  const [routeVehicles, setRouteVehicles] = useState([]);
  const [routeVehicleId, setRouteVehicleId] = useState("");
  const [routeVehicleLoading, setRouteVehicleLoading] =
    useState(false);

  // ============================================================
  // VENDOR STATE
  // ============================================================

  const [vendors, setVendors] = useState([]);
  const [selectedVendorId, setSelectedVendorId] = useState("");

  const [vendorLoading, setVendorLoading] = useState(false);
  const [vendorError, setVendorError] = useState("");

  const [showVendorForm, setShowVendorForm] = useState(false);

  const [vendorForm, setVendorForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });

  // ============================================================
  // VEHICLE STATE
  // ============================================================

  const [vehicles, setVehicles] = useState([]);
  const [vehicleLoading, setVehicleLoading] = useState(false);

  const [showVehicleForm, setShowVehicleForm] = useState(false);

  const [vehicleForm, setVehicleForm] = useState({
    registrationNumber: "",
    vehicleType: "TRUCK",
    capacity: "",
    fuelType: "DIESEL",
  });

  // ============================================================
  // SHIPMENT STATE
  // ============================================================

  const [shipments, setShipments] = useState([]);
  const [shipmentLoading, setShipmentLoading] = useState(false);

  const [showShipmentForm, setShowShipmentForm] = useState(false);

  const [shipmentForm, setShipmentForm] = useState({
    vehicleId: "",
    origin: "",
    destination: "",
    shipmentType: "GENERAL",
    load: "",
  });

  // ============================================================
  // LOAD VENDORS
  // ============================================================

  useEffect(() => {
    loadVendors();
  }, []);

  async function loadVendors(preferredVendorId = "") {
    try {
      setVendorLoading(true);
      setVendorError("");

      const response = await fetch(`${API_BASE}/vendors`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to load vendors"
        );
      }

      const vendorList = Array.isArray(data.vendors)
        ? data.vendors
        : [];

      setVendors(vendorList);

      const currentStillExists = vendorList.some(
        (vendor) =>
          String(getEntityId(vendor)) ===
          String(selectedVendorId)
      );

      if (preferredVendorId) {
        const preferredExists = vendorList.some(
          (vendor) =>
            String(getEntityId(vendor)) ===
            String(preferredVendorId)
        );

        if (preferredExists) {
          setSelectedVendorId(
            String(preferredVendorId)
          );
        }
      } else if (
        !currentStillExists &&
        vendorList.length > 0
      ) {
        setSelectedVendorId(
          String(getEntityId(vendorList[0]))
        );
      }

      if (vendorList.length === 0) {
        setSelectedVendorId("");
      }
    } catch (error) {
      console.error(error);

      setVendorError(
        error.message || "Failed to load vendors"
      );
    } finally {
      setVendorLoading(false);
    }
  }

  // ============================================================
  // LOAD OMS VEHICLES + SHIPMENTS WHEN OMS VENDOR CHANGES
  // ============================================================

  useEffect(() => {
    if (!selectedVendorId) {
      setVehicles([]);
      setShipments([]);

      setShipmentForm((previous) => ({
        ...previous,
        vehicleId: "",
      }));

      return;
    }

    loadVendorVehicles(selectedVendorId);
    loadVendorShipments(selectedVendorId);

    setShipmentForm((previous) => ({
      ...previous,
      vehicleId: "",
    }));
  }, [selectedVendorId]);

  async function loadVendorVehicles(vendorId) {
    if (!vendorId) {
      setVehicles([]);
      return;
    }

    try {
      setVehicleLoading(true);

      const response = await fetch(
        `${API_BASE}/vendors/${vendorId}/vehicles`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to load vehicles"
        );
      }

      setVehicles(
        Array.isArray(data.vehicles)
          ? data.vehicles
          : []
      );
    } catch (error) {
      console.error(error);

      setVendorError(
        error.message || "Failed to load vehicles"
      );

      setVehicles([]);
    } finally {
      setVehicleLoading(false);
    }
  }

  async function loadVendorShipments(vendorId) {
    if (!vendorId) {
      setShipments([]);
      return;
    }

    try {
      setShipmentLoading(true);

      const response = await fetch(
        `${API_BASE}/vendors/${vendorId}/shipments`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to load shipments"
        );
      }

      setShipments(
        Array.isArray(data.shipments)
          ? data.shipments
          : []
      );
    } catch (error) {
      console.error(error);

      setVendorError(
        error.message || "Failed to load shipments"
      );

      setShipments([]);
    } finally {
      setShipmentLoading(false);
    }
  }

  // ============================================================
  // LOAD VEHICLES FOR ROUTE VENDOR
  // ============================================================

  useEffect(() => {
    if (!routeVendorId) {
      setRouteVehicles([]);
      setRouteVehicleId("");
      return;
    }

    loadRouteVehicles(routeVendorId);
  }, [routeVendorId]);

  async function loadRouteVehicles(vendorId) {
    try {
      setRouteVehicleLoading(true);

      const response = await fetch(
        `${API_BASE}/vendors/${vendorId}/vehicles`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to load route vehicles"
        );
      }

      const vehicleList = Array.isArray(data.vehicles)
        ? data.vehicles
        : [];

      const activeVehicles = vehicleList.filter(
        (vehicle) =>
          vehicle.status === "ACTIVE" ||
          !vehicle.status
      );

      setRouteVehicles(activeVehicles);

      // If the previously selected vehicle does not
      // belong to the newly selected vendor, clear it.
      const currentStillExists = activeVehicles.some(
        (vehicle) =>
          String(getEntityId(vehicle)) ===
          String(routeVehicleId)
      );

      if (!currentStillExists) {
        setRouteVehicleId("");
      }
    } catch (error) {
      console.error(error);

      setRouteVehicles([]);
      setRouteVehicleId("");

      setRouteError(
        error.message || "Failed to load vendor vehicles"
      );
    } finally {
      setRouteVehicleLoading(false);
    }
  }

  // ============================================================
  // CHANGE OMS ACTIVE VENDOR
  // ============================================================

  function handleVendorChange(vendorId) {
    setSelectedVendorId(String(vendorId));

    setShipmentForm((previous) => ({
      ...previous,
      vehicleId: "",
    }));

    setVendorError("");
  }

  // ============================================================
  // ROUTE VENDOR CHANGE
  // ============================================================

  function handleRouteVendorChange(vendorId) {
    setRouteVendorId(String(vendorId));
    setRouteVehicleId("");
    setRouteError("");
  }

  // ============================================================
  // FIND ROUTES
  // ============================================================

  async function handleFindRoutes(event) {
    event.preventDefault();

    if (!source.trim() || !destination.trim()) {
      setRouteError(
        "Please enter both source and destination."
      );
      return;
    }

    try {
      setLoadingRoutes(true);
      setRouteError("");

      setRoutes([]);
      setBestRoute(null);
      setSelectedRoute(null);

      const selectedRouteVehicle =
        routeVehicles.find(
          (vehicle) =>
            String(getEntityId(vehicle)) ===
            String(routeVehicleId)
        ) || null;

      const requestBody = {
        source: source.trim(),
        destination: destination.trim(),
        urgency,

        vehicle: selectedRouteVehicle,

        shipment:
          routeVendorId && routeVehicleId
            ? {
                vehicleId: routeVehicleId,
                origin: source.trim(),
                destination: destination.trim(),
                vendorId: routeVendorId,
              }
            : null,
      };

      const response = await fetch(
        `${API_BASE}/find-route`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to find routes"
        );
      }

      setRouteRequest(data);

      setRoutes(
        Array.isArray(data.routes)
          ? data.routes
          : []
      );

      setBestRoute(data.bestRoute || null);

      if (data.bestRoute) {
        setSelectedRoute(
          data.bestRoute.routeNumber
        );
      } else if (data.routes?.length) {
        setSelectedRoute(
          data.routes[0].routeNumber
        );
      }
    } catch (error) {
      console.error(error);

      setRouteError(
        error.message || "Unable to find routes."
      );
    } finally {
      setLoadingRoutes(false);
    }
  }

  // ============================================================
  // CREATE VENDOR
  // ============================================================

  async function handleCreateVendor(event) {
    event.preventDefault();

    if (
      !vendorForm.name.trim() ||
      !vendorForm.email.trim()
    ) {
      setVendorError(
        "Business name and email are required."
      );
      return;
    }

    try {
      setVendorLoading(true);
      setVendorError("");

      const response = await fetch(
        `${API_BASE}/vendors`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: vendorForm.name.trim(),
            email: vendorForm.email.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to create vendor"
        );
      }

      const newVendorId = getEntityId(data.vendor);

      setVendorForm({
        name: "",
        email: "",
        phone: "",
        address: "",
      });

      setShowVendorForm(false);

      await loadVendors(newVendorId);
    } catch (error) {
      console.error(error);

      setVendorError(
        error.message || "Failed to create vendor"
      );
    } finally {
      setVendorLoading(false);
    }
  }

  // ============================================================
  // OPEN VEHICLE FORM
  // ============================================================

  function openVehicleForm() {
    setVendorError("");

    if (!selectedVendorId) {
      setVendorError(
        "Please select a vendor before adding a vehicle."
      );
      return;
    }

    setVehicleForm({
      registrationNumber: "",
      vehicleType: "TRUCK",
      capacity: "",
      fuelType: "DIESEL",
    });

    setShowVehicleForm(true);
  }

  // ============================================================
  // CREATE VEHICLE
  // ============================================================

  async function handleCreateVehicle(event) {
    event.preventDefault();

    if (!selectedVendorId) {
      setVendorError(
        "Select a vendor before adding a vehicle."
      );
      return;
    }

    if (
      !vehicleForm.registrationNumber.trim() ||
      !vehicleForm.capacity
    ) {
      setVendorError(
        "Registration number and capacity are required."
      );
      return;
    }

    try {
      setVehicleLoading(true);
      setVendorError("");

      const response = await fetch(
        `${API_BASE}/vendors/${selectedVendorId}/vehicles`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            registrationNumber:
              vehicleForm.registrationNumber
                .trim()
                .toUpperCase(),

            vehicleType: vehicleForm.vehicleType,

            capacity: Number(vehicleForm.capacity),

            fuelType: vehicleForm.fuelType,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to create vehicle"
        );
      }

      setVehicleForm({
        registrationNumber: "",
        vehicleType: "TRUCK",
        capacity: "",
        fuelType: "DIESEL",
      });

      setShowVehicleForm(false);

      await loadVendorVehicles(selectedVendorId);

      // If the same vendor is being used in
      // Route Intelligence, refresh its vehicle list too.
      if (
        String(routeVendorId) ===
        String(selectedVendorId)
      ) {
        await loadRouteVehicles(selectedVendorId);
      }
    } catch (error) {
      console.error(error);

      setVendorError(
        error.message || "Failed to create vehicle"
      );
    } finally {
      setVehicleLoading(false);
    }
  }

  // ============================================================
  // OPEN NORMAL SHIPMENT FORM
  // ============================================================

  function openShipmentForm() {
    setVendorError("");

    if (!selectedVendorId) {
      setVendorError(
        "Please select a vendor before creating a shipment."
      );
      return;
    }

    setShipmentForm({
      vehicleId: "",
      origin: "",
      destination: "",
      shipmentType: "GENERAL",
      load: "",
    });

    setShowShipmentForm(true);
  }

  // ============================================================
  // CREATE SHIPMENT FROM A CALCULATED ROUTE
  // ============================================================

  function openShipmentFromRoute(route) {
    if (!routeVendorId) {
      setRouteError(
        "Select a vendor before creating a shipment."
      );
      return;
    }

    if (!routeVehicleId) {
      setRouteError(
        "Select a vehicle before creating a shipment."
      );
      return;
    }

    // Switch OMS context to the vendor attached
    // to this route.
    setSelectedVendorId(routeVendorId);

    setShipmentForm({
      vehicleId: routeVehicleId,
      origin: source.trim(),
      destination: destination.trim(),
      shipmentType: "GENERAL",
      load: "",
    });

    setVendorError("");
    setShowShipmentForm(true);
  }

  // ============================================================
  // CREATE SHIPMENT
  // ============================================================

  async function handleCreateShipment(event) {
    event.preventDefault();

    if (!selectedVendorId) {
      setVendorError("Select a vendor first.");
      return;
    }

    if (!shipmentForm.vehicleId) {
      setVendorError("Select a vehicle.");
      return;
    }

    if (
      !shipmentForm.origin.trim() ||
      !shipmentForm.destination.trim()
    ) {
      setVendorError(
        "Origin and destination are required."
      );
      return;
    }

    if (!shipmentForm.load) {
      setVendorError("Enter the shipment load.");
      return;
    }

    try {
      setShipmentLoading(true);
      setVendorError("");

      const response = await fetch(
        `${API_BASE}/vendors/${selectedVendorId}/shipments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            vehicleId: shipmentForm.vehicleId,

            origin: shipmentForm.origin.trim(),

            destination:
              shipmentForm.destination.trim(),

            shipmentType:
              shipmentForm.shipmentType,

            load: Number(shipmentForm.load),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to create shipment"
        );
      }

      setShipmentForm({
        vehicleId: "",
        origin: "",
        destination: "",
        shipmentType: "GENERAL",
        load: "",
      });

      setShowShipmentForm(false);

      await loadVendorShipments(selectedVendorId);
    } catch (error) {
      console.error(error);

      setVendorError(
        error.message || "Failed to create shipment"
      );
    } finally {
      setShipmentLoading(false);
    }
  }

  // ============================================================
  // MAP DATA
  // ============================================================

  const routePolylines = useMemo(() => {
    return routes
      .filter(
        (route) =>
          Array.isArray(route.coordinates) &&
          route.coordinates.length > 1
      )
      .map((route) => ({
        ...route,

        positions: route.coordinates.map(
          ([lng, lat]) => [lat, lng]
        ),
      }));
  }, [routes]);

  const selectedRouteData =
    routes.find(
      (route) =>
        Number(route.routeNumber) ===
        Number(selectedRoute)
    ) || null;

  const mapCenter = useMemo(() => {
    if (selectedRouteData?.coordinates?.length) {
      const [lng, lat] =
        selectedRouteData.coordinates[
          Math.floor(
            selectedRouteData.coordinates.length / 2
          )
        ];

      return [lat, lng];
    }

    return defaultCenter;
  }, [selectedRouteData]);

  const selectedVendor = vendors.find(
    (vendor) =>
      String(getEntityId(vendor)) ===
      String(selectedVendorId)
  );

  const selectedRouteVendor = vendors.find(
    (vendor) =>
      String(getEntityId(vendor)) ===
      String(routeVendorId)
  );

  // ============================================================
  // UI
  // ============================================================

  return (
    <div className="app-shell">
      {/* ======================================================
          SIDEBAR
          ====================================================== */}

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>

          <div>
            <div className="brand-name">SILP</div>

            <div className="brand-subtitle">
              Smart Intelligence Logistics Platform
            </div>
          </div>
        </div>

        <nav className="main-nav">
          <button
            className={`nav-item ${
              activeSection === "routing"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setActiveSection("routing")
            }
          >
            <span className="nav-icon">⌁</span>
            <span>Route Intelligence</span>
          </button>

          <button
            className={`nav-item ${
              activeSection === "vendor"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setActiveSection("vendor")
            }
          >
            <span className="nav-icon">▣</span>
            <span>Vendor OMS</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="system-status">
            <span className="status-dot"></span>

            <div>
              <strong>System online</strong>
              <span>Backend v0.3</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ======================================================
          MAIN CONTENT
          ====================================================== */}

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {activeSection === "routing"
                ? "ROUTE INTELLIGENCE"
                : "VENDOR OPERATIONS"}
            </p>

            <h1>
              {activeSection === "routing"
                ? "Plan a safer journey."
                : "Manage your logistics fleet."}
            </h1>
          </div>

          <div className="topbar-badge">
            <span className="status-dot"></span>
            Live system
          </div>
        </header>

        {/* ====================================================
            ROUTING PAGE
            ==================================================== */}

        {activeSection === "routing" ? (
          <section className="routing-page">
            <div className="route-workspace">
              {/* ================= LEFT ROUTE PANEL ================= */}

              <div className="route-panel">
                <div className="panel-heading">
                  <div>
                    <p className="section-label">
                      NEW ROUTE
                    </p>

                    <h2>
                      Where are you going?
                    </h2>
                  </div>
                </div>

                <form
                  onSubmit={handleFindRoutes}
                  className="route-form"
                >
                  {/* ORIGIN */}

                  <div className="location-input">
                    <span className="location-marker source-marker">
                      A
                    </span>

                    <div className="input-wrapper">
                      <label>Origin</label>

                      <input
                        value={source}
                        onChange={(event) =>
                          setSource(
                            event.target.value
                          )
                        }
                        placeholder="e.g. Guwahati"
                      />
                    </div>
                  </div>

                  <div className="location-connector"></div>

                  {/* DESTINATION */}

                  <div className="location-input">
                    <span className="location-marker destination-marker">
                      B
                    </span>

                    <div className="input-wrapper">
                      <label>Destination</label>

                      <input
                        value={destination}
                        onChange={(event) =>
                          setDestination(
                            event.target.value
                          )
                        }
                        placeholder="e.g. Imphal"
                      />
                    </div>
                  </div>

                  <div className="form-divider"></div>

                  {/* URGENCY */}

                  <div className="form-field">
                    <label>
                      Shipment urgency
                    </label>

                    <select
                      value={urgency}
                      onChange={(event) =>
                        setUrgency(
                          event.target.value
                        )
                      }
                    >
                      <option value="LOW">
                        Low
                      </option>

                      <option value="MEDIUM">
                        Medium
                      </option>

                      <option value="HIGH">
                        High
                      </option>

                      <option value="CRITICAL">
                        Critical
                      </option>
                    </select>
                  </div>

                  {/* ROUTE VENDOR */}

                  <div className="form-field">
                    <label>
                      Vendor fleet
                    </label>

                    <select
                      value={routeVendorId}
                      onChange={(event) =>
                        handleRouteVendorChange(
                          event.target.value
                        )
                      }
                    >
                      <option value="">
                        Select vendor
                      </option>

                      {vendors.map((vendor) => (
                        <option
                          key={getEntityId(
                            vendor
                          )}
                          value={getEntityId(
                            vendor
                          )}
                        >
                          {vendor.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* ROUTE VEHICLE */}

                  <div className="form-field">
                    <label>
                      Vehicle
                    </label>

                    <select
                      value={routeVehicleId}
                      onChange={(event) =>
                        setRouteVehicleId(
                          event.target.value
                        )
                      }
                      disabled={
                        !routeVendorId ||
                        routeVehicleLoading
                      }
                    >
                      <option value="">
                        {!routeVendorId
                          ? "Select vendor first"
                          : routeVehicleLoading
                          ? "Loading vehicles..."
                          : routeVehicles.length ===
                            0
                          ? "No active vehicles"
                          : "Select vehicle"}
                      </option>

                      {routeVehicles.map(
                        (vehicle) => (
                          <option
                            key={getEntityId(
                              vehicle
                            )}
                            value={getEntityId(
                              vehicle
                            )}
                          >
                            {
                              vehicle.registrationNumber
                            }{" "}
                            —{" "}
                            {
                              vehicle.vehicleType
                            }
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  {selectedRouteVendor && (
                    <div className="selected-vendor-mini">
                      <div className="mini-avatar">
                        {selectedRouteVendor.name
                          ?.charAt(0)
                          ?.toUpperCase()}
                      </div>

                      <div>
                        <span>
                          Routing with vendor fleet
                        </span>

                        <strong>
                          {selectedRouteVendor.name}
                        </strong>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={loadingRoutes}
                  >
                    {loadingRoutes ? (
                      <>
                        <span className="spinner"></span>
                        Analysing routes...
                      </>
                    ) : (
                      <>
                        Find safe routes
                        <span>→</span>
                      </>
                    )}
                  </button>
                </form>

                {routeError && (
                  <div className="error-box">
                    {routeError}
                  </div>
                )}

                {/* ROUTE RESULTS */}

                <div className="route-results-header">
                  <div>
                    <p className="section-label">
                      RESULTS
                    </p>

                    <h2>
                      {routes.length
                        ? `${routes.length} routes found`
                        : "Routes will appear here"}
                    </h2>
                  </div>

                  {bestRoute && (
                    <span className="recommended-pill">
                      Recommended · Route{" "}
                      {bestRoute.routeNumber}
                    </span>
                  )}
                </div>

                <div className="route-list">
                  {routes.length === 0 &&
                  !loadingRoutes ? (
                    <div className="empty-routes">
                      <div className="empty-icon">
                        ⌁
                      </div>

                      <strong>
                        Ready to route
                      </strong>

                      <span>
                        Enter an origin and
                        destination to compare
                        environmental safety
                        across available routes.
                      </span>
                    </div>
                  ) : (
                    routes.map((route) => {
                      const isRecommended =
                        Number(
                          route.routeNumber
                        ) ===
                        Number(
                          bestRoute?.routeNumber
                        );

                      const isSelected =
                        Number(
                          route.routeNumber
                        ) ===
                        Number(selectedRoute);

                      const safetyClass =
                        getSafetyClass(
                          route.safetyScore
                        );

                      const color =
                        routeColors[
                          (Number(
                            route.routeNumber
                          ) -
                            1) %
                            routeColors.length
                        ];

                      return (
                        <div
                          key={
                            route.routeNumber
                          }
                          className={`route-card ${
                            isSelected
                              ? "selected"
                              : ""
                          }`}
                          onClick={() =>
                            setSelectedRoute(
                              route.routeNumber
                            )
                          }
                        >
                          <div className="route-card-top">
                            <div className="route-title">
                              <span
                                className="route-number"
                                style={{
                                  borderColor:
                                    color,
                                  color,
                                }}
                              >
                                {
                                  route.routeNumber
                                }
                              </span>

                              <div>
                                <strong>
                                  Route{" "}
                                  {
                                    route.routeNumber
                                  }
                                </strong>

                                {isRecommended && (
                                  <span className="recommended-label">
                                    Recommended
                                  </span>
                                )}
                              </div>
                            </div>

                            <div
                              className={`safety-score ${safetyClass}`}
                            >
                              <span>
                                SAFETY
                              </span>

                              <strong>
                                {route.safetyScore ??
                                  "--"}
                              </strong>
                            </div>
                          </div>

                          <div className="route-metrics">
                            <div>
                              <span>
                                Distance
                              </span>

                              <strong>
                                {route.distanceKm ??
                                  "--"}{" "}
                                km
                              </strong>
                            </div>

                            <div>
                              <span>ETA</span>

                              <strong>
                                {formatDuration(
                                  route.durationMin
                                )}
                              </strong>
                            </div>

                            <div>
                              <span>Risk</span>

                              <strong>
                                {getRiskLabel(
                                  route.hazardRisk
                                )}
                              </strong>
                            </div>
                          </div>

                          <div className="route-hazard">
                            <span className="hazard-dot"></span>

                            {getHazardMessage(
                              route
                            )}
                          </div>

                          {/* CREATE SHIPMENT */}

                          {routeVendorId &&
                            routeVehicleId && (
                              <button
                                type="button"
                                className="route-shipment-button"
                                onClick={(event) => {
                                  event.stopPropagation();

                                  openShipmentFromRoute(
                                    route
                                  );
                                }}
                              >
                                Create shipment
                                <span>→</span>
                              </button>
                            )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* ================= MAP ================= */}

              <div className="map-panel">
                <div className="map-overlay">
                  <div className="map-title">
                    <span className="live-dot"></span>

                    Live route analysis
                  </div>

                  {selectedRouteData && (
                    <div className="map-route-summary">
                      <span>
                        Route{" "}
                        {
                          selectedRouteData.routeNumber
                        }
                      </span>

                      <strong>
                        {
                          selectedRouteData.safetyScore
                        }
                        /100
                      </strong>
                    </div>
                  )}
                </div>

                <MapContainer
                  center={mapCenter}
                  zoom={5}
                  className="map-container"
                  scrollWheelZoom
                >
                  <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />

                  <FitRoutes
                    routes={routePolylines}
                  />

                  {routePolylines.map(
                    (route, index) => {
                      const isSelected =
                        Number(
                          route.routeNumber
                        ) ===
                        Number(selectedRoute);

                      return (
                        <Polyline
                          key={
                            route.routeNumber
                          }
                          positions={
                            route.positions
                          }
                          pathOptions={{
                            color:
                              routeColors[
                                index %
                                  routeColors.length
                              ],
                            weight:
                              isSelected ? 6 : 3,
                            opacity:
                              isSelected
                                ? 0.95
                                : 0.35,
                          }}
                          eventHandlers={{
                            click: () =>
                              setSelectedRoute(
                                route.routeNumber
                              ),
                          }}
                        />
                      );
                    }
                  )}

                  {routePolylines.length > 0 && (
                    <>
                      <Marker
                        position={
                          routePolylines[0]
                            .positions[0]
                        }
                        icon={markerIcon}
                      >
                        <Popup>
                          <strong>
                            Origin
                          </strong>

                          <br />

                          {routeRequest
                            ?.source?.name ||
                            source}
                        </Popup>
                      </Marker>

                      <Marker
                        position={
                          routePolylines[0]
                            .positions[
                            routePolylines[0]
                              .positions
                              .length - 1
                          ]
                        }
                        icon={markerIcon}
                      >
                        <Popup>
                          <strong>
                            Destination
                          </strong>

                          <br />

                          {routeRequest
                            ?.destination
                            ?.name ||
                            destination}
                        </Popup>
                      </Marker>
                    </>
                  )}
                </MapContainer>

                {!routes.length && (
                  <div className="map-empty-state">
                    <div className="map-empty-icon">
                      ⌖
                    </div>

                    <strong>
                      Route map
                    </strong>

                    <span>
                      Your analysed routes will
                      be displayed here.
                    </span>
                  </div>
                )}

                {selectedRouteData && (
                  <div className="map-bottom-card">
                    <div>
                      <span>
                        Selected route
                      </span>

                      <strong>
                        Route{" "}
                        {
                          selectedRouteData.routeNumber
                        }
                      </strong>
                    </div>

                    <div>
                      <span>Distance</span>

                      <strong>
                        {
                          selectedRouteData.distanceKm
                        }{" "}
                        km
                      </strong>
                    </div>

                    <div>
                      <span>ETA</span>

                      <strong>
                        {formatDuration(
                          selectedRouteData.durationMin
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>Safety</span>

                      <strong>
                        {
                          selectedRouteData.safetyScore
                        }
                        /100
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          /* ====================================================
             VENDOR OMS PAGE
             ==================================================== */

          <section className="vendor-page">
            {/* VENDOR TOOLBAR */}

            <div className="vendor-toolbar">
              <div>
                <p className="section-label">
                  VENDOR OMS
                </p>

                <h2>
                  Fleet & shipment operations
                </h2>
              </div>

              <div className="vendor-toolbar-actions">
                {/* ACTIVE VENDOR DROPDOWN REMOVED */}

                <button
                  className="primary-button compact"
                  onClick={() =>
                    setShowVendorForm(true)
                  }
                >
                  + Add vendor
                </button>
              </div>
            </div>

            {/* ERROR */}

            {vendorError && (
              <div className="error-box vendor-error">
                {vendorError}
              </div>
            )}

            <div className="vendor-grid">
              {/* =================================================
                  VENDOR LIST
                  ================================================= */}

              <div className="vendor-selector-card">
                <div className="card-header">
                  <div>
                    <span className="section-label">
                      VENDORS
                    </span>

                    <h3>
                      Your businesses
                    </h3>
                  </div>

                  <span className="count-badge">
                    {vendors.length}
                  </span>
                </div>

                {vendorLoading &&
                vendors.length === 0 ? (
                  <div className="loading-state">
                    Loading vendors...
                  </div>
                ) : vendors.length === 0 ? (
                  <div className="empty-card">
                    <strong>
                      No vendors yet
                    </strong>

                    <span>
                      Create your first vendor
                      account to start managing
                      a fleet.
                    </span>

                    <button
                      className="secondary-button"
                      onClick={() =>
                        setShowVendorForm(
                          true
                        )
                      }
                    >
                      Create vendor
                    </button>
                  </div>
                ) : (
                  <div className="vendor-list">
                    {vendors.map((vendor) => {
                      const vendorId =
                        getEntityId(vendor);

                      const isActive =
                        String(vendorId) ===
                        String(
                          selectedVendorId
                        );

                      return (
                        <button
                          key={vendorId}
                          className={`vendor-item ${
                            isActive
                              ? "active"
                              : ""
                          }`}
                          onClick={() =>
                            handleVendorChange(
                              vendorId
                            )
                          }
                        >
                          <div className="vendor-avatar">
                            {vendor.name
                              ?.charAt(0)
                              ?.toUpperCase()}
                          </div>

                          <div className="vendor-info">
                            <strong>
                              {vendor.name}
                            </strong>

                            <span>
                              {vendor.email}
                            </span>
                          </div>

                          <span className="vendor-arrow">
                            →
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* =================================================
                  ACTIVE VENDOR
                  ================================================= */}

              <div className="vendor-main">
                {selectedVendor ? (
                  <>
                    {/* VENDOR PROFILE */}

                    <div className="vendor-profile-card">
                      <div className="vendor-profile-main">
                        <div className="large-avatar">
                          {selectedVendor.name
                            ?.charAt(0)
                            ?.toUpperCase()}
                        </div>

                        <div>
                          <span className="section-label">
                            ACTIVE VENDOR
                          </span>

                          <h2>
                            {selectedVendor.name}
                          </h2>

                          <p>
                            {
                              selectedVendor.email
                            }
                          </p>
                        </div>
                      </div>

                      <div className="vendor-stats">
                        <div>
                          <span>Fleet</span>

                          <strong>
                            {vehicles.length}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Shipments
                          </span>

                          <strong>
                            {shipments.length}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Green score
                          </span>

                          <strong>
                            {selectedVendor.greenScore ??
                              "--"}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* =================================================
                        FLEET
                        ================================================= */}

                    <div className="oms-section">
                      <div className="card-header">
                        <div>
                          <span className="section-label">
                            FLEET
                          </span>

                          <h3>
                            Vehicles
                          </h3>
                        </div>

                        <button
                          className="secondary-button"
                          onClick={
                            openVehicleForm
                          }
                        >
                          + Vehicle
                        </button>
                      </div>

                      {vehicleLoading ? (
                        <div className="loading-state">
                          Loading fleet...
                        </div>
                      ) : vehicles.length ===
                        0 ? (
                        <div className="empty-card horizontal">
                          <div>
                            <strong>
                              No vehicles
                              registered
                            </strong>

                            <span>
                              Add a vehicle to
                              associate it with
                              this vendor.
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="vehicle-grid">
                          {vehicles.map(
                            (vehicle) => (
                              <div
                                className="vehicle-card"
                                key={getEntityId(
                                  vehicle
                                )}
                              >
                                <div className="vehicle-icon">
                                  ▰
                                </div>

                                <div className="vehicle-content">
                                  <strong>
                                    {
                                      vehicle.registrationNumber
                                    }
                                  </strong>

                                  <span>
                                    {
                                      vehicle.vehicleType
                                    }
                                  </span>

                                  <div className="vehicle-details">
                                    <span>
                                      Capacity{" "}
                                      <b>
                                        {
                                          vehicle.capacity
                                        }
                                      </b>
                                    </span>

                                    <span>
                                      Fuel{" "}
                                      <b>
                                        {
                                          vehicle.fuelType
                                        }
                                      </b>
                                    </span>
                                  </div>
                                </div>

                                <span
                                  className={`vehicle-status ${
                                    vehicle.status ===
                                    "ACTIVE"
                                      ? "active"
                                      : ""
                                  }`}
                                >
                                  {vehicle.status ||
                                    "ACTIVE"}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>

                    {/* =================================================
                        SHIPMENTS
                        ================================================= */}

                    <div className="oms-section">
                      <div className="card-header">
                        <div>
                          <span className="section-label">
                            SHIPMENTS
                          </span>

                          <h3>
                            Recent shipments
                          </h3>
                        </div>

                        <button
                          className="secondary-button"
                          onClick={
                            openShipmentForm
                          }
                        >
                          + Shipment
                        </button>
                      </div>

                      {shipmentLoading ? (
                        <div className="loading-state">
                          Loading shipments...
                        </div>
                      ) : shipments.length ===
                        0 ? (
                        <div className="empty-card">
                          <strong>
                            No shipments recorded
                          </strong>

                          <span>
                            Create a shipment and
                            assign it to one of
                            your active vehicles.
                          </span>
                        </div>
                      ) : (
                        <div className="shipment-table-wrapper">
                          <table className="shipment-table">
                            <thead>
                              <tr>
                                <th>
                                  Shipment
                                </th>

                                <th>
                                  Route
                                </th>

                                <th>
                                  Type
                                </th>

                                <th>
                                  Load
                                </th>

                                <th>
                                  Status
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {shipments.map(
                                (shipment) => (
                                  <tr
                                    key={getEntityId(
                                      shipment
                                    )}
                                  >
                                    <td>
                                      <strong>
                                        {
                                          shipment.id
                                        }
                                      </strong>
                                    </td>

                                    <td>
                                      <div className="shipment-route">
                                        <span>
                                          {
                                            shipment.origin
                                          }
                                        </span>

                                        <span>
                                          →
                                        </span>

                                        <span>
                                          {
                                            shipment.destination
                                          }
                                        </span>
                                      </div>
                                    </td>

                                    <td>
                                      {
                                        shipment.shipmentType
                                      }
                                    </td>

                                    <td>
                                      {
                                        shipment.load
                                      }
                                    </td>

                                    <td>
                                      <span className="table-status">
                                        {shipment.status ||
                                          "CREATED"}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="vendor-empty-main">
                    <div className="empty-icon">
                      ▣
                    </div>

                    <h2>
                      Select a vendor
                    </h2>

                    <p>
                      Select a vendor from the
                      left to manage its fleet
                      and shipments.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ==========================================================
          CREATE VENDOR MODAL
          ========================================================== */}

      {showVendorForm && (
        <div
          className="modal-backdrop"
          onClick={() =>
            setShowVendorForm(false)
          }
        >
          <div
            className="modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <span className="section-label">
                  VENDOR OMS
                </span>

                <h2>
                  Create vendor
                </h2>
              </div>

              <button
                className="close-button"
                onClick={() =>
                  setShowVendorForm(false)
                }
              >
                ×
              </button>
            </div>

            <form
              className="modal-form"
              onSubmit={handleCreateVendor}
            >
              <div className="form-field">
                <label>
                  Business name
                </label>

                <input
                  required
                  value={vendorForm.name}
                  onChange={(event) =>
                    setVendorForm({
                      ...vendorForm,
                      name: event.target.value,
                    })
                  }
                  placeholder="North East Logistics"
                />
              </div>

              <div className="form-field">
                <label>Email</label>

                <input
                  required
                  type="email"
                  value={vendorForm.email}
                  onChange={(event) =>
                    setVendorForm({
                      ...vendorForm,
                      email:
                        event.target.value,
                    })
                  }
                  placeholder="vendor@example.com"
                />
              </div>

              <div className="form-field">
                <label>Phone</label>

                <input
                  value={vendorForm.phone}
                  onChange={(event) =>
                    setVendorForm({
                      ...vendorForm,
                      phone:
                        event.target.value,
                    })
                  }
                  placeholder="+91..."
                />
              </div>

              <div className="form-field">
                <label>Address</label>

                <textarea
                  value={vendorForm.address}
                  onChange={(event) =>
                    setVendorForm({
                      ...vendorForm,
                      address:
                        event.target.value,
                    })
                  }
                  placeholder="Business address"
                  rows="3"
                />
              </div>

              <button
                className="primary-button"
                type="submit"
                disabled={vendorLoading}
              >
                {vendorLoading
                  ? "Creating..."
                  : "Create vendor"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================================
          CREATE VEHICLE MODAL
          ========================================================== */}

      {showVehicleForm && (
        <div
          className="modal-backdrop"
          onClick={() =>
            setShowVehicleForm(false)
          }
        >
          <div
            className="modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <span className="section-label">
                  FLEET OMS
                </span>

                <h2>
                  Add vehicle
                </h2>
              </div>

              <button
                className="close-button"
                onClick={() =>
                  setShowVehicleForm(false)
                }
              >
                ×
              </button>
            </div>

            <form
              className="modal-form"
              onSubmit={handleCreateVehicle}
            >
              {/* VENDOR SELECTOR */}

              <div className="form-field">
                <label>
                  Vendor
                </label>

                <select
                  required
                  value={selectedVendorId}
                  onChange={(event) =>
                    handleVendorChange(
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    Select vendor
                  </option>

                  {vendors.map((vendor) => (
                    <option
                      key={getEntityId(
                        vendor
                      )}
                      value={getEntityId(
                        vendor
                      )}
                    >
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedVendor && (
                <div className="selected-vendor-mini">
                  <div className="mini-avatar">
                    {selectedVendor.name
                      ?.charAt(0)
                      ?.toUpperCase()}
                  </div>

                  <div>
                    <span>
                      Adding vehicle to
                    </span>

                    <strong>
                      {selectedVendor.name}
                    </strong>
                  </div>
                </div>
              )}

              {/* REGISTRATION */}

              <div className="form-field">
                <label>
                  Registration number
                </label>

                <input
                  required
                  value={
                    vehicleForm.registrationNumber
                  }
                  onChange={(event) =>
                    setVehicleForm({
                      ...vehicleForm,
                      registrationNumber:
                        event.target.value.toUpperCase(),
                    })
                  }
                  placeholder="MH 04 AB 1234"
                />
              </div>

              {/* TYPE + FUEL */}

              <div className="form-row">
                <div className="form-field">
                  <label>
                    Vehicle type
                  </label>

                  <select
                    value={
                      vehicleForm.vehicleType
                    }
                    onChange={(event) =>
                      setVehicleForm({
                        ...vehicleForm,
                        vehicleType:
                          event.target.value,
                      })
                    }
                  >
                    <option value="TRUCK">
                      Truck
                    </option>

                    <option value="MINI_TRUCK">
                      Mini Truck
                    </option>

                    <option value="VAN">
                      Van
                    </option>

                    <option value="PICKUP">
                      Pickup
                    </option>
                  </select>
                </div>

                <div className="form-field">
                  <label>
                    Fuel type
                  </label>

                  <select
                    value={
                      vehicleForm.fuelType
                    }
                    onChange={(event) =>
                      setVehicleForm({
                        ...vehicleForm,
                        fuelType:
                          event.target.value,
                      })
                    }
                  >
                    <option value="DIESEL">
                      Diesel
                    </option>

                    <option value="PETROL">
                      Petrol
                    </option>

                    <option value="CNG">
                      CNG
                    </option>

                    <option value="EV">
                      Electric
                    </option>

                    <option value="HYBRID">
                      Hybrid
                    </option>
                  </select>
                </div>
              </div>

              {/* CAPACITY */}

              <div className="form-field">
                <label>
                  Capacity
                </label>

                <input
                  required
                  type="number"
                  min="0"
                  value={vehicleForm.capacity}
                  onChange={(event) =>
                    setVehicleForm({
                      ...vehicleForm,
                      capacity:
                        event.target.value,
                    })
                  }
                  placeholder="Capacity"
                />
              </div>

              <button
                className="primary-button"
                type="submit"
                disabled={
                  vehicleLoading ||
                  !selectedVendorId
                }
              >
                {vehicleLoading
                  ? "Adding..."
                  : "Add vehicle"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================================
          CREATE SHIPMENT MODAL
          ========================================================== */}

      {showShipmentForm && (
        <div
          className="modal-backdrop"
          onClick={() =>
            setShowShipmentForm(false)
          }
        >
          <div
            className="modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <span className="section-label">
                  SHIPMENT OMS
                </span>

                <h2>
                  Create shipment
                </h2>
              </div>

              <button
                className="close-button"
                onClick={() =>
                  setShowShipmentForm(false)
                }
              >
                ×
              </button>
            </div>

            <form
              className="modal-form"
              onSubmit={handleCreateShipment}
            >
              {/* VENDOR */}

              <div className="form-field">
                <label>
                  Vendor
                </label>

                <select
                  required
                  value={selectedVendorId}
                  onChange={(event) =>
                    handleVendorChange(
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    Select vendor
                  </option>

                  {vendors.map((vendor) => (
                    <option
                      key={getEntityId(
                        vendor
                      )}
                      value={getEntityId(
                        vendor
                      )}
                    >
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* VEHICLE */}

              <div className="form-field">
                <label>
                  Vehicle
                </label>

                <select
                  required
                  value={
                    shipmentForm.vehicleId
                  }
                  onChange={(event) =>
                    setShipmentForm({
                      ...shipmentForm,
                      vehicleId:
                        event.target.value,
                    })
                  }
                  disabled={
                    !selectedVendorId ||
                    vehicles.length === 0
                  }
                >
                  <option value="">
                    {!selectedVendorId
                      ? "Select vendor first"
                      : vehicles.length === 0
                      ? "No vehicles available"
                      : "Select vehicle"}
                  </option>

                  {vehicles
                    .filter(
                      (vehicle) =>
                        vehicle.status ===
                          "ACTIVE" ||
                        !vehicle.status
                    )
                    .map((vehicle) => (
                      <option
                        key={getEntityId(
                          vehicle
                        )}
                        value={getEntityId(
                          vehicle
                        )}
                      >
                        {
                          vehicle.registrationNumber
                        }{" "}
                        —{" "}
                        {
                          vehicle.vehicleType
                        }
                      </option>
                    ))}
                </select>
              </div>

              {/* ORIGIN + DESTINATION */}

              <div className="form-row">
                <div className="form-field">
                  <label>
                    Origin
                  </label>

                  <input
                    required
                    value={
                      shipmentForm.origin
                    }
                    onChange={(event) =>
                      setShipmentForm({
                        ...shipmentForm,
                        origin:
                          event.target.value,
                      })
                    }
                    placeholder="Origin"
                  />
                </div>

                <div className="form-field">
                  <label>
                    Destination
                  </label>

                  <input
                    required
                    value={
                      shipmentForm.destination
                    }
                    onChange={(event) =>
                      setShipmentForm({
                        ...shipmentForm,
                        destination:
                          event.target.value,
                      })
                    }
                    placeholder="Destination"
                  />
                </div>
              </div>

              {/* TYPE + LOAD */}

              <div className="form-row">
                <div className="form-field">
                  <label>
                    Shipment type
                  </label>

                  <select
                    value={
                      shipmentForm.shipmentType
                    }
                    onChange={(event) =>
                      setShipmentForm({
                        ...shipmentForm,
                        shipmentType:
                          event.target.value,
                      })
                    }
                  >
                    <option value="GENERAL">
                      General
                    </option>

                    <option value="MEDICINES">
                      Medicines
                    </option>

                    <option value="PERISHABLE">
                      Perishable
                    </option>

                    <option value="HEAVY">
                      Heavy goods
                    </option>

                    <option value="FRAGILE">
                      Fragile
                    </option>
                  </select>
                </div>

                <div className="form-field">
                  <label>
                    Load
                  </label>

                  <input
                    required
                    type="number"
                    min="0"
                    value={
                      shipmentForm.load
                    }
                    onChange={(event) =>
                      setShipmentForm({
                        ...shipmentForm,
                        load:
                          event.target.value,
                      })
                    }
                    placeholder="Load"
                  />
                </div>
              </div>

              <button
                className="primary-button"
                type="submit"
                disabled={
                  shipmentLoading ||
                  !selectedVendorId ||
                  !shipmentForm.vehicleId
                }
              >
                {shipmentLoading
                  ? "Creating..."
                  : "Create shipment"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;