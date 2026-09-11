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
});

/* ============================================================
   MAP HELPERS
   ============================================================ */

function FitRoutes({ routes }) {
  const map = useMap();

  useEffect(() => {
    if (!routes?.length) return;

    const points = routes.flatMap((route) =>
      (route.coordinates || [])
        .filter(
          (point) =>
            Array.isArray(point) &&
            point.length >= 2 &&
            Number.isFinite(Number(point[0])) &&
            Number.isFinite(Number(point[1]))
        )
        .map(([lng, lat]) => [
          Number(lat),
          Number(lng),
        ])
    );

    if (points.length > 1) {
      map.fitBounds(points, {
        padding: [45, 45],
        maxZoom: 12,
      });
    }
  }, [routes, map]);

  return null;
}

/* ============================================================
   GENERAL HELPERS
   ============================================================ */

function formatDuration(minutes) {
  if (
    minutes === undefined ||
    minutes === null ||
    Number.isNaN(Number(minutes))
  ) {
    return "--";
  }

  const total = Math.max(
    0,
    Math.round(Number(minutes))
  );

  const hours = Math.floor(total / 60);
  const mins = total % 60;

  if (hours === 0) {
    return `${mins} min`;
  }

  if (mins === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${mins} min`;
}

function getSafetyScore(route) {
  const value = Number(route?.safetyScore);

  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(100, value)
  );
}

function getSafetyClass(score) {
  const value = Number(score ?? 0);

  if (value >= 80) return "safe";
  if (value >= 60) return "moderate";

  return "danger";
}

function getRiskLabel(risk) {
  if (!risk) {
    return "Low risk";
  }

  const value = String(risk).toLowerCase();

  if (
    value.includes("critical") ||
    value.includes("severe")
  ) {
    return "Critical";
  }

  if (value.includes("high")) {
    return "High risk";
  }

  if (
    value.includes("moderate") ||
    value.includes("medium")
  ) {
    return "Moderate";
  }

  if (
    value.includes("low") ||
    value.includes("minimal")
  ) {
    return "Low risk";
  }

  return String(risk);
}

function getHazardMessage(route) {
  const hazards =
    route?.hazardDetails || {};

  if (hazards.rainfall) {
    return String(hazards.rainfall);
  }

  if (hazards.floodRisk) {
    return `Flood risk: ${hazards.floodRisk}`;
  }

  if (hazards.landslideRisk) {
    return `Landslide risk: ${hazards.landslideRisk}`;
  }

  if (hazards.stormRisk) {
    return `Storm risk: ${hazards.stormRisk}`;
  }

  if (hazards.disasterRisk) {
    return `Disaster risk: ${hazards.disasterRisk}`;
  }

  return "No major weather or disaster hazard detected.";
}

function getEntityId(entity) {
  return (
    entity?.id ||
    entity?.vendorId ||
    entity?.vehicleId ||
    entity?._id
  );
}

function getRouteKey(route, index) {
  return (
    route?.routeNumber ??
    route?.routeId ??
    route?.id ??
    index
  );
}

function isSameRoute(routeA, routeB) {
  if (!routeA || !routeB) {
    return false;
  }

  if (
    routeA.routeNumber != null &&
    routeB.routeNumber != null
  ) {
    return (
      String(routeA.routeNumber) ===
      String(routeB.routeNumber)
    );
  }

  if (routeA.id && routeB.id) {
    return routeA.id === routeB.id;
  }

  if (routeA.routeId && routeB.routeId) {
    return (
      routeA.routeId === routeB.routeId
    );
  }

  return routeA === routeB;
}

function getValidCoordinates(route) {
  return (route?.coordinates || []).filter(
    (point) =>
      Array.isArray(point) &&
      point.length >= 2 &&
      Number.isFinite(Number(point[0])) &&
      Number.isFinite(Number(point[1]))
  );
}

/* ============================================================
   APP
   ============================================================ */

function App() {
  const [activeSection, setActiveSection] =
    useState("routing");

  /* ==========================================================
     ROUTING STATE
     ========================================================== */

  const [source, setSource] = useState("");
  const [destination, setDestination] =
    useState("");

  const [urgency, setUrgency] =
    useState("MEDIUM");

  const [routes, setRoutes] = useState([]);
  const [bestRoute, setBestRoute] =
    useState(null);
  const [selectedRoute, setSelectedRoute] =
    useState(null);

  const [routeRequest, setRouteRequest] =
    useState(null);

  const [loadingRoutes, setLoadingRoutes] =
    useState(false);

  const [routeError, setRouteError] =
    useState("");

  /* ==========================================================
     ROUTE VENDOR / VEHICLE
     ========================================================== */

  const [routeVendorId, setRouteVendorId] =
    useState("");

  const [routeVehicles, setRouteVehicles] =
    useState([]);

  const [routeVehicleId, setRouteVehicleId] =
    useState("");

  const [routeVehicleLoading, setRouteVehicleLoading] =
    useState(false);

  /* ==========================================================
     VENDOR OMS
     ========================================================== */

  const [vendors, setVendors] = useState([]);

  const [selectedVendorId, setSelectedVendorId] =
    useState("");

  const [vendorLoading, setVendorLoading] =
    useState(false);

  const [vendorError, setVendorError] =
    useState("");

  const [showVendorForm, setShowVendorForm] =
    useState(false);

  const [vendorForm, setVendorForm] =
    useState({
      name: "",
      email: "",
    });

  /* ==========================================================
     FLEET
     ========================================================== */

  const [vehicles, setVehicles] = useState([]);

  const [vehicleLoading, setVehicleLoading] =
    useState(false);

  const [showVehicleForm, setShowVehicleForm] =
    useState(false);

  const [vehicleForm, setVehicleForm] =
    useState({
      registrationNumber: "",
      vehicleType: "Truck",
      capacity: "",
      fuelType: "Diesel",
    });

  /* ==========================================================
     SHIPMENTS
     ========================================================== */

  const [shipments, setShipments] =
    useState([]);

  const [shipmentLoading, setShipmentLoading] =
    useState(false);

  const [showShipmentForm, setShowShipmentForm] =
    useState(false);

  const [shipmentForm, setShipmentForm] =
    useState({
      vehicleId: "",
      origin: "",
      destination: "",
      shipmentType: "General",
      load: "",
    });

  /*
   * IMPORTANT:
   *
   * Do not use selectedVendorId as the shipment modal's
   * source of truth.
   *
   * selectedVendorId belongs to the Vendor OMS screen.
   * A route-created shipment can be opened while the
   * Vendor OMS is showing a different vendor.
   *
   * shipmentVendorId therefore stores the vendor that
   * actually owns the shipment being created.
   */

  const [shipmentVendorId, setShipmentVendorId] =
    useState("");

  /*
   * Dedicated vehicle list for the shipment modal.
   *
   * This prevents the modal from accidentally using a
   * stale `vehicles` array belonging to another vendor.
   */

  const [shipmentVehicles, setShipmentVehicles] =
    useState([]);

  const [shipmentVehicleLoading, setShipmentVehicleLoading] =
    useState(false);

  const [shipmentError, setShipmentError] =
    useState("");

  const [shipmentSubmitting, setShipmentSubmitting] =
    useState(false);

  /* ==========================================================
     INITIAL DATA
     ========================================================== */

  useEffect(() => {
    loadVendors();
  }, []);

  useEffect(() => {
    if (!selectedVendorId) {
      setVehicles([]);
      setShipments([]);
      return;
    }

    loadVendorVehicles(selectedVendorId);
    loadVendorShipments(selectedVendorId);
  }, [selectedVendorId]);

  useEffect(() => {
    if (!routeVendorId) {
      setRouteVehicles([]);
      setRouteVehicleId("");
      return;
    }

    loadRouteVehicles(routeVendorId);
  }, [routeVendorId]);

  /* ==========================================================
     VENDOR API
     ========================================================== */

  async function loadVendors() {
    setVendorLoading(true);
    setVendorError("");

    try {
      const response = await fetch(
        `${API_BASE}/vendors`
      );

      if (!response.ok) {
        throw new Error(
          "Unable to load vendors."
        );
      }

      const data = await response.json();

      const list = Array.isArray(data)
        ? data
        : data.vendors || [];

      setVendors(list);

      if (
        list.length &&
        !selectedVendorId
      ) {
        setSelectedVendorId(
          String(getEntityId(list[0]))
        );
      }
    } catch (error) {
      setVendorError(error.message);
    } finally {
      setVendorLoading(false);
    }
  }

  async function loadVendorVehicles(vendorId) {
    if (!vendorId) {
      setVehicles([]);
      return [];
    }

    setVehicleLoading(true);

    try {
      const response = await fetch(
        `${API_BASE}/vendors/${vendorId}/vehicles`
      );

      if (!response.ok) {
        throw new Error(
          "Unable to load vehicles."
        );
      }

      const data = await response.json();

      const list = Array.isArray(data)
        ? data
        : data.vehicles || [];

      setVehicles(list);

      return list;
    } catch {
      setVehicles([]);
      return [];
    } finally {
      setVehicleLoading(false);
    }
  }

  async function loadVendorShipments(
    vendorId
  ) {
    if (!vendorId) {
      setShipments([]);
      return [];
    }

    setShipmentLoading(true);

    try {
      const response = await fetch(
        `${API_BASE}/vendors/${vendorId}/shipments`
      );

      if (!response.ok) {
        throw new Error(
          "Unable to load shipments."
        );
      }

      const data = await response.json();

      const list = Array.isArray(data)
        ? data
        : data.shipments || [];

      setShipments(list);

      return list;
    } catch {
      setShipments([]);
      return [];
    } finally {
      setShipmentLoading(false);
    }
  }

  async function loadRouteVehicles(
    vendorId
  ) {
    if (!vendorId) {
      setRouteVehicles([]);
      setRouteVehicleId("");
      return [];
    }

    setRouteVehicleLoading(true);

    try {
      const response = await fetch(
        `${API_BASE}/vendors/${vendorId}/vehicles`
      );

      if (!response.ok) {
        throw new Error(
          "Unable to load vehicles."
        );
      }

      const data = await response.json();

      const list = Array.isArray(data)
        ? data
        : data.vehicles || [];

      setRouteVehicles(list);

      if (list.length) {
        setRouteVehicleId((current) => {
          if (
            current &&
            list.some(
              (vehicle) =>
                String(
                  getEntityId(vehicle)
                ) === String(current)
            )
          ) {
            return current;
          }

          return String(
            getEntityId(list[0])
          );
        });
      } else {
        setRouteVehicleId("");
      }

      return list;
    } catch {
      setRouteVehicles([]);
      setRouteVehicleId("");
      return [];
    } finally {
      setRouteVehicleLoading(false);
    }
  }

  /*
   * Load vehicles specifically for the shipment modal.
   *
   * This is intentionally separate from `vehicles` because
   * the Vendor OMS may currently be displaying another vendor.
   */

  async function loadShipmentVehicles(
    vendorId
  ) {
    if (!vendorId) {
      setShipmentVehicles([]);
      return [];
    }

    setShipmentVehicleLoading(true);

    try {
      const response = await fetch(
        `${API_BASE}/vendors/${vendorId}/vehicles`
      );

      if (!response.ok) {
        throw new Error(
          "Unable to load vehicles for shipment."
        );
      }

      const data = await response.json();

      const list = Array.isArray(data)
        ? data
        : data.vehicles || [];

      setShipmentVehicles(list);

      return list;
    } catch (error) {
      setShipmentVehicles([]);
      setShipmentError(
        error.message ||
          "Unable to load vehicles for shipment."
      );

      return [];
    } finally {
      setShipmentVehicleLoading(false);
    }
  }

  /* ==========================================================
     ROUTE SEARCH
     ========================================================== */

  async function handleFindRoutes(event) {
    event.preventDefault();

    if (
      !source.trim() ||
      !destination.trim()
    ) {
      setRouteError(
        "Please enter both origin and destination."
      );
      return;
    }

    setLoadingRoutes(true);
    setRouteError("");

    const selectedRouteVehicle =
      routeVehicles.find(
        (vehicle) =>
          String(
            getEntityId(vehicle)
          ) === String(routeVehicleId)
      );

    const requestBody = {
      source: source.trim(),
      destination: destination.trim(),
      urgency,

      vehicle:
        selectedRouteVehicle || null,

      shipment:
        routeVendorId && routeVehicleId
          ? {
              vehicleId: routeVehicleId,
              origin: source.trim(),
              destination:
                destination.trim(),
              vendorId: routeVendorId,
            }
          : null,
    };

    try {
      const response = await fetch(
        `${API_BASE}/find-route`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            requestBody
          ),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Unable to calculate routes."
        );
      }

      const routeList = Array.isArray(
        data.routes
      )
        ? data.routes
        : [];

      if (!routeList.length) {
        throw new Error(
          "The routing engine did not return any routes."
        );
      }

      const recommendedSummary =
        data.bestRoute || null;

      const recommendedFullRoute =
        routeList.find(
          (route) =>
            recommendedSummary &&
            route.routeNumber != null &&
            String(route.routeNumber) ===
              String(
                recommendedSummary.routeNumber
              )
        ) ||
        routeList[0] ||
        null;

      setRoutes(routeList);
      setBestRoute(
        recommendedFullRoute
      );
      setSelectedRoute(
        recommendedFullRoute
      );
      setRouteRequest(requestBody);
    } catch (error) {
      setRouteError(
        error.message ||
          "Unable to calculate routes."
      );
    } finally {
      setLoadingRoutes(false);
    }
  }

  function handleNewSearch() {
    setRoutes([]);
    setBestRoute(null);
    setSelectedRoute(null);
    setRouteError("");
    setRouteRequest(null);
  }

  /* ==========================================================
     VENDOR CREATION
     ========================================================== */

  async function handleCreateVendor(
    event
  ) {
    event.preventDefault();

    try {
      const response = await fetch(
        `${API_BASE}/vendors`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            vendorForm
          ),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Unable to create vendor."
        );
      }

      setShowVendorForm(false);

      setVendorForm({
        name: "",
        email: "",
      });

      await loadVendors();

      const id = getEntityId(
        data.vendor || data
      );

      if (id) {
        setSelectedVendorId(
          String(id)
        );
      }
    } catch (error) {
      setVendorError(error.message);
    }
  }

  /* ==========================================================
     VEHICLE CREATION
     ========================================================== */

  async function handleAddVehicle(
    event
  ) {
    event.preventDefault();

    if (!selectedVendorId) {
      setVendorError(
        "Select a vendor before adding a vehicle."
      );
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/vendors/${selectedVendorId}/vehicles`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            registrationNumber:
              vehicleForm.registrationNumber,

            vehicleType:
              vehicleForm.vehicleType,

            capacity:
              vehicleForm.capacity,

            fuelType:
              vehicleForm.fuelType,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Unable to add vehicle."
        );
      }

      setShowVehicleForm(false);

      setVehicleForm({
        registrationNumber: "",
        vehicleType: "Truck",
        capacity: "",
        fuelType: "Diesel",
      });

      await loadVendorVehicles(
        selectedVendorId
      );

      /*
       * If this vendor is also currently selected
       * in the route planner, refresh its route vehicles.
       */
      if (
        String(routeVendorId) ===
        String(selectedVendorId)
      ) {
        await loadRouteVehicles(
          selectedVendorId
        );
      }

      /*
       * If a shipment modal belongs to this vendor,
       * refresh its vehicle list too.
       */
      if (
        String(shipmentVendorId) ===
        String(selectedVendorId)
      ) {
        await loadShipmentVehicles(
          selectedVendorId
        );
      }
    } catch (error) {
      setVendorError(error.message);
    }
  }

  /* ==========================================================
     SHIPMENT CREATION
     ========================================================== */

  async function handleCreateShipment(
    event
  ) {
    event.preventDefault();

    setShipmentError("");

    /*
     * IMPORTANT:
     *
     * Use shipmentVendorId first.
     *
     * This prevents a route-created shipment from accidentally
     * being submitted to whatever vendor happens to be selected
     * in Vendor OMS.
     */
    const vendorId =
      shipmentVendorId ||
      selectedVendorId;

    if (!vendorId) {
      setShipmentError(
        "Select a vendor before creating a shipment."
      );
      return;
    }

    if (!shipmentForm.vehicleId) {
      setShipmentError(
        "Select a vehicle before creating a shipment."
      );
      return;
    }

    /*
     * Make sure the selected vehicle actually belongs to
     * the vendor whose shipment is being created.
     */
    const vehicleBelongsToVendor =
      shipmentVehicles.some(
        (vehicle) =>
          String(
            getEntityId(vehicle)
          ) ===
          String(shipmentForm.vehicleId)
      );

    if (!vehicleBelongsToVendor) {
      setShipmentError(
        "The selected vehicle does not belong to this vendor. Please select a vehicle from this vendor's fleet."
      );
      return;
    }

    setShipmentSubmitting(true);

    try {
      const response = await fetch(
        `${API_BASE}/vendors/${vendorId}/shipments`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            ...shipmentForm,

            /*
             * Normalize the vehicle ID to the exact
             * value selected from this vendor's fleet.
             */
            vehicleId:
              String(
                shipmentForm.vehicleId
              ),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Unable to create shipment."
        );
      }

      /*
       * Close and reset the modal only after the backend
       * confirms successful creation.
       */
      setShowShipmentForm(false);

      setShipmentForm({
        vehicleId: "",
        origin: "",
        destination: "",
        shipmentType: "General",
        load: "",
      });

      setShipmentError("");

      /*
       * Make this vendor the active Vendor OMS vendor.
       */
      setSelectedVendorId(
        String(vendorId)
      );

      /*
       * Refresh both fleet and shipment data for the
       * exact vendor that owns the shipment.
       */
      await Promise.all([
        loadVendorVehicles(
          String(vendorId)
        ),
        loadVendorShipments(
          String(vendorId)
        ),
      ]);

      /*
       * If the route planner was also using this vendor,
       * keep its vehicle list synchronized.
       */
      if (
        String(routeVendorId) ===
        String(vendorId)
      ) {
        await loadRouteVehicles(
          String(vendorId)
        );
      }

      /*
       * Move to Vendor OMS so the user immediately sees
       * the newly-created shipment.
       */
      setActiveSection("vendor");

      /*
       * The shipment context has completed.
       */
      setShipmentVendorId("");
      setShipmentVehicles([]);
    } catch (error) {
      setShipmentError(
        error.message ||
          "Unable to create shipment."
      );
    } finally {
      setShipmentSubmitting(false);
    }
  }

  /*
   * Opens shipment creation from a route.
   *
   * The important change is that the vendor and vehicle are
   * explicitly captured into shipment-specific state before
   * the modal is opened.
   */
  async function openShipmentFromRoute(
    route
  ) {
    if (
      !routeVendorId ||
      !routeVehicleId
    ) {
      setRouteError(
        "Select a vendor and vehicle before creating a shipment."
      );
      return;
    }

    const vendorId =
      String(routeVendorId);

    const vehicleId =
      String(routeVehicleId);

    setShipmentError("");

    /*
     * First load the actual fleet belonging to this vendor.
     */
    const vendorVehicles =
      await loadShipmentVehicles(
        vendorId
      );

    /*
     * Confirm that the route vehicle is actually
     * part of this vendor's current fleet.
     */
    const routeVehicle =
      vendorVehicles.find(
        (vehicle) =>
          String(
            getEntityId(vehicle)
          ) === vehicleId
      );

    if (!routeVehicle) {
      setRouteError(
        "The selected route vehicle could not be found in this vendor's current fleet. Please refresh the vehicle selection."
      );
      return;
    }

    /*
     * Store the vendor independently from selectedVendorId.
     */
    setShipmentVendorId(
      vendorId
    );

    /*
     * Keep Vendor OMS selection synchronized as well.
     */
    setSelectedVendorId(
      vendorId
    );

    /*
     * Use the exact validated vehicle ID.
     */
    setShipmentForm({
      vehicleId:
        String(
          getEntityId(routeVehicle)
        ),
      origin:
        source.trim(),
      destination:
        destination.trim(),
      shipmentType: "General",
      load: "",
    });

    setShowShipmentForm(true);
  }

  /*
   * Opens the normal Vendor OMS shipment modal.
   *
   * This is intentionally separate from the route flow.
   */
  async function openShipmentFromVendor() {
    if (!selectedVendorId) {
      setVendorError(
        "Select a vendor before creating a shipment."
      );
      return;
    }

    const vendorId =
      String(selectedVendorId);

    setShipmentError("");

    /*
     * Explicitly associate the modal with the currently
     * selected vendor.
     */
    setShipmentVendorId(
      vendorId
    );

    /*
     * Load this vendor's vehicles specifically for the modal.
     */
    const vendorVehicles =
      await loadShipmentVehicles(
        vendorId
      );

    /*
     * Do not carry over a vehicle belonging to another
     * vendor.
     */
    setShipmentForm({
      vehicleId:
        vendorVehicles.length > 0
          ? String(
              getEntityId(
                vendorVehicles[0]
              )
            )
          : "",
      origin: "",
      destination: "",
      shipmentType: "General",
      load: "",
    });

    setShowShipmentForm(true);
  }

  /* ==========================================================
     DERIVED DATA
     ========================================================== */

  const selectedVendor = useMemo(
    () =>
      vendors.find(
        (vendor) =>
          String(
            getEntityId(vendor)
          ) ===
          String(selectedVendorId)
      ) || null,
    [vendors, selectedVendorId]
  );

  const selectedRouteVendor =
    useMemo(
      () =>
        vendors.find(
          (vendor) =>
            String(
              getEntityId(vendor)
            ) ===
            String(routeVendorId)
        ) || null,
      [vendors, routeVendorId]
    );

  const shipmentVendor =
    useMemo(
      () =>
        vendors.find(
          (vendor) =>
            String(
              getEntityId(vendor)
            ) ===
            String(shipmentVendorId)
        ) || null,
      [vendors, shipmentVendorId]
    );

  /*
   * Backend:
   * [longitude, latitude]
   *
   * Leaflet:
   * [latitude, longitude]
   */

  const routePolylines = useMemo(
    () =>
      routes
        .map((route, index) => ({
          route,

          positions:
            getValidCoordinates(route)
              .map(
                ([lng, lat]) => [
                  Number(lat),
                  Number(lng),
                ]
              ),

          color:
            routeColors[
              index %
                routeColors.length
            ],
        }))
        .filter(
          (item) =>
            item.positions.length > 1
        ),
    [routes]
  );

  const selectedRouteData =
    selectedRoute ||
    bestRoute ||
    routes[0] ||
    null;

  const selectedPositions =
    getValidCoordinates(
      selectedRouteData
    );

  const middlePoint =
    selectedPositions.length > 0
      ? selectedPositions[
          Math.floor(
            selectedPositions.length / 2
          )
        ]
      : null;

  const mapCenter = middlePoint
    ? [
        Number(middlePoint[1]),
        Number(middlePoint[0]),
      ]
    : defaultCenter;

  const selectedRouteScore =
    getSafetyScore(
      selectedRouteData
    );

  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <div className="app-shell">

      {/* ======================================================
          SIDEBAR
          ====================================================== */}

      <aside className="sidebar glass">

        <div className="brand">

          <div className="brand-mark">
            S
          </div>

          <div>
            <div className="brand-name">
              SILP
            </div>

            <div className="brand-subtitle">
              Smart Intelligence Logistics
              Platform
            </div>
          </div>

        </div>

        <nav className="sidebar-nav">

          <button
            className={`nav-item ${
              activeSection === "routing"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setActiveSection(
                "routing"
              )
            }
          >
            <span className="nav-icon">
              ⌁
            </span>

            <span>
              <strong>
                Route Intelligence
              </strong>

              <small>
                Weather-aware routing
              </small>
            </span>
          </button>

          <button
            className={`nav-item ${
              activeSection === "vendor"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setActiveSection(
                "vendor"
              )
            }
          >
            <span className="nav-icon">
              ▣
            </span>

            <span>
              <strong>
                Vendor OMS
              </strong>

              <small>
                Fleet & shipments
              </small>
            </span>
          </button>

        </nav>

        <div className="sidebar-bottom">

          <div className="system-status">

            <span className="status-dot" />

            <div>
              <strong>
                System operational
              </strong>

              <small>
                Routing engine online
              </small>
            </div>

          </div>

          <div className="sidebar-version">
            SILP • v0.4
          </div>

        </div>

      </aside>

      {/* ======================================================
          MAIN CONTENT
          ====================================================== */}

      <main className="main-content">

        <header className="topbar">

          <div>
            <span className="eyebrow">
              LOGISTICS INTELLIGENCE
            </span>

            <h1>
              {activeSection === "routing"
                ? "Route Intelligence"
                : "Vendor Operations"}
            </h1>
          </div>

          <div className="topbar-status">

            <span className="live-dot" />

            Live conditions

          </div>

        </header>

        {/* ====================================================
            ROUTING PAGE
            ==================================================== */}

        {activeSection === "routing" && (
          <section className="routing-page">

            <div className="route-workspace">

              {/* ==================================================
                  LEFT ROUTE PANEL
                  ================================================== */}

              <section className="route-panel glass">

                {routes.length === 0 ? (

                  <div className="search-screen">

                    <div className="panel-heading">

                      <div>

                        <span className="section-kicker">
                          ROUTE PLANNER
                        </span>

                        <h2>
                          Find a safer route
                        </h2>

                        <p>
                          Compare routes using
                          live weather and
                          disaster conditions.
                        </p>

                      </div>

                      <div className="heading-badge">
                        <span />
                        LIVE
                      </div>

                    </div>

                    <form
                      className="route-form"
                      onSubmit={
                        handleFindRoutes
                      }
                    >

                      <div className="form-field">

                        <label>
                          Origin
                        </label>

                        <div className="input-shell">

                          <span className="input-dot origin-dot" />

                          <input
                            value={source}
                            onChange={(e) =>
                              setSource(
                                e.target.value
                              )
                            }
                            placeholder="Enter starting location"
                          />

                        </div>

                      </div>

                      <div className="route-connector">
                        <span />
                      </div>

                      <div className="form-field">

                        <label>
                          Destination
                        </label>

                        <div className="input-shell">

                          <span className="input-dot destination-dot" />

                          <input
                            value={destination}
                            onChange={(e) =>
                              setDestination(
                                e.target.value
                              )
                            }
                            placeholder="Enter destination"
                          />

                        </div>

                      </div>

                      <div className="form-grid">

                        <div className="form-field">

                          <label>
                            Urgency
                          </label>

                          <select
                            value={urgency}
                            onChange={(e) =>
                              setUrgency(
                                e.target.value
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

                        <div className="form-field">

                          <label>
                            Vendor
                          </label>

                          <select
                            value={
                              routeVendorId
                            }
                            onChange={(e) => {
                              setRouteVendorId(
                                e.target.value
                              );

                              setRouteVehicleId(
                                ""
                              );
                            }}
                          >

                            <option value="">
                              No vendor
                            </option>

                            {vendors.map(
                              (vendor) => {

                                const id =
                                  getEntityId(
                                    vendor
                                  );

                                return (
                                  <option
                                    key={id}
                                    value={id}
                                  >
                                    {vendor.name ||
                                      "Unnamed vendor"}
                                  </option>
                                );
                              }
                            )}

                          </select>

                        </div>

                      </div>

                      {routeVendorId && (

                        <div className="form-field vehicle-field">

                          <label>
                            Vehicle
                          </label>

                          <select
                            value={
                              routeVehicleId
                            }
                            onChange={(e) =>
                              setRouteVehicleId(
                                e.target.value
                              )
                            }
                            disabled={
                              routeVehicleLoading
                            }
                          >

                            <option value="">
                              {routeVehicleLoading
                                ? "Loading vehicles..."
                                : "Select vehicle"}
                            </option>

                            {routeVehicles.map(
                              (vehicle) => {

                                const id =
                                  getEntityId(
                                    vehicle
                                  );

                                return (
                                  <option
                                    key={id}
                                    value={id}
                                  >
                                    {vehicle.registrationNumber ||
                                      vehicle.vehicleNumber ||
                                      "Vehicle"}
                                  </option>
                                );
                              }
                            )}

                          </select>

                        </div>

                      )}

                      {selectedRouteVendor && (

                        <div className="selected-vendor">

                          <div className="vendor-avatar">
                            {(
                              selectedRouteVendor.name ||
                              "V"
                            )
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div>

                            <strong>
                              {
                                selectedRouteVendor.name
                              }
                            </strong>

                            <span>
                              Selected logistics
                              partner
                            </span>

                          </div>

                          <span className="vendor-check">
                            ✓
                          </span>

                        </div>

                      )}

                      <button
                        className="primary-button"
                        type="submit"
                        disabled={
                          loadingRoutes
                        }
                      >

                        {loadingRoutes ? (
                          <>
                            <span className="spinner" />
                            Analysing routes...
                          </>
                        ) : (
                          <>
                            <span>⌁</span>
                            Find safe routes
                          </>
                        )}

                      </button>

                    </form>

                    {routeError && (

                      <div className="route-error">

                        <span>!</span>

                        {routeError}

                      </div>

                    )}

                    <div className="search-footer">

                      <span>
                        ◈
                      </span>

                      <p>
                        Safety analysis uses
                        current environmental
                        conditions rather than
                        distance alone.
                      </p>

                    </div>

                  </div>

                ) : (

                  <div className="analysis-screen">

                    <div className="analysis-header">

                      <div className="analysis-title">

                        <button
                          className="back-button"
                          onClick={
                            handleNewSearch
                          }
                          type="button"
                        >
                          ←
                        </button>

                        <div>

                          <span className="section-kicker">
                            ROUTE ANALYSIS
                          </span>

                          <h2>
                            Live route intelligence
                          </h2>

                          <p>
                            {source}
                            <span>
                              {" "}
                              →{" "}
                            </span>
                            {destination}
                          </p>

                        </div>

                      </div>

                      <button
                        className="new-search-button"
                        onClick={
                          handleNewSearch
                        }
                        type="button"
                      >
                        + New search
                      </button>

                    </div>

                    {routeError && (

                      <div className="route-error">

                        <span>!</span>

                        {routeError}

                      </div>

                    )}

                    {/* =============================================
                        RECOMMENDED ROUTE
                        ============================================= */}

                    {bestRoute && (

                      <div className="recommended-analysis">

                        <div className="recommended-heading">

                          <div>

                            <span className="section-kicker">
                              RECOMMENDED
                            </span>

                            <h3>
                              Safest available route
                            </h3>

                          </div>

                          <div
                            className={`large-safety ${getSafetyClass(
                              getSafetyScore(
                                bestRoute
                              )
                            )}`}
                          >

                            <strong>
                              {Math.round(
                                getSafetyScore(
                                  bestRoute
                                )
                              )}
                              %
                            </strong>

                            <span>
                              safety
                            </span>

                          </div>

                        </div>

                        <div className="analysis-route-path">

                          <div className="path-point">

                            <span className="path-dot start" />

                            <div>

                              <small>
                                ORIGIN
                              </small>

                              <strong>
                                {source}
                              </strong>

                            </div>

                          </div>

                          <div className="path-line">
                            <span />
                          </div>

                          <div className="path-point">

                            <span className="path-dot end" />

                            <div>

                              <small>
                                DESTINATION
                              </small>

                              <strong>
                                {destination}
                              </strong>

                            </div>

                          </div>

                        </div>

                        <div className="analysis-stats">

                          <div>

                            <span>
                              DISTANCE
                            </span>

                            <strong>
                              {bestRoute.distanceKm !=
                              null
                                ? `${Number(
                                    bestRoute.distanceKm
                                  ).toFixed(
                                    1
                                  )} km`
                                : "--"}
                            </strong>

                          </div>

                          <div>

                            <span>
                              ETA
                            </span>

                            <strong>
                              {formatDuration(
                                bestRoute.durationMin
                              )}
                            </strong>

                          </div>

                          <div>

                            <span>
                              RISK
                            </span>

                            <strong>
                              {getRiskLabel(
                                bestRoute.hazardRisk
                              )}
                            </strong>

                          </div>

                        </div>

                        <div className="analysis-hazard">

                          <div className="hazard-icon">
                            ◈
                          </div>

                          <div>

                            <span>
                              LIVE CONDITION
                            </span>

                            <strong>
                              {getHazardMessage(
                                bestRoute
                              )}
                            </strong>

                          </div>

                        </div>

                        {/* ==========================================
                            INTERNATIONAL BORDER WARNING
                            ========================================== */}

                        {bestRoute.international && (

                          <div className="border-warning-card">

                            <div className="border-warning-title">
                              International border crossing detected
                            </div>

                            <div className="border-warning-text">
                              {bestRoute.borderWarning ||
                                "Permit, customs and other cross-border requirements may apply."}
                            </div>

                            {bestRoute.countriesCrossed?.length >
                              0 && (

                              <div className="border-countries">
                                Countries:{" "}
                                {bestRoute.countriesCrossed.join(
                                  " → "
                                )}
                              </div>

                            )}

                          </div>

                        )}

                        {/* ==========================================
                            HAZARD DATA WARNING
                            ========================================== */}

                        {bestRoute.hazardDataUnavailable && (

                          <div className="hazard-warning-card">

                            <strong>
                              Live hazard data unavailable
                            </strong>

                            <span>
                              This route was scored
                              conservatively and must
                              not be treated as
                              verified safe.
                            </span>

                          </div>

                        )}

                        {routeVendorId &&
                          routeVehicleId && (

                            <button
                              className="shipment-button large"
                              onClick={() =>
                                openShipmentFromRoute(
                                  bestRoute
                                )
                              }
                              type="button"
                            >

                              Create shipment from
                              recommended route

                              <span>
                                →
                              </span>

                            </button>

                          )}

                      </div>

                    )}

                    {/* =============================================
                        ALTERNATIVE ROUTES
                        ============================================= */}

                    <div className="alternatives-section">

                      <div className="alternatives-heading">

                        <div>

                          <span className="section-kicker">
                            COMPARISON
                          </span>

                          <h3>
                            Alternative routes
                          </h3>

                        </div>

                        <span className="result-count">
                          {routes.length} OPTIONS
                        </span>

                      </div>

                      <div className="alternatives-list">

                        {routes.map(
                          (route, index) => {

                            const safety =
                              getSafetyScore(
                                route
                              );

                            const isRecommended =
                              isSameRoute(
                                route,
                                bestRoute
                              );

                            const isSelected =
                              isSameRoute(
                                route,
                                selectedRoute
                              );

                            return (

                              <article
                                key={getRouteKey(
                                  route,
                                  index
                                )}
                                className={`analysis-route-card ${
                                  isSelected
                                    ? "selected"
                                    : ""
                                }`}
                                onClick={() =>
                                  setSelectedRoute(
                                    route
                                  )
                                }
                              >

                                <div className="analysis-card-number">

                                  <span
                                    style={{
                                      borderColor:
                                        routeColors[
                                          index %
                                            routeColors.length
                                        ],
                                    }}
                                  >
                                    {index + 1}
                                  </span>

                                </div>

                                <div className="analysis-card-main">

                                  <div className="analysis-card-title">

                                    <div>

                                      <strong>
                                        {isRecommended
                                          ? "Recommended route"
                                          : `Route alternative ${
                                              index +
                                              1
                                            }`}
                                      </strong>

                                      <span>
                                        {route.name ||
                                          route.summary ||
                                          `Route ${route.routeNumber ?? index + 1}`}
                                      </span>

                                    </div>

                                    <div
                                      className={`mini-safety ${getSafetyClass(
                                        safety
                                      )}`}
                                    >
                                      {Math.round(
                                        safety
                                      )}
                                      %
                                    </div>

                                  </div>

                                  <div className="mini-stats">

                                    <span>
                                      {route.distanceKm !=
                                      null
                                        ? `${Number(
                                            route.distanceKm
                                          ).toFixed(
                                            1
                                          )} km`
                                        : "--"}
                                    </span>

                                    <span>
                                      {formatDuration(
                                        route.durationMin
                                      )}
                                    </span>

                                    <span>
                                      {getRiskLabel(
                                        route.hazardRisk
                                      )}
                                    </span>

                                  </div>

                                  <div className="mini-hazard">
                                    ◈{" "}
                                    {getHazardMessage(
                                      route
                                    )}
                                  </div>

                                  {route.international && (

                                    <div className="mini-border-warning">

                                      <strong>
                                        International border
                                      </strong>

                                      <span>
                                        Permit/customs
                                        requirements may apply
                                      </span>

                                    </div>

                                  )}

                                  {route.hazardDataUnavailable && (

                                    <div className="mini-data-warning">
                                      Live hazard data unavailable
                                    </div>

                                  )}

                                  {routeVendorId &&
                                    routeVehicleId && (

                                      <button
                                        className="shipment-button"
                                        onClick={(
                                          event
                                        ) => {

                                          event.stopPropagation();

                                          openShipmentFromRoute(
                                            route
                                          );
                                        }}
                                        type="button"
                                      >

                                        Create shipment

                                        <span>
                                          →
                                        </span>

                                      </button>

                                    )}

                                </div>

                              </article>

                            );
                          }
                        )}

                      </div>

                    </div>

                  </div>

                )}

              </section>

              {/* ==================================================
                  MAP
                  ================================================== */}

              <section className="map-panel glass">

                <div className="map-topbar">

                  <div className="map-analysis">

                    <span className="section-kicker">
                      LIVE ROUTE MAP
                    </span>

                    <strong>
                      Active route overview
                    </strong>

                  </div>

                  <div className="map-live">

                    <span />

                    LIVE

                  </div>

                </div>

                <div className="map-container">

                  <MapContainer
                    center={mapCenter}
                    zoom={6}
                    scrollWheelZoom
                    zoomControl
                    style={{
                      height: "100%",
                      width: "100%",
                    }}
                  >

                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <FitRoutes
                      routes={routes}
                    />

                    {routePolylines.map(
                      ({
                        route,
                        positions,
                        color,
                      }, index) => {

                        const isSelected =
                          isSameRoute(
                            route,
                            selectedRouteData
                          );

                        const isRecommended =
                          isSameRoute(
                            route,
                            bestRoute
                          );

                        return (

                          <Polyline
                            key={getRouteKey(
                              route,
                              index
                            )}
                            positions={
                              positions
                            }
                            pathOptions={{
                              color,
                              weight:
                                isSelected
                                  ? 6
                                  : isRecommended
                                  ? 5
                                  : 3,
                              opacity:
                                isSelected
                                  ? 0.95
                                  : isRecommended
                                  ? 0.75
                                  : 0.4,
                            }}
                            eventHandlers={{
                              click: () =>
                                setSelectedRoute(
                                  route
                                ),
                            }}
                          />

                        );
                      }
                    )}

                    {selectedPositions.length >
                      0 && (

                      <>

                        <Marker
                          position={[
                            Number(
                              selectedPositions[
                                0
                              ][1]
                            ),
                            Number(
                              selectedPositions[
                                0
                              ][0]
                            ),
                          ]}
                          icon={markerIcon}
                        >

                          <Popup>
                            <strong>
                              Origin
                            </strong>
                            <br />
                            {source}
                          </Popup>

                        </Marker>

                        <Marker
                          position={[
                            Number(
                              selectedPositions[
                                selectedPositions.length -
                                  1
                              ][1]
                            ),
                            Number(
                              selectedPositions[
                                selectedPositions.length -
                                  1
                              ][0]
                            ),
                          ]}
                          icon={markerIcon}
                        >

                          <Popup>
                            <strong>
                              Destination
                            </strong>
                            <br />
                            {destination}
                          </Popup>

                        </Marker>

                      </>

                    )}

                  </MapContainer>

                  {!routes.length && (

                    <div className="map-empty glass-small">

                      <div className="map-empty-icon">
                        ⌖
                      </div>

                      <strong>
                        Your route will appear here
                      </strong>

                      <span>
                        Enter locations and run
                        the route intelligence
                        engine.
                      </span>

                    </div>

                  )}

                  {selectedRouteData && (

                    <div className="map-route-card glass-small">

                      <div>

                        <span className="section-kicker">
                          SELECTED ROUTE
                        </span>

                        <strong>
                          {isSameRoute(
                            selectedRouteData,
                            bestRoute
                          )
                            ? "Recommended route"
                            : "Route alternative"}
                        </strong>

                      </div>

                      <div
                        className={`map-safety ${getSafetyClass(
                          selectedRouteScore
                        )}`}
                      >

                        {Math.round(
                          selectedRouteScore
                        )}
                        %

                      </div>

                    </div>

                  )}

                </div>

              </section>

            </div>

          </section>
        )}

        {/* ========================================================
            VENDOR OMS
            ======================================================== */}

        {activeSection === "vendor" && (

          <section className="vendor-page">

            <div className="vendor-toolbar glass">

              <div>

                <span className="section-kicker">
                  VENDOR OMS
                </span>

                <h2>
                  Fleet & shipment management
                </h2>

                <p>
                  Manage your logistics
                  partners, vehicles and
                  shipments.
                </p>

              </div>

              <button
                className="primary-button compact"
                onClick={() =>
                  setShowVendorForm(true)
                }
                type="button"
              >
                + Add vendor
              </button>

            </div>

            {vendorError && (

              <div className="route-error">

                <span>!</span>

                {vendorError}

              </div>

            )}

            <div className="vendor-layout">

              {/* VENDOR LIST */}

              <section className="vendor-list-panel glass">

                <div className="section-header">

                  <div>

                    <span className="section-kicker">
                      PARTNERS
                    </span>

                    <h3>
                      Vendors
                    </h3>

                  </div>

                  <span className="result-count">
                    {vendors.length}
                  </span>

                </div>

                <div className="vendor-list">

                  {vendorLoading && (

                    <div className="inline-loading">
                      Loading vendors...
                    </div>

                  )}

                  {!vendorLoading &&
                    !vendors.length && (

                      <div className="empty-small">

                        <strong>
                          No vendors yet
                        </strong>

                        <span>
                          Add your first
                          logistics partner.
                        </span>

                      </div>

                    )}

                  {vendors.map(
                    (vendor) => {

                      const id =
                        getEntityId(
                          vendor
                        );

                      return (

                        <button
                          key={id}
                          className={`vendor-list-item ${
                            String(
                              selectedVendorId
                            ) ===
                            String(id)
                              ? "active"
                              : ""
                          }`}
                          onClick={() =>
                            setSelectedVendorId(
                              String(id)
                            )
                          }
                          type="button"
                        >

                          <div className="vendor-avatar">

                            {(
                              vendor.name ||
                              "V"
                            )
                              .charAt(0)
                              .toUpperCase()}

                          </div>

                          <div>

                            <strong>
                              {vendor.name ||
                                "Unnamed vendor"}
                            </strong>

                            <span>
                              {vendor.email ||
                                "No email"}
                            </span>

                          </div>

                          <span className="vendor-arrow">
                            →
                          </span>

                        </button>

                      );
                    }
                  )}

                </div>

              </section>

              {/* VENDOR PROFILE */}

              <section className="vendor-profile glass">

                {!selectedVendor ? (

                  <div className="empty-profile">

                    <div className="empty-icon">
                      ▣
                    </div>

                    <h3>
                      Select a vendor
                    </h3>

                    <p>
                      Choose a vendor to view
                      fleet and shipment data.
                    </p>

                  </div>

                ) : (

                  <>

                    <div className="profile-header">

                      <div className="profile-identity">

                        <div className="profile-avatar">

                          {(
                            selectedVendor.name ||
                            "V"
                          )
                            .charAt(0)
                            .toUpperCase()}

                        </div>

                        <div>

                          <span className="section-kicker">
                            ACTIVE VENDOR
                          </span>

                          <h2>
                            {
                              selectedVendor.name
                            }
                          </h2>

                          <p>
                            {selectedVendor.email ||
                              "No email available"}
                          </p>

                        </div>

                      </div>

                      <div className="green-score">

                        <span>
                          GREEN SCORE
                        </span>

                        <strong>
                          {selectedVendor.greenScore ??
                            selectedVendor.green_score ??
                            "--"}
                        </strong>

                      </div>

                    </div>

                    <div className="oms-grid">

                      {/* FLEET */}

                      <section className="oms-section">

                        <div className="section-header">

                          <div>

                            <span className="section-kicker">
                              FLEET
                            </span>

                            <h3>
                              Vehicles
                            </h3>

                          </div>

                          <button
                            className="secondary-button"
                            onClick={() =>
                              setShowVehicleForm(
                                true
                              )
                            }
                            type="button"
                          >
                            + Vehicle
                          </button>

                        </div>

                        {vehicleLoading ? (

                          <div className="inline-loading">
                            Loading fleet...
                          </div>

                        ) : !vehicles.length ? (

                          <div className="empty-small">

                            <strong>
                              No vehicles
                            </strong>

                            <span>
                              Add a vehicle to
                              this vendor.
                            </span>

                          </div>

                        ) : (

                          <div className="vehicle-list">

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

                                  <div>

                                    <strong>
                                      {vehicle.registrationNumber ||
                                        vehicle.vehicleNumber ||
                                        "Vehicle"}
                                    </strong>

                                    <span>
                                      {vehicle.vehicleType ||
                                        "Truck"}{" "}
                                      ·{" "}
                                      {vehicle.fuelType ||
                                        "Unknown fuel"}
                                    </span>

                                  </div>

                                  <div className="vehicle-capacity">

                                    <span>
                                      Capacity
                                    </span>

                                    <strong>
                                      {vehicle.capacity ||
                                        "--"}
                                    </strong>

                                  </div>

                                </div>

                              )
                            )}

                          </div>

                        )}

                      </section>

                      {/* SHIPMENTS */}

                      <section className="oms-section">

                        <div className="section-header">

                          <div>

                            <span className="section-kicker">
                              ORDERS
                            </span>

                            <h3>
                              Shipments
                            </h3>

                          </div>

                          <button
                            className="secondary-button"
                            onClick={
                              openShipmentFromVendor
                            }
                            type="button"
                          >
                            + Shipment
                          </button>

                        </div>

                        {shipmentLoading ? (

                          <div className="inline-loading">
                            Loading shipments...
                          </div>

                        ) : !shipments.length ? (

                          <div className="empty-small">

                            <strong>
                              No shipments
                            </strong>

                            <span>
                              Create your first
                              shipment.
                            </span>

                          </div>

                        ) : (

                          <div className="shipment-list">

                            {shipments.map(
                              (
                                shipment,
                                index
                              ) => (

                                <div
                                  className="shipment-card"
                                  key={
                                    getEntityId(
                                      shipment
                                    ) ||
                                    index
                                  }
                                >

                                  <div className="shipment-status">

                                    <span />

                                    Active

                                  </div>

                                  <div className="shipment-route">

                                    <strong>
                                      {shipment.origin ||
                                        shipment.source ||
                                        "—"}
                                    </strong>

                                    <span>
                                      ↓
                                    </span>

                                    <strong>
                                      {shipment.destination ||
                                        shipment.destinationName ||
                                        "—"}
                                    </strong>

                                  </div>

                                  <div className="shipment-meta">

                                    {shipment.shipmentType ||
                                      "General"}

                                    {shipment.load
                                      ? ` · ${shipment.load}`
                                      : ""}

                                  </div>

                                </div>

                              )
                            )}

                          </div>

                        )}

                      </section>

                    </div>

                  </>

                )}

              </section>

            </div>

          </section>

        )}

      </main>

      {/* ========================================================
          VENDOR MODAL
          ======================================================== */}

      {showVendorForm && (

        <div
          className="modal-backdrop"
          onClick={() =>
            setShowVendorForm(false)
          }
        >

          <form
            className="modal glass"
            onSubmit={
              handleCreateVendor
            }
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <div className="modal-header">

              <div>

                <span className="section-kicker">
                  VENDOR OMS
                </span>

                <h2>
                  Add vendor
                </h2>

              </div>

              <button
                type="button"
                className="close-button"
                onClick={() =>
                  setShowVendorForm(false)
                }
              >
                ×
              </button>

            </div>

            <div className="modal-fields">

              <div className="form-field">

                <label>
                  Vendor name
                </label>

                <input
                  value={
                    vendorForm.name
                  }
                  onChange={(e) =>
                    setVendorForm({
                      ...vendorForm,
                      name: e.target.value,
                    })
                  }
                  placeholder="e.g. Northeast Logistics"
                  required
                />

              </div>

              <div className="form-field">

                <label>
                  Email
                </label>

                <input
                  type="email"
                  value={
                    vendorForm.email
                  }
                  onChange={(e) =>
                    setVendorForm({
                      ...vendorForm,
                      email: e.target.value,
                    })
                  }
                  placeholder="vendor@example.com"
                />

              </div>

            </div>

            <button
              className="primary-button"
              type="submit"
            >
              Create vendor
            </button>

          </form>

        </div>

      )}

      {/* ========================================================
          VEHICLE MODAL
          ======================================================== */}

      {showVehicleForm && (

        <div
          className="modal-backdrop"
          onClick={() =>
            setShowVehicleForm(false)
          }
        >

          <form
            className="modal glass"
            onSubmit={
              handleAddVehicle
            }
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <div className="modal-header">

              <div>

                <span className="section-kicker">
                  FLEET
                </span>

                <h2>
                  Add vehicle
                </h2>

              </div>

              <button
                type="button"
                className="close-button"
                onClick={() =>
                  setShowVehicleForm(false)
                }
              >
                ×
              </button>

            </div>

            <div className="modal-fields">

              <div className="form-field">

                <label>
                  Registration number
                </label>

                <input
                  value={
                    vehicleForm.registrationNumber
                  }
                  onChange={(e) =>
                    setVehicleForm({
                      ...vehicleForm,
                      registrationNumber:
                        e.target.value,
                    })
                  }
                  placeholder="MH 01 AB 1234"
                  required
                />

              </div>

              <div className="form-grid">

                <div className="form-field">

                  <label>
                    Vehicle type
                  </label>

                  <select
                    value={
                      vehicleForm.vehicleType
                    }
                    onChange={(e) =>
                      setVehicleForm({
                        ...vehicleForm,
                        vehicleType:
                          e.target.value,
                      })
                    }
                  >

                    <option>
                      Truck
                    </option>

                    <option>
                      Mini Truck
                    </option>

                    <option>
                      Van
                    </option>

                    <option>
                      Pickup
                    </option>

                    <option>
                      EV Truck
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
                    onChange={(e) =>
                      setVehicleForm({
                        ...vehicleForm,
                        fuelType:
                          e.target.value,
                      })
                    }
                  >

                    <option>
                      Diesel
                    </option>

                    <option>
                      Petrol
                    </option>

                    <option>
                      CNG
                    </option>

                    <option>
                      Electric
                    </option>

                  </select>

                </div>

              </div>

              <div className="form-field">

                <label>
                  Capacity
                </label>

                <input
                  value={
                    vehicleForm.capacity
                  }
                  onChange={(e) =>
                    setVehicleForm({
                      ...vehicleForm,
                      capacity:
                        e.target.value,
                    })
                  }
                  placeholder="e.g. 5 tonnes"
                />

              </div>

            </div>

            <button
              className="primary-button"
              type="submit"
            >
              Add vehicle
            </button>

          </form>

        </div>

      )}

      {/* ========================================================
          SHIPMENT MODAL
          ======================================================== */}

      {showShipmentForm && (

        <div
          className="modal-backdrop"
          onClick={() => {
            if (!shipmentSubmitting) {
              setShowShipmentForm(false);
              setShipmentError("");
            }
          }}
        >

          <form
            className="modal glass"
            onSubmit={
              handleCreateShipment
            }
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <div className="modal-header">

              <div>

                <span className="section-kicker">
                  SHIPMENT
                </span>

                <h2>
                  Create shipment
                </h2>

                {shipmentVendor && (

                  <p
                    style={{
                      margin:
                        "6px 0 0",
                      fontSize:
                        "13px",
                      opacity: 0.65,
                    }}
                  >
                    Vendor:{" "}
                    <strong>
                      {shipmentVendor.name ||
                        "Unnamed vendor"}
                    </strong>
                  </p>

                )}

              </div>

              <button
                type="button"
                className="close-button"
                onClick={() => {
                  if (
                    shipmentSubmitting
                  ) {
                    return;
                  }

                  setShowShipmentForm(
                    false
                  );
                  setShipmentError("");
                }}
              >
                ×
              </button>

            </div>

            {shipmentError && (

              <div className="route-error">

                <span>!</span>

                {shipmentError}

              </div>

            )}

            <div className="modal-fields">

              <div className="form-field">

                <label>
                  Vehicle
                </label>

                <select
                  value={
                    shipmentForm.vehicleId
                  }
                  onChange={(e) =>
                    setShipmentForm({
                      ...shipmentForm,
                      vehicleId:
                        e.target.value,
                    })
                  }
                  required
                  disabled={
                    shipmentVehicleLoading ||
                    shipmentSubmitting
                  }
                >

                  <option value="">
                    {shipmentVehicleLoading
                      ? "Loading vehicles..."
                      : shipmentVehicles.length
                      ? "Select vehicle"
                      : "No vehicles available"}
                  </option>

                  {shipmentVehicles.map(
                    (vehicle) => {

                      const id =
                        getEntityId(
                          vehicle
                        );

                      return (
                        <option
                          key={id}
                          value={id}
                        >
                          {vehicle.registrationNumber ||
                            vehicle.vehicleNumber ||
                            "Vehicle"}
                        </option>
                      );
                    }
                  )}

                </select>

              </div>

              <div className="form-field">

                <label>
                  Origin
                </label>

                <input
                  value={
                    shipmentForm.origin
                  }
                  onChange={(e) =>
                    setShipmentForm({
                      ...shipmentForm,
                      origin:
                        e.target.value,
                    })
                  }
                  placeholder="Origin"
                  required
                  disabled={
                    shipmentSubmitting
                  }
                />

              </div>

              <div className="form-field">

                <label>
                  Destination
                </label>

                <input
                  value={
                    shipmentForm.destination
                  }
                  onChange={(e) =>
                    setShipmentForm({
                      ...shipmentForm,
                      destination:
                        e.target.value,
                    })
                  }
                  placeholder="Destination"
                  required
                  disabled={
                    shipmentSubmitting
                  }
                />

              </div>

              <div className="form-grid">

                <div className="form-field">

                  <label>
                    Shipment type
                  </label>

                  <select
                    value={
                      shipmentForm.shipmentType
                    }
                    onChange={(e) =>
                      setShipmentForm({
                        ...shipmentForm,
                        shipmentType:
                          e.target.value,
                      })
                    }
                    disabled={
                      shipmentSubmitting
                    }
                  >

                    <option>
                      General
                    </option>

                    <option>
                      Perishable
                    </option>

                    <option>
                      Medicine
                    </option>

                    <option>
                      Heavy Goods
                    </option>

                    <option>
                      Fragile
                    </option>

                  </select>

                </div>

                <div className="form-field">

                  <label>
                    Load
                  </label>

                  <input
                    value={
                      shipmentForm.load
                    }
                    onChange={(e) =>
                      setShipmentForm({
                        ...shipmentForm,
                        load:
                          e.target.value,
                      })
                    }
                    placeholder="e.g. 2 tonnes"
                    disabled={
                      shipmentSubmitting
                    }
                  />

                </div>

              </div>

            </div>

            <button
              className="primary-button"
              type="submit"
              disabled={
                shipmentSubmitting ||
                shipmentVehicleLoading ||
                !shipmentForm.vehicleId ||
                !shipmentVendorId
              }
            >

              {shipmentSubmitting ? (
                <>
                  <span className="spinner" />
                  Creating shipment...
                </>
              ) : (
                "Create shipment"
              )}

            </button>

          </form>

        </div>

      )}

    </div>
  );
}

export default App;