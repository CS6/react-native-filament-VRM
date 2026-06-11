import type { VRMGltfJson, VRMNodeConstraintBinding } from './types'

function getNodeRotation(gltf: VRMGltfJson, nodeIndex: number | undefined) {
  if (nodeIndex == null) return undefined
  return gltf.nodes?.[nodeIndex]?.rotation ?? [0, 0, 0, 1]
}

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

export function createVRMNodeConstraintBindings(gltf: VRMGltfJson): VRMNodeConstraintBinding[] {
  const bindings: VRMNodeConstraintBinding[] = []
  const parents = createParentMap(gltf)

  for (const [targetIndex, node] of (gltf.nodes ?? []).entries()) {
    const constraint = node.extensions?.VRMC_node_constraint?.constraint
    if (constraint == null) continue

    const rotation = constraint.rotation
    const aim = constraint.aim
    const roll = constraint.roll
    const typedConstraint =
      rotation?.source != null
        ? { axis: undefined, source: rotation.source, type: 'rotation' as const, weight: rotation.weight ?? 1 }
        : aim?.source != null && aim.aimAxis != null
          ? { axis: aim.aimAxis, source: aim.source, type: 'aim' as const, weight: aim.weight ?? 1 }
          : roll?.source != null && roll.rollAxis != null
            ? { axis: roll.rollAxis, source: roll.source, type: 'roll' as const, weight: roll.weight ?? 1 }
            : undefined
    if (typedConstraint == null) continue

    const sourceName = getNodeName(gltf, typedConstraint.source)
    const targetName = getNodeName(gltf, targetIndex)
    const sourceRestLocalRotation = getNodeRotation(gltf, typedConstraint.source)
    const targetRestLocalRotation = getNodeRotation(gltf, targetIndex)
    if (sourceName == null || targetName == null || sourceRestLocalRotation == null || targetRestLocalRotation == null) continue

    bindings.push({
      axis: typedConstraint.axis,
      sourceName,
      targetParentName: getNodeName(gltf, parents.get(targetIndex)),
      targetName,
      type: typedConstraint.type,
      weight: typedConstraint.weight,
      sourceRestLocalRotation,
      targetRestLocalRotation,
    })
  }

  return bindings
}
