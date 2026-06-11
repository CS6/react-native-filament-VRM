import * as React from 'react'
import { RenderCallbackContext } from '../react/RenderCallbackContext'
import { useAnimator } from '../hooks/useAnimator'
import { useFilamentContext } from '../hooks/useFilamentContext'
import type { Entity } from '../types'
import type {
  VRMAnimationRetargeterProps,
  VRMExpressionRetargetBinding,
  VRMLookAtExpressionRetargetBinding,
  VRMNodeConstraintRetargetBinding,
  VRMRetargetBinding,
} from './types'
import {
  denormalizeLocalRotation,
  flipVRM0NormalizedRotation,
  multiplyQuat,
  normalizeLocalRotation,
  retargetRotationConstraint,
  scaleTranslationDelta,
} from './retargeting'

function getEntityMap(entities: Entity[], getEntityName: (entity: Entity) => string | undefined) {
  return new Map(entities.map((entity) => [getEntityName(entity), entity]))
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

export function VRMAnimationRetargeter({
  sourceAsset,
  targetModel,
  bindings,
  expressionBindings = [],
  lookAtExpressionBindings = [],
  nodeConstraintBindings = [],
  animationIndex = 0,
  enabled = true,
  targetVersion,
}: VRMAnimationRetargeterProps) {
  const sourceAnimator = useAnimator(sourceAsset)
  const targetAnimator = useAnimator(targetModel)
  const { nameComponentManager, renderableManager, transformManager } = useFilamentContext()

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

    return nodeConstraintBindings.flatMap(({ sourceName, targetName, sourceRestLocalRotation, targetRestLocalRotation, weight }) => {
      const source = targetEntities.get(sourceName)
      const target = targetEntities.get(targetName)
      if (source == null || target == null) return []

      const targetRestTransform = transformManager.getTransform(target)
      return [
        {
          source,
          target,
          weight,
          sourceRestLocalRotation,
          targetRestTranslation: targetRestTransform.translation,
          targetRestLocalRotation,
          targetRestScale: targetRestTransform.scale,
        },
      ]
    })
  }, [nameComponentManager, nodeConstraintBindings, targetModel, transformManager])

  RenderCallbackContext.useRenderCallback(
    ({ passedSeconds }) => {
      'worklet'
      if (
        !enabled ||
        sourceAnimator == null ||
        targetAnimator == null ||
        (retargetBindings.length === 0 &&
          retargetExpressionBindings.length === 0 &&
          retargetLookAtExpressionBindings.length === 0 &&
          retargetNodeConstraintBindings.length === 0)
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

      transformManager.openLocalTransformTransaction()
      for (const binding of retargetNodeConstraintBindings) {
        const sourceTransform = transformManager.getTransform(binding.source)
        const targetRotation = retargetRotationConstraint(
          sourceTransform.rotationQuaternion,
          binding.sourceRestLocalRotation,
          binding.targetRestLocalRotation,
          binding.weight
        )
        transformManager.setTransformFromTRS(binding.target, binding.targetRestTranslation, targetRotation, binding.targetRestScale)
      }
      transformManager.commitLocalTransformTransaction()

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
      targetVersion,
    ]
  )

  return null
}
