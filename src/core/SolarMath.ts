import * as THREE from "three";

/**
 * Result structure of detailed solar position and ephemeris calculation.
 */
export interface SolarPositionResult {
  /**
   * Normalized unit direction vector [x, y, z] pointing from the ground towards the sun.
   * Coordinate system: Three.js standard Y-up (X = East/West, Y = Up, Z = North/South).
   */
  direction: THREE.Vector3;

  /** Solar azimuth angle in radians [0, 2*PI), measured clockwise from North. */
  azimuth: number;

  /** Solar elevation angle in radians [-PI/2, PI/2] above the local horizon. */
  elevation: number;

  /** Solar azimuth angle in degrees [0, 360). */
  azimuthDeg: number;

  /** Solar elevation angle in degrees [-90, 90]. */
  elevationDeg: number;

  /** Solar zenith angle in degrees [0, 180] (90° - elevationDeg). */
  zenithDeg: number;

  /** Solar declination angle in degrees. */
  declinationDeg: number;

  /** Solar hour angle in degrees (0° at solar noon, negative in morning, positive in afternoon). */
  hourAngleDeg: number;

  /** True if the sun is above the local geometric horizon (elevation > 0). */
  isDaylight: boolean;

  /**
   * Estimated Direct Normal Irradiance (DNI) in W/m² under clear-sky conditions.
   * Computed via Kasten-Young air mass attenuation. 0 W/m² at night.
   */
  dni: number;
}

/**
 * Converts degrees to radians.
 */
const DEG2RAD = Math.PI / 180;

/**
 * Converts radians to degrees.
 */
const RAD2DEG = 180 / Math.PI;

/**
 * Solar constant in W/m² (total extraterrestrial solar irradiance at 1 AU).
 */
const SOLAR_CONSTANT = 1361.0;

/**
 * Calculates Direct Normal Irradiance (DNI) in W/m² using an atmospheric clear-sky model
 * with Kasten-Young air mass attenuation and extraterrestrial orbital eccentricity.
 *
 * @param elevationRad Solar elevation angle in radians
 * @param dayOfYear Day of year [1, 366]
 * @returns Direct Normal Irradiance in W/m²
 */
export function calculateDNI(elevationRad: number, dayOfYear: number): number {
  if (elevationRad <= 0) {
    return 0;
  }

  // Extraterrestrial irradiance accounting for Earth's orbital eccentricity
  const b = (2 * Math.PI * (dayOfYear - 1)) / 365;
  const extraterrestrialIrradiance =
    SOLAR_CONSTANT * (1.00011 + 0.034221 * Math.cos(b) + 0.00128 * Math.sin(b) + 0.000719 * Math.cos(2 * b) + 0.000077 * Math.sin(2 * b));

  const elevationDeg = elevationRad * RAD2DEG;

  // Kasten-Young (1989) empirical formulation for relative optical air mass
  const airMass =
    1.0 / (Math.sin(elevationRad) + 0.50572 * Math.pow(Math.max(0.001, elevationDeg + 6.07995), -1.6364));

  // Meinel and Meinel clear-sky atmospheric transmittance model
  const dni = extraterrestrialIrradiance * Math.pow(0.7, Math.pow(Math.max(1.0, airMass), 0.678));

  return Math.max(0, dni);
}

/**
 * Computes complete ephemeris and solar positioning for given geographic coordinates and time.
 *
 * Implements Spencer's Fourier Series for high-precision declination and Equation of Time,
 * paired with standard NREL Solar Position Algorithm (SPA) spherical trigonometry.
 *
 * @param latitude Geographic latitude in decimal degrees [-90, 90] (North is positive)
 * @param longitude Geographic longitude in decimal degrees [-180, 180] (East is positive)
 * @param dayOfYear Day of the year [1, 366]
 * @param timeOfDay Universal Coordinated Time (UTC) in decimal hours [0, 24)
 * @returns Detailed SolarPositionResult object
 */
