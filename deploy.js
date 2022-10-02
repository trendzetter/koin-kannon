import fs from 'fs';
import Pact from 'pact-lang-api';
import { sendCrossChain } from './sendCrossChain.js';
import { creationTime, getBalance, askQuestion } from './util.js';


const State = {};
State.NETWORK_ID = 'testnet04';
State.HOST = 'https://api.testnet.chainweb.com';
State.gasPrice = 0.00000001;
State.transferGas = 2500;
State.KEY_PAIR = {
  publicKey: 'd4949666c8687feca6c88b4055f574be21d4f5ca76e08af47a1eb17a3c9a2f11',
  secretKey: '61c3dad3807c22d610f0b42de06e8768dce4df2dfef0005c8a731bfbd8709276'
};
State.BALANCE = [];
const kAccount = `k:${State.KEY_PAIR.publicKey}`;
let funded = [];

const choices = ["Distribute gas from 1 chain to 20", "Deploy contract to 20 chains"];
const menuName = "Menu";
const answers = await askQuestion(choices, menuName);
switch(answers[menuName]){
  case choices[0]:
    console.log('Distribute gas!');
    await distributeGas();
    break;
  case choices[1]:
    console.log('doploy all chains!');
    deployAllChains();
    break;
  default:
    console.log('answers:' +JSON.stringify(answers));
}


async function distributeGas(){
  let chainCounter = 0;
  while(chainCounter<20 && typeof State.fundsChain === 'undefined') {
    const balance = await getBalance(State, chainCounter.toString());
    console.log('balance: ' + JSON.stringify(balance));
    if(balance.result.status === 'success') {
      console.log(`balance on chain ${chainCounter}: ${balance.result.data}`);
      if(balance.result.data>1) {
  
        State.fundsChain = chainCounter;
        balance = balance.result.data;
      }
    }
    chainCounter++;
  }
  if(typeof State.fundsChain === 'undefined'){
    console.log('no funds found for account ' + kAccount);
  }else{
    console.log(`Funds found on chain${State.fundsChain}`);
  }
  
  const toDistribute = balance - (19 * State.gasPrice * State.transferGas);
  const sendAmount = +((toDistribute/20).toFixed(8));
  for(let i=0;i<20;i++) {
    if(i !== State.fundsChain){
      sendCrossChain(State, kAccount, kAccount, State.fundsChain.toString(),i.toString(), sendAmount, completedCrosschain);
    }
  }  
}

async function deployAllChains(){
  const codeFile = './token.pact';
  const promises = [];
  for(let i = 0; i<20;i++) {
   const promiseDeployRequest = deployContract(codeFile, i);
    promises[i] = promiseDeployRequest;
    promises[i].then(async (response) => {
      console.log('response' + JSON.stringify(response));
      const API_HOST = `${State.HOST}/chainweb/0.0/${State.NETWORK_ID}/chain/${i}/pact`; 
      console.log('Listening..');
      const txResult = await Pact.fetch.listen({ listen: response.requestKeys[0] }, API_HOST);
      console.log('txResult' + JSON.stringify(txResult));
    })
  }
}


function deployContract(codeFile, chain) {
  const pactCode = fs.readFileSync(codeFile, 'utf8');
  console.log('pactCode:' + pactCode);
  const API_HOST = `${State.HOST}/chainweb/0.0/${State.NETWORK_ID}/chain/${chain}/pact`;
  const cmd = {
    networkId: State.NETWORK_ID,
    keyPairs: State.KEY_PAIR,
    pactCode: pactCode,
    envData: {
      'ks': [State.KEY_PAIR['publicKey']]
    },
    meta: {
      creationTime: creationTime(),
      ttl: 600,
      gasLimit: 100000,
      chainId: chain.toString(),
      gasPrice: 0.00000011,
      sender: kAccount
    }
  };

  const response = Pact.fetch.send(cmd, API_HOST);
  console.log('RESPONSE'+ response);
  return response;
};

function completedCrosschain(chain){
  funded[chain] = true;
  let counter = 0;
  while(counter < 20 && (funded[counter] === true || counter == State.fundsChain ) ) {
    counter++;
  }
  if(counter === 20) {
    console.log('distributing gas to 20 chains completed');
  } else {
    console.log('waiting for other chains')
  }
}


