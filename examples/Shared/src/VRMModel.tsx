import * as React from 'react'
import { Button, Dimensions, StyleSheet, Text, View } from 'react-native'
import {
  Camera,
  DefaultLight,
  FilamentScene,
  FilamentView,
  ModelRenderer,
  useCameraManipulator,
  useModel,
  useVRMAnimation,
  useVRMMaterialFallbackSource,
  VRMAnimationRetargeter,
} from 'react-native-filament'
import ReactNativeBlobUtil from 'react-native-blob-util'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useSharedValue } from 'react-native-worklets-core'
import AvatarSampleA from '@assets/AvatarSample_A.vrm'
import ClappingVrma from '@assets/Clapping.vrma'
import JumpVrma from '@assets/Jump.vrma'
import LookAroundVrma from '@assets/LookAround.vrma'
import RelaxVrma from '@assets/Relax.vrma'
import SeedSan from '@assets/Seed-san.vrm'
import TkVrmViewerSample from '@assets/TkVrmViewerSample.vrm'
import VRM1ConstraintTwistSample from '@assets/VRM1_Constraint_Twist_Sample.vrm'
import VRMCMaterialsMtoonUVAnimationTest from '@assets/VRMC_materials_mtoon_UV_Animation_Test.vrm'
import VRMCVRMExpressionsIsBinaryOverridden from '@assets/VRMC_vrm_expressions_isBinary_Overridden.vrm'
import VRMCVRMExpressionsIsBinaryOverrides from '@assets/VRMC_vrm_expressions_isBinary_Overrides.vrm'

type VRMAvatarItem = {
  label: string
  source: number
}

type VRMMotionItem = {
  label: string
  source: number
}

type VRMPageMode = 'retarget' | 'static'

const BASE_AVATARS: VRMAvatarItem[] = [{ label: 'Seed VRM1', source: SeedSan }]

const CROSS_TEST_AVATARS: VRMAvatarItem[] = [
  { label: 'Avatar A', source: AvatarSampleA },
  { label: 'Seed VRM1', source: SeedSan },
  { label: 'TK VRM0', source: TkVrmViewerSample },
  { label: 'Twist VRM1', source: VRM1ConstraintTwistSample },
]

const OFFICIAL_SAMPLE_AVATARS: VRMAvatarItem[] = [
  { label: 'Seed VRM1', source: SeedSan },
  { label: 'Twist VRM1', source: VRM1ConstraintTwistSample },
  { label: 'MToon UV', source: VRMCMaterialsMtoonUVAnimationTest },
  { label: 'Binary Overridden', source: VRMCVRMExpressionsIsBinaryOverridden },
  { label: 'Binary Overrides', source: VRMCVRMExpressionsIsBinaryOverrides },
]

const MOTIONS: VRMMotionItem[] = [
  { label: 'Jump', source: JumpVrma },
  { label: 'Relax', source: RelaxVrma },
  { label: 'Clap', source: ClappingVrma },
  { label: 'Look', source: LookAroundVrma },
]

const AUTO_CYCLE_INTERVAL_MS = 5000

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let output = ''

  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0
    const b = bytes[index + 1] ?? 0
    const c = bytes[index + 2] ?? 0
    const triplet = (a << 16) | (b << 8) | c

    output += chars[(triplet >> 18) & 0x3f]
    output += chars[(triplet >> 12) & 0x3f]
    output += index + 1 < bytes.length ? chars[(triplet >> 6) & 0x3f] : '='
    output += index + 2 < bytes.length ? chars[triplet & 0x3f] : '='
  }

  return output
}

function SceneContent({
  children,
  model,
}: {
  children?: React.ReactNode
  model: ReturnType<typeof useModel>
}) {
  const cameraManipulator = useCameraManipulator({
    orbitHomePosition: [0, 0.25, -3],
    targetPosition: [0, 0, 0],
    orbitSpeed: [0.003, 0.003],
  })
  const viewHeight = Dimensions.get('window').height
  const panGesture = Gesture.Pan()
    .onBegin((event) => {
      cameraManipulator?.grabBegin(event.translationX, viewHeight - event.translationY, false)
    })
    .onUpdate((event) => {
      cameraManipulator?.grabUpdate(event.translationX, viewHeight - event.translationY)
    })
    .maxPointers(1)
    .onEnd(() => {
      cameraManipulator?.grabEnd()
    })

  const previousScale = useSharedValue(1)
  const pinchGesture = Gesture.Pinch()
    .onBegin(({ scale }) => {
      previousScale.value = scale
    })
    .onUpdate(({ focalX, focalY, scale }) => {
      cameraManipulator?.scroll(focalX, focalY, -(scale - previousScale.value) * 100)
      previousScale.value = scale
    })
  const gesture = Gesture.Race(pinchGesture, panGesture)

  return (
    <GestureDetector gesture={gesture}>
      <FilamentView style={styles.filamentView}>
        <Camera cameraManipulator={cameraManipulator} />
        <DefaultLight />
        {model.state === 'loaded' && <ModelRenderer model={model} transformToUnitCube>{children}</ModelRenderer>}
      </FilamentView>
    </GestureDetector>
  )
}

