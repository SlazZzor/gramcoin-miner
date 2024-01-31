import { TonClient, WalletContractV4, internal } from "ton";
import { Cell, } from "ton-core";
import { mnemonicToPrivateKey } from "ton-crypto";
import { readFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from "util";
import dotenv from 'dotenv';

dotenv.config();

const MY_ADDRESS = process.env.MY_ADDRESS!
const MNEMONIC = (process.env.MNEMONIC!).split(' ');
const DELAY = (process.env.DELAY as unknown as number);

const execAsync = promisify(exec);

const client = new TonClient({
  endpoint: 'https://toncenter.com/api/v2/jsonRPC',
  apiKey: process.env.TONCENTER_API_KEY
});

async function getParams(address: string) {
  const res = await fetch(
    `https://tonapi.io/v2/blockchain/accounts/${address}/methods/get_pow_params`,
    {
      headers: {
        accept: "application/json",
        Authorization: "Bearer " + process.env.TONCONSOLE_BEARER,
      },
    }
  );

  return (await res.json()).stack;
}


function parseParams(params: any[]) {
  let paramsString = ''
  for (let i = 0; i < params.length - 1; i++) {
    if (params[i].type == 'num') {
      paramsString += BigInt(params[i].num).toString() + ' '
    }
  }

  return paramsString
}

async function runCommandAndHandleResult(): Promise<void> {
  try {
    const MINTER_ADDRESSES = [
      "EQCfwe95AJDfKuAoP1fBtu-un1yE7Mov-9BXaFM3lrJZwqg_",
      "EQBoATvbIa9vA7y8EUQE4tlsrrt0EhSUK4mndp49V0z7Me3M",
      "EQAV3tsPXau3VJanBw4KCFaMk3l_n3sX8NHZNgICFrR-9EGE",
      "EQAR9DvLZMHo9FAVMHI1vHvL7Fi7jWgjKtUARZ2S_nopQRYz",
      "EQC10L__G2SeEeM2Lw9osGyYxhoIPqJwE-8Pe7728JcmnJzW",
      "EQDZJFkh12kw-zLGqKSGVDf1V2PRzedGZDFDcFml5_0QerST",
      "EQCiLN0gEiZqthGy-dKl4pi4kqWJWjRzR3Jv4jmPOtQHveDN",
      "EQDB8Mo9EviBkg_BxfNv6C2LO_foJRXcgEF41pmQvMvnB9Jn",
      "EQAidDzp6v4oe-vKFWvsV8MQzY-4VaeUFnGM3ImrKIJUIid9",
      "EQAFaPmLLhXveHcw3AYIGDlHbGAbfQWlH45WGf4K4D6DNZxY"
    ];
    const MINTER_ADDRESS = MINTER_ADDRESSES[Math.floor(Math.random()*MINTER_ADDRESSES.length)];
    const params = parseParams(await getParams(MINTER_ADDRESS));
    const command = `../crypto/pow-miner -vv -w1 -t10 ${MY_ADDRESS} ${params} ${MINTER_ADDRESS} mined.boc`;

    console.log("[Starting mining]")
    const { stdout, stderr } = await execAsync(command, { timeout: 1000 * 1000 }); // 100 seconds timeout

    if (stderr && !stderr.includes("bytes of serialized external message into file `mined.boc`")) {
      console.log("[Error in command]")
      throw new Error(`Error in command execution: ${stderr}`);
    }

    const buffer = readFileSync('./mined.boc');
    const cell = Cell.fromBoc(buffer)[0].asSlice().loadRef()

    let keyPair = await mnemonicToPrivateKey(MNEMONIC);
    let wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
    let contract = client.open(wallet);

    console.log(contract.address.toString({ urlSafe: true, bounceable: false }))
    let seqno: number = await contract.getSeqno();
    let transfer = contract.createTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [internal({
        value: '0.05',
        to: MINTER_ADDRESS,
        body: cell
      })]
    });

    console.log("[Sending transaction]")
    contract.send(transfer)

  } catch (error) {
    console.log(error)
  }
}

async function main() {
  while (true) {
    await new Promise(r => setTimeout(r, DELAY));
    await runCommandAndHandleResult();
  }
}

(async () => {
  await main();
})();
