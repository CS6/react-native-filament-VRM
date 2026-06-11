import * as React from 'react'
import { useSharedValue } from 'react-native-worklets-core'
import { RenderCallbackContext } from '../react/RenderCallbackContext'
import { useAnimator } from '../hooks/useAnimator'
import { useFilamentContext } from '../hooks/useFilamentContext'
import type { Entity, Float3, Float4 } from '../types'
import type {
  VRMAnimationRetargeterProps,
  VRMExpressionRetargetBinding,
  VRMLookAtExpressionRetargetBinding,
  VRMNodeConstraintRetargetBinding,
  VRMRetargetBinding,
  VRMSpringBoneColliderRetargetBinding,
  VRMSpringBoneRetargetBinding,
} from './types'
import {
  denormalizeLocalRotation,
  flipVRM0NormalizedRotation,
  invertQuat,
  multiplyQuat,
  normalizeLocalRotation,
  quatFromUnitVectors,
  retargetAimConstraint,
  retargetRollConstraint,
  retargetRotationConstraint,
  rotateVectorByQuat,
  scaleTranslationDelta,
} from './retargeting'

type VRMSpringBoneState = Record<string, { previousTail: Float3; tail: Float3 }>

function getEntityMap(entities: Entity[], getEntityName: (entity: Entity) => string | undefined) {
  return new Map(entities.map((entity) => [getEntityName(entity), entity]))
}