function StaticRenderer({
  modelSource,
}: {
  modelSource: number | { uri: string }
}) {
  const vrmModel = useModel(modelSource)
  return <SceneContent model={vrmModel} />
}

function RetargetRenderer({
  animationLabel,
  animationSource,
  modelLabel,
  modelMetadataSource,
  modelSource,
}: {
  animationLabel: string
  animationSource: number
  modelLabel: string
  modelMetadataSource: number
  modelSource: number | { uri: string }
}) {
  const vrmModel = useModel(modelSource)
  const vrmAnimation = useVRMAnimation(animationSource, modelMetadataSource)

  React.useEffect(() => {
    const retargeting = vrmAnimation.retargeting
    if (retargeting == null) {
      if (vrmAnimation.error != null) {
        console.log(`Failed to parse VRM/VRMA humanoid metadata for ${modelLabel} / ${animationLabel}: ${vrmAnimation.error.message}`)
      }
      return
    }

    console.log(
      `VRM retarget ${modelLabel} / ${animationLabel}: source=${retargeting.source.type}, sourceBones=${retargeting.source.humanoidBoneCount}, ${retargeting.bindings.length} bindings, ${retargeting.expressionBindings.length} expression bindings, ${retargeting.expressionMaterialColorBindings.length} expression material color bindings, ${retargeting.expressionTextureTransformBindings.length} expression texture transform bindings, ${retargeting.expressionOverrideBindings.length} expression override bindings, ${retargeting.lookAtBoneBindings.length} bone lookAt bindings, ${retargeting.lookAtExpressionBindings.length} expression lookAt bindings, ${retargeting.nodeConstraintBindings.length} node constraints, ${retargeting.springBoneBindings.length} spring bones, ${retargeting.clips.length} clips, ${retargeting.clips[0]?.channels.length ?? 0} channels, ${retargeting.clips[0]?.duration ?? 0}s`
    )
    console.log(
      `VRM compatibility ${modelLabel}: version=${retargeting.compatibility.version}, bones=${retargeting.compatibility.humanoidBoneCount}, unsupported=${retargeting.compatibility.unsupportedExtensions.join(',') || 'none'}, fallback=${retargeting.compatibility.fallbackExtensions.join(',') || 'none'}`
    )
    for (const warning of retargeting.compatibility.warnings) {
      console.log(`VRM compatibility warning ${modelLabel}: ${warning}`)
    }
  }, [animationLabel, modelLabel, vrmAnimation.error, vrmAnimation.retargeting])

  return (
    <SceneContent model={vrmModel}>
      {vrmModel.state === 'loaded' && vrmAnimation.sourceAsset != null && vrmAnimation.retargeting != null && (
        <VRMAnimationRetargeter
          sourceAsset={vrmAnimation.sourceAsset}
          targetModel={vrmModel}
          bindings={vrmAnimation.retargeting.bindings}
          expressionBindings={vrmAnimation.retargeting.expressionBindings}
          expressionMaterialColorBindings={vrmAnimation.retargeting.expressionMaterialColorBindings}
          expressionTextureTransformBindings={vrmAnimation.retargeting.expressionTextureTransformBindings}
          expressionOverrideBindings={vrmAnimation.retargeting.expressionOverrideBindings}
          lookAtBoneBindings={vrmAnimation.retargeting.lookAtBoneBindings}
          lookAtExpressionBindings={vrmAnimation.retargeting.lookAtExpressionBindings}
          nodeConstraintBindings={vrmAnimation.retargeting.nodeConstraintBindings}
          springBoneBindings={vrmAnimation.retargeting.springBoneBindings}
          targetVersion={vrmAnimation.retargeting.targetVersion}
        />
      )}
    </SceneContent>
  )
}

