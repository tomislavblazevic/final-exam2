// WebRTC Audio-Video Module
// Handles peer-to-peer audio-video connections using Scaledrone for signaling

let localStream = null;
let peers = new Map(); // Map of memberId -> { connection, remoteStream, localStream }
let currentRoom = null;
let currentDrone = null;
let currentRoomName = '';
let iceCandidateQueue = new Map(); // Map of memberId -> [candidate]
let configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject"
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject"
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject"
    }
  ]
};

export function initWebRTC(drone, room, roomName) {
  currentDrone = drone;
  currentRoom = room;
  currentRoomName = roomName;

  // Define custom signaling methods on the currentRoom object
  currentRoom.sendOffer = function(memberId, offer) {
    currentDrone.publish({
      room: currentRoomName,
      message: {
        type: 'webrtc-offer',
        to: memberId,
        offer: offer,
        from: currentDrone.clientId
      }
    });
  };

  currentRoom.sendAnswer = function(memberId, answer) {
    currentDrone.publish({
      room: currentRoomName,
      message: {
        type: 'webrtc-answer',
        to: memberId,
        answer: answer,
        from: currentDrone.clientId
      }
    });
  };

  currentRoom.sendCandidates = function(memberId, candidate) {
    currentDrone.publish({
      room: currentRoomName,
      message: {
        type: 'webrtc-candidate',
        to: memberId,
        candidate: candidate,
        from: currentDrone.clientId
      }
    });
  };

  setupEventListeners();
}

export async function startMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { width: { ideal: 320 }, height: { ideal: 240 } }
    });
    
    // Expose globally so index.js member_join guard can check it
    window.localStream = localStream;

    const videoElement = document.getElementById('local-video');
    videoElement.srcObject = localStream;
    
    // Reflect actual track state on buttons immediately after media starts
    updateMediaButtonStates();
    return localStream;
  } catch (error) {
    console.error('Error accessing media:', error);
    // Don't alert — caller handles the failure gracefully
    return null;
  }
}

export async function stopMedia() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
    window.localStream = null;
    document.getElementById('local-video').srcObject = null;
    updateMediaButtonStates();
  }
}

export function toggleCamera() {
  if (!localStream) {
    startMedia();
    return;
  }
  
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    updateMediaButtonStates();
  }
}

export function toggleMicrophone() {
  if (!localStream) {
    startMedia();
    return;
  }
  
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    updateMediaButtonStates();
  }
}

export function startCall(members) {
  if (!localStream) {
    alert('Please enable camera/microphone first');
    return;
  }
  
  // Create peer connections for all members in the room
  members.forEach(member => {
    if (member.id !== currentDrone.clientId && !peers.has(member.id)) {
      createPeerConnection(member);
    }
  });
  
  updateCallButtonStates(true);
}

export function endCall() {
  // Close all peer connections
  peers.forEach((peerData) => {
    if (peerData.connection) {
      peerData.connection.close();
    }
  });
  peers.clear();
  // Clear stale queued ICE candidates so they don't pollute the next call
  iceCandidateQueue.clear();
  clearRemoteVideos();
  updateCallButtonStates(false);
}

function createPeerConnection(member, createOffer = true) {
  console.log('Creating peer connection for:', member.clientData.name);
  
  const peerConnection = new RTCPeerConnection(configuration);
  
  // Add local stream tracks
  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }
  
  // Handle remote stream
  const remoteVideoElement = document.createElement('div');
  remoteVideoElement.id = `remote-video-${member.id}`;
  remoteVideoElement.className = 'remote-video-wrapper';
  
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsinline = true;
  
  const label = document.createElement('div');
  label.className = 'remote-video-label';
  label.textContent = member.clientData.name;
  
  remoteVideoElement.appendChild(video);
  remoteVideoElement.appendChild(label);
  document.getElementById('remote-videos').appendChild(remoteVideoElement);
  
  peerConnection.ontrack = (event) => {
    console.log('Received remote stream from:', member.clientData.name);
    if (!video.srcObject) {
      video.srcObject = event.streams[0];
      
      // Attempt to play explicitly to handle browser autoplay policies
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn('Autoplay prevented by browser:', error);
          label.textContent = member.clientData.name + ' (Tap to play)';
          label.style.background = 'rgba(255, 67, 54, 0.9)';
          
          const unlockMedia = () => {
            video.play().then(() => {
              label.textContent = member.clientData.name;
              label.style.background = 'rgba(0,0,0,0.7)';
            }).catch(e => console.error('Play failed after interaction:', e));
            document.removeEventListener('click', unlockMedia);
            document.removeEventListener('touchstart', unlockMedia);
          };
          
          document.addEventListener('click', unlockMedia);
          document.addEventListener('touchstart', unlockMedia);
        });
      }
    }
  };
  
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      currentRoom.sendCandidates(member.id, event.candidate);
    }
  };
  
  peerConnection.onconnectionstatechange = () => {
    console.log('Connection state:', peerConnection.connectionState);
    if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
      closeRemoteVideo(member.id);
    }
  };
  
  // Create and send offer only if this side should initiate
  if (createOffer) {
    peerConnection.createOffer()
      .then(offer => peerConnection.setLocalDescription(offer))
      .then(() => {
        currentRoom.sendOffer(member.id, peerConnection.localDescription);
      })
      .catch(error => console.error('Error creating offer:', error));
  }
  
  peers.set(member.id, {
    connection: peerConnection,
    remoteStream: null,
    localStream: localStream
  });
}

