import { cameraBypassAvailable } from './camera-bypass-policy';

/** Compile-time Vite guard: production can never enable the camera bypass. */
export const CAMERA_BYPASS_ENABLED =
  import.meta.env.DEV === true &&
  cameraBypassAvailable(true, import.meta.env.VITE_ENABLE_CAMERA_BYPASS);
