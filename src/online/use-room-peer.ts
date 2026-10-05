import { useEffect, useState } from 'react';
import type { OnlineEvent, OnlineSignalEvent } from './online-events';
import { WEBRTC_ICE_SERVERS } from './webrtc-config';

type PeerState = 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'failed';

export function useRoomPeer({
  enabled,
  signalingConnected,
  localStream,
  localPlayerSlot,
  currentUserId,
  sendEvent,
  subscribeEvent,
}: {
  enabled: boolean;
  signalingConnected: boolean;
  localStream: MediaStream | null;
  localPlayerSlot?: 1 | 2;
  currentUserId: string;
  sendEvent: (event: OnlineEvent) => Promise<void>;
  subscribeEvent: (listener: (event: OnlineEvent) => void) => () => void;
}) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<PeerState>('disabled');

  useEffect(() => {
    if (
      !enabled ||
      !signalingConnected ||
      !localStream ||
      !localPlayerSlot ||
      typeof RTCPeerConnection === 'undefined'
    ) {
      setRemoteStream(null);
      setState('disabled');
      return;
    }

    let peer: RTCPeerConnection | null = null;
    let disposed = false;
    let offerStarted = false;
    let lastOfferAt = 0;
    const pendingCandidates: RTCIceCandidateInit[] = [];
    const remoteSlot: 1 | 2 = localPlayerSlot === 1 ? 2 : 1;
    const send = (event: OnlineEvent) => {
      if (!disposed)
        void sendEvent(event).catch(() => {
          if (!disposed) setState('failed');
        });
    };
    const announce = (reply = false) =>
      send({
        kind: 'media-ready',
        senderUserId: currentUserId,
        playerSlot: localPlayerSlot,
        reply,
      });

    const signal = (payload: Omit<OnlineSignalEvent, 'kind' | 'senderUserId' | 'playerSlot'>) =>
      send({
        kind: 'webrtc-signal',
        senderUserId: currentUserId,
        playerSlot: localPlayerSlot,
        ...payload,
      });

    const ensurePeer = () => {
      if (peer) return peer;
      peer = new RTCPeerConnection({ iceServers: WEBRTC_ICE_SERVERS });
      for (const track of localStream.getTracks()) peer.addTrack(track, localStream);
      peer.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        if (!disposed) setRemoteStream(stream);
      };
      peer.onicecandidate = ({ candidate }) => {
        if (candidate) signal({ targetSlot: remoteSlot, candidate: candidate.toJSON() });
      };
      peer.onconnectionstatechange = () => {
        if (disposed || !peer) return;
        const next = peer.connectionState;
        setState(
          next === 'connected'
            ? 'connected'
            : next === 'failed'
              ? 'failed'
              : next === 'disconnected' || next === 'closed'
                ? 'disconnected'
                : 'connecting',
        );
      };
      setState('connecting');
      return peer;
    };

    const flushCandidates = async () => {
      if (!peer?.remoteDescription) return;
      while (pendingCandidates.length) await peer.addIceCandidate(pendingCandidates.shift()!);
    };

    const startOffer = async () => {
      if (localPlayerSlot !== 1 || offerStarted || disposed) return;
      offerStarted = true;
      lastOfferAt = Date.now();
      const connection = ensurePeer();
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      signal({ targetSlot: remoteSlot, description: offer });
    };

    const restartConnection = () => {
      if (disposed) return;
      announce();
      if (peer && localPlayerSlot === 1) {
        peer.restartIce();
        offerStarted = false;
        void startOffer().catch(() => {
          if (!disposed) setState('failed');
        });
      }
    };

    const handleSignal = async (event: OnlineSignalEvent) => {
      const connection = ensurePeer();
      if (event.description) {
        await connection.setRemoteDescription(event.description);
        await flushCandidates();
        if (event.description.type === 'offer') {
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          signal({ targetSlot: remoteSlot, description: answer });
        }
      } else if (event.candidate) {
        if (connection.remoteDescription) await connection.addIceCandidate(event.candidate);
        else pendingCandidates.push(event.candidate);
      }
    };

    const unsubscribe = subscribeEvent((event) => {
      if (event.playerSlot === localPlayerSlot) return;
      if (event.kind === 'media-ready') {
        if (!event.reply) announce(true);
        // A guest returning after a reload has a new RTCPeerConnection.
        if (
          !event.reply &&
          peer &&
          ['connected', 'failed', 'disconnected'].includes(peer.connectionState)
        ) {
          peer.restartIce();
          offerStarted = false;
        }
        void startOffer().catch(() => setState('failed'));
      } else if (event.kind === 'webrtc-signal' && event.targetSlot === localPlayerSlot) {
        void handleSignal(event).catch(() => setState('failed'));
      }
    });

    announce();
    const retryTimer = window.setInterval(() => {
      if (disposed || peer?.connectionState === 'connected') return;
      announce();
      if (peer && localPlayerSlot === 1 && Date.now() - lastOfferAt >= 6000) {
        peer.restartIce();
        offerStarted = false;
        void startOffer().catch(() => {
          if (!disposed) setState('failed');
        });
      }
    }, 3000);
    window.addEventListener('online', restartConnection);
    return () => {
      disposed = true;
      window.clearInterval(retryTimer);
      unsubscribe();
      window.removeEventListener('online', restartConnection);
      peer?.close();
      setRemoteStream(null);
      setState('disabled');
    };
  }, [
    currentUserId,
    enabled,
    signalingConnected,
    localPlayerSlot,
    localStream,
    sendEvent,
    subscribeEvent,
  ]);

  return { remoteStream, state };
}
