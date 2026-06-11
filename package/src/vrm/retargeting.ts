import type { Float3, Float4 } from '../types'

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
