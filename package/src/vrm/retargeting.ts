import type { Float3, Float4 } from '../types'
import type { VRMNodeConstraintAimAxis, VRMNodeConstraintRollAxis } from './types'

export function normalizeQuat(quat: Float4): Float4 {
  'worklet'
  const length = Math.hypot(quat[0], quat[1], quat[2], quat[3])
  if (length === 0) return [0, 0, 0, 1]
  return [quat[0] / length, quat[1] / length, quat[2] / length, quat[3] / length]
}

export function invertQuat(quat: Float4): Float4 {
  'worklet'
  return [-quat[0], -quat[1], -quat[2], quat[3]]
}

export function multiplyQuat(a: Float4, b: Float4): Float4 {
  'worklet'
  return normalizeQuat([
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ])
}

export function rotateVectorByQuat(vector: Float3, quat: Float4): Float3 {
  'worklet'
  const [x, y, z] = vector
  const [qx, qy, qz, qw] = quat
  const tx = 2 * (qy * z - qz * y)
  const ty = 2 * (qz * x - qx * z)
  const tz = 2 * (qx * y - qy * x)

  return [
    x + qw * tx + qy * tz - qz * ty,
    y + qw * ty + qz * tx - qx * tz,
    z + qw * tz + qx * ty - qy * tx,
  ]
}

export function quatFromUnitVectors(from: Float3, to: Float3): Float4 {
  'worklet'
  const dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2]
  if (dot < -0.999999) {
    const axis: Float3 = Math.abs(from[0]) > Math.abs(from[2]) ? [-from[1], from[0], 0] : [0, -from[2], from[1]]
    const length = Math.hypot(axis[0], axis[1], axis[2]) || 1
    return [axis[0] / length, axis[1] / length, axis[2] / length, 0]
  }

  return normalizeQuat([
    from[1] * to[2] - from[2] * to[1],
    from[2] * to[0] - from[0] * to[2],
    from[0] * to[1] - from[1] * to[0],
    1 + dot,
  ])
}

function getAimAxisVector(axis: VRMNodeConstraintAimAxis): Float3 {
  'worklet'
  if (axis === 'NegativeX') return [-1, 0, 0]
  if (axis === 'PositiveY') return [0, 1, 0]
  if (axis === 'NegativeY') return [0, -1, 0]
  if (axis === 'PositiveZ') return [0, 0, 1]
  if (axis === 'NegativeZ') return [0, 0, -1]
  return [1, 0, 0]
}

function getRollAxisVector(axis: VRMNodeConstraintRollAxis): Float3 {
  'worklet'
  if (axis === 'Y') return [0, 1, 0]
  if (axis === 'Z') return [0, 0, 1]
  return [1, 0, 0]
}

export function slerpQuat(a: Float4, b: Float4, t: number): Float4 {
  'worklet'
  let bx = b[0]
  let by = b[1]
  let bz = b[2]
  let bw = b[3]
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw

  if (dot < 0) {
    dot = -dot
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }

  if (dot > 0.9995) {
    return normalizeQuat([
      a[0] + t * (bx - a[0]),
      a[1] + t * (by - a[1]),
      a[2] + t * (bz - a[2]),
      a[3] + t * (bw - a[3]),
    ])
  }

  const theta0 = Math.acos(Math.max(-1, Math.min(1, dot)))
  const theta = theta0 * t
  const sinTheta = Math.sin(theta)
  const sinTheta0 = Math.sin(theta0)
  const scaleA = Math.cos(theta) - dot * sinTheta / sinTheta0
  const scaleB = sinTheta / sinTheta0

  return normalizeQuat([scaleA * a[0] + scaleB * bx, scaleA * a[1] + scaleB * by, scaleA * a[2] + scaleB * bz, scaleA * a[3] + scaleB * bw])
}

export function scaleTranslationDelta(animated: Float3, rest: Float3, targetRest: Float3, scale: number, flipXZ = false): Float3 {
  'worklet'
  const x = (animated[0] - rest[0]) * scale
  const y = (animated[1] - rest[1]) * scale
  const z = (animated[2] - rest[2]) * scale

  return [
    targetRest[0] + (flipXZ ? -x : x),
    targetRest[1] + y,
    targetRest[2] + (flipXZ ? -z : z),
  ]
}

export function flipVRM0NormalizedRotation(rotation: Float4): Float4 {
  'worklet'
  return [-rotation[0], rotation[1], -rotation[2], rotation[3]]
}

