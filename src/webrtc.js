// WebRTC Audio-Video Module
// Handles peer-to-peer audio-video connections using Scaledrone for signaling

let localStream = null;
let peers = new Map(); // Map of memberId -> { connection, remoteStream, localStream }
let currentRoom = null;
let currentDrone = null;
let currentRoomName = '';
let iceCandidateQueue = new Map(); // Map of memberId -> [candidate]

// File transfer state
let fileTransferCallbacks = {
  onStart: null,
  onProgress: null,
  onReceived: null,
  onSent: null
};
export function setFileTransferCallbacks(callbacks) {
  fileTransferCallbacks = { ...fileTransferCallbacks, ...callbacks };
}
const fileReceiveState = new Map(); // memberId -> { fileName, fileType, fileSize, chunks: [], receivedSize: 0 }
let isSendingFile = false;

let configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
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
function enableFullscreen(videoElement) {
  videoElement.addEventListener('dblclick', async () => {
    try {
      if (!document.fullscreenElement) {
        await videoElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  });
}


export async function startMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { width: { ideal: 320 }, height: { ideal: 240 } }
    });
  } catch (error) {
    console.warn('Initial getUserMedia failed, trying fallback constraints for Safari:', error);
    try {
      // Fallback for Safari which sometimes rejects ideal constraints
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });
    } catch (fallbackError) {
      console.error('Error accessing media:', fallbackError);
      return null;
    }
  }

  try {
    // Expose globally so index.js member_join guard can check it
    window.localStream = localStream;

    const videoElement = document.getElementById('local-video');
    videoElement.srcObject = localStream;
    enableFullscreen(videoElement);
    
    // Reflect actual track state on buttons immediately after media starts
    updateMediaButtonStates();
    return localStream;
  } catch (error) {
    console.error('Error setting up media stream:', error);
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

export function startCall(members, isAuto = false) {
  if (!localStream && !isAuto) {
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

export function getActivePeerCount() {
  return peers.size;
}

export function endCall() {
  // Close all peer connections and notify peers
  peers.forEach((peerData, memberId) => {
    if (currentDrone) {
      currentDrone.publish({
        room: currentRoomName,
        message: {
          type: 'webrtc-end',
          to: memberId,
          from: currentDrone.clientId
        }
      });
    }
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
  } else {
    peerConnection.addTransceiver('audio', { direction: 'recvonly' });
    peerConnection.addTransceiver('video', { direction: 'recvonly' });
  }
  
  // Create data channel for file transfer
  let dataChannel;
  if (createOffer) {
    dataChannel = peerConnection.createDataChannel('fileTransfer');
    dataChannel.binaryType = 'arraybuffer';
    setupDataChannel(dataChannel, member.id);
  }

  peerConnection.ondatachannel = (event) => {
    const channel = event.channel;
    channel.binaryType = 'arraybuffer';
    const peerData = peers.get(member.id);
    if (peerData) {
      peerData.dataChannel = channel;
    }
    setupDataChannel(channel, member.id);
  };
  
  // Handle remote stream
  Element = document.createElement('div');
  remoteVideoElement.id = `remote-video-${member.id}`;
  remoteVideoElement.className = 'remote-video-wrapper';
  
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsinline = true;
  
  enableFullscreen(video);
  
  const label = document.createElement('div');
  label.className = 'remote-video-label';
  label.textContent = member.clientData.name;
  
  remoteVideoElement.appendChild(video);
  remoteVideoElement.appendChild(label);
  function enableFullscreen(element) {
  element.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await element.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  });
}

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
    // 'disconnected' is often a temporary state on mobile networks (e.g. 4G jitter).
    // Only permanently close the video/connection on 'failed' or 'closed'.
    if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'closed') {
      closePeerConnection(member.id);
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
    localStream: localStream,
    dataChannel: dataChannel
  });
}

