import Pact from 'pact-lang-api';
import inquirer from 'inquirer';

export async function askQuestion(choices, menuName){
  return await inquirer
  .prompt([
    {
      type: "list",
      name: menuName,
      message: "Select a task",
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
