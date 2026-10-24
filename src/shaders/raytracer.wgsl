// Solar ephemeris and physical parameters (std140 32-byte layout)
struct SunData {
    direction: vec4<f32>, // xyz = sun unit direction vector (pointing TOWARD the sun), w = unused
    params: vec4<f32>,    // x = DNI (W/m²), y = timeStep (hours), z = albedo (0.0..1.0), w = max_bounces (e.g. 5.0)
}

// Linear BVH Node matching 32-byte alignment
struct BVHNode {
    bounds_min: vec3<f32>,
    left_first: u32,       // If primitive_count > 0, triangle index offset. If 0, left child node index.
    bounds_max: vec3<f32>,
    primitive_count: u32,  // If 0, internal node. If > 0, leaf node primitive count.
}

struct HitInfo {
    has_hit: bool,
    t: f32,
    tri_idx: u32,
    pos: vec3<f32>,
    normal: vec3<f32>,
}

@group(0) @binding(0) var<storage, read> positions: array<f32>;
@group(0) @binding(1) var<storage, read> indices: array<u32>;
@group(0) @binding(2) var<storage, read_write> thermal_heatmap: array<f32>;
@group(0) @binding(3) var<uniform> sun: SunData;
@group(0) @binding(4) var<storage, read> bvh_nodes: array<BVHNode>;

const EPSILON: f32 = 0.00001;

// Möller–Trumbore Ray-Triangle Intersection: returns positive distance t or -1.0 if miss
fn intersect_triangle_t(origin: vec3<f32>, dir: vec3<f32>, v0: vec3<f32>, v1: vec3<f32>, v2: vec3<f32>) -> f32 {
    let edge1 = v1 - v0;
    let edge2 = v2 - v0;
    let h = cross(dir, edge2);
    let a = dot(edge1, h);

    if (a > -EPSILON && a < EPSILON) { return -1.0; }

    let f = 1.0 / a;
    let s = origin - v0;
    let u = f * dot(s, h);

    if (u < 0.0 || u > 1.0) { return -1.0; }

    let q = cross(s, edge1);
    let v = f * dot(dir, q);

    if (v < 0.0 || u + v > 1.0) { return -1.0; }

    let t = f * dot(edge2, q);
    if (t > EPSILON) {
        return t;
    }
    return -1.0;
}

// Fast AABB (Axis-Aligned Bounding Box) Intersection - "Slab Method"
fn intersect_aabb(origin: vec3<f32>, inv_dir: vec3<f32>, bounds_min: vec3<f32>, bounds_max: vec3<f32>) -> bool {
    let t0 = (bounds_min - origin) * inv_dir;
    let t1 = (bounds_max - origin) * inv_dir;
    
    let tmin = min(t0, t1);
    let tmax = max(t0, t1);
    
    let tnear = max(max(tmin.x, tmin.y), tmin.z);
    let tfar = min(min(tmax.x, tmax.y), tmax.z);
    
    return tnear <= tfar && tfar > 0.0;
}

// Fast shadow ray occlusion test against BVH hierarchy (any-hit test)
fn is_shadowed(origin: vec3<f32>, dir: vec3<f32>, ignore_tri: u32) -> bool {
    let total_bvh_nodes = arrayLength(&bvh_nodes);
    if (total_bvh_nodes == 0u) {
        return false;
    }

    let inv_dir = 1.0 / select(dir, sign(dir) * 1e-6, abs(dir) < 1e-6);

    // Iterative BVH traversal stack (depth 64 supports massive spatial hierarchies)
    var stack: array<u32, 64>;
    var stack_ptr: u32 = 1u;
    stack[0] = 0u;

    while (stack_ptr > 0u) {
        stack_ptr = stack_ptr - 1u;
        let node_idx = stack[stack_ptr];
        let node = bvh_nodes[node_idx];

        // 1. AABB cull
        if (!intersect_aabb(origin, inv_dir, node.bounds_min, node.bounds_max)) {
            continue;
        }

        // 2. Leaf node check
        if (node.primitive_count > 0u) {
            let start_idx = node.left_first;
            let end_idx = start_idx + node.primitive_count;

            for (var i: u32 = start_idx; i < end_idx; i = i + 1u) {
                if (i == ignore_tri) { continue; }

                let i0 = indices[i * 3u] * 3u;
                let i1 = indices[i * 3u + 1u] * 3u;
                let i2 = indices[i * 3u + 2u] * 3u;

                let v0 = vec3<f32>(positions[i0], positions[i0 + 1u], positions[i0 + 2u]);
                let v1 = vec3<f32>(positions[i1], positions[i1 + 1u], positions[i1 + 2u]);
                let v2 = vec3<f32>(positions[i2], positions[i2 + 1u], positions[i2 + 2u]);

                let hit_t = intersect_triangle_t(origin, dir, v0, v1, v2);
                if (hit_t > 0.0) {
                    return true;
                }
            }
        } else {
            // Internal node: push left and right children
            stack[stack_ptr] = node.left_first;
            stack_ptr = stack_ptr + 1u;
            stack[stack_ptr] = node.left_first + 1u;
            stack_ptr = stack_ptr + 1u;
        }
    }

    return false;
}

