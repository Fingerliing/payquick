import React, { useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '@/utils/designSystem';

import type { DirectoryRestaurant } from '@/services/restaurantDirectoryService';

const NAVY = '#1E2A78';
const GOLD = '#D4AF37';

interface UserLocation {
  latitude: number;
  longitude: number;
}

interface RestaurantMapProps {
  restaurants: DirectoryRestaurant[];
  userLocation?: UserLocation | null;
  height?: number;
  /** Remplit le parent (flex:1) au lieu d'une hauteur fixe. */
  fill?: boolean;
  onSelectRestaurant?: (restaurantId: string) => void;
}

interface Marker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rating: number;
  distance?: number | null;
}

function buildHtml(
  markers: Marker[],
  user: UserLocation | null,
  labels: { seeMenu: string; notRated: string },
  isDark: boolean,
  maptilerKey: string
): string {
  // Centre : position utilisateur, sinon premier restaurant, sinon France.
  const center = user
    ? [user.latitude, user.longitude]
    : markers.length
    ? [markers[0].lat, markers[0].lng]
    : [46.6, 2.4];

  const dataJson = JSON.stringify({ markers, user, center, labels, isDark, key: maptilerKey });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
    body { background: ${isDark ? '#0b1020' : '#e9edf2'}; }
    .maplibregl-map { font-family: -apple-system, Roboto, "Segoe UI", sans-serif; }

    .eq-pin-wrap { filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4)); cursor: pointer; }
    .eq-pin-wrap:active .eq-pin { transform: rotate(-45deg) scale(1.12); }
    .eq-pin { width: 32px; height: 32px; background: linear-gradient(145deg, #2D3E8F, ${NAVY}); border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2.5px solid #fff; display: flex; align-items: center; justify-content: center; transition: transform .12s ease; }
    .eq-pin span { transform: rotate(45deg); color: ${GOLD}; font-size: 12px; font-weight: 800; }
    .eq-pin.empty span { display: none; }
    .eq-pin.empty::after { content: ''; transform: rotate(45deg); width: 8px; height: 8px; border-radius: 50%; background: ${GOLD}; }

    .eq-user { position: relative; width: 22px; height: 22px; }
    .eq-user .dot { position: absolute; inset: 0; margin: auto; width: 16px; height: 16px; border-radius: 50%; background: ${GOLD}; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.4); }
    .eq-user .pulse { position: absolute; inset: 0; margin: auto; width: 16px; height: 16px; border-radius: 50%; background: rgba(212,175,55,.5); animation: eqpulse 2.2s ease-out infinite; }
    @keyframes eqpulse { 0% { transform: scale(1); opacity: .7; } 70% { transform: scale(3.4); opacity: 0; } 100% { transform: scale(3.4); opacity: 0; } }

    .eq-cluster { border-radius: 50%; background: linear-gradient(145deg, #2D3E8F, ${NAVY}); border: 3px solid #fff; box-shadow: 0 3px 8px rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; cursor: pointer; color: #fff; font-weight: 800; }
    .eq-cluster span { font-size: 13px; }
    .maplibregl-popup-content { border-radius: 14px; padding: 12px 14px; box-shadow: 0 10px 30px rgba(0,0,0,.22); background: ${isDark ? '#161D33' : '#fff'}; }
    .maplibregl-popup-anchor-bottom .maplibregl-popup-tip { border-top-color: ${isDark ? '#161D33' : '#fff'}; }
    .maplibregl-popup-anchor-top .maplibregl-popup-tip { border-bottom-color: ${isDark ? '#161D33' : '#fff'}; }
    .maplibregl-popup-close-button { color: ${isDark ? '#9aa3bd' : '#8a8a8a'}; font-size: 18px; padding: 2px 8px 0 0; }
    .eq-popup-title { font-weight: 800; color: ${isDark ? '#fff' : NAVY}; font-size: 14px; }
    .eq-popup-sub { color: ${isDark ? '#B9C0D4' : '#5a6070'}; font-size: 12px; margin-top: 3px; }
    .eq-popup-sub .star { color: ${GOLD}; }
    .eq-popup-btn { display: inline-block; margin-top: 10px; padding: 7px 14px; background: linear-gradient(145deg, #2D3E8F, ${NAVY}); color: #fff; border-radius: 10px; font-size: 12px; font-weight: 700; text-decoration: none; box-shadow: 0 2px 6px rgba(30,42,120,.35); }

    .maplibregl-ctrl-group { border-radius: 10px !important; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.2) !important; border: none !important; }
    .maplibregl-ctrl-group button { background: ${isDark ? '#161D33' : '#fff'}; width: 34px; height: 34px; }
    .maplibregl-ctrl-group button + button { border-top: 1px solid ${isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'}; }
    .maplibregl-ctrl-icon { filter: ${isDark ? 'invert(1)' : 'none'}; }
    .maplibregl-ctrl-attrib { background: ${isDark ? 'rgba(11,16,32,.7)' : 'rgba(255,255,255,.7)'} !important; }
    .maplibregl-ctrl-attrib, .maplibregl-ctrl-attrib a { color: ${isDark ? '#8A93AD' : '#8a8a8a'} !important; font-size: 10px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script>
    (function () {
      var DATA = ${dataJson};

      function rasterStyle(dark) {
        var base = dark
          ? 'https://SUB.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
          : 'https://SUB.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
        function u(sub) { return base.replace('SUB', sub); }
        return {
          version: 8,
          sources: { carto: { type: 'raster', tileSize: 256, tiles: [u('a'), u('b'), u('c'), u('d')], attribution: '&copy; OpenStreetMap &copy; CARTO' } },
          layers: [{ id: 'carto', type: 'raster', source: 'carto' }]
        };
      }

      var style = DATA.key
        ? ('https://api.maptiler.com/maps/' + (DATA.isDark ? 'streets-v2-dark' : 'streets-v2') + '/style.json?key=' + DATA.key)
        : rasterStyle(DATA.isDark);

      var map = new maplibregl.Map({
        container: 'map', style: style,
        center: [DATA.center[1], DATA.center[0]], zoom: 11,
        attributionControl: false, dragRotate: false, pitchWithRotate: false
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

      function post(msg) { if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } }
      window.__eqOpen = function (id) { post({ type: 'open', id: id }); };

      map.on('load', function () {
        var pts = [];

        // Point utilisateur (marqueur DOM)
        if (DATA.user) {
          var uel = document.createElement('div');
          uel.className = 'eq-user';
          uel.innerHTML = '<div class="pulse"></div><div class="dot"></div>';
          new maplibregl.Marker({ element: uel, anchor: 'center' }).setLngLat([DATA.user.longitude, DATA.user.latitude]).addTo(map);
          pts.push([DATA.user.longitude, DATA.user.latitude]);
        }

        // Source clusterisée
        var coll = { type: 'FeatureCollection', features: DATA.markers.map(function (m) {
          pts.push([m.lng, m.lat]);
          return { type: 'Feature', geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
                   properties: { id: m.id, name: m.name, rating: m.rating, distance: (m.distance == null ? -1 : m.distance) } };
        }) };
        map.addSource('restaurants', { type: 'geojson', data: coll, cluster: true, clusterRadius: 50, clusterMaxZoom: 14 });
        // Couche invisible : garantit le chargement des tuiles de la source (pour querySourceFeatures).
        map.addLayer({ id: 'restaurants-src', type: 'circle', source: 'restaurants', paint: { 'circle-radius': 0, 'circle-opacity': 0 } });

        var domMarkers = {};

        function popupHtml(pr) {
          var hasRating = pr.rating > 0;
          var distTxt = (pr.distance != null && pr.distance >= 0) ? (' \u00b7 ' + Number(pr.distance).toFixed(1) + ' km') : '';
          var sub = hasRating ? ('<span class="star">\u2605</span> ' + Number(pr.rating).toFixed(1)) : DATA.labels.notRated;
          return '<div class="eq-popup-title">' + pr.name + '</div>' +
                 '<div class="eq-popup-sub">' + sub + distTxt + '</div>' +
                 '<a class="eq-popup-btn" href="#" onclick="window.__eqOpen(\\'' + pr.id + '\\');return false;">' + DATA.labels.seeMenu + '</a>';
        }

        function makePin(pr, coords) {
          var hasRating = pr.rating > 0;
          var ratingTxt = hasRating ? Number(pr.rating).toFixed(1) : '';
          var el = document.createElement('div');
          el.className = 'eq-pin-wrap';
          el.innerHTML = '<div class="eq-pin' + (hasRating ? '' : ' empty') + '"><span>' + ratingTxt + '</span></div>';
          var popup = new maplibregl.Popup({ offset: 26, closeButton: true, maxWidth: '240px' }).setHTML(popupHtml(pr));
          return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(coords).setPopup(popup).addTo(map);
        }

        function makeCluster(count, clusterId, coords) {
          var size = count < 10 ? 36 : (count < 50 ? 44 : 52);
          var el = document.createElement('div');
          el.className = 'eq-cluster';
          el.style.width = size + 'px'; el.style.height = size + 'px';
          el.innerHTML = '<span>' + count + '</span>';
          el.addEventListener('click', function () {
            var src = map.getSource('restaurants');
            src.getClusterExpansionZoom(clusterId).then(function (zoom) {
              map.easeTo({ center: coords, zoom: zoom });
            }).catch(function () {});
          });
          return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(coords).addTo(map);
        }

        function sync() {
          if (!map.getSource('restaurants')) return;
          var features = map.querySourceFeatures('restaurants');
          var next = {};
          features.forEach(function (f) {
            var pr = f.properties;
            var key = pr.cluster ? ('c' + pr.cluster_id) : ('p' + pr.id);
            if (next[key]) return;
            next[key] = true;
            if (domMarkers[key]) return;
            var coords = f.geometry.coordinates;
            domMarkers[key] = pr.cluster ? makeCluster(pr.point_count, pr.cluster_id, coords) : makePin(pr, coords);
          });
          Object.keys(domMarkers).forEach(function (k) {
            if (!next[k]) { domMarkers[k].remove(); delete domMarkers[k]; }
          });
        }

        map.on('data', function (e) { if (e.sourceId === 'restaurants' && e.isSourceLoaded) sync(); });
        map.on('moveend', sync);

        // Cadrage initial : ville + villages proches, sans sur-zoomer.
        if (pts.length > 1) {
          var b = new maplibregl.LngLatBounds(pts[0], pts[0]);
          pts.forEach(function (pp) { b.extend(pp); });
          map.fitBounds(b, { padding: 70, maxZoom: 12.5, duration: 0 });
        } else if (pts.length === 1) {
          map.jumpTo({ center: pts[0], zoom: 12 });
        }

        map.once('idle', sync);
        post({ type: 'ready' });
      });
    })();
  </script>
</body>
</html>`;
}

export const RestaurantMap: React.FC<RestaurantMapProps> = ({
  restaurants,
  userLocation,
  height = 320,
  fill = false,
  onSelectRestaurant,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const maptilerKey = process.env.EXPO_PUBLIC_MAPTILER_KEY || '';
  const markers = useMemo<Marker[]>(
    () =>
      restaurants
        .filter((r) => r.latitude != null && r.longitude != null)
        .map((r) => ({
          id: String(r.id),
          name: r.name,
          lat: Number(r.latitude),
          lng: Number(r.longitude),
          rating: Number(r.rating ?? 0),
          distance: r.distance_km ?? null,
        })),
    [restaurants]
  );

  const html = useMemo(
    () =>
      buildHtml(
        markers,
        userLocation ?? null,
        {
          seeMenu: t('restaurantMap.seeMenu'),
          notRated: t('restaurantMap.notRatedYet'),
        },
        isDark,
        maptilerKey
      ),
    [markers, userLocation, t, isDark, maptilerKey]
  );

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg?.type === 'open' && msg.id && onSelectRestaurant) {
        onSelectRestaurant(String(msg.id));
      }
    } catch {
      // message non-JSON ignoré
    }
  };

  if (markers.length === 0 && !userLocation) {
    return (
      <View style={[styles.empty, fill ? styles.fillFlex : { height }, { backgroundColor: colors.surface }]}>
        <Text style={[styles.emptyText, { color: colors.text.secondary }]}>
          {t('restaurantMap.empty')}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, fill ? styles.fillFlex : { height }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
        style={styles.webview}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  fillFlex: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    width: '100%',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,42,120,0.05)',
  },
  emptyText: { color: '#666', fontSize: 14 },
});

export default RestaurantMap;