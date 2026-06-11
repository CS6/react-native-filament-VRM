import type { VRMGltfJson, VRMNodeConstraintBinding } from './types'

function getNodeRotation(gltf: VRMGltfJson, nodeIndex: number | undefined) {
  if (nodeIndex == null) return undefined
  return gltf.nodes?.[nodeIndex]?.rotation ?? [0, 0, 0, 1]
}

function getNodeName(gltf: VRMGltfJson, nodeIndex: number | undefined): string | undefined {
  if (nodeIndex == null) return undefined
  return gltf.nodes?.[nodeIndex]?.name
}

export function createVRMNodeConstraintBindings(gltf: VRMGltfJson): VRMNodeConstraintBinding[] {
  const bindings: VRMNodeConstraintBinding[] = []

  for (const [targetIndex, node] of (gltf.nodes ?? []).entries()) {
    const rotation = node.extensions?.VRMC_node_constraint?.constraint?.rotation
    if (rotation?.source == null) continue

    const sourceName = getNodeName(gltf, rotation.source)
    const targetName = getNodeName(gltf, targetIndex)
    const sourceRestLocalRotation = getNodeRotation(gltf, rotation.source)
    const targetRestLocalRotation = getNodeRotation(gltf, targetIndex)
    if (sourceName == null || targetName == null || sourceRestLocalRotation == null || targetRestLocalRotation == null) continue

    bindings.push({
      sourceName,
      targetName,
      weight: rotation.weight ?? 1,
      sourceRestLocalRotation,
      targetRestLocalRotation,
    })
  }

  return bindings
}
