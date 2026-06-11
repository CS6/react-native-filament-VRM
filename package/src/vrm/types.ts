import type { BufferSource } from '../hooks/useBuffer'
import type { FilamentModel } from '../hooks/useModel'
import type { Entity, FilamentAsset, Float3, Float4 } from '../types'

export type VRMHumanoidBoneName =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'upperChest'
  | 'neck'
  | 'head'
  | 'leftShoulder'
  | 'leftUpperArm'
  | 'leftLowerArm'
  | 'leftHand'
  | 'rightShoulder'
  | 'rightUpperArm'
  | 'rightLowerArm'
  | 'rightHand'
  | 'leftUpperLeg'
  | 'leftLowerLeg'
  | 'leftFoot'
  | 'leftToes'
  | 'rightUpperLeg'
  | 'rightLowerLeg'
  | 'rightFoot'
  | 'rightToes'
  | 'leftThumbMetacarpal'
  | 'leftThumbProximal'
  | 'leftThumbIntermediate'
  | 'leftThumbDistal'
  | 'leftIndexProximal'
  | 'leftIndexIntermediate'
  | 'leftIndexDistal'
  | 'leftMiddleProximal'
  | 'leftMiddleIntermediate'
  | 'leftMiddleDistal'
  | 'leftRingProximal'
  | 'leftRingIntermediate'
  | 'leftRingDistal'
  | 'leftLittleProximal'
  | 'leftLittleIntermediate'
  | 'leftLittleDistal'
  | 'rightThumbMetacarpal'
  | 'rightThumbProximal'
  | 'rightThumbIntermediate'
  | 'rightThumbDistal'
  | 'rightIndexProximal'
  | 'rightIndexIntermediate'
  | 'rightIndexDistal'
  | 'rightMiddleProximal'
  | 'rightMiddleIntermediate'
  | 'rightMiddleDistal'
  | 'rightRingProximal'
  | 'rightRingIntermediate'
  | 'rightRingDistal'
  | 'rightLittleProximal'
  | 'rightLittleIntermediate'
  | 'rightLittleDistal'

export type VRMHumanoidNodeNames = Partial<Record<VRMHumanoidBoneName, string>>

export interface VRMHumanoidRestNode {
  name: string
  localRotation: Float4
  worldRotation: Float4
}

export type VRMHumanoidRestPose = Partial<Record<VRMHumanoidBoneName, VRMHumanoidRestNode>>

export interface VRMHumanoidBinding {
  bone: VRMHumanoidBoneName
  sourceName: string
  targetName: string
  isHips: boolean
  extraSourceBones?: VRMHumanoidRetargetSource[]
  sourceRestLocalRotation?: Float4
  sourceRestWorldRotation?: Float4
  targetRestLocalRotation?: Float4
  targetRestWorldRotation?: Float4
}

export interface VRMHumanoidRetargetSource {
  bone: VRMHumanoidBoneName
  sourceName: string
  sourceRestLocalRotation: Float4
  sourceRestWorldRotation: Float4
}

export interface VRMGltfJson {
  accessors?: Array<{
    bufferView?: number
    byteOffset?: number
    componentType?: number
    count?: number
    max?: number[]
    min?: number[]
    type?: string
  }>
  animations?: VRMGltfAnimation[]
  bufferViews?: Array<{
    buffer?: number
    byteLength?: number
    byteOffset?: number
    byteStride?: number
  }>
  extensions?: {
    VRM?: {
      blendShapeMaster?: {
        blendShapeGroups?: Array<{
          binds?: VRMExpressionMorphTargetBind[]
          name?: string
          presetName?: string
        }>
      }
      humanoid?: {
        humanBones?: Array<{
          bone?: string
          node?: number
        }>
      }
    }
    VRMC_vrm?: {
      expressions?: {
        preset?: Partial<Record<string, VRMExpressionDefinition>>
        custom?: Record<string, VRMExpressionDefinition>
      }
      humanoid?: {
        humanBones?: Partial<Record<VRMHumanoidBoneName, { node?: number }>>
      }
    }
    VRMC_vrm_animation?: {
      expressions?: {
        preset?: Partial<Record<string, { node?: number }>>
        custom?: Record<string, { node?: number }>
      }
      humanoid?: {
        humanBones?: Partial<Record<VRMHumanoidBoneName, { node?: number }>>
      }
    }
  }
  extensionsRequired?: string[]
  extensionsUsed?: string[]
  materials?: Array<{
    alphaMode?: string
    doubleSided?: boolean
    extensions?: Record<string, unknown>
    name?: string
    pbrMetallicRoughness?: {
      baseColorFactor?: Float4
      baseColorTexture?: unknown
      metallicFactor?: number
      roughnessFactor?: number
    }
  }>
  meshes?: Array<{
    name?: string
  }>
  nodes?: Array<{
    children?: number[]
    extensions?: {
      VRMC_node_constraint?: {
        constraint?: {
          aim?: unknown
          roll?: unknown
          rotation?: {
            source?: number
            weight?: number
          }
        }
      }
    }
    mesh?: number
    name?: string
    rotation?: Float4
  }>
  scene?: number
  scenes?: Array<{
    nodes?: number[]
  }>
}