export function handleOffer(memberId, offer, memberData) {
  let peerConnection = peers.get(memberId)?.connection;
  
  if (peerConnection) {
    if (peerConnection.signalingState !== 'stable') {
      if (currentDrone && currentDrone.clientId < memberId) {
        console.log('Glare detected. Ignoring incoming offer from', memberId);
        return;
      }
    }
    console.log('Resetting connection for new offer from', memberId);
    closePeerConnection(memberId);
    peerConnection = null;
  }

  if (!peerConnection) {
    // Create connection but do NOT create an offer (we are the answerer)
    const member = { id: memberId, clientData: memberData };
    createPeerConnection(member, false);
    peerConnection = peers.get(memberId)?.connection;
  }
  
  const targetMemberId = memberId;
  const targetConnection = peerConnection;

  targetConnection.setRemoteDescription(new RTCSessionDescription(offer))
    .then(() => {
      // Flush any ICE candidates that arrived before the remote description was set
      flushIceCandidateQueue(targetMemberId, targetConnection);
      return targetConnection.createAnswer();
    })
    .then(answer => targetConnection.setLocalDescription(answer))
    .then(() => {
      currentRoom.sendAnswer(targetMemberId, targetConnection.localDescription);
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

export function closePeerConnection(memberId) {
  const peerData = peers.get(memberId);
  if (peerData && peerData.connection) {
    peerData.connection.close();
  }
  closeRemoteVideo(memberId);
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

function setupDataChannel(channel, memberId) {
  channel.onopen = () => console.log('Data channel open for', memberId);
  channel.onclose = () => console.log('Data channel closed for', memberId);

  channel.onmessage = (event) => {
    if (typeof event.data === 'string') {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'file-start') {
          fileReceiveState.set(memberId, {
            fileName: data.fileName,
            fileType: data.fileType,
            fileSize: data.fileSize,
            chunks: [],
            receivedSize: 0
          });
          if (fileTransferCallbacks.onStart) {
            fileTransferCallbacks.onStart(memberId, data.fileName);
          }
        }
      } catch (e) {
        console.error('Error parsing data channel message', e);
      }
    } else if (event.data instanceof ArrayBuffer) {
      const state = fileReceiveState.get(memberId);
      if (state) {
        state.chunks.push(event.data);
        state.receivedSize += event.data.byteLength;
        
        if (fileTransferCallbacks.onProgress) {
          fileTransferCallbacks.onProgress(memberId, state.receivedSize / state.fileSize);
        }

        if (state.receivedSize >= state.fileSize) {
          const blob = new Blob(state.chunks, { type: state.fileType });
          const url = URL.createObjectURL(blob);
          if (fileTransferCallbacks.onReceived) {
            fileTransferCallbacks.onReceived(memberId, state.fileName, state.fileType, url);
          }
          fileReceiveState.delete(memberId);
        }
      }
    }
  };
}

export function broadcastFile(file) {
  if (isSendingFile) {
    alert("Already sending a file, please wait.");
    return;
  }
  
  const activeChannels = [];
  peers.forEach(peer => {
    if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
      activeChannels.push(peer.dataChannel);
    }
  });

  if (activeChannels.length === 0) {
    // Nobody to send to, just show local success
    if (fileTransferCallbacks.onSent) {
      fileTransferCallbacks.onSent(file.name, file.type, URL.createObjectURL(file));
    }
    return;
  }

  isSendingFile = true;
  if (fileTransferCallbacks.onStart) {
    fileTransferCallbacks.onStart('local', file.name);
  }

  const metadata = JSON.stringify({
    type: 'file-start',
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size
  });
  
  activeChannels.forEach(channel => channel.send(metadata));

  const CHUNK_SIZE = 16384;
  let offset = 0;
  const reader = new FileReader();

  function readNextChunk() {
    const slice = file.slice(offset, offset + CHUNK_SIZE);
    reader.readAsArrayBuffer(slice);
  }

  reader.onload = (e) => {
    const chunk = e.target.result;
    let bufferFull = false;

    activeChannels.forEach(channel => {
      if (channel.readyState === 'open') {
        if (channel.bufferedAmount > 1024 * 1024 * 5) { // 5MB limit
          bufferFull = true;
        }
      }
    });

    if (bufferFull) {
      // wait a bit for buffer to drain
      setTimeout(() => reader.onload(e), 50);
      return;
    }

    let hasError = false;
    activeChannels.forEach(channel => {
      if (channel.readyState === 'open') {
        try {
          channel.send(chunk);
        } catch (err) {
          console.error('Error sending chunk:', err);
          hasError = true;
        }
      }
    });

    if (hasError) {
      isSendingFile = false;
      alert("Error sending file over the network. Please try again or use a smaller file.");
      return;
    }

    offset += CHUNK_SIZE;
    if (offset < file.size) {
      readNextChunk();
    } else {
      isSendingFile = false;
      if (fileTransferCallbacks.onSent) {
        fileTransferCallbacks.onSent(file.name, file.type, URL.createObjectURL(file));
      }
    }
  };

  readNextChunk();
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
