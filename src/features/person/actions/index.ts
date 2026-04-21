/**
 * Person Server Actions バレルエクスポート
 */

// 既存（RelationDialog 用軽量版。変更不可）
export { getPersonsByTree } from './get-persons-by-tree';
export type { PersonSummary } from './get-persons-by-tree';

// 新規追加
export { createPerson } from './create-person';
export { updatePerson } from './update-person';
export { deletePerson } from './delete-person';
export { setPrimaryPhoto } from './set-primary-photo';
export { getPerson } from './get-person';
export type { Person } from './get-person';
export { listPersons } from './list-persons';

// スキーマ
export {
  createPersonSchema,
  updatePersonSchema,
  deletePersonSchema,
  setPrimaryPhotoSchema,
  getPersonSchema,
  listPersonsSchema,
} from '../schemas';
export type {
  CreatePersonInput,
  UpdatePersonInput,
  DeletePersonInput,
  SetPrimaryPhotoInput,
  GetPersonInput,
  ListPersonsInput,
} from '../schemas';
