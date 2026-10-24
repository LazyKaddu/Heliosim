import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  getSunDirection,
  getSolarPosition,
  calculateDNI,
  dateToDayOfYear,
  dateToTimeOfDay,
  getSunDirectionFromDate,
} from "../SolarMath.ts";

describe("SolarMath - Solar Position Algorithm (SPA)", () => {
  describe("getSunDirection", () => {
    it("returns a normalized unit Vector3 with length 1.0", () => {
      const dir = getSunDirection(40.7128, -74.006, 172, 14.5);
      expect(dir).toBeInstanceOf(THREE.Vector3);
      expect(dir.length()).toBeCloseTo(1.0, 5);
    });

    it("calculates sun nearly overhead at Equator on Vernal Equinox at Solar Noon", () => {
      // Day 80 (~March 21) at 12:00 UTC on 0° Lat, 0° Lon
      const pos = getSolarPosition(0, 0, 80, 12);
      expect(pos.elevationDeg).toBeGreaterThan(85);
      expect(pos.direction.y).toBeGreaterThan(0.99);
      expect(pos.isDaylight).toBe(true);
    });

    it("calculates sun directly overhead at Tropic of Cancer on Summer Solstice at Noon", () => {
      // Day 172 (~June 21) at 12:00 UTC on 23.44° Lat, 0° Lon
      const pos = getSolarPosition(23.44, 0, 172, 12);
      expect(pos.elevationDeg).toBeGreaterThan(88);
      expect(pos.direction.y).toBeCloseTo(1.0, 2);
      expect(pos.isDaylight).toBe(true);
    });

    it("calculates sun directly overhead at Tropic of Capricorn on Winter Solstice at Noon", () => {
      // Day 355 (~Dec 21) at 12:00 UTC on -23.44° Lat, 0° Lon
      const pos = getSolarPosition(-23.44, 0, 355, 12);
      expect(pos.elevationDeg).toBeGreaterThan(88);
      expect(pos.direction.y).toBeCloseTo(1.0, 2);
      expect(pos.isDaylight).toBe(true);
    });

    it("calculates negative Y and non-daylight at midnight", () => {
      const pos = getSolarPosition(0, 0, 80, 0); // 00:00 UTC
      expect(pos.elevationDeg).toBeLessThan(0);
      expect(pos.direction.y).toBeLessThan(0);
      expect(pos.isDaylight).toBe(false);
      expect(pos.dni).toBe(0);
    });

    it("maintains unit vector length across various global coordinates", () => {
      const testCoordinates = [
        { lat: 51.5074, lon: -0.1278, day: 100, time: 10 }, // London
        { lat: 35.6762, lon: 139.6503, day: 200, time: 3 }, // Tokyo
        { lat: -33.8688, lon: 151.2093, day: 300, time: 2 }, // Sydney
        { lat: 78.2232, lon: 15.6267, day: 172, time: 12 }, // Longyearbyen (Arctic)
      ];

      for (const coords of testCoordinates) {
        const dir = getSunDirection(coords.lat, coords.lon, coords.day, coords.time);
        expect(dir.length()).toBeCloseTo(1.0, 5);
      }
    });
  });

  describe("getSolarPosition ephemeris", () => {
    it("maintains zenithDeg + elevationDeg = 90°", () => {
      const pos = getSolarPosition(37.7749, -122.4194, 150, 16);
      expect(pos.zenithDeg + pos.elevationDeg).toBeCloseTo(90.0, 4);
    });

    it("keeps azimuthDeg within [0, 360)", () => {
      for (let hour = 0; hour < 24; hour += 2) {
        const pos = getSolarPosition(12.9716, 77.5946, 90, hour);
        expect(pos.azimuthDeg).toBeGreaterThanOrEqual(0);
        expect(pos.azimuthDeg).toBeLessThan(360);
      }
    });

    it("computes solar declination within Earth tilt bounds [-23.5°, +23.5°]", () => {
      for (let day = 1; day <= 365; day += 30) {
        const pos = getSolarPosition(0, 0, day, 12);
        expect(pos.declinationDeg).toBeGreaterThanOrEqual(-23.6);
        expect(pos.declinationDeg).toBeLessThanOrEqual(23.6);
      }
    });
  });

  describe("calculateDNI", () => {
    it("returns 0 W/m² when sun is at or below the horizon", () => {
      expect(calculateDNI(0, 100)).toBe(0);
      expect(calculateDNI(-0.5, 100)).toBe(0);
      expect(calculateDNI(-Math.PI / 2, 100)).toBe(0);
    });

    it("returns realistic physical solar irradiance values for clear sky overhead", () => {
      // 90° elevation (overhead) at vernal equinox
      const dni = calculateDNI(Math.PI / 2, 80);
      // Realistic clear-sky DNI at sea level is typically 800 - 1050 W/m²
      expect(dni).toBeGreaterThan(800);
      expect(dni).toBeLessThan(1100);
    });

    it("scales monotonically with elevation angle", () => {
      const lowAngleDNI = calculateDNI(15 * (Math.PI / 180), 100);
      const midAngleDNI = calculateDNI(45 * (Math.PI / 180), 100);
      const highAngleDNI = calculateDNI(75 * (Math.PI / 180), 100);

      expect(lowAngleDNI).toBeLessThan(midAngleDNI);
      expect(midAngleDNI).toBeLessThan(highAngleDNI);
    });
  });

  describe("Date utilities", () => {
    it("correctly computes dayOfYear for known calendar dates", () => {
      expect(dateToDayOfYear(new Date(Date.UTC(2026, 0, 1)))).toBe(1); // Jan 1
      expect(dateToDayOfYear(new Date(Date.UTC(2026, 0, 31)))).toBe(31); // Jan 31
      expect(dateToDayOfYear(new Date(Date.UTC(2026, 1, 1)))).toBe(32); // Feb 1
      expect(dateToDayOfYear(new Date(Date.UTC(2026, 11, 31)))).toBe(365); // Dec 31 (non-leap year)
    });

    it("correctly computes timeOfDay decimal hours", () => {
      expect(dateToTimeOfDay(new Date(Date.UTC(2026, 5, 15, 0, 0, 0)))).toBe(0.0);
      expect(dateToTimeOfDay(new Date(Date.UTC(2026, 5, 15, 12, 0, 0)))).toBe(12.0);
      expect(dateToTimeOfDay(new Date(Date.UTC(2026, 5, 15, 14, 30, 0)))).toBe(14.5);
      expect(dateToTimeOfDay(new Date(Date.UTC(2026, 5, 15, 18, 45, 0)))).toBe(18.75);
    });

    it("getSunDirectionFromDate produces identical vector to getSunDirection", () => {
      const date = new Date(Date.UTC(2026, 5, 21, 15, 30, 0));
      const lat = 48.8566;
      const lon = 2.3522;

      const fromDate = getSunDirectionFromDate(lat, lon, date);
      const direct = getSunDirection(
        lat,
        lon,
        dateToDayOfYear(date),
        dateToTimeOfDay(date)
      );

      expect(fromDate.x).toBeCloseTo(direct.x, 6);
      expect(fromDate.y).toBeCloseTo(direct.y, 6);
      expect(fromDate.z).toBeCloseTo(direct.z, 6);
    });
  });
});
