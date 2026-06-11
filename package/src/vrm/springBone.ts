import type { Float3 } from '../types'
import type { VRMGltfJson, VRMSpringBoneBinding, VRMSpringBoneColliderBinding } from './types'

const DEFAULT_GRAVITY_DIR: Float3 = [0, -1, 0]

function getNodeName(gltf: VRMGltfJson, nodeIndex: number | undefined): string | undefined {
  if (nodeIndex == null) return undefined
  return gltf.nodes?.[nodeIndex]?.name
}

function createParentMap(gltf: VRMGltfJson): Map<number, number> {
  const parents = new Map<number, number>()

  for (const [parentIndex, node] of (gltf.nodes ?? []).entries()) {
    for (const childIndex of node.children ?? []) {
      parents.set(childIndex, parentIndex)
    }
  }

  return parents
}

function getColliderBindings(gltf: VRMGltfJson, colliderIndexes: number[]): VRMSpringBoneColliderBinding[] {
  const extension = gltf.extensions?.VRMC_springBone
  const bindings: VRMSpringBoneColliderBinding[] = []

  for (const colliderIndex of colliderIndexes) {
    const collider = extension?.colliders?.[colliderIndex]
    const nodeName = getNodeName(gltf, collider?.node)
    if (collider == null || nodeName == null) continue

    const sphere = collider.shape?.sphere
    if (sphere != null) {
      bindings.push({
        nodeName,
        offset: sphere.offset ?? [0, 0, 0],
        radius: sphere.radius ?? 0,
        type: 'sphere',
      })
      continue
    }

    const capsule = collider.shape?.capsule
    if (capsule != null) {
      bindings.push({
        nodeName,
        offset: capsule.offset ?? [0, 0, 0],
        radius: capsule.radius ?? 0,
        tail: capsule.tail ?? [0, 0, 0],
        type: 'capsule',
      })
    }
  }

  return bindings
}

export function createVRMSpringBoneBindings(gltf: VRMGltfJson): VRMSpringBoneBinding[] {
  const extension = gltf.extensions?.VRMC_springBone
  if (extension?.springs == null) return []

  const parents = createParentMap(gltf)

  return extension.springs.flatMap((spring, springIndex) => {
    const joints = spring.joints ?? []
    const jointBindings = joints.slice(0, -1).flatMap((joint, jointIndex) => {
      const child = joints[jointIndex + 1]
      const nodeName = getNodeName(gltf, joint.node)
      const childName = getNodeName(gltf, child?.node)
      const parentName = getNodeName(gltf, joint.node == null ? undefined : parents.get(joint.node))
      if (nodeName == null || childName == null) return []

      return [
        {
          nodeName,
          childName,
          parentName,
          dragForce: joint.dragForce ?? 0.4,
          gravityDir: joint.gravityDir ?? DEFAULT_GRAVITY_DIR,
          gravityPower: joint.gravityPower ?? 0,
          hitRadius: joint.hitRadius ?? 0,
          stiffness: joint.stiffness ?? 1,
        },
      ]
    })
    if (jointBindings.length === 0) return []

    const colliderIndexes = (spring.colliderGroups ?? []).flatMap((groupIndex) => extension.colliderGroups?.[groupIndex]?.colliders ?? [])

    return [
      {
        name: spring.name ?? `spring-${springIndex}`,
        centerName: getNodeName(gltf, spring.center),
        joints: jointBindings,
        colliders: getColliderBindings(gltf, colliderIndexes),
      },
    ]
  })
}