export function getSolarPosition(
  latitude: number,
  longitude: number,
  dayOfYear: number,
  timeOfDay: number
): SolarPositionResult {
  // Clamp latitude to avoid pole singularities
  const latDeg = Math.max(-89.999, Math.min(89.999, latitude));
  const latRad = latDeg * DEG2RAD;

  // Fractional year / day angle in radians (Spencer 1971)
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (timeOfDay - 12) / 24);

  // Equation of Time (EoT) in minutes
  const eqtime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  // Solar declination in radians (Spencer 1971)
  const declinationRad =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  // Longitude correction: 4 minutes per degree of longitude (positive East)
  const timeOffset = eqtime + 4 * longitude;

  // True Solar Time (TST) in minutes
  let tst = timeOfDay * 60 + timeOffset;
  tst = ((tst % 1440) + 1440) % 1440;

  // Solar hour angle in degrees: 0° at solar noon, 15° per hour
  const hourAngleDeg = tst / 4 - 180;
  const hourAngleRad = hourAngleDeg * DEG2RAD;

  // Solar elevation angle (alpha) via fundamental spherical trigonometry:
  // sin(alpha) = sin(lat)*sin(decl) + cos(lat)*cos(decl)*cos(omega)
  const sinAlpha =
    Math.sin(latRad) * Math.sin(declinationRad) +
    Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad);

  const clampedSinAlpha = Math.max(-1, Math.min(1, sinAlpha));
  const elevationRad = Math.asin(clampedSinAlpha);
  const elevationDeg = elevationRad * RAD2DEG;
  const zenithDeg = 90 - elevationDeg;

  // Solar azimuth angle (gamma_s) measured clockwise from North:
  // Using atan2 for full 4-quadrant precision:
  // sin(gamma_s) * cos(alpha) = -cos(decl) * sin(omega)
  // cos(gamma_s) * cos(alpha) = cos(lat)*sin(decl) - sin(lat)*cos(decl)*cos(omega)
  const yAz = -Math.cos(declinationRad) * Math.sin(hourAngleRad);
  const xAz =
    Math.cos(latRad) * Math.sin(declinationRad) -
    Math.sin(latRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad);

  let azimuthRad = Math.atan2(yAz, xAz);
  if (azimuthRad < 0) {
    azimuthRad += 2 * Math.PI;
  }
  const azimuthDeg = azimuthRad * RAD2DEG;

  // Three.js Y-up coordinate convention defined in Heliosim architecture:
  // X = cos(alpha) * sin(azimuth) (East-West axis)
  // Y = sin(alpha)                (Elevation above horizon, Up axis)
  // Z = cos(alpha) * cos(azimuth) (North-South axis)
  const cosElevation = Math.cos(elevationRad);
  const dirX = cosElevation * Math.sin(azimuthRad);
  const dirY = Math.sin(elevationRad);
  const dirZ = cosElevation * Math.cos(azimuthRad);

  const direction = new THREE.Vector3(dirX, dirY, dirZ).normalize();

  const isDaylight = elevationRad > 0;
  const dni = calculateDNI(elevationRad, dayOfYear);

  return {
    direction,
    azimuth: azimuthRad,
    elevation: elevationRad,
    azimuthDeg,
    elevationDeg,
    zenithDeg,
    declinationDeg: declinationRad * RAD2DEG,
    hourAngleDeg,
    isDaylight,
    dni,
  };
}

/**
 * Calculates the exact normalized directional vector of the sun based on geographic
 * coordinates and temporal inputs.
 *
 * This vector can be directly passed as a uniform to WebGPU raytracing compute shaders
 * and Three.js directional lights.
 *
 * @param latitude Geographic latitude in decimal degrees [-90, 90]
 * @param longitude Geographic longitude in decimal degrees [-180, 180]
 * @param dayOfYear Day of the year [1, 366]
 * @param timeOfDay Universal Coordinated Time (UTC) in decimal hours [0, 24)
 * @returns Normalized THREE.Vector3 defining incident solar ray direction
 */
export function getSunDirection(
  latitude: number,
  longitude: number,
  dayOfYear: number,
  timeOfDay: number
): THREE.Vector3 {
  return getSolarPosition(latitude, longitude, dayOfYear, timeOfDay).direction;
}

/**
 * Calculates day of the year (1-366) from a JavaScript Date.
 *
 * @param date JavaScript Date object (UTC evaluated)
 * @returns Integer day of the year [1, 366]
 */
export function dateToDayOfYear(date: Date): number {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  const currentUTC = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  const diffDays = Math.floor((currentUTC - startOfYear) / (24 * 60 * 60 * 1000));
  return diffDays + 1;
}

/**
 * Calculates decimal UTC hours [0, 24) from a JavaScript Date.
 *
 * @param date JavaScript Date object
 * @returns Decimal time of day in hours [0, 24)
 */
export function dateToTimeOfDay(date: Date): number {
  return (
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3600000
  );
}

/**
 * Convenience helper to calculate sun direction directly from a JavaScript Date object.
 *
 * @param latitude Geographic latitude in decimal degrees [-90, 90]
 * @param longitude Geographic longitude in decimal degrees [-180, 180]
 * @param date JavaScript Date object
 * @returns Normalized THREE.Vector3 pointing toward the sun
 */
export function getSunDirectionFromDate(
  latitude: number,
  longitude: number,
  date: Date
): THREE.Vector3 {
  const dayOfYear = dateToDayOfYear(date);
  const timeOfDay = dateToTimeOfDay(date);
  return getSunDirection(latitude, longitude, dayOfYear, timeOfDay);
}
