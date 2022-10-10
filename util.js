import Pact from 'pact-lang-api';
import inquirer from 'inquirer';
import input from '@inquirer/input';

export async function readKeyset(State){
  let name;
  let keyset = false;
  while(keyset === false && (typeof name === 'undefined' || name !== '') ){
    name = await input({ message: 'Enter the keyset name including namespace (eg free.fake-steak-admin) or leave empty to cancel: ' });
    if(name !== '') keyset = await checkIfKeysetExists(State, name, true);
  }
  if(name !== '') {
    State.keysetName = name;
    State.keysetValue = keyset;
  }
  console.log('State:' + JSON.stringify(State));
}

async function removeKey(State){
  const menuName = "Select the key to remove: ";
  const answer = await askQuestion(State.keys, menuName);
  let counter = 0;
  while(counter < State.keys.length && State.keys[counter] !== answer[menuName]){
    counter++;
  }
  if(State.keys[counter] === answer[menuName]){
    State.keys.splice(counter, 1);
  }
}



async function addKey(State){
  let answer = await input({ message: 'Enter the public key to add or leave empty to cancel: ' });
  const regex = /\b[0-9a-f]{64}\b/;
  
  let matches = answer.match(regex);
  while( ( typeof matches === 'undefined' || matches === null ) && ( typeof answer === 'undefined' || answer !== '' ) ){
    answer = await input({ message: 'Invalid public key! Enter the public key to add or leave empty to cancel: ' });
    let matches = answer.match(regex);
  }
  if(answer != '') {
    State.keys[State.keys.length] = answer;
  }
  console.log('current keys:' + JSON.stringify(State.keys));
}

export async function askPublicKeys(State) {
  const choices = ['Show current keys', 'Add key', 'Remove key', 'Next'];
  const menuName = "Keyset:";
  let answers = await askQuestion(choices, menuName);
  while(true){
    switch (answers[menuName]) {
      case choices[0]:
        console.log('keys: ' + JSON.stringify(State.keys));
        break;
      case choices[1]:
        await addKey(State);
        break;
      case choices[2]:
        await removeKey(State);
        break;
      default:
        return State.keys;
    }
    answers = await askQuestion(choices, menuName);
  }
}

export function createCmd(State, code, chain, data) {
  let envData;
  if(typeof data !== 'undefined') {
    envData = {
      'ks': {
        "pred": "free.fake-steak-preds.keys-majority",
        "keys": [
          State.KEY_PAIR['publicKey'],
          "5ce5ab944f35357f98d81cab6920428c5e19c3cb2aed01390ef34b1441227b3e",
          "5451bbe91c1d26089c95f90e7b352a02a8299bdb3fb6e33a95bc12d8429345ee"
        ]
      }
    }
  } else {
    envData = data;
  }

  return {
    networkId: State.NETWORK_ID,
    keyPairs: State.KEY_PAIR,
    pactCode: code,
    envData: {
      'ks': {
        "pred": "free.fake-steak-preds.keys-majority",
        "keys": [
          State.KEY_PAIR['publicKey'],
          "5ce5ab944f35357f98d81cab6920428c5e19c3cb2aed01390ef34b1441227b3e",
          "5451bbe91c1d26089c95f90e7b352a02a8299bdb3fb6e33a95bc12d8429345ee"
        ]
      }
    },
    meta: {
      creationTime: creationTime(),
      ttl: 600,
      gasLimit: 70000,
      chainId: chain.toString(),
      gasPrice: 0.00000011,
      sender: `k:${State.KEY_PAIR.publicKey}`
    }
  };
}

export async function checkIfKeysetExists(State, name, allChains = false){
  const promises = [];
  for (let i = 0; i < 20; i++) {
    const API_HOST = `${State.HOST}/chainweb/0.0/${State.NETWORK_ID}/chain/${i}/pact`;
    const cmd = createCmd(State, `(describe-keyset "${name}")`, i);
    promises[i] = Pact.fetch.local(cmd, API_HOST);
    promises[i];
  }
  return await Promise.all(promises).then((values) => {
    let returnVal;
    values.forEach(testLocal => {
      if (testLocal.result.status == 'success' && !allChains ) {
         return testLocal.result.data;
      }
      if (testLocal.result.status == 'success' && allChains && (typeof returnVal === 'undefined' || returnVal)){
        returnVal = testLocal.result.data;
      }

      if(testLocal.result.status == 'failure' && allChains) {
        returnVal = false;
      };
    });
    return returnVal;
  });
}

export async function askQuestion(choices, menuName) {
  return await inquirer
    .prompt([
      {
        type: "list",
        name: menuName,
        message: menuName,
        choices: choices
      }
    ])
    .then((answers) => {
      return answers;
    });
}

export function creationTime() {
  return Math.round((new Date).getTime() / 1000) - 15;
}

export function sleep(ms) {
  console.log(`sleeping ${ms}ms`);
  return new Promise(resolve => setTimeout(resolve, ms));
}


export function mkReq(cmd) {
  return {
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
    body: JSON.stringify(cmd),
  };
}

export function makeRawRequestInit(stringBody) {
  return {
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
    body: stringBody,
  };
}

export async function getBalance(State, chain) {
  const account = `k:${State.KEY_PAIR.publicKey}`;
  const API_HOST = `${State.HOST}/chainweb/0.0/${State.NETWORK_ID}/chain/${chain}/pact`;
  const cmd = {
    networkId: State.NETWORK_ID,
    keyPairs: State.KEY_PAIR,
    pactCode: `(coin.get-balance "${account}")`,
    envData: {},
    meta: {
      creationTime: creationTime(),
      ttl: 600,
      gasLimit: 600,
      chainId: chain,
      gasPrice: State.gasPrice,
      sender: account
    }
  };

  const result = await Pact.fetch.local(cmd, API_HOST);

  return result;
}
