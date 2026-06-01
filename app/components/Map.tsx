"use client";

import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Route } from '@/types';

// Fix Leaflet marker icons in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapProps {
  routes?: Route[];
  selectedRoute?: string | null;
}

// Simple routing component that fetches actual walking routes
function RouteOverlay({ route }: { route: Route }) {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);

  useEffect(() => {
    // Fetch actual walking route using OpenRouteService (free API)
    const fetchRoute = async () => {
      try {
        const coordinates = [
          [route.start_longitude, route.start_latitude],
          [route.pub_longitude, route.pub_latitude],
          [route.end_longitude, route.end_latitude]
        ];

        // Use Next.js API route as proxy to avoid CORS
        const response = await fetch('/api/openroute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coordinates })
        });

        if (response.ok) {
          const data = await response.json();
          const coords = data.routes[0].geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
          setRouteCoords(coords);
        } else {
          // Fallback to simple polyline if API fails
          setRouteCoords([
            [route.start_latitude, route.start_longitude],
            [route.pub_latitude, route.pub_longitude],
            [route.end_latitude, route.end_longitude]
          ]);
        }
      } catch (error) {
        console.log('Route fetch error, using simple path:', error);
        // Fallback to simple polyline
        setRouteCoords([
          [route.start_latitude, route.start_longitude],
          [route.pub_latitude, route.pub_longitude],
          [route.end_latitude, route.end_longitude]
        ]);
      }
    };

    fetchRoute();
  }, [route]);

  if (routeCoords.length === 0) return null;
  
  return (
    <Polyline 
      positions={routeCoords}
      pathOptions={{ 
        color: '#dc2626', 
        weight: 4, 
        opacity: 0.8,
        dashArray: '10, 5'
      }}
    />
  );
}

export default function Map({ routes = [], selectedRoute = null }: MapProps) {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  // Get user's GPS location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => console.log('GPS error:', error)
      );
    }
  }, []);

  const displayRoutes = routes.filter(route => 
    selectedRoute ? route.id === selectedRoute : true
  );

  console.log('Map showing routes:', displayRoutes.length);

  // Center map on user location if available, else first route, else UK center
  const getValidCenter = (): [number, number] => {
    if (userLocation) return userLocation;
    if (displayRoutes.length > 0) {
      const route = displayRoutes[0];
      if (route.start_latitude && route.start_longitude) {
        return [route.start_latitude, route.start_longitude];
      }
    }
    return [54.5, -2.0]; // UK center
  };

  // Zoom in more if user location is available
  const getZoom = () => {
    if (userLocation) return 14;
    return selectedRoute ? 14 : 7;
  };

  return (
    <MapContainer
      center={getValidCenter()}
      zoom={getZoom()}
      style={{ height: "500px", width: "100%" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      
      {/* User location marker */}
      {userLocation && (
        <Marker position={userLocation}>
          <Popup>Your Location</Popup>
        </Marker>
      )}

      {/* Route markers and paths */}
      {displayRoutes.map((route) => (
        <div key={route.id}>
          {/* Start marker */}
          <Marker position={[route.start_latitude, route.start_longitude]}>
            <Popup>
              <strong>{route.name}</strong><br />
              🚩 Start Point<br />
              Distance: {route.distance}
            </Popup>
          </Marker>

          {/* Pub marker */}
          <Marker position={[route.pub_latitude, route.pub_longitude]}>
            <Popup>
              <strong>🍺 {route.pub_name}</strong><br />
              Pub stop on {route.name}
            </Popup>
          </Marker>

          {/* End marker */}
          <Marker position={[route.end_latitude, route.end_longitude]}>
            <Popup>
              <strong>{route.name}</strong><br />
              🏁 End Point
            </Popup>
          </Marker>

          {/* Actual walking route */}
          <RouteOverlay route={route} />
        </div>
      ))}
    </MapContainer>
  );
}
