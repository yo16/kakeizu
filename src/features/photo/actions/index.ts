/**
 * Photo Server Actions バレルエクスポート
 */

export { getPhotos } from './get-photos';
export type { PhotoSummary } from './get-photos';

export { registerPhotoAfterUpload } from './create-photo';
export { updatePhotoMeta } from './update-photo';
export { deletePhoto } from './delete-photo';
export { linkPersonToPhoto } from './link-person-to-photo';
export { unlinkPersonFromPhoto } from './unlink-person-from-photo';

// スキーマ
export {
  registerPhotoAfterUploadSchema,
  updatePhotoMetaSchema,
  deletePhotoSchema,
  getPhotosSchema,
  signedUploadRequestSchema,
  linkPersonToPhotoSchema,
  unlinkPersonFromPhotoSchema,
} from '../schemas';
export type {
  RegisterPhotoAfterUploadInput,
  UpdatePhotoMetaInput,
  DeletePhotoInput,
  GetPhotosInput,
  SignedUploadRequest,
  LinkPersonToPhotoInput,
  UnlinkPersonFromPhotoInput,
} from '../schemas';
