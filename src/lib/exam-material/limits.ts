export const MIN_MATERIAL_QUESTIONS = 1;
export const MAX_MATERIAL_QUESTIONS = 50;
export function validMaterialCount(count: number) {
  return Number.isInteger(count) && count >= MIN_MATERIAL_QUESTIONS && count <= MAX_MATERIAL_QUESTIONS;
}
