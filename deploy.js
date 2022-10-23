import fs from 'fs';
import input from '@inquirer/input';
import Pact from 'pact-lang-api';
import { sendCrossChain } from './sendCrossChain.js';
import { creationTime, createCmd, getBalance, askQuestion, checkIfKeysetExists, askPublicKeys, readKeyset } from './util.js';


const State = {};
State.KEY_PAIR = {
  publicKey: 'd4949666c8687feca6c88b4055f574be21d4f5ca76e08af47a1eb17a3c9a2f11',
  secretKey: '61c3dad3807c22d610f0b42de06e8768dce4df2dfef0005c8a731bfbd8709276'
};
State.NETWORK_ID = 'testnet04';
State.HOST = 'https://api.testnet.chainweb.com';
State.gasPrice = 0.00000001;
State.transferGas = 2500;
State.codeFile = './pact/module.pact';
State.namespace = 'free';
State.defaultPred = `${State.namespace}.fake-steak-preds.keys-majority`;
State.keysetName;
State.keysetValue;
State.keys = [State.KEY_PAIR.publicKey];
State.BALANCE = [];
const kAccount = `k:${State.KEY_PAIR.publicKey}`;
let funded = [];

const choices = ["Distribute gas from 1 chain to 20", "Install keyset to 20 chains", "Deploy module to 20 chains", "create multisig upgrade"];
const menuName = "Select a task:";
const answers = await askQuestion(choices, menuName);
switch (answers[menuName]) {
  case choices[0]:
    distributeGas();
    break;
  case choices[1]:
    console.log('deploy keyset on all chains!');
    installKeysetAllChains();
    break;
  case choices[2]:
    deployModuleWizard();
    break;
  case choices[3]:
    console.log('multisig upgrade!');
    prepareMultisigUpgrade(['5ce5ab944f35357f98d81cab6920428c5e19c3cb2aed01390ef34b1441227b3e']);
    break;
  default:
    console.log('answers:' + JSON.stringify(answers));
}



async function installKeysetAllChains(){
  let name = false;
  while(!name){
    let answer = await input({ message: 'Enter the keyset name to create: ' });
    const exists = await checkIfKeysetExists(State, `${State.namespace}.${answer}`);
    console.log('exists on chain' + exists);
    if(exists === false){
      name = answer;
    }
  }
  
  const keys = await askPublicKeys(State);
  let pred = false;
  const choices = [`Default (${State.defaultPred})`, 'Custom'];
  const menuName = "Predicate for the keyset:";
  
  while(!pred){
    let answers = await askQuestion(choices, menuName);
    switch (answers[menuName]) {
      case choices[0]:
        pred = State.defaultPred;
        break;
      case choices[1]:
        console.log('no implemented');
        break;
      default:
        return;
    }
  }

  const data = {
    'ks': {
      "pred": pred,
      "keys": []
    }
  }
  keys.forEach(key => {
    data.ks.keys.push(key);
  });
  console.log('data:' + JSON.stringify(data));

  deployAllChains(`(namespace "${State.namespace}")(define-keyset "${State.namespace}.${name}" (read-keyset "ks"))`, data);

  State.keysetName = `${State.namespace}.${name}`;
  State.keysetValue = data.ks;
}

async function prepareMultisigUpgrade(signers) {
  const codeFile = './token.pact';
  const pactCode = fs.readFileSync(codeFile, 'utf8');
  const prep = Pact.api.prepareExecCmd([State.KEY_PAIR, {publicKey: '5ce5ab944f35357f98d81cab6920428c5e19c3cb2aed01390ef34b1441227b3e'}], 'mulitsig'+creationTime(), pactCode,
    {
      'ks': {
        "pred": "free.fake-steak-preds.keys-majority",
        "keys": [
          State.KEY_PAIR['publicKey'],
          "5ce5ab944f35357f98d81cab6920428c5e19c3cb2aed01390ef34b1441227b3e",
          "5451bbe91c1d26089c95f90e7b352a02a8299bdb3fb6e33a95bc12d8429345ee"
        ]
      }
    },
    {
      creationTime: creationTime(),
      ttl: 28800,
      gasLimit: 70000,
      chainId: "1",
      gasPrice: 0.00000011,
      sender: kAccount
    }, State.NETWORK_ID);
    const senderSig = prep.sigs[0].sig;
    const sigBuilder = prep;
    const sigs = {};

    sigs[State.KEY_PAIR['publicKey']] = senderSig;
    console.log('senderSig:' + JSON.stringify(senderSig));
    signers.forEach(signer => {
      sigs[signer] = null;
    });

    console.log('sigs:' + JSON.stringify(sigs));

    sigBuilder.sigs = sigs;

    console.log('sigBuilder:' + JSON.stringify(sigBuilder));
}

