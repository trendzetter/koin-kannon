import fetch from 'node-fetch';
import Pact from 'pact-lang-api';
import { creationTime, makeRawRequestInit, mkReq, sleep } from "./util.js";

let NETWORK_ID, HOST, callback;

export async function sendCrossChain(State,sender, receiver, sourceChain, targetChainId, amount, cb) {
  NETWORK_ID = State.NETWORK_ID;
  const KEY_PAIR = State.KEY_PAIR;
  HOST = State.HOST;
  callback = cb;
  
  const cmd = {
    networkId: NETWORK_ID,
    keyPairs: Object.assign(KEY_PAIR, {
      clist: [
        Pact.lang.mkCap(
          "GAS",
          "Capability to allow buying gas",
          "coin.GAS",
          []
        ).cap,
        Pact.lang.mkCap(
          "Transfer",
          "Capability to allow coin transfer",
          "coin.TRANSFER",
          [sender, receiver, { decimal: amount }]
        ).cap,
        Pact.lang.mkCap(
          "Xchain",
          "Capability to allow cross-chain",
          "coin.TRANSFER_XCHAIN",
          [sender, receiver, amount, targetChainId]
        ).cap
      ]
    }),
    pactCode: `(coin.transfer-crosschain "${sender}" "${receiver}" (read-keyset "ks") "${targetChainId}" (read-decimal "amount"))`,
    envData: {
      "amount": amount,
      "ks": { keys: [KEY_PAIR['publicKey']], pred: "keys-all" }
    },
    meta: {
      creationTime: creationTime(),
      ttl: 600,
      gasLimit: State.transferGas,
      chainId: sourceChain,
      gasPrice: State.gasPrice,
      sender: sender
    }
  };

  const API_HOST_SOURCE = `${HOST}/chainweb/0.0/${NETWORK_ID}/chain/${sourceChain}/pact`;

  const response = await Pact.fetch.send(cmd, API_HOST_SOURCE);
  console.log('RESPONSE', response);
  const requestKey = response.requestKeys[0];
  console.log('listening');
  const txResult = await Pact.fetch.listen({ listen: requestKey }, API_HOST_SOURCE);

  if(txResult.result.status === 'success'){
    console.log('step 1 completed for ' + targetChainId);
  } else{
    console.log(txResult);
  }

  let proof;

  while (typeof proof === 'undefined') {
    await sleep(30000);
    proof = await getProof(targetChainId, requestKey, API_HOST_SOURCE);
  }
  console.log('proof received for chain ' + targetChainId);

  //Send continuation
  sendContinuation(State, targetChainId, requestKey, proof, );
}

async function sendContinuation(State, targetChainId, requestKey, proof){
  const API_HOST_TARGET = `${HOST}/chainweb/0.0/${NETWORK_ID}/chain/${targetChainId}/pact`;
  const m = Pact.lang.mkMeta(
    "kadena-xchain-gas",
    targetChainId,
    State.gasPrice,
    750,
    creationTime(),
    600
  );
  const contCmd = {
    type: 'cont',
    keyPairs: [],
    pactId: requestKey,
    rollback: false,
    step: 1,
    meta: m,
    proof: proof,
    networkId: NETWORK_ID,
  };
  try {
    const c = Pact.simple.cont.createCommand(
      contCmd.keyPairs,
      contCmd.nonce,
      contCmd.step,
      contCmd.pactId,
      contCmd.rollback,
      contCmd.envData,
      contCmd.meta,
      contCmd.proof,
      contCmd.networkId
    );
    const testLocal = await fetch(
      `${API_HOST_TARGET}/api/v1/local`,
      makeRawRequestInit(JSON.stringify(c.cmds[0]))
    ).then(r => r.json());
    if (testLocal.result.status === 'failure' &&
      testLocal.result.error.message.includes('pact completed')) {
      console.log(testLocal.result.error.message);
      return;
    }
  } catch (e) {
    console.log(e);
    return;
  }
  try {
    const result = await sendNonJson(contCmd, API_HOST_TARGET);
    handleResult(result, targetChainId);
  } catch (e) {
    console.log(e);
  }
}

const handleResult = async function (res,targetChainId) {
  const foo = await res;
  if (foo.ok) {
    const j = await res.json();
    var reqKey = j.requestKeys[0];
   console.log('Step 2 pending...'+ reqKey);
    listen(reqKey,targetChainId);
  } else {
    t = await res.text();
    console.log('negative result: ' + t);
  }
};

async function listen(reqKey, targetChainId) {
  Pact.fetch
    .listen(
      { listen: reqKey },
      `${HOST}/chainweb/0.0/${NETWORK_ID}/chain/${targetChainId}/pact`,
    )
    .then(res => {
      //console.log(res);
      if (res.result.status === 'success') {
        console.log('crosschain succeeded on chain ' + targetChainId);
        callback(targetChainId);
      } else {
        console.log('TRANSFER FAILED with error');
        console.log(JSON.stringify(res.result.error.message));
      }
    });
}

 const sendNonJson = async function (cmd, apiHost) {
  var c;
  if (!apiHost) throw new Error(`Pact.fetch.send(): No apiHost provided`);
  c = Pact.simple.cont.createCommand(
    cmd.keyPairs,
    cmd.nonce,
    cmd.step,
    cmd.pactId,
    cmd.rollback,
    cmd.envData,
    cmd.meta,
    cmd.proof,
    cmd.networkId,
  );
  const txRes = await fetch(`${apiHost}/api/v1/send`, mkReq(c));
  return txRes;
};

 async function getProof(targetChainId, pactId, host) {
    const spvCmd = { targetChainId: targetChainId, requestKey: pactId };
    try {
      const res = await fetch(`${host}/spv`, mkReq(spvCmd));
      let foo = await res;
  
      if (foo.ok) {
        const proof = await res.json();
        return proof;
      } else {
        const proof = await res.text();
        //Initial Step is not confirmed yet.
        throw proof;
      }
    } catch (e) {
     console.log('error:' +e);
    }
  }
