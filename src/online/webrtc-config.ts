function parseIceServers(value: string | undefined): RTCIceServer[] {
  if (!value) return [{ urls: 'stun:stun.l.google.com:19302' }];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) throw new Error('ICE server config must be an array.');
    return parsed.filter(
      (entry): entry is RTCIceServer =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        'urls' in entry &&
        (typeof entry.urls === 'string' || Array.isArray(entry.urls)),
    );
  } catch (error) {
    console.warn('VITE_WEBRTC_ICE_SERVERS is invalid; using the default STUN server.', error);
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
}

export const WEBRTC_ICE_SERVERS = parseIceServers(import.meta.env.VITE_WEBRTC_ICE_SERVERS);

export async function createPeerMediaStream(cameraStream: MediaStream): Promise<{
  stream: MediaStream;
  stopAudio: () => void;
  hasAudio: boolean;
}> {
  const stream = new MediaStream(cameraStream.getVideoTracks());
  let audioStream: MediaStream | null = null;
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    for (const track of audioStream.getAudioTracks()) stream.addTrack(track);
  } catch (error) {
    console.warn('Microphone is unavailable; continuing with peer video only.', error);
  }
  return {
    stream,
    hasAudio: stream.getAudioTracks().length > 0,
    stopAudio: () => audioStream?.getTracks().forEach((track) => track.stop()),
  };
}
