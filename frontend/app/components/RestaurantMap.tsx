"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
import { toast } from "react-toastify";

interface Restaurant {
  id: number;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  owner: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Configuration des icônes Leaflet
const DefaultIcon = L.icon({
  iconUrl: icon.src,
  shadowUrl: iconShadow.src,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

function LocateMeButton({ setUserLocation, setUserAddress }: {
  setUserLocation: (loc: [number, number]) => void;
  setUserAddress: (addr: string) => void;
}) {
  const map = useMap();

  const handleClick = () => {
    if (!navigator.geolocation) {
      toast.error("La géolocalisation n'est pas supportée par votre navigateur.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation([latitude, longitude]);
        map.flyTo([latitude, longitude], 15);

        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await response.json();
          const address = data.display_name || "Adresse inconnue";
          setUserAddress(address);
          toast.success(`📍 Adresse détectée : ${address}`, { autoClose: 5000 });
        } catch {
          setUserAddress("Adresse inconnue");
          toast.error("❌ Impossible d'obtenir l'adresse.", { autoClose: 4000 });
        }
      },
      () => toast.error("Impossible de récupérer votre position."),
      { enableHighAccuracy: true }
    );
  };

  return (
    <button
      onClick={handleClick}
      className="absolute z-[1000] top-4 right-4 btn btn-primary shadow-lg"
    >
      📍 Ma position
    </button>
  );
}

export default function RestaurantMap({ filter = "" }: { filter?: string }) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [userAddress, setUserAddress] = useState<string>("");

  useEffect(() => {
    fetch(`${API_URL}/api/restaurants`)
      .then((res) => res.json())
      .then(setRestaurants)
      .catch(() => setRestaurants([]));
  }, []);

  const filteredRestaurants = restaurants.filter((r) =>
    r.name.toLowerCase().includes(filter.toLowerCase()) ||
    r.description.toLowerCase().includes(filter.toLowerCase()) ||
    r.owner.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="w-full h-[80vh] max-w-5xl mx-auto my-8 relative fade-in">
      <MapContainer 
        center={[48.8566, 2.3522]} 
        zoom={12} 
        className="h-full w-full rounded-xl shadow-lg"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {filteredRestaurants.map((r) => (
          <Marker key={r.id} position={[r.latitude, r.longitude]}>
            <Popup className="card">
              <h3 className="font-bold text-lg mb-2">{r.name}</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-2">{r.description}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Proposé par {r.owner}</p>
            </Popup>
          </Marker>
        ))}
        {userLocation && (
          <Marker position={userLocation}>
            <Popup className="card">
              <h3 className="font-bold text-lg mb-2">📍 Vous êtes ici</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{userAddress}</p>
            </Popup>
          </Marker>
        )}
        <LocateMeButton setUserLocation={setUserLocation} setUserAddress={setUserAddress} />
      </MapContainer>
    </div>
  );
}