export function retargetRotationConstraint(
  sourceAnimatedLocalRotation: Float4,
  sourceRestLocalRotation: Float4,
  targetRestLocalRotation: Float4,
  weight: number
): Float4 {
  'worklet'
  const delta = multiplyQuat(invertQuat(sourceRestLocalRotation), sourceAnimatedLocalRotation)
  const weightedDelta = weight >= 1 ? delta : slerpQuat([0, 0, 0, 1], delta, Math.max(0, Math.min(1, weight)))
  return multiplyQuat(targetRestLocalRotation, weightedDelta)
}

export function retargetRollConstraint(
  sourceAnimatedLocalRotation: Float4,
  sourceRestLocalRotation: Float4,
  targetRestLocalRotation: Float4,
  rollAxis: VRMNodeConstraintRollAxis,
  weight: number
): Float4 {
  'worklet'
  const axis = getRollAxisVector(rollAxis)
  const deltaSource = multiplyQuat(invertQuat(sourceRestLocalRotation), sourceAnimatedLocalRotation)
  const deltaSourceInParent = multiplyQuat(multiplyQuat(sourceRestLocalRotation, deltaSource), invertQuat(sourceRestLocalRotation))
  const deltaSourceInTarget = multiplyQuat(multiplyQuat(invertQuat(targetRestLocalRotation), deltaSourceInParent), targetRestLocalRotation)
  const toVector = rotateVectorByQuat(axis, deltaSourceInTarget)
  const fromTo = quatFromUnitVectors(axis, toVector)
  const targetRotation = multiplyQuat(targetRestLocalRotation, multiplyQuat(invertQuat(fromTo), deltaSourceInTarget))

  return weight >= 1 ? targetRotation : slerpQuat(targetRestLocalRotation, targetRotation, Math.max(0, Math.min(1, weight)))
}

export function retargetAimConstraint(
  sourceWorldTranslation: Float3,
  targetWorldTranslation: Float3,
  targetRestLocalRotation: Float4,
  targetParentWorldRotation: Float4,
  aimAxis: VRMNodeConstraintAimAxis,
  weight: number
): Float4 {
  'worklet'
  const axis = getAimAxisVector(aimAxis)
  const restWorldRotation = multiplyQuat(targetParentWorldRotation, targetRestLocalRotation)
  const fromVector = rotateVectorByQuat(axis, restWorldRotation)
  const toVector = normalizeVec3([
    sourceWorldTranslation[0] - targetWorldTranslation[0],
    sourceWorldTranslation[1] - targetWorldTranslation[1],
    sourceWorldTranslation[2] - targetWorldTranslation[2],
  ])
  const fromTo = quatFromUnitVectors(fromVector, toVector)
  const targetRotation = multiplyQuat(multiplyQuat(multiplyQuat(invertQuat(targetParentWorldRotation), fromTo), targetParentWorldRotation), targetRestLocalRotation)

  return weight >= 1 ? targetRotation : slerpQuat(targetRestLocalRotation, targetRotation, Math.max(0, Math.min(1, weight)))
}

function normalizeVec3(vector: Float3): Float3 {
  'worklet'
  const length = Math.hypot(vector[0], vector[1], vector[2])
  if (length <= 0.000001) return [0, 0, 1]
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

export function retargetLocalRotation(
  sourceAnimatedLocalRotation: Float4,
  sourceRestLocalRotation: Float4,
  sourceRestWorldRotation: Float4,
  targetRestLocalRotation: Float4,
  targetRestWorldRotation: Float4
): Float4 {
  'worklet'
  const normalizedRotation = normalizeLocalRotation(sourceAnimatedLocalRotation, sourceRestLocalRotation, sourceRestWorldRotation)

  return denormalizeLocalRotation(normalizedRotation, targetRestLocalRotation, targetRestWorldRotation)
}

export function normalizeLocalRotation(
  sourceAnimatedLocalRotation: Float4,
  sourceRestLocalRotation: Float4,
  sourceRestWorldRotation: Float4
): Float4 {
  'worklet'
  return multiplyQuat(
    multiplyQuat(multiplyQuat(sourceRestWorldRotation, invertQuat(sourceRestLocalRotation)), sourceAnimatedLocalRotation),
    invertQuat(sourceRestWorldRotation)
  )
}

export function denormalizeLocalRotation(
  normalizedRotation: Float4,
  targetRestLocalRotation: Float4,
  targetRestWorldRotation: Float4
): Float4 {
  'worklet'
  return multiplyQuat(
    multiplyQuat(multiplyQuat(targetRestLocalRotation, invertQuat(targetRestWorldRotation)), normalizedRotation),
    targetRestWorldRotation
  )
}