export interface VRMExpressionDefinition {
  morphTargetBinds?: VRMExpressionMorphTargetBind[]
}

export interface VRMExpressionMorphTargetBind {
  index?: number
  mesh?: number
  node?: number
  weight?: number
}

export interface VRMExpressionBinding {
  expressionName: string
  sourceName: string
  targetName: string
  morphTargetIndex: number
  weight: number
}

export interface VRMNodeConstraintBinding {
  sourceName: string
  targetName: string
  weight: number
  sourceRestLocalRotation: Float4
  targetRestLocalRotation: Float4
}

export interface VRMGltfDocument {
  json: VRMGltfJson
  binaryChunk?: Uint8Array
}

export interface VRMMaterialFallbackOptions {
  removeUnsupportedVRMExtensions?: boolean
}

export interface VRMMaterialFallbackSourceOptions extends VRMMaterialFallbackOptions {
  enabled?: boolean
  fileName?: string
  writeFallbackGlb: (buffer: ArrayBuffer, fileName: string) => Promise<BufferSource>
}

export interface VRMMaterialFallbackSourceState {
  source: BufferSource
  error?: Error
  isLoading: boolean
}

export interface VRMGltfAnimation {
  name?: string
  channels?: Array<{
    sampler?: number
    target?: {
      node?: number
      path?: VRMGltfAnimationTargetPath
    }
  }>
  samplers?: Array<{
    input?: number
    interpolation?: string
    output?: number
  }>
}

export type VRMGltfAnimationTargetPath = 'translation' | 'rotation' | 'scale' | 'weights' | string

export interface VRMGltfAnimationClip {
  index: number
  name: string
  duration: number
  channels: VRMGltfAnimationChannel[]
}

export interface VRMGltfAnimationChannel {
  nodeIndex: number
  nodeName?: string
  path: VRMGltfAnimationTargetPath
  interpolation?: string
  inputAccessor?: number
  outputAccessor?: number
}

export type VRMVersion = '0.x' | '1.0' | 'unknown'

export interface VRMCompatibilityReport {
  version: VRMVersion
  humanoidBoneCount: number
  extensionsUsed: string[]
  materialExtensions: string[]
  alphaModes: string[]
  supportedExtensions: string[]
  unsupportedExtensions: string[]
  fallbackExtensions: string[]
  warnings: string[]
}

export type VRMSource = BufferSource

export type LoadedFilamentModel = Extract<FilamentModel, { state: 'loaded' }>

export interface VRMRetargetBinding {
  source: Entity
  extraSources: VRMRetargetSource[]
  target: Entity
  isHips: boolean
  hipsTranslationScale: number
  sourceRestTranslation: Float3
  sourceRestLocalRotation: Float4
  sourceRestWorldRotation: Float4
  targetRestTranslation: Float3
  targetRestLocalRotation: Float4
  targetRestWorldRotation: Float4
  targetRestScale: Float3
}

export interface VRMRetargetSource {
  source: Entity
  sourceRestLocalRotation: Float4
  sourceRestWorldRotation: Float4
}

export interface VRMExpressionRetargetBinding {
  source: Entity
  target: Entity
  morphTargetIndex: number
  weight: number
}

export interface VRMNodeConstraintRetargetBinding {
  source: Entity
  target: Entity
  weight: number
  sourceRestLocalRotation: Float4
  targetRestTranslation: Float3
  targetRestLocalRotation: Float4
  targetRestScale: Float3
}

export interface VRMAnimationRetargeterProps {
  sourceAsset: FilamentAsset
  targetModel: LoadedFilamentModel
  bindings: VRMHumanoidBinding[]
  expressionBindings?: VRMExpressionBinding[]
  nodeConstraintBindings?: VRMNodeConstraintBinding[]
  animationIndex?: number
  enabled?: boolean
  targetVersion?: VRMVersion
}

export interface VRMAnimationRetargeting {
  bindings: VRMHumanoidBinding[]
  expressionBindings: VRMExpressionBinding[]
  nodeConstraintBindings: VRMNodeConstraintBinding[]
  clips: VRMGltfAnimationClip[]
  compatibility: VRMCompatibilityReport
  targetVersion: VRMVersion
}

export interface VRMAnimationState {
  sourceAsset?: FilamentAsset
  retargeting?: VRMAnimationRetargeting
  error?: Error
  isLoading: boolean
}
