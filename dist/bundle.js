/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/index.js":
/*!**********************!*\
  !*** ./src/index.js ***!
  \**********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"sayHello\": () => (/* binding */ sayHello),\n/* harmony export */   \"updateMembersDOM\": () => (/* binding */ updateMembersDOM)\n/* harmony export */ });\n// PS! Replace this with your own channel ID\n// If you use this channel ID your app will stop working in the future\nconst CLIENT_ID = 'ZXmRILOrqI9SyoJq';\n\nconst drone = new ScaleDrone('ZXmRILOrqI9SyoJq', {\n  data: { // Will be sent out as clientData via events\n    name: getRandomName(),\n    color: getRandomColor(),\n  },\n});\n\nlet members = [];\n\ndrone.on('open', error => {\n  if (error) {\n    return console.error(error);\n  }\n  console.log('Successfully connected to Scaledrone');\n\n  const room = drone.subscribe('observable-room');\n  room.on('open', error => {\n    if (error) {\n      return console.error(error);\n    }\n    console.log('Successfully joined room');\n  });\n\n  room.on('members', m => {\n    members = m;\n    updateMembersDOM();\n  });\n\n  room.on('member_join', member => {\n    members.push(member);\n    updateMembersDOM();\n  });\n\n  room.on('member_leave', ({id}) => {\n    const index = members.findIndex(member => member.id === id);\n    members.splice(index, 1);\n    updateMembersDOM();\n  });\n\n  room.on('data', (text, member) => {\n    if (member) {\n      addMessageToListDOM(text, member);\n    } else {\n      // Message is from server\n    }\n  });\n});\n\ndrone.on('close', event => {\n  console.log('Connection was closed', event);\n});\n\ndrone.on('error', error => {\n  console.error(error);\n});\n\nfunction getRandomName() {\n  const adjs = [\"autumn\", \"hidden\", \"bitter\", \"misty\", \"silent\", \"empty\", \"dry\", \"dark\", \"summer\", \"icy\", \"delicate\", \"quiet\", \"white\", \"cool\", \"spring\", \"winter\", \"patient\", \"twilight\", \"dawn\", \"crimson\", \"wispy\", \"weathered\", \"blue\", \"billowing\", \"broken\", \"cold\", \"damp\", \"falling\", \"frosty\", \"green\", \"long\", \"late\", \"lingering\", \"bold\", \"little\", \"morning\", \"muddy\", \"old\", \"red\", \"rough\", \"still\", \"small\", \"sparkling\", \"throbbing\", \"shy\", \"wandering\", \"withered\", \"wild\", \"black\", \"young\", \"holy\", \"solitary\", \"fragrant\", \"aged\", \"snowy\", \"proud\", \"floral\", \"restless\", \"divine\", \"polished\", \"ancient\", \"purple\", \"lively\", \"nameless\"];\n  const nouns = [\"waterfall\", \"river\", \"breeze\", \"moon\", \"rain\", \"wind\", \"sea\", \"morning\", \"snow\", \"lake\", \"sunset\", \"pine\", \"shadow\", \"leaf\", \"dawn\", \"glitter\", \"forest\", \"hill\", \"cloud\", \"meadow\", \"sun\", \"glade\", \"bird\", \"brook\", \"butterfly\", \"bush\", \"dew\", \"dust\", \"field\", \"fire\", \"flower\", \"firefly\", \"feather\", \"grass\", \"haze\", \"mountain\", \"night\", \"pond\", \"darkness\", \"snowflake\", \"silence\", \"sound\", \"sky\", \"shape\", \"surf\", \"thunder\", \"violet\", \"water\", \"wildflower\", \"wave\", \"water\", \"resonance\", \"sun\", \"wood\", \"dream\", \"cherry\", \"tree\", \"fog\", \"frost\", \"voice\", \"paper\", \"frog\", \"smoke\", \"star\"];\n  return (\n    adjs[Math.floor(Math.random() * adjs.length)] +\n    \"_\" +\n    nouns[Math.floor(Math.random() * nouns.length)]\n  );\n}\n\nfunction getRandomColor() {\n  return '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16);\n}\n\n//------------- DOM STUFF\n\nconst DOM = {\n  membersCount: document.querySelector('.members-count'),\n  membersList: document.querySelector('.members-list'),\n  messages: document.querySelector('.messages'),\n  message: document.querySelector('.message'),\n  input: document.querySelector('.message-form__input'),\n  form: document.querySelector('.message-form'),\n  msgLeft: document.querySelector('.msg left'),\n  msgRight: document.querySelector('.msg right'),\n};\n\nDOM.form.addEventListener('submit', sendMessage);\n\nfunction sendMessage() {\n  const value = DOM.input.value;\n  if (value === '') {\n    return;\n  }\n  DOM.input.value = '';\n  drone.publish({\n    room: 'observable-room',\n    message: value,\n  });\n}\n\n\n\n\nfunction updateMembersDOM() {\n  DOM.membersCount.innerText = `${members.length} users in room:`;\n  DOM.membersList.innerHTML = '';\n  members.forEach(member =>\n    DOM.membersList.appendChild(createMemberElement(member))\n  );\n}\n\n\nfunction createMemberElement(member) {\n  const { name, color } = member.clientData;\n  const el = document.createElement('div');\n  el.appendChild(document.createTextNode(name));\n  el.className = 'member';\n  el.style.color = color;\n  return el;\n}\n\n\n\nfunction createMessageElement(text, member) {\n  const el = document.createElement('div');\n  el.appendChild(createMemberElement(member));\n  el.appendChild(document.createTextNode(text));\n  if (drone.clientId === member.id) {\n    el.className = 'message msg right';\n  } else {\n    el.className = 'message msg left';\n  }\n  return el;\n}\n\nfunction addMessageToListDOM(text, member) {\n  const el = DOM.messages;\n  const wasTop = el.scrollTop === el.scrollHeight - el.clientHeight;\n  el.appendChild(createMessageElement(text, member));\n  if (wasTop) {\n    el.scrollTop = el.scrollHeight - el.clientHeight;\n  }\n}\n\n\n\n\n\n// index.js\n\nfunction sayHello() {\n  console.log(\"Hello, world!\");\n}\n\n\n//# sourceURL=webpack:///./src/index.js?");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The require scope
/******/ 	var __webpack_require__ = {};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = {};
/******/ 	__webpack_modules__["./src/index.js"](0, __webpack_exports__, __webpack_require__);
/******/ 	
/******/ })()
;