export function handleOffer(memberId, offer, memberData) {
  let peerConnection = peers.get(memberId)?.connection;
  
  if (!peerConnection) {
    // Create connection but do NOT create an offer (we are the answerer)
    const member = { id: memberId, clientData: memberData };
    createPeerConnection(member, false);
    peerConnection = peers.get(memberId)?.connection;
  }
  
  const targetMemberId = memberId;
  const targetConnection = peerConnection;

  targetConnection.setRemoteDescription(new RTCSessionDescription(offer))
    .then(() => targetConnection.createAnswer())
    .then(answer => targetConnection.setLocalDescription(answer))
    .then(() => {
      currentRoom.sendAnswer(targetMemberId, targetConnection.localDescription);
      // Flush any ICE candidates that arrived before the remote description was set
      flushIceCandidateQueue(targetMemberId, targetConnection);
    })
    .catch(error => console.error('Error handling offer:', error));
}

export function handleAnswer(memberId, answer) {
  const peerConnection = peers.get(memberId)?.connection;
  if (peerConnection) {
    peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
      .then(() => {
        // Flush any ICE candidates that arrived before the remote description was set
        flushIceCandidateQueue(memberId, peerConnection);
      })
      .catch(error => console.error('Error handling answer:', error));
  }
}

export function handleCandidate(memberId, candidate) {
  const peerConnection = peers.get(memberId)?.connection;
  if (!peerConnection) return;

  if (!peerConnection.remoteDescription) {
    // Remote description not set yet — queue the candidate
    if (!iceCandidateQueue.has(memberId)) {
      iceCandidateQueue.set(memberId, []);
    }
    iceCandidateQueue.get(memberId).push(candidate);
  } else {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      .catch(error => console.error('Error adding ICE candidate:', error));
  }
}

function flushIceCandidateQueue(memberId, peerConnection) {
  const queued = iceCandidateQueue.get(memberId) || [];
  if (queued.length > 0) {
    console.log(`Flushing ${queued.length} queued ICE candidate(s) for`, memberId);
    queued.forEach(candidate => {
      peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
        .catch(error => console.error('Error adding queued ICE candidate:', error));
    });
    iceCandidateQueue.delete(memberId);
  }
}

function closeRemoteVideo(memberId) {
  const videoElement = document.getElementById(`remote-video-${memberId}`);
  if (videoElement) {
    videoElement.remove();
  }
  peers.delete(memberId);
  iceCandidateQueue.delete(memberId);
}

function clearRemoteVideos() {
  const container = document.getElementById('remote-videos');
  container.innerHTML = '';
}

function updateMediaButtonStates() {
  const cameraBtn = document.getElementById('toggle-camera');
  const micBtn = document.getElementById('toggle-microphone');
  
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    const audioTrack = localStream.getAudioTracks()[0];
    
    cameraBtn.textContent = (videoTrack?.enabled ? '📷' : '📷‍❌') + ' ' + (videoTrack?.enabled ? 'Camera On' : 'Camera Off');
    micBtn.textContent = (audioTrack?.enabled ? '🎤' : '🔇') + ' ' + (audioTrack?.enabled ? 'Unmute' : 'Mute');
    cameraBtn.style.background = videoTrack?.enabled ? '#4CAF50' : '#ff6b6b';
    micBtn.style.background = audioTrack?.enabled ? '#2196F3' : '#ff6b6b';
  }
}

export function updateCallButtonStates(inCall) {
  const callBtn = document.getElementById('call-button');
  const endBtn = document.getElementById('end-call-button');
  const status = document.getElementById('call-status');
  
  if (inCall) {
    callBtn.style.display = 'none';
    endBtn.style.display = 'inline-block';
    status.textContent = '🔴 In Call';
    status.style.color = '#4CAF50';
  } else {
    callBtn.style.display = 'inline-block';
    endBtn.style.display = 'none';
    status.textContent = '';
  }
}

function setupEventListeners() {
  const toggleCameraBtn = document.getElementById('toggle-camera');
  const toggleMicBtn = document.getElementById('toggle-microphone');
  const callBtn = document.getElementById('call-button');
  const endCallBtn = document.getElementById('end-call-button');
  
  toggleCameraBtn?.addEventListener('click', toggleCamera);
  toggleMicBtn?.addEventListener('click', toggleMicrophone);
  callBtn?.addEventListener('click', () => {
    const members = window.members || [];
    startCall(members);
  });
  endCallBtn?.addEventListener('click', endCall);
}

// Extension to ScaleDrone room for WebRTC signaling
export function extendRoomWithWebRTC(room) {
  room.sendOffer = function(memberId, offer) {
    this.sendMessage({
      type: 'webrtc-offer',
      to: memberId,
      offer: offer,
      from: currentDrone.clientId
    });
  };
  
  room.sendAnswer = function(memberId, answer) {
    this.sendMessage({
      type: 'webrtc-answer',
      to: memberId,
      answer: answer,
      from: currentDrone.clientId
    });
  };
  
  room.sendCandidates = function(memberId, candidate) {
    this.sendMessage({
      type: 'webrtc-candidate',
      to: memberId,
      candidate: candidate,
      from: currentDrone.clientId
    });
  };
}
