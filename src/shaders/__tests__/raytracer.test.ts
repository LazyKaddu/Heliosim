import { describe, it, expect } from "vitest";
import shaderSource from "../raytracer.wgsl?raw";

describe("raytracer.wgsl - WebGPU Compute Shader Pipeline Integrity", () => {
  it("defines SunData matching std140 32-byte layout with multi-bounce parameters", () => {
    expect(shaderSource).toContain("struct SunData {");
    expect(shaderSource).toMatch(/direction:\s*vec4<f32>/);
    expect(shaderSource).toMatch(/params:\s*vec4<f32>/);
  });

  it("defines BVHNode matching 32-byte alignment rules", () => {
    expect(shaderSource).toContain("struct BVHNode {");
    expect(shaderSource).toMatch(/bounds_min:\s*vec3<f32>/);
    expect(shaderSource).toMatch(/left_first:\s*u32/);
    expect(shaderSource).toMatch(/bounds_max:\s*vec3<f32>/);
    expect(shaderSource).toMatch(/primitive_count:\s*u32/);
  });

  it("declares all 5 pipeline bindings in group 0", () => {
    expect(shaderSource).toMatch(/@group\(0\)\s*@binding\(0\)\s*var<storage,\s*read>\s*positions:\s*array<f32>;/);
    expect(shaderSource).toMatch(/@group\(0\)\s*@binding\(1\)\s*var<storage,\s*read>\s*indices:\s*array<u32>;/);
    expect(shaderSource).toMatch(/@group\(0\)\s*@binding\(2\)\s*var<storage,\s*read_write>\s*thermal_heatmap:\s*array<f32>;/);
    expect(shaderSource).toMatch(/@group\(0\)\s*@binding\(3\)\s*var<uniform>\s*sun:\s*SunData;/);
    expect(shaderSource).toMatch(/@group\(0\)\s*@binding\(4\)\s*var<storage,\s*read>\s*bvh_nodes:\s*array<BVHNode>;/);
  });

  it("uses sun vector pointing TOWARD the sun and calculates positive incidence for upward facets", () => {
    // Should NOT invert the sun vector (must use sun.direction.xyz, not -sun.direction)
    expect(shaderSource).toMatch(/let\s+sun_dir\s*=\s*normalize\(sun\.direction\.xyz\);/);
    expect(shaderSource).toMatch(/let\s+direct_incidence\s*=\s*dot\(normal,\s*sun_dir\);/);
    expect(shaderSource).not.toMatch(/let\s+ray_dir\s*=\s*normalize\(-sun\.direction\);/);
  });

  it("implements multi-bounce ray tracing with power attenuation (albedo)", () => {
    // Extracts parameters from sun.params
    expect(shaderSource).toMatch(/let\s+dni\s*=\s*sun\.params\.x;/);
    expect(shaderSource).toMatch(/let\s+time_step\s*=\s*sun\.params\.y;/);
    expect(shaderSource).toMatch(/let\s+albedo\s*=\s*sun\.params\.z;/);
    expect(shaderSource).toMatch(/let\s+max_bounces\s*=\s*u32\(sun\.params\.w\);/);

    // Multi-bounce loop
    expect(shaderSource).toContain("for (var bounce = 1u; bounce <= max_bounces; bounce = bounce + 1u)");
    expect(shaderSource).toContain("throughput = throughput * albedo;");
    expect(shaderSource).toContain("if (throughput < 0.001)");
    expect(shaderSource).toContain("cur_dir = reflect(cur_dir, hit.normal);");
  });

  it("implements robust safeguards against empty BVH and degenerate normals", () => {
    // BVH zero-node safeguard
    expect(shaderSource).toContain("let total_bvh_nodes = arrayLength(&bvh_nodes);");
    expect(shaderSource).toContain("if (total_bvh_nodes == 0u)");

    // Degenerate normal safeguard
    expect(shaderSource).toContain("inverseSqrt(len_sq)");
  });

  it("accumulates physical energy directly into thermal_heatmap", () => {
    expect(shaderSource).toContain("thermal_heatmap[tri_idx] = thermal_heatmap[tri_idx] + total_energy;");
  });
});
