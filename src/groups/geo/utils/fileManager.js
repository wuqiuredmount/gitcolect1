// src/groups/geo/utils/fileManager.js

/**
 * 将图片文件转换为 Base64
 */
export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
};

/**
 * 解析项目 JSON 字符串（.freemap 文件）
 */
export const parseProject = (fileContent) => {
  try {
    const data = JSON.parse(fileContent);
    if (!data.baseImage && !data.annotations) {
      throw new Error('格式错误');
    }
    return data;
  } catch (e) {
    throw new Error('文件解析失败，请确认是否是有效的项目文件');
  }
};