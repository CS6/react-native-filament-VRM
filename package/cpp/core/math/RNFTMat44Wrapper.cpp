
#include "RNFTMat44Wrapper.h"
#include "core/utils/RNFConverter.h"

namespace margelo {

void margelo::TMat44Wrapper::loadHybridMethods() {
  registerHybridGetter("data", &TMat44Wrapper::getMatrixData, this);
  registerHybridMethod("scaling", &TMat44Wrapper::scaling, this);
  registerHybridMethod("translate", &TMat44Wrapper::translate, this);
  registerHybridMethod("rotate", &TMat44Wrapper::rotate, this);
  registerHybridGetter("scale", &TMat44Wrapper::getScale, this);
  registerHybridGetter("translation", &TMat44Wrapper::getTranslation, this);
  registerHybridGetter("rotationQuaternion", &TMat44Wrapper::getRotationQuaternion, this);
}

std::vector<double> TMat44Wrapper::getMatrixData() {
  std::vector<double> data;
  data.reserve(16);
  const float* array = _matrix.asArray();
  for (int i = 0; i < 16; i++) {
    data.push_back((double)array[i]);
  }
  return data;
}

std::shared_ptr<TMat44Wrapper> TMat44Wrapper::scaling(std::vector<double> scale) {
  math::float3 scaleVec = Converter::VecToFloat3(scale);
  math::mat4f scaleMatrix = math::mat4f::scaling(scaleVec);
  math::mat4f newMatrix = scaleMatrix * _matrix;
  return std::make_shared<TMat44Wrapper>(newMatrix);
}

std::shared_ptr<TMat44Wrapper> TMat44Wrapper::translate(std::vector<double> translation) {
  math::float3 translateVec = Converter::VecToFloat3(translation);
  math::mat4f translateMatrix = math::mat4f::translation(translateVec);
  math::mat4f newMatrix = translateMatrix * _matrix;
  return std::make_shared<TMat44Wrapper>(newMatrix);
}

std::shared_ptr<TMat44Wrapper> TMat44Wrapper::rotate(double angleRadians, std::vector<double> axisVec) {
  math::float3 axis = Converter::VecToFloat3(axisVec);
  if (axis.x == 0 && axis.y == 0 && axis.z == 0) {
    throw std::invalid_argument("Axis cannot be zero");
  }

  math::mat4f rotateMatrix = math::mat4f::rotation(angleRadians, axis);
  math::mat4f newMatrix = rotateMatrix * _matrix;
  return std::make_shared<TMat44Wrapper>(newMatrix);
}

std::vector<double> TMat44Wrapper::getScale() {
  float scaleX = std::sqrt(_matrix[0][0] * _matrix[0][0] + _matrix[0][1] * _matrix[0][1] + _matrix[0][2] * _matrix[0][2]);
  float scaleY = std::sqrt(_matrix[1][0] * _matrix[1][0] + _matrix[1][1] * _matrix[1][1] + _matrix[1][2] * _matrix[1][2]);
  float scaleZ = std::sqrt(_matrix[2][0] * _matrix[2][0] + _matrix[2][1] * _matrix[2][1] + _matrix[2][2] * _matrix[2][2]);

  return {scaleX, scaleY, scaleZ};
}

std::vector<double> TMat44Wrapper::getTranslation() {
  return {_matrix[3][0], _matrix[3][1], _matrix[3][2]};
}

std::vector<double> TMat44Wrapper::getRotationQuaternion() {
  float scaleX = std::sqrt(_matrix[0][0] * _matrix[0][0] + _matrix[0][1] * _matrix[0][1] + _matrix[0][2] * _matrix[0][2]);
  float scaleY = std::sqrt(_matrix[1][0] * _matrix[1][0] + _matrix[1][1] * _matrix[1][1] + _matrix[1][2] * _matrix[1][2]);
  float scaleZ = std::sqrt(_matrix[2][0] * _matrix[2][0] + _matrix[2][1] * _matrix[2][1] + _matrix[2][2] * _matrix[2][2]);

  if (scaleX == 0 || scaleY == 0 || scaleZ == 0) {
    return {0, 0, 0, 1};
  }

  const float m00 = _matrix[0][0] / scaleX;
  const float m01 = _matrix[1][0] / scaleY;
  const float m02 = _matrix[2][0] / scaleZ;
  const float m10 = _matrix[0][1] / scaleX;
  const float m11 = _matrix[1][1] / scaleY;
  const float m12 = _matrix[2][1] / scaleZ;
  const float m20 = _matrix[0][2] / scaleX;
  const float m21 = _matrix[1][2] / scaleY;
  const float m22 = _matrix[2][2] / scaleZ;

  const float trace = m00 + m11 + m22;
  float x = 0;
  float y = 0;
  float z = 0;
  float w = 1;

  if (trace > 0) {
    const float s = std::sqrt(trace + 1.0f) * 2.0f;
    w = 0.25f * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const float s = std::sqrt(1.0f + m00 - m11 - m22) * 2.0f;
    w = (m21 - m12) / s;
    x = 0.25f * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const float s = std::sqrt(1.0f + m11 - m00 - m22) * 2.0f;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25f * s;
    z = (m12 + m21) / s;
  } else {
    const float s = std::sqrt(1.0f + m22 - m00 - m11) * 2.0f;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25f * s;
  }

  const float length = std::sqrt(x * x + y * y + z * z + w * w);
  if (length == 0) {
    return {0, 0, 0, 1};
  }

  return {x / length, y / length, z / length, w / length};
}
} // namespace margelo