function VRMTestPage({
  avatars,
  mode,
  motions,
  autoCycleAvatars,
}: {
  avatars: VRMAvatarItem[]
  mode: VRMPageMode
  motions: VRMMotionItem[]
  autoCycleAvatars: boolean
}) {
  const [count, setCount] = React.useState(0)
  const [avatarIndex, setAvatarIndex] = React.useState(0)
  const [motionIndex, setMotionIndex] = React.useState(0)
  const [isAutoCycleEnabled, setIsAutoCycleEnabled] = React.useState(false)
  const avatar = avatars[avatarIndex] ?? avatars[0]
  const motion = motions[motionIndex] ?? motions[0]
  const writeFallbackGlb = React.useCallback(async (buffer: ArrayBuffer, fileName: string) => {
    const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`
    await ReactNativeBlobUtil.fs.writeFile(path, toBase64(buffer), 'base64')
    return { uri: `file://${path}` }
  }, [])
  const modelFallback = useVRMMaterialFallbackSource(avatar.source, { writeFallbackGlb })

  React.useEffect(() => {
    if (!isAutoCycleEnabled) return

    const interval = setInterval(() => {
      if (mode === 'static') {
        setAvatarIndex((currentAvatarIndex) => (currentAvatarIndex + 1) % avatars.length)
        return
      }

      setMotionIndex((currentMotionIndex) => {
        const nextMotionIndex = (currentMotionIndex + 1) % motions.length
        if (autoCycleAvatars && nextMotionIndex === 0) {
          setAvatarIndex((currentAvatarIndex) => (currentAvatarIndex + 1) % avatars.length)
        }
        return nextMotionIndex
      })
    }, AUTO_CYCLE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [autoCycleAvatars, avatars.length, isAutoCycleEnabled, mode, motions.length])

  return (
    <SafeAreaView style={styles.container}>
      <FilamentScene key={count}>
        {modelFallback.isLoading ? (
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>Loading {avatar.label}</Text>
          </View>
        ) : modelFallback.error != null ? (
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>{modelFallback.error.message}</Text>
          </View>
        ) : mode === 'retarget' ? (
          <RetargetRenderer
            key={`${avatar.source}-${motion.source}-${typeof modelFallback.source === 'object' ? modelFallback.source.uri : modelFallback.source}`}
            animationLabel={motion.label}
            animationSource={motion.source}
            modelLabel={avatar.label}
            modelMetadataSource={avatar.source}
            modelSource={modelFallback.source}
          />
        ) : (
          <StaticRenderer
            key={`${avatar.source}-${typeof modelFallback.source === 'object' ? modelFallback.source.uri : modelFallback.source}`}
            modelSource={modelFallback.source}
          />
        )}
      </FilamentScene>
      <View style={styles.selectionBar}>
        <Text style={styles.selectionText}>
          {mode === 'retarget' ? `${avatar.label} / ${motion.label}` : avatar.label}
        </Text>
      </View>
      <View style={styles.controls}>
        {avatars.map((item, index) => (
          <Button key={item.label} title={item.label} onPress={() => setAvatarIndex(index)} />
        ))}
      </View>
      <View style={styles.controls}>
        {mode === 'retarget' &&
          motions.map((item, index) => <Button key={item.label} title={item.label} onPress={() => setMotionIndex(index)} />)}
      </View>
      <View style={styles.controls}>
        <Button title={isAutoCycleEnabled ? 'Stop Auto' : 'Auto'} onPress={() => setIsAutoCycleEnabled((value) => !value)} />
        <Button title="Rerender" onPress={() => setCount((c) => c + 1)} />
      </View>
    </SafeAreaView>
  )
}

export function VRMModel() {
  return <VRMTestPage avatars={BASE_AVATARS} mode="retarget" motions={MOTIONS} autoCycleAvatars={false} />
}

export function VRMCrossTest() {
  return <VRMTestPage avatars={CROSS_TEST_AVATARS} mode="retarget" motions={MOTIONS} autoCycleAvatars />
}

export function VRMOfficialSamples() {
  return <VRMTestPage avatars={OFFICIAL_SAMPLE_AVATARS} mode="static" motions={MOTIONS} autoCycleAvatars />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filamentView: {
    flex: 1,
    backgroundColor: '#101820',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
  },
  selectionBar: {
    alignItems: 'center',
    backgroundColor: '#101820',
    paddingBottom: 6,
    paddingTop: 6,
  },
  selectionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  statusContainer: {
    alignItems: 'center',
    backgroundColor: '#101820',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  statusText: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
  },
})