// Closest-hit BVH traversal for multi-bounce specular & diffuse reflection rays
fn find_closest_hit(origin: vec3<f32>, dir: vec3<f32>, ignore_tri: u32) -> HitInfo {
    var best_hit: HitInfo;
    best_hit.has_hit = false;
    best_hit.t = 1e20;
    best_hit.tri_idx = 0u;
    best_hit.pos = vec3<f32>(0.0);
    best_hit.normal = vec3<f32>(0.0, 1.0, 0.0);

    let total_bvh_nodes = arrayLength(&bvh_nodes);
    if (total_bvh_nodes == 0u) {
        return best_hit;
    }

    let inv_dir = 1.0 / select(dir, sign(dir) * 1e-6, abs(dir) < 1e-6);

    var stack: array<u32, 64>;
    var stack_ptr: u32 = 1u;
    stack[0] = 0u;

    while (stack_ptr > 0u) {
        stack_ptr = stack_ptr - 1u;
        let node_idx = stack[stack_ptr];
        let node = bvh_nodes[node_idx];

        if (!intersect_aabb(origin, inv_dir, node.bounds_min, node.bounds_max)) {
            continue;
        }

        if (node.primitive_count > 0u) {
            let start_idx = node.left_first;
            let end_idx = start_idx + node.primitive_count;

            for (var i: u32 = start_idx; i < end_idx; i = i + 1u) {
                if (i == ignore_tri) { continue; }

                let i0 = indices[i * 3u] * 3u;
                let i1 = indices[i * 3u + 1u] * 3u;
                let i2 = indices[i * 3u + 2u] * 3u;

                let v0 = vec3<f32>(positions[i0], positions[i0 + 1u], positions[i0 + 2u]);
                let v1 = vec3<f32>(positions[i1], positions[i1 + 1u], positions[i1 + 2u]);
                let v2 = vec3<f32>(positions[i2], positions[i2 + 1u], positions[i2 + 2u]);

                let hit_t = intersect_triangle_t(origin, dir, v0, v1, v2);
                if (hit_t > 0.0 && hit_t < best_hit.t) {
                    best_hit.has_hit = true;
                    best_hit.t = hit_t;
                    best_hit.tri_idx = i;
                    best_hit.pos = origin + dir * hit_t;

                    let edge1 = v1 - v0;
                    let edge2 = v2 - v0;
                    let cp = cross(edge1, edge2);
                    let len_sq = dot(cp, cp);
                    if (len_sq > 1e-12) {
                        best_hit.normal = cp * inverseSqrt(len_sq);
                    } else {
                        best_hit.normal = vec3<f32>(0.0, 1.0, 0.0);
                    }
                }
            }
        } else {
            stack[stack_ptr] = node.left_first;
            stack_ptr = stack_ptr + 1u;
            stack[stack_ptr] = node.left_first + 1u;
            stack_ptr = stack_ptr + 1u;
        }
    }

    return best_hit;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let tri_idx = global_id.x;
    let total_indices = arrayLength(&indices);
    let total_triangles = total_indices / 3u;
    
    if (tri_idx >= total_triangles) { return; }

    let i0 = indices[tri_idx * 3u] * 3u;
    let i1 = indices[tri_idx * 3u + 1u] * 3u;
    let i2 = indices[tri_idx * 3u + 2u] * 3u;

    let v0 = vec3<f32>(positions[i0], positions[i0 + 1u], positions[i0 + 2u]);
    let v1 = vec3<f32>(positions[i1], positions[i1 + 1u], positions[i1 + 2u]);
    let v2 = vec3<f32>(positions[i2], positions[i2 + 1u], positions[i2 + 2u]);

    let edge1 = v1 - v0;
    let edge2 = v2 - v0;
    let cp = cross(edge1, edge2);
    let len_sq = dot(cp, cp);
    var normal = vec3<f32>(0.0, 1.0, 0.0);
    if (len_sq > 1e-12) {
        normal = cp * inverseSqrt(len_sq);
    }

    // Solar Ephemeris & Radiometric Parameters
    // sun.direction points FROM surface TOWARD the sun (Y-up convention)
    let sun_dir = normalize(sun.direction.xyz);
    let dni = sun.params.x;
    let time_step = sun.params.y;
    let albedo = sun.params.z;
    let max_bounces = u32(sun.params.w);

    let centroid = (v0 + v1 + v2) / 3.0;
    let facet_origin = centroid + normal * 0.005;

    var total_energy = 0.0;

    // --- Bounce 0: Direct Solar Radiation ---
    let direct_incidence = dot(normal, sun_dir);
    if (direct_incidence > 0.0) {
        if (!is_shadowed(facet_origin, sun_dir, tri_idx)) {
            total_energy = total_energy + dni * direct_incidence * time_step;
        }
    }

    // --- Bounces 1..N: Indirect Inter-Reflection (Urban Canyon & Surface Bounces) ---
    // Ray originates at facet and bounces along reflection vectors, gathering reflected solar energy
    var cur_origin = facet_origin;
    var cur_dir = reflect(-sun_dir, normal); // Outgoing specular reflection vector
    var throughput = albedo;                 // Initial bounce reflection efficiency
    var ignore_id = tri_idx;

    for (var bounce = 1u; bounce <= max_bounces; bounce = bounce + 1u) {
        if (throughput < 0.001) { break; } // Attenuation cut-off

        let hit = find_closest_hit(cur_origin, cur_dir, ignore_id);
        if (!hit.has_hit) { break; } // Escapes into sky/atmosphere

        // Check if the hit surface receives direct sunlight
        let hit_incidence = dot(hit.normal, sun_dir);
        let hit_origin = hit.pos + hit.normal * 0.005;

        if (hit_incidence > 0.0) {
            if (!is_shadowed(hit_origin, sun_dir, hit.tri_idx)) {
                // Hit surface is sunlit, radiating heat back onto this facet
                let incoming = dni * hit_incidence * time_step * throughput;
                total_energy = total_energy + incoming;
            }
        }

        // Advance ray for the next bounce
        cur_origin = hit_origin;
        cur_dir = reflect(cur_dir, hit.normal);
        ignore_id = hit.tri_idx;
        throughput = throughput * albedo; // Power reduced at each bounce
    }

    thermal_heatmap[tri_idx] = thermal_heatmap[tri_idx] + total_energy;
}