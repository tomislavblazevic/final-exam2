
import {
  initWebRTC,
  extendRoomWithWebRTC,
  handleOffer,
  handleAnswer,
  handleCandidate
} from './webrtc.js';

const CLIENT_ID = 'ZXmRILOrqI9SyoJq';

const drone = new ScaleDrone('ZXmRILOrqI9SyoJq', {
  data: {
    name: getRandomName(),
    color: getRandomColor(),
  },
});

let members = [];
// Make members globally accessible for WebRTC module
window.members = members;

drone.on('open', error => {
  if (error) {
    return console.error(error);
  }
  console.log('Successfully connected to Scaledrone');

  const room = drone.subscribe('observable-room');
  
  // Extend room with WebRTC signaling methods
  extendRoomWithWebRTC(room);
  
  // Initialize WebRTC with drone and room
  initWebRTC(drone, room);
  
  room.on('open', error => {
    if (error) {
      return console.error(error);
    }
    console.log('Successfully joined room');
  });

  room.on('members', m => {
    members = m;
    window.members = members;
    updateMembersDOM();
  });

  room.on('member_join', member => {
    members.push(member);
    window.members = members;
    updateMembersDOM();
  });

  room.on('member_leave', ({ id }) => {
    const index = members.findIndex(member => member.id === id);
    members.splice(index, 1);
    window.members = members;
    updateMembersDOM();
  });

  room.on('data', (data, member) => {
    if (member) {
      // Handle WebRTC signaling messages
      if (typeof data === 'object' && data.type) {
        console.log('WebRTC message:', data.type, 'from', member.clientData.name);
        switch (data.type) {
          case 'webrtc-offer':
            if (data.to === drone.clientId) {
              handleOffer(member.id, data.offer, member.clientData);
            }
            break;
          case 'webrtc-answer':
            if (data.to === drone.clientId) {
              handleAnswer(member.id, data.answer);
            }
            break;
          case 'webrtc-candidate':
            if (data.to === drone.clientId) {
              handleCandidate(member.id, data.candidate);
            }
            break;
          default:
            // Regular text message
            addMessageToListDOM(data, member);
        }
      } else {
        // Regular text message
        addMessageToListDOM(data, member);
      }
    }
  });
});

drone.on('close', event => {
  console.log('Connection was closed', event);
});

drone.on('error', error => {
  console.error(error);
});

function getRandomName() {
  const adjs = ["autumn", "hidden", "bitter", "misty", "silent", "empty", "dry", "dark", "summer", "icy", "delicate", "quiet", "white", "cool", "spring", "winter", "patient", "twilight", "dawn", "crimson", "wispy", "weathered", "blue", "billowing", "broken", "cold", "damp", "falling", "frosty", "green", "long", "late", "lingering", "bold", "little", "morning", "muddy", "old", "red", "rough", "still", "small", "sparkling", "throbbing", "shy", "wandering", "withered", "wild", "black", "young", "holy", "solitary", "fragrant", "aged", "snowy", "proud", "floral", "restless", "divine", "polished", "ancient", "purple", "lively", "nameless"];
  const nouns = ["waterfall", "river", "breeze", "moon", "rain", "wind", "sea", "morning", "snow", "lake", "sunset", "pine", "shadow", "leaf", "dawn", "glitter", "forest", "hill", "cloud", "meadow", "sun", "glade", "bird", "brook", "butterfly", "bush", "dew", "dust", "field", "fire", "flower", "firefly", "feather", "grass", "haze", "mountain", "night", "pond", "darkness", "snowflake", "silence", "sound", "sky", "shape", "surf", "thunder", "violet", "water", "wildflower", "wave", "water", "resonance", "sun", "wood", "dream", "cherry", "tree", "fog", "frost", "voice", "paper", "frog", "smoke", "star"];
  return (
    adjs[Math.floor(Math.random() * adjs.length)] +
    "_" +
    nouns[Math.floor(Math.random() * nouns.length)]
  );
}

function getRandomColor() {
  return '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16);
}

const DOM = {
  membersCount: document.querySelector('.members-count'),
  membersList: document.querySelector('.members-list'),
  messages: document.querySelector('.messages'),
  message: document.querySelector('.message'),
  input: document.querySelector('.message-form__input'),
  form: document.querySelector('.message-form'),
  msgLeft: document.querySelector('.msg left'),
  msgRight: document.querySelector('.msg right'),
};

DOM.form.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage();
});

function sendMessage() {
  const value = DOM.input.value.trim();
  if (value === '') {
    return;
  }
  DOM.input.value = '';
  drone.publish({
    room: 'observable-room',
    message: value,
  });
}

export function updateMembersDOM() {
  DOM.membersCount.innerText = `${members.length}`;
  DOM.membersList.innerHTML = '';
  members.forEach(member =>
    DOM.membersList.appendChild(createMemberElement(member))
  );
}

function createMemberElement(member) {
  const { name, color } = member.clientData;
  const el = document.createElement('div');
  el.appendChild(document.createTextNode(name));
  el.className = 'member';
  el.style.color = color;
  el.style.borderColor = color;
  return el;
}

function createMessageElement(text, member) {
  const container = document.createElement('div');
  
  const nameEl = document.createElement('div');
  const { name, color } = member.clientData;
  nameEl.textContent = name;
  nameEl.style.color = color;
  nameEl.style.fontSize = '0.8rem';
  nameEl.style.fontWeight = 'bold';
  nameEl.style.marginBottom = '2px';
  
  const textEl = document.createElement('div');
  textEl.textContent = text;
  
  container.appendChild(nameEl);
  container.appendChild(textEl);
  
  if (drone.clientId === member.id) {
    container.className = 'message right';
  } else {
    container.className = 'message left';
  }
  
  return container;
}

function addMessageToListDOM(text, member) {
  const el = DOM.messages;
  const wasAtBottom = el.scrollTop >= el.scrollHeight - el.clientHeight - 20;
  el.appendChild(createMessageElement(text, member));
  if (wasAtBottom) {
    setTimeout(() => {
      el.scrollTop = el.scrollHeight;
    }, 0);
  }
}
