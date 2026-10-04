export function cameraBypassAvailable(isDevelopment: boolean, flag: string | undefined): boolean {
  return isDevelopment === true && flag === 'true';
}
