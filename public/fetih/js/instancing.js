// Instanced drawing for prepared model parts.
// InstancedSkinnedMesh: every instance shares one animated skeleton (lock-step
// animation) so hundreds of soldiers cost one draw call per material.
import * as THREE from 'three';

export class InstancedSkinnedMesh extends THREE.SkinnedMesh {
  constructor(geometry, material, capacity, withColor) {
    super(geometry, material);
    this.isInstancedMesh = true; // renderer path: instancing + skinning
    this.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 16), 16);
    this.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instanceColor = null;
    if (withColor) {
      this.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      this.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.morphTexture = null;
    this.count = 0;
    this.bindMode = THREE.DetachedBindMode;
    this.frustumCulled = false;
  }
  // Bounding volumes are meaningless here (culling disabled).
  computeBoundingBox() { this.boundingBox = new THREE.Box3(); }
  computeBoundingSphere() { this.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); }
  raycast() {}
}

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/**
 * A batch draws many instances of one prepared model (all its parts).
 * Usage per frame (or when dirty): begin(); push(matrix, teamHex) ...; end();
 */
export class Batch {
  /**
   * @param {object} model   prepared model info from Assets
   * @param {number} capacity
   * @param {THREE.Skeleton[]} [skeletons] template skeletons for skinned models
   * @param {Map} materialCache shared material clones keyed by source material
   */
  constructor(model, capacity, skeletons, materialCache) {
    this.capacity = capacity;
    this.count = 0;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    this.meshes = [];
    for (const part of model.parts) {
      let mat = part.material;
      if (part.team) {
        // One white clone per source material: colour comes from instanceColor.
        if (!materialCache.has(mat)) {
          const c = mat.clone();
          c.color.set(0xffffff);
          materialCache.set(mat, c);
        }
        mat = materialCache.get(mat);
      }
      let mesh;
      if (skeletons) {
        mesh = new InstancedSkinnedMesh(part.geometry, mat, capacity, part.team);
        mesh.bind(skeletons[part.skeletonIndex], part.bindMatrix);
      } else {
        mesh = new THREE.InstancedMesh(part.geometry, mat, capacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (part.team) {
          mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
          mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        }
        mesh.frustumCulled = false;
      }
      mesh.count = 0;
      mesh.visible = false;
      mesh.matrixAutoUpdate = false;
      mesh.userData.part = part;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  begin() { this.count = 0; }

  /** @param {THREE.Matrix4} matrix world matrix of the model root, teamHex tint for team parts */
  push(matrix, teamHex = 0xffffff) {
    if (this.count >= this.capacity) return false;
    const i = this.count++;
    for (const mesh of this.meshes) {
      const part = mesh.userData.part;
      if (part.bindMatrix) _m.multiplyMatrices(matrix, part.bindMatrix).toArray(mesh.instanceMatrix.array, i * 16);
      else matrix.toArray(mesh.instanceMatrix.array, i * 16);
      if (mesh.instanceColor) {
        _c.setHex(teamHex);
        const s = part.shade;
        mesh.instanceColor.array[i * 3] = _c.r * s;
        mesh.instanceColor.array[i * 3 + 1] = _c.g * s;
        mesh.instanceColor.array[i * 3 + 2] = _c.b * s;
      }
    }
    return true;
  }

  end() {
    for (const mesh of this.meshes) {
      mesh.count = this.count;
      mesh.visible = this.count > 0;
      if (this.count > 0) {
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, this.count * 16);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
          mesh.instanceColor.clearUpdateRanges();
          mesh.instanceColor.addUpdateRange(0, this.count * 3);
          mesh.instanceColor.needsUpdate = true;
        }
      }
    }
  }
}

/** Fast TRS matrix with yaw-only rotation and uniform scale. */
export function setYawMatrix(m, x, y, z, yaw, s, sy = s) {
  const c = Math.cos(yaw) * s; const n = Math.sin(yaw) * s;
  const e = m.elements;
  e[0] = c; e[1] = 0; e[2] = -n; e[3] = 0;
  e[4] = 0; e[5] = sy; e[6] = 0; e[7] = 0;
  e[8] = n; e[9] = 0; e[10] = c; e[11] = 0;
  e[12] = x; e[13] = y; e[14] = z; e[15] = 1;
  return m;
}