function addVec3(a: Float3, b: Float3): Float3 {
  'worklet'
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function subVec3(a: Float3, b: Float3): Float3 {
  'worklet'
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function scaleVec3(vector: Float3, scale: number): Float3 {
  'worklet'
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale]
}

function dotVec3(a: Float3, b: Float3): number {
  'worklet'
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function lengthVec3(vector: Float3): number {
  'worklet'
  return Math.hypot(vector[0], vector[1], vector[2])
}

function normalizeVec3(vector: Float3, fallback: Float3 = [0, 1, 0]): Float3 {
  'worklet'
  const length = lengthVec3(vector)
  if (length <= 0.000001) return fallback
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

function transformPoint(translation: Float3, rotation: Float4, scale: Float3, point: Float3): Float3 {
  'worklet'
  return addVec3(translation, rotateVectorByQuat([point[0] * scale[0], point[1] * scale[1], point[2] * scale[2]], rotation))
}

function closestPointOnSegment(point: Float3, a: Float3, b: Float3): Float3 {
  'worklet'
  const ab = subVec3(b, a)
  const denominator = dotVec3(ab, ab)
  if (denominator <= 0.000001) return a
  const t = Math.max(0, Math.min(1, dotVec3(subVec3(point, a), ab) / denominator))
  return addVec3(a, scaleVec3(ab, t))
}

function pushOutFromSphere(point: Float3, center: Float3, radius: number): Float3 {
  'worklet'
  const offset = subVec3(point, center)
  const distance = lengthVec3(offset)
  if (distance >= radius || radius <= 0) return point
  const direction: Float3 = distance > 0.000001 ? scaleVec3(offset, 1 / distance) : [0, 1, 0]
  return addVec3(center, scaleVec3(direction, radius))
}

function getLookAtAngles(rotation: [number, number, number, number]): { pitchDegrees: number; yawDegrees: number } {
  'worklet'
  const [x, y, z, w] = rotation
  const test = 2 * (w * x - y * z)
  const pitch = Math.asin(Math.max(-1, Math.min(1, test)))
  const yaw = Math.atan2(2 * (w * y + z * x), 1 - 2 * (x * x + y * y))

  return {
    pitchDegrees: (pitch * 180) / Math.PI,
    yawDegrees: (yaw * 180) / Math.PI,
  }
}

function getLookAtWeight(direction: VRMLookAtExpressionRetargetBinding['direction'], pitchDegrees: number, yawDegrees: number): number {
  'worklet'
  if (direction === 'left') return Math.max(0, yawDegrees)
  if (direction === 'right') return Math.max(0, -yawDegrees)
  if (direction === 'up') return Math.max(0, pitchDegrees)
  return Math.max(0, -pitchDegrees)
}

function isAimAxis(axis: string | undefined): axis is 'PositiveX' | 'NegativeX' | 'PositiveY' | 'NegativeY' | 'PositiveZ' | 'NegativeZ' {
  return (
    axis === 'PositiveX' ||
    axis === 'NegativeX' ||
    axis === 'PositiveY' ||
    axis === 'NegativeY' ||
    axis === 'PositiveZ' ||
    axis === 'NegativeZ'
  )
}

export function VRMAnimationRetargeter({
  sourceAsset,
  targetModel,
  bindings,
  expressionBindings = [],
  lookAtExpressionBindings = [],
  nodeConstraintBindings = [],
  springBoneBindings = [],
  animationIndex = 0,
  enabled = true,
  targetVersion,
}: VRMAnimationRetargeterProps) {
  const sourceAnimator = useAnimator(sourceAsset)
  const targetAnimator = useAnimator(targetModel)
  const { nameComponentManager, renderableManager, transformManager } = useFilamentContext()
  const springBoneState = useSharedValue<VRMSpringBoneState>({})

  const retargetBindings = React.useMemo<VRMRetargetBinding[]>(() => {
    const sourceEntities = getEntityMap(sourceAsset.getEntities(), (entity) => nameComponentManager.getEntityName(entity))
    const targetEntities = getEntityMap(targetModel.asset.getEntities(), (entity) => nameComponentManager.getEntityName(entity))
    const sourceHipsName = bindings.find((binding) => binding.isHips)?.sourceName
    const targetHipsName = bindings.find((binding) => binding.isHips)?.targetName

    let sourceHipsRestY = 1
    let targetHipsRestY = 1
    const sourceHips = sourceHipsName != null ? sourceEntities.get(sourceHipsName) : undefined
    const targetHips = targetHipsName != null ? targetEntities.get(targetHipsName) : undefined
    if (sourceHips != null) sourceHipsRestY = Math.abs(transformManager.getTransform(sourceHips).translation[1]) || 1
    if (targetHips != null) targetHipsRestY = Math.abs(transformManager.getTransform(targetHips).translation[1]) || 1
    const hipsTranslationScale = targetHipsRestY / sourceHipsRestY

    return bindings.flatMap(
      ({
        sourceName,
        targetName,
        isHips,
        sourceRestLocalRotation,
        sourceRestWorldRotation,
        targetRestLocalRotation,
        targetRestWorldRotation,
        extraSourceBones,
      }) => {
        const source = sourceEntities.get(sourceName)
        const target = targetEntities.get(targetName)
        if (source == null || target == null) return []

        const sourceRestTransform = transformManager.getTransform(source)
        const sourceRestWorldTransform = transformManager.getWorldTransform(source)
        const targetRestTransform = transformManager.getTransform(target)
        const targetRestWorldTransform = transformManager.getWorldTransform(target)

        return [
          {
            source,
            extraSources: (extraSourceBones ?? []).flatMap((extraSourceBone) => {
              const extraSource = sourceEntities.get(extraSourceBone.sourceName)
              if (extraSource == null) return []

              return [
                {
                  source: extraSource,
                  sourceRestLocalRotation: extraSourceBone.sourceRestLocalRotation,
                  sourceRestWorldRotation: extraSourceBone.sourceRestWorldRotation,
                },
              ]
            }),
            target,
            isHips,
            hipsTranslationScale,
            sourceRestTranslation: sourceRestTransform.translation,
            sourceRestLocalRotation: sourceRestLocalRotation ?? sourceRestTransform.rotationQuaternion,
            sourceRestWorldRotation: sourceRestWorldRotation ?? sourceRestWorldTransform.rotationQuaternion,
            targetRestTranslation: targetRestTransform.translation,
            targetRestLocalRotation: targetRestLocalRotation ?? targetRestTransform.rotationQuaternion,
            targetRestWorldRotation: targetRestWorldRotation ?? targetRestWorldTransform.rotationQuaternion,
            targetRestScale: targetRestTransform.scale,
          },
        ]
      }
    )
  }, [bindings, nameComponentManager, sourceAsset, targetModel, transformManager])

  const retargetExpressionBindings = React.useMemo<VRMExpressionRetargetBinding[]>(() => {
    const sourceEntities = getEntityMap(sourceAsset.getEntities(), (entity) => nameComponentManager.getEntityName(entity))
    const targetEntities = getEntityMap(targetModel.asset.getEntities(), (entity) => nameComponentManager.getEntityName(entity))

    return expressionBindings.flatMap(({ sourceName, targetName, morphTargetIndex, weight }) => {
      const source = sourceEntities.get(sourceName)
      const target = targetEntities.get(targetName)
      if (source == null || target == null) return []

      return [
        {
          source,
          target,
          morphTargetIndex,
          weight,
        },
      ]
    })
  }, [expressionBindings, nameComponentManager, sourceAsset, targetModel])

  const retargetLookAtExpressionBindings = React.useMemo<VRMLookAtExpressionRetargetBinding[]>(() => {
    const sourceEntities = getEntityMap(sourceAsset.getEntities(), (entity) => nameComponentManager.getEntityName(entity))
    const targetEntities = getEntityMap(targetModel.asset.getEntities(), (entity) => nameComponentManager.getEntityName(entity))

    return lookAtExpressionBindings.flatMap(
      ({ sourceName, targetName, direction, morphTargetIndex, weight, inputMaxValue, outputScale }) => {
        const source = sourceEntities.get(sourceName)
        const target = targetEntities.get(targetName)
        if (source == null || target == null) return []

        return [
          {
            source,
            target,
            direction,
            morphTargetIndex,
            weight,
            inputMaxValue,
            outputScale,
          },
        ]
      }
    )
  }, [lookAtExpressionBindings, nameComponentManager, sourceAsset, targetModel])

  const retargetNodeConstraintBindings = React.useMemo<VRMNodeConstraintRetargetBinding[]>(() => {
    const targetEntities = getEntityMap(targetModel.asset.getEntities(), (entity) => nameComponentManager.getEntityName(entity))

    return nodeConstraintBindings.flatMap(({ axis, sourceName, targetName, targetParentName, type, sourceRestLocalRotation, targetRestLocalRotation, weight }) => {
      const source = targetEntities.get(sourceName)
      const target = targetEntities.get(targetName)
      if (source == null || target == null) return []

      const targetRestTransform = transformManager.getTransform(target)
      return [
        {
          axis,
          source,
          target,
          parent: targetParentName == null ? undefined : targetEntities.get(targetParentName),
          type,
          weight,
          sourceRestLocalRotation,
          targetRestTranslation: targetRestTransform.translation,
          targetRestLocalRotation,
          targetRestScale: targetRestTransform.scale,
        },
      ]
    })
  }, [nameComponentManager, nodeConstraintBindings, targetModel, transformManager])

  const retargetSpringBoneBindings = React.useMemo<VRMSpringBoneRetargetBinding[]>(() => {
    const targetEntities = getEntityMap(targetModel.asset.getEntities(), (entity) => nameComponentManager.getEntityName(entity))

    return springBoneBindings.flatMap(({ name, centerName, joints, colliders }) => {
      const runtimeJoints = joints.flatMap(
        ({ nodeName, childName, parentName, dragForce, gravityDir, gravityPower, hitRadius, stiffness }) => {
          const node = targetEntities.get(nodeName)
          const child = targetEntities.get(childName)
          const parent = parentName == null ? undefined : targetEntities.get(parentName)
          if (node == null || child == null) return []

          return [
            {
              node,
              child,
              parent,
              nodeName,
              childName,
              dragForce,
              gravityDir,
              gravityPower,
              hitRadius,
              stiffness,
            },
          ]
        }
      )
      if (runtimeJoints.length === 0) return []

      const runtimeColliders: VRMSpringBoneColliderRetargetBinding[] = []
      for (const collider of colliders) {
        const node = targetEntities.get(collider.nodeName)
        if (node == null) continue

        if (collider.type === 'sphere') {
          runtimeColliders.push({ node, type: 'sphere', offset: collider.offset, radius: collider.radius })
          continue
        }
        runtimeColliders.push({ node, type: 'capsule', offset: collider.offset, radius: collider.radius, tail: collider.tail })
      }

      return [
        {
          name,
          center: centerName == null ? undefined : targetEntities.get(centerName),
          joints: runtimeJoints,
          colliders: runtimeColliders,
        },
      ]
    })
  }, [nameComponentManager, springBoneBindings, targetModel])

  RenderCallbackContext.useRenderCallback(
    ({ passedSeconds, timeSinceLastFrame }) => {
      'worklet'
      if (
        !enabled ||
        sourceAnimator == null ||
        targetAnimator == null ||
        (retargetBindings.length === 0 &&
          retargetExpressionBindings.length === 0 &&
          retargetLookAtExpressionBindings.length === 0 &&
          retargetNodeConstraintBindings.length === 0 &&
          retargetSpringBoneBindings.length === 0)
      ) {
        return
      }

      const animationDuration = sourceAnimator.getAnimationDuration(animationIndex)
      const animationTime = animationDuration > 0 ? passedSeconds % animationDuration : passedSeconds

      sourceAnimator.applyAnimation(animationIndex, animationTime)

      transformManager.openLocalTransformTransaction()
      for (const binding of retargetBindings) {
        const sourceTransform = transformManager.getTransform(binding.source)
        let normalizedRotation = normalizeLocalRotation(
          sourceTransform.rotationQuaternion,
          binding.sourceRestLocalRotation,
          binding.sourceRestWorldRotation
        )
        for (const extraSource of binding.extraSources) {
          const extraSourceTransform = transformManager.getTransform(extraSource.source)
          const extraNormalizedRotation = normalizeLocalRotation(
            extraSourceTransform.rotationQuaternion,
            extraSource.sourceRestLocalRotation,
            extraSource.sourceRestWorldRotation
          )
          normalizedRotation = multiplyQuat(extraNormalizedRotation, normalizedRotation)
        }
        if (targetVersion === '0.x') {
          normalizedRotation = flipVRM0NormalizedRotation(normalizedRotation)
        }

        const targetRotation = denormalizeLocalRotation(
          normalizedRotation,
          binding.targetRestLocalRotation,
          binding.targetRestWorldRotation
        )
        const targetTranslation = binding.isHips
          ? scaleTranslationDelta(
              sourceTransform.translation,
              binding.sourceRestTranslation,
              binding.targetRestTranslation,
              binding.hipsTranslationScale,
              targetVersion === '0.x'
            )
          : binding.targetRestTranslation

        transformManager.setTransformFromTRS(binding.target, targetTranslation, targetRotation, binding.targetRestScale)
      }
      transformManager.commitLocalTransformTransaction()

      for (const binding of retargetNodeConstraintBindings) {
        const sourceTransform = transformManager.getTransform(binding.source)
        const targetWorldTransform = transformManager.getWorldTransform(binding.target)
        const parentWorldRotation: Float4 = binding.parent == null ? [0, 0, 0, 1] : transformManager.getWorldTransform(binding.parent).rotationQuaternion
        let targetRotation = binding.targetRestLocalRotation
        if (binding.type === 'rotation') {
          targetRotation = retargetRotationConstraint(
            sourceTransform.rotationQuaternion,
            binding.sourceRestLocalRotation,
            binding.targetRestLocalRotation,
            binding.weight
          )
        } else if (binding.type === 'roll' && (binding.axis === 'X' || binding.axis === 'Y' || binding.axis === 'Z')) {
          targetRotation = retargetRollConstraint(
            sourceTransform.rotationQuaternion,
            binding.sourceRestLocalRotation,
            binding.targetRestLocalRotation,
            binding.axis,
            binding.weight
          )
        } else if (binding.type === 'aim' && isAimAxis(binding.axis)) {
          const sourceWorldTransform = transformManager.getWorldTransform(binding.source)
          targetRotation = retargetAimConstraint(
            sourceWorldTransform.translation,
            targetWorldTransform.translation,
            binding.targetRestLocalRotation,
            parentWorldRotation,
            binding.axis,
            binding.weight
          )
        }
        transformManager.setTransformFromTRS(binding.target, binding.targetRestTranslation, targetRotation, binding.targetRestScale)
      }

      for (const spring of retargetSpringBoneBindings) {
        const centerTranslation: Float3 = spring.center == null ? [0, 0, 0] : transformManager.getWorldTransform(spring.center).translation

        for (const joint of spring.joints) {
          const nodeWorldTransform = transformManager.getWorldTransform(joint.node)
          const childWorldTransform = transformManager.getWorldTransform(joint.child)
          const nodeLocalTransform = transformManager.getTransform(joint.node)
          const parentWorldRotation: Float4 = joint.parent == null ? [0, 0, 0, 1] : transformManager.getWorldTransform(joint.parent).rotationQuaternion
          const head = subVec3(nodeWorldTransform.translation, centerTranslation)
          const animatedTail = subVec3(childWorldTransform.translation, centerTranslation)
          const boneVector = subVec3(animatedTail, head)
          const boneLength = lengthVec3(boneVector)
          if (boneLength <= 0.000001) continue

          const animatedDirection = normalizeVec3(boneVector)
          const stateKey = `${spring.name}/${joint.nodeName}/${joint.childName}`
          let state = springBoneState.value[stateKey]
          if (state == null) {
            state = { previousTail: animatedTail, tail: animatedTail }
          }

          const deltaTime = Math.max(1 / 120, Math.min(1 / 30, timeSinceLastFrame || 1 / 60))
          const inertia = scaleVec3(subVec3(state.tail, state.previousTail), 1 - Math.max(0, Math.min(1, joint.dragForce)))
          const stiffness = scaleVec3(animatedDirection, joint.stiffness * deltaTime * deltaTime)
          const gravity = scaleVec3(normalizeVec3(joint.gravityDir, [0, -1, 0]), joint.gravityPower * deltaTime * deltaTime)
          let nextTail = addVec3(addVec3(addVec3(state.tail, inertia), stiffness), gravity)
          nextTail = addVec3(head, scaleVec3(normalizeVec3(subVec3(nextTail, head), animatedDirection), boneLength))

          for (const collider of spring.colliders) {
            const colliderTransform = transformManager.getWorldTransform(collider.node)
            const colliderTranslation = subVec3(colliderTransform.translation, centerTranslation)
            const colliderOffset = transformPoint(colliderTranslation, colliderTransform.rotationQuaternion, colliderTransform.scale, collider.offset)
            const radius = collider.radius + joint.hitRadius
            if (collider.type === 'sphere') {
              nextTail = pushOutFromSphere(nextTail, colliderOffset, radius)
            } else {
              const colliderTail = transformPoint(colliderTranslation, colliderTransform.rotationQuaternion, colliderTransform.scale, collider.tail)
              nextTail = pushOutFromSphere(nextTail, closestPointOnSegment(nextTail, colliderOffset, colliderTail), radius)
            }
          }

          nextTail = addVec3(head, scaleVec3(normalizeVec3(subVec3(nextTail, head), animatedDirection), boneLength))
          const nextDirection = normalizeVec3(subVec3(nextTail, head), animatedDirection)
          const deltaRotation = quatFromUnitVectors(animatedDirection, nextDirection)
          const nextWorldRotation = multiplyQuat(deltaRotation, nodeWorldTransform.rotationQuaternion)
          const nextLocalRotation = multiplyQuat(invertQuat(parentWorldRotation), nextWorldRotation)

          transformManager.setTransformFromTRS(joint.node, nodeLocalTransform.translation, nextLocalRotation, nodeLocalTransform.scale)
          springBoneState.value[stateKey] = { previousTail: state.tail, tail: nextTail }
        }
      }

      for (const binding of retargetExpressionBindings) {
        const sourceTransform = transformManager.getTransform(binding.source)
        const weight = Math.max(0, Math.min(1, sourceTransform.translation[0])) * binding.weight
        renderableManager.setMorphWeights(binding.target, [weight], binding.morphTargetIndex)
      }

      for (const binding of retargetLookAtExpressionBindings) {
        const sourceTransform = transformManager.getTransform(binding.source)
        const { pitchDegrees, yawDegrees } = getLookAtAngles(sourceTransform.rotationQuaternion)
        const angle = getLookAtWeight(binding.direction, pitchDegrees, yawDegrees)
        const weight = Math.max(0, Math.min(1, angle / binding.inputMaxValue)) * binding.outputScale * binding.weight
        renderableManager.setMorphWeights(binding.target, [weight], binding.morphTargetIndex)
      }

      targetAnimator.updateBoneMatrices()
    },
    [
      animationIndex,
      enabled,
      sourceAnimator,
      targetAnimator,
      transformManager,
      renderableManager,
      retargetBindings,
      retargetExpressionBindings,
      retargetLookAtExpressionBindings,
      retargetNodeConstraintBindings,
      retargetSpringBoneBindings,
      springBoneState,
      targetVersion,
    ]
  )

  return null
}