async function distributeGas() {
  let chainCounter = 0;
  while (chainCounter < 20 && typeof State.fundsChain === 'undefined') {
    const balance = await getBalance(State, chainCounter.toString());
    if (balance.result.status === 'success') {
      console.log(`balance on chain ${chainCounter}: ${balance.result.data}`);
      if (balance.result.data > 1) {

        State.fundsChain = chainCounter;
        balance = balance.result.data;
      }
    }
    chainCounter++;
  }
  if (typeof State.fundsChain === 'undefined') {
    console.log('no funds found for account ' + kAccount);
  } else {
    console.log(`Funds found on chain${State.fundsChain}`);
  }

  const toDistribute = balance - (19 * State.gasPrice * State.transferGas);
  const sendAmount = +((toDistribute / 20).toFixed(8));
  for (let i = 0; i < 20; i++) {
    if (i !== State.fundsChain) {
      sendCrossChain(State, kAccount, kAccount, State.fundsChain.toString(), i.toString(), sendAmount);
    }
  }
}

async function deployModuleWizard(){
  let choices = [`Use current keyset (${State.keysetName})`, 'Read keyset', 'Create keyset'];
  const menuName = "Keyset to enforce GOVERNANCE:";
  
  let confirmed = false;
  while(typeof State.keysetName === 'undefined' || confirmed === false ){
    choices = [`Use current keyset (${State.keysetName})`, 'Read keyset', 'Create keyset'];
    let answers = await askQuestion(choices, menuName);
    switch (answers[menuName]) {
      case choices[0]:
        confirmed = true;
        break;
      case choices[1]:
        await readKeyset(State);
        await deployAllChains();
      default:
        return;
    }
  }
}


async function deployAllChains(code, data) {
  const codeFile = State.codeFile;
  let pactCode;
  
  if(typeof code !== 'undefined') {
    pactCode = code;
  } else {
    console.log('reading module from file');
    pactCode = fs.readFileSync(codeFile, 'utf8');
    pactCode = pactCode.replace('###KEYSET###', State.keysetName);
    pactCode = pactCode.replace('###NAMESPACE###', State.namespace);
  }



  const promises = [];
  let successful = true;
  const result = [];
  for (let i = 0; i < 20; i++) {
    const API_HOST = `${State.HOST}/chainweb/0.0/${State.NETWORK_ID}/chain/${i}/pact`;
    const cmd = createCmd(State, pactCode, i, data);
    const testLocal = await Pact.fetch.local(cmd, API_HOST);
    if (testLocal.result.status === 'failure') {
      console.log(`error on chain${i} ${testLocal.result.error.message}`);
      return;
    } else {
      const promiseDeployRequest = deployContract(pactCode, i, data);
      promises[i] = promiseDeployRequest;
      promises[i].then(async (response) => {
        console.log(`Listening chain${i} ..`);
        const txResult = await Pact.fetch.listen({ listen: response.requestKeys[0] }, API_HOST);
        console.log(`result chain${i}: ${JSON.stringify(txResult)}`);
        if(txResult.result && txResult.result.status === 'success') {
          result[i] = true;
        } else {
          result[i] = false;
        }
        if(result.length === 20 ) {
          let finished = true;
          let counter = 0;
          console.log('result' + JSON.stringify(result));
          while( finished && counter < 20) {
            if(typeof result[counter] === 'undefined'){
              finished = false;
            } else {
              if(!result[counter]) {
                successful = false;
              }
            }
            counter++;
          }
          if(finished){
            console.log('deploy success: ' + successful);
          }
        }
      });
    }
  }
  await Promise.all(promises).then(value => {
    return value;
  });
}



function deployContract(codeFile, chain) {
  const API_HOST = `${State.HOST}/chainweb/0.0/${State.NETWORK_ID}/chain/${chain}/pact`;
  const cmd = createCmd(State, codeFile, chain);
  const response = Pact.fetch.send(cmd, API_HOST);
  return response;
};


