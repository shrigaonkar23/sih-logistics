import { useState, useEffect } from "react";

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


// ============================================================
// LEAFLET MARKER FIX
// ============================================================

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",

  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",

  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});


// ============================================================
// FIT MAP TO ROUTES
// ============================================================

function FitRoutes({ routes }) {
  const map = useMap();

  useEffect(() => {
    if (!routes || routes.length === 0) {
      return;
    }

    const allCoordinates = routes.flatMap((route) =>
      (route.coordinates || []).map(
        ([longitude, latitude]) => [
          latitude,
          longitude,
        ]
      )
    );

    if (allCoordinates.length === 0) {
      return;
    }

    const bounds = L.latLngBounds(allCoordinates);

    map.fitBounds(bounds, {
      padding: [50, 50],
    });
  }, [routes, map]);

  return null;
}


// ============================================================
// APP
// ============================================================

function App() {

  // ----------------------------------------------------------
  // FORM STATE
  // ----------------------------------------------------------

  const [origin, setOrigin] =
    useState("");

  const [destination, setDestination] =
    useState("");

  const [shipmentType, setShipmentType] =
    useState("General Cargo");

  const [urgency, setUrgency] =
    useState("Medium");

  const [vehicleLoad, setVehicleLoad] =
    useState("");


  // ----------------------------------------------------------
  // ROUTE STATE
  // ----------------------------------------------------------

  const [routeResult, setRouteResult] =
    useState(null);

  const [selectedRouteNumber, setSelectedRouteNumber] =
    useState(null);


  // ----------------------------------------------------------
  // UI STATE
  // ----------------------------------------------------------

  const [activePanel, setActivePanel] =
    useState("plan");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");


  // ==========================================================
  // FIND ROUTE
  // ==========================================================

  async function handleFindRoute(event) {

    event.preventDefault();

    setLoading(true);
    setError("");

    try {

      const response =
        await fetch(
          "http://localhost:3000/find-route",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({

              source:
                origin,

              destination:
                destination,

              shipmentType:
                shipmentType,

              urgency:
                urgency.toUpperCase(),

              vehicleLoad:
                Number(vehicleLoad) || 0,

            }),
          }
        );


      const data =
        await response.json();


      if (!response.ok) {

        throw new Error(
          data.error ||
          "Failed to find route"
        );

      }


      setRouteResult(data);


      // Automatically select recommended route

      if (data.bestRoute) {

        setSelectedRouteNumber(
          data.bestRoute.routeNumber
        );

      }


      setActivePanel("routes");


    } catch (err) {

      console.error(err);

      setError(
        err.message ||
        "Unable to find route"
      );

    } finally {

      setLoading(false);

    }

  }


  // ==========================================================
  // SELECT ROUTE
  // ==========================================================

  function handleSelectRoute(
    routeNumber
  ) {

    setSelectedRouteNumber(
      routeNumber
    );

  }


  // ==========================================================
  // CURRENTLY SELECTED ROUTE
  // ==========================================================

  const selectedRoute =
    routeResult?.routes?.find(
      (route) =>
        route.routeNumber ===
        selectedRouteNumber
    );


  // ==========================================================
  // MAP DEFAULT CENTER
  // ==========================================================

  const defaultCenter = [
    25.5,
    93.0,
  ];


  // ==========================================================
  // RENDER
  // ==========================================================

  return (

    <div className="app">


      {/* ================================================== */}
      {/* SIDEBAR */}
      {/* ================================================== */}

      <aside className="sidebar">


        {/* ================================================= */}
        {/* BRAND */}
        {/* ================================================= */}

        <div className="brand">

          <div className="brand-icon">
            S
          </div>

          <div className="brand-text">

            <div className="brand-name">
              SILP
            </div>

            <div className="brand-subtitle">
              Smart Intelligence Logistics Platform
            </div>

          </div>

        </div>


        {/* ================================================= */}
        {/* NAVIGATION */}
        {/* ================================================= */}

        <div className="dashboard-buttons">


          <button
            type="button"

            className={
              `dashboard-button ${
                activePanel === "plan"
                  ? "active"
                  : ""
              }`
            }

            onClick={() =>
              setActivePanel("plan")
            }
          >

            Plan Shipment

          </button>


          <button
            type="button"

            className={
              `dashboard-button ${
                activePanel === "routes"
                  ? "active"
                  : ""
              }`
            }

            onClick={() =>
              setActivePanel("routes")
            }
          >

            Routes

          </button>


          <button
            type="button"

            className={
              `dashboard-button ${
                activePanel === "analytics"
                  ? "active"
                  : ""
              }`
            }

            onClick={() =>
              setActivePanel("analytics")
            }
          >

            Analytics

          </button>


        </div>


        {/* ================================================= */}
        {/* PLAN SHIPMENT */}
        {/* ================================================= */}

        {activePanel === "plan" && (

          <div className="panel-content">


            <div className="panel-heading">

              <h2>
                Plan Shipment
              </h2>

              <p>
                Find the safest and most efficient route.
              </p>

            </div>


            <form
              onSubmit={handleFindRoute}
            >


              {/* ORIGIN */}

              <div className="input-group">

                <label>
                  Origin
                </label>

                <input
                  type="text"
                  placeholder="e.g. Guwahati"
                  value={origin}

                  onChange={(event) =>
                    setOrigin(
                      event.target.value
                    )
                  }

                  required
                />

              </div>


              {/* DESTINATION */}

              <div className="input-group">

                <label>
                  Destination
                </label>

                <input
                  type="text"
                  placeholder="e.g. Imphal"
                  value={destination}

                  onChange={(event) =>
                    setDestination(
                      event.target.value
                    )
                  }

                  required
                />

              </div>


              {/* SHIPMENT TYPE */}

              <div className="input-group">

                <label>
                  Shipment Type
                </label>

                <select
                  value={shipmentType}

                  onChange={(event) =>
                    setShipmentType(
                      event.target.value
                    )
                  }
                >

                  <option>
                    General Cargo
                  </option>

                  <option>
                    Perishable
                  </option>

                  <option>
                    Fragile
                  </option>

                  <option>
                    High Value
                  </option>

                </select>

              </div>


              {/* URGENCY */}

              <div className="input-group">

                <label>
                  Urgency
                </label>

                <select
                  value={urgency}

                  onChange={(event) =>
                    setUrgency(
                      event.target.value
                    )
                  }
                >

                  <option>
                    Low
                  </option>

                  <option>
                    Medium
                  </option>

                  <option>
                    High
                  </option>

                  <option>
                    Critical
                  </option>

                </select>

              </div>


              {/* VEHICLE LOAD */}

              <div className="input-group">

                <label>
                  Vehicle Load (%)
                </label>

                <input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="e.g. 70"
                  value={vehicleLoad}

                  onChange={(event) =>
                    setVehicleLoad(
                      event.target.value
                    )
                  }

                />

              </div>


              {/* ERROR */}

              {error && (

                <div className="error-message">
                  {error}
                </div>

              )}


              {/* FIND ROUTE BUTTON */}

              <button
                type="submit"
                className="find-route-button"
                disabled={loading}
              >

                {loading
                  ? "Finding routes..."
                  : "Find Best Route"
                }

              </button>


            </form>

          </div>

        )}


        {/* ================================================= */}
        {/* ROUTES */}
        {/* ================================================= */}

        {activePanel === "routes" && (

          <div className="panel-content">


            {!routeResult && (

              <div className="empty-panel">

                <h2>
                  No Routes Yet
                </h2>

                <p>
                  Plan a shipment to see available routes.
                </p>

              </div>

            )}


            {routeResult && (

              <>


                {/* ROUTE HEADER */}

                <div className="panel-heading routes-heading">

                  <h2>
                    Available Routes
                  </h2>

                  <p>
                    {routeResult.routeCount}{" "}
                    routes found for your shipment.
                  </p>

                </div>


                {/* ================================================= */}
                {/* ROUTE CARDS */}
                {/* ================================================= */}

                <div className="routes-list">

                  {routeResult.routes.map(
                    (route) => {

                      const isSelected =
                        route.routeNumber ===
                        selectedRouteNumber;


                      const isRecommended =
                        route.routeNumber ===
                        routeResult.bestRoute
                          ?.routeNumber;


                      return (

                        <button
                          key={
                            route.routeNumber
                          }

                          type="button"

                          className={
                            `route-card ${
                              isRecommended
                                ? "recommended-route"
                                : "alternate-route"
                            } ${
                              isSelected
                                ? "selected-route"
                                : ""
                            }`
                          }

                          onClick={() =>
                            handleSelectRoute(
                              route.routeNumber
                            )
                          }
                        >


                          {/* ROUTE HEADER */}

                          <div className="route-card-header">

                            <div className="route-title-group">

                              <span className="route-number">

                                Route{" "}
                                {route.routeNumber}

                              </span>


                              {isRecommended && (

                                <span className="recommended-badge">

                                  Recommended

                                </span>

                              )}

                            </div>


                            {isSelected && (

                              <span className="selected-badge">

                                Selected

                              </span>

                            )}

                          </div>


                          {/* ROUTE DETAILS */}

                          <div className="route-details">


                            <div className="route-detail">

                              <span>
                                Distance
                              </span>

                              <strong>
                                {route.distanceKm} km
                              </strong>

                            </div>


                            <div className="route-detail">

                              <span>
                                Estimated Time
                              </span>

                              <strong>
                                {route.durationMin} min
                              </strong>

                            </div>


                            <div className="route-detail">

                              <span>
                                Safety Score
                              </span>

                              <strong>
                                {route.safetyScore}/100
                              </strong>

                            </div>


                          </div>


                          {/* ROUTE STATUS */}

                          <div className="route-select-text">

                            {isSelected
                              ? "Selected"
                              : "View route"
                            }

                          </div>


                        </button>

                      );

                    }
                  )}

                </div>


                {/* ================================================= */}
                {/* SELECTED ROUTE SUMMARY */}
                {/* ================================================= */}

                {selectedRoute && (

                  <div className="selected-route-info">

                    <div className="selected-route-title">

                      Route{" "}
                      {selectedRoute.routeNumber}

                    </div>


                    <div className="selected-route-description">

                      {selectedRoute.routeNumber ===
                      routeResult.bestRoute
                        ?.routeNumber

                        ? "Recommended based on the current shipment parameters."

                        : "Alternative route currently displayed on the map."
                      }

                    </div>

                  </div>

                )}

              </>

            )}

          </div>

        )}


        {/* ================================================= */}
        {/* ANALYTICS */}
        {/* ================================================= */}

        {activePanel === "analytics" && (

          <div className="panel-content">


            <div className="panel-heading">

              <h2>
                Analytics
              </h2>

              <p>
                Route performance insights.
              </p>

            </div>


            {routeResult ? (

              <>


                <div className="analytics-card">

                  <span className="analytics-label">
                    Routes Evaluated
                  </span>

                  <span
                    className="analytics-hyphen"
                    aria-hidden="true"
                  >
                    -
                  </span>

                  <strong className="analytics-value">
                    {routeResult.routeCount}
                  </strong>

                </div>


                <div className="analytics-card">

                  <span className="analytics-label">
                    Recommended Route
                  </span>

                  <span
                    className="analytics-hyphen"
                    aria-hidden="true"
                  >
                    -
                  </span>

                  <strong className="analytics-value">
                    Route{" "}
                    {routeResult.bestRoute.routeNumber}
                  </strong>

                </div>


                <div className="analytics-card">

                  <span className="analytics-label">
                    Safety Score
                  </span>

                  <span
                    className="analytics-hyphen"
                    aria-hidden="true"
                  >
                    -
                  </span>

                  <strong className="analytics-value">
                    {routeResult.bestRoute.safetyScore}/100
                  </strong>

                </div>


              </>

            ) : (

              <div className="empty-panel">

                <p>
                  Run a route search to generate analytics.
                </p>

              </div>

            )}

          </div>

        )}

      </aside>


      {/* ================================================== */}
      {/* MAP */}
      {/* ================================================== */}

      <main className="map-container">

        <div className="map-wrapper">


          <MapContainer
            center={defaultCenter}
            zoom={7}
            className="leaflet-map"
          >


            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />


            {/* FIT MAP */}

            {routeResult?.routes && (

              <FitRoutes
                routes={
                  routeResult.routes
                }
              />

            )}


            {/* ================================================= */}
            {/* ROUTES */}
            {/* ================================================= */}

            {routeResult?.routes?.map(
              (route) => {

                const isSelected =
                  route.routeNumber ===
                  selectedRouteNumber;


                const isRecommended =
                  route.routeNumber ===
                  routeResult.bestRoute
                    ?.routeNumber;


                const positions =
                  (
                    route.coordinates ||
                    []
                  ).map(
                    (
                      [
                        longitude,
                        latitude,
                      ]
                    ) => [
                      latitude,
                      longitude,
                    ]
                  );


                if (
                  positions.length === 0
                ) {

                  return null;

                }


                return (

                  <Polyline
                    key={
                      route.routeNumber
                    }

                    positions={
                      positions
                    }

                    pathOptions={{

                      weight:
                        isSelected
                          ? 6
                          : isRecommended
                            ? 5
                            : 3,

                      opacity:
                        isSelected
                          ? 1
                          : isRecommended
                            ? 0.8
                            : 0.3,

                      dashArray:
                        isSelected ||
                        isRecommended
                          ? undefined
                          : "7 7",

                    }}

                    eventHandlers={{
                      click: () =>
                        handleSelectRoute(
                          route.routeNumber
                        ),
                    }}

                  />

                );

              }
            )}


            {/* ================================================= */}
            {/* ORIGIN */}
            {/* ================================================= */}

            {routeResult?.source && (

              <Marker
                position={[
                  routeResult.source.latitude,
                  routeResult.source.longitude,
                ]}
              >

                <Popup>

                  <strong>
                    Origin
                  </strong>

                  <br />

                  {routeResult.source.name}

                </Popup>

              </Marker>

            )}


            {/* ================================================= */}
            {/* DESTINATION */}
            {/* ================================================= */}

            {routeResult?.destination && (

              <Marker
                position={[
                  routeResult.destination.latitude,
                  routeResult.destination.longitude,
                ]}
              >

                <Popup>

                  <strong>
                    Destination
                  </strong>

                  <br />

                  {routeResult.destination.name}

                </Popup>

              </Marker>

            )}


          </MapContainer>


          {/* ================================================= */}
          {/* MAP ROUTE INFO */}
          {/* ================================================= */}

          {selectedRoute && (

            <div className="map-route-info">

              <div className="map-route-info-title">

                Route{" "}
                {selectedRoute.routeNumber}

                {selectedRoute.routeNumber ===
                routeResult?.bestRoute
                  ?.routeNumber
                  ? " · Recommended"
                  : ""
                }

              </div>


              <div className="map-route-info-details">

                <span>
                  {selectedRoute.distanceKm} km
                </span>

                <span>
                  {selectedRoute.durationMin} min
                </span>

                <span>
                  Safety{" "}
                  {selectedRoute.safetyScore}/100
                </span>

              </div>

            </div>

          )}


        </div>

      </main>


    </div>

  );
}


export default App;