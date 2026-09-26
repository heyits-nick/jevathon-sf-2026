/** Per-tab trip credentials. Tokens live only in sessionStorage, scoped to their trip ID. */

const CURRENT_TRIP_KEY = "menucheck:current-trip";
const tokenKey = (tripId: string) => `menucheck:trip-token:${tripId}`;

export interface TripSession {
  tripId: string;
  token: string;
}

const storage = () => (typeof window === "undefined" ? null : window.sessionStorage);

export function loadTripSession(): TripSession | null {
  const store = storage();
  const tripId = store?.getItem(CURRENT_TRIP_KEY);
  const token = tripId ? store?.getItem(tokenKey(tripId)) : null;
  return tripId && token ? { tripId, token } : null;
}

export function saveTripSession({ tripId, token }: TripSession) {
  const store = storage();
  store?.setItem(tokenKey(tripId), token);
  store?.setItem(CURRENT_TRIP_KEY, tripId);
}

export function clearTripSession() {
  const store = storage();
  const tripId = store?.getItem(CURRENT_TRIP_KEY);
  if (tripId) store?.removeItem(tokenKey(tripId));
  store?.removeItem(CURRENT_TRIP_KEY);
}
